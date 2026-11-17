import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPrefs } from "@/lib/prefs";
import { auditT } from "@/lib/i18n-audit";
import {
  ACTION_FILTERS,
  EXPORT_MAX_ROWS,
  PAGE_SIZE,
  TABLE_FILTERS,
  actionLabel,
  diffEntry,
  fieldLabel,
  filtersToQuery,
  formatValue,
  parseAuditFilters,
  recordName,
  subjectEmployeeId,
  summarize,
  tableLabel,
  type AuditEntry,
} from "@/lib/audit-log";
import { loadPeople, queryAuditLog, type Person } from "@/lib/audit-log-query";
import { Alert, Card, Field, Input, Select, Table, buttonClass, Empty, Badge, Icon } from "@/components/ui";

const actionTone: Record<string, "ok" | "info" | "danger"> = { insert: "ok", update: "info", delete: "danger" };

// System admin only (PRD 11, PLAN phase 12): who saw or changed any employee's data.
export default async function AuditLogPage({ searchParams }: PageProps<"/audit-log">) {
  await requireAdmin();
  const { lang } = await getPrefs();
  const t = auditT(lang);
  const ar = lang === "ar";
  const { filters, invalid } = parseAuditFilters(await searchParams);

  const supabase = await createClient();
  const result = await queryAuditLog(supabase, filters, PAGE_SIZE);
  const { actors, subjects } = await loadPeople(supabase, result.rows);

  const locale = ar ? "ar-KW-u-nu-latn" : "en-GB";
  const dateTime = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "medium",
    hourCycle: "h23",
    timeZone: "Asia/Kuwait",
  });
  const nameOf = (p: Person) => (ar ? p.nameAr : p.nameEn) || p.nameAr || p.nameEn;
  const navClass = "inline-flex min-h-11 items-center rounded-full border border-line-strong bg-surface px-3 py-1 text-sm whitespace-nowrap hover:border-primary hover:bg-primary-soft sm:min-h-9";
  const rows = result.rows;
  const first = rows[0]?.id;
  const last = rows.at(-1)?.id;

  const who = (e: AuditEntry) => {
    if (!e.actor_user_id) return <span className="whitespace-nowrap text-muted">{t.system}</span>;
    const p = actors.get(e.actor_user_id);
    if (!p) {
      return (
        <span className="text-muted">
          {t.unknownUser}{" "}
          <span dir="ltr" className="text-xs">
            {e.actor_user_id.slice(0, 8)}
          </span>
        </span>
      );
    }
    return <PersonCell name={nameOf(p)} file={p.fileNumber} deleted={p.deleted} deletedLabel={t.deleted} />;
  };

  const record = (e: AuditEntry) => {
    const sid = subjectEmployeeId(e);
    const p = sid ? subjects.get(sid) : undefined;
    if (p && sid) {
      return (
        <PersonCell
          name={nameOf(p)}
          file={p.fileNumber}
          deleted={p.deleted}
          deletedLabel={t.deleted}
          href={p.deleted ? undefined : `/records/${sid}`}
        />
      );
    }
    const n = recordName(e, lang);
    if (n) return n;
    return e.record_id ? (
      <span dir="ltr" className="text-xs text-muted">
        {e.record_id.slice(0, 8)}
      </span>
    ) : (
      "—"
    );
  };

  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">{t.title}</h1>
        <p className="text-sm text-muted">{t.hint}</p>
      </div>

      <Card>
        <form className="flex flex-col gap-4" role="search" aria-label={t.filters}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t.from}>
              <Input type="date" name="from" defaultValue={filters.from ?? ""} dir="ltr" />
            </Field>
            <Field label={t.to}>
              <Input type="date" name="to" defaultValue={filters.to ?? ""} dir="ltr" />
            </Field>
            <Field label={t.actor}>
              <Input
                name="actor"
                defaultValue={filters.actor ?? ""}
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                dir="ltr"
              />
            </Field>
            <Field label={t.employee}>
              <Input
                name="employee"
                defaultValue={filters.employee ?? ""}
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                dir="ltr"
              />
            </Field>
            <Field label={t.table}>
              <Select name="table" defaultValue={filters.table ?? ""}>
                <option value="">{t.all}</option>
                {TABLE_FILTERS.map((k) => (
                  <option key={k} value={k}>
                    {tableLabel(t, k)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t.action}>
              <Select name="action" defaultValue={filters.action ?? ""}>
                <option value="">{t.all}</option>
                {ACTION_FILTERS.map((k) => (
                  <option key={k} value={k}>
                    {actionLabel(t, k)}
                  </option>
                ))}
              </Select>
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" name="system" value="1" defaultChecked={!!filters.system} className="shrink-0" />
              {t.systemOnly}
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className={buttonClass.primary}>
              {t.apply}
            </button>
            <Link href="/audit-log" className={buttonClass.secondary}>
              {t.reset}
            </Link>
            <a
              href={`/audit-log/export${filtersToQuery(filters)}`}
              className={`${buttonClass.secondary} ms-auto`}
              data-testid="audit-export"
              title={t.exportHint(EXPORT_MAX_ROWS)}
            >
              {t.exportXlsx}
            </a>
          </div>
          <p className="text-xs text-muted">
            {t.exportHint(EXPORT_MAX_ROWS)} {t.redactedNote}
          </p>
        </form>
      </Card>

      {invalid && <Alert kind="error">{t.badFilter}</Alert>}
      {result.noActor && <Alert kind="error">{t.noActor}</Alert>}
      {result.noEmployee && <Alert kind="error">{t.noEmployee}</Alert>}

      {rows.length === 0 ? (
        <Empty data-testid="audit-empty">{t.empty}</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>{t.cols.time}</th>
              <th>{t.cols.who}</th>
              <th>{t.cols.action}</th>
              <th>{t.cols.table}</th>
              <th>{t.cols.record}</th>
              <th>{t.cols.summary}</th>
            </tr>
          </thead>
          <tbody data-testid="audit-rows">
            {rows.map((e) => {
              const diff = diffEntry(e);
              return (
                <tr key={e.id} className="align-top">
                  <td className="whitespace-nowrap">
                    {dateTime.format(new Date(e.created_at))}
                    <span className="block text-xs text-muted" dir="ltr">
                      #{e.id}
                    </span>
                  </td>
                  <td>{who(e)}</td>
                  <td>
                    <Badge tone={actionTone[e.action] ?? "off"}>{actionLabel(t, e.action)}</Badge>
                  </td>
                  <td className="whitespace-nowrap">{tableLabel(t, e.table_name)}</td>
                  <td>{record(e)}</td>
                  <td className="min-w-64 whitespace-normal!">
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-start gap-1.5 hover:text-primary [&::-webkit-details-marker]:hidden">
                        <Icon name="next" className="mt-1 text-muted ltr:group-open:rotate-90 rtl:group-open:-rotate-90" />
                        <span>{summarize(t, e)}</span>
                      </summary>
                      {diff.length === 0 ? (
                        <p className="mt-2 text-xs text-muted">{t.noChanges}</p>
                      ) : (
                        <dl className="mt-2 grid gap-1.5 rounded-lg border border-line bg-surface-2 p-3 text-xs">
                          {diff.map((d) => (
                            <div key={d.key} className="grid gap-1 sm:grid-cols-[10rem_1fr]">
                              <dt className="font-medium text-muted">{fieldLabel(t, d.key)}</dt>
                              <dd className="break-words">
                                {e.action === "update" ? (
                                  <>
                                    <del className="text-danger decoration-danger/60">{formatValue(t, d.before)}</del>{" "}
                                    <Icon name="next" className="text-muted" />
                                    <span className="sr-only">{t.after}</span>{" "}
                                    <ins className="font-medium text-ok no-underline">{formatValue(t, d.after)}</ins>
                                  </>
                                ) : (
                                  formatValue(t, e.action === "delete" ? d.before : d.after)
                                )}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </details>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      <div className="flex flex-wrap items-center gap-2" data-testid="audit-pages">
        <span className="text-sm text-muted">{t.shown(rows.length)}</span>
        <span className="ms-auto" />
        {result.hasNewer && (
          <>
            <Link href={`/audit-log${filtersToQuery(filters)}`} className={navClass}>
              {t.first}
            </Link>
            {first && (
              <Link href={`/audit-log${filtersToQuery(filters, { after: first })}`} className={navClass}>
                {t.newer}
              </Link>
            )}
          </>
        )}
        {result.hasOlder && last && (
          <Link href={`/audit-log${filtersToQuery(filters, { before: last })}`} className={navClass}>
            {t.older}
          </Link>
        )}
      </div>
    </div>
  );
}

function PersonCell({
  name,
  file,
  deleted,
  deletedLabel,
  href,
}: {
  name: string;
  file: number | null;
  deleted: boolean;
  deletedLabel: string;
  href?: string;
}) {
  const label = href ? (
    <Link href={href} className="font-medium text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary">
      {name}
    </Link>
  ) : (
    <span className="font-medium">{name}</span>
  );
  return (
    <span className="flex flex-col">
      {label}
      <span className="text-xs text-muted">
        {file !== null && <span dir="ltr">{file}</span>}
        {deleted && <> · {deletedLabel}</>}
      </span>
    </span>
  );
}
