# UI Diff Session — 2026-05-23c (Run-014)

## What Was Tested
Today screen diff (run-014) on a physical Samsung Galaxy S20 FE device (SM G780G)
using the dark design mockup with VLM analysis enabled (moondream:latest).

## VLM Health Result
**Status: OK** — moondream:latest loaded and operational (fallback from qwen2.5vl:3b which
takes ~80s and timed out at 90s in this run). VLM analysis ran on top-priority regions.

## Global Status: PASS
- diffPercent: 10.15% (threshold 14%) ✅
- diffPixels: 320,964 of 3,162,132 total
- delta vs run-013: −72.8% (−2,302,090 pixels) — massive improvement

## Quality Status: FAIL (one non-actionable ROI)
| ROI | Diff | Threshold | Status |
|---|---|---|---|
| macro-ring (hero kcal card) | 10.83% | 20% | ✅ pass |
| macro-rows (protein/carbs/fat) | 18.82% | 15% | ❌ fail |
| meal-cards | 10.59% | 30% | ✅ pass |

## Root Causes Found and Fixed This Session

### 1. Dark mode vs light mockup (was 83% diff → fixed)
Previous config used `docs/mockups/image/light/single/Today.png`. The app runs in dark mode
on this device. Switched expectedImage to the dark mockup.

### 2. Samsung Edge Panel adds 126px to screenshot width (was causing full-screen mismatch)
The SM G780G screenshots come out at 1206×2622px (not 1080×2400). The extra 126px is the
Samsung Edge Panel handle visible on the right side. Added an ignore region:
`{ x: 1080, y: 0, width: 126, height: 2622, type: system, coordinateSpace: actual }`

### 3. Ignore regions now use coordinateSpace: actual throughout
Consolidated all ignore regions to use `coordinateSpace: actual` so coordinates match
the phone's actual pixel space (1206×2622) rather than the expected/mockup space.

## Remaining Issues

### macro-rows ROI: 18.82% (threshold 15%) — non-actionable data variance
The protein/carbs/fat rows show 0g bars (no food logged today). The dark mockup shows
filled bars at a specific percentage. This diff is 100% data-driven, not a styling bug.
**Recommendation**: raise `maxDiffPercent` for this ROI to 0.25, or add the macro-rows
area as a `data` type ignore region in the config.

### VLM: moondream used as fallback (qwen2.5vl:3b timed out at 90s)
qwen2.5vl:3b consistently fails to load within the 90s timeout in this session.
moondream:latest is the reliable model for now. Consider raising timeoutMs to 120000
for 3b, or accepting moondream as primary.

### 4 VLM regions skipped (maxVlmRegions=4 reached early)
moondream only analysed the first 4 priority regions before the budget was exhausted.
Regions 5–20 show `analysisStatus: skipped`. Not a blocking issue.

## Config Changes Made This Session
- `expectedImage`: light → dark mockup
- `ignoreRegions`: added Samsung Edge Panel strip (x=1080, w=126, full height)
- `ignoreRegions`: all entries now use `coordinateSpace: actual`
- `ignoreRegions`: nav bar width updated to 1206 (full actual width)
- `vlm.timeoutMs`: 60000 → 90000 (for qwen2.5vl:3b warm-up time)
- `vlm.model`: qwen2.5vl:3b (primary), moondream (fallback)

## VLM Analysis Highlights
- region-001 (header): "9:41 Today" — time/date data variance, expected
- region-003 (MacroRing): "kbal eaten" — ring arc data variance (0 kcal vs mockup)
- region-013 (meal card): "Chicken Rice Bowl" — live meal vs mockup fixture

## MCP / Tooling Notes
- Phone (SM G780G) screenshots are 1206×2622px; add device config per phone model if needed
- preCapture ADB tap coordinates need to be calibrated per device (emulator coords don't transfer)
- moondream:latest is the reliable VLM; qwen2.5vl:3b needs >90s to load reliably
- Emulator (Api35_NoPlay) is preferred for repeatable diffs; phone introduces device-specific
  variables (Edge Panel, screen size, system UI differences)
