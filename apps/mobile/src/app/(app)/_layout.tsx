// Signed-in screens. Tabs are the root; everything else is pushed on top with system Back.
import { Stack } from 'expo-router';
import { useSettings } from '../../lib/settings';

export default function AppLayout() {
  const { c, rtl } = useSettings();
  return (
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
  );
}
