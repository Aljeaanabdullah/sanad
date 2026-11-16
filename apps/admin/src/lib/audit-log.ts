import type { AuditText } from "./i18n-audit";

// Pure helpers for the audit log screen and its export (no database access here).

export const PAGE_SIZE = 50;
export const EXPORT_MAX_ROWS = 5000;

export type AuditEntry = {
  id: number;
  actor_user_id: string | null;
  action: string;
  table_name: string;
  record_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
};

// ---------- filters ----------

export const ACTION_FILTERS = ["insert", "update", "delete", "export", "export_xlsx", "export_pdf", "export_audit"] as const;
export type ActionFilter = (typeof ACTION_FILTERS)[number];

export const TABLE_FILTERS = [
  "employees",
  "departments",
  "sites",
  "buildings",
  "work_patterns",
  "employee_sites",
  "devices",
  "face_templates",
  "consents",
  "requests",
  "request_approvals",
  "emergencies",
  "punch_security_settings",
  "audit_log",
] as const;

export type AuditFilters = {
  from?: string; // YYYY-MM-DD, Kuwait day
  to?: string; // YYYY-MM-DD, Kuwait day (inclusive)
  actor?: number; // file number
  system?: boolean; // only rows with no signed-in user
  employee?: number; // file number of the employee concerned
  table?: string;
  action?: ActionFilter;
  before?: number; // keyset cursor: rows with id < before (older page)
  after?: number; // keyset cursor: rows with id > after (newer page)
};

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

function get(params: Params, key: string): string {
  const v = params instanceof URLSearchParams ? params.get(key) : params[key];
  return String((Array.isArray(v) ? v[0] : v) ?? "").trim();
}

function validDay(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Read the filters from the URL. Bad values are dropped and reported through `invalid`. */
export function parseAuditFilters(params: Params): { filters: AuditFilters; invalid: boolean } {
  const f: AuditFilters = {};
  let invalid = false;
  const take = <T>(raw: string, ok: boolean, set: () => T) => {
    if (!raw) return;
    if (ok) set();
    else invalid = true;
  };

  const from = get(params, "from");
  take(from, validDay(from), () => (f.from = from));
  const to = get(params, "to");
  take(to, validDay(to), () => (f.to = to));
  if (f.from && f.to && f.from > f.to) [f.from, f.to] = [f.to, f.from];

  const actor = get(params, "actor");
  take(actor, /^\d{6}$/.test(actor), () => (f.actor = Number(actor)));
  if (!f.actor && get(params, "system") === "1") f.system = true;

  const employee = get(params, "employee");
  take(employee, /^\d{6}$/.test(employee), () => (f.employee = Number(employee)));

  const table = get(params, "table");
  take(table, (TABLE_FILTERS as readonly string[]).includes(table), () => (f.table = table));

  const action = get(params, "action");
  take(action, (ACTION_FILTERS as readonly string[]).includes(action), () => (f.action = action as ActionFilter));

  const before = get(params, "before");
  const after = get(params, "after");
  if (/^\d{1,18}$/.test(before)) f.before = Number(before);
  else if (/^\d{1,18}$/.test(after)) f.after = Number(after);

  return { filters: f, invalid };
}

/** URL query for the filters (cursor optional), e.g. for pagination links and the export link. */
export function filtersToQuery(f: AuditFilters, cursor?: { before?: number; after?: number }): string {
  const q = new URLSearchParams();
  if (f.from) q.set("from", f.from);
  if (f.to) q.set("to", f.to);
  if (f.actor) q.set("actor", String(f.actor));
  else if (f.system) q.set("system", "1");
  if (f.employee) q.set("employee", String(f.employee));
  if (f.table) q.set("table", f.table);
  if (f.action) q.set("action", f.action);
  if (cursor?.before) q.set("before", String(cursor.before));
  else if (cursor?.after) q.set("after", String(cursor.after));
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** Kuwait (UTC+3, no daylight saving) day range as UTC instants: [start, endExclusive). */
export function kuwaitDayRange(from?: string, to?: string): { gte?: string; lt?: string } {
  const r: { gte?: string; lt?: string } = {};
  if (from) r.gte = new Date(`${from}T00:00:00+03:00`).toISOString();
  if (to) r.lt = new Date(new Date(`${to}T00:00:00+03:00`).getTime() + 86_400_000).toISOString();
  return r;
}

// ---------- redaction and diff ----------

/** Never shown: device keys / identifiers and anything face-template-like or secret-like. */
const SECRET_KEYS = new Set([
  "embedding",
  "descriptor",
  "face_descriptor",
  "public_key",
  "private_key",
  "key_attestation",
  "device_identifier",
  "password",
  "password_hash",
  "encrypted_password",
  "token",
  "access_token",
  "refresh_token",
  "secret",
  "api_key",
  "signature",
]);
const SECRET_PATTERN = /(embedding|descriptor|secret|token|private_key|public_key|attestation|password_hash|api_key|signature)/i;

/** Fields that change on every write and only add noise. */
const NOISY_KEYS = new Set(["updated_at", "created_at", "id"]);

export function isSecretField(key: string): boolean {
  return SECRET_KEYS.has(key) || SECRET_PATTERN.test(key);
}

export const REDACTED = Symbol("redacted");
export type ShownValue = unknown | typeof REDACTED;

/** The value to display: the value itself, or REDACTED for a non-empty secret. */
export function redactValue(key: string, value: unknown): ShownValue {
  if (value === null || value === undefined) return value ?? null;
  return isSecretField(key) ? REDACTED : value;
}

/** A copy of a row's data with every secret field replaced by a marker string (for exports). */
export function redactData(data: Record<string, unknown> | null, marker = "[hidden]"): Record<string, unknown> | null {
  if (!data) return data;
  return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, redactValue(k, v) === REDACTED ? marker : v]));
}

export type DiffRow = { key: string; before: ShownValue; after: ShownValue; secret: boolean };

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * The fields to show for one entry. Update: only fields whose value changed.
 * Insert / delete / export: every field of the new / old data. Noisy fields are left out.
 * Secret fields keep their row (so the admin sees that they changed) but their values are hidden.
 */
export function diffEntry(e: Pick<AuditEntry, "action" | "old_data" | "new_data">): DiffRow[] {
  const oldD = e.old_data ?? {};
  const newD = e.new_data ?? {};
  const keys =
    e.action === "update"
      ? [...new Set([...Object.keys(oldD), ...Object.keys(newD)])].filter((k) => !same(oldD[k], newD[k]))
      : Object.keys(e.action === "delete" ? oldD : { ...oldD, ...newD });
  return keys
    .filter((k) => !NOISY_KEYS.has(k))
    .sort()
    .map((k) => ({
      key: k,
      before: e.action === "insert" || e.action.startsWith("export") ? null : redactValue(k, oldD[k]),
      after: e.action === "delete" ? null : redactValue(k, newD[k]),
      secret: isSecretField(k),
    }));
}

// ---------- labels and text ----------

export const tableLabel = (t: AuditText, table: string) => t.tables[table] ?? table;
export const actionLabel = (t: AuditText, action: string) => t.actions[action] ?? action;
export const fieldLabel = (t: AuditText, key: string) => t.fields[key] ?? key;

/** A value as short text. Long values are cut so a single row cannot flood the page. */
export function formatValue(t: AuditText, v: ShownValue, max = 160): string {
  if (v === REDACTED) return `•••• (${t.redacted})`;
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? t.yes : t.no;
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** One-line description of what happened. */
export function summarize(t: AuditText, e: AuditEntry, maxFields = 4): string {
  switch (e.action) {
    case "insert":
      return t.summary.insert;
    case "delete":
      return t.summary.delete;
    case "update": {
      const rows = diffEntry(e);
      if (rows.length === 0) return t.summary.updateNone;
      const names = rows.slice(0, maxFields).map((r) => fieldLabel(t, r.key));
      const extra = rows.length - names.length;
      return t.summary.update(names.join(t.summary.sep) + (extra > 0 ? ` ${t.summary.more(extra)}` : ""));
    }
    case "export_xlsx":
      return t.summary.export_xlsx;
    case "export_pdf":
      return t.summary.export_pdf;
    case "export_audit":
      return t.summary.export_audit(Number(e.new_data?.rows ?? 0));
    default:
      return actionLabel(t, e.action);
  }
}

/** Changes as plain text, for the Excel export: "field: old → new; …". */
export function diffText(t: AuditText, e: AuditEntry): string {
  return diffEntry(e)
    .map((r) => {
      const label = fieldLabel(t, r.key);
      if (e.action === "update") return `${label}: ${formatValue(t, r.before)} → ${formatValue(t, r.after)}`;
      return `${label}: ${formatValue(t, e.action === "delete" ? r.before : r.after)}`;
    })
    .join("; ");
}

/** The employee a row is about, as its id: the row itself for employees, else its employee_id. */
export function subjectEmployeeId(e: AuditEntry): string | null {
  if (e.table_name === "employees") return e.record_id;
  const v = e.new_data?.employee_id ?? e.old_data?.employee_id;
  return typeof v === "string" ? v : null;
}

/** A readable name for the record itself when the row carries one (sites, departments, …). */
export function recordName(e: AuditEntry, lang: "ar" | "en"): string | null {
  const d = e.new_data ?? e.old_data;
  if (!d) return null;
  const v = lang === "ar" ? (d.name_ar ?? d.full_name_ar) : (d.name_en ?? d.full_name_en);
  return typeof v === "string" && v ? v : null;
}

/** Ids safe to put in a PostgREST in.(…) list (uuids only). */
export function safeIds(ids: (string | null | undefined)[]): string[] {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return [...new Set(ids.filter((id): id is string => !!id && uuid.test(id)))];
}
