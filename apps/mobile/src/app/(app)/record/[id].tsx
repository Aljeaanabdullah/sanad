// Month record of one employee: month switcher, totals, each day with its status, and (for staff
// viewing someone) the punches. Review photos only for supervisors and the system admin (PRD 4.4);
// tap a photo to see it full screen. `id` is an employee id, or "me" for my own record.
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Image, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { MonthSwitcher, PhotoViewer } from '../../../components/requests/parts';
import { Badge, Button, Card, EmptyState, ErrorState, Header, Icon, Notice, Row, Screen, Section, SkeletonCard, StatTile, Txt, useDir } from '../../../components/ui';
import { attendanceHistory, punches as loadPunches, type DayRecord, type PunchRow } from '../../../lib/api';
import { mediumDate, monthYear, parseYmd } from '../../../lib/dates';
import { canSeePhotos, dayNotes, errorKey, isStaff, kuwaitHm, monthEnd, monthStart, monthTotals, sameMonth, shiftMonth } from '../../../lib/requestsView';
import { useSession } from '../../../lib/session';
import { useSettings } from '../../../lib/settings';
import { space } from '../../../lib/theme';

export default function MonthRecord() {
  const params = useLocalSearchParams<{ id: string; name?: string; file?: string }>();
  const { t, lang, c } = useSettings();
  const { profile } = useSession();
  const router = useRouter();
  const own = params.id === 'me' || params.id === profile?.id;
  const employeeId = own ? profile?.id ?? null : params.id ?? null;
  const staff = isStaff(profile?.role);
  const allowed = own || staff;
  const showPunches = !own && staff;
  const withPhotos = showPunches && canSeePhotos(profile?.role);

  const [month, setMonth] = useState(() => monthStart(new Date()));
  const [days, setDays] = useState<DayRecord[] | null>(null);
  const [punchRows, setPunchRows] = useState<PunchRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [photo, setPhoto] = useState<{ uri: string; caption: string } | null>(null);
  const seq = useRef(0);

  const load = useCallback(
    async (m: Date) => {
      if (!employeeId || !allowed) return;
      const my = ++seq.current;
      setError(null);
      setDays(null);
      setPunchRows(null);
      try {
        const from = monthStart(m);
        const to = monthEnd(m);
        const [d, p] = await Promise.all([
          attendanceHistory(employeeId, from, to),
          showPunches ? loadPunches(employeeId, from, to, withPhotos) : Promise.resolve([] as PunchRow[]),
        ]);
        if (my !== seq.current) return;
        setDays([...d].reverse());
        setPunchRows(p);
      } catch (e) {
        if (my === seq.current) setError(t(errorKey(e)));
      }
    },
    [employeeId, allowed, showPunches, withPhotos, t],
  );

  useFocusEffect(
    useCallback(() => {
      load(month);
      // Reload when the screen comes back or the month changes.
    }, [load, month]),
  );

  const go = (by: number) => setMonth((m) => shiftMonth(m, by));

  const refresh = async () => {
    setRefreshing(true);
    await load(month);
    setRefreshing(false);
  };

  const title = own ? t('my_record') : params.name ? params.name : t('employee_record');
  const subtitle = own ? undefined : params.file ? `${t('file_no_label')} ${params.file}` : undefined;
  const totals = days ? monthTotals(days) : null;
  const now = new Date();

  return (
    <>
      <Header title={title} subtitle={subtitle} back />
      <Screen refreshControl={allowed ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.accent} colors={[c.accent]} /> : undefined}>
        {!allowed ? (
          <EmptyState icon="lock-closed-outline" title={t('req_staff_only')} />
        ) : (
          <>
            <MonthSwitcher label={monthYear(month, lang)} onPrev={() => go(-1)} onNext={() => go(1)} canNext={!sameMonth(month, now)} />

            {!own && staff ? (
              <Button
                testID="openDashboard"
                label={t('dash_open_employee')}
                icon="speedometer-outline"
                kind="secondary"
                onPress={() => router.push({ pathname: '/dashboard', params: { employee: employeeId ?? '' } })}
              />
            ) : null}

            {error ? (
              <ErrorState message={error} onRetry={() => load(month)} />
            ) : days == null ? (
              <>
                <Row gap={space.sm}>
                  <View style={{ flex: 1 }}><SkeletonCard lines={1} /></View>
                  <View style={{ flex: 1 }}><SkeletonCard lines={1} /></View>
                  <View style={{ flex: 1 }}><SkeletonCard lines={1} /></View>
                </Row>
                <SkeletonCard lines={3} />
                <SkeletonCard lines={3} />
              </>
            ) : (
              <>
                {totals ? (
                  <Row gap={space.sm}>
                    <StatTile value={totals.late} label={t('dash_late')} tone={totals.late ? 'warn' : 'default'} icon="alarm-outline" />
                    <StatTile value={totals.absent} label={t('dash_absent')} tone={totals.absent ? 'danger' : 'default'} icon="close-circle-outline" />
                    <StatTile value={totals.missing} label={t('dash_missing_checkout')} tone={totals.missing ? 'danger' : 'default'} icon="log-out-outline" />
                  </Row>
                ) : null}

                <Section title={t('attendance_details')}>
                  {days.length === 0 ? (
                    <EmptyState icon="calendar-outline" title={t('req_no_days')} />
                  ) : (
                    <Card padded={false}>
                      {days.map((d, i) => (
                        <DayRow key={d.day} day={d} now={now} last={i === days.length - 1} />
                      ))}
                    </Card>
                  )}
                </Section>

                {showPunches && punchRows ? (
                  <Section title={t('punches')}>
                    {!withPhotos ? <Notice tone="neutral" icon="eye-off-outline" text={t('photos_hidden')} /> : null}
                    {punchRows.length === 0 ? (
                      <EmptyState icon="finger-print-outline" title={t('no_punches')} />
                    ) : (
                      <Card padded={false}>
                        {punchRows.map((p, i) => (
                          <PunchItem
                            key={`${p.at.toISOString()}-${i}`}
                            p={p}
                            last={i === punchRows.length - 1}
                            onPhoto={(uri, caption) => setPhoto({ uri, caption })}
                          />
                        ))}
                      </Card>
                    )}
                  </Section>
                ) : null}
              </>
            )}
          </>
        )}
      </Screen>
      <PhotoViewer uri={photo?.uri ?? null} caption={photo?.caption} onClose={() => setPhoto(null)} />
    </>
  );
}

function DayRow({ day, now, last }: { day: DayRecord; now: Date; last: boolean }) {
  const { t, lang, c } = useSettings();
  const d = useDir();
  const work = day.kind === 'work';
  const notes = dayNotes(day, now);
  const corrected = day.checkInCorrected || day.checkOutCorrected;
  const inT = day.checkIn ? kuwaitHm(day.checkIn) : '—';
  const outT = day.checkOut ? kuwaitHm(day.checkOut) : '—';
  const weekday = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-KW' : 'en-GB', { weekday: 'long' }).format(parseYmd(day.day));
  return (
    <View>
      <Row gap={space.md} align="flex-start" style={{ paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 56 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt weight="medium" tone={work ? 'default' : 'muted'}>{`${weekday} ${mediumDate(parseYmd(day.day), lang)}`}</Txt>
          {work ? (
            <Row gap={space.md}>
              <Txt variant="label" tone="muted">{t('in_label')}</Txt>
              <Txt variant="label" numeric>{inT}</Txt>
              <Txt variant="label" tone="muted">{t('out_label')}</Txt>
              <Txt variant="label" numeric>{outT}</Txt>
            </Row>
          ) : null}
        </View>
        <View style={{ gap: space.xs, alignItems: d.rtl ? 'flex-start' : 'flex-end' }}>
          {notes.map((n, i) => (
            <View key={i}>
              <Badge label={t(n.key, n.vars)} tone={n.tone} />
            </View>
          ))}
          {corrected ? (
            <View>
              <Badge label={t('corrected')} tone="info" icon="create-outline" />
            </View>
          ) : null}
        </View>
      </Row>
      {last ? null : <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.line, marginHorizontal: space.lg }} />}
    </View>
  );
}

function PunchItem({ p, last, onPhoto }: { p: PunchRow; last: boolean; onPhoto: (uri: string, caption: string) => void }) {
  const { t, lang, c } = useSettings();
  const kind = t(p.type === 'check_in' ? 'in_label' : 'out_label');
  const when = `${mediumDate(p.at, lang)} ${kuwaitHm(p.at)}`;
  const site = lang === 'ar' ? p.siteAr : p.siteEn;
  const detail = [p.accepted ? t('accepted') : `${t('rejected')}: ${t(`punch_reason_${p.reason ?? 'rules_failed'}`)}`, p.corrected ? t('corrected') : null, site]
    .filter(Boolean)
    .join(' · ');
  return (
    <View>
      <Row gap={space.md} style={{ paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 64 }}>
        {p.photoUrl ? (
          <Pressable
            onPress={() => onPhoto(p.photoUrl!, `${kind} · ${when}`)}
            accessibilityRole="imagebutton"
            accessibilityLabel={`${t('req_photo')}: ${kind} ${when}`}
            style={{ width: 48, height: 48, borderRadius: 10, overflow: 'hidden', backgroundColor: c.surfaceAlt }}
          >
            <Image source={{ uri: p.photoUrl }} style={{ width: 48, height: 48 }} />
          </Pressable>
        ) : (
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={p.accepted ? 'checkmark-circle' : 'close-circle'} tone={p.accepted ? 'ok' : 'danger'} />
          </View>
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <Row gap={space.sm}>
            <Txt weight="medium">{kind}</Txt>
            <Txt variant="label" tone="muted" numeric>{when}</Txt>
          </Row>
          <Txt variant="label" tone={p.accepted ? 'muted' : 'danger'} numberOfLines={3}>{detail}</Txt>
        </View>
      </Row>
      {last ? null : <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.line, marginHorizontal: space.lg }} />}
    </View>
  );
}
