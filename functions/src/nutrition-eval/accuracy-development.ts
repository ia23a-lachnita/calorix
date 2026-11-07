import { createHash } from 'crypto';

import { createGenAIAdapter, type GenAIClient } from '../genai-adapter';
import { parseNutritionResponse } from '../nutrition';
import { MEAL_ANALYSIS_PROMPT } from '../prompts';
import { CalibrationFatalError } from './fatal-error';
import { createLiveNutritionEvalAdapter } from './live-adapter';
import { buildNutritionEvalReport } from './report';
import { scoreNutritionCase } from './scorer';
import type {
  NutritionEvalCase,
  NutritionEvalReport,
  NutritionPrediction,
} from './schema';

const PROJECT = 'calorix-xurschnell';
const LOCATION = 'us';
const MODEL = 'gemini-3.8-flash';
const DATASET_ID = 'calorix-n5k-accuracy-development-v1';
const SAMPLE_INDEX = 1;
const TIMEOUT_MS = 30_000;
const REQUIRED_CASE_COUNT = 24;
const MAX_RETAINED_BYTES = 64 * 1024;

const ACCURACY_GUIDANCE_V1 = `Identify each visible food and its preparation method from observable texture, shape, and color rather than from typical recipes. Estimate each component's portion mass using realistic volume and bulk density, then reconcile the components into one consistent total portion. Estimate macronutrient density from the identified foods and preparation, and check that calories, protein, carbohydrates, and fat agree with the aggregated mass and composition. Acknowledge ordinary cooking uncertainty, but do not invent large unobserved additions of oil, butter, dressings, or other ingredients, and do not assume invisible fats are zero.`;

export const ACCURACY_MEAL_PROMPT_V1: string = `${MEAL_ANALYSIS_PROMPT}\n\n${ACCURACY_GUIDANCE_V1}`;

export interface AccuracyDevelopmentIdentity {
  runId: string;
  timestamp: string;
  codeSha: string;
  datasetHash: string;
}

export type AccuracyDevelopmentSafeErrorCategory =
  | 'http_400'
  | 'http_401'
  | 'http_403'
  | 'http_404'
  | 'http_408'
  | 'http_429'
  | 'http_other_4xx'
  | 'http_5xx'
  | 'timeout'
  | 'network'
  | 'empty_response'
  | 'unknown';

export interface AccuracyDevelopmentItem {
  name: string;
  weight: number;
}

export interface AccuracyDevelopmentDiagnostic {
  caseId: string;
  sampleIndex: number;
  latencyMs: number;
  modelVersion?: string;
  finalText?: string;
  finalTextBytes?: number;
  finalTextSha256?: string;
  oversized?: boolean;
  items?: readonly AccuracyDevelopmentItem[];
  safeErrorCategory?: AccuracyDevelopmentSafeErrorCategory;
}

export interface AccuracyDevelopmentOutcome {
  caseId: string;
  sampleIndex: number;
  prediction: NutritionPrediction;
  diagnostic: AccuracyDevelopmentDiagnostic;
}

export interface AccuracyDevelopmentResult {
  report: NutritionEvalReport;
  diagnostics: readonly AccuracyDevelopmentDiagnostic[];
  sdkVisionCalls: number;
}

export interface AccuracyDevelopmentDeps {
  loadImage(evalCase: NutritionEvalCase): Promise<Uint8Array>;
  createClient(): GenAIClient;
  reserve(caseId: string, index: number): Promise<void>;
  persistOutcome(outcome: AccuracyDevelopmentOutcome): Promise<void>;
  nowMs(): number;
}

interface CapturedResponse {
  text?: string | undefined;
  modelVersion?: string | undefined;
  safeErrorCategory?: AccuracyDevelopmentSafeErrorCategory;
}

function classifySafeError(error: unknown): AccuracyDevelopmentSafeErrorCategory {
  if (
    error === null
    || (typeof error !== 'object' && typeof error !== 'function')
  ) {
    return 'unknown';
  }

  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(error, 'status');
  } catch {
    return 'unknown';
  }
  if (descriptor === undefined || !('value' in descriptor)) return 'unknown';

  const status: unknown = descriptor.value;
  if (typeof status !== 'number' || !Number.isInteger(status)) return 'unknown';
  if (status === 400) return 'http_400';
  if (status === 401) return 'http_401';
  if (status === 403) return 'http_403';
  if (status === 404) return 'http_404';
  if (status === 408) return 'http_408';
  if (status === 429) return 'http_429';
  if (status >= 400 && status < 500) return 'http_other_4xx';
  if (status >= 500 && status < 600) return 'http_5xx';
  return 'unknown';
}

function validateCases(cases: readonly NutritionEvalCase[]): void {
  if (cases.length !== REQUIRED_CASE_COUNT) {
    throw new CalibrationFatalError('accuracy:invalid-cases');
  }
  const ids = new Set<string>();
  for (const evalCase of cases) {
    if (
      ids.has(evalCase.id)
      || evalCase.visibility !== 'public'
      || evalCase.scanMode !== 'meal'
      || evalCase.image.mediaType !== 'image/png'
    ) {
      throw new CalibrationFatalError('accuracy:invalid-cases');
    }
    ids.add(evalCase.id);
  }
}

function buildDiagnostic(
  evalCase: NutritionEvalCase,
  latencyMs: number,
  captured: CapturedResponse,
): AccuracyDevelopmentDiagnostic {
  const diagnostic: AccuracyDevelopmentDiagnostic = {
    caseId: evalCase.id,
    sampleIndex: SAMPLE_INDEX,
    latencyMs,
  };

  if (captured.modelVersion !== undefined) {
    diagnostic.modelVersion = captured.modelVersion;
  }
  if (captured.safeErrorCategory !== undefined) {
    diagnostic.safeErrorCategory = captured.safeErrorCategory;
  }

  const finalText = captured.text;
  if (finalText !== undefined) {
    const bytes = Buffer.byteLength(finalText, 'utf8');
    diagnostic.finalTextBytes = bytes;
    diagnostic.finalTextSha256 = createHash('sha256')
      .update(finalText, 'utf8')
      .digest('hex');
    if (bytes <= MAX_RETAINED_BYTES) {
      diagnostic.finalText = finalText;
      diagnostic.oversized = false;
    } else {
      diagnostic.oversized = true;
    }

    const parsed = bytes <= MAX_RETAINED_BYTES ? parseNutritionResponse(finalText, 'meal') : undefined;
    if (parsed?.ok) {
      diagnostic.items = parsed.result.detectedItems.map((item) => ({
        name: item.name,
        weight: item.weight,
      }));
    }
  }

  return diagnostic;
}

export async function runAccuracyDevelopment(
  cases: readonly NutritionEvalCase[],
  deps: AccuracyDevelopmentDeps,
  identity: AccuracyDevelopmentIdentity,
): Promise<AccuracyDevelopmentResult> {
  validateCases(cases);
  if (!identity.runId.trim() || !Number.isFinite(Date.parse(identity.timestamp))
    || !/^[a-f0-9]{40}$/.test(identity.codeSha)
    || !/^[a-f0-9]{64}$/.test(identity.datasetHash)) {
    throw new CalibrationFatalError('accuracy:invalid-identity');
  }

  let firstFatal: CalibrationFatalError | undefined;
  const makeFatal = (code: string): CalibrationFatalError => {
    if (firstFatal !== undefined) return firstFatal;
    const error = new CalibrationFatalError(`accuracy:${code}`);
    firstFatal = error;
    return error;
  };

  const images = new Map<string, Uint8Array>();
  for (const evalCase of cases) {
    let bytes: Uint8Array;
    try {
      bytes = await deps.loadImage(evalCase);
    } catch {
      throw makeFatal('image-load-failed');
    }
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > 5 * 1024 * 1024) {
      throw makeFatal('invalid-image-bytes');
    }
    images.set(evalCase.id, bytes);
  }

  let client: GenAIClient;
  try {
    client = deps.createClient();
  } catch {
    throw makeFatal('client-create-failed');
  }

  let currentCase: NutritionEvalCase | undefined;
  let reservedCaseId: string | undefined;
  let sdkCalls = 0;
  let captured: CapturedResponse = {};
  let caseSdkCalls = 0;
  let metadataCalls = 0;
  const checkFatal = (): void => { if (firstFatal) throw firstFatal; };
  const clock = (): number => {
    let value: number;
    try { value = deps.nowMs(); } catch { throw makeFatal('clock-invalid'); }
    checkFatal();
    if (!Number.isFinite(value) || value < 0) throw makeFatal('clock-invalid');
    return value;
  };

  const countedClient: GenAIClient = {
    models: {
      async generateContent(params) {
        checkFatal();
        const evalCase = currentCase;
        if (evalCase === undefined) throw makeFatal('unexpected-sdk-call');
        if (sdkCalls >= REQUIRED_CASE_COUNT) throw makeFatal('sdk-budget-exceeded');
        if (reservedCaseId !== evalCase.id) throw makeFatal('unreserved-sdk-call');
        if (caseSdkCalls !== 0) throw makeFatal('duplicate-sdk-call');
        reservedCaseId = undefined;
        sdkCalls += 1;
        caseSdkCalls += 1;

        try {
          const response = await client.models.generateContent(params);
          checkFatal();
          const text = response.text;
          checkFatal();
          let version: unknown;
          try { version = response.modelVersion; } catch { throw makeFatal('model-metadata-invalid'); }
          checkFatal();
          if ((version !== undefined && version !== MODEL)
            || (typeof text === 'string' && text.trim().length > 0 && version !== MODEL)) {
            throw makeFatal('model-metadata-invalid');
          }
          captured = {
            text: typeof text === 'string' ? text : undefined,
            modelVersion: version,
          };
          // The parser and diagnostics consume the same SDK-field snapshot.
          return { text: captured.text, modelVersion: version };
        } catch (error) {
          checkFatal();
          if (error instanceof CalibrationFatalError) throw error;
          captured.safeErrorCategory = classifySafeError(error);
          checkFatal();
          throw error;
        }
      },
    },
  };

  const genAIAdapter = createGenAIAdapter({
    project: PROJECT,
    location: LOCATION,
    googleGenAI: countedClient,
  });

  const adapter = createLiveNutritionEvalAdapter({
    project: PROJECT,
    location: LOCATION,
    model: MODEL,
    genAIAdapter,
    mealPrompt: ACCURACY_MEAL_PROMPT_V1,
    visionGenerationOptions: {
      mode: 'calibration',
      thinkingLevel: 'MEDIUM',
      imageMediaType: 'image/png',
      timeoutMs: TIMEOUT_MS,
      beforeRequest: async () => {
        checkFatal();
        const evalCase = currentCase;
        if (evalCase === undefined) throw makeFatal('unreserved-sdk-call');
        if (reservedCaseId !== undefined || caseSdkCalls !== 0) throw makeFatal('duplicate-reservation');
        try {
          await deps.reserve(evalCase.id, SAMPLE_INDEX);
        } catch {
          throw makeFatal('reservation-failed');
        }
        checkFatal();
        reservedCaseId = evalCase.id;
      },
      onResponseMetadata: (metadata) => {
        checkFatal();
        if (caseSdkCalls !== 1 || metadataCalls !== 0 || metadata.modelVersion !== MODEL) {
          throw makeFatal('model-metadata-invalid');
        }
        metadataCalls += 1;
      },
    },
  });

  const results = [];
  const diagnostics: AccuracyDevelopmentDiagnostic[] = [];

  for (const evalCase of cases) {
    const bytes = images.get(evalCase.id);
    if (bytes === undefined) throw makeFatal('image-missing');

    currentCase = evalCase;
    reservedCaseId = undefined;
    captured = {};
    caseSdkCalls = 0;
    metadataCalls = 0;

    const start = clock();
    let rawPrediction: NutritionPrediction;
    try {
      rawPrediction = await adapter.analyzeCase(evalCase, bytes, {
        sampleIndex: SAMPLE_INDEX,
      });
    } catch {
      throw makeFatal('analysis-failed');
    }
    if (firstFatal !== undefined) throw firstFatal;
    if (caseSdkCalls !== 1 || (captured.text?.trim() && metadataCalls !== 1)) {
      throw makeFatal('dispatch-accounting-invalid');
    }

    const end = clock();
    const elapsed = end - start;
    if (elapsed < 0) throw makeFatal('clock-invalid');
    const latencyMs = elapsed;

    const prediction: NutritionPrediction = {
      ...rawPrediction,
      latencyMs,
      sampleIndex: SAMPLE_INDEX,
      cached: false,
    };
    const diagnostic = buildDiagnostic(evalCase, latencyMs, captured);

    results.push(scoreNutritionCase(evalCase, prediction));
    diagnostics.push(diagnostic);

    try {
      await deps.persistOutcome({
        caseId: evalCase.id,
        sampleIndex: SAMPLE_INDEX,
        prediction,
        diagnostic,
      });
    } catch {
      throw makeFatal('outcome-persist-failed');
    }
    checkFatal();
  }

  currentCase = undefined;
  if (firstFatal !== undefined) throw firstFatal;

  const report = buildNutritionEvalReport(results, {
    runId: identity.runId,
    timestamp: identity.timestamp,
    datasetId: DATASET_ID,
    datasetHash: identity.datasetHash,
    adapterModelId: MODEL,
    promptHash: createHash('sha256')
      .update(ACCURACY_MEAL_PROMPT_V1, 'utf8')
      .digest('hex'),
    codeSha: identity.codeSha,
    samples: 1,
    baselineOnly: false,
    publicCases: cases.length,
    privateCases: 0,
  });

  return {
    report,
    diagnostics,
    sdkVisionCalls: sdkCalls,
  };
}
