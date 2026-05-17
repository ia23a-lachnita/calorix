const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { getMessaging } = require('firebase-admin/messaging');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fetch = require('node-fetch');

initializeApp();

const db = getFirestore();
const storage = getStorage();

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

    // Mark as processing
    await entryRef.update({ status: 'processing' });

    try {
      // Download image from Storage
      const imageUrl = data.imageUrl;
      const response = await fetch(imageUrl);
      const buffer = await response.buffer();
      const base64Image = buffer.toString('base64');

      // Call Gemini Vision API
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

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

      const result = await model.generateContent([
        prompt,
        { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
      ]);

      const text = result.response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Invalid Gemini response');

      const nutrition = JSON.parse(jsonMatch[0]);

      // Update Firestore
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

      // Upsert daily log
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
      const userRef = db.collection('users').doc(data.uid);
      const userDoc = await userRef.get();
      const fcmToken = userDoc.data()?.fcmToken;

      if (fcmToken) {
        await getMessaging().send({
          token: fcmToken,
          notification: {
            title: 'Calorix finished your meal scan',
            body: `${nutrition.foodName} · ${Math.round(nutrition.kcal)} kcal`,
          },
          data: {
            docId: entryId,
            entryId: entryId,
          },
          android: { priority: 'high' },
          apns: { payload: { aps: { sound: 'default' } } },
        });
      }
    } catch (error) {
      console.error('processFood error:', error);
      await entryRef.update({ status: 'error', errorMessage: error.message });
    }
  }
);
