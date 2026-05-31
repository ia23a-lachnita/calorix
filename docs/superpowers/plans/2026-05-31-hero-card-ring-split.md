# Hero Card Ring Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `_HeroMacroCard` into a ring-only card (`_RingHeroCard`, 270dp, clipped) and a separate macro rows card (`_MacroRowsCard`), decoupling ring size from macro sub-item layout so the macro-ring-hero UI diff ROI drops from 20.17% to below the 12% threshold.

**Architecture:** The single `_HeroMacroCard` widget currently contains both the `AnimatedMacroRing` (220dp) and three `_MacroSubCardItem` rows in one `Card`. The ring size cannot be increased to match the mockup (~270dp) without expanding the card height and pushing sub-items outside the macro-rows ROI zone. The fix creates two independent widgets: `_RingHeroCard` (ring-only, 270dp, `clipBehavior: Clip.antiAlias`) and `_MacroRowsCard` (three sub-card items wrapped in their own `Card` to preserve data-cluster grouping as per design spec). Both accept the same `animation` and `summary` data from the parent `TodayScreen`. The old `_HeroMacroCard` class is deleted.

> **Gemini review note (blocker addressed):** Gemini flagged that removing the outer card from the macro rows breaks the design grouping principle — data clusters must be enclosed in a card. `_MacroRowsCard` wraps the three sub-items in a `Card` (radius 28, matching `_RingHeroCard`) to satisfy this requirement.

**Tech Stack:** Flutter/Dart, Riverpod, FVM, `AnimatedMacroRing`, `MacroProgressBar`, `mobile-ui-diff` MCP for verification.

---

## Context and Background

This plan addresses a persistent UI diff failure identified across runs 027–030 of the `mobile-ui-diff` MCP against the Today screen. The root diagnosis (observation 608, May 31):

- Mockup target device: ~402dp logical width; ring ~270dp with overflow clipped by card edge.
- Actual device (Samsung SM-G780G): 360dp logical width (1080px native / 3× density), 10.4% narrower.
- Current implementation: ring at 220dp fits with space around it — wrong geometry vs mockup.
- Layout coupling: `_MacroSubCardItem` rows are inside the same `Card` as the ring. Increasing ring size grows the card height and shifts the sub-items below the `macro-rows` ROI zone (35% structural diff regression in run-028).
- Animation stabilization (commit d19d1ad) confirmed animations are NOT the root cause. The 20.17% structural diff in run-030 is purely a layout/sizing mismatch.

**Definition of done for this plan:** `macro-ring-hero` ROI structural diff < 12% in a `mobile-ui-diff` run with `qualityStatus: pass` or `qualityStatus: not_evaluated` (no critical gate failure).

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/features/today/today_screen.dart` | Modify | Replace `_HeroMacroCard` with `_RingHeroCard` + `_MacroRowsCard`; delete `_HeroMacroCard` |
| `ui-diff.config.json` | Modify | Adjust `macro-ring-hero` and `macro-rows` ROI `y`/`height` values to match post-split layout |

No new files. No new providers. No changes to `app_router.dart`, `ui_diff_provider.dart`, or any other file.

---

## Task 1: Replace `_HeroMacroCard` with two split widgets

**Files:**
- Modify: `lib/features/today/today_screen.dart`

### Step 1.1 — Update the call site in `TodayScreen.build()`

In `_TodayScreenState.build()`, locate the `SliverChildListDelegate` list (around line 134). Replace:

```dart
_HeroMacroCard(
  animation: _animation,
  summary: summary,
  plan: plan,
  isDark: isDark,
),
const SizedBox(height: 24),
```

With:

```dart
_RingHeroCard(
  animation: _animation,
  summary: summary,
  plan: plan,
  isDark: isDark,
),
const SizedBox(height: 12),
_MacroRowsCard(
  animation: _animation,
  summary: summary,
  plan: plan,
  isDark: isDark,
),
const SizedBox(height: 12),
```

### Step 1.2 — Add `_RingHeroCard` widget

Delete the entire `_HeroMacroCard` class (lines 196–313 in the current file) and replace it with two new classes. Add `_RingHeroCard` first:

```dart
class _RingHeroCard extends StatelessWidget {
  final Animation<double> animation;
  final ({double kcal, double protein, double carbs, double fat}) summary;
  final MacroTargetPlan plan;
  final bool isDark;

  const _RingHeroCard({
    required this.animation,
    required this.summary,
    required this.plan,
    required this.isDark,
  });

  @override
  Widget build(BuildContext context) {
    final kcalLeft = (plan.kcal - summary.kcal).clamp(0, double.infinity);
    final textColor =
        isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;

    return Card(
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 14),
        child: AnimatedBuilder(
          animation: animation,
          builder: (context, _) {
            final kcalNow = summary.kcal * animation.value;
            return Center(
              child: AnimatedMacroRing(
                animation: animation,
                proteinFraction:
                    plan.protein > 0 ? summary.protein / plan.protein : 0,
                carbsFraction:
                    plan.carbs > 0 ? summary.carbs / plan.carbs : 0,
                fatFraction:
                    plan.fat > 0 ? summary.fat / plan.fat : 0,
                size: 270,
                strokeWidth: 18,
                trackColor: isDark
                    ? AppColors.skeletonBaseDark
                    : const Color(0xFFF2F0EB),
                center: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'KCAL EATEN',
                      style: AppTextStyles.labelMono.copyWith(
                        color: isDark
                            ? AppColors.textSecondaryDark
                            : AppColors.textSecondaryLight,
                      ),
                    ),
                    Text(
                      NumberFormat('#,###').format(kcalNow.round()),
                      style: AppTextStyles.heroNumber.copyWith(color: textColor),
                    ),
                    Text(
                      'of ${NumberFormat('#,###').format(plan.kcal)}',
                      style: AppTextStyles.labelSmall.copyWith(
                        color: isDark
                            ? AppColors.textSecondaryDark
                            : AppColors.textSecondaryLight,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 3),
                      decoration: BoxDecoration(
                        color: AppColors.kcalLeftPillBg,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        '${NumberFormat('#,###').format(kcalLeft.round())} kcal left',
                        style: AppTextStyles.labelMono
                            .copyWith(color: AppColors.green),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
```

### Step 1.3 — Add `_MacroRowsCard` widget

Immediately after `_RingHeroCard`, add. Note the outer `Card` wrapper — this preserves the data-cluster grouping identified by Gemini review:

```dart
class _MacroRowsCard extends StatelessWidget {
  final Animation<double> animation;
  final ({double kcal, double protein, double carbs, double fat}) summary;
  final MacroTargetPlan plan;
  final bool isDark;

  const _MacroRowsCard({
    required this.animation,
    required this.summary,
    required this.plan,
    required this.isDark,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: AnimatedBuilder(
          animation: animation,
          builder: (context, _) {
            final pNow = summary.protein * animation.value;
            final cNow = summary.carbs * animation.value;
            final fNow = summary.fat * animation.value;
            return Column(
              children: [
                _MacroSubCardItem(
                  label: 'Protein',
                  current: pNow,
                  target: plan.protein.toDouble(),
                  color: AppColors.protein,
                  isDark: isDark,
                  animation: animation,
                ),
                const SizedBox(height: 8),
                _MacroSubCardItem(
                  label: 'Carbs',
                  current: cNow,
                  target: plan.carbs.toDouble(),
                  color: AppColors.carbs,
                  isDark: isDark,
                  animation: animation,
                ),
                const SizedBox(height: 8),
                _MacroSubCardItem(
                  label: 'Fat',
                  current: fNow,
                  target: plan.fat.toDouble(),
                  color: AppColors.fat,
                  isDark: isDark,
                  animation: animation,
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}
```

### Step 1.4 — Run analyze

```powershell
fvm flutter analyze lib/features/today/today_screen.dart
```

Expected: no errors, no warnings about unused imports or undefined identifiers. If `_HeroMacroCard` references remain, they will show as "unused class" — delete them.

### Step 1.5 — Build debug APK

```powershell
fvm flutter build apk --debug
```

Expected: `BUILD SUCCESSFUL` with APK at `build/app/outputs/flutter-apk/app-debug.apk`. Build time ~20–40s.

### Step 1.6 — Install on device

```powershell
adb -s R58R61161NA install -r build/app/outputs/flutter-apk/app-debug.apk
```

Expected: `Success` with no install errors. Device serial is `R58R61161NA` (Samsung SM-G780G).

### Step 1.7 — Commit

```powershell
git add lib/features/today/today_screen.dart
git commit -m "Split HeroMacroCard into ring-only card and macro rows section"
```

Note: Do NOT include "AI", "Claude", "Generated", "Co-Authored-By", or any model name in the commit message. The pre-commit hook rejects these.

---

## Task 2: Verify macro-ring-hero diff drops below 12%

**Files:** None modified in this task — read-only MCP calls.

### Step 2.1 — VLM health check

Before running UI diff, confirm VLM is available:

```
vlm_health(model: "moondream:latest", timeoutMs: 90000)
```

Expected: `status: ok`, `imageInputVerified: true`. If this fails, stop and resolve VLM before continuing — do not run diff without VLM (policy: `vlmPolicy: "required"`).

### Step 2.2 — Run UI diff

```
run_mobile_ui_diff(screen: "today", configPath: "ui-diff.config.json")
```

This will:
1. Trigger the debug reseed deep link via ADB.
2. Wait 5 seconds for Firestore seed + navigation.
3. Capture a screenshot from the device.
4. Compare against `docs/mockups/image/dark/single/Today.png`.
5. Evaluate ROIs including `macro-ring-hero` (critical, threshold 12%).

### Step 2.3 — Evaluate result

Read `.ui-diff/today/run-NNN/report.json` (where NNN is the latest run number).

**Pass criteria:**
- `macro-ring-hero` ROI `structuralDiff` < 0.12 (12%).
- `qualityStatus: pass` or no critical gate failure.

**If pass:** Proceed to Task 3 (ROI boundary adjustment and final commit).

**If fail (diff still ≥ 12%):** The split reduced coupling but the geometry still mismatches. Read the diff image at `.ui-diff/today/run-NNN/regions-of-interest/macro-ring-hero-diff.png` to identify what is still different. Common follow-up fixes:
  - Adjust ring padding: try `vertical: 16` or `vertical: 24` inside `_RingHeroCard`.
  - Adjust ring size: try 260 or 280 if 270 still clips wrong.
  - Confirm `clipBehavior: Clip.antiAlias` is actually on the `Card` (not the `Padding`).
  
  Re-build → re-install → re-run diff. Iterate until pass.

---

## Task 3: Adjust ROI boundaries to match post-split layout

**Files:**
- Modify: `ui-diff.config.json`

After the split, the ring card is taller (270dp ring + ~40dp vertical padding ≈ 310dp vs original 220dp ring + ~28dp ≈ 248dp). The macro rows section now starts ~62dp lower. The normalized ROI `y` and `height` values must be updated to keep each ROI focused on its target component.

### Step 3.1 — Compute new ROI boundaries

Device app content height: 2400px − 72px (status bar) − 84px (nav bar) = 2244px active height.

**Current values:**
- `macro-ring-hero`: y=0.14, height=0.25 → rows 314–875 in app content space
- `macro-rows`: y=0.39, height=0.12 → rows 875–1144

**After split (estimated):**
The SliverAppBar takes ~110dp (~110×3=330px). Ring card: ~310dp (~930px). Gap: 12dp (~36px). Macro rows: ~3×(14+~32+14)+2×8 ≈ ~172dp (~516px).

Using 3× density:
- Ring card starts at ~330px, ends at ~330+930=1260px → normalized: start 330/2244=0.147, end 1260/2244=0.561.
- Macro rows start at ~1296px → normalized: 1296/2244=0.578.

These are estimates. Use the actual diff run output or a screenshot to calibrate. The exact pixel positions can be read from `.ui-diff/today/run-NNN/report.json` in the `regionBounds` fields.

### Step 3.2 — Update `ui-diff.config.json`

Replace the `regionsOfInterest` values for `macro-ring-hero` and `macro-rows` based on measurements from Step 3.1. Keep `macro-ring-hero.critical: true` and `maxDiffPercent: 0.12`.

Approximate updated values (adjust based on actual run data):

```json
{
  "id": "macro-ring-hero",
  "label": "Macro Ring Hero Card",
  "type": "component",
  "critical": true,
  "box": { "x": 0.01, "y": 0.14, "width": 0.98, "height": 0.34 },
  "coordinateSpace": "normalized",
  "maxDiffPercent": 0.12,
  "allowedDynamicSubregions": [
    {
      "id": "kcal-number",
      "label": "Calorie count center text",
      "box": { "x": 0.33, "y": 0.30, "width": 0.34, "height": 0.16 },
      "coordinateSpace": "roiNormalized"
    },
    {
      "id": "target-kcal-text",
      "label": "Target kcal label below count",
      "box": { "x": 0.28, "y": 0.50, "width": 0.44, "height": 0.10 },
      "coordinateSpace": "roiNormalized"
    }
  ]
}
```

```json
{
  "id": "macro-rows",
  "label": "Macro Progress Rows",
  "type": "component",
  "box": { "x": 0.01, "y": 0.49, "width": 0.98, "height": 0.14 },
  "coordinateSpace": "normalized",
  "maxDiffPercent": 0.15,
  "allowedDynamicSubregions": [
    {
      "id": "macro-values",
      "label": "Macro gram values (far right numerics only)",
      "box": { "x": 0.72, "y": 0.0, "width": 0.25, "height": 1.0 },
      "coordinateSpace": "roiNormalized"
    }
  ]
}
```

### Step 3.3 — Re-run UI diff to confirm ROI calibration

```
run_mobile_ui_diff(screen: "today", configPath: "ui-diff.config.json")
```

Confirm both `macro-ring-hero` and `macro-rows` ROIs are evaluating the correct screen region (not overlapping AppBar or meal cards). If a ROI still includes an unexpected area, adjust `y` or `height` accordingly and re-run.

### Step 3.4 — Commit config update

```powershell
git add ui-diff.config.json
git commit -m "Recalibrate Today screen ROI boundaries for split hero card layout"
```

---

## Self-Review

### Spec coverage
- Mockup spec (README.md line 59–61): ring = three concentric arcs, overflow-clipped card. ✅ Covered by `_RingHeroCard` with `clipBehavior: Clip.antiAlias` and size 270.
- Mockup spec: sub-cards full-width. ✅ `_MacroRowsSection` stretches to full parent width.
- Design.md motion spec: count-up ~1.4s easeOutCubic. ✅ Both new widgets receive `animation` from the parent `AnimationController` — no motion change.
- UI-diff policy: VLM required, do not accept qualityStatus: fail. ✅ Task 2 enforces vlm_health gate.
- Commit hook: no banned words. ✅ Commit messages use plain imperative English only.

### Placeholder scan
No TBD, TODO, or placeholder content. All code blocks contain complete, runnable Dart.

### Type consistency
- `_RingHeroCard` and `_MacroRowsCard` share identical constructor signature to the deleted `_HeroMacroCard` (same four named params: `animation`, `summary`, `plan`, `isDark`).
- `_MacroSubCardItem` signature is unchanged — `_MacroRowsSection` passes `label`, `current`, `target`, `color`, `isDark`, `animation` matching the existing constructor on lines 323–332 of the original file.
- `AnimatedMacroRing` call uses `size: 270` (was 220), `strokeWidth: 18` (unchanged), all other named params identical.
