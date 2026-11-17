// Push notifications, native part (PRD 9): Android channels, permission, this phone's token on the server.
// The server sends with FCM (edge function send-push). Without google-services.json in the build (no
// Firebase), getting the token fails quietly: the app works, the phone just gets no push.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';
import type { Lang } from './i18n';
import type { PermissionInfo } from './notify';
import { note } from './net';
import { supabase } from './supabase';

/** Same ids as the server (send-push CHANNEL_NORMAL / CHANNEL_EMERGENCY). */
export const CHANNEL = 'sanad';
export const CHANNEL_EMERGENCY = 'sanad-emergency';
const TOKEN_KEY = 'sanad_push_token_v1';
const DISMISS_KEY = 'sanad_push_prompt_dismissed_v1';

// A notification that arrives while the app is open is still shown as a banner.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

let channelsReady = false;
/** Android 8+: the channel decides importance and sound. Safe to call many times. */
export async function setupChannels(): Promise<void> {
  if (Platform.OS !== 'android' || channelsReady) return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'سند',
    description: 'تذكير الورديات وحالة الطلبات والمكافأة · Shift reminders, requests and bonus',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#1fa89c',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
  await Notifications.setNotificationChannelAsync(CHANNEL_EMERGENCY, {
    name: 'سند — طوارئ',
    description: 'تنبيهات الطوارئ والإخلاء · Emergency and evacuation alerts',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 600, 300, 600, 300, 600],
    lightColor: '#E5484D',
    bypassDnd: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  channelsReady = true;
}

export async function getPermission(): Promise<PermissionInfo | null> {
  try {
    const p = await Notifications.getPermissionsAsync();
    return { status: p.status as PermissionInfo['status'], canAskAgain: p.canAskAgain };
  } catch {
    return null;
  }
}

/** Shows the system prompt (only after our explanation card). */
export async function askPermission(): Promise<PermissionInfo | null> {
  try {
    await setupChannels(); // Android 13 asks when the first channel exists
    const p = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } });
    return { status: p.status as PermissionInfo['status'], canAskAgain: p.canAskAgain };
  } catch {
    return null;
  }
}

export const isPhone = () => Device.isDevice && (Platform.OS === 'android' || Platform.OS === 'ios');

export type RegisterResult = 'registered' | 'no_permission' | 'unsupported' | 'unavailable' | 'failed';

// What this app run already sent (token + language). Android's getDevicePushTokenAsync also fires the
// push-token listener with the same token every time, so without this check the listener and
// registerPush call each other forever (thousands of RPCs that starve every other request).
let sentKey: string | null = null;

/**
 * Sends this phone's token to the server (after sign-in, on every app start, when the language changes,
 * and when the token listener gives a new token). The same token and language go out once per app run.
 */
export async function registerPush(lang: Lang, knownToken?: string): Promise<RegisterResult> {
  if (!isPhone()) return 'unsupported';
  const perm = await getPermission();
  if (perm?.status !== 'granted') return 'no_permission';
  let token: string;
  if (typeof knownToken === 'string') {
    token = knownToken;
  } else {
    try {
      await setupChannels();
      token = (await Notifications.getDevicePushTokenAsync()).data as string;
    } catch {
      return 'unavailable'; // e.g. a build without Firebase (google-services.json)
    }
  }
  if (typeof token !== 'string' || token.length < 20) return 'unavailable';
  const key = `${token}|${lang}`;
  if (sentKey === key) {
    note('push token: already sent', 'skipped');
    return 'registered';
  }
  sentKey = key; // set before the call: a listener firing meanwhile does not send it again
  const { error } = await supabase.rpc('register_push_token', {
    p_token: token,
    p_platform: Platform.OS === 'ios' ? 'ios' : 'android',
    p_lang: lang,
  });
  if (error) {
    if (sentKey === key) sentKey = null; // try again next time
    return 'failed';
  }
  await AsyncStorage.setItem(TOKEN_KEY, token).catch(() => {});
  return 'registered';
}

/** Before sign-out: this phone stops getting the account's notifications. */
export async function unregisterPush(): Promise<void> {
  sentKey = null; // the next sign-in sends the token again
  const token = await AsyncStorage.getItem(TOKEN_KEY).catch(() => null);
  if (!token) return;
  await supabase.rpc('unregister_push_token', { p_token: token }).then(() => {}, () => {});
  await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
}

export async function promptDismissedAt(): Promise<number | null> {
  const v = await AsyncStorage.getItem(DISMISS_KEY).catch(() => null);
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}
export const dismissPrompt = () => AsyncStorage.setItem(DISMISS_KEY, String(Date.now())).catch(() => {});
export const openSystemSettings = () => Linking.openSettings().catch(() => {});

/** The data of a tapped notification, from either the shown notification or the FCM message behind it. */
export function responseData(r: Notifications.NotificationResponse): Record<string, unknown> {
  const content = (r.notification.request.content.data ?? {}) as Record<string, unknown>;
  const trigger = r.notification.request.trigger as { remoteMessage?: { data?: Record<string, string> } } | null;
  return { ...(trigger?.remoteMessage?.data ?? {}), ...content };
}
