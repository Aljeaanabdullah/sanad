// JS side of the local native module (android/ + ios/ here, linked by Expo autolinking at `expo prebuild`).
// Missing in Expo Go, the web preview and Jest: isAvailable() is then false and the app falls back to
// Face ID / fingerprint without a signature (the server records "missing" or refuses, per the owner's switch).
import { requireOptionalNativeModule } from 'expo';

export type SignResult = { ok: true; signature: string } | { ok: false; error: string };
export type GeneratedKey = { publicKey: string; attestation?: string[] };

type Native = {
  hasKey(alias: string): Promise<boolean>;
  deleteKey(alias: string): Promise<void>;
  generateKey(alias: string, challenge: string): Promise<GeneratedKey>;
  sign(alias: string, payload: string, title: string, cancel: string): Promise<SignResult>;
};

const native = requireOptionalNativeModule<Native>('SanadDeviceKey');

export function isAvailable(): boolean {
  return native != null;
}

export async function hasKey(alias: string): Promise<boolean> {
  return native ? native.hasKey(alias) : false;
}

export async function deleteKey(alias: string): Promise<void> {
  if (native) await native.deleteKey(alias);
}

/** Makes a new key (replacing any old one under [alias]). Android also returns the attestation chain for [challenge]. */
export async function generateKey(alias: string, challenge: string): Promise<GeneratedKey> {
  if (!native) throw Object.assign(new Error('not_available'), { code: 'not_available' });
  return native.generateKey(alias, challenge);
}

/** Shows the Face ID / fingerprint prompt and signs [payload] (UTF-8) with the key. */
export async function sign(alias: string, payload: string, title: string, cancel: string): Promise<SignResult> {
  if (!native) return { ok: false, error: 'not_available' };
  try {
    return await native.sign(alias, payload, title, cancel);
  } catch {
    return { ok: false, error: 'unknown' };
  }
}
