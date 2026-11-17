import Link from "next/link";
import type { ReactNode } from "react";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPrefs } from "@/lib/prefs";
import { homeT } from "@/lib/i18n-home";
import { bonusSummary, QUICK_LINK_HREF, quickLinksFor, todaySummary } from "@/lib/home";
import { groupLive, type LiveRow } from "@/lib/reports";
import { Card } from "@/components/ui";

// Home of the web panel: today's attendance, what waits for the signed-in user, and shortcuts.
// Every read goes through the signed-in user's client, so RLS and the role checks in the
// database functions apply as on the other pages.
export default async function DashboardPage() {
  const me = await requireStaff();
  const { t: base, lang } = await getPrefs();
  const t = homeT(lang);
  const ar = lang === "ar";
  const canEmergency = me.role === "admin" || me.role === "supervisor";
  const supabase = await createClient();

  const [live, employees, inbox, emergencies, latestBonus] = await Promise.all([
    supabase.rpc("live_board", { p_department: null, p_site: null }),
    supabase.from("employees").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.rpc("approval_inbox"),
    canEmergency
      ? supabase.from("emergencies").select("id, is_drill").eq("status", "active").order("started_at", { ascending: false }).limit(5)
      : Promise.resolve(null),
    supabase.from("bonus_lists").select("month").order("month", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const today = live.error ? null : todaySummary(groupLive((live.data ?? []) as LiveRow[]).counts);
  const employeeCount = employees.error ? null : (employees.count ?? 0);
  const pending = inbox.error ? null : ((inbox.data ?? []) as unknown[]).length;
  const openEmergencies = emergencies && !emergencies.error ? ((emergencies.data ?? []) as { id: string; is_drill: boolean }[]) : null;

  const month = latestBonus.error ? null : ((latestBonus.data as { month: string } | null)?.month ?? null);
  let bonus = null as ReturnType<typeof bonusSummary>;
  let bonusFailed = !!latestBonus.error;
  if (month) {
    const count = () => supabase.from("bonus_lists").select("id", { count: "exact", head: true }).eq("month", month);
    const [all, eligible, drafts] = await Promise.all([count(), count().eq("eligibility", "مستحق"), count().eq("status", "مسودة")]);
    bonusFailed = !!(all.error || eligible.error || drafts.error);
    bonus = bonusFailed ? null : bonusSummary(month, all.count ?? 0, eligible.count ?? 0, drafts.count ?? 0);
  }

  const locale = ar ? "ar-KW" : "en-GB";
  const num = new Intl.NumberFormat(locale);
  const n = (v: number) => num.format(v);
  const todayLabel = new Intl.DateTimeFormat(locale, { dateStyle: "full", timeZone: "Asia/Kuwait" }).format(new Date());
  const monthLabel = (m: string) =>
    new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));
  const activeEmergency = openEmergencies?.find((e) => !e.is_drill) ?? openEmergencies?.[0] ?? null;

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-balance">
          {base.welcome}
          {ar ? "، " + me.nameAr : ", " + me.nameEn}
        </h1>
        <p className="text-sm text-muted">{todayLabel}</p>
      </div>

      {activeEmergency && (
        <Link
          href={`/emergencies/${activeEmergency.id}`}
          data-testid="home-emergency-banner"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-danger px-5 py-4 font-medium text-background hover:opacity-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
        >
          <span className="text-lg font-bold">{activeEmergency.is_drill ? t.emergencyDrill : t.emergencyActive}</span>
          <span className="flex items-center gap-1.5">
            {t.openEmergency}
            <Chevron />
          </span>
        </Link>
      )}

      <Card className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{t.today}</h2>
            <p className="text-sm text-muted">{t.todayHint}</p>
          </div>
          <Link href="/live" className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline underline-offset-4">
            {t.openLive}
            <Chevron />
          </Link>
        </div>

        {!today ? (
          <p className="text-muted">{t.unavailable}</p>
        ) : today.scheduled === 0 ? (
          <p className="text-muted" data-testid="home-no-shifts">{t.noShifts}</p>
        ) : (
          <>
            <p className="flex items-baseline gap-2" data-testid="home-arrived">
              <span className="text-5xl font-bold tabular-nums">{n(today.arrived)}</span>
              <span className="text-lg text-muted">
                / {n(today.scheduled)} {t.scheduled}
              </span>
            </p>
            <div className="flex h-3 overflow-hidden rounded-full bg-line" aria-hidden>
              <span className="bg-primary" style={{ width: `${today.shares.onTime}%` }} />
              <span className="bg-accent" style={{ width: `${today.shares.late}%` }} />
              <span className="bg-danger" style={{ width: `${today.shares.missing}%` }} />
            </div>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-5">
              <Stat swatch="bg-primary" label={t.onTime} value={n(today.onTime)} href="/live?group=on_time" />
              <Stat swatch="bg-accent" label={t.late} value={n(today.late)} href="/live?group=late" />
              <Stat swatch="bg-danger" label={t.missing} value={n(today.missing)} href="/live?group=not_arrived" />
              <Stat swatch="bg-line" label={t.leave} value={n(today.leave)} href="/live?group=leave" />
              <Stat swatch="bg-line" label={t.upcoming} value={n(today.upcoming)} href="/live?group=upcoming" />
            </ul>
          </>
        )}
      </Card>

      <div className={`grid gap-4 sm:grid-cols-2 ${canEmergency ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        <Tile label={t.employees} testId="home-employees">
          {employeeCount == null ? (
            <Unavailable text={t.unavailable} />
          ) : (
            <>
              <Big>{n(employeeCount)}</Big>
              <p className="text-sm text-muted">{t.employeesHint}</p>
            </>
          )}
        </Tile>

        <Tile label={t.approvals} href="/approvals" testId="home-approvals" highlight={!!pending}>
          {pending == null ? (
            <Unavailable text={t.unavailable} />
          ) : (
            <>
              <Big tone={pending ? "text-accent" : undefined}>{n(pending)}</Big>
              <p className="text-sm text-muted">{pending ? t.approvalsSome : t.approvalsNone}</p>
            </>
          )}
        </Tile>

        {canEmergency && (
          <Tile label={t.emergency} href="/emergencies" testId="home-emergency" danger={!!openEmergencies?.length}>
            {openEmergencies == null ? (
              <Unavailable text={t.unavailable} />
            ) : openEmergencies.length ? (
              <>
                <Big tone="text-danger">{n(openEmergencies.length)}</Big>
                <p className="text-sm font-medium text-danger">{activeEmergency?.is_drill ? t.emergencyDrill : t.emergencyActive}</p>
              </>
            ) : (
              <>
                <Big>{n(0)}</Big>
                <p className="text-sm text-muted">{t.emergencyNone}</p>
              </>
            )}
          </Tile>
        )}

        <Tile label={t.bonus} testId="home-bonus">
          {bonusFailed ? (
            <Unavailable text={t.unavailable} />
          ) : !bonus ? (
            <p className="text-sm text-muted">{t.bonusNone}</p>
          ) : (
            <>
              <p className="flex flex-wrap items-center gap-2">
                <span className="text-xl font-bold">{monthLabel(bonus.month)}</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${bonus.locked ? "bg-primary-soft text-primary" : "bg-line text-muted"}`}
                >
                  {bonus.locked ? t.bonusLocked : t.bonusDraft}
                </span>
              </p>
              <p className="text-sm text-muted">{t.bonusEligible(n(bonus.eligible), n(bonus.total))}</p>
            </>
          )}
        </Tile>
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="home-shortcuts">
        <h2 id="home-shortcuts" className="text-lg font-bold">
          {t.shortcuts}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickLinksFor(me.role).map((k) => {
            const [title, hint] = t.links[k];
            return (
              <li key={k}>
                <Link
                  href={QUICK_LINK_HREF[k]}
                  data-testid={`home-link-${k}`}
                  className="group flex h-full items-center justify-between gap-4 rounded-2xl border border-line bg-surface px-5 py-4 transition-colors hover:border-accent hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <span className="flex flex-col gap-0.5">
                    <span className="font-bold">{title}</span>
                    <span className="text-sm text-muted">{hint}</span>
                  </span>
                  <span className="text-muted transition-transform group-hover:text-primary group-hover:-translate-x-0.5 ltr:group-hover:translate-x-0.5">
                    <Chevron />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function Tile({
  label,
  href,
  testId,
  highlight,
  danger,
  children,
}: {
  label: string;
  href?: string;
  testId: string;
  highlight?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  const border = danger ? "border-danger" : highlight ? "border-accent" : "border-line";
  const cls = `flex h-full flex-col gap-1 rounded-2xl border ${border} bg-surface p-5`;
  const body = (
    <>
      <p className="flex items-center justify-between gap-2 text-sm font-medium text-muted">
        {label}
        {href && <Chevron />}
      </p>
      {children}
    </>
  );
  return href ? (
    <Link
      href={href}
      data-testid={testId}
      className={`${cls} transition-colors hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}
    >
      {body}
    </Link>
  ) : (
    <div data-testid={testId} className={cls}>
      {body}
    </div>
  );
}

function Big({ children, tone }: { children: ReactNode; tone?: string }) {
  return <p className={`text-4xl font-bold tabular-nums ${tone ?? ""}`}>{children}</p>;
}

function Unavailable({ text }: { text: string }) {
  return <p className="text-sm text-muted">{text}</p>;
}

function Stat({ swatch, label, value, href }: { swatch: string; label: string; value: string; href: string }) {
  return (
    <li>
      <Link href={href} className="group flex flex-col gap-0.5 rounded-lg focus-visible:outline-2 focus-visible:outline-primary">
        <span className="flex items-center gap-2 text-sm text-muted group-hover:text-foreground">
          <span className={`size-2.5 shrink-0 rounded-full ${swatch}`} aria-hidden />
          {label}
        </span>
        <span className="text-2xl font-bold tabular-nums">{value}</span>
      </Link>
    </li>
  );
}

/** Points "forward": left in Arabic, right in English. */
function Chevron() {
  return (
    <svg viewBox="0 0 16 16" className="size-4 shrink-0 ltr:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M10 3 5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
