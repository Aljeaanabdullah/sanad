import base from './strings.json';
import a from './strings-a.json';
import b from './strings-b.json';
import c from './strings-c.json';
import d from './strings-d.json';
import e from './strings-e.json';
import f from './strings-f.json';

export type Lang = 'ar' | 'en';

// strings.json holds the shared texts; strings-a..d.json hold texts added per screen group
// (punch/home, requests, dashboard/reports/more, sign-in, e = notifications, f = emergency), merged here.
const tables: Record<Lang, Record<string, string>> = {
  ar: { ...base.ar, ...a.ar, ...b.ar, ...c.ar, ...d.ar, ...e.ar, ...f.ar },
  en: { ...base.en, ...a.en, ...b.en, ...c.en, ...d.en, ...e.en, ...f.en },
};

export type T = {
  lang: Lang;
  isAr: boolean;
  /** Text for [key]; {name} placeholders are replaced from [vars]. Unknown keys fall back to the generic error. */
  (key: string, vars?: Record<string, string | number>): string;
};

export function makeT(lang: Lang): T {
  const table = tables[lang];
  const fn = ((key: string, vars?: Record<string, string | number>) => {
    let s = table[key] ?? table['error_generic'];
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
    return s;
  }) as T;
  fn.lang = lang;
  fn.isAr = lang === 'ar';
  return fn;
}

export function hasKey(key: string): boolean {
  return key in tables.ar;
}

/** Every key with both languages (used by the strings test). */
export const allKeys = () => ({ ar: Object.keys(tables.ar), en: Object.keys(tables.en) });
