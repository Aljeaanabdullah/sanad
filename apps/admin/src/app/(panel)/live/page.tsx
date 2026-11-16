import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPrefs } from "@/lib/prefs";
import { repT } from "@/lib/i18n-rep";
import { reqT } from "@/lib/i18n-req";
import { groupLive, isLiveBucket, kuwaitTime, LIVE_BUCKETS, type LiveBucket, type LiveRow } from "@/lib/reports";
import { buttonClass, Card, Field, Select, Table } from "@/components/ui";
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
  const locale = ar ? "ar-KW" : "en-GB";
  const updated = new Intl.DateTimeFormat(locale, { timeStyle: "medium", timeZone: "Asia/Kuwait" }).format(new Date());
  const todayLabel = new Intl.DateTimeFormat(locale, { dateStyle: "full", timeZone: "Asia/Kuwait" }).format(new Date());
  const link = (g: LiveBucket) => {
    const q = new URLSearchParams();
    if (dept) q.set("dept", dept);
    if (site) q.set("site", site);
    q.set("group", g);
    return `/live?${q}`;
  };
  const tone: Partial<Record<LiveBucket, string>> = { late: "text-accent", absent: "text-danger", not_arrived: "text-danger" };

  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t.liveTitle}</h1>
          <p className="text-sm text-muted">
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

      <Card>
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
      </Card>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="live-counts">
        {LIVE_BUCKETS.map((b) => (
          <li key={b}>
            <Link
              href={link(b)}
              aria-current={b === group ? "true" : undefined}
              data-bucket={b}
              className={`flex h-full flex-col gap-1 rounded-2xl border bg-surface p-4 hover:bg-primary-soft ${
                b === group ? "border-accent ring-2 ring-accent" : "border-line"
              }`}
            >
              <span className="text-sm text-muted">{t.buckets[b]}</span>
              <span className={`text-3xl font-bold tabular-nums ${tone[b] ?? ""}`} data-testid={`count-${b}`}>
                {counts[b].toLocaleString(locale)}
              </span>
              {t.bucketHints[b] && <span className="text-xs text-muted">{t.bucketHints[b]}</span>}
            </Link>
          </li>
        ))}
      </ul>

      <Card>
        <h2 className="mb-3 font-bold">{t.listOf(t.buckets[group], counts[group])}</h2>
        {list.length === 0 ? (
          <p className="text-sm text-muted">{t.none}</p>
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
                    <td>
                      <Link href={`/records/${r.employee_id}`} className="text-primary hover:underline">
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
                    <td className={r.late_minutes > 0 ? "text-danger" : ""}>{r.late_minutes > 0 ? r.late_minutes : "—"}</td>
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
