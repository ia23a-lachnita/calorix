# Public evaluation and number-display verification

The public benchmark used execution source `0bf1369b7e1d14e8f5316d505d7007c671119a57`. The app fix and strengthened save regressions are verified at `15d1bb5b1d1cdc56e11002d13036be545787025d`. Later handoff changes are documentation/manifest measurement metadata only; app, inference, tests and workflows are unchanged from the APK source. The existing deployed callable was reused, with no redeployment for this work.

## Actual automated checks

[Complete CI42499864134](https://github.com/ia23a-lachnita/calorix/actions/runs/42499864134) succeeded:

- Functions:96 files,5,337 passed,1 historical skip; Node22 TypeScript build and ESLint passed.
- Python:16 passed, covering the reference evaluator and public preparation adapter; Pillow11.1.0.
- Flutter:967 passed,1 historical skip; Tier1 feature/test analyzer reported no issues.
- Android debug APK built; CI cryptographically verified its test signing certificate.

Preparation and runner tests first failed on absent modules, then passed. Numeric-display behavioral RED was source908d22b/CI42498028694:961 passed,1 skipped,6 new failures, including the exact long-decimal symptom. GREEN was6412fda/42498909715; final15d1bb5 repeats the complete suite with assertions that saving closes the editor. An earlier real-filesystem widget harness timed out; that was repaired using an in-memory store before the behavioral RED and is not counted as evidence of the app bug.

The final checks cover untouched, renamed, changed and cleared numeric fields, tiny positive magnitudes including exponents, fresh cloud-result filling, exact saved nutrient preservation, provenance and consumption reset/preservation.

## Verified APK and phone result

[Download artifact13625671619](https://github.com/ia23a-lachnita/calorix/actions/runs/42499864134/artifacts/13625671619), `android-test-apk-15d1bb5b1d1cdc56e11002d13036be545787025d`, expires2026-12-08. Extract the ZIP and install `calorix-1.0.0+1-android-test.apk` as an update; USB is not needed on the owner's phone.

- APK SHA256: `bc9a4543799d5fcb39e38220740b8832c8011970f92f09e6c0367c7cc0548d46`.
- Trusted signer SHA256: `38815fd37711f170e534cf3c8767de7f0f7ca5f958e755d8a47b03fe2b764b7c`.
- Downloaded metadata/source/checksum and APK V2 signer identity matched before installation. Installed `base.apk` hash matched the download.
- Compiled manifest: FirebaseInitProvider absent, messaging/analytics auto-init false, backup disabled. Compiled cloud/device-transfer exclusions cover root/files/databases/preferences. This inspection is not a public-release security approval.
- Pinned physical device: Samsung SM-G780G, Android13, serialR58R61161NA; every device command used the serial-pinned wrapper. No emulator or unconnected owner-phone access.

One explicitly diagnostic local record, with no photo/cloud request, held raw fat6.720000000000001,232kcal,9.28g protein,33.6g carbs, original analysis and confirmed half-consumption. Native XML and a viewed screenshot showed232/9.28/33.6/**6.72**. **Save meal** closed the editor and preserved exact original nutrient doubles, analysis, A1 source, metadata, consent and half-consumption. Revision advanced1→2. UI deletion removed only the owned fixture; baseline records were restored, backup/pending files absent, task-owned device XML removed, app left on Camera. Zero additional inference requests.

Diagnostic harness corrections are retained in the local receipt: initial exec-in readback mismatched before rename (original meal history untouched); retry used blocking shell stdin with exact readback before rename. The first History tap did not transition; observation and a fresh grounded tap reached History. A full-tile semantic label required contains matching. The save checker initially compared timestamp strings; correcting it to compare the identical parsed instant handled Dart's UTC `Z` serialization. These were harness issues, not additional app fixes or benchmark failures.

## Review and measurement boundaries

Antigravity primary `gemini-3.8-flash`, yolo, scoped conversations `calorix-tier1-public-eval-20261108` and `calorix-tier1-number-display-20261108`: source/plan and final numeric/display reviews explicitly returned `AGREEMENT_STATUS: agree`, `MUST_FIX: none`. Public-result output initially invented an unrelated local CSV link; this was recorded as MCP response noise and explicitly corrected to inline-only numeric/report review before a clean verdict. No filesystem/hash/visual inspection is attributed to that response. No reviewer/provider fallback was needed for these final reviews.

An independent read-only audit checked all20 original metadata labels/input hashes and all39 prediction-component scalings and recomputed the published metrics without mismatch. Host viewed all20 input thumbnails, the numeric scatter plot and the native editor screenshot. Full-resolution semantic food recognition and all UI states were not exhaustively visually reviewed. No UI-diff/parity gate ran; diff counts by status/source, `auditLimited` and `visualClassificationStatus` are not applicable.

Public run-v1 is closed at20 SDK requests:20 valid,zero failed/not-attempted cases,zero questions/answers,zero retries/fallbacks. Fixed route `gemini-3.8-flash` via Vertex US, SDK2.19.0, unchanged production prompt/schema/catalog. The actual catalog limitation leaves A0 coverage1/20 and85.43% A1 energy from explicitly unverified densities. Billing cost, systematic missing-food audit, Android end-to-end latency and owner-weighed accuracy remain unmeasured. App Check enforcement remains off under the existing personal-prototype scope. Raw photos/responses/logs/APK receipts stay in task-owned disk storage outside Git; only attributed numeric public evidence is committed. See [the results](report.md).
