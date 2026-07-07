import type { ModelConfig } from './model-config';
import { parseNutritionResponse, type NutritionResult } from './nutrition';
import { buildScanCompletePush, buildScanReviewPush, type ScanPushMessage } from './push';

export interface EntryData {
  uid: string;
  status: string;
  imageUrl?: string;
  storagePath?: string;
}

export interface AnalyzeEntryDeps {
  updateEntry(fields: Record<string, unknown>): Promise<void>;
  getFcmToken(uid: string): Promise<string | undefined>;
  loadImageBase64(entry: EntryData): Promise<string>;
  generateVision(model: string, prompt: string, imageBase64: string): Promise<string>;
  sendPush(message: ScanPushMessage): Promise<void>;
  getModelConfig(): Promise<ModelConfig>;
  appDisplayName: string;
  prompt: string;
  log: (message: string, error?: unknown) => void;
}

export function analysisEntryFields(
  nutrition: NutritionResult,
  status: 'complete' | 'needs_review',
  model: string,
): Record<string, unknown> {
  return {
    status,
    foodName: nutrition.foodName,
    kcal: nutrition.kcal,
    protein: nutrition.protein,
    carbs: nutrition.carbs,
    fat: nutrition.fat,
    confidence: nutrition.confidence,
    detectedItems: nutrition.detectedItems,
    boundingBox: nutrition.boundingBox,
    analysisModel: model,
  };
}

/**
 * Orchestrates one pending entry: mark processing, analyze the image, gate on
 * confidence, write the analysis, and notify. Daily-log aggregation is NOT
 * done here — the aggregation trigger recomputes affected days from entry
 * state, so retries of this handler can never double-count.
 */
export async function handleEntryCreated(
  entryId: string,
  data: EntryData,
  deps: AnalyzeEntryDeps,
): Promise<void> {
  if (data.status !== 'pending') return;

  await deps.updateEntry({ status: 'processing' });

  try {
    const [imageBase64, config] = await Promise.all([
      deps.loadImageBase64(data),
      deps.getModelConfig(),
    ]);
    const responseText = await deps.generateVision(config.visionModel, deps.prompt, imageBase64);
    const parsed = parseNutritionResponse(responseText);
    if (!parsed.ok) {
      throw new Error(`Invalid model response (${parsed.reason})`);
    }
    const nutrition = parsed.result;

    const status =
      nutrition.confidence >= config.confidenceThreshold ? 'complete' : 'needs_review';
    await deps.updateEntry(analysisEntryFields(nutrition, status, config.visionModel));

    const token = await deps.getFcmToken(data.uid);
    if (token) {
      const push =
        status === 'complete'
          ? buildScanCompletePush({
              appDisplayName: deps.appDisplayName,
              foodName: nutrition.foodName,
              kcal: nutrition.kcal,
              entryId,
              token,
            })
          : buildScanReviewPush({
              appDisplayName: deps.appDisplayName,
              foodName: nutrition.foodName,
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
