// Time limits for network calls. On Android, React Native's HTTP client has no timeouts at all, so a
// request whose answer is lost (network drop, dead keep-alive socket) waits forever. Inside supabase-js
// that is worse: a stuck token refresh holds the auth queue, and every later call (getUser, every table
// read, every RPC) waits behind it, so screens stay on their loading skeletons for good.

/** Table reads, RPCs and auth (token refresh, getUser). */
export const REQUEST_TIMEOUT_MS = 20_000;
/** Edge functions (punch with its photo sets its own, shorter, limit). */
export const FUNCTION_TIMEOUT_MS = 45_000;

export class TimeoutError extends Error {
  code = 'timeout';
  constructor(what = 'request') {
    super(`${what} timed out`);
    this.name = 'TimeoutError';
  }
}

type Fetch = typeof fetch;

const urlOf = (input: unknown): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : String((input as { url?: string })?.url ?? '');

/** A fetch that gives up after a time limit (the caller's own abort signal still works). */
export function fetchWithTimeout(base: Fetch, limits = { request: REQUEST_TIMEOUT_MS, fn: FUNCTION_TIMEOUT_MS }): Fetch {
  return (input, init = {}) => {
    const ms = urlOf(input).includes('/functions/v1/') ? limits.fn : limits.request;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, ms);
    const outer = init.signal;
    const onOuterAbort = () => controller.abort();
    if (outer) {
      if (outer.aborted) controller.abort();
      else outer.addEventListener('abort', onOuterAbort);
    }
    return base(input, { ...init, signal: controller.signal })
      .catch((e: unknown) => {
        throw timedOut ? new TimeoutError() : e;
      })
      .finally(() => {
        clearTimeout(timer);
        outer?.removeEventListener('abort', onOuterAbort);
      });
  };
}

/** Rejects with TimeoutError if the promise has not settled in time (a screen never waits forever). */
export function withTimeout<T>(p: Promise<T>, ms: number, what?: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(what)), ms);
  });
  return Promise.race([p, limit]).finally(() => clearTimeout(timer));
}

/** How long a screen waits for its data before it shows an error with "Try again". */
export const SCREEN_LOAD_TIMEOUT_MS = 25_000;
