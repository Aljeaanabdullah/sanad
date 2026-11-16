import { FunctionsHttpError, isAuthRetryableFetchError } from '@supabase/supabase-js';
import { CONSENT_VERSION, emailFor } from './config';
import { deviceId, model, platform } from './device';
import { supabase } from './supabase';

export type Role = 'employee' | 'supervisor' | 'hr' | 'admin';

export type Profile = {
  id: string;
  fileNumber: number;
  nameAr: string;
  nameEn: string;
  role: Role;
  mustChangePassword: boolean;
};

export type DeviceStatus = 'bound' | 'ok' | 'other_device' | 'device_taken';

/** A refusal with a code that has a text in strings.json (`error_<code>`). */
export class AuthFailure extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export async function currentProfile(): Promise<Profile | null> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError && isAuthRetryableFetchError(authError)) throw new AuthFailure('no_internet');
  if (!auth.user) return null;
  const { data: row, error } = await supabase
    .from('employees')
    .select('id, file_number, full_name_ar, full_name_en, role, must_change_password, is_active')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  // A failed request is not a missing account: keep the session and let the caller retry.
  if (error) throw new AuthFailure('no_internet');
  if (!row || row.is_active !== true) {
    await supabase.auth.signOut();
    return null;
  }
  return {
    id: row.id,
    fileNumber: row.file_number,
    nameAr: row.full_name_ar,
    nameEn: row.full_name_en,
    role: row.role,
    mustChangePassword: row.must_change_password,
  };
}

export async function signIn(fileNumber: string, password: string): Promise<Profile> {
  if (!/^\d{6}$/.test(fileNumber)) throw new AuthFailure('invalid_file_number');
  const { error } = await supabase.auth.signInWithPassword({ email: emailFor(fileNumber), password });
  if (error) throw new AuthFailure(isAuthRetryableFetchError(error) ? 'no_internet' : error.status && error.status >= 500 ? 'generic' : 'invalid_credentials');
  const profile = await currentProfile();
  if (!profile) throw new AuthFailure('account_disabled');
  return profile;
}

/**
 * Saves the new password, then signs in again with it (the server ends the old session).
 * Returns false when the password was saved but signing in again failed: the caller must then send
 * the user to the login screen, because the old session no longer works on the server.
 */
export async function changePassword(newPassword: string): Promise<boolean> {
  // Read the e-mail from the session saved on the phone BEFORE the change: afterwards the server
  // has ended this session and asking it for the user fails.
  const { data: local } = await supabase.auth.getSession();
  const email = local.session?.user?.email ?? null;
  const { error } = await supabase.functions.invoke('change-password', { body: { new_password: newPassword } });
  if (error) {
    let code = 'generic';
    if (error instanceof FunctionsHttpError) {
      try {
        code = (await error.context.json())?.error ?? 'generic';
      } catch {}
    }
    throw new AuthFailure(code);
  }
  // Changing the password ends the old session: sign in again with the new one (same as the web panel).
  if (!email) return false;
  const { error: again } = await supabase.auth.signInWithPassword({ email, password: newPassword });
  return !again;
}

export async function bindThisDevice(): Promise<DeviceStatus> {
  const { data, error } = await supabase.rpc('bind_device', {
    p_device_identifier: await deviceId(),
    p_platform: platform,
    p_model: model(),
  });
  if (error) throw new AuthFailure('generic');
  return data as DeviceStatus;
}

export async function hasConsent(employeeId: string): Promise<boolean> {
  const { data } = await supabase.from('consents').select('id').eq('employee_id', employeeId).limit(1);
  return (data ?? []).length > 0;
}

export async function giveConsent(employeeId: string): Promise<void> {
  const { error } = await supabase.from('consents').insert({ employee_id: employeeId, consent_version: CONSENT_VERSION });
  if (!error) return;
  // Refused by row security / an expired token means this phone's session no longer works on the server.
  if (error.code === '42501' || error.code?.startsWith('PGRST3')) throw new AuthFailure('not_signed_in');
  throw new AuthFailure('generic');
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
