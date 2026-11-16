// Home: today's punch attempts (last 24 hours), accepted or refused with the reason.
import { View } from 'react-native';
import type { PunchEntry } from '../../lib/api';
import { hm } from '../../lib/dates';
import { hasKey } from '../../lib/i18n';
import { reasonKey } from '../../lib/punch';
import { useSettings } from '../../lib/settings';
import { space } from '../../lib/theme';
import { Badge, Card, EmptyState, ErrorState, ListRow, Section, SkeletonCard, Txt } from '../ui';
import type { Block } from './block';

export function TodayPunches({ punches, onRetry }: { punches: Block<PunchEntry[]>; onRetry: () => void }) {
  const { t } = useSettings();
  return (
    <Section title={t('punch_today')}>
      {punches.state === 'loading' ? (
        <SkeletonCard lines={3} />
      ) : punches.state === 'error' ? (
        <Card>
          <ErrorState message={t('home_punches_error')} onRetry={onRetry} />
        </Card>
      ) : punches.data.length === 0 ? (
        <Card padded={false}>
          <EmptyState icon="finger-print-outline" title={t('punch_none')} />
        </Card>
      ) : (
        <Card padded={false} testID="home-punches">
          {punches.data.map((p, i) => (
            <ListRow
              key={`${p.at.getTime()}-${i}`}
              icon={p.type === 'check_in' ? 'log-in-outline' : 'log-out-outline'}
              iconTone={p.accepted ? 'primary' : 'danger'}
              title={t(p.type === 'check_in' ? 'in_label' : 'out_label')}
              subtitle={p.accepted ? undefined : t(reasonKey(p.reason, hasKey))}
              last={i === punches.data.length - 1}
              trailing={
                <View style={{ alignItems: 'center', gap: space.xs }}>
                  <Txt numeric weight="bold">{hm(p.at)}</Txt>
                  <Badge label={t(p.accepted ? 'accepted' : 'rejected')} tone={p.accepted ? 'ok' : 'danger'} />
                </View>
              }
            />
          ))}
        </Card>
      )}
    </Section>
  );
}
