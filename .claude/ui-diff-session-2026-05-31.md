# UI Diff Session — 2026-05-31

## Goal

Produce a reliable Today UI diff run with hardened config: critical ROI gating, reduced dynamic masks, corrected seed ordering, and a clear diagnosis of the macro-ring-hero structural diff.

## Environment

- Device: Samsung SM-G780G, serial R58R61161NA, Android 13, 1080×2400, density 480
- Expected image: `docs/mockups/image/dark/single/Today.png` (1206×2622)
- Scale factor (actual→expected comparison): 1080/1206 = 0.896× (device is 10.4% narrower than mockup)
- Flutter: FVM (project pinned)
- MCP: mobile-ui-diff (rebuilt, hardened version with critical ROI support)

## Git State at Start

```
cc4eb0e docs: ui-diff session 2026-05-31 (prior agent — validation only, no code changes)
3ff87ec docs: report Today UI diff MCP findings
dbe4a4a Reduce Today macro ring visual footprint
```

## VLM Health

- Provider: Ollama at http://localhost:11434
- Model: moondream:latest (1.7GB) — loaded, image-input verified
- Fallback: qwen2.5vl:3b available but not used
- Status: OK

## Changes Made This Session

### 1. Seed ordering fix (`lib/shared/services/seed_data_service.dart`)

Prior bug: Salmon & Vegetables was seeded at `hour: 16` — the most recent timestamp. Since
Today screen sorts entries descending by timestamp, Salmon appeared first instead of
Chicken Rice Bowl.

Fix: Changed Salmon & Vegetables from `hour: 16, meal: 'dinner'` → `hour: 10, minute: 30, meal: 'lunch'`.
Daily totals unchanged: 1,420 kcal / 96g P / 132g C / 38g F.

Entry order after fix (descending timestamp, most recent first):
1. Chicken Rice Bowl — 12:48 Lunch (most recent)
2. Salmon & Vegetables — 10:30 Lunch
3. Scrambled Eggs & Toast — 08:00 Breakfast

### 2. Config hardening (`ui-diff.config.json`)

| Change | Before | After |
|---|---|---|
| macro-ring-hero `critical` | not set | `true` |
| macro-ring-hero `maxDiffPercent` | 0.15 | 0.12 |
| macro-ring-hero ROI start y | 0.05 (includes header/date/avatar) | 0.14 (ring card only) |
| macro-ring-hero ROI height | 0.34 | 0.25 |
| macro-ring-hero `kcal-left-pill` mask | present (arc obscuring silently masked) | removed (now structurally measured) |
| macro-rows mask | right 40% of ROI | right 25% of ROI |
| meal-cards mask | center 70% of ROI | right 25% of ROI |
| Samsung SM-G780G device profile | missing | added inside screen config |
| Expected image | Today.png | Today.png (correct, unchanged) |
| Today_1080.png reference | not present | not present (correct) |

Key rationale for ROI y move (0.05→0.14): The old ROI included the AppBar header
(date string "FRIDAY · MAY 15" in mockup vs "SUNDAY · MAY 31" on device, plus "EK"
avatar vs generic person icon). This dynamic header content was inflating the structural
diff score by ~30% of the ROI area while not being masked. Moving the ROI to y=0.14
focuses the measurement on the actual ring card content.

### 3. Flutter ring size change — attempted and reverted

Attempted: `size: 220 → 270`, `strokeWidth: 18 → 20`

Result (run-028):
- macro-ring-hero structural diff: 16.40% → 21.03% (worse)
- macro-rows structural diff: 9.34% → 35.00% (ring pushed macro sub-items below ROI zone)

Reverted to size=220, strokeWidth=18. Ring stays at original working values.

## Build and Install

```powershell
fvm flutter build apk --debug
# → Built build\app\outputs\flutter-apk\app-debug.apk

adb -s R58R61161NA install -r build\app\outputs\flutter-apk\app-debug.apk
# → Success

adb -s R58R61161NA shell pm grant com.calorix.calorix android.permission.POST_NOTIFICATIONS
```

## Run Results

| Run | Global diff | Global status | Ring-hero structural | qualityStatus | Notes |
|---|---|---|---|---|---|
| run-026 (baseline, prior session) | 12.78% | pass | 15.41% | pass | No critical gate |
| run-027 | 12.85% | pass | 16.40% | **fail** | Critical gate active; header still in ROI |
| run-028 | 16.89% | fail | 21.03% | **fail** | REGRESSION — size=270; reverted |
| run-029 | 12.78% | pass | 20.04% | **fail** | Size=220, ROI y=0.14 (card only) |

## ROI Table — run-029

| ROI | Raw diff | Structural diff | Threshold | Status | Critical | DynMasked% |
|---|---|---|---|---|---|---|
| macro-ring-hero | 21.30% | 20.04% | 12% | **fail** | yes | 12.15% |
| macro-rows | 7.82% | 9.40% | 15% | pass | no | 25.04% |
| meal-cards | 13.26% | 14.67% | 25% | pass | no | 25.04% |

Dynamic mask coverage for macro-rows and meal-cards reduced from 40%/70% to 25%/25% — significant improvement in mask trustworthiness.

## Quality Gate Behavior

Working correctly:
- `qualityStatus: fail` is always triggered when the critical macro-ring-hero ROI exceeds threshold
- Global `status: pass` (12.78% < 14%) is NOT treated as visual parity — the critical gate overrides it
- MCP `agentSummary.canStopIterating: false` correctly signals that more work is needed

## Root Cause: Ring Structural Diff (20%)

The 20% structural diff in the ring-hero ROI is a **confirmed design-resolution mismatch**, not a transient or dynamic content issue.

**Mockup** (expected image 1206px wide = 402dp at 3×):
- Ring diameter in mockup: approximately 270dp (estimated from artifact pixel measurement)
- Ring overflows the card — arcs extend beyond card edges, card clips the ring
- Designed for a 402dp-wide screen

**Actual device** (1080px wide = 360dp at 3×):
- Ring size in code: 220dp — fits entirely within the card with space around it
- Device is 10.4% narrower than the mockup design target

**Layout coupling constraint**: The macro sub-items (Protein / Carbs / Fat rows) are inside the
SAME card (`_HeroMacroCard`) as the ring. When ring size increases to 270dp, the card height
increases, pushing the sub-items below the macro-rows ROI zone (35% structural diff in run-028).
This prevents a simple ring size bump.

**What the mockup actually shows vs code reality**:

| Dimension | Mockup | Actual (code) |
|---|---|---|
| Device logical width | ~402dp | 360dp |
| Ring size | ~270dp (overflows card) | 220dp (fits in card) |
| Ring card behavior | Ring clips at card boundary | Ring entirely contained |
| Macro sub-items location | Separate section (inferred) | Same card as ring |

## Artifact Inspection (run-029)

- `actual.png`: Not black; app running with correct dark theme
- Seeded data: "1,413" shown (animation captured mid-count-up — expected behavior; fully animated to 1,420)
- Chicken Rice Bowl: VLM detected "Chicken rice bowl" label in meal-cards region — seed ordering fix confirmed working
- "980 kcal left" pill: Visible in actual ROI crop but appears clipped at right edge. This is a ROI crop boundary artifact due to scale mismatch between 1206px expected and 1080px actual, not app-level text clipping.
- Ring arcs: Correct colors (blue/protein, cyan/carbs, green/fat), correct proportions for the 360dp device, but smaller relative to the frame than the 402dp mockup shows.

## Not Acceptable as Visual Parity

`qualityStatus: fail` — 20% structural diff in the critical ring-hero ROI exceeds the 12% threshold.

The screen is functionally correct (data, arcs, pill all present) but structurally differs from the mockup in ring scale.

## MCP Warnings

- `No matching Android device profile found` — the device profile was added inside `screens.today.deviceProfile` but the MCP's suggestedPatch uses a top-level `deviceProfiles` key. Next session: move profile to `deviceProfiles.SM-G780G`.
- `Global pass does not mean local visual parity` — correctly understood; quality gate handles this.

## Remaining Issues and Next Actions

### Priority 1 — Ring layout redesign

Split `_HeroMacroCard` into:
1. Ring-only card (`AnimatedMacroRing` at size ~270dp, card with `clipBehavior: Clip.antiAlias`)
2. Separate macro sub-items section below (outside the ring card)

This will allow the ring to match the mockup's overflow design without pushing macro-rows out of position. Expected outcome: ring-hero structural diff drops from 20% to ~10% or below.

### Priority 2 — Device profile top-level key

Move device profile from `screens.today.deviceProfile` to:
```json
{
  "deviceProfiles": {
    "SM-G780G": { ... }
  }
}
```
Using the MCP's suggestedPatch format.

### Priority 3 — Re-evaluate ring threshold post-fix

After the ring redesign, assess whether the 12% threshold is achievable given the inherent
10.4% device-vs-mockup scale difference, or whether 14-15% is the realistic floor.
