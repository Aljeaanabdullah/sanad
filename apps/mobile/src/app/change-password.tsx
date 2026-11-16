// First sign-in (PRD 3): the employee must replace the password the admin typed. No back and no
// skip; the only other way out is signing out. Rules match the change-password function.
import { useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, View, type TextInputInstance } from 'react-native';
import { PasswordField } from '../components/auth/PasswordField';
import { RuleChecklist } from '../components/auth/RuleChecklist';
import { Button, Header, Notice, Screen, Txt, useSnackbar } from '../components/ui';
import { AuthFailure, changePassword } from '../lib/auth';
import { newPasswordProblem, passwordChecklist } from '../lib/passwordRules';
import { useSession } from '../lib/session';
import { useSettings } from '../lib/settings';
import { space } from '../lib/theme';

export default function ChangePasswordScreen() {
  const { t, c } = useSettings();
  const { profile, passwordChanged, signOut } = useSession();
  const snack = useSnackbar();
  const confirmRef = useRef<TextInputInstance>(null);
  const fileNumber = profile?.fileNumber ?? null;

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  /** Local rule or server error code, shown as `error_<code>`. */
  const [failure, setFailure] = useState<string | null>(null);

  const rules = passwordChecklist(password, confirm, fileNumber);

  async function submit() {
    if (busy) return;
    const problem = newPasswordProblem(password, confirm, fileNumber);
    if (problem) {
      setFailure(problem);
      return;
    }
    setFailure(null);
    setBusy(true);
    try {
      const signedIn = await changePassword(password);
      if (!signedIn) {
        // Saved, but the old session is gone: sign in again with the new password.
        snack(t('auth_password_saved_relogin'), 'ok');
        await signOut();
        return;
      }
      snack(t('auth_password_saved'), 'ok');
      await passwordChanged();
    } catch (e) {
      setFailure(e instanceof AuthFailure ? e.code : 'generic');
    } finally {
      setBusy(false);
    }
  }

  function askSignOut() {
    Alert.alert(t('sign_out'), t('auth_sign_out_confirm'), [
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

  const edit = (set: (v: string) => void) => (text: string) => {
    set(text);
    setFailure(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title={t('change_password_title')} subtitle={fileNumber ? t('auth_file_label', { n: fileNumber }) : undefined} />
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <Screen footer={<Button label={t('save')} onPress={submit} loading={busy} disabled={leaving} size="lg" testID="change-password-save" />}>
          <Txt>{t('change_password_intro')}</Txt>

          <View style={{ gap: space.md }}>
            <PasswordField
              testID="new-password"
              label={t('new_password')}
              value={password}
              onChangeText={edit(setPassword)}
              visible={visible}
              onToggleVisible={() => setVisible((v) => !v)}
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => confirmRef.current?.focus()}
              editable={!busy}
            />
            <PasswordField
              ref={confirmRef}
              testID="confirm-password"
              label={t('confirm_password')}
              value={confirm}
              onChangeText={edit(setConfirm)}
              visible={visible}
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="done"
              onSubmitEditing={submit}
              editable={!busy}
            />
          </View>

          <RuleChecklist rules={rules} typed={password.length > 0} />

          {failure ? <Notice tone="danger" text={t(`error_${failure}`)} /> : null}

          <Button label={t('sign_out')} kind="ghost" icon="log-out-outline" onPress={askSignOut} loading={leaving} disabled={busy} />
        </Screen>
      </KeyboardAvoidingView>
    </View>
  );
}
