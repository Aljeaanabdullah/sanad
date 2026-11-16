// First launch (PRD 12): choose language and light/dark, then the guard moves on to sign-in.
// The one brand moment of the app: navy full-bleed with the gold wordmark. The choices sit on a
// panel in the chosen theme's background so the user sees the theme change at once.
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark, MUTED_ON_NAVY, Wordmark } from '../components/auth/Brand';
import { Button, Segmented, Txt } from '../components/ui';
import type { Lang } from '../lib/i18n';
import { useSettings, type ThemeMode } from '../lib/settings';
import { brand, fonts, radius, space, type } from '../lib/theme';

export default function SetupScreen() {
  const { t, c, lang, theme, update } = useSettings();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: brand.navy }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} bounces={false}>
        <View style={{ flex: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center', paddingTop: insets.top + space.xl, paddingBottom: space.xl, paddingHorizontal: space.xl, gap: space.sm }}>
          <BrandMark size={72} />
          <Wordmark />
          <Text style={[type.body, { fontFamily: fonts.medium, color: MUTED_ON_NAVY, textAlign: 'center' }]}>{t('auth_purpose')}</Text>
        </View>

        <View
          style={{
            // In dark mode the background is almost the hero navy; the raised surface keeps the panel visible.
            backgroundColor: c.dark ? c.surface : c.bg,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            paddingHorizontal: space.lg,
            paddingTop: space.xl,
            paddingBottom: insets.bottom + space.lg,
            gap: space.lg,
          }}
        >
          <View style={{ gap: space.sm }}>
            <Txt variant="heading">{t('choose_language')}</Txt>
            <Segmented<Lang>
              options={[
                { value: 'ar', label: t('auth_lang_ar') },
                { value: 'en', label: t('auth_lang_en') },
              ]}
              value={lang}
              onChange={(v) => update({ lang: v })}
            />
          </View>
          <View style={{ gap: space.sm }}>
            <Txt variant="heading">{t('choose_theme')}</Txt>
            <Segmented<ThemeMode>
              options={[
                { value: 'light', label: t('light') },
                { value: 'dark', label: t('dark') },
              ]}
              value={theme}
              onChange={(v) => update({ theme: v })}
            />
          </View>
          <Txt variant="caption" tone="muted">{t('auth_setup_later')}</Txt>
          <Button label={t('continue')} size="lg" onPress={() => update({ setupDone: true })} testID="setup-continue" />
        </View>
      </ScrollView>
    </View>
  );
}
