import { buildDailyLogDelta, utcDateKey, type DailyLogDelta } from './aggregation';
import { parseNutritionResponse, type NutritionResult } from './nutrition';
import { buildScanCompletePush, type ScanPushMessage } from './push';

export interface EntryData {
  uid: string;
  status: string;
  imageUrl: string;
  timestampMs?: number;
}

export interface CompletionWrite {
  entryFields: Record<string, unknown>;
  dailyLogId: string;
  delta: DailyLogDelta;
}

export interface AnalyzeEntryDeps {
  updateEntry(fields: Record<string, unknown>): Promise<void>;
  commitCompletion(write: CompletionWrite): Promise<void>;
  getFcmToken(uid: string): Promise<string | undefined>;
  fetchImageBase64(imageUrl: string): Promise<string>;
  generateVision(prompt: string, imageBase64: string): Promise<string>;
  sendPush(message: ScanPushMessage): Promise<void>;
  now(): Date;
  appDisplayName: string;
  prompt: string;
  log: (message: string, error?: unknown) => void;
}

export function completionEntryFields(nutrition: NutritionResult): Record<string, unknown> {
  return {
    status: 'complete',
    foodName: nutrition.foodName,
    kcal: nutrition.kcal,
    protein: nutrition.protein,
    carbs: nutrition.carbs,
    fat: nutrition.fat,
    confidence: nutrition.confidence,
    detectedItems: nutrition.detectedItems,
    boundingBox: nutrition.boundingBox,
  };
}

/**
 * Orchestrates a single pending entry: mark processing, analyze the image,
 * validate the model output, commit entry + daily-log updates atomically via
 * deps, then notify the user. All side effects go through `deps`, so this
 * function is fully unit-testable.
 */
export async function handleEntryCreated(
  entryId: string,
  data: EntryData,
  deps: AnalyzeEntryDeps,
): Promise<void> {
  if (data.status !== 'pending') return;

  await deps.updateEntry({ status: 'processing' });

  try {
    const imageBase64 = await deps.fetchImageBase64(data.imageUrl);
    const responseText = await deps.generateVision(deps.prompt, imageBase64);
    const parsed = parseNutritionResponse(responseText);
    if (!parsed.ok) {
      throw new Error(`Invalid model response (${parsed.reason})`);
    }
    const nutrition = parsed.result;

    const entryDate = data.timestampMs !== undefined ? new Date(data.timestampMs) : deps.now();
    const dailyLogId = `${data.uid}_${utcDateKey(entryDate)}`;

    await deps.commitCompletion({
      entryFields: completionEntryFields(nutrition),
      dailyLogId,
      delta: buildDailyLogDelta(nutrition),
    });

    const token = await deps.getFcmToken(data.uid);
    if (token) {
      await deps.sendPush(
        buildScanCompletePush({
          appDisplayName: deps.appDisplayName,
          foodName: nutrition.foodName,
          kcal: nutrition.kcal,
          entryId,
          token,
        }),
      );
    }
  } catch (error) {
    deps.log('processFood error:', error);
    const message = error instanceof Error ? error.message : String(error);
    await deps.updateEntry({ status: 'error', errorMessage: message });
  }
}
