import type { CalibrationPreparedContext, CalibrationBootstrapGitState } from './calibration-bootstrap';
import type { CalibrationOwner } from './calibration';
import type { CalibrationV2AdmissionInput } from './calibration-v2-admission';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { CalibrationFatalError } from './fatal-error';
import { assertValidBaseDir, validateGitSnapshot, assertCleanFunctionsTree, validateOwner } from './calibration-bootstrap';
import { admitCalibrationV2Candidate } from './calibration-v2-admission';
import { CALIBRATION_ACTIVATION_LOCK_V2_SHA256 } from './calibration-v2-lock';
import { hashNutritionEvalManifest, hashNutritionEvalPrompts } from './cli';
import {
  CALIBRATION_PREFLIGHT_DATASET_ID, CALIBRATION_PREFLIGHT_COMPATIBILITY_NOTES,
  CALIBRATION_PUBLIC_MANIFEST_HASH, CALIBRATION_PROMPT_HASH, CALIBRATION_RESPONSE_SCHEMA_HASH,
  CALIBRATION_OFF_SNAPSHOT_LOCK_SHA256, CALIBRATION_HISTORICAL_REFERENCE_SHA256,
} from './calibration-cli';
import { MEAL_ANALYSIS_PROMPT, LABEL_ANALYSIS_PROMPT, BARCODE_ANALYSIS_PROMPT } from '../prompts';
import { visionResponseJsonSchema } from '../nutrition-json-schema';

declare const registrationBrand: unique symbol;
export type CalibrationV2PreparedContext = CalibrationPreparedContext & { readonly [registrationBrand]: true };
export type CalibrationV2SharedAssetPath = 'functions/eval/nutrition/public-manifest.json' |
  'functions/eval/nutrition/off-snapshot-lock.json' | 'functions/eval/nutrition/historical-reference-v1.json';
export interface CalibrationV2BootstrapReadDeps {
  baseDir: string;
  readGitState: () => CalibrationBootstrapGitState;
  readAdmissionInputs: () => Promise<CalibrationV2AdmissionInput>;
  readCommittedSharedFile: (path: CalibrationV2SharedAssetPath, commit: string) => string;
  readOwner: () => CalibrationOwner;
}

const registeredContexts = new WeakMap<object, Readonly<CalibrationV2PreparedContext>>();
const sharedPaths = ['functions/eval/nutrition/public-manifest.json', 'functions/eval/nutrition/off-snapshot-lock.json',
  'functions/eval/nutrition/historical-reference-v1.json'] as const;
function fatal(): never { throw new CalibrationFatalError('calibration:v2-bootstrap-input-invalid'); }
function hash(text: string): string { return createHash('sha256').update(text, 'utf8').digest('hex'); }
function captureReaders(value: unknown): CalibrationV2BootstrapReadDeps {
  if (!value || typeof value !== 'object' || Array.isArray(value) || types.isProxy(value)) return fatal();
  const fields: Record<string, unknown> = {};
  for (const key of ['baseDir', 'readGitState', 'readAdmissionInputs', 'readCommittedSharedFile', 'readOwner']) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) return fatal();
    fields[key] = descriptor.value;
  }
  assertValidBaseDir(fields['baseDir']);
  for (const key of ['readGitState', 'readAdmissionInputs', 'readCommittedSharedFile', 'readOwner']) {
    if (typeof fields[key] !== 'function') return fatal();
  }
  return fields as unknown as CalibrationV2BootstrapReadDeps;
}

// Only this guarded factory can register an owned context. Trusted read ports
// support hermetic composition; no input pin or descriptor is a caller option.
export async function prepareCalibrationV2BootstrapContext(
  deps: CalibrationV2BootstrapReadDeps,
): Promise<Readonly<CalibrationV2PreparedContext>> {
  try {
    const { baseDir, readGitState, readAdmissionInputs, readCommittedSharedFile, readOwner } = captureReaders(deps);
    const nativeLockSha = CALIBRATION_ACTIVATION_LOCK_V2_SHA256;
    const first = validateGitSnapshot(readGitState()); assertCleanFunctionsTree(first.dirtyPaths);
    const owner = Object.freeze(validateOwner(readOwner()));
    const raw = await readAdmissionInputs();
    if (raw.expectedActivationLockSha256 !== nativeLockSha) return fatal();
    const activationLockBytes = Uint8Array.from(raw.activationLockBytes);
    const admitted = admitCalibrationV2Candidate({ ...raw, activationLockBytes,
      expectedActivationLockSha256: nativeLockSha });
    const [publicText, offText, historyText] = sharedPaths.map(path => {
      const text = readCommittedSharedFile(path, first.headCommit);
      if (typeof text !== 'string') return fatal();
      return text;
    }) as [string, string, string];
    const publicValue: unknown = JSON.parse(publicText);
    const publicHash = hashNutritionEvalManifest(publicValue);
    const prompt = JSON.stringify([MEAL_ANALYSIS_PROMPT, LABEL_ANALYSIS_PROMPT, BARCODE_ANALYSIS_PROMPT]);
    const response = JSON.stringify(['meal', 'label', 'barcode'].map(mode => visionResponseJsonSchema(mode as 'meal' | 'label' | 'barcode')));
    const promptHash = hashNutritionEvalPrompts(MEAL_ANALYSIS_PROMPT, LABEL_ANALYSIS_PROMPT, BARCODE_ANALYSIS_PROMPT);
    const shared = admitted.lock.shared;
    if (publicHash !== CALIBRATION_PUBLIC_MANIFEST_HASH || shared.publicManifestHash !== publicHash ||
        (publicValue as { datasetId?: unknown }).datasetId !== CALIBRATION_PREFLIGHT_DATASET_ID ||
        promptHash !== CALIBRATION_PROMPT_HASH || shared.promptHash !== promptHash ||
        hash(response) !== CALIBRATION_RESPONSE_SCHEMA_HASH || shared.responseSchemaHash !== hash(response) ||
        hash(offText) !== CALIBRATION_OFF_SNAPSHOT_LOCK_SHA256 || shared.offLockRawSha256 !== hash(offText) ||
        hash(historyText) !== CALIBRATION_HISTORICAL_REFERENCE_SHA256 || shared.historicalReferenceRawSha256 !== hash(historyText)) return fatal();
    const second = validateGitSnapshot(readGitState()); assertCleanFunctionsTree(second.dirtyPaths);
    if (first.implementationCommit !== second.implementationCommit || first.functionsTreeId !== second.functionsTreeId) return fatal();
    const identity = Object.freeze({ protocolVersion: 'v2', provider: admitted.lock.route.provider,
      model: admitted.lock.route.model, implementationCommit: first.implementationCommit, functionsTreeId: first.functionsTreeId,
      datasetHash: publicHash, publicManifestHash: publicHash, promptHash, responseSchemaHash: shared.responseSchemaHash,
      sourceLockHash: admitted.activationLockRawSha256, manifestHash: admitted.manifestRawSha256,
      snapshotLockHash: shared.offLockRawSha256, historicalReferenceHash: shared.historicalReferenceRawSha256,
      plannedImageCalls: admitted.lock.budget.plannedImageCalls, hardCeiling: admitted.lock.budget.hardImageCeiling });
    const firstDevelopmentCaseId = admitted.manifest.cases[0]!.id;
    const files = Object.freeze({ 'public-manifest': publicText, prompt, 'response-schema': response,
      'source-lock': new TextDecoder('utf-8', { fatal: true }).decode(activationLockBytes),
      'calibration-manifest': admitted.manifestText, 'off-lock': offText, 'historical-reference': historyText });
    const report = Object.freeze({ datasetId: CALIBRATION_PREFLIGHT_DATASET_ID, publicManifestHash: publicHash,
      promptHash, firstDevelopmentCaseId, historicalCompatible: false as const,
      compatibilityNotes: Object.freeze(CALIBRATION_PREFLIGHT_COMPATIBILITY_NOTES.map(note => Object.freeze({ ...note }))) });
    const context = Object.freeze({ baseDir, identity, owner, firstDevelopmentCaseId, report, files }) as
      Readonly<CalibrationV2PreparedContext>;
    registeredContexts.set(context, context);
    return context;
  } catch {
    // Reader/parser errors may carry caller data; expose only a static fatal.
    return fatal();
  }
}
export function requireCalibrationV2Context(value: unknown): Readonly<CalibrationV2PreparedContext> {
  // Map lookup uses object identity without reading even a revoked Proxy.
  const context = value !== null && typeof value === 'object' ? registeredContexts.get(value) : undefined;
  if (!context) throw new CalibrationFatalError('calibration:v2-context-unregistered');
  return context;
}
