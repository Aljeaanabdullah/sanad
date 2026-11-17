// Punch flow logic (PRD 4.6: device Face ID / fingerprint + a review photo; PRD 4.7: the punch is signed by
// the phone's key, which Face ID / fingerprint unlocks). Pure functions only:
// no native modules, no network, so they are unit-tested. Native calls live in punchDevice.ts.
// The server (supabase/functions/punch) has the last word on every punch; this file only builds the
// request, reads the answer, and picks the texts to show.

export type PunchKind = 'check_in' | 'check_out';
export type BiometricType = 'face' | 'fingerprint' | 'iris';
export type GeoPoint = { lat: number; lng: number; accuracy: number };
/** What the phone found about itself; sent as-is, the server decides (and records the refusal). */
export type PhoneReport = { vpn: boolean; mockLocation: boolean; rooted: boolean };

/** Server limit for the decoded JPEG (punch function: MAX_PHOTO_BYTES). */
export const SERVER_PHOTO_MAX_BYTES = 600 * 1024;
/** We stay well under the server limit. */
export const PHOTO_MAX_BYTES = 450 * 1024;
/** Review photo width after resizing. */
export const PHOTO_WIDTH = 480;
export const PHOTO_COMPRESS = 0.6;
/** The location read in the checks step is re-read when older than this (e.g. after a long retry). */
export const CHECKS_MAX_AGE_MS = 2 * 60 * 1000;
/** GPS accuracy sent when the phone gives none: the server then refuses it as weak_gps. */
export const UNKNOWN_ACCURACY_M = 9999;

// ------------------------------------------------------------------ request

export type PunchBody = {
  verification: 'device_biometric';
  device_identifier: string;
  location: GeoPoint;
  report: {
    vpn: boolean;
    mock_location: boolean;
    rooted: boolean;
    biometric: { passed: true; type: BiometricType };
    /**
     * Pilot metric (phase 13): milliseconds from the employee's press of the punch button (or "try again")
     * until just before this request is sent. Phone clock, not signed, a measure only: the server stores
     * it in client_report and decides nothing with it.
     */
    attempt_ms?: number;
  };
  photo: string;
  /** PRD 4.7: the nonce from the server and the phone key's signature (base64 DER) over signingPayload(). */
  signature?: { nonce: string; value: string };
};

export function buildPunchBody(p: { deviceId: string; location: GeoPoint; report: PhoneReport; biometric: BiometricType; photo: string }): PunchBody {
  return {
    verification: 'device_biometric',
    device_identifier: p.deviceId,
    location: {
      lat: p.location.lat,
      lng: p.location.lng,
      accuracy: Number.isFinite(p.location.accuracy) ? p.location.accuracy : UNKNOWN_ACCURACY_M,
    },
    report: {
      vpn: p.report.vpn === true,
      mock_location: p.report.mockLocation === true,
      rooted: p.report.rooted === true,
      biometric: { passed: true, type: p.biometric },
    },
    photo: stripDataUrl(p.photo),
  };
}

/**
 * The exact text the phone key signs for a punch. Must match the server
 * (supabase/functions/_shared/device-key.ts punchSigningPayload); both have a test on the same sample.
 * [photoSha256] is the SHA-256 (base64) of the photo's base64 text as sent.
 */
export function signingPayload(body: PunchBody, nonce: string, photoSha256: string): string {
  return [
    'sanad-punch-v1',
    nonce,
    String(body.location.lat),
    String(body.location.lng),
    String(body.location.accuracy),
    photoSha256,
    body.report.vpn ? '1' : '0',
    body.report.mock_location ? '1' : '0',
    body.report.rooted ? '1' : '0',
  ].join('\n');
}

/** Longest attempt_ms we send (10 minutes); a longer try is sent as this value. */
export const ATTEMPT_MS_MAX = 10 * 60 * 1000;
/** A press time passed from Home is trusted only when it is this recent at screen open. */
export const PRESS_MAX_AGE_MS = 60 * 1000;

/**
 * Whole milliseconds from [startedAt] to [now], at most ATTEMPT_MS_MAX. Null when there is no start or the
 * phone clock went backwards (nothing is sent then).
 */
export function attemptMs(startedAt: number | null | undefined, now: number): number | null {
  if (typeof startedAt !== 'number' || !Number.isFinite(startedAt) || !Number.isFinite(now)) return null;
  const ms = Math.round(now - startedAt);
  if (ms < 0) return null;
  return Math.min(ms, ATTEMPT_MS_MAX);
}

/**
 * The press time Home passed in the route (`at`, epoch ms). Used only when it is a recent past time;
 * otherwise (missing, old, in the future, a restored screen) the screen open time [now] is used.
 */
export function pressedAt(param: string | string[] | undefined, now: number): number {
  const raw = Array.isArray(param) ? param[0] : param;
  const at = raw ? Number(raw) : NaN;
  return Number.isFinite(at) && at <= now && now - at <= PRESS_MAX_AGE_MS ? at : now;
}

/** The body with report.attempt_ms set (or left out when [ms] is null). Not part of the signed text. */
export function withAttemptMs(body: PunchBody, ms: number | null): PunchBody {
  const report = { ...body.report };
  if (ms === null) delete report.attempt_ms;
  else report.attempt_ms = ms;
  return { ...body, report };
}

/** The server wants bare base64, not a data: URL. */
export function stripDataUrl(b64: string): string {
  const i = b64.indexOf('base64,');
  return i >= 0 ? b64.slice(i + 7) : b64;
}

/** Decoded size in bytes of a base64 string. */
export function base64Bytes(b64: string): number {
  const s = stripDataUrl(b64).replace(/\s/g, '');
  if (!s) return 0;
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  return Math.floor((s.length * 3) / 4) - pad;
}

export function photoTooBig(b64: string, limit = PHOTO_MAX_BYTES): boolean {
  return base64Bytes(b64) > limit;
}

/** A JPEG starts with FF D8 ("/9j/" in base64). The server refuses anything else as invalid_photo. */
export function looksLikeJpeg(b64: string): boolean {
  return stripDataUrl(b64).startsWith('/9j/');
}

// ------------------------------------------------------------------ response

export type PunchDay = {
  arrival: string | null;
  departure: string | null;
  lateMinutes: number;
  earlyLeaveMinutes: number;
};

export type PunchOutcome =
  | {
      kind: 'accepted' | 'rejected';
      /** Refusal code (punch_reason_<code>), null when accepted. */
      reason: string | null;
      punchType: PunchKind;
      punchedAt: Date;
      site: { ar: string; en: string } | null;
      distanceM: number | null;
      day: PunchDay | null;
    }
  | {
      /** Nothing was recorded: the request itself failed (HTTP error or no network). */
      kind: 'error';
      code: string;
      unlockAt: Date | null;
    };

const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const date = (v: unknown): Date | null => {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Reads the 200 answer of the punch function. Anything unexpected becomes an error outcome. */
export function parsePunchResult(data: unknown, now = new Date()): PunchOutcome {
  let body = data;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = null;
    }
  }
  const b = rec(body);
  if (!b || (b.result !== 'accepted' && b.result !== 'rejected')) {
    const code = str(b?.error);
    return { kind: 'error', code: code ?? 'generic', unlockAt: date(b?.unlock_at) };
  }
  const site = rec(b.site);
  const day = rec(b.day);
  const accepted = b.result === 'accepted';
  return {
    kind: accepted ? 'accepted' : 'rejected',
    reason: accepted ? null : (str(b.reason) ?? 'generic'),
    punchType: b.punch_type === 'check_out' ? 'check_out' : 'check_in',
    punchedAt: date(b.punched_at) ?? now,
    site: site ? { ar: str(site.name_ar) ?? '', en: str(site.name_en) ?? str(site.name_ar) ?? '' } : null,
    distanceM: n(b.distance_m),
    day: day
      ? {
          arrival: str(day.arrival),
          departure: str(day.departure),
          lateMinutes: n(day.late_minutes) ?? 0,
          earlyLeaveMinutes: n(day.early_leave_minutes) ?? 0,
        }
      : null,
  };
}

/** Reads the JSON body of a non-200 answer ({ error, unlock_at }). */
export function parsePunchError(body: unknown): PunchOutcome {
  const b = rec(body);
  return { kind: 'error', code: str(b?.error) ?? 'generic', unlockAt: date(b?.unlock_at) };
}

// ------------------------------------------------------------------ texts

/** Server error codes (HTTP errors) we have a text for: punch_error_<code>. */
export const ERROR_CODES = ['locked', 'invalid_body', 'invalid_photo', 'not_signed_in', 'account_disabled', 'rules_failed', 'save_failed', 'no_internet', 'photo_too_big'] as const;

/** Text key of a refusal reason, falling back to a generic refusal text when we have none. */
export function reasonKey(reason: string | null | undefined, has: (key: string) => boolean): string {
  const key = `punch_reason_${reason ?? ''}`;
  return reason && has(key) ? key : 'punch_reason_generic';
}

/** Text key of a request error (nothing recorded). */
export function errorKey(code: string, has: (key: string) => boolean): string {
  const key = `punch_error_${code}`;
  return has(key) ? key : 'error_generic';
}

/** Minutes until the punch lock ends (at least 1 while locked, 0 when over). */
export function minutesUntil(at: Date | null, now = new Date()): number {
  if (!at) return 0;
  const ms = at.getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.max(1, Math.ceil(ms / 60000));
}

/** "Try again" makes sense for everything except a lock that is still running and a disabled account. */
export function canRetry(o: PunchOutcome, now = new Date()): boolean {
  if (o.kind !== 'error') return o.kind === 'rejected' && o.reason !== 'locked';
  if (o.code === 'account_disabled') return false;
  if (o.code === 'locked') return minutesUntil(o.unlockAt, now) === 0;
  return true;
}

/** Late / early-leave minutes worth telling the employee after an accepted punch. */
export function resultMinutes(o: PunchOutcome): { key: 'late_by' | 'early_by'; minutes: number } | null {
  if (o.kind !== 'accepted' || !o.day) return null;
  if (o.punchType === 'check_in' && o.day.lateMinutes > 0) return { key: 'late_by', minutes: o.day.lateMinutes };
  if (o.punchType === 'check_out' && o.day.earlyLeaveMinutes > 0) return { key: 'early_by', minutes: o.day.earlyLeaveMinutes };
  return null;
}

// ------------------------------------------------------------------ biometric

/** expo-local-authentication AuthenticationType values: FINGERPRINT = 1, FACIAL_RECOGNITION = 2, IRIS = 3. */
export function biometricTypeOf(types: number[]): BiometricType | null {
  if (types.includes(2)) return 'face';
  if (types.includes(1)) return 'fingerprint';
  if (types.includes(3)) return 'iris';
  return null;
}

/** Text key for a failed authenticateAsync result. */
export function biometricErrorKey(error: string | undefined): string {
  switch (error) {
    case 'user_cancel':
    case 'system_cancel':
    case 'app_cancel':
      return 'biometric_cancelled';
    case 'not_enrolled':
    case 'passcode_not_set':
    case 'not_available':
      return 'biometric_not_enrolled';
    case 'lockout':
      return 'punch_biometric_lockout';
    case 'timeout':
      return 'punch_reason_timeout';
    case 'key_invalidated':
      return 'punch_key_invalidated';
    default:
      return 'punch_reason_biometric_failed';
  }
}

/**
 * Phone report problems found in the checks step that the server refuses, in its order (first one is the
 * likely reason). VPN is not one of them any more: it is only recorded (PRD 5.4, version 1.11).
 */
export function reportProblems(r: PhoneReport): ('mock_location' | 'rooted')[] {
  const out: ('mock_location' | 'rooted')[] = [];
  if (r.mockLocation) out.push('mock_location');
  if (r.rooted) out.push('rooted');
  return out;
}

export function isStale(at: number | null, now = Date.now(), maxAge = CHECKS_MAX_AGE_MS): boolean {
  return at === null || now - at > maxAge;
}

// ------------------------------------------------------------------ steps

// The photo comes before Face ID / fingerprint: the signature covers the photo (PRD 4.7).
export type StepId = 'checks' | 'photo' | 'biometric' | 'sending';
export const STEPS: StepId[] = ['checks', 'photo', 'biometric', 'sending'];
export type StepState = 'pending' | 'current' | 'done' | 'failed';

/** State of every step when [current] is running (or has [failed]). */
export function stepStates(current: StepId | 'finished', failed = false): Record<StepId, StepState> {
  const at = current === 'finished' ? STEPS.length : STEPS.indexOf(current);
  const out = {} as Record<StepId, StepState>;
  STEPS.forEach((s, i) => {
    out[s] = i < at ? 'done' : i === at ? (failed ? 'failed' : 'current') : 'pending';
  });
  return out;
}

// ------------------------------------------------------------------ home

/** The parts of api.ts ShiftInfo used here (kept structural so tests don't load supabase). */
export type ShiftLike = {
  start: Date;
  end: Date;
  checkinOpens: Date;
  arrival: 'pending' | 'on_time' | 'late' | 'absent';
  departure: 'pending' | 'done' | 'missing' | 'not_applicable';
  lateMinutes: number;
};
type PunchLike = { type: 'check_in' | 'check_out'; at: Date; accepted: boolean };

/** Best guess of the next punch; the server decides in the end. Null = nothing left for this shift. */
export function nextPunchKind(shift: ShiftLike | null): PunchKind | null {
  if (!shift) return 'check_in';
  const inDone = shift.arrival === 'on_time' || shift.arrival === 'late';
  if (inDone && shift.departure === 'done') return null;
  return inDone ? 'check_out' : 'check_in';
}

export type ShiftCard = {
  /** strings key + vars; `time` vars are Dates to be formatted by the screen. */
  status: { key: string; minutes?: number; time?: Date };
  tone: 'ok' | 'danger' | 'warn' | 'info' | 'neutral';
  next: PunchKind | null;
  /** The shift starts on a later calendar day than today (no shift today). */
  upcoming: boolean;
};

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** What the home punch card says about the current shift. */
export function shiftCard(shift: ShiftLike, punches: PunchLike[] | null, now = new Date()): ShiftCard {
  const next = nextPunchKind(shift);
  const firstIn = (punches ?? [])
    .filter((p) => p.accepted && p.type === 'check_in' && p.at.getTime() >= shift.checkinOpens.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime())[0];
  const upcoming = shift.arrival === 'pending' && now < shift.checkinOpens && !sameDay(shift.start, now) && shift.start > now;
  if (shift.departure === 'done') return { status: { key: 'shift_status_out' }, tone: 'ok', next, upcoming: false };
  if (shift.arrival === 'late' || shift.arrival === 'on_time') {
    const late = shift.arrival === 'late';
    if (firstIn) return { status: { key: late ? 'home_in_at_late' : 'home_in_at', time: firstIn.at, minutes: shift.lateMinutes }, tone: late ? 'warn' : 'ok', next, upcoming: false };
    return { status: late ? { key: 'shift_status_late', minutes: shift.lateMinutes } : { key: 'shift_status_on_time' }, tone: late ? 'warn' : 'ok', next, upcoming: false };
  }
  if (shift.arrival === 'absent') return { status: { key: 'arrival_absent' }, tone: 'danger', next, upcoming: false };
  if (now < shift.checkinOpens) return { status: { key: 'shift_opens', time: shift.checkinOpens }, tone: 'neutral', next, upcoming };
  return { status: { key: 'shift_status_pending' }, tone: 'info', next, upcoming: false };
}

/** Notices from the last [days] days (the bell badge). */
export function recentCount(items: { at: Date }[], now = new Date(), days = 3): number {
  const since = now.getTime() - days * 24 * 3600 * 1000;
  return items.filter((x) => x.at.getTime() >= since).length;
}

/** First name in the chosen language, falling back to the other one. */
export function firstName(p: { nameAr: string; nameEn: string } | null | undefined, lang: 'ar' | 'en'): string {
  if (!p) return '';
  const full = (lang === 'ar' ? p.nameAr : p.nameEn) || p.nameAr || p.nameEn || '';
  return full.trim().split(/\s+/)[0] ?? '';
}

/** Badge + label keys of the bonus summary (dashboard bonusOf → texts). */
export function bonusLabels(b: { eligible: boolean | null; source: 'locked' | 'draft' | 'estimate' }, periodComplete: boolean) {
  return {
    badge: b.eligible === true ? 'dash_eligible' : b.eligible === false ? 'dash_not_eligible' : 'dash_pending',
    tone: (b.eligible === true ? 'ok' : b.eligible === false ? 'danger' : 'warn') as 'ok' | 'danger' | 'warn',
    source: b.source === 'locked' ? 'dash_locked' : b.source === 'draft' ? 'dash_draft' : periodComplete ? 'dash_estimate' : 'dash_estimate_today',
  };
}
