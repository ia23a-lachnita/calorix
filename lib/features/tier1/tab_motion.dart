import 'package:flutter/widgets.dart';

/// Finger-driven native paging with the Swiss Shopping track's quiet spring.
class TabPagePhysics extends PageScrollPhysics {
  const TabPagePhysics({super.parent});

  @override
  TabPagePhysics applyTo(ScrollPhysics? ancestor) =>
      TabPagePhysics(parent: buildParent(ancestor));

  @override
  SpringDescription get spring =>
      const SpringDescription(mass: 1, stiffness: 380, damping: 38);
}

// Scrollable compares physics runtime types when deciding to replace them.
// A distinct type lets a live system preference change update swipe settling.
class ReducedMotionTabPhysics extends TabPagePhysics {
  const ReducedMotionTabPhysics({super.parent});
  @override
  ReducedMotionTabPhysics applyTo(ScrollPhysics? ancestor) =>
      ReducedMotionTabPhysics(parent: buildParent(ancestor));

  @override
  Simulation? createBallisticSimulation(
      ScrollMetrics position, double velocity) {
    final page = (position as PageMetrics).page ?? 0;
    final tolerance = toleranceFor(position);
    final projected =
        page + (velocity.abs() <= tolerance.velocity ? 0 : velocity.sign * .5);
    final target = (projected.round() * position.viewportDimension)
        .clamp(position.minScrollExtent, position.maxScrollExtent)
        .toDouble();
    return target == position.pixels ? null : _ImmediatePage(target);
  }
}

class _ImmediatePage extends Simulation {
  _ImmediatePage(this.target);
  final double target;
  @override
  double x(double time) => target;
  @override
  double dx(double time) => 0;
  @override
  bool isDone(double time) => true;
}
