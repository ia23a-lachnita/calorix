import { describe, expect, it } from 'vitest';
import { parseNutritionResponse } from '../src/nutrition';

const validPayload = {
  foodName: 'Chicken Rice Bowl',
  kcal: 620,
  protein: 48,
  carbs: 72,
  fat: 16,
  confidence: 0.91,
  detectedItems: [{ name: 'chicken', weight: 130 }],
  boundingBox: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
};

describe('parseNutritionResponse', () => {
  it('parses a plain JSON object', () => {
    const outcome = parseNutritionResponse(JSON.stringify(validPayload));
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.foodName).toBe('Chicken Rice Bowl');
      expect(outcome.result.kcal).toBe(620);
    }
  });

  it('extracts JSON wrapped in markdown fences and prose', () => {
    const text = `Here is the analysis:\n\`\`\`json\n${JSON.stringify(validPayload)}\n\`\`\`\nDone.`;
    const outcome = parseNutritionResponse(text);
    expect(outcome.ok).toBe(true);
  });

  it('defaults detectedItems and normalizes missing boundingBox to null', () => {
    const { detectedItems: _items, boundingBox: _box, ...minimal } = validPayload;
    const outcome = parseNutritionResponse(JSON.stringify(minimal));
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.detectedItems).toEqual([]);
      expect(outcome.result.boundingBox).toBeNull();
    }
  });

  it('rejects responses with no JSON object', () => {
    const outcome = parseNutritionResponse('I could not analyze this image.');
    expect(outcome).toEqual({ ok: false, reason: 'no_json_object_in_response' });
  });

  it('rejects malformed JSON', () => {
    const outcome = parseNutritionResponse('{ "foodName": "x", ');
    expect(outcome.ok).toBe(false);
  });

  it('rejects missing macro fields instead of writing undefined to Firestore', () => {
    const { kcal: _kcal, ...missingKcal } = validPayload;
    const outcome = parseNutritionResponse(JSON.stringify(missingKcal));
    expect(outcome).toEqual({ ok: false, reason: 'schema_violation:kcal' });
  });

  it('rejects out-of-range confidence and negative macros', () => {
    expect(
      parseNutritionResponse(JSON.stringify({ ...validPayload, confidence: 1.4 })).ok,
    ).toBe(false);
    expect(
      parseNutritionResponse(JSON.stringify({ ...validPayload, protein: -5 })).ok,
    ).toBe(false);
  });
});
