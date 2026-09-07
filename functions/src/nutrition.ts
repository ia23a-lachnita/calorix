import { z } from 'zod';
import {
  atwaterMismatch,
  orderedReviewReasons,
  type NutritionDraft,
  type NutritionReference,
  type NutritionUnit,
  type ReviewReason,
} from './nutrition-contract';

export type AnalysisSource = 'meal' | 'barcode' | 'label';

const finiteNonNegative = z.number().finite().nonnegative();
const finitePositive = z.number().finite().positive();
const packageUnitSchema = z.enum(['g', 'ml']);
const nutritionUnitSchema = z.enum(['portion', 'g', 'ml']);
const barcodeSchema = z.string().regex(/^\d{8,14}$/);

export const ReviewCandidateSchema = z.object({
  name: z.string().min(1).max(500),
  confidence: z.number().finite().min(0).max(1),
  kcal: finiteNonNegative,
  proteinG: finiteNonNegative,
  carbsG: finiteNonNegative,
  fatG: finiteNonNegative,
}).strict();

const NutritionReferenceSchema = z.object({
  kcal: finiteNonNegative,
  proteinG: finiteNonNegative,
  carbsG: finiteNonNegative,
  fatG: finiteNonNegative,
  amount: finitePositive,
  unit: packageUnitSchema,
}).strict();

const detectedItemSchema = z.object({
  name: z.string().min(1).max(500),
  weight: finiteNonNegative,
}).strict();

const boundingBoxSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: finiteNonNegative,
  height: finiteNonNegative,
}).strict().nullable();

const visionResponseSchema = z.object({
  name: z.string().min(1).max(500),
  kcal: finiteNonNegative,
  proteinG: finiteNonNegative,
  carbsG: finiteNonNegative,
  fatG: finiteNonNegative,
  confidence: z.number().finite().min(0).max(1),
  candidates: z.array(ReviewCandidateSchema),
  barcode: barcodeSchema.nullable(),
  detectedItems: z.array(detectedItemSchema),
  boundingBox: boundingBoxSchema,
  nutritionBasis: z.enum(['portion', 'package', 'per100g']),
  nutritionAmount: finitePositive,
  nutritionUnit: nutritionUnitSchema,
  observedPackageAmount: finitePositive.optional(),
  observedPackageUnit: packageUnitSchema.optional(),
  packageReference: NutritionReferenceSchema.optional(),
  per100Reference: NutritionReferenceSchema.optional(),
  servingReference: NutritionReferenceSchema.optional(),
}).strict();

type VisionResponse = z.infer<typeof visionResponseSchema>;

export type ReviewCandidate = z.infer<typeof ReviewCandidateSchema>;

export interface AnalysisResult {
  name: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  confidence: number;
  atwaterKcal: number;
  candidates: ReviewCandidate[];
  source: AnalysisSource;
  nutritionBasis: 'portion' | 'package' | 'per100g';
  nutritionAmount: number;
  nutritionUnit: 'portion' | 'g' | 'ml';
  /** Legacy type-only compatibility; parsed values never populate this field. */
  barcode?: string;
  modelBarcode?: string;
  observedPackageAmount?: number;
  observedPackageUnit?: Extract<NutritionUnit, 'g' | 'ml'>;
  packageReference?: NutritionReference;
  per100Reference?: NutritionReference;
  servingReference?: NutritionReference;
  detectedItems: { name: string; weight: number }[];
  boundingBox: { x: number; y: number; width: number; height: number } | null;
}

export function atwaterKcal(proteinG: number, carbsG: number, fatG: number): number {
  return Math.round(4 * proteinG + 4 * carbsG + 9 * fatG);
}

export interface NutritionParseFailure {
  ok: false;
  reason: string;
}

export interface NutritionParseSuccess {
  ok: true;
  result: AnalysisResult;
}

export type NutritionParseOutcome = NutritionParseSuccess | NutritionParseFailure;

function packageTolerance(declared: number, observed: number): boolean {
  return Math.abs(declared - observed) <= Math.max(1, 0.01 * Math.max(declared, observed));
}

function sameVector(left: NutritionReference, right: NutritionReference): boolean {
  return ['kcal', 'proteinG', 'carbsG', 'fatG'].every((key) => {
    const a = left[key as keyof NutritionReference] as number;
    const b = right[key as keyof NutritionReference] as number;
    return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  });
}

function sourceContractValid(value: VisionResponse, source: AnalysisSource): boolean {
  const hasObservation = value.observedPackageAmount !== undefined || value.observedPackageUnit !== undefined;
  if (hasObservation && (value.observedPackageAmount === undefined || value.observedPackageUnit === undefined)) {
    return false;
  }
  if (source === 'meal') {
    return value.barcode === null &&
      value.nutritionBasis === 'portion' &&
      value.nutritionAmount === 1 &&
      value.nutritionUnit === 'portion' &&
      !hasObservation &&
      value.packageReference === undefined &&
      value.per100Reference === undefined &&
      value.servingReference === undefined;
  }

  if (value.nutritionBasis === 'package') {
    return value.nutritionUnit !== 'portion' &&
      value.observedPackageAmount !== undefined &&
      value.observedPackageUnit === value.nutritionUnit &&
      value.packageReference !== undefined &&
      value.packageReference.amount === value.nutritionAmount &&
      value.packageReference.unit === value.nutritionUnit &&
      packageTolerance(value.nutritionAmount, value.observedPackageAmount) &&
      (value.per100Reference === undefined || value.per100Reference.unit === value.nutritionUnit) &&
      (value.servingReference === undefined || value.servingReference.unit === value.nutritionUnit);
  }

  if (value.nutritionBasis === 'per100g') {
    return value.nutritionAmount === 100 &&
      value.nutritionUnit !== 'portion' &&
      value.observedPackageAmount !== undefined &&
      value.observedPackageUnit === value.nutritionUnit &&
      value.per100Reference !== undefined &&
      value.per100Reference.amount === 100 &&
      value.per100Reference.unit === value.nutritionUnit &&
      (value.packageReference === undefined ||
        (packageTolerance(value.packageReference.amount, value.observedPackageAmount!) &&
          value.packageReference.unit === value.nutritionUnit)) &&
      (value.servingReference === undefined || value.servingReference.unit === value.nutritionUnit);
  }

  return value.nutritionAmount === 1 &&
    value.nutritionUnit === 'portion' &&
    value.servingReference !== undefined &&
    (!hasObservation || value.observedPackageUnit === value.servingReference.unit) &&
    (value.packageReference === undefined ||
      (!hasObservation ||
        (packageTolerance(value.packageReference.amount, value.observedPackageAmount!) &&
          value.packageReference.unit === value.observedPackageUnit))) &&
    (value.per100Reference === undefined ||
      (!hasObservation || value.per100Reference.unit === value.observedPackageUnit));
}

function asAnalysisResult(value: VisionResponse, source: AnalysisSource): AnalysisResult {
  return {
    name: value.name,
    kcal: value.kcal,
    proteinG: value.proteinG,
    carbsG: value.carbsG,
    fatG: value.fatG,
    confidence: value.confidence,
    atwaterKcal: atwaterKcal(value.proteinG, value.carbsG, value.fatG),
    candidates: value.candidates,
    source,
    nutritionBasis: value.nutritionBasis,
    nutritionAmount: value.nutritionAmount,
    nutritionUnit: value.nutritionUnit,
    ...(value.barcode === null ? {} : { modelBarcode: value.barcode }),
    ...(value.observedPackageAmount === undefined ? {} : { observedPackageAmount: value.observedPackageAmount }),
    ...(value.observedPackageUnit === undefined ? {} : { observedPackageUnit: value.observedPackageUnit }),
    ...(value.packageReference === undefined ? {} : { packageReference: value.packageReference }),
    ...(value.per100Reference === undefined ? {} : { per100Reference: value.per100Reference }),
    ...(value.servingReference === undefined ? {} : { servingReference: value.servingReference }),
    detectedItems: value.detectedItems,
    boundingBox: value.boundingBox,
  };
}

export function parseNutritionResponse(text: string, source: AnalysisSource = 'meal'): NutritionParseOutcome {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { ok: false, reason: 'no_json_object_in_response' };
  let raw: unknown;
  try {
    raw = JSON.parse(jsonMatch[0]);
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }
  const parsed = visionResponseSchema.safeParse(raw);
  if (!parsed.success || !sourceContractValid(parsed.data, source)) {
    const issue = parsed.success ? undefined : parsed.error.issues[0];
    return { ok: false, reason: `schema_violation:${issue?.path.join('.') || '(root)'}` };
  }
  return { ok: true, result: asAnalysisResult(parsed.data, source) };
}

export type VisionNormalizationResult =
  | { kind: 'draft'; status: 'complete' | 'needs_review'; draft: NutritionDraft }
  | { kind: 'error'; status: 'error'; failureCode: 'model_schema_invalid'; reviewReasons: ['model_schema_invalid'] };

const analysisResultSchema = visionResponseSchema.omit({ barcode: true }).extend({
  source: z.enum(['meal', 'barcode', 'label']),
  atwaterKcal: finiteNonNegative,
  modelBarcode: barcodeSchema.optional(),
}).strict();

function asNormalizationInput(value: unknown): AnalysisResult | null {
  const parsed = analysisResultSchema.safeParse(value);
  if (!parsed.success) return null;
  const response: VisionResponse = {
    ...parsed.data,
    barcode: parsed.data.modelBarcode ?? null,
  };
  if (!sourceContractValid(response, parsed.data.source)) return null;
  const result = asAnalysisResult(response, parsed.data.source);
  if (parsed.data.modelBarcode !== undefined && result.modelBarcode !== parsed.data.modelBarcode) return null;
  return result;
}

function validOptionalBarcode(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  return barcodeSchema.safeParse(value).success ? value as string : null;
}

function referenceFromResult(result: AnalysisResult): NutritionReference {
  return {
    kcal: result.kcal,
    proteinG: result.proteinG,
    carbsG: result.carbsG,
    fatG: result.fatG,
    amount: result.nutritionAmount,
    unit: result.nutritionUnit as Extract<NutritionUnit, 'g' | 'ml'>,
  };
}

function scaledReference(reference: NutritionReference, amount: number): Pick<NutritionDraft, 'baseKcal' | 'baseProtein' | 'baseCarbs' | 'baseFat'> {
  return {
    baseKcal: reference.kcal * amount / 100,
    baseProtein: reference.proteinG * amount / 100,
    baseCarbs: reference.carbsG * amount / 100,
    baseFat: reference.fatG * amount / 100,
  };
}

function hasFiniteDraftVector(draft: NutritionDraft): boolean {
  return [draft.baseKcal, draft.baseProtein, draft.baseCarbs, draft.baseFat]
    .every((value) => Number.isFinite(value) && value >= 0);
}

function withBarcodeProvenance(
  draft: NutritionDraft,
  rawBarcode: string | undefined,
  modelBarcode: string | undefined,
  confirmedBarcode: string | undefined,
  reasons: Iterable<ReviewReason>,
): NutritionDraft {
  const next: NutritionDraft = {
    ...draft,
    ...(rawBarcode === undefined ? {} : { rawBarcode }),
    ...(modelBarcode === undefined ? {} : { modelBarcode }),
    ...(confirmedBarcode === undefined ? {} : { confirmedBarcode }),
    reviewReasons: orderedReviewReasons(reasons),
  };
  return next;
}

function barcodeReasons(rawBarcode: string | undefined, modelBarcode: string | undefined, confirmedBarcode: string | undefined): ReviewReason[] {
  const observed = [rawBarcode, modelBarcode].filter((value): value is string => value !== undefined);
  return observed.length > 0 && (confirmedBarcode === undefined || observed.some((value) => value !== confirmedBarcode))
    ? ['barcode_unconfirmed']
    : [];
}

function draftStatus(draft: NutritionDraft): VisionNormalizationResult {
  return { kind: 'draft', status: draft.reviewReasons.length === 0 ? 'complete' : 'needs_review', draft };
}

/** Revalidates a strict vision result and emits only canonical persisted nutrition drafts. */
export function normalizeVisionNutrition(
  parsed: unknown,
  rawBarcode?: string,
  confirmedBarcode?: string,
): VisionNormalizationResult {
  const result = asNormalizationInput(parsed);
  const validRaw = validOptionalBarcode(rawBarcode);
  const validConfirmed = validOptionalBarcode(confirmedBarcode);
  if (!result || validRaw === null || validConfirmed === null) {
    return { kind: 'error', status: 'error', failureCode: 'model_schema_invalid', reviewReasons: ['model_schema_invalid'] };
  }

  const modelBarcode = result.modelBarcode;
  const reasons: ReviewReason[] = barcodeReasons(validRaw, modelBarcode, validConfirmed);
  let draft: NutritionDraft;

  if (result.nutritionBasis === 'portion') {
    draft = {
      baseKcal: result.kcal,
      baseProtein: result.proteinG,
      baseCarbs: result.carbsG,
      baseFat: result.fatG,
      nutritionBasis: 'portion',
      nutritionAmount: 1,
      nutritionUnit: 'portion',
      ...(result.source === 'meal' ? { consumedAmount: 1 } : {}),
      ...(result.servingReference === undefined ? {} : { servingReference: result.servingReference }),
      reviewReasons: [],
    };
    if (result.source !== 'meal') {
      reasons.push(result.observedPackageAmount === undefined ? 'package_quantity_missing' : 'nutrition_basis_ambiguous');
      if (!sameVector(referenceFromResult(result), result.servingReference!)) {
        reasons.push('nutrition_arithmetic_mismatch');
      }
    }
  } else if (result.nutritionBasis === 'package') {
    const amount = result.nutritionAmount;
    const density = result.per100Reference;
    const packageReference = result.packageReference!;
    const base = density === undefined
      ? {
        baseKcal: packageReference.kcal,
        baseProtein: packageReference.proteinG,
        baseCarbs: packageReference.carbsG,
        baseFat: packageReference.fatG,
      }
      : scaledReference(density, amount);
    if (density !== undefined) {
      const canonicalReference: NutritionReference = {
        kcal: base.baseKcal,
        proteinG: base.baseProtein,
        carbsG: base.baseCarbs,
        fatG: base.baseFat,
        amount,
        unit: result.nutritionUnit as Extract<NutritionUnit, 'g' | 'ml'>,
      };
      if (!sameVector(referenceFromResult(result), canonicalReference) || !sameVector(packageReference, canonicalReference)) {
        reasons.push('nutrition_arithmetic_mismatch');
      }
    } else if (!sameVector(referenceFromResult(result), packageReference)) {
      reasons.push('nutrition_arithmetic_mismatch');
    }
    draft = {
      ...base,
      nutritionBasis: 'package',
      nutritionAmount: amount,
      nutritionUnit: result.nutritionUnit as Extract<NutritionUnit, 'g' | 'ml'>,
      consumedAmount: amount,
      ...(density === undefined ? {} : { per100Reference: density }),
      ...(result.servingReference === undefined ? {} : { servingReference: result.servingReference }),
      reviewReasons: [],
    };
  } else {
    const amount = result.packageReference?.amount ?? result.observedPackageAmount!;
    const density = result.per100Reference!;
    draft = {
      ...scaledReference(density, amount),
      nutritionBasis: 'package',
      nutritionAmount: amount,
      nutritionUnit: result.nutritionUnit as Extract<NutritionUnit, 'g' | 'ml'>,
      consumedAmount: amount,
      per100Reference: density,
      ...(result.servingReference === undefined ? {} : { servingReference: result.servingReference }),
      reviewReasons: [],
    };
    const canonicalReference: NutritionReference = {
      kcal: draft.baseKcal,
      proteinG: draft.baseProtein,
      carbsG: draft.baseCarbs,
      fatG: draft.baseFat,
      amount,
      unit: result.nutritionUnit as Extract<NutritionUnit, 'g' | 'ml'>,
    };
    if (!sameVector(referenceFromResult(result), density) ||
      (result.packageReference !== undefined && !sameVector(result.packageReference, canonicalReference))) {
      reasons.push('nutrition_arithmetic_mismatch');
    }
  }

  if (!hasFiniteDraftVector(draft)) {
    return { kind: 'error', status: 'error', failureCode: 'model_schema_invalid', reviewReasons: ['model_schema_invalid'] };
  }
  try {
    if (atwaterMismatch(draft.baseKcal, draft.baseProtein, draft.baseCarbs, draft.baseFat)) {
      reasons.push('atwater_mismatch');
    }
  } catch {
    return { kind: 'error', status: 'error', failureCode: 'model_schema_invalid', reviewReasons: ['model_schema_invalid'] };
  }
  return draftStatus(withBarcodeProvenance(draft, validRaw, modelBarcode, validConfirmed, reasons));
}
