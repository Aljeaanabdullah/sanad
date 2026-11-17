// Ideas box (phase S8), pure part: no network and no React, so it is unit-tested in
// src/lib/__tests__/ideas.test.ts. The rules themselves are enforced by the database
// (supabase/migrations/*_ideas_box.sql); the app mirrors them only to explain and to disable buttons early.

export const IDEA_CATEGORIES = ['work_environment', 'savings', 'safety', 'services', 'other'] as const;
export type IdeaCategory = (typeof IDEA_CATEGORIES)[number];

export const IDEA_STATUSES = [
  'new', 'published', 'awaiting_response', 'under_study', 'accepted', 'in_progress', 'implemented',
  'rejected', 'review_rejected',
] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];

/** Owner decisions of 2026-11-17 (same numbers as private.idea_rules()). */
export const IDEA_RULES = { voteThreshold: 50, responseDays: 14, reviewDays: 2, monthlyLimit: 3 } as const;

export const TITLE_MIN = 5;
export const TITLE_MAX = 120;
export const DESCRIPTION_MIN = 20;
export const DESCRIPTION_MAX = 2000;

/** The forward path shown as the status timeline. */
export const IDEA_PATH: IdeaStatus[] = ['new', 'published', 'awaiting_response', 'under_study', 'accepted', 'in_progress', 'implemented'];

export type IdeaSummary = {
  id: string;
  title: string;
  description: string;
  category: IdeaCategory;
  status: IdeaStatus;
  voteCount: number;
  iVoted: boolean;
  isMine: boolean;
  isAnonymous: boolean;
  authorNameAr: string | null;
  authorNameEn: string | null;
  hasPhoto: boolean;
  createdAt: Date;
  publishedAt: Date | null;
  responseDueAt: Date | null;
  respondedAt: Date | null;
};

export type IdeaEvent = { status: IdeaStatus; reason: string | null; at: Date };

export type IdeaDetail = Omit<IdeaSummary, 'hasPhoto'> & {
  voteThreshold: number;
  photoPath: string | null;
  rejectReason: string | null;
  thresholdAt: Date | null;
  timeline: IdeaEvent[];
};

export type SimilarIdea = { id: string; title: string; category: IdeaCategory; status: IdeaStatus; voteCount: number; iVoted: boolean };

type Tone = 'ok' | 'danger' | 'warn' | 'info' | 'neutral';
type TFn = (key: string, vars?: Record<string, string | number>) => string;

// ------------------------------------------------------------------ status

export const isPublicStatus = (s: IdeaStatus) => s !== 'new' && s !== 'review_rejected';
export const isOpenForVotes = (s: IdeaStatus) =>
  s === 'published' || s === 'awaiting_response' || s === 'under_study' || s === 'accepted' || s === 'in_progress';
export const isFinal = (s: IdeaStatus) => s === 'implemented' || s === 'rejected' || s === 'review_rejected';

export function ideaStatusView(s: IdeaStatus): { key: string; tone: Tone; icon: string } {
  switch (s) {
    case 'new':
      return { key: 'idea_status_new', tone: 'neutral', icon: 'hourglass-outline' };
    case 'published':
      return { key: 'idea_status_published', tone: 'info', icon: 'megaphone-outline' };
    case 'awaiting_response':
      return { key: 'idea_status_awaiting_response', tone: 'warn', icon: 'time-outline' };
    case 'under_study':
      return { key: 'idea_status_under_study', tone: 'info', icon: 'search-outline' };
    case 'accepted':
      return { key: 'idea_status_accepted', tone: 'ok', icon: 'thumbs-up-outline' };
    case 'in_progress':
      return { key: 'idea_status_in_progress', tone: 'ok', icon: 'construct-outline' };
    case 'implemented':
      return { key: 'idea_status_implemented', tone: 'ok', icon: 'checkmark-done-circle' };
    case 'rejected':
      return { key: 'idea_status_rejected', tone: 'danger', icon: 'close-circle' };
    case 'review_rejected':
    default:
      return { key: 'idea_status_review_rejected', tone: 'danger', icon: 'eye-off-outline' };
  }
}

export const categoryKey = (c: IdeaCategory) => `idea_cat_${c}`;
export function categoryIcon(c: IdeaCategory): string {
  return { work_environment: 'business-outline', savings: 'cash-outline', safety: 'shield-checkmark-outline', services: 'people-outline', other: 'bulb-outline' }[c];
}

/** Who wrote it, as shown to everyone: the name only when the idea is not anonymous. */
export function authorLabel(i: Pick<IdeaSummary, 'isAnonymous' | 'isMine' | 'authorNameAr' | 'authorNameEn'>, t: TFn, lang: 'ar' | 'en'): string {
  if (i.isMine) return i.isAnonymous ? t('idea_by_you_anonymous') : t('idea_by_you');
  if (i.isAnonymous) return t('idea_anonymous');
  return (lang === 'ar' ? i.authorNameAr : i.authorNameEn ?? i.authorNameAr) ?? t('idea_anonymous');
}

// ------------------------------------------------------------------ votes and threshold

/** Progress towards the threshold, 0..1. */
export const thresholdProgress = (votes: number, threshold: number = IDEA_RULES.voteThreshold) =>
  threshold <= 0 ? 1 : Math.max(0, Math.min(1, votes / threshold));

/** Votes still needed before management must reply (0 once reached). */
export const votesToGo = (votes: number, threshold: number = IDEA_RULES.voteThreshold) => Math.max(0, threshold - votes);

/** The status the server will give after this vote count (published -> awaiting_response at the threshold). */
export function statusAfterVotes(status: IdeaStatus, votes: number, threshold: number = IDEA_RULES.voteThreshold): IdeaStatus {
  return status === 'published' && votes >= threshold ? 'awaiting_response' : status;
}

/** Optimistic vote toggle (the server answer replaces it). */
export function toggleVote(i: Pick<IdeaSummary, 'iVoted' | 'voteCount'>): { iVoted: boolean; voteCount: number } {
  return i.iVoted ? { iVoted: false, voteCount: Math.max(0, i.voteCount - 1) } : { iVoted: true, voteCount: i.voteCount + 1 };
}

export type VoteState = 'can_vote' | 'voted' | 'own' | 'closed';
export function voteState(i: Pick<IdeaSummary, 'status' | 'isMine' | 'iVoted'>): VoteState {
  if (i.isMine) return 'own';
  if (!isOpenForVotes(i.status)) return 'closed';
  return i.iVoted ? 'voted' : 'can_vote';
}

// ------------------------------------------------------------------ countdown (14 days)

export type Countdown = { overdue: boolean; days: number; hours: number; totalHours: number };

/** Time left until management must reply; null when there is no running deadline. */
export function responseCountdown(i: Pick<IdeaSummary, 'status' | 'responseDueAt'>, now = new Date()): Countdown | null {
  if (i.status !== 'awaiting_response' || !i.responseDueAt) return null;
  const ms = i.responseDueAt.getTime() - now.getTime();
  if (ms <= 0) return { overdue: true, days: 0, hours: 0, totalHours: 0 };
  const totalHours = Math.ceil(ms / 3_600_000);
  return { overdue: false, days: Math.floor(totalHours / 24), hours: totalHours % 24, totalHours };
}

export function countdownText(c: Countdown, t: TFn): string {
  if (c.overdue) return t('idea_countdown_overdue');
  if (c.days > 0) return t('idea_countdown_days', { days: c.days, hours: c.hours });
  return t('idea_countdown_hours', { hours: Math.max(1, c.hours) });
}

// ------------------------------------------------------------------ monthly limit

/** Ideas this employee submitted in the current Kuwait month. */
export function usedThisMonth(createdAt: Date[], now = new Date()): number {
  const month = (d: Date) => new Date(d.getTime() + 3 * 3_600_000).toISOString().slice(0, 7); // Kuwait = UTC+3, no DST
  const current = month(now);
  return createdAt.filter((d) => month(d) === current).length;
}

export const remainingThisMonth = (used: number, limit: number = IDEA_RULES.monthlyLimit) => Math.max(0, limit - used);

// ------------------------------------------------------------------ form

export type IdeaDraft = { title: string; description: string; category: IdeaCategory | null };
export type DraftErrors = Partial<Record<'title' | 'description' | 'category', string>>;

/** Same limits as the database checks. Values are strings keys. */
export function validateDraft(d: IdeaDraft): DraftErrors {
  const e: DraftErrors = {};
  const title = d.title.trim();
  const description = d.description.trim();
  if (title.length < TITLE_MIN) e.title = 'idea_error_title_short';
  else if (title.length > TITLE_MAX) e.title = 'idea_error_title_long';
  if (description.length < DESCRIPTION_MIN) e.description = 'idea_error_description_short';
  else if (description.length > DESCRIPTION_MAX) e.description = 'idea_error_description_long';
  if (!d.category) e.category = 'idea_error_category';
  return e;
}

/** Look for similar ideas only once the text says something. */
export const shouldSearchSimilar = (title: string) => title.trim().length >= 4;

// ------------------------------------------------------------------ timeline

export type TimelineStep = { status: IdeaStatus; state: 'done' | 'current' | 'todo'; at: Date | null; reason: string | null };

/**
 * The path shown on the detail screen: done steps with their date (and reason), the current one,
 * then what is still ahead. A rejection ends the path where it happened.
 */
export function timelineSteps(status: IdeaStatus, events: IdeaEvent[]): TimelineStep[] {
  const last = new Map<IdeaStatus, IdeaEvent>();
  for (const e of events) last.set(e.status, e);
  if (status === 'rejected' || status === 'review_rejected') {
    const done = events.filter((e) => e.status !== status);
    const end = last.get(status) ?? null;
    return [
      ...done.map((e) => ({ status: e.status, state: 'done' as const, at: e.at, reason: e.reason })),
      { status, state: 'current', at: end?.at ?? null, reason: end?.reason ?? null },
    ];
  }
  const idx = IDEA_PATH.indexOf(status);
  return IDEA_PATH.flatMap((s, i) => {
    const e = last.get(s) ?? null;
    // Skipped steps (HR may answer before the threshold) are not shown as done.
    if (i < idx && !e) return [];
    return [{ status: s, state: i < idx ? 'done' : i === idx ? 'current' : 'todo', at: e?.at ?? null, reason: e?.reason ?? null } as TimelineStep];
  });
}

// ------------------------------------------------------------------ server rows

type Row = Record<string, unknown>;
const date = (v: unknown) => (typeof v === 'string' && v ? new Date(v) : null);
const str = (v: unknown) => (typeof v === 'string' ? v : null);

export function toSummary(r: Row): IdeaSummary {
  return {
    id: String(r.id),
    title: String(r.title ?? ''),
    description: String(r.description ?? ''),
    category: r.category as IdeaCategory,
    status: r.status as IdeaStatus,
    voteCount: Number(r.vote_count ?? 0),
    iVoted: !!r.i_voted,
    isMine: !!r.is_mine,
    isAnonymous: !!r.is_anonymous,
    authorNameAr: str(r.author_name_ar),
    authorNameEn: str(r.author_name_en),
    hasPhoto: !!r.has_photo || !!r.photo_path,
    createdAt: date(r.created_at) ?? new Date(0),
    publishedAt: date(r.published_at),
    responseDueAt: date(r.response_due_at),
    respondedAt: date(r.responded_at),
  };
}

export function toDetail(r: Row): IdeaDetail {
  const { hasPhoto: _ignored, ...base } = toSummary(r);
  const events = Array.isArray(r.timeline) ? (r.timeline as Row[]) : [];
  return {
    ...base,
    voteThreshold: Number(r.vote_threshold ?? IDEA_RULES.voteThreshold),
    photoPath: str(r.photo_path),
    rejectReason: str(r.reject_reason),
    thresholdAt: date(r.threshold_at),
    timeline: events.map((e) => ({ status: e.status as IdeaStatus, reason: str(e.reason), at: date(e.at) ?? new Date(0) })),
  };
}

/** Server error message -> strings-g key. */
const KNOWN_ERRORS = [
  'idea_monthly_limit', 'idea_own_vote', 'idea_voting_closed', 'idea_not_found', 'idea_photo_invalid',
  'idea_title_invalid', 'idea_description_invalid', 'idea_category_invalid', 'not_allowed',
];
export function ideaErrorKey(e: unknown): string {
  const msg = typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e ?? '');
  const code = KNOWN_ERRORS.find((k) => msg.includes(k));
  return code ? `idea_err_${code}` : 'idea_err_generic';
}

/** Random object name for an idea photo (no folder, no user id: anonymity). */
export function photoObjectName(random: () => string): string {
  const id = random().toLowerCase();
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('bad uuid');
  return `${id}.jpg`;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/** Base64 -> bytes without relying on atob (not on every engine). */
export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = (B64.indexOf(clean[i]) << 18) | (B64.indexOf(clean[i + 1]) << 12) |
      ((B64.indexOf(clean[i + 2] ?? 'A') & 63) << 6) | (B64.indexOf(clean[i + 3] ?? 'A') & 63);
    out[o++] = (n >> 16) & 255;
    if (i + 2 < clean.length) out[o++] = (n >> 8) & 255;
    if (i + 3 < clean.length) out[o++] = n & 255;
  }
  return out.subarray(0, o);
}
