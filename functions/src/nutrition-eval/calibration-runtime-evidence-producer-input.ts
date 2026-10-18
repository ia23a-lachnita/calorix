/** Pure owned input capture for the opt-in evidence producer. No native readers. */
import { isAbsolute, resolve } from 'node:path';
import type { GenAIAdapter } from '../genai-adapter';
import type { OffProduct } from '../off-client';
import type { CalibrationIdentity, CalibrationProfile, CalibrationRuntimeEvidenceLedger } from './calibration';
import { HARD_CALL_CEILING, PLANNED_IMAGE_CALLS } from './calibration';
import { deriveCanonicalReportOutcomePlan } from './calibration-bootstrap';
import type { CalibrationPreparedContext } from './calibration-bootstrap';
import {
  CALIBRATION_PREFLIGHT_COMPATIBILITY_NOTES,
  CALIBRATION_PREFLIGHT_DATASET_ID,
  CALIBRATION_PREFLIGHT_EXPECTED_IDENTITIES,
  CALIBRATION_PREFLIGHT_FILE_NAMES,
} from './calibration-cli';
import type { CalibrationPreflightFileName } from './calibration-cli';
import type { CalibrationPlannedReportOutcome, CalibrationReportOutcomeKey } from './calibration-report-state';
import { captureCalibrationRuntimeEvidenceHeader } from './calibration-runtime-evidence-codec';
import { CalibrationFatalError } from './fatal-error';

export interface CalibrationRuntimeEvidenceProducerDeps {
  readonly context: CalibrationPreparedContext;
  readonly ledger: Readonly<CalibrationRuntimeEvidenceLedger>;
  readonly selectedProfile?: CalibrationProfile;
  readonly loadImage: (key: Readonly<CalibrationReportOutcomeKey>) => Promise<Uint8Array>;
  readonly generateVision: GenAIAdapter['generateVision'];
  readonly lookupSnapshot: (barcode: string) => Readonly<OffProduct> | undefined;
}

const METHODS = [
  'getRuntimeEvidenceSnapshot', 'getStageReportSnapshot', 'getSelectedProfile',
  'startRuntimeAttempt', 'startRuntimeOperation', 'settleRuntimeOperation',
  'reserve', 'authorizeRuntimeRequest', 'pinModelVersion', 'finishRuntimeAttempt',
] as const;
export type ProducerLedgerMethods = Pick<CalibrationRuntimeEvidenceLedger, typeof METHODS[number]>;
export interface CapturedProducerInput {
  readonly context: CalibrationPreparedContext;
  readonly ledger: Readonly<ProducerLedgerMethods>;
  readonly selectedProfile?: CalibrationProfile;
  readonly plan: readonly CalibrationPlannedReportOutcome[];
  readonly loadImage: CalibrationRuntimeEvidenceProducerDeps['loadImage'];
  readonly generateVision: GenAIAdapter['generateVision'];
  readonly lookupSnapshot: CalibrationRuntimeEvidenceProducerDeps['lookupSnapshot'];
}

function invalid(): never {
  throw new CalibrationFatalError('calibration:runtime-evidence-producer-failed');
}

function plain(value: unknown): object {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return invalid();
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== null && proto !== Object.prototype) return invalid();
  return value;
}

function data(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  const object = plain(value);
  const names = Reflect.ownKeys(object);
  const allowed = new Set([...required, ...optional]);
  if (names.some((name) => typeof name !== 'string' || !allowed.has(name))) return invalid();
  const out: Record<string, unknown> = {};
  for (const name of names as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(object, name);
    if (descriptor === undefined || descriptor.enumerable !== true
      || !Object.hasOwn(descriptor, 'value') || descriptor.value === undefined) return invalid();
    out[name] = descriptor.value;
  }
  if (required.some((name) => !Object.hasOwn(out, name))) return invalid();
  return out;
}

function ledgerMethods(value: unknown): Readonly<ProducerLedgerMethods> {
  const receiver = plain(value);
  const owned: Record<string, unknown> = {};
  // Ignore other legitimate native methods. Capture only required own data
  // functions, retaining their original receiver without property lookups later.
  for (const name of METHODS) {
    const descriptor = Object.getOwnPropertyDescriptor(receiver, name);
    if (descriptor === undefined || descriptor.enumerable !== true
      || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'function') return invalid();
    const fn = descriptor.value as (...args: unknown[]) => unknown;
    owned[name] = (...args: unknown[]) => Reflect.apply(fn, receiver, args);
  }
  return Object.freeze(owned) as unknown as Readonly<ProducerLedgerMethods>;
}

export function captureProducerInput(deps: unknown): Readonly<CapturedProducerInput> {
  try {
    const request = data(deps, ['context', 'ledger', 'loadImage', 'generateVision', 'lookupSnapshot'], ['selectedProfile']);
    if (typeof request.loadImage !== 'function' || typeof request.generateVision !== 'function'
      || typeof request.lookupSnapshot !== 'function') return invalid();
    const selectedProfile = request.selectedProfile;
    if (Object.hasOwn(request, 'selectedProfile') && selectedProfile !== 'LOW' && selectedProfile !== 'MEDIUM') return invalid();
    const context = data(request.context, ['baseDir', 'identity', 'owner', 'firstDevelopmentCaseId', 'report', 'files']);
    const baseDir = context.baseDir;
    const firstDevelopmentCaseId = context.firstDevelopmentCaseId;
    if (typeof baseDir !== 'string' || baseDir.includes('\0') || !isAbsolute(baseDir) || resolve(baseDir) !== baseDir
      || typeof firstDevelopmentCaseId !== 'string') return invalid();
    // A pure existing closed codec validates/copies all identity and owner
    // primitives. This temporary value is never written or treated as a seal.
    const header = captureCalibrationRuntimeEvidenceHeader({
      type: 'protocol_identity', identity: context.identity, owner: context.owner,
      at: '2000-01-01T00:00:00.000Z', reportAuthority: 'verified_artifacts_v1', runtimeEvidenceVersion: 1,
    });
    const expected = CALIBRATION_PREFLIGHT_EXPECTED_IDENTITIES;
    const bindings: Partial<CalibrationIdentity> = {
      protocolVersion: 'v1', provider: 'vertex-ai', model: 'gemini-3.8-flash',
      plannedImageCalls: PLANNED_IMAGE_CALLS, hardCeiling: HARD_CALL_CEILING,
      datasetHash: expected.publicManifestHash, publicManifestHash: expected.publicManifestHash,
      promptHash: expected.promptHash, responseSchemaHash: expected.responseSchemaHash,
      sourceLockHash: expected.sourceLockHash, manifestHash: expected.calibrationManifestHash,
      snapshotLockHash: expected.offLockHash, historicalReferenceHash: expected.historicalReferenceHash,
    };
    for (const name of Object.keys(bindings) as Array<keyof CalibrationIdentity>) {
      if (header.identity[name] !== bindings[name]) return invalid();
    }
    const rawFiles = data(context.files, CALIBRATION_PREFLIGHT_FILE_NAMES);
    const files = {} as Record<CalibrationPreflightFileName, string>;
    for (const name of CALIBRATION_PREFLIGHT_FILE_NAMES) {
      const bytes = rawFiles[name];
      if (typeof bytes !== 'string') return invalid();
      files[name] = bytes;
    }
    const profile = selectedProfile as CalibrationProfile | undefined;
    const plan = deriveCanonicalReportOutcomePlan(files, profile);
    if (plan.find((row) => row.key.stage === 'preflight')?.key.caseId !== firstDevelopmentCaseId) return invalid();
    const report = data(context.report, ['datasetId', 'publicManifestHash', 'promptHash',
      'firstDevelopmentCaseId', 'compatibilityNotes', 'historicalCompatible']);
    if (report.datasetId !== CALIBRATION_PREFLIGHT_DATASET_ID || report.publicManifestHash !== header.identity.publicManifestHash
      || report.promptHash !== header.identity.promptHash || report.firstDevelopmentCaseId !== firstDevelopmentCaseId
      || report.historicalCompatible !== false) return invalid();
    const notes: unknown = report.compatibilityNotes;
    if (!Array.isArray(notes) || Object.getPrototypeOf(notes) !== Array.prototype) return invalid();
    const length = Object.getOwnPropertyDescriptor(notes, 'length');
    if (length === undefined || !Object.hasOwn(length, 'value') || length.value !== CALIBRATION_PREFLIGHT_COMPATIBILITY_NOTES.length
      || Reflect.ownKeys(notes).length !== length.value + 1) return invalid();
    const ownedNotes = CALIBRATION_PREFLIGHT_COMPATIBILITY_NOTES.map((expectedNote, index) => {
      const descriptor = Object.getOwnPropertyDescriptor(notes, String(index));
      if (descriptor === undefined || descriptor.enumerable !== true || !Object.hasOwn(descriptor, 'value')) return invalid();
      const note = data(descriptor.value, ['key', 'detail']);
      if (note.key !== expectedNote.key || note.detail !== expectedNote.detail) return invalid();
      return Object.freeze({ key: expectedNote.key, detail: expectedNote.detail });
    });
    const ownedContext: CalibrationPreparedContext = Object.freeze({
      baseDir, identity: header.identity, owner: header.owner, firstDevelopmentCaseId,
      files: Object.freeze(files),
      report: Object.freeze({
        datasetId: CALIBRATION_PREFLIGHT_DATASET_ID, publicManifestHash: header.identity.publicManifestHash,
        promptHash: header.identity.promptHash, firstDevelopmentCaseId,
        compatibilityNotes: Object.freeze(ownedNotes), historicalCompatible: false as const,
      }),
    });
    return Object.freeze({
      context: ownedContext, ledger: ledgerMethods(request.ledger),
      ...(profile === undefined ? {} : { selectedProfile: profile }), plan,
      loadImage: request.loadImage as CalibrationRuntimeEvidenceProducerDeps['loadImage'],
      generateVision: request.generateVision as GenAIAdapter['generateVision'],
      lookupSnapshot: request.lookupSnapshot as CalibrationRuntimeEvidenceProducerDeps['lookupSnapshot'],
    });
  } catch {
    return invalid();
  }
}

export function captureProducerOutcomeKey(
  value: unknown, plan: CapturedProducerInput['plan'],
): Readonly<CalibrationReportOutcomeKey> {
  try {
    const key = data(value, ['stage', 'profile', 'caseId', 'sampleIndex']);
    const row = plan.find((candidate) => candidate.key.stage === key.stage && candidate.key.profile === key.profile
      && candidate.key.caseId === key.caseId && candidate.key.sampleIndex === key.sampleIndex);
    if (row === undefined) return invalid();
    return Object.freeze({ ...row.key });
  } catch {
    return invalid();
  }
}

export function assertProducerExecutionIdentity(
  input: Readonly<CapturedProducerInput>, key: Readonly<CalibrationReportOutcomeKey>,
): void {
  try {
    if (input.ledger.getSelectedProfile() !== input.selectedProfile) return invalid();
    const runtime = input.ledger.getRuntimeEvidenceSnapshot();
    if (runtime.activeAttempt !== null) return invalid();
    for (const name of Object.keys(input.context.owner) as Array<keyof CalibrationPreparedContext['owner']>) {
      if (runtime.owner[name] !== input.context.owner[name]) return invalid();
    }
    const stage = input.ledger.getStageReportSnapshot(key.stage, key.profile);
    for (const name of Object.keys(input.context.identity) as Array<keyof CalibrationIdentity>) {
      if (stage.identity[name] !== input.context.identity[name]) return invalid();
    }
  } catch {
    return invalid();
  }
}
