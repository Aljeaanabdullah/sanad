// Previous / next month bar (dashboard period, calendar month). The kit's IconButton has no disabled
// state, so this draws its own 48dp buttons; "next" is dimmed and inert at the newest month.
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, View } from 'react-native';
import { useSettings } from '../../lib/settings';
import { space, TOUCH } from '../../lib/theme';
import { Card, Row, Txt, useDir, type IconName } from '../ui';

function Arrow({ icon, label, onPress, disabled, testID }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean; testID?: string }) {
  const { c } = useSettings();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={4}
      style={({ pressed }) => ({
        width: TOUCH,
        height: TOUCH,
        borderRadius: TOUCH / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: c.surfaceAlt,
        opacity: disabled ? 0.35 : pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name={icon} size={22} color={c.text} />
    </Pressable>
  );
}

export function MonthSwitcher({ title, subtitle, onPrev, onNext, canNext, busy }: {
  title: string;
  subtitle?: string;
  onPrev: () => void;
  onNext: () => void;
  canNext: boolean;
  busy?: boolean;
}) {
  const { t } = useSettings();
  const d = useDir();
  // "Previous" sits on the reading start and points to it (right in Arabic).
  const prevIcon: IconName = d.rtl ? 'chevron-forward' : 'chevron-back';
  return (
    <Card padded={false} style={{ paddingVertical: space.sm, paddingHorizontal: space.sm }}>
      <Row gap={space.sm}>
        <Arrow testID="month-prev" icon={prevIcon} label={t('prev_month')} onPress={onPrev} disabled={busy} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Txt variant="heading" center numberOfLines={1}>{title}</Txt>
          {subtitle ? <Txt variant="caption" tone="muted" center numberOfLines={1}>{subtitle}</Txt> : null}
        </View>
        <Arrow testID="month-next" icon={d.forward} label={t('next_month')} onPress={onNext} disabled={busy || !canNext} />
      </Row>
    </Card>
  );
}
