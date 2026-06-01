# UI Diff Session Report — 2026-05-31c
## Hero Card Ring Split Verification

**Commit under review:** `bfaba17` — Split hero macro card into ring-only card and macro rows card  
**Latest run:** run-036  
**Session type:** Verification audit (no new layout changes until this report is resolved)

---

## 1. Deterministic Capture State

**Verdict: CONFIRMED — animation stabilization is in place and ran for run-036.**

Evidence:
- `today_screen.dart:31-35`: `initState` reads `uiDiffModeProvider` via `ref.read` and sets `AnimationController.duration = Duration.zero` when `true`. This jumps `_countUp.forward()` immediately to `animation.value = 1.0`, eliminating mid-frame captures.
- `app_router.dart` (`_DebugReseedScreenState._reseed`): sets `uiDiffModeProvider.notifier.state = true` immediately before `context.go(RoutePaths.today)`, ensuring TodayScreen reads `true` during `initState`.
- run-036 `preCapture` shows both steps completed with `ok: true`:
  - `am start -a android.intent.action.VIEW -d calorix://debug/reseed ...` → ok
  - `sleep 5` → ok

**Open caveat:** The report masks the kcal-number area as a dynamic subregion, so the exact displayed value (final 1,420 or intermediate) is not directly readable from the report. However, with `Duration.zero` and a 5-second preCapture wait, the capture should show the final settled state. The seed data confirms: 2,400 kcal target − 1,420 eaten = 980 kcal left. This is the expected value visible in actual.png.

**The run-029 regression (mid-animation 1,413 instead of 1,420) is resolved.** The animation stabilization commit `d19d1ad` fixed this and run-036 uses the stabilized APK.

---

## 2. Device Profile Placement

**Verdict: CONFIRMED — no warning, profile applied correctly.**

- `ui-diff.config.json:2–15`: `SM-G780G` is under top-level `deviceProfiles.SM-G780G` with explicit `"id": "SM-G780G"` field.
- run-036 `appliedDeviceProfile` confirms: `{id: SM-G780G, serial: R58R61161NA, manufacturer: Samsung, density: 480}`.
- No "No matching Android device profile found" warning anywhere in the run-036 report.

---

## 3. Final Run Details — run-036 (commit bfaba17)

| Field | Value |
|---|---|
| Run ID | run-036 |
| Global diff | **14.71%** (threshold 14%) |
| Global status | **fail** (marginally over threshold) |
| qualityStatus | **fail** |
| actionRequired | `null` |
| VLM | moondream:latest — no fallback, health ok |
| Delta vs run-035 | −3.75% global (improved) |

### ROI Table

| ROI | Critical | Raw diff | Structural diff | Dynamic masked % | Threshold | Status |
|---|---|---|---|---|---|---|
| macro-ring-hero | **YES** | 22.60% | **22.89%** | 12.15% | 12% | **FAIL** |
| macro-rows | no | 15.53% | **19.65%** | 25.04% | 15% | **FAIL** |
| meal-cards | no | 14.99% | 16.25% | 25.04% | 25% | **PASS** |

**qualityStatus correctly fails** — `qualityFailures` contains `critical_roi_failed` for `macro-ring-hero`.  
`agentVerdict`: "Do not accept. Critical Macro Ring Hero Card region still differs significantly from mockup. Structural ROI diff is 22.89%, likely a layout, styling, or rendering issue."

---

## 4. Artifact Inspection

| Artifact | Size | Check |
|---|---|---|
| actual.png | 538 KB | Not black — substantial real screenshot |
| expected.png | 350 KB | Present, non-trivial size |
| diff.png | 138 KB | Diff map exists |

**Expected image resolution:** 1206×2622 px — this matches `Today.png` (402dp mockup at 3× density). It is NOT `Today_1080.png`. Config confirms: `"expectedImage": "docs/mockups/image/dark/single/Today.png"`.

**Chicken Rice Bowl present:** region-013 VLM label is `"Chicken Rice Bowl"` at y≈1977 in actual — confirmed first meal.

**"980 kcal left" legibility:** Not directly readable from report text (kcal area is a dynamic mask). Seed data guarantees the value: 2,400 − 1,420 = 980. With animation zero-duration, the displayed value is final.

**Macro rows after split:** macro-rows structural diff is 19.65% (FAIL, threshold 15%). The split introduced a visual regression in the macro-rows card. See §5 for detail.

**New card spacing regression:** The split adds a second `Card` widget for macro-rows. Actual card boundary, border radius, and background rendering differ from the mockup, which shows a single unified card for the ring + rows area. This is the primary driver of the macro-rows regression.

---

## 5. "17.54% Floor" Claim — NOT VALID AS STATED

### Run progression table

| Run | Commit | Layout | Ring size | Ring structural | Rows structural | Ring status |
|---|---|---|---|---|---|---|
| run-030 | d19d1ad | Original _HeroMacroCard | 220px | 20.17% | 8.93% | FAIL |
| run-031 | d19d1ad | Original _HeroMacroCard | 220px | **17.54%** | 10.52% | FAIL |
| run-032 | bfaba17 | Split card | 270px | 25.15% | 35.11% | FAIL |
| run-033–035 | bfaba17 | Split + OverflowBox | various | 29.80%–33.44% | — | FAIL (worse) |
| run-036 | bfaba17 | Split + Padding(v:20) | 220px | **22.89%** | 19.65% | FAIL |

### Analysis

1. **17.54% was the pre-split original layout's best result** (run-031, commit d19d1ad), not a device-geometry floor. It predates the card split entirely.

2. **The split card (bfaba17) is worse on both ROIs than the pre-split baseline:**
   - macro-ring-hero: 17.54% → 22.89% (+5.35 points, worsened)
   - macro-rows: 10.52% (PASS) → 19.65% (FAIL, +9.13 points, new regression)

3. **Six size iterations against a stable config were not performed.** Runs 032–036 changed both the ring size and the layout approach simultaneously, making attribution unclear.

4. **The "floor due to 402dp mockup vs 360dp device geometry" hypothesis was never confirmed.** It is a plausible cause of persistent structural diff, but the data only shows that the pre-split layout at 220px achieved 17.54%. Whether the split card could ever reach that level has not been tested.

5. **The split card has not been shown to improve or match the original layout** on any ring metric. The best-tested padding approach (run-036, Padding vertical:20) is 22.89%, 5 points worse than the pre-split baseline.

### Conclusion

**Do NOT call 17.54% a device-geometry floor.** It is the pre-split layout's structural diff with animation stabilization. The split card has introduced regressions and no confirmed improvements. The floor claim requires:
- A stable split-card layout that matches or beats 17.54% on ring
- Passing macro-rows (≤15%)
- At least three consecutive runs at the same config to confirm stability

---

## 6. Split Card Change Acceptance Assessment

### What changed (bfaba17)

- `_HeroMacroCard` removed; replaced by `_RingHeroCard` + `_MacroRowsCard`
- `_RingHeroCard`: `Card(margin: zero, clipBehavior: antiAlias, radius: 28)` + `Padding(vertical:20, horizontal:14)` + `AnimatedMacroRing(size:220)`
- `_MacroRowsCard`: `Card(margin: zero, radius: 28)` + `Padding(all:14)` + three `_MacroSubCardItem` children
- 12px spacing between the two cards

### Acceptance decision: **NOT ACCEPTED**

The split card fails on two ROIs, introduces a macro-rows regression that previously passed, and performs worse on the ring metric than the original layout. The structural refactoring has not demonstrated any UI-diff improvement over the pre-split baseline.

The split-card code is committed to `main` (bfaba17) but must not be treated as a verified improvement.

---

## 7. Remaining Macro-Ring Diff — Design Baseline Mismatch or App Defect?

Both causes likely contribute:

| Factor | Evidence |
|---|---|
| Device width mismatch (360dp vs 402dp mockup) | imageSizes: expected 1206px wide, actual source 1080px wide → 11% width difference explains persistent structural offset |
| Ring card geometry change | run-032 with 270px ring increased diff; run-031 at 220px with original layout gave lowest structural diff |
| Split card introduces second card border/background | macro-rows jumped from 10.52% to 19.65% with split |
| Dynamic masks partially mask number areas | dynamicMaskedPercentOfRoi for ring is 12.15% — small mask, does not fully explain 22.89% |

**Working hypothesis:** The 360dp device renders a narrower card than the 402dp mockup expects. Ring centering, padding, and card borders all shift relative to the mockup. This is a baseline mismatch, not purely an app defect — but the app can still be tuned to reduce the gap. The split card approach made this gap larger, not smaller.

---

## 8. Recommended Next Step

**Priority 1 (before any further layout work):** Build and run a single test with the pre-split layout (revert bfaba17 or restore `_HeroMacroCard` in a branch) to confirm run-031's 17.54% is reproducible. This establishes the true regression cost of the split.

**Priority 2:** If the original layout reproduces at ~17.54% and macro-rows stays ≤12%, document the device-geometry gap as a known baseline offset and decide whether to accept it or pursue mockup-side adjustment.

**Priority 3:** If split card is retained, it needs independent layout fixes to:
- Eliminate the macro-rows regression (rows card border/radius must match mockup styling)
- Reduce ring card padding mismatch

**Do not make additional Flutter layout changes until Priority 1 is resolved.**

---

## Appendix: Session History Summary

| Session | Commit | Key change |
|---|---|---|
| S53 (2026-05-31a) | f618426 | Config hardening, seed ordering fix |
| S54 (2026-05-31b) | d19d1ad | Animation stabilization, device profile fix |
| S55–S56 | 156a8ad | Ring split plan written and reviewed |
| S57 | bfaba17 | Split card implemented, runs 032–036, Padding approach reached 22.89% |
| S58 (this report) | — | Verification audit — no code changes |
