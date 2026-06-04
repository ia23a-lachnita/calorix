# UI Diff Session — 2026-06-04
## Today Screen: Required Visual Judges Validation (run-048)

---

## Goal

Validate the Calorix Today screen with the rebuilt mobile-ui-diff MCP using the correct required visual judge models:
- OpenRouter primary: `qwen/qwen3-vl-235b-a22b-instruct`
- NVIDIA reviewer: `nvidia/nemotron-nano-12b-v2-vl`

This is a validation-only session. No Flutter code changes, no seed data changes.

---

## Git Starting State

- Branch: `main`, up to date with `origin/main`
- No uncommitted Flutter code changes
- Most recent commit at session start: `4aa9cb9` ("Validate Today with required visual judges")
- Previous session (run-047) used incorrect judge models: `google/gemini-2.5-flash` (OpenRouter) and `google/gemma-3-27b-it` (NVIDIA). This session corrects those models.

---

## MCP State

- **mobile-ui-diff path**: `C:\Users\xursc\projects\mobile-ui-diff-mcp\dist\index.js` (rebuilt)
- **Duplicate entries**: None — only one mobile-ui-diff MCP entry present
- **Status**: Connected and operational

---

## Deleted Today_1080.png

The deleted file `Today_1080.png` was **not used, not referenced, and not recreated** in this session.

**Expected image used**: `docs/mockups/image/dark/single/Today.png`
**Path exists**: confirmed (`Test-Path` returned `True`)

---

## Config Changes (ui-diff.config.json)

Corrected model judge entries from prior session's wrong models to the specified correct models:

| Field | Before (wrong) | After (correct) |
|---|---|---|
| primary model | `google/gemini-2.5-flash` | `qwen/qwen3-vl-235b-a22b-instruct` |
| reviewer model | `google/gemma-3-27b-it` | `nvidia/nemotron-nano-12b-v2-vl` |

Added `overlapLegibility` configuration for the center kcal-left pill:
```json
"overlapLegibility": {
  "enabled": true,
  "regions": [
    {
      "id": "kcal-left-pill",
      "label": "Kcal-left pill",
      "roiId": "macro-ring-hero",
      "coordinateSpace": "roiNormalized",
      "box": { "x": 0.36, "y": 0.58, "width": 0.28, "height": 0.11 },
      "avoidColors": ["#1FCC74"],
      "minClearancePx": 4,
      "maxOverlapPercent": 1.0,
      "severity": "warning"
    }
  ]
}
```

All other config unchanged: thresholds, dynamic masks, ROI coordinates, referenceContext.

---

## model_judges_health Result

```
status: ok
primary:
  provider: openrouter
  model: qwen/qwen3-vl-235b-a22b-instruct
  apiKeyPresent: true  (OPENROUTER_API_KEY)
  status: ready
reviewer:
  provider: nvidia
  model: nvidia/nemotron-nano-12b-v2-vl
  apiKeyPresent: true  (NVIDIA_API_KEY)
  status: ready
warnings: []
message: "All 2 configured provider(s) ready."
```

Both API keys present: **true** (values not logged).
Both judge models: **ready**.

---

## VLM Health

Ollama was not running at session start. After explicit VLM override in the run call, Ollama became reachable:
- Provider: ollama
- Model: `moondream:latest`
- Reachable: true
- Installed: true
- Load check: ok, image input verified
- Status: ok, no warnings

---

## referenceContext Summary

- factsLoaded: 7
- sourcesLoaded: 1 (`docs/mockups/source-code/cx-screen-today.jsx`)
- missingFiles: []
- warnings: []

Facts confirmed loaded:
1. BigMacroRing stroke is 10
2. BigMacroRing gap is 4
3. Protein is 96 / 170
4. Carbs are 132 / 250
5. Fat is 38 / 70
6. Chicken Rice Bowl thumbnail uses colorA #d6b487 and colorB #8a5d36
7. Recent scans count is muted label text, not a green filled pill

---

## Run Results

**Run ID**: run-048
**Previous run**: run-047 (for delta comparison)

### Global

| Metric | Value | Threshold | Status |
|---|---|---|---|
| diffPixels | 311,022 | — | — |
| diffPercent | 0.0984% | 0.14% | **pass** |
| qualityStatus | — | — | **pass** |
| qualityFailures | 0 | — | — |
| visualAuditStatus | — | — | **fail** |
| acceptanceStatus | — | — | **rejected** |
| actionRequired | null | — | — |

### Delta vs run-047

| Metric | run-047 | run-048 | Delta |
|---|---|---|---|
| diffPercent | 0.0988% | 0.0984% | -0.0004% (improved) |
| diffPixels | 312,267 | 311,022 | -1,245 |
| regionCount | 20 | 20 | 0 |
| trend | — | improved | — |

### ROI Table

| ROI | Critical | Structural Diff | Threshold | Status |
|---|---|---|---|---|
| macro-ring-hero | yes | 7.13% | 12% | **pass** |
| macro-rows | no | 10.82% | 15% | **pass** |
| meal-cards | no | 16.10% | 25% | **pass** |

All three ROI gates pass deterministically.

### Radial Geometry Diagnostics (macro-ring-hero)

- verdict: `relativeGeometryMismatch`
- confidence: 0.95
- Finding: `#19D3D9` (cyan) arc sweep differs by **-17.6°** (expected 219.3°, actual 201.7°) — **medium severity**
- Blue (#3A5BFF) arc: within acceptable range (174.3° vs 175.4°, delta -1.1°)
- Green (#1FCC74) arc: within acceptable range (256° vs 254°, delta +2.0°)
- Ring center offset: 9.2px horizontal, 3.4px vertical

**Known cause**: cyan arc sweep mismatch is data-driven (seed carb value vs mockup expectation). This is not a Flutter rendering defect. No fix required in this session.

---

## Model Judge Findings

### Judge Models Actually Used

| Role | Provider | Model |
|---|---|---|
| Primary | OpenRouter | `qwen/qwen3-vl-235b-a22b-instruct` |
| Reviewer | NVIDIA | `nvidia/nemotron-nano-12b-v2-vl` |

### Provider Errors

- NVIDIA reviewer returned **unparseable response** for ROI `meal-cards`
  - Warning: `"ModelJudgeAnalyzer: reviewer provider returned error for ROI 'meal-cards': NVIDIA returned unparseable response"`
  - This means the reviewer judge **partially failed** on one ROI

### visualCaveats

| ID | Source | Subject | Severity | Blocking | Confidence | Notes |
|---|---|---|---|---|---|---|
| openrouter-global-vm_001 | modelJudge | global | high | true | 0.95 | Layout/text differences in 'Recent scans' section |
| openrouter-global-geo_001 | modelJudge | global | high | true | 0.98 | Radial chart geometrically consistent (**pass confirmation, marked blocking**) |
| openrouter-global-ref_001 | modelJudge | global | high | true | 0.90 | Recent scans label IS muted text, matches requirement (**pass confirmation, marked blocking**) |
| openrouter-global-ref_002 | modelJudge | global | high | true | 0.97 | Overall layout matches reference (**pass confirmation, marked blocking**) |
| nvidia-macro-ring-hero-dynamicMask.mismatch | modelJudge | macro-ring-hero | high | true | 0.95 | Reports 2 dynamic subregions, actual count is 1 |
| nvidia-macro-ring-hero-radialGeometry.sweep | modelJudge | macro-ring-hero | high | true | 0.95 | Cyan arc sweep -17.6° (known data-driven mismatch) |
| nvidia-macro-ring-hero-roiQuality.structuralMismatch | modelJudge | macro-ring-hero | high | true | 0.85 | Structural diff 7.13% |
| nvidia-macro-rows-1 | modelJudge | macro-rows | medium | false | 0.70 | Protein progress bar geometry change |
| nvidia-macro-rows-2 | modelJudge | macro-rows | medium | false | 0.60 | Protein OCR text change |
| nvidia-global-1 | modelJudge | globalPixelDiff | high | true | 0.95 | Global pixel diff threshold exceeded |
| nvidia-global-2 | modelJudge | dynamicMask | high | true | 0.92 | Global mask layout inconsistency |
| nvidia-global-3 | modelJudge | OCRLabel | high | true | 0.88 | Missing 'Recent' label verification |

**Observation on OpenRouter caveats**: Items `openrouter-global-geo_001`, `openrouter-global-ref_001`, and `openrouter-global-ref_002` describe correct/matching behavior (confirmations) but are marked `blocking: true`. These appear to be false positives — the judge stated the screen matches requirements but the blocking flag triggered regardless. This may indicate a parsing/threshold issue in the rebuilt MCP's caveat classification for this model's response format.

---

## overlapLegibility Results

The `overlapLegibility` configuration was added for the `kcal-left-pill` region (roiNormalized, severity: warning). The rebuilt MCP did not produce a dedicated `overlapLegibility` results section in the run output. No overlap findings were reported. This may indicate the feature requires a specific MCP version or output format not yet surfaced in this build.

**Known manual caveat**: The `980 kcal left` pill sits visually close to the green arc. Not fixed in this session.

---

## agentActionContract

```
canEditApp: false
confidence: low
allowedChangeVectors: []
blockedChangeVectors: []
requiresUserDecision: false
reasonSummary: "All quality gates pass. No changes needed."
```

No Flutter code edits authorized.

---

## Local Hotspots

Three large-area hotspots remain (consistent with run-047):

| Region | Area | Diff Density | Label |
|---|---|---|---|
| region-017 | 348,582 px | 31.4% | Meal Cards Section |
| region-003 | 328,656 px | 23.9% | Macro Ring Hero Card |
| region-001 | 72,974 px | 29.2% | top/status/header area |

These hotspots are non-blocking (global gate passes) but indicate localized visual differences.

---

## Screenshot

Saved: `docs/screenshots/today-screen-2026-06-04-required-judges-validation.png`

Diagnostic artifacts saved to `docs/screenshots/ui-diff-diagnostics/`:
- `run-048-macro-ring-geometry-overlay.png`
- `run-048-macro-ring-edge-overlay.png`

---

## Final Decision

**INCOMPLETE / REJECTED**

| Gate | Result |
|---|---|
| Global diff (0.0984% < 0.14%) | PASS |
| qualityStatus | PASS |
| visualAuditStatus | **FAIL** |
| acceptanceStatus | **REJECTED** |
| Reviewer judge fully ran | **NO** — NVIDIA returned unparseable response for meal-cards ROI |
| Blocking caveats present | **YES** — multiple high-severity blocking caveats from both judges |

This run **cannot be called visual parity**:
- `visualAuditStatus` is `fail`
- `acceptanceStatus` is `rejected`
- The NVIDIA reviewer judge **partially failed** (unparseable response for meal-cards)
- Both judges produced blocking caveats (though several OpenRouter caveats appear to be false positives from confirmations of correctness)

The ROI deterministic gates all pass, and the pixel diff is well within threshold, confirming the screen is structurally stable. However, required visual parity requires both judges to run cleanly and produce no blocking caveats. That condition was not met.

**Causes**:
1. NVIDIA judge: partial failure on meal-cards ROI
2. OpenRouter judge: 4 blocking caveats, of which 3 appear to be false positives (confirmations incorrectly classified as blocking)
3. NVIDIA judge: blocking caveats on cyan arc sweep (known data-driven) and structural diff (within threshold)

**No Flutter code changes were made in this session.**

---

## Flutter Code Changes

**None.** This session made no changes to Flutter code, seed data, mockup images, or app configuration.
