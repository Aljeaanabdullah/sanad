// The bonus status hero (PRD 17-18): eligible / not eligible / waiting for the manager, where the
// result comes from (locked list = official, draft = under manager review, estimate), and the reason.
import { StyleSheet, View } from 'react-native';
import { bonusOf, type DashboardData } from '../../sanad/dashboard';
import { useSettings } from '../../lib/settings';
import { radius, space } from '../../lib/theme';
import { Badge, Card, Icon, Row, Txt, type IconName } from '../ui';

/** Strings key of the source label: only a locked list is official. */
export function sourceKey(d: DashboardData): string {
  const b = bonusOf(d);
  if (b.source === 'locked') return 'dash_locked';
  if (b.source === 'draft') return 'dash_draft';
  return d.period.complete ? 'dash_estimate' : 'dash_estimate_today';
}

export function statusKey(eligible: boolean | null): string {
  return eligible == null ? 'dash_pending' : eligible ? 'dash_eligible' : 'dash_not_eligible';
}

export function BonusCard({ data }: { data: DashboardData }) {
  const { t, c } = useSettings();
  const b = bonusOf(data);
  const tone = b.eligible == null ? 'muted' : b.eligible ? 'ok' : 'danger';
  const icon: IconName = b.eligible == null ? 'hourglass-outline' : b.eligible ? 'checkmark-circle' : 'close-circle';
  const badgeTone = b.source === 'locked' ? 'ok' : b.source === 'draft' ? 'warn' : 'info';
  return (
    <Card testID="bonus-card" style={{ borderRadius: radius.lg, borderColor: c.accent, borderWidth: 1.5, padding: space.lg }}>
      <View style={{ gap: space.md }}>
        <Row justify="space-between">
          <Row gap={space.sm}>
            <Icon name="trophy-outline" size={22} color={c.accent} />
            <Txt variant="heading">{t('dash_bonus')}</Txt>
          </Row>
          <Badge label={t(sourceKey(data))} tone={badgeTone} icon={b.source === 'locked' ? 'lock-closed' : undefined} />
        </Row>
        <Row gap={space.sm}>
          <Icon name={icon} size={30} tone={tone} />
          <Txt testID="bonus-status" variant="title" tone={tone} weight="black" style={{ flex: 1 }}>{t(statusKey(b.eligible))}</Txt>
        </Row>
        {b.reason ? <Txt testID="bonus-reason">{t('dsh_reason', { reason: b.reason })}</Txt> : null}
        {b.source !== 'locked' ? (
          <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line, paddingTop: space.md }}>
            <Txt variant="caption" tone="muted">{t('dash_estimate_note')}</Txt>
          </View>
        ) : null}
        {data.estimate.notes.map((n) => (
          <Row key={n} gap={space.sm} align="flex-start">
            <Icon name="information-circle-outline" size={18} tone="muted" />
            <Txt variant="label" tone="muted" style={{ flex: 1 }}>{n}</Txt>
          </Row>
        ))}
      </View>
    </Card>
  );
}
