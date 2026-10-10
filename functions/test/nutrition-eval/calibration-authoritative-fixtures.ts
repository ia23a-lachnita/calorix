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
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreNutritionCase } from '../../src/nutrition-eval/scorer';
import { buildNutritionEvalReport } from '../../src/nutrition-eval/report';
import { parseNutritionEvalManifest, StrictCalibrationManifestSchema } from '../../src/nutrition-eval/schema';
import { prepareCalibrationBootstrapContext } from '../../src/nutrition-eval/calibration-bootstrap';
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
import type { StageName, CalibrationProfile } from '../../src/nutrition-eval/calibration';

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
  const failures = results.filter((r) => r.prediction.parseStatus === 'failure');
  const safeErrors = failures.map((failed) => ({
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
    imageCallsCompleted: imageOutcomes - failures.length,
    imageCallsFailed: failures.length,
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
      entries.push({ evalCase, prediction: createProviderFailurePrediction(evalCase, sampleIndex) });
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

/** Test-owned deep clone typed as an owned report (mutation cases only). */
export function cloneOwnedReport(report: NutritionEvalReport): NutritionEvalReport {
  return JSON.parse(JSON.stringify(report)) as NutritionEvalReport;
}
