-- Phase 11 SQL proofs (emergency module). Run the whole file in the Supabase SQL editor (or execute_sql):
-- everything happens inside one transaction that is ROLLED BACK, so nothing stays in the database.
-- Each row of the final result is one check; every "ok" must be true.
-- Uses the demo data: site 1 (Sharq) with buildings A (danger) and B (safe); employee 719000 (at site 1),
-- supervisor 710018, HR 792000 (not at site 1), admin 735043.
begin;
create temp table r(n serial, step text, ok boolean, info text);
grant all on r to authenticated; grant usage on sequence r_n_seq to authenticated;

-- Stand-in for Phase 9's queue (only if Phase 9 is not deployed yet), to prove the push wiring.
do $$ begin
  if to_regprocedure('private.enqueue_notification(uuid,text,jsonb,text,text)') is null then
    create table private.t_q(employee uuid, kind text, data jsonb, dedupe text, priority text);
    create function private.enqueue_notification(p_employee uuid, p_kind text, p_data jsonb, p_dedupe text, p_priority text default 'normal')
      returns uuid language sql security definer set search_path = '' as
      $f$ insert into private.t_q values (p_employee, p_kind, p_data, p_dedupe, p_priority); select gen_random_uuid() $f$;
  end if;
end $$;

-- A check-in at site 1 for 719000, for the "present" target mode.
insert into public.attendance_punches(employee_id, punch_type, punched_at, shift_date, site_id, latitude, longitude, result, is_demo)
select id, 'check_in', now() - interval '1 hour', current_date, 'c4fbdadd-e030-42d1-b586-f8463c307497', 29.379, 47.989, 'accepted', true
from public.employees where file_number = 719000;

set local role authenticated;

-- Employee and HR cannot launch; direct table writes are closed.
select set_config('request.jwt.claims', '{"sub":"efafda2f-6d60-4a9b-966c-d4776e2d31ee","role":"authenticated"}', true);
do $$ begin
  perform public.emergency_launch('c4fbdadd-e030-42d1-b586-f8463c307497','fire',array['01c7a35f-11f2-406d-8eb5-b8a06b98d02e']::uuid[],'d5722436-e6ad-4c7e-af0c-148394277c57','site');
  insert into r(step,ok,info) values ('employee cannot launch', false, 'launched!');
exception when others then insert into r(step,ok,info) values ('employee cannot launch', sqlerrm='not_allowed', sqlerrm); end $$;
do $$ begin
  insert into public.emergencies(site_id,hazard) values ('c4fbdadd-e030-42d1-b586-f8463c307497','fire');
  insert into r(step,ok,info) values ('employee direct insert blocked', false, 'inserted!');
exception when others then insert into r(step,ok,info) values ('employee direct insert blocked', true, sqlerrm); end $$;
select set_config('request.jwt.claims', '{"sub":"8b32f5dd-d2da-4eb3-a3fd-de59ee4f7a0a","role":"authenticated"}', true);
do $$ begin
  perform public.emergency_launch('c4fbdadd-e030-42d1-b586-f8463c307497','fire',array['01c7a35f-11f2-406d-8eb5-b8a06b98d02e']::uuid[],'d5722436-e6ad-4c7e-af0c-148394277c57','site');
  insert into r(step,ok,info) values ('hr cannot launch', false, 'launched!');
exception when others then insert into r(step,ok,info) values ('hr cannot launch', sqlerrm='not_allowed', sqlerrm); end $$;

-- Supervisor: wrong buildings refused; preview; launch; one active per site.
select set_config('request.jwt.claims', '{"sub":"fda10e6b-8260-49b7-9b0a-cdcd9dd9af64","role":"authenticated"}', true);
do $$ begin
  perform public.emergency_launch('c4fbdadd-e030-42d1-b586-f8463c307497','fire',array['d5722436-e6ad-4c7e-af0c-148394277c57']::uuid[],'d5722436-e6ad-4c7e-af0c-148394277c57','site');
  insert into r(step,ok,info) values ('safe = danger refused', false, 'launched!');
exception when others then insert into r(step,ok,info) values ('safe = danger refused', sqlerrm='invalid_buildings', sqlerrm); end $$;
do $$ begin
  perform public.emergency_launch('c4fbdadd-e030-42d1-b586-f8463c307497','fire',array['01c7a35f-11f2-406d-8eb5-b8a06b98d02e']::uuid[],(select id from public.buildings where site_id='8a01ca35-a293-4fbc-9100-6320bc5f4763' limit 1),'site');
  insert into r(step,ok,info) values ('building of another site refused', false, 'launched!');
exception when others then insert into r(step,ok,info) values ('building of another site refused', sqlerrm='invalid_buildings', sqlerrm); end $$;
do $$ declare v int; begin
  v := public.emergency_preview_targets('c4fbdadd-e030-42d1-b586-f8463c307497','site');
  insert into r(step,ok,info) values ('preview = everyone enabled at the site', v = (select count(*) from public.employee_sites es join public.employees e on e.id=es.employee_id where es.site_id='c4fbdadd-e030-42d1-b586-f8463c307497' and e.is_active), v::text);
end $$;
do $$ declare v int := public.emergency_preview_targets('c4fbdadd-e030-42d1-b586-f8463c307497','present'); begin
  insert into r(step,ok,info) values ('present mode finds the checked-in employee', v >= 1, v::text);
end $$;
do $$ begin
  perform public.emergency_launch('c4fbdadd-e030-42d1-b586-f8463c307497','gas_leak',array['01c7a35f-11f2-406d-8eb5-b8a06b98d02e']::uuid[],'d5722436-e6ad-4c7e-af0c-148394277c57','department');
  insert into r(step,ok,info) values ('department mode needs departments', false, 'launched');
exception when others then insert into r(step,ok,info) values ('department mode needs departments', sqlerrm='departments_required', sqlerrm); end $$;
do $$ declare j jsonb; begin
  j := public.emergency_launch('c4fbdadd-e030-42d1-b586-f8463c307497','fire',array['01c7a35f-11f2-406d-8eb5-b8a06b98d02e']::uuid[],'d5722436-e6ad-4c7e-af0c-148394277c57','site', '{}', 'اخرجوا', null, true);
  perform set_config('test.em', j->>'id', true);
  insert into r(step,ok,info) values ('supervisor launches; push queued for every target', (j->>'targets')::int > 0 and (j->>'push_queued')::int = (j->>'targets')::int, j::text);
end $$;
do $$ begin
  insert into r(step,ok,info) values ('re-send queues nobody twice', public.emergency_resend_push(current_setting('test.em')::uuid) = 0, 'ok');
end $$;
do $$ begin
  perform public.emergency_launch('c4fbdadd-e030-42d1-b586-f8463c307497','gas_leak',array['01c7a35f-11f2-406d-8eb5-b8a06b98d02e']::uuid[],'d5722436-e6ad-4c7e-af0c-148394277c57','site');
  insert into r(step,ok,info) values ('second active emergency at the site refused', false, 'launched!');
exception when others then insert into r(step,ok,info) values ('second active emergency at the site refused', sqlerrm='already_active', sqlerrm); end $$;

-- A non-target cannot respond or see it.
select set_config('request.jwt.claims', '{"sub":"8b32f5dd-d2da-4eb3-a3fd-de59ee4f7a0a","role":"authenticated"}', true);
do $$ begin
  perform public.emergency_respond(current_setting('test.em')::uuid,'arrived',29.3785,47.9896,5);
  insert into r(step,ok,info) values ('non-target cannot respond', false, 'responded!');
exception when others then insert into r(step,ok,info) values ('non-target cannot respond', sqlerrm='not_target', sqlerrm); end $$;
do $$ begin
  insert into r(step,ok,info) values ('non-target has no active emergency', public.my_active_emergency() is null, 'ok');
end $$;

-- The target sees it, responds inside, then outside the safe building; cannot write the table directly.
select set_config('request.jwt.claims', '{"sub":"efafda2f-6d60-4a9b-966c-d4776e2d31ee","role":"authenticated"}', true);
do $$ declare j jsonb := public.my_active_emergency(); begin
  insert into r(step,ok,info) values ('target sees own active emergency with both buildings', j->>'id' = current_setting('test.em') and jsonb_array_length(j->'buildings') = 2, left(j::text, 200));
end $$;
do $$ begin
  insert into r(step,ok,info) values ('employee reads only own rows', (select count(*) from public.emergencies) = 1 and (select count(*) from public.emergency_targets) = 1, 'ok');
end $$;
do $$ declare j jsonb := public.emergency_respond(current_setting('test.em')::uuid,'arrived',29.3785,47.9896,8); begin
  insert into r(step,ok,info) values ('arrived inside the safe building', (j->>'inside_safe')::boolean, j::text);
end $$;
do $$ begin
  insert into public.emergency_responses(emergency_id, employee_id, status) values (current_setting('test.em')::uuid, (select id from public.employees where file_number=719000), 'safe_elsewhere');
  insert into r(step,ok,info) values ('direct response write blocked', false, 'written!');
exception when others then insert into r(step,ok,info) values ('direct response write blocked', true, sqlerrm); end $$;
do $$ declare j jsonb := public.emergency_respond(current_setting('test.em')::uuid,'arrived',29.3794,47.9886,8); begin
  insert into r(step,ok,info) values ('arrived outside the radius is flagged', not (j->>'inside_safe')::boolean and (j->>'distance_m')::numeric > 30, j::text);
end $$;

-- Board (supervisor): counters and the flag. Employee cannot read the board or close.
select set_config('request.jwt.claims', '{"sub":"fda10e6b-8260-49b7-9b0a-cdcd9dd9af64","role":"authenticated"}', true);
do $$ declare j jsonb := public.emergency_board(current_setting('test.em')::uuid); p jsonb; begin
  select x into p from jsonb_array_elements(j->'people') x where (x->>'file_number')::int = 719000;
  insert into r(step,ok,info) values ('board counters correct',
    (select count(*) from jsonb_array_elements(j->'people') x where x->>'status'='arrived') = 1
    and (select count(*) from jsonb_array_elements(j->'people') x where x->>'status'='unknown') = jsonb_array_length(j->'people') - 1
    and (p->>'outside_safe')::boolean, left(p::text, 200));
end $$;
select set_config('request.jwt.claims', '{"sub":"efafda2f-6d60-4a9b-966c-d4776e2d31ee","role":"authenticated"}', true);
do $$ begin
  perform public.emergency_board(current_setting('test.em')::uuid);
  insert into r(step,ok,info) values ('employee cannot read the board', false, 'read!');
exception when others then insert into r(step,ok,info) values ('employee cannot read the board', sqlerrm='not_allowed', sqlerrm); end $$;
do $$ begin
  perform public.emergency_close(current_setting('test.em')::uuid);
  insert into r(step,ok,info) values ('employee cannot close', false, 'closed!');
exception when others then insert into r(step,ok,info) values ('employee cannot close', sqlerrm='not_allowed', sqlerrm); end $$;

-- Admin closes; afterwards no response is accepted and the employee sees nothing.
select set_config('request.jwt.claims', '{"sub":"8c3eb388-436c-4434-822a-251da07ccbc2","role":"authenticated"}', true);
do $$ declare j jsonb := public.emergency_close(current_setting('test.em')::uuid); begin
  insert into r(step,ok,info) values ('admin closes; counts returned', (j->>'arrived')::int = 1 and (j->>'safe_elsewhere')::int = 0, j::text);
end $$;
select set_config('request.jwt.claims', '{"sub":"efafda2f-6d60-4a9b-966c-d4776e2d31ee","role":"authenticated"}', true);
do $$ begin
  perform public.emergency_respond(current_setting('test.em')::uuid,'safe_elsewhere',29.0,47.0,5);
  insert into r(step,ok,info) values ('response after close refused', false, 'responded!');
exception when others then insert into r(step,ok,info) values ('response after close refused', sqlerrm='not_active', sqlerrm); end $$;
do $$ begin
  insert into r(step,ok,info) values ('after close the employee sees no emergency or response',
    public.my_active_emergency() is null and (select count(*) from public.emergencies) = 0 and (select count(*) from public.emergency_responses) = 0, 'ok');
end $$;
reset role;
insert into r(step,ok,info) select 'audit log has launch + close', count(*) = 2, string_agg(action, ',') from public.audit_log where record_id = current_setting('test.em') and action like 'emergency_%';
insert into r(step,ok,info) select 'location stored only on the one response', count(*) = 1, max(latitude)::text from public.emergency_responses where emergency_id = current_setting('test.em')::uuid;
select n, step, ok, left(info, 200) info from r order by n;
rollback;
