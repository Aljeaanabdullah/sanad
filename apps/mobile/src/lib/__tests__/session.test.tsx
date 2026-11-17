/// <reference types="jest" />
// The session step machine (PRD 3.1): loading -> signed_out | blocked | change_password | consent | ready.
// Nothing reaches the network: auth, the device key, push and Supabase are mocked.
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import type { Profile } from '../auth';
import { SessionProvider, useSession } from '../session';

jest.mock('../auth', () => ({
  currentProfile: jest.fn(),
  bindThisDevice: jest.fn(),
  hasConsent: jest.fn(),
  giveConsent: jest.fn(),
  signOut: jest.fn(async () => {}),
}));
jest.mock('../deviceKey', () => ({ ensureDeviceKey: jest.fn(async () => 'ready') }));
jest.mock('../push', () => ({ unregisterPush: jest.fn(async () => {}) }));

let mockAuthListener: ((event: string) => void) | null = null;
jest.mock('../supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: (event: string) => void) => {
        mockAuthListener = cb;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      },
    },
  },
}));

const Auth = jest.requireMock('../auth') as Record<'currentProfile' | 'bindThisDevice' | 'hasConsent' | 'giveConsent' | 'signOut', jest.Mock>;
const { ensureDeviceKey } = jest.requireMock('../deviceKey') as { ensureDeviceKey: jest.Mock };
const { unregisterPush } = jest.requireMock('../push') as { unregisterPush: jest.Mock };

const profile = (over: Partial<Profile> = {}): Profile => ({
  id: 'e1',
  fileNumber: 710042,
  nameAr: 'موظف تجريبي',
  nameEn: 'Test Employee',
  role: 'employee',
  mustChangePassword: false,
  ...over,
});

const wrapper = ({ children }: { children: ReactNode }) => <SessionProvider>{children}</SessionProvider>;
const mount = () => renderHook(() => useSession(), { wrapper });

beforeEach(() => {
  jest.useRealTimers();
  mockAuthListener = null;
  for (const m of Object.values(Auth)) m.mockReset();
  Auth.signOut.mockImplementation(async () => {});
  Auth.bindThisDevice.mockResolvedValue('bound');
  Auth.hasConsent.mockResolvedValue(true);
  Auth.giveConsent.mockResolvedValue(undefined);
  ensureDeviceKey.mockClear();
  unregisterPush.mockClear();
});

describe('start-up', () => {
  it('starts in loading, then signed_out when there is no saved session', async () => {
    Auth.currentProfile.mockResolvedValue(null);
    const { result } = mount();
    expect(result.current.step).toBe('loading');
    await waitFor(() => expect(result.current.step).toBe('signed_out'));
    expect(result.current.profile).toBeNull();
    expect(Auth.bindThisDevice).not.toHaveBeenCalled();
  });

  it('goes straight to ready for a saved session on the bound phone with consent', async () => {
    Auth.currentProfile.mockResolvedValue(profile());
    const { result } = mount();
    await waitFor(() => expect(result.current.step).toBe('ready'));
    expect(result.current.profile?.fileNumber).toBe(710042);
    expect(Auth.hasConsent).toHaveBeenCalledWith('e1');
    // PRD 4.7: the signing key is registered in the background.
    expect(ensureDeviceKey).toHaveBeenCalledTimes(1);
  });

  it('retries the profile after a network failure instead of signing out', async () => {
    Auth.currentProfile.mockRejectedValueOnce(new Error('no_internet')).mockResolvedValueOnce(profile());
    const { result } = mount();
    await waitFor(() => expect(result.current.step).toBe('ready'), { timeout: 4000 });
    expect(Auth.currentProfile).toHaveBeenCalledTimes(2);
  });

  it('a stalled profile request never keeps the splash up: 3 tries of 15 s, then signed_out', async () => {
    jest.useFakeTimers();
    Auth.currentProfile.mockImplementation(() => new Promise(() => {})); // never answers
    const { result } = mount();
    expect(result.current.step).toBe('loading');
    // 15 s + 1.5 s pause + 15 s + 3 s pause + 15 s = 49.5 s.
    for (let i = 0; i < 12; i++) {
      await act(async () => {
        await jest.advanceTimersByTimeAsync(5_000);
      });
    }
    expect(result.current.step).toBe('signed_out');
    expect(Auth.currentProfile).toHaveBeenCalledTimes(3);
  });
});

describe('after sign-in', () => {
  async function signedOut() {
    Auth.currentProfile.mockResolvedValue(null);
    const r = mount();
    await waitFor(() => expect(r.result.current.step).toBe('signed_out'));
    return r;
  }

  it.each(['other_device', 'device_taken'] as const)('blocks when the phone check says %s', async (code) => {
    const { result } = await signedOut();
    Auth.bindThisDevice.mockResolvedValue(code);
    await act(() => result.current.afterSignIn(profile()));
    expect(result.current.step).toBe('blocked');
    expect(result.current.blockedCode).toBe(code);
    expect(Auth.hasConsent).not.toHaveBeenCalled();
    expect(ensureDeviceKey).not.toHaveBeenCalled();
  });

  it('a failed phone check does not lock the employee out (the server checks again at punch time)', async () => {
    const { result } = await signedOut();
    Auth.bindThisDevice.mockRejectedValue(new Error('generic'));
    await act(() => result.current.afterSignIn(profile()));
    expect(result.current.step).toBe('ready');
  });

  it('first sign-in: change_password, then consent, then ready', async () => {
    const { result } = await signedOut();
    Auth.hasConsent.mockResolvedValue(false);
    await act(() => result.current.afterSignIn(profile({ mustChangePassword: true })));
    expect(result.current.step).toBe('change_password');
    expect(Auth.hasConsent).not.toHaveBeenCalled();

    await act(() => result.current.passwordChanged());
    expect(result.current.step).toBe('consent');
    expect(result.current.profile?.mustChangePassword).toBe(false);

    await act(() => result.current.consentGiven());
    expect(Auth.giveConsent).toHaveBeenCalledWith('e1');
    expect(result.current.step).toBe('ready');
  });

  it('a consent check that fails asks for consent again (never skips it)', async () => {
    const { result } = await signedOut();
    Auth.hasConsent.mockRejectedValue(new Error('offline'));
    await act(() => result.current.afterSignIn(profile()));
    expect(result.current.step).toBe('consent');
  });

  it('stays on consent when saving the consent fails', async () => {
    const { result } = await signedOut();
    Auth.hasConsent.mockResolvedValue(false);
    await act(() => result.current.afterSignIn(profile()));
    Auth.giveConsent.mockRejectedValue(new Error('not_signed_in'));
    await act(async () => {
      await expect(result.current.consentGiven()).rejects.toThrow('not_signed_in');
    });
    expect(result.current.step).toBe('consent');
  });
});

describe('signing out', () => {
  it('removes the push token first, then signs out', async () => {
    Auth.currentProfile.mockResolvedValue(profile());
    const { result } = mount();
    await waitFor(() => expect(result.current.step).toBe('ready'));
    const order: string[] = [];
    unregisterPush.mockImplementation(async () => void order.push('push'));
    Auth.signOut.mockImplementation(async () => void order.push('auth'));
    await act(() => result.current.signOut());
    expect(order).toEqual(['push', 'auth']);
    expect(result.current.step).toBe('signed_out');
    expect(result.current.profile).toBeNull();
  });

  it('signs out even when the push token cannot be removed', async () => {
    Auth.currentProfile.mockResolvedValue(profile());
    const { result } = mount();
    await waitFor(() => expect(result.current.step).toBe('ready'));
    unregisterPush.mockRejectedValue(new Error('offline'));
    await act(() => result.current.signOut());
    expect(Auth.signOut).toHaveBeenCalled();
    expect(result.current.step).toBe('signed_out');
  });

  it('follows a sign-out that happened outside the app (revoked session)', async () => {
    Auth.currentProfile.mockResolvedValue(profile());
    const { result } = mount();
    await waitFor(() => expect(result.current.step).toBe('ready'));
    act(() => mockAuthListener?.('TOKEN_REFRESHED'));
    expect(result.current.step).toBe('ready');
    act(() => mockAuthListener?.('SIGNED_OUT'));
    expect(result.current.step).toBe('signed_out');
    expect(result.current.profile).toBeNull();
  });
});

it('useSession outside the provider is a programming error', () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  expect(() => renderHook(() => useSession())).toThrow('useSession outside SessionProvider');
});
