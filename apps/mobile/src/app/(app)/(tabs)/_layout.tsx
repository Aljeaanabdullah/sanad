// Bottom navigation (PRD 18.2): Home, Requests, Reports, More. Custom bar so the order follows
// the reading direction (Home on the right in Arabic) without restarting the app.
import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { IconName } from '../../../components/ui';
import { useSettings } from '../../../lib/settings';
import { fonts } from '../../../lib/theme';

const TABS: { name: string; label: string; icon: IconName; iconOn: IconName }[] = [
  { name: 'index', label: 'tab_home', icon: 'home-outline', iconOn: 'home' },
  { name: 'requests', label: 'tab_requests', icon: 'document-text-outline', iconOn: 'document-text' },
  { name: 'reports', label: 'tab_reports', icon: 'calendar-outline', iconOn: 'calendar' },
  { name: 'more', label: 'tab_more', icon: 'grid-outline', iconOn: 'grid' },
];

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(p) => <TabBar {...p} />}>
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} />
      ))}
    </Tabs>
  );
}

function TabBar({ state, navigateToTab }: BottomTabBarProps) {
  const { c, t, rtl } = useSettings();
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: rtl ? 'row-reverse' : 'row',
        backgroundColor: c.surface,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: c.line,
        paddingBottom: insets.bottom,
      }}
    >
      {state.routes.map((route, i) => {
        const tab = TABS.find((x) => x.name === route.name);
        if (!tab) return null;
        const on = state.index === i;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t(tab.label)}
            onPress={() => {
              if (!on) navigateToTab(route.key);
            }}
            style={{ flex: 1, minHeight: 64, alignItems: 'center', justifyContent: 'center', gap: 2 }}
          >
            <View style={{ paddingHorizontal: 18, paddingVertical: 4, borderRadius: 16, backgroundColor: on ? c.surfaceAlt : 'transparent' }}>
              <Ionicons name={on ? tab.iconOn : tab.icon} size={24} color={on ? c.primary : c.muted} />
            </View>
            <Text style={{ fontFamily: on ? fonts.bold : fonts.medium, fontSize: 12, color: on ? c.primary : c.muted }}>{t(tab.label)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
