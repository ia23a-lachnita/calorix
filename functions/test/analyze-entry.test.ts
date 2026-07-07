import { describe, expect, it, vi } from 'vitest';
import {
  handleEntryCreated,
  type AnalyzeEntryDeps,
  type EntryData,
} from '../src/analyze-entry';
import { DEFAULT_MODEL_CONFIG } from '../src/model-config';
import type { ScanPushMessage } from '../src/push';

function modelResponse(confidence: number): string {
  return JSON.stringify({
    foodName: 'Chicken Rice Bowl',
    kcal: 620,
    protein: 48,
    carbs: 72,
    fat: 16,
    confidence,
    detectedItems: [],
    boundingBox: null,
  });
}

interface Recorded {
  updates: Record<string, unknown>[];
  pushes: ScanPushMessage[];
  visionCalls: { model: string }[];
}

function makeDeps(overrides: Partial<AnalyzeEntryDeps> = {}): {
  deps: AnalyzeEntryDeps;
  recorded: Recorded;
} {
  const recorded: Recorded = { updates: [], pushes: [], visionCalls: [] };
  const deps: AnalyzeEntryDeps = {
    updateEntry: async (fields) => {
      recorded.updates.push(fields);
    },
    getFcmToken: async () => 'token-1',
    loadImageBase64: async () => 'aW1hZ2U=',
    generateVision: async (model) => {
      recorded.visionCalls.push({ model });
      return modelResponse(0.91);
    },
    sendPush: async (message) => {
      recorded.pushes.push(message);
    },
    getModelConfig: async () => DEFAULT_MODEL_CONFIG,
    appDisplayName: 'AppName',
    prompt: 'analyze',
    log: vi.fn(),
    ...overrides,
  };
  return { deps, recorded };
}

const pendingEntry: EntryData = {
  uid: 'user-1',
  status: 'pending',
  imageUrl: 'https://storage.example/scan.jpg',
  storagePath: 'scans/user-1/e1.jpg',
};

describe('handleEntryCreated', () => {
  it('ignores entries that are not pending', async () => {
    const { deps, recorded } = makeDeps();
    await handleEntryCreated('e1', { ...pendingEntry, status: 'complete' }, deps);
    expect(recorded.updates).toHaveLength(0);
  });

  it('completes high-confidence entries with the configured model and pushes the finished notification', async () => {
    const { deps, recorded } = makeDeps({
      getModelConfig: async () => ({
        visionModel: 'gemini-config-vision',
        chatModel: 'x',
        confidenceThreshold: 0.8,
      }),
    });
    await handleEntryCreated('e1', pendingEntry, deps);

    expect(recorded.updates[0]).toEqual({ status: 'processing' });
    expect(recorded.visionCalls[0]).toEqual({ model: 'gemini-config-vision' });
    expect(recorded.updates[1]).toMatchObject({
      status: 'complete',
      foodName: 'Chicken Rice Bowl',
      kcal: 620,
      confidence: 0.91,
      analysisModel: 'gemini-config-vision',
    });
    expect(recorded.pushes).toHaveLength(1);
    expect(recorded.pushes[0]!.notification.title).toBe('AppName finished your meal scan');
    expect(recorded.pushes[0]!.notification.body).toBe('Chicken Rice Bowl · 620 kcal');
  });

  it('gates low-confidence entries to needs_review and pushes the review notification', async () => {
    const { deps, recorded } = makeDeps({
      generateVision: async () => modelResponse(0.62),
    });
    await handleEntryCreated('e1', pendingEntry, deps);

    expect(recorded.updates[1]).toMatchObject({ status: 'needs_review', confidence: 0.62 });
    expect(recorded.pushes[0]!.notification.title).toBe('AppName scan ready to review');
    expect(recorded.pushes[0]!.notification.body).toContain('Chicken Rice Bowl');
  });

  it('respects a configured confidence threshold', async () => {
    const { deps, recorded } = makeDeps({
      generateVision: async () => modelResponse(0.85),
      getModelConfig: async () => ({
        visionModel: 'm',
        chatModel: 'm',
        confidenceThreshold: 0.9,
      }),
    });
    await handleEntryCreated('e1', pendingEntry, deps);
    expect(recorded.updates[1]).toMatchObject({ status: 'needs_review' });
  });

  it('skips the push when the user has no FCM token', async () => {
    const { deps, recorded } = makeDeps({ getFcmToken: async () => undefined });
    await handleEntryCreated('e1', pendingEntry, deps);
    expect(recorded.updates[1]).toMatchObject({ status: 'complete' });
    expect(recorded.pushes).toHaveLength(0);
  });

  it('writes an error status when the model returns unusable output', async () => {
    const { deps, recorded } = makeDeps({ generateVision: async () => 'not json' });
    await handleEntryCreated('e1', pendingEntry, deps);
    expect(recorded.updates[1]).toMatchObject({ status: 'error' });
    expect(String(recorded.updates[1]!.errorMessage)).toContain('no_json_object_in_response');
  });

  it('writes an error status when the image cannot be loaded', async () => {
    const { deps, recorded } = makeDeps({
      loadImageBase64: async () => {
        throw new Error('Image download failed (HTTP 404)');
      },
    });
    await handleEntryCreated('e1', pendingEntry, deps);
    expect(recorded.updates[1]).toEqual({
      status: 'error',
      errorMessage: 'Image download failed (HTTP 404)',
    });
  });
});
