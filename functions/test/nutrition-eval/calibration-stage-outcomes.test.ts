/**
 * Task 1 — TESTS ONLY for durable non-reservation outcomes and one strict read model.
 *
 * Contract under test (see task-1-brief.md and
 * docs/superpowers/plans/2026-10-07-calibration-stage-reports.md Task 1):
 * - pure `functions/src/nutrition-eval/calibration-report-state.ts` codecs/types
 * - `deriveCanonicalReportOutcomePlan(files, selectedProfile?)` in
 *   `calibration-bootstrap.ts`
 * - strict-only `recordNonReservationResult(entry)` + `getStageReportSnapshot(stage, profile)`
 *   via `createProtocolCalibrationLedger(deps, identity, keyResolver, reportOptions?)`
 *
 * Hermetic contract: real file ledger (`createFileCalibrationLedgerDeps`), real
 * strict ledger (`createProtocolCalibrationLedger`), real committed manifest
 * bytes, real `deriveCanonicalAllowedKeys`, real closed prediction codec
 * (`captureCalibrationReportPrediction`). Only clock is controlled via injected
 * `nowIso` where timestamps must be deterministic; no provider client, SDK
 * construction, network, Firebase, device, or live inference occurs here.
 *
 * RED expectation: the new report-state module, the bootstrap planner, and the
 * two strict ledger methods do not exist yet, so every test that needs them
 * fails with a clear RED marker while the pre-existing suites stay green.
 * Tests marked GREEN pass both before and after the source step (legacy
 * preservation / existing fail-closed protection) and are not counted as new RED.
 *
 * Production break each test catches is stated inline above each test.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CALIBRATION_ROOT, createProtocolCalibrationLedger } from '../../src/nutrition-eval/calibration';
import type {
  CalibrationIdentity,
  CalibrationKeyResolver,
  CalibrationOwner,
  JournalEntry,
  ReservationKey,
  StageName,
} from '../../src/nutrition-eval/calibration';
import * as bootstrapModule from '../../src/nutrition-eval/calibration-bootstrap';
import { createFileCalibrationLedgerDeps } from '../../src/nutrition-eval/calibration-file-store';
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';
import { captureCalibrationReportPrediction } from '../../src/nutrition-eval/calibration-report-journal';
import { NutritionPredictionSchema } from '../../src/nutrition-eval/schema';
import type { NutritionPrediction } from '../../src/nutrition-eval/schema';
import { BARCODE_ANALYSIS_PROMPT, LABEL_ANALYSIS_PROMPT, MEAL_ANALYSIS_PROMPT } from '../../src/prompts';
import { visionResponseJsonSchema } from '../../src/nutrition-json-schema';

// ── Local structural contracts (test-only, no any) ───────────────────────────

interface ReportOutcomeKey {
  readonly stage: StageName;
  readonly profile: 'LOW' | 'MEDIUM';
  readonly caseId: string;
  readonly sampleIndex: number;
}

interface PlannedReportOutcome {
  readonly key: ReportOutcomeKey;
  readonly scanMode: 'meal' | 'label' | 'barcode';
}

interface NonReservationEntry {
  readonly key: ReportOutcomeKey;
  readonly reason: 'barcode' | 'dataset';
  readonly prediction: NutritionPrediction;
}

interface ReportStateModule {
  readonly captureCalibrationNonReservationEntry: (value: unknown) => NonReservationEntry;
  readonly captureCalibrationNonReservationEvent: (value: unknown) => Record<string, unknown>;
  readonly captureCalibrationStageReportSnapshot: (value: unknown) => Record<string, unknown>;
}

type DeriveOutcomePlanFn = (
  files: unknown,
  selectedProfile?: unknown,
) => readonly PlannedReportOutcome[];

// ── Missing-code loaders (RED until the source step lands) ───────────────────

async function loadReportState(): Promise<ReportStateModule> {
  const absPath = resolve(
    fileURLToPath(new URL('../../../', import.meta.url)),
    'functions/src/nutrition-eval/calibration-report-state.ts',
  );
  if (!existsSync(absPath)) {
    throw new Error(
      'RED: missing functions/src/nutrition-eval/calibration-report-state.ts ' +
        '(new codecs not yet implemented; Step 1 expects this RED)',
    );
  }
  // File exists: import errors propagate and are never masked as missing code.
  const mod: unknown = await import('../../src/nutrition-eval/calibration-report-state');
  const record = mod as Record<string, unknown>;
  expect(
    typeof record.captureCalibrationNonReservationEntry,
    'RED: captureCalibrationNonReservationEntry not yet exported',
  ).toBe('function');
  expect(
    typeof record.captureCalibrationNonReservationEvent,
    'RED: captureCalibrationNonReservationEvent not yet exported',
  ).toBe('function');
  expect(
    typeof record.captureCalibrationStageReportSnapshot,
    'RED: captureCalibrationStageReportSnapshot not yet exported',
  ).toBe('function');
  return record as unknown as ReportStateModule;
}

function loadOutcomePlanner(): DeriveOutcomePlanFn {
  const fn = (bootstrapModule as Record<string, unknown>)['deriveCanonicalReportOutcomePlan'];
  expect(
    typeof fn,
    'RED: deriveCanonicalReportOutcomePlan not yet exported from calibration-bootstrap.ts',
  ).toBe('function');
  return fn as DeriveOutcomePlanFn;
}

function loadRecordNonReservation(ledger: unknown): (entry: unknown) => string {
  const fn = (ledger as Record<string, unknown>)['recordNonReservationResult'];
  expect(
    typeof fn,
    'RED: strict ledger recordNonReservationResult() not yet implemented',
  ).toBe('function');
  return fn as (entry: unknown) => string;
}

function loadStageSnapshot(
  ledger: unknown,
): (stage: unknown, profile: unknown) => Record<string, unknown> {
  const fn = (ledger as Record<string, unknown>)['getStageReportSnapshot'];
  expect(
    typeof fn,
    'RED: strict ledger getStageReportSnapshot() not yet implemented',
  ).toBe('function');
  return fn as (stage: unknown, profile: unknown) => Record<string, unknown>;
}

// ── Hermetic fixtures ────────────────────────────────────────────────────────

const tempDirs: string[] = [];

function taskTmpDir(): string {
  const env = process.env.TMPDIR;
  if (env !== undefined && env.length > 0) return env;
  return tmpdir();
}

function makeTempDir(): string {
  const dir = mkdtempSync(join(taskTmpDir(), 'calorix-stage-outcomes-'));
  tempDirs.push(dir);
  return dir;
}

beforeEach(() => {
  vi.stubGlobal('fetch', () => {
    throw new Error('network disabled in stage-outcomes tests');
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop() as string;
    rmSync(dir, { recursive: true, force: true });
  }
});

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function makeIdentity(): CalibrationIdentity {
  return {
    protocolVersion: 'v1',
    provider: 'vertex-ai',
    model: 'gemini-3.8-flash',
    implementationCommit: 'ab'.repeat(20),
    functionsTreeId: 'cd'.repeat(20),
    datasetHash: 'ef'.repeat(32),
    promptHash: '01'.repeat(32),
    responseSchemaHash: '23'.repeat(32),
    sourceLockHash: '45'.repeat(32),
    manifestHash: '67'.repeat(32),
    publicManifestHash: '89'.repeat(32),
    snapshotLockHash: 'ab'.repeat(32),
    historicalReferenceHash: 'cd'.repeat(32),
    plannedImageCalls: 146,
    hardCeiling: 300,
  };
}

function makeOwner(): CalibrationOwner {
  return {
    hostname: 'stage-outcomes-tests',
    bootId: 'stage-outcomes-boot',
    pid: 4242,
    startTicks: 4242,
    acquiredAt: '2026-10-07T00:00:00.000Z',
  };
}

// Real committed corpus IDs (never fabricated; order matches committed manifests).
const FIRST_DEV = 'calibration-dish_1565117892';

function readManifestCaseIds(group: string): string[] {
  const parsed = JSON.parse(
    readFileSync(resolve(repoRoot, 'functions/eval/nutrition/calibration-manifest.json'), 'utf8'),
  ) as { cases: Array<{ id: string; group: string }> };
  return parsed.cases.filter((c) => c.group === group).map((c) => c.id);
}

function devCaseIds(): string[] {
  return readManifestCaseIds('development');
}

function validationCaseIds(): string[] {
  return readManifestCaseIds('validation');
}

function publicCaseIds(scanMode: string): string[] {
  const parsed = JSON.parse(
    readFileSync(resolve(repoRoot, 'functions/eval/nutrition/public-manifest.json'), 'utf8'),
  ) as { cases: Array<{ id: string; scanMode: string }> };
  return parsed.cases.filter((c) => c.scanMode === scanMode).map((c) => c.id);
}

/** Real image resolver: unchanged deriveCanonicalAllowedKeys on owned committed strings. */
function makeInitial50Resolver(
  tracker?: { calls: number; selected: unknown[] },
  filesOverride?: Record<string, string>,
): CalibrationKeyResolver {
  const files = filesOverride ?? buildVerifiedFiles();
  const derive = (bootstrapModule as Record<string, unknown>)[
    'deriveCanonicalAllowedKeys'
  ] as (files: unknown, selectedProfile?: unknown) => readonly ReservationKey[];
  return ((selectedProfile?: unknown) => {
    if (tracker !== undefined) {
      tracker.calls += 1;
      tracker.selected.push(selectedProfile);
    }
    return derive(files, selectedProfile);
  }) as CalibrationKeyResolver;
}

interface OpenStrictOptions {
  readonly reportOptions?: unknown;
  readonly clock?: { calls: number };
  readonly files?: Record<string, string>;
  readonly tracker?: { calls: number; selected: unknown[] };
  readonly effects?: { appends: number; fsyncs: number };
}

function openStrictLedger(
  baseDir: string,
  options: OpenStrictOptions = {},
): {
  ledger: ReturnType<typeof createProtocolCalibrationLedger>;
  owner: CalibrationOwner;
  tracker: { calls: number; selected: unknown[] };
  clock: { calls: number };
  effects: { appends: number; fsyncs: number };
} {
  const identity = makeIdentity();
  const tracker = options.tracker ?? { calls: 0, selected: [] as unknown[] };
  const files = options.files ?? buildVerifiedFiles();
  const resolver = makeInitial50Resolver(tracker, files);
  const clock = options.clock ?? { calls: 0 };
  const effects = options.effects ?? { appends: 0, fsyncs: 0 };
  const baseDeps = createFileCalibrationLedgerDeps(baseDir);
  const fileDeps = {
    ...baseDeps,
    appendJournal: ((entry: JournalEntry) => {
      effects.appends += 1;
      return baseDeps.appendJournal(entry);
    }) as typeof baseDeps.appendJournal,
    fsyncLedgerFile: (() => {
      effects.fsyncs += 1;
      return baseDeps.fsyncLedgerFile();
    }) as typeof baseDeps.fsyncLedgerFile,
    fsyncLedgerDir: (() => {
      effects.fsyncs += 1;
      return baseDeps.fsyncLedgerDir();
    }) as typeof baseDeps.fsyncLedgerDir,
    fsyncJournalFile: (() => {
      effects.fsyncs += 1;
      return baseDeps.fsyncJournalFile();
    }) as typeof baseDeps.fsyncJournalFile,
    fsyncJournalDir: (() => {
      effects.fsyncs += 1;
      return baseDeps.fsyncJournalDir();
    }) as typeof baseDeps.fsyncJournalDir,
    nowIso: () => {
      clock.calls += 1;
      const seconds = String(clock.calls % 60).padStart(2, '0');
      return `2026-10-07T00:00:${seconds}.000Z`;
    },
  };
  const args: unknown[] = [fileDeps, identity, resolver];
  if (options.reportOptions !== undefined) args.push(options.reportOptions);
  const ledger = (createProtocolCalibrationLedger as (...a: unknown[]) => ReturnType<typeof createProtocolCalibrationLedger>)(...args);
  return { ledger, owner: makeOwner(), tracker, clock, effects };
}

function makeReportOptions(files: Record<string, string>): Record<string, unknown> {
  const derive = (bootstrapModule as Record<string, unknown>)[
    'deriveCanonicalReportOutcomePlan'
  ] as (files: unknown, selectedProfile?: unknown) => readonly unknown[];
  return {
    getReportOutcomePlan: (selectedProfile?: unknown) => {
      const plan = derive(files, selectedProfile);
      return [...plan];
    },
  };
}

const STAGE_PIN_VERSION = 'gemini-3.8-test-pin-001';

function preflightSummary(): Record<string, unknown> {
  return { stage: 'preflight', passed: true, completedStages: [] };
}

function developmentSummary(): Record<string, unknown> {
  return { stage: 'development', passed: true, completedStages: ['preflight'] };
}

function validationSummary(): Record<string, unknown> {
  return { stage: 'validation', passed: true, completedStages: ['preflight', 'development'] };
}

function fullSuccessEntry(
  key: ReservationKey,
  version: string,
  prediction: NutritionPrediction,
): JournalEntry {
  const four = {
    kcal: prediction.kcal as number,
    proteinG: prediction.proteinG as number,
    carbsG: prediction.carbsG as number,
    fatG: prediction.fatG as number,
  };
  const diagnostics = (prediction as unknown as Record<string, unknown>)[
    'diagnostics'
  ] as Record<string, unknown> | undefined;
  const mass = diagnostics?.['estimatedTotalMassG'] as number | undefined;
  const normalized: Record<string, number> =
    mass === undefined ? { ...four } : { ...four, estimatedTotalMassG: mass };
  return {
    key: { ...key },
    predictionHash: sha256Hex(JSON.stringify(four)),
    normalizedPrediction: { ...normalized },
    analysisLatencyMs: prediction.latencyMs as number,
    errorCategory: 'none',
    responseModelVersion: version,
    reportPrediction: { ...(prediction as unknown as Record<string, unknown>) },
  } as unknown as JournalEntry;
}

function reservePreflightPair(
  ledger: ReturnType<typeof createProtocolCalibrationLedger>,
  first: string,
): { low: ReservationKey; medium: ReservationKey } {
  const tokenKey = { kind: 'token_count', stage: 'preflight', caseId: first, model: 'gemini-3.8-flash' } as const;
  ledger.reserveTokenCount(tokenKey);
  ledger.completeTokenCount(tokenKey, 42);
  const low: ReservationKey = { stage: 'preflight', profile: 'LOW', caseId: first, sampleIndex: 1 };
  const medium: ReservationKey = { stage: 'preflight', profile: 'MEDIUM', caseId: first, sampleIndex: 1 };
  ledger.reserve(low);
  ledger.pinModelVersion(STAGE_PIN_VERSION);
  const lowEntry = fullSuccessEntry(low, STAGE_PIN_VERSION, mealSuccessPrediction(1));
  const lowHash = ledger.appendResultJournal(lowEntry);
  ledger.complete(low, lowHash);
  ledger.reserve(medium);
  const mediumEntry = fullSuccessEntry(medium, STAGE_PIN_VERSION, mealSuccessPrediction(1));
  const mediumHash = ledger.appendResultJournal(mediumEntry);
  ledger.complete(medium, mediumHash);
  return { low, medium };
}

function completeDevelopment48(ledger: ReturnType<typeof createProtocolCalibrationLedger>): void {
  for (const caseId of devCaseIds()) {
    for (const profile of ['LOW', 'MEDIUM'] as const) {
      const key = { stage: 'development', profile, caseId, sampleIndex: 1 } as ReservationKey;
      ledger.reserve(key);
      const entry = fullSuccessEntry(key, STAGE_PIN_VERSION, mealSuccessPrediction(1));
      ledger.complete(key, ledger.appendResultJournal(entry));
    }
  }
}

function completeValidation48(
  ledger: ReturnType<typeof createProtocolCalibrationLedger>,
  profile: 'LOW' | 'MEDIUM',
): void {
  for (const caseId of validationCaseIds()) {
    for (let sample = 1; sample <= 3; sample += 1) {
      const key = { stage: 'validation', profile, caseId, sampleIndex: sample } as ReservationKey;
      ledger.reserve(key);
      const entry = fullSuccessEntry(key, STAGE_PIN_VERSION, mealSuccessPrediction(sample));
      ledger.complete(key, ledger.appendResultJournal(entry));
    }
  }
}

function legacySuccessEntry(key: ReservationKey, version: string): JournalEntry {
  const normalized = { kcal: 320, proteinG: 20, carbsG: 30, fatG: 10 };
  return {
    key: { ...key },
    predictionHash: sha256Hex(JSON.stringify(normalized)),
    normalizedPrediction: { ...normalized },
    analysisLatencyMs: 11,
    errorCategory: 'none',
    responseModelVersion: version,
  };
}

// ── Closed prediction fixtures (validated against the existing codec) ────────

function mealSuccessPrediction(sampleIndex: number): NutritionPrediction {
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
    latencyMs: 17,
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
  } as NutritionPrediction;
}

function barcodeSuccessPrediction(sampleIndex: number): NutritionPrediction {
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
    latencyMs: 21,
    sampleIndex,
    cached: false,
  } as NutritionPrediction;
}

function datasetFailurePrediction(sampleIndex: number, source: 'meal' | 'barcode' = 'meal'): NutritionPrediction {
  return {
    parseStatus: 'failure',
    source,
    decision: 'error',
    failureCategory: 'dataset',
    failureCode: 'dataset_fetch_failed',
    latencyMs: 9,
    sampleIndex,
    cached: false,
  } as NutritionPrediction;
}

function productFailurePrediction(sampleIndex: number, code: 'off_product_invalid' | 'off_product_not_found'): NutritionPrediction {
  return {
    parseStatus: 'failure',
    source: 'barcode',
    decision: 'error',
    failureCategory: 'product',
    failureCode: code,
    latencyMs: 9,
    sampleIndex,
    cached: false,
  } as NutritionPrediction;
}

function providerFailurePrediction(sampleIndex: number): NutritionPrediction {
  return {
    parseStatus: 'failure',
    source: 'meal',
    decision: 'error',
    failureCategory: 'provider',
    failureCode: 'provider_request_failed',
    latencyMs: 9,
    sampleIndex,
    cached: false,
  } as NutritionPrediction;
}

function providerFailureJournal(
  key: ReservationKey,
  prediction: NutritionPrediction,
): JournalEntry {
  return {
    key: { ...key },
    // Existing closed codec (calibration-report-journal) requires failure
    // rows to carry predictionHash === errorCategory and version 'n/a'.
    predictionHash: 'http_429',
    normalizedPrediction: null,
    analysisLatencyMs: prediction.latencyMs as number,
    errorCategory: 'http_429',
    responseModelVersion: 'n/a',
    reportPrediction: { ...(prediction as unknown as Record<string, unknown>) },
  } as unknown as JournalEntry;
}

// ── Real committed manifest bytes ────────────────────────────────────────────

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

function readCommittedAsset(relPath: string): string {
  return readFileSync(resolve(repoRoot, relPath), 'utf8');
}

function buildVerifiedFiles(): Record<string, string> {
  const promptBytes = JSON.stringify([
    MEAL_ANALYSIS_PROMPT,
    LABEL_ANALYSIS_PROMPT,
    BARCODE_ANALYSIS_PROMPT,
  ]);
  const schemaBytes = JSON.stringify([
    visionResponseJsonSchema('meal'),
    visionResponseJsonSchema('label'),
    visionResponseJsonSchema('barcode'),
  ]);
  return {
    'public-manifest': readCommittedAsset('functions/eval/nutrition/public-manifest.json'),
    prompt: promptBytes,
    'response-schema': schemaBytes,
    'source-lock': readCommittedAsset('functions/eval/nutrition/calibration-source-lock.json'),
    'calibration-manifest': readCommittedAsset('functions/eval/nutrition/calibration-manifest.json'),
    'off-lock': readCommittedAsset('functions/eval/nutrition/off-snapshot-lock.json'),
    'historical-reference': readCommittedAsset(
      'functions/eval/nutrition/historical-reference-v1.json',
    ),
  };
}

// ── GREEN: source truth characterization (proves fixtures, not new behavior) ──

describe('stage outcomes source truth (GREEN)', () => {
  it('real calibration manifest holds 24 development + 16 validation meal cases', () => {
    // Break caught: test would silently bind the wrong slot order if the
    // committed corpus changed shape.
    const parsed = JSON.parse(
      readCommittedAsset('functions/eval/nutrition/calibration-manifest.json'),
    ) as { cases: Array<{ id: string; group: string; scanMode: string }> };
    expect(parsed.cases).toHaveLength(40);
    expect(parsed.cases.filter((c) => c.group === 'development')).toHaveLength(24);
    expect(parsed.cases.filter((c) => c.group === 'validation')).toHaveLength(16);
    for (const c of parsed.cases) expect(c.scanMode).toBe('meal');
  });

  it('real public manifest holds 12 meal + 4 label + 4 barcode cases', () => {
    // Break caught: barcode-only extra-12 arithmetic depends on exactly 4
    // supplied-barcode benchmark cases.
    const parsed = JSON.parse(
      readCommittedAsset('functions/eval/nutrition/public-manifest.json'),
    ) as { cases: Array<{ id: string; scanMode: string }> };
    expect(parsed.cases).toHaveLength(20);
    expect(parsed.cases.filter((c) => c.scanMode === 'meal')).toHaveLength(12);
    expect(parsed.cases.filter((c) => c.scanMode === 'label')).toHaveLength(4);
    expect(parsed.cases.filter((c) => c.scanMode === 'barcode')).toHaveLength(4);
  });

  it('closed prediction fixtures satisfy the existing prediction codec', () => {
    // Break caught: an invalid Task1 barcode/dataset fixture would be blamed
    // on the new codec instead of the test itself.
    expect(NutritionPredictionSchema.safeParse(mealSuccessPrediction(1)).success).toBe(true);
    expect(NutritionPredictionSchema.safeParse(barcodeSuccessPrediction(1)).success).toBe(true);
    expect(NutritionPredictionSchema.safeParse(datasetFailurePrediction(1)).success).toBe(true);
    expect(NutritionPredictionSchema.safeParse(providerFailurePrediction(1)).success).toBe(true);
    expect(
      NutritionPredictionSchema.safeParse(productFailurePrediction(2, 'off_product_not_found')).success,
    ).toBe(true);
    expect(
      NutritionPredictionSchema.safeParse(productFailurePrediction(1, 'off_product_invalid')).success,
    ).toBe(true);
    // Existing closed codec accepts these shapes as owned frozen copies.
    const copied = captureCalibrationReportPrediction(mealSuccessPrediction(1));
    expect(copied).toEqual(mealSuccessPrediction(1));
    expect(Object.isFrozen(copied)).toBe(true);
  });

  it('diagnostic mass without detectedItemCount is rejected by the existing codec', () => {
    // Break caught: Task1 fixtures must not smuggle estimatedTotalMassG
    // without detectedItemCount into durable outcomes.
    const bad = mealSuccessPrediction(1) as unknown as Record<string, unknown>;
    const diagnostics = { ...(bad['diagnostics'] as Record<string, unknown>) };
    delete diagnostics['detectedItemCount'];
    bad['diagnostics'] = diagnostics;
    expect(NutritionPredictionSchema.safeParse(bad).success).toBe(false);
  });

  it('legacy six-field journal bytes keep their field order and hash', () => {
    // Break caught: Task1 must not change the serialized six-field layout or
    // its SHA256 stability.
    const key: ReservationKey = { stage: 'preflight', profile: 'LOW', caseId: FIRST_DEV, sampleIndex: 1 };
    const entry = legacySuccessEntry(key, 'gemini-3.8-test-pin-001');
    expect(Object.keys(entry)).toEqual([
      'key',
      'predictionHash',
      'normalizedPrediction',
      'analysisLatencyMs',
      'errorCategory',
      'responseModelVersion',
    ]);
    expect(entry.predictionHash).toBe(sha256Hex(JSON.stringify({ kcal: 320, proteinG: 20, carbsG: 30, fatG: 10 })));
    expect(NutritionPredictionSchema.safeParse(mealSuccessPrediction(1)).success).toBe(true);
  });
});

// ── RED: new module / planner / ledger methods stay missing ──────────────────

describe('stage outcomes new exports (RED)', () => {
  it('loads the new report-state module without a collection error', async () => {
    // Break caught: a static import of the absent module would break
    // collection for the whole file instead of one healthy RED assertion.
    await loadReportState();
  });

  it('exposes the source-derived outcome planner from bootstrap', () => {
    // Break caught: Task2 consumes the same planner; a missing export here
    // would silently fork two planners.
    loadOutcomePlanner();
  });

  it('exposes strict-only record and snapshot methods on the protocol ledger', () => {
    // Break caught: adding these to the legacy ledger would widen the
    // non-strict write surface.
    const baseDir = makeTempDir();
    const { ledger } = openStrictLedger(baseDir);
    loadRecordNonReservation(ledger);
    loadStageSnapshot(ledger);
  });

  it('legacy three-argument callers keep working after the optional fourth param', () => {
    // Break caught: adding optional reportOptions must not break existing
    // three-argument strict callers; behavior (not runtime arity) is the contract.
    const baseDir = makeTempDir();
    const { ledger, owner } = openStrictLedger(baseDir);
    ledger.acquireLock(owner);
    reservePreflightPair(ledger, FIRST_DEV);
    ledger.completeStage('preflight', preflightSummary() as never);
    expect(ledger.getCompletedStages()).toEqual(['preflight']);
    expect(ledger.getPinnedModelVersion()).toBe(STAGE_PIN_VERSION);
    // Existing file persistence still round-trips journals and events.
    const journals = createFileCalibrationLedgerDeps(baseDir).readJournalEntries();
    expect(journals).toHaveLength(2);
    const events = createFileCalibrationLedgerDeps(baseDir).readLedgerEvents() as Array<Record<string, unknown>>;
    expect(events.length).toBeGreaterThan(0);
  });

  it('GREEN: valid full lifecycle fixture completes without any new API', () => {
    // Break caught: proves the Task1 setup itself is valid using only
    // existing APIs; new-method RED failures elsewhere cannot be blamed on fixtures.
    const baseDir = makeTempDir();
    const { ledger, owner } = openStrictLedger(baseDir);
    ledger.acquireLock(owner);
    reservePreflightPair(ledger, FIRST_DEV);
    ledger.completeStage('preflight', preflightSummary() as never);
    completeDevelopment48(ledger);
    ledger.recordProfileSelection('MEDIUM', 'fewer_unsafe', developmentSummary() as never);
    ledger.completeStage('development', developmentSummary() as never);
    completeValidation48(ledger, 'MEDIUM');
    ledger.completeStage('validation', validationSummary() as never);
    expect(ledger.getCompletedStages()).toEqual(['preflight', 'development', 'validation']);
    expect(ledger.getSelectedProfile()).toBe('MEDIUM');
    expect(ledger.rebuildReport().completed).toHaveLength(2 + 48 + 48);
  });
});

// ── RED: source-derived outcome plan (frozen 50 / 158) ───────────────────────

describe('canonical report outcome plan (RED)', () => {
  it('derives a frozen initial 50 bound to exact image-key correspondence', () => {
    // Break caught: a planner that invents, drops, or reorders initial keys
    // would desynchronize the plan from deriveCanonicalAllowedKeys.
    const derive = loadOutcomePlanner();
    const files = buildVerifiedFiles();
    const plan = derive(files);
    expect(plan).toHaveLength(50);
    expect(Object.isFrozen(plan)).toBe(true);
    for (const row of plan) {
      expect(Object.isFrozen(row)).toBe(true);
      expect(Object.isFrozen(row.key)).toBe(true);
      expect(Object.keys(row).sort()).toEqual(['key', 'scanMode']);
      expect(Object.keys(row.key).sort()).toEqual(['caseId', 'profile', 'sampleIndex', 'stage']);
    }
    const imageKeys = (bootstrapModule as Record<string, unknown>)['deriveCanonicalAllowedKeys'] as (
      files: unknown,
      selectedProfile?: unknown,
    ) => readonly ReservationKey[];
    const allowed = imageKeys(files);
    expect(allowed).toHaveLength(50);
    const planIds = plan.map((row) => `${row.key.stage}|${row.key.profile}|${row.key.caseId}|${row.key.sampleIndex}`);
    const allowedIds = allowed.map((k) => `${k.stage}|${k.profile}|${k.caseId}|${k.sampleIndex}`);
    expect(new Set(planIds).size).toBe(50);
    expect([...planIds].sort()).toEqual([...allowedIds].sort());
    // Source slot order: preflight first-dev LOW/MED then 24 development LOW/MED.
    expect(plan[0]?.key).toEqual({ stage: 'preflight', profile: 'LOW', caseId: FIRST_DEV, sampleIndex: 1 });
    expect(plan[1]?.key).toEqual({ stage: 'preflight', profile: 'MEDIUM', caseId: FIRST_DEV, sampleIndex: 1 });
    expect(plan.filter((row) => row.key.stage === 'preflight')).toHaveLength(2);
    expect(plan.filter((row) => row.key.stage === 'development')).toHaveLength(48);
    for (const row of plan) {
      expect(row.key.sampleIndex).toBe(1);
      expect(row.scanMode).toBe('meal');
    }
    // No truth/URLs stored in the plan rows.
    for (const row of plan) {
      const text = JSON.stringify(row);
      expect(text).not.toContain('http');
      expect(text).not.toContain('truth');
    }
  });

  it('expands to 158 rows with 12 barcode-only benchmark keys at the selected profile', () => {
    // Break caught: storing truth/URLs in the plan or deriving benchmark
    // image keys from barcode cases would leak source data into the ledger.
    const derive = loadOutcomePlanner();
    const files = buildVerifiedFiles();
    const imageKeys = (bootstrapModule as Record<string, unknown>)['deriveCanonicalAllowedKeys'] as (
      files: unknown,
      selectedProfile?: unknown,
    ) => readonly ReservationKey[];
    for (const profile of ['LOW', 'MEDIUM'] as const) {
      const expanded = derive(files, profile);
      expect(expanded).toHaveLength(158);
      expect(Object.isFrozen(expanded)).toBe(true);
      const imageRows = expanded.filter((row) => row.scanMode !== 'barcode');
      const barcodeRows = expanded.filter((row) => row.scanMode === 'barcode');
      expect(imageRows).toHaveLength(146);
      expect(barcodeRows).toHaveLength(12);
      // Image-key correspondence: 146 plan image keys equal 146 allowed image keys.
      const allowed = imageKeys(files, profile);
      expect(allowed).toHaveLength(146);
      const imageIds = imageRows.map((row) => `${row.key.stage}|${row.key.profile}|${row.key.caseId}|${row.key.sampleIndex}`).sort();
      const allowedIds = allowed.map((k) => `${k.stage}|${k.profile}|${k.caseId}|${k.sampleIndex}`).sort();
      expect(imageIds).toEqual(allowedIds);
      // Initial 50 prefix preserved in order.
      const initial = derive(files);
      expect(expanded.slice(0, 50).map((r) => JSON.stringify(r))).toEqual(
        initial.map((r) => JSON.stringify(r)),
      );
      for (const row of barcodeRows) {
        expect(row.key.stage).toBe('benchmark');
        expect(row.key.profile).toBe(profile);
        expect([1, 2, 3]).toContain(row.key.sampleIndex);
        expect(Object.isFrozen(row)).toBe(true);
        expect(Object.isFrozen(row.key)).toBe(true);
      }
      // Barcode rows come from the 4 supplied-barcode public cases x3 samples.
      const barcodeCaseIds = new Set(barcodeRows.map((row) => row.key.caseId));
      expect([...barcodeCaseIds].sort()).toEqual(publicCaseIds('barcode').sort());
      // Benchmark vision split: 12 meal x3 + 4 label x3 image rows, all selected profile.
      const benchImage = imageRows.filter((row) => row.key.stage === 'benchmark');
      expect(benchImage).toHaveLength(48);
      expect(benchImage.filter((r) => r.scanMode === 'meal')).toHaveLength(36);
      expect(benchImage.filter((r) => r.scanMode === 'label')).toHaveLength(12);
      for (const row of benchImage) expect(row.key.profile).toBe(profile);
      // Preflight/dev/validation image rows stay meal-only.
      for (const row of expanded.filter((row) => row.key.stage !== 'benchmark')) {
        expect(row.scanMode).toBe('meal');
      }
    }
  });

  it('takes scanMode from source and rejects unknown or altered sources', () => {
    // Break caught: trusting caller prediction scanMode would let a barcode
    // masquerade as a meal row (or vice versa).
    const derive = loadOutcomePlanner();
    const files = buildVerifiedFiles();
    const plan = derive(files, 'MEDIUM');
    const byId = new Map(plan.map((row) => [`${row.key.caseId}:${row.key.sampleIndex}`, row.scanMode]));
    // Spot literals from the committed public corpus (meal/label/barcode provenance).
    expect(byId.get('off-5449000000996:1')).toBe('barcode');
    expect(byId.get('off-8076809513753:1')).toBe('label');
    expect(byId.get('n5k-dish_1565035746:1')).toBe('meal');
    const altered = { ...files, 'calibration-manifest': files['calibration-manifest'].slice(0, -2) + 'XX' };
    expect(() => derive(altered)).toThrow(CalibrationFatalError);
    try {
      derive(altered);
    } catch (error) {
      expect(error).toBeInstanceOf(CalibrationFatalError);
      expect((error as CalibrationFatalError).message).toBe('calibration:report-outcome-plan-invalid');
    }
    expect(() => derive({ ...files, extra: '{}' })).toThrow(CalibrationFatalError);
    expect(() => derive({ ...files, 'public-manifest': 42 as unknown as string })).toThrow(CalibrationFatalError);
  });

  it('captures the optional own-data callback once initially and once before expansion', () => {
    // Break caught: rereading a mutable resolver or invoking callbacks from
    // readonly snapshots would let caller mutation change plan identity.
    const baseDir = makeTempDir();
    const identity = makeIdentity();
    const files = buildVerifiedFiles();
    const derive = loadOutcomePlanner();
    const initialPlan = derive(files);
    const expandedPlan = derive(files, 'MEDIUM');
    let initialCalls = 0;
    let selectedCalls = 0;
    const reportOptions = {
      getReportOutcomePlan: (selectedProfile?: unknown) => {
        if (selectedProfile === undefined) {
          initialCalls += 1;
          return [...initialPlan];
        }
        selectedCalls += 1;
        expect(selectedProfile).toBe('MEDIUM');
        return [...expandedPlan];
      },
    };
    const tracker = { calls: 0, selected: [] as unknown[] };
    const clock = { calls: 0 };
    const baseDeps = createFileCalibrationLedgerDeps(baseDir);
    const fileDeps = {
      ...baseDeps,
      nowIso: () => {
        clock.calls += 1;
        return '2026-10-07T00:00:00.000Z';
      },
    };
    const resolver = makeInitial50Resolver(tracker, files);
    const ledger = (createProtocolCalibrationLedger as (...a: unknown[]) => unknown)(
      fileDeps,
      identity,
      resolver,
      reportOptions as unknown as Parameters<typeof createProtocolCalibrationLedger>[3],
    );
    // Strict factory MUST invoke the image resolver for the initial plan.
    expect(tracker.calls).toBeGreaterThanOrEqual(1);
    expect(initialCalls).toBe(1);
    expect(selectedCalls).toBe(0);
    expect(ledger).toBeDefined();
    // Readonly snapshot must never invoke the image resolver again.
    const before = tracker.calls;
    try {
      (ledger as { getStageReportSnapshot: (s: unknown, p: unknown) => unknown }).getStageReportSnapshot('preflight', 'LOW');
    } catch {
      // Missing method RED still proves no resolver call happened here.
    }
    expect(tracker.calls).toBe(before);
  });
});

// ── RED: durable non-reservation dataset outcomes ────────────────────────────

describe('durable dataset non-reservation outcomes (RED)', () => {
  it('records a dataset failure at an unreserved planned image key without reservations', async () => {
    // Break caught: silently converting a dataset zero-request outcome into
    // an image reservation would inflate the 146 budget and fake coverage.
    const baseDir = makeTempDir();
    const files = buildVerifiedFiles();
    const { ledger, owner, clock } = openStrictLedger(baseDir, {
      files,
      reportOptions: makeReportOptions(files),
    });
    ledger.acquireLock(owner);
    reservePreflightPair(ledger, FIRST_DEV);
    ledger.completeStage('preflight', preflightSummary() as never);
    const clockBefore = clock.calls;
    const before = ledger.getCounts();
    const record = loadRecordNonReservation(ledger);
    const devIds = devCaseIds();
    const key: ReportOutcomeKey = { stage: 'development', profile: 'LOW', caseId: devIds[1] as string, sampleIndex: 1 };
    const prediction = datasetFailurePrediction(1);
    const digest = record({ key, reason: 'dataset', prediction }) as string;
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(ledger.getCounts()).toEqual(before);
    const snapshot = loadStageSnapshot(ledger)('development', 'LOW') as {
      nonReservations: Array<{ key: unknown; reason: string; prediction: unknown; contentDigest: string; at: string }>;
      counts: { imageCallsReserved: number };
    };
    expect(snapshot.nonReservations).toHaveLength(1);
    expect(snapshot.nonReservations[0]?.reason).toBe('dataset');
    expect(snapshot.nonReservations[0]?.contentDigest).toBe(digest);
    expect(snapshot.counts.imageCallsReserved).toBe(0);
    // Manual digest binds key/reason/prediction/at, never the digest itself.
    const at = snapshot.nonReservations[0]?.at as string;
    expect(clockBefore).toBe(9);
    expect(at).toBe('2026-10-07T00:00:10.000Z');
    expect(clock.calls).toBe(clockBefore + 1);
    const manual = sha256Hex(JSON.stringify({ key, reason: 'dataset', prediction, at }));
    expect(digest).toBe(manual);
    expect(Object.isFrozen(snapshot.nonReservations[0]?.prediction)).toBe(true);
    expect(Object.isFrozen(snapshot.nonReservations)).toBe(true);
  });

  it('preserves measured runtime metadata across a real disk restart', async () => {
    // Break caught: losing latency/digest/timestamp on restart would make
    // reruns invent fresh evidence instead of replaying durable outcomes.
    const baseDir = makeTempDir();
    const files = buildVerifiedFiles();
    const { ledger, owner } = openStrictLedger(baseDir, {
      files,
      reportOptions: makeReportOptions(files),
    });
    ledger.acquireLock(owner);
    reservePreflightPair(ledger, FIRST_DEV);
    ledger.completeStage('preflight', preflightSummary() as never);
    const record = loadRecordNonReservation(ledger);
    const devIds = devCaseIds();
    const key: ReportOutcomeKey = { stage: 'development', profile: 'MEDIUM', caseId: devIds[2] as string, sampleIndex: 1 };
    const prediction = datasetFailurePrediction(1);
    const digest = record({ key, reason: 'dataset', prediction }) as string;
    const before = loadStageSnapshot(ledger)('development', 'MEDIUM') as unknown as Record<string, unknown>;
    ledger.releaseLock(owner);
    const reopened = (createProtocolCalibrationLedger as (...a: unknown[]) => ReturnType<typeof createProtocolCalibrationLedger>)(
      createFileCalibrationLedgerDeps(baseDir),
      makeIdentity(),
      makeInitial50Resolver(undefined, files),
      makeReportOptions(files),
    );
    const after = loadStageSnapshot(reopened)('development', 'MEDIUM') as unknown as Record<string, unknown>;
    expect(after).toEqual(before);
    expect((after['nonReservations'] as Array<{ contentDigest: string }>)[0]?.contentDigest).toBe(digest);
    // Latency/digest/timestamp are replayed, not re-measured.
    expect((after['nonReservations'] as Array<{ at: string }>)[0]?.at).toBe(
      (before['nonReservations'] as Array<{ at: string }>)[0]?.at,
    );
  });

  it('rejects dataset success at an image key without a reservation', async () => {
    // Break caught: accepting an image-key success without reserve would let
    // callers manufacture completed coverage without vision work.
    const baseDir = makeTempDir();
    const files = buildVerifiedFiles();
    const { ledger, owner } = openStrictLedger(baseDir, {
      files,
      reportOptions: makeReportOptions(files),
    });
    ledger.acquireLock(owner);
    reservePreflightPair(ledger, FIRST_DEV);
    ledger.completeStage('preflight', preflightSummary() as never);
    const record = loadRecordNonReservation(ledger);
    const devIds = devCaseIds();
    const key: ReportOutcomeKey = { stage: 'development', profile: 'LOW', caseId: devIds[3] as string, sampleIndex: 1 };
    expect(() =>
      record({ key, reason: 'dataset', prediction: mealSuccessPrediction(1) }),
    ).toThrow(CalibrationFatalError);
    // Dataset reason also rejects barcode predictions at image keys.
    const barcodeKey: ReportOutcomeKey = { stage: 'development', profile: 'LOW', caseId: devIds[4] as string, sampleIndex: 1 };
    expect(() =>
      record({ key: barcodeKey, reason: 'dataset', prediction: barcodeSuccessPrediction(1) }),
    ).toThrow(CalibrationFatalError);
  });
});

// ── RED: barcode success and stable product failures ─────────────────────────

describe('barcode non-reservation outcomes (RED)', () => {
  it('records a valid barcode success at a selected benchmark barcode key', async () => {
    // Break caught: dropping a real barcode success would lose 12 legitimate
    // zero-vision outcomes from the benchmark report.
    const baseDir = makeTempDir();
    const files = buildVerifiedFiles();
    const { ledger, owner } = openStrictLedger(baseDir, {
      files,
      reportOptions: makeReportOptions(files),
    });
    ledger.acquireLock(owner);
    reservePreflightPair(ledger, FIRST_DEV);
    ledger.completeStage('preflight', preflightSummary() as never);
    completeDevelopment48(ledger);
    ledger.recordProfileSelection('MEDIUM', 'fewer_unsafe', developmentSummary() as never);
    ledger.completeStage('development', developmentSummary() as never);
    completeValidation48(ledger, 'MEDIUM');
    ledger.completeStage('validation', validationSummary() as never);
    const record = loadRecordNonReservation(ledger);
    const barcodeIds = publicCaseIds('barcode');
    const key: ReportOutcomeKey = { stage: 'benchmark', profile: 'MEDIUM', caseId: barcodeIds[1] as string, sampleIndex: 1 };
    const before = ledger.getCounts();
    const digest = record({ key, reason: 'barcode', prediction: barcodeSuccessPrediction(1) }) as string;
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(ledger.getCounts()).toEqual(before);
    const snapshot = loadStageSnapshot(ledger)('benchmark', 'MEDIUM') as {
      nonReservations: Array<{ key: ReportOutcomeKey; reason: string; contentDigest: string }>;
    };
    expect(snapshot.nonReservations).toHaveLength(1);
    expect(snapshot.nonReservations[0]?.contentDigest).toBe(digest);
  });

  it.each([
    ['off_product_invalid'],
    ['off_product_not_found'],
  ] as const)('records stable product failure %s without reservations', async (code) => {
    // Break caught: silently discarding a catalog/normalization failure
    // would hide OFF gaps as missing coverage instead of measured failures.
    const baseDir = makeTempDir();
    const files = buildVerifiedFiles();
    const { ledger, owner } = openStrictLedger(baseDir, {
      files,
      reportOptions: makeReportOptions(files),
    });
    ledger.acquireLock(owner);
    reservePreflightPair(ledger, FIRST_DEV);
    ledger.completeStage('preflight', preflightSummary() as never);
    completeDevelopment48(ledger);
    ledger.recordProfileSelection('MEDIUM', 'fewer_unsafe', developmentSummary() as never);
    ledger.completeStage('development', developmentSummary() as never);
    completeValidation48(ledger, 'MEDIUM');
    ledger.completeStage('validation', validationSummary() as never);
    const record = loadRecordNonReservation(ledger);
    const barcodeIds = publicCaseIds('barcode');
    const key: ReportOutcomeKey = { stage: 'benchmark', profile: 'MEDIUM', caseId: barcodeIds[0] as string, sampleIndex: 2 };
    const before = ledger.getCounts();
    const digest = record({ key, reason: 'barcode', prediction: productFailurePrediction(2, code) }) as string;
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(ledger.getCounts()).toEqual(before);
    // Catalog/normalization failures are never silently discarded.
    expect(() =>
      record({ key: { ...key, sampleIndex: 3 }, reason: 'barcode', prediction: mealSuccessPrediction(3) }),
    ).toThrow(CalibrationFatalError);
  });

  it('uses only valid closed barcode fixtures; Task2 owns OFF proof', () => {
    // Break caught: an open barcode text/code here would duplicate Task2
    // snapshot/normalizer proof instead of staying a closed validity check.
    expect(NutritionPredictionSchema.safeParse(barcodeSuccessPrediction(1)).success).toBe(true);
    expect(
      NutritionPredictionSchema.safeParse(productFailurePrediction(1, 'off_product_invalid')).success,
    ).toBe(true);
  });
});

// ── RED: strict prerequisites, legacy preservation, and terminal binding ─────

describe('strict prerequisites and terminal binding (RED)', () => {
  it('requires a real strict lifecycle before the snapshot; no hand-forced stage fields', async () => {
    // Break caught: forcing stage fields by hand would bypass token/pin and
    // fake stage readiness.
    const baseDir = makeTempDir();
    const { ledger, owner } = openStrictLedger(baseDir);
    ledger.acquireLock(owner);
    reservePreflightPair(ledger, FIRST_DEV);
    const snapshot = loadStageSnapshot(ledger)('preflight', 'LOW') as {
      counts: { imageCallsReserved: number; imageCallsCompleted: number; imageCallsPending: number };
    };
    expect(snapshot.counts.imageCallsReserved).toBe(1);
    expect(snapshot.counts.imageCallsCompleted).toBe(1);
    expect(snapshot.counts.imageCallsPending).toBe(0);
  });

  it('rejects the new event when no report options were supplied', async () => {
    // Break caught: accepting non-reservation rows without a pinned plan
    // would let unplanned keys enter durable reports.
    const baseDir = makeTempDir();
    const files = buildVerifiedFiles();
    const { ledger, owner } = openStrictLedger(baseDir, { files });
    ledger.acquireLock(owner);
    reservePreflightPair(ledger, FIRST_DEV);
    ledger.completeStage('preflight', preflightSummary() as never);
    const record = loadRecordNonReservation(ledger);
    const devIds = devCaseIds();
    const key: ReportOutcomeKey = { stage: 'development', profile: 'LOW', caseId: devIds[5] as string, sampleIndex: 1 };
    expect(() => record({ key, reason: 'dataset', prediction: datasetFailurePrediction(1) })).toThrow(
      CalibrationFatalError,
    );
  });

  it('keeps six-field legacy bytes, hash, and old APIs unchanged', () => {
    // Break caught (GREEN part): Task1 must not alter the six-field
    // serialization or the legacy complete/rebuild contract.
    const baseDir = makeTempDir();
    const files = buildVerifiedFiles();
    const { ledger, owner } = openStrictLedger(baseDir, { files });
    ledger.acquireLock(owner);
    const tokenKey = { kind: 'token_count', stage: 'preflight', caseId: FIRST_DEV, model: 'gemini-3.8-flash' } as const;
    ledger.reserveTokenCount(tokenKey);
    ledger.completeTokenCount(tokenKey, 42);
    const low: ReservationKey = { stage: 'preflight', profile: 'LOW', caseId: FIRST_DEV, sampleIndex: 1 };
    ledger.reserve(low);
    ledger.pinModelVersion(STAGE_PIN_VERSION);
    const legacyHash = ledger.appendResultJournal(legacySuccessEntry(low, STAGE_PIN_VERSION));
    expect(Object.keys(legacySuccessEntry(low, STAGE_PIN_VERSION))).toEqual([
      'key',
      'predictionHash',
      'normalizedPrediction',
      'analysisLatencyMs',
      'errorCategory',
      'responseModelVersion',
    ]);
    ledger.complete(low, legacyHash);
    expect(ledger.rebuildReport().completed).toHaveLength(1);
    // Old completed-only rebuild still accepts six-field rows; the new
    // full7-only accessors are exercised separately after the source step.
    const journals = createFileCalibrationLedgerDeps(baseDir).readJournalEntries() as Array<Record<string, unknown>>;
    expect(Object.keys(journals[0] as Record<string, unknown>).sort()).toEqual(
      ['analysisLatencyMs', 'errorCategory', 'key', 'normalizedPrediction', 'predictionHash', 'responseModelVersion'].sort(),
    );
  });

  it('resolves completed terminals only by recorded journalHash live and on replay', async () => {
    // Break caught: selecting an alternate same-key journal would rewrite a
    // bound completed digest with unrecorded bytes.
    const baseDir = makeTempDir();
    const files = buildVerifiedFiles();
    const { ledger, owner } = openStrictLedger(baseDir, {
      files,
      reportOptions: makeReportOptions(files),
    });
    ledger.acquireLock(owner);
    reservePreflightPair(ledger, FIRST_DEV);
    ledger.completeStage('preflight', preflightSummary() as never);
    const devIds = devCaseIds();
    const key = { stage: 'development', profile: 'LOW', caseId: devIds[6] as string, sampleIndex: 1 } as ReservationKey;
    ledger.reserve(key);
    const bound = fullSuccessEntry(key, STAGE_PIN_VERSION, mealSuccessPrediction(1));
    const hash = ledger.appendResultJournal(bound);
    ledger.complete(key, hash);
    // A DISTINCT alternate same-key journal with valid recomputed digest is
    // appended straight to the owned journal file via the real appendJournal
    // (never through the completed event). The bound completed digest,
    // full prediction, and measured latency must not move.
    const baseAlt = mealSuccessPrediction(1) as unknown as Record<string, unknown>;
    const altPred = {
      ...baseAlt,
      latencyMs: 99,
      diagnostics: { ...(baseAlt['diagnostics'] as Record<string, unknown>), estimatedTotalMassG: 120 },
    } as unknown as NutritionPrediction;
    expect(NutritionPredictionSchema.safeParse(altPred).success).toBe(true);
    const alternate = fullSuccessEntry(key, STAGE_PIN_VERSION, altPred);
    const alternateHash = sha256Hex(JSON.stringify(alternate));
    expect(alternateHash).not.toBe(hash);
    const fileStore = createFileCalibrationLedgerDeps(baseDir);
    fileStore.appendJournal(alternate);
    const journals = fileStore.readJournalEntries() as JournalEntry[];
    expect(journals.filter((j) => JSON.stringify(j.key) === JSON.stringify(key))).toHaveLength(2);
    const snapshot = loadStageSnapshot(ledger)('development', 'LOW') as {
      images: Array<Record<string, unknown>>;
    };
    const liveRow = snapshot.images.find(
      (row) => row['status'] === 'completed' && (row['key'] as ReservationKey).caseId === key.caseId,
    ) as Record<string, unknown> | undefined;
    expect(liveRow?.['journalHash']).toBe(hash);
    // Original full prediction retained, not the alternate measured latency.
    const liveJournal = liveRow?.['journal'] as Record<string, unknown>;
    expect(liveJournal['analysisLatencyMs']).toBe(17);
    expect((liveJournal['normalizedPrediction'] as Record<string, unknown>)['estimatedTotalMassG']).toBe(90);
    ledger.releaseLock(owner);
    const replay = (createProtocolCalibrationLedger as (...a: unknown[]) => ReturnType<typeof createProtocolCalibrationLedger>)(
      createFileCalibrationLedgerDeps(baseDir),
      makeIdentity(),
      makeInitial50Resolver(undefined, files),
      makeReportOptions(files),
    );
    const replayed = loadStageSnapshot(replay)('development', 'LOW') as {
      images: Array<Record<string, unknown>>;
    };
    const replayRow = replayed.images.find(
      (row) => row['status'] === 'completed' && (row['key'] as ReservationKey).caseId === key.caseId,
    ) as Record<string, unknown> | undefined;
    expect(replayRow?.['journalHash']).toBe(hash);
    const replayJournal = replayRow?.['journal'] as Record<string, unknown>;
    expect(replayJournal['analysisLatencyMs']).toBe(17);
    expect(replayRow?.['journalHash']).toBe(liveRow?.['journalHash']);
  });

  it('retains the failed digest when a later same-key journal is appended', async () => {
    // Break caught: a same-key success journal written after recovery must
    // not replace the bound canonical interruption digest on replay.
    const baseDir = makeTempDir();
    const files = buildVerifiedFiles();
    const { ledger, owner } = openStrictLedger(baseDir, {
      files,
      reportOptions: makeReportOptions(files),
    });
    ledger.acquireLock(owner);
    reservePreflightPair(ledger, FIRST_DEV);
    ledger.completeStage('preflight', preflightSummary() as never);
    const devIds = devCaseIds();
    const key = { stage: 'development', profile: 'LOW', caseId: devIds[18] as string, sampleIndex: 1 } as ReservationKey;
    ledger.reserve(key);
    const recovered = ledger.recoverAfterCrash();
    expect(recovered.interrupted).toContainEqual(key);
    // Exact failed event digest plus the canonical interruption body (manual SHA256).
    const store = createFileCalibrationLedgerDeps(baseDir);
    const events = store.readLedgerEvents() as Array<Record<string, unknown>>;
    const failedEvent = events.find(
      (event) => event['type'] === 'failed' && (event['key'] as ReservationKey).caseId === key.caseId,
    ) as Record<string, unknown>;
    expect(failedEvent).toBeDefined();
    const failedDigest = failedEvent['journalHash'] as string;
    expect(failedDigest).toMatch(/^[0-9a-f]{64}$/);
    const canonicalInterruption = {
      key: { ...key },
      predictionHash: 'interrupted_reservation',
      normalizedPrediction: null,
      analysisLatencyMs: 0,
      errorCategory: 'interrupted_reservation',
      responseModelVersion: 'n/a',
    };
    expect(failedDigest).toBe(sha256Hex(JSON.stringify(canonicalInterruption)));
    const liveSnap = loadStageSnapshot(ledger)('development', 'LOW') as {
      images: Array<Record<string, unknown>>;
    };
    const liveFailedRow = liveSnap.images.find(
      (row) => (row['key'] as ReservationKey).caseId === key.caseId,
    ) as Record<string, unknown> | undefined;
    expect(liveFailedRow?.['status']).toBe('interrupted_reservation');
    expect(liveFailedRow?.['journalHash']).toBe(failedDigest);
    expect('prediction' in (liveFailedRow as Record<string, unknown>)).toBe(false);
    expect('latencyMs' in (liveFailedRow as Record<string, unknown>)).toBe(false);
    ledger.releaseLock(owner);
    // A later valid same-key full7 journal appended directly to the owned file.
    const later = fullSuccessEntry(key, STAGE_PIN_VERSION, mealSuccessPrediction(1));
    store.appendJournal(later);
    expect(sha256Hex(JSON.stringify(later))).not.toBe(failedDigest);
    const failedReplay = (createProtocolCalibrationLedger as (...a: unknown[]) => ReturnType<typeof createProtocolCalibrationLedger>)(
      createFileCalibrationLedgerDeps(baseDir),
      makeIdentity(),
      makeInitial50Resolver(undefined, files),
      makeReportOptions(files),
    );
    const replayedFailed = loadStageSnapshot(failedReplay)('development', 'LOW') as {
      images: Array<Record<string, unknown>>;
    };
    const replayFailedRow = replayedFailed.images.find(
      (row) => (row['key'] as ReservationKey).caseId === key.caseId,
    ) as Record<string, unknown> | undefined;
    expect(replayFailedRow?.['status']).toBe('interrupted_reservation');
    expect(replayFailedRow?.['journalHash']).toBe(failedDigest);
    expect(replayFailedRow?.['journalHash']).toBe(liveFailedRow?.['journalHash']);
    expect('prediction' in (replayFailedRow as Record<string, unknown>)).toBe(false);
    expect('latencyMs' in (replayFailedRow as Record<string, unknown>)).toBe(false);
  });

  it('refuses the new snapshot for six-field numeric-only completed metadata', async () => {
    // Break caught: the completed projection requires full7 reportPrediction;
    // a legacy six-field success must fail report-prediction-missing, not be accepted.
    const baseDir = makeTempDir();
    const files = buildVerifiedFiles();
    const { ledger, owner } = openStrictLedger(baseDir, {
      files,
      reportOptions: makeReportOptions(files),
    });
    ledger.acquireLock(owner);
    const tokenKey = { kind: 'token_count', stage: 'preflight', caseId: FIRST_DEV, model: 'gemini-3.8-flash' } as const;
    ledger.reserveTokenCount(tokenKey);
    ledger.completeTokenCount(tokenKey, 42);
    const low: ReservationKey = { stage: 'preflight', profile: 'LOW', caseId: FIRST_DEV, sampleIndex: 1 };
    ledger.reserve(low);
    ledger.pinModelVersion(STAGE_PIN_VERSION);
    ledger.complete(low, ledger.appendResultJournal(legacySuccessEntry(low, STAGE_PIN_VERSION)));
    const medium: ReservationKey = { stage: 'preflight', profile: 'MEDIUM', caseId: FIRST_DEV, sampleIndex: 1 };
    ledger.reserve(medium);
    ledger.complete(medium, ledger.appendResultJournal(legacySuccessEntry(medium, STAGE_PIN_VERSION)));
    // Pre-source the snapshot method is missing (healthy RED); post-source it
    // must refuse six-field rows with report-prediction-missing.
    // The loader stays outside the try: pre-source its RED propagates as a
    // genuine missing-method failure; post-source the getter must refuse
    // six-field rows with report-prediction-missing (never accepted as green).
    const getSnap = loadStageSnapshot(ledger);
    try {
      getSnap('preflight', 'LOW');
      expect.unreachable('snapshot must refuse six-field completed metadata');
    } catch (error) {
      expect(error).toBeInstanceOf(CalibrationFatalError);
      expect((error as CalibrationFatalError).message).toMatch(/report-prediction-missing/);
    }
    // Old completed-only rebuild still accepts the same legacy rows.
    expect(ledger.rebuildReport().completed).toHaveLength(2);
  });

  it('retains the exact recorded journalHash for interrupted outcomes with no prediction', async () => {
    // Break caught: manufacturing a prediction or measured latency for an
    // interruption would invent evidence; sentinel 0 is not measured output.
    const baseDir = makeTempDir();
    const files = buildVerifiedFiles();
    const { ledger, owner } = openStrictLedger(baseDir, {
      files,
      reportOptions: makeReportOptions(files),
    });
    ledger.acquireLock(owner);
    reservePreflightPair(ledger, FIRST_DEV);
    ledger.completeStage('preflight', preflightSummary() as never);
    const devIds = devCaseIds();
    const key = { stage: 'development', profile: 'LOW', caseId: devIds[7] as string, sampleIndex: 1 } as ReservationKey;
    ledger.reserve(key);
    // Real interruption: reserved then crash-recovered (failed event), not append+complete.
    const recovered = ledger.recoverAfterCrash();
    expect(recovered.interrupted).toContainEqual(key);
    const journals = createFileCalibrationLedgerDeps(baseDir).readJournalEntries() as Array<Record<string, unknown>>;
    const boundHash = (journals.find((j) => (j['key'] as ReservationKey).caseId === key.caseId) as Record<string, unknown>)['predictionHash'];
    expect(boundHash).toBe('interrupted_reservation');
    const snapshot = loadStageSnapshot(ledger)('development', 'LOW') as {
      images: Array<Record<string, unknown>>;
    };
    const row = snapshot.images.find((entry) => (entry['key'] as ReservationKey).caseId === key.caseId) as
      | Record<string, unknown>
      | undefined;
    expect(row?.['status']).toBe('interrupted_reservation');
    expect('prediction' in (row as Record<string, unknown>)).toBe(false);
    expect('latencyMs' in (row as Record<string, unknown>)).toBe(false);
    // Same recorded hash live and after real restart.
    const liveHash = row?.['journalHash'];
    ledger.releaseLock(owner);
    const replay = (createProtocolCalibrationLedger as (...a: unknown[]) => ReturnType<typeof createProtocolCalibrationLedger>)(
      createFileCalibrationLedgerDeps(baseDir),
      makeIdentity(),
      makeInitial50Resolver(undefined, files),
      makeReportOptions(files),
    );
    const replayed = loadStageSnapshot(replay)('development', 'LOW') as {
      images: Array<Record<string, unknown>>;
    };
    expect(replayed.images.find((e) => (e['key'] as ReservationKey).caseId === key.caseId)?.['journalHash']).toBe(liveHash);
  });
});

// ── RED: counters, timestamps, conflicts, tamper, and hostile codecs ─────────

describe('snapshot counters and stable identity (RED)', () => {
  it('derives per stage/profile counters from actual reservations only', async () => {
    // Break caught: counting non-reservation rows as reserved/completed
    // would forge the 146-budget accounting.
    const baseDir = makeTempDir();
    const files = buildVerifiedFiles();
    const effects = { appends: 0, fsyncs: 0 };
    const clock = { calls: 0 };
    const tracker = { calls: 0, selected: [] as unknown[] };
    const { ledger, owner } = openStrictLedger(baseDir, {
      files,
      clock,
      tracker,
      effects,
      reportOptions: makeReportOptions(files),
    });
    ledger.acquireLock(owner);
    reservePreflightPair(ledger, FIRST_DEV);
    ledger.completeStage('preflight', preflightSummary() as never);
    const devIds = devCaseIds();
    // 1 completed image success with measured latency.
    const doneKey = { stage: 'development', profile: 'LOW', caseId: devIds[9] as string, sampleIndex: 1 } as ReservationKey;
    ledger.reserve(doneKey);
    ledger.complete(doneKey, ledger.appendResultJournal(fullSuccessEntry(doneKey, STAGE_PIN_VERSION, mealSuccessPrediction(1))));
    // 1 completed image provider failure: VALID closed failure prediction,
    // full7 outer errorCategory http_429, null prediction, stable token hash.
    const errKey = { stage: 'development', profile: 'LOW', caseId: devIds[10] as string, sampleIndex: 1 } as ReservationKey;
    const errPred = providerFailurePrediction(1);
    expect(NutritionPredictionSchema.safeParse(errPred).success).toBe(true);
    const errEntry = providerFailureJournal(errKey, errPred);
    ledger.reserve(errKey);
    const errHash = ledger.appendResultJournal(errEntry);
    ledger.complete(errKey, errHash);
    // 1 real interruption, recovered BEFORE the final pending reservation
    // (recover marks every currently-pending key as interrupted).
    const crashKey = { stage: 'development', profile: 'LOW', caseId: devIds[19] as string, sampleIndex: 1 } as ReservationKey;
    ledger.reserve(crashKey);
    const recovered = ledger.recoverAfterCrash();
    expect(recovered.interrupted).toContainEqual(crashKey);
    // 1 pending reservation last so it survives recovery.
    const pendingKey = { stage: 'development', profile: 'LOW', caseId: devIds[8] as string, sampleIndex: 1 } as ReservationKey;
    ledger.reserve(pendingKey);
    // 1 dataset non-reservation on a distinct planned key adds zero counts.
    const record = loadRecordNonReservation(ledger);
    const nrKey: ReportOutcomeKey = { stage: 'development', profile: 'LOW', caseId: devIds[20] as string, sampleIndex: 1 };
    const nrPred = datasetFailurePrediction(1);
    const nrDigest = record({ key: nrKey, reason: 'dataset', prediction: nrPred }) as string;
    expect(nrDigest).toMatch(/^[0-9a-f]{64}$/);
    const getSnap = loadStageSnapshot(ledger);
    const snapshot = getSnap('development', 'LOW') as unknown as Record<string, unknown>;
    const counts = snapshot['counts'] as Record<string, number>;
    // 4 LOW reservations: 1 success completed + 1 provider-failure failed +
    // 1 interruption failed + 1 pending; the dataset row is excluded.
    expect(counts).toEqual({
      imageCallsReserved: 4,
      imageCallsCompleted: 1,
      imageCallsFailed: 2,
      imageCallsPending: 1,
    });
    expect((counts['imageCallsCompleted'] as number) + (counts['imageCallsFailed'] as number) + (counts['imageCallsPending'] as number)).toBe(
      counts['imageCallsReserved'],
    );
    const nonReservations = snapshot['nonReservations'] as Array<Record<string, unknown>>;
    expect(nonReservations).toHaveLength(1);
    expect(nonReservations[0]?.['contentDigest']).toBe(nrDigest);
    // Provider-failure terminal resolves by recorded hash with stable token,
    // matching measured latency, and the pinned version.
    const images = snapshot['images'] as Array<Record<string, unknown>>;
    const errRow = images.find(
      (row) => (row['key'] as ReservationKey).caseId === errKey.caseId,
    ) as Record<string, unknown> | undefined;
    expect(errRow?.['journalHash']).toBe(errHash);
    const errJournal = errRow?.['journal'] as Record<string, unknown>;
    expect(errJournal['predictionHash']).toBe('http_429');
    expect(errJournal['analysisLatencyMs']).toBe(9);
    expect(errJournal['errorCategory']).toBe('http_429');
    expect(errJournal['normalizedPrediction']).toBeNull();
    expect(errJournal['responseModelVersion']).toBe('n/a');
    // Snapshot identity/pinned/optional-selected metadata plus deep freeze.
    expect(snapshot['identity']).toEqual(makeIdentity());
    expect(snapshot['pinnedModelVersion']).toBe(STAGE_PIN_VERSION);
    expect('selectedProfile' in snapshot).toBe(false);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(images)).toBe(true);
    expect(Object.isFrozen(nonReservations)).toBe(true);
    expect(Object.isFrozen(counts)).toBe(true);
    // First persisted timestamp comes from the owned ledger file, not the clock.
    const ledgerPath = join(baseDir, CALIBRATION_ROOT, 'ledger.json');
    const persisted = JSON.parse(readFileSync(ledgerPath, 'utf8')) as Array<Record<string, unknown>>;
    const firstReserved = persisted.find(
      (event) => event['type'] === 'reserved' && (event['key'] as ReservationKey).stage === 'development' && (event['key'] as ReservationKey).profile === 'LOW',
    ) as Record<string, unknown>;
    expect(firstReserved).toBeDefined();
    expect(firstReserved['at']).toMatch(/^2026-10-07T00:00:[0-9]{2}\.000Z$/);
    expect(snapshot['startedAt']).toBe(firstReserved['at']);
    // Getter performs zero append/fsync/clock/resolver effects.
    const clockBefore = clock.calls;
    const resolverBefore = tracker.calls;
    const appendsBefore = effects.appends;
    const fsyncsBefore = effects.fsyncs;
    const again = getSnap('development', 'LOW') as unknown as Record<string, unknown>;
    expect(again).toEqual(snapshot);
    expect(clock.calls).toBe(clockBefore);
    expect(tracker.calls).toBe(resolverBefore);
    expect(effects.appends).toBe(appendsBefore);
    expect(effects.fsyncs).toBe(fsyncsBefore);
    // Per-profile filter: MEDIUM development has zero reservations here, but
    // its own distinct durable dataset outcome is permitted.
    const mediumKey: ReportOutcomeKey = { stage: 'development', profile: 'MEDIUM', caseId: devIds[21] as string, sampleIndex: 1 };
    const mediumDigest = record({ key: mediumKey, reason: 'dataset', prediction: datasetFailurePrediction(1) }) as string;
    const mediumSnap = getSnap('development', 'MEDIUM') as unknown as Record<string, unknown>;
    expect((mediumSnap['counts'] as Record<string, number>)['imageCallsReserved']).toBe(0);
    const mediumRows = mediumSnap['nonReservations'] as Array<Record<string, unknown>>;
    expect(mediumRows).toHaveLength(1);
    expect(mediumRows[0]?.['contentDigest']).toBe(mediumDigest);
  });

  it('keeps the earliest stage timestamp stable across getters and restart', async () => {
    // Break caught: calling Date.now or the clock/resolver again from the
    // getter would make report identity drift on every read.
    const baseDir = makeTempDir();
    const files = buildVerifiedFiles();
    const clock = { calls: 0 };
    const tracker = { calls: 0, selected: [] as unknown[] };
    const { ledger, owner } = openStrictLedger(baseDir, { files, clock, tracker, reportOptions: makeReportOptions(files) });
    ledger.acquireLock(owner);
    reservePreflightPair(ledger, FIRST_DEV);
    ledger.completeStage('preflight', preflightSummary() as never);
    const first = loadStageSnapshot(ledger)('preflight', 'LOW') as { startedAt?: string };
    // startedAt is the exact first persisted reserved event at for this
    // stage/profile, read from the owned file: identity/lock writes invoke
    // the clock before any reservation, so call #1 must not be assumed.
    const preflightLedgerPath = join(baseDir, CALIBRATION_ROOT, 'ledger.json');
    const preflightPersisted = JSON.parse(readFileSync(preflightLedgerPath, 'utf8')) as Array<Record<string, unknown>>;
    const firstPreflightReserved = preflightPersisted.find(
      (event) => event['type'] === 'reserved' && (event['key'] as ReservationKey).stage === 'preflight' && (event['key'] as ReservationKey).profile === 'LOW',
    ) as Record<string, unknown>;
    expect(firstPreflightReserved).toBeDefined();
    expect(firstPreflightReserved['at']).toMatch(/^2026-10-07T00:00:[0-9]{2}\.000Z$/);
    expect(first.startedAt).toBe(firstPreflightReserved['at']);
    const clockAfterFirst = clock.calls;
    const resolverAfterFirst = tracker.calls;
    const second = loadStageSnapshot(ledger)('preflight', 'LOW') as { startedAt?: string };
    expect(second.startedAt).toBe(first.startedAt);
    // Getter performs zero clock/resolver/write/pin/recover/reserve effects.
    expect(clock.calls).toBe(clockAfterFirst);
    expect(tracker.calls).toBe(resolverAfterFirst);
    expect(second).toEqual(first);
    // Snapshot is deeply frozen and immune to caller mutation.
    expect(Object.isFrozen(second)).toBe(true);
    ledger.releaseLock(owner);
    const reopened = (createProtocolCalibrationLedger as (...a: unknown[]) => ReturnType<typeof createProtocolCalibrationLedger>)(
      createFileCalibrationLedgerDeps(baseDir),
      makeIdentity(),
      makeInitial50Resolver(undefined, files),
      makeReportOptions(files),
    );
    const restarted = loadStageSnapshot(reopened)('preflight', 'LOW') as { startedAt?: string };
    expect(restarted.startedAt).toBe(first.startedAt);
  });

  it('establishes the earliest stage timestamp from a first non-reservation outcome', async () => {
    // Break caught: a stage whose first durable outcome is non-reservation
    // (no reservation yet) must still expose a stable startedAt from that event.
    const baseDir = makeTempDir();
    const files = buildVerifiedFiles();
    const { ledger, owner } = openStrictLedger(baseDir, {
      files,
      reportOptions: makeReportOptions(files),
    });
    ledger.acquireLock(owner);
    reservePreflightPair(ledger, FIRST_DEV);
    ledger.completeStage('preflight', preflightSummary() as never);
    const record = loadRecordNonReservation(ledger);
    const devIds = devCaseIds();
    const firstKey: ReportOutcomeKey = { stage: 'development', profile: 'LOW', caseId: devIds[22] as string, sampleIndex: 1 };
    const digest = record({ key: firstKey, reason: 'dataset', prediction: datasetFailurePrediction(1) }) as string;
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    const getSnap = loadStageSnapshot(ledger);
    const snapshot = getSnap('development', 'LOW') as unknown as Record<string, unknown>;
    const rows = snapshot['nonReservations'] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    // startedAt is the non-reservation event timestamp, verified in the file.
    expect(snapshot['startedAt']).toBe(rows[0]?.['at']);
    const ledgerPath = join(baseDir, CALIBRATION_ROOT, 'ledger.json');
    const persisted = JSON.parse(readFileSync(ledgerPath, 'utf8')) as Array<Record<string, unknown>>;
    const firstDev = persisted.find(
      (event) => (event['key'] as ReservationKey | undefined)?.stage === 'development' && (event['key'] as ReservationKey | undefined)?.profile === 'LOW',
    ) as Record<string, unknown>;
    expect(firstDev?.['type']).toBe('non_reservation_result');
    expect(snapshot['startedAt']).toBe(firstDev?.['at']);
    // A later reservation for the same stage/profile cannot move startedAt.
    const laterKey = { stage: 'development', profile: 'LOW', caseId: devIds[23] as string, sampleIndex: 1 } as ReservationKey;
    ledger.reserve(laterKey);
    const again = getSnap('development', 'LOW') as unknown as Record<string, unknown>;
    expect(again['startedAt']).toBe(snapshot['startedAt']);
  });

  it('rejects primitive/coerced stage/profile without running effects', () => {
    // Break caught: coercing a caller stage/profile (objects, arrays,
    // numerics) into the index would read private state before validation.
    const baseDir = makeTempDir();
    const files = buildVerifiedFiles();
    const effects = { appends: 0, fsyncs: 0 };
    const clock = { calls: 0 };
    const tracker = { calls: 0, selected: [] as unknown[] };
    const { ledger, owner } = openStrictLedger(baseDir, {
      files,
      clock,
      tracker,
      effects,
      reportOptions: makeReportOptions(files),
    });
    ledger.acquireLock(owner);
    reservePreflightPair(ledger, FIRST_DEV);
    const getSnap = loadStageSnapshot(ledger);
    const clockBefore = clock.calls;
    const resolverBefore = tracker.calls;
    const appendsBefore = effects.appends;
    const fsyncsBefore = effects.fsyncs;
    const badPairs: Array<[unknown, unknown]> = [
      [42, 'LOW'],
      ['development', null],
      [{ toString: () => 'development' }, 'LOW'],
      ['development', ['LOW']],
      [undefined, undefined],
      ['', 'LOW'],
      ['development', 'HIGH'],
    ];
    for (const [stage, profile] of badPairs) {
      expect(() => getSnap(stage, profile)).toThrow(CalibrationFatalError);
    }
    expect(clock.calls).toBe(clockBefore);
    expect(tracker.calls).toBe(resolverBefore);
    expect(effects.appends).toBe(appendsBefore);
    expect(effects.fsyncs).toBe(fsyncsBefore);
  });
});

describe('report options and outcome plan guards (RED)', () => {
  function openLedgerWithOptions(baseDir: string, files: Record<string, string>, reportOptions: unknown) {
    return (createProtocolCalibrationLedger as (...a: unknown[]) => ReturnType<typeof createProtocolCalibrationLedger>)(
      createFileCalibrationLedgerDeps(baseDir),
      makeIdentity(),
      makeInitial50Resolver(undefined, files),
      reportOptions,
    );
  }

  it('rejects non-own-data report options and invalid plans before persistence', () => {
    // Break caught: a foreign options envelope or a malformed plan must
    // fail before any corresponding persistence, never half-accepted.
    const derive = loadOutcomePlanner();
    const files = buildVerifiedFiles();
    const initial = derive(files);
    expect(initial).toHaveLength(50);
    const SECRET = 'SECRET-OPTIONS-9f31ac';
    const hidden: Record<string, unknown> = {};
    Object.defineProperty(hidden, 'getReportOutcomePlan', {
      value: () => [...initial],
      enumerable: false,
    });
    const sym = Symbol('sym');
    const withSymbol = {
      getReportOutcomePlan: () => [...initial],
      [sym]: SECRET,
    };
    const withExtra = {
      getReportOutcomePlan: () => [...initial],
      extra: 1,
    };
    const throwing = {
      getReportOutcomePlan: () => {
        throw new Error('options callback must not run unvalidated');
      },
    };
    const { proxy: revokedResult, revoke } = Proxy.revocable([...initial], {});
    revoke();
    const revoked = { getReportOutcomePlan: () => revokedResult };
    const sparsePlan: unknown[] = [];
    sparsePlan[3] = initial[0];
    const sparse = { getReportOutcomePlan: () => sparsePlan };
    const duplicated = { getReportOutcomePlan: () => [...initial, initial[0]] };
    const short = { getReportOutcomePlan: () => initial.slice(0, 42) };
    const cases: Array<[string, unknown]> = [
      ['hidden-callback', hidden],
      ['symbol-key', withSymbol],
      ['extra-key', withExtra],
      ['throwing-callback', throwing],
      ['revoked-result', revoked],
      ['sparse-plan', sparse],
      ['duplicate-rows', duplicated],
      ['short-plan', short],
    ];
    for (const [label, options] of cases) {
      const dir = makeTempDir();
      try {
        openLedgerWithOptions(dir, files, options);
      } catch (error) {
        expect(error, label).toBeInstanceOf(CalibrationFatalError);
        continue;
      }
      expect.unreachable(`options case must fail closed: ${label}`);
    }
  });

  it('converts a foreign callback throw into a fresh static causeless error', () => {
    // Break caught: inspecting a foreign thrown object (message/cause
    // reads) would leak caller internals into durable error paths.
    const derive = loadOutcomePlanner();
    expect(typeof derive).toBe('function');
    const files = buildVerifiedFiles();
    const SECRET = 'SECRET-FOREIGN-CB-9f31ac';
    const reads = { message: 0, toString: 0, cause: 0 };
    const foreign = {};
    Object.defineProperty(foreign, 'message', {
      enumerable: true,
      get: () => {
        reads.message += 1;
        return SECRET;
      },
    });
    Object.defineProperty(foreign, 'toString', {
      value: () => {
        reads.toString += 1;
        return SECRET;
      },
    });
    Object.defineProperty(foreign, 'cause', {
      enumerable: true,
      get: () => {
        reads.cause += 1;
        return SECRET;
      },
    });
    const options = {
      getReportOutcomePlan: () => {
        throw foreign;
      },
    };
    let thrown: unknown;
    try {
      openLedgerWithOptions(makeTempDir(), files, options);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(CalibrationFatalError);
    expect((thrown as { cause?: unknown }).cause).toBeUndefined();
    expect(String(thrown)).not.toContain(SECRET);
    expect(String((thrown as CalibrationFatalError).message)).toContain('calibration:');
    expect(reads.message).toBe(0);
    expect(reads.toString).toBe(0);
    expect(reads.cause).toBe(0);
  });

  it('captures caller-owned option copies and invokes callbacks once each', async () => {
    // Break caught: rereading a mutable options object or reinvoking the
    // callback from readonly paths would let caller mutation fork plan identity.
    const derive = loadOutcomePlanner();
    const files = buildVerifiedFiles();
    const initialPlan = derive(files);
    const expandedPlan = derive(files, 'MEDIUM');
    let initialCalls = 0;
    let selectedCalls = 0;
    const options: Record<string, unknown> = {
      getReportOutcomePlan: (selectedProfile?: unknown) => {
        if (selectedProfile === undefined) {
          initialCalls += 1;
          return [...initialPlan];
        }
        selectedCalls += 1;
        return [...expandedPlan];
      },
    };
    const baseDir = makeTempDir();
    const ledger = openLedgerWithOptions(baseDir, files, options);
    expect(initialCalls).toBe(1);
    expect(selectedCalls).toBe(0);
    const capturedCallback = options['getReportOutcomePlan'];
    expect(Object.isFrozen(options)).toBe(false);
    // Mutate every caller-owned handle after capture: stored plan must hold.
    options['extra'] = 'mutated-after-capture';
    options['getReportOutcomePlan'] = () => {
      throw new Error('mutated-after-capture');
    };
    expect(options['getReportOutcomePlan']).not.toBe(capturedCallback);
    const owner = makeOwner();
    ledger.acquireLock(owner);
    reservePreflightPair(ledger, FIRST_DEV);
    ledger.completeStage('preflight', preflightSummary() as never);
    completeDevelopment48(ledger);
    ledger.recordProfileSelection('MEDIUM', 'fewer_unsafe', developmentSummary() as never);
    expect(selectedCalls).toBe(1);
    ledger.completeStage('development', developmentSummary() as never);
    // A post-capture dataset outcome still validates against the stored plan.
    const record = loadRecordNonReservation(ledger);
    const validationIds = validationCaseIds();
    const vKey: ReportOutcomeKey = { stage: 'validation', profile: 'MEDIUM', caseId: validationIds[0] as string, sampleIndex: 1 };
    const digest = record({ key: vKey, reason: 'dataset', prediction: datasetFailurePrediction(1) }) as string;
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuses selected expansion with an invalid expanded plan before persisting selection', () => {
    // Break caught: persisting profile_selected before validating the
    // expanded plan would strand the ledger on an unverified key universe.
    const derive = loadOutcomePlanner();
    const files = buildVerifiedFiles();
    const initialPlan = derive(files);
    const options = {
      getReportOutcomePlan: (selectedProfile?: unknown) => {
        if (selectedProfile === undefined) return [...initialPlan];
        return initialPlan.slice(0, 100);
      },
    };
    const baseDir = makeTempDir();
    const ledger = openLedgerWithOptions(baseDir, files, options);
    const owner = makeOwner();
    ledger.acquireLock(owner);
    reservePreflightPair(ledger, FIRST_DEV);
    ledger.completeStage('preflight', preflightSummary() as never);
    completeDevelopment48(ledger);
    expect(() =>
      ledger.recordProfileSelection('MEDIUM', 'fewer_unsafe', developmentSummary() as never),
    ).toThrow(CalibrationFatalError);
    expect(ledger.getSelectedProfile()).toBeUndefined();
  });
});

describe('conflicts and tamper (RED)', () => {
  it('rejects duplicates, conflicts, unknown keys, and late reserves', async () => {
    // Break caught: a late reserve for an already non-reserved key (or a
    // second non-reservation for the same key) would fork durable identity.
    // LOW and MEDIUM same-case keys are distinct valid rows, not conflicts.
    const baseDir = makeTempDir();
    const files = buildVerifiedFiles();
    const { ledger, owner } = openStrictLedger(baseDir, {
      files,
      reportOptions: makeReportOptions(files),
    });
    ledger.acquireLock(owner);
    reservePreflightPair(ledger, FIRST_DEV);
    ledger.completeStage('preflight', preflightSummary() as never);
    const record = loadRecordNonReservation(ledger);
    const devIds = devCaseIds();
    const key: ReportOutcomeKey = { stage: 'development', profile: 'LOW', caseId: devIds[11] as string, sampleIndex: 1 };
    const countsBefore = ledger.getCounts();
    record({ key, reason: 'dataset', prediction: datasetFailurePrediction(1) });
    expect(ledger.getCounts()).toEqual(countsBefore);
    // Duplicate same key.
    expect(() => record({ key, reason: 'dataset', prediction: datasetFailurePrediction(1) })).toThrow(
      CalibrationFatalError,
    );
    // Conflicting digest/value at the same key.
    expect(() => record({ key, reason: 'dataset', prediction: datasetFailurePrediction(1, 'barcode') })).toThrow(
      CalibrationFatalError,
    );
    // Late reserve for an already non-reserved key.
    expect(() => ledger.reserve(key as ReservationKey)).toThrow(CalibrationFatalError);
    // Unknown planned key (sample 2 never planned for development).
    const unknown: ReportOutcomeKey = { stage: 'development', profile: 'LOW', caseId: devIds[11] as string, sampleIndex: 2 };
    expect(() => record({ key: unknown, reason: 'dataset', prediction: datasetFailurePrediction(2) })).toThrow(
      CalibrationFatalError,
    );
    // Already reserved key cannot take a non-reservation row.
    const reserved = { stage: 'development', profile: 'LOW', caseId: devIds[12] as string, sampleIndex: 1 } as ReservationKey;
    ledger.reserve(reserved);
    expect(() =>
      record({ key: reserved as unknown as ReportOutcomeKey, reason: 'dataset', prediction: datasetFailurePrediction(1) }),
    ).toThrow(CalibrationFatalError);
    // Distinct MEDIUM same-case key remains valid (different planned row).
    const mediumKey: ReportOutcomeKey = { stage: 'development', profile: 'MEDIUM', caseId: devIds[11] as string, sampleIndex: 1 };
    const digest = record({ key: mediumKey, reason: 'dataset', prediction: datasetFailurePrediction(1) }) as string;
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuses reason/source/profile mismatches with unchanged counters and events', async () => {
    // Break caught: a barcode outcome at an image key (or dataset outcome
    // at a barcode key, or benchmark outcome at the unselected profile)
    // would launder cross-source evidence into the wrong report slice.
    const baseDir = makeTempDir();
    const files = buildVerifiedFiles();
    const { ledger, owner } = openStrictLedger(baseDir, {
      files,
      reportOptions: makeReportOptions(files),
    });
    ledger.acquireLock(owner);
    reservePreflightPair(ledger, FIRST_DEV);
    ledger.completeStage('preflight', preflightSummary() as never);
    completeDevelopment48(ledger);
    ledger.recordProfileSelection('MEDIUM', 'fewer_unsafe', developmentSummary() as never);
    ledger.completeStage('development', developmentSummary() as never);
    completeValidation48(ledger, 'MEDIUM');
    ledger.completeStage('validation', validationSummary() as never);
    const record = loadRecordNonReservation(ledger);
    const devIds = devCaseIds();
    const barcodeIds = publicCaseIds('barcode');
    const store = createFileCalibrationLedgerDeps(baseDir);
    const countsBefore = ledger.getCounts();
    const eventsBefore = (store.readLedgerEvents() as unknown[]).length;
    const expectRefusal = (entry: unknown) => {
      expect(() => record(entry)).toThrow(CalibrationFatalError);
      expect(ledger.getCounts()).toEqual(countsBefore);
      expect((store.readLedgerEvents() as unknown[]).length).toBe(eventsBefore);
    };
    // Selected benchmark wrong profile: LOW barcode key after MEDIUM selected.
    expectRefusal({
      key: { stage: 'benchmark', profile: 'LOW', caseId: barcodeIds[2] as string, sampleIndex: 1 },
      reason: 'barcode',
      prediction: barcodeSuccessPrediction(1),
    });
    // Image success without reserve at a planned development key.
    expectRefusal({
      key: { stage: 'development', profile: 'LOW', caseId: devIds[1] as string, sampleIndex: 1 },
      reason: 'dataset',
      prediction: mealSuccessPrediction(1),
    });
    // Barcode reason at an image (development) key.
    expectRefusal({
      key: { stage: 'development', profile: 'LOW', caseId: devIds[1] as string, sampleIndex: 1 },
      reason: 'barcode',
      prediction: barcodeSuccessPrediction(1),
    });
    // Dataset reason at a selected benchmark barcode key.
    expectRefusal({
      key: { stage: 'benchmark', profile: 'MEDIUM', caseId: barcodeIds[2] as string, sampleIndex: 1 },
      reason: 'dataset',
      prediction: datasetFailurePrediction(1, 'barcode'),
    });
    // Barcode reason carrying a dataset failure prediction at a barcode key.
    expectRefusal({
      key: { stage: 'benchmark', profile: 'MEDIUM', caseId: barcodeIds[3] as string, sampleIndex: 1 },
      reason: 'barcode',
      prediction: datasetFailurePrediction(1, 'barcode'),
    });
    // Unplanned sample index at an otherwise valid barcode key.
    expectRefusal({
      key: { stage: 'benchmark', profile: 'MEDIUM', caseId: barcodeIds[0] as string, sampleIndex: 4 },
      reason: 'barcode',
      prediction: barcodeSuccessPrediction(4),
    });
  });

  it('refuses safe replay after digest, value, removal, or unknown-event tamper', async () => {
    // Break caught: accepting a tampered digest/value or an unknown event
    // type on replay would persist forged outcomes. Whole-event deletion is
    // not detectable by digest; removal here means a required event field.
    const tamperKinds = ['digest', 'value', 'removal', 'unknown-event'] as const;
    for (const kind of tamperKinds) {
      const baseDir = makeTempDir();
      const files = buildVerifiedFiles();
      const { ledger, owner } = openStrictLedger(baseDir, {
        files,
        reportOptions: makeReportOptions(files),
      });
      ledger.acquireLock(owner);
      reservePreflightPair(ledger, FIRST_DEV);
      ledger.completeStage('preflight', preflightSummary() as never);
      const record = loadRecordNonReservation(ledger);
      const devIds = devCaseIds();
      const key: ReportOutcomeKey = { stage: 'development', profile: 'LOW', caseId: devIds[13] as string, sampleIndex: 1 };
      record({ key, reason: 'dataset', prediction: datasetFailurePrediction(1) });
      ledger.releaseLock(owner);
      const store = createFileCalibrationLedgerDeps(baseDir);
      const events = store.readLedgerEvents() as Array<Record<string, unknown>>;
      const idx = events.findIndex((event) => event['type'] === 'non_reservation_result');
      expect(idx).toBeGreaterThanOrEqual(0);
      const target = events[idx] as Record<string, unknown>;
      expect(target['contentDigest']).toMatch(/^[0-9a-f]{64}$/);
      const mutated = [...events];
      if (kind === 'digest') mutated[idx] = { ...target, contentDigest: '0'.repeat(64) };
      if (kind === 'value') {
        const pred = { ...(target['prediction'] as Record<string, unknown>), latencyMs: 9999 };
        mutated[idx] = { ...target, prediction: pred };
      }
      if (kind === 'removal') {
        const copy = { ...target };
        delete copy['contentDigest'];
        mutated[idx] = copy;
      }
      if (kind === 'unknown-event') mutated[idx] = { ...target, type: 'non_reservation_result_forged' };
      // Pure codec still refuses each tampered envelope without unhandled rejection.
      const state = await loadReportState();
      const tamperedEnvelope = mutated[idx] as Record<string, unknown>;
      expect(() => state.captureCalibrationNonReservationEvent(tamperedEnvelope)).toThrow(CalibrationFatalError);
      // Persist the tampered JSON-array fixture to the exact owned ledger
      // file (resolve(baseDir, CALIBRATION_ROOT)/ledger.json), then reopen refuses.
      const { writeFileSync } = await import('node:fs');
      const ledgerPath = join(baseDir, CALIBRATION_ROOT, 'ledger.json');
      expect(existsSync(ledgerPath)).toBe(true);
      writeFileSync(ledgerPath, JSON.stringify(mutated), 'utf8');
      // Strict factory replay itself refuses the tampered envelope: the
      // construction throws before any snapshot getter runs.
      expect(
        () =>
          (createProtocolCalibrationLedger as (...a: unknown[]) => ReturnType<typeof createProtocolCalibrationLedger>)(
            createFileCalibrationLedgerDeps(baseDir),
            makeIdentity(),
            makeInitial50Resolver(undefined, files),
            makeReportOptions(files),
          ),
      ).toThrow(CalibrationFatalError);
    }
  });

  it('poisons the existing path on fsync failure without an optimistic outcome', () => {
    // Break caught (GREEN setup + RED assertion): an fsync failure must keep
    // fail-stop behavior instead of optimistically indexing the lost event.
    const baseDir = makeTempDir();
    const files = buildVerifiedFiles();
    const identity = makeIdentity();
    const tracker = { calls: 0, selected: [] as unknown[] };
    const resolver = makeInitial50Resolver(tracker, files);
    const reportOptions = makeReportOptions(files);
    let failTargetedFsync = false;
    let fsyncCalls = 0;
    const baseDeps = createFileCalibrationLedgerDeps(baseDir);
    const realFsync = baseDeps.fsyncLedgerFile.bind(baseDeps);
    const failingDeps = {
      ...baseDeps,
      fsyncLedgerFile: () => {
        fsyncCalls += 1;
        if (failTargetedFsync) {
          failTargetedFsync = false;
          throw new Error('injected fsync failure');
        }
        return realFsync();
      },
    };
    const ledger = (createProtocolCalibrationLedger as (...a: unknown[]) => ReturnType<typeof createProtocolCalibrationLedger>)(
      failingDeps,
      identity,
      resolver,
      reportOptions,
    );
    const owner = makeOwner();
    ledger.acquireLock(owner);
    reservePreflightPair(ledger, FIRST_DEV);
    ledger.completeStage('preflight', preflightSummary() as never);
    const fsyncAfterLifecycle = fsyncCalls;
    expect(fsyncAfterLifecycle).toBeGreaterThan(0);
    // Arm failure only for the targeted non-reservation durability write.
    failTargetedFsync = true;
    const record = loadRecordNonReservation(ledger);
    const getSnap = loadStageSnapshot(ledger);
    const devIds = devCaseIds();
    const key: ReportOutcomeKey = { stage: 'development', profile: 'LOW', caseId: devIds[14] as string, sampleIndex: 1 };
    expect(() => record({ key, reason: 'dataset', prediction: datasetFailurePrediction(1) })).toThrow();
    // Poisoned state: getCounts calls checkPoison first and must throw rather
    // than return a value; the new getter and every write throw as well.
    expect(() => ledger.getCounts()).toThrow(CalibrationFatalError);
    expect(() => getSnap('development', 'LOW')).toThrow(CalibrationFatalError);
    expect(() => ledger.reserve({ stage: 'development', profile: 'LOW', caseId: devIds[15] as string, sampleIndex: 1 } as ReservationKey)).toThrow(
      CalibrationFatalError,
    );
    // No optimistic outcome leaked: fail-stop durability poisons the in-memory
    // index with no synthetic image reservation for the refused key. The
    // append-first file contract may leave readable appended bytes even when
    // the acknowledgment fsync fails (atomic file replacement), so only the
    // absence of a 'reserved' event for the refused key is asserted here.
    const poisonedEvents = createFileCalibrationLedgerDeps(baseDir).readLedgerEvents() as Array<Record<string, unknown>>;
    const refusedReserved = poisonedEvents.filter(
      (event) => event['type'] === 'reserved' && JSON.stringify(event).includes(key.caseId),
    );
    expect(refusedReserved).toHaveLength(0);
  });
});

describe('stage snapshot codec direct (RED)', () => {
  // Independently built closed valid snapshot from the Shared Interfaces:
  // makeIdentity, real corpus keys, a full7 completed journal plus its
  // manual canonical whole hash, a canonical interruption hash with NO
  // prediction/latency/journal in the interrupted row, a non-reservation
  // outcome with manual digest/at, and truthful counts. Nothing here is
  // produced by the codec under test.
  function buildValidSnapshotFixture(): Record<string, unknown> {
    const devIds = devCaseIds();
    const completedKey: ReservationKey = { stage: 'development', profile: 'LOW', caseId: devIds[0] as string, sampleIndex: 1 };
    const completedJournal = fullSuccessEntry(completedKey, STAGE_PIN_VERSION, mealSuccessPrediction(1));
    const completedHash = sha256Hex(JSON.stringify(completedJournal));
    const interruptedKey: ReservationKey = { stage: 'development', profile: 'LOW', caseId: devIds[1] as string, sampleIndex: 1 };
    const canonicalInterruption = {
      key: { ...interruptedKey },
      predictionHash: 'interrupted_reservation',
      normalizedPrediction: null,
      analysisLatencyMs: 0,
      errorCategory: 'interrupted_reservation',
      responseModelVersion: 'n/a',
    };
    const interruptedHash = sha256Hex(JSON.stringify(canonicalInterruption));
    const nrKey: ReportOutcomeKey = { stage: 'development', profile: 'LOW', caseId: devIds[2] as string, sampleIndex: 1 };
    const nrPred = datasetFailurePrediction(1);
    const nrAt = '2026-10-07T00:00:05.000Z';
    const nrDigest = sha256Hex(JSON.stringify({ key: nrKey, reason: 'dataset', prediction: nrPred, at: nrAt }));
    return {
      stage: 'development',
      profile: 'LOW',
      identity: makeIdentity(),
      startedAt: '2026-10-07T00:00:01.000Z',
      counts: {
        imageCallsReserved: 3,
        imageCallsCompleted: 1,
        imageCallsFailed: 1,
        imageCallsPending: 1,
      },
      images: [
        { status: 'completed', key: { ...completedKey }, journalHash: completedHash, journal: completedJournal },
        { status: 'interrupted_reservation', key: { ...interruptedKey }, journalHash: interruptedHash },
      ],
      nonReservations: [
        { key: { ...nrKey }, reason: 'dataset', prediction: nrPred, contentDigest: nrDigest, at: nrAt },
      ],
    };
  }

  function buildValidNonReservationEvent(): Record<string, unknown> {
    const devIds = devCaseIds();
    const key: ReportOutcomeKey = { stage: 'development', profile: 'LOW', caseId: devIds[3] as string, sampleIndex: 1 };
    const prediction = datasetFailurePrediction(1);
    const at = '2026-10-07T00:00:06.000Z';
    const contentDigest = sha256Hex(JSON.stringify({ key, reason: 'dataset', prediction, at }));
    return { type: 'non_reservation_result', key, reason: 'dataset', prediction, contentDigest, at };
  }

  it('accepts an independently built valid snapshot and freezes owned copies', async () => {
    // Break caught: a codec that returns caller references would let
    // post-call mutation rewrite a validated snapshot.
    const state = await loadReportState();
    const fixture = buildValidSnapshotFixture();
    const captured = state.captureCalibrationStageReportSnapshot(fixture) as unknown as Record<string, unknown>;
    expect(captured).toEqual(fixture);
    expect(Object.isFrozen(captured)).toBe(true);
    expect(Object.isFrozen(captured['counts'])).toBe(true);
    expect(Object.isFrozen(captured['images'])).toBe(true);
    expect(Object.isFrozen(captured['nonReservations'])).toBe(true);
    expect(Object.isFrozen((captured['images'] as Array<Record<string, unknown>>)[0])).toBe(true);
    // Caller mutation after the call cannot change the persisted view.
    ((fixture['images'] as Array<Record<string, unknown>>)[0] as Record<string, unknown>)['journalHash'] = 'mutated-after-call';
    (fixture as Record<string, unknown>)['stage'] = 'mutated-after-call';
    expect((captured['images'] as Array<Record<string, unknown>>)[0]?.['journalHash']).not.toBe('mutated-after-call');
    expect(captured['stage']).toBe('development');
  });

  it('leaves optional fields absent but rejects present-undefined and unknown keys', async () => {
    // Break caught: optional snapshot fields are absent when unavailable,
    // never present-undefined; unknown keys must fail closed.
    const state = await loadReportState();
    const minimal = buildValidSnapshotFixture();
    delete (minimal as Record<string, unknown>)['startedAt'];
    const captured = state.captureCalibrationStageReportSnapshot(minimal) as unknown as Record<string, unknown>;
    expect('startedAt' in captured).toBe(false);
    expect('selectedProfile' in captured).toBe(false);
    expect('pinnedModelVersion' in captured).toBe(false);
    expect(() =>
      state.captureCalibrationStageReportSnapshot({ ...buildValidSnapshotFixture(), startedAt: undefined }),
    ).toThrow(CalibrationFatalError);
    expect(() =>
      state.captureCalibrationStageReportSnapshot({ ...buildValidSnapshotFixture(), extra: 1 }),
    ).toThrow(CalibrationFatalError);
  });

  it.each([
    ['hidden-field'],
    ['symbol-key'],
    ['accessor-throw'],
    ['revoked-proxy'],
    ['dense-hole-array'],
    ['dense-extra-keys'],
    ['duplicate-image-tuple'],
    ['duplicate-nonreservation-tuple'],
  ] as const)('rejects hostile snapshot input %s without leak', async (label) => {
    // Break caught: hostile snapshot envelopes must fail closed with a
    // static causeless fatal; duplicate tuples must not merge silently.
    const state = await loadReportState();
    const SECRET = `SECRET-SNAPSHOT-${label}-9f31ac`;
    let hostile: unknown = buildValidSnapshotFixture();
    if (label === 'hidden-field') {
      hostile = {};
      const valid = buildValidSnapshotFixture();
      for (const field of Object.keys(valid)) {
        Object.defineProperty(hostile, field, { value: (valid as Record<string, unknown>)[field], enumerable: false });
      }
    }
    if (label === 'symbol-key') {
      const sym = Symbol('sym');
      hostile = { ...buildValidSnapshotFixture(), [sym]: SECRET };
    }
    if (label === 'accessor-throw') {
      hostile = {};
      const valid = buildValidSnapshotFixture();
      Object.defineProperty(hostile, 'images', {
        enumerable: true,
        get: () => {
          throw new Error(SECRET);
        },
      });
      for (const field of Object.keys(valid)) {
        if (field !== 'images') (hostile as Record<string, unknown>)[field] = (valid as Record<string, unknown>)[field];
      }
    }
    if (label === 'revoked-proxy') {
      const { proxy, revoke } = Proxy.revocable(buildValidSnapshotFixture(), {});
      revoke();
      hostile = proxy;
    }
    if (label === 'dense-hole-array') {
      const valid = buildValidSnapshotFixture();
      const sparse: unknown[] = [];
      sparse[2] = (valid['images'] as unknown[])[0];
      hostile = { ...valid, images: sparse };
    }
    if (label === 'dense-extra-keys') {
      const valid = buildValidSnapshotFixture();
      const images = [...(valid['images'] as unknown[])];
      (images as Record<string, unknown>)['extra'] = SECRET;
      hostile = { ...valid, images };
    }
    if (label === 'duplicate-image-tuple') {
      const valid = buildValidSnapshotFixture();
      const first = (valid['images'] as unknown[])[0];
      hostile = { ...valid, images: [first, first] };
    }
    if (label === 'duplicate-nonreservation-tuple') {
      const valid = buildValidSnapshotFixture();
      const first = (valid['nonReservations'] as unknown[])[0];
      hostile = { ...valid, nonReservations: [first, first] };
    }
    expect(() => state.captureCalibrationStageReportSnapshot(hostile)).toThrow(CalibrationFatalError);
    try {
      state.captureCalibrationStageReportSnapshot(hostile);
    } catch (error) {
      expect(error).toBeInstanceOf(CalibrationFatalError);
      expect((error as { cause?: unknown }).cause).toBeUndefined();
      expect(String(error)).not.toContain(SECRET);
      expect(String((error as CalibrationFatalError).message)).toContain('calibration:');
    }
  });

  it('rejects forged bindings, counts, identity, and interrupted extras', async () => {
    // Break caught: each forged binding must fail closed rather than
    // persist an invented terminal, count, or identity.
    const state = await loadReportState();
    const valid = (): Record<string, unknown> => buildValidSnapshotFixture();
    // Forged completed journalHash.
    const forgedHash = valid();
    ((forgedHash['images'] as Array<Record<string, unknown>>)[0] as Record<string, unknown>)['journalHash'] = 'f'.repeat(64);
    expect(() => state.captureCalibrationStageReportSnapshot(forgedHash)).toThrow(CalibrationFatalError);
    // Key mismatch between row key and bound journal key.
    const keyMismatch = valid();
    const completedRow = (keyMismatch['images'] as Array<Record<string, unknown>>)[0] as Record<string, unknown>;
    (completedRow['key'] as Record<string, unknown>)['caseId'] = 'calibration-dish_9999';
    expect(() => state.captureCalibrationStageReportSnapshot(keyMismatch)).toThrow(CalibrationFatalError);
    // Forged counts (reserved 99 breaks completed+failed+pending=reserved).
    const forgedCounts = valid();
    (forgedCounts['counts'] as Record<string, unknown>)['imageCallsReserved'] = 99;
    expect(() => state.captureCalibrationStageReportSnapshot(forgedCounts)).toThrow(CalibrationFatalError);
    // Malformed identity.
    const badIdentity = valid();
    ((badIdentity['identity'] as Record<string, unknown>)['datasetHash']) = 'not-a-hash';
    expect(() => state.captureCalibrationStageReportSnapshot(badIdentity)).toThrow(CalibrationFatalError);
    // Extra prediction data smuggled into the interrupted row.
    const interruptedExtra = valid();
    ((interruptedExtra['images'] as Array<Record<string, unknown>>)[1] as Record<string, unknown>)['prediction'] = datasetFailurePrediction(1);
    expect(() => state.captureCalibrationStageReportSnapshot(interruptedExtra)).toThrow(CalibrationFatalError);
    // Sentinel latency field smuggled into the interrupted row.
    const interruptedLatency = valid();
    ((interruptedLatency['images'] as Array<Record<string, unknown>>)[1] as Record<string, unknown>)['analysisLatencyMs'] = 0;
    expect(() => state.captureCalibrationStageReportSnapshot(interruptedLatency)).toThrow(CalibrationFatalError);
    // Six-field journal (no reportPrediction) in the completed row.
    const sixField = valid();
    const sixKey: ReservationKey = { stage: 'development', profile: 'LOW', caseId: devCaseIds()[0] as string, sampleIndex: 1 };
    ((sixField['images'] as Array<Record<string, unknown>>)[0] as Record<string, unknown>)['journal'] = legacySuccessEntry(sixKey, STAGE_PIN_VERSION);
    ((sixField['images'] as Array<Record<string, unknown>>)[0] as Record<string, unknown>)['journalHash'] = sha256Hex(
      JSON.stringify(legacySuccessEntry(sixKey, STAGE_PIN_VERSION)),
    );
    expect(() => state.captureCalibrationStageReportSnapshot(sixField)).toThrow(CalibrationFatalError);
  });

  it('validates the pure non-reservation event digest, freeze, and tamper', async () => {
    // Break caught: the durable event envelope must bind digest/key/at in
    // exact field order and refuse timestamp, digest, key, or sample tamper.
    const state = await loadReportState();
    const valid = buildValidNonReservationEvent();
    expect(Object.keys(valid)).toEqual(['type', 'key', 'reason', 'prediction', 'contentDigest', 'at']);
    const captured = state.captureCalibrationNonReservationEvent(valid) as unknown as Record<string, unknown>;
    expect(captured).toEqual(valid);
    expect(Object.isFrozen(captured)).toBe(true);
    expect(Object.isFrozen(captured['prediction'])).toBe(true);
    // Entry codec binds the same closed shape without the envelope.
    const entry = state.captureCalibrationNonReservationEntry({
      key: valid['key'],
      reason: valid['reason'],
      prediction: valid['prediction'],
    }) as unknown as Record<string, unknown>;
    expect(entry).toEqual({ key: valid['key'], reason: valid['reason'], prediction: valid['prediction'] });
    expect(Object.isFrozen(entry)).toBe(true);
    // Tampered timestamp no longer matches the digest.
    expect(() =>
      state.captureCalibrationNonReservationEvent({ ...valid, at: '2026-10-07T00:00:07.000Z' }),
    ).toThrow(CalibrationFatalError);
    // Forged digest.
    expect(() =>
      state.captureCalibrationNonReservationEvent({ ...valid, contentDigest: '0'.repeat(64) }),
    ).toThrow(CalibrationFatalError);
    // Tampered key caseId.
    expect(() =>
      state.captureCalibrationNonReservationEvent({
        ...valid,
        key: { ...(valid['key'] as Record<string, unknown>), caseId: 'calibration-dish_9999' },
      }),
    ).toThrow(CalibrationFatalError);
    // Tampered sample index.
    expect(() =>
      state.captureCalibrationNonReservationEvent({
        ...valid,
        key: { ...(valid['key'] as Record<string, unknown>), sampleIndex: 2 },
      }),
    ).toThrow(CalibrationFatalError);
  });
});

describe('closed hostile codecs (RED)', () => {
  it.each([
    ['unknown-field', { extra: 1 }],
    ['hidden-field', {}],
    ['symbol-key', {}],
    ['accessor-throw', {}],
    ['sparse-array', {}],
    ['extra-array', {}],
    ['revoked-proxy', {}],
    ['primitive-coercion', {}],
  ] as const)('rejects hostile closed input %s without coercion or leak', async (label) => {
    // Break caught: hostile caller objects must fail closed with a static
    // causeless fatal and no private bytes read; virtual get-only proxies
    // with genuine descriptors are not automatically invalid.
    const state = await loadReportState();
    const devIds = devCaseIds();
    const key: ReportOutcomeKey = { stage: 'development', profile: 'LOW', caseId: devIds[16] as string, sampleIndex: 1 };
    const base = { key, reason: 'dataset', prediction: datasetFailurePrediction(1) };
    let hostile: unknown = base;
    const SECRET = `SECRET-${label}-9f31ac`;
    if (label === 'unknown-field') hostile = { ...base, ...( { extra: 1 } as Record<string, unknown>) };
    if (label === 'hidden-field') {
      hostile = {};
      Object.defineProperty(hostile, 'key', { value: key, enumerable: false });
      Object.defineProperty(hostile, 'reason', { value: 'dataset', enumerable: false });
      Object.defineProperty(hostile, 'prediction', { value: base.prediction, enumerable: false });
    }
    if (label === 'symbol-key') {
      const sym = Symbol('sym');
      hostile = { ...base, [sym]: SECRET };
    }
    if (label === 'accessor-throw') {
      hostile = {};
      Object.defineProperty(hostile, 'key', {
        enumerable: true,
        get: () => {
          throw new Error(SECRET);
        },
      });
      (hostile as Record<string, unknown>)['reason'] = 'dataset';
      (hostile as Record<string, unknown>)['prediction'] = base.prediction;
    }
    if (label === 'sparse-array') hostile = Object.assign([], { 2: SECRET });
    if (label === 'extra-array') hostile = [key, 'dataset', base.prediction, SECRET];
    if (label === 'revoked-proxy') {
      const { proxy, revoke } = Proxy.revocable(base, {});
      revoke();
      hostile = proxy;
    }
    if (label === 'primitive-coercion') {
      const coerced = { ...base };
      (coerced as Record<string, unknown>)['reason'] = { toString: () => 'dataset' };
      hostile = coerced;
    }
    expect(() => state.captureCalibrationNonReservationEntry(hostile)).toThrow(CalibrationFatalError);
    try {
      state.captureCalibrationNonReservationEntry(hostile);
    } catch (error) {
      expect(error).toBeInstanceOf(CalibrationFatalError);
      expect((error as { cause?: unknown }).cause).toBeUndefined();
      expect(String(error)).not.toContain(SECRET);
      expect(String((error as CalibrationFatalError).message)).toContain('calibration:');
    }
    // OwnKeys trap with a throwing handler also fails closed.
    const ownKeysHostile = new Proxy(base, {
      ownKeys: () => {
        throw new Error('SECRET-OWNKEYS-9f31ac');
      },
    });
    expect(() => state.captureCalibrationNonReservationEntry(ownKeysHostile)).toThrow(CalibrationFatalError);
  });

  it('freezes owned copies so caller mutation cannot change persisted views', async () => {
    // Break caught: returning caller references would let post-call mutation
    // rewrite a persisted outcome or a snapshot row.
    const state = await loadReportState();
    const devIds = devCaseIds();
    const caseId = devIds[17] as string;
    const key: ReportOutcomeKey = { stage: 'development', profile: 'LOW', caseId, sampleIndex: 1 };
    const prediction = datasetFailurePrediction(1);
    const copied = state.captureCalibrationNonReservationEntry({ key, reason: 'dataset', prediction });
    (key as Record<string, unknown>)['caseId'] = 'mutated-after-call';
    (prediction as Record<string, unknown>)['failureCode'] = 'mutated-after-call';
    expect(copied.key.caseId).toBe(caseId);
    expect(Object.isFrozen(copied)).toBe(true);
    expect(Object.isFrozen(copied.key)).toBe(true);
    expect(Object.isFrozen(copied.prediction)).toBe(true);
  });
});

// -- RED: Task1 correction -- stage boundary regressions (append-only) ------
//
// Isolated-case revision: every fixture below is its own independently
// executed it (no kitchen-sink its where one assertion failure hides the
// rest). Groups mirror task-1-guards-tests-isolation.md 1-6.

describe("stage boundary regressions", () => {
  function clonePlanRow(row: PlannedReportOutcome): { key: ReportOutcomeKey; scanMode: "meal" | "label" | "barcode" } {
    return { key: { ...row.key }, scanMode: row.scanMode };
  }

  function clonePlanRows(
    rows: readonly PlannedReportOutcome[],
  ): Array<{ key: ReportOutcomeKey; scanMode: "meal" | "label" | "barcode" }> {
    return rows.map(clonePlanRow);
  }

  function withMutatedRow(
    rows: readonly PlannedReportOutcome[],
    index: number,
    mutateRow: (row: { key: ReportOutcomeKey; scanMode: "meal" | "label" | "barcode" }) => unknown,
  ): unknown[] {
    return rows.map((row, i) => (i === index ? mutateRow(clonePlanRow(row)) : clonePlanRow(row)));
  }

  function makeValidCallback(
    files: Record<string, string>,
  ): { callback: (selectedProfile?: unknown) => unknown; calls: { initial: number; expanded: number } } {
    const derive = loadOutcomePlanner();
    const validInitial = derive(files);
    const validExpanded = derive(files, "MEDIUM");
    const calls = { initial: 0, expanded: 0 };
    const callback = (selectedProfile?: unknown) => {
      if (selectedProfile === undefined) {
        calls.initial += 1;
        return clonePlanRows(validInitial);
      }
      calls.expanded += 1;
      return clonePlanRows(validExpanded);
    };
    return { callback, calls };
  }

  function expectOptionsRejected(files: Record<string, string>, reportOptions: unknown): void {
    const baseDir = makeTempDir();
    const effects = { appends: 0, fsyncs: 0 };
    const clock = { calls: 0 };
    expect(() => openStrictLedger(baseDir, { files, reportOptions, effects, clock })).toThrow(
      CalibrationFatalError,
    );
    expect(effects).toEqual({ appends: 0, fsyncs: 0 });
    expect(clock.calls).toBe(0);
  }

  function expectInitialPlanRejected(files: Record<string, string>, rows: unknown): void {
    const baseDir = makeTempDir();
    expect(() =>
      openStrictLedger(baseDir, { files, reportOptions: { getReportOutcomePlan: () => rows } }),
    ).toThrow(CalibrationFatalError);
  }

  function buildCanonicalNonReservationEvent(
    key: ReportOutcomeKey,
    reason: "dataset" | "barcode",
    prediction: NutritionPrediction,
    at: string,
  ): Record<string, unknown> {
    const canonicalKey = { stage: key.stage, profile: key.profile, caseId: key.caseId, sampleIndex: key.sampleIndex };
    const capturedPrediction = captureCalibrationReportPrediction(prediction);
    const contentDigest = sha256Hex(
      JSON.stringify({ key: canonicalKey, reason, prediction: capturedPrediction, at }),
    );
    return {
      type: "non_reservation_result",
      key: canonicalKey,
      reason,
      prediction: capturedPrediction,
      contentDigest,
      at,
    };
  }

  describe("descriptor capture: report-options envelope", () => {
    it("rejects an accessor getter without invoking it", () => {
      const files = buildVerifiedFiles();
      const { callback, calls } = makeValidCallback(files);
      let getterReads = 0;
      const options: Record<string, unknown> = {};
      Object.defineProperty(options, "getReportOutcomePlan", {
        enumerable: true,
        configurable: true,
        get() {
          getterReads += 1;
          return callback;
        },
      });
      expectOptionsRejected(files, options);
      expect(getterReads).toBe(0);
      expect(calls.initial).toBe(0);
    });

    it("rejects a non-plain-prototype envelope", () => {
      const files = buildVerifiedFiles();
      const { callback, calls } = makeValidCallback(files);
      const options = Object.create({ tamper: "unexpected" }) as Record<string, unknown>;
      options.getReportOutcomePlan = callback;
      expectOptionsRejected(files, options);
      expect(calls.initial).toBe(0);
    });

    it("rejects a hidden non-enumerable extra field", () => {
      const files = buildVerifiedFiles();
      const { callback, calls } = makeValidCallback(files);
      const options: Record<string, unknown> = { getReportOutcomePlan: callback };
      Object.defineProperty(options, "secretExtra", {
        value: "hidden-backdoor",
        enumerable: false,
        configurable: true,
      });
      expectOptionsRejected(files, options);
      expect(calls.initial).toBe(0);
    });

    it("GREEN control: already rejects a symbol-keyed extra field", () => {
      const files = buildVerifiedFiles();
      const { callback, calls } = makeValidCallback(files);
      const options: Record<string | symbol, unknown> = {
        getReportOutcomePlan: callback,
        [Symbol("extra")]: "symbol-backdoor",
      };
      expectOptionsRejected(files, options);
      expect(calls.initial).toBe(0);
    });

    it("RED required behavior: an honest get-trap proxy must be accepted with zero get-trap invocations", () => {
      const files = buildVerifiedFiles();
      const { callback, calls } = makeValidCallback(files);
      const counter = { count: 0 };
      const target: Record<string, unknown> = { getReportOutcomePlan: callback };
      const proxy = new Proxy(target, {
        get(t, prop, receiver) {
          counter.count += 1;
          return Reflect.get(t, prop, receiver);
        },
      });
      const baseDir = makeTempDir();
      const { ledger } = openStrictLedger(baseDir, {
        files,
        reportOptions: proxy as unknown as Record<string, unknown>,
      });
      expect(ledger).toBeDefined();
      expect(calls.initial).toBe(1);
      expect(counter.count).toBe(0);
      expect(loadStageSnapshot(ledger)("preflight", "LOW").counts).toEqual({ imageCallsReserved: 0, imageCallsCompleted: 0, imageCallsFailed: 0, imageCallsPending: 0 });
    });
  });

  describe("descriptor capture: plan row", () => {
    it("rejects a row whose key field is an accessor, without invoking it", () => {
      const files = buildVerifiedFiles();
      const derive = loadOutcomePlanner();
      const validInitial = derive(files);
      let keyGetterReads = 0;
      const validKeyCopy = { ...(validInitial[0] as PlannedReportOutcome).key };
      const accessorRow: Record<string, unknown> = { scanMode: (validInitial[0] as PlannedReportOutcome).scanMode };
      Object.defineProperty(accessorRow, "key", {
        enumerable: true,
        configurable: true,
        get() {
          keyGetterReads += 1;
          return validKeyCopy;
        },
      });
      const rows = [accessorRow, ...clonePlanRows(validInitial).slice(1)];
      expectInitialPlanRejected(files, rows);
      expect(keyGetterReads).toBe(0);
    });

    it("rejects a row inherited from a non-plain prototype", () => {
      const files = buildVerifiedFiles();
      const derive = loadOutcomePlanner();
      const validInitial = derive(files);
      const row0 = clonePlanRow(validInitial[0] as PlannedReportOutcome);
      const nonPlainRow = Object.create({ tamper: "unexpected" }) as Record<string, unknown>;
      nonPlainRow.key = row0.key;
      nonPlainRow.scanMode = row0.scanMode;
      const rows = [nonPlainRow, ...clonePlanRows(validInitial).slice(1)];
      expectInitialPlanRejected(files, rows);
    });

    it("rejects a row with a hidden non-enumerable extra field", () => {
      const files = buildVerifiedFiles();
      const derive = loadOutcomePlanner();
      const validInitial = derive(files);
      const row0 = clonePlanRow(validInitial[0] as PlannedReportOutcome);
      const hiddenExtraRow: Record<string, unknown> = { key: row0.key, scanMode: row0.scanMode };
      Object.defineProperty(hiddenExtraRow, "secretExtra", {
        value: "hidden-backdoor",
        enumerable: false,
        configurable: true,
      });
      const rows = [hiddenExtraRow, ...clonePlanRows(validInitial).slice(1)];
      expectInitialPlanRejected(files, rows);
    });

    it("rejects a row with a symbol-keyed extra field", () => {
      const files = buildVerifiedFiles();
      const derive = loadOutcomePlanner();
      const validInitial = derive(files);
      const row0 = clonePlanRow(validInitial[0] as PlannedReportOutcome);
      const symbolExtraRow: Record<string | symbol, unknown> = {
        key: row0.key,
        scanMode: row0.scanMode,
        [Symbol("extra")]: "symbol-backdoor",
      };
      const rows = [symbolExtraRow, ...clonePlanRows(validInitial).slice(1)];
      expectInitialPlanRejected(files, rows);
    });

    it("RED required behavior: an honest get-trap proxy row must be accepted with zero get-trap invocations", () => {
      const files = buildVerifiedFiles();
      const derive = loadOutcomePlanner();
      const validInitial = derive(files);
      const row0 = clonePlanRow(validInitial[0] as PlannedReportOutcome);
      const counter = { count: 0 };
      const proxyRow = new Proxy(row0 as unknown as Record<string, unknown>, {
        get(t, prop, receiver) {
          counter.count += 1;
          return Reflect.get(t, prop, receiver);
        },
      });
      const rows = [proxyRow, ...clonePlanRows(validInitial).slice(1)];
      const baseDir = makeTempDir();
      const { ledger } = openStrictLedger(baseDir, { files, reportOptions: { getReportOutcomePlan: () => rows } });
      expect(ledger).toBeDefined();
      expect(counter.count).toBe(0);
      expect(loadStageSnapshot(ledger)("preflight", "LOW").counts).toEqual({ imageCallsReserved: 0, imageCallsCompleted: 0, imageCallsFailed: 0, imageCallsPending: 0 });
    });
  });

  describe("descriptor capture: plan key", () => {
    it("rejects a key whose field is an accessor, without invoking it", () => {
      const files = buildVerifiedFiles();
      const derive = loadOutcomePlanner();
      const validInitial = derive(files);
      const sourceKey0 = (validInitial[0] as PlannedReportOutcome).key;
      let fieldGetterReads = 0;
      const accessorKey: Record<string, unknown> = {
        stage: sourceKey0.stage,
        profile: sourceKey0.profile,
        caseId: sourceKey0.caseId,
      };
      Object.defineProperty(accessorKey, "sampleIndex", {
        enumerable: true,
        configurable: true,
        get() {
          fieldGetterReads += 1;
          return sourceKey0.sampleIndex;
        },
      });
      const rows = withMutatedRow(validInitial, 0, (row) => ({ key: accessorKey, scanMode: row.scanMode }));
      expectInitialPlanRejected(files, rows);
      expect(fieldGetterReads).toBe(0);
    });

    it("rejects a key inherited from a non-plain prototype", () => {
      const files = buildVerifiedFiles();
      const derive = loadOutcomePlanner();
      const validInitial = derive(files);
      const sourceKey0 = (validInitial[0] as PlannedReportOutcome).key;
      const nonPlainKey = Object.create({ tamper: "unexpected" }) as Record<string, unknown>;
      nonPlainKey.stage = sourceKey0.stage;
      nonPlainKey.profile = sourceKey0.profile;
      nonPlainKey.caseId = sourceKey0.caseId;
      nonPlainKey.sampleIndex = sourceKey0.sampleIndex;
      const rows = withMutatedRow(validInitial, 0, (row) => ({ key: nonPlainKey, scanMode: row.scanMode }));
      expectInitialPlanRejected(files, rows);
    });

    it("rejects a key with a hidden non-enumerable extra field", () => {
      const files = buildVerifiedFiles();
      const derive = loadOutcomePlanner();
      const validInitial = derive(files);
      const sourceKey0 = (validInitial[0] as PlannedReportOutcome).key;
      const hiddenExtraKey: Record<string, unknown> = { ...sourceKey0 };
      Object.defineProperty(hiddenExtraKey, "secretExtra", {
        value: "hidden-backdoor",
        enumerable: false,
        configurable: true,
      });
      const rows = withMutatedRow(validInitial, 0, (row) => ({ key: hiddenExtraKey, scanMode: row.scanMode }));
      expectInitialPlanRejected(files, rows);
    });

    it("rejects a key with a symbol-keyed extra field", () => {
      const files = buildVerifiedFiles();
      const derive = loadOutcomePlanner();
      const validInitial = derive(files);
      const sourceKey0 = (validInitial[0] as PlannedReportOutcome).key;
      const symbolExtraKey: Record<string | symbol, unknown> = { ...sourceKey0, [Symbol("extra")]: "symbol-backdoor" };
      const rows = withMutatedRow(validInitial, 0, (row) => ({ key: symbolExtraKey, scanMode: row.scanMode }));
      expectInitialPlanRejected(files, rows);
    });

    it("RED required behavior: an honest get-trap proxy key must be accepted with zero get-trap invocations", () => {
      const files = buildVerifiedFiles();
      const derive = loadOutcomePlanner();
      const validInitial = derive(files);
      const sourceKey0 = { ...(validInitial[0] as PlannedReportOutcome).key };
      const counter = { count: 0 };
      const proxyKey = new Proxy(sourceKey0 as unknown as Record<string, unknown>, {
        get(t, prop, receiver) {
          counter.count += 1;
          return Reflect.get(t, prop, receiver);
        },
      });
      const rows = withMutatedRow(validInitial, 0, (row) => ({ key: proxyKey, scanMode: row.scanMode }));
      const baseDir = makeTempDir();
      const { ledger } = openStrictLedger(baseDir, { files, reportOptions: { getReportOutcomePlan: () => rows } });
      expect(ledger).toBeDefined();
      expect(counter.count).toBe(0);
      expect(loadStageSnapshot(ledger)("preflight", "LOW").counts).toEqual({ imageCallsReserved: 0, imageCallsCompleted: 0, imageCallsFailed: 0, imageCallsPending: 0 });
    });
  });

  describe("descriptor capture: plan array container", () => {
    it("rejects an array whose index 0 is an accessor, without invoking it", () => {
      const files = buildVerifiedFiles();
      const derive = loadOutcomePlanner();
      const validInitial = derive(files);
      let indexGetterReads = 0;
      const validRow0 = clonePlanRow(validInitial[0] as PlannedReportOutcome);
      const rows = clonePlanRows(validInitial) as unknown[];
      Object.defineProperty(rows, "0", {
        enumerable: true,
        configurable: true,
        get() {
          indexGetterReads += 1;
          return validRow0;
        },
      });
      expectInitialPlanRejected(files, rows);
      expect(indexGetterReads).toBe(0);
    });

    it("rejects an array with a hidden non-enumerable extra own property", () => {
      const files = buildVerifiedFiles();
      const derive = loadOutcomePlanner();
      const validInitial = derive(files);
      const rows = clonePlanRows(validInitial) as unknown[];
      Object.defineProperty(rows, "secretExtra", {
        value: "hidden-backdoor",
        enumerable: false,
        configurable: true,
      });
      expectInitialPlanRejected(files, rows);
    });

    it("rejects an array with a symbol-keyed extra own property", () => {
      const files = buildVerifiedFiles();
      const derive = loadOutcomePlanner();
      const validInitial = derive(files);
      const rows = clonePlanRows(validInitial) as unknown[] as Record<string | symbol, unknown>;
      rows[Symbol("extra")] = "symbol-backdoor";
      expectInitialPlanRejected(files, rows);
    });

    it("RED required behavior: an honest get-trap proxy array must be accepted with zero get-trap invocations", () => {
      const files = buildVerifiedFiles();
      const derive = loadOutcomePlanner();
      const validInitial = derive(files);
      const counter = { count: 0 };
      const target = clonePlanRows(validInitial) as unknown[];
      const proxyArray = new Proxy(target, {
        get(t, prop, receiver) {
          counter.count += 1;
          return Reflect.get(t, prop, receiver);
        },
      });
      const baseDir = makeTempDir();
      const { ledger } = openStrictLedger(baseDir, {
        files,
        reportOptions: { getReportOutcomePlan: () => proxyArray },
      });
      expect(ledger).toBeDefined();
      expect(counter.count).toBe(0);
      expect(loadStageSnapshot(ledger)("preflight", "LOW").counts).toEqual({ imageCallsReserved: 0, imageCallsCompleted: 0, imageCallsFailed: 0, imageCallsPending: 0 });
    });
  });

  describe("fixed source shape (plan-row validation gaps)", () => {
    function runSourceShapeCase(
      initialRows: unknown,
      expandedRows: unknown,
      rejectAt: "construction" | "selection" | "none",
    ): { effects: { appends: number; fsyncs: number }; clock: { calls: number }; calls: { initial: number; expanded: number } } {
      const files = buildVerifiedFiles();
      const baseDir = makeTempDir();
      const effects = { appends: 0, fsyncs: 0 };
      const clock = { calls: 0 };
      const calls = { initial: 0, expanded: 0 };
      const reportOptions = {
        getReportOutcomePlan: (selectedProfile?: unknown) => {
          if (selectedProfile === undefined) {
            calls.initial += 1;
            return initialRows;
          }
          calls.expanded += 1;
          return expandedRows;
        },
      };
      if (rejectAt === "construction") {
        expect(() =>
          openStrictLedger(baseDir, { files, reportOptions, effects, clock }),
        ).toThrow(CalibrationFatalError);
        expect(effects).toEqual({ appends: 0, fsyncs: 0 });
        expect(clock.calls).toBe(0);
        return { effects, clock, calls };
      }
      const { ledger, owner } = openStrictLedger(baseDir, { files, reportOptions, effects, clock });
      ledger.acquireLock(owner);
      reservePreflightPair(ledger, FIRST_DEV);
      ledger.completeStage("preflight", preflightSummary() as never);
      completeDevelopment48(ledger);
      const beforeAppends = effects.appends;
      const beforeFsyncs = effects.fsyncs;
      const beforeClock = clock.calls;
      const ledgerFile = resolve(baseDir, CALIBRATION_ROOT, "ledger.json");
      const beforeBytes = readFileSync(ledgerFile, "utf8");
      const beforeCounts = ledger.getCounts();
      if (rejectAt === "selection") {
        expect(() =>
          ledger.recordProfileSelection("MEDIUM", "fewer_unsafe", developmentSummary() as never),
        ).toThrow(CalibrationFatalError);
        expect(effects.appends).toBe(beforeAppends);
        expect(effects.fsyncs).toBe(beforeFsyncs);
        expect(clock.calls).toBe(beforeClock);
        expect(readFileSync(ledgerFile, "utf8")).toBe(beforeBytes);
        expect(ledger.getCounts()).toEqual(beforeCounts);
      } else {
        expect(() =>
          ledger.recordProfileSelection("MEDIUM", "fewer_unsafe", developmentSummary() as never),
        ).not.toThrow();
      }
      return { effects, clock, calls };
    }

    it("control: the real unmutated initial/expanded pair constructs and selects cleanly", () => {
      const derive = loadOutcomePlanner();
      const files = buildVerifiedFiles();
      const validInitial = derive(files);
      const validExpanded = derive(files, "MEDIUM");
      const result = runSourceShapeCase(clonePlanRows(validInitial), clonePlanRows(validExpanded), "none");
      expect(result.calls.initial).toBe(1);
      expect(result.calls.expanded).toBe(1);
    });

    it("rejects a preflight-stage row mislabeled scanMode label before any persistence", () => {
      const derive = loadOutcomePlanner();
      const files = buildVerifiedFiles();
      const validInitial = derive(files);
      const validExpanded = derive(files, "MEDIUM");
      const mutatedInitial = withMutatedRow(validInitial, 0, (row) => ({ ...row, scanMode: "label" }));
      const result = runSourceShapeCase(mutatedInitial, clonePlanRows(validExpanded), "construction");
      expect(result.calls.initial).toBe(1);
      expect(result.calls.expanded).toBe(0);
    });

    it("rejects initial development label row changed meal->label before clock/fsync events", () => {
      const derive = loadOutcomePlanner();
      const files = buildVerifiedFiles();
      const validInitial = derive(files);
      const validExpanded = derive(files, "MEDIUM");
      const devIndex = validInitial.findIndex((row) => row.key.stage === "development" && row.key.profile === "LOW" && row.scanMode === "meal");
      expect(devIndex).toBeGreaterThanOrEqual(0);
      const mutatedInitial = withMutatedRow(validInitial, devIndex, (row) => ({ ...row, scanMode: "label" }));
      const result = runSourceShapeCase(mutatedInitial, clonePlanRows(validExpanded), "construction");
      expect(result.calls.initial).toBe(1);
      expect(result.calls.expanded).toBe(0);
    });

    it("rejects a validation-stage row mislabeled scanMode label at selection", () => {
      const derive = loadOutcomePlanner();
      const files = buildVerifiedFiles();
      const validInitial = derive(files);
      const validExpanded = derive(files, "MEDIUM");
      const validationIndex = validExpanded.findIndex((row) => row.key.stage === "validation");
      expect(validationIndex).toBeGreaterThanOrEqual(0);
      const mutatedValidation = withMutatedRow(validExpanded, validationIndex, (row) => ({ ...row, scanMode: "label" }));
      const result = runSourceShapeCase(clonePlanRows(validInitial), mutatedValidation, "selection");
      expect(result.calls.initial).toBe(1);
      expect(result.calls.expanded).toBe(1);
    });

    it("rejects a benchmark label row flipped to meal, breaking the real 36/12 split", () => {
      const derive = loadOutcomePlanner();
      const files = buildVerifiedFiles();
      const validInitial = derive(files);
      const validExpanded = derive(files, "MEDIUM");
      const labelIndex = validExpanded.findIndex((row) => row.key.stage === "benchmark" && row.scanMode === "label");
      expect(labelIndex).toBeGreaterThanOrEqual(0);
      const mutatedBenchmark = withMutatedRow(validExpanded, labelIndex, (row) => ({ ...row, scanMode: "meal" }));
      const result = runSourceShapeCase(clonePlanRows(validInitial), mutatedBenchmark, "selection");
      expect(result.calls.initial).toBe(1);
      expect(result.calls.expanded).toBe(1);
    });

    it("rejects a benchmark case whose three samples disagree on scanMode while aggregate counts stay 36/12", () => {
      const derive = loadOutcomePlanner();
      const files = buildVerifiedFiles();
      const validInitial = derive(files);
      const validExpanded = derive(files, "MEDIUM");
      const labelIndex = validExpanded.findIndex((row) => row.key.stage === "benchmark" && row.scanMode === "label");
      const mealIndex = validExpanded.findIndex((row) => row.key.stage === "benchmark" && row.scanMode === "meal");
      expect(labelIndex).toBeGreaterThanOrEqual(0);
      expect(mealIndex).toBeGreaterThanOrEqual(0);
      const onceSwapped = clonePlanRows(validExpanded);
      const labelRow = onceSwapped[labelIndex] as { key: ReportOutcomeKey; scanMode: "meal" | "label" | "barcode" };
      const mealRow = onceSwapped[mealIndex] as { key: ReportOutcomeKey; scanMode: "meal" | "label" | "barcode" };
      onceSwapped[labelIndex] = { key: labelRow.key, scanMode: "meal" };
      onceSwapped[mealIndex] = { key: mealRow.key, scanMode: "label" };
      const benchmarkRows = onceSwapped.filter((row) => row.key.stage === "benchmark");
      expect(benchmarkRows.filter((row) => row.scanMode === "meal")).toHaveLength(36);
      expect(benchmarkRows.filter((row) => row.scanMode === "label")).toHaveLength(12);
      const result = runSourceShapeCase(clonePlanRows(validInitial), onceSwapped, "selection");
      expect(result.calls.initial).toBe(1);
      expect(result.calls.expanded).toBe(1);
    });

    it("rejects 12 barcode rows split across five case identities with incomplete per-case coverage", () => {
      const derive = loadOutcomePlanner();
      const files = buildVerifiedFiles();
      const validInitial = derive(files);
      const validExpanded = derive(files, "MEDIUM");
      const barcodeRows = validExpanded.filter((row) => row.scanMode === "barcode");
      expect(barcodeRows).toHaveLength(12);
      const profile = barcodeRows[0]?.key.profile as "LOW" | "MEDIUM";
      const realIds = [...new Set(barcodeRows.map((row) => row.key.caseId))];
      expect(realIds).toHaveLength(4);
      const fifthId = "synthetic-fifth-barcode";
      const skewedBarcodeRows: unknown[] = [];
      for (const id of realIds.slice(0, 3)) {
        for (let s = 1; s <= 3; s += 1) {
          skewedBarcodeRows.push({ key: { stage: "benchmark", profile, caseId: id, sampleIndex: s }, scanMode: "barcode" });
        }
      }
      skewedBarcodeRows.push({ key: { stage: "benchmark", profile, caseId: realIds[3] as string, sampleIndex: 1 }, scanMode: "barcode" });
      skewedBarcodeRows.push({ key: { stage: "benchmark", profile, caseId: realIds[3] as string, sampleIndex: 2 }, scanMode: "barcode" });
      skewedBarcodeRows.push({ key: { stage: "benchmark", profile, caseId: fifthId, sampleIndex: 1 }, scanMode: "barcode" });
      expect(skewedBarcodeRows).toHaveLength(12);
      const nonBarcodeRows = clonePlanRows(validExpanded).filter((row) => row.scanMode !== "barcode");
      const mutatedBarcodeExpanded = [...nonBarcodeRows, ...skewedBarcodeRows];
      const result = runSourceShapeCase(clonePlanRows(validInitial), mutatedBarcodeExpanded, "selection");
      expect(result.calls.initial).toBe(1);
      expect(result.calls.expanded).toBe(1);
    });

    it("rejects a reordered first-50 prefix inside the expanded 158-row plan", () => {
      const derive = loadOutcomePlanner();
      const files = buildVerifiedFiles();
      const validInitial = derive(files);
      const validExpanded = derive(files, "MEDIUM");
      const reorderedExpanded = clonePlanRows(validExpanded);
      const swapTmp = reorderedExpanded[0];
      reorderedExpanded[0] = reorderedExpanded[1] as typeof swapTmp;
      reorderedExpanded[1] = swapTmp as typeof swapTmp;
      const result = runSourceShapeCase(clonePlanRows(validInitial), reorderedExpanded, "selection");
      expect(result.calls.initial).toBe(1);
      expect(result.calls.expanded).toBe(1);
    });
  });

  describe("strict prerequisites: lifecycle ordering gaps", () => {
    function expectPrematureRefusal(
      baseDir: string,
      ledger: ReturnType<typeof createProtocolCalibrationLedger>,
      key: ReportOutcomeKey,
      reason: "dataset" | "barcode",
      prediction: NutritionPrediction,
      clock: { calls: number },
      effects: { appends: number; fsyncs: number },
    ): void {
      const record = loadRecordNonReservation(ledger);
      const before = ledger.getCounts();
      const clockBefore = clock.calls;
      const effectsBefore = { ...effects };
      const ledgerFile = resolve(baseDir, CALIBRATION_ROOT, "ledger.json");
      const journalFile = resolve(baseDir, CALIBRATION_ROOT, "journal.json");
      const ledgerBefore = existsSync(ledgerFile) ? readFileSync(ledgerFile, "utf8") : "";
      const journalBefore = existsSync(journalFile) ? readFileSync(journalFile, "utf8") : "";
      expect(() => record({ key, reason, prediction })).toThrow(CalibrationFatalError);
      expect(ledger.getCounts()).toEqual(before);
      const ledgerAfter = existsSync(ledgerFile) ? readFileSync(ledgerFile, "utf8") : "";
      const journalAfter = existsSync(journalFile) ? readFileSync(journalFile, "utf8") : "";
      expect(ledgerAfter).toBe(ledgerBefore);
      expect(journalAfter).toBe(journalBefore);
      expect(clock.calls).toBe(clockBefore);
      expect(effects).toEqual(effectsBefore);
    }

    it("rejects a development dataset failure recorded before preflight even starts", () => {
      const files = buildVerifiedFiles();
      const devIds = devCaseIds();
      const baseDir = makeTempDir();
      const { ledger, owner, clock, effects } = openStrictLedger(baseDir, { files, reportOptions: makeReportOptions(files) });
      ledger.acquireLock(owner);
      const key: ReportOutcomeKey = { stage: "development", profile: "LOW", caseId: devIds[0] as string, sampleIndex: 1 };
      expectPrematureRefusal(baseDir, ledger, key, "dataset", datasetFailurePrediction(1), clock, effects);
    });

    it("rejects a LOW preflight dataset failure recorded before the token-count reservation completes", () => {
      const files = buildVerifiedFiles();
      const baseDir = makeTempDir();
      const { ledger, owner, clock, effects } = openStrictLedger(baseDir, { files, reportOptions: makeReportOptions(files) });
      ledger.acquireLock(owner);
      const key: ReportOutcomeKey = { stage: "preflight", profile: "LOW", caseId: FIRST_DEV, sampleIndex: 1 };
      expectPrematureRefusal(baseDir, ledger, key, "dataset", datasetFailurePrediction(1), clock, effects);
    });

    it("rejects a validation dataset failure recorded after selection but before development is sealed", () => {
      const files = buildVerifiedFiles();
      const validationIds = validationCaseIds();
      const baseDir = makeTempDir();
      const { ledger, owner, clock, effects } = openStrictLedger(baseDir, { files, reportOptions: makeReportOptions(files) });
      ledger.acquireLock(owner);
      reservePreflightPair(ledger, FIRST_DEV);
      ledger.completeStage("preflight", preflightSummary() as never);
      completeDevelopment48(ledger);
      ledger.recordProfileSelection("MEDIUM", "fewer_unsafe", developmentSummary() as never);
      const key: ReportOutcomeKey = { stage: "validation", profile: "MEDIUM", caseId: validationIds[0] as string, sampleIndex: 1 };
      expectPrematureRefusal(baseDir, ledger, key, "dataset", datasetFailurePrediction(1), clock, effects);
    });

    it("rejects a benchmark barcode success recorded after development but before validation is sealed", () => {
      const files = buildVerifiedFiles();
      const barcodeIds = publicCaseIds("barcode");
      const baseDir = makeTempDir();
      const { ledger, owner, clock, effects } = openStrictLedger(baseDir, { files, reportOptions: makeReportOptions(files) });
      ledger.acquireLock(owner);
      reservePreflightPair(ledger, FIRST_DEV);
      ledger.completeStage("preflight", preflightSummary() as never);
      completeDevelopment48(ledger);
      ledger.recordProfileSelection("MEDIUM", "fewer_unsafe", developmentSummary() as never);
      ledger.completeStage("development", developmentSummary() as never);
      const key: ReportOutcomeKey = { stage: "benchmark", profile: "MEDIUM", caseId: barcodeIds[0] as string, sampleIndex: 1 };
      expectPrematureRefusal(baseDir, ledger, key, "barcode", barcodeSuccessPrediction(1), clock, effects);
    });

    it("refuses a sealed-benchmark barcode when all 48 IMAGE keys are reserved, no recordBarcode effect", () => {
      const files = buildVerifiedFiles();
      const derive = loadOutcomePlanner();
      const baseDir = makeTempDir();
      const { ledger, owner, clock, effects } = openStrictLedger(baseDir, { files, reportOptions: makeReportOptions(files) });
      ledger.acquireLock(owner);
      reservePreflightPair(ledger, FIRST_DEV);
      ledger.completeStage("preflight", preflightSummary() as never);
      completeDevelopment48(ledger);
      ledger.recordProfileSelection("MEDIUM", "fewer_unsafe", developmentSummary() as never);
      ledger.completeStage("development", developmentSummary() as never);
      // Complete validation before benchmark
      completeValidation48(ledger, "MEDIUM");
      ledger.completeStage("validation", validationSummary() as never);
      // Reserve all 48 benchmark IMAGE keys using canonical report planner
      const expanded = derive(files, "MEDIUM");
      const benchmarkRows = expanded.filter((row) => row.key.stage === "benchmark" && row.scanMode !== "barcode");
      expect(benchmarkRows).toHaveLength(48);
      for (const row of benchmarkRows) {
        ledger.reserve(row.key);
        const entry = fullSuccessEntry(row.key, STAGE_PIN_VERSION, { ...mealSuccessPrediction(row.key.sampleIndex), source: row.scanMode });
        ledger.complete(row.key, ledger.appendResultJournal(entry));
      }
      // Complete benchmark once with valid predecessor summary
      const firstBarcodeKey = publicCaseIds("barcode")[0];
      const key: ReportOutcomeKey = { stage: "benchmark", profile: "MEDIUM", caseId: firstBarcodeKey, sampleIndex: 1 };
      ledger.completeStage("benchmark", { stage: "benchmark", passed: true, completedStages: ["preflight", "development", "validation"] } as never);
      expect(ledger.getCompletedStages()).toContain("benchmark");
      // Attempt recordBarcode after sealed benchmark - should reject with no effects
      expectPrematureRefusal(baseDir, ledger, key, "barcode", barcodeSuccessPrediction(1), clock, effects);
    });
  });

  describe("strict prerequisites: replay refusal (independently constructed events)", () => {
    it("refuses an independently constructed too-early non-reservation event on replay", async () => {
      const files = buildVerifiedFiles();
      const devIds = devCaseIds();
      const baseDir = makeTempDir();
      const { ledger, owner } = openStrictLedger(baseDir, { files, reportOptions: makeReportOptions(files) });
      ledger.acquireLock(owner);
      ledger.releaseLock(owner);
      const fsModule = await import("node:fs");
      const ledgerFile = resolve(baseDir, CALIBRATION_ROOT, "ledger.json");
      const rawEvents = JSON.parse(fsModule.readFileSync(ledgerFile, "utf8")) as Array<Record<string, unknown>>;
      expect(rawEvents).toHaveLength(1);
      expect(rawEvents[0]?.["type"]).toBe("protocol_identity");
      const tooEarlyKey: ReportOutcomeKey = { stage: "development", profile: "LOW", caseId: devIds[0] as string, sampleIndex: 1 };
      const tooEarlyEvent = buildCanonicalNonReservationEvent(
        tooEarlyKey,
        "dataset",
        datasetFailurePrediction(1),
        "2026-10-07T00:00:01.000Z",
      );
      fsModule.writeFileSync(ledgerFile, JSON.stringify([...rawEvents, tooEarlyEvent]), "utf8");
      expect(() =>
        createProtocolCalibrationLedger(
          createFileCalibrationLedgerDeps(baseDir),
          makeIdentity(),
          makeInitial50Resolver(undefined, files),
          makeReportOptions(files),
        ),
      ).toThrow(CalibrationFatalError);
    });

    it("does not let a stale retained expanded plan authorize a nonres event replayed before profile_selected on the same instance", async () => {
      const files = buildVerifiedFiles();
      const validationIds = validationCaseIds();
      const baseDir = makeTempDir();
      const { callback, calls } = makeValidCallback(files);
      const reportOptions = { getReportOutcomePlan: callback };
      const { ledger, owner } = openStrictLedger(baseDir, { files, reportOptions });
      ledger.acquireLock(owner);
      reservePreflightPair(ledger, FIRST_DEV);
      ledger.completeStage("preflight", preflightSummary() as never);
      completeDevelopment48(ledger);
      ledger.recordProfileSelection("MEDIUM", "fewer_unsafe", developmentSummary() as never);
      expect(calls.expanded).toBe(1);
      ledger.releaseLock(owner);

      const fsModule = await import("node:fs");
      const ledgerFile = resolve(baseDir, CALIBRATION_ROOT, "ledger.json");
      const rawEvents = JSON.parse(fsModule.readFileSync(ledgerFile, "utf8")) as Array<Record<string, unknown>>;
      const selectionIndex = rawEvents.findIndex((event) => event["type"] === "profile_selected");
      expect(selectionIndex).toBeGreaterThan(0);
      const earlyKey: ReportOutcomeKey = { stage: "validation", profile: "MEDIUM", caseId: validationIds[0] as string, sampleIndex: 1 };
      const earlyEvent = buildCanonicalNonReservationEvent(
        earlyKey,
        "dataset",
        datasetFailurePrediction(1),
        "2026-10-07T00:00:02.000Z",
      );
      const withEarlyEvent = [...rawEvents.slice(0, selectionIndex), earlyEvent, ...rawEvents.slice(selectionIndex)];
      fsModule.writeFileSync(ledgerFile, JSON.stringify(withEarlyEvent), "utf8");

      expect(() => ledger.acquireLock(owner)).toThrow(CalibrationFatalError);
      expect(calls.expanded).toBe(1);
    });
  });

  describe("cached non-reservation predictions", () => {
    it("accepts a cached:false development dataset outcome", () => {
      const files = buildVerifiedFiles();
      const devIds = devCaseIds();
      const baseDir = makeTempDir();
      const { ledger, owner } = openStrictLedger(baseDir, { files, reportOptions: makeReportOptions(files) });
      ledger.acquireLock(owner);
      reservePreflightPair(ledger, FIRST_DEV);
      ledger.completeStage("preflight", preflightSummary() as never);
      const record = loadRecordNonReservation(ledger);
      const key: ReportOutcomeKey = { stage: "development", profile: "LOW", caseId: devIds[5] as string, sampleIndex: 1 };
      expect(() => record({ key, reason: "dataset", prediction: datasetFailurePrediction(1) })).not.toThrow();
    });

    it("rejects a cached:true development dataset outcome with no added clock/fsync/event/count effects", () => {
      const files = buildVerifiedFiles();
      const devIds = devCaseIds();
      const baseDir = makeTempDir();
      const effects = { appends: 0, fsyncs: 0 };
      const clock = { calls: 0 };
      const { ledger, owner } = openStrictLedger(baseDir, { files, reportOptions: makeReportOptions(files), effects, clock });
      ledger.acquireLock(owner);
      reservePreflightPair(ledger, FIRST_DEV);
      ledger.completeStage("preflight", preflightSummary() as never);
      const record = loadRecordNonReservation(ledger);
      const key: ReportOutcomeKey = { stage: "development", profile: "LOW", caseId: devIds[6] as string, sampleIndex: 1 };
      const beforeCounts = ledger.getCounts();
      const beforeAppends = effects.appends;
      const beforeFsyncs = effects.fsyncs;
      const beforeClock = clock.calls;
      const beforeEvents = createFileCalibrationLedgerDeps(baseDir).readLedgerEvents().length;
      expect(() =>
        record({ key, reason: "dataset", prediction: { ...datasetFailurePrediction(1), cached: true } }),
      ).toThrow(CalibrationFatalError);
      expect(ledger.getCounts()).toEqual(beforeCounts);
      expect(effects.appends).toBe(beforeAppends);
      expect(effects.fsyncs).toBe(beforeFsyncs);
      expect(clock.calls).toBe(beforeClock);
      expect(createFileCalibrationLedgerDeps(baseDir).readLedgerEvents()).toHaveLength(beforeEvents);
    });

    it("accepts a cached:false benchmark barcode outcome", () => {
      const files = buildVerifiedFiles();
      const barcodeIds = publicCaseIds("barcode");
      const baseDir = makeTempDir();
      const { ledger, owner } = openStrictLedger(baseDir, { files, reportOptions: makeReportOptions(files) });
      ledger.acquireLock(owner);
      reservePreflightPair(ledger, FIRST_DEV);
      ledger.completeStage("preflight", preflightSummary() as never);
      completeDevelopment48(ledger);
      ledger.recordProfileSelection("MEDIUM", "fewer_unsafe", developmentSummary() as never);
      ledger.completeStage("development", developmentSummary() as never);
      completeValidation48(ledger, "MEDIUM");
      ledger.completeStage("validation", validationSummary() as never);
      const record = loadRecordNonReservation(ledger);
      const key: ReportOutcomeKey = { stage: "benchmark", profile: "MEDIUM", caseId: barcodeIds[0] as string, sampleIndex: 1 };
      expect(() => record({ key, reason: "barcode", prediction: barcodeSuccessPrediction(1) })).not.toThrow();
    });

    it("rejects a cached:true benchmark barcode outcome with no added clock/fsync/event/count effects", () => {
      const files = buildVerifiedFiles();
      const barcodeIds = publicCaseIds("barcode");
      const baseDir = makeTempDir();
      const effects = { appends: 0, fsyncs: 0 };
      const clock = { calls: 0 };
      const { ledger, owner } = openStrictLedger(baseDir, { files, reportOptions: makeReportOptions(files), effects, clock });
      ledger.acquireLock(owner);
      reservePreflightPair(ledger, FIRST_DEV);
      ledger.completeStage("preflight", preflightSummary() as never);
      completeDevelopment48(ledger);
      ledger.recordProfileSelection("MEDIUM", "fewer_unsafe", developmentSummary() as never);
      ledger.completeStage("development", developmentSummary() as never);
      completeValidation48(ledger, "MEDIUM");
      ledger.completeStage("validation", validationSummary() as never);
      const record = loadRecordNonReservation(ledger);
      const key: ReportOutcomeKey = { stage: "benchmark", profile: "MEDIUM", caseId: barcodeIds[1] as string, sampleIndex: 1 };
      const beforeCounts = ledger.getCounts();
      const beforeAppends = effects.appends;
      const beforeFsyncs = effects.fsyncs;
      const beforeClock = clock.calls;
      const beforeEvents = createFileCalibrationLedgerDeps(baseDir).readLedgerEvents().length;
      expect(() =>
        record({ key, reason: "barcode", prediction: { ...barcodeSuccessPrediction(1), cached: true } }),
      ).toThrow(CalibrationFatalError);
      expect(ledger.getCounts()).toEqual(beforeCounts);
      expect(effects.appends).toBe(beforeAppends);
      expect(effects.fsyncs).toBe(beforeFsyncs);
      expect(clock.calls).toBe(beforeClock);
      expect(createFileCalibrationLedgerDeps(baseDir).readLedgerEvents()).toHaveLength(beforeEvents);
    });
  });

  describe("captured expanded plan consistency across reacquire", () => {
    it("does not re-invoke the plan callback on a clean same-profile reacquire", () => {
      const files = buildVerifiedFiles();
      const baseDir = makeTempDir();
      const { callback, calls } = makeValidCallback(files);
      const { ledger, owner } = openStrictLedger(baseDir, { files, reportOptions: { getReportOutcomePlan: callback } });
      ledger.acquireLock(owner);
      reservePreflightPair(ledger, FIRST_DEV);
      ledger.completeStage("preflight", preflightSummary() as never);
      completeDevelopment48(ledger);
      ledger.recordProfileSelection("MEDIUM", "fewer_unsafe", developmentSummary() as never);
      expect(calls.initial).toBe(1);
      expect(calls.expanded).toBe(1);
      ledger.releaseLock(owner);

      ledger.acquireLock(owner);
      expect(calls.initial).toBe(1);
      expect(calls.expanded).toBe(1);
    });

    it("refuses a tampered profile_selected MEDIUM to LOW replay on the same instance, and never reinvokes the callback", async () => {
      const files = buildVerifiedFiles();
      const baseDir = makeTempDir();
      const { callback, calls } = makeValidCallback(files);
      const { ledger, owner } = openStrictLedger(baseDir, { files, reportOptions: { getReportOutcomePlan: callback } });
      ledger.acquireLock(owner);
      reservePreflightPair(ledger, FIRST_DEV);
      ledger.completeStage("preflight", preflightSummary() as never);
      completeDevelopment48(ledger);
      ledger.recordProfileSelection("MEDIUM", "fewer_unsafe", developmentSummary() as never);
      expect(calls.expanded).toBe(1);
      ledger.releaseLock(owner);

      const fsModule = await import("node:fs");
      const ledgerFile = resolve(baseDir, CALIBRATION_ROOT, "ledger.json");
      const rawEvents = JSON.parse(fsModule.readFileSync(ledgerFile, "utf8")) as Array<Record<string, unknown>>;
      let tampered = 0;
      for (const event of rawEvents) {
        if (event["type"] === "profile_selected") {
          event["profile"] = "LOW";
          tampered += 1;
        }
      }
      expect(tampered).toBe(1);
      fsModule.writeFileSync(ledgerFile, JSON.stringify(rawEvents), "utf8");

      // Break caught: reacquiring the SAME instance replays the tampered
      // event; selectedProfile becomes LOW while cachedExpandedPlan silently
      // keeps the stale MEDIUM-keyed rows (the captured-once guard has no
      // revalidation gate). Reacquire must refuse/poison this inconsistency
      // instead of silently accepting it, and the callback must stay
      // captured-once regardless of the outcome.
      expect(() => ledger.acquireLock(owner)).toThrow(CalibrationFatalError);
      expect(calls.expanded).toBe(1);
    });

  });
});
