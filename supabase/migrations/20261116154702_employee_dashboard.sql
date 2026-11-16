-- Sanad phase S1: employee dashboard (PRD sections 17-18). Read only.
-- One call returns everything the dashboard needs for one employee and one bonus period:
-- attendance counts, leaves, penalties, the bonus list row (if written) and an estimate.
--
-- Who can call it:
--   * an employee, for themselves only (p_employee null or their own id);
--   * staff (supervisor, hr, admin), for any employee (view only).
--
-- The estimate uses the SAME rules as the lists agent (CODED/bonus/agent/bonus_lists.py):
--   period  = 21st of the previous month .. 20th of the list month
--   not eligible if  leave days > 10 (leave types starting with "إجازة", calendar days in the period)
--                or  late arrivals >= 2 (late dates from attendance_days + leaves of type "تأخير")
--                or  any penalty dated inside the period
-- The official result is always bonus_lists (written by the agents); the estimate is shown
-- only until that row exists. This function does not touch bonus tables or agent functions.

create function public.employee_dashboard(p_employee uuid default null, p_month text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_employee_id();
  v_emp uuid := coalesce(p_employee, v_me);
  v_today date := (now() at time zone 'Asia/Kuwait')::date;
  v_month text;
  v_start date;
  v_end date;
  v_info jsonb;
  v_att jsonb;
  v_late_dates date[];
  v_leaves jsonb;
  v_leave_days integer;
  v_penalties jsonb;
  v_pen_texts text[];
  v_list jsonb;
  v_reasons text[] := '{}';
  v_months jsonb;
  v_pending boolean;
  v_notes text[] := '{}';
begin
  if v_me is null and not private.is_staff() then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if v_emp is null or (v_emp <> coalesce(v_me, '00000000-0000-0000-0000-000000000000'::uuid)
                       and not private.is_staff()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  -- Bonus month: after the 20th the current period belongs to next month's list.
  if p_month is not null then
    if p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
      raise exception 'bad month' using errcode = '22023';
    end if;
    v_month := p_month;
  else
    v_month := to_char(case when extract(day from v_today) > 20
                            then v_today + interval '1 month' else v_today end, 'YYYY-MM');
  end if;
  v_end := to_date(v_month || '-20', 'YYYY-MM-DD');
  v_start := (date_trunc('month', v_end) - interval '1 month')::date + 20;

  select jsonb_build_object(
           'id', e.id, 'file_number', e.file_number,
           'name_ar', e.full_name_ar, 'name_en', e.full_name_en,
           'department_ar', d.name_ar, 'department_en', d.name_en,
           'job_title', e.job_title, 'hire_date', e.hire_date,
           'employment_status', e.employment_status)
    into v_info
  from public.employees e
  left join public.departments d on d.id = e.department_id
  where e.id = v_emp;
  if v_info is null then
    raise exception 'employee not found' using errcode = 'P0002';
  end if;

  -- Attendance in the period, up to today (future days are not counted).
  select jsonb_build_object(
           'shifts', count(*) filter (where a.arrival <> 'pending'),
           'present', count(*) filter (where a.arrival in ('on_time', 'late')),
           'late', count(*) filter (where a.arrival = 'late'),
           'late_minutes', coalesce(sum(a.late_minutes) filter (where a.arrival = 'late'), 0),
           'absent', count(*) filter (where a.arrival = 'absent'),
           'absent_unexcused', count(*) filter (where a.arrival = 'absent' and not exists (
               select 1 from public.leaves l
               where l.employee_id = v_emp and l.leave_type <> 'تأخير'
                 and a.shift_date between l.from_date and coalesce(l.to_date, l.from_date))),
           'missing_checkout', count(*) filter (where a.departure = 'missing')),
         coalesce(array_agg(a.shift_date order by a.shift_date) filter (where a.arrival = 'late'), '{}')
    into v_att, v_late_dates
  from public.attendance_days a
  where a.employee_id = v_emp
    and a.shift_date between v_start and least(v_end, v_today);

  -- Leaves overlapping the period.
  select coalesce(jsonb_agg(jsonb_build_object(
           'type', l.leave_type, 'from', l.from_date, 'to', l.to_date, 'note', l.note,
           'days_in_period', greatest(0, least(coalesce(l.to_date, l.from_date), v_end)
                                         - greatest(l.from_date, v_start) + 1))
           order by l.from_date), '[]'::jsonb),
         coalesce(sum(greatest(0, least(coalesce(l.to_date, l.from_date), v_end)
                                  - greatest(l.from_date, v_start) + 1))
                  filter (where l.leave_type like 'إجازة%'), 0)
    into v_leaves, v_leave_days
  from public.leaves l
  where l.employee_id = v_emp
    and l.from_date <= v_end and coalesce(l.to_date, l.from_date) >= v_start;

  -- Late arrivals recorded as leaves of type "تأخير" count too (same as the agent).
  select coalesce(array_agg(distinct d order by d), '{}')
    into v_late_dates
  from (select unnest(v_late_dates) as d
        union
        select l.from_date from public.leaves l
        where l.employee_id = v_emp and l.leave_type = 'تأخير'
          and l.from_date between v_start and v_end) x;

  select coalesce(jsonb_agg(jsonb_build_object(
           'type', p.penalty_type, 'date', p.penalty_date, 'reason', p.reason)
           order by p.penalty_date), '[]'::jsonb),
         coalesce(array_agg(p.penalty_type || ' بتاريخ ' || p.penalty_date order by p.penalty_date), '{}')
    into v_penalties, v_pen_texts
  from public.penalties p
  where p.employee_id = v_emp and p.penalty_date between v_start and v_end;

  select jsonb_build_object(
           'eligibility', b.eligibility, 'reason', b.reason, 'status', b.status,
           'leave_days', b.leave_days, 'late_count', b.late_count, 'updated_at', b.updated_at)
    into v_list
  from public.bonus_lists b
  where b.month = v_month and b.kind = 'شهري' and b.employee_id = v_emp;

  if v_leave_days > 10 then
    v_reasons := v_reasons || ('إجازة ' || v_leave_days || ' يوم في الفترة (أكثر من 10)');
  end if;
  if cardinality(v_late_dates) >= 2 then
    v_reasons := v_reasons || ('تأخير ' || cardinality(v_late_dates) || ' مرات ('
                               || array_to_string(v_late_dates, '، ') || ')');
  end if;
  if cardinality(v_pen_texts) > 0 then
    v_reasons := v_reasons || ('عقوبة: ' || array_to_string(v_pen_texts, '، '));
  end if;

  -- Like the agent: someone not on duty (or hired after the period) is outside the list
  -- unless the manager decides, so no estimate is given for them.
  v_pending := (v_info->>'employment_status') not in ('على رأس العمل', 'في إجازة')
               or coalesce((v_info->>'hire_date')::date > v_end, false);
  if (v_att->>'absent_unexcused')::integer > 0 then
    v_notes := v_notes || ('غياب ' || (v_att->>'absent_unexcused') || ' يوم بدون إجازة مسجلة، والمدير يراجعه قبل قفل الكشف');
  end if;

  select coalesce(jsonb_agg(m order by m desc), '[]'::jsonb)
    into v_months
  from (select distinct b.month as m from public.bonus_lists b
        where b.employee_id = v_emp and b.kind = 'شهري') x;

  return jsonb_build_object(
    'employee', v_info,
    'month', v_month,
    'period', jsonb_build_object('from', v_start, 'to', v_end, 'today', v_today,
                                 'complete', v_today > v_end),
    'attendance', v_att || jsonb_build_object('late_dates', to_jsonb(v_late_dates),
                                              'late_total', cardinality(v_late_dates)),
    'leaves', v_leaves,
    'leave_days', v_leave_days,
    'penalties', v_penalties,
    'list', v_list,
    'estimate', jsonb_build_object(
      'eligibility', case when v_pending then null
                          when cardinality(v_reasons) > 0 then 'غير مستحق' else 'مستحق' end,
      'pending_manager', v_pending,
      'reasons', to_jsonb(v_reasons),
      'reason', case when v_pending then 'حالتك الوظيفية أو تاريخ تعيينك يحتاج قرار المدير قبل حساب المكافأة'
                     when cardinality(v_reasons) > 0 then array_to_string(v_reasons, '؛ ')
                     else 'لا إجازة فوق 10 أيام ولا تأخير مرتين ولا عقوبة' end,
      'notes', to_jsonb(v_notes)),
    'list_months', v_months,
    'viewer_is_self', v_emp = v_me
  );
end;
$$;

revoke execute on function public.employee_dashboard(uuid, text) from public, anon;
grant execute on function public.employee_dashboard(uuid, text) to authenticated;
