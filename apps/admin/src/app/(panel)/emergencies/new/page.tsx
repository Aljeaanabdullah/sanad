import Link from "next/link";
import { requireEmergencyStaff } from "@/lib/emergency-auth";
import { createClient } from "@/lib/supabase/server";
import { getPrefs } from "@/lib/prefs";
import { emgT } from "@/lib/i18n-emg";
import { Card } from "@/components/ui";
import { LaunchForm, type LaunchSite } from "./launch-form";

// Launch an alert (PRD 8.3): hazard, danger building(s), safe building, targets, then a confirm step.
export default async function NewEmergencyPage() {
  const me = await requireEmergencyStaff();
  const { lang } = await getPrefs();
  const t = emgT(lang);
  const supabase = await createClient();
  const [{ data: sites }, { data: buildings }, { data: departments }] = await Promise.all([
    supabase.from("sites").select("id, name_ar, name_en, latitude, longitude, radius_m").eq("is_active", true).order("name_ar"),
    supabase.from("buildings").select("id, site_id, name_ar, name_en, latitude, longitude, radius_m").order("name_ar"),
    supabase.from("departments").select("id, name_ar, name_en").order("name_ar"),
  ]);
  const name = (r: { name_ar: string; name_en: string }) => (lang === "ar" ? r.name_ar : r.name_en);

  const launchSites: LaunchSite[] = (sites ?? []).map((s) => ({
    id: s.id,
    name: name(s),
    lat: s.latitude,
    lng: s.longitude,
    radius: s.radius_m,
    buildings: (buildings ?? [])
      .filter((b) => b.site_id === s.id)
      .map((b) => ({ id: b.id, name: name(b), lat: b.latitude, lng: b.longitude, radius: b.radius_m })),
  }));

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <Link href="/emergencies" className="text-sm text-primary hover:underline">
        <span aria-hidden className="inline-block rtl:rotate-180">←</span> {t.back}
      </Link>
      <div>
        <h1 className="text-2xl font-bold">{t.launchTitle}</h1>
        <p className="text-sm text-muted">{t.launchHint}</p>
      </div>
      <Card>
        <LaunchForm
          sites={launchSites}
          departments={(departments ?? []).map((d) => ({ id: d.id, name: name(d) }))}
          lang={lang}
          canManageBuildings={me.role === "admin"}
        />
      </Card>
    </div>
  );
}
