# Calibration Runtime Capabilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an unused calibration runtime primitive that mediates canonical image/vision/snapshot operations and records in-memory diagnostic observations without changing existing execution or benchmark authority.

**Architecture:** Derive the operation plan from captured checksum-pinned input strings using the existing canonical outcome planner. A serial outcome lease owns wrapped capability access and a final-SDK-hook reservation; privately owned observations distinguish operation attempts, completions and failures. A native adapter/fake SDK harness independently witnesses dispatch arithmetic without claiming durable or universal network proof.

**Tech Stack:** Existing TypeScript 5.5, Node 20, Vitest 2, `@google/genai` 2.19.0; no dependency/package changes.

**Spec:** `docs/superpowers/specs/2026-10-12-calibration-controller-runtime-design.md` (user approved 2026-10-13), with fixed protocol constraints from `docs/superpowers/specs/2026-09-23-gemini-38-nutrition-calibration-design.md` and its parent plan.

**Status:** User-approved 2026-10-13; original138 behavior tests and1101-line source5af9 reached focused377/full2987+1existing skip, but the ONE final native review found two Important capture/lifetime gaps on 2026-10-14. The single test-first final fix pass is active, with15 append-only independent regressions planned and external fix-plan green. No source acceptance/commit, Task1 completion or production approval yet. Preserve inline host orchestration with required editing workers; no second native reviewer or permanent host-code-edit exception.

## Global Constraints

- The first implementation stage is an unused mediated capability primitive. Durable evidence, benchmark authorization and default CLI activation follow only through separately explicit reviewed contracts.
- First-stage observations are privately owned, keyed and privacy-safe. They are **in-memory diagnostic observations only**: no fsync evidence writer, persistent event schema, admission seal, restart authority or runtime-evidence verifier is added in this stage.
- No runtime snapshot reader, live OFF transport or provider-response cache is exposed. No factory may silently choose a default SDK/network/file dependency when a required port is absent.
- Existing CLI dependency requirements, ledger/header/events/public APIs and unconditional benchmark block stay unchanged. Existing production no-options request behavior and all old tests stay unchanged.
- The primitive owns its operation state; outcome keys and modalities come from the existing pinned outcome plan, not a configurable replacement list.
- Use the existing final SDK `VisionGenerationOptions.beforeRequest` seam for exactly one reservation before `generateContent`. Do not reserve both in the earlier live-adapter hook and the final SDK hook.
- No new `gemini-2.5-flash` requests of any kind. Only the committed historical reference may contain its prior evidence. No live model calls, default/provider route change, cloud/device operation, deployment or promotion.
- Calibration identity remains `calorix-xurschnell` / `us` / `gemini-3.8-flash`, profile LOW or MEDIUM, timeout `30000`, manifest media type; production request compatibility is unchanged.
- Planned full-protocol image calls remain `2/48/48/48 = 146`, separately recorded token count, hard ceiling `300`; this primitive neither implements that complete controller nor grants another run.
- Normal strongest-first editing workers author application code/tests. Host edits planning/tracking docs only and owns review, verification judgment, commits and pushes. Workers never commit/push.
- Use verified disk-backed task-scoped TMPDIR/cache/logs, serial test workers and conservative memory. Never recreate/clean the completed prerequisite workspace or sweep shared `/tmp`.
- Preserve user `.mcp.json` unchanged, unread, undiffed and unstaged; check only its filename/status and SHA256.

## Review Focus

1. A body returns while an operation is still pending: close/poison its lease, observe the outstanding rejection internally, and prevent later reservation/SDK callbacks from completing a released lease. JavaScript cannot prove whether an already-settled operation was explicitly awaited; do not claim that stronger check.
2. A dependency catches a nested reentry error: permanent poison still wins at the next await/callback boundary; no subsequent SDK effect is allowed.
3. A trusted generator ignores/repeats the final hook or invokes metadata late: fail the lease contract; do not infer dispatch success from adapter return or invoke a stale reservation.
4. Caller aliases mutate dependency/file/key records and returned observations: captured state stays independent and no caller object is frozen/mutated.
5. A fake SDK issues two lower transport invocations for one adapter call: the independent test witness detects mismatch; the primitive must not claim to intercept an opaque client's internal retries.

All five get constructible tests in Task1. The graph is cooperative mediation over explicitly trusted ports, not an OS/process sandbox. Importing the existing bootstrap planner reaches a mixed module with native readers; only its synchronous canonical planner is called. Do not claim a transitive fs-free import graph.

## Files and preservation boundary

Create only:

- `functions/src/nutrition-eval/calibration-runtime-capabilities.ts`
- `functions/test/nutrition-eval/calibration-runtime-capabilities.test.ts`
- `functions/test/nutrition-eval/calibration-runtime-capabilities-fixtures.ts` (new test-only committed-input harness)
- `functions/test/nutrition-eval/calibration-runtime-capabilities-fixture-controls.test.ts` (independent native harness control; never imports the absent/new runtime module)

Tracking: this plan, the parent plan and `docs/implementation-status.md`. The design's approval bookkeeping is documentation only.

Do not modify any existing application/test/helper/fixture/manifest/package/config file, including `genai-adapter.ts`, `live-adapter.ts`, `runner.ts`, `calibration.ts`, bootstrap, snapshot startup, publisher, artifact reader or historical comparator. A needed change outside this boundary is a plan defect/scope change, not an implicit permission.

## Shared interfaces

Imports are from existing modules: `CalibrationProfile`, `ReservationKey` and `StageName` from `calibration` (type-only); `CalibrationReportOutcomeKey` and `CalibrationPlannedReportOutcome` from `calibration-report-state` (type-only); `CalibrationPreflightFileName` from `calibration-cli` (type-only); `GenAIAdapter` from `../genai-adapter` (type-only); `OffProduct` from `../off-client` (type-only). Runtime imports: existing `deriveCanonicalReportOutcomePlan`, `CalibrationFatalError`. No native client construction/default port.

```ts
export interface CalibrationRuntimeCapabilityDeps {
  files: Record<CalibrationPreflightFileName, string>;
  selectedProfile?: CalibrationProfile;
  loadImage: (key: Readonly<CalibrationReportOutcomeKey>) => Promise<Uint8Array>;
  generateVision: GenAIAdapter['generateVision'];
  reserveImage: (key: Readonly<ReservationKey>) => Promise<void>;
  onModelVersion: (key: Readonly<ReservationKey>, version: string) => void;
  lookupSnapshot: (barcode: string) => Readonly<OffProduct> | undefined;
}
export interface CalibrationOutcomeCapabilities {
  loadImage: () => Promise<Uint8Array>;
  generateVision: (request: unknown) => Promise<string>;
  lookupSnapshot: () => Readonly<OffProduct>;
}
// generateVision request is exactly two enumerable own data strings:
// { prompt: string, imageBase64: string }, both nonblank. It supplies no
// caller model/profile/media/source/timeout/hook overrides.
export interface CalibrationRuntimeObservation {
  readonly sequence: number;
  readonly key: Readonly<CalibrationReportOutcomeKey>;
  readonly operation: 'outcome' | 'image' | 'vision' | 'reservation' | 'metadata' | 'snapshot';
  readonly status: 'attempted' | 'completed' | 'failed' | 'blocked';
}
export interface CalibrationRuntimeCapabilities {
  runOutcome: <T>(key: unknown,
    body: (capabilities: Readonly<CalibrationOutcomeCapabilities>) => Promise<T>) => Promise<T>;
  getPlannedOutcomes: () => readonly CalibrationPlannedReportOutcome[];
  getObservations: () => readonly CalibrationRuntimeObservation[];
}
export class CalibrationRuntimeProviderError extends Error {
  readonly code = 'provider_request_failed';
  constructor() {
    super('calibration:runtime-provider-failed');
    this.name = 'CalibrationRuntimeProviderError';
  }
}
export function prepareCalibrationRuntimeCapabilities(
  deps: unknown,
): Readonly<CalibrationRuntimeCapabilities>;
```

The optional selectedProfile is only a captured key-planning input, never a selection authority. Absent profile produces the existing50-outcome prefix; LOW/MEDIUM each produces158 outcomes including146 vision keys and twelve selected-profile barcode keys. Reject present undefined, unknown profile and caller plan/key-list overrides. Future real controller must get selection from the authoritative ledger.

## Exact behavior

### Capture, planning and immutable diagnostics

Dependencies are an exact enumerable-own-data plain/null-prototype record with six required fields and optional selectedProfile. Capture function references once without binding through caller property gets. Capture the exact seven files as owned immutable strings, then call the existing planner on that same owned record. Reparse the now-validated manifest strings only to retain each canonical case's image media type and supplied barcode; never take those from a caller key/request. Do not retain raw manifests/URLs/truth/predictions in observations. No dependency executes during preparation; the planner hashes/parses already supplied data only.

Key capture accepts only four enumerable own data fields stage/profile/caseId/sampleIndex, validates types without coercion and then exact canonical membership. Owned key copies accompany port calls and observations. Reject accessors, symbols, non-enumerable/extraneous fields, inherited records, nonplain prototypes and reflection traps; replace exceptions with fresh static causeless fatal errors without probing foreign message/prototype/cause. Do not freeze caller records.

Keep a private used-key set, current lease identity, in-flight-operation flag, current-phase guard, poison flag/static poison code and private observation list. Each valid outcome key is consumed once when its lease starts, including ordinary failure. Each image/vision/snapshot operation is allowed at most once within the lease. Image and vision are meal/label only; snapshot lookup is supplied-barcode only. Missing/undefined snapshot product on a canonical barcode key is `calibration:runtime-callback-failed`, not an undefined return or a live lookup fallback. Image load is not required on every vision key: a future controller may reuse already loaded verified bytes across samples. This primitive does not claim image-byte checksum or request-prompt authority. Observation completed means a method/lease returned normally, never parsed success, journal/ledger completion or durable evidence.

Freeze defensive copies of returned plans/observations; neither read API may run during an active lease/dependency callback. Reads remain available after a settled poisoned lease for diagnostics and never authorize more effects. Diagnostic strings are only canonical key fields, operation/status literals; sequence is1-based and at most4096. Fixed canonical keys and at-most-once operations bound the normal trace; refuse overflow before the next effect.

### Serial leases, errors and cancellation

All operation entry checks happen before wrapped capability invocation (async methods may return a rejection rather than synchronously throw). Wrong key/modality, duplicate, overlap, reentry, invalid request, stale callback and reservation/metadata contract violations permanently poison the primitive. Recheck poison/lease ownership after every await and after every injected callback, even when a nested error was swallowed.

Outcome body results are opaque and not retained/scored: an ordinary parse-failure result is not converted into a fatal. A foreign generator rejection, with no internal poison, becomes a freshly constructed `CalibrationRuntimeProviderError`, recorded as vision failure; an escaping module-created provider error may end that key without poisoning later keys. Use private WeakSet identity for module-created errors, not instanceof/prototype/message tests against foreign exceptions. Rebuild a fresh static error at every escaping boundary even for recognized local errors: a body could mutate a previously received local error. Never re-expose that error instance, inspect its properties or retain it as diagnostic state. Poison stores a private static code, not an exception object. Unknown body/loader/snapshot exceptions and reserve/version-callback failures are static fatals, since these trusted orchestration inputs cannot be interpreted safely as scored provider failures here.

On body completion, check there is no in-flight operation. Premature body return is `calibration:runtime-callback-failed`, invalidates the lease and prevents later SDK dispatch after a pending reservation resolves. Attach an internal rejection observer to every owned async operation while returning the same rejecting promise to its caller, preventing detached unhandled rejections without hiding awaited failures. There is no cancellation of a request already dispatched and no fabricated success or retry. A fatal stops all future scheduling. No crash/restart state is implemented.

Static fatal messages: `calibration:runtime-input-invalid`, `calibration:runtime-key-invalid`, `calibration:runtime-forbidden-operation`, `calibration:runtime-reentrant-operation`, `calibration:runtime-lease-expired`, `calibration:runtime-duplicate-key`, `calibration:runtime-duplicate-operation`, `calibration:runtime-reservation-failed`, `calibration:runtime-dispatch-contract-invalid`, `calibration:runtime-metadata-invalid`, `calibration:runtime-callback-failed`, `calibration:runtime-trace-limit`, `calibration:runtime-poisoned`. Prefer original local static failure for the failing call; later scheduling throws a fresh runtime-poisoned error. Poison is independently stored, not inferred from an exception a dependency can swallow.

### Final-hook vision dispatch

Within a valid meal/label lease, capture the two-field vision request before calling the captured generator. Pass exact model3.8, canonical scanMode, captured profile, pinned manifest media type, calibration mode, timeout30000, and owned callbacks. No early adapter reservation or user hook is accepted.

`beforeRequest` is single-use and lease-bound. Record reservation attempted, invoke captured reserveImage exactly once, recheck lease/poison after await, then record reservation completed. Failure is fatal and there must be zero SDK invocations with the native adapter. Generator success requires exactly one completed hook and exactly one valid modelVersion metadata callback. Only after reservation completes, capture metadata as exactly one own enumerable data field modelVersion, validate the nonblank version using the existing protocol pattern `[A-Za-z0-9_./-]{1,128}`, call captured onModelVersion with the owned key, then check poison. It does not itself pin/compare versions. Missing/repeated/stale/early metadata or a returned blank text is a contract fatal. A generator rejection following reservation is not miscounted as response completion.

Illustrative final-hook transition (locals belong to one private lease, not public inputs):

```ts
let beforeRequestStarted = false;
let beforeRequestCompleted = false;
const beforeRequest = async (): Promise<void> => {
  assertLiveLease();
  if (beforeRequestStarted) fail('calibration:runtime-duplicate-operation');
  beforeRequestStarted = true;
  observe('reservation', 'attempted');
  try { await reserveImage(ownedKey); }
  catch { fail('calibration:runtime-reservation-failed'); }
  assertLiveLease();
  beforeRequestCompleted = true;
  observe('reservation', 'completed');
};
// assertLiveLease checks private active identity and poison, fail records
// permanent poison and throws a fresh CalibrationFatalError, observe appends
// a bounded owned key/literal-only diagnostic. These private functions have
// the exact policies above; no callback supplies their decisions.
```

SDK/transport parity is test-only: a fake SDK's generateContent can simulate two lower transport calls. An independently counted witness must reject that mismatch; runtime observations alone cannot prevent/authenticate an arbitrary trusted generator/client's internal effects.

## Task 1: Build and verify the unused mediated capability primitive

**Consumes:** existing pure `deriveCanonicalReportOutcomePlan(files, selectedProfile?)`, real `createGenAIAdapter({project,location,googleGenAI})`, production snapshot preparation, closed pinned assets and types named above. **Produces:** the factory and interfaces in Shared interfaces, without changing any current consumer.

- [x] **Step 1: Author the new harness and RED tests through the editing route.** The harness reads only committed input assets using portable URL paths, constructs prompt/schema strings exactly as existing canonical-key tests do, prepares all four real OFF products through `prepareCalibrationOffSnapshotStore`, and injects the native adapter with a fake GenAIClient. Its factory deps are ordinary mutable test-owned records; keep sentinel strings out of diagnostics. No downloaded images, fabricated snapshot products, real SDK construction, global fetch, subprocess or cloud call.

Concrete harness construction (all symbols are existing imports or defined here; tests call the planned factory separately):

```ts
import { readFileSync } from 'node:fs';
import { createGenAIAdapter, type GenAIClient } from '../../src/genai-adapter';
import { visionResponseJsonSchema } from '../../src/nutrition-json-schema';
import { MEAL_ANALYSIS_PROMPT, LABEL_ANALYSIS_PROMPT, BARCODE_ANALYSIS_PROMPT } from '../../src/prompts';
import { deriveCanonicalReportOutcomePlan } from '../../src/nutrition-eval/calibration-bootstrap';
import { prepareCalibrationOffSnapshotStore } from '../../src/nutrition-eval/calibration-off-snapshot-store';
import type { CalibrationPreflightFileName } from '../../src/nutrition-eval/calibration-cli';
import type { CalibrationProfile } from '../../src/nutrition-eval/calibration';
const asset = (name: string): string => readFileSync(new URL(`../../eval/nutrition/${name}`, import.meta.url), 'utf8');
export async function buildRuntimeHarness(selectedProfile?: CalibrationProfile) {
  const files: Record<CalibrationPreflightFileName, string> = {
    'public-manifest': asset('public-manifest.json'),
    prompt: JSON.stringify([MEAL_ANALYSIS_PROMPT, LABEL_ANALYSIS_PROMPT, BARCODE_ANALYSIS_PROMPT]),
    'response-schema': JSON.stringify(['meal','label','barcode'].map((s) => visionResponseJsonSchema(s as 'meal'|'label'|'barcode'))),
    'source-lock': asset('calibration-source-lock.json'),
    'calibration-manifest': asset('calibration-manifest.json'),
    'off-lock': asset('off-snapshot-lock.json'),
    'historical-reference': asset('historical-reference-v1.json'),
  };
  const store = await prepareCalibrationOffSnapshotStore({
    lockText: files['off-lock'],
    readSnapshot: async (path: string) => asset(path.slice('functions/eval/nutrition/'.length)),
  });
  const calls: string[] = [];
  const witness = { sdk: 0, transport: 0 };
  const client: GenAIClient = { models: { generateContent: async () => {
    calls.push('sdk'); witness.sdk++; witness.transport++;
    return { text: '{"fixture":true}', modelVersion: 'fixture-model-v1' };
  } } };
  const adapter = createGenAIAdapter({ project: 'calorix-xurschnell', location: 'us', googleGenAI: client });
  const deps = {
    files, ...(selectedProfile === undefined ? {} : { selectedProfile }),
    loadImage: async () => { calls.push('image'); return new Uint8Array([1,2,3]); },
    generateVision: adapter.generateVision,
    reserveImage: async () => { calls.push('reserve'); },
    onModelVersion: () => { calls.push('metadata'); },
    lookupSnapshot: (barcode: string) => { calls.push('snapshot'); return store.get(barcode); },
  };
  return { deps, calls, witness, client, store, plan: deriveCanonicalReportOutcomePlan(files, selectedProfile) };
}
```

New test suite imports `buildRuntimeHarness` and the factory dynamically (missing module is the intended initial RED, never add a stub to fake GREEN). The separate fixture-controls test file proves planner50/158/146+12 arithmetic and four parsed products without importing the new factory; run it independently first. A literal dynamic import in the behavioral test may still be resolved during Vite transformation, so filtering that same file is not an independent control. The behavioral test imports `it`/`expect` from `vitest` and `buildRuntimeHarness` from `./calibration-runtime-capabilities-fixtures`. Then these constructible examples plus the full behavior matrix below:

```ts
it('reserves once at final SDK hook and records completion', async () => {
  const h = await buildRuntimeHarness('LOW');
  const { prepareCalibrationRuntimeCapabilities } = await import('../../src/nutrition-eval/calibration-runtime-capabilities');
  const runtime = prepareCalibrationRuntimeCapabilities(h.deps);
  const key = h.plan.find((r) => r.key.stage === 'development' && r.key.profile === 'LOW' && r.scanMode !== 'barcode')!.key;
  const text = await runtime.runOutcome(key, async (caps) => {
    await caps.loadImage();
    return caps.generateVision({ prompt: 'fixture prompt', imageBase64: 'AQID' });
  });
  expect(text).toBe('{"fixture":true}');
  expect(h.calls).toEqual(['image','reserve','sdk','metadata']);
  expect(h.witness).toEqual({ sdk: 1, transport: 1 });
  expect(runtime.getObservations().filter((r) => r.operation === 'reservation' && r.status === 'completed')).toHaveLength(1);
});
it('rejects a barcode image attempt before the loader', async () => {
  const h = await buildRuntimeHarness('LOW');
  const { prepareCalibrationRuntimeCapabilities } = await import('../../src/nutrition-eval/calibration-runtime-capabilities');
  const runtime = prepareCalibrationRuntimeCapabilities(h.deps);
  const key = h.plan.find((r) => r.key.stage === 'benchmark' && r.scanMode === 'barcode')!.key;
  await expect(runtime.runOutcome(key, async (caps) => caps.loadImage())).rejects.toThrow('calibration:runtime-forbidden-operation');
  expect(h.calls).toEqual([]);
});
it('does not invoke dependency accessors', async () => {
  const h = await buildRuntimeHarness();
  const { prepareCalibrationRuntimeCapabilities } = await import('../../src/nutrition-eval/calibration-runtime-capabilities');
  let gets = 0;
  Object.defineProperty(h.deps, 'loadImage', { enumerable: true, get() { gets++; throw new Error('PRIVATE-SENTINEL'); } });
  expect(() => prepareCalibrationRuntimeCapabilities(h.deps)).toThrow('calibration:runtime-input-invalid');
  expect(gets).toBe(0); expect(h.calls).toEqual([]);
});
```

The separate fixture-controls test is executable without the new module:

```ts
import { it, expect } from 'vitest';
import { buildRuntimeHarness } from './calibration-runtime-capabilities-fixtures';
it('fixture control: native committed plan and products', async () => {
  for (const profile of [undefined, 'LOW', 'MEDIUM'] as const) {
    const h = await buildRuntimeHarness(profile);
    expect(h.store.size).toBe(4);
    expect(h.plan).toHaveLength(profile === undefined ? 50 : 158);
    expect(h.plan.filter((r) => r.scanMode === 'barcode')).toHaveLength(profile === undefined ? 0 : 12);
    expect(h.plan.filter((r) => r.scanMode !== 'barcode')).toHaveLength(profile === undefined ? 50 : 146);
    expect(h.calls).toEqual([]); expect(h.witness.sdk).toBe(0);
  }
});
```

Concrete Review Focus tests (same behavioral-suite imports/harness; `CalibrationFatalError` is imported from existing `fatal-error`):

```ts
function deferredVoid() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
function assertTransportParity(observations: readonly {operation: string; status: string}[], actual: number) {
  const expected = observations.filter((r) => r.operation === 'reservation' && r.status === 'completed').length;
  if (actual !== expected) throw new Error('test-transport-reservation-mismatch');
}
it('blocks SDK after body returns with pending reservation', async () => {
  const h = await buildRuntimeHarness('LOW'); const waiting = deferredVoid();
  h.deps.reserveImage = () => waiting.promise;
  const { prepareCalibrationRuntimeCapabilities } = await import('../../src/nutrition-eval/calibration-runtime-capabilities');
  const runtime = prepareCalibrationRuntimeCapabilities(h.deps);
  let operation!: Promise<string>;
  await expect(runtime.runOutcome(h.plan[0]!.key, async (caps) => {
    operation = caps.generateVision({prompt:'fixture', imageBase64:'AQID'});
    return 'premature';
  })).rejects.toThrow('calibration:runtime-callback-failed');
  waiting.resolve();
  await expect(operation).rejects.toBeInstanceOf(CalibrationFatalError);
  expect(h.witness.sdk).toBe(0);
});
it('poison survives a swallowed nested outcome rejection', async () => {
  const h = await buildRuntimeHarness('LOW');
  const { prepareCalibrationRuntimeCapabilities } = await import('../../src/nutrition-eval/calibration-runtime-capabilities');
  const runtime = prepareCalibrationRuntimeCapabilities(h.deps);
  // Capture the replacement port in a new runtime, not mutate after capture.
  h.deps.reserveImage = async () => {
    await runtime2.runOutcome(h.plan[1]!.key, async () => undefined).catch(() => undefined);
  };
  const runtime2 = prepareCalibrationRuntimeCapabilities(h.deps);
  await expect(runtime2.runOutcome(h.plan[0]!.key, async (caps) =>
    caps.generateVision({prompt:'fixture', imageBase64:'AQID'}))).rejects.toBeInstanceOf(CalibrationFatalError);
  expect(h.witness.sdk).toBe(0);
  expect(runtime.getObservations()).toEqual([]);
});
it('does not accept generator return without final hook', async () => {
  const h = await buildRuntimeHarness('LOW');
  h.deps.generateVision = async () => 'fixture text';
  const { prepareCalibrationRuntimeCapabilities } = await import('../../src/nutrition-eval/calibration-runtime-capabilities');
  const runtime = prepareCalibrationRuntimeCapabilities(h.deps);
  await expect(runtime.runOutcome(h.plan[0]!.key, async (caps) =>
    caps.generateVision({prompt:'fixture', imageBase64:'AQID'}))).rejects.toThrow('calibration:runtime-dispatch-contract-invalid');
  expect(h.calls).toEqual([]); expect(h.witness.sdk).toBe(0);
});
it('captures caller aliases and returns immutable observations', async () => {
  const h = await buildRuntimeHarness('LOW');
  const { prepareCalibrationRuntimeCapabilities } = await import('../../src/nutrition-eval/calibration-runtime-capabilities');
  const runtime = prepareCalibrationRuntimeCapabilities(h.deps);
  h.deps.reserveImage = async () => { throw new Error('PRIVATE-SENTINEL'); };
  h.deps.files.prompt = 'mutated caller input';
  const key = {...h.plan[0]!.key}; const originalId = key.caseId;
  const result = runtime.runOutcome(key, async (caps) =>
    caps.generateVision({prompt:'fixture', imageBase64:'AQID'}));
  key.caseId = 'mutated_key'; await result;
  const observations = runtime.getObservations();
  expect(observations.every((r) => r.key.caseId === originalId)).toBe(true);
  expect(Reflect.set(observations[0]!.key, 'caseId', 'attempted_mutation')).toBe(false);
  expect(Object.isFrozen(key)).toBe(false);
  expect(h.calls).toEqual(['reserve','sdk','metadata']);
});
it('test witness detects opaque lower transport duplication', async () => {
  const h = await buildRuntimeHarness('LOW');
  h.client.models.generateContent = async () => {
    h.witness.sdk++; h.witness.transport += 2;
    return {text:'fixture text', modelVersion:'fixture-model-v1'};
  };
  const { prepareCalibrationRuntimeCapabilities } = await import('../../src/nutrition-eval/calibration-runtime-capabilities');
  const runtime = prepareCalibrationRuntimeCapabilities(h.deps);
  await runtime.runOutcome(h.plan[0]!.key, async (caps) =>
    caps.generateVision({prompt:'fixture', imageBase64:'AQID'}));
  expect(h.witness.sdk).toBe(1); expect(h.witness.transport).toBe(2);
  expect(() => assertTransportParity(runtime.getObservations(), h.witness.transport))
    .toThrow('test-transport-reservation-mismatch');
});
```

Pin all cases with actual test bodies, not just a matrix assertion or counts: all twelve barcode keys (fresh runtimes for separate negative attempts) reject image/vision and allow one snapshot lookup; all canonical meal/label keys allow native adapter generation once; selected/unselected/malformed keys and mutated files; deps/file/key/request/metadata descriptor faults including throwing reflection traps and present undefined; function-reference mutation after preparation; returned observation mutation; duplicate key/operation; overlapping outcomes and operations; nested/read reentry swallowed by load/reserve/generator/version ports; retained caps and late hooks/metadata; no-await load/generation with deliberately deferred ports/reservation; missing/double hook, metadata missing/double/bad/early version; reservation failure0SDK, provider failure1SDK/0vision-completed, next-key ordinary failure continuation, opaque parse-failure body result; forbidden capability injection fields/readCache/writeCache/fetchLiveOff/readSnapshot absent; all static errors fresh/causeless/no sentinel including body-mutated locally received errors; opaque lower-transport double-call mismatch vs positive parity. Guard global fetch and real SDK construction; install throwing native-reader/exec spies only AFTER fixture reads/derivation AND runtime-module import so loader/fixture setup is not confused with runtime effects.

- [x] **Step 2: Witness RED and freeze the new tests/harness.** From functions, under verified disk TMPDIR/npm cache and `NODE_OPTIONS=--max-old-space-size=1024`: `npx vitest run test/nutrition-eval/calibration-runtime-capabilities-fixture-controls.test.ts --maxWorkers=1 --minWorkers=1` must pass the independent native fixture control. Then run `npx vitest run test/nutrition-eval/calibration-runtime-capabilities.test.ts --maxWorkers=1 --minWorkers=1`, capture actual exit1 and missing-factory/feature failures before source editing. Record new test/harness SHA256, exact logs/exit and protected old source/test hashes. Do not count an invalid fixture or unrelated timeout as useful RED. New controls/tests must remain immutable during source GREEN unless a witnessed test defect is corrected, reviewed and recorded explicitly.

- [ ] **Step 3: Implement source only through the editing route.** Export Shared interfaces and factory; use the closed capture, canonical planner, private state/WeakSet, lease-bound operation wrappers and final-hook transition above. Do not create a writer, ledger, client, snapshot reader or controller. The worker must implement complete functional bodies, not placeholders. Before each effect check live lease, modality, at-most-once use, poison and diagnostic capacity; increment operation-in-flight before calling a port and clear it in finally. Every owned operation promises a safely observed rejection while the awaited caller still receives the failure. Recheck after await/callback and invalidate callback lease identity on settlement. Capture the generator request before effects, construct fixed generation options and handle foreign errors with static local errors. Return only frozen method objects and defensive diagnostic copies.

- [ ] **Step 4: Run GREEN and broader verification.** Run `npx vitest run test/nutrition-eval/calibration-runtime-capabilities.test.ts test/nutrition-eval/calibration-runtime-capabilities-fixture-controls.test.ts test/genai-adapter.test.ts test/nutrition-eval/calibration-canonical-keys.test.ts test/nutrition-eval/calibration-off-snapshot-store.test.ts test/nutrition-eval/live-adapter.test.ts --maxWorkers=1 --minWorkers=1`. Expected: all pass, zero global network/real-client/runtime-reader calls and protected existing assertions unchanged. Then `npm run build`, `npm run lint`, `npx vitest run test/nutrition-eval --maxWorkers=1 --minWorkers=1`, and `npx vitest run --maxWorkers=1 --minWorkers=1`. Collect each actual command exit and JSON counts; expected0 with no new skipped tests. Preserve the one pre-existing public-manifest opt-in skip. Verify old application/tests byte-identical relative to task BASE and user config SHA unchanged; scoped whitespace/credential/private-artifact scans. No full `test:verify`/Firebase emulator, Flutter/APK/device/UI or live gate in this unused slice (intentional scope, not passed); full parent gates remain open.

- [ ] **Step 5: Review and normal source checkpoint.** Antigravity MCP pre-plan green required before source work and exact code/result green after. Use primary3.8, fallback3.7 then3.6 only after exact ISO/category/error recording; yolo/scoped conversation/read-only prompt and status inspection. After all work, one fresh strongest native read-only whole-plan reviewer under the preserved inline workflow, not a per-task reviewer or editing child. Fix Important/Critical findings test-first, collect all rulings/minors. Stage only the four new application/test paths and this task's tracking docs. Normal host commit `Add mediated calibration runtime capabilities`; push origin branch and prove live remote equality; never bypass hooks or let workers commit.

- [ ] **Step 6: Postcommit verification and handoff.** Run the complete serial Functions suite using executing-plans task-done and this task's BASE before completion. Expected0, old/new source/test fingerprints unchanged from reviewed source. Update plan/status with actual counts, review/fallback scope, commit/push status and next task; normal tracking commit/push. Only then recoverably clean this plan's exact owned workspace after all owned jobs end. Keep branch/checkout/user config. Report this unused mediation boundary only; durable/runtime authority, historical/benchmark integration, default full146 controller and parentTask7/live/production/accuracy remain open.

## Verification/workspace setup

At execution, verify/choose the existing approved feature checkout with using-git-worktrees; do not silently move work or reset user state. Run the provided `sdd-workspace` and `task-start` for THIS plan, not the completed prerequisite. Confirm disk backing with `df -T`, then create only this plan's tmp/cache/log directories, set TMPDIR/npm cache, use serial workers and store logs there. Never use a common HOME variable for task storage. Verification commands run from `functions/` and collect actual exits; long jobs are backgrounded with bounded waits/updates, not duplicated.

This plan has one application deliverable. No shared interfaces between independent tasks; all four new files share the exact contract above. Protected old files are the existing tracked `functions/src`, `functions/test` and committed eval assets at task BASE; stage only the explicit allowlist, not `git add -A`.

## Planning receipts and current task

- Authoritative current task (2026-10-14T10:46Z): accepted153behavior RED = original138pass15newfail, host89633 actualexit1/JSONaudit0/types0/lint0/controls6pass0. Original3485prefixef8 unchanged; corrected4694line behavior35bc830fd7f7c43091cf7822d93fe9b273bba05dcc8a79ce741e98f797534972 refrozen with original helpers/control. FULL1196append and exact13-line quality correction reviewed by host; sameMCP actualtestquality primary3.8 agree/MUSTnone/SOURCE_STATUSdisagree. Three impossible nestedImage assertions corrected before freezing; pending GEN classification assertions strengthened, no old138 changes. Source5af9 still unchanged/untracked. Next SOURCE-only final Important repair, expectedfocused392 then actual source-result review/fullverification/source checkpoint/postcommit; ONE native review alreadyused, no second review. Both Important/native exclusions/deferred Minor remain as below until independently proven fixed.

- Authoritative current task (2026-10-14): final native review completed FULL1101source/3485behavior/helper/control/spec/plan/context, Critical0 Important2 Minor1. Successful reflection traps can reenter key/request/metadata before phase claim, including loader+SDK overlap/versionport twice. Generation-owned callbacks remain live after generator rejection while outcome active; pending hook must prevent ordinary Provider/body-success classification. Both Important accepted in ONE test-first fix pass, no second native review. Append15 independent valid-proxy/lifetime cases on unchanged5af9; old138/pinned helpers/old110/config9c untouched. MCP `calorix-runtime-final-review-fixes-20261014` primary3.8 initial and pending-hook/postcapture refinement explicitly PLAN_AGREEMENT_STATUS agree/AGREEMENT_STATUS agree/MUST_FIX none/SHOULD none/QUESTIONS none, SOURCE_STATUS disagree. Source-only fix follows witnessed RED/refreeze, then focused/types/build/lint/nutrition/full and actual-code MCP green/source checkpoint/postcommit task-done. Earlier source snapshot green is not approval of these defects. Test headers missing-source wording is deferred Minor; all12 review exclusions explicitly ruled with costs in owned ledger. Fresh day routes: Grok4.6 unknown_model10:24:55Z, Qwen3.7-max403 freequota10:25:15Z recorded exactly in status; strongest registered free editor next. Nutrition repeat5380 actualexit0/2592pass+1existing skip; full saved2987+1skip success true but expired10669 process exit unavailable; mandatory postcommit full actual exit remains. Parent Task7 Steps4–7 and all live/accuracy/default/durable/benchmark authority remain open. Historical Current Task entries below are superseded by this entry.

- Self-review: spec first-stage capture/lease/barcode/final-hook/error/privacy/preservation requirements map to Task1; durable/native evidence/historical authority/CLI/live follow-ons explicitly excluded, not missing implementations. Five Review Focus classes each have executable test examples. Placeholder scan has no matches. First dependency count corrected to six; missing-source fixture control separated; stale async and caller-mutated local errors have explicit safe policies. Snapshot undefined failure clarified after external suggestion; reader spies follow fixture preparation and runtime import. Virtual four-file TypeScript overlay checks the shared contract, harness/control/behavior examples against actual local pinned imports with strict compiler settings: zero type errors, zero files written, zero behavior tests executed. This validates example constructibility only, not the not-yet-implemented factory.
- Starting branch/HEAD: `fix/scan-photo-flow-viewer`, `88f00f6cd62a22098ffc1df0ec97df168ae73494`; only user `.mcp.json` dirty, SHA `9c9622f5dfd38f8eed1ac0d1b69034dc5399e77481600030148547235b06a688`.
- Antigravity MCP `gemini-3.8-flash`, conversation `calorix-runtime-capabilities-plan-20261013`: initial plan agrees/MUST_FIX none with three bounded suggestions; nonbarcode sample predicate and missing-product failure clarified, spy ordering already covered. Final supplied exact functional plan plus five executable focus examples received `AGREEMENT_STATUS: agree` / `MUST_FIX: none` / `SHOULD_FIX: none` / `QUESTIONS: none`. Two plan consultations, no failed routes/fallbacks or independent tests/repository inspection. This is plan-only agreement, not implementation/runtime/security/accuracy/production approval.
- User approved the written design on 2026-10-13. This self-reviewed/external-green plan still needs user review; no editing-worker/provider quota assumed available and no app edits made.
- Planning checkpoint `d85b0f7de1ce1531bef2399738eedc5a33c01b05` (`Plan mediated runtime capabilities`) normal four-doc commit/push/live-origin exact. Staged whitespace0, scoped credential-pattern scan no matches, application/test diff against88f0, protected config9c unchanged/onlydirty/unstaged. Final tracking receipt is documentation only; no extra source verifier or code authorization.
- Current Task: source draft/review7MUST first repairedSOURCE1083/7ad6, HOSTfocused371GREEN/build0/FULLlint0. Fullcode review identified detachedhookobserver/body-rejection-pending gaps andtwo diagnosticchecks; 6newindependent tests APPENDONLY nowrefrozen behavior3485/ef8adeba (original132prefixe233 unchanged), HOSTactualstrictREALtests0/lint0/controls6GREEN/138132pass6fail0skip plus2genuine ownedhookunhandled events/warnings onunchangedSOURCE. Testquality/fourfixPLAN same nativeMCP primary3.8 explicitagree/MUSTnone; SOURCE_STATUSdisagreependingnarrowrepair. Steps3–6/parentTask7 remainopen; nextSOURCE-onlyfourfixes thenexpectedfocused377/zeroownedwarnings, build/lint/nutrition/full/nativeactualMCP/onefreshnativefinal/sourcecheckpointpush/postcommit task-done. BASE3ce8099417a6e30b6519ad074e011efb872e71b3 branchfix/scan-photo-flow-viewer; no activation/durable/benchmark/live/prod/accuracyapproval.
