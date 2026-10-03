/**
 * Task 7 hermetic preflight session (bounded slice).
 *
 * Composes the existing file store, ledger, ledger bridge, and preflight
 * primitive with success-only lock release. The caller supplies the fixed
 * calibration identity, process owner, base directory, first development
 * case ID, provider callbacks, and required safe-error recorder. No default
 * CLI, owner derivation, provider client, recovery, or retry lives here.
 */
import { createCalibrationLedger } from './calibration';
import type {
  CalibrationIdentity,
  CalibrationOwner,
  ReservationKey,
} from './calibration';
import { executeCalibrationPreflight } from './calibration-cli';
import type { CalibrationPreflightStageResult } from './calibration-cli';
import { createFileCalibrationLedgerDeps } from './calibration-file-store';
import { createCalibrationPreflightLedgerHooks } from './calibration-preflight-ledger';
import type { CalibrationPreflightLedgerProviderHooks } from './calibration-preflight-ledger';
import { CalibrationFatalError } from './fatal-error';

export interface CalibrationPreflightSessionDeps
  extends CalibrationPreflightLedgerProviderHooks {
  baseDir: string;
  identity: CalibrationIdentity;
  owner: CalibrationOwner;
  firstDevelopmentCaseId: string;
}

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

function assertSessionDeps(value: unknown): asserts value is CalibrationPreflightSessionDeps {
  if (!record(value)) invalid();
  const identity = value.identity;
  const owner = value.owner;
  if (
    typeof value.baseDir !== 'string' ||
    !value.baseDir.trim() ||
    typeof value.firstDevelopmentCaseId !== 'string' ||
    !value.firstDevelopmentCaseId.trim() ||
    value.firstDevelopmentCaseId !== value.firstDevelopmentCaseId.trim() ||
    typeof value.countTokens !== 'function' ||
    typeof value.generateImage !== 'function' ||
    typeof value.recordSafeError !== 'function' ||
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

export async function runCalibrationPreflightSession(
  deps: CalibrationPreflightSessionDeps,
): Promise<CalibrationPreflightStageResult> {
  assertSessionDeps(deps);
  const caseId = deps.firstDevelopmentCaseId;
  const allowedKeys: ReservationKey[] = [
    { stage: 'preflight', profile: 'LOW', caseId, sampleIndex: 1 },
    { stage: 'preflight', profile: 'MEDIUM', caseId, sampleIndex: 1 },
  ];
  const fileDeps = createFileCalibrationLedgerDeps(deps.baseDir);
  const ledger = createCalibrationLedger(fileDeps, deps.identity, allowedKeys);
  ledger.acquireLock(deps.owner);
  const hooks = createCalibrationPreflightLedgerHooks(ledger, {
    countTokens: deps.countTokens,
    generateImage: deps.generateImage,
    recordSafeError: deps.recordSafeError,
  });
  const result = await executeCalibrationPreflight(undefined, {
    firstDevelopmentCaseId: caseId,
    ...hooks,
  });
  ledger.releaseLock(deps.owner);
  return result;
}
