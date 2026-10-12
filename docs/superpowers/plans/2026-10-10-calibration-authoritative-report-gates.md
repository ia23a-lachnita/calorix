# Authoritative Calibration Report Admission and Measured Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task-by-task. Preserve the approved host-led workflow: ordinary strongest-first workers edit application source/tests; the host researches, verifies, reviews, commits and pushes. One fresh read-only whole-plan reviewer checks the final implementation. The completed artifact-reader native-edit exception does not apply.

**Goal:** Add an unused, opt-in strict-ledger mode that admits actual report artifacts against its own journal snapshot and derives preflight/development/validation decisions from their measured results rather than caller assertions.

**Architecture:** A pure measurement module captures report data and maps canonical case aggregates into existing selection/gate metrics, retaining the existing meal-only aggregation API through a re-export. A trailing fifth ledger option injects the prepared synchronous artifact verifier; an explicit stream-header marker prevents downgrade. Admission, replay and measured transitions run under the current cooperative lock. Authoritative benchmark completion remains fail-closed until a separately specified controller supplies real runtime isolation evidence.

**Tech Stack:** Existing Node20, TypeScript5.5, Zod3 and Vitest2; no dependency, SDK, script, native addon or public command added.

**Spec:** Approved `docs/superpowers/specs/2026-09-23-gemini-38-nutrition-calibration-design.md`; parent `docs/superpowers/plans/2026-09-23-gemini-38-nutrition-calibration.md` Task7Steps4–7. This is a prerequisite, not completion of Task7 or permission to execute live Tasks8–10. Completed artifact reader: source checkpoint `2ecb12cd2f1ef657e8e464e29e3125229906d77f`, closure `fd877e6f74b7db4799e9540f84cf91b52fb04ccf`.

## Global Constraints

- Zero nutrition-provider, SDK-client, network, device, Firebase or deployment calls. No new `gemini-2.5-flash` request. Fixed future calibration route remains Vertex `calorix-xurschnell` / `us` / `gemini-3.8-flash` / APIv1.
- Production defaults, prompts, response schemas, scorer/normalizer semantics, Review routing, historical records, public/training manifests, package/config files and existing tests remain unchanged.
- Protocol v1 remains exactly146 planned image reservations with300 hard ceiling. Barcode outcomes cannot create image reservations; this does not itself prove zero live OFF requests.
- Exactly seven changed files: new measurement source, modified ledger source, two new test files, new shared test-only fixture file, this plan and status. Existing reader/assembler/publisher/codecs/file store/preflight session and all existing tests/digest fixtures are protected.
- User `.mcp.json` stays SHA256 `9c9622f5dfd38f8eed1ac0d1b69034dc5399e77481600030148547235b06a688`, untouched/unstaged. Do not read/diff/stat-diff/stage/restore it. Scope every git diff/check explicitly.
- Keep existing `fix/scan-photo-flow-viewer` checkout; no new worktree, merge or PR. Ordinary worker routing applies; log exact current failures with ISO timestamps before each fallback. Workers use apply_patch and never commit/push.
- Use a new task-owned ignored disk-backed workspace, not completed artifact/reconstruction scratch. Verify ext4 backing before setting TMPDIR. Run Vitest serially with maxWorkers1/minWorkers1; clean only identified current-task artifacts after completion.
- All changed behavior follows independent RED, frozen test identity, source-only worker GREEN, build/lint/full serial verification, native whole-plan review and exact Antigravity CODE review. Normal hooks/commit/push at each task and postcommit verification remain mandatory.
- No authoritative run activation, CLI wiring, live dispatch, accuracy, production-readiness or security approval. Interim Task1 is only a pure helper; Task2 remains unused until later controller work.

## Review Focus

1. Constructor replay has no artifact-verifier calls; provisional replay data cannot grant selection/stage/report authority before successful current-owner under-lock replay. Existing journal/event reads are still permitted.
2. An explicit authoritative header must reject opt-out opens even before the first receipt, and opt-in must reject nonempty legacy streams. There is no silent upgrade, downgrade or migration.
3. Caller `passed: true`, chosen profile/reason, hashes, stale receipts and malicious accessors must not substitute for the ledger's own snapshot, freshly verified actual bytes or measured gates.
4. Replay/re-admission/transition checks must reverify; post-admission writes and reentrant public calls must fail before effects, including swallowed nested failures and persistence ambiguity.
5. Barcode/report accounting must not fabricate runtime counters; missing latency is not zero latency, ordinary failures can carry measurements, and benchmark completion remains explicitly blocked without runtime evidence.

## Exact File Map

- Create `functions/src/nutrition-eval/calibration-report-measurements.ts`: owned descriptor-only report capture, pure aggregates/mapping, existing meal-only aggregation moved without changing its behavior.
- Modify `functions/src/nutrition-eval/calibration.ts`: import/re-export measurement types and legacy meal helper; fifth option, header mode, receipt events/seals/replay, measured selection and stage decisions. Existing ranking/threshold implementations remain the single policy source.
- Create `functions/test/nutrition-eval/calibration-report-measurements.test.ts`: pure bridge, aggregate parity, hostile input and population tests.
- Create `functions/test/nutrition-eval/calibration-authoritative-reports.test.ts`: opt-in ledger, native artifacts, replay/transition/seal/fault tests.
- Create `functions/test/nutrition-eval/calibration-authoritative-fixtures.ts`: test-only committed-source context, deterministic journals/outcome plans, in-memory effect spies and real task-owned file fixtures. No provider/network implementation.
- Modify this plan and `docs/implementation-status.md` for the same task's actual evidence and next action.

## Shared Interfaces

The pure module exports existing `CalibrationProfileMetrics`, `CalibrationStageGateMetrics`, and `CalibrationMealMetrics` shapes moved from the ledger, plus:

```ts
export interface CalibrationReportMeasurements {
  readonly report: NutritionEvalReport;
  readonly profile: Readonly<CalibrationProfileMetrics>;
  readonly stage: Readonly<CalibrationStageGateMetrics>;
  readonly latency: Readonly<{ measuredCases: number; missingCases: number }>;
}
export function measureCalibrationStageReport(value: unknown):
  Readonly<CalibrationReportMeasurements>;
export function aggregateCalibrationMealMetrics(
  results: readonly NutritionCaseResult[],
): CalibrationMealMetrics;
```

The ledger continues exporting `aggregateCalibrationMealMetrics` from its old path. Its original selection/gate public functions and three-/four-argument factories retain signatures and behavior. The opt-in extension is:

```ts
export interface CalibrationAuthoritativeReportOptions {
  readonly verifyStageReportArtifacts: (
    params: Readonly<{
      stage: StageName;
      profile: CalibrationProfile;
      snapshot: CalibrationStageReportSnapshot;
    }>,
  ) => Readonly<CalibrationReportPublicationResult>;
}
export function createProtocolCalibrationLedger(
  deps: CalibrationLedgerDeps,
  identity: CalibrationIdentity,
  keyResolver: CalibrationKeyResolver,
  reportOptions?: CalibrationProtocolReportOptions,
  authoritativeOptions?: CalibrationAuthoritativeReportOptions,
): CalibrationProtocolLedger;
// Added to the strict interface; opt-out invocation throws the mode-required code.
admitStageReportReceipt(stage: StageName, profile: CalibrationProfile):
  Readonly<CalibrationPublishedReportReceipt>;
```

Publication/result/receipt and report-state imports in the core are TYPE-ONLY. Never runtime-import reader, assembler, bootstrap, publisher, `report.ts` or `historical-reference.ts` into the ledger/measurement module. Named imports do not isolate a mixed module's fs dependencies. The verifier callable is an explicitly trusted injected dependency, normally supplied by the existing preparation factory outside this core; input validation is not cryptographic authentication of an arbitrary injected function.

Fifth option has exactly one enumerable own data field with a callable value; no hidden/symbol/accessor/undefined/nonplain fields. Capture once before replay. It requires valid fourth reportOptions; undefined fifth option preserves old behavior. Return no new caller-configurable metrics, paths, receipts, hashes, comparator or runtime counters.

## Pure Measurement Contract

Capture unknown report recursively through plain/null-prototype objects and dense ordinary arrays with enumerable own data descriptors only. Reject accessors, symbols, hidden fields, foreign prototypes, holes, extra array keys, present undefined, cycles and non-JSON values before any getter/coercion/stringification. Bound capture to depth32,20000 nodes,256 elements per array and4096 code units per string; canonical reports have at most60 cases. Parse the owned copy with the existing report schema, then recursively compare own key sets, optional presence and values between the captured tree and parsed output (order-independent). Reject schema-stripped unknown fields or normalized/coerced values rather than silently accepting them. Require calibration metadata, complete safeErrors/latencyCoverage, cached:false and unique case/sample pairs. Never freeze or retain caller objects; deep-freeze only the owned report/output. All failures are fresh causeless `calibration:report-measurements-invalid`, without examining foreign exceptions.

Recompute `aggregateNutritionResults(owned.cases)` with the unchanged pure scorer. The scorer does NOT calculate latency: separately calculate the existing report.ts latencySummary semantics from finite measured case latencies (sorted, linear interpolation at index p*(n-1), p=0.5/0.9, min/max; absent on empty population). Compare every recomputed summary field, including optional-field presence and this separately calculated latency, with the owned report summary; reject disagreement rather than trusting a schema-valid forged summary. Preserve legacy aggregate semantics; do not modify scorer.ts or import report.ts. Exact report-stage populations and source identity are checked by ledger/source-bound verifier, not guessed from caller report labels.

Profile mapping is unsafeCount=summary.unsafeCompletionCount, parseCount=summary.parseCases, catastrophicCount=summary.catastrophicCount, meanZeroSafeMacroError=summary.meanZeroSafeMacroRelativeError, medianKcalError=summary.medianRelativeCalorieError, p90AnalysisLatencyMs=summary.latencyMs?.p90. Missing optional metrics remain absent, not0. For zero parses existing ranking treats downstream metrics as Infinity.

Stage mapping copies totalCases/runCases/parseCases, counts, calorie/macro/mass/density summaries and measured P90. failureCount is the number of non-success predictions. totalOutcomes is owned.cases.length. Compute meal-only macro medians through the moved existing helper; count source populations from cases rather than trusting caller totals. Explicit latency coverage is measured finite latency count vs all outcomes. Ordinary provider/dataset/product failures may carry finite latency; interruptions do not. Do not add a new 100% latency-coverage threshold to the frozen protocol: existing percentile/undefined semantics remain unchanged, while coverage is retained for truthful reporting.

No report-derived `visionCallCount`, `suppliedBarcodeImageCallCount`, `suppliedBarcodeVisionCallCount` or `suppliedBarcodeLiveOffCallCount`: these remain absent. The existing benchmark policy still requires them; this plan does not fabricate0. Preserve36 complete meal diagnostics versus33 eligible carbohydrate-density outcomes (one zero-carb case repeated3), and zero-truth absolute metrics.

## Stream, Admission and Replay Contract

Authoritative header is the existing closed protocol_identity event with exactly one extra field:

```ts
{ type: 'protocol_identity', identity, at,
  reportAuthority: 'verified_artifacts_v1' }
```

Write this header through existing append/file-fsync/dir-fsync during acquireLock only for an empty event/journal stream. Opt-out accepts only old closed3-field headers and refuses the new marker with `calibration:report-authority-mode-mismatch`. Opt-in requires the closed4-field marker for every nonempty stream; old headers, altered marker, unknown fields or nonempty journals with no header fail closed. No legacy-stream migration is authorized.

Receipt event has exactly3 outer fields and a closed5-field nested receipt:

```ts
{ type: 'artifact_receipt_admitted', receipt: {
  stage, profile, runId, jsonSha256, markdownSha256,
}, at }
```

Both hashes are lowercase64hex; enums exact; runId nonblank canonical expected report ID; at canonical millisecond UTC. Capture all fields via descriptors. No absolute path, owner record, report body, provider text or alternate snapshot in events. Persist through existing strict event append/fsync/dir-fsync; grant admission/seal in memory only after success. Persistence ambiguity poisons the instance and retains lock.

Admission requires lock, authoritative mode and valid primitive enums before snapshot reflection/effects. Obtain a fresh owned snapshot through the ledger's PRIVATE snapshot implementation, not any caller read hook. Invoke the captured synchronous trusted verifier with frozen stage/profile/snapshot. Descriptor-capture the exact2-field returned report/receipt envelope; own/measure report and closed-capture receipt. Require stage/profile/runId agreement and report identity to match ledger implementation/model/project/location/prompt/schema, stage counts and selected profile where applicable. Verifier owns source/manifests and checks both actual canonical files; no core renderer/hash shortcut replaces it.

On repeated admission, invoke verifier again first; identical receipt returns a newly owned frozen receipt with zero extra event/clock/fsync calls. Differing receipt identity/hashes poisons with `calibration:artifact-receipt-conflict`. Any verifier throw, promise/thenable/malformed return or report/receipt mismatch poisons with fresh causeless `calibration:artifact-verification-failed`; do not inspect foreign message/cause/stack. An incomplete/malformed snapshot fails without a durable admission. Under-lock refresh failures retain the existing fresh `calibration:ledger-poisoned` behavior.

Seal each admitted stage/profile against reservations, journal append, image completion and nonreservation results, both runtime and replay. Check the seal before effects. Failed/incomplete attempts do not establish a seal. An admission requires the complete canonical report, so pending reservations cannot be hidden by sealing. Keep other stage/profile pairs usable when existing stage-order checks allow them.

Guard the callback/result-capture/measurement phase against every reentrant PUBLIC ledger call, including read APIs, releaseLock, admission and recovery. Nested access poisons before effects and returns `calibration:reentrant-call`; a callback swallowing that failure still cannot cause an outer successful admission. Internal private snapshot/replay routines bypass only this public-call guard, not poison checks.

Constructor preserves its existing journal/event reads but performs zero artifact-verifier calls. In authoritative mode it captures provisional receipt identities/seals and validates stream chronology only; these are not verified reports or passing gates. Until successful current-owner acquisition/replay, public selected-profile/completed-stage/report-prediction/snapshot/rebuild/transition authority APIs fail with `calibration:artifact-authority-lock-required`. Counts may remain diagnostic, not admission evidence. All source-changing actions still require lock.

Under-lock refresh clears ALL provisional/verified receipt and measurement state with existing replay state. At each receipt event in chronological replay, obtain the replay-time authoritative snapshot and reverify actual files with the current-owner verifier before adding verified receipt/report/seal. This precedes every replayed selection/completion dependent on it. Rebind by preparing a new verifier outside the core for the new owner; receipt bytes contain no old owner and must remain byte-identical. Duplicate receipt events are malformed, even though repeated API admission is idempotent. No constructor-cached receipt, external receipt object or stale verified report survives refresh as authority.

## Measured Decision Contract

Use existing selectCalibrationProfile and evaluateCalibrationStageGate as the single ranking/threshold implementations. Refactor selection's branch body minimally into one private `{profile,reason}` helper; the existing exported selector returns its profile. Preserve exact numeric ties/Infinity handling, all seven reasons and the original validation-error precedence (all required count checks in their original order, then optional metrics in their original order), with MEDIUM full-tie behavior. Add simultaneous-invalid-input regression cases to the new test instead of modifying the old test. Do not duplicate the ranking in the measurement module.

- Preflight completion requires verified LOW and MEDIUM receipts, each1/1 success with0 unsafe/failures, token-count terminal success and existing pinned-model/readiness checks. The generic pure stage evaluator remains preflight-not-defined; explicit Stage0 validation is separate.
- Development selection requires both verified24-outcome reports. Reverify both actual artifact pairs against current authoritative snapshots before live selection/idempotent selection. Compare caller profile and reason to the measured winner/reason EXACTLY; require the measured winner's development gate passes. A worse but passing profile cannot substitute for a failing measured winner. Then persist selection through existing durability; expand keys/plans only after success.
- Development completion requires that exact selected winner, both receipts and its passing measured gate. Validation completion requires its selected-profile48-outcome receipt and passing existing validation gate, including diagnostics on every parsed meal, not48/48 when parses46/48.
- Reverify required report pairs before runtime completion, including an otherwise idempotent completion; existing passed:true and exact predecessor summary remain syntactically required for backward API compatibility but cannot override a measured failure. Replay derives the same decisions from verified receipts before accepting selected/completed events.
- Benchmark admission is allowed after validation with a complete60-outcome canonical report. Authoritative benchmark completion ALWAYS fails `calibration:benchmark-runtime-evidence-required` before event/clock/persistence, even if nutrients pass. Do not add a runtime-evidence parameter or comparator to this plan. Future controller work must separately specify and verify network-isolation evidence and supported historical comparisons before removing this block. Old opt-out benchmark behavior is unchanged.

New static runtime errors additionally include `calibration:report-authority-mode-required`, `calibration:report-authority-options-invalid`, `calibration:artifact-receipt-required`, `calibration:stage-profile-sealed`, `calibration:artifact-selection-mismatch` and `calibration:artifact-gate-failed`. Unknown fields/replay-order violations fail closed through the existing strict malformed/out-of-order framework. Gate failures never append a passing stage or select another profile; no production promotion claim follows any offline pass.

## Task 1: Add the pure report measurement bridge

Execution ruling (2026-10-10): checkpoint the compile-clean preliminary test scaffold and tracking after worker recovery, before the remaining discriminating controls. The plan allows multiple bounded commits per task; this preserves unfinished work without native host test/source edits. Cost if wrong: this feature branch intentionally contains missing-module RED tests and known test-specification gaps until the source checkpoint. This does not check off Step1/2, freeze tests, authorize source work, replace CODE review, or mark Task1 complete. Functional contracts remain unchanged from approved plan87c65b48; Task1BASE remains e43e8ef.

**Files:** new measurement source/test and test-only fixture, modified ledger imports/re-exports/types only, plan/status.

**Consumes:** existing NutritionEvalReportSchema and aggregateNutritionResults; existing aggregateCalibrationMealMetrics behavior. **Produces:** interfaces above; no fifth option or receipt events yet.

- [x] **Step 1: Draft new tests and fixture support through ordinary workers.** Shared test-only fixture exports `makeMeasuredReport({stage,profile,scenario})` where stage is StageName, profile is LOW/MEDIUM, scenario is `exact | provider_failure | interruption | zero_truth | missing_diagnostic`; it builds genuinely scored cases from committed calibration/public source populations using scoreNutritionCase and buildNutritionEvalReport, matching existing assembly-test setup. No fetched images. Clone only test-owned data for mutation cases. Include this representative assertion:

```ts
const report = await makeMeasuredReport({stage: 'development', profile: 'LOW', scenario: 'exact'});
const measured = measureCalibrationStageReport(report);
expect(measured.profile.parseCount).toBe(24);
expect(measured.stage.totalOutcomes).toBe(24);
expect(measured.latency).toEqual({measuredCases: 24, missingCases: 0});
expect(measured.stage.suppliedBarcodeLiveOffCallCount).toBeUndefined();
expect(Object.isFrozen(measured.report.cases)).toBe(true);
```

Test all summary mapping/optional-field absence, exact zero-safe/legacy ratios, zero-truth pairs, validation46parsed coverage, meal-only benchmark medians,33/36 density distinction, ordinary failure latency vs interrupted missing latency, empty/no-parse missing metrics, forged summary rejection, duplicate samples, calibration/cached identity, descriptor/cycle/array faults and repeat fresh static errors with zero getter/coercion/foreign-error accesses. Preserve original caller mutability. Import-graph test traverses relative runtime imports, treating import type as erased, and rejects fs/provider/bootstrap/reader/publication/report/historical dependencies in the new pure module. Existing scorer/schema/fatal dependencies are permitted.
- [x] **Step 2: Independently run and accept RED.** `cd functions && npx vitest run test/nutrition-eval/calibration-report-measurements.test.ts test/nutrition-eval/calibration.test.ts --maxWorkers=1 --minWorkers=1`. Missing new measurement exports/module must be the only deliberate new failure; existing ledger suite must pass. Run direct changed-test ESLint, then freeze new test/fixture and all protected-source/test hashes before source edits.

Step1–2 receipt (2026-10-11): final52 new tests, host focused RED58049 exit1 with43 missing-module-only failures and247passes=238 existing ledger+9 fixture controls;290total/10.80s. Final two-file strict noEmit and direct ESLint73348 exit0. Frozen test23188683ac7bc13f6e8b8608a219276837a20f0ad6509ca6ad6e4913ffeed279 and helperb1d99973a9a9db3d0e7f2f5ab709c0620c58513e200c923f2761b7d8f1897a09; protected old source/test SHA check0/config unchanged. Source-only patch scope independently permits the exact2 source targets and rejects frozen tests, traversal and moves with zero writes. Saving this deliberate RED checkpoint does not grant CODE approval, complete Task1 or qualify accuracy/production. Next Step3 source-only implementation.
- [x] **Step 3: Source-only worker implements the bridge.** Move the exact existing meal helper/type and its private math helpers from calibration.ts into the new pure module, re-export it from calibration.ts, and move shared metric interfaces without changing shapes. Implement owned capture/measure/freeze with unchanged scorer aggregation and mapping. Use this dependency shape:

```ts
import { NutritionEvalReportSchema } from './schema';
import { aggregateNutritionResults } from './scorer';
import { CalibrationFatalError } from './fatal-error';
import type { NutritionEvalReport, NutritionCaseResult } from './schema';
// calibration.ts re-exports aggregateCalibrationMealMetrics and imports metric types.
```

No refactor of ranking, thresholds, schema/scorer, existing tests, fixtures or canonical renderer bytes. Source worker cannot rewrite frozen new tests.
- [x] **Step 4: Verify and review.** Run Task1 focused GREEN, all existing nutrition-eval tests serially, Functions build/lint/full serial suite. Compare protected old digest pairs and config SHA. Obtain exact MCP CODE green for this helper checkpoint; no stronger receipt/gate claim. Update this plan/status with actual counts, command exits, hashes and next task.

Corrective TDD receipt (2026-10-11): initial source focused1fail/289pass exposed a test matcher leak, while native probe confirmed an uncovered array-key identity defect. Primary3.8 corrected FIX-PLAN agrees/no must-fix in calorix-measurement-capture-boundary-20261011; it is not CODE approval. Ruling: equivalent boolean hostile-error identity assertion plus five ordinary-worker authored regressions/positive controls may augment the frozen NEW test, preserving all old tests/assertions. Cost if wrong: re-freeze/review overhead and five maintenance cases, not weakened capture. Reflected-key corrective RED4fail/291pass295, then source-only exact key-set fix yields295/295focused GREEN/14.22s; no canonical-order restriction. Latest test6ecaa697403e8cb343fcda3ad68d8f39a67b192c8b21c216e5b2f6c3f6bd0f02/helperb1d99973a9a9db3d0e7f2f5ab709c0620c58513e200c923f2761b7d8f1897a09 refrozen before sourcefix, module91663686777a6287f3acbf757cff1350e92b9c24ef2d05450130b0d73e2797e9, ledger389fe490afbaf8109e32bb159dac6a42d0448cd2952daf07d3ac098b90a49b38. All57ledger functions and5moved helpers/3interfaces text-preserved; at this corrective checkpoint broader verification/CODE/postcommit were still pending. Subsequent build/lint/nutrition/full recovery and exact CODE greens are recorded in status and Current Task below; postcommit full is the remaining Task1 gate.
- [x] **Step 5: Commit/push and verify the checkpoint.** Stage only Task1 allowed files plus tracking, normal commit `Add measured calibration report bridge`, push origin branch, verify live remote equality. Run postcommit serial full Functions suite before marking Task1 complete. Keep Task2 incomplete and the bridge unused.

Task1 closure receipt (2026-10-11): source checkpoint e68eb6f5ac7eb8c4ae8556e4660b752e15a3df22 normalcommit0/push0/live-originexact; exact primary3.8 CODE agree/MUST_FIXnone/SHOULD_FIXnone in calorix-calibration-measurement-bridge-code-20261011. Postcommit TaskDone66193 exit0,46files2624passed/1existing public-manifest skip2625,948.17s; owned ledger records actual completion e43e8ef..e68eb6f. Protected/frozen/config checks remain unchanged. Bridge is unused, Task2 still unimplemented; no live/accuracy/readiness approval.

## Task 2: Bind durable artifact admission and measured transitions

Execution override (2026-10-12 Europe/Zurich): the user explicitly approved a one-time direct host-edit exception for the remaining tests and implementation in this workstream. Only worker routing is overridden; all functional, frozen-test, verification, review, commit/push and scope gates below remain binding.

Execution ruling (2026-10-11): checkpoint the compile-clean preliminary foundation and tracking after genuine2fixture controls GREEN and295Task1 regressions/static checks GREEN, before remaining reviewed test-contract corrections/coverage. The contract requires bounded durable checkpoints and permits multiple commits per task. Cost if wrong: the feature branch temporarily contains unfinished/unaccepted new tests with missing-feature behavior and known assertion gaps; this does not complete Step1, accept final RED, freeze tests, authorize source, grant CODE approval or qualify readiness. Task2BASE remains3a2a436; functional contracts unchanged.

**Files:** modified ledger source; new authoritative test; shared new test fixture additions; plan/status. Measurement module may receive reviewed corrections only if a genuine test-first defect is demonstrated; preserve Task1 interfaces and all protected old files.

**Consumes:** measureCalibrationStageReport, existing native prepared verifier, strict journal snapshots/durability. **Produces:** trailing fifth option, admission API/mode marker/seals and measured Stage0–2 authority; benchmark remains blocked.

- [x] **Step 1: Write opt-in RED tests through ordinary workers.** Fixture support exports `makeAuthoritativeFixture()` with `ledger`, deterministic `owner`, `publish(stage,profile)`, `finishPreflight()`, `finishDevelopment(profile,scenario)`, `finishValidation(profile,scenario)`, `finishBenchmark(profile,scenario)`, `reopen(newOwner)`, `receiptEvents()` returning only artifact_receipt_admitted events, owned effect counters and `cleanup()`. These helpers return Promise<void> except reopen (new fixture), receiptEvents (owned event array) and cleanup (void). Stage finish helpers only record genuine scored journal/nonreservation data through existing APIs: they do NOT select profiles or complete stages. Publication uses existing publisher under the held lock and the injected verifier is genuine existing prepared native reader. `reopen` preserves bytes, prepares the verifier for newOwner and supplies exact source identity. New fixture code must not import other test files or invoke providers. Use disk-backed TMPDIR and remove only its own directories in finally/afterAll.

```ts
const f = await makeAuthoritativeFixture();
await f.finishPreflight();
await f.publish('preflight', 'LOW');
await f.publish('preflight', 'MEDIUM');
const low = f.ledger.admitStageReportReceipt('preflight', 'LOW');
expect(low.profile).toBe('LOW');
expect(f.receiptEvents()).toHaveLength(1);
expect(() => f.ledger.completeStage('preflight', {
  stage: 'preflight', passed: true, completedStages: [],
})).toThrow('calibration:artifact-receipt-required');
f.ledger.admitStageReportReceipt('preflight', 'MEDIUM');
f.ledger.completeStage('preflight', {stage: 'preflight', passed: true, completedStages: []});
expect(f.ledger.getCompletedStages()).toEqual(['preflight']);
```

Cover all five Review Focus classes: exact option capture/missing fourth option; empty-stream marker and append/fsync faults; old3/4arg/preflight compatibility; both downgrade directions; constructor zero artifact calls and provisional-authority guards; successful new-owner replay before any reservation; missing/tampered JSON/Markdown/lock failures; receipt/replay duplicates/conflicts; chronological replay snapshot vs later selectedProfile; zero appends on failed gates; exact selection reasons including total MEDIUM tie and worse passing profile; boundaries one value each side for every frozen development/validation check; ordinary failure coverage and interrupted samples; wrong report identity/population/hashes; postseal runtime/replay reservation/journal/completion/nonreservation attempts; all public reentrant calls and swallowed nested failure; real append/file-fsync/dir-fsync ambiguity poison with lock retained; identical re-admission no new event but actual reread; later artifact drift before idempotent transition; full60 benchmark admission followed by explicit runtime-evidence block with no fabricated counters. Test source/provider/network counters are zero, with imports/dispatch mocks failing if touched. Do not claim full controller146dispatch proof.
- [x] **Step 2: Independently accept RED and freeze.** Run new authoritative test plus measurement, calibration, publication and artifact-reader tests serially. New failures must be only missing opt-in/admission/enforcement behavior; existing controls remain green. Direct new-test/support lint, freeze new test/support hashes and all protected files before source-only implementation.
- [x] **Step 3: Source-only worker implements exact contracts.** Capture fifth option once, enforce marker/header shapes, add owned receipt/maps/seals/provisional-vs-under-lock phases and callback guard. Reuse strict persistence and private snapshots. Extend replay dispatch for receipt events, clear every new map on refresh, and enforce seals before effects. Gate selection/completion through measured reports and existing policies, with the benchmark block. Shared selection helper keeps old exported behavior:

```ts
function selectProfileDecision(low: CalibrationProfileMetrics, medium: CalibrationProfileMetrics):
  {profile: CalibrationProfile; reason: CalibrationProfileSelectionReason} {
  assertValidRequiredCount(low.unsafeCount, 'low.unsafeCount');
  assertValidRequiredCount(medium.unsafeCount, 'medium.unsafeCount');
  assertValidRequiredCount(low.parseCount, 'low.parseCount');
  assertValidRequiredCount(medium.parseCount, 'medium.parseCount');
  assertValidRequiredCount(low.catastrophicCount, 'low.catastrophicCount');
  assertValidRequiredCount(medium.catastrophicCount, 'medium.catastrophicCount');
  assertValidOptionalMetric(low.meanZeroSafeMacroError, 'low.meanZeroSafeMacroError');
  assertValidOptionalMetric(medium.meanZeroSafeMacroError, 'medium.meanZeroSafeMacroError');
  assertValidOptionalMetric(low.medianKcalError, 'low.medianKcalError');
  assertValidOptionalMetric(medium.medianKcalError, 'medium.medianKcalError');
  assertValidOptionalMetric(low.p90AnalysisLatencyMs, 'low.p90AnalysisLatencyMs');
  assertValidOptionalMetric(medium.p90AnalysisLatencyMs, 'medium.p90AnalysisLatencyMs');
  if (low.unsafeCount !== medium.unsafeCount) return {
    profile: low.unsafeCount < medium.unsafeCount ? 'LOW' : 'MEDIUM', reason: 'fewer_unsafe'};
  if (low.parseCount !== medium.parseCount) return {
    profile: low.parseCount > medium.parseCount ? 'LOW' : 'MEDIUM', reason: 'higher_parse'};
  if (low.catastrophicCount !== medium.catastrophicCount) return {
    profile: low.catastrophicCount < medium.catastrophicCount ? 'LOW' : 'MEDIUM', reason: 'fewer_catastrophic'};
  const pairs = [
    [effectiveDownstreamMetric(low.meanZeroSafeMacroError, low.parseCount),
      effectiveDownstreamMetric(medium.meanZeroSafeMacroError, medium.parseCount), 'lower_macro_error'],
    [effectiveDownstreamMetric(low.medianKcalError, low.parseCount),
      effectiveDownstreamMetric(medium.medianKcalError, medium.parseCount), 'lower_kcal_error'],
    [effectiveDownstreamMetric(low.p90AnalysisLatencyMs, low.parseCount),
      effectiveDownstreamMetric(medium.p90AnalysisLatencyMs, medium.parseCount), 'lower_latency'],
  ] as const;
  for (const [a, b, reason] of pairs) {
    if (a !== b) return {profile: a < b ? 'LOW' : 'MEDIUM', reason};
  }
  return {profile: 'MEDIUM', reason: 'default_medium_tie_breaker'};
}
export function selectCalibrationProfile(low: CalibrationProfileMetrics, medium: CalibrationProfileMetrics): CalibrationProfile {
  return selectProfileDecision(low, medium).profile;
}
```

This code block specifies a refactor of the existing exact branch body, not permission for a second ranking implementation. Callback invocation uses a frozen PRIVATE snapshot and catches foreign throws without examining them; reentry poison survives swallowed errors. New authoritative mode is not wired into any session/CLI/default.
- [x] **Step 4: Verify and review the complete plan.** Focused new/existing suites GREEN, Functions build/lint, full serial suite, protected byte/digest/config checks and scoped whitespace/privacy scans. Fresh strongest available read-only native whole-plan reviewer plus exact Antigravity MCP CODE green required. Review final hashes, entire new import graph, all runtime/replay branches and real disk fault evidence. Fix must-fixes test-first and rerun affected/full verification; do not count empty/noisy review or worker self-report as green.
- [x] **Step 5: Commit/push, postcommit verify and close.** Stage only authorized Task2 source/tests/plan/status; normal commit `Bind calibration gates to verified reports`; push and prove live origin equality. Run postcommit full serial suite before marking Task2 complete. Record exact next task: controller-bound runtime isolation/historical comparison evidence and remaining Task7 CLI/hermetic protocol before any live calibration. Persist all review rulings/minors, then recoverably clean only this completed plan's task-owned scratch after work stops; keep branch/checkout/config.

## Verification and Scope Receipts

Witnessed frozen-new-test exception (2026-10-12): first source verification exposed an impossible native unsafe winner row before journal admission. All locked development cases are meals; the protected codec requires needs_review, so no admitted native DEV prediction can satisfy the scorer's complete-dependent unsafe branches. Corrected primary3.8 PLAN review in calorix-native-unsafe-reason-20261012 agrees/MUST_FIX none. Keep six genuine native winner reasons, replace only this invalid NEW row with native rejection and three pure unsafe-priority tests, and strengthen false-fewer_unsafe reason rejection. Do not change codec, manifests, helper, selector policy or thresholds. Cost: fewer_unsafe is pure policy coverage, not seventh native population coverage. Focused51250 exit0/5pass207filtered212/23.50s; re-frozen newtest764a9cdf, helperf7 unchanged. Original209 RED proof retained; full GREEN/CODE/wholeplan gates remain open.

At execution start record branch/HEAD, Task BASE, intended focused command and protected hashes in status. Logs/TMPDIR belong to a new ext4 workspace, never shared /tmp. Run serial commands separately, retain real exit codes and counts:

```bash
cd /home/agent-runner/projects/calorix/functions
npx vitest run test/nutrition-eval/calibration-report-measurements.test.ts test/nutrition-eval/calibration-authoritative-reports.test.ts test/nutrition-eval/calibration.test.ts test/nutrition-eval/calibration-report-publication.test.ts test/nutrition-eval/calibration-report-artifact-verification.test.ts --maxWorkers=1 --minWorkers=1
npx vitest run test/nutrition-eval --maxWorkers=1 --minWorkers=1
npm run build
npm run lint
npx vitest run --maxWorkers=1 --minWorkers=1
```

No full `test:verify`/Firebase emulator, Flutter/Android/APK/UI/live checks in this unused offline-only slice; intentional scope reason must be recorded, not reported as passed. Parent full controller/live gates remain open. Required native whole-plan review is read-only; external review primary3.8, fallback3.7 then3.6 only after exact timestamped failures. Every prompt forbids edits/write commands/repository mutation; inspect git status/protected SHA after calls.

Final reporting includes checkpoint SHA/push equality, new/old focused and full counts, skip/blocker/error summaries, reviewer models/conversations, no nutrition run IDs/routes/visual diffs (`N/A`), and no visual inspection or calorie-accuracy/production/security approval. No new2.5calls and no default/deploy changes. Benchmark network-isolation gate is deliberately unresolved, not a passing inference.

## Research and Handoff

- Completed cleanup receipt (2026-10-12): source679 verified/pushed; completion-notes b738dcd827b644215b164208f53477381d8e58ca normalcommit/push/liveorigin exact, no source/test changes. ONLY445MiB owned plan scratch moved to recoverableTrash after alljobs ended and all32rulings/costs were collected/durablehere. Repo/branch/checkout/user.mcp9c preserved; no sibling/sharedtmp/cache/worktree cleanup or merge/PR. CurrentTask none forthiscompleted prerequisite; nextnewcontroller/runtime/historical/CLI-hermetic workstream follows normalediting policy, BEFORElive/default/production/security/accuracy approval.

- Task2COMPLETE (2026-10-12T15:00:07Z): source679ca10ac20c841a9de203d6da25e6a3ae705852 normalcommit/push/liveorigin exact; REQUIREDpostcommit task-done80651 actual0/47files2843pass1existing skip2844total/3880.98s, JSONsuccess true, ledgerBASE3a2..679. Allprecommitphases0/five838/nutrition2448pass1skip/full2843pass1skip; sourcea4fe/test743a/helperf7/config9c unchanged. ONE native Important fixed RED6→GREEN7/fullpre+postgreen, no Critical/Minor/secondreview. CoreCODEfinal3.6 after two300s timeouts; correction/unsafe-test/finalresult primary3.8 green, exact bounded scopes/no production/security/accuracy/visual approval.32rulings/costs below durable; no newskip/timeouts/default changes. Trackingclosurecommit/push then recoverable owned-scratch cleanup; approved branch/checkout/config preserved. Next controller-bound runtime isolation/historicalcomparison and remaining parentTask7CLI/hermetic protocol BEFORElivecalibration; benchmark stillblocked. One-time host-edit exception closes with this workstream; no permanent routing-policy change.

- Source checkpoint679ca10ac20c841a9de203d6da25e6a3ae705852 normal4file commit/push/liveorigin exact (2026-10-12T13:52:44Z), sourcea4fe/test743a/helperf7/config9c. Step4complete/Step5open/Task2NOTcomplete until execution task-done postcommitfull passes. Earlier final47suite2843pass1existing skip2844total/focused838/nutrition2448pass1skip all0 and recordedCODE/finalresult reviews green. Normaltracking closure commit follows actualpostcommitresult; parent runtime/historical/CLI-hermetic/live/default/security/production/accuracy gates stayopen.

- Final result consultation primary3.8 (2026-10-12T13:51:07Z), calorix-authoritative-final-results-20261012: agree/MUST_FIXnone/SHOULD_FIXnone/QUESTIONSnone on recordedCODE/TDD/serialresults. No independent tests/visualinspection/security/production/accuracy approval. Step4complete; Step5 normal4file checkpoint/push/liveorigin proof then REQUIREDpostcommitfull beforeTask2complete. Finalsourcea4fe/test743a/helperf7/32rulings unchanged; parent runtime/historical/CLI-hermetic/live gates remainopen.

- Final fixed-source15502 verification collected (2026-10-12): all7serial phases actual0; strictTSC/changedESLint/build/fullESLint0, fivefiles838pass0skip1610.78s, nutrition34files2448pass1existing skip2449total1388.64s, full47files2843pass1existing skip2844total1256.15s. Sourcea4fe/test743a/helperf7;96protectedactual0/scopedprivacy+whitespace0. ONE finalnative Important fixed by7newtests RED6→GREEN7/wholefullgreen, no minors/second native review. CoreCODEfinal3.6/fixCODEprimary3.8 green; finalresultprimary3.8 pending. Step4–5/Task2 completion await collected final review, normalcommitpush/liveorigin and postcommitfull; parent runtime/live/default/accuracy/production/security remains unapproved.

### Final review rulings

Earlier execution rulings, carried forward chronologically so cleanup cannot erase them:

1. Keep the approved existing checkout rather than create a worktree. Cost if wrong: shared checkout risk, mitigated by scope and protected hashes.
2. Retain the then-active Muse worker until delivery or an actual policy violation. Cost: a later owned stop/correction could be needed; no completed work discarded preemptively.
3. Cooperative edit-deny metadata plus unavailable native-edit canary/audits is not an OS sandbox. Cost: an unexpected scoped write needs review/correction.
4. Checkpoint preliminary compile-clean Task1 tests before full coverage/freeze. Cost: the branch temporarily contains unfinished RED tests, not completion.
5. Augment only frozen NEW Task1 tests for witnessed array-boundary/matcher defects. Cost: five additional tests and explicit re-freeze/review overhead.
6. Validate bounded array-key sets, not reflection order. Cost: small Set allocation and acceptance of valid reordered reflections.
7. Checkpoint preliminary Task2 foundation before full coverage. Cost: temporarily unfinished/unaccepted new tests; source stays closed until final RED.
8. Use configured TMPDIR or ignored disk-backed fallback for tests. Cost: arbitrary external TMPDIR backing still requires verification, and fallback cleanup must stay scoped.
9. Preserve meaningful configured-path whitespace and original environment bytes. Cost: unusual present-undefined environment behavior needs separate reproduction.
10. Cleanup only exact native-created children under the known parent, never broad includes matching. Cost: a novel temp strategy can escape observation until tested.
11. Permit extra safe verifier rereads; use actual chronological traces instead of invented1/4call caps. Cost: redundant I/O may pass, while constructor0 remains strict.
12. Continue bounded unaccepted new-test corrections after supplemental MCP timeouts only within the already approved functional plan. Cost: draft/review overhead; no approval inferred from failure.
13. Return owned mutable trace copies while retaining internally immutable scalar entries. Cost: callers can alter their copies, not internal history.
14. Stop only the verified task-owned unresponsive worker after12minutes and advance the next allowed route. Cost: lose delayed generation/warmed context, not repository work or quota evidence.
15. Correct only the NEW duplicate-replay test body to catch constructor-phase malformed rejection. Cost: one documented prefix-audit exception.
16. Count identical raw journal occurrences only for admitted pair/hash; preserve two distinct crash journals. Cost: identical raw duplicates are intentionally rejected, not literal chronology proven.
17. Decline needless full-buffer slicing/parse suppression and cosmetic probe rebinding. Cost: future seam drift fails targeting controls openly; optional readability unchanged.
18. Replace the impossible native unsafe winner row with native rejection and pure policy coverage. Cost: six native DEV winner reasons, not seven.

The single fresh whole-plan reviewer considered and set aside these behaviors. The host accepts each under the approved boundary; these are not silently dropped requirements. No deferred minors were found.

1. Trusted injected verifier honesty remains a dependency, not authentication. Cost if wrong: a dishonest trusted adapter can lie; core capture is not a security boundary against that adapter.
2. Adversarial filesystem replacement outside cooperative locking remains excluded. Cost: no tamper-proof or security guarantee; a separate threat-model workstream would be needed.
3. Constructor journal/event reads remain permitted; only artifact callbacks must be zero. Cost: construction can still incur disk I/O.
4. Diagnostic counts and pinned-version reads before acquisition remain non-authoritative. Cost: consumers must not reinterpret diagnostics as report/stage approval.
5. Extra safe native rereads remain allowed. Cost: redundant I/O can pass; no exact-call performance budget was approved.
6. Identical journal duplicates are rejected only for admitted pair/hash; distinct crash journals remain valid. Cost: separate streams do not prove literal write chronology or tamper resistance.
7. Native fewer_unsafe winner coverage is impossible for protected meal-only DEV data; pure policy and native rejection replace that invalid row. Cost: this branch lacks native DEV population coverage.
8. Constructor-phase duplicate rejection remains the correct new-test discriminator. Cost: one explicitly documented frozen-new-test correction.
9. No new100% latency-coverage requirement is introduced. Cost: missing latency remains undefined rather than a fabricated zero; existing gate policy is unchanged.
10. Reordered proxy keys and shared acyclic references remain valid captured inputs. Cost: bounded ownership checks accept these shapes, not canonical reflection order or unique object identities.
11. Benchmark runtime isolation and historical comparison remain deferred with completion blocked. Cost: this prerequisite alone cannot complete calibration or enable live promotion.
12. Injected persistence counters and SDK/fetch guards cover only their documented seams. Cost: no universal I/O, transport or controller-dispatch proof.
13. Worker routing/checkpoint/cooperative-edit evidence is not an OS sandbox. Cost: policy compliance requires audits, not an isolation guarantee.
14. Accuracy/live/controller/production/security approvals remain outside this review. Cost: offline green cannot justify those approvals; parent gates stay open.

- Final whole-plan native review (2026-10-12): Critical0/Important1/Minor0. Transition assertion still trusts caller summary after lock acquisition, without own completion/fresh report checks. ONE TDD fix pass appends7new regression tests, then opt-in internal completedStages check and measuredStageGate(from) after existing shape/adjacency validation, preserving opt-out. Primary3.8 transition PLAN agree/MUSTnone; source0f5a remains until actualRED. Previous nutrition2441pass1skip/full2836pass1skip exits0 retained, not final fix proof. All14 review exclusions require explicit host rulings; broader/sourceCODE/postcommit gates remain open, no second native reviewer.

- Step3 source implementation verified (2026-10-12): source0f5a3220/newtest764a9cdf/helperf7, five-file85141 exit0/831pass0fail0skip/1063.66s/all619 protected pass; strict types0, changed lint0, build0 and full lint0. Source CODE final3.6 agrees/MUSTnone after primary3.8/fallback3.7 exact300s timeouts; witnessed narrow unsafe-test correction CODEprimary3.8 separately green.16278 nutrition/full serial verification active; ONE strongest fresh read-only wholeplan reviewer inspecting exact seven paths/fixed e43BASE plus current source/test delta. Step4–5 remain open, no Task2 completion/production/security/accuracy/controller/live/default claim.

- Bounded new29-test tail CODE accepted (2026-10-12): corrected fallback3.7 in calorix-authoritative-final-test-draft-code-20261012 agrees/MUST_FIXnone/SHOULD_FIXnone/QUESTIONSnone after primary3.8 MCP300s timeout. Corrected scope/counter claims and rejected unneeded decoder/constructor style rewrites; unchanged testafd209total/24selected native controls185filtered/typeslint0. ONLY new TESTTAIL, not future source behavior/fullStep1/finalRED/freeze/feature/readiness/security/accuracy. Exact209 five-file RED rerun pending after protected reader uninstrumented pass59.506s with unchanged60s timeout; previous205full RED824 rejected due one protected timeout. Source still unchanged/closed, task remains incomplete.

- Narrow replay-journal integrity clarification (2026-10-12): corrected fallback3.7 in calorix-authoritative-journal-replay-seal-20261012 agrees/MUST_FIXnone/SHOULD_FIXnone/QUESTIONSnone after primary authentication failure and two noisy responses. Identical raw-row counts scoped to admitted pair/hash reconcile the approved replay seal without pretending separate journal/ledger arrays encode journal chronology. Two DISTINCT legitimate crash-window/interruption journals remain accepted even for an admitted report. Constructor0artifact calls, under-lock failure poisons and RETAINS lock, maps reset; no new fields/background/recovery behavior. Four planned native witnesses remain unimplemented and are required before accepting/finally freezing Step1; this is PLAN only, not CODE/feature/production/security approval. Original draft five-file RED824 has one protected reader60000ms timeout, so source/freeze still closed.

- Incomplete receipt/replay checkpoint pushed:805b27d41ad3ce96715e1d0271338707376d395b normalcommit0/push0/liveorigin exact (2026-10-11T18:51:54Z),3files only/test7ebf/helperf7/application source unchanged. Subsequent tracking-only handoff records this source/test SHA, not a Task2completion. Quota-held next stage remains last3failure classes; finalfivefileRED/freeze/source/fullverification/wholeplanreview/postcommitTask2 gates open. Allowned jobs closed; no new live/default/device/deploy evidence or claims.

- Bounded receipt/replay CODE accepted (2026-10-11T18:49:45Z): corrected primary3.8 in calorix-authoritative-replay-test-discrimination-20261011 agrees/MUST_FIXnone/SHOULD_FIXnone/QUESTIONSnone. Initial response factualnoise (27not22descriptorrows;4rows/3traptypes;166filterednotnew;futureassertionsnotsource) retained and corrected beforeacceptance. ONLY incomplete test-contract checkpoint7ebf and authorized originalNEWduplicatecase body, no source/wholeStep1/finalRED/freeze/feature/readiness/security/accuracy approval. Verified14native controls/180collected166filtered29.52s,295reg14.32s/typeslint0,11bindingexpectedRED107.94s after7purevalid+4captureinvalid preconditions. FreshQwenprobe403freequota/primarynotauthenticatedcontractmodelabsent/OpenCode userdailyquota/paid100%sessionreset23:59Zurich; no silentpayment/model/config/nativeedit changes. Next boundednormalcheckpoint/push then last3failure classes whenauthorizedworkeravailable; allTask2unchecked/BASE3a2retained.

- Receipt/binding/replay draft checkpoint evidence (2026-10-11): current newtest7ebfd530ed482fc98200780fa240b3b25769d5f8ba8bf2ff8a49d6fc952c8944/helperf7 immutable/source unchanged. Independent96078 strict types0/lint0/14native controls166filtered180/29.52s includes actual populatedjournal/noheader constructor refusal.47203 expected bindingRED1/11fail169filtered180/107.94s after correct pure preconditions; Task1regression0/295passed14.32s. No finalfivefileRED/freeze/source/Step1completion. Fallback3.7 FIX-PLAN agrees/MUST_FIXnone in calorix-authoritative-replay-test-discrimination-20261011 after primary3.8 timeout; latest boundedCODE primary3.8 pending, not approval. One authorized original NEW duplicate-case body correction (constructor-phase malformed, not acquisition-only poison); all other committed122prefix bytes exact by native AST audit. Partial paid micro47458exit1/sessionlimit after guarded edits; literal/usage96150exit0 session100%/week87%, resetOct11 23:59Zurich/Oct13 02:59Zurich, extra-spendcap NOTreported. User-reported OpenCode dailyquota/no retry; readonlyprimarycatalog unauthenticated and only4.7, authorized4.6 absent/no silentmodelchange. Remaining barcode/runtime replay seals, actualheader/receiptfd-dirfsync, refresh/artifactdrift classes still open. No native editing exception/default/provider/live/deploy/accuracy/readiness/security approval.

- Task2 bounded native-verification fixture CODE accepted (2026-10-11T15:45:17Z): fallback3.7 in calorix-native-verification-fixture-code-20261011 agrees/MUST_FIX none/SHOULD_FIX none/QUESTIONS none after primary3.8 MCP300s timeout. Only helperf7 +13exercised controls/newtest1d7 are reviewed;109filteredcases not accepted, no finalRED/freeze/source/Step1completion. Host actual40199types/lint0/13nativecontrols12.78s/295regressions44.25s/protected20AST/config0. Checkpoint then preparedremainingbreadth ordinaryworker. Additional earlier correction consultation failures remain unreviewed, not retroactively approved.

- Task2 native-verification fixture checkpoint evidence (2026-10-11): current newtest1d7d5cdda13c1686410cd85f6724d713dbe0cfb202685135cda50f23529471ec/helperf7bf3b87611f277a4dd827af5d54ce21402eaadfd6b8a3d9cbb38b4f981a03d4;40199 actualexit0/types0/lint0,13nativecontrols passed109filtered122/12.78s,295Task1regressions44.25s. Native trace attempt history now comes from actual prepared verifier; owned scalar return copies/internal immutable entries, direct override bypass/no recursion, genuine same-hook legacy token-count persistence fault after unarmed native acquisition. All20originalfixturefunction bodies unchanged; source/oldtests/config protected. Extra correction FIX-PLAN consultation3.8/3.7/3.6 each timedout300s and is not externally reviewed. Fresh boundedCODE primary3.8 pending in calorix-native-verification-fixture-code-20261011, strictly helper+13controls only. Next incomplete checkpoint then remaining closedcapture/replay/headerfd-fsync/barcode/recovery coverage; no finalRED/freeze/source/Task2Step1completion.

- Task2 bounded native-stage foundation CODE: final fallback3.6 corrected response in calorix-native-stage-fixture-foundation-20261011 agrees/MUST_FIX none/SHOULD_FIX none/QUESTIONS none (2026-10-11T14:26:56Z). Two300s MCP failures and initial unsupported claims recorded separately in status; corrected review only approves test support and18controls as an intermediate checkpoint. All54 feature drafts remain unaccepted, no final RED/freeze/source authorization or Step1 completion. Next ordinary same-session Muse remaining receipt/native-trace/reentry/seal/replay/durability group.

- Task2 native-stage foundation receipt: strict types/lint and all18 genuine native positive/control tests passed in42557 (54 filtered feature drafts,72 total,357.88s);295 Task1 regressions passed in48517/17.70s. Original20 fixture functions remain exact; application source, Task1 test, old tracked files and protected config unchanged. Bounded CODE review in calorix-native-stage-fixture-foundation-20261011 timed out on primary3.8 and fallback3.7 (300s each); final3.6 pending. Next: checkpoint this incomplete foundation, then ordinary Muse receipt/reentry/seal/replay/native-durability tests and approved native-trace/count corrections. No final RED/freeze/source authorization; all Task2 checkboxes stay unchecked.

- Task2 current resume: portable import-phase guard and exact-owned cleanup harness verified12881 (noEmit/lint0,8configured controls7.87s,8unsetTMPDIR15.01s); bounded CODE fallback3.7 agree/MUSTnone after primary3.8 MCP300s timeout in calorix-authoritative-harness-20261011. Next stage/ranking/scenario tests then receipt/reentry/seal/replay/real-durability coverage, independent five-file RED/freeze before source. All Task2 checkboxes remain unchecked, BASE3a2 retained; no live/default/deploy/readiness claim.

- Task2 bounded portability receipt: configured missing-parent test RED1/39skip40/5.71s, immutabletest helper-only fix then eight native controls GREEN/7.18s, Task1295/29512.88s, noEmit/lint0; primary3.8 bounded CODE agree/MUSTnone in calorix-authoritative-fixture-portability-20261011. No application source changes/finalfeatureRED/freeze/Task2 completion. Next portable exact-owned-child observer/import-time guard lifecycle, then full remaining stage/ranking/reentry/seal/replay/fault/benchmark coverage.

- Primary3.8 research timed out after300s; exact failure/time is in status. Fallback3.7 initially agreed but host rejected selective-import fs isolation, blanket failure-latency, zero-carb-case-count and tamper-proof wording, clarified constructor journal reads and mandatory rereverification/mode downgrade rules.
- Corrected3.7 RESEARCH in `calorix-calibration-receipt-gates-20261010` returned `AGREEMENT_STATUS: agree`, `MUST_FIX: none`, `SHOULD_FIX: none` for compatible fifth option, injected verifier, explicit mode marker, under-lock reverification and benchmark fail-closed handling. Research is not exact PLAN/CODE approval.
- Current Task: NONE — Task1 andTask2 COMPLETE on fix/scan-photo-flow-viewer. Source679ca10 pushed/liveorigin exact; postcommit80651 actual0/2843pass1existing skip47files3880.98s, all5Task2stepschecked. Completion-notes b738dcd pushed/liveorigin exact, sourcea4fe/test743a/helperf7/config9c unchanged;445MiB ownedscratch recoveredtoTrash, repository/branch preserved. This finaldoc-only cleanup receipt is thelast bookkeeping step; no merge/PR/worktree removal. NextTask separately scoped controller-bound runtime isolation/historical comparison and remaining parentTask7CLI/hermetic beforelivecalibration undernormalediting policy. Benchmark runtime evidence remains required; no production/default/provider/live/deploy/accuracy/security approval from this unusedoffline prerequisite.
