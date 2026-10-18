import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { JournalEntry } from '../../src/nutrition-eval/calibration';
import { captureCalibrationReportJournalEntry } from '../../src/nutrition-eval/calibration-report-journal';
import { captureCalibrationNonReservationEntry } from '../../src/nutrition-eval/calibration-report-state';
import type { CalibrationOutcomeCapabilities } from '../../src/nutrition-eval/calibration-runtime-capabilities';
import { prepareCalibrationRuntimeEvidenceProducer } from '../../src/nutrition-eval/calibration-runtime-evidence-producer';
import type { CalibrationRuntimeEvidenceProducer } from '../../src/nutrition-eval/calibration-runtime-evidence-producer';
import { buildRuntimeHarness } from './calibration-runtime-capabilities-fixtures';
import { CORE_PINNED_VERSION } from './calibration-runtime-evidence-fixtures';
import {
  buildProducerResultJournal,
  deferred,
  failurePrediction,
  makeProducerFixture,
} from './calibration-runtime-evidence-producer-fixtures';
import type { ProducerFixture } from './calibration-runtime-evidence-producer-fixtures';

const sdkGuard = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@google/genai', async (original) => ({
  ...await original<typeof import('@google/genai')>(),
  GoogleGenAI: class {
    constructor() {
      sdkGuard.calls++;
      throw new Error('producer-guards: real SDK construction forbidden');
    }
  },
}));
const ownedRoots: string[] = [];
let fetchCalls = 0;
beforeEach(() => {
  sdkGuard.calls = 0;
  fetchCalls = 0;
  vi.stubGlobal('fetch', () => {
    fetchCalls++;
    throw new Error('producer-guards: fetch forbidden');
  });
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
    } finally {
      vi.unstubAllGlobals();
    }
  }
});

// These controls exercise the SAME real codecs/builders later producer tests
// use. Invalid fixture data cannot masquerade as the intended feature RED.
for (const kind of ['provider', 'schema', 'product'] as const) {
  it(`fixture control validates the ${kind} failure through existing closed codecs`, async () => {
    const raw = await buildRuntimeHarness('LOW');
    const row = raw.plan.find((candidate) => kind === 'product'
      ? candidate.key.stage === 'benchmark' && candidate.scanMode === 'barcode'
      : candidate.key.stage === 'preflight' && candidate.key.profile === 'LOW');
    if (row === undefined) throw new Error('fixture-control-key-missing');
    const prediction = failurePrediction(row.key, row.scanMode, kind);
    expect(prediction).toMatchObject({
      parseStatus: 'failure', source: kind === 'product' ? 'barcode' : 'meal', decision: 'error',
      failureCategory: kind, sampleIndex: row.key.sampleIndex, latencyMs: 9, cached: false,
      failureCode: kind === 'provider' ? 'provider_request_failed'
        : kind === 'schema' ? 'model_response_invalid' : 'off_product_not_found',
    });
    expect(Object.isFrozen(prediction)).toBe(true);
    if (kind === 'product') {
      expect(captureCalibrationNonReservationEntry({ key: row.key, reason: 'barcode', prediction }))
        .toEqual({ key: row.key, reason: 'barcode', prediction });
    } else {
      const journal = buildProducerResultJournal(row.key, prediction, 'unknown', CORE_PINNED_VERSION);
      expect(journal).toMatchObject({
        key: row.key, predictionHash: 'unknown', normalizedPrediction: null,
        analysisLatencyMs: 9, errorCategory: 'unknown', responseModelVersion: 'n/a', reportPrediction: prediction,
      });
      expect(captureCalibrationReportJournalEntry(journal)).toEqual(journal);
      expect(() => captureCalibrationReportJournalEntry({ ...journal, analysisLatencyMs: 10 }))
        .toThrow('calibration:report-journal-invalid');
      expect(() => buildProducerResultJournal(row.key, prediction, 'none', CORE_PINNED_VERSION))
        .toThrow('calibration:report-journal-invalid');
    }
    expect(raw.witness).toEqual({ sdk: 0, transport: 0 });
  });
}

for (const kind of ['provider', 'schema'] as const) {
  it(`fixture control publishes the ${kind} failure to a real native terminal`, async () => {
    const f = await makeProducerFixture(ownedRoots);
    const key = { ...f.native.key };
    const before = f.disk();
    const ref = f.native.ledger.startRuntimeAttempt(key);
    f.native.ledger.startRuntimeOperation(ref, 'image');
    f.native.ledger.settleRuntimeOperation(ref, 'image', 'returned');
    f.native.ledger.startRuntimeOperation(ref, 'vision');
    f.native.ledger.reserve(key);
    f.native.ledger.authorizeRuntimeRequest(ref);
    if (kind === 'schema') f.native.ledger.pinModelVersion(CORE_PINNED_VERSION);
    f.native.ledger.settleRuntimeOperation(ref, 'vision', kind === 'provider' ? 'failed' : 'returned');
    const prediction = failurePrediction(key, 'meal', kind);
    f.publishPrediction(key, prediction, 'unknown', CORE_PINNED_VERSION);
    f.native.ledger.finishRuntimeAttempt(ref);
    const after = f.disk();
    expect(after.ledger.slice(0, before.ledger.length)).toEqual(before.ledger);
    expect(after.lock).toBe(before.lock);
    expect(after.journal).toHaveLength(before.journal.length + 1);
    const journal = after.journal.at(-1) as JournalEntry;
    expect(journal).toMatchObject({ predictionHash: 'unknown', normalizedPrediction: null,
      errorCategory: 'unknown', responseModelVersion: 'n/a', reportPrediction: prediction });
    const hash = createHash('sha256').update(JSON.stringify(journal)).digest('hex');
    const rows = after.ledger.slice(before.ledger.length) as Array<Record<string, unknown>>;
    expect(rows.map((row) => row['type'])).toEqual([
      'runtime_attempt_started', 'runtime_operation_started', 'runtime_operation_settled',
      'runtime_operation_started', 'reserved', 'runtime_request_authorized',
      ...(kind === 'schema' ? ['model_version_pinned'] : []),
      'runtime_operation_settled', 'completed', 'runtime_attempt_finished',
    ]);
    expect(rows.at(-2)).toMatchObject({ key, journalHash: hash });
    expect(rows.at(-1)).toMatchObject({ key, attempt: 1, owner: f.native.owner,
      terminal: { kind: 'image', eventIndex: after.ledger.length - 1, journalHash: hash } });
    expect(f.native.ledger.getRuntimeEvidenceSnapshot().activeAttempt).toBeNull();
    // Manual native failure setup, not an SDK-dispatch claim.
    expect(f.raw.witness).toEqual({ sdk: 0, transport: 0 });
    const snapshot = f.native.ledger.getStageReportSnapshot(key.stage, key.profile);
    expect(snapshot.counts).toEqual({ imageCallsReserved: 1, imageCallsCompleted: 0,
      imageCallsFailed: 1, imageCallsPending: 0 });
    expect(snapshot.images).toEqual([{ status: 'completed', key, journalHash: hash, journal }]);
    expect(snapshot.nonReservations).toEqual([]);
    const runtimeBeforeRestart = f.native.ledger.getRuntimeEvidenceSnapshot();
    const nextOwner = { ...f.native.owner, pid: f.native.owner.pid + 90000,
      startTicks: f.native.owner.startTicks + 20,
      acquiredAt: new Date(Date.parse(f.native.owner.acquiredAt) + 1000).toISOString() };
    // The old fixture's proc reader simulates a dead owner; no real process
    // or device is touched. Fresh construction replays actual disk records.
    const fresh = await f.native.restart(nextOwner);
    expect(fresh.recoverAfterCrash().interrupted).toEqual([]);
    expect(fresh.getStageReportSnapshot(key.stage, key.profile)).toEqual(snapshot);
    expect(fresh.getRuntimeEvidenceSnapshot()).toMatchObject({
      owner: nextOwner, activeAttempt: null, sequence: runtimeBeforeRestart.sequence,
      events: runtimeBeforeRestart.events,
    });
    expect(fresh.rebuildReport()).toEqual({ completed: [key] });
    const replayed = f.disk();
    expect(replayed.journal).toEqual(after.journal);
    expect(replayed.ledger.slice(0, after.ledger.length)).toEqual(after.ledger);
    expect(replayed.ledger.slice(after.ledger.length)).toEqual([
      expect.objectContaining({ type: 'lock_recovery', staleOwner: f.native.owner, recoveringOwner: nextOwner }),
    ]);
    expect(JSON.parse(replayed.lock)).toEqual(nextOwner);
  });
}

it('does not publish after work swallows a pre-dispatch capability denial', async () => {
  const f = await makeProducerFixture(ownedRoots);
  const producer = await prepareCalibrationRuntimeEvidenceProducer(f.deps);
  const before = f.disk();
  const result = failurePrediction(f.native.key, 'meal', 'provider');
  const publish = vi.fn((...[key, value]: Parameters<typeof f.publish>) =>
    f.publishPrediction(key, value, 'unknown', CORE_PINNED_VERSION));
  await expect(producer.runOutcome(f.native.key, async (caps) => {
    try { await caps.generateVision({ prompt: 'x', imageBase64: 'AQID' }); } catch { /* deliberately swallowed */ }
    // A swallowed first fatal must stop even the next otherwise-valid loader.
    try { await caps.loadImage(); } catch { /* deliberately swallowed */ }
    return result;
  }, publish)).rejects.toThrow('calibration:runtime-evidence-producer-failed');
  expect(publish).not.toHaveBeenCalled();
  expect(f.raw.capturedKeys.loadImageKeys).toEqual([]);
  expect(f.raw.witness).toEqual({ sdk: 0, transport: 0 });
  const after = f.disk();
  expect(after.journal).toEqual(before.journal);
  expect(after.lock).toBe(before.lock);
  expect((after.ledger.slice(before.ledger.length) as Array<{ type: string }>).map((row) => row.type))
    .toEqual(['runtime_attempt_started']);
  await expect(producer.runOutcome({ ...f.native.key, profile: 'MEDIUM' }, async () => result, publish))
    .rejects.toThrow('calibration:runtime-evidence-producer-failed');
  expect(f.disk()).toEqual(after);
});

it('poisons before a publisher can swallow a leaked facade call', async () => {
  const f = await makeProducerFixture(ownedRoots);
  const producer = await prepareCalibrationRuntimeEvidenceProducer(f.deps);
  const before = f.disk();
  let leaked: Readonly<CalibrationOutcomeCapabilities> | undefined;
  await expect(producer.runOutcome(f.native.key, async (caps) => {
    leaked = caps;
    const image = await caps.loadImage();
    await caps.generateVision({ prompt: 'x', imageBase64: Buffer.from(image).toString('base64') });
    return f.prediction(f.native.key);
  }, async (key, value) => {
    if (leaked === undefined) throw new Error('fixture-missing-facade');
    try { await leaked.loadImage(); } catch { /* deliberately swallowed */ }
    f.publish(key, value);
  })).rejects.toThrow('calibration:runtime-evidence-producer-failed');
  const after = f.disk();
  const rows = after.ledger.slice(before.ledger.length) as Array<{ type: string }>;
  expect(rows.some((row) => row.type === 'runtime_attempt_finished')).toBe(false);
  // Trusted publisher side effects are real and cannot be undone by producer.
  expect(rows.filter((row) => row.type === 'completed')).toHaveLength(1);
  expect(after.journal).toHaveLength(before.journal.length + 1);
  expect(after.lock).toBe(before.lock);
  expect(f.raw.capturedKeys.loadImageKeys).toHaveLength(1);
  expect(f.raw.witness).toEqual({ sdk: 1, transport: 1 });
  expect(f.native.ledger.getRuntimeEvidenceSnapshot().activeAttempt).toEqual({ key: f.native.key, attempt: 1 });
});

const PRODUCER_FAILED = 'calibration:runtime-evidence-producer-failed';
type Disk = ReturnType<ProducerFixture['disk']>;
type VisionPort = ProducerFixture['deps']['generateVision'];

function rowsAfter(f: ProducerFixture, before: Disk): Array<Record<string, unknown>> {
  const after = f.disk();
  expect(after.ledger.slice(0, before.ledger.length)).toEqual(before.ledger);
  return after.ledger.slice(before.ledger.length) as Array<Record<string, unknown>>;
}

function expectStopped(f: ProducerFixture, before: Disk, sdkCalls: number) {
  const after = f.disk();
  const rows = rowsAfter(f, before);
  expect(rows.filter((row) => row['type'] === 'runtime_attempt_finished')).toEqual([]);
  expect(after.lock).toBe(before.lock);
  expect(f.raw.witness).toEqual({ sdk: sdkCalls, transport: sdkCalls });
  return { after, rows };
}

async function expectPoisonBeforeReflection(
  producer: Readonly<CalibrationRuntimeEvidenceProducer>, f: ProducerFixture,
) {
  const after = f.disk();
  let reflections = 0;
  const key = new Proxy({ ...f.native.key }, {
    ownKeys: (target) => { reflections++; return Reflect.ownKeys(target); },
    getOwnPropertyDescriptor: (target, name) => {
      reflections++; return Reflect.getOwnPropertyDescriptor(target, name);
    },
  });
  await expect(producer.runOutcome(key, async () => f.prediction(f.native.key), f.publish))
    .rejects.toThrow(PRODUCER_FAILED);
  expect(reflections).toBe(0);
  expect(f.disk()).toEqual(after);
}

async function imageVision(caps: Readonly<CalibrationOutcomeCapabilities>): Promise<string> {
  const bytes = await caps.loadImage();
  return caps.generateVision({ prompt: 'guard fixture', imageBase64: Buffer.from(bytes).toString('base64') });
}

function requiredCallbacks(options: Parameters<VisionPort>[4]) {
  const hook = options?.beforeRequest;
  const metadata = options?.onResponseMetadata;
  if (hook === undefined || metadata === undefined) throw new Error('fixture-missing-native-callbacks');
  return { hook, metadata };
}

function revokedForeign(): object {
  const foreign = Proxy.revocable({}, {});
  foreign.revoke();
  return foreign.proxy;
}

for (const fault of ['authorization', 'pin'] as const) {
  it(`retains the native ${fault} fatal even when raw transport and work swallow it`, async () => {
    const f = await makeProducerFixture(ownedRoots);
    const ledger = { ...f.native.ledger };
    if (fault === 'authorization') {
      ledger.authorizeRuntimeRequest = (ref) => {
        f.native.faults.failNextLedgerDirFsync = true;
        f.native.ledger.authorizeRuntimeRequest(ref);
      };
    } else {
      ledger.pinModelVersion = (version) => {
        f.native.faults.failNextLedgerDirFsync = true;
        f.native.ledger.pinModelVersion(version);
      };
    }
    f.deps.ledger = ledger;
    f.deps.generateVision = async (...args) => {
      try { return await f.raw.deps.generateVision(...args); }
      catch { return '{"plausible":true}'; }
    };
    const producer = await prepareCalibrationRuntimeEvidenceProducer(f.deps);
    const before = f.disk();
    const prediction = failurePrediction(f.native.key, 'meal', 'provider');
    const publish = vi.fn((...args: Parameters<typeof f.publish>) =>
      f.publishPrediction(...args, 'unknown', CORE_PINNED_VERSION));
    await expect(producer.runOutcome(f.native.key, async (caps) => {
      try { await imageVision(caps); } catch { /* deliberately swallowed */ }
      return prediction;
    }, publish)).rejects.toThrow(PRODUCER_FAILED);
    expect(publish).not.toHaveBeenCalled();
    const { after, rows } = expectStopped(f, before, fault === 'authorization' ? 0 : 1);
    expect(after.journal).toEqual(before.journal);
    expect(rows.filter((row) => row['type'] === 'reserved')).toHaveLength(1);
    // The injected directory-fsync error occurs AFTER the native write. Its
    // consumed on-disk prefix must remain, not be rolled back or hidden.
    expect(rows.filter((row) => row['type'] === 'runtime_request_authorized')).toHaveLength(1);
    expect(rows.filter((row) => row['type'] === 'model_version_pinned')).toHaveLength(fault === 'pin' ? 1 : 0);
    expect(rows.filter((row) => row['type'] === 'runtime_operation_settled' && row['operation'] === 'vision'))
      .toEqual([]);
    expect(rows.filter((row) => row['type'] === 'completed' || row['type'] === 'non_reservation_result'))
      .toEqual([]);
    await expectPoisonBeforeReflection(producer, f);
  });
}

for (const handled of [true, false]) {
  it(`${handled ? 'publishes a real failure for handled' : 'stops publication for unhandled'} post-authorization SDK rejection`, async () => {
    const f = await makeProducerFixture(ownedRoots);
    const sdk = f.raw.client.models.generateContent;
    const foreign = revokedForeign();
    let atSdk: Disk | undefined;
    f.raw.client.models.generateContent = async (params) => {
      atSdk = f.disk();
      await sdk(params);
      throw foreign;
    };
    const producer = await prepareCalibrationRuntimeEvidenceProducer(f.deps);
    const before = f.disk();
    const prediction = failurePrediction(f.native.key, 'meal', 'provider');
    const publish = vi.fn((...args: Parameters<typeof f.publish>) =>
      f.publishPrediction(...args, 'unknown', CORE_PINNED_VERSION));
    let caught = false;
    const outcome = producer.runOutcome(f.native.key, async (caps) => {
      if (!handled) { await imageVision(caps); return prediction; }
      try { await imageVision(caps); }
      catch { caught = true; return prediction; }
      throw new Error('fixture-expected-sdk-rejection');
    }, publish);
    if (handled) {
      await expect(outcome).resolves.toEqual(prediction);
      expect(caught).toBe(true);
      expect(publish).toHaveBeenCalledTimes(1);
      expect(publish).toHaveBeenCalledWith(f.native.key, prediction);
    } else {
      await expect(outcome).rejects.toThrow(PRODUCER_FAILED);
      expect(publish).not.toHaveBeenCalled();
    }
    expect(f.raw.witness).toEqual({ sdk: 1, transport: 1 });
    expect(atSdk).toBeDefined();
    expect((atSdk?.ledger.at(-1) as Record<string, unknown>)['type']).toBe('runtime_request_authorized');
    const rows = rowsAfter(f, before);
    expect(rows.filter((row) => row['type'] === 'reserved')).toHaveLength(1);
    expect(rows.filter((row) => row['type'] === 'runtime_request_authorized')).toHaveLength(1);
    expect(rows.filter((row) => row['type'] === 'model_version_pinned')).toEqual([]);
    expect(rows.filter((row) => row['type'] === 'runtime_operation_settled' && row['operation'] === 'vision'))
      .toEqual([expect.objectContaining({ result: 'failed' })]);
    expect(f.disk().lock).toBe(before.lock);
    if (handled) {
      expect(f.disk().journal).toHaveLength(before.journal.length + 1);
      expect(f.disk().journal.at(-1)).toMatchObject({ reportPrediction: prediction, normalizedPrediction: null,
        errorCategory: 'unknown', responseModelVersion: 'n/a' });
      expect(rows.filter((row) => row['type'] === 'completed')).toHaveLength(1);
      expect(rows.filter((row) => row['type'] === 'runtime_attempt_finished')).toHaveLength(1);
      expect(f.native.ledger.getStageReportSnapshot('preflight', 'LOW').counts)
        .toEqual({ imageCallsReserved: 1, imageCallsCompleted: 0, imageCallsFailed: 1, imageCallsPending: 0 });
      expect(f.native.ledger.getRuntimeEvidenceSnapshot().activeAttempt).toBeNull();
    } else {
      expectStopped(f, before, 1);
      expect(f.disk().journal).toEqual(before.journal);
      expect(rows.filter((row) => row['type'] === 'completed')).toEqual([]);
      await expectPoisonBeforeReflection(producer, f);
    }
  });
}

it('does not invent authorization or a dataset terminal for a swallowed pre-hook raw rejection', async () => {
  const f = await makeProducerFixture(ownedRoots);
  const foreign = revokedForeign();
  f.deps.generateVision = async () => { throw foreign; };
  const producer = await prepareCalibrationRuntimeEvidenceProducer(f.deps);
  const before = f.disk();
  const prediction = failurePrediction(f.native.key, 'meal', 'provider');
  const publish = vi.fn(f.publish);
  await expect(producer.runOutcome(f.native.key, async (caps) => {
    try { await imageVision(caps); } catch { /* deliberately swallowed */ }
    return prediction;
  }, publish)).rejects.toThrow(PRODUCER_FAILED);
  expect(publish).not.toHaveBeenCalled();
  const { after, rows } = expectStopped(f, before, 0);
  expect(after.journal).toEqual(before.journal);
  expect(rows.map((row) => row['type'])).toEqual([
    'runtime_attempt_started', 'runtime_operation_started', 'runtime_operation_settled', 'runtime_operation_started',
  ]);
  await expectPoisonBeforeReflection(producer, f);
});

it('publishes a returned parser failure after real adapter metadata and returned vision settlement', async () => {
  const f = await makeProducerFixture(ownedRoots);
  const producer = await prepareCalibrationRuntimeEvidenceProducer(f.deps);
  const before = f.disk();
  const prediction = failurePrediction(f.native.key, 'meal', 'schema');
  await expect(producer.runOutcome(f.native.key, async (caps) => {
    expect(await imageVision(caps)).toBe('{"fixture":true}');
    return prediction;
  }, (key, value) => f.publishPrediction(key, value, 'unknown', CORE_PINNED_VERSION)))
    .resolves.toEqual(prediction);
  expect(f.raw.witness).toEqual({ sdk: 1, transport: 1 });
  const rows = rowsAfter(f, before);
  expect(rows.map((row) => row['type'])).toEqual([
    'runtime_attempt_started', 'runtime_operation_started', 'runtime_operation_settled',
    'runtime_operation_started', 'reserved', 'runtime_request_authorized', 'model_version_pinned',
    'runtime_operation_settled', 'completed', 'runtime_attempt_finished',
  ]);
  expect(rows[6]).toMatchObject({ responseModelVersion: CORE_PINNED_VERSION });
  expect(rows[7]).toMatchObject({ operation: 'vision', result: 'returned' });
  expect(f.disk().journal.at(-1)).toMatchObject({ reportPrediction: prediction,
    normalizedPrediction: null, errorCategory: 'unknown', responseModelVersion: 'n/a' });
  expect(f.native.ledger.getStageReportSnapshot('preflight', 'LOW').counts)
    .toEqual({ imageCallsReserved: 1, imageCallsCompleted: 0, imageCallsFailed: 1, imageCallsPending: 0 });
});

it('rejects a non-barcode snapshot capability before raw lookup even if work swallows it', async () => {
  const f = await makeProducerFixture(ownedRoots);
  const producer = await prepareCalibrationRuntimeEvidenceProducer(f.deps);
  const before = f.disk();
  const publish = vi.fn(f.publish);
  await expect(producer.runOutcome(f.native.key, async (caps) => {
    try { caps.lookupSnapshot(); } catch { /* deliberately swallowed */ }
    return f.prediction(f.native.key);
  }, publish)).rejects.toThrow(PRODUCER_FAILED);
  expect(publish).not.toHaveBeenCalled();
  expect(f.raw.capturedKeys.snapshotBarcodes).toEqual([]);
  const { after, rows } = expectStopped(f, before, 0);
  expect(rows.map((row) => row['type'])).toEqual(['runtime_attempt_started']);
  expect(after.journal).toEqual(before.journal);
  await expectPoisonBeforeReflection(producer, f);
});

for (const kind of ['missing hook', 'duplicate hook', 'overlapping hook', 'missing metadata',
  'duplicate metadata', 'malformed metadata', 'metadata before hook'] as const) {
  it(`does not publish after raw transport hides ${kind}`, async () => {
    const f = await makeProducerFixture(ownedRoots);
    f.deps.generateVision = async (_model, _prompt, _image, _source, options) => {
      const c = requiredCallbacks(options);
      try {
        if (kind === 'missing hook') return '{"plausible":true}';
        if (kind === 'metadata before hook') {
          try { c.metadata({ modelVersion: CORE_PINNED_VERSION }); } catch { /* deliberately swallowed */ }
          try { await c.hook(); } catch { /* cannot gain authorization after the first fatal */ }
        } else if (kind === 'overlapping hook') {
          const first = c.hook();
          const second = c.hook();
          await Promise.allSettled([first, second]);
        } else {
          await c.hook();
          if (kind === 'duplicate hook') await c.hook();
          else if (kind === 'duplicate metadata') {
            c.metadata({ modelVersion: CORE_PINNED_VERSION });
            c.metadata({ modelVersion: CORE_PINNED_VERSION });
          } else if (kind === 'malformed metadata') c.metadata({ modelVersion: 'invalid version with spaces' });
          // missing metadata intentionally returns without inventing it.
        }
      } catch { /* raw transport deliberately returns plausible text */ }
      return '{"plausible":true}';
    };
    const producer = await prepareCalibrationRuntimeEvidenceProducer(f.deps);
    const before = f.disk();
    const publish = vi.fn(f.publish);
    await expect(producer.runOutcome(f.native.key, async (caps) => {
      try { await imageVision(caps); } catch { /* deliberately swallowed */ }
      return failurePrediction(f.native.key, 'meal', 'provider');
    }, publish)).rejects.toThrow(PRODUCER_FAILED);
    expect(publish).not.toHaveBeenCalled();
    // This deliberately dishonest raw port calls no SDK. Authorization by
    // itself must not be presented as transport-dispatch evidence.
    const { after, rows } = expectStopped(f, before, 0);
    expect(after.journal).toEqual(before.journal);
    const authorized = kind !== 'missing hook' && kind !== 'metadata before hook';
    expect(rows.filter((row) => row['type'] === 'reserved')).toHaveLength(authorized ? 1 : 0);
    expect(rows.filter((row) => row['type'] === 'runtime_request_authorized')).toHaveLength(authorized ? 1 : 0);
    expect(rows.filter((row) => row['type'] === 'model_version_pinned'))
      .toHaveLength(kind === 'duplicate metadata' ? 1 : 0);
    expect(rows.filter((row) => row['type'] === 'runtime_operation_settled' && row['operation'] === 'vision'))
      .toEqual([]);
    expect(rows.filter((row) => row['type'] === 'completed' || row['type'] === 'non_reservation_result'))
      .toEqual([]);
    await expectPoisonBeforeReflection(producer, f);
  });
}

it('does not turn real response-version drift on the next canonical outcome into a scored failure', async () => {
  const f = await makeProducerFixture(ownedRoots);
  const producer = await prepareCalibrationRuntimeEvidenceProducer(f.deps);
  await producer.runOutcome(f.native.key, async (caps) => {
    await imageVision(caps);
    return f.prediction(f.native.key);
  }, f.publish);
  const key = { ...f.native.key, profile: 'MEDIUM' as const };
  const sdk = f.raw.client.models.generateContent;
  f.raw.client.models.generateContent = async (params) => ({
    ...await sdk(params), modelVersion: 'different-valid-response-version',
  });
  const before = f.disk();
  const publish = vi.fn(f.publish);
  await expect(producer.runOutcome(key, async (caps) => {
    try { await imageVision(caps); } catch { /* deliberately swallowed */ }
    return failurePrediction(key, 'meal', 'provider');
  }, publish)).rejects.toThrow(PRODUCER_FAILED);
  expect(publish).not.toHaveBeenCalled();
  const { after, rows } = expectStopped(f, before, 2);
  expect(after.journal).toEqual(before.journal);
  expect(rows.filter((row) => row['type'] === 'reserved')).toEqual([expect.objectContaining({ key })]);
  expect(rows.filter((row) => row['type'] === 'runtime_request_authorized')).toHaveLength(1);
  expect(rows.filter((row) => row['type'] === 'runtime_operation_settled' && row['operation'] === 'vision'))
    .toEqual([]);
  expect(rows.filter((row) => row['type'] === 'model_version_pinned')).toEqual([]);
  await expectPoisonBeforeReflection(producer, f);
});

for (const operation of ['image', 'vision'] as const) {
  it(`poisons overlapping ${operation} calls and never grants a second raw effect`, async () => {
    const f = await makeProducerFixture(ownedRoots);
    const entered = deferred<void>();
    const release = deferred<void>();
    if (operation === 'image') {
      const load = f.deps.loadImage;
      f.deps.loadImage = async (key) => {
        entered.resolve();
        await release.promise;
        return load(key);
      };
    } else {
      const sdk = f.raw.client.models.generateContent;
      f.raw.client.models.generateContent = async (params) => {
        const response = await sdk(params);
        entered.resolve();
        await release.promise;
        return response;
      };
    }
    const producer = await prepareCalibrationRuntimeEvidenceProducer(f.deps);
    const before = f.disk();
    const publish = vi.fn(f.publish);
    let pending: Promise<unknown> | undefined;
    try {
      await expect(producer.runOutcome(f.native.key, async (caps) => {
        if (operation === 'vision') await caps.loadImage();
        const call = () => operation === 'image' ? caps.loadImage()
          : caps.generateVision({ prompt: 'pending', imageBase64: 'AQID' });
        pending = call();
        void pending.catch(() => undefined);
        await entered.promise;
        try { await call(); } catch { /* deliberately swallowed */ }
        release.resolve();
        await pending.catch(() => undefined);
        return f.prediction(f.native.key);
      }, publish)).rejects.toThrow(PRODUCER_FAILED);
    } finally {
      release.resolve();
      if (pending !== undefined) await pending.catch(() => undefined);
    }
    expect(publish).not.toHaveBeenCalled();
    const { after, rows } = expectStopped(f, before, operation === 'vision' ? 1 : 0);
    expect(after.journal).toEqual(before.journal);
    expect(rows.filter((row) => row['type'] === 'runtime_operation_started' && row['operation'] === operation))
      .toHaveLength(1);
    expect(rows.filter((row) => row['type'] === 'runtime_operation_settled' && row['operation'] === operation))
      .toEqual([]);
    expect(rows.filter((row) => row['type'] === 'reserved')).toHaveLength(operation === 'vision' ? 1 : 0);
    expect(f.raw.capturedKeys.loadImageKeys).toHaveLength(1);
    await expectPoisonBeforeReflection(producer, f);
  });
}

for (const operation of ['image', 'vision'] as const) {
  it(`does not publish work that returns while ${operation} is still pending`, async () => {
    const f = await makeProducerFixture(ownedRoots);
    const entered = deferred<void>();
    const release = deferred<void>();
    if (operation === 'image') {
      const load = f.deps.loadImage;
      f.deps.loadImage = async (key) => {
        entered.resolve();
        await release.promise;
        return load(key);
      };
    } else {
      const sdk = f.raw.client.models.generateContent;
      f.raw.client.models.generateContent = async (params) => {
        const response = await sdk(params);
        entered.resolve();
        await release.promise;
        return response;
      };
    }
    const producer = await prepareCalibrationRuntimeEvidenceProducer(f.deps);
    const before = f.disk();
    const publish = vi.fn(f.publish);
    let pending: Promise<unknown> | undefined;
    const outcome = producer.runOutcome(f.native.key, async (caps) => {
      if (operation === 'vision') await caps.loadImage();
      pending = operation === 'image' ? caps.loadImage()
        : caps.generateVision({ prompt: 'pending', imageBase64: 'AQID' });
      void pending.catch(() => undefined);
      await entered.promise;
      return f.prediction(f.native.key);
    }, publish);
    try {
      await expect(outcome).rejects.toThrow(PRODUCER_FAILED);
    } finally {
      release.resolve();
      if (pending !== undefined) await pending.catch(() => undefined);
    }
    expect(publish).not.toHaveBeenCalled();
    const { after, rows } = expectStopped(f, before, operation === 'vision' ? 1 : 0);
    expect(after.journal).toEqual(before.journal);
    expect(rows.filter((row) => row['type'] === 'runtime_operation_started' && row['operation'] === operation))
      .toHaveLength(1);
    expect(rows.filter((row) => row['type'] === 'runtime_operation_settled' && row['operation'] === operation))
      .toEqual([]);
    await expectPoisonBeforeReflection(producer, f);
  });
}

it('does not let a duplicate vision denial borrow an earlier ordinary provider-rejection allowance', async () => {
  const f = await makeProducerFixture(ownedRoots);
  const sdk = f.raw.client.models.generateContent;
  f.raw.client.models.generateContent = async (params) => {
    await sdk(params);
    throw revokedForeign();
  };
  const producer = await prepareCalibrationRuntimeEvidenceProducer(f.deps);
  const before = f.disk();
  const publish = vi.fn(f.publish);
  await expect(producer.runOutcome(f.native.key, async (caps) => {
    await caps.loadImage();
    try { await caps.generateVision({ prompt: 'first', imageBase64: 'AQID' }); } catch { /* genuine ordinary rejection */ }
    try { await caps.generateVision({ prompt: 'second', imageBase64: 'AQID' }); } catch { /* private duplicate denial */ }
    return failurePrediction(f.native.key, 'meal', 'provider');
  }, publish)).rejects.toThrow(PRODUCER_FAILED);
  expect(publish).not.toHaveBeenCalled();
  const { after, rows } = expectStopped(f, before, 1);
  expect(after.journal).toEqual(before.journal);
  expect(rows.filter((row) => row['type'] === 'reserved')).toHaveLength(1);
  expect(rows.filter((row) => row['type'] === 'runtime_operation_settled' && row['operation'] === 'vision'))
    .toEqual([expect.objectContaining({ result: 'failed' })]);
  await expectPoisonBeforeReflection(producer, f);
});

it('rejects a second image load even after the first load returned', async () => {
  const f = await makeProducerFixture(ownedRoots);
  const producer = await prepareCalibrationRuntimeEvidenceProducer(f.deps);
  const before = f.disk();
  const publish = vi.fn(f.publish);
  await expect(producer.runOutcome(f.native.key, async (caps) => {
    await caps.loadImage();
    try { await caps.loadImage(); } catch { /* deliberately swallowed */ }
    return f.prediction(f.native.key);
  }, publish)).rejects.toThrow(PRODUCER_FAILED);
  expect(publish).not.toHaveBeenCalled();
  const { after, rows } = expectStopped(f, before, 0);
  expect(after.journal).toEqual(before.journal);
  expect(f.raw.capturedKeys.loadImageKeys).toHaveLength(1);
  expect(rows.filter((row) => row['type'] === 'runtime_operation_started')).toHaveLength(1);
  expect(rows.filter((row) => row['type'] === 'runtime_operation_settled'))
    .toEqual([expect.objectContaining({ operation: 'image', result: 'returned' })]);
  await expectPoisonBeforeReflection(producer, f);
});

for (const callback of ['hook', 'metadata'] as const) {
  for (const when of ['after finish', 'during next outcome'] as const) {
    it(`binds the stale ${callback} callback to its original outcome ${when}`, async () => {
      const f = await makeProducerFixture(ownedRoots);
      let retained: ReturnType<typeof requiredCallbacks> | undefined;
      f.deps.generateVision = async (...args) => {
        retained ??= requiredCallbacks(args[4]);
        return f.raw.deps.generateVision(...args);
      };
      async function stale() {
        if (retained === undefined) throw new Error('fixture-no-retained-callback');
        if (callback === 'hook') await retained.hook();
        else retained.metadata({ modelVersion: CORE_PINNED_VERSION });
      }
      f.deps.loadImage = async (key) => {
        if (when === 'during next outcome' && key.profile === 'MEDIUM') {
          try { await stale(); } catch { /* deliberately swallowed by raw loader */ }
        }
        return f.raw.deps.loadImage(key);
      };
      const producer = await prepareCalibrationRuntimeEvidenceProducer(f.deps);
      await producer.runOutcome(f.native.key, async (caps) => {
        await imageVision(caps);
        return f.prediction(f.native.key);
      }, f.publish);
      const before = f.disk();
      if (when === 'after finish') {
        await expect(stale()).rejects.toThrow(PRODUCER_FAILED);
        expect(f.disk()).toEqual(before);
        expect(f.native.ledger.getRuntimeEvidenceSnapshot().activeAttempt).toBeNull();
      } else {
        const key = { ...f.native.key, profile: 'MEDIUM' as const };
        const publish = vi.fn(f.publish);
        await expect(producer.runOutcome(key, async (caps) => {
          try { await imageVision(caps); } catch { /* deliberately swallowed */ }
          return failurePrediction(key, 'meal', 'provider');
        }, publish)).rejects.toThrow(PRODUCER_FAILED);
        expect(publish).not.toHaveBeenCalled();
        const { after, rows } = expectStopped(f, before, 1);
        expect(after.journal).toEqual(before.journal);
        expect(rows).toEqual([
          expect.objectContaining({ type: 'runtime_attempt_started', key, attempt: 1 }),
          expect.objectContaining({ type: 'runtime_operation_started', key, attempt: 1, operation: 'image' }),
        ]);
        expect(f.native.ledger.getRuntimeEvidenceSnapshot().activeAttempt).toEqual({ key, attempt: 1 });
      }
      // The earlier durable finish is never revoked or written a second time.
      expect((f.disk().ledger as Array<Record<string, unknown>>)
        .filter((row) => row['type'] === 'runtime_attempt_finished')).toHaveLength(1);
      expect(f.raw.witness).toEqual({ sdk: 1, transport: 1 });
      await expectPoisonBeforeReflection(producer, f);
    });
  }
}

for (const trap of ['ownKeys', 'getOwnPropertyDescriptor'] as const) {
  it(`reserves the capturing generation before a reentrant key ${trap} trap`, async () => {
    const f = await makeProducerFixture(ownedRoots);
    const producer = await prepareCalibrationRuntimeEvidenceProducer(f.deps);
    const before = f.disk();
    const work = vi.fn(async () => f.prediction(f.native.key));
    const publish = vi.fn(f.publish);
    let inner: Promise<unknown> | undefined;
    function reenter() {
      inner ??= producer.runOutcome({ ...f.native.key, profile: 'MEDIUM' }, work, publish);
      void inner.catch(() => undefined);
    }
    const key = new Proxy({ ...f.native.key }, {
      ownKeys: (target) => {
        if (trap === 'ownKeys') reenter();
        return Reflect.ownKeys(target);
      },
      getOwnPropertyDescriptor: (target, name) => {
        if (trap === 'getOwnPropertyDescriptor') reenter();
        return Reflect.getOwnPropertyDescriptor(target, name);
      },
    });
    await expect(producer.runOutcome(key, work, publish)).rejects.toThrow(PRODUCER_FAILED);
    if (inner === undefined) throw new Error('fixture-reentry-not-exercised');
    await expect(inner).rejects.toThrow(PRODUCER_FAILED);
    expect(work).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
    expect(f.disk()).toEqual(before);
    expect(f.raw.witness).toEqual({ sdk: 0, transport: 0 });
    await expectPoisonBeforeReflection(producer, f);
  });
}

for (const phase of ['work', 'publisher'] as const) {
  it(`does not replace the original invocation when ${phase} reenters and swallows denial`, async () => {
    const f = await makeProducerFixture(ownedRoots);
    const producer = await prepareCalibrationRuntimeEvidenceProducer(f.deps);
    const before = f.disk();
    let innerReflections = 0;
    const innerKey = new Proxy({ ...f.native.key, profile: 'MEDIUM' as const }, {
      ownKeys: (target) => { innerReflections++; return Reflect.ownKeys(target); },
    });
    const innerWork = vi.fn(async () => f.prediction(f.native.key));
    const innerPublish = vi.fn(f.publish);
    async function reenter() {
      try { await producer.runOutcome(innerKey, innerWork, innerPublish); }
      catch { /* deliberately swallowed */ }
    }
    const publish = vi.fn(async (...[key, prediction]: Parameters<typeof f.publish>) => {
      if (phase === 'publisher') await reenter();
      f.publish(key, prediction);
    });
    await expect(producer.runOutcome(f.native.key, async (caps) => {
      if (phase === 'work') {
        await reenter();
        try { await imageVision(caps); } catch { /* cannot gain effects after reentry */ }
      } else await imageVision(caps);
      return f.prediction(f.native.key);
    }, publish)).rejects.toThrow(PRODUCER_FAILED);
    expect(innerReflections).toBe(0);
    expect(innerWork).not.toHaveBeenCalled();
    expect(innerPublish).not.toHaveBeenCalled();
    const { after, rows } = expectStopped(f, before, phase === 'publisher' ? 1 : 0);
    if (phase === 'publisher') {
      expect(publish).toHaveBeenCalledTimes(1);
      expect(after.journal).toHaveLength(before.journal.length + 1);
      expect(rows.filter((row) => row['type'] === 'completed')).toHaveLength(1);
    } else {
      expect(publish).not.toHaveBeenCalled();
      expect(after.journal).toEqual(before.journal);
      expect(rows.map((row) => row['type'])).toEqual(['runtime_attempt_started']);
    }
    expect(f.native.ledger.getRuntimeEvidenceSnapshot().activeAttempt).toEqual({ key: f.native.key, attempt: 1 });
    await expectPoisonBeforeReflection(producer, f);
  });
}

it('keeps captured context, methods and key independent of aliases mutated while work awaits', async () => {
  const f = await makeProducerFixture(ownedRoots);
  const context = { ...f.native.context, owner: { ...f.native.context.owner },
    identity: { ...f.native.context.identity }, files: { ...f.native.context.files } };
  const ledger = { ...f.native.ledger };
  const deps = { ...f.deps, context, ledger };
  const producer = await prepareCalibrationRuntimeEvidenceProducer(deps);
  const key = { ...f.native.key };
  const entered = deferred<void>();
  const release = deferred<void>();
  const publish = vi.fn(f.publish);
  let replacementCalls = 0;
  const outcome = producer.runOutcome(key, async (caps) => {
    entered.resolve();
    await release.promise;
    await imageVision(caps);
    return f.prediction(f.native.key);
  }, publish);
  void outcome.catch(() => undefined);
  try {
    await Promise.race([entered.promise, outcome.then(() => { throw new Error('fixture-work-not-entered'); })]);
    key.profile = 'MEDIUM';
    context.owner.pid++;
    context.identity.datasetHash = 'f'.repeat(64);
    context.files['calibration-manifest'] += '\n';
    ledger.reserve = () => { replacementCalls++; throw new Error('fixture-replaced-reserve'); };
    deps.loadImage = async () => { replacementCalls++; throw new Error('fixture-replaced-loader'); };
    release.resolve();
    await expect(outcome).resolves.toEqual(f.prediction(f.native.key));
  } finally {
    release.resolve();
    await outcome.catch(() => undefined);
  }
  expect(replacementCalls).toBe(0);
  expect(Object.isFrozen(context)).toBe(false);
  expect(Object.isFrozen(ledger)).toBe(false);
  expect(publish).toHaveBeenCalledWith(f.native.key, f.prediction(f.native.key));
  expect(f.raw.capturedKeys.loadImageKeys).toEqual([f.native.key]);
  expect(f.raw.witness).toEqual({ sdk: 1, transport: 1 });
  expect(f.native.ledger.getRuntimeEvidenceSnapshot().activeAttempt).toBeNull();
});

it('rejects an actual unacquired native ledger before creating another attempt', async () => {
  const f = await makeProducerFixture(ownedRoots);
  const ledger = await f.native.createUnacquiredLedger();
  const producer = await prepareCalibrationRuntimeEvidenceProducer({ ...f.deps, ledger });
  const before = f.disk();
  const publish = vi.fn(f.publish);
  await expect(producer.runOutcome(f.native.key, async () => f.prediction(f.native.key), publish))
    .rejects.toThrow(PRODUCER_FAILED);
  expect(publish).not.toHaveBeenCalled();
  expect(f.disk()).toEqual(before);
  expect(f.raw.witness).toEqual({ sdk: 0, transport: 0 });
  await expectPoisonBeforeReflection(producer, f);
});

it('accepts a clean documentation-only HEAD move without confusing it with source identity drift', async () => {
  const f = await makeProducerFixture(ownedRoots);
  const producer = await prepareCalibrationRuntimeEvidenceProducer(f.deps);
  writeFileSync(join(f.native.gitRoot, 'README.md'), 'fixture documentation only\n');
  execFileSync('git', ['-C', f.native.gitRoot, 'add', '--', 'README.md']);
  execFileSync('git', ['-C', f.native.gitRoot, 'commit', '--quiet', '-m', 'Change fixture documentation']);
  const current = execFileSync('git', ['-C', f.native.gitRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  expect(current).not.toBe(f.native.context.identity.implementationCommit);
  const before = f.disk();
  await expect(producer.runOutcome(f.native.key, async (caps) => {
    await imageVision(caps);
    return f.prediction(f.native.key);
  }, f.publish)).resolves.toEqual(f.prediction(f.native.key));
  expect(f.disk().lock).toBe(before.lock);
  expect(f.raw.witness).toEqual({ sdk: 1, transport: 1 });
  expect(rowsAfter(f, before).at(-1)).toMatchObject({ type: 'runtime_attempt_finished', key: f.native.key });
});

for (const mutation of ['source', 'lock'] as const) {
  for (const phase of ['image', 'metadata'] as const) {
    it(`retains the incomplete prefix after ${mutation} replacement between ${phase} callbacks`, async () => {
      const f = await makeProducerFixture(ownedRoots);
      const sourcePath = join(f.native.gitRoot, 'functions/eval/nutrition/calibration-manifest.json');
      const changedSource = readFileSync(sourcePath, 'utf8') + '\n';
      const changedLock = JSON.stringify({ ...f.native.owner, pid: f.native.owner.pid + 1 });
      function replace() {
        if (mutation === 'source') writeFileSync(sourcePath, changedSource);
        else writeFileSync(join(f.native.root, 'lock.json'), changedLock);
      }
      if (phase === 'image') {
        f.deps.loadImage = async (key) => {
          const bytes = await f.raw.deps.loadImage(key);
          replace();
          return bytes;
        };
      } else {
        const sdk = f.raw.client.models.generateContent;
        f.raw.client.models.generateContent = async (params) => {
          const response = await sdk(params);
          replace();
          return response;
        };
      }
      const producer = await prepareCalibrationRuntimeEvidenceProducer(f.deps);
      const before = f.disk();
      const publish = vi.fn(f.publish);
      await expect(producer.runOutcome(f.native.key, async (caps) => {
        try { await imageVision(caps); } catch { /* deliberately swallowed */ }
        return failurePrediction(f.native.key, 'meal', 'provider');
      }, publish)).rejects.toThrow(PRODUCER_FAILED);
      expect(publish).not.toHaveBeenCalled();
      const after = f.disk();
      const rows = rowsAfter(f, before);
      expect(after.journal).toEqual(before.journal);
      expect(rows.filter((row) => row['type'] === 'completed' || row['type'] === 'runtime_attempt_finished'))
        .toEqual([]);
      expect(f.raw.witness).toEqual({ sdk: phase === 'metadata' ? 1 : 0, transport: phase === 'metadata' ? 1 : 0 });
      expect(rows.filter((row) => row['type'] === 'reserved')).toHaveLength(phase === 'metadata' ? 1 : 0);
      expect(rows.filter((row) => row['type'] === 'runtime_operation_settled' && row['operation'] === 'vision'))
        .toEqual([]);
      if (mutation === 'source') {
        expect(readFileSync(sourcePath, 'utf8')).toBe(changedSource);
        expect(after.lock).toBe(before.lock);
      } else expect(after.lock).toBe(changedLock);
      await expectPoisonBeforeReflection(producer, f);
    });
  }
}

for (const kind of ['return only', 'safe error only', 'wrong key', 'forged hash',
  'duplicate terminal', 'swallowed duplicate terminal'] as const) {
  it(`requires actual terminal authority when the publisher uses ${kind}`, async () => {
    const f = await makeProducerFixture(ownedRoots);
    const producer = await prepareCalibrationRuntimeEvidenceProducer(f.deps);
    const before = f.disk();
    await expect(producer.runOutcome(f.native.key, async (caps) => {
      await imageVision(caps);
      return f.prediction(f.native.key);
    }, (key, prediction) => {
      if (kind === 'return only') return;
      if (kind === 'safe error only') {
        f.native.ledger.recordSafeError({ stage: 'preflight', kind: 'image', caseId: key.caseId,
          profile: key.profile, sampleIndex: 1, errorCategory: 'unknown' });
      } else if (kind === 'wrong key') f.publish({ ...key, profile: 'MEDIUM' }, prediction);
      else if (kind === 'forged hash') {
        const hash = f.native.ledger.appendResultJournal(
          buildProducerResultJournal(key, prediction, 'none', CORE_PINNED_VERSION));
        const wrongHash = (hash.startsWith('0') ? '1' : '0') + hash.slice(1);
        f.native.ledger.complete(key, wrongHash);
      } else {
        f.publish(key, prediction);
        if (kind === 'duplicate terminal') f.publish(key, prediction);
        else {
          try { f.publish(key, prediction); } catch { /* deliberately swallowed native failure */ }
        }
      }
    })).rejects.toThrow(PRODUCER_FAILED);
    const { after, rows } = expectStopped(f, before, 1);
    const partialPublication = kind === 'forged hash' || kind === 'duplicate terminal'
      || kind === 'swallowed duplicate terminal';
    expect(after.journal).toHaveLength(before.journal.length + (partialPublication ? 1 : 0));
    expect(rows.filter((row) => row['type'] === 'completed'))
      .toHaveLength(kind === 'duplicate terminal' || kind === 'swallowed duplicate terminal' ? 1 : 0);
    expect(rows.filter((row) => row['type'] === 'safe_error')).toHaveLength(kind === 'safe error only' ? 1 : 0);
    expect(rows.filter((row) => row['type'] === 'non_reservation_result')).toEqual([]);
    await expectPoisonBeforeReflection(producer, f);
  });
}

it('does not mistake a JavaScript publisher return object for a durable terminal', async () => {
  const f = await makeProducerFixture(ownedRoots);
  const producer = await prepareCalibrationRuntimeEvidenceProducer(f.deps);
  const before = f.disk();
  const publisher = vi.fn(() => ({ passed: true, type: 'completed', key: f.native.key,
    journalHash: 'f'.repeat(64), terminal: { kind: 'image' } }));
  // Deliberately malformed JavaScript caller: do not weaken the real public
  // TypeScript publisher signature merely to type this negative boundary.
  const outcome = Reflect.apply(producer.runOutcome, producer, [f.native.key,
    async (caps: Readonly<CalibrationOutcomeCapabilities>) => {
      await imageVision(caps);
      return f.prediction(f.native.key);
    }, publisher]) as Promise<unknown>;
  await expect(outcome).rejects.toThrow(PRODUCER_FAILED);
  expect(publisher).toHaveBeenCalledTimes(1);
  const { after, rows } = expectStopped(f, before, 1);
  expect(after.journal).toEqual(before.journal);
  expect(rows.filter((row) => row['type'] === 'completed')).toEqual([]);
  await expectPoisonBeforeReflection(producer, f);
});

function foreignFailure(kind: 'revoked proxy' | 'forged fatal' | 'forged provider') {
  let reads = 0;
  const value = kind === 'revoked proxy' ? revokedForeign() : new Proxy({
    name: kind === 'forged fatal' ? 'CalibrationFatalError' : 'CalibrationRuntimeProviderError',
    message: 'foreign-value-must-not-be-retained', code: 'provider_request_failed',
  }, {
    get: () => { reads++; throw new Error('fixture-foreign-get'); },
    getPrototypeOf: () => { reads++; throw new Error('fixture-foreign-prototype'); },
    ownKeys: () => { reads++; throw new Error('fixture-foreign-keys'); },
    getOwnPropertyDescriptor: () => { reads++; throw new Error('fixture-foreign-descriptor'); },
  });
  return { value, reads: () => reads };
}

for (const boundary of ['factory descriptor', 'outcome descriptor', 'image', 'vision after hook',
  'snapshot', 'hook callback', 'metadata callback', 'work', 'publisher'] as const) {
  for (const kind of ['revoked proxy', 'forged fatal', 'forged provider'] as const) {
    it(`never reflects a thrown ${kind} at the ${boundary} boundary`, async () => {
      const f = await makeProducerFixture(ownedRoots, boundary === 'snapshot' ? 'benchmark' : 'preflight');
      const foreign = foreignFailure(kind);
      const key = boundary === 'snapshot'
        ? f.plan.find((row) => row.key.stage === 'benchmark' && row.scanMode === 'barcode')?.key
        : f.native.key;
      if (key === undefined) throw new Error('fixture-canonical-key-missing');
      const before = f.disk();
      let thrown: unknown;
      let rejected = false;
      if (boundary === 'factory descriptor') {
        const deps = new Proxy(f.deps, { ownKeys: () => { throw foreign.value; } });
        await prepareCalibrationRuntimeEvidenceProducer(deps).then(
          () => undefined, (error: unknown) => { rejected = true; thrown = error; });
        const readsBeforeTestInspection = foreign.reads();
        expect(readsBeforeTestInspection).toBe(0);
        expect(rejected).toBe(true);
        expect(thrown === foreign.value).toBe(false);
        expect(thrown).toMatchObject({ message: PRODUCER_FAILED });
        expect(Object.getOwnPropertyDescriptor(thrown, 'cause')).toBeUndefined();
        expect(f.disk()).toEqual(before);
        expect(f.raw.witness).toEqual({ sdk: 0, transport: 0 });
        return;
      }
      if (boundary === 'image') f.deps.loadImage = async () => { throw foreign.value; };
      if (boundary === 'vision after hook') {
        f.deps.generateVision = async (_model, _prompt, _image, _source, options) => {
          await requiredCallbacks(options).hook();
          throw foreign.value;
        };
      }
      if (boundary === 'snapshot') f.deps.lookupSnapshot = () => { throw foreign.value; };
      if (boundary === 'hook callback') {
        f.deps.ledger = { ...f.native.ledger, authorizeRuntimeRequest: (ref) => {
          f.native.ledger.authorizeRuntimeRequest(ref);
          throw foreign.value;
        } };
      }
      if (boundary === 'metadata callback') {
        f.deps.ledger = { ...f.native.ledger, pinModelVersion: (version) => {
          f.native.ledger.pinModelVersion(version);
          throw foreign.value;
        } };
      }
      const producer = await prepareCalibrationRuntimeEvidenceProducer(f.deps);
      const inputKey = boundary === 'outcome descriptor'
        ? new Proxy({ ...key }, { ownKeys: () => { throw foreign.value; } }) : key;
      const prediction = failurePrediction(key, boundary === 'snapshot' ? 'barcode' : 'meal',
        boundary === 'snapshot' ? 'product' : 'provider');
      const publish = vi.fn((...args: Parameters<typeof f.publish>) => {
        if (boundary === 'publisher') throw foreign.value;
        f.publishPrediction(...args, 'unknown', CORE_PINNED_VERSION);
      });
      const outcome = producer.runOutcome(inputKey, async (caps) => {
        if (boundary === 'snapshot') {
          try { caps.lookupSnapshot(); } catch { /* deliberately swallowed */ }
        } else {
          try { await imageVision(caps); } catch { /* only healthy post-auth raw rejection may score */ }
        }
        if (boundary === 'work') throw foreign.value;
        return prediction;
      }, publish);
      const value = await outcome.then((result) => result,
        (error: unknown) => { rejected = true; thrown = error; return undefined; });
      // Capture BEFORE matcher/error inspection, so this count measures the
      // actual component path rather than a test formatter inspecting it.
      const readsBeforeTestInspection = foreign.reads();
      expect(readsBeforeTestInspection).toBe(0);
      if (boundary === 'vision after hook') {
        // Public exception names never grant fatal/provider authority. Healthy
        // post-hook raw control flow owns this ordinary rejection allowance.
        expect(rejected).toBe(false);
        expect(value).toEqual(prediction);
        expect(publish).toHaveBeenCalledTimes(1);
        const rows = rowsAfter(f, before);
        expect(rows.filter((row) => row['type'] === 'reserved')).toHaveLength(1);
        expect(rows.filter((row) => row['type'] === 'runtime_request_authorized')).toHaveLength(1);
        expect(rows.filter((row) => row['type'] === 'runtime_operation_settled' && row['operation'] === 'vision'))
          .toEqual([expect.objectContaining({ result: 'failed' })]);
        expect(rows.filter((row) => row['type'] === 'completed')).toHaveLength(1);
        expect(rows.filter((row) => row['type'] === 'runtime_attempt_finished')).toHaveLength(1);
        expect(f.raw.witness).toEqual({ sdk: 0, transport: 0 });
      } else {
        expect(rejected).toBe(true);
        expect(thrown === foreign.value).toBe(false);
        expect(thrown).toMatchObject({ message: PRODUCER_FAILED });
        expect(Object.getOwnPropertyDescriptor(thrown, 'cause')).toBeUndefined();
        if (boundary === 'publisher') expect(publish).toHaveBeenCalledTimes(1);
        else expect(publish).not.toHaveBeenCalled();
        const sdkCalls = boundary === 'metadata callback' || boundary === 'work' || boundary === 'publisher' ? 1 : 0;
        const { after, rows } = expectStopped(f, before, sdkCalls);
        expect(after.journal).toEqual(before.journal);
        expect(rows.filter((row) => row['type'] === 'completed' || row['type'] === 'non_reservation_result'))
          .toEqual([]);
        if (boundary === 'snapshot') {
          expect(rows.filter((row) => row['type'] === 'runtime_operation_settled'))
            .toEqual([expect.objectContaining({ operation: 'snapshot', result: 'failed' })]);
          expect(f.native.ledger.getCounts().imageReserved).toBe(98);
        }
        await expectPoisonBeforeReflection(producer, f);
      }
      expect(JSON.stringify(f.disk())).not.toContain('foreign-value-must-not-be-retained');
    }, boundary === 'snapshot' ? 600000 : undefined);
  }
}

for (const resultKind of ['success', 'product failure'] as const) {
  it(`processes all12 native selected-profile barcodes with ${resultKind} and no image dispatch`, async () => {
    const f = await makeProducerFixture(ownedRoots, 'benchmark');
    const selected = f.native.ledger.getSelectedProfile();
    if (selected === undefined) throw new Error('fixture-selected-profile-missing');
    const barcodes = f.plan.filter((row) => row.key.stage === 'benchmark' && row.scanMode === 'barcode');
    expect(barcodes).toHaveLength(12);
    expect(new Set(barcodes.map((row) => row.key.profile))).toEqual(new Set([selected]));
    expect(new Set(barcodes.map((row) => row.key.caseId)).size).toBe(4);
    const producer = await prepareCalibrationRuntimeEvidenceProducer(f.deps);
    const before = f.disk();
    const beforeCounts = f.native.ledger.getCounts();
    const beforeRuntime = f.native.ledger.getRuntimeEvidenceSnapshot();
    expect(beforeCounts.imageReserved).toBe(98);
    const expectedBarcodes: string[] = [];
    for (const row of barcodes) {
      const code = f.raw.caseMetadata.get(row.key.caseId)?.barcode;
      if (code === undefined) throw new Error('fixture-committed-barcode-missing');
      expectedBarcodes.push(code);
      const prediction = resultKind === 'success' ? f.prediction(row.key)
        : failurePrediction(row.key, 'barcode', 'product');
      await expect(producer.runOutcome(row.key, async (caps) => {
        expect(caps.lookupSnapshot()).toMatchObject({ barcode: code });
        return prediction;
      }, (key, value) => f.publishPrediction(key, value, resultKind === 'success' ? 'none' : 'unknown', CORE_PINNED_VERSION)))
        .resolves.toEqual(prediction);
    }
    expect(f.raw.capturedKeys.snapshotBarcodes).toEqual(expectedBarcodes);
    expect(f.raw.capturedKeys.loadImageKeys).toEqual([]);
    expect(f.raw.sdkCalls).toEqual([]);
    expect(f.raw.witness).toEqual({ sdk: 0, transport: 0 });
    const after = f.disk();
    const rows = rowsAfter(f, before);
    expect(after.lock).toBe(before.lock);
    expect(after.journal).toEqual(before.journal);
    expect(f.native.ledger.getCounts()).toEqual(beforeCounts);
    expect(rows.map((row) => row['type'])).toEqual(Array.from({ length: 12 }, () => [
      'runtime_attempt_started', 'runtime_operation_started', 'runtime_operation_settled',
      'non_reservation_result', 'runtime_attempt_finished',
    ]).flat());
    expect(rows.filter((row) => row['type'] === 'reserved' || row['type'] === 'runtime_request_authorized'
      || row['type'] === 'model_version_pinned')).toEqual([]);
    for (const [index, planned] of barcodes.entries()) {
      const chunk = rows.slice(index * 5, index * 5 + 5);
      expect(chunk.map((event) => event['key'])).toEqual(Array.from({ length: 5 }, () => planned.key));
      expect(chunk[1]).toMatchObject({ operation: 'snapshot' });
      expect(chunk[2]).toMatchObject({ operation: 'snapshot', result: 'returned' });
      const terminal = chunk[3];
      if (terminal === undefined) throw new Error('fixture-terminal-missing');
      expect(terminal).toMatchObject({ reason: 'barcode', prediction: {
        source: 'barcode', parseStatus: resultKind === 'success' ? 'success' : 'failure',
      } });
      const digest = createHash('sha256').update(JSON.stringify({ key: terminal['key'], reason: terminal['reason'],
        prediction: terminal['prediction'], at: terminal['at'] })).digest('hex');
      expect(terminal['contentDigest']).toBe(digest);
      expect(chunk[4]).toMatchObject({ terminal: { kind: 'non_reservation',
        eventIndex: before.ledger.length + index * 5 + 4, contentDigest: digest } });
    }
    const runtime = f.native.ledger.getRuntimeEvidenceSnapshot();
    expect(runtime.activeAttempt).toBeNull();
    expect(runtime.sequence - beforeRuntime.sequence).toBe(48);
    const snapshot = f.native.ledger.getStageReportSnapshot('benchmark', selected);
    expect(snapshot.nonReservations).toHaveLength(12);
    expect(snapshot.images).toEqual([]);
    expect(snapshot.counts).toEqual({ imageCallsReserved: 0, imageCallsCompleted: 0,
      imageCallsFailed: 0, imageCallsPending: 0 });
    const beforeBlock = f.disk();
    expect(() => f.native.ledger.completeStage('benchmark', {
      stage: 'benchmark', passed: true, completedStages: ['preflight', 'development', 'validation'],
    })).toThrow('calibration:benchmark-runtime-evidence-required');
    expect(f.disk()).toEqual(beforeBlock);
  }, 600000);
}

for (const operation of ['image', 'vision'] as const) {
  it(`rejects barcode ${operation} on a genuinely executable native benchmark key`, async () => {
    const f = await makeProducerFixture(ownedRoots, 'benchmark');
    const key = f.plan.find((row) => row.key.stage === 'benchmark' && row.scanMode === 'barcode')?.key;
    if (key === undefined) throw new Error('fixture-barcode-key-missing');
    const producer = await prepareCalibrationRuntimeEvidenceProducer(f.deps);
    const before = f.disk();
    const counts = f.native.ledger.getCounts();
    const publish = vi.fn(f.publish);
    await expect(producer.runOutcome(key, async (caps) => {
      try {
        if (operation === 'image') await caps.loadImage();
        else await caps.generateVision({ prompt: 'forbidden barcode image', imageBase64: 'AQID' });
      } catch { /* deliberately swallowed */ }
      return f.prediction(key);
    }, publish)).rejects.toThrow(PRODUCER_FAILED);
    expect(publish).not.toHaveBeenCalled();
    const { after, rows } = expectStopped(f, before, 0);
    expect(rows).toEqual([expect.objectContaining({ type: 'runtime_attempt_started', key })]);
    expect(after.journal).toEqual(before.journal);
    expect(f.raw.capturedKeys.loadImageKeys).toEqual([]);
    expect(f.raw.capturedKeys.snapshotBarcodes).toEqual([]);
    expect(f.native.ledger.getCounts()).toEqual(counts);
    await expectPoisonBeforeReflection(producer, f);
  }, 600000);
}

for (const kind of ['missing product', 'repeat snapshot', 'reentrant snapshot'] as const) {
  it(`stops barcode publication for ${kind} without relabelling it an ordinary product failure`, async () => {
    const f = await makeProducerFixture(ownedRoots, 'benchmark');
    const key = f.plan.find((row) => row.key.stage === 'benchmark' && row.scanMode === 'barcode')?.key;
    if (key === undefined) throw new Error('fixture-barcode-key-missing');
    let leaked: Readonly<CalibrationOutcomeCapabilities> | undefined;
    let rawCalls = 0;
    f.deps.lookupSnapshot = (barcode) => {
      rawCalls++;
      if (kind === 'missing product') return undefined;
      if (kind === 'reentrant snapshot') {
        if (leaked === undefined) throw new Error('fixture-missing-facade');
        try { leaked.lookupSnapshot(); } catch { /* deliberately swallowed by the raw port */ }
      }
      return f.raw.deps.lookupSnapshot(barcode);
    };
    const producer = await prepareCalibrationRuntimeEvidenceProducer(f.deps);
    const before = f.disk();
    const counts = f.native.ledger.getCounts();
    const publish = vi.fn(f.publish);
    await expect(producer.runOutcome(key, async (caps) => {
      leaked = caps;
      try { caps.lookupSnapshot(); } catch { /* deliberately swallowed */ }
      if (kind === 'repeat snapshot') {
        try { caps.lookupSnapshot(); } catch { /* deliberately swallowed */ }
      }
      return failurePrediction(key, 'barcode', 'product');
    }, publish)).rejects.toThrow(PRODUCER_FAILED);
    expect(publish).not.toHaveBeenCalled();
    expect(rawCalls).toBe(1);
    const { after, rows } = expectStopped(f, before, 0);
    expect(after.journal).toEqual(before.journal);
    expect(rows.filter((row) => row['type'] === 'runtime_operation_started'))
      .toEqual([expect.objectContaining({ operation: 'snapshot' })]);
    expect(rows.filter((row) => row['type'] === 'runtime_operation_settled'))
      .toEqual(kind === 'reentrant snapshot' ? [] : [expect.objectContaining({ operation: 'snapshot', result: 'returned' })]);
    expect(rows.filter((row) => row['type'] === 'non_reservation_result')).toEqual([]);
    expect(f.native.ledger.getCounts()).toEqual(counts);
    await expectPoisonBeforeReflection(producer, f);
  }, 600000);
}

it('independently exposes two opaque SDK dispatches behind one final hook without claiming bridge instrumentation', async () => {
  const f = await makeProducerFixture(ownedRoots);
  const sdk = f.raw.client.models.generateContent;
  let firstRequest: Parameters<typeof sdk>[0] | undefined;
  f.raw.client.models.generateContent = async (request) => {
    firstRequest ??= request;
    return sdk(request);
  };
  f.deps.generateVision = async (...args) => {
    const text = await f.raw.deps.generateVision(...args);
    const request = firstRequest;
    if (request === undefined) throw new Error('fixture-first-sdk-call-missing');
    // Deliberately dishonest trusted port: replay the lower SDK call WITHOUT
    // another hook/metadata callback. The external witness sees what the
    // composition bridge cannot attest about arbitrary opaque raw code.
    await f.raw.client.models.generateContent(request);
    return text;
  };
  const producer = await prepareCalibrationRuntimeEvidenceProducer(f.deps);
  const before = f.disk();
  await expect(producer.runOutcome(f.native.key, async (caps) => {
    await imageVision(caps);
    return f.prediction(f.native.key);
  }, f.publish)).resolves.toEqual(f.prediction(f.native.key));
  const rows = rowsAfter(f, before);
  expect(f.raw.witness).toEqual({ sdk: 2, transport: 2 });
  expect(rows.filter((row) => row['type'] === 'reserved')).toHaveLength(1);
  expect(rows.filter((row) => row['type'] === 'runtime_request_authorized')).toHaveLength(1);
  expect(rows.filter((row) => row['type'] === 'runtime_attempt_finished')).toHaveLength(1);
  expect(f.native.ledger.getCounts().imageReserved).toBe(1);
  expect(f.raw.witness.sdk).not.toBe(f.native.ledger.getCounts().imageReserved);
});

it('does not invent response metadata when the real adapter receives SDK text without a version', async () => {
  const f = await makeProducerFixture(ownedRoots);
  const sdk = f.raw.client.models.generateContent;
  f.raw.client.models.generateContent = async (params) => {
    await sdk(params);
    return { text: '{"fixture":true}' };
  };
  const producer = await prepareCalibrationRuntimeEvidenceProducer(f.deps);
  const before = f.disk();
  const publish = vi.fn(f.publish);
  await expect(producer.runOutcome(f.native.key, async (caps) => {
    try { await imageVision(caps); } catch { /* deliberately swallowed */ }
    return failurePrediction(f.native.key, 'meal', 'schema');
  }, publish)).rejects.toThrow(PRODUCER_FAILED);
  expect(publish).not.toHaveBeenCalled();
  const { after, rows } = expectStopped(f, before, 1);
  expect(after.journal).toEqual(before.journal);
  expect(rows.filter((row) => row['type'] === 'reserved')).toHaveLength(1);
  expect(rows.filter((row) => row['type'] === 'runtime_request_authorized')).toHaveLength(1);
  expect(rows.filter((row) => row['type'] === 'model_version_pinned')).toEqual([]);
  expect(rows.filter((row) => row['type'] === 'runtime_operation_settled' && row['operation'] === 'vision'))
    .toEqual([]);
  await expectPoisonBeforeReflection(producer, f);
});

it('does not reuse an already returned vision operation or its metadata for a second call', async () => {
  const f = await makeProducerFixture(ownedRoots);
  const producer = await prepareCalibrationRuntimeEvidenceProducer(f.deps);
  const before = f.disk();
  const publish = vi.fn(f.publish);
  await expect(producer.runOutcome(f.native.key, async (caps) => {
    await imageVision(caps);
    try { await caps.generateVision({ prompt: 'second', imageBase64: 'AQID' }); }
    catch { /* deliberately swallowed */ }
    return f.prediction(f.native.key);
  }, publish)).rejects.toThrow(PRODUCER_FAILED);
  expect(publish).not.toHaveBeenCalled();
  const { after, rows } = expectStopped(f, before, 1);
  expect(after.journal).toEqual(before.journal);
  expect(rows.filter((row) => row['type'] === 'runtime_operation_started' && row['operation'] === 'vision'))
    .toHaveLength(1);
  expect(rows.filter((row) => row['type'] === 'runtime_operation_settled' && row['operation'] === 'vision'))
    .toEqual([expect.objectContaining({ result: 'returned' })]);
  expect(rows.filter((row) => row['type'] === 'model_version_pinned')).toHaveLength(1);
  await expectPoisonBeforeReflection(producer, f);
});
