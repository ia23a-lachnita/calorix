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

**STOPPED — invalid capture (device asleep / screen off)**

Run ID: `run-053`
reportJsonPath: `.ui-diff/today/run-053/report.json`

| Field | Value |
|---|---|
| qualityStatus | fail |
| visualAuditStatus | not_run |
| acceptanceStatus | **rejected** |
| actionRequired.type | `invalid_capture` (blocking) |
| actionRequired.message | "Actual screenshot appears invalid or asleep." |
| globalDiffPercent | 30.46% (threshold 14%) |
| modelJudges | **not executed** — run aborted at capture validation |
| visualCaveats | none (judges never ran) |
| overlapLegibilitySummary | not produced (judges never ran) |
| OverlapLegibilityAnalyzer timing | 33ms (ran structurally, no output) |

**Delta vs run-052:** diffPercent 9.85% → 30.46% (+20.61%), `statusChanged: true`, trend: worsened. Root cause is black/asleep screenshot, not a Flutter regression.

ROI results (all invalid due to black capture):
- macro-ring-hero: 22.49% diff (threshold 12%) — fail
- macro-rows: 55.22% diff (threshold 15%) — fail
- meal-cards: 45.72% diff (threshold 25%) — fail

**Neither required judge ran. MCP fix verification is still pending.**

## What Changed Since run-052

The MCP was reportedly rebuilt to fix:
- Coordinate resolution bug (invalid ~100× out-of-bounds pixel values in OverlapLegibilityAnalyzer)
- Data-as-caveat emission (NVIDIA judge emitting 1420/980 kcal as blocking visual caveats)
- referenceContext filtering inversion

These fixes cannot be verified until a valid (awake device) capture is obtained.

## Files Saved

- `.claude/ui-diff-session-2026-06-06.md` (this file)

No screenshot or overlap artifact saved (capture invalid).

## Conclusion

**Incomplete — device asleep, invalid capture.**

Health check passed on second attempt (keys restored). Run-053 was launched but aborted immediately: the actual screenshot is near-black, indicating the device screen was off or locked. No judges ran and no visual audit was performed. The run-052 MCP fix verification remains unconfirmed. No Flutter code, seed data, ROI thresholds, or masks were changed.

### Required Steps to Unblock

1. Wake and unlock the Android device (`adb shell input keyevent 82` or physically)
2. Verify app is foregrounded on the Today screen
3. Re-run `mcp__mobile-ui-diff__run_screen_ui_diff` (same parameters)
4. Confirm both judges execute (`visualAuditStatus: completed`, primary/reviewer `hadSuccess: true`)
5. Inspect overlapLegibilitySummary for kcal-left-pill coordinate resolution
