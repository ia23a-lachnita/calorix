# Calibration Runtime Evidence Producer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compose the existing capability primitive and native evidence ledger into an unused, opt-in outcome producer that cannot turn persistence or capability faults into successful terminal publication.

**Architecture:** A new pure input module captures prepared context and trusted method references. A new producer owns private invocation/facade/callback state and delegates durable authority to the unchanged ledger. New native-fixture tests independently observe persisted records and the real adapter's injected fake SDK; they do not use observation replay as evidence.

**Tech Stack:** Existing TypeScript strict configuration, Node filesystem/Git fixtures, Vitest, unchanged `@google/genai` adapter with an injected fake client. No dependency or configuration changes.

**Spec:** `docs/superpowers/specs/2026-10-18-calibration-runtime-evidence-producer-design.md` (written-spec approval: user's “sounds good continue” following the published `bba2ea9` spec).

**Status:** Written plan approved by the user's “looks good cotniinue” (2026-10-18); that message permits headless `agy` reviews for this workstream. Actual headless primary3.8/High plan review agreed/MUST_FIX none. The later direct answer to the scoped native-edit request permits only this plan's six new files. Task1 Step1 foundation helper/control are qualified: focused native control, production-aligned strict typing, scoped/full lint and build passed; complete two-file external foundation review agrees/MUST_FIX none. Full serial Functions2837 actual0: all55 files/3646 passed/sole existing image-fetch skip, every assertion/file audited and old358-case population preserved. Step1 alone is checked; Task1 and the other18 steps remain open. No producer source or behavioral RED exists yet. Next is Step2/3 tests-first, not default activation or live calibration.

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

Only these six application/test files are authorized. Planning/tracking updates: this plan, its spec's approval/review metadata, `docs/implementation-status.md`, and a factual link in the parent calibration plan if needed. Changes to existing source, tests, helpers, package/config files, thresholds or timeouts require a separately reviewed amendment, not opportunistic edits.

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

- [ ] **Step 2: Write failing preparation, input-binding and native-success tests.** Include this concrete success test and table controls for each individual context field/hash, bad profile, required ledger method, unknown deps/key field, missing publisher and accessor. Factory zero-effect control uses a structurally valid full ledger record with every required method replaced by a throwing spy; preparation must call NONE. This structural control tests capture only, not native authority.

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

- [ ] **Step 3: Witness actual RED.** From `functions/`, run `npx vitest run test/nutrition-eval/calibration-runtime-evidence-producer.test.ts --no-file-parallelism --maxWorkers=1 --minWorkers=1`. Foundation controls must pass; feature tests fail solely for the missing producer module/export or specific missing behavior, not miniGit/setup/typing errors. Save exact exits/case records and helper/test hashes in the new execution workspace; host freezes them before source-only authoring. Stop to repair fixture defects tests-first rather than label unrelated failures RED.

- [ ] **Step 4: Implement input capture and the complete basic lifecycle.** Use descriptor-copy validation and identity binding from the contracts above. Factory captures synchronously, awaits pinned preflight verification, then prepares capabilities with producer-owned callbacks. The producer reserves capture/work/publishing/closed phases and an invocation generation, privately stores the real attempt ref, wraps facade AND raw ports, awaits primitive closure, closes work, invokes publisher once, then finishes against the real terminal. All reflection/callback/await boundaries recheck private monotonic poison/current generation. Unexpected work/publisher throws are fatal; cleanup only closes local state.

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

- [ ] **Step 5: Verify GREEN and preserve prerequisites.** Run the whole new basic file, old capability and old native evidence files serially, plus strict real-source/test typing, build and full lint (exact shared commands below). Host reads every failure/skip and the source diff, confirms no default importer/new network/client/format change and no mutation of frozen files. Actual Antigravity MCP scoped Task1 code/result review must agree/MUST_FIX none; correct feedback via new focused failing tests before source repair. No native per-task reviewer.

- [ ] **Step 6: Checkpoint.** Update task status with actual RED/GREEN/review receipts, remaining tasks and no live/default approval. Host stages only Task1's four new files and owned tracking; commit `Add opt-in runtime evidence producer`, push `origin fix/scan-photo-flow-viewer`, verify live branch equality. Only mark completed steps after actual passing verification; retain local commit if push fails and record exact error. Run a fresh committed focused Task1 gate before proceeding.

### Task 2: Fatal barriers, ordinary failures, barcode and terminal ownership

**Files:** Modify only the two new source modules/helper/basic tests; create `calibration-runtime-evidence-producer-guards.test.ts`; update owned tracking. Frozen prerequisite files remain untouched.

**Interfaces:** Consumes Task1 factory, `ProducerFixture`, `deferred<T>()`, exact capability methods and publisher signature. Produces unchanged public API with complete first-fatal/phase/pending/callback semantics and additional failure/barcode helper builders. Add `publishPrediction(key: CalibrationReportOutcomeKey, prediction: NutritionPrediction, category: CalibrationSafeErrorCategory, responseModelVersion: string): void` to the helper; it uses the real prediction/journal codec and actual `appendResultJournal`→`complete`, or real barcode non-reservation API. It is test-only, never production error classification.

- [ ] **Step 1: Write narrowly failing swallowed-fatal and publication-phase tests before source changes.** This regression exercises a private capability denial before raw-port entry, even though work catches the returned error:

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

- [ ] **Step 2: Add concrete case-table tests for all remaining boundaries.** Every row below is a required test group, not a substitute for actual test bodies. Use `deferred()` to control entry/settlement and `vi.fn` counters to assert the next forbidden effect; no arbitrary sleeps, weakened throws-only oracles or new skips.

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

- [ ] **Step 3: Record focused RED and freeze tests.** Run the new guard file with the same serial Vitest flags; run basic/native fixture controls separately. Host checks each new failure is its intended assertion, not missing helper/module/setup or invalid codec input. Existing controls stay green. When an already-correct behavior passes, record it as a control; add a real missing-behavior regression rather than weakening assertions to force RED.

- [ ] **Step 4: Strengthen private guards without changing public/old APIs.** Facade failures are recorded even before raw entry. Each vision invocation has its own hook/metadata/pending/authorized/raw-rejection flags; never a producer-global “last provider error”. Only its corresponding healthy raw rejection after completed reservation+authorization can be treated as ordinary by that facade call. A later lease/private failure wins over that flag. Sync snapshot and async image/vision all use the same generation/phase checks; image/snapshot throws always poison.

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

- [ ] **Step 5: Run whole feature/basic/guard controls and shared strict/build/full lint gates, then scoped actual Antigravity code/result review.** Inspect all final persisted artifacts used by the hermetic assertions, SDK counters and no-extra-skips, not visual UI artifacts. Preserve exact source/test/hash receipts and worktree protections. Correct must-fix feedback tests-first in the same scoped review conversation until agree/MUST_FIX none.

- [ ] **Step 6: Checkpoint.** Host updates plan/status and commits only the six allowed feature files that changed plus owned tracking, message `Enforce outcome lifecycle and publication barriers`; pushes origin, verifies exact branch SHA, runs fresh committed full feature gate. No default/live/benchmark/report-admission approval.

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

- [ ] **Step 1: Build independently exercised real-syscall controls with faults DISARMED through setup.** `makeProducerFaultFixture` calls read-only old `makeMiniGitRepoTask4(ownedRoots)`, `createCalibrationBootstrapReadDeps(mini.root)`→`prepareCalibrationBootstrapContext`, new fault witness at `resolve(context.baseDir,CALIBRATION_ROOT)`, real native factory with its low-level overrides, `acquireLock(context.owner)`, then real `reserveTokenCount`/`completeTokenCount` for the first preflight case/model. No high-level verifier/mutation replacement. Assert same-context canonical disk root separately; factory cannot prove it through a nonexistent getter.

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

- [ ] **Step 2: Write and run the full reachable fault matrix.** Enumerate all11 `ProducerFaultBoundary` values × five operations × before/after, running each on a fresh native miniGit root. Only instantiate reachable combinations according to the actual native publication path; document any impossible combination with source reason, not a skipped test. Each case must assert `fired()===true` and its boundary/effect trace; if not reached the fixture is wrong, not producer success. First write/fsync/close/rename/dir failures at attempt or operation start must have zero next raw effect. Reservation/auth hook cuts must have SDK0 and retain any actual consumed reservation. Metadata/settlement/journal/terminal/finish cuts may have SDK1 and must not pretend to undo it.

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

- [ ] **Step 3: Add fresh-instance crash/recovery cases at actual durable cuts.** Stop after attempt, image start, image returned, vision start, reserve, authorize, vision returned, journal, terminal and finish using controlled port/publisher barriers or low-level after-effect faults. Snapshot actual prefix/lock/counts, terminate only the exact owned fixture process if a process cut is used, then prepare a NEW native ledger with explicit new owner and existing acquisition/recovery. Exercise real liveness reader cases dead/pid-reused/live/unknown and malformed owner state; live/unknown must not authorize takeover. New producer is created only after explicit permitted recovery.

Assert actual native dispositions: unreserved interruption, reserved interruption with existing interruption journal, terminal-evidence-incomplete, or clean finished history as appropriate. A key with a consumed reservation can never redispatch, even with a new producer/owner. No automatic attempt abandonment, lock release, recovery or new stage selection is performed by the producer. Ambiguous publication retains lock and fails conservatively; do not repair files. Existing fixture `.restart` is available only when its exact liveness/context semantics match the test; do not silently claim it simulates process death. Use the new fault fixture for syscall control, not old-helper edits.

- [ ] **Step 4: Record RED, repair only witnessed producer defects, and verify every matrix case GREEN.** Controls must prove exact seam reachability and actual disk effects. A new test that already passes is qualification/control evidence, not invented RED. Every behavior repair requires a failing focused assertion before source changes, new-source-only repair, same focused GREEN and preserved frozen prefix. Do not change old native storage to make the bridge pass; stop for a separately reviewed amendment if required. Run full feature files and old capability/codec/reducer/core/native controls serially.

- [ ] **Step 5: Run all final precommit gates and actual code/result review.** Use the exact commands below with new disk-backed logs and actual exit receipts, parse EVERY assertion's file/name/status including nonpassed records. Run ONE independent native whole-plan read-only reviewer after all implementation tasks, covering spec/plan/diff/tests and trust-boundary limitations; no editing/committing/pushing by that reviewer. Native findings supplement, never replace, scoped Antigravity MCP `AGREEMENT_STATUS: agree` / `MUST_FIX: none`. Fix Important/must-fix findings tests-first; repeat affected and full gates as necessary. Record deferred minor findings and tradeoffs, never silently drop them.

- [ ] **Step 6: Commit/push source checkpoint and verify POSTCOMMIT full suite.** Freeze source/test/helper/config hashes; host stages only allowed feature/tracking paths, commit `Qualify native producer persistence and recovery`, push and verify actual origin SHA. Run the DEFAULT full serial Functions suite again on that committed/pushed unchanged source, compare exact file/case population with precommit JSON and allow only the existing opt-in public manifest fetch skip. No HEAD/source movement while this gate is active. A failing/timed-out run is preserved/reported, never counted green or hidden by an automatic retry loop/raised timeout. Diagnose before further action.

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
