import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Name kept from the project's old name: renaming it would give every phone a new id (and a new binding).
const KEY = 'jahez_device_id';

/**
 * A random id created once per install and kept in the phone's secure storage (Keystore / Keychain).
 * Reinstalling may create a new id; then the system admin unbinds the old phone (PRD 3.1).
 */
export async function deviceId(): Promise<string> {
  try {
    const existing = await SecureStore.getItemAsync(KEY);
    if (existing && existing.length >= 8) return existing;
    const created = Crypto.randomUUID();
    await SecureStore.setItemAsync(KEY, created);
    return created;
  } catch {
    // Web preview has no secure store: keep a per-session id.
    return (globalThis as { __sanadDevice?: string }).__sanadDevice ??= Crypto.randomUUID();
  }
}

export const platform: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android';

export function model(): string {
  return [Device.manufacturer, Device.modelName].filter(Boolean).join(' ') || 'unknown';
}
