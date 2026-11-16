// Punch correction: shift day (last 7 days), check-in or check-out, the correct time, reason.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useDateTimePicker, type HourMinute } from '../../components/requests/DateTimePicker';
import { Button, Field, Header, Notice, PickerField, Screen, Segmented, Txt, useSnackbar } from '../../components/ui';
import { submitCorrection } from '../../lib/api';
import { longDate } from '../../lib/dates';
import { correctionInstants, correctionRange, errorKey, startOfDay, validateCorrection } from '../../lib/requestsView';
import { useSettings } from '../../lib/settings';
import { space } from '../../lib/theme';

type PunchType = 'check_in' | 'check_out';
const pad = (n: number) => String(n).padStart(2, '0');

export default function CorrectionScreen() {
  const { t, lang } = useSettings();
  const router = useRouter();
  const snack = useSnackbar();
  const picker = useDateTimePicker();
  const [date, setDate] = useState<Date | null>(null);
  const [punchType, setPunchType] = useState<PunchType>('check_in');
  const [time, setTime] = useState<HourMinute | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const today = startOfDay(new Date());
  const range = correctionRange(today);

  const pickDate = async () => {
    const d = await picker.date({ value: date ?? new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1), min: range.min, max: range.max });
    if (d) {
      setDate(d);
      setError(null);
    }
  };

  const pickTime = async () => {
    const v = await picker.time({ value: time ?? { hour: punchType === 'check_in' ? 7 : 14, minute: 0 } });
    if (v) {
      setTime(v);
      setError(null);
    }
  };

  const send = async () => {
    const problem = validateCorrection({ date, time, reason, today, now: new Date() });
    if (problem) {
      setError(t(problem));
      return;
    }
    setSending(true);
    setError(null);
    try {
      // A night-shift check-out after midnight falls on the next day: try the shift day first.
      const tries = correctionInstants(date!, time!.hour, time!.minute, punchType);
      for (let i = 0; i < tries.length; i++) {
        try {
          await submitCorrection({ shiftDate: date!, punchType, time: tries[i], reason: reason.trim() });
          break;
        } catch (e) {
          const code = (e as { code?: string }).code;
          if (i === tries.length - 1 || code !== 'time_outside_shift') throw e;
        }
      }
      snack(t('sent'), 'ok');
      router.back();
    } catch (e) {
      setError(t(errorKey(e)));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Header title={t('new_request_correction')} back />
      <Screen footer={<Button testID="sendCorrection" label={t('send')} icon="send" loading={sending} onPress={send} />}>
        <Notice tone="info" text={t('correction_hint')} />
        <PickerField
          label={t('shift_day')}
          value={date ? longDate(date, lang) : null}
          placeholder={t('choose_date')}
          onPress={pickDate}
        />
        <View style={{ gap: space.xs }}>
          <Txt variant="label" weight="medium">{t('req_punch_kind')}</Txt>
          <Segmented<PunchType>
            options={[
              { value: 'check_in', label: t('in_label') },
              { value: 'check_out', label: t('out_label') },
            ]}
            value={punchType}
            onChange={setPunchType}
          />
        </View>
        <PickerField
          label={t('requested_time')}
          value={time ? `${pad(time.hour)}:${pad(time.minute)}` : null}
          placeholder={t('choose_time')}
          icon="time-outline"
          onPress={pickTime}
        />
        <Field
          label={t('reason')}
          value={reason}
          onChangeText={setReason}
          multiline
          maxLength={1000}
          helper={t('req_reason_hint')}
        />
        {error ? <Notice tone="danger" text={error} /> : null}
      </Screen>
      {picker.element}
    </>
  );
}
