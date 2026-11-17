-- Sanad — Phase 13: pilot metrics (the "Claude check" of the field trial; PRD section 16).
-- One read-only function for supervisor / HR / admin. It is SECURITY INVOKER: it reads the punch log
-- with the caller's own rights, so the RLS of attendance_punches, employees and employee_sites applies.
-- No table is changed.
--
-- What the punch log can and cannot tell (checked against supabase/functions/punch/index.ts):
--   * Every attempt that reaches the server is one row: result, reject_reason (the first failed check),
--     and client_report.verification ('device_biometric' | 'face_descriptor').
--   * Server time: punched_at is the server clock when the punch function started handling the request;
--     created_at is the database clock when the row was saved (after every check and the photo upload).
--     created_at - punched_at = the time the server spent on one attempt.
--   * Not recorded: when the employee pressed "punch" on the phone, how long the GPS fix, the photo and
--     Face ID / fingerprint took, or the upload time. So the full time from the press to the answer is
--     not in the data; the pilot measures it with a stopwatch (docs/pilot/pilot-checklist.md).
--   * Not recorded either: attempts that stop on the phone (Face ID cancelled or failed, no internet),
--     and requests the server turns away before saving (account locked for 5 minutes, invalid body).
--
-- Rows counted: real device punches only (source = 'device', not demo data), by Kuwait date of punched_at.
-- Department: the employee's current department. Site: the site of an accepted punch; a refused punch
-- has no site, so it counts for every site enabled for that employee.
--
-- "First-attempt success": an employee's attempts are grouped into tries. A try starts with an attempt
-- that comes more than p_retry_minutes after that employee's previous attempt, or right after an accepted
-- one. A try is a first-attempt success when its first attempt was accepted.

create function public.pilot_metrics(
  p_from date,
  p_to date,
  p_department uuid default null,
  p_site uuid default null,
  p_retry_minutes integer default 10
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 30 then
    raise exception 'invalid_range' using errcode = '22023';
  end if;
  if p_retry_minutes is null or p_retry_minutes < 1 or p_retry_minutes > 120 then
    raise exception 'invalid_retry_minutes' using errcode = '22023';
  end if;

  with base as (
    select p.employee_id, p.punched_at, p.result, p.reject_reason,
           coalesce(p.client_report ->> 'verification', 'unknown') as method,
           (p.punched_at at time zone 'Asia/Kuwait')::date as day,
           greatest(0, extract(epoch from (p.created_at - p.punched_at)) * 1000) as server_ms
    from public.attendance_punches p
    join public.employees e on e.id = p.employee_id
    -- shift_date is within a day of the Kuwait date: a cheap index range before the exact filter.
    where p.shift_date between p_from - 1 and p_to + 1
      and (p.punched_at at time zone 'Asia/Kuwait')::date between p_from and p_to
      and p.source = 'device'
      and not p.is_demo
      and (p_department is null or e.department_id = p_department)
      and (p_site is null
           or p.site_id = p_site
           or (p.site_id is null and exists (
                 select 1 from public.employee_sites es
                 where es.employee_id = p.employee_id and es.site_id = p_site)))
  ),
  marked as (
    select b.*,
           case
             when lag(b.punched_at) over w is null then true
             when lag(b.result) over w = 'accepted' then true
             when b.punched_at - lag(b.punched_at) over w > make_interval(mins => p_retry_minutes) then true
             else false
           end as starts_try
    from base b
    window w as (partition by b.employee_id order by b.punched_at)
  ),
  totals as (
    select count(*) as attempts,
           count(*) filter (where result = 'accepted') as accepted,
           count(*) filter (where result = 'rejected') as rejected,
           count(distinct employee_id) as employees,
           count(*) filter (where starts_try) as tries,
           count(*) filter (where starts_try and result = 'accepted') as first_ok
    from marked
  ),
  timing as (
    select count(*) as n,
           percentile_cont(0.5) within group (order by server_ms) as p50,
           percentile_cont(0.9) within group (order by server_ms) as p90,
           max(server_ms) as max
    from base
    where result = 'accepted'
  ),
  reasons as (
    select coalesce(reject_reason, 'unknown') as reason, count(*) as n
    from base
    where result = 'rejected'
    group by 1
  ),
  methods as (
    select method,
           count(*) as attempts,
           count(*) filter (where result = 'accepted') as accepted,
           count(*) filter (where result = 'rejected') as rejected,
           count(*) filter (where starts_try) as tries,
           count(*) filter (where starts_try and result = 'accepted') as first_ok
    from marked
    group by method
  ),
  days as (
    select day,
           count(*) filter (where result = 'accepted') as accepted,
           count(*) filter (where result = 'rejected') as rejected
    from base
    group by day
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'retry_minutes', p_retry_minutes,
    'attempts', t.attempts,
    'accepted', t.accepted,
    'rejected', t.rejected,
    'employees', t.employees,
    'tries', t.tries,
    'first_ok', t.first_ok,
    'server_ms', jsonb_build_object(
      'n', tm.n,
      'p50', round(tm.p50::numeric),
      'p90', round(tm.p90::numeric),
      'max', round(tm.max::numeric)),
    'reasons', coalesce((select jsonb_agg(jsonb_build_object('reason', r.reason, 'n', r.n) order by r.n desc, r.reason)
                         from reasons r), '[]'::jsonb),
    'methods', coalesce((select jsonb_agg(jsonb_build_object(
                           'method', m.method, 'attempts', m.attempts, 'accepted', m.accepted,
                           'rejected', m.rejected, 'tries', m.tries, 'first_ok', m.first_ok) order by m.attempts desc, m.method)
                         from methods m), '[]'::jsonb),
    'days', coalesce((select jsonb_agg(jsonb_build_object('day', d.day, 'accepted', d.accepted, 'rejected', d.rejected) order by d.day)
                      from days d), '[]'::jsonb)
  )
  into v_out
  from totals t cross join timing tm;

  return v_out;
end;
$$;

revoke all on function public.pilot_metrics(date, date, uuid, uuid, integer) from public, anon;
grant execute on function public.pilot_metrics(date, date, uuid, uuid, integer) to authenticated;

comment on function public.pilot_metrics(date, date, uuid, uuid, integer) is
  'Pilot metrics (phase 13): attempts, first-attempt success, rejections by reason, method split, server time. Read-only, security invoker.';
