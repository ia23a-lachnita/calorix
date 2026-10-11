/**
 * Pure calibration report measurement bridge.
 *
 * Captures an unknown caller value into independently owned data, validates it
 * through the committed report schema, recomputes the canonical summary, and
 * maps the profile/stage/latency views. Any invalid input yields a fresh,
 * causeless fatal; caller data is never retained, frozen, or mutated.
 */
import { CalibrationFatalError } from './fatal-error';
import { NutritionEvalReportSchema } from './schema';
import { aggregateNutritionResults } from './scorer';
import type { NutritionCaseResult, NutritionEvalReport } from './schema';

export interface CalibrationProfileMetrics {
  unsafeCount: number;
  parseCount: number;
  catastrophicCount: number;
  meanZeroSafeMacroError?: number;
  medianKcalError?: number;
  p90AnalysisLatencyMs?: number;
}

export interface CalibrationStageGateMetrics {
  totalCases?: number;
  runCases?: number;
  totalOutcomes?: number;
  parseCases?: number;
  unsafeCompletionCount?: number;
  failureCount?: number;
  catastrophicCount?: number;
  medianRelativeCalorieError?: number;
  p90RelativeCalorieError?: number;
  meanZeroSafeMacroRelativeError?: number;
  medianProteinRelativeError?: number;
  medianCarbsRelativeError?: number;
  medianFatRelativeError?: number;
  medianMealMassRelativeError?: number;
  p90AnalysisLatencyMs?: number;
  parsedMealCount?: number;
  mealMassEligibleCount?: number;
  mealDensityCoverageCount?: number;
  mealCarbDensityEligibleCount?: number;
  mealFatDensityEligibleCount?: number;
  meanMacroRelativeError?: number;
  meanMealMassRelativeError?: number;
  meanMealCarbDensityRelativeError?: number;
  meanMealFatDensityRelativeError?: number;
  medianMealProteinRelativeError?: number;
  medianMealCarbsRelativeError?: number;
  medianMealFatRelativeError?: number;
  mealOutcomeCount?: number;
  suppliedBarcodeOutcomeCount?: number;
  labelOutcomeCount?: number;
  visionCallCount?: number;
  suppliedBarcodeImageCallCount?: number;
  suppliedBarcodeVisionCallCount?: number;
  suppliedBarcodeLiveOffCallCount?: number;
}

export interface CalibrationReportMeasurements {
  readonly report: NutritionEvalReport;
  readonly profile: Readonly<CalibrationProfileMetrics>;
  readonly stage: Readonly<CalibrationStageGateMetrics>;
  readonly latency: Readonly<{ measuredCases: number; missingCases: number }>;
}

const MEASURE_MAX_DEPTH = 32;
const MEASURE_MAX_NODES = 20000;
const MEASURE_MAX_ARRAY_ELEMENTS = 256;
const MEASURE_MAX_STRING_CODE_UNITS = 4096;
const MEASURE_MAX_REPORT_CASES = 60;
const MEASURE_INVALID_MESSAGE = 'calibration:report-measurements-invalid';

const MEAL_MACRO_FIELDS = ['proteinG', 'carbsG', 'fatG'] as const;
type MealMacroField = (typeof MEAL_MACRO_FIELDS)[number];

export interface CalibrationMealMetrics {
  parsedMealCount: number;
  proteinEligibleCount: number;
  carbsEligibleCount: number;
  fatEligibleCount: number;
  medianMealProteinRelativeError?: number;
  medianMealCarbsRelativeError?: number;
  medianMealFatRelativeError?: number;
  proteinZeroTruthCount: number;
  carbsZeroTruthCount: number;
  fatZeroTruthCount: number;
  proteinZeroTruthMeanAbsoluteError?: number;
  proteinZeroTruthMedianAbsoluteError?: number;
  carbsZeroTruthMeanAbsoluteError?: number;
  carbsZeroTruthMedianAbsoluteError?: number;
  fatZeroTruthMeanAbsoluteError?: number;
  fatZeroTruthMedianAbsoluteError?: number;
}

function linearInterp(sorted: readonly number[], idx: number): number {
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi || hi >= sorted.length) return sorted[lo] as number;
  const frac = idx - lo;
  return (sorted[lo] as number) + frac * ((sorted[hi] as number) - (sorted[lo] as number));
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  return linearInterp(sorted, idx);
}

function medianOf(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return percentile(sorted, 50);
}

function meanOf(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function aggregateCalibrationMealMetrics(
  results: readonly NutritionCaseResult[],
): CalibrationMealMetrics {
  let parsedMealCount = 0;
  const relative: Record<MealMacroField, number[]> = {
    proteinG: [],
    carbsG: [],
    fatG: [],
  };
  const zeroTruthAbsolute: Record<MealMacroField, number[]> = {
    proteinG: [],
    carbsG: [],
    fatG: [],
  };

  for (const result of results) {
    if (result.prediction.parseStatus !== 'success') continue;
    if (result.prediction.source !== 'meal') continue;
    parsedMealCount += 1;
    for (const field of MEAL_MACRO_FIELDS) {
      const metric = result.numeric[field];
      const truthValue = result.truth?.[field];
      if (metric === undefined || truthValue === undefined) continue;
      if (truthValue > 0) {
        relative[field].push(metric.absoluteError / truthValue);
      } else if (truthValue === 0) {
        zeroTruthAbsolute[field].push(metric.absoluteError);
      }
    }
  }

  const medianProtein = medianOf(relative.proteinG);
  const medianCarbs = medianOf(relative.carbsG);
  const medianFat = medianOf(relative.fatG);
  const proteinZeroMean = meanOf(zeroTruthAbsolute.proteinG);
  const proteinZeroMedian = medianOf(zeroTruthAbsolute.proteinG);
  const carbsZeroMean = meanOf(zeroTruthAbsolute.carbsG);
  const carbsZeroMedian = medianOf(zeroTruthAbsolute.carbsG);
  const fatZeroMean = meanOf(zeroTruthAbsolute.fatG);
  const fatZeroMedian = medianOf(zeroTruthAbsolute.fatG);

  return {
    parsedMealCount,
    proteinEligibleCount: relative.proteinG.length,
    carbsEligibleCount: relative.carbsG.length,
    fatEligibleCount: relative.fatG.length,
    ...(medianProtein !== undefined ? { medianMealProteinRelativeError: medianProtein } : {}),
    ...(medianCarbs !== undefined ? { medianMealCarbsRelativeError: medianCarbs } : {}),
    ...(medianFat !== undefined ? { medianMealFatRelativeError: medianFat } : {}),
    proteinZeroTruthCount: zeroTruthAbsolute.proteinG.length,
    carbsZeroTruthCount: zeroTruthAbsolute.carbsG.length,
    fatZeroTruthCount: zeroTruthAbsolute.fatG.length,
    ...(proteinZeroMean !== undefined ? { proteinZeroTruthMeanAbsoluteError: proteinZeroMean } : {}),
    ...(proteinZeroMedian !== undefined ? { proteinZeroTruthMedianAbsoluteError: proteinZeroMedian } : {}),
    ...(carbsZeroMean !== undefined ? { carbsZeroTruthMeanAbsoluteError: carbsZeroMean } : {}),
    ...(carbsZeroMedian !== undefined ? { carbsZeroTruthMedianAbsoluteError: carbsZeroMedian } : {}),
    ...(fatZeroMean !== undefined ? { fatZeroTruthMeanAbsoluteError: fatZeroMean } : {}),
    ...(fatZeroMedian !== undefined ? { fatZeroTruthMedianAbsoluteError: fatZeroMedian } : {}),
  };
}

function failMeasure(): never {
  throw new CalibrationFatalError(MEASURE_INVALID_MESSAGE);
}

function freezeMeasuredGraph(root: unknown): void {
  const seen = new Set<object>();
  const visit = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return;
    const target = node as Record<string, unknown>;
    if (seen.has(target)) return;
    seen.add(target);
    for (const key of Reflect.ownKeys(target)) {
      if (typeof key !== 'string') continue;
      const descriptor = Object.getOwnPropertyDescriptor(target, key);
      if (descriptor !== undefined && 'value' in descriptor) {
        visit((descriptor as PropertyDescriptor).value as unknown);
      }
    }
    Object.freeze(target);
  };
  visit(root);
}

function matchMeasuredShape(owned: unknown, parsed: unknown): void {
  if (owned === null || parsed === null) {
    if (owned !== parsed) failMeasure();
    return;
  }
  if (Array.isArray(owned) || Array.isArray(parsed)) {
    if (!Array.isArray(owned) || !Array.isArray(parsed)) failMeasure();
    if (owned.length !== parsed.length) failMeasure();
    for (let index = 0; index < owned.length; index += 1) {
      matchMeasuredShape(owned[index], parsed[index]);
    }
    return;
  }
  if (typeof owned === 'object' && typeof parsed === 'object') {
    const ownedKeys = Reflect.ownKeys(owned);
    const parsedKeys = Reflect.ownKeys(parsed);
    if (ownedKeys.length !== parsedKeys.length) failMeasure();
    for (const key of ownedKeys) {
      if (typeof key !== 'string') failMeasure();
      if (!Object.prototype.hasOwnProperty.call(parsed, key)) failMeasure();
    }
    const ownedRecord = owned as Record<string, unknown>;
    const parsedRecord = parsed as Record<string, unknown>;
    for (const key of ownedKeys as string[]) {
      matchMeasuredShape(ownedRecord[key], parsedRecord[key]);
    }
    return;
  }
  if (typeof owned !== typeof parsed) failMeasure();
  if (owned !== parsed) failMeasure();
}

export function measureCalibrationStageReport(value: unknown): Readonly<CalibrationReportMeasurements> {
  try {
    let capturedNodes = 0;
    const activePath = new Set<object>();
    const captureOwned = (input: unknown, depth: number): unknown => {
      if (depth > MEASURE_MAX_DEPTH) failMeasure();
      capturedNodes += 1;
      if (capturedNodes > MEASURE_MAX_NODES) failMeasure();
      if (input === null) return null;
      if (typeof input === 'string') {
        if (input.length > MEASURE_MAX_STRING_CODE_UNITS) failMeasure();
        return input;
      }
      if (typeof input === 'number') {
        if (!Number.isFinite(input)) failMeasure();
        return input;
      }
      if (typeof input === 'boolean') return input;
      if (typeof input !== 'object') failMeasure();
      const node: object = input;
      if (Array.isArray(node)) {
        if (Object.getPrototypeOf(node) !== Array.prototype) failMeasure();
        const lengthDescriptor = Reflect.getOwnPropertyDescriptor(node, 'length');
        if (
          lengthDescriptor === undefined ||
          !('value' in lengthDescriptor) ||
          lengthDescriptor.enumerable !== false
        ) {
          failMeasure();
        }
        const arrayLength = (lengthDescriptor as PropertyDescriptor).value as unknown;
        if (
          typeof arrayLength !== 'number' ||
          !Number.isInteger(arrayLength) ||
          arrayLength < 0 ||
          arrayLength > MEASURE_MAX_ARRAY_ELEMENTS
        ) {
          failMeasure();
        }
        const denseKeys = Reflect.ownKeys(node);
        const expectedLength = arrayLength as number;
        if (denseKeys.length !== expectedLength + 1) failMeasure();
        for (const denseKey of denseKeys) {
          if (typeof denseKey !== 'string') failMeasure();
        }
        const denseKeySet = new Set<string | symbol>(denseKeys);
        if (denseKeySet.size !== expectedLength + 1) failMeasure();
        if (!denseKeySet.has('length')) failMeasure();
        for (let index = 0; index < expectedLength; index += 1) {
          if (!denseKeySet.has(String(index))) failMeasure();
        }
        if (activePath.has(node)) failMeasure();
        activePath.add(node);
        const ownedArray: unknown[] = new Array<unknown>(arrayLength as number);
        for (let index = 0; index < (arrayLength as number); index += 1) {
          const key = String(index);
          const elementDescriptor = Reflect.getOwnPropertyDescriptor(node, key);
          if (
            elementDescriptor === undefined ||
            elementDescriptor.enumerable !== true ||
            !('value' in elementDescriptor)
          ) {
            failMeasure();
          }
          const element = (elementDescriptor as PropertyDescriptor).value as unknown;
          if (element === undefined) failMeasure();
          Object.defineProperty(ownedArray, key, {
            value: captureOwned(element, depth + 1),
            enumerable: true,
            writable: true,
            configurable: true,
          });
        }
        activePath.delete(node);
        return ownedArray;
      }
      const prototype = Object.getPrototypeOf(node);
      if (prototype !== Object.prototype && prototype !== null) failMeasure();
      const fieldKeys = Reflect.ownKeys(node);
      for (const fieldKey of fieldKeys) {
        if (typeof fieldKey !== 'string') failMeasure();
      }
      if (activePath.has(node)) failMeasure();
      activePath.add(node);
      const ownedObject: Record<string, unknown> = Object.create(null);
      for (const fieldKey of fieldKeys as string[]) {
        const fieldDescriptor = Reflect.getOwnPropertyDescriptor(node, fieldKey);
        if (
          fieldDescriptor === undefined ||
          fieldDescriptor.enumerable !== true ||
          !('value' in fieldDescriptor)
        ) {
          failMeasure();
        }
        const field = (fieldDescriptor as PropertyDescriptor).value as unknown;
        if (field === undefined) failMeasure();
        ownedObject[fieldKey] = captureOwned(field, depth + 1);
      }
      activePath.delete(node);
      return ownedObject;
    };
    const owned = captureOwned(value, 0);
    const parsed = NutritionEvalReportSchema.safeParse(owned);
    if (parsed.success !== true) failMeasure();
    const report = parsed.data;
    matchMeasuredShape(owned, report);
    const calibration = report.calibration;
    if (calibration === undefined) failMeasure();
    if (
      !Object.prototype.hasOwnProperty.call(calibration, 'safeErrors') ||
      calibration.safeErrors === undefined
    ) {
      failMeasure();
    }
    if (
      !Object.prototype.hasOwnProperty.call(calibration, 'latencyCoverage') ||
      calibration.latencyCoverage === undefined
    ) {
      failMeasure();
    }
    const cases = report.cases;
    if (cases.length > MEASURE_MAX_REPORT_CASES) failMeasure();
    const seenPairs = new Set<string>();
    for (const entry of cases) {
      if (entry.prediction.cached !== false) failMeasure();
      const sampleIndex = entry.prediction.sampleIndex;
      if (typeof sampleIndex !== 'number' || !Number.isInteger(sampleIndex) || sampleIndex < 1) {
        failMeasure();
      }
      const pair = `${entry.caseId}:${sampleIndex}`;
      if (seenPairs.has(pair)) failMeasure();
      seenPairs.add(pair);
    }
    let measuredCount = 0;
    for (const entry of cases) {
      const latencyMs = entry.prediction.latencyMs;
      if (latencyMs !== undefined) {
        if (!Number.isFinite(latencyMs)) failMeasure();
        measuredCount += 1;
      }
    }
    const coverage = calibration.latencyCoverage;
    if (
      coverage.measuredCases !== measuredCount ||
      coverage.missingCases !== cases.length - measuredCount
    ) {
      failMeasure();
    }
    const recomputedSummary = aggregateNutritionResults(cases);
    const finiteLatencies = cases
      .map((entry) => entry.prediction.latencyMs)
      .filter((latencyMs): latencyMs is number => typeof latencyMs === 'number' && Number.isFinite(latencyMs))
      .sort((left, right) => left - right);
    const recomputedLatency =
      finiteLatencies.length === 0
        ? undefined
        : {
            min: finiteLatencies[0] as number,
            max: finiteLatencies[finiteLatencies.length - 1] as number,
            median: percentile(finiteLatencies, 50),
            p90: percentile(finiteLatencies, 90),
          };
    const expectedSummary: unknown =
      recomputedLatency === undefined
        ? { ...recomputedSummary }
        : { ...recomputedSummary, latencyMs: recomputedLatency };
    matchMeasuredShape(expectedSummary, report.summary);
    const summary = report.summary;
    const profile: CalibrationProfileMetrics = {
      unsafeCount: summary.unsafeCompletionCount,
      parseCount: summary.parseCases,
      catastrophicCount: summary.catastrophicCount,
      medianKcalError: summary.medianRelativeCalorieError,
    };
    if (summary.meanZeroSafeMacroRelativeError !== undefined) {
      profile.meanZeroSafeMacroError = summary.meanZeroSafeMacroRelativeError;
    }
    if (summary.latencyMs !== undefined) {
      profile.p90AnalysisLatencyMs = summary.latencyMs.p90;
    }
    const mealMetrics = aggregateCalibrationMealMetrics(cases);
    let failureCount = 0;
    let mealOutcomeCount = 0;
    let suppliedBarcodeOutcomeCount = 0;
    let labelOutcomeCount = 0;
    for (const entry of cases) {
      if (entry.prediction.parseStatus !== 'success') failureCount += 1;
      const source = entry.prediction.source;
      if (source === 'meal') mealOutcomeCount += 1;
      else if (source === 'barcode') suppliedBarcodeOutcomeCount += 1;
      else if (source === 'label') labelOutcomeCount += 1;
    }
    const stage: CalibrationStageGateMetrics = {
      totalCases: summary.totalCases,
      runCases: summary.runCases,
      totalOutcomes: cases.length,
      parseCases: summary.parseCases,
      unsafeCompletionCount: summary.unsafeCompletionCount,
      failureCount,
      catastrophicCount: summary.catastrophicCount,
      medianRelativeCalorieError: summary.medianRelativeCalorieError,
      p90RelativeCalorieError: summary.p90RelativeCalorieError,
      meanMacroRelativeError: summary.meanMacroRelativeError,
      mealOutcomeCount,
      suppliedBarcodeOutcomeCount,
      labelOutcomeCount,
    };
    if (summary.meanZeroSafeMacroRelativeError !== undefined) {
      stage.meanZeroSafeMacroRelativeError = summary.meanZeroSafeMacroRelativeError;
    }
    if (summary.medianProteinRelativeError !== undefined) {
      stage.medianProteinRelativeError = summary.medianProteinRelativeError;
    }
    if (summary.medianCarbsRelativeError !== undefined) {
      stage.medianCarbsRelativeError = summary.medianCarbsRelativeError;
    }
    if (summary.medianFatRelativeError !== undefined) {
      stage.medianFatRelativeError = summary.medianFatRelativeError;
    }
    if (summary.medianMealMassRelativeError !== undefined) {
      stage.medianMealMassRelativeError = summary.medianMealMassRelativeError;
    }
    if (summary.latencyMs !== undefined) {
      stage.p90AnalysisLatencyMs = summary.latencyMs.p90;
    }
    if (summary.parsedMealCount !== undefined) {
      stage.parsedMealCount = summary.parsedMealCount;
    }
    if (summary.mealMassEligibleCount !== undefined) {
      stage.mealMassEligibleCount = summary.mealMassEligibleCount;
    }
    if (summary.mealDensityCoverageCount !== undefined) {
      stage.mealDensityCoverageCount = summary.mealDensityCoverageCount;
    }
    if (summary.mealCarbDensityEligibleCount !== undefined) {
      stage.mealCarbDensityEligibleCount = summary.mealCarbDensityEligibleCount;
    }
    if (summary.mealFatDensityEligibleCount !== undefined) {
      stage.mealFatDensityEligibleCount = summary.mealFatDensityEligibleCount;
    }
    if (summary.meanMealMassRelativeError !== undefined) {
      stage.meanMealMassRelativeError = summary.meanMealMassRelativeError;
    }
    if (summary.meanMealCarbDensityRelativeError !== undefined) {
      stage.meanMealCarbDensityRelativeError = summary.meanMealCarbDensityRelativeError;
    }
    if (summary.meanMealFatDensityRelativeError !== undefined) {
      stage.meanMealFatDensityRelativeError = summary.meanMealFatDensityRelativeError;
    }
    if (mealMetrics.medianMealProteinRelativeError !== undefined) {
      stage.medianMealProteinRelativeError = mealMetrics.medianMealProteinRelativeError;
    }
    if (mealMetrics.medianMealCarbsRelativeError !== undefined) {
      stage.medianMealCarbsRelativeError = mealMetrics.medianMealCarbsRelativeError;
    }
    if (mealMetrics.medianMealFatRelativeError !== undefined) {
      stage.medianMealFatRelativeError = mealMetrics.medianMealFatRelativeError;
    }
    const latency = { measuredCases: measuredCount, missingCases: cases.length - measuredCount };
    const measured: CalibrationReportMeasurements = { report, profile, stage, latency };
    freezeMeasuredGraph(measured);
    return measured;
  } catch {
    throw new CalibrationFatalError(MEASURE_INVALID_MESSAGE);
  }
}
