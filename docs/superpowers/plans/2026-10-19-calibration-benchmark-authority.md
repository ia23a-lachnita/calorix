# Calibration Benchmark Completion Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one unused, explicitly selected native benchmark-completion path that requires fresh native reports, complete keyed evidence, unchanged nutrient gates and the pinned historical comparison.

**Architecture:** Extract pure historical processing without changing its compatibility facade. Extend the existing private ledger core with process-local opt-in configuration and compose it through a separately named native preparer; retain the existing root, lock, v1 events and public ledger surface. Constructor checks are provisional prefix checks; current-owner locked replay and every completion, including healthy repeats, must independently reverify authority.

**Tech Stack:** Existing TypeScript, Node filesystem/crypto, Zod, Vitest and ESLint; no dependency or configuration changes.

**Spec:** [Approved historical comparison and benchmark authority design](../specs/2026-10-19-calibration-benchmark-authority-design.md), user-approved published revision `3e83b1d775ec1ea4bda4d15795d60a46a5339858`.

**Execution method:** Preserve the user's established inline orchestration with normal strongest-first editing workers. Main host owns this plan, tracking, verification judgment, review, commits and pushes, not application/test authorship. The producer-only native-edit exception is closed. Written-plan approval is required before executing any step below.

**Execution approval / isolation override (2026-10-19):** User approved this published plan, then explicitly required clean Git workspaces and remote branch hygiene. Execute in a new clean Calorix worktree on `feat/calibration-benchmark-authority`; record its actual path and BASE in status/ledger. This supersedes ONLY old execution CWD and `push origin fix/scan-photo-flow-viewer` literals below: use the new worktree and `push origin feat/calibration-benchmark-authority` for implementation. Preserve the original checkout's user `.mcp.json` untouched/unread/content-undiffed; do not copy it. Fingerprint both the original user file and the clean worktree's committed config separately. Native managed creation failed to resolve this repository's revision, so use the skill's manual Git fallback. Remote audit found only main and the active parent feature (399 unmerged commits,0behind main,no open PRs), with no dead/stale branch to delete; do not discard parent work. Keep this clean-worktree/verified-remote-hygiene preference for subsequent work. No implementation gate or source scope is relaxed.

## Global Constraints

**Native-edit exception (2026-10-20):** After recorded worker failures/refusals, the user explicitly answered "yes continue" to host-native `apply_patch` for Task2Step3 ONLY `calibration.ts` and `calibration-runtime-evidence-ledger.ts`. Tests remain frozen and all review/verification/commit/push gates remain. This overrides worker-only authorship for those two source files and that step only; it does not permit store/helper/test changes or later-task native edits. The first native integration run67187 returned11pass/4fail (15total); a demonstrated store preparation-directory side effect is outside this file map and must be reviewed as a prerequisite conflict before any expansion. Step3 remains open; no weakened zero-effect assertion or source checkpoint approval is inferred.

- Repository `/home/agent-runner/projects/calorix`; branch `fix/scan-photo-flow-viewer`. Record execution BASE and current source hashes before Task1. Read `AGENTS.md`, fresh-session status, this plan, its spec and applicable requirements before work.
- Current route remains `gemini-3.8-flash`, project `calorix-xurschnell`, location `us`. Frozen `gemini-2.5-flash` is reference only. No client/SDK construction, provider dispatch, live OFF/network/image fetch, controller/default importer activation, cloud/device action, deploy, merge or PR.
- Reuse the existing extended v1 header, root, lock, journal, events, artifact publication and source/current-owner guards. No persistent opt-in flag, seal, comparison artifact/event, namespace, migration, reset, rollback, automatic retry/unlock/recovery or public admission API.
- Return `CalibrationRuntimeEvidenceLedger`; `completeStage` remains void. Existing public signatures and plain legacy trusted-caller benchmark behavior remain unchanged. Existing authoritative-report/runtime-evidence benchmark blocks remain unchanged; legacy completion is not qualified native authority.
- Raw reference SHA256 `fd712bee2d4229bc8476d1cc25fce1a21172e6013c6abfe8949498cc5ce15acb` must equal captured `identity.historicalReferenceHash`. Canonical `hashHistoricalReference` is a different digest. Dataset/prompt pins remain `2dc17d06752c2981862690953a7b134235bb6a20da4dc9b5fef5528f91f5bb56` and `205b635a252e1f378023f5e1f3c670a6fba0ecfdfc8ce4f08f30efa24c544263`.
- Require six pre-existing native receipt/binding pairs: preflightLOW/MEDIUM, developmentLOW/MEDIUM, validationselected, benchmarkselected. Recompute each binding at its stored `throughSequence`, not the current head. Completion does not publish/admit/backfill a missing receipt/binding.
- Require canonical158 distinct finished outcomes:2/48/48/60;146 image reservations:2/48/48/48;12 benchmark barcodes; token readiness separate. All image keys consumed/reconciled completed or failed, zero pending. Ordinary prior-stage failure journals remain allowed under unchanged selection/stage gates; do not require146 successful predictions.
- Preserve full `evaluateCalibrationStageGate('benchmark', gateMetrics)` AND historical compatibility/all7 finite deltas/absolute subset check. Privately compose measured report fields with freshly verified native runtime counters as specified in Task2 Step3; the frozen pure report bridge intentionally supplies no call counters. Keep60 parsed/0 failures/0 unsafe,48 image/12 barcode,36 meal/12 label, carb-density eligible33 and the other corresponding meal counts36. No new threshold or all-negative-delta rule.
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
| existing `src/nutrition-eval/calibration-file-store.ts` | Task2Step3 prerequisite amendment only: explicit new construction helper/non-mutating native reads inside the existing guarded store; old exports/defaults unchanged |
| new `test/nutrition-eval/calibration-benchmark-authority-store.test.ts` | Task2Step3 prerequisite amendment only: real preparation-read regressions, path/identity guards, acquisition and genuine full-history reopen diagnosis |
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

### Task2Step3 native-store prerequisite amendment (2026-10-20)

**Approval/scope:** User answered "yes" to extending the Task2Step3 native-edit exception to EXISTING `calibration-file-store.ts` and NEW `calibration-benchmark-authority-store.test.ts`, after a reviewed plan amendment. The previously authorized two source files remain allowed. Existing tests/helpers, codec/reducer/report/schema and later-task native edits remain frozen. Execute this bounded amendment inline after actual written-amendment review agrees/MUST_FIX none; preserve the established method without another execution-method choice. Official Task2BASE remains28ffe6c, not a new task/BASE.

**Observed prerequisite:** Native67187 actual1:15tests11pass4fail; fresh-root preparer returned but root inventory changed false→true/empty. `resetAndReplay` reads journal/ledger through `containedPath`/`ensureCanonicalChain`, whose existing native branch creates missing directories. `getRoot()` is pure. Three valid full-copy paths reject static native-input-invalid and remain independently unexplained. Do not conflate these failures, edit their assertions, remove the created root afterward, add fake empty replay data, defer existing-history validation or build a second reader/store.

**New helper interface (existing store file only):**

**Actual written-amendment review:** Antigravity MCP primary `gemini-3.8-flash`, `approvalMode:yolo`, persistent conversation `calorix-benchmark-store-amendment-written-20261020`, returned nonempty/isErrorfalse/`AGREEMENT_STATUS: agree`/`MUST_FIX: none`. Scope `WRITTEN_TASK2_STEP3_STORE_AMENDMENT_ONLY_NOT_CODE_APPROVAL`; effort tool-managed/unreported. No fallback. This review covers the supplied actual amended plan/spec, not a source repair/test outcome. Existing source remains unqualified until all acceptance gates pass. User scope approval plus this written review authorizes the bounded A–E execution; no repeated execution-method question needed.

```ts
export function createBenchmarkAuthorityFileCalibrationLedgerDeps(
  baseDir: string,
  owner: CalibrationOwner,
  overrides?: RuntimeEvidenceFileStoreOverrides,
): CalibrationLedgerDeps;
```

Keep the existing `createRuntimeEvidenceFileCalibrationLedgerDeps` and legacy store signatures/defaults exactly unchanged. Share private closed owner/hook capture and the same store implementation. Select the new helper only in the benchmark native preparer, never via caller flag/header/env or a new ledger method. Private construction selection may change only native read traversal; no new override/higher-level authority port.

- [x] **A. Add focused store RED before the store implementation.** In the NEW test file, register each owned `mkdtemp` immediately; disk-backed `TMPDIR`; cleanup only those roots. Use real native store calls, actual file inventory/modes/bytes and literal owner data. Direct new-helper tests may initially fail with missing export; the original fresh-root authority test already independently witnesses real directory mutation. At5000ms per small test cover entirely absent chain; partially present private chain; repeated journal/ledger/lock reads with no mkdir/chmod/write/fsync hooks; actual existing private `[]` files read unchanged; symlink and non-directory intermediate/leaf rejection; wrong root mode; replacement of an observed ancestor after a missing read; retained poison/no next effect; and valid exclusive owner-lock acquisition after read-only absence. A separate old-helper control must keep its established directory creation behavior (not relabel it zero-effect).

```ts
const before = inventory(baseDir); // entries/kinds/modes/regular-file bytes
const deps = createBenchmarkAuthorityFileCalibrationLedgerDeps(baseDir, owner, hooks);
expect(deps.readJournalEntries()).toEqual([]);
expect(deps.readLedgerEvents()).toEqual([]);
expect(deps.readLock()).toBeUndefined();
expect(inventory(baseDir)).toEqual(before);
expect(mutationHooks).toEqual([]);
deps.writeLockExclusive(owner); // actual existing acquisition mutation
expect(JSON.parse(readFileSync(resolve(baseDir, CALIBRATION_ROOT, 'lock.json'), 'utf8'))).toEqual(owner);
```

`inventory` is a NEW-test-local recursive lstat/read helper; never follows symlinks, ignores timestamps/inodes for zero-effect comparisons, and includes root existence. Ancestor replacement tests separately assert actual inode-sensitive rejection and keep both original/replacement roots for owned cleanup. Do not assert mocks instead of real bytes/effects.

- [x] **B. Isolate full-copy rejection before selecting its repair.** Same NEW file: first explicit600000ms test builds a genuine MEDIUM benchmark-ready template using the frozen `buildBenchmarkTemplate`, verifies158finished/146consumed/12barcodes/sixbindings and released lock (existing builder already verifies independent artifact/reducer/key integrity). Subsequent tests use frozen `copyBenchmarkTemplate`/real bootstrap; assert copied ledger/journal bytes, private modes, source identity and all required input primitives. Exercise existing native preparer and new native preparer on independent copies to distinguish shared replay defects from new-mode capture. Each valid construction must resolve (no swallowed errors); before-lock queries remain denied and preparation writes nothing. Use source predicate tracing or private static phase labels for diagnosis only; never inspect/coerce a foreign thrown error. Do not change a frozen helper or source outside the amended map. Record exact first failing predicate before code repair. Any discovered requirement for another file/API/schema change stops for amendment.

- [x] **C. Implement minimal read-only traversal in the existing store.** New construction helper shares private owner/hook capture; add only a private selection parameter to the existing implementation. In the native wrapper, distinguish the fixed read method names `readJournalEntries`, `readLedgerEvents`, `readLock`; preserve reentry/poison/exit propagation. Read traversal lstat-validates every existing ancestor, caches/checks observed device/inode identities and validates modes/symlinks. On actual ENOENT in the new read mode, return a missing-chain outcome without mkdir or reaching a leaf via unvalidated intermediate components. Existing/malformed roots must not be mistaken for absence. `readJsonArray` returns empty/`readLock` undefined only from native absence; no fabricated histories. Traversal must continue later from a previously observed partial chain without dropping/rebinding observed identities. Existing constructors keep mkdir behavior. A normal owner-valid exclusive lock mutation creates the remaining chain through existing mkdir/fsync namespace path; validate the supplied owner before this new-route creation and preserve all native write barriers and retained uncertain effects. No extra state is persisted. Update only the new native factory's dependency selection.

- [x] **D. Prove focused GREEN and original integration GREEN.** Run new store test file serially, original authority file serially, unchanged historical/benchmark-history/runtime-core/authoritative controls, all old store tests and relevant native controls; real strict typing adds the NEW file and store source, then build/full lint. Preserve5000ms small-test and600000ms full-history budgets; no old timeout/retry/skip/config changes. Read every JSON case/status/failure and verify original authority hashes524b3ce3/d7dda587 unchanged. Record source map: exactly the previously allowed two sources plus store and NEW regression test; no extra old Functions mismatches. Nutrition/default full suites remain required before whole Task2 completion, not inferred from focused passes.

- [x] **E. Review/checkpoint without overstating completion.** Scoped actual external code/result review must agree/MUST_FIX none before any qualified checkpoint. Report exact source hashes, RED/GREEN run IDs/counts and known blocked wider matrices. Update this plan/status, commit/push exact owned stage files and verify live origin equality; run fresh committed focused verification. Step4/5, Task3 and SDK/controller/production qualification remain separate/open. Native exception closes for these amended Step3 files after the bounded stage; no permission to natively edit the frozen original authority tests or later-task files.

**Additional prerequisite diagnosis / pending user scope direction (2026-10-20):** New small actual-copy diagnostic80312 ran against the UNCHANGED store:2selected cases,1PASS1FAIL/17selector-skipped. On this host Nodev22.23.3/umask0002, the current `cpSync(...,{recursive:true,preserveTimestamps:true})` produces canonical directory0775 from source0700. Supplying ONLY `filter:()=>true` preserves0700 and private0600 leaves/bytes; both unchanged native journal/ledger reads then pass. Installed Node code routes no-filter copying through its native directory binding, while its filtered JS route applies source directory mode. The native store's rejection is correct; do not relax0700 validation or chmod malformed roots. This small experiment does not prove the full integration is fixed. Genuine158-history copied-mode diagnostic40566 remains pending at this receipt.

Actual Antigravity MCP primary3.8/approvalModeyolo/nonempty/isErrorfalse in `calorix-benchmark-copy-mode-prerequisite-20261020` agrees/MUST_FIXnone with **PREREQUISITE_COPY_MODE_DIAGNOSIS_ONLY** and the smallest authorization request: change ONLY `copyBenchmarkTemplate`'s existing cpSync options to add `filter:()=>true`. Same-conversation correction retracts its wrong `.calibration` shorthand (actual root is `CALIBRATION_ROOT`) and any implication that all three integration failures have already been repaired. The response also uses an inaccurate `resolveCanonicalDir` symbol label; actual store code is the local `canonicalDir = resolve(...)` expression, and no such new API is proposed. Review direction is accepted only against actual source/runtime evidence, not those labels. No reviewer mutation, code/result approval or complete integration claim.

Follow-up actual receipts:40566 CLOSED actual1/209.51s,2selected cases1PASS1FAIL/17filtered. Genuine MEDIUM158-outcome foundation PASS188768ms; copied ledger/journal bytes match, but canonical copied mode0775 fails literal0700 BEFORE store replay (6882ms). This proves the mode defect also affects the real full-history fixture, not only the small direct copy. Actual-helper minimal regression87454 CLOSED actual1/1selectedFAIL/17filtered, same0775-vs0700 assertion against UNEDITED copyBenchmarkTemplate. All JSON cases/status/errors inspected; temporary upstream-copy diagnostic replaced by this actual-helper regression. No full replay/repair/source green inferred.

**Subsequent explicit user approval:** User answered "yes" to the exact one-operation copy-helper native exception after the preceding reviewed diagnosis/direction. This supersedes fixture freeze524b ONLY for adding `filter:()=>true` to that existing cpSync call. Every other fixture function/type/signature and authority.test d7dd stay frozen. Host independently reconstructs the previous fixture text by removing only that option and verifies its SHA equals524b; do not overwrite the old freeze manifest. Actual-helper RED87454 now GREEN65903 actual0/1selectedPASS17filtered after that one change (no store implementation yet in that receipt). No global Node/umask/config/dependency change, old assertion edit or later-task native exception. Re-run genuine full history, both preparers, original15 authority tests and all amended acceptance gates; correct copy construction is not itself benchmark authority or complete source qualification.

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

- [x] **Step 1: Independently qualify the native fixture before feature RED.** Author only the `buildBenchmarkTemplate` portion of the new fixture and sequential foundation tests; defer `openBenchmarkBase`/`openBenchmarkTemplate` and ALL new-factory imports until Step2. This avoids an absent new export preventing the old-capability foundation from compiling/running; do not add implementation stubs. Reuse old read-only `makeMiniGitRepoTask4(roots)`, actual `createCalibrationBootstrapReadDeps`/`prepareCalibrationBootstrapContext`, actual existing native preparer, `runSharedFoundationPreflight(ledger,context)`, `deriveCanonicalReportOutcomePlan`, `createCoreExactPrediction`, `buildCoreSuccessJournal` and real publisher/verifier. Old helper `finishDevelopment` is hardwired to a MEDIUM tie; do not modify or use it to pretend LOW selection. Build remaining outcomes explicitly:

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

**Step1 accepted receipt (2026-10-20):** Final foundation7267 actual0/2pass/0fail/skip/todo, LOW178068ms/MEDIUM162971ms,total350.69s; prescribed strict53389 and full lint72470 actual0. Every JSON case/status checked; case/statusSHA`ebc610161e93e11d7f5db14730ed32f38be81552af4ae64972e042634bec153d`, rawJSONSHA`5639cec6cfea3dde11e1e8d2141bf067278b0ceb9e59a94f6333a74e578242b2`. Native inventory verifies158 canonical finished/146 image/12 barcode keys, actual persisted header/context, independent reducer replay and all6 original binding cutoff hashes, all6 freshly verified/reconstructed receipts, prior losing-profile provider failure and released owner lock. Frozen legacy getter returns146 images ONLY; barcode12 are independently taken from actual benchmark snapshot.nonReservations. The earlier erroneous158getter expectation produced18353 actual1/2fail, fixed only in the new fixture, then same focused selector GREEN. This is fixture qualification, NOT new-factory feature RED or SDK dispatch proof.

Normal editing worker authored only two new test files through native patches; production source/oldhelpers/configs frozen. Stable fixtureSHA`ed35321051bdd4d1c7ab8791fca5f29137a320dd4e8254355730aa2f5946b84a`; testSHA`0b34cb8c2d386adbccf337cdec78e63d614a8fad3f0840b7af08bfe8b67dd729`. Actual scoped external code/result review succeeded under this plan's explicit headless exception: CLI4350, nativeconversation`323bcec8-c794-44b8-b4ec-00c3a26e2c0a`, literal3.8-flash/High, OSexit0/nativeSUCCESS/agree/MUST_FIXnone, `TASK2_STEP1_FIXTURE_CODE_RESULT_ONLY`. Supplied complete new-source bundle and actual JSON were reviewed; this is CLI, NOT MCP or independent filesystem/SDK/visual/production/security attestation. Prior MCP3.8timeouts/3.7and3.6Higherrors and two ERROR503 CLI responses are retained and NOT counted as approvals. Task2/3 and parentTask7Steps4–7 remain open; checkpoint before Step2.

- [x] **Step 2: Write and independently observe new completion RED.** Add the new factory imports and both native positive tests, preserving first foundation tests. The template must be freshly opened through the new factory, not a caller-shaped ledger:

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

**Step2 RED receipt (2026-10-20):** Host observed whole-file93224 actual1:15tests/7pass/8fail/0skip/todo,total283.31s. BOTH explicit native foundations pass again (LOW143280ms/MEDIUM130991ms); old-factory unknown-field and bootstrap controls pass. Every8failure message is actual `prepareNativeCalibrationBenchmarkAuthorityLedger is not a function`, not import-collection failure or an observed nutrient/full-gate failure. Native setup/copy/bootstrap occurred; new entrypoint still genuinely absent. No stubs/shims/catch-swallowed construction errors. Qualified released templates are reused rather than rebuilt by feature cases; source lock checked before copy; valid new-preparation tests require fulfillment and compare root/entry/mode/file-byte inventories, with new closed-parameter controls. Full lint41268 actual0; all old Functions/config hashes unchanged. JSON everycase/status/error inspected: rawSHA`db6d602c28635da9b474b33f1bb6c666e38964a53090763f069c2dc35da99715`, case/statusSHA`2c4da763e79adc9003f083e8e6679ff5738c5b59d461c5ea04d7fd1aa1ce75f5`. Tests now frozen at fixture`524b3ce37bf923e3c0ac39e417057d35c4361ea9b7a181e65d0d7d3cdc8742cc`/test`d7dda587347cf53c0a689a468b3d14316d696c0f8f1055b8296db9621fb443c9`; source-only Step3 next, not Task2 completion.

- [x] **Step 3: Implement the shared-core opt-in and native composition.** Add only the new factory/private-init discriminator with required authoritative/runtime options and captured `config`. Existing factories never pass it. Capture exact `historicalReferenceBytes` own-data string under existing construction guards and prepare Task1 assessor using captured identity hash before any mutation/replay authority. Extend the init union privately; no mode field on disk/public ledger. Missing runtime/verifier/reference fails static `calibration:benchmark-authority-input-invalid` before any new write. New native composition shares existing private prepared-context/low-level-hook capture synchronously before its await; routes only the new exported function to the new core factory with owned `context.files['historical-reference']`. Preserve old catch/error behavior; new native boundary uses `calibration:benchmark-authority-native-input-invalid`.

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

`verifyBenchmarkAuthority()` additionally rechecks source/current owner/private poison and freshly verifies all6 receipts using existing `verifyReceipt`/journal reconciliation/independent reconstruction. Match each returned receipt to the admitted and bound receipt before using measurements; do not trust cached `measuredReports` or a helper's `passed`. Recompute prefix digests again against actual current evidence. Check exact native benchmark report/source/profile/model/schema/pin association through existing `assertMeasuredBinding`; call Task1 assessor on the freshly verified report.

**Reviewed private-plumbing refinement (2026-10-20):** Existing private `verifyReceipt` currently discards `envelope.report`. Retain this already-captured value in its private return, then hold only the freshly verified benchmark report in a local variable during the six-receipt loop for immediate Task1 assessment. No new `verifiedReports` cache/map or replay state; discard after each completion check. Existing `measuredReports`/receipt behavior stays unchanged and is not new benchmark permission. New evidence mode already owns/deep-freezes copies through `evidenceCapture`; never add freezing of foreign legacy/caller reports. Actual primary3.8 MCP pre-implementation review and refinement in `calorix-benchmark-authority-task2-integration-20261020` agree/MUST_FIXnone, scope `TASK2_PRIVATE_INTEGRATION_PLAN_ONLY`. This is minimal in-map private plumbing, not a public/schema/persistence amendment or implementation/result approval; actual Step2 RED still required before source authorization.

**Reviewed counter-composition ruling (2026-10-20):** The frozen pure report bridge intentionally omits four runtime counters; forwarding its raw stage to the full gate always fails. Within this existing private verifier ONLY, compose `gateMetrics: CalibrationStageGateMetrics` from `assessment.measurements.stage` and the freshly verified benchmark pair input at its stored binding cutoff. Match event keys against the actual canonical benchmark image/barcode plan and finished terminals; never accept caller/report counters or a passed scalar helper as native authority. Derive `visionCallCount` from actual `runtime_operation_started` vision events on benchmark image keys, reconciling corresponding authorization, settlement and finished-terminal evidence; count extra attempts rather than collapsing them into permission. Derive `suppliedBarcodeImageCallCount` from image starts on canonical barcode keys, and `suppliedBarcodeVisionCallCount` from vision starts or request authorizations on those keys (both must be absent). Only after canonical barcode snapshot/terminal reconciliation, `suppliedBarcodeLiveOffCallCount` is structurally zero at the existing mediated runtime protocol boundary: that protocol admits only image/vision/snapshot operations and no live-OFF operation. This is NOT an assertion that arbitrary external callbacks performed no network activity, actual SDK dispatch/response proof, kernel isolation or hardware attestation. Do not extend the pure measurement bridge, codec, reducer, report/schema, public API or persistence with counter hooks/flags. No threshold is changed.

Require `comparison.compatible`, exact all7 finite fields, `subset.passed` and unchanged full `evaluateCalibrationStageGate('benchmark', gateMetrics).passed` conjunctively; no duplicated threshold table. Recheck poison/evidence/owner/source after callbacks/reflection and before existing completion persistence. New guard failures wrap static `calibration:benchmark-authority-failed`; foreign details never escape. Native positive/negative tests use actual verified runtime facts; literal48/0/0/0 below is restricted to scalar helper unit coverage. External consultation `calorix-benchmark-counter-composition-20261019` confirmed this is a narrow correction within the approved spec, not a new public/persistent authority surface; direction agreement is not implementation approval.

Preserve gate-before-completed-stage ordering in `strictCompleteStage` AND `strictReplayStage`; structural prefix checks happen before replay consumes that completion frame, not after scanning final arrays. No authority until existing locked `refreshUnderLock` succeeds. Existing modes continue rejecting benchmark completion during locked replay and live calls. Update the wrapper's comment/static catch selection only for explicit new mode: old benchmark still reports `calibration:benchmark-runtime-evidence-required`; new benchmark failures report `calibration:benchmark-authority-failed`. Successful checked delegation must not be replaced by an unconditional wrapper deny. Existing permanent poison/current-owner/source and durability paths remain shared.

**Amended Step3 code/result checkpoint evidence (2026-10-20):** Helper87454 RED→65903 GREEN, small32422 14PASS4filtered, fullstore39088 actual0/18PASS0skip/361.83s and frozen authority49423 actual0/15PASS0skip/504.09s. Strict32184/build49827/full lint60137 actual0. DEFAULT69004 actual0/3965.48s:60files/4159PASS1oldfetchskip/4160total; exhaustive programmatic statuses and exact old4127tuple comparison plus33new/all7controls PASS. Raw receipt0f5ccbf27e4539a5163d5c62301e0e5976631ce319ee043eb8b2126c4e3e2ccc. Candidate core832dbc5be89bcf9219afc5fcd48a709e7987defbca114d49863e5559b97c5276/storec66d51a37bcc7e428ece71bda9180b33d15647b3cb18c83154bd3d0f811a7e60/native5405063befbdbeabbb964d3b01522a6695ac47bcde49bd00b836e04a3e335fe7 unchanged since code review. Same native CLI84423 actualOS0/SUCCESS/conversationd2163d49-baf5-4a26-b4c9-c33da0bfa1a3/model3.8/High/agree/MUST_FIXnone/SHOULDnone/QUESTIONSnone, TASK2_STEP3_AMENDED_RESULT_CHECKPOINT_ONLY; all15 tools read-only, exact population comparator independently ran. This is explicitly authorized CLI fallback, not MCP. Its blanket A–E-complete phrase is not accepted before commit/push/freshfocus: E remains OPEN until those operations actually pass. Task2 Step4/5 andTask3 remain OPEN. No liveSDK/accuracy/device/UI/security/production approval.

- [x] **Step 4: Pin compatibility, prefix and before-idempotence controls.** Add table tests for each of6 receipt removals,6 binding removals, wrong stored throughSequence/digest/receipt, missing finish/terminal/journal/key, duplicate/substituted key, pending or active attempt, wrong predecessor/profile/model pin/source/owner/token. Use fresh copies; negative malformed history is labeled tamper rejection, not positive proof. Assert rejection before a new completion, no new request/report/binding/receipt repair, retained actual bytes/lock and poisoned repeat no effects. Do not require a preexisting completion to vanish.

**Step4 native exception approval (2026-10-20):** The user explicitly answered “yes go on” to the pending one-file request. Host-native `apply_patch` may finish ONLY `functions/test/nutrition-eval/calibration-benchmark-authority.test.ts` for this step, preserving the original15 cases/20 non-import statements/helpers/timeouts, frozen application sources/fixtures/defaults/configs, and all independent review, verification, commit and push gates. This supersedes the historical PENDING permission below; it is not a test result or later-task exception. Intended gate: whole authority file serially after preservation and strict typing, followed by Step5 broad gates and actual code/result review.

**Step4 actual qualification:** Test SHA256 `39f42fa3d57778b75db40d3c52a51089e2342cda2dc4910225d4224c48e9ce46`; native run11704 actual0/638.95s/52PASS/0fail/skip/todo. Original15 full names/statuses retained exactly plus37 newPASS; original20 non-import statements/9 call definitions/cleanup/timeouts preserved, syntax/whitespace clean. Strict56575/build3728/fullLint22314 actual0. Receipt raw `f546170ae03ee4768bcc3b97c65086d8803714a6a90268162bf246a72e02961e`; all-case inspector `e9cf74edfa5c64da1afcb35e6155a7023d3092091976b1a9579141c5fe5bb7ff`. Native actual counters/keys and six receipt/binding cutoff reconstruction assertions executed for both real foundations; LOW160426ms/MEDIUM130015ms. Primary3.8 MCP code15/result39 each nonempty/agree/MUST_FIX none/no fallback, result scope ONLY `TASK2_STEP4_RESULT_CHECKPOINT_ONLY`. Corrected review limits: construction-only zero-effects; legitimate acquisition precedes snapshot; retained inventory/modes/bytes are not transient-syscall/root-mode/symlink-target proof; generic malformed-history rejection is not unique inner diagnosis; disclosed worker/tmp deviations remain. Step5 separate nutrition30970 ACTIVE; DEFAULT/broad result review/fresh committed focus pending. Three-path test/tracking checkpoint is a bounded stage, not wholeTask2 or any SDK/accuracy/security/production approval.

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

**Step4 diagnostic handoff (2026-10-20):** First complete native gate52507 actual1/545.15s,52cases47PASS5FAIL0skip/todo; all15original cases passed and remainexact. Actualtrace identified public pre-lock wrapper label, pinned-reference mutation beforebootstrap, two adjacent samples withsamecaseId, and finalbenchmarkbinding incorrectly demanded atconstruction despite no benchmarkcompletionframe. Primary3.8 Antigravity MCP in calorix-benchmark-step4-boundary-diagnosis-20261020 returnednonempty/isErrorfalse/agree/MUST_FIXnone/DIAGNOSTIC_DIRECTION_ONLY/no fallback, confirming test-only corrections and no new constructorseal/source change. Earlier5 pair removals stillrejectconstruction; the finalpair must reject actualowner-acquired completion withnofabrication/backfill andpoisoned-repeat effectschecked AFTERacquisition. This isnotcode/resultapproval. Paidworker5777 thenhitactual5h sessionlimit; literalusage30234 session100%resetOct20 19:09Zurich/week16%resetOct27 01:59/extra-capNOTreported. Partialrepairedtestc7eec0f27ef4de22114e621c0d86c1b0f5cbae518fd48f2308e3ba1957546a01 preservesall20oldnonimportstatements/old15 andpasses strict97881/build24455/fullLint6819, butwhole-rootno-effectassertionstrengthening and freshnativeverificationremainpending. Workerprocedural/tmpstagingviolations/containment are disclosedinstatus/ownedledger; allactualrepopatches useddesignatednativeadapterandonlyallowedtest, noperfectcomplianceclaim. Source/fixtures/default/configs unchanged. ExactonefilehostnativeStep4exceptionrequested/PENDING, notgrantedorimpliedbycontinue. Step4/5/Task3remainOPEN, codecandidateunaccepted/unstaged; docs-onlydiagnosticpublicationdoesnotpublishorqualifyit.

- [x] **Step 5: Verify, externally review and checkpoint.** Run whole new pure/authority files, unchanged old historical/authoritative/runtime-evidence/core/native/producer controls, shared strict/build/full lint and separate serial nutrition suite. Inventory exact native artifacts/counts/keys and six digest cutoffs; collect actual JSON receipts and all failures/skips. Actual scoped Antigravity CLI Task2 code/result review agrees/MUST_FIX none before main stages owned files/tracking, commits `Add opt-in benchmark completion authority`, pushes and checks live origin equality. Run fresh committed focused tests; record nextTask3. Parent Task7 Steps4–7 remain open; this is native gate qualification, not actual SDK/controller arithmetic or live accuracy.

**Task2 actual completion:** Expanded tracking checkpoint15a7724dd7a6a946157d1df2cbe5b48e4c92d001 pushed64527 actual0/live origin equality/clean isolated workspace verified. Fresh COMMITTED focus/task-done89208 actual0/747.90s/3files169PASS0fail/skip/todo, all99history+52authority+18store names/statuses exactly equal qualified DEFAULT subset. Raw `f2bf3831aa6dac407c7194a30382385027d70b80183242227c1311ff3c404458`, inspector `6eb5bfbda79a01c6a81ef62413380c6ada237d864fd66f74b17e7e3fcdc6daac`; officialTask2BASE28ffe6c unchanged, task-done recorded28ffe6c..15a7724. All expanded nutrition/default/strict/build/lint/code-result reviews above are actual successful gates; no code changed after reviewed4fc3978. Source6 hashes and protected3 fingerprints retained. Native one-file Step4 exception CLOSED, not extended to Task3. Task3 is NEXT/unstarted and uses normal workers; no native per-task reviewer, one whole-plan native review at Task3 end. Legacy/plain and mediated-protocol/retained-filesystem/CI limitations remain as recorded, not physical crash/SDK/live accuracy/security/production/UI approval. Tracking closure push then clean Task3 BASE/brief is next; parentTask7 Steps4–7 stay OPEN.

**Step5 expanded qualification / final operational gate pending:** DEFAULT58450 actual0/3054.64s/60files4196PASS1oldfetchskip4197total, nutrition30970 actual0/3020.92s/47files3801PASS1sameoldskip3802total. Full case/status inspection and exact old/new tuple comparisons passed, all7 required controls, 52 authority/18 store identities match pinned receipts, independent nutrition3802 tuples identical across both runs. DEFAULT raw `2e03b629f4411d848bacef47c7b0b324ae578fe6c86ec85cd40d7bdd39a344dc`, inspector `9077daf44923c197e5f5d51364d697e44244d07a16acf3bd2e8baf35ea4f4a03`; nutrition raw42d100/inspectorc79ec7 retained below. Fresh strict52896/build10432/fullLint67779 actual0. Actual native MCP primary3.8 code97/result179 each nonempty/isError false/agree/MUST_FIX none/no fallback; result scope `TASK2_EXPANDED_RESULT_CHECKPOINT_ELIGIBILITY_PENDING_FRESH_COMMITTED_FOCUS`, not completed operations or Task3/production approval. Source six-file manifest unchanged and all3 protected fingerprints retained after review. Host narrows review wording to actual `sameOwner` fields, unchanged legacy plain behavior, structural mediated OFF vocabulary, actual filesystem retained-state snapshots and CI[] meaning no run found. Exact tracking checkpoint/push/live equality and fresh committed focused history+authority+store169 remain required before this checkbox/task-done closes. No application/test change after reviewed4fc3978; no Task3 authorship/SDK/live/device/UI/security/production claim.

**Step4 published source checkpoint:** `4fc39789bb72bd75082172a90c1475203ad83ba0`, exact reviewed test/status/plan three-path commit, push93640 actual0/live origin equality verified; isolated workspace clean afterward. Step5 separate serial nutrition30970 is active, not green. DEFAULT, actual broad result review and fresh committed focus remain open. All Step4 application-source/fixture/default/config hashes remain frozen. Native MCP is working again and was used for both Step4 reviews; historical CLI wording above does not authorize silently bypassing the current MCP review policy.

**Step5 partial actual evidence (nutrition complete / DEFAULT active):** Separate serial nutrition30970 actual0/3020.92s/47files/3801PASS/1oldfetchskip/3802total/0fail; exhaustive case/status receipt inspection and comparator actual0, old3732 tuples exact +70new(52authority18store), all7 required controls, authority52 names/statuses equal focused baseline. Raw `42d100939d8fdf00350b8db3ee72a982db4930c37dae2ce1f53ac6c8837339f2`, case/status `c79ec7c809acd62b71ac7c26af8fd1b0bd31fb096b40bd394d9d8bb4673faa2e`. DEFAULT58450 now ACTIVE, literal unfiltered project npm test/serial/one worker/fetch unset. Broad Task2 MCP97 code-only agree/MUST_FIX none, no fallback, scope pending expanded broad results; final review must correct prose limits recorded in status. No source/test/fixture/default/config change after reviewed4fc3978. Step5 remains unchecked pending actual DEFAULT, final result review/checkpoint/push/fresh committed focus; not wholeTask2 or production qualification.

**Bounded Step3 closure (2026-10-20):** Source/result checkpoint26b96feaf3541fff088ad1150e42f58cd47fd617 committed exact9ownedpaths/pushed60675actual0/liveorigin equality verified. Fresh COMMITTED focus65186 actual0/477.50s,3files/132PASS0fail/skip/todo (99history+15authority+18store); every status checked programmatically, no abnormal file. Raw0e14603862d7dc8a693b233c9592b889dccb653e00429bc5935ad57a93160349/case-status66939ce7a86d9768fb1c079dbb1bafe3139d11d7be49a815e46fe8d36d0d7e9e. No application/test changes during verification. AmendmentA–E and Step3 now checked on actual evidence; native Step3 exception CLOSED. Step4/5/Task3 remain OPEN; normal workers resume for planned new tests, officialTask2BASE unchanged. No wholeTask2/SDK/liveaccuracy/UI/security/production claim.

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

- [ ] **Step 1: Author guarded-core and full-gate discriminator tests first.** Core injected deps/verifiers are explicitly trusted boundary controls, not native positives. Reuse old core fixture backing data read-only where useful; instantiate the new core against fresh owned event/journal buffers, actual canonical plans and measured report data. Distinguish construction from postconstruction: config/runtime-option capture must qualify hostile reflection, prototype/closed-field validation, revoked proxies, static causeless rejection, zero next mutation and caller-alias ownership without freezing caller inputs. No same-instance public handle has been exposed during constructor capture, so do not simulate its reentry using a different ledger, private hook or source change. At reachable postconstruction Git-reader, verifier, returned-result descriptor/proxy and gate-summary capture boundaries, exercise genuine same-instance swallowed nested fatal reentry followed by plausible valid data; assert zero next forbidden append/fsync/publication and permanent poison. Across both phases independently count zero foreign thrown-value name/message/code/cause/stack/toJSON/prototype reads; test revoked proxy errors, alias mutation and returned-object mutation. Recheck the actual next effect, not only an eventual thrown message; constructor abort is not evidence of permanent poison on an exposed ledger.

Constructibility clarification (2026-10-20): primary `gemini-3.8-flash` Antigravity MCP in `calorix-benchmark-task3-guard-constructibility-20261020`, nonempty/isError false, `AGREEMENT_STATUS: agree` / `MUST_FIX: none`, scope `TASK3_GUARD_CONFIG_CONSTRUCTIBILITY_ONLY`. Source1624–1789 captures config before guarded public methods are assembled/returned4785–4828. The private closure already exists; the review's broader phrase that no instance exists in memory is not adopted. This is a qualification-wording correction within the existing interfaces/spec and file map, not a source amendment, test waiver, executed guard result or application approval.

Partial Slice A qualification (2026-10-20): the new guards file independently collects one measured software-fixture baseline plus28 missing-field and28 violating-field controls, exactly19 counts/9 metrics, all5000ms. Focus10301 passed451/0skip across4files (57new+394 unchanged old case/status tuples), strict48086/build18887/full lint79663 actual0. Primary3.8 MCP344 in `calorix-benchmark-task3-guards-slice-a-20261020` returned nonempty/isError false/complete-file inspection/agree/MUST_FIX none, scope `TASK3_STEP1_SLICE_A_UNIT_CODE_RESULT_ONLY`, no fallback. This qualifies existing helper behavior, not feature RED or native evidence;48/0/0/0 counters remain scalar unit controls. Step1 stays unchecked: constructor hostile/reflection/privacy/alias and reachable runtime reentry/permanent-poison controls are still pending. Native/fault/recovery/full-suite/postcommit/whole-plan gates remain open.

Partial Slice B qualification (2026-10-21): the user's explicit native patch-only exception for this guard-test FILE allowed repair of rejected worker fixtures; no production source/old-helper/default/config changes. The final712-line guard (file SHA256 `bf057dc7e80198eac05f57b250f71c8ca60eef6cd96049c62ff86212573b1e71`) collects38 constructor cases plus the57 preserved Slice A cases, all5000ms. Focus89902 passed489/0skip across4files/40.08s, independently preserving all451 prior case/status tuples; strict60792/build1268/full lint37199 actual0. Each of18 foreign-error reflection/property-read counters was independently triggered before asserting zero hits at the actual tested boundary. Explicit null/undefined overrides reach the real constructor, revoked foreign/input controls stay distinct, errors use safe boolean identity exclusions before owned class/static message/no-own-cause inspection, and mutable caller arrays/rows/nested keys remain separate from pristine callbacks through legitimate acquisition. Phase I observed93PASS2FAIL/95 and four remaining alias type errors before Phase II repaired those NEW fixture mistakes; no production feature RED is claimed. Primary3.8 MCP135 plus same-conversation attribution correction returned nonempty/isError false/complete-file inspection/agree/MUST_FIX none, scope `TASK3_STEP1_CONSTRUCTOR_SLICE_B_UNIT_CODE_RESULT_ONLY`; the64-character hash is a FILE digest, not a Git commit. Step1 stays unchecked: reachable runtime reentry/privacy/permanent-poison and returned-alias controls remain pending. All native/fault/recovery/full/postcommit/whole-plan gates remain open; no SDK/live/UI/accuracy/security/production approval.

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
  // Scalar helper unit control ONLY: these literals are not native evidence.
  const unitMetrics: CalibrationStageGateMetrics = {
    ...exact.stage,
    visionCallCount: 48,
    suppliedBarcodeImageCallCount: 0,
    suppliedBarcodeVisionCallCount: 0,
    suppliedBarcodeLiveOffCallCount: 0,
  };
  expect(evaluateCalibrationStageGate('benchmark', unitMetrics).passed).toBe(true);
  for (const field of [...countFields, ...metricFields]) {
    const missing: CalibrationStageGateMetrics = { ...unitMetrics };
    delete missing[field];
    expect(evaluateCalibrationStageGate('benchmark', missing).failedChecks).toContain(field);
    const violated = { ...unitMetrics, [field]: 10000 };
    expect(evaluateCalibrationStageGate('benchmark', violated).failedChecks).toContain(field);
  }
});
```

This unit table proves unchanged full helper behavior, not native report reachability. Import the existing `CalibrationStageGateMetrics` type; do not change source declarations to type the table. At the integration boundary use independently measured reports from actual case predictions AND genuine native runtime-counter derivation above, never the scalar table's literals or a hand-authored summary. Build a genuine negative benchmark with every meal prediction's proteinG and diagnostic rawNutrients.proteinG multiplied by1.4 before journal/publication, all other exact values unchanged. This raises the median meal protein error above0.35 while the aggregate mean macro error stays below0.45 and the other historical subset fields remain valid. Assert that actual measured precondition, rather than assuming it. `scenario:'benchmark-meal-protein'` retains the prior losing-profile provider failure and applies this perturbation to all benchmark meal outcomes; it never edits hashed artifacts. The Task3 native foundation confirms full failedChecks includes `medianMealProteinRelativeError` (not merely absent runtime counters) while historical subset passes, then actual new completion rejects caller `passed:true`. Benchmark has NO latency threshold in its existing full gate; do not add one or use slow latency as a false discriminator. Other impossible count combinations remain unit/schema/tamper controls, not fabricated native positives.

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
