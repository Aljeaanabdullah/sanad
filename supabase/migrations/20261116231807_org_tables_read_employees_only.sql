-- Phase 12 security review: organisation tables were readable by ANY signed-in Supabase user
-- ("using (true)"). Auth sign-up is open on the project (disable_signup = false), so a stranger who
-- signs up with a real e-mail could read site names and geofences, buildings, work patterns,
-- holidays and departments. Now only active employees (any of the 4 roles) can read them.
-- Agents keep their own anon policy on departments; server code uses the service role.
do $m$
declare t text;
begin
  foreach t in array array['buildings', 'departments', 'public_holidays', 'sites', 'work_patterns'] loop
    execute format('drop policy "signed-in users can read" on public.%I', t);
    execute format(
      'create policy "employees can read" on public.%I for select to authenticated
         using ((select private.current_employee_id()) is not null)', t);
  end loop;
end $m$;
