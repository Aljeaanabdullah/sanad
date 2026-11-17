-- Sanad — Phase 13: pilot metrics, part 2: the phone's own time of a punch (PRD section 16: under 10 seconds).
-- Replaces public.pilot_metrics (20261117192407_pilot_metrics.sql, applied; not edited). Same signature and
-- the same jsonb result, with two more keys. Still read-only and SECURITY INVOKER: RLS applies as before.
--
-- New data: from this app version on, the phone sends report.attempt_ms with each punch: milliseconds from
-- the employee's press of the punch button (or "try again" after an answer) until just before the request is
-- sent: GPS, photo, Face ID / fingerprint and any problem fixed on the way. The punch function copies the
-- report into attendance_punches.client_report as it is (no server change). It is the phone's own clock and it
-- is not signed: a pilot measure only; nothing is decided with it. Values that are not a whole number from
-- 0 to 600000 are left out.
--
-- New keys (accepted punches only, like server_ms):
--   client_ms: { n, p50, p90, max }             the phone time (punches from older app versions have none).
--   full_ms:   { n, p50, p90, max, under_10s }  per punch, phone time + server time: an estimate a little
--                                               under the real full time (the upload and the answer's way
--                                               back to the phone are not measured).
-- Everything else is unchanged (see the first migration for the rules: rows counted, tries, sites).

create or replace function public.pilot_metrics(
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
           greatest(0, extract(epoch from (p.created_at - p.punched_at)) * 1000) as server_ms,
           -- Phone time of the try (press -> just before sending), only a whole number 0..600000.
           case
             when jsonb_typeof(p.client_report -> 'attempt_ms') = 'number'
                  and (p.client_report ->> 'attempt_ms') ~ '^[0-9]{1,6}$'
                  and (p.client_report ->> 'attempt_ms')::integer <= 600000
             then (p.client_report ->> 'attempt_ms')::integer
           end as client_ms
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
  client_timing as (
    select count(*) as n,
           percentile_cont(0.5) within group (order by client_ms) as p50,
           percentile_cont(0.9) within group (order by client_ms) as p90,
           max(client_ms) as max
    from base
    where result = 'accepted' and client_ms is not null
  ),
  -- Full estimate, per punch: phone time + server time (the upload and the answer's way back are not in it).
  full_timing as (
    select count(*) as n,
           percentile_cont(0.5) within group (order by client_ms + server_ms) as p50,
           percentile_cont(0.9) within group (order by client_ms + server_ms) as p90,
           max(client_ms + server_ms) as max,
           count(*) filter (where client_ms + server_ms < 10000) as under_10s
    from base
    where result = 'accepted' and client_ms is not null
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
    'client_ms', jsonb_build_object(
      'n', ct.n,
      'p50', round(ct.p50::numeric),
      'p90', round(ct.p90::numeric),
      'max', round(ct.max::numeric)),
    'full_ms', jsonb_build_object(
      'n', ft.n,
      'p50', round(ft.p50::numeric),
      'p90', round(ft.p90::numeric),
      'max', round(ft.max::numeric),
      'under_10s', ft.under_10s),
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
  from totals t cross join timing tm cross join client_timing ct cross join full_timing ft;

  return v_out;
end;
$$;

revoke all on function public.pilot_metrics(date, date, uuid, uuid, integer) from public, anon;
grant execute on function public.pilot_metrics(date, date, uuid, uuid, integer) to authenticated;

comment on function public.pilot_metrics(date, date, uuid, uuid, integer) is
  'Pilot metrics (phase 13): attempts, first-attempt success, rejections by reason, method split, server time, phone time (client_report.attempt_ms) and the full-time estimate. Read-only, security invoker.';
