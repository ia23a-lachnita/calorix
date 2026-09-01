import { createGenAIAdapter, type GenAIAdapter } from '../genai-adapter';
import { parseNutritionResponse } from '../nutrition';
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
  failureCategory: 'schema' | 'provider',
  failureCode: 'model_response_invalid' | 'provider_request_failed',
): NutritionPrediction {
  return {
    parseStatus: 'failure',
    source: evalCase.scanMode,
    decision: 'error',
    failureCategory,
    failureCode,
  };
}

function fromOff(product: OffProduct, barcode: string): NutritionPrediction {
  return {
    parseStatus: 'success',
    source: 'barcode',
    kcal: product.kcalPer100g,
    proteinG: product.proteinPer100g,
    carbsG: product.carbsPer100g,
    fatG: product.fatPer100g,
    confidence: 1,
    barcode,
    decision: 'complete',
  };
}

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

  return {
    async analyzeCase(evalCase, bytes, _options) {
      try {
        const attempted = new Set<string>();
        const lookupOff = async (barcode: string): Promise<NutritionPrediction | null> => {
          if (attempted.has(barcode)) return null;
          attempted.add(barcode);
          const product = await lookup(barcode);
          return product ? fromOff(product, barcode) : null;
        };

        if (evalCase.scanMode === 'barcode' && evalCase.suppliedBarcode) {
          const product = await lookupOff(evalCase.suppliedBarcode);
          if (product) return product;
        }

        const response = await genAIAdapter.generateVision(
          model,
          promptFor(evalCase, options),
          Buffer.from(bytes).toString('base64'),
        );
        const parsed = parseNutritionResponse(response, evalCase.scanMode);
        if (!parsed.ok) return failure(evalCase, 'schema', 'model_response_invalid');

        const result = parsed.result;
        if (evalCase.scanMode === 'barcode') {
          if (result.barcode) {
            const product = await lookupOff(result.barcode);
            if (product) return product;
          }
          const confidence = Math.min(result.confidence, Math.max(0, threshold - 0.01));
          return {
            parseStatus: 'success', source: result.source, kcal: result.kcal,
            proteinG: result.proteinG, carbsG: result.carbsG, fatG: result.fatG,
            confidence, ...(result.barcode ? { barcode: result.barcode } : {}),
            decision: 'needs_review',
          };
        }

        return {
          parseStatus: 'success', source: result.source, kcal: result.kcal,
          proteinG: result.proteinG, carbsG: result.carbsG, fatG: result.fatG,
          confidence: result.confidence, ...(result.barcode ? { barcode: result.barcode } : {}),
          decision: result.confidence >= threshold ? 'complete' : 'needs_review',
        };
      } catch {
        return failure(evalCase, 'provider', 'provider_request_failed');
      }
    },
  };
}
