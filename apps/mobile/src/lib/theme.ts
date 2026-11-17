// Sanad identity: "sea glass" (owner decision 2026-11-17), the same palette as the web panel
// (apps/admin/src/app/globals.css, DESIGN.md). Colours come from the Kuwait Towers' enamel discs:
// deep sea teal, turquoise and a misted ground. Light and dark themes.

/** Fixed brand values that do not change with the theme (the header band, the sign-in band, the punch hero). */
export const brand = {
  /** Rail teal: the top app bar and the sign-in band, in both themes. */
  rail: '#0d3b41',
  /** Text on the rail. */
  onRail: '#ffffff',
  /** Secondary text on the rail (8.4:1). */
  railInk: '#c1dcd9',
  /** The lit disc: bright turquoise on the rail (6.8:1). */
  railDot: '#5fd3c6',
  /** Turquoise of the towers' discs. */
  turquoise: '#1fa89c',
  /** Deep ink that sits on turquoise and on light fills in dark mode. */
  ink: '#062528',
  /** Fixed raised surface for the snackbar (reads on both themes). */
  snack: '#0d3b41',
};

export type Palette = {
  dark: boolean;
  bg: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  muted: string;
  line: string;
  /** Edge of inputs: darker than `line` so a field reads at 3:1. */
  control: string;
  primary: string;
  onPrimary: string;
  accent: string;
  ok: string;
  warn: string;
  danger: string;
  /** The punch-in hero button: turquoise with deep ink. */
  hero: string;
  onHero: string;
  /** Text / icon colour on a `danger` fill. */
  onDanger: string;
};

export const palettes: Record<'light' | 'dark', Palette> = {
  light: {
    dark: false,
    bg: '#eef4f3',
    surface: '#ffffff',
    surfaceAlt: '#e2f1ef',
    text: '#0f2a2e',
    muted: '#536b6b',
    line: '#d6e3e1',
    control: '#6f8f8b',
    primary: '#0e5a61',
    onPrimary: '#ffffff',
    // A deeper turquoise than the towers' disc so links and icons pass 4.5:1 on white and the ground.
    accent: '#117169',
    ok: '#1a7359',
    warn: '#8f5407',
    danger: '#b3332b',
    hero: brand.turquoise,
    onHero: brand.ink,
    onDanger: '#ffffff',
  },
  dark: {
    dark: true,
    bg: '#0a1a1c',
    surface: '#10262a',
    surfaceAlt: '#123a3d',
    text: '#e4f0ee',
    muted: '#94aeab',
    line: '#203c40',
    control: '#4a7d84',
    primary: '#5fd3c6',
    onPrimary: brand.ink,
    accent: '#5fd3c6',
    ok: '#72d8b0',
    warn: '#f1ba63',
    danger: '#ff9d91',
    hero: '#5fd3c6',
    onHero: brand.ink,
    onDanger: brand.ink,
  },
};

export type StatusTone = 'ok' | 'danger' | 'warn' | 'info' | 'neutral';

/**
 * Soft tint + strong ink pairs for badges, notices and calendar cells (the panel's semantic pairs).
 * Every ink passes 4.5:1 on its tint.
 */
export function statusTints(c: Palette): Record<StatusTone, { bg: string; fg: string }> {
  return c.dark
    ? {
        ok: { bg: '#11352b', fg: '#72d8b0' },
        danger: { bg: '#3b1b18', fg: '#ff9d91' },
        warn: { bg: '#3a2c10', fg: '#f1ba63' },
        info: { bg: '#12303f', fg: '#8fc6e8' },
        neutral: { bg: c.surfaceAlt, fg: c.muted },
      }
    : {
        ok: { bg: '#e1f3ec', fg: '#1a7359' },
        danger: { bg: '#fbebe8', fg: '#b3332b' },
        warn: { bg: '#fbf0d8', fg: '#8f5407' },
        info: { bg: '#e3eff6', fg: '#24627f' },
        neutral: { bg: c.surfaceAlt, fg: c.muted },
      };
}

export const fonts = {
  regular: 'Tajawal_400Regular',
  medium: 'Tajawal_500Medium',
  bold: 'Tajawal_700Bold',
  black: 'Tajawal_800ExtraBold',
};

/** Spacing scale (dp). Screens use 16 side gutters; cards 16 padding; sections 24 apart. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
/** Corner radii: inputs/chips 10, cards 14, sheets/hero 24, pills full (buttons, badges, chips). */
export const radius = { sm: 10, md: 14, lg: 24, pill: 999 } as const;
/** Type scale: size / line height. Tajawal needs generous line height for Arabic. */
export const type = {
  display: { fontSize: 34, lineHeight: 44 },
  title: { fontSize: 22, lineHeight: 30 },
  heading: { fontSize: 17, lineHeight: 26 },
  body: { fontSize: 15, lineHeight: 24 },
  label: { fontSize: 13, lineHeight: 20 },
  caption: { fontSize: 12, lineHeight: 18 },
} as const;
/** Minimum touch target (Android 48dp). */
export const TOUCH = 48;
