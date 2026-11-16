// The file number field: users only ever type 6 digits. Phones set to Arabic often type
// Arabic-Indic digits (٧١٠٠٤٢) on the number pad; the server expects ASCII, so convert them.

export const FILE_NUMBER_LENGTH = 6;

/** Arabic-Indic (U+0660..) and Persian (U+06F0..) digits to 0-9; everything else is dropped. */
export function cleanFileNumber(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= 0x30 && code <= 0x39) out += ch;
    else if (code >= 0x660 && code <= 0x669) out += String(code - 0x660);
    else if (code >= 0x6f0 && code <= 0x6f9) out += String(code - 0x6f0);
    if (out.length === FILE_NUMBER_LENGTH) break;
  }
  return out;
}

export const isFileNumber = (value: string) => /^\d{6}$/.test(value);
