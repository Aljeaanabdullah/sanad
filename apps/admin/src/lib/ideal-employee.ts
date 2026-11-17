// «الموظف المثالي» (S9), pure part (testable). Server rules: supabase/migrations/*_ideal_employee.sql.
// HR (or the system admin) picks one of the month's nominations and approves it; that sends a notification to
// every employee, so the form asks for an explicit confirmation. Never linked to the bonus.

export const REASON_MIN = 10;
export const REASON_MAX = 500;
export const CITATION_MAX = 200;

/** YYYY-MM of "now" in Kuwait. */
export function kuwaitMonth(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuwait", year: "numeric", month: "2-digit" }).format(now).slice(0, 7);
}

/** The month the page shows: a valid ?month=YYYY-MM not after the current month, else the current month. */
export function pickMonth(param: unknown, current: string): string {
  const v = typeof param === "string" ? param : Array.isArray(param) ? param[0] : null;
  if (typeof v !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) return current;
  return v > current ? current : v;
}

/** Month YYYY-MM plus `delta` months. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** «نوفمبر 2026» / "November 2026" from YYYY-MM or YYYY-MM-DD. */
export function monthName(month: string, lang: "ar" | "en"): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-KW-u-nu-latn" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

export type ApprovalInput = { reason: string; citation: string | null };

/** Checks the approval form like the server does. Returns the cleaned input or an error code. */
export function checkApproval(form: { reason?: unknown; citation?: unknown; confirm?: unknown }): { ok: true; value: ApprovalInput } | { ok: false; error: string } {
  const reason = String(form.reason ?? "").trim();
  const citation = String(form.citation ?? "").trim();
  if (form.confirm !== "yes" && form.confirm !== "on") return { ok: false, error: "confirm_required" };
  if (reason.length < REASON_MIN) return { ok: false, error: "reason_too_short" };
  if (reason.length > REASON_MAX) return { ok: false, error: "reason_too_long" };
  if (citation.length > CITATION_MAX) return { ok: false, error: "citation_too_long" };
  return { ok: true, value: { reason, citation: citation || null } };
}

const SERVER_ERRORS = [
  "not_allowed", "not_found", "cannot_approve_self", "month_in_future", "reason_too_short", "reason_too_long",
  "citation_too_long", "already_decided", "nominee_inactive",
];

/** Server refusal -> error code with a text in i18n-ideal.ts. */
export function approvalError(message: string | undefined): string {
  return SERVER_ERRORS.find((k) => message?.includes(k)) ?? "generic";
}

export type Nomination = {
  id: string;
  month: string;
  department_id: string;
  department_ar: string;
  department_en: string;
  nominee_id: string;
  nominee_file_number: number;
  nominee_name_ar: string;
  nominee_name_en: string;
  nominee_job_title: string | null;
  nominator_id: string | null;
  nominator_file_number: number | null;
  nominator_name_ar: string | null;
  nominator_name_en: string | null;
  reason: string;
  created_at: string;
  updated_at: string;
  is_winner: boolean;
};

export type WinnerRow = {
  month: string;
  employee_id: string;
  name_ar: string;
  name_en: string;
  job_title: string | null;
  department_ar: string | null;
  department_en: string | null;
  reason: string;
  citation: string | null;
  approved_at: string;
};

/** Can the signed-in user approve this nomination now? (The server checks again.) */
export function canApprove(n: Pick<Nomination, "nominee_id">, opts: { meId: string; role: string; decided: boolean }): boolean {
  return !opts.decided && (opts.role === "hr" || opts.role === "admin") && n.nominee_id !== opts.meId;
}
