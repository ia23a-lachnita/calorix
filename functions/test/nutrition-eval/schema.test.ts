import { describe, expect, it } from 'vitest';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  CalibrationInfoSchema,
  CalibrationSourceLockSchema,
  NutritionCaseResultSchema,
  NutritionEvalReportSchema,
  NutritionPredictionSchema,
  StrictCalibrationManifestSchema,
  hashCalibrationSourceLock,
  hashStrictCalibrationManifest,
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

describe('Task 2 calibration identity and zero-safe schema', () => {
  const testDir = dirname(fileURLToPath(import.meta.url));
  const historicalPath = join(testDir, 'fixtures', 'historical-report-v1.json');

  function zeroSafeSummary() {
    return {
      medianProteinRelativeError: 0.1,
      medianCarbsRelativeError: 0.2,
      medianFatRelativeError: 0.3,
      meanZeroSafeMacroRelativeError: 0,
      zeroSafeEligiblePairs: 3,
      proteinEligibleCount: 1,
      carbsEligibleCount: 1,
      fatEligibleCount: 1,
      proteinZeroTruthCount: 0,
      carbsZeroTruthCount: 0,
      fatZeroTruthCount: 0,
      parsedMealCount: 1,
      mealMassEligibleCount: 0,
      mealCarbDensityEligibleCount: 0,
      mealFatDensityEligibleCount: 0,
      mealDensityCoverageCount: 0,
    };
  }

  function calibrationIdentity(overrides: Record<string, unknown> = {}) {
    return {
      protocolVersion: 'calorix-gemini-38-calibration-v1',
      project: 'calorix-xurschnell',
      location: 'us',
      model: 'gemini-3.8-flash',
      thinkingLevel: 'LOW',
      schemaHash: 'a'.repeat(64),
      stage: 'development',
      imageCallsReserved: 1,
      imageCallsCompleted: 1,
      imageCallsFailed: 0,
      ...overrides,
    };
  }

  function validCalibrationReport(overrides: Record<string, unknown> = {}) {
    const truth = {
      basis: 'portion', amount: 1, unit: 'portion',
      kcal: 100, proteinG: 10, carbsG: 20, fatG: 5,
    };
    const base = {
      version: 1,
      runId: 'calibration-run',
      timestamp: '2026-09-23T12:00:00.000Z',
      datasetId: 'calorix-n5k-calibration-v1',
      datasetHash: 'b'.repeat(64),
      adapterModelId: 'gemini-3.8-flash',
      promptHash: 'c'.repeat(64),
      codeSha: 'd'.repeat(40),
      samples: 1,
      baselineOnly: true,
      publicCases: 1,
      privateCases: 0,
      calibration: calibrationIdentity(),
      summary: {
        totalCases: 1,
        runCases: 1,
        parseCases: 1,
        basisAccuracyDenom: 0,
        barcodeAccuracyDenom: 0,
        medianAbsoluteCalorieError: 0,
        medianRelativeCalorieError: 0,
        p90AbsoluteCalorieError: 0,
        p90RelativeCalorieError: 0,
        meanMacroRelativeError: 0.2,
        reviewRate: 0,
        catastrophicCount: 0,
        unsafeCompletionCount: 0,
        failuresByCategory: {},
        failuresByCode: {},
        ...zeroSafeSummary(),
      },
      cases: [
        {
          caseId: 'calibration-case',
          prediction: { parseStatus: 'success', source: 'meal', kcal: 100, proteinG: 10, carbsG: 20, fatG: 5, decision: 'complete' },
          truth,
          numeric: {
            kcal: { ratioToTruth: 1, absoluteError: 0, relativeError: 0 },
            proteinG: { ratioToTruth: 1, absoluteError: 0, relativeError: 0 },
            carbsG: { ratioToTruth: 1, absoluteError: 0, relativeError: 0 },
            fatG: { ratioToTruth: 1, absoluteError: 0, relativeError: 0 },
          },
          safety: { catastrophicCalorieMiss: false, unsafeCompletion: false },
          booleans: {},
        },
      ],
      ...overrides,
    };
    return base;
  }

  it('parses the historical v1 fixture unchanged', () => {
    const source = readFileSync(historicalPath, 'utf8');
    const parsed = NutritionEvalReportSchema.parse(JSON.parse(source));
    expect(parsed.version).toBe(1);
    expect(parsed.runId).toBe('run-2026-09-02T04-44-02-551Z');
    expect(parsed.cases).toHaveLength(20);
    expect(parsed.publicCases).toBe(20);
    expect(parsed.privateCases).toBe(0);
    expect(parsed.calibration).toBeUndefined();
  });

  it.each([
    ['only publicCases', (raw: Record<string, unknown>) => ({ ...raw, publicCases: 20 })],
    ['only privateCases', (raw: Record<string, unknown>) => ({ ...raw, privateCases: 0 })],
  ])('rejects version-1 reports missing %s', (_label, withOneField) => {
    const source = readFileSync(historicalPath, 'utf8');
    const raw = JSON.parse(source) as Record<string, unknown>;
    expect(NutritionEvalReportSchema.safeParse(withOneField(raw)).success).toBe(false);
  });

  it('rejects calibration reports missing density eligible denominators', () => {
    const complete = validCalibrationReport() as Record<string, unknown>;
    const summary = { ...(complete['summary'] as Record<string, unknown>) };
    delete summary['mealCarbDensityEligibleCount'];
    delete summary['mealFatDensityEligibleCount'];
    expect(NutritionEvalReportSchema.safeParse({ ...complete, summary }).success).toBe(false);
  });

  it('accepts a complete calibration report with identity, truth, call accounting, and zero-safe summary', () => {
    expect(NutritionEvalReportSchema.safeParse(validCalibrationReport()).success).toBe(true);
  });

  it.each([
    ['project', { calibration: calibrationIdentity({ project: undefined }) }],
    ['location', { calibration: calibrationIdentity({ location: undefined }) }],
    ['model', { calibration: calibrationIdentity({ model: undefined }) }],
    ['thinkingLevel', { calibration: calibrationIdentity({ thinkingLevel: undefined }) }],
    ['schemaHash', { calibration: calibrationIdentity({ schemaHash: undefined }) }],
    ['stage', { calibration: calibrationIdentity({ stage: undefined }) }],
    ['call counts', { calibration: { ...calibrationIdentity(), imageCallsReserved: undefined } }],
    ['truth', { cases: [{ caseId: 'calibration-case', prediction: { parseStatus: 'success', source: 'meal', kcal: 100, decision: 'complete' }, numeric: {}, safety: { catastrophicCalorieMiss: false, unsafeCompletion: false }, booleans: {} }] }],
    ['zero-safe summary', { summary: { totalCases: 1, runCases: 1, parseCases: 1, basisAccuracyDenom: 0, barcodeAccuracyDenom: 0, medianAbsoluteCalorieError: 0, medianRelativeCalorieError: 0, p90AbsoluteCalorieError: 0, p90RelativeCalorieError: 0, meanMacroRelativeError: 0.2, reviewRate: 0, catastrophicCount: 0, unsafeCompletionCount: 0, failuresByCategory: {}, failuresByCode: {} } }],
  ])('rejects calibration reports missing %s', (_label, override) => {
    expect(NutritionEvalReportSchema.safeParse(validCalibrationReport(override)).success).toBe(false);
  });

  it('rejects calibration reports with both publicCases and privateCases omitted', () => {
    const report = validCalibrationReport() as Record<string, unknown>;
    delete report['publicCases'];
    delete report['privateCases'];
    expect(NutritionEvalReportSchema.safeParse(report).success).toBe(false);
  });

  it.each([
    ['wrong project', calibrationIdentity({ project: 'other-project' })],
    ['wrong location', calibrationIdentity({ location: 'global' })],
    ['wrong model', calibrationIdentity({ model: 'gemini-2.5-flash' })],
    ['wrong thinking level', calibrationIdentity({ thinkingLevel: 'HIGH' })],
    ['wrong protocol', calibrationIdentity({ protocolVersion: 'other-v1' })],
  ])('rejects calibration reports with %s', (_label, calibration) => {
    expect(NutritionEvalReportSchema.safeParse(validCalibrationReport({ calibration })).success).toBe(false);
  });
});

describe('Task 2 correction RED: calibration bounds and conditional population metrics', () => {
function correctedSummary(overrides: Record<string, unknown> = {}) {
    return {
      totalCases: 1,
      runCases: 1,
      parseCases: 1,
      basisAccuracyDenom: 0,
      barcodeAccuracyDenom: 0,
      medianAbsoluteCalorieError: 0,
      medianRelativeCalorieError: 0,
      p90AbsoluteCalorieError: 0,
      p90RelativeCalorieError: 0,
      meanMacroRelativeError: 0.2,
      reviewRate: 0,
      catastrophicCount: 0,
      unsafeCompletionCount: 0,
      failuresByCategory: {},
      failuresByCode: {},
      medianProteinRelativeError: 0.1,
      medianCarbsRelativeError: 0.2,
      medianFatRelativeError: 0.3,
      meanZeroSafeMacroRelativeError: 0.2,
      zeroSafeEligiblePairs: 3,
      proteinEligibleCount: 1,
      carbsEligibleCount: 1,
      fatEligibleCount: 1,
      proteinZeroTruthCount: 0,
      carbsZeroTruthCount: 0,
      fatZeroTruthCount: 0,
      meanMealMassRelativeError: 0.25,
      medianMealMassRelativeError: 0.25,
      mealMassEligibleCount: 1,
      parsedMealCount: 1,
      meanMealCarbDensityRelativeError: 0.04,
      meanMealFatDensityRelativeError: 0.36,
      mealCarbDensityEligibleCount: 1,
      mealFatDensityEligibleCount: 1,
      mealDensityCoverageCount: 1,
      ...overrides,
    };
  }

  function correctedCalibrationIdentity(overrides: Record<string, unknown> = {}) {
    return {
      protocolVersion: 'calorix-gemini-38-calibration-v1',
      project: 'calorix-xurschnell',
      location: 'us',
      model: 'gemini-3.8-flash',
      thinkingLevel: 'LOW',
      schemaHash: 'a'.repeat(64),
      stage: 'development',
      imageCallsReserved: 1,
      imageCallsCompleted: 1,
      imageCallsFailed: 0,
      ...overrides,
    };
  }

  function correctedReport(overrides: Record<string, unknown> = {}) {
    const truth = {
      basis: 'portion', amount: 1, unit: 'portion',
      kcal: 100, proteinG: 10, carbsG: 20, fatG: 5, referenceMassG: 400,
    };
    const base: Record<string, unknown> = {
      version: 1,
      runId: 'calibration-run',
      timestamp: '2026-09-23T12:00:00.000Z',
      datasetId: 'calorix-n5k-calibration-v1',
      datasetHash: 'b'.repeat(64),
      adapterModelId: 'gemini-3.8-flash',
      promptHash: 'c'.repeat(64),
      codeSha: 'd'.repeat(40),
      samples: 1,
      baselineOnly: true,
      publicCases: 1,
      privateCases: 0,
      calibration: correctedCalibrationIdentity(),
      summary: correctedSummary(),
      cases: [
        {
          caseId: 'calibration-case',
          prediction: { parseStatus: 'success', source: 'meal', kcal: 100, proteinG: 10, carbsG: 20, fatG: 5, decision: 'complete' },
          truth,
          numeric: {
            kcal: { ratioToTruth: 1, absoluteError: 0, relativeError: 0 },
            proteinG: { ratioToTruth: 1, absoluteError: 0, relativeError: 0 },
            carbsG: { ratioToTruth: 1, absoluteError: 0, relativeError: 0 },
            fatG: { ratioToTruth: 1, absoluteError: 0, relativeError: 0 },
          },
          safety: { catastrophicCalorieMiss: false, unsafeCompletion: false },
          booleans: {},
          diagnostics: {
            mealMassG: { predicted: 500, truth: 400, absoluteError: 100, ratioToTruth: 1.25, relativeError: 0.25 },
            mealDensityPer100: {
              kcal: { predicted: 25, truth: 25, absoluteError: 0, ratioToTruth: 1, relativeError: 0 },
              proteinG: { predicted: 2.5, truth: 2.5, absoluteError: 0, ratioToTruth: 1, relativeError: 0 },
              carbsG: { predicted: 5.2, truth: 5, absoluteError: 0.2, ratioToTruth: 1.04, relativeError: 0.04 },
              fatG: { predicted: 1.7, truth: 1.25, absoluteError: 0.45, ratioToTruth: 1.36, relativeError: 0.36 },
            },
            mealDominantDriver: 'mass_dominated',
          },
        },
      ],
      ...overrides,
    };
    return base;
  }

  it('accepts a possible one-case calibration report with conditional metrics omitted for zero counts', () => {
    expect(NutritionEvalReportSchema.safeParse(correctedReport()).success).toBe(true);
  });

  it('requires adapterModelId to equal calibration.model', () => {
    expect(NutritionEvalReportSchema.safeParse(
      correctedReport({ adapterModelId: 'gemini-2.5-flash' }),
    ).success).toBe(false);
  });

  it('rejects completed+failed exceeding reserved', () => {
    expect(NutritionEvalReportSchema.safeParse(
      correctedReport({ calibration: correctedCalibrationIdentity({ imageCallsReserved: 1, imageCallsCompleted: 1, imageCallsFailed: 1 }) }),
    ).success).toBe(false);
  });

  it('rejects reserved exceeding runCases', () => {
    expect(NutritionEvalReportSchema.safeParse(
      correctedReport({ calibration: correctedCalibrationIdentity({ imageCallsReserved: 2, imageCallsCompleted: 1, imageCallsFailed: 0 }) }),
    ).success).toBe(false);
  });

  it('rejects imageCallsReserved above the 300 ceiling in isolation', () => {
    expect(CalibrationInfoSchema.safeParse(
      correctedCalibrationIdentity({ imageCallsReserved: 301, imageCallsCompleted: 200, imageCallsFailed: 0 }),
    ).success).toBe(false);
    expect(CalibrationInfoSchema.safeParse(
      correctedCalibrationIdentity({ imageCallsReserved: 300, imageCallsCompleted: 200, imageCallsFailed: 0 }),
    ).success).toBe(true);
  });

  it('requires zeroSafeEligiblePairs to equal the sum of per-macro eligible counts', () => {
    expect(NutritionEvalReportSchema.safeParse(
      correctedReport({ summary: correctedSummary({ zeroSafeEligiblePairs: 2 }) }),
    ).success).toBe(false);
  });

  it('rejects per-macro eligible+zeroTruth exceeding parseCases', () => {
    expect(NutritionEvalReportSchema.safeParse(
      correctedReport({ summary: correctedSummary({ proteinEligibleCount: 1, proteinZeroTruthCount: 1, zeroSafeEligiblePairs: 3 }) }),
    ).success).toBe(false);
  });

  it('rejects mealMassEligible exceeding parsedMealCount and parsedMealCount exceeding parseCases', () => {
    expect(NutritionEvalReportSchema.safeParse(
      correctedReport({ summary: correctedSummary({ mealMassEligibleCount: 2, parsedMealCount: 1 }) }),
    ).success).toBe(false);
    expect(NutritionEvalReportSchema.safeParse(
      correctedReport({ summary: correctedSummary({ parsedMealCount: 2, mealMassEligibleCount: 2, mealDensityCoverageCount: 2, mealCarbDensityEligibleCount: 2, mealFatDensityEligibleCount: 2 }) }),
    ).success).toBe(false);
  });

  it('rejects density eligible exceeding coverage and coverage exceeding parsedMealCount', () => {
    expect(NutritionEvalReportSchema.safeParse(
      correctedReport({ summary: correctedSummary({ mealCarbDensityEligibleCount: 2 }) }),
    ).success).toBe(false);
    expect(NutritionEvalReportSchema.safeParse(
      correctedReport({ summary: correctedSummary({ mealDensityCoverageCount: 2, mealMassEligibleCount: 1, mealCarbDensityEligibleCount: 1, mealFatDensityEligibleCount: 1 }) }),
    ).success).toBe(false);
  });

  it('requires counts while omitting population metrics for zero counts', () => {
    const summary = correctedSummary() as Record<string, unknown>;
    delete summary['proteinEligibleCount'];
    expect(NutritionEvalReportSchema.safeParse(correctedReport({ summary })).success).toBe(false);
    // Zero-count population metric must be absent.
    expect(NutritionEvalReportSchema.safeParse(
      correctedReport({ summary: correctedSummary({ proteinZeroTruthMeanAbsoluteError: 0 }) }),
    ).success).toBe(false);
  });

  it('requires population metrics when counts are positive', () => {
    const summary = correctedSummary() as Record<string, unknown>;
    delete summary['medianProteinRelativeError'];
    expect(NutritionEvalReportSchema.safeParse(correctedReport({ summary })).success).toBe(false);
    const noPooled = correctedSummary() as Record<string, unknown>;
    delete noPooled['meanZeroSafeMacroRelativeError'];
    expect(NutritionEvalReportSchema.safeParse(correctedReport({ summary: noPooled })).success).toBe(false);
    const noMass = correctedSummary() as Record<string, unknown>;
    delete noMass['meanMealMassRelativeError'];
    expect(NutritionEvalReportSchema.safeParse(correctedReport({ summary: noMass })).success).toBe(false);
    const noCarbDensity = correctedSummary() as Record<string, unknown>;
    delete noCarbDensity['meanMealCarbDensityRelativeError'];
    expect(NutritionEvalReportSchema.safeParse(correctedReport({ summary: noCarbDensity })).success).toBe(false);
  });
});

const NUTRITION5K_BASE_URL_FOR_TEST = 'https://storage.googleapis.com/nutrition5k_dataset/nutrition5k_dataset/';
const STABLE_RETRIEVED_AT_FOR_TEST = '2026-09-23T00:00:00.000Z';

describe('Task 4 strict calibration source-lock/manifest schema', () => {
  function validSourceObject(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      path: 'dish_ids/splits/rgb_train_ids.txt',
      url: `${NUTRITION5K_BASE_URL_FOR_TEST}dish_ids/splits/rgb_train_ids.txt`,
      sha256: 'a'.repeat(64),
      byteLength: 1024,
      ...overrides,
    };
  }

  function validSkippedImage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    const merged: Record<string, unknown> = {
      dishId: 'dish_9000000001',
      stratum: { componentBin: 0, calorieBin: 0, macroBin: 0 },
      reason: 'http_error',
      status: 404,
      ...overrides,
    };
    // An override explicitly set to `undefined` means "omit this key", not
    // "set it to the literal value undefined" (which zod's strict object
    // shape would otherwise still see as a present key).
    for (const key of Object.keys(merged)) {
      if (merged[key] === undefined) delete merged[key];
    }
    return merged;
  }

  function validSourceLock(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      version: 1,
      datasetId: 'calorix-n5k-calibration-v1',
      baseUrl: NUTRITION5K_BASE_URL_FOR_TEST,
      retrievalProvenance: {
        retrievedAt: STABLE_RETRIEVED_AT_FOR_TEST,
        baseUrl: NUTRITION5K_BASE_URL_FOR_TEST,
      },
      sources: {
        trainSplit: validSourceObject({
          path: 'dish_ids/splits/rgb_train_ids.txt',
          url: `${NUTRITION5K_BASE_URL_FOR_TEST}dish_ids/splits/rgb_train_ids.txt`,
          sha256: 'a'.repeat(64),
        }),
        metadataCafe1: validSourceObject({
          path: 'metadata/dish_metadata_cafe1.csv',
          url: `${NUTRITION5K_BASE_URL_FOR_TEST}metadata/dish_metadata_cafe1.csv`,
          sha256: 'b'.repeat(64),
        }),
        metadataCafe2: validSourceObject({
          path: 'metadata/dish_metadata_cafe2.csv',
          url: `${NUTRITION5K_BASE_URL_FOR_TEST}metadata/dish_metadata_cafe2.csv`,
          sha256: 'c'.repeat(64),
        }),
      },
      skippedImages: [] as unknown[],
      excludedDishes: [] as unknown[],
      ...overrides,
    };
  }

  it('accepts a well-formed calibration source lock', () => {
    expect(CalibrationSourceLockSchema.safeParse(validSourceLock()).success).toBe(true);
  });

  it('rejects an unknown top-level key on the source lock instead of stripping it', () => {
    const withExtra = { ...validSourceLock(), unexpectedField: 'nope' };
    expect(CalibrationSourceLockSchema.safeParse(withExtra).success).toBe(false);
  });

  it('rejects an unknown key nested inside a source object instead of stripping it', () => {
    const lock = validSourceLock();
    const sources = lock['sources'] as Record<string, unknown>;
    const trainSplit = sources['trainSplit'] as Record<string, unknown>;
    const tampered = {
      ...lock,
      sources: { ...sources, trainSplit: { ...trainSplit, extra: 'nope' } },
    };
    expect(CalibrationSourceLockSchema.safeParse(tampered).success).toBe(false);
  });

  it('requires the exact three official source paths, not merely well-formed URLs', () => {
    const lock = validSourceLock();
    const sources = lock['sources'] as Record<string, unknown>;
    const trainSplit = sources['trainSplit'] as Record<string, unknown>;
    const wrongPath = {
      ...lock,
      sources: { ...sources, trainSplit: { ...trainSplit, path: 'dish_ids/splits/wrong.txt' } },
    };
    expect(CalibrationSourceLockSchema.safeParse(wrongPath).success).toBe(false);
  });

  it('requires the exact datasetId on the source lock', () => {
    const wrongDatasetId = validSourceLock({ datasetId: 'wrong-dataset-id' });
    expect(CalibrationSourceLockSchema.safeParse(wrongDatasetId).success).toBe(false);

    const missingDatasetId = validSourceLock();
    delete missingDatasetId['datasetId'];
    expect(CalibrationSourceLockSchema.safeParse(missingDatasetId).success).toBe(false);
  });

  it('requires retrievalProvenance with a stable ISO retrievedAt and the exact base URL', () => {
    expect(CalibrationSourceLockSchema.safeParse(validSourceLock()).success).toBe(true);

    const withoutProvenance = validSourceLock();
    delete withoutProvenance['retrievalProvenance'];
    expect(CalibrationSourceLockSchema.safeParse(withoutProvenance).success).toBe(false);

    const wrongBaseUrl = validSourceLock({
      retrievalProvenance: { retrievedAt: STABLE_RETRIEVED_AT_FOR_TEST, baseUrl: 'https://example.com/wrong/' },
    });
    expect(CalibrationSourceLockSchema.safeParse(wrongBaseUrl).success).toBe(false);

    const nonIsoRetrievedAt = validSourceLock({
      retrievalProvenance: { retrievedAt: 'not-a-date', baseUrl: NUTRITION5K_BASE_URL_FOR_TEST },
    });
    expect(CalibrationSourceLockSchema.safeParse(nonIsoRetrievedAt).success).toBe(false);
  });

  it('rejects a self-referential hash field on the source lock (the lock never hashes itself)', () => {
    const withLockHash = { ...validSourceLock(), lockHash: 'e'.repeat(64) };
    expect(CalibrationSourceLockSchema.safeParse(withLockHash).success).toBe(false);

    const withSelfHash = { ...validSourceLock(), selfHash: 'e'.repeat(64) };
    expect(CalibrationSourceLockSchema.safeParse(withSelfHash).success).toBe(false);
  });

  describe('skippedImages: strict enumerated reason/status, no raw provider text or local paths', () => {
    it('accepts a well-formed http-status skipped-image record with a numeric status', () => {
      const lock = validSourceLock({ skippedImages: [validSkippedImage()] });
      expect(CalibrationSourceLockSchema.safeParse(lock).success).toBe(true);
    });

    it('accepts a well-formed non-http skipped-image record without a status field', () => {
      const lock = validSourceLock({
        skippedImages: [validSkippedImage({ reason: 'invalid_signature', status: undefined })],
      });
      expect(CalibrationSourceLockSchema.safeParse(lock).success).toBe(true);
    });

    it('rejects a status field on a non-http reason (status is only relevant to http reasons)', () => {
      const lock = validSourceLock({
        skippedImages: [validSkippedImage({ reason: 'invalid_signature', status: 500 })],
      });
      expect(CalibrationSourceLockSchema.safeParse(lock).success).toBe(false);
    });

    it('rejects an unrecognized (non-enumerated) reason string', () => {
      const lock = validSourceLock({
        skippedImages: [validSkippedImage({ reason: 'weird_unknown_reason', status: undefined })],
      });
      expect(CalibrationSourceLockSchema.safeParse(lock).success).toBe(false);
    });

    it('rejects a reason carrying raw provider/network error text instead of a stable enum member', () => {
      const lock = validSourceLock({
        skippedImages: [
          validSkippedImage({
            reason: 'ECONNRESET: connect ETIMEDOUT 172.16.0.5:443',
            status: undefined,
          }),
        ],
      });
      expect(CalibrationSourceLockSchema.safeParse(lock).success).toBe(false);
    });

    it('rejects a reason carrying a local filesystem path', () => {
      const lock = validSourceLock({
        skippedImages: [
          validSkippedImage({
            reason: '/home/agent-runner/projects/calorix/.nutrition-eval/cache/dish_9000000005.png',
            status: undefined,
          }),
        ],
      });
      expect(CalibrationSourceLockSchema.safeParse(lock).success).toBe(false);
    });

    it('rejects an unknown key on a skipped-image record instead of stripping it (tampered record)', () => {
      const lock = validSourceLock({
        skippedImages: [{ ...validSkippedImage(), extra: 'nope' }],
      });
      expect(CalibrationSourceLockSchema.safeParse(lock).success).toBe(false);
    });

    it('rejects a skipped-image record missing dishId or stratum', () => {
      const missingDishId = validSkippedImage();
      delete missingDishId['dishId'];
      expect(CalibrationSourceLockSchema.safeParse(validSourceLock({ skippedImages: [missingDishId] })).success).toBe(
        false,
      );

      const missingStratum = validSkippedImage();
      delete missingStratum['stratum'];
      expect(
        CalibrationSourceLockSchema.safeParse(validSourceLock({ skippedImages: [missingStratum] })).success,
      ).toBe(false);
    });

    it('rejects an unknown key nested inside a skipped-image stratum instead of stripping it', () => {
      const tampered = validSkippedImage();
      tampered['stratum'] = { ...(tampered['stratum'] as Record<string, unknown>), extra: 'nope' };
      expect(CalibrationSourceLockSchema.safeParse(validSourceLock({ skippedImages: [tampered] })).success).toBe(
        false,
      );
    });
  });

  // Duplicated verbatim from calibration-corpus.test.ts's DEV_TUPLES/VALIDATION_TUPLES
  // (the plan-pinned DEVELOPMENT_SLOT_SCHEDULE / VALIDATION_SLOT_SCHEDULE) so the
  // strict-manifest fixture here is exact at every position, not merely well-shaped.
  const DEV_STRATUM_TUPLES: ReadonlyArray<[number, number, number]> = [
    [0, 0, 0], [1, 1, 1], [2, 2, 2],
    [0, 0, 0], [1, 1, 2], [2, 2, 1],
    [0, 0, 1], [1, 1, 0], [2, 2, 2],
    [0, 0, 1], [1, 1, 2], [2, 2, 0],
    [0, 0, 2], [1, 1, 0], [2, 2, 1],
    [0, 0, 2], [1, 1, 1], [2, 2, 0],
    [0, 1, 1], [1, 0, 2], [2, 2, 0],
    [0, 2, 2], [1, 0, 1], [2, 1, 0],
  ];

  const VALIDATION_STRATUM_TUPLES: ReadonlyArray<[number, number, number]> = [
    [0, 0, 0], [1, 2, 2], [2, 1, 1],
    [0, 0, 1], [1, 2, 2], [2, 1, 0],
    [0, 1, 0], [1, 0, 1], [2, 2, 2],
    [0, 1, 0], [1, 0, 2], [2, 2, 1],
    [0, 1, 2], [1, 0, 1], [2, 2, 0],
    [0, 2, 1],
  ];

  function buildStrictCase(
    index: number,
    group: 'development' | 'validation',
    slotIndex: number,
    stratum: readonly [number, number, number],
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const dishId = `dish_9${String(index).padStart(9, '0')}`;
    const imageHash = createHash('sha256').update(`image:${dishId}`).digest('hex');
    const rank = createHash('sha256').update(`calorix-n5k-calibration-v1:${dishId}`).digest('hex');
    const [componentBin, calorieBin, macroBin] = stratum;
    return {
      id: `calibration-${dishId}`,
      visibility: 'public',
      scanMode: 'meal',
      source: { dataset: 'nutrition5k', objectId: dishId },
      image: {
        url: `${NUTRITION5K_BASE_URL_FOR_TEST}imagery/realsense_overhead/${dishId}/rgb.png`,
        sha256: imageHash,
        mediaType: 'image/png',
        width: 640,
        height: 480,
      },
      truth: {
        basis: 'portion',
        amount: 1,
        unit: 'portion',
        kcal: 100 + index,
        proteinG: 5,
        carbsG: 10,
        fatG: 2,
        referenceMassG: 150,
      },
      toleranceClass: 'meal-estimate',
      attributionId: 'nutrition5k-cc-by-4.0',
      group,
      stratum: { componentBin, calorieBin, macroBin },
      rank,
      slotIndex,
      ...overrides,
    };
  }

  function validStrictManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    const development = DEV_STRATUM_TUPLES.map((stratum, i) => buildStrictCase(i, 'development', i, stratum));
    const validation = VALIDATION_STRATUM_TUPLES.map((stratum, i) =>
      buildStrictCase(24 + i, 'validation', 24 + i, stratum),
    );
    return {
      version: 1,
      datasetId: 'calorix-n5k-calibration-v1',
      sourceLockHash: 'd'.repeat(64),
      cases: [...development, ...validation],
      ...overrides,
    };
  }

  it('accepts a well-formed 24-development/16-validation strict calibration manifest', () => {
    expect(StrictCalibrationManifestSchema.safeParse(validStrictManifest()).success).toBe(true);
  });

  it('rejects an unknown top-level key on the strict manifest instead of stripping it', () => {
    const withExtra = { ...validStrictManifest(), unexpectedField: 'nope' };
    expect(StrictCalibrationManifestSchema.safeParse(withExtra).success).toBe(false);
  });

  it('rejects an unknown key on a strict case instead of stripping it', () => {
    const manifest = validStrictManifest();
    const cases = (manifest['cases'] as Record<string, unknown>[]).slice();
    cases[0] = { ...cases[0], unexpectedField: 'nope' };
    expect(StrictCalibrationManifestSchema.safeParse({ ...manifest, cases }).success).toBe(false);
  });

  it('requires referenceMassG on every calibration case truth', () => {
    const manifest = validStrictManifest();
    const cases = (manifest['cases'] as Record<string, unknown>[]).slice();
    const truth = { ...(cases[0]!['truth'] as Record<string, unknown>) };
    delete truth['referenceMassG'];
    cases[0] = { ...cases[0], truth };
    expect(StrictCalibrationManifestSchema.safeParse({ ...manifest, cases }).success).toBe(false);
  });

  it('requires exactly 24 development and 16 validation cases', () => {
    const manifest = validStrictManifest();
    const cases = manifest['cases'] as Record<string, unknown>[];
    expect(StrictCalibrationManifestSchema.safeParse({ ...manifest, cases: cases.slice(0, 39) }).success).toBe(false);

    const tooManyDev = cases.slice();
    tooManyDev[39] = { ...tooManyDev[39], group: 'development' };
    expect(StrictCalibrationManifestSchema.safeParse({ ...manifest, cases: tooManyDev }).success).toBe(false);
  });

  it('rejects duplicate case IDs and duplicate dish IDs', () => {
    const manifest = validStrictManifest();
    const cases = manifest['cases'] as Record<string, unknown>[];

    const dupId = cases.slice();
    dupId[1] = { ...dupId[1], id: dupId[0]!['id'] };
    expect(StrictCalibrationManifestSchema.safeParse({ ...manifest, cases: dupId }).success).toBe(false);

    const dupDish = cases.slice();
    const firstSource = dupDish[0]!['source'] as Record<string, unknown>;
    const secondSource = dupDish[1]!['source'] as Record<string, unknown>;
    dupDish[1] = { ...dupDish[1], source: { ...secondSource, objectId: firstSource['objectId'] } };
    expect(StrictCalibrationManifestSchema.safeParse({ ...manifest, cases: dupDish }).success).toBe(false);
  });

  it('rejects a case whose scanMode or visibility drifts from the frozen public meal shape', () => {
    const manifest = validStrictManifest();
    const cases = (manifest['cases'] as Record<string, unknown>[]).slice();
    cases[0] = { ...cases[0], scanMode: 'barcode' };
    expect(StrictCalibrationManifestSchema.safeParse({ ...manifest, cases }).success).toBe(false);

    const privateCase = (manifest['cases'] as Record<string, unknown>[]).slice();
    privateCase[0] = { ...privateCase[0], visibility: 'private' };
    expect(StrictCalibrationManifestSchema.safeParse({ ...manifest, cases: privateCase }).success).toBe(false);
  });

  it('rejects a case whose id does not exactly match calibration-<dishId>', () => {
    const manifest = validStrictManifest();
    const cases = (manifest['cases'] as Record<string, unknown>[]).slice();
    cases[0] = { ...cases[0], id: 'calibration-dish_0000000000' };
    expect(StrictCalibrationManifestSchema.safeParse({ ...manifest, cases }).success).toBe(false);
  });

  it('rejects a case whose source.dataset is not exactly nutrition5k', () => {
    const manifest = validStrictManifest();
    const cases = (manifest['cases'] as Record<string, unknown>[]).slice();
    const source = cases[0]!['source'] as Record<string, unknown>;
    cases[0] = { ...cases[0], source: { ...source, dataset: 'other-dataset' } };
    expect(StrictCalibrationManifestSchema.safeParse({ ...manifest, cases }).success).toBe(false);
  });

  it('rejects a case whose source.objectId does not match dish_[0-9]+', () => {
    const manifest = validStrictManifest();
    const cases = (manifest['cases'] as Record<string, unknown>[]).slice();
    const source = cases[0]!['source'] as Record<string, unknown>;
    cases[0] = { ...cases[0], source: { ...source, objectId: 'dish_abc' } };
    expect(StrictCalibrationManifestSchema.safeParse({ ...manifest, cases }).success).toBe(false);
  });

  it('rejects a case whose truth basis/amount/unit drifts from the frozen portion-of-one shape', () => {
    const manifest = validStrictManifest();
    const cases = manifest['cases'] as Record<string, unknown>[];
    const truth = cases[0]!['truth'] as Record<string, unknown>;

    const wrongBasis = cases.slice();
    wrongBasis[0] = { ...wrongBasis[0], truth: { ...truth, basis: 'package' } };
    expect(StrictCalibrationManifestSchema.safeParse({ ...manifest, cases: wrongBasis }).success).toBe(false);

    const wrongAmount = cases.slice();
    wrongAmount[0] = { ...wrongAmount[0], truth: { ...truth, amount: 2 } };
    expect(StrictCalibrationManifestSchema.safeParse({ ...manifest, cases: wrongAmount }).success).toBe(false);

    const wrongUnit = cases.slice();
    wrongUnit[0] = { ...wrongUnit[0], truth: { ...truth, unit: 'g' } };
    expect(StrictCalibrationManifestSchema.safeParse({ ...manifest, cases: wrongUnit }).success).toBe(false);
  });

  it('rejects a case with non-positive kcal (zero is no longer accepted)', () => {
    const manifest = validStrictManifest();
    const cases = (manifest['cases'] as Record<string, unknown>[]).slice();
    const truth = cases[0]!['truth'] as Record<string, unknown>;
    cases[0] = { ...cases[0], truth: { ...truth, kcal: 0 } };
    expect(StrictCalibrationManifestSchema.safeParse({ ...manifest, cases }).success).toBe(false);
  });

  it('rejects a case whose toleranceClass is not exactly meal-estimate', () => {
    const manifest = validStrictManifest();
    const cases = (manifest['cases'] as Record<string, unknown>[]).slice();
    cases[0] = { ...cases[0], toleranceClass: 'package-estimate' };
    expect(StrictCalibrationManifestSchema.safeParse({ ...manifest, cases }).success).toBe(false);
  });

  it('does not affect generic version-1 manifest parsing (backward compatible)', () => {
    // A minimal generic manifest, unrelated to calibration, must still parse
    // through the unchanged public NutritionEvalManifestSchema/parser and
    // must not require any calibration-only field.
    const generic = {
      version: 1,
      datasetId: 'calorix-nutrition-eval-v1',
      cases: [
        {
          id: 'meal-dish-1565035746',
          visibility: 'public',
          scanMode: 'meal',
          source: { dataset: 'nutrition5k', objectId: 'dish_1565035746' },
          image: {
            url: 'https://storage.googleapis.com/nutrition5k_dataset/nutrition5k_dataset/imagery/realsense_overhead/dish_1565035746/rgb.png',
            sha256: '28f5fe26394586f124c04af2d22270d8a8079c141fc1f2b0fe80593d77ae2869',
            mediaType: 'image/png',
            width: 640,
            height: 480,
          },
          truth: { basis: 'portion', amount: 1, unit: 'portion', kcal: 43.1, proteinG: 2.4, carbsG: 9.0, fatG: 0.4 },
          toleranceClass: 'meal-estimate',
          attributionId: 'nutrition5k-cc-by-4.0',
        },
      ],
    };
    const parsed = parseNutritionEvalManifest(generic);
    expect(parsed.cases).toHaveLength(1);
    expect(parsed.cases[0]).not.toHaveProperty('group');
  });

  it('rejects cases listed out of ascending slotIndex order (swapped order)', () => {
    const manifest = validStrictManifest();
    const cases = (manifest['cases'] as Record<string, unknown>[]).slice();
    const [a, b] = [cases[0]!, cases[1]!];
    cases[0] = b;
    cases[1] = a;
    expect(StrictCalibrationManifestSchema.safeParse({ ...manifest, cases }).success).toBe(false);
  });

  it('rejects a case whose group does not match its slotIndex range (group drift)', () => {
    const manifest = validStrictManifest();
    const cases = (manifest['cases'] as Record<string, unknown>[]).slice();
    cases[0] = { ...cases[0], group: 'validation' }; // slotIndex 0 must be development
    expect(StrictCalibrationManifestSchema.safeParse({ ...manifest, cases }).success).toBe(false);
  });

  it('rejects a duplicated or out-of-sequence slotIndex (slot drift)', () => {
    const manifest = validStrictManifest();
    const cases = (manifest['cases'] as Record<string, unknown>[]).slice();
    cases[1] = { ...cases[1], slotIndex: 0 }; // duplicate of cases[0]
    expect(StrictCalibrationManifestSchema.safeParse({ ...manifest, cases }).success).toBe(false);
  });

  it('rejects a case whose stratum deviates from the pinned schedule tuple at its slot (stratum drift)', () => {
    const manifest = validStrictManifest();
    const cases = (manifest['cases'] as Record<string, unknown>[]).slice();
    const stratum = cases[0]!['stratum'] as Record<string, unknown>;
    cases[0] = {
      ...cases[0],
      stratum: { ...stratum, componentBin: ((stratum['componentBin'] as number) + 1) % 3 },
    };
    expect(StrictCalibrationManifestSchema.safeParse({ ...manifest, cases }).success).toBe(false);
  });

  it('rejects an invalid rank (must be lowercase 64-hex)', () => {
    const manifest = validStrictManifest();

    const uppercaseRank = (manifest['cases'] as Record<string, unknown>[]).slice();
    uppercaseRank[0] = { ...uppercaseRank[0], rank: 'A'.repeat(64) };
    expect(StrictCalibrationManifestSchema.safeParse({ ...manifest, cases: uppercaseRank }).success).toBe(false);

    const shortRank = (manifest['cases'] as Record<string, unknown>[]).slice();
    shortRank[0] = { ...shortRank[0], rank: 'a'.repeat(63) };
    expect(StrictCalibrationManifestSchema.safeParse({ ...manifest, cases: shortRank }).success).toBe(false);
  });

  it('rejects a case whose rank is well-formed 64-hex but does not equal sha256(prefix+dishId)', () => {
    const manifest = validStrictManifest();
    const cases = (manifest['cases'] as Record<string, unknown>[]).slice();
    cases[0] = { ...cases[0], rank: 'f'.repeat(64) };
    expect(StrictCalibrationManifestSchema.safeParse({ ...manifest, cases }).success).toBe(false);
  });

  it('rejects an unknown key nested inside a case stratum instead of stripping it', () => {
    const manifest = validStrictManifest();
    const cases = (manifest['cases'] as Record<string, unknown>[]).slice();
    const stratum = cases[0]!['stratum'] as Record<string, unknown>;
    cases[0] = { ...cases[0], stratum: { ...stratum, extra: 'nope' } };
    expect(StrictCalibrationManifestSchema.safeParse({ ...manifest, cases }).success).toBe(false);
  });

  it('rejects a case whose image URL, media type, or attribution drifts from the exact pinned values', () => {
    const manifest = validStrictManifest();

    const wrongUrl = (manifest['cases'] as Record<string, unknown>[]).slice();
    const image0 = wrongUrl[0]!['image'] as Record<string, unknown>;
    wrongUrl[0] = { ...wrongUrl[0], image: { ...image0, url: 'https://example.com/rgb.png' } };
    expect(StrictCalibrationManifestSchema.safeParse({ ...manifest, cases: wrongUrl }).success).toBe(false);

    const wrongMedia = (manifest['cases'] as Record<string, unknown>[]).slice();
    const image1 = wrongMedia[0]!['image'] as Record<string, unknown>;
    wrongMedia[0] = { ...wrongMedia[0], image: { ...image1, mediaType: 'image/jpeg' } };
    expect(StrictCalibrationManifestSchema.safeParse({ ...manifest, cases: wrongMedia }).success).toBe(false);

    const wrongAttribution = (manifest['cases'] as Record<string, unknown>[]).slice();
    wrongAttribution[0] = { ...wrongAttribution[0], attributionId: 'some-other-license' };
    expect(StrictCalibrationManifestSchema.safeParse({ ...manifest, cases: wrongAttribution }).success).toBe(false);
  });

  it('parses the manifest before hashing, so unknown or invalid input is rejected rather than hashed', () => {
    const manifest = validStrictManifest();
    const baseHash = hashStrictCalibrationManifest(manifest);
    expect(baseHash).toMatch(/^[0-9a-f]{64}$/);

    expect(() => hashStrictCalibrationManifest({ ...manifest, unexpectedField: 'nope' })).toThrow();

    const cases = (manifest['cases'] as Record<string, unknown>[]).slice();
    cases[0] = { ...cases[0], unexpectedField: 'nope' };
    expect(() => hashStrictCalibrationManifest({ ...manifest, cases })).toThrow();
  });

  it('hashes the full canonical strict object, sensitive to legitimate truth-field changes', () => {
    const manifest = validStrictManifest();
    const baseHash = hashStrictCalibrationManifest(manifest);

    const cases = (manifest['cases'] as Record<string, unknown>[]).slice();
    const truth = { ...(cases[0]!['truth'] as Record<string, unknown>) };
    cases[0] = { ...cases[0], truth: { ...truth, proteinG: (truth['proteinG'] as number) + 1 } };
    const changedHash = hashStrictCalibrationManifest({ ...manifest, cases });
    expect(changedHash).not.toBe(baseHash);
  });

  it('rejects (throws instead of hashing) a manifest with group/stratum drift from the pinned schedule', () => {
    const manifest = validStrictManifest();
    const cases = (manifest['cases'] as Record<string, unknown>[]).slice();
    cases[0] = { ...cases[0], group: 'validation' };
    cases[24] = { ...cases[24], group: 'development' };
    expect(() => hashStrictCalibrationManifest({ ...manifest, cases })).toThrow();
  });

  it('is deterministic for identical valid input', () => {
    const manifest = validStrictManifest();
    expect(hashStrictCalibrationManifest(manifest)).toBe(hashStrictCalibrationManifest(validStrictManifest()));
  });

  it('rejects (throws instead of hashing) an out-of-range slotIndex or a rank not matching its dish id', () => {
    const manifest = validStrictManifest();

    const reindexed = (manifest['cases'] as Record<string, unknown>[]).slice();
    reindexed[0] = { ...reindexed[0], slotIndex: (reindexed[0]!['slotIndex'] as number) + 100 };
    expect(() => hashStrictCalibrationManifest({ ...manifest, cases: reindexed })).toThrow();

    const rerated = (manifest['cases'] as Record<string, unknown>[]).slice();
    rerated[0] = { ...rerated[0], rank: 'f'.repeat(64) };
    expect(() => hashStrictCalibrationManifest({ ...manifest, cases: rerated })).toThrow();
  });

  describe('hashCalibrationSourceLock: parses CalibrationSourceLockSchema before hashing', () => {
    it('hashes a well-formed source lock deterministically', () => {
      const lock = validSourceLock();
      const hash = hashCalibrationSourceLock(lock);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(hashCalibrationSourceLock(validSourceLock())).toBe(hash);
    });

    it('is sensitive to a source sha256/byteLength change', () => {
      const lock = validSourceLock();
      const base = hashCalibrationSourceLock(lock);
      const sources = lock['sources'] as Record<string, unknown>;
      const trainSplit = sources['trainSplit'] as Record<string, unknown>;
      const changed = {
        ...lock,
        sources: {
          ...sources,
          trainSplit: { ...trainSplit, byteLength: (trainSplit['byteLength'] as number) + 1 },
        },
      };
      expect(hashCalibrationSourceLock(changed)).not.toBe(base);
    });

    it('rejects (throws) an unknown top-level key instead of hashing it', () => {
      const lock = { ...validSourceLock(), unexpectedField: 'nope' };
      expect(() => hashCalibrationSourceLock(lock)).toThrow();
    });

    it('rejects (throws) a source lock missing a required field instead of hashing it', () => {
      const lock = validSourceLock();
      delete lock['datasetId'];
      expect(() => hashCalibrationSourceLock(lock)).toThrow();
    });
  });

  describe('Task 4 audit correction: stable fetch_error, strict dish IDs, unique skips', () => {
    it('accepts fetch_error without a status field (thrown fetch/arrayBuffer path)', () => {
      const lock = validSourceLock({
        skippedImages: [validSkippedImage({ reason: 'fetch_error', status: undefined })],
      });
      expect(CalibrationSourceLockSchema.safeParse(lock).success).toBe(true);
    });

    it('rejects fetch_error carrying a numeric status', () => {
      const lock = validSourceLock({
        skippedImages: [validSkippedImage({ reason: 'fetch_error', status: 500 })],
      });
      expect(CalibrationSourceLockSchema.safeParse(lock).success).toBe(false);
    });

    it('rejects http_error without a numeric status', () => {
      const lock = validSourceLock({
        skippedImages: [validSkippedImage({ reason: 'http_error', status: undefined })],
      });
      expect(CalibrationSourceLockSchema.safeParse(lock).success).toBe(false);
    });

    it('rejects skipped dish IDs that do not match dish_[0-9]+', () => {
      for (const badId of ['dish_abc', 'dish-', '', 'DISH_123', 'dish_12a34', 'meal-1']) {
        const lock = validSourceLock({
          skippedImages: [validSkippedImage({ dishId: badId })],
        });
        expect(CalibrationSourceLockSchema.safeParse(lock).success).toBe(false);
      }
    });

    it('rejects duplicate skipped dish IDs', () => {
      const lock = validSourceLock({
        skippedImages: [validSkippedImage(), validSkippedImage()],
      });
      expect(CalibrationSourceLockSchema.safeParse(lock).success).toBe(false);
    });
  });
});

describe('Task 4a RED: canonical excludedDishes on the calibration source lock', () => {
  // The reviewed live-pin correction (Steps 4a–4b): train candidates with
  // non-positive total calories/mass, negative total macros, or absent merged
  // metadata become canonical stable typed `excludedDishes`, bound into the
  // source-lock hash. Non-train invalid rows never appear here. Every
  // accept/hash test below fails until schema.ts implements the field; the
  // reject tests guard the strictness the GREEN implementation must keep.

  function validExclusion(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return { dishId: 'dish_1556575700', reason: 'non_positive_calories', ...overrides };
  }

  function exclusionLock(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      version: 1,
      datasetId: 'calorix-n5k-calibration-v1',
      baseUrl: NUTRITION5K_BASE_URL_FOR_TEST,
      retrievalProvenance: {
        retrievedAt: STABLE_RETRIEVED_AT_FOR_TEST,
        baseUrl: NUTRITION5K_BASE_URL_FOR_TEST,
      },
      sources: {
        trainSplit: {
          path: 'dish_ids/splits/rgb_train_ids.txt',
          url: `${NUTRITION5K_BASE_URL_FOR_TEST}dish_ids/splits/rgb_train_ids.txt`,
          sha256: 'a'.repeat(64),
          byteLength: 1024,
        },
        metadataCafe1: {
          path: 'metadata/dish_metadata_cafe1.csv',
          url: `${NUTRITION5K_BASE_URL_FOR_TEST}metadata/dish_metadata_cafe1.csv`,
          sha256: 'b'.repeat(64),
          byteLength: 2048,
        },
        metadataCafe2: {
          path: 'metadata/dish_metadata_cafe2.csv',
          url: `${NUTRITION5K_BASE_URL_FOR_TEST}metadata/dish_metadata_cafe2.csv`,
          sha256: 'c'.repeat(64),
          byteLength: 4096,
        },
      },
      skippedImages: [] as unknown[],
      excludedDishes: [] as unknown[],
      ...overrides,
    };
  }

  it('accepts a lock with canonical excludedDishes covering every stable reason', () => {
    const lock = exclusionLock({
      excludedDishes: [
        validExclusion({ dishId: 'dish_1556575700', reason: 'non_positive_calories' }),
        validExclusion({ dishId: 'dish_1556575701', reason: 'non_positive_mass' }),
        validExclusion({ dishId: 'dish_1556575702', reason: 'negative_macros' }),
        validExclusion({ dishId: 'dish_1556575703', reason: 'missing_metadata' }),
      ],
    });
    expect(CalibrationSourceLockSchema.safeParse(lock).success).toBe(true);
  });

  it('rejects duplicate excluded dish IDs', () => {
    const lock = exclusionLock({
      excludedDishes: [validExclusion(), validExclusion()],
    });
    expect(CalibrationSourceLockSchema.safeParse(lock).success).toBe(false);
  });

  it('rejects an unknown exclusion reason', () => {
    const lock = exclusionLock({
      excludedDishes: [validExclusion({ reason: 'weird_unknown_reason' })],
    });
    expect(CalibrationSourceLockSchema.safeParse(lock).success).toBe(false);
  });

  it('rejects unknown keys or raw provider text on an exclusion entry', () => {
    const withExtra = exclusionLock({ excludedDishes: [{ ...validExclusion(), extra: 'nope' }] });
    expect(CalibrationSourceLockSchema.safeParse(withExtra).success).toBe(false);

    const withRawText = exclusionLock({
      excludedDishes: [validExclusion({ reason: 'ECONNRESET: connect ETIMEDOUT 172.16.0.5:443' })],
    });
    expect(CalibrationSourceLockSchema.safeParse(withRawText).success).toBe(false);

    const badDishId = exclusionLock({ excludedDishes: [validExclusion({ dishId: 'dish_abc' })] });
    expect(CalibrationSourceLockSchema.safeParse(badDishId).success).toBe(false);
  });

  it('binds excludedDishes into the source-lock hash (omission/addition changes the hash)', () => {
    const base = exclusionLock({
      excludedDishes: [validExclusion({ dishId: 'dish_1556575700', reason: 'non_positive_calories' })],
    });
    const baseHash = hashCalibrationSourceLock(base);
    expect(baseHash).toMatch(/^[0-9a-f]{64}$/);

    const omitted = exclusionLock({ excludedDishes: [] });
    expect(hashCalibrationSourceLock(omitted)).not.toBe(baseHash);

    const added = exclusionLock({
      excludedDishes: [
        validExclusion({ dishId: 'dish_1556575700', reason: 'non_positive_calories' }),
        validExclusion({ dishId: 'dish_1556575701', reason: 'missing_metadata' }),
      ],
    });
    expect(hashCalibrationSourceLock(added)).not.toBe(baseHash);
  });

  it('is sensitive to exclusion reason and order drift', () => {
    const base = exclusionLock({
      excludedDishes: [
        validExclusion({ dishId: 'dish_1556575700', reason: 'non_positive_calories' }),
        validExclusion({ dishId: 'dish_1556575701', reason: 'missing_metadata' }),
      ],
    });
    const baseHash = hashCalibrationSourceLock(base);

    const reasonDrift = exclusionLock({
      excludedDishes: [
        validExclusion({ dishId: 'dish_1556575700', reason: 'missing_metadata' }),
        validExclusion({ dishId: 'dish_1556575701', reason: 'missing_metadata' }),
      ],
    });
    expect(hashCalibrationSourceLock(reasonDrift)).not.toBe(baseHash);

    const orderDrift = exclusionLock({
      excludedDishes: [
        validExclusion({ dishId: 'dish_1556575701', reason: 'missing_metadata' }),
        validExclusion({ dishId: 'dish_1556575700', reason: 'non_positive_calories' }),
      ],
    });
    expect(CalibrationSourceLockSchema.safeParse(orderDrift).success).toBe(false);
    expect(() => hashCalibrationSourceLock(orderDrift)).toThrow();
  });

  it('rejects non-canonical excludedDishes order (descending dishIds fail closed)', () => {
    const canonical = exclusionLock({
      excludedDishes: [
        validExclusion({ dishId: 'dish_1556575700', reason: 'non_positive_calories' }),
        validExclusion({ dishId: 'dish_1556575701', reason: 'missing_metadata' }),
      ],
    });
    expect(CalibrationSourceLockSchema.safeParse(canonical).success).toBe(true);
    const nonCanonical = exclusionLock({
      excludedDishes: [
        validExclusion({ dishId: 'dish_1556575701', reason: 'missing_metadata' }),
        validExclusion({ dishId: 'dish_1556575700', reason: 'non_positive_calories' }),
      ],
    });
    expect(CalibrationSourceLockSchema.safeParse(nonCanonical).success).toBe(false);
  });

  it('rejects an exclusion overlapping a skipped-image dish ID', () => {
    const lock = exclusionLock({
      skippedImages: [
        {
          dishId: 'dish_9000000001',
          stratum: { componentBin: 0, calorieBin: 0, macroBin: 0 },
          reason: 'http_error',
          status: 404,
        },
      ],
      excludedDishes: [validExclusion({ dishId: 'dish_9000000001', reason: 'missing_metadata' })],
    });
    expect(CalibrationSourceLockSchema.safeParse(lock).success).toBe(false);
  });
});
