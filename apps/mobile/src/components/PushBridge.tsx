// Mounted once inside the signed-in app: keeps this phone's push token on the server (start, language
// change, token refresh) and opens the right screen when a notification is tapped (also from a cold start).
import * as Notifications from 'expo-notifications';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';
import { markNotificationsRead } from '../lib/api';
import { fromPushData } from '../lib/notify';
import { registerPush, responseData } from '../lib/push';
import { useSettings } from '../lib/settings';

export function PushBridge() {
  const { lang } = useSettings();
  const router = useRouter();
  const last = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    registerPush(lang).catch(() => {});
    // Use the token the event carries: asking for it again would fire this listener again (a loop on Android).
    const sub = Notifications.addPushTokenListener((t) => {
      registerPush(lang, typeof t.data === 'string' ? t.data : undefined).catch(() => {});
    });
    return () => sub.remove();
  }, [lang]);

  useEffect(() => {
    if (!last || last.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const key = last.notification.request.identifier;
    if (handled.current === key) return;
    handled.current = key;
    const p = fromPushData(responseData(last));
    Notifications.clearLastNotificationResponseAsync().catch(() => {});
    if (!p) return;
    if (p.id) markNotificationsRead([p.id]).catch(() => {});
    // Let the tabs mount first on a cold start. Not cancelled on re-render: clearing the response re-runs this.
    setTimeout(() => router.push(p.route as Href), 0);
  }, [last, router]);

  return null;
}
