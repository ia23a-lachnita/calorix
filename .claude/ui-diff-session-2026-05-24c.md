# UI Diff Session — 2026-05-24c

## Scope

Continued from `.claude/ui-diff-session-2026-05-24b.md`.

Goal: make one focused Flutter iteration to reduce the Today macro ring visual footprint, then rerun mobile-ui-diff against the original full mockup.

## VLM Health

`vlm_health` was run before diffing:

- Provider: Ollama at `http://localhost:11434`
- Selected model: `moondream:latest`
- Installed: yes
- Load check: ok
- Image input verified: yes
- Warnings: none

The first `run_screen_ui_diff` attempt failed VLM preflight despite the successful health check. Retrying with explicit VLM overrides for `moondream:latest` worked. Later runs had VLM available; run-024 had one region-level VLM timeout fallback, but no `actionRequired`.

## Expected Image

Used:

`docs/mockups/image/dark/single/Today.png`

Confirmed:

- Original full mockup is still the expected image in `ui-diff.config.json`.
- `Today_1080.png` was not recreated.
- `Today_1080.png` is not referenced by live config/code. Only older session notes mention it historically.

## Code Changes

Changed only the Today screen `AnimatedMacroRing` call site:

`lib/features/today/today_screen.dart`

- Ring size: `260` -> `220`
- Stroke width: default `24` -> explicit `18`

No seed data, meal data, debug reseed flow, config masks, or meal-card layout were changed.

## Runs

### Invalid / Setup Runs

- `run-019`: invalid. Fresh release reinstall triggered Android notification permission dialog and showed empty data.
- `run-020` / `run-021`: invalid for final comparison. Release/debug install state caused reseed/auth timing issues and showed empty data.
- Switched back to debug APK because `calorix://debug/reseed` is gated by `kDebugMode`.
- Granted `POST_NOTIFICATIONS` on the Android device to avoid the first-run permission dialog blocking captures.

### Valid Runs

`run-018` is the pre-change baseline from the prior session.

`run-022` is the first valid run after the first adjustment (`size: 230`, `strokeWidth: 20`).

`run-024` is the final settled run after the second and final adjustment (`size: 220`, `strokeWidth: 18`).

| Run | Global diff | Status | qualityStatus | Notes |
|---|---:|---|---|---|
| run-018 | 17.08% | fail | pass | Baseline, correct seeded totals |
| run-022 | 13.77% | pass | pass | First valid post-fix run |
| run-024 | 12.76% | pass | pass | Final run, correct seeded totals |

Final run-024 seeded data verified in `actual.png`:

- `1,420` kcal eaten
- `980 kcal left`
- Protein `96g / 170g`
- Carbs `132g / 250g`
- Fat `38g / 70g`

## ROI Results

| ROI | run-018 raw | run-018 structural | run-018 status | run-024 raw | run-024 structural | run-024 status | dynamicMasked |
|---|---:|---:|---|---:|---:|---|---:|
| macro-ring-hero | 22.91% | 19.52% | fail | 18.21% | 15.34% | fail | 14.19% |
| macro-rows | 26.87% | 29.26% | fail | 6.93% | 8.30% | pass | 40.02% |
| meal-cards | 14.36% | 8.23% | pass | 13.32% | 6.82% | pass | 70.05% |

## Artifact Read

Inspected:

- `expected.png`
- `actual.png`
- `diff.png`
- `macro-ring-hero-expected.png`
- `macro-ring-hero-actual.png`
- `macro-ring-hero-structural-diff.png`
- `macro-rows-expected.png`
- `macro-rows-actual.png`
- `macro-rows-structural-diff.png`
- `report.json`

Findings:

- The ring bottom moved upward compared with run-018.
- Glow/bleed into the macro rows area is much lower.
- Macro rows no longer appear to have an independent layout bug; their failure was primarily caused by ring intrusion.
- Meal cards still pass structurally.
- The ring itself is still slightly too large/thick/glowy and overlaps the kcal-left pill more than the mockup. It remains just over the ROI threshold: 15.34% structural vs 15.00% max.

## Quality Status / Config Issue

`qualityStatus` is still `pass` in run-024 even though `macro-ring-hero` is `fail`.

Current Today ROI config:

- `macro-ring-hero` has `maxDiffPercent: 0.15`
- `macro-rows` has `maxDiffPercent: 0.15`
- `meal-cards` has `maxDiffPercent: 0.25`
- None of these ROIs are marked `critical: true`
- There are no `visualAssertions`

Interpretation: this is a config/MCP gating issue for the intended workflow. If `macro-ring-hero` should make `qualityStatus` fail, the ROI should be marked critical or covered by a visual assertion. The report also says "Screen acceptable by global and local gates" while a local ROI is failed, which is suspicious for UI-diff reporting semantics.

## Verification

- `fvm flutter build apk --debug` passed.
- `run_screen_ui_diff` produced final run `run-024`.
- `fvm flutter analyze` passed with no issues.
- `fvm flutter test test/today_screen_test.dart` passed: 6/6 tests.

## Next Action

Stop this iteration here. The current change fixed the macro rows regression and improved the macro ring substantially, but the ring ROI still barely fails. Next step should be a separate, focused pass on ring/pill composition, likely by reducing glow strength or adjusting the ring/pill layering rather than continuing to shrink the overall ring.
