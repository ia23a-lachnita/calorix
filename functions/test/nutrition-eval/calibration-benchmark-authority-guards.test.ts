/**
 * Calibration benchmark authority guards (Task 3 Step 1, Slices A, B, and C).
 *
 * Slice A: full-gate discriminator unit matrix. Slice B: opt-in benchmark
 * authority constructor boundaries (valid baseline, config/runtime-option
 * negative and hostile-reflection controls with full foreign
 * reflection/coercion counters, caller-alias independence for runtime options and
 * plans, zero mutating-port witness). Slice C: reachable runtime
 * stage-completion reentry, privacy, permanent-poison, and returned-alias
 * controls.
 *
 * This is trusted-core qualification only: it does not exercise native
 * filesystem recovery, SDK dispatch, live nutrition accuracy, or production
 * or security readiness.
 */
import { afterAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { evaluateCalibrationStageGate } from "../../src/nutrition-eval/calibration";
import { measureCalibrationStageReport } from "../../src/nutrition-eval/calibration-report-measurements";
import type { CalibrationStageGateMetrics } from "../../src/nutrition-eval/calibration-report-measurements";
import { makeMeasuredReport } from "./calibration-authoritative-fixtures";
import { createBenchmarkAuthorityCalibrationLedger } from "../../src/nutrition-eval/calibration";
import type {
  CalibrationAuthoritativeReportOptions,
  CalibrationIdentity,
  CalibrationKeyResolver,
  CalibrationOwner,
  CalibrationRuntimeEvidenceLedger,
  CalibrationRuntimeEvidenceOptions,
} from "../../src/nutrition-eval/calibration";
import type { CalibrationProtocolReportOptions } from "../../src/nutrition-eval/calibration-report-state";
import { deriveCanonicalAllowedKeys } from "../../src/nutrition-eval/calibration-bootstrap";
import { CalibrationFatalError } from "../../src/nutrition-eval/fatal-error";
import {
  makeRuntimeEvidenceCoreBacking,
  makeRuntimeEvidenceCoreFixture,
  makeRuntimeEvidenceData,
} from "./calibration-runtime-evidence-fixtures";
import type {
  RuntimeCanonicalPlans,
  RuntimeEvidenceCoreBacking,
  RuntimeEvidenceCoreFixture,
} from "./calibration-runtime-evidence-fixtures";
import type { JournalEntry } from "../../src/nutrition-eval/calibration";
import type { CalibrationReportPublicationResult } from "../../src/nutrition-eval/calibration-report-publication";
import { prepareCalibrationStageReportReconstructor } from "../../src/nutrition-eval/calibration-report-assembly";
import { renderNutritionEvalJson, renderNutritionEvalMarkdown } from "../../src/nutrition-eval/report";

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

interface ConstructorFixture {
  readonly backing: RuntimeEvidenceCoreBacking;
  readonly identity: CalibrationIdentity;
  readonly owner: CalibrationOwner;
  readonly plans: RuntimeCanonicalPlans;
  readonly config: { historicalReferenceBytes: string };
  readonly keyResolver: CalibrationKeyResolver;
  readonly reportOptions: CalibrationProtocolReportOptions;
  readonly authoritativeOptions: CalibrationAuthoritativeReportOptions;
  readonly readCurrentGitState: () => { headCommit: string; functionsTreeId: string; dirtyPaths: string[] };
}

async function makeConstructorFixture(): Promise<ConstructorFixture> {
  const data = await makeRuntimeEvidenceData();
  const backing = makeRuntimeEvidenceCoreBacking();
  const identity: CalibrationIdentity = { ...data.header.identity };
  const owner: CalibrationOwner = { ...data.header.owner };
  return {
    backing,
    identity,
    owner,
    plans: data.plans,
    config: { historicalReferenceBytes: data.context.files["historical-reference"] },
    keyResolver: (profile) => deriveCanonicalAllowedKeys(data.context.files, profile),
    reportOptions: {
      getReportOutcomePlan: (profile) =>
        profile === undefined ? data.plans.initial : profile === "LOW" ? data.plans.LOW : data.plans.MEDIUM,
    },
    authoritativeOptions: {
      verifyStageReportArtifacts: () => {
        throw new CalibrationFatalError("calibration:guard-constructor-unused-verifier");
      },
    },
    readCurrentGitState: () => ({
      headCommit: "a".repeat(40),
      functionsTreeId: identity.functionsTreeId,
      dirtyPaths: [],
    }),
  };
}

interface ConstructorOverrides {
  readonly identity?: unknown;
  readonly config?: unknown;
  readonly runtimeOptions?: unknown;
  readonly owner?: unknown;
  readonly plans?: unknown;
  readonly readCurrentGitState?: unknown;
}

function constructLedger(
  fixture: ConstructorFixture,
  overrides: ConstructorOverrides = {},
): CalibrationRuntimeEvidenceLedger {
  const hasIdentity = Object.hasOwn(overrides, "identity");
  const hasConfig = Object.hasOwn(overrides, "config");
  const hasRuntimeOptions = Object.hasOwn(overrides, "runtimeOptions");
  const hasOwner = Object.hasOwn(overrides, "owner");
  const hasPlans = Object.hasOwn(overrides, "plans");
  const hasReadCurrentGitState = Object.hasOwn(overrides, "readCurrentGitState");

  const identity = hasIdentity ? overrides.identity : fixture.identity;
  const config = hasConfig ? overrides.config : fixture.config;

  // Cast only at the public boundary: malformed values must reach the real
  // constructor unchanged, including explicitly present null/undefined.
  const runtimeOptions = hasRuntimeOptions ? overrides.runtimeOptions : {
    initialOwner: hasOwner ? overrides.owner : fixture.owner,
    plans: hasPlans ? overrides.plans : fixture.plans,
    readCurrentGitState: hasReadCurrentGitState
      ? overrides.readCurrentGitState
      : fixture.readCurrentGitState,
  };
  return createBenchmarkAuthorityCalibrationLedger(
    fixture.backing.deps,
    identity as CalibrationIdentity,
    fixture.keyResolver,
    fixture.reportOptions,
    fixture.authoritativeOptions,
    runtimeOptions as CalibrationRuntimeEvidenceOptions,
    config,
  );
}

interface TrapCounts {
  name: number;
  message: number;
  code: number;
  cause: number;
  stack: number;
  toJSON: number;
  prototype: number;
  ownKeys: number;
  descriptor: number;
  has: number;
  set: number;
  defineProperty: number;
  deleteProperty: number;
  isExtensible: number;
  preventExtensions: number;
  toPrimitive: number;
  toString: number;
  valueOf: number;
}

function makeTrapCountingThrow(): { error: object; counts: TrapCounts } {
  const counts: TrapCounts = {
    name: 0,
    message: 0,
    code: 0,
    cause: 0,
    stack: 0,
    toJSON: 0,
    prototype: 0,
    ownKeys: 0,
    descriptor: 0,
    has: 0,
    set: 0,
    defineProperty: 0,
    deleteProperty: 0,
    isExtensible: 0,
    preventExtensions: 0,
    toPrimitive: 0,
    toString: 0,
    valueOf: 0,
  };
  const target = {
    name: "HostileError",
    message: "hostile",
    code: "HOSTILE",
    cause: undefined,
    stack: "hostile-stack",
    toJSON: () => "hostile-json",
    [Symbol.toPrimitive]: () => "hostile-primitive",
    toString: () => "hostile-tostring",
    valueOf: () => "hostile-valueof",
  };
  const handler: ProxyHandler<typeof target> = {
    getPrototypeOf() {
      counts.prototype += 1;
      return Object.getPrototypeOf(target);
    },
    getOwnPropertyDescriptor(_t, prop) {
      counts.descriptor += 1;
      return Reflect.getOwnPropertyDescriptor(target, prop);
    },
    ownKeys() {
      counts.ownKeys += 1;
      return Reflect.ownKeys(target);
    },
    has(_t, prop) {
      counts.has += 1;
      return prop in target;
    },
    get(_t, prop) {
      if (prop === "name") {
        counts.name += 1;
      } else if (prop === "message") {
        counts.message += 1;
      } else if (prop === "code") {
        counts.code += 1;
      } else if (prop === "cause") {
        counts.cause += 1;
      } else if (prop === "stack") {
        counts.stack += 1;
      } else if (prop === "toJSON") {
        counts.toJSON += 1;
      } else if (prop === Symbol.toPrimitive) {
        counts.toPrimitive += 1;
      } else if (prop === "toString") {
        counts.toString += 1;
      } else if (prop === "valueOf") {
        counts.valueOf += 1;
      }
      return Reflect.get(target, prop);
    },
    set(_t, prop, value) {
      counts.set += 1;
      return Reflect.set(target, prop, value);
    },
    defineProperty(_t, prop, descriptor) {
      counts.defineProperty += 1;
      return Reflect.defineProperty(target, prop, descriptor);
    },
    deleteProperty(_t, prop) {
      counts.deleteProperty += 1;
      return Reflect.deleteProperty(target, prop);
    },
    isExtensible() {
      counts.isExtensible += 1;
      return Reflect.isExtensible(target);
    },
    preventExtensions() {
      counts.preventExtensions += 1;
      return Reflect.preventExtensions(target);
    },
  };
  return { error: new Proxy(target, handler), counts };
}

function expectCleanForeignRejection(counts: TrapCounts): void {
  expect(counts.name).toBe(0);
  expect(counts.message).toBe(0);
  expect(counts.code).toBe(0);
  expect(counts.cause).toBe(0);
  expect(counts.stack).toBe(0);
  expect(counts.toJSON).toBe(0);
  expect(counts.prototype).toBe(0);
  expect(counts.ownKeys).toBe(0);
  expect(counts.descriptor).toBe(0);
  expect(counts.has).toBe(0);
  expect(counts.set).toBe(0);
  expect(counts.defineProperty).toBe(0);
  expect(counts.deleteProperty).toBe(0);
  expect(counts.isExtensible).toBe(0);
  expect(counts.preventExtensions).toBe(0);
  expect(counts.toPrimitive).toBe(0);
  expect(counts.toString).toBe(0);
  expect(counts.valueOf).toBe(0);
}

function makeRevoked(): unknown {
  const revocable = Proxy.revocable({}, {});
  revocable.revoke();
  return revocable.proxy;
}

function makeRevokedForeignThrow(): unknown {
  const revocable = Proxy.revocable(
    {
      name: "RevokedForeignError",
      message: "revoked-foreign",
      code: "REVOKED_FOREIGN",
      cause: undefined,
      stack: "revoked-foreign-stack",
      toJSON: () => "revoked-foreign-json",
    },
    {},
  );
  revocable.revoke();
  return revocable.proxy;
}

function makeRevokedInputThrow(): unknown {
  const revocable = Proxy.revocable({}, {});
  revocable.revoke();
  return revocable.proxy;
}

function makeHostileReflectionProxy(
  target: object,
  trap: "getPrototypeOf" | "ownKeys" | "getOwnPropertyDescriptor",
  descriptorKey: string | undefined,
  thrown: unknown,
): { proxy: object; hits: { count: number } } {
  const hits = { count: 0 };
  const handler: ProxyHandler<object> = {};
  if (trap === "getPrototypeOf") {
    handler.getPrototypeOf = () => {
      hits.count += 1;
      throw thrown;
    };
  } else if (trap === "ownKeys") {
    handler.ownKeys = () => {
      hits.count += 1;
      throw thrown;
    };
  } else {
    handler.getOwnPropertyDescriptor = (t, prop) => {
      if (descriptorKey === undefined || prop === descriptorKey) {
        hits.count += 1;
        throw thrown;
      }
      return Reflect.getOwnPropertyDescriptor(t, prop);
    };
  }
  return { proxy: new Proxy(target, handler), hits };
}

const BENCHMARK_CONSTRUCTOR_INVALID = "calibration:benchmark-authority-input-invalid";

const CONSTRUCTOR_MUTATING_PORTS = [
  "writeLockExclusive", "archiveLock", "removeLock", "appendLedgerEvent",
  "fsyncLedgerFile", "fsyncLedgerDir", "appendJournal", "fsyncJournalFile", "fsyncJournalDir",
];

function expectNoConstructorMutation(fixture: ConstructorFixture): void {
  expect(fixture.backing.trace.filter((call) => CONSTRUCTOR_MUTATING_PORTS.includes(call))).toEqual([]);
  expect(fixture.backing.events).toEqual([]);
  expect(fixture.backing.journals).toEqual([]);
  expect(fixture.backing.lock).toBeUndefined();
}

function expectRejectedConstructor(
  fixture: ConstructorFixture,
  overrides: ConstructorOverrides,
  foreignThrows: readonly unknown[] = [],
  counts?: TrapCounts,
): void {
  let threw = false;
  let caught: unknown;
  try {
    constructLedger(fixture, overrides);
  } catch (error) {
    threw = true;
    caught = error;
  }
  expect(threw).toBe(true);
  // Match only primitive booleans. Even a passing matcher can reflect or
  // format an unknown operand; instanceof is also unsafe on a foreign Proxy.
  const controlledHandles: readonly unknown[] = [
    fixture, fixture.backing, fixture.backing.deps, fixture.identity,
    fixture.owner, fixture.plans, fixture.config, fixture.keyResolver,
    fixture.reportOptions, fixture.authoritativeOptions, fixture.readCurrentGitState,
    overrides, overrides.identity, overrides.config, overrides.runtimeOptions,
    overrides.owner, overrides.plans, overrides.readCurrentGitState,
    ...foreignThrows,
  ];
  for (const handle of controlledHandles) expect(caught !== handle).toBe(true);
  if (counts !== undefined) expectCleanForeignRejection(counts);
  // All controlled foreign/input identities are excluded before inspecting
  // the owned error. These assertions qualify these fixtures, not all proxies.
  expect(caught instanceof CalibrationFatalError).toBe(true);
  const owned = caught as CalibrationFatalError;
  expect(owned.message).toBe(BENCHMARK_CONSTRUCTOR_INVALID);
  expect(Object.hasOwn(owned, "cause")).toBe(false);
  expectNoConstructorMutation(fixture);
}

function makeMutablePlans(plans: RuntimeCanonicalPlans) {
  return {
    initial: plans.initial.map((row) => ({ ...row, key: { ...row.key } })),
    LOW: plans.LOW.map((row) => ({ ...row, key: { ...row.key } })),
    MEDIUM: plans.MEDIUM.map((row) => ({ ...row, key: { ...row.key } })),
  };
}

function expectUnfrozenCallerPlans(plans: RuntimeCanonicalPlans): void {
  expect(Object.isFrozen(plans)).toBe(false);
  for (const rows of [plans.initial, plans.LOW, plans.MEDIUM]) {
    expect(Object.isFrozen(rows)).toBe(false);
    for (const row of rows) {
      expect(Object.isFrozen(row)).toBe(false);
      expect(Object.isFrozen(row.key)).toBe(false);
    }
  }
}

function mutateCallerPlans(plans: ReturnType<typeof makeMutablePlans>): void {
  for (const name of ["initial", "LOW", "MEDIUM"] as const) {
    const first = plans[name][0];
    if (first === undefined) throw new Error("guard fixture requires a nonempty canonical plan");
    first.key.caseId = `tampered-${name}`;
    plans[name].push({ ...first, key: { ...first.key } });
  }
}

function expectPristinePlanCallbacks(
  fixture: ConstructorFixture,
  pristine: RuntimeCanonicalPlans,
): void {
  expect(fixture.plans).toEqual(pristine);
  expect(fixture.reportOptions.getReportOutcomePlan()).toEqual(pristine.initial);
  expect(fixture.reportOptions.getReportOutcomePlan("LOW")).toEqual(pristine.LOW);
  expect(fixture.reportOptions.getReportOutcomePlan("MEDIUM")).toEqual(pristine.MEDIUM);
}

describe("benchmark authority constructor boundaries", () => {
  it("performs read-only construction without mutations before explicit acquisition, then is usable after an explicit acquire", async () => {
    const fixture = await makeConstructorFixture();
    const ledger = constructLedger(fixture);
    expectNoConstructorMutation(fixture);
    ledger.acquireLock({ ...fixture.owner });
    expect(fixture.backing.trace).toContain("writeLockExclusive");
  }, SMALL_TEST_TIMEOUT);

  it("never invokes a benchmark configuration accessor used instead of an owned value", async () => {
    const fixture = await makeConstructorFixture();
    let called = false;
    const config: Record<string, unknown> = {};
    Object.defineProperty(config, "historicalReferenceBytes", {
      enumerable: true,
      configurable: true,
      get(): string {
        called = true;
        return fixture.config.historicalReferenceBytes;
      },
    });
    expectRejectedConstructor(fixture, { config });
    expect(called).toBe(false);
  }, SMALL_TEST_TIMEOUT);

  const CONFIG_NEGATIVE_CASES: readonly [string, (bytes: string) => unknown][] = [
    ["null", () => null],
    ["an array", (bytes) => [bytes]],
    ["a hostile prototype", (bytes) => Object.setPrototypeOf({ historicalReferenceBytes: bytes }, { evil: true })],
    ["a missing field", () => ({})],
    ["an extra string key", (bytes) => ({ historicalReferenceBytes: bytes, extra: "x" })],
    ["an extra symbol key", (bytes) => ({ historicalReferenceBytes: bytes, [Symbol("x")]: "y" })],
    ["a non-string value", () => ({ historicalReferenceBytes: 12345 })],
    ["an explicitly undefined value", () => {
      const record: Record<string, unknown> = {};
      Object.defineProperty(record, "historicalReferenceBytes", { value: undefined, enumerable: true, configurable: true });
      return record;
    }],
    ["a corrupted reference that fails the pinned checksum", () => ({ historicalReferenceBytes: "not-the-real-reference-bytes" })],
    ["a revoked input proxy", () => makeRevokedInputThrow()],
  ];

  it.each(CONFIG_NEGATIVE_CASES)("rejects benchmark configuration that is %s", async (_name, make) => {
    const fixture = await makeConstructorFixture();
    const config = make(fixture.config.historicalReferenceBytes);
    expectRejectedConstructor(fixture, { config });
  }, SMALL_TEST_TIMEOUT);

  const RUNTIME_OPTION_NEGATIVE_CASES: readonly [string, (fixture: ConstructorFixture) => ConstructorOverrides][] = [
    ["a revoked proxy for the whole runtime options", () => ({ runtimeOptions: makeRevoked() })],
    ["an array for the whole runtime options", (fixture) => ({
      runtimeOptions: [fixture.owner, fixture.plans, fixture.readCurrentGitState],
    })],
    ["an extra unexpected top-level key", (fixture) => ({
      runtimeOptions: {
        initialOwner: fixture.owner, plans: fixture.plans, readCurrentGitState: fixture.readCurrentGitState, extra: 1,
      },
    })],
    ["a revoked proxy initial owner", () => ({ owner: makeRevoked() })],
    ["an initial owner missing a required field", (fixture) => {
      const { pid, ...rest } = fixture.owner;
      void pid;
      return { owner: rest };
    }],
    ["a revoked proxy plans object", () => ({ plans: makeRevoked() })],
    ["a non-function Git-state reader", () => ({ readCurrentGitState: "not-a-function" })],
  ];

  it.each(RUNTIME_OPTION_NEGATIVE_CASES)("rejects runtime options with %s", async (_name, make) => {
    const fixture = await makeConstructorFixture();
    const overrides = make(fixture);
    expectRejectedConstructor(fixture, overrides);
  }, SMALL_TEST_TIMEOUT);

  const REFLECTION_TRAP_CASES: readonly [
    "config" | "runtimeOptions",
    "getPrototypeOf" | "ownKeys" | "getOwnPropertyDescriptor",
    string | undefined,
  ][] = [
    ["config", "getPrototypeOf", undefined],
    ["config", "ownKeys", undefined],
    ["config", "getOwnPropertyDescriptor", "historicalReferenceBytes"],
    ["runtimeOptions", "getPrototypeOf", undefined],
    ["runtimeOptions", "ownKeys", undefined],
    ["runtimeOptions", "getOwnPropertyDescriptor", "initialOwner"],
  ];

  it.each(REFLECTION_TRAP_CASES)(
    "wraps a hostile %s %s trap without reading any foreign error reflection",
    async (target, trap, descriptorKey) => {
      const fixture = await makeConstructorFixture();
      const hostile = makeTrapCountingThrow();
      const base =
        target === "config"
          ? fixture.config
          : { initialOwner: fixture.owner, plans: fixture.plans, readCurrentGitState: fixture.readCurrentGitState };
      const { proxy, hits } = makeHostileReflectionProxy(base, trap, descriptorKey, hostile.error);
      const overrides: ConstructorOverrides = target === "config" ? { config: proxy } : { runtimeOptions: proxy };
      expectRejectedConstructor(fixture, overrides, [hostile.error], hostile.counts);
      expect(hits.count).toBe(1);
    },
    SMALL_TEST_TIMEOUT,
  );

  it("rejects an explicitly null config field without substituting a default", async () => {
    const fixture = await makeConstructorFixture();
    const config = { historicalReferenceBytes: null };
    expectRejectedConstructor(fixture, { config });
  }, SMALL_TEST_TIMEOUT);

  it("rejects an explicitly undefined config field without substituting a default", async () => {
    const fixture = await makeConstructorFixture();
    const config: Record<string, unknown> = {};
    Object.defineProperty(config, "historicalReferenceBytes", { value: undefined, enumerable: true, configurable: true });
    expectRejectedConstructor(fixture, { config });
  }, SMALL_TEST_TIMEOUT);

  const EXPLICIT_EMPTY_OVERRIDES: readonly [string, ConstructorOverrides][] = [
    ["an undefined whole config", { config: undefined }],
    ["a null whole runtime options record", { runtimeOptions: null }],
    ["an undefined whole runtime options record", { runtimeOptions: undefined }],
  ];

  it.each(EXPLICIT_EMPTY_OVERRIDES)("rejects %s without substituting a default", async (_name, overrides) => {
    const fixture = await makeConstructorFixture();
    expectRejectedConstructor(fixture, overrides);
  }, SMALL_TEST_TIMEOUT);

  it("replaces a revoked foreign throw with an owned causeless boundary error", async () => {
    const fixture = await makeConstructorFixture();
    const revoked = makeRevokedForeignThrow();
    const config = { ...fixture.config };
    const { proxy, hits } = makeHostileReflectionProxy(config, "getOwnPropertyDescriptor", "historicalReferenceBytes", revoked);
    // Revoked internals are not observable counters: prove the input hook
    // threw this handle and the public boundary returned a fresh owned error.
    expectRejectedConstructor(fixture, { config: proxy }, [revoked, config]);
    expect(hits.count).toBe(1);
  }, SMALL_TEST_TIMEOUT);

  it("rejects a revoked input with an owned causeless boundary error", async () => {
    const fixture = await makeConstructorFixture();
    const revoked = makeRevokedInputThrow();
    expectRejectedConstructor(fixture, { runtimeOptions: revoked });
  }, SMALL_TEST_TIMEOUT);

  it("constructs a valid ledger from a null-prototype config record", async () => {
    const fixture = await makeConstructorFixture();
    const config = Object.assign(Object.create(null) as Record<string, unknown>, fixture.config);
    const ledger = constructLedger(fixture, { config });
    expectNoConstructorMutation(fixture);
    ledger.acquireLock({ ...fixture.owner });
    expect(fixture.backing.trace).toContain("writeLockExclusive");
  }, SMALL_TEST_TIMEOUT);

  it("constructs a valid ledger from a null-prototype runtime options record", async () => {
    const fixture = await makeConstructorFixture();
    const runtimeOptions = Object.assign(Object.create(null) as Record<string, unknown>, {
      initialOwner: fixture.owner,
      plans: fixture.plans,
      readCurrentGitState: fixture.readCurrentGitState,
    });
    const ledger = constructLedger(fixture, { runtimeOptions });
    expectNoConstructorMutation(fixture);
    ledger.acquireLock({ ...fixture.owner });
    expect(fixture.backing.trace).toContain("writeLockExclusive");
  }, SMALL_TEST_TIMEOUT);

  it("captures runtime options independently of later caller-side mutation", async () => {
    const fixture = await makeConstructorFixture();
    const pristinePlans = structuredClone(fixture.plans);
    const pristineKeys = fixture.keyResolver().map((key) => ({ ...key }));
    const pristineReader = fixture.readCurrentGitState;
    const pristineGitState = pristineReader();
    const readerDescriptors = Object.getOwnPropertyDescriptors(pristineReader);
    const mutableRuntimeOptions = {
      initialOwner: { ...fixture.owner },
      plans: makeMutablePlans(fixture.plans),
      readCurrentGitState: pristineReader,
    };
    const ledger = constructLedger(fixture, { runtimeOptions: mutableRuntimeOptions });
    expectNoConstructorMutation(fixture);
    expect(mutableRuntimeOptions).toEqual({
      initialOwner: fixture.owner, plans: pristinePlans, readCurrentGitState: pristineReader,
    });
    expect(Object.isFrozen(mutableRuntimeOptions)).toBe(false);
    expect(Object.isFrozen(mutableRuntimeOptions.initialOwner)).toBe(false);
    expectUnfrozenCallerPlans(mutableRuntimeOptions.plans);
    expect(Object.isFrozen(pristineReader)).toBe(false);
    expect(Object.getOwnPropertyDescriptors(pristineReader)).toEqual(readerDescriptors);
    mutableRuntimeOptions.initialOwner.hostname = "tampered-after-construction";
    mutateCallerPlans(mutableRuntimeOptions.plans);
    mutableRuntimeOptions.readCurrentGitState = () => {
      throw new Error("mutated caller callback must not be used");
    };
    expectPristinePlanCallbacks(fixture, pristinePlans);
    expect(fixture.keyResolver()).toEqual(pristineKeys);
    expect(pristineReader()).toEqual(pristineGitState);
    ledger.acquireLock({ ...fixture.owner });
    expect(fixture.backing.trace.filter((call) => call === "writeLockExclusive")).toHaveLength(1);
    expect(fixture.backing.lock).toEqual(fixture.owner);
  }, SMALL_TEST_TIMEOUT);

  it("captures plans independently of later caller-side mutation", async () => {
    const fixture = await makeConstructorFixture();
    const pristinePlans = structuredClone(fixture.plans);
    const pristineKeys = fixture.keyResolver().map((key) => ({ ...key }));
    const mutablePlans = makeMutablePlans(fixture.plans);
    const ledger = constructLedger(fixture, { plans: mutablePlans });
    expectNoConstructorMutation(fixture);
    expect(mutablePlans).toEqual(pristinePlans);
    expectUnfrozenCallerPlans(mutablePlans);
    mutateCallerPlans(mutablePlans);
    expectPristinePlanCallbacks(fixture, pristinePlans);
    expect(fixture.keyResolver()).toEqual(pristineKeys);
    ledger.acquireLock({ ...fixture.owner });
    expect(fixture.backing.trace.filter((call) => call === "writeLockExclusive")).toHaveLength(1);
    expect(fixture.backing.lock).toEqual(fixture.owner);
  }, SMALL_TEST_TIMEOUT);

  it("captures benchmark configuration independently of later caller-side mutation", async () => {
    const fixture = await makeConstructorFixture();
    const mutableConfig = { historicalReferenceBytes: fixture.config.historicalReferenceBytes };
    const ledger = constructLedger(fixture, { config: mutableConfig });
    expectNoConstructorMutation(fixture);
    expect(mutableConfig).toEqual(fixture.config);
    expect(Object.isFrozen(mutableConfig)).toBe(false);
    mutableConfig.historicalReferenceBytes = "tampered-after-construction";
    ledger.acquireLock({ ...fixture.owner });
    expect(fixture.backing.trace).toContain("writeLockExclusive");
  }, SMALL_TEST_TIMEOUT);

  it("captures the initial owner independently of later caller-side mutation", async () => {
    const fixture = await makeConstructorFixture();
    const mutableOwner = { ...fixture.owner };
    const ledger = constructLedger(fixture, { owner: mutableOwner });
    expectNoConstructorMutation(fixture);
    expect(mutableOwner).toEqual(fixture.owner);
    expect(Object.isFrozen(mutableOwner)).toBe(false);
    mutableOwner.hostname = "tampered-after-construction";
    ledger.acquireLock({ ...fixture.owner });
    expect(fixture.backing.trace).toContain("writeLockExclusive");
  }, SMALL_TEST_TIMEOUT);
});

// Trusted software fixture ONLY. Older runtime mode creates a genuine
// unfinished prefix; every guard below targets a distinct NEW benchmark-mode
// ledger and fresh owned buffers. No native publication or SDK attestation.
interface RuntimeGuardTemplate {
  readonly data: Awaited<ReturnType<typeof makeRuntimeEvidenceData>>;
  readonly eventBytes: string;
  readonly journalBytes: string;
  readonly clock: number;
}

// Full 158-outcome construction/replay, not a small constructor boundary.
const FULL_HISTORY_TEST_TIMEOUT = 600000;

let runtimePrefix: RuntimeEvidenceCoreFixture | undefined;
let runtimeData: RuntimeGuardTemplate["data"] | undefined;
let runtimeTemplate: RuntimeGuardTemplate | undefined;

afterAll(() => {
  runtimePrefix?.cleanup();
  runtimePrefix = undefined;
  runtimeData = undefined;
  runtimeTemplate = undefined;
});

function requireRuntimePrefix(): RuntimeEvidenceCoreFixture {
  if (runtimePrefix === undefined) throw new Error("runtime guard prefix foundation is missing");
  return runtimePrefix;
}

async function openRuntimeGuardFixture() {
  const template = runtimeTemplate;
  if (template === undefined) throw new Error("released runtime guard template is missing");
  const backing = makeRuntimeEvidenceCoreBacking();
  const events: unknown = JSON.parse(template.eventBytes);
  const journals: unknown = JSON.parse(template.journalBytes);
  if (!Array.isArray(events) || !Array.isArray(journals)) throw new Error("guard template must contain arrays");
  backing.events.push(...events);
  backing.journals.push(...journals as JournalEntry[]);
  backing.clock = template.clock;
  const { data } = template;
  const owner = { ...data.header.owner };
  const identity = { ...data.header.identity };
  const reconstructor = await prepareCalibrationStageReportReconstructor(data.context);
  let lastResult: CalibrationReportPublicationResult | undefined;
  const readHealthyGitState = () => ({
    headCommit: "a".repeat(40), functionsTreeId: identity.functionsTreeId, dirtyPaths: [] as string[],
  });
  const ledger = createBenchmarkAuthorityCalibrationLedger(
    backing.deps,
    identity,
    (profile) => deriveCanonicalAllowedKeys(data.context.files, profile),
    { getReportOutcomePlan: (profile) => profile === undefined ? data.plans.initial : data.plans[profile] },
    {
      verifyStageReportArtifacts: (params) => {
        backing.trace.push(`verify:${params.stage}:${params.profile}`);
        backing.faults.onVerify?.();
        const report = reconstructor.reconstruct(params);
        const result: CalibrationReportPublicationResult = {
          report,
          receipt: {
            stage: params.stage, profile: params.profile, runId: report.runId,
            jsonSha256: createHash("sha256").update(renderNutritionEvalJson(report), "utf8").digest("hex"),
            markdownSha256: createHash("sha256").update(renderNutritionEvalMarkdown(report), "utf8").digest("hex"),
          },
        };
        lastResult = result;
        return backing.faults.onVerified === undefined ? result : backing.faults.onVerified(result);
      },
    },
    {
      initialOwner: owner,
      plans: data.plans,
      readCurrentGitState: () => {
        backing.gitReads += 1;
        backing.trace.push("readCurrentGitState");
        return backing.faults.onReadGitState === undefined
          ? readHealthyGitState() : backing.faults.onReadGitState();
      },
    },
    { historicalReferenceBytes: data.context.files["historical-reference"] },
  );
  ledger.acquireLock({ ...owner });
  return { ledger, backing, owner, readHealthyGitState, getLastResult: () => lastResult };
}

const HEALTHY_BENCHMARK_SUMMARY = {
  stage: "benchmark" as const, passed: true,
  completedStages: ["preflight", "development", "validation"] as const,
};

type RuntimeGuardFixture = Awaited<ReturnType<typeof openRuntimeGuardFixture>>;
type ReflectionTrap = "getPrototypeOf" | "ownKeys" | "getOwnPropertyDescriptor";
const RUNTIME_REFLECTION_TRAPS: readonly ReflectionTrap[] = [
  "getPrototypeOf", "ownKeys", "getOwnPropertyDescriptor",
];

function reflectWithHook<T extends object>(target: T, trap: ReflectionTrap, hook: () => void): T {
  return new Proxy(target, {
    getPrototypeOf(value) {
      if (trap === "getPrototypeOf") hook();
      return Reflect.getPrototypeOf(value);
    },
    ownKeys(value) {
      if (trap === "ownKeys") hook();
      return Reflect.ownKeys(value);
    },
    getOwnPropertyDescriptor(value, key) {
      if (trap === "getOwnPropertyDescriptor") hook();
      return Reflect.getOwnPropertyDescriptor(value, key);
    },
  });
}

function runtimeOwnedState(f: RuntimeGuardFixture) {
  return {
    eventCount: f.backing.events.length,
    eventBytes: JSON.stringify(f.backing.events),
    journalBytes: JSON.stringify(f.backing.journals),
    lockBytes: JSON.stringify(f.backing.lock),
    traceStart: f.backing.trace.length,
  };
}

function expectRuntimeStateUnchanged(f: RuntimeGuardFixture, before: ReturnType<typeof runtimeOwnedState>): void {
  // Check the next forbidden append as a primitive before any rich formatting.
  expect(f.backing.events.length).toBe(before.eventCount);
  expect(JSON.stringify(f.backing.events)).toBe(before.eventBytes);
  expect(JSON.stringify(f.backing.journals)).toBe(before.journalBytes);
  expect(JSON.stringify(f.backing.lock)).toBe(before.lockBytes);
  expect(f.backing.trace.slice(before.traceStart).filter((call) => CONSTRUCTOR_MUTATING_PORTS.includes(call)))
    .toEqual([]);
}

function expectRuntimeAbort(
  f: RuntimeGuardFixture,
  before: ReturnType<typeof runtimeOwnedState>,
  action: () => void,
  foreignHandles: readonly unknown[] | (() => readonly unknown[]) = [],
  counts?: TrapCounts,
): void {
  let threw = false;
  let caught: unknown;
  try { action(); } catch (error) { threw = true; caught = error; }
  expect(threw).toBe(true);
  const handles = typeof foreignHandles === "function" ? foreignHandles() : foreignHandles;
  for (const handle of [f, f.ledger, f.backing, f.backing.deps, f.owner, ...handles]) {
    expect(caught !== handle).toBe(true);
  }
  if (counts !== undefined) expectCleanForeignRejection(counts);
  expect(caught instanceof CalibrationFatalError).toBe(true);
  expect((caught as CalibrationFatalError).message).toBe("calibration:benchmark-authority-failed");
  expect(Object.hasOwn(caught as object, "cause")).toBe(false);
  expectRuntimeStateUnchanged(f, before);
}

function expectPermanentRuntimePoison(f: RuntimeGuardFixture, before: ReturnType<typeof runtimeOwnedState>): void {
  delete f.backing.faults.onReadGitState;
  delete f.backing.faults.onVerify;
  delete f.backing.faults.onVerified;
  const traceLength = f.backing.trace.length;
  const gitReads = f.backing.gitReads;
  expectRuntimeAbort(f, before, () => f.ledger.completeStage("benchmark", HEALTHY_BENCHMARK_SUMMARY));
  expect(f.backing.trace.length).toBe(traceLength);
  expect(f.backing.gitReads).toBe(gitReads);
}

function swallowedRuntimeReentry(f: RuntimeGuardFixture) {
  const witness: { hits: number; caught: unknown } = { hits: 0, caught: undefined };
  return {
    witness,
    hook: () => {
      witness.hits += 1;
      try { f.ledger.getCounts(); } catch (error) { witness.caught = error; }
    },
  };
}

function expectSwallowedRuntimeReentry(witness: { hits: number; caught: unknown }): void {
  expect(witness.hits).toBe(1);
  expect(witness.caught instanceof CalibrationFatalError).toBe(true);
  expect((witness.caught as CalibrationFatalError).message).toBe("calibration:reentrant-call");
  expect(Object.hasOwn(witness.caught as object, "cause")).toBe(false);
}

// Only traverses known public API return data, never an unknown caught value.
function attemptReturnedMutation(value: unknown): number {
  if (value === null || typeof value !== "object") return 0;
  let attempts = 0;
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) continue;
    attempts += attemptReturnedMutation(descriptor.value);
    if (descriptor.value === null || typeof descriptor.value !== "object") {
      attempts += 1;
      Reflect.set(value, key, "caller-mutated-return");
    }
  }
  if (Array.isArray(value)) { attempts += 1; Reflect.set(value, "length", 0); }
  return attempts;
}

describe.sequential("benchmark authority runtime boundaries", () => {
  it("qualifies a real older-runtime preflight software prefix", async () => {
    runtimeData = await makeRuntimeEvidenceData();
    runtimePrefix = await makeRuntimeEvidenceCoreFixture();
    expect(runtimePrefix.identity).toEqual(runtimeData.header.identity);
    expect(runtimePrefix.owner).toEqual(runtimeData.header.owner);
    expect(runtimePrefix.plans).toEqual(runtimeData.plans);
    runtimePrefix.finishPreflight();
    expect(runtimePrefix.ledger.getCompletedStages()).toEqual(["preflight"]);
  }, FULL_HISTORY_TEST_TIMEOUT);

  it("qualifies the real development prefix and measured MEDIUM tie selection", () => {
    const prefix = requireRuntimePrefix();
    prefix.finishDevelopment();
    expect(prefix.ledger.getSelectedProfile()).toBe("MEDIUM");
    expect(prefix.ledger.getCompletedStages()).toEqual(["preflight", "development"]);
  }, FULL_HISTORY_TEST_TIMEOUT);

  it("qualifies the real validation software prefix", () => {
    const prefix = requireRuntimePrefix();
    prefix.finishValidation();
    expect(prefix.ledger.getCompletedStages()).toEqual(["preflight", "development", "validation"]);
  }, FULL_HISTORY_TEST_TIMEOUT);

  it("releases a genuine unfinished benchmark prefix with 158 finishes and six bindings", () => {
    const prefix = requireRuntimePrefix();
    const data = runtimeData;
    if (data === undefined) throw new Error("runtime guard data foundation is missing");
    for (const row of prefix.plans.MEDIUM.filter((item) => item.key.stage === "benchmark")) {
      prefix.completeOutcomeKey(row.key);
    }
    prefix.ledger.admitStageReportReceipt("benchmark", "MEDIUM");
    prefix.ledger.bindRuntimeStageReport("benchmark", "MEDIUM");
    const snapshot = prefix.ledger.getRuntimeEvidenceSnapshot();
    const finished = snapshot.events.filter((event) => event.type === "runtime_attempt_finished");
    expect(finished).toHaveLength(158);
    expect(finished.filter((event) => event.terminal.kind === "image")).toHaveLength(146);
    expect(finished.filter((event) => event.terminal.kind === "non_reservation")).toHaveLength(12);
    expect(snapshot.events.filter((event) => event.type === "runtime_report_bound")
      .map((event) => `${event.stage}|${event.profile}`)).toEqual([
      "preflight|LOW", "preflight|MEDIUM", "development|LOW", "development|MEDIUM",
      "validation|MEDIUM", "benchmark|MEDIUM",
    ]);
    expect(prefix.ledger.getCompletedStages()).toEqual(["preflight", "development", "validation"]);
    prefix.ledger.releaseLock({ ...prefix.owner });
    expect(prefix.backing.lock).toBeUndefined();
    runtimeTemplate = {
      data, eventBytes: JSON.stringify(prefix.events), journalBytes: JSON.stringify(prefix.journals),
      clock: prefix.backing.clock,
    };
    prefix.cleanup();
    runtimePrefix = undefined;
  }, FULL_HISTORY_TEST_TIMEOUT);

  it("a fresh new-factory core completes the healthy benchmark by one event without rewriting its prefix", async () => {
    const f = await openRuntimeGuardFixture();
    const eventBytes = JSON.stringify(f.backing.events);
    const journalBytes = JSON.stringify(f.backing.journals);
    const eventCount = f.backing.events.length;
    const traceStart = f.backing.trace.length;
    f.ledger.completeStage("benchmark", HEALTHY_BENCHMARK_SUMMARY);
    expect(f.backing.events).toHaveLength(eventCount + 1);
    expect(JSON.stringify(f.backing.events.slice(0, eventCount))).toBe(eventBytes);
    expect(f.backing.events.at(-1)).toMatchObject({ type: "stage_completed", stage: "benchmark", passed: true });
    expect(f.ledger.getCompletedStages()).toEqual(["preflight", "development", "validation", "benchmark"]);
    expect(JSON.stringify(f.backing.journals)).toBe(journalBytes);
    expect(f.backing.lock).toEqual(f.owner);
    expect(f.backing.trace.slice(traceStart).filter((call) => CONSTRUCTOR_MUTATING_PORTS.includes(call)))
      .toEqual(["appendLedgerEvent", "fsyncLedgerFile", "fsyncLedgerDir"]);
  }, FULL_HISTORY_TEST_TIMEOUT);

  it.each(["Git reader", "report verifier"] as const)(
    "%s swallowing same-instance reentry and returning valid data aborts before mutation and poisons permanently",
    async (boundary) => {
      const f = await openRuntimeGuardFixture();
      const before = runtimeOwnedState(f);
      const reentry = swallowedRuntimeReentry(f);
      if (boundary === "Git reader") {
        f.backing.faults.onReadGitState = () => { reentry.hook(); return f.readHealthyGitState(); };
      } else {
        f.backing.faults.onVerify = reentry.hook;
      }
      expectRuntimeAbort(f, before, () => f.ledger.completeStage("benchmark", HEALTHY_BENCHMARK_SUMMARY));
      expectSwallowedRuntimeReentry(reentry.witness);
      if (boundary === "report verifier") expect(f.getLastResult() !== undefined).toBe(true);
      expectPermanentRuntimePoison(f, before);
    }, FULL_HISTORY_TEST_TIMEOUT,
  );

  it.each(RUNTIME_REFLECTION_TRAPS)(
    "valid Git result %s swallowing same-instance reentry blocks the next mutation permanently",
    async (trap) => {
      const f = await openRuntimeGuardFixture();
      const before = runtimeOwnedState(f);
      const reentry = swallowedRuntimeReentry(f);
      const input = reflectWithHook(f.readHealthyGitState(), trap, reentry.hook);
      f.backing.faults.onReadGitState = () => input;
      expectRuntimeAbort(f, before, () => f.ledger.completeStage("benchmark", HEALTHY_BENCHMARK_SUMMARY), [input]);
      expectSwallowedRuntimeReentry(reentry.witness);
      expectPermanentRuntimePoison(f, before);
    }, FULL_HISTORY_TEST_TIMEOUT,
  );

  it.each(RUNTIME_REFLECTION_TRAPS)(
    "valid verifier result %s swallowing same-instance reentry blocks the next mutation permanently",
    async (trap) => {
      const f = await openRuntimeGuardFixture();
      const before = runtimeOwnedState(f);
      const reentry = swallowedRuntimeReentry(f);
      let input: object | undefined;
      f.backing.faults.onVerified = (result) => {
        input = reflectWithHook(result, trap, reentry.hook);
        return input as CalibrationReportPublicationResult;
      };
      expectRuntimeAbort(f, before, () => f.ledger.completeStage("benchmark", HEALTHY_BENCHMARK_SUMMARY), () => [input]);
      expect(input !== undefined).toBe(true);
      expectSwallowedRuntimeReentry(reentry.witness);
      expectPermanentRuntimePoison(f, before);
    }, FULL_HISTORY_TEST_TIMEOUT,
  );

  it.each(RUNTIME_REFLECTION_TRAPS)(
    "valid gate summary %s swallowing same-instance reentry blocks the next mutation permanently",
    async (trap) => {
      const f = await openRuntimeGuardFixture();
      const before = runtimeOwnedState(f);
      const reentry = swallowedRuntimeReentry(f);
      const input = reflectWithHook({ ...HEALTHY_BENCHMARK_SUMMARY }, trap, reentry.hook);
      expectRuntimeAbort(f, before, () => f.ledger.completeStage("benchmark", input), [input]);
      expectSwallowedRuntimeReentry(reentry.witness);
      expectPermanentRuntimePoison(f, before);
    }, FULL_HISTORY_TEST_TIMEOUT,
  );

  it.each([
    ["Git reader", "counted foreign proxy"], ["Git reader", "revoked foreign proxy"],
    ["Git result descriptor", "counted foreign proxy"], ["Git result descriptor", "revoked foreign proxy"],
    ["report verifier", "counted foreign proxy"], ["report verifier", "revoked foreign proxy"],
    ["verifier result descriptor", "counted foreign proxy"], ["verifier result descriptor", "revoked foreign proxy"],
    ["gate summary descriptor", "counted foreign proxy"], ["gate summary descriptor", "revoked foreign proxy"],
  ] as const)(
    "%s throwing a distinct %s stays private, blocks mutation and permanently poisons",
    async (boundary, kind) => {
      const f = await openRuntimeGuardFixture();
      const before = runtimeOwnedState(f);
      const counted = kind === "counted foreign proxy" ? makeTrapCountingThrow() : undefined;
      const foreign = counted === undefined ? makeRevokedForeignThrow() : counted.error;
      let hits = 0;
      const throwForeign = () => { hits += 1; throw foreign; };
      let input: object | undefined;
      let summary = { ...HEALTHY_BENCHMARK_SUMMARY };
      if (boundary === "Git reader") {
        f.backing.faults.onReadGitState = throwForeign;
      } else if (boundary === "Git result descriptor") {
        input = reflectWithHook(f.readHealthyGitState(), "getOwnPropertyDescriptor", throwForeign);
        f.backing.faults.onReadGitState = () => input as ReturnType<typeof f.readHealthyGitState>;
      } else if (boundary === "report verifier") {
        f.backing.faults.onVerify = throwForeign;
      } else if (boundary === "verifier result descriptor") {
        f.backing.faults.onVerified = (result) => {
          input = reflectWithHook(result, "getOwnPropertyDescriptor", throwForeign);
          return input as CalibrationReportPublicationResult;
        };
      } else {
        summary = reflectWithHook(summary, "getOwnPropertyDescriptor", throwForeign);
        input = summary;
      }
      expectRuntimeAbort(f, before, () => f.ledger.completeStage("benchmark", summary),
        () => [foreign, input, summary], counted?.counts);
      expect(hits).toBe(1);
      expectPermanentRuntimePoison(f, before);
      if (counted !== undefined) expectCleanForeignRejection(counted.counts);
    }, FULL_HISTORY_TEST_TIMEOUT,
  );

  it("captures a real mutable verifier result without freezing or retaining caller report and receipt aliases", async () => {
    const f = await openRuntimeGuardFixture();
    let callerResult: CalibrationReportPublicationResult | undefined;
    f.backing.faults.onVerified = (result) => {
      callerResult = JSON.parse(JSON.stringify(result)) as CalibrationReportPublicationResult;
      return callerResult;
    };
    const admitted = f.ledger.admitStageReportReceipt("benchmark", "MEDIUM");
    const receiptBytes = JSON.stringify(admitted);
    const caller = callerResult;
    if (caller === undefined) throw new Error("real verifier result was not captured");
    expect(Object.isFrozen(caller)).toBe(false);
    expect(Object.isFrozen(caller.report)).toBe(false);
    expect(Object.isFrozen(caller.receipt)).toBe(false);
    const before = runtimeOwnedState(f);
    expect(Reflect.set(caller.report, "runId", "caller-mutated-report")).toBe(true);
    expect(Reflect.set(caller.receipt, "jsonSha256", "0".repeat(64))).toBe(true);
    expect(JSON.stringify(admitted)).toBe(receiptBytes);
    delete f.backing.faults.onVerified;
    expect(JSON.stringify(f.ledger.admitStageReportReceipt("benchmark", "MEDIUM"))).toBe(receiptBytes);
    expectRuntimeStateUnchanged(f, before);
    f.ledger.completeStage("benchmark", HEALTHY_BENCHMARK_SUMMARY);
    expect(f.backing.events.length).toBe(before.eventCount + 1);
    expect(JSON.stringify(f.backing.events.slice(0, before.eventCount))).toBe(before.eventBytes);
    expect(f.ledger.getCompletedStages()).toEqual(["preflight", "development", "validation", "benchmark"]);
  }, FULL_HISTORY_TEST_TIMEOUT);

  it.each(["runtime snapshot", "stage report", "completed predictions", "receipt", "runtime binding"] as const)(
    "mutating returned %s cannot alter owned history or later healthy benchmark completion",
    async (boundary) => {
      const f = await openRuntimeGuardFixture();
      const read = () => {
        switch (boundary) {
          case "runtime snapshot": return f.ledger.getRuntimeEvidenceSnapshot();
          case "stage report": return f.ledger.getStageReportSnapshot("benchmark", "MEDIUM");
          case "completed predictions": return f.ledger.getCompletedReportPredictions();
          case "receipt": return f.ledger.admitStageReportReceipt("benchmark", "MEDIUM");
          case "runtime binding": return f.ledger.bindRuntimeStageReport("benchmark", "MEDIUM");
        }
      };
      const returned = read();
      const original = JSON.stringify(returned);
      const before = runtimeOwnedState(f);
      expect(attemptReturnedMutation(returned)).toBeGreaterThan(0);
      expect(JSON.stringify(read())).toBe(original);
      expectRuntimeStateUnchanged(f, before);
      f.ledger.completeStage("benchmark", HEALTHY_BENCHMARK_SUMMARY);
      expect(f.backing.events.length).toBe(before.eventCount + 1);
      expect(JSON.stringify(f.backing.events.slice(0, before.eventCount))).toBe(before.eventBytes);
      expect(JSON.stringify(f.backing.journals)).toBe(before.journalBytes);
      expect(f.ledger.getCompletedStages()).toEqual(["preflight", "development", "validation", "benchmark"]);
    }, FULL_HISTORY_TEST_TIMEOUT,
  );
});
