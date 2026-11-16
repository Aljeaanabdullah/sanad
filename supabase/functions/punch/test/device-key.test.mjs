// device-key function (PRD 4.7): registers the bound phone's public key once, Android only with attestation.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setup, state } from './fake-supabase.mjs';
import { makeChain, newKey, spkiOf, b64 } from './attestation-fixtures.mjs';

let handler;
globalThis.Deno = { serve: (h) => { handler = h; }, env: { get: (k) => (k.startsWith('SUPABASE') ? 'x' : undefined) } };
// Google's revocation list: no network in tests.
globalThis.fetch = async () => new Response(JSON.stringify({ entries: {} }), { status: 200 });
await import('../../device-key/index.ts');

async function call(body, headers = { Authorization: 'Bearer t' }) {
  const res = await handler(new Request('http://x/device-key', { method: 'POST', headers, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
}
const issue = (nonce = 'k1', over = {}) => { state.challenges[nonce] = { purpose: 'bind_key', ...over }; return nonce; };

beforeEach(() => setup({}));

test('needs a signed-in user', async () => {
  assert.equal((await call({}, {})).status, 401);
});

test('Android: a key without attestation is refused, nothing saved', async () => {
  const key = await newKey();
  const r = await call({ nonce: issue(), public_key: b64(await spkiOf(key)) });
  assert.equal(r.status, 422);
  assert.equal(r.body.error, 'attestation_parse');
  assert.equal(state.device.public_key, null);
});

test('Android: a chain that is not from Google is refused (a key made on a computer)', async () => {
  const key = await newKey();
  const { chain } = await makeChain({ deviceKey: key, challenge: 'k1' });
  const r = await call({ nonce: issue(), public_key: b64(await spkiOf(key)), attestation: chain });
  assert.equal(r.body.error, 'attestation_untrusted_root');
  assert.equal(state.device.public_key, null);
});

test('Android: the platform comes from the binding, not from the request', async () => {
  const key = await newKey();
  const r = await call({ nonce: issue(), public_key: b64(await spkiOf(key)), platform: 'ios' });
  assert.equal(r.status, 422);
});

test('iPhone: the 65-byte key is accepted as unattested and stored as SPKI', async () => {
  setup({ device: { id: 'd1', device_identifier: 'dev-1', platform: 'ios', public_key: null, key_attested: false } });
  const key = await newKey();
  const point = new Uint8Array(await crypto.subtle.exportKey('raw', key.publicKey));
  const r = await call({ nonce: issue(), public_key: b64(point) });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result, 'unattested');
  assert.equal(state.device.public_key, b64(await spkiOf(key)));
  assert.equal(state.device.key_attested, false);
});

test('iPhone: refused when the owner requires attestation', async () => {
  setup({
    device: { id: 'd1', device_identifier: 'dev-1', platform: 'ios', public_key: null, key_attested: false },
    settings: { require_device_signature: true, allow_face_descriptor: true, allow_unattested_ios: false },
  });
  const key = await newKey();
  const r = await call({ nonce: issue(), public_key: b64(await spkiOf(key)) });
  assert.equal(r.body.error, 'attestation_required');
});

test('a phone that already has a key cannot replace it (admin must unbind first)', async () => {
  setup({ device: { id: 'd1', device_identifier: 'dev-1', platform: 'ios', public_key: 'old', key_attested: false } });
  const key = await newKey();
  const r = await call({ nonce: issue(), public_key: b64(await spkiOf(key)) });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'key_exists');
  assert.equal(state.device.public_key, 'old');
});

test('no bound phone -> no_device', async () => {
  setup({ device: null });
  const key = await newKey();
  assert.equal((await call({ nonce: issue(), public_key: b64(await spkiOf(key)) })).body.error, 'no_device');
});

test('nonce: expired, unknown, or issued for punching is refused', async () => {
  setup({ device: { id: 'd1', device_identifier: 'dev-1', platform: 'ios', public_key: null, key_attested: false } });
  const key = b64(await spkiOf(await newKey()));
  assert.equal((await call({ nonce: issue('a', { expired: true }), public_key: key })).body.error, 'challenge_expired');
  assert.equal((await call({ nonce: 'never-issued', public_key: key })).body.error, 'challenge_expired');
  state.challenges.p = { purpose: 'punch' };
  assert.equal((await call({ nonce: 'p', public_key: key })).body.error, 'challenge_expired');
  assert.equal(state.device.public_key, null);
});

test('a key that is not P-256 is refused', async () => {
  const rsa = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign']);
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', rsa.publicKey));
  const r = await call({ nonce: issue(), public_key: b64(spki) });
  assert.equal(r.body.error, 'invalid_body');
});
