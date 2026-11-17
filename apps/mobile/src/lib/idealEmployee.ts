// «الموظف المثالي» (S9), pure part (testable). Server rules: supabase/migrations/*_ideal_employee.sql.
// One winner per month for the whole company, nominated by department supervisors and approved by HR.
// Nominations are private; only the approved winner is public. Never linked to the bonus.
import { monthYear, parseYmd } from './dates';
import type { Lang } from './i18n';

/** A written reason: the same limits as the server. */
export const REASON_MIN = 10;
export const REASON_MAX = 500;

export type Winner = {
  month: string; // YYYY-MM-01
  nameAr: string;
  nameEn: string;
  jobTitle: string | null;
  departmentAr: string | null;
  departmentEn: string | null;
  reason: string;
  citation: string | null;
};

export type MyDepartment = {
  departmentId: string;
  departmentAr: string;
  departmentEn: string;
  month: string;
  monthClosed: boolean;
  nomination: {
    id: string;
    nomineeId: string;
    fileNumber: number;
    nameAr: string;
    nameEn: string;
    reason: string;
  } | null;
};

export type Candidate = { id: string; fileNumber: number; nameAr: string; nameEn: string; jobTitle: string | null };

type Row = Record<string, unknown>;
const s = (v: unknown) => (typeof v === 'string' ? v : null);
const n = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0));

export function toWinner(r: Row): Winner {
  return {
    month: String(r.month),
    nameAr: String(r.name_ar ?? ''),
    nameEn: String(r.name_en ?? r.name_ar ?? ''),
    jobTitle: s(r.job_title),
    departmentAr: s(r.department_ar),
    departmentEn: s(r.department_en),
    reason: String(r.reason ?? ''),
    citation: s(r.citation),
  };
}

export function toMyDepartment(r: Row): MyDepartment {
  return {
    departmentId: String(r.department_id),
    departmentAr: String(r.department_ar ?? ''),
    departmentEn: String(r.department_en ?? r.department_ar ?? ''),
    month: String(r.month),
    monthClosed: r.month_closed === true,
    nomination: r.nomination_id
      ? {
          id: String(r.nomination_id),
          nomineeId: String(r.nominee_id),
          fileNumber: n(r.nominee_file_number),
          nameAr: String(r.nominee_name_ar ?? ''),
          nameEn: String(r.nominee_name_en ?? r.nominee_name_ar ?? ''),
          reason: String(r.reason ?? ''),
        }
      : null,
  };
}

export function toCandidate(r: Row): Candidate {
  return {
    id: String(r.id),
    fileNumber: n(r.file_number),
    nameAr: String(r.name_ar ?? ''),
    nameEn: String(r.name_en ?? r.name_ar ?? ''),
    jobTitle: s(r.job_title),
  };
}

/** Newest first; the newest is the headline card, the rest is the hall of fame. */
export function splitWinners(list: Winner[]): { latest: Winner | null; hall: Winner[] } {
  const sorted = [...list].sort((a, b) => b.month.localeCompare(a.month));
  return { latest: sorted[0] ?? null, hall: sorted.slice(1) };
}

/** «نوفمبر 2026» / "November 2026" from YYYY-MM-01 (or YYYY-MM). */
export function monthLabel(month: string, lang: Lang): string {
  const ymd = /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : month.slice(0, 10);
  return monthYear(parseYmd(ymd), lang);
}

/** null = fine; otherwise a strings key. Counted after trimming, like the server. */
export function reasonError(text: string): 'ie_reason_short' | 'ie_reason_long' | null {
  const len = text.trim().length;
  if (len < REASON_MIN) return 'ie_reason_short';
  if (len > REASON_MAX) return 'ie_reason_long';
  return null;
}

// Arabic-Indic digits typed on an Arabic keyboard count as normal digits.
const latinDigits = (v: string) => v.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
// Arabic letters that people type in more than one way.
const fold = (v: string) =>
  latinDigits(v)
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .trim();

/** Search the department list by name (Arabic or English) or file number. Empty query = everyone. */
export function filterCandidates(list: Candidate[], query: string, limit = 30): Candidate[] {
  const q = fold(query);
  const hits = q
    ? list.filter((c) => String(c.fileNumber).includes(q) || fold(c.nameAr).includes(q) || fold(c.nameEn).includes(q))
    : list;
  return hits.slice(0, limit);
}

const ERRORS = [
  'not_allowed', 'cannot_nominate_self', 'nominee_not_in_department', 'reason_too_short', 'reason_too_long', 'month_closed',
];

/** Server refusal -> strings key. */
export function ieErrorKey(e: unknown): string {
  const msg = typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e ?? '');
  const code = ERRORS.find((k) => msg.includes(k));
  return code ? `ie_error_${code}` : 'ie_error_generic';
}
