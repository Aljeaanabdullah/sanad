// Password rules for the first sign-in change, the same as the server
// (supabase/functions/change-password/index.ts -> passwordProblem): at least 8 characters,
// at most 72, at least one letter, at least one digit, and not the user's own file number.
// The app checks first so the user sees the problem at once; the server still decides.

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

/** Error codes the server can answer with; each has a text `error_<code>`. */
export type PasswordProblem = 'missing_password' | 'too_short' | 'too_long' | 'needs_letter' | 'needs_digit' | 'contains_file_number';

// The server uses \p{L} and \p{Nd}. Hermes may lack Unicode property escapes, so fall back to the
// scripts our users type (Latin, Arabic and Persian letters; ASCII, Arabic-Indic and Persian digits).
function unicodeOr(pattern: string, fallback: RegExp): RegExp {
  try {
    return new RegExp(pattern, 'u');
  } catch {
    return fallback;
  }
}
const LETTER = unicodeOr('\\p{L}', /[A-Za-zÀ-ɏͰ-ϿЀ-ӿؠ-يٮ-ۓۺ-ۿݐ-ݿﭐ-﷿ﹰ-ﻼ]/);
const DIGIT = unicodeOr('\\p{Nd}', /[0-9٠-٩۰-۹]/);

export const hasLetter = (password: string) => LETTER.test(password);
export const hasDigit = (password: string) => DIGIT.test(password);

export function containsFileNumber(password: string, fileNumber?: number | null): boolean {
  return fileNumber !== undefined && fileNumber !== null && password.includes(String(fileNumber));
}

/** The first rule the password breaks, in the server's order, or null when it is acceptable. */
export function passwordProblem(password: unknown, fileNumber?: number | null): PasswordProblem | null {
  if (typeof password !== 'string') return 'missing_password';
  if (password.length < PASSWORD_MIN) return 'too_short';
  if (password.length > PASSWORD_MAX) return 'too_long';
  if (!hasLetter(password)) return 'needs_letter';
  if (!hasDigit(password)) return 'needs_digit';
  if (containsFileNumber(password, fileNumber)) return 'contains_file_number';
  return null;
}

/** What the new + confirm form should say: the password's own problem first, then a mismatch. */
export function newPasswordProblem(password: string, confirm: string, fileNumber?: number | null): PasswordProblem | 'mismatch' | null {
  return passwordProblem(password, fileNumber) ?? (password !== confirm ? 'mismatch' : null);
}

export type RuleId = 'length' | 'max_length' | 'letter' | 'digit' | 'no_file_number' | 'match';
export type RuleCheck = { id: RuleId; ok: boolean };

/**
 * The live checklist under the fields. `max_length` is only listed once it is broken (it is rare and
 * would crowd the list); `match` only once something was typed in the confirm field.
 */
export function passwordChecklist(password: string, confirm: string, fileNumber?: number | null): RuleCheck[] {
  const list: RuleCheck[] = [
    { id: 'length', ok: password.length >= PASSWORD_MIN },
    { id: 'letter', ok: hasLetter(password) },
    { id: 'digit', ok: hasDigit(password) },
    { id: 'no_file_number', ok: password.length > 0 && !containsFileNumber(password, fileNumber) },
  ];
  if (password.length > PASSWORD_MAX) list.splice(1, 0, { id: 'max_length', ok: false });
  if (confirm.length > 0) list.push({ id: 'match', ok: password === confirm });
  return list;
}
