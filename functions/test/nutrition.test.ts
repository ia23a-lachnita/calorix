import { describe, expect, it } from 'vitest';
import { atwaterKcal, parseNutritionResponse } from '../src/nutrition';

const validPayload = {
  name: 'Chicken Rice Bowl',
  kcal: 620,
  proteinG: 48,
  carbsG: 72,
  fatG: 16,
  confidence: 0.91,
  candidates: [
    {
      name: 'Teriyaki Bowl',
      confidence: 0.72,
      kcal: 650,
      proteinG: 44,
      carbsG: 80,
      fatG: 17,
    },
  ],
};

describe('nutrition analysis contract', () => {
  it('computes 4/4/9 Atwater kcal', () => {
    expect(atwaterKcal(10, 20, 5)).toBe(165);
  });

  it('parses canonical vision JSON and derives source and Atwater evidence', () => {
    const outcome = parseNutritionResponse(JSON.stringify(validPayload), 'meal');
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result).toMatchObject({
        name: 'Chicken Rice Bowl',
        source: 'meal',
        atwaterKcal: 624,
      });
      expect(outcome.result.candidates[0]?.proteinG).toBe(44);
    }
  });

  it('extracts fenced JSON but rejects malformed or implausible data', () => {
    expect(
      parseNutritionResponse(`text\n\`\`\`json\n${JSON.stringify(validPayload)}\n\`\`\``, 'label')
        .ok,
    ).toBe(true);
    expect(parseNutritionResponse('not json', 'meal')).toEqual({
      ok: false,
      reason: 'no_json_object_in_response',
    });
    expect(
      parseNutritionResponse(JSON.stringify({ ...validPayload, confidence: 2 }), 'meal').ok,
    ).toBe(false);
    expect(
      parseNutritionResponse(JSON.stringify({ ...validPayload, proteinG: -1 }), 'meal').ok,
    ).toBe(false);
  });
});
