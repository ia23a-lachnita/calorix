# Separate calibration runtime preparation

The strict v2 training-manifest schema/hash/serializer is committed at c7d5318. The shared pure quality-source extraction has passed focused checks and independent review. Candidate admission, native I/O, the activation lock and all runtime stages remain open. No food prediction or token-count SDK request was made, no runtime ledger/budget was activated, and production defaults are unchanged.

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

## Remaining work

Continue [Task1 of the reviewed runtime plan](superpowers/plans/2026-10-30-calibration-v2-runtime.md): pinned activation lock, shared pure quality context, read-only historical-candidate admission, native input confinement and actual post-commit admission probes. Then implement closed context/runtime/report bindings and the explicit native CLI. A fresh full backend parent, one fresh whole-feature native review, Antigravity actual result review and source/account/budget records remain mandatory before any new food request.

The [PhaseA candidate](nutrition-corpus-quality-preparation-2026-10-30.md) remains finalized at rawSHA `3b8bd3280a1d2941082a8d95422e62336b93222022fd6d2f4528aa23980e8b2b`. Its main-agent visual review covered all56considered photos; its independent reviewer rendered four samples. No additional photo was viewed for this schema slice. ID disjointness does not certify plate-family independence or real-world accuracy. The failed v1 experiment stays sealed. This checkpoint does not qualify nutrition accuracy, supported deployment runtime, security, trigger E2E or production release.
