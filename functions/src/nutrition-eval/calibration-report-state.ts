/**
 * Pure report-state shared types and closed capture codecs (Task 1 Step 3,
 * bounded first piece: module only).
 *
 * Descriptor-only owned snapshots: every object/array is captured through
 * exact enumerable own data descriptors. Accessors, non-enumerable/symbol
 * properties, non-plain prototypes, sparse/extra-keyed arrays, present
 * `undefined`, and unknown fields are rejected before any getter or
 * `toString`/coercion runs. Every failure is a fresh causeless
 * `CalibrationFatalError`; foreign thrown values are never inspected or
 * re-exposed. All imports from `./calibration` are type-only to avoid a
 * runtime import cycle with the ledger module.
 */
import { createHash } from 'node:crypto';
import { CalibrationFatalError } from './fatal-error';
import {
  captureCalibrationReportJournalEntry,
  captureCalibrationReportPrediction,
} from './calibration-report-journal';
import type { NutritionPrediction } from './schema';
import type {
  CalibrationIdentity,
  CalibrationProfile,
  JournalEntry,
  ReservationKey,
  StageName,
} from './calibration';

function fatal(message: string): never {
  throw new CalibrationFatalError(message);
}

// ── Shared types (plan Shared Interfaces) ────────────────────────────────────

export interface CalibrationReportOutcomeKey {
  readonly stage: StageName;
  readonly profile: CalibrationProfile;
  readonly caseId: string;
  readonly sampleIndex: number;
}

export interface CalibrationPlannedReportOutcome {
  readonly key: CalibrationReportOutcomeKey;
  readonly scanMode: 'meal' | 'label' | 'barcode';
}

export interface CalibrationProtocolReportOptions {
  readonly getReportOutcomePlan: (
    selectedProfile?: CalibrationProfile,
  ) => readonly CalibrationPlannedReportOutcome[];
}

export interface CalibrationNonReservationEntry {
  readonly key: CalibrationReportOutcomeKey;
  readonly reason: 'barcode' | 'dataset';
  readonly prediction: NutritionPrediction;
}

export interface CalibrationNonReservationOutcome extends CalibrationNonReservationEntry {
  readonly contentDigest: string;
  readonly at: string;
}

export interface CalibrationNonReservationLedgerEvent extends CalibrationNonReservationOutcome {
  readonly type: 'non_reservation_result';
}

export type CalibrationImageTerminalOutcome =
  | {
      readonly status: 'completed';
      readonly key: ReservationKey;
      readonly journalHash: string;
      readonly journal: JournalEntry & { readonly reportPrediction: NutritionPrediction };
    }
  | {
      readonly status: 'interrupted_reservation';
      readonly key: ReservationKey;
      readonly journalHash: string;
    };

export interface CalibrationStageReportSnapshot {
  readonly stage: StageName;
  readonly profile: CalibrationProfile;
  readonly identity: Readonly<CalibrationIdentity>;
  readonly startedAt?: string;
  readonly selectedProfile?: CalibrationProfile;
  readonly pinnedModelVersion?: string;
  readonly counts: {
    readonly imageCallsReserved: number;
    readonly imageCallsCompleted: number;
    readonly imageCallsFailed: number;
    readonly imageCallsPending: number;
  };
  readonly images: readonly CalibrationImageTerminalOutcome[];
  readonly nonReservations: readonly CalibrationNonReservationOutcome[];
}

// ── Local constants (duplicated, never imported at runtime from calibration.ts) ──

const CASE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const HEX40_PATTERN = /^[0-9a-f]{40}$/;
const HEX64_PATTERN = /^[0-9a-f]{64}$/;
const MODEL_VERSION_PATTERN = /^[A-Za-z0-9_./-]{1,128}$/;
const CANONICAL_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const STAGE_SAMPLE_RANGE: Record<string, { min: number; max: number }> = {
  preflight: { min: 1, max: 1 },
  development: { min: 1, max: 1 },
  validation: { min: 1, max: 3 },
  benchmark: { min: 1, max: 3 },
};

const IDENTITY_FIELDS = [
  'protocolVersion',
  'provider',
  'model',
  'implementationCommit',
  'functionsTreeId',
  'datasetHash',
  'promptHash',
  'responseSchemaHash',
  'sourceLockHash',
  'manifestHash',
  'publicManifestHash',
  'snapshotLockHash',
  'historicalReferenceHash',
  'plannedImageCalls',
  'hardCeiling',
] as const;

const IDENTITY_HEX64_FIELDS = [
  'datasetHash',
  'promptHash',
  'responseSchemaHash',
  'sourceLockHash',
  'manifestHash',
  'publicManifestHash',
  'snapshotLockHash',
  'historicalReferenceHash',
] as const;

const KEY_FIELDS = ['stage', 'profile', 'caseId', 'sampleIndex'] as const;
const ENTRY_FIELDS = ['key', 'reason', 'prediction'] as const;
const EVENT_FIELDS = ['type', 'key', 'reason', 'prediction', 'contentDigest', 'at'] as const;
const NONRES_ROW_FIELDS = ['key', 'reason', 'prediction', 'contentDigest', 'at'] as const;
const COUNTS_FIELDS = [
  'imageCallsReserved',
  'imageCallsCompleted',
  'imageCallsFailed',
  'imageCallsPending',
] as const;
const IMAGE_COMPLETED_FIELDS = ['status', 'key', 'journalHash', 'journal'] as const;
const IMAGE_INTERRUPTED_FIELDS = ['status', 'key', 'journalHash'] as const;
const SNAPSHOT_REQUIRED_FIELDS = [
  'stage',
  'profile',
  'identity',
  'counts',
  'images',
  'nonReservations',
] as const;
const SNAPSHOT_OPTIONAL_FIELDS = ['startedAt', 'selectedProfile', 'pinnedModelVersion'] as const;
const SNAPSHOT_ALLOWED_FIELDS = new Set<string>([
  ...SNAPSHOT_REQUIRED_FIELDS,
  ...SNAPSHOT_OPTIONAL_FIELDS,
]);

// ── Guarded descriptor-only capture primitives ───────────────────────────────

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Exact-keys own-enumerable-data capture for a plain object. Rejects
 * non-plain prototypes, symbols, non-enumerable/accessor properties, unknown
 * fields, missing required fields, and present-`undefined` values. Never
 * invokes caller `toString`/`valueOf`/iterator; a thrown reflection failure
 * (revoked proxy, throwing `ownKeys`) is treated identically to a structural
 * mismatch.
 */
function captureEnumerableExact(value: unknown, allowed: readonly string[]): Map<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('calibration-report-state:not-plain-object');
  }
  let proto: unknown;
  try {
    proto = Object.getPrototypeOf(value);
  } catch {
    throw new Error('calibration-report-state:reflection-failed');
  }
  if (proto !== Object.prototype && proto !== null) {
    throw new Error('calibration-report-state:non-plain-prototype');
  }
  let names: string[];
  let symbols: symbol[];
  try {
    names = Object.getOwnPropertyNames(value);
    symbols = Object.getOwnPropertySymbols(value);
  } catch {
    throw new Error('calibration-report-state:reflection-failed');
  }
  if (symbols.length !== 0) {
    throw new Error('calibration-report-state:symbol-key');
  }
  if (names.length !== allowed.length) {
    throw new Error('calibration-report-state:field-count-mismatch');
  }
  const allowedSet = new Set(allowed);
  const map = new Map<string, unknown>();
  for (const name of names) {
    if (!allowedSet.has(name)) {
      throw new Error('calibration-report-state:unknown-field');
    }
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, name);
    } catch {
      throw new Error('calibration-report-state:reflection-failed');
    }
    if (
      descriptor === undefined ||
      descriptor.enumerable !== true ||
      !('value' in descriptor) ||
      'get' in descriptor ||
      'set' in descriptor
    ) {
      throw new Error('calibration-report-state:non-data-descriptor');
    }
    if (descriptor.value === undefined) {
      throw new Error('calibration-report-state:present-undefined');
    }
    map.set(name, descriptor.value);
  }
  for (const key of allowed) {
    if (!map.has(key)) {
      throw new Error('calibration-report-state:missing-field');
    }
  }
  return map;
}

/** Dense (no holes, no extra keys) own-data array capture. */
function captureDenseArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error('calibration-report-state:not-array');
  }
  let proto: unknown;
  try {
    proto = Object.getPrototypeOf(value);
  } catch {
    throw new Error('calibration-report-state:reflection-failed');
  }
  if (proto !== Array.prototype) {
    throw new Error('calibration-report-state:non-plain-array');
  }
  let names: string[];
  let symbols: symbol[];
  try {
    names = Object.getOwnPropertyNames(value);
    symbols = Object.getOwnPropertySymbols(value);
  } catch {
    throw new Error('calibration-report-state:reflection-failed');
  }
  if (symbols.length !== 0) {
    throw new Error('calibration-report-state:symbol-key');
  }
  let lengthDescriptor: PropertyDescriptor | undefined;
  try {
    lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  } catch {
    throw new Error('calibration-report-state:reflection-failed');
  }
  if (
    lengthDescriptor === undefined ||
    lengthDescriptor.enumerable !== false ||
    !('value' in lengthDescriptor)
  ) {
    throw new Error('calibration-report-state:array-length-invalid');
  }
  const lengthValue = lengthDescriptor.value;
  if (typeof lengthValue !== 'number' || !Number.isInteger(lengthValue) || lengthValue < 0) {
    throw new Error('calibration-report-state:array-length-invalid');
  }
  if (names.length !== lengthValue + 1) {
    throw new Error('calibration-report-state:array-not-dense');
  }
  const out: unknown[] = [];
  for (let index = 0; index < lengthValue; index += 1) {
    const key = String(index);
    if (!names.includes(key)) {
      throw new Error('calibration-report-state:array-not-dense');
    }
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      throw new Error('calibration-report-state:reflection-failed');
    }
    if (descriptor === undefined || descriptor.enumerable !== true || !('value' in descriptor)) {
      throw new Error('calibration-report-state:array-element-invalid');
    }
    out.push(descriptor.value);
  }
  return out;
}

function captureCanonicalIso(value: unknown): string {
  if (typeof value !== 'string' || !CANONICAL_ISO_PATTERN.test(value)) {
    throw new Error('calibration-report-state:timestamp-invalid');
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error('calibration-report-state:timestamp-invalid');
  }
  if (new Date(value).toISOString() !== value) {
    throw new Error('calibration-report-state:timestamp-invalid');
  }
  return value;
}

function captureReportOutcomeKey(value: unknown): CalibrationReportOutcomeKey {
  const map = captureEnumerableExact(value, KEY_FIELDS);
  const stage = map.get('stage');
  const profile = map.get('profile');
  const caseId = map.get('caseId');
  const sampleIndex = map.get('sampleIndex');
  if (
    stage !== 'preflight' &&
    stage !== 'development' &&
    stage !== 'validation' &&
    stage !== 'benchmark'
  ) {
    throw new Error('calibration-report-state:key-stage-invalid');
  }
  if (profile !== 'LOW' && profile !== 'MEDIUM') {
    throw new Error('calibration-report-state:key-profile-invalid');
  }
  if (typeof caseId !== 'string' || !CASE_ID_PATTERN.test(caseId)) {
    throw new Error('calibration-report-state:key-case-id-invalid');
  }
  const range = STAGE_SAMPLE_RANGE[stage];
  if (
    range === undefined ||
    typeof sampleIndex !== 'number' ||
    !Number.isInteger(sampleIndex) ||
    sampleIndex < range.min ||
    sampleIndex > range.max
  ) {
    throw new Error('calibration-report-state:key-sample-index-invalid');
  }
  const owned = { stage, profile, caseId, sampleIndex };
  Object.freeze(owned);
  return owned as CalibrationReportOutcomeKey;
}

function sameKey(a: CalibrationReportOutcomeKey, b: CalibrationReportOutcomeKey): boolean {
  return (
    a.stage === b.stage &&
    a.profile === b.profile &&
    a.caseId === b.caseId &&
    a.sampleIndex === b.sampleIndex
  );
}

function canonicalKeyId(key: CalibrationReportOutcomeKey): string {
  return `${key.stage}|${key.profile}|${key.caseId}|${key.sampleIndex}`;
}

function captureIdentity(value: unknown): Readonly<CalibrationIdentity> {
  const map = captureEnumerableExact(value, IDENTITY_FIELDS);
  if (map.get('protocolVersion') !== 'v1') {
    throw new Error('calibration-report-state:identity-invalid:protocolVersion');
  }
  if (map.get('provider') !== 'vertex-ai') {
    throw new Error('calibration-report-state:identity-invalid:provider');
  }
  if (map.get('model') !== 'gemini-3.8-flash') {
    throw new Error('calibration-report-state:identity-invalid:model');
  }
  if (map.get('plannedImageCalls') !== 146) {
    throw new Error('calibration-report-state:identity-invalid:plannedImageCalls');
  }
  if (map.get('hardCeiling') !== 300) {
    throw new Error('calibration-report-state:identity-invalid:hardCeiling');
  }
  const implementationCommit = map.get('implementationCommit');
  const functionsTreeId = map.get('functionsTreeId');
  if (typeof implementationCommit !== 'string' || !HEX40_PATTERN.test(implementationCommit)) {
    throw new Error('calibration-report-state:identity-invalid:implementationCommit');
  }
  if (typeof functionsTreeId !== 'string' || !HEX40_PATTERN.test(functionsTreeId)) {
    throw new Error('calibration-report-state:identity-invalid:functionsTreeId');
  }
  for (const field of IDENTITY_HEX64_FIELDS) {
    const raw = map.get(field);
    if (typeof raw !== 'string' || !HEX64_PATTERN.test(raw)) {
      throw new Error(`calibration-report-state:identity-invalid:${field}`);
    }
  }
  const owned: Record<string, unknown> = {};
  for (const field of IDENTITY_FIELDS) {
    owned[field] = map.get(field);
  }
  Object.freeze(owned);
  return owned as Readonly<CalibrationIdentity>;
}

/** Shared key/reason/prediction validation used by entry/event/row capture. */
function captureEntryCore(
  map: Map<string, unknown>,
): { key: CalibrationReportOutcomeKey; reason: 'barcode' | 'dataset'; prediction: NutritionPrediction } {
  const key = captureReportOutcomeKey(map.get('key'));
  const reason = map.get('reason');
  if (reason !== 'barcode' && reason !== 'dataset') {
    throw new Error('calibration-report-state:reason-invalid');
  }
  const prediction = captureCalibrationReportPrediction(map.get('prediction'));
  return { key, reason, prediction };
}

function nonReservationDigestInput(
  key: CalibrationReportOutcomeKey,
  reason: 'barcode' | 'dataset',
  prediction: NutritionPrediction,
  at: string,
): string {
  return JSON.stringify({ key, reason, prediction, at });
}

// ── Exported capture functions ───────────────────────────────────────────────

export function captureCalibrationNonReservationEntry(value: unknown): CalibrationNonReservationEntry {
  try {
    const map = captureEnumerableExact(value, ENTRY_FIELDS);
    const core = captureEntryCore(map);
    const owned = { key: core.key, reason: core.reason, prediction: core.prediction };
    Object.freeze(owned);
    return owned as CalibrationNonReservationEntry;
  } catch {
    return fatal('calibration:non-reservation-entry-invalid');
  }
}

export function captureCalibrationNonReservationEvent(
  value: unknown,
): CalibrationNonReservationLedgerEvent {
  try {
    const map = captureEnumerableExact(value, EVENT_FIELDS);
    if (map.get('type') !== 'non_reservation_result') {
      throw new Error('calibration-report-state:event-type-invalid');
    }
    const core = captureEntryCore(map);
    const at = captureCanonicalIso(map.get('at'));
    const contentDigest = map.get('contentDigest');
    if (typeof contentDigest !== 'string' || !HEX64_PATTERN.test(contentDigest)) {
      throw new Error('calibration-report-state:digest-invalid');
    }
    const expected = sha256Hex(nonReservationDigestInput(core.key, core.reason, core.prediction, at));
    if (expected !== contentDigest) {
      throw new Error('calibration-report-state:digest-mismatch');
    }
    const owned = {
      type: 'non_reservation_result' as const,
      key: core.key,
      reason: core.reason,
      prediction: core.prediction,
      contentDigest,
      at,
    };
    Object.freeze(owned);
    return owned as CalibrationNonReservationLedgerEvent;
  } catch {
    return fatal('calibration:non-reservation-event-invalid');
  }
}

function captureNonReservationOutcomeRow(value: unknown): CalibrationNonReservationOutcome {
  const map = captureEnumerableExact(value, NONRES_ROW_FIELDS);
  const core = captureEntryCore(map);
  const at = captureCanonicalIso(map.get('at'));
  const contentDigest = map.get('contentDigest');
  if (typeof contentDigest !== 'string' || !HEX64_PATTERN.test(contentDigest)) {
    throw new Error('calibration-report-state:digest-invalid');
  }
  const expected = sha256Hex(nonReservationDigestInput(core.key, core.reason, core.prediction, at));
  if (expected !== contentDigest) {
    throw new Error('calibration-report-state:digest-mismatch');
  }
  const owned = { key: core.key, reason: core.reason, prediction: core.prediction, contentDigest, at };
  Object.freeze(owned);
  return owned as CalibrationNonReservationOutcome;
}

function captureImageRow(value: unknown): CalibrationImageTerminalOutcome {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('calibration-report-state:image-row-invalid');
  }
  let proto: unknown;
  try {
    proto = Object.getPrototypeOf(value);
  } catch {
    throw new Error('calibration-report-state:reflection-failed');
  }
  if (proto !== Object.prototype && proto !== null) {
    throw new Error('calibration-report-state:non-plain-prototype');
  }
  let statusDescriptor: PropertyDescriptor | undefined;
  try {
    statusDescriptor = Object.getOwnPropertyDescriptor(value, 'status');
  } catch {
    throw new Error('calibration-report-state:reflection-failed');
  }
  if (
    statusDescriptor === undefined ||
    statusDescriptor.enumerable !== true ||
    !('value' in statusDescriptor)
  ) {
    throw new Error('calibration-report-state:image-row-status-invalid');
  }
  const status = statusDescriptor.value;
  if (status === 'completed') {
    const map = captureEnumerableExact(value, IMAGE_COMPLETED_FIELDS);
    const key = captureReportOutcomeKey(map.get('key'));
    const journalHash = map.get('journalHash');
    if (typeof journalHash !== 'string' || !HEX64_PATTERN.test(journalHash)) {
      throw new Error('calibration-report-state:image-journal-hash-invalid');
    }
    const journal = captureCalibrationReportJournalEntry(map.get('journal'));
    const journalKey = journal.key as unknown as CalibrationReportOutcomeKey;
    if (!sameKey(key, journalKey)) {
      throw new Error('calibration-report-state:image-key-mismatch');
    }
    const recomputed = sha256Hex(JSON.stringify(journal));
    if (recomputed !== journalHash) {
      throw new Error('calibration-report-state:image-journal-hash-mismatch');
    }
    const owned = {
      status: 'completed' as const,
      key: key as unknown as ReservationKey,
      journalHash,
      journal: journal as JournalEntry & { readonly reportPrediction: NutritionPrediction },
    };
    Object.freeze(owned);
    return owned;
  }
  if (status === 'interrupted_reservation') {
    const map = captureEnumerableExact(value, IMAGE_INTERRUPTED_FIELDS);
    const key = captureReportOutcomeKey(map.get('key'));
    const journalHash = map.get('journalHash');
    if (typeof journalHash !== 'string' || !HEX64_PATTERN.test(journalHash)) {
      throw new Error('calibration-report-state:image-journal-hash-invalid');
    }
    const canonicalInterruption = {
      key,
      predictionHash: 'interrupted_reservation',
      normalizedPrediction: null,
      analysisLatencyMs: 0,
      errorCategory: 'interrupted_reservation',
      responseModelVersion: 'n/a',
    };
    const recomputed = sha256Hex(JSON.stringify(canonicalInterruption));
    if (recomputed !== journalHash) {
      throw new Error('calibration-report-state:image-interruption-hash-mismatch');
    }
    const owned = {
      status: 'interrupted_reservation' as const,
      key: key as unknown as ReservationKey,
      journalHash,
    };
    Object.freeze(owned);
    return owned;
  }
  throw new Error('calibration-report-state:image-row-status-invalid');
}

export function captureCalibrationStageReportSnapshot(value: unknown): CalibrationStageReportSnapshot {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('calibration-report-state:snapshot-invalid');
    }
    let proto: unknown;
    try {
      proto = Object.getPrototypeOf(value);
    } catch {
      throw new Error('calibration-report-state:reflection-failed');
    }
    if (proto !== Object.prototype && proto !== null) {
      throw new Error('calibration-report-state:non-plain-prototype');
    }
    let names: string[];
    let symbols: symbol[];
    try {
      names = Object.getOwnPropertyNames(value);
      symbols = Object.getOwnPropertySymbols(value);
    } catch {
      throw new Error('calibration-report-state:reflection-failed');
    }
    if (symbols.length !== 0) {
      throw new Error('calibration-report-state:symbol-key');
    }
    const map = new Map<string, unknown>();
    for (const name of names) {
      if (!SNAPSHOT_ALLOWED_FIELDS.has(name)) {
        throw new Error('calibration-report-state:unknown-field');
      }
      let descriptor: PropertyDescriptor | undefined;
      try {
        descriptor = Object.getOwnPropertyDescriptor(value, name);
      } catch {
        throw new Error('calibration-report-state:reflection-failed');
      }
      if (
        descriptor === undefined ||
        descriptor.enumerable !== true ||
        !('value' in descriptor) ||
        'get' in descriptor ||
        'set' in descriptor
      ) {
        throw new Error('calibration-report-state:non-data-descriptor');
      }
      if (descriptor.value === undefined) {
        throw new Error('calibration-report-state:present-undefined');
      }
      map.set(name, descriptor.value);
    }
    for (const field of SNAPSHOT_REQUIRED_FIELDS) {
      if (!map.has(field)) {
        throw new Error('calibration-report-state:missing-field');
      }
    }

    const stage = map.get('stage');
    if (
      stage !== 'preflight' &&
      stage !== 'development' &&
      stage !== 'validation' &&
      stage !== 'benchmark'
    ) {
      throw new Error('calibration-report-state:stage-invalid');
    }
    const profile = map.get('profile');
    if (profile !== 'LOW' && profile !== 'MEDIUM') {
      throw new Error('calibration-report-state:profile-invalid');
    }
    const identity = captureIdentity(map.get('identity'));

    let startedAt: string | undefined;
    if (map.has('startedAt')) {
      startedAt = captureCanonicalIso(map.get('startedAt'));
    }
    let selectedProfile: CalibrationProfile | undefined;
    if (map.has('selectedProfile')) {
      const raw = map.get('selectedProfile');
      if (raw !== 'LOW' && raw !== 'MEDIUM') {
        throw new Error('calibration-report-state:selected-profile-invalid');
      }
      selectedProfile = raw;
    }
    let pinnedModelVersion: string | undefined;
    if (map.has('pinnedModelVersion')) {
      const raw = map.get('pinnedModelVersion');
      if (typeof raw !== 'string' || !MODEL_VERSION_PATTERN.test(raw) || raw === 'n/a') {
        throw new Error('calibration-report-state:pinned-version-invalid');
      }
      pinnedModelVersion = raw;
    }

    const countsMap = captureEnumerableExact(map.get('counts'), COUNTS_FIELDS);
    const reserved = countsMap.get('imageCallsReserved');
    const completed = countsMap.get('imageCallsCompleted');
    const failed = countsMap.get('imageCallsFailed');
    const pending = countsMap.get('imageCallsPending');
    for (const count of [reserved, completed, failed, pending]) {
      if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
        throw new Error('calibration-report-state:counts-invalid');
      }
    }
    if (
      (completed as number) + (failed as number) + (pending as number) !==
      (reserved as number)
    ) {
      throw new Error('calibration-report-state:counts-inconsistent');
    }

    const imagesRaw = captureDenseArray(map.get('images'));
    const images = imagesRaw.map((row) => captureImageRow(row));
    const nonReservationsRaw = captureDenseArray(map.get('nonReservations'));
    const nonReservations = nonReservationsRaw.map((row) => captureNonReservationOutcomeRow(row));

    const seenImageKeys = new Set<string>();
    let actualCompleted = 0;
    let actualFailed = 0;
    for (const row of images) {
      if (row.key.stage !== stage || row.key.profile !== profile) {
        throw new Error('calibration-report-state:image-row-stage-profile-mismatch');
      }
      const id = canonicalKeyId(row.key as unknown as CalibrationReportOutcomeKey);
      if (seenImageKeys.has(id)) {
        throw new Error('calibration-report-state:image-row-duplicate');
      }
      seenImageKeys.add(id);
      if (row.status === 'interrupted_reservation') {
        actualFailed += 1;
      } else if (row.journal.errorCategory === 'none') {
        actualCompleted += 1;
      } else {
        actualFailed += 1;
      }
    }
    if (actualCompleted !== completed || actualFailed !== failed) {
      throw new Error('calibration-report-state:counts-mismatch');
    }
    const actualPending = (reserved as number) - images.length;
    if (actualPending !== pending) {
      throw new Error('calibration-report-state:counts-mismatch');
    }

    const seenNonReservationKeys = new Set<string>();
    for (const row of nonReservations) {
      if (row.key.stage !== stage || row.key.profile !== profile) {
        throw new Error('calibration-report-state:nonreservation-row-stage-profile-mismatch');
      }
      const id = canonicalKeyId(row.key);
      if (seenNonReservationKeys.has(id) || seenImageKeys.has(id)) {
        throw new Error('calibration-report-state:nonreservation-row-duplicate');
      }
      seenNonReservationKeys.add(id);
    }

    const owned: Record<string, unknown> = { stage, profile, identity };
    if (startedAt !== undefined) owned['startedAt'] = startedAt;
    if (selectedProfile !== undefined) owned['selectedProfile'] = selectedProfile;
    if (pinnedModelVersion !== undefined) owned['pinnedModelVersion'] = pinnedModelVersion;
    owned['counts'] = Object.freeze({
      imageCallsReserved: reserved,
      imageCallsCompleted: completed,
      imageCallsFailed: failed,
      imageCallsPending: pending,
    });
    owned['images'] = Object.freeze(images);
    owned['nonReservations'] = Object.freeze(nonReservations);
    Object.freeze(owned);
    return owned as unknown as CalibrationStageReportSnapshot;
  } catch {
    return fatal('calibration:stage-report-state-invalid');
  }
}
