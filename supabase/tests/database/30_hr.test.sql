-- HR (799813): reads records and consents, gives the final approval, never sees face data, phones or the audit log.
begin;
select plan(13);
select tests.fixture();
select tests.as_user(799813);

select is(tests.rows('select 1 from public.employees'), 7::bigint, 'reads every employee record');
select is(tests.rows('select 1 from public.consents'), 6::bigint, 'reads every consent');
select is(tests.rows('select 1 from public.devices'), 1::bigint, 'sees only their own phone');
select is(tests.rows('select 1 from public.audit_log'), 0::bigint, 'cannot read the audit log');
select is(tests.rows('select 1 from public.face_templates'), 0::bigint, 'cannot read face templates');
select throws_ok('select embedding from public.face_templates', '42501', null, 'the face embedding column is closed to HR');
select is(tests.rows($q$select 1 from storage.objects where bucket_id = 'punch-photos'$q$), 0::bigint, 'cannot open punch photos (supervisor and admin only)');
select is(tests.rows($q$select 1 from storage.objects where bucket_id = 'face-enrollment-photos'$q$), 0::bigint, 'cannot open enrollment photos');

select results_eq('select file_number from public.approval_inbox() order by 1', array[799801],
  'HR queue: only the request the supervisor already approved');
select throws_ok($q$select public.decide_request(
  (select id from public.requests where employee_id = tests.eid(799802) and status = 'pending_supervisor'), true, null)$q$,
  '42501', 'not_allowed', 'cannot skip the supervisor step');
select is(public.decide_request(
  (select id from public.requests where employee_id = tests.eid(799801) and status = 'pending_hr'), true, null),
  'approved'::public.request_status, 'gives the final approval');

select throws_ok($q$insert into public.sites (name_ar, name_en, latitude, longitude) values ('م', 'Test site 2', 29, 47)$q$,
  '42501', null, 'cannot add a site');
update public.employees set role = 'admin' where file_number = 799813;
select tests.as_owner();
select is((select role::text from public.employees where file_number = 799813), 'hr', 'cannot make themself admin');

select * from finish();
rollback;
