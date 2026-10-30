# Separate calibration runtime preparation

The strict v2 training-manifest schema/hash/serializer is committed at c7d5318. The shared pure quality-source extraction has passed focused checks and independent review. Pure historical-candidate admission and activation-lock data validation are now reviewed too. The fixed native reader is also implemented and source-reviewed, with its actual post-commit candidate probe still pending. Runtime binding and all runtime stages remain open. No food prediction or token-count SDK request was made, no runtime ledger/budget was activated, and production defaults are unchanged.

The separate schema requires version2, dataset `calorix-n5k-calibration-v2`, the v2 rank prefix, exactly40 unique cases in the frozen24/16slot schedule, strict nested fields, valid numeric truth and exact source URLs. Hashing and serialization validate first, recursively sort object keys, preserve array order and produce compact UTF8 JSON without a trailing newline. Both reuse the existing canonicalizer.

## Actual verification

| Run | Native exit | Result |
| --- | ---: | --- |
| `baseline-focus-20261030` | 0 | 317 existing tests, five physical files |
| `task1-manifest-host-red-01` | 1 | 141 pass / nine intended positive feature failures;120old schema tests pass |
| `task1-manifest-host-build-01` | 0 | `npm run build` |
| `task1-manifest-host-green-02` | 0 | 351 pass, six physical files, zero failures/skips |
| `task1-manifest-host-lint-02` | 0 | `npm run lint` |

The final351 comprise all317baseline case/status entries plus34new manifest tests. The original30new tests and helper code remain byte-identical before four added edge-case tests; the fixture changed afterward only to delete one unused string constant caught by the first lint run. The final focus and lint ran on those final bytes. Source build remained applicable because no product source changed during that cleanup. Vitest reported4.09seconds for RED and26.07seconds for the first GREEN; whole native process wall times were not separately measured.

| Receipt | SHA-256 |
| --- | --- |
| RED JSON | `7ccef2114d479fedcd782eb7d41ffdbc26aa0b0191f602b449a3975d7e08b2d3` |
| Final GREEN JSON | `7f2be1fca3939fabb9b159b4386befd3f39b5667b47513d61321b458ebad522b` |
| Build log | `34fc8f532e8455212c5eeba2f44af8dd0d5a13e2138025e81ecd8272dd2f48fa` |
| Final lint log | `4f231752a95e49703ca815dc73c375d7b83851a748f51f61add5b9527c44482f` |

Independent fixture checks establish40cases,24/16groups, correct URLs and acceptance by the unchanged shared v1 shape after adapting only the expected version/rank. This validates the fixture structure, not nutrition truth. Every pre-existing v1 schema byte is preserved apart from exporting the unchanged canonicalizer. All other165baseline source/root inputs, three protected configurations,11frozen v1 evidence files and the finalized PhaseA candidate matched their fingerprints after review.

## Editing and independent review

The prescribed routes were tried in order: Grok rejected its configured model; Qwen reported exhausted free quota; the refreshed OpenCode catalog omitted three approved routes. Lightning delivered premature algorithms and an invalid46-case fixture, which were rejected and removed. BigPickle delivered no file changes within300seconds. These failures are not app inference failures or evidence of universal account exhaustion.

The paid `claude-sonnet-5` route repaired the tests/stubs. Main then independently observed real behavioral RED before authorizing implementation. A later worker timeout occurred after code delivery with no completed verification report; its checks were not credited. The host ran build, focused tests and lint directly. An edit-only paid invocation removed exactly the unused declaration. That successful invocation did not imply account exhaustion or a permanent editing exception. A later correctly scoped shared-source tests-only invocation produced no output or file changes for300.431seconds and terminated with native143. The ordered Task1 route failures plus this bounded nondelivery now permit the standing native fallback for remaining Task1, preserving all review/verification gates. The earlier operator-cancelled invocation merely fixed its watchlist and is not counted as a provider failure.

Antigravity MCP `gemini-3.8-flash` with server-supplied High effort reviewed actual source/results in `calorix-v2-manifest-slice-implementation-20261030`. The corrected response reports `AGREEMENT_STATUS: agree` and `MUST_FIX: none`, scope `PARTIAL_TASK1_V2_MANIFEST_SCHEMA_HASH_CANONICAL_SERIALIZER_ONLY`. Absolute zero-risk/airtight phrasing was withdrawn. One mistaken identifier in the follow-up was checked against the actual `serializeCalibrationV2Manifest` source; no nonexistent function was accepted as evidence. No visual review or whole-runtime approval is implied by this source review.

The plan preferred a shared private schema helper and inferred types. The accepted bounded variation uses an explicit fixed v2 schema/interfaces to preserve v1 source, while sharing the schedule, source URL, attribution, stratum and canonicalization primitives. Future guard/type drift remains a maintenance risk. The durable controller is not duplicated.

One minor is deferred: `StrictCalibrationManifestV2Case.attributionId` is typed as `string` rather than its runtime literal. Both hash and serializer strictly parse the literal at runtime; the wider TypeScript interface weakens compile-time precision without granting runtime authority.

## Shared source-context extraction — reviewed

`calibration-corpus-quality-source.ts` exports the byte-identical former CLI source-lock schema, a frozen public-path dictionary and pure `buildQualityAuditContext`. The CLI retains its current clean-Functions Git guard, fixed public path/URL checks, bounded cached reads, explicit download opt-in and content-pin verification. It still supplies its current checkpoint; the pure assembler accepts a supplied historical checkpoint without querying Git or creating runtime authority. The returned context owns a checkpoint copy and preserves empty source ingredient names alongside vocabulary names. Source digests/quarantine/eligibility continue using the unchanged metadata policy.

| Run | Native exit | Result / measured whole-process time |
| --- | ---: | --- |
| `task1-quality-source-host-red-01` | 1 | 128 pass /14 intended behavior failures,120old schema pass;4.782s |
| `task1-quality-source-host-green-01` | 0 | 373 pass,7physical files, zero failures/skips;28.693s |
| `task1-quality-source-host-build-01` | 0 | `npm run build`;30.233s |
| `task1-quality-source-host-lint-01` | 0 | `npm run lint`;41.970s |

RED rawSHA `6934921d7bd3f5dfd6c9c919ff0ab38cc3374089ff342df0423faa1d4031ac67`; GREEN rawSHA `22f3ad821d4d15d258ec559a50f4f9c86d3316fec48ca48f8f0da00969393e2f`. All351prior case/status entries are preserved plus22new. Tests/stubs were written before actual hostRED; the tests stayed byte-identical through GREEN. The new test module separates shared-source tests from later admission/native-reader tests; it does not alter scope or use measured food truth. All pre-existing tracked Functions inputs except the intended CLI extraction match c7d5318. Three protected configuration hashes,11v1 evidence files and finalized candidate rawSHA are unchanged.

This is a partial Task1 checkpoint. No fresh full backend parent has run on this source; the approved plan requires it after assembled runtime and the one fresh whole-feature native review in Task4. No additional photo was viewed. Antigravity MCP `gemini-3.8-flash` with server-supplied High effort returned explicit `AGREEMENT_STATUS: agree` and `MUST_FIX: none` in `calorix-v2-quality-source-slice-implementation-20261030`, exactscope `PARTIAL_TASK1_SHARED_PURE_QUALITY_SOURCE_AND_CLI_EXTRACTION_ONLY`. It inspected all three changed/new source/test files, CLI diff and supporting policy/corpus source plus actual RED/GREEN/build/lint receipts. Post-review source/config/candidate/v1 hashes are unchanged. Its caution that future native admission must enforce exact source path/URL agreement is retained as an existing requirement. Duplicate in-memory parsing remains identical to the former CLI assembly; optimizing it is outside this extraction. No whole-runtime, nutrition accuracy, security or production qualification is implied.

## Pure historical-candidate admission — reviewed

`admitCalibrationV2Candidate` validates explicit data pins without creating runtime authority. It hashes the activation lock before parsing, then verifies both candidate and corpus-lock raw hashes before parsing either. It enforces exact public source paths/URLs, the11fixed prior fingerprints and unchanged all-source pin/metadata/quarantine policy; the audit validator replays history using the trusted historical producer from the lock. The candidate must be finalized with40selected passes. Every referenced photo, including rejected photos, is hashed and checked against the existing synchronous image metadata parser; every non404skip must retain bytes matching its declared failure reason. This parser check is not full image decoding or new visual inspection.

The derived v2 manifest preserves source totals, truth conversion, slots, groups, strata and ranks. Its canonical UTF8 bytes contain the activation-lock raw digest as `sourceLockHash`; the lock contains no derived manifest/current commit/self digest. Returned lock/audit/manifest data are owned and recursively frozen. The fixed activation-lock JSON has rawSHA `fc61701815b950f5574dd1a70056787cea4423477321448526ef850f984bd0bd`. It pins the finalized PhaseA candidate/historicalproducer, shared source identities, all11v1 evidence hashes, route `vertex-ai`/`calorix-xurschnell`/`us`/`gemini-3.8-flash`/APIv1/30000ms,50prior+146newimages=196under300, and one new token count. Pure fixture pins are supported for testing data; they cannot register a runtime context. The fixed native reader/current Git gates are still unimplemented at this checkpoint.

| Run | Native exit | Result / measured whole-process time |
| --- | ---: | --- |
| `task1-admission-host-red-02` | 1 | 81pass/25expected stub failures;7.060s;56prior controls pass |
| `task1-admission-ownership-corrected-red-01` | 1 | One intended throwing-stub failure;3.005s |
| `task1-admission-host-green-02` | 0 | 423pass,8physical files, zero failures/skips;32.975s |
| `task1-admission-host-build-01` | 0 | `npm run build`;30.027s |
| `task1-admission-host-lint-01` | 0 | `npm run lint`;46.690s |

All373prior case/status entries are preserved plus50new. RED02 rawSHA `d6d81465bbf6bf6fa7e5c5846b7e1ec583a29114e088d00113e57a87375db6a9`; finalGREEN rawSHA `607a4b0ac15c311d662ac42e18998525e46cfe34547f463f630270ff2df91af4`. Two fixture problems were diagnosed rather than credited: RED01 had incorrect skip consideration order (fixed before algorithms); GREEN01 had one Buffer-versus-cloned-Uint8Array comparison failure. The corrected ownership test compares normalized byte snapshots and was observed failing against the captured throwing stub before finalGREEN. The implementation was restored byte-identically. The two independent hand-assembled reject/replacement and invalid-image-skip audit fixtures pass the unchanged audit validator; their header-level synthetic images and dispositions are not food-truth or photo-review evidence. Existing serializer bytes remain unchanged.

Antigravity MCP primary `gemini-3.8-flash` with server-supplied High effort reviewed all five actual implementation/data/test files and supporting unchanged sources plus RED/GREEN/build/lint/targetedRED receipts in `calorix-v2-pure-admission-slice-implementation-20261030`. The corrected response explicitly reports `AGREEMENT_STATUS: agree` and `MUST_FIX: none`, exactscope `PARTIAL_TASK1_PURE_CANDIDATE_ADMISSION_AND_ACTIVATION_LOCK_DATA_ONLY`. Initial response attribution overstatements were recorded and corrected in the same conversation: the spy counts zero malformed candidate/corpus parses, not zero total JSON parsing;196countsimages, token counts remain separate; prior evidence is hashed rather than returned/decoded, and no universal hostile-input snapshot guarantee is claimed. No source mutation/noisy agreement was accepted as proof. All five final source/data/test pins, three protected configurations,11v1evidence files and finalized candidate remained unchanged after review. Actual fixed native input admission/historical Git validation, post-commit probes, current runtime source identity, private context registration, complete backend parent and live account/budget qualification remain open. No food/token SDK call, root/lock/ledger write or new photo inspection occurred.

## Fixed native input reader — source reviewed, actual probe pending

`readNativeCalibrationV2AdmissionInput` uses only fixed committed trust and paths within the supplied canonical repository root. It checks the current clean Functions commit/tree before and after asynchronous reads, verifies the historical producer Git object/tree independently, and verifies both committed and working activation-lock bytes. It hashes candidate/corpus-lock bytes before parsing, requires exact public paths/URLs, validates audit provenance before using SHA-shaped image names, reads all referenced image and11prior evidence files with bounds/confinement, then rechecks current source. `readNativeCalibrationV2Admission` passes those ordinary owned bytes to the real pure validator. No source/root/lock override or runtime-registration API is added.

Per-segment symlink checks and size checks provide local path safeguards; they do not guarantee protection from a hostile local filesystem race. Source checks compare the two recorded endpoints rather than continuously monitoring every transient change. Native Git reads use argument arrays, a fixed working directory and `GIT_OPTIONAL_LOCKS=0`, preventing optional index refresh writes. No provider, ledger or runtime-controller module is imported; the reader performs no download or application write.

| Run | Native exit | Result / measured whole-process time |
| --- | ---: | --- |
| `task1-native-input-host-red-03` | 1 | 52pass/19intended stub failures;15.840s;50prior admission controls pass |
| `task1-native-input-index-red-01` | 1 | 21pass/one actual Git index mutation failure;15.965s |
| `task1-native-input-host-green-02` | 0 | 445pass,9physical files, zero failures/skips;50.644s |
| `task1-native-input-host-build-01` | 0 | `npm run build`;70.985s |
| `task1-native-input-host-lint-01` | 0 | `npm run lint`;62.712s |

All423prior case/status entries are preserved plus22new. NativeRED03 rawSHA `1862552f4917761a66f45fcffab8e78262b73a8704d7506b3096b2e4cf9616d0`; finalGREEN rawSHA `2d8661122898f354ab116dca7c7a056bd9d4c96061246278f5df4d73adfff0e7`. Before implementation, one ESM spy setup error was corrected with the project's real-forwarding process-module wrapper; that failed harness was not credited. Both dirty and committed source drift during an awaited read are tested against real temporary Git histories. A later real regression showed default status commands changing index bytes after an mtime-only source touch; disabling optional Git locks fixed it before finalGREEN. Fixtures run under the verified disk-backed task TMPDIR and remove only their owned temporary repositories.

Primary Antigravity MCP `gemini-3.8-flash` with server-supplied High effort reviewed both actual new source/test files, supporting lock/admission contracts and RED/indexRED/GREEN/build/lint receipts in `calorix-v2-native-input-slice-implementation-20261030`. It returned `AGREEMENT_STATUS: agree` and `MUST_FIX: none`, scope `PARTIAL_TASK1_FIXED_READONLY_NATIVE_INPUT_READER_ONLY`. Existing990a78bFunctions inputs, both new source/test hashes, three protected configurations,11frozen v1 files and the finalized candidate remained unchanged after review. No full backend parent or whole-runtime review is implied. The actual fixed-trust post-commit probe and old CLI current-checkpoint rejection are still pending; whole Task1 is open.

## Remaining work

Continue [Task1 of the reviewed runtime plan](superpowers/plans/2026-10-30-calibration-v2-runtime.md): pinned activation lock, shared pure quality context, read-only historical-candidate admission, native input confinement and actual post-commit admission probes. Then implement closed context/runtime/report bindings and the explicit native CLI. A fresh full backend parent, one fresh whole-feature native review, Antigravity actual result review and source/account/budget records remain mandatory before any new food request.

The [PhaseA candidate](nutrition-corpus-quality-preparation-2026-10-30.md) remains finalized at rawSHA `3b8bd3280a1d2941082a8d95422e62336b93222022fd6d2f4528aa23980e8b2b`. Its main-agent visual review covered all56considered photos; its independent reviewer rendered four samples. No additional photo was viewed for this schema slice. ID disjointness does not certify plate-family independence or real-world accuracy. The failed v1 experiment stays sealed. This checkpoint does not qualify nutrition accuracy, supported deployment runtime, security, trigger E2E or production release.
