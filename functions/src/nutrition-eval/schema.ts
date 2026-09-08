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
  latencyMs: z.number().finite().nonnegative().optional(),
  sampleIndex: z.number().int().positive().optional(),
  cached: z.boolean().optional(),
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

export const NutritionCaseResultSchema = z.object({
  caseId: z.string(),
  prediction: NutritionPredictionSchema,
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

export const NutritionEvalReportSchema = z.object({
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
});

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

export function parseNutritionEvalManifest(
  value: unknown,
): NutritionEvalManifest {
  return NutritionEvalManifestSchema.parse(value);
}
