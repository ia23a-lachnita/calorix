import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { VertexAI } from '@google-cloud/vertexai';
import { APP_DISPLAY_NAME, LOCATION, PROJECT_ID } from './config';
import { affectedDateKeys, summarizeCompleteEntries, type AggregatableEntry } from './aggregation';
import { createModelConfigLoader } from './model-config';
import { handleEntryCreated, type EntryData } from './analyze-entry';
import { AiChatInputError, handleAiChat, type ChatContent } from './ai-chat';
import {
  createRetryEntryAnalysisHandler,
  entriesCollection,
} from './retry-analysis';

initializeApp();

const db = getFirestore();
const vertexAI = new VertexAI({ project: PROJECT_ID, location: LOCATION });

const getModelConfig = createModelConfigLoader(async () => {
  const doc = await db.doc('model_configs/default').get();
  return doc.data();
});

function dailyLogDoc(uid: string, dateKey: string) {
  return db.collection('users').doc(uid).collection('dailyLogs').doc(dateKey);
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

    const entry: EntryData = {
      uid,
      status: String(raw.status ?? ''),
      ...(typeof raw.imageUrl === 'string' ? { imageUrl: raw.imageUrl } : {}),
      ...(typeof raw.storagePath === 'string' ? { storagePath: raw.storagePath } : {}),
      ...(typeof raw.scanMode === 'string' ? { scanMode: raw.scanMode } : {}),
      ...(typeof raw.rawBarcode === 'string' ? { rawBarcode: raw.rawBarcode } : {}),
    };

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
export const aiChat = onCall(
  {
    region: LOCATION,
    timeoutSeconds: 60,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in to use the assistant.');
    }
    try {
      return await handleAiChat(request.data, {
        getModelConfig,
        appDisplayName: APP_DISPLAY_NAME,
        generateChat: async (model: string, contents: ChatContent[]) => {
          const generativeModel = vertexAI.getGenerativeModel({ model });
          const result = await generativeModel.generateContent({ contents });
          const parts = result.response.candidates?.[0]?.content?.parts ?? [];
          return parts.map((part) => part.text ?? '').join('');
        },
      });
    } catch (error) {
      if (error instanceof AiChatInputError) {
        throw new HttpsError('invalid-argument', error.message);
      }
      console.error('aiChat error:', error);
      throw new HttpsError('unavailable', 'The assistant is temporarily unavailable.');
    }
  },
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
      const entries: AggregatableEntry[] = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          status: String(data.status ?? ''),
          ...(typeof data.baseKcal === 'number' ? { baseKcal: data.baseKcal } : {}),
          ...(typeof data.baseProtein === 'number'
            ? { baseProtein: data.baseProtein }
            : {}),
          ...(typeof data.baseCarbs === 'number'
            ? { baseCarbs: data.baseCarbs }
            : {}),
          ...(typeof data.baseFat === 'number' ? { baseFat: data.baseFat } : {}),
          kcal: typeof data.kcal === 'number' ? data.kcal : 0,
          protein: typeof data.protein === 'number' ? data.protein : 0,
          carbs: typeof data.carbs === 'number' ? data.carbs : 0,
          fat: typeof data.fat === 'number' ? data.fat : 0,
          servingMultiplier:
            typeof data.servingMultiplier === 'number' ? data.servingMultiplier : 1,
        };
      });
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
