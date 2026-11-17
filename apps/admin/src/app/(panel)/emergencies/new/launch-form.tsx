"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { emgT } from "@/lib/i18n-emg";
import { emergencyLabels, type Hazard, type TargetMode } from "@/lib/emergency";
import type { Lang } from "@/lib/i18n";
import { EmergencyMap } from "@/components/map/emergency-map";
import { Alert, buttonClass, Field, inputClass, Select } from "@/components/ui";
import { launchEmergency, previewTargets } from "../actions";

type Building = { id: string; name: string; lat: number; lng: number; radius: number };
export type LaunchSite = { id: string; name: string; lat: number; lng: number; radius: number; buildings: Building[] };

const HAZARDS: Hazard[] = ["fire", "gas_leak", "other"];
const MODES: TargetMode[] = ["present", "site", "department"];
const solidDanger = "inline-flex min-h-11 items-center justify-center rounded-full bg-danger px-5 py-2 font-medium text-surface hover:opacity-90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60";

/** Two steps: choose, then confirm with the number of people who will be alerted. */
export function LaunchForm({
  sites,
  departments,
  lang,
  canManageBuildings,
}: {
  sites: LaunchSite[];
  departments: { id: string; name: string }[];
  lang: Lang;
  canManageBuildings: boolean;
}) {
  const t = emgT(lang);
  const L = emergencyLabels(lang);
  const [siteId, setSiteId] = useState(sites.length === 1 ? sites[0].id : "");
  const [hazard, setHazard] = useState<Hazard>("fire");
  const [danger, setDanger] = useState<string[]>([]);
  const [safe, setSafe] = useState("");
  const [mode, setMode] = useState<TargetMode>("present");
  const [deps, setDeps] = useState<string[]>([]);
  const [messageAr, setMessageAr] = useState("");
  const [messageEn, setMessageEn] = useState("");
  const [drill, setDrill] = useState(false);
  const [confirmCount, setConfirmCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const site = sites.find((s) => s.id === siteId);
  const buildings = site?.buildings ?? [];
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const chooseSite = (id: string) => {
    setSiteId(id);
    setDanger([]);
    setSafe("");
    setConfirmCount(null);
    setError(null);
  };

  const valid = !!site && danger.length > 0 && !!safe && !danger.includes(safe) && (mode !== "department" || deps.length > 0);

  const review = () => {
    if (!valid) {
      setError(mode === "department" && deps.length === 0 ? "departments_required" : "invalid_buildings");
      return;
    }
    setError(null);
    start(async () => {
      const r = await previewTargets({ site: siteId, mode, departments: deps });
      if (r.error) setError(r.error);
      else if (!r.count) setError("no_targets");
      else setConfirmCount(r.count);
    });
  };

  const launch = () => {
    start(async () => {
      const r = await launchEmergency({ site: siteId, hazard, danger, safe, mode, departments: deps, messageAr, messageEn, drill });
      // On success the action redirects to the live board.
      if (r?.error) {
        setError(r.error);
        setConfirmCount(null);
      }
    });
  };

  const circles = buildings
    .filter((b) => danger.includes(b.id) || b.id === safe)
    .map((b) => ({ lat: b.lat, lng: b.lng, radius: b.radius, label: b.name, tone: b.id === safe ? ("safe" as const) : ("danger" as const) }));
  const otherCircles = buildings
    .filter((b) => !danger.includes(b.id) && b.id !== safe)
    .map((b) => ({ lat: b.lat, lng: b.lng, radius: b.radius, label: b.name, tone: "building" as const }));

  if (confirmCount !== null && site) {
    return (
      <div className="flex flex-col gap-4" data-testid="launch-confirm">
        <h2 className="text-lg font-bold text-danger">{t.confirmTitle}</h2>
        <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
          <dt className="text-muted">{t.site}</dt>
          <dd>{site.name}</dd>
          <dt className="text-muted">{t.hazard}</dt>
          <dd>
            {L.hazard[hazard]}
            {drill && ` — ${t.drill}`}
          </dd>
          <dt className="text-muted">{t.danger}</dt>
          <dd>{buildings.filter((b) => danger.includes(b.id)).map((b) => b.name).join(lang === "ar" ? "، " : ", ")}</dd>
          <dt className="text-muted">{t.safe}</dt>
          <dd>{buildings.find((b) => b.id === safe)?.name}</dd>
          <dt className="text-muted">{t.targets}</dt>
          <dd>{t.modes[mode]}</dd>
        </dl>
        <p className="rounded-lg bg-danger-soft px-4 py-3 font-medium text-danger">{t.confirmBody(confirmCount)}</p>
        {error && <Alert kind="error">{t.errors[error] ?? t.errors.generic}</Alert>}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={launch} disabled={pending} className={solidDanger} data-testid="launch-confirm-button">
            {t.confirm}
          </button>
          <button type="button" onClick={() => setConfirmCount(null)} disabled={pending} className={buttonClass.secondary}>
            {t.back}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5" data-testid="launch-form">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.site}>
          <Select value={siteId} onChange={(e) => chooseSite(e.target.value)} required>
            <option value="">{t.chooseSite}</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.hazard}>
          <Select value={hazard} onChange={(e) => setHazard(e.target.value as Hazard)}>
            {HAZARDS.map((h) => (
              <option key={h} value={h}>
                {L.hazard[h]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {site && buildings.length < 2 && (
        <Alert kind="error">
          {t.noBuildings}{" "}
          {canManageBuildings && (
            <Link href={`/organisation/sites/${site.id}`} className="underline">
              {t.manageBuildings}
            </Link>
          )}
        </Alert>
      )}

      {site && buildings.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">{t.danger}</legend>
            <span className="text-xs text-muted">{t.dangerHint}</span>
            {buildings.map((b) => (
              <label key={b.id} className="flex min-h-11 items-center gap-2 px-3 py-2 rounded-lg border border-line bg-surface-2 hover:border-line-strong has-checked:border-primary has-checked:bg-primary-soft">
                <input
                  type="checkbox"
                  checked={danger.includes(b.id)}
                  disabled={b.id === safe}
                  onChange={() => setDanger((d) => toggle(d, b.id))}
                  className="shrink-0 accent-danger"
                />
                {b.name}
              </label>
            ))}
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">{t.safe}</legend>
            <span className="text-xs text-muted">&nbsp;</span>
            {buildings.map((b) => (
              <label key={b.id} className="flex min-h-11 items-center gap-2 px-3 py-2 rounded-lg border border-line bg-surface-2 hover:border-line-strong has-checked:border-primary has-checked:bg-primary-soft">
                <input
                  type="radio"
                  name="safe"
                  checked={safe === b.id}
                  disabled={danger.includes(b.id)}
                  onChange={() => setSafe(b.id)}
                  className="shrink-0 accent-ok"
                />
                {b.name}
              </label>
            ))}
          </fieldset>
        </div>
      )}

      {site && (circles.length > 0 || otherCircles.length > 0) && (
        <EmergencyMap circles={[...circles, ...otherCircles]} legend={t.mapLegend} />
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t.targets}</legend>
        {MODES.map((m) => (
          <label key={m} className="flex min-h-11 items-center gap-2 px-3 py-2 rounded-lg border border-line bg-surface-2 hover:border-line-strong has-checked:border-primary has-checked:bg-primary-soft">
            <input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} className="shrink-0" />
            {t.modes[m]}
          </label>
        ))}
        {mode === "department" && (
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            {departments.map((d) => (
              <label key={d.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={deps.includes(d.id)} onChange={() => setDeps((x) => toggle(x, d.id))} className="size-4" />
                {d.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`${t.message} — العربية`} hint={t.messageHint}>
          <textarea value={messageAr} onChange={(e) => setMessageAr(e.target.value)} maxLength={500} rows={2} className={inputClass} />
        </Field>
        <Field label={`${t.message} — English`}>
          <textarea value={messageEn} onChange={(e) => setMessageEn(e.target.value)} maxLength={500} rows={2} dir="ltr" className={inputClass} />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={drill} onChange={(e) => setDrill(e.target.checked)} className="size-4" />
        {t.isDrill}
      </label>

      {error && <Alert kind="error">{t.errors[error] ?? t.errors.generic}</Alert>}
      <div>
        <button type="button" onClick={review} disabled={pending || !site} className={solidDanger} data-testid="launch-review">
          {t.review}
        </button>
      </div>
    </div>
  );
}
