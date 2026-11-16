import { makeT } from '../../../lib/i18n';
import { noticeView } from '../notice';

const at = new Date('2026-11-16T08:00:00Z');
const ar = makeT('ar');
const en = makeT('en');

describe('noticeView', () => {
  it('supervisor approval of a leave is not final yet', () => {
    const v = noticeView({ kind: 'request_decided', at, data: { request_type: 'leave', leave_type: 'إجازة دورية', decision: 'approved', stage: 'supervisor', status: 'pending_hr', date: '2026-11-20', to: '2026-11-22' } }, en);
    expect(v.title).toBe(`${en('notice_supervisor_ok')}: ${en('leave_annual')}`);
    expect(v.tone).toBe('ok');
    expect(v.body).toContain('–');
  });

  it('final approval and rejection, with the approver note', () => {
    expect(noticeView({ kind: 'request_decided', at, data: { request_type: 'punch_correction', decision: 'approved', stage: 'hr', status: 'approved', date: '2026-11-10' } }, ar).title)
      .toBe(`${ar('notice_approved')}: ${ar('type_punch_correction')}`);
    const r = noticeView({ kind: 'request_decided', at, data: { request_type: 'external_mission', decision: 'rejected', stage: 'supervisor', status: 'rejected', date: '2026-11-10', note: 'لا يوجد سبب كاف' } }, ar);
    expect(r.title.startsWith(ar('notice_rejected'))).toBe(true);
    expect(r.body).toContain('لا يوجد سبب كاف');
    expect(r.icon).toBe('close-circle');
  });

  it('late, penalty and bonus list', () => {
    expect(noticeView({ kind: 'late', at, data: { date: '2026-11-12', minutes: 14 } }, en).body).toContain(en('notice_minutes', { n: 14 }));
    expect(noticeView({ kind: 'penalty_recorded', at, data: { type: 'لفت نظر', date: '2026-11-01', reason: null } }, en).title).toBe(`${en('notice_penalty')}: Notice`);
    const b = noticeView({ kind: 'bonus_list', at, data: { month: '2026-10', eligibility: 'غير مستحق', reason: 'تأخير مرتين' } }, ar);
    expect(b.body).toBe(`${ar('dash_not_eligible')}: تأخير مرتين`);
    expect(b.href).toBe('/dashboard?month=2026-10');
    expect(noticeView({ kind: 'bonus_list', at, data: { month: '2026-10', eligibility: 'مستحق' } }, ar).body).toBe(ar('dash_eligible'));
  });

  it('an unknown kind still renders', () => {
    expect(noticeView({ kind: 'something_new', at, data: {} }, en).href).toBeNull();
  });
});
