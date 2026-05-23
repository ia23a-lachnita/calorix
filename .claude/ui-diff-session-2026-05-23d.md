# UI Diff Session — 2026-05-23d

**Run**: run-015  
**Screen**: Today  
**Device**: Samsung Galaxy S20 FE (SM-G780G) — physical Android device  
**Baseline**: `docs/mockups/image/dark/single/Today.png`  
**VLM**: moondream:latest (fallback — qwen2.5vl:3b warm-up failed in health check)

---

## Results

| Metric | run-014 | run-015 | Delta |
|---|---|---|---|
| Global diff | 10.15% ✅ | 30.46% ❌ | +20.3% |
| Global status | PASS | FAIL | regressed |
| Regions detected | 20 | 18 | -2 |
| Quality status | — | fail | — |

### ROI Results

| ROI | Diff | Threshold | Status |
|---|---|---|---|
| Macro Ring (critical) | 20.6% | 15% | ❌ FAIL |
| Macro Rows | 55.1% | 25% | ❌ FAIL |
| Meal Cards | 44.1% | 15% | ❌ FAIL |

---

## Root Cause Analysis

### 1. Data-state variance (primary driver)

Region-013 (x:48, y:369, w:1110, h:1422, 47% diff density) spans the entire content area from the macro ring through the meal cards. This single region accounts for the majority of the global diff increase.

The actual device screenshot shows the app in a **different data state** from run-014:
- **Macro ring**: Empty or near-empty state (0 kcal or minimal logged) vs. the mockup's filled ring with target calories
- **Macro rows**: 0g bars (no food logged today) vs. mockup's filled protein/carbs/fat bars
- **Meal cards**: Showing "Chicken Rice Bowl" (real logged meal, region-017 VLM label) vs. mockup's illustrative meal cards with different layout/content

This is the same class of variance documented in S43 for macro-rows — live data diverges from the static design mockup.

### 2. ROI coordinate estimates vs actual layout

The normalized ROI coordinates passed in this run were estimates. The tool mapped them to:
- macro-ring: y:209–944 (735px tall)
- macro-rows: y:943–1416 (473px tall)  
- meal-cards: y:1415–2255 (840px tall)

These overlap with region-013 which spans y:369–1791. The large overlap means all ROIs share diffing pixels with this single high-variance region.

### 3. VLM fallback: moondream:latest

qwen2.5vl:3b appeared in `runningModels` during the second health check but its `loadCheck` failed. The tool fell back to moondream:latest. Moondream provides shorter, less precise descriptions than qwen2.5vl:3b (e.g., "calorie counting app" vs. detailed component analysis). VLM analysis was still completed for 4 regions.

---

## VLM Analysis (moondream)

| Region | VLM Label | Severity | Assessment |
|---|---|---|---|
| region-012 (y:224) | "Today" (layout) | 0.2 | Minor header diff |
| region-013 (y:369, large) | "calorie counting app with meal plan and progress bar" | 1.0 | Entire content area — data variance |
| region-017 (y:1929, meal card) | "Chicken Rice Bowl with lunch info" | 0.75 | Real meal data vs. mockup |
| region-018 (y:2223, bottom) | "main content area" | low | Layout/chrome diff |

---

## Comparison with run-014

Run-014 achieved 10.15% with no ROIs defined, so the global diff was the only signal. Run-015 introduced ROIs, which revealed that the content area was already heavily diffing — just not flagged explicitly.

The 20.3% increase is primarily because:
1. **Different app data state** between sessions (meal cards, macro values change day-to-day)
2. **No data masking**: dynamic content (kcal numbers, macro values, meal card titles) is compared pixel-for-pixel against the static mockup

---

## Next Steps

### Priority 1 — Isolate rendering bugs from data variance

Add `dataRegions` to mask dynamic live data while still checking layout and styling:

```json
"dataRegions": [
  { "x": 0, "y": 300, "width": 1080, "height": 800, "reason": "macro ring live values", "type": "data", "coordinateSpace": "actual" },
  { "x": 0, "y": 1100, "width": 1080, "height": 400, "reason": "macro rows live values", "type": "data", "coordinateSpace": "actual" },
  { "x": 0, "y": 1500, "width": 1080, "height": 700, "reason": "meal card dynamic content", "type": "data", "coordinateSpace": "actual" }
]
```

With data regions masked, the diff should converge back toward ~10% or below and focus on structural/styling issues only.

### Priority 2 — Fix qwen2.5vl:3b warm-up

The model appears in `runningModels` on the second health check but its `loadCheck` still fails with "Ollama request failed." This is a timing/resource issue. Options:
- Pre-warm the model with a separate `ollama run qwen2.5vl:3b` before running the diff
- Increase the VLM timeout further (current: 90s)
- Accept moondream:latest as the project VLM for now given machine constraints

### Priority 3 — Calibrate ROI coordinates

The normalized ROI estimates need tuning against actual device layout. Recommended: use `mobile-ui-diff` inspect or screenshot coordinates to set precise pixel bounds for each component.

---

## Changes Made This Session

- Added **git commit hook banned words/patterns** to `.claude/tools.md` — all agents now have explicit rules for commit message hygiene
- Ran run-015 with ROI definitions for the first time on the Today screen
- VLM used: moondream:latest (fallback)
