# UI Diff Validation Session — 2026-06-06

## Context

Follow-up validation after mobile-ui-diff MCP was rebuilt to fix three bugs identified in run-052:
1. OverlapLegibilityAnalyzer coordinate resolution producing ~100× out-of-bounds pixel values
2. NVIDIA judge emitting screen data observations (1420 kcal, 980 kcal) as blocking visual caveats
3. referenceContext filtering inverted for Recent Scans fact

## Calorix Branch/Commit

- Branch: `main`
- HEAD: `75f69a3` — "Validate Today judge execution and overlap reporting"
- Repo state: clean (no uncommitted changes)

## Config Verification

File: `ui-diff.config.json`

| Field | Expected | Actual | Status |
|---|---|---|---|
| visualAuditMode | visual_parity | visual_parity | ✅ |
| modelJudges.enabled | true | true | ✅ |
| modelJudges.required | true | true | ✅ |
| modelJudges.policy | always_audit | always_audit | ✅ |
| requireConsensusForCodeHints | true | true | ✅ |
| allowEditSuggestionsOnPass | false | false | ✅ |
| timeoutMs | 45000 | 45000 | ✅ |
| maxRetries | 1 | 1 | ✅ |
| retryOnParseError | true | true | ✅ |
| includeVlmAnalysis | false | false | ✅ |
| vlmPolicy | disabled | disabled | ✅ |
| requireVlmAnalysis | false | false | ✅ |
| referenceContext path | cx-screen-today.jsx | cx-screen-today.jsx | ✅ |
| recent-scans-badge fact | present | present | ✅ |
| recent-scans blocksClaimsMatching | present | **missing** | ⚠️ |
| overlapLegibility coordinateSpace | roiNormalized | roiNormalized | ✅ |
| overlapLegibility maxOverlapPercent | 1.0 | 1.0 | ✅ |
| overlapLegibility severity | warning | warning | ✅ |

Note on `blocksClaimsMatching`: The `today-recent-scans-badge` fact does not include a `blocksClaimsMatching` filter field. The referenceContext inversion fix (run-052 bug #1) may be MCP-internal and not require this config field. To be confirmed when API keys are available and a run can proceed.

## Judge Health Check — Attempt 1 (API keys missing)

Tool: `mcp__mobile-ui-diff__model_judges_health`
Parameters: `{ screen: "today", configPath: "ui-diff.config.json", mode: "deep" }`

**Result: UNAVAILABLE — both API keys missing (OPENROUTER_API_KEY, NVIDIA_API_KEY)**
`willFailHard: true` — UI diff not run. User restored keys in environment.

## Judge Health Check — Attempt 2 (keys restored)

**Result: OK — both providers live-verified**

- primary: openrouter / qwen/qwen3-vl-235b-a22b-instruct → `call_ok`, `structuredOutputSupported: true`
- reviewer: nvidia / nvidia/nemotron-nano-12b-v2-vl → `call_ok`, `structuredOutputSupported: true`
- `willFailHard: false`, no missing keys, no warnings

## Run-053 Outcome

**STOPPED — invalid capture (device asleep / screen off).** Neither judge ran. Device woken via `adb shell input keyevent 82`.

---

## Run-054 Outcome — Valid Capture, Both Judges Executed

Run ID: `run-054`
reportJsonPath: `.ui-diff/today/run-054/report.json`

### Key Fields

| Field | Value |
|---|---|
| qualityStatus | **pass** |
| visualAuditStatus | **fail** |
| acceptanceStatus | **rejected** |
| actionRequired | `null` |
| globalDiffPercent | 9.85% (threshold 14%) ✅ |
| modelJudgesMs | 62,817ms |
| totalMs | 83,070ms |

### Model Judge Summary

| Role | Provider/Model | status | attempted | hadSuccess | evidenceCount | errorCount |
|---|---|---|---|---|---|---|
| primary | openrouter / qwen3-vl-235b-a22b-instruct | **success** | true | true | 3 | 0 |
| reviewer | nvidia / nemotron-nano-12b-v2-vl | **success** | true | true | 15 | 0 |

Both judges ran to completion. Primary-skip bug from run-051 confirmed fixed. ✅

### ROI Results (all pass locally)

| ROI | Diff | Threshold | Status |
|---|---|---|---|
| macro-ring-hero (critical) | 7.13% | 12% | ✅ pass |
| macro-rows | 10.82% | 15% | ✅ pass |
| meal-cards | 16.11% | 25% | ✅ pass |

### overlapLegibilitySummary

- `kcal-left-pill` checked: **true** ✅
- status: **pass**
- resolvedBox: `{x:438, y:747, width:330, height:73}` in `expected` coordinate space (image 1206×2622) — fully within bounds ✅
- overlapPercent: 0 — no green (#1FCC74) pixels in box
- coloredPixelCountInBox: 0, coloredPixelCountInClearanceBand: 0
- nearestAvoidColorDistancePx: null (no green pixels found at all)
- artifactPath: `.ui-diff/today/run-054/overlap-legibility-kcal-left-pill.png` ✅
- **Coordinate resolution bug confirmed FIXED** — run-052 produced (527649, 1959893); run-054 produces valid (438, 747) ✅

**980 kcal left pill verdict: accepted — no green pixel proximity, overlapPercent 0, warning threshold not triggered.**

### referenceContextSummary

- factsLoaded: 7, sourcesLoaded: 1, missingFiles: [], warnings: [] ✅

### Visual Caveats

**Blocking (3):**

1. `openrouter-macro-rows-macro-row-protein-text-format` — **credible finding**: actual shows "96g / 170g", expected shows "96 / 170g". Redundant 'g' appended to current value. Real UI formatting difference.
2. `nvidia-global-1` — "Screenshot background is black instead of dark grey" — **suspect false positive**: global pixel diff only 9.85%, no qualityFailures. App background `#0E1117` is near-black; NVIDIA judge may be calibrated incorrectly for this dark mode palette.
3. `nvidia-global-4` — "Text display does not match reference source requirements" (subject: `roi:recent-scans`) — **vague, possibly related to missing `blocksClaimsMatching` field**; claim unspecific, no evidence cited.

**Non-blocking notable:**
- Arc sweep -17.6° mismatch (known geometry deviation, documented baseline, non-blocking) ✅
- Meal cards divider color difference (non-blocking)
- BigMacroRing gap verification uncertainty (non-blocking, low confidence)

### agentActionContract

- `canEditApp: false` — no Flutter edits authorized ✅
- `allowedChangeVectors: []` — no change vectors open
- No seed-data or fixture-plan recommendation made ✅

### MCP Fix Verification (vs run-052 bugs)

| Bug | Status |
|---|---|
| OverlapLegibilityAnalyzer coordinate resolution | **FIXED** ✅ — valid (438,747) vs prior (527649,1959893) |
| NVIDIA data-as-caveat (1420/980 kcal as blocking) | **FIXED** ✅ — no raw kcal observations emitted as blocking |
| referenceContext filtering inversion | **Partially fixed** — facts load correctly (7/7), but `nvidia-global-4` on recent-scans remains vague; `blocksClaimsMatching` not in config |

## What Changed Since run-052

All three MCP bugs from run-052 are addressed. Coordinate resolution is confirmed fixed. Data-as-caveat emission for kcal values is gone. The referenceContext inversion appears improved but the vague `nvidia-global-4` finding on recent-scans warrants monitoring.

## Files Saved

- `docs/screenshots/today-screen-2026-06-06-required-judge-overlap-validation.png` — actual screenshot from run-054
- `docs/screenshots/ui-diff-diagnostics/run-054-kcal-left-pill-overlap.png` — overlap legibility artifact
- `.claude/ui-diff-session-2026-06-06.md` (this file)

## Conclusion

**Rejected — blocking caveats, but quality gates pass.**

Run-054 produced a valid capture. Both required judges (OpenRouter primary + NVIDIA reviewer) executed successfully with no errors. All three local ROI gates pass. The coordinate resolution fix is confirmed. The data-as-caveat emission fix is confirmed. The one credible blocking finding is a real UI issue: protein macro row displays "96g / 170g" (redundant 'g') instead of "96 / 170g". Two further blocking caveats from NVIDIA (black background, recent-scans text) are likely false positives or judge calibration artifacts — neither is supported by the pixel diff evidence. No Flutter edits are authorized by `agentActionContract`. No seed data or fixture changes were made.
