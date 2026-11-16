// Sign in with the file number (6 digits) and password (PRD 3). On success the session decides
// the next screen (blocked / change password / consent / app) through the guards in _layout.
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, View, type TextInputInstance } from 'react-native';
import { LoginHero } from '../components/auth/Brand';
import { cleanFileNumber, FILE_NUMBER_LENGTH, isFileNumber } from '../components/auth/fileNumber';
import { PasswordField } from '../components/auth/PasswordField';
import { useKeyboardShown } from '../components/auth/useKeyboardShown';
import { Button, Field, Notice, Screen, Txt } from '../components/ui';
import { AuthFailure, signIn } from '../lib/auth';
import { useSession } from '../lib/session';
import { useSettings } from '../lib/settings';
import { space } from '../lib/theme';

export default function LoginScreen() {
  const { t, c } = useSettings();
  const { afterSignIn } = useSession();
  const keyboard = useKeyboardShown();
  const passwordRef = useRef<TextInputInstance>(null);

  const [fileNumber, setFileNumber] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  /** A refusal from the server, as an `error_<code>` key suffix. */
  const [failure, setFailure] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    const badFile = !isFileNumber(fileNumber);
    const noPassword = password.length === 0;
    setFileError(badFile ? t('error_invalid_file_number') : null);
    setPasswordError(noPassword ? t('error_missing_password') : null);
    setFailure(null);
    if (badFile || noPassword) return;

    setBusy(true);
    try {
      const profile = await signIn(fileNumber, password);
      await afterSignIn(profile);
      // The guard now replaces this screen.
    } catch (e) {
      setFailure(e instanceof AuthFailure ? e.code : 'generic');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <LoginHero folded={keyboard} />
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <Screen
          footer={<Button label={t('sign_in')} onPress={submit} loading={busy} size="lg" icon="log-in-outline" testID="login-submit" />}
        >
          <View style={{ gap: space.xs }}>
            <Txt variant="title">{t('sign_in')}</Txt>
            <Txt tone="muted">{t('auth_login_hint')}</Txt>
          </View>

          <Field
            testID="login-file-number"
            label={t('file_number')}
            helper={t('auth_file_number_helper')}
            error={fileError}
            value={fileNumber}
            onChangeText={(text) => {
              setFileNumber(cleanFileNumber(text));
              setFileError(null);
              setFailure(null);
            }}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={FILE_NUMBER_LENGTH}
            autoComplete="username"
            textContentType="username"
            autoCorrect={false}
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            submitBehavior="submit"
            editable={!busy}
          />

          <PasswordField
            ref={passwordRef}
            testID="login-password"
            label={t('password')}
            error={passwordError}
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              setPasswordError(null);
              setFailure(null);
            }}
            visible={visible}
            onToggleVisible={() => setVisible((v) => !v)}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
            editable={!busy}
          />

          {failure ? <Notice tone="danger" text={t(`error_${failure}`)} /> : null}

          <Txt variant="caption" tone="muted">{t('auth_forgot')}</Txt>
        </Screen>
      </KeyboardAvoidingView>
    </View>
  );
}
