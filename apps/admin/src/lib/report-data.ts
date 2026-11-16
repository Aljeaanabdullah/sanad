import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Lang } from "./i18n";
import { repT } from "./i18n-rep";
import {
  chunkRange,
  COLUMN_WIDTH,
  CORRECTED_MARK,
  KIND_COLUMNS,
  KIND_STATUS,
  kuwaitDayBounds,
  punchRowCells,
  reportRowCells,
  type PunchRow,
  type ReportFilters,
  type ReportKind,
  type ReportRow,
} from "./reports";
import type { ReportTable } from "./export-report";

// Data for the reports screen and its exports. Every call runs with the signed-in user's session:
// the SQL functions refuse anyone but supervisor / HR / admin (42501), and RLS guards the punch log.

export const PUNCH_SELECT =
  "id, punched_at, punch_type, result, reject_reason, photo_path, source, site:sites(name_ar, name_en), " +
  // No alias on the employee embed: the department filter below names it "employees".
  "employees!attendance_punches_employee_id_fkey!inner(id, file_number, full_name_ar, full_name_en, department_id, " +
  "department:departments!employees_department_id_fkey(name_ar, name_en))";

const rpcArgs = (f: ReportFilters, from: string, to: string) => ({
  p_from: from,
  p_to: to,
  p_department: f.department,
  p_site: f.site,
  p_file: f.file,
  p_status: KIND_STATUS[f.kind as Exclude<ReportKind, "punches">],
});

/** One page of an attendance report (daily / late / absent) and the total count. */
export async function attendancePage(supabase: SupabaseClient, f: ReportFilters, offset: number, limit: number) {
  const { data, count, error } = await supabase
    .rpc("attendance_report", rpcArgs(f, f.from, f.to), { count: "exact" })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as ReportRow[], total: count ?? 0 };
}

/**
 * Every row of an attendance report, for export. The API returns at most 1,000 rows per call,
 * so the period is read in 7-day pieces through attendance_report_export (one JSON array each).
 */
export async function attendanceAll(supabase: SupabaseClient, f: ReportFilters): Promise<ReportRow[]> {
  const out: ReportRow[] = [];
  for (const [a, b] of chunkRange(f.from, f.to, 7)) {
    const { data, error } = await supabase.rpc("attendance_report_export", rpcArgs(f, a, b));
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as ReportRow[]));
  }
  return out;
}

/** The employee id of a file number (null = no such employee: the punch log is then empty). */
async function employeeIdOf(supabase: SupabaseClient, file: number) {
  const { data } = await supabase.from("employees").select("id").eq("file_number", file).maybeSingle();
  return data?.id ?? "00000000-0000-0000-0000-000000000000";
}

// Builds the query (not awaited here: a query builder runs when awaited). `employeeId` from employeeIdOf.
function punchQuery(supabase: SupabaseClient, f: ReportFilters, count: boolean, employeeId: string | null) {
  const { start, end } = kuwaitDayBounds(f.from, f.to);
  let q = supabase
    .from("attendance_punches")
    .select(PUNCH_SELECT, count ? { count: "exact" } : undefined)
    .gte("punched_at", start)
    .lt("punched_at", end);
  if (f.site) q = q.eq("site_id", f.site);
  if (f.department) q = q.eq("employees.department_id", f.department);
  if (employeeId) q = q.eq("employee_id", employeeId);
  return q.order("punched_at", { ascending: false }).order("id");
}

type RawPunch = Omit<PunchRow, "employee"> & { employees: PunchRow["employee"] };
const toPunchRows = (data: unknown) => ((data ?? []) as RawPunch[]).map(({ employees, ...p }) => ({ ...p, employee: employees }));

export async function punchPage(supabase: SupabaseClient, f: ReportFilters, offset: number, limit: number) {
  const employeeId = f.file ? await employeeIdOf(supabase, f.file) : null;
  const { data, count, error } = await punchQuery(supabase, f, true, employeeId).range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return { rows: toPunchRows(data), total: count ?? 0 };
}

export async function punchAll(supabase: SupabaseClient, f: ReportFilters): Promise<PunchRow[]> {
  const out: PunchRow[] = [];
  const employeeId = f.file ? await employeeIdOf(supabase, f.file) : null;
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await punchQuery(supabase, f, false, employeeId).range(offset, offset + 999);
    if (error) throw new Error(error.message);
    out.push(...toPunchRows(data));
    if (!data || data.length < 1000) return out;
  }
}

/** Builds the export table (title, filter lines, columns, rows) for any report kind. */
export function buildReportTable(
  f: ReportFilters,
  rows: { attendance?: ReportRow[]; punches?: PunchRow[] },
  lang: Lang,
  names: { department?: string; site?: string },
): ReportTable {
  const t = repT(lang);
  const ar = lang === "ar";
  const now = new Date();
  const stamp = `${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuwait" }).format(now)} ${new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuwait", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now)}`;
  const cells =
    f.kind === "punches"
      ? (rows.punches ?? []).map((p) => punchRowCells(p, ar, { punchTypes: t.punchTypes, results: t.results }))
      : (rows.attendance ?? []).map((r) => reportRowCells(f.kind as Exclude<ReportKind, "punches">, r, ar, { statuses: t.statuses }));
  const filters = [
    names.department && `${t.department}: ${names.department}`,
    names.site && `${t.site}: ${names.site}`,
    f.file && `${t.file}: ${f.file}`,
  ].filter(Boolean) as string[];
  const meta: [string, string][] = [
    [t.exportPeriod, f.from === f.to ? f.from : `${f.from} – ${f.to}`],
    ...(filters.length ? ([[t.exportFilters, filters.join(" · ")]] as [string, string][]) : []),
    [t.rowsCount, String(cells.length)],
    [t.exportedAt, stamp],
  ];
  const corrected =
    f.kind === "punches"
      ? (rows.punches ?? []).some((p) => p.source === "correction")
      : (rows.attendance ?? []).some((r) => r.check_in_at && r.check_in_corrected);
  if (corrected) meta.push([CORRECTED_MARK, t.correctedNote]);
  return {
    title: t.exportTitle(t.kinds[f.kind]),
    meta,
    columns: KIND_COLUMNS[f.kind].map((k) => ({ label: t.columns[k], width: COLUMN_WIDTH[k] })),
    rows: cells,
    lang,
  };
}
