export interface ModelConfig {
  visionModel: string;
  chatModel: string;
  confidenceThreshold: number;
}

/**
 * Fallback used when the `model_configs/default` document is missing or
 * unreadable. Model retirements are handled by editing that document — never
 * by redeploying with a new hardcoded name.
 */
export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  visionModel: 'gemini-2.5-flash',
  chatModel: 'gemini-2.5-flash',
  confidenceThreshold: 0.8,
};

const CACHE_TTL_MS = 5 * 60 * 1000;

export type ModelConfigLoader = () => Promise<ModelConfig>;

/**
 * Wraps a raw document read with normalization, defaulting, and a short
 * in-memory TTL cache. On read errors the last known config (or the default)
 * is served so a Firestore blip never takes analysis down.
 */
export function createModelConfigLoader(
  read: () => Promise<Record<string, unknown> | undefined>,
  nowMs: () => number = Date.now,
): ModelConfigLoader {
  let cached: ModelConfig | null = null;
  let fetchedAt = 0;

  return async function getModelConfig(): Promise<ModelConfig> {
    if (cached && nowMs() - fetchedAt < CACHE_TTL_MS) return cached;
    try {
      const raw = (await read()) ?? {};
      cached = {
        visionModel:
          typeof raw.visionModel === 'string' && raw.visionModel.length > 0
            ? raw.visionModel
            : DEFAULT_MODEL_CONFIG.visionModel,
        chatModel:
          typeof raw.chatModel === 'string' && raw.chatModel.length > 0
            ? raw.chatModel
            : DEFAULT_MODEL_CONFIG.chatModel,
        confidenceThreshold:
          typeof raw.confidenceThreshold === 'number' &&
          raw.confidenceThreshold >= 0 &&
          raw.confidenceThreshold <= 1
            ? raw.confidenceThreshold
            : DEFAULT_MODEL_CONFIG.confidenceThreshold,
      };
    } catch {
      cached = cached ?? DEFAULT_MODEL_CONFIG;
    }
    fetchedAt = nowMs();
    return cached;
  };
}
