/// <reference types="jest" />
import { hasKey } from '../i18n';
import { containsFileNumber, hasDigit, hasLetter, newPasswordProblem, passwordChecklist, passwordProblem } from '../passwordRules';

const FILE = 710042;

describe('passwordProblem (same order and codes as the change-password function)', () => {
  it('accepts a password with letters and digits that is long enough', () => {
    expect(passwordProblem('sanad2026', FILE)).toBeNull();
    expect(passwordProblem('abcdefg1')).toBeNull();
  });

  it('rejects anything that is not a string', () => {
    expect(passwordProblem(undefined)).toBe('missing_password');
    expect(passwordProblem(12345678)).toBe('missing_password');
  });

  it('needs at least 8 characters', () => {
    expect(passwordProblem('')).toBe('too_short');
    expect(passwordProblem('abc1234')).toBe('too_short');
    expect(passwordProblem('abc12345')).toBeNull();
  });

  it('allows at most 72 characters', () => {
    expect(passwordProblem('a1'.repeat(36))).toBeNull();
    expect(passwordProblem('a1'.repeat(36) + 'x')).toBe('too_long');
  });

  it('needs a letter, then a digit', () => {
    expect(passwordProblem('12345678')).toBe('needs_letter');
    expect(passwordProblem('abcdefgh')).toBe('needs_digit');
    // Length is checked before letters, like the server.
    expect(passwordProblem('1234')).toBe('too_short');
  });

  it('counts Arabic letters and Arabic-Indic digits like the server (\\p{L}, \\p{Nd})', () => {
    expect(passwordProblem('سندسند12')).toBeNull();
    expect(passwordProblem('abcdefg٣')).toBeNull();
    expect(passwordProblem('١٢٣٤٥٦٧٨')).toBe('needs_letter');
    expect(hasLetter('ب')).toBe(true);
    expect(hasDigit('٧')).toBe(true);
    expect(hasLetter('12-_!')).toBe(false);
  });

  it('rejects the user\'s own file number inside the password', () => {
    expect(passwordProblem('ab710042', FILE)).toBe('contains_file_number');
    expect(passwordProblem('x710042y', FILE)).toBe('contains_file_number');
    expect(passwordProblem('ab710043', FILE)).toBeNull();
    expect(passwordProblem('ab710042')).toBeNull();
    expect(containsFileNumber('ab710042', null)).toBe(false);
  });
});

describe('newPasswordProblem', () => {
  it('reports the password problem before a mismatch', () => {
    expect(newPasswordProblem('short1', 'other', FILE)).toBe('too_short');
  });

  it('reports a mismatch once the password itself is fine', () => {
    expect(newPasswordProblem('sanad2026', 'sanad2027', FILE)).toBe('mismatch');
    expect(newPasswordProblem('sanad2026', 'sanad2026', FILE)).toBeNull();
  });
});

describe('passwordChecklist', () => {
  const state = (pw: string, confirm = '') => Object.fromEntries(passwordChecklist(pw, confirm, FILE).map((r) => [r.id, r.ok]));

  it('starts with every rule unmet and no match row', () => {
    expect(state('')).toEqual({ length: false, letter: false, digit: false, no_file_number: false });
  });

  it('ticks rules as the user types', () => {
    expect(state('abc')).toEqual({ length: false, letter: true, digit: false, no_file_number: true });
    expect(state('abc12345')).toEqual({ length: true, letter: true, digit: true, no_file_number: true });
    expect(state('a710042b')).toMatchObject({ no_file_number: false });
  });

  it('shows the match row only after typing the confirmation', () => {
    expect(state('abc12345', 'abc')).toMatchObject({ match: false });
    expect(state('abc12345', 'abc12345')).toMatchObject({ match: true });
  });

  it('lists the maximum length only when it is broken', () => {
    expect(state('a1'.repeat(40))).toMatchObject({ max_length: false });
    expect('max_length' in state('a1'.repeat(10))).toBe(false);
  });

  it('agrees with passwordProblem: all rules met means no problem', () => {
    for (const pw of ['', 'abc', 'abcdefgh', '12345678', 'a710042b', 'abc12345', 'a1'.repeat(40)]) {
      const allOk = passwordChecklist(pw, pw, FILE).every((r) => r.ok);
      expect(allOk).toBe(passwordProblem(pw, FILE) === null);
    }
  });
});

describe('texts', () => {
  it('has a text for every code the screen can show', () => {
    const codes = ['missing_password', 'too_short', 'too_long', 'needs_letter', 'needs_digit', 'contains_file_number', 'mismatch', 'password_rejected', 'not_signed_in', 'update_failed', 'account_disabled', 'no_internet', 'generic'];
    for (const code of codes) expect(hasKey(`error_${code}`)).toBe(true);
    for (const id of ['length', 'max_length', 'letter', 'digit', 'no_file_number', 'match']) expect(hasKey(`auth_rule_${id}`)).toBe(true);
  });
});
