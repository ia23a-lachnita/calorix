import { z } from 'zod';

// ── Enums ────────────────────────────────────────────────────────────────────

const ScanModeSchema = z.enum(['meal', 'barcode', 'label']);

const BasisSchema = z.enum(['portion', 'package', 'per100g']);

const UnitSchema = z.enum(['portion', 'g', 'ml']);

const FailureCategorySchema = z.enum([
  'dataset',
  'schema',
  'provider',
  'product',
  'runner',
]);

const ToleranceClassSchema = z.string().min(1);

// ── Shared nutrition vector ──────────────────────────────────────────────────

const NutritionVectorSchema = z.object({
  kcal: z.number().finite().nonnegative(),
  proteinG: z.number().finite().nonnegative(),
  carbsG: z.number().finite().nonnegative(),
  fatG: z.number().finite().nonnegative(),
});

const DiagnosticNutritionVectorSchema = z.strictObject({
  kcal: z.number().finite().nonnegative(),
  proteinG: z.number().finite().nonnegative(),
  carbsG: z.number().finite().nonnegative(),
  fatG: z.number().finite().nonnegative(),
});

const DiagnosticReferenceSchema = DiagnosticNutritionVectorSchema.extend({
  amount: z.number().finite().positive(),
  unit: z.enum(['g', 'ml']),
}).strict();

function diagnosticClose(left: number, right: number): boolean {
  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    return false;
  }

  return Math.abs(left - right) <= 1e-9 * Math.max(
    Math.abs(left),
    Math.abs(right),
    Number.MIN_VALUE,
  );
}

export function isCanonicalNutritionTuple(
  basis: 'portion' | 'package' | 'per100g' | undefined,
  amount: number | undefined,
  unit: 'portion' | 'g' | 'ml' | undefined,
): boolean {
  if (
    basis === undefined ||
    amount === undefined ||
    unit === undefined ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return false;
  }

  if (basis === 'portion') return amount === 1 && unit === 'portion';
  if (basis === 'per100g') return amount === 100 && (unit === 'g' || unit === 'ml');
  return unit === 'g' || unit === 'ml';
}

export type MealDominantDriver = 'mass_dominated' | 'density_dominated' | 'equal';

export function classifyMealDominantDriver(
  massRatioToTruth: number,
  kcalDensityRatioToTruth: number,
): MealDominantDriver {
  const massDeviation = Math.abs(massRatioToTruth - 1);
  const densityDeviation = Math.abs(kcalDensityRatioToTruth - 1);
  if (diagnosticClose(massDeviation, densityDeviation)) return 'equal';
  return massDeviation > densityDeviation ? 'mass_dominated' : 'density_dominated';
}

const DiagnosticMetricSchema = z.strictObject({
  predicted: z.number().finite().nonnegative(),
  truth: z.number().finite().nonnegative(),
  absoluteError: z.number().finite().nonnegative(),
  ratioToTruth: z.number().finite().nonnegative().optional(),
  relativeError: z.number().finite().nonnegative().optional(),
}).superRefine((metric, context) => {
  if (!diagnosticClose(metric.absoluteError, Math.abs(metric.predicted - metric.truth))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['absoluteError'], message: 'absolute error must match predicted and truth' });
  }

  const ratioToTruth = metric.ratioToTruth;
  const relativeError = metric.relativeError;
  const hasRatio = ratioToTruth !== undefined;
  const hasRelative = relativeError !== undefined;
  if (metric.truth === 0) {
    if (hasRatio || hasRelative) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'zero truth omits ratio metrics' });
    }
    return;
  }
  if (!hasRatio || !hasRelative) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'positive truth requires both ratio metrics' });
    return;
  }
  const ratio = metric.predicted / metric.truth;
  const relative = metric.absoluteError / metric.truth;
  if (
    !diagnosticClose(ratioToTruth, ratio) ||
    !diagnosticClose(relativeError, relative)
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'ratio metrics must match predicted and truth' });
  }
});

const DiagnosticMetricVectorSchema = z.strictObject({
  kcal: DiagnosticMetricSchema,
  proteinG: DiagnosticMetricSchema,
  carbsG: DiagnosticMetricSchema,
  fatG: DiagnosticMetricSchema,
});

const PredictionDiagnosticsSchema = z.strictObject({
  rawNutrients: DiagnosticNutritionVectorSchema.optional(),
  detectedItemCount: z.number().int().nonnegative().optional(),
  estimatedTotalMassG: z.number().finite().positive().optional(),
  declaredBasis: BasisSchema.optional(),
  declaredAmount: z.number().finite().positive().optional(),
  declaredUnit: UnitSchema.optional(),
  observedAmount: z.number().finite().positive().optional(),
  observedUnit: z.enum(['g', 'ml']).optional(),
  packageReference: DiagnosticReferenceSchema.optional(),
  per100Reference: DiagnosticReferenceSchema.optional(),
  servingReference: DiagnosticReferenceSchema.optional(),
}).superRefine((diagnostics, context) => {
  const declared = [diagnostics.declaredBasis, diagnostics.declaredAmount, diagnostics.declaredUnit];
  if (declared.some((value) => value === undefined) && declared.some((value) => value !== undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'declared nutrition tuple is all-or-none' });
  } else if (
    diagnostics.declaredBasis !== undefined &&
    !isCanonicalNutritionTuple(
      diagnostics.declaredBasis,
      diagnostics.declaredAmount,
      diagnostics.declaredUnit,
    )
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'declared nutrition tuple must be canonical' });
  }

  const observed = [diagnostics.observedAmount, diagnostics.observedUnit];
  if (observed.some((value) => value === undefined) && observed.some((value) => value !== undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'observed package tuple is all-or-none' });
  }

  if (diagnostics.estimatedTotalMassG !== undefined && diagnostics.detectedItemCount === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['estimatedTotalMassG'], message: 'estimated mass requires detected item count' });
  }
  if (diagnostics.detectedItemCount === 0 && diagnostics.estimatedTotalMassG !== undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['estimatedTotalMassG'], message: 'empty detection has no estimated mass' });
  }
});

const CaseDiagnosticsSchema = z.strictObject({
  mealMassG: DiagnosticMetricSchema.optional(),
  mealDensityPer100: DiagnosticMetricVectorSchema.optional(),
  mealDominantDriver: z.enum(['mass_dominated', 'density_dominated', 'equal']).optional(),
  labelPer100: DiagnosticMetricVectorSchema.optional(),
}).refine((diagnostics) => Object.values(diagnostics).some((value) => value !== undefined), {
  message: 'case diagnostics cannot be empty',
});

// ── Source ───────────────────────────────────────────────────────────────────

const CaseSourceSchema = z.object({
  dataset: z.string().min(1),
  objectId: z.string().min(1),
});

// ── Image ────────────────────────────────────────────────────────────────────

const PublicImageSchema = z
  .strictObject({
    url: z.string().url().regex(/^https:\/\//, 'public image URL must be https'),
    sha256: z
      .string()
      .length(64)
      .regex(/^[0-9a-f]{64}$/),
    mediaType: z.enum(['image/png', 'image/jpeg']),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .refine((img) => !('path' in img), {
    message: 'public image must not contain a path field',
  });

const PrivateImageSchema = z
  .strictObject({
    path: z
      .string()
      .min(1)
      .refine((p) => !p.startsWith('/'), {
        message: 'private image path must be relative',
      })
      .refine((p) => !p.startsWith('file://'), {
        message: 'private image path must not be a file URL',
      })
      .refine((p) => !p.includes('..'), {
        message: 'private image path must not contain parent traversal',
      }),
    sha256: z
      .string()
      .length(64)
      .regex(/^[0-9a-f]{64}$/),
    mediaType: z.enum(['image/png', 'image/jpeg']),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .refine((img) => !('url' in img), {
    message: 'private image must not contain a url field',
  });

const CaseImageSchema = z.union([PublicImageSchema, PrivateImageSchema]);

// ── Truth ────────────────────────────────────────────────────────────────────

const NutritionTruthSchema = NutritionVectorSchema.extend({
  basis: BasisSchema,
  amount: z.number().positive(),
  unit: UnitSchema,
  referenceMassG: z.number().finite().positive().optional(),
});

// ── Prediction ───────────────────────────────────────────────────────────────

const ReviewReasonSchema = z.enum([
  'package_quantity_missing',
  'package_unit_unsupported',
  'barcode_unconfirmed',
  'nutrition_basis_ambiguous',
  'nutrition_arithmetic_mismatch',
  'atwater_mismatch',
  'model_schema_invalid',
]);

const VisionResponseFieldNames = [
  'name',
  'kcal',
  'proteinG',
  'carbsG',
  'fatG',
  'confidence',
  'candidates',
  'barcode',
  'detectedItems',
  'boundingBox',
  'nutritionBasis',
  'nutritionAmount',
  'nutritionUnit',
  'observedPackageAmount',
  'observedPackageUnit',
  'packageReference',
  'per100Reference',
  'servingReference',
] as const;

const NutritionReferenceFieldNames = [
  'kcal',
  'proteinG',
  'carbsG',
  'fatG',
  'amount',
  'unit',
] as const;

const CandidateFieldNames = [
  'name',
  'confidence',
  'kcal',
  'proteinG',
  'carbsG',
  'fatG',
] as const;

const BoundingBoxFieldNames = ['x', 'y', 'width', 'height'] as const;

const topLevelPath = new Set<string>(VisionResponseFieldNames);
const referenceFieldPath = new Set<string>(NutritionReferenceFieldNames);
const candidateFieldPath = new Set<string>(CandidateFieldNames);
const boundingBoxFieldPath = new Set<string>(BoundingBoxFieldNames);

function isSafeParserFailureDetail(value: string): boolean {
  if (value === 'no_json_object_in_response' || value === 'invalid_json') return true;
  if (!value.startsWith('schema_violation:')) return false;

  const path = value.slice('schema_violation:'.length);
  if (path === '(root)') return true;
  if (topLevelPath.has(path)) return true;

  const referenceMatch = /^(packageReference|per100Reference|servingReference)\.([A-Za-z0-9]+)$/.exec(path);
  if (referenceMatch) return referenceFieldPath.has(referenceMatch[2]!);

  const candidateMatch = /^candidates\.(0|[1-9]\d*)(?:\.([A-Za-z0-9]+))?$/.exec(path);
  if (candidateMatch) return candidateMatch[2] === undefined || candidateFieldPath.has(candidateMatch[2]);

  const detectedItemMatch = /^detectedItems\.(0|[1-9]\d*)(?:\.(name|weight))?$/.exec(path);
  if (detectedItemMatch) return true;

  const boundingBoxMatch = /^boundingBox\.([A-Za-z0-9]+)$/.exec(path);
  return boundingBoxMatch !== null && boundingBoxFieldPath.has(boundingBoxMatch[1]!);
}

const FailureDetailSchema = z.string().refine(isSafeParserFailureDetail, {
  message: 'failure detail must be an allowlisted parser diagnostic',
});

export const NutritionPredictionSchema = z.object({
  parseStatus: z.enum(['success', 'failure']),
  source: ScanModeSchema,
  kcal: z.number().finite().nonnegative().optional(),
  proteinG: z.number().finite().nonnegative().optional(),
  carbsG: z.number().finite().nonnegative().optional(),
  fatG: z.number().finite().nonnegative().optional(),
  confidence: z.number().finite().nonnegative().optional(),
  basis: BasisSchema.optional(),
  amount: z.number().positive().optional(),
  unit: UnitSchema.optional(),
  barcode: z.string().optional(),
  decision: z.enum(['complete', 'needs_review', 'error']).optional(),
  reviewReasons: z.array(ReviewReasonSchema).optional(),
  failureCategory: FailureCategorySchema.optional(),
  failureCode: z.string().optional(),
  failureDetail: FailureDetailSchema.optional(),
  latencyMs: z.number().finite().nonnegative().optional(),
  sampleIndex: z.number().int().positive().optional(),
  cached: z.boolean().optional(),
  diagnostics: PredictionDiagnosticsSchema.optional(),
}).superRefine((prediction, context) => {
  if (prediction.failureDetail !== undefined && (
    prediction.parseStatus !== 'failure' ||
    prediction.failureCategory !== 'schema' ||
    prediction.failureCode !== 'model_response_invalid'
  )) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['failureDetail'],
      message: 'failure detail is reserved for model response parser failures',
    });
  }
});

// ── Case ─────────────────────────────────────────────────────────────────────

const EvalCaseSchema = z
  .object({
    id: z.string().min(1),
    visibility: z.enum(['public', 'private']),
    scanMode: ScanModeSchema,
    source: CaseSourceSchema,
    image: CaseImageSchema,
    truth: NutritionTruthSchema,
    toleranceClass: ToleranceClassSchema,
    attributionId: z.string().min(1),
    expectedBarcode: z.string().regex(/^\d{8,14}$/, 'barcode must be 8-14 digits').optional(),
    suppliedBarcode: z.string().regex(/^\d{8,14}$/, 'barcode must be 8-14 digits').optional(),
    expectedDecision: z.enum(['complete', 'needs_review']).optional(),
    packageUnitCount: z.number().int().positive().optional(),
    unitAmount: z.number().finite().positive().optional(),
  })
  .refine(
    (c) => {
      if (c.visibility === 'public') {
        return 'url' in c.image && !('path' in c.image);
      }
      return 'path' in c.image && !('url' in c.image);
    },
    'public cases must include a url and no path in image; private cases must include a path and no url in image',
  );

// ── Numeric metric ───────────────────────────────────────────────────────────

const NumericMetricSchema = z.object({
  ratioToTruth: z.number().finite().nonnegative(),
  absoluteError: z.number().finite().nonnegative(),
  relativeError: z.number().finite().nonnegative(),
});

// ── Case result ──────────────────────────────────────────────────────────────

export const CALIBRATION_PROTOCOL_VERSION = 'calorix-gemini-38-calibration-v1' as const;

const CalibrationThinkingLevelSchema = z.enum(['LOW', 'MEDIUM']);

const CalibrationStageSchema = z.enum(['preflight', 'development', 'validation', 'benchmark']);

export const CalibrationInfoSchema = z.object({
  protocolVersion: z.literal(CALIBRATION_PROTOCOL_VERSION),
  project: z.string().min(1),
  location: z.string().min(1),
  model: z.string().min(1),
  thinkingLevel: CalibrationThinkingLevelSchema,
  schemaHash: z.string().regex(/^[0-9a-f]{64}$/),
  stage: CalibrationStageSchema,
  imageCallsReserved: z.number().int().nonnegative().max(300),
  imageCallsCompleted: z.number().int().nonnegative(),
  imageCallsFailed: z.number().int().nonnegative(),
});

const ZeroSafeSummaryFields = {
  medianProteinRelativeError: z.number().finite().nonnegative().optional(),
  medianCarbsRelativeError: z.number().finite().nonnegative().optional(),
  medianFatRelativeError: z.number().finite().nonnegative().optional(),
  meanZeroSafeMacroRelativeError: z.number().finite().nonnegative().optional(),
  zeroSafeEligiblePairs: z.number().int().nonnegative().optional(),
  proteinEligibleCount: z.number().int().nonnegative().optional(),
  carbsEligibleCount: z.number().int().nonnegative().optional(),
  fatEligibleCount: z.number().int().nonnegative().optional(),
  proteinZeroTruthCount: z.number().int().nonnegative().optional(),
  carbsZeroTruthCount: z.number().int().nonnegative().optional(),
  fatZeroTruthCount: z.number().int().nonnegative().optional(),
  proteinZeroTruthMeanAbsoluteError: z.number().finite().nonnegative().optional(),
  proteinZeroTruthMedianAbsoluteError: z.number().finite().nonnegative().optional(),
  carbsZeroTruthMeanAbsoluteError: z.number().finite().nonnegative().optional(),
  carbsZeroTruthMedianAbsoluteError: z.number().finite().nonnegative().optional(),
  fatZeroTruthMeanAbsoluteError: z.number().finite().nonnegative().optional(),
  fatZeroTruthMedianAbsoluteError: z.number().finite().nonnegative().optional(),
  meanMealMassRelativeError: z.number().finite().nonnegative().optional(),
  medianMealMassRelativeError: z.number().finite().nonnegative().optional(),
  mealMassEligibleCount: z.number().int().nonnegative().optional(),
  parsedMealCount: z.number().int().nonnegative().optional(),
  meanMealCarbDensityRelativeError: z.number().finite().nonnegative().optional(),
  meanMealFatDensityRelativeError: z.number().finite().nonnegative().optional(),
  mealCarbDensityEligibleCount: z.number().int().nonnegative().optional(),
  mealFatDensityEligibleCount: z.number().int().nonnegative().optional(),
  mealDensityCoverageCount: z.number().int().nonnegative().optional(),
};

const REQUIRED_ZERO_SAFE_SUMMARY_KEYS = [
  'zeroSafeEligiblePairs',
  'proteinEligibleCount',
  'carbsEligibleCount',
  'fatEligibleCount',
  'proteinZeroTruthCount',
  'carbsZeroTruthCount',
  'fatZeroTruthCount',
  'mealMassEligibleCount',
  'parsedMealCount',
  'mealCarbDensityEligibleCount',
  'mealFatDensityEligibleCount',
  'mealDensityCoverageCount',
] as const;

export const NutritionCaseResultSchema = z.object({
  caseId: z.string(),
  prediction: NutritionPredictionSchema,
  truth: NutritionTruthSchema.optional(),
  numeric: z.object({
    kcal: NumericMetricSchema.optional(),
    proteinG: NumericMetricSchema.optional(),
    carbsG: NumericMetricSchema.optional(),
    fatG: NumericMetricSchema.optional(),
  }),
  safety: z.object({
    catastrophicCalorieMiss: z.boolean(),
    unsafeCompletion: z.boolean(),
  }),
  booleans: z.object({
    barcodeExactMatch: z.boolean().optional(),
    basisExactMatch: z.boolean().optional(),
    unitExactMatch: z.boolean().optional(),
  }),
  diagnostics: CaseDiagnosticsSchema.optional(),
}).superRefine((result, context) => {
  const diagnostics = result.diagnostics;
  if (!diagnostics) return;

  const hasMealMass = diagnostics.mealMassG !== undefined;
  const hasMealDensity = diagnostics.mealDensityPer100 !== undefined;
  if (hasMealMass !== hasMealDensity) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['diagnostics'], message: 'meal diagnostics require mass and density together' });
  }
  const massRatio = diagnostics.mealMassG?.ratioToTruth;
  const densityRatio = diagnostics.mealDensityPer100?.kcal.ratioToTruth;
  const hasBothMealRatios = massRatio !== undefined && densityRatio !== undefined;
  if (hasBothMealRatios && diagnostics.mealDominantDriver === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['diagnostics', 'mealDominantDriver'], message: 'meal driver is required when mass and kcal density ratios are present' });
  } else if (!hasBothMealRatios && diagnostics.mealDominantDriver !== undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['diagnostics', 'mealDominantDriver'], message: 'meal driver requires mass and kcal density ratios' });
  } else if (
    hasBothMealRatios &&
    diagnostics.mealDominantDriver !== classifyMealDominantDriver(massRatio, densityRatio)
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['diagnostics', 'mealDominantDriver'], message: 'meal driver must match mass and kcal density deviations' });
  }
  if (result.prediction.source !== 'meal' && (hasMealMass || hasMealDensity || diagnostics.mealDominantDriver !== undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['diagnostics'], message: 'meal diagnostics require a meal prediction source' });
  }
  if (result.prediction.source !== 'label' && diagnostics.labelPer100 !== undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['diagnostics', 'labelPer100'], message: 'label diagnostics require a label prediction source' });
  }
});

// ── Aggregate report ─────────────────────────────────────────────────────────

const CompatibilityReasonSchema = z.enum([
  'dataset_id_mismatch',
  'dataset_hash_mismatch',
  'case_count_mismatch',
  'public_cases_mismatch',
  'private_coverage_unsupported',
  'samples_mismatch',
  'prompt_hash_mismatch',
  'model_mismatch',
]);

export const BASELINE_COMPATIBILITY_REASON_ORDER = [
  'dataset_id_mismatch',
  'dataset_hash_mismatch',
  'case_count_mismatch',
  'public_cases_mismatch',
  'private_coverage_unsupported',
  'samples_mismatch',
  'prompt_hash_mismatch',
  'model_mismatch',
] as const;

const BaselineDeltasSchema = z.object({
  parseRate: z.number().finite(),
  medianAbsoluteCalorieError: z.number().finite(),
  medianRelativeCalorieError: z.number().finite(),
  p90AbsoluteCalorieError: z.number().finite(),
  p90RelativeCalorieError: z.number().finite(),
  meanMacroRelativeError: z.number().finite(),
  reviewRate: z.number().finite(),
  catastrophicCount: z.number().int(),
  unsafeCompletionCount: z.number().int(),
});

export const BaselineComparisonSchema = z.object({
  baselineRunId: z.string().trim().min(1),
  baselineTimestamp: z.string().datetime({ offset: true }).optional(),
  baselineCodeSha: z.string().trim().min(1).optional(),
  baselinePromptHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  baselineModelId: z.string().trim().min(1).optional(),
  compatible: z.boolean(),
  compatibilityReason: CompatibilityReasonSchema.optional(),
  compatibilityReasons: z.array(CompatibilityReasonSchema),
  deltas: BaselineDeltasSchema.optional(),
}).superRefine((comparison, context) => {
  const reasons = comparison.compatibilityReasons;
  const indexes = reasons.map((reason) => BASELINE_COMPATIBILITY_REASON_ORDER.indexOf(reason));
  const ordered = indexes.every((index, position) => position === 0 || index > indexes[position - 1]!);
  if (!ordered) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['compatibilityReasons'], message: 'compatibility reasons must be canonical and unique' });
  }
  if (comparison.compatible) {
    if (reasons.length !== 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['compatibilityReasons'], message: 'compatible comparison has no mismatch reasons' });
    }
    if (comparison.compatibilityReason !== undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['compatibilityReason'], message: 'compatible comparison has no primary mismatch reason' });
    }
    if (comparison.deltas === undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['deltas'], message: 'compatible comparison requires complete deltas' });
    }
    return;
  }
  if (reasons.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['compatibilityReasons'], message: 'incompatible comparison requires mismatch reasons' });
  }
  if (comparison.compatibilityReason !== reasons[0]) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['compatibilityReason'], message: 'primary mismatch reason must be first' });
  }
  if (comparison.deltas !== undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['deltas'], message: 'incompatible comparison cannot include deltas' });
  }
});

function inferHistoricalVisibilityCounts(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  if (record['publicCases'] !== undefined || record['privateCases'] !== undefined) return value;
  if (record['calibration'] !== undefined) return value;
  const cases = record['cases'];
  const samples = record['samples'];
  if (!Array.isArray(cases)) return value;
  if (typeof samples !== 'number' || !Number.isInteger(samples) || samples <= 0) return value;
  if (cases.length % samples !== 0) return value;
  return { ...record, publicCases: cases.length / samples, privateCases: 0 };
}

export const NutritionEvalReportSchema = z.preprocess(inferHistoricalVisibilityCounts, z.object({
  version: z.literal(1),
  runId: z.string().trim().min(1),
  timestamp: z.string().datetime({ offset: true }),
  datasetId: z.string().trim().min(1),
  datasetHash: z.string().regex(/^[0-9a-f]{64}$/),
  adapterModelId: z.string().trim().min(1),
  promptHash: z.string().regex(/^[0-9a-f]{64}$/),
  codeSha: z.string().trim().min(1),
  samples: z.number().int().min(1).max(10),
  baselineOnly: z.boolean(),
  publicCases: z.number().int().nonnegative(),
  privateCases: z.number().int().nonnegative(),
  comparison: BaselineComparisonSchema.optional(),
  calibration: CalibrationInfoSchema.optional(),
  summary: z.object({
    totalCases: z.number().int().nonnegative(),
    runCases: z.number().int().nonnegative(),
    parseCases: z.number().int().nonnegative(),
    basisAccuracyDenom: z.number().int().nonnegative(),
    barcodeAccuracyDenom: z.number().int().nonnegative(),
    medianAbsoluteCalorieError: z.number().nonnegative(),
    medianRelativeCalorieError: z.number().nonnegative(),
    p90AbsoluteCalorieError: z.number().nonnegative(),
    p90RelativeCalorieError: z.number().nonnegative(),
    meanMacroRelativeError: z.number().nonnegative(),
    reviewRate: z.number().nonnegative(),
    catastrophicCount: z.number().int().nonnegative(),
    unsafeCompletionCount: z.number().int().nonnegative(),
    failuresByCategory: z.record(FailureCategorySchema, z.number().int().nonnegative()),
    failuresByCode: z.record(z.string(), z.number().int().nonnegative()),
    latencyMs: z.object({
      min: z.number().finite().nonnegative(),
      max: z.number().finite().nonnegative(),
      median: z.number().finite().nonnegative(),
      p90: z.number().finite().nonnegative(),
    }).optional(),
    ...ZeroSafeSummaryFields,
  }),
  cases: z.array(NutritionCaseResultSchema),
}).superRefine((report, context) => {
  const caseCount = report.cases.length;
  if (report.summary.totalCases !== caseCount) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['summary', 'totalCases'], message: 'total cases must equal serialized cases' });
  }
  if (report.summary.runCases !== caseCount) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['summary', 'runCases'], message: 'run cases must equal serialized cases' });
  }
  if (caseCount !== (report.publicCases + report.privateCases) * report.samples) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['cases'], message: 'serialized cases must equal visibility coverage times samples' });
  }
  if (report.summary.parseCases > report.summary.runCases) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['summary', 'parseCases'], message: 'parse cases cannot exceed run cases' });
  }
  const calibration = report.calibration;
  if (calibration?.protocolVersion !== CALIBRATION_PROTOCOL_VERSION) return;
  if (calibration.project !== 'calorix-xurschnell') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['calibration', 'project'], message: 'calibration project must be calorix-xurschnell' });
  }
  if (calibration.location !== 'us') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['calibration', 'location'], message: 'calibration location must be us' });
  }
  if (calibration.model !== 'gemini-3.8-flash') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['calibration', 'model'], message: 'calibration model must be gemini-3.8-flash' });
  }
  if (report.adapterModelId !== calibration.model) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['adapterModelId'], message: 'adapterModelId must equal calibration.model' });
  }
  if (calibration.imageCallsCompleted + calibration.imageCallsFailed > calibration.imageCallsReserved) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['calibration', 'imageCallsCompleted'], message: 'completed + failed cannot exceed reserved' });
  }
  if (calibration.imageCallsReserved > report.summary.runCases) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['calibration', 'imageCallsReserved'], message: 'reserved cannot exceed runCases' });
  }
  const s = report.summary;

  // Zero-safe count fields are required (not merely optional) in calibration
  // reports; missing counts are flagged here, and a type-safe local record is
  // used below so subsequent arithmetic never sees `number | undefined`.
  const zeroSafeCounts = Object.fromEntries(
    REQUIRED_ZERO_SAFE_SUMMARY_KEYS.map((key) => {
      const value = s[key];
      if (value === undefined) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['summary', key], message: `${key} is required in calibration reports` });
      }
      return [key, value ?? 0];
    }),
  ) as Record<(typeof REQUIRED_ZERO_SAFE_SUMMARY_KEYS)[number], number>;

  const {
    zeroSafeEligiblePairs,
    proteinEligibleCount,
    carbsEligibleCount,
    fatEligibleCount,
    proteinZeroTruthCount,
    carbsZeroTruthCount,
    fatZeroTruthCount,
    mealMassEligibleCount,
    parsedMealCount,
    mealCarbDensityEligibleCount,
    mealFatDensityEligibleCount,
    mealDensityCoverageCount,
  } = zeroSafeCounts;

  if (zeroSafeEligiblePairs !== proteinEligibleCount + carbsEligibleCount + fatEligibleCount) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['summary', 'zeroSafeEligiblePairs'], message: 'zeroSafeEligiblePairs must equal the sum of per-macro eligible counts' });
  }
  if (proteinEligibleCount + proteinZeroTruthCount > s.parseCases) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['summary', 'proteinEligibleCount'], message: 'macro eligible + zeroTruth cannot exceed parseCases' });
  }
  if (carbsEligibleCount + carbsZeroTruthCount > s.parseCases) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['summary', 'carbsEligibleCount'], message: 'macro eligible + zeroTruth cannot exceed parseCases' });
  }
  if (fatEligibleCount + fatZeroTruthCount > s.parseCases) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['summary', 'fatEligibleCount'], message: 'macro eligible + zeroTruth cannot exceed parseCases' });
  }
  if (mealMassEligibleCount > parsedMealCount) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['summary', 'mealMassEligibleCount'], message: 'mealMassEligibleCount cannot exceed parsedMealCount' });
  }
  if (parsedMealCount > s.parseCases) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['summary', 'parsedMealCount'], message: 'parsedMealCount cannot exceed parseCases' });
  }
  if (mealCarbDensityEligibleCount > mealDensityCoverageCount) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['summary', 'mealCarbDensityEligibleCount'], message: 'density eligible cannot exceed coverage' });
  }
  if (mealFatDensityEligibleCount > mealDensityCoverageCount) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['summary', 'mealFatDensityEligibleCount'], message: 'density eligible cannot exceed coverage' });
  }
  if (mealDensityCoverageCount > parsedMealCount) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['summary', 'mealDensityCoverageCount'], message: 'coverage cannot exceed parsedMealCount' });
  }
  for (const [index, result] of report.cases.entries()) {
    if (result.truth === undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['cases', index, 'truth'], message: 'calibration cases require truth' });
    }
  }
  const conditionalMetricPairs: Array<[string, string, number]> = [
    ['medianProteinRelativeError', 'proteinEligibleCount', proteinEligibleCount],
    ['medianCarbsRelativeError', 'carbsEligibleCount', carbsEligibleCount],
    ['medianFatRelativeError', 'fatEligibleCount', fatEligibleCount],
    ['meanZeroSafeMacroRelativeError', 'zeroSafeEligiblePairs', zeroSafeEligiblePairs],
    ['proteinZeroTruthMeanAbsoluteError', 'proteinZeroTruthCount', proteinZeroTruthCount],
    ['proteinZeroTruthMedianAbsoluteError', 'proteinZeroTruthCount', proteinZeroTruthCount],
    ['carbsZeroTruthMeanAbsoluteError', 'carbsZeroTruthCount', carbsZeroTruthCount],
    ['carbsZeroTruthMedianAbsoluteError', 'carbsZeroTruthCount', carbsZeroTruthCount],
    ['fatZeroTruthMeanAbsoluteError', 'fatZeroTruthCount', fatZeroTruthCount],
    ['fatZeroTruthMedianAbsoluteError', 'fatZeroTruthCount', fatZeroTruthCount],
    ['meanMealMassRelativeError', 'mealMassEligibleCount', mealMassEligibleCount],
    ['medianMealMassRelativeError', 'mealMassEligibleCount', mealMassEligibleCount],
    ['meanMealCarbDensityRelativeError', 'mealCarbDensityEligibleCount', mealCarbDensityEligibleCount],
    ['meanMealFatDensityRelativeError', 'mealFatDensityEligibleCount', mealFatDensityEligibleCount],
  ];
  for (const [metric, countKey, count] of conditionalMetricPairs) {
    if (count === 0 && report.summary[metric as keyof typeof report.summary] !== undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['summary', metric], message: `${metric} must be absent when ${countKey} is zero` });
    }
    if (count > 0 && report.summary[metric as keyof typeof report.summary] === undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['summary', metric], message: `${metric} is required when ${countKey} is positive` });
    }
  }
}));

// ── Manifest ─────────────────────────────────────────────────────────────────

export const NutritionEvalManifestSchema = z
  .object({
    version: z.literal(1),
    datasetId: z.string().min(1),
    cases: z.array(EvalCaseSchema).min(1),
  })
  .refine(
    (m) => {
      const ids = m.cases.map((c) => c.id);
      return ids.length === new Set(ids).size;
    },
    { message: 'duplicate case IDs' },
  );

// ── Public API ───────────────────────────────────────────────────────────────

export type NutritionEvalManifest = z.infer<typeof NutritionEvalManifestSchema>;
export type NutritionEvalCase = z.infer<typeof EvalCaseSchema>;
export type NutritionEvalImage = z.infer<typeof CaseImageSchema>;
export type NutritionTruth = z.infer<typeof NutritionTruthSchema>;
export type NutritionPrediction = z.infer<typeof NutritionPredictionSchema>;
export type NutritionCaseResult = z.infer<typeof NutritionCaseResultSchema>;
export type NutritionEvalReport = z.infer<typeof NutritionEvalReportSchema>;
export type BaselineComparison = z.infer<typeof BaselineComparisonSchema>;
export type BaselineDeltas = z.infer<typeof BaselineDeltasSchema>;
export type CalibrationInfo = z.infer<typeof CalibrationInfoSchema>;
export type CalibrationStage = CalibrationInfo['stage'];
export type CalibrationThinkingLevel = CalibrationInfo['thinkingLevel'];

export function parseNutritionEvalManifest(
  value: unknown,
): NutritionEvalManifest {
  return NutritionEvalManifestSchema.parse(value);
}
