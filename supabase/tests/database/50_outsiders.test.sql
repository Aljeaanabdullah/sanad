-- Outsiders: an anonymous visitor, a signed-up stranger with no employee record, and a deactivated employee.
begin;
select plan(19);
select tests.fixture();

select tests.as_anon();
select is(tests.rows('select 1 from public.employees'), 0::bigint, 'anonymous: no employees');
select is(tests.rows('select 1 from public.attendance_punches'), 0::bigint, 'anonymous: no punches');
select is(tests.rows('select 1 from public.requests'), 0::bigint, 'anonymous: no requests');
select is(tests.rows('select 1 from public.departments'), 0::bigint, 'anonymous: no departments (agents need their key)');
select is(tests.rows('select 1 from public.sites'), 0::bigint, 'anonymous: no sites or geofences');
select is(tests.rows($q$select 1 from storage.objects$q$), 0::bigint, 'anonymous: no stored photos');
select throws_ok('select * from public.approval_inbox()', '42501', null, 'anonymous: cannot call the approval queue');
-- Without an agent key, the anon role cannot change or remove bonus-module rows (RLS has no anon update policy there).
update public.leaves set note = 'x';
update public.penalties set reason = 'x';
select throws_ok('delete from public.employees', '42501', null, 'anonymous: cannot delete employees');
select tests.as_owner();
select is((select count(*) from public.leaves where note = 'x'), 0::bigint, 'anonymous: changed no leave');
select is((select count(*) from public.penalties where reason = 'x'), 0::bigint, 'anonymous: changed no penalty');

-- Sign-up is open on Supabase Auth: a stranger with a login but no employee record must see nothing.
select tests.as_user(799899);
select is(tests.rows('select 1 from public.employees'), 0::bigint, 'stranger: no employees');
select is(tests.rows('select 1 from public.sites'), 0::bigint, 'stranger: no sites or geofences');
select is(tests.rows('select 1 from public.departments'), 0::bigint, 'stranger: no departments');
select is(tests.rows('select 1 from public.attendance_punches'), 0::bigint, 'stranger: no punches');
select is(tests.rows('select 1 from public.approval_inbox()'), 0::bigint, 'stranger: nothing to approve');

-- A deactivated employee keeps nothing but their own row.
select tests.as_user(799815);
select is(tests.rows('select 1 from public.sites'), 0::bigint, 'deactivated: no sites');
select is(tests.rows('select 1 from public.requests'), 0::bigint, 'deactivated: no requests');
select is(tests.rows('select 1 from public.emergencies'), 0::bigint, 'deactivated: no emergencies');
select throws_ok($q$select public.submit_request('external_mission', current_date, 'مهمة بعد الإيقاف', null, null,
  '00000000-0000-4000-b000-000000000001')$q$, '42501', 'not_allowed', 'deactivated: cannot file a request');

select * from finish();
rollback;
