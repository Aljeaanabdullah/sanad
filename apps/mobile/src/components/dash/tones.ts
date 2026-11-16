// Tinted background / foreground pairs for status tones: the same values the kit uses in Badge and
// Notice (src/components/ui.tsx), so the calendar cells and the legend match the badges exactly.
import type { Palette } from '../../lib/theme';
import type { DayTone } from '../../lib/calendarView';

export function tint(c: Palette, tone: DayTone): { bg: string; fg: string } {
  const map: Record<DayTone, { bg: string; fg: string }> = c.dark
    ? { ok: { bg: '#163A2C', fg: '#7FD1A8' }, danger: { bg: '#3D1C22', fg: '#FF8A80' }, warn: { bg: '#3B3016', fg: '#F2C96B' }, info: { bg: '#16304F', fg: '#90C2F5' }, neutral: { bg: c.surfaceAlt, fg: c.muted } }
    : { ok: { bg: '#E3F2EA', fg: '#1F6B4A' }, danger: { bg: '#FBE7E7', fg: '#A31F1F' }, warn: { bg: '#FBF0D6', fg: '#7A5600' }, info: { bg: '#E3EEFA', fg: '#0F4F99' }, neutral: { bg: c.surfaceAlt, fg: c.muted } };
  return map[tone];
}
