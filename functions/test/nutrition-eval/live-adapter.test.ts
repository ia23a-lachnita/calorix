import { describe, expect, it, vi } from 'vitest';

import type { GenAIAdapter } from '../../src/genai-adapter';
import type { OffProduct } from '../../src/off-client';
import { normalizeOffPackage } from '../../src/package-nutrition';
import { normalizeVisionNutrition } from '../../src/nutrition';
import { createLiveNutritionEvalAdapter } from '../../src/nutrition-eval/live-adapter';
import {
  NutritionPredictionSchema,
  parseNutritionEvalManifest,
  type NutritionEvalCase,
  type NutritionPrediction,
} from '../../src/nutrition-eval/schema';
import {
  BARCODE_ANALYSIS_PROMPT,
  LABEL_ANALYSIS_PROMPT,
  MEAL_ANALYSIS_PROMPT,
} from '../../src/prompts';

const imageBytes = new Uint8Array([0, 255, 1]);
const rawBarcode = '5449000000996';
const modelBarcode = '12345678';

const mealCase: NutritionEvalCase = {
  id: 'meal-route',
  visibility: 'public',
  scanMode: 'meal',
  source: { dataset: 'test', objectId: 'meal-route' },
  image: {
    url: 'https://example.com/meal.png',
    sha256: 'a'.repeat(64),
    mediaType: 'image/png',
    width: 1,
    height: 1,
  },
  truth: {
    basis: 'portion', amount: 1, unit: 'portion', kcal: 100, proteinG: 1, carbsG: 15, fatG: 4,
  },
  toleranceClass: 'test',
  attributionId: 'test',
};

const labelCase: NutritionEvalCase = {
  ...mealCase,
  id: 'label-route',
  scanMode: 'label',
};

const barcodeCase: NutritionEvalCase = {
  ...mealCase,
  id: 'barcode-route',
  scanMode: 'barcode',
  expectedBarcode: rawBarcode,
};

const vitaminPer100 = {
  kcal: 17,
  proteinG: 0,
  carbsG: 4.2,
  fatG: 0,
  amount: 100,
  unit: 'ml' as const,
};

const vitaminPackage = {
  kcal: 85,
  proteinG: 0,
  carbsG: 21,
  fatG: 0,
  amount: 500,
  unit: 'ml' as const,
};

const vitaminNutrients = {
  kcal: vitaminPackage.kcal,
  proteinG: vitaminPackage.proteinG,
  carbsG: vitaminPackage.carbsG,
  fatG: vitaminPackage.fatG,
};

const knownOffProduct: OffProduct = {
  name: 'Vitamin Well Reload',
  barcode: rawBarcode,
  rawQuantity: '500 ml',
  kcalPer100g: 17,
  proteinPer100g: 0,
  carbsPer100g: 4.2,
  fatPer100g: 0,
  productQuantity: { amount: 500, unit: 'ml' },
  per100Reference: vitaminPer100,
};

const missingQuantityOffProduct: OffProduct = {
  name: 'Vitamin Well Reload',
  barcode: rawBarcode,
  kcalPer100g: 17,
  proteinPer100g: 0,
  carbsPer100g: 4.2,
  fatPer100g: 0,
  per100Reference: vitaminPer100,
};

type ModelPayloadKind = 'meal' | 'package' | 'per100';

function modelText(
  kind: ModelPayloadKind = 'meal',
  overrides: Record<string, unknown> = {},
): string {
  const base = {
    name: 'Test food',
    confidence: 0.9,
    candidates: [],
    detectedItems: [],
    boundingBox: null,
  };
  const payload = kind === 'meal'
    ? {
      ...base,
      kcal: 100,
      proteinG: 1,
      carbsG: 15,
      fatG: 4,
      barcode: null,
      nutritionBasis: 'portion',
      nutritionAmount: 1,
      nutritionUnit: 'portion',
    }
    : kind === 'package'
      ? {
        ...base,
        ...vitaminNutrients,
        barcode: null,
        nutritionBasis: 'package',
        nutritionAmount: 500,
        nutritionUnit: 'ml',
        observedPackageAmount: 500,
        observedPackageUnit: 'ml',
        packageReference: vitaminPackage,
      }
      : {
        ...base,
        kcal: vitaminPer100.kcal,
        proteinG: vitaminPer100.proteinG,
        carbsG: vitaminPer100.carbsG,
        fatG: vitaminPer100.fatG,
        barcode: null,
        nutritionBasis: 'per100g',
        nutritionAmount: 100,
        nutritionUnit: 'ml',
        observedPackageAmount: 500,
        observedPackageUnit: 'ml',
        per100Reference: vitaminPer100,
      };
  return JSON.stringify({ ...payload, ...overrides });
}

function makeAdapter(
  responseText = modelText(),
  fetchOffProductFn: (barcode: string) => Promise<OffProduct | null> = async () => null,
  normalizers: {
    normalizeOffPackageFn?: typeof normalizeOffPackage;
    normalizeVisionNutritionFn?: typeof normalizeVisionNutrition;
  } = {},
) {
  const generateVision = vi.fn(async () => responseText);
  const genAIAdapter: GenAIAdapter = {
    generateChat: vi.fn(async () => ''),
    generateVision,
  };
  return {
    adapter: createLiveNutritionEvalAdapter({
      project: 'test-project',
      location: 'europe-west1',
      model: 'gemini-test-model',
      genAIAdapter,
      fetchOffProductFn,
      ...normalizers,
    }),
    generateVision,
  };
}

function caseWithSuppliedBarcode(suppliedBarcode: string): NutritionEvalCase {
  return parseNutritionEvalManifest({
    version: 1,
    datasetId: 'test-dataset',
    cases: [{ ...barcodeCase, suppliedBarcode }],
  }).cases[0]!;
}

function expectReviewPrediction(
  prediction: NutritionPrediction,
  reasons: string[],
): void {
  expect(prediction).toMatchObject({ reviewReasons: reasons });
}

describe('createLiveNutritionEvalAdapter', () => {
  it.each(['project', 'location', 'model'] as const)(
    'rejects blank %s before an adapter can issue a provider request',
    (field) => {
      expect(() => createLiveNutritionEvalAdapter({
        project: 'test-project',
        location: 'europe-west1',
        model: 'gemini-test-model',
        [field]: ' ',
      })).toThrow(new RegExp(field));
    },
  );

  it('retains optional canonical Review reasons in the prediction schema and rejects unknown reasons', () => {
    const normalizedSuccess = {
      parseStatus: 'success',
      source: 'label',
      kcal: 85,
      proteinG: 0,
      carbsG: 21,
      fatG: 0,
      confidence: 0.9,
      basis: 'package',
      amount: 500,
      unit: 'ml',
      decision: 'needs_review',
      reviewReasons: ['barcode_unconfirmed'],
    };

    expect(NutritionPredictionSchema.safeParse(normalizedSuccess)).toMatchObject({
      success: true,
      data: { reviewReasons: ['barcode_unconfirmed'] },
    });
    expect(NutritionPredictionSchema.safeParse({
      ...normalizedSuccess,
      reviewReasons: ['not_a_review_reason'],
    }).success).toBe(false);
    expect(NutritionPredictionSchema.safeParse({
      ...normalizedSuccess,
      reviewReasons: undefined,
    }).success).toBe(true);
    const failure = (failureDetail: string) => NutritionPredictionSchema.safeParse({
      parseStatus: 'failure',
      source: 'label',
      decision: 'error',
      failureCategory: 'schema',
      failureCode: 'model_response_invalid',
      failureDetail,
    });
    for (const detail of [
      'no_json_object_in_response',
      'invalid_json',
      'schema_violation:(root)',
      'schema_violation:detectedItems.0.weight',
      'schema_violation:candidates.1.name',
      'schema_violation:packageReference.unit',
    ]) {
      expect(failure(detail)).toMatchObject({ success: true, data: { failureDetail: detail } });
    }
    for (const detail of [
      'provider returned Secret food',
      'https://private.example/vision',
      'Bearer secret-token',
      'token=secret-token',
      'prompt: describe this food',
      'Error: model failure\n    at /private/provider.ts:42',
      '/private/provider.ts:42',
      '../secrets/provider.ts',
      'schema_violation:unknownField',
      'schema_violation:detectedItems..weight',
      'schema_violation:detectedItems.-1.weight',
      'schema_violation:detectedItems[0].weight',
    ]) expect(failure(detail).success).toBe(false);
  });

  it('keeps nutrition normalization failures inside the stable schema category', () => {
    expect(NutritionPredictionSchema.safeParse({
      parseStatus: 'failure',
      source: 'label',
      decision: 'error',
      failureCategory: 'normalization',
      failureCode: 'nutrition_normalization_invalid',
    }).success).toBe(false);
    expect(NutritionPredictionSchema.safeParse({
      parseStatus: 'failure',
      source: 'label',
      decision: 'error',
      failureCategory: 'schema',
      failureCode: 'nutrition_normalization_invalid',
    })).toMatchObject({
      success: true,
      data: {
        failureCategory: 'schema',
        failureCode: 'nutrition_normalization_invalid',
      },
    });
  });

  it('uses the strict meal payload and exposes its canonical portion contract', async () => {
    const { adapter, generateVision } = makeAdapter(modelText('meal'));

    const prediction = await adapter.analyzeCase(mealCase, imageBytes, { sampleIndex: 1 });

    expect(prediction).toMatchObject({
      parseStatus: 'success',
      source: 'meal',
      kcal: 100,
      confidence: 0.9,
      basis: 'portion',
      amount: 1,
      unit: 'portion',
      decision: 'complete',
    });
    expectReviewPrediction(prediction, []);
    expect(generateVision).toHaveBeenCalledWith(
      'gemini-test-model', MEAL_ANALYSIS_PROMPT, 'AP8B',
    );
  });

  it('retains an Atwater mismatch from production vision normalization in Review', async () => {
    const { adapter } = makeAdapter(modelText('meal', {
      proteinG: 1,
      carbsG: 2,
      fatG: 3,
    }));

    const prediction = await adapter.analyzeCase(mealCase, imageBytes, { sampleIndex: 1 });

    expect(prediction).toMatchObject({
      parseStatus: 'success',
      decision: 'needs_review',
      reviewReasons: ['atwater_mismatch'],
    });
  });

  it('uses the strict label payload and keeps a low-confidence result in Review', async () => {
    const { adapter, generateVision } = makeAdapter(
      modelText('package', { confidence: 0.79 }),
    );

    const prediction = await adapter.analyzeCase(labelCase, imageBytes, { sampleIndex: 1 });

    expect(prediction).toMatchObject({
      parseStatus: 'success',
      source: 'label',
      kcal: 85,
      basis: 'package',
      amount: 500,
      unit: 'ml',
      confidence: 0.79,
      decision: 'needs_review',
    });
    expectReviewPrediction(prediction, []);
    expect(generateVision).toHaveBeenCalledWith(
      'gemini-test-model', LABEL_ANALYSIS_PROMPT, 'AP8B',
    );
  });

  it('normalizes a 500ml OFF product into the canonical package total', async () => {
    const fetchOffProductFn = vi.fn(async () => knownOffProduct);
    const normalizeOffPackageFn = vi.fn(normalizeOffPackage);
    const { adapter, generateVision } = makeAdapter(
      modelText(),
      fetchOffProductFn,
      { normalizeOffPackageFn },
    );

    const prediction = await adapter.analyzeCase(
      caseWithSuppliedBarcode(rawBarcode), imageBytes, { sampleIndex: 1 },
    );

    expect(prediction).toMatchObject({
      parseStatus: 'success',
      source: 'barcode',
      kcal: 85,
      proteinG: 0,
      carbsG: 21,
      fatG: 0,
      basis: 'package',
      amount: 500,
      unit: 'ml',
      confidence: 1,
      barcode: rawBarcode,
      decision: 'complete',
    });
    expectReviewPrediction(prediction, []);
    expect(normalizeOffPackageFn).toHaveBeenCalledOnce();
    expect(normalizeOffPackageFn).toHaveBeenCalledWith(knownOffProduct);
    expect(fetchOffProductFn).toHaveBeenCalledTimes(1);
    expect(fetchOffProductFn).toHaveBeenCalledWith(rawBarcode);
    expect(generateVision).not.toHaveBeenCalled();
  });

  it('keeps an OFF product with no quantity as a per-100 Review result', async () => {
    const { adapter } = makeAdapter(
      modelText(),
      async () => missingQuantityOffProduct,
    );

    const prediction = await adapter.analyzeCase(
      caseWithSuppliedBarcode(rawBarcode), imageBytes, { sampleIndex: 1 },
    );

    expect(prediction).toMatchObject({
      parseStatus: 'success',
      source: 'barcode',
      kcal: 17,
      basis: 'per100g',
      amount: 100,
      unit: 'ml',
      decision: 'needs_review',
    });
    expectReviewPrediction(prediction, ['package_quantity_missing']);
    expect(prediction).not.toHaveProperty('consumedAmount');
  });

  it('maps invalid OFF normalization input to product/off_product_invalid', async () => {
    const invalidOffProduct = {
      ...knownOffProduct,
      per100Reference: undefined,
      kcalPer100g: Number.POSITIVE_INFINITY,
    } as unknown as OffProduct;
    const normalizeOffPackageFn = vi.fn(normalizeOffPackage);
    const { adapter } = makeAdapter(
      modelText(),
      async () => invalidOffProduct,
      { normalizeOffPackageFn },
    );

    const prediction = await adapter.analyzeCase(
      caseWithSuppliedBarcode(rawBarcode), imageBytes, { sampleIndex: 1 },
    );

    expect(prediction).toEqual({
      parseStatus: 'failure',
      source: 'barcode',
      decision: 'error',
      failureCategory: 'product',
      failureCode: 'off_product_invalid',
    });
    expect(normalizeOffPackageFn).toHaveBeenCalledWith(invalidOffProduct);
  });

  it('canonicalizes a strict per-100 vision response to the observed package total', async () => {
    const normalizeVisionNutritionFn = vi.fn(normalizeVisionNutrition);
    const { adapter } = makeAdapter(
      modelText('per100'),
      async () => null,
      { normalizeVisionNutritionFn },
    );

    const prediction = await adapter.analyzeCase(labelCase, imageBytes, { sampleIndex: 1 });

    expect(prediction).toMatchObject({
      parseStatus: 'success',
      source: 'label',
      kcal: 85,
      proteinG: 0,
      carbsG: 21,
      fatG: 0,
      basis: 'package',
      amount: 500,
      unit: 'ml',
      decision: 'complete',
    });
    expectReviewPrediction(prediction, []);
    expect(normalizeVisionNutritionFn).toHaveBeenCalledOnce();
    expect(normalizeVisionNutritionFn).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'label',
        nutritionBasis: 'per100g',
        nutritionAmount: 100,
        nutritionUnit: 'ml',
      }),
      undefined,
      undefined,
    );
  });

  it('returns arithmetic disagreement as a Review reason instead of trusting model totals', async () => {
    const { adapter } = makeAdapter(modelText('per100', {
      kcal: 16,
      packageReference: vitaminPackage,
    }));

    const prediction = await adapter.analyzeCase(labelCase, imageBytes, { sampleIndex: 1 });

    expect(prediction).toMatchObject({
      parseStatus: 'success',
      source: 'label',
      kcal: 85,
      basis: 'package',
      amount: 500,
      unit: 'ml',
      decision: 'needs_review',
    });
    expectReviewPrediction(prediction, ['nutrition_arithmetic_mismatch']);
  });

  it('does not treat scoring-only expectedBarcode as observed input for an OFF lookup', async () => {
    const fetchOffProductFn = vi.fn(async () => knownOffProduct);
    const { adapter, generateVision } = makeAdapter(modelText('per100'), fetchOffProductFn);

    const prediction = await adapter.analyzeCase(barcodeCase, imageBytes, { sampleIndex: 1 });

    expect(prediction).toMatchObject({
      parseStatus: 'success',
      source: 'barcode',
      basis: 'package',
      amount: 500,
      unit: 'ml',
      decision: 'complete',
    });
    expectReviewPrediction(prediction, []);
    expect(fetchOffProductFn).not.toHaveBeenCalled();
    expect(generateVision).toHaveBeenCalledWith(
      'gemini-test-model', BARCODE_ANALYSIS_PROMPT, 'AP8B',
    );
  });

  it('falls back from an OFF miss to strict barcode vision and retains the selected vision barcode', async () => {
    const fetchOffProductFn = vi.fn(async () => null);
    const { adapter, generateVision } = makeAdapter(
      modelText('per100', { barcode: modelBarcode, confidence: 0.97 }),
      fetchOffProductFn,
    );

    const prediction = await adapter.analyzeCase(
      caseWithSuppliedBarcode(rawBarcode), imageBytes, { sampleIndex: 1 },
    );

    expect(fetchOffProductFn).toHaveBeenNthCalledWith(1, rawBarcode);
    expect(fetchOffProductFn).toHaveBeenNthCalledWith(2, modelBarcode);
    expect(generateVision).toHaveBeenCalledWith(
      'gemini-test-model', BARCODE_ANALYSIS_PROMPT, 'AP8B',
    );
    expect(prediction).toMatchObject({
      parseStatus: 'success',
      source: 'barcode',
      barcode: modelBarcode,
      confidence: 0.97,
      basis: 'package',
      amount: 500,
      unit: 'ml',
      decision: 'needs_review',
    });
    expectReviewPrediction(prediction, ['barcode_unconfirmed']);
  });

  it('rejects a non-8-to-14-digit supplied barcode before it can become an OFF query', () => {
    expect(() => caseWithSuppliedBarcode('1234567')).toThrow(/8-14 digits/);
  });

  it('deduplicates a repeated barcode lookup and retains the selected unconfirmed barcode', async () => {
    const fetchOffProductFn = vi.fn(async () => null);
    const { adapter } = makeAdapter(
      modelText('per100', { barcode: rawBarcode, confidence: 0.97 }),
      fetchOffProductFn,
    );

    const prediction = await adapter.analyzeCase(
      caseWithSuppliedBarcode(rawBarcode), imageBytes, { sampleIndex: 1 },
    );

    expect(fetchOffProductFn).toHaveBeenCalledTimes(1);
    expect(fetchOffProductFn).toHaveBeenCalledWith(rawBarcode);
    expect(prediction).toMatchObject({
      barcode: rawBarcode,
      confidence: 0.97,
      decision: 'needs_review',
    });
    expectReviewPrediction(prediction, ['barcode_unconfirmed']);
  });

  it('selects a distinct vision barcode after that barcode resolves to a canonical OFF result', async () => {
    const fetchOffProductFn = vi.fn(async (barcode: string) =>
      barcode === modelBarcode ? { ...knownOffProduct, barcode: modelBarcode } : null,
    );
    const { adapter } = makeAdapter(
      modelText('per100', { barcode: modelBarcode, confidence: 0.97 }),
      fetchOffProductFn,
    );

    const prediction = await adapter.analyzeCase(
      caseWithSuppliedBarcode(rawBarcode), imageBytes, { sampleIndex: 1 },
    );

    expect(fetchOffProductFn).toHaveBeenNthCalledWith(1, rawBarcode);
    expect(fetchOffProductFn).toHaveBeenNthCalledWith(2, modelBarcode);
    expect(prediction).toMatchObject({
      kcal: 85,
      basis: 'package',
      amount: 500,
      unit: 'ml',
      barcode: modelBarcode,
      confidence: 0.97,
      decision: 'needs_review',
    });
    expectReviewPrediction(prediction, ['barcode_unconfirmed']);
  });

  it('keeps a low-confidence vision-led OFF hit in Review even when barcode provenance agrees', async () => {
    const fetchOffProductFn = vi.fn(async (barcode: string) =>
      barcode === modelBarcode ? { ...knownOffProduct, barcode: modelBarcode } : null,
    );
    const { adapter } = makeAdapter(
      modelText('per100', { barcode: modelBarcode, confidence: 0.79 }),
      fetchOffProductFn,
    );

    const prediction = await adapter.analyzeCase(barcodeCase, imageBytes, { sampleIndex: 1 });

    expect(prediction).toMatchObject({
      barcode: modelBarcode,
      confidence: 0.79,
      decision: 'needs_review',
      reviewReasons: [],
    });
  });

  it('keeps a valid unconfirmed barcode vision confidence rather than clamping it', async () => {
    const { adapter } = makeAdapter(
      modelText('per100', { barcode: modelBarcode, confidence: 0.97 }),
      async () => null,
    );

    const prediction = await adapter.analyzeCase(barcodeCase, imageBytes, { sampleIndex: 1 });

    expect(prediction).toMatchObject({
      parseStatus: 'success',
      source: 'barcode',
      barcode: modelBarcode,
      confidence: 0.97,
      decision: 'needs_review',
    });
    expectReviewPrediction(prediction, ['barcode_unconfirmed']);
  });

  it('maps an overflow rejected by vision normalization to schema/nutrition_normalization_invalid', async () => {
    const overflowReference = { ...vitaminPer100, kcal: Number.MAX_VALUE };
    const normalizeVisionNutritionFn = vi.fn(normalizeVisionNutrition);
    const { adapter } = makeAdapter(modelText('per100', {
      kcal: overflowReference.kcal,
      proteinG: overflowReference.proteinG,
      carbsG: overflowReference.carbsG,
      fatG: overflowReference.fatG,
      observedPackageAmount: Number.MAX_VALUE,
      per100Reference: overflowReference,
    }), async () => null, { normalizeVisionNutritionFn });

    const prediction = await adapter.analyzeCase(labelCase, imageBytes, { sampleIndex: 1 });

    expect(prediction).toEqual({
      parseStatus: 'failure',
      source: 'label',
      decision: 'error',
      failureCategory: 'schema',
      failureCode: 'nutrition_normalization_invalid',
    });
    expect(normalizeVisionNutritionFn).toHaveBeenCalledOnce();
  });

  it('preserves a safe non-JSON parser detail without serializing raw model output', async () => {
    const rawProviderOutput = 'not JSON: Secret food at https://private.example/vision with Bearer secret-token in /private/provider.ts:42';
    const { adapter } = makeAdapter(rawProviderOutput);

    const prediction = await adapter.analyzeCase(mealCase, imageBytes, { sampleIndex: 1 });

    expect(prediction).toEqual({
      parseStatus: 'failure',
      source: 'meal',
      decision: 'error',
      failureCategory: 'schema',
      failureCode: 'model_response_invalid',
      failureDetail: 'no_json_object_in_response',
    });
    const serialized = JSON.stringify(prediction);
    for (const forbidden of [
      rawProviderOutput,
      'Secret food',
      'https://private.example/vision',
      'Bearer',
      'secret-token',
      '/private/provider.ts:42',
    ]) expect(serialized).not.toContain(forbidden);
  });

  it('preserves a safe schema path for an invalid detected-item weight without serializing model content', async () => {
    const { adapter } = makeAdapter(modelText('meal', {
      name: 'Secret food',
      detectedItems: [{ name: 'Secret ingredient', weight: null }],
    }));

    const prediction = await adapter.analyzeCase(mealCase, imageBytes, { sampleIndex: 1 });

    expect(prediction).toEqual({
      parseStatus: 'failure',
      source: 'meal',
      decision: 'error',
      failureCategory: 'schema',
      failureCode: 'model_response_invalid',
      failureDetail: 'schema_violation:detectedItems.0.weight',
    });
    const serialized = JSON.stringify(prediction);
    expect(serialized).not.toContain('Secret food');
    expect(serialized).not.toContain('Secret ingredient');
  });

  it('maps a thrown vision dependency to provider/provider_request_failed', async () => {
    const generateVision = vi.fn(async () => {
      throw new Error('Bearer test-token at /private/model.ts:42');
    });
    const genAIAdapter: GenAIAdapter = {
      generateChat: vi.fn(async () => ''),
      generateVision,
    };
    const adapter = createLiveNutritionEvalAdapter({
      project: 'test-project',
      location: 'europe-west1',
      model: 'gemini-test-model',
      genAIAdapter,
      fetchOffProductFn: async () => null,
    });

    const prediction = await adapter.analyzeCase(mealCase, imageBytes, { sampleIndex: 1 });

    expect(prediction).toEqual({
      parseStatus: 'failure',
      source: 'meal',
      decision: 'error',
      failureCategory: 'provider',
      failureCode: 'provider_request_failed',
    });
  });

  it('maps a thrown OFF dependency to provider/provider_request_failed', async () => {
    const { adapter } = makeAdapter(
      modelText(),
      async () => {
        throw new Error('Bearer test-token at /private/off-client.ts:42');
      },
    );

    const prediction = await adapter.analyzeCase(
      caseWithSuppliedBarcode(rawBarcode), imageBytes, { sampleIndex: 1 },
    );

    expect(prediction).toEqual({
      parseStatus: 'failure',
      source: 'barcode',
      decision: 'error',
      failureCategory: 'provider',
      failureCode: 'provider_request_failed',
    });
  });
});
