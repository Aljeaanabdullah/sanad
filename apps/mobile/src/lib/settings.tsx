import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { makeT, type Lang, type T } from './i18n';
import { palettes, type Palette } from './theme';

export type ThemeMode = 'light' | 'dark';

type Settings = {
  ready: boolean;
  setupDone: boolean;
  lang: Lang;
  theme: ThemeMode;
  t: T;
  c: Palette;
  /** Arabic is right-to-left; layouts read this instead of the OS direction. */
  rtl: boolean;
  update: (patch: Partial<{ lang: Lang; theme: ThemeMode; setupDone: boolean }>) => Promise<void>;
};

const KEY = 'sanad_settings_v1';
const Ctx = createContext<Settings | null>(null);

export function SettingsProvider({ children, initial }: { children: ReactNode; initial?: Partial<{ lang: Lang; theme: ThemeMode; setupDone: boolean }> }) {
  const system = useColorScheme();
  const [state, setState] = useState({
    ready: !!initial,
    setupDone: initial?.setupDone ?? false,
    lang: initial?.lang ?? ('ar' as Lang),
    theme: initial?.theme ?? ((system === 'dark' ? 'dark' : 'light') as ThemeMode),
  });

  useEffect(() => {
    if (initial) return;
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        const saved = raw ? JSON.parse(raw) : {};
        setState((s) => ({ ...s, ...saved, ready: true }));
      })
      .catch(() => setState((s) => ({ ...s, ready: true })));
  }, [initial]);

  const update = useCallback(async (patch: Partial<{ lang: Lang; theme: ThemeMode; setupDone: boolean }>) => {
    setState((s) => {
      const next = { ...s, ...patch };
      AsyncStorage.setItem(KEY, JSON.stringify({ lang: next.lang, theme: next.theme, setupDone: next.setupDone })).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo<Settings>(
    () => ({ ...state, t: makeT(state.lang), c: palettes[state.theme], rtl: state.lang === 'ar', update }),
    [state, update],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings(): Settings {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSettings outside SettingsProvider');
  return v;
}
