import 'package:flutter/material.dart';

/// Tier1 motion in one place; the rules are in docs/tier1-motion.md.
abstract final class Motion {
  static const fast = Duration(milliseconds: 150);
  static const medium = Duration(milliseconds: 220);
  static const count = Duration(milliseconds: 500);
  static const ring = Duration(milliseconds: 700);
  static const curve = Curves.easeOutCubic;

  /// Zero when the phone is set to remove animations.
  static Duration of(BuildContext context, Duration d) =>
      MediaQuery.disableAnimationsOf(context) ? Duration.zero : d;
}

/// Shrinks its child a little while a finger is on it. It only listens: the
/// button inside still receives the tap.
class Pressable extends StatefulWidget {
  const Pressable({super.key, required this.child});
  final Widget child;
  @override
  State<Pressable> createState() => _PressableState();
}

class _PressableState extends State<Pressable> {
  bool _down = false;
  void _set(bool down) {
    if (mounted && _down != down) {
      setState(() => _down = down);
    }
  }

  @override
  Widget build(BuildContext context) => Listener(
      onPointerDown: (_) => _set(true),
      onPointerUp: (_) => _set(false),
      onPointerCancel: (_) => _set(false),
      child: AnimatedScale(
          scale: _down ? .97 : 1,
          duration: Motion.of(context, Motion.fast),
          curve: Motion.curve,
          child: widget.child));
}

/// A whole number that counts from its previous value to the new one.
class CountText extends StatelessWidget {
  const CountText({super.key, required this.value, this.style});
  final int value;
  final TextStyle? style;
  @override
  Widget build(BuildContext context) => TweenAnimationBuilder<double>(
      tween: Tween(end: value.toDouble()),
      duration: Motion.of(context, Motion.count),
      curve: Motion.curve,
      builder: (_, v, __) => Text('${v.round()}', style: style));
}
