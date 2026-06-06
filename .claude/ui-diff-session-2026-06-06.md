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

## Judge Health Check

Tool: `mcp__mobile-ui-diff__model_judges_health`
Parameters: `{ screen: "today", configPath: "ui-diff.config.json", mode: "deep" }`

**Result: UNAVAILABLE — both API keys missing**

```json
{
  "status": "unavailable",
  "primary": {
    "provider": "openrouter",
    "model": "qwen/qwen3-vl-235b-a22b-instruct",
    "apiKeyPresent": false,
    "envVar": "OPENROUTER_API_KEY",
    "status": "missing_key"
  },
  "reviewer": {
    "provider": "nvidia",
    "model": "nvidia/nemotron-nano-12b-v2-vl",
    "apiKeyPresent": false,
    "envVar": "NVIDIA_API_KEY",
    "status": "missing_key"
  },
  "effectivePolicy": {
    "visualAuditMode": "visual_parity",
    "enabled": true,
    "required": true,
    "policy": "always_audit",
    "allowEditSuggestionsOnPass": false,
    "willFailHard": true,
    "missingKeys": ["OPENROUTER_API_KEY", "NVIDIA_API_KEY"]
  },
  "message": "2 of 2 provider(s) failed (missing API keys)."
}
```

## Run Outcome

**STOPPED — health check failed. UI diff was not run.**

Per validation protocol: if health is not ok, stop. Do not run UI diff.

- Run ID: N/A (not executed)
- reportJsonPath: N/A
- qualityStatus: N/A
- visualAuditStatus: N/A
- acceptanceStatus: **incomplete — precondition failure**
- actionRequired: Restore `OPENROUTER_API_KEY` and `NVIDIA_API_KEY` environment variables, then re-run validation

## What Changed Since run-052

The MCP was reportedly rebuilt to fix:
- Coordinate resolution bug (invalid ~100× out-of-bounds pixel values in OverlapLegibilityAnalyzer)
- Data-as-caveat emission (NVIDIA judge emitting 1420/980 kcal as blocking visual caveats)
- referenceContext filtering inversion

These fixes cannot be verified until API keys are present in the environment.

## Files Saved

- `.claude/ui-diff-session-2026-06-06.md` (this file)

No screenshot or overlap artifact saved (run did not execute).

## Conclusion

**Incomplete — API key precondition failure.**

Both `OPENROUTER_API_KEY` and `NVIDIA_API_KEY` are absent from the process environment. The rebuilt MCP and config are otherwise correctly configured. No Flutter code, seed data, ROI thresholds, or masks were changed. Re-run validation after setting both keys in the shell or `.env` for this session.

### Required Steps to Unblock

1. Set `OPENROUTER_API_KEY` in the environment (or `.env` / PowerShell session)
2. Set `NVIDIA_API_KEY` in the environment
3. Re-run: `mcp__mobile-ui-diff__model_judges_health` with `mode: deep`
4. If health passes, run `mcp__mobile-ui-diff__run_screen_ui_diff` with compact output mode
