// Date / time picking for the kit's PickerField. Android uses the system dialog
// (DateTimePickerAndroid.open); iOS shows the inline calendar or the time spinner in a sheet
// with Done. Both return a promise: the chosen value, or null when dismissed.
import RNDateTimePicker, { DateTimePickerAndroid, type DateTimePickerChangeEvent } from '@react-native-community/datetimepicker';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Platform, View } from 'react-native';
import { locale } from '../../lib/dates';
import { useSettings } from '../../lib/settings';
import { space } from '../../lib/theme';
import { Button, Row } from '../ui';
import { Sheet } from './Sheet';

export type HourMinute = { hour: number; minute: number };

type DateOpts = { value?: Date | null; min?: Date; max?: Date; title?: string };
type TimeOpts = { value?: HourMinute | null; title?: string };

type Pending = {
  mode: 'date' | 'time';
  value: Date;
  min?: Date;
  max?: Date;
  title: string;
  resolve: (d: Date | null) => void;
};

const clamp = (d: Date, min?: Date, max?: Date) => (min && d < min ? min : max && d > max ? max : d);
const timeToDate = (v?: HourMinute | null) => {
  const d = new Date();
  d.setHours(v?.hour ?? 7, v?.minute ?? 0, 0, 0);
  return d;
};

/**
 * `const picker = useDateTimePicker();` then `await picker.date({...})` or `await picker.time({...})`,
 * and render `{picker.element}` once in the screen (it is empty on Android).
 */
export function useDateTimePicker(): {
  date: (o: DateOpts) => Promise<Date | null>;
  time: (o: TimeOpts) => Promise<HourMinute | null>;
  element: ReactNode;
} {
  const { t, lang, c } = useSettings();
  const [pending, setPending] = useState<Pending | null>(null);
  const draft = useRef<Date | null>(null);
  const [, force] = useState(0);

  const open = useCallback(
    (mode: 'date' | 'time', value: Date, title: string, min?: Date, max?: Date) =>
      new Promise<Date | null>((resolve) => {
        if (Platform.OS === 'android') {
          DateTimePickerAndroid.open({
            mode,
            value,
            minimumDate: min,
            maximumDate: max,
            is24Hour: true,
            onValueChange: (_e: DateTimePickerChangeEvent, d: Date) => resolve(d),
            onDismiss: () => resolve(null),
          });
          return;
        }
        draft.current = value;
        setPending({ mode, value, min, max, title, resolve });
      }),
    [],
  );

  const date = useCallback(
    async (o: DateOpts) => {
      const initial = clamp(o.value ?? new Date(), o.min, o.max);
      const d = await open('date', initial, o.title ?? t('choose_date'), o.min, o.max);
      return d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : null;
    },
    [open, t],
  );

  const time = useCallback(
    async (o: TimeOpts) => {
      const d = await open('time', timeToDate(o.value), o.title ?? t('choose_time'));
      return d ? { hour: d.getHours(), minute: d.getMinutes() } : null;
    },
    [open, t],
  );

  const finish = (ok: boolean) => {
    if (!pending) return;
    pending.resolve(ok ? draft.current ?? pending.value : null);
    setPending(null);
  };

  const element = pending ? (
    <Sheet visible onClose={() => finish(false)} title={pending.title}>
      <View style={{ alignItems: 'center' }}>
        <RNDateTimePicker
          value={draft.current ?? pending.value}
          mode={pending.mode}
          display={pending.mode === 'date' ? 'inline' : 'spinner'}
          minimumDate={pending.min}
          maximumDate={pending.max}
          locale={locale(lang)}
          themeVariant={c.dark ? 'dark' : 'light'}
          accentColor={c.accent}
          textColor={c.text}
          onValueChange={(_e: DateTimePickerChangeEvent, d: Date) => {
            draft.current = d;
            force((n) => n + 1);
          }}
        />
      </View>
      <Row gap={space.md}>
        <View style={{ flex: 1 }}>
          <Button label={t('req_picker_cancel')} kind="secondary" onPress={() => finish(false)} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label={t('req_picker_done')} onPress={() => finish(true)} />
        </View>
      </Row>
    </Sheet>
  ) : null;

  return { date, time, element };
}
