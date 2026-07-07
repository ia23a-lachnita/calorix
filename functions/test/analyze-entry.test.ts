import { describe, expect, it, vi } from 'vitest';
import {
  handleEntryCreated,
  type AnalyzeEntryDeps,
  type CompletionWrite,
  type EntryData,
} from '../src/analyze-entry';
import type { ScanPushMessage } from '../src/push';

const modelResponse = JSON.stringify({
  foodName: 'Chicken Rice Bowl',
  kcal: 620,
  protein: 48,
  carbs: 72,
  fat: 16,
  confidence: 0.91,
  detectedItems: [],
  boundingBox: null,
});

interface Recorded {
  updates: Record<string, unknown>[];
  completions: CompletionWrite[];
  pushes: ScanPushMessage[];
}

function makeDeps(overrides: Partial<AnalyzeEntryDeps> = {}): { deps: AnalyzeEntryDeps; recorded: Recorded } {
  const recorded: Recorded = { updates: [], completions: [], pushes: [] };
  const deps: AnalyzeEntryDeps = {
    updateEntry: async (fields) => {
      recorded.updates.push(fields);
    },
    commitCompletion: async (write) => {
      recorded.completions.push(write);
    },
    getFcmToken: async () => 'token-1',
    fetchImageBase64: async () => 'aW1hZ2U=',
    generateVision: async () => modelResponse,
    sendPush: async (message) => {
      recorded.pushes.push(message);
    },
    now: () => new Date('2026-07-07T12:00:00Z'),
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
  timestampMs: Date.parse('2026-07-06T18:30:00Z'),
};

describe('handleEntryCreated', () => {
  it('ignores entries that are not pending', async () => {
    const { deps, recorded } = makeDeps();
    await handleEntryCreated('e1', { ...pendingEntry, status: 'complete' }, deps);
    expect(recorded.updates).toHaveLength(0);
    expect(recorded.completions).toHaveLength(0);
  });

  it('marks processing, commits completion keyed by the entry timestamp, and pushes', async () => {
    const { deps, recorded } = makeDeps();
    await handleEntryCreated('e1', pendingEntry, deps);

    expect(recorded.updates[0]).toEqual({ status: 'processing' });
    expect(recorded.completions).toHaveLength(1);
    const completion = recorded.completions[0]!;
    expect(completion.dailyLogId).toBe('user-1_2026-07-06');
    expect(completion.entryFields).toMatchObject({
      status: 'complete',
      foodName: 'Chicken Rice Bowl',
      kcal: 620,
      confidence: 0.91,
    });
    expect(completion.delta).toEqual({ kcal: 620, protein: 48, carbs: 72, fat: 16, entryCount: 1 });

    expect(recorded.pushes).toHaveLength(1);
    expect(recorded.pushes[0]!.notification.body).toBe('Chicken Rice Bowl · 620 kcal');
    expect(recorded.pushes[0]!.data).toEqual({ entryId: 'e1' });
  });

  it('falls back to now() when the entry has no timestamp', async () => {
    const { deps, recorded } = makeDeps();
    const { timestampMs: _ts, ...withoutTimestamp } = pendingEntry;
    await handleEntryCreated('e1', withoutTimestamp, deps);
    expect(recorded.completions[0]!.dailyLogId).toBe('user-1_2026-07-07');
  });

  it('skips the push when the user has no FCM token', async () => {
    const { deps, recorded } = makeDeps({ getFcmToken: async () => undefined });
    await handleEntryCreated('e1', pendingEntry, deps);
    expect(recorded.completions).toHaveLength(1);
    expect(recorded.pushes).toHaveLength(0);
  });

  it('writes an error status when the model returns unusable output', async () => {
    const { deps, recorded } = makeDeps({ generateVision: async () => 'not json' });
    await handleEntryCreated('e1', pendingEntry, deps);
    expect(recorded.completions).toHaveLength(0);
    expect(recorded.updates).toHaveLength(2);
    expect(recorded.updates[1]).toMatchObject({ status: 'error' });
    expect(String(recorded.updates[1]!.errorMessage)).toContain('no_json_object_in_response');
  });

  it('writes an error status when image download fails', async () => {
    const { deps, recorded } = makeDeps({
      fetchImageBase64: async () => {
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
