// Pure helpers for the live board and the reports (Phase 10). No server-only imports: unit-tested.

export const MAX_RANGE_DAYS = 31;
export const PAGE_SIZE = 100;
/** A PDF with more rows than this is cut (with a note); Excel always has every row. */
export const PDF_MAX_ROWS = 5000;

export const REPORT_KINDS = ["daily", "late", "absent", "punches"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

/** Status of one scheduled shift, as returned by public.attendance_report / public.live_board. */
export type ShiftStatus = "on_time" | "late" | "leave" | "absent" | "not_arrived" | "upcoming";

/** Row of public.attendance_report (and of each item of public.attendance_report_export). */
export type ReportRow = {
  day: string;
  employee_id?: string;
  file_number: number;
  name_ar: string;
  name_en: string;
  department_ar: string | null;
  department_en: string | null;
  shift_start: string;
  status: ShiftStatus;
  check_in_at: string | null;
  check_out_at: string | null;
  late_minutes: number;
  check_in_corrected: boolean;
  site_ar: string | null;
  site_en: string | null;
  leave_type: string | null;
};

/** Row of public.live_board. */
export type LiveRow = {
  employee_id: string;
  file_number: number;
  name_ar: string;
  name_en: string;
  department_ar: string | null;
  department_en: string | null;
  shift_start: string;
  shift_end: string;
  status: ShiftStatus;
  checked_out: boolean;
  check_in_at: string | null;
  check_out_at: string | null;
  late_minutes: number;
  site_ar: string | null;
  site_en: string | null;
  leave_type: string | null;
};

// ---------------------------------------------------------------------------
// Live board buckets
// ---------------------------------------------------------------------------

/** "scheduled" is everyone; the next six split it with no overlap; "checked_out" is part of on_time + late. */
export const LIVE_BUCKETS = ["scheduled", "on_time", "late", "not_arrived", "absent", "leave", "upcoming", "checked_out"] as const;
export type LiveBucket = (typeof LIVE_BUCKETS)[number];

export function groupLive<T extends Pick<LiveRow, "status" | "checked_out">>(rows: T[]) {
  const lists = Object.fromEntries(LIVE_BUCKETS.map((b) => [b, [] as T[]])) as Record<LiveBucket, T[]>;
  for (const r of rows) {
    lists.scheduled.push(r);
    lists[r.status].push(r);
    if (r.checked_out) lists.checked_out.push(r);
  }
  const counts = Object.fromEntries(LIVE_BUCKETS.map((b) => [b, lists[b].length])) as Record<LiveBucket, number>;
  return { counts, lists };
}

export function isLiveBucket(v: string): v is LiveBucket {
  return (LIVE_BUCKETS as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Dates (Kuwait, UTC+3 all year)
// ---------------------------------------------------------------------------

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Kuwait calendar date (YYYY-MM-DD) of `now`. */
export function kuwaitDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuwait" }).format(now);
}

function isRealDate(s: string) {
  if (!DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Number of days from `from` to `to`, both included. */
export function rangeDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

/** Splits [from, to] into consecutive pieces of at most `size` days (for exports). */
export function chunkRange(from: string, to: string, size = 7): [string, string][] {
  const out: [string, string][] = [];
  for (let a = from; a <= to; a = addDays(a, size)) {
    const b = addDays(a, size - 1);
    out.push([a, b < to ? b : to]);
  }
  return out;
}

/** "HH:mm" in Kuwait time, or "" for null. */
export function kuwaitTime(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuwait", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(iso),
  );
}

// ---------------------------------------------------------------------------
// Filters from the URL
// ---------------------------------------------------------------------------

export type ReportFilters = {
  kind: ReportKind;
  from: string;
  to: string;
  department: string | null;
  site: string | null;
  file: number | null;
  page: number;
};

export type FilterError = "bad_date" | "range_order" | "range_too_long" | "future" | "bad_file";

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

/**
 * Reads and checks the report filters. Defaults: daily report, today (Kuwait), page 1.
 * The range is at most 31 days and cannot end after today.
 */
export function parseReportFilters(sp: Params, today: string): { filters: ReportFilters; error: FilterError | null } {
  const kindRaw = one(sp.kind);
  const kind = (REPORT_KINDS as readonly string[]).includes(kindRaw) ? (kindRaw as ReportKind) : "daily";
  let from = one(sp.from) || today;
  let to = one(sp.to) || from;
  const dept = one(sp.dept);
  const site = one(sp.site);
  const fileRaw = one(sp.file);
  const page = Math.max(1, Math.min(10_000, Number.parseInt(one(sp.page), 10) || 1));

  let error: FilterError | null = null;
  if (!isRealDate(from) || !isRealDate(to)) error = "bad_date";
  else if (to < from) error = "range_order";
  else if (rangeDays(from, to) > MAX_RANGE_DAYS) error = "range_too_long";
  else if (to > today) error = "future";
  else if (fileRaw && !/^\d{6}$/.test(fileRaw)) error = "bad_file";
  if (error) {
    from = isRealDate(from) && from <= today ? from : today;
    to = from;
  }

  return {
    filters: {
      kind,
      from,
      to,
      department: UUID.test(dept) ? dept : null,
      site: UUID.test(site) ? site : null,
      file: /^\d{6}$/.test(fileRaw) ? Number(fileRaw) : null,
      page,
    },
    error,
  };
}

/** Query string for links that keep the current filters (empty values left out). */
export function filterQuery(f: Partial<ReportFilters> & Record<string, unknown>): string {
  const q = new URLSearchParams();
  const put = (k: string, v: unknown) => {
    if (v !== null && v !== undefined && v !== "") q.set(k, String(v));
  };
  put("kind", f.kind);
  put("from", f.from);
  put("to", f.to);
  put("dept", f.department);
  put("site", f.site);
  put("file", f.file);
  if (f.page && f.page > 1) put("page", f.page);
  return q.toString();
}

/** p_status sent to public.attendance_report for each kind. */
export const KIND_STATUS: Record<Exclude<ReportKind, "punches">, "present" | "late" | "absent"> = {
  daily: "present",
  late: "late",
  absent: "absent",
};

// ---------------------------------------------------------------------------
// Report rows -> export table (columns in reading order, every cell a string)
// ---------------------------------------------------------------------------

export type ColumnKey =
  | "day"
  | "file"
  | "name"
  | "department"
  | "shift"
  | "checkIn"
  | "checkOut"
  | "lateMinutes"
  | "site"
  | "status"
  | "time"
  | "type"
  | "result"
  | "reason";

export const KIND_COLUMNS: Record<ReportKind, ColumnKey[]> = {
  daily: ["day", "file", "name", "department", "shift", "checkIn", "checkOut", "lateMinutes", "site", "status"],
  late: ["day", "file", "name", "department", "shift", "checkIn", "lateMinutes", "site"],
  absent: ["day", "file", "name", "department", "shift", "site"],
  punches: ["day", "time", "file", "name", "department", "type", "result", "reason", "site"],
};

/** Relative column widths for the PDF. */
export const COLUMN_WIDTH: Record<ColumnKey, number> = {
  day: 1.1,
  file: 0.8,
  name: 2.2,
  department: 1.5,
  shift: 1,
  checkIn: 0.8,
  checkOut: 0.8,
  lateMinutes: 1,
  site: 1.5,
  status: 1,
  time: 0.7,
  type: 0.7,
  result: 0.8,
  reason: 1.4,
};

export type ExportLabels = {
  statuses: Record<ShiftStatus, string>;
};

/** Marks a check-in time that an approved punch-correction request set ("08:25*"). */
export const CORRECTED_MARK = "*";

/** One attendance row as cells, in the order of KIND_COLUMNS[kind]. */
export function reportRowCells(kind: Exclude<ReportKind, "punches">, r: ReportRow, ar: boolean, L: ExportLabels): string[] {
  const cell: Partial<Record<ColumnKey, string>> = {
    day: r.day,
    file: String(r.file_number),
    name: ar ? r.name_ar : r.name_en,
    department: (ar ? r.department_ar : r.department_en) ?? "",
    shift: kuwaitTime(r.shift_start),
    checkIn: kuwaitTime(r.check_in_at) + (r.check_in_at && r.check_in_corrected ? CORRECTED_MARK : ""),
    checkOut: kuwaitTime(r.check_out_at),
    lateMinutes: String(r.late_minutes ?? 0),
    site: (ar ? r.site_ar : r.site_en) ?? "",
    status: L.statuses[r.status] ?? r.status,
  };
  return KIND_COLUMNS[kind].map((k) => cell[k] ?? "");
}

/** One punch of the punch log (attendance_punches joined with the employee). */
export type PunchRow = {
  id: string;
  punched_at: string;
  punch_type: "check_in" | "check_out";
  result: "accepted" | "rejected";
  reject_reason: string | null;
  photo_path: string | null;
  source: string | null;
  site: { name_ar: string; name_en: string } | null;
  employee: {
    id: string;
    file_number: number;
    full_name_ar: string;
    full_name_en: string;
    department: { name_ar: string; name_en: string } | null;
  };
};

export type PunchLabels = {
  punchTypes: Record<PunchRow["punch_type"], string>;
  results: Record<PunchRow["result"], string>;
};

export function punchRowCells(p: PunchRow, ar: boolean, L: PunchLabels): string[] {
  const pick = (n: { name_ar: string; name_en: string } | null) => (n ? (ar ? n.name_ar : n.name_en) : "");
  const cell: Partial<Record<ColumnKey, string>> = {
    day: kuwaitDate(new Date(p.punched_at)),
    time: kuwaitTime(p.punched_at),
    file: String(p.employee.file_number),
    name: ar ? p.employee.full_name_ar : p.employee.full_name_en,
    department: pick(p.employee.department),
    type: L.punchTypes[p.punch_type] + (p.source === "correction" ? CORRECTED_MARK : ""),
    result: L.results[p.result],
    reason: p.reject_reason ?? "",
    site: pick(p.site),
  };
  return KIND_COLUMNS.punches.map((k) => cell[k] ?? "");
}

/** UTC bounds of the Kuwait days [from, to], for timestamp filters. */
export function kuwaitDayBounds(from: string, to: string) {
  return {
    start: new Date(`${from}T00:00:00+03:00`).toISOString(),
    end: new Date(`${addDays(to, 1)}T00:00:00+03:00`).toISOString(),
  };
}
