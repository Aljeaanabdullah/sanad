import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as Auth from './auth';
import type { Profile } from './auth';

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
      if (p.mustChangePassword) {
        setStep('change_password');
        return;
      }
      await afterPassword(p);
    },
    [afterPassword],
  );

  useEffect(() => {
    Auth.currentProfile()
      .then((p) => (p ? afterSignIn(p) : setStep('signed_out')))
      .catch(() => setStep('signed_out'));
  }, [afterSignIn]);

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
