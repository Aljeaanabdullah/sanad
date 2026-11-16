/// <reference types="jest" />
import { makeT } from '../../lib/i18n';
import { isConditional, readyAnswerFits } from '../route';

describe('typed questions that need a real answer go to the AI', () => {
  it.each([
    // The owner's question on 2026-11-16 (Arabic-Indic and Latin digit).
    'اذا اخذت اجازه الاسبوع الياي ٣ ايام بأثر على مكافأتي؟',
    'اذا اخذت اجازه الاسبوع الياي 3 ايام بأثر على مكافأتي؟',
    'لو تأخرت بكرة بيأثر على المكافأة؟',
    'وإذا غبت يوم؟',
    'ممكن آخذ إجازة؟',
    'الإجازة المرضية تأثر على المكافأة؟',
    'What if I take leave next week, will it affect my bonus?',
    'If I am late tomorrow do I lose the bonus?',
    'ابي اعرف بالتفصيل كل الايام اللي تأخرت فيها هالشهر وليش',
    'شنو أسوي إذا نسيت أبصم؟',
    'شلون أحسّن وضعي هالشهر؟',
  ])('%s', (q) => {
    expect(readyAnswerFits(q)).toBe(false);
  });
});

describe('short direct questions keep the instant ready answer', () => {
  it.each([
    'كم يوم غبت؟',
    'ليش ما نزلت مكافأتي؟',
    'ليش ما أخذت مكافأة؟',
    'كم مرة تأخرت؟',
    'كم إجازاتي؟',
    'ليش علي خصم؟',
    'How many days was I absent?',
    'Am I eligible for the bonus?',
  ])('%s', (q) => {
    expect(readyAnswerFits(q)).toBe(true);
  });
});

it('every quick-question button would also pass as typed text (both languages)', () => {
  for (const lang of ['ar', 'en'] as const) {
    const t = makeT(lang);
    for (const k of ['dash_q_bonus', 'dash_q_deduction', 'dash_q_late', 'assistant_q_leave', 'asst_q_absence']) {
      expect([lang, k, readyAnswerFits(t(k))]).toEqual([lang, k, true]);
    }
  }
});

it('spots conditions with a joined و / ف and after letter folding', () => {
  expect(isConditional('وإذا تأخرت؟')).toBe(true);
  expect(isConditional('فلو غبت')).toBe(true);
  expect(isConditional('بيأثّر؟')).toBe(true);
  expect(isConditional('كم يوم غبت؟')).toBe(false);
  // "ليش" (why) is not a condition.
  expect(isConditional('ليش ما أخذت مكافأة؟')).toBe(false);
});
