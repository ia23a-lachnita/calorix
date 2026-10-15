# Calibration Durable Runtime Evidence Contract

**Date:** 2026-10-14

**Status:** Architecture/spec approved on 2026-10-14; detailed implementation plan approved on 2026-10-15. Scoped unused implementation is authorized through the existing editing-worker workflow; live execution, producer/default activation and benchmark authorization remain excluded.

**Parent:** `docs/superpowers/specs/2026-10-12-calibration-controller-runtime-design.md`, governed by `docs/superpowers/specs/2026-09-23-gemini-38-nutrition-calibration-design.md`.

**Completed prerequisite:** `docs/superpowers/plans/2026-10-13-calibration-runtime-capabilities.md`.

## Purpose and limits

Persist privacy-safe evidence of the calibration controller's mediated local operations so crashes cannot turn reservation intent into claimed execution, lose call accounting, or silently authorize a repeated sample. Bind that evidence to the canonical outcome plan, existing result journals and natively verified report artifacts.

The user wants qualification of the approved Gemini 3.8 route, with recorded 2.5 aggregates retained only as a regression reference. Nothing here changes the project, location, profiles, sample populations, thresholds, call ceilings, Review policy, production model or deployment authorization.

This is an architectural contract, not a claim that the writer or producer exists. The next implementation slice is an **unused** codec/reducer plus opt-in ledger persistence and hermetic tests. Producer wiring, actual SDK-seam instrumentation, benchmark authorization, historical-comparison integration, the default CLI/controller, full 146-call execution and live calibration remain separate stages. The unconditional `calibration:benchmark-runtime-evidence-required` block remains in place.

Persisted statements are not self-authenticating proof of their producer's honesty. Ports and the cooperative private filesystem remain trusted dependencies. No network sandbox, protection from arbitrary trusted code, prevention of opaque SDK retries, or cryptographic execution attestation is claimed.

## Verified starting point

Inspected source baseline: `a941852b64d61deebfe4ed29204aa5fee5065f4f`, branch `fix/scan-photo-flow-viewer`.

- `calibration-runtime-capabilities.ts` is unused, with six required captured ports and optional selected profile. Its exported observations are copied in-memory diagnostics, not input to this evidence writer.
- `calibration.ts` owns ordered reservation events, terminal references, stage rules, model pinning, selected profile and current-owner replay. `journal.json` contains results; it contains no reservation identifiers or independent call counter.
- `calibration-file-store.ts` stores a JSON array by exclusive sibling-temp write, writable-fd fsync, close, rename and parent-directory fsync. The public final-file fsync hook validates the file; the physical writable-fd fsync has already happened inside publication.
- Report publication and native read verification bind JSON and Markdown bytes to reconstructed journal snapshots. `artifact_receipt_admitted` seals the stage/profile against further outcome changes. Constructor replay alone cannot supply authoritative measurements.
- Bootstrap obtains `functionsTreeId` with `git rev-parse <HEAD>:functions`, the implementation commit with `git log -1 --format=%H <HEAD> -- functions`, and requires clean tracked/untracked Functions state. Documentation-only HEAD movement is not source drift.

The prerequisite's 3002 passing Functions tests and one existing opt-in skip are historical evidence for that source, not verification of this proposed subsystem.

## Chosen architecture

Use one canonical `ledger.json` array, one `journal.json`, the existing reports directory and the existing `lock.json` beneath `CALIBRATION_ROOT`. Interleave versioned runtime event types with the existing protocol events. Do not introduce a companion authority file, a second lock, a heartbeat, a caller-selected run root or a reusable admission token.

A companion file would add cross-file crash cuts and reconciliation without removing the existing journal/report obligations. Post-hoc serialization of `getObservations()` cannot establish persistence before an effect; it remains diagnostics only.

The ledger core remains the only owner of reservations and protocol transitions. A pure runtime-event codec/reducer owns runtime syntax and state. An opt-in integration in that core publishes accepted runtime transitions through the same persistence path and poisons the same instance on uncertain durability. Do not duplicate the ledger or import filesystem/provider code into the pure reducer.

### Explicit mode and atomic initialization

Evidence mode is a new, explicitly selected factory/composition path, not an environment-variable default or automatic upgrade. Its first ledger record has exactly:

```text
{ type: 'protocol_identity', identity: CalibrationIdentity, at: IsoTime,
  reportAuthority: 'verified_artifacts_v1',
  runtimeEvidenceVersion: 1, owner: CalibrationOwner }
```

This single extended identity record initializes source identity, evidence mode and the first owner epoch in one atomic ledger publication. It replaces the ordinary header **only in the new mode**. Do not append a second mode marker after a separately persisted ordinary header: a crash between them would be indistinguishable from an existing legacy root.

Existing legacy/strict factories and their ordinary header/event codecs stay unchanged. They must not silently accept the extended header. Evidence mode retains the existing `reportAuthority: 'verified_artifacts_v1'` marker and native artifact-verification obligation; it does not create a weaker report mode. The new mode rejects an ordinary existing header, missing/wrong authority marker, missing/unknown evidence version, duplicate header, or a journal without its ledger header. An empty ledger and empty journal may be initialized under the lock; a nonempty legacy root cannot be migrated, reset, archived away or silently replaced by this stage.

No new public factory may choose a default provider, SDK, image loader, snapshot reader or network transport. Exact TypeScript signatures and file decomposition belong in the implementation plan; the serialized records and invariants below are fixed by this contract.

## Event codec v1

All new runtime events contain these exact common fields:

```text
type: one of the seven runtime types below
version: 1
sequence: positive safe integer, contiguous across runtime events only
owner: closed CalibrationOwner record
at: canonical UTC millisecond ISO timestamp
```

Existing protocol events do not acquire a new sequence or change format. A ledger event index is its one-based position in the entire JSON array, including the identity header and ordinary events. References always point backward; the reducer rejects missing, wrong-type or wrong-key targets. Sequence order, not wall-clock order, establishes causality.

`Key` is the existing closed `{stage, profile, caseId, sampleIndex}` record. Stage/sample ranges and plan membership come from the existing pinned canonical outcome planner, including the selected-profile transition, not a caller-provided replacement key list. `attempt` is a positive safe integer contiguous per key, starting at one. Operations are exactly `image`, `vision` and `snapshot`.

Each row below lists **all additional fields**, not optional examples:

| Type | Additional fields | Meaning |
| --- | --- | --- |
| `runtime_attempt_started` | `key`, `attempt` | Opens the single active outcome attempt. |
| `runtime_operation_started` | `key`, `attempt`, `operation` | Durable intent before invoking that trusted local port. |
| `runtime_operation_settled` | `key`, `attempt`, `operation`, `result: 'returned' \| 'failed'` | Observed settlement of the matching local port, not parser success or remote transport proof. |
| `runtime_request_authorized` | `key`, `attempt`, `reservationEventIndex` | Existing image reservation is durable; the final SDK hook may return only after this record is durable. This is permission/intention, not confirmed dispatch. |
| `runtime_attempt_finished` | `key`, `attempt`, `terminal` | Reconciles the attempt to an already durable existing outcome terminal. |
| `runtime_attempt_abandoned` | `key`, `attempt`, `disposition` | Records an interrupted attempt without inventing a returned operation. |
| `runtime_report_bound` | `stage`, `profile`, `receipt`, `throughSequence`, `bindingSha256` | Captures reconciliation with an already admitted, freshly natively verified report receipt. No benchmark admission results. |

`terminal` is exactly one of:

```text
{ kind: 'image', eventIndex: positive safe integer, journalHash: lowercase SHA256 }
{ kind: 'non_reservation', eventIndex: positive safe integer, contentDigest: lowercase SHA256 }
```

The first references an existing `completed` or `failed` event and its exact result-journal hash. The second references an existing `non_reservation_result` and its recomputed existing content digest. Preserve the existing result/hash algorithms; do not invent a second journal serialization or reservation namespace.

`disposition` is exactly one of:

```text
{ kind: 'unreserved_interruption' }
{ kind: 'reserved_interruption', terminal: image terminal as above }
{ kind: 'terminal_evidence_incomplete', terminal: either terminal as above }
```

The third preserves a real pre-existing outcome terminal when a crash prevented complete runtime settlements; it does not downgrade or rewrite that journal into a synthetic success/failure. Such evidence is incomplete and cannot satisfy successful reconciliation.

`receipt` has exactly the five existing `CalibrationPublishedReportReceipt` fields: `stage`, `profile`, `runId`, `jsonSha256`, `markdownSha256`. Stage/profile must match the binding event. `throughSequence` equals this event's sequence minus one. No report body, prediction or caller assertion is embedded.

### Capture, privacy and bounds

Capture closed plain/null-prototype records using enumerable own data descriptors, rejecting symbols, accessors, inherited/non-enumerable extras, unknown/missing fields, malformed arrays and nonfinite/unsafe numbers. Copy primitives into newly owned records; freeze only owned outputs. Do not call foreign `toJSON`, getters or error inspection hooks. Reflection traps may execute; hold the mutation/reentry guard before reflection and recheck poison afterward.

Use the existing strict validators for identity, owner, key, receipt and digest primitives where their contracts match. Reject negative zero for sequence/index/attempt fields. Canonical ISO timestamps must round-trip exactly. The mode header and each runtime event may encode to at most 16 KiB of canonical UTF-8; at most 4096 runtime events may exist in v1. Check captured string byte lengths before allocating their encoded representations. Bound exhaustion fails closed before mutation/effect and grants no new run/reset permission. These are evidence storage bounds, not changes to inference quotas or sample counts.

Canonical encoding recursively sorts record keys by JavaScript string order, retains array order, and JSON-encodes only captured data. It emits no whitespace, BOM or trailing newline. Hashes use SHA-256 over those UTF-8 bytes. Reject lone UTF-16 surrogates in strings before encoding. This canonicalization is for new runtime digest inputs; it does not change the physical JSON array format or legacy journal/report digests.

Records contain no prompts, image bytes, model response text, predictions, raw exceptions, stack traces, credentials or arbitrary paths. The existing required owner fields are the narrow metadata exception, not permission to collect arbitrary machine details. Sanitized result/error details stay in their existing validated terminal records, not new free-text fields.

This structural codec operates on owned values returned by the trusted store. It does not claim detection of duplicate raw JSON member names after ordinary `JSON.parse` has collapsed them, nor protection against malicious privileged filesystem rewrites. Any stronger raw-byte parser/host threat model requires a separate contract.

## Runtime transition rules

There is at most one active attempt globally. Only its captured key/attempt may create operation records. Duplicate operations, overlapping image/vision/snapshot calls, reentry, stale callbacks or settlements without a start poison the mutation instance. No public API imports observations, arbitrary event arrays or caller counters and calls them authenticated execution.

For a meal/label key: image start/settlement precedes vision start. Vision can start only after image returned. The final SDK `beforeRequest` path invokes the **existing** reservation once, then persists `runtime_request_authorized`, then returns to the SDK call site. A failure at either durability boundary prevents the permitted SDK invocation. There is no reservation at the earlier generator-port entry. A successful vision settlement requires that authorization and the existing model-version/pinning contract; metadata callback timing is not itself a provider response or terminal result.

In evidence mode, an existing `reserved` event must correspond to the active vision attempt after its vision start; authorization references that exact unique reservation, never another attempt's reservation. Existing image/non-reservation terminals must correspond to the active attempt, except the explicitly permitted interrupted-reservation recovery. These checks apply during live mutation and ordered replay, not only at report binding. No evidence event increments an image-call counter.

For a barcode key: only snapshot start/settlement is permitted. Image/vision/request authorization and any image reservation fail before their capabilities. A returned snapshot is not a completed nutrition outcome; the existing normalizer/result terminal is still required. No cache, live OFF, image downloader or snapshot reread port is introduced.

A port failure may be followed by the existing valid dataset/product/provider failure terminal, when its current codec and association rules permit it. Do not fabricate an image reservation for a pre-reservation dataset failure or barcode result. A schema/normalization failure after a returned vision response is distinct from port failure. A fatal identity, persistence or mediation failure poisons the instance and stops scheduling; it cannot be converted into an ordinary provider failure.

Finishing an attempt requires the exact existing terminal plus consistent operations:

- Image-backed terminal: exactly one existing reservation; exactly one request authorization for a returned vision operation; no snapshot. A provider rejection before the final hook can produce no image terminal because no image reservation exists. Any permitted alternative failure terminal must satisfy existing association rules.
- Non-reservation dataset failure: no image reservation/request authorization and no successful vision operation. The real existing dataset terminal supplies its failure semantics.
- Barcode terminal: no image/vision/reservation; one snapshot operation with a settlement consistent with its real existing product result.

After finish/abandonment the attempt is closed. A returned local port does not imply a parsed prediction, completed SDK transport, committed terminal or passed stage. Existing protocol counters remain derived solely from existing reservation/terminal events.

## Durability and ownership

All mutation uses the existing exclusive `lock.json`, with hostname, boot ID, PID, `/proc` start ticks and acquisition time. The new header records the initial epoch. Existing `lock_recovery` events establish subsequent epochs; evidence from an old owner remains historical and is never relabelled. Ordinary evidence operations require the active owner. Only recovery closure/abandonment may refer to an earlier attempt under a newly proven owner.

The native composition checks the current exact lock owner and observed lock-file identity around its writes, using the cooperative private-path policy of report publication. It rejects symlinks and non-regular files, preserves private directories/files, and does not advertise atomic directory-fd isolation. Existing cross-host/boot and liveness policy is unchanged: unknown is not dead. No new PID-only or heartbeat shortcut is allowed.

For every accepted event: capture/validate and hold reentry guard; assert owner and transition; create the owned candidate ledger; write complete bytes to an exclusively created sibling temp; fsync the writable descriptor; close; recheck owned paths/lock; rename the candidate over `ledger.json`; fsync the parent directory; recheck owner/path identity; only then advance in-memory state and return success. Loop short writes, reject invalid byte counts, and close owned descriptors on every path. Existing final-file validation hooks must not be mistaken for the writable-fd fsync.

For existing result journals: journal publication and its directory fsync precede the terminal ledger event and its directory fsync; the runtime finish event follows both. Report bytes retain their existing publication/verification sequence; report binding follows durable receipt admission. No return object or copied sequence is permission to bypass those steps.

Any ambiguous write, close, rename, directory fsync, ownership check or reconciliation permanently poisons the instance, retains the lock and stops scheduling. Do not unlink a final artifact or release the lock to hide uncertainty. Clean up only exact exclusively created temp names owned by this operation; never sweep shared directories. A failed write can have reached disk even if its API did not return success; replay, not caller memory, decides what persisted.

The initial unused writer has no provider effect to guard. Evidence-before-effect guarantees become testable only when the separately reviewed native producer is wired to await these boundaries. Neither a writer unit test nor serialization of old diagnostics proves that future wiring already exists.

## Replay, crash cuts and recovery

Constructor replay is provisional structural/state validation only. It grants no report measurements, current ownership, scheduling permission or completed-run authority. Under exclusive current ownership, reread and revalidate the ledger/journal/plan/source identity, establish the current owner epoch, and natively reverify report artifacts before any evidence-dependent operation.

Retain the original `implementationCommit` and identity. Verify the clean current Functions tree against `functionsTreeId` using existing bootstrap/Git-state rules; do not require current HEAD to equal the original implementation commit. No dirty Functions execution or unpinned asset replacement is permitted merely because the tree hash field was supplied.

Rebuild evidence sequence, attempts, operations and ownership in array order alongside existing protocol replay. Reject gaps, duplicates, conflicting terminal/digest references, impossible owner epochs, wrong selected profiles, illegal modality, post-seal outcome mutations and mismatched report bindings. Recompute journal hashes and non-reservation digests with their existing codecs, including duplicate/orphan detection; do not trust filenames or summaries.

| Last durable facts after a proven dead-owner interruption | Recovery |
| --- | --- |
| No attempt, reservation or terminal for a planned key | Existing stage gates may schedule it. |
| Attempt/local operation begun, no reservation or terminal | Preserve history; append unreserved abandonment. A new attempt may start only under existing gates, with next attempt number and new epoch. Vision-port intent alone did not authorize an SDK call: resumption relies on the trusted producer's enforced final reservation hook, not a claim of universal zero network traffic. No automatic rerun of an ordinary failed sample. |
| Reservation exists, no terminal (whether or not request authorization exists) | Never dispatch the key again. Use existing interrupted-reservation recovery, then append reserved abandonment bound to its durable failure terminal. Dispatch uncertainty remains explicit. |
| Real terminal exists, all required runtime settlements exist, finish is missing | Validate the existing facts and append a finish reference; do not invoke any capability again. |
| Real terminal exists, required runtime settlement/authorization is missing | Append terminal-evidence-incomplete abandonment; preserve the terminal, never redispatch and never claim complete evidence. |
| Report files exist, receipt/binding is missing | Reconstruct and natively verify exact artifacts under ownership; admit/rebind only if all required prior terminal/evidence checks pass. No inference or synthesized success. |
| Unknown owner liveness, corrupt/conflicting records, unmatched result journals or ambiguous persistence | Retain lock/fail/report. No automatic retry, root reset, truncation, new run or filesystem repair. |

An ordinary rejection/failed operation is not a crash-resume entitlement. A never-reserved barcode read interrupted before its terminal can follow the read-only recovery row; it does not consume an image call or acquire a fictitious reservation. If no valid existing terminal can represent a failure, evidence remains incomplete and the protocol stops rather than inventing a prediction.

Existing recovery may encounter an already persisted result journal before its terminal ledger append. Preserve its current duplicate/orphan safeguards; this stage does not authorize repairing that cut into success. If current recovery/reconciliation rejects the state, report and stop. A reserved unfinished key is never made resumable to work around it. Interrupted benchmark outcomes still fail existing parse/failure gates.

## Terminal/report reconciliation and binding

For a stage/profile, derive the exact planned key set from pinned inputs and the ledger-selected profile. Require each key to have one finished runtime attempt, one matching existing terminal, no pending operation or reservation, and no reserved/incomplete-terminal abandonment. Earlier unreserved read-only abandoned attempts remain visible, not counted as image calls or successful attempts. All terminal, modality, model pin, `cached: false` and existing report-population checks remain independent requirements.

In evidence mode, receipt admission first requires the preceding terminal/runtime completeness checks without requiring a binding that cannot exist yet. Then invoke the **native** report artifact verifier under the current owner, reconstruct from the captured journals, and admit its receipt through the existing durable event. For the subsequent runtime binding, freshly verify again and require exact equality with that admitted receipt. This order avoids a circular seal requirement and makes the receipt-to-binding crash cut recoverable without reopening outcomes. No arbitrary injected verifier or caller-provided receipt becomes proof by being well typed. The new binding is the one permitted post-receipt runtime record for that pair; opening/mutating its outcomes after receipt admission remains forbidden. A pair has at most one binding; a retry revalidates and returns the same captured binding rather than appending duplicates.

For `bindingSha256`, canonical-encode exactly:

```text
{ version: 1, identity: original CalibrationIdentity, stage, profile,
  throughSequence,
  events: all prior runtime attempt/operation/authorization/finish/abandonment
          events for that pair in sequence order,
  terminals: [{ key, terminal } ...] sorted by canonical key string,
  receipt: exact freshly verified CalibrationPublishedReportReceipt }
```

The canonical key string is `stage|profile|caseId|sampleIndex`, using the existing constrained key primitives and decimal sample index. The `events` array excludes `runtime_report_bound` events. `terminals` contains exactly one entry per planned key and no extra; its terminal references include existing ledger indexes and exact digests. Recompute this digest during replay; a matching digest is integrity/binding, not proof of unobserved execution.

The reconciliation result is a newly owned data snapshot, not an unforgeable admission seal or bearer capability. The next unused slice may validate its records and persistence using hermetic data, but cannot authorize benchmark completion. Future benchmark integration must independently require native producer provenance, current-owner runtime reconciliation, measured frozen nutrient gates and supported historical aggregate comparisons. No caller `passed`, counter, binding filename or digest replaces those gates.

## Required verification in the future implementation plan

Use test-first workers for application/tests; the host reviews, verifies, commits and pushes. Plan separate codec/reducer and opt-in persistence tasks with actual existing-source RED tests, not private backdoors. Preserve old tests and old factory behavior.

- Positive controls cover meal/label, barcode and existing legitimate failure terminals; canonical plan membership and selected-profile expansion; initialization; owner recovery; finish and report-binding replay.
- Negative tests cover closed capture, hostile successful/throwing reflection, reentry before capture, stale callbacks, duplicate/gapped sequence, wrong epoch/key/profile/modality, forward/wrong terminal references, forged/incomplete receipt binding and source drift.
- Inject short/zero/invalid writes, writable-fd fsync, close, rename, directory fsync, lock/path replacement and journal/terminal/binding crash cuts. Assert actual ordering, zero guarded fake effects on persistence failure, poison and retained lock. Do not claim all filesystem races are eliminated.
- Cover all rows of the recovery matrix, including pre-reservation read-only interruption versus reserved request uncertainty, a terminal whose finish was lost, incomplete runtime evidence, and an orphan result journal. Verify no reserved key is redispatched and no old event/terminal is rewritten.
- Verify legacy roots reject opt-in headers in legacy mode and cannot be silently upgraded in new mode; ordinary strict operation remains byte/behavior-compatible. Keep the default CLI without a native controller and keep the unconditional benchmark block.
- Run focused real-source TypeScript/tests, Functions build/lint, nutrition suite and complete Functions suite serially with the existing opt-in public-image skip only. New runtime fault tests are hermetic; fake SDK/transport arithmetic and full producer-before-effect proof belong to the producer integration, not these codec tests.

No Flutter/APK/device/UI, Firebase/emulator, cloud/provider, live accuracy or production validation is performed for writing this contract. Later implementation must record its actual command exits, test counts, skipped gates and review scope; historical counts do not carry forward as fresh evidence.

## Workflow and review record

The approved architecture permits this written spec only. After self-review and exact-text Antigravity review, commit/push this document and its status update, and ask the user to review the written contract. Only written-spec approval permits the writing-plans stage. The plan itself must be reviewed and its execution method selected before application edits.

Use the existing branch/checkout and preserve user `.mcp.json` unread, undiffed and unstaged. Do not recreate the completed prerequisite workspace. Any sizable new temporary artifacts must use a verified disk-backed task-scoped location; `/tmp` is tmpfs. Writing this document requires no build workspace or dependency installation.

Architecture consultation: Antigravity MCP, `gemini-3.8-flash`, persistent conversation `calorix-durable-runtime-evidence-contract-20261014`, two calls before the user's approval. First response agreed but incorrectly called reservations journal entries and overextended permanent key consumption to any operation intent. Those errors were rejected, not adopted. The second response explicitly retracted both and returned `AGREEMENT_STATUS: agree`, `MUST_FIX: none`, `SHOULD_FIX: none`, `QUESTIONS: none` for the corrected single-ledger direction only. No provider fallback or tool failure occurred. No code, exact written spec, runtime, security, accuracy or production approval was supplied by that consultation.

Written-spec review: third call in the same MCP conversation, primary `gemini-3.8-flash`, reviewed the complete 214-line, 28,546-byte draft (SHA-256 `e5c1f8a6ccdd20e2db6be210cca92c08dbc0ff5ad92e56e023a48276efdaa45e`) supplied as text after host self-review. It explicitly confirmed `WRITTEN_SPEC_ONLY`, `AGREEMENT_STATUS: agree`, `MUST_FIX: none`, `SHOULD_FIX: none`, `QUESTIONS: none`. No tool failure, fallback or repository mutation was observed. Its general praise is not independent source inspection, syscall verification or proof of bounded whole-store memory use; the stated event limits do not bound the unchanged store's entire legacy JSON read. Only review-status/provenance text changed after that snapshot, not the reviewed normative contract. No application tests or live/visual runs were performed for this documentation stage. User written-spec review remains the next gate.

User written-spec approval: received on 2026-10-14 after the committed/pushed contract was linked at `8ec53d378ee93e4ed290c8eef3f7f3780a148cff`. This closes the written-spec gate described in the preceding historical receipt and authorizes writing the implementation plan, not executing an unwritten/unreviewed plan. The normative contract is unchanged.
