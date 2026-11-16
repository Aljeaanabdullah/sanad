import { hasKey, makeT } from '../i18n';
import {
  base64Bytes,
  biometricErrorKey,
  biometricTypeOf,
  bonusLabels,
  buildPunchBody,
  canRetry,
  ERROR_CODES,
  errorKey,
  firstName,
  isStale,
  looksLikeJpeg,
  minutesUntil,
  nextPunchKind,
  parsePunchError,
  parsePunchResult,
  photoTooBig,
  PHOTO_MAX_BYTES,
  reasonKey,
  recentCount,
  reportProblems,
  resultMinutes,
  SERVER_PHOTO_MAX_BYTES,
  shiftCard,
  stepStates,
  stripDataUrl,
  type ShiftLike,
} from '../punch';
import a from '../strings-a.json';

const at = (iso: string) => new Date(iso);

describe('buildPunchBody', () => {
  const base = {
    deviceId: 'dev-123',
    location: { lat: 29.37, lng: 47.97, accuracy: 12 },
    report: { vpn: false, mockLocation: true, rooted: false },
    biometric: 'face' as const,
    photo: 'data:image/jpeg;base64,/9j/AAAA',
  };

  it('uses the device_biometric verification and the server field names', () => {
    expect(buildPunchBody(base)).toEqual({
      verification: 'device_biometric',
      device_identifier: 'dev-123',
      location: { lat: 29.37, lng: 47.97, accuracy: 12 },
      report: { vpn: false, mock_location: true, rooted: false, biometric: { passed: true, type: 'face' } },
      photo: '/9j/AAAA',
    });
  });

  it('never sends a face descriptor or model version', () => {
    const body = buildPunchBody(base) as Record<string, unknown>;
    expect(body.descriptor).toBeUndefined();
    expect(body.model_version).toBeUndefined();
  });

  it('sends a large accuracy when the phone gives none, so the server refuses it as weak GPS', () => {
    const body = buildPunchBody({ ...base, location: { lat: 1, lng: 2, accuracy: Number.NaN } });
    expect(body.location.accuracy).toBeGreaterThan(100);
  });
});

describe('photo size', () => {
  it('computes the decoded size of base64', () => {
    expect(base64Bytes('')).toBe(0);
    expect(base64Bytes('QQ==')).toBe(1);
    expect(base64Bytes('QUI=')).toBe(2);
    expect(base64Bytes('QUJD')).toBe(3);
    expect(base64Bytes('data:image/jpeg;base64,QUJD')).toBe(3);
  });

  it('keeps photos well under the server limit', () => {
    expect(PHOTO_MAX_BYTES).toBeLessThan(SERVER_PHOTO_MAX_BYTES);
    const ok = 'A'.repeat(Math.floor((PHOTO_MAX_BYTES * 4) / 3) - 8);
    const big = 'A'.repeat(Math.ceil((PHOTO_MAX_BYTES * 4) / 3) + 8);
    expect(photoTooBig(ok)).toBe(false);
    expect(photoTooBig(big)).toBe(true);
  });

  it('recognises a JPEG by its base64 prefix', () => {
    expect(looksLikeJpeg('/9j/4AAQ')).toBe(true);
    expect(looksLikeJpeg('iVBORw0KGgo')).toBe(false);
    expect(stripDataUrl('abc')).toBe('abc');
  });
});

describe('parsePunchResult', () => {
  const now = at('2026-11-16T05:00:00Z');

  it('reads an accepted check-in with the day record', () => {
    const o = parsePunchResult(
      {
        result: 'accepted',
        reason: null,
        punch_type: 'check_in',
        punched_at: '2026-11-16T04:12:00.000Z',
        site: { name_ar: 'المقر الرئيسي', name_en: 'Head office' },
        distance_m: 40,
        day: { arrival: 'late', departure: 'pending', late_minutes: 12, early_leave_minutes: 0 },
      },
      now,
    );
    expect(o).toEqual({
      kind: 'accepted',
      reason: null,
      punchType: 'check_in',
      punchedAt: at('2026-11-16T04:12:00.000Z'),
      site: { ar: 'المقر الرئيسي', en: 'Head office' },
      distanceM: 40,
      day: { arrival: 'late', departure: 'pending', lateMinutes: 12, earlyLeaveMinutes: 0 },
    });
    expect(resultMinutes(o)).toEqual({ key: 'late_by', minutes: 12 });
  });

  it('reads a refusal with its reason and distance', () => {
    const o = parsePunchResult({ result: 'rejected', reason: 'outside_site', punch_type: 'check_out', punched_at: '2026-11-16T13:00:00Z', site: { name_ar: 'م', name_en: 'S' }, distance_m: 850, day: null });
    expect(o.kind).toBe('rejected');
    if (o.kind === 'error') throw new Error('unexpected');
    expect(o.reason).toBe('outside_site');
    expect(o.punchType).toBe('check_out');
    expect(o.distanceM).toBe(850);
    expect(resultMinutes(o)).toBeNull();
  });

  it('accepts a JSON string body', () => {
    expect(parsePunchResult(JSON.stringify({ result: 'rejected', reason: 'vpn', punch_type: 'check_in', punched_at: '2026-11-16T04:00:00Z' })).kind).toBe('rejected');
  });

  it('turns an unexpected body into an error outcome', () => {
    expect(parsePunchResult(null)).toEqual({ kind: 'error', code: 'generic', unlockAt: null });
    expect(parsePunchResult('not json')).toEqual({ kind: 'error', code: 'generic', unlockAt: null });
    expect(parsePunchResult({ error: 'save_failed' })).toEqual({ kind: 'error', code: 'save_failed', unlockAt: null });
  });

  it('falls back to now when the server time is missing, and to generic when the reason is', () => {
    const o = parsePunchResult({ result: 'rejected', punch_type: 'x' }, now);
    if (o.kind === 'error') throw new Error('unexpected');
    expect(o.punchedAt).toEqual(now);
    expect(o.reason).toBe('generic');
    expect(o.punchType).toBe('check_in');
  });

  it('reports early-leave minutes on a check-out', () => {
    const o = parsePunchResult({ result: 'accepted', punch_type: 'check_out', punched_at: '2026-11-16T12:30:00Z', day: { early_leave_minutes: 30, late_minutes: 5 } });
    expect(resultMinutes(o)).toEqual({ key: 'early_by', minutes: 30 });
  });
});

describe('errors and retry', () => {
  const now = at('2026-11-16T05:00:00Z');

  it('reads the lock with its end time', () => {
    const o = parsePunchError({ error: 'locked', unlock_at: '2026-11-16T05:03:30Z' });
    expect(o).toEqual({ kind: 'error', code: 'locked', unlockAt: at('2026-11-16T05:03:30Z') });
    if (o.kind !== 'error') throw new Error('unexpected');
    expect(minutesUntil(o.unlockAt, now)).toBe(4);
    expect(canRetry(o, now)).toBe(false);
    expect(canRetry(o, at('2026-11-16T05:04:00Z'))).toBe(true);
  });

  it('does not offer retry for a disabled account', () => {
    expect(canRetry(parsePunchError({ error: 'account_disabled' }))).toBe(false);
    expect(canRetry(parsePunchError({ error: 'save_failed' }))).toBe(true);
    expect(canRetry(parsePunchError(null))).toBe(true);
  });

  it('offers retry after a refusal', () => {
    expect(canRetry(parsePunchResult({ result: 'rejected', reason: 'weak_gps', punch_type: 'check_in', punched_at: '2026-11-16T05:00:00Z' }))).toBe(true);
    expect(canRetry(parsePunchResult({ result: 'accepted', punch_type: 'check_in', punched_at: '2026-11-16T05:00:00Z' }))).toBe(false);
  });

  it('minutesUntil is 0 without a time or after it', () => {
    expect(minutesUntil(null, now)).toBe(0);
    expect(minutesUntil(at('2026-11-16T04:00:00Z'), now)).toBe(0);
    expect(minutesUntil(at('2026-11-16T05:00:01Z'), now)).toBe(1);
  });
});

describe('texts', () => {
  // Every refusal the punch function and the rules engine (punch_slot) can record.
  const SERVER_REASONS = [
    'no_consent', 'wrong_device', 'vpn', 'mock_location', 'rooted', 'biometric_failed', 'liveness_failed', 'weak_gps',
    'wrong_model_version', 'no_site', 'outside_site', 'not_enrolled', 'face_mismatch',
    'no_work_pattern', 'no_shift_now', 'already_checked_out', 'checkin_window_closed',
  ];

  it('has a text for every server refusal reason', () => {
    for (const r of SERVER_REASONS) expect(reasonKey(r, hasKey)).toBe(`punch_reason_${r}`);
  });

  it('falls back to a generic refusal text for an unknown reason', () => {
    expect(reasonKey('something_new', hasKey)).toBe('punch_reason_generic');
    expect(reasonKey(null, hasKey)).toBe('punch_reason_generic');
    expect(hasKey('punch_reason_generic')).toBe(true);
  });

  it('has a text for every request error code', () => {
    for (const c of ERROR_CODES) expect(errorKey(c, hasKey)).toBe(`punch_error_${c}`);
    expect(errorKey('weird', hasKey)).toBe('error_generic');
  });

  it('defines every new key in both Arabic and English, without emoji', () => {
    expect(Object.keys(a.ar).sort()).toEqual(Object.keys(a.en).sort());
    for (const v of [...Object.values(a.ar), ...Object.values(a.en)]) {
      expect(v.trim().length).toBeGreaterThan(0);
      expect(/\p{Extended_Pictographic}/u.test(v)).toBe(false);
    }
  });

  it('fills placeholders', () => {
    expect(makeT('ar')('punch_error_locked', { minutes: 4 })).toContain('4');
    expect(makeT('en')('home_hello', { name: 'Ali' })).toBe('Hello, Ali');
  });
});

describe('biometric', () => {
  it('maps the supported types, preferring face', () => {
    expect(biometricTypeOf([1, 2])).toBe('face');
    expect(biometricTypeOf([1])).toBe('fingerprint');
    expect(biometricTypeOf([3])).toBe('iris');
    expect(biometricTypeOf([])).toBeNull();
  });

  it('picks a clear text for each failure', () => {
    expect(biometricErrorKey('user_cancel')).toBe('biometric_cancelled');
    expect(biometricErrorKey('system_cancel')).toBe('biometric_cancelled');
    expect(biometricErrorKey('not_enrolled')).toBe('biometric_not_enrolled');
    expect(biometricErrorKey('lockout')).toBe('punch_biometric_lockout');
    expect(biometricErrorKey('authentication_failed')).toBe('punch_reason_biometric_failed');
    expect(biometricErrorKey(undefined)).toBe('punch_reason_biometric_failed');
    for (const k of ['biometric_cancelled', 'biometric_not_enrolled', 'punch_biometric_lockout', 'punch_reason_biometric_failed', 'punch_reason_timeout']) expect(hasKey(k)).toBe(true);
  });
});

describe('checks', () => {
  it('lists report problems in the server order', () => {
    expect(reportProblems({ vpn: true, mockLocation: true, rooted: true })).toEqual(['vpn', 'mock_location', 'rooted']);
    expect(reportProblems({ vpn: false, mockLocation: false, rooted: false })).toEqual([]);
  });

  it('re-reads the location when the checks are old', () => {
    expect(isStale(null)).toBe(true);
    expect(isStale(1000, 1000 + 60_000)).toBe(false);
    expect(isStale(1000, 1000 + 3 * 60_000)).toBe(true);
  });

  it('marks steps before the current one done', () => {
    expect(stepStates('photo')).toEqual({ checks: 'done', biometric: 'done', photo: 'current', sending: 'pending' });
    expect(stepStates('biometric', true)).toEqual({ checks: 'done', biometric: 'failed', photo: 'pending', sending: 'pending' });
    expect(stepStates('finished')).toEqual({ checks: 'done', biometric: 'done', photo: 'done', sending: 'done' });
  });
});

describe('home', () => {
  const shift = (over: Partial<ShiftLike> = {}): ShiftLike => ({
    start: at('2026-11-16T04:00:00Z'),
    end: at('2026-11-16T12:00:00Z'),
    checkinOpens: at('2026-11-16T03:00:00Z'),
    arrival: 'pending',
    departure: 'pending',
    lateMinutes: 0,
    ...over,
  });

  it('guesses the next punch from the shift', () => {
    expect(nextPunchKind(null)).toBe('check_in');
    expect(nextPunchKind(shift())).toBe('check_in');
    expect(nextPunchKind(shift({ arrival: 'late' }))).toBe('check_out');
    expect(nextPunchKind(shift({ arrival: 'on_time', departure: 'missing' }))).toBe('check_out');
    expect(nextPunchKind(shift({ arrival: 'on_time', departure: 'done' }))).toBeNull();
  });

  it('says when punching opens before the window', () => {
    const c = shiftCard(shift(), [], at('2026-11-16T02:00:00Z'));
    expect(c.status).toEqual({ key: 'shift_opens', time: at('2026-11-16T03:00:00Z') });
    expect(c.next).toBe('check_in');
  });

  it('says not checked in yet inside the window', () => {
    expect(shiftCard(shift(), [], at('2026-11-16T03:30:00Z')).status.key).toBe('shift_status_pending');
  });

  it('shows the check-in time from the first accepted check-in', () => {
    const punches = [
      { type: 'check_in' as const, at: at('2026-11-16T04:20:00Z'), accepted: true },
      { type: 'check_in' as const, at: at('2026-11-16T04:10:00Z'), accepted: false },
      { type: 'check_in' as const, at: at('2026-11-16T04:12:00Z'), accepted: true },
    ];
    const c = shiftCard(shift({ arrival: 'late', lateMinutes: 12 }), punches, at('2026-11-16T05:00:00Z'));
    expect(c.status).toEqual({ key: 'home_in_at_late', time: at('2026-11-16T04:12:00Z'), minutes: 12 });
    expect(c.tone).toBe('warn');
    expect(c.next).toBe('check_out');
  });

  it('falls back to the arrival status when punches failed to load', () => {
    expect(shiftCard(shift({ arrival: 'on_time' }), null).status).toEqual({ key: 'shift_status_on_time' });
  });

  it('says done for today after check-out', () => {
    const c = shiftCard(shift({ arrival: 'on_time', departure: 'done' }), []);
    expect(c.status.key).toBe('shift_status_out');
    expect(c.next).toBeNull();
  });

  it('flags a shift on a later day as upcoming (no shift today)', () => {
    const local = (d: number, h: number) => new Date(2026, 10, d, h, 0);
    const tomorrow = shift({ start: local(17, 7), end: local(17, 15), checkinOpens: local(17, 6) });
    expect(shiftCard(tomorrow, [], local(16, 12)).upcoming).toBe(true);
    const today = shift({ start: local(16, 7), end: local(16, 15), checkinOpens: local(16, 6) });
    expect(shiftCard(today, [], local(16, 5)).upcoming).toBe(false);
  });

  it('counts notices from the last 3 days', () => {
    const now = at('2026-11-16T12:00:00Z');
    expect(recentCount([{ at: at('2026-11-16T10:00:00Z') }, { at: at('2026-11-14T00:00:00Z') }, { at: at('2026-11-10T00:00:00Z') }], now)).toBe(2);
  });

  it('takes the first name in the chosen language', () => {
    const p = { nameAr: 'محمد أحمد العلي', nameEn: 'Mohammed Ahmad Al-Ali' };
    expect(firstName(p, 'ar')).toBe('محمد');
    expect(firstName(p, 'en')).toBe('Mohammed');
    expect(firstName({ nameAr: 'سارة', nameEn: '' }, 'en')).toBe('سارة');
    expect(firstName(null, 'ar')).toBe('');
  });

  it('labels the bonus by result and source', () => {
    expect(bonusLabels({ eligible: true, source: 'locked' }, true)).toEqual({ badge: 'dash_eligible', tone: 'ok', source: 'dash_locked' });
    expect(bonusLabels({ eligible: false, source: 'draft' }, true)).toEqual({ badge: 'dash_not_eligible', tone: 'danger', source: 'dash_draft' });
    expect(bonusLabels({ eligible: null, source: 'estimate' }, false)).toEqual({ badge: 'dash_pending', tone: 'warn', source: 'dash_estimate_today' });
    expect(bonusLabels({ eligible: true, source: 'estimate' }, true).source).toBe('dash_estimate');
  });
});
