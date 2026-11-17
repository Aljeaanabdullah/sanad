import { FUNCTION_TIMEOUT_MS, REQUEST_TIMEOUT_MS, TimeoutError, fetchWithTimeout, withTimeout } from '../net';
import { errorKey } from '../requestsView';

/** A fetch whose answer never comes, unless the request is aborted. */
const hanging = jest.fn((_url: unknown, init?: RequestInit) =>
  new Promise<Response>((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
  }),
);

beforeEach(() => {
  jest.useFakeTimers();
  hanging.mockClear();
});
afterEach(() => jest.useRealTimers());

test('a table read whose answer is lost fails after the time limit instead of waiting forever', async () => {
  const f = fetchWithTimeout(hanging as unknown as typeof fetch);
  const p = f('https://x.supabase.co/rest/v1/requests?select=id');
  const caught = p.catch((e) => e);
  jest.advanceTimersByTime(REQUEST_TIMEOUT_MS - 1);
  await Promise.resolve();
  expect(hanging).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(1);
  const e = await caught;
  expect(e).toBeInstanceOf(TimeoutError);
  expect(e.code).toBe('timeout');
});

test('the auth token refresh gets the same limit', async () => {
  const f = fetchWithTimeout(hanging as unknown as typeof fetch);
  const caught = f('https://x.supabase.co/auth/v1/token?grant_type=refresh_token', { method: 'POST' }).catch((e) => e);
  jest.advanceTimersByTime(REQUEST_TIMEOUT_MS);
  expect(await caught).toBeInstanceOf(TimeoutError);
});

test('edge functions get the longer limit', async () => {
  const f = fetchWithTimeout(hanging as unknown as typeof fetch);
  let settled = false;
  const caught = f('https://x.supabase.co/functions/v1/punch', { method: 'POST' })
    .catch((e) => e)
    .finally(() => (settled = true));
  jest.advanceTimersByTime(REQUEST_TIMEOUT_MS + 1);
  await Promise.resolve();
  expect(settled).toBe(false);
  jest.advanceTimersByTime(FUNCTION_TIMEOUT_MS);
  expect(await caught).toBeInstanceOf(TimeoutError);
});

test('a normal answer passes through untouched and clears the timer', async () => {
  const res = { ok: true, status: 200 } as Response;
  const base = jest.fn(async () => res);
  const f = fetchWithTimeout(base as unknown as typeof fetch);
  await expect(f('https://x.supabase.co/rest/v1/sites')).resolves.toBe(res);
  expect(jest.getTimerCount()).toBe(0);
});

test("the caller's own abort still cancels the request (and is not reported as a timeout)", async () => {
  const f = fetchWithTimeout(hanging as unknown as typeof fetch);
  const outer = new AbortController();
  const caught = f('https://x.supabase.co/functions/v1/punch', { signal: outer.signal }).catch((e) => e);
  outer.abort();
  const e = await caught;
  expect(e).not.toBeInstanceOf(TimeoutError);
  expect(e.message).toBe('Aborted');
});

test('withTimeout: a screen load that never settles becomes the timeout error text', async () => {
  const caught = withTimeout(new Promise(() => {}), 25_000).catch((e) => e);
  jest.advanceTimersByTime(25_000);
  const e = await caught;
  expect(e).toBeInstanceOf(TimeoutError);
  expect(errorKey(e)).toBe('req_error_timeout');
});

test('withTimeout: a value in time is returned', async () => {
  await expect(withTimeout(Promise.resolve(7), 1000)).resolves.toBe(7);
  expect(jest.getTimerCount()).toBe(0);
});
