// Run: node --import ./supabase/functions/send-push/test/register.mjs --test 'supabase/functions/send-push/test/*.test.mjs'
// The real send-push function against a fake database and a fake fetch (Google OAuth + FCM HTTP v1).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setup, state } from './fake-supabase.mjs';

let handler;
const env = { SUPABASE_URL: 'http://db', SUPABASE_SERVICE_ROLE_KEY: 'service' };
globalThis.Deno = { serve: (h) => { handler = h; }, env: { get: (k) => env[k] } };
const mod = await import('../index.ts');

// A throwaway RSA key standing in for the Firebase service account.
const keys = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true,
  ['sign', 'verify'],
);
const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', keys.privateKey)).toString('base64');
const pem = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;
const SA = { type: 'service_account', project_id: 'sanad-test', client_email: 'push@sanad-test.iam.gserviceaccount.com', private_key: pem, token_uri: 'https://oauth2.googleapis.com/token' };

let fetches;
let fcmReply;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  fetches.push({ url: u, init });
  if (u === SA.token_uri) return new Response(JSON.stringify({ access_token: 'at-1', expires_in: 3600 }), { status: 200 });
  if (u.startsWith('https://fcm.googleapis.com/')) {
    const msg = JSON.parse(init.body);
    const { status, body } = fcmReply(msg);
    return new Response(JSON.stringify(body), { status });
  }
  throw new Error(`unexpected fetch ${u}`);
};
const fcmCalls = () => fetches.filter((f) => f.url.startsWith('https://fcm.googleapis.com/')).map((f) => ({ url: f.url, auth: f.init.headers.Authorization, msg: JSON.parse(f.init.body) }));
const oauthCalls = () => fetches.filter((f) => f.url === SA.token_uri);

const row = (over = {}) => ({
  id: 'n1', kind: 'request_decided', priority: 'normal',
  title_ar: 'تمت الموافقة على طلبك', title_en: 'Your request was approved',
  body_ar: 'إجازة دورية — يوم 2026-12-01', body_en: 'Annual leave — On 2026-12-01',
  data: { request_id: 'r1', from: '2026-12-01', count: 3, employees: [{ id: 'x' }], note: null },
  tokens: [{ token: 'tok-ar', platform: 'android', lang: 'ar' }],
  ...over,
});
async function call(body = {}, headers = { 'x-push-secret': 's'.repeat(64) }) {
  const res = await handler(new Request('http://x/send-push', { method: 'POST', headers, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  setup({});
  fetches = [];
  fcmReply = () => ({ status: 200, body: { name: 'projects/sanad-test/messages/1' } });
  env.FCM_SERVICE_ACCOUNT = JSON.stringify(SA);
  mod.clearTokenCache();
});

test('no secret or a wrong secret: 401, nothing claimed, nothing sent', async () => {
  let r = await call({}, {});
  assert.equal(r.status, 401);
  state.secretOk = false;
  r = await call();
  assert.equal(r.status, 401);
  assert.ok(!state.calls.some((c) => c.name === 'push_claim'));
  assert.equal(fetches.length, 0);
});

test('no FCM key yet: claimed rows are closed as not_configured and nothing is sent', async () => {
  delete env.FCM_SERVICE_ACCOUNT;
  state.batches = [[row(), row({ id: 'n2' })]];
  const r = await call();
  assert.equal(r.status, 200);
  assert.equal(r.body.not_configured, 2);
  assert.deepEqual(state.reports[0].p_results.map((x) => x.status), ['not_configured', 'not_configured']);
  assert.equal(fetches.length, 0);
});

test('sends with a signed RS256 service-account JWT and the project id from the key', async () => {
  state.batches = [[row()]];
  const r = await call();
  assert.equal(r.body.sent, 1);
  const [oauth] = oauthCalls();
  const form = new URLSearchParams(oauth.init.body);
  assert.equal(form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  const [h, c, s] = form.get('assertion').split('.');
  const dec = (x) => JSON.parse(Buffer.from(x, 'base64url').toString());
  assert.deepEqual(dec(h), { alg: 'RS256', typ: 'JWT' });
  const claims = dec(c);
  assert.equal(claims.iss, SA.client_email);
  assert.equal(claims.aud, SA.token_uri);
  assert.equal(claims.scope, 'https://www.googleapis.com/auth/firebase.messaging');
  assert.equal(claims.exp - claims.iat, 3600);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', keys.publicKey, Buffer.from(s, 'base64url'), new TextEncoder().encode(`${h}.${c}`));
  assert.ok(valid, 'JWT signature verifies with the public key');
  const [m] = fcmCalls();
  assert.equal(m.url, 'https://fcm.googleapis.com/v1/projects/sanad-test/messages:send');
  assert.equal(m.auth, 'Bearer at-1');
  assert.equal(state.reports[0].p_results[0].status, 'sent');
});

test('Arabic or English by the phone language; data is strings only with the deep-link fields', async () => {
  state.batches = [[row({ tokens: [{ token: 'tok-ar', platform: 'android', lang: 'ar' }, { token: 'tok-en', platform: 'android', lang: 'en' }] })]];
  await call();
  const msgs = Object.fromEntries(fcmCalls().map((x) => [x.msg.message.token, x.msg.message]));
  assert.equal(msgs['tok-ar'].notification.title, 'تمت الموافقة على طلبك');
  assert.equal(msgs['tok-en'].notification.title, 'Your request was approved');
  assert.equal(msgs['tok-en'].notification.body, 'Annual leave — On 2026-12-01');
  const data = msgs['tok-ar'].data;
  assert.deepEqual(data, { kind: 'request_decided', notification_id: 'n1', priority: 'normal', request_id: 'r1', count: '3' });
  assert.ok(Object.values(data).every((v) => typeof v === 'string'));
  assert.equal(msgs['tok-ar'].android.notification.channel_id, 'sanad');
  assert.equal(msgs['tok-ar'].android.priority, 'HIGH');
});

test('high priority (emergency) uses the sanad-emergency channel and a time-sensitive iOS alert', async () => {
  state.batches = [[row({ kind: 'emergency_alert', priority: 'high' })]];
  await call();
  const [m] = fcmCalls();
  assert.equal(m.msg.message.android.priority, 'HIGH');
  assert.equal(m.msg.message.android.notification.channel_id, 'sanad-emergency');
  assert.equal(m.msg.message.apns.payload.aps['interruption-level'], 'time-sensitive');
});

test('unregistered token is removed; a row whose only token is gone becomes no_token', async () => {
  fcmReply = (msg) => msg.message.token === 'dead'
    ? { status: 404, body: { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } } }
    : { status: 200, body: {} };
  state.batches = [[
    row({ id: 'a', tokens: [{ token: 'dead', platform: 'android', lang: 'ar' }, { token: 'live', platform: 'android', lang: 'ar' }] }),
    row({ id: 'b', tokens: [{ token: 'dead', platform: 'android', lang: 'ar' }] }),
  ]];
  const r = await call();
  const rep = state.reports[0];
  assert.deepEqual(rep.p_invalid_tokens, ['dead']);
  assert.deepEqual(Object.fromEntries(rep.p_results.map((x) => [x.id, x.status])), { a: 'sent', b: 'no_token' });
  assert.equal(r.body.invalid_tokens, 1);
});

test('server errors are retried later; a bad payload fails; tokens are kept', async () => {
  fcmReply = (msg) => msg.message.token === 'busy'
    ? { status: 503, body: { error: { status: 'UNAVAILABLE' } } }
    : { status: 400, body: { error: { status: 'INVALID_ARGUMENT', message: 'Invalid JSON payload' } } };
  state.batches = [[
    row({ id: 'a', tokens: [{ token: 'busy', platform: 'android', lang: 'ar' }] }),
    row({ id: 'b', tokens: [{ token: 'other', platform: 'android', lang: 'ar' }] }),
  ]];
  await call();
  const rep = state.reports[0];
  assert.deepEqual(rep.p_invalid_tokens, []);
  assert.deepEqual(Object.fromEntries(rep.p_results.map((x) => [x.id, x.status])), { a: 'retry', b: 'failed' });
});

test('a row with no tokens is closed as no_token without calling FCM', async () => {
  state.batches = [[row({ tokens: [] })]];
  await call();
  assert.equal(state.reports[0].p_results[0].status, 'no_token');
  assert.equal(fcmCalls().length, 0);
});

test('the OAuth token is reused between runs', async () => {
  state.batches = [[row()]];
  await call();
  state.batches = [[row({ id: 'n2' })]];
  await call();
  assert.equal(oauthCalls().length, 1);
  assert.equal(fcmCalls().length, 2);
});

test('OAuth failure keeps the rows for a retry', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => (String(url) === SA.token_uri ? new Response('{"error":"invalid_grant"}', { status: 400 }) : realFetch(url, init));
  try {
    state.batches = [[row()]];
    await call();
    assert.equal(state.reports[0].p_results[0].status, 'retry');
    assert.match(state.reports[0].p_results[0].error, /oauth_failed_400/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('validate mode: validate_only to a topic, nothing claimed or delivered', async () => {
  const r = await call({ validate: true });
  assert.equal(r.body.configured, true);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.project_id, 'sanad-test');
  const [m] = fcmCalls();
  assert.equal(m.msg.validate_only, true);
  assert.equal(m.msg.message.topic, 'sanad-validate');
  assert.ok(!state.calls.some((c) => c.name === 'push_claim'));
  delete env.FCM_SERVICE_ACCOUNT;
  assert.deepEqual((await call({ validate: true })).body, { configured: false });
});

test('iOS (APNs) tokens are not sent to FCM and are kept; iOS-only rows wait as not_configured', async () => {
  state.batches = [[
    row({ id: 'a', tokens: [{ token: 'apns-token', platform: 'ios', lang: 'ar' }] }),
    row({ id: 'b', tokens: [{ token: 'apns-token', platform: 'ios', lang: 'ar' }, { token: 'fcm', platform: 'android', lang: 'ar' }] }),
  ]];
  await call();
  assert.deepEqual(fcmCalls().map((x) => x.msg.message.token), ['fcm']);
  const rep = state.reports[0];
  assert.deepEqual(Object.fromEntries(rep.p_results.map((x) => [x.id, [x.status, x.error]])), { a: ['not_configured', 'ios_needs_apns'], b: ['sent', null] });
  assert.deepEqual(rep.p_invalid_tokens, []);
});

test('classify: FCM error codes', () => {
  assert.equal(mod.classify(200, {}), 'ok');
  assert.equal(mod.classify(404, {}), 'invalid_token');
  assert.equal(mod.classify(403, { error: { details: [{ errorCode: 'SENDER_ID_MISMATCH' }] } }), 'invalid_token');
  assert.equal(mod.classify(400, { error: { message: 'The registration token is not a valid FCM registration token' } }), 'invalid_token');
  assert.equal(mod.classify(429, {}), 'retry');
  assert.equal(mod.classify(500, {}), 'retry');
  assert.equal(mod.classify(400, { error: { message: 'bad' } }), 'fail');
  assert.equal(mod.parseServiceAccount('{"project_id":1}'), null);
  assert.equal(mod.parseServiceAccount(''), null);
});
