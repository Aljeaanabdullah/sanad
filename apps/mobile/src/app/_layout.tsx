// Root: fonts, settings, session, snackbar; then guards decide which screens exist (PRD 3.1):
// first launch -> setup; signed out -> login; wrong phone -> blocked; first sign-in -> change password;
// no consent yet -> consent; then the app.
import {
  Tajawal_400Regular,
  Tajawal_500Medium,
  Tajawal_700Bold,
  Tajawal_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/tajawal';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SnackbarProvider } from '../components/ui';
import { SessionProvider, useSession } from '../lib/session';
import { SettingsProvider, useSettings } from '../lib/settings';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Tajawal_400Regular, Tajawal_500Medium, Tajawal_700Bold, Tajawal_800ExtraBold });
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <SessionProvider>
          <SnackbarProvider>
            <Gate fontsLoaded={fontsLoaded} />
          </SnackbarProvider>
        </SessionProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}

function Gate({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { ready, setupDone, c, rtl } = useSettings();
  const { step } = useSession();
  const loading = !fontsLoaded || !ready || (setupDone && step === 'loading');

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync().catch(() => {});
  }, [loading]);
  if (loading) return null;

  const inApp = setupDone && step === 'ready';
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.bg },
          animation: rtl ? 'slide_from_left' : 'slide_from_right',
        }}
      >
        <Stack.Protected guard={!setupDone}>
          <Stack.Screen name="setup" />
        </Stack.Protected>
        <Stack.Protected guard={setupDone && step === 'signed_out'}>
          <Stack.Screen name="login" />
        </Stack.Protected>
        <Stack.Protected guard={setupDone && step === 'blocked'}>
          <Stack.Screen name="blocked" />
        </Stack.Protected>
        <Stack.Protected guard={setupDone && step === 'change_password'}>
          <Stack.Screen name="change-password" />
        </Stack.Protected>
        <Stack.Protected guard={setupDone && step === 'consent'}>
          <Stack.Screen name="consent" />
        </Stack.Protected>
        <Stack.Protected guard={inApp}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
