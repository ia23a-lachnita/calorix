import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import {
  handleRetryEntryAnalysis,
  RetryAnalysisError,
  type RetryAnalysisDeps,
} from '../src/retry-analysis';
import type { AnalyzeEntryDeps, EntryData } from '../src/analyze-entry';

// ---------------------------------------------------------------------------
// Gate: fail fast if FIRESTORE_EMULATOR_HOST is missing — never connect to production
// ---------------------------------------------------------------------------

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!EMULATOR_HOST) {
  throw new Error(
    'FIRESTORE_EMULATOR_HOST is not set. ' +
    'This test must run inside firebase emulators:exec or with the env var explicitly set. ' +
    'Never silently connect to production.',
  );
}

// ---------------------------------------------------------------------------
// Firebase Admin init — project ID is irrelevant for emulator but required by SDK
// ---------------------------------------------------------------------------

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'calorix-emulator-test';

if (!admin.apps.length) {
  admin.initializeApp({ projectId: PROJECT_ID });
}

const db = admin.firestore();
db.settings({ host: EMULATOR_HOST, ssl: false });

// ---------------------------------------------------------------------------
// Unique test identifiers — avoid collision across parallel runs
// ---------------------------------------------------------------------------

const TEST_UID = `emulator-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ENTRY_ID = `entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// ---------------------------------------------------------------------------
// Cleanup — delete seeded entries, then user doc; never swallow errors silently
// ---------------------------------------------------------------------------

afterAll(async () => {
  const userRef = db.collection('users').doc(TEST_UID);
  const entriesSnap = await userRef.collection('entries').get();
  const batch = db.batch();
  entriesSnap.docs.forEach((doc) => batch.delete(doc.ref));
  batch.delete(userRef);
  await batch.commit();
});

// ---------------------------------------------------------------------------
// Seed data — representative fields for a failed scan entry
// ---------------------------------------------------------------------------

const SEED_DATA = {
  status: 'error',
  imageUrl: 'https://storage.example.com/scans/test-image.jpg',
  storagePath: 'scans/emulator-test/image.jpg',
  scanMode: 'meal',
  rawBarcode: '5901234123457',
  date: '2026-07-28',
  errorMessage: 'Vision model timeout',
  uid: TEST_UID,
  baseKcal: 350,
  baseProtein: 25,
  baseCarbs: 40,
  baseFat: 12,
  servingMultiplier: 1.5,
  mealType: 'lunch',
  confidence: 0.92,
};

// ---------------------------------------------------------------------------
// Real Firestore deps — wired to the emulator via firebase-admin
// ---------------------------------------------------------------------------

function buildRealFirestoreDeps(
  analyzeCalls: Array<{ entryId: string; data: EntryData }>,
): RetryAnalysisDeps {
  return {
    runTransaction: (fn) => db.runTransaction(fn),
    entryRef: (uid: string, entryId: string) =>
      db.collection('users').doc(uid).collection('entries').doc(entryId),
    analyzeEntry: async (entryId: string, data: EntryData, _deps: AnalyzeEntryDeps) => {
      analyzeCalls.push({ entryId, data });
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
  };
}

// ---------------------------------------------------------------------------
// Single consolidated test — eliminates cross-test shared state
// ---------------------------------------------------------------------------

describe('handleRetryEntryAnalysis — emulator integration', () => {
  const entryPath = db.collection('users').doc(TEST_UID).collection('entries').doc(ENTRY_ID);

  beforeAll(async () => {
    await entryPath.set(SEED_DATA);
  });

  it('races two concurrent calls: exactly one fulfilled, one rejected, preserves all fields', async () => {
    const analyzeCalls: Array<{ entryId: string; data: EntryData }> = [];
    const deps = buildRealFirestoreDeps(analyzeCalls);

    const results = await Promise.allSettled([
      handleRetryEntryAnalysis(TEST_UID, ENTRY_ID, deps),
      handleRetryEntryAnalysis(TEST_UID, ENTRY_ID, deps),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly one fulfilled, one rejected with typed failed-precondition
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const rejectedReason = (rejected[0] as PromiseRejectedResult).reason;
    expect(rejectedReason).toBeInstanceOf(RetryAnalysisError);
    expect((rejectedReason as RetryAnalysisError).code).toBe('failed-precondition');

    // Exactly one analyze call was made
    expect(analyzeCalls).toHaveLength(1);

    // Analyze call carries expected claimed data
    const call = analyzeCalls[0];
    expect(call.entryId).toBe(ENTRY_ID);
    expect(call.data.uid).toBe(TEST_UID);
    expect(call.data.status).toBe('pending');
    expect(call.data.imageUrl).toBe(SEED_DATA.imageUrl);
    expect(call.data.storagePath).toBe(SEED_DATA.storagePath);
    expect(call.data.scanMode).toBe(SEED_DATA.scanMode);
    expect(call.data.rawBarcode).toBe(SEED_DATA.rawBarcode);

    // Final persisted status is pending
    const docSnap = await entryPath.get();
    expect(docSnap.exists).toBe(true);
    expect(docSnap.data()?.status).toBe('pending');

    // All unrelated seeded fields preserved
    const data = docSnap.data()!;
    expect(data.imageUrl).toBe(SEED_DATA.imageUrl);
    expect(data.storagePath).toBe(SEED_DATA.storagePath);
    expect(data.scanMode).toBe(SEED_DATA.scanMode);
    expect(data.rawBarcode).toBe(SEED_DATA.rawBarcode);
    expect(data.date).toBe(SEED_DATA.date);
    expect(data.errorMessage).toBe(SEED_DATA.errorMessage);
    expect(data.baseKcal).toBe(SEED_DATA.baseKcal);
    expect(data.baseProtein).toBe(SEED_DATA.baseProtein);
    expect(data.baseCarbs).toBe(SEED_DATA.baseCarbs);
    expect(data.baseFat).toBe(SEED_DATA.baseFat);
    expect(data.servingMultiplier).toBe(SEED_DATA.servingMultiplier);
    expect(data.mealType).toBe(SEED_DATA.mealType);
    expect(data.confidence).toBe(SEED_DATA.confidence);
  });
});
