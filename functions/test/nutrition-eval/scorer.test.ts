import { describe, expect, it } from 'vitest';
import type {
  NutritionEvalCase,
  NutritionPrediction,
} from '../../src/nutrition-eval/schema';
import {
  scoreNutritionCase,
  aggregateNutritionResults,
} from '../../src/nutrition-eval/scorer';

// ── Fixtures ───────────────────────────────────────────────────────────────

const SHA = '28f5fe26394586f124c04af2d22270d8a8079c141fc1f2b0fe80593d77ae2869';

const mealCase: NutritionEvalCase = {
  id: 'meal-dish-1565035746', visibility: 'public', scanMode: 'meal',
  source: { dataset: 'nutrition5k', objectId: 'dish_1565035746' },
  image: { url: 'https://example.com/dish.png', sha256: SHA, mediaType: 'image/png', width: 640, height: 480 },
  truth: { basis: 'portion', amount: 1, unit: 'portion', kcal: 43.099998, proteinG: 2.409, carbsG: 9.01, fatG: 0.369 },
  toleranceClass: 'meal-estimate', attributionId: 'nutrition5k-cc-by-4.0',
};

const pkgCase: NutritionEvalCase = {
  id: 'barcode-5449000000996', visibility: 'public', scanMode: 'barcode',
  source: { dataset: 'off', objectId: '5449000000996' },
  image: { url: 'https://example.com/product.jpg', sha256: 'a'.repeat(64), mediaType: 'image/jpeg', width: 400, height: 400 },
  truth: { basis: 'package', amount: 330, unit: 'ml', kcal: 138.6, proteinG: 0, carbsG: 34.98, fatG: 0 },
  toleranceClass: 'package-strict', attributionId: 'off-odbl',
  expectedBarcode: '5449000000996', expectedDecision: 'complete',
};

const needsReviewCase: NutritionEvalCase = {
  id: 'vitamin-well-7350042716380', visibility: 'private', scanMode: 'barcode',
  source: { dataset: 'private', objectId: '7350042716380' },
  image: { path: 'vitamin-well-reload.jpg', sha256: 'b'.repeat(64), mediaType: 'image/jpeg', width: 800, height: 1200 },
  truth: { basis: 'package', amount: 500, unit: 'ml', kcal: 85, proteinG: 0, carbsG: 21, fatG: 0 },
  toleranceClass: 'package-strict', attributionId: 'private-authorized',
  expectedBarcode: '7350042716380', expectedDecision: 'needs_review',
};

const kcal100Case: NutritionEvalCase = {
  id: 'kcal-100', visibility: 'public', scanMode: 'meal',
  source: { dataset: 'nutrition5k', objectId: 'kcal_100' },
  image: { url: 'https://example.com/food.png', sha256: SHA, mediaType: 'image/png', width: 640, height: 480 },
  truth: { basis: 'portion', amount: 1, unit: 'portion', kcal: 100, proteinG: 10, carbsG: 20, fatG: 5 },
  toleranceClass: 'meal-estimate', attributionId: 'nutrition5k-cc-by-4.0',
};

function ok(o: Partial<NutritionPrediction> = {}): NutritionPrediction {
  return { parseStatus: 'success', source: 'meal', decision: 'complete', ...o };
}

// ── Per-case scoring ────────────────────────────────────────────────────────

describe('scoreNutritionCase', () => {
  it('exact match', () => {
    const r = scoreNutritionCase(mealCase, ok({ kcal: 43.099998, proteinG: 2.409, carbsG: 9.01, fatG: 0.369 }));
    expect(r.numeric.kcal!.ratioToTruth).toBeCloseTo(1, 8);
    expect(r.numeric.kcal!.absoluteError).toBeCloseTo(0, 8);
    expect(r.numeric.kcal!.relativeError).toBeCloseTo(0, 8);
    expect(r.numeric.proteinG!.ratioToTruth).toBeCloseTo(1, 8);
    expect(r.safety.catastrophicCalorieMiss).toBe(false);
    expect(r.safety.unsafeCompletion).toBe(false);
  });

  it('over-prediction: ratio > 1, positive errors', () => {
    const r = scoreNutritionCase(mealCase, ok({ kcal: 60, proteinG: 3, carbsG: 12, fatG: 0.5 }));
    expect(r.numeric.kcal!.ratioToTruth).toBeCloseTo(60 / 43.099998, 8);
    expect(r.numeric.kcal!.absoluteError).toBeCloseTo(60 - 43.099998, 8);
    expect(r.numeric.kcal!.relativeError).toBeCloseTo(Math.abs(60 - 43.099998) / 43.099998, 8);
  });

  it('under-prediction: ratio < 1, positive errors', () => {
    const r = scoreNutritionCase(mealCase, ok({ kcal: 20 }));
    expect(r.numeric.kcal!.ratioToTruth).toBeCloseTo(20 / 43.099998, 8);
    expect(r.numeric.kcal!.absoluteError).toBeCloseTo(Math.abs(20 - 43.099998), 8);
    expect(r.numeric.kcal!.relativeError).toBeCloseTo(Math.abs(20 - 43.099998) / 43.099998, 8);
  });

  it('missing numeric fields: metrics undefined for absent nutrients', () => {
    const r = scoreNutritionCase(mealCase, ok());
    expect(r.numeric.kcal).toBeUndefined();
    expect(r.numeric.proteinG).toBeUndefined();
    expect(r.numeric.carbsG).toBeUndefined();
    expect(r.numeric.fatG).toBeUndefined();
  });

  it('zero-truth macro: denominator max(abs(0),1)=1', () => {
    const r = scoreNutritionCase(pkgCase, ok({ proteinG: 5 }));
    expect(r.numeric.proteinG!.ratioToTruth).toBeCloseTo(5, 8);
    expect(r.numeric.proteinG!.absoluteError).toBeCloseTo(5, 8);
    expect(r.numeric.proteinG!.relativeError).toBeCloseTo(5, 8);
    expect(r.numeric.fatG).toBeUndefined();
  });

  it('barcode true only when expectedBarcode exists', () => {
    expect(scoreNutritionCase(pkgCase, ok({ barcode: '5449000000996' })).booleans.barcodeExactMatch).toBe(true);
    expect(scoreNutritionCase(pkgCase, ok({ barcode: '9999999999999' })).booleans.barcodeExactMatch).toBe(false);
  });

  it('barcode undefined when expectedBarcode absent', () => {
    expect(scoreNutritionCase(mealCase, ok({ barcode: '12345678' })).booleans.barcodeExactMatch).toBeUndefined();
  });

  it('basis and unit exact match', () => {
    expect(scoreNutritionCase(pkgCase, ok({ basis: 'package' })).booleans.basisExactMatch).toBe(true);
    expect(scoreNutritionCase(pkgCase, ok({ basis: 'per100g' })).booleans.basisExactMatch).toBe(false);
    expect(scoreNutritionCase(pkgCase, ok({ unit: 'ml' })).booleans.unitExactMatch).toBe(true);
    expect(scoreNutritionCase(pkgCase, ok({ unit: 'g' })).booleans.unitExactMatch).toBe(false);
  });

  it('missing booleans fields yield undefined', () => {
    const b = scoreNutritionCase(pkgCase, ok()).booleans;
    expect(b.barcodeExactMatch).toBeUndefined();
    expect(b.basisExactMatch).toBeUndefined();
    expect(b.unitExactMatch).toBeUndefined();
  });

  it('catastrophic: exact 0.5x and 2.0x NOT catastrophic', () => {
    expect(scoreNutritionCase(pkgCase, ok({ kcal: 69.3 })).safety.catastrophicCalorieMiss).toBe(false);
    expect(scoreNutritionCase(pkgCase, ok({ kcal: 277.2 })).safety.catastrophicCalorieMiss).toBe(false);
  });

  it('catastrophic: just outside 0.5x..2.0x IS catastrophic', () => {
    expect(scoreNutritionCase(pkgCase, ok({ kcal: 69.2 })).safety.catastrophicCalorieMiss).toBe(true);
    expect(scoreNutritionCase(pkgCase, ok({ kcal: 277.3 })).safety.catastrophicCalorieMiss).toBe(true);
  });

  it('catastrophic only for successful present kcal', () => {
    expect(scoreNutritionCase(pkgCase, { parseStatus: 'success', source: 'barcode', decision: 'complete' })
      .safety.catastrophicCalorieMiss).toBe(false);
  });

  it('unsafe: catastrophic + complete => unsafe', () => {
    const r = scoreNutritionCase(pkgCase, ok({ kcal: 300 }));
    expect(r.safety.catastrophicCalorieMiss).toBe(true);
    expect(r.safety.unsafeCompletion).toBe(true);
  });

  it('unsafe: catastrophic + needs_review => not unsafe', () => {
    const r = scoreNutritionCase(pkgCase, ok({ kcal: 300, decision: 'needs_review' }));
    expect(r.safety.catastrophicCalorieMiss).toBe(true);
    expect(r.safety.unsafeCompletion).toBe(false);
  });

  it('unsafe: expected needs_review + prediction complete => unsafe', () => {
    expect(scoreNutritionCase(needsReviewCase, ok({
      kcal: 85, proteinG: 0, carbsG: 21, fatG: 0,
      decision: 'complete', barcode: '7350042716380',
    })).safety.unsafeCompletion).toBe(true);
  });

  it('safe: expected needs_review + needs_review => not unsafe', () => {
    expect(scoreNutritionCase(needsReviewCase, ok({ kcal: 85, decision: 'needs_review' }))
      .safety.unsafeCompletion).toBe(false);
  });

  it('stamps caseId', () => {
    expect(scoreNutritionCase(mealCase, ok()).caseId).toBe('meal-dish-1565035746');
  });

  it('does not mutate inputs', () => {
    const c = mealCase; const frozen = JSON.parse(JSON.stringify(c));
    scoreNutritionCase(c, ok());
    expect(c).toEqual(frozen);
    const p = ok({ kcal: 50 }); const pfrozen = JSON.parse(JSON.stringify(p));
    scoreNutritionCase(mealCase, p);
    expect(p).toEqual(pfrozen);
  });

  it('deterministic JSON', () => {
    const p = ok({ kcal: 50, proteinG: 3 });
    expect(JSON.stringify(scoreNutritionCase(mealCase, p)))
      .toBe(JSON.stringify(scoreNutritionCase(mealCase, p)));
  });
});

// ── Aggregate ───────────────────────────────────────────────────────────────

describe('aggregateNutritionResults', () => {
  it('empty: zero summary', () => {
    const s = aggregateNutritionResults([]);
    expect(s.totalCases).toBe(0);
    expect(s.runCases).toBe(0);
    expect(s.parseCases).toBe(0);
    expect(s.catastrophicCount).toBe(0);
    expect(s.unsafeCompletionCount).toBe(0);
    expect(s.medianAbsoluteCalorieError).toBe(0);
    expect(s.p90AbsoluteCalorieError).toBe(0);
  });

  it('single: median/p90 = sole value', () => {
    const r = scoreNutritionCase(kcal100Case, ok({ kcal: 110 }));
    const s = aggregateNutritionResults([r]);
    expect(s.totalCases).toBe(1);
    expect(s.parseCases).toBe(1);
    expect(s.medianAbsoluteCalorieError).toBeCloseTo(10, 8);
    expect(s.p90AbsoluteCalorieError).toBeCloseTo(10, 8);
  });

  it('two: median is average', () => {
    const a = scoreNutritionCase(kcal100Case, ok({ kcal: 105 }));
    const b = scoreNutritionCase({ ...kcal100Case, id: 'kcal-100-b' }, ok({ kcal: 115 }));
    expect(aggregateNutritionResults([a, b]).medianAbsoluteCalorieError).toBeCloseTo(10, 8);
  });

  it('p90 linear interpolation', () => {
    const results = Array.from({ length: 10 }, (_, i) =>
      scoreNutritionCase({ ...kcal100Case, id: `p90-${i}` }, ok({ kcal: 101 + i })),
    );
    expect(aggregateNutritionResults(results).p90AbsoluteCalorieError).toBeCloseTo(9.1, 6);
  });

  it('reviewRate = needs_review / parseCases', () => {
    const a = scoreNutritionCase(mealCase, ok({ decision: 'complete' }));
    const b = scoreNutritionCase({ ...mealCase, id: 'meal-2' }, ok({ decision: 'complete' }));
    const c = scoreNutritionCase({ ...mealCase, id: 'meal-3' }, ok({ decision: 'needs_review' }));
    const s = aggregateNutritionResults([a, b, c]);
    expect(s.reviewRate).toBeCloseTo(1 / 3, 8);
  });

  it('failure counts by category and code', () => {
    const a = scoreNutritionCase(mealCase, { parseStatus: 'failure', source: 'meal', decision: 'error', failureCategory: 'provider', failureCode: 'model_response_invalid' });
    const b = scoreNutritionCase({ ...mealCase, id: 'meal-2' }, { parseStatus: 'failure', source: 'meal', decision: 'error', failureCategory: 'provider', failureCode: 'provider_request_failed' });
    const c = scoreNutritionCase({ ...mealCase, id: 'meal-3' }, { parseStatus: 'failure', source: 'meal', decision: 'error', failureCategory: 'schema', failureCode: 'model_response_invalid' });
    const s = aggregateNutritionResults([a, b, c]);
    expect(s.failuresByCategory).toEqual({ provider: 2, schema: 1 });
    expect(s.failuresByCode).toEqual({ model_response_invalid: 2, provider_request_failed: 1 });
  });

  it('failure without failureCode counts by category only', () => {
    const a = scoreNutritionCase(mealCase, { parseStatus: 'failure', source: 'meal', decision: 'error', failureCategory: 'runner' });
    const s = aggregateNutritionResults([a]);
    expect(s.failuresByCategory).toEqual({ runner: 1 });
    expect(s.failuresByCode).toEqual({});
  });

  it('totalCases includes all, parseCases only successes', () => {
    const success = scoreNutritionCase(mealCase, ok());
    const failure = scoreNutritionCase({ ...mealCase, id: 'meal-2' }, { parseStatus: 'failure', source: 'meal', decision: 'error', failureCategory: 'schema', failureCode: 'x' });
    const s = aggregateNutritionResults([success, failure]);
    expect(s.totalCases).toBe(2);
    expect(s.runCases).toBe(2);
    expect(s.parseCases).toBe(1);
  });

  it('basisAccuracyDenom and barcodeAccuracyDenom count defined booleans', () => {
    const withBarcode = scoreNutritionCase(pkgCase, ok({ barcode: '5449000000996', basis: 'package', unit: 'ml' }));
    const withoutBarcode = scoreNutritionCase(mealCase, ok({ basis: 'portion', unit: 'portion' }));
    const s = aggregateNutritionResults([withBarcode, withoutBarcode]);
    expect(s.barcodeAccuracyDenom).toBe(1);
    expect(s.basisAccuracyDenom).toBe(2);
  });

  it('catastrophicCount and unsafeCompletionCount from real scoring', () => {
    const exact = scoreNutritionCase(pkgCase, ok({ kcal: 138.6 }));
    const below = scoreNutritionCase(pkgCase, ok({ kcal: 67.9 }));
    const above = scoreNutritionCase(pkgCase, ok({ kcal: 278.6 }));
    const aboveReview = scoreNutritionCase(pkgCase, ok({ kcal: 278.6, decision: 'needs_review' }));
    const s = aggregateNutritionResults([exact, below, above, aboveReview]);
    expect(s.catastrophicCount).toBe(3);
    expect(s.unsafeCompletionCount).toBe(2);
  });

  it('parse-failure excluded from median/p90', () => {
    const fail = scoreNutritionCase(
      { ...kcal100Case, id: 'parse-fail' },
      { parseStatus: 'failure', source: 'meal', decision: 'error', failureCategory: 'schema', failureCode: 'bad' },
    );
    expect(fail.numeric.kcal).toBeUndefined();
    const ok10 = scoreNutritionCase(kcal100Case, ok({ kcal: 110 }));
    const s = aggregateNutritionResults([fail, ok10]);
    expect(s.parseCases).toBe(1);
    expect(s.medianAbsoluteCalorieError).toBeCloseTo(10, 8);
    expect(s.p90AbsoluteCalorieError).toBeCloseTo(10, 8);
  });

  it('meanMacroRelativeError hand-derived 0.2', () => {
    const r = scoreNutritionCase(kcal100Case, ok({ kcal: 100, proteinG: 11, carbsG: 24, fatG: 6.5 }));
    const s = aggregateNutritionResults([r]);
    // protein: |11-10|/10 = 0.1, carbs: |24-20|/20 = 0.2, fat: |6.5-5|/5 = 0.3
    expect(s.meanMacroRelativeError).toBeCloseTo(0.2, 8);
  });

  it('medianRelativeCalorieError 0.055, p90RelativeCalorieError 0.091, absolute p90 9.1', () => {
    const results = Array.from({ length: 10 }, (_, i) =>
      scoreNutritionCase({ ...kcal100Case, id: `rel-${i}` }, ok({ kcal: 101 + i })),
    );
    const s = aggregateNutritionResults(results);
    expect(s.medianRelativeCalorieError).toBeCloseTo(0.055, 6);
    expect(s.p90RelativeCalorieError).toBeCloseTo(0.091, 6);
    expect(s.p90AbsoluteCalorieError).toBeCloseTo(9.1, 6);
  });

  it('reviewRate excludes parse failures from denominator', () => {
    const needsRev = scoreNutritionCase(needsReviewCase, ok({ decision: 'needs_review' }));
    const complete = scoreNutritionCase({ ...mealCase, id: 'rev-2' }, ok({ decision: 'complete' }));
    const fail = scoreNutritionCase(
      { ...mealCase, id: 'rev-3' },
      { parseStatus: 'failure', source: 'meal', decision: 'error', failureCategory: 'provider', failureCode: 'timeout' },
    );
    const s = aggregateNutritionResults([needsRev, complete, fail]);
    expect(s.parseCases).toBe(2);
    expect(s.reviewRate).toBeCloseTo(0.5, 8);
  });

  it('summary serialization order-invariant', () => {
    const r1 = scoreNutritionCase(kcal100Case, ok({ kcal: 105 }));
    const r2 = scoreNutritionCase({ ...kcal100Case, id: 'ord-2' }, ok({ kcal: 115 }));
    const fwd = aggregateNutritionResults([r1, r2]);
    const rev = aggregateNutritionResults([r2, r1]);
    const shuffled = aggregateNutritionResults([r2, r1, r1].filter((_, i) => i < 2));
    expect(JSON.stringify(fwd)).toBe(JSON.stringify(rev));
    expect(JSON.stringify(fwd)).toBe(JSON.stringify(shuffled));
    const arr = [r1, r2];
    const frozen = JSON.parse(JSON.stringify(arr));
    aggregateNutritionResults(arr);
    expect(arr).toEqual(frozen);
  });

  it('does not mutate input', () => {
    const a = scoreNutritionCase(kcal100Case, ok({ kcal: 105 }));
    const b = scoreNutritionCase({ ...kcal100Case, id: 'mut-2' }, ok({ kcal: 115 }));
    const r = [a, b];
    const frozen = JSON.parse(JSON.stringify(r));
    aggregateNutritionResults(r);
    expect(r).toEqual(frozen);
  });

  it('deterministic JSON', () => {
    const a = scoreNutritionCase(kcal100Case, ok({ kcal: 105 }));
    const b = scoreNutritionCase({ ...kcal100Case, id: 'det-2' }, ok({ kcal: 115 }));
    expect(JSON.stringify(aggregateNutritionResults([a, b])))
      .toBe(JSON.stringify(aggregateNutritionResults([a, b])));
  });
});
