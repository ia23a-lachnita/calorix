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
import type { OffProduct } from '../../src/off-client';
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
  OFF_BARCODE_PRODUCT,
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

// ── Test-owned analyzeCase adapter ───────────────────────────────────────────
// Feeds raw fixture TEXT through parseNutritionResponse or OFF mapping into
// runner predictions, deliberately retaining missing basis/amount/unit and
// per-100 barcode values.

function testAnalyzeAdapter(
  mealText: string,
  labelText: string,
  offProduct: OffProduct,
  barcode: string,
) {
  return vi.fn(async (c: NutritionEvalCase, _img: Uint8Array) => {
    if (c.scanMode === 'meal') {
      const outcome = parseNutritionResponse(mealText, 'meal');
      if (!outcome.ok) throw new Error(`parse failed: ${outcome.reason}`);
      const r = outcome.result;
      return {
        parseStatus: 'success' as const,
        source: 'meal' as const,
        kcal: r.kcal,
        proteinG: r.proteinG,
        carbsG: r.carbsG,
        fatG: r.fatG,
        confidence: r.confidence,
        decision: 'complete' as const,
      } satisfies NutritionPrediction;
    }
    if (c.scanMode === 'barcode') {
      return {
        parseStatus: 'success' as const,
        source: 'barcode' as const,
        kcal: offProduct.kcalPer100g,
        proteinG: offProduct.proteinPer100g,
        carbsG: offProduct.carbsPer100g,
        fatG: offProduct.fatPer100g,
        confidence: 0.95,
        barcode,
        decision: 'complete' as const,
      } satisfies NutritionPrediction;
    }
    const outcome = parseNutritionResponse(labelText, 'label');
    if (!outcome.ok) throw new Error(`parse failed: ${outcome.reason}`);
    const r = outcome.result;
    return {
      parseStatus: 'success' as const,
      source: 'label' as const,
      kcal: r.kcal,
      proteinG: r.proteinG,
      carbsG: r.carbsG,
      fatG: r.fatG,
      confidence: r.confidence,
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

// ── Static fixtures: missing basis/amount/unit & per-100 ────────────────────

describe('runner static fixtures', () => {
  it('meal fixture retains missing basis/amount/unit', () => {
    expect(okMealPrediction.basis).toBeUndefined();
    expect(okMealPrediction.amount).toBeUndefined();
    expect(okMealPrediction.unit).toBeUndefined();
  });

  it('label fixture retains missing basis/amount/unit', () => {
    expect(okLabelPrediction.basis).toBeUndefined();
    expect(okLabelPrediction.amount).toBeUndefined();
    expect(okLabelPrediction.unit).toBeUndefined();
  });

  it('barcode fixture retains per-100g values and missing basis/amount/unit', () => {
    expect(okBarcodePrediction.basis).toBeUndefined();
    expect(okBarcodePrediction.amount).toBeUndefined();
    expect(okBarcodePrediction.unit).toBeUndefined();
    expect(okBarcodePrediction.kcal).toBe(42);
    expect(okBarcodePrediction.carbsG).toBe(10.6);
  });

  it('meal case scored through scorer with fixture prediction', () => {
    const r = scoreNutritionCase(mealCase, okMealPrediction);
    expect(r.prediction.parseStatus).toBe('success');
    expect(r.numeric.kcal).toBeDefined();
  });

  it('barcode case scored: per-100 values produce expected error vs package truth', () => {
    const r = scoreNutritionCase(barcodeCase, okBarcodePrediction);
    expect(r.prediction.parseStatus).toBe('success');
    expect(r.numeric.kcal!.absoluteError).toBeCloseTo(Math.abs(42 - 138.6), 8);
  });
});

// ── Test-owned adapter integration ──────────────────────────────────────────

describe('test-owned analyzeCase adapter', () => {
  it('meal adapter parses raw TEXT through parseNutritionResponse', async () => {
    const adapter = testAnalyzeAdapter(MEAL_RESPONSE_TEXT, LABEL_RESPONSE_TEXT, OFF_BARCODE_PRODUCT, '5449000000996');
    const deps = makeDeps({ analyzeCase: adapter });

    const results = await runNutritionEval(
      [mealCase],
      deps,
      { datasetId: 'd', adapterModelId: 'm', promptHash: 'p', codeSha: 'c', samples: 1 },
    );

    expect(results[0]?.prediction.parseStatus).toBe('success');
    expect(results[0]?.prediction.source).toBe('meal');
    expect(results[0]?.prediction.kcal).toBeCloseTo(43.099998);
    expect(results[0]?.prediction.basis).toBeUndefined();
    expect(results[0]?.prediction.amount).toBeUndefined();
    expect(results[0]?.prediction.unit).toBeUndefined();
  });

  it('barcode adapter maps OffProduct into prediction with per-100 values', async () => {
    const adapter = testAnalyzeAdapter(MEAL_RESPONSE_TEXT, LABEL_RESPONSE_TEXT, OFF_BARCODE_PRODUCT, '5449000000996');
    const deps = makeDeps({ analyzeCase: adapter });

    const results = await runNutritionEval(
      [barcodeCase],
      deps,
      { datasetId: 'd', adapterModelId: 'm', promptHash: 'p', codeSha: 'c', samples: 1 },
    );

    expect(results[0]?.prediction.parseStatus).toBe('success');
    expect(results[0]?.prediction.source).toBe('barcode');
    expect(results[0]?.prediction.kcal).toBe(42);
    expect(results[0]?.prediction.barcode).toBe('5449000000996');
    expect(results[0]?.prediction.basis).toBeUndefined();
  });
});
