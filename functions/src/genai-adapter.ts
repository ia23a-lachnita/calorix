import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { ChatContent } from './ai-chat';
import { visionResponseJsonSchema, type VisionSource } from './nutrition-json-schema';

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
