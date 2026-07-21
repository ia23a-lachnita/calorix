const RESULT_CONTRACT = `Return ONLY valid JSON with this exact shape:
{
  "name": string,
  "kcal": number,
  "proteinG": number,
  "carbsG": number,
  "fatG": number,
  "confidence": number,
  "candidates": [{
    "name": string,
    "confidence": number,
    "kcal": number,
    "proteinG": number,
    "carbsG": number,
    "fatG": number
  }],
  "detectedItems": [{ "name": string, "weight": number }],
  "boundingBox": { "x": number, "y": number, "width": number, "height": number } | null
}`;

export const MEAL_ANALYSIS_PROMPT = `Analyze the photographed meal and estimate nutrition for the full portion shown. Use visible ingredients, portion size, and standard nutrition references. Give the best estimate plus plausible alternatives when the image is ambiguous. ${RESULT_CONTRACT}`;

export const LABEL_ANALYSIS_PROMPT = `Read the nutrition label in this image. Return the per-serving values printed on the label, not per-package or per-100g values unless the label defines those as one serving. Preserve uncertainty in confidence and candidates. ${RESULT_CONTRACT}`;

export const BARCODE_ANALYSIS_PROMPT = `Read the product barcode from this image and estimate the visible product nutrition only as a review fallback. Include a top-level "barcode" containing 8 to 14 digits when readable. Never claim database confirmation. ${RESULT_CONTRACT}`;
