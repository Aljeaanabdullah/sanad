import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPrefs } from "@/lib/prefs";
import { kuwaitDate } from "@/lib/reports";
import { parsePilotFilters } from "@/lib/pilot";
import { loadPilotMetrics, pilotToXlsx } from "@/lib/export-pilot";

// GET /reports/pilot/export?from=…&to=…&dept=…&site=…
// Supervisor / HR / admin. Read with the user's own session (RLS applies); each download is written
// to the audit log like the other report exports.
export async function GET(req: Request) {
  const me = await requireStaff();
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const today = kuwaitDate();
  const { filters: f, error } = parsePilotFilters(sp, today);
  if (error) return new Response(error, { status: 400 });

  const { lang } = await getPrefs();
  const supabase = await createClient();
  const [metrics, dept, site] = await Promise.all([
    loadPilotMetrics(supabase, f),
    f.department ? supabase.from("departments").select("name_ar, name_en").eq("id", f.department).maybeSingle() : null,
    f.site ? supabase.from("sites").select("name_ar, name_en").eq("id", f.site).maybeSingle() : null,
  ]);
  const pick = (n: { name_ar: string; name_en: string } | null | undefined) => (n ? (lang === "ar" ? n.name_ar : n.name_en) : undefined);
  const exportedAt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuwait",
    dateStyle: "short",
    timeStyle: "short",
    hourCycle: "h23",
  }).format(new Date());
  const body = await pilotToXlsx(metrics, lang, { department: pick(dept?.data), site: pick(site?.data), exportedAt });

  await createAdminClient().from("audit_log").insert({
    actor_user_id: me.userId,
    action: "export_xlsx",
    table_name: "attendance_punches",
    record_id: "report:pilot_metrics",
    new_data: { report: "pilot_metrics", from: f.from, to: f.to, department_id: f.department, site_id: f.site, attempts: metrics.attempts },
  });

  const file = `sanad-pilot-metrics-${f.from}${f.to !== f.from ? `_${f.to}` : ""}.xlsx`;
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "no-store",
    },
  });
}
