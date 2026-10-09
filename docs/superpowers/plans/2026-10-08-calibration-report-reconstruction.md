# Calibration Report Admission: Prepared Reconstruction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for this single bounded prerequisite and its ledger. Editing workers follow AGENTS.md strongest-first route; the host owns requirements, verification, review, commits and pushes. The previous publication plan's native application-edit exception has expired.

**Goal:** Prepare an owned, verified source context asynchronously once, then reconstruct source-bound calibration reports synchronously from captured ledger snapshots, without implementing receipt admission or stage gates yet.

**Architecture:** Add a frozen reconstructor factory to the existing assembler module. Move its existing pure snapshot-to-report body into ONE shared synchronous function; the existing asynchronous assembler captures its callback before suspension and delegates through the same prepared source and reconstruction body. A future native read-only artifact verifier can use this seam during synchronous ledger replay without importing I/O into the ledger or trusting a caller report.

**Tech Stack:** Installed TypeScript, Zod, Node crypto, Vitest; no new dependency or executable.

**Spec:** Approved `docs/superpowers/specs/2026-09-23-gemini-38-nutrition-calibration-design.md`, parent `docs/superpowers/plans/2026-09-23-gemini-38-nutrition-calibration.md` Task7Steps4–7. Completed source-bound assembly and publication plans remain complete. This prerequisite does NOT complete receipt/gate binding or parentTask7.

## Global Constraints

- Fixed calibration identity remains Vertex project `calorix-xurschnell`, location `us`, model `gemini-3.8-flash`, API `v1`; zero provider/client/network/device/Firebase/deployment calls. No new2.5 request, fallback, model/default/prompt/schema/scorer/normalizer changes.
- No changes to `calibration.ts`, fourth report option, existing strict3arg/4arg modes, preflight/CLI APIs, file store, report-state codec, publisher, generic writer, ledger receipts/events, gates, selection, recovery, clock or native command wiring.
- Do not add `verifyCalibrationPreflightStateSync`. Reuse unchanged async `verifyCalibrationPreflightState`; its implementation already performs only synchronous pure work, but its Promise API remains intact.
- Actual publication paths remain `CALIBRATION_ROOT`, `.nutrition-eval/calibration/calorix-gemini-38-calibration-v1/`. This pure seam resolves no paths, reads no lock/artifact and creates no directory. Expected hashes are NOT actual artifact proof; native admission and explicit fifth opt-in ledger mode remain future tasks.
- Preserve existing async error codes and snapshot-callback ownership/deferred invocation: `calibration:stage-report-invalid`, `calibration:stage-report-read-failed`, `calibration:stage-report-incomplete`. No foreign message/cause/stack/prototype inspection; no caller-owned freezing.
- Preserve missing latency and source truth semantics; never invent latency, outcomes, gates or measurements. Benchmark source population remains20cases×3, including12 offline barcode outcomes; no new barcode image/OFF request.
- Existing assembler tests92 and publisher tests100 remain byte-identical. Test-first; independent RED/GREEN/focused/build/lint/full serial, native whole-plan review, exact Antigravity PLAN/CODE gates, normal commit/push and postcommit task-done.
- All sizable TMPDIR/log/cache artifacts belong to this plan's ignored workspace on verified ext4. Serial Vitest `--maxWorkers=1 --minWorkers=1`; keep user.mcp SHA9c9622f5dfd38f8eed1ac0d1b69034dc5399e77481600030148547235b06a688 untouched/unstaged. Keep existing feature branch/worktree; no merge/PR.

## Review Focus

1. Caller files/identity/first-case mutation before preparation's first await or after it resolves: the closure must retain only owned source data, never recapture caller data or freeze their objects.
2. A shared-core refactor making both old/new APIs identically wrong: frozen pre-refactor raw-render digests and source-population controls must detect drift, not just compare two calls to the same new code.
3. Reconstructor reuse across stages/profiles and snapshots: per-call maps/results/errors must be independent; no cached snapshot, selected profile or report may contaminate another call.
4. Source/metadata proxies and foreign snapshot failures: descriptor capture must avoid Get/coercion/foreign-error inspection; ignored owner/report/base metadata must not be traversed or retained.
5. Existing async assembler callback mutation/failure and incomplete outcomes: callback captured before suspension, invoked exactly once after preparation; preserve static read-failed/incomplete distinctions and zero ledger/I/O effects.

## File Map and Shared Interfaces

Allowed changes ONLY:

- Modify `functions/src/nutrition-eval/calibration-report-assembly.ts` (currently SHA8e0b6a2819a4b5357d776284bee32e93d77e3152b97e4d3c2dd13809858f3356).
- Create `functions/test/nutrition-eval/calibration-report-reconstructor.test.ts`.
- Create `functions/test/nutrition-eval/fixtures/calibration-report-reconstruction-digests.json` (small public numeric-report digests only, no raw reports/images/provider content).
- Modify this plan and `docs/implementation-status.md`.

New exports in existing assembler:

```ts
export interface ReconstructCalibrationStageReportParams {
  readonly stage: StageName;
  readonly profile: CalibrationProfile;
  readonly snapshot: CalibrationStageReportSnapshot;
}
export interface CalibrationStageReportReconstructor {
  readonly reconstruct: (params: unknown) => NutritionEvalReport;
}
export async function prepareCalibrationStageReportReconstructor(
  context: unknown,
): Promise<Readonly<CalibrationStageReportReconstructor>>;
// Existing export/signature preserved exactly:
export async function assembleCalibrationStageReport(params: unknown): Promise<NutritionEvalReport>;
```

Preparation input has EXACT existing SIX own-enumerable data fields: `baseDir`, `identity`, `owner`, `firstDevelopmentCaseId`, `report`, `files`; reject missing/hidden/symbol/accessor/extra fields and foreign outer prototypes. Capture exact existing15identityfields and all7file strings before first await; validate same pinned identities/40hex code/tree. Capture the first-case primitive before suspension and compare to verified source first-case after verification. Unused baseDir/owner/report values retain the existing assembler's ignored-value semantics: do NOT newly validate a path/owner/report, invoke their nested properties, freeze them or keep them in the returned closure. This is no file/owner authorization surface.

Preparation performs unchanged asset verification once, parses both manifests, enforces closed-key canonical planning with the existing source planner, and deeply owns/freezes ONLY parsed source data and captured primitive records. Return a frozen `{ reconstruct }` whose only retained data is owned identity, file strings and source cases/dataset identifiers.

Reconstruction input has EXACT THREE own-enumerable data fields `stage`, `profile`, `snapshot`. Stage/profile enum validation precedes snapshot traversal; snapshot uses unchanged `captureCalibrationStageReportSnapshot`. Match stage/profile/all15identityfields; require selectedProfile for validation/benchmark, startedAt and zero pending images. Resolve the same canonical population/sample range and reuse the current body for unique case/sample binding, failure outcomes, score, runId, calibration metadata, safeErrors, measured/missing latency, rendering and deep freeze. The result is a NutritionEvalReport directly, not a Promise/receipt/gate bundle. No callbacks/deps/overrides/source reports/results/hashes are accepted by reconstruct.

## Task 1: Owned preparation and shared synchronous reconstruction

**Consumes:** `verifyCalibrationPreflightState({files})`, `deriveCanonicalReportOutcomePlan(files,selected?)`, strict manifest parsers, existing snapshot codec, scorer, report builder/renderers, genuine bootstrap and strict4arg ledger fixtures.

**Produces:** immutable reconstructor with pure synchronous report output; existing async assembler remains compatible and all pre-refactor render digests match. Native artifact verification and ledger acceptance remain pending.

- [x] **Step 1: Worker tests/digest controls ONLY.** Before source edits, create the new test and tiny digest fixture using the unchanged assembler. Use a local real-file fixture; do not import existing test modules (their describes have side effects) or modify their helpers. Deterministic fixture identity/clock:

```ts
const context = await prepareCalibrationBootstrapContext({
  baseDir: dir,
  readGitState: () => ({headCommit:'a'.repeat(40),implementationCommit:'b'.repeat(40),functionsTreeId:'c'.repeat(40),dirtyPaths:[]}),
  readCommittedFile: path => readFileSync(resolve(repo,path),'utf8'),
  readOwner: () => ({hostname:'reconstruction-fixture',bootId:'reconstruction-boot',pid:44,startTicks:44,acquiredAt:'2026-10-08T00:00:00.000Z'}),
});
let ticks = 0;
const native = createFileCalibrationLedgerDeps(dir);
const ledger = createProtocolCalibrationLedger({ ...native,
  nowIso: () => new Date(Date.UTC(2026,9,8)+ticks++*1000).toISOString(),
}, context.identity, selected => deriveCanonicalAllowedKeys(context.files,selected), {
  getReportOutcomePlan: selected => deriveCanonicalReportOutcomePlan(context.files,selected),
});
ledger.acquireLock(context.owner);
```

Add effect counters around actual ledger append/fsync/clock calls, and track native journal/ledger bytes before pure operations. Use task disk TMPDIR/mkdtemp and afterAll cleanup ONLY tracked fixture directories. File-local60s test/hook allowance is permitted on the busy Pi; no config change. All filesystem work belongs to setup, not the production preparation/reconstruction guard window.

Build deterministic real journal outcomes using existing snapshot/journal capture and known canonical keys, like the existing assembly fixture. Token count42; pin `gemini-3.8-fixture-pin` before LOW completion. Meal/label prediction is schema-valid success at120kcal/protein10/carbs0/fat8, confidence0.8, basisportion/amount1/unitportion, needs_review, sampleIndex from key, cachedfalse, latency17; meal diagnostics rawNutrients match and estimatedTotalMassG90, declared portion fields match. Journal normalized four nutrients (and meal mass90), SHA256(JSON.stringify(four)), analysisLatency17, errorCategorynone/pinned version/reportPrediction. Save snapshots by stage/profile; complete stages through the unchanged legacy4arg fixture API only (NOT evidence that measured gates passed). Development selection fixture is MEDIUM/default_medium_tie_breaker. Validation and benchmark use MEDIUM only.

For benchmark, create all48 planned meal/label image terminals and all12 barcode non-reservation product-failure outcomes at canonical keys, using this valid controlled no-request prediction:

```ts
ledger.recordNonReservationResult({ key, reason:'barcode', prediction: {
  parseStatus:'failure',source:'barcode',decision:'error',failureCategory:'product',
  failureCode:'off_product_invalid',sampleIndex:key.sampleIndex,cached:false,latencyMs:17,
} });
```

This is an offline report reconstruction control, not successful barcode replay or a benchmark gate pass. No provider/image/OFF network call occurs. Assert exactly36meal/12label/12barcode source rows from committed source populations, not caller truth. A separate mixed development fixture records first LOW key as dataset failure without reservation with measured latency9 (the existing journal codec requires a finite nonnegative latency), second LOW key as interrupted reservation via recoverAfterCrash with no invented report latency, then remaining image keys normally; save development snapshots and do not force it through old image-count stage completion. The LOW report therefore has23measured/1missing latency, with only the interruption missing.

Before refactoring, measure and store ONLY JSON/Markdown SHA256 for eight deterministic reports: normal preflightLOW/MEDIUM, developmentLOW/MEDIUM, validationMEDIUM, benchmarkMEDIUM; mixed-developmentLOW/MEDIUM. Digest metadata records fixtureVersion1, original assembler SHA8e0b6a2819a4b5357d776284bee32e93d77e3152b97e4d3c2dd13809858f3356 and original real Functions tree ea9365bd9c5cdbd58b1e8582b4f75386b9624e05. Reports use injected b/c IDs; do not confuse them with real deployment identity. These hashes are measured baseline data, not guessed literals or regenerated on GREEN. Keep the fixture small; never write raw reports or model content to committed files.

The new test's baseline-control group checks old assembler output against that frozen table. All new factory-dependent tests load the existing module dynamically so RED is missing export behavior, not a TS/import/fixture error:

```ts
type Prepared = { readonly reconstruct:(params:unknown)=>NutritionEvalReport };
type Prepare = (context:unknown)=>Promise<Prepared>;
async function loadPrepare():Promise<Prepare> {
  const path = '../../src/nutrition-eval/calibration-report-assembly';
  const module = await import(/* @vite-ignore */ path) as Record<string,unknown>;
  if (typeof module.prepareCalibrationStageReportReconstructor !== 'function') {
    throw new Error('report-reconstructor-missing');
  }
  return module.prepareCalibrationStageReportReconstructor as Prepare;
}
// After fixture setup and digest measurement:
const prepare = await loadPrepare();
const ready = await prepare(context);
const result = ready.reconstruct({stage:'preflight',profile:'LOW',snapshot:lowSnapshot});
expect(result instanceof Promise).toBe(false);
expect(Object.isFrozen(ready)).toBe(true);
assertDeepFrozen(result);
expect(sha256(renderNutritionEvalJson(result))).toBe(digests['preflight/LOW'].jsonSha256);
expect(sha256(renderNutritionEvalMarkdown(result))).toBe(digests['preflight/LOW'].markdownSha256);
```

Define local sha256 with nodecrypto and recursive assertDeepFrozen on owned results. Required table/fault coverage:

- All eight report digests, exact runId/dataset hashes/case-sample populations/truth/safeErrors/latency coverage; legacy async report bytes also match frozen digests (not merely mutual parity). Mixed LOW preserves23measured/1missing latency: dataset/no-request latency9 remains measured and only the interrupted outcome lacks latency.
- Context/files/identity descriptors: accessor, hidden, symbol, foreign prototype, missing/extra field, presentundefined, wrong file type/content/hash, wrongfirstcase/code/tree/model/profileidentity, throwing ownKeys/descriptor reflection. Zero Get/coercion; failures fresh static causeless INVALID and never injected foreign objects. Honest metadata proxies supported. Unused owner/report/base nested proxies with throwing Get/ownKeys must remain untraversed and unfrozen; caller mutable source objects remain unfrozen.
- Mutate caller files/identity/firstcase synchronously after dispatch before preparation await resolves, and again after preparation: closure uses original source. Mutate unused owner/report/base values without effects. Preparation invokes zero snapshot/provider/clock/ledger/fs operations.
- Reconstruct closed3field requests: reject stage/profile invalid or extra context/readSnapshot/report/receipt/path/hash/truth/threshold fields, accessors/hidden/symbol/prototypes/foreign reflection throws before snapshot getters. Snapshot hostile shapes and nested rows reuse codec policy; mismatchidentity/stage/profile/selectedprofile, unstarted/pending/incomplete, missing/duplicate/unplanned/wrongsample cases, cachedtrue, wrongsource fail with existing static INVALID/INCOMPLETE distinctions.
- Synchronous snapshot capture: returned deeply frozen report cannot be changed by later caller snapshot/row/prediction mutation; no caller object is frozen. Reuse one prepared closure across LOW/MEDIUM/all stages/mixed snapshots; successive owned reports are distinct objects, prior bytes stable, no per-call state leakage.
- Legacy callback captured before firstawait and deferred until after preparation; exactlyone call to original callback despite caller replacement; original callback throw becomes READ_FAILED, source preparation failure calls it zero times, incomplete snapshot stays INCOMPLETE. Never pass the closure callback into public source/context acceptance.
- No filesystem/ledger effects during pure operations: baseline native bytes/counters identical. If instrumenting nodefs, use importOriginal delegate mocks armed ONLY after setup/module loading, not vi.spyOn on nonconfigurable ESM exports; retain genuine fixture fs behavior. Assert Date.now/provider/mock dispatch counters remainzero. No expected-missing-export canary that passes instead of exercising behavior.

- [x] **Step 2: Host RED and freeze.** Independently inspect entire new test/digest table, measure baseline controls on unchanged source, then run focused command below and changed-test ESLint from functions cwd. Existing92assembler/100publisher/report suites pass; old digest controls pass; new factory behavior fails only `report-reconstructor-missing`. Fix fixture defects through editing worker before source. Freeze newtest/digest + original assembler/existingtests/publisher/userconfig hashes. Do not regenerate digest fixtures after source starts.

- [x] **Step 3: Worker assembler ONLY.** Add exact exports/owned preparation; share existing snapshot-to-report body, not a second calculator. Keep existing type-only calibration import and no new ledger runtime import. A concrete public-wrapper flow:

```ts
export async function assembleCalibrationStageReport(params:unknown):Promise<NutritionEvalReport> {
  const request = ownRecord(params,['stage','profile','context','readSnapshot']);
  const stage = request.stage;
  const profile = request.profile;
  if ((stage !== 'preflight' && stage !== 'development' && stage !== 'validation' && stage !== 'benchmark') ||
      (profile !== 'LOW' && profile !== 'MEDIUM') || typeof request.readSnapshot !== 'function') {
    throw new CalibrationFatalError(INVALID);
  }
  const readSnapshot = request.readSnapshot as AssembleCalibrationStageReportParams['readSnapshot'];
  // Factory executes descriptor/source capture synchronously before it suspends.
  const ready = await prepareCalibrationStageReportReconstructor(request.context);
  let snapshot:unknown;
  try { snapshot = readSnapshot(stage,profile); }
  catch { throw new CalibrationFatalError('calibration:stage-report-read-failed'); }
  return ready.reconstruct({stage,profile,snapshot});
}
```

Preparation moves current lines65–101's closed context/identity/files capture, identity checks and unchanged verifier/manifest parsing into the factory, keeping all primitives captured before await. Resolve the four owned case populations from parsed training/public source, validate canonical closed source through existing planner, deep-freeze ONLY owned parser output/source records. Reconstruct validates/captures exact3fields and uses unchanged snapshot codec; select stagecases/datasetId/samples from owned source. Move current lines102–170's snapshot identity/selected/pending checks, tuple/prediction/error maps, source/sample validation, scoring, safe errors, latency and final build/render/freeze into ONE shared synchronous path. This body must NOT remain duplicated in the public wrapper. Keep snapshot maps/errors allocated per call. Hash/receipt/gate APIs are not added.

- [x] **Step 4: Host GREEN and reviews.** Run all focused/build/lint/full serial commands; byte parity/digest controls and existing tests unchanged. Whitespace and protected-config/source-scope checks. Fresh native whole-plan read-only review per executing-plans; Important/Critical get one tests-first fix pass, Minor deferred/recorded. Mandatory Antigravity exact CODE agree/MUST_FIXnone for this reconstructor workstream. No live/APK/Flutter/provider gates because unused pure offline seam; parent eval fixture/test:verify/146dispatch still pending.

- [x] **Step 5: Commit/push/task-done/closure.** Track verification/rulings/minors, commit exact5allowlist files (`Prepare source-bound report reconstruction`), normalhook, push origin and verify liveorigin exact. Postcommit task-done full serial BEFORE task-complete checkbox. Preserve every ruling/minor in committed plan/status before removing ONLY this plan's scratch. Keep branch/worktree; no merge/PR. Next independently verified native artifact admission, then explicit fifth-opt-in receipt/gate mode and new controller/CLI. No calorie accuracy/readiness/security promotion.

Focused and independent verification:

```bash
npm --prefix functions test -- --reporter=dot --maxWorkers=1 --minWorkers=1 test/nutrition-eval/calibration-report-reconstructor.test.ts test/nutrition-eval/calibration-report-assembly.test.ts test/nutrition-eval/calibration-report-publication.test.ts test/nutrition-eval/report.test.ts
# From functions cwd, RED-only changed-test lint:
node_modules/.bin/eslint test/nutrition-eval/calibration-report-reconstructor.test.ts
npm --prefix functions run build
npm --prefix functions run lint
npm --prefix functions test -- --reporter=dot --maxWorkers=1 --minWorkers=1
```

Set TMPDIR to this plan's verified disk tmp for all runs. Existing baseline2230pass/1public-manifest skip2231 and final build/lint0 are prior publication evidence, NOT inferred new-run results. Expected RED is new missingfactory failures only plus green existing/digest controls; expected GREEN all focused/full tests pass with same existing skip, build/lint0. No new UI/live run IDs/visual evidence.

## Research provenance, self-review and approval gates

### Native whole-plan review and host rulings — 2026-10-09

Fresh read-only gpt-6-astra/high inspected full238-line assembler,1457-line new test, complete digest fixture, actual path-limited worktree diff and relevant unchanged dependencies. Critical:none; Important:none; Minor:none. Host re-grade agrees; no fix pass or deferred minor. Host independent focused363/363, build0, lint0, full44files2343passed1existing public-manifest skip2344 in452.16s. Review approval is bounded offline reconstruction only; MCP CODE and commit/push/postcommit task-done remain separate gates.

Every declined-to-judge item is retained as an explicit host ruling, in order:

1. **Ruling:** published-artifact authenticity/filesystem admission remains deferred: the approved seam reads no artifacts and is not admission proof. **Cost if wrong:** forged/changed files could be trusted by a future consumer; independently verified native admission must precede that integration.
2. **Ruling:** receipt/fifth-opt-in ledger binding/measured gates/profile-selection enforcement remains deferred: explicit future scope, fixture `passed:true` is not gate evidence. **Cost if wrong:** future ledger decisions could trust caller booleans; no new gate/selection claim is made here.
3. **Ruling:** controller/CLI/live dispatch/successful barcode replay/provider behavior remains deferred: none is invoked by this offline slice. **Cost if wrong:** future orchestration and real-provider failures remain undetected; separate live gates remain required.
4. **Ruling:** calorie accuracy/generalization/production readiness/security release approval remains unestablished: synthetic reconstruction outcomes establish report parity, not real-world accuracy or release safety. **Cost if wrong:** premature release or overstated accuracy; no such approval is granted.

Deferred minors: none.

### Task1 completion and closure

Implementation commit `7ca7d87b732e0dd4015350bc87cfbf530abbad39` (`Prepare source-bound report reconstruction`), exactly five allowed files, normalhook0/push0/live origin exact on `fix/scan-photo-flow-viewer`. Postcommit task-done ran the entire serial Functions suite at Task BASEc6cc3e2561e423bd73533f1e5c448ae7ced8503f: **exit0,44files/2343passed/1existing public-manifest skip2344,360.13s**. Only after this result, Task1 is complete and all five steps are checked. Earlier independent focused363/363, build0/lint0, full2343+1skip/452.16s remain separate evidence. Both exact CODE and fresh native reviews accepted unchanged source/test/digest; no Critical/Important fixes or deferred minors.

The four rulings above are exhaustive and preserved in committed tracking before deleting this plan's owned scratch. Keep branch/checkout as explicitly approved; no merge, PR or branch/worktree removal. Task scratch is reproducible/disposable and contains no sole source copy. All28 identified worker /tmp artifacts (65,793bytes) were relocated to owned ext4 scratch with verified bytes; unrelated shared /tmp/caches/processes untouched. Ordinary strongest-first worker policy still applies to future edits; no native application exception is granted.

Next: research and a separately reviewed bounded native published-artifact admission plan; then explicit fifth-opt-in receipt/gate binding, controller/CLI and authorized live calibration. ParentTask7Steps4–7 and Tasks8–10 remain pending. No real inference, successful live barcode proof, broad calorie accuracy, visual or release/security-readiness approval. Sample consultation `calorix-calibration-sample-adequacy-20261008`, primary3.8 agree/none: benchmark20distinct cases x3=60outcomes is regression screening, not60independent cases or production accuracy proof; preserve frozen corpus/thresholds146planned/300ceiling and preregister separate diverse independent holdout before broader claims. Historical2.5 stays comparison-only, no new requests.

Exact CODE gate accepted: primary `gemini-3.8-flash`, persistent `calorix-calibration-report-reconstruction-20261008`, explicitly `AGREEMENT_STATUS: agree`, `MUST_FIX: none`, `SHOULD_FIX: none`. Same-source targeted clarification confirms barcode successes remain accepted and synthetic product failures are fixture-only, correcting ancillary first-response wording and off-by-one line counts. No fallback, repository mutation or extraneous wrapper text; protected hashes unchanged after both calls. Source0e0f827a/test9bff/digestfb231 verified; scoped whitespace0. Ordinary worker source route exhausted Grok unknown model, Qwen quota, Ultra503, Muse source no-progress SIGTERM143, Lightning900s timeout124, Ling model unavailable before Big Pickle delivered. No provider/account exhaustion inferred from host timeouts; no paid editing route or native host code exception used. Commit/push/postcommit task-done completed as recorded above.

Receipt/gate research primary3.8 tool_transport_timeout300s at2026-10-08T20:10:37Z recorded exactly in status before3.7 fallback. First3.7 research agree/none included incorrect hash-only artifact proof, closedfourthoption change, nonexistent selectionreason, token>0, and oldsession edits; main rejected them. Same3.7 targeted clarification agrees with the owned prepared-closure prerequisite. This is not exact PLAN/CODE acceptance. Artifactfd must comparedev/ino to its own lstat, not the lockinode; future ledger integration must avoid bootstrap/calibration indirect runtime cycles through an injected verifier boundary. Neither issue belongs in this pure seam's implementation.

Plan self-review: source population/identity/privacy/latency contracts implemented by Task1, shared-core drift pinned by independently observed old digests; source callbacks/getters separated from unknown snapshots; old92/100 suites and frozen source/test scope preserved. No parent receipt/gate/CLI/live requirement is falsely marked implemented. No application worker dispatch or source edits until exact PLAN review and user written-plan review; ordinary worker policy applies. Preserve previously approved host-led inline verification/review/commit workflow; no new native application-edit exception assumed.

Host self-review correction: direct existing-codec diagnostic rejected a dataset failure with omitted latency (`calibration:report-journal-invalid`) and accepted the same controlled prediction at measured latency9; barcode off_product_invalid/latency17 also accepted. Preserve this contract, not an invented optional-latency fixture. Initial SHAa8232a53 PLAN receipt applies only to the superseded two-missing-latencies draft until the corrected exact plan is reviewed. This diagnostic is not a full/new behavior test run.

## Planning checkpoint — exact review accepted, user review received

Exact corrected functional plan SHA**2532d625464e30a2974144f39e7555dfaa305eed6cadff0574c2b9f259aafeef** received fallback**gemini-3.7-flash** agreement in **calorix-calibration-report-reconstruction-20261008**: AGREEMENT_STATUSagree/MUST_FIXnone/SHOULD_FIXnone. Primarygemini-3.8-flash exactPLAN transporttimeout300s at2026-10-08T20:33:23Z was recorded beforefallback; not quota/account exhaustion, empty success or CODE approval. This appended checkpoint is tracking only; approved functional requirements are unchanged.

Current Task: required human written-plan review before editing workers/tests/digests/source. Branch fix/scan-photo-flow-viewer retained, original source8e0b6a/publisher830ba5c9/existingtestsf1f79ff8+bee1e05/protectedconfig9c962 unchanged. No task-start/BASE or completed checkbox; no source/test/digest file generated, worker quota probe, new full/unit/live test, provider inference or native application-edit exception. Read-only fixturecodec diagnostic0/whitespace0 only. New tiny12KiB plan-owned scratch stays on ext4 while incomplete; completed publication scratch remains deleted. Preserve host-led inline verification/review/commit method and ordinary strongest-first editing workers. No actual receipt/file admission/gate/controller/CLI or accuracy/readiness/security approval.

Implementation approval received in the next user message, except a separate question on sample adequacy. Task1 started at BASE c6cc3e2561e423bd73533f1e5c448ae7ced8503f; brief read in full, existing branch/checkout retained as expressly planned. Current Task Step1 tests/digests-only strongest-first worker then independent RED/freeze. Sample-size consultation does not alter these functional requirements, the frozen corpus or live authorization. No inherited native application-edit exception.

Task1 Steps1–2 verified: strongest available Muse1.3 worker delivered measured controls and test1457lines SHA9bffae3a53203d2424734101fe887d575ed1bab90ec43ddfd83b5b63121ec6c1; digest tablefb231906a44d0bd177deb48096720bd352ae8eb58e507b04b1073d68f4cdcf07. Host independently inspected helper/tests/table, reran original compiled-source measurement (all8 JSON/Markdown pairs match), and ran source-based focused4 RED: initial run had8 Vitest onTaskUpdate RPC errors in unchanged publisher, not accepted; exact unchanged retry exit1/134.53s has97 deliberate missingfactory failures and266passing controls/existingcases363, no RPC/unhandled/fixture failures. Direct host changed-test lint0, hash manifest check0. Freeze exactnewtest/digest/publisher/existingtests/userconfig before source; original assembler8e0 retained as baseline provenance only. Current Task Step3 worker assembler ONLY, same ordinary worker policy. No digest regeneration, gate completion or readiness claim.
