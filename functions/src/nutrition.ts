import { z } from 'zod';

export const NutritionResultSchema = z.object({
  foodName: z.string().min(1).max(500),
  kcal: z.number().min(0).max(10000),
  protein: z.number().min(0),
  carbs: z.number().min(0),
  fat: z.number().min(0),
  confidence: z.number().min(0).max(1),
  detectedItems: z
    .array(z.object({ name: z.string(), weight: z.number() }))
    .default([]),
  boundingBox: z
    .object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
    .nullish()
    .transform((v) => v ?? null),
});

export type NutritionResult = z.infer<typeof NutritionResultSchema>;

export interface NutritionParseFailure {
  ok: false;
  reason: string;
}

export interface NutritionParseSuccess {
  ok: true;
  result: NutritionResult;
}

export type NutritionParseOutcome = NutritionParseSuccess | NutritionParseFailure;

/**
 * Extracts the first JSON object from raw model text and validates it against
 * the nutrition contract. Model output is never trusted blindly: missing or
 * implausible fields fail the parse instead of writing garbage to Firestore.
 */
export function parseNutritionResponse(text: string): NutritionParseOutcome {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { ok: false, reason: 'no_json_object_in_response' };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(jsonMatch[0]);
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }
  const parsed = NutritionResultSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.join('.') || '(root)';
    return { ok: false, reason: `schema_violation:${path}` };
  }
  return { ok: true, result: parsed.data };
}
