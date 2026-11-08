# Tier1 implementation and verification — 2026-11-08

Update: the subsequent explicitly approved Node22 deployment succeeded. [Current deployment receipt](tier1-deployment-2026-11-08.md) records the live revision, fresh full CI, authenticated phone error-path test and remaining measurement limits.

The V7.1 directive supersedes the old public-image/training roadmap. Source branch: `feat/tier1-photo-pilot`, based on `5b70e88`. Existing Flutter3.41.9, CameraX capture/service, theme, Firebase project, SDKs and CI signing were reused. The focused local Tier1 module is the default; the old app remains behind `CALORIX_LEGACY_CLOUD=true`. No old experiment was rerun or erased.

## Delivered behavior

- Single private JPEG with available camera metadata and basic format/size/resolution checks; manual entry remains available when capture fails.
- Opt-in authenticated `analyzeTier1Meal`: pinned `gemini-3.8-flash`, one request/no fallback, structured wire output and strict local validation, six traceable USDA records, explicitly unverified nutrients for unmatched foods, at most one optional oil question applied locally.
- Editable approximate served calories/macros, unknown intake by default, optional confirmed all/half intake, local persistence, confirmed repeat and deletion. Missing macros remain unknown. Repeat and changed nutrient totals reset intake confirmation.
- No legacy cloud queues at default startup. Android backup/transfer and Firebase automatic analytics/messaging initialization are disabled. Cloud consent discloses US processing and provider retention; no app-owned cloud photo persistence. Android strips EXIF; CLI sends the supplied JPEG unchanged.
- Versioned manifest/schema, independent ingredient→batch→plate references with many-to-many/yield arithmetic, endpoint-specific reference grades, paired A0/A1 evaluator, failure/coverage and timing/cost reporting. A0 shares A1 recognition/preparation and compares fixed serving priors only.

## Actual checks

| Check | Result |
|---|---|
| Full Flutter, pinned FVM3.41.9 | 960 passed, 1 historical skip; run42443418299/job128617241509 at452ef49 |
| `fvm flutter analyze lib/features/tier1 test/tier1` | No issues in that run |
| `npm run build`, `npm run lint`, `npm test` (Functions) | Passed build/lint,95 files/5331 tests/1 historical skip in run42443418299/job128617241418; evaluator11/11 also passed |
| Python evaluator | 11/11 passed; empty dataset produces0 physical meals and null accuracy/cost |
| Signed final Android APK | Passed run42443418299/build job128619221079; verified before install, Samsung signed update accepted |
| Initial source6ebd7b4 phone checks | Manual420kcal/unknown macros, restart persistence, Ate all, unchanged save, capture720×1280 JPEG/metadata, explicit cloud decline, photo correction333kcal, record/photo deletion passed |
| Repeat regression | Focused1.5 Confirm and Cancel failed at e16e3b9/run42443153837 with disposed controller; both pass at452ef49 |

The repeat defect was found on the Samsung despite initial CI success. Two test harness lookup errors were corrected before obtaining behavioral RED; an unfocused repeat test passed and did not reproduce it. The fix uses framework-owned field state, `DialogRoute.completed`, and duplicate-action guards. Reviewer initially reversed Flutter teardown order; [pinned official source](https://github.com/flutter/flutter/blob/3.41.9/packages/flutter/lib/src/widgets/framework.dart) confirms children unmount first, and the reviewer retracted the finding. No test assertions were weakened.

The initial APK6ebd7b4 matched CI source/SHA256 and CI verified signing. An optional emulated Java verifier had not finished when installation proceeded; that sequencing error was acknowledged. Native signer extraction subsequently matched CI, Android accepted the signed update, and compiled manifest/privacy flags were inspected. For the final452ef49 APK, source/checksum/trusted signer and compiled manifest checks all passed sequentially before installation. Samsung accepted the signed update. Focused1.5 Confirm→630kcal/unconfirmed and focused Cancel→unchanged both passed on the phone; final screenshots09/10 were inspected. All four owned diagnostic IDs, photo and backup were removed with assertions; legacy data was retained.

## Installed artifact

- Source: `452ef4976a5adf10b8d784401641102892a73740`
- [Successful build and full verification](https://github.com/ia23a-lachnita/calorix/actions/runs/42443418299), artifact `android-test-apk-452ef4976a5adf10b8d784401641102892a73740`
- APK SHA256: `221f25756481e680f0ed7d41a85468e8be885e645cafe9ba9e9cf7e25d4dff60`
- Signer SHA256: `38815fd37711f170e534cf3c8767de7f0f7ca5f958e755d8a47b03fe2b764b7c`
- Final tracking documentation does not change application source; `git diff 452ef49 -- lib android pubspec.yaml pubspec.lock` is empty.

## Evidence boundaries and reviews

- Physical device: Samsung SM-G780G, Android13, serial R58R61161NA, selected with `phone-adb`. No emulator, uninstall or data clearing. Only owned diagnostic meal/photo records are eligible for cleanup.
- ARTEMIS explored the old app before test authoring (trace `ca9ad385-06f0-46d4-ba94-7ecb8e409a21`), then hit429/180s LLM timeout. Diagnosis passed5/5 required checks with optional recording/helper limitations. New app exploration and verification used ARTEMIS device state plus serial-pinned ADB hierarchy/actions/screenshots. Runtime visuals were sampled, not an exhaustive visual-parity audit. No ui-diff run; diff counts, `auditLimited` and `visualClassificationStatus` are not applicable.
- Live provider diagnostics:4 owned blank/nonfood JPEG SDK calls plus4 text calls. Three image/bounded-schema failures and one text failure were HTTP400; structural text and final image route succeeded. Final blank image produced explicit `no_food` and passed returned-model pin. These are transport/error-path checks, never meal-accuracy evidence. No model fallback or further food call was made.
- Mandatory external review: `gemini-3.8-flash` via Antigravity MCP, yolo/read-only prompts. Final agree/none in `calorix-tier1-v71-20261108-final`, `calorix-tier1-callable-security-20261108`, `calorix-node20-proxy-fixtures-20261108`, and `calorix-tier1-repeat-dialog-20261108`. Early primary review timed out300s; canonical3.7/3.6 fallbacks rejected unsupported high effort. These failures were recorded, then scoped primary review succeeded. Public release/security readiness is not approved.
- Independent read-only branch review found9 important implementation issues; all were corrected and regression-tested before final CI. Existing Node20 hostile-error fixture failures were reproduced and fixed by eagerly materializing V8's lazy stack before hostile getters, retaining original zero-read assertions.

Dedicated Firestore/Storage emulator suites were not run for this route; no rules changed. At the initial implementation handoff the callable was undeployed; the subsequent live deployment and bounded callable smoke are documented in the update linked above. The CI counts above describe the actual unit/widget suites, not an end-to-end cloud deployment test.

## Remaining blockers

Deployment approval has since been granted and executed; see the current receipt above. The initial implementation handoff did not deploy or mutate cloud resources. Actual phone-to-callable **real-food** recognition and reference-calorie accuracy remain unverified until a real meal is supplied.

**Weighed Android meals:0/30.** No MAE, bias, P90, coverage/generalization, phone end-to-end latency, correction rate or inference-cost claim. Synthetic fixtures test code only. Next experiment: one independently weighed mixed meal, freeze original paired A0/A1 outputs before corrections, answer at most one actual preparation question, and compare complete served energy. Follow [the phone runbook](tier1-phone-runbook.md) and [weighing SOP](../reference_sop.md).
