// Employee dashboard (PRD 17-18): one bonus period (21st of the previous month to the 20th).
// Params: `employee` (optional id; staff opening someone else = view only) and `month` (YYYY-MM).
// Same content as the web panel page (apps/admin/.../records/[id]/dashboard/page.tsx).
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { BonusCard } from '../../components/dash/BonusCard';
import { MonthSwitcher } from '../../components/dash/MonthSwitcher';
import {
  Button,
  Card,
  ErrorState,
  Header,
  ListRow,
  Notice,
  Row,
  Screen,
  Section,
  Skeleton,
  SkeletonCard,
  StatTile,
  Txt,
  useSnackbar,
} from '../../components/ui';
import { loadDashboard, RequestError } from '../../lib/api';
import { periodMonthOf, typeLabel } from '../../lib/calendarView';
import { mediumDate, monthYear, parseYmd } from '../../lib/dates';
import { useSession } from '../../lib/session';
import { useSettings } from '../../lib/settings';
import { space } from '../../lib/theme';
import { MONTH_RE, shiftMonth, type DashboardData } from '../../sanad/dashboard';

const errorKey = (e: unknown) => {
  const code = e instanceof RequestError ? e.code : 'generic';
  return code === 'not_allowed' ? 'dash_error_not_allowed' : code === 'not_found' ? 'dash_error_not_found' : 'dash_error_generic';
};

export default function DashboardScreen() {
  const { t, lang, c } = useSettings();
  const { profile } = useSession();
  const router = useRouter();
  const snack = useSnackbar();
  const params = useLocalSearchParams<{ employee?: string; month?: string }>();
  const employee = typeof params.employee === 'string' && params.employee && params.employee !== profile?.id ? params.employee : null;
  const asked = typeof params.month === 'string' && MONTH_RE.test(params.month) ? params.month : null;

  const [month, setMonth] = useState<string | null>(asked);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const shown = useRef<DashboardData | null>(null);

  const load = useCallback(
    async (m: string | null, mode: 'first' | 'switch' | 'refresh' | 'focus') => {
      if (mode === 'switch') setBusy(true);
      if (mode === 'refresh') setRefreshing(true);
      try {
        const d = await loadDashboard(employee, m);
        shown.current = d;
        setData(d);
        setMonth(d.month);
        setError(null);
      } catch (e) {
        if (shown.current && mode !== 'first') snack(t(errorKey(e)), 'danger');
        else setError(errorKey(e));
      } finally {
        setBusy(false);
        setRefreshing(false);
      }
    },
    [employee, snack, t],
  );

  // Reload on focus (coming back from a leave request or the assistant).
  const monthRef = useRef(month);
  monthRef.current = month;
  useFocusEffect(
    useCallback(() => {
      load(monthRef.current, shown.current ? 'focus' : 'first');
    }, [load]),
  );

  const go = (by: number) => {
    if (!data) return;
    load(shiftMonth(data.month, by), 'switch');
  };

  const viewOnly = !!data && !data.viewer_is_self;
  const title = employee ? t('dash_open_employee') : t('dash_title');

  if (!data) {
    return (
      <>
        <Header title={title} back />
        {error ? (
          <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(month, 'refresh')} tintColor={c.accent} />}>
            <ErrorState message={t(error)} onRetry={() => { setError(null); load(month, 'first'); }} />
          </Screen>
        ) : (
          <Screen>
            <DashSkeleton />
          </Screen>
        )}
      </>
    );
  }

  const d = data;
  const e = d.employee;
  const a = d.attendance;
  const b = (iso: string) => mediumDate(parseYmd(iso), lang);
  const [y, mo] = d.month.split('-').map(Number);
  // The newest period we can move to is the one today falls in (server's today).
  const canNext = d.month < periodMonthOf(d.period.today);
  const dept = lang === 'ar' ? e.department_ar : e.department_en;
  const meta = [String(e.file_number), dept, e.job_title].filter(Boolean).join(' · ');
  const leaves = d.leaves;

  return (
    <>
      <Header title={title} subtitle={viewOnly ? (lang === 'ar' ? e.name_ar : e.name_en) : undefined} back />
      <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(d.month, 'refresh')} tintColor={c.accent} />}>
        {viewOnly ? <Notice tone="info" icon="eye-outline" text={t('dash_view_only')} /> : null}

        <View style={{ gap: 2 }}>
          <Txt variant="title">{lang === 'ar' ? e.name_ar : e.name_en}</Txt>
          <Txt variant="label" tone="muted" numeric={!dept && !e.job_title}>{meta}</Txt>
        </View>

        <MonthSwitcher
          title={t('dsh_list_month', { month: monthYear(new Date(y, mo - 1, 1), lang) })}
          subtitle={t('dsh_period_range', { from: b(d.period.from), to: b(d.period.to) })}
          onPrev={() => go(-1)}
          onNext={() => go(1)}
          canNext={canNext}
          busy={busy}
        />

        {busy ? (
          <DashSkeleton compact />
        ) : (
          <>
            <BonusCard data={d} />

            <Section title={t('dsh_counts')}>
              <Row gap={space.sm}>
                <StatTile icon="checkmark-circle-outline" value={a.present} label={t('dash_present')} />
                <StatTile icon="close-circle-outline" value={a.absent} label={t('dash_absent')} tone={a.absent_unexcused > 0 ? 'danger' : 'default'} />
                <StatTile icon="time-outline" value={a.late_dates.length} label={t('dash_late')} tone={a.late_dates.length >= 2 ? 'danger' : 'default'} />
              </Row>
              <Row gap={space.sm}>
                <StatTile icon="airplane-outline" value={d.leave_days} label={t('dash_leave_days')} tone={d.leave_days > 10 ? 'danger' : 'default'} />
                <StatTile icon="alert-circle-outline" value={d.penalties.length} label={t('dash_penalties')} tone={d.penalties.length > 0 ? 'danger' : 'default'} />
                <StatTile icon="log-out-outline" value={a.missing_checkout} label={t('dash_missing_checkout')} />
              </Row>
              <Txt variant="caption" tone="muted">
                {[`${t('dash_unexcused')}: ${a.absent_unexcused}`, a.late_minutes > 0 ? `${t('dash_late_minutes')}: ${a.late_minutes}` : null].filter(Boolean).join(' · ')}
              </Txt>
            </Section>

            <Section title={t('dash_leaves')}>
              <Card padded={false}>
                {leaves.length === 0 ? (
                  <ListRow icon="checkmark-circle-outline" iconTone="muted" title={t('dash_none')} last />
                ) : (
                  leaves.map((l, i) => (
                    <ListRow
                      key={`${l.type}-${l.from}-${i}`}
                      icon={l.type.startsWith('إجازة') ? 'airplane-outline' : 'remove-circle-outline'}
                      iconTone={l.type.startsWith('إجازة') ? 'primary' : 'danger'}
                      title={typeLabel(t, t.isAr, l.type)}
                      subtitle={[l.to && l.to !== l.from ? `${b(l.from)} – ${b(l.to)}` : b(l.from), t('dsh_days_in_period', { n: l.days_in_period }), l.note]
                        .filter(Boolean)
                        .join(' · ')}
                      last={i === leaves.length - 1}
                    />
                  ))
                )}
              </Card>
            </Section>

            <Section title={t('dsh_late_days')}>
              <Card padded={false}>
                {a.late_dates.length === 0 ? (
                  <ListRow icon="checkmark-circle-outline" iconTone="muted" title={t('dash_none')} last />
                ) : (
                  a.late_dates.map((day, i) => (
                    <ListRow key={day} icon="time-outline" iconTone="accent" title={b(day)} last={i === a.late_dates.length - 1} />
                  ))
                )}
              </Card>
            </Section>

            <Section title={t('dash_penalties')}>
              <Card padded={false}>
                {d.penalties.length === 0 ? (
                  <ListRow icon="checkmark-circle-outline" iconTone="muted" title={t('dash_none')} last />
                ) : (
                  d.penalties.map((p, i) => (
                    <ListRow
                      key={`${p.type}-${p.date}-${i}`}
                      icon="alert-circle-outline"
                      iconTone="danger"
                      title={typeLabel(t, t.isAr, p.type)}
                      subtitle={[b(p.date), p.reason].filter(Boolean).join(' · ')}
                      last={i === d.penalties.length - 1}
                    />
                  ))
                )}
              </Card>
            </Section>

            {!viewOnly ? (
              <View style={{ gap: space.sm }}>
                <Button label={t('dsh_ask_open')} icon="chatbubbles-outline" onPress={() => router.push({ pathname: '/assistant', params: { month: d.month } })} />
                <Button label={t('leave_request')} icon="airplane-outline" kind="secondary" onPress={() => router.push('/leave')} />
              </View>
            ) : null}
          </>
        )}
      </Screen>
    </>
  );
}

function DashSkeleton({ compact }: { compact?: boolean }) {
  return (
    <View style={{ gap: space.lg }}>
      {compact ? null : (
        <>
          <View style={{ gap: space.sm }}>
            <Skeleton height={24} width="60%" />
            <Skeleton height={14} width="40%" />
          </View>
          <Skeleton height={64} radius={16} />
        </>
      )}
      <Skeleton height={150} radius={24} />
      <Row gap={space.sm}>
        <Skeleton height={88} width="auto" radius={16} style={{ flex: 1 }} />
        <Skeleton height={88} width="auto" radius={16} style={{ flex: 1 }} />
        <Skeleton height={88} width="auto" radius={16} style={{ flex: 1 }} />
      </Row>
      <SkeletonCard lines={2} />
    </View>
  );
}
