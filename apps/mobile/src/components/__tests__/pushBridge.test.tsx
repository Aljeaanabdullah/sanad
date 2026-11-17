// Regression (APK, 2026-11-17): on Android, getDevicePushTokenAsync also fires the push-token listener,
// and the listener asked for the token again: an endless loop of register_push_token calls (3,000+ in
// 20 minutes) that starved every other request, so Requests and Attendance never left their skeletons.
import { act, render } from '@testing-library/react-native';
import { SettingsProvider } from '../../lib/settings';
import { PushBridge } from '../PushBridge';

const mockToken = 'fcm-token-'.padEnd(142, 'x');

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('expo-notifications', () => {
  const listeners = new Set<Function>();
  return {
    __listeners: listeners,
    setNotificationHandler: jest.fn(),
    setNotificationChannelAsync: jest.fn(async () => null),
    AndroidImportance: { HIGH: 4, MAX: 5 },
    AndroidNotificationVisibility: { PRIVATE: 0, PUBLIC: 1 },
    DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
    getPermissionsAsync: jest.fn(async () => ({ status: 'granted', canAskAgain: true })),
    // Like the native Android module: every successful fetch also emits onDevicePushToken.
    getDevicePushTokenAsync: jest.fn(async () => {
      setTimeout(() => listeners.forEach((l) => l({ type: 'android', data: mockToken })), 0);
      return { type: 'android', data: mockToken };
    }),
    addPushTokenListener: (l: Function) => {
      listeners.add(l);
      return { remove: () => listeners.delete(l) };
    },
    useLastNotificationResponse: () => null,
    clearLastNotificationResponseAsync: jest.fn(async () => {}),
  };
});
jest.mock('../../lib/supabase', () => ({ supabase: { rpc: jest.fn(async () => ({ data: null, error: null })) } }));

const rpc = (jest.requireMock('../../lib/supabase') as { supabase: { rpc: jest.Mock } }).supabase.rpc;
const N = jest.requireMock('expo-notifications') as { getDevicePushTokenAsync: jest.Mock };

test('the token is sent once, not in a loop', async () => {
  render(
    <SettingsProvider>
      <PushBridge />
    </SettingsProvider>,
  );
  for (let i = 0; i < 30; i++) await act(() => new Promise((r) => setTimeout(r, 2)));
  const sends = rpc.mock.calls.filter((c) => c[0] === 'register_push_token');
  expect(sends).toHaveLength(1);
  expect(sends[0][1]).toMatchObject({ p_token: mockToken, p_platform: expect.any(String) });
  expect(N.getDevicePushTokenAsync.mock.calls.length).toBeLessThanOrEqual(2);
});
