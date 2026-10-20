/** Unused opt-in native composition. No client, stage, reservation or lock acquisition. */
import { isAbsolute, resolve } from 'node:path';
import { createBenchmarkAuthorityCalibrationLedger, createRuntimeEvidenceCalibrationLedger } from './calibration';
import { prepareCalibrationBenchmarkHistory } from './calibration-benchmark-history';
import type { CalibrationRuntimeEvidenceLedger } from './calibration';
import {
  createCalibrationBootstrapReadDeps,
  deriveCanonicalAllowedKeys,
  deriveCanonicalReportOutcomePlan,
} from './calibration-bootstrap';
import type { CalibrationPreparedContext } from './calibration-bootstrap';
import {
  CALIBRATION_PREFLIGHT_FILE_NAMES,
  CALIBRATION_PREFLIGHT_DATASET_ID,
  CALIBRATION_PREFLIGHT_COMPATIBILITY_NOTES,
} from './calibration-cli';
import { createBenchmarkAuthorityFileCalibrationLedgerDeps, createRuntimeEvidenceFileCalibrationLedgerDeps } from './calibration-file-store';
import type { RuntimeEvidenceFileStoreOverrides } from './calibration-file-store';
import { prepareCalibrationStageReportArtifactVerifier } from './calibration-report-artifact-verification';
import { captureCalibrationRuntimeEvidenceHeader } from './calibration-runtime-evidence-codec';
import { CalibrationFatalError } from './fatal-error';

function invalid(): never {
  throw new CalibrationFatalError('calibration:runtime-evidence-native-input-invalid');
}

function record(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return invalid();
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== null && proto !== Object.prototype) return invalid();
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length || keys.some((k) => typeof k !== 'string' || !fields.includes(k))) return invalid();
  const owned: Record<string, unknown> = {};
  for (const field of fields) {
    const d = Object.getOwnPropertyDescriptor(value, field);
    if (d === undefined || d.enumerable !== true || !Object.hasOwn(d, 'value') || d.value === undefined) return invalid();
    owned[field] = d.value;
  }
  return owned;
}

function captureContext(params: unknown): CalibrationPreparedContext {
  const request = record(params, ['context']);
  const context = record(request.context, ['baseDir', 'identity', 'owner', 'firstDevelopmentCaseId', 'report', 'files']);
  if (typeof context.baseDir !== 'string' || context.baseDir.includes('\0') || !isAbsolute(context.baseDir)
    || resolve(context.baseDir) !== context.baseDir || typeof context.firstDevelopmentCaseId !== 'string') return invalid();
  // The public codec owns and validates all identity/owner primitives. This
  // temporary validation value is not a persisted header or initialization.
  const captured = captureCalibrationRuntimeEvidenceHeader({
    type: 'protocol_identity', identity: context.identity, owner: context.owner,
    at: '2000-01-01T00:00:00.000Z', reportAuthority: 'verified_artifacts_v1', runtimeEvidenceVersion: 1,
  });
  const files = record(context.files, CALIBRATION_PREFLIGHT_FILE_NAMES);
  for (const name of CALIBRATION_PREFLIGHT_FILE_NAMES) if (typeof files[name] !== 'string') return invalid();
  const report = record(context.report, ['datasetId', 'publicManifestHash', 'promptHash',
    'firstDevelopmentCaseId', 'compatibilityNotes', 'historicalCompatible']);
  if (report.datasetId !== CALIBRATION_PREFLIGHT_DATASET_ID || report.publicManifestHash !== captured.identity.publicManifestHash
    || report.promptHash !== captured.identity.promptHash || report.firstDevelopmentCaseId !== context.firstDevelopmentCaseId
    || report.historicalCompatible !== false) return invalid();
  const notes: unknown = report.compatibilityNotes;
  if (!Array.isArray(notes) || Object.getPrototypeOf(notes) !== Array.prototype) return invalid();
  const length = Object.getOwnPropertyDescriptor(notes, 'length');
  if (length === undefined || !Object.hasOwn(length, 'value') || length.value !== CALIBRATION_PREFLIGHT_COMPATIBILITY_NOTES.length
    || Reflect.ownKeys(notes).length !== length.value + 1) return invalid();
  const ownedNotes = CALIBRATION_PREFLIGHT_COMPATIBILITY_NOTES.map((expected, index) => {
    const d = Object.getOwnPropertyDescriptor(notes, String(index));
    if (d === undefined || d.enumerable !== true || !Object.hasOwn(d, 'value')) return invalid();
    const note = record(d.value, ['key', 'detail']);
    if (note.key !== expected.key || note.detail !== expected.detail) return invalid();
    return Object.freeze({ key: expected.key, detail: expected.detail });
  });
  return Object.freeze({
    baseDir: context.baseDir, identity: captured.identity, owner: captured.owner,
    firstDevelopmentCaseId: context.firstDevelopmentCaseId,
    files: Object.freeze(files),
    report: Object.freeze({ ...report, compatibilityNotes: Object.freeze(ownedNotes) }),
  }) as unknown as CalibrationPreparedContext;
}

export async function prepareNativeCalibrationRuntimeEvidenceLedger(
  params: unknown,
  overrides?: RuntimeEvidenceFileStoreOverrides,
): Promise<Readonly<CalibrationRuntimeEvidenceLedger>> {
  return prepareNativeLedger(params, overrides, false);
}

/** Unused explicit opt-in; no caller verifier, plans, reference path or flag. */
export async function prepareNativeCalibrationBenchmarkAuthorityLedger(
  params: unknown,
  overrides?: RuntimeEvidenceFileStoreOverrides,
): Promise<Readonly<CalibrationRuntimeEvidenceLedger>> {
  return prepareNativeLedger(params, overrides, true);
}

async function prepareNativeLedger(
  params: unknown,
  overrides: RuntimeEvidenceFileStoreOverrides | undefined,
  benchmarkAuthority: boolean,
): Promise<Readonly<CalibrationRuntimeEvidenceLedger>> {
  try {
    // Capture context AND low-level hooks synchronously before any await.
    const context = captureContext(params);
    if (benchmarkAuthority) {
      prepareCalibrationBenchmarkHistory({ historicalReferenceBytes: context.files['historical-reference'],
        historicalReferenceHash: context.identity.historicalReferenceHash });
    }
    const deps = benchmarkAuthority
      ? createBenchmarkAuthorityFileCalibrationLedgerDeps(context.baseDir, context.owner, overrides)
      : createRuntimeEvidenceFileCalibrationLedgerDeps(context.baseDir, context.owner, overrides);
    const readCurrentGitState = createCalibrationBootstrapReadDeps(context.baseDir).readGitState;
    const plans = Object.freeze({
      initial: deriveCanonicalReportOutcomePlan(context.files),
      LOW: deriveCanonicalReportOutcomePlan(context.files, 'LOW'),
      MEDIUM: deriveCanonicalReportOutcomePlan(context.files, 'MEDIUM'),
    });
    const verifier = await prepareCalibrationStageReportArtifactVerifier(context);
    const args: Parameters<typeof createRuntimeEvidenceCalibrationLedger> = [deps, context.identity,
      (profile) => deriveCanonicalAllowedKeys(context.files, profile),
      { getReportOutcomePlan: (profile) => profile === undefined ? plans.initial : plans[profile] },
      { verifyStageReportArtifacts: verifier.verify },
      { initialOwner: context.owner, plans, readCurrentGitState }];
    return benchmarkAuthority
      ? createBenchmarkAuthorityCalibrationLedger(...args, { historicalReferenceBytes: context.files['historical-reference'] })
      : createRuntimeEvidenceCalibrationLedger(...args);
  } catch {
    // Foreign reflection, parser and filesystem exceptions are never exposed.
    if (benchmarkAuthority) throw new CalibrationFatalError('calibration:benchmark-authority-native-input-invalid');
    return invalid();
  }
}
