// Pure helpers for the attendance calendar (Reports tab) and the dashboard lists (PRD 18.2).
// No React, no network: everything here is unit tested in __tests__/calendar.test.ts.
import type { IconName } from '../components/ui';
import type { DayRecord } from './api';
import { saturdayIndex } from './dates';

/** What one calendar day shows. */
export type DayState =
  | 'on_time'
  | 'late'
  | 'absent'
  | 'leave'
  | 'pending'
  | 'upcoming'
  | 'off'
  | 'holiday'
  | 'continued'
  | 'before_hire'
  | 'none';

export type DayTone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral';

/**
 * Tone (tint), word (strings key) and symbol (icon) of each state. Colour is never the only
 * signal: every state that has a tint also has its own icon, and the word is the accessible label.
 */
export const DAY_VIEW: Record<DayState, { tone: DayTone | null; label: string; icon: IconName | null }> = {
  on_time: { tone: 'ok', label: 'arrival_on_time', icon: 'checkmark' },
  late: { tone: 'warn', label: 'dash_late', icon: 'time-outline' },
  absent: { tone: 'danger', label: 'arrival_absent', icon: 'close' },
  leave: { tone: 'info', label: 'type_leave', icon: 'airplane-outline' },
  pending: { tone: null, label: 'arrival_pending', icon: 'ellipse-outline' },
  upcoming: { tone: null, label: 'arrival_upcoming', icon: null },
  off: { tone: 'neutral', label: 'kind_off', icon: 'remove' },
  holiday: { tone: 'neutral', label: 'kind_holiday', icon: 'flag-outline' },
  continued: { tone: null, label: 'kind_continued', icon: null },
  before_hire: { tone: null, label: 'kind_before_hire', icon: null },
  none: { tone: null, label: 'cal_state_none', icon: null },
};

/** The states shown in the legend, in reading order. */
export const LEGEND: DayState[] = ['on_time', 'late', 'absent', 'leave', 'off', 'holiday'];

/** Weeks of a month, Saturday first (Kuwait week). Empty cells are null. */
export function monthGrid(year: number, month0: number): (number | null)[][] {
  const lead = saturdayIndex(new Date(year, month0, 1));
  const count = new Date(year, month0 + 1, 0).getDate();
  const cells: (number | null)[] = [...Array<null>(lead).fill(null)];
  for (let d = 1; d <= count; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** "YYYY-MM-DD" of a day in a month (month0 = 0..11). */
export function isoDay(year: number, month0: number, day: number): string {
  return `${year}-${String(month0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** The bonus-period month (YYYY-MM) a day belongs to: the 21st onwards counts for next month (PRD 17.1). */
export function periodMonthOf(day: string): string {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  const t = y * 12 + (m - 1) + (d >= 21 ? 1 : 0);
  return `${String(Math.floor(t / 12)).padStart(4, '0')}-${String((t % 12) + 1).padStart(2, '0')}`;
}

/** Bonus-period months that overlap a calendar month (two of them: the 1st-20th and the 21st-end). */
export function periodMonthsFor(year: number, month0: number): string[] {
  const last = new Date(year, month0 + 1, 0).getDate();
  const a = periodMonthOf(isoDay(year, month0, 1));
  const b = periodMonthOf(isoDay(year, month0, last));
  return a === b ? [a] : [a, b];
}

const rank = (r: DayRecord) =>
  r.kind !== 'work' ? 0 : r.arrival === 'absent' ? 4 : r.arrival === 'late' ? 3 : r.arrival === 'on_time' ? 2 : 1;

/** A day with several shifts shows its worst one (absent > late > on time > not yet). */
export function worstOf(recs: DayRecord[]): DayRecord {
  return recs.reduce((a, b) => (rank(b) > rank(a) ? b : a));
}

/** Records grouped by their calendar day. */
export function groupByDay(records: DayRecord[]): Map<string, DayRecord[]> {
  const map = new Map<string, DayRecord[]>();
  for (const r of records) {
    const list = map.get(r.day);
    if (list) list.push(r);
    else map.set(r.day, [r]);
  }
  return map;
}

/** Days covered by a real leave ("إجازة ..."), day -> leave type. Recorded absences are not leave. */
export function leaveByDay(leaves: { type: string; from: string; to: string | null }[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const l of leaves) {
    if (!l.type.startsWith('إجازة')) continue;
    const [fy, fm, fd] = l.from.slice(0, 10).split('-').map(Number);
    const end = (l.to ?? l.from).slice(0, 10);
    const cur = new Date(fy, fm - 1, fd);
    for (let i = 0; i < 400; i++) {
      const iso = isoDay(cur.getFullYear(), cur.getMonth(), cur.getDate());
      if (iso > end) break;
      if (!map.has(iso)) map.set(iso, l.type);
      cur.setDate(cur.getDate() + 1);
    }
  }
  return map;
}

/** What a day shows, from its records, an optional leave on it, and today's date (YYYY-MM-DD). */
export function dayState(recs: DayRecord[] | undefined, leave: string | undefined, day: string, today: string): DayState {
  if (!recs || recs.length === 0) return leave ? 'leave' : 'none';
  const w = worstOf(recs);
  if (w.kind !== 'work') return w.kind;
  if (w.arrival === 'on_time' || w.arrival === 'late') return w.arrival;
  if (leave) return 'leave';
  if (w.arrival === 'absent') return 'absent';
  if (day > today) return 'upcoming';
  return 'pending';
}

export type DayInfo = { date: string; day: number; state: DayState; recs: DayRecord[]; leave: string | null };

export type MonthTotals = {
  present: number;
  late: number;
  absent: number;
  leave: number;
  missingOut: number;
  lateMinutes: number;
};

export function monthTotals(days: Iterable<Pick<DayInfo, 'state' | 'recs'>>): MonthTotals {
  const t: MonthTotals = { present: 0, late: 0, absent: 0, leave: 0, missingOut: 0, lateMinutes: 0 };
  for (const d of days) {
    if (d.state === 'on_time' || d.state === 'late') t.present++;
    if (d.state === 'late') t.late++;
    if (d.state === 'absent') t.absent++;
    if (d.state === 'leave') t.leave++;
    for (const r of d.recs) {
      if (r.departure === 'missing') t.missingOut++;
      t.lateMinutes += r.lateMinutes;
    }
  }
  return t;
}

export type MonthView = {
  weeks: ({ day: number; date: string; state: DayState } | null)[][];
  days: Map<string, DayInfo>;
  totals: MonthTotals;
};

/** Everything the calendar screen needs for one month. */
export function buildMonth(
  year: number,
  month0: number,
  records: DayRecord[],
  leaves: { type: string; from: string; to: string | null }[],
  today: string,
): MonthView {
  const byDay = groupByDay(records);
  const leaveDays = leaveByDay(leaves);
  const days = new Map<string, DayInfo>();
  const weeks = monthGrid(year, month0).map((week) =>
    week.map((day) => {
      if (day == null) return null;
      const date = isoDay(year, month0, day);
      const recs = byDay.get(date) ?? [];
      const leave = leaveDays.get(date) ?? null;
      const state = dayState(recs, leave ?? undefined, date, today);
      days.set(date, { date, day, state, recs, leave });
      return { day, date, state };
    }),
  );
  return { weeks, days, totals: monthTotals(days.values()) };
}

// ---------------------------------------------------------------- type labels

/** strings key for a leave / absence / penalty type stored in Arabic (tables `leaves`, `penalties`). */
const TYPE_KEYS: Record<string, string> = {
  'إجازة دورية': 'leave_annual',
  'إجازة مرضية': 'leave_sick',
  'إجازة طارئة': 'leave_emergency',
  'إجازة بدون راتب': 'leave_unpaid',
  غياب: 'dsh_t_absence',
  تأخير: 'dsh_t_late',
  إنذار: 'dsh_t_warning',
  'لفت نظر': 'dsh_t_notice',
  خصم: 'dsh_t_deduction',
  إيقاف: 'dsh_t_suspension',
};

export function typeKey(raw: string | null | undefined): string | null {
  return raw ? (TYPE_KEYS[raw] ?? null) : null;
}

/** Arabic shows the stored value as is; English uses the translated label when there is one. */
export function typeLabel(t: (k: string) => string, isAr: boolean, raw: string | null | undefined): string {
  if (!raw) return '';
  if (isAr) return raw;
  const k = typeKey(raw);
  return k ? t(k) : raw;
}
