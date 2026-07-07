import { describe, expect, it } from 'vitest';
import { createModelConfigLoader, DEFAULT_MODEL_CONFIG } from '../src/model-config';

describe('createModelConfigLoader', () => {
  it('returns defaults when the config document is missing', async () => {
    const load = createModelConfigLoader(async () => undefined);
    expect(await load()).toEqual(DEFAULT_MODEL_CONFIG);
  });

  it('uses document values and falls back per-field for invalid entries', async () => {
    const load = createModelConfigLoader(async () => ({
      visionModel: 'gemini-9.9-vision',
      confidenceThreshold: 1.7,
    }));
    const config = await load();
    expect(config.visionModel).toBe('gemini-9.9-vision');
    expect(config.chatModel).toBe(DEFAULT_MODEL_CONFIG.chatModel);
    expect(config.confidenceThreshold).toBe(DEFAULT_MODEL_CONFIG.confidenceThreshold);
  });

  it('caches within the TTL and refetches afterwards', async () => {
    let reads = 0;
    let now = 0;
    const load = createModelConfigLoader(
      async () => {
        reads += 1;
        return { visionModel: `model-${reads}` };
      },
      () => now,
    );
    expect((await load()).visionModel).toBe('model-1');
    now += 60 * 1000;
    expect((await load()).visionModel).toBe('model-1');
    expect(reads).toBe(1);
    now += 5 * 60 * 1000;
    expect((await load()).visionModel).toBe('model-2');
  });

  it('serves the last known config when a read fails', async () => {
    let now = 0;
    let fail = false;
    const load = createModelConfigLoader(
      async () => {
        if (fail) throw new Error('firestore down');
        return { visionModel: 'stable-model' };
      },
      () => now,
    );
    expect((await load()).visionModel).toBe('stable-model');
    fail = true;
    now += 6 * 60 * 1000;
    expect((await load()).visionModel).toBe('stable-model');
  });
});
