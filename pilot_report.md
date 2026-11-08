# Tier1 pilot report

## Supported

Existing Flutter CameraX still capture, app theme, Firebase project and SDK were reused. The new local-first module implements retained JPEGs and available metadata, explicit per-photo cloud consent, manual estimates, editing/history/deletion, served-only defaults, optional confirmed intake and repeat confirmation. A stateless authenticated callable and CLI share pinned A1 inference and nutrient reconciliation. Six actual USDA SR Legacy records were retrieved; unsupported foods are explicitly unverified. Automated code tests exercise these behaviors; phone/build verification status is recorded below and in `docs/implementation-status.md`.

## Unsupported

No medical, numerical accuracy, interval, unseen-user/device or production-readiness claim. Database nutrient records do not verify visual food matching or portion mass. A1 uses a hosted model ID, not downloadable immutable weights; returned model drift fails closed. The small catalog has limited coverage. A0 shares A1 recognition/preparation and tests serving priors only. No old public-image outcome is a weighed Android reference.

## Measured public evaluation

The unchanged A1 ran once on each of20 frozen Nutrition5k TEST RGB scans with real measured-component references:20/20 valid estimates, served-kcal MAE71.54, bias−7.77, P90 absolute error155.45. This exploratory sample contains12 references below200kcal, eight from200–600 and none above600. A0 covered only1/20, so no overall comparison is possible. Unverified model nutrient densities supplied85.43% of predicted energy. [Full results, limitations and numeric evidence](docs/tier1-public-eval-2026-11-08/report.md). These public measurements are separate from the Android pilot.

## Android-specific measurements still missing

**Physical weighed Android meals:0/30.** Android-specific served/consumed MAE, bias, P90, mixed-meal accuracy, user correction rate, end-to-end phone latency and inference expense are unmeasured. The empty Android dataset `docs/tier1-pilot-empty.json` deliberately produces null error/cost metrics. Synthetic recipe tests validate arithmetic only. Missing consumption and missing cost remain unknown. Two owner-phone food screenshots demonstrate returned/saved estimates but have no weighed references. No participant data or physical weighing was fabricated. Public evaluation does not require collecting those Android meals first.

## Decision

The local workflow and approved callable deployment are working. The measured engineering gap is nutrient-record coverage and matching: six records leave A0 unscorable on19/20 public cases and most A1 energy unverified. The next experiment should evaluate a separately versioned, broader audited nutrient catalog with the same recognition/portion pipeline. Keep the completed run frozen and report paired coverage/error changes; do not assume more database matches automatically improve calorie accuracy. Depth, printed reference objects and model training have no demonstrated priority from these results.

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
