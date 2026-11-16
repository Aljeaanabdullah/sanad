-- bonus_attendance: add unexcused absences (absent with no covering leave) and first punch date.
drop function public.bonus_attendance(date, date);
create function public.bonus_attendance(p_from date, p_to date)
returns table (employee_id uuid, file_number integer, shifts integer, present integer,
               late integer, absent integer, absent_unexcused integer,
               first_present date, late_dates date[])
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.file_number,
         count(*)::integer,
         count(*) filter (where a.arrival in ('on_time', 'late'))::integer,
         count(*) filter (where a.arrival = 'late')::integer,
         count(*) filter (where a.arrival = 'absent')::integer,
         count(*) filter (where a.arrival = 'absent' and not exists (
             select 1 from public.leaves l
             where l.employee_id = e.id and l.leave_type <> 'تأخير'
               and a.shift_date between l.from_date and coalesce(l.to_date, l.from_date)))::integer,
         min(a.shift_date) filter (where a.arrival in ('on_time', 'late')),
         coalesce(array_agg(a.shift_date order by a.shift_date) filter (where a.arrival = 'late'), '{}')
  from public.employees e
  join public.attendance_days a on a.employee_id = e.id
  where a.shift_date between p_from and p_to
    and (private.is_agent() or private.is_staff())
  group by e.id, e.file_number
$$;
revoke execute on function public.bonus_attendance(date, date) from public;
grant execute on function public.bonus_attendance(date, date) to anon, authenticated;
