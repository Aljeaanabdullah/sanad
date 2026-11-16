// Home: asks for notification permission with a clear reason first (never on first launch: Home is
// only reached after sign-in and consent). "Not now" hides it for 7 days; denied for good -> open Settings.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { promptState, type PromptState } from '../../lib/notify';
import { askPermission, dismissPrompt, getPermission, isPhone, openSystemSettings, promptDismissedAt, registerPush } from '../../lib/push';
import { useSettings } from '../../lib/settings';
import { space } from '../../lib/theme';
import { Button, Card, Icon, Row, Txt, useSnackbar } from '../ui';

export function NotifyCard() {
  const { t, lang } = useSettings();
  const snack = useSnackbar();
  const [state, setState] = useState<PromptState>('hidden');
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    const [perm, dismissedAt] = await Promise.all([getPermission(), promptDismissedAt()]);
    setState(promptState(perm, { isDevice: isPhone(), dismissedAt, now: Date.now() }));
  }, []);

  useFocusEffect(
    useCallback(() => {
      check().catch(() => {});
    }, [check]),
  );

  if (state === 'hidden') return null;

  const enable = async () => {
    setBusy(true);
    const p = await askPermission();
    setBusy(false);
    if (p?.status === 'granted') {
      registerPush(lang).catch(() => {});
      snack(t('push_enabled'), 'ok');
      setState('hidden');
    } else {
      snack(t('push_denied'));
      await dismissPrompt();
      setState('hidden');
    }
  };
  const later = async () => {
    await dismissPrompt();
    setState('hidden');
  };

  return (
    <Card testID="notify-card">
      <Row gap={space.md} align="flex-start">
        <Icon name="notifications-outline" tone="accent" size={24} />
        <View style={{ flex: 1, gap: space.xs }}>
          <Txt variant="heading">{t('push_card_title')}</Txt>
          <Txt tone="muted">{state === 'ask' ? t('push_card_body') : t('push_card_blocked')}</Txt>
        </View>
      </Row>
      <Row gap={space.sm} style={{ marginTop: space.md }}>
        <View style={{ flex: 1 }}>
          <Button
            label={state === 'ask' ? t('push_card_enable') : t('push_card_settings')}
            onPress={state === 'ask' ? enable : () => openSystemSettings()}
            loading={busy}
            testID="notify-enable"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button label={t('push_card_later')} kind="ghost" onPress={later} testID="notify-later" />
        </View>
      </Row>
    </Card>
  );
}
