// Sanad identity (PRD 12): dark navy + gold, light and dark themes.
export const brand = {
  navy: '#0B1A33',
  navyMid: '#13274A',
  navySoft: '#1C3560',
  gold: '#C9A24B',
  goldLight: '#E6C878',
  cream: '#F6F1E6',
  ok: '#2E7D5B',
  okDark: '#7FD1A8',
  red: '#C62828',
  amber: '#E6A100',
  blue: '#1565C0',
};

export type Palette = {
  dark: boolean;
  bg: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  muted: string;
  line: string;
  primary: string;
  onPrimary: string;
  accent: string;
  ok: string;
  danger: string;
};

export const palettes: Record<'light' | 'dark', Palette> = {
  light: {
    dark: false,
    bg: brand.cream,
    surface: '#FFFFFF',
    surfaceAlt: '#EFE8D8',
    text: brand.navy,
    muted: '#5B6B85',
    line: '#E4DCC8',
    primary: brand.navy,
    onPrimary: brand.goldLight,
    accent: brand.gold,
    ok: brand.ok,
    danger: brand.red,
  },
  dark: {
    dark: true,
    bg: '#0B1628',
    surface: brand.navyMid,
    surfaceAlt: brand.navySoft,
    text: brand.cream,
    muted: '#A9B6CC',
    line: '#2A3F63',
    primary: brand.goldLight,
    onPrimary: brand.navy,
    accent: brand.gold,
    ok: brand.okDark,
    danger: '#FF8A80',
  },
};

export const fonts = {
  regular: 'Tajawal_400Regular',
  medium: 'Tajawal_500Medium',
  bold: 'Tajawal_700Bold',
  black: 'Tajawal_800ExtraBold',
};

/** Spacing scale (dp). Screens use 16 side gutters; cards 16 padding; sections 24 apart. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
/** Corner radii: inputs/chips 10, cards 16, sheets/hero 24, pills full. */
export const radius = { sm: 10, md: 16, lg: 24, pill: 999 } as const;
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
