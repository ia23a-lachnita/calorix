/**
 * Test-only committed-source fixtures for calibration report measurement tests (Task 1).
 *
 * Builds genuinely scored calibration reports from the committed calibration/public
 * manifests using `scoreNutritionCase` and `buildNutritionEvalReport`, matching the
 * existing assembly-test setup. No live images, provider calls, production data, or
 * network access. Clones only test-owned data for mutation scenarios.
 *
 * Population sources (frozen in committed manifests):
 * - preflight: 1 development case per profile (LOW/MEDIUM)
 * - development: 24 cases per profile (LOW/MEDIUM), 1 sample each
 * - validation: 16 cases × 3 samples = 48 outcomes for selected profile
 * - benchmark: 20 cases × 3 samples = 60 outcomes for selected profile
 *   (12 meal, 4 label, 4 barcode — barcode cases receive zero vision keys)
 *
 * Diagnostic particularities preserved from scorer.ts:
 * - 36 complete meal diagnostics (meal outcomes with positive mass/density)
 * - 33 eligible carbohydrate-density outcomes (one zero-carb case × 3 samples)
 * - Zero-truth absolute error metrics retained for protein/carbs/fat where truth=0
 * - Meal-only macro medians computed through moved helper
 * - 33/36 density distinction: carb density eligible excludes zero-truth carbs
 */
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreNutritionCase } from '../../src/nutrition-eval/scorer';
import { buildNutritionEvalReport } from '../../src/nutrition-eval/report';
import { parseNutritionEvalManifest, StrictCalibrationManifestSchema } from '../../src/nutrition-eval/schema';
import {
  deriveCanonicalAllowedKeys,
  deriveCanonicalReportOutcomePlan,
  prepareCalibrationBootstrapContext,
} from '../../src/nutrition-eval/calibration-bootstrap';
import type { CalibrationPreparedContext } from '../../src/nutrition-eval/calibration-bootstrap';
import {
  CALIBRATION_MANIFEST_SHA256,
  CALIBRATION_PUBLIC_MANIFEST_HASH,
} from '../../src/nutrition-eval/calibration-cli';
import type {
  NutritionEvalCase,
  NutritionPrediction,
  NutritionEvalReport,
  NutritionCaseResult,
  CalibrationInfo,
} from '../../src/nutrition-eval/schema';
import {
  CALIBRATION_ROOT,
  createProtocolCalibrationLedger,
} from '../../src/nutrition-eval/calibration';
import type {
  CalibrationIdentity,
  CalibrationKeyResolver,
  CalibrationLedgerDeps,
  CalibrationOwner,
  CalibrationProfile,
  CalibrationProtocolLedger,
  JournalEntry,
  ReservationKey,
  StageName,
  TokenCountReservationKey,
} from '../../src/nutrition-eval/calibration';
import type {
  CalibrationProtocolReportOptions,
  CalibrationStageReportSnapshot,
} from '../../src/nutrition-eval/calibration-report-state';
import { captureCalibrationReportPrediction } from '../../src/nutrition-eval/calibration-report-journal';
import { createFileCalibrationLedgerDeps } from '../../src/nutrition-eval/calibration-file-store';
import type { CalibrationFileStoreOverrides } from '../../src/nutrition-eval/calibration-file-store';
import { publishCalibrationStageReport } from '../../src/nutrition-eval/calibration-report-publication';
import type {
  CalibrationPublishedReportReceipt,
  CalibrationReportPublicationResult,
} from '../../src/nutrition-eval/calibration-report-publication';
import { prepareCalibrationStageReportArtifactVerifier } from '../../src/nutrition-eval/calibration-report-artifact-verification';
import type { CalibrationStageReportArtifactVerifier } from '../../src/nutrition-eval/calibration-report-artifact-verification';
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

interface FixtureContext {
  identity: Readonly<{
    implementationCommit: string;
    promptHash: string;
    responseSchemaHash: string;
  }>;
  firstDevelopmentCaseId: string;
  files: Readonly<Record<string, string>>;
  trainingCases: readonly (NutritionEvalCase & { readonly group: string })[];
  publicCases: readonly NutritionEvalCase[];
  trainingDatasetId: string;
  publicDatasetId: string;
}

let cachedContext: FixtureContext | null = null;

async function getFixtureContext(): Promise<FixtureContext> {
  if (cachedContext) return cachedContext;

  const bootstrap = await prepareCalibrationBootstrapContext({
    baseDir: '/home/agent-runner/projects/calorix/.superpowers/sdd/2026-10-10-calibration-authoritative-report-gates/tmp',
    readGitState: () => ({
      headCommit: 'a'.repeat(40),
      implementationCommit: 'b'.repeat(40),
      functionsTreeId: 'c'.repeat(40),
      dirtyPaths: [],
    }),
    readCommittedFile: (path, _commit) => readFileSync(resolve(repoRoot, path), 'utf8'),
    readOwner: () => ({
      hostname: 'fixture-host',
      bootId: 'fixture-boot',
      pid: 1234,
      startTicks: 5678,
      acquiredAt: '2026-10-10T00:00:00.000Z',
    }),
  });
  const calibrationManifest = StrictCalibrationManifestSchema.parse(
    JSON.parse(bootstrap.files['calibration-manifest']),
  );
  const publicManifest = parseNutritionEvalManifest(JSON.parse(bootstrap.files['public-manifest']));
  cachedContext = {
    identity: {
      implementationCommit: bootstrap.identity.implementationCommit,
      promptHash: bootstrap.identity.promptHash,
      responseSchemaHash: bootstrap.identity.responseSchemaHash,
    },
    firstDevelopmentCaseId: bootstrap.firstDevelopmentCaseId,
    files: bootstrap.files,
    trainingCases: calibrationManifest.cases,
    publicCases: publicManifest.cases,
    trainingDatasetId: calibrationManifest.datasetId,
    publicDatasetId: publicManifest.datasetId,
  };
  return cachedContext;
}

type Scenario = 'exact' | 'provider_failure' | 'interruption' | 'zero_truth' | 'missing_diagnostic';

interface MakeMeasuredReportParams {
  stage: StageName;
  profile: CalibrationProfile;
  scenario?: Scenario;
}

function createExactPrediction(
  evalCase: NutritionEvalCase,
  sampleIndex: number,
  opts: { readonly includeDiagnostics?: boolean; readonly latencyMs?: number } = {},
): NutritionPrediction {
  const truth = evalCase.truth;
  const prediction: Record<string, unknown> = {
    parseStatus: 'success',
    source: evalCase.scanMode,
    kcal: truth.kcal,
    proteinG: truth.proteinG,
    carbsG: truth.carbsG,
    fatG: truth.fatG,
    confidence: 0.85,
    basis: truth.basis,
    amount: truth.amount,
    unit: truth.unit,
    decision: 'needs_review',
    reviewReasons: [],
    latencyMs: opts.latencyMs ?? 1500,
    sampleIndex,
    cached: false,
  };
  if (evalCase.expectedBarcode !== undefined) {
    prediction.barcode = evalCase.expectedBarcode;
  }
  if (opts.includeDiagnostics !== false && evalCase.scanMode === 'meal' && truth.referenceMassG !== undefined) {
    prediction.diagnostics = {
      rawNutrients: { kcal: truth.kcal, proteinG: truth.proteinG, carbsG: truth.carbsG, fatG: truth.fatG },
      detectedItemCount: 1,
      estimatedTotalMassG: truth.referenceMassG,
      declaredBasis: truth.basis,
      declaredAmount: truth.amount,
      declaredUnit: truth.unit,
    };
  }
  return prediction as unknown as NutritionPrediction;
}

function createProviderFailurePrediction(
  evalCase: NutritionEvalCase,
  sampleIndex: number,
): NutritionPrediction {
  return {
    parseStatus: 'failure',
    source: evalCase.scanMode,
    decision: 'error',
    failureCategory: 'provider',
    failureCode: 'http_500',
    latencyMs: 200,
    sampleIndex,
    cached: false,
  };
}

function createProductFailurePrediction(
  evalCase: NutritionEvalCase,
  sampleIndex: number,
): NutritionPrediction {
  return {
    parseStatus: 'failure',
    source: evalCase.scanMode,
    decision: 'error',
    failureCategory: 'product',
    failureCode: 'barcode_not_found',
    latencyMs: 200,
    sampleIndex,
    cached: false,
  };
}

function createInterruptedPrediction(
  evalCase: NutritionEvalCase,
  sampleIndex: number,
): NutritionPrediction {
  const prediction: Record<string, unknown> = {
    parseStatus: 'failure',
    source: evalCase.scanMode,
    decision: 'error',
    failureCategory: 'runner',
    failureCode: 'interrupted_reservation',
    sampleIndex,
    cached: false,
  };
  return prediction as unknown as NutritionPrediction;
}

export async function makeMeasuredReport({
  stage,
  profile,
  scenario = 'exact',
}: MakeMeasuredReportParams): Promise<NutritionEvalReport> {
  const ctx = await getFixtureContext();
  const sourceCases: readonly NutritionEvalCase[] =
    stage === 'benchmark'
      ? ctx.publicCases
      : ctx.trainingCases.filter((c) =>
          stage === 'preflight' ? c.id === ctx.firstDevelopmentCaseId : c.group === stage,
        );
  const samples: readonly number[] = stage === 'preflight' || stage === 'development' ? [1] : [1, 2, 3];
  const targetImage = sourceCases.find((c) => c.scanMode !== 'barcode') ?? sourceCases[0]!;
  const results: NutritionCaseResult[] = [];
  for (const evalCase of sourceCases) {
    for (const sampleIndex of samples) {
      const isTarget = evalCase.id === targetImage.id && sampleIndex === 1;
      let prediction: NutritionPrediction;
      switch (scenario) {
        case 'exact': {
          prediction = createExactPrediction(evalCase, sampleIndex);
          break;
        }
        case 'provider_failure': {
          prediction = isTarget
            ? createProviderFailurePrediction(evalCase, sampleIndex)
            : createExactPrediction(evalCase, sampleIndex);
          break;
        }
        case 'interruption': {
          prediction = isTarget
            ? createInterruptedPrediction(evalCase, sampleIndex)
            : createExactPrediction(evalCase, sampleIndex);
          break;
        }
        case 'zero_truth': {
          const truth = evalCase.truth;
          if (truth.proteinG === 0 || truth.carbsG === 0 || truth.fatG === 0) {
            const perturbed = createExactPrediction(evalCase, sampleIndex) as unknown as Record<string, unknown>;
            if (truth.proteinG === 0) perturbed.proteinG = 5;
            if (truth.carbsG === 0) perturbed.carbsG = 10;
            if (truth.fatG === 0) perturbed.fatG = 8;
            const raw = perturbed.diagnostics as unknown as Record<string, unknown> | undefined;
            const nutrients = raw?.rawNutrients as unknown as Record<string, unknown> | undefined;
            if (nutrients !== undefined) {
              if (truth.proteinG === 0) nutrients.proteinG = 5;
              if (truth.carbsG === 0) nutrients.carbsG = 10;
              if (truth.fatG === 0) nutrients.fatG = 8;
            }
            prediction = perturbed as unknown as NutritionPrediction;
          } else {
            prediction = createExactPrediction(evalCase, sampleIndex);
          }
          break;
        }
        case 'missing_diagnostic': {
          prediction = createExactPrediction(evalCase, sampleIndex, { includeDiagnostics: false });
          break;
        }
        default: {
          prediction = createExactPrediction(evalCase, sampleIndex);
        }
      }
      results.push(scoreNutritionCase(evalCase, prediction));
    }
  }

  const totalCases = results.length;
  const imageOutcomes = results.filter((r) => {
    const source = sourceCases.find((c) => c.id === r.caseId);
    return source !== undefined && source.scanMode !== 'barcode';
  });
  const imageReserved = imageOutcomes.length;
  const failedImages = scenario === 'provider_failure' || scenario === 'interruption' ? 1 : 0;
  const failed = results.find((r) => r.prediction.parseStatus === 'failure');
  const safeErrors =
    scenario === 'provider_failure' && failed !== undefined
      ? [{ caseId: failed.caseId, sampleIndex: failed.prediction.sampleIndex!, errorCategory: 'http_5xx' as const }]
      : scenario === 'interruption' && failed !== undefined
        ? [{ caseId: failed.caseId, sampleIndex: failed.prediction.sampleIndex!, errorCategory: 'interrupted_reservation' as const }]
        : [];
  const measuredCases = results.filter((r) => r.prediction.latencyMs !== undefined).length;
  const calibrationInfo: CalibrationInfo = {
    protocolVersion: 'calorix-gemini-38-calibration-v1',
    project: 'calorix-xurschnell',
    location: 'us',
    model: 'gemini-3.8-flash',
    thinkingLevel: profile,
    schemaHash: ctx.identity.responseSchemaHash,
    stage,
    imageCallsReserved: imageReserved,
    imageCallsCompleted: imageReserved - failedImages,
    imageCallsFailed: failedImages,
    safeErrors,
    latencyCoverage: { measuredCases, missingCases: totalCases - measuredCases },
  };
  const timestamp = '2026-10-10T00:00:00.000Z';
  const runId = `calibration-${stage}-${profile.toLowerCase()}-${ctx.identity.implementationCommit.slice(0, 12)}-${timestamp.replace(/[^0-9TZ]/g, '')}`;
  return buildNutritionEvalReport(results, {
    runId,
    timestamp,
    datasetId: stage === 'benchmark' ? ctx.publicDatasetId : ctx.trainingDatasetId,
    datasetHash: stage === 'benchmark' ? CALIBRATION_PUBLIC_MANIFEST_HASH : CALIBRATION_MANIFEST_SHA256,
    adapterModelId: 'gemini-3.8-flash',
    promptHash: ctx.identity.promptHash,
    codeSha: ctx.identity.implementationCommit,
    samples: samples.length,
    baselineOnly: false,
    publicCases: sourceCases.length,
    privateCases: 0,
    calibration: calibrationInfo,
  });
}

interface RebuildEntry {
  readonly evalCase: NutritionEvalCase;
  readonly prediction: NutritionPrediction;
}

/**
 * Test-only rebuilding helper. Takes captured valid cases (committed-source
 * eval cases paired with test-owned predictions) and rebuilds a genuinely
 * scored report through the unchanged scorer + report builder. Never forges a
 * summary, never mutates truth, never touches production code.
 */
export async function rebuildReportFromEntries(
  stage: StageName,
  profile: CalibrationProfile,
  entries: readonly RebuildEntry[],
  samples: readonly number[],
): Promise<NutritionEvalReport> {
  const ctx = await getFixtureContext();
  const results: NutritionCaseResult[] = entries.map(({ evalCase, prediction }) =>
    scoreNutritionCase(evalCase, prediction),
  );
  const totalCases = results.length;
  const imageOutcomes = entries.filter(({ evalCase }) => evalCase.scanMode !== 'barcode').length;
  const imageFailures = results.filter((r, index) =>
    entries[index]!.evalCase.scanMode !== 'barcode' && r.prediction.parseStatus === 'failure',
  );
  const safeErrors = imageFailures.map((failed) => ({
    caseId: failed.caseId,
    sampleIndex: failed.prediction.sampleIndex ?? 1,
    errorCategory: (failed.prediction.failureCode === 'interrupted_reservation'
      ? 'interrupted_reservation'
      : 'http_5xx') as 'interrupted_reservation' | 'http_5xx',
  }));
  const measuredCases = results.filter((r) => r.prediction.latencyMs !== undefined).length;
  const calibrationInfo: CalibrationInfo = {
    protocolVersion: 'calorix-gemini-38-calibration-v1',
    project: 'calorix-xurschnell',
    location: 'us',
    model: 'gemini-3.8-flash',
    thinkingLevel: profile,
    schemaHash: ctx.identity.responseSchemaHash,
    stage,
    imageCallsReserved: imageOutcomes,
    imageCallsCompleted: imageOutcomes - imageFailures.length,
    imageCallsFailed: imageFailures.length,
    safeErrors,
    latencyCoverage: { measuredCases, missingCases: totalCases - measuredCases },
  };
  const timestamp = '2026-10-10T00:00:00.000Z';
  const runId = `calibration-${stage}-${profile.toLowerCase()}-rebuilt-${ctx.identity.implementationCommit.slice(0, 12)}-${timestamp.replace(/[^0-9TZ]/g, '')}`;
  const uniqueCases = new Set(entries.map(({ evalCase }) => evalCase.id));
  return buildNutritionEvalReport(results, {
    runId,
    timestamp,
    datasetId: stage === 'benchmark' ? ctx.publicDatasetId : ctx.trainingDatasetId,
    datasetHash: stage === 'benchmark' ? CALIBRATION_PUBLIC_MANIFEST_HASH : CALIBRATION_MANIFEST_SHA256,
    adapterModelId: 'gemini-3.8-flash',
    promptHash: ctx.identity.promptHash,
    codeSha: ctx.identity.implementationCommit,
    samples: samples.length,
    baselineOnly: false,
    publicCases: uniqueCases.size,
    privateCases: 0,
    calibration: calibrationInfo,
  });
}

export interface ValidationTwoFailureParams {
  readonly profile: CalibrationProfile;
}

/**
 * Genuine validation report with two ordinary provider failures: 48 outcomes,
 * 46 parsed. Derived from the original committed validation source cases via
 * the unchanged scorer + builder; the summary is recomputed, never forged.
 */
export async function makeValidationTwoFailureReport(
  params: ValidationTwoFailureParams,
): Promise<NutritionEvalReport> {
  const ctx = await getFixtureContext();
  const sourceCases = ctx.trainingCases.filter((c) => c.group === 'validation');
  const samples: readonly number[] = [1, 2, 3];
  const entries: RebuildEntry[] = [];
  let failuresPlaced = 0;
  for (const evalCase of sourceCases) {
    for (const sampleIndex of samples) {
      if (failuresPlaced < 2) {
        entries.push({ evalCase, prediction: createProviderFailurePrediction(evalCase, sampleIndex) });
        failuresPlaced += 1;
      } else {
        entries.push({ evalCase, prediction: createExactPrediction(evalCase, sampleIndex) });
      }
    }
  }
  return rebuildReportFromEntries('validation', params.profile, entries, samples);
}

export interface AllFailureParams {
  readonly stage: StageName;
  readonly profile: CalibrationProfile;
}

/** Every outcome is an ordinary provider failure with finite latency. */
export async function makeAllFailureReport(params: AllFailureParams): Promise<NutritionEvalReport> {
  const ctx = await getFixtureContext();
  const sourceCases: readonly NutritionEvalCase[] =
    params.stage === 'benchmark'
      ? ctx.publicCases
      : ctx.trainingCases.filter((c) =>
          params.stage === 'preflight' ? c.id === ctx.firstDevelopmentCaseId : c.group === params.stage,
        );
  const samples: readonly number[] =
    params.stage === 'preflight' || params.stage === 'development' ? [1] : [1, 2, 3];
  const entries: RebuildEntry[] = [];
  for (const evalCase of sourceCases) {
    for (const sampleIndex of samples) {
      const prediction = evalCase.scanMode === 'barcode'
        ? createProductFailurePrediction(evalCase, sampleIndex)
        : createProviderFailurePrediction(evalCase, sampleIndex);
      entries.push({ evalCase, prediction });
    }
  }
  return rebuildReportFromEntries(params.stage, params.profile, entries, samples);
}

export interface EmptyReportParams {
  readonly stage: StageName;
  readonly profile: CalibrationProfile;
}

/** Zero-outcome calibration report via the unchanged scorer + builder. */
export async function makeEmptyCalibrationReport(params: EmptyReportParams): Promise<NutritionEvalReport> {
  return rebuildReportFromEntries(params.stage, params.profile, [], [1]);
}

/** Three development outcomes with nonconstant latencies 1, 2, 10. */
export async function makeLatencyControlReport(): Promise<NutritionEvalReport> {
  const ctx = await getFixtureContext();
  const sourceCases = ctx.trainingCases.filter((c) => c.group === 'development').slice(0, 3);
  const latencies: readonly number[] = [1, 2, 10];
  const entries: RebuildEntry[] = sourceCases.map((evalCase, index) => ({
    evalCase,
    prediction: createExactPrediction(evalCase, 1, { latencyMs: latencies[index] ?? 1 }),
  }));
  return rebuildReportFromEntries('development', 'LOW', entries, [1]);
}

export interface NonMealDistortedParams {
  readonly profile: CalibrationProfile;
}

/**
 * Canonical benchmark report where every meal outcome is exact while every
 * label/barcode outcome is distorted (doubled nutrients plus offset) through
 * test-owned predictions. Full-report medians shift; meal-only medians stay 0.
 */
export async function makeNonMealDistortedReport(
  params: NonMealDistortedParams,
): Promise<NutritionEvalReport> {
  const ctx = await getFixtureContext();
  const samples: readonly number[] = [1, 2, 3];
  const entries: RebuildEntry[] = [];
  for (const evalCase of ctx.publicCases) {
    for (const sampleIndex of samples) {
      if (evalCase.scanMode === 'meal') {
        entries.push({ evalCase, prediction: createExactPrediction(evalCase, sampleIndex) });
      } else {
        const truth = evalCase.truth;
        const distorted: Record<string, unknown> = {
          parseStatus: 'success',
          source: evalCase.scanMode,
          kcal: truth.kcal * 2 + 50,
          proteinG: truth.proteinG * 2 + 5,
          carbsG: truth.carbsG * 2 + 5,
          fatG: truth.fatG * 2 + 5,
          confidence: 0.85,
          basis: truth.basis,
          amount: truth.amount,
          unit: truth.unit,
          decision: 'needs_review',
          reviewReasons: [],
          latencyMs: 1500,
          sampleIndex,
          cached: false,
        };
        if (evalCase.expectedBarcode !== undefined) {
          distorted.barcode = evalCase.expectedBarcode;
        }
        entries.push({ evalCase, prediction: distorted as unknown as NutritionPrediction });
      }
    }
  }
  return rebuildReportFromEntries('benchmark', params.profile, entries, samples);
}

export interface BenchmarkCaseLimitParams {
  readonly profile: CalibrationProfile;
}

/**
 * Genuine 61-outcome benchmark report: 61 unique test-owned case ids cloned
 * from genuine committed-source cases (training + public pools), each with a
 * single exact sample. This report is deliberately not source-admissible
 * against the locked manifest; pure measurement never source-binds. Rebuilt
 * through the unchanged scorer + report builder, never a forged summary.
 */
export async function makeBenchmarkCaseLimitReport(
  params: BenchmarkCaseLimitParams,
): Promise<NutritionEvalReport> {
  const ctx = await getFixtureContext();
  const genuineCases: readonly NutritionEvalCase[] = [...ctx.trainingCases, ...ctx.publicCases];
  const entries: RebuildEntry[] = [];
  for (let index = 0; index < 61; index += 1) {
    const source = genuineCases[index % genuineCases.length]!;
    const clonedCase: NutritionEvalCase = { ...source, id: `${source.id}-cap61-${index}` };
    entries.push({ evalCase: clonedCase, prediction: createExactPrediction(clonedCase, 1) });
  }
  return rebuildReportFromEntries('benchmark', params.profile, entries, [1]);
}

export interface NodeBudgetReportParams {
  readonly profile: CalibrationProfile;
}

const NODE_BUDGET_REFERENCE_VECTOR = {
  kcal: 1, proteinG: 1, carbsG: 1, fatG: 1, amount: 50, unit: 'g' as const,
};

function createNodeBudgetPrediction(
  evalCase: NutritionEvalCase,
  sampleIndex: number,
): NutritionPrediction {
  const base = createExactPrediction(evalCase, sampleIndex) as unknown as Record<string, unknown>;
  base.reviewReasons = new Array(256).fill('package_quantity_missing');
  const existingDiagnostics = (base.diagnostics as Record<string, unknown> | undefined) ?? {};
  base.diagnostics = {
    rawNutrients: { kcal: 1, proteinG: 1, carbsG: 1, fatG: 1 },
    detectedItemCount: 1,
    estimatedTotalMassG: 100,
    declaredBasis: 'portion',
    declaredAmount: 1,
    declaredUnit: 'portion',
    observedAmount: 50,
    observedUnit: 'g',
    packageReference: NODE_BUDGET_REFERENCE_VECTOR,
    per100Reference: NODE_BUDGET_REFERENCE_VECTOR,
    servingReference: NODE_BUDGET_REFERENCE_VECTOR,
    ...existingDiagnostics,
  };
  return base as unknown as NutritionPrediction;
}

/**
 * Genuine benchmark60report whose predictions are enriched with a full,
 * schema-valid 256-entry reviewReasons array plus rich (but structurally
 * valid) diagnostic reference vectors, pushing the serialized JSON node
 * count comfortably past 20000 while staying within every other capture
 * bound (strings<=4096, arrays<=256, depth<32) and leaving the scorer's
 * genuine summary untouched.
 */
export async function makeNodeBudgetReport(
  params: NodeBudgetReportParams,
): Promise<NutritionEvalReport> {
  const ctx = await getFixtureContext();
  const samples: readonly number[] = [1, 2, 3];
  const entries: RebuildEntry[] = [];
  for (const evalCase of ctx.publicCases) {
    for (const sampleIndex of samples) {
      entries.push({ evalCase, prediction: createNodeBudgetPrediction(evalCase, sampleIndex) });
    }
  }
  return rebuildReportFromEntries('benchmark', params.profile, entries, samples);
}

export interface MealMedianDiscriminatorParams {
  readonly profile: CalibrationProfile;
}

function createMealMedianPrediction(
  evalCase: NutritionEvalCase,
  sampleIndex: number,
  ratio: number,
): NutritionPrediction {
  const base = createExactPrediction(evalCase, sampleIndex) as unknown as Record<string, unknown>;
  const truth = evalCase.truth;
  base.proteinG = truth.proteinG * ratio;
  base.carbsG = truth.carbsG * ratio;
  base.fatG = truth.fatG * ratio;
  const diagnostics = base.diagnostics as Record<string, unknown> | undefined;
  if (diagnostics !== undefined) {
    diagnostics.rawNutrients = {
      kcal: truth.kcal,
      proteinG: truth.proteinG * ratio,
      carbsG: truth.carbsG * ratio,
      fatG: truth.fatG * ratio,
    };
  }
  return base as unknown as NutritionPrediction;
}

function createNonMealCatastrophicPrediction(
  evalCase: NutritionEvalCase,
  sampleIndex: number,
): NutritionPrediction {
  const truth = evalCase.truth;
  const prediction: Record<string, unknown> = {
    parseStatus: 'success',
    source: evalCase.scanMode,
    kcal: truth.kcal * 3 + 50,
    proteinG: truth.proteinG > 0 ? truth.proteinG * 6 : 0,
    carbsG: truth.carbsG > 0 ? truth.carbsG * 6 : 0,
    fatG: truth.fatG > 0 ? truth.fatG * 6 : 0,
    confidence: 0.85,
    basis: truth.basis,
    amount: truth.amount,
    unit: truth.unit,
    decision: 'complete',
    reviewReasons: [],
    latencyMs: 1500,
    sampleIndex,
    cached: false,
  };
  if (evalCase.expectedBarcode !== undefined) {
    prediction.barcode = evalCase.expectedBarcode;
  }
  return prediction as unknown as NutritionPrediction;
}

/**
 * Genuine benchmark60report discriminating meal-only macro medians from
 * whole-report medians. The first six meal cases (by public manifest order)
 * get protein/carbs/fat quadrupled (relative error 3); the last six meal
 * cases get them doubled (relative error 1); meal kcal stays exact with
 * decision needs_review (never catastrophic/unsafe). All eight nonmeal
 * cases get positive macros multiplied by 6 (relative error 5, zero macros
 * stay zero) and kcal = 3*truth+50 with decision complete, making every
 * nonmeal outcome catastrophic and unsafe (including the 0-kcal case,
 * since the +50 offset still exceeds 2x truth). Truth/manifests are never
 * mutated; summaries are genuinely recomputed through the unchanged
 * scorer + report builder.
 */
export async function makeMealMedianDiscriminatorReport(
  params: MealMedianDiscriminatorParams,
): Promise<NutritionEvalReport> {
  const ctx = await getFixtureContext();
  const samples: readonly number[] = [1, 2, 3];
  const mealCases = ctx.publicCases.filter((c) => c.scanMode === 'meal');
  const nonMealCases = ctx.publicCases.filter((c) => c.scanMode !== 'meal');
  const entries: RebuildEntry[] = [];
  mealCases.forEach((evalCase, index) => {
    const ratio = index < 6 ? 4 : 2;
    for (const sampleIndex of samples) {
      entries.push({ evalCase, prediction: createMealMedianPrediction(evalCase, sampleIndex, ratio) });
    }
  });
  for (const evalCase of nonMealCases) {
    for (const sampleIndex of samples) {
      entries.push({ evalCase, prediction: createNonMealCatastrophicPrediction(evalCase, sampleIndex) });
    }
  }
  return rebuildReportFromEntries('benchmark', params.profile, entries, samples);
}

/**
 * Single-outcome development-population helper exercising nonzero kcal/mass/
 * density mapping (not the degenerate all-zero case). Takes the second
 * committed development training case (positive kcal/carbs/fat and
 * referenceMassG), scales predicted kcal to 1.5x truth and the estimated
 * meal mass to 2x truth.referenceMassG while keeping raw macro values exact,
 * so carb/fat density halves (relative error 0.5) and mass doubles (relative
 * error 1). This deliberately partial 1-outcome population is a pure-helper
 * input only, not a locked native-source-admissible development-24 report;
 * truth/summary/manifests are never mutated, and the summary is genuinely
 * recomputed through the unchanged scorer + report builder.
 */
export async function makeNonzeroMappingReport(): Promise<NutritionEvalReport> {
  const ctx = await getFixtureContext();
  const developmentCases = ctx.trainingCases.filter((c) => c.group === 'development');
  const evalCase = developmentCases[1]!;
  const truth = evalCase.truth;
  const base = createExactPrediction(evalCase, 1) as unknown as Record<string, unknown>;
  base.kcal = truth.kcal * 1.5;
  const diagnostics = base.diagnostics as Record<string, unknown> | undefined;
  if (diagnostics !== undefined) {
    diagnostics.estimatedTotalMassG = (truth.referenceMassG ?? 0) * 2;
    diagnostics.rawNutrients = {
      kcal: truth.kcal * 1.5,
      proteinG: truth.proteinG,
      carbsG: truth.carbsG,
      fatG: truth.fatG,
    };
  }
  const prediction = base as unknown as NutritionPrediction;
  return rebuildReportFromEntries('development', 'LOW', [{ evalCase, prediction }], [1]);
}

/** Test-owned deep clone typed as an owned report (mutation cases only). */
export function cloneOwnedReport(report: NutritionEvalReport): NutritionEvalReport {
  return JSON.parse(JSON.stringify(report)) as NutritionEvalReport;
}

// ── Task 2 authoritative fixture support (additive; Task 1 sections above unchanged) ──

function resolveAuthoritativeTempParent(): string {
  const configured = process.env.TMPDIR;
  if (typeof configured === 'string' && configured.trim().length > 0) {
    return resolve(configured);
  }
  return resolve(
    fileURLToPath(new URL('.', import.meta.url)),
    '../../lib/calibration-authoritative-test-tmp',
  );
}
const AUTHORITATIVE_PIN = 'gemini-3.8-fixture-pin';
const AUTHORITATIVE_TOKEN_COUNT = 42;
const AUTHORITATIVE_FAILURE_LATENCY_MS = 200;

export type AuthoritativeScenario = 'exact' | 'provider_failure' | 'interruption';
export interface AuthoritativeScenarioSpec {
  readonly failures?: readonly number[];
  readonly interruptions?: readonly number[];
  readonly unsafeIndices?: readonly number[];
  readonly catastrophicIndices?: readonly number[];
  readonly missingDiagnostics?: readonly number[];
  readonly kcalScale?: number;
  readonly proteinScale?: number;
  readonly carbsScale?: number;
  readonly fatScale?: number;
  readonly massScale?: number;
  readonly latencyMs?: number;
  readonly perOutcomeKcalScale?: ReadonlyArray<number | undefined>;
  readonly perOutcomeMacroScale?: ReadonlyArray<number | undefined>;
}
export type AuthoritativeScenarioInput = AuthoritativeScenario | AuthoritativeScenarioSpec;

export interface AuthoritativeFixtureEffects {
  ledgerAppends: number;
  journalAppends: number;
  fsyncs: number;
  clockReads: number;
  verifierCalls: number;
  nativeVerifierCalls: number;
}

export interface AuthoritativeNativeTraceEntry {
  readonly stage: StageName;
  readonly profile: CalibrationProfile;
  readonly imageCallsReserved: number;
  readonly imageCallsCompleted: number;
  readonly selectedProfile: CalibrationProfile | undefined;
  readonly pinnedModelVersion: string | undefined;
}

export interface TestAuthoritativeVerifyOptions {
  readonly verifyStageReportArtifacts: (
    params: Readonly<{
      stage: StageName;
      profile: CalibrationProfile;
      snapshot: CalibrationStageReportSnapshot;
    }>,
  ) => Readonly<CalibrationReportPublicationResult>;
}

export interface AuthoritativeTestLedger extends CalibrationProtocolLedger {
  admitStageReportReceipt(
    stage: StageName,
    profile: CalibrationProfile,
  ): Readonly<CalibrationPublishedReportReceipt>;
}

export interface AuthoritativeFixture {
  readonly ledger: AuthoritativeTestLedger;
  readonly owner: Readonly<CalibrationOwner>;
  readonly baseDir: string;
  readonly identity: Readonly<CalibrationIdentity>;
  readonly effects: AuthoritativeFixtureEffects;
  readonly reportOptions: CalibrationProtocolReportOptions;
  readonly verifierOptions: TestAuthoritativeVerifyOptions;
  readonly nativeVerify: (
    params: Readonly<{
      stage: StageName;
      profile: CalibrationProfile;
      snapshot: CalibrationStageReportSnapshot;
    }>,
  ) => Readonly<CalibrationReportPublicationResult>;
  nativeTrace(): ReadonlyArray<Readonly<AuthoritativeNativeTraceEntry>>;
  publish(stage: StageName, profile: CalibrationProfile): Promise<void>;
  finishPreflight(): Promise<void>;
  finishDevelopment(profile: CalibrationProfile, scenario: AuthoritativeScenarioInput): Promise<void>;
  finishValidation(profile: CalibrationProfile, scenario: AuthoritativeScenarioInput): Promise<void>;
  finishBenchmark(profile: CalibrationProfile, scenario: AuthoritativeScenario): Promise<void>;
  reopen(
    newOwner: Readonly<CalibrationOwner>,
    opts?: Readonly<{ acquire?: boolean }>,
  ): Promise<AuthoritativeFixture>;
  receiptEvents(): ReadonlyArray<Record<string, unknown>>;
  ledgerEvents(): ReadonlyArray<unknown>;
  artifactPath(stage: StageName, profile: CalibrationProfile, extension: 'json' | 'md'): string;
  lockPath(): string;
  createLedger(
    reportOptions: CalibrationProtocolReportOptions | undefined,
    authoritativeOptions: TestAuthoritativeVerifyOptions | undefined,
  ): AuthoritativeTestLedger;
  createLedgerWithFileStoreOverrides(
    overrides: CalibrationFileStoreOverrides,
    reportOptions: CalibrationProtocolReportOptions | undefined,
    authoritativeOptions: TestAuthoritativeVerifyOptions | undefined,
  ): AuthoritativeTestLedger;
  appendRawLedgerEvent(event: unknown): void;
  setVerifierOverride(
    override: ((params: unknown) => Readonly<CalibrationReportPublicationResult>) | undefined,
  ): void;
  releaseLockViaNativeDeps(): void;
  cleanup(): void;
}

export function makeAuthoritativeOwner(suffix: number): CalibrationOwner {
  return {
    hostname: 'authoritative-fixture',
    bootId: 'authoritative-boot',
    pid: 4242 + suffix,
    startTicks: 4242 + suffix,
    acquiredAt: '2026-10-11T00:00:00.000Z',
  };
}

interface AuthoritativeSource {
  readonly context: CalibrationPreparedContext;
  readonly trainingCases: ReadonlyArray<NutritionEvalCase & { readonly group: string }>;
  readonly publicCases: ReadonlyArray<NutritionEvalCase>;
}

async function loadAuthoritativeSource(
  baseDir: string,
  owner: Readonly<CalibrationOwner>,
): Promise<AuthoritativeSource> {
  const bootstrap = await prepareCalibrationBootstrapContext({
    baseDir,
    readGitState: () => ({
      headCommit: 'a'.repeat(40),
      implementationCommit: 'b'.repeat(40),
      functionsTreeId: 'c'.repeat(40),
      dirtyPaths: [],
    }),
    readCommittedFile: (path, _commit) => readFileSync(resolve(repoRoot, path), 'utf8'),
    readOwner: () => ({
      hostname: owner.hostname,
      bootId: owner.bootId,
      pid: owner.pid,
      startTicks: owner.startTicks,
      acquiredAt: owner.acquiredAt,
    }),
  });
  const calibrationManifest = StrictCalibrationManifestSchema.parse(
    JSON.parse(bootstrap.files['calibration-manifest']),
  );
  const publicManifest = parseNutritionEvalManifest(JSON.parse(bootstrap.files['public-manifest']));
  return {
    context: bootstrap,
    trainingCases: calibrationManifest.cases,
    publicCases: publicManifest.cases,
  };
}

function buildAuthoritativeFailurePrediction(
  scanMode: 'meal' | 'label' | 'barcode',
  sampleIndex: number,
): NutritionPrediction {
  return captureCalibrationReportPrediction({
    parseStatus: 'failure',
    source: scanMode,
    decision: 'error',
    failureCategory: 'provider',
    failureCode: 'provider_request_failed',
    latencyMs: AUTHORITATIVE_FAILURE_LATENCY_MS,
    sampleIndex,
    cached: false,
  });
}

function hasSpecIndex(values: readonly number[] | undefined, index: number): boolean {
  return values !== undefined && values.includes(index);
}
function applySpecScales(
  base: NutritionPrediction,
  spec: AuthoritativeScenarioSpec,
  outcomeIndex: number,
): NutritionPrediction {
  const record = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
  if (hasSpecIndex(spec.missingDiagnostics, outcomeIndex)) {
    delete record['diagnostics'];
  }
  const perKcal = spec.perOutcomeKcalScale?.[outcomeIndex];
  const perMacro = spec.perOutcomeMacroScale?.[outcomeIndex];
  const kcalScale = perKcal ?? spec.kcalScale ?? 1;
  const proteinScale = perMacro ?? spec.proteinScale ?? 1;
  const carbsScale = perMacro ?? spec.carbsScale ?? 1;
  const fatScale = perMacro ?? spec.fatScale ?? 1;
  const massScale = spec.massScale ?? 1;
  if (hasSpecIndex(spec.catastrophicIndices, outcomeIndex)) {
    if (typeof record['kcal'] === 'number') {
      record['kcal'] = (record['kcal'] as number) * 2.5;
    }
  } else {
    if (typeof record['kcal'] === 'number') {
      record['kcal'] = (record['kcal'] as number) * kcalScale;
    }
    if (typeof record['proteinG'] === 'number') {
      record['proteinG'] = (record['proteinG'] as number) * proteinScale;
    }
    if (typeof record['carbsG'] === 'number') {
      record['carbsG'] = (record['carbsG'] as number) * carbsScale;
    }
    if (typeof record['fatG'] === 'number') {
      record['fatG'] = (record['fatG'] as number) * fatScale;
    }
  }
  if (hasSpecIndex(spec.unsafeIndices, outcomeIndex)) {
    record['decision'] = 'complete';
  }
  const diagnostics = record['diagnostics'] as Record<string, unknown> | undefined;
  if (diagnostics !== undefined && typeof diagnostics['estimatedTotalMassG'] === 'number') {
    diagnostics['estimatedTotalMassG'] =
      (diagnostics['estimatedTotalMassG'] as number) * massScale;
  }
  if (spec.latencyMs !== undefined) {
    record['latencyMs'] = spec.latencyMs;
  }
  return record as unknown as NutritionPrediction;
}
function buildSuccessJournal(
  key: ReservationKey,
  prediction: NutritionPrediction,
): JournalEntry {
  const four = {
    kcal: prediction.kcal as number,
    proteinG: prediction.proteinG as number,
    carbsG: prediction.carbsG as number,
    fatG: prediction.fatG as number,
  };
  const mass = prediction.diagnostics?.estimatedTotalMassG;
  return {
    key: { ...key },
    predictionHash: createHash('sha256').update(JSON.stringify(four)).digest('hex'),
    normalizedPrediction: mass === undefined ? { ...four } : { ...four, estimatedTotalMassG: mass },
    analysisLatencyMs: prediction.latencyMs ?? 1500,
    errorCategory: 'none',
    responseModelVersion: AUTHORITATIVE_PIN,
    reportPrediction: prediction,
  };
}

function buildFailureJournal(key: ReservationKey, prediction: NutritionPrediction): JournalEntry {
  return {
    key: { ...key },
    predictionHash: 'http_5xx',
    normalizedPrediction: null,
    analysisLatencyMs: prediction.latencyMs ?? AUTHORITATIVE_FAILURE_LATENCY_MS,
    errorCategory: 'http_5xx',
    responseModelVersion: 'n/a',
    reportPrediction: prediction,
  };
}

function recordImageTerminal(
  ledger: CalibrationProtocolLedger,
  evalCase: NutritionEvalCase,
  key: ReservationKey,
  rawPrediction: NutritionPrediction,
): void {
  ledger.reserve(key);
  if (key.stage === 'preflight' && key.profile === 'LOW') {
    ledger.pinModelVersion(AUTHORITATIVE_PIN);
  }
  const scored = scoreNutritionCase(evalCase, rawPrediction);
  const owned = captureCalibrationReportPrediction(scored.prediction);
  const journal =
    owned.parseStatus === 'success'
      ? buildSuccessJournal(key, owned)
      : buildFailureJournal(key, owned);
  ledger.complete(key, ledger.appendResultJournal(journal));
}

function finishPreflightFlow(ledger: CalibrationProtocolLedger, source: AuthoritativeSource): void {
  const firstId = source.context.firstDevelopmentCaseId;
  const trainingCases = source.trainingCases;
  const evalCase = trainingCases.find((c) => c.id === firstId) ?? trainingCases[0];
  if (evalCase === undefined) {
    throw new CalibrationFatalError('calibration:authoritative-fixture-empty-training');
  }
  const tokenKey: TokenCountReservationKey = {
    kind: 'token_count',
    stage: 'preflight',
    caseId: firstId,
    model: 'gemini-3.8-flash',
  };
  ledger.reserveTokenCount(tokenKey);
  ledger.completeTokenCount(tokenKey, AUTHORITATIVE_TOKEN_COUNT);
  for (const profile of ['LOW', 'MEDIUM'] as const) {
    const key: ReservationKey = { stage: 'preflight', profile, caseId: firstId, sampleIndex: 1 };
    recordImageTerminal(ledger, evalCase, key, createExactPrediction(evalCase, 1));
  }
}

function finishDevelopmentFlow(
  ledger: CalibrationProtocolLedger,
  source: AuthoritativeSource,
  profile: CalibrationProfile,
  scenario: AuthoritativeScenarioInput,
): void {
  const devCases = source.trainingCases.filter((c) => c.group === 'development');
  let outcomeIndex = 0;
  for (const evalCase of devCases) {
    const key: ReservationKey = { stage: 'development', profile, caseId: evalCase.id, sampleIndex: 1 };
    const index = outcomeIndex;
    outcomeIndex += 1;
    if (typeof scenario !== 'string') {
      if (hasSpecIndex(scenario.interruptions, index)) {
        ledger.reserve(key);
        ledger.recoverAfterCrash();
        continue;
      }
      if (hasSpecIndex(scenario.failures, index)) {
        recordImageTerminal(ledger, evalCase, key, buildAuthoritativeFailurePrediction(evalCase.scanMode, 1));
        continue;
      }
      const base = createExactPrediction(evalCase, 1);
      recordImageTerminal(ledger, evalCase, key, applySpecScales(base, scenario, index));
      continue;
    }
    const faulted = scenario !== 'exact' && evalCase.id === devCases[0]?.id;
    if (faulted && scenario === 'interruption') {
      ledger.reserve(key);
      ledger.recoverAfterCrash();
      continue;
    }
    const raw =
      faulted && scenario === 'provider_failure'
        ? buildAuthoritativeFailurePrediction(evalCase.scanMode, 1)
        : createExactPrediction(evalCase, 1);
    recordImageTerminal(ledger, evalCase, key, raw);
  }
}

function finishValidationFlow(
  ledger: CalibrationProtocolLedger,
  source: AuthoritativeSource,
  profile: CalibrationProfile,
  scenario: AuthoritativeScenarioInput,
): void {
  const valCases = source.trainingCases.filter((c) => c.group === 'validation');
  let outcomeIndex = 0;
  for (const evalCase of valCases) {
    for (const sampleIndex of [1, 2, 3]) {
      const key: ReservationKey = { stage: 'validation', profile, caseId: evalCase.id, sampleIndex };
      const index = outcomeIndex;
      outcomeIndex += 1;
      if (typeof scenario !== 'string') {
        if (hasSpecIndex(scenario.interruptions, index)) {
          ledger.reserve(key);
          ledger.recoverAfterCrash();
          continue;
        }
        if (hasSpecIndex(scenario.failures, index)) {
          recordImageTerminal(ledger, evalCase, key, buildAuthoritativeFailurePrediction(evalCase.scanMode, sampleIndex));
          continue;
        }
        const base = createExactPrediction(evalCase, sampleIndex);
        recordImageTerminal(ledger, evalCase, key, applySpecScales(base, scenario, index));
        continue;
      }
      const faulted = scenario !== 'exact' && evalCase.id === valCases[0]?.id && sampleIndex === 1;
      if (faulted && scenario === 'interruption') {
        ledger.reserve(key);
        ledger.recoverAfterCrash();
        continue;
      }
      const raw =
        faulted && scenario === 'provider_failure'
          ? buildAuthoritativeFailurePrediction(evalCase.scanMode, sampleIndex)
          : createExactPrediction(evalCase, sampleIndex);
      recordImageTerminal(ledger, evalCase, key, raw);
    }
  }
}

function finishBenchmarkFlow(
  ledger: CalibrationProtocolLedger,
  source: AuthoritativeSource,
  profile: CalibrationProfile,
  scenario: AuthoritativeScenario,
): void {
  const publicCases = source.publicCases;
  const firstMealId = publicCases.find((c) => c.scanMode === 'meal')?.id;
  for (const evalCase of publicCases) {
    for (const sampleIndex of [1, 2, 3]) {
      const key: ReservationKey = { stage: 'benchmark', profile, caseId: evalCase.id, sampleIndex };
      if (evalCase.scanMode === 'barcode') {
        const scored = scoreNutritionCase(evalCase, createExactPrediction(evalCase, sampleIndex));
        const owned = captureCalibrationReportPrediction(scored.prediction);
        ledger.recordNonReservationResult({ key, reason: 'barcode', prediction: owned });
        continue;
      }
      const faulted = scenario !== 'exact' && evalCase.id === firstMealId && sampleIndex === 1;
      if (faulted && scenario === 'interruption') {
        ledger.reserve(key);
        ledger.recoverAfterCrash();
        continue;
      }
      const raw =
        faulted && scenario === 'provider_failure'
          ? buildAuthoritativeFailurePrediction(evalCase.scanMode, sampleIndex)
          : createExactPrediction(evalCase, sampleIndex);
      recordImageTerminal(ledger, evalCase, key, raw);
    }
  }
}

type AuthoritativeLedgerFactory = (
  deps: CalibrationLedgerDeps,
  identity: CalibrationIdentity,
  keyResolver: CalibrationKeyResolver,
  reportOptions?: CalibrationProtocolReportOptions,
  authoritativeOptions?: TestAuthoritativeVerifyOptions,
) => AuthoritativeTestLedger;

export interface AuthoritativeFixtureOpts {
  readonly acquire?: boolean;
  readonly authoritative?: boolean;
}
async function openAuthoritativeFixture(
  baseDir: string,
  owner: Readonly<CalibrationOwner>,
  acquire: boolean,
  authoritative = true,
): Promise<AuthoritativeFixture> {
  const effects: AuthoritativeFixtureEffects = {
    ledgerAppends: 0,
    journalAppends: 0,
    fsyncs: 0,
    clockReads: 0,
    verifierCalls: 0,
    nativeVerifierCalls: 0,
  };
  let ticks = 0;
  const source = await loadAuthoritativeSource(baseDir, owner);
  const preparedVerifier: Readonly<CalibrationStageReportArtifactVerifier> =
    await prepareCalibrationStageReportArtifactVerifier({
      baseDir,
      identity: { ...source.context.identity },
      owner: { ...owner },
      firstDevelopmentCaseId: source.context.firstDevelopmentCaseId,
      report: source.context.report,
      files: { ...source.context.files },
    });
  let verifierOverride:
    | ((params: unknown) => Readonly<CalibrationReportPublicationResult>)
    | undefined;
  const nativeTraceEntries: AuthoritativeNativeTraceEntry[] = [];
  const nativeVerify = (
    params: Readonly<{
      stage: StageName;
      profile: CalibrationProfile;
      snapshot: CalibrationStageReportSnapshot;
    }>,
  ): Readonly<CalibrationReportPublicationResult> => {
    const snapshotRecord = params.snapshot as unknown as Record<string, unknown>;
    const countsRecord =
      (snapshotRecord['counts'] as Record<string, unknown> | undefined) ?? {};
    const toCount = (value: unknown): number =>
      typeof value === 'number' && Number.isFinite(value) ? value : -1;
    const selectedRaw = snapshotRecord['selectedProfile'];
    const pinnedRaw = snapshotRecord['pinnedModelVersion'];
    const entry: AuthoritativeNativeTraceEntry = Object.freeze({
      stage: params.stage,
      profile: params.profile,
      imageCallsReserved: toCount(countsRecord['imageCallsReserved']),
      imageCallsCompleted: toCount(countsRecord['imageCallsCompleted']),
      selectedProfile:
        selectedRaw === 'LOW' || selectedRaw === 'MEDIUM'
          ? (selectedRaw as CalibrationProfile)
          : undefined,
      pinnedModelVersion: typeof pinnedRaw === 'string' ? pinnedRaw : undefined,
    });
    nativeTraceEntries.push(entry);
    effects.nativeVerifierCalls += 1;
    return preparedVerifier.verify(params);
  };
  const dispatchVerify = (
    params: Readonly<{
      stage: StageName;
      profile: CalibrationProfile;
      snapshot: CalibrationStageReportSnapshot;
    }>,
  ): Readonly<CalibrationReportPublicationResult> => {
    effects.verifierCalls += 1;
    if (verifierOverride !== undefined) return verifierOverride(params);
    return nativeVerify(params);
  };
  const standardReportOptions: CalibrationProtocolReportOptions = {
    getReportOutcomePlan: (selectedProfile) =>
      deriveCanonicalReportOutcomePlan({ ...source.context.files }, selectedProfile),
  };
  const standardVerifierOptions: TestAuthoritativeVerifyOptions = {
    verifyStageReportArtifacts: dispatchVerify,
  };
  const factory = createProtocolCalibrationLedger as unknown as AuthoritativeLedgerFactory;
  const wrapDeps = (
    baseDeps: CalibrationLedgerDeps,
  ): CalibrationLedgerDeps => {
    const deps: CalibrationLedgerDeps = {
      ...baseDeps,
      appendLedgerEvent: (event) => {
        effects.ledgerAppends += 1;
        baseDeps.appendLedgerEvent(event);
      },
      fsyncLedgerFile: () => {
        effects.fsyncs += 1;
        baseDeps.fsyncLedgerFile();
      },
      fsyncLedgerDir: () => {
        effects.fsyncs += 1;
        baseDeps.fsyncLedgerDir();
      },
      appendJournal: (entry) => {
        effects.journalAppends += 1;
        baseDeps.appendJournal(entry);
      },
      fsyncJournalFile: () => {
        effects.fsyncs += 1;
        baseDeps.fsyncJournalFile();
      },
      fsyncJournalDir: () => {
        effects.fsyncs += 1;
        baseDeps.fsyncJournalDir();
      },
      nowIso: () => {
        effects.clockReads += 1;
        const at = new Date(Date.UTC(2026, 9, 11) + ticks * 1000).toISOString();
        ticks += 1;
        return at;
      },
    };
    return deps;
  };
  const openLedger = (
    reportOptions: CalibrationProtocolReportOptions | undefined,
    authoritativeOptions: TestAuthoritativeVerifyOptions | undefined,
  ): AuthoritativeTestLedger => {
    const baseDeps = createFileCalibrationLedgerDeps(baseDir);
    const deps = wrapDeps(baseDeps);
    const keyResolver: CalibrationKeyResolver = (selectedProfile) =>
      deriveCanonicalAllowedKeys({ ...source.context.files }, selectedProfile);
    return factory(
      deps,
      { ...source.context.identity },
      keyResolver,
      reportOptions,
      authoritativeOptions,
    );
  };
  const openLedgerWithFileStoreOverrides = (
    overrides: CalibrationFileStoreOverrides,
    reportOptions: CalibrationProtocolReportOptions | undefined,
    authoritativeOptions: TestAuthoritativeVerifyOptions | undefined,
  ): AuthoritativeTestLedger => {
    const baseDeps = createFileCalibrationLedgerDeps(baseDir, overrides);
    const deps = wrapDeps(baseDeps);
    const keyResolver: CalibrationKeyResolver = (selectedProfile) =>
      deriveCanonicalAllowedKeys({ ...source.context.files }, selectedProfile);
    return factory(
      deps,
      { ...source.context.identity },
      keyResolver,
      reportOptions,
      authoritativeOptions,
    );
  };
  const readDeps = createFileCalibrationLedgerDeps(baseDir);
  const ledger = openLedger(standardReportOptions, authoritative ? standardVerifierOptions : undefined);
  const readSnapshot = (stage: StageName, profile: CalibrationProfile) =>
    ledger.getStageReportSnapshot(stage, profile);
  const fixture: AuthoritativeFixture = {
    ledger,
    owner: { ...owner },
    baseDir,
    identity: source.context.identity,
    effects,
    reportOptions: standardReportOptions,
    verifierOptions: standardVerifierOptions,
    nativeVerify,
    nativeTrace: () =>
      nativeTraceEntries.map((entry) => ({ ...entry })) as ReadonlyArray<
        Readonly<AuthoritativeNativeTraceEntry>
      >,
    publish: async (stage, profile) => {
      const published = await publishCalibrationStageReport({
        stage,
        profile,
        context: {
          baseDir: source.context.baseDir,
          identity: { ...source.context.identity },
          owner: { ...owner },
          firstDevelopmentCaseId: source.context.firstDevelopmentCaseId,
          report: source.context.report,
          files: { ...source.context.files },
        },
        readSnapshot,
      });
      const snapshot = ledger.getStageReportSnapshot(stage, profile);
      const verified = dispatchVerify({ stage, profile, snapshot });
      if (
        verified.receipt.runId !== published.receipt.runId ||
        verified.receipt.jsonSha256 !== published.receipt.jsonSha256 ||
        verified.receipt.markdownSha256 !== published.receipt.markdownSha256
      ) {
        throw new CalibrationFatalError('calibration:authoritative-publish-verify-mismatch');
      }
    },
    finishPreflight: async () => {
      finishPreflightFlow(ledger, source);
    },
    finishDevelopment: async (profile, scenario) => {
      finishDevelopmentFlow(ledger, source, profile, scenario);
    },
    finishValidation: async (profile, scenario) => {
      finishValidationFlow(ledger, source, profile, scenario);
    },
    finishBenchmark: async (profile, scenario) => {
      finishBenchmarkFlow(ledger, source, profile, scenario);
    },
    reopen: async (newOwner, opts) => {
      ledger.releaseLock({ ...owner });
      return openAuthoritativeFixture(
        baseDir,
        newOwner,
        opts?.acquire ?? true,
        authoritative,
      );
    },
    receiptEvents: () =>
      readDeps
        .readLedgerEvents()
        .filter(
          (event): event is Record<string, unknown> =>
            typeof event === 'object' &&
            event !== null &&
            !Array.isArray(event) &&
            (event as Record<string, unknown>).type === 'artifact_receipt_admitted',
        )
        .map((event) => JSON.parse(JSON.stringify(event)) as Record<string, unknown>),
    ledgerEvents: () =>
      JSON.parse(JSON.stringify(readDeps.readLedgerEvents())) as ReadonlyArray<unknown>,
    artifactPath: (stage, profile, extension) =>
      resolve(baseDir, CALIBRATION_ROOT, 'reports', `${stage}-${profile.toLowerCase()}.${extension}`),
    lockPath: () => resolve(baseDir, CALIBRATION_ROOT, 'lock.json'),
    createLedger: (reportOptions, authoritativeOptions) =>
      openLedger(reportOptions, authoritativeOptions),
    createLedgerWithFileStoreOverrides: (overrides, reportOptions, authoritativeOptions) =>
      openLedgerWithFileStoreOverrides(overrides, reportOptions, authoritativeOptions),
    appendRawLedgerEvent: (event) => {
      effects.ledgerAppends += 1;
      readDeps.appendLedgerEvent(event);
    },
    releaseLockViaNativeDeps: () => {
      createFileCalibrationLedgerDeps(baseDir).removeLock({ ...owner });
    },
    setVerifierOverride: (override) => {
      verifierOverride = override;
    },
    cleanup: () => {
      try {
        ledger.releaseLock({ ...owner });
      } catch {
        // Best effort: directory removal below is authoritative.
      }
      rmSync(baseDir, { recursive: true, force: true });
    },
  };
  if (acquire) {
    ledger.acquireLock({ ...owner });
  }
  return fixture;
}

export async function makeAuthoritativeFixture(
  owner: Readonly<CalibrationOwner> = makeAuthoritativeOwner(0),
  opts?: AuthoritativeFixtureOpts,
): Promise<AuthoritativeFixture> {
  const chosenParent = resolveAuthoritativeTempParent();
  mkdirSync(chosenParent, { recursive: true, mode: 0o700 });
  const baseDir = mkdtempSync(resolve(chosenParent, 'authoritative-reports-'));
  try {
    return await openAuthoritativeFixture(
      baseDir,
      owner,
      opts?.acquire ?? true,
      opts?.authoritative ?? true,
    );
  } catch (error) {
    rmSync(baseDir, { recursive: true, force: true });
    throw error;
  }
}
