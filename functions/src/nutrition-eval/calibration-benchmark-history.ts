/**
 * Owned calibration benchmark-history assessment (Task 1).
 *
 * Combines the pure historical comparison helpers with the existing
 * measurement bridge into a guarded, fully owned benchmark assessment. This
 * module never reads the filesystem, never imports the CLI/loader, and
 * never classifies, coerces, or retains a foreign thrown value; any
 * capture, measurement, or compatibility failure collapses to one fresh,
 * causeless, static fatal.
 */
import { createHash } from "crypto";

import { CalibrationFatalError } from "./fatal-error";
import {
  compareToHistoricalReference,
  evaluateHistoricalAggregateSubsetGate,
  parseHistoricalReference,
  SUPPORTED_HISTORICAL_DELTA_FIELDS,
} from "./historical-reference-pure";
import type {
  HistoricalAggregateSubsetGate,
  HistoricalComparisonResult,
  HistoricalReference,
} from "./historical-reference-pure";
import { measureCalibrationStageReport } from "./calibration-report-measurements";
import type { CalibrationReportMeasurements } from "./calibration-report-measurements";

const BENCHMARK_HISTORY_INVALID_MESSAGE = "calibration:benchmark-history-invalid";

// Raw committed-byte digest of the single admissible historical reference
// file. This is an independent literal pin, never imported from
// calibration-cli.ts, so this module never pulls the CLI/provider surface
// into its own runtime import graph. It is checked against the actual
// committed file and the existing CLI pin only from tests.
const PINNED_RAW_REFERENCE_SHA256 = "fd712bee2d4229bc8476d1cc25fce1a21172e6013c6abfe8949498cc5ce15acb";

const MAX_REFERENCE_BYTES = 8192;

const CAPTURE_MAX_DEPTH = 32;
const CAPTURE_MAX_NODES = 20000;
const CAPTURE_MAX_ARRAY_ELEMENTS = 256;
const CAPTURE_MAX_STRING_CODE_UNITS = 4096;

const EXPECTED_CALIBRATION_MODEL = "gemini-3.8-flash";
const EXPECTED_CALIBRATION_PROJECT = "calorix-xurschnell";
const EXPECTED_CALIBRATION_LOCATION = "us";

export interface CalibrationBenchmarkHistoricalAssessment {
  readonly measurements: Readonly<CalibrationReportMeasurements>;
  readonly comparison: Readonly<HistoricalComparisonResult>;
  readonly subset: Readonly<HistoricalAggregateSubsetGate>;
  readonly provenance: Readonly<HistoricalReference["provenance"]>;
}

export interface CalibrationBenchmarkHistory {
  assess(report: unknown): Readonly<CalibrationBenchmarkHistoricalAssessment>;
}

function throwBenchmarkHistoryInvalid(): never {
  throw new CalibrationFatalError(BENCHMARK_HISTORY_INVALID_MESSAGE);
}

interface ClosedBenchmarkHistoryParams {
  readonly historicalReferenceBytes: string;
  readonly historicalReferenceHash: string;
}

function readRequiredStringField(source: object, key: string): string {
  const descriptor = Object.getOwnPropertyDescriptor(source, key);
  if (descriptor === undefined || descriptor.enumerable !== true || !("value" in descriptor)) {
    throwBenchmarkHistoryInvalid();
  }
  const value = (descriptor as PropertyDescriptor).value as unknown;
  if (typeof value !== "string") throwBenchmarkHistoryInvalid();
  return value;
}

function captureClosedParams(params: unknown): ClosedBenchmarkHistoryParams {
  if (params === null || typeof params !== "object" || Array.isArray(params)) {
    throwBenchmarkHistoryInvalid();
  }
  const prototype = Object.getPrototypeOf(params);
  if (prototype !== Object.prototype && prototype !== null) throwBenchmarkHistoryInvalid();
  const ownKeys = Reflect.ownKeys(params);
  if (ownKeys.length !== 2) throwBenchmarkHistoryInvalid();
  const keySet = new Set<string | symbol>(ownKeys);
  if (!keySet.has("historicalReferenceBytes") || !keySet.has("historicalReferenceHash")) {
    throwBenchmarkHistoryInvalid();
  }
  return {
    historicalReferenceBytes: readRequiredStringField(params, "historicalReferenceBytes"),
    historicalReferenceHash: readRequiredStringField(params, "historicalReferenceHash"),
  };
}

function resolvePinnedReference(bytes: string, suppliedHash: string): HistoricalReference {
  if (Buffer.byteLength(bytes, "utf8") > MAX_REFERENCE_BYTES) throwBenchmarkHistoryInvalid();
  const rawDigest = createHash("sha256").update(bytes, "utf8").digest("hex");
  if (rawDigest !== PINNED_RAW_REFERENCE_SHA256 || suppliedHash !== PINNED_RAW_REFERENCE_SHA256) {
    throwBenchmarkHistoryInvalid();
  }
  try {
    const parsedRaw = JSON.parse(bytes) as unknown;
    return parseHistoricalReference(parsedRaw);
  } catch {
    throwBenchmarkHistoryInvalid();
  }
}

function isBenchmarkAssociated(measurements: Readonly<CalibrationReportMeasurements>): boolean {
  const calibration = measurements.report.calibration;
  if (calibration === undefined) return false;
  if (calibration.stage !== "benchmark") return false;
  if (calibration.model !== EXPECTED_CALIBRATION_MODEL) return false;
  if (calibration.project !== EXPECTED_CALIBRATION_PROJECT) return false;
  if (calibration.location !== EXPECTED_CALIBRATION_LOCATION) return false;
  return true;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

export function prepareCalibrationBenchmarkHistory(
  params: unknown,
): Readonly<CalibrationBenchmarkHistory> {
  let reference: HistoricalReference;
  try {
    const closedParams = captureClosedParams(params);
    reference = resolvePinnedReference(
      closedParams.historicalReferenceBytes,
      closedParams.historicalReferenceHash,
    );
  } catch {
    throwBenchmarkHistoryInvalid();
  }

  let busy = false;
  let poisoned = false;

  function invalid(): never {
    poisoned = true;
    throw new CalibrationFatalError(BENCHMARK_HISTORY_INVALID_MESSAGE);
  }

  function captureOwnedReport(value: unknown): unknown {
    let nodeCount = 0;
    const active = new Set<object>();
    const capture = (input: unknown, depth: number): unknown => {
      if (poisoned) invalid();
      if (depth > CAPTURE_MAX_DEPTH) invalid();
      nodeCount += 1;
      if (nodeCount > CAPTURE_MAX_NODES) invalid();
      if (input === null) return null;
      if (typeof input === "string") {
        if (input.length > CAPTURE_MAX_STRING_CODE_UNITS) invalid();
        return input;
      }
      if (typeof input === "number") {
        if (!Number.isFinite(input)) invalid();
        return input;
      }
      if (typeof input === "boolean") return input;
      if (typeof input !== "object") invalid();
      const node = input as object;
      const isArrayNode = Array.isArray(node);
      if (poisoned) invalid();
      if (isArrayNode) {
        const arrayPrototype = Object.getPrototypeOf(node);
        if (poisoned) invalid();
        if (arrayPrototype !== Array.prototype) invalid();
        const lengthDescriptor = Reflect.getOwnPropertyDescriptor(node, "length");
        if (poisoned) invalid();
        if (
          lengthDescriptor === undefined ||
          !("value" in lengthDescriptor) ||
          lengthDescriptor.enumerable !== false
        ) {
          invalid();
        }
        const lengthValue = (lengthDescriptor as PropertyDescriptor).value as unknown;
        if (
          typeof lengthValue !== "number" ||
          !Number.isInteger(lengthValue) ||
          lengthValue < 0 ||
          lengthValue > CAPTURE_MAX_ARRAY_ELEMENTS
        ) {
          invalid();
        }
        const arrayLength = lengthValue as number;
        const arrayOwnKeys = Reflect.ownKeys(node);
        if (poisoned) invalid();
        if (arrayOwnKeys.length !== arrayLength + 1) invalid();
        const arrayKeySet = new Set<string | symbol>(arrayOwnKeys);
        if (arrayKeySet.size !== arrayLength + 1 || !arrayKeySet.has("length")) invalid();
        for (let index = 0; index < arrayLength; index += 1) {
          if (!arrayKeySet.has(String(index))) invalid();
        }
        if (active.has(node)) invalid();
        active.add(node);
        const ownedArray: unknown[] = new Array(arrayLength);
        for (let index = 0; index < arrayLength; index += 1) {
          const elementDescriptor = Reflect.getOwnPropertyDescriptor(node, String(index));
          if (poisoned) invalid();
          if (
            elementDescriptor === undefined ||
            elementDescriptor.enumerable !== true ||
            !("value" in elementDescriptor)
          ) {
            invalid();
          }
          const element = (elementDescriptor as PropertyDescriptor).value as unknown;
          if (element === undefined) invalid();
          ownedArray[index] = capture(element, depth + 1);
        }
        active.delete(node);
        return ownedArray;
      }
      const prototype = Object.getPrototypeOf(node);
      if (poisoned) invalid();
      if (prototype !== Object.prototype && prototype !== null) invalid();
      const fieldKeys = Reflect.ownKeys(node);
      if (poisoned) invalid();
      for (const key of fieldKeys) {
        if (typeof key !== "string") invalid();
      }
      if (active.has(node)) invalid();
      active.add(node);
      const ownedObject: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      for (const key of fieldKeys as string[]) {
        const descriptor = Reflect.getOwnPropertyDescriptor(node, key);
        if (poisoned) invalid();
        if (descriptor === undefined || descriptor.enumerable !== true || !("value" in descriptor)) {
          invalid();
        }
        const fieldValue = (descriptor as PropertyDescriptor).value as unknown;
        if (fieldValue === undefined) invalid();
        ownedObject[key] = capture(fieldValue, depth + 1);
      }
      active.delete(node);
      return ownedObject;
    };
    return capture(value, 0);
  }

  return Object.freeze({
    assess(report: unknown): Readonly<CalibrationBenchmarkHistoricalAssessment> {
      if (poisoned) invalid();
      if (busy) invalid();
      busy = true;
      try {
        const owned = captureOwnedReport(report);
        if (poisoned) invalid();
        const measurements = measureCalibrationStageReport(owned);
        if (poisoned) invalid();
        if (!isBenchmarkAssociated(measurements)) invalid();
        const comparison = compareToHistoricalReference(
          reference,
          measurements.report,
          SUPPORTED_HISTORICAL_DELTA_FIELDS,
        );
        if (poisoned) invalid();
        if (
          !comparison.compatible ||
          comparison.deltas === undefined ||
          SUPPORTED_HISTORICAL_DELTA_FIELDS.some(
            (field) => !Number.isFinite(comparison.deltas![field]),
          )
        ) {
          invalid();
        }
        const subset = evaluateHistoricalAggregateSubsetGate(reference, measurements.report);
        if (poisoned) invalid();
        const result: CalibrationBenchmarkHistoricalAssessment = {
          measurements,
          comparison,
          subset,
          provenance: reference.provenance,
        };
        deepFreeze(result);
        if (poisoned) invalid();
        return result;
      } catch {
        invalid();
      } finally {
        busy = false;
      }
    },
  });
}
