import { z } from 'zod';

export type AnalysisSource = 'meal' | 'barcode' | 'label';

export const ReviewCandidateSchema = z.object({
  name: z.string().min(1).max(500),
  confidence: z.number().min(0).max(1),
  kcal: z.number().min(0).max(10000),
  proteinG: z.number().min(0),
  carbsG: z.number().min(0),
  fatG: z.number().min(0),
});

const VisionAnalysisSchema = z.object({
  name: z.string().min(1).max(500),
  kcal: z.number().min(0).max(10000),
  proteinG: z.number().min(0),
  carbsG: z.number().min(0),
  fatG: z.number().min(0),
  confidence: z.number().min(0).max(1),
  candidates: z.array(ReviewCandidateSchema).default([]),
  barcode: z.string().regex(/^\d{8,14}$/).nullish(),
  detectedItems: z
    .array(z.object({ name: z.string(), weight: z.number().min(0) }))
    .default([]),
  boundingBox: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .nullish()
    .transform((value) => value ?? null),
});

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
  barcode?: string;
  detectedItems: { name: string; weight: number }[];
  boundingBox: { x: number; y: number; width: number; height: number } | null;
}

export function atwaterKcal(
  proteinG: number,
  carbsG: number,
  fatG: number,
): number {
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

export type NutritionParseOutcome =
  | NutritionParseSuccess
  | NutritionParseFailure;

export function parseNutritionResponse(
  text: string,
  source: AnalysisSource = 'meal',
): NutritionParseOutcome {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { ok: false, reason: 'no_json_object_in_response' };
  let raw: unknown;
  try {
    raw = JSON.parse(jsonMatch[0]);
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }
  const parsed = VisionAnalysisSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      reason: `schema_violation:${issue?.path.join('.') || '(root)'}`,
    };
  }
  const value = parsed.data;
  return {
    ok: true,
    result: {
      name: value.name,
      kcal: value.kcal,
      proteinG: value.proteinG,
      carbsG: value.carbsG,
      fatG: value.fatG,
      confidence: value.confidence,
      atwaterKcal: atwaterKcal(value.proteinG, value.carbsG, value.fatG),
      candidates: value.candidates,
      source,
      ...(value.barcode ? { barcode: value.barcode } : {}),
      detectedItems: value.detectedItems,
      boundingBox: value.boundingBox,
    },
  };
}
