// Every server call the app makes. Data is protected by RLS / SECURITY DEFINER RPCs on Supabase.
import type { DashboardData } from '../sanad/dashboard';
import { kuwaitTime, ymd } from './dates';
import { supabase } from './supabase';

/** A refusal with a code that has a text in strings.json (`req_error_<code>`). */
export class RequestError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

const KNOWN = [
  'correction_too_old', 'time_in_future', 'no_shift_that_day', 'time_outside_shift', 'check_in_first',
  'duplicate_request', 'mission_date_out_of_range', 'site_not_found', 'site_already_enabled', 'reason_required',
  'cannot_cancel', 'not_allowed', 'note_too_long', 'leave_dates_invalid', 'leave_dates_out_of_range',
  'leave_overlaps', 'leave_period_locked', 'invalid_request',
];

function fail(message: string | undefined): never {
  throw new RequestError(KNOWN.find((k) => message?.includes(k)) ?? 'generic');
}

async function myEmployeeId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: me } = await supabase.from('employees').select('id').eq('user_id', data.user.id).single();
  return me?.id ?? null;
}

// ------------------------------------------------------------------ shift and punches
export type ShiftInfo = {
  start: Date;
  end: Date;
  checkinOpens: Date;
  arrival: 'pending' | 'on_time' | 'late' | 'absent';
  departure: 'pending' | 'done' | 'missing' | 'not_applicable';
  lateMinutes: number;
};
export const checkedIn = (s: ShiftInfo) => s.arrival === 'on_time' || s.arrival === 'late';
export const checkedOut = (s: ShiftInfo) => s.departure === 'done';

export async function currentShift(): Promise<ShiftInfo | null> {
  const { data, error } = await supabase.rpc('my_shift_now');
  if (error) throw error;
  const r = (data as Record<string, string | number>[] | null)?.[0];
  if (!r) return null;
  return {
    start: new Date(r.shift_start as string),
    end: new Date(r.shift_end as string),
    checkinOpens: new Date(r.checkin_opens as string),
    arrival: r.arrival as ShiftInfo['arrival'],
    departure: r.departure as ShiftInfo['departure'],
    lateMinutes: Number(r.late_minutes ?? 0),
  };
}

export type PunchEntry = { type: 'check_in' | 'check_out'; at: Date; accepted: boolean; reason: string | null };

export async function todayPunches(): Promise<PunchEntry[]> {
  const me = await myEmployeeId();
  if (!me) return [];
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from('attendance_punches')
    .select('punch_type, punched_at, result, reject_reason')
    .eq('employee_id', me)
    .gte('punched_at', since)
    .order('punched_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    type: r.punch_type,
    at: new Date(r.punched_at),
    accepted: r.result === 'accepted',
    reason: r.reject_reason,
  }));
}

// ------------------------------------------------------------------ dashboard / notifications
export async function loadDashboard(employeeId?: string | null, month?: string | null): Promise<DashboardData> {
  const { data, error } = await supabase.rpc('employee_dashboard', { p_employee: employeeId ?? null, p_month: month ?? null });
  if (error) {
    if (error.code === '42501') throw new RequestError('not_allowed');
    if (error.code === 'P0002') throw new RequestError('not_found');
    throw new RequestError('generic');
  }
  return data as DashboardData;
}

/** One row of public.notifications (Phase 9: also the push outbox). Texts are stored in both languages. */
export type Notice = {
  kind: string;
  at: Date;
  data: Record<string, unknown>;
  id?: string;
  readAt?: Date | null;
  title?: { ar: string; en: string };
  body?: { ar: string | null; en: string | null };
};

type NoticeRow = {
  id: string; kind: string; at: string; data: Record<string, unknown> | null; read_at: string | null;
  title_ar: string; title_en: string; body_ar: string | null; body_en: string | null;
};

export async function myNotifications(): Promise<Notice[]> {
  const { data, error } = await supabase.rpc('my_notifications', { p_limit: 60 });
  if (error) throw error;
  return ((data ?? []) as NoticeRow[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    at: new Date(r.at),
    data: r.data ?? {},
    readAt: r.read_at ? new Date(r.read_at) : null,
    title: { ar: r.title_ar, en: r.title_en },
    body: { ar: r.body_ar, en: r.body_en },
  }));
}

/** Marks mine as read: these ids, or all of them (null). */
export async function markNotificationsRead(ids: string[] | null): Promise<number> {
  const { data, error } = await supabase.rpc('mark_notifications_read', { p_ids: ids });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function unreadNotificationCount(): Promise<number> {
  const { data, error } = await supabase.rpc('unread_notification_count');
  if (error) throw error;
  return Number(data ?? 0);
}

// ------------------------------------------------------------------ attendance history
export type DayRecord = {
  day: string; // YYYY-MM-DD
  kind: 'work' | 'continued' | 'holiday' | 'off' | 'before_hire';
  shiftStart: Date | null;
  shiftEnd: Date | null;
  arrival: 'pending' | 'on_time' | 'late' | 'absent' | null;
  departure: 'pending' | 'done' | 'missing' | 'not_applicable' | null;
  checkIn: Date | null;
  checkOut: Date | null;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  checkInCorrected: boolean;
  checkOutCorrected: boolean;
};

export async function attendanceHistory(employeeId: string, from: Date, to: Date): Promise<DayRecord[]> {
  const { data, error } = await supabase.rpc('attendance_history', { p_employee: employeeId, p_from: ymd(from), p_to: ymd(to) });
  if (error) fail(error.message);
  const t = (v: unknown) => (v ? new Date(v as string) : null);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    day: r.day as string,
    kind: r.kind as DayRecord['kind'],
    shiftStart: t(r.shift_start),
    shiftEnd: t(r.shift_end),
    arrival: (r.arrival as DayRecord['arrival']) ?? null,
    departure: (r.departure as DayRecord['departure']) ?? null,
    checkIn: t(r.check_in_at),
    checkOut: t(r.check_out_at),
    lateMinutes: Number(r.late_minutes ?? 0),
    earlyLeaveMinutes: Number(r.early_leave_minutes ?? 0),
    checkInCorrected: r.check_in_corrected === true,
    checkOutCorrected: r.check_out_corrected === true,
  }));
}

// ------------------------------------------------------------------ requests
export type RequestType = 'punch_correction' | 'external_mission' | 'leave';
export type RequestStatus = 'pending_supervisor' | 'pending_hr' | 'approved' | 'rejected' | 'cancelled';

export type RequestItem = {
  id: string;
  type: RequestType;
  status: RequestStatus;
  shiftDate: string; // first day for a leave
  reason: string;
  createdAt: Date;
  punchType: 'check_in' | 'check_out' | null;
  time: Date | null;
  siteAr: string | null;
  siteEn: string | null;
  leaveType: string | null;
  leaveTo: string | null;
  // In the approvals inbox only:
  employeeNameAr?: string;
  employeeNameEn?: string;
  fileNumber?: number;
  departmentAr?: string | null;
  departmentEn?: string | null;
};
export const isPending = (r: RequestItem) => r.status === 'pending_supervisor' || r.status === 'pending_hr';

/** Leave types an employee can request (stored in Arabic, as in the `leaves` table). */
export const LEAVE_TYPES = ['إجازة دورية', 'إجازة مرضية', 'إجازة طارئة', 'إجازة بدون راتب'] as const;

function toItem(r: Record<string, unknown>): RequestItem {
  const site = r.sites as { name_ar?: string; name_en?: string } | null;
  return {
    id: r.id as string,
    type: r.request_type as RequestType,
    status: r.status as RequestStatus,
    shiftDate: r.shift_date as string,
    reason: r.reason as string,
    createdAt: new Date(r.created_at as string),
    punchType: (r.corrected_punch_type as RequestItem['punchType']) ?? null,
    time: r.corrected_time ? new Date(r.corrected_time as string) : null,
    siteAr: (site?.name_ar ?? (r.site_ar as string | null)) ?? null,
    siteEn: (site?.name_en ?? (r.site_en as string | null)) ?? null,
    leaveType: (r.leave_type as string | null) ?? null,
    leaveTo: (r.leave_to as string | null) ?? null,
    employeeNameAr: r.full_name_ar as string | undefined,
    employeeNameEn: r.full_name_en as string | undefined,
    fileNumber: r.file_number as number | undefined,
    departmentAr: r.department_ar as string | null | undefined,
    departmentEn: r.department_en as string | null | undefined,
  };
}

export async function myRequests(): Promise<RequestItem[]> {
  const me = await myEmployeeId();
  if (!me) return [];
  const { data, error } = await supabase
    .from('requests')
    .select('id, request_type, status, shift_date, corrected_punch_type, corrected_time, reason, created_at, leave_type, leave_to, sites(name_ar, name_en)')
    .eq('employee_id', me)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) fail(error.message);
  return (data ?? []).map((r) => toItem(r as Record<string, unknown>));
}

export async function submitCorrection(p: { shiftDate: Date; punchType: 'check_in' | 'check_out'; time: Date; reason: string }) {
  const { data, error } = await supabase.rpc('submit_request', {
    p_type: 'punch_correction',
    p_shift_date: ymd(p.shiftDate),
    p_reason: p.reason,
    p_punch_type: p.punchType,
    p_time: p.time.toISOString(),
  });
  if (error) fail(error.message);
  return data as string;
}

export async function submitMission(p: { date: Date; siteId: string; reason: string }) {
  const { data, error } = await supabase.rpc('submit_request', {
    p_type: 'external_mission',
    p_shift_date: ymd(p.date),
    p_reason: p.reason,
    p_site: p.siteId,
  });
  if (error) fail(error.message);
  return data as string;
}

export async function submitLeave(p: { leaveType: string; from: Date; to: Date; reason: string }) {
  const { data, error } = await supabase.rpc('submit_leave_request', {
    p_leave_type: p.leaveType,
    p_from: ymd(p.from),
    p_to: ymd(p.to),
    p_reason: p.reason,
  });
  if (error) fail(error.message);
  return data as string;
}

export async function cancelRequest(id: string) {
  const { error } = await supabase.rpc('cancel_request', { p_request: id });
  if (error) fail(error.message);
}

export type TimelineEntry = {
  stage: 'supervisor' | 'hr';
  decision: 'approved' | 'rejected';
  at: Date;
  note: string | null;
  nameAr: string | null;
  nameEn: string | null;
};

export async function requestTimeline(id: string): Promise<TimelineEntry[]> {
  const { data, error } = await supabase.rpc('request_timeline', { p_request: id });
  if (error) fail(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    stage: r.stage as TimelineEntry['stage'],
    decision: r.decision as TimelineEntry['decision'],
    at: new Date(r.decided_at as string),
    note: (r.note as string | null) ?? null,
    nameAr: (r.approver_ar as string | null) ?? null,
    nameEn: (r.approver_en as string | null) ?? null,
  }));
}

export type SiteOption = { id: string; nameAr: string; nameEn: string };

/** Active sites NOT already enabled for me (external missions are for other sites). */
export async function missionSites(): Promise<SiteOption[]> {
  const me = await myEmployeeId();
  const [{ data: sites }, { data: mine }] = await Promise.all([
    supabase.from('sites').select('id, name_ar, name_en').eq('is_active', true).order('name_ar'),
    me ? supabase.from('employee_sites').select('site_id').eq('employee_id', me) : Promise.resolve({ data: [] }),
  ]);
  const enabled = new Set(((mine ?? []) as { site_id: string }[]).map((x) => x.site_id));
  return ((sites ?? []) as { id: string; name_ar: string; name_en: string }[])
    .filter((s) => !enabled.has(s.id))
    .map((s) => ({ id: s.id, nameAr: s.name_ar, nameEn: s.name_en }));
}

// ------------------------------------------------------------------ supervisor / HR / admin
export async function approvalInbox(): Promise<RequestItem[]> {
  const { data, error } = await supabase.rpc('approval_inbox');
  if (error) fail(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(toItem);
}

export async function decideRequest(id: string, approve: boolean, note?: string) {
  const { data, error } = await supabase.rpc('decide_request', { p_request: id, p_approve: approve, p_note: note || null });
  if (error) fail(error.message);
  return data as RequestStatus;
}

export type EmployeeRef = { id: string; fileNumber: number; nameAr: string; nameEn: string };

export async function findEmployee(fileNumber: number): Promise<EmployeeRef | null> {
  const { data } = await supabase
    .from('employees')
    .select('id, file_number, full_name_ar, full_name_en')
    .eq('file_number', fileNumber)
    .maybeSingle();
  return data ? { id: data.id, fileNumber: data.file_number, nameAr: data.full_name_ar, nameEn: data.full_name_en } : null;
}

export type PunchRow = {
  at: Date;
  type: 'check_in' | 'check_out';
  accepted: boolean;
  reason: string | null;
  corrected: boolean;
  siteAr: string | null;
  siteEn: string | null;
  photoUrl: string | null;
};

/** Punches of one employee between two calendar days (Kuwait days, inclusive);
 * review photos only for supervisors and the system admin (PRD 4.4). */
export async function punches(employeeId: string, fromDay: Date, toDay: Date, withPhotos: boolean): Promise<PunchRow[]> {
  const from = kuwaitTime(fromDay, 0, 0);
  const to = kuwaitTime(new Date(toDay.getFullYear(), toDay.getMonth(), toDay.getDate() + 1), 0, 0);
  const { data, error } = await supabase
    .from('attendance_punches')
    .select('punched_at, punch_type, result, reject_reason, source, photo_path, sites(name_ar, name_en)')
    .eq('employee_id', employeeId)
    .gte('punched_at', from.toISOString())
    .lt('punched_at', to.toISOString())
    .order('punched_at', { ascending: false });
  if (error) fail(error.message);
  const rows = (data ?? []) as Record<string, unknown>[];
  const paths = withPhotos ? rows.map((r) => r.photo_path as string | null).filter((p): p is string => !!p) : [];
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await supabase.storage.from('punch-photos').createSignedUrls(paths, 300);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  return rows.map((r) => {
    const site = r.sites as { name_ar?: string; name_en?: string } | null;
    return {
      at: new Date(r.punched_at as string),
      type: r.punch_type as PunchRow['type'],
      accepted: r.result === 'accepted',
      reason: (r.reject_reason as string | null) ?? null,
      corrected: r.source === 'correction',
      siteAr: site?.name_ar ?? null,
      siteEn: site?.name_en ?? null,
      photoUrl: r.photo_path ? urls.get(r.photo_path as string) ?? null : null,
    };
  });
}
