import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CALIBRATION_ROOT } from '../../src/nutrition-eval/calibration';
import type { CalibrationOwner } from '../../src/nutrition-eval/calibration';
import type { CalibrationPreparedContext } from '../../src/nutrition-eval/calibration-bootstrap';
import type { CalibrationReportOutcomeKey } from '../../src/nutrition-eval/calibration-report-state';
import type { CalibrationOutcomeCapabilities } from '../../src/nutrition-eval/calibration-runtime-capabilities';
import { prepareCalibrationRuntimeEvidenceProducer } from '../../src/nutrition-eval/calibration-runtime-evidence-producer';
import { prepareNativeCalibrationRuntimeEvidenceLedger } from '../../src/nutrition-eval/calibration-runtime-evidence-ledger';
import { parseNutritionEvalManifest, StrictCalibrationManifestSchema } from '../../src/nutrition-eval/schema';
import type { NutritionPrediction } from '../../src/nutrition-eval/schema';
import { buildRuntimeHarness } from './calibration-runtime-capabilities-fixtures';
import { CORE_PINNED_VERSION, createCoreExactPrediction } from './calibration-runtime-evidence-fixtures';
import { buildProducerResultJournal, makeProducerFaultFixture } from './calibration-runtime-evidence-producer-fixtures';
import type { ProducerFaultBoundary } from './calibration-runtime-evidence-producer-fixtures';

const sdkGuard = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@google/genai', async (original) => ({
  ...await original<typeof import('@google/genai')>(),
  GoogleGenAI: class {
    constructor() { sdkGuard.calls++; throw new Error('native producer control forbids real SDK construction'); }
  },
}));
const ownedRoots: string[] = [];
let fetchCalls = 0;
beforeEach(() => {
  sdkGuard.calls = 0;
  fetchCalls = 0;
  vi.stubGlobal('fetch', () => { fetchCalls++; throw new Error('native producer control forbids network'); });
});
afterEach(() => {
  try {
    expect(sdkGuard.calls).toBe(0);
    expect(fetchCalls).toBe(0);
  } finally {
    try {
      while (ownedRoots.length > 0) {
        const root = ownedRoots.pop();
        if (root !== undefined) rmSync(root, { recursive: true, force: true });
      }
    } finally { vi.unstubAllGlobals(); }
  }
});

function disk(root: string) {
  const bytes = readFileSync(join(root, 'ledger.json'), 'utf8');
  const journalPath = join(root, 'journal.json');
  return {
    bytes,
    rows: JSON.parse(bytes) as Array<Record<string, unknown>>,
    journal: existsSync(journalPath) ? JSON.parse(readFileSync(journalPath, 'utf8')) as unknown[] : [],
    lock: readFileSync(join(root, 'lock.json'), 'utf8'),
  };
}
function firstKey(context: CalibrationPreparedContext): CalibrationReportOutcomeKey {
  return { stage: 'preflight', profile: 'LOW', caseId: context.firstDevelopmentCaseId, sampleIndex: 1 };
}
function prediction(context: CalibrationPreparedContext, key: CalibrationReportOutcomeKey) {
  const calibration = StrictCalibrationManifestSchema.parse(JSON.parse(context.files['calibration-manifest']));
  const benchmark = parseNutritionEvalManifest(JSON.parse(context.files['public-manifest']));
  const row = [...calibration.cases, ...benchmark.cases].find((item) => item.id === key.caseId);
  if (row === undefined) throw new Error('native producer fixture prediction missing');
  return createCoreExactPrediction(row, key.sampleIndex);
}

// Break caught: a fake high-level ledger or a disarmed syscall delegate that
// skips its real effect cannot supply this canonical native finish/journal.
it('syscall fixture independently completes a real native outcome with faults disarmed', async () => {
  const f = await makeProducerFaultFixture(ownedRoots);
  expect(f.root).toBe(resolve(f.context.baseDir, CALIBRATION_ROOT));
  const before = disk(f.root);
  expect(f.ledger.getCounts()).toEqual({ tokenCountReserved: 1, imageReserved: 0 });
  const key = firstKey(f.context);
  const ref = f.ledger.startRuntimeAttempt(key);
  f.ledger.startRuntimeOperation(ref, 'image');
  f.ledger.settleRuntimeOperation(ref, 'image', 'returned');
  f.ledger.startRuntimeOperation(ref, 'vision');
  f.ledger.reserve(key);
  f.ledger.authorizeRuntimeRequest(ref);
  f.ledger.pinModelVersion(CORE_PINNED_VERSION);
  f.ledger.settleRuntimeOperation(ref, 'vision', 'returned');
  const entry = buildProducerResultJournal(key, prediction(f.context, key), 'none', CORE_PINNED_VERSION);
  const hash = f.ledger.appendResultJournal(entry);
  f.ledger.complete(key, hash);
  f.ledger.finishRuntimeAttempt(ref);
  const after = disk(f.root);
  expect(after.rows.slice(0, before.rows.length)).toEqual(before.rows);
  expect(after.bytes.startsWith(before.bytes.slice(0, -1))).toBe(true);
  expect(after.lock).toBe(before.lock);
  expect(after.journal).toEqual([entry]);
  expect(hash).toBe(createHash('sha256').update(JSON.stringify(after.journal[0])).digest('hex'));
  const added = after.rows.slice(before.rows.length);
  expect(added.map((row) => row.type)).toEqual([
    'runtime_attempt_started', 'runtime_operation_started', 'runtime_operation_settled',
    'runtime_operation_started', 'reserved', 'runtime_request_authorized', 'model_version_pinned',
    'runtime_operation_settled', 'completed', 'runtime_attempt_finished',
  ]);
  expect(added.at(-1)).toMatchObject({ ...ref, owner: f.context.owner,
    terminal: { kind: 'image', eventIndex: before.rows.length + 9, journalHash: hash } });
  expect(f.ledger.getRuntimeEvidenceSnapshot().activeAttempt).toBeNull();
  expect(f.ledger.getCounts()).toEqual({ tokenCountReserved: 1, imageReserved: 1 });
  expect(f.faults.fired()).toBe(false);
  for (const op of ['write', 'file-fsync', 'close', 'rename', 'dir-fsync']) {
    expect(f.faults.trace).toContain(`finish/${op}:completed`);
  }
});

// Break caught: incorrect before/after injection or a seam which never reaches
// its real syscall must not be mistaken for a producer failure.
for (const operation of ['write', 'file-fsync', 'close', 'rename', 'dir-fsync'] as const) {
  for (const effect of ['before', 'after'] as const) {
    it(`syscall fixture independently reaches attempt/${operation}/${effect}`, async () => {
      const f = await makeProducerFaultFixture(ownedRoots);
      const before = disk(f.root);
      f.faults.arm({ boundary: 'attempt', operation, effect });
      expect(() => f.ledger.startRuntimeAttempt(firstKey(f.context))).toThrow();
      expect(f.faults.fired()).toBe(true);
      expect(f.faults.trace).toContain(`attempt/${operation}:entered`);
      expect(f.faults.trace.includes(`attempt/${operation}:completed`)).toBe(effect === 'after');
      const after = disk(f.root);
      expect(after.rows.slice(0, before.rows.length)).toEqual(before.rows);
      expect(after.lock).toBe(before.lock);
      expect(after.journal).toEqual(before.journal);
      const published = operation === 'dir-fsync' || (operation === 'rename' && effect === 'after');
      expect(after.rows.slice(before.rows.length).map((row) => row.type))
        .toEqual(published ? ['runtime_attempt_started'] : []);
      expect(() => f.ledger.getCounts()).toThrow();
    });
  }
}

type FaultFixture = Awaited<ReturnType<typeof makeProducerFaultFixture>>;
async function makeExecution(f: FaultFixture) {
  const raw = await buildRuntimeHarness();
  raw.client.models.generateContent = async (params) => {
    raw.witness.sdk++;
    raw.witness.transport++;
    raw.sdkCalls.push({ model: params.model, contents: params.contents, config: params.config });
    // This is the independent SDK seam, not a capability observation replay.
    expect(disk(f.root).rows.at(-1)).toMatchObject({ type: 'runtime_request_authorized' });
    return { text: '{"fixture":true}', modelVersion: CORE_PINNED_VERSION };
  };
  const key = firstKey(f.context);
  const value = prediction(f.context, key);
  const image = vi.fn(raw.deps.loadImage);
  const vision = vi.fn(raw.deps.generateVision);
  const publish = vi.fn((ownedKey: Readonly<CalibrationReportOutcomeKey>, result: NutritionPrediction) => {
    const journal = buildProducerResultJournal(ownedKey, result, 'none', CORE_PINNED_VERSION);
    const hash = f.ledger.appendResultJournal(journal);
    f.ledger.complete(ownedKey, hash);
  });
  const deps = { context: f.context, ledger: f.ledger,
    loadImage: image, generateVision: vision, lookupSnapshot: raw.deps.lookupSnapshot };
  const before = disk(f.root);
  const producer = await prepareCalibrationRuntimeEvidenceProducer(deps);
  expect(disk(f.root)).toEqual(before);
  const work = async (caps: Readonly<CalibrationOutcomeCapabilities>) => {
    const bytes = await caps.loadImage();
    await caps.generateVision({ prompt: 'hermetic native cut', imageBase64: Buffer.from(bytes).toString('base64') });
    return value;
  };
  return { raw, key, value, image, vision, publish, deps, producer, work };
}
type Execution = Awaited<ReturnType<typeof makeExecution>>;

async function expectPrivatePoison(f: FaultFixture, e: Execution) {
  const before = disk(f.root);
  const counts = { image: e.image.mock.calls.length, vision: e.vision.mock.calls.length,
    sdk: e.raw.witness.sdk, publish: e.publish.mock.calls.length };
  let reflections = 0;
  const next = new Proxy({ ...e.key, profile: 'MEDIUM' }, {
    getPrototypeOf(target) { reflections++; return Reflect.getPrototypeOf(target); },
    ownKeys(target) { reflections++; return Reflect.ownKeys(target); },
    getOwnPropertyDescriptor(target, key) { reflections++; return Reflect.getOwnPropertyDescriptor(target, key); },
  });
  const work = vi.fn(async () => e.value);
  await expect(e.producer.runOutcome(next, work, e.publish))
    .rejects.toThrow('calibration:runtime-evidence-producer-failed');
  expect(reflections).toBe(0);
  expect(work).not.toHaveBeenCalled();
  expect(disk(f.root)).toEqual(before);
  expect({ image: e.image.mock.calls.length, vision: e.vision.mock.calls.length,
    sdk: e.raw.witness.sdk, publish: e.publish.mock.calls.length }).toEqual(counts);
}

// Literal oracle: preceding canonical events and next-effect counts, derived
// from the required protocol sequence, not from the fault witness's mapping.
const cutCases = [
  { boundary: 'attempt', preceding: 0, image: 0, vision: 0, sdk: 0, publish: 0 },
  { boundary: 'image-start', preceding: 1, image: 0, vision: 0, sdk: 0, publish: 0 },
  { boundary: 'image-settle', preceding: 2, image: 1, vision: 0, sdk: 0, publish: 0 },
  { boundary: 'vision-start', preceding: 3, image: 1, vision: 0, sdk: 0, publish: 0 },
  { boundary: 'reserve', preceding: 4, image: 1, vision: 1, sdk: 0, publish: 0 },
  { boundary: 'authorize', preceding: 5, image: 1, vision: 1, sdk: 0, publish: 0 },
  { boundary: 'pin', preceding: 6, image: 1, vision: 1, sdk: 1, publish: 0 },
  { boundary: 'vision-settle', preceding: 7, image: 1, vision: 1, sdk: 1, publish: 0 },
  { boundary: 'journal', preceding: 8, image: 1, vision: 1, sdk: 1, publish: 1 },
  { boundary: 'terminal', preceding: 8, image: 1, vision: 1, sdk: 1, publish: 1 },
  { boundary: 'finish', preceding: 9, image: 1, vision: 1, sdk: 1, publish: 1 },
] as const satisfies readonly { boundary: ProducerFaultBoundary; preceding: number;
  image: number; vision: number; sdk: number; publish: number }[];
const canonicalImageSequence = [
  'runtime_attempt_started', 'runtime_operation_started', 'runtime_operation_settled',
  'runtime_operation_started', 'reserved', 'runtime_request_authorized', 'model_version_pinned',
  'runtime_operation_settled', 'completed', 'runtime_attempt_finished',
];

// All110 combinations are reachable: each named boundary publishes an atomic
// native ledger array (or journal array), using all five declared delegates.
// Break caught: accepting any native fault, inventing rollback/no-dispatch,
// losing the first fatal, or publishing a terminal after a failed boundary.
for (const row of cutCases) {
  for (const operation of ['write', 'file-fsync', 'close', 'rename', 'dir-fsync'] as const) {
    for (const effect of ['before', 'after'] as const) {
      it(`native producer cut ${row.boundary}/${operation}/${effect} retains the real prefix and blocks its next effect`, async () => {
        const f = await makeProducerFaultFixture(ownedRoots);
        const e = await makeExecution(f);
        const before = disk(f.root);
        f.faults.arm({ boundary: row.boundary, operation, effect });
        await expect(e.producer.runOutcome(e.key, e.work, e.publish))
          .rejects.toThrow('calibration:runtime-evidence-producer-failed');
        expect(f.faults.fired()).toBe(true);
        const label = `${row.boundary}/${operation}`;
        expect(f.faults.trace).toContain(`${label}:entered`);
        expect(f.faults.trace).toContain(`${label}:fault-${effect}`);
        expect(f.faults.trace.includes(`${label}:completed`)).toBe(effect === 'after');
        expect(e.image).toHaveBeenCalledTimes(row.image);
        expect(e.vision).toHaveBeenCalledTimes(row.vision);
        expect(e.raw.witness).toEqual({ sdk: row.sdk, transport: row.sdk });
        expect(e.raw.sdkCalls).toHaveLength(row.sdk);
        expect(e.publish).toHaveBeenCalledTimes(row.publish);
        const after = disk(f.root);
        expect(after.rows.slice(0, before.rows.length)).toEqual(before.rows);
        expect(after.bytes.startsWith(before.bytes.slice(0, -1))).toBe(true);
        expect(after.lock).toBe(before.lock);
        const visible = operation === 'dir-fsync' || (operation === 'rename' && effect === 'after');
        const count = row.preceding + (visible && row.boundary !== 'journal' ? 1 : 0);
        const added = after.rows.slice(before.rows.length);
        expect(added.map((event) => event.type)).toEqual(canonicalImageSequence.slice(0, count));
        for (const event of added.filter((event) => String(event.type).startsWith('runtime_'))) {
          expect(event).toMatchObject({ key: e.key, attempt: 1, owner: f.context.owner });
        }
        if (count >= 3) expect(added[2]).toMatchObject({ operation: 'image', result: 'returned' });
        if (count >= 6) expect(added[5]).toMatchObject({ reservationEventIndex: before.rows.length + 5 });
        if (count >= 7) expect(added[6]).toMatchObject({ responseModelVersion: CORE_PINNED_VERSION });
        if (count >= 8) expect(added[7]).toMatchObject({ operation: 'vision', result: 'returned' });
        expect(after.rows.filter((event) => event.type === 'reserved')).toHaveLength(count >= 5 ? 1 : 0);
        const journalVisible = row.boundary === 'terminal' || row.boundary === 'finish'
          || (row.boundary === 'journal' && visible);
        expect(after.journal).toHaveLength(journalVisible ? 1 : 0);
        if (journalVisible) {
          expect(after.journal[0]).toEqual(buildProducerResultJournal(e.key, e.value, 'none', CORE_PINNED_VERSION));
          const hash = createHash('sha256').update(JSON.stringify(after.journal[0])).digest('hex');
          if (count >= 9) expect(added[8]).toMatchObject({ key: e.key, journalHash: hash });
          if (count >= 10) expect(added[9]).toMatchObject({
            terminal: { kind: 'image', eventIndex: before.rows.length + 9, journalHash: hash },
          });
        }
        await expectPrivatePoison(f, e);
      });
    }
  }
}

type OwnerProbe = 'dead' | 'pid-reused' | 'live' | 'unknown' | 'malformed';
function nextOwner(f: FaultFixture): CalibrationOwner {
  return { ...f.context.owner, pid: f.context.owner.pid + 91000,
    startTicks: f.context.owner.startTicks + 20,
    acquiredAt: new Date(Date.parse(f.context.owner.acquiredAt) + 2000).toISOString() };
}
async function freshInstance(f: FaultFixture, owner: CalibrationOwner, probe: OwnerProbe) {
  const context = { ...f.context, owner };
  const ledger = await prepareNativeCalibrationRuntimeEvidenceLedger({ context }, {
    procStatReader(pid) {
      if (probe === 'dead' || probe === 'unknown') {
        throw Object.assign(new Error('declared fixture liveness'), { code: probe === 'dead' ? 'ENOENT' : 'EACCES' });
      }
      if (probe === 'malformed') return `${pid} (fixture proc) invalid`;
      const ticks = f.context.owner.startTicks + (probe === 'pid-reused' ? 1 : 0);
      return `${pid} (fixture proc) S ${Array<string>(18).fill('0').join(' ')} ${ticks}`;
    },
  });
  ledger.acquireLock(owner);
  return { ...f, context, ledger };
}

// These are actual after-parent-fsync software cuts produced by the bridge.
// A new instance plus a declared liveness reader is not physical process death.
const recoveryCuts = ['attempt', 'image-start', 'image-settle', 'vision-start', 'reserve',
  'authorize', 'vision-settle', 'journal', 'terminal', 'finish'] as const;
for (const cut of recoveryCuts) {
  for (const probe of ['dead', 'pid-reused'] as const) {
    it(`fresh native recovery at ${cut} with declared ${probe} preserves consumed authority`, async () => {
      const f = await makeProducerFaultFixture(ownedRoots);
      const e = await makeExecution(f);
      f.faults.arm({ boundary: cut, operation: 'dir-fsync', effect: 'after' });
      await expect(e.producer.runOutcome(e.key, e.work, e.publish)).rejects.toThrow();
      expect(f.faults.fired()).toBe(true);
      const before = disk(f.root);
      const oldSDK = e.raw.witness.sdk;
      const owner = nextOwner(f);
      if (cut === 'journal') {
        await expect((async () => {
          const fresh = await freshInstance(f, owner, probe);
          fresh.ledger.recoverAfterCrash();
        })()).rejects.toThrow();
        const after = disk(f.root);
        expect(after.rows.slice(0, before.rows.length)).toEqual(before.rows);
        expect(after.journal).toEqual(before.journal);
        expect(after.rows.filter((row) => ['completed', 'failed', 'runtime_attempt_finished', 'runtime_attempt_abandoned'].includes(String(row.type))))
          .toEqual([]);
        expect(existsSync(join(f.root, 'lock.json'))).toBe(true);
        expect(e.raw.witness.sdk).toBe(oldSDK);
        return;
      }
      const fresh = await freshInstance(f, owner, probe);
      const report = fresh.ledger.recoverAfterCrash();
      const recovered = disk(f.root);
      expect(recovered.rows.slice(0, before.rows.length)).toEqual(before.rows);
      expect(JSON.parse(recovered.lock)).toEqual(owner);
      expect(recovered.rows.filter((row) => row.type === 'lock_recovery'))
        .toEqual([expect.objectContaining({ staleOwner: f.context.owner, recoveringOwner: owner })]);
      const unreserved = ['attempt', 'image-start', 'image-settle', 'vision-start'].includes(cut);
      const reserved = ['reserve', 'authorize', 'vision-settle'].includes(cut);
      const abandoned = recovered.rows.filter((row) => row.type === 'runtime_attempt_abandoned');
      expect(abandoned).toHaveLength(unreserved || reserved ? 1 : 0);
      if (unreserved || reserved) {
        expect(abandoned[0]).toMatchObject({ owner, key: e.key, attempt: 1,
          disposition: { kind: unreserved ? 'unreserved_interruption' : 'reserved_interruption' } });
      }
      const finishes = recovered.rows.filter((row) => row.type === 'runtime_attempt_finished');
      expect(finishes).toHaveLength(cut === 'terminal' || cut === 'finish' ? 1 : 0);
      if (cut === 'terminal') {
        const terminalIndex = before.rows.findIndex((row) => row.type === 'completed');
        expect(finishes[0]).toMatchObject({ owner, key: e.key,
          terminal: { kind: 'image', eventIndex: terminalIndex + 1, journalHash: before.rows[terminalIndex]?.journalHash } });
      }
      if (reserved) {
        expect(recovered.rows.filter((row) => row.type === 'failed')).toHaveLength(1);
        expect(recovered.journal).toHaveLength(1);
        expect(recovered.journal[0]).toMatchObject({ key: e.key, errorCategory: 'interrupted_reservation' });
      } else {
        expect(recovered.journal).toEqual(before.journal);
      }
      expect(fresh.ledger.getCounts()).toEqual({ tokenCountReserved: 1, imageReserved: unreserved ? 0 : 1 });
      expect(report.resumable.some((key) => key.stage === e.key.stage && key.profile === e.key.profile
        && key.caseId === e.key.caseId && key.sampleIndex === e.key.sampleIndex)).toBe(unreserved);
      // Construct the new producer ONLY after explicit successful recovery.
      const resumed = await makeExecution(fresh);
      const recoveredPrefix = disk(f.root);
      if (unreserved) {
        await expect(resumed.producer.runOutcome(resumed.key, resumed.work, resumed.publish)).resolves.toEqual(resumed.value);
        expect(resumed.raw.witness.sdk).toBe(1);
        expect(disk(f.root).rows.slice(0, recoveredPrefix.rows.length)).toEqual(recoveredPrefix.rows);
        expect(disk(f.root).rows.filter((row) => row.type === 'runtime_attempt_started'))
          .toEqual([expect.objectContaining({ attempt: 1 }), expect.objectContaining({ owner, attempt: 2 })]);
      } else {
        await expect(resumed.producer.runOutcome(resumed.key, resumed.work, resumed.publish)).rejects.toThrow();
        expect(resumed.image).not.toHaveBeenCalled();
        expect(resumed.raw.witness.sdk).toBe(0);
        expect(resumed.publish).not.toHaveBeenCalled();
        expect(disk(f.root)).toEqual(recoveredPrefix);
      }
      expect(e.raw.witness.sdk).toBe(oldSDK);
    });
  }
}

for (const probe of ['live', 'unknown', 'malformed'] as const) {
  it(`fresh native takeover rejects declared ${probe} without changing the old lock or prefix`, async () => {
    const f = await makeProducerFaultFixture(ownedRoots);
    const e = await makeExecution(f);
    f.faults.arm({ boundary: 'attempt', operation: 'dir-fsync', effect: 'after' });
    await expect(e.producer.runOutcome(e.key, e.work, e.publish)).rejects.toThrow();
    expect(f.faults.fired()).toBe(true);
    const before = disk(f.root);
    const stat = lstatSync(join(f.root, 'lock.json'));
    await expect(freshInstance(f, nextOwner(f), probe)).rejects.toThrow();
    expect(disk(f.root)).toEqual(before);
    expect(lstatSync(join(f.root, 'lock.json')).ino).toBe(stat.ino);
    expect(e.raw.witness.sdk).toBe(0);
  });
}
for (const malformed of [{ pid: 0 }, { startTicks: '12x' }] as const) {
  it(`fresh native takeover does not repair malformed lock owner ${JSON.stringify(malformed)}`, async () => {
    const f = await makeProducerFaultFixture(ownedRoots);
    writeFileSync(join(f.root, 'lock.json'), JSON.stringify({ ...f.context.owner, ...malformed }));
    const before = disk(f.root);
    const stat = lstatSync(join(f.root, 'lock.json'));
    await expect(freshInstance(f, nextOwner(f), 'dead')).rejects.toThrow();
    expect(disk(f.root)).toEqual(before);
    expect(lstatSync(join(f.root, 'lock.json')).ino).toBe(stat.ino);
  });
}

for (const boundary of ['authorize', 'pin'] as const) {
  it(`cannot swallow an actual ${boundary} after-effect syscall failure through transport and work`, async () => {
    const f = await makeProducerFaultFixture(ownedRoots);
    const e = await makeExecution(f);
    const producer = await prepareCalibrationRuntimeEvidenceProducer({ ...e.deps,
      generateVision: async (...args: Parameters<typeof e.vision>) => {
        try { return await e.vision(...args); } catch { return '{"plausible":true}'; }
      },
    });
    f.faults.arm({ boundary, operation: 'dir-fsync', effect: 'after' });
    await expect(producer.runOutcome(e.key, async (caps) => {
      const bytes = await caps.loadImage();
      try { await caps.generateVision({ prompt: 'swallowed native fault', imageBase64: Buffer.from(bytes).toString('base64') }); }
      catch { /* Deliberately swallowed; private producer state still wins. */ }
      return e.value;
    }, e.publish)).rejects.toThrow('calibration:runtime-evidence-producer-failed');
    expect(f.faults.fired()).toBe(true);
    expect(e.raw.witness.sdk).toBe(boundary === 'authorize' ? 0 : 1);
    expect(e.publish).not.toHaveBeenCalled();
    expect(disk(f.root).journal).toEqual([]);
    expect(disk(f.root).rows.filter((row) => row.type === 'runtime_attempt_finished')).toEqual([]);
    await expectPrivatePoison(f, { ...e, producer });
  });
}

// Boundary control only: the honest producer cannot publish before its returned
// vision settlement. Native alias users can leave this distinct incomplete
// terminal, so do not mislabel it a reachable producer-completion crash cut.
it('manual native incomplete-terminal boundary recovers without inventing producer finish', async () => {
  const f = await makeProducerFaultFixture(ownedRoots);
  const key = firstKey(f.context);
  const ref = f.ledger.startRuntimeAttempt(key);
  f.ledger.startRuntimeOperation(ref, 'image');
  f.ledger.settleRuntimeOperation(ref, 'image', 'returned');
  f.ledger.startRuntimeOperation(ref, 'vision');
  f.ledger.reserve(key);
  f.ledger.authorizeRuntimeRequest(ref);
  f.ledger.pinModelVersion(CORE_PINNED_VERSION);
  const hash = f.ledger.appendResultJournal(buildProducerResultJournal(key, prediction(f.context, key), 'none', CORE_PINNED_VERSION));
  f.ledger.complete(key, hash);
  const before = disk(f.root);
  const owner = nextOwner(f);
  const fresh = await freshInstance(f, owner, 'dead');
  fresh.ledger.recoverAfterCrash();
  const after = disk(f.root);
  expect(after.rows.slice(0, before.rows.length)).toEqual(before.rows);
  expect(after.journal).toEqual(before.journal);
  expect(after.rows.filter((row) => row.type === 'runtime_attempt_finished')).toEqual([]);
  expect(after.rows.filter((row) => row.type === 'runtime_attempt_abandoned')).toEqual([
    expect.objectContaining({ owner, key, attempt: 1, disposition: {
      kind: 'terminal_evidence_incomplete', terminal: { kind: 'image', journalHash: hash,
        eventIndex: before.rows.findIndex((row) => row.type === 'completed') + 1 },
    } }),
  ]);
});

it('a real producer finish does not grant default benchmark stage authority', async () => {
  const f = await makeProducerFaultFixture(ownedRoots);
  const e = await makeExecution(f);
  await expect(e.producer.runOutcome(e.key, e.work, e.publish)).resolves.toEqual(e.value);
  const before = disk(f.root);
  expect(() => f.ledger.completeStage('benchmark', {
    stage: 'benchmark', passed: true, completedStages: ['preflight', 'development', 'validation'],
  })).toThrow('calibration:benchmark-runtime-evidence-required');
  expect(disk(f.root)).toEqual(before);
  expect(e.raw.witness.sdk).toBe(1);
});
