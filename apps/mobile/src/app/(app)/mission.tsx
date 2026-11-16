// External mission: one day (today up to 30 days ahead), a site not enabled for me, reason.
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl } from 'react-native';
import { useDateTimePicker } from '../../components/requests/DateTimePicker';
import { SiteSheet } from '../../components/requests/parts';
import { Button, EmptyState, ErrorState, Field, Header, Notice, PickerField, Screen, Skeleton, useSnackbar } from '../../components/ui';
import { missionSites, submitMission, type SiteOption } from '../../lib/api';
import { longDate } from '../../lib/dates';
import { errorKey, missionRange, startOfDay, validateMission } from '../../lib/requestsView';
import { useSettings } from '../../lib/settings';

export default function MissionScreen() {
  const { t, lang, c } = useSettings();
  const router = useRouter();
  const snack = useSnackbar();
  const picker = useDateTimePicker();
  const [sites, setSites] = useState<SiteOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [date, setDate] = useState<Date | null>(null);
  const [site, setSite] = useState<SiteOption | null>(null);
  const [sheet, setSheet] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const today = startOfDay(new Date());
  const range = missionRange(today);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setSites(await missionSites());
    } catch (e) {
      setLoadError(t(errorKey(e)));
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const pickDate = async () => {
    const d = await picker.date({ value: date ?? today, min: range.min, max: range.max });
    if (d) {
      setDate(d);
      setError(null);
    }
  };

  const send = async () => {
    const problem = validateMission({ date, siteId: site?.id ?? null, reason, today });
    if (problem) {
      setError(t(problem));
      return;
    }
    setSending(true);
    setError(null);
    try {
      await submitMission({ date: date!, siteId: site!.id, reason: reason.trim() });
      snack(t('sent'), 'ok');
      router.back();
    } catch (e) {
      setError(t(errorKey(e)));
    } finally {
      setSending(false);
    }
  };

  const noSites = sites != null && sites.length === 0;

  return (
    <>
      <Header title={t('new_request_mission')} back />
      <Screen
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.accent} colors={[c.accent]} />}
        footer={noSites || (sites == null && loadError) ? undefined : <Button testID="sendMission" label={t('send')} icon="send" loading={sending} disabled={sites == null} onPress={send} />}
      >
        {sites == null && loadError ? (
          <ErrorState message={loadError} onRetry={load} />
        ) : noSites ? (
          <EmptyState icon="checkmark-done-outline" title={t('no_mission_sites')} />
        ) : (
          <>
            <Notice tone="info" text={t('mission_hint')} />
            <PickerField label={t('shift_day')} value={date ? longDate(date, lang) : null} placeholder={t('choose_date')} onPress={pickDate} />
            {sites == null ? (
              <Skeleton height={52} radius={10} />
            ) : (
              <PickerField
                label={t('site')}
                value={site ? (lang === 'ar' ? site.nameAr : site.nameEn) : null}
                placeholder={t('choose_site')}
                icon="location-outline"
                onPress={() => setSheet(true)}
              />
            )}
            <Field label={t('reason')} value={reason} onChangeText={setReason} multiline maxLength={1000} helper={t('req_reason_hint')} />
            {error ? <Notice tone="danger" text={error} /> : null}
          </>
        )}
      </Screen>
      <SiteSheet
        visible={sheet}
        sites={sites ?? []}
        selected={site?.id ?? null}
        onSelect={(s) => {
          setSite(s);
          setSheet(false);
          setError(null);
        }}
        onClose={() => setSheet(false)}
      />
      {picker.element}
    </>
  );
}
