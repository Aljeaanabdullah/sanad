import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPrefs } from "@/lib/prefs";
import { dashT } from "@/lib/i18n-dash";
import { bonusOf, hasOfficial, MONTH_RE, shiftMonth, type DashboardData } from "@/lib/sanad-dashboard";
import { Alert, Badge, Card, Table } from "@/components/ui";
import { AskBox } from "./ask-box";

// Sanad phase S1 (PRD 18): any employee's dashboard, exactly as they see it on the phone. View only.
// Access is enforced by the RPC: staff (supervisor, HR, admin) may open anyone.
export default async function EmployeeDashboardPage({ params, searchParams }: PageProps<"/records/[id]/dashboard">) {
  await requireStaff();
  const { id } = await params;
  const { lang } = await getPrefs();
  const t = dashT(lang);
  const ar = lang === "ar";
  const asked = String((await searchParams).month ?? "");
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("employee_dashboard", {
    p_employee: id,
    p_month: MONTH_RE.test(asked) ? asked : null,
  });
  if (error) {
    if (error.code === "P0002") notFound();
    const msg = error.code === "42501" ? t.errors.not_allowed : t.errors.generic;
    return (
      <div className="flex max-w-4xl flex-col gap-5">
        <Link href={`/records/${id}`} className="text-sm text-primary hover:underline">
          <span aria-hidden className="inline-block rtl:rotate-180">←</span> {t.back}
        </Link>
        <Alert kind="error">{msg}</Alert>
      </div>
    );
  }
  const d = data as DashboardData;
  // The current bonus period month (no month asked) is the newest one we can move to.
  const { data: cur } = MONTH_RE.test(asked) ? await supabase.rpc("employee_dashboard", { p_employee: id, p_month: null }) : { data };
  const currentMonth = (cur as DashboardData | null)?.month ?? d.month;
  const b = bonusOf(d);
  const e = d.employee;
  const dm = (iso: string) => {
    const [, m, dd] = iso.split("-").map(Number);
    return `${dd}/${m}`;
  };
  const statusText = b.eligible == null ? t.pending : b.eligible ? t.eligible : t.notEligible;
  const statusClass = b.eligible == null ? "text-muted" : b.eligible ? "text-emerald-700 dark:text-emerald-300" : "text-danger";
  const navClass = "rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-primary-soft";
  const a = d.attendance;
  const tiles: [string, number, boolean][] = [
    [t.present, a.present, false],
    [t.absent, a.absent, a.absent_unexcused > 0],
    [t.late, a.late_dates.length, a.late_dates.length >= 2],
    [t.leaveDays, d.leave_days, d.leave_days > 10],
  ];

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <Link href={`/records/${id}`} className="text-sm text-primary hover:underline">
        <span aria-hidden className="inline-block rtl:rotate-180">←</span> {t.back}
      </Link>

      <p data-testid="view-only" className="rounded-xl bg-primary-soft px-4 py-2 text-sm">
        {t.viewOnly}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{ar ? e.name_ar : e.name_en}</h1>
        <span className="text-muted" dir="ltr">
          {e.file_number}
        </span>
        {(ar ? e.department_ar : e.department_en) && <Badge tone="ok">{ar ? e.department_ar : e.department_en}</Badge>}
        {e.job_title && <span className="text-sm text-muted">{e.job_title}</span>}
      </div>

      <div className="flex flex-wrap items-center gap-3" data-testid="period-nav">
        <Link href={`/records/${id}/dashboard?month=${shiftMonth(d.month, -1)}`} className={navClass}>
          {t.prev}
        </Link>
        <div className="flex flex-col">
          <span className="font-bold">
            {t.listOf} {d.month}
          </span>
          <span className="text-xs text-muted" dir="ltr">
            {t.period}: {dm(d.period.from)} – {dm(d.period.to)}
          </span>
        </div>
        {d.month < currentMonth && (
          <Link href={`/records/${id}/dashboard?month=${shiftMonth(d.month, 1)}`} className={navClass}>
            {t.next}
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map(([label, value, bad]) => (
          <div key={label} className="rounded-2xl border border-line bg-surface p-4 text-center">
            <div className={`text-2xl font-bold ${bad ? "text-danger" : ""}`}>{value}</div>
            <div className="text-xs text-muted">{label}</div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted">
        {t.unexcused}: {a.absent_unexcused} · {t.missingCheckout}: {a.missing_checkout}
        {a.late_minutes > 0 && ` · ${t.lateMinutes}: ${a.late_minutes}`}
      </p>

      <Card className="border-accent">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="font-bold">{t.bonus}</h2>
          <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs">{t.sources[b.source]}</span>
        </div>
        <p data-testid="bonus-status" className={`text-2xl font-bold ${statusClass}`}>
          {statusText}
        </p>
        <p data-testid="bonus-reason" className="mt-1">
          {b.reason}
        </p>
        {!hasOfficial(d) && <p className="mt-2 text-xs text-muted">{t.estimateNote}</p>}
        {d.estimate.notes.map((n) => (
          <p key={n} className="mt-2 text-sm text-muted">
            ⓘ {n}
          </p>
        ))}
      </Card>

      <Card>
        <h2 className="mb-3 font-bold">{t.leaves}</h2>
        {d.leaves.length === 0 ? (
          <p className="text-sm text-muted">{t.none}</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t.type}</th>
                <th>{t.from}</th>
                <th>{t.to}</th>
                <th>{t.daysInPeriod}</th>
              </tr>
            </thead>
            <tbody>
              {d.leaves.map((l, i) => (
                <tr key={i}>
                  <td>
                    {l.type}
                    {l.note && <div className="text-xs text-muted">{l.note}</div>}
                  </td>
                  <td dir="ltr">{l.from}</td>
                  <td dir="ltr">{l.to ?? "—"}</td>
                  <td>{l.days_in_period}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 font-bold">{t.penalties}</h2>
        {d.penalties.length === 0 ? (
          <p className="text-sm text-muted">{t.none}</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t.type}</th>
                <th>{t.date}</th>
                <th>{t.reason}</th>
              </tr>
            </thead>
            <tbody>
              {d.penalties.map((p, i) => (
                <tr key={i}>
                  <td>{p.type}</td>
                  <td dir="ltr">{p.date}</td>
                  <td>{p.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 font-bold">{t.ask}</h2>
        <AskBox data={d} arabic={ar} labels={{ askHint: t.askHint, askSend: t.askSend, quick: t.quick }} />
      </Card>
    </div>
  );
}
