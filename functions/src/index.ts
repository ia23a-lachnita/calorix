import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getStorage } from 'firebase-admin/storage';
import { VertexAI } from '@google-cloud/vertexai';
import { APP_DISPLAY_NAME, LOCATION, PROJECT_ID } from './config';
import { MEAL_ANALYSIS_PROMPT } from './prompts';
import { affectedDateKeys, summarizeCompleteEntries, type AggregatableEntry } from './aggregation';
import { createModelConfigLoader } from './model-config';
import { handleEntryCreated, type AnalyzeEntryDeps, type EntryData } from './analyze-entry';

initializeApp();

const db = getFirestore();
const vertexAI = new VertexAI({ project: PROJECT_ID, location: LOCATION });

const getModelConfig = createModelConfigLoader(async () => {
  const doc = await db.doc('model_configs/default').get();
  return doc.data();
});

function entriesCollection(uid: string) {
  return db.collection('users').doc(uid).collection('entries');
}

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
    };

    const entryRef = entriesCollection(uid).doc(entryId);

    const deps: AnalyzeEntryDeps = {
      updateEntry: async (fields) => {
        await entryRef.update(fields);
      },
      getFcmToken: async (userId) => {
        const userDoc = await db.collection('users').doc(userId).get();
        const token = userDoc.data()?.fcmToken;
        return typeof token === 'string' && token.length > 0 ? token : undefined;
      },
      loadImageBase64: async (data) => {
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
      generateVision: async (model, prompt, imageBase64) => {
        const generativeModel = vertexAI.getGenerativeModel({ model });
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
      getModelConfig,
      appDisplayName: APP_DISPLAY_NAME,
      prompt: MEAL_ANALYSIS_PROMPT,
      log: (message, error) => console.error(message, error),
    };

    await handleEntryCreated(entryId, entry, deps);
  },
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
