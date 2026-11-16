// The vertical step list of the punch flow: checks -> Face ID / fingerprint -> photo -> sending.
import { StyleSheet, View } from 'react-native';
import { useSettings } from '../../lib/settings';
import { space } from '../../lib/theme';
import { STEPS, type StepId, type StepState } from '../../lib/punch';
import { Card, Icon, Row, Txt, type IconName } from '../ui';

const ICON: Record<StepState, { name: IconName; tone: 'muted' | 'accent' | 'ok' | 'danger' }> = {
  pending: { name: 'ellipse-outline', tone: 'muted' },
  current: { name: 'radio-button-on', tone: 'accent' },
  done: { name: 'checkmark-circle', tone: 'ok' },
  failed: { name: 'close-circle', tone: 'danger' },
};

/** Progress text under the running step (shared strings). */
const RUNNING: Record<StepId, string> = {
  checks: 'punch_step_checks',
  biometric: 'punch_step_biometric',
  photo: 'punch_step_photo',
  sending: 'punch_sending',
};

export function PunchSteps({ states }: { states: Record<StepId, StepState> }) {
  const { t, c } = useSettings();
  return (
    <Card padded={false}>
      {STEPS.map((s, i) => {
        const st = states[s];
        const label = t(`punch_step_label_${s}`);
        return (
          <View key={s} accessible accessibilityLabel={`${label}: ${t(`punch_state_${st}`)}`} testID={`step-${s}-${st}`}>
            <Row gap={space.md} style={{ minHeight: 52, paddingHorizontal: space.lg, paddingVertical: space.sm }}>
              <Icon name={ICON[st].name} tone={ICON[st].tone} size={22} />
              <View style={{ flex: 1 }}>
                <Txt weight={st === 'current' ? 'bold' : 'medium'} tone={st === 'pending' ? 'muted' : 'default'}>{label}</Txt>
                {st === 'current' ? <Txt variant="caption" tone="muted">{t(RUNNING[s])}</Txt> : null}
              </View>
              {st === 'done' || st === 'failed' ? (
                <Txt variant="caption" tone={st === 'done' ? 'ok' : 'danger'} weight="bold">{t(`punch_state_${st}`)}</Txt>
              ) : null}
            </Row>
            {i < STEPS.length - 1 ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.line, marginHorizontal: space.lg }} /> : null}
          </View>
        );
      })}
    </Card>
  );
}
