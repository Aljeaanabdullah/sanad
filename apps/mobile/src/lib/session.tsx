import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as Auth from './auth';
import { ensureDeviceKey } from './deviceKey';
import { unregisterPush } from './push';
import type { Profile } from './auth';
import { supabase } from './supabase';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Reads the profile; a network failure is retried, and a stalled request never keeps the splash up. */
async function loadProfile(): Promise<Profile | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await Promise.race([
        Auth.currentProfile(),
        wait(15_000).then(() => {
          throw new Error('timeout');
        }),
      ]);
    } catch {
      if (attempt < 2) await wait(1500 * (attempt + 1));
    }
  }
  return null;
}

/** Where the signed-in flow stands (PRD 3.1: device binding; first sign-in password change; consent). */
export type Step = 'loading' | 'signed_out' | 'change_password' | 'blocked' | 'consent' | 'ready';

type Session = {
  step: Step;
  profile: Profile | null;
  blockedCode: 'other_device' | 'device_taken';
  afterSignIn: (p: Profile) => Promise<void>;
  passwordChanged: () => Promise<void>;
  consentGiven: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [step, setStep] = useState<Step>('loading');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [blockedCode, setBlocked] = useState<'other_device' | 'device_taken'>('other_device');

  const afterPassword = useCallback(async (p: Profile) => {
    const ok = await Auth.hasConsent(p.id).catch(() => false);
    setStep(ok ? 'ready' : 'consent');
  }, []);

  const afterSignIn = useCallback(
    async (p: Profile) => {
      setProfile(p);
      const status = await Auth.bindThisDevice().catch(() => 'ok' as const);
      if (status === 'other_device' || status === 'device_taken') {
        setBlocked(status);
        setStep('blocked');
        return;
      }
      // PRD 4.7: register this phone's signing key in the background (no prompt; tried again at the next punch).
      ensureDeviceKey().catch(() => {});
      if (p.mustChangePassword) {
        setStep('change_password');
        return;
      }
      await afterPassword(p);
    },
    [afterPassword],
  );

  useEffect(() => {
    loadProfile()
      .then((p) => (p ? afterSignIn(p) : setStep('signed_out')))
      .catch(() => setStep('signed_out'));
  }, [afterSignIn]);

  // The session can end outside the app (password reset, account disabled, refresh token revoked).
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setProfile(null);
        setStep('signed_out');
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<Session>(
    () => ({
      step,
      profile,
      blockedCode,
      afterSignIn,
      passwordChanged: async () => {
        if (!profile) return;
        const p = { ...profile, mustChangePassword: false };
        setProfile(p);
        await afterPassword(p);
      },
      consentGiven: async () => {
        if (!profile) return;
        await Auth.giveConsent(profile.id);
        setStep('ready');
      },
      signOut: async () => {
        // This phone stops getting the account's notifications (needs the session, so before signing out).
        await unregisterPush().catch(() => {});
        await Auth.signOut();
        setProfile(null);
        setStep('signed_out');
      },
    }),
    [step, profile, blockedCode, afterSignIn, afterPassword],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
}
