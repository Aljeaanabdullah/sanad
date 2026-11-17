-- Admin (799814): manages the organisation and accounts, reads the audit log; even admin never reads face embeddings.
begin;
select plan(13);
select tests.fixture();
select tests.as_user(799814);

select is(tests.rows('select 1 from public.employees'), 7::bigint, 'reads every employee record');
select is(tests.rows('select 1 from public.devices'), 6::bigint, 'reads every bound phone (to unbind)');
select is(tests.rows($q$select 1 from public.audit_log where action = 'TEST'$q$), 1::bigint, 'reads the audit log');
select is(tests.rows('select id, employee_id, model_version from public.face_templates'), 1::bigint, 'sees that a face is enrolled');
select throws_ok('select embedding from public.face_templates', '42501', null, 'the face embedding column is closed even to admin');
select is(tests.rows($q$select 1 from storage.objects where bucket_id = 'face-enrollment-photos'$q$), 1::bigint, 'can open enrollment photos (admin only)');
select is(tests.rows($q$select 1 from storage.objects where bucket_id = 'punch-photos'$q$), 1::bigint, 'can open punch photos');

-- First approval falls to the admin only when the department has no (other) supervisor (PRD 7).
select results_eq('select file_number from public.approval_inbox() order by 1', array[799811, 799812, 799813],
  'admin queue: the two supervisors'' own requests and HR''s request (no department) - not the departments'' employees');
select throws_ok($q$select public.decide_request(
  (select id from public.requests where employee_id = tests.eid(799801) and status = 'pending_supervisor'), true, null)$q$,
  '42501', 'not_allowed', 'cannot take over a department supervisor''s approval');

select lives_ok($q$insert into public.departments (name_ar, name_en) values ('قسم جديد', 'Test new')$q$, 'can add a department');
update public.employees set role = 'hr' where file_number = 799802;
select throws_ok($q$insert into public.face_templates (employee_id, embedding, model_version, source)
  values (tests.eid(799802), array_fill(0.2::real, array[128])::extensions.vector, 'test', 'web')$q$,
  '42501', null, 'cannot write a face template directly (only the enrollment function can)');
select throws_ok($q$insert into public.attendance_punches (employee_id, punch_type, shift_date, result)
  values (tests.eid(799802), 'check_in', current_date, 'accepted')$q$, '42501', null, 'cannot write a punch directly');
select tests.as_owner();
select is((select role::text from public.employees where file_number = 799802), 'hr', 'can change an employee''s role');

select * from finish();
rollback;
