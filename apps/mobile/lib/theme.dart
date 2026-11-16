import 'package:flutter/material.dart';

/// Sanad identity (PRD 12): dark navy + gold, light and dark themes.
class SanadColors {
  static const navy = Color(0xFF0B1A33);
  static const navyMid = Color(0xFF13274A);
  static const navySoft = Color(0xFF1C3560);
  static const gold = Color(0xFFC9A24B);
  static const goldLight = Color(0xFFE6C878);
  static const cream = Color(0xFFF6F1E6);
  static const ok = Color(0xFF2E7D5B);
  static const okDark = Color(0xFF7FD1A8);
}

ThemeData sanadTheme(Brightness brightness) {
  final dark = brightness == Brightness.dark;
  final base = ColorScheme.fromSeed(seedColor: SanadColors.navy, brightness: brightness);
  final scheme = base.copyWith(
    primary: dark ? SanadColors.goldLight : SanadColors.navy,
    onPrimary: dark ? SanadColors.navy : Colors.white,
    primaryContainer: dark ? SanadColors.navySoft : const Color(0xFFDDE3EE),
    onPrimaryContainer: dark ? SanadColors.cream : SanadColors.navy,
    secondary: SanadColors.gold,
    onSecondary: SanadColors.navy,
    secondaryContainer: dark ? const Color(0xFF3A2F12) : const Color(0xFFF3E6C4),
    onSecondaryContainer: dark ? SanadColors.goldLight : const Color(0xFF4A3A10),
    tertiary: SanadColors.gold,
    surface: dark ? const Color(0xFF0E1B30) : const Color(0xFFFFFDF8),
    onSurface: dark ? SanadColors.cream : SanadColors.navy,
    surfaceContainerLowest: dark ? const Color(0xFF09152A) : Colors.white,
    surfaceContainerLow: dark ? const Color(0xFF112038) : const Color(0xFFFBF7EE),
    surfaceContainer: dark ? SanadColors.navyMid : SanadColors.cream,
    surfaceContainerHigh: dark ? const Color(0xFF182D52) : const Color(0xFFEFE8D8),
    surfaceContainerHighest: dark ? SanadColors.navySoft : const Color(0xFFE8DFCB),
    outline: dark ? const Color(0xFF8C9BB5) : const Color(0xFF6B778C),
    outlineVariant: dark ? const Color(0xFF2A3F63) : const Color(0xFFE4DCC8),
  );
  return ThemeData(
    colorScheme: scheme,
    scaffoldBackgroundColor: dark ? const Color(0xFF0B1628) : SanadColors.cream,
    appBarTheme: AppBarTheme(
      backgroundColor: SanadColors.navy,
      foregroundColor: dark ? SanadColors.goldLight : Colors.white,
      centerTitle: true,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: dark ? SanadColors.gold : SanadColors.navy,
        foregroundColor: dark ? SanadColors.navy : SanadColors.goldLight,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        side: BorderSide(color: dark ? SanadColors.gold : SanadColors.navy),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    cardTheme: CardThemeData(
      color: dark ? SanadColors.navyMid : Colors.white,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: dark ? const Color(0xFF2A3F63) : const Color(0xFFE4DCC8)),
      ),
    ),
  );
}
