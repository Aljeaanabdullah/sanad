import Link from "next/link";
import { notFound } from "next/navigation";
import { requireEmergencyStaff } from "@/lib/emergency-auth";
import { createClient } from "@/lib/supabase/server";
import { getPrefs } from "@/lib/prefs";
import { emgT } from "@/lib/i18n-emg";
import {
  accountedPercent,
  countPeople,
  emergencyLabels,
  formatKuwait,
  peopleWith,
  type Board,
  type BoardPerson,
} from "@/lib/emergency";
import { DeleteButton } from "@/components/action-form";
import { EmergencyMap } from "@/components/map/emergency-map";
import { Alert, buttonClass, Card, Table } from "@/components/ui";
import { closeEmergency, resendPush } from "../actions";
import { AutoRefresh } from "./auto-refresh";

// Live emergency board (PRD 8.5): counters, name lists with phone numbers, the map, close and export.
export default async function EmergencyBoardPage({ params }: PageProps<"/emergencies/[id]">) {
  await requireEmergencyStaff();
  const { id } = await params;
  const { lang } = await getPrefs();
  const t = emgT(lang);
  const L = emergencyLabels(lang);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("emergency_board", { p_emergency: id });
  if (error || !data) notFound();
  const board = data as Board;
  const e = board.emergency;
  const active = e.status === "active";
  const c = countPeople(board.people);
  const name = (n: { name_ar: string; name_en: string }) => (lang === "ar" ? n.name_ar : n.name_en);

  const circles = board.buildings.map((b) => ({
    lat: b.lat,
    lng: b.lng,
    radius: b.radius,
    label: name(b),
    tone: b.kind,
  }));
  const points = board.people
    .filter((p) => p.lat != null && p.lng != null)
    .map((p) => ({
      lat: p.lat as number,
      lng: p.lng as number,
      label: `${name(p)} (${p.file_number}) — ${L.status[p.status]}`,
      tone: p.outside_safe ? ("warn" as const) : ("ok" as const),
    }));

  const tiles: { label: string; value: number; cls: string }[] = [
    { label: t.counters.arrived, value: c.arrived, cls: "text-[#2e7d32] dark:text-[#7fd1a8]" },
    { label: t.counters.safeElsewhere, value: c.safeElsewhere, cls: "text-primary" },
    { label: t.counters.unknown, value: c.unknown, cls: "text-danger" },
    { label: t.counters.flagged, value: c.flagged, cls: "text-[#b26a00] dark:text-[#e6a100]" },
  ];

  return (
    <div className="flex max-w-5xl flex-col gap-5">
      {active && <AutoRefresh seconds={10} />}
      <Link href="/emergencies" className="text-sm text-primary hover:underline">
        <span aria-hidden className="inline-block rtl:rotate-180">←</span> {t.back}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className={`text-2xl font-bold ${active ? "text-danger" : ""}`}>
            {t.boardTitle}: {L.hazard[e.hazard]} — {name(e.site)}
          </h1>
          <p className="text-sm text-muted">
            {e.is_drill && <span className="font-medium">{t.drill} · </span>}
            {t.startedAt} <span dir="ltr">{formatKuwait(e.started_at, lang, true)}</span>
            {e.started_by && ` · ${t.startedBy}: ${name(e.started_by)}`}
            {e.closed_at && (
              <>
                {" "}
                · {t.closedAt} <span dir="ltr">{formatKuwait(e.closed_at, lang, true)}</span>
              </>
            )}
          </p>
          {(e.message_ar || e.message_en) && <p className="mt-1 text-sm">{lang === "ar" ? e.message_ar ?? e.message_en : e.message_en ?? e.message_ar}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={`/emergencies/${id}/export/xlsx`} className={buttonClass.secondary}>
            {t.exportXlsx}
          </a>
          <a href={`/emergencies/${id}/export/pdf`} className={buttonClass.secondary}>
            {t.exportPdf}
          </a>
        </div>
      </div>

      {active ? (
        <p className="text-xs text-muted" aria-live="polite">
          {t.autoRefresh} · {t.updatedAt} <span dir="ltr">{formatKuwait(new Date().toISOString(), lang)}</span>
        </p>
      ) : (
        <Alert kind="success">{t.closedNote}</Alert>
      )}

      <section aria-label={t.boardTitle} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-2xl border border-line bg-surface p-4">
            <p className={`text-4xl font-bold tabular-nums ${tile.cls}`} dir="ltr">
              {tile.value}
            </p>
            <p className="text-sm text-muted">{tile.label}</p>
          </div>
        ))}
      </section>
      <p className="text-sm">
        <span className="font-medium">{t.accounted(accountedPercent(c))}</span>{" "}
        <span className="text-muted">
          ({c.arrived + c.safeElsewhere} / {c.total} {t.counters.total})
        </span>
      </p>

      {active && board.push.pending > 0 && (
        <Card className="flex flex-col gap-3">
          <p className="text-sm text-muted">{t.pushPending(board.push.pending)}</p>
          <DeleteButton action={resendPush.bind(null, id)} label={t.resend} errors={t.errors} variant="secondary" />
        </Card>
      )}

      <Card>
        <EmergencyMap circles={circles} points={points} legend={t.mapLegend} />
      </Card>

      <PeopleList title={t.listUnknown} people={peopleWith(board.people, "unknown")} lang={lang} tone="danger" open />
      <PeopleList title={t.listArrived} people={peopleWith(board.people, "arrived")} lang={lang} tone="ok" open={c.flagged > 0} />
      <PeopleList title={t.listSafe} people={peopleWith(board.people, "safe_elsewhere")} lang={lang} tone="ok" />

      {active && (
        <Card className="flex flex-col gap-3 border-danger">
          <DeleteButton action={closeEmergency.bind(null, id)} label={t.close} confirmText={t.closeConfirm} errors={t.errors} />
        </Card>
      )}
    </div>
  );
}

function PeopleList({
  title,
  people,
  lang,
  tone,
  open = false,
}: {
  title: string;
  people: BoardPerson[];
  lang: "ar" | "en";
  tone: "danger" | "ok";
  open?: boolean;
}) {
  const t = emgT(lang);
  const name = (p: BoardPerson) => (lang === "ar" ? p.name_ar : p.name_en);
  const dept = (p: BoardPerson) => (lang === "ar" ? p.department_ar : p.department_en) ?? "";
  return (
    <details open={open} className="rounded-2xl border border-line bg-surface p-5">
      <summary className={`cursor-pointer font-bold ${tone === "danger" && people.length > 0 ? "text-danger" : ""}`}>
        {title} <span dir="ltr">({people.length})</span>
      </summary>
      <div className="mt-3">
        <Table>
          <thead>
            <tr>
              <th>{t.cols.file}</th>
              <th>{t.cols.name}</th>
              <th>{t.cols.phone}</th>
              <th>{t.cols.department}</th>
              <th>{t.cols.time}</th>
              <th>{t.cols.distance}</th>
            </tr>
          </thead>
          <tbody>
            {people.length === 0 && (
              <tr>
                <td colSpan={6} className="text-muted">
                  {t.emptyList}
                </td>
              </tr>
            )}
            {people.map((p) => (
              <tr key={p.employee_id} className={p.outside_safe ? "bg-[#fff4d6] dark:bg-[#3a2f12]" : undefined}>
                <td dir="ltr" className="text-start">
                  {p.file_number}
                </td>
                <td className="font-medium">
                  {name(p)}
                  {p.outside_safe && (
                    <span className="ms-2 rounded-full bg-[#e6a100] px-2 py-0.5 text-xs font-medium text-[#0b1a33]">{t.flaggedBadge}</span>
                  )}
                  {p.no_location && (
                    <span className="ms-2 rounded-full bg-line px-2 py-0.5 text-xs text-muted">{t.noLocationBadge}</span>
                  )}
                </td>
                <td dir="ltr" className="text-start">
                  {p.phone ? (
                    <a href={`tel:${p.phone}`} className="text-primary hover:underline">
                      {p.phone}
                    </a>
                  ) : (
                    ""
                  )}
                </td>
                <td>{dept(p)}</td>
                <td dir="ltr" className="text-start">
                  {formatKuwait(p.responded_at, lang)}
                </td>
                <td dir="ltr" className="text-start">
                  {p.distance_m == null ? "" : t.metres(Math.round(p.distance_m))}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </details>
  );
}
