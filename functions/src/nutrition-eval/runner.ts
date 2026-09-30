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
    bytes: Uint8Array | undefined,
    options: { sampleIndex: number },
  ): Promise<unknown>;
  nowMs(): number;
  cacheStore?: NutritionEvalCacheStore;
}

export type NutritionGenerationProfile = 'LOW' | 'MEDIUM';

export interface NutritionEvalCacheIdentity {
  project: string;
  location: string;
  model: string;
  generationProfile: NutritionGenerationProfile;
  responseSchemaHash: string;
  promptHash: string;
  datasetHash: string;
  functionsTreeId: string;
  imageSha: string;
  sampleIndex: number;
}

export interface RunNutritionEvalCalibrationOptions {
  mode?: 'strict';
  skipImageForSuppliedBarcode?: boolean;
}

export interface RunNutritionEvalOptions {
  datasetId: string;
  adapterModelId: string;
  promptHash: string;
  codeSha: string;
  samples?: number;
  project?: string;
  location?: string;
  model?: string;
  generationProfile?: NutritionGenerationProfile;
  responseSchemaHash?: string;
  datasetHash?: string;
  functionsTreeId?: string;
  calibration?: RunNutritionEvalCalibrationOptions;
}

type CacheIdentityBase = Omit<NutritionEvalCacheIdentity, 'imageSha' | 'sampleIndex'>;

interface FailureDetails {
  category: 'dataset' | 'schema' | 'provider' | 'runner';
  code: string;
}

function requiredIdentityString(value: string | undefined, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} must be a nonblank string`);
  }
  return value;
}

function requiredGenerationProfile(
  value: NutritionGenerationProfile | undefined,
): NutritionGenerationProfile {
  if (value !== 'LOW' && value !== 'MEDIUM') {
    throw new Error('generationProfile must be LOW or MEDIUM');
  }
  return value;
}

export function buildCacheKey(identity: NutritionEvalCacheIdentity): string {
  const sampleIndex = identity.sampleIndex;
  if (typeof sampleIndex !== 'number' || !Number.isInteger(sampleIndex) || sampleIndex < 1) {
    throw new Error('sampleIndex must be a positive integer');
  }
  const canonical = JSON.stringify({
    datasetHash: requiredIdentityString(identity.datasetHash, 'datasetHash'),
    functionsTreeId: requiredIdentityString(identity.functionsTreeId, 'functionsTreeId'),
    generationProfile: requiredGenerationProfile(identity.generationProfile),
    imageSha: requiredIdentityString(identity.imageSha, 'imageSha'),
    location: requiredIdentityString(identity.location, 'location'),
    model: requiredIdentityString(identity.model, 'model'),
    project: requiredIdentityString(identity.project, 'project'),
    promptHash: requiredIdentityString(identity.promptHash, 'promptHash'),
    responseSchemaHash: requiredIdentityString(identity.responseSchemaHash, 'responseSchemaHash'),
    sampleIndex,
  });
  return sha256Hex(Buffer.from(canonical, 'utf8'));
}

function requireCacheIdentity(options: RunNutritionEvalOptions): CacheIdentityBase {
  const identity: CacheIdentityBase = {
    project: requiredIdentityString(options.project, 'project'),
    location: requiredIdentityString(options.location, 'location'),
    model: requiredIdentityString(options.model, 'model'),
    generationProfile: requiredGenerationProfile(options.generationProfile),
    responseSchemaHash: requiredIdentityString(
      options.responseSchemaHash,
      'responseSchemaHash',
    ),
    promptHash: requiredIdentityString(options.promptHash, 'promptHash'),
    datasetHash: requiredIdentityString(options.datasetHash, 'datasetHash'),
    functionsTreeId: requiredIdentityString(options.functionsTreeId, 'functionsTreeId'),
  };
  if (identity.model !== options.adapterModelId) {
    throw new Error('model must match adapterModelId');
  }
  return identity;
}

function validateCalibration(calibration: RunNutritionEvalCalibrationOptions): void {
  if (calibration.mode !== undefined && calibration.mode !== 'strict') {
    throw new Error('calibration mode must be strict');
  }
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

  const calibration = options.calibration;
  if (calibration !== undefined) validateCalibration(calibration);
  const cacheStore = calibration === undefined ? deps.cacheStore : undefined;
  const cacheIdentity = cacheStore === undefined ? undefined : requireCacheIdentity(options);

  const results: NutritionCaseResult[] = [];

  for (const evalCase of cases) {
    let imageBytes: Uint8Array | undefined;
    let attemptedLoad = false;
    let rememberedLoadFailure: FailureDetails | undefined;
    const skipImage =
      calibration?.skipImageForSuppliedBarcode === true
      && evalCase.scanMode === 'barcode'
      && evalCase.suppliedBarcode !== undefined;

    for (let sampleIndex = 1; sampleIndex <= samples; sampleIndex++) {
      const startedAt = deps.nowMs();
      let prediction: NutritionPrediction | undefined;
      let cached = false;

      const cacheKey = cacheIdentity === undefined
        ? undefined
        : buildCacheKey({
          ...cacheIdentity,
          imageSha: evalCase.image.sha256,
          sampleIndex,
        });

      if (cacheKey !== undefined && cacheStore !== undefined) {
        let cachedValue: string | null = null;
        try {
          cachedValue = await cacheStore.get(cacheKey);
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
          if (skipImage) {
            imageBytes = undefined;
          } else {
            try {
              imageBytes = await deps.loadImage(evalCase);
            } catch (error) {
              rememberedLoadFailure = loadFailureFrom(error);
            }
          }
        }

        if (rememberedLoadFailure !== undefined) {
          prediction = failurePrediction(evalCase, rememberedLoadFailure);
        } else if (skipImage || imageBytes !== undefined) {
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

      if (shouldWriteCache && cacheKey !== undefined && cacheStore !== undefined) {
        try {
          await cacheStore.set(cacheKey, JSON.stringify(corePrediction(prediction)));
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
