/** "YYYY-MM-DD" of a local calendar date. */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Parses "YYYY-MM-DD" as a local calendar date (no time zone shift). */
export function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** "d/m" of "YYYY-MM-DD" or a Date. */
export function dm(v: string | Date): string {
  const d = typeof v === 'string' ? parseYmd(v) : v;
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export function hm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function locale(lang: 'ar' | 'en') {
  return lang === 'ar' ? 'ar-KW' : 'en-GB';
}

export function longDate(d: Date, lang: 'ar' | 'en'): string {
  return new Intl.DateTimeFormat(locale(lang), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

export function mediumDate(d: Date, lang: 'ar' | 'en'): string {
  return new Intl.DateTimeFormat(locale(lang), { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

export function monthYear(d: Date, lang: 'ar' | 'en'): string {
  return new Intl.DateTimeFormat(locale(lang), { month: 'long', year: 'numeric' }).format(d);
}

/** Kuwait wall-clock time on a calendar date, as an instant (Kuwait is UTC+3, no daylight saving). */
export function kuwaitTime(day: Date, hour: number, minute: number): Date {
  return new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), hour - 3, minute));
}

/** Days from Saturday (0) to Friday (6), the Kuwait week. */
export function saturdayIndex(d: Date): number {
  return (d.getDay() + 1) % 7;
}

/** Relative "x ago" key and number. */
export function agoParts(at: Date, now = new Date()): { key: 'ago_minutes' | 'ago_hours' | 'ago_days'; n: number } {
  const ms = now.getTime() - at.getTime();
  const min = Math.floor(ms / 60000);
  if (min < 60) return { key: 'ago_minutes', n: Math.min(Math.max(min, 1), 59) };
  const h = Math.floor(min / 60);
  if (h < 24) return { key: 'ago_hours', n: h };
  return { key: 'ago_days', n: Math.floor(h / 24) };
}
