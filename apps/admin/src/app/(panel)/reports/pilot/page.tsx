import Link from "next/link";
import type { ReactNode } from "react";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPrefs } from "@/lib/prefs";
import { pilotT } from "@/lib/i18n-pilot";
import { kuwaitDate } from "@/lib/reports";
import { loadPilotMetrics } from "@/lib/export-pilot";
import {
  clientTimes,
  fillDays,
  firstOkVerdict,
  fullTimeVerdict,
  parsePilotFilters,
  percent,
  pilotQuery,
  reasonLabel,
  seconds,
  share,
  type PilotMetrics,
} from "@/lib/pilot";
import { Alert, Badge, buttonClass, Card, Empty, Field, Icon, Input, Select, Table } from "@/components/ui";

type Named = { id: string; name_ar: string; name_en: string };

// Pilot metrics (Phase 13, PRD section 16): punch time, first-attempt success, refusals by reason,
// and the verification method. Supervisor / HR / admin; read with the user's own session.
export default async function PilotMetricsPage({ searchParams }: PageProps<"/reports/pilot">) {
  await requireStaff();
  const { lang } = await getPrefs();
  const t = pilotT(lang);
  const ar = lang === "ar";
  const today = kuwaitDate();
  const { filters: f, error } = parsePilotFilters(await searchParams, today);
  const supabase = await createClient();

  const [{ data: depts }, { data: sites }, metrics] = await Promise.all([
    supabase.from("departments").select("id, name_ar, name_en").order(ar ? "name_ar" : "name_en"),
    supabase.from("sites").select("id, name_ar, name_en").order(ar ? "name_ar" : "name_en"),
    loadPilotMetrics(supabase, f).catch(() => null),
  ]);
  const name = (n: Named) => (ar ? n.name_ar : n.name_en);
  const nf = new Intl.NumberFormat(ar ? "ar-KW-u-nu-latn" : "en-US");
  const n = (v: number) => nf.format(v);

  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <Link href="/reports" className="mb-1 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
            <Icon name="back" />
            {t.back}
          </Link>
          <h1 className="text-2xl font-bold">{t.title}</h1>
          <p className="text-sm text-muted">{t.hint}</p>
        </div>
        {metrics && metrics.attempts > 0 && (
          <a href={`/reports/pilot/export?${pilotQuery(f)}`} className={buttonClass.secondary} data-testid="pilot-export-xlsx">
            {t.exportXlsx}
          </a>
        )}
      </div>

      <Card>
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-start" role="search">
          <Field label={t.from}>
            <Input type="date" name="from" defaultValue={f.from} max={today} required dir="ltr" />
          </Field>
          <Field label={t.to}>
            <Input type="date" name="to" defaultValue={f.to} max={today} required dir="ltr" />
          </Field>
          <Field label={t.department}>
            <Select name="dept" defaultValue={f.department ?? ""}>
              <option value="">{t.all}</option>
              {(depts ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {name(d)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.site}>
            <Select name="site" defaultValue={f.site ?? ""}>
              <option value="">{t.all}</option>
              {(sites ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {name(s)}
                </option>
              ))}
            </Select>
          </Field>
          <button type="submit" className={`${buttonClass.primary} lg:mt-[1.625rem]`}>
            {t.apply}
          </button>
        </form>
      </Card>

      {error && (
        <Alert kind="error">
          {t.errors[error]} {t.shownDefault}
        </Alert>
      )}

      {!metrics ? (
        <Alert kind="error">{t.loadFailed}</Alert>
      ) : metrics.attempts === 0 ? (
        <Empty data-testid="pilot-empty">{t.noData}</Empty>
      ) : (
        <Metrics m={metrics} t={t} n={n} />
      )}

      <Card>
        <h2 className="mb-2 font-bold">{t.limitsTitle}</h2>
        <ul className="flex list-disc flex-col gap-1.5 ps-5 text-sm text-muted">
          {t.limits.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Metrics({ m, t, n }: { m: PilotMetrics; t: ReturnType<typeof pilotT>; n: (v: number) => string }) {
  const firstOk = share(m.first_ok, m.tries);
  const verdict = firstOkVerdict(firstOk);
  const tone = verdict === "none" ? "off" : verdict;
  const { client, full } = clientTimes(m);
  const fullVerdict = fullTimeVerdict(full);
  const days = fillDays(m);
  const maxDay = Math.max(1, ...days.map((d) => d.accepted + d.rejected));
  const maxReason = Math.max(1, ...m.reasons.map((r) => r.n));

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" data-testid="pilot-stats">
        <Tile label={t.attempts} value={n(m.attempts)}>
          {t.attemptsSub(n(m.accepted), n(m.rejected))}
          <br />
          {t.employees(n(m.employees))}
        </Tile>
        <Tile label={t.firstOk} value={percent(firstOk)} testId="pilot-first-ok">
          <span className="mb-1 block">
            <Badge tone={tone}>{t.verdict[verdict]}</Badge>
          </span>
          {t.firstOkSub(n(m.first_ok), n(m.tries))}. {t.firstOkTarget}
        </Tile>
        <Tile label={t.fullTime} value={seconds(full.p50, t.sec)} testId="pilot-full-time">
          {full.n > 0 ? (
            <>
              <span className="mb-1 block">
                <Badge tone={fullVerdict === "none" ? "off" : fullVerdict}>{t.fullVerdict[fullVerdict]}</Badge>
              </span>
              {t.fullTimeSub(seconds(full.p90, t.sec), seconds(client.p50, t.sec), seconds(m.server_ms.p50, t.sec), n(full.n))}
              <br />
              {t.fullTimeUnder(percent(share(full.under_10s, full.n)))}
            </>
          ) : (
            t.fullTimeNone
          )}
        </Tile>
        <Tile label={t.serverTime} value={seconds(m.server_ms.p50, t.sec)}>
          {t.serverTimeSub(seconds(m.server_ms.p90, t.sec), n(m.server_ms.n))}
        </Tile>
        <Tile label={t.rejected} value={n(m.rejected)} valueClass={m.rejected > 0 ? "text-danger" : ""}>
          {t.rejectedSub(percent(share(m.rejected, m.attempts)))}
        </Tile>
      </ul>

      <Card>
        <div className="mb-3 flex flex-wrap items-end gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1">
            <h2 className="font-bold">{t.chartTitle}</h2>
            <p className="text-sm text-muted">{t.chartHint}</p>
          </div>
          <ul className="flex gap-4 text-[0.8125rem]" aria-label={t.chartTitle}>
            <li className="flex items-center gap-1.5">
              <i className="inline-block size-2.5 rounded-sm bg-primary" aria-hidden />
              {t.legendAccepted}
            </li>
            <li className="flex items-center gap-1.5">
              <i className="inline-block size-2.5 rounded-sm bg-danger" aria-hidden />
              {t.legendRejected}
            </li>
          </ul>
        </div>
        <div className="overflow-x-auto">
          <ol className="flex h-44 min-w-max items-end gap-1 border-b border-line-strong pb-px sm:min-w-0" data-testid="pilot-chart">
            {days.map((d) => {
              const total = d.accepted + d.rejected;
              const tip = t.dayTip(d.day, d.accepted, d.rejected);
              return (
                <li
                  key={d.day}
                  title={tip}
                  aria-label={tip}
                  tabIndex={0}
                  className="group flex h-full min-w-5 flex-1 flex-col justify-end gap-0.5 rounded-t focus-visible:outline-2 focus-visible:outline-primary"
                >
                  {d.rejected > 0 && (
                    <span
                      className="block rounded-t bg-danger group-hover:opacity-80"
                      style={{ height: `${(d.rejected / maxDay) * 100}%` }}
                    />
                  )}
                  {d.accepted > 0 && (
                    <span
                      className={`block bg-primary group-hover:opacity-80 ${d.rejected > 0 ? "" : "rounded-t"}`}
                      style={{ height: `${(d.accepted / maxDay) * 100}%` }}
                    />
                  )}
                  {total === 0 && <span className="block h-px" />}
                </li>
              );
            })}
          </ol>
          <ol className="flex min-w-max gap-1 pt-1 text-[0.6875rem] text-muted tabular-nums sm:min-w-0" aria-hidden>
            {days.map((d) => (
              <li key={d.day} className="min-w-5 flex-1 text-center" dir="ltr">
                {d.day.slice(8)}
              </li>
            ))}
          </ol>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="font-bold">{t.reasonsTitle}</h2>
          <p className="mb-3 text-sm text-muted">{t.reasonsHint}</p>
          {m.reasons.length === 0 ? (
            <Empty>{t.noRejections}</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>{t.reason}</th>
                  <th>{t.count}</th>
                  <th>{t.shareCol}</th>
                </tr>
              </thead>
              <tbody data-testid="pilot-reasons">
                {m.reasons.map((r) => (
                  <tr key={r.reason}>
                    <td>
                      <span className="block">{reasonLabel(t.reasons, r.reason)}</span>
                      <span className="mt-1 block h-1.5 rounded-full bg-danger/80" style={{ width: `${(r.n / maxReason) * 100}%` }} aria-hidden />
                    </td>
                    <td className="tabular-nums">{n(r.n)}</td>
                    <td className="tabular-nums">
                      <span dir="ltr">{percent(share(r.n, m.rejected))}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 font-bold">{t.methodsTitle}</h2>
          <Table>
            <thead>
              <tr>
                <th>{t.method}</th>
                <th>{t.attempts}</th>
                <th>{t.accepted}</th>
                <th>{t.rejectedCol}</th>
                <th>{t.firstOkCol}</th>
              </tr>
            </thead>
            <tbody data-testid="pilot-methods">
              {m.methods.map((r) => (
                <tr key={r.method}>
                  <td>{t.methods[r.method] ?? r.method}</td>
                  <td className="tabular-nums">{n(r.attempts)}</td>
                  <td className="tabular-nums">{n(r.accepted)}</td>
                  <td className={`tabular-nums ${r.rejected > 0 ? "text-danger" : ""}`}>{n(r.rejected)}</td>
                  <td className="tabular-nums">
                    <span dir="ltr">{percent(share(r.first_ok, r.tries))}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}

function Tile({
  label,
  value,
  valueClass = "",
  testId,
  children,
}: {
  label: string;
  value: string;
  valueClass?: string;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <li data-testid={testId} className="flex flex-col gap-1 rounded-2xl border border-line bg-surface px-4 py-3 shadow-card">
      <span className="text-sm text-muted">{label}</span>
      <span className={`self-start text-[1.75rem] leading-9 font-semibold tabular-nums ${valueClass}`} dir="ltr">
        {value}
      </span>
      <span className="text-xs text-muted">{children}</span>
    </li>
  );
}
