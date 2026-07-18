import 'package:flutter/material.dart';

abstract final class AppColors {
  // Backgrounds
  static const Color backgroundLight = Color(0xFFF4F2EE);
  static const Color backgroundDark = Color(0xFF0C0F13);
  static const Color surfaceDark = Color(0xFF14181E);

  // Surfaces
  static const Color surfaceLight = Color(0xEBFFFDF7); // tonal near-white
  static const Color surfaceDarkOverlay =
      Color(0x08FFFFFF); // rgba(255,255,255,0.03)

  // Accents
  static const Color blue = Color(0xFF3A5BFF);
  static const Color cyan = Color(0xFF19D3D9);
  static const Color green = Color(0xFF1FCC74);
  static const Color greenTextLight = Color(0xFF0B6B3C);
  static const Color amber = Color(0xFFFFAA00);

  // Text
  static const Color textPrimaryLight = Color(0xFF0B0D10);
  static const Color textPrimaryDark = Color(0xFFF2F3F5);
  static const Color textSecondaryLight =
      Color(0xFF6B6F77); // spec: #6B6F77 (was 0xFF5A5A6E)
  static const Color compactTextLight = Color(0xFF575B62);
  static const Color textSecondaryDark =
      Color(0x80F2F3F5); // handoff: rgba(242,243,245,0.50)
  static const Color textTertiaryLight = Color(0xFF9A9EA6); // spec: #9A9EA6
  static const Color textTertiaryDark = Color(0xFF6F7885); // spec: #6F7885

  // Skeleton — light mode
  static const Color skeletonBase = Color(0xFFE8E4DC);
  static const Color skeletonShine = Color(0xFFF0EDE6);
  // Skeleton — dark mode
  static const Color skeletonBaseDark = Color(0xFF1B212A);
  static const Color skeletonShineDark = Color(0xFF252D38);

  // Macro colors
  static const Color protein = blue;
  static const Color carbs = cyan;
  static const Color fat = green;

  // Gradient stops
  static const List<Color> brandGradient = [blue, cyan, green];
  static const List<Color> sweepGradient = [blue, cyan, green, blue];

  // Confidence
  static const Color confirmed = green;
  static const Color needsReview = amber;

  // Ring / active dot
  static const Color activeRing = cyan;
  static const Color activeDot = green;

  // Nav bar
  static const Color navBarLight = Color(0xFFF4F2EE);
  static const Color navBarDark = Color(0xFF14181E);

  // Surface raised
  static const Color surfaceRaisedLight = Color(0xFFFBFAF6);
  static const Color surfaceRaisedDark = Color(0xFF171C24);

  // Card border
  static const Color borderLight = Color(0x12110D0B);
  static const Color borderLightStrong = Color(0x1F110D0B);
  static const Color borderDark = Color(0x12FFFFFF);
  static const Color borderDarkStrong = Color(0x21FFFFFF);
  static const Color topHighlightDark = Color(0x0AFFFFFF);

  // Error / destructive (not pure red, warm red)
  static const Color error = Color(0xFFDC2626);
  static const Color errorDark = Color(0xFFFF6B6B);

  // Camera overlay — near-white for legibility over dark viewfinder (not #FFFFFF)
  static const Color cameraOverlayText = Color(0xFFF2F1EE);
  static const Color cameraOverlayBg = Color(0x640E1117); // dark with alpha

  // kcal left pill background
  static const Color kcalLeftPillBg =
      Color(0x1A1FCC74); // rgba(31,204,116,0.10)

  // Blue bubble background
  static const Color userBubbleLight =
      Color(0x1A3A5BFF); // rgba(58,91,255,0.10)
  static const Color userBubbleDark = Color(0x2E3A5BFF); // rgba(58,91,255,0.18)
}
