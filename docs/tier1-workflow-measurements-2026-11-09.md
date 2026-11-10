# Local workflow measurements

Latest capture update: fresh photos now offer the existing explicit cloud consent directly. [Current signed APK, verification and scope](tier1-fast-capture-verification-2026-11-10.md). History photos retain the Estimate photo button.

The existing photo, estimate, correction and save routes now have optional local measurement journals. They do not change the original prediction, nutrient calculation, meal revision or consumption confirmation. No new model calls, permissions, dependencies or cloud telemetry were added.

## Native verification update — 2026-11-10

The pending device blocker is resolved. Ordinary wake/nonsecure dismissal opened Calorix; no authentication change was needed. Native correction/cancel/no-op/restore/stale-edit protection, preparation answer, export Cancel/actual clipboard JSON, journal cleanup and local CameraX capture/deletion passed on the exact installed APK. Final ARTEMIS readiness is5/5 required checks with a working hierarchy, optional recording unavailable. [Full sampled native verification and limits](tier1-native-workflow-verification-2026-11-10.md). No new real accuracy or human-effort measurements were obtained. The November9 blocked notes below are historical, not the current state.

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

## Verified result

Tested source: `b08919221eb3b085fabbe8bd21fb9e61cb258c04`, branch `feat/tier1-photo-pilot`. [Canonical CI42653648480](https://github.com/ia23a-lachnita/calorix/actions/runs/42653648480) completed successfully:98 backend files/5354 tests passed with1 historical skip;1016 Flutter tests passed with1 historical skip;54 Python tests and17 Node guards passed. TypeScript build, ESLint and `fvm flutter analyze lib/features/tier1 test/tier1` passed. Host FVM is unavailable; Flutter verification ran in the canonical workflow, without modifying its gates.

Actual test-first evidence: the13 pure meter/store tests failed on missing APIs before implementation, then passed. The9 initial UI tests failed on missing hooks/export APIs after correcting an `await void` harness error. Fresh whole-feature review found0 Critical,2 Important and1 Minor issue. Four regression cases then reproduced committed-success double classification, disposed-controller refresh after navigation, omitted late portion failure and persistence-inflated dialog timing; the strengthened final RED run42651960744 had1012 passes/1 skip/4 expected failures. All4 pass in the final run. Malformed Python kind/source/answer-code dict/list values produced6 actual TypeErrors before type guards; all54 Python tests now pass. Intermediate full runs were cancelled or failed as recorded in Git history; they were never counted as successful full gates. The final lint repair only renamed a test helper, without suppressions or weakened assertions.

The independent reviewer also recomputed25 synthetic paired arithmetic cases and the first-correction selection. These are fixtures, not observed meals. Required Antigravity MCP pre-plan, source/privacy and result review used `gemini-3.8-flash`, `approvalMode:yolo`, conversation `calorix-tier1-workflow-20261109`, ending with explicit `AGREEMENT_STATUS: agree` / `MUST_FIX: none`; no fallback route was needed for this workstream. Overbroad review statements about memory exhaustion, synchronous/universal deletion, exposure timing and all-Firebase-disabled were corrected and not adopted. Explicit client Firebase initialization for consented cloud inference remains functional. Review was source/numeric evidence review, not exhaustive visual inspection or general security/readiness approval.

### APK and running it

[Download signed test APK artifact13691887699](https://github.com/ia23a-lachnita/calorix/actions/runs/42653648480/artifacts/13691887699), expiring2026-12-09T16:40:17Z. Extract the ZIP and install `calorix-1.0.0+1-android-test.apk` as an update. Open Calorix, take a photo, choose Estimate photo and explicitly consent to cloud processing, then check/edit/save the approximate result. Manual entry remains available. History or a meal's export action opens the optional measurement disclosure.

- APK SHA256: `d911b12e8e6af325738e39892656f66ea748e34b3a97d41a0fd9fe278e768dd9`.
- Trusted signer SHA256: `38815fd37711f170e534cf3c8767de7f0f7ca5f958e755d8a47b03fe2b764b7c`.
- CI performed cryptographic signature verification; downloaded metadata/source/checksum and native V2 certificate identity matched. Compiled manifest inspection confirmed absent FirebaseInitProvider, backup/fullBackup disabled, messaging auto-init and analytics collection disabled. The bound extraction XML excludes root/file/database/sharedpref/external from both cloud backup and device transfer. This is a compiled-controls check, not a blanket security approval.
- The authorized SM-G780G/Android13/serialR58R61161NA received `install -r` successfully. Its installed base APK SHA256 equals the artifact. Every existing Tier1 file hash and meal JSON byte remained identical:1 file,0 saved meals. No app launch or UI interaction was performed during this update; no cloud photos/model calls were sent.

### Historical runtime blocker — resolved November10

Fresh ARTEMIS diagnosis reports4/5 required checks, **Device Locked**, hierarchy0, no active/queued task and no fixes applied. The exact required guidance is: **“Unlock the phone and keep the screen on (UIAutomator cannot dump a locked or sleeping screen).”** Optional scrcpy recording is unavailable; no software was installed. Further UIAutomator recovery commands were not attempted ahead of the required unlock.

Before test authoring, direct ARTEMIS hierarchy plus grounded, serial-pinned ADB verified Camera, empty History and Manual entry on the preceding signed baseline. Existing exact-binary portion traces supplied the remaining interaction grounding. Autonomous ARTEMIS trace98aaad91-65f7-4ada-8aa9-990210105acc hit429 RESOURCE_EXHAUSTED on the3.6 Flash free route and was cancelled; it is not a successful autonomous run. An unrelated historical failed-task entry returned by diagnosis is not evidence about this feature.

**At the November9 handoff, native UI, journal creation/deletion and clipboard interaction were unverified; the November10 update above resolves those sampled checks.** Installation/hash/data preservation and automated tests do not replace those checks. No current UI-diff run exists: final diff counts, `auditLimited` and `visualClassificationStatus` are not applicable. Neither exhaustive nor sampled current-source visual parity is claimed. The owned diagnostic fixture was removed, preserving all other records(0); its source was an existing offline prediction, not a new inference or weighed reference.

An empty fixture smoke run can be reproduced without private data:

```sh
python3 evaluate_workflows.py docs/tier1-workflow-empty.json docs/tier1-pilot-empty.json
```

It returns0 pairs and null accuracy/effort/cost; exclusive output creation was verified to preserve an existing report byte for byte. Actual reference-backed correction pairs and measured active user effort remain0/unknown. Production inference, prompt/schema, nutrient catalog, dependencies and all frozen prediction receipts are unchanged.

**Next single experiment:** one actual reference-blind optional portion correction per meal, comparing before/after served error against separate weighed references and recording the clearly labeled foreground proxy. Compatible existing public references can be reused; no oracle-weight substitution or simulated human timing can establish real correction benefit. This remains within V7.1's one-photo baseline. The deferred30-meal Android pilot and broader accuracy qualification are unfinished.
