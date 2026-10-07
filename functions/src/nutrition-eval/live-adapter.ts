import { createGenAIAdapter, type GenAIAdapter, type VisionGenerationOptions } from '../genai-adapter';
import { CalibrationFatalError } from './fatal-error';
import { normalizeOffPackage } from '../package-nutrition';
import {
  normalizeVisionNutrition,
  parseNutritionResponse,
  type AnalysisResult,
} from '../nutrition';
import {
  orderedReviewReasons,
  type NutritionDraft,
  type NutritionReference,
} from '../nutrition-contract';
import {
  BARCODE_ANALYSIS_PROMPT,
  LABEL_ANALYSIS_PROMPT,
  MEAL_ANALYSIS_PROMPT,
} from '../prompts';
import { fetchOffProduct, type OffProduct } from '../off-client';

import type {
  CalibrationProfile,
  ReservationKey,
  StageName,
} from './calibration';
import type { NutritionEvalCase, NutritionPrediction } from './schema';

export interface CalibrationReservationOptions {
  stage: StageName;
  profile: CalibrationProfile;
  onBeforeVisionRequest: (key: ReservationKey) => Promise<void>;
}

export interface LiveNutritionEvalAdapter {
  analyzeCase(
    evalCase: NutritionEvalCase,
    bytes: Uint8Array | undefined,
    options: { sampleIndex: number },
  ): Promise<NutritionPrediction>;
}

export interface CreateLiveNutritionEvalAdapterOptions {
  project: string;
  location: string;
  model: string;
  confidenceThreshold?: number;
  visionGenerationOptions?: VisionGenerationOptions;
  genAIAdapter?: GenAIAdapter;
  fetchOffProductFn?: (barcode: string) => Promise<OffProduct | null>;
  normalizeOffPackageFn?: typeof normalizeOffPackage;
  normalizeVisionNutritionFn?: typeof normalizeVisionNutrition;
  mealPrompt?: string;
  labelPrompt?: string;
  barcodePrompt?: string;
  offSnapshotMap?: Pick<ReadonlyMap<string, OffProduct>, 'get'>;
  calibrationReservation?: CalibrationReservationOptions;
}

const RESERVATION_STAGES: readonly StageName[] = [
  'preflight',
  'development',
  'validation',
  'benchmark',
];

const SAFE_CALIBRATION_MESSAGE = /^calibration:[a-z0-9-]+$/;

function reservationFatal(reason: string): CalibrationFatalError {
  return new CalibrationFatalError(`calibration:reservation-invalid-${reason}`);
}

function reservationFailedFatal(): CalibrationFatalError {
  return new CalibrationFatalError('calibration:reservation-failed');
}

/**
 * Never rethrows the hook's own error instance. A rejection that is already a
 * safe, causeless calibration fatal keeps only its validated message and is
 * rebuilt as a fresh `CalibrationFatalError`, because the original instance can
 * still carry a secret-bearing custom property or stack. Anything else — a raw
 * provider/secret-bearing error, a fatal carrying a cause, or a fatal with an
 * unrecognized message — is replaced by a static message, so no raw secret can
 * reach a log or the runner. Either way the thrown error is a new instance with
 * no `cause` and no properties beyond `name` and `message`.
 */
function sanitizedReservationFatal(error: unknown): CalibrationFatalError {
  if (
    error instanceof CalibrationFatalError
    && error.cause === undefined
    && SAFE_CALIBRATION_MESSAGE.test(error.message)
  ) {
    return new CalibrationFatalError(error.message);
  }
  return reservationFailedFatal();
}

function validateCalibrationReservation(
  reservation: unknown,
): CalibrationReservationOptions | undefined {
  if (reservation === undefined) return undefined;
  if (typeof reservation !== 'object' || reservation === null || Array.isArray(reservation)) {
    throw reservationFatal('shape');
  }
  const record = reservation as Record<string, unknown>;
  if (
    typeof record.stage !== 'string'
    || !RESERVATION_STAGES.includes(record.stage as StageName)
  ) {
    throw reservationFatal('stage');
  }
  if (record.profile !== 'LOW' && record.profile !== 'MEDIUM') {
    throw reservationFatal('profile');
  }
  if (typeof record.onBeforeVisionRequest !== 'function') {
    throw reservationFatal('callback');
  }
  return {
    stage: record.stage as StageName,
    profile: record.profile as CalibrationProfile,
    onBeforeVisionRequest: record.onBeforeVisionRequest as (key: ReservationKey) => Promise<void>,
  };
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
    | 'off_product_not_found'
    | 'provider_request_failed',
  failureDetail?: string,
): NutritionPrediction {
  return {
    parseStatus: 'failure',
    source: evalCase.scanMode,
    decision: 'error',
    failureCategory,
    failureCode,
    ...(failureDetail === undefined ? {} : { failureDetail }),
  };
}

function visionBarcode(result: AnalysisResult): string | undefined {
  return result.modelBarcode ?? result.barcode;
}

type DiagnosticReference = Omit<NutritionReference, 'unit'> & { unit: 'g' | 'ml' };

function diagnosticReference(reference: NutritionReference | undefined): DiagnosticReference | undefined {
  if (reference?.unit !== 'g' && reference?.unit !== 'ml') return undefined;
  return { ...reference, unit: reference.unit };
}

function visionDiagnostics(result: AnalysisResult): NonNullable<NutritionPrediction['diagnostics']> {
  const totalMassG = result.detectedItems.reduce((sum, item) => sum + item.weight, 0);
  return {
    rawNutrients: {
      kcal: result.kcal,
      proteinG: result.proteinG,
      carbsG: result.carbsG,
      fatG: result.fatG,
    },
    detectedItemCount: result.detectedItems.length,
    ...(result.detectedItems.length > 0 && Number.isFinite(totalMassG) && totalMassG > 0
      ? { estimatedTotalMassG: totalMassG }
      : {}),
    declaredBasis: result.nutritionBasis,
    declaredAmount: result.nutritionAmount,
    declaredUnit: result.nutritionUnit,
    ...(result.observedPackageAmount !== undefined && result.observedPackageUnit !== undefined ? {
      observedAmount: result.observedPackageAmount,
      observedUnit: result.observedPackageUnit,
    } : {}),
    ...(diagnosticReference(result.packageReference) === undefined ? {} : {
      packageReference: diagnosticReference(result.packageReference),
    }),
    ...(diagnosticReference(result.per100Reference) === undefined ? {} : {
      per100Reference: diagnosticReference(result.per100Reference),
    }),
    ...(diagnosticReference(result.servingReference) === undefined ? {} : {
      servingReference: diagnosticReference(result.servingReference),
    }),
  };
}

function offDiagnostics(draft: NutritionDraft): NonNullable<NutritionPrediction['diagnostics']> {
  return {
    declaredBasis: draft.nutritionBasis,
    declaredAmount: draft.nutritionAmount,
    declaredUnit: draft.nutritionUnit,
    ...(diagnosticReference(draft.per100Reference) === undefined ? {} : {
      per100Reference: diagnosticReference(draft.per100Reference),
    }),
    ...(diagnosticReference(draft.servingReference) === undefined ? {} : {
      servingReference: diagnosticReference(draft.servingReference),
    }),
  };
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
    diagnostics: offDiagnostics(draft),
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
    diagnostics: visionDiagnostics(result),
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
  const calibrationReservation = validateCalibrationReservation(options.calibrationReservation);
  const genAIAdapter = options.genAIAdapter ?? createGenAIAdapter({ project, location });
  const visionGenerationOptions = options.visionGenerationOptions;
  const lookup = options.fetchOffProductFn ?? fetchOffProduct;
  const normalizeOff = options.normalizeOffPackageFn ?? normalizeOffPackage;
  const normalizeVision = options.normalizeVisionNutritionFn ?? normalizeVisionNutrition;
  const offSnapshotMap = options.offSnapshotMap;

  return {
    async analyzeCase(evalCase, bytes, _options) {
      const attempted = new Set<string>();
      const lookupOff = async (barcode: string): Promise<OffLookupResult> => {
        if (attempted.has(barcode)) return { kind: 'not_found' };
        attempted.add(barcode);
        let product: OffProduct | null;
        try {
          product = await lookup(barcode);
        } catch (error) {
          if (error instanceof CalibrationFatalError) throw error;
          return { kind: 'provider_failure' };
        }
        if (!product) return { kind: 'not_found' };
        try {
          return { kind: 'found', draft: normalizeOff(product) };
        } catch (error) {
          if (error instanceof CalibrationFatalError) throw error;
          return { kind: 'product_invalid' };
        }
      };

      const isSuppliedBarcodeCase = evalCase.scanMode === 'barcode' && evalCase.suppliedBarcode;
      const hasSnapshotMap = offSnapshotMap !== undefined;
      const isMapIsolatedBarcodeCase = Boolean(isSuppliedBarcodeCase) && hasSnapshotMap;

      if (isMapIsolatedBarcodeCase) {
        const barcode = evalCase.suppliedBarcode!;
        const product = offSnapshotMap?.get(barcode);
        if (!product) {
          return failure(evalCase, 'product', 'off_product_not_found');
        }
        try {
          const draft = normalizeOff(product);
          return successFromOffDraft(
            withOffProvenance(draft, barcode, undefined),
            barcode,
            1,
            threshold,
          );
        } catch (error) {
          if (error instanceof CalibrationFatalError) throw error;
          return failure(evalCase, 'product', 'off_product_invalid');
        }
      }

      if (isSuppliedBarcodeCase && !isMapIsolatedBarcodeCase) {
        const suppliedBarcode = evalCase.suppliedBarcode!;
        const off = await lookupOff(suppliedBarcode);
        if (off.kind === 'provider_failure') return failure(evalCase, 'provider', 'provider_request_failed');
        if (off.kind === 'not_found') return failure(evalCase, 'product', 'off_product_not_found');
        if (off.kind === 'product_invalid') return failure(evalCase, 'product', 'off_product_invalid');
        if (off.kind === 'found') {
          return successFromOffDraft(
            withOffProvenance(off.draft, suppliedBarcode, undefined),
            suppliedBarcode,
            1,
            threshold,
          );
        }
      }

      if (bytes === undefined) {
        return failure(evalCase, 'schema', 'model_response_invalid', 'no_image_bytes');
      }

      if (calibrationReservation !== undefined) {
        const sampleIndex: unknown = _options?.sampleIndex;
        if (typeof sampleIndex !== 'number' || !Number.isInteger(sampleIndex) || sampleIndex < 1) {
          throw reservationFatal('sample-index');
        }
        const reservationKey: ReservationKey = {
          stage: calibrationReservation.stage,
          profile: calibrationReservation.profile,
          caseId: evalCase.id,
          sampleIndex,
        };
        try {
          await calibrationReservation.onBeforeVisionRequest(reservationKey);
        } catch (error) {
          throw sanitizedReservationFatal(error);
        }
      }

      let response: string;
      try {
        response = visionGenerationOptions === undefined
          ? await genAIAdapter.generateVision(
            model,
            promptFor(evalCase, options),
            Buffer.from(bytes).toString('base64'),
            evalCase.scanMode,
          )
          : await genAIAdapter.generateVision(
            model,
            promptFor(evalCase, options),
            Buffer.from(bytes).toString('base64'),
            evalCase.scanMode,
            visionGenerationOptions,
          );
      } catch (error) {
        if (error instanceof CalibrationFatalError) throw error;
        return failure(evalCase, 'provider', 'provider_request_failed');
      }
      const parsed = parseNutritionResponse(response, evalCase.scanMode);
      if (!parsed.ok) return failure(evalCase, 'schema', 'model_response_invalid', parsed.reason);

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
      } catch (error) {
        if (error instanceof CalibrationFatalError) throw error;
        return failure(evalCase, 'schema', 'nutrition_normalization_invalid');
      }
      if (normalized.kind === 'error') {
        return failure(evalCase, 'schema', 'nutrition_normalization_invalid');
      }
      return successFromVisionDraft(result, normalized.draft, threshold);
    },
  };
}
