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

// ------------------------------------------------------------------ diagnostics (More > Connection check)
// The last calls to Supabase (method, path without the query, time, result) and the screens' load steps,
// kept in memory only, so a screenshot shows where a load stops. No tokens, no bodies, no query values.
export type TraceEntry = { id: number; at: number; label: string; ms: number | null; result: string | null };
const TRACE_MAX = 60;
const trace: TraceEntry[] = [];
let traceId = 0;
const traceListeners = new Set<() => void>();
const changed = () => traceListeners.forEach((l) => l());

function traceStart(label: string): TraceEntry {
  const e: TraceEntry = { id: ++traceId, at: Date.now(), label, ms: null, result: null };
  trace.push(e);
  if (trace.length > TRACE_MAX) trace.shift();
  changed();
  return e;
}
function traceEnd(e: TraceEntry, result: string) {
  e.ms = Date.now() - e.at;
  e.result = result;
  changed();
}
/** A load step on a screen (e.g. "requests: start"). */
export function note(label: string, result = 'ok') {
  traceEnd(traceStart(label), result);
}
/** Newest first. */
export const networkTrace = (): TraceEntry[] => [...trace].reverse();
export function onTraceChange(l: () => void): () => void {
  traceListeners.add(l);
  return () => traceListeners.delete(l);
}
export const appStartedAt = Date.now();

/** "GET /rest/v1/requests", "POST rpc/attendance_history", "POST auth/token": never the query string. */
export function traceLabel(url: string, method = 'GET'): string {
  const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
  const short = path.replace('/rest/v1/rpc/', 'rpc/').replace('/auth/v1/', 'auth/').replace('/functions/v1/', 'fn/');
  return `${method.toUpperCase()} ${short}`;
}

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
    const entry = traceStart(traceLabel(urlOf(input), init.method));
    return base(input, { ...init, signal: controller.signal })
      .then((res) => {
        traceEnd(entry, String(res.status));
        return res;
      })
      .catch((e: unknown) => {
        traceEnd(entry, timedOut ? 'timeout' : `error: ${e instanceof Error ? e.message.slice(0, 60) : 'unknown'}`);
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
