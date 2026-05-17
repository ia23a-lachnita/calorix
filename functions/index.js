const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { VertexAI } = require('@google-cloud/vertexai');
const fetch = require('node-fetch');

initializeApp();

const db = getFirestore();
const PROJECT_ID = 'calorix-xurschnell';
const LOCATION = 'us-central1';

exports.processFood = onDocumentCreated(
  {
    document: 'entries/{entryId}',
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 120,
  },
  async (event) => {
    const entryId = event.params.entryId;
    const data = event.data.data();

    if (data.status !== 'pending') return;

    const entryRef = db.collection('entries').doc(entryId);
    await entryRef.update({ status: 'processing' });

    try {
      // Download image from Storage
      const response = await fetch(data.imageUrl);
      const buffer = await response.buffer();
      const base64Image = buffer.toString('base64');

      // Vertex AI — uses Cloud Function service account, no API key needed
      const vertexAI = new VertexAI({ project: PROJECT_ID, location: LOCATION });
      const model = vertexAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const prompt = `You are a nutrition estimation AI. Analyze this food image and return JSON only:
{
  "foodName": string,
  "kcal": number,
  "protein": number,
  "carbs": number,
  "fat": number,
  "confidence": number (0.0-1.0),
  "detectedItems": [{ "name": string, "weight": number }],
  "boundingBox": { "x": number, "y": number, "width": number, "height": number }
}
Estimate for the portion shown. Use standard nutrition databases. Return ONLY valid JSON.`;

      const result = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
            ],
          },
        ],
      });

      const text = result.response.candidates[0].content.parts[0].text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Invalid Gemini response');

      const nutrition = JSON.parse(jsonMatch[0]);

      const date = new Date(data.timestamp?.toDate?.() || Date.now());
      const dateStr = date.toISOString().substring(0, 10);

      const batch = db.batch();

      batch.update(entryRef, {
        status: 'complete',
        foodName: nutrition.foodName,
        kcal: nutrition.kcal,
        protein: nutrition.protein,
        carbs: nutrition.carbs,
        fat: nutrition.fat,
        confidence: nutrition.confidence,
        detectedItems: nutrition.detectedItems || [],
        boundingBox: nutrition.boundingBox || null,
      });

      const dailyLogRef = db.collection('dailyLogs').doc(`${data.uid}_${dateStr}`);
      batch.set(
        dailyLogRef,
        {
          kcal: FieldValue.increment(nutrition.kcal),
          protein: FieldValue.increment(nutrition.protein),
          carbs: FieldValue.increment(nutrition.carbs),
          fat: FieldValue.increment(nutrition.fat),
          entryCount: FieldValue.increment(1),
        },
        { merge: true }
      );

      await batch.commit();

      // Send FCM push notification
      const userDoc = await db.collection('users').doc(data.uid).get();
      const fcmToken = userDoc.data()?.fcmToken;

      if (fcmToken) {
        await getMessaging().send({
          token: fcmToken,
          notification: {
            title: 'Calorix finished your meal scan',
            body: `${nutrition.foodName} · ${Math.round(nutrition.kcal)} kcal`,
          },
          data: { entryId },
          android: { priority: 'high' },
        });
      }
    } catch (error) {
      console.error('processFood error:', error);
      await entryRef.update({ status: 'error', errorMessage: error.message });
    }
  }
);
