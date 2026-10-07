/**
 * Task 7 hermetic preflight session (bounded slice).
 *
 * Composes the existing file store, ledger, ledger bridge, and preflight
 * primitive with success-only lock release. `runCalibrationPreflightSession`
 * uses a caller-supplied required safe-error recorder, while
 * `runCalibrationPreflightDurableSession` always records safe errors through
 * its own locked file ledger and rejects any caller recorder. No default
 * CLI, owner derivation, provider client, recovery, or retry lives here.
 */
import { createCalibrationLedger } from './calibration';
import type {
  CalibrationIdentity,
  CalibrationLedger,
  CalibrationOwner,
  CalibrationProfile,
  ReservationKey,
} from './calibration';
import { createProtocolCalibrationLedger } from './calibration';
import { createHash } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';
import { deriveCanonicalAllowedKeys } from './calibration-bootstrap';
import type { CalibrationPreparedContext } from './calibration-bootstrap';
import { executeCalibrationPreflight } from './calibration-cli';
import type { CalibrationPreflightStageResult } from './calibration-cli';
import {
  CALIBRATION_HISTORICAL_REFERENCE_SHA256,
  CALIBRATION_MANIFEST_SHA256,
  CALIBRATION_OFF_SNAPSHOT_LOCK_SHA256,
  CALIBRATION_PREFLIGHT_COMPATIBILITY_NOTES,
  CALIBRATION_PREFLIGHT_DATASET_ID,
  CALIBRATION_PREFLIGHT_FILE_NAMES,
  CALIBRATION_PROMPT_HASH,
  CALIBRATION_PUBLIC_MANIFEST_HASH,
  CALIBRATION_RESPONSE_SCHEMA_HASH,
  CALIBRATION_SOURCE_LOCK_SHA256,
  verifyCalibrationPreflightState,
} from './calibration-cli';
import type { CalibrationPreflightFileName } from './calibration-cli';
import { CALIBRATION_MODEL } from '../genai-adapter';
import { createFileCalibrationLedgerDeps } from './calibration-file-store';
import { createCalibrationPreflightLedgerHooks } from './calibration-preflight-ledger';
import type { CalibrationPreflightLedgerProviderHooks } from './calibration-preflight-ledger';
import { CalibrationFatalError } from './fatal-error';
import { captureCalibrationReportJournalEntry } from './calibration-report-journal';

export interface CalibrationPreflightSessionDeps
  extends CalibrationPreflightLedgerProviderHooks {
  baseDir: string;
  identity: CalibrationIdentity;
  owner: CalibrationOwner;
  firstDevelopmentCaseId: string;
}

export type CalibrationPreflightDurableSessionDeps = Omit<
  CalibrationPreflightSessionDeps,
  'recordSafeError'
> & { readonly recordSafeError?: never };

function invalid(): never {
  throw new CalibrationFatalError('calibration:preflight-session-input-invalid');
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const identityTextFields = [
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
] as const satisfies readonly (keyof CalibrationIdentity)[];

function assertSharedSessionDeps(
  value: Record<string, unknown>,
  identity: unknown,
  owner: unknown,
): void {
  if (
    typeof value.baseDir !== 'string' ||
    !value.baseDir.trim() ||
    typeof value.firstDevelopmentCaseId !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(value.firstDevelopmentCaseId) ||
    typeof value.countTokens !== 'function' ||
    typeof value.generateImage !== 'function' ||
    !record(identity) ||
    !record(owner)
  ) {
    invalid();
  }
  if (
    identity.protocolVersion !== 'v1' ||
    identity.provider !== 'vertex-ai' ||
    identity.model !== 'gemini-3.8-flash' ||
    identity.plannedImageCalls !== 146 ||
    identity.hardCeiling !== 300 ||
    identityTextFields.some((field) => {
      const part = identity[field];
      return typeof part !== 'string' || !part.trim();
    })
  ) {
    invalid();
  }
  if (
    typeof owner.hostname !== 'string' ||
    !owner.hostname.trim() ||
    typeof owner.bootId !== 'string' ||
    !owner.bootId.trim() ||
    typeof owner.pid !== 'number' ||
    !Number.isInteger(owner.pid) ||
    owner.pid <= 0 ||
    typeof owner.startTicks !== 'number' ||
    !Number.isInteger(owner.startTicks) ||
    owner.startTicks <= 0 ||
    typeof owner.acquiredAt !== 'string' ||
    !owner.acquiredAt.trim()
  ) {
    invalid();
  }
}

function assertSessionDeps(value: unknown): asserts value is CalibrationPreflightSessionDeps {
  if (!record(value)) invalid();
  assertSharedSessionDeps(value, value.identity, value.owner);
  if (typeof value.recordSafeError !== 'function') {
    invalid();
  }
}

function assertDurableSessionDeps(
  value: unknown,
): asserts value is CalibrationPreflightDurableSessionDeps {
  if (!record(value)) invalid();
  if ('recordSafeError' in value) {
    invalid();
  }
  assertSharedSessionDeps(value, value.identity, value.owner);
}

interface SharedSessionCoreDeps {
  baseDir: string;
  identity: CalibrationIdentity;
  owner: CalibrationOwner;
  firstDevelopmentCaseId: string;
  countTokens: CalibrationPreflightLedgerProviderHooks['countTokens'];
  generateImage: CalibrationPreflightLedgerProviderHooks['generateImage'];
}

async function runSharedPreflightSessionCore(
  deps: SharedSessionCoreDeps,
  resolveRecorder: (
    ledger: CalibrationLedger,
  ) => CalibrationPreflightLedgerProviderHooks['recordSafeError'],
): Promise<CalibrationPreflightStageResult> {
  const caseId = deps.firstDevelopmentCaseId;
  const allowedKeys: ReservationKey[] = [
    { stage: 'preflight', profile: 'LOW', caseId, sampleIndex: 1 },
    { stage: 'preflight', profile: 'MEDIUM', caseId, sampleIndex: 1 },
  ];
  const fileDeps = createFileCalibrationLedgerDeps(deps.baseDir);
  const ledger = createCalibrationLedger(fileDeps, deps.identity, allowedKeys);
  ledger.acquireLock(deps.owner);
  const recordSafeError = resolveRecorder(ledger);
  const hooks = createCalibrationPreflightLedgerHooks(ledger, {
    countTokens: deps.countTokens,
    generateImage: deps.generateImage,
    recordSafeError,
  });
  const result = await executeCalibrationPreflight(undefined, {
    firstDevelopmentCaseId: caseId,
    ...hooks,
  });
  ledger.releaseLock(deps.owner);
  return result;
}

export async function runCalibrationPreflightSession(
  deps: CalibrationPreflightSessionDeps,
): Promise<CalibrationPreflightStageResult> {
  assertSessionDeps(deps);
  return runSharedPreflightSessionCore(deps, () => deps.recordSafeError);
}

export async function runCalibrationPreflightDurableSession(
  deps: CalibrationPreflightDurableSessionDeps,
): Promise<CalibrationPreflightStageResult> {
  assertDurableSessionDeps(deps);
  return runSharedPreflightSessionCore(
    deps,
    (ledger) => (entry) => ledger.recordSafeError(entry),
  );
}

/**
 * Task 3 explicit strict protocol preflight session (one-shot Stage 0).
 *
 * Exact own deps only: `{ context, countTokens, generateImage }`. No
 * `baseDir`/`owner`/`identity`/`keyResolver`/`recorder`/`expected`/case
 * overrides, own or inherited. Works only on a genuine prepared frozen
 * context: native owner/baseDir canonical shape, exact 15 identity fields,
 * and the full `verifyCalibrationPreflightState({ files })` gate with NO
 * expected overrides run before any file-store or provider effect. The
 * context itself is not an ambient-Git/live proof: no native Git/subprocess
 * check runs inside this hermetic session.
 *
 * Internally derives the canonical resolver, creates the file store plus
 * the strict ledger, acquires the lock, and recovers interrupted
 * reservations without resending. Any prior token/image reservation refuses
 * with the exact static `calibration:preflight-already-started`, lock
 * retained, zero provider calls. Terminal-success LOW journals pin the
 * safe model version before append/completion; nothing pins from raw
 * provider/parse failure. Success completes the preflight stage and
 * releases the lock; every other outcome retains the lock with no retry.
 * Foreign getter/proxy/provider-response failures escape only as fresh
 * static causeless fatals. No SDK client creation or default activation.
 */
export async function runCalibrationProtocolPreflightSession(
  deps: unknown,
): Promise<CalibrationPreflightStageResult> {
  const validated = assertProtocolSessionDeps(deps);
  const snap = snapshotProtocolSessionContext(validated.context);

  const verified = await verifyCalibrationPreflightState({ files: snap.files });
  assertProtocolSessionBindings(snap, verified);

  const filesSnapshot = snap.files;
  const keyResolver = (selectedProfile?: CalibrationProfile): readonly ReservationKey[] =>
    deriveCanonicalAllowedKeys(filesSnapshot, selectedProfile);

  const fileDeps = createFileCalibrationLedgerDeps(snap.baseDir);
  const ledger = createProtocolCalibrationLedger(fileDeps, snap.identity, keyResolver);
  ledger.acquireLock(snap.owner);
  ledger.recoverAfterCrash();
  const counts = ledger.getCounts();
  if (counts.tokenCountReserved > 0 || counts.imageReserved > 0) {
    throw new CalibrationFatalError('calibration:preflight-already-started');
  }

  const ledgerRecorder: CalibrationPreflightLedgerProviderHooks['recordSafeError'] =
    (entry) => ledger.recordSafeError(entry);
  const baseHooks = createCalibrationPreflightLedgerHooks(ledger, {
    countTokens: validated.countTokens,
    generateImage: validated.generateImage,
    recordSafeError: ledgerRecorder,
  });
  const hooks = {
    ...baseHooks,
    appendResultJournal: (
      entry: Parameters<typeof ledger.appendResultJournal>[0],
    ): string | Promise<string> => {
      const snapshotted = snapshotProtocolJournalForPin(entry);
      if (snapshotted.shouldPin) {
        ledger.pinModelVersion(snapshotted.version);
      }
      return baseHooks.appendResultJournal(snapshotted.plain);
    },
  };

  let result: CalibrationPreflightStageResult;
  try {
    result = await executeCalibrationPreflight(undefined, {
      firstDevelopmentCaseId: snap.firstDevelopmentCaseId,
      ...hooks,
    });
  } catch (error) {
    throw sanitizeProtocolProviderError(error);
  }
  ledger.completeStage('preflight', { stage: 'preflight', passed: true, completedStages: [] });
  ledger.releaseLock(snap.owner);
  return result;
}

const PROTOCOL_SESSION_ALLOWED_DEPS = ['context', 'countTokens', 'generateImage'] as const;

const PROTOCOL_SESSION_FORBIDDEN_PROPS = [
  'baseDir',
  'owner',
  'identity',
  'keyResolver',
  'recordSafeError',
  'recorder',
  'expected',
  'firstDevelopmentCaseId',
  'caseId',
  'case',
] as const;

interface ValidatedProtocolSessionDeps {
  context: CalibrationPreparedContext;
  countTokens: CalibrationPreflightLedgerProviderHooks['countTokens'];
  generateImage: CalibrationPreflightLedgerProviderHooks['generateImage'];
}

function protocolInputInvalid(): never {
  throw new CalibrationFatalError('calibration:preflight-session-input-invalid');
}

const PROTOCOL_SAFE_PROVIDER_MESSAGES: ReadonlySet<string> = new Set([
  'calibration:preflight-token-reservation-failed',
  'calibration:preflight-token-call-failed',
  'calibration:preflight-token-result-invalid',
  'calibration:preflight-token-terminal-persist-failed',
  'calibration:preflight-image-reservation-failed',
  'calibration:preflight-image-call-failed',
  'calibration:preflight-prediction-invalid',
  'calibration:preflight-model-version-invalid',
  'calibration:preflight-model-version-mismatch',
  'calibration:preflight-image-terminal-persist-failed',
  'calibration:preflight-safe-error-persist-failed',
]);

function sanitizeProtocolProviderError(error: unknown): CalibrationFatalError {
  try {
    if (typeof error === 'object' && error !== null) {
      let message: unknown;
      try {
        message = (error as Record<string, unknown>)['message'];
      } catch {
        return new CalibrationFatalError('calibration:preflight-provider-response-invalid');
      }
      if (typeof message === 'string' && PROTOCOL_SAFE_PROVIDER_MESSAGES.has(message)) {
        return new CalibrationFatalError(message);
      }
    }
  } catch {
    return new CalibrationFatalError('calibration:preflight-provider-response-invalid');
  }
  return new CalibrationFatalError('calibration:preflight-provider-response-invalid');
}

const PROTOCOL_PIN_VERSION_PATTERN = /^[A-Za-z0-9_./-]{1,128}$/;
const PROTOCOL_PIN_HEX64 = /^[0-9a-f]{64}$/;

function protocolJournalInvalid(): never {
  throw new CalibrationFatalError('calibration:preflight-provider-response-invalid');
}

function isProtocolJournalNutrient(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

interface ProtocolJournalPinSnapshot {
  plain: Parameters<ReturnType<typeof createProtocolCalibrationLedger>['appendResultJournal']>[0];
  shouldPin: boolean;
  version: string;
}

/**
 * Fresh plain closed defensive snapshot of the terminal journal the primitive
 * built, validated BEFORE any pin. Provider getters are read exactly once
 * here: a getter valid during primitive validation but invalid at projection
 * (NaN/negative/string) fails here with no pin, no append, no MEDIUM. The
 * exact same plain snapshot is passed to append, so no provider getter fires
 * after the pin. Failed journals (errorCategory !== 'none', null prediction,
 * 'n/a' version) pass through without pin, preserving category markers.
 * Hash coherence is checked against the numeric projection so invalid values
 * cannot be masked through serialization.
 */
function snapshotProtocolJournalForPin(entry: unknown): ProtocolJournalPinSnapshot {
  try {
    let hasReportExtension = false;
    try {
      if (typeof entry === 'object' && entry !== null && !Array.isArray(entry)) {
        const descriptor = Object.getOwnPropertyDescriptor(entry, 'reportPrediction');
        if (descriptor !== undefined) {
          hasReportExtension = true;
        }
      }
    } catch {
      protocolJournalInvalid();
    }
    if (hasReportExtension) {
      const owned = captureCalibrationReportJournalEntry(
        entry,
      ) as unknown as Record<string, unknown>;
      const ownedKey = owned['key'] as Record<string, unknown>;
      const ownedError = owned['errorCategory'] as string;
      const ownedNormalized = owned['normalizedPrediction'] as Record<string, unknown> | null;
      const ownedVersion = owned['responseModelVersion'] as string;
      const shouldPinExtended =
        ownedError === 'none' &&
        ownedNormalized !== null &&
        (ownedKey['stage'] as string) === 'preflight' &&
        (ownedKey['profile'] as string) === 'LOW';
      if (shouldPinExtended) {
        return {
          plain: owned as unknown as ProtocolJournalPinSnapshot['plain'],
          shouldPin: true,
          version: ownedVersion,
        };
      }
      return {
        plain: owned as unknown as ProtocolJournalPinSnapshot['plain'],
        shouldPin: false,
        version: ownedVersion,
      };
    }
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      protocolJournalInvalid();
    }
    const record = entry as Record<string, unknown>;
    let keyRaw: unknown;
    let predictionHashRaw: unknown;
    let normalizedRaw: unknown;
    let latencyRaw: unknown;
    let errorCategoryRaw: unknown;
    let versionRaw: unknown;
    try {
      keyRaw = record['key'];
      predictionHashRaw = record['predictionHash'];
      normalizedRaw = record['normalizedPrediction'];
      latencyRaw = record['analysisLatencyMs'];
      errorCategoryRaw = record['errorCategory'];
      versionRaw = record['responseModelVersion'];
    } catch {
      protocolJournalInvalid();
    }
    let stage: unknown;
    let profile: unknown;
    let caseId: unknown;
    let sampleIndex: unknown;
    try {
      if (typeof keyRaw !== 'object' || keyRaw === null || Array.isArray(keyRaw)) {
        protocolJournalInvalid();
      }
      const keyRecord = keyRaw as Record<string, unknown>;
      stage = keyRecord['stage'];
      profile = keyRecord['profile'];
      caseId = keyRecord['caseId'];
      sampleIndex = keyRecord['sampleIndex'];
    } catch {
      protocolJournalInvalid();
    }
    if (
      typeof stage !== 'string' ||
      typeof profile !== 'string' ||
      typeof caseId !== 'string' ||
      typeof sampleIndex !== 'number' ||
      !Number.isInteger(sampleIndex)
    ) {
      protocolJournalInvalid();
    }
    const plainKey = {
      stage: stage as string,
      profile: profile as string,
      caseId: caseId as string,
      sampleIndex: sampleIndex as number,
    };
    if (typeof errorCategoryRaw !== 'string') {
      protocolJournalInvalid();
    }
    const errorCategory = errorCategoryRaw as string;
    if (
      typeof latencyRaw !== 'number' ||
      !Number.isFinite(latencyRaw) ||
      (latencyRaw as number) < 0
    ) {
      protocolJournalInvalid();
    }
    if (typeof versionRaw !== 'string') {
      protocolJournalInvalid();
    }
    const version = versionRaw as string;
    if (typeof predictionHashRaw !== 'string') {
      protocolJournalInvalid();
    }
    const predictionHash = predictionHashRaw as string;
    let plainNormalized: { kcal: number; proteinG: number; carbsG: number; fatG: number } | null =
      null;
    if (normalizedRaw !== null) {
      let kcal: unknown;
      let proteinG: unknown;
      let carbsG: unknown;
      let fatG: unknown;
      try {
        if (typeof normalizedRaw !== 'object' || Array.isArray(normalizedRaw)) {
          protocolJournalInvalid();
        }
        const predictionRecord = normalizedRaw as Record<string, unknown>;
        kcal = predictionRecord['kcal'];
        proteinG = predictionRecord['proteinG'];
        carbsG = predictionRecord['carbsG'];
        fatG = predictionRecord['fatG'];
      } catch {
        protocolJournalInvalid();
      }
      if (
        !isProtocolJournalNutrient(kcal) ||
        !isProtocolJournalNutrient(proteinG) ||
        !isProtocolJournalNutrient(carbsG) ||
        !isProtocolJournalNutrient(fatG)
      ) {
        protocolJournalInvalid();
      }
      plainNormalized = {
        kcal: kcal as number,
        proteinG: proteinG as number,
        carbsG: carbsG as number,
        fatG: fatG as number,
      };
    }
    const shouldPin =
      errorCategory === 'none' &&
      plainNormalized !== null &&
      (plainKey.stage as string) === 'preflight' &&
      (plainKey.profile as string) === 'LOW';
    if (shouldPin) {
      if (!PROTOCOL_PIN_VERSION_PATTERN.test(version)) {
        protocolJournalInvalid();
      }
      if (!PROTOCOL_PIN_HEX64.test(predictionHash)) {
        protocolJournalInvalid();
      }
      let expectedHash: string;
      try {
        expectedHash = createHash('sha256')
          .update(JSON.stringify(plainNormalized), 'utf8')
          .digest('hex');
      } catch {
        protocolJournalInvalid();
        expectedHash = '';
      }
      if (expectedHash !== predictionHash) {
        protocolJournalInvalid();
      }
      const plain = {
        key: plainKey,
        predictionHash,
        normalizedPrediction: plainNormalized,
        analysisLatencyMs: latencyRaw as number,
        errorCategory,
        responseModelVersion: version,
      };
      return {
        plain: plain as ProtocolJournalPinSnapshot['plain'],
        shouldPin: true,
        version,
      };
    }
    const plain = {
      key: plainKey,
      predictionHash,
      normalizedPrediction: plainNormalized,
      analysisLatencyMs: latencyRaw as number,
      errorCategory,
      responseModelVersion: version,
    };
    return { plain: plain as ProtocolJournalPinSnapshot['plain'], shouldPin: false, version };
  } catch {
    throw new CalibrationFatalError('calibration:preflight-provider-response-invalid');
  }
}

function assertProtocolSessionDeps(deps: unknown): ValidatedProtocolSessionDeps {
  try {
    if (typeof deps !== 'object' || deps === null || Array.isArray(deps)) {
      protocolInputInvalid();
    }
    let ownKeys: readonly string[];
    try {
      ownKeys = Object.getOwnPropertyNames(deps);
    } catch {
      protocolInputInvalid();
    }
    if (ownKeys.length !== PROTOCOL_SESSION_ALLOWED_DEPS.length) {
      protocolInputInvalid();
    }
    for (const allowed of PROTOCOL_SESSION_ALLOWED_DEPS) {
      let has: boolean;
      try {
        has = Object.prototype.hasOwnProperty.call(deps, allowed);
      } catch {
        protocolInputInvalid();
      }
      if (!has) {
        protocolInputInvalid();
      }
    }
    for (const key of ownKeys) {
      if (
        key !== 'context' &&
        key !== 'countTokens' &&
        key !== 'generateImage'
      ) {
        protocolInputInvalid();
      }
    }
    for (const forbidden of PROTOCOL_SESSION_FORBIDDEN_PROPS) {
      let present: boolean;
      let owned: boolean;
      try {
        present = (forbidden as string) in (deps as Record<string, unknown>);
        owned = Object.prototype.hasOwnProperty.call(deps, forbidden);
      } catch {
        protocolInputInvalid();
      }
      if (present && !owned) {
        protocolInputInvalid();
      }
    }
    let symbolCount: number;
    try {
      symbolCount = Object.getOwnPropertySymbols(deps).length;
    } catch {
      protocolInputInvalid();
    }
    if (symbolCount > 0) {
      protocolInputInvalid();
    }
    let context: unknown;
    let countTokens: unknown;
    let generateImage: unknown;
    try {
      context = (deps as Record<string, unknown>)['context'];
      countTokens = (deps as Record<string, unknown>)['countTokens'];
      generateImage = (deps as Record<string, unknown>)['generateImage'];
    } catch {
      protocolInputInvalid();
    }
    try {
      if (
        typeof context !== 'object' ||
        context === null ||
        Array.isArray(context) ||
        typeof countTokens !== 'function' ||
        typeof generateImage !== 'function'
      ) {
        protocolInputInvalid();
      }
    } catch {
      protocolInputInvalid();
    }
    return {
      context: context as CalibrationPreparedContext,
      countTokens: countTokens as ValidatedProtocolSessionDeps['countTokens'],
      generateImage: generateImage as ValidatedProtocolSessionDeps['generateImage'],
    };
  } catch {
    // Never retain a foreign typed fatal, revoked-proxy TypeError, or
    // reflection-trap error: every caller-structural failure becomes a fresh
    // exact static causeless input fatal. No instanceof check here: the class
    // is not trust and the check itself can trigger a prototype trap.
    throw new CalibrationFatalError('calibration:preflight-session-input-invalid');
  }
}

const PROTOCOL_HEX40 = /^[0-9a-f]{40}$/;
const PROTOCOL_HEX64 = /^[0-9a-f]{64}$/;
const PROTOCOL_CANONICAL_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const PROTOCOL_CASE_ID = /^[A-Za-z0-9_-]{1,128}$/;

const PROTOCOL_IDENTITY_FIELDS = [
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

interface ProtocolSessionSnapshot {
  baseDir: string;
  identity: CalibrationIdentity;
  owner: CalibrationOwner;
  firstDevelopmentCaseId: string;
  reportFiles: Record<string, string>;
  files: Record<CalibrationPreflightFileName, string>;
  report: {
    datasetId: string;
    publicManifestHash: string;
    promptHash: string;
    firstDevelopmentCaseId: string;
    compatibilityNotes: Array<{ key: string; detail: string }>;
    historicalCompatible: boolean;
  };
}

function snapshotProtocolSessionContext(context: CalibrationPreparedContext): ProtocolSessionSnapshot {
  let top: Record<string, unknown>;
  try {
    if (typeof context !== 'object' || context === null || Array.isArray(context)) {
      protocolInputInvalid();
    }
    top = context as unknown as Record<string, unknown>;
    if (!Object.isFrozen(context)) protocolInputInvalid();
  } catch {
    protocolInputInvalid();
  }
  let baseDirRaw: unknown;
  let identityRaw: unknown;
  let ownerRaw: unknown;
  let firstRaw: unknown;
  let reportRaw: unknown;
  let filesRaw: unknown;
  try {
    baseDirRaw = top['baseDir'];
    identityRaw = top['identity'];
    ownerRaw = top['owner'];
    firstRaw = top['firstDevelopmentCaseId'];
    reportRaw = top['report'];
    filesRaw = top['files'];
  } catch {
    protocolInputInvalid();
  }
  for (const nested of [identityRaw, ownerRaw, reportRaw, filesRaw]) {
    try {
      if (typeof nested !== 'object' || nested === null || Array.isArray(nested)) {
        protocolInputInvalid();
      }
      if (!Object.isFrozen(nested)) protocolInputInvalid();
    } catch {
      protocolInputInvalid();
    }
  }
  let notesRaw: unknown;
  try {
    let reportRecord: Record<string, unknown>;
    try {
      reportRecord = reportRaw as Record<string, unknown>;
    } catch {
      protocolInputInvalid();
    }
    try {
      notesRaw = reportRecord['compatibilityNotes'];
    } catch {
      protocolInputInvalid();
    }
    if (!Array.isArray(notesRaw) || !Object.isFrozen(notesRaw)) protocolInputInvalid();
    let notesLength: number;
    try {
      notesLength = (notesRaw as readonly unknown[]).length;
    } catch {
      protocolInputInvalid();
    }
    if (!Number.isInteger(notesLength)) protocolInputInvalid();
    for (let index = 0; index < notesLength; index += 1) {
      let note: unknown;
      try {
        note = (notesRaw as readonly unknown[])[index];
      } catch {
        protocolInputInvalid();
      }
      try {
        if (typeof note !== 'object' || note === null || Array.isArray(note)) {
          protocolInputInvalid();
        }
        if (!Object.isFrozen(note)) protocolInputInvalid();
      } catch {
        protocolInputInvalid();
      }
    }
  } catch {
    protocolInputInvalid();
  }

  let baseDir: string;
  try {
    if (typeof baseDirRaw !== 'string' || baseDirRaw.trim().length === 0) {
      protocolInputInvalid();
    }
    baseDir = baseDirRaw as string;
  } catch {
    protocolInputInvalid();
  }
  if (!isAbsolute(baseDir) || resolve(baseDir) !== baseDir) {
    protocolInputInvalid();
  }

  const owner = snapshotProtocolOwner(ownerRaw);
  const identity = snapshotProtocolIdentity(identityRaw);

  let firstDevelopmentCaseId: string;
  try {
    if (typeof firstRaw !== 'string' || !PROTOCOL_CASE_ID.test(firstRaw)) {
      protocolInputInvalid();
    }
    firstDevelopmentCaseId = firstRaw as string;
  } catch {
    protocolInputInvalid();
  }

  const files = snapshotProtocolFiles(filesRaw);
  const report = snapshotProtocolReport(reportRaw);

  if (report.firstDevelopmentCaseId !== firstDevelopmentCaseId) {
    protocolInputInvalid();
  }
  return { baseDir, identity, owner, firstDevelopmentCaseId, reportFiles: files, files, report };
}

function snapshotProtocolOwner(raw: unknown): CalibrationOwner {
  let hostname: unknown;
  let bootId: unknown;
  let pid: unknown;
  let startTicks: unknown;
  let acquiredAt: unknown;
  try {
    const record = raw as Record<string, unknown>;
    hostname = record['hostname'];
    bootId = record['bootId'];
    pid = record['pid'];
    startTicks = record['startTicks'];
    acquiredAt = record['acquiredAt'];
  } catch {
    protocolInputInvalid();
  }
  try {
    if (
      typeof hostname !== 'string' ||
      hostname.trim().length === 0 ||
      typeof bootId !== 'string' ||
      bootId.trim().length === 0 ||
      typeof pid !== 'number' ||
      !Number.isSafeInteger(pid) ||
      pid <= 0 ||
      typeof startTicks !== 'number' ||
      !Number.isSafeInteger(startTicks) ||
      startTicks <= 0 ||
      typeof acquiredAt !== 'string' ||
      !PROTOCOL_CANONICAL_ISO.test(acquiredAt)
    ) {
      protocolInputInvalid();
    }
  } catch {
    protocolInputInvalid();
  }
  let parsed: number;
  let roundTrip: string;
  try {
    parsed = Date.parse(acquiredAt as string);
    if (!Number.isFinite(parsed)) {
      protocolInputInvalid();
    }
    roundTrip = new Date(acquiredAt as string).toISOString();
  } catch {
    protocolInputInvalid();
  }
  if (roundTrip !== (acquiredAt as string)) {
    protocolInputInvalid();
  }
  return {
    hostname: hostname as string,
    bootId: bootId as string,
    pid: pid as number,
    startTicks: startTicks as number,
    acquiredAt: acquiredAt as string,
  };
}

function snapshotProtocolIdentity(raw: unknown): CalibrationIdentity {
  let values: Record<string, unknown>;
  try {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      protocolInputInvalid();
    }
    const record = raw as Record<string, unknown>;
    let keys: string[];
    try {
      keys = Object.keys(record);
    } catch {
      protocolInputInvalid();
    }
    if (keys.length !== PROTOCOL_IDENTITY_FIELDS.length) protocolInputInvalid();
    values = {};
    for (const field of PROTOCOL_IDENTITY_FIELDS) {
      let has: boolean;
      let value: unknown;
      try {
        has = Object.prototype.hasOwnProperty.call(record, field);
        value = record[field];
      } catch {
        protocolInputInvalid();
      }
      if (!has) protocolInputInvalid();
      values[field] = value;
    }
  } catch {
    protocolInputInvalid();
  }
  if (
    values['protocolVersion'] !== 'v1' ||
    values['provider'] !== 'vertex-ai' ||
    values['model'] !== CALIBRATION_MODEL ||
    values['plannedImageCalls'] !== 146 ||
    values['hardCeiling'] !== 300
  ) {
    protocolInputInvalid();
  }
  if (
    typeof values['implementationCommit'] !== 'string' ||
    !PROTOCOL_HEX40.test(values['implementationCommit'] as string) ||
    typeof values['functionsTreeId'] !== 'string' ||
    !PROTOCOL_HEX40.test(values['functionsTreeId'] as string)
  ) {
    protocolInputInvalid();
  }
  for (const field of [
    'datasetHash',
    'promptHash',
    'responseSchemaHash',
    'sourceLockHash',
    'manifestHash',
    'publicManifestHash',
    'snapshotLockHash',
    'historicalReferenceHash',
  ] as const) {
    if (typeof values[field] !== 'string' || !PROTOCOL_HEX64.test(values[field] as string)) {
      protocolInputInvalid();
    }
  }
  return values as unknown as CalibrationIdentity;
}

function snapshotProtocolFiles(raw: unknown): Record<CalibrationPreflightFileName, string> {
  const out: Record<string, string> = {};
  try {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      protocolInputInvalid();
    }
    const record = raw as Record<string, unknown>;
    let keyCount: number;
    try {
      keyCount = Object.keys(record).length;
    } catch {
      protocolInputInvalid();
    }
    if (keyCount !== CALIBRATION_PREFLIGHT_FILE_NAMES.length) {
      protocolInputInvalid();
    }
    for (const name of CALIBRATION_PREFLIGHT_FILE_NAMES) {
      let has: boolean;
      let value: unknown;
      try {
        has = Object.prototype.hasOwnProperty.call(record, name);
        value = record[name];
      } catch {
        protocolInputInvalid();
      }
      if (!has) protocolInputInvalid();
      if (typeof value !== 'string') protocolInputInvalid();
      out[name] = value as string;
    }
  } catch {
    protocolInputInvalid();
  }
  return out as Record<CalibrationPreflightFileName, string>;
}

function snapshotProtocolReport(raw: unknown): ProtocolSessionSnapshot['report'] {
  let datasetId: unknown;
  let publicManifestHash: unknown;
  let promptHash: unknown;
  let firstDevelopmentCaseId: unknown;
  let historicalCompatible: unknown;
  let notes: unknown;
  try {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      protocolInputInvalid();
    }
    const record = raw as Record<string, unknown>;
    datasetId = record['datasetId'];
    publicManifestHash = record['publicManifestHash'];
    promptHash = record['promptHash'];
    firstDevelopmentCaseId = record['firstDevelopmentCaseId'];
    historicalCompatible = record['historicalCompatible'];
    notes = record['compatibilityNotes'];
  } catch {
    protocolInputInvalid();
  }
  try {
    if (
      typeof datasetId !== 'string' ||
      typeof publicManifestHash !== 'string' ||
      typeof promptHash !== 'string' ||
      typeof firstDevelopmentCaseId !== 'string' ||
      historicalCompatible !== false ||
      !Array.isArray(notes)
    ) {
      protocolInputInvalid();
    }
  } catch {
    protocolInputInvalid();
  }
  const clonedNotes: Array<{ key: string; detail: string }> = [];
  try {
    const list = notes as readonly unknown[];
    let count: number;
    try {
      count = list.length;
    } catch {
      protocolInputInvalid();
    }
    if (count !== CALIBRATION_PREFLIGHT_COMPATIBILITY_NOTES.length) {
      protocolInputInvalid();
    }
    for (let index = 0; index < count; index += 1) {
      let noteRaw: unknown;
      try {
        noteRaw = list[index];
      } catch {
        protocolInputInvalid();
      }
      try {
        if (typeof noteRaw !== 'object' || noteRaw === null || Array.isArray(noteRaw)) {
          protocolInputInvalid();
        }
        const note = noteRaw as Record<string, unknown>;
        const key: unknown = note['key'];
        const detail: unknown = note['detail'];
        if (typeof key !== 'string' || typeof detail !== 'string') protocolInputInvalid();
        clonedNotes.push({ key: key as string, detail: detail as string });
      } catch {
        protocolInputInvalid();
      }
    }
  } catch {
    protocolInputInvalid();
  }
  if (clonedNotes.length !== CALIBRATION_PREFLIGHT_COMPATIBILITY_NOTES.length) {
    protocolInputInvalid();
  }
  return {
    datasetId: datasetId as string,
    publicManifestHash: publicManifestHash as string,
    promptHash: promptHash as string,
    firstDevelopmentCaseId: firstDevelopmentCaseId as string,
    compatibilityNotes: clonedNotes,
    historicalCompatible: false,
  };
}

function assertProtocolSessionBindings(
  snap: ProtocolSessionSnapshot,
  verified: {
    datasetId: string;
    publicManifestHash: string;
    promptHash: string;
    firstDevelopmentCaseId: string;
    compatibilityNotes: ReadonlyArray<{ key: string; detail: string }>;
    historicalCompatible: boolean;
  },
): void {
  if (
    verified.datasetId !== CALIBRATION_PREFLIGHT_DATASET_ID ||
    verified.datasetId !== snap.report.datasetId
  ) {
    protocolInputInvalid();
  }
  if (
    verified.publicManifestHash !== CALIBRATION_PUBLIC_MANIFEST_HASH ||
    verified.publicManifestHash !== snap.report.publicManifestHash
  ) {
    protocolInputInvalid();
  }
  if (
    verified.promptHash !== CALIBRATION_PROMPT_HASH ||
    verified.promptHash !== snap.report.promptHash
  ) {
    protocolInputInvalid();
  }
  if (
    verified.firstDevelopmentCaseId !== snap.firstDevelopmentCaseId ||
    verified.firstDevelopmentCaseId !== snap.report.firstDevelopmentCaseId ||
    !PROTOCOL_CASE_ID.test(verified.firstDevelopmentCaseId)
  ) {
    protocolInputInvalid();
  }
  if (verified.historicalCompatible !== false) {
    protocolInputInvalid();
  }
  if (verified.compatibilityNotes.length !== CALIBRATION_PREFLIGHT_COMPATIBILITY_NOTES.length) {
    protocolInputInvalid();
  }
  if (snap.report.compatibilityNotes.length !== CALIBRATION_PREFLIGHT_COMPATIBILITY_NOTES.length) {
    protocolInputInvalid();
  }
  for (
    let index = 0;
    index < CALIBRATION_PREFLIGHT_COMPATIBILITY_NOTES.length;
    index += 1
  ) {
    const expected = CALIBRATION_PREFLIGHT_COMPATIBILITY_NOTES[index] as {
      key: string;
      detail: string;
    };
    const actual = verified.compatibilityNotes[index] as
      | { key: string; detail: string }
      | undefined;
    const claimed = snap.report.compatibilityNotes[index] as
      | { key: string; detail: string }
      | undefined;
    if (
      actual === undefined ||
      claimed === undefined ||
      actual.key !== expected.key ||
      actual.detail !== expected.detail ||
      claimed.key !== expected.key ||
      claimed.detail !== expected.detail
    ) {
      protocolInputInvalid();
    }
  }
  if (
    snap.identity.datasetHash !== verified.publicManifestHash ||
    snap.identity.publicManifestHash !== verified.publicManifestHash ||
    snap.identity.promptHash !== verified.promptHash ||
    snap.identity.responseSchemaHash !== CALIBRATION_RESPONSE_SCHEMA_HASH ||
    snap.identity.sourceLockHash !== CALIBRATION_SOURCE_LOCK_SHA256 ||
    snap.identity.manifestHash !== CALIBRATION_MANIFEST_SHA256 ||
    snap.identity.snapshotLockHash !== CALIBRATION_OFF_SNAPSHOT_LOCK_SHA256 ||
    snap.identity.historicalReferenceHash !== CALIBRATION_HISTORICAL_REFERENCE_SHA256
  ) {
    protocolInputInvalid();
  }
}
