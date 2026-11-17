// Sanad brand pieces: the logo (the Sanad bot's head, owner decision 2026-11-17, PRD 12), the
// wordmark, and a language toggle for the teal band. The full-colour head sits on rail teal here and
// in the side menu; the animated head on the Sanad button is components/nav/SanadMark.
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettings } from '../../lib/settings';
import { brand, fonts, radius, space, TOUCH, type } from '../../lib/theme';
import { Row, useDir } from '../ui';

const MUTED_ON_RAIL = brand.railInk; // same as the Header subtitle

const LOGO = require('../../../assets/bot/head.png');
/** The head's box is a little wider than tall (tools/sanad-bot). */
const LOGO_RATIO = 409 / 480;

/**
 * The Sanad logo (the bot's head, full colour). `size` is its width; the height follows, never stretched.
 * `decorative` hides it from screen readers (inside a labelled control).
 */
export function BrandMark({ size = 56, decorative }: { size?: number; decorative?: boolean }) {
  const { t } = useSettings();
  return (
    <Image
      source={LOGO}
      resizeMode="contain"
      accessible={!decorative}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityLabel={decorative ? undefined : t('auth_logo_label')}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}
      style={{ width: size, height: Math.round(size * LOGO_RATIO) }}
    />
  );
}

/** «سَنَد» in white on the teal band, Readex Pro 700. */
export function Wordmark({ size = 'display' }: { size?: 'display' | 'title' }) {
  const { t } = useSettings();
  const big = size === 'display';
  return (
    <Text
      accessibilityRole="header"
      style={{ fontFamily: fonts.black, fontSize: big ? 52 : type.title.fontSize + 6, lineHeight: big ? 72 : 40, color: brand.onRail, writingDirection: 'rtl' }}
    >
      {t('auth_wordmark')}
    </Text>
  );
}

/** Small pill on the teal band that switches Arabic <-> English. */
export function LangToggle() {
  const { t, lang, update } = useSettings();
  const d = useDir();
  return (
    <Pressable
      onPress={() => update({ lang: lang === 'ar' ? 'en' : 'ar' })}
      accessibilityRole="button"
      accessibilityLabel={t('auth_switch_lang')}
      hitSlop={4}
      style={({ pressed }) => ({
        minHeight: TOUCH,
        justifyContent: 'center',
        paddingHorizontal: space.md,
        borderRadius: radius.pill,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ flexDirection: d.row, alignItems: 'center', gap: space.xs, borderWidth: 1, borderColor: 'rgba(193,220,217,0.45)', borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6 }}>
        <Ionicons name="globe-outline" size={16} color={brand.onRail} />
        <Text style={[type.label, { fontFamily: fonts.medium, color: brand.onRail }]}>{t('auth_other_lang')}</Text>
      </View>
    </Pressable>
  );
}

/**
 * The teal band at the top of the login screen: language toggle, logo + wordmark, one-line purpose.
 * `folded` hides the purpose line (while the keyboard is up) so the fields keep their room.
 */
export function LoginHero({ folded }: { folded?: boolean }) {
  const insets = useSafeAreaInsets();
  const { t } = useSettings();
  const d = useDir();
  return (
    <View style={{ backgroundColor: brand.rail, paddingTop: insets.top + space.sm, paddingBottom: folded ? space.md : space.xl, paddingHorizontal: space.lg }}>
      <Row justify="flex-end">
        <LangToggle />
      </Row>
      <Row gap={space.sm} style={{ marginTop: folded ? 0 : space.sm }}>
        <BrandMark size={folded ? 44 : 60} />
        <Wordmark size="title" />
      </Row>
      {folded ? null : (
        <Text style={[type.body, { fontFamily: fonts.regular, color: MUTED_ON_RAIL, textAlign: d.align, writingDirection: d.writing, marginTop: space.xs }]}>
          {t('auth_purpose')}
        </Text>
      )}
    </View>
  );
}

export { MUTED_ON_RAIL };
