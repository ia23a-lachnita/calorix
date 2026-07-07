export const MEAL_ANALYSIS_PROMPT = `You are a nutrition estimation AI. Analyze this food image and return JSON only:
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
