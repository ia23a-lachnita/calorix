import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { z } from 'zod';

import type { NutritionEvalReport } from './schema';

// Frozen aggregate-only evidence for the already-verified gemini-2.5-flash
// run `run-2026-09-11T20-22-21-450Z`. This module never calls, imports, or
// constructs a GenAI provider client; it only parses and compares committed,
// checked-in aggregate numbers.

const FOUR_DECIMAL_ROUNDING = 'four_decimal_places' as const;

const SLICE_G_CAVEAT = 'one transient supplied-barcode catalog miss fell through to a catastrophic vision estimate, so the aggregate is valid historical evidence but not a like-for-like barcode-routing implementation baseline.' as const;

const HistoricalReferenceCoverageSchema = z.object({
  totalCases: z.literal(60),
  runCases: z.literal(60),
  parseCases: z.literal(60),
  failureCount: z.literal(0),
  unsafeCompletionCount: z.literal(0),
  reviewCount: z.literal(52),
  catastrophicCount: z.literal(15),
}).strict();

const HistoricalReferenceMetricsSchema = z.object({
  medianRelativeCalorieError: z.literal(0.2719),
  p90RelativeCalorieError: z.literal(1.0136),
  meanMacroRelativeError: z.literal(0.5227),
  meanMealMassRelativeError: z.literal(0.4695),
  meanMealCarbDensityRelativeError: z.literal(0.7780),
  meanMealFatDensityRelativeError: z.literal(0.3786),
}).strict();

const HistoricalReferenceProvenanceSchema = z.object({
  rounding: z.literal(FOUR_DECIMAL_ROUNDING),
  predatesSliceG: z.literal(true),
  sliceGCommit: z.literal('d9492b60d06296b54f51d951b0d5fb4ae8c89ed8'),
  caveat: z.literal(SLICE_G_CAVEAT),
}).strict();

export const HistoricalReferenceSchema = z.object({
  version: z.literal(1),
  runId: z.literal('run-2026-09-11T20-22-21-450Z'),
  codeSha: z.literal('bb414d1850fb9f91cc419b4a270138354abf5535'),
  datasetId: z.literal('calorix-public-v1'),
  datasetHash: z.literal('2dc17d06752c2981862690953a7b134235bb6a20da4dc9b5fef5528f91f5bb56'),
  promptHash: z.literal('205b635a252e1f378023f5e1f3c670a6fba0ecfdfc8ce4f08f30efa24c544263'),
  model: z.literal('gemini-2.5-flash'),
  publicCases: z.literal(20),
  privateCases: z.literal(0),
  samples: z.literal(3),
  coverage: HistoricalReferenceCoverageSchema,
  metrics: HistoricalReferenceMetricsSchema,
  provenance: HistoricalReferenceProvenanceSchema,
}).strict();

export type HistoricalReference = z.infer<typeof HistoricalReferenceSchema>;

export function parseHistoricalReference(value: unknown): HistoricalReference {
  return HistoricalReferenceSchema.parse(value);
}

export function hashHistoricalReference(value: unknown): string {
  const reference = parseHistoricalReference(value);
  return createHash('sha256').update(JSON.stringify(reference), 'utf8').digest('hex');
}

// ── Runtime loading ──────────────────────────────────────────────────────────

export interface HistoricalReferenceRuntimePaths {
  referencePath: string;
}

export function resolveHistoricalReferenceRuntimePaths(
  moduleDir = __dirname,
): HistoricalReferenceRuntimePaths {
  const repoRoot = resolve(moduleDir, '../../..');
  return {
    referencePath: resolve(repoRoot, 'functions/eval/nutrition/historical-reference-v1.json'),
  };
}

export async function defaultLoadHistoricalReference(
  paths: HistoricalReferenceRuntimePaths = resolveHistoricalReferenceRuntimePaths(),
): Promise<unknown> {
  return JSON.parse(await readFile(paths.referencePath, 'utf8'));
}

export async function loadHistoricalReference(
  paths: HistoricalReferenceRuntimePaths = resolveHistoricalReferenceRuntimePaths(),
  loadRaw: (paths: HistoricalReferenceRuntimePaths) => Promise<unknown> = defaultLoadHistoricalReference,
): Promise<HistoricalReference> {
  const raw = await loadRaw(paths);
  return parseHistoricalReference(raw);
}

// ── Compatibility and comparison ─────────────────────────────────────────────

export const HISTORICAL_COMPATIBILITY_REASON_ORDER = [
  'dataset_id_mismatch',
  'dataset_hash_mismatch',
  'prompt_hash_mismatch',
  'samples_mismatch',
  'public_cases_mismatch',
  'private_cases_mismatch',
  'case_count_mismatch',
  'adapter_model_mismatch',
] as const;

export type HistoricalCompatibilityReason = (typeof HISTORICAL_COMPATIBILITY_REASON_ORDER)[number];

export const SUPPORTED_HISTORICAL_DELTA_FIELDS = [
  'catastrophicCount',
  'medianRelativeCalorieError',
  'p90RelativeCalorieError',
  'meanMacroRelativeError',
  'meanMealMassRelativeError',
  'meanMealCarbDensityRelativeError',
  'meanMealFatDensityRelativeError',
] as const;

export type SupportedHistoricalDeltaField = (typeof SUPPORTED_HISTORICAL_DELTA_FIELDS)[number];

const SUPPORTED_HISTORICAL_DELTA_FIELD_SET: ReadonlySet<string> = new Set(SUPPORTED_HISTORICAL_DELTA_FIELDS);

// The current adapter model is pinned to gemini-3.8-flash by design: the
// historical reference's own model (gemini-2.5-flash) is intentionally never
// compared against it, since that difference is the whole point of this
// comparison and not a compatibility failure.
const EXPECTED_CURRENT_ADAPTER_MODEL_ID = 'gemini-3.8-flash';

export type HistoricalReferenceErrorCode =
  | 'unsupported_delta_field'
  | 'historical_reference_invalid'
  | 'current_metric_unavailable';

export class HistoricalReferenceError extends Error {
  readonly code: HistoricalReferenceErrorCode;

  constructor(code: HistoricalReferenceErrorCode, message: string) {
    super(message);
    this.name = 'HistoricalReferenceError';
    this.code = code;
  }
}

function assertSupportedDeltaFields(
  requestedFields: readonly string[],
): asserts requestedFields is readonly SupportedHistoricalDeltaField[] {
  for (const field of requestedFields) {
    if (!SUPPORTED_HISTORICAL_DELTA_FIELD_SET.has(field)) {
      throw new HistoricalReferenceError(
        'unsupported_delta_field',
        `unsupported historical delta field requested: ${field}`,
      );
    }
  }
}

function historicalCompatibilityReasons(
  reference: HistoricalReference,
  current: NutritionEvalReport,
): HistoricalCompatibilityReason[] {
  const reasons: HistoricalCompatibilityReason[] = [];
  if (current.datasetId !== reference.datasetId) reasons.push('dataset_id_mismatch');
  if (current.datasetHash !== reference.datasetHash) reasons.push('dataset_hash_mismatch');
  if (current.promptHash !== reference.promptHash) reasons.push('prompt_hash_mismatch');
  if (current.samples !== reference.samples) reasons.push('samples_mismatch');
  if (current.publicCases !== reference.publicCases) reasons.push('public_cases_mismatch');
  if (current.privateCases !== reference.privateCases) reasons.push('private_cases_mismatch');
  if (
    current.summary.totalCases !== reference.coverage.totalCases
    || current.summary.runCases !== reference.coverage.runCases
  ) {
    reasons.push('case_count_mismatch');
  }
  if (current.adapterModelId !== EXPECTED_CURRENT_ADAPTER_MODEL_ID) reasons.push('adapter_model_mismatch');
  return reasons;
}

function currentMetricValue(
  field: SupportedHistoricalDeltaField,
  current: NutritionEvalReport,
): number | undefined {
  if (field === 'catastrophicCount') return current.summary.catastrophicCount;
  return current.summary[field];
}

function referenceMetricValue(
  field: SupportedHistoricalDeltaField,
  reference: HistoricalReference,
): number {
  if (field === 'catastrophicCount') return reference.coverage.catastrophicCount;
  return reference.metrics[field];
}

export interface HistoricalComparisonResult {
  readonly referenceRunId: string;
  readonly referenceCodeSha: string;
  readonly referenceModel: string;
  readonly currentAdapterModelId: string;
  readonly compatible: boolean;
  readonly compatibilityReason?: HistoricalCompatibilityReason;
  readonly compatibilityReasons: readonly HistoricalCompatibilityReason[];
  readonly deltas?: Partial<Record<SupportedHistoricalDeltaField, number>>;
}

/**
 * Compares a current report against the frozen historical aggregate. Deltas
 * are computed only for explicitly requested, explicitly supported fields
 * (defaulting to all seven), and only when the reports are compatible; an
 * unsupported requested field always fails closed regardless of
 * compatibility. For a compatible report, an unavailable current metric
 * fails closed with `current_metric_unavailable` naming the field, rather
 * than silently omitting it from the returned deltas.
 */
export function compareToHistoricalReference(
  reference: HistoricalReference,
  current: NutritionEvalReport,
  requestedFields: readonly string[] = SUPPORTED_HISTORICAL_DELTA_FIELDS,
): HistoricalComparisonResult {
  assertSupportedDeltaFields(requestedFields);

  const reasons = historicalCompatibilityReasons(reference, current);
  const compatible = reasons.length === 0;

  if (!compatible) {
    return {
      referenceRunId: reference.runId,
      referenceCodeSha: reference.codeSha,
      referenceModel: reference.model,
      currentAdapterModelId: current.adapterModelId,
      compatible: false,
      compatibilityReason: reasons[0]!,
      compatibilityReasons: reasons,
    };
  }

  const deltas: Partial<Record<SupportedHistoricalDeltaField, number>> = {};
  for (const field of requestedFields) {
    const value = currentMetricValue(field, current);
    if (value === undefined) {
      throw new HistoricalReferenceError(
        'current_metric_unavailable',
        `current metric unavailable for requested historical delta field: ${field}`,
      );
    }
    deltas[field] = value - referenceMetricValue(field, reference);
  }

  return {
    referenceRunId: reference.runId,
    referenceCodeSha: reference.codeSha,
    referenceModel: reference.model,
    currentAdapterModelId: current.adapterModelId,
    compatible: true,
    compatibilityReasons: [],
    deltas,
  };
}

// ── Aggregate subset gate ────────────────────────────────────────────────────

export const HISTORICAL_AGGREGATE_SUBSET_GATE_THRESHOLDS: Record<SupportedHistoricalDeltaField, number> = {
  catastrophicCount: 12,
  medianRelativeCalorieError: 0.25,
  p90RelativeCalorieError: 0.90,
  meanMacroRelativeError: 0.45,
  meanMealMassRelativeError: 0.40,
  meanMealCarbDensityRelativeError: 0.70,
  meanMealFatDensityRelativeError: 0.35,
};

export interface HistoricalAggregateSubsetGate {
  /** Marks this as a subset check over historical-aggregate fields only, explicitly not a full promotion decision. */
  readonly kind: 'historical_aggregate_subset_gate';
  readonly passed: boolean;
  readonly compatible: boolean;
  readonly failures: readonly string[];
}

/**
 * Evaluates only the seven absolute thresholds derived from the historical
 * aggregate reference. This is a narrow subset gate, not the full benchmark
 * promotion decision (which also requires 60/60 parses, zero unsafe
 * completions, per-macro median gates, and vision-call accounting handled
 * elsewhere). The gate fails closed on any compatibility mismatch or any
 * undefined required current metric rather than silently shrinking scope.
 */
export function evaluateHistoricalAggregateSubsetGate(
  reference: HistoricalReference,
  current: NutritionEvalReport,
): HistoricalAggregateSubsetGate {
  const reasons = historicalCompatibilityReasons(reference, current);
  if (reasons.length > 0) {
    return {
      kind: 'historical_aggregate_subset_gate',
      passed: false,
      compatible: false,
      failures: reasons,
    };
  }

  const failures: string[] = [];
  for (const field of SUPPORTED_HISTORICAL_DELTA_FIELDS) {
    const value = currentMetricValue(field, current);
    if (value === undefined) {
      failures.push(`${field}_unavailable`);
      continue;
    }
    if (value > HISTORICAL_AGGREGATE_SUBSET_GATE_THRESHOLDS[field]) {
      failures.push(`${field}_exceeds_threshold`);
    }
  }

  return {
    kind: 'historical_aggregate_subset_gate',
    passed: failures.length === 0,
    compatible: true,
    failures,
  };
}
