-- Sanad (PRD 1.9): leave requests from the phone + in-app notifications list.
--
-- Leave request: same approval path as Phase 8 (employee -> supervisor -> HR, nobody approves their own).
--   shift_date = first day, leave_to = last day. On the FINAL approval one row is added to public.leaves
--   (source 'طلب من التطبيق', created_by 'sanad-app'), so it counts in the bonus rules like any leave.
--   Rejected / cancelled requests write nothing. Coordinated with the bonus agents project:
--     * the final approval also writes an agent_log row (agent 'تطبيق سند') so the manager's history shows it;
--     * if the leave covers today, employment_status becomes 'في إجازة' (as the leaves agent does);
--     * a leave that falls in a period whose bonus list is already locked is refused (contact HR).
-- Notifications: read only, built from the employee's own rows. Push notifications stay in Phase 9.

alter table public.requests
  add column leave_type text check (leave_type in ('إجازة دورية', 'إجازة مرضية', 'إجازة طارئة', 'إجازة بدون راتب')),
  add column leave_to date;

alter table public.requests drop constraint requests_fields_check;
alter table public.requests add constraint requests_fields_check check (
  (request_type = 'punch_correction' and corrected_punch_type is not null and corrected_time is not null
     and mission_site_id is null and leave_type is null and leave_to is null)
  or
  (request_type = 'external_mission' and mission_site_id is not null and corrected_punch_type is null
     and corrected_time is null and leave_type is null and leave_to is null)
  or
  (request_type = 'leave' and leave_type is not null and leave_to is not null and leave_to >= shift_date
     and corrected_punch_type is null and corrected_time is null and mission_site_id is null)
);

-- ---------------------------------------------------------------------------
-- Submit a leave request (the signed-in employee only).
-- ---------------------------------------------------------------------------
create function public.submit_leave_request(p_leave_type text, p_from date, p_to date, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_employee_id();
  v_today date := private.kuwait_today();
  v_id uuid;
begin
  if v_me is null or not exists (select 1 from public.employees where id = v_me and is_active) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_leave_type is null or p_leave_type not in ('إجازة دورية', 'إجازة مرضية', 'إجازة طارئة', 'إجازة بدون راتب') then
    raise exception 'invalid_request' using errcode = '22023';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 or char_length(p_reason) > 1000 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'leave_dates_invalid' using errcode = '22023';
  end if;
  -- Sick / emergency leave may be requested for the last 7 days; any leave up to 180 days ahead; at most 60 days long.
  if p_from < v_today - 7 or p_from > v_today + 180 or (p_to - p_from) >= 60 then
    raise exception 'leave_dates_out_of_range' using errcode = '22023';
  end if;
  if exists (select 1 from public.leaves l
             where l.employee_id = v_me and l.leave_type like 'إجازة%'
               and l.from_date <= p_to and coalesce(l.to_date, l.from_date) >= p_from)
     or exists (select 1 from public.requests r
             where r.employee_id = v_me and r.request_type = 'leave'
               and r.status in ('pending_supervisor', 'pending_hr', 'approved')
               and r.shift_date <= p_to and r.leave_to >= p_from) then
    raise exception 'leave_overlaps' using errcode = '23505';
  end if;
  -- A day in a period whose bonus list is locked (period = 21st .. 20th of the list month).
  if exists (select 1
             from generate_series(p_from, p_to, interval '1 day') g(d)
             join public.bonus_lists b
               on b.month = to_char(case when extract(day from g.d) > 20 then g.d + interval '1 month' else g.d end, 'YYYY-MM')
             where b.employee_id = v_me and b.kind = 'شهري' and b.status = 'مقفل') then
    raise exception 'leave_period_locked' using errcode = '22023';
  end if;

  insert into public.requests (employee_id, request_type, shift_date, leave_type, leave_to, reason)
  values (v_me, 'leave', p_from, p_leave_type, p_to, btrim(p_reason))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.submit_leave_request(text, date, date, text) from public, anon;
grant execute on function public.submit_leave_request(text, date, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- decide_request: unchanged, plus the leave branch on the final approval.
-- ---------------------------------------------------------------------------
create or replace function public.decide_request(p_request uuid, p_approve boolean, p_note text default null)
returns public.request_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_employee_id();
  r public.requests%rowtype;
  v_stage public.approval_stage;
  v_status public.request_status;
  sh record;
  v_punch uuid;
begin
  select * into r from public.requests where id = p_request for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not private.can_decide(v_me, p_request) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_note is not null and char_length(p_note) > 1000 then
    raise exception 'note_too_long' using errcode = '22023';
  end if;
  v_stage := case r.status when 'pending_supervisor' then 'supervisor'::public.approval_stage else 'hr'::public.approval_stage end;

  if not p_approve then
    v_status := 'rejected';
  elsif v_stage = 'supervisor' then
    v_status := 'pending_hr';
  else
    v_status := 'approved';
    if r.request_type = 'punch_correction' then
      select * into sh from private.employee_shifts(
        r.employee_id, (r.shift_date::timestamp) at time zone 'Asia/Kuwait', ((r.shift_date + 1)::timestamp) at time zone 'Asia/Kuwait') s
      where s.shift_date = r.shift_date order by s.shift_start limit 1;
      if not found then raise exception 'no_shift_that_day' using errcode = '22023'; end if;
      if r.corrected_punch_type = 'check_out' and not exists (
        select 1 from public.attendance_days a where a.employee_id = r.employee_id and a.shift_start = sh.shift_start
          and a.check_in_at is not null and a.check_in_at < r.corrected_time) then
        raise exception 'check_in_first' using errcode = '22023';
      end if;
      insert into public.attendance_punches (
        employee_id, punch_type, punched_at, shift_date, result, source, request_id
      ) values (
        r.employee_id, r.corrected_punch_type, r.corrected_time, r.shift_date, 'accepted', 'correction', r.id
      ) returning id into v_punch;
      perform public.attendance_apply_punch(v_punch, sh.shift_start);
    elsif r.request_type = 'leave' then
      insert into public.leaves (employee_id, leave_type, from_date, to_date, source, note, created_by, is_demo)
      select r.employee_id, r.leave_type, r.shift_date, r.leave_to, 'طلب من التطبيق', r.reason, 'sanad-app', e.is_demo
      from public.employees e where e.id = r.employee_id;
      -- Same as the leaves agent: a leave that covers today puts the employee "on leave".
      if private.kuwait_today() between r.shift_date and r.leave_to then
        update public.employees set employment_status = 'في إجازة'
        where id = r.employee_id and employment_status = 'على رأس العمل';
      end if;
      -- Traceability for the manager agent and the manager's history (agent_log, "السجل").
      insert into public.agent_log (action, agent, result, reason, file_number, employee_id, is_demo)
      select 'تسجيل ' || r.leave_type || ' – ' || e.full_name_ar || ' (' || e.file_number || ') من التطبيق',
             'تطبيق سند',
             r.leave_type || ' من ' || r.shift_date || ' إلى ' || r.leave_to || ' (' || (r.leave_to - r.shift_date + 1) || ' يوم)',
             'طلب من التطبيق؛ موافقة المشرف والموارد البشرية',
             e.file_number, e.id, e.is_demo
      from public.employees e where e.id = r.employee_id;
    end if;
  end if;

  insert into public.request_approvals (request_id, stage, approver_id, decision, note)
  values (p_request, v_stage, v_me, case when p_approve then 'approved'::public.approval_decision else 'rejected'::public.approval_decision end,
          nullif(btrim(coalesce(p_note, '')), ''));
  update public.requests set status = v_status where id = p_request;
  return v_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- approval_inbox: same, plus the leave type and last day.
-- ---------------------------------------------------------------------------
drop function public.approval_inbox();
create function public.approval_inbox()
returns table (
  id uuid, request_type public.request_type, status public.request_status, shift_date date,
  corrected_punch_type public.punch_type, corrected_time timestamptz, mission_site_id uuid,
  reason text, created_at timestamptz,
  employee_id uuid, file_number integer, full_name_ar text, full_name_en text,
  department_ar text, department_en text, site_ar text, site_en text,
  leave_type text, leave_to date
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.request_type, r.status, r.shift_date, r.corrected_punch_type, r.corrected_time, r.mission_site_id,
         r.reason, r.created_at, e.id, e.file_number, e.full_name_ar, e.full_name_en,
         d.name_ar, d.name_en, s.name_ar, s.name_en, r.leave_type, r.leave_to
  from public.requests r
  join public.employees e on e.id = r.employee_id
  left join public.departments d on d.id = e.department_id
  left join public.sites s on s.id = r.mission_site_id
  where r.status in ('pending_supervisor', 'pending_hr')
    and private.can_decide(private.current_employee_id(), r.id)
  order by r.created_at
$$;
revoke all on function public.approval_inbox() from public, anon;
grant execute on function public.approval_inbox() to authenticated;

-- ---------------------------------------------------------------------------
-- In-app notifications for the signed-in employee (newest first). Read only.
-- kind: request_decided | late | leave_recorded | penalty_recorded | bonus_list
-- ---------------------------------------------------------------------------
create function public.my_notifications(p_limit integer default 40)
returns table (kind text, at timestamptz, data jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_employee_id();
  v_since timestamptz := now() - interval '60 days';
begin
  if v_me is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return query
  select x.kind, x.at, x.data from (
    select 'request_decided'::text as kind, a.decided_at as at,
           jsonb_build_object('request_type', r.request_type, 'stage', a.stage, 'decision', a.decision,
                              'status', r.status, 'date', r.shift_date, 'to', r.leave_to, 'leave_type', r.leave_type,
                              'note', a.note) as data
    from public.request_approvals a join public.requests r on r.id = a.request_id
    where r.employee_id = v_me and a.decided_at >= v_since
    union all
    select 'late', d.shift_start, jsonb_build_object('date', d.shift_date, 'minutes', d.late_minutes)
    from public.attendance_days d
    where d.employee_id = v_me and d.arrival = 'late' and d.shift_start >= v_since
    union all
    select 'leave_recorded', l.created_at, jsonb_build_object('type', l.leave_type, 'from', l.from_date, 'to', l.to_date, 'source', l.source)
    from public.leaves l
    where l.employee_id = v_me and l.created_at >= v_since
    union all
    select 'penalty_recorded', p.created_at, jsonb_build_object('type', p.penalty_type, 'date', p.penalty_date, 'reason', p.reason)
    from public.penalties p
    where p.employee_id = v_me and p.created_at >= v_since
    union all
    select 'bonus_list', b.updated_at, jsonb_build_object('month', b.month, 'eligibility', b.eligibility, 'reason', b.reason)
    from public.bonus_lists b
    where b.employee_id = v_me and b.status = 'مقفل' and b.updated_at >= v_since
  ) x
  order by x.at desc
  limit least(greatest(coalesce(p_limit, 40), 1), 100);
end;
$$;
revoke all on function public.my_notifications(integer) from public, anon;
grant execute on function public.my_notifications(integer) to authenticated;
