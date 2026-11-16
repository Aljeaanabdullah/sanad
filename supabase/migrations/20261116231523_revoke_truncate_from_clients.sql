-- Phase 12 security review: TRUNCATE skips row level security, and the apps never use it
-- (the Data API cannot even send it). Supabase's default grants gave it to anon and authenticated
-- on every table. Remove it so RLS is the only way in. Reads and writes the apps use are unchanged.
-- Bonus tables (leaves, penalties, bonus_lists, agent_log) are left for the agents project to decide.
revoke truncate on table
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
