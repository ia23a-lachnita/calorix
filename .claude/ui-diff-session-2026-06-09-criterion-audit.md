# UI Diff Validation Session — 2026-06-09 (Criterion Audit Architecture)

## Objective

Validate the rebuilt mobile-ui-diff MCP architecture where `overlapLegibility` no longer passes
merely because a configured box is inside bounds. Judges now receive full/contextual screen
evidence and must verify whether the box actually targets the intended UI element.

## Calorix Branch/Commit Before Validation

- Branch: `main`
- HEAD at session start: `f91ff44` — "Validate Today run-054: both judges pass, overlap fix confirmed"
- Repo state: clean

## Config Changes Made

Two changes to `ui-diff.config.json`:

1. **`today-recent-scans-badge` fact** — added `blocksClaimsMatching` and `blocksChangeVectors`,
   and changed `subject` from `"global"` to `"recent-scans-count"`:
   ```json
   "blocksClaimsMatching": [
     "green filled pill", "green pill", "filled pill",
     "recent scans label appears as a green", "recent scans should be green", "not muted"
   ],
   "blocksChangeVectors": ["badge_style"]
   ```

2. **`kcal-left-pill` overlapLegibility region** — added `target` metadata (no `onMismatch`):
   ```json
   "target": {
     "expectedText": "980 kcal left",
     "anchorDescription": "rounded kcal-left pill below the central calorie value, near the lower part of the macro ring",
     "mustContainText": ["980 kcal left"],
     "mustNotMatch": ["1,420", "of 2,400", "central calorie value", "center calorie text"]
   }
   ```

3. **`kcal-left-pill` box coordinates** updated during Phase 2 iterations:
   - Original: `{x:0.36, y:0.58, width:0.28, height:0.11}`
   - Final: `{x:0.28, y:0.74, width:0.44, height:0.09}`

## Judge Health Check

Tool: `mcp__mobile-ui-diff__model_judges_health`  
Parameters: `{screen:"today", configPath:"ui-diff.config.json", mode:"deep"}`

**Result: OK**
- primary: openrouter / qwen/qwen3-vl-235b-a22b-instruct → `call_ok`, `structuredOutputSupported: true`
- reviewer: nvidia / nvidia/nemotron-nano-12b-v2-vl → `call_ok`, `structuredOutputSupported: true`
- `willFailHard: false`

## Run Summary

| Run | Capture | qualityStatus | visualAuditStatus | acceptanceStatus | Primary | Reviewer | kcal-left-pill targetStatus |
|---|---|---|---|---|---|---|---|
| run-055 | invalid (device asleep) | fail | not_run | rejected | — | — | — |
| run-056 | valid | pass (9.83%) | error | rejected | error (0 evidence) | success (12) | **not_matched** → `invalid_target` ✅ Phase 1 |
| run-057 | valid | pass (9.83%) | fail | rejected | **success** (3) | success (16) | **not_matched** → `invalid_target` |
| run-058 | valid | pass (9.83%) | error | rejected | error (0 evidence) | success | — |

### Run IDs

- `reportJsonPath` run-056: `.ui-diff/today/run-056/report.json`
- `reportJsonPath` run-057: `.ui-diff/today/run-057/report.json`
- `reportJsonPath` run-058: `.ui-diff/today/run-058/report.json`

## Phase 1 — Criterion Audit Architecture Validation (run-056)

**Result: CONFIRMED — invalid_target correctly detected**

The criterion audit received: full expected screen, full actual screen, annotated actual screen,
generous expected crop, generous actual crop, and the overlap artifact. All 6 artifact paths sent.

Primary judge reasoning (run-056):
> "The magenta box in the annotated actual screen highlights the large central calorie value
> '1,420'. According to the target contract, the intended element is the 'Kcal-left pill'
> which should contain the text '980 kcal left' and be located below the central value. The
> box is pointing at the wrong element, which is explicitly listed in the 'Must NOT match'
> clause. Therefore, this is a target mismatch."

- `overlapLegibilitySummary.status: "invalid_target"` ✅
- `targetStatus: "not_matched"` ✅
- `measurementStatus: "not_evaluated"` ✅
- `judgeAuditStatus: "target_mismatch"` ✅
- `acceptanceStatus` correctly "rejected" (not accepted) ✅
- `actionRequired` and `agentActionContract.reasonSummary` clearly explain the rejection ✅

**The new criterion-audit MCP architecture works as designed.**

## Phase 2 — Box Coordinate Adjustment (run-057, run-058)

After Phase 1 confirmed the box at `y=0.58` targets "1,420", the box was shifted down
iteratively to locate the "980 kcal left" pill.

| Box | Primary verdict | Reviewer verdict | Final |
|---|---|---|---|
| `{y:0.58, h:0.11}` | not_matched ("1,420") | matched | not_matched |
| `{y:0.68, h:0.12}` | not_matched ("of 2,400") | matched | not_matched |
| `{y:0.74, h:0.09}` | error (primary failed) | partial | inconclusive |

Run-057 is the most complete data point: both judges ran, primary got 3 evidence items.
Primary still returned `not_matched` at `y=0.68` ("box is on 'of 2,400'").
Reviewer returned `matched` at `y=0.68`.

Primary judge intermittency: OpenRouter returned empty evidence in runs 056 and 058, but
succeeded in run-057 (3 evidence items). This is provider flakiness, not an MCP config error.
A clean Phase 2 completion requires a run where the primary judge succeeds AND the new
box coordinates are evaluated.

The session note was written before obtaining a primary-confirmed `matched` result for the
final box `{y:0.74, h:0.09}`, per user instruction to stop iterating on box coordinates.

## criterionJudgesSummary — run-057 (best complete run)

- `totalRegions: 1`, `attempted: 1`, `hadSuccess: true`, `errorCount: 0`
- Both judges sent: full expected screen, full actual screen, annotated actual, generous crops, artifact ✅
- `primaryTargetStatus: "not_matched"` (at y=0.68 box)
- `reviewerTargetStatus: "matched"`
- `finalTargetStatus: "not_matched"` (conservative, primary wins)
- `finalMeasurementStatus: "not_evaluated"`
- `finalJudgeAuditStatus: "target_mismatch"`

## overlapLegibilitySummary — run-057

- `status: "invalid_target"` (primary wins over reviewer disagreement)
- `overlapPercent: 6.8%` (box now touches green ring arc, exceeds 1.0% threshold)
- `severity: "warning"` (non-blocking) ✅
- `resolvedBox: {x:343, y:813, width:520, height:79}` in expected space (1206×2622)

## modelJudgesSummary — run-057

| Role | Provider | status | attempted | hadSuccess | evidenceCount | errorCount |
|---|---|---|---|---|---|---|
| primary | openrouter / qwen3-vl-235b | **success** | true | true | 3 | 0 |
| reviewer | nvidia / nemotron-nano-12b | **success** | true | true | 16 | 0 |

Both judges ran without skip. ✅

## Blocking Caveats (run-057)

**Credible blocking:**
1. `openrouter-macro-rows-macro-progress-row-text-formatting` — "96g / 170g" vs "96 / 170g"
   (confirmed real UI issue, same as run-054)

**Likely false positives / low-confidence:**
- nvidia date display, recent scans text, ring geometry findings consistent with prior sessions

## Recent Scans blocksClaimsMatching

In run-057 `visualCaveats`, `nvidia-global-2` references "The detail mismatching" for
`roi:Recent scans display` — vague, no green-pill claim. The `blocksClaimsMatching` filter
appears to have suppressed specific green-pill claims from appearing as blocking findings.
No caveat contains "green filled pill", "green pill", or "not muted". ✅

## agentActionContract

- `canEditApp: false` ✅
- `allowedChangeVectors: []` ✅
- No seed data or fixture recommendation made ✅

## Files Saved

- `docs/screenshots/today-screen-2026-06-09-criterion-audit-validation.png` — actual screenshot (run-057)
- `docs/screenshots/ui-diff-diagnostics/run-057-kcal-left-pill-overlap.png` — overlap artifact
- `docs/screenshots/ui-diff-diagnostics/run-056-kcal-left-pill-invalid-target-annotated.png` — Phase 1 annotated (box on "1,420")
- `ui-diff.config.json` — updated with blocksClaimsMatching, target metadata, adjusted box
- `.claude/ui-diff-session-2026-06-09-criterion-audit.md` (this file)

## Conclusion

**Incomplete — Phase 1 validates criterion-audit architecture; Phase 2 box calibration inconclusive.**

The new MCP criterion-audit architecture is confirmed working: a box at the wrong position
correctly returns `invalid_target` with a clear primary judge reasoning explaining exactly
what the box is targeting and why it mismatches the target contract. The previous MCP would
have passed this geometrically (0% green overlap). The new architecture catches semantic
mismatch. This is the primary validation goal of this session and it is confirmed. ✅

Phase 2 box calibration was not completed to `targetStatus: matched` due to primary judge
intermittency (OpenRouter returning empty evidence in 2 of 3 runs) and per user instruction
to stop iterating. The final box `{y:0.74, h:0.09}` is the current config state; it requires
one clean run with a successful primary judge to confirm whether it reaches `matched`.

No Flutter code changes. No seed data changes. No ROI threshold changes.
