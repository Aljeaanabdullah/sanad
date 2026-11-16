import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPrefs } from "@/lib/prefs";
import { repT } from "@/lib/i18n-rep";
import { kuwaitDate, parseReportFilters } from "@/lib/reports";
import { attendanceAll, buildReportTable, punchAll } from "@/lib/report-data";
import { reportToPdf, reportToXlsx } from "@/lib/export-report";

// GET /reports/export/xlsx?kind=late&from=…&to=…&dept=…&site=…&file=…   (or /pdf)
// Supervisor / HR / admin. The whole period is exported (not only the page on screen),
// read with the user's own session, and each download is written to the audit log.
export async function GET(req: Request, ctx: RouteContext<"/reports/export/[format]">) {
  const me = await requireStaff();
  const { format } = await ctx.params;
  if (format !== "xlsx" && format !== "pdf") return new Response("Not found", { status: 404 });

  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const { filters: f, error } = parseReportFilters(sp, kuwaitDate());
  if (error) return new Response(error, { status: 400 });

  const { lang } = await getPrefs();
  const t = repT(lang);
  const supabase = await createClient();
  const [rows, dept, site] = await Promise.all([
    f.kind === "punches"
      ? punchAll(supabase, f).then((punches) => ({ punches }))
      : attendanceAll(supabase, f).then((attendance) => ({ attendance })),
    f.department ? supabase.from("departments").select("name_ar, name_en").eq("id", f.department).maybeSingle() : null,
    f.site ? supabase.from("sites").select("name_ar, name_en").eq("id", f.site).maybeSingle() : null,
  ]);
  const pick = (n: { name_ar: string; name_en: string } | null | undefined) => (n ? (lang === "ar" ? n.name_ar : n.name_en) : undefined);
  const table = buildReportTable(f, rows, lang, { department: pick(dept?.data), site: pick(site?.data) });

  const body = format === "xlsx" ? await reportToXlsx(table, t.kinds[f.kind]) : await reportToPdf(table, t.pdfCut);

  await createAdminClient().from("audit_log").insert({
    actor_user_id: me.userId,
    action: `export_${format}`,
    table_name: f.kind === "punches" ? "attendance_punches" : "attendance_days",
    record_id: `report:${f.kind}`,
    new_data: {
      report: f.kind,
      from: f.from,
      to: f.to,
      department_id: f.department,
      site_id: f.site,
      file_number: f.file,
      rows: table.rows.length,
    },
  });

  const file = `sanad-${f.kind}-${f.from}${f.to !== f.from ? `_${f.to}` : ""}.${format}`;
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type":
        format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "no-store",
    },
  });
}
