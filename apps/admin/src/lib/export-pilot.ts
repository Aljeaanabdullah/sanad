import "server-only";
import ExcelJS from "exceljs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Lang } from "./i18n";
import { pilotT } from "./i18n-pilot";
import { clientTimes, fillDays, percent, RETRY_MINUTES, reasonLabel, share, type PilotFilters, type PilotMetrics } from "./pilot";

/** The metrics for a period, read with the caller's session (the SQL function is security invoker). */
export async function loadPilotMetrics(supabase: SupabaseClient, f: PilotFilters): Promise<PilotMetrics> {
  const { data, error } = await supabase.rpc("pilot_metrics", {
    p_from: f.from,
    p_to: f.to,
    p_department: f.department,
    p_site: f.site,
    p_retry_minutes: RETRY_MINUTES,
  });
  if (error) throw new Error(error.message);
  return data as PilotMetrics;
}

const secs = (ms: number | null) => (ms === null ? "—" : Number((ms / 1000).toFixed(1)));

/** Excel workbook of the pilot metrics: summary, refusal reasons, methods and days (right-to-left in Arabic). */
export async function pilotToXlsx(
  m: PilotMetrics,
  lang: Lang,
  scope: { department?: string; site?: string; exportedAt: string },
): Promise<Buffer> {
  const t = pilotT(lang);
  const X = t.xlsx;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sanad";
  const view = [{ rightToLeft: lang === "ar", state: "frozen" as const, ySplit: 1 }];
  const header = (ws: ExcelJS.Worksheet) => {
    const row = ws.getRow(1);
    row.font = { bold: true, color: { argb: "FFFFFFFF" } };
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0E5A61" } }; // sea-glass primary
  };
  const firstOk = share(m.first_ok, m.tries);
  const { client, full } = clientTimes(m);

  const sum = wb.addWorksheet(X.sheetSummary, { views: view });
  sum.columns = [
    { header: X.metric, width: 34 },
    { header: X.value, width: 26 },
    { header: X.target, width: 22 },
  ];
  header(sum);
  sum.addRows([
    [t.period, `${m.from} — ${m.to}`, ""],
    [t.department, scope.department ?? t.all, ""],
    [t.site, scope.site ?? t.all, ""],
    [t.attempts, m.attempts, ""],
    [X.acceptedLabel, m.accepted, ""],
    [t.rejected, m.rejected, ""],
    [X.employeesLabel, m.employees, ""],
    [X.triesLabel, m.tries, ""],
    [X.firstOkCount, m.first_ok, ""],
    [t.firstOk, percent(firstOk), "≥ 95%"],
    [X.serverP50, secs(m.server_ms.p50), ""],
    [X.serverP90, secs(m.server_ms.p90), ""],
    [X.serverMax, secs(m.server_ms.max), ""],
    ...(full.n > 0
      ? [
          [X.clientN, client.n, ""],
          [X.clientP50, secs(client.p50), ""],
          [X.clientP90, secs(client.p90), ""],
          [X.fullP50, secs(full.p50), X.fullTimeTarget],
          [X.fullP90, secs(full.p90), X.fullTimeTarget],
          [X.fullMax, secs(full.max), ""],
          [X.fullUnder, percent(share(full.under_10s, full.n)), ""],
        ]
      : [[t.fullTime, X.fullTimeNone, X.fullTimeTarget]]),
    [X.exportedAt, scope.exportedAt, ""],
    [],
    [X.notes, "", ""],
    ...t.limits.map((l) => ["", l, ""]),
  ]);

  const reasons = wb.addWorksheet(X.sheetReasons, { views: view });
  reasons.columns = [
    { header: t.reason, width: 40 },
    { header: t.count, width: 12 },
    { header: t.shareCol, width: 12 },
  ];
  header(reasons);
  for (const r of m.reasons) reasons.addRow([reasonLabel(t.reasons, r.reason), r.n, percent(share(r.n, m.rejected))]);

  const methods = wb.addWorksheet(X.sheetMethods, { views: view });
  methods.columns = [
    { header: t.method, width: 36 },
    { header: t.attempts, width: 16 },
    { header: t.accepted, width: 12 },
    { header: t.rejectedCol, width: 12 },
    { header: t.firstOkCol, width: 22 },
  ];
  header(methods);
  for (const r of m.methods) {
    methods.addRow([t.methods[r.method] ?? r.method, r.attempts, r.accepted, r.rejected, percent(share(r.first_ok, r.tries))]);
  }

  const days = wb.addWorksheet(X.sheetDays, { views: view });
  days.columns = [
    { header: X.day, width: 14 },
    { header: t.accepted, width: 12 },
    { header: t.rejectedCol, width: 12 },
  ];
  header(days);
  for (const d of fillDays(m)) days.addRow([d.day, d.accepted, d.rejected]);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
