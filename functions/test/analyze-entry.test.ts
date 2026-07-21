import { describe, expect, it, vi } from 'vitest';
import {
  handleEntryCreated,
  type AnalyzeEntryDeps,
  type EntryData,
} from '../src/analyze-entry';
import { DEFAULT_MODEL_CONFIG } from '../src/model-config';
import type { OffProduct } from '../src/off-client';
import type { ScanPushMessage } from '../src/push';

function modelResponse(confidence: number, barcode?: string): string {
  return JSON.stringify({
    name: 'Chicken Rice Bowl',
    kcal: 620,
    proteinG: 48,
    carbsG: 72,
    fatG: 16,
    confidence,
    candidates: [
      {
        name: 'Chicken Rice Bowl',
        confidence,
        kcal: 620,
        proteinG: 48,
        carbsG: 72,
        fatG: 16,
      },
    ],
    ...(barcode ? { barcode } : {}),
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
};

describe('handleEntryCreated', () => {
  it('ignores entries that are not pending', async () => {
    const { deps, recorded } = makeDeps();
    await handleEntryCreated('e1', { ...pendingEntry, status: 'complete' }, deps);
    expect(recorded.updates).toHaveLength(0);
  });

  it('serializes canonical meal analysis fields and uses the meal prompt', async () => {
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
      kcal: 620,
      protein: 48,
      carbs: 72,
      fat: 16,
      confidence: 0.91,
      atwaterKcal: 624,
      scanMode: 'meal',
      analysisModel: 'gemini-config-vision',
    });
    expect(recorded.updates[1]?.candidates).toEqual([
      expect.objectContaining({ name: 'Chicken Rice Bowl', proteinG: 48 }),
    ]);
    expect(recorded.pushes[0]!.notification.body).toBe('Chicken Rice Bowl · 620 kcal');
  });

  it('uses the label prompt and records label as the analysis source', async () => {
    const { deps, recorded } = makeDeps();
    await handleEntryCreated('e1', { ...pendingEntry, scanMode: 'label' }, deps);

    expect(recorded.visionCalls[0]?.prompt).toBe('label prompt');
    expect(recorded.updates[1]).toMatchObject({ scanMode: 'label' });
  });

  it('completes a known raw barcode from Open Food Facts without loading or auditing the image', async () => {
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
      kcal: 539,
      protein: 6.3,
      carbs: 57.5,
      fat: 30.9,
      confidence: 1,
      atwaterKcal: 533,
      scanMode: 'barcode',
      barcode: '3017624010701',
      analysisModel: 'open-food-facts-v3',
    });
  });

  it('extracts a barcode with vision, queries OFF, and uses the confirmed product', async () => {
    const { deps, recorded } = makeDeps({
      generateVision: async (model, prompt) => {
        recorded.visionCalls.push({ model, prompt });
        return modelResponse(0.96, '3017624010701');
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
      barcode: '3017624010701',
      analysisModel: 'open-food-facts-v3',
    });
  });

  it('forces an unknown barcode vision estimate below the review threshold', async () => {
    const { deps, recorded } = makeDeps({
      generateVision: async (model, prompt) => {
        recorded.visionCalls.push({ model, prompt });
        return modelResponse(0.99, '9999999999999');
      },
    });

    await handleEntryCreated('e1', { ...pendingEntry, scanMode: 'barcode' }, deps);

    expect(recorded.offCalls).toEqual(['9999999999999']);
    expect(recorded.updates[1]).toMatchObject({
      status: 'needs_review',
      scanMode: 'barcode',
      barcode: '9999999999999',
    });
    expect(recorded.updates[1]?.confidence).toBeLessThan(0.8);
  });

  it('gates low-confidence entries to needs_review and pushes the review notification', async () => {
    const { deps, recorded } = makeDeps({
      generateVision: async () => modelResponse(0.62),
    });
    await handleEntryCreated('e1', pendingEntry, deps);

    expect(recorded.updates[1]).toMatchObject({ status: 'needs_review', confidence: 0.62 });
    expect(recorded.pushes[0]!.notification.title).toBe('AppName scan ready to review');
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
});
