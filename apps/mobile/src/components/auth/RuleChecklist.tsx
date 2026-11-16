// The live password checklist on the change-password screen (rules from src/lib/passwordRules.ts).
import { View } from 'react-native';
import type { RuleCheck } from '../../lib/passwordRules';
import { useSettings } from '../../lib/settings';
import { space } from '../../lib/theme';
import { Card, Icon, Row, Txt } from '../ui';

/** Rules that are broken by what was typed (not just "not reached yet") are shown in red. */
function isBroken(r: RuleCheck, typed: boolean) {
  return !r.ok && typed && (r.id === 'max_length' || r.id === 'match' || r.id === 'no_file_number');
}

export function RuleChecklist({ rules, typed }: { rules: RuleCheck[]; typed: boolean }) {
  const { t } = useSettings();
  return (
    <Card>
      <View style={{ gap: space.sm }}>
        <Txt variant="label" weight="bold">{t('auth_rules_title')}</Txt>
        {rules.map((r) => {
          const broken = isBroken(r, typed);
          const text = t(`auth_rule_${r.id}`);
          return (
            <View
              key={r.id}
              accessible
              accessibilityLabel={`${text}: ${t(r.ok ? 'auth_rule_done' : 'auth_rule_todo')}`}
              testID={`rule-${r.id}-${r.ok ? 'ok' : 'todo'}`}
            >
              <Row gap={space.sm}>
                <Icon name={r.ok ? 'checkmark-circle' : broken ? 'close-circle' : 'ellipse-outline'} size={20} tone={r.ok ? 'ok' : broken ? 'danger' : 'muted'} />
                <Txt variant="label" tone={r.ok ? 'default' : broken ? 'danger' : 'muted'} style={{ flex: 1 }}>{text}</Txt>
              </Row>
            </View>
          );
        })}
      </View>
    </Card>
  );
}
