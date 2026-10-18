import { createHash } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CALIBRATION_ROOT } from '../../src/nutrition-eval/calibration';
import type { JournalEntry } from '../../src/nutrition-eval/calibration';
import type { CalibrationPreparedContext } from '../../src/nutrition-eval/calibration-bootstrap';
import { captureCalibrationReportJournalEntry } from '../../src/nutrition-eval/calibration-report-journal';
import type { CalibrationReportOutcomeKey } from '../../src/nutrition-eval/calibration-report-state';
import type { CalibrationOutcomeCapabilities } from '../../src/nutrition-eval/calibration-runtime-capabilities';
import type { RuntimeEvidenceEvent } from '../../src/nutrition-eval/calibration-runtime-evidence-codec';
import { StrictCalibrationManifestSchema } from '../../src/nutrition-eval/schema';
import type { NutritionPrediction } from '../../src/nutrition-eval/schema';
import { buildCoreSuccessJournal, CORE_PINNED_VERSION } from './calibration-runtime-evidence-fixtures';
import { makeProducerFixture } from './calibration-runtime-evidence-producer-fixtures';
import type { ProducerFixture } from './calibration-runtime-evidence-producer-fixtures';

const sdkGuard = vi.hoisted(() => ({ calls: 0 }));
const ioGuard = vi.hoisted(() => {
  const state = { enabled: false, calls: [] as string[] };
  function wrap<T extends object>(actual: T, label: string): T {
    return new Proxy(actual, {
      get(target, key, receiver) {
        const value: unknown = Reflect.get(target, key, receiver);
        if (typeof value !== 'function') return value;
        return new Proxy(value, {
          apply(fn, receiverValue, args) {
            if (state.enabled) {
              state.calls.push(`${label}:${String(key)}`);
              throw new Error('producer-test: preparation I/O forbidden');
            }
            return Reflect.apply(fn, receiverValue, args);
          },
        });
      },
    });
  }
  return { state, wrap };
});
vi.mock('node:fs', async (original) => ioGuard.wrap(await original<typeof import('node:fs')>(), 'fs'));
vi.mock('node:fs/promises', async (original) => ioGuard.wrap(await original<typeof import('node:fs/promises')>(), 'fs-promises'));
vi.mock('node:child_process', async (original) => ioGuard.wrap(await original<typeof import('node:child_process')>(), 'exec'));
vi.mock('@google/genai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/genai')>();
  return {
    ...actual,
    GoogleGenAI: class {
      constructor() {
        sdkGuard.calls++;
        throw new Error('producer-test: real SDK construction forbidden');
      }
    },
  };
});

const ownedRoots: string[] = [];
let fetchCalls = 0;
beforeEach(() => {
  sdkGuard.calls = 0;
  fetchCalls = 0;
  ioGuard.state.enabled = false;
  ioGuard.state.calls.length = 0;
  vi.stubGlobal('fetch', () => {
    fetchCalls++;
    throw new Error('producer-test: fetch forbidden');
  });
});
afterEach(() => {
  try {
    expect(sdkGuard.calls).toBe(0);
    expect(fetchCalls).toBe(0);
    expect(ioGuard.state.calls).toEqual([]);
  } finally {
    ioGuard.state.enabled = false;
    try {
      while (ownedRoots.length > 0) {
        const root = ownedRoots.pop();
        if (root !== undefined) rmSync(root, { recursive: true, force: true });
      }
    } finally {
      vi.unstubAllGlobals();
    }
  }
});

// Break caught: losing prefix/ownership or linking finish to a nutrient hash
// instead of the complete real journal must fail before producer tests exist.
it('foundation uses native prefix and codecs', async () => {
  const f = await makeProducerFixture(ownedRoots);
  contextSeed = structuredClone(f.native.context);
  expect(ownedRoots).toContain(f.native.gitRoot);
  expect(f.native.root).toBe(resolve(f.native.context.baseDir, CALIBRATION_ROOT));
  const before = f.disk();
  const beforeLedgerBytes = readFileSync(resolve(f.native.root, 'ledger.json'), 'utf8');
  const beforeSnapshot = f.native.ledger.getRuntimeEvidenceSnapshot();
  const owner = { ...f.native.owner };
  const key = {
    stage: 'preflight' as const, profile: 'LOW' as const,
    caseId: f.native.context.firstDevelopmentCaseId, sampleIndex: 1,
  };
  expect(f.native.key).toEqual(key);
  expect(beforeSnapshot.owner).toEqual(owner);
  expect(beforeSnapshot.activeAttempt).toBeNull();
  expect(f.native.ledger.getCounts()).toEqual({ tokenCountReserved: 1, imageReserved: 0 });
  expect(f.plan).toHaveLength(50);
  expect(f.raw.witness).toEqual({ sdk: 0, transport: 0 });
  const prediction = f.prediction(key);
  const manifest = StrictCalibrationManifestSchema.parse(JSON.parse(f.native.context.files['calibration-manifest']));
  const truth = manifest.cases.find((row) => row.id === key.caseId)?.truth;
  expect(truth).toBeDefined();
  expect(prediction).toMatchObject({
    parseStatus: 'success', sampleIndex: 1, source: 'meal',
    kcal: truth?.kcal, proteinG: truth?.proteinG, carbsG: truth?.carbsG, fatG: truth?.fatG,
  });
  const journal = captureCalibrationReportJournalEntry(buildCoreSuccessJournal(key, prediction));
  // Independently corrupt the full prediction, leaving the normalized vector
  // untouched: the real closed codec must reject their disagreement.
  expect(() => captureCalibrationReportJournalEntry({
    ...journal, reportPrediction: { ...prediction, kcal: (prediction.kcal as number) + 1 },
  })).toThrow('calibration:report-journal-invalid');
  expect(f.disk()).toEqual(before);
  expect(readFileSync(resolve(f.native.root, 'ledger.json'), 'utf8')).toBe(beforeLedgerBytes);

  const ref = f.native.ledger.startRuntimeAttempt(key);
  expect(ref).toEqual({ key, attempt: 1 });
  expect(f.native.ledger.getRuntimeEvidenceSnapshot().activeAttempt).toEqual(ref);
  f.native.ledger.startRuntimeOperation(ref, 'image');
  f.native.ledger.settleRuntimeOperation(ref, 'image', 'returned');
  f.native.ledger.startRuntimeOperation(ref, 'vision');
  f.native.ledger.reserve(key);
  f.native.ledger.authorizeRuntimeRequest(ref);
  f.native.ledger.pinModelVersion(CORE_PINNED_VERSION);
  f.native.ledger.settleRuntimeOperation(ref, 'vision', 'returned');
  f.publish(key, prediction);
  f.native.ledger.finishRuntimeAttempt(ref);

  const after = f.disk();
  expect(after.ledger.slice(0, before.ledger.length)).toEqual(before.ledger);
  expect(after.journal.slice(0, before.journal.length)).toEqual(before.journal);
  expect(after.lock).toBe(before.lock);
  const events = after.ledger.slice(before.ledger.length) as Array<Record<string, unknown>>;
  expect(events.map((row) => row['type'])).toEqual([
    'runtime_attempt_started',
    'runtime_operation_started',
    'runtime_operation_settled',
    'runtime_operation_started',
    'reserved',
    'runtime_request_authorized',
    'model_version_pinned',
    'runtime_operation_settled',
    'completed',
    'runtime_attempt_finished',
  ]);
  const runtime = events.filter((row) => String(row['type']).startsWith('runtime_')) as unknown as RuntimeEvidenceEvent[];
  expect(runtime).toHaveLength(7);
  for (const [index, row] of runtime.entries()) {
    expect(row).toMatchObject({
      version: 1, owner, ...ref, sequence: beforeSnapshot.sequence + index + 1,
    });
  }
  expect(events[1]).toMatchObject({ operation: 'image' });
  expect(events[2]).toMatchObject({ operation: 'image', result: 'returned' });
  expect(events[3]).toMatchObject({ operation: 'vision' });
  expect(events[4]).toMatchObject({ key });
  expect(events[5]).toMatchObject({ reservationEventIndex: before.ledger.length + 5 });
  expect(events[6]).toMatchObject({ responseModelVersion: CORE_PINNED_VERSION });
  expect(events[7]).toMatchObject({ operation: 'vision', result: 'returned' });
  expect(after.journal).toHaveLength(before.journal.length + 1);
  const persisted = after.journal[before.journal.length] as JournalEntry;
  expect(persisted).toEqual(journal);
  expect(persisted.reportPrediction).toEqual(prediction);
  const fullJournalHash = createHash('sha256').update(JSON.stringify(persisted)).digest('hex');
  expect(fullJournalHash).not.toBe(persisted.predictionHash);
  expect(events[8]).toMatchObject({ key, journalHash: fullJournalHash });
  expect(events[9]).toMatchObject({
    terminal: { kind: 'image', eventIndex: before.ledger.length + 9, journalHash: fullJournalHash },
  });
  const finalSnapshot = f.native.ledger.getRuntimeEvidenceSnapshot();
  expect(finalSnapshot.owner).toEqual(owner);
  expect(finalSnapshot.activeAttempt).toBeNull();
  expect(finalSnapshot.events.slice(beforeSnapshot.events.length)).toEqual(runtime);
  expect(f.native.ledger.getCounts()).toEqual({ tokenCountReserved: 1, imageReserved: 1 });
  // Manual native setup is NOT SDK dispatch evidence.
  expect(f.raw.witness).toEqual({ sdk: 0, transport: 0 });
  expect(f.raw.sdkCalls).toEqual([]);
});

// Exact proposed public contract, consuming real existing production key/cap
// types. No declaration shim or stub module is created for the initial RED.
type Producer = Readonly<{
  runOutcome: <T>(key: unknown,
    work: (caps: Readonly<CalibrationOutcomeCapabilities>) => Promise<T>,
    publish: (key: Readonly<CalibrationReportOutcomeKey>, result: T) => void | Promise<void>) => Promise<T>;
}>;
type ProducerFactory = (deps: unknown) => Promise<Producer>;
async function loadProducer(): Promise<ProducerFactory> {
  const specifier = '../../src/nutrition-eval/' + 'calibration-runtime-evidence-producer';
  const mod: unknown = await import(/* @vite-ignore */ specifier);
  const candidate = (mod as Record<string, unknown>)['prepareCalibrationRuntimeEvidenceProducer'];
  // Outside every rejection assertion: real missing module/export is RED,
  // never a permanently passing absence test.
  expect(typeof candidate).toBe('function');
  return candidate as ProducerFactory;
}

const ledgerMethods = [
  'getRuntimeEvidenceSnapshot', 'getStageReportSnapshot', 'getSelectedProfile',
  'startRuntimeAttempt', 'startRuntimeOperation', 'settleRuntimeOperation',
  'reserve', 'authorizeRuntimeRequest', 'pinModelVersion', 'finishRuntimeAttempt',
] as const;
let contextSeed: CalibrationPreparedContext | undefined;
function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}
async function pureCaptureDeps() {
  if (contextSeed === undefined) {
    const f = await makeProducerFixture(ownedRoots);
    // Only copied context DATA outlives this test's exact-root cleanup.
    // Future capture tests cannot read its now-removed native filesystem.
    contextSeed = structuredClone(f.native.context);
  }
  const calls: string[] = [];
  const context = structuredClone(contextSeed);
  const ledger: Record<string, unknown> = {};
  for (const method of [...ledgerMethods, 'getCounts', 'recordNonReservationResult']) {
    ledger[method] = () => { calls.push(method); throw new Error('unexpected preparation ledger effect'); };
  }
  const deps: Record<string, unknown> = {
    context, ledger,
    loadImage: async () => { calls.push('image'); throw new Error('unexpected preparation image'); },
    generateVision: async () => { calls.push('vision'); throw new Error('unexpected preparation vision'); },
    lookupSnapshot: () => { calls.push('snapshot'); throw new Error('unexpected preparation snapshot'); },
  };
  return { deps, calls, context, ledger };
}

it('preparation captures a complete structural ledger without invoking any method or port', async () => {
  const prepare = await loadProducer();
  const f = await pureCaptureDeps();
  ioGuard.state.enabled = true;
  try {
    await expect(prepare(f.deps)).resolves.toMatchObject({ runOutcome: expect.any(Function) });
  } finally {
    ioGuard.state.enabled = false;
  }
  expect(f.calls).toEqual([]);
  expect(Object.isFrozen(f.deps)).toBe(false);
  expect(Object.isFrozen(f.context)).toBe(false);
  expect(Object.isFrozen(f.context.identity)).toBe(false);
  expect(Object.isFrozen(f.context.owner)).toBe(false);
  expect(Object.isFrozen(f.context.files)).toBe(false);
  expect(Object.isFrozen(f.context.report.compatibilityNotes)).toBe(false);
});

it('preparation accepts null-prototype dependency data and legitimate extra native methods', async () => {
  const prepare = await loadProducer();
  const f = await pureCaptureDeps();
  await expect(prepare(Object.assign(Object.create(null) as object, f.deps))).resolves.toMatchObject({
    runOutcome: expect.any(Function),
  });
  expect(f.calls).toEqual([]);
});

type MalformedDeps = [string, (deps: Record<string, unknown>, calls: string[]) => unknown];
const malformedDeps: MalformedDeps[] = [
  ['null', () => null], ['array', () => []], ['undefined', () => undefined],
  ['unknown field', (deps) => ({ ...deps, expected: true })],
  ['inherited fields', (deps) => Object.create(deps) as unknown],
  ['symbol field', (deps) => ({ ...deps, [Symbol('extra')]: true })],
  ['nonenumerable field', (deps) => Object.defineProperty(deps, 'loadImage', { enumerable: false })],
  ['present undefined profile', (deps) => ({ ...deps, selectedProfile: undefined })],
  ['invalid profile', (deps) => ({ ...deps, selectedProfile: 'HIGH' })],
  ['accessor', (deps, calls) => Object.defineProperty(deps, 'loadImage', {
    get() { calls.push('getter'); throw new Error('accessor must not run'); }, enumerable: true,
  })],
  ['revoked proxy', (deps) => { const p = Proxy.revocable(deps, {}); p.revoke(); return p.proxy; }],
  ['throwing descriptor trap', (deps) => new Proxy(deps, {
    getOwnPropertyDescriptor() { throw new Error('foreign reflection failure'); },
  })],
];
for (const field of ['context', 'ledger', 'loadImage', 'generateVision', 'lookupSnapshot']) {
  malformedDeps.push([`missing ${field}`, (deps) => { delete deps[field]; return deps; }]);
}
for (const field of ['loadImage', 'generateVision', 'lookupSnapshot']) {
  malformedDeps.push([`nonfunction ${field}`, (deps) => ({ ...deps, [field]: 1 })]);
}
for (const [name, mutate] of malformedDeps) {
  it(`preparation rejects ${name} without invoking ports, ledger or getters`, async () => {
    const prepare = await loadProducer();
    const f = await pureCaptureDeps();
    await expect(prepare(mutate(f.deps, f.calls))).rejects.toThrow('calibration:runtime-evidence-producer-failed');
    expect(f.calls).toEqual([]);
  });
}

for (const method of ledgerMethods) {
  for (const defect of ['missing', 'nonfunction', 'accessor'] as const) {
    it(`preparation rejects ${defect} required ledger method ${method} before any call`, async () => {
      const prepare = await loadProducer();
      const f = await pureCaptureDeps();
      if (defect === 'missing') delete f.ledger[method];
      else if (defect === 'nonfunction') f.ledger[method] = 1;
      else Object.defineProperty(f.ledger, method, {
        get() { f.calls.push('getter'); throw new Error('method accessor must not run'); }, enumerable: true,
      });
      await expect(prepare(f.deps)).rejects.toThrow('calibration:runtime-evidence-producer-failed');
      expect(f.calls).toEqual([]);
    });
  }
}

type ContextMutation = [string, (context: Record<string, unknown>) => void];
const contextMutations: ContextMutation[] = [
  ['relative baseDir', (context) => { context['baseDir'] = 'relative'; }],
  ['NUL baseDir', (context) => { context['baseDir'] = '/bad\0path'; }],
  ['noncanonical baseDir', (context) => { context['baseDir'] = '/a/../b'; }],
  ['first development case', (context) => { context['firstDevelopmentCaseId'] = 'other-case'; }],
  ['unknown context field', (context) => { context['extra'] = true; }],
];
for (const field of ['baseDir', 'identity', 'owner', 'firstDevelopmentCaseId', 'report', 'files']) {
  contextMutations.push([`missing context ${field}`, (context) => { delete context[field]; }]);
}
const badIdentity: Record<string, unknown> = {
  protocolVersion: 'v2', provider: 'other-provider', model: 'old-model',
  implementationCommit: 'not-a-commit', functionsTreeId: 'not-a-tree',
  datasetHash: '0'.repeat(64), promptHash: '0'.repeat(64), responseSchemaHash: '0'.repeat(64),
  sourceLockHash: '0'.repeat(64), manifestHash: '0'.repeat(64), publicManifestHash: '0'.repeat(64),
  snapshotLockHash: '0'.repeat(64), historicalReferenceHash: '0'.repeat(64),
  plannedImageCalls: 145, hardCeiling: 301,
};
for (const [field, value] of Object.entries(badIdentity)) {
  contextMutations.push([`identity ${field}`, (context) => { record(context['identity'])[field] = value; }]);
}
for (const [field, value] of Object.entries({ hostname: '', bootId: '', pid: -1, startTicks: -1, acquiredAt: 'bad-date' })) {
  contextMutations.push([`owner syntax ${field}`, (context) => { record(context['owner'])[field] = value; }]);
}
for (const [field, value] of Object.entries({
  datasetId: 'wrong-dataset', publicManifestHash: '0'.repeat(64), promptHash: '0'.repeat(64),
  firstDevelopmentCaseId: 'other-case', compatibilityNotes: [], historicalCompatible: true,
})) {
  contextMutations.push([`report ${field}`, (context) => { record(context['report'])[field] = value; }]);
}
for (const file of ['public-manifest', 'prompt', 'response-schema', 'source-lock',
  'calibration-manifest', 'off-lock', 'historical-reference']) {
  contextMutations.push([`file ${file}`, (context) => { record(context['files'])[file] = '{}'; }]);
}
for (const [name, mutate] of contextMutations) {
  it(`preparation rejects mismatched ${name} with no native or raw effect`, async () => {
    const prepare = await loadProducer();
    const f = await pureCaptureDeps();
    mutate(record(f.context));
    await expect(prepare(f.deps)).rejects.toThrow('calibration:runtime-evidence-producer-failed');
    expect(f.calls).toEqual([]);
  });
}

function completeManualLow(f: ProducerFixture): void {
  const key = { ...f.native.key };
  const ref = f.native.ledger.startRuntimeAttempt(key);
  f.native.ledger.startRuntimeOperation(ref, 'image');
  f.native.ledger.settleRuntimeOperation(ref, 'image', 'returned');
  f.native.ledger.startRuntimeOperation(ref, 'vision');
  f.native.ledger.reserve(key);
  f.native.ledger.authorizeRuntimeRequest(ref);
  f.native.ledger.pinModelVersion(CORE_PINNED_VERSION);
  f.native.ledger.settleRuntimeOperation(ref, 'vision', 'returned');
  f.publish(key, f.prediction(key));
  f.native.ledger.finishRuntimeAttempt(ref);
}

// Break caught: dispatch before durable authorization, double reservation,
// missing metadata settlement, or finish without the complete native journal.
for (const profile of ['LOW', 'MEDIUM'] as const) {
  it(`finishes exactly one native ${profile} image outcome after adapter dispatch and publication`, async () => {
    const prepare = await loadProducer();
    const f = await makeProducerFixture(ownedRoots);
    if (profile === 'MEDIUM') completeManualLow(f);
    const key = { ...f.native.key, profile };
    const before = f.disk();
    const sdk = f.raw.client.models.generateContent;
    f.raw.client.models.generateContent = async (params) => {
      const atEntry = f.disk().ledger.slice(before.ledger.length) as Array<Record<string, unknown>>;
      expect(atEntry.map((row) => row['type'])).toEqual([
        'runtime_attempt_started', 'runtime_operation_started', 'runtime_operation_settled',
        'runtime_operation_started', 'reserved', 'runtime_request_authorized',
      ]);
      expect(atEntry[4]).toMatchObject({ key });
      expect(atEntry[5]).toMatchObject({ key, attempt: 1, owner: f.native.owner,
        reservationEventIndex: before.ledger.length + 5 });
      expect(f.raw.witness).toEqual({ sdk: 0, transport: 0 });
      return sdk(params);
    };
    const producer = await prepare(f.deps);
    expect(f.disk()).toEqual(before);
    expect(f.raw.witness).toEqual({ sdk: 0, transport: 0 });
    const result = f.prediction(key);
    const published: CalibrationReportOutcomeKey[] = [];
    await expect(producer.runOutcome(key, async (caps) => {
      const image = await caps.loadImage();
      await caps.generateVision({ prompt: 'hermetic fixture', imageBase64: Buffer.from(image).toString('base64') });
      return result;
    }, (ownedKey, prediction) => {
      published.push(ownedKey);
      const rows = f.disk().ledger as Array<Record<string, unknown>>;
      expect(rows.at(-1)).toMatchObject({ type: 'runtime_operation_settled', operation: 'vision', result: 'returned' });
      f.publish(ownedKey, prediction);
    })).resolves.toEqual(result);
    expect(published).toEqual([key]);
    expect(Object.isFrozen(published[0])).toBe(true);
    const after = f.disk();
    expect(after.ledger.slice(0, before.ledger.length)).toEqual(before.ledger);
    expect(after.journal.slice(0, before.journal.length)).toEqual(before.journal);
    expect(after.lock).toBe(before.lock);
    const rows = after.ledger.slice(before.ledger.length) as Array<Record<string, unknown>>;
    expect(rows.map((row) => row['type'])).toEqual([
      'runtime_attempt_started', 'runtime_operation_started', 'runtime_operation_settled',
      'runtime_operation_started', 'reserved', 'runtime_request_authorized',
      ...(profile === 'LOW' ? ['model_version_pinned'] : []),
      'runtime_operation_settled', 'completed', 'runtime_attempt_finished',
    ]);
    for (const row of rows.filter((row) => String(row['type']).startsWith('runtime_'))) {
      expect(row).toMatchObject({ key, attempt: 1, owner: f.native.owner });
    }
    expect(rows[1]).toMatchObject({ operation: 'image' });
    expect(rows[2]).toMatchObject({ operation: 'image', result: 'returned' });
    expect(rows[3]).toMatchObject({ operation: 'vision' });
    expect(rows.at(-3)).toMatchObject({ operation: 'vision', result: 'returned' });
    expect(after.journal).toHaveLength(before.journal.length + 1);
    const journal = after.journal.at(-1) as JournalEntry;
    expect(journal.reportPrediction).toEqual(result);
    expect(captureCalibrationReportJournalEntry(journal)).toEqual(journal);
    const hash = createHash('sha256').update(JSON.stringify(journal)).digest('hex');
    expect(rows.at(-2)).toMatchObject({ key, journalHash: hash });
    expect(rows.at(-1)).toMatchObject({ terminal: { kind: 'image', eventIndex: after.ledger.length - 1, journalHash: hash } });
    expect(f.raw.witness).toEqual({ sdk: 1, transport: 1 });
    expect(f.raw.sdkCalls).toHaveLength(1);
    expect(f.native.ledger.getRuntimeEvidenceSnapshot().activeAttempt).toBeNull();
  });
}

const badKeys: Array<[string, (key: CalibrationReportOutcomeKey) => unknown]> = [
  ['null', () => null], ['array', () => []],
  ['unknown field', (key) => ({ ...key, extra: 1 })],
  ['symbol field', (key) => ({ ...key, [Symbol('extra')]: 1 })],
  ['inherited', (key) => Object.create(key) as unknown],
  ['bad stage', (key) => ({ ...key, stage: 'other' })],
  ['bad profile', (key) => ({ ...key, profile: 'HIGH' })],
  ['unknown case', (key) => ({ ...key, caseId: 'not-a-planned-case' })],
  ['bad sample', (key) => ({ ...key, sampleIndex: 2 })],
  ['undefined field', (key) => ({ ...key, profile: undefined })],
];
for (const [name, mutate] of badKeys) {
  it(`rejects ${name} outcome key before opening a native attempt`, async () => {
    const prepare = await loadProducer();
    const f = await makeProducerFixture(ownedRoots);
    const producer = await prepare(f.deps);
    const before = f.disk();
    const work = vi.fn(async () => f.prediction(f.native.key));
    const publish = vi.fn(f.publish);
    await expect(producer.runOutcome(mutate(f.native.key), work, publish)).rejects.toThrow('calibration:runtime-evidence-producer-failed');
    expect(f.disk()).toEqual(before);
    expect(work).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
    expect(f.raw.witness).toEqual({ sdk: 0, transport: 0 });
  });
}

for (const missing of ['work', 'publisher'] as const) {
  it(`rejects missing ${missing} before opening a native attempt`, async () => {
    const prepare = await loadProducer();
    const f = await makeProducerFixture(ownedRoots);
    const producer = await prepare(f.deps);
    const before = f.disk();
    await expect(producer.runOutcome(f.native.key,
      missing === 'work' ? undefined as never : async () => f.prediction(f.native.key),
      missing === 'publisher' ? undefined as never : f.publish,
    )).rejects.toThrow('calibration:runtime-evidence-producer-failed');
    expect(f.disk()).toEqual(before);
    expect(f.raw.witness).toEqual({ sdk: 0, transport: 0 });
  });
}

it('captures mutable context, ports and bound ledger methods before the factory await, and key before run await', async () => {
  const prepare = await loadProducer();
  const f = await makeProducerFixture(ownedRoots);
  const context = structuredClone(f.native.context);
  const ledger = { ...f.native.ledger };
  const originalStart = f.native.ledger.startRuntimeAttempt;
  let boundReceiverMatched = false;
  ledger.startRuntimeAttempt = function (key) {
    boundReceiverMatched = this === ledger;
    return originalStart(key);
  };
  const deps = { ...f.deps, context, ledger };
  const before = f.disk();
  const preparing = prepare(deps);
  record(context.identity)['model'] = 'changed-after-capture';
  record(context.owner)['pid'] = -1;
  record(context.files)['prompt'] = 'changed-after-capture';
  record(context.report)['datasetId'] = 'changed-after-capture';
  const notes = context.report.compatibilityNotes;
  record(notes[0])['detail'] = 'changed-after-capture';
  ledger.startRuntimeAttempt = () => { throw new Error('replacement method must not run'); };
  deps.loadImage = async () => { throw new Error('replacement image port must not run'); };
  deps.generateVision = async () => { throw new Error('replacement vision port must not run'); };
  deps.lookupSnapshot = () => { throw new Error('replacement snapshot port must not run'); };
  const producer = await preparing;
  expect(f.disk()).toEqual(before);
  expect(Object.isFrozen(context)).toBe(false);
  expect(Object.isFrozen(context.identity)).toBe(false);
  expect(Object.isFrozen(context.owner)).toBe(false);
  expect(Object.isFrozen(context.report)).toBe(false);
  expect(Object.isFrozen(notes)).toBe(false);
  const key = { ...f.native.key };
  const result = f.prediction(key);
  const run = producer.runOutcome(key, async (caps) => {
    const image = await caps.loadImage();
    await caps.generateVision({ prompt: 'owned mutable inputs', imageBase64: Buffer.from(image).toString('base64') });
    return result;
  }, f.publish);
  key.caseId = 'changed-after-run-capture';
  key.profile = 'MEDIUM';
  await expect(run).resolves.toEqual(result);
  expect(boundReceiverMatched).toBe(true);
  const events = f.disk().ledger.slice(before.ledger.length) as Array<Record<string, unknown>>;
  expect(events[0]).toMatchObject({ type: 'runtime_attempt_started', key: f.native.key });
  expect(events.at(-1)).toMatchObject({ type: 'runtime_attempt_finished', key: f.native.key });
  expect(f.raw.witness).toEqual({ sdk: 1, transport: 1 });
});

// These supplied getter-result mutations test complete identity comparisons;
// they are not authentication of a hostile ledger or cloned filesystem root.
for (const field of Object.keys(badIdentity)) {
  it(`compares execution snapshot identity field ${field} before native mutation`, async () => {
    const prepare = await loadProducer();
    const f = await makeProducerFixture(ownedRoots);
    const original = f.native.ledger.getStageReportSnapshot;
    const ledger = {
      ...f.native.ledger,
      getStageReportSnapshot(...args: Parameters<typeof original>) {
        const snapshot = original(...args);
        const originalValue = record(snapshot.identity)[field];
        return { ...snapshot, identity: { ...snapshot.identity,
          [field]: typeof originalValue === 'number' ? originalValue + 1 : 'different-execution-identity' } };
      },
    };
    const producer = await prepare({ ...f.deps, ledger });
    const before = f.disk();
    const work = vi.fn(async () => f.prediction(f.native.key));
    const publish = vi.fn(f.publish);
    await expect(producer.runOutcome(f.native.key, work, publish)).rejects.toThrow('calibration:runtime-evidence-producer-failed');
    expect(f.disk()).toEqual(before);
    expect(work).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
    expect(f.raw.witness).toEqual({ sdk: 0, transport: 0 });
  });
}

for (const field of ['hostname', 'bootId', 'pid', 'startTicks', 'acquiredAt']) {
  it(`compares execution owner ${field} before opening an attempt`, async () => {
    const prepare = await loadProducer();
    const f = await makeProducerFixture(ownedRoots);
    const context = structuredClone(f.native.context);
    const owner = record(context.owner);
    const current = owner[field];
    owner[field] = typeof current === 'number' ? current + 1
      : field === 'acquiredAt' ? '2026-10-14T00:00:01.000Z' : 'other-owner';
    const producer = await prepare({ ...f.deps, context });
    const before = f.disk();
    await expect(producer.runOutcome(f.native.key, async () => f.prediction(f.native.key), f.publish))
      .rejects.toThrow('calibration:runtime-evidence-producer-failed');
    expect(f.disk()).toEqual(before);
    expect(f.raw.witness).toEqual({ sdk: 0, transport: 0 });
  });
}

it('requires the captured selected profile to match native state at execution', async () => {
  const prepare = await loadProducer();
  const f = await makeProducerFixture(ownedRoots);
  const producer = await prepare({ ...f.deps, selectedProfile: 'LOW' });
  const before = f.disk();
  await expect(producer.runOutcome(f.native.key, async () => f.prediction(f.native.key), f.publish))
    .rejects.toThrow('calibration:runtime-evidence-producer-failed');
  expect(f.disk()).toEqual(before);
  expect(f.raw.witness).toEqual({ sdk: 0, transport: 0 });
});

it('rejects a real unfinished native attempt without starting another', async () => {
  const prepare = await loadProducer();
  const f = await makeProducerFixture(ownedRoots);
  f.native.ledger.startRuntimeAttempt(f.native.key);
  const producer = await prepare(f.deps);
  const before = f.disk();
  await expect(producer.runOutcome(f.native.key, async () => f.prediction(f.native.key), f.publish))
    .rejects.toThrow('calibration:runtime-evidence-producer-failed');
  expect(f.disk()).toEqual(before);
  expect(f.raw.witness).toEqual({ sdk: 0, transport: 0 });
});

it('cannot retry a finished native key using a fresh producer', async () => {
  const prepare = await loadProducer();
  const f = await makeProducerFixture(ownedRoots);
  completeManualLow(f);
  const producer = await prepare(f.deps);
  const before = f.disk();
  await expect(producer.runOutcome(f.native.key, async () => f.prediction(f.native.key), f.publish))
    .rejects.toThrow('calibration:runtime-evidence-producer-failed');
  expect(f.disk()).toEqual(before);
  expect(f.raw.witness).toEqual({ sdk: 0, transport: 0 });
});

it('rejects an accessor key without invoking its getter or any native mutation', async () => {
  const prepare = await loadProducer();
  const f = await makeProducerFixture(ownedRoots);
  const producer = await prepare(f.deps);
  const before = f.disk();
  let getters = 0;
  const key = Object.defineProperty({ ...f.native.key }, 'caseId', {
    get() { getters++; throw new Error('key getter must not run'); }, enumerable: true,
  });
  await expect(producer.runOutcome(key, async () => f.prediction(f.native.key), f.publish))
    .rejects.toThrow('calibration:runtime-evidence-producer-failed');
  expect(getters).toBe(0);
  expect(f.disk()).toEqual(before);
  expect(f.raw.witness).toEqual({ sdk: 0, transport: 0 });
});

function datasetFailure(sampleIndex: number): NutritionPrediction {
  return {
    parseStatus: 'failure', source: 'meal', decision: 'error',
    failureCategory: 'dataset', failureCode: 'dataset_load_failed',
    latencyMs: 0, sampleIndex, cached: false,
  };
}

// Independent existing-native control: the general ledger genuinely supports
// this wider terminal, so relying on finish alone is not the bridge's policy.
it('foundation native ledger can finish an image-only dataset terminal', async () => {
  const f = await makeProducerFixture(ownedRoots);
  const key = { ...f.native.key };
  const before = f.disk();
  const ref = f.native.ledger.startRuntimeAttempt(key);
  f.native.ledger.startRuntimeOperation(ref, 'image');
  f.native.ledger.settleRuntimeOperation(ref, 'image', 'returned');
  const prediction = datasetFailure(key.sampleIndex);
  const digest = f.native.ledger.recordNonReservationResult({ key, reason: 'dataset', prediction });
  f.native.ledger.finishRuntimeAttempt(ref);
  const after = f.disk();
  expect(after.ledger.slice(0, before.ledger.length)).toEqual(before.ledger);
  expect(after.journal).toEqual(before.journal);
  expect(after.lock).toBe(before.lock);
  const rows = after.ledger.slice(before.ledger.length) as Array<Record<string, unknown>>;
  expect(rows.map((row) => row['type'])).toEqual([
    'runtime_attempt_started', 'runtime_operation_started', 'runtime_operation_settled',
    'non_reservation_result', 'runtime_attempt_finished',
  ]);
  expect(rows[3]).toMatchObject({ key, reason: 'dataset', prediction, contentDigest: digest });
  expect(rows[4]).toMatchObject({ key, attempt: 1, owner: f.native.owner,
    terminal: { kind: 'non_reservation', eventIndex: before.ledger.length + 4, contentDigest: digest } });
  expect(f.native.ledger.getRuntimeEvidenceSnapshot().activeAttempt).toBeNull();
  expect(f.native.ledger.getCounts()).toEqual({ tokenCountReserved: 1, imageReserved: 0 });
  expect(f.raw.witness).toEqual({ sdk: 0, transport: 0 });
});

// Break caught: a valid but out-of-slice dataset publisher must not turn
// early work (no authorized vision) into producer success or a durable finish.
it('rejects image-only work before a dataset non-reservation publisher can run', async () => {
  const prepare = await loadProducer();
  const f = await makeProducerFixture(ownedRoots);
  const producer = await prepare(f.deps);
  const before = f.disk();
  const result = datasetFailure(f.native.key.sampleIndex);
  const publish = vi.fn((key: Readonly<CalibrationReportOutcomeKey>, prediction: NutritionPrediction) => {
    f.native.ledger.recordNonReservationResult({ key, reason: 'dataset', prediction });
  });
  await expect(producer.runOutcome(f.native.key, async (caps) => {
    await caps.loadImage();
    return result;
  }, publish)).rejects.toThrow('calibration:runtime-evidence-producer-failed');
  expect(publish).not.toHaveBeenCalled();
  const after = f.disk();
  expect(after.ledger.slice(0, before.ledger.length)).toEqual(before.ledger);
  expect(after.journal).toEqual(before.journal);
  expect(after.lock).toBe(before.lock);
  expect((after.ledger.slice(before.ledger.length) as Array<{ type: string }>).map((row) => row.type)).toEqual([
    'runtime_attempt_started', 'runtime_operation_started', 'runtime_operation_settled',
  ]);
  expect(f.native.ledger.getRuntimeEvidenceSnapshot().activeAttempt).toEqual({ key: f.native.key, attempt: 1 });
  expect(f.raw.witness).toEqual({ sdk: 0, transport: 0 });
  await expect(producer.runOutcome({ ...f.native.key, profile: 'MEDIUM' }, async () => result, publish))
    .rejects.toThrow('calibration:runtime-evidence-producer-failed');
  expect(f.disk()).toEqual(after);
});
