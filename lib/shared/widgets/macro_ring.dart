import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';

class MacroRing extends StatelessWidget {
  final double proteinFraction;
  final double carbsFraction;
  final double fatFraction;
  final double size;
  final Widget? center;
  final double strokeWidth;
  final Color? trackColor;

  const MacroRing({
    super.key,
    required this.proteinFraction,
    required this.carbsFraction,
    required this.fatFraction,
    this.size = 200,
    this.center,
    this.strokeWidth = 24,
    this.trackColor,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final resolvedTrack = trackColor ??
        (isDark ? AppColors.skeletonBaseDark : AppColors.skeletonBase);
    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          CustomPaint(
            size: Size(size, size),
            painter: _MacroRingPainter(
              proteinFraction: proteinFraction.clamp(0.0, 1.0),
              carbsFraction: carbsFraction.clamp(0.0, 1.0),
              fatFraction: fatFraction.clamp(0.0, 1.0),
              strokeWidth: strokeWidth,
              trackColor: resolvedTrack,
            ),
          ),
          if (center != null) center!,
        ],
      ),
    );
  }
}

class _MacroRingPainter extends CustomPainter {
  final double proteinFraction;
  final double carbsFraction;
  final double fatFraction;
  final double strokeWidth;
  final Color trackColor;

  _MacroRingPainter({
    required this.proteinFraction,
    required this.carbsFraction,
    required this.fatFraction,
    required this.strokeWidth,
    required this.trackColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final gap = strokeWidth * 1.2;

    _drawArc(
      canvas: canvas,
      center: center,
      radius: size.width / 2 - strokeWidth / 2,
      fraction: proteinFraction,
      color: AppColors.protein,
      strokeWidth: strokeWidth,
    );

    _drawArc(
      canvas: canvas,
      center: center,
      radius: size.width / 2 - strokeWidth / 2 - gap,
      fraction: carbsFraction,
      color: AppColors.carbs,
      strokeWidth: strokeWidth,
    );

    _drawArc(
      canvas: canvas,
      center: center,
      radius: size.width / 2 - strokeWidth / 2 - gap * 2,
      fraction: fatFraction,
      color: AppColors.fat,
      strokeWidth: strokeWidth,
    );
  }

  void _drawArc({
    required Canvas canvas,
    required Offset center,
    required double radius,
    required double fraction,
    required Color color,
    required double strokeWidth,
  }) {
    final trackPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round
      ..color = trackColor;

    final glowPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth * 1.4
      ..strokeCap = StrokeCap.round
      ..color = color.withAlpha(28)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3);

    final fillPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round
      ..color = color;

    final rect = Rect.fromCircle(center: center, radius: radius);
    const startAngle = -math.pi / 2;
    const fullSweep = 2 * math.pi;

    canvas.drawArc(rect, startAngle, fullSweep, false, trackPaint);
    if (fraction > 0) {
      canvas.drawArc(rect, startAngle, fullSweep * fraction, false, glowPaint);
      canvas.drawArc(rect, startAngle, fullSweep * fraction, false, fillPaint);
    }
  }

  @override
  bool shouldRepaint(_MacroRingPainter old) =>
      old.proteinFraction != proteinFraction ||
      old.carbsFraction != carbsFraction ||
      old.fatFraction != fatFraction ||
      old.trackColor != trackColor;
}

// Animated version driven by animation controller
class AnimatedMacroRing extends StatelessWidget {
  final Animation<double> animation;
  final double proteinFraction;
  final double carbsFraction;
  final double fatFraction;
  final double size;
  final Widget? center;
  final double strokeWidth;
  final Color? trackColor;

  const AnimatedMacroRing({
    super.key,
    required this.animation,
    required this.proteinFraction,
    required this.carbsFraction,
    required this.fatFraction,
    this.size = 200,
    this.center,
    this.strokeWidth = 24,
    this.trackColor,
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: animation,
      builder: (context, _) => MacroRing(
        proteinFraction: proteinFraction * animation.value,
        carbsFraction: carbsFraction * animation.value,
        fatFraction: fatFraction * animation.value,
        size: size,
        strokeWidth: strokeWidth,
        trackColor: trackColor,
        center: center,
      ),
    );
  }
}
