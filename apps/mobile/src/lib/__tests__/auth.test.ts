/// <reference types="jest" />
// Regression: after a password change the server ends the old session, so the app must take the
// e-mail from the phone's saved session (not from the server) and sign in again with the new password.
const calls: string[] = [];
const mockAuth = {
  getSession: jest.fn(async () => { calls.push('getSession'); return { data: { session: { user: { email: '719000@jahez.local' } } } }; }),
  getUser: jest.fn(async () => { calls.push('getUser'); return { data: { user: null }, error: { message: 'session_not_found' } }; }),
  signInWithPassword: jest.fn(async () => { calls.push('signIn'); return { error: null }; }),
};
const mockInvoke = jest.fn(async () => { calls.push('invoke'); return { error: null }; });
const mockInsert = jest.fn();
jest.mock('../supabase', () => ({
  supabase: {
    get auth() { return mockAuth; },
    functions: { invoke: (...a: unknown[]) => (mockInvoke as (...x: unknown[]) => unknown)(...a) },
    from: () => ({ insert: (...a: unknown[]) => (mockInsert as (...x: unknown[]) => unknown)(...a) }),
  },
}));
jest.mock('../device', () => ({ deviceId: async () => 'dev', platform: 'android', model: () => 'm' }));
import { AuthFailure, changePassword, giveConsent } from '../auth';

beforeEach(() => { calls.length = 0; jest.clearAllMocks(); });

it('reads the e-mail before the change and signs in again with the new password', async () => {
  expect(await changePassword('NewPass123')).toBe(true);
  expect(calls).toEqual(['getSession', 'invoke', 'signIn']);
  expect(mockAuth.signInWithPassword).toHaveBeenCalledWith({ email: '719000@jahez.local', password: 'NewPass123' });
  expect(mockAuth.getUser).not.toHaveBeenCalled();
});

it('reports when signing in again failed, so the app can send the user to login', async () => {
  mockAuth.signInWithPassword.mockResolvedValueOnce({ error: { message: 'x' } } as never);
  expect(await changePassword('NewPass123')).toBe(false);
});

it('a consent refused because the session is gone asks for a new sign-in', async () => {
  mockInsert.mockResolvedValueOnce({ error: { code: '42501', message: 'new row violates row-level security policy' } });
  await expect(giveConsent('e1')).rejects.toEqual(new AuthFailure('not_signed_in'));
  mockInsert.mockResolvedValueOnce({ error: { code: 'PGRST301', message: 'JWT expired' } });
  await expect(giveConsent('e1')).rejects.toMatchObject({ code: 'not_signed_in' });
  mockInsert.mockResolvedValueOnce({ error: { code: '23514', message: 'check' } });
  await expect(giveConsent('e1')).rejects.toMatchObject({ code: 'generic' });
  mockInsert.mockResolvedValueOnce({ error: null });
  await expect(giveConsent('e1')).resolves.toBeUndefined();
});
