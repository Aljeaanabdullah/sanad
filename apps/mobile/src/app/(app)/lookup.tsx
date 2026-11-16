// Staff only (supervisor / HR / admin): find an employee by file number, then open their month
// record. (Face enrollment is no longer part of this screen, PRD 4.6.)
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Button, EmptyState, Field, Header, Notice, Screen } from '../../components/ui';
import { findEmployee } from '../../lib/api';
import { fileNumberInput, isFileNumber, isStaff } from '../../lib/requestsView';
import { useSession } from '../../lib/session';
import { useSettings } from '../../lib/settings';

export default function LookupScreen() {
  const { t, lang } = useSettings();
  const { profile } = useSession();
  const router = useRouter();
  const [file, setFile] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const allowed = isStaff(profile?.role);

  const find = async () => {
    if (!isFileNumber(file)) {
      setError(t('error_invalid_file_number'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const emp = await findEmployee(Number(file));
      if (!emp) {
        setError(t('employee_not_found'));
        return;
      }
      router.push({
        pathname: '/record/[id]',
        params: { id: emp.id, name: lang === 'ar' ? emp.nameAr : emp.nameEn, file: String(emp.fileNumber) },
      });
    } catch {
      setError(t('req_error_generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Header title={t('employee_record')} back />
      <Screen footer={allowed ? <Button testID="lookupShow" label={t('show')} icon="search" loading={busy} onPress={find} /> : undefined}>
        {!allowed ? (
          <EmptyState icon="lock-closed-outline" title={t('req_staff_only')} />
        ) : (
          <>
            <Notice tone="info" text={t('req_lookup_hint')} />
            <Field
              testID="lookupFile"
              label={t('find_employee')}
              value={file}
              onChangeText={(v) => {
                setFile(fileNumberInput(v));
                setError(null);
              }}
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={6}
              autoFocus
              returnKeyType="search"
              onSubmitEditing={find}
              error={error}
              style={{ textAlign: 'left', writingDirection: 'ltr', letterSpacing: 2 }}
            />
          </>
        )}
      </Screen>
    </>
  );
}
