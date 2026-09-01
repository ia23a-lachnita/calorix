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

export function parseNutritionEvalManifest(
  value: unknown,
): NutritionEvalManifest {
  return NutritionEvalManifestSchema.parse(value);
}
