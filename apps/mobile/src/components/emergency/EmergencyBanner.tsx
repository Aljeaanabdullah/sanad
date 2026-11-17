// Home banner for an active emergency (PRD 8.4). Checks when Home is shown and whenever the app comes
// back to the foreground. The first time an unanswered emergency is seen, the emergency screen opens by
// itself (once per emergency, so Back returns to Home).
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, View } from 'react-native';
import { myActiveEmergency } from '../../lib/emergency';
import type { ActiveEmergency } from '../../lib/emergencyMap';
import { useSettings } from '../../lib/settings';
import { fonts, radius, space, TOUCH } from '../../lib/theme';
import { Icon, Row, Txt, useDir } from '../ui';

const autoOpened = new Set<string>();

export function EmergencyBanner() {
  const { t, c, lang } = useSettings();
  const router = useRouter();
  const d = useDir();
  const [emergency, setEmergency] = useState<ActiveEmergency | null>(null);

  const check = useCallback(() => {
    myActiveEmergency().then(
      (e) => {
        setEmergency(e);
        if (e && !e.response && !autoOpened.has(e.id)) {
          autoOpened.add(e.id);
          router.push('/emergency');
        }
      },
      () => {},
    );
  }, [router]);

  useFocusEffect(check);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check();
    });
    return () => sub.remove();
  }, [check]);

  if (!emergency) return null;
  const site = lang === 'ar' ? emergency.site.name_ar : emergency.site.name_en;
  const fg = c.onDanger;
  return (
    <Pressable
      testID="emergency-banner"
      accessibilityRole="button"
      accessibilityLabel={t('emg_banner_title')}
      onPress={() => router.push('/emergency')}
      style={({ pressed }) => ({
        backgroundColor: c.danger,
        borderRadius: radius.md,
        padding: space.lg,
        minHeight: TOUCH,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Row gap={space.md} align="center">
        <Icon name="warning" size={32} color={fg} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="heading" style={{ color: fg, fontFamily: fonts.black }}>
            {t('emg_banner_title')} — {t(`emg_hazard_${emergency.hazard}`)} · {site}
          </Txt>
          <Txt variant="label" style={{ color: fg }}>
            {emergency.is_drill ? `${t('emg_drill')} · ` : ''}
            {t(emergency.response ? 'emg_banner_done' : 'emg_banner_body')}
          </Txt>
        </View>
        <Icon name={d.forward} size={24} color={fg} />
      </Row>
    </Pressable>
  );
}
