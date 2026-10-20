/**
 * Calibration benchmark authority guards (Task 3 Step 1, Slice A).
 *
 * Full-gate discriminator unit controls only. Broader core hostile/reentry/
 * privacy/alias cases are deferred to a later bounded pass in this file.
 */
import { describe, expect, it } from "vitest";
import { evaluateCalibrationStageGate } from "../../src/nutrition-eval/calibration";
import { measureCalibrationStageReport } from "../../src/nutrition-eval/calibration-report-measurements";
import type { CalibrationStageGateMetrics } from "../../src/nutrition-eval/calibration-report-measurements";
import { makeMeasuredReport } from "./calibration-authoritative-fixtures";

const SMALL_TEST_TIMEOUT = 5000;

const COUNT_FIELDS = [
  "totalCases", "runCases", "totalOutcomes", "parseCases",
  "unsafeCompletionCount", "failureCount", "catastrophicCount", "mealOutcomeCount",
  "suppliedBarcodeOutcomeCount", "labelOutcomeCount", "parsedMealCount",
  "mealMassEligibleCount", "mealDensityCoverageCount", "mealCarbDensityEligibleCount",
  "mealFatDensityEligibleCount", "visionCallCount", "suppliedBarcodeImageCallCount",
  "suppliedBarcodeVisionCallCount", "suppliedBarcodeLiveOffCallCount",
] as const;

const METRIC_FIELDS = [
  "medianRelativeCalorieError", "p90RelativeCalorieError",
  "meanMacroRelativeError", "meanMealMassRelativeError", "meanMealCarbDensityRelativeError",
  "meanMealFatDensityRelativeError", "medianMealProteinRelativeError",
  "medianMealCarbsRelativeError", "medianMealFatRelativeError",
] as const;

const ALL_DISCRIMINATOR_FIELDS = [...COUNT_FIELDS, ...METRIC_FIELDS] as const;

// Scalar helper unit control ONLY: these literals are not native evidence.
async function unitBenchmarkMetrics(): Promise<CalibrationStageGateMetrics> {
  const report = await makeMeasuredReport({ stage: "benchmark", profile: "MEDIUM" });
  const exact = measureCalibrationStageReport(report);
  return {
    ...exact.stage,
    visionCallCount: 48,
    suppliedBarcodeImageCallCount: 0,
    suppliedBarcodeVisionCallCount: 0,
    suppliedBarcodeLiveOffCallCount: 0,
  };
}

describe("benchmark full-gate discriminator matrix", () => {
  it("measured benchmark baseline has 48 real non-barcode image outcomes, documented populations, and passes the full gate", async () => {
    const report = await makeMeasuredReport({ stage: "benchmark", profile: "MEDIUM" });
    const imageOutcomes = report.cases.filter((c) => c.prediction.source !== "barcode");
    const barcodeOutcomes = report.cases.filter((c) => c.prediction.source === "barcode");
    expect(imageOutcomes).toHaveLength(48);
    expect(barcodeOutcomes).toHaveLength(12);
    const exact = measureCalibrationStageReport(report);
    expect(exact.stage.mealCarbDensityEligibleCount).toBe(33);
    expect(exact.stage.mealMassEligibleCount).toBe(36);
    expect(exact.stage.mealDensityCoverageCount).toBe(36);
    expect(exact.stage.mealFatDensityEligibleCount).toBe(36);
    expect(exact.stage.mealOutcomeCount).toBe(36);
    expect(exact.stage.labelOutcomeCount).toBe(12);
    expect(exact.stage.suppliedBarcodeOutcomeCount).toBe(12);
    expect(exact.stage.parsedMealCount).toBe(36);
    expect(evaluateCalibrationStageGate("benchmark", await unitBenchmarkMetrics()).passed).toBe(true);
  }, SMALL_TEST_TIMEOUT);

  it.each(ALL_DISCRIMINATOR_FIELDS)("rejects a missing %s", async (field) => {
    const missing: CalibrationStageGateMetrics = await unitBenchmarkMetrics();
    delete missing[field];
    expect(evaluateCalibrationStageGate("benchmark", missing).failedChecks).toContain(field);
  }, SMALL_TEST_TIMEOUT);

  it.each(ALL_DISCRIMINATOR_FIELDS)("rejects a violating %s", async (field) => {
    const base = await unitBenchmarkMetrics();
    const violated: CalibrationStageGateMetrics = { ...base, [field]: 10000 };
    expect(evaluateCalibrationStageGate("benchmark", violated).failedChecks).toContain(field);
  }, SMALL_TEST_TIMEOUT);
});
