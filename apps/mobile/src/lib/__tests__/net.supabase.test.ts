// Regression for the endless skeletons on Requests / Attendance (APK, 2026-11-17): a token refresh
// whose answer is lost used to block every later Supabase call forever.
import { createClient } from '@supabase/supabase-js';
import { fetchWithTimeout } from '../net';

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
function expiredSessionStorage() {
  const exp = Math.floor(Date.now() / 1000) - 60;
  const s = {
    access_token: `${b64({ alg: 'HS256' })}.${b64({ sub: 'u1', exp, role: 'authenticated' })}.sig`,
    refresh_token: 'r',
    expires_at: exp,
    expires_in: -60,
    token_type: 'bearer',
    user: { id: 'u1', aud: 'authenticated' },
  };
  const m: Record<string, string> = { 'sb-x-auth-token': JSON.stringify(s) };
  return { getItem: (k: string) => m[k] ?? null, setItem: (k: string, v: string) => void (m[k] = v), removeItem: (k: string) => void delete m[k] };
}

/** The refresh never answers (unless aborted); everything else answers at once. */
const lostRefresh = ((url: string, init?: RequestInit) =>
  String(url).includes('/token')
    ? new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('Aborted'))))
    : Promise.resolve(new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }))) as unknown as typeof fetch;

function client(f: typeof fetch) {
  return createClient('https://x.supabase.co', 'sb_publishable_test', {
    global: { fetch: f },
    auth: { storage: expiredSessionStorage(), autoRefreshToken: false, persistSession: true, detectSessionInUrl: false },
  });
}

async function settlesWithin(p: Promise<unknown>, ms: number) {
  let done = false;
  p.then(() => (done = true), () => (done = true));
  await jest.advanceTimersByTimeAsync(ms);
  return done;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(console, 'warn').mockImplementation(() => {}); // auth-js logs the timed-out refresh
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('without a time limit, a lost refresh freezes table reads (the bug)', async () => {
  const sb = client(lostRefresh);
  expect(await settlesWithin(Promise.resolve(sb.from('requests').select('id')), 180_000)).toBe(false);
});

test('with the time limit, getUser and table reads settle (error or data), so screens can show a retry', async () => {
  const sb = client(fetchWithTimeout(lostRefresh));
  expect(await settlesWithin(sb.auth.getUser(), 180_000)).toBe(true);
  expect(await settlesWithin(Promise.resolve(sb.from('requests').select('id')), 180_000)).toBe(true);
});
