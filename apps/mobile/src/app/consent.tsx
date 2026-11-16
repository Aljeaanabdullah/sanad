// Consent before the first punch (PRD 11, 4.6): location at punch time only, device Face ID /
// fingerprint (never stored), and a review photo at each punch kept 3 months. Saved with its date.
// Declining means the app cannot be used, so it asks, then signs out.
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { Button, Card, Header, Icon, Notice, Row, Screen, Txt, useSnackbar } from '../components/ui';
import { useSession } from '../lib/session';
import { useSettings } from '../lib/settings';
import { space } from '../lib/theme';

export default function ConsentScreen() {
  const { t } = useSettings();
  const { consentGiven, signOut } = useSession();
  const snack = useSnackbar();
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function accept() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await consentGiven();
      // The guard now opens the app.
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  function decline() {
    Alert.alert(t('auth_consent_decline'), t('auth_consent_decline_confirm'), [
      { text: t('no'), style: 'cancel' },
      {
        text: t('sign_out'),
        style: 'destructive',
        onPress: async () => {
          setLeaving(true);
          try {
            await signOut();
          } catch {
            setLeaving(false);
            snack(t('error_generic'), 'danger');
          }
        },
      },
    ]);
  }

  return (
    <>
      <Header title={t('consent_title')} />
      <Screen
        footer={
          <View style={{ gap: space.sm }}>
            <Button label={t('consent_accept')} icon="checkmark" onPress={accept} loading={busy} disabled={leaving} size="lg" testID="consent-accept" />
            <Button label={t('auth_consent_decline')} kind="ghost" onPress={decline} loading={leaving} disabled={busy} testID="consent-decline" />
          </View>
        }
      >
        <Row gap={space.sm}>
          <Icon name="shield-checkmark-outline" size={26} tone="accent" />
          <Txt variant="heading" style={{ flex: 1 }}>{t('auth_consent_heading')}</Txt>
        </Row>
        <Card>
          <Txt testID="consent-body">{t('consent_body_sanad')}</Txt>
        </Card>
        <Txt variant="caption" tone="muted">{t('auth_consent_note')}</Txt>
        {failed ? <Notice tone="danger" text={t('auth_consent_failed')} /> : null}
      </Screen>
    </>
  );
}
