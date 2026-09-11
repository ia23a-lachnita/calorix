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
  includePer100Reference = true,
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
        ...(includePer100Reference ? {
          per100Reference: {
            kcal: 17,
            proteinG: 0,
            carbsG: 4.2,
            fatG: 0,
            amount: 100,
            unit: 'ml',
          },
        } : {}),
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

function overflowPackageResponse(): string {
  const maximum = Number.MAX_VALUE;
  return JSON.stringify({
    name: 'Overflow Drink',
    kcal: maximum,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    confidence: 0.99,
    nutritionBasis: 'package',
    nutritionAmount: maximum,
    nutritionUnit: 'ml',
    observedPackageAmount: maximum,
    observedPackageUnit: 'ml',
    per100Reference: {
      kcal: maximum,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      amount: 100,
      unit: 'ml',
    },
    packageReference: {
      kcal: maximum,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      amount: maximum,
      unit: 'ml',
    },
    candidates: [{ name: 'Overflow Drink', confidence: 0.99, kcal: maximum, proteinG: 0, carbsG: 0, fatG: 0 }],
    barcode: null,
    detectedItems: [],
    boundingBox: null,
  });
}

interface Recorded {
  updates: Record<string, unknown>[];
  pushes: ScanPushMessage[];
  visionCalls: Array<{ model: string; prompt: string; source?: string }>;
  offCalls: string[];
  imageLoads: number;
}

function applyPersistedUpdate(
  state: Record<string, unknown>,
  fields: Record<string, unknown>,
  deletionSentinel: unknown,
): void {
  for (const [key, value] of Object.entries(fields)) {
    if (value === deletionSentinel) {
      delete state[key];
    } else {
      state[key] = value;
    }
  }
}

/**
 * Task 4 will type this dependency. Until then, keep the future Firestore
 * FieldValue.delete() seam local to these RED tests.
 */
function withAnalysisFieldDeletion(deps: AnalyzeEntryDeps, deletionSentinel: unknown): AnalyzeEntryDeps {
  Reflect.set(deps, 'analysisFieldDeletion', deletionSentinel);
  return deps;
}

function makePersistedDeps(
  initialState: Record<string, unknown>,
  deletionSentinel: unknown | undefined,
  overrides: Partial<AnalyzeEntryDeps> = {},
): { deps: AnalyzeEntryDeps; recorded: Recorded; state: Record<string, unknown> } {
  const { deps, recorded } = makeDeps(overrides);
  const state = { ...initialState };
  deps.updateEntry = async (fields) => {
    recorded.updates.push(fields);
    applyPersistedUpdate(state, fields, deletionSentinel);
  };
  if (deletionSentinel !== undefined) withAnalysisFieldDeletion(deps, deletionSentinel);
  return { deps, recorded, state };
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
    generateVision: async (model, prompt, _imageBase64, source?) => {
      recorded.visionCalls.push({ model, prompt, source });
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

const package500MlProduct: OffProduct = {
  name: 'Vitamin Well Reload',
  kcalPer100g: 17,
  proteinPer100g: 0,
  carbsPer100g: 4.2,
  fatPer100g: 0,
  barcode: '7350042719011',
  productQuantity: { amount: 500, unit: 'ml' },
  rawQuantity: '2 x 250 ml',
  per100Reference: {
    kcal: 17,
    proteinG: 0,
    carbsG: 4.2,
    fatG: 0,
    amount: 100,
    unit: 'ml',
  },
  servingReference: {
    kcal: 42.5,
    proteinG: 0,
    carbsG: 10.5,
    fatG: 0,
    amount: 250,
    unit: 'ml',
  },
};

const unresolvedPackageProduct: OffProduct = {
  ...package500MlProduct,
  productQuantity: undefined,
  rawQuantity: undefined,
  servingReference: undefined,
};

const malformedOffReferenceProduct: OffProduct = {
  ...knownProduct,
  per100Reference: {
    ...knownProduct.per100Reference!,
    amount: 101,
  },
};

const analysisResultKeys = [
  'foodName',
  'baseKcal',
  'baseProtein',
  'baseCarbs',
  'baseFat',
  'confidence',
  'atwaterKcal',
  'candidates',
  'nutritionBasis',
  'nutritionAmount',
  'nutritionUnit',
  'consumedAmount',
  'packageUnitCount',
  'unitAmount',
  'per100Reference',
  'servingReference',
  'reviewReasons',
  'modelBarcode',
  'confirmedBarcode',
  'barcode',
  'detectedItems',
  'boundingBox',
  'analysisModel',
] as const;

const legacyAnalysisKeys = ['servingMultiplier', 'kcal', 'protein', 'carbs', 'fat'] as const;

const staleAnalysisKeys = [...analysisResultKeys, ...legacyAnalysisKeys] as const;

function staleAnalysisState(): Record<string, unknown> {
  return {
    foodName: 'Stale drink',
    baseKcal: 170,
    baseProtein: 2,
    baseCarbs: 42,
    baseFat: 4,
    confidence: 0.4,
    atwaterKcal: 180,
    candidates: [{ name: 'Stale drink' }],
    nutritionBasis: 'package',
    nutritionAmount: 500,
    nutritionUnit: 'ml',
    consumedAmount: 500,
    packageUnitCount: 2,
    unitAmount: 250,
    per100Reference: { kcal: 17, proteinG: 0, carbsG: 4.2, fatG: 0, amount: 100, unit: 'ml' },
    servingReference: { kcal: 42.5, proteinG: 0, carbsG: 10.5, fatG: 0, amount: 250, unit: 'ml' },
    reviewReasons: ['barcode_unconfirmed'],
    modelBarcode: '1111111111111',
    confirmedBarcode: '2222222222222',
    barcode: '3333333333333',
    detectedItems: [{ label: 'stale' }],
    boundingBox: { x: 1, y: 2, width: 3, height: 4 },
    analysisModel: 'old-model',
    servingMultiplier: 2,
    kcal: 170,
    protein: 2,
    carbs: 42,
    fat: 4,
    errorCode: 'old_error',
    errorMessage: 'Old error',
  };
}

function expectDeletedFields(
  fields: Record<string, unknown>,
  keys: readonly string[],
  deletionSentinel: unknown,
): void {
  for (const key of keys) expect(fields[key]).toBe(deletionSentinel);
}

describe('handleEntryCreated', () => {
  it('ignores entries that are not pending', async () => {
    const { deps, recorded } = makeDeps();
    await handleEntryCreated('e1', { ...pendingEntry, status: 'complete' }, deps);
    expect(recorded.updates).toHaveLength(0);
  });

  it('persists the normalizer-owned meal Review reason and sends the exact review push', async () => {
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
      { model: 'gemini-config-vision', prompt: 'meal prompt', source: 'meal' },
    ]);
    expect(recorded.updates[1]).toMatchObject({
      status: 'needs_review',
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
      reviewReasons: ['nutrition_basis_ambiguous'],
    });
    expect(recorded.updates[1]?.candidates).toEqual([
      expect.objectContaining({ name: 'Chicken Rice Bowl', proteinG: 48 }),
    ]);
    expect(recorded.updates[1]?.detectedItems).toEqual([]);
    expect(recorded.updates[1]).not.toHaveProperty('rawBarcode');
    expect(recorded.updates[1]).not.toHaveProperty('modelBarcode');
    expect(recorded.updates[1]).not.toHaveProperty('confirmedBarcode');
    expect(recorded.updates[1]).not.toHaveProperty('kcal');
    expect(recorded.updates[1]).not.toHaveProperty('protein');
    expect(recorded.pushes[0]).toEqual({
      token: 'token-1',
      notification: {
        title: 'AppName scan ready to review',
        body: 'Is this Chicken Rice Bowl? Confirm or correct it.',
      },
      data: { entryId: 'e1' },
      android: { priority: 'high' },
    });
  });

  it.each([
    { scanMode: 'meal', prompt: 'meal prompt' },
    { scanMode: 'label', prompt: 'label prompt' },
    { scanMode: 'barcode', prompt: 'barcode prompt' },
  ] as const)('forwards $scanMode scan source to the vision adapter', async ({ scanMode, prompt }) => {
    const { deps, recorded } = makeDeps();

    await handleEntryCreated('e1', { ...pendingEntry, scanMode }, deps);

    expect(recorded.visionCalls[0]).toMatchObject({ prompt, source: scanMode });
  });

  it('routes a high-confidence vision label through the normalizer to Review and sends a review push', async () => {
    const { deps, recorded } = makeDeps();
    deps.generateVision = async (model, prompt) => {
      recorded.visionCalls.push({ model, prompt });
      return modelResponse(0.91, null, 'package');
    };
    await handleEntryCreated('e1', { ...pendingEntry, scanMode: 'label' }, deps);

    expect(recorded.visionCalls[0]?.prompt).toBe('label prompt');
    expect(recorded.updates[1]).toMatchObject({
      status: 'needs_review',
      scanMode: 'label',
      nutritionBasis: 'package',
      nutritionAmount: 500,
      nutritionUnit: 'ml',
      consumedAmount: 500,
      reviewReasons: ['nutrition_basis_ambiguous'],
    });
    expect(recorded.pushes[0]!.notification.title).toBe('AppName scan ready to review');
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

  it('keeps the normalizer meal fail-safe reason distinct from low confidence', async () => {
    const { deps, recorded } = makeDeps({
      generateVision: async () => modelResponse(0.62),
    });
    await handleEntryCreated('e1', pendingEntry, deps);

    expect(recorded.updates[1]).toMatchObject({
      status: 'needs_review',
      confidence: 0.62,
      reviewReasons: ['nutrition_basis_ambiguous'],
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
    expect(recorded.updates[1]).toMatchObject({
      status: 'needs_review',
      reviewReasons: ['nutrition_basis_ambiguous'],
    });
    expect(recorded.pushes).toHaveLength(0);
  });

  it('writes an error status when the model returns unusable output', async () => {
    const { deps, recorded } = makeDeps({ generateVision: async () => 'not json' });
    await handleEntryCreated('e1', pendingEntry, deps);
    expect(recorded.updates[1]).toEqual({
      status: 'error',
      errorCode: 'model_schema_invalid',
      errorMessage: 'Invalid model response',
    });
    expect(deps.log).toHaveBeenCalledWith(expect.any(String), 'no_json_object_in_response');
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
      errorMessage: 'Invalid model response',
    });
    expect(recorded.pushes).toHaveLength(0);
  });

  it('replaces a known package with an unresolved package without deleting source-owned scan inputs', async () => {
    const deletionSentinel = Object.freeze({ firestore: 'delete' });
    let product: OffProduct = package500MlProduct;
    const sourceEntry: EntryData = {
      uid: 'user-1',
      status: 'pending',
      imageUrl: 'https://storage.example/reload.jpg',
      storagePath: 'scans/user-1/reload.jpg',
      scanMode: 'barcode',
      rawBarcode: '7350042719011',
    };
    const { deps, recorded, state } = makePersistedDeps(
      sourceEntry,
      deletionSentinel,
      { fetchOffProduct: async () => product },
    );

    await handleEntryCreated('e1', sourceEntry, deps);
    const knownUpdate = recorded.updates[1]!;
    const knownState = { ...state };
    expect(knownUpdate).toMatchObject({
      status: 'complete',
      foodName: 'Vitamin Well Reload',
      baseKcal: 85,
      baseProtein: 0,
      baseCarbs: 21,
      baseFat: 0,
      nutritionBasis: 'package',
      nutritionAmount: 500,
      nutritionUnit: 'ml',
      consumedAmount: 500,
      packageUnitCount: 2,
      unitAmount: 250,
      per100Reference: { kcal: 17, proteinG: 0, carbsG: 4.2, fatG: 0, amount: 100, unit: 'ml' },
      servingReference: { kcal: 42.5, proteinG: 0, carbsG: 10.5, fatG: 0, amount: 250, unit: 'ml' },
      reviewReasons: [],
      rawBarcode: '7350042719011',
      confirmedBarcode: '7350042719011',
    });
    expect(knownState).toMatchObject({
      baseKcal: 85,
      consumedAmount: 500,
      packageUnitCount: 2,
      unitAmount: 250,
      reviewReasons: [],
      rawBarcode: '7350042719011',
      confirmedBarcode: '7350042719011',
    });
    product = unresolvedPackageProduct;
    await handleEntryCreated('e1', sourceEntry, deps);

    const unresolvedUpdate = recorded.updates[3]!;
    expect(unresolvedUpdate).toMatchObject({
      status: 'needs_review',
      nutritionBasis: 'per100g',
      nutritionAmount: 100,
      nutritionUnit: 'ml',
      baseKcal: 17,
      reviewReasons: ['package_quantity_missing'],
      consumedAmount: deletionSentinel,
      packageUnitCount: deletionSentinel,
      unitAmount: deletionSentinel,
      servingReference: deletionSentinel,
    });
    expect(unresolvedUpdate.rawBarcode).not.toBe(deletionSentinel);
    expect(unresolvedUpdate.imageUrl).not.toBe(deletionSentinel);
    expect(unresolvedUpdate.storagePath).not.toBe(deletionSentinel);
    expect(unresolvedUpdate.scanMode).not.toBe(deletionSentinel);
    expect(state).toMatchObject({
      imageUrl: 'https://storage.example/reload.jpg',
      storagePath: 'scans/user-1/reload.jpg',
      scanMode: 'barcode',
      rawBarcode: '7350042719011',
      nutritionBasis: 'per100g',
      nutritionAmount: 100,
      nutritionUnit: 'ml',
      baseKcal: 17,
    });
    expect(state).not.toHaveProperty('consumedAmount');
    expect(state).not.toHaveProperty('packageUnitCount');
    expect(state).not.toHaveProperty('unitAmount');
    expect(state).not.toHaveProperty('servingReference');
  });

  it('replaces stale analysis with a safe provider error while retaining only source inputs', async () => {
    const deletionSentinel = Object.freeze({ firestore: 'delete' });
    const rawProviderDiagnostic = 'upstream 503: token=should-never-persist';
    const { deps, recorded, state } = makePersistedDeps(
      {
        uid: 'user-1',
        status: 'pending',
        imageUrl: 'https://storage.example/scan.jpg',
        storagePath: 'scans/user-1/e1.jpg',
        scanMode: 'label',
        rawBarcode: '7350042719011',
        ...staleAnalysisState(),
      },
      deletionSentinel,
      { generateVision: async () => { throw new Error(rawProviderDiagnostic); } },
    );

    await handleEntryCreated('e1', { ...pendingEntry, scanMode: 'label' }, deps);

    const errorUpdate = recorded.updates[1]!;
    expect(errorUpdate).toMatchObject({
      status: 'error',
      errorCode: 'provider_request_failed',
      errorMessage: 'Analysis provider request failed',
    });
    expectDeletedFields(errorUpdate, staleAnalysisKeys, deletionSentinel);
    expect(JSON.stringify(errorUpdate)).not.toContain(rawProviderDiagnostic);
    expect(state).toEqual({
      uid: 'user-1',
      status: 'error',
      errorCode: 'provider_request_failed',
      errorMessage: 'Analysis provider request failed',
      imageUrl: 'https://storage.example/scan.jpg',
      storagePath: 'scans/user-1/e1.jpg',
      scanMode: 'label',
      rawBarcode: '7350042719011',
    });
    expect(recorded.pushes).toHaveLength(0);
    expect(deps.log).toHaveBeenCalledWith(expect.any(String), expect.any(Error));
  });

  it('replaces stale error and legacy multipliers with a reviewed canonical label package result', async () => {
    const deletionSentinel = Object.freeze({ firestore: 'delete' });
    const { deps, recorded, state } = makePersistedDeps(
      {
        ...pendingEntry,
        status: 'pending',
        ...staleAnalysisState(),
      },
      deletionSentinel,
      { generateVision: async () => modelResponse(0.99, null, 'package', false) },
    );

    await handleEntryCreated('e1', { ...pendingEntry, scanMode: 'label' }, deps);

    const successUpdate = recorded.updates[1]!;
    expect(successUpdate).toMatchObject({
      status: 'needs_review',
      nutritionBasis: 'package',
      nutritionAmount: 500,
      nutritionUnit: 'ml',
      consumedAmount: 500,
      baseKcal: 85,
      reviewReasons: ['nutrition_basis_ambiguous'],
    });
    expectDeletedFields(
      successUpdate,
      [
        'packageUnitCount',
        'unitAmount',
        'per100Reference',
        'servingReference',
        'modelBarcode',
        'confirmedBarcode',
        'barcode',
        'errorCode',
        'errorMessage',
        ...legacyAnalysisKeys,
      ],
      deletionSentinel,
    );
    expect(state.baseKcal).toBe(85);
    expect(state).not.toHaveProperty('errorCode');
    expect(state).not.toHaveProperty('errorMessage');
    expect(state).not.toHaveProperty('servingMultiplier');
    expect(state).not.toHaveProperty('kcal');
    expect(state).not.toHaveProperty('per100Reference');
    expect(state).not.toHaveProperty('barcode');
  });

  it('keeps a normalizer-reviewed meal result when FCM-token lookup fails after persistence', async () => {
    const notificationFailure = new Error('FCM token lookup failed');
    const { deps, recorded, state } = makePersistedDeps(
      pendingEntry,
      Object.freeze({ firestore: 'delete' }),
      {
        generateVision: async () => modelResponse(0.99),
        getFcmToken: async () => { throw notificationFailure; },
      },
    );

    await expect(handleEntryCreated('e1', pendingEntry, deps)).resolves.toBeUndefined();

    expect(recorded.updates).toHaveLength(2);
    expect(recorded.updates[1]).toMatchObject({
      status: 'needs_review', baseKcal: 620, consumedAmount: 1, reviewReasons: ['nutrition_basis_ambiguous'],
    });
    expect(state).toMatchObject({
      status: 'needs_review', baseKcal: 620, consumedAmount: 1, reviewReasons: ['nutrition_basis_ambiguous'],
    });
    expect(state).not.toHaveProperty('errorCode');
    expect(state).not.toHaveProperty('errorMessage');
    expect(deps.log).toHaveBeenCalledWith(expect.any(String), notificationFailure);
  });

  it('keeps a canonical review result when sending its notification fails after persistence', async () => {
    const notificationFailure = new Error('FCM send failed');
    const { deps, recorded, state } = makePersistedDeps(
      pendingEntry,
      Object.freeze({ firestore: 'delete' }),
      {
        generateVision: async () => modelResponse(0.62),
        sendPush: async () => { throw notificationFailure; },
      },
    );

    await expect(handleEntryCreated('e1', pendingEntry, deps)).resolves.toBeUndefined();

    expect(recorded.updates).toHaveLength(2);
    expect(recorded.updates[1]).toMatchObject({ status: 'needs_review', baseKcal: 620, consumedAmount: 1 });
    expect(state).toMatchObject({ status: 'needs_review', baseKcal: 620, consumedAmount: 1 });
    expect(state).not.toHaveProperty('errorCode');
    expect(state).not.toHaveProperty('errorMessage');
    expect(deps.log).toHaveBeenCalledWith(expect.any(String), notificationFailure);
  });

  it('propagates a canonical persistence failure without attempting a replacement error write', async () => {
    const persistenceFailure = new Error('canonical write sentinel');
    const { deps, recorded } = makeDeps({ generateVision: async () => modelResponse(0.99) });
    let updateAttempts = 0;
    deps.updateEntry = async (fields) => {
      recorded.updates.push(fields);
      updateAttempts += 1;
      if (updateAttempts === 2) throw persistenceFailure;
    };

    await expect(handleEntryCreated('e1', pendingEntry, deps)).rejects.toBe(persistenceFailure);

    expect(recorded.updates).toHaveLength(2);
    expect(recorded.updates[0]).toEqual({ status: 'processing' });
    expect(recorded.updates[1]).toMatchObject({
      status: 'needs_review', baseKcal: 620, consumedAmount: 1, reviewReasons: ['nutrition_basis_ambiguous'],
    });
    expect(recorded.pushes).toHaveLength(0);
  });

  it('classifies a successfully fetched OFF product with invalid normalization data as a safe schema error', async () => {
    const deletionSentinel = Object.freeze({ firestore: 'delete' });
    const sourceState = {
      uid: 'user-1',
      imageUrl: 'https://storage.example/off.jpg',
      storagePath: 'scans/user-1/off.jpg',
      scanMode: 'barcode',
      rawBarcode: '3017624010701',
    };
    const entry: EntryData = { ...sourceState, status: 'pending' };
    const { deps, recorded, state } = makePersistedDeps(
      { ...entry, ...staleAnalysisState() },
      deletionSentinel,
      { fetchOffProduct: async () => malformedOffReferenceProduct },
    );

    await handleEntryCreated('e1', entry, deps);

    const errorUpdate = recorded.updates[1]!;
    expect(errorUpdate).toMatchObject({
      status: 'error',
      errorCode: 'model_schema_invalid',
      errorMessage: 'Invalid model response',
    });
    expectDeletedFields(errorUpdate, staleAnalysisKeys, deletionSentinel);
    expect(state).toEqual({
      ...sourceState,
      status: 'error',
      errorCode: 'model_schema_invalid',
      errorMessage: 'Invalid model response',
    });
    expect(deps.log).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ message: 'Invalid nutrition contract' }));
    expect(recorded.pushes).toHaveLength(0);
  });

  it('omits absent optional analysis fields without undefined values when no deletion sentinel is injected', async () => {
    const { deps, recorded } = makePersistedDeps(
      pendingEntry,
      undefined,
      { fetchOffProduct: async () => unresolvedPackageProduct },
    );

    await handleEntryCreated(
      'e1',
      { ...pendingEntry, scanMode: 'barcode', rawBarcode: '7350042719011' },
      deps,
    );

    const saved = recorded.updates[1]!;
    expect(saved).toMatchObject({
      status: 'needs_review',
      nutritionBasis: 'per100g',
      nutritionAmount: 100,
      nutritionUnit: 'ml',
    });
    expect(saved).not.toHaveProperty('consumedAmount');
    expect(saved).not.toHaveProperty('packageUnitCount');
    expect(saved).not.toHaveProperty('unitAmount');
    expect(saved).not.toHaveProperty('servingReference');
    expect(saved).not.toHaveProperty('modelBarcode');
    expect(saved).not.toHaveProperty('errorCode');
    expect(saved).not.toHaveProperty('errorMessage');
    for (const key of legacyAnalysisKeys) expect(saved).not.toHaveProperty(key);
    expect(Object.values(saved)).not.toContain(undefined);
  });

  it('omits every inapplicable package, reference, error, and legacy field for a no-sentinel plain meal', async () => {
    const { deps, recorded } = makeDeps({ generateVision: async () => modelResponse(0.99) });

    await handleEntryCreated('e1', pendingEntry, deps);

    const saved = recorded.updates[1]!;
    expect(saved).toMatchObject({
      status: 'needs_review',
      nutritionBasis: 'portion',
      nutritionAmount: 1,
      nutritionUnit: 'portion',
      consumedAmount: 1,
    });
    for (const key of [
      'per100Reference',
      'servingReference',
      'modelBarcode',
      'confirmedBarcode',
      'packageUnitCount',
      'unitAmount',
      'errorCode',
      'errorMessage',
      ...legacyAnalysisKeys,
    ]) expect(saved).not.toHaveProperty(key);
    expect(Object.values(saved)).not.toContain(undefined);
  });

  it('keeps parse diagnostics out of persisted errors and records the safe schema failure', async () => {
    const deletionSentinel = Object.freeze({ firestore: 'delete' });
    const sourceState = {
      uid: 'user-1',
      imageUrl: 'https://storage.example/invalid.jpg',
      storagePath: 'scans/user-1/invalid.jpg',
      scanMode: 'meal',
      rawBarcode: '7350042719011',
    };
    const entry: EntryData = { ...sourceState, status: 'pending' };
    const { deps, recorded, state } = makePersistedDeps(
      { ...entry, ...staleAnalysisState() },
      deletionSentinel,
      { generateVision: async () => 'not json' },
    );

    await handleEntryCreated('e1', entry, deps);

    const savedError = recorded.updates[1]!;
    expect(savedError).toMatchObject({
      status: 'error',
      errorCode: 'model_schema_invalid',
      errorMessage: 'Invalid model response',
    });
    expectDeletedFields(savedError, staleAnalysisKeys, deletionSentinel);
    expect(JSON.stringify(savedError)).not.toContain('no_json_object_in_response');
    expect(state).toEqual({
      ...sourceState,
      status: 'error',
      errorCode: 'model_schema_invalid',
      errorMessage: 'Invalid model response',
    });
    expect(deps.log).toHaveBeenCalledWith(expect.any(String), 'no_json_object_in_response');
    expect(recorded.pushes).toHaveLength(0);
  });

  it('replaces all stale analysis with the exact safe schema error when normalization overflows', async () => {
    const deletionSentinel = Object.freeze({ firestore: 'delete' });
    const sourceState = {
      uid: 'user-1',
      date: '2026-09-07',
      imageUrl: 'https://storage.example/overflow.jpg',
      storagePath: 'scans/user-1/overflow.jpg',
      scanMode: 'label',
      rawBarcode: '7350042719011',
    };
    const { deps, recorded, state } = makePersistedDeps(
      { ...sourceState, status: 'pending', ...staleAnalysisState() },
      deletionSentinel,
      { generateVision: async () => overflowPackageResponse() },
    );

    await handleEntryCreated('e1', { ...pendingEntry, scanMode: 'label' }, deps);

    const errorUpdate = recorded.updates[1]!;
    expect(errorUpdate).toMatchObject({
      status: 'error',
      errorCode: 'model_schema_invalid',
      errorMessage: 'Invalid model response',
    });
    expectDeletedFields(errorUpdate, staleAnalysisKeys, deletionSentinel);
    expect(state).toEqual({
      ...sourceState,
      status: 'error',
      errorCode: 'model_schema_invalid',
      errorMessage: 'Invalid model response',
    });
    expect(deps.log).toHaveBeenCalledWith(expect.any(String), 'model_schema_invalid');
    expect(recorded.pushes).toHaveLength(0);
  });

  it.each([
    {
      name: 'model configuration',
      entry: pendingEntry,
      fail: (diagnostic: string): Partial<AnalyzeEntryDeps> => ({
        getModelConfig: async () => { throw new Error(diagnostic); },
      }),
    },
    {
      name: 'image loading',
      entry: pendingEntry,
      fail: (diagnostic: string): Partial<AnalyzeEntryDeps> => ({
        loadImageBase64: async () => { throw new Error(diagnostic); },
      }),
    },
    {
      name: 'vision generation',
      entry: pendingEntry,
      fail: (diagnostic: string): Partial<AnalyzeEntryDeps> => ({
        generateVision: async () => { throw new Error(diagnostic); },
      }),
    },
    {
      name: 'barcode catalog fetch',
      entry: { ...pendingEntry, scanMode: 'barcode', rawBarcode: '7350042719011' },
      fail: (diagnostic: string): Partial<AnalyzeEntryDeps> => ({
        fetchOffProduct: async () => { throw new Error(diagnostic); },
      }),
    },
  ])('sanitizes thrown $name failures into the provider error contract', async ({ name, entry, fail }) => {
    const deletionSentinel = Object.freeze({ firestore: 'delete' });
    const diagnostic = `${name} diagnostic must only be logged`;
    const sourceState = {
      uid: entry.uid,
      imageUrl: entry.imageUrl,
      storagePath: entry.storagePath,
      scanMode: entry.scanMode,
      ...(entry.rawBarcode === undefined ? {} : { rawBarcode: entry.rawBarcode }),
    };
    const { deps, recorded, state } = makePersistedDeps(
      { ...sourceState, status: 'pending', ...staleAnalysisState() },
      deletionSentinel,
      fail(diagnostic),
    );

    await handleEntryCreated('e1', entry, deps);

    const errorUpdate = recorded.updates[1]!;
    expect(errorUpdate).toMatchObject({
      status: 'error',
      errorCode: 'provider_request_failed',
      errorMessage: 'Analysis provider request failed',
    });
    expectDeletedFields(errorUpdate, staleAnalysisKeys, deletionSentinel);
    expect(JSON.stringify(errorUpdate)).not.toContain(diagnostic);
    expect(state).toEqual({
      ...sourceState,
      status: 'error',
      errorCode: 'provider_request_failed',
      errorMessage: 'Analysis provider request failed',
    });
    expect(deps.log).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ message: diagnostic }));
    expect(recorded.pushes).toHaveLength(0);
  });

  it('sends normalizer-reviewed meal, confirmed catalog complete, review, and no error pushes', async () => {
    const mealReview = makeDeps({ generateVision: async () => modelResponse(0.99) });
    await handleEntryCreated('e1', pendingEntry, mealReview.deps);
    expect(mealReview.recorded.pushes).toHaveLength(1);
    expect(mealReview.recorded.pushes[0]!.data).toEqual({ entryId: 'e1' });

    const complete = makeDeps({ fetchOffProduct: async () => knownProduct });
    await handleEntryCreated(
      'e1',
      { ...pendingEntry, scanMode: 'barcode', rawBarcode: knownProduct.barcode },
      complete.deps,
    );
    expect(complete.recorded.updates[1]).toMatchObject({
      status: 'complete',
      foodName: 'Nutella',
      baseKcal: 2156,
      nutritionBasis: 'package',
      nutritionAmount: 400,
      nutritionUnit: 'g',
      consumedAmount: 400,
      reviewReasons: [],
    });
    expect(complete.recorded.pushes).toEqual([{
      token: 'token-1',
      notification: {
        title: 'AppName finished your meal scan',
        body: 'Nutella · 2156 kcal',
      },
      data: { entryId: 'e1' },
      android: { priority: 'high' },
    }]);

    const review = makeDeps({ generateVision: async () => modelResponse(0.62, null, 'package') });
    await handleEntryCreated('e1', { ...pendingEntry, scanMode: 'label' }, review.deps);
    expect(review.recorded.pushes).toHaveLength(1);
    expect(review.recorded.pushes[0]!.data).toEqual({ entryId: 'e1' });

    const error = makeDeps({ generateVision: async () => 'not json' });
    await handleEntryCreated('e1', pendingEntry, error.deps);
    expect(error.recorded.pushes).toHaveLength(0);
  });
});
