// PRD 4.7: the phone's signing key. Made once after the phone is bound (no prompt needed to make it),
// registered with the server (Android sends Google's Key Attestation), then every punch is signed with it
// behind Face ID / fingerprint. Native part: modules/sanad-device-key.
import { FunctionsHttpError } from '@supabase/supabase-js';
import * as Crypto from 'expo-crypto';
import * as DeviceKey from '../../modules/sanad-device-key';
import { signingPayload, type PunchBody } from './punch';
import { supabase } from './supabase';

export const KEY_ALIAS = 'sanad-punch-v1';

export type KeyState = 'ready' | 'registered' | 'unavailable' | 'needs_reset' | 'failed';

let ensuring: Promise<KeyState> | null = null;

/**
 * Makes sure this phone has a registered key. Never throws. 'needs_reset': the server has a key but this
 * phone lost it (new fingerprint / face added): only the admin can unbind the phone so a new key can be made.
 */
export function ensureDeviceKey(): Promise<KeyState> {
  ensuring ??= run().finally(() => {
    ensuring = null;
  });
  return ensuring;
}

async function run(): Promise<KeyState> {
  if (!DeviceKey.isAvailable()) return 'unavailable';
  try {
    const { data: state, error } = await supabase.rpc('device_key_state');
    if (error || typeof state !== 'string' || state === 'no_device') return 'failed';
    const local = await DeviceKey.hasKey(KEY_ALIAS);
    if (state === 'attested' || state === 'unattested') return local ? 'ready' : 'needs_reset';

    // Bound, no key on the server: make a new one (any old local key is replaced) and register it.
    const { data: nonce, error: nonceError } = await supabase.rpc('device_challenge', { p_purpose: 'bind_key' });
    if (nonceError || typeof nonce !== 'string') return 'failed';
    let key: DeviceKey.GeneratedKey;
    try {
      key = await DeviceKey.generateKey(KEY_ALIAS, nonce);
    } catch {
      // No fingerprint / face set up yet: tried again at the next punch.
      return 'unavailable';
    }
    const { error: saveError } = await supabase.functions.invoke('device-key', {
      body: { nonce, public_key: key.publicKey, attestation: key.attestation },
    });
    if (!saveError) return 'registered';
    if (saveError instanceof FunctionsHttpError) {
      const code = await saveError.context.json().then((j: { error?: string }) => j?.error).catch(() => null);
      if (code === 'key_exists') return 'needs_reset';
    }
    // Refused (e.g. attestation failed): drop the local key so a later try starts clean.
    await DeviceKey.deleteKey(KEY_ALIAS).catch(() => {});
    return 'failed';
  } catch {
    return 'failed';
  }
}

export type PunchSign =
  | { kind: 'signed'; signature: { nonce: string; value: string } }
  /** No usable key (old build, web, not registered yet): the caller does plain Face ID / fingerprint instead. */
  | { kind: 'no_key' }
  | { kind: 'failed'; error: string };

/** SHA-256 (base64) of the photo's base64 text, as the server computes it. */
export function photoHash(photoB64: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, photoB64, { encoding: Crypto.CryptoEncoding.BASE64 });
}

/** Gets a nonce and signs the punch body behind the Face ID / fingerprint prompt. */
export async function signPunch(body: PunchBody, title: string, cancel: string): Promise<PunchSign> {
  if (!DeviceKey.isAvailable()) return { kind: 'no_key' };
  let state = (await DeviceKey.hasKey(KEY_ALIAS).catch(() => false)) ? 'ready' : await ensureDeviceKey();
  if (state === 'registered') state = 'ready';
  if (state !== 'ready') return { kind: 'no_key' };
  const { data: nonce, error } = await supabase.rpc('device_challenge', { p_purpose: 'punch' });
  if (error || typeof nonce !== 'string') return { kind: 'failed', error: 'no_internet' };
  const payload = signingPayload(body, nonce, await photoHash(body.photo));
  const r = await DeviceKey.sign(KEY_ALIAS, payload, title, cancel);
  if (r.ok) return { kind: 'signed', signature: { nonce, value: r.signature } };
  // The key is gone (new fingerprint / face): fall back to plain Face ID; the server decides.
  if (r.error === 'no_key' || r.error === 'key_invalidated') return { kind: 'no_key' };
  return { kind: 'failed', error: r.error };
}
