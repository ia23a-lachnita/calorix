# Calibration Benchmark Completion Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one unused, explicitly selected native benchmark-completion path that requires fresh native reports, complete keyed evidence, unchanged nutrient gates and the pinned historical comparison.

**Architecture:** Extract pure historical processing without changing its compatibility facade. Extend the existing private ledger core with process-local opt-in configuration and compose it through a separately named native preparer; retain the existing root, lock, v1 events and public ledger surface. Constructor checks are provisional prefix checks; current-owner locked replay and every completion, including healthy repeats, must independently reverify authority.

**Tech Stack:** Existing TypeScript, Node filesystem/crypto, Zod, Vitest and ESLint; no dependency or configuration changes.

**Spec:** [Approved historical comparison and benchmark authority design](../specs/2026-10-19-calibration-benchmark-authority-design.md), user-approved published revision `3e83b1d775ec1ea4bda4d15795d60a46a5339858`.

**Execution method:** Preserve the user's established inline orchestration with normal strongest-first editing workers. Main host owns this plan, tracking, verification judgment, review, commits and pushes, not application/test authorship. The producer-only native-edit exception is closed. Written-plan approval is required before executing any step below.

**Execution approval / isolation override (2026-10-19):** User approved this published plan, then explicitly required clean Git workspaces and remote branch hygiene. Execute in a new clean Calorix worktree on `feat/calibration-benchmark-authority`; record its actual path and BASE in status/ledger. This supersedes ONLY old execution CWD and `push origin fix/scan-photo-flow-viewer` literals below: use the new worktree and `push origin feat/calibration-benchmark-authority` for implementation. Preserve the original checkout's user `.mcp.json` untouched/unread/content-undiffed; do not copy it. Fingerprint both the original user file and the clean worktree's committed config separately. Native managed creation failed to resolve this repository's revision, so use the skill's manual Git fallback. Remote audit found only main and the active parent feature (399 unmerged commits,0behind main,no open PRs), with no dead/stale branch to delete; do not discard parent work. Keep this clean-worktree/verified-remote-hygiene preference for subsequent work. No implementation gate or source scope is relaxed.

## Global Constraints

- Repository `/home/agent-runner/projects/calorix`; branch `fix/scan-photo-flow-viewer`. Record execution BASE and current source hashes before Task1. Read `AGENTS.md`, fresh-session status, this plan, its spec and applicable requirements before work.
- Current route remains `gemini-3.8-flash`, project `calorix-xurschnell`, location `us`. Frozen `gemini-2.5-flash` is reference only. No client/SDK construction, provider dispatch, live OFF/network/image fetch, controller/default importer activation, cloud/device action, deploy, merge or PR.
- Reuse the existing extended v1 header, root, lock, journal, events, artifact publication and source/current-owner guards. No persistent opt-in flag, seal, comparison artifact/event, namespace, migration, reset, rollback, automatic retry/unlock/recovery or public admission API.
- Return `CalibrationRuntimeEvidenceLedger`; `completeStage` remains void. Existing public signatures and plain legacy trusted-caller benchmark behavior remain unchanged. Existing authoritative-report/runtime-evidence benchmark blocks remain unchanged; legacy completion is not qualified native authority.
- Raw reference SHA256 `fd712bee2d4229bc8476d1cc25fce1a21172e6013c6abfe8949498cc5ce15acb` must equal captured `identity.historicalReferenceHash`. Canonical `hashHistoricalReference` is a different digest. Dataset/prompt pins remain `2dc17d06752c2981862690953a7b134235bb6a20da4dc9b5fef5528f91f5bb56` and `205b635a252e1f378023f5e1f3c670a6fba0ecfdfc8ce4f08f30efa24c544263`.
- Require six pre-existing native receipt/binding pairs: preflightLOW/MEDIUM, developmentLOW/MEDIUM, validationselected, benchmarkselected. Recompute each binding at its stored `throughSequence`, not the current head. Completion does not publish/admit/backfill a missing receipt/binding.
- Require canonical158 distinct finished outcomes:2/48/48/60;146 image reservations:2/48/48/48;12 benchmark barcodes; token readiness separate. All image keys consumed/reconciled completed or failed, zero pending. Ordinary prior-stage failure journals remain allowed under unchanged selection/stage gates; do not require146 successful predictions.
- Preserve full `evaluateCalibrationStageGate('benchmark', measurements.stage)` AND historical compatibility/all7 finite deltas/absolute subset check. Keep60 parsed/0 failures/0 unsafe,48 image/12 barcode,36 meal/12 label, carb-density eligible33 and the other corresponding meal counts36. No new threshold or all-negative-delta rule.
- Preserve all old source/test/helper assertions, timeouts, dependencies and defaults except the explicitly scoped pure extraction/core/native assembly changes below. No source/store/reducer/codec/report schema repair is preauthorized outside that map; demonstrated conflict requires a reviewed amendment.
- Unknown inputs use bounded own-data-descriptor capture; reject accessors, symbols, inherited/unknown fields, cycles and nonfinite values. Own all outputs without freezing callers. Recheck monotonic poison after each foreign reflection/callback and before effects; never inspect/coerce/serialize a foreign thrown value, including revoked proxies.
- Protect user `.mcp.json`: unread, content-undiffed, unstaged and unedited. Fingerprint only; expected `9c9622f5dfd38f8eed1ac0d1b69034dc5399e77481600030148547235b06a688`. Preserve unrelated work. Earlier metadata-only exposure is not denied.
- Verify task-scoped temp/cache/log storage is disk-backed; use it through `TMPDIR` and relevant cache paths. `/tmp` is tmpfs. No cleanup of shared/sibling/previously closed workspaces. Long gates run in background and are collected with actual exit/result status before claims.
- Every meaningful stage includes tracking, independent host verification, actual scoped external code/result agreement, commit and push. Workers never commit/push. Record exact route errors/timestamps before fallback; use the strongest-first `AGENTS.md` route, not historical quota assumptions.
- Antigravity headless3.8/High is user-authorized for this workstream after recorded MCP failures. Label actual CLI agreement as CLI, not MCP. Every prompt includes: **Do not edit files, do not run write commands, and do not mutate the repository; only inspect, reason, debug, review, and propose changes for the main agent to apply.** Green requires actual successful structured result plus substantive `AGREEMENT_STATUS: agree` and `MUST_FIX: none`; apply must-fixes and continue its scoped conversation.
- One independent native whole-plan reviewer at the final implementation gate, not one per task. Failed/empty/noisy reviews are not verdicts. This plan's review is not implementation evidence or production/security/accuracy/UI approval.

## Review Focus

1. Later owner/recovery events extend history: original six binding cutoffs must still validate; hashing current head instead must not become permission (Task2 Step4; Task3 Step2).
2. A healthy completed instance with a subsequently changed native artifact must reject before the completed-stage no-op; a poisoned repeat must perform no new effects (Task2 Step4; Task3 Steps2–3).
3. A completion placed before its last binding must be rejected during provisional constructor replay even when the final history contains all six bindings (Task2 Step4).
4. A reflection trap/verifier can reenter, swallow a fatal and return plausible data: monotonic poison must stop use of the result and the next effect without inspecting the foreign error (Task1 Step1; Task3 Step1).
5. Losing-profile ordinary failure is compatible with146 consumed keys, while a full-gate failure can hide behind a passing seven-field subset; preserve both distinctions and carb eligible33 (Task2 Steps1/4; Task3 Step1).

## File map and interfaces

Application files allowed across this plan:

| Path under `functions/` | Responsibility |
| --- | --- |
| new `src/nutrition-eval/historical-reference-pure.ts` | Existing schema, parse/hash, comparison and subset implementation moved without semantic changes; no loader imports |
| existing `src/nutrition-eval/historical-reference.ts` | Compatibility reexports plus unchanged filesystem loader/path facade |
| new `src/nutrition-eval/calibration-benchmark-history.ts` | Bounded owned pinned reference preparation and guarded pure report assessment |
| existing `src/nutrition-eval/calibration.ts` | New explicit factory/private mode; shared prefix and fresh benchmark checks at existing transition/replay seam |
| existing `src/nutrition-eval/calibration-runtime-evidence-ledger.ts` | Separately named native preparer; shared private capture/assembly with explicit private mode |
| new `test/nutrition-eval/calibration-benchmark-history.test.ts` | Pure import graph, compatibility and hostile-input tests |
| new `test/nutrition-eval/calibration-benchmark-authority-fixtures.ts` | Owned actual-native fixtures, disarmed syscall witness, explicit replay-copy helpers |
| new `test/nutrition-eval/calibration-benchmark-authority.test.ts` | Explicit native foundations, opt-in completion, compatibility, prefix/replay and artifact controls |
| new `test/nutrition-eval/calibration-benchmark-authority-guards.test.ts` | Trusted-core negative boundaries, full-gate discriminator matrix and reentry/privacy controls |
| new `test/nutrition-eval/calibration-benchmark-authority-native.test.ts` | Explicit native foundation plus real-syscall/recovery qualification |

Tracking paths: this plan, `docs/implementation-status.md`, parent `docs/superpowers/plans/2026-09-23-gemini-38-nutrition-calibration.md`, and approval/review provenance only in the approved spec. No other edits authorized. Existing fixture helpers may be imported read-only; never extend them or manufacture source declarations to type new tests.

Task1 exports (all new runtime dependencies remain pure):

```ts
export interface CalibrationBenchmarkHistoricalAssessment {
  readonly measurements: Readonly<CalibrationReportMeasurements>;
  readonly comparison: Readonly<HistoricalComparisonResult>;
  readonly subset: Readonly<HistoricalAggregateSubsetGate>;
  readonly provenance: Readonly<HistoricalReference['provenance']>;
}
export interface CalibrationBenchmarkHistory {
  assess(report: unknown): Readonly<CalibrationBenchmarkHistoricalAssessment>;
}
// params is EXACTLY {historicalReferenceBytes, historicalReferenceHash}, both strings.
export function prepareCalibrationBenchmarkHistory(
  params: unknown,
): Readonly<CalibrationBenchmarkHistory>;
```

Task2 exports:

```ts
// In calibration.ts. Same first six arguments as the existing runtime factory.
// config is EXACTLY {historicalReferenceBytes: string}; identity supplies its hash.
export function createBenchmarkAuthorityCalibrationLedger(
  deps: CalibrationLedgerDeps,
  identity: CalibrationIdentity,
  keyResolver: CalibrationKeyResolver,
  reportOptions: CalibrationProtocolReportOptions,
  authoritativeOptions: CalibrationAuthoritativeReportOptions,
  runtimeOptions: CalibrationRuntimeEvidenceOptions,
  config: unknown,
): CalibrationRuntimeEvidenceLedger;

// In calibration-runtime-evidence-ledger.ts. params is EXACTLY {context},
// captured by the existing prepared-context contract; low-level overrides only.
export async function prepareNativeCalibrationBenchmarkAuthorityLedger(
  params: unknown,
  overrides?: RuntimeEvidenceFileStoreOverrides,
): Promise<Readonly<CalibrationRuntimeEvidenceLedger>>;
```

No default importer uses either entrypoint. New private configuration cannot be enabled by an event/header/env/report/boolean. No new method is added to an existing ledger object.

## Execution setup and evidence discipline

At execution, use `superpowers:using-git-worktrees` to check existing isolation before creating anything. Preserve the approved branch; do not move unrelated dirty changes. If isolation requires a new branch or would alter the agreed branch/worker path, resolve that explicitly before implementation. Main host creates only execution tracking/worker briefs; normal workers author application/tests with `apply_patch`.

After verifying backing storage, create one uniquely named execution scratch directory under `/home/agent-runner/.local/share`, with task-local temp/cache/log subdirectories and an append-only evidence ledger. Record BASE, exact owned root, frozen source/test/default hashes, user-config fingerprint, command/run IDs, exit codes, JSON receipt hashes, actual case sets and review conversations. Do not commit scratch artifacts. A failing command is recorded as failing, even if its wrapper exits0.

Commands in this plan run from `/home/agent-runner/projects/calorix/functions`. Use serial workers. Pure tests, small core boundaries and syscall-only fixture controls retain default5000ms. NEW tests constructing or natively replaying the complete158-outcome history, verifying all six artifact pairs or exercising faults/recovery on that history are authored initially with per-test600000ms; no global or old timeout/retry/config changes. Constructibility rationale: real existing native helpers already drive98 prior image outcomes and the remaining60 benchmark outcomes through the same public API/publication/verifier; each full foundation adds146 actual image journal/terminal publications and158 finished attempts with many synchronous durable syscalls. Fresh replay repeatedly traverses that complete history and reconstructs six report populations. Historical producer benchmark-dependent NEW tests required reviewed600000ms budgets. This is not a promised duration. Task2's independently exercised foundation must record actual timings before wider matrix authoring; if it exceeds its declared budget, stop to diagnose/review, never silently raise it.

For matrix economy, a first explicit test in each native test file builds released, actual-native, benchmark-ready templates (LOW and MEDIUM, prior losing-profile provider failure), asserts their entire disk/evidence inventory, and records timings. Do not hide158 outcomes in `beforeAll`, a conditional skip or a mocked constructor. Subsequent tests copy only a released template's complete task-owned miniGit base, preserving files/modes/commits, bootstrap a real fresh context and call the actual new preparer/current-owner acquisition. Copying a root is replay evidence, not fresh SDK/outcome dispatch or hostile-clone attestation. Check source identity and every report artifact again. Never copy a live lock, share a mutable template with a fault case or reuse a poisoned instance. If source/path/prefix semantics make a copy invalid, stop for review rather than rewriting it into authority.

Each test file is sequential (`describe.sequential`); foundation failure makes dependent tests fail, not skip. Focused commands selecting dependent tests include their named foundation with the regex below, or run the entire file. No test relies on a previous command/file's artifacts. Templates are owned/cleaned by that file, not committed caches. Only negative tamper tests alter their copied history; never call that synthesized history positive authority.

---

### Task 1: Extract pure historical processing and add owned assessment

**Files:** Create pure module, benchmark-history module and history test from the map; modify historical facade only; update tracking.

**Interfaces:** Consumes existing `measureCalibrationStageReport(value: unknown): Readonly<CalibrationReportMeasurements>` from `calibration-report-measurements.ts`, schema/scorer types and existing historical exports. Produces exactly `prepareCalibrationBenchmarkHistory` and the types above; existing facade retains every old export/signature and loader error behavior.

- [x] **Step 1: Author pure/compatibility and input tests before source.** Worker creates the new history test only. Reuse read-only `makeMeasuredReport({stage:'benchmark',profile:'MEDIUM',scenario:'exact'})` from `calibration-authoritative-fixtures.ts`; read the actual committed raw reference using native test IO. Add this concrete test:

```ts
it('owns seven measured deltas and the frozen reference provenance', async () => {
  const bytes = readFileSync(resolve(process.cwd(), 'eval/nutrition/historical-reference-v1.json'), 'utf8');
  const report = await makeMeasuredReport({ stage: 'benchmark', profile: 'MEDIUM' });
  const assess = prepareCalibrationBenchmarkHistory({
    historicalReferenceBytes: bytes,
    historicalReferenceHash: 'fd712bee2d4229bc8476d1cc25fce1a21172e6013c6abfe8949498cc5ce15acb',
  });
  const result = assess.assess(report);
  expect(Object.keys(result.comparison.deltas!).sort()).toEqual([...SUPPORTED_HISTORICAL_DELTA_FIELDS].sort());
  expect(result.comparison.compatible).toBe(true);
  expect(result.subset.passed).toBe(true);
  expect(result.provenance.rounding).toBe('four_decimal_places');
  expect(result.measurements.stage.mealCarbDensityEligibleCount).toBe(33);
  expect(Object.isFrozen(report)).toBe(false);
  expect(Object.isFrozen(result.comparison.deltas)).toBe(true);
});
```

Add table tests independently changing raw bytes (including whitespace-only change), identity hash, each dataset/prompt/model/samples/public/private field,60-row coverage, reference unknown/accessor/symbol/inherited fields and reference length8193. Test missing/nonfinite summary or prediction numerics, forged summary/comparison, unknown report fields,256-element array boundary, depth32/node20000/string4096 budgets, cycles, shared mutable aliases, getters and revoked proxies. Where measurement intentionally recomputes a supplied summary, assert that forged values cannot control the returned measured metrics/deltas rather than assuming every summary mismatch is rejected. Use real source/test types, no `any` or fake declarations.

An assessor-local reflection test calls the same `assess` from an outer report proxy's `getOwnPropertyDescriptor`, catches the nested fatal and returns a valid descriptor. The outer call must still throw and poison that assessor; a later healthy call also throws. Mutation controls change original report fields after capture and confirm owned returned values do not change. Foreign thrown proxies must have zero property/coercion reads; resulting fatal has only the specified static message and no cause.

Pure graph control walks static runtime imports/exports with the TypeScript AST and a visited set, resolves relative files, skips type-only edges, and rejects dynamic `import`, `require`, filesystem/path, provider/SDK/Firebase/HTTP/network/transport imports throughout BOTH pure entry graphs. Permit only relative pure dependencies plus `crypto`/`node:crypto` and `zod`; traverse local schema/scorer dependencies. Reject a synthetic fs import in an in-memory control to prove the walker. Test all existing exported function identities through the facade, old error codes/messages, default/custom loader behavior, compatibility reason order, all7 delta numeric values and canonical hash before/after extraction. Run the unchanged old historical tests as independent compatibility controls.

- [x] **Step 2: Observe focused RED and preserve baseline controls.** Run `npx vitest run test/nutrition-eval/calibration-benchmark-history.test.ts test/nutrition-eval/historical-reference.test.ts --no-file-parallelism --maxWorkers=1 --minWorkers=1`. Expected new module/export absence causes new test failures; old historical controls pass. Record actual import failures honestly, not a nutrient regression. Then implement only after host inspection of test constructibility; strict compile can run after new exports exist, no source stubs to manufacture RED.

- [x] **Step 3: Implement the pure extraction and guarded owned assessment.** Move the old schema/parse/hash/comparison/subset code unchanged to `historical-reference-pure.ts`; facade imports `parseHistoricalReference`, reexports the pure API and retains only path/read/load code. Do not move the loader or import `calibration-cli.ts` into either pure graph. The helper keeps its own literal raw pin and tests equality with the actual committed file and existing CLI pin; no CLI edit is needed. Its closed params have exactly two enumerable own data string fields, reference maximum8192 UTF-8 bytes and exact hash equality before JSON/schema parsing.

The helper instance uses private `busy` and monotonic `poisoned`, static causeless `calibration:benchmark-history-invalid`; no foreign error classification. Its report capture has depth32/nodes20000/array256/string4096/reportcases60 budgets, plain/null-prototype records, ordinary dense arrays, own enumerable data only, no symbol/accessor/inherited/unknown schema fields. Check poison immediately after each reflection result before using it. Copy mutable aliases into owned data and reject cycles. Then use the existing measurement helper on that owned report, require benchmark metadata/current3.8/exact reference population/identity compatibility and compute ALL supported fields. Incompatible/nonfinite/missing fields throw; a finite comparison whose absolute subset fails returns data with `subset.passed:false`, not permission.

```ts
// Inside the captured instance, after guarded capture and measurement:
const comparison = compareToHistoricalReference(reference, measurements.report,
  SUPPORTED_HISTORICAL_DELTA_FIELDS);
if (!comparison.compatible || comparison.deltas === undefined
  || SUPPORTED_HISTORICAL_DELTA_FIELDS.some((field) => !Number.isFinite(comparison.deltas![field]))) {
  return invalid();
}
const subset = evaluateHistoricalAggregateSubsetGate(reference, measurements.report);
// Deep-freeze only recursively owned outputs; recheck private poison before return.
```

`invalid()` throws a fresh static causeless fatal and poisons the prepared assessor; preparation failure has no usable instance. Preserve original four-decimal/provenance caveats and unsupported-field errors in the old pure API. The new helper's closed boundary wraps foreign failures statically; it does not change the old API's documented exceptions. Test finite positive deltas through pure comparison even where the unchanged subset/full gate necessarily rejects them; do not invent a passing-full positive-delta report when the frozen numbers mathematically preclude it.

- [x] **Step 4: Verify GREEN, review and checkpoint.** Run focused tests above, strict real-source/test typing (shared command, currently existing new files only), build, full lint and serial nutrition suite. Expected all pass, only the old image-fetch opt-in skip. Main host inspects actual tests, numeric/loader compatibility and pure import closure; actual scoped Antigravity CLI code/result review must agree/MUST_FIX none. Update plan/status with actual RED/GREEN/results, hash/push receipts and nextTask2. Stage only the four Task1 application/test paths plus owned tracking. Commit `Separate historical comparison from runtime loading`, push `origin fix/scan-photo-flow-viewer`, verify live origin equality and fresh committed focused tests. No legacy behavior/default activation claim.

### Task 2: Integrate explicit core/native authority and qualify completion

**Files:** Modify `calibration.ts` and `calibration-runtime-evidence-ledger.ts`; create authority fixtures and authority test; tracking. Task1 files may change only for witnessed test-first defects in their exported contract, not unrelated refactoring.

**Interfaces:** Consumes Task1's prepared assessor and actual native bootstrap/storage/publication/verifier; produces the two exact factories above plus new test-only interfaces below. Existing factory signatures remain untouched. Native factory accepts no replacement plans, verifier, reference path or caller permission.

New test-only exports in `calibration-benchmark-authority-fixtures.ts`:

```ts
export interface BenchmarkTemplate {
  readonly baseDir: string; // complete released miniGit base, not just ledger root
  readonly profile: CalibrationProfile;
  readonly eventBytes: Buffer;
  readonly journalBytes: Buffer;
}
export interface BenchmarkNativeCase {
  readonly context: CalibrationPreparedContext;
  readonly ledger: Readonly<CalibrationRuntimeEvidenceLedger>;
  readonly baseDir: string;
  readEvents(): readonly Record<string, unknown>[];
  readJournals(): readonly Record<string, unknown>[];
  readLockBytes(): Buffer;
}
export async function buildBenchmarkTemplate(
  roots: string[], profile: CalibrationProfile,
  scenario: 'prior-failure' | 'benchmark-meal-protein' = 'prior-failure',
): Promise<Readonly<BenchmarkTemplate>>;
export function copyBenchmarkTemplate(
  roots: string[], template: Readonly<BenchmarkTemplate>,
): string; // mkdtemp/cpSync to a fresh registered base, no active lock copied
export async function openBenchmarkBase(
  baseDir: string, overrides?: RuntimeEvidenceFileStoreOverrides,
): Promise<Readonly<BenchmarkNativeCase>>;
export async function openBenchmarkTemplate(
  roots: string[], template: Readonly<BenchmarkTemplate>,
  overrides?: RuntimeEvidenceFileStoreOverrides,
): Promise<Readonly<BenchmarkNativeCase>>;
```

`buildBenchmarkTemplate` uses existing runtime-evidence native preparer only, never the new authority. `openBenchmarkTemplate` copies a released template into a new owned miniGit directory, calls real bootstrap→new native preparer→`acquireLock(context.owner)` and returns actual native handles. No artifact/admission/runtime authority is mocked. Fixtures expose actual bytes for assertions, not trusted permission booleans. Negative tampering that must occur before construction uses native test IO on a copied base followed by real bootstrap/preparation, not the already-open helper.

- [ ] **Step 1: Independently qualify the native fixture before feature RED.** Author only the `buildBenchmarkTemplate` portion of the new fixture and sequential foundation tests; defer `openBenchmarkBase`/`openBenchmarkTemplate` and ALL new-factory imports until Step2. This avoids an absent new export preventing the old-capability foundation from compiling/running; do not add implementation stubs. Reuse old read-only `makeMiniGitRepoTask4(roots)`, actual `createCalibrationBootstrapReadDeps`/`prepareCalibrationBootstrapContext`, actual existing native preparer, `runSharedFoundationPreflight(ledger,context)`, `deriveCanonicalReportOutcomePlan`, `createCoreExactPrediction`, `buildCoreSuccessJournal` and real publisher/verifier. Old helper `finishDevelopment` is hardwired to a MEDIUM tie; do not modify or use it to pretend LOW selection. Build remaining outcomes explicitly:

```ts
// For each canonical planned outcome after the existing native preflight:
const ref = ledger.startRuntimeAttempt(key);
if (evalCase.scanMode === 'barcode') {
  ledger.startRuntimeOperation(ref, 'snapshot');
  ledger.settleRuntimeOperation(ref, 'snapshot', 'returned');
  ledger.recordNonReservationResult({ key, reason: 'barcode', prediction });
} else {
  ledger.startRuntimeOperation(ref, 'image');
  ledger.settleRuntimeOperation(ref, 'image', 'returned');
  ledger.startRuntimeOperation(ref, 'vision');
  ledger.reserve(key);
  ledger.authorizeRuntimeRequest(ref);
  ledger.settleRuntimeOperation(ref, 'vision', 'returned');
  const hash = ledger.appendResultJournal(journal);
  ledger.complete(key, hash);
}
ledger.finishRuntimeAttempt(ref);
```

Resolve cases from actual parsed calibration/public manifests by exact key. `prediction` is exact truth from the existing helper except one ordinary `provider_failure` in the losing development profile; use read-only `failurePrediction(key,evalCase.scanMode,'provider')` and `buildProducerResultJournal(key,prediction,'http_5xx',CORE_PINNED_VERSION)` from producer fixtures for that one full failure journal. The ordinary failure completes through the existing public journal/terminal path; it is not an interrupted-reservation placeholder or a successful nutrient prediction. Pinning/token/preflight comes from the actual preflight helper. All other journals use `buildCoreSuccessJournal`. Assert actual report selection is target profile with reason `higher_parse`, not a forged reason. Publish/admit/bind preflight pairs before completion; development pairs before measured profile selection/complete; validation pair before complete; benchmark pair last, leaving benchmark uncompleted.

```ts
const published = await publishCalibrationStageReport({ stage, profile, context,
  readSnapshot: () => ledger.getStageReportSnapshot(stage, profile) });
ledger.admitStageReportReceipt(stage, profile);
ledger.bindRuntimeStageReport(stage, profile);
const measured = measureCalibrationStageReport(published.report);
```

Record actual predecessor summaries (`[]`, `['preflight']`, `['preflight','development']`). Preflight requires BOTH actual measured reports to have totalOutcomes1/parseCases1/failureCount0/unsafeCompletionCount0, matching the existing private native preflight check; only after those assertions call its existing `completeStage` with `passed:true`. Do NOT use public `evaluateCalibrationStageGate('preflight', ...)`: it deliberately returns `preflight-gate-not-defined` and is not the native preflight decision. Development/validation summaries use the actual unchanged public stage-gate result for the measured selected profile; do not bypass either measured gate. Foundation builds BOTH selected profiles as separate600000ms tests, asserts146 unique image keys/158 finished outcomes/12 distinct barcode keys, zero active/pending, six real receipts/bindings, token readiness separately, all prior stages complete, benchmark absent and losing development failureCount1. For each pair use actual native artifact verification/reconstruction; compute digest with `hashCalibrationRuntimeEvidenceBinding` and actual reducer `pairInput` at the stored cutoff. Then explicitly release owner lock and assert absence before saving the template. Keep complete actual history/journal/artifact bytes; no synthesized passing history.

Run `npx vitest run test/nutrition-eval/calibration-benchmark-authority.test.ts -t 'native foundation' --no-file-parallelism --maxWorkers=1 --minWorkers=1`, strict real-source/test typing and full lint. Expected existing capabilities PASS without new factories. Record actual durations and all counts; obtain actual scoped fixture code/results review before wider matrix. If failure reveals an old prerequisite conflict, stop for amendment; do not edit frozen helpers/store/reducer/report code or mislabel it feature RED.

- [ ] **Step 2: Write and independently observe new completion RED.** Add the new factory imports and both native positive tests, preserving first foundation tests. The template must be freshly opened through the new factory, not a caller-shaped ledger:

```ts
it('completes a verified MEDIUM benchmark once', async () => {
  const f = await openBenchmarkTemplate(roots, mediumTemplate);
  const before = f.readEvents();
  f.ledger.completeStage('benchmark', { stage: 'benchmark', passed: true,
    completedStages: ['preflight', 'development', 'validation'] });
  const after = f.readEvents();
  expect(after.slice(0, before.length)).toEqual(before);
  expect(after.slice(before.length)).toEqual([
    expect.objectContaining({ type: 'stage_completed', stage: 'benchmark', passed: true }),
  ]);
  expect(f.ledger.getCompletedStages()).toEqual(['preflight', 'development', 'validation', 'benchmark']);
}, 600000);
```

LOW has its own real selected-profile template and same assertion. New entrypoint preparation zero-effect control snapshots root/ledger/journal/lock inventory before preparation: no lock acquired/root initialized/client/work/request/publication; read-only existing replay/preparation allowed. Closed-context tests reject extra reference path/verifier/plans/permission field and any attempted opt-in via existing factories.

Run entire new authority file serially. Expected new export absence or existing benchmark denial after actual native setup; separately record which is witnessed. Preserve fixture control pass. Do not implement until host sees a constructible focused RED, not a type shim or high-level authority mock.

- [ ] **Step 3: Implement the shared-core opt-in and native composition.** Add only the new factory/private-init discriminator with required authoritative/runtime options and captured `config`. Existing factories never pass it. Capture exact `historicalReferenceBytes` own-data string under existing construction guards and prepare Task1 assessor using captured identity hash before any mutation/replay authority. Extend the init union privately; no mode field on disk/public ledger. Missing runtime/verifier/reference fails static `calibration:benchmark-authority-input-invalid` before any new write. New native composition shares existing private prepared-context/low-level-hook capture synchronously before its await; routes only the new exported function to the new core factory with owned `context.files['historical-reference']`. Preserve old catch/error behavior; new native boundary uses `calibration:benchmark-authority-native-input-invalid`.

Add one private benchmark prerequisite function at the actual `measuredStageGate` seam, not another parallel ledger or runtime reducer authority. Skeleton (use the existing typed private names, not new public methods):

```ts
if (stage === 'benchmark') {
  if (benchmarkHistory === undefined) {
    throw new CalibrationFatalError('calibration:benchmark-runtime-evidence-required');
  }
  // structural checks run for BOTH provisional and locked replay/live calls
  assertBenchmarkEvidencePrefix();
  if (replayType !== undefined && !authoritativeReplay) return;
  verifyBenchmarkAuthority();
  return;
}
```

`assertBenchmarkEvidencePrefix()` requires selected profile/predecessors/token readiness/no active attempt/strict canonical terminal accounting at THIS replay prefix. Enumerate exact six pairs. Require already-present matching receipts and `runtime_report_bound` events; for each use `evidenceState.pairInput(stage,profile,binding.throughSequence)`, hash with its same admitted receipt and match bindingSha256/receipt; guards immediately after captures. No `evidenceBind` or automatic receipt creation. Canonical plans/reducer completeness plus existing reservation/journal readiness must establish158 finished keys/146 consumed image keys/12 barcode keys, no substitutions/duplicates/pending. Use keyed identity, never final count-only comparisons.

`verifyBenchmarkAuthority()` additionally rechecks source/current owner/private poison and freshly verifies all6 receipts using existing `verifyReceipt`/journal reconciliation/independent reconstruction. Match each returned receipt to the admitted and bound receipt before using measurements; do not trust cached `measuredReports` or a helper's `passed`. Recompute prefix digests again against actual current evidence. Check exact native benchmark report/source/profile/model/schema/pin association through existing `assertMeasuredBinding`; call Task1 assessor on the freshly verified report. Require `comparison.compatible`, exact all7 finite fields, `subset.passed` and unchanged full `evaluateCalibrationStageGate('benchmark', assessment.measurements.stage).passed` conjunctively; no duplicated threshold table. Recheck poison/evidence/owner/source after callbacks/reflection and before existing completion persistence. New guard failures wrap static `calibration:benchmark-authority-failed`; foreign details never escape.

Preserve gate-before-completed-stage ordering in `strictCompleteStage` AND `strictReplayStage`; structural prefix checks happen before replay consumes that completion frame, not after scanning final arrays. No authority until existing locked `refreshUnderLock` succeeds. Existing modes continue rejecting benchmark completion during locked replay and live calls. Update the wrapper's comment/static catch selection only for explicit new mode: old benchmark still reports `calibration:benchmark-runtime-evidence-required`; new benchmark failures report `calibration:benchmark-authority-failed`. Successful checked delegation must not be replaced by an unconditional wrapper deny. Existing permanent poison/current-owner/source and durability paths remain shared.

- [ ] **Step 4: Pin compatibility, prefix and before-idempotence controls.** Add table tests for each of6 receipt removals,6 binding removals, wrong stored throughSequence/digest/receipt, missing finish/terminal/journal/key, duplicate/substituted key, pending or active attempt, wrong predecessor/profile/model pin/source/owner/token. Use fresh copies; negative malformed history is labeled tamper rejection, not positive proof. Assert rejection before a new completion, no new request/report/binding/receipt repair, retained actual bytes/lock and poisoned repeat no effects. Do not require a preexisting completion to vanish.

```ts
it('rejects completion before a later binding during constructor replay', async () => {
  const baseDir = copyBenchmarkTemplate(roots, mediumTemplate);
  const path = resolve(baseDir, CALIBRATION_ROOT, 'ledger.json');
  const events = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>[];
  const bindingIndex = events.findIndex((row) => row.type === 'runtime_report_bound'
    && row.stage === 'benchmark' && row.profile === 'MEDIUM');
  expect(bindingIndex).toBeGreaterThan(0);
  events.splice(bindingIndex, 0, { type: 'stage_completed', stage: 'benchmark',
    passed: true, at: '2026-10-19T00:00:00.000Z' });
  writeFileSync(path, JSON.stringify(events), { mode: 0o600 });
  const before = readFileSync(path);
  const context = await prepareCalibrationBootstrapContext(createCalibrationBootstrapReadDeps(baseDir));
  await expect(prepareNativeCalibrationBenchmarkAuthorityLedger({ context })).rejects.toThrow();
  expect(readFileSync(path)).toEqual(before);
  expect(existsSync(resolve(baseDir, CALIBRATION_ROOT, 'lock.json'))).toBe(false);
}, 600000);
```

Preserve original binding sequence values; the inserted protocol-noop completion cannot fabricate a valid earlier prefix. The native test IO targets only its owned negative copy; assert no constructor writes/lock creation. Declare `const roots: string[] = []` and suite-owned `lowTemplate`/`mediumTemplate` assigned by the two explicit sequential foundation tests; an unassigned template is a failure. Register every mkdtemp result immediately, and clean only registered roots in `afterAll` after all handles/jobs are closed.

Positive current-owner reopen after clean release appends legitimate owner transition if needed; all original binding cutoffs/digests remain exactly unchanged and completion still succeeds. Healthy repeated completion makes no duplicate event but freshly verifies every artifact; change one actual benchmark JSON/Markdown then repeat and assert rejection rather than no-op. A fresh new constructor can provisionally accept structurally complete history, but authority queries before lock and acquisition with a changed artifact reject. Report mutation through native IO must not edit existing hashed files into a new passing receipt.

Qualify old plain protocol completion with existing tests, old authoritative and old runtime native completion denial with unchanged controls; old runtime preparer opening a newly completed extended history cannot gain benchmark authority. Old plain header rules are not weakened. Neither fake core verifier success nor typed caller data counts as the native positive.

- [ ] **Step 5: Verify, externally review and checkpoint.** Run whole new pure/authority files, unchanged old historical/authoritative/runtime-evidence/core/native/producer controls, shared strict/build/full lint and separate serial nutrition suite. Inventory exact native artifacts/counts/keys and six digest cutoffs; collect actual JSON receipts and all failures/skips. Actual scoped Antigravity CLI Task2 code/result review agrees/MUST_FIX none before main stages owned files/tracking, commits `Add opt-in benchmark completion authority`, pushes and checks live origin equality. Run fresh committed focused tests; record nextTask3. Parent Task7 Steps4–7 remain open; this is native gate qualification, not actual SDK/controller arithmetic or live accuracy.

### Task 3: Qualify hostile boundaries, uncertain durability and fresh recovery

**Files:** Create guards and native tests; extend ONLY the new authority fixture for fault witness; test-first repairs only within this plan's source map; tracking. No old helper/store/codec/reducer/schema/default changes.

**Interfaces:** Consumes both factories and all Task1/2 interfaces unchanged. Extend the new fixture with these test-only exports:

```ts
export type BenchmarkCutOperation = 'write' | 'file-fsync' | 'close' | 'rename' | 'directory-fsync';
export interface BenchmarkCompletionWitness {
  readonly overrides: RuntimeEvidenceFileStoreOverrides;
  arm(operation: BenchmarkCutOperation, side: 'before' | 'after'): void;
  disarm(): void;
  readonly trace: readonly string[];
  readonly hitCount: number;
}
export function makeBenchmarkCompletionWitness(root: string): BenchmarkCompletionWitness;
```

The witness is disarmed through context/preparation/acquisition/setup. It identifies actual root ledger sibling temp fd/path/payload containing the NEW benchmark completion, not arbitrary next filesystem call. It delegates to real write/fsync/close/rename/dirfsync, recording actual before/after effects with fd identity. A real native function call is not high-level verifier authority. It throws only a fresh static fixture marker or hostile foreign proxy after/before the selected actual syscall. Cleanup of an fd whose injected close-before skipped real close is fixture-owned and happens only after assertions/disarm; do not change production cleanup semantics.

- [ ] **Step 1: Author guarded-core and full-gate discriminator tests first.** Core injected deps/verifiers are explicitly trusted boundary controls, not native positives. Reuse old core fixture backing data read-only where useful; instantiate the new core against fresh owned event/journal buffers, actual canonical plans and measured report data. Cover reentry from Git reader, verifier, descriptor/proxy result capture, config capture and gate summary, including a swallowed nested fatal followed by plausible data. For each assert zero next forbidden append/fsync/publication, permanent poison, causeless static error and zero foreign thrown-value name/message/code/cause/stack/toJSON/prototype reads; test revoked proxy errors, alias mutation and returned-object mutation. Recheck actual next effect, not only eventual thrown message.

Use this explicit full-gate discriminator field table, not `exactMeasured.failedChecks` (which is empty). Each field gets an independent missing-value and violating-value control against the actual full helper:

```ts
const countFields = ['totalCases', 'runCases', 'totalOutcomes', 'parseCases',
  'unsafeCompletionCount', 'failureCount', 'catastrophicCount', 'mealOutcomeCount',
  'suppliedBarcodeOutcomeCount', 'labelOutcomeCount', 'parsedMealCount',
  'mealMassEligibleCount', 'mealDensityCoverageCount', 'mealCarbDensityEligibleCount',
  'mealFatDensityEligibleCount', 'visionCallCount', 'suppliedBarcodeImageCallCount',
  'suppliedBarcodeVisionCallCount', 'suppliedBarcodeLiveOffCallCount'] as const;
const metricFields = ['medianRelativeCalorieError', 'p90RelativeCalorieError',
  'meanMacroRelativeError', 'meanMealMassRelativeError', 'meanMealCarbDensityRelativeError',
  'meanMealFatDensityRelativeError', 'medianMealProteinRelativeError',
  'medianMealCarbsRelativeError', 'medianMealFatRelativeError'] as const;
it('retains every full-gate discriminator independently', async () => {
  const exact = measureCalibrationStageReport(await makeMeasuredReport({ stage: 'benchmark', profile: 'MEDIUM' }));
  expect(evaluateCalibrationStageGate('benchmark', exact.stage).passed).toBe(true);
  for (const field of [...countFields, ...metricFields]) {
    const missing = { ...exact.stage };
    delete missing[field];
    expect(evaluateCalibrationStageGate('benchmark', missing).failedChecks).toContain(field);
    const violated = { ...exact.stage, [field]: 10000 };
    expect(evaluateCalibrationStageGate('benchmark', violated).failedChecks).toContain(field);
  }
});
```

This unit table proves unchanged full helper behavior, not native report reachability. At the integration boundary use independently measured reports from actual case predictions, never a hand-authored summary. Build a genuine negative benchmark with every meal prediction's proteinG and diagnostic rawNutrients.proteinG multiplied by1.4 before journal/publication, all other exact values unchanged. This raises the median meal protein error above0.35 while the aggregate mean macro error stays below0.45 and the other historical subset fields remain valid. Assert that actual measured precondition, rather than assuming it. `scenario:'benchmark-meal-protein'` retains the prior losing-profile provider failure and applies this perturbation to all benchmark meal outcomes; it never edits hashed artifacts. The Task3 native foundation confirms full failedChecks includes `medianMealProteinRelativeError` while historical subset passes, then actual new completion rejects caller `passed:true`. Benchmark has NO latency threshold in its existing full gate; do not add one or use slow latency as a false discriminator. Other impossible count combinations remain unit/schema/tamper controls, not fabricated native positives.

Keep exact measured counts33 carb-density eligible/36 other corresponding meal/36 meal/12 label/12 barcodes/48 benchmarkimages. Prior losing-profile provider failure remains positive in BOTH profile templates. Pure finite nonnegative deltas remain data, never an all-negative admission requirement.

Run new guards serially before source repair. Expected already-correct guards may PASS from first run; record them as qualification, not manufactured RED. For every witnessed defect save focused failing assertion, change only allowed source, rerun same GREEN and old controls. If a full-gate discriminator requires an out-of-map behavior change, stop for spec/plan amendment.

- [ ] **Step 2: Exercise real native syscall witness and completion cuts.** In the new native test file, explicit sequential foundation tests build/release the LOW/MEDIUM prior-failure templates and benchmark-meal-protein negative template using Task2 fixture. Full-history construction/replay/matrix cases use initially declared per-test600000ms as justified above; syscall-only isolated controls keep5000ms. First run a disarmed completion and verify exact one-event extension, all actual file/journal/report bytes/prefixes, retained current lock and trace reaching all5 real syscalls. Independently arm each operation before/after on a native standalone test-owned ledger publication control to prove the delegate boundary and actual effect; this is fixture qualification, not feature RED.

Then for each5×2 completion cut use a fresh released-template copy and actual new native ledger. Arm only after setup; snapshot exact prefix/artifacts/lock bytes, call completeStage, capture public rejection and actual disk state. Required shape:

```ts
for (const operation of ['write', 'file-fsync', 'close', 'rename', 'directory-fsync'] as const) {
  for (const side of ['before', 'after'] as const) {
    it(`retains actual completion prefix at ${operation}/${side}`, async () => {
      const baseDir = copyBenchmarkTemplate(roots, mediumTemplate);
      const witness = makeBenchmarkCompletionWitness(resolve(baseDir, CALIBRATION_ROOT));
      const f = await openBenchmarkBase(baseDir, witness.overrides);
      const prefix = f.readEvents();
      const lock = f.readLockBytes();
      const journals = f.readJournals();
      witness.arm(operation, side);
      expect(() => f.ledger.completeStage('benchmark', { stage: 'benchmark', passed: true,
        completedStages: ['preflight', 'development', 'validation'] })).toThrow();
      expect(witness.hitCount).toBe(1);
      const retained = f.readEvents();
      expect(retained.slice(0, prefix.length)).toEqual(prefix);
      expect(retained.length - prefix.length).toBeGreaterThanOrEqual(0);
      expect(retained.length - prefix.length).toBeLessThanOrEqual(1);
      if (retained.length > prefix.length) expect(retained.at(-1)).toMatchObject({
        type: 'stage_completed', stage: 'benchmark', passed: true });
      expect(f.readLockBytes()).toEqual(lock);
      expect(f.readJournals()).toEqual(journals);
      const traceLength = witness.trace.length;
      expect(() => f.ledger.completeStage('benchmark', { stage: 'benchmark', passed: true,
        completedStages: ['preflight', 'development', 'validation'] })).toThrow();
      expect(f.readEvents()).toEqual(retained);
      expect(witness.trace).toHaveLength(traceLength);
      witness.disarm();
    }, 600000);
  }
}
```

Extend these assertions with trace order/static causeless public fatal and actual temp/final artifact bytes: witness trace records `${operation}:before`, real syscall, `${operation}:after`, then `${operation}:fault-${side}` at the selected cut (before-cuts record the fault before the syscall). Expected final ledger is exactly old prefix for write/fsync/close/rename-before, and exactly prefix plus completion for rename-after/directory-fsync cuts. No later publication syscall occurs after the cut; existing best-effort fd-close/temp cleanup is allowed and recorded separately, not mislabeled a forbidden publication. Assert no journal/report/receipt/binding rewrites or new work. Record actual bytes, never assert all rejected calls leave completion absent or call publication universally atomic. Idempotent calls on the SAME poisoned object cannot recover.

For fresh replay/recovery, use a genuinely new instance and explicit allowed owner acquisition only. Clean released handoff and native `procStatReader` dead/pid-reused simulation are separate controls; unknown/malformed/live liveness retains lock and rejects. Explicit dead-owner recovery preserves original prefix, appends existing recovery facts and revalidates all6 original cutoffs before authority; do not pretend old lock bytes remain identical after owner replacement. A retained complete event can be accepted exactly once after fresh verified locked replay, while an old prefix requires an explicit healthy completion. Missing/malformed artifacts, source changes, wrong owner and late/missing/broken binding prevent authority. No automatic cleanup/retry/unlock/history repair. These software fault/dead-owner simulations are not actual process-death, physical power-cut or universal filesystem-race proof.

- [ ] **Step 3: Run complete precommit qualification and both final reviews.** Run ALL shared commands below with literal separate focused, nutrition and DEFAULT full invocations. Preserve complete real-source/test strictness and old case population; only old image-fetch opt-in skip. Inspect every final receipt and every native artifact asserted by these tests, plus exact source/default hashes and protected config fingerprint. Confirm neither new factory is imported by CLI/controller/producer defaults. Record exhaustive result-receipt inspection, not exhaustive visual inspection or SDK dispatch proof.

Actual external whole-feature code/result review must inspect all current files, approved spec/plan, actual receipts and every known failure/correction, then agree/MUST_FIX none. Dispatch ONE independent native read-only whole-plan reviewer using available strongest appropriate model per applicable skill/tool availability, with complete current source/range/receipts and explicit no edits/commits/pushes. Require findings by severity and a scoped completion verdict; a failed attempt is not a completed review. Apply Important/Critical issues tests-first and rerun affected/full gates; explicitly rule on nonblocking findings and their costs. No per-task native reviewer. No fabricated approval or blanket security/production language.

- [ ] **Step 4: Checkpoint, verify committed source and close tracking.** Main host updates tracking with actual counts/routes/results/reviews; stages only owned paths, commits `Qualify benchmark completion replay and durability`, pushes and verifies live origin equality. Run a fresh unchanged-source POSTCOMMIT DEFAULT full serial suite, collect actual exit/JSON and compare full case sets before task completion. If any gate fails, preserve commit/results, fix tests-first or report exact blocker; do not mark complete or reuse precommit as postcommit evidence. Tracking-only closure commit/push records source commit, actual postcommit receipt and next parent work; no new source after the reviewed source hash. Only once no owned jobs remain, move exact owned scratch root to recoverable Trash and verify original absence; do not touch siblings/tmp/user config. Report cleanup recoverability.

## Exact shared verification commands

Run from `functions/` with verified task-owned disk `TMPDIR`/cache/log paths. Long commands background; real completion/JSON is required. Add Vitest JSON reporter/output options with explicit new owned paths without changing case selection. Omit only new not-yet-created files from earlier-task strict/focused commands; final commands include every file below and real transitive imports.

```bash
npx tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --esModuleInterop --skipLibCheck --target ES2022 --lib ES2022 --module ESNext --moduleResolution Bundler --types node,vitest/globals src/nutrition-eval/historical-reference-pure.ts src/nutrition-eval/historical-reference.ts src/nutrition-eval/calibration-benchmark-history.ts src/nutrition-eval/calibration.ts src/nutrition-eval/calibration-runtime-evidence-ledger.ts test/nutrition-eval/calibration-benchmark-history.test.ts test/nutrition-eval/calibration-benchmark-authority-fixtures.ts test/nutrition-eval/calibration-benchmark-authority.test.ts test/nutrition-eval/calibration-benchmark-authority-guards.test.ts test/nutrition-eval/calibration-benchmark-authority-native.test.ts
npm run build
npm run lint
npx vitest run test/nutrition-eval/calibration-benchmark-history.test.ts test/nutrition-eval/calibration-benchmark-authority.test.ts test/nutrition-eval/calibration-benchmark-authority-guards.test.ts test/nutrition-eval/calibration-benchmark-authority-native.test.ts --no-file-parallelism --maxWorkers=1 --minWorkers=1
npx vitest run test/nutrition-eval --no-file-parallelism --maxWorkers=1 --minWorkers=1
npm test -- --no-file-parallelism --maxWorkers=1 --minWorkers=1
```

Final commands are in addition to unchanged old controls selected by exact existing filenames discovered with `rg --files test/nutrition-eval`; do not assume nonexistent short names. The separate nutrition/full runs execute all old controls even if a focused selector missed one. Historical default baseline is57 files/4027 passed/one existing skip at source `8fe982f3766d178dbe2435e47d30944babc447e6`, not a promised new count. Compare actual case names and statuses, not rounded counts. No new skips/todos/only/conditional bypass, exclusions, retries or old/global timeout changes. Existing sole skip is `public-manifest fetches and verifies all 20 public case images against their SHA-256` with `RUN_NUTRITION_EVAL_FETCH` unset.

Before each commit run `git diff --check` on explicit owned paths, source/default/config-preservation checks and protected user-config fingerprint only. Stage exact paths; never `git add .` or broad config content diff. Record local commit/push failure exactly and retain local commits. This hermetic TypeScript slice intentionally does not run Flutter/APK/device/UI/live provider/OFF/emulator/deploy/release gates; mark not run, not passed. Parent Task7 Steps4–7 remain OPEN: full146 actual SDK/controller scheduling and live nutrient accuracy are still later independent gates.

## Reporting and review provenance

Final implementation handoff must include actual command/run IDs, source/branch/push status, selected reviewer model/route/fallbacks and exact blockers, tests/counts by status, native artifact/accounting coverage and next task. UI run IDs, diff status/source counts, `auditLimited` and `visualClassificationStatus` are N/A for these hermetic ledger tests; no screenshot was visually inspected. Qualify exactly whether receipts/artifacts were exhaustively inspected, sampled or externally delegated. No user predictions/images/raw responses/credentials in logs or committed docs. Pure comparison/native replay is not live caloric accuracy, full controller/SDK arithmetic, production promotion or security approval.

Inline self-review and actual external written-plan receipts are appended here after they occur. All implementation checkboxes intentionally remain open; this document currently contains no new test execution or implementation approval.

### Actual written-plan review and inline self-review — 2026-10-19

User's latest “approved” accepted the published written spec and authorized this separate plan only. Inline self-review mapped pure ownership/export/import/numeric compatibility to Task1; explicit native/core selection, six prefix bindings, keyed populations, before-idempotence and legacy compatibility to Task2; hostile callback/foreign-error/full-gate/fault/recovery/final verification to Task3. All five Review Focus classes have owning tests. Source checking corrected draft-only mistakes before review: benchmark has no latency threshold, so the genuine subset/full discriminator uses meal protein1.4; empty passing-gate failedChecks cannot generate the discriminator table; native foundation defers absent new-factory imports until feature RED. Native public manifest inspection found20 cases/12 meals/all12 positive protein/4 labels/4 barcodes; that read-only planning fact is not execution of the proposed discriminator.

Actual user-permitted headless `gemini-3.8-flash`/separate High/plan CLI81333 completed0/structuredSUCCESS, fresh scoped native conversation `7d715319-e8d4-4f77-9773-243954a1440f`, collected2026-10-19T15:27:46Z. It explicitly inspected the complete444-newline/56082-byte/SHA256 `cd7984bebd3c499e05dbe5d05e0823173e6b17ab747022392bfb5e4804322b7e` plan, reported complete spec coverage and constructibility/new-test-budget agreement, AGREEMENT_STATUS agree/MUST_FIX none/SHOULD_FIX none/QUESTIONS none/WRITTEN_BENCHMARK_AUTHORITY_IMPLEMENTATION_PLAN_ONLY/IMPLEMENTATION_APPROVAL not_granted. No route failure/fallback or reviewer repository mutation was observed.

Host final source review then clarified ONE existing preflight distinction: public `evaluateCalibrationStageGate('preflight', ...)` deliberately rejects as undefined, while private native measured preflight checks each profile's1/1/0/0 outcome facts. Task2 Step1 now explicitly uses those native preflight facts, not the public helper for preflight; development/validation still require their unchanged public gates. Same-conversation CLI5389 completed0/structuredSUCCESS, collected2026-10-19T15:29:08Z, explicitly retained complete current-plan agreement for444-newline/56593-byte/SHA256 `27edc6e786d31217fe836daabfb977f3f1531d703e23d80ac9f77a1111a0820b`, PREFLIGHT_CLARIFICATION agree/complete coverage/constructibility+budgets agree/MUST_FIX none/SHOULD_FIX none/QUESTIONS none/same plan-only scope/no implementation approval.

The correction also explicitly narrows the review's earlier present-tense descriptions to proposed obligations: new factories/modules/tests do not exist;600000ms budgets, protein discriminator metrics and native preparer behavior are not executed proofs. Protected config retains its preexisting user edit, not a claim of a clean config. This is actual CLI agreement, not MCP agreement, implementation/test approval or a security/production verdict. No application tests/builds/dependency installs/execution workspace/client/SDK/calibration/live/cloud/device/UI work ran during plan writing. All3tasks/13steps remain OPEN. Documentation structure/local-link/whitespace/placeholder checks and unchanged application/config protection checks ran; final publication receipts belong in status. These provenance paragraphs append after the exact reviewed normative snapshot without changing task requirements. Next gate: user review of the committed/pushed plan; preserve established inline execution/normal editing workers after approval.

## Task 1 diagnostic checkpoint — unaccepted draft, not implementation

The user subsequently approved this plan and explicitly required clean Git workspaces/remote hygiene. Execution uses the isolated worktree on `feat/calibration-benchmark-authority`, official Task1BASE `fe792e553f5bbe622a0bbbe61dbac69cdab01987`; setup/route diagnostics `153d60c`/`350af28` were committed/pushed, live origin verified. Parent checkout/user config and unmerged parent work remain preserved. Global clean-worktree/remote-hygiene rules were also saved; no stale/dead remote branch was identified or deleted. All13 implementation steps remain OPEN.

Existing-source focused baselines90106 and isolated33458 each completed0/98passed/0fail/skip/todo (historical41 + measurement57), every result inspected. Canonical editing routes then reported exact unknown-model/free-quota/upstream504 failures; absent Muse1.3/Ling3 were not attempted. Big Pickle's921-second no-deliverable attempt ended with a revalidated task-owned SIGTERM/143 under a recorded host runtime cap, not a claimed provider/quota failure. Exact dated messages and rulings are in status/owned ledger.

Paid authoring77552 used exact `claude-sonnet-5`, native session `5d472fbf-bd1e-479d-80ae-5a3ad4fa7a87`, completed0/is_errorfalse. Its native apply_patch trace created only the new history test in the final worktree. The first patch briefly landed under a duplicate functions/functions path because shell CWD had drifted; the worker deleted/recreated it through the same backend and removed an unused import. Read-only Bash diagnostics exceeded the stricter internal brief and were recorded, not claimed perfect compliance or a native-edit exception. Old source/tests/helpers/defaults and both protected config fingerprints remained unchanged.

The final UNACCEPTED new test is SHA256 `72878e5ba343d2febe6b433531bb4684523fec354a082a541a6f41643f973716`, **873 newline characters / 874 split segments including trailing empty / 41085 raw UTF-8 bytes**. Earlier874/41126 counts described the version before removal of a41-byte unused-import line. The host initially paired those stale counts with the final hash and explicitly corrected that own bookkeeping error. No line-ending/metadata ambiguity or source mutation is inferred.

Actual focused RED94319 completed1: two physical files, unchanged old historical41passed and new file0assertions/uncollected because `historical-reference-pure` does not exist. It is module-absence RED, not proof every new case individually failed. Scoped new-test ESLint84393 completed0. No new pure source, full build, real-source-plus-new-test strict, nutrition/default full or feature GREEN exists yet. A CI verification run on this intentionally incomplete WIP checkpoint is expected RED until repairs/source exist; do not merge/promote/deploy or call Task1 complete.

**Blocking test errata; repair before any source implementation:**

1. The padded8192-byte reference with a matching recalculated caller hash MUST reject against the immutable raw pin; its draft positive expectation is wrong. Only the genuine1251-byte committed reference matches the pin. Never weaken production to satisfy that test.
2. Nested reentry must use a valid raw report, not invalid `{}`; otherwise ordinary invalid-input poison can falsely qualify a missing busy guard.
3. The foreign-error test must separate the known thrown proxy by boolean identity before inspecting its replacement; count every reflection/coercion trap, including `then`/`Symbol.toPrimitive`, and separately cover a thrown revoked-proxy value.
4. Runtime default imports combined with inline type specifiers must not be skipped by the AST walker; pure-type/mixed reexports also need correct controls.
5. Complete planned array256/257, string4096/4097, node20000 and depth32 coverage with real constructible schema controls; do not fabricate an admissible padded-reference boundary. Add missing visibility/current-metadata/nonfinite-prediction/ownership controls.
6. A finite forged summary must reject: existing measurement recomputes the expected summary, then `matchMeasuredShape` compares values, rather than silently repairing mismatches.
7. Correct the header's blanket claim that every new case was RED; no new case collected in the actual run.
8. Actually exercise an injected custom loader or accurately name the default-only test and rely on explicit unchanged legacy controls.

Same-session targeted repair19139 completed1/is_errortrue despite subtype success: exact `You've hit your session limit · resets 7:10pm (Europe/Zurich)`, one Read/no edits. Literal `claude -p /usage --output-format text`85179 completed0: session100% resetsOct19 19:10Zurich; week(allmodels)82% resetsOct20 03:00Zurich. Extra-usage spend-cap status was not reported; no whole-account/subscription exhaustion or billing change is inferred. An async user choice between normal-worker reset and Task1-only native edits was requested; no native exception is assumed. Until explicitly granted otherwise, use only normal workers. The prepared source brief is unexecuted and still blocked on corrected tests/observed RED.

Read-only user-permitted primary `gemini-3.8-flash`/separate High/plan CLI92354 completed0/structuredSUCCESS in scoped conversation `89686e16-ade4-43cc-b2bc-929b048aa292`, inspected the exact snapshot/actual receipts/source and independently retained all implementation errata. It agrees/MUST_FIX none ONLY to preserving this unaccepted draft plus explicit findings as a diagnostic WIP checkpoint; IMPLEMENTATION_STATUS blocked_test_draft_unaccepted / IMPLEMENTATION_APPROVAL not_granted / DIAGNOSTIC_CHECKPOINT_ONLY. No model fallback or reviewer mutation was observed.

Continuation66127 completed0/SUCCESS but echoed the host's erroneous stale-count correction; its false41126/874 count confirmation is NOT trusted as verification. Final bounded clarification46577 completed0/SUCCESS, same conversation, independently reports read-only Node Buffer plus `wc -lc` verification of873/41085 and exactSHA728, explicitly retracts the stale-count claim, and retains agree/MUST_FIX none ONLY for diagnostic preservation with all8 implementation must-fixes still blocking. The host accepts no present-tense implementation/security assurance from these receipts. This is CLI, not MCP agreement, and not source/feature/production approval.

Next: resume targeted tests-only corrections after permitted quota reset or explicit user Task1-only exception; rerun focused RED/scoped lint, then implement the already approved Task1 source and run its full gates/reviews/checkpoint. Parent Task7 Steps4–7 remain OPEN. No UI run exists: UI run IDs/diff status/source counts/`auditLimited`/`visualClassificationStatus` are N/A, no screenshots inspected. Hermetic source/result inspection is not live calorie accuracy, actual146SDK-dispatch/controller qualification, security or production readiness.

### Task1 tests-first repair receipt — 2026-10-19T19:04:49Z

Diagnostic checkpoint ccf9e703c6ce6f5783d3d431487d8dba721252f2 was pushed and matched live origin. Literal usage50568 exited0 after reset (session12%, week83%, extra-usage cap not reported). Same-session normal paid repair70089 exited0/is_errorfalse; twelve native patch calls modified only the new history test. Host inspected all eight correction groups, actual schema/reporter/measurement and import-walker behavior. Corrected test SHA256 c311477d492a5aea4e8803eec47991477670dace1117eda62f27df47f6e5f148. Scoped lint89809 exited0. Serial focused RED84205 exited1: legacy41pass, new0assertions/uncollected solely because historical-reference-pure does not exist. This is observed module-absence RED, not individually executed new failures or GREEN. Step1/2 checkboxes record this exact evidence, not Task1 completion or feature approval. Depth32 and raw-reference8192 controls remain rejection-only; schema may reject population/missing-metric tampering before historical comparison. No old source/helpers/default/config change or native-edit exception. Next implement only the approved three Task1 source paths and run the full Task1 gates and actual scoped code/result review. Earlier diagnostic errata describe the preserved original draft, not acceptance of its wrong expectations.

### Task1 source and preparation-repair receipt — 2026-10-19T19:28:39Z

Normal source worker39870 exited0; native trace has exactly three patches/three authorized source files. First-source focused69916 exited0 (94new+41legacy=135pass) and strict11287 exited0. Host nevertheless found unguarded preparation reflection. Actual primary3.8 MCP2132 in scoped conversation `calorix-benchmark-history-task1-20261019` independently confirmed that gap and required regression tests then minimum static catch; direction agreement was NOT green implementation approval. This is MCP, not CLI; no fallback, effort tool-managed/not reported. Host does not infer the old wrapper cause was repaired merely from current tool success.

Tests-only author2435 exited0/one native patch to the new test. RED15227 exited1 with exactly5new preparation failures and94prior tests passing: three foreign reflection throws, revoked root and thrown revoked value. The failures were genuine leaked identity/native TypeError, not import errors. Source remained SHA8bb9f6db until this observed RED. Repair5913 exited0/one native patch only history module: parameter capture/reference resolution now inside parameterless catch invoking fresh static fatal; no other behavior/style change. GREEN93459 exited0 (99new+41legacy=140pass/0fail/skip/todo), strict87152/build3840/full lint95326 each exited0.

Final reviewed hashes: history `a4863702240867ade1432ec6fd560718745b828b6636f0f4229f9fdf02ee2461`, pure `b5730cdde291a4d7e74129495483e27c2528c26e7ac53a104a230f8d7c38240b`, facade `b0110efa346956d8f80e3373e11bf172e884b8e10ce2a6e0dbd0e98a5daddc1b`, test `69b1005b4d2ccb69b1ce0c5d391e47e515e1e0bb0e173c61b4f02f4cafb1cad9`. Same-conversation MCP2146 nonempty/isErrorfalse explicitly inspected all4files/old baseline/actual RED+GREEN receipts and reports COMPLETE_FILE_INSPECTION yes / AGREEMENT agree / MUST_FIX none / CODE_ONLY_PENDING_FULL_GATES. No reviewer mutation or route fallback observed. Optional Object-vs-Reflect consistency suggestion was withdrawn as behaviorally equivalent. Review descriptions are scoped code evidence, not universal security assurances.

Step3 records the implemented/reviewed source; Task1 and Step4 remain OPEN. Serial nutrition91998 is active; DEFAULT full remains separately required. Source/config/default preservation and all actual suite results must be checked before final result review/commit/push/fresh committed focus. Parent Task7 Steps4–7 remain OPEN; no native benchmark authority factory, actual SDK/controller scheduling, live nutrition accuracy, UI/production/security approval follows from this Task1 slice.

Qualification update2026-10-19T20:06:43Z: nutrition91998 exited0/2275.32s,45physical files passed,3731tests passed/1existing opt-in public-image-fetch skip/0fail/todo. Full case/status inspection was programmatic, no hidden abnormal file; raw receipt SHA67576652ca7fad2a486029b0df6dfe9f3aa36328f0752e1a36c541ffed55f958 and sorted case/status SHA1678e631dc18267ad3bb0ce6e959d5312879f6cc204dfa8e13cdc67e38c16eef. Source4/config2 fingerprints unchanged after the run. Separate DEFAULT full34415 active; its result, exact nutrition-subset comparison, same MCP result agreement, commit/push and fresh committed focus still pending. Task1 Step4 stays OPEN; no Task2 implementation or production/security/live claim.

Qualification update2026-10-19T20:44:38Z: DEFAULT full34415 exited0/2254.47s,58physical files passed/4126tests passed/1sameexistingfetchskip/0fail/todo. Raw receipt SHA586efbf6611bfee824d8e874af84ac71abfd148c6b181493c73a7c52c1d7903b; full sorted case/status SHA829fc9edc46cdf46731bc9e6ebc7d9f153d232d06def37c484c4f41a17296fb7. Every assertion status/totals checked programmatically and exact3732nutrition multiset matches91998, no abnormal file. Old population after removing99newtests is57files/4027pass/1oldskip. All4reviewed source/test hashes and both protected configs unchanged; original Functions manifest changed only at approved facade. Final same-MCP result review2242 pending, then exact6path source/tracking commit/push and fresh committed focus; Step4 remains OPEN until those occur. No readiness, live accuracy, whole-plan or security claim.

Actual result review2242 subsequently completed nonempty/isErrorfalse, same scoped primary3.8 MCP conversation, AGREEMENT agree/MUST_FIX none/SHOULD_FIX none/TASK1_SOURCE_RESULT_CHECKPOINT_ONLY. It performed exhaustive programmatic receipt-status checks and exact nutrition comparison; actual command exits are host-observed evidence. Source hashes are unchanged since reviewed code snapshot2146 (not since the earlier pre-repair debug snapshot). Legacy count/definition preservation is not a literal comparison with a reopened historical raw receipt, nor live nutrient accuracy. No mutation/fallback/CLI substitution observed. Commit/push and fresh committed focus remain the final Task1 operational gates; no Task2/3/parent completion or security/production/accuracy/whole-plan approval.

Task1 closure2026-10-19T20:48:57Z: exact six scoped code/tracking files committed as `06a9f0ec5dc9e3dc68ac93526f3d00cc43f1a25c` and pushed to origin feat/calibration-benchmark-authority; live equality and clean status verified. Postcommit task-done70893 exited0 with140pass/0fail/skip/todo and focused case/status SHA58fd6b822b6eec3307c99ba83a394255c6508fe6bba8c0b91cfdd19ed0938da4, identical to precommit. Canonical ledger now records Task1 complete fe792e5..06a9f0e. Actual review used available Antigravity MCP, not the permitted CLI fallback; no route/effort-label substitution. Step4 is checked only after these gates. This tracking-only closure changes no source. Next Task2 Step1 old-capability native foundation after clean-workspace/fresh brief/normal worker route; Tasks2/3 and parent Task7 Steps4–7 remain open, no native authority/default/controller/SDK/live/production/security approval.
