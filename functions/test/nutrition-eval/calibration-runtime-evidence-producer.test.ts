import { createHash } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CALIBRATION_ROOT } from '../../src/nutrition-eval/calibration';
import type { JournalEntry } from '../../src/nutrition-eval/calibration';
import { captureCalibrationReportJournalEntry } from '../../src/nutrition-eval/calibration-report-journal';
import type { RuntimeEvidenceEvent } from '../../src/nutrition-eval/calibration-runtime-evidence-codec';
import { StrictCalibrationManifestSchema } from '../../src/nutrition-eval/schema';
import { buildCoreSuccessJournal, CORE_PINNED_VERSION } from './calibration-runtime-evidence-fixtures';
import { makeProducerFixture } from './calibration-runtime-evidence-producer-fixtures';

const sdkGuard = vi.hoisted(() => ({ calls: 0 }));
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
  vi.stubGlobal('fetch', () => {
    fetchCalls++;
    throw new Error('producer-test: fetch forbidden');
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

// Break caught: losing prefix/ownership or linking finish to a nutrient hash
// instead of the complete real journal must fail before producer tests exist.
it('foundation uses native prefix and codecs', async () => {
  const f = await makeProducerFixture(ownedRoots);
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
