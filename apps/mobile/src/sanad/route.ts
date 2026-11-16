// «اسأل سند» (PRD 18.1, version 1.12): which questions get a ready answer on the phone and which go
// to the «مساعد سند» agent. Quick-question buttons always get the ready answer. Typed text gets it
// only on a confident match: one known topic, short, and no condition or "what if" — those need a
// real answer, which the ready texts can't give (owner's decision: «الاثنين مع بعض»).
import { normalizeQuestion, topicsIn } from './dashboard';

/** Words that turn a question into a condition / hypothetical (compared after letter folding). */
const CONDITIONAL = new Set([
  'اذا', 'لو', 'لين', 'لما', 'بياثر', 'ياثر', 'تاثر', 'تاثير', 'يصير', 'بيصير', 'ممكن', 'افرض', 'نفرض', 'فرضا',
  'if', 'would', 'could', 'will', 'suppose', 'unless', 'affect', 'affects',
]);
/** A ready answer is for a short, direct question. */
export const READY_MAX_WORDS = 7;
export const READY_MAX_CHARS = 45;

function words(question: string): string[] {
  return normalizeQuestion(question)
    .replace(/[؟?!.,،؛;:()«»"'\-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** True when the typed question is a condition / hypothetical ("اذا…", "لو…", "بيأثر", "what if"). */
export function isConditional(question: string): boolean {
  return words(question).some((w) => CONDITIONAL.has(w) || ((w.startsWith('و') || w.startsWith('ف')) && CONDITIONAL.has(w.slice(1))));
}

/**
 * Should typed text get the ready answer? Only when it touches exactly one known topic, is short,
 * and is not a condition. Everything else goes to the AI assistant.
 */
export function readyAnswerFits(question: string): boolean {
  const q = question.trim();
  if (!q || q.length > READY_MAX_CHARS) return false;
  if (words(q).length > READY_MAX_WORDS) return false;
  if (topicsIn(q).length !== 1) return false;
  return !isConditional(q);
}
