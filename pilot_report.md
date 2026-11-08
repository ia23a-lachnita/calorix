# Tier1 pilot report

## Supported

Existing Flutter CameraX still capture, app theme, Firebase project and SDK were reused. The new local-first module implements retained JPEGs and available metadata, explicit per-photo cloud consent, manual estimates, editing/history/deletion, served-only defaults, optional confirmed intake and repeat confirmation. A stateless authenticated callable and CLI share pinned A1 inference and nutrient reconciliation. Six actual USDA SR Legacy records were retrieved; unsupported foods are explicitly unverified. Automated code tests exercise these behaviors; phone/build verification status is recorded below and in `docs/implementation-status.md`.

## Unsupported

No medical, numerical accuracy, interval, unseen-user/device or production-readiness claim. Database nutrient records do not verify visual food matching or portion mass. A1 uses a hosted model ID, not downloadable immutable weights; returned model drift fails closed. The small catalog has limited coverage. A0 shares A1 recognition/preparation and tests serving priors only. No old public-image outcome is a weighed Android reference.

## Unmeasured

**Physical weighed Android meals:0/30.** Served/consumed MAE, bias, P90, mixed-meal accuracy, user correction rate, end-to-end phone latency and inference expense are unmeasured. The empty dataset `docs/tier1-pilot-empty.json` deliberately produces null error/cost metrics. Synthetic recipe tests validate arithmetic only. Missing consumption and missing cost remain unknown. No participant data or physical weighing was fabricated.

## Decision

Ship the code to the dedicated phone for local workflow testing after source/checksum/signing verification; do not deploy cloud code without explicit approval. The single highest-value next experiment is **one weighed mixed meal**: record the recipe and cooked yield independently, take one phone JPEG, freeze the original A0/A1 outputs, answer at most one preparation question, and compare complete served kcal before manual edits. Continue to30 different physical meals without selecting away difficult dishes. Only that evidence can justify additional model complexity.

## Actual verification

- Initial Functions controls117/117 passed; latest Tier1 backend/CLI19/19 pass, with strict parser and consent tests. The full Pi suite passed5326 tests/1 historical skip; it began before the final CLI addition and is supplemented by the focused run. Final immutable CI remains the completion gate.
- Evaluator11/11 synthetic tests passed; empty input yields0 meals and null accuracy. Timing distinguishes model inference from shutter-to-estimate and question/retake paths.
- Android test-first CI42426878949 at6dfefa1:949 passed,1 historical skip,2 new expected compile failures because Tier1 modules were absent.
- Focused Flutter run42438268764 at837c428 passed9/9 local/widget tests; analysis then found4 style/cast issues, now corrected pending final CI.
- New inference was exercised only on an owned generated **blank, non-food JPEG**:4 image SDK requests total (first3 rejected by the provider schema compiler; final accepted structural wire produced explicit `no_food` with the exact3.8 model pin). Four text-only diagnostic calls isolated schema compatibility. These are transport/error-path checks, not food or calorie evidence. Strict local Zod limits remain enforced; wire grammar does not enforce numeric/string/array bounds.
- Node20 CI's3 preexisting hostile-error fixture failures were reproduced and corrected by eagerly materializing V8's lazy stack before installing getters. All original zero-read assertions remain; focused3/3 pass on Node20.
- Immutable CI42439137326 at6ebd7b4 passed Functions5331/1 historical skip across95 files, Flutter958/1 historical skip, evaluator11/11, build/lint and focused Tier1 analysis; a signed test APK was built. Samsung runtime verified manual entry, unknown macros/intake, restart persistence, Ate all, unchanged save, JPEG capture/metadata, cloud-consent decline, local photo correction and photo/record deletion. Repeat created the correct new unconfirmed meal but exposed a real dialog-dismissal crash; the corrected APK is still pending. No cloud photo was uploaded during these phone checks. Final repeat regression/build/device results will be recorded in the verification receipt.
