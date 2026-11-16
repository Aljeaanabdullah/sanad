// Home hero (inside the navy header): the current shift, its status, and the punch button.
// The button is the app's best guess (in or out); the server decides in the end.
import { View } from 'react-native';
import type { PunchEntry, ShiftInfo } from '../../lib/api';
import { hm, longDate } from '../../lib/dates';
import { shiftCard, type PunchKind } from '../../lib/punch';
import { useSettings } from '../../lib/settings';
import { space } from '../../lib/theme';
import { Button, Card, Icon, Row, Skeleton, Txt, type IconName } from '../ui';
import type { Block } from './block';

const TONE_ICON: Record<string, { icon: IconName; tone: 'ok' | 'danger' | 'accent' | 'muted' | 'primary' }> = {
  ok: { icon: 'checkmark-circle', tone: 'ok' },
  warn: { icon: 'alert-circle', tone: 'accent' },
  danger: { icon: 'close-circle', tone: 'danger' },
  info: { icon: 'time-outline', tone: 'primary' },
  neutral: { icon: 'time-outline', tone: 'muted' },
};

export function PunchCard({ shift, punches, onPunch }: { shift: Block<ShiftInfo | null>; punches: PunchEntry[] | null; onPunch: (next: PunchKind | null) => void }) {
  const { t, lang } = useSettings();

  if (shift.state === 'loading') {
    return (
      <Card>
        <View style={{ gap: space.sm }}>
          <Skeleton height={18} width="40%" />
          <Skeleton height={14} width="65%" />
          <Skeleton height={60} radius={16} style={{ marginTop: space.sm }} />
        </View>
      </Card>
    );
  }

  const punchButton = (next: PunchKind | null, disabled = false) => (
    <Button
      testID="home-punch"
      size="lg"
      kind={next === 'check_out' ? 'danger' : 'gold'}
      icon={next === 'check_out' ? 'log-out-outline' : 'finger-print'}
      label={t(next === 'check_out' ? 'home_check_out' : 'home_check_in')}
      disabled={disabled}
      onPress={() => onPunch(next)}
    />
  );

  if (shift.state === 'error') {
    return (
      <Card>
        <View style={{ gap: space.md }}>
          <Txt variant="heading">{t('shift_title')}</Txt>
          <Txt tone="muted">{t('home_shift_error')}</Txt>
          {punchButton(null)}
        </View>
      </Card>
    );
  }

  const s = shift.data;
  if (!s) {
    return (
      <Card>
        <Row gap={space.md}>
          <Icon name="calendar-clear-outline" tone="muted" size={26} />
          <Txt weight="medium" style={{ flex: 1 }}>{t('home_no_shift_today')}</Txt>
        </Row>
      </Card>
    );
  }

  const now = new Date();
  const card = shiftCard(s, punches, now);
  const vars = { minutes: card.status.minutes ?? 0, time: card.status.time ? hm(card.status.time) : '' };
  const ti = TONE_ICON[card.tone];
  const beforeWindow = now < s.checkinOpens && card.next === 'check_in';

  return (
    <Card testID="home-shift">
      <View style={{ gap: space.md }}>
        {card.upcoming ? <Txt weight="medium">{t('home_no_shift_today')}</Txt> : null}
        <View style={{ gap: space.xs }}>
          <Txt variant="heading">{card.upcoming ? t('home_next_shift', { date: longDate(s.start, lang) }) : t('shift_title')}</Txt>
          <Txt numeric tone="muted" weight="medium">{`${hm(s.start)} – ${hm(s.end)}`}</Txt>
        </View>
        <Row gap={space.sm}>
          <Icon name={ti.icon} tone={ti.tone} size={20} />
          <Txt weight="medium" style={{ flex: 1 }}>{t(card.status.key, vars)}</Txt>
        </Row>
        {card.next === null ? (
          <Txt tone="muted">{t('home_done_today')}</Txt>
        ) : card.upcoming ? null : (
          punchButton(card.next, beforeWindow)
        )}
      </View>
    </Card>
  );
}
