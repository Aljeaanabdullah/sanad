// Android Key Attestation check (PRD 4.7). When the phone makes its signing key it also gets a certificate
// chain from the secure hardware, ending in a Google root. The chain proves: the key is in real secure
// hardware (TEE / StrongBox), it unlocks only with a strong biometric, it was made by our app, for our
// nonce, and the phone's system is not modified (locked bootloader, verified boot).
// Reference: https://developer.android.com/privacy-and-security/security-key-attestation
import {
  b64decode,
  bits,
  bool,
  children,
  CONTEXT,
  DerError,
  equal,
  expect,
  hex,
  int,
  is,
  type Node,
  oid,
  parse,
  T,
  UNIVERSAL,
} from "./der.ts";

/** Public keys (SubjectPublicKeyInfo, base64) of Google's hardware attestation roots, from the page above. */
export const GOOGLE_ROOT_KEYS = [
  // RSA-4096 root (several certificates over the years share this key).
  "MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAr7bHgiuxpwHsK7Qui8xUFmOr75gvMsd/dTEDDJdSSxtf6An7xyqpRR90PL2abxM1dEqlXnf2tqw1Ne4Xwl5jlRfdnJLmN0pTy/4lj4/7tv0Sk3iiKkypnEUtR6WfMgH0QZfKHM1+di+y9TFRtv6y//0rb+T+W8a9nsNL/ggjnar86461qO0rOs2cXjp3kOG1FEJ5MVmFmBGtnrKpa73XpXyTqRxB/M0n1n/W9nGqC4FSYa04T6N5RIZGBN2z2MT5IKGbFlbC8UrW0DxW7AYImQQcHtGl/m00QLVWutHQoVJYnFPlXTcHYvASLu+RhhsbDmxMgJJ0mcDpvsC4PjvB+TxywElgS70vE0XmLD+OJtvsBslHZvPBKCOdT0MS+tgSOIfga+z1Z1g7+DVagf7quvmag8jfPioyKvxnK/EgsTUVi2ghzq8wm27ud/mIM7AY2qEORR8Go3TVB4HzWQgpZrt3i5MIlCaY504LzSRiigHCzAPlHws+W0rB5N+er5/2pJKnfBSDiCiFAVtCLOZ7gLiMm0jhO2B6tUXHI/+MRPjy02i59lINMRRev56GKtcd9qO/0kUJWdZTdA2XoS82ixPvZtXQpUpuL12ab+9EaDK8Z4RHJYYfCT3Q5vNAXaiWQ+8PTWm2QgBR/bkwSWc+NpUFgNPN9PvQi8WEg5UmAGMCAwEAAQ==",
  // ECDSA P-384 root "Key Attestation CA1" (2025+).
  "MHYwEAYHKoZIzj0CAQYFK4EEACIDYgAEI9ojcU7fPlsFCjxy6IRqzgeOoK0b+YsV9FPQywiyw8EQRTkJ9u3qwfnI4DGoSLlBqClTXJfgfCcZvs60FikNMHnu4fkRzObfgDkU2KNXezT9/RQ+XvNslxPHrHCowhGr",
];

export const KEY_DESCRIPTION_OID = "1.3.6.1.4.1.11129.2.1.17";

// AuthorizationList tags used here.
const TAG_ALGORITHM = 2;
const TAG_EC_CURVE = 10;
const TAG_NO_AUTH_REQUIRED = 503;
const TAG_USER_AUTH_TYPE = 504;
const TAG_AUTH_TIMEOUT = 505;
const TAG_ROOT_OF_TRUST = 704;
const TAG_OS_VERSION = 705;
const TAG_OS_PATCH_LEVEL = 706;
const TAG_APPLICATION_ID = 709;
// HardwareAuthenticatorType bits.
const AUTH_PASSWORD = 1;
const AUTH_FINGERPRINT = 2; // "fingerprint" = any strong biometric in KeyMint
const ALGORITHM_EC = 3;
const CURVE_P256 = 1;
const SECURITY_LEVEL = ["software", "tee", "strongbox"] as const;
const BOOT_STATE = ["verified", "self_signed", "unverified", "failed"] as const;

export type AttestationError =
  | "attestation_parse"
  | "attestation_bad_chain"
  | "attestation_untrusted_root"
  | "attestation_revoked"
  | "attestation_key_mismatch"
  | "attestation_challenge"
  | "attestation_software_key"
  | "attestation_no_biometric"
  | "attestation_device_unlocked"
  | "attestation_wrong_app";

export type AttestationSummary = {
  attestation_version: number;
  security_level: string;
  keymint_security_level: string;
  boot_state: string;
  device_locked: boolean;
  user_auth_type: number;
  auth_timeout: number | null;
  packages: string[];
  signing_digests: string[];
  os_version: number | null;
  os_patch_level: number | null;
  revocation_checked: boolean;
};

export type AttestationResult = { ok: true; summary: AttestationSummary } | { ok: false; error: AttestationError; detail?: string };

export type AttestationOptions = {
  /** Base64 certificates, leaf (our key) first, root last — what KeyStore.getCertificateChain gives. */
  chain: unknown;
  /** SPKI bytes of the key the phone registers. */
  publicKey: Uint8Array;
  /** The nonce the server issued for this registration. */
  challenge: string;
  packageName: string;
  /** SHA-256 digests (hex) of the app signing certificate. Empty = not checked. */
  signingDigests: string[];
  /** Trusted root keys (SPKI, base64). Default: Google's. Tests pass their own. */
  roots?: string[];
  /** Revoked certificate serials (lower-case hex, no leading zeros), or null when the list was not available. */
  revokedSerials?: Set<string> | null;
};

type Cert = {
  tbs: Uint8Array;
  sigAlg: string;
  signature: Uint8Array;
  serial: string;
  issuer: Uint8Array;
  subject: Uint8Array;
  spki: Uint8Array;
  extensions: Map<string, Uint8Array>;
};

const BASIC_CONSTRAINTS_OID = "2.5.29.19";
const KEY_USAGE_OID = "2.5.29.15";

/** basicConstraints cA (false when the extension is missing). */
function isCa(c: Cert): boolean {
  const v = c.extensions.get(BASIC_CONSTRAINTS_OID);
  if (!v) return false;
  const first = children(expect(parse(v), UNIVERSAL, T.SEQUENCE, "basic constraints"))[0];
  return is(first, UNIVERSAL, T.BOOLEAN) && bool(first);
}

/** keyUsage allows signing certificates (no keyUsage extension = no restriction, RFC 5280). */
function maySignCerts(c: Cert): boolean {
  const v = c.extensions.get(KEY_USAGE_OID);
  if (!v) return true;
  const n = expect(parse(v), UNIVERSAL, T.BIT_STRING, "key usage");
  // Bit 5 (keyCertSign) is 0x04 in the first byte after the "unused bits" byte.
  return n.value.length >= 2 && (n.value[1] & 0x04) !== 0;
}

export function serialHex(b: Uint8Array): string {
  return hex(b).replace(/^0+(?=.)/, "");
}

export function parseCertificate(der: Uint8Array): Cert {
  const cert = expect(parse(der), UNIVERSAL, T.SEQUENCE, "certificate");
  const [tbsNode, algNode, sigNode] = children(cert);
  const tbs = expect(tbsNode, UNIVERSAL, T.SEQUENCE, "tbsCertificate");
  const sigAlg = oid(expect(children(expect(algNode, UNIVERSAL, T.SEQUENCE, "signatureAlgorithm"))[0], UNIVERSAL, T.OID, "algorithm oid"));
  const signature = bits(expect(sigNode, UNIVERSAL, T.BIT_STRING, "signature"));
  const f = children(tbs);
  let i = 0;
  if (is(f[0], CONTEXT, 0)) i++; // version
  const serial = serialHex(expect(f[i++], UNIVERSAL, T.INTEGER, "serial").value);
  i++; // signature algorithm
  const issuer = expect(f[i++], UNIVERSAL, T.SEQUENCE, "issuer").raw;
  i++; // validity
  const subject = expect(f[i++], UNIVERSAL, T.SEQUENCE, "subject").raw;
  const spki = expect(f[i++], UNIVERSAL, T.SEQUENCE, "subjectPublicKeyInfo").raw;
  const extensions = new Map<string, Uint8Array>();
  for (; i < f.length; i++) {
    if (!is(f[i], CONTEXT, 3)) continue;
    const list = expect(children(f[i])[0], UNIVERSAL, T.SEQUENCE, "extensions");
    for (const ext of children(list)) {
      const parts = children(ext);
      const id = oid(expect(parts[0], UNIVERSAL, T.OID, "extension oid"));
      const value = expect(parts[parts.length - 1], UNIVERSAL, T.OCTET_STRING, "extension value").value;
      extensions.set(id, value);
    }
  }
  return { tbs: tbsNode.raw, sigAlg, signature, serial, issuer, subject, spki, extensions };
}

const HASH: Record<string, { kind: "rsa" | "ec"; hash: string }> = {
  "1.2.840.113549.1.1.11": { kind: "rsa", hash: "SHA-256" },
  "1.2.840.113549.1.1.12": { kind: "rsa", hash: "SHA-384" },
  "1.2.840.113549.1.1.13": { kind: "rsa", hash: "SHA-512" },
  "1.2.840.10045.4.3.2": { kind: "ec", hash: "SHA-256" },
  "1.2.840.10045.4.3.3": { kind: "ec", hash: "SHA-384" },
  "1.2.840.10045.4.3.4": { kind: "ec", hash: "SHA-512" },
};
const CURVES: Record<string, { name: string; size: number }> = {
  "1.2.840.10045.3.1.7": { name: "P-256", size: 32 },
  "1.3.132.0.34": { name: "P-384", size: 48 },
  "1.3.132.0.35": { name: "P-521", size: 66 },
};

/** DER ECDSA (SEQUENCE { r, s }) to r||s of [size] bytes each. */
function ecdsaRaw(der: Uint8Array, size: number): Uint8Array {
  const parts = children(expect(parse(der), UNIVERSAL, T.SEQUENCE, "ecdsa signature"));
  if (parts.length !== 2) throw new DerError("ecdsa parts");
  const out = new Uint8Array(size * 2);
  parts.forEach((n, i) => {
    let v = expect(n, UNIVERSAL, T.INTEGER, "ecdsa integer").value;
    while (v.length > size && v[0] === 0) v = v.subarray(1);
    if (v.length > size) throw new DerError("ecdsa integer size");
    out.set(v, i * size + size - v.length);
  });
  return out;
}

/** Is [cert] signed by the key [issuerSpki]? */
export async function signedBy(cert: Cert, issuerSpki: Uint8Array): Promise<boolean> {
  const alg = HASH[cert.sigAlg];
  if (!alg) return false;
  const keyAlg = children(expect(children(parse(issuerSpki))[0], UNIVERSAL, T.SEQUENCE, "spki algorithm"));
  const keyOid = oid(keyAlg[0]);
  try {
    if (alg.kind === "rsa") {
      if (keyOid !== "1.2.840.113549.1.1.1") return false;
      const key = await crypto.subtle.importKey("spki", issuerSpki, { name: "RSASSA-PKCS1-v1_5", hash: alg.hash }, false, ["verify"]);
      return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, cert.signature, cert.tbs);
    }
    if (keyOid !== "1.2.840.10045.2.1" || !keyAlg[1]) return false;
    const curve = CURVES[oid(keyAlg[1])];
    if (!curve) return false;
    const key = await crypto.subtle.importKey("spki", issuerSpki, { name: "ECDSA", namedCurve: curve.name }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "ECDSA", hash: alg.hash }, key, ecdsaRaw(cert.signature, curve.size), cert.tbs);
  } catch {
    return false;
  }
}

/** AuthorizationList (SEQUENCE of [tag] EXPLICIT values) as tag -> inner element. */
function authList(n: Node): Map<number, Node> {
  const out = new Map<number, Node>();
  for (const item of children(expect(n, UNIVERSAL, T.SEQUENCE, "authorization list"))) {
    if (item.cls !== CONTEXT) continue;
    out.set(item.tag, children(item)[0]);
  }
  return out;
}

function appId(n: Node | undefined): { packages: string[]; digests: string[] } {
  if (!n) return { packages: [], digests: [] };
  const inner = parse(expect(n, UNIVERSAL, T.OCTET_STRING, "attestation application id").value);
  const [infos, digests] = children(expect(inner, UNIVERSAL, T.SEQUENCE, "application id"));
  const dec = new TextDecoder();
  return {
    packages: infos ? children(infos).map((p) => dec.decode(expect(children(p)[0], UNIVERSAL, T.OCTET_STRING, "package name").value)) : [],
    digests: digests ? children(digests).map((d) => hex(d.value)) : [],
  };
}

export async function verifyAndroidAttestation(o: AttestationOptions): Promise<AttestationResult> {
  if (!Array.isArray(o.chain) || o.chain.length < 2 || o.chain.length > 8 || !o.chain.every((c) => typeof c === "string" && c.length < 12_000)) {
    return { ok: false, error: "attestation_parse", detail: "chain" };
  }
  let certs: Cert[];
  try {
    certs = (o.chain as string[]).map((c) => parseCertificate(b64decode(c)));
  } catch (e) {
    return { ok: false, error: "attestation_parse", detail: (e as Error).message };
  }

  // 1. Each certificate is signed by the next; the last one is a trusted root signed by itself.
  //    Every issuer must be a CA allowed to sign certificates, and only the leaf may carry a key description.
  //    Without this, the attested key of any real phone (a leaf, not a CA) could sign a forged "leaf"
  //    claiming whatever we want to see.
  try {
    for (let i = 0; i < certs.length; i++) {
      const issuer = i + 1 < certs.length ? certs[i + 1] : certs[i];
      if (!equal(certs[i].issuer, issuer.subject)) return { ok: false, error: "attestation_bad_chain", detail: `name ${i}` };
      if (i > 0 && (!isCa(certs[i]) || !maySignCerts(certs[i]))) return { ok: false, error: "attestation_bad_chain", detail: `not a CA ${i}` };
      if (i > 0 && certs[i].extensions.has(KEY_DESCRIPTION_OID)) return { ok: false, error: "attestation_bad_chain", detail: `key description ${i}` };
      if (!(await signedBy(certs[i], issuer.spki))) return { ok: false, error: "attestation_bad_chain", detail: `cert ${i}` };
    }
  } catch (e) {
    return { ok: false, error: "attestation_parse", detail: (e as Error).message };
  }
  const roots = (o.roots ?? GOOGLE_ROOT_KEYS).map(b64decode);
  if (!roots.some((r) => equal(r, certs[certs.length - 1].spki))) return { ok: false, error: "attestation_untrusted_root" };
  if (o.revokedSerials && certs.some((c) => o.revokedSerials!.has(c.serial))) return { ok: false, error: "attestation_revoked" };

  // 2. The leaf certifies the very key being registered.
  const leaf = certs[0];
  if (!equal(leaf.spki, o.publicKey)) return { ok: false, error: "attestation_key_mismatch" };

  // 3. The key description.
  const ext = leaf.extensions.get(KEY_DESCRIPTION_OID);
  if (!ext) return { ok: false, error: "attestation_parse", detail: "no key description" };
  let summary: AttestationSummary;
  try {
    const f = children(expect(parse(ext), UNIVERSAL, T.SEQUENCE, "key description"));
    const version = int(expect(f[0], UNIVERSAL, T.INTEGER, "attestation version"));
    const level = int(expect(f[1], UNIVERSAL, T.ENUMERATED, "attestation security level"));
    const kmLevel = int(expect(f[3], UNIVERSAL, T.ENUMERATED, "keymint security level"));
    const challenge = expect(f[4], UNIVERSAL, T.OCTET_STRING, "challenge").value;
    const sw = authList(f[6]);
    const hw = authList(f[7]);

    if (!equal(challenge, new TextEncoder().encode(o.challenge))) return { ok: false, error: "attestation_challenge" };
    if (level < 1 || kmLevel < 1) return { ok: false, error: "attestation_software_key" };
    if (hw.has(TAG_ALGORITHM) && int(hw.get(TAG_ALGORITHM)!) !== ALGORITHM_EC) return { ok: false, error: "attestation_key_mismatch", detail: "algorithm" };
    if (hw.has(TAG_EC_CURVE) && int(hw.get(TAG_EC_CURVE)!) !== CURVE_P256) return { ok: false, error: "attestation_key_mismatch", detail: "curve" };

    // Strong biometric only: no "no auth required", biometric bit set, password bit not set — enforced by hardware.
    const authType = hw.has(TAG_USER_AUTH_TYPE) ? int(hw.get(TAG_USER_AUTH_TYPE)!) : 0;
    if (hw.has(TAG_NO_AUTH_REQUIRED) || sw.has(TAG_NO_AUTH_REQUIRED) || !(authType & AUTH_FINGERPRINT) || authType & AUTH_PASSWORD) {
      return { ok: false, error: "attestation_no_biometric" };
    }

    const rot = hw.get(TAG_ROOT_OF_TRUST);
    if (!rot) return { ok: false, error: "attestation_device_unlocked", detail: "no root of trust" };
    const rotF = children(expect(rot, UNIVERSAL, T.SEQUENCE, "root of trust"));
    const locked = bool(expect(rotF[1], UNIVERSAL, T.BOOLEAN, "device locked"));
    const boot = int(expect(rotF[2], UNIVERSAL, T.ENUMERATED, "verified boot state"));
    if (!locked || boot !== 0) return { ok: false, error: "attestation_device_unlocked" };

    const app = appId(sw.get(TAG_APPLICATION_ID) ?? hw.get(TAG_APPLICATION_ID));
    if (!app.packages.includes(o.packageName)) return { ok: false, error: "attestation_wrong_app" };
    const wanted = o.signingDigests.map((d) => d.toLowerCase().replace(/[^0-9a-f]/g, "")).filter(Boolean);
    if (wanted.length && !app.digests.some((d) => wanted.includes(d))) return { ok: false, error: "attestation_wrong_app", detail: "signing certificate" };

    summary = {
      attestation_version: version,
      security_level: SECURITY_LEVEL[level] ?? String(level),
      keymint_security_level: SECURITY_LEVEL[kmLevel] ?? String(kmLevel),
      boot_state: BOOT_STATE[boot] ?? String(boot),
      device_locked: locked,
      user_auth_type: authType,
      auth_timeout: hw.has(TAG_AUTH_TIMEOUT) ? int(hw.get(TAG_AUTH_TIMEOUT)!) : null,
      packages: app.packages,
      signing_digests: app.digests,
      os_version: hw.has(TAG_OS_VERSION) ? int(hw.get(TAG_OS_VERSION)!) : null,
      os_patch_level: hw.has(TAG_OS_PATCH_LEVEL) ? int(hw.get(TAG_OS_PATCH_LEVEL)!) : null,
      revocation_checked: !!o.revokedSerials,
    };
  } catch (e) {
    return { ok: false, error: "attestation_parse", detail: (e as Error).message };
  }
  return { ok: true, summary };
}

/** Google's revocation list (https://android.googleapis.com/attestation/status) as a set of serials. */
export function revokedFromStatus(json: unknown): Set<string> | null {
  const entries = (json as { entries?: Record<string, { status?: string }> } | null)?.entries;
  if (!entries || typeof entries !== "object") return null;
  const out = new Set<string>();
  for (const [serial, e] of Object.entries(entries)) {
    if (e?.status === "REVOKED" || e?.status === "SUSPENDED") out.add(serial.toLowerCase().replace(/^0+(?=.)/, ""));
  }
  return out;
}
