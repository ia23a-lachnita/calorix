/**
 * Calibration durable runtime evidence pure-state RED contract (Task 2 Step 1).
 *
 * The state module does not exist yet. Every behavior test fails at
 * dynamic-import time with a missing-module error until a worker authors
 * that source file in a later stage. Do NOT create a stub to turn any of
 * this green; the host authorizes the source worker separately after
 * witnessing this RED and freezing this file.
 *
 * Each test names the break it catches. Expectations are hand-derived from
 * locally stored validated facts (real pinned plans, existing journal and
 * non-reservation codecs), never from the state snapshot copied back as
 * expected and never from source text. A valid baseline is built before
 * each mutation. The pure seam checks closed structural coverage,
 * unchanged initial prefix, uniqueness, modalities and consistent
 * expansion; it cannot authenticate arbitrary case IDs against pinned
 * files without forbidden bootstrap/FS imports (native Task 4 derives
 * actual plans internally). Protocol facts are assumed validated by shared
 * core; the pure seam does not invent original stage/nutrient gates.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { makeRuntimeEvidenceData } from './calibration-runtime-evidence-fixtures';
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';
import {
  captureCalibrationReportJournalEntry,
  captureCalibrationReportPrediction,
} from '../../src/nutrition-eval/calibration-report-journal';
import { captureCalibrationNonReservationEvent } from '../../src/nutrition-eval/calibration-report-state';
import type { CalibrationOwner, CalibrationProfile, StageName } from '../../src/nutrition-eval/calibration';
import type {
  CalibrationNonReservationLedgerEvent,
  CalibrationReportOutcomeKey,
} from '../../src/nutrition-eval/calibration-report-state';
import type { CalibrationPublishedReportReceipt } from '../../src/nutrition-eval/calibration-report-publication';
import type { JournalEntry } from '../../src/nutrition-eval/calibration';

const sdkGuard = vi.hoisted(() => ({ constructCalls: 0 }));
const fetchGuard = vi.hoisted(() => {
  const state = { attemptCalls: 0 };
  const holder = globalThis as unknown as Record<string, unknown> & {
    __stateFetchGuard?: { original: unknown; hadOwn: boolean };
  };
  const original = (globalThis as unknown as Record<string, unknown>)['fetch'];
  const hadOwn = Object.prototype.hasOwnProperty.call(globalThis, 'fetch');
  holder.__stateFetchGuard = { original, hadOwn };
  (globalThis as unknown as Record<string, unknown>)['fetch'] = (..._args: unknown[]) => {
    state.attemptCalls += 1;
    throw new Error('state-test-guard: fetch forbidden');
  };
  return state;
});

vi.mock('@google/genai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/genai')>();
  class GuardedGoogleGenAI {
    constructor() {
      sdkGuard.constructCalls += 1;
      throw new Error('state-test-guard: GoogleGenAI construction forbidden');
    }
  }
  return { ...actual, GoogleGenAI: GuardedGoogleGenAI };
});

beforeEach(() => {
  expect(sdkGuard.constructCalls).toBe(0);
  expect(fetchGuard.attemptCalls).toBe(0);
  sdkGuard.constructCalls = 0;
  fetchGuard.attemptCalls = 0;
});

afterEach(() => {
  try {
    expect(sdkGuard.constructCalls).toBe(0);
    expect(fetchGuard.attemptCalls).toBe(0);
  } finally {
    sdkGuard.constructCalls = 0;
    fetchGuard.attemptCalls = 0;
  }
});

afterAll(() => {
  const holder = globalThis as unknown as Record<string, unknown> & {
    __stateFetchGuard?: { original: unknown; hadOwn: boolean };
  };
  const saved = holder.__stateFetchGuard;
  if (saved !== undefined) {
    if (saved.hadOwn) {
      (globalThis as unknown as Record<string, unknown>)['fetch'] = saved.original;
    } else {
      delete (globalThis as unknown as Record<string, unknown>)['fetch'];
    }
    delete holder.__stateFetchGuard;
  }
});

const EXPECTED_TRANSITION = 'calibration:runtime-evidence-transition-invalid';
const BASE_MS = Date.parse('2026-10-14T00:00:00.000Z');
const PINNED_MODEL = 'gemini-3.8-test-pin-001';

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function isoAt(offsetSeconds: number): string {
  return new Date(BASE_MS + offsetSeconds * 1000).toISOString();
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function sortedCanonical(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('nonfinite test value');
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) {
    return `[${value.map((entry) => sortedCanonical(entry)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const parts = keys.map(
      (key) => `${JSON.stringify(key)}:${sortedCanonical((value as Record<string, unknown>)[key])}`,
    );
    return `{${parts.join(',')}}`;
  }
  throw new Error('unsupported test value');
}

function isFreshTransitionFatal(error: unknown, foreign: unknown): boolean {
  if (error === foreign) return false;
  if (!(error instanceof CalibrationFatalError)) return false;
  if ((error as Error).message !== EXPECTED_TRANSITION) return false;
  if ((error as unknown as Record<string, unknown>)['cause'] !== undefined) return false;
  return true;
}

function isFreshFatalAny(error: unknown, foreign: unknown): boolean {
  if (error === foreign) return false;
  if (!(error instanceof CalibrationFatalError)) return false;
  if ((error as unknown as Record<string, unknown>)['cause'] !== undefined) return false;
  const message = (error as Error).message;
  if (message !== EXPECTED_TRANSITION && message !== 'calibration:runtime-evidence-invalid') return false;
  return true;
}

function runtimeFrame(eventIndex: number, event: unknown): Record<string, unknown> {
  return { kind: 'runtime', eventIndex, event };
}

function testOwner(base: CalibrationOwner, index: number): CalibrationOwner {
  return {
    hostname: base.hostname,
    bootId: base.bootId,
    pid: base.pid + index + 1,
    startTicks: base.startTicks + index + 1,
    acquiredAt: isoAt(5000 + index * 7),
  };
}

function makeRunId(stage: StageName, profile: CalibrationProfile, implementationCommit: string): string {
  return `calibration-${stage}-${profile.toLowerCase()}-${implementationCommit.slice(0, 12)}-20261014T000000000Z`;
}

function validReceipt(
  stage: StageName,
  profile: CalibrationProfile,
  implementationCommit: string,
): CalibrationPublishedReportReceipt {
  return {
    stage,
    profile,
    runId: makeRunId(stage, profile, implementationCommit),
    jsonSha256: 'b'.repeat(64),
    markdownSha256: 'c'.repeat(64),
  };
}

function canonicalId(key: CalibrationReportOutcomeKey): string {
  return `${key.stage}|${key.profile}|${key.caseId}|${key.sampleIndex}`;
}

function mealSuccessPrediction(sampleIndex: number, latencyMs: number): Record<string, unknown> {
  return {
    parseStatus: 'success',
    source: 'meal',
    kcal: 120,
    proteinG: 10,
    carbsG: 0,
    fatG: 8,
    confidence: 0.8,
    basis: 'portion',
    amount: 1,
    unit: 'portion',
    decision: 'needs_review',
    reviewReasons: [],
    latencyMs,
    sampleIndex,
    cached: false,
    diagnostics: {
      rawNutrients: { kcal: 120, proteinG: 10, carbsG: 0, fatG: 8 },
      detectedItemCount: 1,
      estimatedTotalMassG: 90,
      declaredBasis: 'portion',
      declaredAmount: 1,
      declaredUnit: 'portion',
    },
  };
}
function barcodeSuccessPrediction(sampleIndex: number, latencyMs: number): Record<string, unknown> {
  return {
    parseStatus: 'success',
    source: 'barcode',
    kcal: 250,
    proteinG: 5,
    carbsG: 30,
    fatG: 12,
    confidence: 0.9,
    basis: 'per100g',
    amount: 100,
    unit: 'g',
    barcode: '12345678',
    decision: 'complete',
    reviewReasons: [],
    latencyMs,
    sampleIndex,
    cached: false,
  };
}

function labelSuccessPrediction(sampleIndex: number, latencyMs: number): Record<string, unknown> {
  return {
    parseStatus: 'success',
    source: 'label',
    kcal: 180,
    proteinG: 8,
    carbsG: 22,
    fatG: 6,
    confidence: 0.85,
    basis: 'package',
    amount: 50,
    unit: 'g',
    decision: 'complete',
    reviewReasons: [],
    latencyMs,
    sampleIndex,
    cached: false,
  };
}

function datasetFailurePrediction(sampleIndex: number, latencyMs: number): Record<string, unknown> {
  return {
    parseStatus: 'failure',
    source: 'meal',
    decision: 'error',
    failureCategory: 'dataset',
    failureCode: 'dataset_load_failed',
    latencyMs,
    sampleIndex,
    cached: false,
  };
}

function providerFailurePrediction(sampleIndex: number, latencyMs: number): Record<string, unknown> {
  return {
    parseStatus: 'failure',
    source: 'meal',
    decision: 'error',
    failureCategory: 'provider',
    failureCode: 'provider_request_failed',
    latencyMs,
    sampleIndex,
    cached: false,
  };
}

function productFailurePrediction(
  sampleIndex: number,
  latencyMs: number,
  code: 'off_product_invalid' | 'off_product_not_found',
): Record<string, unknown> {
  return {
    parseStatus: 'failure',
    source: 'barcode',
    decision: 'error',
    failureCategory: 'product',
    failureCode: code,
    latencyMs,
    sampleIndex,
    cached: false,
  };
}

function schemaFailurePrediction(sampleIndex: number, latencyMs: number): Record<string, unknown> {
  return {
    parseStatus: 'failure',
    source: 'meal',
    decision: 'error',
    failureCategory: 'schema',
    failureCode: 'model_response_invalid',
    failureDetail: 'invalid_json',
    latencyMs,
    sampleIndex,
    cached: false,
  };
}

function successJournal(
  key: CalibrationReportOutcomeKey,
  version: string,
  latencyMs: number,
  prediction: Record<string, unknown>,
  four: Record<string, number>,
  withMass: boolean,
): Record<string, unknown> {
  const normalized: Record<string, unknown> = withMass
    ? { ...four, estimatedTotalMassG: 90 }
    : { ...four };
  return {
    key: { ...key },
    predictionHash: sha256Hex(JSON.stringify(four)),
    normalizedPrediction: normalized,
    analysisLatencyMs: latencyMs,
    errorCategory: 'none',
    responseModelVersion: version,
    reportPrediction: clone(prediction),
  };
}

function failureJournal(
  key: CalibrationReportOutcomeKey,
  journalError: string,
  prediction: Record<string, unknown>,
  latencyMs: number,
): Record<string, unknown> {
  return {
    key: { ...key },
    predictionHash: journalError,
    normalizedPrediction: null,
    analysisLatencyMs: latencyMs,
    errorCategory: journalError,
    responseModelVersion: 'n/a',
    reportPrediction: clone(prediction),
  };
}

function capturedJournal(entry: unknown): JournalEntry {
  return captureCalibrationReportJournalEntry(entry) as unknown as JournalEntry;
}

function journalHash(captured: unknown): string {
  return sha256Hex(JSON.stringify(captured));
}

function makeNonResEvent(
  key: CalibrationReportOutcomeKey,
  reason: 'barcode' | 'dataset',
  predictionInput: Record<string, unknown>,
  at: string,
): CalibrationNonReservationLedgerEvent {
  const capturedPrediction = captureCalibrationReportPrediction(clone(predictionInput));
  const ownedKey: CalibrationReportOutcomeKey = {
    stage: key.stage,
    profile: key.profile,
    caseId: key.caseId,
    sampleIndex: key.sampleIndex,
  };
  const digest = sha256Hex(
    JSON.stringify({ key: ownedKey, reason, prediction: capturedPrediction, at }),
  );
  const raw = {
    type: 'non_reservation_result' as const,
    key: ownedKey,
    reason,
    prediction: capturedPrediction,
    contentDigest: digest,
    at,
  };
  return captureCalibrationNonReservationEvent(clone(raw)) as unknown as CalibrationNonReservationLedgerEvent;
}
function reservedFact(eventIndex: number, key: CalibrationReportOutcomeKey): Record<string, unknown> {
  return { kind: 'reserved', eventIndex, key: clone(key) };
}

function imageTerminalFact(
  eventIndex: number,
  key: CalibrationReportOutcomeKey,
  terminalType: 'completed' | 'failed',
  journalHashValue: string,
  journal: unknown,
): Record<string, unknown> {
  return { kind: 'image_terminal', eventIndex, key: clone(key), terminalType, journalHash: journalHashValue, journal: clone(journal) };
}

function nonResFact(eventIndex: number, event: CalibrationNonReservationLedgerEvent): Record<string, unknown> {
  return { kind: 'non_reservation_result', eventIndex, event: clone(event) };
}

function modelPinnedFact(eventIndex: number, responseModelVersion: string): Record<string, unknown> {
  return { kind: 'model_version_pinned', eventIndex, responseModelVersion };
}

function profileSelectedFact(eventIndex: number, profile: CalibrationProfile): Record<string, unknown> {
  return { kind: 'profile_selected', eventIndex, profile };
}

function receiptAdmittedFact(
  eventIndex: number,
  receipt: CalibrationPublishedReportReceipt,
): Record<string, unknown> {
  return { kind: 'artifact_receipt_admitted', eventIndex, receipt: clone(receipt) };
}

function lockRecoveryFact(
  eventIndex: number,
  staleOwner: CalibrationOwner,
  recoveringOwner: CalibrationOwner,
): Record<string, unknown> {
  return { kind: 'lock_recovery', eventIndex, staleOwner: clone(staleOwner), recoveringOwner: clone(recoveringOwner) };
}

function noopFact(
  eventIndex: number,
  eventType:
    | 'token_count_reserved'
    | 'token_count_completed'
    | 'token_count_failed'
    | 'safe_error'
    | 'stage_completed',
): Record<string, unknown> {
  return { kind: 'protocol_noop', eventIndex, eventType };
}

function runtimeStart(
  key: CalibrationReportOutcomeKey,
  attempt: number,
  sequence: number,
  owner: CalibrationOwner,
  at: string,
): Record<string, unknown> {
  return { type: 'runtime_attempt_started', version: 1, sequence, owner: clone(owner), at, key: clone(key), attempt };
}

function runtimeOpStarted(
  key: CalibrationReportOutcomeKey,
  attempt: number,
  operation: 'image' | 'vision' | 'snapshot',
  sequence: number,
  owner: CalibrationOwner,
  at: string,
): Record<string, unknown> {
  return { type: 'runtime_operation_started', version: 1, sequence, owner: clone(owner), at, key: clone(key), attempt, operation };
}

function runtimeOpSettled(
  key: CalibrationReportOutcomeKey,
  attempt: number,
  operation: 'image' | 'vision' | 'snapshot',
  result: 'returned' | 'failed',
  sequence: number,
  owner: CalibrationOwner,
  at: string,
): Record<string, unknown> {
  return { type: 'runtime_operation_settled', version: 1, sequence, owner: clone(owner), at, key: clone(key), attempt, operation, result };
}

function runtimeAuthorized(
  key: CalibrationReportOutcomeKey,
  attempt: number,
  reservationEventIndex: number,
  sequence: number,
  owner: CalibrationOwner,
  at: string,
): Record<string, unknown> {
  return { type: 'runtime_request_authorized', version: 1, sequence, owner: clone(owner), at, key: clone(key), attempt, reservationEventIndex };
}

function runtimeFinished(
  key: CalibrationReportOutcomeKey,
  attempt: number,
  terminal: Record<string, unknown>,
  sequence: number,
  owner: CalibrationOwner,
  at: string,
): Record<string, unknown> {
  return { type: 'runtime_attempt_finished', version: 1, sequence, owner: clone(owner), at, key: clone(key), attempt, terminal: clone(terminal) };
}

function runtimeAbandoned(
  key: CalibrationReportOutcomeKey,
  attempt: number,
  disposition: Record<string, unknown>,
  sequence: number,
  owner: CalibrationOwner,
  at: string,
): Record<string, unknown> {
  return { type: 'runtime_attempt_abandoned', version: 1, sequence, owner: clone(owner), at, key: clone(key), attempt, disposition: clone(disposition) };
}

function runtimeBound(
  stage: StageName,
  profile: CalibrationProfile,
  receipt: CalibrationPublishedReportReceipt,
  throughSequence: number,
  bindingSha256: string,
  sequence: number,
  owner: CalibrationOwner,
  at: string,
): Record<string, unknown> {
  return { type: 'runtime_report_bound', version: 1, sequence, owner: clone(owner), at, stage, profile, receipt: clone(receipt), throughSequence, bindingSha256 };
}
async function loadStatePrepare(): Promise<(params: unknown) => {
  preview: (frame: unknown) => unknown;
  snapshot: () => Record<string, unknown>;
  pairInput: (stage: unknown, profile: unknown, through: unknown) => unknown;
}> {
  const mod = await import('../../src/nutrition-eval/calibration-runtime-evidence-state');
  const record = mod as unknown as Record<string, unknown>;
  const prepare = record['prepareCalibrationRuntimeEvidenceState'] as unknown as (
    params: unknown,
  ) => {
    preview: (frame: unknown) => unknown;
    snapshot: () => Record<string, unknown>;
    pairInput: (stage: unknown, profile: unknown, through: unknown) => unknown;
  };
  expect(typeof prepare).toBe('function');
  return prepare;
}

function previewChain(
  start: { preview: (frame: unknown) => unknown },
  frames: unknown[],
): unknown {
  let current: unknown = start;
  for (const frame of frames) {
    const state = current as { preview: (frame: unknown) => unknown };
    current = state.preview(frame);
  }
  return current;
}

function snapshotOf(state: unknown): Record<string, unknown> {
  const typed = state as { snapshot: () => Record<string, unknown> };
  return typed.snapshot() as Record<string, unknown>;
}

describe('fixture controls', () => {
  it('fixture controls pin real 50 initial and 158 expanded outcomes with 146 vision and 12 barcode', async () => {
    const f = await makeRuntimeEvidenceData();
    expect(f.plans.initial).toHaveLength(50);
    expect(f.plans.LOW).toHaveLength(158);
    expect(f.plans.MEDIUM).toHaveLength(158);
    for (const profile of ['LOW', 'MEDIUM'] as const) {
      const plan = f.plans[profile];
      expect(plan.filter((r) => r.scanMode === 'barcode')).toHaveLength(12);
      expect(plan.filter((r) => r.scanMode !== 'barcode')).toHaveLength(146);
    }
    const ids = (rows: readonly { key: CalibrationReportOutcomeKey }[]): string[] =>
      rows.map((r) => canonicalId(r.key));
    expect(ids(f.plans.LOW).slice(0, 50)).toEqual(ids(f.plans.initial));
    expect(ids(f.plans.MEDIUM).slice(0, 50)).toEqual(ids(f.plans.initial));
    expect(new Set(ids(f.plans.initial)).size).toBe(50);
    expect(sdkGuard.constructCalls).toBe(0);
    expect(fetchGuard.attemptCalls).toBe(0);
  });

  it('fixture controls prove full image-trace journals validate through existing codecs with owned hashes', async () => {
    const f = await makeRuntimeEvidenceData();
    const key = clone(f.key);
    const prediction = mealSuccessPrediction(key.sampleIndex, 17);
    const capturedPrediction = captureCalibrationReportPrediction(clone(prediction));
    expect(capturedPrediction).toEqual(prediction);
    const entry = successJournal(key, PINNED_MODEL, 17, prediction, { kcal: 120, proteinG: 10, carbsG: 0, fatG: 8 }, true);
    const captured = capturedJournal(clone(entry));
    expect(captured).toEqual(entry);
    const hash = journalHash(captured);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(sha256Hex(JSON.stringify(captured)));
    const failPrediction = providerFailurePrediction(key.sampleIndex, 9);
    const failEntry = failureJournal(key, 'unknown', failPrediction, 9);
    const capturedFail = capturedJournal(clone(failEntry));
    expect(capturedFail).toEqual(failEntry);
    expect(journalHash(capturedFail)).toMatch(/^[0-9a-f]{64}$/);
    expect(sdkGuard.constructCalls).toBe(0);
    expect(fetchGuard.attemptCalls).toBe(0);
  });

  it('fixture controls prove dataset and barcode non-reservation terminals validate with existing digests', async () => {
    const f = await makeRuntimeEvidenceData();
    const key = clone(f.key);
    const datasetPrediction = datasetFailurePrediction(key.sampleIndex, 11);
    const datasetEvent = makeNonResEvent(key, 'dataset', datasetPrediction, isoAt(21));
    expect(datasetEvent.type).toBe('non_reservation_result');
    expect(datasetEvent.contentDigest).toBe(
      sha256Hex(JSON.stringify({ key: datasetEvent.key, reason: 'dataset', prediction: datasetEvent.prediction, at: datasetEvent.at })),
    );
    const barcodePlan = f.plans.LOW.filter((r) => r.scanMode === 'barcode');
    expect(barcodePlan).toHaveLength(12);
    const firstBarcode = barcodePlan[0];
    expect(firstBarcode).toBeDefined();
    const barcodeKey = clone((firstBarcode as { key: CalibrationReportOutcomeKey }).key);
    const barcodePrediction = barcodeSuccessPrediction(barcodeKey.sampleIndex, 21);
    const barcodeEvent = makeNonResEvent(barcodeKey, 'barcode', barcodePrediction, isoAt(22));
    expect(barcodeEvent.contentDigest).toMatch(/^[0-9a-f]{64}$/);
    const productPrediction = productFailurePrediction(barcodeKey.sampleIndex, 23, 'off_product_not_found');
    const productEvent = makeNonResEvent(barcodeKey, 'barcode', productPrediction, isoAt(23));
    expect(productEvent.contentDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(sdkGuard.constructCalls).toBe(0);
    expect(fetchGuard.attemptCalls).toBe(0);
  });

  it('fixture controls prove the label helper validates through existing codecs with owned hashes', async () => {
    const f = await makeRuntimeEvidenceData();
    expect(f.plans.initial.filter((r) => r.scanMode === 'label')).toHaveLength(0);
    const labelRow = f.plans.LOW.find((r) => r.key.stage === 'benchmark' && r.scanMode === 'label');
    expect(labelRow).toBeDefined();
    if (labelRow === undefined) throw new Error('test baseline missing label row');
    const labelKey = clone(labelRow.key);
    const prediction = labelSuccessPrediction(labelKey.sampleIndex, 19);
    const capturedPrediction = captureCalibrationReportPrediction(clone(prediction));
    expect((capturedPrediction as unknown as Record<string, unknown>)['source']).toBe('label');
    expect((capturedPrediction as unknown as Record<string, unknown>)['sampleIndex']).toBe(labelKey.sampleIndex);
    const entry = successJournal(labelKey, PINNED_MODEL, 19, prediction, { kcal: 180, proteinG: 8, carbsG: 22, fatG: 6 }, false);
    const captured = capturedJournal(clone(entry));
    expect((captured.key as unknown as CalibrationReportOutcomeKey).caseId).toBe(labelKey.caseId);
    expect(captured).toEqual(entry);
    expect(journalHash(captured)).toMatch(/^[0-9a-f]{64}$/);
    expect(sdkGuard.constructCalls).toBe(0);
    expect(fetchGuard.attemptCalls).toBe(0);
  });

  it('fixture controls preserve the canonical six-field interrupted shape without fabricating a report prediction', async () => {
    const f = await makeRuntimeEvidenceData();
    const key = clone(f.key);
    const interrupted = {
      key: clone(key),
      predictionHash: 'interrupted_reservation',
      normalizedPrediction: null,
      analysisLatencyMs: 0,
      errorCategory: 'interrupted_reservation',
      responseModelVersion: 'n/a',
    };
    expect(Object.keys(interrupted).sort()).toEqual(
      ['analysisLatencyMs', 'errorCategory', 'key', 'normalizedPrediction', 'predictionHash', 'responseModelVersion'].sort(),
    );
    expect(interrupted.normalizedPrediction).toBeNull();
    const hash = sha256Hex(JSON.stringify(interrupted));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    let threw = false;
    try {
      captureCalibrationReportJournalEntry(clone(interrupted));
    } catch (error) {
      threw = error instanceof CalibrationFatalError;
    }
    expect(threw).toBe(true);
    expect(sdkGuard.constructCalls).toBe(0);
    expect(fetchGuard.attemptCalls).toBe(0);
  });

  it('fixture controls pin receipt runId grammar and twelve selected-profile barcode keys', async () => {
    const f = await makeRuntimeEvidenceData();
    const receipt = validReceipt('preflight', 'LOW', f.context.identity.implementationCommit);
    expect(receipt.runId).toBe(
      `calibration-preflight-low-${f.context.identity.implementationCommit.slice(0, 12)}-20261014T000000000Z`,
    );
    expect(receipt.runId).not.toBe('run-1');
    for (const profile of ['LOW', 'MEDIUM'] as const) {
      const barcodeKeys = f.plans[profile].filter((r) => r.scanMode === 'barcode');
      expect(barcodeKeys).toHaveLength(12);
      const ids = barcodeKeys.map((r) => canonicalId(r.key));
      expect(new Set(ids).size).toBe(12);
    }
    expect(sdkGuard.constructCalls).toBe(0);
    expect(fetchGuard.attemptCalls).toBe(0);
  });

  it('fixture controls catch malformed baselines before missing-module RED can hide them', async () => {
    const f = await makeRuntimeEvidenceData();
    const key = clone(f.key);
    const badPrediction = mealSuccessPrediction(key.sampleIndex, 17);
    (badPrediction as Record<string, unknown>)['cached'] = true;
    let threwPrediction = false;
    try {
      captureCalibrationReportPrediction(clone(badPrediction));
    } catch (error) {
      threwPrediction = error instanceof CalibrationFatalError;
    }
    expect(threwPrediction).toBe(true);
    const badJournal = successJournal(key, PINNED_MODEL, 17, mealSuccessPrediction(key.sampleIndex, 17), { kcal: 120, proteinG: 10, carbsG: 0, fatG: 8 }, true);
    (badJournal as Record<string, unknown>)['errorCategory'] = 'nope';
    let threwJournal = false;
    try {
      captureCalibrationReportJournalEntry(clone(badJournal));
    } catch (error) {
      threwJournal = error instanceof CalibrationFatalError;
    }
    expect(threwJournal).toBe(true);
    expect(sdkGuard.constructCalls).toBe(0);
    expect(fetchGuard.attemptCalls).toBe(0);
  });
});
describe('immutable preview', () => {
  it('previews without mutating the last durable state', async () => {
    const f = await makeRuntimeEvidenceData();
    const prepare = await loadStatePrepare();
    const state = prepare({ header: clone(f.header), plans: clone(f.plans) });
    const candidate = (state as unknown as { preview: (frame: unknown) => unknown }).preview(
      runtimeFrame(2, clone(f.start)),
    );
    expect(snapshotOf(state)['sequence']).toBe(0);
    expect(snapshotOf(candidate)['sequence']).toBe(1);
    expect(snapshotOf(candidate)['activeAttempt']).toEqual({ key: f.key, attempt: 1 });
  });

  it('cannot authorize a request using the header as reservation', async () => {
    const f = await makeRuntimeEvidenceData();
    const prepare = await loadStatePrepare();
    const first = (
      prepare({ header: clone(f.header), plans: clone(f.plans) }) as unknown as {
        preview: (frame: unknown) => unknown;
      }
    ).preview(runtimeFrame(2, clone(f.start)));
    const forged = {
      ...(clone(f.start) as Record<string, unknown>),
      type: 'runtime_request_authorized',
      sequence: 2,
      reservationEventIndex: 1,
    };
    let error: unknown;
    try {
      (first as { preview: (frame: unknown) => unknown }).preview(runtimeFrame(3, forged));
    } catch (cause) {
      error = cause;
    }
    expect(isFreshTransitionFatal(error, forged)).toBe(true);
  });

  it('captures header and plans as closed data with frozen owned outputs', async () => {
    const f = await makeRuntimeEvidenceData();
    const prepare = await loadStatePrepare();
    const header = clone(f.header);
    const plans = clone(f.plans);
    const state = prepare({ header, plans });
    const originalOwner = clone(header.owner);
    const originalStart = clone(f.start);
    (header as unknown as Record<string, unknown>)['type'] = 'mutated';
    (header.owner as unknown as Record<string, unknown>)['pid'] = -999;
    (plans as unknown as Record<string, unknown>)['initial'] = [];
    const snap = snapshotOf(state);
    expect(snap['sequence']).toBe(0);
    expect(snap['lastEventIndex']).toBe(1);
    expect(Object.isFrozen(snap)).toBe(true);
    expect(Object.isFrozen(snap['events'])).toBe(true);
    expect(snap['owner']).toEqual(originalOwner);
    expect(snap['activeAttempt']).toBeNull();
    const snap2 = snapshotOf(state);
    expect(snap2).toEqual(snap);
    expect(snap2 === (snap as unknown)).toBe(false);
    const afterMutation = (state as unknown as { preview: (frame: unknown) => unknown }).preview(
      runtimeFrame(2, originalStart),
    );
    expect(snapshotOf(afterMutation)['sequence']).toBe(1);
  });

  it.each([
    ['empty plans', 'empty'],
    ['short initial', 'short-initial'],
    ['short expanded', 'short-expanded'],
    ['reordered prefix', 'reordered'],
    ['duplicate key', 'duplicate'],
    ['foreign key', 'foreign'],
  ])('rejects malformed plan %s without retaining it', async (_label, kind) => {
    const f = await makeRuntimeEvidenceData();
    const prepare = await loadStatePrepare();
    const plans = clone(f.plans) as unknown as Record<string, unknown>;
    if (kind === 'empty') {
      plans['initial'] = [];
      plans['LOW'] = [];
      plans['MEDIUM'] = [];
    } else if (kind === 'short-initial') {
      plans['initial'] = (plans['initial'] as unknown[]).slice(0, 49);
    } else if (kind === 'short-expanded') {
      plans['LOW'] = (plans['LOW'] as unknown[]).slice(0, 157);
    } else if (kind === 'reordered') {
      plans['LOW'] = [...(plans['LOW'] as unknown[])].reverse();
    } else if (kind === 'duplicate') {
      const low = [...(plans['LOW'] as unknown[])];
      low[1] = clone(low[0]);
      plans['LOW'] = low;
    } else {
      const low = [...(plans['LOW'] as unknown[])];
      low[0] = { key: { stage: 'preflight', profile: 'LOW', caseId: 'forged-id', sampleIndex: 1 }, scanMode: 'meal' };
      plans['LOW'] = low;
    }
    let error: unknown;
    try {
      prepare({ header: clone(f.header), plans });
    } catch (cause) {
      error = cause;
    }
    expect(isFreshFatalAny(error, plans)).toBe(true);
  });

  it('rejects foreign reflection and revoked inputs with fresh causeless fatals', async () => {
    const f = await makeRuntimeEvidenceData();
    const prepare = await loadStatePrepare();
    const header = clone(f.header);
    const inspections = { get: 0, proto: 0, keys: 0, desc: 0 };
    const foreignThrow = new Proxy({ marker: 'foreign' }, {
      get(_target, _prop, _receiver) {
        inspections.get += 1;
        throw new Error('foreign-inspection-get');
      },
      getPrototypeOf(_target) {
        inspections.proto += 1;
        throw new Error('foreign-inspection-proto');
      },
      ownKeys(_target) {
        inspections.keys += 1;
        throw new Error('foreign-inspection-keys');
      },
      getOwnPropertyDescriptor(_target, _prop) {
        inspections.desc += 1;
        throw new Error('foreign-inspection-desc');
      },
    });
    let trapCalls = 0;
    const hostile = new Proxy(header, {
      getOwnPropertyDescriptor() {
        trapCalls += 1;
        throw foreignThrow;
      },
    });
    let first: unknown;
    try {
      prepare({ header: hostile, plans: clone(f.plans) });
    } catch (cause) {
      first = cause;
    }
    expect(isFreshFatalAny(first, hostile)).toBe(true);
    expect(first !== (foreignThrow as unknown)).toBe(true);
    expect(trapCalls).toBeGreaterThan(0);
    expect(inspections.get).toBe(0);
    expect(inspections.proto).toBe(0);
    expect(inspections.keys).toBe(0);
    expect(inspections.desc).toBe(0);
    const revoked = Proxy.revocable(clone(f.header), {});
    revoked.revoke();
    let second: unknown;
    try {
      prepare({ header: revoked.proxy, plans: clone(f.plans) });
    } catch (cause) {
      second = cause;
    }
    expect(isFreshFatalAny(second, revoked.proxy)).toBe(true);
  });

  it('rejects throwing preview frames without inspecting the foreign error', async () => {
    const f = await makeRuntimeEvidenceData();
    const prepare = await loadStatePrepare();
    const state = prepare({ header: clone(f.header), plans: clone(f.plans) });
    const inspections = { get: 0, proto: 0, keys: 0, desc: 0 };
    const foreignThrow = new Proxy({ marker: 'foreign-preview' }, {
      get(_target, _prop, _receiver) {
        inspections.get += 1;
        throw new Error('foreign-inspection-get');
      },
      getPrototypeOf(_target) {
        inspections.proto += 1;
        throw new Error('foreign-inspection-proto');
      },
      ownKeys(_target) {
        inspections.keys += 1;
        throw new Error('foreign-inspection-keys');
      },
      getOwnPropertyDescriptor(_target, _prop) {
        inspections.desc += 1;
        throw new Error('foreign-inspection-desc');
      },
    });
    let trapCalls = 0;
    const hostileEvent = new Proxy(runtimeStart(clone(f.key), 1, 1, clone(f.context.owner), isoAt(1)), {
      getOwnPropertyDescriptor() {
        trapCalls += 1;
        throw foreignThrow;
      },
    });
    const hostileFrame = { kind: 'runtime', eventIndex: 2, event: hostileEvent };
    let error: unknown;
    try {
      (state as unknown as { preview: (frame: unknown) => unknown }).preview(hostileFrame);
    } catch (cause) {
      error = cause;
    }
    expect(isFreshTransitionFatal(error, hostileFrame)).toBe(true);
    expect(error !== (foreignThrow as unknown)).toBe(true);
    expect(trapCalls).toBeGreaterThan(0);
    expect(inspections.get).toBe(0);
    expect(inspections.proto).toBe(0);
    expect(inspections.keys).toBe(0);
    expect(inspections.desc).toBe(0);
  });
});
describe('image trace', () => {
  it('completes a real image trace from attempt to finish with backward reservation reference', async () => {
    const f = await makeRuntimeEvidenceData();
    const prepare = await loadStatePrepare();
    const key = clone(f.key);
    const owner = clone(f.context.owner);
    const prediction = mealSuccessPrediction(key.sampleIndex, 17);
    const entry = successJournal(key, PINNED_MODEL, 17, prediction, { kcal: 120, proteinG: 10, carbsG: 0, fatG: 8 }, true);
    const captured = capturedJournal(clone(entry));
    const hash = journalHash(captured);
    const frames: unknown[] = [
      runtimeFrame(2, runtimeStart(key, 1, 1, owner, isoAt(1))),
      runtimeFrame(3, runtimeOpStarted(key, 1, 'image', 2, owner, isoAt(2))),
      runtimeFrame(4, runtimeOpSettled(key, 1, 'image', 'returned', 3, owner, isoAt(3))),
      runtimeFrame(5, runtimeOpStarted(key, 1, 'vision', 4, owner, isoAt(4))),
      clone(reservedFact(6, key)),
      runtimeFrame(7, runtimeAuthorized(key, 1, 6, 5, owner, isoAt(5))),
      clone(modelPinnedFact(8, PINNED_MODEL)),
      runtimeFrame(9, runtimeOpSettled(key, 1, 'vision', 'returned', 6, owner, isoAt(6))),
      clone(imageTerminalFact(10, key, 'completed', hash, captured)),
      runtimeFrame(11, runtimeFinished(key, 1, { kind: 'image', eventIndex: 10, journalHash: hash }, 7, owner, isoAt(7))),
    ];
    const state = prepare({ header: clone(f.header), plans: clone(f.plans) });
    const finalState = previewChain(state as unknown as { preview: (frame: unknown) => unknown }, frames);
    const snap = snapshotOf(finalState);
    expect(snap['sequence']).toBe(7);
    expect(snap['lastEventIndex']).toBe(11);
    expect(snap['activeAttempt']).toBeNull();
  });

  it.each([
    ['mismatch version', 'version'],
    ['blank version', 'blank'],
    ['wrong key reservation', 'wrong-key'],
    ['wrong terminal hash', 'hash'],
    ['forward terminal ref', 'forward'],
    ['duplicate reservation', 'duplicate-reservation'],
    ['duplicate terminal', 'duplicate-terminal'],
  ])('rejects image trace fault %s without a second image counter', async (_label, kind) => {
    const f = await makeRuntimeEvidenceData();
    const prepare = await loadStatePrepare();
    const key = clone(f.key);
    const owner = clone(f.context.owner);
    const prediction = mealSuccessPrediction(key.sampleIndex, 17);
    const entry = successJournal(key, PINNED_MODEL, 17, prediction, { kcal: 120, proteinG: 10, carbsG: 0, fatG: 8 }, true);
    const captured = capturedJournal(clone(entry));
    const hash = journalHash(captured);
    const pinned = kind === 'version' ? 'other-pin-001' : kind === 'blank' ? '' : PINNED_MODEL;
    const reservedKey = kind === 'wrong-key' ? { ...clone(key), caseId: 'forged-id' } : clone(key);
    const terminalHash = kind === 'hash' ? '0'.repeat(64) : hash;
    const base: unknown[] = [
      runtimeFrame(2, runtimeStart(key, 1, 1, owner, isoAt(1))),
      runtimeFrame(3, runtimeOpStarted(key, 1, 'image', 2, owner, isoAt(2))),
      runtimeFrame(4, runtimeOpSettled(key, 1, 'image', 'returned', 3, owner, isoAt(3))),
      runtimeFrame(5, runtimeOpStarted(key, 1, 'vision', 4, owner, isoAt(4))),
      clone(reservedFact(6, reservedKey as CalibrationReportOutcomeKey)),
    ];
    if (kind === 'duplicate-reservation') {
      base.push(clone(reservedFact(7, key)));
    } else if (kind === 'duplicate-terminal') {
      base.push(runtimeFrame(7, runtimeAuthorized(key, 1, 6, 5, owner, isoAt(5))));
      base.push(clone(modelPinnedFact(8, pinned)));
      base.push(runtimeFrame(9, runtimeOpSettled(key, 1, 'vision', 'returned', 6, owner, isoAt(6))));
      base.push(clone(imageTerminalFact(10, key, 'completed', hash, captured)));
      base.push(clone(imageTerminalFact(11, key, 'completed', hash, captured)));
    } else if (kind === 'forward') {
      base.push(runtimeFrame(7, runtimeAuthorized(key, 1, 6, 5, owner, isoAt(5))));
      base.push(clone(modelPinnedFact(8, pinned)));
      base.push(runtimeFrame(9, runtimeOpSettled(key, 1, 'vision', 'returned', 6, owner, isoAt(6))));
      base.push(clone(imageTerminalFact(10, key, 'completed', hash, captured)));
      base.push(runtimeFrame(11, runtimeFinished(key, 1, { kind: 'image', eventIndex: 99, journalHash: hash }, 7, owner, isoAt(7))));
    } else {
      base.push(runtimeFrame(7, runtimeAuthorized(key, 1, 6, 5, owner, isoAt(5))));
      base.push(clone(modelPinnedFact(8, pinned)));
      base.push(runtimeFrame(9, runtimeOpSettled(key, 1, 'vision', 'returned', 6, owner, isoAt(6))));
      base.push(clone(imageTerminalFact(10, key, 'completed', terminalHash, captured)));
    }
    const state = prepare({ header: clone(f.header), plans: clone(f.plans) });
    let error: unknown;
    try {
      previewChain(state as unknown as { preview: (frame: unknown) => unknown }, base);
    } catch (cause) {
      error = cause;
    }
    expect(isFreshTransitionFatal(error, base)).toBe(true);
  });
});
describe('dataset and barcode outcomes', () => {
  it('settles a dataset image-loading failure before any reservation with a real non-res terminal', async () => {
    const f = await makeRuntimeEvidenceData();
    const prepare = await loadStatePrepare();
    const key = clone(f.key);
    const owner = clone(f.context.owner);
    const prediction = datasetFailurePrediction(key.sampleIndex, 11);
    const event = makeNonResEvent(key, 'dataset', prediction, isoAt(20));
    const frames: unknown[] = [
      runtimeFrame(2, runtimeStart(key, 1, 1, owner, isoAt(1))),
      runtimeFrame(3, runtimeOpStarted(key, 1, 'image', 2, owner, isoAt(2))),
      runtimeFrame(4, runtimeOpSettled(key, 1, 'image', 'failed', 3, owner, isoAt(3))),
      clone(nonResFact(5, event)),
      runtimeFrame(6, runtimeFinished(key, 1, { kind: 'non_reservation', eventIndex: 5, contentDigest: event.contentDigest }, 4, owner, isoAt(4))),
    ];
    const state = prepare({ header: clone(f.header), plans: clone(f.plans) });
    const done = previewChain(state as unknown as { preview: (frame: unknown) => unknown }, frames);
    expect(snapshotOf(done)['sequence']).toBe(4);
  });

  it('does not fabricate an image reservation for an unrepresentable pre-reservation provider failure', async () => {
    const f = await makeRuntimeEvidenceData();
    const prepare = await loadStatePrepare();
    const key = clone(f.key);
    const owner = clone(f.context.owner);
    const prediction = providerFailurePrediction(key.sampleIndex, 9);
    const entry = failureJournal(key, 'unknown', prediction, 9);
    const captured = capturedJournal(clone(entry));
    const hash = journalHash(captured);
    const frames: unknown[] = [
      runtimeFrame(2, runtimeStart(key, 1, 1, owner, isoAt(1))),
      runtimeFrame(3, runtimeOpStarted(key, 1, 'image', 2, owner, isoAt(2))),
      runtimeFrame(4, runtimeOpSettled(key, 1, 'image', 'failed', 3, owner, isoAt(3))),
      clone(imageTerminalFact(5, key, 'failed', hash, captured)),
    ];
    const state = prepare({ header: clone(f.header), plans: clone(f.plans) });
    let error: unknown;
    try {
      previewChain(state as unknown as { preview: (frame: unknown) => unknown }, frames);
    } catch (cause) {
      error = cause;
    }
    expect(isFreshTransitionFatal(error, frames)).toBe(true);
  });

  it('settles a provider failure after authorization and a parse failure after returned vision', async () => {
    const f = await makeRuntimeEvidenceData();
    const prepare = await loadStatePrepare();
    const key = clone(f.key);
    const owner = clone(f.context.owner);
    const providerPrediction = providerFailurePrediction(key.sampleIndex, 9);
    const providerEntry = failureJournal(key, 'unknown', providerPrediction, 9);
    const providerCaptured = capturedJournal(clone(providerEntry));
    const providerHash = journalHash(providerCaptured);
    const providerFrames: unknown[] = [
      runtimeFrame(2, runtimeStart(key, 1, 1, owner, isoAt(1))),
      runtimeFrame(3, runtimeOpStarted(key, 1, 'image', 2, owner, isoAt(2))),
      runtimeFrame(4, runtimeOpSettled(key, 1, 'image', 'returned', 3, owner, isoAt(3))),
      runtimeFrame(5, runtimeOpStarted(key, 1, 'vision', 4, owner, isoAt(4))),
      clone(reservedFact(6, key)),
      runtimeFrame(7, runtimeAuthorized(key, 1, 6, 5, owner, isoAt(5))),
      clone(modelPinnedFact(8, PINNED_MODEL)),
      runtimeFrame(9, runtimeOpSettled(key, 1, 'vision', 'failed', 6, owner, isoAt(6))),
      clone(imageTerminalFact(10, key, 'failed', providerHash, providerCaptured)),
      runtimeFrame(11, runtimeFinished(key, 1, { kind: 'image', eventIndex: 10, journalHash: providerHash }, 7, owner, isoAt(7))),
    ];
    const first = prepare({ header: clone(f.header), plans: clone(f.plans) });
    const doneProvider = previewChain(first as unknown as { preview: (frame: unknown) => unknown }, providerFrames);
    expect(snapshotOf(doneProvider)['sequence']).toBe(7);
    const schemaPrediction = schemaFailurePrediction(key.sampleIndex, 13);
    const schemaEntry = failureJournal(key, 'unknown', schemaPrediction, 13);
    const schemaCaptured = capturedJournal(clone(schemaEntry));
    const schemaHash = journalHash(schemaCaptured);
    const schemaFrames: unknown[] = [
      runtimeFrame(2, runtimeStart(key, 1, 1, owner, isoAt(11))),
      runtimeFrame(3, runtimeOpStarted(key, 1, 'image', 2, owner, isoAt(12))),
      runtimeFrame(4, runtimeOpSettled(key, 1, 'image', 'returned', 3, owner, isoAt(13))),
      runtimeFrame(5, runtimeOpStarted(key, 1, 'vision', 4, owner, isoAt(14))),
      clone(reservedFact(6, key)),
      runtimeFrame(7, runtimeAuthorized(key, 1, 6, 5, owner, isoAt(15))),
      clone(modelPinnedFact(8, PINNED_MODEL)),
      runtimeFrame(9, runtimeOpSettled(key, 1, 'vision', 'returned', 6, owner, isoAt(16))),
      clone(imageTerminalFact(10, key, 'failed', schemaHash, schemaCaptured)),
      runtimeFrame(11, runtimeFinished(key, 1, { kind: 'image', eventIndex: 10, journalHash: schemaHash }, 7, owner, isoAt(17))),
    ];
    const second = prepare({ header: clone(f.header), plans: clone(f.plans) });
    const doneSchema = previewChain(second as unknown as { preview: (frame: unknown) => unknown }, schemaFrames);
    expect(snapshotOf(doneSchema)['sequence']).toBe(7);
  });

  it('permits snapshot returned success for LOW and snapshot failed product failure for MEDIUM barcode keys', async () => {
    const f = await makeRuntimeEvidenceData();
    const prepare = await loadStatePrepare();
    expect(f.plans.initial.filter((r) => r.scanMode !== 'meal')).toHaveLength(0);
    const lowRows = f.plans.LOW.filter((r) => r.scanMode === 'barcode');
    const mediumRows = f.plans.MEDIUM.filter((r) => r.scanMode === 'barcode');
    expect(lowRows).toHaveLength(12);
    expect(mediumRows).toHaveLength(12);
    const lowRow = lowRows[0];
    const mediumRow = mediumRows[0];
    expect(lowRow).toBeDefined();
    expect(mediumRow).toBeDefined();
    const lowKey = clone((lowRow as { key: CalibrationReportOutcomeKey }).key);
    const mediumKey = clone((mediumRow as { key: CalibrationReportOutcomeKey }).key);
    const owner = clone(f.context.owner);
    const lowPrediction = barcodeSuccessPrediction(lowKey.sampleIndex, 21);
    const lowEvent = makeNonResEvent(lowKey, 'barcode', lowPrediction, isoAt(30));
    const lowFrames: unknown[] = [
      clone(profileSelectedFact(2, 'LOW')),
      runtimeFrame(3, runtimeStart(lowKey, 1, 1, owner, isoAt(1))),
      runtimeFrame(4, runtimeOpStarted(lowKey, 1, 'snapshot', 2, owner, isoAt(2))),
      runtimeFrame(5, runtimeOpSettled(lowKey, 1, 'snapshot', 'returned', 3, owner, isoAt(3))),
      clone(nonResFact(6, lowEvent)),
      runtimeFrame(7, runtimeFinished(lowKey, 1, { kind: 'non_reservation', eventIndex: 6, contentDigest: lowEvent.contentDigest }, 4, owner, isoAt(4))),
    ];
    const lowState = prepare({ header: clone(f.header), plans: clone(f.plans) });
    const lowDone = previewChain(lowState as unknown as { preview: (frame: unknown) => unknown }, lowFrames);
    expect(snapshotOf(lowDone)['sequence']).toBe(4);
    expect(snapshotOf(lowDone)['lastEventIndex']).toBe(7);
    const mediumPrediction = productFailurePrediction(mediumKey.sampleIndex, 23, 'off_product_not_found');
    const mediumEvent = makeNonResEvent(mediumKey, 'barcode', mediumPrediction, isoAt(31));
    const mediumFrames: unknown[] = [
      clone(profileSelectedFact(2, 'MEDIUM')),
      runtimeFrame(3, runtimeStart(mediumKey, 1, 1, owner, isoAt(11))),
      runtimeFrame(4, runtimeOpStarted(mediumKey, 1, 'snapshot', 2, owner, isoAt(12))),
      runtimeFrame(5, runtimeOpSettled(mediumKey, 1, 'snapshot', 'failed', 3, owner, isoAt(13))),
      clone(nonResFact(6, mediumEvent)),
      runtimeFrame(7, runtimeFinished(mediumKey, 1, { kind: 'non_reservation', eventIndex: 6, contentDigest: mediumEvent.contentDigest }, 4, owner, isoAt(14))),
    ];
    const mediumState = prepare({ header: clone(f.header), plans: clone(f.plans) });
    const mediumDone = previewChain(mediumState as unknown as { preview: (frame: unknown) => unknown }, mediumFrames);
    expect(snapshotOf(mediumDone)['sequence']).toBe(4);
    const successPrediction = barcodeSuccessPrediction(mediumKey.sampleIndex, 25);
    const successEvent = makeNonResEvent(mediumKey, 'barcode', successPrediction, isoAt(32));
    const badState = prepare({ header: clone(f.header), plans: clone(f.plans) });
    let successAfterFailed: unknown;
    try {
      previewChain(badState as unknown as { preview: (frame: unknown) => unknown }, [
        clone(profileSelectedFact(2, 'MEDIUM')),
        runtimeFrame(3, runtimeStart(mediumKey, 1, 1, owner, isoAt(21))),
        runtimeFrame(4, runtimeOpStarted(mediumKey, 1, 'snapshot', 2, owner, isoAt(22))),
        runtimeFrame(5, runtimeOpSettled(mediumKey, 1, 'snapshot', 'failed', 3, owner, isoAt(23))),
        clone(nonResFact(6, successEvent)),
        runtimeFrame(7, runtimeFinished(mediumKey, 1, { kind: 'non_reservation', eventIndex: 6, contentDigest: successEvent.contentDigest }, 4, owner, isoAt(24))),
      ]);
    } catch (cause) {
      successAfterFailed = cause;
    }
    expect(isFreshTransitionFatal(successAfterFailed, mediumKey)).toBe(true);
  });

  it('settles a barcode product failure after snapshot returned without a return-success bijection', async () => {
    const f = await makeRuntimeEvidenceData();
    const prepare = await loadStatePrepare();
    const mediumRows = f.plans.MEDIUM.filter((r) => r.scanMode === 'barcode');
    expect(mediumRows).toHaveLength(12);
    const row = mediumRows[1];
    expect(row).toBeDefined();
    const barcodeKey = clone((row as { key: CalibrationReportOutcomeKey }).key);
    const owner = clone(f.context.owner);
    const prediction = productFailurePrediction(barcodeKey.sampleIndex, 27, 'off_product_invalid');
    const event = makeNonResEvent(barcodeKey, 'barcode', prediction, isoAt(33));
    const frames: unknown[] = [
      clone(profileSelectedFact(2, 'MEDIUM')),
      runtimeFrame(3, runtimeStart(barcodeKey, 1, 1, owner, isoAt(1))),
      runtimeFrame(4, runtimeOpStarted(barcodeKey, 1, 'snapshot', 2, owner, isoAt(2))),
      runtimeFrame(5, runtimeOpSettled(barcodeKey, 1, 'snapshot', 'returned', 3, owner, isoAt(3))),
      clone(nonResFact(6, event)),
      runtimeFrame(7, runtimeFinished(barcodeKey, 1, { kind: 'non_reservation', eventIndex: 6, contentDigest: event.contentDigest }, 4, owner, isoAt(4))),
    ];
    const state = prepare({ header: clone(f.header), plans: clone(f.plans) });
    const done = previewChain(state as unknown as { preview: (frame: unknown) => unknown }, frames);
    expect(snapshotOf(done)['sequence']).toBe(4);
  });

  it('rejects image, vision, reservation and authorization for all twelve selected-profile barcode keys', async () => {
    const f = await makeRuntimeEvidenceData();
    const prepare = await loadStatePrepare();
    for (const profile of ['LOW', 'MEDIUM'] as const) {
      const barcodeKeys = f.plans[profile].filter((r) => r.scanMode === 'barcode').map((r) => clone(r.key));
      expect(barcodeKeys).toHaveLength(12);
      for (const barcodeKey of barcodeKeys) {
        const owner = clone(f.context.owner);
        const variants: unknown[][] = [
          [runtimeFrame(4, runtimeOpStarted(barcodeKey, 1, 'image', 2, owner, isoAt(2)))],
          [runtimeFrame(4, runtimeOpStarted(barcodeKey, 1, 'vision', 2, owner, isoAt(2)))],
          [clone(reservedFact(4, barcodeKey))],
          [runtimeFrame(4, runtimeAuthorized(barcodeKey, 1, 3, 2, owner, isoAt(2)))],
        ];
        for (const extra of variants) {
          const state = prepare({ header: clone(f.header), plans: clone(f.plans) });
          let error: unknown;
          try {
            previewChain(state as unknown as { preview: (frame: unknown) => unknown }, [
              clone(profileSelectedFact(2, profile)),
              runtimeFrame(3, runtimeStart(barcodeKey, 1, 1, owner, isoAt(1))),
              ...extra,
            ]);
          } catch (cause) {
            error = cause;
          }
          expect(isFreshTransitionFatal(error, barcodeKey)).toBe(true);
        }
      }
    }
  });

  it('rejects unselected-profile keys and gates the expanded plan behind profile selection', async () => {
    const f = await makeRuntimeEvidenceData();
    const prepare = await loadStatePrepare();
    const owner = clone(f.context.owner);
    const benchmarkLow = f.plans.LOW.find((r) => r.key.stage === 'benchmark');
    expect(benchmarkLow).toBeDefined();
    const lowKey = clone((benchmarkLow as { key: CalibrationReportOutcomeKey }).key);
    const unselected = prepare({ header: clone(f.header), plans: clone(f.plans) });
    let missingSelection: unknown;
    try {
      (unselected as unknown as { preview: (frame: unknown) => unknown }).preview(
        runtimeFrame(2, runtimeStart(lowKey, 1, 1, owner, isoAt(1))),
      );
    } catch (cause) {
      missingSelection = cause;
    }
    expect(isFreshTransitionFatal(missingSelection, lowKey)).toBe(true);
    const mediumBenchmark = f.plans.MEDIUM.find((r) => r.key.stage === 'benchmark');
    expect(mediumBenchmark).toBeDefined();
    const mediumKey = clone((mediumBenchmark as { key: CalibrationReportOutcomeKey }).key);
    const wrongProfile = prepare({ header: clone(f.header), plans: clone(f.plans) });
    let wrongError: unknown;
    try {
      previewChain(wrongProfile as unknown as { preview: (frame: unknown) => unknown }, [
        clone(profileSelectedFact(2, 'LOW')),
        runtimeFrame(3, runtimeStart(mediumKey, 1, 1, owner, isoAt(1))),
      ]);
    } catch (cause) {
      wrongError = cause;
    }
    expect(isFreshTransitionFatal(wrongError, mediumKey)).toBe(true);
  });

  it('completes a selected benchmark label image trace with a real label prediction', async () => {
    const f = await makeRuntimeEvidenceData();
    const prepare = await loadStatePrepare();
    expect(f.plans.initial.filter((r) => r.scanMode === 'label')).toHaveLength(0);
    expect(f.plans.initial.filter((r) => r.scanMode === 'barcode')).toHaveLength(0);
    const labelRow = f.plans.LOW.find((r) => r.key.stage === 'benchmark' && r.scanMode === 'label');
    expect(labelRow).toBeDefined();
    const key = clone((labelRow as { key: CalibrationReportOutcomeKey }).key);
    const owner = clone(f.context.owner);
    const prediction = labelSuccessPrediction(key.sampleIndex, 19);
    const entry = successJournal(key, PINNED_MODEL, 19, prediction, { kcal: 180, proteinG: 8, carbsG: 22, fatG: 6 }, false);
    const captured = capturedJournal(clone(entry));
    const hash = journalHash(captured);
    const frames: unknown[] = [
      clone(profileSelectedFact(2, 'LOW')),
      runtimeFrame(3, runtimeStart(key, 1, 1, owner, isoAt(1))),
      runtimeFrame(4, runtimeOpStarted(key, 1, 'image', 2, owner, isoAt(2))),
      runtimeFrame(5, runtimeOpSettled(key, 1, 'image', 'returned', 3, owner, isoAt(3))),
      runtimeFrame(6, runtimeOpStarted(key, 1, 'vision', 4, owner, isoAt(4))),
      clone(reservedFact(7, key)),
      runtimeFrame(8, runtimeAuthorized(key, 1, 7, 5, owner, isoAt(5))),
      clone(modelPinnedFact(9, PINNED_MODEL)),
      runtimeFrame(10, runtimeOpSettled(key, 1, 'vision', 'returned', 6, owner, isoAt(6))),
      clone(imageTerminalFact(11, key, 'completed', hash, captured)),
      runtimeFrame(12, runtimeFinished(key, 1, { kind: 'image', eventIndex: 11, journalHash: hash }, 7, owner, isoAt(7))),
    ];
    const state = prepare({ header: clone(f.header), plans: clone(f.plans) });
    const done = previewChain(state as unknown as { preview: (frame: unknown) => unknown }, frames);
    expect(snapshotOf(done)['sequence']).toBe(7);
    expect(snapshotOf(done)['lastEventIndex']).toBe(12);
  });
});
describe('single active attempt and ordering', () => {
  it('enforces one global active attempt and rejects concurrent operations', async () => {
    const f = await makeRuntimeEvidenceData();
    const prepare = await loadStatePrepare();
    const key = clone(f.key);
    const owner = clone(f.context.owner);
    const otherRow = f.plans.initial.find((r) => r.key.stage === 'development' && r.key.profile === 'LOW');
    expect(otherRow).toBeDefined();
    const otherKey = clone((otherRow as { key: CalibrationReportOutcomeKey }).key);
    const state = prepare({ header: clone(f.header), plans: clone(f.plans) });
    const opened = previewChain(state as unknown as { preview: (frame: unknown) => unknown }, [
      runtimeFrame(2, runtimeStart(key, 1, 1, owner, isoAt(1))),
    ]);
    let concurrent: unknown;
    try {
      (opened as { preview: (frame: unknown) => unknown }).preview(runtimeFrame(3, runtimeStart(otherKey, 1, 2, owner, isoAt(2))));
    } catch (cause) {
      concurrent = cause;
    }
    expect(isFreshTransitionFatal(concurrent, otherKey)).toBe(true);
    let duplicateOp: unknown;
    try {
      const withImage = (opened as { preview: (frame: unknown) => unknown }).preview(
        runtimeFrame(3, runtimeOpStarted(key, 1, 'image', 2, owner, isoAt(2))),
      );
      (withImage as { preview: (frame: unknown) => unknown }).preview(
        runtimeFrame(4, runtimeOpStarted(key, 1, 'image', 3, owner, isoAt(3))),
      );
    } catch (cause) {
      duplicateOp = cause;
    }
    expect(isFreshTransitionFatal(duplicateOp, key)).toBe(true);
  });

  it.each([
    ['settlement without start', 'no-start'],
    ['wrong order vision before image', 'order'],
    ['duplicate finish', 'dup-finish'],
    ['stale ref', 'stale'],
    ['mismatched attempt', 'attempt'],
    ['mismatched key', 'key'],
    ['mismatched owner', 'owner'],
  ])('rejects ordering fault %s', async (_label, kind) => {
    const f = await makeRuntimeEvidenceData();
    const prepare = await loadStatePrepare();
    const key = clone(f.key);
    const owner = clone(f.context.owner);
    const otherOwner = testOwner(owner, 9);
    const state = prepare({ header: clone(f.header), plans: clone(f.plans) });
    let frames: unknown[];
    if (kind === 'no-start') {
      frames = [runtimeFrame(2, runtimeOpSettled(key, 1, 'image', 'returned', 1, owner, isoAt(1)))];
    } else if (kind === 'order') {
      frames = [
        runtimeFrame(2, runtimeStart(key, 1, 1, owner, isoAt(1))),
        runtimeFrame(3, runtimeOpStarted(key, 1, 'vision', 2, owner, isoAt(2))),
      ];
    } else if (kind === 'dup-finish') {
      const prediction = mealSuccessPrediction(key.sampleIndex, 17);
      const captured = capturedJournal(clone(successJournal(key, PINNED_MODEL, 17, prediction, { kcal: 120, proteinG: 10, carbsG: 0, fatG: 8 }, true)));
      const hash = journalHash(captured);
      frames = [
        runtimeFrame(2, runtimeStart(key, 1, 1, owner, isoAt(1))),
        runtimeFrame(3, runtimeOpStarted(key, 1, 'image', 2, owner, isoAt(2))),
        runtimeFrame(4, runtimeOpSettled(key, 1, 'image', 'returned', 3, owner, isoAt(3))),
        runtimeFrame(5, runtimeOpStarted(key, 1, 'vision', 4, owner, isoAt(4))),
        clone(reservedFact(6, key)),
        runtimeFrame(7, runtimeAuthorized(key, 1, 6, 5, owner, isoAt(5))),
        clone(modelPinnedFact(8, PINNED_MODEL)),
        runtimeFrame(9, runtimeOpSettled(key, 1, 'vision', 'returned', 6, owner, isoAt(6))),
        clone(imageTerminalFact(10, key, 'completed', hash, captured)),
        runtimeFrame(11, runtimeFinished(key, 1, { kind: 'image', eventIndex: 10, journalHash: hash }, 7, owner, isoAt(7))),
        runtimeFrame(12, runtimeFinished(key, 1, { kind: 'image', eventIndex: 10, journalHash: hash }, 8, owner, isoAt(8))),
      ];
    } else if (kind === 'stale') {
      frames = [
        runtimeFrame(2, runtimeStart(key, 1, 1, owner, isoAt(1))),
        runtimeFrame(3, runtimeOpSettled(key, 2, 'image', 'returned', 2, owner, isoAt(2))),
      ];
    } else if (kind === 'attempt') {
      frames = [
        runtimeFrame(2, runtimeStart(key, 1, 1, owner, isoAt(1))),
        runtimeFrame(3, runtimeOpStarted(key, 2, 'image', 2, owner, isoAt(2))),
      ];
    } else if (kind === 'key') {
      const forged = { ...clone(key), caseId: 'forged-id' };
      frames = [
        runtimeFrame(2, runtimeStart(key, 1, 1, owner, isoAt(1))),
        runtimeFrame(3, runtimeOpStarted(forged as CalibrationReportOutcomeKey, 1, 'image', 2, owner, isoAt(2))),
      ];
    } else {
      frames = [
        runtimeFrame(2, runtimeStart(key, 1, 1, owner, isoAt(1))),
        runtimeFrame(3, runtimeOpStarted(key, 1, 'image', 2, otherOwner, isoAt(2))),
      ];
    }
    let error: unknown;
    try {
      previewChain(state as unknown as { preview: (frame: unknown) => unknown }, frames);
    } catch (cause) {
      error = cause;
    }
    expect(isFreshTransitionFatal(error, frames)).toBe(true);
  });

  it.each([
    ['duplicate index', 'dup-index'],
    ['gapped index', 'gap-index'],
    ['duplicate sequence', 'dup-seq'],
    ['gapped sequence', 'gap-seq'],
  ])('rejects ledger shape %s', async (_label, kind) => {
    const f = await makeRuntimeEvidenceData();
    const prepare = await loadStatePrepare();
    const key = clone(f.key);
    const owner = clone(f.context.owner);
    const state = prepare({ header: clone(f.header), plans: clone(f.plans) });
    let frames: unknown[];
    if (kind === 'dup-index') {
      frames = [
        runtimeFrame(2, runtimeStart(key, 1, 1, owner, isoAt(1))),
        runtimeFrame(2, runtimeOpStarted(key, 1, 'image', 2, owner, isoAt(2))),
      ];
    } else if (kind === 'gap-index') {
      frames = [
        runtimeFrame(2, runtimeStart(key, 1, 1, owner, isoAt(1))),
        runtimeFrame(4, runtimeOpStarted(key, 1, 'image', 2, owner, isoAt(2))),
      ];
    } else if (kind === 'dup-seq') {
      frames = [
        runtimeFrame(2, runtimeStart(key, 1, 1, owner, isoAt(1))),
        runtimeFrame(3, runtimeOpStarted(key, 1, 'image', 1, owner, isoAt(2))),
      ];
    } else {
      frames = [
        runtimeFrame(2, runtimeStart(key, 1, 1, owner, isoAt(1))),
        runtimeFrame(3, runtimeOpStarted(key, 1, 'image', 3, owner, isoAt(2))),
      ];
    }
    let error: unknown;
    try {
      previewChain(state as unknown as { preview: (frame: unknown) => unknown }, frames);
    } catch (cause) {
      error = cause;
    }
    expect(isFreshTransitionFatal(error, frames)).toBe(true);
  });

  it('never turns a returned port into parsed success and advances protocol facts without runtime sequence', async () => {
    const f = await makeRuntimeEvidenceData();
    const prepare = await loadStatePrepare();
    const key = clone(f.key);
    const owner = clone(f.context.owner);
    const state = prepare({ header: clone(f.header), plans: clone(f.plans) });
    const afterRuntime = previewChain(state as unknown as { preview: (frame: unknown) => unknown }, [
      runtimeFrame(2, runtimeStart(key, 1, 1, owner, isoAt(1))),
    ]);
    const beforeSeq = snapshotOf(afterRuntime)['sequence'];
    const afterNoop = (afterRuntime as { preview: (frame: unknown) => unknown }).preview(clone(noopFact(3, 'token_count_reserved')));
    expect(snapshotOf(afterNoop)['sequence']).toBe(beforeSeq);
    expect(snapshotOf(afterNoop)['lastEventIndex']).toBe(3);
    let error: unknown;
    try {
      (afterRuntime as { preview: (frame: unknown) => unknown }).preview(
        runtimeFrame(3, runtimeFinished(key, 1, { kind: 'image', eventIndex: 99, journalHash: 'a'.repeat(64) }, 2, owner, isoAt(2))),
      );
    } catch (cause) {
      error = cause;
    }
    expect(isFreshTransitionFatal(error, key)).toBe(true);
  });

  it.each([
    ['token_count_reserved', 'token_count_reserved'],
    ['token_count_completed', 'token_count_completed'],
    ['token_count_failed', 'token_count_failed'],
    ['safe_error', 'safe_error'],
    ['stage_completed', 'stage_completed'],
  ])('accepts already-validated noop %s', async (_label, eventType) => {
    const f = await makeRuntimeEvidenceData();
    const prepare = await loadStatePrepare();
    const state = prepare({ header: clone(f.header), plans: clone(f.plans) });
    const next = (state as unknown as { preview: (frame: unknown) => unknown }).preview(
      clone(noopFact(2, eventType as 'token_count_reserved' | 'token_count_completed' | 'token_count_failed' | 'safe_error' | 'stage_completed')),
    );
    expect(snapshotOf(next)['lastEventIndex']).toBe(2);
  });

  it('rejects arbitrary new legacy events through protocol_noop', async () => {
    const f = await makeRuntimeEvidenceData();
    const prepare = await loadStatePrepare();
    const state = prepare({ header: clone(f.header), plans: clone(f.plans) });
    let error: unknown;
    try {
      (state as unknown as { preview: (frame: unknown) => unknown }).preview(
        clone({ kind: 'protocol_noop', eventIndex: 2, eventType: 'reserved' }),
      );
    } catch (cause) {
      error = cause;
    }
    expect(isFreshTransitionFatal(error, state)).toBe(true);
  });
});
describe('recovery matrix', () => {
  it('recovers no-attempt history by scheduling under existing gates', async () => {
    const f = await makeRuntimeEvidenceData();
    const prepare = await loadStatePrepare();
    const key = clone(f.key);
    const owner = clone(f.context.owner);
    const state = prepare({ header: clone(f.header), plans: clone(f.plans) });
    const next = (state as unknown as { preview: (frame: unknown) => unknown }).preview(
      runtimeFrame(2, runtimeStart(key, 1, 1, owner, isoAt(1))),
    );
    expect(snapshotOf(next)['activeAttempt']).toEqual({ key, attempt: 1 });
  });

  it('abandons an unreserved vision intent without reserving and requires a new epoch for the next attempt', async () => {
    const f = await makeRuntimeEvidenceData();
    const prepare = await loadStatePrepare();
    const key = clone(f.key);
    const owner = clone(f.context.owner);
    const recovered = testOwner(owner, 1);
    const frames: unknown[] = [
      runtimeFrame(2, runtimeStart(key, 1, 1, owner, isoAt(1))),
      runtimeFrame(3, runtimeOpStarted(key, 1, 'image', 2, owner, isoAt(2))),
      runtimeFrame(4, runtimeOpSettled(key, 1, 'image', 'returned', 3, owner, isoAt(3))),
      runtimeFrame(5, runtimeOpStarted(key, 1, 'vision', 4, owner, isoAt(4))),
      clone(lockRecoveryFact(6, owner, recovered)),
      runtimeFrame(7, runtimeAbandoned(key, 1, { kind: 'unreserved_interruption' }, 5, recovered, isoAt(5))),
      runtimeFrame(8, runtimeStart(key, 2, 6, recovered, isoAt(6))),
    ];
    const state = prepare({ header: clone(f.header), plans: clone(f.plans) });
    const done = previewChain(state as unknown as { preview: (frame: unknown) => unknown }, frames);
    expect(snapshotOf(done)['activeAttempt']).toEqual({ key, attempt: 2 });
    expect(snapshotOf(done)['sequence']).toBe(6);
    expect(snapshotOf(done)['lastEventIndex']).toBe(8);
    const stale = prepare({ header: clone(f.header), plans: clone(f.plans) });
    let error: unknown;
    try {
      previewChain(stale as unknown as { preview: (frame: unknown) => unknown }, [
        runtimeFrame(2, runtimeStart(key, 1, 1, owner, isoAt(1))),
        runtimeFrame(3, runtimeOpStarted(key, 1, 'image', 2, owner, isoAt(2))),
        runtimeFrame(4, runtimeOpSettled(key, 1, 'image', 'returned', 3, owner, isoAt(3))),
        runtimeFrame(5, runtimeAbandoned(key, 1, { kind: 'unreserved_interruption' }, 4, owner, isoAt(4))),
        runtimeFrame(6, runtimeStart(key, 2, 5, owner, isoAt(5))),
      ]);
    } catch (cause) {
      error = cause;
    }
    expect(isFreshTransitionFatal(error, key)).toBe(true);
  });

  it('never resumes a reserved unfinished key and requires the canonical interrupted terminal before reserved abandonment', async () => {
    const f = await makeRuntimeEvidenceData();
    const prepare = await loadStatePrepare();
    const key = clone(f.key);
    const owner = clone(f.context.owner);
    const recovered = testOwner(owner, 2);
    const interrupted = {
      key: clone(key),
      predictionHash: 'interrupted_reservation',
      normalizedPrediction: null,
      analysisLatencyMs: 0,
      errorCategory: 'interrupted_reservation',
      responseModelVersion: 'n/a',
    };
    const interruptedHash = sha256Hex(JSON.stringify(interrupted));
    const state = prepare({ header: clone(f.header), plans: clone(f.plans) });
    const reserved: unknown[] = [
      runtimeFrame(2, runtimeStart(key, 1, 1, owner, isoAt(1))),
      runtimeFrame(3, runtimeOpStarted(key, 1, 'image', 2, owner, isoAt(2))),
      runtimeFrame(4, runtimeOpSettled(key, 1, 'image', 'returned', 3, owner, isoAt(3))),
      runtimeFrame(5, runtimeOpStarted(key, 1, 'vision', 4, owner, isoAt(4))),
      clone(reservedFact(6, key)),
    ];
    const mid = previewChain(state as unknown as { preview: (frame: unknown) => unknown }, reserved);
    let resumeError: unknown;
    try {
      (mid as { preview: (frame: unknown) => unknown }).preview(
        runtimeFrame(7, runtimeStart(key, 1, 2, owner, isoAt(5))),
      );
    } catch (cause) {
      resumeError = cause;
    }
    expect(isFreshTransitionFatal(resumeError, key)).toBe(true);
    let missingTerminal: unknown;
    try {
      previewChain(state as unknown as { preview: (frame: unknown) => unknown }, [
        ...reserved.map((frame) => clone(frame)),
        clone(lockRecoveryFact(7, owner, recovered)),
        runtimeFrame(8, runtimeAbandoned(key, 1, { kind: 'reserved_interruption', terminal: { kind: 'image', eventIndex: 99, journalHash: interruptedHash } }, 5, recovered, isoAt(5))),
      ]);
    } catch (cause) {
      missingTerminal = cause;
    }
    expect(isFreshTransitionFatal(missingTerminal, interrupted)).toBe(true);
    const valid = previewChain(state as unknown as { preview: (frame: unknown) => unknown }, [
      ...reserved.map((frame) => clone(frame)),
      clone(lockRecoveryFact(7, owner, recovered)),
      clone(imageTerminalFact(8, key, 'failed', interruptedHash, interrupted)),
      runtimeFrame(9, runtimeAbandoned(key, 1, { kind: 'reserved_interruption', terminal: { kind: 'image', eventIndex: 8, journalHash: interruptedHash } }, 5, recovered, isoAt(5))),
    ]);
    expect(snapshotOf(valid)['sequence']).toBe(5);
    expect(snapshotOf(valid)['activeAttempt']).toBeNull();
    let consumedError: unknown;
    try {
      (valid as { preview: (frame: unknown) => unknown }).preview(
        runtimeFrame(10, runtimeStart(key, 2, 6, recovered, isoAt(6))),
      );
    } catch (cause) {
      consumedError = cause;
    }
    expect(isFreshTransitionFatal(consumedError, key)).toBe(true);
  });

  it('recovers an authorized-but-terminal-less reservation through the canonical interrupted terminal', async () => {
    const f = await makeRuntimeEvidenceData();
    const prepare = await loadStatePrepare();
    const key = clone(f.key);
    const owner = clone(f.context.owner);
    const recovered = testOwner(owner, 10);
    const interrupted = {
      key: clone(key),
      predictionHash: 'interrupted_reservation',
      normalizedPrediction: null,
      analysisLatencyMs: 0,
      errorCategory: 'interrupted_reservation',
      responseModelVersion: 'n/a',
    };
    const interruptedHash = sha256Hex(JSON.stringify(interrupted));
    const authorizedPrefix: unknown[] = [
      runtimeFrame(2, runtimeStart(key, 1, 1, owner, isoAt(1))),
      runtimeFrame(3, runtimeOpStarted(key, 1, 'image', 2, owner, isoAt(2))),
      runtimeFrame(4, runtimeOpSettled(key, 1, 'image', 'returned', 3, owner, isoAt(3))),
      runtimeFrame(5, runtimeOpStarted(key, 1, 'vision', 4, owner, isoAt(4))),
      clone(reservedFact(6, key)),
      runtimeFrame(7, runtimeAuthorized(key, 1, 6, 5, owner, isoAt(5))),
      clone(modelPinnedFact(8, PINNED_MODEL)),
    ];
    const state = prepare({ header: clone(f.header), plans: clone(f.plans) });
    const valid = previewChain(state as unknown as { preview: (frame: unknown) => unknown }, [
      ...authorizedPrefix,
      clone(lockRecoveryFact(9, owner, recovered)),
      clone(imageTerminalFact(10, key, 'failed', interruptedHash, interrupted)),
      runtimeFrame(11, runtimeAbandoned(key, 1, { kind: 'reserved_interruption', terminal: { kind: 'image', eventIndex: 10, journalHash: interruptedHash } }, 6, recovered, isoAt(6))),
    ]);
    expect(snapshotOf(valid)['sequence']).toBe(6);
    expect(snapshotOf(valid)['activeAttempt']).toBeNull();
    let redispatchError: unknown;
    try {
      (valid as { preview: (frame: unknown) => unknown }).preview(
        runtimeFrame(12, runtimeStart(key, 2, 7, recovered, isoAt(7))),
      );
    } catch (cause) {
      redispatchError = cause;
    }
    expect(isFreshTransitionFatal(redispatchError, key)).toBe(true);
  });

  it('finishes a real terminal missing only its finish without invoking capabilities again', async () => {
    const f = await makeRuntimeEvidenceData();
    const prepare = await loadStatePrepare();
    const key = clone(f.key);
    const owner = clone(f.context.owner);
    const prediction = mealSuccessPrediction(key.sampleIndex, 17);
    const captured = capturedJournal(clone(successJournal(key, PINNED_MODEL, 17, prediction, { kcal: 120, proteinG: 10, carbsG: 0, fatG: 8 }, true)));
    const hash = journalHash(captured);
    const prefix: unknown[] = [
      runtimeFrame(2, runtimeStart(key, 1, 1, owner, isoAt(1))),
      runtimeFrame(3, runtimeOpStarted(key, 1, 'image', 2, owner, isoAt(2))),
      runtimeFrame(4, runtimeOpSettled(key, 1, 'image', 'returned', 3, owner, isoAt(3))),
      runtimeFrame(5, runtimeOpStarted(key, 1, 'vision', 4, owner, isoAt(4))),
      clone(reservedFact(6, key)),
      runtimeFrame(7, runtimeAuthorized(key, 1, 6, 5, owner, isoAt(5))),
      clone(modelPinnedFact(8, PINNED_MODEL)),
      runtimeFrame(9, runtimeOpSettled(key, 1, 'vision', 'returned', 6, owner, isoAt(6))),
      clone(imageTerminalFact(10, key, 'completed', hash, captured)),
    ];
    const state = prepare({ header: clone(f.header), plans: clone(f.plans) });
    const done = previewChain(state as unknown as { preview: (frame: unknown) => unknown }, [
      ...prefix.map((frame) => clone(frame)),
      runtimeFrame(11, runtimeFinished(key, 1, { kind: 'image', eventIndex: 10, journalHash: hash }, 7, owner, isoAt(7))),
    ]);
    expect(snapshotOf(done)['activeAttempt']).toBeNull();
    const recovered = testOwner(owner, 6);
    const recoveredState = prepare({ header: clone(f.header), plans: clone(f.plans) });
    const recoveredDone = previewChain(recoveredState as unknown as { preview: (frame: unknown) => unknown }, [
      ...prefix.map((frame) => clone(frame)),
      clone(lockRecoveryFact(11, owner, recovered)),
      runtimeFrame(12, runtimeFinished(key, 1, { kind: 'image', eventIndex: 10, journalHash: hash }, 7, recovered, isoAt(8))),
    ]);
    expect(snapshotOf(recoveredDone)['activeAttempt']).toBeNull();
    expect(snapshotOf(recoveredDone)['owner']).toEqual(recovered);
  });

  it('preserves a real terminal missing evidence as incomplete without redispatch or invented success', async () => {
    const f = await makeRuntimeEvidenceData();
    const prepare = await loadStatePrepare();
    const key = clone(f.key);
    const owner = clone(f.context.owner);
    const recovered = testOwner(owner, 3);
    const prediction = mealSuccessPrediction(key.sampleIndex, 17);
    const captured = capturedJournal(clone(successJournal(key, PINNED_MODEL, 17, prediction, { kcal: 120, proteinG: 10, carbsG: 0, fatG: 8 }, true)));
    const hash = journalHash(captured);
    const state = prepare({ header: clone(f.header), plans: clone(f.plans) });
    const done = previewChain(state as unknown as { preview: (frame: unknown) => unknown }, [
      runtimeFrame(2, runtimeStart(key, 1, 1, owner, isoAt(1))),
      runtimeFrame(3, runtimeOpStarted(key, 1, 'image', 2, owner, isoAt(2))),
      runtimeFrame(4, runtimeOpSettled(key, 1, 'image', 'returned', 3, owner, isoAt(3))),
      runtimeFrame(5, runtimeOpStarted(key, 1, 'vision', 4, owner, isoAt(4))),
      clone(reservedFact(6, key)),
      clone(imageTerminalFact(7, key, 'completed', hash, captured)),
      clone(lockRecoveryFact(8, owner, recovered)),
      runtimeFrame(9, runtimeAbandoned(key, 1, { kind: 'terminal_evidence_incomplete', terminal: { kind: 'image', eventIndex: 7, journalHash: hash } }, 5, recovered, isoAt(5))),
    ]);
    expect(snapshotOf(done)['activeAttempt']).toBeNull();
    const pairState = prepare({ header: clone(f.header), plans: clone(f.plans) }) as unknown as {
      preview: (frame: unknown) => unknown;
      pairInput: (stage: unknown, profile: unknown, through: unknown) => unknown;
    };
    const incompleteOnly = previewChain(pairState as unknown as { preview: (frame: unknown) => unknown }, [
      runtimeFrame(2, runtimeStart(key, 1, 1, owner, isoAt(11))),
      runtimeFrame(3, runtimeOpStarted(key, 1, 'image', 2, owner, isoAt(12))),
      runtimeFrame(4, runtimeOpSettled(key, 1, 'image', 'returned', 3, owner, isoAt(13))),
      runtimeFrame(5, runtimeOpStarted(key, 1, 'vision', 4, owner, isoAt(14))),
      clone(reservedFact(6, key)),
      clone(imageTerminalFact(7, key, 'completed', hash, captured)),
      clone(lockRecoveryFact(8, owner, recovered)),
      runtimeFrame(9, runtimeAbandoned(key, 1, { kind: 'terminal_evidence_incomplete', terminal: { kind: 'image', eventIndex: 7, journalHash: hash } }, 5, recovered, isoAt(15))),
    ]);
    let pairError: unknown;
    try {
      (incompleteOnly as typeof pairState).pairInput('preflight', 'LOW', 5);
    } catch (cause) {
      pairError = cause;
    }
    expect(isFreshTransitionFatal(pairError, hash)).toBe(true);
    let redispatchError: unknown;
    try {
      (done as { preview: (frame: unknown) => unknown }).preview(
        runtimeFrame(10, runtimeStart(key, 2, 6, recovered, isoAt(6))),
      );
    } catch (cause) {
      redispatchError = cause;
    }
    expect(isFreshTransitionFatal(redispatchError, key)).toBe(true);
  });

  it('recovers a nonres barcode terminal missing its snapshot settlement as incomplete', async () => {
    const f = await makeRuntimeEvidenceData();
    const prepare = await loadStatePrepare();
    const barcodeRows = f.plans.LOW.filter((r) => r.scanMode === 'barcode');
    expect(barcodeRows).toHaveLength(12);
    const row = barcodeRows[2];
    expect(row).toBeDefined();
    const barcodeKey = clone((row as { key: CalibrationReportOutcomeKey }).key);
    const owner = clone(f.context.owner);
    const recovered = testOwner(owner, 5);
    const prediction = barcodeSuccessPrediction(barcodeKey.sampleIndex, 21);
    const event = makeNonResEvent(barcodeKey, 'barcode', prediction, isoAt(40));
    const state = prepare({ header: clone(f.header), plans: clone(f.plans) });
    const done = previewChain(state as unknown as { preview: (frame: unknown) => unknown }, [
      clone(profileSelectedFact(2, 'LOW')),
      runtimeFrame(3, runtimeStart(barcodeKey, 1, 1, owner, isoAt(1))),
      runtimeFrame(4, runtimeOpStarted(barcodeKey, 1, 'snapshot', 2, owner, isoAt(2))),
      clone(nonResFact(5, event)),
      clone(lockRecoveryFact(6, owner, recovered)),
      runtimeFrame(7, runtimeAbandoned(barcodeKey, 1, { kind: 'terminal_evidence_incomplete', terminal: { kind: 'non_reservation', eventIndex: 5, contentDigest: event.contentDigest } }, 3, recovered, isoAt(3))),
    ]);
    expect(snapshotOf(done)['activeAttempt']).toBeNull();
    let redispatchError: unknown;
    try {
      (done as { preview: (frame: unknown) => unknown }).preview(
        runtimeFrame(8, runtimeStart(barcodeKey, 2, 4, recovered, isoAt(4))),
      );
    } catch (cause) {
      redispatchError = cause;
    }
    expect(isFreshTransitionFatal(redispatchError, barcodeKey)).toBe(true);
  });
});
describe('recovery ownership and corruption', () => {
  it('admits a receipt then binds after owner recovery without reopening outcomes', async () => {
    const f = await makeRuntimeEvidenceData();
    const prepare = await loadStatePrepare();
    const key = clone(f.key);
    const owner = clone(f.context.owner);
    const recovered = testOwner(owner, 7);
    const receipt = validReceipt('preflight', 'LOW', f.context.identity.implementationCommit);
    const prediction = mealSuccessPrediction(key.sampleIndex, 17);
    const captured = capturedJournal(clone(successJournal(key, PINNED_MODEL, 17, prediction, { kcal: 120, proteinG: 10, carbsG: 0, fatG: 8 }, true)));
    const hash = journalHash(captured);
    const prefix: unknown[] = [
      runtimeFrame(2, runtimeStart(key, 1, 1, owner, isoAt(1))),
      runtimeFrame(3, runtimeOpStarted(key, 1, 'image', 2, owner, isoAt(2))),
      runtimeFrame(4, runtimeOpSettled(key, 1, 'image', 'returned', 3, owner, isoAt(3))),
      runtimeFrame(5, runtimeOpStarted(key, 1, 'vision', 4, owner, isoAt(4))),
      clone(reservedFact(6, key)),
      runtimeFrame(7, runtimeAuthorized(key, 1, 6, 5, owner, isoAt(5))),
      clone(modelPinnedFact(8, PINNED_MODEL)),
      runtimeFrame(9, runtimeOpSettled(key, 1, 'vision', 'returned', 6, owner, isoAt(6))),
      clone(imageTerminalFact(10, key, 'completed', hash, captured)),
      runtimeFrame(11, runtimeFinished(key, 1, { kind: 'image', eventIndex: 10, journalHash: hash }, 7, owner, isoAt(7))),
    ];
    const pairEvents = prefix
      .filter((frame) => (frame as Record<string, unknown>)['kind'] === 'runtime')
      .map((frame) => clone((frame as Record<string, unknown>)['event']));
    const bindingInput = {
      version: 1,
      identity: clone(f.context.identity),
      stage: 'preflight',
      profile: 'LOW',
      throughSequence: 7,
      events: clone(pairEvents),
      terminals: [{ key: clone(key), terminal: { kind: 'image', eventIndex: 10, journalHash: hash } }],
      receipt: clone(receipt),
    };
    const bindingSha = sha256Hex(sortedCanonical(bindingInput));
    const state = prepare({ header: clone(f.header), plans: clone(f.plans) });
    const admitted = previewChain(state as unknown as { preview: (frame: unknown) => unknown }, [
      ...prefix,
      clone(receiptAdmittedFact(12, receipt)),
    ]);
    expect(snapshotOf(admitted)['lastEventIndex']).toBe(12);
    const bound = previewChain(admitted as unknown as { preview: (frame: unknown) => unknown }, [
      clone(lockRecoveryFact(13, owner, recovered)),
      runtimeFrame(14, runtimeBound('preflight', 'LOW', receipt, 7, bindingSha, 8, recovered, isoAt(9))),
    ]);
    expect(snapshotOf(bound)['sequence']).toBe(8);
    let reopenError: unknown;
    try {
      (bound as { preview: (frame: unknown) => unknown }).preview(
        runtimeFrame(15, runtimeStart(key, 2, 9, recovered, isoAt(10))),
      );
    } catch (cause) {
      reopenError = cause;
    }
    expect(isFreshTransitionFatal(reopenError, key)).toBe(true);
  });

  it('rejects corrupt, orphan and conflicting facts', async () => {
    const f = await makeRuntimeEvidenceData();
    const prepare = await loadStatePrepare();
    const key = clone(f.key);
    const prediction = mealSuccessPrediction(key.sampleIndex, 17);
    const captured = capturedJournal(clone(successJournal(key, PINNED_MODEL, 17, prediction, { kcal: 120, proteinG: 10, carbsG: 0, fatG: 8 }, true)));
    const hash = journalHash(captured);
    const badFacts: unknown[] = [
      clone({ kind: 'reserved', eventIndex: 2 }),
      clone(imageTerminalFact(3, key, 'completed', hash, captured)),
      clone(imageTerminalFact(2, key, 'completed', '0'.repeat(64), captured)),
    ];
    for (const bad of badFacts) {
      const state = prepare({ header: clone(f.header), plans: clone(f.plans) });
      let error: unknown;
      try {
        (state as unknown as { preview: (frame: unknown) => unknown }).preview(clone(bad));
      } catch (cause) {
        error = cause;
      }
      expect(isFreshTransitionFatal(error, bad)).toBe(true);
    }
  });

  it('changes epoch on lock recovery and forbids the old owner from settling the new attempt', async () => {
    const f = await makeRuntimeEvidenceData();
    const prepare = await loadStatePrepare();
    const key = clone(f.key);
    const owner = clone(f.context.owner);
    const recovered = testOwner(owner, 4);
    const state = prepare({ header: clone(f.header), plans: clone(f.plans) });
    const afterRecovery = previewChain(state as unknown as { preview: (frame: unknown) => unknown }, [
      runtimeFrame(2, runtimeStart(key, 1, 1, owner, isoAt(1))),
      runtimeFrame(3, runtimeOpStarted(key, 1, 'image', 2, owner, isoAt(2))),
      clone(lockRecoveryFact(4, owner, recovered)),
      runtimeFrame(5, runtimeAbandoned(key, 1, { kind: 'unreserved_interruption' }, 3, recovered, isoAt(3))),
      runtimeFrame(6, runtimeStart(key, 2, 4, recovered, isoAt(4))),
    ]);
    expect(snapshotOf(afterRecovery)['owner']).toEqual(recovered);
    const withNewOp = (afterRecovery as { preview: (frame: unknown) => unknown }).preview(
      runtimeFrame(7, runtimeOpStarted(key, 2, 'image', 5, recovered, isoAt(5))),
    );
    expect(snapshotOf(withNewOp)['sequence']).toBe(5);
    let oldOwnerError: unknown;
    try {
      (withNewOp as { preview: (frame: unknown) => unknown }).preview(
        runtimeFrame(8, runtimeOpSettled(key, 2, 'image', 'returned', 6, owner, isoAt(6))),
      );
    } catch (cause) {
      oldOwnerError = cause;
    }
    expect(isFreshTransitionFatal(oldOwnerError, key)).toBe(true);
  });

  it('forbids ordinary failed samples from retrying as new attempts', async () => {
    const f = await makeRuntimeEvidenceData();
    const prepare = await loadStatePrepare();
    const key = clone(f.key);
    const owner = clone(f.context.owner);
    const prediction = providerFailurePrediction(key.sampleIndex, 9);
    const captured = capturedJournal(clone(failureJournal(key, 'unknown', prediction, 9)));
    const hash = journalHash(captured);
    const state = prepare({ header: clone(f.header), plans: clone(f.plans) });
    const finished = previewChain(state as unknown as { preview: (frame: unknown) => unknown }, [
      runtimeFrame(2, runtimeStart(key, 1, 1, owner, isoAt(1))),
      runtimeFrame(3, runtimeOpStarted(key, 1, 'image', 2, owner, isoAt(2))),
      runtimeFrame(4, runtimeOpSettled(key, 1, 'image', 'returned', 3, owner, isoAt(3))),
      runtimeFrame(5, runtimeOpStarted(key, 1, 'vision', 4, owner, isoAt(4))),
      clone(reservedFact(6, key)),
      runtimeFrame(7, runtimeAuthorized(key, 1, 6, 5, owner, isoAt(5))),
      clone(modelPinnedFact(8, PINNED_MODEL)),
      runtimeFrame(9, runtimeOpSettled(key, 1, 'vision', 'failed', 6, owner, isoAt(6))),
      clone(imageTerminalFact(10, key, 'failed', hash, captured)),
      runtimeFrame(11, runtimeFinished(key, 1, { kind: 'image', eventIndex: 10, journalHash: hash }, 7, owner, isoAt(7))),
    ]);
    expect(snapshotOf(finished)['activeAttempt']).toBeNull();
    let retryError: unknown;
    try {
      (finished as { preview: (frame: unknown) => unknown }).preview(
        runtimeFrame(12, runtimeStart(key, 2, 8, owner, isoAt(8))),
      );
    } catch (cause) {
      retryError = cause;
    }
    expect(isFreshTransitionFatal(retryError, key)).toBe(true);
    const datasetPrediction = datasetFailurePrediction(key.sampleIndex, 11);
    const datasetEvent = makeNonResEvent(key, 'dataset', datasetPrediction, isoAt(50));
    const unreservedState = prepare({ header: clone(f.header), plans: clone(f.plans) });
    const unreservedDone = previewChain(unreservedState as unknown as { preview: (frame: unknown) => unknown }, [
      runtimeFrame(2, runtimeStart(key, 1, 1, owner, isoAt(31))),
      runtimeFrame(3, runtimeOpStarted(key, 1, 'image', 2, owner, isoAt(32))),
      runtimeFrame(4, runtimeOpSettled(key, 1, 'image', 'failed', 3, owner, isoAt(33))),
      clone(nonResFact(5, datasetEvent)),
      runtimeFrame(6, runtimeFinished(key, 1, { kind: 'non_reservation', eventIndex: 5, contentDigest: datasetEvent.contentDigest }, 4, owner, isoAt(34))),
    ]);
    expect(snapshotOf(unreservedDone)['activeAttempt']).toBeNull();
    const recoveredOwner = testOwner(owner, 8);
    let unreservedRetry: unknown;
    try {
      previewChain(unreservedDone as unknown as { preview: (frame: unknown) => unknown }, [
        clone(lockRecoveryFact(7, owner, recoveredOwner)),
        runtimeFrame(8, runtimeStart(key, 2, 5, recoveredOwner, isoAt(35))),
      ]);
    } catch (cause) {
      unreservedRetry = cause;
    }
    expect(isFreshTransitionFatal(unreservedRetry, key)).toBe(true);
    const barcodeRows = f.plans.LOW.filter((r) => r.scanMode === 'barcode');
    expect(barcodeRows).toHaveLength(12);
    const barcodeRow = barcodeRows[0];
    expect(barcodeRow).toBeDefined();
    if (barcodeRow === undefined) throw new Error('test baseline missing barcode row');
    const barcodeKey = clone(barcodeRow.key);
    expect(snapshotOf(unreservedDone)['activeAttempt']).toBeNull();
    const barcodePrediction = productFailurePrediction(barcodeKey.sampleIndex, 27, 'off_product_invalid');
    const barcodeEvent = makeNonResEvent(barcodeKey, 'barcode', barcodePrediction, isoAt(51));
    const barcodeSelected = prepare({ header: clone(f.header), plans: clone(f.plans) });
    const barcodeDone = previewChain(barcodeSelected as unknown as { preview: (frame: unknown) => unknown }, [
      clone(profileSelectedFact(2, 'LOW')),
      runtimeFrame(3, runtimeStart(barcodeKey, 1, 1, owner, isoAt(41))),
      runtimeFrame(4, runtimeOpStarted(barcodeKey, 1, 'snapshot', 2, owner, isoAt(42))),
      runtimeFrame(5, runtimeOpSettled(barcodeKey, 1, 'snapshot', 'returned', 3, owner, isoAt(43))),
      clone(nonResFact(6, barcodeEvent)),
      runtimeFrame(7, runtimeFinished(barcodeKey, 1, { kind: 'non_reservation', eventIndex: 6, contentDigest: barcodeEvent.contentDigest }, 4, owner, isoAt(44))),
    ]);
    expect(snapshotOf(barcodeDone)['activeAttempt']).toBeNull();
    const barcodeRecovered = testOwner(owner, 9);
    let barcodeRetry: unknown;
    try {
      previewChain(barcodeDone as unknown as { preview: (frame: unknown) => unknown }, [
        clone(lockRecoveryFact(8, owner, barcodeRecovered)),
        runtimeFrame(9, runtimeStart(barcodeKey, 2, 5, barcodeRecovered, isoAt(45))),
      ]);
    } catch (cause) {
      barcodeRetry = cause;
    }
    expect(isFreshTransitionFatal(barcodeRetry, barcodeKey)).toBe(true);
  });
});
describe('runtime bound', () => {
  it('reaches 4096 runtime events through legal read-only recovery history and rejects the 4097th before mutation', async () => {
    const f = await makeRuntimeEvidenceData();
    const prepare = await loadStatePrepare();
    const key = clone(f.key);
    const baseOwner = clone(f.context.owner);
    let state = prepare({ header: clone(f.header), plans: clone(f.plans) }) as unknown as {
      preview: (frame: unknown) => unknown;
      snapshot: () => Record<string, unknown>;
    };
    let eventIndex = 1;
    let sequence = 0;
    let owner = clone(baseOwner);
    let attempt = 0;
    let steps = 0;
    while (sequence < 4096) {
      attempt += 1;
      eventIndex += 1;
      sequence += 1;
      state = state.preview(runtimeFrame(eventIndex, runtimeStart(key, attempt, sequence, owner, isoAt(100 + sequence)))) as typeof state;
      if (sequence >= 4096) break;
      eventIndex += 1;
      sequence += 1;
      state = state.preview(runtimeFrame(eventIndex, runtimeOpStarted(key, attempt, 'image', sequence, owner, isoAt(100 + sequence)))) as typeof state;
      if (sequence >= 4096) break;
      const recovered = testOwner(baseOwner, attempt);
      eventIndex += 1;
      state = state.preview(clone(lockRecoveryFact(eventIndex, owner, recovered))) as typeof state;
      eventIndex += 1;
      sequence += 1;
      state = state.preview(runtimeFrame(eventIndex, runtimeAbandoned(key, attempt, { kind: 'unreserved_interruption' }, sequence, recovered, isoAt(100 + sequence)))) as typeof state;
      owner = recovered;
      steps += 1;
      if (steps > 1400) break;
    }
    expect(snapshotOf(state)['sequence']).toBe(4096);
    const before = snapshotOf(state);
    let error: unknown;
    try {
      (state as { preview: (frame: unknown) => unknown }).preview(
        runtimeFrame(eventIndex + 1, runtimeOpStarted(key, attempt, 'image', 4097, owner, isoAt(5100))),
      );
    } catch (cause) {
      error = cause;
    }
    expect(isFreshTransitionFatal(error, key)).toBe(true);
    expect(snapshotOf(state)).toEqual(before);
  });
});

describe('pairInput and prefix binding', () => {
  it('provides completeness without a receipt prerequisite before admission', async () => {
    const f = await makeRuntimeEvidenceData();
    const prepare = await loadStatePrepare();
    const key = clone(f.key);
    const owner = clone(f.context.owner);
    const prediction = mealSuccessPrediction(key.sampleIndex, 17);
    const captured = capturedJournal(clone(successJournal(key, PINNED_MODEL, 17, prediction, { kcal: 120, proteinG: 10, carbsG: 0, fatG: 8 }, true)));
    const hash = journalHash(captured);
    const frames: unknown[] = [
      runtimeFrame(2, runtimeStart(key, 1, 1, owner, isoAt(1))),
      runtimeFrame(3, runtimeOpStarted(key, 1, 'image', 2, owner, isoAt(2))),
      runtimeFrame(4, runtimeOpSettled(key, 1, 'image', 'returned', 3, owner, isoAt(3))),
      runtimeFrame(5, runtimeOpStarted(key, 1, 'vision', 4, owner, isoAt(4))),
      clone(reservedFact(6, key)),
      runtimeFrame(7, runtimeAuthorized(key, 1, 6, 5, owner, isoAt(5))),
      clone(modelPinnedFact(8, PINNED_MODEL)),
      runtimeFrame(9, runtimeOpSettled(key, 1, 'vision', 'returned', 6, owner, isoAt(6))),
      clone(imageTerminalFact(10, key, 'completed', hash, captured)),
      runtimeFrame(11, runtimeFinished(key, 1, { kind: 'image', eventIndex: 10, journalHash: hash }, 7, owner, isoAt(7))),
    ];
    const state = prepare({ header: clone(f.header), plans: clone(f.plans) }) as unknown as {
      preview: (frame: unknown) => unknown;
      pairInput: (stage: unknown, profile: unknown, through: unknown) => Record<string, unknown>;
    };
    const done = previewChain(state as unknown as { preview: (frame: unknown) => unknown }, frames);
    const input = (done as typeof state).pairInput('preflight', 'LOW', 7) as Record<string, unknown>;
    expect(input['stage']).toBe('preflight');
    expect(input['profile']).toBe('LOW');
    expect(input['throughSequence']).toBe(7);
    expect((input['terminals'] as unknown[])).toHaveLength(1);
    expect((input['events'] as unknown[]).some((e) => (e as Record<string, unknown>)['type'] === 'runtime_report_bound')).toBe(false);
  });

  it('binds LOW then MEDIUM with stable prefix hashes and excludes binding events from pair inputs', async () => {
    const f = await makeRuntimeEvidenceData();
    const prepare = await loadStatePrepare();
    const lowRow = f.plans.initial.find((r) => r.key.stage === 'preflight' && r.key.profile === 'LOW');
    const mediumRow = f.plans.initial.find((r) => r.key.stage === 'preflight' && r.key.profile === 'MEDIUM');
    expect(lowRow).toBeDefined();
    expect(mediumRow).toBeDefined();
    const lowKey = clone((lowRow as { key: CalibrationReportOutcomeKey }).key);
    const mediumKey = clone((mediumRow as { key: CalibrationReportOutcomeKey }).key);
    const owner = clone(f.context.owner);
    const lowPrediction = mealSuccessPrediction(lowKey.sampleIndex, 17);
    const lowCaptured = capturedJournal(clone(successJournal(lowKey, PINNED_MODEL, 17, lowPrediction, { kcal: 120, proteinG: 10, carbsG: 0, fatG: 8 }, true)));
    const lowHash = journalHash(lowCaptured);
    const mediumPrediction = mealSuccessPrediction(mediumKey.sampleIndex, 17);
    const mediumCaptured = capturedJournal(clone(successJournal(mediumKey, PINNED_MODEL, 17, mediumPrediction, { kcal: 120, proteinG: 10, carbsG: 0, fatG: 8 }, true)));
    const mediumHash = journalHash(mediumCaptured);
    const lowFrames: unknown[] = [
      runtimeFrame(2, runtimeStart(lowKey, 1, 1, owner, isoAt(201))),
      runtimeFrame(3, runtimeOpStarted(lowKey, 1, 'image', 2, owner, isoAt(202))),
      runtimeFrame(4, runtimeOpSettled(lowKey, 1, 'image', 'returned', 3, owner, isoAt(203))),
      runtimeFrame(5, runtimeOpStarted(lowKey, 1, 'vision', 4, owner, isoAt(204))),
      clone(reservedFact(6, lowKey)),
      runtimeFrame(7, runtimeAuthorized(lowKey, 1, 6, 5, owner, isoAt(205))),
      clone(modelPinnedFact(8, PINNED_MODEL)),
      runtimeFrame(9, runtimeOpSettled(lowKey, 1, 'vision', 'returned', 6, owner, isoAt(206))),
      clone(imageTerminalFact(10, lowKey, 'completed', lowHash, lowCaptured)),
      runtimeFrame(11, runtimeFinished(lowKey, 1, { kind: 'image', eventIndex: 10, journalHash: lowHash }, 7, owner, isoAt(207))),
    ];
    const mediumFrames: unknown[] = [
      runtimeFrame(12, runtimeStart(mediumKey, 1, 8, owner, isoAt(208))),
      runtimeFrame(13, runtimeOpStarted(mediumKey, 1, 'image', 9, owner, isoAt(209))),
      runtimeFrame(14, runtimeOpSettled(mediumKey, 1, 'image', 'returned', 10, owner, isoAt(210))),
      runtimeFrame(15, runtimeOpStarted(mediumKey, 1, 'vision', 11, owner, isoAt(211))),
      clone(reservedFact(16, mediumKey)),
      runtimeFrame(17, runtimeAuthorized(mediumKey, 1, 16, 12, owner, isoAt(212))),
      runtimeFrame(18, runtimeOpSettled(mediumKey, 1, 'vision', 'returned', 13, owner, isoAt(213))),
      clone(imageTerminalFact(19, mediumKey, 'completed', mediumHash, mediumCaptured)),
      runtimeFrame(20, runtimeFinished(mediumKey, 1, { kind: 'image', eventIndex: 19, journalHash: mediumHash }, 14, owner, isoAt(214))),
    ];
    const lowReceipt = validReceipt('preflight', 'LOW', f.context.identity.implementationCommit);
    const mediumReceipt = validReceipt('preflight', 'MEDIUM', f.context.identity.implementationCommit);
    const lowExpectedEvents = lowFrames
      .filter((frame) => (frame as Record<string, unknown>)['kind'] === 'runtime')
      .map((frame) => clone((frame as Record<string, unknown>)['event']));
    const mediumExpectedEvents = mediumFrames
      .filter((frame) => (frame as Record<string, unknown>)['kind'] === 'runtime')
      .map((frame) => clone((frame as Record<string, unknown>)['event']));
    const lowExpectedTerminals = [{ key: clone(lowKey), terminal: { kind: 'image', eventIndex: 10, journalHash: lowHash } }];
    const mediumExpectedTerminals = [{ key: clone(mediumKey), terminal: { kind: 'image', eventIndex: 19, journalHash: mediumHash } }];
    const lowExpectedPair = {
      version: 1,
      identity: clone(f.context.identity),
      stage: 'preflight',
      profile: 'LOW',
      throughSequence: 14,
      events: clone(lowExpectedEvents),
      terminals: clone(lowExpectedTerminals),
    };
    const mediumExpectedPair = {
      version: 1,
      identity: clone(f.context.identity),
      stage: 'preflight',
      profile: 'MEDIUM',
      throughSequence: 15,
      events: clone(mediumExpectedEvents),
      terminals: clone(mediumExpectedTerminals),
    };
    const lowBindingSha = sha256Hex(sortedCanonical({ ...clone(lowExpectedPair) as Record<string, unknown>, receipt: clone(lowReceipt) }));
    const mediumBindingSha = sha256Hex(sortedCanonical({ ...clone(mediumExpectedPair) as Record<string, unknown>, receipt: clone(mediumReceipt) }));
    let state = prepare({ header: clone(f.header), plans: clone(f.plans) }) as unknown as {
      preview: (frame: unknown) => unknown;
      snapshot: () => Record<string, unknown>;
      pairInput: (stage: unknown, profile: unknown, through: unknown) => Record<string, unknown>;
    };
    state = previewChain(state as unknown as { preview: (frame: unknown) => unknown }, [...lowFrames, ...mediumFrames]) as typeof state;
    expect(snapshotOf(state)['sequence']).toBe(14);
    state = previewChain(state as unknown as { preview: (frame: unknown) => unknown }, [clone(receiptAdmittedFact(21, lowReceipt))]) as typeof state;
    state = previewChain(state as unknown as { preview: (frame: unknown) => unknown }, [
      runtimeFrame(22, runtimeBound('preflight', 'LOW', lowReceipt, 14, lowBindingSha, 15, owner, isoAt(900))),
    ]) as typeof state;
    expect(snapshotOf(state)['sequence']).toBe(15);
    const lowRequery = state.pairInput('preflight', 'LOW', 14);
    expect(sortedCanonical(lowRequery)).toBe(sortedCanonical(clone(lowExpectedPair)));
    expect(sha256Hex(sortedCanonical(lowRequery))).toBe(sha256Hex(sortedCanonical(clone(lowExpectedPair))));
    state = previewChain(state as unknown as { preview: (frame: unknown) => unknown }, [clone(receiptAdmittedFact(23, mediumReceipt))]) as typeof state;
    state = previewChain(state as unknown as { preview: (frame: unknown) => unknown }, [
      runtimeFrame(24, runtimeBound('preflight', 'MEDIUM', mediumReceipt, 15, mediumBindingSha, 16, owner, isoAt(901))),
    ]) as typeof state;
    expect(snapshotOf(state)['sequence']).toBe(16);
    const mediumRequery = state.pairInput('preflight', 'MEDIUM', 15);
    expect(sortedCanonical(mediumRequery)).toBe(sortedCanonical(clone(mediumExpectedPair)));
    expect((mediumRequery['events'] as unknown[]).some((e) => (e as Record<string, unknown>)['type'] === 'runtime_report_bound')).toBe(false);
    const devRow = f.plans.initial.find((r) => r.key.stage === 'development' && r.key.profile === 'LOW');
    expect(devRow).toBeDefined();
    const devKey = clone((devRow as { key: CalibrationReportOutcomeKey }).key);
    state = previewChain(state as unknown as { preview: (frame: unknown) => unknown }, [
      runtimeFrame(25, runtimeStart(devKey, 1, 17, owner, isoAt(902))),
    ]) as typeof state;
    expect(snapshotOf(state)['sequence']).toBe(17);
    const lowFinal = state.pairInput('preflight', 'LOW', 14);
    expect(sortedCanonical(lowFinal)).toBe(sortedCanonical(clone(lowExpectedPair)));
    expect(snapshotOf(state)['sequence']).toBe(17);
  });

  it('rejects incomplete pairs and development pairs with missing keys', async () => {
    const f = await makeRuntimeEvidenceData();
    const prepare = await loadStatePrepare();
    const key = clone(f.key);
    const owner = clone(f.context.owner);
    const frames: unknown[] = [
      runtimeFrame(2, runtimeStart(key, 1, 1, owner, isoAt(1))),
      runtimeFrame(3, runtimeOpStarted(key, 1, 'image', 2, owner, isoAt(2))),
    ];
    const state = prepare({ header: clone(f.header), plans: clone(f.plans) }) as unknown as {
      preview: (frame: unknown) => unknown;
      pairInput: (stage: unknown, profile: unknown, through: unknown) => unknown;
    };
    const partial = previewChain(state as unknown as { preview: (frame: unknown) => unknown }, frames);
    let incomplete: unknown;
    try {
      (partial as typeof state).pairInput('preflight', 'LOW', 2);
    } catch (cause) {
      incomplete = cause;
    }
    expect(isFreshTransitionFatal(incomplete, frames)).toBe(true);
    const devRows = f.plans.initial.filter((r) => r.key.stage === 'development' && r.key.profile === 'LOW');
    expect(devRows.length).toBeGreaterThan(1);
    const firstDev = devRows[0];
    expect(firstDev).toBeDefined();
    const devKey = clone((firstDev as { key: CalibrationReportOutcomeKey }).key);
    const devPrediction = mealSuccessPrediction(devKey.sampleIndex, 17);
    const devCaptured = capturedJournal(clone(successJournal(devKey, PINNED_MODEL, 17, devPrediction, { kcal: 120, proteinG: 10, carbsG: 0, fatG: 8 }, true)));
    const devHash = journalHash(devCaptured);
    const devState = prepare({ header: clone(f.header), plans: clone(f.plans) }) as unknown as {
      preview: (frame: unknown) => unknown;
      pairInput: (stage: unknown, profile: unknown, through: unknown) => unknown;
    };
    const devDone = previewChain(devState as unknown as { preview: (frame: unknown) => unknown }, [
      runtimeFrame(2, runtimeStart(devKey, 1, 1, owner, isoAt(1))),
      runtimeFrame(3, runtimeOpStarted(devKey, 1, 'image', 2, owner, isoAt(2))),
      runtimeFrame(4, runtimeOpSettled(devKey, 1, 'image', 'returned', 3, owner, isoAt(3))),
      runtimeFrame(5, runtimeOpStarted(devKey, 1, 'vision', 4, owner, isoAt(4))),
      clone(reservedFact(6, devKey)),
      runtimeFrame(7, runtimeAuthorized(devKey, 1, 6, 5, owner, isoAt(5))),
      clone(modelPinnedFact(8, PINNED_MODEL)),
      runtimeFrame(9, runtimeOpSettled(devKey, 1, 'vision', 'returned', 6, owner, isoAt(6))),
      clone(imageTerminalFact(10, devKey, 'completed', devHash, devCaptured)),
      runtimeFrame(11, runtimeFinished(devKey, 1, { kind: 'image', eventIndex: 10, journalHash: devHash }, 7, owner, isoAt(7))),
    ]);
    let missing: unknown;
    try {
      (devDone as typeof devState).pairInput('development', 'LOW', 7);
    } catch (cause) {
      missing = cause;
    }
    expect(isFreshTransitionFatal(missing, devKey)).toBe(true);
  });

  it('rejects wrong binding digests, wrong receipts, duplicate bindings and post-admission mutations', async () => {
    const f = await makeRuntimeEvidenceData();
    const prepare = await loadStatePrepare();
    const lowRow = f.plans.initial.find((r) => r.key.stage === 'preflight' && r.key.profile === 'LOW');
    expect(lowRow).toBeDefined();
    const lowKey = clone((lowRow as { key: CalibrationReportOutcomeKey }).key);
    const owner = clone(f.context.owner);
    const prediction = mealSuccessPrediction(lowKey.sampleIndex, 17);
    const captured = capturedJournal(clone(successJournal(lowKey, PINNED_MODEL, 17, prediction, { kcal: 120, proteinG: 10, carbsG: 0, fatG: 8 }, true)));
    const hash = journalHash(captured);
    const trace: unknown[] = [
      runtimeFrame(2, runtimeStart(lowKey, 1, 1, owner, isoAt(1))),
      runtimeFrame(3, runtimeOpStarted(lowKey, 1, 'image', 2, owner, isoAt(2))),
      runtimeFrame(4, runtimeOpSettled(lowKey, 1, 'image', 'returned', 3, owner, isoAt(3))),
      runtimeFrame(5, runtimeOpStarted(lowKey, 1, 'vision', 4, owner, isoAt(4))),
      clone(reservedFact(6, lowKey)),
      runtimeFrame(7, runtimeAuthorized(lowKey, 1, 6, 5, owner, isoAt(5))),
      clone(modelPinnedFact(8, PINNED_MODEL)),
      runtimeFrame(9, runtimeOpSettled(lowKey, 1, 'vision', 'returned', 6, owner, isoAt(6))),
      clone(imageTerminalFact(10, lowKey, 'completed', hash, captured)),
      runtimeFrame(11, runtimeFinished(lowKey, 1, { kind: 'image', eventIndex: 10, journalHash: hash }, 7, owner, isoAt(7))),
    ];
    const receipt = validReceipt('preflight', 'LOW', f.context.identity.implementationCommit);
    const pairEvents = trace
      .filter((frame) => (frame as Record<string, unknown>)['kind'] === 'runtime')
      .map((frame) => clone((frame as Record<string, unknown>)['event']));
    const goodInput = {
      version: 1,
      identity: clone(f.context.identity),
      stage: 'preflight',
      profile: 'LOW',
      throughSequence: 7,
      events: clone(pairEvents),
      terminals: [{ key: clone(lowKey), terminal: { kind: 'image', eventIndex: 10, journalHash: hash } }],
      receipt: clone(receipt),
    };
    const goodSha = sha256Hex(sortedCanonical(goodInput));
    let state = prepare({ header: clone(f.header), plans: clone(f.plans) }) as unknown as {
      preview: (frame: unknown) => unknown;
      snapshot: () => Record<string, unknown>;
      pairInput: (stage: unknown, profile: unknown, through: unknown) => unknown;
    };
    state = previewChain(state as unknown as { preview: (frame: unknown) => unknown }, [...trace, clone(receiptAdmittedFact(12, receipt))]) as typeof state;
    const wrongDigestState = state;
    let wrongDigest: unknown;
    try {
      previewChain(wrongDigestState as unknown as { preview: (frame: unknown) => unknown }, [
        runtimeFrame(13, runtimeBound('preflight', 'LOW', receipt, 7, '0'.repeat(64), 8, owner, isoAt(9))),
      ]);
    } catch (cause) {
      wrongDigest = cause;
    }
    expect(isFreshTransitionFatal(wrongDigest, receipt)).toBe(true);
    const wrongReceipt = validReceipt('preflight', 'MEDIUM', f.context.identity.implementationCommit);
    let wrongReceiptError: unknown;
    try {
      previewChain(state as unknown as { preview: (frame: unknown) => unknown }, [
        runtimeFrame(13, runtimeBound('preflight', 'LOW', wrongReceipt, 7, goodSha, 8, owner, isoAt(9))),
      ]);
    } catch (cause) {
      wrongReceiptError = cause;
    }
    expect(isFreshTransitionFatal(wrongReceiptError, wrongReceipt)).toBe(true);
    state = previewChain(state as unknown as { preview: (frame: unknown) => unknown }, [
      runtimeFrame(13, runtimeBound('preflight', 'LOW', receipt, 7, goodSha, 8, owner, isoAt(9))),
    ]) as typeof state;
    const changedReceipt = { ...clone(receipt), jsonSha256: 'd'.repeat(64) };
    const changedInput = {
      version: 1,
      identity: clone(f.context.identity),
      stage: 'preflight',
      profile: 'LOW',
      throughSequence: 7,
      events: clone(pairEvents),
      terminals: [{ key: clone(lowKey), terminal: { kind: 'image', eventIndex: 10, journalHash: hash } }],
      receipt: clone(changedReceipt),
    };
    const changedSha = sha256Hex(sortedCanonical(changedInput));
    let unadmittedError: unknown;
    try {
      previewChain(wrongDigestState as unknown as { preview: (frame: unknown) => unknown }, [
        runtimeFrame(13, runtimeBound('preflight', 'LOW', changedReceipt, 7, changedSha, 8, owner, isoAt(10))),
      ]);
    } catch (cause) {
      unadmittedError = cause;
    }
    expect(isFreshTransitionFatal(unadmittedError, changedReceipt)).toBe(true);
    let duplicate: unknown;
    try {
      const through8Input = {
        version: 1,
        identity: clone(f.context.identity),
        stage: 'preflight',
        profile: 'LOW',
        throughSequence: 8,
        events: clone(pairEvents),
        terminals: [{ key: clone(lowKey), terminal: { kind: 'image', eventIndex: 10, journalHash: hash } }],
        receipt: clone(receipt),
      };
      const through8Sha = sha256Hex(sortedCanonical(through8Input));
      previewChain(state as unknown as { preview: (frame: unknown) => unknown }, [
        runtimeFrame(14, runtimeBound('preflight', 'LOW', receipt, 8, through8Sha, 9, owner, isoAt(10))),
      ]);
    } catch (cause) {
      duplicate = cause;
    }
    expect(isFreshTransitionFatal(duplicate, receipt)).toBe(true);
    let postAdmission: unknown;
    try {
      previewChain(state as unknown as { preview: (frame: unknown) => unknown }, [
        runtimeFrame(14, runtimeStart(lowKey, 2, 9, owner, isoAt(10))),
      ]);
    } catch (cause) {
      postAdmission = cause;
    }
    expect(isFreshTransitionFatal(postAdmission, lowKey)).toBe(true);
  });
});
