// Minimal DER (ASN.1) reader: enough for X.509 certificates and the Android Key Attestation extension.
// No dependencies, so it runs the same in the Edge runtime (Deno) and in the Node tests.

export type Node = {
  /** 0 universal, 1 application, 2 context-specific, 3 private. */
  cls: number;
  constructed: boolean;
  /** Tag number (high-tag-number form supported, e.g. [704] in the attestation extension). */
  tag: number;
  /** The whole element (header + content). */
  raw: Uint8Array;
  /** Content bytes only. */
  value: Uint8Array;
};

export const UNIVERSAL = 0;
export const CONTEXT = 2;
export const T = { BOOLEAN: 1, INTEGER: 2, BIT_STRING: 3, OCTET_STRING: 4, NULL: 5, OID: 6, ENUMERATED: 10, SEQUENCE: 16, SET: 17 } as const;

export class DerError extends Error {}

/** Reads one element starting at [offset]; returns it and where the next one starts. */
export function readNode(buf: Uint8Array, offset = 0): { node: Node; next: number } {
  let p = offset;
  const need = (n: number) => {
    if (p + n > buf.length) throw new DerError("truncated");
  };
  need(1);
  const first = buf[p++];
  const cls = first >> 6;
  const constructed = (first & 0x20) !== 0;
  let tag = first & 0x1f;
  if (tag === 0x1f) {
    tag = 0;
    for (let i = 0; ; i++) {
      need(1);
      const b = buf[p++];
      tag = tag * 128 + (b & 0x7f);
      if ((b & 0x80) === 0) break;
      if (i > 4) throw new DerError("tag too long");
    }
  }
  need(1);
  let len = buf[p++];
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 4) throw new DerError("bad length");
    need(n);
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + buf[p++];
  }
  need(len);
  const node: Node = { cls, constructed, tag, raw: buf.subarray(offset, p + len), value: buf.subarray(p, p + len) };
  return { node, next: p + len };
}

export function parse(buf: Uint8Array): Node {
  const { node, next } = readNode(buf, 0);
  if (next !== buf.length) throw new DerError("trailing bytes");
  return node;
}

/** Children of a constructed element (SEQUENCE, SET, explicit tags). */
export function children(n: Node): Node[] {
  const out: Node[] = [];
  let p = 0;
  while (p < n.value.length) {
    const r = readNode(n.value, p);
    out.push(r.node);
    p = r.next;
  }
  return out;
}

export function is(n: Node | undefined, cls: number, tag: number): n is Node {
  return !!n && n.cls === cls && n.tag === tag;
}

export function expect(n: Node | undefined, cls: number, tag: number, what: string): Node {
  if (!is(n, cls, tag)) throw new DerError(`expected ${what}`);
  return n;
}

/** Small non-negative INTEGER / ENUMERATED as a number (attestation versions, levels, tags). */
export function int(n: Node): number {
  if (n.value.length === 0 || n.value.length > 6) throw new DerError("integer size");
  let v = 0;
  for (const b of n.value) v = v * 256 + b;
  if (n.value[0] & 0x80) throw new DerError("negative integer");
  return v;
}

export function bool(n: Node): boolean {
  if (n.value.length !== 1) throw new DerError("boolean size");
  return n.value[0] !== 0;
}

export function oid(n: Node): string {
  const v = n.value;
  if (v.length === 0) throw new DerError("empty oid");
  const parts: number[] = [];
  const first = v[0];
  parts.push(first < 80 ? Math.floor(first / 40) : 2, first < 80 ? first % 40 : first - 80);
  let acc = 0;
  for (let i = 1; i < v.length; i++) {
    acc = acc * 128 + (v[i] & 0x7f);
    if ((v[i] & 0x80) === 0) {
      parts.push(acc);
      acc = 0;
    }
  }
  return parts.join(".");
}

/** BIT STRING content without the "unused bits" byte (always 0 for keys and signatures). */
export function bits(n: Node): Uint8Array {
  if (n.value.length === 0 || n.value[0] !== 0) throw new DerError("bit string");
  return n.value.subarray(1);
}

export function hex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export function b64decode(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

export function b64encode(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

export function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}
