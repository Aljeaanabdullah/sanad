import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPrefs } from "@/lib/prefs";
import { auditT } from "@/lib/i18n-audit";
import {
  EXPORT_MAX_ROWS,
  actionLabel,
  diffText,
  parseAuditFilters,
  recordName,
  subjectEmployeeId,
  summarize,
  tableLabel,
  type AuditEntry,
  type AuditFilters,
} from "@/lib/audit-log";
import { loadPeople, queryAuditLog } from "@/lib/audit-log-query";

const BATCH = 500;

// GET /audit-log/export?<same filters as the screen>
// Admin only. Excel of the filtered view (newest first, up to EXPORT_MAX_ROWS rows, secrets hidden).
// The export itself is written to the audit log as action "export_audit".
export async function GET(req: Request) {
  const me = await requireAdmin();
  const { lang } = await getPrefs();
  const t = auditT(lang);
  const { filters } = parseAuditFilters(new URL(req.url).searchParams);
  const base: AuditFilters = { ...filters, before: undefined, after: undefined };

  const supabase = await createClient();
  const rows: AuditEntry[] = [];
  let cursor: number | undefined;
  while (rows.length < EXPORT_MAX_ROWS) {
    const page = await queryAuditLog(supabase, { ...base, before: cursor }, Math.min(BATCH, EXPORT_MAX_ROWS - rows.length));
    rows.push(...page.rows);
    if (!page.hasOlder || page.rows.length === 0) break;
    cursor = page.rows.at(-1)!.id;
  }

  // Names in batches (the lookups use "in (…)" lists).
  const actors = new Map<string, { fileNumber: number | null; nameAr: string; nameEn: string }>();
  const subjects = new Map<string, { fileNumber: number | null; nameAr: string; nameEn: string }>();
  for (let i = 0; i < rows.length; i += 100) {
    const p = await loadPeople(supabase, rows.slice(i, i + 100));
    p.actors.forEach((v, k) => actors.set(k, v));
    p.subjects.forEach((v, k) => subjects.set(k, v));
  }

  const ar = lang === "ar";
  const nameOf = (p?: { nameAr: string; nameEn: string }) => (p ? (ar ? p.nameAr : p.nameEn) || p.nameAr : "");
  const time = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuwait",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "Sanad";
  const ws = wb.addWorksheet(t.title, { views: [{ rightToLeft: ar, state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "#", key: "id", width: 8 },
    { header: t.cols.time, key: "time", width: 20 },
    { header: t.cols.who, key: "who", width: 24 },
    { header: t.fields.file_number, key: "whoFile", width: 12 },
    { header: t.cols.action, key: "action", width: 14 },
    { header: t.cols.table, key: "table", width: 18 },
    { header: t.cols.record, key: "record", width: 24 },
    { header: t.employee, key: "recordFile", width: 14 },
    { header: t.cols.summary, key: "summary", width: 36 },
    { header: t.details, key: "details", width: 80 },
  ];
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFE6C878" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B1A33" } };

  for (const e of rows) {
    const actor = e.actor_user_id ? actors.get(e.actor_user_id) : undefined;
    const sid = subjectEmployeeId(e);
    const subject = sid ? subjects.get(sid) : undefined;
    ws.addRow({
      id: e.id,
      time: time.format(new Date(e.created_at)).replace(",", ""),
      who: e.actor_user_id ? nameOf(actor) || t.unknownUser : t.system,
      whoFile: actor?.fileNumber ?? "",
      action: actionLabel(t, e.action),
      table: tableLabel(t, e.table_name),
      record: nameOf(subject) || recordName(e, lang) || e.record_id || "",
      recordFile: subject?.fileNumber ?? "",
      summary: summarize(t, e),
      details: diffText(t, e),
    });
  }

  const body = Buffer.from(await wb.xlsx.writeBuffer());

  await createAdminClient()
    .from("audit_log")
    .insert({
      actor_user_id: me.userId,
      action: "export_audit",
      table_name: "audit_log",
      record_id: null,
      new_data: { rows: rows.length, filters: base },
    });

  const stamp = time.format(new Date()).slice(0, 10);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="sanad-audit-log-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
