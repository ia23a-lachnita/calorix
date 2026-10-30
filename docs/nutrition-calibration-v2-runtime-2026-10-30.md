# Separate calibration runtime preparation

Only the strict v2 training-manifest schema, hash and canonical serializer are qualified at this checkpoint. Candidate admission, native I/O, the activation lock and all runtime stages remain open. No food prediction or token-count SDK request was made, no runtime ledger/budget was activated, and production defaults are unchanged.

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

The paid `claude-sonnet-5` route repaired the tests/stubs. Main then independently observed real behavioral RED before authorizing implementation. A later worker timeout occurred after code delivery with no completed verification report; its checks were not credited. The host ran build, focused tests and lint directly. An edit-only paid invocation removed exactly the unused declaration. This paid route remains usable; no general native editing exception is asserted.

Antigravity MCP `gemini-3.8-flash` with server-supplied High effort reviewed actual source/results in `calorix-v2-manifest-slice-implementation-20261030`. The corrected response reports `AGREEMENT_STATUS: agree` and `MUST_FIX: none`, scope `PARTIAL_TASK1_V2_MANIFEST_SCHEMA_HASH_CANONICAL_SERIALIZER_ONLY`. Absolute zero-risk/airtight phrasing was withdrawn. One mistaken identifier in the follow-up was checked against the actual `serializeCalibrationV2Manifest` source; no nonexistent function was accepted as evidence. No visual review or whole-runtime approval is implied by this source review.

The plan preferred a shared private schema helper and inferred types. The accepted bounded variation uses an explicit fixed v2 schema/interfaces to preserve v1 source, while sharing the schedule, source URL, attribution, stratum and canonicalization primitives. Future guard/type drift remains a maintenance risk. The durable controller is not duplicated.

One minor is deferred: `StrictCalibrationManifestV2Case.attributionId` is typed as `string` rather than its runtime literal. Both hash and serializer strictly parse the literal at runtime; the wider TypeScript interface weakens compile-time precision without granting runtime authority.

## Remaining work

Continue [Task1 of the reviewed runtime plan](superpowers/plans/2026-10-30-calibration-v2-runtime.md): pinned activation lock, shared pure quality context, read-only historical-candidate admission, native input confinement and actual post-commit admission probes. Then implement closed context/runtime/report bindings and the explicit native CLI. A fresh full backend parent, one fresh whole-feature native review, Antigravity actual result review and source/account/budget records remain mandatory before any new food request.

The [PhaseA candidate](nutrition-corpus-quality-preparation-2026-10-30.md) remains finalized at rawSHA `3b8bd3280a1d2941082a8d95422e62336b93222022fd6d2f4528aa23980e8b2b`. Its main-agent visual review covered all56considered photos; its independent reviewer rendered four samples. No additional photo was viewed for this schema slice. ID disjointness does not certify plate-family independence or real-world accuracy. The failed v1 experiment stays sealed. This checkpoint does not qualify nutrition accuracy, supported deployment runtime, security, trigger E2E or production release.
