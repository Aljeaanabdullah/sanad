// Tinted background / foreground pairs for status tones: the same values the kit uses in Badge and
// Notice (src/components/ui.tsx), so the calendar cells and the legend match the badges exactly.
import type { Palette } from '../../lib/theme';
import type { DayTone } from '../../lib/calendarView';

export function tint(c: Palette, tone: DayTone): { bg: string; fg: string } {
  const map: Record<DayTone, { bg: string; fg: string }> = {
    ok: { bg: c.okSoft, fg: c.ok },
    danger: { bg: c.dangerSoft, fg: c.danger },
    warn: { bg: c.warnSoft, fg: c.warn },
    info: { bg: c.infoSoft, fg: c.info },
    neutral: { bg: c.surfaceAlt, fg: c.muted },
  };
  return map[tone];
}
