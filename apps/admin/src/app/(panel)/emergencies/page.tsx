import Link from "next/link";
import { requireEmergencyStaff } from "@/lib/emergency-auth";
import { createClient } from "@/lib/supabase/server";
import { getPrefs } from "@/lib/prefs";
import { emgT } from "@/lib/i18n-emg";
import { emergencyLabels, formatKuwait, type Hazard } from "@/lib/emergency";
import { Badge, buttonClass, Card, Table } from "@/components/ui";

// Emergencies (PRD 8): active ones on top, then history. Admin and supervisors.
export default async function EmergenciesPage() {
  await requireEmergencyStaff();
  const { lang } = await getPrefs();
  const t = emgT(lang);
  const L = emergencyLabels(lang);
  const supabase = await createClient();
  const { data } = await supabase
    .from("emergencies")
    .select("id, hazard, status, is_drill, started_at, closed_at, sites(name_ar, name_en)")
    .order("started_at", { ascending: false })
    .limit(100);

  type Row = {
    id: string;
    hazard: Hazard;
    status: "active" | "closed";
    is_drill: boolean;
    started_at: string;
    closed_at: string | null;
    sites: { name_ar: string; name_en: string } | null;
  };
  const rows = (data ?? []) as unknown as Row[];
  const active = rows.filter((r) => r.status === "active");
  const past = rows.filter((r) => r.status === "closed");
  const siteName = (r: Row) => (r.sites ? (lang === "ar" ? r.sites.name_ar : r.sites.name_en) : "");

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t.title}</h1>
          <p className="text-sm text-muted">{t.hint}</p>
        </div>
        <Link href="/emergencies/new" className="rounded-lg bg-danger px-4 py-2 font-medium text-background hover:opacity-90" data-testid="launch-link">
          {t.launchNew}
        </Link>
      </div>

      {active.length > 0 && (
        <Card className="border-danger">
          <h2 className="mb-3 font-bold text-danger">{t.activeNow}</h2>
          <ul className="flex flex-col gap-2">
            {active.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-danger-soft px-4 py-3">
                <span className="font-medium">
                  {L.hazard[r.hazard]} — {siteName(r)} {r.is_drill && <span className="text-sm text-muted">({t.drill})</span>}
                  <span className="ms-2 text-sm text-muted" dir="ltr">
                    {formatKuwait(r.started_at, lang, true)}
                  </span>
                </span>
                <Link href={`/emergencies/${r.id}`} className={buttonClass.primary}>
                  {t.open}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 font-bold">{t.history}</h2>
        <Table>
          <thead>
            <tr>
              <th>{t.startedAt}</th>
              <th>{t.hazard}</th>
              <th>{t.site}</th>
              <th>{t.closedAt}</th>
              <th>
                <span className="sr-only">{t.open}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {past.length === 0 && (
              <tr>
                <td colSpan={5} className="text-muted">
                  {t.none}
                </td>
              </tr>
            )}
            {past.map((r) => (
              <tr key={r.id}>
                <td dir="ltr" className="text-start">
                  {formatKuwait(r.started_at, lang, true)}
                </td>
                <td>
                  {L.hazard[r.hazard]} {r.is_drill && <Badge tone="off">{t.drill}</Badge>}
                </td>
                <td>{siteName(r)}</td>
                <td dir="ltr" className="text-start">
                  {formatKuwait(r.closed_at, lang, true)}
                </td>
                <td className="text-end">
                  <Link href={`/emergencies/${r.id}`} className="text-primary hover:underline">
                    {t.open}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
