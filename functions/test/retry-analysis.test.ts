import { describe, expect, it } from 'vitest';
import {
  handleRetryEntryAnalysis,
  RetryAnalysisError,
  type RetryAnalysisDeps,
} from '../src/retry-analysis';
import {
  handleEntryCreated,
  type AnalyzeEntryDeps,
  type EntryData,
} from '../src/analyze-entry';

// ---------------------------------------------------------------------------
// Fake Firestore snapshot (exposes exists + data() like Firestore)
// ---------------------------------------------------------------------------

interface FakeSnapshot {
  readonly exists: boolean;
  data(): Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Fake transaction — mirrors the subset of FirebaseFirestore.Transaction used
// by the retry-analysis module without any unsafe `any`.
// ---------------------------------------------------------------------------

interface FakeTransaction {
  get(ref: { path: string }): Promise<FakeSnapshot>;
  set(ref: { path: string }, data: Record<string, unknown>): void;
  update(ref: { path: string }, data: Record<string, unknown>): void;
}

// ---------------------------------------------------------------------------
// Fake transaction runner — models Firestore Transactions deterministically
// ---------------------------------------------------------------------------

interface FakeDocState {
  exists: boolean;
  fields: Record<string, unknown>;
}

function fakeTransactionRunner(
  docs: Map<string, FakeDocState>,
  options: {
    onGet?: (path: string) => void;
    onSet?: (path: string, data: Record<string, unknown>) => void;
  } = {},
): RetryAnalysisDeps['runTransaction'] {
  let version = 0;

  const run = async <T>(fn: (txn: FakeTransaction) => Promise<T>): Promise<T> => {
    const baseVersion = version;
    const writes: Array<{
      kind: 'set' | 'update';
      ref: { path: string };
      data: Record<string, unknown>;
    }> = [];
    const txn: FakeTransaction = {
      get: async (ref): Promise<FakeSnapshot> => {
        options.onGet?.(ref.path);
        const doc = docs.get(ref.path);
        if (!doc || !doc.exists) {
          return {
            exists: false,
            data: () => ({}),
          };
        }
        return {
          exists: true,
          data: () => ({ ...doc.fields }),
        };
      },
      set: (ref, data): void => {
        writes.push({ kind: 'set', ref, data });
      },
      update: (ref, data): void => {
        writes.push({ kind: 'update', ref, data });
      },
    };

    const result = await fn(txn);
    if (baseVersion !== version) {
      return run(fn);
    }

    for (const write of writes) {
      const existing = docs.get(write.ref.path);
      if (write.kind === 'update' && !existing?.exists) {
        throw new Error(`update on non-existent doc ${write.ref.path}`);
      }
      options.onSet?.(write.ref.path, write.data);
      docs.set(write.ref.path, {
        exists: true,
        fields: {
          ...(write.kind === 'set' ? {} : existing?.fields ?? {}),
          ...write.data,
        },
      });
    }
    if (writes.length > 0) version += 1;
    return result;
  };

  return run;
}

function makeRef(uid: string, entryId: string): { path: string } {
  return { path: `users/${uid}/entries/${entryId}` };
}

// ---------------------------------------------------------------------------
// Deps factory — no unsafe any, no test-specific fakes leaked outside scope
// ---------------------------------------------------------------------------

function makeDeps(overrides: Partial<RetryAnalysisDeps> = {}): {
  deps: RetryAnalysisDeps;
  recorded: { analyzeCalls: Array<{ entryId: string; data: EntryData }> };
} {
  const recorded = { analyzeCalls: [] as Array<{ entryId: string; data: EntryData }> };

  const deps: RetryAnalysisDeps = {
    runTransaction: fakeTransactionRunner(new Map()),
    entryRef: makeRef,
    analyzeEntry: async (entryId: string, data: EntryData) => {
      recorded.analyzeCalls.push({ entryId, data });
    },
    buildAnalyzeDeps: (_uid: string, _entryId: string) => {
      return {
        updateEntry: async () => {},
        loadImageBase64: async () => '',
        generateVision: async () => '',
        getFcmToken: async () => undefined,
        sendPush: async () => {},
        getModelConfig: async () => ({
          visionModel: 'test-model',
          confidenceThreshold: 0.8,
        }),
        appDisplayName: 'Calorix',
        prompt: 'test prompt',
        log: () => {},
      } as unknown as AnalyzeEntryDeps;
    },
    ...overrides,
  };

  return { deps, recorded };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleRetryEntryAnalysis', () => {
  describe('typed error conditions', () => {
    it('rejects unauthenticated request with RetryAnalysisError code unauthenticated', async () => {
      const { deps } = makeDeps();
      await expect(
        handleRetryEntryAnalysis(undefined, 'entry-1', deps),
      ).rejects.toThrow(RetryAnalysisError);
      await expect(
        handleRetryEntryAnalysis(undefined, 'entry-1', deps),
      ).rejects.toMatchObject({ code: 'unauthenticated' });
    });

    it('rejects undefined entryId with code invalid-argument', async () => {
      const { deps } = makeDeps();
      await expect(
        handleRetryEntryAnalysis('uid-1', undefined, deps),
      ).rejects.toMatchObject({ code: 'invalid-argument' });
    });

    it('rejects empty entryId with code invalid-argument', async () => {
      const { deps } = makeDeps();
      await expect(
        handleRetryEntryAnalysis('uid-1', '', deps),
      ).rejects.toMatchObject({ code: 'invalid-argument' });
    });

    it('rejects non-string entryId with code invalid-argument', async () => {
      const { deps } = makeDeps();
      await expect(
        handleRetryEntryAnalysis('uid-1', 123 as unknown as string, deps),
      ).rejects.toMatchObject({ code: 'invalid-argument' });
    });

    it('rejects retry for missing entry doc with code not-found', async () => {
      const docs = new Map<string, FakeDocState>();
      const { deps } = makeDeps({
        runTransaction: fakeTransactionRunner(docs),
      });
      await expect(
        handleRetryEntryAnalysis('uid-1', 'missing-entry', deps),
      ).rejects.toMatchObject({ code: 'not-found' });
    });

    it.each(['pending', 'processing', 'complete', 'needs_review'])(
      'rejects retry when status is %s as failed-precondition',
      async (status) => {
        const docs = new Map<string, FakeDocState>([
          ['users/uid-1/entries/entry-1', { exists: true, fields: { status } }],
        ]);
        const { deps } = makeDeps({
          runTransaction: fakeTransactionRunner(docs),
        });
        await expect(
          handleRetryEntryAnalysis('uid-1', 'entry-1', deps),
        ).rejects.toMatchObject({ code: 'failed-precondition' });
      },
    );
  });

  describe('auth-scoped path and transaction update', () => {
    it('only reads/writes the auth-scoped users/{uid}/entries/{entryId} path', async () => {
      const docs = new Map<string, FakeDocState>([
        ['users/uid-1/entries/entry-1', { exists: true, fields: { status: 'error', imageUrl: 'img' } }],
      ]);
      const readPaths: string[] = [];
      const writtenPaths: string[] = [];

      const { deps } = makeDeps({
        runTransaction: fakeTransactionRunner(docs, {
          onGet: (path) => readPaths.push(path),
          onSet: (path) => writtenPaths.push(path),
        }),
      });

      await handleRetryEntryAnalysis('uid-1', 'entry-1', deps);

      expect(readPaths).toEqual(['users/uid-1/entries/entry-1']);
      expect(writtenPaths).toEqual(['users/uid-1/entries/entry-1']);
    });

    it('transaction update is exactly {status:"pending"} and preserves all other fields', async () => {
      const entryData = {
        status: 'error',
        imageUrl: 'https://storage.example/scan.jpg',
        storagePath: 'scans/uid-1/entry-1.jpg',
        uid: 'uid-1',
        date: '2026-07-15',
        scanMode: 'meal',
      };
      const docs = new Map<string, FakeDocState>([
        ['users/uid-1/entries/entry-1', { exists: true, fields: entryData }],
      ]);
      let writtenData: Record<string, unknown> = {};

      const { deps } = makeDeps({
        runTransaction: fakeTransactionRunner(docs, {
          onSet: (_path, data) => {
            writtenData = data;
          },
        }),
      });

      await handleRetryEntryAnalysis('uid-1', 'entry-1', deps);

      expect(writtenData).toEqual({ status: 'pending' });
      const doc = docs.get('users/uid-1/entries/entry-1');
      expect(doc?.fields.imageUrl).toBe('https://storage.example/scan.jpg');
      expect(doc?.fields.storagePath).toBe('scans/uid-1/entry-1.jpg');
      expect(doc?.fields.uid).toBe('uid-1');
      expect(doc?.fields.date).toBe('2026-07-15');
      expect(doc?.fields.scanMode).toBe('meal');
    });
  });

  describe('concurrent claim serialization', () => {
    it('two simultaneous handleRetryEntryAnalysis calls produce one success, one failed-precondition, exactly one analyze call', async () => {
      const docs = new Map<string, FakeDocState>([
        ['users/uid-1/entries/entry-1', { exists: true, fields: { status: 'error', imageUrl: 'img' } }],
      ]);

      let analyzeCount = 0;
      const { deps } = makeDeps({
        runTransaction: fakeTransactionRunner(docs, {
          onSet: (_path, data) => {
            if (data.status === 'pending') {
              docs.set('users/uid-1/entries/entry-1', {
                exists: true,
                fields: { status: 'pending', imageUrl: 'img' },
              });
            }
          },
        }),
        analyzeEntry: async () => {
          analyzeCount++;
        },
      });

      const results = await Promise.allSettled([
        handleRetryEntryAnalysis('uid-1', 'entry-1', deps),
        handleRetryEntryAnalysis('uid-1', 'entry-1', deps),
      ]);

      const succeeded = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter((r) => r.status === 'rejected');
      expect(succeeded).toHaveLength(1);
      expect(failed).toHaveLength(1);
      expect((failed[0] as PromiseRejectedResult).reason).toMatchObject({
        code: 'failed-precondition',
      });

      expect(analyzeCount).toBe(1);

      const doc = docs.get('users/uid-1/entries/entry-1');
      expect(doc?.fields.status).toBe('pending');
    });
  });

  describe('analysis dependency contract', () => {
    it('shared analysis dependency receives entryId and EntryData with uid + status pending', async () => {
      const docs = new Map<string, FakeDocState>([
        ['users/uid-1/entries/entry-1', {
          exists: true,
          fields: { status: 'error', imageUrl: 'img', uid: 'uid-1' },
        }],
      ]);

      const { deps, recorded } = makeDeps({
        runTransaction: fakeTransactionRunner(docs),
      });

      await handleRetryEntryAnalysis('uid-1', 'entry-1', deps);

      expect(recorded.analyzeCalls).toHaveLength(1);
      const call = recorded.analyzeCalls[0];
      expect(call.entryId).toBe('entry-1');
      expect(call.data).toMatchObject({
        uid: 'uid-1',
        status: 'pending',
      });
      expect(call.data.imageUrl).toBe('img');
    });
  });

  describe('analysis failure recovery', () => {
    it('retry handler delegates to handleEntryCreated which writes status error with errorMessage on generateVision failure', async () => {
      const docs = new Map<string, FakeDocState>([
        ['users/uid-1/entries/entry-1', {
          exists: true,
          fields: { status: 'error', imageUrl: 'img', uid: 'uid-1' },
        }],
      ]);

      const writtenStatuses: unknown[] = [];

      const { deps } = makeDeps({
        runTransaction: fakeTransactionRunner(docs, {
          onSet: (_path, data) => {
            if ('status' in data) writtenStatuses.push(data.status);
          },
        }),
        analyzeEntry: handleEntryCreated,
        buildAnalyzeDeps: (_uid: string, _entryId: string) => {
          return {
            updateEntry: async (fields: Record<string, unknown>) => {
              const doc = docs.get('users/uid-1/entries/entry-1');
              if (doc) {
                doc.fields = { ...doc.fields, ...fields };
              }
            },
            loadImageBase64: async () => 'base64data',
            generateVision: async () => {
              throw new Error('Vision model unavailable');
            },
            getFcmToken: async () => undefined,
            sendPush: async () => {},
            getModelConfig: async () => ({
              visionModel: 'test-model',
              confidenceThreshold: 0.8,
            }),
            appDisplayName: 'Calorix',
            prompt: 'test prompt',
            log: () => {},
          } as unknown as AnalyzeEntryDeps;
        },
      });

      await handleRetryEntryAnalysis('uid-1', 'entry-1', deps);

      expect(writtenStatuses).toContain('pending');

      const doc = docs.get('users/uid-1/entries/entry-1');
      expect(doc?.fields.status).toBe('error');
      expect(doc?.fields.errorMessage).toBe('Vision model unavailable');
    });
  });
});
