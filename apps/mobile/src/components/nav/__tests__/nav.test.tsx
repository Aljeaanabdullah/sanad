// The side menu, the header's menu button and the Sanad button, in Arabic and English.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SettingsProvider } from '../../../lib/settings';
import { Header, Screen, SnackbarProvider, Txt } from '../../ui';
import { AppNav } from '../AppNav';

jest.mock('@expo/vector-icons/Ionicons', () => {
  const { Text } = require('react-native');
  const Icon = ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text>;
  return { __esModule: true, default: Icon };
});
// The first render loads the whole kit; give a cold run room.
jest.setTimeout(30000);

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const mockRouter = { push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), back: jest.fn(), canGoBack: () => true, canDismiss: () => true };
let mockPath = '/';
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  usePathname: () => mockPath,
}));

let mockRole = 'employee';
jest.mock('../../../lib/session', () => ({
  useSession: () => ({ profile: { id: 'me', fileNumber: 719000, nameAr: 'سالم أحمد', nameEn: 'Salem Ahmad', role: mockRole, mustChangePassword: false } }),
}));

function wrap(ui: ReactNode, lang: 'ar' | 'en' = 'ar') {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } }}>
      <SettingsProvider initial={{ lang, theme: 'light', setupDone: true }}>
        <SnackbarProvider>
          <AppNav>{ui}</AppNav>
        </SnackbarProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}

const Section = ({ back }: { back?: boolean }) => (
  <>
    <Header title="x" back={back} big={!back} />
    <Screen>
      <Txt>body</Txt>
    </Screen>
  </>
);

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 300));
  });
}

beforeEach(() => {
  mockPath = '/';
  mockRole = 'employee';
  Object.values(mockRouter).forEach((f) => typeof f === 'function' && 'mockClear' in f && (f as jest.Mock).mockClear());
});

it('section roots show the menu button and the Sanad button', async () => {
  await render(wrap(<Section />));
  expect(screen.getByTestId('menu-button')).toBeTruthy();
  expect(screen.getByLabelText('فتح القائمة')).toBeTruthy();
  const sanad = screen.getByTestId('sanad-button');
  expect(sanad.props.accessibilityLabel).toBe('اسأل سَنَد');
  await fireEvent.press(sanad);
  // A quick ripple first; the assistant opens within 400 ms.
  expect(mockRouter.push).not.toHaveBeenCalled();
  await act(async () => {
    await new Promise((r) => setTimeout(r, 400));
  });
  expect(mockRouter.push).toHaveBeenCalledWith('/assistant');
  expect(mockRouter.push).toHaveBeenCalledTimes(1);
});

it('with reduce motion the Sanad button opens the assistant at once', async () => {
  const { AccessibilityInfo } = require('react-native');
  const original = AccessibilityInfo.isReduceMotionEnabled;
  AccessibilityInfo.isReduceMotionEnabled = jest.fn(async () => true);
  await render(wrap(<Section />));
  await settle();
  await fireEvent.press(screen.getByTestId('sanad-button'));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  expect(mockRouter.push).toHaveBeenCalledWith('/assistant');
  AccessibilityInfo.isReduceMotionEnabled = original;
});

it('the Sanad mark thinks in the chat while a reply is on its way', async () => {
  const { ChatBubble } = require('../../dash/Chat');
  await render(wrap(<ChatBubble mine={false} text="..." thinking />));
  expect(screen.getByTestId('sanad-thinking', { includeHiddenElements: true })).toBeTruthy();
  // The bubble shows typing dots, with the words small under them.
  expect(screen.getByTestId('typing-dots', { includeHiddenElements: true })).toBeTruthy();
});

it('pushed screens keep Back and hide the Sanad button', async () => {
  mockPath = '/leave';
  await render(wrap(<Section back />));
  expect(screen.queryByTestId('menu-button')).toBeNull();
  expect(screen.queryByTestId('sanad-button')).toBeNull();
  expect(screen.getByLabelText('رجوع')).toBeTruthy();
});

it('the menu lists every section and opens the ideas box and the ideal employee', async () => {
  await render(wrap(<Section />));
  await fireEvent.press(screen.getByTestId('menu-button'));
  await settle();
  expect(screen.getByTestId('side-menu')).toBeTruthy();
  for (const label of ['الرئيسية', 'الطلبات', 'التقارير', 'لوحتي', 'طلب إجازة', 'اسأل سَنَد', 'الموظف المثالي', 'صندوق الأفكار', 'الإشعارات', 'الطوارئ', 'حسابي والإعدادات']) {
    // «اسأل سَنَد» is also the Sanad button's label.
    expect(screen.getAllByLabelText(label).length).toBeGreaterThan(0);
  }
  expect(screen.getByTestId('menu-leave').props.accessibilityLabel).toBe('طلب إجازة');
  expect(screen.getByTestId('menu-home').props.accessibilityState).toEqual({ selected: true });
  expect(screen.queryByTestId('menu-approvals')).toBeNull();
  await fireEvent.press(screen.getByTestId('menu-ideas'));
  expect(mockRouter.push).toHaveBeenCalledWith('/ideas');
  await settle();
  expect(screen.queryByTestId('side-menu')).toBeNull();
  await fireEvent.press(screen.getByTestId('menu-button'));
  await settle();
  await fireEvent.press(screen.getByTestId('menu-ideal-employee'));
  expect(mockRouter.push).toHaveBeenCalledWith('/ideal-employee');
});

it('staff see approvals and employee lookup; English labels', async () => {
  mockRole = 'hr';
  mockPath = '/requests';
  await render(wrap(<Section />, 'en'));
  await fireEvent.press(screen.getByLabelText('Open menu'));
  await settle();
  expect(screen.getByLabelText('Approvals')).toBeTruthy();
  expect(screen.getByLabelText('Employee record')).toBeTruthy();
  expect(screen.getByLabelText('Ideas box')).toBeTruthy();
  // From one section to another the screen is replaced; Home pops back.
  await fireEvent.press(screen.getByTestId('menu-reports'));
  expect(mockRouter.replace).toHaveBeenCalledWith('/reports');
  await settle();
  await fireEvent.press(screen.getByLabelText('Open menu'));
  await settle();
  await fireEvent.press(screen.getByTestId('menu-home'));
  expect(mockRouter.dismissTo).toHaveBeenCalledWith('/');
});

it('closes from the backdrop', async () => {
  await render(wrap(<Section />));
  await fireEvent.press(screen.getByTestId('menu-button'));
  await settle();
  // The backdrop is hidden from screen readers while the menu is open (the menu is modal); Back closes it there.
  await fireEvent.press(screen.getByTestId('menu-backdrop', { includeHiddenElements: true }));
  await settle();
  expect(screen.queryByTestId('side-menu')).toBeNull();
});

it('leaves room under the content so the last row scrolls fully above the Sanad button', async () => {
  const { SANAD_BUTTON_ROOM, SANAD_BUTTON_TOP } = require('../../../lib/theme');
  const { StyleSheet } = require('react-native');
  const bottomOf = (id: string, key: 'contentContainerStyle' | 'style') => StyleSheet.flatten(screen.getByTestId(id).props[key]).paddingBottom as number;
  // Safe-area inset is 16 in wrap().
  await render(wrap(<Section />));
  expect(SANAD_BUTTON_ROOM).toBeGreaterThanOrEqual(SANAD_BUTTON_TOP + 16);
  expect(bottomOf('screen-scroll', 'contentContainerStyle')).toBe(16 + SANAD_BUTTON_ROOM);
  await screen.unmount();
  // A form footer sits above the button too.
  await render(
    wrap(
      <Screen footer={<Txt>save</Txt>}>
        <Txt>form</Txt>
      </Screen>,
    ),
  );
  expect(bottomOf('screen-footer', 'style')).toBe(16 + SANAD_BUTTON_ROOM);
  await screen.unmount();
  // Where the button is not shown, only the usual space.
  mockPath = '/leave';
  await render(wrap(<Section back />));
  expect(bottomOf('screen-scroll', 'contentContainerStyle')).toBe(16 + 24);
});
