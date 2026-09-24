import { readFile } from 'fs/promises';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import { NutritionEvalReportSchema, type NutritionEvalReport } from '../../src/nutrition-eval/schema';
import {
  HISTORICAL_AGGREGATE_SUBSET_GATE_THRESHOLDS,
  HISTORICAL_COMPATIBILITY_REASON_ORDER,
  HistoricalReferenceError,
  HistoricalReferenceSchema,
  SUPPORTED_HISTORICAL_DELTA_FIELDS,
  compareToHistoricalReference,
  defaultLoadHistoricalReference,
  evaluateHistoricalAggregateSubsetGate,
  hashHistoricalReference,
  loadHistoricalReference,
  parseHistoricalReference,
  resolveHistoricalReferenceRuntimePaths,
} from '../../src/nutrition-eval/historical-reference';

const REFERENCE_RUN_ID = 'run-2026-09-11T20-22-21-450Z';
const REFERENCE_CODE_SHA = 'bb414d1850fb9f91cc419b4a270138354abf5535';
const REFERENCE_DATASET_ID = 'calorix-public-v1';
const REFERENCE_DATASET_HASH = '2dc17d06752c2981862690953a7b134235bb6a20da4dc9b5fef5528f91f5bb56';
const REFERENCE_PROMPT_HASH = '205b635a252e1f378023f5e1f3c670a6fba0ecfdfc8ce4f08f30efa24c544263';
const REFERENCE_MODEL = 'gemini-2.5-flash';
const SLICE_G_COMMIT = 'd9492b60d06296b54f51d951b0d5fb4ae8c89ed8';
const REFERENCE_CAVEAT = 'one transient supplied-barcode catalog miss fell through to a catastrophic vision estimate, so the aggregate is valid historical evidence but not a like-for-like barcode-routing implementation baseline.';

const jsonPath = join(__dirname, '..', '..', 'eval', 'nutrition', 'historical-reference-v1.json');

async function readReferenceJson(): Promise<Record<string, unknown>> {
  const raw = JSON.parse(await readFile(jsonPath, 'utf8'));
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('historical reference fixture must be an object');
  }
  return raw as Record<string, unknown>;
}

function validReference(): Record<string, unknown> {
  return {
    version: 1,
    runId: REFERENCE_RUN_ID,
    codeSha: REFERENCE_CODE_SHA,
    datasetId: REFERENCE_DATASET_ID,
    datasetHash: REFERENCE_DATASET_HASH,
    promptHash: REFERENCE_PROMPT_HASH,
    model: REFERENCE_MODEL,
    publicCases: 20,
    privateCases: 0,
    samples: 3,
    coverage: {
      totalCases: 60,
      runCases: 60,
      parseCases: 60,
      failureCount: 0,
      unsafeCompletionCount: 0,
      reviewCount: 52,
      catastrophicCount: 15,
    },
    metrics: {
      medianRelativeCalorieError: 0.2719,
      p90RelativeCalorieError: 1.0136,
      meanMacroRelativeError: 0.5227,
      meanMealMassRelativeError: 0.4695,
      meanMealCarbDensityRelativeError: 0.7780,
      meanMealFatDensityRelativeError: 0.3786,
    },
    provenance: {
      rounding: 'four_decimal_places',
      predatesSliceG: true,
      sliceGCommit: SLICE_G_COMMIT,
      caveat: REFERENCE_CAVEAT,
    },
  };
}

function buildCurrentReport(
  reportOverrides: Record<string, unknown> = {},
  summaryOverrides: Record<string, unknown> = {},
): NutritionEvalReport {
  const cases = Array.from({ length: 60 }, (_, index) => ({
    caseId: `hist-case-${index}`,
    prediction: { parseStatus: 'success' as const, source: 'meal' as const },
    numeric: {},
    safety: { catastrophicCalorieMiss: false, unsafeCompletion: false },
    booleans: {},
  }));
  return NutritionEvalReportSchema.parse({
    version: 1,
    runId: 'run-current-test-0001',
    timestamp: '2026-09-24T00:00:00.000Z',
    datasetId: REFERENCE_DATASET_ID,
    datasetHash: REFERENCE_DATASET_HASH,
    adapterModelId: 'gemini-3.8-flash',
    promptHash: REFERENCE_PROMPT_HASH,
    codeSha: 'c'.repeat(40),
    samples: 3,
    baselineOnly: false,
    publicCases: 20,
    privateCases: 0,
    summary: {
      totalCases: 60,
      runCases: 60,
      parseCases: 60,
      basisAccuracyDenom: 0,
      barcodeAccuracyDenom: 0,
      medianAbsoluteCalorieError: 10,
      medianRelativeCalorieError: 0.2,
      p90AbsoluteCalorieError: 20,
      p90RelativeCalorieError: 0.8,
      meanMacroRelativeError: 0.4,
      reviewRate: 0.1,
      catastrophicCount: 5,
      unsafeCompletionCount: 0,
      failuresByCategory: {},
      failuresByCode: {},
      meanMealMassRelativeError: 0.3,
      meanMealCarbDensityRelativeError: 0.5,
      meanMealFatDensityRelativeError: 0.2,
      ...summaryOverrides,
    },
    cases,
    ...reportOverrides,
  });
}

describe('historical reference schema', () => {
  it('parses the exact committed reference file', async () => {
    const raw = await readReferenceJson();
    const reference = parseHistoricalReference(raw);
    expect(reference.runId).toBe(REFERENCE_RUN_ID);
    expect(reference.codeSha).toBe(REFERENCE_CODE_SHA);
    expect(reference.datasetId).toBe(REFERENCE_DATASET_ID);
    expect(reference.datasetHash).toBe(REFERENCE_DATASET_HASH);
    expect(reference.promptHash).toBe(REFERENCE_PROMPT_HASH);
    expect(reference.model).toBe(REFERENCE_MODEL);
    expect(reference.publicCases).toBe(20);
    expect(reference.privateCases).toBe(0);
    expect(reference.samples).toBe(3);
    expect(reference.coverage).toEqual({
      totalCases: 60,
      runCases: 60,
      parseCases: 60,
      failureCount: 0,
      unsafeCompletionCount: 0,
      reviewCount: 52,
      catastrophicCount: 15,
    });
    expect(reference.metrics).toEqual({
      medianRelativeCalorieError: 0.2719,
      p90RelativeCalorieError: 1.0136,
      meanMacroRelativeError: 0.5227,
      meanMealMassRelativeError: 0.4695,
      meanMealCarbDensityRelativeError: 0.7780,
      meanMealFatDensityRelativeError: 0.3786,
    });
    expect(reference.provenance).toEqual({
      rounding: 'four_decimal_places',
      predatesSliceG: true,
      sliceGCommit: SLICE_G_COMMIT,
      caveat: REFERENCE_CAVEAT,
    });
  });

  it('loads the reference through the default runtime path resolver', async () => {
    const paths = resolveHistoricalReferenceRuntimePaths(join(__dirname, '..', '..', 'lib', 'nutrition-eval'));
    const reference = await loadHistoricalReference(paths);
    expect(reference.runId).toBe(REFERENCE_RUN_ID);
    const raw = await defaultLoadHistoricalReference(paths);
    expect(parseHistoricalReference(raw).runId).toBe(REFERENCE_RUN_ID);
  });

  it('accepts the canonical hand-built reference object', () => {
    expect(() => HistoricalReferenceSchema.parse(validReference())).not.toThrow();
  });

  it('rejects an unknown root key', () => {
    expect(() => HistoricalReferenceSchema.parse({ ...validReference(), extra: 'nope' })).toThrow();
  });

  it('rejects a case array on the reference', () => {
    expect(() => HistoricalReferenceSchema.parse({ ...validReference(), cases: [] })).toThrow();
  });

  it('rejects an unknown key inside metrics', () => {
    const reference = validReference();
    (reference.metrics as Record<string, unknown>).medianProteinRelativeError = 0.1;
    expect(() => HistoricalReferenceSchema.parse(reference)).toThrow();
  });

  it('rejects invented zero-safe per-macro metrics', () => {
    const reference = validReference();
    (reference.metrics as Record<string, unknown>).proteinZeroTruthMeanAbsoluteError = 0.1;
    expect(() => HistoricalReferenceSchema.parse(reference)).toThrow();
  });

  it('rejects an unknown key inside coverage', () => {
    const reference = validReference();
    (reference.coverage as Record<string, unknown>).sampleIndex = 1;
    expect(() => HistoricalReferenceSchema.parse(reference)).toThrow();
  });

  it('rejects an unknown key inside provenance', () => {
    const reference = validReference();
    (reference.provenance as Record<string, unknown>).note = 'extra';
    expect(() => HistoricalReferenceSchema.parse(reference)).toThrow();
  });

  it('rejects a missing provenance block', () => {
    const reference = validReference();
    delete reference.provenance;
    expect(() => HistoricalReferenceSchema.parse(reference)).toThrow();
  });

  it('rejects a missing rounding label', () => {
    const reference = validReference();
    delete (reference.provenance as Record<string, unknown>).rounding;
    expect(() => HistoricalReferenceSchema.parse(reference)).toThrow();
  });

  it('rejects a wrong rounding label', () => {
    const reference = validReference();
    (reference.provenance as Record<string, unknown>).rounding = 'two_decimal_places';
    expect(() => HistoricalReferenceSchema.parse(reference)).toThrow();
  });

  it('rejects a missing Slice-G caveat', () => {
    const reference = validReference();
    delete (reference.provenance as Record<string, unknown>).caveat;
    expect(() => HistoricalReferenceSchema.parse(reference)).toThrow();
  });

  it('rejects a caveat that does not match the exact recorded text', () => {
    const reference = validReference();
    (reference.provenance as Record<string, unknown>).caveat = 'a different caveat';
    expect(() => HistoricalReferenceSchema.parse(reference)).toThrow();
  });

  it('rejects a mismatched Slice-G commit', () => {
    const reference = validReference();
    (reference.provenance as Record<string, unknown>).sliceGCommit = 'a'.repeat(40);
    expect(() => HistoricalReferenceSchema.parse(reference)).toThrow();
  });

  it('rejects percentage-form values instead of ratio units', () => {
    const reference = validReference();
    (reference.metrics as Record<string, unknown>).medianRelativeCalorieError = 27.19;
    expect(() => HistoricalReferenceSchema.parse(reference)).toThrow();
  });

  it('rejects a metric rounded to more than four decimal places', () => {
    const reference = validReference();
    (reference.metrics as Record<string, unknown>).medianRelativeCalorieError = 0.27191234;
    expect(() => HistoricalReferenceSchema.parse(reference)).toThrow();
  });

  it('rejects a tampered but still-valid-shaped four-decimal ratio (frozen values are exact literals)', () => {
    const reference = validReference();
    (reference.metrics as Record<string, unknown>).medianRelativeCalorieError = 0.2720;
    expect(() => HistoricalReferenceSchema.parse(reference)).toThrow();
  });
});

describe('historical reference hashing fails closed on tampered metrics', () => {
  it('rejects hashing a metrics-tampered object even though it is still a valid four-decimal ratio', () => {
    const tampered = { ...validReference(), metrics: { ...validReference().metrics, medianRelativeCalorieError: 0.2720 } };
    expect(() => hashHistoricalReference(tampered)).toThrow();
  });
});

describe('historical reference hashing', () => {
  it('is deterministic for the exact same parsed object', async () => {
    const raw = await readReferenceJson();
    expect(hashHistoricalReference(raw)).toBe(hashHistoricalReference(raw));
    expect(hashHistoricalReference(raw)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable across key reordering in the raw input', () => {
    const reference = validReference();
    const manuallyReordered = {
      samples: reference.samples,
      version: reference.version,
      provenance: reference.provenance,
      runId: reference.runId,
      metrics: reference.metrics,
      codeSha: reference.codeSha,
      coverage: reference.coverage,
      datasetId: reference.datasetId,
      model: reference.model,
      datasetHash: reference.datasetHash,
      promptHash: reference.promptHash,
      publicCases: reference.publicCases,
      privateCases: reference.privateCases,
    };
    expect(hashHistoricalReference(reference)).toBe(hashHistoricalReference(manuallyReordered));
  });

  it('fails closed on a malformed reference instead of hashing partial data', () => {
    expect(() => hashHistoricalReference({ ...validReference(), extra: true })).toThrow();
  });
});

describe('historical comparison compatibility', () => {
  it('reports full compatibility and complete deltas for a matching current report', () => {
    const reference = HistoricalReferenceSchema.parse(validReference());
    const current = buildCurrentReport();
    const comparison = compareToHistoricalReference(reference, current);
    expect(comparison.compatible).toBe(true);
    expect(comparison.compatibilityReasons).toEqual([]);
    expect(comparison.compatibilityReason).toBeUndefined();
    expect(comparison.deltas).toEqual({
      catastrophicCount: 5 - 15,
      medianRelativeCalorieError: 0.2 - 0.2719,
      p90RelativeCalorieError: 0.8 - 1.0136,
      meanMacroRelativeError: 0.4 - 0.5227,
      meanMealMassRelativeError: 0.3 - 0.4695,
      meanMealCarbDensityRelativeError: 0.5 - 0.7780,
      meanMealFatDensityRelativeError: 0.2 - 0.3786,
    });
  });

  it('flags dataset hash mismatch and omits deltas', () => {
    const reference = HistoricalReferenceSchema.parse(validReference());
    const current = buildCurrentReport({ datasetHash: '9'.repeat(64) });
    const comparison = compareToHistoricalReference(reference, current);
    expect(comparison.compatible).toBe(false);
    expect(comparison.compatibilityReasons).toContain('dataset_hash_mismatch');
    expect(comparison.compatibilityReason).toBe('dataset_hash_mismatch');
    expect(comparison.deltas).toBeUndefined();
  });

  it('flags an adapter model that is not exactly gemini-3.8-flash', () => {
    const reference = HistoricalReferenceSchema.parse(validReference());
    const current = buildCurrentReport({ adapterModelId: 'gemini-2.5-flash' });
    const comparison = compareToHistoricalReference(reference, current);
    expect(comparison.compatible).toBe(false);
    expect(comparison.compatibilityReasons).toContain('adapter_model_mismatch');
  });

  it('does not treat the expected 3.8-vs-2.5 model difference itself as a hard failure beyond the adapter check', () => {
    const reference = HistoricalReferenceSchema.parse(validReference());
    const current = buildCurrentReport({ adapterModelId: 'gemini-3.8-flash' });
    const comparison = compareToHistoricalReference(reference, current);
    expect(comparison.compatible).toBe(true);
  });

  it('flags samples mismatch', () => {
    const reference = HistoricalReferenceSchema.parse(validReference());
    const current = buildCurrentReport({ samples: 1, publicCases: 60, privateCases: 0 }, {});
    const comparison = compareToHistoricalReference(reference, current);
    expect(comparison.compatible).toBe(false);
    expect(comparison.compatibilityReasons).toContain('samples_mismatch');
  });

  it('flags public/private coverage mismatch', () => {
    const reference = HistoricalReferenceSchema.parse(validReference());
    const current = buildCurrentReport({ publicCases: 18, privateCases: 2 });
    const comparison = compareToHistoricalReference(reference, current);
    expect(comparison.compatible).toBe(false);
    expect(comparison.compatibilityReasons).toContain('public_cases_mismatch');
    expect(comparison.compatibilityReasons).toContain('private_cases_mismatch');
  });

  it('reports every mismatch reason in canonical order', () => {
    const reference = HistoricalReferenceSchema.parse(validReference());
    const current = buildCurrentReport({
      datasetId: 'other-dataset',
      datasetHash: '9'.repeat(64),
      promptHash: '8'.repeat(64),
      adapterModelId: 'gemini-2.5-flash',
    });
    const comparison = compareToHistoricalReference(reference, current);
    expect(comparison.compatible).toBe(false);
    const indexes = comparison.compatibilityReasons.map((reason) => HISTORICAL_COMPATIBILITY_REASON_ORDER.indexOf(reason));
    for (let index = 1; index < indexes.length; index++) {
      expect(indexes[index]!).toBeGreaterThan(indexes[index - 1]!);
    }
    expect(comparison.compatibilityReason).toBe(comparison.compatibilityReasons[0]);
  });

  it('never fabricates a delta for a field the reference does not carry', () => {
    const reference = HistoricalReferenceSchema.parse(validReference());
    const current = buildCurrentReport();
    const comparison = compareToHistoricalReference(reference, current);
    expect(Object.keys(comparison.deltas ?? {}).sort()).toEqual([...SUPPORTED_HISTORICAL_DELTA_FIELDS].sort());
  });

  it('supports requesting a strict subset of the seven allowed delta fields', () => {
    const reference = HistoricalReferenceSchema.parse(validReference());
    const current = buildCurrentReport();
    const comparison = compareToHistoricalReference(reference, current, ['catastrophicCount', 'medianRelativeCalorieError']);
    expect(Object.keys(comparison.deltas ?? {}).sort()).toEqual(['catastrophicCount', 'medianRelativeCalorieError']);
  });

  it('throws a stable typed error for an unsupported requested delta field', () => {
    const reference = HistoricalReferenceSchema.parse(validReference());
    const current = buildCurrentReport();
    let caught: unknown;
    try {
      compareToHistoricalReference(reference, current, ['reviewRate' as unknown as typeof SUPPORTED_HISTORICAL_DELTA_FIELDS[number]]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(HistoricalReferenceError);
    expect((caught as HistoricalReferenceError).code).toBe('unsupported_delta_field');
  });

  it('throws for an unsupported field even when the reports are otherwise incompatible', () => {
    const reference = HistoricalReferenceSchema.parse(validReference());
    const current = buildCurrentReport({ datasetHash: '9'.repeat(64) });
    expect(() => compareToHistoricalReference(
      reference,
      current,
      ['not_a_real_field' as unknown as typeof SUPPORTED_HISTORICAL_DELTA_FIELDS[number]],
    )).toThrow(HistoricalReferenceError);
  });

  it('throws a stable current_metric_unavailable error instead of silently omitting an undefined current metric on a compatible report', () => {
    const reference = HistoricalReferenceSchema.parse(validReference());
    const current = buildCurrentReport({}, { meanMealMassRelativeError: undefined });
    let caught: unknown;
    try {
      compareToHistoricalReference(reference, current);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(HistoricalReferenceError);
    expect((caught as HistoricalReferenceError).code).toBe('current_metric_unavailable');
    expect((caught as HistoricalReferenceError).message).toContain('meanMealMassRelativeError');
  });

  it('still returns reasons and no deltas for an incompatible report, without throwing for unavailable current metrics', () => {
    const reference = HistoricalReferenceSchema.parse(validReference());
    const current = buildCurrentReport({ datasetHash: '9'.repeat(64) }, { meanMealMassRelativeError: undefined });
    const comparison = compareToHistoricalReference(reference, current);
    expect(comparison.compatible).toBe(false);
    expect(comparison.compatibilityReasons).toContain('dataset_hash_mismatch');
    expect(comparison.deltas).toBeUndefined();
  });
});

describe('historical aggregate subset gate', () => {
  it('is explicitly labeled as a subset gate, not a full promotion decision', () => {
    const reference = HistoricalReferenceSchema.parse(validReference());
    const current = buildCurrentReport();
    const gate = evaluateHistoricalAggregateSubsetGate(reference, current);
    expect(gate.kind).toBe('historical_aggregate_subset_gate');
  });

  it('passes when every metric is within the fixed thresholds', () => {
    const reference = HistoricalReferenceSchema.parse(validReference());
    const current = buildCurrentReport();
    const gate = evaluateHistoricalAggregateSubsetGate(reference, current);
    expect(gate.passed).toBe(true);
    expect(gate.compatible).toBe(true);
    expect(gate.failures).toEqual([]);
  });

  it('matches the exact fixed thresholds from the plan', () => {
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

  it('fails and lists the exceeded metric when catastrophic count exceeds the threshold', () => {
    const reference = HistoricalReferenceSchema.parse(validReference());
    const current = buildCurrentReport({}, { catastrophicCount: 13 });
    const gate = evaluateHistoricalAggregateSubsetGate(reference, current);
    expect(gate.passed).toBe(false);
    expect(gate.failures).toContain('catastrophicCount_exceeds_threshold');
  });

  it('fails closed on compatibility failure and lists the mismatch reasons as failures', () => {
    const reference = HistoricalReferenceSchema.parse(validReference());
    const current = buildCurrentReport({ datasetHash: '9'.repeat(64) });
    const gate = evaluateHistoricalAggregateSubsetGate(reference, current);
    expect(gate.passed).toBe(false);
    expect(gate.compatible).toBe(false);
    expect(gate.failures).toEqual(['dataset_hash_mismatch']);
  });

  it('fails closed when a required current metric is undefined instead of silently shrinking the gate', () => {
    const reference = HistoricalReferenceSchema.parse(validReference());
    const cases = Array.from({ length: 60 }, (_, index) => ({
      caseId: `hist-case-${index}`,
      prediction: { parseStatus: 'success' as const, source: 'meal' as const },
      numeric: {},
      safety: { catastrophicCalorieMiss: false, unsafeCompletion: false },
      booleans: {},
    }));
    const current = NutritionEvalReportSchema.parse({
      version: 1,
      runId: 'run-current-test-0002',
      timestamp: '2026-09-24T00:00:00.000Z',
      datasetId: REFERENCE_DATASET_ID,
      datasetHash: REFERENCE_DATASET_HASH,
      adapterModelId: 'gemini-3.8-flash',
      promptHash: REFERENCE_PROMPT_HASH,
      codeSha: 'c'.repeat(40),
      samples: 3,
      baselineOnly: false,
      publicCases: 20,
      privateCases: 0,
      summary: {
        totalCases: 60,
        runCases: 60,
        parseCases: 60,
        basisAccuracyDenom: 0,
        barcodeAccuracyDenom: 0,
        medianAbsoluteCalorieError: 10,
        medianRelativeCalorieError: 0.2,
        p90AbsoluteCalorieError: 20,
        p90RelativeCalorieError: 0.8,
        meanMacroRelativeError: 0.4,
        reviewRate: 0.1,
        catastrophicCount: 5,
        unsafeCompletionCount: 0,
        failuresByCategory: {},
        failuresByCode: {},
      },
      cases,
    });
    const gate = evaluateHistoricalAggregateSubsetGate(reference, current);
    expect(gate.passed).toBe(false);
    expect(gate.compatible).toBe(true);
    expect(gate.failures).toContain('meanMealMassRelativeError_unavailable');
    expect(gate.failures).toContain('meanMealCarbDensityRelativeError_unavailable');
    expect(gate.failures).toContain('meanMealFatDensityRelativeError_unavailable');
  });
});
