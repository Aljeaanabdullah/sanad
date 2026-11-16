// One request: what it asks for, its approval steps (request_timeline), and Cancel while it is
// still pending (own requests only; confirm, then snackbar).
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, RefreshControl, View } from 'react-native';
import { InfoLine } from '../../../components/requests/parts';
import { Badge, Button, Card, EmptyState, ErrorState, Header, Icon, Notice, Row, Screen, Section, Skeleton, SkeletonCard, Txt, useSnackbar } from '../../../components/ui';
import { approvalInbox, cancelRequest, myRequests, requestTimeline, type RequestItem, type TimelineEntry } from '../../../lib/api';
import { longDate, mediumDate, parseYmd } from '../../../lib/dates';
import { errorKey, isPendingStatus, kuwaitHm, leaveDays, leaveTypeLabel, requestTitle, statusView, typeIcon } from '../../../lib/requestsView';
import { useSettings } from '../../../lib/settings';
import { space } from '../../../lib/theme';
import type { IconName } from '../../../components/ui';

export default function RequestDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang, c } = useSettings();
  const router = useRouter();
  const snack = useSnackbar();
  const [req, setReq] = useState<RequestItem | null>(null);
  const [mine, setMine] = useState(false);
  const [missing, setMissing] = useState(false);
  const [timeline, setTimeline] = useState<TimelineEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const [own, steps] = await Promise.all([myRequests(), requestTimeline(id).catch(() => [] as TimelineEntry[])]);
      let found = own.find((r) => r.id === id) ?? null;
      setMine(!!found);
      if (!found) found = (await approvalInbox().catch(() => [] as RequestItem[])).find((r) => r.id === id) ?? null;
      setReq(found);
      setMissing(!found);
      setTimeline(steps);
    } catch (e) {
      setError(t(errorKey(e)));
    }
  }, [id, t]);

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

  const cancel = () => {
    if (!req) return;
    Alert.alert(t('cancel_request'), t('cancel_confirm'), [
      { text: t('no'), style: 'cancel' },
      {
        text: t('yes'),
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          setCancelError(null);
          try {
            await cancelRequest(req.id);
            snack(t('req_cancelled'), 'ok');
            router.back();
          } catch (e) {
            setCancelError(t(errorKey(e)));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const pending = !!req && isPendingStatus(req.status);
  const footer = req && mine && pending ? (
    <Button testID="cancelRequest" label={t('cancel_request')} kind="secondary" icon="close" loading={busy} onPress={cancel} />
  ) : undefined;
  const when = (d: Date) => `${mediumDate(d, lang)} ${kuwaitHm(d)}`;

  return (
    <>
      <Header title={t('request_details')} back />
      <Screen
        footer={footer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.accent} colors={[c.accent]} />}
      >
        {error && !req ? (
          <ErrorState message={error} onRetry={load} />
        ) : missing ? (
          <EmptyState icon="document-outline" title={t('req_not_found')} />
        ) : !req ? (
          <>
            <SkeletonCard lines={4} />
            <SkeletonCard lines={2} />
          </>
        ) : (
          <>
            <Card>
              <View style={{ gap: space.lg }}>
                <Row gap={space.md}>
                  <Icon name={typeIcon(req.type) as IconName} size={26} tone="primary" />
                  <View style={{ flex: 1, gap: space.xs }}>
                    <Txt variant="title">{requestTitle(req, t)}</Txt>
                    <Badge label={t(statusView(req.status).key)} tone={statusView(req.status).tone} icon={statusView(req.status).icon as IconName} />
                  </View>
                </Row>
                {req.employeeNameAr && !mine ? (
                  <InfoLine label={t('req_employee')} value={`${lang === 'ar' ? req.employeeNameAr : req.employeeNameEn ?? ''} · ${req.fileNumber ?? ''}`} />
                ) : null}
                {req.type === 'leave' ? (
                  <>
                    <InfoLine label={t('leave_type')} value={leaveTypeLabel(t, req.leaveType)} />
                    <InfoLine label={t('leave_start')} value={longDate(parseYmd(req.shiftDate), lang)} />
                    {req.leaveTo ? <InfoLine label={t('leave_end')} value={longDate(parseYmd(req.leaveTo), lang)} /> : null}
                    {req.leaveTo ? (
                      <InfoLine label={t('req_length')} value={t('n_days', { n: leaveDays(parseYmd(req.shiftDate), parseYmd(req.leaveTo)) ?? 1 })} />
                    ) : null}
                  </>
                ) : (
                  <InfoLine label={t('shift_day')} value={longDate(parseYmd(req.shiftDate), lang)} />
                )}
                {req.type === 'punch_correction' ? (
                  <InfoLine
                    label={t('requested_time')}
                    value={`${t(req.punchType === 'check_out' ? 'out_label' : 'in_label')} · ${req.time ? kuwaitHm(req.time) : '—'}`}
                  />
                ) : null}
                {req.type === 'external_mission' ? <InfoLine label={t('site')} value={(lang === 'ar' ? req.siteAr : req.siteEn) ?? '—'} /> : null}
                <InfoLine label={t('reason')} value={req.reason} />
                <InfoLine label={t('submitted_at')} value={when(req.createdAt)} />
              </View>
            </Card>

            {cancelError ? <Notice tone="danger" text={cancelError} /> : null}

            <Section title={t('path')}>
              <Card>
                {timeline == null ? (
                  <View style={{ gap: space.sm }}>
                    <Skeleton height={16} width="70%" />
                    <Skeleton height={12} width="40%" />
                  </View>
                ) : (
                  <View style={{ gap: space.lg }}>
                    <Step icon="paper-plane-outline" tone="primary" title={t('req_step_sent')} subtitle={when(req.createdAt)} />
                    {timeline.map((s, i) => (
                      <Step
                        key={i}
                        icon={s.decision === 'approved' ? 'checkmark-circle' : 'close-circle'}
                        tone={s.decision === 'approved' ? 'ok' : 'danger'}
                        title={`${t(`stage_${s.stage}`)}: ${(lang === 'ar' ? s.nameAr : s.nameEn) ?? ''} ${t(`decision_${s.decision}`)}`.replace(/\s+/g, ' ')}
                        subtitle={when(s.at)}
                        note={s.note}
                      />
                    ))}
                    {pending ? <Step icon="hourglass-outline" tone="muted" title={t(statusView(req.status).key)} subtitle={t('waiting')} /> : null}
                    {req.status === 'cancelled' ? <Step icon="remove-circle-outline" tone="muted" title={t('status_cancelled')} /> : null}
                  </View>
                )}
              </Card>
            </Section>
          </>
        )}
      </Screen>
    </>
  );
}

function Step({ icon, tone, title, subtitle, note }: {
  icon: IconName;
  tone: 'primary' | 'ok' | 'danger' | 'muted';
  title: string;
  subtitle?: string;
  note?: string | null;
}) {
  return (
    <Row gap={space.md} align="flex-start">
      <Icon name={icon} size={22} tone={tone} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt weight="medium">{title}</Txt>
        {subtitle ? <Txt variant="label" tone="muted">{subtitle}</Txt> : null}
        {note ? <Txt variant="label">{note}</Txt> : null}
      </View>
    </Row>
  );
}
