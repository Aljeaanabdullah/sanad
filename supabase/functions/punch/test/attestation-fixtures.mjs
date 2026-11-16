// Test helpers: a tiny DER writer, and fake "Android Key Attestation" chains signed by a test root.
// The real check (supabase/functions/_shared/android-attestation.ts) is given this test root instead of Google's.
const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();

const cat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
const len = (n) => (n < 128 ? [n] : n < 256 ? [0x81, n] : n < 65536 ? [0x82, n >> 8, n & 255] : [0x83, n >> 16, (n >> 8) & 255, n & 255]);
const tlv = (tag, content) => cat(Uint8Array.from(tag), Uint8Array.from(len(content.length)), content);
const base128 = (n) => {
  const out = [n & 0x7f];
  while ((n = Math.floor(n / 128)) > 0) out.unshift((n & 0x7f) | 0x80);
  return out;
};
const uintBytes = (b) => {
  let v = b;
  while (v.length > 1 && v[0] === 0 && !(v[1] & 0x80)) v = v.subarray(1);
  return v[0] & 0x80 ? cat(Uint8Array.of(0), v) : v;
};
const numBytes = (n) => {
  const out = [];
  do { out.unshift(n & 255); n = Math.floor(n / 256); } while (n > 0);
  return uintBytes(Uint8Array.from(out));
};

export const der = {
  seq: (...c) => tlv([0x30], cat(...c)),
  set: (...c) => tlv([0x31], cat(...c)),
  int: (n) => tlv([0x02], numBytes(n)),
  uint: (bytes) => tlv([0x02], uintBytes(bytes)),
  enumv: (n) => tlv([0x0a], numBytes(n)),
  octet: (b) => tlv([0x04], b),
  bool: (v) => tlv([0x01], Uint8Array.of(v ? 0xff : 0)),
  nul: () => tlv([0x05], new Uint8Array()),
  bits: (b) => tlv([0x03], cat(Uint8Array.of(0), b)),
  utf8: (s) => tlv([0x0c], enc.encode(s)),
  time: (s) => tlv([0x17], enc.encode(s)),
  oid: (s) => {
    const [a, b, ...rest] = s.split('.').map(Number);
    return tlv([0x06], Uint8Array.from([40 * a + b, ...rest.flatMap(base128)]));
  },
  /** [n] EXPLICIT (constructed, context-specific), high tag numbers included. */
  ctx: (n, content) => tlv(n < 31 ? [0xa0 | n] : [0xbf, ...base128(n)], content),
};

export const b64 = (b) => Buffer.from(b).toString('base64');

/** WebCrypto raw r||s -> DER SEQUENCE { r, s } (what Android and iOS return). */
export function rawToDer(raw) {
  const h = raw.length / 2;
  return der.seq(der.uint(raw.subarray(0, h)), der.uint(raw.subarray(h)));
}

export const newKey = () => subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
export const spkiOf = async (k) => new Uint8Array(await subtle.exportKey('spki', k.publicKey));

export async function signDer(privateKey, data) {
  const raw = new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, data));
  return rawToDer(raw);
}

const ECDSA_SHA256 = '1.2.840.10045.4.3.2';
const name = (cn) => der.seq(der.set(der.seq(der.oid('2.5.4.3'), der.utf8(cn))));

export async function makeCert({ subject, issuer, cn, issuerCn, serial, extensions = [] }) {
  const alg = der.seq(der.oid(ECDSA_SHA256));
  const parts = [
    der.ctx(0, der.int(2)),
    der.int(serial),
    alg,
    name(issuerCn ?? cn),
    der.seq(der.time('250101000000Z'), der.time('491231235959Z')),
    name(cn),
    await spkiOf(subject),
  ];
  if (extensions.length) parts.push(der.ctx(3, der.seq(...extensions.map((e) => der.seq(der.oid(e.oid), der.octet(e.value))))));
  const tbs = der.seq(...parts);
  return der.seq(tbs, alg, der.bits(await signDer(issuer.privateKey, tbs)));
}

export const DIGEST = 'ab'.repeat(32);

/** The KeyDescription extension (attestation record). Every field can be changed to test a refusal. */
export function keyDescription({
  challenge,
  level = 1,
  authType = 2,
  noAuth = false,
  locked = true,
  boot = 0,
  pkg = 'com.sanad.hr',
  digest = DIGEST,
}) {
  const appId = der.seq(der.set(der.seq(der.octet(enc.encode(pkg)), der.int(1))), der.set(der.octet(Buffer.from(digest, 'hex'))));
  const sw = der.seq(der.ctx(709, der.octet(appId)));
  const hw = [der.ctx(1, der.set(der.int(2))), der.ctx(2, der.int(3)), der.ctx(10, der.int(1))];
  if (noAuth) hw.push(der.ctx(503, der.nul()));
  if (authType) hw.push(der.ctx(504, der.int(authType)));
  hw.push(der.ctx(704, der.seq(der.octet(new Uint8Array(32)), der.bool(locked), der.enumv(boot), der.octet(new Uint8Array(32)))));
  hw.push(der.ctx(705, der.int(150000)), der.ctx(706, der.int(202610)));
  return der.seq(der.int(300), der.enumv(level), der.int(300), der.enumv(level), der.octet(enc.encode(challenge)), der.octet(new Uint8Array()), sw, der.seq(...hw));
}

/** A full chain: test root -> intermediate -> leaf (the device key) with the key description. */
export async function makeChain({ deviceKey, challenge, description = {}, root, leafSerial = 0x1234 } = {}) {
  root ??= await newKey();
  const inter = await newKey();
  const rootCert = await makeCert({ subject: root, issuer: root, cn: 'Test Root', serial: 1 });
  const interCert = await makeCert({ subject: inter, issuer: root, cn: 'Test Intermediate', issuerCn: 'Test Root', serial: 2 });
  const leafCert = await makeCert({
    subject: deviceKey,
    issuer: inter,
    cn: 'Android Keystore Key',
    issuerCn: 'Test Intermediate',
    serial: leafSerial,
    extensions: [{ oid: '1.3.6.1.4.1.11129.2.1.17', value: keyDescription({ challenge, ...description }) }],
  });
  return { chain: [leafCert, interCert, rootCert].map(b64), rootSpki: b64(await spkiOf(root)), root };
}
