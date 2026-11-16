// Device binding refused sign-in (PRD 3.1): one account = one phone; only the system admin can
// release the old binding. Explains which case it is and what to do; the only action is sign out.
import { useState } from 'react';
import { View } from 'react-native';
import { Button, Card, Header, Icon, Screen, Txt, useSnackbar } from '../components/ui';
import { useSession } from '../lib/session';
import { useSettings } from '../lib/settings';
import { space } from '../lib/theme';

export default function BlockedScreen() {
  const { t, c } = useSettings();
  const { blockedCode, profile, signOut } = useSession();
  const snack = useSnackbar();
  const [busy, setBusy] = useState(false);
  const taken = blockedCode === 'device_taken';

  async function leave() {
    setBusy(true);
    try {
      await signOut();
    } catch {
      setBusy(false);
      snack(t('error_generic'), 'danger');
    }
  }

  return (
    <>
      <Header title={t('device_blocked_title')} />
      <Screen footer={<Button label={t('sign_out')} icon="log-out-outline" onPress={leave} loading={busy} size="lg" testID="blocked-sign-out" />}>
        <View style={{ alignItems: 'center', gap: space.md, paddingTop: space.xl }}>
          <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={taken ? 'people-outline' : 'phone-portrait-outline'} size={40} tone="danger" />
          </View>
          <Txt variant="title" center testID="blocked-title">
            {t(taken ? 'auth_blocked_taken_title' : 'auth_blocked_other_title')}
          </Txt>
          <Txt tone="muted" center>{t(taken ? 'error_device_taken' : 'error_other_device')}</Txt>
          {profile ? (
            <Txt variant="caption" tone="muted" center>{t('auth_file_label', { n: profile.fileNumber })}</Txt>
          ) : null}
        </View>

        <Card>
          <View style={{ gap: space.xs }}>
            <Txt variant="heading">{t('auth_what_to_do')}</Txt>
            <Txt>{t(taken ? 'auth_blocked_taken_step' : 'auth_blocked_other_step')}</Txt>
          </View>
        </Card>
      </Screen>
    </>
  );
}
