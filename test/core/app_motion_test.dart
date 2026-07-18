import 'package:calorix/core/motion/app_motion.dart';
import 'package:calorix/core/theme/app_colors.dart';
import 'package:calorix/shared/widgets/confidence_badge.dart';
import 'package:calorix/shared/widgets/macro_progress_bar.dart';
import 'package:calorix/shared/widgets/macro_ring.dart';
import 'package:calorix/shared/widgets/skeleton_shimmer.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shimmer/shimmer.dart';

Widget _motionHost({
  required Widget child,
  required bool disableAnimations,
}) {
  return MaterialApp(
    home: MediaQuery(
      data: MediaQueryData(disableAnimations: disableAnimations),
      child: Scaffold(body: child),
    ),
  );
}

class _RingPaintHarness extends StatefulWidget {
  const _RingPaintHarness({required this.onStablePaint});

  final VoidCallback onStablePaint;

  @override
  State<_RingPaintHarness> createState() => _RingPaintHarnessState();
}

class _RingPaintHarnessState extends State<_RingPaintHarness>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 1),
    )..forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        AnimatedMacroRing(
          animation: _controller,
          proteinFraction: 0.8,
          carbsFraction: 0.7,
          fatFraction: 0.6,
          size: 100,
          strokeWidth: 6,
        ),
        _PaintCounter(
          onPaint: widget.onStablePaint,
          child: const SizedBox(width: 40, height: 40),
        ),
      ],
    );
  }
}

class _PaintCounter extends SingleChildRenderObjectWidget {
  const _PaintCounter({required this.onPaint, required super.child});

  final VoidCallback onPaint;

  @override
  RenderObject createRenderObject(BuildContext context) =>
      _RenderPaintCounter(onPaint);

  @override
  void updateRenderObject(
    BuildContext context,
    covariant _RenderPaintCounter renderObject,
  ) {
    renderObject.onPaint = onPaint;
  }
}

class _RenderPaintCounter extends RenderProxyBox {
  _RenderPaintCounter(this.onPaint);

  VoidCallback onPaint;

  @override
  void paint(PaintingContext context, Offset offset) {
    onPaint();
    super.paint(context, offset);
  }
}

void main() {
  testWidgets('durationOf preserves duration when motion is enabled',
      (tester) async {
    await tester.pumpWidget(
      _motionHost(
        disableAnimations: false,
        child: Builder(
          builder: (context) {
            expect(
              AppMotion.durationOf(context, MotionDurations.countUp),
              MotionDurations.countUp,
            );
            return const SizedBox();
          },
        ),
      ),
    );
  });

  testWidgets('durationOf returns zero when animations are disabled',
      (tester) async {
    await tester.pumpWidget(
      _motionHost(
        disableAnimations: true,
        child: Builder(
          builder: (context) {
            expect(
              AppMotion.durationOf(context, MotionDurations.countUp),
              Duration.zero,
            );
            return const SizedBox();
          },
        ),
      ),
    );
  });

  testWidgets('macro progress fill has zero duration under reduced motion',
      (tester) async {
    await tester.pumpWidget(
      _motionHost(
        disableAnimations: true,
        child: const SizedBox(
          width: 400,
          child: MacroProgressBar(
            label: 'Protein',
            current: 80,
            target: 100,
            color: AppColors.protein,
          ),
        ),
      ),
    );

    final fill =
        tester.widget<AnimatedContainer>(find.byType(AnimatedContainer));
    expect(fill.duration, Duration.zero);
  });

  testWidgets('skeleton shimmer disables its ticker under reduced motion',
      (tester) async {
    await tester.pumpWidget(
      _motionHost(
        disableAnimations: true,
        child: const SkeletonShimmer(
          child: SkeletonBox(width: 100, height: 20),
        ),
      ),
    );

    final shimmer = tester.widget<Shimmer>(find.byType(Shimmer));
    expect(shimmer.enabled, isFalse);
    await tester.pump();
    expect(tester.binding.transientCallbackCount, 0);
  });

  testWidgets('confidence badge does not repeat under reduced motion',
      (tester) async {
    await tester.pumpWidget(
      _motionHost(
        disableAnimations: true,
        child: const ConfidenceBadge(confidence: 0.91),
      ),
    );
    await tester.pump();

    expect(tester.binding.transientCallbackCount, 0);
  });

  testWidgets('macro ring animation does not repaint its stable sibling',
      (tester) async {
    var stablePaints = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: _RingPaintHarness(onStablePaint: () => stablePaints++),
        ),
      ),
    );
    final initialPaints = stablePaints;

    await tester.pump(const Duration(milliseconds: 100));

    expect(stablePaints, initialPaints);
  });
}
