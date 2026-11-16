-- Demo only: turn the automatic "absent" rows of DEMO employees into realistic punches.
-- Real accounts (is_demo = false) are never touched. Deterministic per employee/day.
-- Runs every 10 minutes, 5 minutes after attendance-finalize.
create function private.demo_attendance_autofill(p_days integer default 2)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  update public.attendance_days a set
    arrival = (case when r < 41 then 'late' else 'on_time' end)::public.arrival_status,
    departure = (case when r between 41 and 50 then 'missing' else 'done' end)::public.departure_status,
    check_in_at = case when r < 41 then a.shift_start + w.grace_period + make_interval(mins => 3 + (r * 7) % 55)
                       else a.shift_start - make_interval(mins => (r * 13) % 35) end,
    check_out_at = case when r between 41 and 50 then null else a.shift_end + make_interval(mins => (r * 3) % 20) end,
    late_minutes = case when r < 41 then 3 + (r * 7) % 55 else 0 end
  from (select a2.id, abs(hashtext(a2.employee_id::text || a2.shift_date::text)) % 1000 as r
          from public.attendance_days a2
         where a2.shift_date >= (now() at time zone 'Asia/Kuwait')::date - p_days
           and a2.arrival = 'absent' and a2.check_in_punch_id is null and a2.check_out_punch_id is null) x,
       public.employees e, public.work_patterns w
  where x.id = a.id and e.id = a.employee_id and w.id = a.work_pattern_id
    and e.is_demo
    and e.employment_status in ('على رأس العمل', 'في إجازة')
    and x.r >= 3
    and e.file_number not in (710050, 710060, 710070, 710080)
    and not exists (select 1 from public.leaves l
                    where l.employee_id = a.employee_id and l.leave_type <> 'تأخير'
                      and a.shift_date between l.from_date and coalesce(l.to_date, l.from_date));
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function private.demo_attendance_autofill(integer) from public, anon, authenticated;
select cron.schedule('demo-attendance-autofill', '5-59/10 * * * *', 'select private.demo_attendance_autofill(2)');
