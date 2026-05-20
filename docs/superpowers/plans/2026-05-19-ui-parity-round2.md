# UI Parity Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 7 remaining visual gaps from the Gemini UI parity audit (B2, B3, W1, W2, W3, W4, N1) and close the gap between live app and design mockups.

**Architecture:** Targeted, isolated edits across 3 feature screens and 2 shared widgets. No new files. No state management changes. All changes are purely visual/presentational.

**Tech Stack:** Flutter/Dart (fvm), `app_colors.dart` design tokens, Android emulator for visual verification (no internet needed for UI).

---

## Issue Inventory

| ID | Screen | Issue | Root cause |
|---|---|---|---|
| **B1** | All | Background appears black | ✅ Already correct — `0xFF0E1117` in theme. No change needed. |
| **B2** | Today | Macro sub-cards use solid `#14181E` surface instead of spec `rgba(255,255,255,0.03)` | `_MacroSubCard` uses bare `Card()` with theme color; needs explicit dark override |
| **B3** | Today | Macro ring tracks invisible at zero-data | `trackPaint` alpha=25 too faint; needs 40 |
| **W1** | Scan | Profile chip shows `?` instead of user initial | `displayName` null → no email fallback |
| **W2** | Scan | Capture button idle ring is plain white; should be brand gradient | `_CapturePainter` else-branch uses flat color |
| **W3** | Goals | Weight card has no sparkline placeholder | `_WeightCard` is text-only, missing chart structure |
| **W4** | History | Day pill numbers invisible in dark mode; ring track nearly invisible | `_DayPill` hardcodes `textPrimaryLight` (#0D0D0F = near-black); track alpha=20 |
| **N1** | Scan | RECENT button uses flame icon | `Icons.local_fire_department` → `Icons.history_outlined` |

**Not fixing:**
- N2 (Today bell + profile in header): intentional product addition
- N3 (Goals tune icon on Adjust button): intentional, improves UX

---

## Files to Modify

| File | Tasks |
|---|---|
| `lib/features/today/today_screen.dart` | Task 1 (B2) |
| `lib/shared/widgets/macro_ring.dart` | Task 2 (B3) |
| `lib/features/scan/scan_screen.dart` | Tasks 3, 4, 5 (W1, W2, N1) |
| `lib/features/history/history_screen.dart` | Task 6 (W4) |
| `lib/features/goals/goals_screen.dart` | Task 7 (W3) |

---

## Task 1: Fix B2 — Today macro sub-cards transparent surface

**Files:**
- Modify: `lib/features/today/today_screen.dart:312-325`

`_MacroSubCard.build()` returns `Card()` which inherits `surfaceDark = #14181E` from the theme. The design spec requires `rgba(255,255,255,0.03)` = `AppColors.surfaceDarkOverlay = Color(0x08FFFFFF)` — a near-transparent glass surface. Override the card color in dark mode.

- [ ] **Step 1: Override Card color in _MacroSubCard.build()**

Find in `lib/features/today/today_screen.dart`:
```dart
  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: MacroProgressBar(
          label: label,
          current: current,
          target: target,
          color: color,
          animation: animation,
        ),
      ),
    );
  }
```

Replace with:
```dart
  @override
  Widget build(BuildContext context) {
    return Card(
      color: isDark ? AppColors.surfaceDarkOverlay : null,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: MacroProgressBar(
          label: label,
          current: current,
          target: target,
          color: color,
          animation: animation,
        ),
      ),
    );
  }
```

- [ ] **Step 2: Verify analyze**

Run: `fvm flutter analyze lib/features/today/today_screen.dart`

Expected: No new issues. (`AppColors.surfaceDarkOverlay` is defined in `app_colors.dart:11`.)

---

## Task 2: Fix B3 — Macro ring track visibility

**Files:**
- Modify: `lib/shared/widgets/macro_ring.dart:101-106`

The ring track (background arc) uses `color.withAlpha(25)` which is nearly invisible. When no data is logged (fraction=0), the ring appears empty. Raising to 40 keeps the track subtle but readable.

- [ ] **Step 1: Increase track alpha in _drawArc**

Find in `lib/shared/widgets/macro_ring.dart`:
```dart
    final trackPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round
      ..color = color.withAlpha(25);
```

Replace with:
```dart
    final trackPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round
      ..color = color.withAlpha(40);
```

- [ ] **Step 2: Verify analyze**

Run: `fvm flutter analyze lib/shared/widgets/macro_ring.dart`

Expected: No issues.

---

## Task 3: Fix W1 — Profile chip email initial fallback

**Files:**
- Modify: `lib/features/scan/scan_screen.dart:372-374`

`_ProfileChip` shows `?` when `user.displayName` is null (anonymous auth or name not set). Add email initial as secondary fallback.

- [ ] **Step 1: Add email fallback in _ProfileChip.build()**

Find in `lib/features/scan/scan_screen.dart`:
```dart
    final initial = (user?.displayName?.isNotEmpty == true)
        ? user!.displayName![0].toUpperCase()
        : '?';
```

Replace with:
```dart
    final initial = user?.displayName?.isNotEmpty == true
        ? user!.displayName![0].toUpperCase()
        : user?.email?.isNotEmpty == true
            ? user!.email![0].toUpperCase()
            : '?';
```

- [ ] **Step 2: Verify analyze**

Run: `fvm flutter analyze lib/features/scan/scan_screen.dart`

Expected: No issues.

---

## Task 4: Fix W2 — Capture button gradient ring in idle state

**Files:**
- Modify: `lib/features/scan/scan_screen.dart:617-623`

`_CapturePainter.paint()` draws a faint white circle in idle state. Replace with a static sweep gradient using the brand colors so the button always has a premium gradient ring, not just during capture.

- [ ] **Step 1: Replace idle ring paint in _CapturePainter.paint()**

Find in `lib/features/scan/scan_screen.dart`:
```dart
    } else {
      final paint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3
        ..color = AppColors.cameraOverlayText.withAlpha(120);
      canvas.drawCircle(center, radius, paint);
    }
```

Replace with:
```dart
    } else {
      final paint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3
        ..shader = SweepGradient(
          colors: AppColors.sweepGradient,
          transform: const GradientRotation(-math.pi / 2),
        ).createShader(Rect.fromCircle(center: center, radius: radius));
      canvas.drawCircle(center, radius, paint);
    }
```

Note: `math` is already imported at line 1 (`import 'dart:math' as math;`). `AppColors.sweepGradient` is `[blue, cyan, green, blue]`. `GradientRotation` is already used on line 614.

- [ ] **Step 2: Verify analyze**

Run: `fvm flutter analyze lib/features/scan/scan_screen.dart`

Expected: No issues.

---

## Task 5: Fix N1 — RECENT button icon

**Files:**
- Modify: `lib/features/scan/scan_screen.dart:517-519`

The RECENT shortcut button uses `Icons.local_fire_department` (flame). Change to `Icons.history_outlined` which communicates "recent history" correctly.

- [ ] **Step 1: Change RECENT icon**

Find in `lib/features/scan/scan_screen.dart`:
```dart
                child: const Icon(Icons.local_fire_department,
                    color: AppColors.cameraOverlayText, size: 22),
```

Replace with:
```dart
                child: const Icon(Icons.history_outlined,
                    color: AppColors.cameraOverlayText, size: 22),
```

- [ ] **Step 2: Verify analyze**

Run: `fvm flutter analyze lib/features/scan/scan_screen.dart`

Expected: No issues.

---

## Task 6: Fix W4 — History day pill dark-mode text + ring track

**Files:**
- Modify: `lib/features/history/history_screen.dart:317-365` (`_DayPill.build`)
- Modify: `lib/features/history/history_screen.dart:378-382` (`_DayRingPainter.paint`)

Two issues:
1. `_DayPill` day number text hardcodes `AppColors.textPrimaryLight` (`#0D0D0F`) — near-black and invisible on dark scaffold.
2. `_DayRingPainter` track uses `AppColors.cyan.withAlpha(20)` — barely visible.

- [ ] **Step 1: Fix day pill text colors for dark mode**

Find in `lib/features/history/history_screen.dart`:
```dart
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        children: [
          Text(
            DateFormat('EEE').format(day).substring(0, 3).toUpperCase(),
            style: AppTextStyles.labelSmall.copyWith(
                color: isToday ? AppColors.cyan : AppColors.textSecondaryLight,
                fontSize: 9),
          ),
          const SizedBox(height: 4),
          SizedBox(
            width: 36,
            height: 36,
            child: Stack(
              alignment: Alignment.center,
              children: [
                CustomPaint(
                  size: const Size(36, 36),
                  painter: _DayRingPainter(
                    fraction: completionFraction,
                    isToday: isToday,
                  ),
                ),
                Container(
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: isToday ? AppColors.cyan.withAlpha(20) : Colors.transparent,
                  ),
                  child: Center(
                    child: Text(
                      day.day.toString(),
                      style: AppTextStyles.labelLarge.copyWith(
                        color: isToday ? AppColors.cyan : AppColors.textPrimaryLight,
                        fontWeight: isToday ? FontWeight.w700 : FontWeight.w400,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
```

Replace with:
```dart
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return GestureDetector(
      onTap: onTap,
      child: Column(
        children: [
          Text(
            DateFormat('EEE').format(day).substring(0, 3).toUpperCase(),
            style: AppTextStyles.labelSmall.copyWith(
                color: isToday
                    ? AppColors.cyan
                    : (isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight),
                fontSize: 9),
          ),
          const SizedBox(height: 4),
          SizedBox(
            width: 36,
            height: 36,
            child: Stack(
              alignment: Alignment.center,
              children: [
                CustomPaint(
                  size: const Size(36, 36),
                  painter: _DayRingPainter(
                    fraction: completionFraction,
                    isToday: isToday,
                  ),
                ),
                Container(
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: isToday ? AppColors.cyan.withAlpha(20) : Colors.transparent,
                  ),
                  child: Center(
                    child: Text(
                      day.day.toString(),
                      style: AppTextStyles.labelLarge.copyWith(
                        color: isToday
                            ? AppColors.cyan
                            : (isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight),
                        fontWeight: isToday ? FontWeight.w700 : FontWeight.w400,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
```

- [ ] **Step 2: Increase day ring track alpha**

Find in `lib/features/history/history_screen.dart`:
```dart
    final trackPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..color = AppColors.cyan.withAlpha(20);
```

Replace with:
```dart
    final trackPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..color = AppColors.cyan.withAlpha(40);
```

- [ ] **Step 3: Verify analyze**

Run: `fvm flutter analyze lib/features/history/history_screen.dart`

Expected: No issues.

---

## Task 7: Fix W3 — Goals weight card sparkline placeholder

**Files:**
- Modify: `lib/features/goals/goals_screen.dart:538-624`

`_WeightCard` shows plain text with no data visualization. Add a flat 7-point sparkline painter that renders the chart structure even in empty state.

- [ ] **Step 1: Add import for dart:math**

Check top of `lib/features/goals/goals_screen.dart`. If `import 'dart:math' as math;` is not present, add it as the first import.

Currently the file starts with:
```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
```

Add before the package imports:
```dart
import 'dart:math' as math;
```

- [ ] **Step 2: Add _WeightSparklinePainter class at end of file**

After the closing `}` of `_WeightCard` class, append:

```dart
class _WeightSparklinePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    const pointCount = 7;
    final midY = size.height * 0.55;

    final linePaint = Paint()
      ..color = AppColors.green.withAlpha(45)
      ..strokeWidth = 1.5
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    final dotPaint = Paint()
      ..color = AppColors.green.withAlpha(90)
      ..style = PaintingStyle.fill;

    final points = List.generate(pointCount, (i) {
      final x = size.width * i / (pointCount - 1);
      final wobble = (math.sin(i * 0.9) * size.height * 0.08);
      return Offset(x, midY + wobble);
    });

    final path = Path()..moveTo(points.first.dx, points.first.dy);
    for (int i = 1; i < points.length; i++) {
      final cp = Offset(
        (points[i - 1].dx + points[i].dx) / 2,
        (points[i - 1].dy + points[i].dy) / 2,
      );
      path.quadraticBezierTo(points[i - 1].dx, points[i - 1].dy, cp.dx, cp.dy);
    }
    path.lineTo(points.last.dx, points.last.dy);
    canvas.drawPath(path, linePaint);

    canvas.drawCircle(points.last, 3.5, dotPaint);
  }

  @override
  bool shouldRepaint(_WeightSparklinePainter old) => false;
}
```

- [ ] **Step 3: Insert sparkline into _WeightCard.build()**

Find in `_WeightCard.build()`:
```dart
            const SizedBox(height: 8),
            Text('Log your first weight to track progress',
                style: AppTextStyles.bodySmall.copyWith(
                    color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight)),
```

Replace with:
```dart
            const SizedBox(height: 12),
            SizedBox(
              height: 52,
              width: double.infinity,
              child: CustomPaint(
                painter: _WeightSparklinePainter(),
              ),
            ),
            const SizedBox(height: 8),
            Text('Log your first weight to track progress',
                style: AppTextStyles.bodySmall.copyWith(
                    color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight)),
```

- [ ] **Step 4: Verify analyze**

Run: `fvm flutter analyze lib/features/goals/goals_screen.dart`

Expected: No issues.

---

## Task 8: Full analyze + emulator verification

**Files:** None modified.

- [ ] **Step 1: Full project analyze**

Run: `fvm flutter analyze`

Expected: Zero new errors. Existing info/warnings from previous sessions are acceptable.

- [ ] **Step 2: Get emulator device ID**

Run: `fvm flutter devices`

Pick the running Android emulator device ID (e.g. `emulator-5554`).

- [ ] **Step 3: Run app on emulator**

Run: `fvm flutter run --debug -d <emulator-device-id>`

Note: Emulator has no internet — Firebase calls will fail gracefully showing empty states. UI structure and colors are verifiable without data.

- [ ] **Step 4: Take ADB screenshots for each screen**

```powershell
adb shell screencap -p /sdcard/s1.png; adb pull /sdcard/s1.png docs/live-app-screenshots/emu_scan.png
adb shell screencap -p /sdcard/s2.png; adb pull /sdcard/s2.png docs/live-app-screenshots/emu_today.png
adb shell screencap -p /sdcard/s3.png; adb pull /sdcard/s3.png docs/live-app-screenshots/emu_history.png
adb shell screencap -p /sdcard/s4.png; adb pull /sdcard/s4.png docs/live-app-screenshots/emu_goals.png
```

- [ ] **Step 5: Verify visual checklist**

| Check | Pass criteria |
|---|---|
| B2 | Today macro sub-cards appear slightly transparent against scaffold bg (glass-like) |
| B3 | Macro ring tracks visible as faint arcs even with 0 data |
| W1 | Profile chip shows a letter (email initial) instead of `?` |
| W2 | Capture button shows gradient ring in idle (blue→cyan→green→blue sweep) |
| W3 | Goals weight card shows a gentle green curve placeholder |
| W4 | History day pill numbers are visible in dark mode |
| N1 | RECENT button shows clock/history icon instead of flame |

- [ ] **Step 6: Commit**

```bash
git add lib/features/today/today_screen.dart lib/shared/widgets/macro_ring.dart lib/features/scan/scan_screen.dart lib/features/history/history_screen.dart lib/features/goals/goals_screen.dart
git commit -m "fix: UI parity round 2 — sub-card surface, ring tracks, capture gradient, day pill colors, weight sparkline"
```

---

## Self-Review

**Spec coverage:**
- B1 ✓ confirmed no-op (code already correct)
- B2 ✓ Task 1
- B3 ✓ Task 2
- W1 ✓ Task 3
- W2 ✓ Task 4
- N1 ✓ Task 5
- W4 ✓ Task 6
- W3 ✓ Task 7

**No placeholders:** All code blocks contain complete, compilable Dart.

**Type consistency:**
- `AppColors.surfaceDarkOverlay` → defined `app_colors.dart:11` ✓
- `AppColors.sweepGradient` → defined `app_colors.dart:36` ✓
- `GradientRotation` → used at `scan_screen.dart:614` already ✓
- `AppColors.textPrimaryDark / textSecondaryDark` → defined `app_colors.dart:21-23` ✓
- `math.sin` in goals → requires `import 'dart:math' as math;` — Task 7 Step 1 adds it ✓
