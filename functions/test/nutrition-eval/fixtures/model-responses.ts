import type {
  NutritionEvalCase,
  NutritionPrediction,
} from '../../../src/nutrition-eval/schema';
import type { OffProduct } from '../../../src/off-client';

// ── SHA constants ────────────────────────────────────────────────────────────

export const SHA =
  '28f5fe26394586f124c04af2d22270d8a8079c141fc1f2b0fe80593d77ae2869';
export const LABEL_SHA =
  'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';
export const BARCODE_SHA =
  'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

// ── Eval cases ───────────────────────────────────────────────────────────────

export const mealCase: NutritionEvalCase = {
  id: 'meal-dish-1565035746',
  visibility: 'public',
  scanMode: 'meal',
  source: { dataset: 'nutrition5k', objectId: 'dish_1565035746' },
  image: {
    url: 'https://example.com/dish.png',
    sha256: SHA,
    mediaType: 'image/png',
    width: 640,
    height: 480,
  },
  truth: {
    basis: 'portion',
    amount: 1,
    unit: 'portion',
    kcal: 43.099998,
    proteinG: 2.409,
    carbsG: 9.01,
    fatG: 0.369,
  },
  toleranceClass: 'meal-estimate',
  attributionId: 'nutrition5k-cc-by-4.0',
};

export const labelCase: NutritionEvalCase = {
  id: 'label-3017624010701',
  visibility: 'public',
  scanMode: 'label',
  source: { dataset: 'off', objectId: '3017624010701' },
  image: {
    url: 'https://example.com/label.png',
    sha256: LABEL_SHA,
    mediaType: 'image/png',
    width: 400,
    height: 600,
  },
  truth: {
    basis: 'package',
    amount: 330,
    unit: 'ml',
    kcal: 138.6,
    proteinG: 0,
    carbsG: 34.98,
    fatG: 0,
  },
  toleranceClass: 'package-strict',
  attributionId: 'off-odbl',
};

export const barcodeCase: NutritionEvalCase = {
  id: 'barcode-5449000000996',
  visibility: 'public',
  scanMode: 'barcode',
  source: { dataset: 'off', objectId: '5449000000996' },
  image: {
    url: 'https://example.com/product.jpg',
    sha256: BARCODE_SHA,
    mediaType: 'image/jpeg',
    width: 400,
    height: 400,
  },
  truth: {
    basis: 'package',
    amount: 330,
    unit: 'ml',
    kcal: 138.6,
    proteinG: 0,
    carbsG: 34.98,
    fatG: 0,
  },
  toleranceClass: 'package-strict',
  attributionId: 'off-odbl',
  expectedBarcode: '5449000000996',
};

// ── Raw response TEXT (accepted by parseNutritionResponse) ────────────────────

export const MEAL_RESPONSE_TEXT = JSON.stringify({
  name: 'Rice dish',
  kcal: 43.099998,
  proteinG: 2.409,
  carbsG: 9.01,
  fatG: 0.369,
  confidence: 0.92,
});

export const LABEL_RESPONSE_TEXT = JSON.stringify({
  name: 'Cola drink',
  kcal: 138.6,
  proteinG: 0,
  carbsG: 34.98,
  fatG: 0,
  confidence: 0.88,
});

// ── OffProduct fixture (for barcode mapping) ─────────────────────────────────

export const OFF_BARCODE_PRODUCT: OffProduct = {
  name: 'Coca-Cola',
  kcalPer100g: 42,
  proteinPer100g: 0,
  carbsPer100g: 10.6,
  fatPer100g: 0,
};

// ── Prediction fixtures (derived from raw fixtures, missing basis/amount/unit) ─

export const okMealPrediction: NutritionPrediction = {
  parseStatus: 'success',
  source: 'meal',
  kcal: 43.099998,
  proteinG: 2.409,
  carbsG: 9.01,
  fatG: 0.369,
  confidence: 0.92,
  decision: 'complete',
};

export const okLabelPrediction: NutritionPrediction = {
  parseStatus: 'success',
  source: 'label',
  kcal: 138.6,
  proteinG: 0,
  carbsG: 34.98,
  fatG: 0,
  confidence: 0.88,
  decision: 'complete',
};

export const okBarcodePrediction: NutritionPrediction = {
  parseStatus: 'success',
  source: 'barcode',
  kcal: 42,
  proteinG: 0,
  carbsG: 10.6,
  fatG: 0,
  confidence: 0.95,
  barcode: '5449000000996',
  decision: 'complete',
};

export const schemaFailPrediction: NutritionPrediction = {
  parseStatus: 'failure',
  source: 'meal',
  decision: 'error',
  failureCategory: 'schema',
  failureCode: 'model_response_invalid',
};
