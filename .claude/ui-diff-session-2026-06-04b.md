# Today Screen UI-Diff Validation — 2026-06-04b
## Compact Output / Judge-Improvements MCP Rebuild

**Date:** 2026-06-05  
**Run:** run-050  
**Goal:** Validate rebuilt mobile-ui-diff MCP with compact output, deep model_judges_health, reportJsonPath, timing fields, visualAuditStatus/acceptanceStatus, visualCaveats, overlapLegibility artifact quality, and judge parsing/caveat classification. No Flutter edits.

---

## Git Starting State

Branch: `main`, up to date with origin/main.  
Last commit: `1117b9c` — Validate Today with required visual judges  
No uncommitted Flutter code changes. Only untracked: `.claude/ui-diff-runs/`, `.codex/agents/`, `.gemini/settings.json.bak-*`, `assets/calorix_icons/`, `nul`

---

## MCP State

- **Path:** `C:\Users\xursc\projects\mobile-ui-diff-mcp\dist\index.js`
- **Registration:** Single entry in `claude mcp list` — no duplicates
- **Status:** Pending approval (normal for project-scoped MCP)
- `model_judges_health` tool confirmed present in MCP schema

---

## Config Pre-Run Changes

`timeoutMs: 45000`, `maxRetries: 1`, `retryOnParseError: true` added to `modelJudges` block.  
`requireConsensusForCodeHints` and `allowEditSuggestionsOnPass` moved inside `modelJudges` (were at screen level).  
No ROI thresholds changed. No Flutter code touched.

---

## Expected Image Path

`docs/mockups/image/dark/single/Today.png` — **EXISTS** ✓  
`docs/mockups/images/Today_1080.png` (deleted baseline) — **ABSENT** ✓ Not used, not referenced, not recreated.

---

## Deep Model Judges Health — PASS

Mode: `deep` (live API call with schema-constrained request)

| Judge | Provider | Model | API Key | Status | Structured Output | Schema |
|---|---|---|---|---|---|---|
| Primary | openrouter | `qwen/qwen3-vl-235b-a22b-instruct` | Present | `call_ok` | `true` | `ok` |
| Reviewer | nvidia | `nvidia/nemotron-nano-12b-v2-vl` | Present | `call_ok` | `true` | `ok` |

- `willFailHard: false`
- `missingKeys: []`
- `warnings: []`
- `visualAuditMode: visual_parity`, `required: true`, `policy: always_audit`

> API key booleans only — no key values stored anywhere.

This is the first session where deep health check returned full `call_ok` + `structuredOutputSupported: true` for both providers.

---

## Device State / Invalid Capture (run-049)

First run attempt (run-049) hit `actionRequired: invalid_capture` — device screen was OFF.  
`diffFraction: 30.46%` (entirely noise from near-black screenshot).  
Model judges ran (64s) but all caveats were noise from the black image — discarded.  
Device woken via `adb shell input keyevent 224`, unlocked via `keyevent 82`.  
Reseed deep link re-delivered. Preflight screenshot confirmed valid Today UI before re-running.

---

## Preflight Screenshot Confirmed

Screenshot captured before run-050. Confirmed:
- Dark theme, Today screen visible
- 1,420 kcal eaten / 2,400 target / 980 kcal left
- Protein 96g/170g 56%, Carbs 132g/250g 53%, Fat 38g/70g 54%
- "3 today" as muted label text (not green pill) ✓
- Chicken Rice Bowl card visible

All referenceContext facts match live app state.

---

## referenceContext Summary

- `factsLoaded: 7`, `sourcesLoaded: 1`, `missingFiles: []`, `warnings: []`
- Source: `docs/mockups/source-code/cx-screen-today.jsx` (authority: high)
- Facts: BigMacroRing stroke=10, gap=4; Protein 96/170; Carbs 132/250; Fat 38/70; Chicken Rice Bowl thumbnail colors #d6b487/#8a5d36; Recent scans count is muted label text

---

## overlapLegibility Config

Configured for `kcal-left-pill` region:
- `roiId: macro-ring-hero`, `coordinateSpace: roiNormalized`
- `box: { x:0.36, y:0.58, width:0.28, height:0.11 }`
- `avoidColors: ["#1FCC74"]`, `minClearancePx: 4`, `maxOverlapPercent: 1.0`, `severity: warning`

**Actual behavior:** `OverlapLegibilityAnalyzer: 0ms` — analyzer did **not run** in run-050.  
No overlap findings or artifacts were produced. This is an **MCP bug** — the analyzer was configured but not invoked.

---

## Run-050 Results

**Run ID:** run-050  
**Report:** `.ui-diff/today/run-050/report.json`  
**Screenshot:** `docs/screenshots/today-screen-2026-06-04b-compact-judges-validation.png`

### Global Diff

| Metric | Value | Threshold | Result |
|---|---|---|---|
| Global diff | 9.82% (0.09820) | 14.00% | **PASS** |
| Diff pixels | 310,507 | — | — |
| Total pixels | 3,162,132 | — | — |

### ROI Table

| ROI | Diff | Max | Result | Critical |
|---|---|---|---|---|
| Macro Ring Hero Card | 7.13% | 12% | **PASS** | Yes |
| Macro Progress Rows | 10.82% | 15% | **PASS** | No |
| Meal Cards Section | 16.10% | 25% | **PASS** | No |

### Quality/Audit Status

| Field | Value |
|---|---|
| `qualityStatus` | **pass** |
| `visualAuditStatus` | **error** |
| `acceptanceStatus` | **rejected** |
| `actionRequired.type` | `model_judges_failed` |
| `vlmAnalysisStatus` | `disabled` |

### Compact Output Behavior

- Output size: manageable, compact mode working ✓
- `reportJsonPath` present: `.ui-diff/today/run-050/report.json` ✓
- Inline findings limited to 10 ✓

---

## Timings (run-050)

| Phase | Ms |
|---|---|
| Total | 96,676 |
| pixelDiff | 1,569 |
| modelJudges | 76,434 |
| RadialGeometryAnalyzer | 8,669 |
| DynamicMaskAnalyzer | 0 |
| ColorSamplerAnalyzer | 0 |
| TextOcrAnalyzer | 0 |
| **OverlapLegibilityAnalyzer** | **0 (did not run)** |

---

## Model Judge Findings / MCP Internal Contradiction

### Critical Finding: Contradictory State

The rebuilt MCP exhibits a **contradictory internal state**:

1. `modelJudgesMs: 76,434ms` — judges ran for 76 seconds
2. 11 `visualCaveats` present in both compact response and `report.json`, all `source: "modelJudge"`
3. `report.json` has **no `modelJudges` structured section** (`visualAudit: null`, no per-provider status/attempts/timing)
4. `actionRequired.type: "model_judges_failed"` — "All judge outputs were errors"
5. `agentActionContract.reasonSummary: "All quality gates pass. No changes needed."` — **contradicts** `acceptanceStatus: "rejected"`

**Interpretation:** The judges ran and produced output that was parsed into caveats with `"nvidia-"` prefixed IDs, but the MCP's internal judge-result tracking did not record a "successful" result. The rebuilt MCP does not persist structured judge results to `report.json` the way the prior schema did, preventing per-provider status inspection.

### Caveat Analysis

| ID | Subject | Blocking | Confidence | Assessment |
|---|---|---|---|---|
| `nvidia-macro-ring-hero-radialGeometry1` | Macro Ring | Yes | 0.95 | **Known data-driven mismatch** — cyan arc sweep -17.6° is Carbs 132/250 vs expected reference proportion. Not a Flutter bug. referenceContext confirms correct data. |
| `nvidia-macro-ring-hero-radialGeometry2` | Macro Ring | Yes | 0.95 | **Likely corollary of above** — progress-to-sweep misalignment derives from same -17.6° delta. |
| `nvidia-macro-rows-1` | Macro Rows | No | 0.8 | Non-blocking. Progress bar width difference — data-driven, seed-aligned, not a layout bug. |
| `nvidia-macro-rows-2` | Macro Rows | No | 0.8 | Non-blocking. Notes 56% protein unchanged — confirms data correct. |
| `nvidia-macro-rows-3` | Macro Rows | No | 0.9 | Non-blocking. Same as above, supporting text. |
| `nvidia-meal-cards-roi:meal-card-section-1` | Meal Cards | Yes | 0.95 | **MCP bug** — "ROI has 1 dynamic subregion(s) configured" is config metadata, not a UI finding. Should never be a blocking caveat. |
| `nvidia-meal-cards-roi:meal-card-section-2` | Meal Cards | Yes | 1.0 | **False positive** — "Recent scans count UI does not match reference". Screenshot shows correct "3 today" muted label. referenceContext fact explicitly states this is muted text, not green pill. |
| `nvidia-meal-cards-roi:meal-card-section-3` | Meal Cards | Yes | 1.0 | **False positive** — "Recent scans count text is not muted". Screenshot confirms it IS muted text. High false-positive confidence. |
| `nvidia-meal-cards-roi:meal-card-section-4` | Meal Cards | No | 0.7 | Non-blocking. "Possible missing padding" — minor, unverified. |
| `nvidia-global-001` | Today header | Yes | 0.99 | **False positive** — "FRIDAY · JUN 5 instead of FRIDAY · MAY 15". Date is dynamic (today IS June 5). The expected mockup image was captured May 15; this is expected drift, not a regression. Date field should be in a dynamic/data mask. |
| `nvidia-global-002` | Recent Scans | Yes | 0.99 | **False positive** — "3 TODAY instead of being muted". Screenshot confirms "3 today" is muted small label. Same misread as meal-card-section-2/3. |

**Summary:** Of 11 caveats, 2 blocking are the known arc sweep mismatch (data-driven, not actionable), 1 is an MCP config-metadata bug, and 3 are high-confidence false positives about UI elements that are visually correct per the preflight screenshot.

### Known Manual Caveat: kcal-left pill / green arc proximity

The 980 kcal left pill sits visually close to the green arc. The `OverlapLegibilityAnalyzer` did not run (0ms), so no automated artifact was generated. No fix recommended — `severity: warning` is correct if/when the analyzer runs.

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

`canEditApp: false` — correct, no Flutter edits authorized.  
Note: `reasonSummary` contradicts `acceptanceStatus: rejected`. This is a report-assembly bug in the rebuilt MCP.

---

## MCP Bugs Identified (rebuilt compact-output / judge-improvements branch)

| # | Bug | Impact |
|---|---|---|
| 1 | No `modelJudges` structured section in `report.json` | Cannot inspect per-provider status, attempts, or retry behavior |
| 2 | `actionRequired: model_judges_failed` despite caveats being present and 76s judge runtime | `acceptanceStatus` incorrectly set to `rejected` |
| 3 | `agentActionContract.reasonSummary` contradicts `acceptanceStatus` | Ambiguous acceptance state |
| 4 | `OverlapLegibilityAnalyzer: 0ms` — did not run despite config | `kcal-left-pill` overlap not checked |
| 5 | Config metadata treated as blocking caveat (`"has 1 dynamic subregion configured"`) | False blocking caveat |
| 6 | Dynamic date field in header not auto-masked → false positive caveat | Blocks acceptance on irrelevant drift |
| 7 | `visualAudit: null` — no visual audit section written | Report schema incomplete |

---

## Screenshot

`docs/screenshots/today-screen-2026-06-04b-compact-judges-validation.png`

---

## Final Decision

**INCOMPLETE / REJECTED**

- `acceptanceStatus: rejected`
- `visualAuditStatus: error`
- `qualityStatus: pass` (all deterministic gates pass)
- All 3 ROI gates pass (7.13%, 10.82%, 16.10%)
- Model judges ran (deep health confirmed both providers `call_ok`) but MCP does not record successful completion
- Result cannot be declared visual parity

**This is not full visual parity** because:
- `visualAuditStatus` is `error`, not `pass` or `pass_with_caveats`
- `acceptanceStatus` is `rejected`, not `accepted`
- The MCP's judge-success tracking is broken in this rebuild — judges produce output but the framework does not recognize it

**No Flutter code changes were made in this session.**

---

## Cyan Arc Sweep Note

The `-17.6° cyan arc sweep` caveat (`nvidia-macro-ring-hero-radialGeometry1`) is a deterministic data-driven mismatch. referenceContext confirms Carbs 132/250 (52.8% fill), which maps to a specific sweep angle. The expected mockup image uses different reference proportions. This is NOT a Flutter rendering defect. Do not recommend seed or plan changes.
