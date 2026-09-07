import { describe, expect, it, vi } from 'vitest';
import {
  handleEntryCreated,
  type AnalyzeEntryDeps,
  type EntryData,
} from '../src/analyze-entry';
import { DEFAULT_MODEL_CONFIG } from '../src/model-config';
import type { OffProduct } from '../src/off-client';
import type { ScanPushMessage } from '../src/push';

function modelResponse(
  confidence: number,
  barcode: string | null = null,
  source: 'meal' | 'package' = 'meal',
): string {
  const isPackage = source === 'package';
  return JSON.stringify({
    name: isPackage ? 'Vitamin Well Reload' : 'Chicken Rice Bowl',
    kcal: isPackage ? 85 : 620,
    proteinG: isPackage ? 0 : 48,
    carbsG: isPackage ? 21 : 72,
    fatG: isPackage ? 0 : 16,
    confidence,
    nutritionBasis: isPackage ? 'package' : 'portion',
    nutritionAmount: isPackage ? 500 : 1,
    nutritionUnit: isPackage ? 'ml' : 'portion',
    ...(isPackage
      ? {
        observedPackageAmount: 500,
        observedPackageUnit: 'ml',
        per100Reference: {
          kcal: 17,
          proteinG: 0,
          carbsG: 4.2,
          fatG: 0,
          amount: 100,
          unit: 'ml',
        },
        packageReference: {
          kcal: 85,
          proteinG: 0,
          carbsG: 21,
          fatG: 0,
          amount: 500,
          unit: 'ml',
        },
      }
      : {}),
    candidates: [
      {
        name: isPackage ? 'Vitamin Well Reload' : 'Chicken Rice Bowl',
        confidence,
        kcal: isPackage ? 85 : 620,
        proteinG: isPackage ? 0 : 48,
        carbsG: isPackage ? 21 : 72,
        fatG: isPackage ? 0 : 16,
      },
    ],
    barcode,
    detectedItems: [],
    boundingBox: null,
  });
}

interface Recorded {
  updates: Record<string, unknown>[];
  pushes: ScanPushMessage[];
  visionCalls: Array<{ model: string; prompt: string }>;
  offCalls: string[];
  imageLoads: number;
}

function makeDeps(overrides: Partial<AnalyzeEntryDeps> = {}): {
  deps: AnalyzeEntryDeps;
  recorded: Recorded;
} {
  const recorded: Recorded = {
    updates: [],
    pushes: [],
    visionCalls: [],
    offCalls: [],
    imageLoads: 0,
  };
  const deps: AnalyzeEntryDeps = {
    updateEntry: async (fields) => {
      recorded.updates.push(fields);
    },
    getFcmToken: async () => 'token-1',
    loadImageBase64: async () => {
      recorded.imageLoads += 1;
      return 'aW1hZ2U=';
    },
    generateVision: async (model, prompt) => {
      recorded.visionCalls.push({ model, prompt });
      return modelResponse(0.91);
    },
    fetchOffProduct: async (barcode) => {
      recorded.offCalls.push(barcode);
      return null;
    },
    sendPush: async (message) => {
      recorded.pushes.push(message);
    },
    getModelConfig: async () => DEFAULT_MODEL_CONFIG,
    appDisplayName: 'AppName',
    mealPrompt: 'meal prompt',
    labelPrompt: 'label prompt',
    barcodePrompt: 'barcode prompt',
    log: vi.fn(),
    ...overrides,
  };
  return { deps, recorded };
}

const pendingEntry: EntryData = {
  uid: 'user-1',
  status: 'pending',
  imageUrl: 'https://storage.example/scan.jpg',
  storagePath: 'scans/user-1/e1.jpg',
  scanMode: 'meal',
};

const knownProduct: OffProduct = {
  name: 'Nutella',
  kcalPer100g: 539,
  proteinPer100g: 6.3,
  carbsPer100g: 57.5,
  fatPer100g: 30.9,
  barcode: '3017624010701',
  productQuantity: { amount: 400, unit: 'g' },
  per100Reference: {
    kcal: 539,
    proteinG: 6.3,
    carbsG: 57.5,
    fatG: 30.9,
    amount: 100,
    unit: 'g',
  },
};

const mismatchedCatalogProduct: OffProduct = {
  ...knownProduct,
  barcode: '5449000000996',
};

describe('handleEntryCreated', () => {
  it('ignores entries that are not pending', async () => {
    const { deps, recorded } = makeDeps();
    await handleEntryCreated('e1', { ...pendingEntry, status: 'complete' }, deps);
    expect(recorded.updates).toHaveLength(0);
  });

  it('requires the normalizer canonical meal draft before persisting analysis fields', async () => {
    const { deps, recorded } = makeDeps({
      getModelConfig: async () => ({
        visionModel: 'gemini-config-vision',
        chatModel: 'x',
        confidenceThreshold: 0.8,
      }),
    });
    await handleEntryCreated('e1', pendingEntry, deps);

    expect(recorded.updates[0]).toEqual({ status: 'processing' });
    expect(recorded.visionCalls).toEqual([
      { model: 'gemini-config-vision', prompt: 'meal prompt' },
    ]);
    expect(recorded.updates[1]).toMatchObject({
      status: 'complete',
      foodName: 'Chicken Rice Bowl',
      baseKcal: 620,
      baseProtein: 48,
      baseCarbs: 72,
      baseFat: 16,
      confidence: 0.91,
      atwaterKcal: 624,
      scanMode: 'meal',
      analysisModel: 'gemini-config-vision',
      nutritionBasis: 'portion',
      nutritionAmount: 1,
      nutritionUnit: 'portion',
      consumedAmount: 1,
      reviewReasons: [],
    });
    expect(recorded.updates[1]?.candidates).toEqual([
      expect.objectContaining({ name: 'Chicken Rice Bowl', proteinG: 48 }),
    ]);
    expect(recorded.updates[1]).not.toHaveProperty('kcal');
    expect(recorded.updates[1]).not.toHaveProperty('protein');
    expect(recorded.pushes[0]!.notification.body).toBe('Chicken Rice Bowl · 620 kcal');
  });

  it('completes a valid label with an explicit null barcode and no barcode review reason', async () => {
    const { deps, recorded } = makeDeps();
    deps.generateVision = async (model, prompt) => {
      recorded.visionCalls.push({ model, prompt });
      return modelResponse(0.91, null, 'package');
    };
    await handleEntryCreated('e1', { ...pendingEntry, scanMode: 'label' }, deps);

    expect(recorded.visionCalls[0]?.prompt).toBe('label prompt');
    expect(recorded.updates[1]).toMatchObject({
      status: 'complete',
      scanMode: 'label',
      nutritionBasis: 'package',
      nutritionAmount: 500,
      nutritionUnit: 'ml',
      consumedAmount: 500,
      reviewReasons: [],
    });
  });

  it('normalizes a known raw barcode through the Task 2 package normalizer without loading the image', async () => {
    const { deps, recorded } = makeDeps({
      fetchOffProduct: async (barcode) => {
        recorded.offCalls.push(barcode);
        return knownProduct;
      },
    });

    await handleEntryCreated(
      'e1',
      { ...pendingEntry, scanMode: 'barcode', rawBarcode: '3017624010701' },
      deps,
    );

    expect(recorded.offCalls).toEqual(['3017624010701']);
    expect(recorded.imageLoads).toBe(0);
    expect(recorded.visionCalls).toHaveLength(0);
    expect(recorded.updates[1]).toMatchObject({
      status: 'complete',
      foodName: 'Nutella',
      baseKcal: 2156,
      baseProtein: 25.2,
      baseCarbs: 230,
      baseFat: 123.6,
      confidence: 1,
      scanMode: 'barcode',
      nutritionBasis: 'package',
      nutritionAmount: 400,
      nutritionUnit: 'g',
      consumedAmount: 400,
      rawBarcode: '3017624010701',
      confirmedBarcode: '3017624010701',
      reviewReasons: [],
      analysisModel: 'open-food-facts-v3',
    });
    expect(recorded.updates[1]).not.toHaveProperty('modelBarcode');
  });

  it('extracts a barcode with vision, queries OFF, and uses the confirmed product', async () => {
    const { deps, recorded } = makeDeps({
      generateVision: async (model, prompt) => {
        recorded.visionCalls.push({ model, prompt });
        return modelResponse(0.96, '3017624010701', 'package');
      },
      fetchOffProduct: async (barcode) => {
        recorded.offCalls.push(barcode);
        return knownProduct;
      },
    });

    await handleEntryCreated('e1', { ...pendingEntry, scanMode: 'barcode' }, deps);

    expect(recorded.visionCalls[0]?.prompt).toBe('barcode prompt');
    expect(recorded.offCalls).toEqual(['3017624010701']);
    expect(recorded.updates[1]).toMatchObject({
      status: 'complete',
      foodName: 'Nutella',
      baseKcal: 2156,
      baseProtein: 25.2,
      baseCarbs: 230,
      baseFat: 123.6,
      nutritionBasis: 'package',
      nutritionAmount: 400,
      nutritionUnit: 'g',
      consumedAmount: 400,
      modelBarcode: '3017624010701',
      confirmedBarcode: '3017624010701',
      reviewReasons: [],
      analysisModel: 'open-food-facts-v3',
    });
  });

  it('keeps unknown-barcode confidence and routes to review because of the blocking reason', async () => {
    const { deps, recorded } = makeDeps({
      generateVision: async (model, prompt) => {
        recorded.visionCalls.push({ model, prompt });
        return modelResponse(0.99, '9999999999999', 'package');
      },
    });

    await handleEntryCreated('e1', { ...pendingEntry, scanMode: 'barcode' }, deps);

    expect(recorded.offCalls).toEqual(['9999999999999']);
    expect(recorded.updates[1]).toMatchObject({
      status: 'needs_review',
      scanMode: 'barcode',
      baseKcal: 85,
      baseCarbs: 21,
      nutritionAmount: 500,
      consumedAmount: 500,
      confidence: 0.99,
      modelBarcode: '9999999999999',
      reviewReasons: ['barcode_unconfirmed'],
    });
  });

  it('routes low confidence alone to review without fabricating a blocking reason', async () => {
    const { deps, recorded } = makeDeps({
      generateVision: async () => modelResponse(0.62),
    });
    await handleEntryCreated('e1', pendingEntry, deps);

    expect(recorded.updates[1]).toMatchObject({
      status: 'needs_review',
      confidence: 0.62,
      reviewReasons: [],
    });
    expect(recorded.pushes[0]!.notification.title).toBe('AppName scan ready to review');
  });

  it('keeps low confidence independent from an unknown-barcode blocking reason', async () => {
    const { deps, recorded } = makeDeps({
      generateVision: async (model, prompt) => {
        recorded.visionCalls.push({ model, prompt });
        return modelResponse(0.62, '9999999999999', 'package');
      },
    });
    await handleEntryCreated('e1', { ...pendingEntry, scanMode: 'barcode' }, deps);
    expect(recorded.updates[1]).toMatchObject({
      status: 'needs_review',
      confidence: 0.62,
      reviewReasons: ['barcode_unconfirmed'],
    });
  });

  it('forces review when the queried raw barcode differs from the returned catalog barcode', async () => {
    const { deps, recorded } = makeDeps({
      fetchOffProduct: async (barcode) => {
        recorded.offCalls.push(barcode);
        return mismatchedCatalogProduct;
      },
    });
    await handleEntryCreated(
      'e1',
      { ...pendingEntry, scanMode: 'barcode', rawBarcode: '3017624010701' },
      deps,
    );
    expect(recorded.updates[1]).toMatchObject({
      status: 'needs_review',
      rawBarcode: '3017624010701',
      confirmedBarcode: '5449000000996',
      reviewReasons: ['barcode_unconfirmed'],
    });
  });

  it('skips the push when the user has no FCM token', async () => {
    const { deps, recorded } = makeDeps({ getFcmToken: async () => undefined });
    await handleEntryCreated('e1', pendingEntry, deps);
    expect(recorded.updates[1]).toMatchObject({ status: 'complete' });
    expect(recorded.pushes).toHaveLength(0);
  });

  it('writes an error status when the model returns unusable output', async () => {
    const { deps, recorded } = makeDeps({ generateVision: async () => 'not json' });
    await handleEntryCreated('e1', pendingEntry, deps);
    expect(recorded.updates[1]).toMatchObject({ status: 'error' });
    expect(String(recorded.updates[1]!.errorMessage)).toContain('no_json_object_in_response');
  });

  it('never persists a draft when strict schema validation or normalization yields model_schema_invalid', async () => {
    const { deps, recorded } = makeDeps({
      generateVision: async () => JSON.stringify({
        name: 'Old compatibility response',
        kcal: 100,
        proteinG: 1,
        carbsG: 20,
        fatG: 0,
        confidence: 0.99,
        candidates: [],
        barcode: null,
        detectedItems: [],
        boundingBox: null,
      }),
    });

    await handleEntryCreated('e1', pendingEntry, deps);

    expect(recorded.updates[1]).toEqual({
      status: 'error',
      errorCode: 'model_schema_invalid',
      errorMessage: expect.any(String),
    });
    expect(recorded.pushes).toHaveLength(0);
  });
});
