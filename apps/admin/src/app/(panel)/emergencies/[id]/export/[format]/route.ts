import { requireEmergencyStaff } from "@/lib/emergency-auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPrefs } from "@/lib/prefs";
import type { Board } from "@/lib/emergency";
import { emergencyToPdf, emergencyToXlsx } from "@/lib/export-emergency";

// GET /emergencies/<id>/export/xlsx  or  /pdf — admin and supervisors. Each download is written to the audit log.
export async function GET(_req: Request, ctx: RouteContext<"/emergencies/[id]/export/[format]">) {
  const me = await requireEmergencyStaff();
  const { id, format } = await ctx.params;
  if (format !== "xlsx" && format !== "pdf") return new Response("Not found", { status: 404 });

  const { lang } = await getPrefs();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("emergency_board", { p_emergency: id });
  if (error || !data) return new Response("Not found", { status: 404 });
  const board = data as Board;

  const body = format === "xlsx" ? await emergencyToXlsx(board, lang) : await emergencyToPdf(board, lang);

  await createAdminClient().from("audit_log").insert({
    actor_user_id: me.userId,
    action: `export_${format}`,
    table_name: "emergencies",
    record_id: id,
    new_data: { status: board.emergency.status, targets: board.people.length },
  });

  const day = board.emergency.started_at.slice(0, 10);
  const file = `sanad-emergency-${day}-${id.slice(0, 8)}.${format}`;
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type":
        format === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/pdf",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "no-store",
    },
  });
}
