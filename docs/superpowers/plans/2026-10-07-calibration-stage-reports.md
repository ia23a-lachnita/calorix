# Source-bound calibration stage reports implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans with test-driven-development and the mandatory AGENTS.md editing-worker route. Steps use checkbox tracking. Main owns planning, judgment, independent verification/review, commits and pushes; workers never commit or push.

**Goal:** Reconstruct complete, privacy-safe per-profile stage reports from digest-bound durable outcomes and immutable manifest truth, without losing interrupted or zero-request outcomes.

**Architecture:** Extend the strict ledger with a closed durable non-reservation event and one synchronous frozen stage snapshot. A pure assembler validates committed source bytes, consumes that snapshot, rescoring every prediction against manifest truth and emitting the existing report format with additive safe-error/latency coverage metadata. Existing six-field journals, cache/default/parser/normalizer/scorer semantics and image budget remain unchanged.

**Tech Stack:** Existing TypeScript, Node crypto, Zod, Vitest and atomic file ledger; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-23-gemini-38-nutrition-calibration-design.md`, parent `docs/superpowers/plans/2026-09-23-gemini-38-nutrition-calibration.md` Task7. This is report assembly, not complete CLI dispatch or live qualification.

**Baseline:** branch `fix/scan-photo-flow-viewer`, source journal `6e6535815a323ef32893e4587e85521b62389953`, tracking `6bcc02f4bff3bd9095e0f7d53ee898acc07f04cb`; Functions1932pass/1existing public-manifest skip, focused526/build/lint green. Completed snapshot/journal plans are not reopened.

## Global Constraints

Scoped user exception (2026-10-07T15:08:10Z): explicit “sure go on” authorizes the main host to make remaining application/test edits directly for this approved two-task report plan only. Earlier pending-authority statements are historical. All test-first, review, verification, commit/push, privacy and no-deploy/default/live-expansion gates remain. Current Task1 step: appended-fixture correction with original111016-byte prefix and source/config frozen, followed by host genuine RED before core-only guard fixes; checkpoint HEAD2e35f8e, implementation BASEf3052d1.

Documentation-only blocker checkpoint: same-conversation primarygemini-3.8-flash review corrected stale HEAD wording to implementationBASEf3052d1, then explicit agree/MUST_FIXnone, scopeONLYtrackingdocs. No Task1source/test acceptance, CODE/security/readiness green or completedtask checkbox follows from this receipt. Incomplete source/tests remain local/unstaged; docscheckpoint preserves failures/rulings/pendingauthority rather than publishing implementation.

Task1 blocked verification (2026-10-07T16:40:23+02:00): main focused6 **498pass/34fail532**, preserving all430existing+61original. 31real guardfailures, 3worker fixturefaults (premature sealedstage setup, out-of-scope helper, duplicate acquire). Currentnewtestlint4unused-variable errors. Paid lastactualcapconfirmed, session100% reset18:59; allstrongerfresh routes failed/unusable with exact history in status. No Task1codeacceptance/commit/fullsuite/CODEgreen/Task2; originaltestprefix/source/config frozen. Next: valid appendedfixtures/genuineRED first, core-onlyguardfix second, all original verification/review/checkpoints still required. Userdirecteditingexception question pending, NEVER inferred from defaultoption.

Worker runtime ruling (2026-10-07T16:20:18+02:00): repeated invalid fixtures/native-tool violations and a guarded run ignoring the specific TypeScript brief for Dart searches make the current Lightning route unusable for this bounded deliverable. Stop only its verified ownedscope and try next canonical route after recording worker_scope_drift/invalid_output, not fabricated providerquota. Cost if wrong: discard a potentially recoverable worker context, but preserve its partialtest state and all source/verification gates. Directhost edits still require explicit user policy exception; optional async question does NOT grant authority by default.

Worker tool ruling (2026-10-07T16:13:56+02:00): after repeated nativeEdit despite parser-only prompts, apply process-local OPENCODE_CONFIG_CONTENT permission editdeny (including buildagent override) while retaining Bash for the approved patch parser. No repository/globalconfig edits, no added authority or modelroute change. Official https://opencode.ai/docs/permissions/ confirms explicitdeny persists under --auto; https://opencode.ai/docs/config/ documents inline runtime overrides. Cost if wrong: worker tool invocation may refuse or require another bounded correction; host never accepts unknown writes or bypasses patch requirement. Native misuse is recorded, not silently treated as compliance.

Worker startup ruling (2026-10-07T15:52:19+02:00): fresh free editing worker with NO agent event and NO file mutation is bounded at5minutes initial startup; active work with events retains the existing15minute inactivity bound. Pi swap is full and a silent worker/MCP scope consumes roughly750MB while doing no task work. Record host_startup_timeout (not fabricated providerquota), verify frozen targets and stop only exact owned invocation before canonical fallback. Cost if wrong: interrupt a legitimately slow free startup; next approved route retains all contracts/tests and no incomplete result is accepted.

Task1 tests ruling (2026-10-07T15:15:12+02:00): independently execute every appended negative fixture rather than masking later cases behind the first failed assertion; replay negatives must use independently constructed closed valid-digest durable events, not the live call being fixed. Original61 prefix remains frozen. Existing prediction codec already rejects cachedtrue, disproving that part of the provisional diagnosis/review; retain GREEN regression coverage without redundant production logic. Cost if wrong: extra tests-only verification time, with no scope expansion. Original8 appended tests6RED2GREEN/lint0 are baseline evidence, not accepted complete coverage or CODE approval.

- Exact provider identity remains `calorix-xurschnell` / `us` / `gemini-3.8-flash` / APIv1. No provider constructed or request sent by this plan; historical2.5 aggregates only.
- Planned146 image reservations, ceiling300. Non-reservation outcomes never call reserve, dispatch vision, increment image counters or create synthetic reservations.
- Preserve existing prompt, JSON response schema, parser, normalizer, scorer, Review policy, default CLI primitive and generic v1 report compatibility. All successful meal predictions stay needs_review.
- Preserve original six-field serialization/hash and seven-field codec. ErrorCategory none requires a valid normalized success; do not redefine completion as HTTP transport-only success.
- No raw responses/prompts/images/names/URLs/credentials/errors/causes/stacks/paths in events, snapshots or reports. Source manifests remain unchanged. Never access protected `.mcp.json` except SHA, never stage it.
- All new external object/array data boundaries capture enumerable own data descriptors, reject hidden/symbol/unknown/accessor/nonplain records and caller coercion, freeze owned copies only, replace foreign exceptions with fresh static causeless fatals without inspection.
- Existing feature checkout and existing dependencies only. Task workspace/TMPDIR/logs under `.superpowers/sdd/2026-10-07-calibration-stage-reports/`, verifiedext4; serial Vitest, no large `/tmp` data or sibling-workspace access.
- No deploy/cloud/client/device/UI/emulator operation, threshold change, retry/rerun or production promotion. Report file/hash persistence, SDK/runner dispatch integration, Stage0 metadata wiring, full146/60 request proof and live stages remain parent gates.
- Complete report data is not a passed stage. Dataset zero-request outcomes and unknown interrupted latency cannot manufacture planned call counts or exhaustive timing evidence; existing controller/accounting/gates remain mandatory.

## Review Focus

1. Selecting the wrong same-key journal or losing failed journalHash during live/replay recovery must not change reconstructed failure categories, counters or predictions.
2. Non-reservation results must survive restart with their measured runtime metadata, without acquiring an image reservation or accepting duplicate/conflicting/cross-source outcomes.
3. Wrong/missing/repeated/cross-profile case/sample coverage or caller replacement truth/metrics must fail; valid but inaccurate predictions must be scored, not filtered or repaired.
4. Per-report counts and measured/missing latency must be truthful: interruption zero is a sentinel, not a measured zero; 146 cumulative reservations cannot fill a24-outcome report.
5. Hostile descriptors/coercion, altered source bytes, callback mutation/failure and unknown safe-error names must fail before writes/reads/effects; old v1 reports and legacy APIs stay usable.

## Shared interfaces

Types below belong to new pure `calibration-report-state.ts`; use type-only imports from calibration/schema and type re-exports from calibration as needed to avoid a runtime cycle. Name and field contracts are fixed across both tasks.

```ts
export interface CalibrationReportOutcomeKey {
  readonly stage: StageName;
  readonly profile: CalibrationProfile;
  readonly caseId: string;
  readonly sampleIndex: number;
}
export interface CalibrationPlannedReportOutcome {
  readonly key: CalibrationReportOutcomeKey;
  readonly scanMode: 'meal' | 'label' | 'barcode';
}
export interface CalibrationProtocolReportOptions {
  readonly getReportOutcomePlan: (
    selectedProfile?: CalibrationProfile,
  ) => readonly CalibrationPlannedReportOutcome[];
}
export interface CalibrationNonReservationEntry {
  readonly key: CalibrationReportOutcomeKey;
  readonly reason: 'barcode' | 'dataset';
  readonly prediction: NutritionPrediction;
}
export interface CalibrationNonReservationOutcome
  extends CalibrationNonReservationEntry {
  readonly contentDigest: string;
  readonly at: string;
}
export interface CalibrationNonReservationLedgerEvent
  extends CalibrationNonReservationOutcome {
  readonly type: 'non_reservation_result';
}
export type CalibrationImageTerminalOutcome =
  | {
      readonly status: 'completed';
      readonly key: ReservationKey;
      readonly journalHash: string;
      readonly journal: JournalEntry & { readonly reportPrediction: NutritionPrediction };
    }
  | {
      readonly status: 'interrupted_reservation';
      readonly key: ReservationKey;
      readonly journalHash: string;
    };
export interface CalibrationStageReportSnapshot {
  readonly stage: StageName;
  readonly profile: CalibrationProfile;
  readonly identity: Readonly<CalibrationIdentity>;
  readonly startedAt?: string;
  readonly selectedProfile?: CalibrationProfile;
  readonly pinnedModelVersion?: string;
  readonly counts: {
    readonly imageCallsReserved: number;
    readonly imageCallsCompleted: number;
    readonly imageCallsFailed: number;
    readonly imageCallsPending: number;
  };
  readonly images: readonly CalibrationImageTerminalOutcome[];
  readonly nonReservations: readonly CalibrationNonReservationOutcome[];
}
export function captureCalibrationNonReservationEntry(value: unknown): CalibrationNonReservationEntry;
export function captureCalibrationNonReservationEvent(value: unknown): CalibrationNonReservationLedgerEvent;
export function captureCalibrationStageReportSnapshot(value: unknown): CalibrationStageReportSnapshot;
```

Optional snapshot fields are absent when unavailable, not present undefined. Snapshot identity is the unchanged exact canonical identity contract, never an owner/baseDir copy. Key has exactly four fields and existing enum/token/sample rules. Interrupted variant deliberately contains no prediction or measured latency. Completed variant has full seven-field journal validated by existing codec, same key, SHA256 of its canonical full entry matching journalHash. Interrupted hash must match exact canonical original six-field interruption body (null numerics, latency sentinel0, category/hash interrupted_reservation, versionn/a); no alternate journal selection.

Non-reservation event is exactly `type,key,reason,prediction,contentDigest,at` in that order. Prediction uses the existing closed full-prediction codec. Timestamp is canonical valid ISO. Digest is SHA256 of canonical `JSON.stringify({key,reason,prediction,at})`, not including self/type. Full prediction and actual measured latency are retained without rerunning normalization on restart. Event codec rejects missing/invalid digest and any extra/private field, including stable-looking unapproved categories.

## Task 1 — Durable non-reservation outcomes and one strict read model

**Files:** create `functions/src/nutrition-eval/calibration-report-state.ts`, `functions/test/nutrition-eval/calibration-stage-outcomes.test.ts`; modify `functions/src/nutrition-eval/calibration.ts`, `functions/src/nutrition-eval/calibration-bootstrap.ts`. Existing journal codec, file-store serialized layout, adapters/runner/defaults remain untouched. Update this plan/status.

**Produces:**

```ts
// Existing three-argument callers retain their behavior.
export function createProtocolCalibrationLedger(
  deps: CalibrationLedgerDeps,
  identity: CalibrationIdentity,
  keyResolver: CalibrationKeyResolver,
  reportOptions?: CalibrationProtocolReportOptions,
): CalibrationProtocolLedger;

// New strict-only methods; legacy CalibrationLedger remains unchanged.
recordNonReservationResult(entry: CalibrationNonReservationEntry): string; // returns contentDigest
getStageReportSnapshot(stage: StageName, profile: CalibrationProfile): CalibrationStageReportSnapshot;

// Bootstrap helper consumes pinned committed strings, no IO/provider callback.
export function deriveCanonicalReportOutcomePlan(
  files: Record<CalibrationPreflightFileName, string>,
  selectedProfile?: CalibrationProfile,
): readonly CalibrationPlannedReportOutcome[];
```

Source planner captures relevant input strings once; calls unchanged deriveCanonicalAllowedKeys on owned strings to verify pinned calibration bytes/public semantic hash and unknown-key policy, then parses the same owned source strings. Plan is source slot/sample order: preflight firstdev once eachLOW/MED, development24once eachLOW/MED; after selection validation16x3 and benchmark20x3 at selectedprofile. Initial50 report keys equal50 image keys; expanded158 report keys include146 image keys plus12 supplied-barcode keys. ScanMode comes source, not caller prediction. No source cases/truth/URLs are stored in the plan. Freeze every owned row/key/array, static `calibration:report-outcome-plan-invalid` on foreign/malformed input.

Optional reportOptions is exact own-data single-callback record. Capture before use; invoke/copy plan once initially and once before selected expansion effects. Validate dense closed rows, key enums/ranges/tokens, uniqueness and initial50/expanded158 cardinality, image-key correspondence and barcode-only extra12 benchmarkselected keys. Preflight/dev/validation image rows are meal; benchmark vision12meal+4label and extra4barcode across3 samples. No new event accepted without a report plan. Do not reread mutable resolver results or invoke resolver callbacks from readonly snapshots. Bad initial/expanded plan fails before any corresponding persistence.

recordNonReservationResult requires owned lock and unpoisoned state. Capture entry and closed prediction before clock/effect; match active planned key/scanMode and stage/profile prerequisites. Dataset reason requires planned image key, failureCategorydataset, no image reservation. Barcode reason requires selected benchmark barcode key: accept valid barcode success OR stable product failure (`off_product_invalid`/`off_product_not_found`), never silently discard a catalog/normalization failure. No image-key success without reservation. Reject any already reserved, already recorded, conflicting or cross-source key; reserve later for an already non-reserved key must likewise fail. Neither token/image counts nor image reservation events are added. Write the closed event via existing persistLedgerEvent/fsync sequence, update internal index only after success; persistence failure keeps existing poison/fail-stop behavior.

Add strict replay handling for that event; verify exact envelope, captured prediction/digest/timestamp, allowed plan and stage/profile, no duplicates/reservation collisions. Reuse existing JSON-array event file and append/fsync, not a second parser/file or generic legacy format change. Current legacy mode rejects new events; existing strict mode without options rejects them too. Expansion must replay the same source plan before downstream events are accepted.

Retain bound failed journalHash on BOTH runtime recovery and strictReplayFailed after canonical validation. Do not change serialized failed events/journals or existing completed-only accessor/rebuild/recovery result contract. Track first existing reserved event timestamp for each stage/profile in live and replay state; new non-reservation event may establish it when it is first. Reuse already validated/captured timestamp and existing clock invocation, not an extra clock call or caller field reread. Getter returns that persisted startedAt, never Date.now, enabling stable report identity after restart.

Getter guards primitive stage/profile before indexing and calls checkPoison. One synchronous pass selects matching reservations, resolves every terminal ONLY by recorded journalHash, validates/copies seven-field completed or canonical interruption, and combines owned durable non-reservation rows. Counts derive from matching actual reservations: errornone success →completed, nonnone/interruption→failed, reserved→pending. completed+failed+pending=reserved. Non-reservation results don't enter these counters. Snapshot does not pin/reserve/recover/retry/write/call resolver/clock. Missing completed full metadata fails `calibration:report-prediction-missing`; missing bound terminal fails static `calibration:stage-report-state-invalid`. Freeze owned snapshot deeply; no caller/private internal references returned.

- [x] **Step 1: Tests only.** Worker writes new codec/real-file strict replay tests and planner tests, no source/stubs. Use real existing committed manifest texts, actual file ledger and valid strict stage progression. New-export loading must keep test collection healthy before source. Include all five focus areas relevant to this task.

```ts
const before = ledger.getCounts();
const digest = ledger.recordNonReservationResult({key, reason: 'dataset', prediction});
expect(ledger.getCounts()).toEqual(before);
expect(digest).toMatch(/^[0-9a-f]{64}$/);
const snapshot = ledger.getStageReportSnapshot(key.stage, key.profile);
expect(snapshot.nonReservations).toEqual([{key, reason: 'dataset', prediction, contentDigest: digest, at}]);
expect(snapshot.counts.imageCallsReserved).toBe(0);
expect(reopened.getStageReportSnapshot(key.stage, key.profile)).toEqual(snapshot);
expect(Object.isFrozen(snapshot.nonReservations[0]?.prediction)).toBe(true);
```

Required cases: six-field legacy bytes/hash/oldAPI preservation; absent report options; missing/completed numeric-only metadata; real live/replayed interruption retains exact recorded hash and no measured latency/prediction; alternate same-key journal cannot replace recorded completed/failed digest; pending counts; stage/profile filter and first timestamp stable acrossread/restart with zero clock/effects; dataset outcome0reservations; actual barcode success and product failure0reservations; duplicate/conflict/late reserve/cross-source/profile/sample; digest/value/removal/unknown-event tamper; identity/callback/descriptor/ownKeys/coercion traps and post-call mutation; persistence failure poisoning. Barcode fixture may use simple valid closed outputs here; actual snapshot/normalizer proof belongs Task2. Do not count existing protections as new RED.

- [x] **Step 2: Host RED.** Main runs focused below and changed-test lint; existing suites green, new failures missing exports/methods or rejected newevent. Correct fixture errors through worker before source; freeze tests and verify original source/protected hashes.
- [x] **Step 3: Source only.** Worker implements shared types/codecs, optional planner routing, durable collector, failed hash retention and single getter on the stated allowlist. Scoped user exception permits host guard correction. No test weakening or extra refactor. Implementation core for hash/order is explicit:

```ts
const at = strictNowIso();
const contentDigest = createHash('sha256')
  .update(JSON.stringify({key: owned.key, reason: owned.reason, prediction: owned.prediction, at}), 'utf8')
  .digest('hex');
const event = {type: 'non_reservation_result' as const, key: owned.key,
  reason: owned.reason, prediction: owned.prediction, contentDigest, at};
// Validate owned plan/state, then persist using existing durability path;
// only successful persistence enters private non-reservation/stage-start indexes.
```

- [x] **Step 4: Main GREEN/review.** Focused531, Functions build/lint0/full2033pass1existing skip, newfile/staged whitespace and protectedSHA. Primary3.8 transport timeout recorded; fallback3.7 substantive review carried response noise, then same-conversation clean explicit agree/MUST_FIXnone Task1CODE receipt. One fresh native whole-plan review occurs after Task2, not duplicated here. No live dispatch/accuracy/readiness approval.
- [x] **Step 5: Checkpoint/task-done.** Commit f4bb5a94a7d52912af0547a125e905e2a1bad0bb pushed0/liveorigin equality; postcommit task-done full2033pass1existing skip2034 exit0,41files. Tracking-close follows, next Task2. This readmodel is not report/driver/live146 proof.

Focused:

```bash
npm --prefix functions test -- --reporter=dot --maxWorkers=1 --minWorkers=1 test/nutrition-eval/calibration-stage-outcomes.test.ts test/nutrition-eval/calibration.test.ts test/nutrition-eval/calibration-file-store.test.ts test/nutrition-eval/calibration-canonical-keys.test.ts test/nutrition-eval/calibration-protocol-session.test.ts test/nutrition-eval/calibration-report-journal.test.ts
```

Expected RED: new behavior only, no fixture/legacy failures. Expected GREEN: all focused cases pass. Whole task: `npm --prefix functions run build`, `npm --prefix functions run lint`, `npm --prefix functions test -- --reporter=dot --maxWorkers=1 --minWorkers=1`, exit0 with only existing public-manifest skip.

## Task 2 — Complete pure source-bound report assembly and additive metadata

**Files:** create `functions/src/nutrition-eval/calibration-report-assembly.ts`, `functions/test/nutrition-eval/calibration-report-assembly.test.ts`; modify `functions/src/nutrition-eval/schema.ts`, `functions/src/nutrition-eval/report.ts`, focused existing schema/report tests if needed. Consume Task1 interfaces; do not edit adapters/runner/defaults/CLI/pinned assets. Update this plan/status.

**Produces:**

```ts
export interface AssembleCalibrationStageReportParams {
  readonly stage: StageName;
  readonly profile: CalibrationProfile;
  readonly context: Readonly<CalibrationPreparedContext>;
  readonly readSnapshot: (
    stage: StageName, profile: CalibrationProfile,
  ) => CalibrationStageReportSnapshot;
}
export function assembleCalibrationStageReport(params: unknown): Promise<NutritionEvalReport>;
```

No caller-scored results, truth overrides, comparison objects, runId/timestamp/hash overrides or barcode reruns. Capture exact own-data request/context relevant fields and all source/identity strings before firstawait; no unused owner/path serialization. Revalidate same owned files through existing verifyCalibrationPreflightState with a complete owned files map (no native reader fallback), canonical key planner and manifest parsers. Context identity must equal snapshot immutable identity and pinned lock contracts. Snapshot callback captured once, invoked once after structural/source checks, captured via Task1 snapshot codec before further use. Callback errors become fresh static causeless `calibration:stage-report-read-failed`, never inspected. Invalid source/shape errors are static `calibration:stage-report-invalid`; incomplete coverage is static `calibration:stage-report-incomplete`.

Select source cases: preflight first development slot1/sample1; dev24/sample1; validation16/sample1..3; benchmark20/sample1..3. Onlyvalidation/benchmark require requested profile equal snapshot selectedProfile. Preflight/dev can reconstruct both profiles after selection. Resolve all rows to immutable sourcecase/sample; refuse pending reservations, missing/extra/duplicate/cross-source/profile rows or forged counts. Every expected tuple must have exactly one image terminal or legitimate durable non-reservation outcome; barcodes never image rows. Do not silently filter invalid tuples/pad partial reports. VALID inaccurate nutrients/mass/barcode/basis must remain and be scored; only sourcebinding/schema violations reject.

Use existing scoreNutritionCase for EVERY prediction against sourcecase truth, including barcode/product/dataset failures. Interrupted variant becomes an owned fail-closed prediction `{parseStatus:'failure',source:evalCase.scanMode,decision:'error',failureCategory:'runner',failureCode:'interrupted_reservation',sampleIndex,cached:false}` with no latencyMs/nutrients/actual model response; do not run it through the provider journal codec, which excludes runner failures. Preserve all measured completed/non-reservation latency exactly. Output in source slot order, sampleascending, not append/arrival order. Existing scorer/aggregate/report builder remains unchanged.

Metadata comes verified source and snapshot only: protocolVersion CALIBRATION_PROTOCOL_VERSION (not ledger's short v1), projectcalorix-xurschnell, locationus, model/adaptergemini-3.8-flash, thinkingLevelprofile, responseSchemaHashidentity, codeShaimplementationCommit. Preflight/dev/validation datasetId from strictcalibration manifest and datasetHash=CALIBRATION_MANIFEST_SHA256; benchmark publicdatasetId and datasetHash=CALIBRATION_PUBLIC_MANIFEST_HASH. Root identity.datasetHash remains the unchanged public epoch hash; do not blindly copy it into training-corpus reports. Prompt hash pinned identity, samples1/3 bystage, baselineOnlyfalse, publicCases1/24/16/20, privateCases0. Timestamp is snapshot.startedAt; missing timestamp refuses completeness. runId is deterministic `calibration-${stage}-${profile.toLowerCase()}-${implementationCommit.slice(0,12)}-${startedAt.replace(/[^0-9TZ]/g,'')}`; no new wallclock call. No comparison/deltas added in this slice; future controller uses existing strict committed historical comparator, never caller-supplied values.

Add optional fields to CalibrationInfoSchema and type (preserve old v1/calibration fixtures), with exact closed nested shapes:

```ts
safeErrors?: Array<{
  caseId: string;
  sampleIndex: number;
  errorCategory: Exclude<CalibrationSafeErrorCategory, 'none'>;
}>;
latencyCoverage?: {
  measuredCases: number;
  missingCases: number;
};
```

safeErrors only enumerated13stable non-none categories; no free string dictionary/rawtext. Built reports always have these fields: one safeError for each failed image terminal in source/sample order (outercategory or interrupted_reservation), no invented provider errors for dataset/barcode0-request failures; latencyCoverage measured/missing fromactualprediction presence. Schema validates closed fields, ranges, uniqueexisting failure case/sample bindings, safeErrors.length=imageCallsFailed when supplied, latency counts sum=report.cases.length and matchactuallatency presence. Optionalabsence preserves oldreports, presentundefined/null/unknown/rawcategory rejected in new builder boundaries. New Markdown displays safeerrors and measured/missing counts only whenpresent; old renderings unchanged whenabsent.

Build through buildNutritionEvalReport, validate privacy using public renderNutritionEvalJson/Markdown withoutwrites, deeply freeze owned finalreport. Same durable snapshot/source produces identical JSON/Markdown and hashes afterrestart. No report file/hash persistence or stagecompletion in this puremodule. Unknownlatency remains visible; future controller must not call incomplete timing evidence exhaustive or infer promotion from dataassembly alone.

- [x] **Step 1: Tests only.** Write real-file reports using Task1 factory/planner and locked committedsource cases; no source until main RED. Use actual prepared context/input verification and current default scorer/schema/report functions, not fake ledger/scorer. Actualbarcodes use prepared OFF store + existing liveadapter/defaultnormalizer + calibration runner with controlled clock, image/generate/fetch/cache hooks trapped; persist resulting closed predictions once then restart without normalizer rerun.

```ts
const report = await assembleCalibrationStageReport({stage, profile, context,
  readSnapshot: ledger.getStageReportSnapshot});
expect(report.cases).toHaveLength(60);
expect(report.calibration?.imageCallsReserved).toBe(48);
expect(report.calibration?.safeErrors).toEqual([]);
expect(report.calibration?.latencyCoverage).toEqual({measuredCases: 60, missingCases: 0});
const restarted = await assembleCalibrationStageReport({stage, profile, context,
  readSnapshot: reopened.getStageReportSnapshot});
expect(renderNutritionEvalJson(restarted)).toBe(renderNutritionEvalJson(report));
```

Required cases: both preflight1 and development24profile reports, validation48 and benchmark60slot/samples; actual12barcode outcomes preserved with measured clock values and0vision/OFF/reservation/cache effects; product error preserved; dataset pre-request failure0imagecount/fullcoverage; interruption omittedlatency and safeerror/counts identical live/replay; public/training dataset identity distinction; immutabletruth under source/callback mutation; wrong valid nutrient/mass/barcode scored errors ratherthan rejected; missing/duplicate/extra/wrongsource/profile/sample/pending/forgedcounter/timestamp/identity/sourcehash; hostilegetters/proxies/coercion/foreignerrors with zerobefore-read effects; allrequired macro/mass/density metrics vsindependent literals; oldv1 fixture/schema/Markdown unchanged; safeerrorunknown/raw fields rejected; zero reads/writes/reserves/pins/recoveries/clock/provider effects in assembly. Manual ledger146reservations is NOT fake-driver146dispatch proof; report this boundary explicitly.

- [x] **Step 2: Host RED.** Focused8 corrected44missing-assembly RED/480pass; complete newtest57RED/1historiccontrol58, lint0. Source/protected frozen beforeimplementation. Explicit scoped user exception permits direct-host corrections of invalid test assertions; current tests refrozen de5d0877.
- [x] **Step 3: Source only.** Implement assembler and additive metadata/rendering on stated allowlist; reuse Task1 codecs/sourceplanner and existing verifier/scorer/renderer, no private assertPrivate/barrel/index or scoreoverride. Corrected build0/new58tests and focused537green; native/full final gates remain open. Assembly algorithm is fixed:

```ts
// After owned source/snapshot validation and exact expected tuple coverage:
const sampleIndices = stage === 'preflight' || stage === 'development' ? [1] : [1, 2, 3];
const sourceById = new Map(sourceCases.map((evalCase) => [evalCase.id, evalCase]));
const ownedPredictionByKey = new Map<string, NutritionPrediction>();
for (const row of [...snapshot.images, ...snapshot.nonReservations]) {
  let prediction: NutritionPrediction;
  if ('status' in row && row.status === 'interrupted_reservation') {
    prediction = {parseStatus: 'failure', source: sourceById.get(row.key.caseId)!.scanMode,
      decision: 'error', failureCategory: 'runner', failureCode: 'interrupted_reservation',
      sampleIndex: row.key.sampleIndex, cached: false};
  } else if ('status' in row) {
    prediction = row.journal.reportPrediction;
  } else {
    prediction = row.prediction;
  }
  ownedPredictionByKey.set(`${row.key.caseId}:${row.key.sampleIndex}`, prediction);
}
const results = sourceCases.flatMap((evalCase) =>
  sampleIndices.map((sampleIndex) => scoreNutritionCase(evalCase,
    ownedPredictionByKey.get(`${evalCase.id}:${sampleIndex}`)!)));
const imageByTuple = new Map(snapshot.images.map((row) =>
  [`${row.key.caseId}:${row.key.sampleIndex}`, row]));
const safeErrors = results.flatMap((result) => {
  const row = imageByTuple.get(`${result.caseId}:${result.prediction.sampleIndex}`);
  if (row === undefined) return [];
  const errorCategory = row.status === 'interrupted_reservation'
    ? 'interrupted_reservation' : row.journal.errorCategory;
  return errorCategory === 'none' ? [] : [{caseId: row.key.caseId,
    sampleIndex: row.key.sampleIndex, errorCategory}];
});
const measuredCases = results.filter((result) => result.prediction.latencyMs !== undefined).length;
const timestamp = snapshot.startedAt!; // required by completeness checks above
const metadata: NutritionEvalReportMetadata = {
  runId: `calibration-${stage}-${profile.toLowerCase()}-${snapshot.identity.implementationCommit.slice(0,12)}-${timestamp.replace(/[^0-9TZ]/g,'')}`,
  timestamp, datasetId: stage === 'benchmark' ? publicManifest.datasetId : calibrationManifest.datasetId,
  datasetHash: stage === 'benchmark' ? CALIBRATION_PUBLIC_MANIFEST_HASH : CALIBRATION_MANIFEST_SHA256,
  adapterModelId: 'gemini-3.8-flash', promptHash: snapshot.identity.promptHash,
  codeSha: snapshot.identity.implementationCommit, samples: sampleIndices.length,
  baselineOnly: false, publicCases: sourceCases.length, privateCases: 0,
  calibration: {protocolVersion: CALIBRATION_PROTOCOL_VERSION, project: 'calorix-xurschnell',
    location: 'us', model: 'gemini-3.8-flash', thinkingLevel: profile,
    schemaHash: snapshot.identity.responseSchemaHash, stage,
    imageCallsReserved: snapshot.counts.imageCallsReserved,
    imageCallsCompleted: snapshot.counts.imageCallsCompleted,
    imageCallsFailed: snapshot.counts.imageCallsFailed,
    safeErrors, latencyCoverage: {measuredCases, missingCases: results.length - measuredCases}},
};
const report = buildNutritionEvalReport(results, metadata);
renderNutritionEvalJson(report);
renderNutritionEvalMarkdown(report);
// Freeze owned validated report; return it, no output-file or ledger write.
```

- [x] **Step 4: Host GREEN and whole-plan review.** Focused/build/lint/full serial suite/whitespace/protectedSHA. One fresh native read-only most-capable whole-plan review of both tasks, exact source/spec/ledger/rulings and fivefocus items; regradeactualeffects, Important/Critical one tests-first correction pass, deferminors. Mandatory same-workstream finalMCP CODE/result agree/none; no empty/noisy/failed receipt counts.
- [x] **Step 5: Checkpoint/task-done/close.** Update plan/status, commit `Assemble source-bound calibration stage reports`, push/liveoriginexact, postcommit taskdonefull, tracking-close. Preserve everyruling/minor in committedplan before cleaning only thisworkspace. Keep branch/worktree, no merge/PR. Continue parentCLI/dispatch/report-filehash/gateintegration, notnewlive/defaultclaim.

Focused:

```bash
npm --prefix functions test -- --reporter=dot --maxWorkers=1 --minWorkers=1 test/nutrition-eval/calibration-report-assembly.test.ts test/nutrition-eval/calibration-stage-outcomes.test.ts test/nutrition-eval/report.test.ts test/nutrition-eval/schema.test.ts test/nutrition-eval/scorer.test.ts test/nutrition-eval/calibration-report-journal.test.ts test/nutrition-eval/calibration-off-snapshot-store.test.ts test/nutrition-eval/historical-reference.test.ts
```

Expected RED: onlynewmetadata/assembly missing, no legacy/fixture failures. ExpectedGREEN: all focused pass. Whole taskbuild/lint/full commands asTask1; existingpublic-manifestskip only. Flutter/APK/UI/emulator/livegates intentionally omitted for unused offline Functions plumbing; parent full CLI test:verify/fixtures remain activation gates.

## Review and sequencing record

### Final native review and regrading

Fresh gpt-6-astra whole-plan review completed after an earlier usage-limit attempt produced no verdict. Critical: none. Accept two Important findings, independently reproduced by36genuine RED cases: direct new report metadata must be descriptor-captured before Zod traverses calibration children; malformed four-argument report options must reject before the key resolver. One tests-first correction pass covers both, including a narrow Task1core ordering amendment in the Task2 checkpoint. Existing entire Task1 test155189-byte prefix remains identical; source changes only after accepted RED. Mandatory final MCP still follows changed code.

Minor (deferred): strengthen semantic negative fixtures beyond earlier digest/codec rejection (independently valid wrong-source/unplanned tuples, real pending-count snapshot, actually absent selection). Code guards exist and current suites pass, but those fixtures can reject earlier than their named guard; no claim of exhaustive hostile-input verification.

Rulings on every declined-to-judge item:

- Live model behavior, calorie accuracy, full146 dispatch, production readiness and cloud/device operation remain outside this offline plan; no live requests or readiness approval. Cost if wrong: qualification remains incomplete, not silently inferred from unit tests.
- CLI/controller integration, report persistence/hash publication, stage advancement with dataset failures and promotion gates remain explicit parent work; pure assembly never completes a stage. Cost if wrong: upstream integration still needs verified accounting/gates before use.
- Whole-ledger deletion or malicious recomputation of every digest is not authenticated by the existing storage and no authenticated chain is added. Cost if wrong: adversarial storage integrity remains outside current hash-binding assurances.
- Existing scorer denominator/overflow and seven-field journal semantic pairings are reused unchanged, not comprehensively requalified; new literal checks cover required reconstruction metrics only. Cost if wrong: pre-existing arithmetic/semantic edge cases remain, without a new accuracy claim.
- Unrelated legacy builder/schema hostile-input behavior is not globally refactored; normal old v1 reports and absent-addition behavior remain the compatibility gate. Cost if wrong: legacy hostile inputs remain outside the new metadata boundary claim.
- Final verification is the host's responsibility; review statements never substitute for fresh focused/build/lint/full and postcommit task-done output. Cost if wrong: stale results could be mistaken for final success, prevented by explicit pending gates and exact-source verification.

Task2 Ruling: correct two test-only assertion defects revealed only after the missing assembly export existed — generic numeric relative error intentionally retains max(abs(truth),1), separately from zero-safe summaries; compare hostile foreign error identity with primitive boolean so Chai cannot inspect its proxy. Initial source passed56/58; frozen-source narrow fixture correction preserves all behavioral assertions and canonical scoring rather than changing source to satisfy invalid tests. Cost if wrong: a weakened boundary assertion, mitigated by explicit zero-trap-read count, fresh static causeless fatal checks, independent zero-safe/mass/density literal metrics, focused/full/native/external review gates. No production behavior or scope change.

Task2 assertion follow-up: corrected focused8 has536pass/1assertionfailure537, all7existing suites green. First committed development truth has zero carbohydrate, so its diagnostic relative error must be absent, not1; retain zero-truth semantics while positive-truth diagnostics stay explicit. Source unchanged for this correction. Compiler TS2367 also rejects an impossible reserved terminal variant; pending is represented by snapshot.counts.imageCallsPending and already refused before row processing, so remove only that unreachable branch. Retain all runtime pending/coverage checks. Build/lint/focused/full/review still required; no behavior relaxation.

Task1 guard correction pre-review: primary3.8 consultation timeout300s observed2026-10-07T14:38:56+02:00 before canonical3.7; source/tests/protected unchanged. Main independently491focused green but six read-only malformed-input probes were accepted, including getters invoked1. Clean3.7 review disagreed with four MUST_FIX: new descriptor boundaries, modes/triples/prefix, lifecycle/sealed/cachedfalse, cached-plan activation/consistency. Same-conversation3.7 clarification explicitly withdrew clearing captured expanded cache (would violate callback-once) and approved retaining owned immutable captured plans, selection-gated activation, and revalidation against actual replayed profile/key universe/source shape/prefix on every selection. Clarified correction PLAN: agree/none, not CODE approval. Ruling: preserve callback-once while resetting active replay state and refusing stale capture; cost if wrong is undetected stale-profile/universe replay, covered by added positive/negative regressions and final CODE gate. Original61 prefix111016bytes remains frozen; append targeted tests only before corrections. Session-limit worker first stopped before edits; literalusage later12%session/24%week, extrausage not reported; same paid route tests-only retry.

Task1 source work is bounded into state module, source planner, then strict ledger integration after the first paid response returned `max_tokens`/64000 without patches. Same literal editing model at medium effort, fixed interfaces and frozen tests; cost if wrong is additional worker/check cycles, never reduced acceptance gates. State piece main verification:21codec pass/40filtered, build0/new-source lint0, whole focused6 after state30missing-feature RED/461pass491 (430existing green). This is a partial source checkpoint, not Task1 completion or code approval. Complete preflight source record has seven fields (five committed asset texts plus prompt/response-schema); do not confuse committed asset path allowlist with its full source record. Exact task-owned temporary preparation files were cleaned after worker inactive; source preserved.

Workstream `calorix-stage-report-assembly-20261007`; primary3.8 RESEARCH timeout300s recorded07:09:21 before canonical3.7. Initial3.7 agree/none had documented contract inaccuracies; narrow3.7 correction agree/none confirms closed accounting, unknown interrupted latency, failed hash retention, immutable truth/rescoring, durable nonreservation events and additive metadata. Exact same-workstream3.7 PLAN review returned `AGREEMENT_STATUS: agree`, `MUST_FIX: none`, `SHOULD_FIX: none`, `QUESTIONS: none`, recorded2026-10-07T07:42:54+02:00. Host verified original source/protected hashes unchanged. This approves the exact plan, not unimplemented code or tests; independent RED/GREEN and postimplementation CODE gates remain required.

Host refinements for exact plan: one consistent snapshot instead of two independent getters; closed enumerated safeerror rows not free-string dictionary; valid barcode product failures retained; first persisted stage/profile timestamp for restart-stable identity; no caller comparison/truth/scoredvalues; async pure verifier with complete owned files avoidsnativeIO. Parent full runtime/146dispatch/60/live/default promotion explicitly remain gaps. User approved architecture/execution and repeatedly requests continuation without routine task pauses; this plan decomposes its remaining report requirements, not a new product feature.

### Rulings retained for workspace closure

These preserve every execution-ledger ruling, in decision order, before task scratch cleanup. The declined-to-judge rulings and their costs are additionally retained under Final native review and regrading above.

1. Continue the approved parent architecture through this reviewed two-task decomposition without another routine approval pause; no new provider/default behavior. Cost if wrong: replan if parent scope changes, not wider runtime authority.
2. Use one synchronous stage snapshot instead of separate count/outcome getters for a consistent authoritative read. Cost if wrong: future controller integration must support the larger snapshot type.
3. Persist closed non-reservation outcomes in existing fsynced events, without synthetic reservations or a second sidecar. Cost if wrong: resolver/replay integration is required; legacy routes retain their format and reject the new event.
4. Count error-none successes as completed, non-none/interrupted as failed, and reserved as pending, matching the existing seven-field codec. Cost if wrong: consumers may confuse completed with HTTP-only success; the category contract and tests remain explicit.
5. Leave interruption prediction/latency absent in the ledger; source-bind a runner failure in assembly, without zero-latency padding. Cost if wrong: latency gates may overlook missing evidence; explicit coverage and later controller gates are required.
6. Rescore raw closed predictions against frozen source truth, without caller-scored results or comparison objects. Cost if wrong: historical-comparison integration remains necessary; inaccurate valid predictions must not be repaired away.
7. Close safe errors to known categories, retain valid barcode product failures, and derive deterministic report identity/time from persisted first-stage events. Cost if wrong: additional schema/bookkeeping integration is required; historical rendering and clock-call controls remain gates.
8. Require real source-bound plans and valid lifecycle fixtures before source authorization, not merely absent-export failures. Cost if wrong: extra test-correction time, never relaxed behavior or scope.
9. Treat field-removal tamper separately from deletion of an entire event; do not invent a hash chain. Cost if wrong: complete file deletion is not cryptographically detectable here; parent persistence/coverage gates remain required.
10. Supply the editing worker a task-local patch parser instead of accepting native write tools. Cost if wrong: owned-worker restarts/context rereads; source authorization and unrelated processes remain unchanged.
11. Assert fail-stop poisoning after fsync failure, not rollback of already appended readable bytes. Cost if wrong: restart must independently validate disk state, not infer missing bytes from an unacknowledged append.
12. Preserve the exact existing failure codec's category-token prediction hash and n/a model version in fixtures. Cost if wrong: a measured failure is not transport success; keep outer category/latency without relaxing the codec.
13. Bound silent source-worker responses at 15 minutes and record host runtime timeout rather than inventing provider quota failure. Cost if wrong: a slow valid response may be interrupted; next permitted route retains all acceptance gates.
14. Decompose incomplete Task1 source work into smaller same-worker pieces with unchanged interfaces/frozen tests. Cost if wrong: intermediate code remains incomplete until every original verification/review gate passes.
15. Narrow the paid source invocation to the report-state module at medium effort after a 64k response limit produced no patch, then integrate bootstrap/core separately. Cost if wrong: more worker/check cycles; no partial acceptance.
16. Retain immutable captured expanded plans, activate only for the current selected profile, and revalidate profile/key/prefix/source shape on replay rather than reinvoking the callback. Cost if wrong: stale-profile/key tampering must fail under lock; positive/negative tests and MCP clarification gate acceptance.
17. Independently exercise guard fixtures and construct replay negatives without invalid live APIs; retain already-protected cached=true controls. Cost if wrong: more tests-only verification time, no product expansion.
18. Allow bounded owned-session patch-input extraction and in-memory formatting-only parser orchestration. Cost if wrong: patch refusal or prefix-integrity failure; no native application writes or new source authority.
19. Use a fresh bounded worker context for remaining hunks after session cap, preserving code/tests as checkpoints. Cost if wrong: limited helper/source rereads; all host verification remains mandatory.
20. Bound free-route startup without agent events or mutation at five minutes, distinct from active-stage inactivity. Cost if wrong: a slow startup may be interrupted; record host startup timeout, not fabricated quota exhaustion.
21. Deny worker-native edits process-locally while allowing the approved parser, after prompt-only constraints were ignored. Cost if wrong: worker refusal or another bounded correction; no global/repository configuration change.
22. Reject repeated invalid output and tool noncompliance as unusable worker availability rather than treating exit zero as completion. Cost if wrong: discard recoverable context, but preserve partial source/tests and all gates.
23. Correct only invalid test assertions with source frozen: preserve the scorer's existing denominator floor and compare foreign-error identity as a primitive boolean. Cost if wrong: weakened assertions; mitigate with zero trap reads, static causeless errors and independent zero-safe/diagnostic checks.
24. Perform the one native whole-plan review before the Task2 checkpoint as this approved plan requires, supplying committed Task1 plus exact working/untracked Task2 files. Cost if wrong: reviewed state could diverge from the commit; frozen hashes, full verification and final MCP prevent acceptance on stale code.

Additional test/compiler correction: zero-truth carbohydrate diagnostic error is absent, not one; remove only the statically impossible reserved terminal branch, retaining the actual pending-count refusal. Cost if wrong: weaker pending coverage; the named deferred fixture-depth minor and existing pending/runtime gates are explicit.

Final correction PLAN: primary gemini-3.8-flash, same conversation, explicit agree/MUST_FIX none. Accepted boundary is the generic builder and whole-report schema for newly supplied metadata; low-level standalone CalibrationInfoSchema and unrelated hostile legacy root input are not globally requalified. Regression tests frozen f1f79ff8/3c680e46; 36 genuine RED plus 3 controls became 39 GREEN, build exit0. Final focused/lint/full/CODE and checkpoint/task-done remain pending until their actual results are recorded.

Final corrected CODE review (2026-10-07T20:43:41Z): primary gemini-3.8-flash, conversation calorix-stage-report-assembly-20261007, explicit AGREEMENT_STATUS agree/MUST_FIX none/SHOULD_FIX none/QUESTIONS none; Task2 code only, no live dispatch/calorie accuracy/production readiness approval. Coree59bdbf1/schema5eaa039d/report2e08ac45/assembler8e0b6a28/tests f1f79ff8+3c680e46/config9c962 unchanged after review. Independent guards39GREEN/build0/lint0; final focused/full serial/checkpoint/taskdone are still pending. Final Task2 CODE needed no fallback.

Final independent verification: focused8 exit0 **576/576**, build0, whole Functions lint0, full serial Functions suite exit0 **2130 passed/1 existing public-manifest skip (2131)**,42files,258.37s. Both Important fixes independently reproduced RED and passed GREEN: 32 descriptor-boundary failures plus 4 resolver-order failures became all39 guard cases green, retaining3 existing controls. Entire prior Task1 test155189-byte prefixe3e57211 unchanged. Whitespace0 and protected configuration9c962 unchanged; no secret-pattern matches in the explicit implementation/test allowlist. Step4 complete; Step5 source checkpoint/push and fresh postcommit task-done remain pending until recorded. No broader verification/live/readiness claim.

Task2 complete: source checkpoint **fa7c5743c7526edf5dc3865c27c664229bf7d113** committed with normal hook0/pushed0/liveorigin exact; BASE2c3292b874c1e481c96a349be3cbfe9a776cbc05. Required postcommit task-done full serial suite exit0 **2130pass/1existing skip2131**,42files,289.80s; both task completion lines recorded before cleanup. Functions tree **251bff8a097421e07c21dd6b4b73d82fb0fc9de4**. No source/test changes after final CODE approval. Every execution ruling and deferred Minor retained above. All owned tests/review/worker commands stopped; initial lsof warnings concerned unrelated inaccessible Docker/GVFS/portal/network mounts, then exact exclusions yielded no open handles/no warnings for the ext4 task directory. Cleaned only this plan's113MiB ignored scratch/cache/log directory; no shared/tmp, sibling plan, repository source or user cache swept. Generated scratch is reproducible, exact logs are not retained; committed decisions/results and persistent MCP conversation remain the record. Keep branch/worktree, no merge/PR.

Next: approved parent Task7 CLI/controller execution, report persistence/hash publication, stage acceptance/historical gates, and hermetic exact2+48+48+48 image dispatch with60benchmark outcomes/12offline barcodes. Current CLI still requires injected dependencies; pure report assembly is not a runtime command or stage-completion proof. Full fixture/test:verify and subsequent opt-in live qualification remain pending. No new run IDs/live provider calls/UI diffs; auditLimited and visualClassificationStatus are not applicable to this offline code stage, and nutrition accuracy/production readiness are not qualified.
