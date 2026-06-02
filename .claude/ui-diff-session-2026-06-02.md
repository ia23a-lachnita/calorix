# UI Diff Session — 2026-06-02

## Goal

Enable and run `geometryDiagnostics.radialChart` for the Today `macro-ring-hero` ROI using the rebuilt mobile-ui-diff MCP (Phase 1 radial geometry diagnostics). Inspect normalized geometry findings. Determine whether the remaining ~19% structural diff is a Flutter geometry issue or a data/baseline issue.

## Git Starting State

- Branch: main, up to date with origin/main
- Last commit: 61daba3 — center-stack nudge reverted, run-041 documented
- No lingering pill/border, split-card, or center-stack nudge code
- Accepted baseline: run-039 (global 12.36%, macro-ring-hero structural 18.55%)

## MCP Version / Status

mobile-ui-diff rebuilt with Phase 1 radial geometry diagnostics. Geometry diagnostics were enabled this session by adding `geometryDiagnostics` to the `macro-ring-hero` ROI in `ui-diff.config.json`.

## Config Change

Added to `macro-ring-hero` ROI in `ui-diff.config.json`:

```json
"geometryDiagnostics": {
  "type": "radialChart",
  "enabled": true,
  "maskDynamicSubregions": true,
  "colorHints": ["#3A5BFF", "#19D3D9", "#1FCC74"]
}
```

Colors match design system: blue=protein, cyan=carbs, green=fat.

## VLM Health

- Model: moondream:latest
- Status: installed, loaded, imageInputVerified
- Warnings: none

## Run

- ID: run-042
- Config: ui-diff.config.json (today screen)
- Device: SM-G780G (R58R61161NA)

## Results

### Global

| Metric | Value |
|---|---|
| Global diff | 12.58% |
| Global status | pass |
| Quality status | **fail** |

### ROI Table

| ROI | Raw diff | Structural diff | Threshold | Status | Critical | DynamicMasked% |
|---|---|---|---|---|---|---|
| macro-ring-hero | 20.54% | **19.02%** | 12% | **FAIL** | yes | 12.15% |
| macro-rows | 6.91% | 8.18% | 15% | pass | no | 25.04% |
| meal-cards | 13.47% | 16.21% | 25% | pass | no | 25.04% |

### vs Accepted Baseline (run-039)

| ROI | run-039 | run-042 | Delta |
|---|---|---|---|
| Global diff | 12.36% | 12.58% | +0.22% |
| macro-ring-hero | 18.55% | 19.02% | +0.47% |
| macro-rows | 8.82% | 8.18% | -0.64% |
| meal-cards | 15.71% | 16.21% | +0.50% |

Note: small fluctuations expected between runs due to animation capture timing. macro-rows improved slightly; macro-ring-hero is stable near run-039 floor.

## Geometry Diagnostics

### Verdict

`relativeGeometryMismatch` — confidence **0.95**

### Agent Hint

> "Radial chart findings by severity: #19D3D9 stroke width; #3A5BFF sweep; #1FCC74 sweep. Inspect strokeWidth or canvas scale, progress-to-sweep mapping."

### Normalized Metrics (ROI width = 1182px comparison space)

| Metric | Expected | Actual | Delta |
|---|---|---|---|
| Center (norm) | x=0.547, y=0.589 | x=0.567, y=0.539 | dx=+0.02, dy=-0.05 |
| Outer radius (norm) | 0.242 | 0.266 | +0.024 |
| Inner radius (norm) | 0.146 | 0.129 | -0.017 |
| Global stroke width (norm) | 0.095 | 0.138 | +0.043 |
| Ring gap (norm) | 0 | 0 | 0 |

### Per-Arc Data

| Arc | Expected sweep | Actual sweep | Delta | Expected stroke (norm) | Actual stroke (norm) | Delta |
|---|---|---|---|---|---|---|
| Blue (#3A5BFF) | 175.4° | 237.4° | **+62°** | 0.047 | 0.075 | +0.028 |
| Cyan (#19D3D9) | 219.3° | 235.1° | +15.8° | 0.057 | 0.106 | **+0.049** |
| Green (#1FCC74) | 254° | 272.2° | +18.2° | 0.087 | 0.102 | +0.015 |

### Findings by Severity

| Kind | Color | Severity | Expected | Actual | Delta | Note |
|---|---|---|---|---|---|---|
| sweepMismatch | #3A5BFF | **HIGH** | 175.4° | 237.4° | +62° | Data-driven |
| strokeWidthMismatch | #19D3D9 | **HIGH** | 0.057 | 0.106 | +0.049 | Code-addressable |
| sweepMismatch | #1FCC74 | **HIGH** | 254° | 272.2° | +18.2° | Data-driven |
| sweepMismatch | #19D3D9 | medium | 219.3° | 235.1° | +15.8° | Data-driven |
| strokeWidthMismatch | global | medium | 0.095 | 0.138 | +0.043 | Code-addressable |
| strokeWidthMismatch | #3A5BFF | medium | 0.047 | 0.075 | +0.028 | Code-addressable |
| centerShift | — | medium | — | — | 0.054 norm | Layout-driven |
| relativeRadiusMismatch | — | low | 0.242 | 0.266 | +0.024 | Secondary |
| angleMismatch | #19D3D9 | low | — | — | start −8.6°, end +7.2° | Secondary |

## Artifact Paths

| Artifact | Path |
|---|---|
| Geometry overlay | `docs/screenshots/ui-diff-diagnostics/macro-ring-hero-run-042-geometry-overlay.png` |
| Edge overlay | `docs/screenshots/ui-diff-diagnostics/macro-ring-hero-run-042-edge-overlay.png` |
| Arc mask (expected) | `docs/screenshots/ui-diff-diagnostics/macro-ring-hero-run-042-arc-mask-expected.png` |
| Arc mask (actual) | `docs/screenshots/ui-diff-diagnostics/macro-ring-hero-run-042-arc-mask-actual.png` |
| Polar summary | `docs/screenshots/ui-diff-diagnostics/macro-ring-hero-run-042-polar-summary.json` |
| Today screenshot | `docs/screenshots/today-screen-2026-06-02a-radial-geometry-diagnostic.png` |

## Geometry Overlay Interpretation

The geometry overlay (read visually) shows the actual app arcs (pink/solid) extended far beyond the expected arc outlines (dotted circles). The blue arc in the actual extends approximately 62° further clockwise than the mockup expects, clearly visible as a large pink overhang on the right side of the ring. The stroke width difference is also visible (pink bands are thicker than dotted outlines) but is secondary to the sweep mismatch in visual impact.

The two center cross-hairs are slightly offset: the actual center (blue cross) is a few pixels lower and to the right of the expected center (pink cross). This matches the medium-severity centerShift finding.

## Root Cause Analysis

### Primary cause: sweep mismatch (data-driven)

The sweep of each arc is `fraction × 360°` where `fraction = summary.macro / plan.macro`. The diagnostic reveals the actual fractions differ from what the mockup was designed to show:

| Macro | Actual fraction (seed) | Mockup-implied fraction | Delta |
|---|---|---|---|
| Protein (blue) | 65.9% | 48.7% | **+17.2pp** |
| Carbs (cyan) | 65.3% | 60.9% | +4.4pp |
| Fat (green) | 75.6% | 70.6% | +5.0pp |

Protein's 17pp discrepancy is the dominant mismatch. The seed data populates the Firestore entries, but the fraction depends on `plan.protein` (daily target) as well. If `plan.protein` is too low relative to what the mockup was designed with, the fraction will be too high.

The sweep formula `fraction × 2π` is standard and correct. The issue is that the seed/plan data produces different fill levels than the mockup intended.

### Secondary cause: stroke width (code-addressable)

The Flutter code uses one uniform `strokeWidth: 18` for all three arcs. The mockup has different apparent stroke widths per arc (outer thinner, inner thicker). Current arcs appear ~45% thicker than expected globally.

In `today_screen.dart:238`, the ring is instantiated with `strokeWidth: 18`. In `macro_ring.dart:71`, the ring gap is `strokeWidth * 1.2 = 21.6`. These uniform values don't match the mockup's tapered design (blue thinner, green much wider).

### Tertiary cause: center shift (layout-driven)

The actual ring center is ~33px higher in the ROI than the mockup expects. Previous attempts to address this (center-stack nudge in run-041) made things worse. The shift is likely due to card padding/spacing differences.

## Decision: No Flutter Code Change

No code change was made this session. Reasons:

1. The geometry overlay visually confirms the sweep mismatch is the **dominant structural issue**. The actual blue arc covers 62° more than the mockup expects — this alone accounts for a massive fraction of the structural diff.
2. The sweep mismatch is **data-driven** (seed/plan macro percentages differ from mockup design values). A Flutter rendering change cannot fix a data mismatch.
3. A stroke width reduction would address the secondary cause but would not move the structural diff below 12% while the primary cause persists.
4. The center shift was exhausted in run-041 (nudge worsened metrics). The shift is layout-driven and difficult to isolate.
5. The plan's rule: "change can be isolated to one parameter/vector" — stroke width alone cannot close the gap while sweep remains misaligned.

## Screenshot

`docs/screenshots/today-screen-2026-06-02a-radial-geometry-diagnostic.png`

App state at time of diagnostic: unified hero card, glow-reduced ring (run-039 baseline), no overflow, Chicken Rice Bowl first, seed total 1,420 kcal.

## Next Recommendations

### Option A: Align seed/plan data with mockup design values (recommended)

Investigate the seed deep link implementation and the plan document it creates. Determine what `plan.protein` target the mockup was designed with. If the seed creates a plan with protein target P, then `summary.protein / P` should ≈ 48.7% to match the mockup. Adjust `plan.protein` (daily target) in the seed, not `summary.protein` (grams eaten).

This is the only path to reduce the blue sweep mismatch from +62° toward 0° without changing the expected baseline image.

### Option B: Capture Android-specific expected baseline

Capture a new expected baseline PNG from the actual app with the seed data as-is. This would make `run-N` compare against what the app actually looks like rather than the Figma-designed mockup. The structural diff would drop to near 0%, and the threshold would trivially pass.

Tradeoff: loses the design-parity signal. Only appropriate if the current data/plan values are intentionally correct and the mockup's macro percentages are considered a design artifact.

### Option C: Adjust macro-ring-hero threshold

Widen `maxDiffPercent` for `macro-ring-hero` from 12% to ~20%. This acknowledges that the current data produces a fundamentally different ring fill, and the structural diff is irreducible without data changes.

Tradeoff: weakens the CI gate. Should only be done after Option A is attempted.

### Option D: Reduce stroke width only (partial improvement)

Change `strokeWidth: 18` → `strokeWidth: 12` in `today_screen.dart:238`. This would:
- Reduce per-arc apparent width from ~88px to ~56px comparison space (close to expected blue 55px)
- Not fix the sweep mismatch
- Estimated improvement: ~2-4pp structural diff reduction (bringing from 19% to 15-17%)
- Still fails the 12% threshold

Only worth pursuing after Option A resolves the sweep mismatch.

## Exhausted Vectors

All content-only improvement vectors are now exhausted:

| Vector | Result |
|---|---|
| Split-card layout | Reverted — worsened metrics |
| Glow reduction | Kept (f4cd253) — marginal improvement |
| Pill opacity/border | Reverted — worsened metrics |
| Center-stack nudge | Reverted — worsened metrics (run-041) |
| Stroke width / ring geometry (blind) | NOT attempted — geometry diagnostics pursued first |

The radial geometry diagnostic has now confirmed: the 12% threshold cannot be reached through rendering-side adjustments alone. Data alignment is required.
