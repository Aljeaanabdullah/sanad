import type { Lang } from "@/lib/i18n";
import { attT } from "@/lib/i18n-att";
import { createClient } from "@/lib/supabase/server";
import { Card, Table } from "@/components/ui";

type Row = {
  day: string;
  kind: "work" | "continued" | "holiday" | "off" | "before_hire";
  shift_start: string | null;
  shift_end: string | null;
  arrival: "pending" | "on_time" | "late" | "absent" | null;
  departure: "pending" | "done" | "missing" | "not_applicable" | null;
  check_in_at: string | null;
  check_out_at: string | null;
  late_minutes: number;
  early_leave_minutes: number;
  check_in_corrected: boolean;
  check_out_corrected: boolean;
};

/** Kuwait calendar date, `days` days before today. */
function kuwaitDay(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuwait" }).format(d);
}

/**
 * An employee's attendance day by day, newest first (rules engine, Phase 7).
 * Default: the last 31 days. Pass `from` / `to` (Kuwait dates) and a `title` for another range.
 */
export async function AttendanceHistory({
  employeeId,
  lang,
  hasPattern,
  from = kuwaitDay(30),
  to = kuwaitDay(0),
  title,
}: {
  employeeId: string;
  lang: Lang;
  hasPattern: boolean;
  from?: string;
  to?: string;
  title?: string;
}) {
  const t = attT(lang);
  const heading = title ?? t.title;
  if (!hasPattern) {
    return (
      <Card>
        <h2 className="mb-2 font-bold">{heading}</h2>
        <p className="text-sm text-muted">{t.noPattern}</p>
      </Card>
    );
  }
  const supabase = await createClient();
  const { data } = await supabase.rpc("attendance_history", {
    p_employee: employeeId,
    p_from: from,
    p_to: to,
  });
  const rows = ((data ?? []) as Row[]).slice().reverse();
  const now = new Date();
  const locale = lang === "ar" ? "ar-KW-u-nu-latn" : "en-GB";
  const dayFmt = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Kuwait" });
  const time = (s: string | null) => (s ? timeFmt.format(new Date(s)) : "—");
  const late = rows.filter((r) => r.arrival === "late").length;
  const absent = rows.filter((r) => r.arrival === "absent").length;
  const missing = rows.filter((r) => r.departure === "missing").length;

  return (
    <Card>
      <h2 className="mb-1 font-bold">{heading}</h2>
      <p className="mb-2 text-sm text-muted">{t.hint}</p>
      <p className="mb-4 text-sm font-medium" data-testid="attendance-totals">
        {t.totals(late, absent, missing)}
      </p>
      <Table>
        <thead>
          <tr>
            <th>{t.day}</th>
            <th>{t.status}</th>
            <th className="max-sm:hidden">{t.shift}</th>
            <th>{t.checkIn}</th>
            <th>{t.checkOut}</th>
          </tr>
        </thead>
        <tbody data-testid="attendance-rows">
          {rows.map((r) => {
            // Each note is a disc and a word, in the live board's hues.
            const notes: { text: string; disc: string; tone?: string }[] = [];
            if (r.kind !== "work") notes.push({ text: t.kinds[r.kind], disc: "[--disc:var(--disc-upcoming)]" });
            else if (r.arrival === "late") notes.push({ text: t.lateBy(r.late_minutes), disc: "[--disc:var(--disc-late)]", tone: "text-warn" });
            else if (r.arrival === "pending" && r.shift_start && new Date(r.shift_start) > now)
              notes.push({ text: t.upcoming, disc: "[--disc:var(--disc-upcoming)]" });
            else if (r.arrival === "absent") notes.push({ text: t.arrival.absent, disc: "[--disc:var(--disc-absent)]", tone: "text-danger" });
            else if (r.arrival === "on_time") notes.push({ text: t.arrival.on_time, disc: "[--disc:var(--disc-on-time)]" });
            else if (r.arrival) notes.push({ text: t.arrival[r.arrival], disc: "[--disc:var(--disc-not-arrived)]" });
            if (r.departure === "missing") notes.push({ text: t.departure.missing, disc: "[--disc:var(--disc-not-arrived)]", tone: "text-danger" });
            if (r.early_leave_minutes > 0) notes.push({ text: t.earlyBy(r.early_leave_minutes), disc: "[--disc:var(--disc-late)]" });
            return (
              <tr key={r.day} className={r.kind === "work" ? "" : "text-muted"}>
                <td className="whitespace-nowrap">{dayFmt.format(new Date(`${r.day}T00:00:00Z`))}</td>
                <td>
                  {notes.map((n, i) => (
                    <span key={i} className={`flex items-center gap-2 whitespace-nowrap ${n.tone ?? ""}`}>
                      <i className={`disc ${n.disc}`} aria-hidden />
                      <span>{n.text}</span>
                    </span>
                  ))}
                </td>
                <td className="whitespace-nowrap max-sm:hidden">
                  {r.shift_start ? (
                    <span dir="ltr">
                      {time(r.shift_start)} – {time(r.shift_end)}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <span dir="ltr">{time(r.check_in_at)}</span>
                  {r.check_in_corrected && <span className="block text-xs text-info">{t.corrected}</span>}
                </td>
                <td>
                  <span dir="ltr">{time(r.check_out_at)}</span>
                  {r.check_out_corrected && <span className="block text-xs text-info">{t.corrected}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </Card>
  );
}
