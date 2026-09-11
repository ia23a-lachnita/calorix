import { describe, expect, it, vi } from 'vitest';
import type {
  NutritionEvalCase,
  NutritionPrediction,
} from '../../src/nutrition-eval/schema';
import { DatasetError } from '../../src/nutrition-eval/assets';
import { sha256Hex } from '../../src/nutrition-eval/assets';
import { scoreNutritionCase } from '../../src/nutrition-eval/scorer';
import { runNutritionEval, buildCacheKey } from '../../src/nutrition-eval/runner';
import { parseNutritionResponse } from '../../src/nutrition';
import {
  mealCase,
  labelCase,
  barcodeCase,
  okMealPrediction,
  okLabelPrediction,
  okBarcodePrediction,
  schemaFailPrediction,
  SHA,
  MEAL_RESPONSE_TEXT,
  LABEL_RESPONSE_TEXT,
  BARCODE_RESPONSE_TEXT,
} from './fixtures/model-responses';

// ── Dependency injection helpers ─────────────────────────────────────────────

type Deps = Parameters<typeof runNutritionEval>[1];
type CacheStore = NonNullable<Deps['cacheStore']>;

function makeDeps(overrides: Partial<Deps> = {}): Deps {
  return {
    loadImage: vi.fn(async () => new Uint8Array([0x89])),
    analyzeCase: vi.fn(async () => okMealPrediction),
    nowMs: vi.fn(() => 1000),
    cacheStore: {
      get: vi.fn(async () => null),
      set: vi.fn(async () => {}),
    },
    ...overrides,
  };
}

function makeCacheStore(overrides: { get?: CacheStore['get']; set?: CacheStore['set'] } = {}): CacheStore {
  return {
    get: overrides.get ?? vi.fn(async () => null),
    set: overrides.set ?? vi.fn(async () => {}),
  };
}

type StrictParsedNutrition = {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  confidence: number;
  nutritionBasis: 'portion' | 'package' | 'per100g';
  nutritionAmount: number;
  nutritionUnit: 'portion' | 'g' | 'ml';
  modelBarcode?: string;
};

function strictParsedNutrition(value: unknown): StrictParsedNutrition {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('strict parsed nutrition must be an object');
  }
  const record = value as Record<string, unknown>;
  const finite = (candidate: unknown): candidate is number =>
    typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0;
  if (
    !finite(record.kcal) ||
    !finite(record.proteinG) ||
    !finite(record.carbsG) ||
    !finite(record.fatG) ||
    !finite(record.confidence) ||
    (record.nutritionBasis !== 'portion' &&
      record.nutritionBasis !== 'package' &&
      record.nutritionBasis !== 'per100g') ||
    typeof record.nutritionAmount !== 'number' ||
    !Number.isFinite(record.nutritionAmount) ||
    record.nutritionAmount <= 0 ||
    (record.nutritionUnit !== 'portion' && record.nutritionUnit !== 'g' && record.nutritionUnit !== 'ml') ||
    (record.modelBarcode !== undefined && typeof record.modelBarcode !== 'string')
  ) {
    throw new Error('strict parsed nutrition fields are missing');
  }
  return {
    kcal: record.kcal,
    proteinG: record.proteinG,
    carbsG: record.carbsG,
    fatG: record.fatG,
    confidence: record.confidence,
    nutritionBasis: record.nutritionBasis,
    nutritionAmount: record.nutritionAmount,
    nutritionUnit: record.nutritionUnit,
    ...(typeof record.modelBarcode === 'string' ? { modelBarcode: record.modelBarcode } : {}),
  };
}

// ── Test-owned analyzeCase adapter ───────────────────────────────────────────
// Feeds strict public fixture TEXT through parseNutritionResponse into runner
// predictions. It deliberately has no provider, Firebase, image, or private
// fixture dependency.

function testAnalyzeAdapter(
  mealText: string,
  labelText: string,
  barcodeText: string,
) {
  return vi.fn(async (c: NutritionEvalCase, _img: Uint8Array) => {
    const text = c.scanMode === 'meal'
      ? mealText
      : c.scanMode === 'label'
        ? labelText
        : barcodeText;
    const outcome = parseNutritionResponse(text, c.scanMode);
    if (!outcome.ok) throw new Error(`parse failed: ${outcome.reason}`);
    const r = strictParsedNutrition(outcome.result);
    return {
      parseStatus: 'success' as const,
      source: c.scanMode,
      kcal: r.kcal,
      proteinG: r.proteinG,
      carbsG: r.carbsG,
      fatG: r.fatG,
      confidence: r.confidence,
      basis: r.nutritionBasis,
      amount: r.nutritionAmount,
      unit: r.nutritionUnit,
      ...(r.modelBarcode ? { barcode: r.modelBarcode } : {}),
      decision: 'complete' as const,
    } satisfies NutritionPrediction;
  });
}

// ── buildCacheKey ────────────────────────────────────────────────────────────

describe('buildCacheKey', () => {
  it('matches manual sha256 computation', () => {
    const key = buildCacheKey('d', SHA, 'm', 'p', 'c', 1);
    const expected = sha256Hex(
      Buffer.from(JSON.stringify(['d', SHA, 'm', 'p', 'c', 1]), 'utf8'),
    );
    expect(key).toBe(expected);
    expect(key).toHaveLength(64);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('different sampleIndex produces different key', () => {
    const k1 = buildCacheKey('d', SHA, 'm', 'p', 'c', 1);
    const k2 = buildCacheKey('d', SHA, 'm', 'p', 'c', 2);
    expect(k1).not.toBe(k2);
  });

  it('different datasetId produces different key', () => {
    const k1 = buildCacheKey('a', SHA, 'm', 'p', 'c', 1);
    const k2 = buildCacheKey('b', SHA, 'm', 'p', 'c', 1);
    expect(k1).not.toBe(k2);
  });

  it('includes every remaining identity field', () => {
    const base = buildCacheKey('d', SHA, 'm', 'p', 'c', 1);
    expect(buildCacheKey('d', 'a'.repeat(64), 'm', 'p', 'c', 1)).not.toBe(base);
    expect(buildCacheKey('d', SHA, 'other-model', 'p', 'c', 1)).not.toBe(base);
    expect(buildCacheKey('d', SHA, 'm', 'other-prompt', 'c', 1)).not.toBe(base);
    expect(buildCacheKey('d', SHA, 'm', 'p', 'other-code', 1)).not.toBe(base);
  });
});

// ── Identity & samples ──────────────────────────────────────────────────────

describe('runner identity & samples', () => {
  it('required nonempty datasetId', async () => {
    await expect(
      runNutritionEval([mealCase], makeDeps(), {
        datasetId: '',
        adapterModelId: 'm',
        promptHash: 'p',
        codeSha: 'c',
        samples: 1,
      }),
    ).rejects.toThrow(/datasetId/);
  });

  it('required nonempty adapterModelId', async () => {
    await expect(
      runNutritionEval([mealCase], makeDeps(), {
        datasetId: 'd',
        adapterModelId: '',
        promptHash: 'p',
        codeSha: 'c',
        samples: 1,
      }),
    ).rejects.toThrow(/adapterModelId/);
  });

  it('required nonempty promptHash', async () => {
    await expect(
      runNutritionEval([mealCase], makeDeps(), {
        datasetId: 'd',
        adapterModelId: 'm',
        promptHash: '',
        codeSha: 'c',
        samples: 1,
      }),
    ).rejects.toThrow(/promptHash/);
  });

  it('required nonempty codeSha', async () => {
    await expect(
      runNutritionEval([mealCase], makeDeps(), {
        datasetId: 'd',
        adapterModelId: 'm',
        promptHash: 'p',
        codeSha: '',
        samples: 1,
      }),
    ).rejects.toThrow(/codeSha/);
  });

  it('rejects whitespace-only identity fields', async () => {
    const valid = {
      datasetId: 'd',
      adapterModelId: 'm',
      promptHash: 'p',
      codeSha: 'c',
    };
    for (const field of ['datasetId', 'adapterModelId', 'promptHash', 'codeSha'] as const) {
      await expect(
        runNutritionEval([mealCase], makeDeps(), { ...valid, [field]: '  ' }),
      ).rejects.toThrow(new RegExp(field));
    }
  });

  it('samples must be integer 1..10', async () => {
    const opts = {
      datasetId: 'd',
      adapterModelId: 'm',
      promptHash: 'p',
      codeSha: 'c',
    };
    await expect(
      runNutritionEval([mealCase], makeDeps(), { ...opts, samples: 0 }),
    ).rejects.toThrow(/samples/);
    await expect(
      runNutritionEval([mealCase], makeDeps(), { ...opts, samples: 11 }),
    ).rejects.toThrow(/samples/);
    await expect(
      runNutritionEval([mealCase], makeDeps(), { ...opts, samples: 1.5 }),
    ).rejects.toThrow(/samples/);
    await expect(
      runNutritionEval([mealCase], makeDeps(), { ...opts, samples: Number.NaN }),
    ).rejects.toThrow(/samples/);
    await expect(
      runNutritionEval([mealCase], makeDeps(), { ...opts, samples: Number.POSITIVE_INFINITY }),
    ).rejects.toThrow(/samples/);
  });

  it('defaults samples to 1 and accepts 10', async () => {
    const opts = {
      datasetId: 'd',
      adapterModelId: 'm',
      promptHash: 'p',
      codeSha: 'c',
    };
    await expect(runNutritionEval([mealCase], makeDeps(), opts)).resolves.toHaveLength(1);
    await expect(
      runNutritionEval([mealCase], makeDeps(), { ...opts, samples: 10 }),
    ).resolves.toHaveLength(10);
  });
});

// ── Ordering & sampleIndex metadata ─────────────────────────────────────────

describe('runner ordering', () => {
  it('case-major / sample-minor with 3 cases, 2 samples', async () => {
    const trace: Array<{ caseId: string; sampleIndex: number }> = [];
    const deps = makeDeps({
      analyzeCase: vi.fn(async (c: NutritionEvalCase, _b: Uint8Array, s: { sampleIndex: number }) => {
        trace.push({ caseId: c.id, sampleIndex: s.sampleIndex });
        return s.sampleIndex === 1 ? okMealPrediction : okLabelPrediction;
      }),
    });
    const opts = {
      datasetId: 'd',
      adapterModelId: 'm',
      promptHash: 'p',
      codeSha: 'c',
      samples: 2 as const,
    };
    const results = await runNutritionEval([mealCase, labelCase, barcodeCase], deps, opts);

    expect(results).toHaveLength(6);
    expect(results.map((r) => r.caseId)).toEqual([
      'meal-dish-1565035746',
      'meal-dish-1565035746',
      'label-3017624010701',
      'label-3017624010701',
      'barcode-5449000000996',
      'barcode-5449000000996',
    ]);
    expect(results.map((r) => r.prediction.source)).toEqual([
      'meal',
      'label',
      'meal',
      'label',
      'meal',
      'label',
    ]);
    expect(trace).toEqual([
      { caseId: 'meal-dish-1565035746', sampleIndex: 1 },
      { caseId: 'meal-dish-1565035746', sampleIndex: 2 },
      { caseId: 'label-3017624010701', sampleIndex: 1 },
      { caseId: 'label-3017624010701', sampleIndex: 2 },
      { caseId: 'barcode-5449000000996', sampleIndex: 1 },
      { caseId: 'barcode-5449000000996', sampleIndex: 2 },
    ]);
  });

  it('sampleIndex metadata in results', async () => {
    const deps = makeDeps({
      analyzeCase: vi.fn(async (_c: NutritionEvalCase, _b: Uint8Array, s: { sampleIndex: number }) => {
        if (s.sampleIndex === 1) return okMealPrediction;
        return okLabelPrediction;
      }),
    });
    const results = await runNutritionEval(
      [mealCase, labelCase],
      deps,
      { datasetId: 'd', adapterModelId: 'm', promptHash: 'p', codeSha: 'c', samples: 2 },
    );

    expect(results).toHaveLength(4);
    expect(results[0]!.prediction).toHaveProperty('sampleIndex', 1);
    expect(results[1]!.prediction).toHaveProperty('sampleIndex', 2);
    expect(results[2]!.prediction).toHaveProperty('sampleIndex', 1);
    expect(results[3]!.prediction).toHaveProperty('sampleIndex', 2);
  });

  it('load called once per case across samples', async () => {
    const loadFn = vi.fn(async () => new Uint8Array([0x89]));
    const deps = makeDeps({ loadImage: loadFn });

    await runNutritionEval(
      [mealCase, labelCase],
      deps,
      { datasetId: 'd', adapterModelId: 'm', promptHash: 'p', codeSha: 'c', samples: 3 },
    );

    expect(loadFn).toHaveBeenCalledTimes(2);
    expect(deps.analyzeCase).toHaveBeenCalledTimes(6);
  });
});

// ── Continuation & error sanitation ──────────────────────────────────────────

describe('runner continuation & error sanitation', () => {
  it('schema-invalid analyzer output continues with typed failure', async () => {
    let callCount = 0;
    const analyzeFn = vi.fn(async () => {
      callCount++;
      if (callCount === 1) return { invalid: true };
      return okLabelPrediction;
    });
    const deps = makeDeps({ analyzeCase: analyzeFn });
    const results = await runNutritionEval(
      [mealCase, labelCase],
      deps,
      { datasetId: 'd', adapterModelId: 'm', promptHash: 'p', codeSha: 'c', samples: 1 },
    );

    expect(results).toHaveLength(2);
    expect(results[0]?.prediction.parseStatus).toBe('failure');
    expect(results[0]?.prediction.failureCategory).toBe('schema');
    expect(results[0]?.prediction.failureCode).toBe('prediction_schema_invalid');
    expect(results[1]?.prediction.parseStatus).toBe('success');
  });

  it('thrown provider error continues with typed failure', async () => {
    let callCount = 0;
    const analyzeFn = vi.fn(async () => {
      callCount++;
      if (callCount === 1) throw new Error('raw provider secret body ABCXYZ');
      return okLabelPrediction;
    });
    const deps = makeDeps({ analyzeCase: analyzeFn });
    const results = await runNutritionEval(
      [mealCase, labelCase],
      deps,
      { datasetId: 'd', adapterModelId: 'm', promptHash: 'p', codeSha: 'c', samples: 1 },
    );

    expect(results).toHaveLength(2);
    expect(results[0]?.prediction.parseStatus).toBe('failure');
    expect(results[0]?.prediction.failureCategory).toBe('provider');
    expect(results[0]?.prediction.failureCode).toBe('provider_request_failed');
    expect(results[1]?.prediction.parseStatus).toBe('success');
  });

  it('raw error text is sanitized from output', async () => {
    const deps = makeDeps({
      analyzeCase: vi.fn(async () => {
        throw new Error('secret-provider-body');
      }),
    });
    const results = await runNutritionEval(
      [mealCase],
      deps,
      { datasetId: 'd', adapterModelId: 'm', promptHash: 'p', codeSha: 'c', samples: 1 },
    );

    expect(JSON.stringify(results)).not.toContain('secret-provider-body');
  });
});

// ── Injected latency ─────────────────────────────────────────────────────────

describe('runner latency', () => {
  it('records stable latencyMs from nowMs', async () => {
    let t = 1000;
    const deps = makeDeps({
      nowMs: vi.fn(() => {
        const v = t;
        t += 50;
        return v;
      }),
    });
    const results = await runNutritionEval(
      [mealCase],
      deps,
      { datasetId: 'd', adapterModelId: 'm', promptHash: 'p', codeSha: 'c', samples: 1 },
    );

    expect(results[0]?.prediction).toMatchObject({ latencyMs: 50 });
  });
});

// ── Cache key identity ──────────────────────────────────────────────────────

describe('runner cache key identity', () => {
  it('same inputs produce identical cache keys', async () => {
    const keys: string[] = [];
    const deps = makeDeps({
      cacheStore: makeCacheStore({
        set: vi.fn(async (key: string, _value: string) => {
          keys.push(key);
        }),
      }),
    });
    await runNutritionEval(
      [mealCase],
      deps,
      { datasetId: 'd', adapterModelId: 'm', promptHash: 'p', codeSha: 'c', samples: 1 },
    );
    await runNutritionEval(
      [mealCase],
      deps,
      { datasetId: 'd', adapterModelId: 'm', promptHash: 'p', codeSha: 'c', samples: 1 },
    );

    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).toHaveLength(64);
    expect(keys[0]).toMatch(/^[0-9a-f]{64}$/);
  });

  it('different dataset produces different key', async () => {
    const keys: string[] = [];
    const deps = makeDeps({
      cacheStore: makeCacheStore({
        set: vi.fn(async (key: string, _value: string) => {
          keys.push(key);
        }),
      }),
    });
    await runNutritionEval(
      [mealCase],
      deps,
      { datasetId: 'a', adapterModelId: 'm', promptHash: 'p', codeSha: 'c', samples: 1 },
    );
    await runNutritionEval(
      [mealCase],
      deps,
      { datasetId: 'b', adapterModelId: 'm', promptHash: 'p', codeSha: 'c', samples: 1 },
    );

    expect(keys[0]).not.toBe(keys[1]);
  });

  it('different sample index produces different key', async () => {
    const keys: string[] = [];
    const deps = makeDeps({
      cacheStore: makeCacheStore({
        set: vi.fn(async (key: string, _value: string) => {
          keys.push(key);
        }),
      }),
    });
    await runNutritionEval(
      [mealCase],
      deps,
      { datasetId: 'd', adapterModelId: 'm', promptHash: 'p', codeSha: 'c', samples: 1 },
    );
    await runNutritionEval(
      [mealCase],
      deps,
      { datasetId: 'd', adapterModelId: 'm', promptHash: 'p', codeSha: 'c', samples: 2 },
    );

    // With samples: 2, two keys are written per case
    expect(keys.length).toBe(3);
    expect(keys[0]).not.toBe(keys[2]);
  });
});

// ── Cache behavior ───────────────────────────────────────────────────────────

describe('runner cache behavior', () => {
  it('cache hit bypasses load and analyze, asserts cached=true, sampleIndex, latency', async () => {
    const cachedPrediction: NutritionPrediction = {
      parseStatus: 'success',
      source: 'meal',
      kcal: 42,
      proteinG: 2,
      carbsG: 9,
      fatG: 0.4,
      decision: 'complete',
    };
    let now = 2000;
    const loadFn = vi.fn(async () => new Uint8Array([0x89]));
    const analyzeFn = vi.fn(async () => okMealPrediction);
    const deps = makeDeps({
      loadImage: loadFn,
      analyzeCase: analyzeFn,
      nowMs: vi.fn(() => {
        const current = now;
        now += 17;
        return current;
      }),
      cacheStore: makeCacheStore({
        get: vi.fn(async () => JSON.stringify(cachedPrediction)),
      }),
    });

    const results = await runNutritionEval(
      [mealCase],
      deps,
      { datasetId: 'd', adapterModelId: 'm', promptHash: 'p', codeSha: 'c', samples: 1 },
    );

    expect(results[0]?.prediction.kcal).toBe(42);
    expect(results[0]?.prediction).toHaveProperty('cached', true);
    expect(results[0]?.prediction).toHaveProperty('sampleIndex', 1);
    expect(results[0]?.prediction).toHaveProperty('latencyMs', 17);
    expect(loadFn).not.toHaveBeenCalled();
    expect(analyzeFn).not.toHaveBeenCalled();
  });

  it('miss stores sanitized prediction with no latencyMs/sampleIndex/cached', async () => {
    const stored: string[] = [];
    let now = 3000;
    const deps = makeDeps({
      nowMs: vi.fn(() => {
        const current = now;
        now += 25;
        return current;
      }),
      cacheStore: makeCacheStore({
        set: vi.fn(async (_key: string, value: string) => {
          stored.push(value);
        }),
      }),
    });

    const results = await runNutritionEval(
      [mealCase],
      deps,
      { datasetId: 'd', adapterModelId: 'm', promptHash: 'p', codeSha: 'c', samples: 1 },
    );

    expect(results[0]?.prediction).toMatchObject({
      cached: false,
      sampleIndex: 1,
      latencyMs: 25,
    });
    expect(stored).toHaveLength(1);
    const parsed: unknown = JSON.parse(stored[0]!);
    expect(parsed).toMatchObject({ parseStatus: 'success' });
    expect(parsed).not.toHaveProperty('latencyMs');
    expect(parsed).not.toHaveProperty('sampleIndex');
    expect(parsed).not.toHaveProperty('cached');
  });

  it('malformed cache produces runner/cache_invalid and skips load/analyze', async () => {
    const loadFn = vi.fn(async () => new Uint8Array([0x89]));
    const analyzeFn = vi.fn(async () => okMealPrediction);
    const deps = makeDeps({
      loadImage: loadFn,
      analyzeCase: analyzeFn,
      cacheStore: makeCacheStore({
        get: vi.fn(async () => 'not valid json {{{'),
      }),
    });

    const results = await runNutritionEval(
      [mealCase],
      deps,
      { datasetId: 'd', adapterModelId: 'm', promptHash: 'p', codeSha: 'c', samples: 1 },
    );

    expect(results[0]?.prediction.parseStatus).toBe('failure');
    expect(results[0]?.prediction.failureCategory).toBe('runner');
    expect(results[0]?.prediction.failureCode).toBe('cache_invalid');
    expect(loadFn).not.toHaveBeenCalled();
    expect(analyzeFn).not.toHaveBeenCalled();
  });

  it('cache read throw produces runner/cache_read_failed and skips load/analyze', async () => {
    const loadFn = vi.fn(async () => new Uint8Array([0x89]));
    const analyzeFn = vi.fn(async () => okMealPrediction);
    const deps = makeDeps({
      loadImage: loadFn,
      analyzeCase: analyzeFn,
      cacheStore: makeCacheStore({
        get: vi.fn(async () => {
          throw new Error('EACCES permission denied');
        }),
      }),
    });

    const results = await runNutritionEval(
      [mealCase],
      deps,
      { datasetId: 'd', adapterModelId: 'm', promptHash: 'p', codeSha: 'c', samples: 1 },
    );

    expect(results[0]?.prediction.parseStatus).toBe('failure');
    expect(results[0]?.prediction.failureCategory).toBe('runner');
    expect(results[0]?.prediction.failureCode).toBe('cache_read_failed');
    expect(JSON.stringify(results)).not.toContain('EACCES');
    expect(loadFn).not.toHaveBeenCalled();
    expect(analyzeFn).not.toHaveBeenCalled();
  });

  it('cache write throw produces runner/cache_write_failed', async () => {
    const deps = makeDeps({
      cacheStore: makeCacheStore({
        set: vi.fn(async () => {
          throw new Error('disk full');
        }),
      }),
    });

    const results = await runNutritionEval(
      [mealCase],
      deps,
      { datasetId: 'd', adapterModelId: 'm', promptHash: 'p', codeSha: 'c', samples: 1 },
    );

    expect(results[0]?.prediction.parseStatus).toBe('failure');
    expect(results[0]?.prediction.failureCategory).toBe('runner');
    expect(results[0]?.prediction.failureCode).toBe('cache_write_failed');
  });

  it('runs successfully without an optional cacheStore', async () => {
    const analyzeFn = vi.fn(async () => okMealPrediction);
    const results = await runNutritionEval(
      [mealCase],
      makeDeps({ analyzeCase: analyzeFn, cacheStore: undefined }),
      { datasetId: 'd', adapterModelId: 'm', promptHash: 'p', codeSha: 'c', samples: 1 },
    );

    expect(results[0]?.prediction).toMatchObject({
      parseStatus: 'success',
      cached: false,
      sampleIndex: 1,
    });
    expect(analyzeFn).toHaveBeenCalledTimes(1);
  });
});

// ── DatasetError & load failure ─────────────────────────────────────────────

describe('runner load failure', () => {
  it('DatasetError preserves code as dataset failure', async () => {
    let loadCallCount = 0;
    const deps = makeDeps({
      loadImage: vi.fn(async () => {
        loadCallCount++;
        if (loadCallCount === 1) {
          throw new DatasetError('dataset_checksum_mismatch', 'SHA-256 mismatch');
        }
        return new Uint8Array([0x89]);
      }),
    });

    const results = await runNutritionEval(
      [mealCase, labelCase],
      deps,
      { datasetId: 'd', adapterModelId: 'm', promptHash: 'p', codeSha: 'c', samples: 1 },
    );

    expect(results[0]?.prediction.parseStatus).toBe('failure');
    expect(results[0]?.prediction.failureCategory).toBe('dataset');
    expect(results[0]?.prediction.failureCode).toBe('dataset_checksum_mismatch');
    expect(results[1]?.prediction.parseStatus).toBe('success');
  });

  it('generic load error produces dataset/dataset_load_failed', async () => {
    const deps = makeDeps({
      loadImage: vi.fn(async () => {
        throw new Error('unknown load error');
      }),
    });

    const results = await runNutritionEval(
      [mealCase],
      deps,
      { datasetId: 'd', adapterModelId: 'm', promptHash: 'p', codeSha: 'c', samples: 1 },
    );

    expect(results[0]?.prediction.parseStatus).toBe('failure');
    expect(results[0]?.prediction.failureCategory).toBe('dataset');
    expect(results[0]?.prediction.failureCode).toBe('dataset_load_failed');
  });

  it('samples>1: load failure remembered, load once, every sample fails; next case succeeds', async () => {
    let loadCallCount = 0;
    const loadFn = vi.fn(async () => {
      loadCallCount++;
      if (loadCallCount === 1) {
        throw new DatasetError('dataset_checksum_mismatch', 'hash mismatch');
      }
      return new Uint8Array([0x89]);
    });
    const analyzeFn = vi.fn(async () => okLabelPrediction);
    const deps = makeDeps({ loadImage: loadFn, analyzeCase: analyzeFn });

    const results = await runNutritionEval(
      [mealCase, labelCase],
      deps,
      { datasetId: 'd', adapterModelId: 'm', promptHash: 'p', codeSha: 'c', samples: 3 },
    );

    // mealCase: 3 samples, all fail, load called once
    expect(results[0]?.prediction.failureCode).toBe('dataset_checksum_mismatch');
    expect(results[1]?.prediction.failureCode).toBe('dataset_checksum_mismatch');
    expect(results[2]?.prediction.failureCode).toBe('dataset_checksum_mismatch');
    // labelCase: 3 samples, all succeed
    expect(results[3]?.prediction.parseStatus).toBe('success');
    expect(results[4]?.prediction.parseStatus).toBe('success');
    expect(results[5]?.prediction.parseStatus).toBe('success');
    // load called once per case (2 total)
    expect(loadFn).toHaveBeenCalledTimes(2);
    // analyze called only for successful samples (3 for labelCase)
    expect(analyzeFn).toHaveBeenCalledTimes(3);
  });
});

// ── Lazy image load ──────────────────────────────────────────────────────────

describe('runner lazy image load', () => {
  it('loads image once per case, reused across samples', async () => {
    const loadFn = vi.fn(async () => new Uint8Array([0x89]));
    const deps = makeDeps({ loadImage: loadFn });

    await runNutritionEval(
      [mealCase, labelCase],
      deps,
      { datasetId: 'd', adapterModelId: 'm', promptHash: 'p', codeSha: 'c', samples: 3 },
    );

    expect(loadFn).toHaveBeenCalledTimes(2);
    expect(deps.analyzeCase).toHaveBeenCalledTimes(6);
  });

  it('does not reload on cache hit', async () => {
    const loadFn = vi.fn(async () => new Uint8Array([0x89]));
    const cachedPrediction: NutritionPrediction = {
      parseStatus: 'success',
      source: 'meal',
      kcal: 42,
      decision: 'complete',
    };
    const deps = makeDeps({
      loadImage: loadFn,
      analyzeCase: vi.fn(async () => okMealPrediction),
      cacheStore: makeCacheStore({
        get: vi.fn(async () => JSON.stringify(cachedPrediction)),
      }),
    });

    await runNutritionEval(
      [mealCase],
      deps,
      { datasetId: 'd', adapterModelId: 'm', promptHash: 'p', codeSha: 'c', samples: 2 },
    );

    expect(loadFn).not.toHaveBeenCalled();
    expect(deps.analyzeCase).not.toHaveBeenCalled();
  });
});

// ── Output through scorer ────────────────────────────────────────────────────

describe('runner output through scorer', () => {
  it('success result passes through scoreNutritionCase', async () => {
    const deps = makeDeps();
    const results = await runNutritionEval(
      [mealCase],
      deps,
      { datasetId: 'd', adapterModelId: 'm', promptHash: 'p', codeSha: 'c', samples: 1 },
    );

    expect(results[0]?.caseId).toBe('meal-dish-1565035746');
    expect(results[0]?.numeric.kcal).toBeDefined();
    expect(results[0]?.numeric.kcal!.ratioToTruth).toBeCloseTo(1, 8);
    expect(results[0]?.safety.catastrophicCalorieMiss).toBe(false);
  });

  it('failure result passes through scorer without numeric metrics', async () => {
    const deps = makeDeps({
      analyzeCase: vi.fn(async () => schemaFailPrediction),
    });
    const results = await runNutritionEval(
      [mealCase],
      deps,
      { datasetId: 'd', adapterModelId: 'm', promptHash: 'p', codeSha: 'c', samples: 1 },
    );

    expect(results[0]?.prediction.parseStatus).toBe('failure');
    expect(results[0]?.numeric.kcal).toBeUndefined();
  });

  it('results are compatible with aggregateNutritionResults', async () => {
    const deps = makeDeps();
    const results = await runNutritionEval(
      [mealCase],
      deps,
      { datasetId: 'd', adapterModelId: 'm', promptHash: 'p', codeSha: 'c', samples: 1 },
    );

    const agg = (await import('../../src/nutrition-eval/scorer')).aggregateNutritionResults(results);
    expect(agg.totalCases).toBe(1);
    expect(agg.parseCases).toBe(1);
    expect(agg.medianAbsoluteCalorieError).toBeCloseTo(0, 8);
  });
});

// ── Static fixtures: strict basis/amount/unit and package totals ─────────────

describe('runner static fixtures', () => {
  it('meal fixture declares a complete portion tuple', () => {
    expect(okMealPrediction).toMatchObject({ basis: 'portion', amount: 1, unit: 'portion' });
  });

  it('label fixture declares a complete package tuple', () => {
    expect(okLabelPrediction).toMatchObject({ basis: 'package', amount: 330, unit: 'ml' });
  });

  it('barcode fixture retains the declared whole-package nutrition', () => {
    expect(okBarcodePrediction).toMatchObject({
      basis: 'package',
      amount: 330,
      unit: 'ml',
      kcal: 138.6,
      carbsG: 34.98,
    });
  });

  it('meal case scored through scorer with fixture prediction', () => {
    const r = scoreNutritionCase(mealCase, okMealPrediction);
    expect(r.prediction.parseStatus).toBe('success');
    expect(r.numeric.kcal).toBeDefined();
  });

  it('barcode case scored from package totals matches package truth', () => {
    const r = scoreNutritionCase(barcodeCase, okBarcodePrediction);
    expect(r.prediction.parseStatus).toBe('success');
    expect(r.numeric.kcal!.absoluteError).toBeCloseTo(0, 8);
  });
});

// ── Test-owned adapter integration ──────────────────────────────────────────

describe('test-owned analyzeCase adapter', () => {
  it('meal adapter parses raw TEXT through parseNutritionResponse', async () => {
    const adapter = testAnalyzeAdapter(MEAL_RESPONSE_TEXT, LABEL_RESPONSE_TEXT, BARCODE_RESPONSE_TEXT);
    const deps = makeDeps({ analyzeCase: adapter });

    const results = await runNutritionEval(
      [mealCase],
      deps,
      { datasetId: 'd', adapterModelId: 'm', promptHash: 'p', codeSha: 'c', samples: 1 },
    );

    expect(results[0]?.prediction.parseStatus).toBe('success');
    expect(results[0]?.prediction.source).toBe('meal');
    expect(results[0]?.prediction.kcal).toBeCloseTo(43.099998);
    expect(results[0]?.prediction).toMatchObject({ basis: 'portion', amount: 1, unit: 'portion' });
  });

  it('barcode adapter parses a strict public package response deterministically', async () => {
    const adapter = testAnalyzeAdapter(MEAL_RESPONSE_TEXT, LABEL_RESPONSE_TEXT, BARCODE_RESPONSE_TEXT);
    const deps = makeDeps({ analyzeCase: adapter });

    const results = await runNutritionEval(
      [barcodeCase],
      deps,
      { datasetId: 'd', adapterModelId: 'm', promptHash: 'p', codeSha: 'c', samples: 1 },
    );

    expect(results[0]?.prediction.parseStatus).toBe('success');
    expect(results[0]?.prediction.source).toBe('barcode');
    expect(results[0]?.prediction.kcal).toBe(138.6);
    expect(results[0]?.prediction.barcode).toBe('5449000000996');
    expect(results[0]?.prediction).toMatchObject({ basis: 'package', amount: 330, unit: 'ml' });
  });
});

describe('Slice F diagnostic cache compatibility', () => {
  // Production bug caught: the runner currently rejects/stores no diagnostic
  // payload, so a real miss cannot preserve evidence for the subsequent hit.
  it('roundtrips diagnostics from a real miss while stamping runtime metadata per run', async () => {
    const stored = new Map<string, string>();
    const diagnosticPrediction = {
      ...okMealPrediction,
      diagnostics: {
        rawNutrients: { kcal: 43.1, proteinG: 2.4, carbsG: 9, fatG: 0.4 },
        detectedItemCount: 2,
        estimatedTotalMassG: 350,
        declaredBasis: 'portion', declaredAmount: 1, declaredUnit: 'portion',
      },
    };
    const analyzeCase = vi.fn(async () => diagnosticPrediction);
    const cacheStore = makeCacheStore({
      get: vi.fn(async (key: string) => stored.get(key) ?? null),
      set: vi.fn(async (key: string, value: string) => { stored.set(key, value); }),
    });
    let now = 1000;
    const deps = makeDeps({
      analyzeCase,
      cacheStore,
      nowMs: vi.fn(() => {
        const value = now;
        now += 25;
        return value;
      }),
    });
    const options = { datasetId: 'd', adapterModelId: 'm', promptHash: 'p', codeSha: 'c', samples: 1 };

    const miss = await runNutritionEval([mealCase], deps, options);
    expect(miss[0]?.prediction.diagnostics).toEqual(diagnosticPrediction.diagnostics);
    expect(miss[0]?.prediction).toMatchObject({ latencyMs: 25, sampleIndex: 1, cached: false });
    expect(JSON.parse([...stored.values()][0]!)).toEqual({
      parseStatus: 'success', source: 'meal',
      kcal: okMealPrediction.kcal, proteinG: okMealPrediction.proteinG,
      carbsG: okMealPrediction.carbsG, fatG: okMealPrediction.fatG,
      confidence: okMealPrediction.confidence, basis: okMealPrediction.basis,
      amount: okMealPrediction.amount, unit: okMealPrediction.unit,
      decision: okMealPrediction.decision, diagnostics: diagnosticPrediction.diagnostics,
    });

    const hit = await runNutritionEval([mealCase], deps, options);
    expect(hit[0]?.prediction.diagnostics).toEqual(diagnosticPrediction.diagnostics);
    expect(hit[0]?.prediction).toMatchObject({ latencyMs: 25, sampleIndex: 1, cached: true });
    expect(analyzeCase).toHaveBeenCalledOnce();
  });

  // Production bug caught: tightening prediction diagnostics must not invalidate
  // old cache payloads that never contained the optional field.
  it('accepts an old cached prediction without diagnostics', async () => {
    const oldPrediction = {
      parseStatus: 'success', source: 'meal', kcal: 43.1,
      proteinG: 2.4, carbsG: 9, fatG: 0.4, decision: 'complete',
    } satisfies NutritionPrediction;
    const deps = makeDeps({
      analyzeCase: vi.fn(async () => { throw new Error('must not analyze cache hit'); }),
      cacheStore: makeCacheStore({ get: vi.fn(async () => JSON.stringify(oldPrediction)) }),
    });

    const results = await runNutritionEval(
      [mealCase], deps,
      { datasetId: 'd', adapterModelId: 'm', promptHash: 'p', codeSha: 'c', samples: 1 },
    );

    expect(results[0]?.prediction).toMatchObject({ ...oldPrediction, cached: true, sampleIndex: 1 });
    expect(results[0]?.prediction).not.toHaveProperty('diagnostics');
  });
});
