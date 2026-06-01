# Hero Card Ring Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `_HeroMacroCard` into a ring-only card (`_RingHeroCard`) and a separate macro rows card (`_MacroRowsCard`), decoupling ring size from macro sub-item layout so the `macro-ring-hero` UI diff ROI drops from 20.17% to below the 12% threshold with `qualityStatus: pass`.

**Architecture:** The single `_HeroMacroCard` widget currently contains both the `AnimatedMacroRing` (220dp) and three `_MacroSubCardItem` rows in one `Card`. The ring size cannot be increased to match the mockup without expanding the card height and pushing sub-items outside the `macro-rows` ROI zone. The fix creates two independent widgets: `_RingHeroCard` (ring-only card, current ring size/stroke in Phase A; tuned to mockup in Phase B) and `_MacroRowsCard` (three sub-card items wrapped in their own `Card` to preserve data-cluster grouping per design spec). Both accept the same `animation` and `summary` data from the parent `TodayScreen`. The old `_HeroMacroCard` class is deleted.

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

**Definition of done for this plan:** `macro-ring-hero` ROI structural diff < 12% in a `run_screen_ui_diff` run with `qualityStatus: pass`. `qualityStatus: not_evaluated` is not acceptable — the run must produce a quality evaluation that passes.

---

## Verification Contract

All verifications use `run_screen_ui_diff` (named screen workflow), not `run_mobile_ui_diff`.

**Expected image:** `docs/mockups/image/dark/single/Today.png`. Do not recreate `Today_1080.png`. Do not loosen thresholds or broaden masks to manufacture a pass. ROIs must continue to measure the intended components — do not narrow or move ROIs just to reduce the score.

**Clipping assumption warning:** `Card.clipBehavior: Clip.antiAlias` applies the card's border radius to its children. It does NOT create a fixed-height viewport that clips a larger child at an arbitrary point the way the mockup shows. After Phase A build, verify in the actual/diff artifacts whether the ring is truly clipped at the card boundary. If the ring bleeds outside the card or the card simply grows to contain it, a fixed-height clipped viewport (e.g. `SizedBox` with `ClipRRect`, or `OverflowBox`/`Transform.translate`) will be required in Phase B.

**ROI calibration rule:** Do not compute ROI `y`/`height` values from estimated app-content height. Tune ROI boundaries from the generated ROI artifacts (`.ui-diff/today/run-NNN/regions-of-interest/`) and the `regionBounds` fields in `report.json`. Read the actual bounds from MCP output before editing `ui-diff.config.json`.

**Commit timing:** Do NOT commit before MCP verification. Commit only after build/install + UI diff pass + artifact inspection confirm the change is correct.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/features/today/today_screen.dart` | Modify | Replace `_HeroMacroCard` with `_RingHeroCard` + `_MacroRowsCard`; delete `_HeroMacroCard` |
| `ui-diff.config.json` | Modify (Phase B only) | Adjust `macro-ring-hero` and `macro-rows` ROI boundaries based on measured artifacts |

No new files. No new providers. No changes to `app_router.dart`, `ui_diff_provider.dart`, or any other file.

---

## Phase A: Split `_HeroMacroCard` keeping current ring size/stroke

Objective: perform the structural split without changing ring size (keep 220dp) or stroke. Confirm macro rows still pass and that the split itself does not introduce regressions before any ring tuning.

### Task A1 — Replace `_HeroMacroCard` with two split widgets

**Files:** `lib/features/today/today_screen.dart`

#### Step A1.1 — Update the call site in `TodayScreen.build()`

In `_TodayScreenState.build()`, locate the `SliverChildListDelegate` list. Replace:

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

#### Step A1.2 — Add `_RingHeroCard` widget

Delete the entire `_HeroMacroCard` class and replace it with two new classes. Add `_RingHeroCard` first, keeping ring size at 220 (current) and stroke at its current value:

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
                size: 220,
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

#### Step A1.3 — Add `_MacroRowsCard` widget

Immediately after `_RingHeroCard`, add. The outer `Card` wrapper preserves data-cluster grouping:

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

#### Step A1.4 — Run analyze

```powershell
fvm flutter analyze lib/features/today/today_screen.dart
```

Expected: no errors. If any `_HeroMacroCard` references remain, delete them.

#### Step A1.5 — Build debug APK

```powershell
fvm flutter build apk --debug
```

Expected: `BUILD SUCCESSFUL`. APK at `build/app/outputs/flutter-apk/app-debug.apk`.

#### Step A1.6 — Install on device

```powershell
adb -s R58R61161NA install -r build/app/outputs/flutter-apk/app-debug.apk
```

Expected: `Success`.

### Task A2 — Verify Phase A: confirm split doesn't break macro rows

#### Step A2.1 — VLM health check

```
vlm_health(model: "moondream:latest", timeoutMs: 90000)
```

Expected: `status: ok`, `imageInputVerified: true`. If this fails, stop — do not run diff without VLM.

#### Step A2.2 — Run UI diff

```
run_screen_ui_diff(screen: "today", configPath: "ui-diff.config.json")
```

#### Step A2.3 — Inspect artifacts and evaluate

Read `report.json` from the latest run. Inspect the following artifacts manually before concluding:
- `.ui-diff/today/run-NNN/actual.png` — confirm screen renders as expected (no blank, no crash)
- `.ui-diff/today/run-NNN/regions-of-interest/macro-ring-hero-diff.png`
- `.ui-diff/today/run-NNN/regions-of-interest/macro-rows-diff.png`
- `.ui-diff/today/run-NNN/report.json` — check `regionBounds` for each ROI

**Phase A pass criteria:**
- `qualityStatus: pass` (not `not_evaluated`, not `fail`)
- `macro-rows` ROI structural diff does not regress vs run-030 baseline
- No new critical gate failures introduced by the split

**If macro rows regressed:** The row layout changed due to the Card re-wrapping. Inspect padding/margin changes and adjust `_MacroRowsCard` padding before Phase B.

**Do NOT commit yet.** Phase A commit happens only after Phase B verification or explicitly if the user approves a Phase A-only commit.

---

## Phase B: Tune ring size/position/clipping toward the mockup

Objective: increase ring size toward the mockup target (~270dp at the mockup's 402dp width, which scales to ~242dp at 360dp width) and verify clipping behavior. Run diff again.

### Task B1 — Adjust ring size and verify clipping

#### Step B1.1 — Read Phase A artifacts first

Before editing any code, read the Phase A artifacts:
- Confirm whether `clipBehavior: Clip.antiAlias` actually clips the ring at the card boundary, or whether the card expands to contain the ring.
- If the card simply grows (no overflow clipping): a fixed-height viewport is needed. Use a `SizedBox(height: N)` wrapping a `ClipRRect` or `Stack` + `Align` + `OverflowBox` pattern. Do not proceed with a larger `size:` value without the correct clipping mechanism.
- If clipping works correctly: increase `size:` toward 242–270 and adjust `padding` to match the mockup proportions.

#### Step B1.2 — Implement ring size/clipping adjustment

Based on artifact inspection, apply one of these approaches:

**Option A — Card clips correctly (simple case):**
Update `size:` in `_RingHeroCard` to the calibrated value (start at 242, verify, then 260/270 if mockup parity improves):
```dart
size: 242,  // adjust based on diff artifacts
```

**Option B — Card does not clip (requires fixed-height viewport):**
Replace the `Padding` + `Center` + `AnimatedMacroRing` section inside `_RingHeroCard.build()` with a fixed-height clipped container. Example pattern:
```dart
SizedBox(
  height: 220,  // fixed height matching desired visible ring area
  child: ClipRRect(
    borderRadius: BorderRadius.circular(28),
    child: OverflowBox(
      maxHeight: 270,
      child: AnimatedMacroRing(
        size: 270,
        // ... other params unchanged
      ),
    ),
  ),
)
```
Adjust the `height` and `maxHeight` values from artifact measurements, not from estimates.

#### Step B1.3 — Run analyze, build, install

```powershell
fvm flutter analyze lib/features/today/today_screen.dart
fvm flutter build apk --debug
adb -s R58R61161NA install -r build/app/outputs/flutter-apk/app-debug.apk
```

### Task B2 — Verify Phase B: confirm macro-ring-hero diff drops below 12%

#### Step B2.1 — VLM health check

```
vlm_health(model: "moondream:latest", timeoutMs: 90000)
```

#### Step B2.2 — Run UI diff

```
run_screen_ui_diff(screen: "today", configPath: "ui-diff.config.json")
```

#### Step B2.3 — Inspect artifacts and evaluate

Report the following from `report.json` and visual artifacts:
- Run ID
- Global diff %
- `qualityStatus`
- `macro-ring-hero` ROI structural diff %
- `macro-rows` ROI structural diff %
- `meal-cards` ROI structural diff %

Inspect:
- `actual.png` — does the ring match the mockup proportions?
- `macro-ring-hero-diff.png` — what remains different?

**Phase B pass criteria:**
- `qualityStatus: pass`
- `macro-ring-hero` structural diff < 12%
- `macro-rows` structural diff not regressed from Phase A
- No new critical gate failures

**If still ≥ 12%:** Read the diff artifact to identify what remains different. Iterate on ring size or padding (not ROI boundaries) until parity improves. Document each iteration's run ID and diff % before continuing.

**If ROI recalibration is needed:** See Task B3.

### Task B3 — Recalibrate ROI boundaries if post-split layout shifted them (conditional)

Run this task only if the Phase B run shows ROIs evaluating incorrect screen regions (e.g. `macro-rows` ROI overlaps with `meal-cards`). Do not run this task to manufacture a pass — ROIs must still measure the intended components.

#### Step B3.1 — Read actual bounds from MCP artifacts

From the Phase B `report.json`, read the `regionBounds` fields for each ROI. Verify visually from the generated ROI artifact images which screen area each ROI currently captures.

If a ROI is misaligned, tune `y`/`height` values based on the measured bounds. Do not narrow an ROI to exclude part of the target component — only shift it to correctly center on the component.

#### Step B3.2 — Update `ui-diff.config.json`

Edit only the misaligned ROI(s). Preserve:
- `macro-ring-hero.critical: true`
- `macro-ring-hero.maxDiffPercent: 0.12`
- All `allowedDynamicSubregions` definitions
- `Today.png` as the expected image path — do not change this

Do not loosen `maxDiffPercent` thresholds to make a failing ROI pass.

#### Step B3.3 — Re-run UI diff to confirm calibration

```
run_screen_ui_diff(screen: "today", configPath: "ui-diff.config.json")
```

Confirm both `macro-ring-hero` and `macro-rows` ROIs are evaluating the correct screen region in the new run's ROI artifacts.

---

## Task C — Commit and push validated changes

Run this task only after Phase B (and optionally B3) verification passes with `qualityStatus: pass`.

#### Step C1 — Commit today_screen.dart

```powershell
git add lib/features/today/today_screen.dart
git commit -m "Split hero macro card into ring-only card and macro rows card"
```

#### Step C2 — Commit config if changed

Only if `ui-diff.config.json` was modified in Task B3:

```powershell
git add ui-diff.config.json
git commit -m "Recalibrate Today screen ROI boundaries for split hero card layout"
```

#### Step C3 — Push to remote

```powershell
git push
```

Note: Do NOT include "AI", "Claude", "Generated", "Co-Authored-By", or any model name in commit messages. The pre-commit hook rejects these.

---

## Self-Review

### Spec coverage
- Mockup spec (README.md): ring = three concentric arcs, overflow-clipped card. Phase B targets this with verified clipping, not assumed clipping.
- Mockup spec: sub-cards full-width. `_MacroRowsCard` stretches to full parent width.
- Design.md motion spec: count-up ~1.4s easeOutCubic. Both new widgets receive `animation` from the parent `AnimationController` — no motion change.
- UI-diff policy: VLM required, `qualityStatus: pass` required. Tasks A2 and B2 enforce both gates.
- Commit hook: no banned words. Commit messages use plain imperative English only.
- Expected image: `Today.png` unchanged. No threshold loosening. No mask broadening.

### Placeholder scan
No TBD, TODO, or placeholder content in the Phase A code blocks. Phase B code blocks intentionally show options because the correct choice depends on artifact inspection.

### Type consistency
- `_RingHeroCard` and `_MacroRowsCard` share identical constructor signature to the deleted `_HeroMacroCard` (same four named params: `animation`, `summary`, `plan`, `isDark`).
- `_MacroSubCardItem` signature is unchanged — `_MacroRowsCard` passes `label`, `current`, `target`, `color`, `isDark`, `animation` matching the existing constructor.
- Phase A `AnimatedMacroRing` call keeps `size: 220` and `strokeWidth: 18` unchanged. Phase B adjusts `size:` only after artifact verification.
