import 'package:flutter/material.dart';
import 'app_colors.dart';

abstract final class AppTextStyles {
  static const String _heading = 'BarlowCondensed';
  static const String _body = 'Barlow';

  // Hero numbers (ring center, kcal)
  static const TextStyle heroNumber = TextStyle(
    fontFamily: _body,
    fontSize: 36,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.5,
    fontFeatures: [FontFeature.tabularFigures()],
  );

  // Section headings
  static const TextStyle heading1 = TextStyle(
    fontFamily: _heading,
    fontSize: 28,
    fontWeight: FontWeight.w700,
    letterSpacing: 0.2,
  );

  static const TextStyle heading2 = TextStyle(
    fontFamily: _heading,
    fontSize: 22,
    fontWeight: FontWeight.w600,
    letterSpacing: 0.1,
  );

  static const TextStyle heading3 = TextStyle(
    fontFamily: _heading,
    fontSize: 18,
    fontWeight: FontWeight.w600,
  );

  // Body text
  static const TextStyle bodyLarge = TextStyle(
    fontFamily: _body,
    fontSize: 16,
    fontWeight: FontWeight.w400,
    height: 1.5,
  );

  static const TextStyle bodyMedium = TextStyle(
    fontFamily: _body,
    fontSize: 14,
    fontWeight: FontWeight.w400,
    height: 1.5,
  );

  static const TextStyle bodySmall = TextStyle(
    fontFamily: _body,
    fontSize: 12,
    fontWeight: FontWeight.w400,
    height: 1.4,
  );

  // Labels
  static const TextStyle labelLarge = TextStyle(
    fontFamily: _body,
    fontSize: 13,
    fontWeight: FontWeight.w500,
    letterSpacing: 0.1,
  );

  static const TextStyle labelMono = TextStyle(
    fontFamily: _body,
    fontSize: 9.5,
    fontWeight: FontWeight.w500,
    letterSpacing: 0.8,
    fontFeatures: [FontFeature.tabularFigures()],
  );

  static const TextStyle labelSmall = TextStyle(
    fontFamily: _body,
    fontSize: 11,
    fontWeight: FontWeight.w500,
    letterSpacing: 0.2,
  );

  // Macro gram values
  static const TextStyle macroGrams = TextStyle(
    fontFamily: _body,
    fontSize: 16,
    fontWeight: FontWeight.w600,
    fontFeatures: [FontFeature.tabularFigures()],
  );

  // Caption
  static const TextStyle caption = TextStyle(
    fontFamily: _body,
    fontSize: 11,
    fontWeight: FontWeight.w400,
    color: AppColors.textSecondaryLight,
  );
}
