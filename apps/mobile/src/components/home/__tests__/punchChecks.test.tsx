/// <reference types="jest" />
// Punch screen, "checks" step (PRD 4.6 / 5): internet -> location permission (precise) -> GPS on ->
// one location reading -> root check. Each failure shows its message and its buttons; nothing is sent.
// The phone wrappers (punchDevice), camera, router and the device key are mocked: no sensor, no network.
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import PunchScreen from '../../../app/(app)/punch';
import { makeT } from '../../../lib/i18n';
import { SettingsProvider } from '../../../lib/settings';

jest.mock('@expo/vector-icons/Ionicons', () => ({ __esModule: true, default: () => null }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
  useLocalSearchParams: () => ({ next: 'in' }),
}));
jest.mock('expo-camera', () => {
  const { View } = require('react-native');
  return {
    CameraView: (p: object) => <View testID="camera" {...p} />,
    useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
  };
});
jest.mock('../../../lib/device', () => ({ deviceId: jest.fn(async () => 'dev-1'), platform: 'android', model: () => 'Test' }));
jest.mock('../../../lib/deviceKey', () => ({ signPunch: jest.fn() }));
jest.mock('../../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../../lib/punchDevice', () => ({
  network: jest.fn(),
  locationPermission: jest.fn(),
  locationServicesOn: jest.fn(),
  readLocation: jest.fn(),
  rooted: jest.fn(),
  biometricInfo: jest.fn(),
  authenticate: jest.fn(),
  shrinkPhoto: jest.fn(),
  sendPunch: jest.fn(),
  openSettings: jest.fn(),
}));

const Phone = jest.requireMock('../../../lib/punchDevice') as Record<string, jest.Mock>;
const t = makeT('ar');

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
function Wrapper({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <SettingsProvider initial={{ lang: 'ar', theme: 'light', setupDone: true }}>{children}</SettingsProvider>
    </SafeAreaProvider>
  );
}
const show = () => render(<PunchScreen />, { wrapper: Wrapper });

beforeEach(() => {
  jest.clearAllMocks();
  // Everything fine by default; each test breaks one check.
  Phone.network.mockResolvedValue({ online: true, vpn: false });
  Phone.locationPermission.mockResolvedValue('granted');
  Phone.locationServicesOn.mockResolvedValue(true);
  Phone.readLocation.mockResolvedValue({ lat: 29.37, lng: 47.97, accuracy: 10, mocked: false });
  Phone.rooted.mockResolvedValue(false);
});

const expectNothingSent = () => {
  expect(Phone.biometricInfo).not.toHaveBeenCalled();
  expect(Phone.sendPunch).not.toHaveBeenCalled();
};

it('all checks pass: the photo step opens with no warning', async () => {
  await show();
  expect(await screen.findByText(t('punch_photo_hint'))).toBeTruthy();
  expect(screen.getByTestId('camera')).toBeTruthy();
  expect(screen.queryByText(t('punch_report_detected', { reason: t('punch_reason_mock_location') }))).toBeNull();
  expect(Phone.locationPermission).toHaveBeenCalledWith(true);
  expectNothingSent();
});

it('no internet: stops first, before reading the location', async () => {
  Phone.network.mockResolvedValue({ online: false, vpn: false });
  await show();
  expect(await screen.findByText(t('punch_error_no_internet'))).toBeTruthy();
  expect(Phone.locationPermission).not.toHaveBeenCalled();
  expect(Phone.readLocation).not.toHaveBeenCalled();
  expect(screen.getByText(t('punch_try_again'))).toBeTruthy();
  expectNothingSent();
});

it('"approximate" location is refused, with a Settings button', async () => {
  Phone.locationPermission.mockResolvedValue('approximate');
  await show();
  expect(await screen.findByText(t('punch_location_precise'))).toBeTruthy();
  await fireEvent.press(screen.getByText(t('punch_open_settings')));
  expect(Phone.openSettings).toHaveBeenCalled();
  expect(Phone.readLocation).not.toHaveBeenCalled();
  expectNothingSent();
});

it('permission not given yet: "Allow" asks again and re-runs the checks', async () => {
  Phone.locationPermission.mockResolvedValueOnce('ask');
  await show();
  expect(await screen.findByText(t('punch_need_location'))).toBeTruthy();
  await fireEvent.press(screen.getByText(t('allow')));
  expect(await screen.findByText(t('punch_photo_hint'))).toBeTruthy();
  expect(Phone.locationPermission).toHaveBeenCalledTimes(2);
});

it('permission blocked: sends the employee to Settings', async () => {
  Phone.locationPermission.mockResolvedValue('blocked');
  await show();
  expect(await screen.findByText(t('punch_location_blocked'))).toBeTruthy();
  expect(screen.getByText(t('punch_open_settings'))).toBeTruthy();
  expectNothingSent();
});

it('GPS off: asks to turn it on', async () => {
  Phone.locationServicesOn.mockResolvedValue(false);
  await show();
  expect(await screen.findByText(t('punch_location_off'))).toBeTruthy();
  expect(Phone.readLocation).not.toHaveBeenCalled();
  expectNothingSent();
});

it('the location cannot be read (e.g. the 20-second limit): a clear message and Retry', async () => {
  Phone.readLocation.mockRejectedValueOnce(new Error('location_timeout'));
  await show();
  expect(await screen.findByText(t('punch_reason_no_location'))).toBeTruthy();
  await fireEvent.press(screen.getByText(t('punch_try_again')));
  expect(await screen.findByText(t('punch_photo_hint'))).toBeTruthy();
  expect(Phone.readLocation).toHaveBeenCalledTimes(2);
});

it('mock location: a warning is shown, the flow goes on and the server decides (and records it)', async () => {
  Phone.readLocation.mockResolvedValue({ lat: 29.37, lng: 47.97, accuracy: 10, mocked: true });
  await show();
  expect(await screen.findByText(t('punch_report_detected', { reason: t('punch_reason_mock_location') }))).toBeTruthy();
  expect(screen.getByText(t('punch_photo_hint'))).toBeTruthy();
});

it('rooted phone: a warning is shown', async () => {
  Phone.rooted.mockResolvedValue(true);
  await show();
  expect(await screen.findByText(t('punch_report_detected', { reason: t('punch_reason_rooted') }))).toBeTruthy();
});

it('VPN alone: no warning (recorded only, PRD 1.11)', async () => {
  Phone.network.mockResolvedValue({ online: true, vpn: true });
  await show();
  await screen.findByText(t('punch_photo_hint'));
  await waitFor(() => expect(Phone.rooted).toHaveBeenCalled());
  expect(screen.queryByText(/لاحظنا مشكلة في الجوال/)).toBeNull();
});
