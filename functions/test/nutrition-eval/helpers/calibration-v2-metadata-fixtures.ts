// Independent serialization fixtures; no producer, metric or schema algorithm.
export type MetadataProtocol = 'v1' | 'v2';
export interface MetadataReportFixture extends Record<string, unknown> {
  calibration: Record<string, unknown>;
  summary: Record<string, unknown>;
  cases: Array<Record<string, unknown>>;
}
export const metadataProtocol = (version: MetadataProtocol) => version === 'v1'
  ? 'calorix-gemini-38-calibration-v1' : 'calorix-gemini-38-calibration-v2';

export function metadataFixture(version: MetadataProtocol): Record<string, unknown> {
  return { protocolVersion: metadataProtocol(version), project: 'calorix-xurschnell', location: 'us',
    model: 'gemini-3.8-flash', thinkingLevel: 'LOW', schemaHash: 'a'.repeat(64), stage: 'development',
    imageCallsReserved: 1, imageCallsCompleted: 1, imageCallsFailed: 0 };
}

function summary(success: boolean): Record<string, unknown> {
  const count = success ? 1 : 0;
  return { totalCases: 1, runCases: 1, parseCases: count, basisAccuracyDenom: 0, barcodeAccuracyDenom: 0,
    medianAbsoluteCalorieError: 0, medianRelativeCalorieError: 0, p90AbsoluteCalorieError: 0,
    p90RelativeCalorieError: 0, meanMacroRelativeError: 0, reviewRate: 0, catastrophicCount: 0,
    unsafeCompletionCount: 0, failuresByCategory: success ? {} : { dataset: 1 },
    failuresByCode: success ? {} : { dataset_load_failed: 1 },
    zeroSafeEligiblePairs: count * 3, proteinEligibleCount: count, carbsEligibleCount: count,
    fatEligibleCount: count, proteinZeroTruthCount: 0, carbsZeroTruthCount: 0, fatZeroTruthCount: 0,
    parsedMealCount: count, mealMassEligibleCount: 0, mealCarbDensityEligibleCount: 0,
    mealFatDensityEligibleCount: 0, mealDensityCoverageCount: 0,
    ...(success ? { medianProteinRelativeError: 0, medianCarbsRelativeError: 0,
      medianFatRelativeError: 0, meanZeroSafeMacroRelativeError: 0 } : {}) };
}

export function metadataReportFixture(version: MetadataProtocol, failure = false): MetadataReportFixture {
  const calibration = metadataFixture(version);
  if (failure) Object.assign(calibration, { imageCallsCompleted: 0, imageCallsFailed: 1,
    safeErrors: [{ caseId: 'metadata-case', sampleIndex: 1, errorCategory: 'unknown' }] });
  return { version: 1, runId: 'metadata-contract-test', timestamp: '2026-11-01T00:00:00.000Z',
    datasetId: 'independent-test-corpus', datasetHash: 'b'.repeat(64), adapterModelId: 'gemini-3.8-flash',
    promptHash: 'c'.repeat(64), codeSha: 'd'.repeat(40), samples: 1, baselineOnly: true,
    publicCases: 1, privateCases: 0, calibration, summary: summary(!failure), cases: [{ caseId: 'metadata-case',
      prediction: failure ? { parseStatus: 'failure', source: 'meal', decision: 'error',
        failureCategory: 'dataset', failureCode: 'dataset_load_failed', sampleIndex: 1 }
        : { parseStatus: 'success', source: 'meal', decision: 'complete',
          kcal: 100, proteinG: 10, carbsG: 20, fatG: 5, sampleIndex: 1 },
      truth: { basis: 'portion', amount: 1, unit: 'portion', kcal: 100, proteinG: 10, carbsG: 20, fatG: 5 },
      numeric: failure ? {} : { kcal: { ratioToTruth: 1, absoluteError: 0, relativeError: 0 },
        proteinG: { ratioToTruth: 1, absoluteError: 0, relativeError: 0 },
        carbsG: { ratioToTruth: 1, absoluteError: 0, relativeError: 0 },
        fatG: { ratioToTruth: 1, absoluteError: 0, relativeError: 0 } },
      safety: { catastrophicCalorieMiss: false, unsafeCompletion: false }, booleans: {} }] };
}

export function diagnosticMetadataReport(version: MetadataProtocol): MetadataReportFixture {
  const report = metadataReportFixture(version);
  (report.cases[0]!.truth as Record<string, unknown>).referenceMassG = 400;
  report.cases[0]!.diagnostics = {
    mealMassG: { predicted: 500, truth: 400, absoluteError: 100, ratioToTruth: 1.25, relativeError: 0.25 },
    mealDensityPer100: {
      kcal: { predicted: 25, truth: 25, absoluteError: 0, ratioToTruth: 1, relativeError: 0 },
      proteinG: { predicted: 2.5, truth: 2.5, absoluteError: 0, ratioToTruth: 1, relativeError: 0 },
      carbsG: { predicted: 5.2, truth: 5, absoluteError: 0.2, ratioToTruth: 1.04, relativeError: 0.04 },
      fatG: { predicted: 1.7, truth: 1.25, absoluteError: 0.45, ratioToTruth: 1.36, relativeError: 0.36 },
    }, mealDominantDriver: 'mass_dominated',
  };
  Object.assign(report.summary, { mealMassEligibleCount: 1, mealDensityCoverageCount: 1,
    mealCarbDensityEligibleCount: 1, mealFatDensityEligibleCount: 1,
    meanMealMassRelativeError: 0.25, medianMealMassRelativeError: 0.25,
    meanMealCarbDensityRelativeError: 0.04, meanMealFatDensityRelativeError: 0.36 });
  return report;
}

export function zeroTruthMetadataReport(version: MetadataProtocol, nutrient: 'protein' | 'carbs' | 'fat'): MetadataReportFixture {
  const report = metadataReportFixture(version);
  (report.cases[0]!.truth as Record<string, unknown>)[nutrient + 'G'] = 0;
  (report.cases[0]!.prediction as Record<string, unknown>)[nutrient + 'G'] = 0;
  (report.cases[0]!.numeric as Record<string, unknown>)[nutrient + 'G'] = { ratioToTruth: 1, absoluteError: 0, relativeError: 0 };
  report.summary[nutrient + 'EligibleCount'] = 0;
  report.summary[nutrient + 'ZeroTruthCount'] = 1;
  report.summary.zeroSafeEligiblePairs = 2;
  const median = nutrient === 'protein' ? 'medianProteinRelativeError'
    : nutrient === 'carbs' ? 'medianCarbsRelativeError' : 'medianFatRelativeError';
  delete report.summary[median];
  report.summary[nutrient + 'ZeroTruthMeanAbsoluteError'] = 0;
  report.summary[nutrient + 'ZeroTruthMedianAbsoluteError'] = 0;
  return report;
}

export function mixedMetadataReport(version: MetadataProtocol, bothFailed = false): MetadataReportFixture {
  const report = metadataReportFixture(version, bothFailed);
  const second = metadataReportFixture(version, true).cases[0]!;
  second.caseId = 'metadata-second'; report.cases.push(second);
  report.publicCases = 2;
  Object.assign(report.summary, { totalCases: 2, runCases: 2, failuresByCategory: { dataset: bothFailed ? 2 : 1 },
    failuresByCode: { dataset_load_failed: bothFailed ? 2 : 1 } });
  Object.assign(report.calibration, { imageCallsReserved: 2, imageCallsCompleted: bothFailed ? 0 : 1,
    imageCallsFailed: bothFailed ? 2 : 1, safeErrors: [
      ...(bothFailed ? [{ caseId: 'metadata-case', sampleIndex: 1, errorCategory: 'unknown' }] : []),
      { caseId: 'metadata-second', sampleIndex: 1, errorCategory: 'unknown' },
    ] });
  return report;
}
