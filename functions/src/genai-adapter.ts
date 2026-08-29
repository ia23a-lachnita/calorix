import { GoogleGenAI } from '@google/genai';
import type { ChatContent } from './ai-chat';

export interface GenAIPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

export interface GenAIContent {
  role: 'user' | 'model';
  parts: GenAIPart[];
}

/** Narrow, testable boundary matching GoogleGenAI's models.generateContent. */
export interface GenAIClient {
  models: {
    generateContent(params: {
      model: string;
      contents: GenAIContent[];
    }): Promise<{ text?: string | undefined }>;
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
  generateVision(model: string, prompt: string, imageBase64: string): Promise<string>;
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
    async generateVision(model, prompt, imageBase64) {
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
      });
      return extractText(response);
    },
  };
}
