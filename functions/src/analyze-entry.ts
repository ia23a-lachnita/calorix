import type { ModelConfig } from './model-config';
import {
  atwaterKcal,
  normalizeVisionNutrition,
  parseNutritionResponse,
  type AnalysisResult,
  type AnalysisSource,
} from './nutrition';
import { orderedReviewReasons, type NutritionDraft, type ReviewReason } from './nutrition-contract';
import { normalizeOffPackage } from './package-nutrition';
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
  generateVision(
    model: string,
    prompt: string,
    imageBase64: string,
    source?: AnalysisSource,
  ): Promise<string>;
  fetchOffProduct(barcode: string): Promise<OffProduct | null>;
  sendPush(message: ScanPushMessage): Promise<void>;
  getModelConfig(): Promise<ModelConfig>;
  appDisplayName: string;
  mealPrompt: string;
  labelPrompt: string;
  barcodePrompt: string;
  log: (message: string, error?: unknown) => void;
  /** Optional Firestore FieldValue.delete() sentinel for stale analysis fields. */
  analysisFieldDeletion?: unknown;
}

const ANALYSIS_OWNED_FIELDS = [
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
  'errorCode',
  'errorMessage',
  // Legacy fields owned by historical analysis records.
  'servingMultiplier',
  'kcal',
  'protein',
  'carbs',
  'fat',
] as const;

function replaceAnalysisFields(
  current: Record<string, unknown>,
  analysisFieldDeletion: unknown | undefined,
): Record<string, unknown> {
  const replacement: Record<string, unknown> = { ...current };
  for (const field of ANALYSIS_OWNED_FIELDS) {
    if (!(field in replacement) && analysisFieldDeletion !== undefined) {
      replacement[field] = analysisFieldDeletion;
    }
  }
  return replacement;
}

function analysisSource(value: string | undefined): AnalysisSource {
  return value === 'barcode' || value === 'label' ? value : 'meal';
}

function promptFor(source: AnalysisSource, deps: AnalyzeEntryDeps): string {
  if (source === 'barcode') return deps.barcodePrompt;
  if (source === 'label') return deps.labelPrompt;
  return deps.mealPrompt;
}

function offAnalysis(product: OffProduct): AnalysisResult {
  return {
    name: product.name,
    kcal: product.kcalPer100g,
    proteinG: product.proteinPer100g,
    carbsG: product.carbsPer100g,
    fatG: product.fatPer100g,
    confidence: 1,
    atwaterKcal: atwaterKcal(product.proteinPer100g, product.carbsPer100g, product.fatPer100g),
    candidates: [],
    source: 'barcode',
    nutritionBasis: 'per100g',
    nutritionAmount: 100,
    nutritionUnit: product.per100Reference?.unit ?? product.productQuantity?.unit ?? 'g',
    detectedItems: [],
    boundingBox: null,
  };
}

function barcodeReason(
  rawBarcode: string | undefined,
  modelBarcode: string | undefined,
  confirmedBarcode: string | undefined,
): ReviewReason[] {
  const observed = [rawBarcode, modelBarcode].filter((value): value is string => value !== undefined);
  return observed.length > 0 && (confirmedBarcode === undefined || observed.some((value) => value !== confirmedBarcode))
    ? ['barcode_unconfirmed']
    : [];
}

function withOffProvenance(
  draft: NutritionDraft,
  rawBarcode: string | undefined,
  modelBarcode: string | undefined,
): NutritionDraft {
  const confirmedBarcode = draft.confirmedBarcode;
  return {
    ...draft,
    ...(rawBarcode === undefined ? {} : { rawBarcode }),
    ...(modelBarcode === undefined ? {} : { modelBarcode }),
    reviewReasons: orderedReviewReasons([
      ...draft.reviewReasons,
      ...barcodeReason(rawBarcode, modelBarcode, confirmedBarcode),
    ]),
  };
}

export function analysisEntryFields(
  analysis: AnalysisResult,
  draft: NutritionDraft,
  status: 'complete' | 'needs_review',
  model: string,
  analysisFieldDeletion?: unknown,
): Record<string, unknown> {
  return replaceAnalysisFields({
    status,
    foodName: analysis.name,
    baseKcal: draft.baseKcal,
    baseProtein: draft.baseProtein,
    baseCarbs: draft.baseCarbs,
    baseFat: draft.baseFat,
    confidence: analysis.confidence,
    atwaterKcal: analysis.atwaterKcal,
    candidates: analysis.candidates,
    scanMode: analysis.source,
    nutritionBasis: draft.nutritionBasis,
    nutritionAmount: draft.nutritionAmount,
    nutritionUnit: draft.nutritionUnit,
    ...(draft.consumedAmount === undefined ? {} : { consumedAmount: draft.consumedAmount }),
    ...(draft.packageUnitCount === undefined ? {} : { packageUnitCount: draft.packageUnitCount }),
    ...(draft.unitAmount === undefined ? {} : { unitAmount: draft.unitAmount }),
    ...(draft.per100Reference === undefined ? {} : { per100Reference: draft.per100Reference }),
    ...(draft.servingReference === undefined ? {} : { servingReference: draft.servingReference }),
    reviewReasons: draft.reviewReasons,
    ...(draft.rawBarcode === undefined ? {} : { rawBarcode: draft.rawBarcode }),
    ...(draft.modelBarcode === undefined ? {} : { modelBarcode: draft.modelBarcode }),
    ...(draft.confirmedBarcode === undefined ? {} : { confirmedBarcode: draft.confirmedBarcode }),
    detectedItems: analysis.detectedItems,
    boundingBox: analysis.boundingBox,
    analysisModel: model,
  }, analysisFieldDeletion);
}

function analysisErrorFields(
  errorCode: 'model_schema_invalid' | 'off_product_not_found' | 'provider_request_failed',
  errorMessage: 'Invalid model response' | 'Product not found' | 'Analysis provider request failed',
  analysisFieldDeletion?: unknown,
): Record<string, unknown> {
  return replaceAnalysisFields({
    status: 'error',
    errorCode,
    errorMessage,
  }, analysisFieldDeletion);
}

/** Analyze one pending entry and persist the canonical client wire contract. */
export async function handleEntryCreated(
  entryId: string,
  data: EntryData,
  deps: AnalyzeEntryDeps,
): Promise<void> {
  if (data.status !== 'pending') return;

  await deps.updateEntry({ status: 'processing' });

  let persistenceFailed = false;
  const persist = async (fields: Record<string, unknown>): Promise<void> => {
    try {
      await deps.updateEntry(fields);
    } catch (error) {
      persistenceFailed = true;
      throw error;
    }
  };

  try {
    const source = analysisSource(data.scanMode);
    const config = await deps.getModelConfig();
    const attemptedBarcodes = new Set<string>();
    let analysis: AnalysisResult | null = null;
    let draft: NutritionDraft | null = null;
    let analysisModel = config.visionModel;

    const lookupOff = async (
      barcode: string | undefined,
      modelBarcode?: string,
    ): Promise<'found' | 'not_found' | 'invalid'> => {
      if (!barcode || attemptedBarcodes.has(barcode)) return 'not_found';
      attemptedBarcodes.add(barcode);
      const product = await deps.fetchOffProduct(barcode);
      if (!product) return 'not_found';
      try {
        draft = withOffProvenance(normalizeOffPackage(product), data.rawBarcode, modelBarcode);
      } catch (error) {
        deps.log('processEntry invalid OFF product:', error);
        await persist(analysisErrorFields(
          'model_schema_invalid',
          'Invalid model response',
          deps.analysisFieldDeletion,
        ));
        return 'invalid';
      }
      const visionAnalysis = analysis;
      analysis = modelBarcode === undefined || visionAnalysis === null
        ? offAnalysis(product)
        : {
          ...visionAnalysis,
          name: product.name,
          atwaterKcal: atwaterKcal(draft.baseProtein, draft.baseCarbs, draft.baseFat),
      };
      analysisModel = 'open-food-facts-v3';
      return 'found';
    };

    if (source === 'barcode') {
      const rawBarcodeLookup = await lookupOff(data.rawBarcode);
      if (rawBarcodeLookup === 'invalid') return;
      if (data.rawBarcode && rawBarcodeLookup === 'not_found') {
        await persist(analysisErrorFields(
          'off_product_not_found',
          'Product not found',
          deps.analysisFieldDeletion,
        ));
        return;
      }
    }

    if (!analysis || !draft) {
      const imageBase64 = await deps.loadImageBase64(data);
      const responseText = await deps.generateVision(
        config.visionModel,
        promptFor(source, deps),
        imageBase64,
        source,
      );
      const parsed = parseNutritionResponse(responseText, source);
      if (!parsed.ok) {
        deps.log('processEntry invalid model response:', parsed.reason);
        await persist(analysisErrorFields(
          'model_schema_invalid',
          'Invalid model response',
          deps.analysisFieldDeletion,
        ));
        return;
      }
      analysis = parsed.result;

      const offLookup = source === 'barcode'
        ? await lookupOff(analysis.modelBarcode, analysis.modelBarcode)
        : 'not_found';
      if (offLookup === 'invalid') return;
      if (offLookup === 'found') {
        // The catalog draft replaces vision nutrients, retaining vision provenance.
      } else {
        const normalized = normalizeVisionNutrition(analysis, data.rawBarcode, undefined);
        if (normalized.kind === 'error') {
          deps.log('processEntry invalid model response:', normalized.failureCode);
          await persist(analysisErrorFields(
            'model_schema_invalid',
            'Invalid model response',
            deps.analysisFieldDeletion,
          ));
          return;
        }
        draft = normalized.draft;
      }
    }

    if (!analysis || !draft) throw new Error('Nutrition analysis was not normalized');
    const status = analysis.confidence >= config.confidenceThreshold && draft.reviewReasons.length === 0
      ? 'complete'
      : 'needs_review';
    await persist(analysisEntryFields(
      analysis,
      draft,
      status,
      analysisModel,
      deps.analysisFieldDeletion,
    ));

    try {
      const token = await deps.getFcmToken(data.uid);
      if (token) {
        const push = status === 'complete'
          ? buildScanCompletePush({
            appDisplayName: deps.appDisplayName,
            foodName: analysis.name,
            kcal: draft.baseKcal,
            entryId,
            token,
          })
          : buildScanReviewPush({ appDisplayName: deps.appDisplayName, foodName: analysis.name, entryId, token });
        await deps.sendPush(push);
      }
    } catch (error) {
      deps.log('processEntry notification error:', error);
    }
  } catch (error) {
    if (persistenceFailed) throw error;
    deps.log('processEntry error:', error);
    await deps.updateEntry(analysisErrorFields(
      'provider_request_failed',
      'Analysis provider request failed',
      deps.analysisFieldDeletion,
    ));
  }
}
