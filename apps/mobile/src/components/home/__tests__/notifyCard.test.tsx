// The Home permission card: explain first, then the system prompt; "Not now" snoozes; granted registers the token.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SettingsProvider } from '../../../lib/settings';
import { SnackbarProvider } from '../../ui';
import { NotifyCard } from '../NotifyCard';

jest.mock('@expo/vector-icons/Ionicons', () => ({ __esModule: true, default: () => null }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-router', () => {
  const React = require('react');
  return { useFocusEffect: (cb: () => void) => React.useEffect(cb, [cb]) };
});

jest.mock('../../../lib/push', () => ({
  getPermission: jest.fn(),
  askPermission: jest.fn(),
  registerPush: jest.fn(async () => 'registered'),
  dismissPrompt: jest.fn(async () => {}),
  promptDismissedAt: jest.fn(async () => null),
  openSystemSettings: jest.fn(),
  isPhone: () => true,
}));
const mockPush = jest.requireMock('../../../lib/push') as Record<string, jest.Mock>;

const wrap = () => (
  <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
    <SettingsProvider initial={{ lang: 'en', theme: 'light', setupDone: true }}>
      <SnackbarProvider>
        <NotifyCard />
      </SnackbarProvider>
    </SettingsProvider>
  </SafeAreaProvider>
);
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => jest.clearAllMocks());

it('explains, then asks; granted registers this phone and hides the card', async () => {
  mockPush.getPermission.mockResolvedValue({ status: 'undetermined', canAskAgain: true });
  mockPush.askPermission.mockResolvedValue({ status: 'granted', canAskAgain: true });
  await render(wrap());
  await settle();
  expect(screen.getByText('Turn on notifications')).toBeTruthy();
  expect(mockPush.askPermission).not.toHaveBeenCalled(); // never asks before the user taps
  await fireEvent.press(screen.getByTestId('notify-enable'));
  await settle();
  expect(mockPush.askPermission).toHaveBeenCalledTimes(1);
  expect(mockPush.registerPush).toHaveBeenCalledWith('en');
  expect(screen.queryByTestId('notify-card')).toBeNull();
});

it('"Not now" snoozes the card', async () => {
  mockPush.getPermission.mockResolvedValue({ status: 'undetermined', canAskAgain: true });
  await render(wrap());
  await settle();
  await fireEvent.press(screen.getByTestId('notify-later'));
  await settle();
  expect(mockPush.dismissPrompt).toHaveBeenCalled();
  expect(screen.queryByTestId('notify-card')).toBeNull();
});

it('denied for good: offers the phone settings instead of asking', async () => {
  mockPush.getPermission.mockResolvedValue({ status: 'denied', canAskAgain: false });
  await render(wrap());
  await settle();
  expect(screen.getByText('Open Settings')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('notify-enable'));
  expect(mockPush.openSystemSettings).toHaveBeenCalled();
  expect(mockPush.askPermission).not.toHaveBeenCalled();
});

it('already allowed: nothing is shown', async () => {
  mockPush.getPermission.mockResolvedValue({ status: 'granted', canAskAgain: true });
  await render(wrap());
  await settle();
  expect(screen.queryByTestId('notify-card')).toBeNull();
});
