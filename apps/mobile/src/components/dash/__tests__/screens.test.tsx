// Smoke tests: the group-C screens render with dummy data (no network) in Arabic and English.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SettingsProvider } from '../../../lib/settings';
import type { DashboardData } from '../../../sanad/dashboard';
import { SnackbarProvider } from '../../ui';

jest.mock('@expo/vector-icons/Ionicons', () => {
  const { Text } = require('react-native');
  const Icon = ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text>;
  return { __esModule: true, default: Icon };
});
jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.0.0', nativeBuildVersion: '1' }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
    useLocalSearchParams: () => mockParams,
    useFocusEffect: (cb: () => void) => React.useEffect(cb, [cb]),
  };
});

const mockProfile = { id: 'me', fileNumber: 719000, nameAr: 'سالم أحمد', nameEn: 'Salem Ahmad', role: 'employee', mustChangePassword: false };
let mockRole = 'employee';
jest.mock('../../../lib/session', () => ({
  // Stable per role, like the real provider (useMemo).
  useSession: () => {
    const g = globalThis as unknown as { mockSessions?: Record<string, unknown> };
    g.mockSessions ??= {};
    g.mockSessions[mockRole] ??= { profile: { ...mockProfile, role: mockRole }, signOut: jest.fn() };
    return g.mockSessions[mockRole];
  },
}));

const mockDash: DashboardData = {
  employee: { id: 'me', file_number: 719000, name_ar: 'سالم أحمد', name_en: 'Salem Ahmad', department_ar: 'العمليات', department_en: 'Operations', job_title: 'فني', hire_date: null, employment_status: null },
  month: '2026-11',
  period: { from: '2026-10-21', to: '2026-11-20', today: '2026-11-16', complete: false },
  attendance: { shifts: 18, present: 16, late: 2, late_minutes: 30, absent: 2, absent_unexcused: 1, missing_checkout: 1, late_dates: ['2026-10-25', '2026-11-02'], late_total: 2 },
  leaves: [{ type: 'إجازة مرضية', from: '2026-11-03', to: '2026-11-04', note: null, days_in_period: 2 }],
  leave_days: 2,
  penalties: [{ type: 'لفت نظر', date: '2026-11-05', reason: 'تأخير متكرر' }],
  list: null,
  estimate: { eligibility: 'غير مستحق', pending_manager: false, reasons: ['تأخير مرتين'], reason: 'تأخير مرتين', notes: [] },
  list_months: [],
  viewer_is_self: true,
};

jest.mock('../../../lib/api', () => {
  const actual = jest.requireActual('../../../lib/api');
  return {
    ...actual,
    loadDashboard: jest.fn(async () => mockDash),
    myNotifications: jest.fn(async () => [
      { id: 'n1', kind: 'late', at: new Date(Date.now() - 2 * 3600e3), data: { date: '2026-11-12', minutes: 14 }, readAt: null },
      { id: 'n2', kind: 'bonus_list', at: new Date(Date.now() - 3 * 86400e3), data: { month: '2026-10', eligibility: 'مستحق' }, readAt: new Date() },
    ]),
    markNotificationsRead: jest.fn(async () => 1),
    attendanceHistory: jest.fn(async () => [
      { day: '2026-11-02', kind: 'work', shiftStart: null, shiftEnd: null, arrival: 'late', departure: 'done', checkIn: new Date(), checkOut: null, lateMinutes: 12, earlyLeaveMinutes: 0, checkInCorrected: false, checkOutCorrected: false },
    ]),
  };
});
jest.mock('../../../lib/supabase', () => ({ supabase: {} }));
const mockAsk = jest.fn();
jest.mock('../../../lib/askAi', () => ({
  ...jest.requireActual('../../../lib/askAi'),
  askSanadAI: (...a: unknown[]) => mockAsk(...a),
}));

function wrap(ui: ReactNode, lang: 'ar' | 'en' = 'ar') {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <SettingsProvider initial={{ lang, theme: 'dark', setupDone: true }}>
        <SnackbarProvider>{ui}</SnackbarProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  mockParams = {};
  mockRole = 'employee';
  mockPush.mockClear();
});

it('dashboard shows the bonus status, source and lists', async () => {
  const Dashboard = require('../../../app/(app)/dashboard').default;
  await render(wrap(<Dashboard />));
  await settle();
  expect(screen.getByTestId('bonus-status').props.children).toBe('غير مستحق');
  expect(screen.getByText('تقديري حتى اليوم')).toBeTruthy();
  expect(screen.getByText('لفت نظر')).toBeTruthy();
  await fireEvent.press(screen.getByText('طلب إجازة'));
  expect(mockPush).toHaveBeenCalledWith('/leave');
});

it('dashboard of another employee is view only', async () => {
  mockParams = { employee: 'other' };
  const api = require('../../../lib/api');
  api.loadDashboard.mockResolvedValueOnce({ ...mockDash, viewer_is_self: false });
  const Dashboard = require('../../../app/(app)/dashboard').default;
  await render(wrap(<Dashboard />, 'en'));
  await settle();
  expect(screen.getByText(/View only/)).toBeTruthy();
  expect(screen.queryByText('Leave request')).toBeNull();
});

it('assistant answers locally and offers a leave request for leave questions', async () => {
  const Assistant = require('../../../app/(app)/assistant').default;
  await render(wrap(<Assistant />));
  await settle();
  expect(screen.getByText(/مرحباً سالم/)).toBeTruthy();
  await fireEvent.press(screen.getByText('كم إجازاتي؟'));
  expect(screen.getByText(/مجموع إجازاتك 2 يوم/)).toBeTruthy();
  await fireEvent.press(screen.getByText('طلب إجازة'));
  expect(mockPush).toHaveBeenCalledWith('/leave');
});

async function typeAndSend(text: string) {
  await fireEvent.changeText(screen.getByLabelText('اكتب رسالتك هنا…'), text);
  await fireEvent.press(screen.getByLabelText('إرسال'));
}

it('assistant keeps known questions on the phone (no AI call)', async () => {
  mockAsk.mockReset();
  const Assistant = require('../../../app/(app)/assistant').default;
  await render(wrap(<Assistant />));
  await settle();
  await fireEvent.press(screen.getByText('كم إجازاتي؟'));
  expect(mockAsk).not.toHaveBeenCalled();
});

it('assistant sends an unknown question to the AI and shows the automated-reply note', async () => {
  mockAsk.mockReset();
  let resolve: (v: unknown) => void = () => {};
  mockAsk.mockReturnValue(new Promise((r) => { resolve = r; }));
  const Assistant = require('../../../app/(app)/assistant').default;
  await render(wrap(<Assistant />));
  await settle();
  await typeAndSend('شلون أقدر أحسّن وضعي هالشهر؟');
  expect(mockAsk).toHaveBeenCalledWith('شلون أقدر أحسّن وضعي هالشهر؟');
  expect(screen.getByText('سند يكتب…')).toBeTruthy();
  await act(async () => { resolve({ kind: 'answer', answer: 'التزم بالدوام بدون تأخير لين 20 نوفمبر.', remaining: 19 }); });
  expect(screen.getByText('التزم بالدوام بدون تأخير لين 20 نوفمبر.')).toBeTruthy();
  expect(screen.getByText('رد آلي من مساعد سند. للتأكيد راجع الموارد البشرية.')).toBeTruthy();
  expect(screen.getByText('باقي لك 19 سؤال اليوم.')).toBeTruthy();
  expect(screen.queryByText('سند يكتب…')).toBeNull();
});

it('assistant shows the relay message when the AI refuses (daily limit)', async () => {
  mockAsk.mockReset();
  mockAsk.mockResolvedValue({ kind: 'error', key: 'limit', message: 'وصلت الحد اليومي للأسئلة. تقدر تسأل مرة ثانية باچر.' });
  const Assistant = require('../../../app/(app)/assistant').default;
  await render(wrap(<Assistant />));
  await settle();
  await typeAndSend('سؤال عام');
  await settle();
  expect(screen.getByText('وصلت الحد اليومي للأسئلة. تقدر تسأل مرة ثانية باچر.')).toBeTruthy();
  expect(screen.queryByText('رد آلي من مساعد سند. للتأكيد راجع الموارد البشرية.')).toBeNull();
});

it('notifications list renders texts and relative times', async () => {
  const Notifications = require('../../../app/(app)/notifications').default;
  await render(wrap(<Notifications />, 'en'));
  await settle();
  expect(screen.getByText('Late arrival')).toBeTruthy();
  expect(screen.getByText('2 h ago')).toBeTruthy();
  // One unread: marked "New", and opening the list marks everything read.
  expect(screen.getAllByText('New')).toHaveLength(1);
  expect(require('../../../lib/api').markNotificationsRead).toHaveBeenCalledWith(null);
});

it('reports calendar renders the month and day details', async () => {
  jest.useFakeTimers({ now: new Date(2026, 10, 16, 10, 0), advanceTimers: true });
  const Reports = require('../../../app/(app)/(tabs)/reports').default;
  await render(wrap(<Reports />));
  await settle();
  expect(screen.getByText('مجاميع الشهر')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('day-2'));
  expect(screen.getByTestId('day-details')).toBeTruthy();
  expect(screen.getByText('متأخر 12 دقيقة')).toBeTruthy();
});

afterEach(() => jest.useRealTimers());

it('more shows staff links only to staff', async () => {
  const More = require('../../../app/(app)/(tabs)/more').default;
  const { unmount } = await render(wrap(<More />));
  expect(screen.getByText('719000')).toBeTruthy();
  expect(screen.queryByTestId('more-approvals')).toBeNull();
  await unmount();
  mockRole = 'supervisor';
  await render(wrap(<More />));
  expect(screen.getByTestId('more-approvals')).toBeTruthy();
  expect(screen.getByTestId('more-lookup')).toBeTruthy();
});
