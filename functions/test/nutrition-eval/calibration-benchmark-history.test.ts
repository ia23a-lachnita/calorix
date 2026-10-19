import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  HISTORICAL_AGGREGATE_SUBSET_GATE_THRESHOLDS,
  HISTORICAL_COMPATIBILITY_REASON_ORDER,
  HistoricalReferenceError,
  HistoricalReferenceSchema,
  SUPPORTED_HISTORICAL_DELTA_FIELDS,
  compareToHistoricalReference,
  defaultLoadHistoricalReference,
  hashHistoricalReference,
  loadHistoricalReference,
  parseHistoricalReference,
  resolveHistoricalReferenceRuntimePaths,
} from "../../src/nutrition-eval/historical-reference";
import * as historicalReferenceFacade from "../../src/nutrition-eval/historical-reference";
import * as historicalReferencePure from "../../src/nutrition-eval/historical-reference-pure";
import { prepareCalibrationBenchmarkHistory } from "../../src/nutrition-eval/calibration-benchmark-history";
import { CalibrationFatalError } from "../../src/nutrition-eval/fatal-error";
import { CALIBRATION_HISTORICAL_REFERENCE_SHA256 } from "../../src/nutrition-eval/calibration-cli";
import type { NutritionEvalReport } from "../../src/nutrition-eval/schema";
import {
  cloneOwnedReport,
  makeBenchmarkCaseLimitReport,
  makeMeasuredReport,
  makeNonMealDistortedReport,
} from "./calibration-authoritative-fixtures";

// Task 1 Step 1: tests-first RED coverage for the not-yet-created pure
// extraction (historical-reference-pure.ts) and the new owned benchmark
// history assessor (calibration-benchmark-history.ts). Both modules are
// intentionally absent at this point; every test below is expected to fail
// until a later task authors the corresponding source.

const BENCHMARK_HISTORY_INVALID_MESSAGE = "calibration:benchmark-history-invalid";

const REFERENCE_PATH_CWD = resolve(process.cwd(), "eval/nutrition/historical-reference-v1.json");
const REFERENCE_PATH_DIRNAME = join(__dirname, "..", "..", "eval", "nutrition", "historical-reference-v1.json");
const RAW_REFERENCE_SHA256 = "fd712bee2d4229bc8476d1cc25fce1a21172e6013c6abfe8949498cc5ce15acb";

const HISTORICAL_REFERENCE_PURE_PATH = resolve(__dirname, "..", "..", "src", "nutrition-eval", "historical-reference-pure.ts");
const CALIBRATION_BENCHMARK_HISTORY_PATH = resolve(__dirname, "..", "..", "src", "nutrition-eval", "calibration-benchmark-history.ts");

const EXPECTED_REFERENCE_METRICS = {
  catastrophicCount: 15,
  medianRelativeCalorieError: 0.2719,
  p90RelativeCalorieError: 1.0136,
  meanMacroRelativeError: 0.5227,
  meanMealMassRelativeError: 0.4695,
  meanMealCarbDensityRelativeError: 0.7780,
  meanMealFatDensityRelativeError: 0.3786,
} as const;

function readRawReferenceBytes(): string {
  return readFileSync(REFERENCE_PATH_DIRNAME, "utf8");
}

function validParams(): { historicalReferenceBytes: string; historicalReferenceHash: string } {
  const bytes = readRawReferenceBytes();
  return {
    historicalReferenceBytes: bytes,
    historicalReferenceHash: RAW_REFERENCE_SHA256,
  };
}

function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function padReferenceBytesTo(targetByteLength: number): string {
  const base = readRawReferenceBytes();
  const baseLength = utf8ByteLength(base);
  if (targetByteLength < baseLength) {
    throw new Error("target byte length below base reference length");
  }
  const padding = " ".repeat(targetByteLength - baseLength);
  return base + padding;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

// --- AST-based pure import-graph walker --------------------------------------
//
// The Task 1 contract requires both new pure entry modules
// (historical-reference-pure.ts and calibration-benchmark-history.ts) to only
// ever import relative source files plus crypto/node:crypto/zod, and to never
// reach a dynamic import()/require(), a filesystem/path loader, a provider/SDK
// client, Firebase, or an http/net/transport module. This walker statically
// resolves the runtime import/export graph with the TypeScript compiler API,
// skipping type-only edges (including inline type specifiers), and is proven
// against synthetic negative controls built directly through ts.factory so no
// literal disallowed import text ever needs to be embedded as a real module.

const PURE_ALLOWED_BARE_SPECIFIERS = new Set<string>(["crypto", "node:crypto", "zod"]);

interface ImportEdge {
  readonly specifier: string;
  readonly isTypeOnly: boolean;
  readonly isDynamicOrRequire: boolean;
}

function namedBindingsAreAllTypeOnly(clause: ts.ImportClause): boolean {
  const namedBindings = clause.namedBindings;
  if (namedBindings === undefined || !ts.isNamedImports(namedBindings)) return false;
  if (namedBindings.elements.length === 0) return false;
  return namedBindings.elements.every((element) => element.isTypeOnly);
}

function collectImportEdges(sourceFile: ts.SourceFile): readonly ImportEdge[] {
  const edges: ImportEdge[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const isTypeOnly = clause !== undefined && (clause.isTypeOnly || namedBindingsAreAllTypeOnly(clause));
      edges.push({ specifier: node.moduleSpecifier.text, isTypeOnly, isDynamicOrRequire: false });
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      edges.push({ specifier: node.moduleSpecifier.text, isTypeOnly: node.isTypeOnly, isDynamicOrRequire: false });
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        edges.push({ specifier: "<dynamic-import>", isTypeOnly: false, isDynamicOrRequire: true });
      } else if (ts.isIdentifier(node.expression) && node.expression.text === "require") {
        edges.push({ specifier: "<require>", isTypeOnly: false, isDynamicOrRequire: true });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return edges;
}

type EdgeClassification = "skip" | "allowed-external" | "relative" | "violation";

function classifyEdge(edge: ImportEdge): EdgeClassification {
  if (edge.isDynamicOrRequire) return "violation";
  if (edge.isTypeOnly) return "skip";
  if (edge.specifier.startsWith(".")) return "relative";
  if (PURE_ALLOWED_BARE_SPECIFIERS.has(edge.specifier)) return "allowed-external";
  return "violation";
}

function resolveRelativeModule(fromFile: string, specifier: string): string {
  const baseDir = dirname(fromFile);
  const direct = resolve(baseDir, specifier);
  const candidates = [direct, direct + ".ts", resolve(direct, "index.ts")];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  throw new Error("unresolvable relative import " + specifier + " from " + fromFile);
}

function parseSourceFile(filePath: string): ts.SourceFile {
  const content = readFileSync(filePath, "utf8");
  return ts.createSourceFile(filePath, content, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
}

interface ImportGraphAudit {
  readonly violations: readonly string[];
  readonly visitedFiles: readonly string[];
}

function auditPureImportGraph(entryFile: string): ImportGraphAudit {
  const visited = new Set<string>();
  const violations: string[] = [];
  const queue: string[] = [entryFile];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    if (visited.has(current)) continue;
    visited.add(current);
    const sourceFile = parseSourceFile(current);
    for (const edge of collectImportEdges(sourceFile)) {
      const kind = classifyEdge(edge);
      if (kind === "violation") {
        violations.push(current + " -> " + edge.specifier);
      } else if (kind === "relative") {
        const resolved = resolveRelativeModule(current, edge.specifier);
        if (!visited.has(resolved)) queue.push(resolved);
      }
    }
  }
  return { violations, visitedFiles: [...visited] };
}

function createSyntheticImportSourceFile(statements: readonly ts.Statement[]): ts.SourceFile {
  return ts.factory.createSourceFile(statements, ts.factory.createToken(ts.SyntaxKind.EndOfFileToken), ts.NodeFlags.None);
}

function createNamedImportDeclaration(params: {
  readonly specifier: string;
  readonly wholeClauseTypeOnly: boolean;
  readonly namedTypeOnlyFlags: readonly boolean[];
}): ts.ImportDeclaration {
  const elements = params.namedTypeOnlyFlags.map((isTypeOnly, index) =>
    ts.factory.createImportSpecifier(isTypeOnly, undefined, ts.factory.createIdentifier("member" + String(index))),
  );
  const importClause = ts.factory.createImportClause(
    params.wholeClauseTypeOnly,
    undefined,
    ts.factory.createNamedImports(elements),
  );
  return ts.factory.createImportDeclaration(undefined, importClause, ts.factory.createStringLiteral(params.specifier), undefined);
}

function createDynamicImportStatement(specifier: string): ts.Statement {
  const call = ts.factory.createCallExpression(
    ts.factory.createToken(ts.SyntaxKind.ImportKeyword) as unknown as ts.Expression,
    undefined,
    [ts.factory.createStringLiteral(specifier)],
  );
  return ts.factory.createExpressionStatement(call);
}

function createRequireStatement(specifier: string): ts.Statement {
  const call = ts.factory.createCallExpression(ts.factory.createIdentifier("require"), undefined, [
    ts.factory.createStringLiteral(specifier),
  ]);
  return ts.factory.createExpressionStatement(call);
}

// --- Core required acceptance test (verbatim contract from the task brief) ---

describe("calibration benchmark history: owned assessment (Task 1 contract)", () => {
  it("owns seven measured deltas and the frozen reference provenance", async () => {
    const bytes = readFileSync(REFERENCE_PATH_CWD, "utf8");
    const report = await makeMeasuredReport({ stage: "benchmark", profile: "MEDIUM" });
    const assess = prepareCalibrationBenchmarkHistory({
      historicalReferenceBytes: bytes,
      historicalReferenceHash: RAW_REFERENCE_SHA256,
    });
    const result = assess.assess(report);
    expect(Object.keys(result.comparison.deltas as Record<string, number>).sort()).toEqual(
      [...SUPPORTED_HISTORICAL_DELTA_FIELDS].sort(),
    );
    expect(result.comparison.compatible).toBe(true);
    expect(result.subset.passed).toBe(true);
    expect(result.provenance.rounding).toBe("four_decimal_places");
    expect(result.measurements.stage.mealCarbDensityEligibleCount).toBe(33);
    expect(Object.isFrozen(report)).toBe(false);
    expect(Object.isFrozen(result.comparison.deltas)).toBe(true);
  });

  it("computes independent literal deltas for an exact-prediction benchmark report", async () => {
    const report = await makeMeasuredReport({ stage: "benchmark", profile: "MEDIUM" });
    const assess = prepareCalibrationBenchmarkHistory(validParams());
    const result = assess.assess(report);
    const deltas = result.comparison.deltas as Record<string, number>;
    expect(deltas.catastrophicCount).toBe(0 - EXPECTED_REFERENCE_METRICS.catastrophicCount);
    expect(deltas.medianRelativeCalorieError).toBe(0 - EXPECTED_REFERENCE_METRICS.medianRelativeCalorieError);
    expect(deltas.p90RelativeCalorieError).toBe(0 - EXPECTED_REFERENCE_METRICS.p90RelativeCalorieError);
    expect(deltas.meanMacroRelativeError).toBe(0 - EXPECTED_REFERENCE_METRICS.meanMacroRelativeError);
    expect(deltas.meanMealMassRelativeError).toBe(0 - EXPECTED_REFERENCE_METRICS.meanMealMassRelativeError);
    expect(deltas.meanMealCarbDensityRelativeError).toBe(0 - EXPECTED_REFERENCE_METRICS.meanMealCarbDensityRelativeError);
    expect(deltas.meanMealFatDensityRelativeError).toBe(0 - EXPECTED_REFERENCE_METRICS.meanMealFatDensityRelativeError);
  });

  it("accepts the LOW profile in addition to the MEDIUM profile", async () => {
    const report = await makeMeasuredReport({ stage: "benchmark", profile: "LOW" });
    const assess = prepareCalibrationBenchmarkHistory(validParams());
    const result = assess.assess(report);
    expect(result.comparison.compatible).toBe(true);
    expect(result.measurements.stage.mealCarbDensityEligibleCount).toBe(33);
  });

  it("does not treat the declared 3.8-vs-2.5 model difference as a historical compatibility failure", async () => {
    const report = await makeMeasuredReport({ stage: "benchmark", profile: "MEDIUM" });
    const assess = prepareCalibrationBenchmarkHistory(validParams());
    const result = assess.assess(report);
    expect(result.comparison.referenceModel).toBe("gemini-2.5-flash");
    expect(result.comparison.currentAdapterModelId).toBe("gemini-3.8-flash");
    expect(result.comparison.compatible).toBe(true);
  });

  it("returns a result with every layer deeply frozen while leaving the caller report mutable", async () => {
    const report = await makeMeasuredReport({ stage: "benchmark", profile: "MEDIUM" });
    const assess = prepareCalibrationBenchmarkHistory(validParams());
    const result = assess.assess(report);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.measurements)).toBe(true);
    expect(Object.isFrozen(result.comparison)).toBe(true);
    expect(Object.isFrozen(result.subset)).toBe(true);
    expect(Object.isFrozen(result.provenance)).toBe(true);
    expect(Object.isFrozen(report)).toBe(false);
  });

  it("does not change the returned result when the original report is mutated after the call", async () => {
    const report = await makeMeasuredReport({ stage: "benchmark", profile: "MEDIUM" });
    const assess = prepareCalibrationBenchmarkHistory(validParams());
    const result = assess.assess(report);
    const originalDeltas = { ...(result.comparison.deltas as Record<string, number>) };
    const mutableReport = report as unknown as Record<string, unknown>;
    mutableReport.datasetId = "mutated-after-return";
    const mutableSummary = (report as unknown as { summary: Record<string, unknown> }).summary;
    mutableSummary.catastrophicCount = 999;
    expect(result.comparison.deltas).toEqual(originalDeltas);
    expect(result.measurements.stage.catastrophicCount).not.toBe(999);
  });

  it("allows a compatible report with positive deltas while the full subset gate correctly fails", async () => {
    const report = await makeNonMealDistortedReport({ profile: "MEDIUM" });
    const assess = prepareCalibrationBenchmarkHistory(validParams());
    const result = assess.assess(report);
    expect(result.comparison.compatible).toBe(true);
    const deltas = result.comparison.deltas as Record<string, number>;
    const hasPositiveDelta = Object.values(deltas).some((value) => value > 0);
    expect(hasPositiveDelta).toBe(true);
    expect(result.subset.passed).toBe(false);
  });
});

describe("calibration benchmark history: closed params boundary", () => {
  it("rejects params that are not a plain object", () => {
    expect(() => prepareCalibrationBenchmarkHistory(null)).toThrow(CalibrationFatalError);
    expect(() => prepareCalibrationBenchmarkHistory("nope")).toThrow(CalibrationFatalError);
    expect(() => prepareCalibrationBenchmarkHistory(["a", "b"])).toThrow(CalibrationFatalError);
  });

  it("rejects params missing one of the two required fields", () => {
    const params = validParams();
    const missingHash: Record<string, unknown> = { historicalReferenceBytes: params.historicalReferenceBytes };
    expect(() => prepareCalibrationBenchmarkHistory(missingHash)).toThrow(BENCHMARK_HISTORY_INVALID_MESSAGE);
    const missingBytes: Record<string, unknown> = { historicalReferenceHash: params.historicalReferenceHash };
    expect(() => prepareCalibrationBenchmarkHistory(missingBytes)).toThrow(BENCHMARK_HISTORY_INVALID_MESSAGE);
  });

  it("rejects params with an extra unknown own enumerable field", () => {
    const params = { ...validParams(), extra: "nope" };
    expect(() => prepareCalibrationBenchmarkHistory(params)).toThrow(BENCHMARK_HISTORY_INVALID_MESSAGE);
  });

  it("rejects params carrying an extra own enumerable symbol-keyed field", () => {
    const marker = Symbol("extra");
    const params = validParams() as unknown as Record<string | symbol, unknown>;
    const withSymbol: Record<string | symbol, unknown> = { ...params, [marker]: "nope" };
    expect(() => prepareCalibrationBenchmarkHistory(withSymbol)).toThrow(BENCHMARK_HISTORY_INVALID_MESSAGE);
  });

  it("rejects params where a required field is an accessor instead of a data property", () => {
    const params = validParams();
    const withAccessor: Record<string, unknown> = { historicalReferenceBytes: params.historicalReferenceBytes };
    Object.defineProperty(withAccessor, "historicalReferenceHash", {
      enumerable: true,
      configurable: true,
      get: () => params.historicalReferenceHash,
    });
    expect(() => prepareCalibrationBenchmarkHistory(withAccessor)).toThrow(BENCHMARK_HISTORY_INVALID_MESSAGE);
  });

  it("rejects params where a required field is present but non-enumerable", () => {
    const params = validParams();
    const withHidden: Record<string, unknown> = { historicalReferenceBytes: params.historicalReferenceBytes };
    Object.defineProperty(withHidden, "historicalReferenceHash", {
      value: params.historicalReferenceHash,
      enumerable: false,
      configurable: true,
      writable: true,
    });
    expect(() => prepareCalibrationBenchmarkHistory(withHidden)).toThrow(BENCHMARK_HISTORY_INVALID_MESSAGE);
  });

  it("rejects params where a required field is only inherited through the prototype chain", () => {
    const params = validParams();
    const prototype: Record<string, unknown> = { historicalReferenceHash: params.historicalReferenceHash };
    const inheriting = Object.create(prototype) as Record<string, unknown>;
    inheriting.historicalReferenceBytes = params.historicalReferenceBytes;
    expect(() => prepareCalibrationBenchmarkHistory(inheriting)).toThrow(BENCHMARK_HISTORY_INVALID_MESSAGE);
  });

  it("rejects params where a required field value is undefined", () => {
    const params = validParams();
    const withUndefined: Record<string, unknown> = {
      historicalReferenceBytes: params.historicalReferenceBytes,
      historicalReferenceHash: undefined,
    };
    expect(() => prepareCalibrationBenchmarkHistory(withUndefined)).toThrow(BENCHMARK_HISTORY_INVALID_MESSAGE);
  });

  it("rejects a non-string value for either required field", () => {
    const params = validParams();
    expect(() => prepareCalibrationBenchmarkHistory({ ...params, historicalReferenceHash: 12345 })).toThrow(
      BENCHMARK_HISTORY_INVALID_MESSAGE,
    );
    expect(() => prepareCalibrationBenchmarkHistory({ ...params, historicalReferenceBytes: 12345 })).toThrow(
      BENCHMARK_HISTORY_INVALID_MESSAGE,
    );
  });
});

describe("calibration benchmark history: raw reference bytes and hash boundary", () => {
  it("matches the raw committed-file digest against the existing CLI pin", () => {
    expect(sha256Hex(readRawReferenceBytes())).toBe(RAW_REFERENCE_SHA256);
    expect(CALIBRATION_HISTORICAL_REFERENCE_SHA256).toBe(RAW_REFERENCE_SHA256);
  });

  it("keeps the raw-file digest distinct from the canonical parsed-data hash", () => {
    const raw = readRawReferenceBytes();
    const parsed = JSON.parse(raw) as unknown;
    const canonicalHash = hashHistoricalReference(parsed);
    expect(canonicalHash).not.toBe(RAW_REFERENCE_SHA256);
    expect(canonicalHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("accepts bytes at the exact 8192 UTF-8 byte boundary", () => {
    const padded = padReferenceBytesTo(8192);
    expect(utf8ByteLength(padded)).toBe(8192);
    const hash = sha256Hex(padded);
    const assess = prepareCalibrationBenchmarkHistory({ historicalReferenceBytes: padded, historicalReferenceHash: hash });
    expect(typeof assess.assess).toBe("function");
  });

  it("rejects bytes one past the 8192 UTF-8 byte boundary", () => {
    const padded = padReferenceBytesTo(8193);
    expect(utf8ByteLength(padded)).toBe(8193);
    const hash = sha256Hex(padded);
    expect(() =>
      prepareCalibrationBenchmarkHistory({ historicalReferenceBytes: padded, historicalReferenceHash: hash }),
    ).toThrow(BENCHMARK_HISTORY_INVALID_MESSAGE);
  });

  it("rejects a whitespace-only tamper of the raw bytes against the original pinned hash", () => {
    const tampered = readRawReferenceBytes() + " ";
    expect(() =>
      prepareCalibrationBenchmarkHistory({ historicalReferenceBytes: tampered, historicalReferenceHash: RAW_REFERENCE_SHA256 }),
    ).toThrow(BENCHMARK_HISTORY_INVALID_MESSAGE);
  });

  it("rejects a tampered hash paired with the genuine original bytes", () => {
    const bytes = readRawReferenceBytes();
    const tamperedHash = RAW_REFERENCE_SHA256.slice(0, -1) + (RAW_REFERENCE_SHA256.endsWith("a") ? "b" : "a");
    expect(() =>
      prepareCalibrationBenchmarkHistory({ historicalReferenceBytes: bytes, historicalReferenceHash: tamperedHash }),
    ).toThrow(BENCHMARK_HISTORY_INVALID_MESSAGE);
  });
});

describe("calibration benchmark history: current-report association and population", () => {
  async function makeBaselineReport(): Promise<NutritionEvalReport> {
    return makeMeasuredReport({ stage: "benchmark", profile: "MEDIUM" });
  }

  it.each([
    ["datasetId", "other-dataset-id"],
    ["datasetHash", "9".repeat(64)],
    ["promptHash", "8".repeat(64)],
    ["adapterModelId", "gemini-2.5-flash"],
    ["samples", 1],
  ] as const)("fails closed when %s is tampered on an otherwise genuine benchmark report", async (field, value) => {
    const report = await makeBaselineReport();
    const cloned = cloneOwnedReport(report) as unknown as Record<string, unknown>;
    cloned[field] = value;
    const assess = prepareCalibrationBenchmarkHistory(validParams());
    expect(() => assess.assess(cloned)).toThrow(BENCHMARK_HISTORY_INVALID_MESSAGE);
  });

  it("fails closed when the calibration stage metadata is not benchmark, even if dataset fields still match", async () => {
    const report = await makeBaselineReport();
    const cloned = cloneOwnedReport(report) as unknown as { calibration: { stage: string } };
    cloned.calibration.stage = "validation";
    const assess = prepareCalibrationBenchmarkHistory(validParams());
    expect(() => assess.assess(cloned)).toThrow(BENCHMARK_HISTORY_INVALID_MESSAGE);
  });

  it("fails closed on a 61-outcome report that violates the locked public benchmark population", async () => {
    const report = await makeBenchmarkCaseLimitReport({ profile: "MEDIUM" });
    const assess = prepareCalibrationBenchmarkHistory(validParams());
    expect(() => assess.assess(report)).toThrow(BENCHMARK_HISTORY_INVALID_MESSAGE);
  });

  it("fails closed when a required current metric is unavailable instead of silently omitting it", async () => {
    const report = await makeMeasuredReport({ stage: "benchmark", profile: "MEDIUM", scenario: "missing_diagnostic" });
    const assess = prepareCalibrationBenchmarkHistory(validParams());
    expect(() => assess.assess(report)).toThrow(BENCHMARK_HISTORY_INVALID_MESSAGE);
  });
});

describe("calibration benchmark history: missing, nonfinite, and forged measured inputs", () => {
  it("fails closed on an empty object", () => {
    const assess = prepareCalibrationBenchmarkHistory(validParams());
    expect(() => assess.assess({})).toThrow(BENCHMARK_HISTORY_INVALID_MESSAGE);
  });

  it("fails closed on null and undefined reports", () => {
    const assess = prepareCalibrationBenchmarkHistory(validParams());
    expect(() => assess.assess(null)).toThrow(BENCHMARK_HISTORY_INVALID_MESSAGE);
    expect(() => assess.assess(undefined)).toThrow(BENCHMARK_HISTORY_INVALID_MESSAGE);
  });

  it("fails closed on a nonfinite summary metric", async () => {
    const report = await makeMeasuredReport({ stage: "benchmark", profile: "MEDIUM" });
    const mutable = report as unknown as { summary: Record<string, unknown> };
    mutable.summary.medianRelativeCalorieError = Number.NaN;
    const assess = prepareCalibrationBenchmarkHistory(validParams());
    expect(() => assess.assess(report)).toThrow(BENCHMARK_HISTORY_INVALID_MESSAGE);
  });

  it("ignores a forged top-level comparison field instead of letting it control the computed deltas", async () => {
    const report = await makeMeasuredReport({ stage: "benchmark", profile: "MEDIUM" });
    const assess = prepareCalibrationBenchmarkHistory(validParams());
    const genuine = assess.assess(report);
    const forgedComparison = {
      baselineRunId: "forged-run-id",
      compatible: true,
      compatibilityReasons: [] as const,
      deltas: {
        parseRate: 999,
        medianAbsoluteCalorieError: 999,
        medianRelativeCalorieError: 999,
        p90AbsoluteCalorieError: 999,
        p90RelativeCalorieError: 999,
        meanMacroRelativeError: 999,
        reviewRate: 999,
        catastrophicCount: 999,
        unsafeCompletionCount: 999,
      },
    };
    const reportWithForgedComparison = {
      ...(report as unknown as Record<string, unknown>),
      comparison: forgedComparison,
    };
    const assessTwo = prepareCalibrationBenchmarkHistory(validParams());
    const withForgery = assessTwo.assess(reportWithForgedComparison);
    expect(withForgery.comparison.deltas).toEqual(genuine.comparison.deltas);
  });
});

describe("calibration benchmark history: hostile report capture boundary", () => {
  it("fails closed on a symbol-keyed own enumerable property anywhere in the report graph", async () => {
    const report = await makeMeasuredReport({ stage: "benchmark", profile: "MEDIUM" });
    const marker = Symbol("hostile");
    const mutable = report as unknown as Record<string | symbol, unknown>;
    mutable[marker] = "nope";
    const assess = prepareCalibrationBenchmarkHistory(validParams());
    expect(() => assess.assess(report)).toThrow(BENCHMARK_HISTORY_INVALID_MESSAGE);
  });

  it("fails closed on a getter-backed property anywhere in the report graph", async () => {
    const report = await makeMeasuredReport({ stage: "benchmark", profile: "MEDIUM" });
    const mutable = report as unknown as Record<string, unknown>;
    delete mutable.datasetId;
    Object.defineProperty(mutable, "datasetId", {
      enumerable: true,
      configurable: true,
      get: () => "calorix-public-v1",
    });
    const assess = prepareCalibrationBenchmarkHistory(validParams());
    expect(() => assess.assess(report)).toThrow(BENCHMARK_HISTORY_INVALID_MESSAGE);
  });

  it("fails closed on an unexpected own enumerable field at the report root", async () => {
    const report = await makeMeasuredReport({ stage: "benchmark", profile: "MEDIUM" });
    const withExtra = { ...(report as unknown as Record<string, unknown>), unexpectedField: "nope" };
    const assess = prepareCalibrationBenchmarkHistory(validParams());
    expect(() => assess.assess(withExtra)).toThrow(BENCHMARK_HISTORY_INVALID_MESSAGE);
  });

  it("fails closed on a report object with a non-standard prototype chain carrying an inherited field", async () => {
    const report = await makeMeasuredReport({ stage: "benchmark", profile: "MEDIUM" });
    const prototype: Record<string, unknown> = { inheritedNoise: "must never be admitted" };
    const hostile = Object.create(prototype) as Record<string, unknown>;
    for (const key of Object.keys(report as unknown as Record<string, unknown>)) {
      hostile[key] = (report as unknown as Record<string, unknown>)[key];
    }
    const assess = prepareCalibrationBenchmarkHistory(validParams());
    expect(() => assess.assess(hostile)).toThrow(BENCHMARK_HISTORY_INVALID_MESSAGE);
  });

  it("fails closed on a direct cycle inside the report graph", async () => {
    const report = await makeMeasuredReport({ stage: "benchmark", profile: "MEDIUM" });
    const mutable = report as unknown as { cases: Array<Record<string, unknown>> };
    const firstCase = mutable.cases[0] as Record<string, unknown>;
    firstCase.selfCycle = firstCase;
    const assess = prepareCalibrationBenchmarkHistory(validParams());
    expect(() => assess.assess(report)).toThrow(BENCHMARK_HISTORY_INVALID_MESSAGE);
  });

  it("copies a shared mutable alias independently instead of aliasing the owned output", async () => {
    const report = await makeMeasuredReport({ stage: "benchmark", profile: "MEDIUM" });
    const mutable = report as unknown as { cases: Array<Record<string, unknown>> };
    const sharedSafety = { catastrophicCalorieMiss: false, unsafeCompletion: false };
    for (const caseRow of mutable.cases) {
      caseRow.safety = sharedSafety;
    }
    const assess = prepareCalibrationBenchmarkHistory(validParams());
    const result = assess.assess(report);
    sharedSafety.unsafeCompletion = true;
    const owned = result.measurements.report.cases[0] as unknown as { safety: { unsafeCompletion: boolean } };
    expect(owned.safety.unsafeCompletion).toBe(false);
  });

  it("fails closed when a nested property access throws through a revoked proxy", async () => {
    const report = await makeMeasuredReport({ stage: "benchmark", profile: "MEDIUM" });
    const mutable = report as unknown as { cases: Array<Record<string, unknown>> };
    const revocable = Proxy.revocable({ catastrophicCalorieMiss: false, unsafeCompletion: false }, {});
    revocable.revoke();
    const firstCase = mutable.cases[0] as Record<string, unknown>;
    firstCase.safety = revocable.proxy;
    const assess = prepareCalibrationBenchmarkHistory(validParams());
    expect(() => assess.assess(report)).toThrow(BENCHMARK_HISTORY_INVALID_MESSAGE);
  });
});

describe("calibration benchmark history: same-assessor nested reentry and poison", () => {
  it("poisons the assessor permanently when a nested reentrant assess call is swallowed by a hostile report proxy", async () => {
    const goodReport = await makeMeasuredReport({ stage: "benchmark", profile: "MEDIUM" });
    const assess = prepareCalibrationBenchmarkHistory(validParams());

    const hostileReport = new Proxy(goodReport as unknown as object, {
      getOwnPropertyDescriptor(target, prop) {
        try {
          assess.assess({});
        } catch {
          // Intentionally swallowed here: the nested fatal must not surface
          // at this trap, and the outer call must still fail and poison the
          // assessor permanently regardless of this swallow.
        }
        return Reflect.getOwnPropertyDescriptor(target, prop);
      },
    });

    expect(() => assess.assess(hostileReport)).toThrow(BENCHMARK_HISTORY_INVALID_MESSAGE);
    expect(() => assess.assess(goodReport)).toThrow(BENCHMARK_HISTORY_INVALID_MESSAGE);
  });

  it("never reads or coerces a foreign thrown proxy value while wrapping it into the static fatal", async () => {
    const report = await makeMeasuredReport({ stage: "benchmark", profile: "MEDIUM" });
    let readCount = 0;
    const foreignTrap = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === Symbol.toPrimitive || prop === "then") return undefined;
          readCount += 1;
          return () => {
            readCount += 1;
            return "foreign-value";
          };
        },
        has() {
          readCount += 1;
          return true;
        },
      },
    );
    const mutable = report as unknown as { cases: unknown[] };
    const hostileCases = new Proxy(mutable.cases, {
      ownKeys() {
        throw foreignTrap;
      },
    });
    mutable.cases = hostileCases as unknown as unknown[];

    const assess = prepareCalibrationBenchmarkHistory(validParams());
    let caught: unknown;
    try {
      assess.assess(report);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect((caught as CalibrationFatalError).message).toBe(BENCHMARK_HISTORY_INVALID_MESSAGE);
    expect(Object.getOwnPropertyDescriptor(caught as object, "cause")).toBeUndefined();
    expect(readCount).toBe(0);
  });
});

describe("calibration benchmark history: pure import-graph control", () => {
  it("flags a bare fs import as a violation in a synthetic negative control", () => {
    const declaration = createNamedImportDeclaration({
      specifier: "fs",
      wholeClauseTypeOnly: false,
      namedTypeOnlyFlags: [false],
    });
    const edges = collectImportEdges(createSyntheticImportSourceFile([declaration]));
    expect(edges.map(classifyEdge)).toContain("violation");
  });

  it.each(["fs", "path", "@google/genai", "firebase-admin", "http", "net"])(
    "flags the disallowed external specifier %s",
    (specifier) => {
      const declaration = createNamedImportDeclaration({
        specifier,
        wholeClauseTypeOnly: false,
        namedTypeOnlyFlags: [false],
      });
      const edges = collectImportEdges(createSyntheticImportSourceFile([declaration]));
      expect(edges.length).toBeGreaterThan(0);
      for (const edge of edges) {
        expect(classifyEdge(edge)).toBe("violation");
      }
    },
  );

  it("permits the allowed external specifiers crypto, node:crypto, and zod", () => {
    for (const specifier of ["crypto", "node:crypto", "zod"]) {
      const declaration = createNamedImportDeclaration({
        specifier,
        wholeClauseTypeOnly: false,
        namedTypeOnlyFlags: [false],
      });
      const edges = collectImportEdges(createSyntheticImportSourceFile([declaration]));
      expect(edges.length).toBeGreaterThan(0);
      for (const edge of edges) {
        expect(classifyEdge(edge)).toBe("allowed-external");
      }
    }
  });

  it("skips a fully type-only named import even from an otherwise forbidden specifier", () => {
    const declaration = createNamedImportDeclaration({
      specifier: "some-forbidden-sdk",
      wholeClauseTypeOnly: false,
      namedTypeOnlyFlags: [true, true],
    });
    const edges = collectImportEdges(createSyntheticImportSourceFile([declaration]));
    expect(edges.length).toBeGreaterThan(0);
    for (const edge of edges) {
      expect(classifyEdge(edge)).toBe("skip");
    }
  });

  it("skips a whole-clause type-only import from an otherwise forbidden specifier", () => {
    const declaration = createNamedImportDeclaration({
      specifier: "some-forbidden-sdk",
      wholeClauseTypeOnly: true,
      namedTypeOnlyFlags: [false],
    });
    const edges = collectImportEdges(createSyntheticImportSourceFile([declaration]));
    expect(edges.length).toBeGreaterThan(0);
    for (const edge of edges) {
      expect(classifyEdge(edge)).toBe("skip");
    }
  });

  it("still follows a relative import with a mixed inline type specifier", () => {
    const declaration = createNamedImportDeclaration({
      specifier: "./local-module",
      wholeClauseTypeOnly: false,
      namedTypeOnlyFlags: [false, true],
    });
    const edges = collectImportEdges(createSyntheticImportSourceFile([declaration]));
    expect(edges.length).toBeGreaterThan(0);
    for (const edge of edges) {
      expect(classifyEdge(edge)).toBe("relative");
    }
  });

  it("rejects a dynamic import call", () => {
    const statement = createDynamicImportStatement("fs");
    const edges = collectImportEdges(createSyntheticImportSourceFile([statement]));
    expect(edges.some((edge) => edge.isDynamicOrRequire)).toBe(true);
    for (const edge of edges.filter((edge) => edge.isDynamicOrRequire)) {
      expect(classifyEdge(edge)).toBe("violation");
    }
  });

  it("rejects a require call", () => {
    const statement = createRequireStatement("fs");
    const edges = collectImportEdges(createSyntheticImportSourceFile([statement]));
    expect(edges.some((edge) => edge.isDynamicOrRequire)).toBe(true);
    for (const edge of edges.filter((edge) => edge.isDynamicOrRequire)) {
      expect(classifyEdge(edge)).toBe("violation");
    }
  });

  it("walks the real historical-reference-pure.ts import graph without a disallowed edge, and never reaches calibration-cli.ts", () => {
    const audit = auditPureImportGraph(HISTORICAL_REFERENCE_PURE_PATH);
    expect(audit.violations).toEqual([]);
    expect(audit.visitedFiles.some((file) => file.endsWith("calibration-cli.ts"))).toBe(false);
  });

  it("walks the real calibration-benchmark-history.ts import graph without a disallowed edge, and never reaches calibration-cli.ts", () => {
    const audit = auditPureImportGraph(CALIBRATION_BENCHMARK_HISTORY_PATH);
    expect(audit.violations).toEqual([]);
    expect(audit.visitedFiles.some((file) => file.endsWith("calibration-cli.ts"))).toBe(false);
  });
});

describe("calibration benchmark history: facade reexport identity", () => {
  it("reexports the historical pure schema and comparison surface by identity, unchanged", () => {
    expect(historicalReferenceFacade.parseHistoricalReference).toBe(historicalReferencePure.parseHistoricalReference);
    expect(historicalReferenceFacade.hashHistoricalReference).toBe(historicalReferencePure.hashHistoricalReference);
    expect(historicalReferenceFacade.compareToHistoricalReference).toBe(historicalReferencePure.compareToHistoricalReference);
    expect(historicalReferenceFacade.evaluateHistoricalAggregateSubsetGate).toBe(
      historicalReferencePure.evaluateHistoricalAggregateSubsetGate,
    );
    expect(historicalReferenceFacade.HistoricalReferenceSchema).toBe(historicalReferencePure.HistoricalReferenceSchema);
    expect(historicalReferenceFacade.HistoricalReferenceError).toBe(historicalReferencePure.HistoricalReferenceError);
    expect(historicalReferenceFacade.HISTORICAL_COMPATIBILITY_REASON_ORDER).toBe(
      historicalReferencePure.HISTORICAL_COMPATIBILITY_REASON_ORDER,
    );
    expect(historicalReferenceFacade.SUPPORTED_HISTORICAL_DELTA_FIELDS).toBe(
      historicalReferencePure.SUPPORTED_HISTORICAL_DELTA_FIELDS,
    );
    expect(historicalReferenceFacade.HISTORICAL_AGGREGATE_SUBSET_GATE_THRESHOLDS).toBe(
      historicalReferencePure.HISTORICAL_AGGREGATE_SUBSET_GATE_THRESHOLDS,
    );
  });

  it("keeps the filesystem loader exports on the facade only, never on the pure module", () => {
    expect(typeof historicalReferenceFacade.loadHistoricalReference).toBe("function");
    expect(typeof historicalReferenceFacade.defaultLoadHistoricalReference).toBe("function");
    expect(typeof historicalReferenceFacade.resolveHistoricalReferenceRuntimePaths).toBe("function");
    const pureExports = historicalReferencePure as unknown as Record<string, unknown>;
    expect(pureExports.loadHistoricalReference).toBeUndefined();
    expect(pureExports.defaultLoadHistoricalReference).toBeUndefined();
    expect(pureExports.resolveHistoricalReferenceRuntimePaths).toBeUndefined();
  });

  it("preserves the exact canonical compatibility reason order", () => {
    expect(HISTORICAL_COMPATIBILITY_REASON_ORDER).toEqual([
      "dataset_id_mismatch",
      "dataset_hash_mismatch",
      "prompt_hash_mismatch",
      "samples_mismatch",
      "public_cases_mismatch",
      "private_cases_mismatch",
      "case_count_mismatch",
      "adapter_model_mismatch",
    ]);
  });

  it("preserves the exact seven supported historical delta fields", () => {
    expect(SUPPORTED_HISTORICAL_DELTA_FIELDS).toEqual([
      "catastrophicCount",
      "medianRelativeCalorieError",
      "p90RelativeCalorieError",
      "meanMacroRelativeError",
      "meanMealMassRelativeError",
      "meanMealCarbDensityRelativeError",
      "meanMealFatDensityRelativeError",
    ]);
  });

  it("preserves the exact seven fixed subset-gate thresholds", () => {
    expect(HISTORICAL_AGGREGATE_SUBSET_GATE_THRESHOLDS).toEqual({
      catastrophicCount: 12,
      medianRelativeCalorieError: 0.25,
      p90RelativeCalorieError: 0.90,
      meanMacroRelativeError: 0.45,
      meanMealMassRelativeError: 0.40,
      meanMealCarbDensityRelativeError: 0.70,
      meanMealFatDensityRelativeError: 0.35,
    });
  });

  it("still loads the exact committed reference through the unchanged default and custom loader pair", async () => {
    const paths = resolveHistoricalReferenceRuntimePaths(join(__dirname, "..", "..", "lib", "nutrition-eval"));
    const reference = await loadHistoricalReference(paths);
    expect(reference.runId).toBe("run-2026-09-11T20-22-21-450Z");
    const raw = await defaultLoadHistoricalReference(paths);
    expect(parseHistoricalReference(raw).runId).toBe("run-2026-09-11T20-22-21-450Z");
  });

  it("still throws the stable unsupported_delta_field error through the unchanged compareToHistoricalReference export", () => {
    const raw = JSON.parse(readRawReferenceBytes()) as unknown;
    const reference = HistoricalReferenceSchema.parse(parseHistoricalReference(raw));
    expect(() =>
      compareToHistoricalReference(
        reference,
        { adapterModelId: "gemini-3.8-flash" } as unknown as NutritionEvalReport,
        ["not_a_real_field" as unknown as (typeof SUPPORTED_HISTORICAL_DELTA_FIELDS)[number]],
      ),
    ).toThrow(HistoricalReferenceError);
  });
});
