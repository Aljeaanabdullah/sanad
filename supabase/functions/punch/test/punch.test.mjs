// Run: node --import ./supabase/functions/punch/test/register.mjs --test 'supabase/functions/punch/test/*.test.mjs'
// Checks PRD 4.6: device_biometric needs a passed Face ID / fingerprint and a photo; the old face path is unchanged.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setup, state } from './fake-supabase.mjs';
import { newKey, spkiOf, signDer, b64 } from './attestation-fixtures.mjs';
import { punchSigningPayload, sha256b64 } from '../../_shared/device-key.ts';

let handler;
globalThis.Deno = { serve: (h) => { handler = h; }, env: { get: () => 'x' } };
await import('../index.ts');

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).toString('base64');
const loc = { lat: 29.37, lng: 47.97, accuracy: 12 };
const bio = (over = {}) => ({
  verification: 'device_biometric', device_identifier: 'dev-1', location: loc,
  report: { vpn: false, mock_location: false, rooted: false, biometric: { passed: true, type: 'face' } },
  photo: JPEG, ...over,
});
const face = (over = {}) => ({
  device_identifier: 'dev-1', location: loc, model_version: 'dlib-resnet-v1/align-v1',
  descriptor: Array.from({ length: 128 }, () => 0.01),
  report: { vpn: false, mock_location: false, rooted: false, liveness: { challenge: 'blink', passed: true } },
  photo: JPEG, ...over,
});
async function call(body) {
  const res = await handler(new Request('http://x/punch', { method: 'POST', headers: { Authorization: 'Bearer t' }, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
}

beforeEach(() => setup({}));

test('biometric: accepted with Face ID passed + photo, no face match done', async () => {
  const r = await call(bio());
  assert.equal(r.status, 200);
  assert.equal(r.body.result, 'accepted');
  assert.equal(r.body.reason, null);
  assert.ok(!state.rpcCalls.includes('face_distance'));
  assert.equal(state.inserted[0].client_report.verification, 'device_biometric');
  assert.equal(state.uploads.length, 1);
});

test('biometric: rejected and recorded when Face ID did not pass', async () => {
  const r = await call(bio({ report: { vpn: false, mock_location: false, rooted: false, biometric: { passed: false } } }));
  assert.equal(r.body.result, 'rejected');
  assert.equal(r.body.reason, 'biometric_failed');
  assert.equal(state.inserted[0].result, 'rejected');
});

test('biometric: rejected when the biometric report is missing', async () => {
  const r = await call(bio({ report: { vpn: false, mock_location: false, rooted: false } }));
  assert.equal(r.body.reason, 'biometric_failed');
});

test('biometric: no photo -> invalid_photo, nothing saved', async () => {
  const r = await call(bio({ photo: undefined }));
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'invalid_photo');
  assert.equal(state.inserted.length, 0);
});

test('biometric: a photo that is not a JPEG is refused', async () => {
  const r = await call(bio({ photo: Buffer.from('hello world').toString('base64') }));
  assert.equal(r.body.error, 'invalid_photo');
});

test('biometric: phone checks still apply (wrong device, mock location, root, outside site)', async () => {
  assert.equal((await call(bio({ device_identifier: 'other' }))).body.reason, 'wrong_device');
  setup({});
  assert.equal((await call(bio({ report: { mock_location: true, biometric: { passed: true } } }))).body.reason, 'mock_location');
  setup({});
  assert.equal((await call(bio({ report: { rooted: true, biometric: { passed: true } } }))).body.reason, 'rooted');
  setup({ near: [{ site_id: 's1', name_ar: 'المقر', name_en: 'HQ', distance_m: 900, radius_m: 150 }] });
  assert.equal((await call(bio())).body.reason, 'outside_site');
  setup({ consents: 0 });
  assert.equal((await call(bio())).body.reason, 'no_consent');
});

test('unknown verification value is refused', async () => {
  const r = await call(bio({ verification: 'something_else' }));
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'invalid_body');
});

test('old face path: unchanged — needs a 128 descriptor', async () => {
  const r = await call(face({ descriptor: [1, 2, 3] }));
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'invalid_body');
});

test('old face path: accepted with liveness + matching face', async () => {
  const r = await call(face());
  assert.equal(r.body.result, 'accepted');
  assert.ok(state.rpcCalls.includes('face_distance'));
  assert.equal(state.inserted[0].client_report.verification, 'face_descriptor');
});

test('old face path: face mismatch and failed liveness still refused', async () => {
  setup({ faceDistance: 0.9 });
  assert.equal((await call(face())).body.reason, 'face_mismatch');
  setup({});
  assert.equal((await call(face({ report: { liveness: { passed: false } } }))).body.reason, 'liveness_failed');
});

test('old face path: a passed biometric flag does not replace liveness', async () => {
  const r = await call(face({ report: { biometric: { passed: true } } }));
  assert.equal(r.body.reason, 'liveness_failed');
});

test('lock after 5 refused attempts still applies', async () => {
  const at = new Date().toISOString();
  setup({ recent: Array.from({ length: 5 }, () => ({ result: 'rejected', punched_at: at })) });
  const r = await call(bio());
  assert.equal(r.status, 429);
  assert.equal(r.body.error, 'locked');
});

// ---------------------------------------------------------------- S3: VPN recorded only, device id not stored

test('VPN is recorded, not refused (PRD 5.4, version 1.11)', async () => {
  const r = await call(bio({ report: { vpn: true, mock_location: false, rooted: false, biometric: { passed: true, type: 'face' } } }));
  assert.equal(r.body.result, 'accepted');
  assert.equal(state.inserted[0].client_report.vpn, true);
});

test('the device id is not copied into the punch log (readable by the employee)', async () => {
  await call(bio());
  await call(face());
  for (const row of state.inserted) assert.ok(!('device_identifier' in row.client_report));
});

// ---------------------------------------------------------------- S3: signed punches (PRD 4.7)

let deviceKey;
async function withKey(over = {}) {
  deviceKey ??= await newKey();
  setup({ device: { id: 'd1', device_identifier: 'dev-1', platform: 'android', public_key: b64(await spkiOf(deviceKey)), key_attested: true }, ...over });
}
/** A body signed like the app does; [tamper] changes the body after signing. */
async function signed({ nonce = 'n1', expired = false, issue = true, tamper = (b) => b, key } = {}) {
  if (issue) state.challenges[nonce] = { purpose: 'punch', expired };
  const body = bio();
  const payload = punchSigningPayload({
    nonce, lat: body.location.lat, lng: body.location.lng, accuracy: body.location.accuracy,
    photoSha256: await sha256b64(body.photo), vpn: false, mockLocation: false, rooted: false,
  });
  const value = b64(await signDer((key ?? deviceKey).privateKey, new TextEncoder().encode(payload)));
  return tamper({ ...body, signature: { nonce, value } });
}
const enforce = { settings: { require_device_signature: true, allow_face_descriptor: true, allow_unattested_ios: true } };

test('signature: a correct signature is accepted and recorded as ok', async () => {
  await withKey(enforce);
  const r = await call(await signed());
  assert.equal(r.body.result, 'accepted', JSON.stringify(r.body));
  assert.equal(state.inserted[0].client_report.signature, 'ok');
  assert.equal(state.inserted[0].client_report.key_attested, true);
});

test('signature: the nonce works once only (a copied request is refused)', async () => {
  await withKey(enforce);
  const body = await signed();
  assert.equal((await call(body)).body.result, 'accepted');
  const again = await call(body);
  assert.equal(again.body.reason, 'challenge_expired');
});

test('signature: an expired or unknown nonce is refused', async () => {
  await withKey(enforce);
  assert.equal((await call(await signed({ expired: true }))).body.reason, 'challenge_expired');
  await withKey(enforce);
  assert.equal((await call(await signed({ issue: false }))).body.reason, 'challenge_expired');
});

test('signature: changing the location, the photo or a check after signing breaks it', async () => {
  await withKey(enforce);
  const moved = await signed({ tamper: (b) => ({ ...b, location: { ...b.location, lat: 29.38 } }) });
  assert.equal((await call(moved)).body.reason, 'signature_invalid');
  await withKey(enforce);
  const photo = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9, 9]).toString('base64');
  assert.equal((await call(await signed({ tamper: (b) => ({ ...b, photo }) }))).body.reason, 'signature_invalid');
  await withKey(enforce);
  const flags = await signed({ tamper: (b) => ({ ...b, report: { ...b.report, mock_location: true } }) });
  // Mock location is refused anyway; the signature check comes first and fails.
  assert.equal((await call(flags)).body.reason, 'signature_invalid');
});

test('signature: a key made on a computer (not the registered one) is refused', async () => {
  await withKey(enforce);
  const r = await call(await signed({ key: await newKey() }));
  assert.equal(r.body.reason, 'signature_invalid');
});

test('signature: missing signature / no registered key are refused when required', async () => {
  await withKey(enforce);
  assert.equal((await call(bio())).body.reason, 'signature_missing');
  setup(enforce);
  assert.equal((await call(bio())).body.reason, 'device_key_missing');
});

test('signature: iPhone keys without attestation follow the switch', async () => {
  await withKey(enforce);
  state.device.key_attested = false;
  assert.equal((await call(await signed())).body.result, 'accepted');
  await withKey({ settings: { require_device_signature: true, allow_face_descriptor: true, allow_unattested_ios: false } });
  state.device.key_attested = false;
  assert.equal((await call(await signed())).body.reason, 'device_key_missing');
});

test('rollout: with the requirement off, nobody is refused but the result is recorded', async () => {
  setup({});
  assert.equal((await call(bio())).body.result, 'accepted');
  assert.equal(state.inserted[0].client_report.signature, 'no_key');
  await withKey({});
  assert.equal((await call(bio())).body.result, 'accepted');
  assert.equal(state.inserted[0].client_report.signature, 'missing');
  await withKey({});
  assert.equal((await call(await signed({ key: await newKey() }))).body.result, 'accepted');
  assert.equal(state.inserted[0].client_report.signature, 'invalid');
});

test('signature: wrong device is still the first reason', async () => {
  await withKey(enforce);
  const r = await call(await signed({ tamper: (b) => ({ ...b, device_identifier: 'other' }) }));
  assert.equal(r.body.reason, 'wrong_device');
  assert.ok(!state.rpcCalls.includes('consume_device_challenge'));
});

test('old face path: still works, and can be switched off', async () => {
  setup(enforce);
  assert.equal((await call(face())).body.result, 'accepted');
  assert.ok(!('signature' in state.inserted[0].client_report));
  setup({ settings: { require_device_signature: false, allow_face_descriptor: false, allow_unattested_ios: true } });
  const r = await call(face());
  assert.equal(r.body.reason, 'method_disabled');
  assert.ok(!state.rpcCalls.includes('face_distance'));
});

test('signing payload is the same text the app builds', () => {
  assert.equal(
    punchSigningPayload({ nonce: 'abc', lat: 29.37, lng: 47.97, accuracy: 12.5, photoSha256: 'SGFzaA==', vpn: true, mockLocation: false, rooted: false }),
    'sanad-punch-v1\nabc\n29.37\n47.97\n12.5\nSGFzaA==\n1\n0\n0',
  );
});
