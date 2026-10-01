import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { ChatContent } from './ai-chat';
import { visionResponseJsonSchema, type VisionSource } from './nutrition-json-schema';

export const CALIBRATION_VERTEX_PROJECT = 'calorix-xurschnell';
export const CALIBRATION_VERTEX_LOCATION = 'us';
export const CALIBRATION_MODEL = 'gemini-3.8-flash';
export const CALIBRATION_API_VERSION = 'v1';
export const CALIBRATION_BASE_URL = 'https://aiplatform.us.rep.googleapis.com/';
export const CALIBRATION_TIMEOUT_MS = 30000;

export type CalibrationSafeErrorCategory =
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
  | 'interrupted_reservation'
  | 'unknown';

export const CALIBRATION_SAFE_ERROR_CATEGORIES: ReadonlyArray<CalibrationSafeErrorCategory> = [
  'http_400',
  'http_401',
  'http_403',
  'http_404',
  'http_408',
  'http_429',
  'http_other_4xx',
  'http_5xx',
  'timeout',
  'network',
  'empty_response',
  'interrupted_reservation',
  'unknown',
] as const;

export function classifyCalibrationError(error: unknown): CalibrationSafeErrorCategory {
  if (error == null) {
    return 'unknown';
  }
  if (typeof error !== 'object' && typeof error !== 'function') {
    return 'unknown';
  }
  const obj = error as Record<string, unknown>;
  const status = obj.status;
  if (typeof status === 'number') {
    if (status === 400) return 'http_400';
    if (status === 401) return 'http_401';
    if (status === 403) return 'http_403';
    if (status === 404) return 'http_404';
    if (status === 408) return 'http_408';
    if (status === 429) return 'http_429';
    if (status >= 400 && status < 500) return 'http_other_4xx';
    if (status >= 500 && status < 600) return 'http_5xx';
  }
  const code = obj.code;
  if (typeof code === 'string') {
    if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') {
      return 'timeout';
    }
    if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'ECONNRESET') {
      return 'network';
    }
  }
  const message = obj.message;
  if (typeof message === 'string') {
    const lower = message.toLowerCase();
    if (lower.includes('timed out') || lower.includes('deadline exceeded')) {
      return 'timeout';
    }
    if (lower.includes('fetch failed') || lower.includes('network')) {
      return 'network';
    }
  }
  return 'unknown';
}

export type CalibrationCountTokensRequestShape = {
  model: 'gemini-3.8-flash';
  contents: Array<{ role: 'user'; parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> }>;
  config: { httpOptions: { timeout: number } };
};

export interface CalibrationCountTokensClient {
  models: {
    countTokens: (request: CalibrationCountTokensRequestShape) => Promise<{ totalTokens?: unknown }>;
  };
}

export interface CalibrationCountTokensRequest {
  model: string;
  prompt: string;
  imageBase64: string;
  imageMediaType: 'image/png' | 'image/jpeg';
  timeoutMs: number;
}

export async function countCalibrationTokens(
  client: CalibrationCountTokensClient,
  request: CalibrationCountTokensRequest,
): Promise<{ tokenCount: number }> {
  if (request.model !== 'gemini-3.8-flash') {
    throw new Error('countCalibrationTokens only supports gemini-3.8-flash');
  }
  if (!Number.isFinite(request.timeoutMs) || request.timeoutMs <= 0) {
    throw new Error('timeoutMs must be a finite positive number');
  }
  if (request.imageMediaType !== 'image/png' && request.imageMediaType !== 'image/jpeg') {
    throw new Error('imageMediaType must be image/png or image/jpeg');
  }

  const response = await client.models.countTokens({
    model: 'gemini-3.8-flash',
    contents: [
      {
        role: 'user',
        parts: [
          { text: request.prompt },
          { inlineData: { mimeType: request.imageMediaType, data: request.imageBase64 } },
        ],
      },
    ],
    config: { httpOptions: { timeout: request.timeoutMs } },
  } as CalibrationCountTokensRequestShape);

  const totalTokens = response.totalTokens;
  if (typeof totalTokens !== 'number' || !Number.isFinite(totalTokens) || totalTokens < 0) {
    throw new Error('Malformed token response: totalTokens must be a finite non-negative number');
  }
  return { tokenCount: totalTokens };
}

export function createCalibrationGenAIClient(
  env: Record<string, string | undefined> = process.env,
): GoogleGenAI {
  const source = env ?? {};
  {
    const vertexBaseUrl = source.GOOGLE_VERTEX_BASE_URL?.trim();
    const geminiBaseUrl = source.GOOGLE_GEMINI_BASE_URL?.trim();
    if (vertexBaseUrl || geminiBaseUrl) {
      throw new Error('Endpoint overrides are not allowed for calibration client');
    }
    const retryOptions = source.GOOGLE_GENAI_RETRY_OPTIONS || source.CALIBRATION_MAX_RETRIES;
    if (retryOptions) {
      throw new Error('Provider retry overrides are not allowed for calibration client');
    }
    for (const value of Object.values(source)) {
      if (value && typeof value === 'string' && value.includes('2.5')) {
        throw new Error('gemini-2.5 references are not allowed in calibration environment');
      }
    }
    const evalProject = source.CALORIX_NUTRITION_EVAL_PROJECT;
    const evalLocation = source.CALORIX_NUTRITION_EVAL_LOCATION;
    const evalModel = source.CALORIX_NUTRITION_EVAL_MODEL;
    if (evalProject && evalProject !== CALIBRATION_VERTEX_PROJECT) {
      throw new Error('Wrong project in calibration environment');
    }
    if (evalLocation && evalLocation !== CALIBRATION_VERTEX_LOCATION) {
      throw new Error('Wrong location in calibration environment');
    }
    if (evalModel && evalModel !== CALIBRATION_MODEL) {
      throw new Error('Wrong model in calibration environment');
    }
  }

  return new GoogleGenAI({
    vertexai: true,
    project: CALIBRATION_VERTEX_PROJECT,
    location: CALIBRATION_VERTEX_LOCATION,
    apiVersion: CALIBRATION_API_VERSION,
    httpOptions: {
      baseUrl: CALIBRATION_BASE_URL,
      timeout: CALIBRATION_TIMEOUT_MS,
    },
  });
}

export interface GenAIPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

export interface GenAIContent {
  role: 'user' | 'model';
  parts: GenAIPart[];
}

export type Gemini3ThinkingLevel = 'LOW' | 'MEDIUM';

export type VisionGenerationProfile =
  | { kind: 'gemini-2'; temperature: 0 }
  | { kind: 'gemini-3'; thinkingLevel: Gemini3ThinkingLevel };

export function resolveVisionGenerationProfile(
  model: string,
  requestedThinkingLevel?: Gemini3ThinkingLevel,
): VisionGenerationProfile {
  if (model === 'gemini-2.5-flash') {
    return { kind: 'gemini-2', temperature: 0 };
  }
  if (model === 'gemini-3.8-flash') {
    if (requestedThinkingLevel === 'LOW' || requestedThinkingLevel === 'MEDIUM') {
      return { kind: 'gemini-3', thinkingLevel: requestedThinkingLevel };
    }
    throw new Error('gemini-3.8-flash requires thinkingLevel LOW or MEDIUM');
  }
  throw new Error(`Unknown model for vision generation profile: ${model}`);
}

export interface VisionGenerationOptions {
  mode: 'calibration';
  thinkingLevel: Gemini3ThinkingLevel;
  imageMediaType: 'image/png' | 'image/jpeg';
  timeoutMs: number;
  beforeRequest?: () => Promise<void>;
  onResponseMetadata?: (metadata: { modelVersion?: string }) => void;
}

/** Map Gemini3ThinkingLevel string literals to the SDK ThinkingLevel enum. */
function mapThinkingLevel(level: Gemini3ThinkingLevel): ThinkingLevel {
  if (level === 'LOW') return ThinkingLevel.LOW;
  return ThinkingLevel.MEDIUM;
}

/** Narrow, testable boundary matching GoogleGenAI's models.generateContent. */
export interface GenAIClient {
  models: {
    generateContent(params: {
      model: string;
      contents: GenAIContent[];
      config?: {
        responseMimeType: 'application/json';
        responseJsonSchema: Record<string, unknown>;
        temperature?: 0;
        thinkingConfig?: { thinkingLevel: ThinkingLevel };
        httpOptions?: { timeout: number };
      };
    }): Promise<{ text?: string | undefined; modelVersion?: string | undefined }>;
  };
}

export interface GenAIAdapterOptions {
  project: string;
  location: string;
  /** Injected for tests; production builds a real GoogleGenAI client. */
  googleGenAI?: GenAIClient;
}

export interface GenAIAdapter {
  generateChat(model: string, contents: ChatContent[]): Promise<string>;
  generateVision(
    model: string,
    prompt: string,
    imageBase64: string,
    source?: VisionSource,
    generationOptions?: VisionGenerationOptions,
  ): Promise<string>;
}

function extractText(response: { text?: string | undefined }): string {
  const text = response.text;
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('Empty model response');
  }
  return text;
}

export function createGenAIAdapter(options: GenAIAdapterOptions): GenAIAdapter {
  const client: GenAIClient =
    options.googleGenAI ??
    new GoogleGenAI({
      vertexai: true,
      project: options.project,
      location: options.location,
      apiVersion: 'v1',
    });

  return {
    async generateChat(model, contents) {
      const response = await client.models.generateContent({ model, contents });
      return extractText(response);
    },
    async generateVision(model, prompt, imageBase64, source = 'meal', generationOptions?: VisionGenerationOptions) {
      if (generationOptions === undefined) {
        const response = await client.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt },
                { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
              ],
            },
          ],
          config: {
            responseMimeType: 'application/json',
            responseJsonSchema: visionResponseJsonSchema(source),
            temperature: 0,
          },
        });
        return extractText(response);
      }
      if (generationOptions.mode !== 'calibration') {
        throw new Error('Unsupported vision generation mode');
      }
      const { thinkingLevel, imageMediaType, timeoutMs } = generationOptions;
      if (imageMediaType !== 'image/png' && imageMediaType !== 'image/jpeg') {
        throw new Error('calibration imageMediaType must be image/png or image/jpeg');
      }
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        throw new Error('calibration timeoutMs must be a finite positive number');
      }
      const profile = resolveVisionGenerationProfile(model, thinkingLevel);
      if (profile.kind !== 'gemini-3') {
        throw new Error('calibration mode requires gemini-3.8-flash');
      }
      if (generationOptions.beforeRequest !== undefined) {
        await generationOptions.beforeRequest();
      }
      const response = await client.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              { inlineData: { mimeType: imageMediaType, data: imageBase64 } },
            ],
          },
        ],
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: visionResponseJsonSchema(source),
          thinkingConfig: { thinkingLevel: mapThinkingLevel(profile.thinkingLevel) },
          httpOptions: { timeout: timeoutMs },
        },
      });
      const text = extractText(response);
      if (response.modelVersion !== undefined) {
        generationOptions.onResponseMetadata?.({ modelVersion: response.modelVersion });
      }
      return text;
    },
  };
}
