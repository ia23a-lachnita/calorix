import type { ModelConfig } from './model-config';
import {
  atwaterKcal,
  parseNutritionResponse,
  type AnalysisResult,
  type AnalysisSource,
} from './nutrition';
import type { OffProduct } from './off-client';
import { buildScanCompletePush, buildScanReviewPush, type ScanPushMessage } from './push';

export interface EntryData {
  uid: string;
  status: string;
  imageUrl?: string;
  storagePath?: string;
  scanMode?: string;
  rawBarcode?: string;
}

export interface AnalyzeEntryDeps {
  updateEntry(fields: Record<string, unknown>): Promise<void>;
  getFcmToken(uid: string): Promise<string | undefined>;
  loadImageBase64(entry: EntryData): Promise<string>;
  generateVision(model: string, prompt: string, imageBase64: string): Promise<string>;
  fetchOffProduct(barcode: string): Promise<OffProduct | null>;
  sendPush(message: ScanPushMessage): Promise<void>;
  getModelConfig(): Promise<ModelConfig>;
  appDisplayName: string;
  mealPrompt: string;
  labelPrompt: string;
  barcodePrompt: string;
  log: (message: string, error?: unknown) => void;
}

function analysisSource(value: string | undefined): AnalysisSource {
  return value === 'barcode' || value === 'label' ? value : 'meal';
}

function promptFor(source: AnalysisSource, deps: AnalyzeEntryDeps): string {
  if (source === 'barcode') return deps.barcodePrompt;
  if (source === 'label') return deps.labelPrompt;
  return deps.mealPrompt;
}

function offAnalysis(product: OffProduct, barcode: string): AnalysisResult {
  return {
    name: product.name,
    kcal: product.kcalPer100g,
    proteinG: product.proteinPer100g,
    carbsG: product.carbsPer100g,
    fatG: product.fatPer100g,
    confidence: 1,
    atwaterKcal: atwaterKcal(
      product.proteinPer100g,
      product.carbsPer100g,
      product.fatPer100g,
    ),
    candidates: [],
    source: 'barcode',
    barcode,
    detectedItems: [],
    boundingBox: null,
  };
}

export function analysisEntryFields(
  analysis: AnalysisResult,
  status: 'complete' | 'needs_review',
  model: string,
): Record<string, unknown> {
  return {
    status,
    foodName: analysis.name,
    baseKcal: analysis.kcal,
    baseProtein: analysis.proteinG,
    baseCarbs: analysis.carbsG,
    baseFat: analysis.fatG,
    confidence: analysis.confidence,
    atwaterKcal: analysis.atwaterKcal,
    candidates: analysis.candidates,
    scanMode: analysis.source,
    ...(analysis.barcode ? { barcode: analysis.barcode } : {}),
    detectedItems: analysis.detectedItems,
    boundingBox: analysis.boundingBox,
    analysisModel: model,
  };
}

/** Analyze one pending entry and persist the canonical client wire contract. */
export async function handleEntryCreated(
  entryId: string,
  data: EntryData,
  deps: AnalyzeEntryDeps,
): Promise<void> {
  if (data.status !== 'pending') return;

  await deps.updateEntry({ status: 'processing' });

  try {
    const source = analysisSource(data.scanMode);
    const config = await deps.getModelConfig();
    const attemptedBarcodes = new Set<string>();
    let analysis: AnalysisResult | null = null;
    let analysisModel = config.visionModel;

    const lookupOff = async (barcode: string | undefined): Promise<AnalysisResult | null> => {
      if (!barcode || attemptedBarcodes.has(barcode)) return null;
      attemptedBarcodes.add(barcode);
      const product = await deps.fetchOffProduct(barcode);
      return product ? offAnalysis(product, barcode) : null;
    };

    if (source === 'barcode') {
      analysis = await lookupOff(data.rawBarcode);
      if (analysis) analysisModel = 'open-food-facts-v3';
    }

    if (!analysis) {
      const imageBase64 = await deps.loadImageBase64(data);
      const responseText = await deps.generateVision(
        config.visionModel,
        promptFor(source, deps),
        imageBase64,
      );
      const parsed = parseNutritionResponse(responseText, source);
      if (!parsed.ok) {
        throw new Error(`Invalid model response (${parsed.reason})`);
      }
      analysis = parsed.result;

      if (source === 'barcode') {
        const confirmed = await lookupOff(analysis.barcode);
        if (confirmed) {
          analysis = confirmed;
          analysisModel = 'open-food-facts-v3';
        } else {
          analysis = {
            ...analysis,
            confidence: Math.min(
              analysis.confidence,
              Math.max(0, config.confidenceThreshold - 0.01),
            ),
          };
        }
      }
    }

    const status =
      analysis.confidence >= config.confidenceThreshold ? 'complete' : 'needs_review';
    await deps.updateEntry(analysisEntryFields(analysis, status, analysisModel));

    const token = await deps.getFcmToken(data.uid);
    if (token) {
      const push =
        status === 'complete'
          ? buildScanCompletePush({
              appDisplayName: deps.appDisplayName,
              foodName: analysis.name,
              kcal: analysis.kcal,
              entryId,
              token,
            })
          : buildScanReviewPush({
              appDisplayName: deps.appDisplayName,
              foodName: analysis.name,
              entryId,
              token,
            });
      await deps.sendPush(push);
    }
  } catch (error) {
    deps.log('processEntry error:', error);
    const message = error instanceof Error ? error.message : String(error);
    await deps.updateEntry({ status: 'error', errorMessage: message });
  }
}
