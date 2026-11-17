/// <reference types="jest" />
// Punch pre-checks on the phone (network, location permission / services / reading, root, Face ID level)
// and the time limits that keep the punch screen from hanging (20 s location, 30 s send).
// The native modules and Supabase are mocked: nothing reaches a phone sensor or the network.
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: jest.fn() },
  NetInfoStateType: { vpn: 'vpn', wifi: 'wifi', cellular: 'cellular' },
}));
jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Highest: 6 },
}));
jest.mock('expo-device', () => ({ isDevice: true, isRootedExperimentalAsync: jest.fn() }));
jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  supportedAuthenticationTypesAsync: jest.fn(),
  getEnrolledLevelAsync: jest.fn(),
  authenticateAsync: jest.fn(),
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
}));
jest.mock('expo-image-manipulator', () => ({ ImageManipulator: { manipulate: jest.fn() }, SaveFormat: { JPEG: 'jpeg' } }));
jest.mock('../supabase', () => ({ supabase: { functions: { invoke: jest.fn() } } }));

import NetInfo from '@react-native-community/netinfo';
import * as Device from 'expo-device';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Location from 'expo-location';
import * as Phone from '../punchDevice';
import { supabase } from '../supabase';

const m = <T>(fn: T) => fn as unknown as jest.Mock;
const invoke = m(supabase.functions.invoke);

beforeEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe('network()', () => {
  it('only a clear "no internet" counts as offline (unknown reachability is allowed)', async () => {
    m(NetInfo.fetch).mockResolvedValueOnce({ isConnected: true, isInternetReachable: null, type: 'wifi' });
    await expect(Phone.network()).resolves.toEqual({ online: true, vpn: false });
    m(NetInfo.fetch).mockResolvedValueOnce({ isConnected: false, isInternetReachable: null, type: 'none' });
    await expect(Phone.network()).resolves.toEqual({ online: false, vpn: false });
    m(NetInfo.fetch).mockResolvedValueOnce({ isConnected: true, isInternetReachable: false, type: 'cellular' });
    await expect(Phone.network()).resolves.toMatchObject({ online: false });
  });

  it('reports a VPN (recorded by the server, not refused: PRD 1.11)', async () => {
    m(NetInfo.fetch).mockResolvedValueOnce({ isConnected: true, isInternetReachable: true, type: 'vpn' });
    await expect(Phone.network()).resolves.toEqual({ online: true, vpn: true });
  });

  it('a broken network module does not block the punch: the server decides', async () => {
    m(NetInfo.fetch).mockRejectedValueOnce(new Error('native'));
    await expect(Phone.network()).resolves.toEqual({ online: true, vpn: false });
  });
});

describe('locationPermission()', () => {
  const perm = (p: Record<string, unknown>) => ({ granted: false, canAskAgain: true, ...p });

  it('precise permission is granted', async () => {
    m(Location.getForegroundPermissionsAsync).mockResolvedValue(perm({ granted: true, android: { accuracy: 'fine' } }));
    await expect(Phone.locationPermission(true)).resolves.toBe('granted');
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('"approximate" (Android) and "precise off" (iOS) are refused: too coarse for a site check', async () => {
    m(Location.getForegroundPermissionsAsync).mockResolvedValueOnce(perm({ granted: true, android: { accuracy: 'coarse' } }));
    await expect(Phone.locationPermission(true)).resolves.toBe('approximate');
    m(Location.getForegroundPermissionsAsync).mockResolvedValueOnce(perm({ granted: true, ios: { accuracy: 'reduced' } }));
    await expect(Phone.locationPermission(true)).resolves.toBe('approximate');
  });

  it('asks once when it can, and only when asked to', async () => {
    m(Location.getForegroundPermissionsAsync).mockResolvedValue(perm({}));
    m(Location.requestForegroundPermissionsAsync).mockResolvedValue(perm({ granted: true }));
    await expect(Phone.locationPermission(false)).resolves.toBe('ask');
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    await expect(Phone.locationPermission(true)).resolves.toBe('granted');
    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('a permission refused for good sends the employee to Settings', async () => {
    m(Location.getForegroundPermissionsAsync).mockResolvedValue(perm({ canAskAgain: false }));
    await expect(Phone.locationPermission(true)).resolves.toBe('blocked');
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe('location services and reading', () => {
  it('GPS off is reported; a broken check does not block', async () => {
    m(Location.hasServicesEnabledAsync).mockResolvedValueOnce(false);
    await expect(Phone.locationServicesOn()).resolves.toBe(false);
    m(Location.hasServicesEnabledAsync).mockRejectedValueOnce(new Error('native'));
    await expect(Phone.locationServicesOn()).resolves.toBe(true);
  });

  it('reads one high-accuracy position and passes the mock-location flag on', async () => {
    m(Location.getCurrentPositionAsync).mockResolvedValue({ coords: { latitude: 29.37, longitude: 47.97, accuracy: 8 }, mocked: true });
    await expect(Phone.readLocation()).resolves.toEqual({ lat: 29.37, lng: 47.97, accuracy: 8, mocked: true });
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledWith({ accuracy: Location.Accuracy.Highest });
  });

  it('a missing accuracy is NaN (the server treats it as unknown), never 0', async () => {
    m(Location.getCurrentPositionAsync).mockResolvedValue({ coords: { latitude: 1, longitude: 2, accuracy: null } });
    const r = await Phone.readLocation();
    expect(Number.isNaN(r.accuracy)).toBe(true);
    expect(r.mocked).toBe(false);
  });

  it('time limit: a GPS reading that never comes fails after 20 seconds', async () => {
    jest.useFakeTimers();
    m(Location.getCurrentPositionAsync).mockReturnValue(new Promise(() => {}));
    const p = Phone.readLocation();
    const done = jest.fn();
    p.catch(done);
    await jest.advanceTimersByTimeAsync(19_000);
    expect(done).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1_500);
    await expect(p).rejects.toThrow('location_timeout');
  });
});

describe('rooted()', () => {
  it('reports a rooted / jailbroken phone; a failed check counts as not rooted (the server checks too)', async () => {
    m(Device.isRootedExperimentalAsync).mockResolvedValueOnce(true);
    await expect(Phone.rooted()).resolves.toBe(true);
    m(Device.isRootedExperimentalAsync).mockRejectedValueOnce(new Error('native'));
    await expect(Phone.rooted()).resolves.toBe(false);
  });
});

describe('biometricInfo() and authenticate()', () => {
  const setup = (hardware: boolean, enrolled: boolean, level: number, types: number[] = [2]) => {
    m(LocalAuthentication.hasHardwareAsync).mockResolvedValue(hardware);
    m(LocalAuthentication.isEnrolledAsync).mockResolvedValue(enrolled);
    m(LocalAuthentication.getEnrolledLevelAsync).mockResolvedValue(level);
    m(LocalAuthentication.supportedAuthenticationTypesAsync).mockResolvedValue(types);
  };

  it('only a strong (Class 3) Face ID / fingerprint is accepted', async () => {
    setup(true, true, 3, [2]);
    await expect(Phone.biometricInfo()).resolves.toEqual({ ready: true, weak: false, type: 'face' });
    setup(true, true, 2, [1]);
    await expect(Phone.biometricInfo()).resolves.toEqual({ ready: false, weak: true, type: 'fingerprint' });
    setup(true, false, 0, []);
    await expect(Phone.biometricInfo()).resolves.toMatchObject({ ready: false, weak: false });
  });

  it('the phone passcode can never replace Face ID / fingerprint', async () => {
    m(LocalAuthentication.authenticateAsync).mockResolvedValue({ success: true });
    await expect(Phone.authenticate('تأكيد', 'إلغاء')).resolves.toEqual({ ok: true });
    expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ disableDeviceFallback: true, biometricsSecurityLevel: 'strong', fallbackLabel: '' }),
    );
    m(LocalAuthentication.authenticateAsync).mockResolvedValue({ success: false, error: 'user_cancel' });
    await expect(Phone.authenticate('a', 'b')).resolves.toEqual({ ok: false, error: 'user_cancel' });
    m(LocalAuthentication.authenticateAsync).mockRejectedValue(new Error('native'));
    await expect(Phone.authenticate('a', 'b')).resolves.toEqual({ ok: false, error: 'unknown' });
  });
});

describe('sendPunch(): never throws, always ends', () => {
  const body = { device_identifier: 'd' } as unknown as Parameters<typeof Phone.sendPunch>[0];
  const httpError = (status: number, json: unknown) =>
    new FunctionsHttpError({ status, json: async () => json } as unknown as Response);

  it('passes a 30-second time limit to the punch function', async () => {
    invoke.mockResolvedValue({ data: { result: 'accepted', punch_type: 'check_in', server_time: new Date().toISOString() }, error: null });
    await Phone.sendPunch(body);
    expect(invoke).toHaveBeenCalledWith('punch', { body, timeout: 30_000 });
  });

  it('a timed-out or dropped request is "no internet" (the employee can try again)', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: new FunctionsFetchError(new Error('aborted')) });
    await expect(Phone.sendPunch(body)).resolves.toEqual({ kind: 'error', code: 'no_internet', unlockAt: null });
    invoke.mockResolvedValueOnce({ data: null, error: new FunctionsRelayError(new Error('relay')) });
    await expect(Phone.sendPunch(body)).resolves.toMatchObject({ code: 'no_internet' });
    invoke.mockRejectedValueOnce(new Error('AbortError'));
    await expect(Phone.sendPunch(body)).resolves.toMatchObject({ code: 'no_internet' });
  });

  it('an expired session (401 with no code) asks the employee to sign in again', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: httpError(401, null) });
    await expect(Phone.sendPunch(body)).resolves.toMatchObject({ kind: 'error', code: 'not_signed_in' });
  });

  it('keeps the server error code (e.g. locked after failed attempts)', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: httpError(429, { error: 'locked', unlock_at: '2026-11-17T08:00:00Z' }) });
    await expect(Phone.sendPunch(body)).resolves.toMatchObject({ kind: 'error', code: 'locked' });
  });

  it('a body that is not JSON is a generic error, not a crash', async () => {
    const res = { status: 500, json: async () => { throw new SyntaxError('bad'); } } as unknown as Response;
    invoke.mockResolvedValueOnce({ data: null, error: new FunctionsHttpError(res) });
    await expect(Phone.sendPunch(body)).resolves.toMatchObject({ kind: 'error', code: 'generic' });
  });
});
