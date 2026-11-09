# Local workflow measurements

The existing photo, estimate, correction and save routes now have optional local measurement journals. They do not change the original prediction, nutrient calculation, meal revision or consumption confirmation. No new model calls, permissions, dependencies or cloud telemetry were added.

## Using the measurements

Use Calorix normally. An optional portion correction records its original and corrected whole-meal served kcal, changed grams and a monotonic foreground timing proxy. Cancel, unchanged Apply, invalid input, revision conflict and failures have separate event kinds. A preparation answer remains optional; logging does not require a post-meal action.

In History or an existing meal, tap **Export measurements**. The disclosure explains the contents; only **Copy JSON** writes to the clipboard. Cancel does not copy. Save the copied JSON to a private file. It contains meal/session IDs, timing events, estimates, correction quantities and model/prompt identifiers where available; it omits food names, photos, paths, raw errors and free-text answers. IDs and timestamps can still identify or link activity. Copies are outside app deletion controls. Exports above500000 UTF-8 bytes are refused; export one meal instead.

Exports describe **currently retained meals**, not every historical capture attempt. A deleted meal's private journal is deleted too. Old meals, process interruptions, failed metric writes and corrupt/incomplete journals can leave missing measurements. Journals retain their earliest256 events with explicit dropped-event counts; truncated logs are excluded from primary pairs. Unsaved manual sessions leave no journal. This is a diagnostic route, not a guarantee of complete telemetry or zero overhead.

## Evaluating corrections offline

Keep references in a **separate** file following [meal_schema.json](../meal_schema.json) and [reference_sop.md](../reference_sop.md). Match its `meal_id` to the exported `mealId`; assign each distinct physical meal its own `physical_meal_id`. Record actual weighed recipe inputs, cooked-batch yields, plated portions and served/consumed grades. Estimated portions and repeated estimates must never be copied into a reference as measured truth.

```sh
python3 evaluate_workflows.py private-workflows.json private-references.json --output new-workflow-report.json
```

The output path must be new. The evaluator selects the first genuine portion correction from the original analysis with no previous portion adjustment, once per meal. Later edits remain secondary counts and do not remove difficult meals retrospectively. Before/after MAE, bias, P90 and normalized error use the identical paired subset. Served-A is primary; A+B is a sensitivity. Missing/unmatched/unscorable references, incomplete journals and absent eligible corrections remain visible in coverage. This is a conditional correction comparison, not population accuracy or all-attempt failure rate. Repeat exports overlap; do not count the same meal twice.

## Timing boundaries

- `elapsedMs` is monotonic session elapsed time; `foregroundMs` includes foreground reading, idle, animation and local processing. `waitingMs` is its analysis-wait subset. Their difference is an **editor foreground proxy**, not validated active-user effort. Background and optional export interaction are excluded from that proxy; process restarts do not resume sessions. Missing editor-close events remain incomplete.
- `dialogForegroundMs` spans opening a portion dialog through its route removal, before asynchronous persistence. It includes reading/idle and dialog animation, excludes background, and is not touch-active time. The evaluator reports its p50/P90 separately from calorie accuracy; references are not required for this timing proxy.
- `clientAnalysisMs` includes the local consent-save/network/inference/result-save path up to its named event. It is not provider-only latency. `shutterToResponseMs`, `shutterToSavedMs` and `shutterToFrameMs` are known only for the immediate same-process capture route. These `shutter` fields start immediately before the camera API call, rather than at a verified hardware exposure timestamp, and include capture/storage and any user delay before consent. They are not compute-plus-network-only latency. Reopened meals have null shutter timing. The frame event marks a foreground Flutter callback, not a measured physical display presentation.
- Clock regressions make timings unknown. Question proposals/availability/answers and navigation are separate events, not proof that a question was read. Retake linkage, validated active attention and complete cross-process wall-clock workflows are not measured. Raw events permit path-aware inspection; the offline paired evaluator does not certify V7.1 latency targets.

## Evidence and limits

Automated synthetic tests check timing arithmetic, first-correction selection, reference joining, privacy fields, deletion/serialization, explicit copying, failures and navigation. They do not measure actual correction benefit, real user effort or calorie accuracy. The previous40 public scan IDs/100 food prediction receipts remain unchanged; owner weighed Android references remain0/30.

Current-source CI, independent/external review, artifact verification and native-runtime limitations are recorded in the final verification section once available. No new runtime or release-readiness claim is made by this draft.
