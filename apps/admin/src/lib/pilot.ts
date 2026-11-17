import { addDays, parseReportFilters, type FilterError } from "./reports";

// Pilot metrics (Phase 13, PRD section 16). The numbers come from public.pilot_metrics
// (supabase/migrations/20261117120000_pilot_metrics.sql), read with the signed-in user's session.

/** The pilot runs two weeks, so the screen opens on the last 14 days (Kuwait). */
export const PILOT_DEFAULT_DAYS = 14;
/** An attempt within this many minutes of a refused one is a retry of the same try. */
export const RETRY_MINUTES = 10;
/** PRD 16: 95% or more succeed on the first attempt. The pilot stops below 90% (pilot-checklist). */
export const FIRST_OK_TARGET = 0.95;
export const FIRST_OK_STOP = 0.9;
/** PRD 16: the whole punch takes under 10 seconds. */
export const FULL_TIME_TARGET_S = 10;

export type PilotMetrics = {
  from: string;
  to: string;
  retry_minutes: number;
  attempts: number;
  accepted: number;
  rejected: number;
  employees: number;
  tries: number;
  first_ok: number;
  server_ms: { n: number; p50: number | null; p90: number | null; max: number | null };
  reasons: { reason: string; n: number }[];
  methods: { method: string; attempts: number; accepted: number; rejected: number; tries: number; first_ok: number }[];
  days: { day: string; accepted: number; rejected: number }[];
};

export type PilotFilters = { from: string; to: string; department: string | null; site: string | null };

/** Filters from the URL: like the reports, but the range defaults to the last 14 days. */
export function parsePilotFilters(
  sp: Record<string, string | string[] | undefined>,
  today: string,
): { filters: PilotFilters; error: FilterError | null } {
  const has = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v)?.trim();
  };
  const withDefault = has("from") ? sp : { ...sp, from: addDays(today, -(PILOT_DEFAULT_DAYS - 1)), to: has("to") ? sp.to : today };
  const { filters: f, error } = parseReportFilters(withDefault, today);
  return { filters: { from: f.from, to: f.to, department: f.department, site: f.site }, error };
}

export function pilotQuery(f: PilotFilters): string {
  const q = new URLSearchParams();
  q.set("from", f.from);
  q.set("to", f.to);
  if (f.department) q.set("dept", f.department);
  if (f.site) q.set("site", f.site);
  return q.toString();
}

/** Share as a number 0..1, or null when there is nothing to divide. */
export function share(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

export function percent(v: number | null): string {
  if (v === null) return "—";
  const p = v * 100;
  return `${p === 100 || p === 0 ? p.toFixed(0) : p.toFixed(1)}%`;
}

/** Milliseconds as seconds with one decimal ("1.4 s" / "1.4 ث"). */
export function seconds(ms: number | null, unit: string): string {
  return ms === null ? "—" : `${(ms / 1000).toFixed(1)} ${unit}`;
}

export type Verdict = "ok" | "warn" | "danger" | "none";

/** First-attempt success against PRD 16 (95%) and the pilot's stop line (90%). */
export function firstOkVerdict(rate: number | null): Verdict {
  if (rate === null) return "none";
  if (rate >= FIRST_OK_TARGET) return "ok";
  if (rate >= FIRST_OK_STOP) return "warn";
  return "danger";
}

/** Every day of the range, with zeros where nobody punched, for the chart. */
export function fillDays(m: Pick<PilotMetrics, "from" | "to" | "days">): { day: string; accepted: number; rejected: number }[] {
  const byDay = new Map(m.days.map((d) => [d.day, d]));
  const out: { day: string; accepted: number; rejected: number }[] = [];
  for (let d = m.from; d <= m.to; d = addDays(d, 1)) out.push(byDay.get(d) ?? { day: d, accepted: 0, rejected: 0 });
  return out;
}

/** A label for a refusal reason code, falling back to the code itself for one we do not know yet. */
export function reasonLabel(labels: Record<string, string>, code: string): string {
  return labels[code] ?? code;
}
