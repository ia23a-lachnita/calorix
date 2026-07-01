import 'package:flutter/material.dart';

const _geist = 'Geist';
const _geistMono = 'GeistMono';

abstract final class AppTextStyles {
  // Hero numbers (ring center, kcal)
  static const TextStyle heroNumber = TextStyle(
    fontFamily: _geist,
    fontSize: 36,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.5,
    fontFeatures: [FontFeature.tabularFigures()],
  );

  static const TextStyle todayHeroNumber = TextStyle(
    fontFamily: _geistMono,
    fontSize: 36,
    fontWeight: FontWeight.w600,
    letterSpacing: -0.72,
    fontFeatures: [FontFeature.tabularFigures()],
  );

  static const TextStyle todayTitle = TextStyle(
    fontFamily: _geist,
    fontSize: 30,
    fontWeight: FontWeight.w600,
    letterSpacing: -1.2,
    height: 1,
  );

  static const TextStyle todaySectionHeading = TextStyle(
    fontFamily: _geist,
    fontSize: 14,
    fontWeight: FontWeight.w600,
    letterSpacing: -0.14,
  );

  static const TextStyle todayMealTitle = TextStyle(
    fontFamily: _geist,
    fontSize: 15,
    fontWeight: FontWeight.w600,
    letterSpacing: -0.15,
  );

  static const TextStyle todayMonoValue = TextStyle(
    fontFamily: _geistMono,
    fontSize: 12,
    fontWeight: FontWeight.w600,
    letterSpacing: -0.24,
    fontFeatures: [FontFeature.tabularFigures()],
  );

  static const TextStyle todayMonoTarget = TextStyle(
    fontFamily: _geistMono,
    fontSize: 12,
    fontWeight: FontWeight.w500,
    letterSpacing: -0.24,
    fontFeatures: [FontFeature.tabularFigures()],
  );

  static const TextStyle todayPercentBadge = TextStyle(
    fontFamily: _geistMono,
    fontSize: 10.5,
    fontWeight: FontWeight.w600,
    letterSpacing: -0.1,
    fontFeatures: [FontFeature.tabularFigures()],
  );

  static const TextStyle todayMealMeta = TextStyle(
    fontFamily: _geistMono,
    fontSize: 11,
    fontWeight: FontWeight.w400,
    letterSpacing: 0.22,
    fontFeatures: [FontFeature.tabularFigures()],
  );

  // Section headings
  static const TextStyle heading1 = TextStyle(
    fontFamily: _geist,
    fontSize: 28,
    fontWeight: FontWeight.w700,
    letterSpacing: 0.2,
  );

  static const TextStyle heading2 = TextStyle(
    fontFamily: _geist,
    fontSize: 22,
    fontWeight: FontWeight.w600,
    letterSpacing: 0.1,
  );

  static const TextStyle heading3 = TextStyle(
    fontFamily: _geist,
    fontSize: 18,
    fontWeight: FontWeight.w600,
  );

  // Body text
  static const TextStyle bodyLarge = TextStyle(
    fontFamily: _geist,
    fontSize: 16,
    fontWeight: FontWeight.w400,
    height: 1.5,
  );

  static const TextStyle bodyMedium = TextStyle(
    fontFamily: _geist,
    fontSize: 14,
    fontWeight: FontWeight.w400,
    height: 1.5,
  );

  static const TextStyle bodySmall = TextStyle(
    fontFamily: _geist,
    fontSize: 12,
    fontWeight: FontWeight.w400,
    height: 1.4,
  );

  // Labels
  static const TextStyle labelLarge = TextStyle(
    fontFamily: _geist,
    fontSize: 13,
    fontWeight: FontWeight.w500,
    letterSpacing: 0.1,
  );

  static const TextStyle labelMono = TextStyle(
    fontFamily: _geistMono,
    fontSize: 9.5,
    fontWeight: FontWeight.w500,
    letterSpacing: 0.8,
    fontFeatures: [FontFeature.tabularFigures()],
  );

  static const TextStyle labelSmall = TextStyle(
    fontFamily: _geist,
    fontSize: 11,
    fontWeight: FontWeight.w500,
    letterSpacing: 0.2,
  );

  // Macro gram values
  static const TextStyle macroGrams = TextStyle(
    fontFamily: _geist,
    fontSize: 16,
    fontWeight: FontWeight.w600,
    fontFeatures: [FontFeature.tabularFigures()],
  );

  // Caption
  static const TextStyle caption = TextStyle(
    fontFamily: _geist,
    fontSize: 11,
    fontWeight: FontWeight.w400,
  );
}
