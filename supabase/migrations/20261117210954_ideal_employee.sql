-- Sanad S9: «الموظف المثالي» — ideal employee of the month (owner decisions 2026-11-17).
--
--  * ONE ideal employee per month for the whole company.
--  * Each department gets at most one nomination per month, written by its supervisor, with a written reason.
--    A department with no reachable supervisor (none, inactive, or no login): the system admin nominates
--    (the same fallback as the first approval in PRD 7.2). Nobody nominates themself.
--    Nominations are for the current Kuwait month and can be changed or withdrawn until the winner is approved.
--  * HR (or the system admin) sees every nomination of a month, picks one and approves it, with the public
--    reason (pre-filled from the nomination, HR may edit it) and an optional short citation.
--    Nobody approves their own nomination.
--  * On approval every active employee with an account gets a notification + push (kind 'ideal_employee')
--    through private.enqueue_notification (Phase 9). The send-push edge function is unchanged.
--  * Privacy: nominations are read only by HR, the system admin and the nominating supervisor.
--    Only the approved winner is public: name, job title / rank, department, reason, citation. No photo.
--    The winner row keeps a copy of those fields as they were that month, so later moves do not rewrite history.
--  * Never linked to the bonus, and no automatic ranking from attendance.
-- All writes go through the SECURITY DEFINER functions below; clients cannot write the tables directly.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
create table public.ideal_employee_nominations (
  id uuid primary key default gen_random_uuid(),
  -- First day of the month the nomination is for.
  month date not null check (month = date_trunc('month', month)::date),
  department_id uuid not null references public.departments (id) on delete cascade,
  nominee_id uuid not null references public.employees (id) on delete cascade,
  nominator_id uuid references public.employees (id) on delete set null,
  reason text not null check (char_length(btrim(reason)) between 10 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One nomination per department per month (= one per supervisor).
  constraint ideal_employee_nominations_one_per_department unique (month, department_id),
  constraint ideal_employee_nominations_not_self check (nominator_id is null or nominator_id <> nominee_id)
);
create index ideal_employee_nominations_department_id_idx on public.ideal_employee_nominations (department_id);
create index ideal_employee_nominations_nominee_id_idx on public.ideal_employee_nominations (nominee_id);
create index ideal_employee_nominations_nominator_id_idx on public.ideal_employee_nominations (nominator_id);

create table public.ideal_employee_winners (
  id uuid primary key default gen_random_uuid(),
  -- One winner per month.
  month date not null unique check (month = date_trunc('month', month)::date),
  nomination_id uuid unique references public.ideal_employee_nominations (id) on delete set null,
  employee_id uuid not null references public.employees (id) on delete cascade,
  -- Public card, copied at approval time.
  name_ar text not null,
  name_en text not null,
  job_title text,
  department_ar text,
  department_en text,
  reason text not null check (char_length(btrim(reason)) between 10 and 500),
  citation text check (citation is null or char_length(btrim(citation)) between 1 and 200),
  approved_by uuid references public.employees (id) on delete set null,
  approved_at timestamptz not null default now()
);
create index ideal_employee_winners_employee_id_idx on public.ideal_employee_winners (employee_id);
create index ideal_employee_winners_approved_by_idx on public.ideal_employee_winners (approved_by);

create trigger set_updated_at before update on public.ideal_employee_nominations
  for each row execute function private.set_updated_at();
create trigger audit after insert or update or delete on public.ideal_employee_nominations
  for each row execute function private.audit_row_change();
create trigger audit after insert or update or delete on public.ideal_employee_winners
  for each row execute function private.audit_row_change();

-- ---------------------------------------------------------------------------
-- 2. Row level security (4 roles)
--    employee   : reads winners only
--    supervisor : reads winners + the nominations they wrote
--    hr, admin  : read winners + every nomination
--    nobody writes directly (functions only)
-- ---------------------------------------------------------------------------
alter table public.ideal_employee_nominations enable row level security;
alter table public.ideal_employee_winners enable row level security;

create policy "hr and admin read all, nominator reads own" on public.ideal_employee_nominations
  for select to authenticated
  using (
    (select private.has_role(array['hr', 'admin']::public.app_role[]))
    or nominator_id = (select private.current_employee_id())
  );

create policy "active employees read winners" on public.ideal_employee_winners
  for select to authenticated
  using ((select private.current_employee_id()) is not null);

revoke all on public.ideal_employee_nominations, public.ideal_employee_winners from anon;
revoke insert, update, delete, truncate, trigger, references
  on public.ideal_employee_nominations, public.ideal_employee_winners from authenticated;
grant select on public.ideal_employee_nominations, public.ideal_employee_winners to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Rules
-- ---------------------------------------------------------------------------
-- The current month in Kuwait (first day).
create function private.ideal_current_month() returns date
language sql stable set search_path = '' as $$
  select date_trunc('month', private.kuwait_today())::date
$$;

-- Who nominates for a department: its supervisor when reachable (active, has a login); otherwise the system admin.
create function private.ideal_can_nominate(p_actor uuid, p_department uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_supervisor uuid;
begin
  if p_actor is null then return false; end if;
  select d.supervisor_id into v_supervisor from public.departments d where d.id = p_department;
  if not found then return false; end if;
  if v_supervisor is not null and exists (
    select 1 from public.employees s where s.id = v_supervisor and s.is_active and s.user_id is not null) then
    return p_actor = v_supervisor;
  end if;
  return exists (select 1 from public.employees a where a.id = p_actor and a.is_active and a.role = 'admin');
end;
$$;

-- Arabic month name + year, e.g. «نوفمبر 2026».
create function private.ideal_month_ar(p_month date) returns text
language sql immutable set search_path = '' as $$
  select (array['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'])
    [extract(month from p_month)::int] || ' ' || extract(year from p_month)::int
$$;

-- ---------------------------------------------------------------------------
-- 4. Supervisor side (mobile app)
-- ---------------------------------------------------------------------------
-- Departments I nominate for this month, with my current nomination if any, and whether the month is closed.
create function public.ideal_my_departments()
returns table (
  department_id uuid, department_ar text, department_en text, month date, month_closed boolean,
  nomination_id uuid, nominee_id uuid, nominee_file_number integer, nominee_name_ar text, nominee_name_en text,
  reason text, nominated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.name_ar, d.name_en, m.month,
    exists (select 1 from public.ideal_employee_winners w where w.month = m.month),
    n.id, n.nominee_id, e.file_number, e.full_name_ar, e.full_name_en, n.reason, n.updated_at
  from public.departments d
  cross join (select private.ideal_current_month() as month) m
  left join public.ideal_employee_nominations n on n.department_id = d.id and n.month = m.month
  left join public.employees e on e.id = n.nominee_id
  where private.ideal_can_nominate(private.current_employee_id(), d.id)
  order by d.name_ar
$$;

-- Who I can nominate in a department: its active employees, except me.
create function public.ideal_candidates(p_department uuid)
returns table (id uuid, file_number integer, name_ar text, name_en text, job_title text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_employee_id();
begin
  if not private.ideal_can_nominate(v_me, p_department) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return query
    select e.id, e.file_number, e.full_name_ar, e.full_name_en, e.job_title
    from public.employees e
    where e.department_id = p_department and e.is_active and e.id <> v_me
    order by e.full_name_ar;
end;
$$;

-- Nominate (or change my nomination) for this month. Returns the nomination id.
create function public.ideal_nominate(p_department uuid, p_nominee uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_employee_id();
  v_month date := private.ideal_current_month();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_id uuid;
begin
  if not private.ideal_can_nominate(v_me, p_department) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_nominee = v_me then raise exception 'cannot_nominate_self' using errcode = '22023'; end if;
  if not exists (select 1 from public.employees e
                 where e.id = p_nominee and e.department_id = p_department and e.is_active) then
    raise exception 'nominee_not_in_department' using errcode = '22023';
  end if;
  if char_length(v_reason) < 10 then raise exception 'reason_too_short' using errcode = '22023'; end if;
  if char_length(v_reason) > 500 then raise exception 'reason_too_long' using errcode = '22023'; end if;
  -- Lock the month so a nomination cannot slip in while HR approves.
  perform pg_advisory_xact_lock(hashtext('ideal_employee:' || v_month));
  if exists (select 1 from public.ideal_employee_winners w where w.month = v_month) then
    raise exception 'month_closed' using errcode = '22023';
  end if;
  insert into public.ideal_employee_nominations (month, department_id, nominee_id, nominator_id, reason)
  values (v_month, p_department, p_nominee, v_me, v_reason)
  on conflict (month, department_id) do update
    set nominee_id = excluded.nominee_id, nominator_id = excluded.nominator_id, reason = excluded.reason
  returning id into v_id;
  return v_id;
end;
$$;

-- Withdraw my nomination for this month (only while the month is open).
create function public.ideal_withdraw(p_department uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_employee_id();
  v_month date := private.ideal_current_month();
begin
  if not private.ideal_can_nominate(v_me, p_department) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('ideal_employee:' || v_month));
  if exists (select 1 from public.ideal_employee_winners w where w.month = v_month) then
    raise exception 'month_closed' using errcode = '22023';
  end if;
  delete from public.ideal_employee_nominations n where n.month = v_month and n.department_id = p_department;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. HR side (web panel)
-- ---------------------------------------------------------------------------
-- Nominations of a month: HR and admin see all; anyone else only the ones they wrote.
create function public.ideal_nominations(p_month date)
returns table (
  id uuid, month date, department_id uuid, department_ar text, department_en text,
  nominee_id uuid, nominee_file_number integer, nominee_name_ar text, nominee_name_en text, nominee_job_title text,
  nominator_id uuid, nominator_file_number integer, nominator_name_ar text, nominator_name_en text,
  reason text, created_at timestamptz, updated_at timestamptz, is_winner boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.month, n.department_id, d.name_ar, d.name_en,
    n.nominee_id, e.file_number, e.full_name_ar, e.full_name_en, e.job_title,
    n.nominator_id, s.file_number, s.full_name_ar, s.full_name_en,
    n.reason, n.created_at, n.updated_at,
    exists (select 1 from public.ideal_employee_winners w where w.nomination_id = n.id)
  from public.ideal_employee_nominations n
  join public.departments d on d.id = n.department_id
  join public.employees e on e.id = n.nominee_id
  left join public.employees s on s.id = n.nominator_id
  where n.month = date_trunc('month', p_month)::date
    and private.current_employee_id() is not null
    and (private.has_role(array['hr', 'admin']::public.app_role[]) or n.nominator_id = private.current_employee_id())
  order by d.name_ar
$$;

-- Approve one nomination as the month's ideal employee. Returns the winner id.
create function public.ideal_approve(p_nomination uuid, p_reason text default null, p_citation text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_employee_id();
  n public.ideal_employee_nominations%rowtype;
  e record;
  v_reason text;
  v_citation text := nullif(btrim(coalesce(p_citation, '')), '');
  v_id uuid;
  v_month_ar text;
  v_month_en text;
  r record;
begin
  if v_me is null or not private.has_role(array['hr', 'admin']::public.app_role[]) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into n from public.ideal_employee_nominations where id = p_nomination;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if n.nominee_id = v_me then raise exception 'cannot_approve_self' using errcode = '42501'; end if;
  if n.month > private.ideal_current_month() then raise exception 'month_in_future' using errcode = '22023'; end if;
  v_reason := btrim(coalesce(nullif(btrim(coalesce(p_reason, '')), ''), n.reason));
  if char_length(v_reason) < 10 then raise exception 'reason_too_short' using errcode = '22023'; end if;
  if char_length(v_reason) > 500 then raise exception 'reason_too_long' using errcode = '22023'; end if;
  if v_citation is not null and char_length(v_citation) > 200 then
    raise exception 'citation_too_long' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('ideal_employee:' || n.month));
  if exists (select 1 from public.ideal_employee_winners w where w.month = n.month) then
    raise exception 'already_decided' using errcode = '23505';
  end if;
  -- Re-read under the lock: the supervisor may have changed or withdrawn it a moment ago.
  select * into n from public.ideal_employee_nominations where id = p_nomination;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  select emp.full_name_ar, emp.full_name_en, emp.job_title, emp.is_active, d.name_ar as dep_ar, d.name_en as dep_en
    into e
  from public.employees emp
  left join public.departments d on d.id = n.department_id
  where emp.id = n.nominee_id;
  if not found or not e.is_active then raise exception 'nominee_inactive' using errcode = '22023'; end if;

  insert into public.ideal_employee_winners (
    month, nomination_id, employee_id, name_ar, name_en, job_title, department_ar, department_en,
    reason, citation, approved_by)
  values (n.month, n.id, n.nominee_id, e.full_name_ar, e.full_name_en, nullif(btrim(coalesce(e.job_title, '')), ''),
    e.dep_ar, e.dep_en, v_reason, v_citation, v_me)
  returning id into v_id;

  -- Tell everyone (one notification per employee; the same month never notifies twice).
  v_month_ar := private.ideal_month_ar(n.month);
  v_month_en := to_char(n.month, 'FMMonth YYYY');
  for r in select x.id from public.employees x where x.is_active and x.user_id is not null loop
    perform private.enqueue_notification(r.id, 'ideal_employee',
      jsonb_build_object(
        'month', to_char(n.month, 'YYYY-MM'),
        'title_ar', case when r.id = n.nominee_id then format('مبروك! أنت الموظف المثالي لشهر %s', v_month_ar)
                         else format('الموظف المثالي لشهر %s', v_month_ar) end,
        'title_en', case when r.id = n.nominee_id then format('Congratulations! You are the ideal employee of %s', v_month_en)
                         else format('Ideal employee of %s', v_month_en) end,
        'body_ar', concat_ws(' — ', e.full_name_ar, e.dep_ar),
        'body_en', concat_ws(' — ', e.full_name_en, e.dep_en)),
      'ideal_employee:' || to_char(n.month, 'YYYY-MM') || ':' || r.id);
  end loop;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Permissions
-- ---------------------------------------------------------------------------
revoke all on function private.ideal_current_month(), private.ideal_can_nominate(uuid, uuid), private.ideal_month_ar(date)
  from public, anon, authenticated;

revoke all on function public.ideal_my_departments(), public.ideal_candidates(uuid),
  public.ideal_nominate(uuid, uuid, text), public.ideal_withdraw(uuid), public.ideal_nominations(date),
  public.ideal_approve(uuid, text, text)
  from public, anon;
grant execute on function public.ideal_my_departments(), public.ideal_candidates(uuid),
  public.ideal_nominate(uuid, uuid, text), public.ideal_withdraw(uuid), public.ideal_nominations(date),
  public.ideal_approve(uuid, text, text)
  to authenticated;
