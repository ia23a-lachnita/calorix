/**
 * Task 6 Step 5: fail-closed calibration ledger, pure profile selection,
 * stage gates, and meal-only metric aggregation.
 *
 * The ledger holds a single canonical root and an exclusive `wx` lock for
 * the protocol's entire stage lifetime. Every image reservation key is
 * `(stage, profile, caseId, sampleIndex)`; the separately typed Stage 0
 * token-count key never shares that reservation space or its counters.
 * Persistence is always event-append then file-fsync then parent-dir-fsync,
 * and a result may complete only after its journal entry has been durably
 * written. All filesystem/lock/clock/liveness effects are injected via
 * `CalibrationLedgerDeps`; this module performs no real fs, `/proc`,
 * provider, Firebase, or network access.
 */
import { createHash } from 'crypto';
import { CalibrationFatalError } from './fatal-error';
import { CALIBRATION_PROTOCOL_VERSION } from './schema';
import type { NutritionCaseResult, NutritionPrediction } from './schema';
import { captureCalibrationReportJournalEntry } from './calibration-report-journal';
import {
  captureCalibrationNonReservationEntry,
  captureCalibrationNonReservationEvent,
  captureCalibrationStageReportSnapshot,
} from './calibration-report-state';
import type {
  CalibrationNonReservationEntry,
  CalibrationNonReservationOutcome,
  CalibrationPlannedReportOutcome,
  CalibrationProtocolReportOptions,
  CalibrationStageReportSnapshot,
} from './calibration-report-state';

// ── Identity / root constants ───────────────────────────────────────────────

export const CALIBRATION_ROOT =
  `.nutrition-eval/calibration/${CALIBRATION_PROTOCOL_VERSION}/` as const;

export const PLANNED_IMAGE_CALLS = 146;
export const HARD_CALL_CEILING = 300;

const FIXED_PROTOCOL_VERSION = 'v1';
const FIXED_PROVIDER = 'vertex-ai';
const FIXED_MODEL = 'gemini-3.8-flash';

// ── Shared types ─────────────────────────────────────────────────────────────

export type StageName = 'preflight' | 'development' | 'validation' | 'benchmark';

export type CalibrationProfile = 'LOW' | 'MEDIUM';

export type CalibrationLiveness = 'live' | 'dead' | 'unknown';

export interface ReservationKey {
  stage: StageName;
  profile: CalibrationProfile;
  caseId: string;
  sampleIndex: number;
}

export interface TokenCountReservationKey {
  kind: 'token_count';
  stage: StageName;
  caseId: string;
  model: string;
}

export interface CalibrationOwner {
  hostname: string;
  bootId: string;
  pid: number;
  startTicks: number;
  acquiredAt: string;
}

export interface CalibrationIdentity {
  protocolVersion: string;
  provider: string;
  model: string;
  implementationCommit: string;
  functionsTreeId: string;
  datasetHash: string;
  promptHash: string;
  responseSchemaHash: string;
  sourceLockHash: string;
  manifestHash: string;
  publicManifestHash: string;
  snapshotLockHash: string;
  historicalReferenceHash: string;
  plannedImageCalls: number;
  hardCeiling: number;
}

export type CalibrationSafeErrorCategory =
  | 'none'
  | 'http_400'
  | 'http_401'
  | 'http_403'
  | 'http_404'
  | 'http_408'
  | 'http_429'
  | 'http_other_4xx'
  | 'http_5xx'
  | 'timeout'
  | 'network'
  | 'empty_response'
  | 'interrupted_reservation'
  | 'unknown';

export type CalibrationLedgerSafeErrorEntry =
  | {
      readonly stage: 'preflight';
      readonly kind: 'token_count';
      readonly caseId: string;
      readonly errorCategory: CalibrationSafeErrorCategory;
    }
  | {
      readonly stage: 'preflight';
      readonly kind: 'image';
      readonly caseId: string;
      readonly profile: CalibrationProfile;
      readonly sampleIndex: 1;
      readonly errorCategory: CalibrationSafeErrorCategory;
    };

export interface JournalEntry {
  key: ReservationKey;
  predictionHash: string;
  normalizedPrediction: Record<string, unknown> | null;
  analysisLatencyMs: number;
  errorCategory: CalibrationSafeErrorCategory;
  responseModelVersion: string;
  reportPrediction?: NutritionPrediction;
}

export interface CalibrationLedgerDeps {
  getRoot: () => string;
  readLock: () => CalibrationOwner | undefined;
  writeLockExclusive: (owner: CalibrationOwner) => void;
  archiveLock: (owner: CalibrationOwner) => void;
  removeLock: (owner: CalibrationOwner) => void;
  appendLedgerEvent: (event: unknown) => void;
  fsyncLedgerFile: () => void;
  fsyncLedgerDir: () => void;
  appendJournal: (entry: JournalEntry) => void;
  fsyncJournalFile: () => void;
  fsyncJournalDir: () => void;
  probeOwnerLiveness: (owner: CalibrationOwner) => CalibrationLiveness;
  nowIso: () => string;
  readLedgerEvents: () => readonly unknown[];
  readJournalEntries: () => readonly JournalEntry[];
}

interface CalibrationGitState {
  headCommit: string;
  functionsTreeId: string;
  dirtyPaths: readonly string[];
}

export interface CalibrationStageGateSummary {
  stage: StageName;
  passed: boolean;
  completedStages: readonly StageName[];
}

interface CalibrationFailedReservation {
  key: ReservationKey;
  status: 'interrupted_reservation';
}

interface CalibrationRecoveryReport {
  interrupted: ReservationKey[];
  failed: CalibrationFailedReservation[];
  resumable: ReservationKey[];
}

export interface CalibrationLedger {
  acquireLock: (owner: CalibrationOwner, opts?: { runDir?: string }) => void;
  releaseLock: (owner: CalibrationOwner) => void;
  assertIdentity: (identity: CalibrationIdentity) => void;
  assertGitState: (state: CalibrationGitState) => void;
  assertStageTransition: (
    from: StageName,
    to: StageName,
    summary: CalibrationStageGateSummary,
  ) => void;
  reserve: (key: ReservationKey) => void;
  reserveSynthetic: (
    descriptor: { reason: string; index: number },
    onFatal: (error: unknown) => void,
  ) => void;
  reserveTokenCount: (key: TokenCountReservationKey) => void;
  completeTokenCount: (key: TokenCountReservationKey, count: number) => void;
  failTokenCount: (
    key: TokenCountReservationKey,
    errorCategory: CalibrationSafeErrorCategory,
  ) => void;
  getCounts: () => { tokenCountReserved: number; imageReserved: number };
  appendResultJournal: (entry: JournalEntry) => string;
  complete: (key: ReservationKey, journalHash: string) => void;
  rebuildReport: () => { completed: ReservationKey[] };
  recoverAfterCrash: () => CalibrationRecoveryReport;
  recordSafeError: (entry: CalibrationLedgerSafeErrorEntry) => void;
}

// ── Ledger internals ─────────────────────────────────────────────────────────

const IDENTITY_FIELDS: ReadonlyArray<keyof CalibrationIdentity> = [
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
];

const STAGE_ORDER: readonly StageName[] = [
  'preflight',
  'development',
  'validation',
  'benchmark',
];

const STAGE_SAMPLE_RANGE: Record<StageName, { min: number; max: number }> = {
  preflight: { min: 1, max: 1 },
  development: { min: 1, max: 1 },
  validation: { min: 1, max: 3 },
  benchmark: { min: 1, max: 3 },
};

function canonicalReservationKey(key: ReservationKey): string {
  return `${key.stage}|${key.profile}|${key.caseId}|${key.sampleIndex}`;
}

function canonicalTokenKey(key: TokenCountReservationKey): string {
  return `${key.kind}|${key.stage}|${key.caseId}|${key.model}`;
}

function sameOwner(left: CalibrationOwner, right: CalibrationOwner): boolean {
  return (
    left.hostname === right.hostname &&
    left.bootId === right.bootId &&
    left.pid === right.pid &&
    left.startTicks === right.startTicks &&
    left.acquiredAt === right.acquiredAt
  );
}

function isValidReservationKeyShape(key: ReservationKey): boolean {
  const range = STAGE_SAMPLE_RANGE[key.stage];
  if (range === undefined) return false;
  if (!Number.isInteger(key.sampleIndex)) return false;
  return key.sampleIndex >= range.min && key.sampleIndex <= range.max;
}

function computeJournalHash(entry: JournalEntry): string {
  return createHash('sha256').update(JSON.stringify(entry)).digest('hex');
}

function asFatal(error: unknown, message: string): CalibrationFatalError {
  if (error instanceof CalibrationFatalError) return error;
  return new CalibrationFatalError(message, { cause: error });
}

function isNonBlank(value: string): boolean {
  return value.trim().length > 0;
}

const NONBLANK_IDENTITY_FIELDS: ReadonlyArray<keyof CalibrationIdentity> = [
  'functionsTreeId',
  'implementationCommit',
  'datasetHash',
  'promptHash',
  'responseSchemaHash',
  'sourceLockHash',
  'manifestHash',
  'publicManifestHash',
  'snapshotLockHash',
  'historicalReferenceHash',
];

/**
 * Fail closed before any replay, lock, or reservation state is touched: a
 * new Gemini 2.5 (or any other non-fixed) identity must never reach this far.
 * Distinct from `ledger.assertIdentity`, which checks a later *candidate*
 * identity for drift against this already-fixed one.
 */
function assertFixedIdentity(identity: CalibrationIdentity): void {
  if (identity.protocolVersion !== FIXED_PROTOCOL_VERSION) {
    throw new CalibrationFatalError('calibration:identity-invalid:protocolVersion');
  }
  if (identity.provider !== FIXED_PROVIDER) {
    throw new CalibrationFatalError('calibration:identity-invalid:provider');
  }
  if (identity.model !== FIXED_MODEL) {
    throw new CalibrationFatalError('calibration:identity-invalid:model');
  }
  if (identity.plannedImageCalls !== PLANNED_IMAGE_CALLS) {
    throw new CalibrationFatalError('calibration:identity-invalid:plannedImageCalls');
  }
  if (identity.hardCeiling !== HARD_CALL_CEILING) {
    throw new CalibrationFatalError('calibration:identity-invalid:hardCeiling');
  }
  for (const field of NONBLANK_IDENTITY_FIELDS) {
    if (!isNonBlank(identity[field] as string)) {
      throw new CalibrationFatalError(`calibration:identity-invalid:${field}`);
    }
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidReservationKeyRecord(value: unknown): value is ReservationKey {
  if (!isPlainRecord(value)) return false;
  if (value.profile !== 'LOW' && value.profile !== 'MEDIUM') return false;
  if (typeof value.caseId !== 'string' || value.caseId.length === 0) return false;
  if (typeof value.stage !== 'string' || typeof value.sampleIndex !== 'number') return false;
  return isValidReservationKeyShape(value as unknown as ReservationKey);
}

function isValidTokenKeyRecord(value: unknown): value is TokenCountReservationKey {
  if (!isPlainRecord(value)) return false;
  return (
    value.kind === 'token_count' &&
    typeof value.stage === 'string' &&
    typeof value.caseId === 'string' &&
    value.caseId.trim().length > 0 &&
    typeof value.model === 'string'
  );
}

function isValidJournalEntryRecord(value: unknown): value is JournalEntry {
  if (!isPlainRecord(value)) return false;
  return (
    isValidReservationKeyRecord(value.key) &&
    typeof value.predictionHash === 'string' &&
    (value.normalizedPrediction === null || isPlainRecord(value.normalizedPrediction)) &&
    typeof value.analysisLatencyMs === 'number' &&
    Number.isFinite(value.analysisLatencyMs) &&
    typeof value.errorCategory === 'string' &&
    typeof value.responseModelVersion === 'string'
  );
}

const KNOWN_LEDGER_EVENT_TYPES = new Set([
  'reserved',
  'completed',
  'failed',
  'token_count_reserved',
  'token_count_completed',
  'token_count_failed',
  'safe_error',
  'lock_recovery',
  'synthetic_reserved',
]);

const TOKEN_TERMINAL_ERROR_CATEGORIES = new Set<CalibrationSafeErrorCategory>([
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

function isValidTokenCompletionCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isValidTokenFailureCategory(
  value: unknown,
): value is CalibrationSafeErrorCategory {
  return (
    typeof value === 'string' &&
    value !== 'none' &&
    TOKEN_TERMINAL_ERROR_CATEGORIES.has(value as CalibrationSafeErrorCategory)
  );
}

const SAFE_ERROR_CASE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const CANONICAL_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const TOKEN_SAFE_ENTRY_KEYS = ['stage', 'kind', 'caseId', 'errorCategory'] as const;
const TOKEN_SAFE_ENTRY_KEY_SET = new Set<string>(TOKEN_SAFE_ENTRY_KEYS);
const IMAGE_SAFE_ENTRY_KEYS = [
  'stage',
  'kind',
  'caseId',
  'profile',
  'sampleIndex',
  'errorCategory',
] as const;
const IMAGE_SAFE_ENTRY_KEY_SET = new Set<string>(IMAGE_SAFE_ENTRY_KEYS);
const SAFE_ERROR_EVENT_KEYS = ['type', 'entry', 'at'] as const;
const SAFE_ERROR_EVENT_KEY_SET = new Set<string>(SAFE_ERROR_EVENT_KEYS);

function assertCanonicalSafeErrorTimestamp(at: unknown): void {
  if (typeof at !== 'string' || !CANONICAL_ISO_PATTERN.test(at)) {
    throw new CalibrationFatalError('calibration:ledger-event-malformed:safe_error');
  }
  const parsed = Date.parse(at);
  if (!Number.isFinite(parsed)) {
    throw new CalibrationFatalError('calibration:ledger-event-malformed:safe_error');
  }
  if (new Date(at).toISOString() !== at) {
    throw new CalibrationFatalError('calibration:ledger-event-malformed:safe_error');
  }
}

function assertValidSafeErrorEntry(value: unknown): asserts value is CalibrationLedgerSafeErrorEntry {
  if (!isPlainRecord(value) || typeof value.kind !== 'string') {
    throw new CalibrationFatalError('calibration:ledger-event-malformed:safe_error');
  }
  if (value.kind === 'token_count') {
    const keys = Object.keys(value);
    if (
      keys.length !== TOKEN_SAFE_ENTRY_KEYS.length ||
      keys.some((key) => !TOKEN_SAFE_ENTRY_KEY_SET.has(key))
    ) {
      throw new CalibrationFatalError('calibration:ledger-event-malformed:safe_error');
    }
    if (value.stage !== 'preflight') {
      throw new CalibrationFatalError('calibration:ledger-event-malformed:safe_error');
    }
    if (typeof value.caseId !== 'string' || !SAFE_ERROR_CASE_ID_PATTERN.test(value.caseId)) {
      throw new CalibrationFatalError('calibration:ledger-event-malformed:safe_error');
    }
    if (!isValidTokenFailureCategory(value.errorCategory)) {
      throw new CalibrationFatalError('calibration:ledger-event-malformed:safe_error');
    }
    return;
  }
  if (value.kind === 'image') {
    const keys = Object.keys(value);
    if (
      keys.length !== IMAGE_SAFE_ENTRY_KEYS.length ||
      keys.some((key) => !IMAGE_SAFE_ENTRY_KEY_SET.has(key))
    ) {
      throw new CalibrationFatalError('calibration:ledger-event-malformed:safe_error');
    }
    if (value.stage !== 'preflight') {
      throw new CalibrationFatalError('calibration:ledger-event-malformed:safe_error');
    }
    if (typeof value.caseId !== 'string' || !SAFE_ERROR_CASE_ID_PATTERN.test(value.caseId)) {
      throw new CalibrationFatalError('calibration:ledger-event-malformed:safe_error');
    }
    if (value.profile !== 'LOW' && value.profile !== 'MEDIUM') {
      throw new CalibrationFatalError('calibration:ledger-event-malformed:safe_error');
    }
    if (value.sampleIndex !== 1) {
      throw new CalibrationFatalError('calibration:ledger-event-malformed:safe_error');
    }
    if (!isValidTokenFailureCategory(value.errorCategory)) {
      throw new CalibrationFatalError('calibration:ledger-event-malformed:safe_error');
    }
    return;
  }
  throw new CalibrationFatalError('calibration:ledger-event-malformed:safe_error');
}

function snapshotSafeErrorEntry(entry: unknown): Record<string, unknown> {
  let keys: string[];
  try {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new CalibrationFatalError('calibration:ledger-event-malformed:safe_error');
    }
    keys = Object.keys(entry);
  } catch (error) {
    if (error instanceof CalibrationFatalError) throw error;
    throw new CalibrationFatalError('calibration:ledger-event-malformed:safe_error');
  }
  const snapshot: Record<string, unknown> = Object.create(null);
  try {
    for (const key of keys) {
      snapshot[key] = (entry as Record<string, unknown>)[key];
    }
  } catch {
    throw new CalibrationFatalError('calibration:ledger-event-malformed:safe_error');
  }
  return snapshot;
}

function assertValidSafeErrorEvent(event: Record<string, unknown>): void {
  const keys = Object.keys(event);
  if (
    keys.length !== SAFE_ERROR_EVENT_KEYS.length ||
    keys.some((key) => !SAFE_ERROR_EVENT_KEY_SET.has(key))
  ) {
    throw new CalibrationFatalError('calibration:ledger-event-malformed:safe_error');
  }
  if (event.type !== 'safe_error') {
    throw new CalibrationFatalError('calibration:ledger-event-malformed:safe_error');
  }
  assertValidSafeErrorEntry(event.entry);
  assertCanonicalSafeErrorTimestamp(event.at);
}

interface ReservationRecord {
  key: ReservationKey;
  status: 'reserved' | 'completed' | 'interrupted_reservation';
  journalHash?: string;
}

interface TokenReservationState {
  key: TokenCountReservationKey;
  status: 'reserved' | 'completed' | 'failed' | 'poisoned';
}

// ── Strict protocol ledger (Task 7 Step 4a / protocol-metadata Task 2) ────────
// One shared private ledger core below serves both the legacy factory and the
// strict protocol factory; strict behavior is a mode of that core, never a
// duplicated parallel ledger.

export type CalibrationProfileSelectionReason =
  | 'fewer_unsafe'
  | 'higher_parse'
  | 'fewer_catastrophic'
  | 'lower_macro_error'
  | 'lower_kcal_error'
  | 'lower_latency'
  | 'default_medium_tie_breaker';

export type CalibrationKeyResolver = (
  selectedProfile?: CalibrationProfile,
) => readonly ReservationKey[];

export interface CalibrationCompletedReportPrediction {
  readonly key: ReservationKey;
  readonly prediction: NutritionPrediction;
}

export interface CalibrationProtocolLedger extends CalibrationLedger {
  pinModelVersion: (version: string) => void;
  getPinnedModelVersion: () => string | undefined;
  recordProfileSelection: (
    profile: CalibrationProfile,
    reason: CalibrationProfileSelectionReason,
    gateSummary: CalibrationStageGateSummary,
  ) => void;
  getSelectedProfile: () => CalibrationProfile | undefined;
  completeStage: (stage: StageName, gateSummary: CalibrationStageGateSummary) => void;
  getCompletedStages: () => readonly StageName[];
  getCompletedReportPredictions: () => readonly CalibrationCompletedReportPrediction[];
  recordNonReservationResult: (entry: CalibrationNonReservationEntry) => string;
  getStageReportSnapshot: (
    stage: StageName,
    profile: CalibrationProfile,
  ) => CalibrationStageReportSnapshot;
}

const STRICT_LEDGER_EVENT_TYPES: ReadonlySet<string> = new Set([
  'protocol_identity',
  'model_version_pinned',
  'profile_selected',
  'stage_completed',
]);

const SELECTION_REASONS: ReadonlySet<string> = new Set([
  'fewer_unsafe',
  'higher_parse',
  'fewer_catastrophic',
  'lower_macro_error',
  'lower_kcal_error',
  'lower_latency',
  'default_medium_tie_breaker',
]);

const STRICT_JOURNAL_ERROR_CATEGORIES: ReadonlySet<string> = new Set([
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

const MODEL_VERSION_PATTERN = /^[A-Za-z0-9_./-]{1,128}$/;
const STRICT_PREDICTION_HASH_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const STRICT_CASE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const HEX40_PATTERN = /^[0-9a-f]{40}$/;
const HEX64_PATTERN = /^[0-9a-f]{64}$/;

const HEX64_IDENTITY_FIELDS: ReadonlyArray<keyof CalibrationIdentity> = [
  'datasetHash',
  'promptHash',
  'responseSchemaHash',
  'sourceLockHash',
  'manifestHash',
  'publicManifestHash',
  'snapshotLockHash',
  'historicalReferenceHash',
];

const EXPECTED_STAGE_PREDECESSORS: Record<StageName, readonly StageName[]> = {
  preflight: [],
  development: ['preflight'],
  validation: ['preflight', 'development'],
  benchmark: ['preflight', 'development', 'validation'],
};

const STRICT_HEADER_KEYS: readonly string[] = ['type', 'identity', 'at'];
const STRICT_PIN_KEYS: readonly string[] = ['type', 'responseModelVersion', 'at'];
const STRICT_SELECTION_KEYS: readonly string[] = ['type', 'profile', 'reason', 'at'];
const STRICT_STAGE_KEYS: readonly string[] = ['type', 'stage', 'passed', 'at'];
const STRICT_RESERVED_KEYS: readonly string[] = ['type', 'key', 'at'];
const STRICT_COMPLETED_KEYS: readonly string[] = ['type', 'key', 'journalHash', 'at'];
const STRICT_FAILED_KEYS: readonly string[] = ['type', 'key', 'journalHash', 'at'];
const STRICT_TOKEN_RESERVED_KEYS: readonly string[] = ['type', 'key', 'at'];
const STRICT_TOKEN_COMPLETED_KEYS: readonly string[] = ['type', 'key', 'count', 'at'];
const STRICT_TOKEN_FAILED_KEYS: readonly string[] = ['type', 'key', 'errorCategory', 'at'];
const STRICT_LOCK_RECOVERY_KEYS: readonly string[] = [
  'type',
  'staleOwner',
  'recoveringOwner',
  'at',
];
const STRICT_JOURNAL_KEYS: readonly string[] = [
  'key',
  'predictionHash',
  'normalizedPrediction',
  'analysisLatencyMs',
  'errorCategory',
  'responseModelVersion',
];
const STRICT_RESERVATION_KEY_FIELDS: readonly string[] = [
  'stage',
  'profile',
  'caseId',
  'sampleIndex',
];
const STRICT_TOKEN_KEY_FIELDS: readonly string[] = ['kind', 'stage', 'caseId', 'model'];
const STRICT_GATE_SUMMARY_KEYS: readonly string[] = ['stage', 'passed', 'completedStages'];

const STRICT_INITIAL_KEY_COUNT = 50;
const STRICT_EXPANDED_KEY_COUNT = 146;
const STRICT_PREFLIGHT_KEY_COUNT = 2;
const STRICT_DEVELOPMENT_KEY_COUNT = 48;
const STRICT_VALIDATION_KEY_COUNT = 48;
const STRICT_BENCHMARK_KEY_COUNT = 48;
const STRICT_STAGE_TERMINAL_COUNT = 48;

/** Guarded clone of the 15 exact identity fields; never invokes caller toJSON. */
function cloneStrictIdentity(input: unknown): CalibrationIdentity {
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      throw new CalibrationFatalError('calibration:identity-invalid');
    }
    const record = input as Record<string, unknown>;
    const clone = {} as Record<string, unknown>;
    for (const field of IDENTITY_FIELDS) {
      clone[field] = record[field];
    }
    return clone as unknown as CalibrationIdentity;
  } catch {
    // Never trust a foreign typed error: any caller getter/callback failure
    // becomes a fresh static causeless fatal with no private payload.
    throw new CalibrationFatalError('calibration:identity-invalid');
  }
}

/** Fixed v1/vertex-ai/gemini-3.8-flash/146/300 plus exact lowercase hex binding. */
function assertExactStrictIdentity(identity: CalibrationIdentity): void {
  let values: Record<string, unknown>;
  try {
    values = {} as Record<string, unknown>;
    for (const field of IDENTITY_FIELDS) {
      values[field] = (identity as unknown as Record<string, unknown>)[field];
    }
  } catch {
    throw new CalibrationFatalError('calibration:identity-invalid');
  }
  if (values.protocolVersion !== FIXED_PROTOCOL_VERSION) {
    throw new CalibrationFatalError('calibration:identity-invalid:protocolVersion');
  }
  if (values.provider !== FIXED_PROVIDER) {
    throw new CalibrationFatalError('calibration:identity-invalid:provider');
  }
  if (values.model !== FIXED_MODEL) {
    throw new CalibrationFatalError('calibration:identity-invalid:model');
  }
  if (values.plannedImageCalls !== PLANNED_IMAGE_CALLS) {
    throw new CalibrationFatalError('calibration:identity-invalid:plannedImageCalls');
  }
  if (values.hardCeiling !== HARD_CALL_CEILING) {
    throw new CalibrationFatalError('calibration:identity-invalid:hardCeiling');
  }
  if (typeof values.implementationCommit !== 'string' || !HEX40_PATTERN.test(values.implementationCommit)) {
    throw new CalibrationFatalError('calibration:identity-invalid:implementationCommit');
  }
  if (typeof values.functionsTreeId !== 'string' || !HEX40_PATTERN.test(values.functionsTreeId)) {
    throw new CalibrationFatalError('calibration:identity-invalid:functionsTreeId');
  }
  for (const field of HEX64_IDENTITY_FIELDS) {
    const value = values[field];
    if (typeof value !== 'string' || !HEX64_PATTERN.test(value)) {
      throw new CalibrationFatalError(`calibration:identity-invalid:${field}`);
    }
  }
}

/** Guarded single-field read; foreign getter failures become static causeless. */
function readStrictField(
  record: Record<string, unknown>,
  field: string,
  label: string,
): unknown {
  try {
    return record[field];
  } catch {
    throw new CalibrationFatalError(`calibration:ledger-event-malformed:${label}`);
  }
}

/** Closed exact-keys envelope; order-insensitive, never serializes caller data. */
function assertStrictEnvelope(
  event: unknown,
  expectedKeys: readonly string[],
  label: string,
): Record<string, unknown> {
  try {
    if (typeof event !== 'object' || event === null || Array.isArray(event)) {
      throw new CalibrationFatalError(`calibration:ledger-event-malformed:${label}`);
    }
    const record = event as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.length !== expectedKeys.length) {
      throw new CalibrationFatalError(`calibration:ledger-event-malformed:${label}`);
    }
    for (const key of expectedKeys) {
      if (!Object.prototype.hasOwnProperty.call(record, key)) {
        throw new CalibrationFatalError(`calibration:ledger-event-malformed:${label}`);
      }
    }
    return record;
  } catch {
    throw new CalibrationFatalError(`calibration:ledger-event-malformed:${label}`);
  }
}

function assertCanonicalStrictTimestamp(at: unknown, label: string): void {
  try {
    if (typeof at !== 'string' || !CANONICAL_ISO_PATTERN.test(at)) {
      throw new CalibrationFatalError(`calibration:ledger-event-malformed:${label}`);
    }
    const parsed = Date.parse(at);
    if (!Number.isFinite(parsed)) {
      throw new CalibrationFatalError(`calibration:ledger-event-malformed:${label}`);
    }
    if (new Date(at).toISOString() !== at) {
      throw new CalibrationFatalError(`calibration:ledger-event-malformed:${label}`);
    }
  } catch {
    throw new CalibrationFatalError(`calibration:ledger-event-malformed:${label}`);
  }
}

/** Guarded reservation-key snapshot with exact fields and strict shape. */
function snapshotStrictReservationKey(value: unknown, _label: string): ReservationKey {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new CalibrationFatalError('calibration:reservation-invalid-shape');
    }
    const record = value as Record<string, unknown>;
    if (Object.keys(record).length !== STRICT_RESERVATION_KEY_FIELDS.length) {
      throw new CalibrationFatalError('calibration:reservation-invalid-shape');
    }
    for (const field of STRICT_RESERVATION_KEY_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(record, field)) {
        throw new CalibrationFatalError('calibration:reservation-invalid-shape');
      }
    }
    const stage = record.stage;
    const profile = record.profile;
    const caseId = record.caseId;
    const sampleIndex = record.sampleIndex;
    if (stage !== 'preflight' && stage !== 'development' && stage !== 'validation' && stage !== 'benchmark') {
      throw new CalibrationFatalError('calibration:reservation-invalid-shape');
    }
    if (profile !== 'LOW' && profile !== 'MEDIUM') {
      throw new CalibrationFatalError('calibration:reservation-invalid-shape');
    }
    if (typeof caseId !== 'string' || !STRICT_CASE_ID_PATTERN.test(caseId)) {
      throw new CalibrationFatalError('calibration:reservation-invalid-shape');
    }
    const range = STAGE_SAMPLE_RANGE[stage];
    if (range === undefined || typeof sampleIndex !== 'number' || !Number.isInteger(sampleIndex)) {
      throw new CalibrationFatalError('calibration:reservation-invalid-shape');
    }
    if (sampleIndex < range.min || sampleIndex > range.max) {
      throw new CalibrationFatalError('calibration:reservation-invalid-shape');
    }
    return { stage, profile, caseId, sampleIndex };
  } catch {
    throw new CalibrationFatalError('calibration:reservation-invalid-shape');
  }
}

function snapshotStrictTokenKey(value: unknown): TokenCountReservationKey {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new CalibrationFatalError('calibration:token-reservation-invalid-key');
    }
    const record = value as Record<string, unknown>;
    if (Object.keys(record).length !== STRICT_TOKEN_KEY_FIELDS.length) {
      throw new CalibrationFatalError('calibration:token-reservation-invalid-key');
    }
    for (const field of STRICT_TOKEN_KEY_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(record, field)) {
        throw new CalibrationFatalError('calibration:token-reservation-invalid-key');
      }
    }
    const kind = record.kind;
    const stage = record.stage;
    const caseId = record.caseId;
    const model = record.model;
    if (kind !== 'token_count') {
      throw new CalibrationFatalError('calibration:token-reservation-invalid-key');
    }
    if (typeof stage !== 'string' || typeof model !== 'string') {
      throw new CalibrationFatalError('calibration:token-reservation-invalid-key');
    }
    if (typeof caseId !== 'string' || caseId.trim().length === 0) {
      throw new CalibrationFatalError('calibration:token-reservation-invalid-key');
    }
    return { kind: 'token_count', stage: stage as StageName, caseId, model };
  } catch {
    throw new CalibrationFatalError('calibration:token-reservation-invalid-key');
  }
}

function snapshotStrictGateSummary(value: unknown, label: string): CalibrationStageGateSummary {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new CalibrationFatalError(`calibration:ledger-event-malformed:${label}`);
    }
    const record = value as Record<string, unknown>;
    if (Object.keys(record).length !== STRICT_GATE_SUMMARY_KEYS.length) {
      throw new CalibrationFatalError(`calibration:ledger-event-malformed:${label}`);
    }
    for (const field of STRICT_GATE_SUMMARY_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(record, field)) {
        throw new CalibrationFatalError(`calibration:ledger-event-malformed:${label}`);
      }
    }
    const stage = record.stage;
    const passed = record.passed;
    const completedStages = record.completedStages;
    if (stage !== 'preflight' && stage !== 'development' && stage !== 'validation' && stage !== 'benchmark') {
      throw new CalibrationFatalError(`calibration:ledger-event-malformed:${label}`);
    }
    if (passed !== true) {
      throw new CalibrationFatalError(`calibration:ledger-event-malformed:${label}`);
    }
    if (!Array.isArray(completedStages)) {
      throw new CalibrationFatalError(`calibration:ledger-event-malformed:${label}`);
    }
    const stages = completedStages as readonly unknown[];
    const count = stages.length;
    const snapshot: StageName[] = [];
    for (let index = 0; index < count; index += 1) {
      const entry = stages[index];
      if (entry !== 'preflight' && entry !== 'development' && entry !== 'validation' && entry !== 'benchmark') {
        throw new CalibrationFatalError(`calibration:ledger-event-malformed:${label}`);
      }
      snapshot.push(entry);
    }
    return { stage, passed: true, completedStages: snapshot };
  } catch {
    throw new CalibrationFatalError(`calibration:ledger-event-malformed:${label}`);
  }
}

/** Guarded full journal snapshot in canonical field order (hash-stable). */
function snapshotStrictJournalEntry(value: unknown): JournalEntry {
  let hasReportExtension = false;
  try {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, 'reportPrediction');
      if (descriptor !== undefined) {
        hasReportExtension = true;
      }
    }
  } catch {
    throw new CalibrationFatalError('calibration:journal-entry-malformed');
  }
  if (hasReportExtension) {
    return captureCalibrationReportJournalEntry(value);
  }
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new CalibrationFatalError('calibration:journal-entry-malformed');
    }
    const record = value as Record<string, unknown>;
    if (Object.keys(record).length !== STRICT_JOURNAL_KEYS.length) {
      throw new CalibrationFatalError('calibration:journal-entry-malformed:fields');
    }
    for (const field of STRICT_JOURNAL_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(record, field)) {
        throw new CalibrationFatalError('calibration:journal-entry-malformed:fields');
      }
    }
    const key = snapshotStrictReservationKey(record.key, 'journal');
    const predictionHash = record.predictionHash;
    if (typeof predictionHash !== 'string' || !STRICT_PREDICTION_HASH_PATTERN.test(predictionHash)) {
      throw new CalibrationFatalError('calibration:journal-entry-malformed:predictionHash');
    }
    const rawPrediction = record.normalizedPrediction;
    let normalizedPrediction: Record<string, unknown> | null = null;
    if (rawPrediction !== null) {
      if (typeof rawPrediction !== 'object' || Array.isArray(rawPrediction)) {
        throw new CalibrationFatalError('calibration:journal-privacy-rejected');
      }
      const predictionRecord = rawPrediction as Record<string, unknown>;
      const predictionKeys = Object.keys(predictionRecord);
      if (predictionKeys.length === 0) {
        throw new CalibrationFatalError('calibration:journal-privacy-rejected:empty');
      }
      const cloned: Record<string, unknown> = {};
      for (const name of predictionKeys) {
        if (
          name !== 'kcal' &&
          name !== 'calories' &&
          name !== 'proteinG' &&
          name !== 'carbsG' &&
          name !== 'fatG' &&
          name !== 'estimatedTotalMassG'
        ) {
          throw new CalibrationFatalError('calibration:journal-privacy-rejected');
        }
        const numeric = predictionRecord[name];
        if (typeof numeric !== 'number' || !Number.isFinite(numeric) || numeric < 0) {
          throw new CalibrationFatalError('calibration:journal-privacy-rejected');
        }
        cloned[name] = numeric;
      }
      normalizedPrediction = cloned;
    }
    const analysisLatencyMs = record.analysisLatencyMs;
    if (typeof analysisLatencyMs !== 'number' || !Number.isFinite(analysisLatencyMs) || analysisLatencyMs < 0) {
      throw new CalibrationFatalError('calibration:journal-entry-malformed:analysisLatencyMs');
    }
    const errorCategory = record.errorCategory;
    if (typeof errorCategory !== 'string' || !STRICT_JOURNAL_ERROR_CATEGORIES.has(errorCategory)) {
      throw new CalibrationFatalError('calibration:journal-entry-malformed:errorCategory');
    }
    const responseModelVersion = record.responseModelVersion;
    if (typeof responseModelVersion !== 'string' || !MODEL_VERSION_PATTERN.test(responseModelVersion)) {
      throw new CalibrationFatalError('calibration:journal-entry-malformed:responseModelVersion');
    }
    if (errorCategory === 'none') {
      if (!HEX64_PATTERN.test(predictionHash) || normalizedPrediction === null) {
        throw new CalibrationFatalError('calibration:journal-entry-malformed');
      }
    } else {
      if (
        predictionHash !== errorCategory ||
        normalizedPrediction !== null ||
        responseModelVersion !== 'n/a'
      ) {
        throw new CalibrationFatalError('calibration:journal-entry-malformed');
      }
    }
    return {
      key,
      predictionHash,
      normalizedPrediction,
      analysisLatencyMs,
      errorCategory: errorCategory as JournalEntry['errorCategory'],
      responseModelVersion,
    };
  } catch {
    throw new CalibrationFatalError('calibration:journal-entry-malformed');
  }
}

function snapshotStrictSafeErrorEntry(value: unknown): Record<string, unknown> {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new CalibrationFatalError('calibration:ledger-event-malformed:safe_error');
    }
    const record = value as Record<string, unknown>;
    const kind = record.kind;
    if (kind === 'token_count') {
      if (Object.keys(record).length !== TOKEN_SAFE_ENTRY_KEYS.length) {
        throw new CalibrationFatalError('calibration:ledger-event-malformed:safe_error');
      }
      for (const field of TOKEN_SAFE_ENTRY_KEYS) {
        if (!Object.prototype.hasOwnProperty.call(record, field)) {
          throw new CalibrationFatalError('calibration:ledger-event-malformed:safe_error');
        }
      }
      return {
        stage: record.stage,
        kind: 'token_count',
        caseId: record.caseId,
        errorCategory: record.errorCategory,
      };
    }
    if (kind === 'image') {
      if (Object.keys(record).length !== IMAGE_SAFE_ENTRY_KEYS.length) {
        throw new CalibrationFatalError('calibration:ledger-event-malformed:safe_error');
      }
      for (const field of IMAGE_SAFE_ENTRY_KEYS) {
        if (!Object.prototype.hasOwnProperty.call(record, field)) {
          throw new CalibrationFatalError('calibration:ledger-event-malformed:safe_error');
        }
      }
      return {
        stage: record.stage,
        kind: 'image',
        caseId: record.caseId,
        profile: record.profile,
        sampleIndex: record.sampleIndex,
        errorCategory: record.errorCategory,
      };
    }
    throw new CalibrationFatalError('calibration:ledger-event-malformed:safe_error');
  } catch {
    throw new CalibrationFatalError('calibration:ledger-event-malformed:safe_error');
  }
}

function snapshotStrictOwner(value: unknown): CalibrationOwner {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new CalibrationFatalError('calibration:lock-owner-invalid');
    }
    const record = value as Record<string, unknown>;
    const hostname = record.hostname;
    const bootId = record.bootId;
    const pid = record.pid;
    const startTicks = record.startTicks;
    const acquiredAt = record.acquiredAt;
    if (typeof hostname !== 'string' || hostname.trim().length === 0) {
      throw new CalibrationFatalError('calibration:lock-owner-invalid');
    }
    if (typeof bootId !== 'string' || bootId.trim().length === 0) {
      throw new CalibrationFatalError('calibration:lock-owner-invalid');
    }
    if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) {
      throw new CalibrationFatalError('calibration:lock-owner-invalid');
    }
    if (typeof startTicks !== 'number' || !Number.isFinite(startTicks) || startTicks < 0) {
      throw new CalibrationFatalError('calibration:lock-owner-invalid');
    }
    if (typeof acquiredAt !== 'string' || acquiredAt.length === 0) {
      throw new CalibrationFatalError('calibration:lock-owner-invalid');
    }
    return { hostname, bootId, pid, startTicks, acquiredAt };
  } catch {
    throw new CalibrationFatalError('calibration:lock-owner-invalid');
  }
}

function assertExactPredecessors(
  actual: readonly StageName[],
  expected: readonly StageName[],
  label: string,
): void {
  if (actual.length !== expected.length) {
    throw new CalibrationFatalError(`calibration:ledger-event-malformed:${label}`);
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (actual[index] !== expected[index]) {
      throw new CalibrationFatalError(`calibration:ledger-event-malformed:${label}`);
    }
  }
}

/** Dynamic resolver call with indexed (iterator-free) snapshot; all failures static. */
function invokeStrictResolver(
  keyResolver: CalibrationKeyResolver,
  selectedProfile: CalibrationProfile | undefined,
): ReservationKey[] {
  let result: unknown;
  try {
    result = keyResolver(selectedProfile);
  } catch {
    throw new CalibrationFatalError('calibration:resolver-failed');
  }
  try {
    if (!Array.isArray(result)) {
      throw new CalibrationFatalError('calibration:resolver-failed');
    }
    const items = result as readonly unknown[];
    const count = items.length;
    if (!Number.isInteger(count)) {
      throw new CalibrationFatalError('calibration:resolver-failed');
    }
    const snapshot: ReservationKey[] = [];
    for (let index = 0; index < count; index += 1) {
      snapshot.push(snapshotStrictReservationKey(items[index], 'resolver'));
    }
    return snapshot;
  } catch {
    throw new CalibrationFatalError('calibration:resolver-failed');
  }
}

function validateStrictInitialKeys(keys: readonly ReservationKey[]): void {
  if (keys.length !== STRICT_INITIAL_KEY_COUNT) {
    throw new CalibrationFatalError('calibration:resolver-invalid-keys');
  }
  const seen = new Set<string>();
  const preflightCaseIds = new Set<string>();
  const developmentLowCases = new Set<string>();
  const developmentMediumCases = new Set<string>();
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index] as ReservationKey;
    const id = canonicalReservationKey(key);
    if (seen.has(id)) {
      throw new CalibrationFatalError('calibration:resolver-invalid-keys');
    }
    seen.add(id);
    if (key.stage === 'preflight') {
      if (key.sampleIndex !== 1) {
        throw new CalibrationFatalError('calibration:resolver-invalid-keys');
      }
      preflightCaseIds.add(key.caseId);
    } else if (key.stage === 'development') {
      if (key.sampleIndex !== 1) {
        throw new CalibrationFatalError('calibration:resolver-invalid-keys');
      }
      if (key.profile === 'LOW') developmentLowCases.add(key.caseId);
      else developmentMediumCases.add(key.caseId);
    } else {
      throw new CalibrationFatalError('calibration:resolver-invalid-keys');
    }
  }
  // Both preflight keys name the same first development case; both
  // development profiles cover the same 24 case IDs.
  if (preflightCaseIds.size !== 1) {
    throw new CalibrationFatalError('calibration:resolver-invalid-keys');
  }
  if (developmentLowCases.size !== 24 || developmentMediumCases.size !== 24) {
    throw new CalibrationFatalError('calibration:resolver-invalid-keys');
  }
  for (const caseId of developmentLowCases) {
    if (!developmentMediumCases.has(caseId)) {
      throw new CalibrationFatalError('calibration:resolver-invalid-keys');
    }
  }
  for (const caseId of preflightCaseIds) {
    if (!developmentLowCases.has(caseId)) {
      throw new CalibrationFatalError('calibration:resolver-invalid-keys');
    }
  }
}

function validateStrictExpandedKeys(
  initial: readonly ReservationKey[],
  expanded: readonly ReservationKey[],
  selectedProfile: CalibrationProfile,
): void {
  if (expanded.length !== STRICT_EXPANDED_KEY_COUNT) {
    throw new CalibrationFatalError('calibration:resolver-invalid-keys');
  }
  const initialIds = new Set<string>();
  for (let index = 0; index < initial.length; index += 1) {
    initialIds.add(canonicalReservationKey(initial[index] as ReservationKey));
  }
  const seen = new Set<string>();
  let preflight = 0;
  let development = 0;
  let validation = 0;
  let benchmark = 0;
  const validationSamples = new Map<string, Set<number>>();
  const benchmarkSamples = new Map<string, Set<number>>();
  for (let index = 0; index < expanded.length; index += 1) {
    const key = expanded[index] as ReservationKey;
    const id = canonicalReservationKey(key);
    if (seen.has(id)) {
      throw new CalibrationFatalError('calibration:resolver-invalid-keys');
    }
    seen.add(id);
    if (key.stage === 'preflight') {
      preflight += 1;
    } else if (key.stage === 'development') {
      development += 1;
    } else if (key.stage === 'validation') {
      if (key.profile !== selectedProfile) {
        throw new CalibrationFatalError('calibration:resolver-invalid-keys');
      }
      validation += 1;
      let samples = validationSamples.get(key.caseId);
      if (samples === undefined) {
        samples = new Set();
        validationSamples.set(key.caseId, samples);
      }
      samples.add(key.sampleIndex);
    } else if (key.stage === 'benchmark') {
      if (key.profile !== selectedProfile) {
        throw new CalibrationFatalError('calibration:resolver-invalid-keys');
      }
      benchmark += 1;
      let samples = benchmarkSamples.get(key.caseId);
      if (samples === undefined) {
        samples = new Set();
        benchmarkSamples.set(key.caseId, samples);
      }
      samples.add(key.sampleIndex);
    } else {
      throw new CalibrationFatalError('calibration:resolver-invalid-keys');
    }
  }
  if (
    preflight !== STRICT_PREFLIGHT_KEY_COUNT ||
    development !== STRICT_DEVELOPMENT_KEY_COUNT ||
    validation !== STRICT_VALIDATION_KEY_COUNT ||
    benchmark !== STRICT_BENCHMARK_KEY_COUNT
  ) {
    throw new CalibrationFatalError('calibration:resolver-invalid-keys');
  }
  for (let index = 0; index < initial.length; index += 1) {
    if (!seen.has(canonicalReservationKey(initial[index] as ReservationKey))) {
      throw new CalibrationFatalError('calibration:resolver-invalid-keys');
    }
  }
  if (validationSamples.size !== 16 || benchmarkSamples.size !== 16) {
    throw new CalibrationFatalError('calibration:resolver-invalid-keys');
  }
  for (const samples of validationSamples.values()) {
    if (samples.size !== 3 || !samples.has(1) || !samples.has(2) || !samples.has(3)) {
      throw new CalibrationFatalError('calibration:resolver-invalid-keys');
    }
  }
  for (const samples of benchmarkSamples.values()) {
    if (samples.size !== 3 || !samples.has(1) || !samples.has(2) || !samples.has(3)) {
      throw new CalibrationFatalError('calibration:resolver-invalid-keys');
    }
  }
}

/**
 * Shared canonical interrupted-outcome predicate keeping the recovery writer
 * and strict replay aligned: marker plus category, null prediction, `n/a`
 * version, and zero latency. Operates on internal snapshots only.
 */
function isCanonicalInterruptedJournal(entry: JournalEntry): boolean {
  return (
    entry.errorCategory === 'interrupted_reservation' &&
    entry.predictionHash === 'interrupted_reservation' &&
    entry.normalizedPrediction === null &&
    entry.responseModelVersion === 'n/a' &&
    entry.analysisLatencyMs === 0
  );
}

/** Indexed (iterator-free) copy of a replay array; foreign read failures are static. */
function snapshotStrictReplayArray(value: unknown, message: string): unknown[] {
  try {
    if (!Array.isArray(value)) {
      throw new CalibrationFatalError(message);
    }
    const items = value as readonly unknown[];
    const count = items.length;
    if (!Number.isInteger(count) || count < 0) {
      throw new CalibrationFatalError(message);
    }
    const snapshot: unknown[] = [];
    for (let index = 0; index < count; index += 1) {
      snapshot.push(items[index]);
    }
    return snapshot;
  } catch {
    throw new CalibrationFatalError(message);
  }
}

const STRICT_EXPANDED_PLAN_ROW_COUNT = 158;
const CALIBRATION_REPORT_OPTIONS_KEYS: readonly string[] = ['getReportOutcomePlan'];
const CALIBRATION_PLAN_ROW_KEYS: readonly string[] = ['key', 'scanMode'];

/** New report boundaries never execute property getters or inspect foreign errors. */
function captureStrictReportRecord(
  value: unknown,
  fields: readonly string[],
  message: string,
): Record<string, unknown> {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new CalibrationFatalError(message);
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new CalibrationFatalError(message);
    }
    const keys = Reflect.ownKeys(value);
    if (keys.length !== fields.length || keys.some((key) => typeof key !== 'string' || !fields.includes(key))) {
      throw new CalibrationFatalError(message);
    }
    const owned: Record<string, unknown> = {};
    for (const field of fields) {
      const descriptor = Object.getOwnPropertyDescriptor(value, field);
      if (descriptor === undefined || descriptor.enumerable !== true || !('value' in descriptor)) {
        throw new CalibrationFatalError(message);
      }
      owned[field] = descriptor.value;
    }
    return owned;
  } catch {
    throw new CalibrationFatalError(message);
  }
}

function captureStrictReportArray(value: unknown): unknown[] {
  const message = 'calibration:report-outcome-plan-invalid';
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
      throw new CalibrationFatalError(message);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, 'length');
    const length: unknown = descriptor?.value;
    if (descriptor === undefined || descriptor.enumerable !== false ||
      typeof length !== 'number' || !Number.isInteger(length) ||
      (length !== STRICT_INITIAL_KEY_COUNT && length !== STRICT_EXPANDED_PLAN_ROW_COUNT)) {
      throw new CalibrationFatalError(message);
    }
    const keys = Reflect.ownKeys(value);
    if (keys.length !== length + 1 || keys.some((key) => typeof key !== 'string')) {
      throw new CalibrationFatalError(message);
    }
    const owned: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const item = Object.getOwnPropertyDescriptor(value, String(index));
      if (item === undefined || item.enumerable !== true || !('value' in item)) {
        throw new CalibrationFatalError(message);
      }
      owned.push(item.value);
    }
    return owned;
  } catch {
    throw new CalibrationFatalError(message);
  }
}

/** Descriptor-only exact single-callback capture; rejects hidden/symbol/extra fields. */
function captureStrictReportOptions(value: unknown): CalibrationProtocolReportOptions {
  const envelope = captureStrictReportRecord(value, CALIBRATION_REPORT_OPTIONS_KEYS, 'calibration:report-options-invalid');
  const callback = envelope.getReportOutcomePlan;
  if (typeof callback !== 'function') {
    throw new CalibrationFatalError('calibration:report-options-invalid');
  }
  return Object.freeze({ getReportOutcomePlan: callback as CalibrationProtocolReportOptions['getReportOutcomePlan'] });
}

/** Guarded single plan-row snapshot; reuses the existing reservation-key shape. */
function snapshotStrictPlanRow(
  value: unknown,
): { key: ReservationKey; scanMode: 'meal' | 'label' | 'barcode' } {
  const message = 'calibration:report-outcome-plan-invalid';
  const envelope = captureStrictReportRecord(value, CALIBRATION_PLAN_ROW_KEYS, message);
  const key = snapshotStrictReservationKey(
    captureStrictReportRecord(envelope.key, STRICT_RESERVATION_KEY_FIELDS, message),
    'report-outcome-plan-row',
  );
  const scanMode = envelope.scanMode;
  if (scanMode !== 'meal' && scanMode !== 'label' && scanMode !== 'barcode') {
    throw new CalibrationFatalError('calibration:report-outcome-plan-invalid');
  }
  return { key, scanMode };
}

/** Invokes the captured callback exactly once; any foreign throw becomes fresh static. */
function invokeStrictPlanCallback(
  callback: CalibrationProtocolReportOptions['getReportOutcomePlan'],
  selectedProfile: CalibrationProfile | undefined,
): Array<{ key: ReservationKey; scanMode: 'meal' | 'label' | 'barcode' }> {
  let result: unknown;
  try {
    result = callback(selectedProfile);
  } catch {
    throw new CalibrationFatalError('calibration:report-outcome-plan-invalid');
  }
  const rawRows = captureStrictReportArray(result);
  return rawRows.map((row) => snapshotStrictPlanRow(row));
}

/** Cardinality/uniqueness/image-key-correspondence proof for a captured plan. */
function validateStrictPlanRows(
  rows: readonly { key: ReservationKey; scanMode: 'meal' | 'label' | 'barcode' }[],
  expectedLength: number,
  imageKeys: readonly ReservationKey[],
  selectedProfile: CalibrationProfile | undefined,
  initialPlan?: readonly CalibrationPlannedReportOutcome[],
): void {
  if (rows.length !== expectedLength) {
    throw new CalibrationFatalError('calibration:report-outcome-plan-invalid');
  }
  const imageKeySet = new Set(imageKeys.map(canonicalReservationKey));
  const seen = new Set<string>();
  const nonBarcodeIds = new Set<string>();
  const benchmarkCases = new Map<string, { mode: 'meal' | 'label' | 'barcode'; samples: Set<number> }>();
  let barcodeCount = 0;
  for (const row of rows) {
    const id = canonicalReservationKey(row.key);
    if (seen.has(id)) {
      throw new CalibrationFatalError('calibration:report-outcome-plan-invalid');
    }
    seen.add(id);
    if (row.key.stage !== 'benchmark' && row.scanMode !== 'meal') {
      throw new CalibrationFatalError('calibration:report-outcome-plan-invalid');
    }
    if (row.key.stage === 'benchmark') {
      if (selectedProfile === undefined || row.key.profile !== selectedProfile) {
        throw new CalibrationFatalError('calibration:report-outcome-plan-invalid');
      }
      const existing = benchmarkCases.get(row.key.caseId);
      if (existing !== undefined && existing.mode !== row.scanMode) {
        throw new CalibrationFatalError('calibration:report-outcome-plan-invalid');
      }
      const group = existing ?? { mode: row.scanMode, samples: new Set<number>() };
      group.samples.add(row.key.sampleIndex);
      benchmarkCases.set(row.key.caseId, group);
    }
    if (row.scanMode === 'barcode') {
      barcodeCount += 1;
      if (
        selectedProfile === undefined ||
        row.key.stage !== 'benchmark' ||
        row.key.profile !== selectedProfile ||
        imageKeySet.has(id)
      ) {
        throw new CalibrationFatalError('calibration:report-outcome-plan-invalid');
      }
    } else {
      nonBarcodeIds.add(id);
      if (!imageKeySet.has(id)) {
        throw new CalibrationFatalError('calibration:report-outcome-plan-invalid');
      }
    }
  }
  const expectedBarcode = selectedProfile === undefined ? 0 : 12;
  if (barcodeCount !== expectedBarcode || nonBarcodeIds.size !== imageKeySet.size) {
    throw new CalibrationFatalError('calibration:report-outcome-plan-invalid');
  }
  if (selectedProfile !== undefined) {
    const modeCounts = { meal: 0, label: 0, barcode: 0 };
    for (const group of benchmarkCases.values()) {
      if (group.samples.size !== 3 || ![1, 2, 3].every((sample) => group.samples.has(sample))) {
        throw new CalibrationFatalError('calibration:report-outcome-plan-invalid');
      }
      modeCounts[group.mode] += 1;
    }
    if (modeCounts.meal !== 12 || modeCounts.label !== 4 || modeCounts.barcode !== 4 ||
      initialPlan === undefined || initialPlan.length !== STRICT_INITIAL_KEY_COUNT) {
      throw new CalibrationFatalError('calibration:report-outcome-plan-invalid');
    }
    for (let index = 0; index < initialPlan.length; index += 1) {
      const initial = initialPlan[index]!;
      const expanded = rows[index]!;
      if (canonicalReservationKey(initial.key) !== canonicalReservationKey(expanded.key) || initial.scanMode !== expanded.scanMode) {
        throw new CalibrationFatalError('calibration:report-outcome-plan-invalid');
      }
    }
  }
}

/** Freezes a validated plan into the owned public row shape. */
function freezeStrictPlanRows(
  rows: readonly { key: ReservationKey; scanMode: 'meal' | 'label' | 'barcode' }[],
): readonly CalibrationPlannedReportOutcome[] {
  const frozen = rows.map((row) => {
    const key = Object.freeze({ ...row.key });
    return Object.freeze({ key, scanMode: row.scanMode }) as unknown as CalibrationPlannedReportOutcome;
  });
  return Object.freeze(frozen);
}

/** Shared sample/source/reason association proof for one non-reservation outcome. */
function assertStrictNonReservationAssociation(
  entry: CalibrationNonReservationEntry,
  planRow: { key: ReservationKey; scanMode: 'meal' | 'label' | 'barcode' },
): void {
  const predictionRecord = entry.prediction as unknown as Record<string, unknown>;
  if (predictionRecord['sampleIndex'] !== entry.key.sampleIndex) {
    throw new CalibrationFatalError('calibration:non-reservation-sample-mismatch');
  }
  if (entry.reason === 'dataset') {
    if (
      planRow.scanMode === 'barcode' ||
      predictionRecord['source'] !== planRow.scanMode ||
      predictionRecord['parseStatus'] !== 'failure' ||
      predictionRecord['failureCategory'] !== 'dataset'
    ) {
      throw new CalibrationFatalError('calibration:non-reservation-dataset-invalid');
    }
    return;
  }
  if (planRow.scanMode !== 'barcode' || predictionRecord['source'] !== 'barcode') {
    throw new CalibrationFatalError('calibration:non-reservation-barcode-invalid');
  }
  const parseStatus = predictionRecord['parseStatus'];
  if (parseStatus === 'success') {
    return;
  }
  if (parseStatus === 'failure') {
    const failureCategory = predictionRecord['failureCategory'];
    const failureCode = predictionRecord['failureCode'];
    if (
      failureCategory === 'product' &&
      (failureCode === 'off_product_invalid' || failureCode === 'off_product_not_found')
    ) {
      return;
    }
  }
  throw new CalibrationFatalError('calibration:non-reservation-barcode-invalid');
}

export function createCalibrationLedger(
  deps: CalibrationLedgerDeps,
  identity: CalibrationIdentity,
  allowedKeys: readonly ReservationKey[],
): CalibrationLedger {
  return createLedgerCore(deps, identity, { allowedKeys });
}

export function createProtocolCalibrationLedger(
  deps: CalibrationLedgerDeps,
  identity: CalibrationIdentity,
  keyResolver: CalibrationKeyResolver,
  reportOptions?: CalibrationProtocolReportOptions,
): CalibrationProtocolLedger {
  return createLedgerCore(deps, identity, { keyResolver, reportOptions }) as CalibrationProtocolLedger;
}

function createLedgerCore(
  deps: CalibrationLedgerDeps,
  identityInput: CalibrationIdentity,
  init:
    | { allowedKeys: readonly ReservationKey[] }
    | { keyResolver: CalibrationKeyResolver; reportOptions?: CalibrationProtocolReportOptions | undefined },
): CalibrationLedger {
  const isStrict = !('allowedKeys' in init);
  const strictKeyResolver = isStrict
    ? (init as { keyResolver: CalibrationKeyResolver }).keyResolver
    : undefined;
  const rawReportOptions = isStrict
    ? (init as { reportOptions?: CalibrationProtocolReportOptions }).reportOptions
    : undefined;
  if (isStrict && typeof strictKeyResolver !== 'function') {
    throw new CalibrationFatalError('calibration:resolver-failed');
  }
  const reportOptions = isStrict && rawReportOptions !== undefined
    ? captureStrictReportOptions(rawReportOptions)
    : undefined;
  const identity = isStrict ? cloneStrictIdentity(identityInput) : identityInput;
  if (isStrict) {
    assertExactStrictIdentity(identity);
  } else {
    assertFixedIdentity(identity);
  }
  let initialAllowedKeys: ReservationKey[];
  if (isStrict) {
    const loaded = invokeStrictResolver(strictKeyResolver as CalibrationKeyResolver, undefined);
    validateStrictInitialKeys(loaded);
    initialAllowedKeys = loaded;
  } else {
    const provided = (init as { allowedKeys: readonly ReservationKey[] }).allowedKeys;
    if (provided.length > identity.plannedImageCalls) {
      throw new CalibrationFatalError('calibration:allowed-keys-exceed-planned-ceiling');
    }
    initialAllowedKeys = [...provided];
  }
  let currentAllowedKeys: ReservationKey[] = initialAllowedKeys.map((key) => ({ ...key }));
  let allowedKeySet = new Set(currentAllowedKeys.map(canonicalReservationKey));
  if (!isStrict && allowedKeySet.size !== initialAllowedKeys.length) {
    throw new CalibrationFatalError('calibration:allowed-keys-duplicate');
  }
  if (isStrict) {
    validateStrictInitialKeys(currentAllowedKeys);
    if (allowedKeySet.size !== currentAllowedKeys.length) {
      throw new CalibrationFatalError('calibration:resolver-invalid-keys');
    }
  }
  let plannedPreflightCaseIds = new Set(
    currentAllowedKeys.filter((key) => key.stage === 'preflight').map((key) => key.caseId),
  );
  let preflightLowId = '';
  let preflightMediumId = '';
  for (const key of currentAllowedKeys) {
    if (key.stage === 'preflight' && key.profile === 'LOW') {
      preflightLowId = canonicalReservationKey(key);
    }
    if (key.stage === 'preflight' && key.profile === 'MEDIUM') {
      preflightMediumId = canonicalReservationKey(key);
    }
  }
  let cachedInitialPlan: readonly CalibrationPlannedReportOutcome[] | undefined;
  let cachedExpandedPlan: readonly CalibrationPlannedReportOutcome[] | undefined;
  if (reportOptions !== undefined) {
    const initialRows = invokeStrictPlanCallback(reportOptions.getReportOutcomePlan, undefined);
    validateStrictPlanRows(initialRows, STRICT_INITIAL_KEY_COUNT, currentAllowedKeys, undefined);
    cachedInitialPlan = freezeStrictPlanRows(initialRows);
  }

  function assertPlannedSafeErrorEntry(entry: CalibrationLedgerSafeErrorEntry): void {
    if (entry.kind === 'token_count') {
      if (!plannedPreflightCaseIds.has(entry.caseId)) {
        throw new CalibrationFatalError('calibration:ledger-event-unplanned:safe_error');
      }
      return;
    }
    const id = canonicalReservationKey({
      stage: entry.stage,
      profile: entry.profile,
      caseId: entry.caseId,
      sampleIndex: entry.sampleIndex,
    });
    if (!allowedKeySet.has(id)) {
      throw new CalibrationFatalError('calibration:ledger-event-unplanned:safe_error');
    }
  }
  const reservations = new Map<string, ReservationRecord>();
  const reservationOrder: string[] = [];
  const journalHashesByKey = new Map<string, Set<string>>();
  const pendingJournalHashes = new Map<string, string>();
  const journalByHash = new Map<string, JournalEntry>();
  const nonReservationsByKey = new Map<string, CalibrationNonReservationOutcome>();
  const firstStageProfileAt = new Map<string, string>();
  let tokenCountReserved = 0;
  let imageReserved = 0;
  let tokenReservation: TokenReservationState | undefined;
  let heldOwner: CalibrationOwner | undefined;
  let poisoned = false;
  let pinnedModelVersion: string | undefined;
  let selectedProfile: CalibrationProfile | undefined;
  let selectedReason: CalibrationProfileSelectionReason | undefined;
  let completedStages: StageName[] = [];

  function throwPoisoned(): never {
    throw new CalibrationFatalError('calibration:ledger-poisoned');
  }

  function checkPoison(): void {
    if (poisoned) throwPoisoned();
  }

  function requireLock(): void {
    checkPoison();
    if (heldOwner === undefined) {
      throw new CalibrationFatalError('calibration:lock-not-held');
    }
  }

  function clearReplayState(): void {
    reservations.clear();
    reservationOrder.length = 0;
    journalHashesByKey.clear();
    pendingJournalHashes.clear();
    journalByHash.clear();
    nonReservationsByKey.clear();
    firstStageProfileAt.clear();
    tokenCountReserved = 0;
    imageReserved = 0;
    tokenReservation = undefined;
    pinnedModelVersion = undefined;
    selectedProfile = undefined;
    selectedReason = undefined;
    completedStages = [];
    currentAllowedKeys = initialAllowedKeys.map((key) => ({ ...key }));
    allowedKeySet = new Set(currentAllowedKeys.map(canonicalReservationKey));
    plannedPreflightCaseIds = new Set(
      currentAllowedKeys.filter((key) => key.stage === 'preflight').map((key) => key.caseId),
    );
  }

  // Stage 0's token-count key is fixed shape, not just well-typed: it must
  // name this ledger's own (already-validated) fixed model and the
  // `preflight` stage. Protocol v1 permits exactly one durable token-count
  // reservation ever, so this checks shape only; the single-reservation
  // invariant itself is enforced by the `tokenCountReserved` counter below.
  function isAllowedTokenKey(key: TokenCountReservationKey): boolean {
    return (
      key.kind === 'token_count' &&
      key.stage === 'preflight' &&
      typeof key.caseId === 'string' &&
      key.caseId.trim().length > 0 &&
      key.model === identity.model
    );
  }

  function indexJournalHash(id: string, hash: string): void {
    let set = journalHashesByKey.get(id);
    if (set === undefined) {
      set = new Set();
      journalHashesByKey.set(id, set);
    }
    set.add(hash);
  }

  function replayLedgerEvent(raw: unknown): void {
    if (!isPlainRecord(raw) || typeof raw.type !== 'string') {
      throw new CalibrationFatalError('calibration:ledger-event-malformed');
    }
    const event = raw;
    const type: string = raw.type;
    if (!isStrict && STRICT_LEDGER_EVENT_TYPES.has(type)) {
      throw new CalibrationFatalError('calibration:protocol-ledger-required');
    }
    if (!KNOWN_LEDGER_EVENT_TYPES.has(type)) {
      throw new CalibrationFatalError(`calibration:ledger-event-unknown-type:${type}`);
    }
    switch (type) {
      case 'reserved': {
        if (!isValidReservationKeyRecord(event.key)) {
          throw new CalibrationFatalError('calibration:ledger-event-malformed:reserved');
        }
        const key = event.key;
        const id = canonicalReservationKey(key);
        if (!allowedKeySet.has(id)) {
          throw new CalibrationFatalError('calibration:ledger-event-unplanned:reserved');
        }
        if (reservations.has(id)) {
          throw new CalibrationFatalError('calibration:ledger-event-duplicate:reserved');
        }
        reservations.set(id, { key, status: 'reserved' });
        reservationOrder.push(id);
        imageReserved += 1;
        break;
      }
      case 'completed': {
        if (
          !isValidReservationKeyRecord(event.key) ||
          typeof event.journalHash !== 'string' ||
          event.journalHash.length === 0
        ) {
          throw new CalibrationFatalError('calibration:ledger-event-malformed:completed');
        }
        const key = event.key;
        const journalHash = event.journalHash;
        const id = canonicalReservationKey(key);
        const record = reservations.get(id);
        if (record === undefined) {
          throw new CalibrationFatalError('calibration:ledger-event-out-of-order:completed');
        }
        if (record.status !== 'reserved') {
          throw new CalibrationFatalError(
            'calibration:ledger-event-invalid-transition:completed',
          );
        }
        const validHashes = journalHashesByKey.get(id);
        if (validHashes === undefined || !validHashes.has(journalHash)) {
          throw new CalibrationFatalError(
            'calibration:ledger-event-completed-missing-journal',
          );
        }
        record.status = 'completed';
        record.journalHash = journalHash;
        break;
      }
      case 'failed': {
        if (!isValidReservationKeyRecord(event.key)) {
          throw new CalibrationFatalError('calibration:ledger-event-malformed:failed');
        }
        const key = event.key;
        const id = canonicalReservationKey(key);
        const record = reservations.get(id);
        if (record === undefined) {
          throw new CalibrationFatalError('calibration:ledger-event-out-of-order:failed');
        }
        if (record.status !== 'reserved') {
          throw new CalibrationFatalError('calibration:ledger-event-invalid-transition:failed');
        }
        record.status = 'interrupted_reservation';
        break;
      }
      case 'token_count_reserved': {
        if (!isValidTokenKeyRecord(event.key)) {
          throw new CalibrationFatalError(
            'calibration:ledger-event-malformed:token_count_reserved',
          );
        }
        if (!isAllowedTokenKey(event.key)) {
          throw new CalibrationFatalError(
            'calibration:ledger-event-invalid-key:token_count_reserved',
          );
        }
        if (tokenCountReserved >= 1) {
          throw new CalibrationFatalError(
            'calibration:ledger-event-duplicate:token_count_reserved',
          );
        }
        tokenCountReserved += 1;
        tokenReservation = { key: event.key, status: 'reserved' };
        break;
      }
      case 'token_count_completed': {
        if (
          !isValidTokenKeyRecord(event.key) ||
          !isValidTokenCompletionCount(event.count)
        ) {
          throw new CalibrationFatalError(
            'calibration:ledger-event-malformed:token_count_completed',
          );
        }
        if (tokenReservation === undefined) {
          throw new CalibrationFatalError(
            'calibration:ledger-event-out-of-order:token_count_completed',
          );
        }
        if (canonicalTokenKey(tokenReservation.key) !== canonicalTokenKey(event.key)) {
          throw new CalibrationFatalError(
            'calibration:ledger-event-mismatched-key:token_count_completed',
          );
        }
        if (tokenReservation.status !== 'reserved') {
          throw new CalibrationFatalError(
            'calibration:ledger-event-invalid-transition:token_count_completed',
          );
        }
        tokenReservation.status = 'completed';
        break;
      }
      case 'token_count_failed': {
        if (
          !isValidTokenKeyRecord(event.key) ||
          !isValidTokenFailureCategory(event.errorCategory)
        ) {
          throw new CalibrationFatalError(
            'calibration:ledger-event-malformed:token_count_failed',
          );
        }
        if (tokenReservation === undefined) {
          throw new CalibrationFatalError(
            'calibration:ledger-event-out-of-order:token_count_failed',
          );
        }
        if (canonicalTokenKey(tokenReservation.key) !== canonicalTokenKey(event.key)) {
          throw new CalibrationFatalError(
            'calibration:ledger-event-mismatched-key:token_count_failed',
          );
        }
        if (tokenReservation.status !== 'reserved') {
          throw new CalibrationFatalError(
            'calibration:ledger-event-invalid-transition:token_count_failed',
          );
        }
        tokenReservation.status = 'failed';
        break;
      }
      case 'safe_error': {
        assertValidSafeErrorEvent(event);
        assertPlannedSafeErrorEntry(event.entry as CalibrationLedgerSafeErrorEntry);
        break;
      }
      case 'lock_recovery':
      case 'synthetic_reserved':
        // Recognized as legitimate audit-only events written by this module;
        // they carry no reservation/journal state to reconstruct.
        break;
      default:
        break;
    }
  }

  // Shared construction + under-lock authoritative replay. Clears ALL
  // replay state first so no stale partial memory survives, then rereads
  // journal/events exactly once. Initial construction calls this directly
  // (read-only, error behavior compatible); under-lock acquisition wraps it
  // in refreshUnderLock for permanent poison on ANY failure.
  function resetAndReplay(): { eventCount: number; journalCount: number } {
    clearReplayState();
    let replayJournalEntries: readonly unknown[];
    try {
      const result = deps.readJournalEntries();
      if (!Array.isArray(result)) {
        throw new CalibrationFatalError('calibration:journal-replay-not-array');
      }
      replayJournalEntries = result;
    } catch (error) {
      if (isStrict) {
        throw new CalibrationFatalError('calibration:journal-replay-read-failed');
      }
      throw asFatal(error, 'calibration:journal-replay-read-failed');
    }
    let journalItems: readonly unknown[] = replayJournalEntries;
    if (isStrict) {
      journalItems = snapshotStrictReplayArray(
        replayJournalEntries,
        'calibration:journal-replay-read-failed',
      );
      for (let index = 0; index < journalItems.length; index += 1) {
        strictIndexReplayJournal(journalItems[index]);
      }
    } else {
      for (const entry of replayJournalEntries as readonly JournalEntry[]) {
        if (!isValidJournalEntryRecord(entry)) {
          throw new CalibrationFatalError('calibration:journal-entry-malformed');
        }
        indexJournalHash(canonicalReservationKey(entry.key), computeJournalHash(entry));
      }
    }

    let replayLedgerEvents: readonly unknown[];
    try {
      const result = deps.readLedgerEvents();
      if (!Array.isArray(result)) {
        throw new CalibrationFatalError('calibration:ledger-replay-not-array');
      }
      replayLedgerEvents = result;
    } catch (error) {
      if (isStrict) {
        throw new CalibrationFatalError('calibration:ledger-replay-read-failed');
      }
      throw asFatal(error, 'calibration:ledger-replay-read-failed');
    }
    if (isStrict) {
      const eventItems = snapshotStrictReplayArray(
        replayLedgerEvents,
        'calibration:ledger-replay-read-failed',
      );
      if (eventItems.length === 0) {
        if (journalItems.length > 0) {
          throw new CalibrationFatalError('calibration:ledger-header-missing');
        }
      } else {
        strictValidateHeaderEvent(eventItems[0]);
        for (let index = 1; index < eventItems.length; index += 1) {
          strictReplayLedgerEvent(eventItems[index]);
        }
      }
      strictValidateJournalVersions();
      strictAssertJournalKeysReconciled();
      return { eventCount: eventItems.length, journalCount: journalItems.length };
    }
    for (const event of replayLedgerEvents) {
      replayLedgerEvent(event);
    }
    return { eventCount: replayLedgerEvents.length, journalCount: journalItems.length };
  }

  // Authoritative refresh under exclusive ownership. ANY failure (foreign
  // I/O, corrupt events, or malicious typed fatals) permanently poisons the
  // instance with a fresh static causeless fatal; the held lock is retained.
  function refreshUnderLock(): void {
    try {
      const counts = resetAndReplay();
      if (isStrict && counts.eventCount === 0 && counts.journalCount === 0) {
        // Durably initialize the header exactly once; in-memory state is
        // already empty and consistent, so no second reread follows.
        persistLedgerEvent(strictProtocolIdentityEvent());
      }
    } catch {
      poisoned = true;
      throw new CalibrationFatalError('calibration:ledger-poisoned');
    }
  }

  resetAndReplay();

  function safeReadLock(): CalibrationOwner | undefined {
    try {
      return deps.readLock();
    } catch (error) {
      if (isStrict) {
        throw new CalibrationFatalError('calibration:lock-read-failed');
      }
      throw asFatal(error, 'calibration:lock-read-failed');
    }
  }

  function safeWriteLockExclusive(owner: CalibrationOwner): void {
    try {
      deps.writeLockExclusive(owner);
    } catch (error) {
      if (isStrict) {
        throw new CalibrationFatalError('calibration:lock-write-failed');
      }
      throw asFatal(error, 'calibration:lock-write-failed');
    }
  }

  function safeArchiveLock(owner: CalibrationOwner): void {
    try {
      deps.archiveLock(owner);
    } catch (error) {
      if (isStrict) {
        throw new CalibrationFatalError('calibration:lock-archive-failed');
      }
      throw asFatal(error, 'calibration:lock-archive-failed');
    }
  }

  function safeRemoveLock(owner: CalibrationOwner): void {
    try {
      deps.removeLock(owner);
    } catch (error) {
      if (isStrict) {
        throw new CalibrationFatalError('calibration:lock-remove-failed');
      }
      throw asFatal(error, 'calibration:lock-remove-failed');
    }
  }

  function safeProbeOwnerLiveness(owner: CalibrationOwner): CalibrationLiveness {
    try {
      return deps.probeOwnerLiveness(owner);
    } catch (error) {
      if (isStrict) {
        throw new CalibrationFatalError('calibration:lock-probe-failed');
      }
      throw asFatal(error, 'calibration:lock-probe-failed');
    }
  }

  function persistLedgerEvent(event: unknown): void {
    if (isStrict) {
      strictPersistLedgerEvent(event);
      return;
    }
    try {
      deps.appendLedgerEvent(event);
      deps.fsyncLedgerFile();
      deps.fsyncLedgerDir();
    } catch (error) {
      throw asFatal(error, 'calibration:ledger-persist-failed');
    }
  }

  function strictPersistLedgerEvent(event: unknown): void {
    try {
      deps.appendLedgerEvent(event);
      deps.fsyncLedgerFile();
      deps.fsyncLedgerDir();
    } catch {
      poisoned = true;
      throw new CalibrationFatalError('calibration:ledger-persist-failed');
    }
  }

  function strictPersistJournal(entry: JournalEntry): void {
    try {
      deps.appendJournal(entry);
      deps.fsyncJournalFile();
      deps.fsyncJournalDir();
    } catch {
      poisoned = true;
      throw new CalibrationFatalError('calibration:journal-persist-failed');
    }
  }

  function strictNowIso(): string {
    let at: unknown;
    try {
      at = deps.nowIso();
    } catch {
      throw new CalibrationFatalError('calibration:clock-failed');
    }
    assertCanonicalStrictTimestamp(at, 'clock');
    return at as string;
  }

  function persistFailureJournal(key: ReservationKey): string {
    const entry: JournalEntry = {
      key,
      predictionHash: 'interrupted_reservation',
      normalizedPrediction: null,
      analysisLatencyMs: 0,
      errorCategory: 'interrupted_reservation',
      responseModelVersion: 'n/a',
    };
    const hash = computeJournalHash(entry);
    try {
      deps.appendJournal(entry);
      deps.fsyncJournalFile();
      deps.fsyncJournalDir();
    } catch (error) {
      throw asFatal(error, 'calibration:journal-persist-failed');
    }
    return hash;
  }

  function acquireLock(owner: CalibrationOwner, opts?: { runDir?: string }): void {
    checkPoison();
    if (isStrict) {
      owner = snapshotStrictOwner(owner);
    }
    if (heldOwner !== undefined) {
      throw new CalibrationFatalError('calibration:lock-already-held');
    }
    let effectiveRoot: unknown;
    if (isStrict) {
      try {
        effectiveRoot = opts?.runDir ?? deps.getRoot();
      } catch {
        throw new CalibrationFatalError('calibration:root-redirected');
      }
    } else {
      effectiveRoot = opts?.runDir ?? deps.getRoot();
    }
    if (effectiveRoot !== CALIBRATION_ROOT) {
      throw new CalibrationFatalError('calibration:root-redirected');
    }
    const existing = safeReadLock();
    if (existing === undefined) {
      safeWriteLockExclusive(owner);
      heldOwner = owner;
      refreshUnderLock();
      return;
    }
    // Strict: snapshot the stale owner into fresh closed five-field data
    // before any comparison, liveness probe, or audit persistence. Harmless
    // extra properties and non-enumerable toJSON hooks are dropped, never
    // invoked or copied; foreign getter failures are fresh static causeless.
    const staleOwner = isStrict ? snapshotStrictOwner(existing) : existing;
    if (staleOwner.hostname !== owner.hostname || staleOwner.bootId !== owner.bootId) {
      throw new CalibrationFatalError('calibration:lock-cross-host');
    }
    const liveness = safeProbeOwnerLiveness(staleOwner);
    if (isStrict && liveness !== 'live' && liveness !== 'dead' && liveness !== 'unknown') {
      throw new CalibrationFatalError('calibration:lock-held-unknown');
    }
    if (liveness !== 'dead') {
      throw new CalibrationFatalError(`calibration:lock-held-${liveness}`);
    }
    safeArchiveLock(staleOwner);
    safeWriteLockExclusive(owner);
    heldOwner = owner;
    refreshUnderLock();
    if (isStrict) {
      persistLedgerEvent({
        type: 'lock_recovery',
        staleOwner,
        recoveringOwner: owner,
        at: strictNowIso(),
      });
      return;
    }
    persistLedgerEvent({
      type: 'lock_recovery',
      staleOwner: existing,
      recoveringOwner: owner,
      at: deps.nowIso(),
    });
  }

  function releaseLock(owner: CalibrationOwner): void {
    checkPoison();
    if (isStrict) {
      owner = snapshotStrictOwner(owner);
    }
    if (heldOwner === undefined || !sameOwner(heldOwner, owner)) {
      throw new CalibrationFatalError('calibration:lock-release-foreign-owner');
    }
    safeRemoveLock(heldOwner);
    heldOwner = undefined;
  }

  function assertIdentity(candidate: CalibrationIdentity): void {
    checkPoison();
    if (isStrict) {
      strictAssertIdentity(candidate);
      return;
    }
    for (const field of IDENTITY_FIELDS) {
      if (candidate[field] !== identity[field]) {
        throw new CalibrationFatalError(`calibration:identity-drift:${field}`);
      }
    }
  }

  function assertGitState(state: CalibrationGitState): void {
    checkPoison();
    if (isStrict) {
      strictAssertGitState(state);
      return;
    }
    if (state.dirtyPaths.length > 0) {
      throw new CalibrationFatalError('calibration:git-dirty-tree');
    }
    if (state.functionsTreeId !== identity.functionsTreeId) {
      throw new CalibrationFatalError('calibration:git-tree-drift');
    }
  }

  function assertStageTransition(
    from: StageName,
    to: StageName,
    summary: CalibrationStageGateSummary,
  ): void {
    checkPoison();
    requireLock();
    if (isStrict) {
      strictAssertStageTransition(from, to, summary);
      return;
    }
    if (summary.stage !== from) {
      throw new CalibrationFatalError('calibration:stage-summary-mismatch');
    }
    if (!summary.passed) {
      throw new CalibrationFatalError(`calibration:stage-gate-failed:${from}`);
    }
    if (!summary.completedStages.includes(from)) {
      throw new CalibrationFatalError('calibration:stage-not-completed');
    }
    const fromIndex = STAGE_ORDER.indexOf(from);
    const toIndex = STAGE_ORDER.indexOf(to);
    if (fromIndex === -1 || toIndex === -1 || toIndex !== fromIndex + 1) {
      throw new CalibrationFatalError('calibration:stage-transition-invalid');
    }
  }

  function reserve(key: ReservationKey): void {
    checkPoison();
    requireLock();
    if (isStrict) {
      strictReserve(key);
      return;
    }
    if (!isValidReservationKeyShape(key)) {
      throw new CalibrationFatalError('calibration:reservation-invalid-shape');
    }
    const id = canonicalReservationKey(key);
    if (!allowedKeySet.has(id)) {
      throw new CalibrationFatalError('calibration:reservation-unplanned');
    }
    if (reservations.has(id)) {
      throw new CalibrationFatalError('calibration:reservation-duplicate');
    }
    if (imageReserved + 1 > HARD_CALL_CEILING) {
      throw new CalibrationFatalError('calibration:reservation-ceiling-exceeded');
    }
    reservations.set(id, { key, status: 'reserved' });
    reservationOrder.push(id);
    persistLedgerEvent({ type: 'reserved', key, at: deps.nowIso() });
    imageReserved += 1;
  }

  function reserveSynthetic(
    descriptor: { reason: string; index: number },
    onFatal: (error: unknown) => void,
  ): void {
    checkPoison();
    requireLock();
    if (isStrict) {
      throw new CalibrationFatalError('calibration:synthetic-unsupported');
    }
    const attemptNumber = descriptor.index + 1;
    if (attemptNumber > HARD_CALL_CEILING) {
      throw new CalibrationFatalError(
        `calibration:ceiling-exceeded:${descriptor.reason}`,
      );
    }
    try {
      persistLedgerEvent({
        type: 'synthetic_reserved',
        reason: descriptor.reason,
        index: descriptor.index,
        at: deps.nowIso(),
      });
    } catch (error) {
      onFatal(error);
      throw error;
    }
  }

  function reserveTokenCount(key: TokenCountReservationKey): void {
    checkPoison();
    requireLock();
    if (isStrict) {
      strictReserveTokenCount(key);
      return;
    }
    if (!isAllowedTokenKey(key)) {
      throw new CalibrationFatalError('calibration:token-reservation-invalid-key');
    }
    if (tokenCountReserved >= 1) {
      throw new CalibrationFatalError('calibration:token-reservation-duplicate');
    }
    persistLedgerEvent({ type: 'token_count_reserved', key, at: deps.nowIso() });
    tokenCountReserved += 1;
    tokenReservation = { key, status: 'reserved' };
  }

  function requireReservedTokenKey(key: TokenCountReservationKey): void {
    if (tokenReservation === undefined) {
      throw new CalibrationFatalError('calibration:token-terminal-not-reserved');
    }
    if (canonicalTokenKey(tokenReservation.key) !== canonicalTokenKey(key)) {
      throw new CalibrationFatalError('calibration:token-terminal-key-mismatch');
    }
    if (tokenReservation.status !== 'reserved') {
      throw new CalibrationFatalError('calibration:token-terminal-already-finalized');
    }
  }

  function persistTokenTerminalEvent(event: unknown, key: TokenCountReservationKey): void {
    try {
      deps.appendLedgerEvent(event);
      deps.fsyncLedgerFile();
      deps.fsyncLedgerDir();
    } catch {
      if (isStrict) {
        poisoned = true;
        throw new CalibrationFatalError('calibration:token-terminal-persist-failed');
      }
      if (tokenReservation !== undefined && canonicalTokenKey(tokenReservation.key) === canonicalTokenKey(key)) {
        tokenReservation.status = 'poisoned';
      }
      throw new CalibrationFatalError('calibration:token-terminal-persist-failed');
    }
  }

  function completeTokenCount(key: TokenCountReservationKey, count: number): void {
    checkPoison();
    requireLock();
    if (isStrict) {
      strictCompleteTokenCount(key, count);
      return;
    }
    requireReservedTokenKey(key);
    if (!isValidTokenCompletionCount(count)) {
      throw new CalibrationFatalError('calibration:token-terminal-invalid-count');
    }
    persistTokenTerminalEvent(
      { type: 'token_count_completed', key, count, at: deps.nowIso() },
      key,
    );
    if (tokenReservation !== undefined) {
      tokenReservation.status = 'completed';
    }
  }

  function failTokenCount(
    key: TokenCountReservationKey,
    errorCategory: CalibrationSafeErrorCategory,
  ): void {
    checkPoison();
    requireLock();
    if (isStrict) {
      strictFailTokenCount(key, errorCategory);
      return;
    }
    requireReservedTokenKey(key);
    if (!isValidTokenFailureCategory(errorCategory)) {
      throw new CalibrationFatalError('calibration:token-terminal-invalid-category');
    }
    persistTokenTerminalEvent(
      { type: 'token_count_failed', key, errorCategory, at: deps.nowIso() },
      key,
    );
    if (tokenReservation !== undefined) {
      tokenReservation.status = 'failed';
    }
  }

  function getCounts(): { tokenCountReserved: number; imageReserved: number } {
    checkPoison();
    return { tokenCountReserved, imageReserved };
  }

  function recordSafeError(entry: CalibrationLedgerSafeErrorEntry): void {
    checkPoison();
    requireLock();
    if (isStrict) {
      strictRecordSafeError(entry);
      return;
    }
    const snapshot = snapshotSafeErrorEntry(entry);
    assertValidSafeErrorEntry(snapshot);
    assertPlannedSafeErrorEntry(snapshot as CalibrationLedgerSafeErrorEntry);
    const at = deps.nowIso();
    assertCanonicalSafeErrorTimestamp(at);
    persistLedgerEvent({ type: 'safe_error', entry: snapshot, at });
  }

  function appendResultJournal(entry: JournalEntry): string {
    checkPoison();
    requireLock();
    if (isStrict) {
      return strictAppendResultJournal(entry);
    }
    const id = canonicalReservationKey(entry.key);
    const record = reservations.get(id);
    if (record === undefined || record.status !== 'reserved') {
      throw new CalibrationFatalError('calibration:journal-not-reserved');
    }
    if (pendingJournalHashes.has(id)) {
      throw new CalibrationFatalError('calibration:journal-duplicate');
    }
    const hash = computeJournalHash(entry);
    try {
      deps.appendJournal(entry);
      deps.fsyncJournalFile();
      deps.fsyncJournalDir();
    } catch (error) {
      throw asFatal(error, 'calibration:journal-persist-failed');
    }
    pendingJournalHashes.set(id, hash);
    indexJournalHash(id, hash);
    return hash;
  }

  function complete(key: ReservationKey, journalHash: string): void {
    checkPoison();
    requireLock();
    if (isStrict) {
      strictComplete(key, journalHash);
      return;
    }
    const id = canonicalReservationKey(key);
    const record = reservations.get(id);
    if (record === undefined || record.status !== 'reserved') {
      throw new CalibrationFatalError('calibration:complete-not-reserved');
    }
    const expectedHash = pendingJournalHashes.get(id);
    if (expectedHash === undefined || expectedHash !== journalHash) {
      throw new CalibrationFatalError('calibration:complete-missing-journal');
    }
    persistLedgerEvent({ type: 'completed', key, journalHash, at: deps.nowIso() });
    record.status = 'completed';
    record.journalHash = journalHash;
    pendingJournalHashes.delete(id);
  }

  function rebuildReport(): { completed: ReservationKey[] } {
    checkPoison();
    const completed: ReservationKey[] = [];
    for (const id of reservationOrder) {
      const record = reservations.get(id);
      if (record === undefined || record.status !== 'completed') continue;
      if (record.journalHash === undefined) continue;
      const validHashes = journalHashesByKey.get(id);
      if (validHashes === undefined || !validHashes.has(record.journalHash)) continue;
      completed.push(isStrict ? { ...record.key } : record.key);
    }
    return { completed };
  }

  function recoverAfterCrash(): CalibrationRecoveryReport {
    checkPoison();
    requireLock();
    if (isStrict) {
      return strictRecoverAfterCrash();
    }
    const interrupted: ReservationKey[] = [];
    const failed: CalibrationFailedReservation[] = [];
    for (const id of reservationOrder) {
      const record = reservations.get(id);
      if (record === undefined || record.status !== 'reserved') continue;
      const journalHash = persistFailureJournal(record.key);
      persistLedgerEvent({
        type: 'failed',
        key: record.key,
        status: 'interrupted_reservation',
        journalHash,
        at: deps.nowIso(),
      });
      record.status = 'interrupted_reservation';
      interrupted.push(record.key);
      failed.push({ key: record.key, status: 'interrupted_reservation' });
    }
    const resumable = currentAllowedKeys.filter(
      (key) => !reservations.has(canonicalReservationKey(key)),
    );
    return { interrupted, failed, resumable: [...resumable] };
  }

  // ── Strict protocol closures (shared core state, static causeless errors) ──

  function strictProtocolIdentityEvent(): Record<string, unknown> {
    const snapshot = {} as Record<string, unknown>;
    for (const field of IDENTITY_FIELDS) {
      snapshot[field] = (identity as unknown as Record<string, unknown>)[field];
    }
    return { type: 'protocol_identity', identity: snapshot, at: strictNowIso() };
  }

  function strictAssertIdentity(candidate: unknown): void {
    const snapshot = cloneStrictIdentity(candidate);
    for (const field of IDENTITY_FIELDS) {
      if (
        (snapshot as unknown as Record<string, unknown>)[field] !==
        (identity as unknown as Record<string, unknown>)[field]
      ) {
        throw new CalibrationFatalError(`calibration:identity-drift:${field}`);
      }
    }
  }

  function strictAssertGitState(state: unknown): void {
    let dirtyCount = 0;
    let treeId: unknown;
    try {
      if (typeof state !== 'object' || state === null || Array.isArray(state)) {
        throw new CalibrationFatalError('calibration:git-invalid');
      }
      const record = state as Record<string, unknown>;
      const dirtyPaths = record.dirtyPaths;
      if (!Array.isArray(dirtyPaths)) {
        throw new CalibrationFatalError('calibration:git-dirty-tree');
      }
      dirtyCount = (dirtyPaths as readonly unknown[]).length;
      treeId = record.functionsTreeId;
    } catch {
      throw new CalibrationFatalError('calibration:git-invalid');
    }
    if (dirtyCount > 0) {
      throw new CalibrationFatalError('calibration:git-dirty-tree');
    }
    if (treeId !== identity.functionsTreeId) {
      throw new CalibrationFatalError('calibration:git-tree-drift');
    }
  }

  function strictIndexReplayJournal(entry: unknown): void {
    const snapshot = snapshotStrictJournalEntry(entry);
    const hash = computeJournalHash(snapshot);
    indexJournalHash(canonicalReservationKey(snapshot.key), hash);
    journalByHash.set(hash, snapshot);
  }

  function strictValidateJournalVersions(): void {
    for (const entry of journalByHash.values()) {
      if (entry.errorCategory === 'none') {
        if (pinnedModelVersion === undefined || entry.responseModelVersion !== pinnedModelVersion) {
          throw new CalibrationFatalError('calibration:journal-version-mismatch');
        }
      } else if (entry.responseModelVersion !== 'n/a') {
        throw new CalibrationFatalError('calibration:journal-version-mismatch');
      }
    }
  }

  function strictValidateHeaderEvent(event: unknown): void {
    const record = assertStrictEnvelope(event, STRICT_HEADER_KEYS, 'protocol_identity');
    const rawType = readStrictField(record, 'type', 'protocol_identity');
    if (rawType !== 'protocol_identity') {
      throw new CalibrationFatalError('calibration:ledger-event-malformed:protocol_identity');
    }
    const rawIdentity = readStrictField(record, 'identity', 'protocol_identity');
    let identityRecord: Record<string, unknown>;
    try {
      if (typeof rawIdentity !== 'object' || rawIdentity === null || Array.isArray(rawIdentity)) {
        throw new CalibrationFatalError('calibration:ledger-event-malformed:protocol_identity');
      }
      identityRecord = rawIdentity as Record<string, unknown>;
      if (Object.keys(identityRecord).length !== IDENTITY_FIELDS.length) {
        throw new CalibrationFatalError('calibration:ledger-event-malformed:protocol_identity');
      }
      for (const field of IDENTITY_FIELDS) {
        if (!Object.prototype.hasOwnProperty.call(identityRecord, field)) {
          throw new CalibrationFatalError('calibration:ledger-event-malformed:protocol_identity');
        }
      }
    } catch {
      throw new CalibrationFatalError('calibration:ledger-event-malformed:protocol_identity');
    }
    for (const field of IDENTITY_FIELDS) {
      let value: unknown;
      try {
        value = identityRecord[field];
      } catch {
        throw new CalibrationFatalError('calibration:ledger-event-malformed:protocol_identity');
      }
      if (value !== (identity as unknown as Record<string, unknown>)[field]) {
        throw new CalibrationFatalError(`calibration:identity-drift:${field}`);
      }
    }
    assertCanonicalStrictTimestamp(
      readStrictField(record, 'at', 'protocol_identity'),
      'protocol_identity',
    );
  }

  function strictAssertTokenKeyAllowed(key: TokenCountReservationKey): void {
    if (key.stage !== 'preflight' || key.model !== identity.model) {
      throw new CalibrationFatalError('calibration:token-reservation-invalid-key');
    }
    if (!plannedPreflightCaseIds.has(key.caseId)) {
      throw new CalibrationFatalError('calibration:token-reservation-invalid-key');
    }
  }

  function requireReservedTokenKeyStrict(key: TokenCountReservationKey): void {
    if (tokenReservation === undefined) {
      throw new CalibrationFatalError('calibration:token-terminal-not-reserved');
    }
    if (canonicalTokenKey(tokenReservation.key) !== canonicalTokenKey(key)) {
      throw new CalibrationFatalError('calibration:token-terminal-key-mismatch');
    }
    if (tokenReservation.status !== 'reserved') {
      throw new CalibrationFatalError('calibration:token-terminal-already-finalized');
    }
  }

  function strictAssertStageTransition(
    from: StageName,
    to: StageName,
    summary: CalibrationStageGateSummary,
  ): void {
    let observedFrom: unknown;
    let observedTo: unknown;
    try {
      observedFrom = from;
      observedTo = to;
    } catch {
      throw new CalibrationFatalError('calibration:stage-transition-invalid');
    }
    if (
      observedFrom !== 'preflight' &&
      observedFrom !== 'development' &&
      observedFrom !== 'validation' &&
      observedFrom !== 'benchmark'
    ) {
      throw new CalibrationFatalError('calibration:stage-transition-invalid');
    }
    if (
      observedTo !== 'preflight' &&
      observedTo !== 'development' &&
      observedTo !== 'validation' &&
      observedTo !== 'benchmark'
    ) {
      throw new CalibrationFatalError('calibration:stage-transition-invalid');
    }
    // Guarded snapshot of caller fields; preserves the legacy
    // completion-inclusive summary semantics (the summary names the completed
    // `from` stage), not the predecessor-only completeStage shape.
    const snapshot = snapshotStrictGateSummary(summary, 'stage_transition');
    if (snapshot.stage !== observedFrom) {
      throw new CalibrationFatalError('calibration:stage-summary-mismatch');
    }
    if (snapshot.passed !== true) {
      throw new CalibrationFatalError(
        `calibration:stage-gate-failed:${observedFrom as StageName}`,
      );
    }
    if (!snapshot.completedStages.includes(observedFrom as StageName)) {
      throw new CalibrationFatalError('calibration:stage-not-completed');
    }
    const fromIndex = STAGE_ORDER.indexOf(observedFrom as StageName);
    const toIndex = STAGE_ORDER.indexOf(observedTo as StageName);
    if (fromIndex === -1 || toIndex === -1 || toIndex !== fromIndex + 1) {
      throw new CalibrationFatalError('calibration:stage-transition-invalid');
    }
  }

  function strictTerminalSuccess(reservationId: string): boolean {
    const record = reservations.get(reservationId);
    if (record === undefined || record.status !== 'completed' || record.journalHash === undefined) {
      return false;
    }
    const entry = journalByHash.get(record.journalHash);
    if (entry === undefined) {
      return false;
    }
    return (
      pinnedModelVersion !== undefined &&
      entry.errorCategory === 'none' &&
      entry.normalizedPrediction !== null &&
      entry.responseModelVersion === pinnedModelVersion
    );
  }

  function countStrictTerminalOutcomes(stage: StageName): number {
    let count = 0;
    for (const record of reservations.values()) {
      if (record.key.stage !== stage) {
        continue;
      }
      if (record.status === 'completed' || record.status === 'interrupted_reservation') {
        count += 1;
      }
    }
    return count;
  }

  function strictAssertReserveAllowed(key: ReservationKey): void {
    if (key.stage === 'preflight') {
      if (key.profile === 'LOW') {
        if (tokenReservation === undefined || tokenReservation.status !== 'completed') {
          throw new CalibrationFatalError('calibration:reservation-out-of-order');
        }
      } else if (!strictTerminalSuccess(preflightLowId)) {
        throw new CalibrationFatalError('calibration:reservation-out-of-order');
      }
      return;
    }
    if (key.stage === 'development') {
      if (!completedStages.includes('preflight')) {
        throw new CalibrationFatalError('calibration:reservation-out-of-order');
      }
      return;
    }
    if (key.stage === 'validation') {
      if (!completedStages.includes('development') || selectedProfile === undefined) {
        throw new CalibrationFatalError('calibration:reservation-out-of-order');
      }
      if (key.profile !== selectedProfile) {
        throw new CalibrationFatalError('calibration:reservation-wrong-profile');
      }
      return;
    }
    if (!completedStages.includes('validation')) {
      throw new CalibrationFatalError('calibration:reservation-out-of-order');
    }
    if (selectedProfile === undefined || key.profile !== selectedProfile) {
      throw new CalibrationFatalError('calibration:reservation-wrong-profile');
    }
  }

  function strictAssertStageReady(stage: StageName): void {
    if (stage === 'preflight') {
      if (tokenReservation === undefined || tokenReservation.status !== 'completed') {
        throw new CalibrationFatalError('calibration:stage-not-ready');
      }
      if (!strictTerminalSuccess(preflightLowId) || !strictTerminalSuccess(preflightMediumId)) {
        throw new CalibrationFatalError('calibration:stage-not-ready');
      }
      if (pinnedModelVersion === undefined) {
        throw new CalibrationFatalError('calibration:stage-not-ready');
      }
      return;
    }
    if (stage === 'development') {
      if (!completedStages.includes('preflight')) {
        throw new CalibrationFatalError('calibration:stage-not-ready');
      }
      if (selectedProfile === undefined || pinnedModelVersion === undefined) {
        throw new CalibrationFatalError('calibration:stage-not-ready');
      }
      if (countStrictTerminalOutcomes('development') !== STRICT_STAGE_TERMINAL_COUNT) {
        throw new CalibrationFatalError('calibration:stage-not-ready');
      }
      return;
    }
    if (stage === 'validation') {
      if (!completedStages.includes('development')) {
        throw new CalibrationFatalError('calibration:stage-not-ready');
      }
      if (selectedProfile === undefined || pinnedModelVersion === undefined) {
        throw new CalibrationFatalError('calibration:stage-not-ready');
      }
      if (countStrictTerminalOutcomes('validation') !== STRICT_STAGE_TERMINAL_COUNT) {
        throw new CalibrationFatalError('calibration:stage-not-ready');
      }
      return;
    }
    if (!completedStages.includes('validation')) {
      throw new CalibrationFatalError('calibration:stage-not-ready');
    }
    if (pinnedModelVersion === undefined) {
      throw new CalibrationFatalError('calibration:stage-not-ready');
    }
    if (countStrictTerminalOutcomes('benchmark') !== STRICT_STAGE_TERMINAL_COUNT) {
      throw new CalibrationFatalError('calibration:stage-not-ready');
    }
  }

  function strictReplayReserved(record: Record<string, unknown>): void {
    const envelope = assertStrictEnvelope(record, STRICT_RESERVED_KEYS, 'reserved');
    const key = snapshotStrictReservationKey(
      readStrictField(envelope, 'key', 'reserved'),
      'reserved',
    );
    const at = readStrictField(envelope, 'at', 'reserved');
    assertCanonicalStrictTimestamp(at, 'reserved');
    const id = canonicalReservationKey(key);
    if (!allowedKeySet.has(id)) {
      throw new CalibrationFatalError('calibration:ledger-event-unplanned:reserved');
    }
    if (reservations.has(id) || nonReservationsByKey.has(id)) {
      throw new CalibrationFatalError('calibration:ledger-event-duplicate:reserved');
    }
    strictAssertReserveAllowed(key);
    if (imageReserved + 1 > HARD_CALL_CEILING) {
      throw new CalibrationFatalError('calibration:reservation-ceiling-exceeded');
    }
    reservations.set(id, { key, status: 'reserved' });
    reservationOrder.push(id);
    imageReserved += 1;
    const stageProfileId = `${key.stage}|${key.profile}`;
    if (!firstStageProfileAt.has(stageProfileId)) {
      firstStageProfileAt.set(stageProfileId, at as string);
    }
  }

  function strictReplayCompleted(record: Record<string, unknown>): void {
    const envelope = assertStrictEnvelope(record, STRICT_COMPLETED_KEYS, 'completed');
    const key = snapshotStrictReservationKey(
      readStrictField(envelope, 'key', 'completed'),
      'completed',
    );
    const rawHash = readStrictField(envelope, 'journalHash', 'completed');
    if (typeof rawHash !== 'string' || rawHash.length === 0) {
      throw new CalibrationFatalError('calibration:ledger-event-malformed:completed');
    }
    assertCanonicalStrictTimestamp(readStrictField(envelope, 'at', 'completed'), 'completed');
    const id = canonicalReservationKey(key);
    if (!allowedKeySet.has(id)) {
      throw new CalibrationFatalError('calibration:ledger-event-unplanned:completed');
    }
    const existing = reservations.get(id);
    if (existing === undefined) {
      throw new CalibrationFatalError('calibration:ledger-event-out-of-order:completed');
    }
    if (existing.status !== 'reserved') {
      throw new CalibrationFatalError('calibration:ledger-event-invalid-transition:completed');
    }
    const validHashes = journalHashesByKey.get(id);
    if (validHashes === undefined || !validHashes.has(rawHash)) {
      throw new CalibrationFatalError('calibration:ledger-event-completed-missing-journal');
    }
    existing.status = 'completed';
    existing.journalHash = rawHash;
  }

  function strictAssertJournalKeysReconciled(): void {
    // Every replayed journal key must be currently allowed and actually
    // reserved. Crash-window journals (reserved, no terminal event) and
    // post-expansion downstream journals reconcile; unplanned or
    // planned-but-never-reserved journals fail closed.
    for (const entry of journalByHash.values()) {
      const id = canonicalReservationKey(entry.key);
      if (!allowedKeySet.has(id)) {
        throw new CalibrationFatalError('calibration:journal-unplanned');
      }
      if (!reservations.has(id)) {
        throw new CalibrationFatalError('calibration:journal-not-reserved');
      }
    }
  }

  function strictReplayFailed(record: Record<string, unknown>): void {
    const envelope = assertStrictEnvelope(record, STRICT_FAILED_KEYS, 'failed');
    const key = snapshotStrictReservationKey(
      readStrictField(envelope, 'key', 'failed'),
      'failed',
    );
    const rawHash = readStrictField(envelope, 'journalHash', 'failed');
    if (typeof rawHash !== 'string' || rawHash.length === 0) {
      throw new CalibrationFatalError('calibration:ledger-event-malformed:failed');
    }
    assertCanonicalStrictTimestamp(readStrictField(envelope, 'at', 'failed'), 'failed');
    const id = canonicalReservationKey(key);
    if (!allowedKeySet.has(id)) {
      throw new CalibrationFatalError('calibration:ledger-event-unplanned:failed');
    }
    const existing = reservations.get(id);
    if (existing === undefined) {
      throw new CalibrationFatalError('calibration:ledger-event-out-of-order:failed');
    }
    if (existing.status !== 'reserved') {
      throw new CalibrationFatalError('calibration:ledger-event-invalid-transition:failed');
    }
    const validHashes = journalHashesByKey.get(id);
    if (validHashes === undefined || !validHashes.has(rawHash)) {
      throw new CalibrationFatalError('calibration:ledger-event-failed-missing-journal');
    }
    // The bound terminal must be the canonical interrupted outcome for this
    // same key: a success digest or provider-failure digest is not proof.
    const bound = journalByHash.get(rawHash);
    if (bound === undefined || !isCanonicalInterruptedJournal(bound)) {
      throw new CalibrationFatalError('calibration:ledger-event-failed-missing-journal');
    }
    existing.status = 'interrupted_reservation';
    existing.journalHash = rawHash;
  }

  function strictReplayTokenReserved(record: Record<string, unknown>): void {
    const envelope = assertStrictEnvelope(
      record,
      STRICT_TOKEN_RESERVED_KEYS,
      'token_count_reserved',
    );
    const key = snapshotStrictTokenKey(readStrictField(envelope, 'key', 'token_count_reserved'));
    strictAssertTokenKeyAllowed(key);
    assertCanonicalStrictTimestamp(
      readStrictField(envelope, 'at', 'token_count_reserved'),
      'token_count_reserved',
    );
    if (tokenCountReserved >= 1) {
      throw new CalibrationFatalError('calibration:ledger-event-duplicate:token_count_reserved');
    }
    tokenCountReserved += 1;
    tokenReservation = { key, status: 'reserved' };
  }

  function strictReplayTokenCompleted(record: Record<string, unknown>): void {
    const envelope = assertStrictEnvelope(
      record,
      STRICT_TOKEN_COMPLETED_KEYS,
      'token_count_completed',
    );
    const key = snapshotStrictTokenKey(readStrictField(envelope, 'key', 'token_count_completed'));
    const rawCount = readStrictField(envelope, 'count', 'token_count_completed');
    if (!isValidTokenCompletionCount(rawCount)) {
      throw new CalibrationFatalError('calibration:ledger-event-malformed:token_count_completed');
    }
    assertCanonicalStrictTimestamp(
      readStrictField(envelope, 'at', 'token_count_completed'),
      'token_count_completed',
    );
    strictAssertTokenKeyAllowed(key);
    if (tokenReservation === undefined) {
      throw new CalibrationFatalError('calibration:ledger-event-out-of-order:token_count_completed');
    }
    if (canonicalTokenKey(tokenReservation.key) !== canonicalTokenKey(key)) {
      throw new CalibrationFatalError('calibration:ledger-event-mismatched-key:token_count_completed');
    }
    if (tokenReservation.status !== 'reserved') {
      throw new CalibrationFatalError(
        'calibration:ledger-event-invalid-transition:token_count_completed',
      );
    }
    tokenReservation.status = 'completed';
  }

  function strictReplayTokenFailed(record: Record<string, unknown>): void {
    const envelope = assertStrictEnvelope(
      record,
      STRICT_TOKEN_FAILED_KEYS,
      'token_count_failed',
    );
    const key = snapshotStrictTokenKey(readStrictField(envelope, 'key', 'token_count_failed'));
    const rawCategory = readStrictField(envelope, 'errorCategory', 'token_count_failed');
    if (!isValidTokenFailureCategory(rawCategory)) {
      throw new CalibrationFatalError('calibration:ledger-event-malformed:token_count_failed');
    }
    assertCanonicalStrictTimestamp(
      readStrictField(envelope, 'at', 'token_count_failed'),
      'token_count_failed',
    );
    strictAssertTokenKeyAllowed(key);
    if (tokenReservation === undefined) {
      throw new CalibrationFatalError('calibration:ledger-event-out-of-order:token_count_failed');
    }
    if (canonicalTokenKey(tokenReservation.key) !== canonicalTokenKey(key)) {
      throw new CalibrationFatalError('calibration:ledger-event-mismatched-key:token_count_failed');
    }
    if (tokenReservation.status !== 'reserved') {
      throw new CalibrationFatalError(
        'calibration:ledger-event-invalid-transition:token_count_failed',
      );
    }
    tokenReservation.status = 'failed';
  }

  function strictReplaySafeError(record: Record<string, unknown>): void {
    const envelope = assertStrictEnvelope(record, SAFE_ERROR_EVENT_KEYS, 'safe_error');
    const snapshot = snapshotStrictSafeErrorEntry(readStrictField(envelope, 'entry', 'safe_error'));
    assertValidSafeErrorEntry(snapshot);
    assertPlannedSafeErrorEntry(snapshot as CalibrationLedgerSafeErrorEntry);
    assertCanonicalStrictTimestamp(readStrictField(envelope, 'at', 'safe_error'), 'safe_error');
  }

  function strictReplayPin(record: Record<string, unknown>): void {
    const envelope = assertStrictEnvelope(record, STRICT_PIN_KEYS, 'model_version_pinned');
    const rawVersion = readStrictField(envelope, 'responseModelVersion', 'model_version_pinned');
    if (
      typeof rawVersion !== 'string' ||
      !MODEL_VERSION_PATTERN.test(rawVersion) ||
      rawVersion === 'n/a'
    ) {
      throw new CalibrationFatalError('calibration:ledger-event-malformed:model_version_pinned');
    }
    assertCanonicalStrictTimestamp(
      readStrictField(envelope, 'at', 'model_version_pinned'),
      'model_version_pinned',
    );
    if (pinnedModelVersion === undefined) {
      if (tokenReservation === undefined || tokenReservation.status !== 'completed') {
        throw new CalibrationFatalError('calibration:ledger-event-out-of-order:model_version_pinned');
      }
      const lowRecord = reservations.get(preflightLowId);
      if (lowRecord === undefined || lowRecord.status !== 'reserved') {
        throw new CalibrationFatalError('calibration:ledger-event-out-of-order:model_version_pinned');
      }
      pinnedModelVersion = rawVersion;
    } else if (pinnedModelVersion !== rawVersion) {
      throw new CalibrationFatalError('calibration:ledger-event-version-drift');
    }
  }

  function strictReplaySelection(record: Record<string, unknown>): void {
    const envelope = assertStrictEnvelope(record, STRICT_SELECTION_KEYS, 'profile_selected');
    const rawProfile = readStrictField(envelope, 'profile', 'profile_selected');
    const rawReason = readStrictField(envelope, 'reason', 'profile_selected');
    if (rawProfile !== 'LOW' && rawProfile !== 'MEDIUM') {
      throw new CalibrationFatalError('calibration:ledger-event-malformed:profile_selected');
    }
    if (typeof rawReason !== 'string' || !SELECTION_REASONS.has(rawReason)) {
      throw new CalibrationFatalError('calibration:ledger-event-malformed:profile_selected');
    }
    if (rawReason === 'default_medium_tie_breaker' && rawProfile !== 'MEDIUM') {
      throw new CalibrationFatalError('calibration:ledger-event-malformed:profile_selected');
    }
    assertCanonicalStrictTimestamp(
      readStrictField(envelope, 'at', 'profile_selected'),
      'profile_selected',
    );
    const nextProfile = rawProfile as CalibrationProfile;
    const nextReason = rawReason as CalibrationProfileSelectionReason;
    if (selectedProfile !== undefined) {
      if (selectedProfile === nextProfile && selectedReason === nextReason) {
        return;
      }
      throw new CalibrationFatalError('calibration:profile-selection-conflict');
    }
    if (!completedStages.includes('preflight')) {
      throw new CalibrationFatalError('calibration:ledger-event-out-of-order:profile_selected');
    }
    if (countStrictTerminalOutcomes('development') !== STRICT_STAGE_TERMINAL_COUNT) {
      throw new CalibrationFatalError('calibration:ledger-event-out-of-order:profile_selected');
    }
    const resolver = strictKeyResolver;
    if (resolver === undefined) {
      throw new CalibrationFatalError('calibration:resolver-failed');
    }
    const expanded = invokeStrictResolver(resolver, nextProfile);
    validateStrictExpandedKeys(initialAllowedKeys, expanded, nextProfile);
    if (reportOptions !== undefined) {
      const expandedRows = cachedExpandedPlan ?? invokeStrictPlanCallback(reportOptions.getReportOutcomePlan, nextProfile);
      validateStrictPlanRows(expandedRows, STRICT_EXPANDED_PLAN_ROW_COUNT, expanded, nextProfile, cachedInitialPlan);
      cachedExpandedPlan = freezeStrictPlanRows(expandedRows);
    }
    selectedProfile = nextProfile;
    selectedReason = nextReason;
    currentAllowedKeys = expanded;
    allowedKeySet = new Set(expanded.map(canonicalReservationKey));
  }

  function strictReplayStage(record: Record<string, unknown>): void {
    const envelope = assertStrictEnvelope(record, STRICT_STAGE_KEYS, 'stage_completed');
    const rawStage = readStrictField(envelope, 'stage', 'stage_completed');
    const rawPassed = readStrictField(envelope, 'passed', 'stage_completed');
    if (
      rawStage !== 'preflight' &&
      rawStage !== 'development' &&
      rawStage !== 'validation' &&
      rawStage !== 'benchmark'
    ) {
      throw new CalibrationFatalError('calibration:ledger-event-malformed:stage_completed');
    }
    if (rawPassed !== true) {
      throw new CalibrationFatalError('calibration:ledger-event-malformed:stage_completed');
    }
    assertCanonicalStrictTimestamp(
      readStrictField(envelope, 'at', 'stage_completed'),
      'stage_completed',
    );
    const nextStage = rawStage as StageName;
    if (completedStages.includes(nextStage)) {
      return;
    }
    for (const predecessor of EXPECTED_STAGE_PREDECESSORS[nextStage]) {
      if (!completedStages.includes(predecessor)) {
        throw new CalibrationFatalError('calibration:ledger-event-out-of-order:stage_completed');
      }
    }
    strictAssertStageReady(nextStage);
    completedStages.push(nextStage);
  }

  function strictReplayLedgerEvent(event: unknown): void {
    let record: Record<string, unknown>;
    let type: unknown;
    try {
      if (typeof event !== 'object' || event === null || Array.isArray(event)) {
        throw new CalibrationFatalError('calibration:ledger-event-malformed');
      }
      record = event as Record<string, unknown>;
      type = record.type;
    } catch {
      throw new CalibrationFatalError('calibration:ledger-event-malformed');
    }
    switch (type) {
      case 'reserved':
        strictReplayReserved(record);
        break;
      case 'completed':
        strictReplayCompleted(record);
        break;
      case 'failed':
        strictReplayFailed(record);
        break;
      case 'token_count_reserved':
        strictReplayTokenReserved(record);
        break;
      case 'token_count_completed':
        strictReplayTokenCompleted(record);
        break;
      case 'token_count_failed':
        strictReplayTokenFailed(record);
        break;
      case 'safe_error':
        strictReplaySafeError(record);
        break;
      case 'lock_recovery': {
        const envelope = assertStrictEnvelope(record, STRICT_LOCK_RECOVERY_KEYS, 'lock_recovery');
        assertCanonicalStrictTimestamp(
          readStrictField(envelope, 'at', 'lock_recovery'),
          'lock_recovery',
        );
        break;
      }
      case 'synthetic_reserved':
        throw new CalibrationFatalError('calibration:ledger-event-malformed:synthetic_reserved');
      case 'model_version_pinned':
        strictReplayPin(record);
        break;
      case 'profile_selected':
        strictReplaySelection(record);
        break;
      case 'stage_completed':
        strictReplayStage(record);
        break;
      case 'non_reservation_result':
        strictReplayNonReservationResult(record);
        break;
      default:
        throw new CalibrationFatalError('calibration:ledger-event-unknown-type');
    }
  }

  function strictReserve(key: ReservationKey): void {
    const snapshot = snapshotStrictReservationKey(key, 'reserved');
    const id = canonicalReservationKey(snapshot);
    if (completedStages.includes(snapshot.stage)) {
      throw new CalibrationFatalError('calibration:reservation-sealed');
    }
    if (nonReservationsByKey.has(id)) {
      throw new CalibrationFatalError('calibration:reservation-nonreservation-conflict');
    }
    strictAssertReserveAllowed(snapshot);
    if (!allowedKeySet.has(id)) {
      throw new CalibrationFatalError('calibration:reservation-unplanned');
    }
    if (reservations.has(id)) {
      throw new CalibrationFatalError('calibration:reservation-duplicate');
    }
    if (imageReserved + 1 > HARD_CALL_CEILING) {
      throw new CalibrationFatalError('calibration:reservation-ceiling-exceeded');
    }
    const at = strictNowIso();
    persistLedgerEvent({ type: 'reserved', key: snapshot, at });
    reservations.set(id, { key: snapshot, status: 'reserved' });
    reservationOrder.push(id);
    imageReserved += 1;
    const stageProfileId = `${snapshot.stage}|${snapshot.profile}`;
    if (!firstStageProfileAt.has(stageProfileId)) {
      firstStageProfileAt.set(stageProfileId, at);
    }
  }

  function strictReserveTokenCount(key: TokenCountReservationKey): void {
    const snapshot = snapshotStrictTokenKey(key);
    strictAssertTokenKeyAllowed(snapshot);
    if (tokenCountReserved >= 1) {
      throw new CalibrationFatalError('calibration:token-reservation-duplicate');
    }
    persistLedgerEvent({ type: 'token_count_reserved', key: snapshot, at: strictNowIso() });
    tokenCountReserved += 1;
    tokenReservation = { key: snapshot, status: 'reserved' };
  }

  function strictCompleteTokenCount(key: TokenCountReservationKey, count: number): void {
    const snapshot = snapshotStrictTokenKey(key);
    strictAssertTokenKeyAllowed(snapshot);
    requireReservedTokenKeyStrict(snapshot);
    if (!isValidTokenCompletionCount(count)) {
      throw new CalibrationFatalError('calibration:token-terminal-invalid-count');
    }
    persistTokenTerminalEvent(
      { type: 'token_count_completed', key: snapshot, count, at: strictNowIso() },
      snapshot,
    );
    if (tokenReservation !== undefined) {
      tokenReservation.status = 'completed';
    }
  }

  function strictFailTokenCount(
    key: TokenCountReservationKey,
    errorCategory: CalibrationSafeErrorCategory,
  ): void {
    const snapshot = snapshotStrictTokenKey(key);
    strictAssertTokenKeyAllowed(snapshot);
    requireReservedTokenKeyStrict(snapshot);
    let observed: unknown;
    try {
      observed = errorCategory;
    } catch {
      throw new CalibrationFatalError('calibration:token-terminal-invalid-category');
    }
    if (!isValidTokenFailureCategory(observed)) {
      throw new CalibrationFatalError('calibration:token-terminal-invalid-category');
    }
    persistTokenTerminalEvent(
      { type: 'token_count_failed', key: snapshot, errorCategory: observed, at: strictNowIso() },
      snapshot,
    );
    if (tokenReservation !== undefined) {
      tokenReservation.status = 'failed';
    }
  }

  function strictAppendResultJournal(entry: JournalEntry): string {
    const snapshot = snapshotStrictJournalEntry(entry);
    const id = canonicalReservationKey(snapshot.key);
    const record = reservations.get(id);
    if (record === undefined || record.status !== 'reserved') {
      throw new CalibrationFatalError('calibration:journal-not-reserved');
    }
    if (pendingJournalHashes.has(id)) {
      throw new CalibrationFatalError('calibration:journal-duplicate');
    }
    if (snapshot.errorCategory === 'none') {
      if (pinnedModelVersion === undefined) {
        throw new CalibrationFatalError('calibration:journal-version-unpinned');
      }
      if (snapshot.responseModelVersion !== pinnedModelVersion) {
        throw new CalibrationFatalError('calibration:journal-version-mismatch');
      }
    } else if (snapshot.responseModelVersion !== 'n/a') {
      throw new CalibrationFatalError('calibration:journal-version-mismatch');
    }
    const hash = computeJournalHash(snapshot);
    strictPersistJournal(snapshot);
    pendingJournalHashes.set(id, hash);
    indexJournalHash(id, hash);
    journalByHash.set(hash, snapshot);
    return hash;
  }

  function strictComplete(key: ReservationKey, journalHash: string): void {
    const snapshot = snapshotStrictReservationKey(key, 'completed');
    let observedHash: unknown;
    try {
      observedHash = journalHash;
    } catch {
      throw new CalibrationFatalError('calibration:complete-missing-journal');
    }
    if (typeof observedHash !== 'string' || observedHash.length === 0) {
      throw new CalibrationFatalError('calibration:complete-missing-journal');
    }
    const id = canonicalReservationKey(snapshot);
    const record = reservations.get(id);
    if (record === undefined || record.status !== 'reserved') {
      throw new CalibrationFatalError('calibration:complete-not-reserved');
    }
    const expectedHash = pendingJournalHashes.get(id);
    if (expectedHash === undefined || expectedHash !== observedHash) {
      throw new CalibrationFatalError('calibration:complete-missing-journal');
    }
    persistLedgerEvent({
      type: 'completed',
      key: snapshot,
      journalHash: observedHash,
      at: strictNowIso(),
    });
    record.status = 'completed';
    record.journalHash = observedHash;
    pendingJournalHashes.delete(id);
  }

  function strictRecordSafeError(entry: CalibrationLedgerSafeErrorEntry): void {
    const snapshot = snapshotStrictSafeErrorEntry(entry);
    assertValidSafeErrorEntry(snapshot);
    assertPlannedSafeErrorEntry(snapshot as CalibrationLedgerSafeErrorEntry);
    const at = strictNowIso();
    assertCanonicalStrictTimestamp(at, 'safe_error');
    persistLedgerEvent({ type: 'safe_error', entry: snapshot, at });
  }

  function strictRecoverAfterCrash(): CalibrationRecoveryReport {
    const interrupted: ReservationKey[] = [];
    const failed: CalibrationFailedReservation[] = [];
    for (const id of reservationOrder) {
      const record = reservations.get(id);
      if (record === undefined || record.status !== 'reserved') {
        continue;
      }
      const keySnapshot: ReservationKey = {
        stage: record.key.stage,
        profile: record.key.profile,
        caseId: record.key.caseId,
        sampleIndex: record.key.sampleIndex,
      };
      const failureEntry: JournalEntry = {
        key: { ...keySnapshot },
        predictionHash: 'interrupted_reservation',
        normalizedPrediction: null,
        analysisLatencyMs: 0,
        errorCategory: 'interrupted_reservation',
        responseModelVersion: 'n/a',
      };
      const journalHash = computeJournalHash(failureEntry);
      strictPersistJournal(failureEntry);
      indexJournalHash(id, journalHash);
      journalByHash.set(journalHash, failureEntry);
      persistLedgerEvent({ type: 'failed', key: keySnapshot, journalHash, at: strictNowIso() });
      record.status = 'interrupted_reservation';
      record.journalHash = journalHash;
      interrupted.push({ ...keySnapshot });
      failed.push({ key: { ...keySnapshot }, status: 'interrupted_reservation' });
    }
    const resumable = currentAllowedKeys.filter(
      (key) => !reservations.has(canonicalReservationKey(key)),
    );
    return { interrupted, failed, resumable: resumable.map((key) => ({ ...key })) };
  }

  function strictPinModelVersion(version: string): void {
    requireLock();
    let observed: unknown;
    try {
      observed = version;
    } catch {
      throw new CalibrationFatalError('calibration:version-invalid');
    }
    if (typeof observed !== 'string' || !MODEL_VERSION_PATTERN.test(observed) || observed === 'n/a') {
      throw new CalibrationFatalError('calibration:version-invalid');
    }
    if (pinnedModelVersion !== undefined) {
      if (pinnedModelVersion === observed) {
        return;
      }
      throw new CalibrationFatalError('calibration:version-drift');
    }
    if (tokenReservation === undefined || tokenReservation.status !== 'completed') {
      throw new CalibrationFatalError('calibration:pin-before-token');
    }
    const lowRecord = reservations.get(preflightLowId);
    if (lowRecord === undefined || lowRecord.status !== 'reserved') {
      throw new CalibrationFatalError('calibration:pin-without-low');
    }
    persistLedgerEvent({
      type: 'model_version_pinned',
      responseModelVersion: observed,
      at: strictNowIso(),
    });
    pinnedModelVersion = observed;
  }

  function strictGetPinnedModelVersion(): string | undefined {
    checkPoison();
    return pinnedModelVersion;
  }

  function strictRecordProfileSelection(
    profile: CalibrationProfile,
    reason: CalibrationProfileSelectionReason,
    gateSummary: CalibrationStageGateSummary,
  ): void {
    requireLock();
    let observedProfile: unknown;
    let observedReason: unknown;
    try {
      observedProfile = profile;
      observedReason = reason;
    } catch {
      throw new CalibrationFatalError('calibration:profile-selection-invalid');
    }
    const summary = snapshotStrictGateSummary(gateSummary, 'profile_selected');
    if (observedProfile !== 'LOW' && observedProfile !== 'MEDIUM') {
      throw new CalibrationFatalError('calibration:profile-selection-invalid');
    }
    if (typeof observedReason !== 'string' || !SELECTION_REASONS.has(observedReason)) {
      throw new CalibrationFatalError('calibration:profile-selection-invalid');
    }
    if (observedReason === 'default_medium_tie_breaker' && observedProfile !== 'MEDIUM') {
      throw new CalibrationFatalError('calibration:profile-selection-invalid');
    }
    if (summary.stage !== 'development' || summary.passed !== true) {
      throw new CalibrationFatalError('calibration:ledger-event-malformed:profile_selected');
    }
    assertExactPredecessors(
      summary.completedStages,
      EXPECTED_STAGE_PREDECESSORS.development,
      'profile_selected',
    );
    const nextProfile = observedProfile as CalibrationProfile;
    const nextReason = observedReason as CalibrationProfileSelectionReason;
    if (selectedProfile !== undefined) {
      if (selectedProfile === nextProfile && selectedReason === nextReason) {
        return;
      }
      throw new CalibrationFatalError('calibration:profile-selection-conflict');
    }
    if (!completedStages.includes('preflight')) {
      throw new CalibrationFatalError('calibration:profile-selection-not-ready');
    }
    if (countStrictTerminalOutcomes('development') !== STRICT_STAGE_TERMINAL_COUNT) {
      throw new CalibrationFatalError('calibration:profile-selection-not-ready');
    }
    const resolver = strictKeyResolver;
    if (resolver === undefined) {
      throw new CalibrationFatalError('calibration:resolver-failed');
    }
    const expanded = invokeStrictResolver(resolver, nextProfile);
    validateStrictExpandedKeys(initialAllowedKeys, expanded, nextProfile);
    let pendingExpandedPlan: readonly CalibrationPlannedReportOutcome[] | undefined;
    if (reportOptions !== undefined) {
      const expandedRows = cachedExpandedPlan ?? invokeStrictPlanCallback(reportOptions.getReportOutcomePlan, nextProfile);
      validateStrictPlanRows(expandedRows, STRICT_EXPANDED_PLAN_ROW_COUNT, expanded, nextProfile, cachedInitialPlan);
      pendingExpandedPlan = freezeStrictPlanRows(expandedRows);
    }
    persistLedgerEvent({
      type: 'profile_selected',
      profile: nextProfile,
      reason: nextReason,
      at: strictNowIso(),
    });
    if (pendingExpandedPlan !== undefined) {
      cachedExpandedPlan = pendingExpandedPlan;
    }
    selectedProfile = nextProfile;
    selectedReason = nextReason;
    currentAllowedKeys = expanded;
    allowedKeySet = new Set(expanded.map(canonicalReservationKey));
  }

  function strictGetSelectedProfile(): CalibrationProfile | undefined {
    checkPoison();
    return selectedProfile;
  }

  function strictCompleteStage(stage: StageName, gateSummary: CalibrationStageGateSummary): void {
    requireLock();
    let observedStage: unknown;
    try {
      observedStage = stage;
    } catch {
      throw new CalibrationFatalError('calibration:ledger-event-malformed:stage_completed');
    }
    if (
      observedStage !== 'preflight' &&
      observedStage !== 'development' &&
      observedStage !== 'validation' &&
      observedStage !== 'benchmark'
    ) {
      throw new CalibrationFatalError('calibration:ledger-event-malformed:stage_completed');
    }
    const nextStage = observedStage as StageName;
    const summary = snapshotStrictGateSummary(gateSummary, 'stage_completed');
    if (summary.stage !== nextStage || summary.passed !== true) {
      throw new CalibrationFatalError('calibration:ledger-event-malformed:stage_completed');
    }
    assertExactPredecessors(
      summary.completedStages,
      EXPECTED_STAGE_PREDECESSORS[nextStage],
      'stage_completed',
    );
    if (completedStages.includes(nextStage)) {
      return;
    }
    strictAssertStageReady(nextStage);
    persistLedgerEvent({ type: 'stage_completed', stage: nextStage, passed: true, at: strictNowIso() });
    completedStages.push(nextStage);
  }

  function strictGetCompletedStages(): readonly StageName[] {
    checkPoison();
    return Object.freeze([...completedStages]);
  }

  function strictGetCompletedReportPredictions(): readonly CalibrationCompletedReportPrediction[] {
    checkPoison();
    const out: CalibrationCompletedReportPrediction[] = [];
    for (const id of reservationOrder) {
      const record = reservations.get(id);
      if (record === undefined || record.status !== 'completed') continue;
      if (record.journalHash === undefined) continue;
      const validHashes = journalHashesByKey.get(id);
      if (validHashes === undefined || !validHashes.has(record.journalHash)) continue;
      const entry = journalByHash.get(record.journalHash);
      if (entry === undefined) {
        throw new CalibrationFatalError('calibration:report-prediction-missing');
      }
      let hasReport = false;
      try {
        if (typeof entry === 'object' && entry !== null) {
          const descriptor = Object.getOwnPropertyDescriptor(entry, 'reportPrediction');
          if (descriptor !== undefined) {
            hasReport = true;
          }
        }
      } catch {
        throw new CalibrationFatalError('calibration:report-prediction-missing');
      }
      if (!hasReport) {
        throw new CalibrationFatalError('calibration:report-prediction-missing');
      }
      let validated: JournalEntry;
      try {
        validated = captureCalibrationReportJournalEntry(entry);
      } catch {
        throw new CalibrationFatalError('calibration:report-prediction-missing');
      }
      const report = validated.reportPrediction as unknown as NutritionPrediction;
      if (report === undefined) {
        throw new CalibrationFatalError('calibration:report-prediction-missing');
      }
      const keyCopy: ReservationKey = {
        stage: validated.key.stage,
        profile: validated.key.profile,
        caseId: validated.key.caseId,
        sampleIndex: validated.key.sampleIndex,
      };
      Object.freeze(keyCopy);
      const row: CalibrationCompletedReportPrediction = {
        key: keyCopy,
        prediction: report,
      };
      Object.freeze(row);
      out.push(row);
    }
    Object.freeze(out);
    return out;
  }

  function strictAssertNonReservationStage(key: ReservationKey): void {
    if (completedStages.includes(key.stage)) {
      throw new CalibrationFatalError('calibration:non-reservation-stage-sealed');
    }
    strictAssertReserveAllowed(key);
  }

  function strictRecordNonReservationResult(entry: unknown): string {
    checkPoison();
    requireLock();
    if (reportOptions === undefined) {
      throw new CalibrationFatalError('calibration:non-reservation-plan-required');
    }
    const captured = captureCalibrationNonReservationEntry(entry);
    const id = canonicalReservationKey(captured.key as unknown as ReservationKey);
    if (reservations.has(id)) {
      throw new CalibrationFatalError('calibration:non-reservation-already-reserved');
    }
    if (nonReservationsByKey.has(id)) {
      throw new CalibrationFatalError('calibration:non-reservation-duplicate');
    }
    const activePlan = (selectedProfile === undefined ? cachedInitialPlan : cachedExpandedPlan) ?? [];
    const planRow = activePlan.find(
      (row) => canonicalReservationKey(row.key as unknown as ReservationKey) === id,
    );
    if (planRow === undefined) {
      throw new CalibrationFatalError('calibration:non-reservation-unplanned');
    }
    assertStrictNonReservationAssociation(
      captured,
      planRow as unknown as { key: ReservationKey; scanMode: 'meal' | 'label' | 'barcode' },
    );
    strictAssertNonReservationStage(captured.key);
    const at = strictNowIso();
    const contentDigest = createHash('sha256')
      .update(
        JSON.stringify({ key: captured.key, reason: captured.reason, prediction: captured.prediction, at }),
        'utf8',
      )
      .digest('hex');
    const event = captureCalibrationNonReservationEvent({
      type: 'non_reservation_result',
      key: captured.key,
      reason: captured.reason,
      prediction: captured.prediction,
      contentDigest,
      at,
    });
    persistLedgerEvent(event);
    nonReservationsByKey.set(id, {
      key: event.key,
      reason: event.reason,
      prediction: event.prediction,
      contentDigest: event.contentDigest,
      at: event.at,
    });
    const stageProfileId = `${event.key.stage}|${event.key.profile}`;
    if (!firstStageProfileAt.has(stageProfileId)) {
      firstStageProfileAt.set(stageProfileId, event.at);
    }
    return event.contentDigest;
  }

  function strictReplayNonReservationResult(record: Record<string, unknown>): void {
    if (reportOptions === undefined) {
      throw new CalibrationFatalError('calibration:non-reservation-plan-required');
    }
    const validated = captureCalibrationNonReservationEvent(record);
    const id = canonicalReservationKey(validated.key as unknown as ReservationKey);
    if (reservations.has(id) || nonReservationsByKey.has(id)) {
      throw new CalibrationFatalError('calibration:non-reservation-duplicate');
    }
    const activePlan = (selectedProfile === undefined ? cachedInitialPlan : cachedExpandedPlan) ?? [];
    const planRow = activePlan.find(
      (row) => canonicalReservationKey(row.key as unknown as ReservationKey) === id,
    );
    if (planRow === undefined) {
      throw new CalibrationFatalError('calibration:non-reservation-unplanned');
    }
    assertStrictNonReservationAssociation(
      validated,
      planRow as unknown as { key: ReservationKey; scanMode: 'meal' | 'label' | 'barcode' },
    );
    strictAssertNonReservationStage(validated.key);
    nonReservationsByKey.set(id, {
      key: validated.key,
      reason: validated.reason,
      prediction: validated.prediction,
      contentDigest: validated.contentDigest,
      at: validated.at,
    });
    const stageProfileId = `${validated.key.stage}|${validated.key.profile}`;
    if (!firstStageProfileAt.has(stageProfileId)) {
      firstStageProfileAt.set(stageProfileId, validated.at);
    }
  }

  function strictGetStageReportSnapshot(
    stageInput: unknown,
    profileInput: unknown,
  ): CalibrationStageReportSnapshot {
    checkPoison();
    if (
      stageInput !== 'preflight' &&
      stageInput !== 'development' &&
      stageInput !== 'validation' &&
      stageInput !== 'benchmark'
    ) {
      throw new CalibrationFatalError('calibration:stage-report-state-invalid');
    }
    if (profileInput !== 'LOW' && profileInput !== 'MEDIUM') {
      throw new CalibrationFatalError('calibration:stage-report-state-invalid');
    }
    const stage = stageInput;
    const profile = profileInput;
    const images: Array<Record<string, unknown>> = [];
    let reservedCount = 0;
    let completedCount = 0;
    let failedCount = 0;
    for (const id of reservationOrder) {
      const record = reservations.get(id);
      if (record === undefined || record.key.stage !== stage || record.key.profile !== profile) {
        continue;
      }
      reservedCount += 1;
      if (record.status === 'reserved') {
        continue;
      }
      if (record.journalHash === undefined) {
        throw new CalibrationFatalError('calibration:stage-report-state-invalid');
      }
      const entry = journalByHash.get(record.journalHash);
      if (entry === undefined) {
        throw new CalibrationFatalError('calibration:stage-report-state-invalid');
      }
      if (record.status === 'interrupted_reservation') {
        if (!isCanonicalInterruptedJournal(entry)) {
          throw new CalibrationFatalError('calibration:stage-report-state-invalid');
        }
        images.push({
          status: 'interrupted_reservation' as const,
          key: { ...record.key },
          journalHash: record.journalHash,
        });
        failedCount += 1;
        continue;
      }
      let hasReport = false;
      try {
        if (typeof entry === 'object' && entry !== null) {
          const descriptor = Object.getOwnPropertyDescriptor(entry, 'reportPrediction');
          if (descriptor !== undefined) {
            hasReport = true;
          }
        }
      } catch {
        throw new CalibrationFatalError('calibration:report-prediction-missing');
      }
      if (!hasReport) {
        throw new CalibrationFatalError('calibration:report-prediction-missing');
      }
      let validatedJournal: JournalEntry;
      try {
        validatedJournal = captureCalibrationReportJournalEntry(entry);
      } catch {
        throw new CalibrationFatalError('calibration:report-prediction-missing');
      }
      images.push({
        status: 'completed' as const,
        key: { ...record.key },
        journalHash: record.journalHash,
        journal: validatedJournal,
      });
      if (validatedJournal.errorCategory === 'none') {
        completedCount += 1;
      } else {
        failedCount += 1;
      }
    }
    const pendingCount = reservedCount - completedCount - failedCount;
    if (pendingCount < 0) {
      throw new CalibrationFatalError('calibration:stage-report-state-invalid');
    }

    const nonReservations: CalibrationNonReservationOutcome[] = [];
    for (const outcome of nonReservationsByKey.values()) {
      if (outcome.key.stage === stage && outcome.key.profile === profile) {
        nonReservations.push(outcome);
      }
    }

    const stageProfileId = `${stage}|${profile}`;
    const startedAt = firstStageProfileAt.get(stageProfileId);

    const snapshotInput: Record<string, unknown> = {
      stage,
      profile,
      identity: { ...identity },
      counts: {
        imageCallsReserved: reservedCount,
        imageCallsCompleted: completedCount,
        imageCallsFailed: failedCount,
        imageCallsPending: pendingCount,
      },
      images,
      nonReservations,
    };
    if (startedAt !== undefined) {
      snapshotInput['startedAt'] = startedAt;
    }
    if (selectedProfile !== undefined) {
      snapshotInput['selectedProfile'] = selectedProfile;
    }
    if (pinnedModelVersion !== undefined) {
      snapshotInput['pinnedModelVersion'] = pinnedModelVersion;
    }
    return captureCalibrationStageReportSnapshot(snapshotInput);
  }

  const baseLedger: CalibrationLedger = {
    acquireLock,
    releaseLock,
    assertIdentity,
    assertGitState,
    assertStageTransition,
    reserve,
    reserveSynthetic,
    reserveTokenCount,
    completeTokenCount,
    failTokenCount,
    getCounts,
    appendResultJournal,
    complete,
    rebuildReport,
    recoverAfterCrash,
    recordSafeError,
  };
  if (!isStrict) {
    return baseLedger;
  }
  const protocolLedger: CalibrationProtocolLedger = {
    ...baseLedger,
    pinModelVersion: strictPinModelVersion,
    getPinnedModelVersion: strictGetPinnedModelVersion,
    recordProfileSelection: strictRecordProfileSelection,
    getSelectedProfile: strictGetSelectedProfile,
    completeStage: strictCompleteStage,
    getCompletedStages: strictGetCompletedStages,
    getCompletedReportPredictions: strictGetCompletedReportPredictions,
    recordNonReservationResult: strictRecordNonReservationResult,
    getStageReportSnapshot: strictGetStageReportSnapshot,
  };
  return protocolLedger;
}

// ── Pure profile selection ───────────────────────────────────────────────────

interface CalibrationProfileMetrics {
  unsafeCount: number;
  parseCount: number;
  catastrophicCount: number;
  meanZeroSafeMacroError?: number;
  medianKcalError?: number;
  p90AnalysisLatencyMs?: number;
}

function effectiveDownstreamMetric(
  value: number | undefined,
  parseCount: number,
): number {
  if (parseCount === 0) return Number.POSITIVE_INFINITY;
  return value === undefined ? Number.POSITIVE_INFINITY : value;
}

function assertValidRequiredCount(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new CalibrationFatalError(
      `calibration:profile-selection-invalid-count:${label}`,
    );
  }
}

function assertValidOptionalMetric(value: number | undefined, label: string): void {
  if (value === undefined) return;
  if (!Number.isFinite(value) || value < 0) {
    throw new CalibrationFatalError(
      `calibration:profile-selection-invalid-metric:${label}`,
    );
  }
}

export function selectCalibrationProfile(
  low: CalibrationProfileMetrics,
  medium: CalibrationProfileMetrics,
): CalibrationProfile {
  assertValidRequiredCount(low.unsafeCount, 'low.unsafeCount');
  assertValidRequiredCount(medium.unsafeCount, 'medium.unsafeCount');
  assertValidRequiredCount(low.parseCount, 'low.parseCount');
  assertValidRequiredCount(medium.parseCount, 'medium.parseCount');
  assertValidRequiredCount(low.catastrophicCount, 'low.catastrophicCount');
  assertValidRequiredCount(medium.catastrophicCount, 'medium.catastrophicCount');
  assertValidOptionalMetric(low.meanZeroSafeMacroError, 'low.meanZeroSafeMacroError');
  assertValidOptionalMetric(medium.meanZeroSafeMacroError, 'medium.meanZeroSafeMacroError');
  assertValidOptionalMetric(low.medianKcalError, 'low.medianKcalError');
  assertValidOptionalMetric(medium.medianKcalError, 'medium.medianKcalError');
  assertValidOptionalMetric(low.p90AnalysisLatencyMs, 'low.p90AnalysisLatencyMs');
  assertValidOptionalMetric(medium.p90AnalysisLatencyMs, 'medium.p90AnalysisLatencyMs');
  if (low.unsafeCount !== medium.unsafeCount) {
    return low.unsafeCount < medium.unsafeCount ? 'LOW' : 'MEDIUM';
  }
  if (low.parseCount !== medium.parseCount) {
    return low.parseCount > medium.parseCount ? 'LOW' : 'MEDIUM';
  }
  if (low.catastrophicCount !== medium.catastrophicCount) {
    return low.catastrophicCount < medium.catastrophicCount ? 'LOW' : 'MEDIUM';
  }
  const lowMacro = effectiveDownstreamMetric(low.meanZeroSafeMacroError, low.parseCount);
  const mediumMacro = effectiveDownstreamMetric(
    medium.meanZeroSafeMacroError,
    medium.parseCount,
  );
  if (lowMacro !== mediumMacro) {
    return lowMacro < mediumMacro ? 'LOW' : 'MEDIUM';
  }
  const lowKcal = effectiveDownstreamMetric(low.medianKcalError, low.parseCount);
  const mediumKcal = effectiveDownstreamMetric(medium.medianKcalError, medium.parseCount);
  if (lowKcal !== mediumKcal) {
    return lowKcal < mediumKcal ? 'LOW' : 'MEDIUM';
  }
  const lowLatency = effectiveDownstreamMetric(
    low.p90AnalysisLatencyMs,
    low.parseCount,
  );
  const mediumLatency = effectiveDownstreamMetric(
    medium.p90AnalysisLatencyMs,
    medium.parseCount,
  );
  if (lowLatency !== mediumLatency) {
    return lowLatency < mediumLatency ? 'LOW' : 'MEDIUM';
  }
  return 'MEDIUM';
}

// ── Pure stage gates ─────────────────────────────────────────────────────────

interface CalibrationStageGateMetrics {
  totalCases?: number;
  runCases?: number;
  totalOutcomes?: number;
  parseCases?: number;
  unsafeCompletionCount?: number;
  failureCount?: number;
  catastrophicCount?: number;
  medianRelativeCalorieError?: number;
  p90RelativeCalorieError?: number;
  meanZeroSafeMacroRelativeError?: number;
  medianProteinRelativeError?: number;
  medianCarbsRelativeError?: number;
  medianFatRelativeError?: number;
  medianMealMassRelativeError?: number;
  p90AnalysisLatencyMs?: number;
  parsedMealCount?: number;
  mealMassEligibleCount?: number;
  mealDensityCoverageCount?: number;
  mealCarbDensityEligibleCount?: number;
  mealFatDensityEligibleCount?: number;
  meanMacroRelativeError?: number;
  meanMealMassRelativeError?: number;
  meanMealCarbDensityRelativeError?: number;
  meanMealFatDensityRelativeError?: number;
  medianMealProteinRelativeError?: number;
  medianMealCarbsRelativeError?: number;
  medianMealFatRelativeError?: number;
  mealOutcomeCount?: number;
  suppliedBarcodeOutcomeCount?: number;
  labelOutcomeCount?: number;
  visionCallCount?: number;
  suppliedBarcodeImageCallCount?: number;
  suppliedBarcodeVisionCallCount?: number;
  suppliedBarcodeLiveOffCallCount?: number;
}

export interface CalibrationStageGateResult {
  passed: boolean;
  failedChecks: readonly string[];
}

function exceedsOrMissing(value: number | undefined, max: number): boolean {
  return value === undefined || !Number.isFinite(value) || value < 0 || value > max;
}

function isValidNonNegativeInteger(value: number | undefined): value is number {
  return value !== undefined && Number.isInteger(value) && value >= 0;
}

function exceedsOrInvalidCount(value: number | undefined, max: number): boolean {
  return !isValidNonNegativeInteger(value) || value > max;
}

function evaluateDevelopmentGate(
  m: CalibrationStageGateMetrics,
): CalibrationStageGateResult {
  const failed: string[] = [];
  if (m.totalCases !== 24) failed.push('totalCases');
  if (m.runCases !== 24) failed.push('runCases');
  if (!isValidNonNegativeInteger(m.parseCases) || m.parseCases < 23) {
    failed.push('parseCases');
  }
  if (m.unsafeCompletionCount !== 0) failed.push('unsafeCompletionCount');
  if (exceedsOrInvalidCount(m.catastrophicCount, 6)) failed.push('catastrophicCount');
  if (exceedsOrMissing(m.medianRelativeCalorieError, 0.35)) {
    failed.push('medianRelativeCalorieError');
  }
  if (exceedsOrMissing(m.meanZeroSafeMacroRelativeError, 0.5)) {
    failed.push('meanZeroSafeMacroRelativeError');
  }
  if (exceedsOrMissing(m.p90AnalysisLatencyMs, 30000)) {
    failed.push('p90AnalysisLatencyMs');
  }
  return { passed: failed.length === 0, failedChecks: failed };
}

function evaluateValidationGate(
  m: CalibrationStageGateMetrics,
): CalibrationStageGateResult {
  const failed: string[] = [];
  if (m.totalCases !== 48) failed.push('totalCases');
  if (m.runCases !== 48) failed.push('runCases');
  if (!isValidNonNegativeInteger(m.parseCases) || m.parseCases < 46) {
    failed.push('parseCases');
  }
  if (m.unsafeCompletionCount !== 0) failed.push('unsafeCompletionCount');
  if (exceedsOrInvalidCount(m.catastrophicCount, 8)) failed.push('catastrophicCount');
  if (exceedsOrMissing(m.medianRelativeCalorieError, 0.25)) {
    failed.push('medianRelativeCalorieError');
  }
  if (exceedsOrMissing(m.p90RelativeCalorieError, 0.9)) {
    failed.push('p90RelativeCalorieError');
  }
  if (exceedsOrMissing(m.meanZeroSafeMacroRelativeError, 0.45)) {
    failed.push('meanZeroSafeMacroRelativeError');
  }
  if (exceedsOrMissing(m.medianProteinRelativeError, 0.35)) {
    failed.push('medianProteinRelativeError');
  }
  if (exceedsOrMissing(m.medianCarbsRelativeError, 0.35)) {
    failed.push('medianCarbsRelativeError');
  }
  if (exceedsOrMissing(m.medianFatRelativeError, 0.35)) {
    failed.push('medianFatRelativeError');
  }
  if (exceedsOrMissing(m.medianMealMassRelativeError, 0.35)) {
    failed.push('medianMealMassRelativeError');
  }
  if (exceedsOrMissing(m.p90AnalysisLatencyMs, 30000)) {
    failed.push('p90AnalysisLatencyMs');
  }

  const parsedMealCount = m.parsedMealCount;
  const parseCases = m.parseCases;
  if (
    parsedMealCount === undefined ||
    parseCases === undefined ||
    parsedMealCount !== parseCases
  ) {
    failed.push('parsedMealCount');
  }
  const coverageFields: Array<[keyof CalibrationStageGateMetrics, string]> = [
    ['mealMassEligibleCount', 'mealMassEligibleCount'],
    ['mealDensityCoverageCount', 'mealDensityCoverageCount'],
    ['mealCarbDensityEligibleCount', 'mealCarbDensityEligibleCount'],
    ['mealFatDensityEligibleCount', 'mealFatDensityEligibleCount'],
  ];
  for (const [field, label] of coverageFields) {
    const value = m[field];
    if (parsedMealCount === undefined || value === undefined || value !== parsedMealCount) {
      failed.push(label);
    }
  }
  return { passed: failed.length === 0, failedChecks: failed };
}

function evaluateBenchmarkGate(
  m: CalibrationStageGateMetrics,
): CalibrationStageGateResult {
  const failed: string[] = [];
  if (m.totalCases !== 60) failed.push('totalCases');
  if (m.runCases !== 60) failed.push('runCases');
  if (m.totalOutcomes !== 60) failed.push('totalOutcomes');
  if (m.parseCases !== 60) failed.push('parseCases');
  if (m.unsafeCompletionCount !== 0) failed.push('unsafeCompletionCount');
  if (m.failureCount !== 0) failed.push('failureCount');
  if (exceedsOrInvalidCount(m.catastrophicCount, 12)) failed.push('catastrophicCount');
  if (exceedsOrMissing(m.medianRelativeCalorieError, 0.25)) {
    failed.push('medianRelativeCalorieError');
  }
  if (exceedsOrMissing(m.p90RelativeCalorieError, 0.9)) {
    failed.push('p90RelativeCalorieError');
  }
  if (exceedsOrMissing(m.meanMacroRelativeError, 0.45)) {
    failed.push('meanMacroRelativeError');
  }
  if (exceedsOrMissing(m.meanMealMassRelativeError, 0.4)) {
    failed.push('meanMealMassRelativeError');
  }
  if (exceedsOrMissing(m.meanMealCarbDensityRelativeError, 0.7)) {
    failed.push('meanMealCarbDensityRelativeError');
  }
  if (exceedsOrMissing(m.meanMealFatDensityRelativeError, 0.35)) {
    failed.push('meanMealFatDensityRelativeError');
  }
  if (exceedsOrMissing(m.medianMealProteinRelativeError, 0.35)) {
    failed.push('medianMealProteinRelativeError');
  }
  if (exceedsOrMissing(m.medianMealCarbsRelativeError, 0.35)) {
    failed.push('medianMealCarbsRelativeError');
  }
  if (exceedsOrMissing(m.medianMealFatRelativeError, 0.35)) {
    failed.push('medianMealFatRelativeError');
  }
  if (m.mealOutcomeCount !== 36) failed.push('mealOutcomeCount');
  if (m.suppliedBarcodeOutcomeCount !== 12) failed.push('suppliedBarcodeOutcomeCount');
  if (m.labelOutcomeCount !== 12) failed.push('labelOutcomeCount');
  if (m.parsedMealCount !== 36) failed.push('parsedMealCount');
  if (m.mealMassEligibleCount !== 36) failed.push('mealMassEligibleCount');
  if (m.mealDensityCoverageCount !== 36) failed.push('mealDensityCoverageCount');
  if (m.mealCarbDensityEligibleCount !== 33) failed.push('mealCarbDensityEligibleCount');
  if (m.mealFatDensityEligibleCount !== 36) failed.push('mealFatDensityEligibleCount');
  if (m.visionCallCount !== 48) failed.push('visionCallCount');
  if (m.suppliedBarcodeImageCallCount !== 0) failed.push('suppliedBarcodeImageCallCount');
  if (m.suppliedBarcodeVisionCallCount !== 0) failed.push('suppliedBarcodeVisionCallCount');
  if (m.suppliedBarcodeLiveOffCallCount !== 0) {
    failed.push('suppliedBarcodeLiveOffCallCount');
  }
  return { passed: failed.length === 0, failedChecks: failed };
}

export function evaluateCalibrationStageGate(
  stage: StageName,
  metrics: CalibrationStageGateMetrics,
): CalibrationStageGateResult {
  switch (stage) {
    case 'development':
      return evaluateDevelopmentGate(metrics);
    case 'validation':
      return evaluateValidationGate(metrics);
    case 'benchmark':
      return evaluateBenchmarkGate(metrics);
    case 'preflight':
      return { passed: false, failedChecks: ['preflight-gate-not-defined'] };
    default: {
      const exhaustive: never = stage;
      throw new CalibrationFatalError(`calibration:unknown-stage:${String(exhaustive)}`);
    }
  }
}

// ── Meal-only metric aggregation ─────────────────────────────────────────────

const MEAL_MACRO_FIELDS = ['proteinG', 'carbsG', 'fatG'] as const;
type MealMacroField = (typeof MEAL_MACRO_FIELDS)[number];

export interface CalibrationMealMetrics {
  parsedMealCount: number;
  proteinEligibleCount: number;
  carbsEligibleCount: number;
  fatEligibleCount: number;
  medianMealProteinRelativeError?: number;
  medianMealCarbsRelativeError?: number;
  medianMealFatRelativeError?: number;
  proteinZeroTruthCount: number;
  carbsZeroTruthCount: number;
  fatZeroTruthCount: number;
  proteinZeroTruthMeanAbsoluteError?: number;
  proteinZeroTruthMedianAbsoluteError?: number;
  carbsZeroTruthMeanAbsoluteError?: number;
  carbsZeroTruthMedianAbsoluteError?: number;
  fatZeroTruthMeanAbsoluteError?: number;
  fatZeroTruthMedianAbsoluteError?: number;
}

function linearInterp(sorted: readonly number[], idx: number): number {
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi || hi >= sorted.length) return sorted[lo] as number;
  const frac = idx - lo;
  return (sorted[lo] as number) + frac * ((sorted[hi] as number) - (sorted[lo] as number));
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  return linearInterp(sorted, idx);
}

function medianOf(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return percentile(sorted, 50);
}

function meanOf(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function aggregateCalibrationMealMetrics(
  results: readonly NutritionCaseResult[],
): CalibrationMealMetrics {
  let parsedMealCount = 0;
  const relative: Record<MealMacroField, number[]> = {
    proteinG: [],
    carbsG: [],
    fatG: [],
  };
  const zeroTruthAbsolute: Record<MealMacroField, number[]> = {
    proteinG: [],
    carbsG: [],
    fatG: [],
  };

  for (const result of results) {
    if (result.prediction.parseStatus !== 'success') continue;
    if (result.prediction.source !== 'meal') continue;
    parsedMealCount += 1;
    for (const field of MEAL_MACRO_FIELDS) {
      const metric = result.numeric[field];
      const truthValue = result.truth?.[field];
      if (metric === undefined || truthValue === undefined) continue;
      if (truthValue > 0) {
        relative[field].push(metric.absoluteError / truthValue);
      } else if (truthValue === 0) {
        zeroTruthAbsolute[field].push(metric.absoluteError);
      }
    }
  }

  const medianProtein = medianOf(relative.proteinG);
  const medianCarbs = medianOf(relative.carbsG);
  const medianFat = medianOf(relative.fatG);
  const proteinZeroMean = meanOf(zeroTruthAbsolute.proteinG);
  const proteinZeroMedian = medianOf(zeroTruthAbsolute.proteinG);
  const carbsZeroMean = meanOf(zeroTruthAbsolute.carbsG);
  const carbsZeroMedian = medianOf(zeroTruthAbsolute.carbsG);
  const fatZeroMean = meanOf(zeroTruthAbsolute.fatG);
  const fatZeroMedian = medianOf(zeroTruthAbsolute.fatG);

  return {
    parsedMealCount,
    proteinEligibleCount: relative.proteinG.length,
    carbsEligibleCount: relative.carbsG.length,
    fatEligibleCount: relative.fatG.length,
    ...(medianProtein !== undefined ? { medianMealProteinRelativeError: medianProtein } : {}),
    ...(medianCarbs !== undefined ? { medianMealCarbsRelativeError: medianCarbs } : {}),
    ...(medianFat !== undefined ? { medianMealFatRelativeError: medianFat } : {}),
    proteinZeroTruthCount: zeroTruthAbsolute.proteinG.length,
    carbsZeroTruthCount: zeroTruthAbsolute.carbsG.length,
    fatZeroTruthCount: zeroTruthAbsolute.fatG.length,
    ...(proteinZeroMean !== undefined ? { proteinZeroTruthMeanAbsoluteError: proteinZeroMean } : {}),
    ...(proteinZeroMedian !== undefined ? { proteinZeroTruthMedianAbsoluteError: proteinZeroMedian } : {}),
    ...(carbsZeroMean !== undefined ? { carbsZeroTruthMeanAbsoluteError: carbsZeroMean } : {}),
    ...(carbsZeroMedian !== undefined ? { carbsZeroTruthMedianAbsoluteError: carbsZeroMedian } : {}),
    ...(fatZeroMean !== undefined ? { fatZeroTruthMeanAbsoluteError: fatZeroMean } : {}),
    ...(fatZeroMedian !== undefined ? { fatZeroTruthMedianAbsoluteError: fatZeroMedian } : {}),
  };
}
