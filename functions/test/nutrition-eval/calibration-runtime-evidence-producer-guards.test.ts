import { createHash } from 'node:crypto';
import { rmSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { JournalEntry } from '../../src/nutrition-eval/calibration';
import { captureCalibrationReportJournalEntry } from '../../src/nutrition-eval/calibration-report-journal';
import { captureCalibrationNonReservationEntry } from '../../src/nutrition-eval/calibration-report-state';
import type { CalibrationOutcomeCapabilities } from '../../src/nutrition-eval/calibration-runtime-capabilities';
import { prepareCalibrationRuntimeEvidenceProducer } from '../../src/nutrition-eval/calibration-runtime-evidence-producer';
import { buildRuntimeHarness } from './calibration-runtime-capabilities-fixtures';
import { CORE_PINNED_VERSION } from './calibration-runtime-evidence-fixtures';
import {
  buildProducerResultJournal,
  failurePrediction,
  makeProducerFixture,
} from './calibration-runtime-evidence-producer-fixtures';

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
