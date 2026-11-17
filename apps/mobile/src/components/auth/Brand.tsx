// Sanad brand pieces: the temporary logo (the letter «س» in a turquoise diamond, PRD 12), the white
// wordmark, and a language toggle for the rail-teal band of the sign-in flow. BrandMark is also the
// mark on the round Sanad button.
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettings } from '../../lib/settings';
import { brand, fonts, radius, space, TOUCH, type } from '../../lib/theme';
import { Row, useDir } from '../ui';

const MUTED_ON_NAVY = '#c1dcd9'; // rail ink, same as the Header subtitle

/** The «س» in a turquoise diamond. `color` changes the line and letter (e.g. dark ink on a turquoise fill). */
export function BrandMark({ size = 56, color = brand.glow, decorative }: { size?: number; color?: string; decorative?: boolean }) {
  const { t } = useSettings();
  const side = size / Math.SQRT2; // the rotated square fits inside `size`
  return (
    <View
      accessible={!decorative}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityLabel={decorative ? undefined : t('auth_logo_label')}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          position: 'absolute',
          width: side,
          height: side,
          borderRadius: Math.max(4, side * 0.18),
          borderWidth: 2,
          borderColor: color,
          backgroundColor: `${color}1f`, // the line colour at 12%
          transform: [{ rotate: '45deg' }],
        }}
      />
      <Text style={{ fontFamily: fonts.black, fontSize: size * 0.42, lineHeight: size * 0.6, color, includeFontPadding: false }}>
        {t('auth_logo_letter')}
      </Text>
    </View>
  );
}

/** «سَنَد» in white, Readex Pro 700 (as in the web rail). */
export function Wordmark({ size = 'display' }: { size?: 'display' | 'title' }) {
  const { t } = useSettings();
  const big = size === 'display';
  return (
    <Text
      accessibilityRole="header"
      style={{ fontFamily: fonts.black, fontSize: big ? 52 : type.title.fontSize + 6, lineHeight: big ? 72 : 40, color: brand.white, writingDirection: 'rtl' }}
    >
      {t('auth_wordmark')}
    </Text>
  );
}

/** Small pill on the rail-teal band that switches Arabic <-> English. */
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
      <View style={{ flexDirection: d.row, alignItems: 'center', gap: space.xs, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6 }}>
        <Ionicons name="globe-outline" size={16} color={brand.white} />
        <Text style={[type.label, { fontFamily: fonts.medium, color: brand.white }]}>{t('auth_other_lang')}</Text>
      </View>
    </Pressable>
  );
}

/**
 * The rail-teal band at the top of the login screen: language toggle, logo + wordmark, one-line purpose.
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
        <BrandMark size={folded ? 40 : 52} />
        <Wordmark size="title" />
      </Row>
      {folded ? null : (
        <Text style={[type.body, { fontFamily: fonts.regular, color: MUTED_ON_NAVY, textAlign: d.align, writingDirection: d.writing, marginTop: space.xs }]}>
          {t('auth_purpose')}
        </Text>
      )}
    </View>
  );
}

export { MUTED_ON_NAVY };
