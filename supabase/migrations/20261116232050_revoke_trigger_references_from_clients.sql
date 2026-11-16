-- Phase 12 security review (follows revoke_truncate_from_clients): TRIGGER and REFERENCES are never
-- needed by the apps (clients cannot create triggers or tables), so remove these default grants too.
-- Same 23 tables; bonus tables and tables of phases still in progress are left out.
revoke trigger, references on table
  public.assistant_log,
  public.attendance_days,
  public.attendance_punches,
  public.audit_log,
  public.buildings,
  public.consents,
  public.departments,
  public.device_challenges,
  public.devices,
  public.emergencies,
  public.emergency_buildings,
  public.emergency_responses,
  public.emergency_targets,
  public.employee_sites,
  public.employees,
  public.face_templates,
  public.notifications,
  public.public_holidays,
  public.punch_security_settings,
  public.request_approvals,
  public.requests,
  public.sites,
  public.work_patterns
from anon, authenticated;
