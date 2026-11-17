// Root: fonts, settings, session, snackbar; then guards decide which screens exist (PRD 3.1):
// first launch -> setup; signed out -> login; wrong phone -> blocked; first sign-in -> change password;
// no consent yet -> consent; then the app.
import {
  ReadexPro_400Regular,
  ReadexPro_500Medium,
  ReadexPro_600SemiBold,
  ReadexPro_700Bold,
  useFonts,
} from '@expo-google-fonts/readex-pro';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { I18nManager } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SnackbarProvider } from '../components/ui';
import { SessionProvider, useSession } from '../lib/session';
import { SettingsProvider, useSettings } from '../lib/settings';

SplashScreen.preventAutoHideAsync().catch(() => {});
// Direction is handled by the layouts (Arabic = right to left) so the system must not mirror again.
// Native RTL is also off in app.json (expo-localization supportsRTL: false); this covers old installs.
I18nManager.allowRTL(false);
I18nManager.forceRTL(false);

export default function RootLayout() {
  const [loaded, fontError] = useFonts({ ReadexPro_400Regular, ReadexPro_500Medium, ReadexPro_600SemiBold, ReadexPro_700Bold });
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <SessionProvider>
          <SnackbarProvider>
            {/* A font that fails to load falls back to the system font instead of keeping the splash up. */}
            <Gate fontsLoaded={loaded || !!fontError} />
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
