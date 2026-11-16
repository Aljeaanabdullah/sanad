// Pure helpers for the requests group (requests, leave, correction, mission, approvals, lookup,
// month record). No network and no React here, so everything is unit-tested in
// src/lib/__tests__/requests.test.ts. Types are imported type-only so tests never load Supabase.
import type { Role } from './auth';
import type { DayRecord, RequestItem, RequestStatus, RequestType, SiteOption } from './api';
import { kuwaitTime, mediumDate, parseYmd } from './dates';
import { hasKey } from './i18n';

type IconName = string;
type Tone = 'ok' | 'danger' | 'warn' | 'info' | 'neutral';
type Lang = 'ar' | 'en';
type TFn = (key: string, vars?: Record<string, string | number>) => string;

// ------------------------------------------------------------------ roles

/** Supervisors, HR and the system admin decide requests and look up employees (PRD 2, 7.2). */
export const isStaff = (role: Role | null | undefined) => role === 'supervisor' || role === 'hr' || role === 'admin';

/** Punch review photos are for supervisors and the system admin only (PRD 4.4, 4.6). */
export const canSeePhotos = (role: Role | null | undefined) => role === 'supervisor' || role === 'admin';

// ------------------------------------------------------------------ status and type

export function statusView(status: RequestStatus): { tone: Tone; key: string; icon: IconName } {
  switch (status) {
    case 'approved':
      return { tone: 'ok', key: 'status_approved', icon: 'checkmark-circle' };
    case 'rejected':
      return { tone: 'danger', key: 'status_rejected', icon: 'close-circle' };
    case 'cancelled':
      return { tone: 'neutral', key: 'status_cancelled', icon: 'remove-circle' };
    case 'pending_hr':
      return { tone: 'info', key: 'status_pending_hr', icon: 'hourglass-outline' };
    case 'pending_supervisor':
    default:
      return { tone: 'warn', key: 'status_pending_supervisor', icon: 'hourglass-outline' };
  }
}

export function typeIcon(type: RequestType): IconName {
  switch (type) {
    case 'leave':
      return 'airplane-outline';
    case 'external_mission':
      return 'navigate-outline';
    case 'punch_correction':
    default:
      return 'time-outline';
  }
}

export const typeKey = (type: RequestType) => `type_${type}`;

/** Leave types are stored in Arabic (as in the `leaves` table); this is their text key. */
const LEAVE_KEYS: Record<string, string> = {
  'إجازة دورية': 'leave_annual',
  'إجازة مرضية': 'leave_sick',
  'إجازة طارئة': 'leave_emergency',
  'إجازة بدون راتب': 'leave_unpaid',
};

export const leaveTypeKey = (type: string | null | undefined): string | null => (type ? LEAVE_KEYS[type] ?? null : null);

export function leaveTypeLabel(t: TFn, type: string | null | undefined): string {
  const key = leaveTypeKey(type);
  return key ? t(key) : type ?? '—';
}

// ------------------------------------------------------------------ filters

export type RequestFilter = 'all' | 'pending' | 'decided';

export const isPendingStatus = (s: RequestStatus) => s === 'pending_supervisor' || s === 'pending_hr';

export function filterRequests<T extends Pick<RequestItem, 'status'>>(items: T[], filter: RequestFilter): T[] {
  if (filter === 'pending') return items.filter((r) => isPendingStatus(r.status));
  if (filter === 'decided') return items.filter((r) => !isPendingStatus(r.status));
  return items;
}

export function countByFilter(items: Pick<RequestItem, 'status'>[]): Record<RequestFilter, number> {
  const pending = items.filter((r) => isPendingStatus(r.status)).length;
  return { all: items.length, pending, decided: items.length - pending };
}

// ------------------------------------------------------------------ dates

const DAY = 86400000;

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Whole calendar days from a to b (independent of the time of day and daylight saving). */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / DAY);
}

/** Leave length, both ends included; null when a date is missing or the end is before the start. */
export function leaveDays(from: Date | null, to: Date | null): number | null {
  if (!from || !to) return null;
  const n = daysBetween(from, to) + 1;
  return n >= 1 ? n : null;
}

/** Day windows the server accepts (PRD 7.2 and the leave request rules). */
export const LEAVE_PAST_DAYS = 7;
export const LEAVE_FUTURE_DAYS = 180;
export const LEAVE_MAX_DAYS = 60;
export const CORRECTION_PAST_DAYS = 7;
export const MISSION_FUTURE_DAYS = 30;
export const REASON_MIN = 3;
export const NOTE_MAX = 1000;

export type Range = { min: Date; max: Date };

export const leaveRange = (today: Date): Range => ({ min: addDays(today, -LEAVE_PAST_DAYS), max: addDays(today, LEAVE_FUTURE_DAYS) });
export const correctionRange = (today: Date): Range => ({ min: addDays(today, -CORRECTION_PAST_DAYS), max: startOfDay(today) });
export const missionRange = (today: Date): Range => ({ min: startOfDay(today), max: addDays(today, MISSION_FUTURE_DAYS) });

export const inRange = (d: Date, r: Range) => daysBetween(r.min, d) >= 0 && daysBetween(d, r.max) >= 0;

/** Kuwait wall-clock "HH:mm" of an instant (Kuwait is UTC+3 all year), whatever the phone's zone. */
export function kuwaitHm(at: Date): string {
  const k = new Date(at.getTime() + 3 * 3600000);
  return `${String(k.getUTCHours()).padStart(2, '0')}:${String(k.getUTCMinutes()).padStart(2, '0')}`;
}

/** Kuwait calendar day of an instant, as a local date (for grouping punches by day). */
export function kuwaitDay(at: Date): Date {
  const k = new Date(at.getTime() + 3 * 3600000);
  return new Date(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate());
}

/**
 * The instants to try for a correction: the time on the shift's day, then (for a check-out only)
 * the same time on the next day, for night shifts that end after midnight (as the old app did).
 */
export function correctionInstants(shiftDate: Date, hour: number, minute: number, punchType: 'check_in' | 'check_out'): Date[] {
  const same = kuwaitTime(shiftDate, hour, minute);
  return punchType === 'check_out' ? [same, kuwaitTime(addDays(shiftDate, 1), hour, minute)] : [same];
}

// ------------------------------------------------------------------ client-side validation
// Each returns a strings key, or null when the form may be sent. The server checks again.

export function validateLeave(p: { from: Date | null; to: Date | null; today: Date }): string | null {
  if (!p.from || !p.to) return 'leave_pick_dates';
  if (daysBetween(p.from, p.to) < 0) return 'req_error_leave_dates_invalid';
  const r = leaveRange(p.today);
  if (!inRange(p.from, r) || !inRange(p.to, r)) return 'req_error_leave_dates_out_of_range';
  if ((leaveDays(p.from, p.to) ?? 0) > LEAVE_MAX_DAYS) return 'req_error_leave_dates_out_of_range';
  return null;
}

/** The leave reason is optional for the employee; the server needs a short text, so the type is sent instead. */
export const leaveReason = (reason: string, leaveType: string) => (reason.trim().length >= REASON_MIN ? reason.trim() : leaveType);

export function validateCorrection(p: {
  date: Date | null;
  time: { hour: number; minute: number } | null;
  reason: string;
  today: Date;
  now: Date;
}): string | null {
  if (!p.date) return 'req_missing_date';
  if (!p.time) return 'req_missing_time';
  if (!inRange(p.date, correctionRange(p.today))) return 'req_error_correction_too_old';
  if (kuwaitTime(p.date, p.time.hour, p.time.minute).getTime() > p.now.getTime()) return 'req_error_time_in_future';
  if (p.reason.trim().length < REASON_MIN) return 'req_error_reason_required';
  return null;
}

export function validateMission(p: { date: Date | null; siteId: string | null; reason: string; today: Date }): string | null {
  if (!p.date) return 'req_missing_date';
  if (!inRange(p.date, missionRange(p.today))) return 'req_error_mission_date_out_of_range';
  if (!p.siteId) return 'req_missing_site';
  if (p.reason.trim().length < REASON_MIN) return 'req_error_reason_required';
  return null;
}

export function validateNote(note: string): string | null {
  return note.trim().length > NOTE_MAX ? 'req_error_note_too_long' : null;
}

/** "req_error_<code>" for a RequestError (or anything with a known code), else the generic text. */
export function errorKey(e: unknown): string {
  const code = typeof e === 'object' && e && 'code' in e ? (e as { code: unknown }).code : null;
  const key = typeof code === 'string' ? `req_error_${code}` : '';
  return key && hasKey(key) ? key : 'req_error_generic';
}

/** Only 6 digits, as the user types. */
export const fileNumberInput = (text: string) => text.replace(/[^0-9٠-٩]/g, '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).slice(0, 6);
export const isFileNumber = (text: string) => /^\d{6}$/.test(text);

// ------------------------------------------------------------------ text

/** What the request asks for, in one line (list rows and the approvals inbox). */
export function requestSummary(r: RequestItem, t: TFn, lang: Lang): string {
  const day = mediumDate(parseYmd(r.shiftDate), lang);
  if (r.type === 'punch_correction') {
    const kind = t(r.punchType === 'check_out' ? 'out_label' : 'in_label');
    return r.time ? `${day} · ${kind} ${kuwaitHm(r.time)}` : `${day} · ${kind}`;
  }
  if (r.type === 'leave') {
    const to = r.leaveTo && r.leaveTo !== r.shiftDate ? ` – ${mediumDate(parseYmd(r.leaveTo), lang)}` : '';
    return `${day}${to}`;
  }
  const site = lang === 'ar' ? r.siteAr : r.siteEn;
  return `${day} · ${site ?? '—'}`;
}

/** Title of a request row: the type, or the leave type for a leave. */
export function requestTitle(r: RequestItem, t: TFn): string {
  if (r.type === 'leave') return leaveTypeKey(r.leaveType) ? leaveTypeLabel(t, r.leaveType) : t('type_leave');
  return t(typeKey(r.type));
}

export function searchSites(sites: SiteOption[], query: string): SiteOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return sites;
  return sites.filter((s) => s.nameAr.toLowerCase().includes(q) || s.nameEn.toLowerCase().includes(q));
}

// ------------------------------------------------------------------ month record

export const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
export const monthEnd = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
export const shiftMonth = (d: Date, by: number) => new Date(d.getFullYear(), d.getMonth() + by, 1);
export const sameMonth = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

export function monthTotals(days: Pick<DayRecord, 'arrival' | 'departure'>[]) {
  return {
    late: days.filter((d) => d.arrival === 'late').length,
    absent: days.filter((d) => d.arrival === 'absent').length,
    missing: days.filter((d) => d.departure === 'missing').length,
  };
}

export type DayNote = { key: string; vars?: Record<string, number>; tone: Tone };

/** The badges under one day (ported from the old month record). */
export function dayNotes(day: DayRecord, now: Date): DayNote[] {
  const notes: DayNote[] = [];
  if (day.kind !== 'work') {
    notes.push({ key: `kind_${day.kind}`, tone: 'neutral' });
  } else if (day.arrival === 'late') {
    notes.push({ key: 'late_by', vars: { minutes: day.lateMinutes }, tone: 'warn' });
  } else if (day.arrival === 'pending' && day.shiftStart && day.shiftStart.getTime() > now.getTime()) {
    notes.push({ key: 'arrival_upcoming', tone: 'neutral' });
  } else if (day.arrival === 'absent') {
    notes.push({ key: 'arrival_absent', tone: 'danger' });
  } else if (day.arrival === 'on_time') {
    notes.push({ key: 'arrival_on_time', tone: 'ok' });
  } else if (day.arrival === 'pending') {
    notes.push({ key: 'arrival_pending', tone: 'neutral' });
  }
  if (day.departure === 'missing') notes.push({ key: 'missing_out', tone: 'danger' });
  if (day.earlyLeaveMinutes > 0) notes.push({ key: 'early_by', vars: { minutes: day.earlyLeaveMinutes }, tone: 'warn' });
  return notes;
}
