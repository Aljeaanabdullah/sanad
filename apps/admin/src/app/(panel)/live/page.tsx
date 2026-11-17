import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPrefs } from "@/lib/prefs";
import { repT } from "@/lib/i18n-rep";
import { reqT } from "@/lib/i18n-req";
import { DISC_BUCKETS, discShares, groupLive, isLiveBucket, kuwaitTime, LIVE_BUCKETS, type LiveBucket, type LiveRow } from "@/lib/reports";
import { buttonClass, Card, Empty, Field, linkClass, Select, Table } from "@/components/ui";
import { AutoRefresh } from "./auto-refresh";

type Named = { id: string; name_ar: string; name_en: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_LIST = 500;

// Live board (PRD section 10): today's shifts right now, by department and site.
// public.live_board does the counting rules in the database; this page only groups and shows.
export default async function LivePage({ searchParams }: PageProps<"/live">) {
  await requireStaff();
  const { lang } = await getPrefs();
  const t = repT(lang);
  const leaveNames = reqT(lang).leaveTypes;
  const ar = lang === "ar";
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const dept = UUID.test(one(sp.dept)) ? one(sp.dept) : null;
  const site = UUID.test(one(sp.site)) ? one(sp.site) : null;
  const groupRaw = one(sp.group);
  const group: LiveBucket = isLiveBucket(groupRaw) ? groupRaw : "not_arrived";

  const supabase = await createClient();
  const [{ data: depts }, { data: sites }, { data, error }] = await Promise.all([
    supabase.from("departments").select("id, name_ar, name_en").order(ar ? "name_ar" : "name_en"),
    supabase.from("sites").select("id, name_ar, name_en").order(ar ? "name_ar" : "name_en"),
    supabase.rpc("live_board", { p_department: dept, p_site: site }),
  ]);
  if (error) throw new Error(error.message);
  const { counts, lists } = groupLive((data ?? []) as LiveRow[]);
  const list = lists[group];

  const name = (n: Named) => (ar ? n.name_ar : n.name_en);
  const locale = ar ? "ar-KW-u-nu-latn" : "en-GB";
  const updated = new Intl.DateTimeFormat(locale, { timeStyle: "medium", hourCycle: "h23", timeZone: "Asia/Kuwait" }).format(new Date());
  const todayLabel = new Intl.DateTimeFormat(locale, { dateStyle: "full", timeZone: "Asia/Kuwait" }).format(new Date());
  const link = (g: LiveBucket) => {
    const q = new URLSearchParams();
    if (dept) q.set("dept", dept);
    if (site) q.set("site", site);
    q.set("group", g);
    return `/live?${q}`;
  };
  const tone: Partial<Record<LiveBucket, string>> = { late: "text-warn", absent: "text-danger", not_arrived: "text-danger" };
  // One enamel hue per state (globals.css), used by the disc field, the legend and the tiles.
  const disc: Record<LiveBucket, string> = {
    scheduled: "[--disc:var(--disc-scheduled)]",
    on_time: "[--disc:var(--disc-on-time)]",
    late: "[--disc:var(--disc-late)]",
    not_arrived: "[--disc:var(--disc-not-arrived)]",
    absent: "[--disc:var(--disc-absent)]",
    leave: "[--disc:var(--disc-leave)]",
    upcoming: "[--disc:var(--disc-upcoming)]",
    checked_out: "[--disc:var(--disc-out)]",
  };
  const shares = discShares(counts);
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });

  return (
    <div className="flex max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{t.liveTitle}</h1>
          <p className="mt-1 text-sm text-muted">
            {todayLabel} · {t.liveHint}
          </p>
        </div>
        <div className="ms-auto flex items-center gap-3">
          <span className="text-sm text-muted" data-testid="live-updated">
            {t.lastUpdated}: <span dir="ltr">{updated}</span>
          </span>
          <AutoRefresh seconds={30} label={t.refreshNow} busyLabel={t.refreshing} />
        </div>
      </div>

      {/* The shift as a field of discs: always 100, so any day, department or site compares at a glance. */}
      <Card>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="font-bold">{t.shiftNow}</h2>
          <p className="text-xs text-muted">{t.discHint(counts.scheduled.toLocaleString(locale))}</p>
        </div>
        <div className="disc-field" aria-hidden data-testid="disc-field">
          {counts.scheduled === 0
            ? Array.from({ length: 100 }, (_, i) => <i key={i} />)
            : DISC_BUCKETS.flatMap((b) => Array.from({ length: shares[b] }, (_, i) => <i key={`${b}-${i}`} className={disc[b]} />))}
        </div>
        <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[0.8125rem] sm:flex sm:flex-wrap">
          {DISC_BUCKETS.map((b) => (
            <li key={b} className="flex items-center gap-2">
              <i className={`disc ${disc[b]}`} aria-hidden />
              <span className="text-muted">{t.buckets[b]}</span>
              <span className="font-medium" dir="ltr">
                {percent.format(counts.scheduled ? counts[b] / counts.scheduled : 0)}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {/* On wide screens the filters sit straight on the ground, so the list starts higher. */}
      <div className="rounded-2xl border border-line bg-surface p-4 shadow-card lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
        <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" role="search">
          <input type="hidden" name="group" value={group} />
          <Field label={t.department}>
            <Select name="dept" defaultValue={dept ?? ""}>
              <option value="">{t.all}</option>
              {(depts ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {name(d)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.site}>
            <Select name="site" defaultValue={site ?? ""}>
              <option value="">{t.all}</option>
              {(sites ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {name(s)}
                </option>
              ))}
            </Select>
          </Field>
          <button type="submit" className={buttonClass.primary}>
            {t.apply}
          </button>
        </form>
      </div>

      <ul className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4" data-testid="live-counts">
        {LIVE_BUCKETS.map((b) => (
          <li key={b}>
            <Link
              href={link(b)}
              aria-current={b === group ? "true" : undefined}
              data-bucket={b}
              className={`flex h-full flex-col gap-0.5 rounded-2xl border p-3 shadow-card sm:px-4 ${
                b === group
                  ? "border-primary bg-primary-soft ring-1 ring-primary"
                  : "border-line bg-surface hover:border-line-strong hover:bg-surface-2"
              }`}
            >
              <span className="flex items-center gap-2 text-sm text-muted">
                <i className={`disc ${disc[b]}`} aria-hidden />
                {t.buckets[b]}
              </span>
              <span className={`text-[1.75rem] leading-9 font-semibold tabular-nums ${counts[b] > 0 ? (tone[b] ?? "") : ""}`} data-testid={`count-${b}`}>
                {counts[b].toLocaleString(locale)}
              </span>
              {t.bucketHints[b] && <span className="text-xs text-muted max-sm:sr-only">{t.bucketHints[b]}</span>}
            </Link>
          </li>
        ))}
      </ul>

      <Card>
        <h2 className="mb-3 font-bold">{t.listOf(t.buckets[group], counts[group])}</h2>
        {list.length === 0 ? (
          <Empty>{t.none}</Empty>
        ) : (
          <>
            {list.length > MAX_LIST && <p className="mb-3 text-sm text-muted">{t.showingFirst(MAX_LIST, list.length)}</p>}
            <Table>
              <thead>
                <tr>
                  <th>{t.columns.file}</th>
                  <th>{t.columns.name}</th>
                  <th>{t.columns.department}</th>
                  <th>{t.shiftTime}</th>
                  <th>{t.columns.checkIn}</th>
                  <th>{t.columns.lateMinutes}</th>
                  <th>{t.columns.checkOut}</th>
                  <th>{t.columns.site}</th>
                  {group === "leave" && <th>{t.leaveType}</th>}
                </tr>
              </thead>
              <tbody data-testid="live-rows">
                {list.slice(0, MAX_LIST).map((r) => (
                  <tr key={`${r.employee_id}-${r.shift_start}`}>
                    <td dir="ltr" className="text-start">
                      {r.file_number}
                    </td>
                    <td className="whitespace-nowrap">
                      <Link href={`/records/${r.employee_id}`} className={linkClass}>
                        {ar ? r.name_ar : r.name_en}
                      </Link>
                    </td>
                    <td>{(ar ? r.department_ar : r.department_en) ?? "—"}</td>
                    <td className="whitespace-nowrap">
                      <span dir="ltr">
                        {kuwaitTime(r.shift_start)}–{kuwaitTime(r.shift_end)}
                      </span>
                    </td>
                    <td>{r.check_in_at ? <span dir="ltr">{kuwaitTime(r.check_in_at)}</span> : "—"}</td>
                    <td className={r.late_minutes > 0 ? "font-medium text-warn" : "text-muted"}>{r.late_minutes > 0 ? r.late_minutes : "—"}</td>
                    <td>{r.check_out_at ? <span dir="ltr">{kuwaitTime(r.check_out_at)}</span> : "—"}</td>
                    <td>{(ar ? r.site_ar : r.site_en) ?? "—"}</td>
                    {group === "leave" && <td>{leaveNames[r.leave_type ?? ""] ?? r.leave_type}</td>}
                  </tr>
                ))}
              </tbody>
            </Table>
          </>
        )}
      </Card>
    </div>
  );
}
