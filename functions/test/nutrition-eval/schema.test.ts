import { describe, expect, it } from 'vitest';
import { parseNutritionEvalManifest } from '../../src/nutrition-eval/schema';

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
