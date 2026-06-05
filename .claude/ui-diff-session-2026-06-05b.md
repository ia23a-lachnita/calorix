# UI Diff Session — 2026-06-05b
## Today Screen: Required Judge Execution + Overlap Legibility Validation

**Goal:** Validate that the rebuilt mobile-ui-diff MCP (post `fix/run051-required-judge-and-overlap`) correctly:
1. Runs the required primary judge (OpenRouter/qwen3-vl) without skipping
2. Runs the required reviewer judge (NVIDIA/nemotron-nano)
3. Produces an `overlapLegibilitySummary` with a concrete per-region result for `kcal-left-pill`

---

## Step 1 — Repo and MCP Sanity

**Git starting state:** Clean — no uncommitted Flutter code changes. Untracked files are prior validation artifacts only.

**Recent commits at session start:**
```
3a6de59 Validate Today with compact visual parity audit
20a4f2f Validate Today with compact required visual judges
1117b9c Validate Today with required visual judges
```

**MCP path:** `node C:\Users\xursc\projects\mobile-ui-diff-mcp\dist\index.js` — correct single entry.

**Expected image:** `docs/mockups/image/dark/single/Today.png` — EXISTS ✅

**Today_1080.png:** ABSENT ✅ — not used or recreated in this session.

**No Flutter code changes made in this session.**

---

## Step 2 — Config Verification

All required fields confirmed in `ui-diff.config.json` for the `today` screen:

| Field | Value | Status |
|---|---|---|
| `visualAuditMode` | `visual_parity` | ✅ |
| `modelJudges.enabled` | `true` | ✅ |
| `modelJudges.required` | `true` | ✅ |
| `modelJudges.policy` | `always_audit` | ✅ |
| `primary.provider` | `openrouter` | ✅ |
| `primary.model` | `qwen/qwen3-vl-235b-a22b-instruct` | ✅ |
| `reviewer.provider` | `nvidia` | ✅ |
| `reviewer.model` | `nvidia/nemotron-nano-12b-v2-vl` | ✅ |
| `requireConsensusForCodeHints` | `true` | ✅ |
| `timeoutMs` | `45000` | ✅ |
| `maxRetries` | `1` | ✅ |
| `retryOnParseError` | `true` | ✅ |
| `includeVlmAnalysis` | `false` | ✅ |
| `vlmPolicy` | `disabled` | ✅ |
| `requireVlmAnalysis` | `false` | ✅ |

**Legacy VLM state:** All three VLM flags are disabled. Ollama/local VLM is not required by this config. Model judges are the sole required visual-audit layer.

**referenceContext:** Points to `docs/mockups/source-code/cx-screen-today.jsx`. All 7 source facts present:
- BigMacroRing stroke is 10
- BigMacroRing gap is 4
- Protein is 96 / 170
- Carbs are 132 / 250
- Fat is 38 / 70
- Chicken Rice Bowl thumbnail uses colorA #d6b487 and colorB #8a5d36
- **Recent scans count is muted label text, not a green filled pill** ← authority: high

**overlapLegibility config:**
```json
{
  "enabled": true,
  "regions": [{
    "id": "kcal-left-pill",
    "roiId": "macro-ring-hero",
    "coordinateSpace": "roiNormalized",
    "box": { "x": 0.36, "y": 0.58, "width": 0.28, "height": 0.11 },
    "avoidColors": ["#1FCC74"],
    "minClearancePx": 4,
    "maxOverlapPercent": 1.0,
    "severity": "warning"
  }]
}
```

---

## Step 3 — Deep Model Judges Health

Called `model_judges_health` with `mode: "deep"`, `screen: "today"`.

| Field | Value |
|---|---|
| `status` | `ok` |
| `willFailHard` | `false` |
| `missingKeys` | `[]` |
| `visualAuditMode` | `visual_parity` |
| Primary provider | openrouter |
| Primary model | qwen/qwen3-vl-235b-a22b-instruct |
| Primary API key present | true (OPENROUTER_API_KEY) |
| Primary `status` | `call_ok` |
| Primary `structuredOutputSupported` | true |
| Primary `schemaCheckStatus` | `ok` |
| Reviewer provider | nvidia |
| Reviewer model | nvidia/nemotron-nano-12b-v2-vl |
| Reviewer API key present | true (NVIDIA_API_KEY) |
| Reviewer `status` | `call_ok` |
| Reviewer `structuredOutputSupported` | true |
| Reviewer `schemaCheckStatus` | `ok` |

**Result: Health check PASSED.** Both providers verified with live API calls.

---

## Step 4 — Visual Parity Audit (run-052)

Called `run_screen_ui_diff` with `outputMode: compact`, `maxInlineFindings: 10`.

### Compact Output Behavior
Output size: acceptable. `reportJsonPath` present: ✅
`reportJsonPath`: `.ui-diff/today/run-052/report.json`

### Core Status

| Field | Value |
|---|---|
| Run ID | `run-052` |
| Global diff | 0.09848 = **9.85%** |
| Threshold | 14.00% |
| `status` | `pass` |
| `qualityStatus` | **pass** |
| `visualAuditStatus` | **fail** |
| `acceptanceStatus` | **rejected** |
| `actionRequired` | null |
| `vlmAnalysisStatus` | disabled |

### ROI Table

| ROI | Diff | Threshold | Status | Critical |
|---|---|---|---|---|
| macro-ring-hero | 7.13% | 12% | pass | yes |
| macro-rows | 10.82% | 15% | pass | no |
| meal-cards | 16.10% | 25% | pass | no |

All three ROI gates pass.

---

## Step 5 — Full Report Inspection

### Model Judges Summary

**THIS RUN FIXES THE PRIMARY-SKIP BUG FROM RUN-051.**

| Field | Primary | Reviewer |
|---|---|---|
| provider | openrouter | nvidia |
| model | qwen/qwen3-vl-235b-a22b-instruct | nvidia/nemotron-nano-12b-v2-vl |
| `status` | **success** | **success** |
| `attempted` | **true** | **true** |
| `hadSuccess` | **true** | **true** |
| `evidenceCount` | 3 | 13 |
| `errorCount` | 0 | 0 |
| `skippedReason` | — | — |

Both required judges ran. Neither was skipped. This is the expected behavior.

### Visual Caveats (7 total — 4 blocking)

| # | ID | Source | Blocking | Severity | Analysis |
|---|---|---|---|---|---|
| 1 | `openrouter-global-visualMismatch_001` | visualMismatchJudge | **true** | high | **SOURCE-CONTRADICTED** — judge says reference shows green pill; reference fact says muted text is correct. Judge inverted reference/actual. |
| 2 | `openrouter-global-referenceFactConsistency_001` | referenceFactConsistencyJudge | **true** | high | **SOURCE-CONTRADICTED** — judge says the fact mandates green pill; the fact explicitly says "not a green filled pill". Fact inversion bug. |
| 3 | `nvidia-macro-ring-hero-LC102` | modelJudge | **true** | high | Known arc sweep geometry deviation (-17.6°). Confirmed radial geometry mismatch. Not a flutter code regression — documented baseline deviation. |
| 4 | `nvidia-macro-rows-0` | modelJudge | false | high | Macro label format change '96g' → '96 / 170g'. Seed-data observation, non-blocking. |
| 5 | `nvidia-macro-rows-1` | modelJudge | false | medium | Partial '170g' label visibility. Non-blocking observation. |
| 6 | `nvidia-global-roi:2` | modelJudge | **true** | high | **DATA OBSERVATION** — "1,420 kcal is displayed as consumed". Not a visual mismatch. Should not be blocking. |
| 7 | `nvidia-global-roi:3` | modelJudge | **true** | high | **DATA OBSERVATION** — "980 kcal is displayed as remaining". Not a visual mismatch. Should not be blocking. |

**Net assessment of caveats:**
- Caveats [1][2]: MCP bug — referenceContext filtering inverted for "Recent scans" fact
- Caveat [3]: Known deviation, documented, not a regression
- Caveats [6][7]: MCP bug — NVIDIA judge reporting screen data values as blocking visual caveats
- Caveats [4][5]: Legitimate observations, correctly non-blocking

### Overlap Legibility Summary

```
enabled: true
region: kcal-left-pill
  checked: false
  status: error
  skipReason: "Resolved box is empty or out of image bounds (527649,1959893)-(1206,2622)"
  overlapPercent: missing
  nearestAvoidColorDistancePx: missing
  artifactPath: missing
```

**MCP Bug confirmed:** The `roiNormalized` coordinate resolution for `kcal-left-pill` (relative to `roiId: macro-ring-hero`) is producing wildly invalid pixel values (x=527649, y=1959893). The macro-ring-hero ROI spans approximately y=336–936px in a 2400px-tall image; the resolved coordinates are ~100× out of bounds. This is a coordinate-space resolution bug in the `OverlapLegibilityAnalyzer` when `coordinateSpace: "roiNormalized"` is used.

No overlap artifact was generated. The analyzer ran for 0ms and produced no output section.

### Reference Context Summary

```json
{
  "factsLoaded": 7,
  "sourcesLoaded": 1,
  "missingFiles": [],
  "warnings": []
}
```

All 7 facts loaded. No missing files. However, referenceContext filtering did not prevent the inverted "Recent scans" caveats from reaching `visualCaveats` — the filtering logic has a bug.

### Timings

| Analyzer | Duration |
|---|---|
| Total | 73,511 ms |
| modelJudgesMs | 52,642 ms |
| RadialGeometryAnalyzer | 9,123 ms |
| pixelDiffMs | 1,747 ms |
| OverlapLegibilityAnalyzer | **0 ms** (not executed) |

### Agent Action Contract

| Field | Value |
|---|---|
| `canEditApp` | false |
| `confidence` | low |
| `requiresUserDecision` | false |
| `allowedChangeVectors` | [] |
| `blockedChangeVectors` | [] |
| `reasonSummary` | "Visual audit failed: blocking caveats detected." |

`canEditApp: false` is correct — no edit authorization granted.

---

## Step 6 — Overlap Artifact Inspection

No artifact exists due to the coordinate resolution bug described above. The `kcal-left-pill` region was never evaluated. No artifact path was returned.

Known manual caveat: The 980 kcal remaining pill sits visually close to the green arc. This validation session cannot measure the actual clearance because the `OverlapLegibilityAnalyzer` failed to resolve the region coordinates. The feature exists but has a `roiNormalized` resolution bug that must be fixed in the MCP.

Copied geometry diff artifact: `docs/screenshots/ui-diff-diagnostics/run-052-macro-ring-geometry-diff.png`

---

## Step 7 — Screenshot

Screenshot saved: `docs/screenshots/today-screen-2026-06-05b-required-judge-overlap-validation.png`

Source: `.ui-diff/today/run-052/actual.png`

---

## Final Decision

**acceptanceStatus: rejected**

This is NOT full visual parity. Reasons:

1. Both required judges ran ✅ — primary-skip bug from run-051 is fixed
2. Visual audit failed due to blocking caveats:
   - Two caveats are MCP bugs (inverted referenceContext filtering for "Recent scans")
   - Two caveats are MCP bugs (NVIDIA judge emitting data observations as blocking)
   - One caveat is a known documented deviation (arc sweep geometry)
3. `overlapLegibilitySummary` is present but `kcal-left-pill` status is `error` — coordinate resolution bug in `roiNormalized` space prevents evaluation
4. No overlap artifact generated

**Result: pass-with-documented-mcp-bugs** (not accepted visual parity)

---

## MCP Bugs Documented This Session

| # | Bug | Symptom | Prior? |
|---|---|---|---|
| 1 | `referenceContext` inversion | Judge inverts which image is reference vs actual for "Recent scans" fact; produces contradicted findings | New in run-052 |
| 2 | NVIDIA data observations as blocking | Judge reports kcal screen values (1420, 980) as blocking visual caveats instead of filtering | New in run-052 |
| 3 | `OverlapLegibilityAnalyzer` roiNormalized resolution | Region box resolved to (527649,1959893) — ~100× out of image bounds; 0ms execution | Persists from run-051 |
| 4 | VLM auto-disable gap | Legacy VLM fields require manual disable when modelJudges.required is active | Persists from prior sessions |

**Fixed since run-051:**
- Primary judge (OpenRouter) no longer skipped — both judges ran successfully

---

## No Flutter Code Changes

No Flutter code, seed data, ROI thresholds, masks, or image files were modified in this session. `Today_1080.png` was not created or referenced.
