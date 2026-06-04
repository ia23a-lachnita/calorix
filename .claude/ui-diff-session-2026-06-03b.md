# UI Diff Session — Today Screen Required Visual Judges Validation
**Date:** 2026-06-04
**Run ID:** run-047
**Goal:** Validate the rebuilt mobile-ui-diff MCP with required model judges (OpenRouter + NVIDIA) against the Today screen. Confirm `visualAuditStatus`, `acceptanceStatus`, and `agentActionContract` are functioning correctly with the new evidence pipeline.

---

## MCP Config Status

- Server: `node C:\Users\xursc\projects\mobile-ui-diff-mcp\dist\index.js` — correct rebuilt path, no duplicate entry
- No uncommitted Flutter changes at session start
- flutter-mcp-toolkit and mobile-ui-diff both showed "Pending approval" in `claude mcp list` — tools functional after approval

---

## Model Judges Health

| Provider | Model | API Key Present | Status |
|---|---|---|---|
| openrouter | google/gemini-2.5-flash | true (`OPENROUTER_API_KEY`) | ready |
| nvidia | google/gemma-3-27b-it | true (`NVIDIA_API_KEY`) | ready |

- `willFailHard`: false
- Both required judges: **READY**

*API key values are not recorded here; only boolean presence.*

---

## VLM Health

- Ollama reachable: true (was initially down; user started it before run)
- `moondream:latest`: installed, load check ok, imageInputVerified true
- selectedModel: `moondream:latest`
- Fallback available: `qwen2.5vl:3b`
- Warnings: none

---

## Config Changes Made

The following fields were missing from `ui-diff.config.json` `today` screen and were added:

```json
"visualAuditMode": "visual_parity",
"modelJudges": {
  "enabled": true,
  "required": true,
  "policy": "always_audit",
  "primary": { "provider": "openrouter", "model": "google/gemini-2.5-flash" },
  "reviewer": { "provider": "nvidia", "model": "google/gemma-3-27b-it" }
},
"allowEditSuggestionsOnPass": false,
"requireConsensusForCodeHints": true
```

`referenceContext` was already enabled, pointing to `docs/mockups/source-code/cx-screen-today.jsx` (7 facts, 1 source, no missing files).

---

## Run Summary

| Field | Value |
|---|---|
| Run ID | run-047 |
| Global diff | 9.88% (312,267 px / 3,162,132 px) |
| Global status | **pass** (max 14%) |
| qualityStatus | **pass** |
| visualAuditStatus | **pass** |
| acceptanceStatus | **accepted** |
| actionRequired | null |
| Delta vs run-046 | +0.011% (+344 px) — stable |

---

## ROI Table

| ROI | Structural Diff | Max | Status | Notes |
|---|---|---|---|---|
| macro-ring-hero | 7.13% | 12% | **PASS** | Geometry finding: #19D3D9 sweep −17.6° (known seed mismatch) |
| macro-rows | 10.82% | 15% | **PASS** | — |
| meal-cards | 16.16% | 25% | **PASS** | — |

---

## Geometry Diagnostics — macro-ring-hero

- Verdict: `relativeGeometryMismatch`
- Confidence: 0.95
- Finding: `#19D3D9` (cyan/carbs) arc sweep differs by −17.6 degrees
- Severity: medium
- Known cause: data-driven sweep mismatch from seeded carbs value vs mockup expectation (documented in prior sessions, not a Flutter rendering defect)
- No new geometry regressions vs run-045/run-046

---

## Visual Caveats

- `kcal-left` pill / green ring arc overlap: not surfaced as a `visualCaveat` in this run (non-blocking per prior documentation)
- Global pass does not mean pixel-perfect local visual parity — local hotspots remain in header, macro ring, and meal cards area; these are known and within thresholds

---

## Model Judge Summary

Both judges (OpenRouter Gemini 2.5 Flash, NVIDIA Gemma 3 27B-IT) ran. All four judge claims were downgraded:

| Claim | Reason for Downgrade |
|---|---|
| `openrouter-macro-ring-hero-visual-mismatch-1` | Contradicted by deterministic measurement `roi-quality-macro-ring-hero` (ROI passed) |
| `nvidia-error-macro-ring-hero` | Contradicted by deterministic measurement `roi-quality-macro-ring-hero` |
| `nvidia-error-macro-rows` | Contradicted by deterministic measurement `roi-quality-macro-rows` |
| `nvidia-error-meal-cards` | Contradicted by deterministic measurement `roi-quality-meal-cards` |

This is the expected consensus/conflict resolution behavior — judge "error" claims were overridden by passing deterministic gate measurements. No blocker judge findings remained.

---

## agentActionContract

```json
{
  "canEditApp": false,
  "confidence": "low",
  "allowedChangeVectors": [],
  "blockedChangeVectors": [],
  "requiresUserDecision": false,
  "reasonSummary": "All quality gates pass. No changes needed."
}
```

`canEditApp: false` — no Flutter code changes are authorized by this run.

---

## referenceContext Summary

- factsLoaded: 7
- sourcesLoaded: 1 (`docs/mockups/source-code/cx-screen-today.jsx`)
- missingFiles: none
- warnings: none

---

## Screenshot

`docs/screenshots/today-screen-2026-06-03b-required-judges-validation.png`

---

## Final Decision

**ACCEPTED VISUAL PARITY** — with the following caveats:

1. Judges ran and their claims were resolved by deterministic measurements; `acceptanceStatus: accepted` is valid.
2. Geometry finding (cyan sweep −17.6°) is a known data-driven mismatch, not a Flutter rendering defect. No code change warranted.
3. Local hotspots in macro ring and meal cards remain within configured thresholds; no new regressions vs run-046.
4. `canEditApp: false` — no Flutter changes are authorized from this run.

This is not claimed as pixel-perfect parity. Visual acceptance is bounded by the configured ROI thresholds and the known geometry floor established in prior sessions.
