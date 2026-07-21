import type { DocumentReference, Transaction } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getStorage } from 'firebase-admin/storage';
import { VertexAI } from '@google-cloud/vertexai';
import { APP_DISPLAY_NAME, LOCATION, PROJECT_ID } from './config';
import {
  BARCODE_ANALYSIS_PROMPT,
  LABEL_ANALYSIS_PROMPT,
  MEAL_ANALYSIS_PROMPT,
} from './prompts';
import { fetchOffProduct } from './off-client';
import { createModelConfigLoader } from './model-config';
import { handleEntryCreated, type AnalyzeEntryDeps, type EntryData } from './analyze-entry';
import { getFirestore } from 'firebase-admin/firestore';

// ---------------------------------------------------------------------------
// Typed error
// ---------------------------------------------------------------------------

export type RetryAnalysisErrorCode =
  | 'unauthenticated'
  | 'invalid-argument'
  | 'not-found'
  | 'failed-precondition';

export class RetryAnalysisError extends Error {
  constructor(
    readonly code: RetryAnalysisErrorCode,
    message: string,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Dependency injection
// ---------------------------------------------------------------------------

export interface RetryAnalysisDeps {
  runTransaction<T>(fn: (txn: Transaction) => Promise<T>): Promise<T>;
  entryRef(uid: string, entryId: string): DocumentReference;
  analyzeEntry(entryId: string, data: EntryData, deps: AnalyzeEntryDeps): Promise<void>;
  buildAnalyzeDeps(uid: string, entryId: string): AnalyzeEntryDeps;
}

// ---------------------------------------------------------------------------
// Shared dependency factory (reused by processEntry and retryEntryAnalysis)
// ---------------------------------------------------------------------------

// Lazy initialization — avoids module-level Firebase calls so tests can import
// handleRetryEntryAnalysis / RetryAnalysisError without initializeApp().
let _db: ReturnType<typeof getFirestore> | null = null;
function getDb() {
  if (!_db) _db = getFirestore();
  return _db;
}

let _vertexAI: InstanceType<typeof VertexAI> | null = null;
function getVertexAI() {
  if (!_vertexAI) _vertexAI = new VertexAI({ project: PROJECT_ID, location: LOCATION });
  return _vertexAI;
}

let _getModelConfig: ReturnType<typeof createModelConfigLoader> | null = null;
function getModelConfig() {
  if (!_getModelConfig) {
    _getModelConfig = createModelConfigLoader(async () => {
      const doc = await getDb().doc('model_configs/default').get();
      return doc.data();
    });
  }
  return _getModelConfig;
}

export function entriesCollection(uid: string) {
  return getDb().collection('users').doc(uid).collection('entries');
}

export function buildAnalyzeEntryDepsFactory(
  uid: string,
  entryId: string,
): AnalyzeEntryDeps {
  const entryRef = entriesCollection(uid).doc(entryId);

  return {
    updateEntry: async (fields: Record<string, unknown>) => {
      await entryRef.update(fields);
    },
    getFcmToken: async (userId: string) => {
      const userDoc = await getDb().collection('users').doc(userId).get();
      const token = userDoc.data()?.fcmToken;
      return typeof token === 'string' && token.length > 0 ? token : undefined;
    },
    loadImageBase64: async (data: EntryData) => {
      if (data.storagePath) {
        const [bytes] = await getStorage().bucket().file(data.storagePath).download();
        return bytes.toString('base64');
      }
      if (data.imageUrl) {
        const response = await fetch(data.imageUrl);
        if (!response.ok) {
          throw new Error(`Image download failed (HTTP ${response.status})`);
        }
        return Buffer.from(await response.arrayBuffer()).toString('base64');
      }
      throw new Error('Entry has neither storagePath nor imageUrl');
    },
    generateVision: async (model: string, prompt: string, imageBase64: string) => {
      const generativeModel = getVertexAI().getGenerativeModel({ model });
      const result = await generativeModel.generateContent({
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
      const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text !== 'string' || text.length === 0) {
        throw new Error('Empty model response');
      }
      return text;
    },
    sendPush: async (message) => {
      await getMessaging().send(message);
    },
    fetchOffProduct,
    getModelConfig: getModelConfig(),
    appDisplayName: APP_DISPLAY_NAME,
    mealPrompt: MEAL_ANALYSIS_PROMPT,
    labelPrompt: LABEL_ANALYSIS_PROMPT,
    barcodePrompt: BARCODE_ANALYSIS_PROMPT,
    log: (message: string, error?: unknown) => console.error(message, error),
  };
}

// ---------------------------------------------------------------------------
// Default deps — production wiring
// ---------------------------------------------------------------------------

function defaultRetryAnalysisDeps(): RetryAnalysisDeps {
  return {
    runTransaction: (fn) => getDb().runTransaction(fn),
    entryRef: (uid: string, entryId: string) => entriesCollection(uid).doc(entryId),
    analyzeEntry: handleEntryCreated,
    buildAnalyzeDeps: buildAnalyzeEntryDepsFactory,
  };
}

// ---------------------------------------------------------------------------
// Core handler — typed, testable, no direct Firestore imports in signature
// ---------------------------------------------------------------------------

export async function handleRetryEntryAnalysis(
  uid: string | undefined,
  entryId: unknown,
  deps: RetryAnalysisDeps,
): Promise<void> {
  if (!uid) {
    throw new RetryAnalysisError('unauthenticated', 'Sign in to retry analysis.');
  }
  if (typeof entryId !== 'string' || entryId.trim().length === 0) {
    throw new RetryAnalysisError('invalid-argument', 'A valid entryId is required.');
  }

  const entryRef = deps.entryRef(uid, entryId);
  const claimedEntry = await deps.runTransaction(async (txn) => {
    const snapshot = await txn.get(entryRef);

    if (!snapshot.exists) {
      throw new RetryAnalysisError('not-found', 'Entry not found.');
    }

    const entryData = snapshot.data() as Record<string, unknown> | undefined;
    const status = typeof entryData?.status === 'string' ? entryData.status : '';

    if (status !== 'error') {
      throw new RetryAnalysisError(
        'failed-precondition',
        `Cannot retry entry with status "${status}".`,
      );
    }

    txn.update(entryRef, { status: 'pending' });

    return {
      uid,
      status: 'pending',
      ...(typeof entryData?.imageUrl === 'string' ? { imageUrl: entryData.imageUrl } : {}),
      ...(typeof entryData?.storagePath === 'string'
        ? { storagePath: entryData.storagePath }
        : {}),
      ...(typeof entryData?.scanMode === 'string'
        ? { scanMode: entryData.scanMode }
        : {}),
      ...(typeof entryData?.rawBarcode === 'string'
        ? { rawBarcode: entryData.rawBarcode }
        : {}),
    };
  });

  const analyzeDeps = deps.buildAnalyzeDeps(uid, entryId);
  await deps.analyzeEntry(entryId, claimedEntry, analyzeDeps);
}

// ---------------------------------------------------------------------------
// onCall export — maps typed errors to HttpsError-compatible shape
// ---------------------------------------------------------------------------

export function createRetryEntryAnalysisHandler() {
  const deps = defaultRetryAnalysisDeps();
  return async (request: { auth?: { uid?: string }; data: unknown }): Promise<void> => {
    const data = request.data as Record<string, unknown> | undefined;
    const entryId = data?.entryId;
    try {
      await handleRetryEntryAnalysis(request.auth?.uid, entryId, deps);
    } catch (error) {
      if (error instanceof RetryAnalysisError) {
        const { HttpsError } = await import('firebase-functions/v2/https');
        throw new HttpsError(error.code, error.message);
      }
      throw error;
    }
  };
}
