-- S9 SQL proofs (ideal employee of the month). Run the whole file in the Supabase SQL editor (or execute_sql,
-- or psql against a local copy): everything happens inside one transaction that is ROLLED BACK, so nothing stays.
-- Each row of the final result is one check; every "ok" must be true.
-- Self-contained: it creates its own departments, people and logins (file numbers 799801-799807), so it does not
-- depend on the demo data. Run it before any real winner exists for the current month (or it will report
-- "already_decided" for the approval checks).
--   dept A: supervisor S, employees E1, E2 and HR employee H     dept B: no supervisor, employee E3
--   dept C: supervisor S2                                         admin AD
begin;
create temp table r(n serial, step text, ok boolean, info text);
grant all on r to authenticated, anon; grant usage on sequence r_n_seq to authenticated, anon;
create temp table ids(k text primary key, v uuid);
grant select on ids to authenticated;

-- ---------------------------------------------------------------- test data
insert into ids values
  ('uS', gen_random_uuid()), ('uS2', gen_random_uuid()), ('uE1', gen_random_uuid()), ('uE2', gen_random_uuid()),
  ('uE3', gen_random_uuid()), ('uH', gen_random_uuid()), ('uAD', gen_random_uuid()),
  ('A', gen_random_uuid()), ('B', gen_random_uuid()), ('C', gen_random_uuid());
insert into auth.users (id, email)
select v, 's9-proof-' || k || '@jahez.local' from ids where k like 'u%';
insert into public.departments (id, name_ar, name_en) values
  ((select v from ids where k = 'A'), 'قسم اختبار أ', 'S9 test A'),
  ((select v from ids where k = 'B'), 'قسم اختبار ب', 'S9 test B'),
  ((select v from ids where k = 'C'), 'قسم اختبار ج', 'S9 test C');
insert into public.employees (file_number, user_id, full_name_ar, full_name_en, role, department_id, job_title, must_change_password)
values
  (799801, (select v from ids where k = 'uS'),  'مشرف أ',  'Supervisor A', 'supervisor', (select v from ids where k = 'A'), 'رقيب', false),
  (799802, (select v from ids where k = 'uS2'), 'مشرف ج',  'Supervisor C', 'supervisor', (select v from ids where k = 'C'), null, false),
  (799803, (select v from ids where k = 'uE1'), 'موظف ١',  'Employee 1',   'employee',   (select v from ids where k = 'A'), 'عريف', false),
  (799804, (select v from ids where k = 'uE2'), 'موظف ٢',  'Employee 2',   'employee',   (select v from ids where k = 'A'), null, false),
  (799805, (select v from ids where k = 'uE3'), 'موظف ٣',  'Employee 3',   'employee',   (select v from ids where k = 'B'), null, false),
  (799806, (select v from ids where k = 'uH'),  'موارد',   'HR person',    'hr',         (select v from ids where k = 'A'), null, false),
  (799807, (select v from ids where k = 'uAD'), 'مدير',    'Admin',        'admin',      null, null, false);
insert into ids select 'S',  id from public.employees where file_number = 799801;
insert into ids select 'S2', id from public.employees where file_number = 799802;
insert into ids select 'E1', id from public.employees where file_number = 799803;
insert into ids select 'E2', id from public.employees where file_number = 799804;
insert into ids select 'E3', id from public.employees where file_number = 799805;
insert into ids select 'H',  id from public.employees where file_number = 799806;
insert into ids select 'AD', id from public.employees where file_number = 799807;
update public.departments set supervisor_id = (select v from ids where k = 'S')  where id = (select v from ids where k = 'A');
update public.departments set supervisor_id = (select v from ids where k = 'S2') where id = (select v from ids where k = 'C');

create function pg_temp.as_user(p text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', (select v from ids where k = p), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.id(p text) returns uuid language sql stable as $$ select v from ids where k = p $$;

set local role authenticated;

-- ---------------------------------------------------------------- supervisor
select pg_temp.as_user('uS');
insert into r(step, ok, info)
select 'supervisor nominates for own department only', count(*) = 1 and bool_and(department_id = pg_temp.id('A')), count(*)::text
from public.ideal_my_departments() where department_id in (pg_temp.id('A'), pg_temp.id('B'), pg_temp.id('C'));
insert into r(step, ok, info)
select 'candidates: active employees of the department, never the supervisor',
  count(*) = 3 and not bool_or(id = pg_temp.id('S')), string_agg(file_number::text, ',')
from public.ideal_candidates(pg_temp.id('A'));
do $$ begin
  perform public.ideal_candidates(pg_temp.id('B'));
  insert into r(step, ok, info) values ('candidates of another department refused', false, 'listed!');
exception when others then insert into r(step, ok, info) values ('candidates of another department refused', sqlerrm = 'not_allowed', sqlerrm); end $$;
do $$ begin
  perform public.ideal_nominate(pg_temp.id('A'), pg_temp.id('S'), 'أنا أفضل موظف في القسم');
  insert into r(step, ok, info) values ('nobody nominates themself', false, 'nominated!');
exception when others then insert into r(step, ok, info) values ('nobody nominates themself', sqlerrm = 'cannot_nominate_self', sqlerrm); end $$;
do $$ begin
  perform public.ideal_nominate(pg_temp.id('A'), pg_temp.id('E3'), 'موظف من قسم آخر ممتاز');
  insert into r(step, ok, info) values ('nominee must be in the department', false, 'nominated!');
exception when others then insert into r(step, ok, info) values ('nominee must be in the department', sqlerrm = 'nominee_not_in_department', sqlerrm); end $$;
do $$ begin
  perform public.ideal_nominate(pg_temp.id('B'), pg_temp.id('E3'), 'موظف من قسم آخر ممتاز');
  insert into r(step, ok, info) values ('supervisor cannot nominate for another department', false, 'nominated!');
exception when others then insert into r(step, ok, info) values ('supervisor cannot nominate for another department', sqlerrm = 'not_allowed', sqlerrm); end $$;
do $$ begin
  perform public.ideal_nominate(pg_temp.id('A'), pg_temp.id('E1'), 'ممتاز');
  insert into r(step, ok, info) values ('a written reason is required', false, 'nominated!');
exception when others then insert into r(step, ok, info) values ('a written reason is required', sqlerrm = 'reason_too_short', sqlerrm); end $$;
do $$ begin
  perform public.ideal_nominate(pg_temp.id('A'), pg_temp.id('E2'), 'التزام ممتاز ومساعدة الزملاء طوال الشهر');
  perform public.ideal_nominate(pg_temp.id('A'), pg_temp.id('E1'), 'أنهى مشروع الأرشفة قبل موعده وساعد الزملاء');
  insert into r(step, ok, info) values ('nominate, then change: still one nomination for the department',
    (select count(*) = 1 and bool_and(nominee_id = pg_temp.id('E1')) from public.ideal_employee_nominations where department_id = pg_temp.id('A')),
    (select count(*)::text from public.ideal_employee_nominations where department_id = pg_temp.id('A')));
end $$;
do $$ begin
  insert into public.ideal_employee_nominations (month, department_id, nominee_id, nominator_id, reason)
  values (date_trunc('month', now())::date, pg_temp.id('A'), pg_temp.id('E2'), pg_temp.id('S'), 'إدخال مباشر بدون الدالة');
  insert into r(step, ok, info) values ('supervisor direct insert blocked', false, 'inserted!');
exception when others then insert into r(step, ok, info) values ('supervisor direct insert blocked', true, sqlerrm); end $$;
do $$ declare v int; begin
  update public.ideal_employee_nominations set reason = 'تعديل مباشر بدون الدالة' where department_id = pg_temp.id('A');
  get diagnostics v = row_count;
  insert into r(step, ok, info) values ('supervisor direct update blocked', v = 0, v::text);
exception when others then insert into r(step, ok, info) values ('supervisor direct update blocked', true, sqlerrm); end $$;
insert into r(step, ok, info)
select 'supervisor reads own nomination', count(*) = 1, count(*)::text
from public.ideal_employee_nominations where department_id in (pg_temp.id('A'), pg_temp.id('B'), pg_temp.id('C'));

-- ---------------------------------------------------------------- admin fallback
select pg_temp.as_user('uAD');
insert into r(step, ok, info)
select 'admin nominates for the department without a supervisor (not for A or C)',
  bool_or(department_id = pg_temp.id('B')) and not bool_or(department_id in (pg_temp.id('A'), pg_temp.id('C'))), string_agg(department_en, ',')
from public.ideal_my_departments() where department_id in (pg_temp.id('A'), pg_temp.id('B'), pg_temp.id('C'));
do $$ begin
  perform public.ideal_nominate(pg_temp.id('B'), pg_temp.id('E3'), 'خدمة عملاء ممتازة وشكر من المراجعين');
  insert into r(step, ok, info) values ('admin nomination for B saved', true, null);
exception when others then insert into r(step, ok, info) values ('admin nomination for B saved', false, sqlerrm); end $$;
do $$ begin
  perform public.ideal_nominate(pg_temp.id('A'), pg_temp.id('E2'), 'محاولة ترشيح من المدير لقسم له مشرف');
  insert into r(step, ok, info) values ('admin cannot nominate where a supervisor exists', false, 'nominated!');
exception when others then insert into r(step, ok, info) values ('admin cannot nominate where a supervisor exists', sqlerrm = 'not_allowed', sqlerrm); end $$;

-- ---------------------------------------------------------------- privacy
select pg_temp.as_user('uS2');
insert into r(step, ok, info)
select 'another supervisor cannot see the nominations', count(*) = 0, count(*)::text from public.ideal_employee_nominations;
insert into r(step, ok, info)
select 'another supervisor: the RPC shows nothing either', count(*) = 0, count(*)::text from public.ideal_nominations(now()::date);
select pg_temp.as_user('uE1');
insert into r(step, ok, info)
select 'employee cannot see nominations (not even about themself)', count(*) = 0, count(*)::text from public.ideal_employee_nominations;
insert into r(step, ok, info)
select 'employee: the RPC shows nothing', count(*) = 0, count(*)::text from public.ideal_nominations(now()::date);
insert into r(step, ok, info)
select 'employee has no department to nominate for', count(*) = 0, count(*)::text from public.ideal_my_departments();
do $$ begin
  perform public.ideal_nominate(pg_temp.id('A'), pg_temp.id('E2'), 'زميل ممتاز يستحق الترشيح');
  insert into r(step, ok, info) values ('employee cannot nominate', false, 'nominated!');
exception when others then insert into r(step, ok, info) values ('employee cannot nominate', sqlerrm = 'not_allowed', sqlerrm); end $$;
do $$ begin
  perform public.ideal_approve((select id from public.ideal_nominations(now()::date) limit 1));
  insert into r(step, ok, info) values ('employee cannot approve', false, 'approved!');
exception when others then insert into r(step, ok, info) values ('employee cannot approve', sqlerrm = 'not_allowed', sqlerrm); end $$;

-- ---------------------------------------------------------------- HR
select pg_temp.as_user('uH');
insert into r(step, ok, info)
select 'HR sees every nomination of the month', count(*) = 2, count(*)::text
from public.ideal_nominations(now()::date) where department_id in (pg_temp.id('A'), pg_temp.id('B'));
reset role;
select pg_temp.as_user('uS');
set local role authenticated;
select public.ideal_nominate(pg_temp.id('A'), pg_temp.id('H'), 'تنظيم ملفات الموظفين بشكل ممتاز');
select pg_temp.as_user('uH');
do $$ begin
  perform public.ideal_approve((select id from public.ideal_employee_nominations where department_id = pg_temp.id('A')));
  insert into r(step, ok, info) values ('HR cannot approve their own nomination', false, 'approved!');
exception when others then insert into r(step, ok, info) values ('HR cannot approve their own nomination', sqlerrm = 'cannot_approve_self', sqlerrm); end $$;
select pg_temp.as_user('uS');
select public.ideal_nominate(pg_temp.id('A'), pg_temp.id('E1'), 'أنهى مشروع الأرشفة قبل موعده وساعد الزملاء');
select pg_temp.as_user('uS');
do $$ begin
  perform public.ideal_approve((select id from public.ideal_employee_nominations where department_id = pg_temp.id('A')));
  insert into r(step, ok, info) values ('supervisor cannot approve', false, 'approved!');
exception when others then insert into r(step, ok, info) values ('supervisor cannot approve', sqlerrm = 'not_allowed', sqlerrm); end $$;
do $$ begin
  insert into public.ideal_employee_winners (month, employee_id, name_ar, name_en, reason)
  values (date_trunc('month', now())::date, pg_temp.id('E1'), 'x', 'x', 'إدخال مباشر بدون الدالة');
  insert into r(step, ok, info) values ('direct insert of a winner blocked', false, 'inserted!');
exception when others then insert into r(step, ok, info) values ('direct insert of a winner blocked', true, sqlerrm); end $$;

select pg_temp.as_user('uH');
do $$ declare v uuid; begin
  v := public.ideal_approve((select id from public.ideal_employee_nominations where department_id = pg_temp.id('A')),
         null, 'قدوة في الالتزام');
  insert into r(step, ok, info) values ('HR approves the winner with a citation', v is not null, v::text);
exception when others then insert into r(step, ok, info) values ('HR approves the winner with a citation', false, sqlerrm); end $$;
do $$ begin
  perform public.ideal_approve((select id from public.ideal_employee_nominations where department_id = pg_temp.id('B')));
  insert into r(step, ok, info) values ('one winner per month', false, 'approved twice!');
exception when others then insert into r(step, ok, info) values ('one winner per month', sqlerrm = 'already_decided', sqlerrm); end $$;
select pg_temp.as_user('uS');
do $$ begin
  perform public.ideal_nominate(pg_temp.id('A'), pg_temp.id('E2'), 'محاولة بعد اعتماد الفائز');
  insert into r(step, ok, info) values ('no nomination changes after the winner is approved', false, 'changed!');
exception when others then insert into r(step, ok, info) values ('no nomination changes after the winner is approved', sqlerrm = 'month_closed', sqlerrm); end $$;
do $$ begin
  perform public.ideal_withdraw(pg_temp.id('A'));
  insert into r(step, ok, info) values ('no withdrawal after the winner is approved', false, 'withdrawn!');
exception when others then insert into r(step, ok, info) values ('no withdrawal after the winner is approved', sqlerrm = 'month_closed', sqlerrm); end $$;

-- ---------------------------------------------------------------- the public card
select pg_temp.as_user('uE3');
insert into r(step, ok, info)
select 'every employee sees the winner: name, rank, department, reason, citation',
  count(*) = 1 and bool_and(name_ar = 'موظف ١' and job_title = 'عريف' and department_ar = 'قسم اختبار أ'
    and reason like 'أنهى مشروع%' and citation = 'قدوة في الالتزام'),
  string_agg(name_en || ' / ' || coalesce(job_title, '-'), ',')
from public.ideal_employee_winners where employee_id = pg_temp.id('E1');
reset role;
set local role anon;
do $$ declare v int; begin
  select count(*) into v from public.ideal_employee_winners;
  insert into r(step, ok, info) values ('signed-out visitors see nothing', false, v::text);
exception when others then insert into r(step, ok, info) values ('signed-out visitors see nothing', true, sqlerrm); end $$;
reset role;

-- ---------------------------------------------------------------- notifications and audit
insert into r(step, ok, info)
select 'every test employee got one notification', count(*) = 7 and count(distinct employee_id) = 7, count(*)::text
from public.notifications
where kind = 'ideal_employee' and employee_id in (select v from ids where k in ('S','S2','E1','E2','E3','H','AD'));
insert into r(step, ok, info)
select 'the winner gets the congratulation text', title_ar like 'مبروك!%' and body_ar like 'موظف ١ — قسم اختبار أ', title_ar
from public.notifications where kind = 'ideal_employee' and employee_id = pg_temp.id('E1');
insert into r(step, ok, info)
select 'the others get the announcement', title_ar like 'الموظف المثالي لشهر %', title_ar
from public.notifications where kind = 'ideal_employee' and employee_id = pg_temp.id('E2');
insert into r(step, ok, info)
select 'nominations and the approval are in the audit log', count(distinct table_name) = 2, string_agg(distinct table_name, ',')
from public.audit_log
where table_name in ('ideal_employee_nominations', 'ideal_employee_winners')
  and (new_data ->> 'department_id' = pg_temp.id('A')::text or new_data ->> 'employee_id' = pg_temp.id('E1')::text);

select n, step, ok, info from r order by n;
rollback;
