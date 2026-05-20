import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

abstract final class AppTextStyles {
  // Hero numbers (ring center, kcal)
  static TextStyle get heroNumber => GoogleFonts.interTight(
        fontSize: 36,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.5,
        fontFeatures: const [FontFeature.tabularFigures()],
      );

  // Section headings
  static TextStyle get heading1 => GoogleFonts.interTight(
        fontSize: 28,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.2,
      );

  static TextStyle get heading2 => GoogleFonts.interTight(
        fontSize: 22,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.1,
      );

  static TextStyle get heading3 => GoogleFonts.interTight(
        fontSize: 18,
        fontWeight: FontWeight.w600,
      );

  // Body text
  static TextStyle get bodyLarge => GoogleFonts.interTight(
        fontSize: 16,
        fontWeight: FontWeight.w400,
        height: 1.5,
      );

  static TextStyle get bodyMedium => GoogleFonts.interTight(
        fontSize: 14,
        fontWeight: FontWeight.w400,
        height: 1.5,
      );

  static TextStyle get bodySmall => GoogleFonts.interTight(
        fontSize: 12,
        fontWeight: FontWeight.w400,
        height: 1.4,
      );

  // Labels
  static TextStyle get labelLarge => GoogleFonts.interTight(
        fontSize: 13,
        fontWeight: FontWeight.w500,
        letterSpacing: 0.1,
      );

  static TextStyle get labelMono => GoogleFonts.jetBrainsMono(
        fontSize: 9.5,
        fontWeight: FontWeight.w500,
        letterSpacing: 0.8,
        fontFeatures: const [FontFeature.tabularFigures()],
      );

  static TextStyle get labelSmall => GoogleFonts.interTight(
        fontSize: 11,
        fontWeight: FontWeight.w500,
        letterSpacing: 0.2,
      );

  // Macro gram values
  static TextStyle get macroGrams => GoogleFonts.interTight(
        fontSize: 16,
        fontWeight: FontWeight.w600,
        fontFeatures: const [FontFeature.tabularFigures()],
      );

  // Caption
  static TextStyle get caption => GoogleFonts.interTight(
        fontSize: 11,
        fontWeight: FontWeight.w400,
      );
}
