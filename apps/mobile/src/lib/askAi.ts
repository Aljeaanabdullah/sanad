// «اسأل سند» — questions with no ready answer go to the «مساعد سند» agent through the relay
// (PRD 18.1, version 1.12). The app sends only the question and the employee's own session token;
// the relay reads the employee's own dashboard and applies the daily limits.
import { ASK_URL } from './config';
import { supabase } from './supabase';

export const ASK_MAX_CHARS = 500;
/** The agent takes about 3–20 s; give it room but never hang. */
export const ASK_TIMEOUT_MS = 60_000;

/** Relay error keys (its `error` field) plus the app's own network / timeout cases. */
export type AskErrorKey = 'bad' | 'auth' | 'notemp' | 'limit' | 'nodata' | 'busy' | 'network' | 'timeout' | 'generic';

export type AskResult =
  | { kind: 'answer'; answer: string; remaining: number | null }
  | { kind: 'error'; key: AskErrorKey; message: string | null };

const RELAY_KEYS: AskErrorKey[] = ['bad', 'auth', 'notemp', 'limit', 'nodata', 'busy'];

/** Reads the relay's reply (any status). Pure, for tests. */
export function parseAskReply(status: number, body: unknown): AskResult {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (status === 200 && typeof b.answer === 'string' && b.answer.trim()) {
    const n = typeof b.remaining_today === 'number' && Number.isFinite(b.remaining_today) ? Math.max(0, Math.floor(b.remaining_today)) : null;
    return { kind: 'answer', answer: b.answer.trim(), remaining: n };
  }
  const key = typeof b.error === 'string' && (RELAY_KEYS as string[]).includes(b.error) ? (b.error as AskErrorKey) : null;
  const message = typeof b.message === 'string' && b.message.trim() ? b.message.trim() : null;
  if (key) return { kind: 'error', key, message };
  if (status === 401) return { kind: 'error', key: 'auth', message };
  if (status === 429) return { kind: 'error', key: 'limit', message };
  if (status === 503) return { kind: 'error', key: 'busy', message };
  return { kind: 'error', key: 'generic', message };
}

/** Text key in strings for an error (the relay's Arabic `message` is shown as is in Arabic). */
export const askErrorKey = (key: AskErrorKey) => `ask_error_${key}`;

/** Sends one question. Never throws. `fetchImpl` / `token` are for tests. */
export async function askSanadAI(
  question: string,
  opts: { token?: string | null; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<AskResult> {
  const q = question.trim();
  if (!q || q.length > ASK_MAX_CHARS) return { kind: 'error', key: 'bad', message: null };
  let token = opts.token;
  if (token === undefined) {
    const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
    token = data.session?.access_token ?? null;
  }
  if (!token) return { kind: 'error', key: 'auth', message: null };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? ASK_TIMEOUT_MS);
  try {
    const res = await (opts.fetchImpl ?? fetch)(ASK_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q }),
      signal: controller.signal,
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return parseAskReply(res.status, body);
  } catch (e) {
    return { kind: 'error', key: controller.signal.aborted ? 'timeout' : 'network', message: null };
  } finally {
    clearTimeout(timer);
  }
}
