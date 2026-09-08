import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onCall } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { APP_DISPLAY_NAME, LOCATION, PROJECT_ID } from './config';
import { affectedDateKeys, summarizeCompleteEntries, type AggregatableEntry } from './aggregation';
import { createModelConfigLoader } from './model-config';
import { handleEntryCreated, type EntryData } from './analyze-entry';
import { createFirestoreAiChatDeps } from './ai-chat-firestore';
import { createAiChatCallableHandler } from './ai-chat-callable';
import { createGenAIAdapter } from './genai-adapter';
import {
  createRetryEntryAnalysisHandler,
  entriesCollection,
} from './retry-analysis';

initializeApp();

const db = getFirestore();
const genAIAdapter = createGenAIAdapter({ project: PROJECT_ID, location: LOCATION });

const getModelConfig = createModelConfigLoader(async () => {
  const doc = await db.doc('model_configs/default').get();
  return doc.data();
});

const aiChatDeps = createFirestoreAiChatDeps({
  db,
  getModelConfig,
  appDisplayName: APP_DISPLAY_NAME,
  generateChat: (model, contents) => genAIAdapter.generateChat(model, contents),
});

function dailyLogDoc(uid: string, dateKey: string) {
  return db.collection('users').doc(uid).collection('dailyLogs').doc(dateKey);
}

const AGGREGATABLE_ENTRY_FIELDS = [
  'baseKcal',
  'baseProtein',
  'baseCarbs',
  'baseFat',
  'kcal',
  'protein',
  'carbs',
  'fat',
  'servingMultiplier',
  'nutritionBasis',
  'nutritionAmount',
  'nutritionUnit',
  'consumedAmount',
] as const;

function hasOwn(data: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(data, key);
}

/** Maps exactly the fields that the daily aggregation contract consumes. */
export function toAggregatableEntry(data: Record<string, unknown>): AggregatableEntry {
  const entry: AggregatableEntry & Record<string, unknown> = {status: String(data.status ?? '')};
  for (const field of AGGREGATABLE_ENTRY_FIELDS) {
    if (hasOwn(data, field)) entry[field] = data[field];
  }
  return entry;
}

/** Maps the raw entry request used for analysis without inferring barcode provenance. */
export function toEntryData(uid: string, data: Record<string, unknown>): EntryData {
  return {
    uid,
    status: String(data.status ?? ''),
    ...(typeof data.imageUrl === 'string' ? {imageUrl: data.imageUrl} : {}),
    ...(typeof data.storagePath === 'string' ? {storagePath: data.storagePath} : {}),
    ...(typeof data.scanMode === 'string' ? {scanMode: data.scanMode} : {}),
    ...(typeof data.rawBarcode === 'string' ? {rawBarcode: data.rawBarcode} : {}),
  };
}

export const processEntry = onDocumentCreated(
  {
    document: 'users/{uid}/entries/{entryId}',
    region: LOCATION,
    memory: '512MiB',
    timeoutSeconds: 120,
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    const { uid, entryId } = event.params;
    const raw = snapshot.data();

    const entry = toEntryData(uid, raw);

    // Lazy import avoids circular dependency at module load time:
    // retry-analysis.ts exports entriesCollection used by aggregateDailyLogs,
    // and this module exports retryEntryAnalysis from retry-analysis.ts.
    const { buildAnalyzeEntryDepsFactory } = await import('./retry-analysis');
    const deps = buildAnalyzeEntryDepsFactory(uid, entryId);

    await handleEntryCreated(entryId, entry, deps);
  },
);

/**
 * Server-side assistant chat: the client never holds a model credential.
 * Model selection stays in model_configs/default (same TTL-cached loader as
 * analysis); auth is required so usage is always attributable to a user.
 */
const aiChatHandler = createAiChatCallableHandler({
  coreDeps: aiChatDeps,
  logger: {
    log(entry) {
      console.error(entry);
    },
  },
});

export const aiChat = onCall(
  {
    region: LOCATION,
    timeoutSeconds: 60,
  },
  (request) => aiChatHandler(request),
);

export const retryEntryAnalysis = onCall(
  {
    region: LOCATION,
    timeoutSeconds: 120,
  },
  createRetryEntryAnalysisHandler(),
);

/**
 * Keeps users/{uid}/dailyLogs/{date} consistent with entry state by
 * recomputing absolute totals for every affected calendar day. Recomputation
 * (instead of increments) makes retries and out-of-order delivery harmless.
 */
export const aggregateDailyLogs = onDocumentWritten(
  {
    document: 'users/{uid}/entries/{entryId}',
    region: LOCATION,
    timeoutSeconds: 60,
  },
  async (event) => {
    const { uid } = event.params;
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    const dateKeys = affectedDateKeys(before?.date, after?.date);

    for (const dateKey of dateKeys) {
      const snapshot = await entriesCollection(uid)
        .where('date', '==', dateKey)
        .where('status', '==', 'complete')
        .get();
      const entries: AggregatableEntry[] = snapshot.docs.map((doc) => toAggregatableEntry(doc.data()));
      const totals = summarizeCompleteEntries(entries);
      const logRef = dailyLogDoc(uid, dateKey);
      if (totals.entryCount === 0) {
        await logRef.delete();
      } else {
        await logRef.set({ ...totals, date: dateKey });
      }
    }
  },
);
