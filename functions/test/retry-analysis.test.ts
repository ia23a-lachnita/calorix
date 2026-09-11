import { describe, expect, it, vi } from 'vitest';

const genaiAdapterFactoryMock = vi.hoisted(() => ({
  createGenAIAdapter: vi.fn(),
  generateVision: vi.fn(),
}));
import {
  buildAnalyzeEntryDepsFactory,
  handleRetryEntryAnalysis,
  RetryAnalysisError,
  type RetryAnalysisDeps,
} from '../src/retry-analysis';
import {
  handleEntryCreated,
  type AnalyzeEntryDeps,
  type EntryData,
} from '../src/analyze-entry';

const firestoreFactoryMock = vi.hoisted(() => ({
  deleteField: vi.fn(),
  getFirestore: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { delete: firestoreFactoryMock.deleteField },
  getFirestore: firestoreFactoryMock.getFirestore,
}));

vi.mock('../src/genai-adapter', () => ({
  createGenAIAdapter: genaiAdapterFactoryMock.createGenAIAdapter,
}));

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
        mealPrompt: 'meal prompt',
        labelPrompt: 'label prompt',
        barcodePrompt: 'barcode prompt',
        fetchOffProduct: async () => null,
        log: () => {},
      } as unknown as AnalyzeEntryDeps;
    },
    ...overrides,
  };

  return { deps, recorded };
}

function successfulPackageResponse(): string {
  return JSON.stringify({
    name: 'Vitamin Well Reload',
    kcal: 85,
    proteinG: 0,
    carbsG: 21,
    fatG: 0,
    confidence: 0.99,
    nutritionBasis: 'package',
    nutritionAmount: 500,
    nutritionUnit: 'ml',
    observedPackageAmount: 500,
    observedPackageUnit: 'ml',
    packageReference: { kcal: 85, proteinG: 0, carbsG: 21, fatG: 0, amount: 500, unit: 'ml' },
    candidates: [{ name: 'Vitamin Well Reload', confidence: 0.99, kcal: 85, proteinG: 0, carbsG: 21, fatG: 0 }],
    barcode: null,
    detectedItems: [],
    boundingBox: null,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleRetryEntryAnalysis', () => {
  it('factory injects the mocked FieldValue.delete sentinel without Firebase initialization', () => {
    const deletionSentinel = Object.freeze({ firestore: 'delete' });
    const entryRef = { update: vi.fn() };
    const entries = { doc: vi.fn(() => entryRef) };
    const userDoc = { collection: vi.fn(() => entries) };
    const users = { doc: vi.fn(() => userDoc) };
    const db = { collection: vi.fn(() => users) };
    firestoreFactoryMock.deleteField.mockReset();
    firestoreFactoryMock.deleteField.mockReturnValue(deletionSentinel);
    firestoreFactoryMock.getFirestore.mockReset();
    firestoreFactoryMock.getFirestore.mockReturnValue(db);

    const deps = buildAnalyzeEntryDepsFactory('uid-1', 'entry-1');

    expect(firestoreFactoryMock.getFirestore).toHaveBeenCalledTimes(1);
    expect(firestoreFactoryMock.deleteField).toHaveBeenCalledTimes(1);
    expect((deps as unknown as Record<string, unknown>).analysisFieldDeletion).toBe(deletionSentinel);
  });

  it('factory forwards label and barcode source through the real vision-adapter wrapper', async () => {
    const deletionSentinel = Object.freeze({ firestore: 'delete' });
    const entryRef = { update: vi.fn() };
    const entries = { doc: vi.fn(() => entryRef) };
    const userDoc = { collection: vi.fn(() => entries) };
    const users = { doc: vi.fn(() => userDoc) };
    const db = { collection: vi.fn(() => users) };
    firestoreFactoryMock.deleteField.mockReturnValue(deletionSentinel);
    firestoreFactoryMock.getFirestore.mockReturnValue(db);
    genaiAdapterFactoryMock.generateVision.mockResolvedValue('provider response');
    genaiAdapterFactoryMock.createGenAIAdapter.mockReturnValue({
      generateChat: vi.fn(),
      generateVision: genaiAdapterFactoryMock.generateVision,
    });

    const deps = buildAnalyzeEntryDepsFactory('uid-1', 'entry-1');
    const generateVision = deps.generateVision as unknown as (
      model: string,
      prompt: string,
      imageBase64: string,
      source: 'label' | 'barcode',
    ) => Promise<string>;
    await generateVision('vision-model', 'label prompt', 'image-data', 'label');
    await generateVision('vision-model', 'barcode prompt', 'image-data', 'barcode');

    expect(genaiAdapterFactoryMock.generateVision).toHaveBeenNthCalledWith(
      1, 'vision-model', 'label prompt', 'image-data', 'label',
    );
    expect(genaiAdapterFactoryMock.generateVision).toHaveBeenNthCalledWith(
      2, 'vision-model', 'barcode prompt', 'image-data', 'barcode',
    );
  });

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

    it('preserves scanMode and rawBarcode for retry analysis', async () => {
      const docs = new Map<string, FakeDocState>([
        ['users/uid-1/entries/entry-1', {
          exists: true,
          fields: {
            status: 'error',
            imageUrl: 'img',
            scanMode: 'barcode',
            rawBarcode: '3017624010701',
          },
        }],
      ]);
      const { deps, recorded } = makeDeps({
        runTransaction: fakeTransactionRunner(docs),
      });

      await handleRetryEntryAnalysis('uid-1', 'entry-1', deps);

      expect(recorded.analyzeCalls[0]?.data).toMatchObject({
        uid: 'uid-1',
        status: 'pending',
        scanMode: 'barcode',
        rawBarcode: '3017624010701',
      });
    });
  });

  describe('analysis failure recovery', () => {
    it('retry handler delegates to handleEntryCreated which writes the safe provider error on generateVision failure', async () => {
      const docs = new Map<string, FakeDocState>([
        ['users/uid-1/entries/entry-1', {
          exists: true,
          fields: { status: 'error', imageUrl: 'img', uid: 'uid-1' },
        }],
      ]);

      const writtenStatuses: unknown[] = [];
      const log = vi.fn();

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
            mealPrompt: 'meal prompt',
            labelPrompt: 'label prompt',
            barcodePrompt: 'barcode prompt',
            fetchOffProduct: async () => null,
            log,
          } as unknown as AnalyzeEntryDeps;
        },
      });

      await handleRetryEntryAnalysis('uid-1', 'entry-1', deps);

      expect(writtenStatuses).toContain('pending');

      const doc = docs.get('users/uid-1/entries/entry-1');
      expect(doc?.fields).toMatchObject({
        status: 'error',
        errorCode: 'provider_request_failed',
        errorMessage: 'Analysis provider request failed',
      });
      expect(log).toHaveBeenCalledWith('processEntry error:', expect.objectContaining({ message: 'Vision model unavailable' }));
    });

    it('replaces stale analysis with a safe error after retry while preserving source-owned inputs', async () => {
      const deletionSentinel = Object.freeze({ firestore: 'delete' });
      const entryPath = 'users/uid-1/entries/entry-1';
      const analysisUpdates: Record<string, unknown>[] = [];
      const docs = new Map<string, FakeDocState>([
        [entryPath, {
          exists: true,
          fields: {
            status: 'error',
            imageUrl: 'https://storage.example/scan.jpg',
            storagePath: 'scans/uid-1/entry-1.jpg',
            scanMode: 'label',
            rawBarcode: '7350042719011',
            foodName: 'Old drink',
            baseKcal: 85,
            nutritionBasis: 'package',
            nutritionAmount: 500,
            nutritionUnit: 'ml',
            consumedAmount: 500,
            barcode: '3333333333333',
            servingMultiplier: 2,
            errorCode: 'old_error',
            errorMessage: 'Old error',
          },
        }],
      ]);

      const { deps } = makeDeps({
        runTransaction: fakeTransactionRunner(docs),
        analyzeEntry: handleEntryCreated,
        buildAnalyzeDeps: (_uid: string, _entryId: string) => {
          const analyzeDeps = {
            updateEntry: async (fields: Record<string, unknown>) => {
              analysisUpdates.push(fields);
              const doc = docs.get(entryPath);
              if (!doc) throw new Error('entry disappeared');
              for (const [key, value] of Object.entries(fields)) {
                if (value === deletionSentinel) {
                  delete doc.fields[key];
                } else {
                  doc.fields[key] = value;
                }
              }
            },
            loadImageBase64: async () => 'base64data',
            generateVision: async () => {
              throw new Error('provider trace must not persist');
            },
            getFcmToken: async () => undefined,
            sendPush: async () => {},
            getModelConfig: async () => ({
              visionModel: 'test-model',
              confidenceThreshold: 0.8,
            }),
            appDisplayName: 'Calorix',
            mealPrompt: 'meal prompt',
            labelPrompt: 'label prompt',
            barcodePrompt: 'barcode prompt',
            fetchOffProduct: async () => null,
            log: () => {},
          } as unknown as AnalyzeEntryDeps;
          Reflect.set(analyzeDeps, 'analysisFieldDeletion', deletionSentinel);
          return analyzeDeps;
        },
      });

      await handleRetryEntryAnalysis('uid-1', 'entry-1', deps);

      const doc = docs.get(entryPath);
      expect(analysisUpdates[1]?.barcode).toBe(deletionSentinel);
      expect(doc?.fields).toMatchObject({
        status: 'error',
        errorCode: 'provider_request_failed',
        errorMessage: 'Analysis provider request failed',
        imageUrl: 'https://storage.example/scan.jpg',
        storagePath: 'scans/uid-1/entry-1.jpg',
        scanMode: 'label',
        rawBarcode: '7350042719011',
      });
      expect(doc?.fields).not.toHaveProperty('baseKcal');
      expect(doc?.fields).not.toHaveProperty('nutritionBasis');
      expect(doc?.fields).not.toHaveProperty('consumedAmount');
      expect(doc?.fields).not.toHaveProperty('barcode');
      expect(doc?.fields).not.toHaveProperty('servingMultiplier');
      expect(JSON.stringify(doc?.fields)).not.toContain('provider trace must not persist');
    });

    it('retries stale error analysis to a canonical complete result and sends only the complete push route', async () => {
      const deletionSentinel = Object.freeze({ firestore: 'delete' });
      const entryPath = 'users/uid-1/entries/entry-1';
      const docs = new Map<string, FakeDocState>([
        [entryPath, {
          exists: true,
          fields: {
            uid: 'uid-1',
            date: '2026-09-07',
            status: 'error',
            imageUrl: 'https://storage.example/scan.jpg',
            storagePath: 'scans/uid-1/entry-1.jpg',
            scanMode: 'label',
            foodName: 'Stale drink',
            baseKcal: 170,
            baseProtein: 2,
            baseCarbs: 42,
            baseFat: 4,
            confidence: 0.4,
            atwaterKcal: 180,
            candidates: [{ name: 'Stale drink' }],
            nutritionBasis: 'package',
            nutritionAmount: 500,
            nutritionUnit: 'ml',
            consumedAmount: 500,
            packageUnitCount: 2,
            unitAmount: 250,
            per100Reference: { kcal: 17, proteinG: 0, carbsG: 4.2, fatG: 0, amount: 100, unit: 'ml' },
            servingReference: { kcal: 42.5, proteinG: 0, carbsG: 10.5, fatG: 0, amount: 250, unit: 'ml' },
            reviewReasons: ['barcode_unconfirmed'],
            modelBarcode: '1111111111111',
            confirmedBarcode: '2222222222222',
            barcode: '3333333333333',
            detectedItems: [{ label: 'stale' }],
            boundingBox: { x: 1, y: 2, width: 3, height: 4 },
            analysisModel: 'old-model',
            servingMultiplier: 2,
            kcal: 170,
            protein: 2,
            carbs: 42,
            fat: 4,
            errorCode: 'old_error',
            errorMessage: 'Old error',
          },
        }],
      ]);
      const pushes: Array<{ data: { entryId: string }; notification: { title: string } }> = [];
      const analysisUpdates: Record<string, unknown>[] = [];
      let imageEntry: EntryData | undefined;

      const { deps } = makeDeps({
        runTransaction: fakeTransactionRunner(docs),
        analyzeEntry: handleEntryCreated,
        buildAnalyzeDeps: (_uid: string, _entryId: string) => {
          const analyzeDeps = {
            updateEntry: async (fields: Record<string, unknown>) => {
              analysisUpdates.push(fields);
              const doc = docs.get(entryPath);
              if (!doc) throw new Error('entry disappeared');
              for (const [key, value] of Object.entries(fields)) {
                if (value === deletionSentinel) delete doc.fields[key];
                else doc.fields[key] = value;
              }
            },
            loadImageBase64: async (entry: EntryData) => {
              imageEntry = entry;
              return 'base64data';
            },
            generateVision: async () => successfulPackageResponse(),
            getFcmToken: async () => 'token-1',
            sendPush: async (message: { data: { entryId: string }; notification: { title: string } }) => {
              pushes.push(message);
            },
            getModelConfig: async () => ({ visionModel: 'test-model', confidenceThreshold: 0.8 }),
            appDisplayName: 'Calorix',
            mealPrompt: 'meal prompt',
            labelPrompt: 'label prompt',
            barcodePrompt: 'barcode prompt',
            fetchOffProduct: async () => null,
            log: () => {},
          } as unknown as AnalyzeEntryDeps;
          Reflect.set(analyzeDeps, 'analysisFieldDeletion', deletionSentinel);
          return analyzeDeps;
        },
      });

      await handleRetryEntryAnalysis('uid-1', 'entry-1', deps);

      expect(imageEntry).toMatchObject({
        uid: 'uid-1',
        status: 'pending',
        imageUrl: 'https://storage.example/scan.jpg',
        storagePath: 'scans/uid-1/entry-1.jpg',
        scanMode: 'label',
      });
      const doc = docs.get(entryPath);
      expect(analysisUpdates[1]?.per100Reference).toBe(deletionSentinel);
      expect(analysisUpdates[1]?.barcode).toBe(deletionSentinel);
      expect(doc?.fields).toMatchObject({
        uid: 'uid-1',
        date: '2026-09-07',
        status: 'complete',
        imageUrl: 'https://storage.example/scan.jpg',
        storagePath: 'scans/uid-1/entry-1.jpg',
        scanMode: 'label',
        foodName: 'Vitamin Well Reload',
        baseKcal: 85,
        baseProtein: 0,
        baseCarbs: 21,
        baseFat: 0,
        nutritionBasis: 'package',
        nutritionAmount: 500,
        nutritionUnit: 'ml',
        consumedAmount: 500,
      });
      for (const key of [
        'packageUnitCount', 'unitAmount', 'per100Reference', 'servingReference', 'modelBarcode', 'confirmedBarcode', 'barcode',
        'errorCode', 'errorMessage', 'servingMultiplier', 'kcal', 'protein', 'carbs', 'fat',
      ]) expect(doc?.fields).not.toHaveProperty(key);
      expect(pushes).toHaveLength(1);
      expect(pushes[0]!.notification.title).toBe('Calorix finished your meal scan');
      expect(pushes[0]!.data).toEqual({ entryId: 'entry-1' });
    });
  });
});
