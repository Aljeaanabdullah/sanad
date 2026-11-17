import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPrefs } from "@/lib/prefs";
import { idealT } from "@/lib/i18n-ideal";
import {
  canApprove, CITATION_MAX, kuwaitMonth, monthName, pickMonth, REASON_MAX, shiftMonth, type Nomination, type WinnerRow,
} from "@/lib/ideal-employee";
import { Badge, Card, Empty, Icon, linkClass, Table } from "@/components/ui";
import { approveWinner } from "./actions";
import { ApproveForm } from "./approve-form";

// «الموظف المثالي» (S9), HR and the system admin: the month's nominations, approve one as the winner, and the
// archive. Supervisors nominate from the mobile app. Reads go through the signed-in user's client (RLS applies).
export default async function IdealEmployeePage({ searchParams }: PageProps<"/ideal-employee">) {
  const me = await requireStaff();
  if (me.role !== "hr" && me.role !== "admin") redirect("/");
  const { lang } = await getPrefs();
  const t = idealT(lang);
  const ar = lang === "ar";
  const current = kuwaitMonth();
  const month = pickMonth((await searchParams).month, current);
  const supabase = await createClient();

  const [nominationsRes, winnersRes] = await Promise.all([
    supabase.rpc("ideal_nominations", { p_month: `${month}-01` }),
    supabase
      .from("ideal_employee_winners")
      .select("month, employee_id, name_ar, name_en, job_title, department_ar, department_en, reason, citation, approved_at")
      .order("month", { ascending: false })
      .limit(60),
  ]);
  const nominations = (nominationsRes.data ?? []) as Nomination[];
  const winners = (winnersRes.data ?? []) as WinnerRow[];
  const winner = winners.find((w) => w.month.slice(0, 7) === month) ?? null;
  const decided = winner != null;
  const label = monthName(month, lang);
  const dateTime = new Intl.DateTimeFormat(ar ? "ar-KW-u-nu-latn" : "en-GB", { dateStyle: "medium", timeStyle: "short", hourCycle: "h23", timeZone: "Asia/Kuwait" });
  const day = new Intl.DateTimeFormat(ar ? "ar-KW-u-nu-latn" : "en-GB", { dateStyle: "medium", timeZone: "Asia/Kuwait" });
  const navClass = "inline-flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-sm hover:border-primary hover:bg-primary-soft";

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{t.title}</h1>
        <p className="text-sm text-muted">{t.hint}</p>
      </div>

      <nav aria-label={t.title} className="flex flex-wrap items-center gap-2">
        <Link href={`/ideal-employee?month=${shiftMonth(month, -1)}`} className={navClass}>
          <Icon name="prev" />
          {t.prev}
        </Link>
        <span className="px-2 font-bold" data-testid="ideal-month">{label}</span>
        {month < current && (
          <Link href={`/ideal-employee?month=${shiftMonth(month, 1)}`} className={navClass}>
            {t.next}
            <Icon name="next" />
          </Link>
        )}
      </nav>

      {winner && (
        <Card>
          <div data-testid="ideal-winner" className="flex flex-col gap-2">
            <p className="text-sm font-medium text-primary">{t.winnerOf(label)}</p>
            <p className="text-xl font-bold">
              <Link href={`/records/${winner.employee_id}`} className={linkClass}>{ar ? winner.name_ar : winner.name_en}</Link>
            </p>
            <p className="text-sm text-muted">{[winner.job_title, ar ? winner.department_ar : winner.department_en].filter(Boolean).join(" · ")}</p>
            <p className="whitespace-pre-wrap">{winner.reason}</p>
            {winner.citation && <p className="font-medium text-primary">«{winner.citation}»</p>}
          </div>
        </Card>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">{t.nominations(label)}</h2>
        {nominations.length === 0 && <Empty data-testid="ideal-empty">{t.noNominations}</Empty>}
        {nominations.map((n) => {
          const approvable = canApprove(n, { meId: me.id, role: me.role, decided });
          return (
            <Card key={n.id}>
              <div data-testid="ideal-nomination" className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold">
                    <Link href={`/records/${n.nominee_id}`} className={linkClass}>{ar ? n.nominee_name_ar : n.nominee_name_en}</Link>
                  </h3>
                  <span className="text-sm text-muted" dir="ltr">{n.nominee_file_number}</span>
                  {n.is_winner && <Badge tone="ok">{t.winnerBadge}</Badge>}
                </div>
                <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
                  <dt className="text-muted">{t.department}</dt>
                  <dd>{ar ? n.department_ar : n.department_en}</dd>
                  {n.nominee_job_title && (
                    <>
                      <dt className="text-muted">{t.jobTitle}</dt>
                      <dd>{n.nominee_job_title}</dd>
                    </>
                  )}
                  <dt className="text-muted">{t.nominatedBy}</dt>
                  <dd>
                    {n.nominator_id ? (
                      <>
                        {ar ? n.nominator_name_ar : n.nominator_name_en} · <span dir="ltr">{n.nominator_file_number}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </dd>
                  <dt className="text-muted">{t.reason}</dt>
                  <dd className="whitespace-pre-wrap">{n.reason}</dd>
                  <dt className="text-muted">{t.updatedAt}</dt>
                  <dd>{dateTime.format(new Date(n.updated_at))}</dd>
                </dl>
                {approvable ? (
                  <ApproveForm
                    action={approveWinner.bind(null, n.id)}
                    defaultReason={n.reason}
                    labels={{
                      publicReason: t.publicReason, publicReasonHint: t.publicReasonHint, citation: t.citation,
                      citationHint: t.citationHint, confirm: t.confirm, approve: t.approve, approved: t.approved,
                    }}
                    errors={t.errors}
                    limits={{ reason: REASON_MAX, citation: CITATION_MAX }}
                  />
                ) : !decided && n.nominee_id === me.id ? (
                  <p className="text-sm text-muted">{t.selfNote}</p>
                ) : null}
              </div>
            </Card>
          );
        })}
        {decided && nominations.length > 0 && <p className="text-sm text-muted">{t.decidedNote}</p>}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">{t.archive}</h2>
        {winners.length === 0 ? (
          <Empty data-testid="ideal-archive-empty">{t.archiveEmpty}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t.cols.month}</th>
                <th>{t.cols.name}</th>
                <th>{t.cols.jobTitle}</th>
                <th>{t.cols.department}</th>
                <th>{t.cols.citation}</th>
                <th>{t.cols.approvedAt}</th>
              </tr>
            </thead>
            <tbody>
              {winners.map((w) => (
                <tr key={w.month} data-testid="ideal-archive-row">
                  <td>
                    <Link href={`/ideal-employee?month=${w.month.slice(0, 7)}`} className={linkClass}>{monthName(w.month, lang)}</Link>
                  </td>
                  <td>
                    <Link href={`/records/${w.employee_id}`} className={linkClass}>{ar ? w.name_ar : w.name_en}</Link>
                  </td>
                  <td>{w.job_title ?? "—"}</td>
                  <td>{(ar ? w.department_ar : w.department_en) ?? "—"}</td>
                  <td>{w.citation ?? "—"}</td>
                  <td>{day.format(new Date(w.approved_at))}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </div>
  );
}
