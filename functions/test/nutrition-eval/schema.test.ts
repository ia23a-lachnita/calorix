import { describe, expect, it } from 'vitest';
import {
  NutritionCaseResultSchema,
  NutritionPredictionSchema,
  parseNutritionEvalManifest,
} from '../../src/nutrition-eval/schema';

const mealSha =
  '28f5fe26394586f124c04af2d22270d8a8079c141fc1f2b0fe80593d77ae2869';
const packageSha =
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const privateSha =
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const validMealCase = {
  id: 'meal-dish-1565035746',
  visibility: 'public',
  scanMode: 'meal',
  source: { dataset: 'nutrition5k', objectId: 'dish_1565035746' },
  image: {
    url: 'https://storage.googleapis.com/nutrition5k_dataset/nutrition5k_dataset/imagery/realsense_overhead/dish_1565035746/rgb.png',
    sha256: mealSha,
    mediaType: 'image/png',
    width: 640,
    height: 480,
  },
  truth: {
    basis: 'portion',
    amount: 1,
    unit: 'portion',
    kcal: 43.099998,
    proteinG: 2.409,
    carbsG: 9.01,
    fatG: 0.369,
  },
  toleranceClass: 'meal-estimate',
  attributionId: 'nutrition5k-cc-by-4.0',
};

const validPackageCase = {
  id: 'barcode-5449000000996',
  visibility: 'public',
  scanMode: 'barcode',
  source: { dataset: 'open-food-facts', objectId: '5449000000996' },
  image: {
    url: 'https://images.openfoodfacts.org/images/products/544/900/000/0996/front_en.400.jpg',
    sha256: packageSha,
    mediaType: 'image/jpeg',
    width: 400,
    height: 400,
  },
  truth: {
    basis: 'package',
    amount: 330,
    unit: 'ml',
    kcal: 138.6,
    proteinG: 0,
    carbsG: 34.98,
    fatG: 0,
  },
  toleranceClass: 'package-strict',
  attributionId: 'open-food-facts-odbl',
};

const validPrivateCase = {
  id: 'vitamin-well-reload-7350042716380',
  visibility: 'private',
  scanMode: 'barcode',
  source: { dataset: 'private', objectId: '7350042716380' },
  image: {
    path: 'vitamin-well-reload.jpg',
    sha256: privateSha,
    mediaType: 'image/jpeg',
    width: 800,
    height: 1200,
  },
  truth: {
    basis: 'package',
    amount: 500,
    unit: 'ml',
    kcal: 85,
    proteinG: 0,
    carbsG: 21,
    fatG: 0,
  },
  toleranceClass: 'package-strict',
  attributionId: 'private-authorized',
};

const validMeal = {
  version: 1,
  datasetId: 'calorix-nutrition-eval-v1',
  cases: [validMealCase],
};

function parseCase(
  evalCase: Record<string, unknown>,
  manifest: Record<string, unknown> = {},
) {
  return parseNutritionEvalManifest({
    version: 1,
    datasetId: 'calorix-nutrition-eval-v1',
    ...manifest,
    cases: [evalCase],
  });
}

function mealWith(overrides: {
  case?: Record<string, unknown>;
  image?: Record<string, unknown>;
  truth?: Record<string, unknown>;
} = {}) {
  return {
    ...validMealCase,
    ...overrides.case,
    image: { ...validMealCase.image, ...overrides.image },
    truth: { ...validMealCase.truth, ...overrides.truth },
  };
}

describe('parseNutritionEvalManifest', () => {
  it('accepts a valid minimal meal case', () => {
    const parsed = parseNutritionEvalManifest(validMeal);
    expect(parsed.cases).toHaveLength(1);
    expect(parsed.version).toBe(1);
    expect(parsed.cases[0]?.id).toBe('meal-dish-1565035746');
    expect(parsed.cases[0]?.scanMode).toBe('meal');
    expect(parsed.cases[0]?.truth.basis).toBe('portion');
  });

  it('accepts a valid minimal package case', () => {
    const parsed = parseCase(validPackageCase);
    expect(parsed.cases).toHaveLength(1);
    expect(parsed.cases[0]?.id).toBe('barcode-5449000000996');
    expect(parsed.cases[0]?.scanMode).toBe('barcode');
    expect(parsed.cases[0]?.truth.basis).toBe('package');
    expect(parsed.cases[0]?.truth.amount).toBe(330);
    expect(parsed.cases[0]?.truth.unit).toBe('ml');
  });

  it('requires version exactly 1', () => {
    expect(() =>
      parseNutritionEvalManifest({ ...validMeal, version: 2 }),
    ).toThrow();
    expect(() =>
      parseNutritionEvalManifest({ ...validMeal, version: 0 }),
    ).toThrow();
    expect(() =>
      parseNutritionEvalManifest({ ...validMeal, version: '1' }),
    ).toThrow();
  });

  it('rejects duplicate case IDs', () => {
    expect(() =>
      parseNutritionEvalManifest({
        ...validMeal,
        cases: [validMeal.cases[0], validMeal.cases[0]],
      }),
    ).toThrow(/duplicate/i);
  });

  it('requires a lowercase 64-character SHA-256', () => {
    expect(() =>
      parseCase(mealWith({ image: { sha256: mealSha.toUpperCase() } })),
    ).toThrow();
    expect(() =>
      parseCase(mealWith({ image: { sha256: mealSha.slice(0, 63) } })),
    ).toThrow();
    expect(() =>
      parseCase(mealWith({ image: { sha256: `${mealSha}a` } })),
    ).toThrow();
    expect(() =>
      parseCase(mealWith({ image: { sha256: 'g'.repeat(64) } })),
    ).toThrow();
  });

  it('requires positive image dimensions and truth amounts', () => {
    expect(() => parseCase(mealWith({ image: { width: 0 } }))).toThrow();
    expect(() => parseCase(mealWith({ image: { height: 0 } }))).toThrow();
    expect(() => parseCase(mealWith({ image: { width: -1 } }))).toThrow();
    expect(() => parseCase(mealWith({ image: { height: -1 } }))).toThrow();
    expect(() => parseCase(mealWith({ truth: { amount: 0 } }))).toThrow();
    expect(() => parseCase(mealWith({ truth: { amount: -1 } }))).toThrow();
  });

  it('requires finite non-negative nutrition values', () => {
    expect(() => parseCase(mealWith({ truth: { kcal: -1 } }))).toThrow();
    expect(() => parseCase(mealWith({ truth: { proteinG: -0.1 } }))).toThrow();
    expect(() => parseCase(mealWith({ truth: { carbsG: Number.POSITIVE_INFINITY } }))).toThrow();
    expect(() => parseCase(mealWith({ truth: { fatG: Number.NaN } }))).toThrow();
    expect(parseCase(validPackageCase).cases[0]?.truth.proteinG).toBe(0);
  });

  it('rejects public cases that use local image paths', () => {
    expect(() =>
      parseCase(mealWith({ image: { path: 'rgb.png' } })),
    ).toThrow();
    expect(() =>
      parseCase(mealWith({ image: { url: '/tmp/rgb.png' } })),
    ).toThrow();
    expect(() =>
      parseCase(mealWith({ image: { url: 'file:///tmp/rgb.png' } })),
    ).toThrow();
    // RED regression: public case with only a relative path (no url) must be
    // rejected. The union lets PrivateImageSchema match, and EvalCaseSchema
    // only gates private visibility, so without this coupling this case slips
    // through as a false positive.
    expect(() =>
      parseCase({
        ...validMealCase,
        visibility: 'public',
        image: {
          path: 'dish_1565035746/rgb.png',
          sha256: mealSha,
          mediaType: 'image/png',
          width: 640,
          height: 480,
        },
      }),
    ).toThrow();
  });

  it('rejects private cases that use public image URLs', () => {
    expect(parseCase(validPrivateCase).cases[0]?.visibility).toBe('private');
    expect(() =>
      parseCase({
        ...validPrivateCase,
        image: {
          ...validPrivateCase.image,
          url: 'https://storage.googleapis.com/nutrition5k_dataset/rgb.png',
        },
      }),
    ).toThrow();
    expect(() =>
      parseCase({
        ...validPrivateCase,
        image: {
          sha256: privateSha,
          mediaType: 'image/jpeg',
          width: 800,
          height: 1200,
          url: validMealCase.image.url,
        },
      }),
    ).toThrow();
  });

  it('requires a declared tolerance class', () => {
    const { toleranceClass: _omitted, ...withoutTolerance } = validMealCase;
    expect(() => parseCase(withoutTolerance)).toThrow();
    expect(() =>
      parseCase(mealWith({ case: { toleranceClass: '' } })),
    ).toThrow();
  });
});

describe('Slice F diagnostic schema contract', () => {
  const rawNutrients = { kcal: 240, proteinG: 12, carbsG: 30, fatG: 8 };
  const completeDiagnostics = {
    rawNutrients,
    detectedItemCount: 2,
    estimatedTotalMassG: 400,
    declaredBasis: 'package',
    declaredAmount: 400,
    declaredUnit: 'g',
    observedAmount: 400,
    observedUnit: 'g',
    packageReference: { kcal: 60, proteinG: 3, carbsG: 7.5, fatG: 2, amount: 100, unit: 'g' },
    per100Reference: { kcal: 60, proteinG: 3, carbsG: 7.5, fatG: 2, amount: 100, unit: 'g' },
    servingReference: { kcal: 120, proteinG: 6, carbsG: 15, fatG: 4, amount: 200, unit: 'g' },
  };

  function predictionWithDiagnostics(
    diagnostics: Record<string, unknown>,
    source: 'meal' | 'label' = 'label',
  ) {
    return {
      parseStatus: 'success', source, decision: 'needs_review',
      kcal: 240, proteinG: 12, carbsG: 30, fatG: 8,
      diagnostics,
    };
  }

  // Production bug caught: prediction diagnostics currently accept no strict
  // raw evidence contract, allowing model names/paths/arbitrary text to leak.
  it('accepts complete numeric diagnostics and rejects unknown or nonnumeric evidence', () => {
    expect(NutritionPredictionSchema.safeParse(predictionWithDiagnostics(completeDiagnostics)).success).toBe(true);
    for (const invalid of [
      { ...completeDiagnostics, name: 'Secret food' },
      { ...completeDiagnostics, rawText: 'provider output' },
      { ...completeDiagnostics, path: '/private/image.jpg' },
      { ...completeDiagnostics, url: 'https://private.example/image.jpg' },
      { ...completeDiagnostics, rawNutrients: { ...rawNutrients, carbsG: '30' } },
      { ...completeDiagnostics, rawNutrients: { ...rawNutrients, fatG: -1 } },
      { ...completeDiagnostics, rawNutrients: { kcal: 1, proteinG: 2, carbsG: 3 } },
      { ...completeDiagnostics, rawNutrients: { ...rawNutrients, kcal: Number.POSITIVE_INFINITY } },
      { ...completeDiagnostics, detectedItemCount: 1.5 },
      { ...completeDiagnostics, detectedItemCount: -1 },
      { ...completeDiagnostics, detectedItemCount: undefined },
      { ...completeDiagnostics, estimatedTotalMassG: 0 },
      { ...completeDiagnostics, estimatedTotalMassG: Number.NaN },
    ]) {
      expect(NutritionPredictionSchema.safeParse(predictionWithDiagnostics(invalid)).success).toBe(false);
    }
  });

  // Production bug caught: partial declared/observed tuples and references can
  // be serialized as plausible but unverifiable nutrition evidence.
  it('enforces all-or-none tuples, references, and item-count mass invariants', () => {
    const absentMass = { ...completeDiagnostics, detectedItemCount: 0 };
    delete absentMass.estimatedTotalMassG;
    expect(NutritionPredictionSchema.safeParse(predictionWithDiagnostics(absentMass)).success).toBe(true);
    for (const invalid of [
      { ...completeDiagnostics, declaredBasis: undefined },
      { ...completeDiagnostics, declaredAmount: undefined },
      { ...completeDiagnostics, declaredUnit: undefined },
      { ...completeDiagnostics, observedAmount: undefined },
      { ...completeDiagnostics, observedUnit: undefined },
      { ...completeDiagnostics, declaredAmount: Number.POSITIVE_INFINITY },
      { ...completeDiagnostics, packageReference: { kcal: 60, proteinG: 3, carbsG: 7.5, amount: 100, unit: 'g' } },
      { ...completeDiagnostics, packageReference: { ...completeDiagnostics.packageReference, amount: 0 } },
      { ...completeDiagnostics, per100Reference: { ...completeDiagnostics.per100Reference, unit: 'portion' } },
      { ...completeDiagnostics, servingReference: { ...completeDiagnostics.servingReference, kcal: Number.POSITIVE_INFINITY } },
      { ...completeDiagnostics, detectedItemCount: 0 },
    ]) {
      expect(NutritionPredictionSchema.safeParse(predictionWithDiagnostics(invalid)).success).toBe(false);
    }
  });

  it('accepts only canonical declared nutrition tuples', () => {
    for (const diagnostics of [
      { rawNutrients, declaredBasis: 'portion', declaredAmount: 1, declaredUnit: 'portion' },
      { rawNutrients, declaredBasis: 'per100g', declaredAmount: 100, declaredUnit: 'g' },
      { rawNutrients, declaredBasis: 'per100g', declaredAmount: 100, declaredUnit: 'ml' },
      { rawNutrients, declaredBasis: 'package', declaredAmount: 330, declaredUnit: 'ml' },
    ]) {
      expect(NutritionPredictionSchema.safeParse(predictionWithDiagnostics(diagnostics)).success).toBe(true);
    }
    for (const diagnostics of [
      { rawNutrients, declaredBasis: 'portion', declaredAmount: 330, declaredUnit: 'ml' },
      { rawNutrients, declaredBasis: 'per100g', declaredAmount: 99, declaredUnit: 'g' },
      { rawNutrients, declaredBasis: 'package', declaredAmount: 1, declaredUnit: 'portion' },
    ]) {
      expect(NutritionPredictionSchema.safeParse(predictionWithDiagnostics(diagnostics)).success).toBe(false);
    }
  });

  // Production bug caught: DiagnosticMetric currently has no zero-aware and
  // arithmetic-consistency validation, so contradictory ratios are accepted.
  it('validates zero-aware DiagnosticMetric arithmetic and complete density vectors', () => {
    const metric = (predicted: number, truth: number) => ({
      predicted,
      truth,
      absoluteError: Math.abs(predicted - truth),
      ...(truth > 0 ? {
        ratioToTruth: predicted / truth,
        relativeError: Math.abs(predicted - truth) / truth,
      } : {}),
    });
    const mealResult = {
      caseId: 'diagnostic-case',
      prediction: predictionWithDiagnostics({
        rawNutrients, detectedItemCount: 2, estimatedTotalMassG: 400,
        declaredBasis: 'portion', declaredAmount: 1, declaredUnit: 'portion',
      }, 'meal'),
      numeric: {},
      safety: { catastrophicCalorieMiss: false, unsafeCompletion: false },
      booleans: {},
      diagnostics: {
        mealMassG: metric(400, 500),
        mealDensityPer100: {
          kcal: metric(60, 50), proteinG: metric(3, 2), carbsG: metric(7.5, 6), fatG: metric(2, 1),
        },
        mealDominantDriver: 'equal',
      },
    };
    const labelResult = {
      ...mealResult,
      caseId: 'label-diagnostic-case',
      prediction: predictionWithDiagnostics(completeDiagnostics, 'label'),
      diagnostics: {
        labelPer100: {
          kcal: metric(60, 60), proteinG: metric(0, 0), carbsG: metric(7.5, 7.5), fatG: metric(0, 0),
        },
      },
    };
    expect(NutritionCaseResultSchema.safeParse(mealResult).success).toBe(true);
    expect(NutritionCaseResultSchema.safeParse(labelResult).success).toBe(true);
    expect(NutritionCaseResultSchema.safeParse(mealResult).success).toBe(true);
    for (const driver of ['mass_dominated', 'density_dominated', 'mass', 'density', 'other']) {
      expect(NutritionCaseResultSchema.safeParse({
        ...mealResult,
        diagnostics: { ...mealResult.diagnostics, mealDominantDriver: driver },
      }).success).toBe(false);
    }
    expect(NutritionCaseResultSchema.safeParse({
      ...mealResult,
      diagnostics: { ...mealResult.diagnostics, mealMassG: { ...mealResult.diagnostics.mealMassG, absoluteError: 99 } },
    }).success).toBe(false);
    expect(NutritionCaseResultSchema.safeParse({
      ...labelResult,
      diagnostics: { ...labelResult.diagnostics, labelPer100: { ...labelResult.diagnostics.labelPer100, proteinG: { predicted: 1, truth: 0, absoluteError: 1, ratioToTruth: 1, relativeError: 1 } } },
    }).success).toBe(false);
    expect(NutritionCaseResultSchema.safeParse({
      ...mealResult,
      diagnostics: { ...mealResult.diagnostics, mealDominantDriver: 'mass' },
    }).success).toBe(false);
    expect(NutritionCaseResultSchema.safeParse({
      ...mealResult,
      diagnostics: { ...mealResult.diagnostics, mealDensityPer100: { ...mealResult.diagnostics.mealDensityPer100, fatG: undefined } },
    }).success).toBe(false);
    expect(NutritionCaseResultSchema.safeParse({
      ...mealResult,
      diagnostics: { ...mealResult.diagnostics, mealMassG: { predicted: 400, truth: 500, absoluteError: 100 } },
    }).success).toBe(false);
    expect(NutritionCaseResultSchema.safeParse({
      ...mealResult,
      diagnostics: { ...mealResult.diagnostics, mealMassG: { ...mealResult.diagnostics.mealMassG, ratioToTruth: 9 } },
    }).success).toBe(false);
    expect(NutritionCaseResultSchema.safeParse({
      ...mealResult,
      diagnostics: { ...mealResult.diagnostics, mealDominantDriver: 'mass_dominated', mealMassG: undefined },
    }).success).toBe(false);
    expect(NutritionCaseResultSchema.safeParse({
      ...mealResult,
      diagnostics: { ...mealResult.diagnostics, labelPer100: { ...labelResult.diagnostics.labelPer100 } },
    }).success).toBe(false);
    expect(NutritionCaseResultSchema.safeParse({
      ...labelResult,
      diagnostics: { ...labelResult.diagnostics, mealMassG: mealResult.diagnostics.mealMassG },
    }).success).toBe(false);
  });

  it('uses dimensionless tolerance for ratios and accepts tiny arithmetic', () => {
    const result = validMealResult();
    expect(NutritionCaseResultSchema.safeParse({
      ...result,
      diagnostics: {
        ...result.diagnostics,
        mealMassG: {
          predicted: 1e12, truth: 1e12, absoluteError: 0, ratioToTruth: 999, relativeError: 998,
        },
        mealDominantDriver: 'mass_dominated',
      },
    }).success).toBe(false);
    expect(NutritionCaseResultSchema.safeParse({
      ...result,
      diagnostics: {
        ...result.diagnostics,
        mealMassG: {
          predicted: 1e-12, truth: 2e-12, absoluteError: 1e-12, ratioToTruth: 0.5, relativeError: 0.5,
        },
        mealDominantDriver: 'mass_dominated',
      },
    }).success).toBe(true);
    expect(NutritionCaseResultSchema.safeParse({
      ...result,
      diagnostics: {
        ...result.diagnostics,
        mealMassG: {
          predicted: Number.MAX_VALUE,
          truth: Number.MIN_VALUE,
          absoluteError: Number.MAX_VALUE,
          ratioToTruth: Number.MAX_VALUE,
          relativeError: Number.MAX_VALUE,
        },
        mealDominantDriver: 'mass_dominated',
      },
    }).success).toBe(false);
  });

  it('requires the exact meal driver and permits a zero-kcal density without one', () => {
    const result = validMealResult();
    expect(NutritionCaseResultSchema.safeParse({
      ...result,
      diagnostics: { ...result.diagnostics, mealDominantDriver: undefined },
    }).success).toBe(false);
    const densityDominated = {
      ...result,
      diagnostics: {
        ...result.diagnostics,
        mealMassG: { predicted: 400, truth: 400, absoluteError: 0, ratioToTruth: 1, relativeError: 0 },
        mealDensityPer100: {
          ...result.diagnostics.mealDensityPer100,
          kcal: { predicted: 25, truth: 50, absoluteError: 25, ratioToTruth: 0.5, relativeError: 0.5 },
        },
        mealDominantDriver: 'mass_dominated',
      },
    };
    expect(NutritionCaseResultSchema.safeParse(densityDominated).success).toBe(false);
    expect(NutritionCaseResultSchema.safeParse({
      ...densityDominated,
      diagnostics: { ...densityDominated.diagnostics, mealDominantDriver: 'density_dominated' },
    }).success).toBe(true);

    const zeroKcal = {
      ...result,
      diagnostics: {
        ...result.diagnostics,
        mealDensityPer100: {
          ...result.diagnostics.mealDensityPer100,
          kcal: { predicted: 0, truth: 0, absoluteError: 0 },
        },
        mealDominantDriver: undefined,
      },
    };
    expect(NutritionCaseResultSchema.safeParse(zeroKcal).success).toBe(true);
  });

  function validMealResult() {
    const metric = (predicted: number, truth: number) => ({
      predicted, truth, absoluteError: Math.abs(predicted - truth),
      ...(truth > 0 ? { ratioToTruth: predicted / truth, relativeError: Math.abs(predicted - truth) / truth } : {}),
    });
    return {
      caseId: 'metric-validation-case',
      prediction: predictionWithDiagnostics({
        rawNutrients, detectedItemCount: 1, estimatedTotalMassG: 400,
        declaredBasis: 'portion', declaredAmount: 1, declaredUnit: 'portion',
      }, 'meal'),
      numeric: {},
      safety: { catastrophicCalorieMiss: false, unsafeCompletion: false },
      booleans: {},
      diagnostics: {
        mealMassG: metric(400, 500),
        mealDensityPer100: {
          kcal: metric(60, 50), proteinG: metric(3, 2), carbsG: metric(7.5, 6), fatG: metric(2, 1),
        },
        mealDominantDriver: 'equal',
      },
    };
  }

  // Production bug caught: metric validation currently accepts malformed
  // finite values, partial ratio pairs, contradictory arithmetic, and unknown reference keys.
  it.each([
    ['negative predicted', (result: ReturnType<typeof validMealResult>) => ({
      ...result, diagnostics: { ...result.diagnostics, mealMassG: { ...result.diagnostics.mealMassG, predicted: -1 } },
    })],
    ['nonfinite truth', (result: ReturnType<typeof validMealResult>) => ({
      ...result, diagnostics: { ...result.diagnostics, mealMassG: { ...result.diagnostics.mealMassG, truth: Number.POSITIVE_INFINITY } },
    })],
    ['nonfinite predicted', (result: ReturnType<typeof validMealResult>) => ({
      ...result, diagnostics: { ...result.diagnostics, mealMassG: { ...result.diagnostics.mealMassG, predicted: Number.POSITIVE_INFINITY } },
    })],
    ['nonfinite absolute error', (result: ReturnType<typeof validMealResult>) => ({
      ...result, diagnostics: { ...result.diagnostics, mealMassG: { ...result.diagnostics.mealMassG, absoluteError: Number.NaN } },
    })],
    ['ratio without relative error', (result: ReturnType<typeof validMealResult>) => ({
      ...result, diagnostics: { ...result.diagnostics, mealMassG: { predicted: 400, truth: 500, absoluteError: 100, ratioToTruth: 0.8 } },
    })],
    ['relative error without ratio', (result: ReturnType<typeof validMealResult>) => ({
      ...result, diagnostics: { ...result.diagnostics, mealMassG: { predicted: 400, truth: 500, absoluteError: 100, relativeError: 0.2 } },
    })],
    ['negative truth', (result: ReturnType<typeof validMealResult>) => ({
      ...result, diagnostics: { ...result.diagnostics, mealMassG: { ...result.diagnostics.mealMassG, truth: -1 } },
    })],
    ['negative absolute error', (result: ReturnType<typeof validMealResult>) => ({
      ...result, diagnostics: { ...result.diagnostics, mealMassG: { ...result.diagnostics.mealMassG, absoluteError: -1 } },
    })],
    ['wrong relative error', (result: ReturnType<typeof validMealResult>) => ({
      ...result, diagnostics: { ...result.diagnostics, mealMassG: { ...result.diagnostics.mealMassG, relativeError: 4 } },
    })],
    ['driver missing mass context', (result: ReturnType<typeof validMealResult>) => ({
      ...result, diagnostics: { ...result.diagnostics, mealMassG: undefined },
    })],
    ['driver missing density context', (result: ReturnType<typeof validMealResult>) => ({
      ...result, diagnostics: { ...result.diagnostics, mealDensityPer100: undefined },
    })],
  ])('rejects individually invalid diagnostic case: %s', (_label, mutate) => {
    expect(NutritionCaseResultSchema.safeParse(mutate(validMealResult())).success).toBe(false);
  });

  it('rejects empty case diagnostics', () => {
    expect(NutritionCaseResultSchema.safeParse({
      ...validMealResult(),
      diagnostics: {},
    }).success).toBe(false);
  });

  // Production bug caught: nested reference objects currently accept unknown
  // provenance keys; this must fail only after the otherwise-valid fixture is enriched.
  it('rejects an unknown nested reference key while accepting the clean label fixture', () => {
    const meal = validMealResult();
    const clean = {
      ...meal,
      prediction: predictionWithDiagnostics(completeDiagnostics, 'label'),
      diagnostics: {
        labelPer100: {
          kcal: { predicted: 60, truth: 60, absoluteError: 0, ratioToTruth: 1, relativeError: 0 },
          proteinG: { predicted: 0, truth: 0, absoluteError: 0 },
          carbsG: { predicted: 7.5, truth: 7.5, absoluteError: 0, ratioToTruth: 1, relativeError: 0 },
          fatG: { predicted: 0, truth: 0, absoluteError: 0 },
        },
      },
    };
    expect(NutritionCaseResultSchema.safeParse(clean).success).toBe(true);
    expect(NutritionCaseResultSchema.safeParse({
      ...clean,
      prediction: predictionWithDiagnostics({
        ...completeDiagnostics,
        packageReference: { ...completeDiagnostics.packageReference, producer: 'secret' },
      }, 'label'),
    }).success).toBe(false);
  });
});
