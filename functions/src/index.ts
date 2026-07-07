import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { VertexAI } from '@google-cloud/vertexai';
import { APP_DISPLAY_NAME, LOCATION, PROJECT_ID, VISION_MODEL } from './config';
import { MEAL_ANALYSIS_PROMPT } from './prompts';
import { handleEntryCreated, type AnalyzeEntryDeps, type EntryData } from './analyze-entry';

initializeApp();

const db = getFirestore();

interface FirestoreTimestampLike {
  toDate(): Date;
}

function hasToDate(value: unknown): value is FirestoreTimestampLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as FirestoreTimestampLike).toDate === 'function'
  );
}

export const processFood = onDocumentCreated(
  {
    document: 'entries/{entryId}',
    region: LOCATION,
    memory: '512MiB',
    timeoutSeconds: 120,
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    const entryId = event.params.entryId;
    const raw = snapshot.data();

    const entry: EntryData = {
      uid: String(raw.uid ?? ''),
      status: String(raw.status ?? ''),
      imageUrl: String(raw.imageUrl ?? ''),
      ...(hasToDate(raw.timestamp) ? { timestampMs: raw.timestamp.toDate().getTime() } : {}),
    };

    const entryRef = db.collection('entries').doc(entryId);
    const vertexAI = new VertexAI({ project: PROJECT_ID, location: LOCATION });
    const model = vertexAI.getGenerativeModel({ model: VISION_MODEL });

    const deps: AnalyzeEntryDeps = {
      updateEntry: async (fields) => {
        await entryRef.update(fields);
      },
      commitCompletion: async ({ entryFields, dailyLogId, delta }) => {
        const batch = db.batch();
        batch.update(entryRef, entryFields);
        batch.set(
          db.collection('dailyLogs').doc(dailyLogId),
          {
            kcal: FieldValue.increment(delta.kcal),
            protein: FieldValue.increment(delta.protein),
            carbs: FieldValue.increment(delta.carbs),
            fat: FieldValue.increment(delta.fat),
            entryCount: FieldValue.increment(delta.entryCount),
          },
          { merge: true },
        );
        await batch.commit();
      },
      getFcmToken: async (uid) => {
        const userDoc = await db.collection('users').doc(uid).get();
        const token = userDoc.data()?.fcmToken;
        return typeof token === 'string' && token.length > 0 ? token : undefined;
      },
      fetchImageBase64: async (imageUrl) => {
        const response = await fetch(imageUrl);
        if (!response.ok) {
          throw new Error(`Image download failed (HTTP ${response.status})`);
        }
        const bytes = await response.arrayBuffer();
        return Buffer.from(bytes).toString('base64');
      },
      generateVision: async (prompt, imageBase64) => {
        const result = await model.generateContent({
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
      now: () => new Date(),
      appDisplayName: APP_DISPLAY_NAME,
      prompt: MEAL_ANALYSIS_PROMPT,
      log: (message, error) => console.error(message, error),
    };

    await handleEntryCreated(entryId, entry, deps);
  },
);
