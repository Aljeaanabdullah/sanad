// Sanad brand pieces for the sign-in flow only (setup and login): the temporary logo
// (the letter «س» in a gold diamond, PRD 12), the gold wordmark, and a language toggle for the navy band.
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettings } from '../../lib/settings';
import { brand, fonts, radius, space, TOUCH, type } from '../../lib/theme';
import { Row, useDir } from '../ui';

const MUTED_ON_NAVY = '#C9D3E3'; // same as the Header subtitle

/** The «س» in a gold diamond. */
export function BrandMark({ size = 56 }: { size?: number }) {
  const { t } = useSettings();
  const side = size / Math.SQRT2; // the rotated square fits inside `size`
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={t('auth_logo_label')} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          position: 'absolute',
          width: side,
          height: side,
          borderRadius: Math.max(4, side * 0.18),
          borderWidth: 2,
          borderColor: brand.gold,
          backgroundColor: 'rgba(201,162,75,0.12)',
          transform: [{ rotate: '45deg' }],
        }}
      />
      <Text style={{ fontFamily: fonts.black, fontSize: size * 0.42, lineHeight: size * 0.6, color: brand.gold, includeFontPadding: false }}>
        {t('auth_logo_letter')}
      </Text>
    </View>
  );
}

/** «سَنَد» in gold, Tajawal 800. */
export function Wordmark({ size = 'display' }: { size?: 'display' | 'title' }) {
  const { t } = useSettings();
  const big = size === 'display';
  return (
    <Text
      accessibilityRole="header"
      style={{ fontFamily: fonts.black, fontSize: big ? 52 : type.title.fontSize + 6, lineHeight: big ? 72 : 40, color: brand.gold, writingDirection: 'rtl' }}
    >
      {t('auth_wordmark')}
    </Text>
  );
}

/** Small pill on the navy band that switches Arabic <-> English. */
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
      <View style={{ flexDirection: d.row, alignItems: 'center', gap: space.xs, borderWidth: 1, borderColor: 'rgba(246,241,230,0.35)', borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6 }}>
        <Ionicons name="globe-outline" size={16} color={brand.cream} />
        <Text style={[type.label, { fontFamily: fonts.medium, color: brand.cream }]}>{t('auth_other_lang')}</Text>
      </View>
    </Pressable>
  );
}

/**
 * The navy band at the top of the login screen: language toggle, logo + wordmark, one-line purpose.
 * `folded` hides the purpose line (while the keyboard is up) so the fields keep their room.
 */
export function LoginHero({ folded }: { folded?: boolean }) {
  const insets = useSafeAreaInsets();
  const { t } = useSettings();
  const d = useDir();
  return (
    <View style={{ backgroundColor: brand.navy, paddingTop: insets.top + space.sm, paddingBottom: folded ? space.md : space.xl, paddingHorizontal: space.lg }}>
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
