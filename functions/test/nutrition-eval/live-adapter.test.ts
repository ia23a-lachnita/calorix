import { describe, expect, it, vi } from 'vitest';

import { createLiveNutritionEvalAdapter } from '../../src/nutrition-eval/live-adapter';
import {
  BARCODE_ANALYSIS_PROMPT,
  LABEL_ANALYSIS_PROMPT,
  MEAL_ANALYSIS_PROMPT,
} from '../../src/prompts';
import type { GenAIAdapter } from '../../src/genai-adapter';
import {
  parseNutritionEvalManifest,
  type NutritionEvalCase,
} from '../../src/nutrition-eval/schema';
import type { OffProduct } from '../../src/off-client';

const imageBytes = new Uint8Array([0, 255, 1]);

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
  truth: { basis: 'portion', amount: 1, unit: 'portion', kcal: 100, proteinG: 1, carbsG: 2, fatG: 3 },
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
  expectedBarcode: '5449000000996',
};

const offProduct: OffProduct = {
  name: 'Coca-Cola',
  kcalPer100g: 42,
  proteinPer100g: 0,
  carbsPer100g: 10.6,
  fatPer100g: 0,
};

function modelText(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    name: 'Test food',
    kcal: 100,
    proteinG: 1,
    carbsG: 2,
    fatG: 3,
    confidence: 0.9,
    ...overrides,
  });
}

function makeAdapter(
  responseText = modelText(),
  fetchOffProductFn: (barcode: string) => Promise<OffProduct | null> = async () => null,
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

  it('uses the meal prompt and real parser so a valid meal response becomes a complete prediction', async () => {
    const { adapter, generateVision } = makeAdapter();

    const prediction = await adapter.analyzeCase(mealCase, imageBytes, { sampleIndex: 1 });

    expect(prediction).toMatchObject({
      parseStatus: 'success', source: 'meal', kcal: 100, confidence: 0.9, decision: 'complete',
    });
    expect(prediction).not.toHaveProperty('basis');
    expect(generateVision).toHaveBeenCalledWith(
      'gemini-test-model', MEAL_ANALYSIS_PROMPT, 'AP8B',
    );
  });

  it('uses the label prompt and real parser so a valid label response retains label source', async () => {
    const { adapter, generateVision } = makeAdapter(modelText({ confidence: 0.79 }));

    const prediction = await adapter.analyzeCase(labelCase, imageBytes, { sampleIndex: 1 });

    expect(prediction).toMatchObject({
      parseStatus: 'success', source: 'label', kcal: 100, confidence: 0.79, decision: 'needs_review',
    });
    expect(generateVision).toHaveBeenCalledWith(
      'gemini-test-model', LABEL_ANALYSIS_PROMPT, 'AP8B',
    );
  });

  it('looks up supplied barcode before vision and preserves OFF per-100 values without basis fields', async () => {
    const fetchOffProductFn = vi.fn(async () => offProduct);
    const { adapter, generateVision } = makeAdapter(modelText(), fetchOffProductFn);
    const suppliedBarcodeCase = caseWithSuppliedBarcode('5449000000996');

    const prediction = await adapter.analyzeCase(suppliedBarcodeCase, imageBytes, { sampleIndex: 1 });

    expect(prediction).toEqual({
      parseStatus: 'success',
      source: 'barcode',
      kcal: 42,
      proteinG: 0,
      carbsG: 10.6,
      fatG: 0,
      confidence: 1,
      barcode: '5449000000996',
      decision: 'complete',
    });
    expect(fetchOffProductFn).toHaveBeenCalledTimes(1);
    expect(fetchOffProductFn).toHaveBeenCalledWith('5449000000996');
    expect(generateVision).not.toHaveBeenCalled();
  });

  it('falls back from an OFF miss to barcode vision and keeps a usable vision prediction after the distinct read barcode misses', async () => {
    const fetchOffProductFn = vi.fn(async () => null);
    const { adapter, generateVision } = makeAdapter(
      modelText({ barcode: '12345678', confidence: 0.97 }),
      fetchOffProductFn,
    );
    const suppliedBarcodeCase = caseWithSuppliedBarcode('5449000000996');

    const prediction = await adapter.analyzeCase(suppliedBarcodeCase, imageBytes, { sampleIndex: 1 });

    expect(prediction).toMatchObject({
      parseStatus: 'success',
      source: 'barcode',
      barcode: '12345678',
      confidence: 0.79,
      decision: 'needs_review',
    });
    expect(fetchOffProductFn).toHaveBeenNthCalledWith(1, '5449000000996');
    expect(fetchOffProductFn).toHaveBeenNthCalledWith(2, '12345678');
    expect(generateVision).toHaveBeenCalledWith(
      'gemini-test-model', BARCODE_ANALYSIS_PROMPT, 'AP8B',
    );
  });

  it('does not treat scoring-only expectedBarcode as observed input for an OFF lookup', async () => {
    const fetchOffProductFn = vi.fn(async () => offProduct);
    const { adapter, generateVision } = makeAdapter(modelText(), fetchOffProductFn);

    const prediction = await adapter.analyzeCase(barcodeCase, imageBytes, { sampleIndex: 1 });

    expect(prediction).toMatchObject({ parseStatus: 'success', source: 'barcode', decision: 'needs_review' });
    expect(fetchOffProductFn).not.toHaveBeenCalled();
    expect(generateVision).toHaveBeenCalledWith(
      'gemini-test-model', BARCODE_ANALYSIS_PROMPT, 'AP8B',
    );
  });

  it('rejects a non-8-to-14-digit supplied barcode before it can become an OFF query', () => {
    expect(() => caseWithSuppliedBarcode('1234567')).toThrow(/8-14 digits/);
  });

  it('does not query OFF twice when vision reads the same barcode already supplied by the client', async () => {
    const fetchOffProductFn = vi.fn(async () => null);
    const { adapter } = makeAdapter(
      modelText({ barcode: '5449000000996', confidence: 0.97 }),
      fetchOffProductFn,
    );

    const prediction = await adapter.analyzeCase(
      caseWithSuppliedBarcode('5449000000996'), imageBytes, { sampleIndex: 1 },
    );

    expect(fetchOffProductFn).toHaveBeenCalledTimes(1);
    expect(fetchOffProductFn).toHaveBeenCalledWith('5449000000996');
    expect(prediction).toMatchObject({ barcode: '5449000000996', confidence: 0.79, decision: 'needs_review' });
  });

  it('replaces a barcode vision prediction with an OFF hit for a distinct barcode read from the image', async () => {
    const fetchOffProductFn = vi.fn(async (barcode: string) =>
      barcode === '12345678' ? offProduct : null,
    );
    const { adapter } = makeAdapter(
      modelText({ barcode: '12345678', confidence: 0.97 }),
      fetchOffProductFn,
    );

    const prediction = await adapter.analyzeCase(
      caseWithSuppliedBarcode('5449000000996'), imageBytes, { sampleIndex: 1 },
    );

    expect(fetchOffProductFn).toHaveBeenNthCalledWith(1, '5449000000996');
    expect(fetchOffProductFn).toHaveBeenNthCalledWith(2, '12345678');
    expect(prediction).toMatchObject({ kcal: 42, barcode: '12345678', confidence: 1, decision: 'complete' });
    expect(prediction).not.toHaveProperty('basis');
  });

  it('converts invalid model text into a stable schema failure without raw provider diagnostics', async () => {
    const { adapter } = makeAdapter('not JSON: bearer secret-token');

    const prediction = await adapter.analyzeCase(mealCase, imageBytes, { sampleIndex: 1 });

    expect(prediction).toEqual({
      parseStatus: 'failure',
      source: 'meal',
      decision: 'error',
      failureCategory: 'schema',
      failureCode: 'model_response_invalid',
    });
  });

  it('converts a thrown provider dependency into a stable failure without its message or stack', async () => {
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

  it('converts a thrown OFF dependency into a stable failure without its message or stack', async () => {
    const { adapter } = makeAdapter(
      modelText(),
      async () => {
        throw new Error('Bearer test-token at /private/off-client.ts:42');
      },
    );
    const suppliedBarcodeCase = caseWithSuppliedBarcode('5449000000996');

    const prediction = await adapter.analyzeCase(suppliedBarcodeCase, imageBytes, { sampleIndex: 1 });

    expect(prediction).toEqual({
      parseStatus: 'failure',
      source: 'barcode',
      decision: 'error',
      failureCategory: 'provider',
      failureCode: 'provider_request_failed',
    });
  });
});
