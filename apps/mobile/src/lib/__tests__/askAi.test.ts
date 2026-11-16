/// <reference types="jest" />
jest.mock('../supabase', () => ({ supabase: { auth: { getSession: jest.fn(async () => ({ data: { session: { access_token: 'tok-1' } } })) } } }));
import { ASK_MAX_CHARS, askErrorKey, askSanadAI, parseAskReply } from '../askAi';
import { ASK_URL } from '../config';
import { allKeys } from '../i18n';

const okFetch = (status: number, body: unknown) =>
  jest.fn(async () => ({ status, json: async () => body }) as unknown as Response);

describe('parseAskReply', () => {
  it('reads an answer and the questions left today', () => {
    expect(parseAskReply(200, { answer: '  جواب  ', remaining_today: 7, note: 'x' })).toEqual({ kind: 'answer', answer: 'جواب', remaining: 7 });
  });
  it('tolerates a missing / bad remaining count', () => {
    expect(parseAskReply(200, { answer: 'a' })).toEqual({ kind: 'answer', answer: 'a', remaining: null });
    expect(parseAskReply(200, { answer: 'a', remaining_today: -3 })).toEqual({ kind: 'answer', answer: 'a', remaining: 0 });
  });
  it('maps every relay error key and keeps its message', () => {
    for (const key of ['bad', 'auth', 'notemp', 'limit', 'nodata', 'busy']) {
      expect(parseAskReply(400, { error: key, message: 'نص' })).toEqual({ kind: 'error', key, message: 'نص' });
    }
  });
  it('falls back on the status when the body is not the relay shape', () => {
    expect(parseAskReply(401, null)).toMatchObject({ key: 'auth' });
    expect(parseAskReply(429, 'x')).toMatchObject({ key: 'limit' });
    expect(parseAskReply(503, {})).toMatchObject({ key: 'busy' });
    expect(parseAskReply(500, { error: 'something_new' })).toMatchObject({ key: 'generic' });
    expect(parseAskReply(200, { answer: '   ' })).toMatchObject({ kind: 'error', key: 'generic' });
  });
});

describe('askSanadAI', () => {
  it('posts only the question with the employee session token to the relay', async () => {
    const f = okFetch(200, { answer: 'تمام', remaining_today: 19 });
    const r = await askSanadAI('  سؤال؟ ', { fetchImpl: f });
    expect(r).toEqual({ kind: 'answer', answer: 'تمام', remaining: 19 });
    const [url, init] = (f.mock.calls[0] as unknown as [string, RequestInit]);
    expect(url).toBe(ASK_URL);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-1');
    expect(JSON.parse(init.body as string)).toEqual({ question: 'سؤال؟' });
  });
  it('refuses empty or too long questions without calling the relay', async () => {
    const f = okFetch(200, {});
    expect(await askSanadAI('   ', { fetchImpl: f })).toMatchObject({ key: 'bad' });
    expect(await askSanadAI('x'.repeat(ASK_MAX_CHARS + 1), { fetchImpl: f })).toMatchObject({ key: 'bad' });
    expect(f).not.toHaveBeenCalled();
  });
  it('needs a session', async () => {
    const f = okFetch(200, {});
    expect(await askSanadAI('q', { token: null, fetchImpl: f })).toMatchObject({ key: 'auth' });
    expect(f).not.toHaveBeenCalled();
  });
  it('reports a network failure', async () => {
    const f = jest.fn(async () => { throw new TypeError('Network request failed'); });
    expect(await askSanadAI('q', { token: 't', fetchImpl: f as unknown as typeof fetch })).toMatchObject({ key: 'network' });
  });
  it('gives up after the timeout instead of hanging', async () => {
    const f = jest.fn((_u: string, init: RequestInit) => new Promise((_, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    expect(await askSanadAI('q', { token: 't', fetchImpl: f as unknown as typeof fetch, timeoutMs: 20 })).toMatchObject({ key: 'timeout' });
  });
  it('reads a non-JSON error page', async () => {
    const f = jest.fn(async () => ({ status: 502, json: async () => { throw new Error('html'); } }) as unknown as Response);
    expect(await askSanadAI('q', { token: 't', fetchImpl: f })).toMatchObject({ kind: 'error', key: 'generic' });
  });
});

it('every error key and note has a text in both languages', () => {
  const { ar, en } = allKeys();
  for (const k of ['bad', 'auth', 'notemp', 'limit', 'nodata', 'busy', 'network', 'timeout', 'generic'] as const) {
    expect(ar).toContain(askErrorKey(k));
    expect(en).toContain(askErrorKey(k));
  }
  for (const k of ['asst_ai_note', 'asst_ai_remaining', 'asst_typing', 'asst_old_period']) {
    expect(ar).toContain(k);
    expect(en).toContain(k);
  }
});
