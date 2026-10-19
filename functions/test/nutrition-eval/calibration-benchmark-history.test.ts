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
  makeNodeBudgetReport,
  makeNonMealDistortedReport,
} from "./calibration-authoritative-fixtures";

// Task 1 Step 1: tests-first coverage for the not-yet-created pure
// extraction (historical-reference-pure.ts) and the new owned benchmark
// history assessor (calibration-benchmark-history.ts). Both modules are
// intentionally absent at this point, so the whole file currently fails to
// collect at the module-resolution stage; this is initial missing-feature
// evidence, not independent proof that every individual assertion below is
// correct, nor that each one would fail in isolation. Several controls
// below (the compatibility/fixture/import-graph/facade-identity groups)
// exercise only already-existing, already-committed behavior and helpers
// and are expected to pass unchanged once collection succeeds. Host review
// reruns the focused suite once the corresponding source exists.

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

// --- Capture-budget helpers ---------------------------------------------------
//
// countGraphValueNodes mirrors the known node-counting semantics of the
// existing measurement capture: one count per value/container visit
// (string, number, boolean, null, object, or array), never per property
// name/key. It is a test-owned, independent reimplementation used only to
// prove a fixture genuinely crosses the 20000-node budget, not a source
// stub for the module under test.

function countGraphValueNodes(value: unknown): number {
  if (value === null || typeof value !== "object") return 1;
  if (Array.isArray(value)) {
    let count = 1;
    for (const element of value) count += countGraphValueNodes(element);
    return count;
  }
  let count = 1;
  for (const key of Object.keys(value as Record<string, unknown>)) {
    count += countGraphValueNodes((value as Record<string, unknown>)[key]);
  }
  return count;
}

function collectReviewReasonsArrays(report: unknown): unknown[][] {
  const mutable = report as { cases: Array<{ prediction: { reviewReasons?: unknown[] } }> };
  const arrays: unknown[][] = [];
  for (const caseRow of mutable.cases) {
    const reasons = caseRow.prediction.reviewReasons;
    if (Array.isArray(reasons)) arrays.push(reasons);
  }
  return arrays;
}

function trimNodeCountToExactly(report: unknown, targetNodeCount: number): void {
  const arrays = collectReviewReasonsArrays(report);
  let currentCount = countGraphValueNodes(report);
  let arrayIndex = 0;
  while (currentCount > targetNodeCount) {
    if (arrayIndex >= arrays.length) {
      throw new Error("insufficient trimmable reviewReasons capacity to reach the exact target node count");
    }
    const array = arrays[arrayIndex] as unknown[];
    if (array.length === 0) {
      arrayIndex += 1;
      continue;
    }
    array.pop();
    currentCount -= 1;
  }
  if (currentCount !== targetNodeCount) {
    throw new Error("could not reach the exact target node count through reviewReasons trimming alone");
  }
}

function makeValidBaselineComparison(baselineRunId: string): Record<string, unknown> {
  return {
    baselineRunId,
    compatible: true,
    compatibilityReasons: [],
    deltas: {
      parseRate: 0,
      medianAbsoluteCalorieError: 0,
      medianRelativeCalorieError: 0,
      p90AbsoluteCalorieError: 0,
      p90RelativeCalorieError: 0,
      meanMacroRelativeError: 0,
      reviewRate: 0,
      catastrophicCount: 0,
      unsafeCompletionCount: 0,
    },
  };
}

function buildOverDepthObject(depth: number): unknown {
  let node: unknown = "leaf";
  for (let i = 0; i < depth; i += 1) {
    node = { nested: node };
  }
  return node;
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

function importClauseIsEffectivelyTypeOnly(clause: ts.ImportClause): boolean {
  if (clause.isTypeOnly) return true;
  // A runtime default binding always makes the import a runtime edge, even
  // when every named member alongside it is individually type-only.
  if (clause.name !== undefined) return false;
  return namedBindingsAreAllTypeOnly(clause);
}

function namedExportsAreAllTypeOnly(exportClause: ts.NamedExportBindings | undefined): boolean {
  if (exportClause === undefined || !ts.isNamedExports(exportClause)) return false;
  if (exportClause.elements.length === 0) return false;
  return exportClause.elements.every((element) => element.isTypeOnly);
}

function collectImportEdges(sourceFile: ts.SourceFile): readonly ImportEdge[] {
  const edges: ImportEdge[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const isTypeOnly = clause !== undefined && importClauseIsEffectivelyTypeOnly(clause);
      edges.push({ specifier: node.moduleSpecifier.text, isTypeOnly, isDynamicOrRequire: false });
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const isTypeOnly = node.isTypeOnly || namedExportsAreAllTypeOnly(node.exportClause);
      edges.push({ specifier: node.moduleSpecifier.text, isTypeOnly, isDynamicOrRequire: false });
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      edges.push({
        specifier: node.moduleReference.expression.text,
        isTypeOnly: node.isTypeOnly,
        isDynamicOrRequire: false,
      });
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

function createMixedDefaultAndNamedImportDeclaration(params: {
  readonly specifier: string;
  readonly namedTypeOnlyFlags: readonly boolean[];
}): ts.ImportDeclaration {
  const elements = params.namedTypeOnlyFlags.map((isTypeOnly, index) =>
    ts.factory.createImportSpecifier(isTypeOnly, undefined, ts.factory.createIdentifier("member" + String(index))),
  );
  const importClause = ts.factory.createImportClause(
    false,
    ts.factory.createIdentifier("defaultMember"),
    ts.factory.createNamedImports(elements),
  );
  return ts.factory.createImportDeclaration(undefined, importClause, ts.factory.createStringLiteral(params.specifier), undefined);
}

function createNamedExportDeclaration(params: {
  readonly specifier: string;
  readonly wholeClauseTypeOnly: boolean;
  readonly namedTypeOnlyFlags: readonly boolean[];
}): ts.ExportDeclaration {
  const elements = params.namedTypeOnlyFlags.map((isTypeOnly, index) =>
    ts.factory.createExportSpecifier(isTypeOnly, undefined, ts.factory.createIdentifier("member" + String(index))),
  );
  return ts.factory.createExportDeclaration(
    undefined,
    params.wholeClauseTypeOnly,
    ts.factory.createNamedExports(elements),
    ts.factory.createStringLiteral(params.specifier),
    undefined,
  );
}

function createImportEqualsRequireStatement(specifier: string): ts.Statement {
  return ts.factory.createImportEqualsDeclaration(
    undefined,
    false,
    ts.factory.createIdentifier("legacyModule"),
    ts.factory.createExternalModuleReference(ts.factory.createStringLiteral(specifier)),
  );
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

describe("calibration benchmark history: preparation-time foreign reflection privacy (regression)", () => {
  // Host hypothesis under narrow external consultation (not yet a verdict):
  // prepareCalibrationBenchmarkHistory calls captureClosedParams outside any
  // try/catch, so a foreign value thrown from params reflection, or a
  // built-in TypeError thrown by a revoked root params proxy, may escape the
  // required fresh static causeless calibration:benchmark-history-invalid
  // boundary instead of being wrapped. These controls are written against
  // the current production source and are expected to be new RED regressions,
  // not manufactured failures in any already-passing control.

  function createForeignReadCounter(): { readonly trap: object; readCount(): number } {
    let reads = 0;
    const trap = new Proxy(
      {},
      {
        get(_target, _prop) {
          reads += 1;
          return () => {
            reads += 1;
            return "foreign-value";
          };
        },
        has() {
          reads += 1;
          return true;
        },
        getPrototypeOf() {
          reads += 1;
          return null;
        },
        ownKeys() {
          reads += 1;
          return [];
        },
        getOwnPropertyDescriptor() {
          reads += 1;
          return undefined;
        },
      },
    );
    return { trap, readCount: () => reads };
  }

  type ParamsProxyTrapName = "getPrototypeOf" | "ownKeys" | "getOwnPropertyDescriptor";

  function createThrowingParamsProxy(trapName: ParamsProxyTrapName, thrownValue: unknown): unknown {
    const base = validParams();
    const handler: ProxyHandler<object> = {};
    if (trapName === "getPrototypeOf") {
      handler.getPrototypeOf = () => {
        throw thrownValue;
      };
    } else if (trapName === "ownKeys") {
      handler.ownKeys = () => {
        throw thrownValue;
      };
    } else {
      handler.getOwnPropertyDescriptor = () => {
        throw thrownValue;
      };
    }
    return new Proxy(base, handler);
  }

  it.each<ParamsProxyTrapName>(["getPrototypeOf", "ownKeys", "getOwnPropertyDescriptor"])(
    "never reads, coerces, or classifies a foreign value thrown from the params %s trap during preparation",
    (trapName) => {
      const { trap: foreignTrap, readCount } = createForeignReadCounter();
      const hostileParams = createThrowingParamsProxy(trapName, foreignTrap);
      let caught: unknown;
      try {
        prepareCalibrationBenchmarkHistory(hostileParams);
      } catch (error) {
        caught = error;
      }
      // Compare by boolean identity first: even if the wrapping boundary
      // were broken, a failure here would log only a boolean, never the
      // foreign value itself.
      expect(caught === foreignTrap).toBe(false);
      expect(caught).toBeInstanceOf(CalibrationFatalError);
      expect((caught as CalibrationFatalError).message).toBe(BENCHMARK_HISTORY_INVALID_MESSAGE);
      expect(Object.getOwnPropertyDescriptor(caught as object, "cause")).toBeUndefined();
      expect(readCount()).toBe(0);
    },
  );

  it("never reads, coerces, or classifies a thrown error from a revoked root params proxy during preparation", () => {
    const revocableParams = Proxy.revocable(validParams(), {});
    revocableParams.revoke();
    let caught: unknown;
    try {
      prepareCalibrationBenchmarkHistory(revocableParams.proxy);
    } catch (error) {
      caught = error;
    }
    expect(caught === revocableParams.proxy).toBe(false);
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect((caught as CalibrationFatalError).message).toBe(BENCHMARK_HISTORY_INVALID_MESSAGE);
    expect(Object.getOwnPropertyDescriptor(caught as object, "cause")).toBeUndefined();
  });

  it("never inspects or coerces a thrown revoked-proxy value itself during preparation", () => {
    const thrownRevocable = Proxy.revocable({}, {});
    thrownRevocable.revoke();
    const hostileParams = createThrowingParamsProxy("ownKeys", thrownRevocable.proxy);
    let caught: unknown;
    try {
      prepareCalibrationBenchmarkHistory(hostileParams);
    } catch (error) {
      caught = error;
    }
    expect(caught === thrownRevocable.proxy).toBe(false);
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect((caught as CalibrationFatalError).message).toBe(BENCHMARK_HISTORY_INVALID_MESSAGE);
    expect(Object.getOwnPropertyDescriptor(caught as object, "cause")).toBeUndefined();
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

  it("rejects a self-consistently-hashed 8192-byte padded reference because only the one pinned 1251-byte reference is admissible", () => {
    // Only the single pinned raw reference (1251 bytes, digest
    // fd712bee...) is ever admissible. This is a rejection-only control:
    // no caller-supplied hash, however internally self-consistent with its
    // own bytes, can substitute for the one pinned digest, so there is no
    // genuine schema-valid 8192-byte positive admission boundary to reach.
    const padded = padReferenceBytesTo(8192);
    expect(utf8ByteLength(padded)).toBe(8192);
    const selfConsistentHash = sha256Hex(padded);
    expect(selfConsistentHash).not.toBe(RAW_REFERENCE_SHA256);
    expect(() =>
      prepareCalibrationBenchmarkHistory({ historicalReferenceBytes: padded, historicalReferenceHash: selfConsistentHash }),
    ).toThrow(BENCHMARK_HISTORY_INVALID_MESSAGE);
  });

  it("rejects bytes one past the 8192 UTF-8 byte boundary even with a self-consistent hash", () => {
    const padded = padReferenceBytesTo(8193);
    expect(utf8ByteLength(padded)).toBe(8193);
    const selfConsistentHash = sha256Hex(padded);
    expect(() =>
      prepareCalibrationBenchmarkHistory({ historicalReferenceBytes: padded, historicalReferenceHash: selfConsistentHash }),
    ).toThrow(BENCHMARK_HISTORY_INVALID_MESSAGE);
  });

  it("rejects a whitespace-only tamper of the raw bytes against the original pinned hash", () => {
    const tampered = readRawReferenceBytes() + " ";
    expect(() =>
      prepareCalibrationBenchmarkHistory({ historicalReferenceBytes: tampered, historicalReferenceHash: RAW_REFERENCE_SHA256 }),
    ).toThrow(BENCHMARK_HISTORY_INVALID_MESSAGE);
  });

  it("rejects a whitespace-only tamper of the raw bytes even against its own self-consistent recalculated hash", () => {
    const tampered = readRawReferenceBytes() + " ";
    const selfConsistentHash = sha256Hex(tampered);
    expect(selfConsistentHash).not.toBe(RAW_REFERENCE_SHA256);
    expect(() =>
      prepareCalibrationBenchmarkHistory({ historicalReferenceBytes: tampered, historicalReferenceHash: selfConsistentHash }),
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

  const associationTamperCases: ReadonlyArray<readonly [string, (report: Record<string, unknown>) => void]> = [
    ["publicCases", (report) => { report.publicCases = 19; }],
    ["privateCases", (report) => { report.privateCases = 1; }],
    ["calibration.model", (report) => {
      (report.calibration as Record<string, unknown>).model = "gemini-9.9-flash";
    }],
    ["calibration.project", (report) => {
      (report.calibration as Record<string, unknown>).project = "some-other-project";
    }],
    ["calibration.location", (report) => {
      (report.calibration as Record<string, unknown>).location = "eu";
    }],
    ["calibration.thinkingLevel", (report) => {
      (report.calibration as Record<string, unknown>).thinkingLevel = "HIGH";
    }],
  ];

  it.each(associationTamperCases)("fails closed when %s is tampered on an otherwise genuine benchmark report", async (_label, mutate) => {
    const report = await makeBaselineReport();
    const cloned = cloneOwnedReport(report) as unknown as Record<string, unknown>;
    mutate(cloned);
    const assess = prepareCalibrationBenchmarkHistory(validParams());
    expect(() => assess.assess(cloned)).toThrow(BENCHMARK_HISTORY_INVALID_MESSAGE);
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

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "fails closed when a prediction numeric field is %s",
    async (nonfiniteValue) => {
      const report = await makeMeasuredReport({ stage: "benchmark", profile: "MEDIUM" });
      const mutable = report as unknown as { cases: Array<{ prediction: Record<string, unknown> }> };
      mutable.cases[0]!.prediction.kcal = nonfiniteValue;
      const assess = prepareCalibrationBenchmarkHistory(validParams());
      expect(() => assess.assess(report)).toThrow(BENCHMARK_HISTORY_INVALID_MESSAGE);
    },
  );

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

  it("fails closed on a forged but internally finite summary metric that does not match the recomputed aggregate", async () => {
    const report = await makeMeasuredReport({ stage: "benchmark", profile: "MEDIUM" });
    const mutable = report as unknown as { summary: Record<string, unknown> };
    // This value is finite and schema-shaped; actual measurement recomputes
    // the aggregate from cases and compares it against the supplied summary,
    // so a mismatched-but-finite forged value must still be rejected rather
    // than silently repaired or passed through as if genuine.
    mutable.summary.meanMacroRelativeError = 999;
    const assess = prepareCalibrationBenchmarkHistory(validParams());
    expect(() => assess.assess(report)).toThrow(BENCHMARK_HISTORY_INVALID_MESSAGE);
  });

  it("fails closed when a required historical delta metric is deleted from an otherwise genuine summary", async () => {
    const report = await makeMeasuredReport({ stage: "benchmark", profile: "MEDIUM" });
    const mutable = report as unknown as { summary: Record<string, unknown> };
    // Deleting this field while its eligible-count remains positive first
    // violates the existing report schema (which requires the metric
    // whenever the corresponding count is positive), so this fails closed
    // at the schema-validation boundary rather than specifically exercising
    // compareToHistoricalReferences own current_metric_unavailable path;
    // either way the missing required metric must never be silently
    // treated as compatible/complete.
    delete mutable.summary.meanMealCarbDensityRelativeError;
    const assess = prepareCalibrationBenchmarkHistory(validParams());
    expect(() => assess.assess(report)).toThrow(BENCHMARK_HISTORY_INVALID_MESSAGE);
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
  it("poisons the assessor permanently via busy/reentry guarding, not merely via an ordinary invalid nested input", async () => {
    const goodReportOne = await makeMeasuredReport({ stage: "benchmark", profile: "MEDIUM" });
    const goodReportTwo = await makeMeasuredReport({ stage: "benchmark", profile: "MEDIUM" });
    const assess = prepareCalibrationBenchmarkHistory(validParams());

    let nestedAttempted = false;
    let nestedAccepted = false;
    const hostileReport = new Proxy(goodReportOne as unknown as object, {
      getOwnPropertyDescriptor(target, prop) {
        nestedAttempted = true;
        try {
          // A genuinely valid report is used for the nested call (not an
          // ordinary-invalid input such as {} or null), so a successful
          // nested result would prove the busy/reentry guard is missing
          // rather than merely that invalid input is rejected. Absent
          // reentry protection this nested call would succeed outright.
          assess.assess(goodReportTwo);
          nestedAccepted = true;
        } catch {
          // Intentionally swallowed here: the nested denial must not
          // surface at this trap, and the outer call must still fail and
          // poison the assessor permanently regardless of this swallow.
        }
        return Reflect.getOwnPropertyDescriptor(target, prop);
      },
    });

    expect(() => assess.assess(hostileReport)).toThrow(BENCHMARK_HISTORY_INVALID_MESSAGE);
    expect(nestedAttempted).toBe(true);
    expect(nestedAccepted).toBe(false);
    expect(() => assess.assess(goodReportTwo)).toThrow(BENCHMARK_HISTORY_INVALID_MESSAGE);
  });

  it("never reads, coerces, or classifies a foreign thrown proxy value while wrapping it into a fresh static fatal", async () => {
    const report = await makeMeasuredReport({ stage: "benchmark", profile: "MEDIUM" });
    let readCount = 0;
    const foreignTrap = new Proxy(
      {},
      {
        get(_target, _prop) {
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
        getPrototypeOf() {
          readCount += 1;
          return null;
        },
        ownKeys() {
          readCount += 1;
          return [];
        },
        getOwnPropertyDescriptor() {
          readCount += 1;
          return undefined;
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
    // Compare by boolean identity first: even if wrapping were broken, a
    // failure here would log only a boolean, never the foreign value.
    expect(caught === foreignTrap).toBe(false);
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect((caught as CalibrationFatalError).message).toBe(BENCHMARK_HISTORY_INVALID_MESSAGE);
    expect(Object.getOwnPropertyDescriptor(caught as object, "cause")).toBeUndefined();
    expect(readCount).toBe(0);
  });

  it("never inspects or coerces a thrown revoked-proxy value itself while wrapping it into a fresh static fatal", async () => {
    const report = await makeMeasuredReport({ stage: "benchmark", profile: "MEDIUM" });
    const revocableThrownValue = Proxy.revocable({}, {});
    revocableThrownValue.revoke();
    const mutable = report as unknown as { cases: unknown[] };
    const hostileCases = new Proxy(mutable.cases, {
      ownKeys() {
        throw revocableThrownValue.proxy;
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
    // The thrown value is itself a revoked proxy: any read, coercion, or
    // classification against it would throw. We never touch it directly;
    // only its boolean identity against the known fresh fatal is compared.
    expect(caught === revocableThrownValue.proxy).toBe(false);
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect((caught as CalibrationFatalError).message).toBe(BENCHMARK_HISTORY_INVALID_MESSAGE);
    expect(Object.getOwnPropertyDescriptor(caught as object, "cause")).toBeUndefined();
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

  it("treats a runtime default binding alongside an all-type-only named clause as a violation, not a skip", () => {
    const declaration = createMixedDefaultAndNamedImportDeclaration({
      specifier: "fs",
      namedTypeOnlyFlags: [true],
    });
    const edges = collectImportEdges(createSyntheticImportSourceFile([declaration]));
    expect(edges.length).toBeGreaterThan(0);
    for (const edge of edges) {
      expect(edge.isTypeOnly).toBe(false);
      expect(classifyEdge(edge)).toBe("violation");
    }
  });

  it("treats a fully inline-type named reexport as type-only even from an otherwise forbidden specifier", () => {
    const declaration = createNamedExportDeclaration({
      specifier: "fs",
      wholeClauseTypeOnly: false,
      namedTypeOnlyFlags: [true, true],
    });
    const edges = collectImportEdges(createSyntheticImportSourceFile([declaration]));
    expect(edges.length).toBeGreaterThan(0);
    for (const edge of edges) {
      expect(classifyEdge(edge)).toBe("skip");
    }
  });

  it("treats a mixed runtime/type named reexport as a runtime edge", () => {
    const declaration = createNamedExportDeclaration({
      specifier: "fs",
      wholeClauseTypeOnly: false,
      namedTypeOnlyFlags: [false, true],
    });
    const edges = collectImportEdges(createSyntheticImportSourceFile([declaration]));
    expect(edges.length).toBeGreaterThan(0);
    for (const edge of edges) {
      expect(classifyEdge(edge)).toBe("violation");
    }
  });

  it("recognizes standard import-equals require syntax as a runtime edge", () => {
    const statement = createImportEqualsRequireStatement("fs");
    const edges = collectImportEdges(createSyntheticImportSourceFile([statement]));
    expect(edges.length).toBeGreaterThan(0);
    for (const edge of edges) {
      expect(classifyEdge(edge)).toBe("violation");
    }
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

describe("calibration benchmark history: capture budgets (array, string, node, depth)", () => {
  it("accepts a genuine prediction reviewReasons array at exactly the 256-element budget", async () => {
    const report = await makeMeasuredReport({ stage: "benchmark", profile: "MEDIUM" });
    const mutable = report as unknown as { cases: Array<{ prediction: Record<string, unknown> }> };
    mutable.cases[0]!.prediction.reviewReasons = new Array(256).fill("package_quantity_missing");
    const assess = prepareCalibrationBenchmarkHistory(validParams());
    const result = assess.assess(report);
    expect(result.comparison.compatible).toBe(true);
  });

  it("rejects a prediction reviewReasons array one past the 256-element budget", async () => {
    const report = await makeMeasuredReport({ stage: "benchmark", profile: "MEDIUM" });
    const mutable = report as unknown as { cases: Array<{ prediction: Record<string, unknown> }> };
    mutable.cases[0]!.prediction.reviewReasons = new Array(257).fill("package_quantity_missing");
    const assess = prepareCalibrationBenchmarkHistory(validParams());
    expect(() => assess.assess(report)).toThrow(BENCHMARK_HISTORY_INVALID_MESSAGE);
  });

  it("accepts a genuine unrelated baseline comparison with a baselineRunId at exactly the 4096 character string budget", async () => {
    const report = await makeMeasuredReport({ stage: "benchmark", profile: "MEDIUM" });
    const mutable = report as unknown as Record<string, unknown>;
    mutable.comparison = makeValidBaselineComparison("x".repeat(4096));
    const assess = prepareCalibrationBenchmarkHistory(validParams());
    const result = assess.assess(report);
    // The unrelated baseline comparison schema is untouched and never
    // receives the seven historical delta fields; its presence here is
    // purely a string-length capture-budget probe on an existing schema
    // extension point, not a historical computation input, and the
    // computed historical metrics are unaffected by it.
    expect(result.comparison.compatible).toBe(true);
  });

  it("rejects a comparison baselineRunId one past the 4096 character string budget", async () => {
    const report = await makeMeasuredReport({ stage: "benchmark", profile: "MEDIUM" });
    const mutable = report as unknown as Record<string, unknown>;
    mutable.comparison = makeValidBaselineComparison("x".repeat(4097));
    const assess = prepareCalibrationBenchmarkHistory(validParams());
    expect(() => assess.assess(report)).toThrow(BENCHMARK_HISTORY_INVALID_MESSAGE);
  });

  it("independently counts the real node-budget fixture above the 20000-node capture budget and confirms it is otherwise schema-valid", async () => {
    const report = await makeNodeBudgetReport({ profile: "MEDIUM" });
    const nodeCount = countGraphValueNodes(report);
    expect(nodeCount).toBeGreaterThan(20000);
    const assess = prepareCalibrationBenchmarkHistory(validParams());
    expect(() => assess.assess(report)).toThrow(BENCHMARK_HISTORY_INVALID_MESSAGE);
  });

  it("accepts the same node-budget fixture once reviewReasons entries are trimmed to exactly the 20000-node budget", async () => {
    // The exact starting node count of the genuine fixture is not hardcoded
    // here; it is measured and trimmed down dynamically at test-run time by
    // popping reviewReasons entries (which do not affect any scored
    // numeric/diagnostic field), so this reaches the exact 20000 boundary
    // without guessing a magic constant and without inventing a fixture.
    const report = await makeNodeBudgetReport({ profile: "MEDIUM" });
    trimNodeCountToExactly(report, 20000);
    expect(countGraphValueNodes(report)).toBe(20000);
    const assess = prepareCalibrationBenchmarkHistory(validParams());
    const result = assess.assess(report);
    expect(result.comparison.compatible).toBe(true);
  });

  it("rejects a malformed input nested one level past the 32-deep capture budget", () => {
    // No schema-valid NutritionEvalReport can legitimately reach a 32-deep
    // nesting bound; its shape is fixed and well under that depth. This is
    // therefore necessarily a malformed-input rejection-only control, not a
    // genuine schema-valid positive depth-32 boundary, which is
    // unconstructible from any real report.
    const assess = prepareCalibrationBenchmarkHistory(validParams());
    const overDeep = buildOverDepthObject(33);
    expect(() => assess.assess(overDeep)).toThrow(BENCHMARK_HISTORY_INVALID_MESSAGE);
  });

  it("does not invoke reflection on a hostile structure nested past the 32-deep capture budget", () => {
    let touchedPastBudget = false;
    const poisonedTail = new Proxy(
      {},
      {
        ownKeys() {
          touchedPastBudget = true;
          return [];
        },
      },
    );
    let node: unknown = poisonedTail;
    for (let i = 0; i < 33; i += 1) {
      node = { nested: node };
    }
    const assess = prepareCalibrationBenchmarkHistory(validParams());
    expect(() => assess.assess(node)).toThrow(BENCHMARK_HISTORY_INVALID_MESSAGE);
    expect(touchedPastBudget).toBe(false);
  });
});

describe("calibration benchmark history: stronger ownership", () => {
  it("does not retain a mutable alias to the original params object after preparation", async () => {
    const params = validParams();
    const assess = prepareCalibrationBenchmarkHistory(params);
    params.historicalReferenceBytes = "mutated-after-prepare";
    params.historicalReferenceHash = "0".repeat(64);
    expect(Object.isFrozen(params)).toBe(false);
    const report = await makeMeasuredReport({ stage: "benchmark", profile: "MEDIUM" });
    const result = assess.assess(report);
    // If the assessor had retained a live alias to the mutated params
    // rather than an owned copy captured at preparation time, this would
    // now fail against the garbage bytes/hash instead of succeeding against
    // the originally captured pinned reference.
    expect(result.comparison.compatible).toBe(true);
  });

  it("never freezes the original caller-owned params, report, or nested case/prediction data", async () => {
    const params = validParams();
    const report = await makeMeasuredReport({ stage: "benchmark", profile: "MEDIUM" });
    const assess = prepareCalibrationBenchmarkHistory(params);
    assess.assess(report);
    expect(Object.isFrozen(params)).toBe(false);
    expect(Object.isFrozen(report)).toBe(false);
    const mutable = report as unknown as { cases: Array<{ prediction: unknown }> };
    expect(Object.isFrozen(mutable.cases)).toBe(false);
    expect(Object.isFrozen(mutable.cases[0])).toBe(false);
    expect(Object.isFrozen(mutable.cases[0]!.prediction)).toBe(false);
  });

  it("does not change the retained owned prediction when a nested caller prediction is mutated after assess", async () => {
    const report = await makeMeasuredReport({ stage: "benchmark", profile: "MEDIUM" });
    const assess = prepareCalibrationBenchmarkHistory(validParams());
    const result = assess.assess(report);
    const mutable = report as unknown as { cases: Array<{ prediction: Record<string, unknown> }> };
    const originalKcal = mutable.cases[0]!.prediction.kcal;
    mutable.cases[0]!.prediction.kcal = (originalKcal as number) + 12345;
    const ownedPrediction = result.measurements.report.cases[0]!.prediction as unknown as Record<string, unknown>;
    expect(ownedPrediction.kcal).toBe(originalKcal);
  });

  it("deeply freezes nested result layers beyond the top-level objects", async () => {
    const report = await makeMeasuredReport({ stage: "benchmark", profile: "MEDIUM" });
    const assess = prepareCalibrationBenchmarkHistory(validParams());
    const result = assess.assess(report);
    expect(Object.isFrozen(result.measurements.report.cases)).toBe(true);
    expect(Object.isFrozen(result.measurements.report.cases[0])).toBe(true);
    expect(Object.isFrozen(result.comparison.deltas)).toBe(true);
    expect(Object.isFrozen(result.comparison.compatibilityReasons)).toBe(true);
    expect(Object.isFrozen(result.subset.failures)).toBe(true);
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

  it("loads the exact committed reference through the default loader, and separately through an injected custom loader", async () => {
    const paths = resolveHistoricalReferenceRuntimePaths(join(__dirname, "..", "..", "lib", "nutrition-eval"));
    const reference = await loadHistoricalReference(paths);
    expect(reference.runId).toBe("run-2026-09-11T20-22-21-450Z");
    const raw = await defaultLoadHistoricalReference(paths);
    expect(parseHistoricalReference(raw).runId).toBe("run-2026-09-11T20-22-21-450Z");

    let customLoaderCalls = 0;
    const customReference = await loadHistoricalReference(paths, async (loaderPaths) => {
      customLoaderCalls += 1;
      return JSON.parse(readFileSync(loaderPaths.referencePath, "utf8"));
    });
    expect(customLoaderCalls).toBe(1);
    expect(customReference.runId).toBe("run-2026-09-11T20-22-21-450Z");
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
