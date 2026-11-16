// Run: node --import ./supabase/functions/punch/test/register.mjs --test supabase/functions/punch/test/
// Checks PRD 4.6: device_biometric needs a passed Face ID / fingerprint and a photo; the old face path is unchanged.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setup, state } from './fake-supabase.mjs';

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

test('biometric: phone checks still apply (wrong device, VPN, mock location, root, outside site)', async () => {
  assert.equal((await call(bio({ device_identifier: 'other' }))).body.reason, 'wrong_device');
  setup({});
  assert.equal((await call(bio({ report: { vpn: true, biometric: { passed: true } } }))).body.reason, 'vpn');
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
