// S9 «الموظف المثالي»: the rules the screen applies before asking the server, the texts, and the push route.
import { allKeys, hasKey, makeT } from '../i18n';
import {
  filterCandidates, ieErrorKey, monthLabel, reasonError, REASON_MAX, REASON_MIN, splitWinners, toMyDepartment, toWinner,
  type Candidate, type Winner,
} from '../idealEmployee';
import { NOTIFICATION_KINDS, routeFor } from '../notify';
import h from '../strings-h.json';

const winner = (month: string, over: Partial<Winner> = {}): Winner => ({
  month, nameAr: 'موظف', nameEn: 'Employee', jobTitle: null, departmentAr: null, departmentEn: null,
  reason: 'سبب واضح ومكتوب', citation: null, ...over,
});

describe('reason rule (same limits as the server)', () => {
  it('needs a written reason of at least 10 characters', () => {
    expect(reasonError('')).toBe('ie_reason_short');
    expect(reasonError('ممتاز')).toBe('ie_reason_short');
    expect(reasonError('   جيد جداً   ')).toBe('ie_reason_short'); // spaces do not count
    expect(reasonError('ممتاز جداً')).toBeNull(); // exactly 10
    expect(reasonError('a'.repeat(REASON_MIN))).toBeNull();
  });
  it('refuses more than 500 characters', () => {
    expect(reasonError('a'.repeat(REASON_MAX))).toBeNull();
    expect(reasonError('a'.repeat(REASON_MAX + 1))).toBe('ie_reason_long');
  });
});

describe('winners: newest is the headline, the rest is the hall of fame', () => {
  it('sorts by month, newest first', () => {
    const { latest, hall } = splitWinners([winner('2026-09-01'), winner('2026-11-01'), winner('2026-10-01')]);
    expect(latest?.month).toBe('2026-11-01');
    expect(hall.map((w) => w.month)).toEqual(['2026-10-01', '2026-09-01']);
  });
  it('no winners yet', () => {
    expect(splitWinners([])).toEqual({ latest: null, hall: [] });
  });
  it('maps the public card only (no photo, no ids)', () => {
    const w = toWinner({
      month: '2026-11-01', name_ar: 'أحمد', name_en: 'Ahmad', job_title: 'رقيب', department_ar: 'الإدارة',
      department_en: 'Admin', reason: 'التزام ومساعدة الزملاء', citation: null, employee_id: 'x',
    });
    expect(w).toEqual({
      month: '2026-11-01', nameAr: 'أحمد', nameEn: 'Ahmad', jobTitle: 'رقيب', departmentAr: 'الإدارة',
      departmentEn: 'Admin', reason: 'التزام ومساعدة الزملاء', citation: null,
    });
  });
});

describe('my departments', () => {
  it('without a nomination yet', () => {
    const d = toMyDepartment({ department_id: 'd1', department_ar: 'قسم', department_en: 'Dept', month: '2026-11-01', month_closed: false, nomination_id: null });
    expect(d.nomination).toBeNull();
    expect(d.monthClosed).toBe(false);
  });
  it('with my nomination, month closed', () => {
    const d = toMyDepartment({
      department_id: 'd1', department_ar: 'قسم', department_en: 'Dept', month: '2026-11-01', month_closed: true,
      nomination_id: 'n1', nominee_id: 'e1', nominee_file_number: 710001, nominee_name_ar: 'سعد', nominee_name_en: 'Saad', reason: 'سبب واضح ومكتوب',
    });
    expect(d.monthClosed).toBe(true);
    expect(d.nomination).toEqual({ id: 'n1', nomineeId: 'e1', fileNumber: 710001, nameAr: 'سعد', nameEn: 'Saad', reason: 'سبب واضح ومكتوب' });
  });
});

describe('candidate search', () => {
  const list: Candidate[] = [
    { id: '1', fileNumber: 710001, nameAr: 'أحمد علي', nameEn: 'Ahmad Ali', jobTitle: null },
    { id: '2', fileNumber: 710002, nameAr: 'فاطمة سالم', nameEn: 'Fatima Salem', jobTitle: null },
    { id: '3', fileNumber: 711234, nameAr: 'مصطفى', nameEn: 'Mustafa', jobTitle: null },
  ];
  it('empty query lists everyone (up to the limit)', () => {
    expect(filterCandidates(list, '')).toHaveLength(3);
    expect(filterCandidates(list, '', 2)).toHaveLength(2);
  });
  it('by file number, also typed in Arabic digits', () => {
    expect(filterCandidates(list, '1234').map((c) => c.id)).toEqual(['3']);
    expect(filterCandidates(list, '١٢٣٤').map((c) => c.id)).toEqual(['3']);
  });
  it('by Arabic name, whatever form of alef / taa marbuta / yaa', () => {
    expect(filterCandidates(list, 'احمد').map((c) => c.id)).toEqual(['1']);
    expect(filterCandidates(list, 'فاطمه').map((c) => c.id)).toEqual(['2']);
    expect(filterCandidates(list, 'مصطفي').map((c) => c.id)).toEqual(['3']);
  });
  it('by English name, any case', () => {
    expect(filterCandidates(list, 'SALEM').map((c) => c.id)).toEqual(['2']);
  });
});

describe('texts', () => {
  it('month label in both languages', () => {
    expect(monthLabel('2026-11-01', 'en')).toMatch(/November 2026/);
    expect(monthLabel('2026-11', 'ar')).toMatch(/نوفمبر/);
  });
  it('every server refusal has a text; unknown ones fall back to the generic text', () => {
    for (const code of ['not_allowed', 'cannot_nominate_self', 'nominee_not_in_department', 'reason_too_short', 'reason_too_long', 'month_closed']) {
      const key = ieErrorKey({ message: code });
      expect(key).toBe(`ie_error_${code}`);
      expect(hasKey(key)).toBe(true);
    }
    expect(ieErrorKey(new Error('boom'))).toBe('ie_error_generic');
    expect(ieErrorKey(null)).toBe('ie_error_generic');
  });
  it('strings-h.json: same keys in Arabic and English, all loaded', () => {
    expect(Object.keys(h.ar).sort()).toEqual(Object.keys(h.en).sort());
    const { ar, en } = allKeys();
    for (const k of Object.keys(h.ar)) {
      expect(ar).toContain(k);
      expect(en).toContain(k);
    }
  });
  it('placeholders are filled', () => {
    const t = makeT('ar');
    expect(t('ie_month_of', { month: 'نوفمبر 2026' })).toBe('الموظف المثالي لشهر نوفمبر 2026');
    expect(t('ie_reason_short', { min: REASON_MIN })).toContain('10');
  });
});

describe('push notification', () => {
  it('the announcement opens the ideal employee screen', () => {
    expect(NOTIFICATION_KINDS).toContain('ideal_employee');
    expect(routeFor('ideal_employee', { month: '2026-11' })).toBe('/ideal-employee');
  });
});
