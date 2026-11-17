// The side menu (PRD 18.2, owner decision 2026-11-17): the mobile twin of the web panel's rail.
// It slides in from the reading start's far edge (right in Arabic, left in English), lists every
// section in rail teal, and marks the current one with the web's lit disc. Back or a tap outside closes it.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isCurrent, menuGroups, type MenuItem } from '../../lib/nav';
import { useSession } from '../../lib/session';
import { useSettings } from '../../lib/settings';
import { fonts, radius, space, TOUCH, type } from '../../lib/theme';
import { BrandMark, Wordmark } from '../auth/Brand';
import { IconButton, Row, useDir } from '../ui';

const DURATION = 220;

export function SideMenu({ open, pathname, onClose, onGo }: { open: boolean; pathname: string; onClose: () => void; onGo: (href: string) => void }) {
  const { c, t, lang } = useSettings();
  const { profile } = useSession();
  const insets = useSafeAreaInsets();
  const d = useDir();
  const { width: screen } = useWindowDimensions();
  const width = Math.min(320, Math.round(screen * 0.84));
  const anim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(open);
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce, () => {});
  }, []);

  useEffect(() => {
    if (open) setMounted(true);
    Animated.timing(anim, {
      toValue: open ? 1 : 0,
      duration: reduce ? 0 : DURATION,
      easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !open) setMounted(false);
    });
  }, [open, anim, reduce]);

  if (!mounted) return null;

  // Arabic: the panel sits on the right and slides in from off-screen right (+x); English mirrors it.
  const off = d.rtl ? width : -width;
  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [off, 0] });
  const name = (lang === 'ar' ? profile?.nameAr : profile?.nameEn) ?? '';
  const groups = menuGroups(profile?.role ?? 'employee');
  const divider = 'rgba(255,255,255,0.12)';

  return (
    <Modal visible transparent statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(4,20,22,0.55)', opacity: anim }]}>
        <Pressable testID="menu-backdrop" style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('menu_close')} />
      </Animated.View>
      <Animated.View
        testID="side-menu"
        accessibilityViewIsModal
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          [d.rtl ? 'right' : 'left']: 0,
          width,
          backgroundColor: c.bar,
          borderColor: c.line,
          [d.rtl ? 'borderLeftWidth' : 'borderRightWidth']: c.dark ? StyleSheet.hairlineWidth : 0,
          transform: [{ translateX }],
          paddingTop: insets.top + space.sm,
          paddingBottom: insets.bottom + space.sm,
        }}
      >
        <Row justify="space-between" style={{ paddingHorizontal: space.lg }}>
          <Row gap={space.sm}>
            <BrandMark size={40} />
            <Wordmark size="title" />
          </Row>
          <IconButton icon="close" label={t('menu_close')} onPress={onClose} color={c.barInk} />
        </Row>
        {name ? (
          <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md }}>
            <Text numberOfLines={1} style={[type.body, { fontFamily: fonts.medium, color: c.barInk, textAlign: d.align, writingDirection: d.writing }]}>{name}</Text>
            <Row gap={space.xs}>
              <Text style={[type.caption, { fontFamily: fonts.regular, color: c.barMuted }]}>{t('file_no_label')}</Text>
              <Text style={[type.caption, { fontFamily: fonts.medium, color: c.barMuted, writingDirection: 'ltr', fontVariant: ['tabular-nums'] }]}>{String(profile?.fileNumber ?? '')}</Text>
            </Row>
          </View>
        ) : null}
        <ScrollView accessibilityRole="menu" accessibilityLabel={t('menu_title')} contentContainerStyle={{ paddingHorizontal: space.md, paddingBottom: space.lg }}>
          {groups.map((g, gi) => (
            <View key={gi} style={{ paddingVertical: space.sm, borderTopWidth: gi ? StyleSheet.hairlineWidth : 0, borderTopColor: divider, gap: 2 }}>
              {g.map((item) => (
                <MenuRow key={item.key} item={item} current={isCurrent(item.href, pathname)} onPress={() => onGo(item.href)} />
              ))}
            </View>
          ))}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

function MenuRow({ item, current, onPress }: { item: MenuItem; current: boolean; onPress: () => void }) {
  const { c, t } = useSettings();
  const d = useDir();
  return (
    <Pressable
      testID={`menu-${item.key}`}
      onPress={onPress}
      accessibilityRole="menuitem"
      accessibilityState={{ selected: current }}
      accessibilityLabel={t(item.label)}
      android_ripple={{ color: c.barOn }}
      style={({ pressed }) => ({
        minHeight: TOUCH + 2,
        borderRadius: radius.sm,
        paddingHorizontal: space.md,
        flexDirection: d.row,
        alignItems: 'center',
        gap: space.md,
        backgroundColor: current ? c.barOn : pressed ? 'rgba(255,255,255,0.06)' : 'transparent',
      })}
    >
      {/* The current screen carries one lit disc, as in the web rail. */}
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: current ? c.barDot : 'transparent' }} />
      <Ionicons name={current ? item.iconOn : item.icon} size={22} color={current ? c.barInk : c.barMuted} />
      <Text
        numberOfLines={1}
        style={[type.body, { flex: 1, fontFamily: current ? fonts.semibold : fonts.regular, color: current ? c.barInk : c.barMuted, textAlign: d.align, writingDirection: d.writing }]}
      >
        {t(item.label)}
      </Text>
    </Pressable>
  );
}
