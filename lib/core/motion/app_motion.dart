import 'package:flutter/widgets.dart';

abstract final class AppMotion {
  static bool reducedOf(BuildContext context) =>
      MediaQuery.disableAnimationsOf(context);

  static Duration durationOf(BuildContext context, Duration full) =>
      reducedOf(context) ? Duration.zero : full;
}

abstract final class MotionDurations {
  static const countUp = Duration(milliseconds: 1400);
  static const macroBarFill = Duration(milliseconds: 1200);
  static const scanShimmer = Duration(milliseconds: 1600);
  static const skeletonShimmer = Duration(milliseconds: 1400);
  static const reticleSnap = Duration(milliseconds: 200);
  static const cardEntrance = Duration(milliseconds: 240);
  static const sheetSlideUp = Duration(milliseconds: 320);
  static const cardExpansion = Duration(milliseconds: 320);
  static const captureRingSpin = Duration(milliseconds: 1000);
  static const confidencePulse = Duration(milliseconds: 1000);
  static const historyViewToggle = Duration(milliseconds: 300);
  static const goalsDropdown = Duration(milliseconds: 200);
  static const typingDots = Duration(milliseconds: 600);
}
