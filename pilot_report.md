# Tier1 pilot report

## Supported

Existing Flutter CameraX still capture, app theme, Firebase project and SDK were reused. The new local-first module implements retained JPEGs and available metadata, explicit per-photo cloud consent, manual estimates, editing/history/deletion, served-only defaults, optional confirmed intake and repeat confirmation. A stateless authenticated callable and CLI share pinned A1 inference and nutrient reconciliation. Six actual USDA SR Legacy records were retrieved; unsupported foods are explicitly unverified. Automated code tests exercise these behaviors; phone/build verification status is recorded below and in `docs/implementation-status.md`.

## Unsupported

No medical, general accuracy qualification, per-meal interval, unseen-user/device or production-readiness claim. Database nutrient records do not verify visual food matching or portion mass. A1 uses a hosted model ID, not downloadable immutable weights; returned model drift fails closed. The small catalog has limited coverage. A0 shares A1 recognition/preparation and tests serving priors only. No public-image outcome is a weighed Android reference.

## Measured public evaluation

Both frozen A1 variants now have predictions for30 unique Nutrition5k public scans (20 original plus10 energy-stratified), not30 independent completed meals. Active six-record baseline:30/30valid, served-kcal MAE112.02, bias−69.49, P90absolute error264.44. Additional10 alone:MAE192.99, with substantial underprediction on higher-energy scans. The73-record candidate has combined MAE111.93 but worse P90280.01 and normalized error; attribution improves without a consistent accuracy gain. It is archived, not promoted. [Full results, all30 rows, scope and verification](docs/tier1-mealrange-2026-11-08/report.md). Owner Android references remain separate.

## Android-specific measurements still missing

**Physical weighed Android meals:0/30.** Android-specific served/consumed MAE, bias, P90, mixed-meal accuracy, user correction rate, end-to-end phone latency and inference expense are unmeasured. The empty Android dataset `docs/tier1-pilot-empty.json` deliberately produces null error/cost metrics. Synthetic recipe tests validate arithmetic only. Missing consumption and missing cost remain unknown. Two owner-phone food screenshots demonstrate returned/saved estimates but have no weighed references. No participant data or physical weighing was fabricated. Public evaluation does not require collecting those Android meals first.

## Decision

Keep the deployed six-record A1 baseline and match the source default to it. Preserve the73-record candidate, source provenance and frozen engine842b208 for reproducibility. A0 coverage1/30 versus7/30 remains too limited for an overall ranking. Better database attribution did not resolve calorie accuracy; high-energy underprediction and food/portion/preparation mismatches need further work. No printed object, owner installation or personal weighing is a prerequisite for the completed public evaluation.

A secondary-assistant reference-blind inventory audit of the additional10 is now complete, followed by anonymous prediction/reference-label comparison. It records many-to-many composites and uncertain identities without claiming gold food labels or omission counts. The apple/almond/cauliflower example retains all three groups but underestimates almond mass55–65g versus86g. [Qualitative audit](docs/tier1-mealrange-2026-11-08/inventory-audit.md).

Optional per-component portion correction is now implemented, retaining original predictions and an adjustment history. Full CI42527604689 passed988Flutter/5340Functions/28Python/5Node checks with the2historical skips unchanged; focused Samsung runtime verified editing, exact restore/no-op, restart, corrected intake/repeat and deletion on the source-matched signed APK. [Detailed verification and known viewport limitation](docs/tier1-portion-verification-2026-11-08.md). The native replay used an existing public prediction and scripted grams; no new accuracy or user-effort measurement is claimed.

The next highest-value experiment is whether one actual user's optional correction reduces reference-backed served error and interaction time without another photo/model call. Public reference-weight scaling is an unavailable-oracle diagnostic; it cannot establish real correction behavior or general accuracy.

## Actual verification

- Initial Functions controls117/117 passed; latest Tier1 backend/CLI19/19 pass, with strict parser and consent tests. The full Pi suite passed5326 tests/1 historical skip; it began before the final CLI addition and is supplemented by the focused run. The final immutable CI result is recorded below.
- Evaluator11/11 synthetic tests passed; empty input yields0 meals and null accuracy. Timing distinguishes model inference from shutter-to-estimate and question/retake paths.
- Android test-first CI42426878949 at6dfefa1:949 passed,1 historical skip,2 new expected compile failures because Tier1 modules were absent.
- Focused Flutter run42438268764 at837c428 passed9/9 local/widget tests; analysis then found4 style/cast issues, now corrected pending final CI.
- New inference was exercised only on an owned generated **blank, non-food JPEG**:4 image SDK requests total (first3 rejected by the provider schema compiler; final accepted structural wire produced explicit `no_food` with the exact3.8 model pin). Four text-only diagnostic calls isolated schema compatibility. These are transport/error-path checks, not food or calorie evidence. Strict local Zod limits remain enforced; wire grammar does not enforce numeric/string/array bounds.
- Node20 CI's3 preexisting hostile-error fixture failures were reproduced and corrected by eagerly materializing V8's lazy stack before installing getters. All original zero-read assertions remain; focused3/3 pass on Node20.
- Immutable CI42439137326 at6ebd7b4 passed Functions5331/1 historical skip across95 files, Flutter958/1 historical skip, evaluator11/11, build/lint and focused Tier1 analysis; a signed test APK was built. Samsung runtime verified manual entry, unknown macros/intake, restart persistence, Ate all, unchanged save, JPEG capture/metadata, cloud-consent decline, local photo correction and photo/record deletion. Repeat created the correct new unconfirmed meal but exposed a real dialog-dismissal crash; the corrected APK and final retest are documented in the final result below. No cloud photo was uploaded during these phone checks. Final repeat regression/build/device results are recorded in the verification receipt.

## Final result

[Immutable final CI42443418299](https://github.com/ia23a-lachnita/calorix/actions/runs/42443418299) at452ef49 passed Functions95files/5331tests/1 historical skip, Flutter960tests/1 historical skip, evaluator11/11, build/lint and focused analyzer. Signed APK source/checksum/trusted signer and compiled privacy controls were verified before installation. The final Samsung focused-repeat confirm/cancel tests passed; owned diagnostic records were removed. [Full verification receipt](docs/tier1-verification-2026-11-08.md) records initial failures, review routes, exact hashes and boundaries. Local workflow is installed; the subsequent explicitly approved cloud deployment is recorded below. Real weighed meals remain **0/30**.

## Approved cloud deployment

The user approved deployment and `analyzeTier1Meal` is now ACTIVE on Node22 in calorix-xurschnell/us-central1, revisionanalyzetier1meal-00001-puf. Runtime20 had been decommissioned; only engine/root-lock/CI and its exact-version contract were updated. [Full Node22 CI42470126908](https://github.com/ia23a-lachnita/calorix/actions/runs/42470126908) passed5331backend/960Flutter/11Python tests with the same2 historical skips and build/lint/analyzer/APK. All three legacy deployed functions and rules stayed unchanged. One consented owned non-food phone request reached the function with valid Firebase Auth, returned400 and preserved the photo/manual fallback; its exact backend error category was not exposed by the UI. App Check enforcement remains off with an INVALID-token warning. This is not a real-food/accuracy measurement. The owned fixture was deleted. [Deployment receipt](docs/tier1-deployment-2026-11-08.md) records exact evidence and limitations. Weighed meals remain **0/30**.
