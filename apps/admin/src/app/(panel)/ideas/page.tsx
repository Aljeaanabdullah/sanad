import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPrefs } from "@/lib/prefs";
import { ideasT } from "@/lib/i18n-ideas";
import {
  authorText, canManageIdeas, canRevealAuthor, deadlineOf, IDEA_CATEGORIES, IDEA_FILTERS, needsReason, nextStatuses, normaliseStats,
  parseFilter, statusTone, type AdminIdeaRow,
} from "@/lib/ideas";
import { Badge, Card, Empty, Table } from "@/components/ui";
import { reviewIdea, revealAuthor, setIdeaStatus } from "./actions";
import { ReviewForm, RevealForm, StatusForm } from "./idea-forms";

// صندوق الأفكار for HR and the system admin (phase S8): review queue, ideas at 50 supporters,
// overdue replies in red, status changes with a reason, stats, and (admin only) revealing an anonymous author.
export default async function IdeasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireStaff();
  if (!canManageIdeas(me.role)) redirect("/");
  const { lang } = await getPrefs();
  const t = ideasT(lang);
  const filter = parseFilter((await searchParams).filter);
  const supabase = await createClient();
  const [{ data: list, error }, { data: rawStats }] = await Promise.all([
    supabase.rpc("ideas_admin_list", { p_filter: filter, p_limit: 200, p_offset: 0 }),
    supabase.rpc("ideas_stats"),
  ]);
  const rows = (list ?? []) as AdminIdeaRow[];
  const stats = normaliseStats(rawStats);
  const paths = rows.map((r) => r.photo_path).filter((p): p is string => !!p);
  const photos = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await supabase.storage.from("idea-photos").createSignedUrls(paths, 600);
    for (const s of signed ?? []) if (s.path && s.signedUrl) photos.set(s.path, s.signedUrl);
  }
  const now = new Date();
  const locale = lang === "ar" ? "ar-KW-u-nu-latn" : "en-GB";
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", hourCycle: "h23", timeZone: "Asia/Kuwait" });
  const admin = canRevealAuthor(me.role);

  const statTiles: { key: keyof typeof t.stats; value: number; danger?: boolean }[] = [
    { key: "submitted", value: stats.submitted },
    { key: "implemented", value: stats.implemented },
    { key: "waiting_review", value: stats.waiting_review },
    { key: "awaiting_response", value: stats.awaiting_response },
    { key: "overdue", value: stats.overdue, danger: stats.overdue > 0 },
    { key: "rejected", value: stats.rejected },
  ];

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">{t.title}</h1>
        <p className="text-sm text-muted">{t.hint}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {statTiles.map((s) => (
          <div key={s.key} data-testid={`idea-stat-${s.key}`} className={`rounded-xl border p-3 ${s.danger ? "border-danger/40 bg-danger-soft text-danger" : "border-line bg-surface"}`}>
            <p className="text-2xl font-bold tabular-nums" dir="ltr">{s.value}</p>
            <p className={`text-xs ${s.danger ? "" : "text-muted"}`}>{t.stats[s.key]}</p>
          </div>
        ))}
      </div>

      <Card>
        <h2 className="mb-3 font-bold">{t.byCategory}</h2>
        <Table>
          <thead>
            <tr><th>{t.category}</th><th>{t.submittedCol}</th><th>{t.implementedCol}</th></tr>
          </thead>
          <tbody>
            {IDEA_CATEGORIES.map((c) => (
              <tr key={c}>
                <td>{t.categories[c]}</td>
                <td className="tabular-nums">{stats.by_category[c]?.submitted ?? 0}</td>
                <td className="tabular-nums">{stats.by_category[c]?.implemented ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <nav aria-label={t.title} className="flex flex-wrap gap-2">
        {IDEA_FILTERS.map((f) => (
          <Link
            key={f}
            href={`/ideas?filter=${f}`}
            aria-current={f === filter ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${f === filter ? "border-primary bg-primary text-on-primary" : "border-line-strong bg-surface hover:border-primary"} ${f === "overdue" && f !== filter && stats.overdue > 0 ? "border-danger/50 text-danger" : ""}`}
          >
            {t.filters[f]}
          </Link>
        ))}
      </nav>

      {error && <Empty>{t.errors.generic}</Empty>}
      {!error && rows.length === 0 && <Empty data-testid="ideas-empty">{t.empty}</Empty>}

      {rows.map((r) => {
        const due = deadlineOf(r, now);
        const overdue = r.response_overdue || r.review_overdue;
        const options = nextStatuses(r.status).map((s) => ({ value: s, label: t.statuses[s], needsReason: needsReason(s) }));
        const photo = r.photo_path ? photos.get(r.photo_path) : undefined;
        return (
          <Card key={r.id} className={overdue ? "border-danger/50 ring-1 ring-danger/30" : ""}>
            <article data-testid="idea-item" className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-bold">{r.title}</h2>
                <Badge tone={statusTone(r.status)}>{t.statuses[r.status]}</Badge>
                <Badge tone="off">{t.categories[r.category]}</Badge>
                {r.status !== "new" && r.status !== "review_rejected" && <Badge tone="info">{t.votes(r.vote_count)}</Badge>}
                {due && <Badge tone={due.overdue ? "danger" : "warn"}>{due.kind === "review" ? t.reviewDue(due.days) : t.responseDue(due.days)}</Badge>}
              </div>
              {overdue && (
                <p role="alert" className="text-sm font-medium text-danger">{r.response_overdue ? t.responseOverdue : t.reviewOverdue}</p>
              )}
              <p className="text-sm text-muted">
                {authorText(r, lang, t.anonymous, t.unknownAuthor)} · {t.submittedAt} {dateTime.format(new Date(r.created_at))}
              </p>
              <p className="whitespace-pre-wrap">{r.description}</p>
              {photo && (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage
                <img src={photo} alt={t.photo} className="max-h-72 w-auto self-start rounded-lg border border-line object-contain" />
              )}
              {r.reject_reason && (
                <p className="text-sm"><span className="text-muted">{t.rejectReason}: </span>{r.reject_reason}</p>
              )}
              {r.status === "new" && (
                <ReviewForm
                  action={reviewIdea.bind(null, r.id)}
                  labels={{ reason: t.reviewReason, publish: t.publish, doNotPublish: t.doNotPublish, done: t.reviewed }}
                  errors={t.errors}
                />
              )}
              {options.length > 0 && (
                <StatusForm
                  action={setIdeaStatus.bind(null, r.id)}
                  options={options}
                  labels={{ status: t.newStatus, reason: t.reason, save: t.save, done: t.saved }}
                  errors={t.errors}
                />
              )}
              {admin && r.is_anonymous && (
                <RevealForm
                  action={revealAuthor.bind(null, r.id)}
                  lang={lang}
                  labels={{
                    reveal: t.reveal, title: t.revealTitle, warning: t.revealWarning, reason: t.revealReason,
                    confirm: t.revealConfirm, doIt: t.revealDo, cancel: t.revealCancel, revealed: t.revealed,
                  }}
                  errors={t.errors}
                />
              )}
            </article>
          </Card>
        );
      })}
    </div>
  );
}
