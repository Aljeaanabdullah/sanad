// Reports tab (PRD 18.2): my attendance calendar. Saturday-first month grid, a tint AND a symbol per
// day (colour is never the only signal), a legend, the tapped day's details, month totals, and a
// link to my dashboard. Leave days come from the dashboards of the two bonus periods in the month.
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { CalendarGrid, CalendarLegend } from '../../../components/dash/CalendarGrid';
import { MonthSwitcher } from '../../../components/dash/MonthSwitcher';
import { Badge, Button, Card, ErrorState, Header, Row, Screen, Section, Skeleton, StatTile, Txt } from '../../../components/ui';
import { attendanceHistory, loadDashboard, type DayRecord } from '../../../lib/api';
import { SCREEN_LOAD_TIMEOUT_MS, withTimeout } from '../../../lib/net';
import { buildMonth, DAY_VIEW, periodMonthsFor, typeLabel, type DayInfo } from '../../../lib/calendarView';
import { hm, longDate, monthYear, parseYmd, ymd } from '../../../lib/dates';
import { useSession } from '../../../lib/session';
import { useSettings } from '../../../lib/settings';
import { space } from '../../../lib/theme';

type Leave = { type: string; from: string; to: string | null };

export default function ReportsScreen() {
  const { t, c, lang } = useSettings();
  const { profile } = useSession();
  const router = useRouter();
  const now = new Date();
  const thisMonth = { y: now.getFullYear(), m: now.getMonth() };
  const [month, setMonth] = useState(thisMonth);
  const [records, setRecords] = useState<DayRecord[] | null>(null);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<string | null>(ymd(now));
  const loadedFor = useRef<string | null>(null);

  const load = useCallback(
    async (y: number, m: number, pull = false) => {
      if (!profile) return;
      const key = `${y}-${m}`;
      if (pull) setRefreshing(true);
      if (loadedFor.current !== key) {
        setRecords(null);
        setFailed(false);
      }
      try {
        // A stalled call turns into the error card with "Try again", never an endless skeleton.
        const [recs, dashes] = await Promise.all([
          withTimeout(attendanceHistory(profile.id, new Date(y, m, 1), new Date(y, m + 1, 0)), SCREEN_LOAD_TIMEOUT_MS),
          // Leave info is extra: a failed dashboard only hides the leave marks.
          Promise.allSettled(periodMonthsFor(y, m).map((pm) => withTimeout(loadDashboard(null, pm), SCREEN_LOAD_TIMEOUT_MS))),
        ]);
        const ls: Leave[] = [];
        for (const r of dashes) if (r.status === 'fulfilled') ls.push(...r.value.leaves);
        loadedFor.current = key;
        setRecords(recs);
        setLeaves(ls);
        setFailed(false);
      } catch {
        if (loadedFor.current !== key) setFailed(true);
      } finally {
        setRefreshing(false);
      }
    },
    [profile],
  );

  const monthRef = useRef(month);
  monthRef.current = month;
  useFocusEffect(
    useCallback(() => {
      load(monthRef.current.y, monthRef.current.m);
    }, [load]),
  );

  const go = (by: number) => {
    const d = new Date(month.y, month.m + by, 1);
    const next = { y: d.getFullYear(), m: d.getMonth() };
    setMonth(next);
    const isThis = next.y === thisMonth.y && next.m === thisMonth.m;
    setSelected(isThis ? ymd(now) : null);
    load(next.y, next.m);
  };

  const today = ymd(now);
  const view = useMemo(() => (records ? buildMonth(month.y, month.m, records, leaves, today) : null), [records, leaves, month, today]);
  const canNext = month.y < thisMonth.y || (month.y === thisMonth.y && month.m < thisMonth.m);
  const info = view && selected ? view.days.get(selected) ?? null : null;

  return (
    <>
      <Header title={t('cal_title')} big />
      <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(month.y, month.m, true)} tintColor={c.accent} />}>
        <MonthSwitcher title={monthYear(new Date(month.y, month.m, 1), lang)} onPrev={() => go(-1)} onNext={() => go(1)} canNext={canNext} />

        {failed ? (
          <ErrorState message={t('cal_error')} onRetry={() => load(month.y, month.m)} />
        ) : !view ? (
          <CalendarSkeleton />
        ) : (
          <>
            <CalendarGrid view={view} selected={selected} today={today} onSelect={setSelected} />
            <CalendarLegend />
            {info ? <DayDetails info={info} /> : <Txt tone="muted">{t('cal_tap_day')}</Txt>}

            <Section title={t('cal_month_totals')}>
              <Row gap={space.sm}>
                <StatTile icon="checkmark" value={view.totals.present} label={t('dash_present')} tone="ok" />
                <StatTile icon="time-outline" value={view.totals.late} label={t('dash_late')} tone={view.totals.late >= 2 ? 'danger' : 'default'} />
                <StatTile icon="close" value={view.totals.absent} label={t('dash_absent')} tone={view.totals.absent > 0 ? 'danger' : 'default'} />
              </Row>
              <Row gap={space.sm}>
                <StatTile icon="airplane-outline" value={view.totals.leave} label={t('dash_leave_days')} />
                <StatTile icon="log-out-outline" value={view.totals.missingOut} label={t('dash_missing_checkout')} />
                <StatTile icon="hourglass-outline" value={view.totals.lateMinutes} label={t('dash_late_minutes')} />
              </Row>
            </Section>
          </>
        )}

        <Button label={t('cal_open_dashboard')} icon="stats-chart-outline" kind="secondary" onPress={() => router.push('/dashboard')} />
      </Screen>
    </>
  );
}

function DayDetails({ info }: { info: DayInfo }) {
  const { t, c, lang } = useSettings();
  const v = DAY_VIEW[info.state];
  const tone = v.tone ?? 'neutral';
  const work = info.recs.filter((r) => r.kind === 'work');
  return (
    <Card testID="day-details">
      <View style={{ gap: space.md }}>
        <Row justify="space-between" align="flex-start">
          <Txt variant="heading" style={{ flex: 1 }}>{longDate(parseYmd(info.date), lang)}</Txt>
          <Badge label={t(v.label)} tone={tone} icon={v.icon ?? undefined} />
        </Row>
        {info.leave ? <Txt tone="muted">{t('cal_on_leave', { type: typeLabel(t, t.isAr, info.leave) })}</Txt> : null}
        {work.length === 0 ? (
          info.leave ? null : <Txt tone="muted">{info.state === 'none' ? t('cal_no_shift') : t(v.label)}</Txt>
        ) : (
          work.map((r, i) => (
            <View key={i} style={{ gap: space.xs, paddingTop: i ? space.md : 0, borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderTopColor: c.line }}>
              {r.shiftStart && r.shiftEnd ? (
                <Txt variant="label" tone="muted">
                  {work.length > 1 ? `${t('cal_shift_n', { n: i + 1 })} · ` : `${t('shift_title')} · `}
                  {t('shift_time', { from: hm(r.shiftStart), to: hm(r.shiftEnd) })}
                </Txt>
              ) : null}
              <Row gap={space.xl}>
                <TimeCell label={t('in_label')} value={r.checkIn ? hm(r.checkIn) : '--:--'} />
                <TimeCell label={t('out_label')} value={r.checkOut ? hm(r.checkOut) : '--:--'} />
              </Row>
              <Row wrap gap={space.sm}>
                {r.arrival === 'late' ? <Badge tone="warn" icon="time-outline" label={t('late_by', { minutes: r.lateMinutes })} /> : null}
                {r.arrival === 'absent' && !info.leave ? <Badge tone="danger" icon="close" label={t('arrival_absent')} /> : null}
                {r.earlyLeaveMinutes > 0 ? <Badge tone="warn" icon="exit-outline" label={t('early_by', { minutes: r.earlyLeaveMinutes })} /> : null}
                {r.departure === 'missing' ? <Badge tone="danger" icon="log-out-outline" label={t('missing_out')} /> : null}
                {r.checkInCorrected || r.checkOutCorrected ? <Badge tone="info" icon="create-outline" label={t('corrected')} /> : null}
              </Row>
            </View>
          ))
        )}
      </View>
    </Card>
  );
}

function TimeCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Txt variant="caption" tone="muted">{label}</Txt>
      <Txt variant="title" numeric weight="black">{value}</Txt>
    </View>
  );
}

function CalendarSkeleton() {
  return (
    <Card padded={false} style={{ padding: space.sm, gap: 4 }}>
      {Array.from({ length: 6 }, (_, w) => (
        <Row key={w} gap={4}>
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} height={50} width="auto" radius={10} style={{ flex: 1 }} />
          ))}
        </Row>
      ))}
    </Card>
  );
}
