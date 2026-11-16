// Phase 9: where each notification opens, the permission card states, unread counts, and the list texts.
import { noticeView } from '../../components/dash/notice';
import { makeT } from '../i18n';
import { fromPushData, NOTIFICATION_KINDS, promptState, PROMPT_SNOOZE_DAYS, routeFor, unreadCount } from '../notify';

const RID = '0b6f1f43-6e0b-4c5e-9d43-0f2b8c1a9e11';
const EID = '39fb6c9d-ee9d-42fb-9f56-f856d524614f';

describe('routeFor: each kind opens the right screen', () => {
  it.each([
    ['shift_reminder', {}, '/'],
    ['late_warning', {}, '/'],
    ['checkout_reminder', {}, '/'],
    ['missing_checkout', {}, '/'],
    ['request_decided', { request_id: RID }, `/request/${RID}`],
    ['request_decided', {}, '/requests'],
    ['request_to_approve', { request_id: RID }, '/approvals'],
    ['leave_recorded', {}, '/dashboard'],
    ['penalty_recorded', {}, '/dashboard'],
    ['bonus_list', { month: '2026-10' }, '/dashboard?month=2026-10'],
    ['bonus_list', { month: 'bad' }, '/dashboard'],
    ['late', {}, '/reports'],
    ['sup_failed_verification', { employee_id: EID }, `/record/${EID}`],
    ['sup_not_in', { employees: [{ id: EID }] }, `/record/${EID}`],
    ['sup_absent', { employees: [{ id: EID }, { id: RID }] }, '/notifications'],
    ['sup_missing_checkout', { count: '3' }, '/notifications'],
    ['emergency_alert', {}, '/notifications'],
    ['something_else', {}, '/notifications'],
  ])('%s %j -> %s', (kind, data, href) => {
    expect(routeFor(kind, data)).toBe(href);
  });

  it('ids that are not uuids never reach a route', () => {
    expect(routeFor('request_decided', { request_id: '../admin' })).toBe('/requests');
    expect(routeFor('sup_failed_verification', { employee_id: 'x?y' })).toBe('/notifications');
  });

  it('every server kind has a route', () => {
    for (const k of NOTIFICATION_KINDS) expect(routeFor(k, {}).startsWith('/')).toBe(true);
  });
});

describe('fromPushData: the FCM data payload of a tapped notification', () => {
  it('reads kind, id and route from string values', () => {
    expect(fromPushData({ kind: 'request_decided', notification_id: RID, request_id: RID, priority: 'normal' }))
      .toEqual({ kind: 'request_decided', id: RID, route: `/request/${RID}` });
  });
  it('accepts the payload as one JSON string', () => {
    expect(fromPushData({ dataString: JSON.stringify({ kind: 'bonus_list', month: '2026-11' }) })?.route).toBe('/dashboard?month=2026-11');
  });
  it('ignores a notification that is not ours', () => {
    expect(fromPushData({})).toBeNull();
    expect(fromPushData(null)).toBeNull();
    expect(fromPushData({ dataString: '{bad json' })).toBeNull();
  });
});

describe('promptState: the permission card', () => {
  const now = Date.UTC(2026, 10, 17);
  const base = { isDevice: true, dismissedAt: null, now };
  it('asks with an explanation while the system can still ask', () => {
    expect(promptState({ status: 'undetermined', canAskAgain: true }, base)).toBe('ask');
    expect(promptState({ status: 'denied', canAskAgain: true }, base)).toBe('ask');
  });
  it('sends to Settings when denied for good', () => {
    expect(promptState({ status: 'denied', canAskAgain: false }, base)).toBe('settings');
  });
  it('hidden when granted, on a simulator / web, or when unknown', () => {
    expect(promptState({ status: 'granted', canAskAgain: true }, base)).toBe('hidden');
    expect(promptState({ status: 'undetermined', canAskAgain: true }, { ...base, isDevice: false })).toBe('hidden');
    expect(promptState(null, base)).toBe('hidden');
  });
  it('"Not now" hides it for 7 days, then it comes back', () => {
    const p = { status: 'undetermined' as const, canAskAgain: true };
    expect(promptState(p, { ...base, dismissedAt: now - 86400e3 })).toBe('hidden');
    expect(promptState(p, { ...base, dismissedAt: now - (PROMPT_SNOOZE_DAYS * 86400e3 + 1) })).toBe('ask');
  });
});

describe('unread count', () => {
  it('counts rows without read_at', () => {
    expect(unreadCount([{ readAt: null }, { readAt: new Date() }, { readAt: null }])).toBe(2);
    expect(unreadCount([])).toBe(0);
  });
});

describe('noticeView for the Phase 9 kinds', () => {
  const at = new Date('2026-11-16T08:00:00Z');
  const n = {
    kind: 'late_warning', at, data: { shift_start: '2026-11-16T04:00:00Z' }, id: RID, readAt: null,
    title: { ar: 'لم تسجّل بصمة الدخول بعد', en: 'You have not punched in yet' },
    body: { ar: 'بدأت ورديتك الساعة 07:00.', en: 'Your shift started at 07:00.' },
  };
  it('uses the stored text in the chosen language', () => {
    expect(noticeView(n, makeT('ar')).title).toBe('لم تسجّل بصمة الدخول بعد');
    const en = noticeView(n, makeT('en'));
    expect(en.title).toBe('You have not punched in yet');
    expect(en.body).toBe('Your shift started at 07:00.');
    expect(en.href).toBe('/');
  });
  it('a supervisor list of several employees is not a link (the list is the destination)', () => {
    const v = noticeView({ ...n, kind: 'sup_not_in', data: { count: 3 } }, makeT('ar'));
    expect(v.href).toBeNull();
    expect(v.icon).toBe('people-outline');
  });
  it('request decisions open the request when the id is known', () => {
    const v = noticeView({ kind: 'request_decided', at, data: { request_id: RID, request_type: 'leave', leave_type: 'إجازة دورية', decision: 'approved', stage: 'hr', date: '2026-12-01' } }, makeT('en'));
    expect(v.href).toBe(`/request/${RID}`);
  });
});
