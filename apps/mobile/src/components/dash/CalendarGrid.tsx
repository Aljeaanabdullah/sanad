// Month grid, Saturday first. Each day: its number, a symbol for its state and a tint; the state word
// is the accessible label, so colour is never the only signal. Plus the legend under it.
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, View } from 'react-native';
import { DAY_VIEW, LEGEND, type DayState, type MonthView } from '../../lib/calendarView';
import { mediumDate, parseYmd } from '../../lib/dates';
import { useSettings } from '../../lib/settings';
import { radius, space } from '../../lib/theme';
import { Card, Row, Txt } from '../ui';
import { tint } from './tones';

function DayCell({ day, date, state, selected, today, onPress }: {
  day: number;
  date: string;
  state: DayState;
  selected: boolean;
  today: boolean;
  onPress: () => void;
}) {
  const { c, t, lang } = useSettings();
  const v = DAY_VIEW[state];
  const k = v.tone ? tint(c, v.tone) : null;
  const fg = selected ? c.onPrimary : k ? k.fg : c.text;
  return (
    <Pressable
      testID={`day-${day}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={t('cal_day_a11y', { date: mediumDate(parseYmd(date), lang), state: t(v.label) })}
      style={({ pressed }) => ({
        flex: 1,
        height: 54,
        margin: 2,
        borderRadius: radius.sm,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        backgroundColor: selected ? c.primary : k ? k.bg : 'transparent',
        borderWidth: today ? 2 : 0,
        borderColor: c.accent,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Txt variant="label" weight={today ? 'black' : 'bold'} numeric center style={{ color: fg }}>
        {String(day)}
      </Txt>
      {v.icon ? <Ionicons name={v.icon} size={13} color={fg} /> : <View style={{ height: 13 }} />}
    </Pressable>
  );
}

export function CalendarGrid({ view, selected, today, onSelect }: {
  view: MonthView;
  selected: string | null;
  today: string;
  onSelect: (date: string) => void;
}) {
  const { t } = useSettings();
  return (
    <Card padded={false} style={{ padding: space.sm }}>
      <Row gap={0}>
        {Array.from({ length: 7 }, (_, i) => (
          <View key={i} style={{ flex: 1, paddingVertical: space.xs }} accessible accessibilityLabel={t(`wd_${i}`)}>
            <Txt variant="caption" tone="muted" center numberOfLines={1}>{t(`cal_wd_short_${i}`)}</Txt>
          </View>
        ))}
      </Row>
      {view.weeks.map((week, w) => (
        <Row key={w} gap={0}>
          {week.map((cell, i) =>
            cell ? (
              <DayCell
                key={cell.date}
                day={cell.day}
                date={cell.date}
                state={cell.state}
                selected={cell.date === selected}
                today={cell.date === today}
                onPress={() => onSelect(cell.date)}
              />
            ) : (
              <View key={`e${i}`} style={{ flex: 1, height: 54, margin: 2 }} />
            ),
          )}
        </Row>
      ))}
    </Card>
  );
}

export function CalendarLegend() {
  const { c, t } = useSettings();
  return (
    <View style={{ gap: space.sm }} accessibilityRole="summary">
      <Txt variant="label" tone="muted">{t('cal_legend')}</Txt>
      <Row wrap gap={space.md}>
        {LEGEND.map((s) => {
          const v = DAY_VIEW[s];
          const k = v.tone ? tint(c, v.tone) : { bg: c.surfaceAlt, fg: c.muted };
          return (
            <Row key={s} gap={space.xs}>
              <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: k.bg, alignItems: 'center', justifyContent: 'center' }}>
                {v.icon ? <Ionicons name={v.icon} size={14} color={k.fg} /> : null}
              </View>
              <Txt variant="label">{t(v.label)}</Txt>
            </Row>
          );
        })}
      </Row>
    </View>
  );
}
