// Public Supabase settings (safe to ship in the app; data is protected by RLS).
// Override with EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (never put a secret key here).
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://etaetoflotynlmgrehuu.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_5R1YPcMEQ0HQ-kdJ0DsLeA_vg49wCA4';

/** Internal e-mail behind a file number. Users only ever type the file number.
 * The "jahez.local" domain is from the project's old name; every account signs in with it, so it stays. */
export const emailFor = (fileNumber: string | number) => `${fileNumber}@jahez.local`;

export const CONSENT_VERSION = 'v1';

/**
 * «اسأل سند» relay on the company server (PRD 18.1, version 1.12). It checks the employee's own
 * session and talks to the OpenClaw agent; no AI key is ever in the app.
 */
export const ASK_URL = process.env.EXPO_PUBLIC_SANAD_ASK_URL ?? 'https://open.abdullahaljeaan.com/sanad-ask';
