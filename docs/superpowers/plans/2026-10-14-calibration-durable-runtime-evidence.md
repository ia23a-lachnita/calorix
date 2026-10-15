# Calibration Durable Runtime Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build unused, versioned runtime-evidence codecs and replay/persistence under the existing calibration ledger and lock without granting completed-run authority.

**Architecture:** A pure codec owns the serialized contract; a pure immutable reducer previews keyed runtime transitions alongside validated protocol facts. An explicitly opt-in mode in the existing ledger core commits those previews through guarded native storage. Native assembly derives canonical plans from pinned files and selects real Git/report readers; no runtime producer, default controller or benchmark authorization is wired.

**Tech Stack:** Existing TypeScript strict/exact-optional configuration, Node synchronous filesystem/Git readers, SHA-256 and Vitest. No dependency or package changes.

**Spec:** `docs/superpowers/specs/2026-10-14-calibration-durable-runtime-evidence-design.md` (user-approved written contract, 2026-10-14).

## Global Constraints

- Preserve one canonical `ledger.json` array, `journal.json`, existing reports and `lock.json` beneath unchanged `CALIBRATION_ROOT`; no companion authority file, second lock, heartbeat, root reset or automatic migration.
- Header includes `reportAuthority: 'verified_artifacts_v1'`, `runtimeEvidenceVersion: 1` and initial `owner` in the single extended `protocol_identity` publication. Existing modes/header codecs/public signatures stay unchanged.
- Seven runtime event types, exact fields and terminal/disposition unions are those in the spec. Runtime sequence is contiguous independently of one-based full-ledger event indexes; references point backward.
- At most 4096 runtime events; at most 16 KiB canonical UTF-8 per runtime event/header. These are storage bounds, not changed call quotas. Check strings before encoding; no lone surrogates, nonfinite/unsafe numbers or negative-zero indexes.
- Canonical JSON recursively sorts record keys, preserves array order and has no whitespace/BOM/newline; SHA-256 uses its UTF-8 bytes. Existing journal/non-reservation/report digest algorithms remain unchanged.
- Closed descriptor-only capture and pre-reflection reentry guards; own/freeze only copied data. Fresh static causeless fatals; no foreign exception inspection or raw error retention.
- No prompts, image bytes, raw responses, predictions, credentials, stacks or arbitrary paths in runtime records. The required five owner fields remain the narrow metadata exception.
- Existing `reserved` events are the only image accounting authority. Never dispatch a reserved unfinished key again. Never-reserved interruption may resume only under existing gates with new attempt/owner history; ordinary failures do not grant retries.
- Preserve original implementation identity and clean Functions-tree validation across docs-only HEAD movement. Unknown liveness, ambiguous durability or unresolved journal conflicts retain the lock and fail.
- Keep `calibration:benchmark-runtime-evidence-required` unconditional. No producer/SDK-hook wiring, default CLI, historical comparison integration, full 146-call execution, live/cloud/device/UI work, production model change or deployment.
- Native composition chooses the report verifier and Git reader; caller counters/receipts/verifiers are not native authority. Low-level reducer/core test seams are data/cooperative-trust interfaces, never admission tokens.
- Keep `/tmp` minimal. New logs/caches/fixtures use this plan's verified disk-backed directory; no completed workspace recreation or shared cleanup. Preserve user `.mcp.json` unread/undiffed/unstaged.
- Host edits planning/tracking docs, interprets requirements, verifies, commits and pushes. Application/tests use AGENTS.md strongest-first workers, never worker commits. Preserve approved inline execution; one fresh native whole-plan reviewer after all tasks, not a native reviewer per task. Antigravity pre-plan and actual code/result gates remain mandatory.

## Review Focus

1. A crash during initialization must never leave an ordinary header mistaken for opted-in evidence — atomic extended-header and old-mode rejection tests in Tasks 1/3/4.
2. A binding retried after unrelated later-stage events must retain its original `throughSequence` and digest — pure prefix/rebinding tests in Task 2 and native idempotence in Task 4.
3. An orphan result journal must not become a repaired success or a rerun — actual journal-to-terminal crash tests in Tasks 3/4.
4. Unreserved vision intent is not reserved dispatch uncertainty, while neither proves universal zero network activity — distinct recovery fixtures in Tasks 2/3/4.
5. Successful reflection traps and failing close/lock checks can reenter despite valid-looking values — guarded capture tests in Tasks 1/3 and syscall/owner tests in Task 4.

## Execution boundary and files

Planning baseline: `8ec53d378ee93e4ed290c8eef3f7f3780a148cff`, `fix/scan-photo-flow-viewer`, `/home/agent-runner/projects/calorix`. At execution record the then-current task BASE and fingerprints before RED. Do not reuse a completed workspace or run a second editor/verifier concurrently on this Pi.

| Path | Responsibility / allowed task |
| --- | --- |
| `functions/src/nutrition-eval/calibration-runtime-evidence-codec.ts` | New pure event/header/binding codec, Task 1. |
| `functions/src/nutrition-eval/calibration-runtime-evidence-state.ts` | New pure immutable transition/reconciliation state, Task 2. |
| `functions/src/nutrition-eval/calibration.ts` | Only explicit evidence-mode branches in the existing shared core and new low-level factory/methods, Task 3. |
| `functions/src/nutrition-eval/calibration-file-store.ts` | Shared private storage implementation with a new guarded opt-in factory; old factory behavior unchanged, Task 4. |
| `functions/src/nutrition-eval/calibration-runtime-evidence-ledger.ts` | New unused native assembly, Task 4. |
| `functions/test/nutrition-eval/calibration-runtime-evidence-fixtures.ts` | New test-owned fixture/data/trace helpers, Tasks 1–4. |
| `functions/test/nutrition-eval/calibration-runtime-evidence-codec.test.ts` | New Task 1 tests. |
| `functions/test/nutrition-eval/calibration-runtime-evidence-fixture-controls.test.ts` | New Task 1 existing-source fixture controls; no missing/future module execution. |
| `functions/test/nutrition-eval/calibration-runtime-evidence-state.test.ts` | New Task 2 tests. |
| `functions/test/nutrition-eval/calibration-runtime-evidence-core.test.ts` | New Task 3 tests. |
| `functions/test/nutrition-eval/calibration-runtime-evidence-native.test.ts` | New Task 4 tests. |
| This plan, its spec's approval/review metadata, `docs/implementation-status.md` | Host tracking only. |

All other existing source/tests/assets remain protected, especially the completed runtime-capability primitive/tests, adapter, CLI, preflight/protocol sessions, reports, thresholds and historical reference. No blanket core extraction/refactor or changing old assertions. If the above boundary cannot implement a requirement, stop and amend/review this plan rather than silently widen it.

## Shared interfaces and construction rules

Task 1 exports the following types (all fields readonly) and functions. Import existing identity/owner/key/stage/profile/receipt types with `import type`; do not create runtime cycles with `calibration.ts`.

```ts
type RuntimeAttemptRef = { key: CalibrationReportOutcomeKey; attempt: number };
type RuntimeOperation = 'image' | 'vision' | 'snapshot';
type RuntimeTerminal =
  | { kind: 'image'; eventIndex: number; journalHash: string }
  | { kind: 'non_reservation'; eventIndex: number; contentDigest: string };
type RuntimeDisposition =
  | { kind: 'unreserved_interruption' }
  | { kind: 'reserved_interruption'; terminal: Extract<RuntimeTerminal, { kind: 'image' }> }
  | { kind: 'terminal_evidence_incomplete'; terminal: RuntimeTerminal };
type RuntimeCommon = { version: 1; sequence: number; owner: CalibrationOwner; at: string };
type RuntimePayload =
  | ({ type: 'runtime_attempt_started' } & RuntimeAttemptRef)
  | ({ type: 'runtime_operation_started'; operation: RuntimeOperation } & RuntimeAttemptRef)
  | ({ type: 'runtime_operation_settled'; operation: RuntimeOperation; result: 'returned' | 'failed' } & RuntimeAttemptRef)
  | ({ type: 'runtime_request_authorized'; reservationEventIndex: number } & RuntimeAttemptRef)
  | ({ type: 'runtime_attempt_finished'; terminal: RuntimeTerminal } & RuntimeAttemptRef)
  | ({ type: 'runtime_attempt_abandoned'; disposition: RuntimeDisposition } & RuntimeAttemptRef)
  | { type: 'runtime_report_bound'; stage: StageName; profile: CalibrationProfile;
      receipt: CalibrationPublishedReportReceipt; throughSequence: number; bindingSha256: string };
type RuntimeEvidenceEvent = RuntimeCommon & RuntimePayload;
type RuntimeEvidenceHeader = { type: 'protocol_identity'; identity: CalibrationIdentity;
  at: string; reportAuthority: 'verified_artifacts_v1'; runtimeEvidenceVersion: 1; owner: CalibrationOwner };
type RuntimePairEvent = Exclude<RuntimeEvidenceEvent, { type: 'runtime_report_bound' }>;
type RuntimeBindingInput = { version: 1; identity: CalibrationIdentity;
  stage: StageName; profile: CalibrationProfile; throughSequence: number;
  events: readonly RuntimePairEvent[];
  terminals: readonly { key: CalibrationReportOutcomeKey; terminal: RuntimeTerminal }[];
  receipt: CalibrationPublishedReportReceipt };

function captureCalibrationRuntimeEvidenceHeader(value: unknown): Readonly<RuntimeEvidenceHeader>;
function captureCalibrationRuntimeEvidenceEvent(value: unknown): Readonly<RuntimeEvidenceEvent>;
function encodeCalibrationRuntimeEvidenceHeader(value: unknown): string;
function encodeCalibrationRuntimeEvidenceEvent(value: unknown): string;
function hashCalibrationRuntimeEvidenceBinding(value: unknown): string;
```

The header/event 16 KiB bound does not incorrectly limit the aggregate binding input to 16 KiB. Binding capture separately checks its exact shape, at most 4096 already bounded events and at most 158 unique canonical-key terminal rows; it rejects wrong-pair events, binding events in `events`, unsorted/duplicate terminals, future sequences and receipt mismatch. Full population and hash/terminal consistency are checked by Task 2/core, not implied by the hash function alone. No general-purpose arbitrary-object serializer is exported. Use shared **private** capture/encoding helpers; existing private validators may be mirrored narrowly with tests rather than exporting/changing unrelated APIs.

Task 2 has no runtime filesystem, provider, bootstrap or ledger import. It consumes data already derived by the native assembly from pinned files; these internal/test inputs are not a replacement-plan option on the native API. This avoids a `calibration -> state -> bootstrap -> calibration` runtime import cycle and keeps the reducer genuinely pure.

```ts
type RuntimeCanonicalPlans = {
  initial: readonly CalibrationPlannedReportOutcome[];
  LOW: readonly CalibrationPlannedReportOutcome[];
  MEDIUM: readonly CalibrationPlannedReportOutcome[];
};
type RuntimeProtocolFact =
  | { kind: 'reserved'; eventIndex: number; key: ReservationKey }
  | { kind: 'image_terminal'; eventIndex: number; key: ReservationKey;
      terminalType: 'completed' | 'failed'; journalHash: string; journal: JournalEntry }
  | { kind: 'non_reservation_result'; eventIndex: number; event: CalibrationNonReservationLedgerEvent }
  | { kind: 'model_version_pinned'; eventIndex: number; responseModelVersion: string }
  | { kind: 'profile_selected'; eventIndex: number; profile: CalibrationProfile }
  | { kind: 'artifact_receipt_admitted'; eventIndex: number; receipt: CalibrationPublishedReportReceipt }
  | { kind: 'lock_recovery'; eventIndex: number; staleOwner: CalibrationOwner; recoveringOwner: CalibrationOwner }
  | { kind: 'protocol_noop'; eventIndex: number; eventType: 'token_count_reserved' |
      'token_count_completed' | 'token_count_failed' | 'safe_error' | 'stage_completed' };
type RuntimeFrame = RuntimeProtocolFact |
  { kind: 'runtime'; eventIndex: number; event: RuntimeEvidenceEvent };
type RuntimeEvidenceSnapshot = { sequence: number; lastEventIndex: number;
  owner: CalibrationOwner; activeAttempt: RuntimeAttemptRef | null;
  events: readonly RuntimeEvidenceEvent[] };
interface CalibrationRuntimeEvidenceState {
  preview(frame: unknown): Readonly<CalibrationRuntimeEvidenceState>;
  snapshot(): Readonly<RuntimeEvidenceSnapshot>;
  pairInput(stage: StageName, profile: CalibrationProfile, throughSequence: number):
    Readonly<Omit<RuntimeBindingInput, 'receipt'>>;
}
function prepareCalibrationRuntimeEvidenceState(params: unknown): Readonly<CalibrationRuntimeEvidenceState>;
// Exact params: { header: RuntimeEvidenceHeader, plans: RuntimeCanonicalPlans }.
```

`preview` never changes the old state. It returns a new owned immutable state; the core assigns it only after physical durability. Plans are closed captured data, with 50 initial / 158 expanded outcomes, the correct 146 vision / 12 barcode distinction after selection, unchanged initial prefix, unique keys, modality and per-stage/profile coverage. Native assembly derives them with `deriveCanonicalReportOutcomePlan(files)` and `(files, 'LOW'/'MEDIUM')`; no caller may supply them to the native factory. Protocol facts are built only after existing shared-core validation, not ingested as unchecked raw legacy events. Capture them and recompute their existing digests; interrupted journals use the existing canonical interrupted shape, not a fabricated `reportPrediction`.

Task 3 adds these interfaces to `calibration.ts` without changing existing factory signatures:

```ts
interface CalibrationRuntimeEvidenceLedger extends CalibrationProtocolLedger {
  startRuntimeAttempt(key: unknown): Readonly<RuntimeAttemptRef>;
  startRuntimeOperation(ref: unknown, operation: unknown): void;
  settleRuntimeOperation(ref: unknown, operation: unknown, result: unknown): void;
  authorizeRuntimeRequest(ref: unknown): void;
  finishRuntimeAttempt(ref: unknown): void;
  bindRuntimeStageReport(stage: StageName, profile: CalibrationProfile): Readonly<RuntimeEvidenceEvent & { type: 'runtime_report_bound' }>;
  getRuntimeEvidenceSnapshot(): Readonly<RuntimeEvidenceSnapshot>;
}
function createRuntimeEvidenceCalibrationLedger(
  deps: CalibrationLedgerDeps, identity: CalibrationIdentity,
  keyResolver: CalibrationKeyResolver, reportOptions: CalibrationProtocolReportOptions,
  authoritativeOptions: CalibrationAuthoritativeReportOptions,
  runtimeOptions: { initialOwner: CalibrationOwner; plans: RuntimeCanonicalPlans;
    readCurrentGitState: () => Parameters<CalibrationLedger['assertGitState']>[0] },
): CalibrationRuntimeEvidenceLedger;
```

This is a low-level trusted-dependency core interface, not the native authority entry. Runtime methods synthesize type/version/sequence/owner/time and resolve existing terminal/reservation references themselves. No public raw-event append or caller-selected sequence/digest/abandonment method. `authorizeRuntimeRequest` does **not** reserve or invoke any SDK; a future producer calls the existing `reserve` once, then this method. Ordinary failures and recovered incomplete evidence cannot be hidden by these method names. The new-mode public method guard invokes the captured source reader and the existing private Git-state validation **inside the core's reentry/poison scope** before acquisition, authority reads and mutations. Capture the returned data before checking it; never call the public `assertGitState` recursively from that guard. Unit fixtures supply an explicitly trusted reader; native assembly never accepts one from its caller. No external wrapper can fail a source check while leaving a usable, unpoisoned inner ledger.

Task 4 exports native assembly and guarded storage:

```ts
type RuntimeEvidenceFileStoreOverrides = Pick<CalibrationFileStoreOverrides,
  'procStatReader' | 'nowIso' | 'renameSync' | 'fsyncDirSync' | 'fdWriteSync' |
  'fdFsyncSync' | 'fdCloseSync' | 'linkSync' | 'unlinkSync'>;
function createRuntimeEvidenceFileCalibrationLedgerDeps(
  baseDir: string, owner: CalibrationOwner, overrides?: RuntimeEvidenceFileStoreOverrides,
): CalibrationLedgerDeps;
async function prepareNativeCalibrationRuntimeEvidenceLedger(
  params: unknown, overrides?: RuntimeEvidenceFileStoreOverrides,
): Promise<Readonly<CalibrationRuntimeEvidenceLedger>>;
// Exact params: { context: CalibrationPreparedContext }.
```

Native assembly captures context before its first await, derives all plans/key/report resolvers from its pinned `files`, prepares `prepareCalibrationStageReportArtifactVerifier(context)`, selects guarded native storage and creates the shared-core mode with that native verifier. It captures the real `createCalibrationBootstrapReadDeps(context.baseDir).readGitState` function itself and checks it via existing Git-state/identity rules before acquisition/mutation/evidence authority reads; caller context is not itself evidence that current source is clean. No injected `verify`, Git-reader callback, replacement plans, alternate root, high-level `writeExclusiveSync` or legacy `fsyncFileSync` override is accepted by this native API. Low-level hooks are explicit trusted fault-test seams, not claims of physical durability when dishonestly implemented.

## Fixture and verification conventions

New fixture helper exports `makeRuntimeEvidenceData()` returning a Promise of `{ context, header, plans, key, start }`, where `key` is the first real preflight LOW key and `start` is its seq1/attempt1 event. Use `prepareCalibrationBootstrapContext` with committed asset bytes and test-owned Git/owner readers, the seven actual preflight files, and the existing planner. No invented case IDs or fake public/training manifest replacements. A second helper `makeRuntimeEvidenceCoreFixture()` returns test-owned ledger deps and the new core, with `ledger`, `owner`, `key`, `events`, `journals`, mutable fault controls, `restart(owner)`, `createUnacquiredLedger()`, `trace`, `finishPreflight()`, `finishDevelopment()`, `finishValidation()` and `cleanup()`; its internal verifier/source-reader seams are unit-test trust boundaries, never native report/source-proof tests. `makeRuntimeEvidenceNativeFixture()` returns an owned disk fixture with the same stage helpers, `ledger`, `owner`, `key`, `context`, `root`, `trace`, `restart(owner)`, `cleanup()` and low-level fault controls.

Stage helpers emit real runtime methods around **synthetic hermetic results**, use canonical plan keys, existing journal/prediction codecs, scorer and report assembler/publication, and existing gate helpers. They account for both preflight profiles, separate token reservation, profile choice and the 12 barcode outcomes. They do not construct a model client or call the unused runtime-capability producer. Independently decode resulting disk records for ordering/assertions; do not assert expected counts solely from the new reducer's snapshot. Build ordinary provider/dataset/product failure predictions only with the current schema's actual accepted codes.

The shared fixture never imports future/new source modules at runtime at module scope: core/native builders dynamically import them only when invoked. Task 1 controls invoke only `makeRuntimeEvidenceData()` and existing bootstrap/planner/scoring code, so missing source cannot masquerade as a fixture defect.

All suites install SDK-construction/global-fetch throwing guards and assert zero attempts; these guards are not universal network isolation. Data fixtures only read committed assets. Disk fixtures use `mkdtempSync` beneath `TMPDIR` (or the ignored disk-backed `functions/lib/runtime-evidence-test-tmp` fallback for CI), and clean exact owned prefixes in `afterEach` even on failure. For native Git checks, create a tiny task-owned Git fixture with committed `functions/` and pinned asset copies, prepare real bootstrap/native source readers, and use real docs-only commits/dirty source mutations in that fixture. No dependency on the main checkout being clean while TDD source is dirty; no writes to the user's Git state/config or completed workspaces.

At execution, after using-git-worktrees confirms the preserved checkout and user state, create only this plan's new `.superpowers/sdd/2026-10-14-calibration-durable-runtime-evidence` workspace. Verify `df -T` first. Set its absolute `TMPDIR`, `npm_config_cache`, log directory and `NODE_OPTIONS=--max-old-space-size=1024`; retain those exact values in task receipts. Worker/test processes are serial. Commands below run in `functions/`, with actual exits and logs collected, not inferred from JSON alone.

For strict test typing, author `.superpowers/sdd/2026-10-14-calibration-durable-runtime-evidence/strict-runtime-evidence-tests.json` extending `/home/agent-runner/projects/calorix/functions/tsconfig.json`, overriding `module: ESNext`, `moduleResolution: Bundler`, `rootDir: /home/agent-runner/projects/calorix/functions`, `types: ['node']`, `typeRoots: ['/home/agent-runner/projects/calorix/functions/node_modules/@types']`, including absolute actual `src/**/*.ts` plus the new tests/helper and setting `noEmit: true`. New tests import Vitest functions explicitly. Keep all existing strict flags. Run the literal no-emit command in Completion gates; do not substitute fake declarations for real source types. This ignored task artifact is not application code or committed build configuration.

## Task 1: Closed codec and deterministic binding digest

**Files:** Create codec source, codec tests and the data part of the new fixture helper listed above. No existing application edits.

**Consumes:** Existing identity/owner/key/receipt definitions and exact spec event shapes. **Produces:** Task 1 shared types/functions; `makeRuntimeEvidenceData()`.

- [ ] **Step 1: Worker writes RED fixtures/tests only.** Read existing bootstrap/prediction/codec patterns, build the independently pinned data helper and dynamically import the missing codec in behavioral tests so a failure is attributable to the missing feature. Example actual assertions:

```ts
it('encodes a closed start and preserves caller ownership', async () => {
  const f = await makeRuntimeEvidenceData();
  const m = await import('../../src/nutrition-eval/calibration-runtime-evidence-codec');
  const captured = m.captureCalibrationRuntimeEvidenceEvent(f.start);
  expect(captured).toEqual(f.start);
  expect(captured === f.start).toBe(false);
  expect(Object.isFrozen(f.start)).toBe(false);
  const reordered = Object.fromEntries(Object.entries(f.start).reverse());
  expect(m.encodeCalibrationRuntimeEvidenceEvent(reordered))
    .toBe(m.encodeCalibrationRuntimeEvidenceEvent(f.start));
});
it('requires authority and evidence markers together', async () => {
  const f = await makeRuntimeEvidenceData();
  const m = await import('../../src/nutrition-eval/calibration-runtime-evidence-codec');
  const header = { ...f.header };
  delete (header as Partial<typeof header>).reportAuthority;
  expect(() => m.captureCalibrationRuntimeEvidenceHeader(header)).toThrow(CalibrationFatalError);
});
```

Add explicit positive/negative cases for all seven variants/three dispositions/two terminals; unknown fields, symbols/accessors, sparse arrays, successful and throwing reflection traps, mutable aliases, foreign thrown values, invalid timestamps/keys/digests, negative-zero and unsafe indexes, 16 KiB boundary/one byte over, lone surrogates, receipt/stage mismatch and wrong-pair/binding events in digest input. Pin a literal canonical byte string and independently computed hash for a small valid binding input; compare Node `createHash` against those bytes, not hash against itself. Check the aggregate binding can exceed 16 KiB while its individual events remain bounded.

- [ ] **Step 2: Host witnesses RED and freezes tests.** First run `npx vitest run test/nutrition-eval/calibration-runtime-evidence-fixture-controls.test.ts --maxWorkers=1 --minWorkers=1`, expected exit0. Its assertions independently require 50 initial/158 expanded real outcomes, 12 barcode keys per expanded profile, matching pinned manifest hashes and zero SDK/fetch. Then run `npx vitest run test/nutrition-eval/calibration-runtime-evidence-codec.test.ts --maxWorkers=1 --minWorkers=1`; expected exit1 for missing codec, not broken fixture/network/setup. Record fixture/test SHA-256 and actual failure. No private source backdoor for bounds.

- [ ] **Step 3: Worker implements source only.** Use a private descriptor capture and canonical serializer, narrow primitive validators, fresh `calibration:runtime-evidence-invalid` fatals, exact variant dispatch and owned deep freeze. Implement the Task 1 signatures, complete byte-length checks before serialization allocations, and separate aggregate-binding versus individual-record limits. No imports with filesystem/provider effects and no change to legacy hash helpers.

For example, after closed capture/recursive canonical encoding into local `encoded` bytes, the individual event encoder must enforce the final byte bound before returning; binding hashing does not apply that individual-record cap to the whole aggregate:

```ts
if (Buffer.byteLength(encoded, 'utf8') > 16 * 1024) {
  throw new CalibrationFatalError('calibration:runtime-evidence-invalid');
}
// Binding function, after its own closed aggregate capture:
return createHash('sha256').update(encoded, 'utf8').digest('hex');
```

- [ ] **Step 4: Host verifies GREEN and checkpoints.** Run the same focused test command (expected exit0), strict real-source/test no-emit check, `npm run build`, `npm run lint`, nutrition and full Functions tests per Completion gates below. Review actual source and tests against every variant and privacy rule; get Antigravity actual code/result green. Update this task/status, then normal host commit `Add closed runtime evidence codec`, push and verify exact remote SHA. Keep old source/tests/assets unchanged.

## Task 2: Pure immutable reduction and keyed reconciliation

**Files:** Create state source/state tests; extend only new fixtures. **Consumes:** Task 1 codec/types and owned canonical plans. **Produces:** Task 2 state/frame/snapshot interfaces; no persistence or execution authority.

- [ ] **Step 1: Worker writes actual RED transition tests.** Build frames from real pinned keys and existing validated journal/non-reservation codecs. Define the local test helper `runtimeFrame(eventIndex, event)` to return `{kind:'runtime', eventIndex, event}`. Then test immutable preview directly:

```ts
it('previews without mutating the last durable state', async () => {
  const f = await makeRuntimeEvidenceData();
  const { prepareCalibrationRuntimeEvidenceState } = await import('../../src/nutrition-eval/calibration-runtime-evidence-state');
  const state = prepareCalibrationRuntimeEvidenceState({ header: f.header, plans: f.plans });
  const candidate = state.preview({ kind: 'runtime', eventIndex: 2, event: f.start });
  expect(state.snapshot().sequence).toBe(0);
  expect(candidate.snapshot().sequence).toBe(1);
  expect(candidate.snapshot().activeAttempt).toEqual({ key: f.key, attempt: 1 });
});
it('cannot authorize a request using the header as reservation', async () => {
  const f = await makeRuntimeEvidenceData();
  const { prepareCalibrationRuntimeEvidenceState } = await import('../../src/nutrition-eval/calibration-runtime-evidence-state');
  const s = prepareCalibrationRuntimeEvidenceState({ header: f.header, plans: f.plans })
    .preview({ kind: 'runtime', eventIndex: 2, event: f.start });
  const forged = { ...f.start, type: 'runtime_request_authorized', sequence: 2, reservationEventIndex: 1 };
  expect(() => s.preview({ kind: 'runtime', eventIndex: 3, event: forged })).toThrow(CalibrationFatalError);
});
```

Add concrete table-driven frames for image-return/vision/reservation/authorization/metadata/terminal/finish, barcode snapshot-only, dataset/product/provider/parse failures, and every crash row. Assert all twelve selected-profile barcode keys reject image/vision/reservation frames; old owner events cannot settle a new attempt; abandoned unreserved attempts increment attempt number only after a valid recovery epoch; a reserved abandonment requires the canonical interrupted failure terminal. Refuse concurrent/duplicate operations, duplicate/gapped event indexes/sequences, fake plan coverage, wrong terminal/hash/receipt, pending settlements, post-admission mutation and 4097th runtime event. Exercise the 4096 cap through reachable repeated read-only recovery histories, not a hidden state override.

For prefix binding, finish both preflight profiles, admit LOW receipt, append its binding, then complete/bind MEDIUM and add legal later-pair frames. Re-request LOW `pairInput` at LOW's stored prefix: byte-equivalent input and hash, no new event. Before admission, `pairInput` may supply completeness data; it must not itself require a receipt/binding and create a circular seal.

- [ ] **Step 2: Host runs RED, freezes state tests/helper.** Run `npx vitest run test/nutrition-eval/calibration-runtime-evidence-state.test.ts --maxWorkers=1 --minWorkers=1`; expected exit1 for missing state implementation. Rerun Task 1 tests unchanged. Record exact exits and fingerprints.

- [ ] **Step 3: Worker implements source only.** Capture header/plans once; privately retain immutable maps/arrays and clone only owned mutable state for each preview. Advance full-ledger index for every validated frame and runtime sequence only for runtime events. Derive operation/ref/owner/seal state, recompute existing journal/non-reservation digests, build sorted pair terminal rows and reject incomplete or mismatched evidence. Facts do not replace the original ledger's token/stage/selection/nutrient checks. No `node:fs`, network, bootstrap or runtime import of `calibration.ts`; type-only imports and `node:crypto`/pure codecs are allowed. Snapshot/pair output copies cannot alter retained state.

Inside preview, `frame` denotes the already closed captured frame; `lastEventIndex`/`sequence` are this immutable state's retained primitives. Reject before allocating/returning a candidate:

```ts
if (frame.eventIndex !== lastEventIndex + 1 ||
    (frame.kind === 'runtime' && frame.event.sequence !== sequence + 1)) {
  throw new CalibrationFatalError('calibration:runtime-evidence-transition-invalid');
}
if (frame.kind === 'runtime' && sequence >= 4096) {
  throw new CalibrationFatalError('calibration:runtime-evidence-transition-invalid');
}
```

- [ ] **Step 4: Host verifies GREEN and checkpoints.** Run codec+state suites, strict real-source typing, all Completion gates and Antigravity code/result review. Update tracking, normal host commit `Add keyed runtime evidence reduction`, push/exact remote equality. No application outside these new pure files changes.

## Task 3: Explicit shared-core evidence mode

**Files:** Modify only `calibration.ts`; create core tests; extend new core fixture. **Consumes:** Tasks 1/2, existing ledger deps/report authority. **Produces:** New low-level factory and runtime methods; existing factories and benchmark block unchanged.

- [ ] **Step 1: Worker writes RED core tests.** New fixture controls validate the existing strict/authoritative factory before using the new factory; no production ledger mock. Use real owned in-memory deps that clone persisted arrays and expose each write/fsync/fault point independently. Tests call the new runtime APIs, inspect stored arrays independently, and verify actual ledger state:

```ts
it('has one atomic mode header and one reservation authority', async () => {
  const f = await makeRuntimeEvidenceCoreFixture();
  const ref = f.ledger.startRuntimeAttempt(f.key);
  f.ledger.startRuntimeOperation(ref, 'image');
  f.ledger.settleRuntimeOperation(ref, 'image', 'returned');
  f.ledger.startRuntimeOperation(ref, 'vision');
  f.ledger.reserve(f.key);
  f.ledger.authorizeRuntimeRequest(ref);
  expect(f.events[0]).toMatchObject({ type: 'protocol_identity',
    reportAuthority: 'verified_artifacts_v1', runtimeEvidenceVersion: 1, owner: f.owner });
  expect(f.events.filter(e => e.type === 'protocol_identity')).toHaveLength(1);
  expect(f.events.filter(e => e.type === 'reserved')).toHaveLength(1);
  expect(f.events.filter(e => e.type === 'runtime_request_authorized')).toHaveLength(1);
  expect(f.ledger.getCounts().imageReserved).toBe(1);
});
it('does not expose constructor replay as current-owner authority', async () => {
  const f = await makeRuntimeEvidenceCoreFixture();
  const other = f.createUnacquiredLedger();
  expect(() => other.getRuntimeEvidenceSnapshot()).toThrow(CalibrationFatalError);
  expect(() => other.startRuntimeAttempt(f.key)).toThrow(CalibrationFatalError);
});
```

Define `createUnacquiredLedger(): CalibrationRuntimeEvidenceLedger` on this test fixture (same deps/options; no acquisition). Include all existing strict mode combinations: empty, ordinary header, authority-only header, unknown/missing version, wrong marker, nonempty journal/no header, duplicate header and old factories opening the new header. Old-mode positive controls retain their exact event bytes.

Exercise durable failure at header/runtime/reservation/terminal/receipt/binding append/file-hook/dir-hook; no candidate state advances before final success; foreign errors become fresh static fatals and release fails after poison. Successful reflection traps reenter start/get/settle/reserve/release before capture finishes: no extra writes, permanent poison, no foreign raw error. Check `protocol_noop` maps only the five named already validated kinds; unknown/synthetic events retain existing rejection. Assert bare reserve/terminal without corresponding attempt is rejected in new mode but old behavior is unchanged.

Add recovery tests for every matrix row with a proven dead owner, including unreserved vision intent, reserved-but-not-authorized, authorized/no terminal, real terminal/no finish, missing settlement, orphan journal and admitted receipt/no binding. No reserved key appears as resumable. No inference port exists on this object, and no synthetic success closes a conflict. Unit verifier fakes are explicitly not native authority proof; native report-byte/tamper cases belong to Task 4.

- [ ] **Step 2: Host witnesses RED and freezes tests.** Run `npx vitest run test/nutrition-eval/calibration-runtime-evidence-core.test.ts --maxWorkers=1 --minWorkers=1`, expected exit1 for missing new factory/methods, not an invalid fixture or loosened old assertions. Run `npx vitest run test/nutrition-eval/calibration-protocol-ledger.test.ts test/nutrition-eval/calibration-authoritative-reports.test.ts --maxWorkers=1 --minWorkers=1` as unchanged positive controls and record all hashes/exits.

- [ ] **Step 3: Worker implements guarded mode branches only.** Add new explicit internal-init mode, not a sixth option to the old public factory. Extend header creation/replay only in that mode. Route validated protocol events to Task 2 facts, with existing journal/hash capture for terminal facts; full-ledger indexes include header/noops. In `strictPersistLedgerEvent`, preview before effects, persist through existing append/file-validation/dir-fsync, then assign the candidate only after success; poison on any boundary failure. During constructor/current-owner replay, fold immutable facts in original order, but keep authority provisional until locked reread and native artifact checks.

Guard **all** new-mode methods (including inherited getters/reserve/release) before reflecting caller values or calling trusted callbacks, with `finally` release and poison recheck. Capture/invoke `readCurrentGitState` and run existing private source checks in this guard so failures poison the same core and retain any held lock. Check poison immediately after the reader, after capturing its result and after any successful hostile reflection, before persistence begins. Internal private calls must not trip their own public reentry guard. Resolve terminal/ref data from existing validated maps, not caller hashes. Allow only recovery's private path to close an older owner attempt, after durable `lock_recovery`; calling recovery on a currently active same-owner attempt cannot manufacture crash entitlement. Recovery first preserves existing interrupted journal/terminal logic, then appends the correct abandonment or finish; do not repair existing orphan/conflict rejection.

Receipt admission first uses runtime completeness without binding, then existing fresh verifier/durable admitted receipt/seal. Binding re-verifies and captures the admitted receipt, computes the spec input/digest, persists once and returns a copied data event. Retry uses the existing event's original prefix even after other pair events; do not change `throughSequence` to current sequence. Existing stage/nutrient/report gates remain in force; benchmark completion still throws unconditionally. No native producer, raw-event append API or extra admission seal.

The evidence-mode persistence branch has this ordering (`frame` has been projected/captured from the validated event and existing result maps):

```ts
const candidate = runtimeState.preview(frame);
if (poisoned) throw new CalibrationFatalError('calibration:ledger-poisoned');
try {
  deps.appendLedgerEvent(event);
  if (poisoned) throw new CalibrationFatalError('calibration:ledger-poisoned');
  deps.fsyncLedgerFile();
  if (poisoned) throw new CalibrationFatalError('calibration:ledger-poisoned');
  deps.fsyncLedgerDir();
  if (poisoned) throw new CalibrationFatalError('calibration:ledger-poisoned');
} catch {
  poisoned = true;
  throw new CalibrationFatalError('calibration:ledger-persist-failed');
}
runtimeState = candidate;
```

Header initialization is its own captured initial-state path, not a fabricated runtime frame. During ordinary replay no persistence occurs; during mutation no core counter/state is committed before the persistence path succeeds. A hook that reenters after a physical append began can leave bytes on disk: fail/retain lock, grant no success, and reconcile on restart, not promise rollback or fictitious zero disk writes. Capture-stage reentry before persistence still requires zero writes. Freeze only the newly owned returned public method object, never callback/argument records. Do not pass hostile foreign values directly to assertion matchers that may inspect them; assert fresh-fatal identity/privacy and trap counters using owned booleans/primitives.

- [ ] **Step 4: Host verifies GREEN and checkpoints.** Run new codec/state/core and existing protocol/authoritative suites, strict typing and all Completion gates. Inspect the **entire existing-core diff**, not only new exported methods. Antigravity actual code/result green; normal host commit `Add opt-in runtime evidence ledger mode`, push/exact remote equality. No default importer changes.

## Task 4: Guarded native persistence, real artifacts and crash cuts

**Files:** Modify only `calibration-file-store.ts`; create native assembly/native tests; extend new disk fixture. **Consumes:** All prior tasks, real native report verifier/bootstrap Git reader. **Produces:** New unused native preparation and guarded storage factories, fault-tested under the same lock and shared core.

- [ ] **Step 1: Worker writes RED disk/native tests.** Implement the task-owned mini-Git fixture described above with portable `execFileSync('git', argv)` and local fixture-only identity config, never shell Git writes in the user's checkout. Use actual pinned asset copies, production bootstrap/planner, real report publication/verification and real fsync/rename default paths. Inject only declared low-level fault hooks. Add independent ordered trace assertions with actual basename/inode/fd witnesses; no replace-all filesystem mock.

```ts
it('blocks after a failed directory fsync and retains the lock', async () => {
  const f = await makeRuntimeEvidenceNativeFixture();
  f.faults.failNextLedgerDirFsync = true;
  expect(() => f.ledger.startRuntimeAttempt(f.key)).toThrow(CalibrationFatalError);
  expect(existsSync(resolve(f.root, 'lock.json'))).toBe(true);
  expect(() => f.ledger.releaseLock(f.owner)).toThrow(CalibrationFatalError);
  expect(() => f.ledger.startRuntimeAttempt(f.key)).toThrow(CalibrationFatalError);
});
it('revalidates a bound receipt after other pairs without appending', async () => {
  const f = await makeRuntimeEvidenceNativeFixture();
  await f.finishPreflight();
  const first = f.ledger.bindRuntimeStageReport('preflight', 'LOW');
  f.ledger.bindRuntimeStageReport('preflight', 'MEDIUM');
  const before = readFileSync(resolve(f.root, 'ledger.json'), 'utf8');
  const again = f.ledger.bindRuntimeStageReport('preflight', 'LOW');
  expect(again).toEqual(first);
  expect(readFileSync(resolve(f.root, 'ledger.json'), 'utf8')).toBe(before);
});
```

Define `faults.failNextLedgerDirFsync` as a task-owned one-shot hook control armed **after** successful initialization. `finishPreflight()` publishes/adopts receipts after both profile outcomes but does not bind them, so the second test exercises the real first bind. Full fixture cleanup uses `afterEach`; the snippet's unresolved interrupted evidence is intentionally never reported as passed calibration.

Test real writable-fd byte loop (short/zero/negative/overlarge/throw), fsync-before-close, failing close after native close and before it, rename before/after publication, parent fsync, post-fsync owner/path/inode replacement, symlinks/nonregular files/private modes and foreign lock metadata. Close faults cannot leak owned descriptors; check both hook witness and native descriptor status, without sweeping `/proc` or shared temps. Assert zero returns that grant permission after ambiguous persistence and permanent poison/retained final lock where possible; if ownership was replaced, do not remove the foreign lock.

Exercise all crash cuts in fresh instances, simulating exact persisted disk prefixes and real current-owner acquisition/liveness probes. Verify recovery history remains immutable, no hidden reset and no reserved redispatch. Native report tests cover byte tampering of JSON/Markdown, duplicate/orphan/mismatched journals, incomplete operations, stale owner receipt replay, wrong source/profile and report binding mismatch. Constructor replay alone remains provisional; a callback/receipt supplied as a native params extra is rejected before effects.

Use the mini-Git fixture to commit a docs-only change (same Functions tree/implementation identity: permit), dirty Functions (reject), change/commit Functions (reject against original identity), and change pinned assets (reject). Use declared `/proc` reader override only for dead/unknown/PID-reused owner simulations; no actual process killing. Verify malformed/no-opt-in default CLI still has no native runtime controller. After fake preflight/development/validation and benchmark data, all 60 benchmark outcomes/12 barcode data traces can exist, but `completeStage('benchmark', ...)` still fails with the exact existing runtime-evidence-required error. This is a synthetic ledger fixture, not a live/fake SDK 146-dispatch proof.

- [ ] **Step 2: Host witnesses RED and freezes native tests.** Run `npx vitest run test/nutrition-eval/calibration-runtime-evidence-native.test.ts --maxWorkers=1 --minWorkers=1`; expected exit1 for missing native/guarded factory behavior. Run `npx vitest run test/nutrition-eval/calibration-file-store.test.ts test/nutrition-eval/calibration-report-publication.test.ts test/nutrition-eval/calibration-report-artifact-verification.test.ts --maxWorkers=1 --minWorkers=1` as unchanged positive controls. Record test/helper hashes and actual RED categories before native source changes.

- [ ] **Step 3: Worker implements source only.** Reuse one private file-store implementation with opt-in ownership guards, keeping `createFileCalibrationLedgerDeps` defaults/overrides/behavior unchanged. New guarded factory validates its closed overrides and owner, uses non-following leaf open plus observed ancestor/lock identity checks from existing report patterns, and guards append/journal publication before effects, before rename and after directory fsync. Never silently accept high-level write/fsync replacement hooks. Writable-fd fsync/close/rename/dir-fsync order is explicit; invalid byte count is a fresh static fatal. Owned temp cleanup must not remove final files, another task's directory or a foreign/replaced lock.

Native assembly captures the exact context synchronously, derives pinned plans/resolvers, selects native source reader/guarded store/artifact verifier and creates only the opt-in shared-core object. Do not acquire a lock, reserve, construct clients or run a stage in preparation itself; caller explicitly calls inherited `acquireLock`. Supply the selected native source reader through the low-level core option, not a separate failure-only wrapper; the shared-core guard enforces source checks, static causeless failures and poison/reentry rules. A native source-check failure after lock acquisition must not call release automatically.

In the guarded native writable-fd loop, `fd`, `buffer`, `offset` and captured `hooks` are owned locals. Do not retain the old mode's permissive overlarge-count clamp in this new mode:

```ts
const remaining = buffer.length - offset;
const count = hooks.fdWriteSync(fd, buffer, offset, remaining);
if (!Number.isSafeInteger(count) || count <= 0 || count > remaining) {
  throw new CalibrationFatalError('calibration:runtime-evidence-write-failed');
}
offset += count;
```

Repeat until complete; writable-fd fsync and close precede the guarded rename, then parent fsync and final owner/path check. Keep this stricter count policy inside the opt-in storage branch so old factory overrides/assertions are unchanged.

- [ ] **Step 4: Host verifies GREEN, whole-plan review and source checkpoint.** Run all new suites and old storage/protocol/report suites, real-source strict typing, build/full lint/nutrition/full serial tests. Use one fresh strongest allowed native read-only whole-plan reviewer under the preserved inline workflow, plus mandatory Antigravity actual full code/result review. Do not substitute native review for explicit MCP agree/MUST_FIX none. Address Important/Critical findings with witnessed new RED→GREEN, record optional findings/rulings, reverify, normal host commit `Add guarded native runtime evidence persistence`, push/exact equality. Review all allowed existing-core/storage diffs and all new source/tests; no protected old tests or default importers change.

## Completion gates and checkpoints

Each meaningful task checkpoint includes its tests/source plus updated checkboxes/status/actual results, a normal host commit and push. Workers never commit. After focused GREEN, run from `functions/`, serially with this task's disk TMPDIR/cache/logs:

```bash
npx tsc -p /home/agent-runner/projects/calorix/.superpowers/sdd/2026-10-14-calibration-durable-runtime-evidence/strict-runtime-evidence-tests.json
npm run build
npm run lint
npx vitest run test/nutrition-eval --maxWorkers=1 --minWorkers=1
npx vitest run --maxWorkers=1 --minWorkers=1
```

Record the literal task-owned config/log paths at execution, never `/tmp`. For the full run collect JSON with `--reporter=json --outputFile=/home/agent-runner/projects/calorix/.superpowers/sdd/2026-10-14-calibration-durable-runtime-evidence/logs/full-functions.json`, retaining the actual process exit separately. Use separate task-numbered filenames for earlier checkpoints so evidence is not overwritten. Run focused new test files for tasks completed so far and old controls named in that task. Expected every applicable command exit0, no new skipped tests. Preserve the single existing opt-in test `public-manifest fetches and verifies all 20 public case images against their SHA-256`; report actual counts, not a prerecorded target.

After Task 4 source checkpoint, run the full serial Functions suite again as postcommit verification with executing-plans task-done and the recorded task BASE. Collect actual exit, counts, skip identity, source/test/config fingerprints and no active owned workers before final tracking push. Only after push/remote equality recoverably clean this plan's exact owned workspace, never the completed predecessor or shared `/tmp`.

No Firebase/emulator `test:verify`, Flutter/APK/device/UI, provider/live gate or calorie-accuracy/production/security approval is claimed from this unused slice. Record these as intentional scope exclusions, not passing gates. No UI run ID or visual artifacts; diff counts, `auditLimited`, `visualClassificationStatus` are N/A. Reviewers inspect source/tests/results, not real food predictions or exhaustive visual diffs.

## Spec coverage / self-review

- Codec/mode/privacy/bounds/digests: Task 1; actual atomic header/old-mode refusal also Tasks 3/4.
- Keyed operations, plan/profile/modality, terminal references, immutable prefix binding: Task 2, enforced in live mutation/replay by Task 3.
- Existing reservation/stage/model/report authority, poison, recovery/seals and benchmark block: Task 3; native verifier/source/owner behavior Task 4.
- Physical fsync/close/rename/lock-path faults and real artifacts/current clean Git tree: Task 4.
- Every recovery-matrix row: pure Task 2, core Task 3, real disk cuts Task 4. Existing orphan rejection remains a stop, not repaired success.
- Unused/default/producer/live boundaries, worker routing, source preservation, reviews, commits/pushes and postcommit evidence: Global Constraints and Completion gates.

## Planning receipts and handoff

Written spec approved by user on 2026-10-14 at `8ec53d378ee93e4ed290c8eef3f7f3780a148cff`. This plan is a new artifact: its existence is not user plan approval. Preserve the inline host-orchestrated/editing-worker execution method already established for the prerequisite, subject to user confirmation that this written plan captures the requested stage. Do not launch workers or create its execution workspace during planning. Exact-text MCP plan review and user plan review must precede implementation.

Plan review: Antigravity MCP, primary `gemini-3.8-flash`, persistent scoped conversation `calorix-durable-runtime-evidence-plan-20261014`, two text-only calls. A bounded new plan-artifact conversation preserves the earlier contract conversation's receipts rather than replaying its full accumulated text. First call received the entire approved spec and actual 434-line plan; `IMPLEMENTATION_PLAN_ONLY`, agree/MUST_FIX none. Three nonblocking reminders were verified: `assertGitState` is declared on `CalibrationLedger`; disk TMPDIR/fallback paths were already explicit; current versus stored-prefix pair queries were already covered. Its phrase “Unforgeable References” was rejected and explicitly retracted in call two: attempt refs are forgeable data tuples, not admission tokens.

Host self-review refined only Task 3 after the first snapshot: immediate poison checks after source reading/capture and each persistence callback, same-owner recovery exclusion, physical-write uncertainty instead of rollback/zero-write claims, and safe hostile-value assertion handling. Second call received that exact updated block and the source declaration; agree/MUST_FIX none/SHOULD_FIX none/QUESTIONS none. The final normative snapshot before these provenance paragraphs was 438 lines/50,473 bytes, SHA-256 `9d8e622a32c0ad88a154e4bbe122e573684a98949f9fc296314592cf0fd236ef`; host comparison confirmed all text outside the reviewed Task 3 block unchanged. No fallback, tool failure or reviewer repository mutation was observed. Reviewer summaries are not independent source/syscall verification or guarantees against arbitrary trusted code.

Planning verification: document structure/reference/fence/placeholder/whitespace checks passed; Functions source/tests remained unchanged against `8ec53d378ee93e4ed290c8eef3f7f3780a148cff`; no new Functions files or execution workspace. No application tests/builds, workers, provider/device/visual runs or production changes occurred. All 16 implementation checkboxes intentionally remain unchecked. Next gate: user reviews this written plan; retain the established inline worker execution method only after that approval.

User plan approval received 2026-10-15 after the linked plan at `deb8bf6e042a71d4fffd868acb9138c4c8a127e6`. Inline execution starts with Task1 BASE `deb8bf6e042a71d4fffd868acb9138c4c8a127e6`; executing-plans ledger/task brief created in this plan's new ignored workspace, verified `/dev/sda2` ext4. Preserve feature checkout/dependencies and use fresh relevant existing baseline plus full per-task/postcommit gates; these rulings and interface pre-flight are recorded in the ledger and will be copied here at checkpoints. No previously completed workspace/task is reopened. Initial focused baseline active; no GREEN/implementation completion claimed.

Execution checkpoint 2026-10-15: fresh existing journal/protocol/authoritative baseline actual0, 306passed/0failed/0skipped across3files, 248.653s. Existing Vite CJS deprecation and npm update notice were recorded; no package changes. Protected115 tracked source/test/eval files and user-config fingerprint unchanged. Startup tracking7607ccebe6da5a057efd1e1430f55d69ec342106 normal pushed/liveequal. Task1 RED-only worker route: grok-4.6 rejected unknown model (04:58:44Z); qwen3.7-max403 free quota exhausted (04:59:30Z); exact messages recorded in status before each fallback. OpenCode1.18.3 shared-config catalog load rejected `plugins` (05:00:38Z); shared config untouched. Task-local isolated catalog actual0 confirms Nemotron Ultra/Muse1.3/Nemotron Lightning/Big Pickle, with Ling absent and excluded. RED-only Nemotron Ultra worker unified45511 active; no source authorized, no completed implementation checkbox yet.

Execution rulings (chronological, costs retained):

1. Preserve the explicitly approved checkout/dependencies rather than create another worktree/reinstall — user preference and dirty config preservation — cost: less filesystem isolation, requiring strict path/fingerprint controls.
2. Use a fresh focused existing baseline, retaining full per-task/postcommit gates — old source is unchanged but historical green is not fresh evidence — cost: unrelated failures can surface later in full verification.
3. Host performs inline orchestration; literal strongest-first CLI workers author app/tests — user AGENTS.md overrides host-edit skill wording — cost: worker setup/context overhead.
4. Isolate worker XDG config/data/state/cache and use documented --pure rather than fix shared invalid config — preserve exact model order and unrelated plugins/MCP settings — cost: no inherited plugins/auth state; provider availability remains a separate gate.
