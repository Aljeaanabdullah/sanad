-- Phase 12a: "employee concerned" filter of the admin audit log screen.
-- Rows about an employee name them either in record_id (employees, employee_sites) or in
-- new_data / old_data ->> 'employee_id' (devices, consents, face_templates, requests, ...).
-- Under RLS, Postgres cannot use the jsonb expression indexes (->> is not leakproof), so a
-- plain query is a full table scan. This admin-only function runs the same filter as the
-- table owner, so the indexes are used. It reads only; audit_log stays append-only.

create or replace function public.audit_log_about(p_employee_ids uuid[])
returns setof public.audit_log
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ids text[] := (select array_agg(x::text) from unnest(p_employee_ids) x);
begin
  if not private.has_role(array['admin']::public.app_role[]) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_ids is null or cardinality(v_ids) = 0 or cardinality(v_ids) > 50 then
    return;
  end if;
  return query
    select a.* from public.audit_log a where a.record_id = any (v_ids)
    union
    select a.* from public.audit_log a where (a.new_data ->> 'employee_id') = any (v_ids)
    union
    select a.* from public.audit_log a where (a.old_data ->> 'employee_id') = any (v_ids);
end;
$$;

revoke all on function public.audit_log_about(uuid[]) from public, anon;
grant execute on function public.audit_log_about(uuid[]) to authenticated;
