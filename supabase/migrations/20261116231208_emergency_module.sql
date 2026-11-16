-- Sanad — Phase 11: emergency evacuation (PRD 8).
--
-- Extends the core tables (emergencies, emergency_buildings, emergency_targets, emergency_responses).
-- Buildings are the existing public.buildings (per site: name, point, radius), managed by the admin
-- in Organisation > Sites.
--
-- Every write goes through SECURITY DEFINER functions with role checks; the direct insert / update
-- policies from Phase 1 are removed:
--   emergency_preview_targets  admin / supervisor  how many people a launch would alert
--   emergency_launch           admin / supervisor  creates the emergency, buildings and target snapshot, queues push
--   emergency_respond          the target employee, only while active; the server measures the distance
--                              to the safe building (PRD 8.6: accepted anywhere, flagged when outside)
--   emergency_board            admin / supervisor  counters + people lists for the live board and the report
--   emergency_close            admin / supervisor
--   emergency_resend_push      admin / supervisor  re-queues alerts that could not be queued (push_pending)
--   my_active_emergency        the signed-in employee: their own active emergency only
--
-- Privacy (PRD 8.6, 11): a location is stored only with a response, and a response is accepted only
-- while the emergency is active. Employees read their own emergency, targets and responses only while
-- it is active; staff read all.
--
-- Push (Phase 9): private.emergency_notify calls private.enqueue_notification(uuid, text, jsonb, text, text)
-- when it exists (dynamic EXECUTE, so this migration works before or after Phase 9). Until then each
-- target stays 'push_pending' and emergency_resend_push (or the next launch) queues it later.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table public.emergencies
  add column target_mode text check (target_mode in ('present', 'site', 'department')),
  add column target_departments uuid[] not null default '{}',
  add column is_drill boolean not null default false,
  add constraint emergencies_message_length check (char_length(message_ar) <= 500 and char_length(message_en) <= 500);

create unique index emergencies_one_active_per_site on public.emergencies (site_id) where status = 'active';

alter table public.emergency_targets
  add column push_status text not null default 'push_pending' check (push_status in ('push_pending', 'queued')),
  add column push_queued_at timestamptz;

alter table public.emergency_responses
  add column accuracy_m real check (accuracy_m >= 0),
  add column distance_m real check (distance_m >= 0),
  add column safe_radius_m integer,
  add constraint emergency_responses_location_pair check ((latitude is null) = (longitude is null)),
  add constraint emergency_responses_lat check (latitude between -90 and 90),
  add constraint emergency_responses_lng check (longitude between -180 and 180);

-- ---------------------------------------------------------------------------
-- RLS: reads narrowed, direct writes removed (functions only)
-- ---------------------------------------------------------------------------
drop policy "staff or targets read" on public.emergencies;
create policy "staff or active targets read" on public.emergencies
  for select to authenticated
  using ((select private.is_staff()) or (status = 'active' and (select private.is_emergency_target(id))));

drop policy "staff or targets read" on public.emergency_buildings;
create policy "staff or active targets read" on public.emergency_buildings
  for select to authenticated
  using (
    (select private.is_staff())
    or ((select private.is_emergency_target(emergency_id)) and (select private.is_emergency_active(emergency_id)))
  );

drop policy "read own or staff reads all" on public.emergency_targets;
create policy "own while active or staff reads all" on public.emergency_targets
  for select to authenticated
  using (
    (select private.is_staff())
    or (employee_id = (select private.current_employee_id()) and (select private.is_emergency_active(emergency_id)))
  );

drop policy "read own or staff reads all" on public.emergency_responses;
create policy "own while active or staff reads all" on public.emergency_responses
  for select to authenticated
  using (
    (select private.is_staff())
    or (employee_id = (select private.current_employee_id()) and (select private.is_emergency_active(emergency_id)))
  );

drop policy "admin and supervisors start" on public.emergencies;
drop policy "admin and supervisors update" on public.emergencies;
drop policy "admin and supervisors insert" on public.emergency_buildings;
drop policy "admin and supervisors insert" on public.emergency_targets;
drop policy "target responds while active" on public.emergency_responses;
drop policy "target changes response while active" on public.emergency_responses;

revoke insert, update, delete on public.emergencies, public.emergency_buildings,
  public.emergency_targets, public.emergency_responses from authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- Great-circle distance in metres (same formula as the punch geofence).
create function private.distance_m(p_lat1 double precision, p_lng1 double precision,
                                   p_lat2 double precision, p_lng2 double precision)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(p_lat2 - p_lat1) / 2), 2)
    + cos(radians(p_lat1)) * cos(radians(p_lat2)) * power(sin(radians(p_lng2 - p_lng1) / 2), 2)
  ))
$$;

create function private.can_run_emergency()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role(array['admin', 'supervisor']::public.app_role[])
$$;

-- Who a launch alerts (PRD 8.3):
--   present    : checked in at this site and not checked out yet (latest accepted punch in 72 h is a check-in here)
--   site       : every active employee enabled at this site
--   department : active employees of the chosen departments who are enabled at this site
create function private.emergency_target_ids(p_site uuid, p_mode text, p_departments uuid[])
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.id
  from public.employees e
  where e.is_active
    and case p_mode
      when 'present' then exists (
        select 1 from (
          select p.punch_type, p.site_id
          from public.attendance_punches p
          where p.employee_id = e.id and p.result = 'accepted' and p.punched_at > now() - interval '72 hours'
          order by p.punched_at desc
          limit 1
        ) last
        where last.punch_type = 'check_in' and last.site_id = p_site)
      when 'site' then exists (
        select 1 from public.employee_sites es where es.employee_id = e.id and es.site_id = p_site)
      when 'department' then e.department_id = any (coalesce(p_departments, '{}'))
        and exists (select 1 from public.employee_sites es where es.employee_id = e.id and es.site_id = p_site)
      else false
    end
$$;

-- Queues the push alert for every target not queued yet. Returns how many were queued now.
create function private.emergency_notify(p_emergency uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_em public.emergencies;
  v_site public.sites;
  v_data jsonb;
  v_count integer := 0;
  r record;
begin
  select * into v_em from public.emergencies where id = p_emergency;
  if not found or v_em.status <> 'active' then
    return 0;
  end if;
  -- Phase 9 not merged yet: leave every target as push_pending so it can be re-sent later.
  if to_regprocedure('private.enqueue_notification(uuid,text,jsonb,text,text)') is null then
    return 0;
  end if;
  select * into v_site from public.sites where id = v_em.site_id;
  v_data := jsonb_build_object(
    'type', 'emergency_alert',
    'emergency_id', v_em.id,
    'hazard', v_em.hazard,
    'site_ar', v_site.name_ar,
    'site_en', v_site.name_en,
    'message_ar', v_em.message_ar,
    'message_en', v_em.message_en,
    'is_drill', v_em.is_drill
  );
  for r in
    select t.employee_id from public.emergency_targets t
    where t.emergency_id = p_emergency and t.push_status = 'push_pending'
  loop
    execute 'select private.enqueue_notification($1, $2, $3, $4, $5)'
      using r.employee_id, 'emergency_alert', v_data, 'emergency:' || p_emergency || ':' || r.employee_id, 'high';
    update public.emergency_targets
      set push_status = 'queued', push_queued_at = now()
      where emergency_id = p_emergency and employee_id = r.employee_id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff: preview, launch, board, close, re-send
-- ---------------------------------------------------------------------------
create function public.emergency_preview_targets(p_site uuid, p_mode text, p_departments uuid[] default '{}')
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_run_emergency() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return (select count(*) from private.emergency_target_ids(p_site, p_mode, p_departments));
end;
$$;

create function public.emergency_launch(
  p_site uuid,
  p_hazard public.hazard_type,
  p_danger_buildings uuid[],
  p_safe_building uuid,
  p_mode text,
  p_departments uuid[] default '{}',
  p_message_ar text default null,
  p_message_en text default null,
  p_is_drill boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_employee_id();
  v_id uuid;
  v_targets integer;
  v_queued integer;
begin
  if v_me is null or not private.can_run_emergency() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.sites where id = p_site and is_active) then
    raise exception 'site_not_found' using errcode = '22023';
  end if;
  if p_hazard is null or p_mode is null or p_mode not in ('present', 'site', 'department') then
    raise exception 'invalid_request' using errcode = '22023';
  end if;
  if p_mode = 'department' and coalesce(cardinality(p_departments), 0) = 0 then
    raise exception 'departments_required' using errcode = '22023';
  end if;
  -- One or more danger buildings and one safe building, all in this site, the safe one not in danger.
  if p_safe_building is null or coalesce(cardinality(p_danger_buildings), 0) = 0
     or p_safe_building = any (p_danger_buildings)
     or (select count(*) from public.buildings b
         where b.site_id = p_site and (b.id = any (p_danger_buildings) or b.id = p_safe_building))
        <> cardinality(array(select distinct x from unnest(p_danger_buildings || p_safe_building) x)) then
    raise exception 'invalid_buildings' using errcode = '22023';
  end if;
  if char_length(coalesce(p_message_ar, '')) > 500 or char_length(coalesce(p_message_en, '')) > 500 then
    raise exception 'message_too_long' using errcode = '22023';
  end if;
  if exists (select 1 from public.emergencies where site_id = p_site and status = 'active') then
    raise exception 'already_active' using errcode = '23505';
  end if;

  insert into public.emergencies (site_id, hazard, message_ar, message_en, started_by, target_mode, target_departments, is_drill)
  values (p_site, p_hazard, nullif(btrim(p_message_ar), ''), nullif(btrim(p_message_en), ''), v_me, p_mode,
          case when p_mode = 'department' then p_departments else '{}' end, coalesce(p_is_drill, false))
  returning id into v_id;

  insert into public.emergency_buildings (emergency_id, building_id, kind)
  select v_id, d, 'danger'::public.emergency_building_kind from (select distinct unnest(p_danger_buildings) d) x
  union all
  select v_id, p_safe_building, 'safe';

  insert into public.emergency_targets (emergency_id, employee_id)
  select v_id, t from private.emergency_target_ids(p_site, p_mode, p_departments) t;
  get diagnostics v_targets = row_count;
  if v_targets = 0 then
    raise exception 'no_targets' using errcode = '22023';
  end if;

  v_queued := private.emergency_notify(v_id);

  insert into public.audit_log (actor_user_id, action, table_name, record_id, new_data)
  values (auth.uid(), 'emergency_launch', 'emergencies', v_id::text,
          jsonb_build_object('site_id', p_site, 'hazard', p_hazard, 'danger', p_danger_buildings, 'safe', p_safe_building,
                             'mode', p_mode, 'departments', p_departments, 'targets', v_targets, 'push_queued', v_queued,
                             'is_drill', coalesce(p_is_drill, false)));

  return jsonb_build_object('id', v_id, 'targets', v_targets, 'push_queued', v_queued);
end;
$$;

create function public.emergency_board(p_emergency uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_em public.emergencies;
  v_safe record;
begin
  if not private.can_run_emergency() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into v_em from public.emergencies where id = p_emergency;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select b.latitude, b.longitude, b.radius_m into v_safe
  from public.emergency_buildings eb join public.buildings b on b.id = eb.building_id
  where eb.emergency_id = p_emergency and eb.kind = 'safe' limit 1;

  return jsonb_build_object(
    'emergency', (
      select jsonb_build_object(
        'id', v_em.id, 'status', v_em.status, 'hazard', v_em.hazard, 'is_drill', v_em.is_drill,
        'message_ar', v_em.message_ar, 'message_en', v_em.message_en,
        'started_at', v_em.started_at, 'closed_at', v_em.closed_at, 'target_mode', v_em.target_mode,
        'site', jsonb_build_object('id', s.id, 'name_ar', s.name_ar, 'name_en', s.name_en,
                                   'lat', s.latitude, 'lng', s.longitude, 'radius', s.radius_m),
        'started_by', (select jsonb_build_object('file_number', e.file_number, 'name_ar', e.full_name_ar, 'name_en', e.full_name_en)
                       from public.employees e where e.id = v_em.started_by),
        'closed_by', (select jsonb_build_object('file_number', e.file_number, 'name_ar', e.full_name_ar, 'name_en', e.full_name_en)
                      from public.employees e where e.id = v_em.closed_by))
      from public.sites s where s.id = v_em.site_id),
    'buildings', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'kind', eb.kind, 'name_ar', b.name_ar, 'name_en', b.name_en,
                                          'lat', b.latitude, 'lng', b.longitude, 'radius', b.radius_m)
                       order by eb.kind, b.name_ar)
      from public.emergency_buildings eb join public.buildings b on b.id = eb.building_id
      where eb.emergency_id = p_emergency), '[]'::jsonb),
    'push', (select jsonb_build_object('queued', count(*) filter (where push_status = 'queued'),
                                       'pending', count(*) filter (where push_status = 'push_pending'))
             from public.emergency_targets where emergency_id = p_emergency),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
               'employee_id', e.id, 'file_number', e.file_number, 'name_ar', e.full_name_ar, 'name_en', e.full_name_en,
               'phone', e.phone, 'department_ar', d.name_ar, 'department_en', d.name_en,
               'status', coalesce(r.status::text, 'unknown'), 'responded_at', r.responded_at,
               'lat', r.latitude, 'lng', r.longitude, 'accuracy_m', r.accuracy_m, 'distance_m', r.distance_m,
               -- PRD 8.6: "arrived" pressed outside the safe building's radius is flagged for review.
               'outside_safe', coalesce(r.status = 'arrived' and r.distance_m > coalesce(r.safe_radius_m, v_safe.radius_m), false),
               'no_location', coalesce(r.status is not null and r.latitude is null, false))
             order by e.file_number)
      from public.emergency_targets t
      join public.employees e on e.id = t.employee_id
      left join public.departments d on d.id = e.department_id
      left join public.emergency_responses r on r.emergency_id = t.emergency_id and r.employee_id = t.employee_id
      where t.emergency_id = p_emergency), '[]'::jsonb)
  );
end;
$$;

create function public.emergency_close(p_emergency uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_employee_id();
  v_counts jsonb;
begin
  if v_me is null or not private.can_run_emergency() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.emergencies set status = 'closed', closed_at = now(), closed_by = v_me
  where id = p_emergency and status = 'active';
  if not found then
    raise exception 'not_active' using errcode = '22023';
  end if;
  select jsonb_build_object(
           'targets', count(*),
           'arrived', count(*) filter (where r.status = 'arrived'),
           'safe_elsewhere', count(*) filter (where r.status = 'safe_elsewhere'),
           'unknown', count(*) filter (where r.status is null))
    into v_counts
  from public.emergency_targets t
  left join public.emergency_responses r on r.emergency_id = t.emergency_id and r.employee_id = t.employee_id
  where t.emergency_id = p_emergency;
  insert into public.audit_log (actor_user_id, action, table_name, record_id, new_data)
  values (auth.uid(), 'emergency_close', 'emergencies', p_emergency::text, v_counts);
  return v_counts;
end;
$$;

create function public.emergency_resend_push(p_emergency uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_run_emergency() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return private.emergency_notify(p_emergency);
end;
$$;

-- ---------------------------------------------------------------------------
-- Employee: own active emergency, respond
-- ---------------------------------------------------------------------------
create function public.my_active_emergency()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_employee_id();
begin
  if v_me is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'id', em.id, 'hazard', em.hazard, 'is_drill', em.is_drill, 'started_at', em.started_at,
      'message_ar', em.message_ar, 'message_en', em.message_en,
      'site', jsonb_build_object('name_ar', s.name_ar, 'name_en', s.name_en, 'lat', s.latitude, 'lng', s.longitude),
      'buildings', (
        select jsonb_agg(jsonb_build_object('kind', eb.kind, 'name_ar', b.name_ar, 'name_en', b.name_en,
                                            'lat', b.latitude, 'lng', b.longitude, 'radius', b.radius_m)
                         order by eb.kind)
        from public.emergency_buildings eb join public.buildings b on b.id = eb.building_id
        where eb.emergency_id = em.id),
      'response', (
        select jsonb_build_object('status', r.status, 'responded_at', r.responded_at, 'distance_m', r.distance_m)
        from public.emergency_responses r where r.emergency_id = em.id and r.employee_id = v_me))
    from public.emergency_targets t
    join public.emergencies em on em.id = t.emergency_id
    join public.sites s on s.id = em.site_id
    where t.employee_id = v_me and em.status = 'active'
    order by em.started_at desc
    limit 1
  );
end;
$$;

-- "وصلت" (arrived) or "أنا بأمان" (safe elsewhere). The location is optional (permission refused or
-- no fix): the press still counts (PRD 8.6). It can be changed while the emergency is active.
create function public.emergency_respond(
  p_emergency uuid,
  p_status public.emergency_response_status,
  p_lat double precision default null,
  p_lng double precision default null,
  p_accuracy real default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_employee_id();
  v_safe record;
  v_distance double precision;
begin
  if v_me is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.emergency_targets where emergency_id = p_emergency and employee_id = v_me) then
    raise exception 'not_target' using errcode = '42501';
  end if;
  -- Lock the emergency row so a response cannot slip in while it is being closed.
  perform 1 from public.emergencies where id = p_emergency and status = 'active' for share;
  if not found then
    raise exception 'not_active' using errcode = '22023';
  end if;
  if p_status is null then
    raise exception 'invalid_request' using errcode = '22023';
  end if;
  if (p_lat is null) <> (p_lng is null) or p_lat not between -90 and 90 or p_lng not between -180 and 180
     or p_accuracy < 0 then
    raise exception 'invalid_location' using errcode = '22023';
  end if;

  select b.latitude, b.longitude, b.radius_m into v_safe
  from public.emergency_buildings eb join public.buildings b on b.id = eb.building_id
  where eb.emergency_id = p_emergency and eb.kind = 'safe' limit 1;
  if p_lat is not null and v_safe.latitude is not null then
    v_distance := private.distance_m(p_lat, p_lng, v_safe.latitude, v_safe.longitude);
  end if;

  insert into public.emergency_responses as r
    (emergency_id, employee_id, status, latitude, longitude, accuracy_m, distance_m, safe_radius_m, responded_at)
  values (p_emergency, v_me, p_status, p_lat, p_lng, p_accuracy, v_distance, v_safe.radius_m, now())
  on conflict (emergency_id, employee_id) do update
    set status = excluded.status, latitude = excluded.latitude, longitude = excluded.longitude,
        accuracy_m = excluded.accuracy_m, distance_m = excluded.distance_m,
        safe_radius_m = excluded.safe_radius_m, responded_at = excluded.responded_at;

  return jsonb_build_object(
    'status', p_status,
    'distance_m', round(v_distance::numeric, 1),
    'inside_safe', case when v_distance is null then null else v_distance <= v_safe.radius_m end);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function private.distance_m(double precision, double precision, double precision, double precision) from public, anon, authenticated;
revoke all on function private.can_run_emergency() from public, anon, authenticated;
revoke all on function private.emergency_target_ids(uuid, text, uuid[]) from public, anon, authenticated;
revoke all on function private.emergency_notify(uuid) from public, anon, authenticated;

revoke all on function public.emergency_preview_targets(uuid, text, uuid[]) from public, anon;
revoke all on function public.emergency_launch(uuid, public.hazard_type, uuid[], uuid, text, uuid[], text, text, boolean) from public, anon;
revoke all on function public.emergency_board(uuid) from public, anon;
revoke all on function public.emergency_close(uuid) from public, anon;
revoke all on function public.emergency_resend_push(uuid) from public, anon;
revoke all on function public.my_active_emergency() from public, anon;
revoke all on function public.emergency_respond(uuid, public.emergency_response_status, double precision, double precision, real) from public, anon;

grant execute on function public.emergency_preview_targets(uuid, text, uuid[]) to authenticated;
grant execute on function public.emergency_launch(uuid, public.hazard_type, uuid[], uuid, text, uuid[], text, text, boolean) to authenticated;
grant execute on function public.emergency_board(uuid) to authenticated;
grant execute on function public.emergency_close(uuid) to authenticated;
grant execute on function public.emergency_resend_push(uuid) to authenticated;
grant execute on function public.my_active_emergency() to authenticated;
grant execute on function public.emergency_respond(uuid, public.emergency_response_status, double precision, double precision, real) to authenticated;
