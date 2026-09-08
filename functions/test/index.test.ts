import { beforeAll, describe, expect, it, vi } from 'vitest';

const firebaseMocks = vi.hoisted(() => {
  const dailyLogRef = { set: vi.fn(), delete: vi.fn() };
  const entriesQuery = { where: vi.fn(), get: vi.fn() };
  entriesQuery.where.mockReturnValue(entriesQuery);
  const userDoc = {
    collection: vi.fn((name: string) => name === 'entries'
      ? entriesQuery
      : { doc: vi.fn(() => dailyLogRef) }),
  };
  const db = {
    collection: vi.fn(() => ({ doc: vi.fn(() => userDoc) })),
    doc: vi.fn(() => ({ get: vi.fn() })),
  };
  return {
    db,
    dailyLogRef,
    entriesQuery,
    getFirestore: vi.fn(() => db),
    initializeApp: vi.fn(),
    onCall: vi.fn((_options, handler) => handler),
    onDocumentCreated: vi.fn((_options, handler) => handler),
    onDocumentWritten: vi.fn((_options, handler) => handler),
    entriesCollection: vi.fn(() => entriesQuery),
  };
});

vi.mock('firebase-admin/app', () => ({ initializeApp: firebaseMocks.initializeApp }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: firebaseMocks.getFirestore }));
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentCreated: firebaseMocks.onDocumentCreated,
  onDocumentWritten: firebaseMocks.onDocumentWritten,
}));
vi.mock('firebase-functions/v2/https', () => ({ onCall: firebaseMocks.onCall }));
vi.mock('../src/genai-adapter', () => ({
  createGenAIAdapter: vi.fn(() => ({ generateChat: vi.fn(), generateVision: vi.fn() })),
}));
vi.mock('../src/ai-chat-firestore', () => ({
  createFirestoreAiChatDeps: vi.fn(() => ({})),
}));
vi.mock('../src/ai-chat-callable', () => ({
  createAiChatCallableHandler: vi.fn(() => vi.fn()),
}));
vi.mock('../src/retry-analysis', () => ({
  buildAnalyzeEntryDepsFactory: vi.fn(),
  createRetryEntryAnalysisHandler: vi.fn(() => vi.fn()),
  entriesCollection: firebaseMocks.entriesCollection,
}));

type ToAggregatableEntry = (data: Record<string, unknown>) => Record<string, unknown>;
type ToEntryData = (uid: string, data: Record<string, unknown>) => Record<string, unknown>;

let toAggregatableEntry: ToAggregatableEntry;
let toEntryData: ToEntryData;

beforeAll(async () => {
  const index = await import('../src/index');
  toAggregatableEntry = index.toAggregatableEntry as ToAggregatableEntry;
  toEntryData = index.toEntryData as ToEntryData;
});

describe('toAggregatableEntry', () => {
  it('preserves a valid canonical aggregation contract verbatim', () => {
    const source = {
      status: 'complete',
      baseKcal: 85,
      baseProtein: 10,
      baseCarbs: 21,
      baseFat: 4,
      nutritionBasis: 'package',
      nutritionAmount: 500,
      nutritionUnit: 'ml',
      consumedAmount: 250,
    };

    expect(toAggregatableEntry(source)).toEqual(source);
  });

  it('does not inject canonical fields or a serving multiplier into a legacy entry', () => {
    const source = {
      status: 'complete',
      kcal: 100,
      protein: 20,
      carbs: 30,
      fat: 10,
    };

    expect(toAggregatableEntry(source)).toEqual(source);
  });

  it('preserves malformed own aggregation fields so downstream validation fails closed', async () => {
    const source = {
      status: 'complete',
      baseKcal: 85,
      baseProtein: 10,
      baseCarbs: 21,
      baseFat: 4,
      nutritionBasis: 'package',
    };
    const { summarizeCompleteEntries } = await import('../src/aggregation');

    expect(toAggregatableEntry(source)).toEqual(source);
    expect(() => summarizeCompleteEntries([toAggregatableEntry(source)])).toThrow();
  });

  it('preserves every own aggregation field, including malformed values and servingMultiplier', () => {
    const source: Record<string, unknown> = {
      status: 'complete',
      baseKcal: 'bad',
      baseProtein: null,
      baseCarbs: {},
      baseFat: [],
      kcal: 'legacy-bad',
      protein: null,
      carbs: [],
      fat: {},
      servingMultiplier: 'bad',
      nutritionBasis: 123,
      nutritionAmount: 'bad',
      nutritionUnit: null,
      consumedAmount: {},
    };
    const mapped = toAggregatableEntry(source);

    expect(mapped).toEqual(source);
    for (const key of Object.keys(source)) {
      expect(Object.prototype.hasOwnProperty.call(mapped, key)).toBe(true);
      expect(mapped[key]).toBe(source[key]);
    }
  });
});

describe('aggregateDailyLogs', () => {
  it('maps canonical snapshots through to canonical daily totals and write', async () => {
    firebaseMocks.entriesQuery.get.mockResolvedValue({
      docs: [{
        data: () => ({
          status: 'complete',
          baseKcal: 85,
          baseProtein: 10,
          baseCarbs: 21,
          baseFat: 4,
          nutritionBasis: 'package',
          nutritionAmount: 500,
          nutritionUnit: 'ml',
          consumedAmount: 250,
          servingMultiplier: 9,
        }),
      }],
    });
    firebaseMocks.dailyLogRef.set.mockClear();

    const { aggregateDailyLogs } = await import('../src/index');
    const event = {
      params: { uid: 'user-1' },
      data: {
        before: { data: () => undefined },
        after: { data: () => ({ date: '2026-07-07' }) },
      },
    };

    await aggregateDailyLogs(event as Parameters<typeof aggregateDailyLogs>[0]);

    expect(firebaseMocks.entriesCollection).toHaveBeenCalledWith('user-1');
    expect(firebaseMocks.entriesQuery.where).toHaveBeenCalledWith('date', '==', '2026-07-07');
    expect(firebaseMocks.entriesQuery.where).toHaveBeenCalledWith('status', '==', 'complete');
    expect(firebaseMocks.dailyLogRef.set).toHaveBeenCalledWith({
      kcal: 42.5,
      protein: 5,
      carbs: 10.5,
      fat: 2,
      entryCount: 1,
      date: '2026-07-07',
    });
  });
});

describe('toEntryData', () => {
  it('uses only rawBarcode when mapping a callable entry request', () => {
    expect(toEntryData('user-1', {
      status: 'pending',
      imageUrl: 'https://example.com/scan.jpg',
      storagePath: 'entries/user-1/scan.jpg',
      scanMode: 'barcode',
      rawBarcode: 'raw-123',
      modelBarcode: 'model-456',
      confirmedBarcode: 'confirmed-789',
      barcode: 'legacy-000',
    })).toEqual({
      uid: 'user-1',
      status: 'pending',
      imageUrl: 'https://example.com/scan.jpg',
      storagePath: 'entries/user-1/scan.jpg',
      scanMode: 'barcode',
      rawBarcode: 'raw-123',
    });
  });

  it('does not infer a raw barcode from model, confirmed, or legacy barcode fields', () => {
    const mapped = toEntryData('user-1', {
      status: 'pending',
      modelBarcode: 'model-456',
      confirmedBarcode: 'confirmed-789',
      barcode: 'legacy-000',
    });

    expect(mapped).toEqual({ uid: 'user-1', status: 'pending' });
    expect(mapped).not.toHaveProperty('rawBarcode');
  });
});
