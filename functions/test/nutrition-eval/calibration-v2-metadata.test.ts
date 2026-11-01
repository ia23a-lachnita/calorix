import { describe, expect, it } from 'vitest';
import { CalibrationInfoSchema, CalibrationInfoV2Schema, NutritionEvalReportSchema } from '../../src/nutrition-eval/schema';
import { diagnosticMetadataReport, metadataFixture, metadataReportFixture, metadataProtocol,
  mixedMetadataReport, zeroTruthMetadataReport } from './helpers/calibration-v2-metadata-fixtures';
import type { MetadataProtocol, MetadataReportFixture } from './helpers/calibration-v2-metadata-fixtures';

const versions = ['v1', 'v2'] as const;
const schema = (version: MetadataProtocol) => version === 'v1' ? CalibrationInfoSchema : CalibrationInfoV2Schema;
const failure = (v: MetadataProtocol) => metadataReportFixture(v, true);
const errors = (r: MetadataReportFixture) => r.calibration.safeErrors as Array<Record<string, unknown>>;
const success = (v: MetadataProtocol) => metadataReportFixture(v);
function valid(raw: MetadataReportFixture) {
  const result = NutritionEvalReportSchema.safeParse(raw);
  expect(result.success, result.success ? '' : JSON.stringify(result.error.issues)).toBe(true);
}
function issue(raw: MetadataReportFixture, path: Array<string | number>, fragment: string) {
  const result = NutritionEvalReportSchema.safeParse(raw);
  expect(result.success).toBe(false);
  if (result.success) throw new Error('expected rejected metadata');
  expect(result.error.issues).toContainEqual(expect.objectContaining({ path, message: expect.stringContaining(fragment) }));
}

interface Mutation {
  name: string;
  setup?: (version: MetadataProtocol) => MetadataReportFixture;
  mutate: (report: MetadataReportFixture) => void;
  path: Array<string | number>;
  fragment: string;
}
// Literal rules and paths are independent of the production refinement table.
const mutations: Mutation[] = [
  { name: 'wrong project', mutate: r => { r.calibration.project = 'other'; }, path: ['calibration', 'project'], fragment: 'calibration project' },
  { name: 'wrong location', mutate: r => { r.calibration.location = 'other'; }, path: ['calibration', 'location'], fragment: 'calibration location' },
  { name: 'wrong model', mutate: r => { r.calibration.model = 'other'; }, path: ['calibration', 'model'], fragment: 'calibration model' },
  { name: 'adapter mismatch', mutate: r => { r.adapterModelId = 'other'; }, path: ['adapterModelId'], fragment: 'must equal calibration.model' },
  { name: 'completed plus failed exceeds reserved', mutate: r => { r.calibration.imageCallsFailed = 1; }, path: ['calibration', 'imageCallsCompleted'], fragment: 'completed + failed' },
  { name: 'reserved exceeds actual run', mutate: r => { r.calibration.imageCallsReserved = 2; }, path: ['calibration', 'imageCallsReserved'], fragment: 'reserved cannot exceed' },
  { name: 'undefined safe errors at preprocessing', mutate: r => { r.calibration.safeErrors = undefined; }, path: ['calibration'], fragment: 'invalid calibration metadata' },
  { name: 'undefined latency coverage at preprocessing', mutate: r => { r.calibration.latencyCoverage = undefined; }, path: ['calibration'], fragment: 'invalid calibration metadata' },
  { name: 'unaccounted failure', setup: failure, mutate: r => { r.calibration.safeErrors = []; }, path: ['calibration', 'safeErrors'], fragment: 'account for failed images' },
  { name: 'unknown failed sample', setup: failure, mutate: r => { errors(r)[0]!.caseId = 'missing'; }, path: ['calibration', 'safeErrors'], fragment: 'unique failure sample' },
  { name: 'duplicate failure sample', setup: v => mixedMetadataReport(v, true), mutate: r => { errors(r)[1] = { ...errors(r)[0]! }; }, path: ['calibration', 'safeErrors'], fragment: 'unique failure sample' },
  { name: 'error bound to successful sample', setup: mixedMetadataReport, mutate: r => { errors(r)[0]!.caseId = 'metadata-case'; }, path: ['calibration', 'safeErrors'], fragment: 'unique failure sample' },
  { name: 'interruption without matching code', setup: failure, mutate: r => { errors(r)[0]!.errorCategory = 'interrupted_reservation'; }, path: ['calibration', 'safeErrors'], fragment: 'unique failure sample' },
  { name: 'wrong measured latency count', setup: v => { const r = success(v); r.calibration.latencyCoverage = { measuredCases: 0, missingCases: 1 }; return r; },
    mutate: r => { (r.calibration.latencyCoverage as Record<string, unknown>).measuredCases = 1; }, path: ['calibration', 'latencyCoverage'], fragment: 'latency coverage must match' },
  { name: 'wrong missing latency count', setup: v => { const r = success(v); r.calibration.latencyCoverage = { measuredCases: 0, missingCases: 1 }; return r; },
    mutate: r => { (r.calibration.latencyCoverage as Record<string, unknown>).missingCases = 0; }, path: ['calibration', 'latencyCoverage'], fragment: 'latency coverage must match' },
  { name: 'macro eligible sum', mutate: r => { r.summary.zeroSafeEligiblePairs = 2; }, path: ['summary', 'zeroSafeEligiblePairs'], fragment: 'must equal the sum' },
  ...(['protein', 'carbs', 'fat'] as const).map(nutrient => ({ name: nutrient + ' eligible plus zero truth exceeds parse',
    mutate: (r: MetadataReportFixture) => { r.summary[nutrient + 'ZeroTruthCount'] = 1; },
    path: ['summary', nutrient + 'EligibleCount'], fragment: 'macro eligible + zeroTruth' })),
  { name: 'mass coverage exceeds parsed meals', setup: diagnosticMetadataReport, mutate: r => { r.summary.mealMassEligibleCount = 2; }, path: ['summary', 'mealMassEligibleCount'], fragment: 'cannot exceed parsedMealCount' },
  { name: 'parsed meals exceed successful parses', setup: diagnosticMetadataReport, mutate: r => { r.summary.parsedMealCount = 2; }, path: ['summary', 'parsedMealCount'], fragment: 'cannot exceed parseCases' },
  { name: 'carb density exceeds coverage', setup: diagnosticMetadataReport, mutate: r => { r.summary.mealCarbDensityEligibleCount = 2; }, path: ['summary', 'mealCarbDensityEligibleCount'], fragment: 'density eligible cannot exceed coverage' },
  { name: 'fat density exceeds coverage', setup: diagnosticMetadataReport, mutate: r => { r.summary.mealFatDensityEligibleCount = 2; }, path: ['summary', 'mealFatDensityEligibleCount'], fragment: 'density eligible cannot exceed coverage' },
  { name: 'density coverage exceeds parsed meals', setup: diagnosticMetadataReport, mutate: r => { r.summary.mealDensityCoverageCount = 2; }, path: ['summary', 'mealDensityCoverageCount'], fragment: 'coverage cannot exceed parsedMealCount' },
  { name: 'missing case truth', mutate: r => { delete r.cases[0]!.truth; }, path: ['cases', 0, 'truth'], fragment: 'calibration cases require truth' },
  { name: 'total serialized case count', mutate: r => { r.summary.totalCases = 2; }, path: ['summary', 'totalCases'], fragment: 'total cases must equal' },
  { name: 'run serialized case count', mutate: r => { r.summary.runCases = 2; }, path: ['summary', 'runCases'], fragment: 'run cases must equal' },
  { name: 'visibility coverage', mutate: r => { r.publicCases = 2; }, path: ['cases'], fragment: 'visibility coverage times samples' },
  { name: 'parse count exceeds run', mutate: r => { r.summary.parseCases = 2; }, path: ['summary', 'parseCases'], fragment: 'parse cases cannot exceed' },
];
const requiredCounts = ['zeroSafeEligiblePairs', 'proteinEligibleCount', 'carbsEligibleCount', 'fatEligibleCount',
  'proteinZeroTruthCount', 'carbsZeroTruthCount', 'fatZeroTruthCount', 'mealMassEligibleCount',
  'parsedMealCount', 'mealCarbDensityEligibleCount', 'mealFatDensityEligibleCount', 'mealDensityCoverageCount'];
const conditionalMetrics: Array<{ metric: string; positive: (v: MetadataProtocol) => MetadataReportFixture }> = [
  { metric: 'medianProteinRelativeError', positive: success }, { metric: 'medianCarbsRelativeError', positive: success },
  { metric: 'medianFatRelativeError', positive: success }, { metric: 'meanZeroSafeMacroRelativeError', positive: success },
  ...(['protein', 'carbs', 'fat'] as const).flatMap(nutrient => [
    { metric: nutrient + 'ZeroTruthMeanAbsoluteError', positive: (v: MetadataProtocol) => zeroTruthMetadataReport(v, nutrient) },
    { metric: nutrient + 'ZeroTruthMedianAbsoluteError', positive: (v: MetadataProtocol) => zeroTruthMetadataReport(v, nutrient) },
  ]),
  { metric: 'meanMealMassRelativeError', positive: diagnosticMetadataReport },
  { metric: 'medianMealMassRelativeError', positive: diagnosticMetadataReport },
  { metric: 'meanMealCarbDensityRelativeError', positive: diagnosticMetadataReport },
  { metric: 'meanMealFatDensityRelativeError', positive: diagnosticMetadataReport },
];

describe('explicit calibration metadata variants', () => {
  it.each(versions)('accepts only the expected %s standalone protocol', version => {
    expect(schema(version).safeParse(metadataFixture(version)).success).toBe(true);
    expect(schema(version).safeParse(metadataFixture(version === 'v1' ? 'v2' : 'v1')).success).toBe(false);
    expect(schema(version).safeParse({ ...metadataFixture(version), protocolVersion: 'unapproved' }).success).toBe(false);
  });
  it.each([146, 147, 300])('keeps v1 reservation ceiling accepting %s', count => {
    expect(CalibrationInfoSchema.safeParse({ ...metadataFixture('v1'), imageCallsReserved: count }).success).toBe(true);
  });
  it('caps v2 standalone reservation admission at 146', () => {
    expect(CalibrationInfoV2Schema.safeParse({ ...metadataFixture('v2'), imageCallsReserved: 146 }).success).toBe(true);
    expect(CalibrationInfoV2Schema.safeParse({ ...metadataFixture('v2'), imageCallsReserved: 147 }).success).toBe(false);
    expect(CalibrationInfoSchema.safeParse({ ...metadataFixture('v1'), imageCallsReserved: 301 }).success).toBe(false);
  });
  for (const version of versions) {
    it.each(['imageCallsReserved', 'imageCallsCompleted', 'imageCallsFailed'])('rejects invalid %s numeric counts for ' + version, field => {
      expect(schema(version).safeParse(metadataFixture(version)).success).toBe(true);
      for (const value of [-1, 0.5, Infinity, NaN]) {
        const result = schema(version).safeParse({ ...metadataFixture(version), [field]: value });
        expect(result.success).toBe(false);
        if (!result.success) expect(result.error.issues.some(i => i.path[0] === field)).toBe(true);
      }
    });
    describe(version + ' general report refinements', () => {
      it('accepts success, failure, mixed, duplicate-source and diagnostic fixture controls', () => {
        for (const report of [success(version), failure(version), mixedMetadataReport(version),
          mixedMetadataReport(version, true), diagnosticMetadataReport(version),
          ...(['protein', 'carbs', 'fat'] as const).map(n => zeroTruthMetadataReport(version, n))]) valid(report);
        expect(NutritionEvalReportSchema.parse(success(version)).calibration?.protocolVersion).toBe(metadataProtocol(version));
      });
      it.each(mutations)('rejects $name at its targeted rule', mutation => {
        const report = (mutation.setup ?? success)(version); valid(report);
        mutation.mutate(report); issue(report, mutation.path, mutation.fragment);
      });
      it.each(requiredCounts)('requires %s even when the protocol is recognized', field => {
        const report = success(version); valid(report); delete report.summary[field];
        issue(report, ['summary', field], 'is required in calibration reports');
      });
      it.each(conditionalMetrics)('requires $metric for a positive eligible count', ({ metric, positive }) => {
        const report = positive(version); valid(report); delete report.summary[metric];
        issue(report, ['summary', metric], 'is required when');
      });
      it.each(conditionalMetrics)('omits $metric for zero eligible counts', ({ metric }) => {
        const report = failure(version); valid(report); report.summary[metric] = 0;
        issue(report, ['summary', metric], 'must be absent when');
      });
      it('accepts matching interruption evidence and complete measured latency coverage', () => {
        const report = failure(version);
        (report.cases[0]!.prediction as Record<string, unknown>).failureCode = 'interrupted_reservation';
        (report.cases[0]!.prediction as Record<string, unknown>).latencyMs = 12;
        errors(report)[0]!.errorCategory = 'interrupted_reservation';
        report.calibration.latencyCoverage = { measuredCases: 1, missingCases: 0 }; valid(report);
      });
      it('rejects metadata accessors without invoking the guarded getter', () => {
        const report = success(version); valid(report); let reads = 0;
        Object.defineProperty(report.calibration, 'safeErrors', { enumerable: true, get() { reads++; throw new Error('PRIVATE metadata getter'); } });
        issue(report, ['calibration'], 'invalid calibration metadata'); expect(reads).toBe(0);
      });
      it('sanitizes a throwing metadata proxy and revoked metadata without leaking private payloads', () => {
        for (const revoked of [false, true]) {
          const report = success(version); valid(report);
          const proxy = Proxy.revocable(report.calibration, { has() { throw new Error('PRIVATE metadata proxy'); } });
          if (revoked) proxy.revoke(); report.calibration = proxy.proxy;
          const result = NutritionEvalReportSchema.safeParse(report); expect(result.success).toBe(false);
          if (!result.success) { expect(JSON.stringify(result.error.issues)).not.toContain('PRIVATE');
            expect(result.error.issues).toContainEqual(expect.objectContaining({ path: ['calibration'], message: 'invalid calibration metadata' })); }
        }
      });
    });
  }
  it('rejects unknown general report protocols while preserving uncalibrated data', () => {
    const report = success('v1'); valid(report); report.calibration.protocolVersion = 'unapproved';
    const result = NutritionEvalReportSchema.safeParse(report); expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some(i => i.path[0] === 'calibration')).toBe(true);
    const uncalibrated = { ...success('v1') }; delete (uncalibrated as Record<string, unknown>).calibration;
    expect(NutritionEvalReportSchema.safeParse(uncalibrated).success).toBe(true);
  });
});
