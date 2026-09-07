const RESULT_CONTRACT = `Return ONLY valid JSON. All raw nutrient fields are required and must be finite nonnegative numbers:
{
  "name": string,
  "kcal": number,
  "proteinG": number,
  "carbsG": number,
  "fatG": number,
  "confidence": number from 0 to 1,
  "candidates": [{ "name": string, "confidence": number, "kcal": number, "proteinG": number, "carbsG": number, "fatG": number }],
  "barcode": string of 8 to 14 digits or null,
  "detectedItems": [{ "name": string, "weight": number }],
  "boundingBox": { "x": number, "y": number, "width": number, "height": number } or null,
  "nutritionBasis": "portion" | "package" | "per100g",
  "nutritionAmount": number,
  "nutritionUnit": "portion" | "g" | "ml"
}
Reference objects have exactly kcal, proteinG, carbsG, fatG, amount, and unit.`;

export const MEAL_ANALYSIS_PROMPT = `Analyze the photographed meal. Estimate the full visible portion only. Return exactly "nutritionBasis": "portion", "nutritionAmount": 1, and "nutritionUnit": "portion". Return "barcode": null. Do not return observed package evidence or package/per-100/serving references. ${RESULT_CONTRACT}`;

const PACKAGE_EVIDENCE = `Target the complete physical package, never only a manufacturer serving. Report observed package amount from the image as observedPackageAmount and observedPackageUnit; do not invent a package amount when it is not visible. barcode is nullable and is only model-observed, never database-confirmed. The top-level kcal, proteinG, carbsG, and fatG must match the selected reference; any optional package totals must match the server recomputation from per100Reference. For "nutritionBasis": "package", use the declared package amount/unit and include "packageReference" with that exact amount/unit. For "nutritionBasis": "per100g", use "nutritionAmount": 100 with g or ml, include "per100Reference" exactly per 100 of the same unit, and include observed whole-package evidence. For "nutritionBasis": "portion", use "nutritionAmount": 1 and "nutritionUnit": "portion" and include "servingReference" with the same nutrient vector; it may include observed package evidence but never invent a count of servings. packageReference, per100Reference, and servingReference each contain kcal, proteinG, carbsG, fatG, amount, and unit.`;

export const LABEL_ANALYSIS_PROMPT = `Read this nutrition label and product. ${PACKAGE_EVIDENCE} ${RESULT_CONTRACT}`;

export const BARCODE_ANALYSIS_PROMPT = `Read the visible product barcode and nutrition evidence as a review fallback. ${PACKAGE_EVIDENCE} ${RESULT_CONTRACT}`;
