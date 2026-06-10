# Today Screen Anchor Acceptance — Reseeded Run with Fixed MCP (2026-06-10)

## Run identity

- **Run name:** run-acceptance-reseeded-fixed-2026-06-10
- **Date:** 2026-06-10
- **Device:** Samsung SM-G780G (serial R58R61161NA, Android)
- **Calorix commit:** 02e23089e17b49a3e2078a8b756050a3ebea6c87
- **MCP commit:** 1fb305a0c20ec0f76b7fafe0814fa298945bdb2b
- **MCP build:** dist/index.js (npm run build clean, 542/542 tests passing)

## Purpose

Rerun of the reseeded Today screen acceptance test after the MCP silent global/ROI judge failure fix.
The fix ensures that if a required OpenRouter-backed global/ROI judge returns empty/unparseable output,
report.json must include `failureReason`, `rawResponsePreview`, and `errorCount >= 1` in `failedRois`.

## Commands run

```powershell
# Phase 0 — MCP build and test
cd C:\Users\xursc\projects\mobile-ui-diff-mcp
npm run build        # clean, no errors
npm test             # 38 test files, 542 tests, all passed

# Phase 1 — Reseed via debug deeplink
adb -s R58R61161NA shell am start -a android.intent.action.VIEW -d "calorix://debug/reseed" com.calorix.calorix/.MainActivity

# Phase 2 — Anchor dump integration test
fvm flutter test integration_test/today_anchor_dump_test.dart --device-id R58R61161NA --no-pub
# Extracted anchor JSON via [anchor-json-start]/[anchor-json-end] stdout sentinels

# Phase 3 — Screenshot capture
mcp__mobile-ui-diff__capture_android_screenshot (deviceId: R58R61161NA)

# Phase 4 — MCP validation
mcp__mobile-ui-diff__run_screen_ui_diff(screen: "today", actualImage: ..., runName: "run-acceptance-reseeded-fixed-2026-06-10")
```

## Reseed confirmation

- **980 kcal left:** ✅ confirmed in both reseed-verify.png and actual.png
- **Data:** 1,420 kcal eaten / of 2,400, Protein 96g/170g, Carbs 132g/250g, Fat 38g/70g

## Artifacts

- **Actual screenshot:** `.ui-diff/today/current/actual.png`
- **Anchor JSON:** `.ui-diff/today/current/flutter-anchors.json`
- **Flutter anchors done:** `.ui-diff/today/current/flutter-anchors.done`
- **Target map:** `docs/ui-diff/target-maps/today-anchor-target-map.json`
- **Report JSON:** `.ui-diff/today/run-acceptance-reseeded-fixed-2026-06-10/report.json`
- **Annotated actual:** `.ui-diff/today/run-acceptance-reseeded-fixed-2026-06-10/overlap-legibility-today.kcalLeftPill.legibility-annotated.png`
- **kcalLeftPill expected crop:** `.ui-diff/today/run-acceptance-reseeded-fixed-2026-06-10/overlap-legibility-today.kcalLeftPill.legibility-expected-crop.png`
- **kcalLeftPill actual crop:** `.ui-diff/today/run-acceptance-reseeded-fixed-2026-06-10/overlap-legibility-today.kcalLeftPill.legibility-actual-crop.png`
- **kcalLeftPill diagnostic overlap:** `.ui-diff/today/run-acceptance-reseeded-fixed-2026-06-10/overlap-legibility-today.kcalLeftPill.legibility.png`

## targetResolutionSummary — today.kcalLeftPill

| Field | Value |
|---|---|
| source | flutter_anchor |
| measurementBoxSource | flutter_anchor |
| rectLogical | `{x: 138.64, y: 269.83, width: 82.71, height: 20}` |
| rectActualPx | `{x: 415, y: 809, width: 250, height: 61}` |
| rectComparisonPx | `{x: 463, y: 883, width: 280, height: 68}` |
| transformActualToComparison | true |
| visible | true |
| visibleFraction | 1.0 |
| resolvedViaFlutterAnchor | 1 |
| resolvedViaManualFallback | 0 |

Anchor dimensions note: flutter-anchors.json reports screenshotHeightPx=2355 (Samsung Knox stdout capture); actual screenshot is 1080×2400. MCP used actual screenshot dimensions for coordinate transform (warning logged).

## criterionJudgesSummary — today.kcalLeftPill.legibility

| Field | Value |
|---|---|
| primaryTargetStatus | matched |
| reviewerTargetStatus | matched |
| finalTargetStatus | matched |
| finalMeasurementStatus | caveat |
| finalJudgeAuditStatus | caveat |
| overlapPercent | 7.77% |
| maxOverlapPercent | 1.0% |
| nearestAvoidColorDistancePx | 1 px |
| minClearancePx | 4 px |
| severity | warning |
| blocking | false |

## modelJudgesSummary

### Primary (OpenRouter)

| Field | Value |
|---|---|
| provider | openrouter |
| model | qwen/qwen3-vl-235b-a22b-instruct |
| status | **partial** |
| attempted | true |
| hadSuccess | true |
| evidenceCount | 4 |
| errorCount | 3 |

**Change from previous run:** Previous run had `status: error`, `hadSuccess: false`, `evidenceCount: 0`, `errorCount: 0` (completely silent).
This run has `status: partial`, `hadSuccess: true` — OpenRouter succeeded for `macro-rows` (4 evidence items) and failed silently for 3 ROIs.

### Reviewer (NVIDIA)

| Field | Value |
|---|---|
| provider | nvidia |
| model | nvidia/nemotron-nano-12b-v2-vl |
| status | success |
| attempted | true |
| hadSuccess | true |
| evidenceCount | 13 |
| errorCount | 0 |

### failedRois (OpenRouter silent failures — fix diagnostics confirmed)

| roiId | failureReason | rawResponsePreview |
|---|---|---|
| macro-ring-hero | unknown_empty_failure | `<missing_error_detail>` |
| meal-cards | unknown_empty_failure | `<missing_error_detail>` |
| global | unknown_empty_failure | `<missing_error_detail>` |

The `<missing_error_detail>` sentinel is the MCP fix output — these fields were absent/undefined in the previous run. The fix is confirmed working.

## cacheSummary

| Field | Value |
|---|---|
| judgeCachePath | `.ui-diff/cache/criterion-judge-cache.json` |
| attempted | 1 |
| cached | 0 |
| fresh | 1 |

## Final verdict

| Check | Result |
|---|---|
| MCP anchor pipeline working? | **yes** — flutter_anchor resolved, coordinates correct |
| OpenRouter operational failure? | **partial** — succeeded for macro-rows, failed for macro-ring-hero/meal-cards/global with `unknown_empty_failure` |
| MCP fix surfacing diagnostics? | **yes** — failedRois now contains failureReason + rawResponsePreview for each failed ROI |
| visualAuditStatus | **fail** |
| acceptanceStatus | **rejected** |
| actionRequired | null (visual findings present, not infrastructure-only failure) |
| visual parity accepted? | **no** |

## Blocking visual findings (artifact-backed)

### 1. Macro rows — protein text format mismatch (OpenRouter, confidence 0.95, blocking)
- **Finding:** App displays `96g / 170g`; mockup shows `96 / 170g`
- **Source:** OpenRouter judge for macro-rows ROI (succeeded, 4 evidence points)
- **Classification:** deterministic artifact-backed bug — judge read actual rendered text
- **Action required:** Remove extra 'g' unit after current protein value in macro row widget

### 2. Macro ring — #19D3D9 (carbs) arc sweep −17.6° (NVIDIA, confidence 0.95, non-blocking)
- **Finding:** Carbs arc sweep is 17.6° short of expected
- **Source:** NVIDIA reviewer + radial geometry diagnostics
- **Classification:** Known from previous runs; confirmed again
- **Action:** Investigate progress-to-sweep mapping for carbs arc

### 3. Meal cards layout — multiple blocking differences (NVIDIA, blocking)
- Thumbnail square vs rounded rectangle (confidence 0.99)
- Nutrition section moved from above to below meal content (confidence 0.98)
- Confirmed label position differs (confidence 0.95)
- Confidence percentage font weight thicker than mockup (confidence 0.97)
- **Classification:** Visual structure differences; require artifact inspection before editing Flutter

### 4. kcalLeftPill overlap caveat (warning, non-blocking)
- overlapPercent 7.77% vs maxOverlapPercent 1.0%
- nearestAvoidColorDistancePx: 1 px
- severity: warning, blocking: false
- **Classification:** pre-existing known issue; arc color bleeds into pill region

## OpenRouter partial failure — next investigation steps

OpenRouter succeeded for `macro-rows` but returned empty evidence for `macro-ring-hero`, `meal-cards`, and `global`. All failures have `unknown_empty_failure` with `<missing_error_detail>`, meaning the response was empty with no error body returned to the MCP.

Possible causes:
- Rate limiting / token limit exceeded for larger ROI crops
- Model context window exceeded for multi-image prompts
- Content filtering on larger screenshots
- ROI crop image size difference between macro-rows (narrow strip) vs ring/cards (larger area)

To distinguish: inspect OpenRouter dashboard logs or add raw HTTP response logging to the MCP provider layer.

Do not: swap models, disable required judges, or weaken visual_parity until root cause is identified.
