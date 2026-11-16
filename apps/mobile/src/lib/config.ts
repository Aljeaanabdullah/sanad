// Public Supabase settings (safe to ship in the app; data is protected by RLS).
// Override with EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (never put a secret key here).
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://etaetoflotynlmgrehuu.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_5R1YPcMEQ0HQ-kdJ0DsLeA_vg49wCA4';

/** Internal e-mail behind a file number. Users only ever type the file number. */
export const emailFor = (fileNumber: string | number) => `${fileNumber}@jahez.local`;

export const CONSENT_VERSION = 'v1';
