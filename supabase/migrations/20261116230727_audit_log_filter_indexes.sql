-- Phase 12a: indexes for the admin audit log screen (/audit-log).
-- Default view (newest first) already uses audit_log_pkey (backward scan on id).
-- These cover the "done by" and "employee concerned" filters, which were full table scans.
-- Indexes only: no audit_log row is changed.

-- Done by: most rows have no user (system / agents), so index only rows with one.
create index if not exists audit_log_actor_idx
  on public.audit_log (actor_user_id, id desc)
  where actor_user_id is not null;

-- Employee concerned: the row itself (employees, employee_sites) ...
create index if not exists audit_log_record_idx
  on public.audit_log (record_id, id desc);

-- ... or a row that names the employee (devices, consents, face_templates, requests, ...).
create index if not exists audit_log_new_employee_idx
  on public.audit_log ((new_data ->> 'employee_id'))
  where (new_data ->> 'employee_id') is not null;

create index if not exists audit_log_old_employee_idx
  on public.audit_log ((old_data ->> 'employee_id'))
  where (old_data ->> 'employee_id') is not null;

analyze public.audit_log;
