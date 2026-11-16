import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPrefs } from "@/lib/prefs";
import { repT } from "@/lib/i18n-rep";
import {
  filterQuery,
  KIND_COLUMNS,
  kuwaitDate,
  PAGE_SIZE,
  parseReportFilters,
  punchRowCells,
  REPORT_KINDS,
  reportRowCells,
  type ReportKind,
} from "@/lib/reports";
import { attendancePage, punchPage } from "@/lib/report-data";
import { Alert, buttonClass, Card, Field, Input, Select, Table } from "@/components/ui";

type Named = { id: string; name_ar: string; name_en: string };

// Reports (PRD section 10): daily attendance, lateness, absence, punch log with photos, and a link
// to any employee's monthly record. On screen 100 rows per page; the exports hold the whole period.
export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const me = await requireStaff();
  const { lang } = await getPrefs();
  const t = repT(lang);
  const ar = lang === "ar";
  const today = kuwaitDate();
  const { filters: f, error } = parseReportFilters(await searchParams, today);
  const supabase = await createClient();
  const offset = (f.page - 1) * PAGE_SIZE;

  const [{ data: depts }, { data: sites }, result] = await Promise.all([
    supabase.from("departments").select("id, name_ar, name_en").order(ar ? "name_ar" : "name_en"),
    supabase.from("sites").select("id, name_ar, name_en").order(ar ? "name_ar" : "name_en"),
    f.kind === "punches"
      ? punchPage(supabase, f, offset, PAGE_SIZE).then((r) => ({ kind: "punches" as const, ...r }))
      : attendancePage(supabase, f, offset, PAGE_SIZE).then((r) => ({ kind: "attendance" as const, ...r })),
  ]);
  const name = (n: Named) => (ar ? n.name_ar : n.name_en);
  const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  // Review photos: supervisor and admin only (PRD 4.4). HR never gets a signed URL.
  const canSeePhotos = me.role === "supervisor" || me.role === "admin";
  const paths =
    result.kind === "punches" && canSeePhotos ? result.rows.map((p) => p.photo_path).filter((p): p is string => !!p) : [];
  const { data: signed } = paths.length
    ? await supabase.storage.from("punch-photos").createSignedUrls(paths, 300)
    : { data: [] };
  const urlOf = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  const tabClass = "rounded-lg px-3 py-1.5 text-sm";
  const query = (over: Partial<typeof f>) => filterQuery({ ...f, page: 1, ...over });
  const columns = KIND_COLUMNS[f.kind];

  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">{t.reportsTitle}</h1>
        <p className="text-sm text-muted">{t.reportsHint}</p>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label={t.reportsTitle} data-testid="report-tabs">
        {REPORT_KINDS.map((k: ReportKind) => (
          <Link
            key={k}
            href={`/reports?${query({ kind: k })}`}
            aria-current={k === f.kind ? "page" : undefined}
            className={
              k === f.kind
                ? `${tabClass} bg-primary font-medium text-on-primary`
                : `${tabClass} border border-line hover:bg-primary-soft`
            }
          >
            {t.kinds[k]}
          </Link>
        ))}
      </nav>

      <Card>
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end" role="search">
          <input type="hidden" name="kind" value={f.kind} />
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
          <Field label={t.file} hint={t.fileHint}>
            <Input name="file" defaultValue={f.file ?? ""} inputMode="numeric" pattern="\d{6}" maxLength={6} dir="ltr" />
          </Field>
          <button type="submit" className={buttonClass.primary}>
            {t.apply}
          </button>
        </form>
      </Card>

      {error && (
        <Alert kind="error">
          {t.errors[error]} {t.shownToday}
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="font-bold">{t.kinds[f.kind]}</h2>
          <p className="text-sm text-muted">{t.kindHints[f.kind]}</p>
        </div>
        <span className="text-sm text-muted" data-testid="report-total">
          {t.total(result.total)}
        </span>
        <div className="ms-auto flex gap-2">
          <a href={`/reports/export/xlsx?${query({})}`} className={buttonClass.secondary} data-testid="export-xlsx">
            {t.exportXlsx}
          </a>
          <a href={`/reports/export/pdf?${query({})}`} className={buttonClass.secondary} data-testid="export-pdf">
            {t.exportPdf}
          </a>
        </div>
      </div>

      {result.kind === "punches" && !canSeePhotos && <p className="text-sm text-muted">{t.photosHidden}</p>}

      {result.rows.length === 0 ? (
        <p className="text-muted" data-testid="report-empty">
          {t.noRows}
        </p>
      ) : (
        <Table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c} className="whitespace-nowrap">
                  {t.columns[c]}
                </th>
              ))}
              {result.kind === "punches" && canSeePhotos && <th>{t.photo}</th>}
            </tr>
          </thead>
          <tbody data-testid="report-rows">
            {result.kind === "punches"
              ? result.rows.map((p) => {
                  const cells = punchRowCells(p, ar, { punchTypes: t.punchTypes, results: t.results });
                  const url = p.photo_path ? urlOf.get(p.photo_path) : undefined;
                  return (
                    <tr key={p.id}>
                      {cells.map((c, i) => (
                        <Cell key={columns[i]} col={columns[i]} href={`/records/${p.employee.id}`} danger={columns[i] === "result" && p.result !== "accepted"}>
                          {c}
                        </Cell>
                      ))}
                      {canSeePhotos && (
                        <td>
                          {url ? (
                            <a href={url} target="_blank" rel="noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                              <img src={url} alt={t.photo} className="size-14 rounded object-cover" />
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              : result.rows.map((r) => {
                  const cells = reportRowCells(f.kind as Exclude<ReportKind, "punches">, r, ar, { statuses: t.statuses });
                  return (
                    <tr key={`${r.employee_id}-${r.shift_start}`}>
                      {cells.map((c, i) => (
                        <Cell
                          key={columns[i]}
                          col={columns[i]}
                          href={`/records/${r.employee_id}?month=${r.day.slice(0, 7)}`}
                          danger={(columns[i] === "status" && r.status === "late") || (columns[i] === "lateMinutes" && r.late_minutes > 0)}
                        >
                          {c}
                        </Cell>
                      ))}
                    </tr>
                  );
                })}
          </tbody>
        </Table>
      )}

      {result.rows.length > 0 && f.kind !== "absent" && <p className="-mt-3 text-xs text-muted">* {t.correctedNote}</p>}

      {pages > 1 && (
        <div className="flex items-center gap-3 text-sm" data-testid="report-pages">
          {f.page > 1 && (
            <Link href={`/reports?${filterQuery({ ...f, page: f.page - 1 })}`} className={buttonClass.secondary}>
              {t.prev}
            </Link>
          )}
          <span className="text-muted">{t.pageOf(f.page, pages)}</span>
          {f.page < pages && (
            <Link href={`/reports?${filterQuery({ ...f, page: f.page + 1 })}`} className={buttonClass.secondary}>
              {t.next}
            </Link>
          )}
        </div>
      )}

      <Card>
        <h2 className="mb-1 font-bold">{t.monthly}</h2>
        <p className="mb-3 text-sm text-muted">{t.monthlyHint}</p>
        <form action="/records" className="flex gap-2" role="search">
          <Input
            name="file"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            required
            placeholder={t.file}
            aria-label={t.file}
            dir="ltr"
            className="max-w-48"
          />
          <button type="submit" className={buttonClass.secondary}>
            {t.open}
          </button>
        </form>
      </Card>
    </div>
  );
}

/** A table cell: names link to the employee's record, numbers and dates read left-to-right. */
function Cell({ col, href, danger, children }: { col: string; href: string; danger?: boolean; children: string }) {
  const ltr = col === "day" || col === "file" || col === "shift" || col === "checkIn" || col === "checkOut" || col === "time" || col === "lateMinutes";
  return (
    <td className={`${ltr ? "whitespace-nowrap" : ""} ${danger ? "text-danger" : ""}`}>
      {col === "name" ? (
        <Link href={href} className="text-primary hover:underline">
          {children}
        </Link>
      ) : ltr ? (
        <span dir="ltr">{children || "—"}</span>
      ) : (
        children || "—"
      )}
    </td>
  );
}
