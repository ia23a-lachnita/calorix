# UI Diff Session — 2026-05-24

## Goal
Establish a reproducible, data-clean UI diff baseline for the Today screen.
Prior sessions showed 30%+ diffs driven by live app data (empty ring, wrong meals)
rather than layout bugs. This session fixed the data problem permanently.

## What was built

### 1. Debug reseed pipeline (`forceReseedForUiDiff`)
- `SeedDataService.forceReseedForUiDiff(uid)` — deletes today's Firestore entries
  and daily log, then reseeds with exact mockup values. Debug mode only.
- Mockup-matching seed data (3 entries, totals verified against Today.png):
  - Scrambled Eggs & Toast: 390 kcal, 32g P, 36g C, 12g F (08:00 breakfast)
  - Chicken Rice Bowl: 620 kcal, 48g P, 72g C, 16g F (12:48 lunch) — visible card
  - Salmon & Vegetables: 410 kcal, 16g P, 24g C, 10g F (16:00 dinner)
  - **Total: 1,420 kcal / 96g P / 132g C / 38g F** — exact mockup values
- `seedIfEmpty` also updated to use these corrected entries for first-run seeding.

### 2. Deep link trigger (`calorix://debug/reseed`)
- `AndroidManifest.xml`: `calorix://` URL scheme registered as intent-filter
- `app_router.dart`: GoRouter `redirect` normalises the full URI to `/debug/reseed`
- `/debug/reseed` route (kDebugMode only): calls `forceReseedForUiDiff`, shows
  cyan spinner, then navigates to Today
- ADB trigger: `adb shell am start -a android.intent.action.VIEW -d calorix://debug/reseed com.calorix.calorix/.MainActivity`

### 3. ui-diff.config.json preCapture
`preCapture` array fires before every screenshot run — no manual setup needed:
```json
[
  { "type": "adbShell", "command": "am start ... calorix://debug/reseed ...", ... },
  { "type": "adbShell", "command": "sleep 5", ... }
]
```

### 4. Native-resolution expected image
- Cropped `Today.png` (1206×2622) → `Today_1080.png` (1080×2400) removing the
  Samsung Edge Panel strip (126px right) and extra frame height (222px bottom)
- Config updated to `expectedImage: Today_1080.png`
- Edge Panel ignore region removed (no longer needed); nav bar region tightened

## Run history this session

| Run | Global diff | Delta | Macro Ring | Macro Rows | Meal Cards | Notes |
|-----|------------|-------|------------|------------|------------|-------|
| run-015 (prior) | 30.46% | — | — | — | — | Baseline before this session; data-driven regression |
| run-016 | 16.43% | −14.0pp | 23.9% FAIL | 19.7% FAIL | 12.8% PASS | preCapture worked; 1206×2622 expected still |
| run-017 | 15.90% | −0.5pp | 24.4% FAIL | 15.2% FAIL | 13.2% PASS | Native 1080×2400 both sides; real layout delta confirmed |

## What the diff is now measuring (run-017 — clean baseline)

The 15.9% global diff and ROI failures are **real layout/rendering differences**,
not data variance. Identified bugs:

### BUG-1: AnimatedMacroRing too small (priority: high)
- Mockup: ring fills ~70% of hero card, arcs reach near card right edge, thick strokes
- Actual: ring fills ~50% of card, visible gap on right, thinner arcs
- Hotspot: region-004 (x:364, y:345, w:566, h:781) — 52.5% diff density
- Fix: increase `size` parameter and/or `strokeWidth` in `AnimatedMacroRing`
  as used in `today_screen.dart`

### BUG-2: Macro progress bars positioning (priority: medium)
- Macro rows ROI at 15.2% — barely over 15% threshold
- Hotspot: region-005 (x:133, y:1197, w:701, h:102) — 31.6% diff density
- Likely: bar width, padding, or progress pill positioning differs from mockup

### NOT a bug: Meal Cards (13.2% — passing)
- Within 25% threshold; layout structure correct

## Commits
- `1280dfd` — seed data parity + deep link infrastructure + preCapture wiring
- `d2e4b54` — native resolution mockup (Today_1080.png) + preCapture schema fix

## Next steps
1. Fix `AnimatedMacroRing` size and stroke width to match mockup (BUG-1)
2. Review macro row bar layout against mockup (BUG-2)
3. Re-run ui-diff — preCapture will auto-reseed; target <14% global, all ROIs pass
4. Register SM-G780G device profile in config (suggested by tool, low priority)
