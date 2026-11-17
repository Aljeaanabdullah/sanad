-- Supervisor (799811 = Ops, 799812 = IT). PRD 2: a supervisor reads ANY employee's punches and records,
-- but the approval queue and decisions are limited to their OWN department.
begin;
select plan(20);
select tests.fixture();
select tests.as_user(799811);

select is(tests.rows('select 1 from public.employees'), 7::bigint, 'reads every employee record (PRD 2)');
select is(tests.rows('select 1 from public.attendance_punches'), 6::bigint, 'reads every employee''s punches (PRD 2 note)');
select is(tests.rows($q$select 1 from storage.objects where bucket_id = 'punch-photos'$q$), 1::bigint, 'can open punch photos (review, PRD 4.6)');
select is(tests.rows($q$select 1 from storage.objects where bucket_id = 'face-enrollment-photos'$q$), 0::bigint, 'cannot open enrollment photos (admin only)');
select is(tests.rows('select 1 from public.devices'), 1::bigint, 'sees only their own phone, not other employees'' phones');
select is(tests.rows('select 1 from public.consents'), 1::bigint, 'sees only their own consent (HR and admin read consents)');
select is(tests.rows('select 1 from public.notifications'), 1::bigint, 'sees only their own notifications');
select is(tests.rows('select 1 from public.audit_log'), 0::bigint, 'cannot read the audit log');
select is(tests.rows('select 1 from public.face_templates'), 0::bigint, 'cannot read face templates');

-- Department scope.
select results_eq(
  'select file_number from public.approval_inbox() order by 1',
  array[799801],
  'Ops supervisor''s approval queue: only the Ops employee (no IT request, not their own request)');
select throws_ok($q$select public.decide_request(
  (select id from public.requests where employee_id = tests.eid(799802) and status = 'pending_supervisor'), true, null)$q$,
  '42501', 'not_allowed', 'cannot approve a request from another department');
select throws_ok($q$select public.decide_request(
  (select id from public.requests where employee_id = tests.eid(799801) and status = 'pending_hr'), true, null)$q$,
  '42501', 'not_allowed', 'cannot give the HR (final) approval');
select throws_ok($q$select public.decide_request(
  (select id from public.requests where employee_id = tests.eid(799811) and status = 'pending_supervisor'), true, null)$q$,
  '42501', 'not_allowed', 'cannot approve their own request');
select is(public.decide_request(
  (select id from public.requests where employee_id = tests.eid(799801) and status = 'pending_supervisor'), true, 'تمام'),
  'pending_hr'::public.request_status, 'approves an Ops request: it then waits for HR');

select tests.as_user(799812);
select results_eq(
  'select file_number from public.approval_inbox() order by 1',
  array[799802],
  'IT supervisor''s approval queue: only the IT employee');
select throws_ok($q$select public.decide_request(
  (select id from public.requests where employee_id = tests.eid(799801) and shift_date = current_date + 1), false, null)$q$,
  '42501', 'not_allowed', 'IT supervisor cannot reject an Ops request either');

select throws_ok($q$insert into public.departments (name_ar, name_en) values ('قسم', 'Test new')$q$, '42501', null,
  'cannot add a department');
update public.employees set role = 'admin' where file_number = 799812;
update public.employees set department_id = null where file_number = 799802;
select tests.as_owner();
select is((select role::text from public.employees where file_number = 799812), 'supervisor', 'cannot make themself admin');
select isnt((select department_id from public.employees where file_number = 799802), null, 'cannot move an employee out of a department');
select is((select count(*) from public.request_approvals where approver_id = tests.eid(799812)), 0::bigint,
  'no decision was recorded for the IT supervisor');

select * from finish();
rollback;
