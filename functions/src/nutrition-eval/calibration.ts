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
import type { NutritionCaseResult } from './schema';

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

export interface JournalEntry {
  key: ReservationKey;
  predictionHash: string;
  normalizedPrediction: Record<string, unknown> | null;
  analysisLatencyMs: number;
  errorCategory: CalibrationSafeErrorCategory;
  responseModelVersion: string;
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
  getCounts: () => { tokenCountReserved: number; imageReserved: number };
  appendResultJournal: (entry: JournalEntry) => string;
  complete: (key: ReservationKey, journalHash: string) => void;
  rebuildReport: () => { completed: ReservationKey[] };
  recoverAfterCrash: () => CalibrationRecoveryReport;
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
  'lock_recovery',
  'synthetic_reserved',
]);

interface ReservationRecord {
  key: ReservationKey;
  status: 'reserved' | 'completed' | 'interrupted_reservation';
  journalHash?: string;
}

export function createCalibrationLedger(
  deps: CalibrationLedgerDeps,
  identity: CalibrationIdentity,
  allowedKeys: readonly ReservationKey[],
): CalibrationLedger {
  assertFixedIdentity(identity);
  if (allowedKeys.length > identity.plannedImageCalls) {
    throw new CalibrationFatalError('calibration:allowed-keys-exceed-planned-ceiling');
  }
  const allowedKeySet = new Set(allowedKeys.map(canonicalReservationKey));
  if (allowedKeySet.size !== allowedKeys.length) {
    throw new CalibrationFatalError('calibration:allowed-keys-duplicate');
  }
  const reservations = new Map<string, ReservationRecord>();
  const reservationOrder: string[] = [];
  const journalHashesByKey = new Map<string, Set<string>>();
  const pendingJournalHashes = new Map<string, string>();
  let tokenCountReserved = 0;
  let imageReserved = 0;
  let heldOwner: CalibrationOwner | undefined;

  function requireLock(): void {
    if (heldOwner === undefined) {
      throw new CalibrationFatalError('calibration:lock-not-held');
    }
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

  let replayJournalEntries: readonly JournalEntry[];
  try {
    const result = deps.readJournalEntries();
    if (!Array.isArray(result)) {
      throw new CalibrationFatalError('calibration:journal-replay-not-array');
    }
    replayJournalEntries = result;
  } catch (error) {
    throw asFatal(error, 'calibration:journal-replay-read-failed');
  }
  for (const entry of replayJournalEntries) {
    if (!isValidJournalEntryRecord(entry)) {
      throw new CalibrationFatalError('calibration:journal-entry-malformed');
    }
    indexJournalHash(canonicalReservationKey(entry.key), computeJournalHash(entry));
  }

  let replayLedgerEvents: readonly unknown[];
  try {
    const result = deps.readLedgerEvents();
    if (!Array.isArray(result)) {
      throw new CalibrationFatalError('calibration:ledger-replay-not-array');
    }
    replayLedgerEvents = result;
  } catch (error) {
    throw asFatal(error, 'calibration:ledger-replay-read-failed');
  }
  for (const event of replayLedgerEvents) {
    replayLedgerEvent(event);
  }

  function safeReadLock(): CalibrationOwner | undefined {
    try {
      return deps.readLock();
    } catch (error) {
      throw asFatal(error, 'calibration:lock-read-failed');
    }
  }

  function safeWriteLockExclusive(owner: CalibrationOwner): void {
    try {
      deps.writeLockExclusive(owner);
    } catch (error) {
      throw asFatal(error, 'calibration:lock-write-failed');
    }
  }

  function safeArchiveLock(owner: CalibrationOwner): void {
    try {
      deps.archiveLock(owner);
    } catch (error) {
      throw asFatal(error, 'calibration:lock-archive-failed');
    }
  }

  function safeRemoveLock(owner: CalibrationOwner): void {
    try {
      deps.removeLock(owner);
    } catch (error) {
      throw asFatal(error, 'calibration:lock-remove-failed');
    }
  }

  function safeProbeOwnerLiveness(owner: CalibrationOwner): CalibrationLiveness {
    try {
      return deps.probeOwnerLiveness(owner);
    } catch (error) {
      throw asFatal(error, 'calibration:lock-probe-failed');
    }
  }

  function persistLedgerEvent(event: unknown): void {
    try {
      deps.appendLedgerEvent(event);
      deps.fsyncLedgerFile();
      deps.fsyncLedgerDir();
    } catch (error) {
      throw asFatal(error, 'calibration:ledger-persist-failed');
    }
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
    const effectiveRoot = opts?.runDir ?? deps.getRoot();
    if (effectiveRoot !== CALIBRATION_ROOT) {
      throw new CalibrationFatalError('calibration:root-redirected');
    }
    const existing = safeReadLock();
    if (existing === undefined) {
      safeWriteLockExclusive(owner);
      heldOwner = owner;
      return;
    }
    if (existing.hostname !== owner.hostname || existing.bootId !== owner.bootId) {
      throw new CalibrationFatalError('calibration:lock-cross-host');
    }
    const liveness = safeProbeOwnerLiveness(existing);
    if (liveness !== 'dead') {
      throw new CalibrationFatalError(`calibration:lock-held-${liveness}`);
    }
    persistLedgerEvent({
      type: 'lock_recovery',
      staleOwner: existing,
      recoveringOwner: owner,
      at: deps.nowIso(),
    });
    safeArchiveLock(existing);
    safeWriteLockExclusive(owner);
    heldOwner = owner;
  }

  function releaseLock(owner: CalibrationOwner): void {
    if (heldOwner === undefined || !sameOwner(heldOwner, owner)) {
      throw new CalibrationFatalError('calibration:lock-release-foreign-owner');
    }
    safeRemoveLock(heldOwner);
    heldOwner = undefined;
  }

  function assertIdentity(candidate: CalibrationIdentity): void {
    for (const field of IDENTITY_FIELDS) {
      if (candidate[field] !== identity[field]) {
        throw new CalibrationFatalError(`calibration:identity-drift:${field}`);
      }
    }
  }

  function assertGitState(state: CalibrationGitState): void {
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
    requireLock();
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
    requireLock();
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
    requireLock();
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
    requireLock();
    if (!isAllowedTokenKey(key)) {
      throw new CalibrationFatalError('calibration:token-reservation-invalid-key');
    }
    if (tokenCountReserved >= 1) {
      throw new CalibrationFatalError('calibration:token-reservation-duplicate');
    }
    persistLedgerEvent({ type: 'token_count_reserved', key, at: deps.nowIso() });
    tokenCountReserved += 1;
  }

  function getCounts(): { tokenCountReserved: number; imageReserved: number } {
    return { tokenCountReserved, imageReserved };
  }

  function appendResultJournal(entry: JournalEntry): string {
    requireLock();
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
    requireLock();
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
    const completed: ReservationKey[] = [];
    for (const id of reservationOrder) {
      const record = reservations.get(id);
      if (record === undefined || record.status !== 'completed') continue;
      if (record.journalHash === undefined) continue;
      const validHashes = journalHashesByKey.get(id);
      if (validHashes === undefined || !validHashes.has(record.journalHash)) continue;
      completed.push(record.key);
    }
    return { completed };
  }

  function recoverAfterCrash(): CalibrationRecoveryReport {
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
    const resumable = allowedKeys.filter(
      (key) => !reservations.has(canonicalReservationKey(key)),
    );
    return { interrupted, failed, resumable: [...resumable] };
  }

  return {
    acquireLock,
    releaseLock,
    assertIdentity,
    assertGitState,
    assertStageTransition,
    reserve,
    reserveSynthetic,
    reserveTokenCount,
    getCounts,
    appendResultJournal,
    complete,
    rebuildReport,
    recoverAfterCrash,
  };
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
