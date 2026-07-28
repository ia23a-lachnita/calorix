import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../../../core/motion/app_motion.dart';
import '../../../core/theme/app_colors.dart';

/// The central shutter control. Still-photo only: there is no stop/cancel
/// affordance while [isCapturing] — the capturing visual is purely
/// informational, and the duplicate-tap guard lives in the caller's [onTap]
/// handler (via `captureStateProvider`), not here.
class CaptureButton extends StatefulWidget {
  const CaptureButton({
    super.key,
    required this.isCapturing,
    required this.onTap,
  });

  final bool isCapturing;
  final VoidCallback onTap;

  @override
  State<CaptureButton> createState() => _CaptureButtonState();
}

class _CaptureButtonState extends State<CaptureButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: MotionDurations.captureRingSpin,
    );
    if (widget.isCapturing) _controller.repeat();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _controller
        ..stop()
        ..value = widget.isCapturing ? 0.5 : 0;
    } else if (widget.isCapturing && !_controller.isAnimating) {
      _controller.repeat();
    }
  }

  @override
  void didUpdateWidget(covariant CaptureButton oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isCapturing && !oldWidget.isCapturing) {
      _controller.repeat();
    } else if (!widget.isCapturing && oldWidget.isCapturing) {
      _controller.stop();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      key: const ValueKey('capture-button'),
      onTap: widget.onTap,
      child: SizedBox(
        width: 80,
        height: 80,
        child: AnimatedBuilder(
          animation: _controller,
          builder: (context, child) => CustomPaint(
            key: widget.isCapturing ? const ValueKey('capture-spinner') : null,
            painter: _CapturePainter(
              isCapturing: widget.isCapturing,
              progress: _controller.value,
            ),
            child: child,
          ),
          child: Center(
            child: widget.isCapturing
                ? Container(
                    key: const Key('capture-core-capturing'),
                    width: 24,
                    height: 24,
                    decoration: BoxDecoration(
                      color: const Color(0xEB0B0D10),
                      borderRadius: BorderRadius.circular(6),
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.cyan.withValues(alpha: 0.30),
                          blurRadius: 14,
                        ),
                      ],
                    ),
                  )
                : Container(
                    key: const Key('capture-core-idle'),
                    width: 30,
                    height: 30,
                    decoration: BoxDecoration(
                      gradient:
                          const LinearGradient(colors: AppColors.brandGradient),
                      shape: BoxShape.circle,
                      border: Border.all(
                        width: 1,
                        color: Colors.white.withValues(alpha: 0.20),
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.cyan.withValues(alpha: 0.50),
                          blurRadius: 18,
                        ),
                      ],
                    ),
                  ),
          ),
        ),
      ),
    );
  }
}

class _CapturePainter extends CustomPainter {
  _CapturePainter({required this.isCapturing, required this.progress});

  final bool isCapturing;
  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);

    // Outer ring: 6px, near-black glass in both states.
    final outer = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 6
      ..color = const Color(0xEB0B0D10);
    canvas.drawCircle(center, size.width / 2 - 3, outer);

    // Animation ring hugging the outer ring's inner edge.
    final animRadius = size.width / 2 - 6 - 1.25;
    if (isCapturing) {
      final sweep = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.5
        ..shader = SweepGradient(
          colors: const [
            AppColors.blue,
            AppColors.cyan,
            AppColors.green,
            AppColors.blue,
          ],
          transform: GradientRotation(progress * 2 * math.pi),
        ).createShader(Rect.fromCircle(center: center, radius: animRadius));
      canvas.drawCircle(center, animRadius, sweep);
    } else {
      final idle = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.5
        ..color = const Color(0xFF8C8C8C).withValues(alpha: 0.06);
      canvas.drawCircle(center, animRadius, idle);
    }
  }

  @override
  bool shouldRepaint(_CapturePainter old) =>
      old.isCapturing != isCapturing || old.progress != progress;
}
