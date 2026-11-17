// Sanad identity "sea glass" (owner decision 2026-11-17, replaces navy + gold): deep sea teal and
// turquoise from the Kuwait Towers' enamel discs, the same tokens as the web panel (root DESIGN.md).
// Light and dark are both first-class; screens read the palette from useSettings().c.
export const brand = {
  /** Deep sea teal: primary actions in light. */
  teal: '#0e5a61',
  /** The towers' bright disc colour: the Sanad button and the punch hero. */
  turquoise: '#1fa89c',
  /** The lit disc on the rail; turquoise primary in dark. */
  glow: '#5fd3c6',
  /** Web rail colour: the app bar and the side menu. */
  rail: '#0d3b41',
  railNight: '#071416',
  /** Dark ink that sits on turquoise fills. */
  ink: '#062528',
  mist: '#eef4f3',
  white: '#ffffff',
};

export type Palette = {
  dark: boolean;
  bg: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  muted: string;
  line: string;
  /** Edge of inputs and selects (3:1 against the surface). */
  controlLine: string;
  primary: string;
  onPrimary: string;
  /** Accent as ink (icons, links, focus): passes AA as text on bg and surface. */
  accent: string;
  /** Accent as a fill (the Sanad button, the punch hero), with its ink. */
  accentFill: string;
  onAccent: string;
  ok: string;
  okSoft: string;
  danger: string;
  dangerSoft: string;
  onDanger: string;
  warn: string;
  warnSoft: string;
  info: string;
  infoSoft: string;
  /** The app bar and side menu (the web rail): its fill, text, muted text, current-item fill and lit disc. */
  bar: string;
  barInk: string;
  barMuted: string;
  barOn: string;
  barDot: string;
  /** Snackbar background (white text on it). */
  snack: string;
};

export const palettes: Record<'light' | 'dark', Palette> = {
  light: {
    dark: false,
    bg: brand.mist,
    surface: brand.white,
    surfaceAlt: '#e2f1ef',
    text: '#0f2a2e',
    muted: '#536b6b',
    line: '#d6e3e1',
    controlLine: '#6f8f8b',
    primary: brand.teal,
    onPrimary: brand.white,
    accent: '#127a71',
    accentFill: brand.turquoise,
    onAccent: brand.ink,
    ok: '#1a7359',
    okSoft: '#e1f3ec',
    danger: '#b3332b',
    dangerSoft: '#fbebe8',
    onDanger: brand.white,
    warn: '#8f5407',
    warnSoft: '#fbf0d8',
    info: '#24627f',
    infoSoft: '#e3eff6',
    bar: brand.rail,
    barInk: brand.white,
    barMuted: '#c1dcd9',
    barOn: '#18555c',
    barDot: brand.glow,
    snack: brand.rail,
  },
  // The Gulf at night: deep blue-green ground, turquoise primary (same values as the web dark theme).
  dark: {
    dark: true,
    bg: '#0a1a1c',
    surface: '#10262a',
    surfaceAlt: '#123a3d',
    text: '#e4f0ee',
    muted: '#94aeab',
    line: '#203c40',
    controlLine: '#4a7d84',
    primary: brand.glow,
    onPrimary: brand.ink,
    accent: brand.glow,
    accentFill: brand.glow,
    onAccent: brand.ink,
    ok: '#72d8b0',
    okSoft: '#11352b',
    danger: '#ff9d91',
    dangerSoft: '#3b1b18',
    onDanger: brand.ink,
    warn: '#f1ba63',
    warnSoft: '#3a2c10',
    info: '#8fc6e8',
    infoSoft: '#12303f',
    bar: brand.railNight,
    barInk: brand.white,
    barMuted: '#a9c7c4',
    barOn: '#123437',
    barDot: brand.glow,
    snack: '#18555c',
  },
};

/** Readex Pro, the web panel's one typeface, for Arabic and Latin. */
export const fonts = {
  regular: 'ReadexPro_400Regular',
  medium: 'ReadexPro_500Medium',
  semibold: 'ReadexPro_600SemiBold',
  bold: 'ReadexPro_700Bold',
  /** Kept for the display size; Readex Pro has no 800, so it is the 700 cut. */
  black: 'ReadexPro_700Bold',
};

/** Spacing scale (dp). Screens use 16 side gutters; cards 16 padding; sections 24 apart. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
/** Corner radii: inputs/chips 10, cards 16, sheets/hero 24, pills full. */
export const radius = { sm: 10, md: 16, lg: 24, pill: 999 } as const;
/** Type scale: size / line height. Readex Pro is wide, so the display size is a little smaller than before. */
export const type = {
  display: { fontSize: 30, lineHeight: 42 },
  title: { fontSize: 21, lineHeight: 30 },
  heading: { fontSize: 16, lineHeight: 25 },
  body: { fontSize: 15, lineHeight: 24 },
  label: { fontSize: 13, lineHeight: 20 },
  caption: { fontSize: 12, lineHeight: 18 },
} as const;
/** Minimum touch target (Android 48dp). */
export const TOUCH = 48;
/** Size of the round Sanad button at the bottom centre, and the room screens leave for it. */
export const SANAD_BUTTON = 64;
export const SANAD_BUTTON_ROOM = SANAD_BUTTON + 28;
