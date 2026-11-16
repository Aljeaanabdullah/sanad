// Leave request (PRD 7.1, 18.2): type, start and end dates with a live day count, optional reason.
// Goes employee -> supervisor -> HR; the server refuses overlaps, locked periods and bad dates.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useDateTimePicker } from '../../components/requests/DateTimePicker';
import { Button, Chip, Field, Header, Notice, PickerField, Row, Screen, Txt, useSnackbar } from '../../components/ui';
import { LEAVE_TYPES, submitLeave } from '../../lib/api';
import { longDate } from '../../lib/dates';
import { errorKey, leaveDays, leaveRange, leaveReason, leaveTypeLabel, LEAVE_MAX_DAYS, startOfDay, validateLeave } from '../../lib/requestsView';
import { useSettings } from '../../lib/settings';
import { space } from '../../lib/theme';

export default function LeaveScreen() {
  const { t, lang } = useSettings();
  const router = useRouter();
  const snack = useSnackbar();
  const picker = useDateTimePicker();
  const [type, setType] = useState<string>(LEAVE_TYPES[0]);
  const [from, setFrom] = useState<Date | null>(null);
  const [to, setTo] = useState<Date | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const today = startOfDay(new Date());
  const range = leaveRange(today);
  const days = leaveDays(from, to);

  const pick = async (which: 'from' | 'to') => {
    const isFrom = which === 'from';
    const d = await picker.date({
      value: isFrom ? from ?? today : to ?? from ?? today,
      min: isFrom ? range.min : from ?? range.min,
      max: range.max,
      title: t(isFrom ? 'leave_start' : 'leave_end'),
    });
    if (!d) return;
    setError(null);
    if (isFrom) {
      setFrom(d);
      if (to && to < d) setTo(d);
    } else {
      setTo(d);
    }
  };

  const send = async () => {
    const problem = validateLeave({ from, to, today });
    if (problem) {
      setError(t(problem));
      return;
    }
    setSending(true);
    setError(null);
    try {
      await submitLeave({ leaveType: type, from: from!, to: to!, reason: leaveReason(reason, type) });
      snack(t('leave_sent_body'), 'ok');
      router.back();
    } catch (e) {
      setError(t(errorKey(e)));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Header title={t('leave_request')} back />
      <Screen footer={<Button testID="leaveSend" label={t('leave_send')} icon="send" loading={sending} onPress={send} />}>
        <View style={{ gap: space.sm }}>
          <Txt variant="label" weight="medium">{t('leave_type')}</Txt>
          <Row gap={space.sm} wrap>
            {LEAVE_TYPES.map((lt) => (
              <Chip key={lt} label={leaveTypeLabel(t, lt)} selected={type === lt} onPress={() => setType(lt)} />
            ))}
          </Row>
        </View>
        <PickerField label={t('leave_start')} value={from ? longDate(from, lang) : null} placeholder={t('leave_choose_date')} onPress={() => pick('from')} />
        <PickerField label={t('leave_end')} value={to ? longDate(to, lang) : null} placeholder={t('leave_choose_date')} onPress={() => pick('to')} />
        {days != null ? (
          <Notice
            tone={days > LEAVE_MAX_DAYS ? 'warn' : 'neutral'}
            icon="calendar-number-outline"
            text={days > LEAVE_MAX_DAYS ? `${t('leave_days_count', { n: days })} · ${t('req_leave_max', { n: LEAVE_MAX_DAYS })}` : t('leave_days_count', { n: days })}
          />
        ) : null}
        <Field label={t('leave_reason')} value={reason} onChangeText={setReason} multiline maxLength={300} />
        <Txt variant="caption" tone="muted">{t('leave_path_note')}</Txt>
        {error ? <Notice tone="danger" text={error} /> : null}
      </Screen>
      {picker.element}
    </>
  );
}
