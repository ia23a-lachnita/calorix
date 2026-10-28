# Native Calibration Controller Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the native calibration command execute the four approved stages through the existing native authority and producer, with independent hermetic proof of 146 SDK image calls, one separate token count and twelve offline barcode outcomes.

**Architecture:** A serial stage driver creates a fresh existing producer for each stage and a fresh existing live adapter inside each leased outcome. A native entry prepares the committed context, verified OFF store, current-owner native benchmark-authority ledger and exact SDK client; the existing injected CLI API remains compatible. Existing native report assembly scores the journal predictions, so neither the generic runner nor its private metadata helper is duplicated or changed.

**Tech Stack:** Existing TypeScript/Node/CommonJS, pinned `@google/genai` 2.19.0, Vitest 2.1.9, native Git/filesystem helpers; no new dependency.

**Spec:** `docs/superpowers/specs/2026-10-12-calibration-controller-runtime-design.md`, final default-CLI boundary; parent `docs/superpowers/plans/2026-09-23-gemini-38-nutrition-calibration.md` Task7 Steps4–7. Existing producer and benchmark-authority specs remain binding prerequisites.

**Plan status:** Authorized for execution by the user's 2026-10-28 “looks good continue” and standing instruction to proceed through already approved roadmaps without further plan approvals. Antigravity written-plan review is complete. Benchmark-authority Task3 passed its fresh committed-source DEFAULT and both final reviews, and its owned scratch cleanup is verified. Preserve inline execution, normal editing routes first, and the now-authorized direct-edit fallback after all routes are exhausted. This plan does not authorize live calibration or production changes.

## Global Constraints

- Route exactly `gemini-3.8-flash`, Vertex project `calorix-xurschnell`, location `us`, API `v1`, endpoint `https://aiplatform.us.rep.googleapis.com/`, timeout30000ms. Use existing `createCalibrationGenAIClient`; no API key, retry option, endpoint/model/project fallback or active2.5 arm. Preserve frozen2.5 results for comparison only.
- Native entry requires existing `RUN_NUTRITION_CALIBRATION_LIVE=1`; reject malformed/no-opt-in invocation before native preparation/client creation. Tests set this only in their isolated fake invocation record, never as a whole-suite live environment override. No real inference/account/cloud/device/deploy or production model change belongs to implementation.
- Keep40 calibration IDs and their24development/16validation split,20public/0private benchmark cases, three validation/benchmark samples, all existing metrics/thresholds and source/input pins unchanged. Preserve33carb-density-eligible/36meal/12label/12barcode benchmark populations.
- Canonical full protocol: preflight2image requests, development48, validation48, benchmark48; cumulative image reservations2/50/98/146;158finished outcomes; benchmark60outcomes. Token count is separately reserved/completed once. Every prediction has `cached:false`; no response cache. Barcode work uses only prepared OFF data and zero image/vision/live-OFF calls.
- Reuse one existing native root/header/lock/journal/event codec/report formats. No new seal, event, ledger method, schema field or caller verifier that grants authority. Driver DI is a trusted test seam; native entry never accepts context/ledger/verifier/counter overrides or new CLI flags.
- Native entry explicitly acquires once per valid command using existing ownership/liveness policy; no background takeover, `recoverAfterCrash`, implicit retry/reset/unlock or root repair. Uncertain effects remain visible. Only successful healthy completion initiates release; release itself may fail after a real effect, so assert actual bytes rather than promise every failed command retains a lock file.
- Try normal strongest-first editing workers using literal patches. If every applicable route is exhausted, unavailable or fails within a recorded reasonable runtime bound, the main host may edit directly without another approval, under the user's standing 2026-10-28 instruction. Preserve test-first development and all review/verification/commit/push gates. Preserve user configs by fingerprint only and preserve original checkout changes.
- Use a clean isolated workspace and verified disk-backed task TMP/cache/log paths. No shared `/tmp` cleanup. Before execution freeze prerequisite source/tests/config hashes and capture Task1BASE; documentation-only HEAD movement does not change Functions-tree identity. Do not rerun a passed unchanged broad suite between every partial test increment.

## Review Focus

- Missing opt-in, malformed arguments, forbidden overrides or dirty source: no native preparation/client/request; importing CLI/bootstrap must not start the new runtime. Task2.
- Samples2/3, stale per-lease facades and supplied barcodes: correct immutable key metadata; zero barcode image/vision/OFF access, no image sharing outside a lease or response-cache access. Task1.
- Ordinary provider/parse failures versus reservation/metadata/reentry failures: correct terminal handling, stop after fatal, no swallowed fatal converted into an ordinary result. Task1.
- Reopen, changed reports/source, incomplete/reserved history and uncertain publication/release: fresh verification, no redispatch/refund/history repair, truthful retained prefix. Tasks1–2.
- SDK method arithmetic versus ledger intent/opaque retries: independent fake method/transport witness and per-outcome native method-counter checks; no claim of universal network or physical-crash attestation. Tasks1–3.

## File map and interfaces

Create `functions/src/nutrition-eval/calibration-stage-driver.ts`, `calibration-native-cli.ts`, and new tests `calibration-stage-driver.test.ts`, `calibration-native-cli.test.ts`, `calibration-native-controller-fixture-controls.test.ts`, plus `calibration-native-controller-fixtures.ts` under `functions/test/nutrition-eval/`.
Modify only `functions/src/nutrition-eval/calibration.ts` (additive decision export), `calibration-cli.ts` (shared pure validation and native main), `functions/package.json` (one script), plan/status. Keep all prerequisite fixtures/tests, reducers, codecs, report/schema/scorer/normalizers/runner and production configuration frozen. Any other source need requires a reviewed amendment before editing it.

In `calibration.ts`, add a thin export around existing private `selectProfileDecision`; do not duplicate its algorithm or alter old `selectCalibrationProfile`:

```ts
export function selectCalibrationProfileDecision(
  low: CalibrationProfileMetrics, medium: CalibrationProfileMetrics,
): Readonly<{profile: CalibrationProfile; reason: CalibrationProfileSelectionReason}>;
```

In `calibration-stage-driver.ts`:

```ts
export interface CalibrationSdkMethodCounts { readonly vision:number; readonly tokenCount:number }
export interface CalibrationStageDriverDeps {
  readonly context: CalibrationPreparedContext;
  readonly ledger: Readonly<CalibrationRuntimeEvidenceLedger>;
  readonly loadImage:(key:Readonly<CalibrationReportOutcomeKey>)=>Promise<Uint8Array>;
  readonly generateVision:GenAIAdapter['generateVision'];
  readonly lookupSnapshot:(barcode:string)=>Readonly<OffProduct>|undefined;
  readonly countTokens:()=>Promise<{tokenCount:number}>;
  readonly nowMs:()=>number;
  readonly getSdkMethodCounts:()=>Readonly<CalibrationSdkMethodCounts>;
}
export interface CalibrationStageExecutionResult {
  readonly stage:StageName;
  readonly selectedProfile?:CalibrationProfile;
  readonly receipts:readonly Readonly<CalibrationPublishedReportReceipt>[];
  readonly cumulativeImageReservations:number;
  readonly cumulativeTokenReservations:number;
  readonly newSdkMethodInvocations:Readonly<CalibrationSdkMethodCounts>;
  readonly historical?:Readonly<Pick<CalibrationBenchmarkHistoricalAssessment,
    'comparison'|'subset'|'provenance'>>;
}
export interface CalibrationStageDriver {
  executeStage(stage:StageName):Promise<Readonly<CalibrationStageExecutionResult>>;
}
export async function prepareCalibrationStageDriver(
  deps:unknown,
):Promise<Readonly<CalibrationStageDriver>>;
```

Capture exactly the eight dependency fields through own data descriptors before await. Reuse `captureProducerInput` on an explicitly constructed matching subrecord to own context/port primitives, then capture the additional needed ledger functions with their original receiver. Ignore legitimate unrelated ledger methods; never freeze caller records or retain mutable context aliases. Pure preparation validates pinned files/plans and creates no lock/client or port/ledger effect. Driver owns active/poison state; guard callback/reflection/await results before the next effect. BOTH driver and producer receive the same private method facade: every captured underlying ledger call checks driver state before delegation and after return. Thus a producer settling a rejected port cannot begin a later native call after a swallowed driver reentry has already poisoned the enclosing driver. The guard cannot retroactively cancel an already-entered opaque SDK/native call: preserve any effects that call actually made, reject its completion and forbid subsequent publication/admission/binding/completion. Tests must distinguish an in-flight effect from a new delegation; no cancellation or hidden-transport attestation is promised. This is a private guard over existing methods, not another ledger/store/root/API. Fresh static causeless public fatal is `calibration:stage-driver-failed`; never inspect foreign throws. Observe returned rejected promises as the producer already does, without replacing their rejection.

SDK counter snapshots are exact own-data `{vision,tokenCount}` finite nonnegative integers. They are diagnostics from trusted native method wrappers, not persisted authority or permission tokens. Capture before/after each vision lease and require delta `{vision:1,tokenCount:0}` before terminal publication; barcode delta is zero. Count-token delta must be `{vision:0,tokenCount:1}` before completing that reservation. Reentry/invalid snapshots/mismatches poison and stop before the next journal/terminal/finish/completion. This witnesses actual native SDK-method entry, not opaque HTTP retries inside a method.

In `calibration-cli.ts`, factor existing synchronous model-reference/argument/environment validation into an additive pure export, preserving failure ordering and all existing `runCalibrationCli` behavior including explicit missing deps:

```ts
export type CalibrationCliInvocationValidation =
 | Readonly<{valid:true;stage:CalibrationCliStage;thinkingLevel?:CalibrationCliThinkingLevel}>
 | Readonly<{valid:false;result:CalibrationCliResult}>;
export function validateCalibrationCliInvocation(
 argv:readonly string[], env:Record<string,string|undefined>,
):CalibrationCliInvocationValidation;
```

In `calibration-native-cli.ts`:

```ts
export interface CalibrationNativeCliResult extends CalibrationCliResult {
 readonly execution?:Readonly<CalibrationStageExecutionResult>;
}
export async function runNativeCalibrationCli(
 argv:readonly string[],env:Record<string,string|undefined>=process.env,
):Promise<Readonly<CalibrationNativeCliResult>>;
```

Return only owned safe result/aggregate data, never reports/cases/images/prompts/raw errors/private paths. Successful execution includes existing receipt IDs/hashes and seven historical deltas/subset/provenance at benchmark; this is operator output only, never read back as admission. Existing hashed JSON/Markdown reports and ledger schemas remain unchanged. Invalid/preparation failures have no execution summary. Use existing safe failure codes; native prep/acquisition failure maps to `preflight_verification_failed`, release failure to `stage_failed`.

### Task 1: Implement the leased serial stage driver

**Files:** New driver, new driver test/fixture and independent fixture-controls test; minimal decision export in calibration.ts; tracking.

**Fixture interfaces (NEW test helper only):**

```ts
export type ControllerVisionRequest = Parameters<ReturnType<typeof createCalibrationGenAIClient>['models']['generateContent']>[0];
export type ControllerTokenRequest = Parameters<ReturnType<typeof createCalibrationGenAIClient>['models']['countTokens']>[0];
export interface ControllerFixtureOptions {
 winner:CalibrationProfile;
 extraTransportOnVision?:number; // 1-based SDK-entry ordinal; absent means no hidden retry
}
export interface ControllerWitness {
 visionByStage:Record<StageName,number>; sdkVision:number; sdkToken:number;
 transportVision:number; barcodeLookups:number;
 readonly imageLoads:ReadonlyArray<Readonly<{stage:StageName|undefined;caseId:string;key?:Readonly<CalibrationReportOutcomeKey>}>>;
 readonly snapshotLookups:ReadonlyArray<Readonly<{stage:StageName|undefined;barcode:string}>>;
 readonly visionRequests:ReadonlyArray<Readonly<{stage:StageName|undefined;request:ControllerVisionRequest}>>;
 readonly tokenRequests:ReadonlyArray<Readonly<{stage:StageName|undefined;request:ControllerTokenRequest}>>;
}
export interface DriverFixture {
 root:string; context:CalibrationPreparedContext;
 ledger:Readonly<CalibrationRuntimeEvidenceLedger>;
 driverDeps:CalibrationStageDriverDeps;
 witness:ControllerWitness; forbiddenCalls:string[];
 beginInvocation(stage:StageName):void;
 finishedCanonicalKeys():readonly CalibrationReportOutcomeKey[];
 bindingCount():number;
}
export interface NativeCliFixture {
 root:string; env:Record<string,string|undefined>;
 witness:ControllerWitness; forbiddenCalls:string[];
 beginInvocation(stage:StageName):void;
 finishedCanonicalKeys():readonly CalibrationReportOutcomeKey[];
 bindingCount():number;
}
export async function makeCalibrationDriverFixture(
 roots:string[],options:ControllerFixtureOptions,
):Promise<DriverFixture>;
export async function makeCalibrationNativeCliFixture(
 roots:string[],options:ControllerFixtureOptions,
):Promise<NativeCliFixture>;
```

Driver fixture prepares/acquires an empty actual native ledger; native-CLI fixture prepares ONLY the committed asset miniGit and scoped raw-port/module observations, leaving the calibration root entirely absent for the actual entry. Neither fixture dispatches or builds calibration history. Behavioral tests import/call the SUT themselves and set beginInvocation from their literal requested stage, independently labeling SDK calls. Disk helpers independently count actual closed runtime event keys/bindings; expected cohorts come from independent committed-data parsing and literal protocol counts, not the production planner's returned counts. Fake wire replies use truth's canonical basis/amount/unit, actual referenceMassG for meal detectedItems, and existing wire response fields from live-adapter tests. Make MEDIUM worse by5% calorie error only for development in the LOW-winner fixture; actual published measurements/core decision must determine the winner, never a fixture-assigned selection. Native-client observations delegate the actual createCalibrationGenAIClient, then spy only on that real object's models methods; use actual SDK GenerateContentResponse/CountTokensResponse classes (candidates content parts text/modelVersion and totalTokens) so real types/getters apply without live dispatch/authentication. The driver fixture supplies a deterministic monotonic nowMs that advances exactly1ms per call: equal development predictions therefore have equal analysis latency and the existing exact tie-break chooses MEDIUM. The native-entry fixture makes MEDIUM5% worse in development so LOW wins without replacing native performance.now. Each new test file registers afterEach cleanup for exactly its registered owned roots and spies, after awaiting all owned work and inspecting any failed prefix. Do not force releaseLock after an assertion or native failure; failed-prefix lock retention remains part of the tested behavior. The successful driver positive explicitly releases as shown. Restore observations per test.

- [ ] **Step1: Worker authors runnable fixture controls and driver RED tests before source.** New fixture immediately registers each owned root, wraps frozen `makeMiniGitRepoTask4` without editing it, adds/commits the four actual OFF payloads in that NEW miniGit before preparing context, and uses actual native benchmark ledger/store/publication/verifier. Fake image bytes and fake SDK methods are explicit trusted ports; no native history is prebuilt to stand in for dispatch. Use real `createGenAIAdapter`. Independent fixture witness increments INSIDE fake SDK `models.generateContent`/`countTokens` and its fake transport, records request bodies and caller-requested stage, and independently parses committed manifests for expected keys/media/barcodes. Produce valid raw wire JSON from each non-barcode truth with confidence0.99 and meal detected-item weight `truth.referenceMassG`; use actual parser/normalizers. Barcode data comes from real prepared products. Do not replace normalization/scoring with perfect predictions.
- [ ] **Step2: Observe RED.** Run the new whole driver test file serially with JSON; missing new module/export is an honest import RED. Separately run `npx vitest run test/nutrition-eval/calibration-native-controller-fixture-controls.test.ts --no-file-parallelism --maxWorkers=1 --minWorkers=1 --reporter=default --reporter=json --outputFile=<owned-fixture-controls-receipt>`: PASS. This independent controls file has no runtime SUT import, and the shared fixture uses type-only imports for new driver types so controls can run before the driver exists. Controls verify all four actual OFF products are parsed/normalized and measured through the existing scorer, with frozen gates deciding adequacy; do not invent exact-zero error expectations. No forbidden port is used. If real frozen OFF truth cannot satisfy a required gate, diagnose and obtain a bounded amendment; do not alter truth, snapshots, gates or fabricate products.

Concrete positive test (fixture is NEW and defined above; no provider network):

```ts
it('drives one complete native MEDIUM protocol through independent SDK methods',async()=>{
 const f=await makeCalibrationDriverFixture(ownedRoots,{winner:'MEDIUM'});
 const driver=await prepareCalibrationStageDriver(f.driverDeps);
 for(const stage of ['preflight','development','validation','benchmark'] as const){
   f.beginInvocation(stage); await driver.executeStage(stage);
 }
 expect(f.witness.visionByStage).toEqual({preflight:2,development:48,validation:48,benchmark:48});
 expect(f.witness.sdkVision).toBe(146); expect(f.witness.sdkToken).toBe(1);
 expect(f.witness.transportVision).toBe(146); expect(f.witness.barcodeLookups).toBe(12);
 expect(f.forbiddenCalls).toEqual([]);
 expect(f.finishedCanonicalKeys()).toHaveLength(158);
 expect(f.bindingCount()).toBe(6);
 // Inspect all12 native report artifacts and all outcomes: cached false,
 // selected samples1/2/3 correct, complete frozen populations and native gates.
 f.ledger.releaseLock(f.context.owner);
},600000);
```

- [ ] **Step3: Implement the driver and thin decision export.** Each execute checks current owner/source through existing guarded ledger calls, strict predecessors and activeAttempt null. Validation/benchmark REQUIRE selectedProfile exactly LOW or MEDIUM before any work; missing selection fails rather than using an empty initial plan. Derive/filter the canonical requested-stage rows; instantiate existing producer for THIS stage with selectedProfile only when the ledger has selected one. Do not reuse an initial50-row producer for selected stages. Skip only genuinely `runtime_attempt_finished` keys from the verified runtime snapshot. Any unresolved active/reserved/terminal-incomplete history blocks new work. An explicitly recovered unreserved abandonment remains eligible through the existing ledger/producer checks; never call recovery automatically or redispatch a consumed key.

Preflight token key is exactly `{kind:'token_count',stage:'preflight',caseId:context.firstDevelopmentCaseId,model:'gemini-3.8-flash'}`. Reserve before invoking the raw token port. Valid token result is an owned exact nonnegative integer. Raw rejection becomes known `unknown` token failure; malformed result `empty_response`; persist failure and safe_error in order, then stop. A failed/uncertain ledger operation triggers no subsequent write. If token reservation already exists, never count again: existing strict preflight-start checks distinguish completed from pending/failed before any image port. Token media preparation may load the first development image separately; do not mislabel that as an additional vision request or a barcode image load.

Within each producer work callback, load bytes via caps only for non-barcode. Create a fresh existing live adapter closing over THAT immutable caps value: full typed GenAIAdapter with generateChat forbidden, generateVision validating exact model/source/no outer options and mapping to `caps.generateVision({prompt,imageBase64})`; do not use outer calibrationReservation or a mutable currentCaps variable. Barcode map.get verifies the one canonical barcode then calls caps.lookupSnapshot; live OFF/unused paths throw owned static fatal. Keep default production parsing/normalization/confidence/provenance. Start monotonic analysis clock after image load and immediately before analyzeCase. Copy prediction with `{latencyMs:Math.max(0,end-start),sampleIndex:key.sampleIndex,cached:false}` through existing report-prediction capture; never relabel a scored/journaled result. No generic runner call is needed.

Publication callback uses existing journal capture. Success hash is SHA256 of JSON of exactly `{kcal,proteinG,carbsG,fatG}` IN THAT ORDER; normalizedPrediction optionally adds diagnostics.estimatedTotalMassG, which is not in that hash. Include actual analysisLatencyMs, errorCategory none, current ledger-pinned modelVersion, and the captured reportPrediction. Failure uses normalizedPrediction null, predictionHash/errorCategory unknown, responseModelVersion n/a and the captured failure prediction. Image path is appendResultJournal -> complete; barcode path recordNonReservationResult(reason barcode). Producer alone finishes the attempt. Do not rescore in this callback: native report assembly already calls the existing scorer.

After the stage rows finish: publish each required native report pair -> admit -> bind; preflight/development have LOW and MEDIUM, validation/benchmark selected only. Development measures both published reports, calls the new thin decision export, and lets existing recordProfileSelection verify profile/reason and the frozen winner gate. CompleteStage gets exactly its existing predecessor list/passed shape; core gates independently decide. Do not feed the pure measurement bridge's intentionally absent runtime counters to a replacement benchmark gate: the existing authority core derives/verifies them. An already completed stage revalidates via completeStage without dispatch, republishing or duplicate bindings. Gather existing admitted receipts, reconstruct any reporting-only aggregate through existing assembleCalibrationStageReport, and at benchmark project ONLY comparison/subset/provenance from the existing history assessment. Results contain no case predictions. No release or lock lifecycle lives in driver.

- [ ] **Step4: GREEN all driver controls, strict/build/lint.** Preserve600000ms only for new real full-history cases,5000ms small controls. Test all selection reasons via literal discriminating metrics; no input mutation. Include sample2/3 metadata, both profile routes (LOW native-entry positive is Task2), twelve isolated barcodes, expired facade, cache traps, slow image excluded from analysis latency, raw provider/parse failure in losing development profile, preflight first failure stops MEDIUM, metadata mismatch/missing/duplicate hooks, swallowed reentry, invalid method-count snapshot and actual extra SDK-method invocation before journal, foreign thrown proxy zero reads, source/owner drift and uncertain journal/report publication. All rejected repeats on a poisoned driver initiate no new port/native effect; an already-entered opaque call may retain its actual effects, with no later delegation or fabricated rollback. Adversarial fake internal retry produces146SDK-method/147transport attempts and MUST fail independent witness qualification; do not pretend the controller observes opaque retry internals.
- [ ] **Step5: Scoped actual code/results review, checkpoint commit/push.** No generic runner/schema/threshold/helper rewrite. Native standalone driver proof is not default-entry qualification or live accuracy.

### Task 2: Wire the actual native CLI and command

**Files:** New native CLI/test; existing calibration-cli.ts, `functions/package.json`, new fixture only as authorized by reviewed actual failures; tracking.

- [ ] **Step1: Worker authors native-entry RED and pure validation parity tests.** Explicit old runCalibrationCli(...,{}) still dependency_missing; exact existing malformed/env failures retain precedence. Import CLI/bootstrap/producer triggers zero preparation/client/request. Missing opt-in/forbidden identity/endpoint/retry/run-dir/2.5 references trigger zero effects. New native entry and script are absent before source. Whole native-entry positive uses real GoogleGenAI objects from existing exact factory, with only their SDK model methods spied to return real typed SDK response classes; no fake SDK types/any. Root resolution is the ONLY bootstrap substitution and delegates actual createCalibrationBootstrapReadDeps(ownedMiniGit); actual native Git/owner/ledger/report/verifier stay live. Image bytes are fake trusted media ports; real prepared OFF products are retained. Snapshot-store observation wraps/delegates the real preparer/get, never fabricates verification or products.
- [ ] **Step2: Observe RED with serial whole native-entry file and unchanged calibration-cli/genai-adapter controls.** New tests fail for missing implementation; old controls pass. Register/clean only exact owned roots and restore spies. Full native positive drives FOUR actual native entry calls, winning LOW, with validation/benchmark `--thinking-level low`, independently witnessing2/48/48/48 and1token/12barcodes. No history builder may replace those commands.
- [ ] **Step3: Implement native assembly and lazy main.** Validate/capture invocation before awaits/effects, reuse existing failure ordering. Bootstrap with existing native read deps; read exactly four committed snapshot payloads from context.identity.implementationCommit using a fixed-path argument-array Git reader; verify/parse the real store before any reservation/client. Prepare ONE real benchmark-authority native ledger from the same context and explicitly acquire once. Verify model/stage/predecessors/profile before constructing the client. Never use old preflight session constructors to create a second ledger/root. Build trusted raw image port via loadVerifiedCaseImage with canonical `<context.baseDir>/.nutrition-eval/cache` and actual case metadata; token port uses the fixed first development image/prompt/media and existing countCalibrationTokens. No private dataset/root overrides.

Create SDK client only via createCalibrationGenAIClient. Capture its actual model methods with original receiver and provide owned wrappers incrementing private method counters; raw createGenAIAdapter uses the wrapped generateContent, token helper uses wrapped countTokens. Supply the matching immutable counter getter to driver; do not monkeypatch product client methods or expose counter overrides/authority through CLI params. Native clock is performance.now. Validate report/current source through existing ledger before success, then success-only release. Never unlock in finally. Failure after a release effect is reported as failure with actual prefix retained, not repaired.

Retain existing injected CLI semantics by supplying real five hooks to runCalibrationCli; prepare asynchronous context/ledger BEFORE its synchronous model/profile hooks. For an unfinished stage, its createClient hook constructs/captures the exact native SDK client; executeStage verifies that same reference and calls the owned driver, capturing the safe execution result. Native raw port closures are stable lazy bindings that throw a static fatal if used before client construction; they never choose an alternate client. On an already-completed stage, the supplied createClient hook returns one private frozen inert object instead of constructing an SDK client; executeStage accepts only that exact object and performs idempotent native verification/reporting through the driver. All raw ports stay unbound and throw if incorrectly used. This object is only the existing injected hook argument, never an authority seal or persisted token. This permits preparing a driver without constructing a client on the already-completed path: check the validated selected-profile argument against the real held ledger, execute only idempotent verification/reporting, return existing receipts/zero new SDK invocations, then healthy release. Do not use constant model/profile hooks as substitutes for owned native state.

CLI `require.main` performs pure validation first and lazily imports native entry only on a valid invocation, breaking CLI→bootstrap→CLI import cycles. Print one JSON line containing owned NativeCliResult and set exitCode; never print raw caught errors. Add exactly `"eval:nutrition:calibration":"npm run build && node lib/nutrition-eval/calibration-cli.js"`. Do not change other scripts or lockfile for a scripts-only edit.

- [ ] **Step4: GREEN full native/legacy controls and exact real typing/build/lint.** Test malformed command through actual compiled main WITHOUT opt-in (no real client/network), native LOW full protocol, selected-profile mismatch before client, healthy repeat before client with zero new requests, fresh-owner source/report tamper rejection, incomplete/reserved prefix refusal, explicitly recovered unreserved eligibility, native acquisition/liveness refusal, token failure with zero image requests, native stage failure retains uncertain effects, report-pair publication failure, and healthy release before/after effect fault with honest bytes. All12 artifacts/sixbindings/158canonicalfinishes are asserted by actual native readers. Snapshots are read/parsed once per startup (four per invocation; no lease-time reread); twelve runtime barcode lookups cause no media/provider/OFF access.
- [ ] **Step5: Scoped code/result review, track, commit/push.** Source remains hermetic; fake inference is not measured3.8 accuracy. No live command is run, despite the now-runnable entry.

### Task 3: Qualify the complete native command and hand off live gates

**Files:** Plan/status only unless a genuine reviewed RED demands repair inside the map.

- [ ] **Step1: Run final real-source strict TypeScript, build/full lint and the whole new/old focused controls.** Strict command uses `npx tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --esModuleInterop --skipLibCheck --target ES2022 --lib ES2022 --module ESNext --moduleResolution Bundler --types node,vitest/globals` followed by `src/nutrition-eval/calibration-stage-driver.ts src/nutrition-eval/calibration-native-cli.ts src/nutrition-eval/calibration.ts src/nutrition-eval/calibration-cli.ts test/nutrition-eval/calibration-stage-driver.test.ts test/nutrition-eval/calibration-native-cli.test.ts test/nutrition-eval/calibration-native-controller-fixture-controls.test.ts test/nutrition-eval/calibration-native-controller-fixtures.ts`, including all transitive real imports. Run `npm run build`, `npm run lint`, then `npx vitest run test/nutrition-eval/calibration-stage-driver.test.ts test/nutrition-eval/calibration-native-cli.test.ts test/nutrition-eval/calibration-native-controller-fixture-controls.test.ts test/nutrition-eval/calibration-cli.test.ts test/genai-adapter.test.ts --no-file-parallelism --maxWorkers=1 --minWorkers=1 --reporter=default --reporter=json --outputFile=<new-owned-receipt>`. No selectors/only/retry/timeout changes.
- [ ] **Step2: Run required parent wide checks once on assembled source.** From functions, with disk task caches and `RUN_NUTRITION_EVAL_FETCH`/`RUN_NUTRITION_CALIBRATION_LIVE` unset: `npm run eval:nutrition:fixtures -- --no-file-parallelism --maxWorkers=1 --minWorkers=1 --reporter=default --reporter=json --outputFile=<new-owned-nutrition-receipt>`, then literal `npm run test:verify`. The latter must actually run build/lint/default tests/data-emulators/functions-load, not be renamed or inferred from units. Set pinned Vitest2 `VITEST_MAX_THREADS=1 VITEST_MIN_THREADS=1 VITEST_MAX_FORKS=1 VITEST_MIN_FORKS=1` so nested scripts remain single-worker; preserve all timeout/retry/include config. Configure task-backed TMP/cache/Java temp locations. Check emulator ports/ownership first; never stop another project or silently omit a blocked gate. Record exact blocker rather than green.
- [ ] **Step3: Inspect all receipts/actual exits, old multiset and declared budgets.** Baseline is final qualified benchmark source4368PASS+1existing image-fetch skip, not an assumed new total. Verify entire nutrition subset equals the DEFAULT counterpart, retain duplicate-name multiplicities and every old assertion; only new named tests add population. For the literal nested test:verify chain, main host creates a task-private CommonJS preload and appends its `--require=<absolute-path>` to process-scoped NODE_OPTIONS, preserving prior options. It acts ONLY on main-thread Node processes whose argv[1] realpath is this installed Vitest's vitest.mjs; npm/Firebase/worker threads/other scripts are untouched. Before CLI parsing it appends ONLY serial worker flags and default+JSON reporter/outputFile to a fresh PID-specific task log; records original/effective argv, cwd and PID; synchronous exit handler records actual child exit code. No selector/config/exclusion/retry/timeout flag is removed or changed. Unique receipts cover DEFAULT and each configured emulator Vitest child; parent actual0 plus every child receipt/exit must agree. Validate this tiny orchestration's process selection/argument append against the pinned local Node/Vitest entry before the real gate, with a non-test dry probe; record it as orchestration verification, not product-test evidence. Audit explicit fixtures/mock scope and full SDK/key/media/body accounting. No opaque transport/network/physical-death or runtime caloric-accuracy guarantee follows.
- [ ] **Step4: Whole-feature actual MCP code/results review and ONE fresh native whole-plan reviewer.** Complete actual current source/spec/plan/receipts, including all failures/corrections, not a count-only verdict; explicit agree/MUST_FIX none and independent findings by severity. Failed/empty/noisy attempts are not completed reviews. Scope actual native preparation/SDK-method proof, default/main imports and unchanged production behavior. Fix Critical/Important findings test-first through normal workers, rerun affected/final checks. Record minor rulings. Preserve inline method without per-task Codex reviewer delegation.
- [ ] **Step5: Final source/tracking commit/push and fresh committed focused check.** Run diff/config/source checks, commit/push exact owned files; source hash/Functions tree must match reviewed source. Run fresh unchanged-source committed focused command from Step1 with actual exit/JSON/multiset/budget checks. This plan requires full precommit parent verification plus committed focus, not an extra unchanged full DEFAULT after every checkpoint; no current benchmark-plan gate is waived. Close tracking only after actual success; preserve exact failures/owned artifacts otherwise. Cleanup only this plan's owned scratch to recoverable Trash when no jobs remain.

## Live work remains separate

This completes parent Task7 only when all its actual gates pass. Before any3.8 inference, parent Task8 still verifies clean source/Functions identity, ADC quota project `calorix-xurschnell`, billing/Vertex availability read-only without credentials, and the once-only preflight/development protocol; Tasks9–10 independently gate validation/benchmark and historical decision. No deployment or production model change is authorized by this plan. Current3.8 nutrition accuracy remains unmeasured until that real protocol runs.

## Written-plan self-review and review receipts

Inline self-review reconciled the existing native/helper interfaces, SDK response constructors, per-lease sample metadata, token/history/reentry/counter/error/release boundaries, and exact verification commands against the approved source/specs. The planned fixture controls establish real OFF normalization/gate adequacy before source implementation; these proposed product tests have NOT run. A private non-test Node preload dry probe actually verified exact/symlink installed Vitest selection, exclusion of unrelated mains/inherited workers, six appended serial/reporter/output flags, and synchronous exit recording for actual0/7. Existing selectors/retries/timeouts remain intact.

Antigravity MCP primary `gemini-3.8-flash` reviewed the entire normative v7 snapshot:214lines/36249bytes/SHA256 `09f9d87e5d671501868e2df018514b3130f9b2f82ce8bc667846488c0cb8a30d`. Scoped A/B/C1/native-CLI/qualification/delta reviews were followed by whole-plan aggregate and corrected aggregate in `calorix-native-controller-written-plan-final-20261028`: explicit `AGREEMENT_STATUS: agree`, `MUST_FIX: none`, `SHOULD_FIX: none`, scope `WHOLE_WRITTEN_PLAN_ONLY_PENDING_CURRENT_BENCHMARK_CLOSURE_AND_USER_REVIEW`. Current prerequisite closure is now recorded in the benchmark plan; user review is still pending. Publication changes only draft-status/self-review provenance, not reviewed tasks/interfaces/commands.

Review history is retained honestly: initial3.8 oversized and bounded calls timed out after300s; fallback3.7/3.6 routes rejected wrapper High effort. Exact dated errors are in implementation status. One actual late C1 response was recovered through MCP read_conversation and saved separately; original timeout remains failed. A fresh native-CLI thread completed agreement after an earlier failed D1 call. The corrected whole-plan response retracted an incorrect HEAD label and an unexecuted earlier status-inspection claim, then actually verified clean HEAD `d06c0556d4fd5bfa4ea778ca13183abc2bb539b9`; `cdb094b479ed733f6cdf8ba6f6311c8532466044` is the unchanged148-file Functions checkpoint. It also corrected sixbindings across FOUR stages2+2+1+1, twelve prepared-OFF-snapshot lookups (no provider-response cache), and the preload's six appended flags. None of the failed/noisy responses alone is green review.

Ruling: decline forced releaseLock in test afterEach; await owned work, inspect failed prefixes, remove exactly disposable fixture roots and restore spies. This preserves success-only release and truthful failure state; the reviewer explicitly agreed. Cost if wrong: cleanup must expose outstanding work rather than mask it; owned-root registration/awaits and failure-prefix assertions are required. No extra ledger method/authority/recovery is introduced.

This is written-plan constructibility review only; no implementation/test/SDK dispatch/liveaccuracy/security/production approval follows. The user authorized execution on 2026-10-28 and removed repeated plan-approval pauses within the approved roadmap. The established inline method and editing-worker order remain selected, with direct host edits authorized only after those routes are exhausted. Task-heading spacing is normalized for the existing task-brief extractor; task behavior, interfaces and verification requirements are unchanged.


## Execution amendment: independent fixture observations — 2026-10-28

Antigravity MCP primary3.8 in `calorix-native-controller-task1-fixture-foundation-20261028` agreed to the bounded TEST-ONLY interface amendment above (`PLAN_AMENDMENT_STATUS: agree`). The first329line helper candidate was explicitly rejected (`AGREEMENT_STATUS: disagree`, sixmustfixes, refined to8); no source or test outcome was accepted. The amendment makes already-required request-body, image/barcode isolation and hidden-retry controls constructible; no driverDeps/nativeCLI/product API, authority codec/event, dataset/model/metric/threshold or production file map changes. No new user approval is required within the approved roadmap.

Record SDK counters at actual method ENTRY, including forbidden/malformed calls; increment the fake transport counter only on actual fake transport delegation. `extraTransportOnVision` causes exactly one chosen fake SDK invocation to delegate twice, so an adversarial actual controller run yields146SDK/147transport and independent arithmetic qualification rejects it. Normal146/146 remains unchanged. Capture owned stable SDK request frames with the exact installed types. Native asset interception sees caseID and caller stage, not profile/sample; expose optional full key ONLY at the driver image-port boundary where it exists. Fake native media encodes caseID; derive LOW-fixture degradation from actual SDK thinkingConfig.thinkingLevel and caller stage, never invented native key metadata. Token media preparation may create a separate first-case load; never mislabel it as imageSDK dispatch or barcode-image access.

Implement all native-fixture root/bootstrap/factory/media/snapshot observations by delegating actual originals captured before spies. No empty `void options` placeholder, fabricated context/verifier/nativeGit/counters/products or history dispatch. Test files restore spies/owned roots only after awaited work/failure-prefix inspection; no forced failure unlock. Return all raw finished rows without Map/set dedupe, and throw for malformed finished rows. Remove the false generateChat classification for an omitted optional generateVision source. Route the driver token port through existing countCalibrationTokens with fixed firstDev prompt/media/timeout. Add real-parser controls for all4public labels as well as all4realOFF products; any malformed fake raw response must be repaired in fixture wire, never by weakening existing parser/normalizer/data/gates.
