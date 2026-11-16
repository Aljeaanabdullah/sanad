// Android Key Attestation check (PRD 4.7) against chains made by a test root (attestation-fixtures.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeChain, newKey, spkiOf, DIGEST, der, b64 } from './attestation-fixtures.mjs';
import { verifyAndroidAttestation, revokedFromStatus, GOOGLE_ROOT_KEYS, parseCertificate } from '../../_shared/android-attestation.ts';
import { b64decode } from '../../_shared/der.ts';

const NONCE = 'a1'.repeat(32);

async function check(description = {}, extra = {}) {
  const deviceKey = await newKey();
  const { chain, rootSpki } = await makeChain({ deviceKey, challenge: NONCE, description });
  return verifyAndroidAttestation({
    chain,
    publicKey: await spkiOf(deviceKey),
    challenge: NONCE,
    packageName: 'com.sanad.hr',
    signingDigests: [DIGEST],
    roots: [rootSpki],
    revokedSerials: new Set(),
    ...extra,
  });
}

test('a genuine chain is accepted, with a summary for the admin', async () => {
  const r = await check();
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.summary.security_level, 'tee');
  assert.equal(r.summary.boot_state, 'verified');
  assert.equal(r.summary.device_locked, true);
  assert.deepEqual(r.summary.packages, ['com.sanad.hr']);
  assert.deepEqual(r.summary.signing_digests, [DIGEST]);
  assert.equal(r.summary.revocation_checked, true);
});

test('StrongBox is reported', async () => {
  const r = await check({ level: 2 });
  assert.equal(r.summary.security_level, 'strongbox');
});

test('a chain that does not end in a trusted root is refused (Google roots by default)', async () => {
  const deviceKey = await newKey();
  const { chain } = await makeChain({ deviceKey, challenge: NONCE });
  const r = await verifyAndroidAttestation({ chain, publicKey: await spkiOf(deviceKey), challenge: NONCE, packageName: 'com.sanad.hr', signingDigests: [] });
  assert.deepEqual(r, { ok: false, error: 'attestation_untrusted_root' });
});

test('a key made on a computer (software level) is refused', async () => {
  assert.equal((await check({ level: 0 })).error, 'attestation_software_key');
});

test('the nonce must be the one the server issued', async () => {
  assert.equal((await check({ challenge: 'b2'.repeat(32) })).error, 'attestation_challenge');
});

test('the registered key must be the attested key', async () => {
  const other = await newKey();
  assert.equal((await check({}, { publicKey: await spkiOf(other) })).error, 'attestation_key_mismatch');
});

test('a key that works without Face ID / fingerprint, or with the passcode, is refused', async () => {
  assert.equal((await check({ noAuth: true })).error, 'attestation_no_biometric');
  assert.equal((await check({ authType: 0 })).error, 'attestation_no_biometric');
  assert.equal((await check({ authType: 3 })).error, 'attestation_no_biometric');
});

test('an unlocked bootloader or modified system is refused', async () => {
  assert.equal((await check({ locked: false })).error, 'attestation_device_unlocked');
  assert.equal((await check({ boot: 2 })).error, 'attestation_device_unlocked');
});

test('another app, or our app signed with another key, is refused', async () => {
  assert.equal((await check({ pkg: 'com.evil.clone' })).error, 'attestation_wrong_app');
  assert.equal((await check({ digest: 'cd'.repeat(32) })).error, 'attestation_wrong_app');
  // No digests configured: only the package name is checked.
  assert.equal((await check({ digest: 'cd'.repeat(32) }, { signingDigests: [] })).ok, true);
});

test('a revoked certificate is refused', async () => {
  assert.equal((await check({}, { revokedSerials: new Set(['1234']) })).error, 'attestation_revoked');
});

test('a tampered certificate breaks the chain', async () => {
  const deviceKey = await newKey();
  const { chain, rootSpki } = await makeChain({ deviceKey, challenge: NONCE });
  const leaf = Buffer.from(chain[0], 'base64');
  leaf[leaf.length - 80] ^= 1; // a byte inside the signed part
  const r = await verifyAndroidAttestation({
    chain: [leaf.toString('base64'), ...chain.slice(1)], publicKey: await spkiOf(deviceKey), challenge: NONCE,
    packageName: 'com.sanad.hr', signingDigests: [], roots: [rootSpki],
  });
  assert.equal(r.ok, false);
  assert.ok(['attestation_bad_chain', 'attestation_parse'].includes(r.error));
});

test('garbage input never throws', async () => {
  for (const chain of [undefined, 'x', [], ['a', 'b'], [b64(der.seq(der.int(1))), b64(der.seq())]]) {
    const r = await verifyAndroidAttestation({ chain, publicKey: new Uint8Array(91), challenge: NONCE, packageName: 'com.sanad.hr', signingDigests: [] });
    assert.equal(r.ok, false);
  }
});

test('Google root keys are well-formed public keys', async () => {
  assert.equal(GOOGLE_ROOT_KEYS.length, 2);
  await crypto.subtle.importKey('spki', b64decode(GOOGLE_ROOT_KEYS[0]), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  await crypto.subtle.importKey('spki', b64decode(GOOGLE_ROOT_KEYS[1]), { name: 'ECDSA', namedCurve: 'P-384' }, false, ['verify']);
});

test('certificate parser reads the serial', async () => {
  const deviceKey = await newKey();
  const { chain } = await makeChain({ deviceKey, challenge: NONCE, leafSerial: 0xbeef });
  assert.equal(parseCertificate(b64decode(chain[0])).serial, 'beef');
});

test('revocation list: revoked and suspended serials, leading zeros dropped', () => {
  const s = revokedFromStatus({ entries: { '00AB': { status: 'REVOKED' }, cd: { status: 'SUSPENDED' }, ef: { status: 'OK' } } });
  assert.deepEqual([...s].sort(), ['ab', 'cd']);
  assert.equal(revokedFromStatus(null), null);
});

test('real Google sample chain: passes chain, root, key and nonce checks; refused only for no biometric', async () => {
  const { readFileSync } = await import('node:fs');
  const chain = [0, 1, 2, 3].map((i) =>
    readFileSync(new URL(`./google-samples/tee_cert${i}.pem`, import.meta.url), 'utf8').replace(/-----[^-]+-----|\s/g, ''));
  const leaf = parseCertificate(b64decode(chain[0]));
  const base = { chain, publicKey: leaf.spki, packageName: 'com.sanad.hr', signingDigests: [] };
  // Google's real roots (default), the sample's challenge is "abc".
  assert.deepEqual(await verifyAndroidAttestation({ ...base, challenge: 'abc' }), { ok: false, error: 'attestation_no_biometric' });
  assert.equal((await verifyAndroidAttestation({ ...base, challenge: 'abd' })).error, 'attestation_challenge');
});

test('attack: the attested key of another (real) phone signs a forged leaf -> refused', async () => {
  // A genuine chain for a key that does NOT need biometrics (any app on the attacker's phone)...
  const realKey = await newKey();
  const { chain: real, rootSpki } = await makeChain({ deviceKey: realKey, challenge: NONCE, description: { authType: 0, noAuth: true } });
  // ...whose private key (usable for signing) signs a fake leaf claiming everything we check for.
  const fakeKey = await newKey();
  const { makeCert, keyDescription } = await import('./attestation-fixtures.mjs');
  const forged = await makeCert({
    subject: fakeKey, issuer: realKey, cn: 'Forged', issuerCn: 'Android Keystore Key', serial: 99,
    extensions: [{ oid: '1.3.6.1.4.1.11129.2.1.17', value: keyDescription({ challenge: NONCE }) }],
  });
  const r = await verifyAndroidAttestation({
    chain: [b64(forged), ...real], publicKey: await spkiOf(fakeKey), challenge: NONCE,
    packageName: 'com.sanad.hr', signingDigests: [DIGEST], roots: [rootSpki],
  });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'attestation_bad_chain');
});

test('an issuer that is not a CA, or names that do not chain, is refused', async () => {
  const deviceKey = await newKey();
  const root = await newKey();
  const { makeCert, keyDescription, CA_EXTENSIONS } = await import('./attestation-fixtures.mjs');
  const rootCert = await makeCert({ subject: root, issuer: root, cn: 'Test Root', serial: 1, extensions: CA_EXTENSIONS });
  const inter = await newKey();
  const notCa = await makeCert({ subject: inter, issuer: root, cn: 'Inter', issuerCn: 'Test Root', serial: 2 });
  const leafExt = [{ oid: '1.3.6.1.4.1.11129.2.1.17', value: keyDescription({ challenge: NONCE }) }];
  const leaf = await makeCert({ subject: deviceKey, issuer: inter, cn: 'Leaf', issuerCn: 'Inter', serial: 3, extensions: leafExt });
  const base = { publicKey: await spkiOf(deviceKey), challenge: NONCE, packageName: 'com.sanad.hr', signingDigests: [], roots: [b64(await spkiOf(root))] };
  assert.equal((await verifyAndroidAttestation({ ...base, chain: [leaf, notCa, rootCert].map(b64) })).error, 'attestation_bad_chain');
  const ca = await makeCert({ subject: inter, issuer: root, cn: 'Inter', issuerCn: 'Test Root', serial: 2, extensions: CA_EXTENSIONS });
  const wrongName = await makeCert({ subject: deviceKey, issuer: inter, cn: 'Leaf', issuerCn: 'Someone Else', serial: 3, extensions: leafExt });
  assert.equal((await verifyAndroidAttestation({ ...base, chain: [wrongName, ca, rootCert].map(b64) })).error, 'attestation_bad_chain');
  assert.equal((await verifyAndroidAttestation({ ...base, chain: [leaf, ca, rootCert].map(b64) })).ok, true);
});
