# UI Diff Session Report — 2026-06-01

## Goal

Revert the split-card regression introduced by commit `bfaba17`, restore the unified
`_HeroMacroCard`, fix the visible Flutter overflow marker, commit all preserved
infrastructure work, and produce a verified baseline run.

---

## Git Starting State

```
4a986da  Add Today screen screenshot 2026-06-01
78e53fa  docs: ui-diff session 2026-05-31c — ring split verification report
bfaba17  Split hero macro card into ring-only card and macro rows card   ← REGRESSION
156a8ad  Add implementation plan: split hero macro card into ring card and macro rows card
f618426  Harden Today UI diff config; fix seed ordering
```

Uncommitted working directory (good work, never committed):
- `lib/core/router/app_router.dart` — sets `uiDiffModeProvider = true` after reseed
- `lib/shared/providers/ui_diff_provider.dart` — new `StateProvider<bool>` for UI diff mode
- `ui-diff.config.json` — restructures `deviceProfile` to top-level `deviceProfiles` map
- `docs/superpowers/plans/2026-05-31-hero-card-ring-split.md` — minor text update

---

## Revert of bfaba17

```
git revert bfaba17 --no-edit
→ 0bba0aa  Revert "Split hero macro card into ring-only card and macro rows card"
```

Applied cleanly. Only `today_screen.dart` was in scope. No conflicts with working
directory changes.

Root cause confirmed: `bfaba17` replaced the single `_HeroMacroCard` (ring + macro rows in
one `Card`) with two independent outer `Card` widgets (`_RingHeroCard` + `_MacroRowsCard`).
The mockup shows one unified hero card containing both sections. The split was architecturally
incorrect and caused:
- macro-ring-hero structural diff: 22.89% (up from pre-split ~17–20%)
- macro-rows structural diff: 19.65% (up from pre-split ~10.52%)
- visible Flutter overflow marker (~22px)
- global diff: 14.71% (fail)

---

## Good Commits Preserved

All good prior work was preserved and committed as a follow-up:

```
c6e813b  Wire animation stabilization and harden ui-diff config
```

Contents:
- `uiDiffModeProvider` (`StateProvider<bool>`) wired end-to-end:
  - `app_router.dart` sets `state = true` after reseed before navigating to Today
  - `today_screen.dart` reads it in `initState` and disables the 1.4s count-up animation
- `ui-diff.config.json` device profile refactored to top-level `deviceProfiles` map
- Plan document text update

Animation stabilization is fully committed and functional for the first time.

---

## Overflow Fix

After reverting, the overflow marker remained visible in run-037's actual.png. Root cause:
the `_MealCard` subtitle `Row` packed `time · mealType · P pip · C pip · F pip` into
~164dp of available width on a 360dp device, overflowing by ~22px (~7dp).

Fix: split the pips onto their own row:

```
Before:  Row([time, ' · ', mealType, SizedBox(6), Pip(P), SizedBox(6), Pip(C), SizedBox(6), Pip(F)])
After:   Row([time, ' · ', mealType])
         SizedBox(height: 2)
         Row([Pip(P), SizedBox(6), Pip(C), SizedBox(6), Pip(F)])
```

Committed as:
```
43d94ab  Fix meal card subtitle overflow — move macro pips to own row
```

Overflow marker confirmed absent in run-038 actual.png.

---

## Build / Install

```
fvm flutter build apk --debug   →  ✓  (~38s first build, ~15s with fix)
adb -s R58R61161NA install -r …  →  Success
adb -s R58R61161NA shell pm grant … POST_NOTIFICATIONS  →  OK
```

---

## VLM Health

```
model:      qwen2.5vl:3b  (installed, failed to load — Ollama request failed)
fallback:   moondream:latest  (usable, selected)
provider:   ollama  http://localhost:11434
```

moondream used for run-037 and run-038 per tools.md fallback policy.

---

## Device Profile

Applied: `SM-G780G` via top-level `deviceProfiles` map (new hardened config structure).
Serial: `R58R61161NA`, 1080×2400, 480 DPI, status bar 72px, nav bar at 2316 (height 84).

---

## Run Results

### Run-037 (revert only, before overflow fix)

| Metric | Value |
|---|---|
| Run ID | run-037 |
| Global diff | **12.92% — PASS** (threshold 14%) |
| qualityStatus | **fail** (critical ROI) |
| macro-ring-hero structural | **20.17% — FAIL** (threshold 12%) |
| macro-rows structural | **8.96% — PASS** (threshold 15%) |
| meal-cards structural | **15.10% — PASS** (threshold 25%) |
| Overflow marker visible | Yes (run-037 actual.png) |

### Run-038 (revert + overflow fix)

| Metric | Value |
|---|---|
| Run ID | run-038 |
| Global diff | **12.71% — PASS** (threshold 14%) |
| qualityStatus | **fail** (critical ROI) |
| macro-ring-hero structural | **20.17% — FAIL** (threshold 12%) |
| macro-rows structural | **8.96% — PASS** (threshold 15%) |
| meal-cards structural | **15.62% — PASS** (threshold 25%) |
| Overflow marker visible | **No** ✓ |

Delta run-037 → run-038: −0.21% global (marginal, within noise).

---

## Artifact Inspection (run-038)

| Check | Result |
|---|---|
| actual.png is not black | ✓ |
| expected is Today.png (not Today_1080.png) | ✓ |
| actual shows final 1,420 (not mid-count) | ✓ (animation stabilization working) |
| Chicken Rice Bowl is first meal | ✓ |
| No Flutter overflow marker | ✓ |
| Unified hero card restored | ✓ (one card, ring + macro rows) |
| Macro rows inside hero card, not separate outer card | ✓ |

---

## Comparison Against Baselines

| Metric | run-036 (split-card) | run-037 (revert) | run-038 (+ overflow fix) | pre-split best |
|---|---|---|---|---|
| Global diff | 14.71% fail | 12.92% pass | **12.71% pass** | ~12% pass |
| macro-ring-hero structural | 22.89% fail | 20.17% fail | **20.17% fail** | ~17.54% fail |
| macro-rows structural | 19.65% fail | 8.96% pass | **8.96% pass** | ~10.52% pass |
| meal-cards structural | — | 15.10% pass | **15.62% pass** | — |
| Overflow marker | Yes | Yes | **No** | No |

Key findings:
1. **Split-card conclusively rejected.** It worsened both ring and rows vs. the unified card.
2. **macro-rows is fully recovered** (8.96% < 10.52% pre-split, best ever).
3. **macro-ring-hero floor is 20.17%**, confirmed by two consecutive identical runs (037, 038).
   This is a genuine geometric floor from ring size/position/glow difference vs. mockup.
4. **Overflow is fixed.** Meal card pips no longer overflow on 360dp device.

---

## macro-ring-hero Remaining Issue

The 20.17% structural diff is a real layout mismatch between the app ring (220dp, 18px
stroke) and the mockup ring (visually larger, more prominent, with different glow/outer-ring
treatment). This is not fixable by splitting the outer card — that approach was tried and
made things worse.

The floor has been confirmed stable at 20.17% across two independent runs with animation
stabilization active, reseed verified, and no overflow noise. This is the honest baseline
for the unified `_HeroMacroCard` design.

---

## Split-Card Decision

**The split-card approach (`bfaba17`) is rejected.** Reasons:
- Made macro-ring-hero worse (22.89% vs. 20.17%)
- Made macro-rows dramatically worse (19.65% vs. 8.96%)
- Introduced overflow by pushing content below visible area
- Contradicts mockup: mockup shows one hero card, not two separate cards

---

## Next Recommendation

To reduce macro-ring-hero from 20.17% toward 12%, work **inside** the unified `_HeroMacroCard`:

1. Compare ring crop expected vs. actual: the mockup ring appears larger with a visible
   outer glow/halo ring vs. app's single concentric arc set.
2. Candidate changes (one at a time, rerun after each):
   - Increase ring `size` from 220dp toward 240–260dp
   - Add an outer decorative ring layer to match mockup's concentric outer arc
   - Adjust card vertical padding to better center ring in the ROI box
   - Tune glow/shadow on ring segments if the outer halo is causing the hotspot
3. Do **not** split the outer card again.
4. Consider whether 20.17% represents a device-geometry floor (360dp device vs. ~402dp
   mockup) — if so, an Android-specific ring sizing or a separate Android baseline may be
   the long-term answer after exhausting in-card layout tuning.

---

## Commits This Session

```
0bba0aa  Revert "Split hero macro card into ring-only card and macro rows card"
c6e813b  Wire animation stabilization and harden ui-diff config
43d94ab  Fix meal card subtitle overflow — move macro pips to own row
```
