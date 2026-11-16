import type { DayRecord } from '../api';
import {
  buildMonth,
  DAY_VIEW,
  dayState,
  groupByDay,
  leaveByDay,
  LEGEND,
  monthGrid,
  monthTotals,
  periodMonthOf,
  periodMonthsFor,
  typeLabel,
  worstOf,
} from '../calendarView';
import { hasKey, makeT } from '../i18n';

function rec(day: string, over: Partial<DayRecord> = {}): DayRecord {
  return {
    day,
    kind: 'work',
    shiftStart: null,
    shiftEnd: null,
    arrival: 'on_time',
    departure: 'done',
    checkIn: null,
    checkOut: null,
    lateMinutes: 0,
    earlyLeaveMinutes: 0,
    checkInCorrected: false,
    checkOutCorrected: false,
    ...over,
  };
}

describe('monthGrid (Saturday first)', () => {
  it('November 2026 starts on a Sunday, so one empty Saturday cell first', () => {
    const w = monthGrid(2026, 10);
    expect(w[0]).toEqual([null, 1, 2, 3, 4, 5, 6]);
    expect(w.every((row) => row.length === 7)).toBe(true);
    expect(w.flat().filter((d) => d != null)).toHaveLength(30);
    expect(w[w.length - 1]).toEqual([28, 29, 30, null, null, null, null]);
  });

  it('a month that starts on Saturday has no leading gap', () => {
    // 1 August 2026 is a Saturday.
    expect(monthGrid(2026, 7)[0][0]).toBe(1);
  });

  it('February in a leap year', () => {
    expect(monthGrid(2028, 1).flat().filter((d) => d != null)).toHaveLength(29);
  });
});

describe('bonus period months', () => {
  it('the 21st belongs to next month, the 20th to this month', () => {
    expect(periodMonthOf('2026-10-20')).toBe('2026-10');
    expect(periodMonthOf('2026-10-21')).toBe('2026-11');
    expect(periodMonthOf('2026-12-25')).toBe('2027-01');
  });
  it('a calendar month overlaps two periods', () => {
    expect(periodMonthsFor(2026, 10)).toEqual(['2026-11', '2026-12']);
  });
});

describe('day state', () => {
  const today = '2026-11-16';
  it('worst shift wins on a day with two shifts', () => {
    expect(worstOf([rec('2026-11-02'), rec('2026-11-02', { arrival: 'late' })]).arrival).toBe('late');
    expect(worstOf([rec('2026-11-02', { arrival: 'absent' }), rec('2026-11-02', { arrival: 'late' })]).arrival).toBe('absent');
  });

  it('maps records to states', () => {
    expect(dayState([rec('2026-11-02')], undefined, '2026-11-02', today)).toBe('on_time');
    expect(dayState([rec('2026-11-02', { arrival: 'late' })], undefined, '2026-11-02', today)).toBe('late');
    expect(dayState([rec('2026-11-02', { arrival: 'absent' })], undefined, '2026-11-02', today)).toBe('absent');
    expect(dayState([rec('2026-11-06', { kind: 'off', arrival: null })], undefined, '2026-11-06', today)).toBe('off');
    expect(dayState([rec('2026-11-07', { kind: 'holiday', arrival: null })], undefined, '2026-11-07', today)).toBe('holiday');
    expect(dayState([rec('2026-11-16', { arrival: 'pending' })], undefined, '2026-11-16', today)).toBe('pending');
    expect(dayState([rec('2026-11-20', { arrival: 'pending' })], undefined, '2026-11-20', today)).toBe('upcoming');
    expect(dayState(undefined, undefined, '2026-11-02', today)).toBe('none');
  });

  it('an absence covered by leave shows as leave', () => {
    expect(dayState([rec('2026-11-03', { arrival: 'absent' })], 'إجازة مرضية', '2026-11-03', today)).toBe('leave');
    // Coming in anyway still counts as present.
    expect(dayState([rec('2026-11-03')], 'إجازة مرضية', '2026-11-03', today)).toBe('on_time');
  });

  it('every state has a label key in the strings, and tinted states have a symbol too', () => {
    for (const [state, v] of Object.entries(DAY_VIEW)) {
      expect([state, hasKey(v.label)]).toEqual([state, true]);
      if (v.tone && v.tone !== 'neutral') expect(v.icon).not.toBeNull();
    }
    for (const s of LEGEND) expect(DAY_VIEW[s].icon).not.toBeNull();
  });
});

describe('leaves', () => {
  it('expands real leave ranges and skips recorded absences', () => {
    const m = leaveByDay([
      { type: 'إجازة دورية', from: '2026-10-30', to: '2026-11-02' },
      { type: 'غياب', from: '2026-11-05', to: null },
      { type: 'إجازة طارئة', from: '2026-11-09', to: null },
    ]);
    expect([...m.keys()]).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-09']);
    expect(m.get('2026-11-01')).toBe('إجازة دورية');
  });
});

describe('month totals', () => {
  it('counts days, missing check-outs and late minutes', () => {
    const records = [
      rec('2026-11-01'),
      rec('2026-11-02', { arrival: 'late', lateMinutes: 12 }),
      rec('2026-11-03', { arrival: 'late', lateMinutes: 5, departure: 'missing' }),
      rec('2026-11-04', { arrival: 'absent', departure: null }),
      rec('2026-11-05', { arrival: 'absent', departure: null }),
      rec('2026-11-06', { kind: 'off', arrival: null, departure: null }),
    ];
    const v = buildMonth(2026, 10, records, [{ type: 'إجازة مرضية', from: '2026-11-05', to: null }], '2026-11-16');
    expect(v.totals).toEqual({ present: 3, late: 2, absent: 1, leave: 1, missingOut: 1, lateMinutes: 17 });
    expect(v.days.get('2026-11-05')?.state).toBe('leave');
    expect(v.days.get('2026-11-05')?.leave).toBe('إجازة مرضية');
    expect(v.weeks[0][1]).toEqual({ day: 1, date: '2026-11-01', state: 'on_time' });
    expect(v.days.size).toBe(30);
  });

  it('empty month', () => {
    expect(monthTotals([])).toEqual({ present: 0, late: 0, absent: 0, leave: 0, missingOut: 0, lateMinutes: 0 });
    expect(groupByDay([]).size).toBe(0);
  });
});

describe('type labels', () => {
  it('Arabic keeps the stored value; English translates', () => {
    const en = makeT('en');
    expect(typeLabel(makeT('ar'), true, 'إجازة دورية')).toBe('إجازة دورية');
    expect(typeLabel(en, false, 'إجازة دورية')).toBe(en('leave_annual'));
    expect(typeLabel(en, false, 'لفت نظر')).toBe('Notice');
    expect(typeLabel(en, false, 'شيء آخر')).toBe('شيء آخر');
    expect(typeLabel(en, false, null)).toBe('');
  });
});
