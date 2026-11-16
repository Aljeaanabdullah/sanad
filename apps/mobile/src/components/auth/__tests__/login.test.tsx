/// <reference types="jest" />
// Login screen validation. Nothing reaches the network: auth and session are mocked.
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LoginScreen from '../../../app/login';
import { SettingsProvider } from '../../../lib/settings';
import { cleanFileNumber } from '../fileNumber';

// expo-asset (needed by the real icon font loader) is not installed in this workspace; icons are not under test.
jest.mock('@expo/vector-icons/Ionicons', () => ({ __esModule: true, default: () => null }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

jest.mock('../../../lib/auth', () => {
  class AuthFailure extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }
  return { AuthFailure, signIn: jest.fn() };
});

const mockAfterSignIn = jest.fn(async () => {});
jest.mock('../../../lib/session', () => ({ useSession: () => ({ afterSignIn: mockAfterSignIn }) }));

const Auth = jest.requireMock('../../../lib/auth') as { signIn: jest.Mock; AuthFailure: new (code: string) => Error };

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
function Wrapper({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <SettingsProvider initial={{ lang: 'ar', theme: 'light', setupDone: true }}>{children}</SettingsProvider>
    </SafeAreaProvider>
  );
}

const profile = { id: 'e1', fileNumber: 710042, nameAr: 'موظف تجريبي', nameEn: 'Test Employee', role: 'employee', mustChangePassword: true };

beforeEach(() => {
  Auth.signIn.mockReset();
  mockAfterSignIn.mockClear();
});

describe('cleanFileNumber', () => {
  it('keeps 6 ASCII digits and converts Arabic-Indic / Persian digits', () => {
    expect(cleanFileNumber('710042')).toBe('710042');
    expect(cleanFileNumber('٧١٠٠٤٢')).toBe('710042');
    expect(cleanFileNumber('۷۱۰۰۴۲')).toBe('710042');
    expect(cleanFileNumber('71-00 42x9')).toBe('710042');
    expect(cleanFileNumber('')).toBe('');
  });
});

describe('LoginScreen', () => {
  it('asks for a 6-digit file number and a password before calling the server', async () => {
    await render(<LoginScreen />, { wrapper: Wrapper });
    await fireEvent.press(screen.getByTestId('login-submit'));
    expect(screen.getByText('رقم الملف يجب أن يكون 6 أرقام.')).toBeTruthy();
    expect(screen.getByText('اكتب كلمة المرور.')).toBeTruthy();
    expect(Auth.signIn).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByTestId('login-file-number'), '7100');
    await fireEvent.changeText(screen.getByTestId('login-password'), 'secret12');
    await fireEvent.press(screen.getByTestId('login-submit'));
    expect(screen.getByText('رقم الملف يجب أن يكون 6 أرقام.')).toBeTruthy();
    expect(Auth.signIn).not.toHaveBeenCalled();
  });

  it('normalises Arabic digits, signs in, then hands the profile to the session', async () => {
    Auth.signIn.mockResolvedValue(profile);
    await render(<LoginScreen />, { wrapper: Wrapper });
    await fireEvent.changeText(screen.getByTestId('login-file-number'), '٧١٠٠٤٢');
    expect(screen.getByTestId('login-file-number').props.value).toBe('710042');
    await fireEvent.changeText(screen.getByTestId('login-password'), 'secret12');
    await fireEvent.press(screen.getByTestId('login-submit'));
    expect(Auth.signIn).toHaveBeenCalledWith('710042', 'secret12');
    expect(mockAfterSignIn).toHaveBeenCalledWith(profile);
  });

  it('shows the server refusal as text', async () => {
    Auth.signIn.mockRejectedValue(new Auth.AuthFailure('invalid_credentials'));
    await render(<LoginScreen />, { wrapper: Wrapper });
    await fireEvent.changeText(screen.getByTestId('login-file-number'), '710042');
    await fireEvent.changeText(screen.getByTestId('login-password'), 'wrong123');
    await fireEvent.press(screen.getByTestId('login-submit'));
    expect(await screen.findByText('رقم الملف أو كلمة المرور غير صحيحة.')).toBeTruthy();
    expect(mockAfterSignIn).not.toHaveBeenCalled();
  });

  it('shows and hides the password', async () => {
    await render(<LoginScreen />, { wrapper: Wrapper });
    expect(screen.getByTestId('login-password').props.secureTextEntry).toBe(true);
    await fireEvent.press(screen.getByLabelText('إظهار كلمة المرور'));
    expect(screen.getByTestId('login-password').props.secureTextEntry).toBe(false);
    await fireEvent.press(screen.getByLabelText('إخفاء كلمة المرور'));
    expect(screen.getByTestId('login-password').props.secureTextEntry).toBe(true);
  });

  it('switches to English from the brand band', async () => {
    await render(<LoginScreen />, { wrapper: Wrapper });
    await fireEvent.press(screen.getByLabelText('تغيير اللغة إلى الإنجليزية'));
    expect(screen.getByText('Use your file number and the password the system admin gave you.')).toBeTruthy();
  });
});
