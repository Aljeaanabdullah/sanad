-- Employee (799801, department Ops): sees only their own data and cannot write what the server owns.
begin;
select plan(27);
select tests.fixture();
select tests.as_user(799801);

select is(tests.rows('select 1 from public.employees'), 1::bigint, 'sees only their own employee row');
select is(tests.rows('select 1 from public.employees where file_number = 799801'), 1::bigint, '... and it is their own');
select is(tests.rows('select 1 from public.attendance_punches'), 1::bigint, 'sees only their own punch');
select is(tests.rows($q$select 1 from public.attendance_punches where employee_id <> tests.eid(799801)$q$), 0::bigint, 'no punch of another employee');
select is(tests.rows('select 1 from public.requests'), 2::bigint, 'sees only their own two requests');
select is(tests.rows('select 1 from public.notifications'), 1::bigint, 'sees only their own notification');
select is(tests.rows('select 1 from public.devices'), 1::bigint, 'sees only their own phone');
select is(tests.rows('select 1 from public.consents'), 1::bigint, 'sees only their own consent');
select is(tests.rows('select 1 from public.leaves'), 1::bigint, 'sees only their own leave');
select is(tests.rows('select 1 from public.penalties'), 1::bigint, 'sees only their own penalty');
select is(tests.rows($q$select 1 from public.departments where name_en like 'Test %'$q$), 2::bigint, 'can read the organisation (departments)');
select is(tests.rows('select 1 from public.emergencies'), 1::bigint, 'sees the active emergency that targets them');

select is(tests.rows('select 1 from public.audit_log'), 0::bigint, 'cannot read the audit log');
select is(tests.rows('select 1 from public.face_templates'), 0::bigint, 'cannot read face templates (not even their own)');
select is(tests.rows('select 1 from public.assistant_log'), 0::bigint, 'cannot read the assistant log');
select is(tests.rows('select 1 from public.punch_security_settings'), 0::bigint, 'cannot read punch security settings');
select is(tests.rows($q$select 1 from storage.objects where bucket_id = 'punch-photos'$q$), 0::bigint, 'cannot open punch photos (not even their own)');
select is(tests.rows($q$select 1 from storage.objects where bucket_id = 'face-enrollment-photos'$q$), 0::bigint, 'cannot open enrollment photos');
select is(tests.rows('select 1 from public.approval_inbox()'), 0::bigint, 'has nothing to approve');

select throws_ok($q$insert into public.attendance_punches (employee_id, punch_type, shift_date, result)
  values (tests.eid(799801), 'check_in', current_date, 'accepted')$q$, '42501', null, 'cannot write a punch directly (only the punch function can)');
select throws_ok($q$insert into public.consents (employee_id, consent_version) values (tests.eid(799802), 'test')$q$,
  '42501', null, 'cannot give consent for someone else');
select throws_ok($q$insert into public.requests (employee_id, request_type, status, shift_date, reason)
  values (tests.eid(799802), 'leave', 'pending_supervisor', current_date, 'باسم غيري')$q$, '42501', null, 'cannot file a request for someone else');
select throws_ok($q$insert into public.requests (employee_id, request_type, status, shift_date, reason)
  values (tests.eid(799801), 'leave', 'approved', current_date, 'موافقة ذاتية')$q$, '42501', null, 'cannot file a request that is already approved');
select throws_ok($q$select public.decide_request(
  (select id from public.requests where employee_id = tests.eid(799801) and status = 'pending_supervisor'), true, null)$q$,
  '42501', 'not_allowed', 'cannot approve their own request');

update public.employees set role = 'admin' where file_number = 799801;
delete from public.employees where file_number = 799802;
select tests.as_owner();
select is((select role::text from public.employees where file_number = 799801), 'employee', 'cannot make themself admin');
select is((select count(*) from public.employees where file_number = 799802), 1::bigint, 'cannot delete another employee');

-- 799802 (IT) is not a target of the emergency.
select tests.as_user(799802);
select is(tests.rows('select 1 from public.emergencies'), 0::bigint, 'an employee who is not a target does not see the emergency');

select * from finish();
rollback;
