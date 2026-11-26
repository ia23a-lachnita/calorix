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

/// A whole number that counts from its previous value to the new one. With
/// [from] it also counts on first appearance; without, it appears settled
/// (a tween with no begin starts at its end).
class CountText extends StatelessWidget {
  const CountText({super.key, required this.value, this.style, this.from});
  final int value;
  final int? from;
  final TextStyle? style;
  @override
  Widget build(BuildContext context) => TweenAnimationBuilder<double>(
      tween: Tween(begin: from?.toDouble(), end: value.toDouble()),
      duration: Motion.of(context, Motion.count),
      curve: Motion.curve,
      builder: (_, v, __) => Text('${v.round()}', style: style));
}

/// Replaces a short label without retaining stale semantics for the outgoing
/// text. Its text children contain no actions; hit targets remain on parents.
class MotionLabel extends StatefulWidget {
  const MotionLabel({
    super.key,
    required this.valueKey,
    required this.text,
    required this.semanticLabel,
    this.style,
    this.maxLines,
    this.overflow,
    this.textAlign,
    this.softWrap,
  });

  final Object valueKey;
  final String text;
  final String semanticLabel;
  final TextStyle? style;
  final int? maxLines;
  final TextOverflow? overflow;
  final TextAlign? textAlign;
  final bool? softWrap;

  @override
  State<MotionLabel> createState() => _MotionLabelState();
}

class _MotionLabelState extends State<MotionLabel> {
  bool _hasChanged = false;

  @override
  void didUpdateWidget(covariant MotionLabel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.valueKey != widget.valueKey) _hasChanged = true;
  }

  @override
  Widget build(BuildContext context) => Semantics(
        container: true,
        label: widget.semanticLabel,
        child: ExcludeSemantics(
          child: AnimatedSwitcher(
            duration:
                Motion.of(context, _hasChanged ? Motion.medium : Duration.zero),
            reverseDuration: Motion.of(context, Motion.medium),
            switchInCurve: Motion.curve,
            switchOutCurve: Curves.easeIn,
            transitionBuilder: (child, animation) => FadeTransition(
              opacity: animation,
              child: child,
            ),
            child: Text(
              widget.text,
              key: ValueKey(widget.valueKey),
              style: widget.style,
              maxLines: widget.maxLines,
              overflow: widget.overflow,
              textAlign: widget.textAlign,
              softWrap: widget.softWrap,
            ),
          ),
        ),
      );
}
