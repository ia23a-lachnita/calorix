# UI Diff Session — 2026-06-01c

## Goal

Make one small, targeted macro-ring/center-stack improvement to improve center pill legibility
and reduce macro-ring-hero structural diff below 18.55% (run-039 baseline).

## Git Starting State

Branch: `main`, up to date with origin/main.
Latest commit: `f4cd253` — glow reduction (run-039 baseline: macro-ring-hero 18.55%).

## Chosen Approach: Option B — Pill Layering/Background

The visible issue in run-039 artifacts: the green fat arc crowds the "980 kcal left" pill because
the pill background is nearly transparent (20% alpha), allowing ring glow to bleed through visually.

**Hypothesis**: Increasing pill background opacity and adding a thin border would make the pill stand
out more distinctly from the arc background, reducing the pixel-level mismatch in that area.

## Exact Code Changes (Reverted)

### `lib/core/theme/app_colors.dart`
```
kcalLeftPillBg: Color(0x331FCC74)  →  Color(0x551FCC74)  // 20% → 33% alpha
```

### `lib/features/today/today_screen.dart` — pill Container decoration
Added:
```dart
border: Border.all(
  color: AppColors.green.withAlpha(50),
  width: 0.5,
),
```

Both changes were reverted after run-040 confirmed regression.

## Screenshot

Path: `docs/screenshots/today-screen-2026-06-01d-pill-opacity-border-attempt.png`
Source: run-040 `actual.png` — captured with pill opacity + border applied.

## Build / Install

```powershell
fvm flutter build apk --debug   # Success, ~38s
adb -s R58R61161NA install -r build\app\outputs\flutter-apk\app-debug.apk  # Success
adb -s R58R61161NA shell pm grant com.calorix.calorix android.permission.POST_NOTIFICATIONS
```

## VLM Health

- qwen2.5vl:3b: installed but failed to load (Ollama request failed)
- moondream:latest: usable fallback, selected
- Model: `moondream:latest`

## Run: run-040

## ROI Results

| ROI | Raw diff | Structural diff | Threshold | Status | Critical | Masked % |
|---|---|---|---|---|---|---|
| macro-ring-hero | 20.95% | 19.57% | 12% | FAIL | YES | 12.15% |
| macro-rows | 7.54% | 9.02% | 15% | PASS | no | 25.04% |
| meal-cards | 12.99% | 15.56% | 25% | PASS | no | 25.04% |

**Global diff**: 12.55%
**qualityStatus**: fail

## Delta vs Run-039

| Metric | run-039 | run-040 | Delta |
|---|---|---|---|
| Global diff | 12.36% | 12.55% | +0.19% (worse) |
| macro-ring-hero structural | 18.55% | 19.57% | +1.02 pp (worse) |
| macro-rows structural | 8.82% | 9.02% | +0.20 pp (marginally worse) |
| meal-cards structural | 15.71% | 15.56% | -0.15 pp (negligible) |

**Trend**: worsened.

## Manual Artifact Interpretation

- actual.png: unified hero card present, 1,420 kcal shown, Chicken Rice Bowl first, no overflow marker
- macro-ring-hero: making the pill more opaque/distinct added new pixel mismatches — the mockup
  pill color profile does not match a 33%-alpha background + thin border; the change moved pixels
  away from the expected mockup pixel values rather than toward them
- macro-rows: remained passing (9.02% vs 15% threshold), minimal regression
- meal-cards: remained passing (15.56% vs 25% threshold), negligible
- Screenshot committed as documentation of this attempt

## Conclusion

**Change reverted.** Pill opacity/border increase worsened macro-ring-hero by 1.02 pp.

**Root cause of failure**: The mockup pill has a specific visual appearance. Increasing local
opacity/adding a border changed the actual pixel values in the pill region in a way that diverged
further from the expected mockup pixels, rather than converging. The structural diff captures this
mismatch regardless of whether the change looks better or worse to a human reviewer.

**Lessons**:
- Cosmetic changes to the pill (opacity, border) are not productive tuning vectors for this metric.
- The remaining ~6.55 pp gap above the 12% threshold is structural: device-geometry mismatch
  (360dp app vs 402dp mockup) and absent outer halo/decorative ring layer in the mockup.
- The glow-bleed tuning vector (run-039) and pill-legibility vector (run-040) are both exhausted
  without crossing the threshold.

## What Was Verified

- actual is not black: YES
- expected is original Today.png: YES
- actual shows final 1,420 kcal: YES
- Chicken Rice Bowl is first: YES
- no overflow marker: YES
- unified hero card remains: YES
- macro rows still pass: YES

## Next Recommendations

1. **Outer decorative ring layer** — mockup shows a faint halo at the outer perimeter of the protein
   ring. Adding a thin, low-alpha outer ring at radius = size/2 - strokeWidth*0.3 may reduce the
   structural mismatch by matching the mockup's light outer treatment.
2. **Android-specific expected baseline** — if the device-geometry gap (360dp vs 402dp) is
   irreducible, calibrating a device-specific expected image eliminates the scale mismatch from
   all ROI scores.
3. **Center stack vertical offset** — a 4–6 px upward `Transform.translate` on the center Column
   has not been tried and may nudge the pill position closer to the mockup's expected pill location.
