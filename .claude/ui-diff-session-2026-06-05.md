# UI Diff Session — 2026-06-05
## Today Screen · Compact Visual Parity Audit with Required Model Judges

---

## Goal

Validate the Calorix Today screen using the rebuilt mobile-ui-diff MCP with:
- `outputMode: "compact"` to protect context window
- Required model judges (OpenRouter primary + NVIDIA reviewer)
- Deep `model_judges_health` preflight
- `referenceContext` sourced from JSX mockup
- `overlapLegibility` for kcal-left pill proximity to green arc

No Flutter code, seed data, ROI thresholds, or judge models were changed during this session.

---

## Git Starting State

Branch: `main` — up to date with `origin/main`

Last 5 commits:
```
20a4f2f Validate Today with compact required visual judges
1117b9c Validate Today with required visual judges
4aa9cb9 Validate Today with required visual judges
d1ace63 Validate Today with evidence pipeline
ece3e36 docs: correct Today UI diff final report wording
```

No uncommitted Flutter changes. Only untracked files in `.claude/ui-diff-runs/`, `.codex/agents/`, `assets/calorix_icons/`, and `docs/screenshots/`.

---

## MCP Registration

Single active `mobile-ui-diff` entry:
```
mobile-ui-diff: node C:\Users\xursc\projects\mobile-ui-diff-mcp\dist\index.js
```
Path is correct. No duplicate entries.

---

## Deleted File Confirmation

`Today_1080.png` is **not present** anywhere in the repo. Glob search confirmed no match. This file was not recreated or referenced during this session.

---

## Expected Image Path

`docs/mockups/image/dark/single/Today.png` — **EXISTS** (confirmed via `Test-Path`).

---

## Config Verification (`ui-diff.config.json`)

All required fields confirmed present before the run:

| Field | Value | Status |
|---|---|---|
| `visualAuditMode` | `visual_parity` | ✅ |
| `modelJudges.enabled` | `true` | ✅ |
| `modelJudges.required` | `true` | ✅ |
| `modelJudges.policy` | `always_audit` | ✅ |
| Primary provider/model | openrouter / `qwen/qwen3-vl-235b-a22b-instruct` | ✅ |
| Reviewer provider/model | nvidia / `nvidia/nemotron-nano-12b-v2-vl` | ✅ |
| `requireConsensusForCodeHints` | `true` | ✅ |
| `allowEditSuggestionsOnPass` | `false` | ✅ |
| `timeoutMs` | 45000 | ✅ |
| `maxRetries` | 1 | ✅ |
| `retryOnParseError` | `true` | ✅ |
| `referenceContext.enabled` | `true` | ✅ |
| `referenceContext.sources[0].path` | `docs/mockups/source-code/cx-screen-today.jsx` | ✅ |
| `overlapLegibility.enabled` | `true` | ✅ |
| `overlapLegibility.regions[0].id` | `kcal-left-pill` | ✅ |
| `overlapLegibility.regions[0].severity` | `warning` (non-blocking) | ✅ |

### Source Facts (referenceContext)

All 7 required facts confirmed:
1. BigMacroRing stroke is 10
2. BigMacroRing gap is 4
3. Protein is 96 / 170
4. Carbs are 132 / 250
5. Fat is 38 / 70
6. Chicken Rice Bowl thumbnail uses colorA #d6b487 and colorB #8a5d36
7. Recent scans count is muted label text, not a green filled pill

### Config Change Made This Session

The screen-level VLM flags were holdovers from before model judges were added. They were updated to disable VLM requirement (model judges are now the required analysis method):

```diff
- "includeVlmAnalysis": true,
- "vlmPolicy": "required",
- "requireVlmAnalysis": true,
+ "includeVlmAnalysis": false,
+ "vlmPolicy": "disabled",
+ "requireVlmAnalysis": false,
```

Without this fix the run fails immediately with: `VLM analysis is required but no configured Ollama model could be loaded.`

---

## Deep Model Judges Health Check

```
model_judges_health(screen: "today", configPath: "ui-diff.config.json", mode: "deep")
```

| Field | Value |
|---|---|
| Overall status | `ok` |
| willFailHard | `false` |
| missingKeys | `[]` |
| visualAuditMode | `visual_parity` |
| policy | `always_audit` |
| warnings | (none) |

| Provider | Model | apiKeyPresent | status | structuredOutputSupported | schemaCheckStatus |
|---|---|---|---|---|---|
| OpenRouter | qwen/qwen3-vl-235b-a22b-instruct | **true** | `call_ok` | `true` | `ok` |
| NVIDIA | nvidia/nemotron-nano-12b-v2-vl | **true** | `call_ok` | `true` | `ok` |

API key values are **not recorded**. Presence confirmed as boolean only.

---

## Run Result — run-051

### Global Status

| Metric | Value |
|---|---|
| Run ID | `run-051` |
| Global diff fraction | 0.09828 |
| Global diff (human) | **9.83%** |
| Threshold | 14.00% |
| `status` | `pass` |
| `qualityStatus` | `pass` |
| `visualAuditStatus` | **`error`** |
| `acceptanceStatus` | **`rejected`** |
| `vlmAnalysisStatus` | `disabled` |

### Action Required

```json
{
  "type": "model_judges_failed",
  "severity": "blocking",
  "message": "Required model judges ran but produced no successful results. All judge outputs were errors."
}
```

### ROI Table

| ROI | Diff | Threshold | Status |
|---|---|---|---|
| macro-ring-hero (critical) | 7.13% | 12% | pass |
| macro-rows | 10.82% | 15% | pass |
| meal-cards | 16.14% | 25% | pass |

All three ROI deterministic gates pass.

---

## Model Judges Summary

| Role | Provider | Model | Status | evidenceCount | errorCount | hadSuccess |
|---|---|---|---|---|---|---|
| primary | openrouter | qwen/qwen3-vl-235b-a22b-instruct | **`skipped`** | 0 | 0 | false |
| reviewer | nvidia | nvidia/nemotron-nano-12b-v2-vl | **`success`** | 13 | 0 | **true** |

**MCP Bug:** The `actionRequired` message states "All judge outputs were errors" but the actual data shows:
- Primary was **skipped** (not errored)
- Reviewer **succeeded** with 13 evidence items

A skipped primary when the reviewer succeeds should not produce a hard rejection with an "all errors" message. This is a logic/reporting bug in the MCP.

`failedRois`: `[]` — no ROI-level failures from either judge.

---

## Visual Caveats (8 total)

All caveats are sourced from the NVIDIA reviewer (the only judge that ran successfully).

| id | severity | blocking | confidence | Assessment |
|---|---|---|---|---|
| `nvidia-macro-ring-hero-GEOM_19D3D9` | high | **true** | 0.95 | Arc sweep -17.6° for cyan (#19D3D9). **Data-driven.** referenceContext confirms Carbs 132/250 (52.8% → ~190° sweep). Not a structural defect. |
| `nvidia-macro-ring-hero-ROC_0` | high | false | 1.0 | "No OCR text present for comparison" — false positive / artifact caveat |
| `nvidia-macro-rows-1` | high | **true** | 1.0 | "96" vs "96g" — judge comparing app text against mockup. Unit suffix rendering difference. Requires visual inspection. |
| `nvidia-macro-rows-2` | high | **true** | 1.0 | Duplicate of above ("Unit 'g' missing") |
| `nvidia-macro-rows-3` | high | **true** | 0.95 | Duplicate of above ("number formatting inconsistency") |
| `nvidia-meal-cards-meals-section structural diff` | high | **true** | 1.0 | 16.14% diff "anomalous" — but ROI threshold is 25% and it passes. Overclaiming. |
| `nvidia-global-date_mismatch` | high | **true** | 0.95 | "MAY 15" (mockup) vs "JUN 5" (live). **Dynamic data.** Should be masked as live date. Not a structural defect. |
| `nvidia-global-title_position` | high | false | 0.82 | Title color difference (black vs white). Non-blocking. |

**Source-contradicted findings (referenceContext not applied):**
- Arc sweep caveat: referenceContext confirms Carbs 132/250 which produces the observed sweep angle
- Date caveat: live date vs static mockup — dynamic data, not structural

**Note:** The report contains no `referenceContext` section despite being configured. The MCP did not apply source facts to filter contradicted findings. This is a second MCP bug.

---

## Overlap Legibility

Configured: `kcal-left-pill` on `macro-ring-hero`, `severity: "warning"` (non-blocking), avoidColor `#1FCC74`.

`OverlapLegibilityAnalyzer` ran for **1ms** and produced **no output** — no section in the report, no artifact files. The configured overlap region was not evaluated. This is a third MCP bug.

No overlap artifact exists to inspect or copy.

**Known manual caveat:** The 980 kcal-left pill sits visually close to the green arc. This proximity is expected per the design. If the analyzer had run, it should produce a non-blocking warning per the `severity: "warning"` config.

---

## Timing Summary

| Stage | Duration |
|---|---|
| Total | 68,852 ms |
| Pixel diff | 1,714 ms |
| Model judges | 48,397 ms |
| Radial geometry | 8,853 ms |
| Overlap legibility | 1 ms (ran but no output) |

The primary judge (OpenRouter) spending 0ms while being marked `skipped` — and the reviewer spending ~48s — confirms the primary was never attempted despite the deep health check showing `call_ok`.

---

## Agent Action Contract

```json
{
  "canEditApp": false,
  "confidence": "low",
  "allowedChangeVectors": [],
  "blockedChangeVectors": [],
  "requiresUserDecision": false,
  "reasonSummary": "Deterministic quality gates pass, but visual audit failed because required model judges failed."
}
```

`canEditApp: false` is correct — no app edits should follow from a rejected run.

---

## Screenshot

`docs/screenshots/today-screen-2026-06-05-compact-judges-validation.png`

Copied from `.ui-diff/today/run-051/actual.png` — device screen captured after reseed deep link.

---

## Diagnostic Artifacts Copied

| Source | Destination |
|---|---|
| `.ui-diff/today/run-051/regions-of-interest/macro-ring-hero-geometry-overlay.png` | `docs/screenshots/ui-diff-diagnostics/run-051-macro-ring-geometry-overlay.png` |

No overlap artifact available (MCP bug — analyzer produced no output).

---

## MCP Bugs Identified This Session

| # | Bug | Impact |
|---|---|---|
| 1 | VLM flags (`requireVlmAnalysis`, `vlmPolicy`) not auto-disabled when `modelJudges.required: true` | Hard failure before run starts; requires manual config fix |
| 2 | Primary judge status `skipped` reported as "All judge outputs were errors" | `acceptanceStatus: rejected` despite reviewer success (13 evidence items) |
| 3 | `referenceContext` configured but absent from report; source facts not applied to filter caveats | Source-contradicted findings (arc geometry, date) remain as blocking caveats |
| 4 | `OverlapLegibilityAnalyzer` runs 1ms and produces no section or artifact | Configured kcal-left pill proximity check never evaluated |

---

## Final Decision

**REJECTED — INCOMPLETE**

Reason: `acceptanceStatus: "rejected"` due to primary judge (OpenRouter) being skipped, triggering hard rejection despite NVIDIA reviewer succeeding.

This is **not accepted as visual parity** because:
1. Required primary judge did not execute (status: `skipped`)
2. `acceptanceStatus` is `rejected`, not `accepted`
3. Multiple blocking caveats remain (some false positives, some requiring inspection)

**Deterministic gates** (pixel diff + ROI thresholds): all pass
**Model judge reviewer**: NVIDIA ran, produced 13 evidence items, had findings
**Model judge primary**: OpenRouter skipped — root cause unknown; deep health check showed `call_ok` at session start

### Arc Geometry Note

The cyan arc sweep caveat (-17.6°) is data-driven, not a structural Flutter defect. `referenceContext` confirms Carbs 132/250 (52.8%), which produces the observed sweep. This should not trigger a seed or plan change recommendation, and it does not.

---

## No Flutter Code Changes

No Flutter code, seed data, ROI thresholds, or judge model identifiers were changed in this session.
