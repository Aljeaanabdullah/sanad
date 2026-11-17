// Signed-in screens. The four sections are the root; everything else is pushed on top with system Back.
// AppNav adds the side menu and the Sanad button. PushBridge keeps the push token fresh and opens the
// screen of a tapped notification.
import { Stack } from 'expo-router';
import { AppNav } from '../../components/nav/AppNav';
import { PushBridge } from '../../components/PushBridge';
import { useSettings } from '../../lib/settings';

export default function AppLayout() {
  const { c, rtl } = useSettings();
  return (
    <AppNav>
      <PushBridge />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.bg },
          animation: rtl ? 'slide_from_left' : 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="punch" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
      </Stack>
    </AppNav>
  );
}
