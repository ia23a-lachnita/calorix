# UI Diff Session — 2026-05-24b

## MCP Version
mobile-ui-diff MCP (updated branch): supports `allowedDynamicSubregions`, raw vs structural ROI scoring, structural diff artifacts, report.json parity.

## VLM Health Result
- `qwen2.5vl:3b`: installed, load check failed (`Ollama request failed`) — NOT used
- `moondream:latest`: installed, load check passed, image input verified ✓
- **Active VLM this session**: `moondream:latest`
- Config updated to use `moondream:latest` as primary, `qwen2.5vl:3b` as fallback

## Expected Image Used
`docs/mockups/image/dark/single/Today.png` — original full mockup, 1206×2622px

### Today_1080.png status
- **Deleted by user** before this session (was an invalid left-cropped baseline cutting the right edge)
- Removed from `ui-diff.config.json` — confirmed not referenced anywhere in live config
- Not regenerated — correct

## Device / Capture Dimensions
- Actual screenshot: 1080×2400 (Samsung SM-G780G, native)
- Expected image: 1206×2622
- Comparison space: 1206×2622 (actual upscaled by ~11.6% to match)
- **Note**: This scale mismatch inflates diff metrics. All pixel coordinates in ROI results are in 1206×2622 space.

## preCapture Reseed
Both preCapture commands executed successfully (`ok: true`):
1. `am start -a android.intent.action.VIEW -d calorix://debug/reseed` → triggered
2. `sleep 5` → wait for Firestore commit and Today render

Seeded data confirmed in actual screenshot:
- 1,420 kcal eaten, of 2,400 target
- 980 kcal left
- Protein 96g / 170g (56%)

## Run-018 Results

| Metric | Value |
|---|---|
| Run name | run-018 |
| Global diff | 17.08% |
| Global threshold | 14% |
| Global status | **FAIL** |
| qualityStatus | **pass** |
| qualityFailures | none |
| Delta vs run-017 | +1.18% (worsened — expected image is larger now) |

### ROI Results

| ROI | rawDiff | structuralDiff | dynamicMasked | Status |
|---|---|---|---|---|
| macro-ring-hero | 22.91% | 19.52% | 14.19% | FAIL |
| macro-rows | 26.87% | 29.26% | 40.02% | FAIL |
| meal-cards | 14.36% | 8.23% | 70.05% | PASS ✓ |

## Expected Image Validity
**Yes — Today.png (1206×2622) is valid and complete.** The expected crop for macro-ring-hero shows the full header, ring, center text, and "980 kcal left" pill. The expected crop for macro-rows shows the correct ring bottom + Protein row card. No missing right edge or cropping artifacts.

## Corrected Macro Ring Diagnosis

### What the artifacts show

**macro-ring-hero-expected.png**: Ring arcs are moderately thick, positioned in the upper-right of the hero card. Ring bottom sits near the bottom of the ROI. Arc endpoints and gap are visible.

**macro-ring-hero-actual.png**: Ring appears similar in arc shape but the overall card content is more compact/smaller — "980 kcal left" is cut off at right edge of crop. This is partly explained by the 11.6% scale mismatch.

**macro-rows-expected.png**: Shows only the very bottom edge of the ring (small blue arc) + full Protein row card with `96 / 170g · 56%` progress bar.

**macro-rows-actual.png**: Shows **large ring arcs (blue/cyan/green with strong glow)** filling most of the ROI top area. Protein row is barely visible at bottom edge. The ring arcs in actual are thick, glowy, and extend significantly lower than in the mockup.

### Corrected diagnosis: Ring is too large / too glowy, not too small

**The prior run-017 "AnimatedMacroRing too small/thin" conclusion was WRONG.** It was derived from an invalid expected image (Today_1080.png was left-cropped, losing the right side of the mockup), causing incorrect geometry in the comparison.

The correct finding from run-018:

- The actual `AnimatedMacroRing` extends **lower on screen** than the mockup intends
- The ring's radius is **too large** or the card is **too tall**, causing the ring bottom to overflow into the macro-rows zone
- The arc **stroke width** and **glow/shadow radius** in actual appear thicker/larger than mockup
- This is consistent with the user's visual observation: "the Android actual ring appears larger/thicker/glowier than the mockup"

### Macro Rows diagnosis
The macro-rows structural diff (29.26%) is **caused by the oversized ring**, not by independent macro-row layout bugs. The ring bottom intrudes into the macro-rows ROI, filling it with arc pixels where the mockup shows empty card background + Protein row.

### Meal Cards
Structurally passing at 8.23% after dynamic masking. Card layout and structure are correct.

## Scale Mismatch Note
The 11.6% scale difference (1080 actual → 1206 expected) means:
- All diff percentages are inflated by interpolation artifacts
- Coordinates in actual space should be divided by 1.116x to map back to device pixels
- ROI boundaries in report are in 1206×2622 mockup space
- True structural comparison requires matching resolutions or the MCP's scale-aware comparison

A properly scaled expected image would reduce noise. Consider generating a 1080×2400 version of Today.png by **proportional downscale** (not crop) for future runs, or configure `appContentBounds` to help the MCP anchor the comparison correctly.

## Flutter Changes Made
**None** — diagnosis corrected from prior session. No layout changes made this session.

## Next Actions

### HIGH priority — Ring size/stroke/glow reduction
- Locate `AnimatedMacroRing` widget in Flutter code
- Reduce ring `radius` or containing `SizedBox`/`Container` height so the bottom arc matches mockup position
- Reduce `strokeWidth` if arcs are thicker than mockup
- Reduce BoxShadow/Paint blur radius if glow is stronger than mockup
- Direction: **reduce, not increase** (opposite of run-017 recommendation)

### MEDIUM priority — Macro rows
- After ring fix, re-run diff — macro rows may self-correct if ring no longer overflows into that zone
- If still failing, inspect macro-rows structural diff for independent layout bugs

### LOW priority — Scale baseline
- Consider creating a proportionally-scaled 1080×2400 expected image (downscale Today.png, not crop)
- This would eliminate the 11.6% comparison noise and make ROI coordinates directly usable in device space

## Commit Status
Config changes committed in this session:
- `ui-diff.config.json`: expectedImage → Today.png, VLM → moondream:latest, ROIs with allowedDynamicSubregions added
- No Flutter code changes made
