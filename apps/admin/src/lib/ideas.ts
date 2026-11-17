// Ideas box (phase S8) for the web panel, pure part (unit-tested in ideas.test.ts).
// The database enforces every rule (supabase/migrations/*_ideas_box.sql); this file only decides what to show.

export const IDEA_CATEGORIES = ["work_environment", "savings", "safety", "services", "other"] as const;
export type IdeaCategory = (typeof IDEA_CATEGORIES)[number];

export const IDEA_STATUSES = [
  "new", "published", "awaiting_response", "under_study", "accepted", "in_progress", "implemented", "rejected", "review_rejected",
] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];

export const IDEA_FILTERS = ["review", "threshold", "overdue", "open", "all"] as const;
export type IdeaFilter = (typeof IDEA_FILTERS)[number];

export const IDEA_RULES = { voteThreshold: 50, responseDays: 14, reviewDays: 2 } as const;

/** Only HR and the system admin manage ideas (supervisors are ordinary voters here). */
export const canManageIdeas = (role: string | null | undefined) => role === "hr" || role === "admin";
/** Revealing an anonymous author: system admin only (and the server logs it). */
export const canRevealAuthor = (role: string | null | undefined) => role === "admin";

export const parseFilter = (v: string | string[] | undefined): IdeaFilter =>
  typeof v === "string" && (IDEA_FILTERS as readonly string[]).includes(v) ? (v as IdeaFilter) : "review";

const RANK: Record<IdeaStatus, number> = {
  new: 0, published: 1, awaiting_response: 2, under_study: 3, accepted: 4, in_progress: 5, implemented: 6, rejected: 7, review_rejected: 7,
};
const RESPONSES: IdeaStatus[] = ["under_study", "accepted", "in_progress", "implemented"];

/** Statuses HR may move an idea to (same rule as idea_set_status: forward only, rejected from any open status). */
export function nextStatuses(s: IdeaStatus): IdeaStatus[] {
  if (s === "new" || s === "implemented" || s === "rejected" || s === "review_rejected") return [];
  return [...RESPONSES.filter((x) => RANK[x] > RANK[s]), "rejected"];
}

export const needsReason = (s: IdeaStatus) => s === "rejected";

export type Tone = "ok" | "off" | "warn" | "danger" | "info";
export function statusTone(s: IdeaStatus): Tone {
  switch (s) {
    case "new": return "off";
    case "published": case "under_study": return "info";
    case "awaiting_response": return "warn";
    case "accepted": case "in_progress": case "implemented": return "ok";
    default: return "danger";
  }
}

export type AdminIdeaRow = {
  id: string;
  title: string;
  description: string;
  category: IdeaCategory;
  status: IdeaStatus;
  vote_count: number;
  is_anonymous: boolean;
  author_name_ar: string | null;
  author_name_en: string | null;
  author_file_number: number | null;
  has_photo: boolean;
  created_at: string;
  review_due_at: string;
  published_at: string | null;
  threshold_at: string | null;
  response_due_at: string | null;
  responded_at: string | null;
  reject_reason: string | null;
  review_overdue: boolean;
  response_overdue: boolean;
  photo_path: string | null;
};

/** Days (rounded up) until a deadline; negative = days late. */
export function daysLeft(due: string | null, now = new Date()): number | null {
  if (!due) return null;
  const ms = new Date(due).getTime() - now.getTime();
  return ms >= 0 ? Math.ceil(ms / 86_400_000) : -Math.ceil(-ms / 86_400_000);
}

/** The deadline that matters for this row: review (new) or management reply (awaiting_response). */
export function deadlineOf(r: Pick<AdminIdeaRow, "status" | "review_due_at" | "response_due_at">, now = new Date()) {
  if (r.status === "new") return { kind: "review" as const, days: daysLeft(r.review_due_at, now)!, overdue: new Date(r.review_due_at) < now };
  if (r.status === "awaiting_response" && r.response_due_at) {
    return { kind: "response" as const, days: daysLeft(r.response_due_at, now)!, overdue: new Date(r.response_due_at) < now };
  }
  return null;
}

/** Anonymous ideas never show a name (the server does not send it; this guards the screen too). */
export function authorText(r: Pick<AdminIdeaRow, "is_anonymous" | "author_name_ar" | "author_name_en" | "author_file_number">, lang: "ar" | "en", anonymousLabel: string, unknownLabel: string) {
  if (r.is_anonymous) return anonymousLabel;
  const name = lang === "ar" ? r.author_name_ar : r.author_name_en ?? r.author_name_ar;
  if (!name) return unknownLabel;
  return r.author_file_number ? `${name} · ${r.author_file_number}` : name;
}

export type IdeaStats = {
  submitted: number;
  implemented: number;
  waiting_review: number;
  awaiting_response: number;
  overdue: number;
  rejected: number;
  votes: number;
  by_category: Partial<Record<IdeaCategory, { submitted: number; implemented: number }>>;
};

export function normaliseStats(raw: unknown): IdeaStats {
  const r = (raw ?? {}) as Record<string, unknown>;
  const n = (k: string) => Number(r[k] ?? 0) || 0;
  const by = (r.by_category ?? {}) as Record<string, { submitted?: number; implemented?: number }>;
  const by_category: IdeaStats["by_category"] = {};
  for (const c of IDEA_CATEGORIES) {
    if (by[c]) by_category[c] = { submitted: Number(by[c].submitted ?? 0), implemented: Number(by[c].implemented ?? 0) };
  }
  return {
    submitted: n("submitted"), implemented: n("implemented"), waiting_review: n("waiting_review"),
    awaiting_response: n("awaiting_response"), overdue: n("overdue"), rejected: n("rejected"), votes: n("votes"), by_category,
  };
}

/** Server error -> text key. */
const KNOWN = [
  "not_allowed", "reason_required", "note_too_long", "idea_not_found", "idea_already_reviewed", "idea_status_invalid", "idea_not_anonymous",
];
export const ideaError = (message: string | undefined) => KNOWN.find((k) => message?.includes(k)) ?? "generic";
