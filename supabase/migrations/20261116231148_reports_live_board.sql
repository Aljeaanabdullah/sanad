-- Sanad — Phase 10: reports and the live board (PRD section 10).
-- Read-only functions for supervisor / HR / admin. Everything else gets 42501.
--
-- One row per scheduled shift (employee x shift day), built from the same rules as
-- public.attendance_history:
--   * the shifts come from private.employee_shifts (work pattern, weekly off days, public holidays)
--     plus any shift already recorded in public.attendance_days (so a later pattern change keeps history);
--   * inactive employees are left out, and so are shifts before the employee was added (no record);
--   * no check-in once the shift is over = absent, unless an approved leave ('إجازة …') covers the day.
-- status: on_time | late | leave | absent | not_arrived (shift started, no check-in yet) | upcoming.
-- Site: the site of the check-in punch; without one, the employee's enabled sites.

create function private.report_rows(
  p_from date, p_to date, p_department uuid, p_site uuid, p_file integer, p_now timestamptz
)
returns table (
  day date, employee_id uuid, file_number integer, name_ar text, name_en text,
  department_id uuid, department_ar text, department_en text,
  shift_start timestamptz, shift_end timestamptz, status text,
  check_in_at timestamptz, check_out_at timestamptz, late_minutes integer, early_leave_minutes integer,
  check_in_corrected boolean, site_id uuid, site_ar text, site_en text, leave_type text
)
language plpgsql
stable
security definer
set search_path = ''
-- A plan cached for a one-day call (live board) is very slow for a 31-day call: plan every call.
set plan_cache_mode = force_custom_plan
set work_mem = '32MB'
as $$
#variable_conflict use_column
begin
  return query
  with emp as (
    select e.id, e.file_number, e.full_name_ar, e.full_name_en, e.department_id, e.created_at,
           e.work_pattern_id, coalesce(e.cycle_start_date, date '0001-01-01') as cycle_key,
           coalesce(array_agg(si.id order by si.name_ar) filter (where si.id is not null), '{}') as sites,
           string_agg(si.name_ar, '، ' order by si.name_ar) as sites_ar,
           string_agg(si.name_en, ', ' order by si.name_ar) as sites_en
    from public.employees e
    left join public.employee_sites es on es.employee_id = e.id
    left join public.sites si on si.id = es.site_id
    where e.is_active
      and (p_department is null or e.department_id = p_department)
      and (p_file is null or e.file_number = p_file)
    group by e.id
  ),
  -- private.employee_shifts depends only on the employee's work pattern and cycle start, so it is
  -- called once per (pattern, cycle start) group (about 16 calls instead of 3,500), then shared.
  grp as (
    select emp.work_pattern_id, emp.cycle_key, (array_agg(emp.id))[1] as rep
    from emp
    where emp.work_pattern_id is not null
    group by emp.work_pattern_id, emp.cycle_key
  ),
  gs as materialized (
    select grp.work_pattern_id, grp.cycle_key, s.shift_date, s.shift_start, s.shift_end
    from grp
    cross join lateral private.employee_shifts(
      grp.rep,
      (p_from::timestamp) at time zone 'Asia/Kuwait',
      ((p_to + 1)::timestamp) at time zone 'Asia/Kuwait') s
    where s.shift_date between p_from and p_to
  ),
  sh as (
    select emp.id as employee_id, gs.shift_date, gs.shift_start, gs.shift_end
    from emp
    join gs on gs.work_pattern_id = emp.work_pattern_id and gs.cycle_key = emp.cycle_key
  ),
  -- Range scan on shift_date; rows of employees outside the filter drop out at the join with emp.
  ad as materialized (
    select a.* from public.attendance_days a
    where a.shift_date between p_from and p_to
  ),
  j as (
    select coalesce(ad.employee_id, sh.employee_id) as employee_id,
           coalesce(ad.shift_date, sh.shift_date) as day,
           coalesce(ad.shift_start, sh.shift_start) as shift_start,
           coalesce(ad.shift_end, sh.shift_end) as shift_end,
           ad.id as ad_id, ad.arrival, ad.check_in_at, ad.check_out_at, ad.check_in_punch_id,
           coalesce(ad.late_minutes, 0) as late_minutes,
           coalesce(ad.early_leave_minutes, 0) as early_leave_minutes,
           coalesce(ad.check_in_corrected, false) as check_in_corrected
    from sh
    full join ad on ad.employee_id = sh.employee_id and ad.shift_start = sh.shift_start
  )
  select j.day, emp.id, emp.file_number, emp.full_name_ar, emp.full_name_en,
         emp.department_id, d.name_ar, d.name_en,
         j.shift_start, j.shift_end,
         case
           when j.check_in_at is not null then case when j.arrival = 'late' then 'late' else 'on_time' end
           when lv.leave_type is not null then 'leave'
           when j.shift_end <= p_now then 'absent'
           when j.shift_start <= p_now then 'not_arrived'
           else 'upcoming'
         end,
         j.check_in_at, j.check_out_at, j.late_minutes, j.early_leave_minutes, j.check_in_corrected,
         coalesce(p.site_id, case when cardinality(emp.sites) = 1 then emp.sites[1] end),
         coalesce(cs.name_ar, emp.sites_ar), coalesce(cs.name_en, emp.sites_en),
         lv.leave_type
  from j
  join emp on emp.id = j.employee_id
  left join public.departments d on d.id = emp.department_id
  left join public.attendance_punches p on p.id = j.check_in_punch_id
  left join public.sites cs on cs.id = p.site_id
  left join lateral (
    select l.leave_type from public.leaves l
    where l.employee_id = j.employee_id and l.leave_type like 'إجازة%'
      and j.day between l.from_date and coalesce(l.to_date, l.from_date)
    order by l.from_date desc
    limit 1
  ) lv on true
  where not (j.ad_id is null and j.shift_start < emp.created_at)
    and (p_site is null or p.site_id = p_site or (p.site_id is null and p_site = any (emp.sites)));
end;
$$;
revoke all on function private.report_rows(date, date, uuid, uuid, integer, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reports: date range of at most 31 days. p_status: null (all) | present | late | absent | leave.
-- ---------------------------------------------------------------------------
create function public.attendance_report(
  p_from date, p_to date, p_department uuid default null, p_site uuid default null,
  p_file integer default null, p_status text default null
)
returns table (
  day date, employee_id uuid, file_number integer, name_ar text, name_en text,
  department_id uuid, department_ar text, department_en text,
  shift_start timestamptz, shift_end timestamptz, status text,
  check_in_at timestamptz, check_out_at timestamptz, late_minutes integer, early_leave_minutes integer,
  check_in_corrected boolean, site_id uuid, site_ar text, site_en text, leave_type text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 30 then
    raise exception 'invalid_range' using errcode = '22023';
  end if;
  if p_status is not null and p_status not in ('present', 'late', 'absent', 'leave') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  return query
  select r.* from private.report_rows(p_from, p_to, p_department, p_site, p_file, now()) r
  where p_status is null
     or (p_status = 'present' and r.status in ('on_time', 'late'))
     or r.status = p_status
  order by r.day, r.file_number, r.shift_start;
end;
$$;
revoke all on function public.attendance_report(date, date, uuid, uuid, integer, text) from public, anon;
grant execute on function public.attendance_report(date, date, uuid, uuid, integer, text) to authenticated;

-- The same rows in one JSON array, for Excel / PDF export (not cut by the API's 1,000-row page).
create function public.attendance_report_export(
  p_from date, p_to date, p_department uuid default null, p_site uuid default null,
  p_file integer default null, p_status text default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'day', r.day, 'file_number', r.file_number, 'name_ar', r.name_ar, 'name_en', r.name_en,
           'department_ar', r.department_ar, 'department_en', r.department_en,
           'shift_start', r.shift_start, 'status', r.status, 'check_in_at', r.check_in_at,
           'check_out_at', r.check_out_at, 'late_minutes', r.late_minutes,
           'check_in_corrected', r.check_in_corrected, 'site_ar', r.site_ar, 'site_en', r.site_en,
           'leave_type', r.leave_type)), '[]'::jsonb)
  from public.attendance_report(p_from, p_to, p_department, p_site, p_file, p_status) r
$$;
revoke all on function public.attendance_report_export(date, date, uuid, uuid, integer, text) from public, anon;
grant execute on function public.attendance_report_export(date, date, uuid, uuid, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Live board: today's shifts (Kuwait date), one row per scheduled employee, with checked_out.
-- ---------------------------------------------------------------------------
create function public.live_board(p_department uuid default null, p_site uuid default null)
returns table (
  employee_id uuid, file_number integer, name_ar text, name_en text,
  department_ar text, department_en text, shift_start timestamptz, shift_end timestamptz,
  status text, checked_out boolean, check_in_at timestamptz, check_out_at timestamptz,
  late_minutes integer, site_ar text, site_en text, leave_type text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Kuwait')::date;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return query
  select r.employee_id, r.file_number, r.name_ar, r.name_en, r.department_ar, r.department_en,
         r.shift_start, r.shift_end, r.status, r.check_out_at is not null, r.check_in_at, r.check_out_at,
         r.late_minutes, r.site_ar, r.site_en, r.leave_type
  from private.report_rows(v_today, v_today, p_department, p_site, null, now()) r
  order by r.shift_start, r.file_number;
end;
$$;
revoke all on function public.live_board(uuid, uuid) from public, anon;
grant execute on function public.live_board(uuid, uuid) to authenticated;
