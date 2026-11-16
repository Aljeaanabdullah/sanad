// Thin wrappers over the native modules the punch flow uses (network, location, root check,
// Face ID / fingerprint, image resize) and the call to the punch function. Logic lives in punch.ts.
import NetInfo, { NetInfoStateType } from '@react-native-community/netinfo';
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';
import * as Device from 'expo-device';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Location from 'expo-location';
import { Linking } from 'react-native';
import {
  biometricTypeOf,
  parsePunchError,
  parsePunchResult,
  PHOTO_COMPRESS,
  PHOTO_MAX_BYTES,
  PHOTO_WIDTH,
  photoTooBig,
  type BiometricType,
  type PunchBody,
  type PunchOutcome,
} from './punch';
import { supabase } from './supabase';

const LOCATION_TIMEOUT_MS = 20_000;
/** The send step blocks Back, so it must always end. */
const SEND_TIMEOUT_MS = 30_000;

export async function network(): Promise<{ online: boolean; vpn: boolean }> {
  try {
    const s = await NetInfo.fetch();
    // isInternetReachable is null while unknown: only a clear "false" means offline.
    const online = s.isConnected !== false && s.isInternetReachable !== false;
    return { online, vpn: s.type === NetInfoStateType.vpn };
  } catch {
    return { online: true, vpn: false };
  }
}

export type Permission = 'granted' | 'ask' | 'blocked' | 'approximate';

/** Foreground location permission; asks once when it can. */
export async function locationPermission(ask: boolean): Promise<Permission> {
  let p = await Location.getForegroundPermissionsAsync();
  if (!p.granted && p.canAskAgain && ask) p = await Location.requestForegroundPermissionsAsync();
  // "Approximate" (Android) / "Precise: off" (iOS) is too coarse for a site check: the server would refuse every punch.
  if (p.granted) return p.android?.accuracy === 'coarse' || p.ios?.accuracy === 'reduced' ? 'approximate' : 'granted';
  return p.canAskAgain ? 'ask' : 'blocked';
}

export async function locationServicesOn(): Promise<boolean> {
  try {
    return await Location.hasServicesEnabledAsync();
  } catch {
    return true;
  }
}

/** One high-accuracy reading, now (no background tracking). */
export async function readLocation(): Promise<{ lat: number; lng: number; accuracy: number; mocked: boolean }> {
  const read = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('location_timeout')), LOCATION_TIMEOUT_MS));
  const pos = await Promise.race([read, timeout]);
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy ?? Number.NaN,
    // Android sets this when the reading comes from a mock-location app.
    mocked: pos.mocked === true,
  };
}

/** Root / jailbreak check. Development builds on an emulator report false (as the old app did); release builds always check. */
export async function rooted(): Promise<boolean> {
  if (__DEV__ && !Device.isDevice) return false;
  try {
    return await Device.isRootedExperimentalAsync();
  } catch {
    return false;
  }
}

/** `weak`: only a Class-2 biometric is set up (e.g. camera face unlock that a photo can fool) — not accepted. */
export async function biometricInfo(): Promise<{ ready: boolean; weak: boolean; type: BiometricType | null }> {
  try {
    const [hardware, enrolled, types, level] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
      LocalAuthentication.getEnrolledLevelAsync(),
    ]);
    const strong = level >= LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG;
    return { ready: hardware && enrolled && strong, weak: hardware && enrolled && !strong, type: biometricTypeOf(types as number[]) };
  } catch {
    return { ready: false, weak: false, type: null };
  }
}

/** Face ID / fingerprint only: the phone passcode cannot replace it. */
export async function authenticate(promptMessage: string, cancelLabel: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel,
      disableDeviceFallback: true,
      // Android: Class-3 only (fingerprint / secure face); iOS: no "Enter Password" button.
      biometricsSecurityLevel: 'strong',
      fallbackLabel: '',
    });
    return r.success ? { ok: true } : { ok: false, error: r.error };
  } catch {
    return { ok: false, error: 'unknown' };
  }
}

/** Resizes the camera picture to a small JPEG (base64), smaller again if still too big. */
export async function shrinkPhoto(uri: string): Promise<string | null> {
  for (const [width, compress] of [[PHOTO_WIDTH, PHOTO_COMPRESS], [360, 0.45]] as const) {
    const ref = await ImageManipulator.manipulate(uri).resize({ width }).renderAsync();
    const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress, base64: true });
    if (out.base64 && !photoTooBig(out.base64, PHOTO_MAX_BYTES)) return out.base64;
  }
  return null;
}

/** Sends the punch. Never throws: network and HTTP failures come back as `kind: 'error'`. */
export async function sendPunch(body: PunchBody): Promise<PunchOutcome> {
  try {
    const { data, error } = await supabase.functions.invoke('punch', { body, timeout: SEND_TIMEOUT_MS });
    if (!error) return parsePunchResult(data);
    if (error instanceof FunctionsHttpError) {
      const res = error.context as Response | undefined;
      let json: unknown = null;
      try {
        json = await res?.json();
      } catch {
        json = null;
      }
      const out = parsePunchError(json);
      if (out.kind === 'error' && out.code === 'generic' && res?.status === 401) return { ...out, code: 'not_signed_in' };
      return out;
    }
    if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) return { kind: 'error', code: 'no_internet', unlockAt: null };
    return { kind: 'error', code: 'generic', unlockAt: null };
  } catch {
    return { kind: 'error', code: 'no_internet', unlockAt: null };
  }
}

export function openSettings() {
  Linking.openSettings().catch(() => {});
}
