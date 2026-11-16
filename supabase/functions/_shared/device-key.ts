// Device key (PRD 4.7): ECDSA P-256 key in the phone's secure hardware, unlocked only by Face ID /
// fingerprint. The phone signs the punch; the server checks it with the stored public key.
import { b64decode, children, DerError, equal, expect, parse, T, UNIVERSAL } from "./der.ts";

/** SubjectPublicKeyInfo prefix of an uncompressed P-256 point (iOS gives the bare 65-byte point). */
const P256_SPKI_PREFIX = new Uint8Array([
  0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00,
]);

/** What the phone signs for a punch. The app builds the same text (apps/mobile/src/lib/punch.ts). */
export function punchSigningPayload(p: {
  nonce: string;
  lat: number;
  lng: number;
  accuracy: number;
  photoSha256: string;
  vpn: boolean;
  mockLocation: boolean;
  rooted: boolean;
}): string {
  return [
    "sanad-punch-v1",
    p.nonce,
    String(p.lat),
    String(p.lng),
    String(p.accuracy),
    p.photoSha256,
    p.vpn ? "1" : "0",
    p.mockLocation ? "1" : "0",
    p.rooted ? "1" : "0",
  ].join("\n");
}

/** SHA-256 (base64) of a string's UTF-8 bytes. The punch photo is hashed as the base64 text it was sent as. */
export async function sha256b64(text: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  let s = "";
  for (const b of d) s += String.fromCharCode(b);
  return btoa(s);
}

/**
 * Normalises a submitted public key to P-256 SubjectPublicKeyInfo bytes, or null when it is anything else.
 * Accepts SPKI DER (Android) or the 65-byte uncompressed point (iOS), both base64.
 */
export function normalizePublicKey(b64: unknown): Uint8Array | null {
  if (typeof b64 !== "string" || b64.length > 400) return null;
  let bytes: Uint8Array;
  try {
    bytes = b64decode(b64);
  } catch {
    return null;
  }
  if (bytes.length === 65 && bytes[0] === 0x04) {
    const out = new Uint8Array(P256_SPKI_PREFIX.length + 65);
    out.set(P256_SPKI_PREFIX);
    out.set(bytes, P256_SPKI_PREFIX.length);
    return out;
  }
  if (bytes.length === P256_SPKI_PREFIX.length + 65 && equal(bytes.subarray(0, P256_SPKI_PREFIX.length), P256_SPKI_PREFIX) && bytes[26] === 0x04) {
    return bytes;
  }
  return null;
}

/** DER ECDSA signature (SEQUENCE { r, s }) to the fixed-size r||s form WebCrypto wants. */
export function derSignatureToRaw(der: Uint8Array, size: number): Uint8Array {
  const seq = expect(parse(der), UNIVERSAL, T.SEQUENCE, "signature");
  const [r, s] = children(seq);
  if (!r || !s || children(seq).length !== 2) throw new DerError("signature parts");
  const out = new Uint8Array(size * 2);
  for (const [i, n] of [[0, r], [1, s]] as const) {
    expect(n, UNIVERSAL, T.INTEGER, "signature integer");
    let v = n.value;
    while (v.length > size && v[0] === 0) v = v.subarray(1);
    if (v.length > size) throw new DerError("signature integer size");
    out.set(v, i * size + (size - v.length));
  }
  return out;
}

/** True when [signatureB64] (DER ECDSA, SHA-256) over the UTF-8 [payload] matches the SPKI key. */
export async function verifyDeviceSignature(spkiB64: string, payload: string, signatureB64: unknown): Promise<boolean> {
  if (typeof signatureB64 !== "string" || signatureB64.length > 200) return false;
  try {
    const key = await crypto.subtle.importKey("spki", b64decode(spkiB64), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const sigBytes = b64decode(signatureB64);
    // DER from Android / iOS; the raw 64-byte r||s form is accepted too.
    let raw: Uint8Array;
    try {
      raw = derSignatureToRaw(sigBytes, 32);
    } catch {
      if (sigBytes.length !== 64) return false;
      raw = sigBytes;
    }
    return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, raw, new TextEncoder().encode(payload));
  } catch {
    return false;
  }
}
