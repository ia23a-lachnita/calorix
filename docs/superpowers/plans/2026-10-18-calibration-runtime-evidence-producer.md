# Calibration Runtime Evidence Producer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compose the existing capability primitive and native evidence ledger into an unused, opt-in outcome producer that cannot turn persistence or capability faults into successful terminal publication.

**Architecture:** A new pure input module captures prepared context and trusted method references. A new producer owns private invocation/facade/callback state and delegates durable authority to the unchanged ledger. New native-fixture tests independently observe persisted records and the real adapter's injected fake SDK; they do not use observation replay as evidence.

**Tech Stack:** Existing TypeScript strict configuration, Node filesystem/Git fixtures, Vitest, unchanged `@google/genai` adapter with an injected fake client. No dependency or configuration changes.

**Spec:** `docs/superpowers/specs/2026-10-18-calibration-runtime-evidence-producer-design.md` (written-spec approval: user's “sounds good continue” following the published `bba2ea9` spec).

**Status:** Task1 COMPLETE: source checkpointf4148ccb11d5069b9bef9ca512fca8d7a33b7bab committed/pushed/liveoriginexact, fresh committed focused71630 all138passed and required task-done recorded2c45b02..f4148cc after actual0. Precommit138-focused/strict/build/full lint/full55-file3783pass/one existing skip15243 all0, exhaustive old/new case audit; actual code/result CLI23860 primary3.8High agree/MUST_FIX none. Six steps checked; Tasks2/3 and13 steps remain open. Postcommit evidence here is focused only, not the final whole-plan full-suite gate. No default activation, live calibration, benchmark, nutrition-accuracy or readiness claim.

**Task2 compatibility amendment COMPLETE (2026-10-18):** sourcecheckpoint `dcad566734b85a354ca51484199830384f98be3a` committed/pushed61198actual0/liveoriginexact; fresh COMMITTED93731 actual0/ALL260passed, exact frozen population/no failures/skips/todos. Before repair, first seven controls81507 had two native failures; reviewed/user-approved two-old-file amendment then witnessed RED78638/122cases118pass/four intended failures before the source-only condition change. GREEN59931 all122pass; shared45570 all260focused/strict/build/full lint0; full37122 actual0/56files3797pass/soleoldopt-inimagefetchskip, every test/file/old+new population audited. Final code+result70789 sameprimary3.8High CLI/conversationa2985350 actual0/COMPLETE_RECEIPT_INSPECTIONyes/agree/MUSTnone/SHOULDnone/QUESTIONSnone. Old164104-byte reducer test prefix/helpers/assertions/defaults preserved, no task-owned config mutation, user.mcp fingerprint intact. Task2 Step1 controls complete; remaining adversarial/barcode groups/Task3/final native whole-plan review stay open. This bounded repair is not whole-plan/default/live/production approval.

**Task2 COMPLETE (2026-10-18):** source checkpoint `e46d20f947cc0df8e0968aa28b7aff61ab8e277b` committed/pushed24872actual0/liveoriginexact; fresh COMMITTED225/task-done24811 actual0, every basic138+guard87 case passed/no skip/todo, exact precommit case set and frozen hashes preserved. OfficialBASE8e8e893..e46d20f recorded in ledger. Full95771 strict/build/full lint/full56files3877pass/soleoldskip and scoped code/result10674 agree/MUSTnone retained. Twelve of19 steps checked; only Task3's seven steps remain. No whole-plan/native final review, default/live/benchmark or production/accuracy approval.

**Task3 verification COMPLETE (2026-10-19):** source checkpoint `8fe982f3766d178dbe2435e47d30944babc447e6`, pushed30150 actual0/liveoriginexact. Fresh POSTCOMMIT full35846/task-done3 actual0:57files4027passed/soleexistingimagefetchskip/0failed/todo,4028totalrecords/no failureMessages,2299seconds; both complete-case/population auditors0 and independent host re-audit0. All six feature and approved old compatibility hashes unchanged. Precommit43287 strict/build/full lint/375focused/44files3632nutrition+oldskip/57files4027full+oldskip all0. External whole-feature59153+42649 same59a1998d/primary3.8High/user-permittedCLI agree/MUSTnone; ONE completed independent native gpt-6.1-sol/High review no findings. Eighteenof19 steps checked; final Step7 tracking/push/recoverable cleanup remains. All30 rulings/costs below; deferred minors none. This is unused hermetic mediated-seam qualification only, not parent Task7 completion or default/live/full146/benchmark/accuracy/production/security/UI approval.

## Global Constraints

- Only this bridge and its hermetic tests are in scope. Keep `calibration:benchmark-runtime-evidence-required` unconditional. No default CLI/controller wiring, SDK/client construction, live provider or OFF request, benchmark authorization, report admission seal, historical-comparison integration, full146-call qualification, cloud/device/UI operation or deployment.
- Reuse the same ledger/journal/root/lock, v1 event schema, 4096-event/16KiB bounds and native publication protocol. Add no companion file, heartbeat, admission token, reset, migration or second reservation namespace. Existing APIs and observation semantics stay unchanged.
- The producer never acquires/releases locks, performs takeover, calls recovery, retries, chooses the next stage/profile, publishes/adopts report receipts or completes stages. A profile/owner epoch transition requires a new idle producer after explicit existing transitions/recovery.
- Only the producer-supplied capability `reserveImage` callback performs `reserve` followed synchronously by `authorizeRuntimeRequest`, inside the existing final `beforeRequest`. The outer decorator must not reserve again. Successful authorization is not dispatch proof.
- Do not inspect any foreign thrown value: no message/code/name/cause/stack/`instanceof`, coercion or serialization. Do not retain raw exceptions. Private producer poison is monotonic; do not pretend to set the primitive's or ledger's private poison.
- Image/snapshot exceptions and pre-authorization vision rejection are fatal, not scored dataset failures. Only a healthy, authorized raw vision rejection handled by work can become an existing ordinary provider-failure terminal. Returned parser/product failures use existing codecs/policy.
- Every image terminal needs the existing full `reportPrediction` journal and `complete`. A publisher return, prediction or `safe_error` alone is never terminal authority. Barcode uses the existing `reason:'barcode'` non-reservation result and prepared snapshot only.
- Prepared context and dependencies are copied via descriptors, never frozen in place. Factory preparation invokes no ledger method, port, filesystem reader, client, lock or mutation. Public run capture reserves its generation before reflection and rechecks fatal state afterwards.
- Native assembly must supply the real ledger from the same captured context/baseDir. The public ledger has no `getRoot`; identity/owner equality cannot distinguish cloned roots. Structural validation is not authentication against dishonest ports, ledger aliases or privileged filesystem writers.
- Preserve `.mcp.json` unread/undiffed/unstaged and its pre-existing fingerprint. Preserve all completed source/tests/helpers/default importers. No prior native-edit exception remains. Strongest-first workers author application/tests; host authors planning/tracking only, reviews/verifies/commits/pushes.
- Use the preserved inline execution method and ONE independent native whole-plan reviewer at the final gate, not per-task native reviewers. Antigravity MCP plan and code/result agreement are separate required gates; unavailable/noisy/empty reviews are not green and cannot be replaced by CLI reviews.
- **User-authorized review-route exception (2026-10-18):** after the recorded MCP failures the user explicitly permits headless `agy` reviews and other models present in its refreshed catalog for this workstream. Actual substantive read-only CLI agreement may satisfy this workstream's external plan/code-result review gate; never label it MCP agreement. This overrides MCP-only routing above and in task instructions, not TDD, private lifecycle/native-authority requirements, workers, independent final native review or real agreement. No permanent AGENTS.md/tool-wrapper change is included.
- **User-authorized editing exception (2026-10-18):** the user's direct “continue” answer to the explicit request for native edits for THIS producer plan permits host patch edits to its six NEW source/test files only. This supersedes worker-only authoring statements in this plan/spec for this workstream, not the general repository contract. Keep TDD, independent final review, actual external code/result review, verification, commits/pushes and all frozen/default/live/benchmark/deploy boundaries unchanged. No permanent AGENTS.md or tool configuration change.
- **Reviewed Task2 native-test construction budget (2026-10-18):** ONLY new individual tests in `calibration-runtime-evidence-producer-guards.test.ts` that genuinely require `makeProducerFixture(ownedRoots, 'benchmark')` may declare `600000`ms as the third `it` argument from initial authoring. This includes the two all12-key barcode runs and valid executable barcode lifecycle/forbidden-operation/failure controls. The98 real prerequisite image outcomes cannot fit the default5000ms; existing native158-outcome controls actually took111994/125139ms and already use600000ms. All ordinary preflight/codec/callback/input-validation tests keep defaults. No old test, global/suite/hook or production timeout changes; no post-hoc increases to mask a failure, retries, sleeps, skips, exclusions, forged/replayed authority or hidden setup outside test receipts. Root registration/cleanup remains exact-owned and attempted even on failure, not a guarantee against process death or arbitrary filesystem faults. Actual primary3.8High CLI review53638/native conversation `a2985350-34c2-4ab9-8865-fd7cd5d748b7` returned agree/MUST_FIX none before any long test was authored. This narrowly clarifies the general no-timeout-increase rule for NEW intrinsically long native-composition tests, not existing limits or production behavior.
- Keep `/tmp` minimal. Future execution uses a NEW verified disk-backed task-scoped workspace/TMPDIR/cache/log directory; never reopen the removed durable-evidence workspace or sweep shared/sibling artifacts. Do not create that workspace during planning.
- Each meaningful stage updates this plan and the fresh handoff in `docs/implementation-status.md`, then commits and pushes explicit owned paths. Workers never commit/push. Parent calibration Task7 Steps4–7 remain open; finishing this bridge does not finish them.

## Review Focus

1. A capability fatal thrown before a raw port, or a ledger fatal normalized by the primitive's vision catch, must remain fatal even when work catches it and returns a plausible failure (Task2).
2. A publisher catching a leaked facade call must not bypass work-phase closure or produce apparent success (Task2).
3. A syscall that performs its effect and then throws must retain the actual consumed prefix/lock and suppress the next disallowed effect, not manufacture a provider failure or rollback (Task3).
4. A stale or overlapping callback must never gain authority over another generation, including after an earlier durable finish (Task2).
5. A descriptor/proxy trap that reenters or mutates inputs must not overwrite the original generation, retain aliases or reach a native write/raw port (Task1/Task2).

---

## Checkpoint, approval and execution boundaries

Planning baseline: branch `fix/scan-photo-flow-viewer`, committed/pushed `bba2ea94f2ea323a386f8c26e6469309e408cb89`. The verified integration base is `main` at `928f9a911d3b937095064fb7ebb009beef5fb6eb`; no merge/PR is authorized. Documentation-only HEAD movement does not invalidate immutable implementation/tree identity.

This plan is initially entirely unchecked. External plan review and user written-plan review precede execution. Preserve the user's inline worker method; do not interpret approval of the spec as approval to start implementation. At execution time read current `AGENTS.md`, fresh status, this plan and its spec; use `executing-plans` and its new plan-owned tracking. Before each task record branch, actual BASE and exact verification command. Do not recreate old logs or count historical results as fresh gates.

Worker route order is current Calorix `AGENTS.md`: `grok-4.6` high, `qwen3.7-max`, refreshed-catalog OpenCode `nemotron-3-ultra-free`, `muse-spark-1.3-contributor-free`, `nemotron-3.5-lightning-free`, `ling-3.0-flash-fin-free`, `big-pickle`, then paid `claude-sonnet-5`. Record exact ISO timestamp/model/category/provider message before fallback. No host code edits or renewed exception is implied. Workers use patch-only file edits, not shell write tricks. Bounded tests-first and source-only briefs enforce allowed paths and frozen test snapshots.

## File map and frozen prerequisites

Create these focused files, without refactoring old modules:

| File under `functions/` | Responsibility |
| --- | --- |
| `src/nutrition-eval/calibration-runtime-evidence-producer-input.ts` | Private-to-feature descriptor capture, copied prepared context, complete immutable identity binding, canonical plan and bound ledger method capture. No effects/default readers. |
| `src/nutrition-eval/calibration-runtime-evidence-producer.ts` | Public opt-in factory and private invocation/port/facade/callback orchestration. No observation or persistent-format API. |
| `test/nutrition-eval/calibration-runtime-evidence-producer-fixtures.ts` | New owned composition/native-fault fixtures, independent disk/SDK witnesses and closed-codec result builders. |
| `test/nutrition-eval/calibration-runtime-evidence-producer.test.ts` | Preparation, capture/identity and positive image/barcode/domain-result behavior. |
| `test/nutrition-eval/calibration-runtime-evidence-producer-guards.test.ts` | Reentry, swallowed/private fatal, pending/late callbacks, foreign errors and terminal boundaries. |
| `test/nutrition-eval/calibration-runtime-evidence-producer-native.test.ts` | Native syscall fault matrix, fresh-instance recovery and final default-block controls. |

These six application/test files are authorized, plus only the two old paths under the explicitly user-approved compatibility amendment below. Planning/tracking updates: this plan, its spec's approval/review metadata, `docs/implementation-status.md`, and a factual link in the parent calibration plan if needed. Other changes to existing source, tests, helpers, package/config files, thresholds or timeouts require a separately reviewed amendment, not opportunistic edits.

### Failure-terminal compatibility amendment — user authorized 2026-10-18

The user's direct “sure go on” answer to the explicit two-old-file native-edit extension request authorizes this narrow amendment, including host patch edits. The prior reviewed proposal below now defines the permitted repair; it does not authorize any other old path, helper/assertion rewrite, public API/event change or live/default operation. Task2 BASE remains8e8e893; repair starts at9a2aa0d6d352b339f122cbc3d4922d9a5e3dc9c5. Previous pending-authority statements in diagnostic receipts describe the earlier checkpoint only.

The verified native path `strictComplete` → `strictPersistLedgerEvent` → `evidenceFrame` emits a `completed` image terminal for both success and closed-codec failure journals. `captureImageTerminalJournal` currently requires `failed` for non-none error categories, so ordinary provider/schema failures cannot reach finish in evidence mode. The strict protocol's `failed` replay is reserved for canonical interruption journals; changing only the emitted event to `failed`, recovery misuse, fabricated dataset results or altered publisher authority is not a repair. The approved spec's claim that failure journals already work through `complete` was an incorrect prerequisite assumption.

Authorized narrow extension (preserving the reviewed scope):

- Permit host patch edits to existing `functions/src/nutrition-eval/calibration-runtime-evidence-state.ts`, limited to accepting a validated ordinary full failure journal with terminalType `completed` in `captureImageTerminalJournal`. Preserve existing acceptance of ordinary `failed` frames; do not change public methods, persisted event/hash formats or recovery semantics.
- Permit append-only regression tests in existing `functions/test/nutrition-eval/calibration-runtime-evidence-state.test.ts`, preserving all previous test cases/assertions. Existing helpers stay frozen. New native producer files may supply actual publication/finish, fresh-instance replay/report and failure-classification controls under their already authorized scope.
- Keep success journals with `failed`, canonical interruption journals with `completed`, wrong hashes/keys, malformed full predictions, pin mismatches, unauthorized ordering and recovery-owner substitutions rejected. A failure terminal remains `success:false`, not a successful nutritional prediction or stage pass.
- First witness focused reducer failures plus the two genuine manual-native failures; then change only the reviewed source condition. Require native finish/reopen/report classification checks, old reducer/core/native controls, strict typing, build, full lint, full default serial Functions verification, actual external code/result review, normal commit/push and fresh committed verification. No skips, weakened old assertions, time-limit hikes or bypasses.
- All six-file producer boundaries otherwise remain: no default/live/benchmark enablement, production/cloud/security approval, new API, migration or pre-existing helper changes. Only the explicit two-old-file user extension above permits this prerequisite repair.

Review corrections: diagnosis7345 correctly identifies the source conflict, but omits the intermediate `calibration:ledger-persist-failed` normalization before the outer `calibration:runtime-operation-failed`. Its alternative fail-method proposal would also require replay/report/recovery design, not just emission, and would not inherently require changing the producer's generic publisher signature. Its blanket orphan-journal recovery claim is not adopted. Only the checked source conflict and constrained reducer-alignment proposal are carried forward; diagnosis is not a green implementation gate.

Proposal/checkpoint review15169 completed actual0, primary `gemini-3.8-flash`/separate High effort via user-permitted headless CLI, same native conversation `a2985350-34c2-4ab9-8865-fd7cd5d748b7`. It explicitly returned agree/MUST_FIX none/SHOULD_FIX none/QUESTIONS none for each of DIAGNOSTIC_CHECKPOINT and PROPOSED_AMENDMENT, not Task2/implementation/production approval, and requires explicit user authorization for both old paths. Host verified no reviewer mutation. Its rhetorical “irrefutable”/blanket safety language is narrowed to the observed source conflict and hermetic reproduction, not universal proof. After the explicit real-type-only publisher-spy annotation, checkpoint85507 reproduced the exact seven-case population, five passed/two same native failures, zero skip/todo; real-source-plus-test strict0/full lint0, combined exit1 because of the recorded native failures. No repair implemented or old assertions weakened.

Implementation receipt (subsequent to user approval): RED78638 actual1/122cases118pass/four intended failures, then source-only exact reviewed condition/comment change. GREEN59931 all122passed; shared45570 focused260/strict/build/full lint each0; full37122 actual0/56files3797passed/one old opt-in imagefetch skip/0fail/todo. Host audited every Vitest result, full file population, old358baseline and all old full-suite names plus exact frozen260 feature names. Native controls verify durable failure completion, fresh-instance replay, unchanged full predictions/journals/event prefixes, explicit fixture owner recovery only, and partial report-snapshot counts reserved1/completed0/failed1/pending0. No complete-stage reconstruction/admission, stage passage or live dispatch claim. Final code+result review70789 actual0 in the same3.8High CLI conversation explicitly reports COMPLETE_RECEIPT_INSPECTION yes/NATIVE_FAILURE_COMPATIBILITY_CODE_AND_RESULTS_ONLY/agree/MUST_FIX none/SHOULD_FIX none/QUESTIONS none; source235c43f3/state testa1ea45c0/guard28d258c0 hashes frozen. “Assertions” in its per-file counts means Vitest test-case results, not a count of every expect call; its configuration statement is limited to no task-owned mutations, excluding preserved user.mcp changes. No reviewer mutation/fallback. Commit/push/fresh committed gate still required before proceeding to remaining Task2 groups; no whole-plan approval.

Read-only prerequisites to inspect at execution: `calibration-runtime-capabilities.ts`, `calibration-runtime-evidence-ledger.ts`, `calibration.ts`, `calibration-runtime-evidence-{codec,state}.ts`, `calibration-file-store.ts`, `calibration-bootstrap.ts`, `calibration-cli.ts`, `calibration-report-{journal,state}.ts`, `genai-adapter.ts`, and both existing runtime capability/evidence fixture files. The old evidence helper is frozen; reuse its exports read-only, never append or repair it for this plan.

## Exact new public and private contracts

Production types are imported from real source, never replaced with weakened `.d.ts` or `any`:

```ts
import type { GenAIAdapter } from '../genai-adapter';
import type { OffProduct } from '../off-client';
import type { CalibrationProfile, CalibrationRuntimeEvidenceLedger } from './calibration';
import type { CalibrationPreparedContext } from './calibration-bootstrap';
import type { CalibrationReportOutcomeKey } from './calibration-report-state';
import type { CalibrationOutcomeCapabilities } from './calibration-runtime-capabilities';

export interface CalibrationRuntimeEvidenceProducerDeps {
  readonly context: CalibrationPreparedContext;
  readonly ledger: Readonly<CalibrationRuntimeEvidenceLedger>;
  readonly selectedProfile?: CalibrationProfile;
  readonly loadImage: (key: Readonly<CalibrationReportOutcomeKey>) => Promise<Uint8Array>;
  readonly generateVision: GenAIAdapter['generateVision'];
  readonly lookupSnapshot: (barcode: string) => Readonly<OffProduct> | undefined;
}
export interface CalibrationRuntimeEvidenceProducer {
  readonly runOutcome: <T>(
    key: unknown,
    work: (caps: Readonly<CalibrationOutcomeCapabilities>) => Promise<T>,
    publish: (key: Readonly<CalibrationReportOutcomeKey>, result: T) => void | Promise<void>,
  ) => Promise<T>;
}
export function prepareCalibrationRuntimeEvidenceProducer(
  deps: unknown,
): Promise<Readonly<CalibrationRuntimeEvidenceProducer>>;
```

The factory is async only to reuse existing `verifyCalibrationPreflightState({files})`; synchronously capture/copy all caller data and function references before its first await. Catch without a binding at foreign boundaries and throw a new causeless `CalibrationFatalError('calibration:runtime-evidence-producer-failed')`. No public reset, observations, attempt reference, raw ports, provider-brand test, recovery or optional publisher API.

Input module exports only feature-internal functions/types (not from any package index):

```ts
export type ProducerLedgerMethods = Pick<CalibrationRuntimeEvidenceLedger,
  'getRuntimeEvidenceSnapshot' | 'getStageReportSnapshot' | 'getSelectedProfile' |
  'startRuntimeAttempt' | 'startRuntimeOperation' | 'settleRuntimeOperation' |
  'reserve' | 'authorizeRuntimeRequest' | 'pinModelVersion' | 'finishRuntimeAttempt'>;
export interface CapturedProducerInput {
  readonly context: CalibrationPreparedContext;
  readonly ledger: Readonly<ProducerLedgerMethods>;
  readonly selectedProfile?: CalibrationProfile;
  readonly plan: readonly import('./calibration-report-state').CalibrationPlannedReportOutcome[];
  readonly loadImage: CalibrationRuntimeEvidenceProducerDeps['loadImage'];
  readonly generateVision: GenAIAdapter['generateVision'];
  readonly lookupSnapshot: CalibrationRuntimeEvidenceProducerDeps['lookupSnapshot'];
}
export function captureProducerInput(deps: unknown): Readonly<CapturedProducerInput>;
export function captureProducerOutcomeKey(
  value: unknown,
  plan: CapturedProducerInput['plan'],
): Readonly<CalibrationReportOutcomeKey>;
export function assertProducerExecutionIdentity(
  input: Readonly<CapturedProducerInput>, key: Readonly<CalibrationReportOutcomeKey>,
): void;
```

Keep deps types in the input module and re-export them type-only from the public producer to avoid a runtime cycle. Capture the ten required ledger method references as own enumerable data functions and bind the original trusted receiver without invoking a method. Do not reject the full native ledger's other legitimate methods; do reject absent/accessor/nonfunction required methods. No runtime ledger brand claim.

`captureProducerInput` applies closed descriptor capture to deps (five required fields, optional `selectedProfile`), context, identity, owner, report/compatibility-note array and seven file strings. Copy before freezing owned data. Use the existing header codec for identity/owner primitive syntax; use the native preparation's existing context/notes validation rules without calling its filesystem factory. Derive the canonical plan from the owned files. Check context identity against all bootstrap bindings: protocol `v1`, provider `vertex-ai`, model `gemini-3.8-flash`, 146 planned image calls, ceiling300, both public/dataset hashes, prompt/schema/source-lock/calibration-manifest/OFF-lock/historical hashes, first development case, report dataset/notes/historicalCompatible false. Match file hashes using the existing preflight hash semantics (prompt triple hash; parsed schema canonical JSON, not raw schema bytes). The awaited existing preflight validator uses pinned defaults, never a caller `expected` override.

`assertProducerExecutionIdentity` checks `getSelectedProfile()` equals captured optional profile, `getRuntimeEvidenceSnapshot().owner` equals every captured owner field and `activeAttempt === null`, then stage snapshot `.identity` equals EVERY captured identity field. Native getters supply fresh source/lock checks. Do not assume a runtime-snapshot header/version field or call a nonexistent public `getRoot`. Native same-root selection stays an explicit trusted assembly prerequisite; tests inspect the expected root independently.

## Shared test fixture contract and concrete foundation

The new helper imports the old `makeRuntimeEvidenceNativeFixture`, `makeMiniGitRepoTask4`, `createCoreExactPrediction`, `buildCoreSuccessJournal`, `CORE_PINNED_VERSION` and `buildRuntimeHarness` read-only. Define the following helper before producer tests; exercise its native baseline without importing the new producer so setup defects cannot masquerade as feature RED:

```ts
export async function makeProducerFixture(
  ownedRoots: string[], stage: 'preflight' | 'benchmark' = 'preflight',
) {
  const native = await makeRuntimeEvidenceNativeFixture(ownedRoots, { mode: 'future' });
  native.completeTokenPrerequisites();
  if (stage === 'benchmark') {
    await native.finishPreflight();
    await native.finishDevelopment();
    await native.finishValidation();
  }
  const selectedProfile = native.ledger.getSelectedProfile();
  const raw = await buildRuntimeHarness(selectedProfile);
  // These are independently prepared pinned inputs, not producer expectations.
  expect(raw.deps.files).toEqual(native.context.files);
  raw.client.models.generateContent = async (params) => {
    raw.witness.sdk++;
    raw.witness.transport++;
    raw.sdkCalls.push({ model: params.model, contents: params.contents, config: params.config });
    return { text: '{"fixture":true}', modelVersion: CORE_PINNED_VERSION };
  };
  const deps = {
    context: native.context, ledger: native.ledger,
    ...(selectedProfile === undefined ? {} : { selectedProfile }),
    loadImage: raw.deps.loadImage,
    generateVision: raw.deps.generateVision,
    lookupSnapshot: raw.deps.lookupSnapshot,
  };
  const plan = deriveCanonicalReportOutcomePlan({ ...native.context.files }, selectedProfile);
  function prediction(key: CalibrationReportOutcomeKey): NutritionPrediction {
    const calibration = StrictCalibrationManifestSchema.parse(JSON.parse(native.context.files['calibration-manifest']));
    const benchmark = parseNutritionEvalManifest(JSON.parse(native.context.files['public-manifest']));
    const row = [...calibration.cases, ...benchmark.cases].find((item) => item.id === key.caseId);
    if (row === undefined) throw new Error('producer-fixture-case-missing');
    return createCoreExactPrediction(row, key.sampleIndex);
  }
  function publish(key: CalibrationReportOutcomeKey, value: NutritionPrediction): void {
    if (value.source === 'barcode') {
      native.ledger.recordNonReservationResult({ key, reason: 'barcode', prediction: value });
      return;
    }
    const journal = captureCalibrationReportJournalEntry(buildCoreSuccessJournal(key, value));
    const hash = native.ledger.appendResultJournal(journal);
    native.ledger.complete(key, hash);
  }
  function disk(): { ledger: unknown[]; journal: unknown[]; lock: string } {
    return {
      ledger: JSON.parse(readFileSync(join(native.root, 'ledger.json'), 'utf8')) as unknown[],
      journal: existsSync(join(native.root, 'journal.json'))
        ? JSON.parse(readFileSync(join(native.root, 'journal.json'), 'utf8')) as unknown[] : [],
      lock: readFileSync(join(native.root, 'lock.json'), 'utf8'),
    };
  }
  return { native, raw, deps, plan, prediction, publish, disk };
}
export type ProducerFixture = Awaited<ReturnType<typeof makeProducerFixture>>;
export function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
```

All names above import from existing real source/fixtures or Node `fs`/`path`/Vitest. Explicitly import every used Vitest binding (`expect` in this helper; `vi` only in modules that actually use it), rather than relying on globals or adding unused imports. The journal builder above is SUCCESS-only; Task2 defines separate validated failure journals rather than casting failures through it. Test source imports actual production types. Dynamic producer loading for the first missing-feature RED must assert the target export is a function outside rejection assertions; a genuinely absent module/export is the initial permitted RED, not a permanent-absence pass. Once present, static imports are allowed. Register each exact owned root as soon as created; cleanup only those roots in `afterEach`, including failed setup. Install a throwing `fetch` spy and a throwing real `GoogleGenAI` constructor guard for each test's full lifetime; injected client construction remains allowed. Native fixture Git/filesystem operations are expected, not globally disabled.

### Task 1: Owned preparation and successful native image composition

**Files:** Create the two producer source files, new helper and `calibration-runtime-evidence-producer.test.ts`; modify only plan/status tracking.

**Interfaces:** Consumes the unchanged capability factory and ledger methods above; produces the exact public async factory, three-argument `runOutcome<T>` and fixture API above. Work accepts existing `CalibrationOutcomeCapabilities`; the trusted publisher receives only the copied key and ephemeral result. No stage publisher or attempt ref.

- [x] **Step 1: Write and run native fixture controls before feature tests.** Build the helper above. A `foundation uses native prefix and codecs` test performs a manually orchestrated existing-ledger preflight image outcome with `startRuntimeAttempt`, image start/returned, vision start, reserve/authorize, pin, vision returned, success journal/complete, finish. Assert exact disk prefix extension, returned terminal hash resolves to the actual journal, lock unchanged and runtime owner/key/attempt match. The same fixture/codec path will serve the producer test; no mocked verifier/high-level ledger is accepted. Receipt: focused39633 actual0; strict Node-lib/scoped eslint53618 each0; build/full lint/full55-file3646-pass+existing1skip suite2837 each0, complete file/case audit; actual complete two-file CLI review95394 primary3.8High agree/MUST_FIX none. Manual native control only, not producer/SDK/live proof.

- [x] **Step 2: Write failing preparation, input-binding and native-success tests.** Include this concrete success test and table controls for each individual context field/hash, bad profile, required ledger method, unknown deps/key field, missing publisher and accessor. Factory zero-effect control uses a structurally valid full ledger record with every required method replaced by a throwing spy; preparation must call NONE. This structural control tests capture only, not native authority. Receipt:135 feature cases plus independent foundation; frozen real-source/test strict44356 and scoped eslint44329 each0, no fake declarations or source stub. IO guards are enabled only around preparation, after legitimate fixture/module loading.

```ts
it('finishes exactly one native image outcome after adapter dispatch and publication', async () => {
  const f = await makeProducerFixture(ownedRoots);
  const before = f.disk();
  const producer = await prepareCalibrationRuntimeEvidenceProducer(f.deps);
  expect(f.disk()).toEqual(before);
  expect(f.raw.witness.sdk).toBe(0);
  const result = f.prediction(f.native.key);
  await expect(producer.runOutcome(f.native.key, async (caps) => {
    const bytes = await caps.loadImage();
    await caps.generateVision({ prompt: 'hermetic fixture', imageBase64: Buffer.from(bytes).toString('base64') });
    return result;
  }, f.publish)).resolves.toEqual(result);
  const after = f.disk();
  expect(after.ledger.slice(0, before.ledger.length)).toEqual(before.ledger);
  expect(after.lock).toBe(before.lock);
  expect(f.raw.witness.sdk).toBe(1);
  expect(f.raw.witness.transport).toBe(1);
  expect(f.native.ledger.getRuntimeEvidenceSnapshot().activeAttempt).toBeNull();
  const events = after.ledger.slice(before.ledger.length) as Array<{ type: string }>;
  expect(events.filter((event) => event.type === 'runtime_request_authorized')).toHaveLength(1);
  expect(events.filter((event) => event.type === 'runtime_attempt_finished')).toHaveLength(1);
  expect(after.journal).toHaveLength(before.journal.length + 1);
});
```

Additionally assert exact event order/owner/key/ref, one reservation, image start/settlement before vision start, reservation before authorization, independent SDK-entry witness sees authorization already on disk, pin before returned vision settlement, real journal codec hash/full prediction and finish terminal linkage. Do not merely count event names. Positive tests for LOW and MEDIUM preflight use fresh fixtures, not reused consumed keys. For the MEDIUM test's fresh fixture, first complete its native LOW prerequisite through the Step1 manual success sequence; `strictAssertReserveAllowed` requires successful LOW, not token readiness alone. Save the asserted prefix/counts AFTER that setup and run the producer on the distinct MEDIUM key. An existing matching model pin need not create a second pin event. Mutable-copy tests change deps/context/owner/identity/files/key after capture and prove original values remain in use without freezing originals. Reject malformed/accessor/proxy/symbol/inherited/nonenumerable/present-undefined fields before any native mutation/raw port. Initial zero-effect rejects are allowed to poison that producer.

- [x] **Step 3: Witness actual RED.** From `functions/`, run `npx vitest run test/nutrition-eval/calibration-runtime-evidence-producer.test.ts --no-file-parallelism --maxWorkers=1 --minWorkers=1`. Foundation controls must pass; feature tests fail solely for the missing producer module/export or specific missing behavior, not miniGit/setup/typing errors. Save exact exits/case records and helper/test hashes in the new execution workspace; host freezes them before source-only authoring. Stop to repair fixture defects tests-first rather than label unrelated failures RED. Receipt: final44329 actual1, foundation passed; ALL135 feature cases fail only for absent actual target module, no other status/failure. Frozen helper1687898a440728812ee65da031ad49cba115970ce1fde791a7091ae06b70f55d/basic testf397f5bd5379984a9ff2282d7e27f6f5ede5aba9086df5ba7ab286c45a00608d. No source or stub existed during RED; lint-witness repair was rechecked before freezing.

- [x] **Step 4: Implement input capture and the complete basic lifecycle.** Use descriptor-copy validation and identity binding from the contracts above. Factory captures synchronously, awaits pinned preflight verification, then prepares capabilities with producer-owned callbacks. The producer reserves capture/work/publishing/closed phases and an invocation generation, privately stores the real attempt ref, wraps facade AND raw ports, awaits primitive closure, closes work, invokes publisher once, then finishes against the real terminal. All reflection/callback/await boundaries recheck private monotonic poison/current generation. Unexpected work/publisher throws are fatal; cleanup only closes local state. Receipt: actual native early-image/dataset-publication bypass7429 RED (137pass/one wrongly resolved result) corrected source-only after strict/lint0; current138-case GREEN/strict/build/full lint15243 each0 and complete4file corrected-code review89937 agrees/MUST_FIX none. Explicit required-operation guard precedes publication; unfinished ref/lock retained on rejection. Full result qualification remains Step5, not whole-plan approval.

These concrete private structures establish the boundary (not a new public API):

```ts
type Phase = 'capturing' | 'work' | 'publishing' | 'closed';
type Invocation = {
  readonly generation: number;
  readonly key: Readonly<CalibrationReportOutcomeKey>;
  readonly ref: Readonly<import('./calibration-runtime-evidence-codec').RuntimeAttemptRef>;
  phase: Phase;
  pending: number;
  hookEntered: boolean;
  hookCompleted: boolean;
  metadataEntered: boolean;
  metadataCompleted: boolean;
  authorized: boolean;
  rawVisionRejected: boolean;
};
// Each producer factory owns these, never the caller or another producer.
let poisoned = false;
let generation = 0;
let active: Invocation | null = null;
function fail(): never {
  poisoned = true;
  throw new CalibrationFatalError('calibration:runtime-evidence-producer-failed');
}
function guard(invocation: Invocation, phase: Phase = 'work'): void {
  if (poisoned || active !== invocation || generation !== invocation.generation || invocation.phase !== phase) fail();
}
```

The capturing reservation precedes any foreign key/dependency reflection; keep a distinct capturing generation before a ref exists, never a fake ref. Ledger calls are wrapped with `catch { fail(); }`, not propagated foreign errors. Port invocation catch covers ONLY raw invocation/await, not native settlement. `reserveImage` is an async function with synchronous reserve→authorize before any await; its captured key/ref must agree. Decorate and await the primitive hook without a second reservation. The producer's version callback calls `pinModelVersion(version)` once under the scoped guard. Require returned vision authorization/hook completion/metadata completion before settlement. Use pending counters and per-operation states in addition to the minimal structure above; Task2 supplies the adversarial cases. Never call the primitive's getters during an active lease.

- [x] **Step 5: Verify GREEN and preserve prerequisites.** Run the whole new basic file, old capability and old native evidence files serially, plus strict real-source/test typing, build and full lint (exact shared commands below). Host reads every failure/skip and the source diff, confirms no default importer/new network/client/format change and no mutation of frozen files. Actual Antigravity MCP scoped Task1 code/result review must agree/MUST_FIX none; correct feedback via new focused failing tests before source repair. No native per-task reviewer. Receipt: final15243 all0; focused138 and full55-file3783pass/one existing optin skip, ALL cases/files audited including old nutrition/native/capability cases and exact new138 population. No separate isolated nutrition-folder invocation is claimed for Task1; the full serial run executed every named case. Final actual CLI23860 (user route exception) COMPLETE_RECEIPT_INSPECTION yes / TASK1_CODE_AND_RESULTS_ONLY / agree / MUST_FIX none / SHOULD_FIX none / QUESTIONS none; terminology corrected to meal/label/barcode, no whole-plan/production approval. Only opt-in feature files/tracking changed; no default importer/SDK construction/schema or frozen prerequisite change.

- [x] **Step 6: Checkpoint.** Update task status with actual RED/GREEN/review receipts, remaining tasks and no live/default approval. Host stages only Task1's four new files and owned tracking; commit `Add opt-in runtime evidence producer`, push `origin fix/scan-photo-flow-viewer`, verify live branch equality. Only mark completed steps after actual passing verification; retain local commit if push fails and record exact error. Run a fresh committed focused Task1 gate before proceeding. Receipt: source checkpointf4148ccb11d5069b9bef9ca512fca8d7a33b7bab commit/push96206 actual0/liveoriginexact; postcommit focused71630/task-done actual0/ALL138passed/exact case set/no fail/skip/todo, independently parsed2026-10-18T11:38:57Z. Ledger Task1complete BASE2c45b02..f4148cc. Source hashes unchanged; only user.mcp remains dirty before this documentation rollup. Next Task2, no whole-plan/live/default approval.

### Task 2: Fatal barriers, ordinary failures, barcode and terminal ownership

**Files:** Modify only the two new source modules/helper/basic tests; create `calibration-runtime-evidence-producer-guards.test.ts`; update owned tracking. Frozen prerequisite files remain untouched.

**Interfaces:** Consumes Task1 factory, `ProducerFixture`, `deferred<T>()`, exact capability methods and publisher signature. Produces unchanged public API with complete first-fatal/phase/pending/callback semantics and additional failure/barcode helper builders. Add `publishPrediction(key: CalibrationReportOutcomeKey, prediction: NutritionPrediction, category: CalibrationSafeErrorCategory, responseModelVersion: string): void` to the helper; it uses the real prediction/journal codec and actual `appendResultJournal`→`complete`, or real barcode non-reservation API. It is test-only, never production error classification.

- [x] **Step 1: Write narrowly failing swallowed-fatal and publication-phase tests before source changes.** Receipt: both requested barriers passed from their first seven-case run and are recorded as controls, not forced producer RED. The two independent native failure controls exposed the separately reviewed/user-approved prerequisite amendment above (RED78638→GREEN59931). Repair checkpointdcad566/full3797pass/fresh committed26093731 and scoped code/result review70789 qualified; no Task2 producer source change required by these already-correct barriers. Remaining groups below are still open. This regression exercises a private capability denial before raw-port entry, even though work catches the returned error:

```ts
it('does not publish a failure after work swallows a capability denial', async () => {
  const f = await makeProducerFixture(ownedRoots);
  const producer = await prepareCalibrationRuntimeEvidenceProducer(f.deps);
  const publish = vi.fn(f.publish);
  await expect(producer.runOutcome(f.native.key, async (caps) => {
    try { await caps.generateVision({ prompt: 'x', imageBase64: 'AQID' }); } catch { /* deliberately swallowed */ }
    return f.prediction(f.native.key);
  }, publish)).rejects.toThrow('calibration:runtime-evidence-producer-failed');
  expect(publish).not.toHaveBeenCalled();
  expect(f.raw.witness.sdk).toBe(0);
  expect(f.disk().journal).toHaveLength(0);
  const persisted = f.disk();
  await expect(producer.runOutcome({ ...f.native.key, profile: 'MEDIUM' }, async () => f.prediction(f.native.key), publish)).rejects.toThrow();
  expect(f.disk()).toEqual(persisted);
});
it('poisons before a publisher can swallow a leaked facade call', async () => {
  const f = await makeProducerFixture(ownedRoots);
  const producer = await prepareCalibrationRuntimeEvidenceProducer(f.deps);
  let leaked: Readonly<CalibrationOutcomeCapabilities> | undefined;
  await expect(producer.runOutcome(f.native.key, async (caps) => {
    leaked = caps;
    const bytes = await caps.loadImage();
    await caps.generateVision({ prompt: 'x', imageBase64: Buffer.from(bytes).toString('base64') });
    return f.prediction(f.native.key);
  }, async (key, value) => {
    if (leaked === undefined) throw new Error('fixture-missing-facade');
    try { await leaked.loadImage(); } catch { /* deliberately swallowed */ }
    f.publish(key, value);
  })).rejects.toThrow('calibration:runtime-evidence-producer-failed');
  const events = f.disk().ledger as Array<{ type: string }>;
  expect(events.some((event) => event.type === 'runtime_attempt_finished')).toBe(false);
  expect(f.raw.capturedKeys.loadImageKeys).toHaveLength(1);
});
```

Publisher trust limitation: the second test may have a real durable terminal written by the trusted publisher AFTER it catches the facade denial. Assert no producer finish/success, not an impossible guarantee of no publisher-side writes. A wholly internal caught publisher exception followed by valid terminal is not observable evidence of dishonesty.

- [x] **Step 2: Add concrete case-table tests for all remaining boundaries.** Receipt: whole guard runtime28881 completed actual0, all87 cases passed/no skip/todo; every named result inspected. Ten genuine benchmark fixtures executed their real98-outcome prerequisites (individual observed durations77–90seconds);77 ordinary cases retained default limits. All twelve selected-profile barcodes passed in each separate success/product-failure fixture. Frozen guard3e69/input33e/producerfe9/helpera90/basic3f99/oldstate235c/state testa1ea unchanged; no source fix or manufactured RED. Every row below is a required test group, not a substitute for actual test bodies. Use `deferred()` to control entry/settlement and `vi.fn` counters to assert the next forbidden effect; no arbitrary sleeps, weakened throws-only oracles or new skips.

| Group / construction | Required assertions |
| --- | --- |
| Core fatal through vision: capture the primitive-supplied options in a raw wrapper, invoke/await `beforeRequest`; induce a real ledger method failure at authorization/pin; raw wrapper/work catch and return plausible text/failure. | Private fatal survives the capability's provider normalization; no publisher/returned settlement/finish/success, SDK0 for hook faults, consumed reservation retained when already written. |
| Normal post-auth raw rejection: real adapter fake SDK rejects with a revoked proxy; work catches without inspecting and returns a codec-valid provider failure. | SDK1, reserve/auth1, vision failed1, existing full failure journal+complete+finish1, no retry. Same rejection unhandled is fatal/no publisher. |
| Reject before hook: raw generator rejects immediately; work catches and returns plausible provider failure. | No reservation/auth/SDK/terminal/publisher; no dataset non-reservation fabrication; active incomplete prefix/lock retained. |
| Returned parse failure; returned barcode product failure; thrown image; missing/throwing snapshot. | First two use real normalized failure predictions/terminals; latter paths fatal, no scored completion. Non-barcode snapshot and barcode image/vision are rejected before raw entry. |
| All12 selected-profile barcode keys: use `makeProducerFixture(roots,'benchmark')`, filter its real plan by benchmark/barcode, assert length12 and one captured selected profile. Fresh fixture for success and product-failure runs. | Prepared lookup once/key, snapshot start/returned/finish; image/vision/SDK/reservation delta0 for these12 outcomes, no live OFF/cache/snapshot-file reads. Save counts/prefix AFTER prerequisite stages: their legitimate historical reservations are not expected to be zero. Prefix/lock unchanged except actual new native records; benchmark completion still blocked. |
| Overlapping/repeated load/vision/snapshot and work returning with pending operation. | Core/facade denial poisons before publication; settle controlled promises and observe all rejections to prevent unhandled rejection noise. No later authority/new write. |
| Missing/duplicate/overlapping final hooks; missing/duplicate/malformed metadata; metadata before hook, wrong pin. | Track entry/pending/completion; no invented callback or settlement, no next SDK effect where real adapter handoff has not occurred. Pins/auth faults fatal even if raw/work catches. |
| Stale callback during next outcome; callback after durable finish; duplicate callback caught by transport. | Callback bound to original ref/generation, no write against new attempt; after-finish callback poisons future use without revoking previous finish. Use two distinct canonical keys, not a consumed-key rerun. |
| Source/lock replaced between callbacks; wrong context/owner/profile; unacquired/active ledger; duplicate/consumed key. | Native checks stop before next raw/mutation; exact old prefix and reservation counts, lock conservatively retained. Docs-only HEAD movement with unchanged source identity remains accepted. |
| Descriptor getter/proxy trap reenters `runOutcome`; work/publisher reentry; mutate aliases during awaited factory/work. | Capturing generation reserved first; no original ref overwrite, no captured data drift, no next native/raw effect. Trap code itself is trusted arbitrary code, not sandboxed. |
| Missing publisher; publisher throws/returns only/safe_error-only/wrong-key/forged/duplicate terminal; swallowed native publication failure. | Missing callback rejected before attempt. Ledger validates actual terminal, all invalid paths no finish/success; real earlier terminal/write effects are retained. |
| Foreign revoked proxies and forged fatal/provider objects at descriptor, image, vision, snapshot, callback, work and publication boundaries. | Zero new producer property/prototype/stringification reads of thrown value, static causeless error only, no raw retention in diagnostics/events; ordinary raw failure only from owned post-auth control-flow state. |
| Deliberately dishonest fake transport makes two SDK calls after one hook. | Independent dispatch witness2 versus reservation1 is detected by test oracle. Do NOT claim the bridge instruments or prevents arbitrary opaque transport retries. |

Use these concrete closed-codec failure builders in the NEW helper. They deliberately use existing `decision:'error'`, null numerics, hash equal to safe category and `responseModelVersion:'n/a'`; a returned parse failure can still have a separately pinned runtime response before its failure journal. No failure is cast through the success builder. Bind `publishPrediction` inside `makeProducerFixture` to its actual native ledger, returning it on the fixture. Add provider/parser/product builder controls BEFORE using them as producer RED.

```ts
function failurePrediction(
  key: CalibrationReportOutcomeKey, source: 'meal' | 'label' | 'barcode',
  kind: 'provider' | 'schema' | 'product',
): NutritionPrediction {
  return captureCalibrationReportPrediction({
    parseStatus: 'failure', source, decision: 'error',
    failureCategory: kind,
    failureCode: kind === 'provider' ? 'provider_request_failed'
      : kind === 'schema' ? 'model_response_invalid' : 'off_product_not_found',
    ...(kind === 'schema' ? { failureDetail: 'invalid_json' } : {}),
    latencyMs: 9, sampleIndex: key.sampleIndex, cached: false,
  });
}
function publishPrediction(
  key: CalibrationReportOutcomeKey, prediction: NutritionPrediction,
  category: CalibrationSafeErrorCategory, responseModelVersion: string,
): void {
  if (prediction.source === 'barcode') {
    native.ledger.recordNonReservationResult({ key, reason: 'barcode', prediction });
    return;
  }
  const entry = prediction.parseStatus === 'failure'
    ? captureCalibrationReportJournalEntry({
      key, predictionHash: category, normalizedPrediction: null,
      analysisLatencyMs: prediction.latencyMs, errorCategory: category,
      responseModelVersion: 'n/a', reportPrediction: prediction,
    })
    : captureCalibrationReportJournalEntry({
      ...buildCoreSuccessJournal(key, prediction), responseModelVersion,
    });
  const hash = native.ledger.appendResultJournal(entry);
  native.ledger.complete(key, hash);
}
```

Use category `'unknown'` for these test-owned failure journals and `'none'` for success; never derive a category by reflecting on a thrown object. The version argument applies only to success. Assert each accepted failure builder directly through the codec with the real sample/source before execution; product failures are barcode-only here.

- [x] **Step 3: Record focused RED and freeze tests.** Whole87 first runtime28881 actual0 is qualification/control evidence, not an87-case RED→GREEN claim. No new missing producer behavior was found; do not alter correct source or weaken tests to manufacture RED. The separately user-approved prerequisite repair retains its genuine four-failure RED78638→GREEN59931 above. Guard/source hashes stayed frozen throughout runtime; exact names/statuses/no failure messages/no skip/todo independently audited. Basic/native controls remain required in the next complete cohort. Run the new guard file with the same serial Vitest flags; run basic/native fixture controls separately. Host checks each new failure is its intended assertion, not missing helper/module/setup or invalid codec input. Existing controls stay green. When an already-correct behavior passes, record it as a control; add a real missing-behavior regression rather than weakening assertions to force RED.

- [x] **Step 4: Strengthen private guards without changing public/old APIs.** Qualified without extra source edits: all87 frozen controls passed from first runtime28881 and again within full95771; actual source+result review10674 explicitly agrees the existing producer/input already satisfy these guarded boundaries, no new repair/artificial RED warranted. The separately approved native compatibility repair remains its own genuine RED→GREEN evidence. This is bounded tested-seam qualification, not proof of every opaque callback/transport schedule. Facade failures are recorded even before raw entry. Each vision invocation has its own hook/metadata/pending/authorized/raw-rejection flags; never a producer-global “last provider error”. Only its corresponding healthy raw rejection after completed reservation+authorization can be treated as ordinary by that facade call. A later lease/private failure wins over that flag. Sync snapshot and async image/vision all use the same generation/phase checks; image/snapshot throws always poison.

The final-hook ownership is concrete:

```ts
// Inside the callback bundle passed to prepareCalibrationRuntimeCapabilities.
reserveImage: async (key) => {
  guard(invocation);
  // key equality is checked against the captured invocation key before writes.
  try {
    ledger.reserve(key);
    guard(invocation);
    ledger.authorizeRuntimeRequest(invocation.ref);
    guard(invocation);
    invocation.authorized = true;
  } catch { fail(); }
},
onModelVersion: (key, version) => {
  guard(invocation);
  // Same captured-key match, no reflection on foreign exceptions.
  try { ledger.pinModelVersion(version); } catch { fail(); }
  guard(invocation);
},
```

These closures bind the original invocation, not a new active ref. Primitive preparation occurs once per producer with ports dispatching only to its guarded current invocation; build invocation-scoped callback wrappers when vision is called. No capability factory recreation per key to reset its used-key authority. Pending increments happen synchronously before await; completion decrements in finally; a returned work promise is insufficient while any operation/hook is pending. Publication is gated by primitive closure plus bridge health; facade work phase closes before calling publisher. Scope raw catch separately from settlement, so a durability throw cannot set `rawVisionRejected`. Callbacks already handed off may settle but never gain new authority after fatal.

- [x] **Step 5: Run whole feature/basic/guard controls and shared strict/build/full lint gates, then scoped actual Antigravity code/result review.** Receipt: whole95771 actual0/strict0/build0/full lint0/full DEFAULT56files3877passed/soleold opt-in imagefetchskip/0fail/todo. Host inspected every result and exact file/case sets; both default and committed-baseline+guard87 population audits0, all basic138/guard87/state115/oldnative199/core215/capability153 controls included. No separate combined precommit225 command claimed. Actual user-permitted read-only CLI10674 primarygemini-3.8-flash/High/samece025conversation completed0/SUCCESS/COMPLETE_RECEIPT_INSPECTIONyes/TASK2_CODE_AND_ACTUAL_RESULTS_ONLY/agree/MUST_FIX none/SHOULDnone/QUESTIONSnone. No mutation/fallback. Reviewer aggregate508 “suites” is the nested reporter counter, not56 physical test files; individual permitted case status is skipped even though aggregate pending counter is1. Its “atomic closures” wording is not transactional publication or universal race proof. No whole-plan/default/live/production/accuracy approval; fresh COMMITTED225 and Task3/final native review remain mandatory. Inspect all final persisted artifacts used by the hermetic assertions, SDK counters and no-extra-skips, not visual UI artifacts. Preserve exact source/test/hash receipts and worktree protections. Correct must-fix feedback tests-first in the same scoped review conversation until agree/MUST_FIX none.

Reviewed same-frozen cohort clarification (2026-10-18): actual first whole87 runtime28881 passed without source/test/oracle changes, so the upcoming mandatory complete serial `npm test` may supply the precommit combined138-basic/87-guard/115-state/old-native cohort evidence. Do not repeat the ten real benchmark warmups in an additional redundant precommit focused225 command, or claim such a command ran. Audit every actual full file/case against the committed post-amendment56-file3797-pass baseline (which contained SEVEN guards) and the actual87 receipt: expected3877passed plus the sole old skip, final counts from the real receipt. Strict/build/full lint, completed-result review, commit/push/origin equality and fresh COMMITTED focused225 remain mandatory. This clarification becomes invalid if any source/test/oracle fix is needed. Actual read-only user-permitted primary3.8High CLI correction23803, conversationce025c5d-0eb0-48d3-a381-757eb787baf5, returned SUCCESS/agree/MUST_FIX none/SHOULDnone/QUESTIONSnone and explicitly retracted its prior wrong28baseline/3856 count and universal-cleanup claim. Its shell completion output was lost to truncation before resume, so no actual exit is invented; this is plan-only substantive agreement, not runtime or final-result approval.

- [x] **Step 6: Checkpoint.** Checkpoint e46d20f947cc0df8e0968aa28b7aff61ab8e277b committed exact three owned paths, pushed24872actual0 and independently verified live origin equality. Fresh COMMITTED225/task-done24811 actual0, ALL basic138+guard87passed/no skip/todo, exact precommit case populations and all seven app/test hashes retained; HEAD stayed e46d20f throughout. User.mcp9c96 preserved unread/unstaged/unedited. OfficialTask2BASE8e8e893 unchanged. Tracking rollup follows, then Task3 starts from its actual next BASE; no final whole-plan/default/live/benchmark/report-admission approval. Host updates plan/status and commits only the six allowed feature files that changed plus owned tracking, message `Enforce outcome lifecycle and publication barriers`; pushes origin, verifies exact branch SHA, runs fresh committed full feature gate. No default/live/benchmark/report-admission approval.

### Task 3: Native persistence cuts, explicit recovery and whole-plan qualification

**Files:** Create `calibration-runtime-evidence-producer-native.test.ts`; extend only the NEW fixture and, for witnessed defects, the two NEW source modules with preceding failing regression tests; update owned tracking. No old helper/source/test/config changes.

**Interfaces:** Consumes unchanged public producer and native `prepareNativeCalibrationRuntimeEvidenceLedger(params:unknown, overrides?:RuntimeEvidenceFileStoreOverrides)`, real filesystem override signatures, bootstrap readers and codecs. Add the following test-only interfaces; no production fault/recovery hooks:

```ts
export type ProducerFaultOp = 'write' | 'file-fsync' | 'close' | 'rename' | 'dir-fsync';
export type ProducerFaultBoundary = 'attempt' | 'image-start' | 'image-settle' |
  'vision-start' | 'reserve' | 'authorize' | 'pin' | 'vision-settle' |
  'journal' | 'terminal' | 'finish';
export interface ProducerFaultArm {
  readonly boundary: ProducerFaultBoundary;
  readonly operation: ProducerFaultOp;
  readonly effect: 'before' | 'after';
}
export interface ProducerFaultWitness {
  readonly trace: readonly string[];
  readonly fired: () => boolean;
  readonly arm: (fault: ProducerFaultArm) => void;
  readonly overrides: import('../../src/nutrition-eval/calibration-file-store').RuntimeEvidenceFileStoreOverrides;
}
export function makeProducerFaultWitness(root: string): ProducerFaultWitness;
export function makeProducerFaultFixture(ownedRoots: string[]): Promise<{
  readonly context: import('../../src/nutrition-eval/calibration-bootstrap').CalibrationPreparedContext;
  readonly ledger: Readonly<import('../../src/nutrition-eval/calibration').CalibrationRuntimeEvidenceLedger>;
  readonly root: string;
  readonly faults: ProducerFaultWitness;
}>;
```

- [x] **Step 1: Build independently exercised real-syscall controls with faults DISARMED through setup.** Actual native factory request is `{context}`. Independent control68439 actual0/ALL11passed/no skip/todo (one complete disarmed native publication plus before/after every5syscall at attempt), observed634–1894ms/default5000; actual real-source/test strict/full lint67611 each0. Utility-target absence15699/11fail solely missing new helper is not producer behavior RED. Fresh primary3.8High/user-permitted read-only CLI pre-plan42600 and correction15568 actual0, nativeconversation59a1998d-13f4-465d-83fa-941aef8f0718, corrected scope TASK3_NATIVE_FIXTURE_PLAN_CORRECTION_ONLY/agree/MUSTnone. Stale worktree/config metadata, invented timing, disarmed-no-trace, universal cleanup and authorization-after→SDK1 claims explicitly retracted; BOTH authorization cuts have SDK0, transparent setup trace allowed/reset on arm. No reviewer mutation/fallback. These are helper controls, not full matrix/result approval. `makeProducerFaultFixture` calls read-only old `makeMiniGitRepoTask4(ownedRoots)`, `createCalibrationBootstrapReadDeps(mini.root)`→`prepareCalibrationBootstrapContext`, new fault witness at `resolve(context.baseDir,CALIBRATION_ROOT)`, real native factory with its low-level overrides, `acquireLock(context.owner)`, then real `reserveTokenCount`/`completeTokenCount` for the first preflight case/model. No high-level verifier/mutation replacement. Assert same-context canonical disk root separately; factory cannot prove it through a nonexistent getter.

Implement syscall delegates with Node `writeSync`/`fsyncSync`/`closeSync`/`renameSync`, opening/fyncing/closing actual directories. Inspect captured native temporary JSON bytes to distinguish append boundaries by new final event type; journal path is separate. The matching boundary is captured at the first temp write and associated with that fd/temp/destination through fsync/close/rename/directory barrier. Track fd dev/ino and completed effect witnesses to avoid reused-fd confusion. Arm only AFTER token setup. Never intercept the high-level ledger to fake success/failure.

For each override the actual pattern is:

```ts
// These locals are inside makeProducerFaultWitness; matching is test-owned.
function around<T>(label: string, matched: boolean, effect: 'before' | 'after', action: () => T): T {
  trace.push(`${label}:entered`);
  if (matched && effect === 'before') { didFire = true; throw new Error('producer-fixture-fault'); }
  const result = action();
  trace.push(`${label}:completed`);
  if (matched && effect === 'after') { didFire = true; throw new Error('producer-fixture-fault'); }
  return result;
}
```

Here `trace:string[]` and `didFire:boolean` are private locals; the selected arm determines match/effect and consumes once. Provide one real native disarmed publication control and before/after control for EVERY override before running producer fault tests. For close-after-throw track that close actually happened; do not close a reused foreign fd. Directory fsync's action closes its own descriptor in finally. Tests read disk state independently after the syscall, not from the witness's expected state. This is a cooperative filesystem seam test, not hardware power-cut proof.

- [x] **Step 2: Write and run the full reachable fault matrix.** Actual whole121runtime46240 exit0/all121passed/no skip/todo; host audited exact11boundaries×5ops×2effects=110distinct named cases, everycut fired, literal actual-prefix/visibility/lock/journal/digest/index/SDK/next-effect/private-poison oracles passed. Repeated unchanged within whole150runtime37870 actual0/all150pass/no skip/todo/max2368ms/default5000. Initial complete helper/native code-only83723 same59a1998d/primary3.8High/user-permittedCLI actual0/agree/MUSTnone; final current150 code/result and whole-suite review remain required. Producer/input/oldfiles unchanged, no manufactured RED/source repair. Enumerate all11 `ProducerFaultBoundary` values × five operations × before/after, running each on a fresh native miniGit root. Only instantiate reachable combinations according to the actual native publication path; document any impossible combination with source reason, not a skipped test. Each case must assert `fired()===true` and its boundary/effect trace; if not reached the fixture is wrong, not producer success. First write/fsync/close/rename/dir failures at attempt or operation start must have zero next raw effect. Reservation/auth hook cuts must have SDK0 and retain any actual consumed reservation. Metadata/settlement/journal/terminal/finish cuts may have SDK1 and must not pretend to undo it.

Concrete table iteration and non-tautological assertions:

```ts
const operations = ['write','file-fsync','close','rename','dir-fsync'] as const;
const effects = ['before','after'] as const;
for (const operation of operations) for (const effect of effects) {
  it(`attempt/${operation}/${effect} blocks image and publication`, async () => {
    const f = await makeProducerFaultFixture(ownedRoots);
    const raw = await buildRuntimeHarness();
    const image = vi.fn(raw.deps.loadImage);
    const publish = vi.fn();
    const producer = await prepareCalibrationRuntimeEvidenceProducer({
      context: f.context, ledger: f.ledger, loadImage: image,
      generateVision: raw.deps.generateVision, lookupSnapshot: raw.deps.lookupSnapshot,
    });
    const key = { stage: 'preflight', profile: 'LOW', caseId: f.context.firstDevelopmentCaseId, sampleIndex: 1 };
    const lockBefore = readFileSync(join(f.root, 'lock.json'), 'utf8');
    f.faults.arm({ boundary: 'attempt', operation, effect });
    await expect(producer.runOutcome(key, async (caps) => { await caps.loadImage(); return null; }, publish)).rejects.toThrow();
    expect(f.faults.fired()).toBe(true);
    expect(image).not.toHaveBeenCalled();
    expect(raw.witness.sdk).toBe(0);
    expect(publish).not.toHaveBeenCalled();
    expect(readFileSync(join(f.root, 'lock.json'), 'utf8')).toBe(lockBefore);
  });
}
```

For the other10 boundaries implement separate test bodies with the corresponding next-effect witness (raw image, raw vision, SDK entry, model callback, publisher, terminal, finish or public success). Read actual ledger/journal arrays and byte prefixes; assert exact event counts/order/owner/ref/key, terminal hash linkage or conservative uncertainty, lock retained and no repair/rollback/retry. A finish effect-then-throw can leave a durable finish despite public rejection: do not assert its absence or a retroactive reversal. Source/lock replacements and caught native faults must leave later calls blocked. Tests for old/forged structural ledgers count as boundary controls, not native proof.

- [x] **Step 3: Add fresh-instance crash/recovery cases at actual durable cuts.** Whole150runtime37870 actual0/allpassed, every new29 result inspected and old121 exact names retained. Twenty actual after-parent-fsync cuts (ten positions×dead/pid-reused declared probes) exercised fresh native instances/explicit new-owner acquire/recovery, unreserved explicit attempt2, consumed-key no-redispatch, reserved interruption journal, conservative orphan-journal failure, terminal reconciliation/finished history; three blocked live/unknown/malformed probes and two malformed-lock controls preserve bytes/inode/prefix. Two actual swallowed authorization/pin after-effects retain fatal/SDK0or1 correctly; real producer finish still cannot authorize benchmark. Separate manual-native terminal-evidence-incomplete control is explicitly NOT claimed as a reachable honest-producer completion cut (bridge checks returned vision before publication). No process killed or physical crash simulated. Nativeb996715a/helperc1b9 frozen, max2368ms/default5000. Final current-hash static/full gates and code/result/native whole-plan reviews remain pending. Stop after attempt, image start, image returned, vision start, reserve, authorize, vision returned, journal, terminal and finish using controlled port/publisher barriers or low-level after-effect faults. Snapshot actual prefix/lock/counts, terminate only the exact owned fixture process if a process cut is used, then prepare a NEW native ledger with explicit new owner and existing acquisition/recovery. Exercise real liveness reader cases dead/pid-reused/live/unknown and malformed owner state; live/unknown must not authorize takeover. New producer is created only after explicit permitted recovery.

Assert actual native dispositions: unreserved interruption, reserved interruption with existing interruption journal, terminal-evidence-incomplete, or clean finished history as appropriate. A key with a consumed reservation can never redispatch, even with a new producer/owner. No automatic attempt abandonment, lock release, recovery or new stage selection is performed by the producer. Ambiguous publication retains lock and fails conservatively; do not repair files. Existing fixture `.restart` is available only when its exact liveness/context semantics match the test; do not silently claim it simulates process death. Use the new fault fixture for syscall control, not old-helper edits.

- [x] **Step 4: Record RED, repair only witnessed producer defects, and verify every matrix case GREEN.** No additional producer defect was witnessed: actual150native37870 allpassed, currenthashstrict/build/full lint43287 each0, full375feature and separate44-file3632-pass nutrition command each0/soleold opt-in imagefetchskip, exact case/file populations audited including oldcapability153/codec114/state115/core215/native199. Clean current150code/result98276 plus correction28410 same59a1998d/primary3.8High/user-permittedCLI actual0/completeinspectionyes/agree/MUSTnone; explicit correction limits new-owner recovery to original-prefix preservation/retained lock, not unchanged oldlock/entirearray identity or physical process death. These are already-correct controls, not manufactured150RED→GREEN; no new source/input/old-file changes. Defaultfull stillactive/Step5whole-result/nativefinalreview pending, no plan completion inferred. Controls must prove exact seam reachability and actual disk effects. A new test that already passes is qualification/control evidence, not invented RED. Every behavior repair requires a failing focused assertion before source changes, new-source-only repair, same focused GREEN and preserved frozen prefix. Do not change old native storage to make the bridge pass; stop for a separately reviewed amendment if required. Run full feature files and old capability/codec/reducer/core/native controls serially.

- [x] **Step 5: Run all final precommit gates and actual code/result review.** Actual43287 exit0: standalone strict/build/full lint0,375focused0,44files3632nutrition+soleoldskip0,57files4027DEFAULTfull+sameoldskip0; every testcase/failureMessages and exact populations audited0. External whole-feature59153+correction42649 eachactual0/primary3.8High/user-permittedCLI/same59a1998d/completeinspectionyes/agree/MUSTnone. ONE completed independent native whole-plan review gpt-6.1-sol/High/fork none `/root/producer_whole_plan_recovery` completely inspected all six current files and committed range+Task3overlay/old repair/spec/plan/all rulings, independently parsed every actual receipt; Critical/Important/Minor none, agree/MUSTnone, checkpoint-only verdict. Earlier Astra attempt failed usage limit before verdict, not counted as review. All eight declined boundaries ruled with costs in ledger; no producer repair/manufactured RED/deferred minors. Frozen hashes retained, postcommit full still required. The original requirements remain: exact final commands and actual receipts, exhaustive result inspection, ONE independent native whole-plan review plus actual external agreement, tests-first repairs for Important findings and explicit deferral/rulings for nonblocking items.

- [x] **Step 6: Commit/push source checkpoint and verify POSTCOMMIT full suite.** Actual source checkpoint8fe982f3766d178dbe2435e47d30944babc447e6, prescribed commit/exactfourownedpaths, push30150actual0/liveoriginexact. Fresh unchanged-source DEFAULT full35846/task-done3 actual0/57files4027pass/soleoldimagefetchskip/0fail/todo,4028records/no failureMessages; exact precommit populations/old358baseline audited0 by both scripts and host. All eight code/test and protected config hashes retained; no HEAD/source movement/retry/timeout change. Required actual Task3complete24e435e..8fe982f ledger line recorded. Final tracking/push/cleanup still next.

- [ ] **Step 7: Final documentation checkpoint and bounded cleanup.** Only after actual postcommit success mark this task/plan complete, update status with exact receipts/source SHA/push/reviews/next open parent step, commit/push tracking and verify origin. Collect rulings, unresolved blockers, all failures/fallbacks and deferred minors before recoverable cleanup of ONLY this new owned workspace after confirming no jobs remain. Old removed durable workspace stays absent. Report bridge qualification as hermetic mediated-seam evidence only, not default controller/full146call/benchmark/nutrient-accuracy/production/security approval. No UI run exists: run IDs/diff status/source/auditor/reviewer/recovery/auditLimited/visualClassificationStatus and visual inspection are N/A.

## Exact verification commands and receipt rules

Run from `/home/agent-runner/projects/calorix/functions`, after execution-time disk verification and task-owned TMPDIR/cache setup. `set -euo pipefail`; capture actual exit codes without losing failing receipts. Run long gates in a background terminal session and collect their real completion before reporting. Use bounded memory/serial workers; do not run parallel full suites on this Pi.

```bash
npx tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --esModuleInterop --skipLibCheck --target ES2022 --lib ES2022 --module ESNext --moduleResolution Bundler --types node,vitest/globals src/nutrition-eval/calibration-runtime-evidence-producer.ts src/nutrition-eval/calibration-runtime-evidence-producer-input.ts test/nutrition-eval/calibration-runtime-evidence-producer-fixtures.ts test/nutrition-eval/calibration-runtime-evidence-producer.test.ts test/nutrition-eval/calibration-runtime-evidence-producer-guards.test.ts test/nutrition-eval/calibration-runtime-evidence-producer-native.test.ts
npm run build
npm run lint
npx vitest run test/nutrition-eval/calibration-runtime-evidence-producer.test.ts test/nutrition-eval/calibration-runtime-evidence-producer-guards.test.ts test/nutrition-eval/calibration-runtime-evidence-producer-native.test.ts --no-file-parallelism --maxWorkers=1 --minWorkers=1
npx vitest run test/nutrition-eval --no-file-parallelism --maxWorkers=1 --minWorkers=1
npm test -- --no-file-parallelism --maxWorkers=1 --minWorkers=1
```

Before Task3 creates its new native file, omit only not-yet-existing Task2/Task3 filenames from the task-specific strict/focused commands; final commands above include ALL six. Default full suite uses unchanged `functions/vitest.config.ts`, no excluded old tests or altered timeouts/retries. Add Vitest JSON reporter/output arguments at execution with exact NEW owned log paths while retaining full case population; retain raw log, JSON, command, SHA and actual exit for both pre/postcommit. Check the case set, not merely rounded counts; historical baseline is54 files/3645passed/one existing skip before these additions, not a promised new count.

Only existing permitted skip: `public-manifest fetches and verifies all 20 public case images against their SHA-256` with `RUN_NUTRITION_EVAL_FETCH` unset. No new `.skip`, `.todo`, `.only` or conditional bypass. Full Functions gates here are hermetic default suites, not Firebase emulator/network/mobile release gates. Flutter/device/APK/UI, live provider/SDK/OFF, full calibration/controller benchmark/security/production gates are intentionally out of this unused TypeScript slice and must be reported as not run, never passed.

Execution-time command correction (2026-10-18): standalone `tsc` now explicitly uses `--lib ES2022`, matching unchanged `functions/tsconfig.json` rather than implicit browser DOM globals. The original command failed at existing `off-snapshot-store.ts:148` with Buffer/BodyInit TS2345; the old capability fixture alone reproduced that same exit2, without new producer files. Both new foundation files and their real transitive source imports pass the unchanged strict flags with the explicit production library set (exit0). Actual primary3.8/High headless review61144 in the scoped producer conversation returned FOUNDATION_VERIFICATION_COMMAND_ONLY / agree / MUST_FIX none / SHOULD_FIX none. No source/config/dependency, fake declaration, strictness or population change; neither failed run is counted green. This is checker-environment alignment, not production/security approval.

Before each checkpoint host runs `git diff --check` on explicit owned paths, confirms frozen prerequisites/source defaults/package/config contents match task BASE, verifies user config by fingerprint only, updates actual review/RED/GREEN/push receipts and stages explicit paths. Never `git add .`, broad status-file dumps, unbounded log output, or secret values. Public reports link this plan on GitHub.

## Inline self-review and external review receipt

Planning self-review must map every spec section to Tasks1–3, inspect exact interfaces/helper names/types and all five Review Focus tests, scan placeholders/fences/references, and confirm source/tests/defaults are unchanged at planning time. Actual external plan review, document verification and written user review are recorded here when they occur. No implementation, test result or production approval is implied by a plan review.

Host inline self-review mapped architecture/capture/identity/success to Task1, lifecycle/error/callback/barcode/terminal ownership to Task2, persistence/recovery/default-block/final verification to Task3, and workflow/reporting/exclusions to shared constraints and completion gates. It checked actual ledger/adapter/planner/fixture and failure-journal interfaces, corrected the required-dependency count to five, and pinned actual failure codec policy (`decision:'error'`, hash equals safe category, `n/a` version). All five Review Focus conditions have owning test constructions. This is plan self-review, not execution or independent agreement.

External review attempts used actual Antigravity MCP/High/yolo and scoped conversation `calorix-runtime-evidence-producer-plan-20261018`; reviewed-input target was the complete531-line/55397-byte draft, SHA256 `12dea2c189b66323fe6121eec8a64d0e0670b3e0a2aed7cbfce0f7875ed2ac53` (before this status/receipt addition). NONE returned a substantive assessment:

- Primary `gemini-3.8-flash`, exec1168, failure collected `2026-10-17T22:44:41Z`, category MCP tool timeout: `tool call error: tool call failed for antigravity-mcp/ask-ai; Caused by: timed out awaiting tools/call after 300s`.
- Fallback `gemini-3.7-flash`, exec1178, collected `2026-10-17T22:45:09Z`, category wrapper/model effort incompatibility: `Error executing ask-ai: agy exited with code 1. error: invalid model selection (--model "gemini-3.7-flash" --effort "high"): --effort is not supported for model "gemini-3.7-flash"`.
- Final fallback `gemini-3.6-flash`, exec1181, collected `2026-10-17T22:45:37Z`, same category: `Error executing ask-ai: agy exited with code 1. error: invalid model selection (--model "gemini-3.6-flash" --effort "high"): --effort is not supported for model "gemini-3.6-flash"`.

Errors were recorded before each fallback; the host passed no effort API argument and did not alter the approved route or substitute a CLI review. A read-only persisted-conversation check found exactly one primary turn, timestamp `2026-10-17T22:44:11.443Z`, whose entire response is `[agy] print timeout after 5m0s with turn in progress; returning partial output`. That is timeout/wrapper noise, NOT an assessment or `AGREEMENT_STATUS: agree` / `MUST_FIX: none`. No green review, implementation approval, reviewer test execution or readiness claim is recorded. Worktree and plan/config fingerprints were checked after failures; no reviewer mutation observed.

Documentation checks passed after correcting two checker-only mistakes: an expected total20 versus actual6+6+7=19 steps, and a case-insensitive placeholder matcher falsely matching the explicit prohibition on `.todo` tests. Corrected controls preserve valid prohibitions while rejecting actual placeholders. These were not product test failures or reasons to edit the plan's requirements. Whitespace/fences/unchecked steps, bounded token-pattern hygiene, existing source/test/package preservation, user-config fingerprint and absence of old/new execution workspaces were checked; application tests were intentionally NOT run for this documentation-only stage. Before implementation, obtain actual complete plan agreement through the required MCP gate and written user review; preserve the supplied inline worker method.

Subsequent execution handoff (2026-10-18): user approved this written plan and explicitly authorized the headless review exception above. Fresh `agy models` lists Gemini3.8 high/medium/low, `claude-sonnet-4-6`, `claude-opus-4-6-thinking` and `gpt-oss-120b-medium`; no model change to the calibration pipeline is implied. Actual headless primary `gemini-3.8-flash --effort high --mode plan --print-timeout 0`, session1875 actual0, scoped conversation `bf7fb6e9-9b42-47f7-ad3f-e0a7c601595b`, reviewed the complete546-line/58953-byte plan SHA256 `124f5143dbdff3517792a138fea63cabbf2129cbe326c78a67e399c3d000a0da` and approved spec SHA256 `48bce703ce9118e2c8006969967ac5d0d4e31a3cf2d9c2c1ff2d8ca2718cf661`. Nonempty response explicitly reports WRITTEN_PRODUCER_IMPLEMENTATION_PLAN_ONLY / COMPLETE_PLAN_INSPECTION yes / AGREEMENT_STATUS agree / MUST_FIX none / QUESTIONS none / NOT_IMPLEMENTATION_APPROVAL. This is USER-PERMITTED CLI agreement, NOT MCP agreement or executed implementation verification.

Two nonblocking SHOULD_FIX reminders: import used test bindings explicitly (clarified above; do not add unused `vi`) and fully complete token readiness before arming faults (already explicit in Task3 Step1, retained). Host checked both against actual source/plan. Reviewer statements about preventing property-getter reentry, producer-visible terminal finalization and universal zero hook-failure dispatch are treated only as intended guarded seam behavior, not sandbox/universal transport proof. The existing spec's trap-execution/trusted-publisher/after-handoff limitations stand. Its no-tests/workers statement describes reviewer actions only: the HOST independently launched a fresh existing-source baseline, still pending at review collection. No reviewer repository mutation observed; source/tests and user-config fingerprint unchanged. New ignored task workspace is on verified `/dev/sda2` ext4; old completed workspace remains absent. Execution continues with actual baseline verification and worker-only fixture controls before behavioral RED/source authoring.

## Execution decision record — chronological rulings

This preserves every producer-ledger ruling before bounded scratch cleanup. These are executor decisions and their costs, not extra implementation or release approvals. The final native reviewer reported no Critical, Important or Minor issues; deferred minors: none.

1. Use user-permitted headless Antigravity after MCP failure, never mislabel CLI agreement as MCP. Cost: separately inspect CLI exit/conversation/noise receipts.
2. Preserve the approved existing feature checkout/dependencies rather than create another worktree. Cost: less isolation requires exact path and fingerprint controls.
3. Construct MEDIUM controls only after real LOW prerequisites on the same fresh fixture. Cost: more hermetic setup; capture the post-setup prefix and do not expect another matching pin.
4. Barcode zero-reservation means the delta for the twelve producer outcomes, not zero historical reservations. Cost: an absolute-zero oracle would reject valid prerequisite history or encourage fabricated setup.
5. Isolate OpenCode configuration only in the task process instead of repairing global configuration. Cost: global custom settings/plugins are absent in that process; only approved refreshed routes may be used.
6. Enforce worker patch-only editing with process-local edit denial and an exact native patch-command allowlist. Cost: shell/permission syntax can reject legitimate patches; this is not universal sandboxing.
7. Bound an idle free-worker method probe at 180 seconds. Cost: a legitimate queued turn might be interrupted; do not call that quota exhaustion.
8. Narrow the paid worker to dontAsk and the explicit patch-only allowlist. Cost: valid patch commands may be denied; no silent broad-shell restoration.
9. Proceed after the worker actually demonstrated patch/read capability rather than request an exception prematurely. Cost: subsequent method violations must remain unaccepted and stop that worker.
10. Interpret the user's direct answer to the explicit scoped native-edit request as permission for this plan's six NEW files only. Cost if misread: narrow host authorship the user can revoke; all tests/reviews and default/live/cloud restrictions remain.
11. Align standalone strict checking with production's explicit `--lib ES2022`, keeping every strict flag and real source imports. Cost: browser contracts are not checked by this Node-only command; production build stays separate.
12. Add the witnessed required-operation publication barrier, but reject clearing unfinished native attempts or changing the key API. Cost: early dataset classification is conservatively rejected; real prefixes/locks remain for explicit recovery.
13. At Task1, count the fully audited default suite as execution of named old nutrition/native/capability cases, not an invented isolated-folder command. Cost: no extra folder-order evidence then; Task3 retains all literal separate gates.
14. Initially author only ten genuinely benchmark-dependent NEW guard tests with per-test600000ms. Cost: a genuinely hung new case can take ten minutes; ordinary/old/global/production limits remain unchanged.
15. Stop at the six-file boundary when genuine ordinary-failure controls expose an old prerequisite conflict. Cost: Task2 pauses pending consultation/authority rather than silently changing frozen code.
16. Propose the narrow ordinary-failure `completed` reducer alignment while preserving success/interruption/hash/key/pin/order/recovery validation, with append-only regressions and explicit user authorization. Cost if wrong: incorrect terminal admission or failure classification; negative/replay/report/full-suite gates remain mandatory.
17. Preserve the two known native failures in an explicitly red diagnostic checkpoint, not skips or weakened assertions. Cost: intermediate CI may fail until the separately authorized repair lands; no release/task completion claim.
18. Accept Task2's actual unchanged87 plus audited full suite as the precommit225 cohort, with fresh COMMITTED225 still required and actually run. Cost: focused-selection differences lack an extra precommit-only run; any code/oracle change voids the cadence.
19. Do not manufacture another producer edit/RED when every Task2 guard already passes and actual review finds no defect. Cost: untested defects remain possible; Task3 native cuts and final independent review stay mandatory.
20. Label manual native `terminal_evidence_incomplete` as a public-alias boundary control, not an honest-producer reachable completion cut. Cost: other untested schedules could exist; final review deliberately inspected pending/publication closure.
21. Supply the official whole-feature committed package PLUS current Task3 overlay and all six current files. Cost: a stale packet could omit untracked behavior; exact hashes and complete-current-file review mitigate it.
22. Replace the usage-limited native Astra attempt with strongest remaining listed gpt-6.1-sol/High. Cost: different reviewer capability; no verdict or gate was waived, and exactly one completed independent review was obtained.
23. Structural ledger authentication, cloned-root attestation, hostile aliases and privileged writers stay outside cooperative trusted assembly. Cost: dishonest assembly can invalidate evidence; no security approval.
24. Opaque SDK retries and arbitrary transitive network activity are not prevented by this bridge; the dishonest-port control witnesses divergence. Cost: hidden dispatches/network effects can exceed authorization counts; separate transport qualification remains.
25. Software syscall cuts and declared liveness are not physical power-loss or process-death proof. Cost: actual hardware/filesystem crash behavior may differ.
26. Wholly hidden trusted-publisher exceptions are unobservable; observed facade denials still poison finish/success even if a terminal was written. Cost: publisher internal honesty is not attested.
27. Already handed-off effects and prior durable finishes cannot be universally cancelled/revoked; stale callbacks cannot gain new authority. Cost: external effects may settle after failure and require explicit uncertainty/recovery.
28. Cleanup is exact-owned and attempted on covered paths, not guaranteed under process death/arbitrary filesystem faults. Cost: abnormal termination can leave owned artifacts for later bounded cleanup.
29. Default controller/live provider/OFF/benchmark/report admission/complete-stage/full146/nutrient accuracy/production/security/mobile/UI remain excluded. Cost if misrepresented: unqualified release behavior; parent Task7 Steps4–7 stay open.
30. Earlier unrelated work on the long-lived branch is not approved by this exact feature-range review. Cost: unrelated defects need their own integration review; no merge/PR authorization.

Failure/fallback summary: original MCP primary timed out;3.7/3.6 rejected High-effort compatibility, so only the explicit user CLI exception enabled review. Editing routes encountered Grok unknown-model, Qwen quota, OpenCode invalid global config/upstream503, absent Muse1.3/Ling3 catalog entries (not provider failures), patch-method violations/refusals and bounded idle-worker termination; paid Claude then hit session quota (session100%, week65%, not whole-account or extra-spend-cap exhaustion). The scoped native-edit exception followed the user's answer. Final native Astra attempt hit native usage limit before verdict; replacement gpt-6.1-sol completed clean. Current Task3 external reviews remained on primary `gemini-3.8-flash`/High with no provider fallback; factual response noise was explicitly corrected, never counted silently green. Exact dated errors remain in implementation-status history. Earlier genuine behavior REDs and failing checkpoints remain recorded; Task3's already-correct150 controls are not claimed as150RED→GREEN.

Protected config hygiene: `.mcp.json` contents stayed unread/content-undiffed/unstaged/unedited with fingerprint `9c9622f5dfd38f8eed1ac0d1b69034dc5399e77481600030148547235b06a688`. An earlier broad diff-stat exposed line-count metadata only; no claim is made that zero metadata was ever displayed. No generated build output, logs, dependencies or runtime credentials are committed.
