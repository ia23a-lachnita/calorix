/**
 * Closed full prediction journal codec (Task 1 Step 3).
 *
 * Pure descriptor-only owned snapshots. Every object is captured through
 * enumerable own data descriptors; accessors, nonenumerable/symbol/inherited
 * properties, nonplain prototypes and malformed arrays are rejected before
 * any getter runs. Required data comes from captured descriptors, never
 * caller property gets. Every failure is a fresh causeless
 * `CalibrationFatalError('calibration:report-journal-invalid')` without
 * inspecting the foreign error.
 */
import { createHash } from 'node:crypto';
import { CalibrationFatalError } from './fatal-error';
import { NutritionPredictionSchema, isCanonicalNutritionTuple } from './schema';
import type { NutritionPrediction } from './schema';
import type { JournalEntry, ReservationKey } from './calibration';

function reportInvalid(): never {
  throw new CalibrationFatalError('calibration:report-journal-invalid');
}

const TOP_ORDER = [
  'parseStatus',
  'source',
  'kcal',
  'proteinG',
  'carbsG',
  'fatG',
  'confidence',
  'basis',
  'amount',
  'unit',
  'barcode',
  'decision',
  'reviewReasons',
  'failureCategory',
  'failureCode',
  'failureDetail',
  'latencyMs',
  'sampleIndex',
  'cached',
  'diagnostics',
] as const;

const TOP_SET = new Set<string>(TOP_ORDER);

const DIAG_ORDER = [
  'rawNutrients',
  'detectedItemCount',
  'estimatedTotalMassG',
  'declaredBasis',
  'declaredAmount',
  'declaredUnit',
  'observedAmount',
  'observedUnit',
  'packageReference',
  'per100Reference',
  'servingReference',
] as const;

const DIAG_SET = new Set<string>(DIAG_ORDER);

const NUTRIENT_KEYS = ['kcal', 'proteinG', 'carbsG', 'fatG'] as const;

const REVIEW_REASONS = new Set<string>([
  'package_quantity_missing',
  'package_unit_unsupported',
  'barcode_unconfirmed',
  'nutrition_basis_ambiguous',
  'nutrition_arithmetic_mismatch',
  'atwater_mismatch',
  'model_schema_invalid',
]);

const BARCODE_PATTERN = /^[0-9]{8,14}$/;
const CASE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const PREDICTION_HASH_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const HEX64_PATTERN = /^[0-9a-f]{64}$/;
const MODEL_VERSION_PATTERN = /^[A-Za-z0-9_./-]{1,128}$/;

const FAILURE_PAIRINGS: Record<string, readonly string[]> = {
  schema: ['model_response_invalid', 'nutrition_normalization_invalid', 'prediction_schema_invalid'],
  provider: ['provider_request_failed'],
  product: ['off_product_invalid', 'off_product_not_found'],
  dataset: [
    'dataset_private_asset_unavailable',
    'dataset_media_mismatch',
    'dataset_dimension_mismatch',
    'dataset_checksum_mismatch',
    'dataset_invalid_config',
    'dataset_fetch_failed',
    'dataset_write_failed',
    'dataset_load_failed',
  ],
};

const JOURNAL_ORDER = [
  'key',
  'predictionHash',
  'normalizedPrediction',
  'analysisLatencyMs',
  'errorCategory',
  'responseModelVersion',
  'reportPrediction',
] as const;

const JOURNAL_SET = new Set<string>(JOURNAL_ORDER);

const JOURNAL_ERROR_CATEGORIES = new Set<string>([
  'none',
  'http_400',
  'http_401',
  'http_403',
  'http_404',
  'http_408',
  'http_429',
  'http_other_4xx',
  'http_5xx',
  'timeout',
  'network',
  'empty_response',
  'interrupted_reservation',
  'unknown',
]);

const STAGE_SAMPLE_RANGE: Record<string, { min: number; max: number }> = {
  preflight: { min: 1, max: 1 },
  development: { min: 1, max: 1 },
  validation: { min: 1, max: 3 },
  benchmark: { min: 1, max: 3 },
};

function deepFreezeOwned(value: unknown): void {
  try {
    if (typeof value !== 'object' || value === null) return;
    if (Array.isArray(value)) {
      const list = value as unknown[];
      for (let index = 0; index < list.length; index += 1) {
        deepFreezeOwned(list[index]);
      }
      Object.freeze(value);
      return;
    }
    const record = value as Record<string, unknown>;
    let names: string[];
    try {
      names = Object.getOwnPropertyNames(record);
    } catch {
      return;
    }
    for (const name of names) {
      let descriptor: PropertyDescriptor | undefined;
      try {
        descriptor = Object.getOwnPropertyDescriptor(record, name);
      } catch {
        continue;
      }
      if (descriptor === undefined || !('value' in descriptor)) continue;
      deepFreezeOwned(descriptor.value);
    }
    Object.freeze(value);
  } catch {
    reportInvalid();
  }
}

interface CapturedObject {
  names: string[];
  values: Map<string, unknown>;
}

function capturePlainObject(
  value: unknown,
  allowed: ReadonlySet<string>,
  opts: { exact?: boolean } = {},
): CapturedObject {
  let proto: unknown;
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      reportInvalid();
    }
    proto = Object.getPrototypeOf(value);
  } catch {
    reportInvalid();
    proto = undefined;
  }
  if (proto !== Object.prototype && proto !== null) {
    reportInvalid();
  }
  let names: string[];
  let symbols: symbol[];
  try {
    names = Object.getOwnPropertyNames(value);
    symbols = Object.getOwnPropertySymbols(value);
  } catch {
    reportInvalid();
    names = [];
    symbols = [];
  }
  if (symbols.length !== 0) {
    reportInvalid();
  }
  const values = new Map<string, unknown>();
  for (const name of names) {
    if (!allowed.has(name)) {
      reportInvalid();
    }
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, name);
    } catch {
      reportInvalid();
    }
    if (
      descriptor === undefined ||
      descriptor.enumerable !== true ||
      !('value' in descriptor) ||
      'get' in descriptor ||
      'set' in descriptor
    ) {
      reportInvalid();
    }
    const descriptorValue = (descriptor as PropertyDescriptor).value;
    // Accessor check: a data descriptor never invokes caller code.
    // Present undefined is never stripped; it is invalid.
    values.set(name, descriptorValue);
  }
  if (opts.exact === true) {
    if (names.length !== allowed.size) {
      reportInvalid();
    }
    for (const key of allowed) {
      if (!values.has(key)) {
        reportInvalid();
      }
    }
  }
  return { names, values };
}

function captureReviewReasons(value: unknown): unknown[] {
  let isArray = false;
  try {
    isArray = Array.isArray(value);
  } catch {
    reportInvalid();
  }
  if (!isArray) {
    reportInvalid();
  }
  let proto: unknown;
  try {
    proto = Object.getPrototypeOf(value);
  } catch {
    reportInvalid();
  }
  if (proto !== Array.prototype) {
    reportInvalid();
  }
  let symbols: symbol[];
  let names: string[];
  try {
    symbols = Object.getOwnPropertySymbols(value);
    names = Object.getOwnPropertyNames(value);
  } catch {
    reportInvalid();
    symbols = [];
    names = [];
  }
  if (symbols.length !== 0) {
    reportInvalid();
  }
  let lengthDescriptor: PropertyDescriptor | undefined;
  try {
    lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  } catch {
    reportInvalid();
  }
  if (
    lengthDescriptor === undefined ||
    lengthDescriptor.enumerable !== false ||
    !('value' in lengthDescriptor)
  ) {
    reportInvalid();
  }
  const lengthValue = (lengthDescriptor as PropertyDescriptor).value;
  if (typeof lengthValue !== 'number' || !Number.isInteger(lengthValue) || lengthValue < 0) {
    reportInvalid();
  }
  const length = lengthValue as number;
  if (names.length !== length + 1) {
    reportInvalid();
  }
  const out: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const key = String(index);
    if (!names.includes(key)) {
      reportInvalid();
    }
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      reportInvalid();
    }
    if (
      descriptor === undefined ||
      descriptor.enumerable !== true ||
      !('value' in descriptor)
    ) {
      reportInvalid();
    }
    out.push((descriptor as PropertyDescriptor).value);
  }
  return out;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function captureNutrientVector(value: unknown): Record<string, number> {
  const captured = capturePlainObject(value, new Set<string>(NUTRIENT_KEYS), { exact: true });
  const out: Record<string, number> = {};
  for (const key of NUTRIENT_KEYS) {
    const raw = captured.values.get(key);
    if (!isFiniteNonNegative(raw)) {
      reportInvalid();
    }
    out[key] = raw as number;
  }
  return out;
}

function captureReferenceVector(value: unknown): Record<string, unknown> {
  const allowed = new Set<string>(['kcal', 'proteinG', 'carbsG', 'fatG', 'amount', 'unit']);
  const captured = capturePlainObject(value, allowed, { exact: true });
  const out: Record<string, unknown> = {};
  for (const key of NUTRIENT_KEYS) {
    const raw = captured.values.get(key);
    if (!isFiniteNonNegative(raw)) {
      reportInvalid();
    }
    out[key] = raw as number;
  }
  const amount = captured.values.get('amount');
  const unit = captured.values.get('unit');
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    reportInvalid();
  }
  if (unit !== 'g' && unit !== 'ml') {
    reportInvalid();
  }
  out['amount'] = amount as number;
  out['unit'] = unit as string;
  return out;
}

function captureDiagnostics(value: unknown): Record<string, unknown> {
  const captured = capturePlainObject(value, DIAG_SET);
  const out: Record<string, unknown> = {};
  if (captured.values.has('rawNutrients')) {
    out['rawNutrients'] = captureNutrientVector(captured.values.get('rawNutrients'));
  }
  if (captured.values.has('detectedItemCount')) {
    const raw = captured.values.get('detectedItemCount');
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) {
      reportInvalid();
    }
    out['detectedItemCount'] = raw as number;
  }
  if (captured.values.has('estimatedTotalMassG')) {
    const raw = captured.values.get('estimatedTotalMassG');
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
      reportInvalid();
    }
    out['estimatedTotalMassG'] = raw as number;
  }
  for (const key of ['declaredBasis', 'declaredAmount', 'declaredUnit'] as const) {
    if (captured.values.has(key)) {
      // All-or-none checked below; copy raw for now.
      out[key] = captured.values.get(key);
    }
  }
  const declaredPresent =
    captured.values.has('declaredBasis') ||
    captured.values.has('declaredAmount') ||
    captured.values.has('declaredUnit');
  const declaredAll =
    captured.values.has('declaredBasis') &&
    captured.values.has('declaredAmount') &&
    captured.values.has('declaredUnit');
  if (declaredPresent && !declaredAll) {
    reportInvalid();
  }
  if (declaredAll) {
    const basis = captured.values.get('declaredBasis');
    const amount = captured.values.get('declaredAmount');
    const unit = captured.values.get('declaredUnit');
    if (basis !== 'portion' && basis !== 'package' && basis !== 'per100g') {
      reportInvalid();
    }
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      reportInvalid();
    }
    if (unit !== 'portion' && unit !== 'g' && unit !== 'ml') {
      reportInvalid();
    }
    if (
      !isCanonicalNutritionTuple(
        basis as 'portion' | 'package' | 'per100g',
        amount as number,
        unit as 'portion' | 'g' | 'ml',
      )
    ) {
      reportInvalid();
    }
  }
  const observedPresent =
    captured.values.has('observedAmount') || captured.values.has('observedUnit');
  const observedAll =
    captured.values.has('observedAmount') && captured.values.has('observedUnit');
  if (observedPresent && !observedAll) {
    reportInvalid();
  }
  if (observedAll) {
    const amount = captured.values.get('observedAmount');
    const unit = captured.values.get('observedUnit');
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      reportInvalid();
    }
    if (unit !== 'g' && unit !== 'ml') {
      reportInvalid();
    }
    out['observedAmount'] = amount as number;
    out['observedUnit'] = unit as string;
  } else {
    if (captured.values.has('observedAmount') || captured.values.has('observedUnit')) {
      reportInvalid();
    }
  }
  // declared copies already set; ensure types already validated above.
  for (const key of ['packageReference', 'per100Reference', 'servingReference'] as const) {
    if (captured.values.has(key)) {
      out[key] = captureReferenceVector(captured.values.get(key));
    }
  }
  if (
    captured.values.has('estimatedTotalMassG') &&
    !captured.values.has('detectedItemCount')
  ) {
    reportInvalid();
  }
  if (
    captured.values.get('detectedItemCount') === 0 &&
    captured.values.has('estimatedTotalMassG')
  ) {
    reportInvalid();
  }
  // Canonical diagnostic key order.
  const ordered: Record<string, unknown> = {};
  for (const key of DIAG_ORDER) {
    if (key in out) {
      ordered[key] = out[key];
    }
  }
  return ordered;
}

/**
 * Descriptor-only closed prediction capture. Returns an owned deeply frozen
 * canonical copy.
 */
export function captureCalibrationReportPrediction(value: unknown): NutritionPrediction {
  try {
    const captured = capturePlainObject(value, TOP_SET);
    for (const required of [
      'parseStatus',
      'source',
      'decision',
      'latencyMs',
      'sampleIndex',
      'cached',
    ] as const) {
      if (!captured.values.has(required)) {
        reportInvalid();
      }
    }
    const parseStatus = captured.values.get('parseStatus');
    const source = captured.values.get('source');
    const decision = captured.values.get('decision');
    const latencyMs = captured.values.get('latencyMs');
    const sampleIndex = captured.values.get('sampleIndex');
    const cached = captured.values.get('cached');
    if (parseStatus !== 'success' && parseStatus !== 'failure') {
      reportInvalid();
    }
    if (source !== 'meal' && source !== 'barcode' && source !== 'label') {
      reportInvalid();
    }
    if (decision !== 'complete' && decision !== 'needs_review' && decision !== 'error') {
      reportInvalid();
    }
    if (typeof latencyMs !== 'number' || !Number.isFinite(latencyMs) || latencyMs < 0) {
      reportInvalid();
    }
    if (
      typeof sampleIndex !== 'number' ||
      !Number.isInteger(sampleIndex) ||
      sampleIndex < 1 ||
      sampleIndex > 3
    ) {
      reportInvalid();
    }
    if (cached !== false) {
      reportInvalid();
    }

    const owned: Record<string, unknown> = {};

    if (parseStatus === 'success') {
      for (const key of NUTRIENT_KEYS) {
        if (!captured.values.has(key)) {
          reportInvalid();
        }
        const raw = captured.values.get(key);
        if (!isFiniteNonNegative(raw)) {
          reportInvalid();
        }
      }
      if (!captured.values.has('basis') || !captured.values.has('amount') || !captured.values.has('unit')) {
        reportInvalid();
      }
      const basis = captured.values.get('basis');
      const amount = captured.values.get('amount');
      const unit = captured.values.get('unit');
      if (basis !== 'portion' && basis !== 'package' && basis !== 'per100g') {
        reportInvalid();
      }
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
        reportInvalid();
      }
      if (unit !== 'portion' && unit !== 'g' && unit !== 'ml') {
        reportInvalid();
      }
      if (
        !isCanonicalNutritionTuple(
          basis as 'portion' | 'package' | 'per100g',
          amount as number,
          unit as 'portion' | 'g' | 'ml',
        )
      ) {
        reportInvalid();
      }
      if (decision !== 'complete' && decision !== 'needs_review') {
        reportInvalid();
      }
      if (source === 'meal' && decision !== 'needs_review') {
        reportInvalid();
      }
      for (const forbidden of ['failureCategory', 'failureCode', 'failureDetail'] as const) {
        if (captured.values.has(forbidden)) {
          reportInvalid();
        }
      }
      // Optional success fields.
      let reviewReasons: unknown[] | undefined;
      if (captured.values.has('reviewReasons')) {
        const rawList = captureReviewReasons(captured.values.get('reviewReasons'));
        for (const reason of rawList) {
          if (typeof reason !== 'string' || !REVIEW_REASONS.has(reason)) {
            reportInvalid();
          }
        }
        if (decision === 'complete' && rawList.length !== 0) {
          reportInvalid();
        }
        reviewReasons = [...rawList];
      }
      let confidenceValid = false;
      let confidenceValue: unknown;
      if (captured.values.has('confidence')) {
        confidenceValue = captured.values.get('confidence');
        if (!isFiniteNonNegative(confidenceValue)) {
          reportInvalid();
        }
        confidenceValid = true;
      }
      let barcodeValid = false;
      let barcodeValue: unknown;
      if (captured.values.has('barcode')) {
        barcodeValue = captured.values.get('barcode');
        if (typeof barcodeValue !== 'string' || !BARCODE_PATTERN.test(barcodeValue)) {
          reportInvalid();
        }
        barcodeValid = true;
      }
      let diagnostics: Record<string, unknown> | undefined;
      if (captured.values.has('diagnostics')) {
        const rawDiagnostics = captured.values.get('diagnostics');
        if (rawDiagnostics === null || rawDiagnostics === undefined) {
          reportInvalid();
        }
        diagnostics = captureDiagnostics(rawDiagnostics);
      }
      // Build canonical owned copy in brief order.
      owned['parseStatus'] = parseStatus;
      owned['source'] = source;
      for (const key of NUTRIENT_KEYS) {
        owned[key] = captured.values.get(key) as number;
      }
      if (confidenceValid) {
        owned['confidence'] = confidenceValue as number;
      }
      owned['basis'] = basis;
      owned['amount'] = amount;
      owned['unit'] = unit;
      if (barcodeValid) {
        owned['barcode'] = barcodeValue as string;
      }
      owned['decision'] = decision;
      if (reviewReasons !== undefined) {
        owned['reviewReasons'] = reviewReasons;
      }
      owned['latencyMs'] = latencyMs as number;
      owned['sampleIndex'] = sampleIndex as number;
      owned['cached'] = false;
      if (diagnostics !== undefined) {
        owned['diagnostics'] = diagnostics;
      }
    } else {
      if (decision !== 'error') {
        reportInvalid();
      }
      for (const forbidden of [
        'kcal',
        'proteinG',
        'carbsG',
        'fatG',
        'confidence',
        'basis',
        'amount',
        'unit',
        'barcode',
        'reviewReasons',
        'diagnostics',
      ] as const) {
        if (captured.values.has(forbidden)) {
          reportInvalid();
        }
      }
      if (!captured.values.has('failureCategory') || !captured.values.has('failureCode')) {
        reportInvalid();
      }
      const failureCategory = captured.values.get('failureCategory');
      const failureCode = captured.values.get('failureCode');
      if (typeof failureCategory !== 'string' || typeof failureCode !== 'string') {
        reportInvalid();
      }
      if (
        !Object.prototype.hasOwnProperty.call(FAILURE_PAIRINGS, failureCategory as string)
      ) {
        reportInvalid();
      }
      const allowedCodes = FAILURE_PAIRINGS[failureCategory as string];
      if (allowedCodes === undefined) {
        reportInvalid();
      }
      if (!(allowedCodes as readonly string[]).includes(failureCode as string)) {
        reportInvalid();
      }
      const hasDetail = captured.values.has('failureDetail');
      if (hasDetail) {
        if (failureCategory !== 'schema' || failureCode !== 'model_response_invalid') {
          reportInvalid();
        }
        const detail = captured.values.get('failureDetail');
        if (typeof detail !== 'string') {
          reportInvalid();
        }
      }
      owned['parseStatus'] = parseStatus;
      owned['source'] = source;
      owned['decision'] = decision;
      owned['failureCategory'] = failureCategory as string;
      owned['failureCode'] = failureCode as string;
      if (hasDetail) {
        owned['failureDetail'] = captured.values.get('failureDetail') as string;
      }
      owned['latencyMs'] = latencyMs as number;
      owned['sampleIndex'] = sampleIndex as number;
      owned['cached'] = false;
    }

    // Retain unchanged schema semantics (diagnostic allowlist, parser detail).
    const parsed = NutritionPredictionSchema.safeParse(owned);
    if (!parsed.success) {
      reportInvalid();
    }
    deepFreezeOwned(owned);
    return owned as unknown as NutritionPrediction;
  } catch {
    reportInvalid();
  }
}

function captureReservationKey(value: unknown): ReservationKey {
  const captured = capturePlainObject(
    value,
    new Set<string>(['stage', 'profile', 'caseId', 'sampleIndex']),
    { exact: true },
  );
  const stage = captured.values.get('stage');
  const profile = captured.values.get('profile');
  const caseId = captured.values.get('caseId');
  const sampleIndex = captured.values.get('sampleIndex');
  if (
    stage !== 'preflight' &&
    stage !== 'development' &&
    stage !== 'validation' &&
    stage !== 'benchmark'
  ) {
    reportInvalid();
  }
  if (profile !== 'LOW' && profile !== 'MEDIUM') {
    reportInvalid();
  }
  if (typeof caseId !== 'string' || !CASE_ID_PATTERN.test(caseId)) {
    reportInvalid();
  }
  const range = STAGE_SAMPLE_RANGE[stage as string];
  if (
    range === undefined ||
    typeof sampleIndex !== 'number' ||
    !Number.isInteger(sampleIndex) ||
    sampleIndex < range.min ||
    sampleIndex > range.max
  ) {
    reportInvalid();
  }
  return {
    stage: stage as ReservationKey['stage'],
    profile: profile as ReservationKey['profile'],
    caseId: caseId as string,
    sampleIndex: sampleIndex as number,
  };
}

function sha256FourNutrients(four: Record<string, number>): string {
  const canonical = {
    kcal: four['kcal'],
    proteinG: four['proteinG'],
    carbsG: four['carbsG'],
    fatG: four['fatG'],
  };
  return createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex');
}

/**
 * Exact-seven extended journal capture. Returns an owned deeply frozen
 * canonical copy.
 */
export function captureCalibrationReportJournalEntry(value: unknown): JournalEntry {
  try {
    const captured = capturePlainObject(value, JOURNAL_SET, { exact: true });
    const key = captureReservationKey(captured.values.get('key'));

    const predictionHash = captured.values.get('predictionHash');
    if (typeof predictionHash !== 'string' || !PREDICTION_HASH_PATTERN.test(predictionHash)) {
      reportInvalid();
    }

    const normalizedRaw = captured.values.get('normalizedPrediction');
    let normalized: Record<string, number> | null = null;
    let normalizedHasMass = false;
    let normalizedMass = 0;
    if (normalizedRaw !== null) {
      if (typeof normalizedRaw !== 'object' || normalizedRaw === null || Array.isArray(normalizedRaw)) {
        reportInvalid();
      }
      const normalizedCaptured = capturePlainObject(
        normalizedRaw,
        new Set<string>(['kcal', 'proteinG', 'carbsG', 'fatG', 'estimatedTotalMassG']),
      );
      for (const nutrient of NUTRIENT_KEYS) {
        if (!normalizedCaptured.values.has(nutrient)) {
          reportInvalid();
        }
        const raw = normalizedCaptured.values.get(nutrient);
        if (!isFiniteNonNegative(raw)) {
          reportInvalid();
        }
      }
      if (normalizedCaptured.names.length !== 4 && normalizedCaptured.names.length !== 5) {
        reportInvalid();
      }
      if (
        normalizedCaptured.names.length === 5 &&
        !normalizedCaptured.values.has('estimatedTotalMassG')
      ) {
        reportInvalid();
      }
      const four: Record<string, number> = {
        kcal: normalizedCaptured.values.get('kcal') as number,
        proteinG: normalizedCaptured.values.get('proteinG') as number,
        carbsG: normalizedCaptured.values.get('carbsG') as number,
        fatG: normalizedCaptured.values.get('fatG') as number,
      };
      normalized = four;
      if (normalizedCaptured.values.has('estimatedTotalMassG')) {
        const mass = normalizedCaptured.values.get('estimatedTotalMassG');
        if (typeof mass !== 'number' || !Number.isFinite(mass) || mass <= 0) {
          reportInvalid();
        }
        normalizedHasMass = true;
        normalizedMass = mass as number;
      }
    }

    const analysisLatencyMs = captured.values.get('analysisLatencyMs');
    if (
      typeof analysisLatencyMs !== 'number' ||
      !Number.isFinite(analysisLatencyMs) ||
      analysisLatencyMs < 0
    ) {
      reportInvalid();
    }

    const errorCategory = captured.values.get('errorCategory');
    if (typeof errorCategory !== 'string' || !JOURNAL_ERROR_CATEGORIES.has(errorCategory)) {
      reportInvalid();
    }

    const responseModelVersion = captured.values.get('responseModelVersion');
    if (
      typeof responseModelVersion !== 'string' ||
      !MODEL_VERSION_PATTERN.test(responseModelVersion)
    ) {
      reportInvalid();
    }

    const reportRaw = captured.values.get('reportPrediction');
    if (reportRaw === undefined || reportRaw === null) {
      reportInvalid();
    }
    const report = captureCalibrationReportPrediction(reportRaw) as unknown as Record<
      string,
      unknown
    >;

    if ((report['sampleIndex'] as number) !== key.sampleIndex) {
      reportInvalid();
    }
    if ((report['latencyMs'] as number) !== (analysisLatencyMs as number)) {
      reportInvalid();
    }

    if (errorCategory === 'none') {
      if (normalized === null) {
        reportInvalid();
      }
      if (!HEX64_PATTERN.test(predictionHash as string)) {
        reportInvalid();
      }
      if ((responseModelVersion as string) === 'n/a') {
        reportInvalid();
      }
      const four = normalized as Record<string, number>;
      if (
        (report['kcal'] as number) !== four['kcal'] ||
        (report['proteinG'] as number) !== four['proteinG'] ||
        (report['carbsG'] as number) !== four['carbsG'] ||
        (report['fatG'] as number) !== four['fatG']
      ) {
        reportInvalid();
      }
      if (sha256FourNutrients(four) !== (predictionHash as string)) {
        reportInvalid();
      }
      const diagnostics = report['diagnostics'] as Record<string, unknown> | undefined;
      const reportMass =
        diagnostics !== undefined ? diagnostics['estimatedTotalMassG'] : undefined;
      if (normalizedHasMass) {
        if (reportMass !== normalizedMass) {
          reportInvalid();
        }
      } else if (reportMass !== undefined) {
        reportInvalid();
      }
    } else {
      if (normalized !== null || normalizedHasMass) {
        reportInvalid();
      }
      if ((predictionHash as string) !== (errorCategory as string)) {
        reportInvalid();
      }
      if ((responseModelVersion as string) !== 'n/a') {
        reportInvalid();
      }
      if ((report['parseStatus'] as string) !== 'failure') {
        reportInvalid();
      }
    }

    const ownedKey: ReservationKey = {
      stage: key.stage,
      profile: key.profile,
      caseId: key.caseId,
      sampleIndex: key.sampleIndex,
    };
    let ownedNormalized: Record<string, unknown> | null = null;
    if (normalized !== null) {
      const four = normalized as Record<string, number>;
      if (normalizedHasMass) {
        ownedNormalized = {
          kcal: four['kcal'],
          proteinG: four['proteinG'],
          carbsG: four['carbsG'],
          fatG: four['fatG'],
          estimatedTotalMassG: normalizedMass,
        };
      } else {
        ownedNormalized = {
          kcal: four['kcal'],
          proteinG: four['proteinG'],
          carbsG: four['carbsG'],
          fatG: four['fatG'],
        };
      }
    }
    const owned: Record<string, unknown> = {
      key: ownedKey,
      predictionHash: predictionHash as string,
      normalizedPrediction: ownedNormalized,
      analysisLatencyMs: analysisLatencyMs as number,
      errorCategory: errorCategory as string,
      responseModelVersion: responseModelVersion as string,
      reportPrediction: report,
    };
    deepFreezeOwned(owned);
    return owned as unknown as JournalEntry;
  } catch {
    reportInvalid();
  }
}
