import { DatasetError, sha256Hex } from './assets';
import { NutritionPredictionSchema } from './schema';
import { scoreNutritionCase } from './scorer';

import type {
  NutritionCaseResult,
  NutritionEvalCase,
  NutritionPrediction,
} from './schema';

export interface NutritionEvalCacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export interface NutritionEvalDependencies {
  loadImage(evalCase: NutritionEvalCase): Promise<Uint8Array>;
  analyzeCase(
    evalCase: NutritionEvalCase,
    bytes: Uint8Array,
    options: { sampleIndex: number },
  ): Promise<unknown>;
  nowMs(): number;
  cacheStore?: NutritionEvalCacheStore;
}

export interface RunNutritionEvalOptions {
  datasetId: string;
  adapterModelId: string;
  promptHash: string;
  codeSha: string;
  samples?: number;
}

interface FailureDetails {
  category: 'dataset' | 'schema' | 'provider' | 'runner';
  code: string;
}

export function buildCacheKey(
  datasetId: string,
  imageSha: string,
  adapterModelId: string,
  promptHash: string,
  codeSha: string,
  oneBasedSampleIndex: number,
): string {
  const identity = JSON.stringify([
    datasetId,
    imageSha,
    adapterModelId,
    promptHash,
    codeSha,
    oneBasedSampleIndex,
  ]);
  return sha256Hex(Buffer.from(identity, 'utf8'));
}

function validateOptions(options: RunNutritionEvalOptions): number {
  for (const field of ['datasetId', 'adapterModelId', 'promptHash', 'codeSha'] as const) {
    if (options[field].trim().length === 0) {
      throw new Error(`${field} must be nonblank`);
    }
  }

  const samples = options.samples ?? 1;
  if (!Number.isInteger(samples) || samples < 1 || samples > 10) {
    throw new Error('samples must be an integer from 1 to 10');
  }
  return samples;
}

function failurePrediction(
  evalCase: NutritionEvalCase,
  failure: FailureDetails,
): NutritionPrediction {
  return {
    parseStatus: 'failure',
    source: evalCase.scanMode,
    decision: 'error',
    failureCategory: failure.category,
    failureCode: failure.code,
  };
}

function loadFailureFrom(error: unknown): FailureDetails {
  if (error instanceof DatasetError) {
    return { category: 'dataset', code: error.code };
  }
  return { category: 'dataset', code: 'dataset_load_failed' };
}

function corePrediction(prediction: NutritionPrediction): NutritionPrediction {
  const core = { ...prediction };
  delete core.latencyMs;
  delete core.sampleIndex;
  delete core.cached;
  return core;
}

function withRuntimeMetadata(
  prediction: NutritionPrediction,
  latencyMs: number,
  sampleIndex: number,
  cached: boolean,
): NutritionPrediction {
  return {
    ...corePrediction(prediction),
    latencyMs,
    sampleIndex,
    cached,
  };
}

export async function runNutritionEval(
  cases: readonly NutritionEvalCase[],
  deps: NutritionEvalDependencies,
  options: RunNutritionEvalOptions,
): Promise<NutritionCaseResult[]> {
  const samples = validateOptions(options);
  const results: NutritionCaseResult[] = [];

  for (const evalCase of cases) {
    let imageBytes: Uint8Array | undefined;
    let attemptedLoad = false;
    let rememberedLoadFailure: FailureDetails | undefined;

    for (let sampleIndex = 1; sampleIndex <= samples; sampleIndex++) {
      const startedAt = deps.nowMs();
      let prediction: NutritionPrediction | undefined;
      let cached = false;
      const cacheKey = buildCacheKey(
        options.datasetId,
        evalCase.image.sha256,
        options.adapterModelId,
        options.promptHash,
        options.codeSha,
        sampleIndex,
      );

      if (deps.cacheStore) {
        let cachedValue: string | null = null;
        try {
          cachedValue = await deps.cacheStore.get(cacheKey);
        } catch {
          prediction = failurePrediction(evalCase, {
            category: 'runner',
            code: 'cache_read_failed',
          });
        }

        if (!prediction && cachedValue !== null) {
          try {
            const parsed = NutritionPredictionSchema.safeParse(JSON.parse(cachedValue));
            if (!parsed.success) {
              prediction = failurePrediction(evalCase, {
                category: 'runner',
                code: 'cache_invalid',
              });
            } else {
              prediction = corePrediction(parsed.data);
              cached = true;
            }
          } catch {
            prediction = failurePrediction(evalCase, {
              category: 'runner',
              code: 'cache_invalid',
            });
          }
        }
      }

      let shouldWriteCache = false;
      if (!prediction) {
        if (!attemptedLoad) {
          attemptedLoad = true;
          try {
            imageBytes = await deps.loadImage(evalCase);
          } catch (error) {
            rememberedLoadFailure = loadFailureFrom(error);
          }
        }

        if (rememberedLoadFailure) {
          prediction = failurePrediction(evalCase, rememberedLoadFailure);
        } else if (imageBytes) {
          try {
            const rawPrediction = await deps.analyzeCase(evalCase, imageBytes, { sampleIndex });
            const parsed = NutritionPredictionSchema.safeParse(rawPrediction);
            prediction = parsed.success
              ? corePrediction(parsed.data)
              : failurePrediction(evalCase, {
                  category: 'schema',
                  code: 'prediction_schema_invalid',
                });
            shouldWriteCache = parsed.success;
          } catch {
            prediction = failurePrediction(evalCase, {
              category: 'provider',
              code: 'provider_request_failed',
            });
          }
        } else {
          prediction = failurePrediction(evalCase, {
            category: 'dataset',
            code: 'dataset_load_failed',
          });
        }
      }

      if (shouldWriteCache && deps.cacheStore) {
        try {
          await deps.cacheStore.set(cacheKey, JSON.stringify(corePrediction(prediction)));
        } catch {
          prediction = failurePrediction(evalCase, {
            category: 'runner',
            code: 'cache_write_failed',
          });
          cached = false;
        }
      }

      const latencyMs = Math.max(0, deps.nowMs() - startedAt);
      results.push(
        scoreNutritionCase(
          evalCase,
          withRuntimeMetadata(prediction, latencyMs, sampleIndex, cached),
        ),
      );
    }
  }

  return results;
}
