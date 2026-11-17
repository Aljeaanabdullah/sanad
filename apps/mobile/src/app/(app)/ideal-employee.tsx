// «الموظف المثالي» (S9): the latest approved winner, the hall of fame, and for supervisors (or the admin, for
// departments without a supervisor) a «رشّح موظف» form limited to their own department.
// Nominations are private: this screen shows a supervisor only their own. Not linked to the bonus.
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import {
  Button, Card, EmptyState, ErrorState, Field, Gap, Header, Icon, ListRow, Notice, Row, Screen, Section, SkeletonCard, Txt, useSnackbar,
} from '../../components/ui';
import {
  filterCandidates, ieErrorKey, monthLabel, reasonError, REASON_MAX, REASON_MIN, splitWinners,
  type Candidate, type MyDepartment, type Winner,
} from '../../lib/idealEmployee';
import { idealCandidates, idealMyDepartments, idealNominate, idealWinners, idealWithdraw } from '../../lib/idealEmployeeApi';
import { useSession } from '../../lib/session';
import { useSettings } from '../../lib/settings';
import { space } from '../../lib/theme';

export default function IdealEmployeeScreen() {
  const { t, lang, c } = useSettings();
  const { profile } = useSession();
  const canNominate = !!profile && profile.role !== 'employee';
  const [winners, setWinners] = useState<Winner[] | null>(null);
  const [departments, setDepartments] = useState<MyDepartment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [w, d] = await Promise.all([idealWinners(), canNominate ? idealMyDepartments() : Promise.resolve([])]);
      setWinners(w);
      setDepartments(d);
    } catch {
      setError(t('ie_load_error'));
    }
  }, [canNominate, t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const { latest, hall } = useMemo(() => splitWinners(winners ?? []), [winners]);

  return (
    <>
      <Header title={t('ie_title')} subtitle={t('ie_subtitle')} back />
      <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.accent} colors={[c.accent]} />}>
        {winners == null && error ? (
          <ErrorState message={error} onRetry={load} />
        ) : winners == null ? (
          <>
            <SkeletonCard lines={4} />
            <SkeletonCard lines={2} />
          </>
        ) : (
          <>
            {latest ? <WinnerCard w={latest} /> : (
              <Card>
                <EmptyState icon="ribbon-outline" title={t('ie_none_title')} body={t('ie_none_body')} />
              </Card>
            )}

            {departments.map((d) => (
              <NominationCard key={d.departmentId} dep={d} onChanged={load} />
            ))}

            <Section title={t('ie_hall')}>
              {hall.length === 0 ? (
                <Txt tone="muted">{t('ie_hall_empty')}</Txt>
              ) : (
                <Card padded={false}>
                  {hall.map((w, i) => (
                    <ListRow
                      key={w.month}
                      testID={`ie-hall-${w.month}`}
                      icon="ribbon-outline"
                      iconTone="accent"
                      title={lang === 'ar' ? w.nameAr : w.nameEn}
                      subtitle={[monthLabel(w.month, lang), w.jobTitle, lang === 'ar' ? w.departmentAr : w.departmentEn].filter(Boolean).join(' · ')}
                      last={i === hall.length - 1}
                    />
                  ))}
                </Card>
              )}
            </Section>
            <Txt variant="caption" tone="muted" center>{t('ie_not_bonus')}</Txt>
          </>
        )}
      </Screen>
    </>
  );
}

/** The headline card: name, rank / job title, department, reason, and HR's citation. No photo. */
function WinnerCard({ w }: { w: Winner }) {
  const { t, lang } = useSettings();
  const dept = lang === 'ar' ? w.departmentAr : w.departmentEn;
  return (
    <Card testID="ie-winner">
      <View style={{ gap: space.md }}>
        <Row gap={space.sm}>
          <Icon name="trophy" size={22} tone="accent" />
          <Txt variant="label" tone="accent" weight="bold">{t('ie_month_of', { month: monthLabel(w.month, lang) })}</Txt>
        </Row>
        <View style={{ gap: space.xs }}>
          <Txt variant="title">{lang === 'ar' ? w.nameAr : w.nameEn}</Txt>
          {w.jobTitle || dept ? <Txt tone="muted">{[w.jobTitle, dept].filter(Boolean).join(' · ')}</Txt> : null}
        </View>
        <View style={{ gap: space.xs }}>
          <Txt variant="label" tone="muted" weight="medium">{t('ie_reason')}</Txt>
          <Txt>{w.reason}</Txt>
        </View>
        {w.citation ? (
          <View style={{ gap: space.xs }}>
            <Txt variant="label" tone="muted" weight="medium">{t('ie_citation')}</Txt>
            <Txt weight="medium" tone="primary">{`«${w.citation}»`}</Txt>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

/** My nomination for one department this month, and the form to make or change it. */
function NominationCard({ dep, onChanged }: { dep: MyDepartment; onChanged: () => Promise<void> }) {
  const { t, lang } = useSettings();
  const snack = useSnackbar();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const nominee = dep.nomination;
  const deptName = lang === 'ar' ? dep.departmentAr : dep.departmentEn;

  const withdraw = async () => {
    setBusy(true);
    try {
      await idealWithdraw(dep.departmentId);
      snack(t('ie_withdrawn'), 'ok');
      await onChanged();
    } catch (e) {
      snack(t(ieErrorKey(e)), 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title={t('ie_nominate_section', { month: monthLabel(dep.month, lang) })}>
      <Card testID={`ie-nominate-${dep.departmentId}`}>
        <View style={{ gap: space.md }}>
          <Txt variant="label" tone="muted">{deptName}</Txt>
          {nominee ? (
            <View style={{ gap: space.xs }}>
              <Txt weight="bold">{t('ie_your_nominee', { name: lang === 'ar' ? nominee.nameAr : nominee.nameEn })}</Txt>
              <Txt variant="label" tone="muted" numberOfLines={4}>{nominee.reason}</Txt>
            </View>
          ) : (
            <Txt tone="muted">{t('ie_no_nominee')}</Txt>
          )}
          {dep.monthClosed ? (
            <Notice tone="neutral" text={t('ie_closed')} />
          ) : open ? (
            <NominationForm
              dep={dep}
              onDone={async () => {
                setOpen(false);
                snack(t('ie_sent'), 'ok');
                await onChanged();
              }}
              onCancel={() => setOpen(false)}
            />
          ) : (
            <>
              <Txt variant="label" tone="muted">{t('ie_nominate_hint')}</Txt>
              <Row gap={space.sm}>
                <View style={{ flex: 1 }}>
                  <Button testID="ie-open-form" label={nominee ? t('ie_change') : t('ie_nominate')} icon="ribbon-outline" onPress={() => setOpen(true)} />
                </View>
                {nominee ? (
                  <View style={{ flex: 1 }}>
                    <Button testID="ie-withdraw" label={t('ie_withdraw')} kind="secondary" loading={busy} onPress={withdraw} />
                  </View>
                ) : null}
              </Row>
            </>
          )}
        </View>
      </Card>
    </Section>
  );
}

const SHOWN = 30;

function NominationForm({ dep, onDone, onCancel }: { dep: MyDepartment; onDone: () => Promise<void>; onCancel: () => void }) {
  const { t, lang } = useSettings();
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Candidate | null>(null);
  const [reason, setReason] = useState(dep.nomination?.reason ?? '');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadCandidates = useCallback(async () => {
    setLoadError(null);
    try {
      const list = await idealCandidates(dep.departmentId);
      setCandidates(list);
      const current = dep.nomination ? list.find((x) => x.id === dep.nomination!.nomineeId) : undefined;
      if (current) setPicked(current);
    } catch (e) {
      setLoadError(t(ieErrorKey(e)));
    }
  }, [dep, t]);

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  const shown = useMemo(() => filterCandidates(candidates ?? [], query, SHOWN), [candidates, query]);
  const reasonKey = reasonError(reason);
  const name = (x: Candidate) => (lang === 'ar' ? x.nameAr : x.nameEn);

  const send = async () => {
    setTouched(true);
    if (!picked || reasonKey) return;
    setBusy(true);
    setSaveError(null);
    try {
      await idealNominate(dep.departmentId, picked.id, reason);
      await onDone();
    } catch (e) {
      setSaveError(t(ieErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: space.md }}>
      {loadError ? (
        <ErrorState message={loadError} onRetry={loadCandidates} />
      ) : candidates == null ? (
        <SkeletonCard lines={3} />
      ) : picked ? (
        <View style={{ gap: space.xs }}>
          <Txt variant="label" weight="medium">{t('ie_picked')}</Txt>
          <Card padded={false}>
            <ListRow
              icon="person-outline"
              title={name(picked)}
              subtitle={[String(picked.fileNumber), picked.jobTitle].filter(Boolean).join(' · ')}
              trailing={<Icon name="checkmark-circle" size={22} tone="ok" />}
              last
            />
          </Card>
          <Button label={t('ie_pick_other')} kind="ghost" onPress={() => setPicked(null)} />
        </View>
      ) : (
        <View style={{ gap: space.sm }}>
          <Field testID="ie-search" label={t('ie_pick')} placeholder={t('ie_search')} value={query} onChangeText={setQuery} autoCorrect={false} />
          {shown.length === 0 ? (
            <Txt tone="muted">{t('ie_no_match')}</Txt>
          ) : (
            <Card padded={false}>
              {shown.map((x, i) => (
                <ListRow
                  key={x.id}
                  testID={`ie-candidate-${x.fileNumber}`}
                  icon="person-outline"
                  title={name(x)}
                  subtitle={[String(x.fileNumber), x.jobTitle].filter(Boolean).join(' · ')}
                  onPress={() => setPicked(x)}
                  last={i === shown.length - 1}
                />
              ))}
            </Card>
          )}
          {candidates.length > SHOWN && !query ? <Txt variant="caption" tone="muted">{t('ie_more', { n: SHOWN })}</Txt> : null}
        </View>
      )}

      <Field
        testID="ie-reason"
        label={t('ie_reason_field')}
        value={reason}
        onChangeText={setReason}
        onBlur={() => setTouched(true)}
        multiline
        maxLength={REASON_MAX}
        helper={t('ie_reason_helper', { min: REASON_MIN })}
        error={touched && reasonKey ? t(reasonKey, { min: REASON_MIN, max: REASON_MAX }) : null}
      />
      {saveError ? <Notice tone="danger" text={saveError} /> : null}
      <Gap size={space.xs} />
      <Row gap={space.sm}>
        <View style={{ flex: 1 }}>
          <Button testID="ie-send" label={t('ie_send')} icon="send" loading={busy} disabled={!picked} onPress={send} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label={t('ie_cancel')} kind="secondary" onPress={onCancel} disabled={busy} />
        </View>
      </Row>
    </View>
  );
}
