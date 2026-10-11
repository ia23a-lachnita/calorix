import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cloneOwnedReport,
  makeAllFailureReport,
  makeBenchmarkCaseLimitReport,
  makeEmptyCalibrationReport,
  makeLatencyControlReport,
  makeMeasuredReport,
  makeMealMedianDiscriminatorReport,
  makeNonzeroMappingReport,
  makeNodeBudgetReport,
  makeNonMealDistortedReport,
  makeValidationTwoFailureReport,
} from './calibration-authoritative-fixtures';
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';
import { NutritionEvalReportSchema } from '../../src/nutrition-eval/schema';
import type {
  NutritionCaseResult,
  NutritionEvalReport,
} from '../../src/nutrition-eval/schema';
import type { CalibrationMealMetrics } from '../../src/nutrition-eval/calibration';
import type { Node as TsNode } from 'typescript';

const MEASURE_PATH = '../../src/nutrition-eval/calibration-report-measurements';
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

/**
 * Test-local structural types matching the approved pure-bridge exports.
 * CalibrationStageGateMetrics has no carbsZeroTruthCount; zero-truth
 * count/absolute medians live in report.summary. Runtime counters
 * (visionCallCount and the three supplied-barcode counters) must be absent.
 */
interface MeasuredProfileMetrics {
  readonly unsafeCount: number;
  readonly parseCount: number;
  readonly catastrophicCount: number;
  readonly meanZeroSafeMacroError?: number;
  readonly medianKcalError?: number;
  readonly p90AnalysisLatencyMs?: number;
}

interface MeasuredStageMetrics {
  readonly totalCases?: number;
  readonly runCases?: number;
  readonly totalOutcomes?: number;
  readonly parseCases?: number;
  readonly unsafeCompletionCount?: number;
  readonly failureCount?: number;
  readonly catastrophicCount?: number;
  readonly medianRelativeCalorieError?: number;
  readonly p90RelativeCalorieError?: number;
  readonly meanZeroSafeMacroRelativeError?: number;
  readonly medianProteinRelativeError?: number;
  readonly medianCarbsRelativeError?: number;
  readonly medianFatRelativeError?: number;
  readonly medianMealMassRelativeError?: number;
  readonly p90AnalysisLatencyMs?: number;
  readonly parsedMealCount?: number;
  readonly mealMassEligibleCount?: number;
  readonly mealDensityCoverageCount?: number;
  readonly mealCarbDensityEligibleCount?: number;
  readonly mealFatDensityEligibleCount?: number;
  readonly meanMacroRelativeError?: number;
  readonly meanMealMassRelativeError?: number;
  readonly meanMealCarbDensityRelativeError?: number;
  readonly meanMealFatDensityRelativeError?: number;
  readonly medianMealProteinRelativeError?: number;
  readonly medianMealCarbsRelativeError?: number;
  readonly medianMealFatRelativeError?: number;
  readonly mealOutcomeCount?: number;
  readonly suppliedBarcodeOutcomeCount?: number;
  readonly labelOutcomeCount?: number;
  readonly visionCallCount?: number;
  readonly suppliedBarcodeImageCallCount?: number;
  readonly suppliedBarcodeVisionCallCount?: number;
  readonly suppliedBarcodeLiveOffCallCount?: number;
}

interface MeasuredLatency {
  readonly measuredCases: number;
  readonly missingCases: number;
}

interface MeasuredCalibrationReport {
  readonly report: NutritionEvalReport;
  readonly profile: MeasuredProfileMetrics;
  readonly stage: MeasuredStageMetrics;
  readonly latency: MeasuredLatency;
}

type MeasureFn = (value: unknown) => MeasuredCalibrationReport;
type MealHelperFn = (results: readonly NutritionCaseResult[]) => CalibrationMealMetrics;

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value as unknown as Record<string, unknown>;
}

function asUnknownArray(value: unknown): Array<unknown> {
  return value as unknown as Array<unknown>;
}

function cloneMutable(report: NutritionEvalReport): Record<string, unknown> {
  return cloneOwnedReport(report) as unknown as Record<string, unknown>;
}

function caseAt(report: Record<string, unknown>, index: number): Record<string, unknown> {
  return asUnknownArray(report.cases)[index] as unknown as Record<string, unknown>;
}

function predictionAt(report: Record<string, unknown>, index: number): Record<string, unknown> {
  return asRecord(caseAt(report, index).prediction);
}

async function loadMeasure(): Promise<MeasureFn> {
  const mod = (await import(/* @vite-ignore */ MEASURE_PATH)) as unknown as Record<string, unknown>;
  const fn = mod.measureCalibrationStageReport;
  expect(typeof fn).toBe('function');
  return fn as unknown as MeasureFn;
}

async function loadMealHelper(): Promise<MealHelperFn> {
  const mod = (await import(/* @vite-ignore */ MEASURE_PATH)) as unknown as Record<string, unknown>;
  const fn = mod.aggregateCalibrationMealMetrics;
  expect(typeof fn).toBe('function');
  return fn as unknown as MealHelperFn;
}

/** Counts every container (object/array) and primitive value; never counts key names or array `.length`. */
function countJsonNodes(value: unknown): number {
  if (Array.isArray(value)) {
    let count = 1;
    for (const item of value) count += countJsonNodes(item);
    return count;
  }
  if (value !== null && typeof value === 'object') {
    let count = 1;
    for (const key of Object.keys(value as Record<string, unknown>)) {
      count += countJsonNodes((value as Record<string, unknown>)[key]);
    }
    return count;
  }
  return 1;
}

describe('fixture controls (no measurement import)', () => {
  it('development exact has 24 public outcomes with truth from committed training manifest', async () => {
    const report = await makeMeasuredReport({ stage: 'development', profile: 'LOW', scenario: 'exact' });
    expect(report.cases).toHaveLength(24);
    expect(report.publicCases).toBe(24);
    expect(report.privateCases).toBe(0);
    expect(report.samples).toBe(1);
    for (const c of report.cases) {
      expect(c.prediction.parseStatus).toBe('success');
      expect(c.prediction.cached).toBe(false);
      expect(c.prediction.sampleIndex).toBe(1);
    }
  });
  it('validation exact has 48 outcomes and benchmark exact has 60 with 48 reserved images', async () => {
    const validation = await makeMeasuredReport({ stage: 'validation', profile: 'MEDIUM', scenario: 'exact' });
    expect(validation.cases).toHaveLength(48);
    expect(validation.publicCases).toBe(16);
    expect(validation.calibration?.imageCallsReserved).toBe(48);
    const benchmark = await makeMeasuredReport({ stage: 'benchmark', profile: 'MEDIUM', scenario: 'exact' });
    expect(benchmark.cases).toHaveLength(60);
    expect(benchmark.publicCases).toBe(20);
    expect(benchmark.privateCases).toBe(0);
    expect(benchmark.calibration?.imageCallsReserved).toBe(48);
    expect(benchmark.calibration?.safeErrors).toEqual([]);
    expect(benchmark.calibration?.latencyCoverage).toEqual({ measuredCases: 60, missingCases: 0 });
  });
  it('provider failure keeps finite latency with http_5xx safe error; interruption omits latency key', async () => {
    const failed = await makeMeasuredReport({ stage: 'development', profile: 'LOW', scenario: 'provider_failure' });
    const bad = failed.cases.find((c) => c.prediction.parseStatus === 'failure');
    expect(bad).toBeDefined();
    expect(typeof bad!.prediction.latencyMs).toBe('number');
    expect(Number.isFinite(bad!.prediction.latencyMs)).toBe(true);
    expect(failed.calibration?.safeErrors).toEqual([
      { caseId: bad!.caseId, sampleIndex: 1, errorCategory: 'http_5xx' },
    ]);
    expect(failed.calibration?.latencyCoverage).toEqual({ measuredCases: 24, missingCases: 0 });
    const interrupted = await makeMeasuredReport({ stage: 'development', profile: 'LOW', scenario: 'interruption' });
    const cut = interrupted.cases.find((c) => c.prediction.failureCode === 'interrupted_reservation');
    expect(cut).toBeDefined();
    expect(cut!.prediction).not.toHaveProperty('latencyMs');
    expect(interrupted.calibration?.safeErrors).toEqual([
      { caseId: cut!.caseId, sampleIndex: 1, errorCategory: 'interrupted_reservation' },
    ]);
    expect(interrupted.calibration?.latencyCoverage).toEqual({ measuredCases: 23, missingCases: 1 });
  });
  it('missing_diagnostic predictions carry no diagnostics key at all', async () => {
    const report = await makeMeasuredReport({ stage: 'development', profile: 'LOW', scenario: 'missing_diagnostic' });
    expect(report.cases).toHaveLength(24);
    for (const c of report.cases) {
      expect(c.prediction).not.toHaveProperty('diagnostics');
    }
  });
  it('node-budget fixture is schema-valid and exceeds the 20000-node graph bound', async () => {
    const report = await makeNodeBudgetReport({ profile: 'MEDIUM' });
    expect(report.cases).toHaveLength(60);
    const pairs = new Set(report.cases.map((c) => `${c.caseId}:${c.prediction.sampleIndex}`));
    expect(pairs.size).toBe(60);
    for (const c of report.cases) {
      expect(c.prediction.cached).toBe(false);
      expect(c.prediction.parseStatus).toBe('success');
      expect(c.prediction.reviewReasons).toHaveLength(256);
    }
    expect(report.summary.parseCases).toBe(60);
    const parsed = NutritionEvalReportSchema.safeParse(report);
    expect(parsed.success).toBe(true);
    expect(countJsonNodes(report)).toBeGreaterThan(20000);
  });
  it('meal-median discriminator fixture is schema-valid with literal eligibility/medians and legacy parity', async () => {
    const report = await makeMealMedianDiscriminatorReport({ profile: 'MEDIUM' });
    expect(report.cases).toHaveLength(60);
    expect(report.summary.parseCases).toBe(60);
    const failed = report.cases.filter((c) => c.prediction.parseStatus === 'failure');
    expect(failed).toHaveLength(0);
    expect(report.summary.catastrophicCount).toBe(24);
    expect(report.summary.unsafeCompletionCount).toBe(24);
    expect(report.summary.proteinEligibleCount).toBe(54);
    expect(report.summary.carbsEligibleCount).toBe(54);
    expect(report.summary.fatEligibleCount).toBe(54);
    expect(report.summary.medianProteinRelativeError).toBeCloseTo(3, 9);
    expect(report.summary.medianCarbsRelativeError).toBeCloseTo(3, 9);
    expect(report.summary.medianFatRelativeError).toBeCloseTo(3, 9);
    expect(report.summary.parsedMealCount).toBe(36);
    expect(report.summary.mealMassEligibleCount).toBe(36);
    expect(report.summary.mealDensityCoverageCount).toBe(36);
    expect(report.summary.mealCarbDensityEligibleCount).toBe(33);
    expect(report.summary.mealFatDensityEligibleCount).toBe(36);
    expect(report.summary.meanMealFatDensityRelativeError).toBeCloseTo(2, 9);
    expect(report.summary.meanMealCarbDensityRelativeError).toBeCloseTo(21 / 11, 9);
    expect(report.summary.meanMealMassRelativeError).toBe(0);
    expect(report.summary.medianMealMassRelativeError).toBe(0);
    const { aggregateCalibrationMealMetrics } = await import(
      '../../src/nutrition-eval/calibration'
    );
    const legacy = aggregateCalibrationMealMetrics(report.cases);
    expect(legacy.parsedMealCount).toBe(36);
    expect(legacy.proteinEligibleCount).toBe(36);
    expect(legacy.carbsEligibleCount).toBe(33);
    expect(legacy.fatEligibleCount).toBe(36);
    expect(legacy.medianMealProteinRelativeError).toBeCloseTo(2, 9);
    expect(legacy.medianMealCarbsRelativeError).toBeCloseTo(1, 9);
    expect(legacy.medianMealFatRelativeError).toBeCloseTo(2, 9);
    const parsed = NutritionEvalReportSchema.safeParse(report);
    expect(parsed.success).toBe(true);
  });
  it('nonzero-mapping fixture is schema-valid with literal kcal/mass/density relative errors', async () => {
    const report = await makeNonzeroMappingReport();
    expect(report.cases).toHaveLength(1);
    expect(report.summary.parseCases).toBe(1);
    expect(report.summary.medianRelativeCalorieError).toBeCloseTo(0.5, 9);
    expect(report.summary.p90RelativeCalorieError).toBeCloseTo(0.5, 9);
    expect(report.summary.meanMealMassRelativeError).toBeCloseTo(1, 9);
    expect(report.summary.medianMealMassRelativeError).toBeCloseTo(1, 9);
    expect(report.summary.mealDensityCoverageCount).toBe(1);
    expect(report.summary.meanMealCarbDensityRelativeError).toBeCloseTo(0.5, 9);
    expect(report.summary.meanMealFatDensityRelativeError).toBeCloseTo(0.5, 9);
    const parsed = NutritionEvalReportSchema.safeParse(report);
    expect(parsed.success).toBe(true);
  });
});

describe('pure bridge representative mapping (breaks wrong denominator/branch)', () => {
  it('development LOW exact maps profile/stage/latency and freezes owned report', async () => {
    const report = await makeMeasuredReport({ stage: 'development', profile: 'LOW', scenario: 'exact' });
    const callerJson = JSON.stringify(report);
    const measure = await loadMeasure();
    const measured = measure(report);
    expect(measured.profile.unsafeCount).toBe(0);
    expect(measured.profile.parseCount).toBe(24);
    expect(measured.profile.catastrophicCount).toBe(0);
    expect(measured.profile.meanZeroSafeMacroError).toBe(0);
    expect(measured.profile.medianKcalError).toBe(0);
    expect(measured.profile.p90AnalysisLatencyMs).toBe(1500);
    expect(measured.stage.totalCases).toBe(24);
    expect(measured.stage.runCases).toBe(24);
    expect(measured.stage.totalOutcomes).toBe(24);
    expect(measured.stage.parseCases).toBe(24);
    expect(measured.stage.unsafeCompletionCount).toBe(0);
    expect(measured.stage.failureCount).toBe(0);
    expect(measured.stage.catastrophicCount).toBe(0);
    expect(measured.stage.medianRelativeCalorieError).toBe(0);
    expect(measured.stage.p90RelativeCalorieError).toBe(0);
    expect(measured.stage.meanZeroSafeMacroRelativeError).toBe(0);
    expect(measured.stage.medianProteinRelativeError).toBe(0);
    expect(measured.stage.medianCarbsRelativeError).toBe(0);
    expect(measured.stage.medianFatRelativeError).toBe(0);
    expect(measured.stage.medianMealMassRelativeError).toBe(0);
    expect(measured.stage.p90AnalysisLatencyMs).toBe(1500);
    expect(measured.stage.parsedMealCount).toBe(24);
    expect(measured.stage.mealMassEligibleCount).toBe(24);
    expect(measured.stage.mealDensityCoverageCount).toBe(24);
    expect(measured.stage.mealCarbDensityEligibleCount).toBe(report.summary.mealCarbDensityEligibleCount);
    expect(measured.stage.mealFatDensityEligibleCount).toBe(24);
    expect(measured.stage.meanMacroRelativeError).toBe(0);
    expect(measured.stage.meanMealMassRelativeError).toBe(0);
    expect(measured.stage.meanMealCarbDensityRelativeError).toBe(0);
    expect(measured.stage.meanMealFatDensityRelativeError).toBe(0);
    expect(measured.stage.medianMealProteinRelativeError).toBe(0);
    expect(measured.stage.medianMealCarbsRelativeError).toBe(0);
    expect(measured.stage.medianMealFatRelativeError).toBe(0);
    expect(measured.stage.mealOutcomeCount).toBe(24);
    expect(measured.stage.suppliedBarcodeOutcomeCount).toBe(0);
    expect(measured.stage.labelOutcomeCount).toBe(0);
    expect(measured.latency).toEqual({ measuredCases: 24, missingCases: 0 });
    for (const counter of ['visionCallCount', 'suppliedBarcodeImageCallCount', 'suppliedBarcodeVisionCallCount', 'suppliedBarcodeLiveOffCallCount']) {
      expect(hasOwn(measured.stage, counter)).toBe(false);
    }
    expect(Object.isFrozen(measured.report.cases)).toBe(true);
    expect(JSON.stringify(report)).toBe(callerJson);
  });
  it('exact mirror yields literal zero errors and p90 latency 1500 (breaks scorer-drift mapping)', async () => {
    const report = await makeMeasuredReport({ stage: 'development', profile: 'LOW', scenario: 'exact' });
    const measure = await loadMeasure();
    const measured = measure(report);
    expect(measured.profile.unsafeCount).toBe(0);
    expect(measured.profile.catastrophicCount).toBe(0);
    expect(measured.profile.meanZeroSafeMacroError).toBe(0);
    expect(measured.profile.medianKcalError).toBe(0);
    expect(measured.profile.p90AnalysisLatencyMs).toBe(1500);
    expect(measured.stage.failureCount).toBe(0);
    expect(measured.stage.parseCases).toBe(24);
  });
  it('benchmark meal medians stay zero despite barcode/label outcomes; 33/36 density split holds', async () => {
    const report = await makeMeasuredReport({ stage: 'benchmark', profile: 'MEDIUM', scenario: 'exact' });
    const measure = await loadMeasure();
    const measured = measure(report);
    expect(measured.stage.mealOutcomeCount).toBe(36);
    expect(measured.stage.parsedMealCount).toBe(36);
    expect(measured.stage.mealDensityCoverageCount).toBe(36);
    expect(measured.stage.mealCarbDensityEligibleCount).toBe(33);
    expect(measured.stage.mealFatDensityEligibleCount).toBe(36);
    expect(measured.stage.medianMealProteinRelativeError).toBe(0);
    expect(measured.stage.medianMealCarbsRelativeError).toBe(0);
    expect(measured.stage.medianMealFatRelativeError).toBe(0);
  });
  it('moved meal helper matches existing calibration export on benchmark (breaks moved-math drift)', async () => {
    const report = await makeMeasuredReport({ stage: 'benchmark', profile: 'MEDIUM', scenario: 'exact' });
    const { aggregateCalibrationMealMetrics } = await import(
      '../../src/nutrition-eval/calibration'
    );
    const legacy = aggregateCalibrationMealMetrics(report.cases);
    expect(legacy.parsedMealCount).toBe(36);
    expect(legacy.carbsEligibleCount).toBe(33);
    const next = await loadMealHelper();
    expect(next(report.cases)).toEqual(legacy);
  });
  it('forged schema-valid summary is rejected by recomputation (breaks trust-caller-summary)', async () => {
    const report = await makeMeasuredReport({ stage: 'development', profile: 'LOW', scenario: 'exact' });
    const forged = cloneMutable(report);
    asRecord(forged.summary).medianRelativeCalorieError = 999;
    const measure = await loadMeasure();
    expect(() => measure(forged)).toThrow('calibration:report-measurements-invalid');
  });
  it('duplicate case/sample pairs are rejected while schema-valid (breaks double-count)', async () => {
    const report = await makeMeasuredReport({ stage: 'development', profile: 'LOW', scenario: 'exact' });
    const duped = cloneMutable(report);
    const first = caseAt(duped, 0);
    const second = caseAt(duped, 1);
    expect(predictionAt(duped, 0).sampleIndex).toBe(1);
    expect(predictionAt(duped, 1).sampleIndex).toBe(1);
    second.caseId = first.caseId;
    const parsed = NutritionEvalReportSchema.safeParse(duped);
    expect(parsed.success).toBe(true);
    const measure = await loadMeasure();
    expect(() => measure(duped)).toThrow('calibration:report-measurements-invalid');
  });
  it('cached predictions are rejected (breaks stale-cache admission)', async () => {
    const report = await makeMeasuredReport({ stage: 'development', profile: 'LOW', scenario: 'exact' });
    const tainted = cloneMutable(report);
    predictionAt(tainted, 0).cached = true;
    const measure = await loadMeasure();
    expect(() => measure(tainted)).toThrow('calibration:report-measurements-invalid');
  });
  it('hostile accessors/cycles/symbols fail fresh and causeless without getter runs', async () => {
    const report = await makeMeasuredReport({ stage: 'development', profile: 'LOW', scenario: 'exact' });
    const measure = await loadMeasure();
    let getterCalls = 0;
    const evil = cloneMutable(report);
    Object.defineProperty(evil, 'extra', { enumerable: true, get: () => { getterCalls += 1; return 1; } });
    let caught: unknown;
    try { measure(evil); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect((caught as Error).message).toBe('calibration:report-measurements-invalid');
    expect(asRecord(caught).cause).toBeUndefined();
    expect(getterCalls).toBe(0);
    const cyclic = cloneMutable(report);
    const cyclicPrediction = predictionAt(cyclic, 0);
    cyclicPrediction.self = cyclicPrediction;
    expect(() => measure(cyclic)).toThrow('calibration:report-measurements-invalid');
    const second: unknown = (() => { try { measure(evil); } catch (error) { return error; } })();
    expect(second).toBeInstanceOf(CalibrationFatalError);
    expect(second).not.toBe(caught);
  });
  it('pure module transitive runtime graph excludes impure couplings', async () => {
    const ts = (await import(/* @vite-ignore */ 'typescript')) as unknown as typeof import('typescript');
    const entry = resolve(repoRoot, 'functions/src/nutrition-eval/calibration-report-measurements.ts');
    try {
      readFileSync(entry, 'utf8');
    } catch {
      throw new Error('measurement entry missing before source');
    }
    const FS_BUILTINS = new Set(['fs', 'fs/promises', 'node:fs', 'node:fs/promises']);
    const PERMITTED_EXTERNALS = new Set(['zod', 'crypto', 'node:crypto']);
    const BANNED_BASENAME_FRAGMENTS = [
      'calibration-bootstrap',
      'calibration-cli',
      'calibration-corpus',
      'calibration-file-store',
      'calibration-report-journal',
      'calibration-report-state',
      'calibration-report-publication',
      'calibration-report-artifact-verification',
      'calibration-report-reconstructor',
      'calibration-preflight',
      'calibration-protocol',
      'calibration-replay',
      'calibration-safe-error',
      'historical-reference',
      'live-adapter',
      'off-snapshot-store',
      'private-overlay',
      'image-metadata',
    ];
    const state = { runtimeRequire: false, runtimeDynamicImport: false };
    const collectRuntimeSpecifiers = (filePath: string, source: string): string[] => {
      const file = ts.createSourceFile(filePath, source, ts.ScriptTarget.ES2022, true);
      const specs: string[] = [];
      const visit = (node: TsNode): void => {
        if (ts.isImportDeclaration(node)) {
          const clause = node.importClause;
          const spec = (node.moduleSpecifier as unknown as { readonly text: string }).text;
          let runtime = true;
          if (clause?.isTypeOnly === true) {
            runtime = false;
          } else if (clause !== undefined) {
            const named = clause.namedBindings;
            if (clause.name === undefined && named !== undefined && ts.isNamedImports(named)) {
              const elements = named.elements;
              runtime = elements.length > 0 && elements.some((el) => el.isTypeOnly !== true);
            }
          }
          if (runtime) specs.push(spec);
        } else if (ts.isExportDeclaration(node)) {
          if (node.isTypeOnly !== true && node.moduleSpecifier !== undefined) {
            const spec = (node.moduleSpecifier as unknown as { readonly text: string }).text;
            const named = node.exportClause;
            if (named === undefined || ts.isNamespaceExport(named)) {
              specs.push(spec);
            } else if (ts.isNamedExports(named)) {
              const elements = named.elements;
              if (elements.some((el) => el.isTypeOnly !== true)) specs.push(spec);
            }
          }
        } else if (ts.isCallExpression(node)) {
          const callee = node.expression;
          if (ts.isIdentifier(callee) && callee.text === 'require') {
            state.runtimeRequire = true;
          } else if (callee.kind === ts.SyntaxKind.ImportKeyword) {
            state.runtimeDynamicImport = true;
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(file);
      return specs;
    };
    const visited = new Set<string>([entry]);
    const queue: string[] = [entry];
    const directRuntime: string[] = [];
    let isEntry = true;
    while (queue.length > 0) {
      const current = queue.shift() as string;
      let source: string;
      try {
        source = readFileSync(current, 'utf8');
      } catch {
        throw new Error(`unresolvable transitive runtime import: ${current}`);
      }
      const specs = collectRuntimeSpecifiers(current, source);
      if (isEntry) {
        directRuntime.push(...specs);
        isEntry = false;
      }
      for (const spec of specs) {
        if (FS_BUILTINS.has(spec)) {
          throw new Error(`banned builtin runtime import: ${spec} from ${current}`);
        }
        if (PERMITTED_EXTERNALS.has(spec)) continue;
        if (!spec.startsWith('.')) {
          throw new Error(`unexpected external runtime import: ${spec} from ${current}`);
        }
        const base = resolve(current, '..', spec);
        const candidates = [`${base}.ts`, resolve(base, 'index.ts')];
        let target: string | undefined;
        for (const candidate of candidates) {
          try {
            readFileSync(candidate, 'utf8');
            target = candidate;
            break;
          } catch {
            continue;
          }
        }
        if (target === undefined) {
          throw new Error(`unresolvable relative runtime import: ${spec} from ${current}`);
        }
        const basename = target.split('/').pop() ?? target;
        if (basename !== 'calibration-report-measurements.ts') {
          if (basename === 'report.ts' || basename === 'calibration.ts' || basename === 'runner.ts') {
            throw new Error(`banned transitive runtime import: ${spec} -> ${basename}`);
          }
          for (const fragment of BANNED_BASENAME_FRAGMENTS) {
            if (basename.includes(fragment)) {
              throw new Error(`banned transitive runtime import: ${spec} -> ${basename}`);
            }
          }
          if (/provider/i.test(basename) || /provider/i.test(spec)) {
            throw new Error(`banned provider runtime import: ${spec} -> ${basename}`);
          }
        }
        if (!visited.has(target)) {
          visited.add(target);
          queue.push(target);
        }
      }
    }
    expect(directRuntime).toContain('./schema');
    expect(directRuntime).toContain('./scorer');
    expect(directRuntime.some((spec) => spec === './calibration')).toBe(false);
    expect(state.runtimeRequire).toBe(false);
    expect(state.runtimeDynamicImport).toBe(false);
  });
  it('zero-truth scenario preserves absolute errors and zero-safe contribution in report summary', async () => {
    const report = await makeMeasuredReport({ stage: 'benchmark', profile: 'MEDIUM', scenario: 'zero_truth' });
    const zeros = report.cases.filter((c) => c.truth && (c.truth.proteinG === 0 || c.truth.carbsG === 0 || c.truth.fatG === 0));
    expect(zeros.length).toBeGreaterThan(0);
    for (const z of zeros) {
      expect(z.prediction.parseStatus).toBe('success');
    }
    const zeroCarb = report.cases.filter((c) => c.truth?.carbsG === 0 && c.prediction.parseStatus === 'success');
    expect(zeroCarb.length).toBeGreaterThan(0);
    for (const z of zeroCarb) {
      expect(z.prediction.carbsG).toBe(10);
      expect(z.numeric.carbsG?.absoluteError).toBe(10);
    }
    expect(report.summary.carbsZeroTruthCount).toBeGreaterThan(0);
    expect(report.summary.carbsZeroTruthMeanAbsoluteError).toBe(10);
    expect(report.summary.carbsZeroTruthMedianAbsoluteError).toBe(10);
    const measure = await loadMeasure();
    const measured = measure(report);
    expect(measured.report.summary.carbsZeroTruthCount).toBe(report.summary.carbsZeroTruthCount);
    expect(measured.report.summary.carbsZeroTruthMeanAbsoluteError).toBe(10);
    expect(measured.report.summary.carbsZeroTruthMedianAbsoluteError).toBe(10);
    expect(measured.report.summary.meanZeroSafeMacroRelativeError).toBe(
      report.summary.meanZeroSafeMacroRelativeError,
    );
    expect(hasOwn(measured.stage, 'carbsZeroTruthCount')).toBe(false);
    expect(measured.profile.parseCount).toBe(60);
  });
  it('missing diagnostics drop mass/density optionals while keeping parse counts (breaks zero-fill)', async () => {
    const report = await makeMeasuredReport({ stage: 'development', profile: 'LOW', scenario: 'missing_diagnostic' });
    const measure = await loadMeasure();
    const measured = measure(report);
    expect(measured.profile.parseCount).toBe(24);
    expect(measured.stage.totalOutcomes).toBe(24);
    expect(hasOwn(measured.stage, 'meanMealMassRelativeError')).toBe(false);
    expect(hasOwn(measured.stage, 'medianMealMassRelativeError')).toBe(false);
    expect(hasOwn(measured.stage, 'meanMealCarbDensityRelativeError')).toBe(false);
    expect(hasOwn(measured.stage, 'meanMealFatDensityRelativeError')).toBe(false);
    expect(hasOwn(measured.report.summary, 'meanMealMassRelativeError')).toBe(false);
    expect(hasOwn(measured.report.summary, 'medianMealMassRelativeError')).toBe(false);
  });
  it('non-calibration reports and present-undefined fields are rejected (breaks foreign admission)', async () => {
    const report = await makeMeasuredReport({ stage: 'development', profile: 'LOW', scenario: 'exact' });
    const measure = await loadMeasure();
    const stripped = cloneMutable(report);
    Reflect.deleteProperty(stripped, 'calibration');
    expect(() => measure(stripped)).toThrow('calibration:report-measurements-invalid');
    const undefed = cloneMutable(report);
    predictionAt(undefed, 0).kcal = undefined;
    expect(() => measure(undefed)).toThrow('calibration:report-measurements-invalid');
  });
  it('rejects strings beyond 4096 code units while a 4096-length runId measures', async () => {
    const report = await makeMeasuredReport({ stage: 'development', profile: 'LOW', scenario: 'exact' });
    const big = cloneMutable(report);
    big.runId = `x${'y'.repeat(5000)}`;
    const atLimit = cloneMutable(report);
    atLimit.runId = 'r'.repeat(4096);
    const overLimit = cloneMutable(report);
    overLimit.runId = 'r'.repeat(4097);
    expect(NutritionEvalReportSchema.safeParse(big).success).toBe(true);
    expect(NutritionEvalReportSchema.safeParse(atLimit).success).toBe(true);
    expect(NutritionEvalReportSchema.safeParse(overLimit).success).toBe(true);
    const measure = await loadMeasure();
    expect(() => measure(big)).toThrow('calibration:report-measurements-invalid');
    const measuredAtLimit = measure(atLimit);
    expect(measuredAtLimit.profile.parseCount).toBe(24);
    expect(() => measure(overLimit)).toThrow('calibration:report-measurements-invalid');
  });
});

describe('validation two-failure genuine population (46 parsed / 48 outcomes)', () => {
  it('fixture holds 48 outcomes with 46 parsed and full finite latency coverage', async () => {
    const report = await makeValidationTwoFailureReport({ profile: 'MEDIUM' });
    expect(report.cases).toHaveLength(48);
    expect(report.publicCases).toBe(16);
    const parsed = report.cases.filter((c) => c.prediction.parseStatus === 'success');
    expect(parsed).toHaveLength(46);
    const failed = report.cases.filter((c) => c.prediction.parseStatus === 'failure');
    expect(failed).toHaveLength(2);
    for (const f of failed) {
      expect(typeof f.prediction.latencyMs).toBe('number');
      expect(Number.isFinite(f.prediction.latencyMs)).toBe(true);
    }
    for (const c of parsed) {
      expect(c.prediction.sampleIndex).toBeGreaterThanOrEqual(1);
    }
    expect(report.summary.parseCases).toBe(46);
    expect(report.summary.mealCarbDensityEligibleCount).toBe(46);
    expect(report.summary.mealFatDensityEligibleCount).toBe(46);
    expect(report.calibration?.safeErrors).toHaveLength(2);
    expect(report.calibration?.latencyCoverage).toEqual({ measuredCases: 48, missingCases: 0 });
  });
  it('measures 46 parsed meals with matched eligible diagnostics and failureCount 2', async () => {
    const report = await makeValidationTwoFailureReport({ profile: 'MEDIUM' });
    const measure = await loadMeasure();
    const measured = measure(report);
    expect(measured.profile.parseCount).toBe(46);
    expect(measured.stage.totalOutcomes).toBe(48);
    expect(measured.stage.parseCases).toBe(46);
    expect(measured.stage.failureCount).toBe(2);
    expect(measured.stage.parsedMealCount).toBe(46);
    expect(measured.stage.mealMassEligibleCount).toBe(46);
    expect(measured.stage.mealDensityCoverageCount).toBe(46);
    expect(measured.stage.mealCarbDensityEligibleCount).toBe(46);
    expect(measured.stage.mealFatDensityEligibleCount).toBe(46);
    expect(measured.latency).toEqual({ measuredCases: 48, missingCases: 0 });
    expect(Number.isFinite(measured.profile.p90AnalysisLatencyMs)).toBe(true);
    expect(Number.isFinite(measured.stage.p90AnalysisLatencyMs)).toBe(true);
    expect(measured.profile.p90AnalysisLatencyMs).toBe(report.summary.latencyMs?.p90);
  });
});

describe('failure and empty populations', () => {
  it('ordinary failure keeps finite latency while interruption omits it', async () => {
    const measure = await loadMeasure();
    const failed = await makeMeasuredReport({ stage: 'development', profile: 'LOW', scenario: 'provider_failure' });
    const failedMeasured = measure(failed);
    expect(failedMeasured.profile.parseCount).toBe(23);
    expect(failedMeasured.stage.parseCases).toBe(23);
    expect(failedMeasured.stage.failureCount).toBe(1);
    expect(failedMeasured.latency).toEqual({ measuredCases: 24, missingCases: 0 });
    expect(Number.isFinite(failedMeasured.profile.p90AnalysisLatencyMs)).toBe(true);
    expect(failedMeasured.profile.p90AnalysisLatencyMs).toBe(failed.summary.latencyMs?.p90);
    const cut = await makeMeasuredReport({ stage: 'development', profile: 'LOW', scenario: 'interruption' });
    const cutMeasured = measure(cut);
    expect(cutMeasured.profile.parseCount).toBe(23);
    expect(cutMeasured.stage.parseCases).toBe(23);
    expect(cutMeasured.stage.failureCount).toBe(1);
    expect(cutMeasured.latency).toEqual({ measuredCases: 23, missingCases: 1 });
    expect(cutMeasured.profile.p90AnalysisLatencyMs).toBe(1500);
    expect(cutMeasured.stage.p90AnalysisLatencyMs).toBe(1500);
  });
  it('all-failure report has zero parses with required zero aggregates and finite latency', async () => {
    const report = await makeAllFailureReport({ stage: 'development', profile: 'LOW' });
    expect(report.cases).toHaveLength(24);
    for (const c of report.cases) {
      expect(c.prediction.parseStatus).toBe('failure');
    }
    expect(report.summary.parseCases).toBe(0);
    expect(report.summary.medianRelativeCalorieError).toBe(0);
    expect(report.summary.meanMacroRelativeError).toBe(0);
    expect(report.calibration?.latencyCoverage).toEqual({ measuredCases: 24, missingCases: 0 });
    const measure = await loadMeasure();
    const measured = measure(report);
    expect(measured.profile.parseCount).toBe(0);
    expect(measured.profile.unsafeCount).toBe(0);
    expect(measured.profile.catastrophicCount).toBe(0);
    expect(measured.profile.medianKcalError).toBe(0);
    expect(hasOwn(measured.profile, 'meanZeroSafeMacroError')).toBe(false);
    expect(measured.profile.p90AnalysisLatencyMs).toBe(report.summary.latencyMs?.p90);
    expect(measured.stage.parseCases).toBe(0);
    expect(measured.stage.failureCount).toBe(24);
    expect(measured.stage.medianRelativeCalorieError).toBe(0);
    expect(measured.stage.meanMacroRelativeError).toBe(0);
    expect(hasOwn(measured.stage, 'meanZeroSafeMacroRelativeError')).toBe(false);
    expect(measured.stage.p90AnalysisLatencyMs).toBe(report.summary.latencyMs?.p90);
    expect(measured.latency).toEqual({ measuredCases: 24, missingCases: 0 });
  });
  it('benchmark all-failure report splits image provider failures from barcode product failures', async () => {
    const report = await makeAllFailureReport({ stage: 'benchmark', profile: 'MEDIUM' });
    expect(report.cases).toHaveLength(60);
    for (const c of report.cases) {
      expect(c.prediction.parseStatus).toBe('failure');
    }
    expect(report.summary.parseCases).toBe(0);
    expect(report.summary.totalCases).toBe(60);
    const barcodeFailures = report.cases.filter((c) => c.prediction.source === 'barcode');
    expect(barcodeFailures).toHaveLength(12);
    for (const c of barcodeFailures) {
      expect(c.prediction.failureCategory).toBe('product');
      expect(c.prediction.cached).toBe(false);
      expect(c.prediction.latencyMs).toBe(200);
    }
    const nonBarcodeFailures = report.cases.filter((c) => c.prediction.source !== 'barcode');
    expect(nonBarcodeFailures).toHaveLength(48);
    for (const c of nonBarcodeFailures) {
      expect(c.prediction.failureCategory).toBe('provider');
      expect(c.prediction.latencyMs).toBe(200);
    }
    expect(report.calibration?.imageCallsReserved).toBe(48);
    expect(report.calibration?.imageCallsCompleted).toBe(0);
    expect(report.calibration?.imageCallsFailed).toBe(48);
    expect(report.calibration?.safeErrors).toHaveLength(48);
    expect(report.calibration?.latencyCoverage).toEqual({ measuredCases: 60, missingCases: 0 });
  });
  it('measures benchmark all-failure outcomes with failureCount 60, not the 48 image-only count', async () => {
    const report = await makeAllFailureReport({ stage: 'benchmark', profile: 'MEDIUM' });
    const measure = await loadMeasure();
    const measured = measure(report);
    expect(measured.profile.parseCount).toBe(0);
    expect(measured.stage.totalOutcomes).toBe(60);
    expect(measured.stage.parseCases).toBe(0);
    expect(measured.stage.failureCount).toBe(60);
    expect(measured.stage.mealOutcomeCount).toBe(36);
    expect(measured.stage.labelOutcomeCount).toBe(12);
    expect(measured.stage.suppliedBarcodeOutcomeCount).toBe(12);
    expect(measured.latency).toEqual({ measuredCases: 60, missingCases: 0 });
  });
  it('empty report has absent latency and downstream metrics with required zero aggregates', async () => {
    const report = await makeEmptyCalibrationReport({ stage: 'development', profile: 'LOW' });
    expect(report.cases).toHaveLength(0);
    expect(report.summary.medianRelativeCalorieError).toBe(0);
    expect(report.summary.meanMacroRelativeError).toBe(0);
    expect(hasOwn(report.summary, 'latencyMs')).toBe(false);
    const measure = await loadMeasure();
    const measured = measure(report);
    expect(measured.profile.parseCount).toBe(0);
    expect(measured.profile.medianKcalError).toBe(0);
    expect(hasOwn(measured.profile, 'meanZeroSafeMacroError')).toBe(false);
    expect(hasOwn(measured.profile, 'p90AnalysisLatencyMs')).toBe(false);
    expect(measured.stage.totalOutcomes).toBe(0);
    expect(measured.stage.parseCases).toBe(0);
    expect(measured.stage.failureCount).toBe(0);
    expect(measured.stage.medianRelativeCalorieError).toBe(0);
    expect(measured.stage.meanMacroRelativeError).toBe(0);
    expect(hasOwn(measured.stage, 'meanZeroSafeMacroRelativeError')).toBe(false);
    expect(hasOwn(measured.stage, 'p90AnalysisLatencyMs')).toBe(false);
    expect(hasOwn(measured.report.summary, 'latencyMs')).toBe(false);
    expect(measured.latency).toEqual({ measuredCases: 0, missingCases: 0 });
  });
});

describe('latency interpolation and summary integrity', () => {
  it('nonconstant latencies interpolate p50 and p90 literally', async () => {
    const report = await makeLatencyControlReport();
    expect(report.cases).toHaveLength(3);
    expect(report.summary.latencyMs?.min).toBe(1);
    expect(report.summary.latencyMs?.max).toBe(10);
    expect(report.summary.latencyMs?.median).toBe(2);
    expect(report.summary.latencyMs?.p90).toBeCloseTo(8.4, 9);
    const measure = await loadMeasure();
    const measured = measure(report);
    expect(measured.report.summary.latencyMs?.min).toBe(1);
    expect(measured.report.summary.latencyMs?.max).toBe(10);
    expect(measured.report.summary.latencyMs?.median).toBe(2);
    expect(measured.report.summary.latencyMs?.p90).toBe(report.summary.latencyMs?.p90);
    expect(measured.report.summary.latencyMs?.p90).toBeCloseTo(8.4, 9);
    expect(measured.profile.p90AnalysisLatencyMs).toBeCloseTo(8.4, 9);
    expect(measured.stage.p90AnalysisLatencyMs).toBeCloseTo(8.4, 9);
    expect(measured.latency).toEqual({ measuredCases: 3, missingCases: 0 });
  });
  it('forged latency summary and forged coverage are rejected', async () => {
    const report = await makeMeasuredReport({ stage: 'development', profile: 'LOW', scenario: 'exact' });
    const measure = await loadMeasure();
    const forgedLatency = cloneMutable(report);
    asRecord(forgedLatency.summary).latencyMs = { min: 1500, max: 1500, median: 1500, p90: 1 };
    expect(() => measure(forgedLatency)).toThrow('calibration:report-measurements-invalid');
    const forgedCoverage = cloneMutable(report);
    asRecord(asRecord(forgedCoverage.calibration).latencyCoverage).measuredCases = 1;
    expect(() => measure(forgedCoverage)).toThrow('calibration:report-measurements-invalid');
    const droppedLatency = cloneMutable(report);
    Reflect.deleteProperty(asRecord(droppedLatency.summary), 'latencyMs');
    expect(() => measure(droppedLatency)).toThrow('calibration:report-measurements-invalid');
  });
  it('unknown fields are rejected rather than stripped', async () => {
    const report = await makeMeasuredReport({ stage: 'development', profile: 'LOW', scenario: 'exact' });
    const measure = await loadMeasure();
    const topUnknown = cloneMutable(report);
    topUnknown.unknownField = 1;
    expect(() => measure(topUnknown)).toThrow('calibration:report-measurements-invalid');
    const nestedUnknown = cloneMutable(report);
    predictionAt(nestedUnknown, 0).unknownField = 'x';
    expect(() => measure(nestedUnknown)).toThrow('calibration:report-measurements-invalid');
    const truthUnknown = cloneMutable(report);
    asRecord(caseAt(truthUnknown, 0).truth).unknownField = 1;
    expect(() => measure(truthUnknown)).toThrow('calibration:report-measurements-invalid');
    const calibrationUnknown = cloneMutable(report);
    asRecord(calibrationUnknown.calibration).unknownField = 'x';
    expect(() => measure(calibrationUnknown)).toThrow('calibration:report-measurements-invalid');
  });
  it('normalized and coerced values are rejected', async () => {
    const report = await makeMeasuredReport({ stage: 'development', profile: 'LOW', scenario: 'exact' });
    const measure = await loadMeasure();
    const padded = cloneMutable(report);
    padded.runId = `  ${String(padded.runId)}  `;
    expect(() => measure(padded)).toThrow('calibration:report-measurements-invalid');
    const coerced = cloneMutable(report);
    asRecord(coerced.summary).totalCases = String(asRecord(coerced.summary).totalCases);
    expect(() => measure(coerced)).toThrow('calibration:report-measurements-invalid');
  });
  it('calibration safeErrors and latencyCoverage are required; sampleIndex and cached identity are required', async () => {
    const report = await makeMeasuredReport({ stage: 'development', profile: 'LOW', scenario: 'exact' });
    const measure = await loadMeasure();
    const noSafeErrors = cloneMutable(report);
    Reflect.deleteProperty(asRecord(noSafeErrors.calibration), 'safeErrors');
    expect(() => measure(noSafeErrors)).toThrow('calibration:report-measurements-invalid');
    const noCoverage = cloneMutable(report);
    Reflect.deleteProperty(asRecord(noCoverage.calibration), 'latencyCoverage');
    expect(() => measure(noCoverage)).toThrow('calibration:report-measurements-invalid');
    const noSample = cloneMutable(report);
    Reflect.deleteProperty(predictionAt(noSample, 0), 'sampleIndex');
    expect(() => measure(noSample)).toThrow('calibration:report-measurements-invalid');
    const noCached = cloneMutable(report);
    Reflect.deleteProperty(predictionAt(noCached, 0), 'cached');
    expect(() => measure(noCached)).toThrow('calibration:report-measurements-invalid');
  });
  it('failures are fresh and causeless; caller stays mutable with deep-owned identity', async () => {
    const report = await makeMeasuredReport({ stage: 'development', profile: 'LOW', scenario: 'exact' });
    const callerJson = JSON.stringify(report);
    const measure = await loadMeasure();
    const first: unknown = (() => {
      try {
        measure(cloneMutable(report));
        return undefined;
      } catch (error) {
        return error;
      }
    })();
    expect(first).toBeUndefined();
    const bad = cloneMutable(report);
    Reflect.deleteProperty(bad, 'calibration');
    let caughtA: unknown;
    let caughtB: unknown;
    try {
      measure(bad);
    } catch (error) {
      caughtA = error;
    }
    try {
      measure(bad);
    } catch (error) {
      caughtB = error;
    }
    expect(caughtA).toBeInstanceOf(CalibrationFatalError);
    expect(caughtB).toBeInstanceOf(CalibrationFatalError);
    expect(caughtA).not.toBe(caughtB);
    expect((caughtA as unknown as Error).message).toBe('calibration:report-measurements-invalid');
    expect(asRecord(caughtA).cause).toBeUndefined();
    const measured = measure(report);
    expect(Object.isFrozen(report)).toBe(false);
    expect(Object.isFrozen(report.cases)).toBe(false);
    expect(Object.isFrozen(measured.report)).toBe(true);
    expect(Object.isFrozen(measured.report.cases)).toBe(true);
    const before = JSON.stringify(measured.report);
    const firstCase = report.cases[0];
    if (firstCase !== undefined) {
      firstCase.prediction.latencyMs = 999999;
    }
    expect(JSON.stringify(measured.report)).toBe(before);
    expect(JSON.stringify(report)).not.toBe(callerJson);
  });
});

describe('descriptor capture matrix', () => {
  it('nested getters are never invoked', async () => {
    const report = await makeMeasuredReport({ stage: 'development', profile: 'LOW', scenario: 'exact' });
    const measure = await loadMeasure();
    let nestedCalls = 0;
    const nested = cloneMutable(report);
    Object.defineProperty(predictionAt(nested, 0), 'kcal', {
      enumerable: true,
      get: (): number => {
        nestedCalls += 1;
        return 0;
      },
    });
    expect(() => measure(nested)).toThrow('calibration:report-measurements-invalid');
    expect(nestedCalls).toBe(0);
  });
  it('nonenumerable own fields are rejected', async () => {
    const report = await makeMeasuredReport({ stage: 'development', profile: 'LOW', scenario: 'exact' });
    const measure = await loadMeasure();
    const hiddenTop = cloneMutable(report);
    Object.defineProperty(hiddenTop, 'hidden', { enumerable: false, value: 1 });
    expect(() => measure(hiddenTop)).toThrow('calibration:report-measurements-invalid');
    const hiddenNested = cloneMutable(report);
    Object.defineProperty(predictionAt(hiddenNested, 0), 'hidden', { enumerable: false, value: 2 });
    expect(() => measure(hiddenNested)).toThrow('calibration:report-measurements-invalid');
  });
  it('symbol-keyed fields are rejected', async () => {
    const report = await makeMeasuredReport({ stage: 'development', profile: 'LOW', scenario: 'exact' });
    const measure = await loadMeasure();
    const sym = Symbol('hidden');
    const topSymbol = cloneMutable(report);
    (topSymbol as unknown as Record<symbol, unknown>)[sym] = 1;
    expect(() => measure(topSymbol)).toThrow('calibration:report-measurements-invalid');
    const nestedSymbol = cloneMutable(report);
    (predictionAt(nestedSymbol, 0) as unknown as Record<symbol, unknown>)[sym] = 2;
    expect(() => measure(nestedSymbol)).toThrow('calibration:report-measurements-invalid');
  });
  it('null-prototype root report and nested prediction are accepted with a genuine summary', async () => {
    const report = await makeMeasuredReport({ stage: 'development', profile: 'LOW', scenario: 'exact' });
    const mutable = cloneMutable(report);
    const firstCase = caseAt(mutable, 0);
    const nullPrototypePrediction = Object.assign(
      Object.create(null) as Record<string, unknown>,
      predictionAt(mutable, 0),
    );
    firstCase.prediction = nullPrototypePrediction;
    const nullPrototypeReport = Object.assign(Object.create(null) as Record<string, unknown>, mutable);
    expect(Object.getPrototypeOf(nullPrototypeReport)).toBeNull();
    expect(Object.getPrototypeOf(nullPrototypePrediction)).toBeNull();
    const parsed = NutritionEvalReportSchema.safeParse(nullPrototypeReport);
    expect(parsed.success).toBe(true);
    const measure = await loadMeasure();
    const measured = measure(nullPrototypeReport);
    expect(measured.profile.parseCount).toBe(24);
    expect(measured.stage.totalOutcomes).toBe(24);
    expect(Object.isFrozen(nullPrototypeReport)).toBe(false);
    expect(Object.isFrozen(nullPrototypePrediction)).toBe(false);
    expect(Object.isFrozen(measured.report)).toBe(true);
    expect(Object.isFrozen(measured.report.cases)).toBe(true);
    expect(Object.isFrozen(measured.profile)).toBe(true);
    expect(Object.isFrozen(measured.stage)).toBe(true);
    expect(Object.isFrozen(measured.latency)).toBe(true);
    expect(Object.isFrozen(measured)).toBe(true);
    expect(measured.report).not.toBe(nullPrototypeReport);
    expect(measured.report.cases[0]!.prediction).not.toBe(nullPrototypePrediction);
    expect(Object.isFrozen(measured.report.cases[0]!.prediction)).toBe(true);
  });
  it('foreign object prototypes are rejected', async () => {
    const report = await makeMeasuredReport({ stage: 'development', profile: 'LOW', scenario: 'exact' });
    const measure = await loadMeasure();
    const foreignTop = cloneMutable(report);
    Object.setPrototypeOf(foreignTop, { marker: 1 });
    expect(() => measure(foreignTop)).toThrow('calibration:report-measurements-invalid');
    const foreignNested = cloneMutable(report);
    Object.setPrototypeOf(predictionAt(foreignNested, 0), { marker: 2 });
    expect(() => measure(foreignNested)).toThrow('calibration:report-measurements-invalid');
  });
  it('foreign array prototypes are rejected without getter or coercion reads', async () => {
    const report = await makeMeasuredReport({ stage: 'development', profile: 'LOW', scenario: 'exact' });
    const measure = await loadMeasure();
    let reads = 0;
    const foreignArrayProto: Record<string, unknown> = {};
    Object.defineProperty(foreignArrayProto, 'marker', {
      enumerable: true,
      get: (): number => { reads += 1; return 1; },
    });
    (foreignArrayProto as unknown as { [Symbol.toPrimitive]: () => number })[Symbol.toPrimitive] = (): number => {
      reads += 1;
      return 0;
    };
    const tainted = cloneMutable(report);
    Object.setPrototypeOf(asUnknownArray(tainted.cases), foreignArrayProto);
    expect(() => measure(tainted)).toThrow('calibration:report-measurements-invalid');
    expect(reads).toBe(0);
  });
  it('sparse arrays, extra array keys, and accessor slots are rejected', async () => {
    const report = await makeMeasuredReport({ stage: 'development', profile: 'LOW', scenario: 'exact' });
    const measure = await loadMeasure();
    const sparse = cloneMutable(report);
    Reflect.deleteProperty(asUnknownArray(sparse.cases), '0');
    expect(() => measure(sparse)).toThrow('calibration:report-measurements-invalid');
    const extraKey = cloneMutable(report);
    (asUnknownArray(extraKey.cases) as unknown as Record<string, unknown>).extra = 1;
    expect(() => measure(extraKey)).toThrow('calibration:report-measurements-invalid');
    let slotCalls = 0;
    const accessorSlot = cloneMutable(report);
    Object.defineProperty(asUnknownArray(accessorSlot.cases), '0', {
      enumerable: true,
      get: (): unknown => {
        slotCalls += 1;
        return undefined;
      },
    });
    expect(() => measure(accessorSlot)).toThrow('calibration:report-measurements-invalid');
    expect(slotCalls).toBe(0);
  });
  it('present undefined values are rejected', async () => {
    const report = await makeMeasuredReport({ stage: 'development', profile: 'LOW', scenario: 'exact' });
    const measure = await loadMeasure();
    const undefTop = cloneMutable(report);
    undefTop.extraUndefined = undefined;
    expect(() => measure(undefTop)).toThrow('calibration:report-measurements-invalid');
    const undefDiagnostics = cloneMutable(report);
    predictionAt(undefDiagnostics, 0).diagnostics = undefined;
    expect(() => measure(undefDiagnostics)).toThrow('calibration:report-measurements-invalid');
  });
  it('nested cycles are rejected', async () => {
    const report = await makeMeasuredReport({ stage: 'development', profile: 'LOW', scenario: 'exact' });
    const measure = await loadMeasure();
    const nestedCycle = cloneMutable(report);
    const diagnostics = predictionAt(nestedCycle, 0).diagnostics;
    if (diagnostics !== undefined) {
      asRecord(diagnostics).self = nestedCycle;
    }
    expect(() => measure(nestedCycle)).toThrow('calibration:report-measurements-invalid');
  });
  it('acyclic shared truth references across sibling cases are accepted, not treated as a cycle', async () => {
    const report = await makeMeasuredReport({ stage: 'validation', profile: 'MEDIUM', scenario: 'exact' });
    const callerJson = JSON.stringify(report);
    const mutable = cloneMutable(report);
    const first = caseAt(mutable, 0);
    const second = caseAt(mutable, 1);
    expect(second.caseId).toBe(first.caseId);
    expect(predictionAt(mutable, 0).sampleIndex).toBe(1);
    expect(predictionAt(mutable, 1).sampleIndex).toBe(2);
    expect(second.truth).toEqual(first.truth);
    second.truth = first.truth;
    const parsed = NutritionEvalReportSchema.safeParse(mutable);
    expect(parsed.success).toBe(true);
    const measure = await loadMeasure();
    const measured = measure(mutable);
    expect(measured.profile.parseCount).toBe(48);
    expect(measured.stage.totalOutcomes).toBe(48);
    expect(Object.isFrozen(mutable)).toBe(false);
    expect(Object.isFrozen(measured.report)).toBe(true);
    expect(Object.isFrozen(measured.report.cases)).toBe(true);
    expect(Object.isFrozen(first.truth)).toBe(false);
    const ownedFirstTruth = measured.report.cases[0]!.truth;
    const ownedSecondTruth = measured.report.cases[1]!.truth;
    expect(ownedFirstTruth).not.toBe(first.truth);
    expect(ownedSecondTruth).not.toBe(first.truth);
    expect(Object.isFrozen(ownedFirstTruth)).toBe(true);
    expect(Object.isFrozen(ownedSecondTruth)).toBe(true);
    expect(JSON.stringify(report)).toBe(callerJson);
  });
  it('bigint, function, NaN, and Infinity values are rejected', async () => {
    const report = await makeMeasuredReport({ stage: 'development', profile: 'LOW', scenario: 'exact' });
    const measure = await loadMeasure();
    const mutators: Array<(rec: Record<string, unknown>) => void> = [
      (rec) => {
        predictionAt(rec, 0).confidence = BigInt(10);
      },
      (rec) => {
        predictionAt(rec, 0).decision = () => 'complete';
      },
      (rec) => {
        predictionAt(rec, 0).kcal = Number.NaN;
      },
      (rec) => {
        predictionAt(rec, 0).kcal = Number.POSITIVE_INFINITY;
      },
    ];
    for (const mutate of mutators) {
      const input = cloneMutable(report);
      mutate(input);
      expect(() => measure(input)).toThrow('calibration:report-measurements-invalid');
    }
  });
  it('hostile Proxy descriptor traps yield fresh static errors without foreign reads', async () => {
    const report = await makeMeasuredReport({ stage: 'development', profile: 'LOW', scenario: 'exact' });
    const measure = await loadMeasure();
    let messageReads = 0;
    let causeReads = 0;
    let stackReads = 0;
    const foreign = new Error('foreign-boom');
    Object.defineProperty(foreign, 'message', {
      enumerable: true,
      get: (): string => {
        messageReads += 1;
        return 'foreign-boom';
      },
    });
    Object.defineProperty(foreign, 'cause', {
      enumerable: true,
      get: (): unknown => {
        causeReads += 1;
        return undefined;
      },
    });
    let stackTracked = false;
    try {
      Object.defineProperty(foreign, 'stack', {
        enumerable: true,
        get: (): string => {
          stackReads += 1;
          return 'foreign-stack';
        },
      });
      stackTracked = true;
    } catch {
      stackTracked = false;
    }
    const proxied: unknown = new Proxy(cloneMutable(report), {
      getOwnPropertyDescriptor(): undefined {
        throw foreign;
      },
    });
    let caught: unknown;
    try {
      measure(proxied);
    } catch (error) {
      caught = error;
    }
    expect(messageReads).toBe(0);
    expect(causeReads).toBe(0);
    if (stackTracked) {
      expect(stackReads).toBe(0);
    }
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect(caught === foreign).toBe(false);
    expect((caught as unknown as Error).message).toBe('calibration:report-measurements-invalid');
    expect(asRecord(caught).cause).toBeUndefined();
    expect(messageReads).toBe(0);
    expect(causeReads).toBe(0);
    if (stackTracked) {
      expect(stackReads).toBe(0);
    }
  });
});

describe('capture bounds', () => {
  it('rejects arrays beyond 256 elements while a 256-element array measures', async () => {
    const report = await makeMeasuredReport({ stage: 'development', profile: 'LOW', scenario: 'exact' });
    const measure = await loadMeasure();
    const wide = cloneMutable(report);
    predictionAt(wide, 0).reviewReasons = new Array(300).fill('package_quantity_missing');
    expect(() => measure(wide)).toThrow('calibration:report-measurements-invalid');
    const boundary = cloneMutable(report);
    predictionAt(boundary, 0).reviewReasons = new Array(256).fill('package_quantity_missing');
    const measured = measure(boundary);
    expect(measured.profile.parseCount).toBe(24);
  });
  it('rejects node counts beyond the graph bound without summary drift or other cap violations', async () => {
    const report = await makeNodeBudgetReport({ profile: 'MEDIUM' });
    expect(countJsonNodes(report)).toBeGreaterThan(20000);
    const parsed = NutritionEvalReportSchema.safeParse(report);
    expect(parsed.success).toBe(true);
    const measure = await loadMeasure();
    expect(() => measure(report)).toThrow('calibration:report-measurements-invalid');
  });
  it('rejects nesting beyond the depth bound without ever reflecting the Proxy leaf', async () => {
    const report = await makeMeasuredReport({ stage: 'development', profile: 'LOW', scenario: 'exact' });
    let leafReflections = 0;
    const leaf = new Proxy({}, {
      ownKeys(): Array<string | symbol> {
        leafReflections += 1;
        return [];
      },
      getOwnPropertyDescriptor(): PropertyDescriptor | undefined {
        leafReflections += 1;
        return undefined;
      },
    });
    const deep: Record<string, unknown> = {};
    let cursor = deep;
    for (let i = 0; i < 40; i += 1) {
      const next: Record<string, unknown> = {};
      cursor.nested = next;
      cursor = next;
    }
    cursor.nested = leaf;
    const input = cloneMutable(report);
    input.deep = deep;
    const measure = await loadMeasure();
    expect(() => measure(input)).toThrow('calibration:report-measurements-invalid');
    expect(leafReflections).toBe(0);
  });
  it('rejects a 61st-outcome report only after its own preconditions pass, loading measurement last', async () => {
    const report = await makeMeasuredReport({ stage: 'benchmark', profile: 'MEDIUM', scenario: 'exact' });
    const over = await makeBenchmarkCaseLimitReport({ profile: 'MEDIUM' });
    expect(over.cases).toHaveLength(61);
    expect(over.publicCases).toBe(61);
    expect(over.privateCases).toBe(0);
    expect(over.samples).toBe(1);
    const pairs = new Set(over.cases.map((c) => `${c.caseId}:${c.prediction.sampleIndex}`));
    expect(pairs.size).toBe(61);
    for (const c of over.cases) {
      expect(c.prediction.cached).toBe(false);
      expect(c.prediction.sampleIndex).toBe(1);
      expect(c.caseId.length).toBeLessThanOrEqual(4096);
    }
    expect(over.calibration?.safeErrors ?? []).toHaveLength(0);
    expect(over.calibration?.latencyCoverage).toEqual({ measuredCases: 61, missingCases: 0 });
    const parsed = NutritionEvalReportSchema.safeParse(over);
    expect(parsed.success).toBe(true);
    const measure = await loadMeasure();
    const measured = measure(report);
    expect(measured.stage.totalOutcomes).toBe(60);
    expect(() => measure(over)).toThrow('calibration:report-measurements-invalid');
  });
});

describe('meal-only medians exclude nonmeal distortions', () => {
  it('distorted labels and barcodes shift full-report errors while meal medians stay zero', async () => {
    const report = await makeNonMealDistortedReport({ profile: 'MEDIUM' });
    expect(report.cases).toHaveLength(60);
    expect(report.summary.meanMacroRelativeError).toBeGreaterThan(0);
    expect(report.summary.p90RelativeCalorieError).toBeGreaterThan(0);
    const measure = await loadMeasure();
    const measured = measure(report);
    expect(measured.stage.mealOutcomeCount).toBe(36);
    expect(measured.stage.parsedMealCount).toBe(36);
    expect(measured.stage.medianMealProteinRelativeError).toBe(0);
    expect(measured.stage.medianMealCarbsRelativeError).toBe(0);
    expect(measured.stage.medianMealFatRelativeError).toBe(0);
    expect(measured.stage.medianRelativeCalorieError).toBe(report.summary.medianRelativeCalorieError);
    expect(measured.stage.meanMacroRelativeError).toBe(report.summary.meanMacroRelativeError);
    expect(measured.stage.meanMacroRelativeError).toBeGreaterThan(0);
    const { aggregateCalibrationMealMetrics } = await import(
      '../../src/nutrition-eval/calibration'
    );
    const legacy = aggregateCalibrationMealMetrics(report.cases);
    expect(legacy.medianMealProteinRelativeError).toBe(0);
    expect(legacy.medianMealCarbsRelativeError).toBe(0);
    expect(legacy.medianMealFatRelativeError).toBe(0);
    const next = await loadMealHelper();
    expect(next(report.cases)).toEqual(legacy);
  });
  it('measures meal-only medians distinct from whole-report medians with literal catastrophic/unsafe counts', async () => {
    const report = await makeMealMedianDiscriminatorReport({ profile: 'MEDIUM' });
    const measure = await loadMeasure();
    const measured = measure(report);
    expect(measured.stage.medianMealProteinRelativeError).toBeCloseTo(2, 9);
    expect(measured.stage.medianMealCarbsRelativeError).toBeCloseTo(1, 9);
    expect(measured.stage.medianMealFatRelativeError).toBeCloseTo(2, 9);
    expect(measured.stage.medianProteinRelativeError).toBeCloseTo(3, 9);
    expect(measured.stage.medianCarbsRelativeError).toBeCloseTo(3, 9);
    expect(measured.stage.medianFatRelativeError).toBeCloseTo(3, 9);
    expect(measured.profile.meanZeroSafeMacroError).toBeCloseTo(82 / 27, 9);
    expect(measured.stage.meanZeroSafeMacroRelativeError).toBeCloseTo(82 / 27, 9);
    expect(measured.stage.meanMealFatDensityRelativeError).toBeCloseTo(2, 9);
    expect(measured.stage.meanMealCarbDensityRelativeError).toBeCloseTo(21 / 11, 9);
    expect(measured.profile.unsafeCount).toBe(24);
    expect(measured.profile.catastrophicCount).toBe(24);
    expect(measured.stage.unsafeCompletionCount).toBe(24);
    expect(measured.stage.catastrophicCount).toBe(24);
    expect(measured.stage.failureCount).toBe(0);
    expect(measured.stage.parseCases).toBe(60);
  });
  it('measures nonzero kcal/mass/density mappings instead of a constant-zero substitute', async () => {
    const report = await makeNonzeroMappingReport();
    const measure = await loadMeasure();
    const measured = measure(report);
    expect(measured.profile.medianKcalError).toBeCloseTo(0.5, 9);
    expect(measured.stage.medianRelativeCalorieError).toBeCloseTo(0.5, 9);
    expect(measured.stage.p90RelativeCalorieError).toBeCloseTo(0.5, 9);
    expect(measured.stage.meanMealMassRelativeError).toBeCloseTo(1, 9);
    expect(measured.stage.medianMealMassRelativeError).toBeCloseTo(1, 9);
    expect(measured.stage.meanMealCarbDensityRelativeError).toBeCloseTo(0.5, 9);
    expect(measured.stage.meanMealFatDensityRelativeError).toBeCloseTo(0.5, 9);
  });
});

describe('reflected cases key identity', () => {
  const swappedKeyReplacements: ReadonlyArray<{
    readonly name: string;
    readonly keyFor: (length: number) => string | symbol;
  }> = [
    { name: 'symbol key', keyFor: () => Symbol('extra') },
    { name: 'extra string key', keyFor: () => 'extra' },
    { name: 'non-canonical 00 key', keyFor: () => '00' },
    { name: 'out-of-range index key', keyFor: (length) => String(length) },
  ];
  for (const { name, keyFor } of swappedKeyReplacements) {
    it(`swapped reflected cases key (${name}) is rejected without indexed descriptor reads`, async () => {
      const report = await makeMeasuredReport({ stage: 'development', profile: 'LOW', scenario: 'exact' });
      const measure = await loadMeasure();
      const mutable = cloneMutable(report);
      const rawCases = asUnknownArray(mutable.cases);
      const swapped = Reflect.ownKeys(rawCases).map((key) => (key === '0' ? keyFor(rawCases.length) : key));
      let indexedDescriptorReads = 0;
      const swappedCases = new Proxy(rawCases, {
        ownKeys(): Array<string | symbol> {
          return swapped;
        },
        getOwnPropertyDescriptor(target, key): PropertyDescriptor | undefined {
          if (key !== 'length') indexedDescriptorReads += 1;
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      });
      mutable.cases = swappedCases;
      let caught: unknown;
      try {
        measure(mutable);
      } catch (error) {
        caught = error;
      }
      expect(indexedDescriptorReads).toBe(0);
      expect(caught).toBeInstanceOf(CalibrationFatalError);
      expect((caught as unknown as Error).message).toBe('calibration:report-measurements-invalid');
      expect(asRecord(caught).cause).toBeUndefined();
    });
  }
  it('reordered cases ownKeys with the exact same key set still measures', async () => {
    const report = await makeMeasuredReport({ stage: 'development', profile: 'LOW', scenario: 'exact' });
    const callerJson = JSON.stringify(report);
    const measure = await loadMeasure();
    const mutable = cloneMutable(report);
    const rawCases = asUnknownArray(mutable.cases);
    const reordered = [...Reflect.ownKeys(rawCases)].reverse();
    const reorderedCases = new Proxy(rawCases, {
      ownKeys(): Array<string | symbol> {
        return reordered;
      },
      getOwnPropertyDescriptor(target, key): PropertyDescriptor | undefined {
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    mutable.cases = reorderedCases;
    const measured = measure(mutable);
    expect(measured.profile.parseCount).toBe(24);
    expect(measured.stage.totalOutcomes).toBe(24);
    expect(measured.latency).toEqual({ measuredCases: 24, missingCases: 0 });
    expect(Object.isFrozen(measured.report)).toBe(true);
    expect(Object.isFrozen(measured.report.cases)).toBe(true);
    expect(Object.isFrozen(rawCases)).toBe(false);
    expect(JSON.stringify(report)).toBe(callerJson);
  });
});
