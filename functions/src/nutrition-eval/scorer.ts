import type {
  NutritionEvalCase,
  NutritionEvalReport,
  NutritionCaseResult,
  NutritionPrediction,
} from './schema';

const NUMERIC_FIELDS = ['kcal', 'proteinG', 'carbsG', 'fatG'] as const;

function computeMetric(pred: number, truth: number): {
  ratioToTruth: number;
  absoluteError: number;
  relativeError: number;
} {
  const denom = Math.max(Math.abs(truth), 1);
  const absoluteError = Math.abs(pred - truth);
  return {
    ratioToTruth: pred / denom,
    absoluteError,
    relativeError: absoluteError / denom,
  };
}

export function scoreNutritionCase(
  evalCase: NutritionEvalCase,
  prediction: NutritionPrediction,
): NutritionCaseResult {
  const numeric: NutritionCaseResult['numeric'] = {};
  for (const field of NUMERIC_FIELDS) {
    const predVal = prediction[field];
    const truthVal = evalCase.truth[field];
    if (prediction.parseStatus === 'success' && predVal != null) {
      numeric[field] = computeMetric(predVal, truthVal);
    }
  }

  const success = prediction.parseStatus === 'success';
  const predKcal = prediction.kcal;
  const catastrophic =
    success && predKcal != null
      ? predKcal < 0.5 * evalCase.truth.kcal || predKcal > 2.0 * evalCase.truth.kcal
      : false;

  const unsafe =
    (catastrophic && prediction.decision === 'complete') ||
    (evalCase.expectedDecision === 'needs_review' && prediction.decision === 'complete');

  const booleans: NutritionCaseResult['booleans'] = {};
  if (evalCase.expectedBarcode != null && prediction.barcode != null) {
    booleans.barcodeExactMatch = prediction.barcode === evalCase.expectedBarcode;
  }
  if (prediction.basis != null) {
    booleans.basisExactMatch = prediction.basis === evalCase.truth.basis;
  }
  if (prediction.unit != null) {
    booleans.unitExactMatch = prediction.unit === evalCase.truth.unit;
  }

  return {
    caseId: evalCase.id,
    prediction,
    numeric,
    safety: {
      catastrophicCalorieMiss: catastrophic,
      unsafeCompletion: unsafe,
    },
    booleans,
  };
}

function linearInterp(sorted: number[], idx: number): number {
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi || hi >= sorted.length) return sorted[lo] as number;
  const frac = idx - lo;
  return (sorted[lo] as number) + frac * ((sorted[hi] as number) - (sorted[lo] as number));
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  return linearInterp(sorted, idx);
}

function median(sorted: number[]): number {
  return percentile(sorted, 50);
}

export function aggregateNutritionResults(
  results: readonly NutritionCaseResult[],
): NutritionEvalReport['summary'] {
  const totalCases = results.length;
  const runCases = results.length;

  const parseCases = results.filter(
    (r) => r.prediction.parseStatus === 'success',
  ).length;

  const absCalorieValues: number[] = [];
  const relCalorieValues: number[] = [];
  const macroRelativeErrors: number[] = [];
  let catastrophicCount = 0;
  let unsafeCompletionCount = 0;
  let basisAccuracyDenom = 0;
  let barcodeAccuracyDenom = 0;
  let reviewCount = 0;

  const categoryCounts: Record<string, number> = {};
  const codeCounts: Record<string, number> = {};

  for (const r of results) {
    const kcalMetric = r.numeric.kcal;
    if (kcalMetric) {
      absCalorieValues.push(kcalMetric.absoluteError);
      relCalorieValues.push(kcalMetric.relativeError);
    }

    for (const field of ['proteinG', 'carbsG', 'fatG'] as const) {
      const metric = r.numeric[field];
      if (metric) {
        macroRelativeErrors.push(metric.relativeError);
      }
    }

    if (r.safety.catastrophicCalorieMiss) catastrophicCount++;
    if (r.safety.unsafeCompletion) unsafeCompletionCount++;

    if (r.booleans.basisExactMatch != null) basisAccuracyDenom++;
    if (r.booleans.barcodeExactMatch != null) barcodeAccuracyDenom++;

    if (
      r.prediction.parseStatus === 'success' &&
      r.prediction.decision === 'needs_review'
    ) {
      reviewCount++;
    }

    if (r.prediction.parseStatus === 'failure') {
      const cat = r.prediction.failureCategory;
      if (cat != null) {
        categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
      }
      const code = r.prediction.failureCode;
      if (code != null) {
        codeCounts[code] = (codeCounts[code] ?? 0) + 1;
      }
    }
  }

  const absSorted = [...absCalorieValues].sort((a, b) => a - b);
  const relSorted = [...relCalorieValues].sort((a, b) => a - b);

  const meanMacroRelativeError =
    macroRelativeErrors.length > 0
      ? macroRelativeErrors.reduce((s, v) => s + v, 0) /
        macroRelativeErrors.length
      : 0;

  const reviewRate = parseCases > 0 ? reviewCount / parseCases : 0;

  const sortedCategoryKeys = Object.keys(categoryCounts).sort();
  const failuresByCategory: Record<string, number> = {};
  for (const k of sortedCategoryKeys) {
    failuresByCategory[k] = categoryCounts[k] as number;
  }

  const sortedCodeKeys = Object.keys(codeCounts).sort();
  const failuresByCode: Record<string, number> = {};
  for (const k of sortedCodeKeys) {
    failuresByCode[k] = codeCounts[k] as number;
  }

  return {
    totalCases,
    runCases,
    parseCases,
    basisAccuracyDenom,
    barcodeAccuracyDenom,
    medianAbsoluteCalorieError: median(absSorted),
    medianRelativeCalorieError: median(relSorted),
    p90AbsoluteCalorieError: percentile(absSorted, 90),
    p90RelativeCalorieError: percentile(relSorted, 90),
    meanMacroRelativeError,
    reviewRate,
    catastrophicCount,
    unsafeCompletionCount,
    failuresByCategory,
    failuresByCode,
  };
}
