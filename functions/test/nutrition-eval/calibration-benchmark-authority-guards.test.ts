/**
 * Calibration benchmark authority guards (Task 3 Step 1, Slices A and B).
 *
 * Slice A: full-gate discriminator unit matrix. Slice B: opt-in benchmark
 * authority constructor boundaries (valid baseline, config/runtime-option
 * negative and hostile-reflection controls with full foreign
 * reflection/coercion counters, caller-alias independence for runtime options and
 * plans, zero mutating-port witness).
 * Runtime stage-completion reentry/privacy/returned-alias cases remain a
 * later bounded pass in this file.
 */
import { describe, expect, it } from "vitest";
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
  makeRuntimeEvidenceData,
} from "./calibration-runtime-evidence-fixtures";
import type {
  RuntimeCanonicalPlans,
  RuntimeEvidenceCoreBacking,
} from "./calibration-runtime-evidence-fixtures";

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
