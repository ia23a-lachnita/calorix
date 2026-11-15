# Tier1 motion rules (2026-11-16)

Source: Apple's WWDC18 "Designing Fluid Interfaces" and the HIG motion section, reduced to what a Flutter
pilot can check. Motion here explains a change; it never decorates and never makes the user wait.

1. **Respond at once.** Every tappable control shows a press state within one frame (scale to 0.97, 100 ms).
2. **Show where things come from.** A new screen slides in from the side it will leave to; a value that changes
   counts from the old number to the new one; a block that appears grows from where it was tapped.
3. **Short and decelerating.** 150-250 ms for small changes, at most 350 ms for a screen. Curve
   `Curves.easeOutCubic` (fast start, soft landing). No bounce except on a direct drag.
4. **Interruptible.** Use implicit animations and tweens that retarget from the current value. Never block
   input while something moves, and never loop forever (widget tests call `pumpAndSettle`).
5. **Anticipate.** Put the next likely action where the thumb already is, preselect the common answer
   ("Ate all"), and keep focus and scroll where the user was after a save.
6. **Honour "remove animations".** When `MediaQuery.disableAnimationsOf(context)` is true, every duration is zero.

All durations and the curve live in `lib/features/tier1/motion.dart`; do not write numbers inline.
