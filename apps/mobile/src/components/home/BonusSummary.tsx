// Home: the current period's bonus result and the numbers behind it (taps open the dashboard).
import { View } from 'react-native';
import { dm } from '../../lib/dates';
import { bonusLabels } from '../../lib/punch';
import { useSettings } from '../../lib/settings';
import { space } from '../../lib/theme';
import { bonusOf, type DashboardData } from '../../sanad/dashboard';
import { Badge, Card, ErrorState, Row, Section, Skeleton, SkeletonCard, StatTile, Txt } from '../ui';
import type { Block } from './block';

export function BonusSummary({ dash, onOpen, onRetry }: { dash: Block<DashboardData>; onOpen: () => void; onRetry: () => void }) {
  const { t } = useSettings();
  return (
    <Section title={t('period_summary')} action={dash.state === 'ok' ? t('home_details') : undefined} onAction={onOpen}>
      {dash.state === 'loading' ? (
        <>
          <SkeletonCard lines={2} />
          <Row gap={space.sm}>
            {[0, 1, 2].map((i) => <Skeleton key={i} height={84} radius={16} style={{ flex: 1 }} />)}
          </Row>
        </>
      ) : dash.state === 'error' ? (
        <Card>
          <ErrorState message={t('dash_error_generic')} onRetry={onRetry} />
        </Card>
      ) : (
        <Summary d={dash.data} onOpen={onOpen} />
      )}
    </Section>
  );
}

function Summary({ d, onOpen }: { d: DashboardData; onOpen: () => void }) {
  const { t } = useSettings();
  const b = bonusOf(d);
  const l = bonusLabels(b, d.period.complete);
  const late = d.attendance.late;
  const pens = d.penalties.length;
  return (
    <>
      <Card onPress={onOpen} accessibilityLabel={`${t('dash_bonus')}: ${t(l.badge)}, ${t(l.source)}`} testID="home-bonus">
        <View style={{ gap: space.sm }}>
          <Row justify="space-between">
            <Txt variant="heading">{t('dash_bonus')}</Txt>
            <Badge label={t(l.badge)} tone={l.tone} />
          </Row>
          <Txt variant="label" tone="muted">{`${t(l.source)} · ${t('home_period', { from: dm(d.period.from), to: dm(d.period.to) })}`}</Txt>
          {b.eligible !== true && b.reason ? <Txt variant="label" numberOfLines={2}>{b.reason}</Txt> : null}
        </View>
      </Card>
      <Row gap={space.sm} align="stretch">
        <StatTile value={late} label={t('lates')} icon="time-outline" tone={late >= 2 ? 'danger' : 'default'} onPress={onOpen} />
        <StatTile value={d.leave_days} label={t('dash_leave_days')} icon="airplane-outline" tone={d.leave_days > 10 ? 'danger' : 'default'} onPress={onOpen} />
        <StatTile value={pens} label={t('dash_penalties')} icon="alert-circle-outline" tone={pens > 0 ? 'danger' : 'default'} onPress={onOpen} />
      </Row>
    </>
  );
}
