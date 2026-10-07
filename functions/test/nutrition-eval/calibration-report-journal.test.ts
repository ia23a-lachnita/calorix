/**
 * Task 1 Step 1 — TESTS ONLY for the closed full prediction journal.
 *
 * Contract under test (see `.superpowers/sdd/2026-10-07-calibration-report-journal/task-1-brief.md`):
 * a pure codec (`captureCalibrationReportPrediction` /
 * `captureCalibrationReportJournalEntry`) plus an optional seventh
 * `reportPrediction` journal field routed through the file store, the strict
 * protocol ledger, and the pre-pin session seam, with a strict-only
 * `getCompletedReportPredictions()` accessor.
 *
 * Hermetic contract: real production scorer/schema (`schema.ts`,
 * `scorer.ts`), real file store (`createFileCalibrationLedgerDeps`), and the
 * real strict ledger (`createProtocolCalibrationLedger`). Only injected
 * token/image callbacks are faked; the ledger, products, and scorer are never
 * mocked. Global fetch is trapped to throw. All temp dirs live under the
 * task disk TMPDIR. No provider client, network, Firebase, device, emulator,
 * or deployment occurs here.
 *
 * RED expectation: the codec module and the strict accessor do not exist
 * yet, so every test that needs them fails with a clear RED marker while
 * the pre-existing suites stay green. Tests marked GREEN pass both before
 * and after the source step (legacy preservation / existing fail-closed
 * protection) and are not counted as new RED.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CALIBRATION_ROOT,
  createProtocolCalibrationLedger,
} from '../../src/nutrition-eval/calibration';
import type {
  CalibrationIdentity,
  CalibrationKeyResolver,
  CalibrationOwner,
  JournalEntry,
  ReservationKey,
  TokenCountReservationKey,
} from '../../src/nutrition-eval/calibration';
import * as bootstrapModule from '../../src/nutrition-eval/calibration-bootstrap';
import type { CalibrationPreparedContext } from '../../src/nutrition-eval/calibration-bootstrap';
import { createFileCalibrationLedgerDeps } from '../../src/nutrition-eval/calibration-file-store';
import * as cliModule from '../../src/nutrition-eval/calibration-cli';
import * as preflightSessionModule from '../../src/nutrition-eval/calibration-preflight-session';
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';
import {
  NutritionPredictionSchema,
  isCanonicalNutritionTuple,
} from '../../src/nutrition-eval/schema';
import type {
  NutritionEvalCase,
  NutritionPrediction,
} from '../../src/nutrition-eval/schema';
import { scoreNutritionCase } from '../../src/nutrition-eval/scorer';

// ── Missing-codec loader (RED until the source step lands) ───────────────────

interface ReportJournalCodec {
  captureCalibrationReportPrediction: (value: unknown) => Record<string, unknown>;
  captureCalibrationReportJournalEntry: (value: unknown) => Record<string, unknown>;
}

async function loadCodec(): Promise<ReportJournalCodec> {
  try {
    const mod = (await import(
      '../../src/nutrition-eval/calibration-report-journal'
    )) as Partial<ReportJournalCodec>;
    if (
      typeof mod.captureCalibrationReportPrediction !== 'function' ||
      typeof mod.captureCalibrationReportJournalEntry !== 'function'
    ) {
      throw new Error('exports missing');
    }
    return mod as ReportJournalCodec;
  } catch {
    throw new Error(
      'RED: missing functions/src/nutrition-eval/calibration-report-journal.ts ' +
        '(codec not yet implemented; Step 1 expects this RED)',
    );
  }
}

type CompletedReportPrediction = {
  readonly key: ReservationKey;
  readonly prediction: NutritionPrediction;
};

function loadReportAccessor(
  ledger: unknown,
): () => readonly CompletedReportPrediction[] {
  const fn = (ledger as Record<string, unknown>)['getCompletedReportPredictions'];
  expect(
    typeof fn,
    'RED: strict ledger getCompletedReportPredictions() not yet implemented',
  ).toBe('function');
  return fn as () => readonly CompletedReportPrediction[];
}

// ── Hermetic fixtures ─────────────────────────────────────────────────────────

const tempDirs: string[] = [];

function taskTmpDir(): string {
  const env = process.env.TMPDIR;
  if (env !== undefined && env.length > 0) return env;
  return tmpdir();
}

function makeTempDir(): string {
  const dir = mkdtempSync(join(taskTmpDir(), 'calorix-report-journal-'));
  tempDirs.push(dir);
  return dir;
}

beforeEach(() => {
  vi.stubGlobal('fetch', () => {
    throw new Error('network disabled in report-journal tests');
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

function sha256CanonicalNutrients(nutrients: Record<string, number>): string {
  return sha256Hex(
    JSON.stringify({
      kcal: nutrients['kcal'],
      proteinG: nutrients['proteinG'],
      carbsG: nutrients['carbsG'],
      fatG: nutrients['fatG'],
    }),
  );
}

/** Canonical meal-success fixture, values verbatim from the task brief. */
function canonicalSuccessPrediction(): Record<string, unknown> {
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
    sampleIndex: 1,
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

/** Same values as the canonical fixture but inserted in reverse key order. */
function reversedKeyOrderPrediction(): Record<string, unknown> {
  const canonical = canonicalSuccessPrediction();
  const reversed: Record<string, unknown> = {};
  for (const key of Object.keys(canonical).reverse()) {
    reversed[key] = canonical[key];
  }
  return reversed;
}

function validParserFailure(): Record<string, unknown> {
  return {
    parseStatus: 'failure',
    source: 'meal',
    decision: 'error',
    failureCategory: 'schema',
    failureCode: 'model_response_invalid',
    failureDetail: 'invalid_json',
    latencyMs: 17,
    sampleIndex: 1,
    cached: false,
  };
}

function validProviderFailure(): Record<string, unknown> {
  return {
    parseStatus: 'failure',
    source: 'barcode',
    decision: 'error',
    failureCategory: 'provider',
    failureCode: 'provider_request_failed',
    latencyMs: 9,
    sampleIndex: 2,
    cached: false,
  };
}

function validBarcodeSuccess(): Record<string, unknown> {
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
    sampleIndex: 1,
    cached: false,
  };
}

function mealEvalCase(): NutritionEvalCase {
  return {
    id: 'meal-case-001',
    visibility: 'public',
    scanMode: 'meal',
    source: { dataset: 'nutrition5k', objectId: 'dish_1' },
    image: {
      url: 'https://storage.googleapis.com/nutrition5k_dataset/img.png',
      sha256: 'a'.repeat(64),
      mediaType: 'image/png',
      width: 640,
      height: 480,
    },
    truth: {
      basis: 'portion',
      amount: 1,
      unit: 'portion',
      kcal: 120,
      proteinG: 10,
      carbsG: 0,
      fatG: 8,
      referenceMassG: 100,
    },
    toleranceClass: 'meal-estimate',
    attributionId: 'nutrition5k-cc-by-4.0',
  };
}

async function expectReportJournalInvalid(
  run: () => unknown,
): Promise<CalibrationFatalError> {
  let error: unknown;
  try {
    await run();
  } catch (cause: unknown) {
    error = cause;
  }
  expect(error).toBeInstanceOf(CalibrationFatalError);
  const fatal = error as CalibrationFatalError;
  expect(fatal.message).toBe('calibration:report-journal-invalid');
  expect(fatal.cause).toBeUndefined();
  return fatal;
}

// ── Strict-ledger real-file helpers ───────────────────────────────────────────

const PINNED_VERSION = 'gemini-3.8-test-pin-001';
const FIRST_DEV = 'calibration-dish_0000';

function devCaseIds(): string[] {
  const ids: string[] = [FIRST_DEV];
  for (let index = 1; index < 24; index += 1) {
    ids.push(`calibration-dish_${String(index).padStart(4, '0')}`);
  }
  return ids;
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
    hostname: 'report-journal-tests',
    bootId: 'report-journal-boot',
    pid: 4242,
    startTicks: 4242,
    acquiredAt: '2026-10-07T00:00:00.000Z',
  };
}

/** Hand resolver mirroring the canonical initial 50 (2 preflight + 48 development). */
function makeInitial50Resolver(first: string, devs: string[]): CalibrationKeyResolver {
  return () => {
    const keys: ReservationKey[] = [
      { stage: 'preflight', profile: 'LOW', caseId: first, sampleIndex: 1 },
      { stage: 'preflight', profile: 'MEDIUM', caseId: first, sampleIndex: 1 },
    ];
    for (const caseId of devs) {
      keys.push({ stage: 'development', profile: 'LOW', caseId, sampleIndex: 1 });
      keys.push({ stage: 'development', profile: 'MEDIUM', caseId, sampleIndex: 1 });
    }
    return Object.freeze(keys);
  };
}

function openStrictLedger(baseDir: string) {
  const identity = makeIdentity();
  const devs = devCaseIds();
  const resolver = makeInitial50Resolver(FIRST_DEV, devs);
  const fileDeps = createFileCalibrationLedgerDeps(baseDir);
  const ledger = createProtocolCalibrationLedger(fileDeps, identity, resolver);
  const owner = makeOwner();
  return { identity, resolver, fileDeps, ledger, owner };
}

function tokenKeyFor(first: string): TokenCountReservationKey {
  return { kind: 'token_count', stage: 'preflight', caseId: first, model: 'gemini-3.8-flash' };
}

function lowKeyFor(first: string): ReservationKey {
  return { stage: 'preflight', profile: 'LOW', caseId: first, sampleIndex: 1 };
}

function reserveLowFlow(
  ledger: ReturnType<typeof createProtocolCalibrationLedger>,
  first: string,
): ReservationKey {
  const tokenKey = tokenKeyFor(first);
  ledger.reserveTokenCount(tokenKey);
  ledger.completeTokenCount(tokenKey, 42);
  const key = lowKeyFor(first);
  ledger.reserve(key);
  return key;
}

function legacySuccessEntry(
  key: ReservationKey,
  version: string,
  latencyMs = 11,
): JournalEntry {
  const normalized = { kcal: 320, proteinG: 20, carbsG: 30, fatG: 10 };
  return {
    key: { ...key },
    predictionHash: sha256Hex(JSON.stringify(normalized)),
    normalizedPrediction: { ...normalized },
    analysisLatencyMs: latencyMs,
    errorCategory: 'none',
    responseModelVersion: version,
  };
}

/** Seven-field extended success entry in canonical key order. */
function extendedSuccessEntry(
  key: ReservationKey,
  version: string,
  latencyMs = 17,
): Record<string, unknown> {
  const four = { kcal: 120, proteinG: 10, carbsG: 0, fatG: 8 };
  const report = {
    ...canonicalSuccessPrediction(),
    latencyMs,
    sampleIndex: key.sampleIndex,
  };
  return {
    key: { ...key },
    predictionHash: sha256CanonicalNutrients(four),
    normalizedPrediction: { ...four, estimatedTotalMassG: 90 },
    analysisLatencyMs: latencyMs,
    errorCategory: 'none',
    responseModelVersion: version,
    reportPrediction: report,
  };
}

/** Plain valid nested report target for hostile-proxy wrapping. */
function hostileReportTarget(key: ReservationKey): Record<string, unknown> {
  return {
    ...canonicalSuccessPrediction(),
    latencyMs: 17,
    sampleIndex: key.sampleIndex,
  };
}

/** Reserve/pin/append/complete one extended success entry on a real strict ledger. */
function completeExtendedEntry(baseDir: string): {
  identity: CalibrationIdentity;
  resolver: CalibrationKeyResolver;
  key: ReservationKey;
} {
  const { identity, resolver, ledger, owner } = openStrictLedger(baseDir);
  ledger.acquireLock(owner);
  const key = reserveLowFlow(ledger, FIRST_DEV);
  ledger.pinModelVersion(PINNED_VERSION);
  const hash = ledger.appendResultJournal(
    extendedSuccessEntry(key, PINNED_VERSION) as unknown as JournalEntry,
  );
  ledger.complete(key, hash);
  ledger.releaseLock(owner);
  return { identity, resolver, key };
}

function readJournalJson(baseDir: string): unknown[] {  const path = join(baseDir, CALIBRATION_ROOT, 'journal.json');
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  return JSON.parse(raw) as unknown[];
}

// ── Real prepared-context helpers (session routing) ──────────────────────────

const HEAD_A = 'a'.repeat(40);
const IMPL_B = 'b'.repeat(40);
const TREE_C = 'c'.repeat(40);

function makeCommittedReader(): ReturnType<typeof vi.fn> {
  const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
  const paths: Record<string, string> = {
    'functions/eval/nutrition/public-manifest.json': 'public-manifest',
    'functions/eval/nutrition/calibration-source-lock.json': 'source-lock',
    'functions/eval/nutrition/calibration-manifest.json': 'calibration-manifest',
    'functions/eval/nutrition/off-snapshot-lock.json': 'off-lock',
    'functions/eval/nutrition/historical-reference-v1.json': 'historical-reference',
  };
  return vi.fn((path: string, _commit: string) => {
    void _commit;
    if (!(path in paths)) throw new Error(`unexpected asset path ${path}`);
    return readFileSync(join(repoRoot, path), 'utf8');
  });
}

function makeFixtureOwner(overrides: Record<string, unknown> = {}): CalibrationOwner {
  return {
    hostname: 'fixture-host',
    bootId: 'fixture-boot',
    pid: 123,
    startTicks: 42,
    acquiredAt: '2026-10-05T00:00:00.000Z',
    ...overrides,
  } as CalibrationOwner;
}

async function prepareContext(
  baseDir: string,
  owner?: CalibrationOwner,
): Promise<CalibrationPreparedContext> {
  const prepare = (bootstrapModule as Record<string, unknown>)[
    'prepareCalibrationBootstrapContext'
  ] as (deps: unknown) => Promise<CalibrationPreparedContext>;
  const gitState = {
    headCommit: HEAD_A,
    implementationCommit: IMPL_B,
    functionsTreeId: TREE_C,
    dirtyPaths: [] as string[],
  };
  const resolvedOwner = owner ?? makeFixtureOwner();
  return prepare({
    baseDir,
    readGitState: vi.fn(() => ({ ...gitState, dirtyPaths: [...gitState.dirtyPaths] })),
    readCommittedFile: makeCommittedReader(),
    readOwner: vi.fn(() => ({ ...resolvedOwner })),
  });
}

function readDevIds(context: CalibrationPreparedContext): { first: string; dev: string[] } {
  const manifest = JSON.parse(
    (context.files as Record<string, string>)['calibration-manifest'] as string,
  ) as { cases: Array<{ id: string; group: string }> };
  const dev = manifest.cases.filter((c) => c.group === 'development').map((c) => c.id);
  return { first: context.firstDevelopmentCaseId, dev };
}

// ── Closed prediction codec ──────────────────────────────────────────────────

describe('report journal closed prediction codec', () => {
  it('accepts the canonical meal-success fixture as an owned frozen copy', async () => {
    const { captureCalibrationReportPrediction } = await loadCodec();
    // Fixture checked against the real tuple/schema contracts first.
    expect(isCanonicalNutritionTuple('portion', 1, 'portion')).toBe(true);
    const fixture = canonicalSuccessPrediction();
    expect(NutritionPredictionSchema.safeParse(fixture).success).toBe(true);
    const copied = captureCalibrationReportPrediction(
      fixture,
    ) as unknown as Record<string, unknown>;
    expect(copied).toEqual(fixture);
    expect(copied === (fixture as unknown)).toBe(false);
    expect(Object.isFrozen(copied)).toBe(true);
    const diagnostics = copied['diagnostics'] as Record<string, unknown>;
    const raw = diagnostics['rawNutrients'] as Record<string, unknown>;
    expect(Object.isFrozen(diagnostics)).toBe(true);
    expect(Object.isFrozen(raw)).toBe(true);
    expect(Object.isFrozen(copied['reviewReasons'])).toBe(true);
    // Canonical top-level key order from the brief.
    expect(Object.keys(copied)).toEqual([
      'parseStatus',
      'source',
      'kcal',
      'proteinG',
      'carbsG',
      'fatG',
      'confidence',
      'basis',
      'amount',
      'unit',
      'decision',
      'reviewReasons',
      'latencyMs',
      'sampleIndex',
      'cached',
      'diagnostics',
    ]);
  });

  it('treats same-value key-order permutations as canonical digest/replay equivalent', async () => {
    const { captureCalibrationReportPrediction } = await loadCodec();
    const fromCanonical = captureCalibrationReportPrediction(
      canonicalSuccessPrediction(),
    ) as unknown as Record<string, unknown>;
    const fromReversed = captureCalibrationReportPrediction(
      reversedKeyOrderPrediction(),
    ) as unknown as Record<string, unknown>;
    expect(JSON.stringify(fromReversed)).toBe(JSON.stringify(fromCanonical));
    expect(sha256Hex(JSON.stringify(fromReversed))).toBe(
      sha256Hex(JSON.stringify(fromCanonical)),
    );
  });

  it('rejects removed or changed values and unknown fields', async () => {
    const { captureCalibrationReportPrediction } = await loadCodec();
    const missing = canonicalSuccessPrediction();
    delete missing['kcal'];
    await expectReportJournalInvalid(() => captureCalibrationReportPrediction(missing));
    const changed = canonicalSuccessPrediction();
    changed['kcal'] = 121;
    const changedOut = captureCalibrationReportPrediction(
      changed,
    ) as unknown as Record<string, unknown>;
    const canonicalOut = captureCalibrationReportPrediction(
      canonicalSuccessPrediction(),
    ) as unknown as Record<string, unknown>;
    expect(sha256Hex(JSON.stringify(changedOut))).not.toBe(
      sha256Hex(JSON.stringify(canonicalOut)),
    );
    const unknown = canonicalSuccessPrediction();
    unknown['rawResponse'] = '{"kcal":120}';
    await expectReportJournalInvalid(() => captureCalibrationReportPrediction(unknown));
    const names = canonicalSuccessPrediction();
    const diagnostics = names['diagnostics'] as Record<string, unknown>;
    diagnostics['detectedNames'] = ['rice'];
    await expectReportJournalInvalid(() => captureCalibrationReportPrediction(names));
  });

  it('keeps Review reasons ordered and rejects bad Review bindings', async () => {
    const { captureCalibrationReportPrediction } = await loadCodec();
    const ordered = validBarcodeSuccess();
    ordered['reviewReasons'] = ['barcode_unconfirmed', 'package_quantity_missing'];
    ordered['decision'] = 'needs_review';
    const copied = captureCalibrationReportPrediction(
      ordered,
    ) as unknown as Record<string, unknown>;
    expect(copied['reviewReasons']).toEqual([
      'barcode_unconfirmed',
      'package_quantity_missing',
    ]);
    const completeWithReasons = validBarcodeSuccess();
    completeWithReasons['reviewReasons'] = ['barcode_unconfirmed'];
    await expectReportJournalInvalid(() =>
      captureCalibrationReportPrediction(completeWithReasons),
    );
    const unknownReason = validBarcodeSuccess();
    unknownReason['decision'] = 'needs_review';
    unknownReason['reviewReasons'] = ['stale_cache_entry'];
    await expectReportJournalInvalid(() =>
      captureCalibrationReportPrediction(unknownReason),
    );
    const sparse: Array<string | undefined> = [];
    sparse[1] = 'barcode_unconfirmed';
    const sparseFixture = validBarcodeSuccess();
    sparseFixture['decision'] = 'needs_review';
    sparseFixture['reviewReasons'] = sparse as unknown as string[];
    await expectReportJournalInvalid(() =>
      captureCalibrationReportPrediction(sparseFixture),
    );
    const extraKey: string[] = ['barcode_unconfirmed'];
    (extraKey as unknown as Record<string, unknown>)['note'] = 'x';
    const extraKeyFixture = validBarcodeSuccess();
    extraKeyFixture['decision'] = 'needs_review';
    extraKeyFixture['reviewReasons'] = extraKey;
    await expectReportJournalInvalid(() =>
      captureCalibrationReportPrediction(extraKeyFixture),
    );
  });

  it('rejects present undefined/null/hidden optional fields instead of stripping them', async () => {
    const { captureCalibrationReportPrediction } = await loadCodec();
    const undefinedConfidence = canonicalSuccessPrediction();
    undefinedConfidence['confidence'] = undefined;
    await expectReportJournalInvalid(() =>
      captureCalibrationReportPrediction(undefinedConfidence),
    );
    const nullBarcode = validBarcodeSuccess();
    nullBarcode['barcode'] = null;
    await expectReportJournalInvalid(() => captureCalibrationReportPrediction(nullBarcode));
    const nullDiagnostics = canonicalSuccessPrediction();
    nullDiagnostics['diagnostics'] = null;
    await expectReportJournalInvalid(() =>
      captureCalibrationReportPrediction(nullDiagnostics),
    );
    const undefinedReasons = validBarcodeSuccess();
    undefinedReasons['reviewReasons'] = undefined;
    await expectReportJournalInvalid(() =>
      captureCalibrationReportPrediction(undefinedReasons),
    );
    const hidden = canonicalSuccessPrediction();
    Object.defineProperty(hidden, 'cached', { enumerable: false, value: false });
    await expectReportJournalInvalid(() => captureCalibrationReportPrediction(hidden));
    const symbolKey = canonicalSuccessPrediction();
    (symbolKey as Record<symbol, unknown>)[
      Symbol.for('report-journal-hidden')
    ] = 'x';
    await expectReportJournalInvalid(() => captureCalibrationReportPrediction(symbolKey));
  });

  it('rejects numeric/sample/latency/cached boundary violations', async () => {
    const { captureCalibrationReportPrediction } = await loadCodec();
    for (const mutate of [
      (f: Record<string, unknown>) => {
        f['kcal'] = -1;
      },
      (f: Record<string, unknown>) => {
        f['proteinG'] = Number.NaN;
      },
      (f: Record<string, unknown>) => {
        f['sampleIndex'] = 0;
      },
      (f: Record<string, unknown>) => {
        f['sampleIndex'] = 4;
      },
      (f: Record<string, unknown>) => {
        f['cached'] = true;
      },
      (f: Record<string, unknown>) => {
        f['latencyMs'] = -0.5;
      },
      (f: Record<string, unknown>) => {
        f['latencyMs'] = Number.POSITIVE_INFINITY;
      },
      (f: Record<string, unknown>) => {
        delete f['parseStatus'];
      },
      (f: Record<string, unknown>) => {
        delete f['decision'];
      },
      (f: Record<string, unknown>) => {
        f['basis'] = 'portion';
        f['amount'] = 2;
        f['unit'] = 'portion';
      },
    ]) {
      const fixture = canonicalSuccessPrediction();
      mutate(fixture);
      await expectReportJournalInvalid(() => captureCalibrationReportPrediction(fixture));
    }
    const sampleTwo = canonicalSuccessPrediction();
    sampleTwo['sampleIndex'] = 2;
    const copied = captureCalibrationReportPrediction(
      sampleTwo,
    ) as unknown as Record<string, unknown>;
    expect(copied['sampleIndex']).toBe(2);
  });

  it('accepts valid parser and provider failures', async () => {
    const { captureCalibrationReportPrediction } = await loadCodec();
    const parser = captureCalibrationReportPrediction(
      validParserFailure(),
    ) as unknown as Record<string, unknown>;
    expect(parser['failureCode']).toBe('model_response_invalid');
    expect(Object.isFrozen(parser)).toBe(true);
    const provider = captureCalibrationReportPrediction(
      validProviderFailure(),
    ) as unknown as Record<string, unknown>;
    expect(provider['failureCategory']).toBe('provider');
    expect(Object.isFrozen(provider)).toBe(true);
    const product = {
      ...validProviderFailure(),
      failureCategory: 'product',
      failureCode: 'off_product_not_found',
    };
    const productOut = captureCalibrationReportPrediction(
      product,
    ) as unknown as Record<string, unknown>;
    expect(productOut['failureCode']).toBe('off_product_not_found');
    const dataset = {
      ...validProviderFailure(),
      failureCategory: 'dataset',
      failureCode: 'dataset_fetch_failed',
    };
    const datasetOut = captureCalibrationReportPrediction(
      dataset,
    ) as unknown as Record<string, unknown>;
    expect(datasetOut['failureCode']).toBe('dataset_fetch_failed');
  });

  it('rejects invalid failure codes, details, and mixed success/failure shapes', async () => {
    const { captureCalibrationReportPrediction } = await loadCodec();
    const rawCode = { ...validProviderFailure(), failureCode: 'raw_boom' };
    await expectReportJournalInvalid(() => captureCalibrationReportPrediction(rawCode));
    const freeTextDetail = {
      ...validProviderFailure(),
      failureDetail: 'Error: socket hung up at provider.ts:12',
    };
    await expectReportJournalInvalid(() =>
      captureCalibrationReportPrediction(freeTextDetail),
    );
    const cacheFailure = { ...validParserFailure(), cached: true };
    await expectReportJournalInvalid(() => captureCalibrationReportPrediction(cacheFailure));
    const runnerCategory = {
      ...validProviderFailure(),
      failureCategory: 'runner',
      failureCode: 'runner_crash',
    };
    await expectReportJournalInvalid(() =>
      captureCalibrationReportPrediction(runnerCategory),
    );
    const nutrientsOnFailure = { ...validParserFailure(), kcal: 10 };
    await expectReportJournalInvalid(() =>
      captureCalibrationReportPrediction(nutrientsOnFailure),
    );
    const reviewOnFailure = { ...validParserFailure(), reviewReasons: ['barcode_unconfirmed'] };
    await expectReportJournalInvalid(() =>
      captureCalibrationReportPrediction(reviewOnFailure),
    );
    const failureFieldsOnSuccess = {
      ...canonicalSuccessPrediction(),
      failureCategory: 'schema',
      failureCode: 'model_response_invalid',
    };
    await expectReportJournalInvalid(() =>
      captureCalibrationReportPrediction(failureFieldsOnSuccess),
    );
    const mealComplete = { ...canonicalSuccessPrediction(), decision: 'complete' };
    await expectReportJournalInvalid(() => captureCalibrationReportPrediction(mealComplete));
    const badBarcode = { ...validBarcodeSuccess(), barcode: 'ABC123' };
    await expectReportJournalInvalid(() => captureCalibrationReportPrediction(badBarcode));
  });

  it('enforces diagnostic allowlist and all-or-none semantics', async () => {
    const { captureCalibrationReportPrediction } = await loadCodec();
    const references = canonicalSuccessPrediction();
    const diagnostics = references['diagnostics'] as Record<string, unknown>;
    diagnostics['per100Reference'] = {
      kcal: 133,
      proteinG: 11,
      carbsG: 0,
      fatG: 9,
      amount: 100,
      unit: 'g',
    };
    const copied = captureCalibrationReportPrediction(
      references,
    ) as unknown as Record<string, unknown>;
    expect(
      (copied['diagnostics'] as Record<string, unknown>)['per100Reference'],
    ).toEqual(diagnostics['per100Reference']);
    // detectedItemCount/estimatedTotalMassG omission is valid preservation:
    // both are optional and the mass-requires-count rule only binds presence.
    const omitted = canonicalSuccessPrediction();
    const omittedDiagnostics = omitted['diagnostics'] as Record<string, unknown>;
    delete omittedDiagnostics['detectedItemCount'];
    delete omittedDiagnostics['estimatedTotalMassG'];
    const omittedOut = captureCalibrationReportPrediction(
      omitted,
    ) as unknown as Record<string, unknown>;
    expect(
      (omittedOut['diagnostics'] as Record<string, unknown>)['detectedItemCount'],
    ).toBeUndefined();
    expect(
      (omittedOut['diagnostics'] as Record<string, unknown>)['estimatedTotalMassG'],
    ).toBeUndefined();
    expect(Object.isFrozen(omittedOut['diagnostics'])).toBe(true);
    for (const mutate of [
      (d: Record<string, unknown>) => {
        d['candidates'] = [{ kcal: 1 }];
      },
      (d: Record<string, unknown>) => {
        d['rawModelText'] = 'rice 120kcal';
      },
      (d: Record<string, unknown>) => {
        d['declaredBasis'] = 'portion';
        delete d['declaredAmount'];
      },
      (d: Record<string, unknown>) => {
        d['declaredBasis'] = 'portion';
        d['declaredAmount'] = 2;
        d['declaredUnit'] = 'portion';
      },
      (d: Record<string, unknown>) => {
        d['detectedItemCount'] = -1;
      },
      (d: Record<string, unknown>) => {
        d['detectedItemCount'] = 1.5;
      },
      (d: Record<string, unknown>) => {
        // Mass without a count violates the mass-requires-count rule.
        delete d['detectedItemCount'];
      },
    ]) {
      const fixture = canonicalSuccessPrediction();
      mutate(fixture['diagnostics'] as Record<string, unknown>);
      await expectReportJournalInvalid(() => captureCalibrationReportPrediction(fixture));
    }
  });

  it('rejects hostile accessors/proxies/foreign errors with zero inspection', async () => {
    const { captureCalibrationReportPrediction } = await loadCodec();
    let getterCalls = 0;
    const getterTop = canonicalSuccessPrediction();
    Object.defineProperty(getterTop, 'kcal', {
      enumerable: true,
      configurable: true,
      get() {
        getterCalls += 1;
        return 120;
      },
    });
    await expectReportJournalInvalid(() => captureCalibrationReportPrediction(getterTop));
    expect(getterCalls).toBe(0);
    let nestedCalls = 0;
    const nestedGetter = canonicalSuccessPrediction();
    const nestedDiagnostics = nestedGetter['diagnostics'] as Record<string, unknown>;
    const nestedRaw = nestedDiagnostics['rawNutrients'] as Record<string, unknown>;
    Object.defineProperty(nestedRaw, 'kcal', {
      enumerable: true,
      configurable: true,
      get() {
        nestedCalls += 1;
        return 120;
      },
    });
    await expectReportJournalInvalid(() =>
      captureCalibrationReportPrediction(nestedGetter),
    );
    expect(nestedCalls).toBe(0);
    const inherited = Object.assign(Object.create({ kcal: 120 }), canonicalSuccessPrediction());
    await expectReportJournalInvalid(() => captureCalibrationReportPrediction(inherited));
    // Valid own-descriptor data behind a virtual-get-only proxy: descriptor
    // capture must never invoke the throwing get, so capture succeeds with
    // zero get hits and owned frozen copies.
    let virtualGetHits = 0;
    const virtualGetOnly = new Proxy(canonicalSuccessPrediction(), {
      get(target, prop, receiver) {
        if (prop === 'kcal') {
          virtualGetHits += 1;
          throw new Error('private-bytes-must-never-be-read');
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    const virtualOut = captureCalibrationReportPrediction(
      virtualGetOnly,
    ) as unknown as Record<string, unknown>;
    expect(virtualOut['kcal']).toBe(120);
    expect(virtualGetHits).toBe(0);
    expect(Object.isFrozen(virtualOut)).toBe(true);
    expect(
      Object.isFrozen((virtualOut['diagnostics'] as Record<string, unknown>)['rawNutrients']),
    ).toBe(true);
    // Throwing reflection traps reject without ever reaching value gets.
    const descriptorTrap = new Proxy(canonicalSuccessPrediction(), {
      getOwnPropertyDescriptor() {
        throw new Error('private-descriptor-bytes');
      },
    });
    const descriptorError = await expectReportJournalInvalid(() =>
      captureCalibrationReportPrediction(descriptorTrap),
    );
    expect(descriptorError === (descriptorTrap as unknown)).toBe(false);
    const ownKeysProxy = new Proxy(canonicalSuccessPrediction(), {
      ownKeys() {
        throw new Error('private-own-keys');
      },
    });
    const ownKeysError = await expectReportJournalInvalid(() =>
      captureCalibrationReportPrediction(ownKeysProxy),
    );
    expect(ownKeysError === (ownKeysProxy as unknown)).toBe(false);
    // A reflection-thrown foreign fatal carrying private bytes must escape
    // only as a fresh static causeless fatal with zero foreign inspection:
    // even reading message/cause/stack off the caught error is forbidden.
    let foreignInspections = 0;
    const foreignInner = new CalibrationFatalError('calibration:private-smuggled', {
      cause: { privateBytes: 'smuggled' },
    });
    const foreignProxy = new Proxy(foreignInner, {
      get(target, prop, receiver) {
        if (prop === 'message' || prop === 'cause' || prop === 'stack') {
          foreignInspections += 1;
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    const throwingProxy = new Proxy(canonicalSuccessPrediction(), {
      getOwnPropertyDescriptor() {
        throw foreignProxy;
      },
    });
    const sanitized = await expectReportJournalInvalid(() =>
      captureCalibrationReportPrediction(throwingProxy),
    );
    expect(sanitized === (foreignProxy as unknown)).toBe(false);
    expect(sanitized === (foreignInner as unknown)).toBe(false);
    expect(sanitized.cause).toBeUndefined();
    expect(foreignInspections).toBe(0);
    const foreign = new CalibrationFatalError('calibration:private-smuggled');
    const smuggled = canonicalSuccessPrediction();
    Object.defineProperty(smuggled, 'fatG', {
      enumerable: true,
      configurable: true,
      get(): unknown {
        throw foreign;
      },
    });
    const smuggledError = await expectReportJournalInvalid(() =>
      captureCalibrationReportPrediction(smuggled),
    );
    expect(smuggledError === (foreign as unknown)).toBe(false);
    expect(smuggledError.cause).toBeUndefined();
  });

  it('isolates post-call original and returned nested mutation from replay', async () => {
    const { captureCalibrationReportPrediction } = await loadCodec();
    const original = canonicalSuccessPrediction();
    const first = captureCalibrationReportPrediction(
      original,
    ) as unknown as Record<string, unknown>;
    const before = JSON.stringify(first);
    (original['diagnostics'] as Record<string, unknown>)['estimatedTotalMassG'] = 999;
    ((original['diagnostics'] as Record<string, unknown>)['rawNutrients'] as Record<string, unknown>)[
      'kcal'
    ] = 999;
    (original['reviewReasons'] as unknown[]).push('barcode_unconfirmed');
    const replayed = captureCalibrationReportPrediction(
      canonicalSuccessPrediction(),
    ) as unknown as Record<string, unknown>;
    expect(JSON.stringify(replayed)).toBe(before);
    const attempt = (): string => {
      (first['diagnostics'] as Record<string, unknown>)['estimatedTotalMassG'] = 999;
      return 'mutated';
    };
    expect(attempt).toThrow(TypeError);
    expect(JSON.stringify(first)).toBe(before);
  });

  it('fails every codec violation with a fresh causeless fatal', async () => {
    const { captureCalibrationReportPrediction } = await loadCodec();
    const first = await expectReportJournalInvalid(() =>
      captureCalibrationReportPrediction({ parseStatus: 'success' }),
    );
    const second = await expectReportJournalInvalid(() =>
      captureCalibrationReportPrediction({ parseStatus: 'success' }),
    );
    expect(first === (second as unknown)).toBe(false);
    expect(first.name).toBe('CalibrationFatalError');
    expect(first.cause).toBeUndefined();
  });
});

// ── Extended journal entry codec ─────────────────────────────────────────────

describe('report journal extended entry codec', () => {
  it('binds an extended success entry with canonical seven-field order', async () => {
    const { captureCalibrationReportJournalEntry } = await loadCodec();
    const key = lowKeyFor(FIRST_DEV);
    const entry = extendedSuccessEntry(key, PINNED_VERSION);
    const copied = captureCalibrationReportJournalEntry(
      entry,
    ) as unknown as Record<string, unknown>;
    expect(Object.keys(copied)).toEqual([
      'key',
      'predictionHash',
      'normalizedPrediction',
      'analysisLatencyMs',
      'errorCategory',
      'responseModelVersion',
      'reportPrediction',
    ]);
    expect(copied['predictionHash']).toBe(
      sha256CanonicalNutrients({ kcal: 120, proteinG: 10, carbsG: 0, fatG: 8 }),
    );
    expect(Object.isFrozen(copied)).toBe(true);
    expect(Object.isFrozen(copied['reportPrediction'])).toBe(true);
    const report = copied['reportPrediction'] as Record<string, unknown>;
    expect(report['sampleIndex']).toBe(key.sampleIndex);
    expect(report['latencyMs']).toBe(copied['analysisLatencyMs']);
  });

  it('binds an extended failure entry with null numerics and n/a version', async () => {
    const { captureCalibrationReportJournalEntry } = await loadCodec();
    const key = lowKeyFor(FIRST_DEV);
    // Exact binding: predictionHash must equal the outer errorCategory.
    const entry = {
      key: { ...key },
      predictionHash: 'unknown',
      normalizedPrediction: null,
      analysisLatencyMs: 9,
      errorCategory: 'unknown',
      responseModelVersion: 'n/a',
      reportPrediction: { ...validProviderFailure(), sampleIndex: key.sampleIndex, latencyMs: 9 },
    };
    const copied = captureCalibrationReportJournalEntry(
      entry,
    ) as unknown as Record<string, unknown>;
    expect(copied['normalizedPrediction']).toBeNull();
    expect(copied['predictionHash']).toBe('unknown');
    expect(Object.isFrozen(copied)).toBe(true);
  });

  it('rejects an extended failure whose hash does not equal its error category', async () => {
    const { captureCalibrationReportJournalEntry } = await loadCodec();
    const key = lowKeyFor(FIRST_DEV);
    // No silent repair: a provider hash under an unknown category is invalid.
    const mismatched = {
      key: { ...key },
      predictionHash: 'provider_request_failed',
      normalizedPrediction: null,
      analysisLatencyMs: 9,
      errorCategory: 'unknown',
      responseModelVersion: 'n/a',
      reportPrediction: { ...validProviderFailure(), sampleIndex: key.sampleIndex, latencyMs: 9 },
    };
    await expectReportJournalInvalid(() =>
      captureCalibrationReportJournalEntry(mismatched),
    );
  });

  it('rejects direct six-field legacy entries through the new exact-seven codec', async () => {
    // The new codec requires exactly seven own data fields. Legacy six-field
    // journals keep working through the actual old ledger/session/hash APIs
    // (proven by the GREEN preservation tests below); they are never widened
    // into the new codec contract.
    const { captureCalibrationReportJournalEntry } = await loadCodec();
    const key = lowKeyFor(FIRST_DEV);
    const legacy = legacySuccessEntry(key, PINNED_VERSION);
    await expectReportJournalInvalid(() =>
      captureCalibrationReportJournalEntry(
        legacy as unknown as Record<string, unknown>,
      ),
    );
  });

  it('rejects nutrient/sample/latency/mass binding mismatches', async () => {
    const { captureCalibrationReportJournalEntry } = await loadCodec();
    const key = lowKeyFor(FIRST_DEV);
    const nutrientMismatch = extendedSuccessEntry(key, PINNED_VERSION);
    ((nutrientMismatch['normalizedPrediction'] as Record<string, unknown>)['kcal']) = 121;
    await expectReportJournalInvalid(() =>
      captureCalibrationReportJournalEntry(nutrientMismatch),
    );
    const sampleMismatch = extendedSuccessEntry(key, PINNED_VERSION);
    ((sampleMismatch['reportPrediction'] as Record<string, unknown>)['sampleIndex']) = 2;
    await expectReportJournalInvalid(() =>
      captureCalibrationReportJournalEntry(sampleMismatch),
    );
    const latencyMismatch = extendedSuccessEntry(key, PINNED_VERSION);
    ((latencyMismatch['reportPrediction'] as Record<string, unknown>)['latencyMs']) = 18;
    await expectReportJournalInvalid(() =>
      captureCalibrationReportJournalEntry(latencyMismatch),
    );
    const massMismatch = extendedSuccessEntry(key, PINNED_VERSION);
    ((massMismatch['normalizedPrediction'] as Record<string, unknown>)[
      'estimatedTotalMassG'
    ]) = 91;
    await expectReportJournalInvalid(() =>
      captureCalibrationReportJournalEntry(massMismatch),
    );
    const alias = extendedSuccessEntry(key, PINNED_VERSION);
    ((alias['normalizedPrediction'] as Record<string, unknown>)['calories']) = 120;
    await expectReportJournalInvalid(() => captureCalibrationReportJournalEntry(alias));
  });

  it('rejects present-undefined/null seventh fields and seventh-field hostiles', async () => {
    const { captureCalibrationReportJournalEntry } = await loadCodec();
    const key = lowKeyFor(FIRST_DEV);
    const undefinedSeventh = extendedSuccessEntry(key, PINNED_VERSION);
    undefinedSeventh['reportPrediction'] = undefined;
    await expectReportJournalInvalid(() =>
      captureCalibrationReportJournalEntry(undefinedSeventh),
    );
    const nullSeventh = extendedSuccessEntry(key, PINNED_VERSION);
    nullSeventh['reportPrediction'] = null;
    await expectReportJournalInvalid(() =>
      captureCalibrationReportJournalEntry(nullSeventh),
    );
    const symbolSeventh = extendedSuccessEntry(key, PINNED_VERSION);
    (symbolSeventh as Record<symbol, unknown>)[Symbol.for('report-prediction')] = {};
    await expectReportJournalInvalid(() =>
      captureCalibrationReportJournalEntry(symbolSeventh),
    );
    // Throwing reflection on the nested report rejects without value gets.
    const nestedDescriptorTrap = new Proxy(
      hostileReportTarget(key),
      {
        getOwnPropertyDescriptor() {
          throw new Error('private-report-descriptor');
        },
      },
    );
    const nestedHostile = extendedSuccessEntry(key, PINNED_VERSION);
    nestedHostile['reportPrediction'] = nestedDescriptorTrap;
    const nestedError = await expectReportJournalInvalid(() =>
      captureCalibrationReportJournalEntry(nestedHostile),
    );
    expect(nestedError === (nestedDescriptorTrap as unknown)).toBe(false);
    const nestedOwnKeys = new Proxy(hostileReportTarget(key), {
      ownKeys() {
        throw new Error('private-report-own-keys');
      },
    });
    const nestedKeysHostile = extendedSuccessEntry(key, PINNED_VERSION);
    nestedKeysHostile['reportPrediction'] = nestedOwnKeys;
    const nestedKeysError = await expectReportJournalInvalid(() =>
      captureCalibrationReportJournalEntry(nestedKeysHostile),
    );
    expect(nestedKeysError === (nestedOwnKeys as unknown)).toBe(false);
  });
});

// ── Strict-ledger file binding ───────────────────────────────────────────────

describe('report journal strict ledger binding', () => {
  it('GREEN: legacy six-field reserve/pin/append/complete round-trips with exact JSON and hash', () => {
    const baseDir = makeTempDir();
    const { ledger, owner } = openStrictLedger(baseDir);
    ledger.acquireLock(owner);
    const key = reserveLowFlow(ledger, FIRST_DEV);
    ledger.pinModelVersion(PINNED_VERSION);
    const entry = legacySuccessEntry(key, PINNED_VERSION);
    const hash = ledger.appendResultJournal(entry);
    expect(hash).toBe(sha256Hex(JSON.stringify(entry)));
    ledger.complete(key, hash);
    expect(ledger.rebuildReport()).toEqual({ completed: [key] });
    const onDisk = readJournalJson(baseDir);
    expect(onDisk).toHaveLength(1);
    expect(Object.keys(onDisk[0] as Record<string, unknown>)).toEqual([
      'key',
      'predictionHash',
      'normalizedPrediction',
      'analysisLatencyMs',
      'errorCategory',
      'responseModelVersion',
    ]);
    expect(JSON.stringify(onDisk[0])).toBe(JSON.stringify(entry));
    const { ledger: restarted } = openStrictLedger(baseDir);
    expect(restarted.rebuildReport()).toEqual({ completed: [key] });
    ledger.releaseLock(owner);
  });

  it('rejects the numeric-only completed journal through the strict report accessor', () => {
    const baseDir = makeTempDir();
    const { identity, resolver, ledger, owner } = openStrictLedger(baseDir);
    ledger.acquireLock(owner);
    const key = reserveLowFlow(ledger, FIRST_DEV);
    ledger.pinModelVersion(PINNED_VERSION);
    const hash = ledger.appendResultJournal(legacySuccessEntry(key, PINNED_VERSION));
    ledger.complete(key, hash);
    ledger.releaseLock(owner);
    const restarted = createProtocolCalibrationLedger(
      createFileCalibrationLedgerDeps(baseDir),
      identity,
      resolver,
    );
    const getCompleted = loadReportAccessor(restarted);
    let error: unknown;
    try {
      getCompleted();
    } catch (cause: unknown) {
      error = cause;
    }
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect((error as CalibrationFatalError).message).toBe(
      'calibration:report-prediction-missing',
    );
  });

  it('excludes pre-completion rows from the strict report accessor', () => {
    const baseDir = makeTempDir();
    const { ledger, owner } = openStrictLedger(baseDir);
    ledger.acquireLock(owner);
    const key = reserveLowFlow(ledger, FIRST_DEV);
    ledger.pinModelVersion(PINNED_VERSION);
    ledger.appendResultJournal(legacySuccessEntry(key, PINNED_VERSION));
    const getCompleted = loadReportAccessor(ledger);
    expect(getCompleted()).toEqual([]);
    ledger.releaseLock(owner);
  });

  it('round-trips a completed extended prediction with unchanged scorer output after restart', () => {
    const baseDir = makeTempDir();
    const { identity, resolver, ledger, owner } = openStrictLedger(baseDir);
    ledger.acquireLock(owner);
    const key = reserveLowFlow(ledger, FIRST_DEV);
    ledger.pinModelVersion(PINNED_VERSION);
    const entry = extendedSuccessEntry(key, PINNED_VERSION);
    const entryLatencyMs = entry['analysisLatencyMs'] as number;
    const hash = ledger.appendResultJournal(
      entry as unknown as JournalEntry,
    );
    ledger.complete(key, hash);
    ledger.releaseLock(owner);
    const restarted = createProtocolCalibrationLedger(
      createFileCalibrationLedgerDeps(baseDir),
      identity,
      resolver,
    );
    const getCompleted = loadReportAccessor(restarted);
    const completed = getCompleted();
    expect(completed).toHaveLength(1);
    const first = completed[0] as CompletedReportPrediction;
    expect(first.key).toEqual(key);
    // Independently constructed expectation: same four fake-provider
    // nutrients as the appended entry, never derived from the accessor row.
    const expectedPrediction = {
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
      latencyMs: entryLatencyMs,
      sampleIndex: key.sampleIndex,
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
    expect(first.prediction).toEqual(expectedPrediction);
    const evalCase = mealEvalCase();
    const actual = scoreNutritionCase(evalCase, first.prediction);
    expect(actual).toEqual(
      scoreNutritionCase(evalCase, expectedPrediction as unknown as NutritionPrediction),
    );
    expect(actual.caseId).toBe(evalCase.id);
    expect(actual.numeric['kcal']).toEqual({ ratioToTruth: 1, absoluteError: 0, relativeError: 0 });
    // Zero-truth carbs: denominator floors at 1, errors stay exact zeros.
    expect(actual.numeric['carbsG']).toEqual({
      ratioToTruth: 0,
      absoluteError: 0,
      relativeError: 0,
    });
    expect(actual.safety).toEqual({ catastrophicCalorieMiss: false, unsafeCompletion: false });
    expect(actual.booleans).toEqual({ basisExactMatch: true, unitExactMatch: true });
    expect(actual.diagnostics?.['mealMassG']).toEqual({
      predicted: 90,
      truth: 100,
      absoluteError: 10,
      ratioToTruth: 0.9,
      relativeError: 0.1,
    });
    expect(first.prediction.decision).toBe('needs_review');
    expect(first.prediction.reviewReasons).toEqual([]);
  });

  it('keeps canonical digest stability for reordered caller keys', () => {
    const canonicalDir = makeTempDir();
    const canonical = openStrictLedger(canonicalDir);
    canonical.ledger.acquireLock(canonical.owner);
    const canonicalKey = reserveLowFlow(canonical.ledger, FIRST_DEV);
    canonical.ledger.pinModelVersion(PINNED_VERSION);
    const canonicalHash = canonical.ledger.appendResultJournal(
      extendedSuccessEntry(canonicalKey, PINNED_VERSION) as unknown as JournalEntry,
    );
    const shuffledDir = makeTempDir();
    const shuffled = openStrictLedger(shuffledDir);
    shuffled.ledger.acquireLock(shuffled.owner);
    const shuffledKey = reserveLowFlow(shuffled.ledger, FIRST_DEV);
    shuffled.ledger.pinModelVersion(PINNED_VERSION);
    const shuffledEntry = extendedSuccessEntry(shuffledKey, PINNED_VERSION);
    const reordered: Record<string, unknown> = {};
    for (const entryKey of Object.keys(shuffledEntry).reverse()) {
      reordered[entryKey] = shuffledEntry[entryKey];
    }
    const shuffledHash = shuffled.ledger.appendResultJournal(
      reordered as unknown as JournalEntry,
    );
    expect(shuffledHash).toBe(canonicalHash);
  });

  it('fails closed when completed metadata is altered or removed on disk', () => {
    // Legacy numeric tamper still fails closed at strict replay construction.
    const baseDir = makeTempDir();
    const { identity, resolver, ledger, owner } = openStrictLedger(baseDir);
    ledger.acquireLock(owner);
    const key = reserveLowFlow(ledger, FIRST_DEV);
    ledger.pinModelVersion(PINNED_VERSION);
    const legacyHash = ledger.appendResultJournal(legacySuccessEntry(key, PINNED_VERSION));
    ledger.complete(key, legacyHash);
    ledger.releaseLock(owner);
    const journalPath = join(baseDir, CALIBRATION_ROOT, 'journal.json');
    const stored = JSON.parse(readFileSync(journalPath, 'utf8')) as Array<
      Record<string, unknown>
    >;
    expect(stored).toHaveLength(1);
    (stored[0] as Record<string, unknown>)['predictionHash'] = 'a'.repeat(64);
    writeFileSync(journalPath, JSON.stringify(stored), 'utf8');
    let replayError: unknown;
    try {
      createProtocolCalibrationLedger(
        createFileCalibrationLedgerDeps(baseDir),
        identity,
        resolver,
      );
    } catch (cause: unknown) {
      replayError = cause;
    }
    expect(replayError).toBeInstanceOf(CalibrationFatalError);

    // Extended semantic-only value change (confidence 0.8 -> 0.9, numerics
    // untouched) breaks the completed digest at replay construction.
    const alteredDir = makeTempDir();
    const altered = completeExtendedEntry(alteredDir);
    const alteredJournalPath = join(alteredDir, CALIBRATION_ROOT, 'journal.json');
    const alteredStored = JSON.parse(
      readFileSync(alteredJournalPath, 'utf8'),
    ) as Array<Record<string, unknown>>;
    expect(alteredStored).toHaveLength(1);
    const alteredReport = alteredStored[0]?.['reportPrediction'] as Record<string, unknown>;
    expect(alteredReport['confidence']).toBe(0.8);
    alteredReport['confidence'] = 0.9;
    writeFileSync(alteredJournalPath, JSON.stringify(alteredStored), 'utf8');
    let alteredError: unknown;
    try {
      createProtocolCalibrationLedger(
        createFileCalibrationLedgerDeps(alteredDir),
        altered.identity,
        altered.resolver,
      );
    } catch (cause: unknown) {
      alteredError = cause;
    }
    expect(alteredError).toBeInstanceOf(CalibrationFatalError);

    // Extended metadata removal breaks the completed digest at replay
    // construction; a weakened replay that ignores the digest is not accepted.
    const removedDir = makeTempDir();
    const removed = completeExtendedEntry(removedDir);
    const removedJournalPath = join(removedDir, CALIBRATION_ROOT, 'journal.json');
    const removedStored = JSON.parse(
      readFileSync(removedJournalPath, 'utf8'),
    ) as Array<Record<string, unknown>>;
    expect(removedStored).toHaveLength(1);
    delete removedStored[0]?.['reportPrediction'];
    writeFileSync(removedJournalPath, JSON.stringify(removedStored), 'utf8');
    let removedError: unknown;
    try {
      createProtocolCalibrationLedger(
        createFileCalibrationLedgerDeps(removedDir),
        removed.identity,
        removed.resolver,
      );
    } catch (cause: unknown) {
      removedError = cause;
    }
    expect(removedError).toBeInstanceOf(CalibrationFatalError);

    // Same-value object-key reordering on disk replays cleanly: canonical
    // digest and completion binding are order-insensitive, value-sensitive.
    const reorderedDir = makeTempDir();
    const reordered = completeExtendedEntry(reorderedDir);
    const reorderedJournalPath = join(reorderedDir, CALIBRATION_ROOT, 'journal.json');
    const reorderedStored = JSON.parse(
      readFileSync(reorderedJournalPath, 'utf8'),
    ) as Array<Record<string, unknown>>;
    expect(reorderedStored).toHaveLength(1);
    const originalEntry = reorderedStored[0] as Record<string, unknown>;
    const reorderedEntry: Record<string, unknown> = {};
    for (const entryKey of Object.keys(originalEntry).reverse()) {
      reorderedEntry[entryKey] = originalEntry[entryKey];
    }
    const reorderedReport: Record<string, unknown> = {};
    const originalReport = reorderedEntry['reportPrediction'] as Record<string, unknown>;
    for (const reportKey of Object.keys(originalReport).reverse()) {
      reorderedReport[reportKey] = originalReport[reportKey];
    }
    reorderedEntry['reportPrediction'] = reorderedReport;
    writeFileSync(reorderedJournalPath, JSON.stringify([reorderedEntry]), 'utf8');
    const replayed = createProtocolCalibrationLedger(
      createFileCalibrationLedgerDeps(reorderedDir),
      reordered.identity,
      reordered.resolver,
    );
    expect(replayed.rebuildReport()).toEqual({ completed: [reordered.key] });
    // Order-insensitive deep equality: same values, only key order changed.
    const replayedJournals = createFileCalibrationLedgerDeps(reorderedDir).readJournalEntries();
    expect(replayedJournals).toHaveLength(1);
    expect(replayedJournals[0]).toEqual(originalEntry);
    expect(
      (
        (replayedJournals[0] as unknown as Record<string, unknown>)[
          'reportPrediction'
        ] as Record<string, unknown>
      )['confidence'],
    ).toBe(0.8);
  });

  it('GREEN: malformed seventh-field appends fail before any pin or durable append', () => {
    const baseDir = makeTempDir();
    const { ledger, owner } = openStrictLedger(baseDir);
    ledger.acquireLock(owner);
    const key = reserveLowFlow(ledger, FIRST_DEV);
    const malformed = {
      ...extendedSuccessEntry(key, PINNED_VERSION),
      injectedField: 'boom',
    };
    let error: unknown;
    try {
      ledger.appendResultJournal(malformed as unknown as JournalEntry);
    } catch (cause: unknown) {
      error = cause;
    }
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect((error as CalibrationFatalError).message).toMatch(/^calibration:/);
    expect(ledger.getPinnedModelVersion()).toBeUndefined();
    expect(readJournalJson(baseDir)).toEqual([]);
    let completeError: unknown;
    try {
      ledger.complete(key, 'x'.repeat(64));
    } catch (cause: unknown) {
      completeError = cause;
    }
    expect(completeError).toBeInstanceOf(CalibrationFatalError);
    ledger.releaseLock(owner);
  });

  it('GREEN: existing counts-only rebuildReport excludes pending rows and binds hashes', () => {
    const baseDir = makeTempDir();
    const { ledger, owner } = openStrictLedger(baseDir);
    ledger.acquireLock(owner);
    const key = reserveLowFlow(ledger, FIRST_DEV);
    ledger.pinModelVersion(PINNED_VERSION);
    expect(ledger.rebuildReport()).toEqual({ completed: [] });
    const hash = ledger.appendResultJournal(legacySuccessEntry(key, PINNED_VERSION));
    expect(ledger.rebuildReport()).toEqual({ completed: [] });
    let mismatch: unknown;
    try {
      ledger.complete(key, 'f'.repeat(64));
    } catch (cause: unknown) {
      mismatch = cause;
    }
    expect(mismatch).toBeInstanceOf(CalibrationFatalError);
    expect((mismatch as CalibrationFatalError).message).toBe(
      'calibration:complete-missing-journal',
    );
    ledger.complete(key, hash);
    expect(ledger.rebuildReport()).toEqual({ completed: [key] });
    ledger.releaseLock(owner);
  });
});

// ── Protocol session routing ─────────────────────────────────────────────────

type ProtocolSessionRunner = (deps: unknown) => Promise<{
  stage: string;
  pinnedModelVersion: string;
}>;

function protocolSessionRunner(): ProtocolSessionRunner {
  return (preflightSessionModule as Record<string, unknown>)[
    'runCalibrationProtocolPreflightSession'
  ] as ProtocolSessionRunner;
}

/**
 * Plain-data enrichment of a primitive six-field journal with full report
 * metadata. No codec invocation: the test only supplies candidate data;
 * production owns validation, pinning, append, and completion.
 */
function enrichPrimitiveJournal(entry: JournalEntry): JournalEntry {
  const raw = entry as unknown as Record<string, unknown>;
  const key = raw['key'] as ReservationKey;
  const numerals = raw['normalizedPrediction'] as Record<string, number>;
  const four = {
    kcal: numerals['kcal'] as number,
    proteinG: numerals['proteinG'] as number,
    carbsG: numerals['carbsG'] as number,
    fatG: numerals['fatG'] as number,
  };
  return {
    ...(raw as Record<string, unknown>),
    normalizedPrediction: { ...four, estimatedTotalMassG: 90 },
    reportPrediction: {
      parseStatus: 'success',
      source: 'meal',
      ...four,
      confidence: 0.8,
      basis: 'portion',
      amount: 1,
      unit: 'portion',
      decision: 'needs_review',
      reviewReasons: [],
      latencyMs: raw['analysisLatencyMs'],
      sampleIndex: key.sampleIndex,
      cached: false,
      diagnostics: {
        rawNutrients: { ...four },
        detectedItemCount: 1,
        estimatedTotalMassG: 90,
        declaredBasis: 'portion',
        declaredAmount: 1,
        declaredUnit: 'portion',
      },
    },
  } as unknown as JournalEntry;
}

describe('report journal protocol session routing', () => {
  it('GREEN: the real protocol session still journals exact six-field entries', async () => {
    const baseDir = makeTempDir();
    const context = await prepareContext(baseDir);
    const countTokens = vi.fn(async () => ({ tokenCount: 42 }));
    const generateImage = vi.fn(async () => ({
      prediction: { kcal: 320, proteinG: 20, carbsG: 30, fatG: 10 },
      modelVersion: 'gemini-3.8-test-pin-001',
    }));
    const runSession = (
      preflightSessionModule as Record<string, unknown>
    )['runCalibrationProtocolPreflightSession'] as (deps: unknown) => Promise<{
      stage: string;
      pinnedModelVersion: string;
    }>;
    const result = await runSession({ context, countTokens, generateImage });
    expect(result.stage).toBe('preflight');
    expect(countTokens).toHaveBeenCalledTimes(1);
    expect(generateImage).toHaveBeenCalledTimes(2);
    const journals = createFileCalibrationLedgerDeps(baseDir).readJournalEntries();
    expect(journals.length).toBeGreaterThan(0);
    for (const journal of journals) {
      expect(Object.keys(journal as unknown as Record<string, unknown>)).toEqual([
        'key',
        'predictionHash',
        'normalizedPrediction',
        'analysisLatencyMs',
        'errorCategory',
        'responseModelVersion',
      ]);
    }
    expect(JSON.stringify(journals)).not.toContain('reportPrediction');
    expect(createFileCalibrationLedgerDeps(baseDir).readLock()).toBeUndefined();
  });

  it('rejects session-completed numeric journals through the strict report accessor', async () => {
    const baseDir = makeTempDir();
    const context = await prepareContext(baseDir);
    const countTokens = vi.fn(async () => ({ tokenCount: 42 }));
    const generateImage = vi.fn(async () => ({
      prediction: { kcal: 320, proteinG: 20, carbsG: 30, fatG: 10 },
      modelVersion: 'gemini-3.8-test-pin-001',
    }));
    const runSession = (
      preflightSessionModule as Record<string, unknown>
    )['runCalibrationProtocolPreflightSession'] as (deps: unknown) => Promise<unknown>;
    await runSession({ context, countTokens, generateImage });
    const replay = createProtocolCalibrationLedger(
      createFileCalibrationLedgerDeps(baseDir),
      context.identity as CalibrationIdentity,
      makeInitial50Resolver(readDevIds(context).first, readDevIds(context).dev),
    );
    const getCompleted = loadReportAccessor(replay);
    let error: unknown;
    try {
      getCompleted();
    } catch (cause: unknown) {
      error = cause;
    }
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect((error as CalibrationFatalError).message).toBe(
      'calibration:report-prediction-missing',
    );
  });

  it('forwards primitive journals with valid metadata through actual core/disk routing', async () => {
    const baseDir = makeTempDir();
    const context = await prepareContext(baseDir);
    const { first, dev } = readDevIds(context);
    const resolver = makeInitial50Resolver(first, dev);
    const countTokens = vi.fn(async () => ({ tokenCount: 42 }));
    const generateImage = vi.fn(async () => ({
      prediction: { kcal: 320, proteinG: 20, carbsG: 30, fatG: 10 },
      modelVersion: PINNED_VERSION,
    }));
    // Capture-and-forward spy: the real primitive runs with real core/disk
    // behavior; only its journal callback is enriched with candidate full
    // metadata before production validates it.
    const seenPrimitive: unknown[] = [];
    const realExecute = cliModule.executeCalibrationPreflight;
    const spy = vi.spyOn(cliModule, 'executeCalibrationPreflight').mockImplementation(
      (client, deps) => {
        const innerAppend = deps.appendResultJournal;
        return realExecute(client, {
          ...deps,
          appendResultJournal: (entry) => {
            seenPrimitive.push(entry);
            return innerAppend(enrichPrimitiveJournal(entry));
          },
        });
      },
    );
    const result = await protocolSessionRunner()({ context, countTokens, generateImage });
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    expect(result.stage).toBe('preflight');
    // The real primitive emitted exact six-field journals; enrichment lived
    // only in the forwarding wrapper, never in production defaults.
    expect(seenPrimitive).toHaveLength(2);
    for (const journal of seenPrimitive) {
      expect(Object.keys(journal as unknown as Record<string, unknown>)).toEqual([
        'key',
        'predictionHash',
        'normalizedPrediction',
        'analysisLatencyMs',
        'errorCategory',
        'responseModelVersion',
      ]);
    }
    expect(countTokens).toHaveBeenCalledTimes(1);
    expect(generateImage).toHaveBeenCalledTimes(2);
    // Durable proof: production preserved the full seventh field per row.
    const onDisk = readJournalJson(baseDir);
    expect(onDisk).toHaveLength(2);
    for (const stored of onDisk) {
      expect(Object.keys(stored as Record<string, unknown>)).toEqual([
        'key',
        'predictionHash',
        'normalizedPrediction',
        'analysisLatencyMs',
        'errorCategory',
        'responseModelVersion',
        'reportPrediction',
      ]);
    }
    const restarted = createProtocolCalibrationLedger(
      createFileCalibrationLedgerDeps(baseDir),
      context.identity as CalibrationIdentity,
      resolver,
    );
    expect(restarted.rebuildReport().completed).toHaveLength(2);
    const completed = loadReportAccessor(restarted)();
    expect(completed).toHaveLength(2);
    // Independently constructed from the four known fake provider nutrients
    // (latency 0, sample 1, uncached): never derived from an accessor row.
    const expectedPrediction = {
      parseStatus: 'success',
      source: 'meal',
      kcal: 320,
      proteinG: 20,
      carbsG: 30,
      fatG: 10,
      confidence: 0.8,
      basis: 'portion',
      amount: 1,
      unit: 'portion',
      decision: 'needs_review',
      reviewReasons: [],
      latencyMs: 0,
      sampleIndex: 1,
      cached: false,
      diagnostics: {
        rawNutrients: { kcal: 320, proteinG: 20, carbsG: 30, fatG: 10 },
        detectedItemCount: 1,
        estimatedTotalMassG: 90,
        declaredBasis: 'portion',
        declaredAmount: 1,
        declaredUnit: 'portion',
      },
    };
    for (const row of completed) {
      expect(row.prediction).toEqual(expectedPrediction);
      expect(row.prediction.parseStatus).toBe('success');
      expect(row.prediction.decision).toBe('needs_review');
    }
    const evalCase: NutritionEvalCase = {
      ...mealEvalCase(),
      truth: {
        basis: 'portion',
        amount: 1,
        unit: 'portion',
        kcal: 320,
        proteinG: 20,
        carbsG: 30,
        fatG: 10,
        referenceMassG: 100,
      },
    };
    const sessionFirst = completed[0] as CompletedReportPrediction;
    const actual = scoreNutritionCase(evalCase, sessionFirst.prediction);
    expect(actual).toEqual(
      scoreNutritionCase(evalCase, expectedPrediction as unknown as NutritionPrediction),
    );
    expect(actual.numeric['kcal']).toEqual({ ratioToTruth: 1, absoluteError: 0, relativeError: 0 });
    expect(actual.safety).toEqual({ catastrophicCalorieMiss: false, unsafeCompletion: false });
    expect(actual.booleans).toEqual({ basisExactMatch: true, unitExactMatch: true });
    expect(actual.diagnostics?.['mealMassG']).toEqual({
      predicted: 90,
      truth: 100,
      absoluteError: 10,
      ratioToTruth: 0.9,
      relativeError: 0.1,
    });
  });

  it('fails malformed injected metadata before any pin or durable append', async () => {
    const baseDir = makeTempDir();
    const context = await prepareContext(baseDir);
    const countTokens = vi.fn(async () => ({ tokenCount: 42 }));
    const generateImage = vi.fn(async () => ({
      prediction: { kcal: 320, proteinG: 20, carbsG: 30, fatG: 10 },
      modelVersion: PINNED_VERSION,
    }));
    const realExecute = cliModule.executeCalibrationPreflight;
    const spy = vi.spyOn(cliModule, 'executeCalibrationPreflight').mockImplementation(
      (client, deps) => {
        const innerAppend = deps.appendResultJournal;
        return realExecute(client, {
          ...deps,
          appendResultJournal: (entry) => {
            const enriched = enrichPrimitiveJournal(entry) as unknown as Record<string, unknown>;
            // Semantic binding break: report claims sample 2, key stays sample 1.
            (enriched['reportPrediction'] as Record<string, unknown>)['sampleIndex'] = 2;
            return innerAppend(enriched as unknown as JournalEntry);
          },
        });
      },
    );
    let error: unknown;
    try {
      await protocolSessionRunner()({ context, countTokens, generateImage });
    } catch (cause: unknown) {
      error = cause;
    }
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect((error as CalibrationFatalError).message).toMatch(/^calibration:/);
    // Fail-stop before pin/append/MEDIUM/stage event: nothing durable, the
    // second profile never runs, and no stage completion is recorded.
    expect(createFileCalibrationLedgerDeps(baseDir).readJournalEntries()).toEqual([]);
    expect(generateImage).toHaveBeenCalledTimes(1);
    expect(countTokens).toHaveBeenCalledTimes(1);
    const events = createFileCalibrationLedgerDeps(baseDir).readLedgerEvents();
    expect(JSON.stringify(events)).not.toContain('"type":"completed"');
  });
});

// ── Hostile failureCategory coercion regressions ──────────────────────────────
//
// Review correction: the failure branch must validate typeof failureCategory
// before using it as a FAILURE_PAIRINGS key. A caller object used as a
// property key is coerced (Symbol.toPrimitive/valueOf/toString) before
// rejection. These regressions prove rejection is a fresh static causeless
// `calibration:report-journal-invalid` with ZERO caller
// primitive-conversion hooks or getter execution, across the direct
// prediction codec, the extended-entry codec, and the real strict ledger
// append route (zero journal append, zero model-version pin).

type HostileCategoryVariant = 'coerce-provider' | 'throwing';

const HOSTILE_CATEGORY_VARIANTS: HostileCategoryVariant[] = ['coerce-provider', 'throwing'];

interface HostileCategoryCounter {
  hits: number;
  thrown?: unknown;
}

/** Own-data failureCategory whose primitive conversion is counted. */
function hostileFailureCategory(
  variant: HostileCategoryVariant,
  counter: HostileCategoryCounter,
): object {
  if (variant === 'coerce-provider') {
    return {
      [Symbol.toPrimitive](): string {
        counter.hits += 1;
        return 'provider';
      },
      valueOf(): string {
        counter.hits += 1;
        return 'provider';
      },
      toString(): string {
        counter.hits += 1;
        return 'provider';
      },
    };
  }
  const foreign = new CalibrationFatalError('calibration:private-smuggled-by-coercion', {
    cause: { privateBytes: 'smuggled' },
  });
  counter.thrown = foreign;
  return {
    [Symbol.toPrimitive](): string {
      counter.hits += 1;
      throw foreign;
    },
    valueOf(): string {
      counter.hits += 1;
      throw foreign;
    },
    toString(): string {
      counter.hits += 1;
      throw foreign;
    },
  };
}

/**
 * Extended failure entry mirroring the known-valid unknown/unknown/null/n-a
 * fixture with matching sample and latency; only the inner report
 * failureCategory is hostile.
 */
function hostileCategoryExtendedEntry(
  key: ReservationKey,
  variant: HostileCategoryVariant,
  counter: HostileCategoryCounter,
): Record<string, unknown> {
  return {
    key: { ...key },
    predictionHash: 'unknown',
    normalizedPrediction: null,
    analysisLatencyMs: 9,
    errorCategory: 'unknown',
    responseModelVersion: 'n/a',
    reportPrediction: {
      ...validProviderFailure(),
      failureCategory: hostileFailureCategory(variant, counter),
      sampleIndex: key.sampleIndex,
      latencyMs: 9,
    },
  };
}

describe('report journal hostile failureCategory coercion', () => {
  it.each(HOSTILE_CATEGORY_VARIANTS)(
    'direct prediction codec rejects hostile failureCategory (%s) with zero coercion',
    async (variant) => {
      const { captureCalibrationReportPrediction } = await loadCodec();
      const counter: HostileCategoryCounter = { hits: 0 };
      const fixture = {
        ...validProviderFailure(),
        failureCategory: hostileFailureCategory(variant, counter),
      };
      const error = await expectReportJournalInvalid(() =>
        captureCalibrationReportPrediction(fixture),
      );
      expect(counter.hits).toBe(0);
      if (variant === 'throwing') {
        expect(error === (counter.thrown as unknown)).toBe(false);
      }
    },
  );

  it.each(HOSTILE_CATEGORY_VARIANTS)(
    'extended entry codec rejects hostile inner failureCategory (%s) with zero coercion',
    async (variant) => {
      const { captureCalibrationReportJournalEntry } = await loadCodec();
      const key = lowKeyFor(FIRST_DEV);
      const counter: HostileCategoryCounter = { hits: 0 };
      const entry = hostileCategoryExtendedEntry(key, variant, counter);
      const error = await expectReportJournalInvalid(() =>
        captureCalibrationReportJournalEntry(entry),
      );
      expect(counter.hits).toBe(0);
      if (variant === 'throwing') {
        expect(error === (counter.thrown as unknown)).toBe(false);
      }
    },
  );

  it.each(HOSTILE_CATEGORY_VARIANTS)(
    'strict ledger append rejects hostile failureCategory (%s) with zero append and zero pin',
    async (variant) => {
      const baseDir = makeTempDir();
      const { ledger, owner } = openStrictLedger(baseDir);
      ledger.acquireLock(owner);
      const key = reserveLowFlow(ledger, FIRST_DEV);
      const counter: HostileCategoryCounter = { hits: 0 };
      const hostile = hostileCategoryExtendedEntry(key, variant, counter);
      const error = await expectReportJournalInvalid(() =>
        ledger.appendResultJournal(hostile as unknown as JournalEntry),
      );
      expect(counter.hits).toBe(0);
      if (variant === 'throwing') {
        expect(error === (counter.thrown as unknown)).toBe(false);
      }
      expect(ledger.getPinnedModelVersion()).toBeUndefined();
      expect(readJournalJson(baseDir)).toEqual([]);
      ledger.releaseLock(owner);
    },
  );
});
