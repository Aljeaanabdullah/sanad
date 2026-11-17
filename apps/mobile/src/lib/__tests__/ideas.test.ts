// Ideas box rules as the app shows them (threshold, monthly limit, anonymity, countdown, form, timeline).
// The database enforces the same rules: supabase/scripts/ideas.proofs.sql.
import {
  authorLabel, base64ToBytes, countdownText, ideaErrorKey, ideaStatusView, IDEA_CATEGORIES, IDEA_RULES, IDEA_STATUSES,
  isOpenForVotes, isPublicStatus, photoObjectName, remainingThisMonth, responseCountdown, statusAfterVotes, thresholdProgress,
  timelineSteps, toDetail, toggleVote, toSummary, usedThisMonth, validateDraft, voteState, votesToGo,
} from '../ideas';
import { hasKey, makeT } from '../i18n';
import { routeFor } from '../notify';

const ar = makeT('ar');
const en = makeT('en');
const ID = '0b9f3a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b';

describe('threshold: 50 supporters', () => {
  it('uses the owner numbers', () => {
    expect(IDEA_RULES).toEqual({ voteThreshold: 50, responseDays: 14, reviewDays: 2, monthlyLimit: 3 });
  });
  it('49 stays published, 50 waits for management', () => {
    expect(statusAfterVotes('published', 49)).toBe('published');
    expect(statusAfterVotes('published', 50)).toBe('awaiting_response');
    expect(statusAfterVotes('published', 51)).toBe('awaiting_response');
  });
  it('only a published idea moves (later statuses keep theirs)', () => {
    expect(statusAfterVotes('under_study', 80)).toBe('under_study');
    expect(statusAfterVotes('new', 80)).toBe('new');
  });
  it('progress and votes to go', () => {
    expect(votesToGo(0)).toBe(50);
    expect(votesToGo(48)).toBe(2);
    expect(votesToGo(70)).toBe(0);
    expect(thresholdProgress(25)).toBe(0.5);
    expect(thresholdProgress(90)).toBe(1);
    expect(thresholdProgress(-3)).toBe(0);
  });
});

describe('voting: support only, one per person, can withdraw', () => {
  it('toggles and never goes below zero', () => {
    expect(toggleVote({ iVoted: false, voteCount: 4 })).toEqual({ iVoted: true, voteCount: 5 });
    expect(toggleVote({ iVoted: true, voteCount: 5 })).toEqual({ iVoted: false, voteCount: 4 });
    expect(toggleVote({ iVoted: true, voteCount: 0 })).toEqual({ iVoted: false, voteCount: 0 });
  });
  it('no vote on my own idea, nor on a closed one', () => {
    expect(voteState({ status: 'published', isMine: true, iVoted: false })).toBe('own');
    expect(voteState({ status: 'implemented', isMine: false, iVoted: true })).toBe('closed');
    expect(voteState({ status: 'rejected', isMine: false, iVoted: false })).toBe('closed');
    expect(voteState({ status: 'awaiting_response', isMine: false, iVoted: true })).toBe('voted');
    expect(voteState({ status: 'published', isMine: false, iVoted: false })).toBe('can_vote');
  });
  it('open statuses match the server', () => {
    expect(IDEA_STATUSES.filter(isOpenForVotes)).toEqual(['published', 'awaiting_response', 'under_study', 'accepted', 'in_progress']);
    expect(IDEA_STATUSES.filter((s) => !isPublicStatus(s))).toEqual(['new', 'review_rejected']);
  });
});

describe('monthly limit: 3 ideas (Kuwait month)', () => {
  const now = new Date('2026-11-17T09:00:00Z');
  it('counts only this Kuwait month', () => {
    const dates = [new Date('2026-11-01T00:30:00+03:00'), new Date('2026-11-10T10:00:00Z'), new Date('2026-10-31T23:30:00+03:00')];
    expect(usedThisMonth(dates, now)).toBe(2);
  });
  it('a submission at 01:00 Kuwait on the 1st belongs to the new month', () => {
    expect(usedThisMonth([new Date('2026-11-30T22:00:00Z')], new Date('2026-12-01T08:00:00+03:00'))).toBe(1);
  });
  it('remaining never goes negative', () => {
    expect(remainingThisMonth(0)).toBe(3);
    expect(remainingThisMonth(2)).toBe(1);
    expect(remainingThisMonth(3)).toBe(0);
    expect(remainingThisMonth(5)).toBe(0);
  });
  it('the limit error has a text', () => {
    expect(ideaErrorKey({ message: 'idea_monthly_limit' })).toBe('idea_err_idea_monthly_limit');
    expect(hasKey('idea_err_idea_monthly_limit')).toBe(true);
  });
});

describe('anonymity', () => {
  const base = { isAnonymous: true, isMine: false, authorNameAr: null, authorNameEn: null };
  it('an anonymous idea shows no name', () => {
    expect(authorLabel(base, ar, 'ar')).toBe('بدون اسم');
    expect(authorLabel(base, en, 'en')).toBe('Anonymous');
  });
  it('even if a name were sent by mistake, an anonymous idea never shows it', () => {
    expect(authorLabel({ ...base, authorNameAr: 'سالم', authorNameEn: 'Salem' }, ar, 'ar')).toBe('بدون اسم');
  });
  it('a named idea shows the name; my own idea says so', () => {
    expect(authorLabel({ ...base, isAnonymous: false, authorNameAr: 'سالم', authorNameEn: 'Salem' }, en, 'en')).toBe('Salem');
    expect(authorLabel({ ...base, isMine: true }, ar, 'ar')).toBe('فكرتك (بدون اسم)');
  });
  it('photo names carry no user id', () => {
    expect(photoObjectName(() => ID.toUpperCase())).toBe(`${ID}.jpg`);
    expect(() => photoObjectName(() => '710000/x')).toThrow();
  });
});

describe('the 14-day countdown', () => {
  const now = new Date('2026-11-17T09:00:00Z');
  it('runs only while waiting for management', () => {
    expect(responseCountdown({ status: 'published', responseDueAt: null }, now)).toBeNull();
    expect(responseCountdown({ status: 'under_study', responseDueAt: new Date('2026-11-20T09:00:00Z') }, now)).toBeNull();
  });
  it('days and hours left', () => {
    const c = responseCountdown({ status: 'awaiting_response', responseDueAt: new Date('2026-11-30T15:00:00Z') }, now)!;
    expect(c).toEqual({ overdue: false, days: 13, hours: 6, totalHours: 318 });
    expect(countdownText(c, ar)).toBe('13 يوم و6 ساعة');
  });
  it('last hours, then overdue', () => {
    const c = responseCountdown({ status: 'awaiting_response', responseDueAt: new Date('2026-11-17T11:30:00Z') }, now)!;
    expect(countdownText(c, en)).toBe('3 h');
    const late = responseCountdown({ status: 'awaiting_response', responseDueAt: new Date('2026-11-16T09:00:00Z') }, now)!;
    expect(late.overdue).toBe(true);
    expect(countdownText(late, ar)).toBe('تأخر رد الإدارة');
  });
});

describe('new idea form', () => {
  it('same limits as the database', () => {
    expect(validateDraft({ title: 'abcd', description: 'x'.repeat(19), category: null })).toEqual({
      title: 'idea_error_title_short', description: 'idea_error_description_short', category: 'idea_error_category',
    });
    expect(validateDraft({ title: ' '.repeat(10) + 'abcde', description: 'x'.repeat(20), category: 'safety' })).toEqual({});
    expect(validateDraft({ title: 'x'.repeat(121), description: 'x'.repeat(2001), category: 'other' })).toEqual({
      title: 'idea_error_title_long', description: 'idea_error_description_long',
    });
  });
});

describe('timeline', () => {
  const at = (d: string) => new Date(`2026-11-${d}T08:00:00Z`);
  it('done, current, then what is ahead; skipped steps hidden', () => {
    const steps = timelineSteps('under_study', [
      { status: 'new', reason: null, at: at('01') },
      { status: 'published', reason: null, at: at('02') },
      { status: 'under_study', reason: 'نراجع الميزانية', at: at('05') },
    ]);
    expect(steps.map((s) => `${s.status}:${s.state}`)).toEqual([
      'new:done', 'published:done', 'under_study:current', 'accepted:todo', 'in_progress:todo', 'implemented:todo',
    ]);
    expect(steps[2].reason).toBe('نراجع الميزانية');
  });
  it('a rejection ends the path with its reason', () => {
    const steps = timelineSteps('rejected', [
      { status: 'new', reason: null, at: at('01') },
      { status: 'published', reason: null, at: at('02') },
      { status: 'rejected', reason: 'مكلفة', at: at('09') },
    ]);
    expect(steps.map((s) => `${s.status}:${s.state}`)).toEqual(['new:done', 'published:done', 'rejected:current']);
    expect(steps[2].reason).toBe('مكلفة');
  });
});

describe('server rows', () => {
  it('maps list and detail rows', () => {
    const s = toSummary({ id: ID, title: 'ت', description: 'و', category: 'safety', status: 'published', vote_count: '7', i_voted: true, is_anonymous: true, author_name_ar: null, has_photo: false, created_at: '2026-11-17T08:00:00Z' });
    expect(s).toMatchObject({ voteCount: 7, iVoted: true, isAnonymous: true, authorNameAr: null, isMine: false });
    const d = toDetail({ id: ID, status: 'awaiting_response', vote_count: 50, vote_threshold: 50, response_due_at: '2026-12-01T08:00:00Z', timeline: [{ status: 'new', reason: null, at: '2026-11-17T08:00:00Z' }] });
    expect(d.responseDueAt?.toISOString()).toBe('2026-12-01T08:00:00.000Z');
    expect(d.timeline).toHaveLength(1);
  });
  it('unknown errors fall back to the generic text', () => {
    expect(ideaErrorKey(new Error('boom'))).toBe('idea_err_generic');
    expect(ideaErrorKey({ message: 'P0001: idea_own_vote' })).toBe('idea_err_idea_own_vote');
  });
  it('base64 decoding', () => {
    expect(Array.from(base64ToBytes('/9j/4A=='))).toEqual([0xff, 0xd8, 0xff, 0xe0]);
    expect(Array.from(base64ToBytes('TWFu'))).toEqual([77, 97, 110]);
  });
});

describe('texts and notifications', () => {
  it('every status and category has Arabic and English text', () => {
    for (const s of IDEA_STATUSES) {
      expect(hasKey(ideaStatusView(s).key)).toBe(true);
      expect(en(ideaStatusView(s).key)).not.toBe(en('error_generic'));
    }
    for (const c of IDEA_CATEGORIES) expect(hasKey(`idea_cat_${c}`)).toBe(true);
    expect(ar('idea_cat_work_environment')).toBe('بيئة العمل');
    expect(ar('idea_status_awaiting_response')).toBe('بانتظار رد الإدارة');
  });
  it('idea notifications open the idea', () => {
    expect(routeFor('idea_status', { idea_id: ID })).toBe(`/ideas/${ID}`);
    expect(routeFor('idea_overdue', { idea_id: ID })).toBe(`/ideas/${ID}`);
    expect(routeFor('idea_awaiting', {})).toBe('/ideas');
  });
});
