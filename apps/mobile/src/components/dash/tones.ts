// Tinted background / foreground pairs for status tones: the same values the kit uses in Badge and
// Notice (statusTints in src/lib/theme.ts), so the calendar cells and the legend match the badges exactly.
import { statusTints, type Palette } from '../../lib/theme';
import type { DayTone } from '../../lib/calendarView';

export function tint(c: Palette, tone: DayTone): { bg: string; fg: string } {
  const map: Record<DayTone, { bg: string; fg: string }> = statusTints(c);
  return map[tone];
}
