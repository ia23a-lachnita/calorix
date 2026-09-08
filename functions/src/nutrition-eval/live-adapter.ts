import { createGenAIAdapter, type GenAIAdapter } from '../genai-adapter';
import { normalizeOffPackage } from '../package-nutrition';
import {
  normalizeVisionNutrition,
  parseNutritionResponse,
  type AnalysisResult,
} from '../nutrition';
import { orderedReviewReasons, type NutritionDraft } from '../nutrition-contract';
import {
  BARCODE_ANALYSIS_PROMPT,
  LABEL_ANALYSIS_PROMPT,
  MEAL_ANALYSIS_PROMPT,
} from '../prompts';
import { fetchOffProduct, type OffProduct } from '../off-client';

import type { NutritionEvalCase, NutritionPrediction } from './schema';

export interface LiveNutritionEvalAdapter {
  analyzeCase(
    evalCase: NutritionEvalCase,
    bytes: Uint8Array,
    options: { sampleIndex: number },
  ): Promise<NutritionPrediction>;
}

export interface CreateLiveNutritionEvalAdapterOptions {
  project: string;
  location: string;
  model: string;
  confidenceThreshold?: number;
  genAIAdapter?: GenAIAdapter;
  fetchOffProductFn?: (barcode: string) => Promise<OffProduct | null>;
  normalizeOffPackageFn?: typeof normalizeOffPackage;
  normalizeVisionNutritionFn?: typeof normalizeVisionNutrition;
  mealPrompt?: string;
  labelPrompt?: string;
  barcodePrompt?: string;
}

function required(value: string, name: string): string {
  if (value.trim().length === 0) throw new Error(`${name} must be nonblank`);
  return value;
}

function promptFor(evalCase: NutritionEvalCase, options: CreateLiveNutritionEvalAdapterOptions): string {
  if (evalCase.scanMode === 'label') return options.labelPrompt ?? LABEL_ANALYSIS_PROMPT;
  if (evalCase.scanMode === 'barcode') return options.barcodePrompt ?? BARCODE_ANALYSIS_PROMPT;
  return options.mealPrompt ?? MEAL_ANALYSIS_PROMPT;
}

function failure(
  evalCase: NutritionEvalCase,
  failureCategory: 'schema' | 'provider' | 'product',
  failureCode:
    | 'model_response_invalid'
    | 'nutrition_normalization_invalid'
    | 'off_product_invalid'
    | 'provider_request_failed',
): NutritionPrediction {
  return {
    parseStatus: 'failure',
    source: evalCase.scanMode,
    decision: 'error',
    failureCategory,
    failureCode,
  };
}

function visionBarcode(result: AnalysisResult): string | undefined {
  return result.modelBarcode ?? result.barcode;
}

function withOffProvenance(
  draft: NutritionDraft,
  rawBarcode: string | undefined,
  modelBarcode: string | undefined,
): NutritionDraft {
  const confirmedBarcode = draft.confirmedBarcode;
  const observed = [rawBarcode, modelBarcode].filter((value): value is string => value !== undefined);
  const barcodeReasons = observed.length > 0
    && (confirmedBarcode === undefined || observed.some((value) => value !== confirmedBarcode))
    ? ['barcode_unconfirmed'] as const
    : [];
  return {
    ...draft,
    ...(rawBarcode === undefined ? {} : { rawBarcode }),
    ...(modelBarcode === undefined ? {} : { modelBarcode }),
    reviewReasons: orderedReviewReasons([...draft.reviewReasons, ...barcodeReasons]),
  };
}

function successFromOffDraft(
  draft: NutritionDraft,
  barcode: string,
  confidence = 1,
  threshold = 0.8,
): NutritionPrediction {
  return {
    parseStatus: 'success',
    source: 'barcode',
    kcal: draft.baseKcal,
    proteinG: draft.baseProtein,
    carbsG: draft.baseCarbs,
    fatG: draft.baseFat,
    confidence,
    barcode,
    basis: draft.nutritionBasis,
    amount: draft.nutritionAmount,
    unit: draft.nutritionUnit,
    decision: draft.reviewReasons.length === 0 && confidence >= threshold
      ? 'complete'
      : 'needs_review',
    reviewReasons: [...draft.reviewReasons],
  };
}

function successFromVisionDraft(
  result: AnalysisResult,
  draft: NutritionDraft,
  threshold: number,
): NutritionPrediction {
  const barcode = visionBarcode(result);
  const decision =
    draft.reviewReasons.length === 0 && result.confidence >= threshold
      ? 'complete'
      : 'needs_review';
  return {
    parseStatus: 'success',
    source: result.source,
    kcal: draft.baseKcal,
    proteinG: draft.baseProtein,
    carbsG: draft.baseCarbs,
    fatG: draft.baseFat,
    confidence: result.confidence,
    ...(barcode === undefined ? {} : { barcode }),
    basis: draft.nutritionBasis,
    amount: draft.nutritionAmount,
    unit: draft.nutritionUnit,
    decision,
    reviewReasons: [...draft.reviewReasons],
  };
}

type OffLookupResult =
  | { kind: 'not_found' }
  | { kind: 'provider_failure' }
  | { kind: 'product_invalid' }
  | { kind: 'found'; draft: NutritionDraft };

export function createLiveNutritionEvalAdapter(
  options: CreateLiveNutritionEvalAdapterOptions,
): LiveNutritionEvalAdapter {
  const project = required(options.project, 'project');
  const location = required(options.location, 'location');
  const model = required(options.model, 'model');
  const threshold = options.confidenceThreshold ?? 0.8;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error('confidenceThreshold must be between 0 and 1');
  }
  const genAIAdapter = options.genAIAdapter ?? createGenAIAdapter({ project, location });
  const lookup = options.fetchOffProductFn ?? fetchOffProduct;
  const normalizeOff = options.normalizeOffPackageFn ?? normalizeOffPackage;
  const normalizeVision = options.normalizeVisionNutritionFn ?? normalizeVisionNutrition;

  return {
    async analyzeCase(evalCase, bytes, _options) {
      const attempted = new Set<string>();
      const lookupOff = async (barcode: string): Promise<OffLookupResult> => {
        if (attempted.has(barcode)) return { kind: 'not_found' };
        attempted.add(barcode);
        let product: OffProduct | null;
        try {
          product = await lookup(barcode);
        } catch {
          return { kind: 'provider_failure' };
        }
        if (!product) return { kind: 'not_found' };
        try {
          return { kind: 'found', draft: normalizeOff(product) };
        } catch {
          return { kind: 'product_invalid' };
        }
      };

      if (evalCase.scanMode === 'barcode' && evalCase.suppliedBarcode) {
        const off = await lookupOff(evalCase.suppliedBarcode);
        if (off.kind === 'provider_failure') return failure(evalCase, 'provider', 'provider_request_failed');
        if (off.kind === 'product_invalid') return failure(evalCase, 'product', 'off_product_invalid');
        if (off.kind === 'found') {
          return successFromOffDraft(
            withOffProvenance(off.draft, evalCase.suppliedBarcode, undefined),
            evalCase.suppliedBarcode,
            1,
            threshold,
          );
        }
      }

      let response: string;
      try {
        response = await genAIAdapter.generateVision(
          model,
          promptFor(evalCase, options),
          Buffer.from(bytes).toString('base64'),
        );
      } catch {
        return failure(evalCase, 'provider', 'provider_request_failed');
      }
      const parsed = parseNutritionResponse(response, evalCase.scanMode);
      if (!parsed.ok) return failure(evalCase, 'schema', 'model_response_invalid');

      const result = parsed.result;
      if (evalCase.scanMode === 'barcode') {
        const modelBarcode = visionBarcode(result);
        if (modelBarcode) {
          const off = await lookupOff(modelBarcode);
          if (off.kind === 'provider_failure') return failure(evalCase, 'provider', 'provider_request_failed');
          if (off.kind === 'product_invalid') return failure(evalCase, 'product', 'off_product_invalid');
          if (off.kind === 'found') {
            return successFromOffDraft(
              withOffProvenance(off.draft, evalCase.suppliedBarcode, modelBarcode),
              modelBarcode,
              result.confidence,
              threshold,
            );
          }
        }
      }

      let normalized: ReturnType<typeof normalizeVisionNutrition>;
      try {
        normalized = normalizeVision(result, evalCase.suppliedBarcode ?? undefined, undefined);
      } catch {
        return failure(evalCase, 'schema', 'nutrition_normalization_invalid');
      }
      if (normalized.kind === 'error') {
        return failure(evalCase, 'schema', 'nutrition_normalization_invalid');
      }
      return successFromVisionDraft(result, normalized.draft, threshold);
    },
  };
}
