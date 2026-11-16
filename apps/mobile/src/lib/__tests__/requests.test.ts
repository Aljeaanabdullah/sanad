import type { DayRecord, RequestItem } from '../api';
import { kuwaitTime } from '../dates';
import { makeT } from '../i18n';
import {
  canSeePhotos,
  correctionInstants,
  countByFilter,
  dayNotes,
  daysBetween,
  errorKey,
  fileNumberInput,
  filterRequests,
  isFileNumber,
  isStaff,
  kuwaitHm,
  leaveDays,
  leaveReason,
  leaveTypeKey,
  leaveTypeLabel,
  monthEnd,
  monthTotals,
  requestSummary,
  requestTitle,
  sameMonth,
  searchSites,
  shiftMonth,
  statusView,
  typeIcon,
  validateCorrection,
  validateLeave,
  validateMission,
  validateNote,
} from '../requestsView';
import ar from '../strings.json';
import b from '../strings-b.json';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);
const today = d(2026, 11, 16);

function req(over: Partial<RequestItem> = {}): RequestItem {
  return {
    id: 'r1',
    type: 'leave',
    status: 'pending_supervisor',
    shiftDate: '2026-11-20',
    reason: 'family',
    createdAt: new Date('2026-11-15T08:00:00Z'),
    punchType: null,
    time: null,
    siteAr: null,
    siteEn: null,
    leaveType: 'إجازة دورية',
    leaveTo: '2026-11-22',
    ...over,
  };
}

describe('roles', () => {
  it('staff = supervisor, hr, admin', () => {
    expect(isStaff('employee')).toBe(false);
    expect(isStaff('supervisor')).toBe(true);
    expect(isStaff('hr')).toBe(true);
    expect(isStaff('admin')).toBe(true);
    expect(isStaff(undefined)).toBe(false);
  });
  it('review photos only for supervisor and admin (PRD 4.4)', () => {
    expect(canSeePhotos('supervisor')).toBe(true);
    expect(canSeePhotos('admin')).toBe(true);
    expect(canSeePhotos('hr')).toBe(false);
    expect(canSeePhotos('employee')).toBe(false);
  });
});

describe('status and type', () => {
  it('maps every status to a tone and an existing label key', () => {
    const statuses = ['pending_supervisor', 'pending_hr', 'approved', 'rejected', 'cancelled'] as const;
    const tones = statuses.map((s) => statusView(s).tone);
    expect(tones).toEqual(['warn', 'info', 'ok', 'danger', 'neutral']);
    for (const s of statuses) expect(Object.keys(ar.ar)).toContain(statusView(s).key);
  });
  it('gives each type its own icon', () => {
    const icons = new Set([typeIcon('leave'), typeIcon('punch_correction'), typeIcon('external_mission')]);
    expect(icons.size).toBe(3);
  });
  it('labels leave types by language and falls back to the stored text', () => {
    expect(leaveTypeKey('إجازة مرضية')).toBe('leave_sick');
    expect(leaveTypeKey('something')).toBeNull();
    expect(leaveTypeLabel(makeT('en'), 'إجازة طارئة')).toBe('Emergency leave');
    expect(leaveTypeLabel(makeT('en'), 'other')).toBe('other');
    expect(requestTitle(req(), makeT('en'))).toBe('Annual leave');
    expect(requestTitle(req({ type: 'external_mission' }), makeT('ar'))).toBe('مهمة عمل خارجية');
  });
});

describe('filters', () => {
  const items = [
    req({ id: 'a', status: 'pending_supervisor' }),
    req({ id: 'b', status: 'pending_hr' }),
    req({ id: 'c', status: 'approved' }),
    req({ id: 'd', status: 'rejected' }),
    req({ id: 'e', status: 'cancelled' }),
  ];
  it('splits pending and decided', () => {
    expect(filterRequests(items, 'all')).toHaveLength(5);
    expect(filterRequests(items, 'pending').map((r) => r.id)).toEqual(['a', 'b']);
    expect(filterRequests(items, 'decided').map((r) => r.id)).toEqual(['c', 'd', 'e']);
    expect(countByFilter(items)).toEqual({ all: 5, pending: 2, decided: 3 });
  });
});

describe('dates', () => {
  it('counts leave days with both ends included', () => {
    expect(leaveDays(d(2026, 11, 20), d(2026, 11, 20))).toBe(1);
    expect(leaveDays(d(2026, 11, 20), d(2026, 11, 22))).toBe(3);
    expect(leaveDays(d(2026, 12, 30), d(2027, 1, 2))).toBe(4);
    expect(leaveDays(d(2026, 11, 22), d(2026, 11, 20))).toBeNull();
    expect(leaveDays(null, d(2026, 11, 20))).toBeNull();
  });
  it('ignores the time of day when counting days', () => {
    expect(daysBetween(new Date(2026, 10, 16, 23, 59), new Date(2026, 10, 17, 0, 1))).toBe(1);
  });
  it('shows Kuwait time whatever the phone zone', () => {
    expect(kuwaitHm(new Date('2026-11-16T04:05:00Z'))).toBe('07:05');
    expect(kuwaitHm(new Date('2026-11-16T22:30:00Z'))).toBe('01:30');
  });
  it('tries the next day for a night check-out only', () => {
    expect(correctionInstants(d(2026, 11, 15), 7, 0, 'check_in')).toEqual([kuwaitTime(d(2026, 11, 15), 7, 0)]);
    const out = correctionInstants(d(2026, 11, 15), 2, 0, 'check_out');
    expect(out).toHaveLength(2);
    expect(out[1].getTime() - out[0].getTime()).toBe(24 * 3600 * 1000);
  });
  it('moves between months', () => {
    expect(shiftMonth(d(2026, 1, 15), -1)).toEqual(d(2025, 12, 1));
    expect(monthEnd(d(2026, 2, 10)).getDate()).toBe(28);
    expect(sameMonth(d(2026, 11, 1), d(2026, 11, 30))).toBe(true);
  });
});

describe('leave validation', () => {
  it('needs both dates', () => {
    expect(validateLeave({ from: null, to: null, today })).toBe('leave_pick_dates');
  });
  it('refuses an end before the start', () => {
    expect(validateLeave({ from: d(2026, 11, 20), to: d(2026, 11, 19), today })).toBe('req_error_leave_dates_invalid');
  });
  it('allows from 7 days back up to 180 ahead, at most 60 days', () => {
    expect(validateLeave({ from: d(2026, 11, 9), to: d(2026, 11, 10), today })).toBeNull();
    expect(validateLeave({ from: d(2026, 11, 8), to: d(2026, 11, 10), today })).toBe('req_error_leave_dates_out_of_range');
    expect(validateLeave({ from: d(2026, 11, 20), to: d(2027, 1, 18), today })).toBeNull(); // 60 days
    expect(validateLeave({ from: d(2026, 11, 20), to: d(2027, 1, 19), today })).toBe('req_error_leave_dates_out_of_range'); // 61
    expect(validateLeave({ from: d(2027, 5, 15), to: d(2027, 5, 16), today })).toBe('req_error_leave_dates_out_of_range');
  });
  it('sends the type as reason when the reason is too short', () => {
    expect(leaveReason('  ', 'إجازة مرضية')).toBe('إجازة مرضية');
    expect(leaveReason(' flu ', 'إجازة مرضية')).toBe('flu');
  });
});

describe('correction and mission validation', () => {
  const now = kuwaitTime(today, 10, 0);
  const base = { date: d(2026, 11, 15), time: { hour: 7, minute: 0 }, reason: 'forgot', today, now };
  it('accepts a correction in the last 7 days', () => {
    expect(validateCorrection(base)).toBeNull();
    expect(validateCorrection({ ...base, date: d(2026, 11, 9) })).toBeNull();
  });
  it('asks for missing fields first', () => {
    expect(validateCorrection({ ...base, date: null })).toBe('req_missing_date');
    expect(validateCorrection({ ...base, time: null })).toBe('req_missing_time');
  });
  it('refuses old days, future times and short reasons', () => {
    expect(validateCorrection({ ...base, date: d(2026, 11, 8) })).toBe('req_error_correction_too_old');
    expect(validateCorrection({ ...base, date: today, time: { hour: 11, minute: 0 } })).toBe('req_error_time_in_future');
    expect(validateCorrection({ ...base, reason: 'ab ' })).toBe('req_error_reason_required');
  });
  it('mission: today up to 30 days, with a site', () => {
    const m = { date: today, siteId: 's1', reason: 'meeting', today };
    expect(validateMission(m)).toBeNull();
    expect(validateMission({ ...m, date: d(2026, 12, 16) })).toBeNull();
    expect(validateMission({ ...m, date: d(2026, 12, 17) })).toBe('req_error_mission_date_out_of_range');
    expect(validateMission({ ...m, date: d(2026, 11, 15) })).toBe('req_error_mission_date_out_of_range');
    expect(validateMission({ ...m, siteId: null })).toBe('req_missing_site');
  });
  it('limits the decision note', () => {
    expect(validateNote('ok')).toBeNull();
    expect(validateNote('x'.repeat(1001))).toBe('req_error_note_too_long');
  });
});

describe('errors and input', () => {
  it('maps a known code to its text key, else generic', () => {
    expect(errorKey({ code: 'leave_overlaps' })).toBe('req_error_leave_overlaps');
    expect(errorKey({ code: 'nope' })).toBe('req_error_generic');
    expect(errorKey(new Error('x'))).toBe('req_error_generic');
  });
  it('keeps 6 digits, converting Arabic-Indic digits', () => {
    expect(fileNumberInput('71a0 001')).toBe('710001');
    expect(fileNumberInput('٧١٠٠٠١٢')).toBe('710001');
    expect(isFileNumber('71000')).toBe(false);
    expect(isFileNumber('710001')).toBe(true);
  });
  it('searches sites in both languages', () => {
    const sites = [
      { id: '1', nameAr: 'المقر الرئيسي', nameEn: 'Head Office' },
      { id: '2', nameAr: 'مستودع الشويخ', nameEn: 'Shuwaikh Store' },
    ];
    expect(searchSites(sites, 'head').map((s) => s.id)).toEqual(['1']);
    expect(searchSites(sites, 'الشويخ').map((s) => s.id)).toEqual(['2']);
    expect(searchSites(sites, '  ')).toHaveLength(2);
  });
});

describe('summary text', () => {
  const en = makeT('en');
  it('leave shows the range', () => {
    const s = requestSummary(req(), en, 'en');
    expect(s).toContain('–');
  });
  it('correction shows in/out and Kuwait time', () => {
    const s = requestSummary(req({ type: 'punch_correction', punchType: 'check_out', time: new Date('2026-11-15T11:00:00Z') }), en, 'en');
    expect(s).toContain('Out 14:00');
  });
  it('mission shows the site in the chosen language', () => {
    const r = req({ type: 'external_mission', siteAr: 'المقر', siteEn: 'HQ', leaveTo: null });
    expect(requestSummary(r, en, 'en')).toContain('HQ');
    expect(requestSummary(r, makeT('ar'), 'ar')).toContain('المقر');
  });
});

describe('month record', () => {
  const day = (over: Partial<DayRecord>): DayRecord => ({
    day: '2026-11-10',
    kind: 'work',
    shiftStart: new Date('2026-11-10T04:00:00Z'),
    shiftEnd: new Date('2026-11-10T11:00:00Z'),
    arrival: 'on_time',
    departure: 'done',
    checkIn: null,
    checkOut: null,
    lateMinutes: 0,
    earlyLeaveMinutes: 0,
    checkInCorrected: false,
    checkOutCorrected: false,
    ...over,
  });
  const now = new Date('2026-11-16T09:00:00Z');
  it('notes for each kind of day', () => {
    expect(dayNotes(day({ kind: 'holiday', arrival: null, departure: null }), now)).toEqual([{ key: 'kind_holiday', tone: 'neutral' }]);
    expect(dayNotes(day({ arrival: 'late', lateMinutes: 12 }), now)[0]).toEqual({ key: 'late_by', vars: { minutes: 12 }, tone: 'warn' });
    expect(dayNotes(day({ arrival: 'absent', departure: 'missing' }), now).map((n) => n.key)).toEqual(['arrival_absent', 'missing_out']);
    expect(dayNotes(day({ arrival: 'pending', shiftStart: new Date('2026-11-20T04:00:00Z') }), now)[0].key).toBe('arrival_upcoming');
    expect(dayNotes(day({ earlyLeaveMinutes: 5 }), now).map((n) => n.key)).toEqual(['arrival_on_time', 'early_by']);
  });
  it('totals late, absent and missing check-out', () => {
    expect(
      monthTotals([day({ arrival: 'late' }), day({ arrival: 'absent', departure: 'missing' }), day({ departure: 'missing' }), day({})]),
    ).toEqual({ late: 1, absent: 1, missing: 2 });
  });
});

describe('strings-b', () => {
  it('has the same keys in Arabic and English, none empty', () => {
    expect(Object.keys(b.ar).sort()).toEqual(Object.keys(b.en).sort());
    for (const v of [...Object.values(b.ar), ...Object.values(b.en)]) expect(v.trim().length).toBeGreaterThan(0);
  });
});
