-- Sanad tests: run ONCE on the LOCAL database (`supabase start`) before the tests. Never on the live project.
-- Started by supabase/tests/run-local.sh, which refuses any address that is not 127.0.0.1 / localhost.
--
-- 1. Nothing local may call the live project. Some migrations wake the live edge functions
--    (send-push, purge-punch-photos) with pg_net and a vault secret. Locally the secret is random, so the
--    live function would refuse it anyway, but we cut the calls off completely:
--    - every cron job is removed (the rules engine, push, photo purge and demo autofill do not run here);
--    - the two vault secrets are removed, so private.push_kick() returns early and never calls pg_net.
-- 2. A `tests` schema with helpers for the pgTAP files (supabase/tests/database) and the web smoke tests:
--    tests.fixture() creates a small known world inside the caller's transaction (rolled back by pgTAP),
--    tests.as_user(file_number) / tests.as_anon() / tests.as_service() switch the database role and JWT.

-- Guard: the local stack always has this user/database and never has the agents' service accounts set up.
do $$
begin
  if current_database() <> 'postgres' then
    raise exception 'prepare.sql: unexpected database %', current_database();
  end if;
end $$;

-- ---------------------------------------------------------------- 1. no calls to the live project
do $$
declare j record;
begin
  for j in select jobname from cron.job loop
    perform cron.unschedule(j.jobname);
  end loop;
end $$;
delete from vault.secrets where name in ('send_push_secret', 'punch_photo_purge_secret');

-- ---------------------------------------------------------------- 2. test helpers
create extension if not exists pgtap with schema extensions;

drop schema if exists tests cascade;
create schema tests;
grant usage on schema tests to anon, authenticated, service_role;

-- Fixed ids so the tests can name every row. File numbers 799800-799899 are reserved for these tests
-- (outside the demo range 710000-713499 and the old e2e range 799900-799999).
create function tests.uid(p_file integer) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8000-' || lpad(p_file::text, 12, '0'))::uuid
$$;
create function tests.eid(p_file integer) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-9000-' || lpad(p_file::text, 12, '0'))::uuid
$$;

-- The world:
--   department "Ops" (D1, supervisor 799811) with employee 799801;
--   department "IT"  (D2, supervisor 799812) with employee 799802;
--   HR 799813, admin 799814, an inactive employee 799815 in D1, and a stranger with a login but no employee row (799899).
--   Each employee has a device, a consent, a punch, a pending request, a notification, a leave and a penalty;
--   799801 also has a request waiting for HR, a face template and a punch photo; there is an active emergency
--   that targets 799801 only, and one audit-log row.
create function tests.fixture() returns void language plpgsql as $$
declare
  f integer;
  d1 uuid := '00000000-0000-4000-a000-000000000001';
  d2 uuid := '00000000-0000-4000-a000-000000000002';
  site uuid := '00000000-0000-4000-b000-000000000001';
  emg uuid := '00000000-0000-4000-c000-000000000001';
begin
  foreach f in array array[799801, 799802, 799811, 799812, 799813, 799814, 799815, 799899] loop
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (tests.uid(f), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', f || '@jahez.local', now(), now());
  end loop;

  insert into public.sites (id, name_ar, name_en, latitude, longitude, radius_m)
  values (site, 'موقع اختبار', 'Test site', 29.3759, 47.9774, 200);
  insert into public.departments (id, name_ar, name_en) values (d1, 'قسم العمليات (اختبار)', 'Test Ops'), (d2, 'قسم التقنية (اختبار)', 'Test IT');

  insert into public.employees (id, file_number, user_id, full_name_ar, full_name_en, role, department_id, must_change_password, is_active)
  values
    (tests.eid(799801), 799801, tests.uid(799801), 'موظف العمليات', 'Ops employee', 'employee', d1, false, true),
    (tests.eid(799802), 799802, tests.uid(799802), 'موظف التقنية', 'IT employee', 'employee', d2, false, true),
    (tests.eid(799811), 799811, tests.uid(799811), 'مشرف العمليات', 'Ops supervisor', 'supervisor', d1, false, true),
    (tests.eid(799812), 799812, tests.uid(799812), 'مشرف التقنية', 'IT supervisor', 'supervisor', d2, false, true),
    (tests.eid(799813), 799813, tests.uid(799813), 'موظف الموارد', 'HR officer', 'hr', null, false, true),
    (tests.eid(799814), 799814, tests.uid(799814), 'مدير النظام', 'System admin', 'admin', null, false, true),
    (tests.eid(799815), 799815, tests.uid(799815), 'موظف موقوف', 'Inactive employee', 'employee', d1, false, false);
  update public.departments set supervisor_id = tests.eid(799811) where id = d1;
  update public.departments set supervisor_id = tests.eid(799812) where id = d2;

  foreach f in array array[799801, 799802, 799811, 799812, 799813, 799814] loop
    insert into public.employee_sites (employee_id, site_id) values (tests.eid(f), site);
    insert into public.devices (employee_id, device_identifier, platform) values (tests.eid(f), 'test-device-' || f, 'android');
    insert into public.consents (employee_id, consent_version) values (tests.eid(f), 'test');
    insert into public.attendance_punches (employee_id, punch_type, punched_at, shift_date, result, site_id)
    values (tests.eid(f), 'check_in', now() - interval '2 hours', current_date, 'accepted', site);
    insert into public.requests (employee_id, request_type, status, shift_date, reason, mission_site_id)
    values (tests.eid(f), 'external_mission', 'pending_supervisor', current_date, 'طلب اختبار ' || f, site);
    insert into public.notifications (employee_id, kind, title_ar, title_en, dedupe_key)
    values (tests.eid(f), 'test', 'تنبيه اختبار', 'Test notice', 'test-' || f);
    insert into public.leaves (employee_id, leave_type, from_date, to_date, created_by)
    values (tests.eid(f), 'إجازة دورية', current_date + 30, current_date + 31, 'test');
    insert into public.penalties (employee_id, penalty_type, penalty_date, created_by)
    values (tests.eid(f), 'لفت نظر', current_date, 'test');
  end loop;

  -- 799801: one request already approved by the supervisor (waits for HR), a face template and a punch photo.
  insert into public.requests (employee_id, request_type, status, shift_date, reason, mission_site_id)
  values (tests.eid(799801), 'external_mission', 'pending_hr', current_date + 1, 'طلب ينتظر الموارد', site);
  insert into public.face_templates (employee_id, embedding, model_version, source)
  values (tests.eid(799801), array_fill(0.1::real, array[128])::extensions.vector, 'test', 'web');
  insert into storage.objects (bucket_id, name, owner_id)
  values ('punch-photos', tests.eid(799801) || '/test.jpg', null),
         ('face-enrollment-photos', tests.eid(799801) || '/test.jpg', null);

  insert into public.emergencies (id, site_id, hazard, status, started_by, is_drill)
  values (emg, site, 'fire', 'active', tests.eid(799814), true);
  insert into public.emergency_targets (emergency_id, employee_id) values (emg, tests.eid(799801));

  insert into public.audit_log (actor_user_id, action, table_name, record_id)
  values (tests.uid(799814), 'TEST', 'employees', tests.eid(799801)::text);
end;
$$;

-- Act as a signed-in user (auth.uid() = that user's id). Works only inside a transaction.
create function tests.as_user(p_file integer) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', tests.uid(p_file), 'role', 'authenticated', 'aud', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
create function tests.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end;
$$;
-- Back to the table owner (to look at rows the tests changed).
create function tests.as_owner() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end;
$$;
-- How many rows the CURRENT role sees for a query; "permission denied" counts as 0 rows (nothing visible).
create function tests.rows(p_query text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('select count(*) from (%s) q', p_query) into n;
  return n;
exception when insufficient_privilege then
  return 0;
end;
$$;
grant execute on all functions in schema tests to anon, authenticated, service_role;
