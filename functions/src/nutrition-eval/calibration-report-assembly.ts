/** Pure reconstruction: no filesystem, clock, provider, normalization or ledger effects. */
import type { CalibrationPreparedContext } from './calibration-bootstrap';
import { deriveCanonicalReportOutcomePlan } from './calibration-bootstrap';
import type { CalibrationProfile, StageName } from './calibration';
import { captureCalibrationStageReportSnapshot } from './calibration-report-state';
import type { CalibrationStageReportSnapshot } from './calibration-report-state';
import {
  CALIBRATION_PREFLIGHT_FILE_NAMES, CALIBRATION_MANIFEST_SHA256,
  CALIBRATION_PUBLIC_MANIFEST_HASH, CALIBRATION_PREFLIGHT_EXPECTED_IDENTITIES,
  verifyCalibrationPreflightState,
} from './calibration-cli';
import type { CalibrationPreflightFileName } from './calibration-cli';
import { CalibrationFatalError } from './fatal-error';
import { buildNutritionEvalReport, renderNutritionEvalJson, renderNutritionEvalMarkdown } from './report';
import { scoreNutritionCase } from './scorer';
import { CALIBRATION_PROTOCOL_VERSION, parseNutritionEvalManifest, StrictCalibrationManifestSchema } from './schema';
import type { CalibrationInfo, NutritionEvalCase, NutritionEvalReport, NutritionPrediction } from './schema';

export interface AssembleCalibrationStageReportParams {
  readonly stage: StageName;
  readonly profile: CalibrationProfile;
  readonly context: Readonly<CalibrationPreparedContext>;
  readonly readSnapshot: (stage: StageName, profile: CalibrationProfile) => CalibrationStageReportSnapshot;
}
export interface ReconstructCalibrationStageReportParams {
  readonly stage: StageName;
  readonly profile: CalibrationProfile;
  readonly snapshot: CalibrationStageReportSnapshot;
}
export interface CalibrationStageReportReconstructor {
  readonly reconstruct: (params: unknown) => NutritionEvalReport;
}
const INVALID = 'calibration:stage-report-invalid';
const INCOMPLETE = 'calibration:stage-report-incomplete';
const IDENTITY_FIELDS = ['protocolVersion', 'provider', 'model', 'implementationCommit', 'functionsTreeId',
  'datasetHash', 'promptHash', 'responseSchemaHash', 'sourceLockHash', 'manifestHash',
  'publicManifestHash', 'snapshotLockHash', 'historicalReferenceHash', 'plannedImageCalls', 'hardCeiling'] as const;

/** Capture once, rejecting every hidden/symbol/accessor/foreign-prototype field. */
function ownRecord(value: unknown, fields: readonly string[]): Record<string, unknown> {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error();
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new Error();
    const keys = Reflect.ownKeys(value);
    if (keys.length !== fields.length || keys.some((key) => typeof key !== 'string' || !fields.includes(key))) throw new Error();
    const owned: Record<string, unknown> = {};
    for (const key of fields) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || descriptor.enumerable !== true || !('value' in descriptor) || descriptor.value === undefined) throw new Error();
      owned[key] = descriptor.value;
    }
    return owned;
  } catch { throw new CalibrationFatalError(INVALID); }
}
function freezeOwned(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  for (const child of Object.values(value)) freezeOwned(child);
  Object.freeze(value);
}
function tuple(caseId: string, sample: number): string { return `${caseId}|${sample}`; }

/** Owned, frozen source populations captured once before the first await. */
type OwnedTrainingCase = NutritionEvalCase & { readonly group: string };
interface OwnedReportSource {
  readonly identity: Readonly<Record<string, unknown>>;
  readonly firstDevelopmentCaseId: string;
  readonly trainingCases: readonly OwnedTrainingCase[];
  readonly publicCases: readonly NutritionEvalCase[];
  readonly trainingDatasetId: string;
  readonly publicDatasetId: string;
}

/**
 * ONE shared synchronous snapshot-to-report body. Both the prepared
 * reconstructor and the legacy async wrapper delegate here; it allocates all
 * per-call maps/results and never retains or freezes caller data.
 */
function buildCalibrationStageReport(
  source: OwnedReportSource,
  rawStage: unknown,
  rawProfile: unknown,
  rawSnapshot: unknown,
): NutritionEvalReport {
  if ((rawStage !== 'preflight' && rawStage !== 'development' && rawStage !== 'validation' && rawStage !== 'benchmark') ||
    (rawProfile !== 'LOW' && rawProfile !== 'MEDIUM')) {
    throw new CalibrationFatalError(INVALID);
  }
  const stage: StageName = rawStage;
  const profile: CalibrationProfile = rawProfile;
  let snapshot: CalibrationStageReportSnapshot;
  try { snapshot = captureCalibrationStageReportSnapshot(rawSnapshot); }
  catch { throw new CalibrationFatalError(INVALID); }
  if (snapshot.stage !== stage || snapshot.profile !== profile ||
    IDENTITY_FIELDS.some((field) => snapshot.identity[field] !== source.identity[field]) ||
    ((stage === 'validation' || stage === 'benchmark') && snapshot.selectedProfile !== profile)) {
    throw new CalibrationFatalError(INVALID);
  }
  if (snapshot.startedAt === undefined || snapshot.counts.imageCallsPending !== 0) throw new CalibrationFatalError(INCOMPLETE);
  const sourceCases = stage === 'benchmark' ? source.publicCases : source.trainingCases.filter((row) =>
    stage === 'preflight' ? row.id === source.firstDevelopmentCaseId : row.group === stage);
  const datasetId = stage === 'benchmark' ? source.publicDatasetId : source.trainingDatasetId;
  const samples = stage === 'preflight' || stage === 'development' ? [1] : [1, 2, 3];
  const casesById = new Map(sourceCases.map((evalCase) => [evalCase.id, evalCase]));
  const predictions = new Map<string, NutritionPrediction>();
  const errors = new Map<string, CalibrationInfo['safeErrors'] extends Array<infer T> | undefined ? T : never>();
  for (const row of [...snapshot.images, ...snapshot.nonReservations]) {
    const evalCase = casesById.get(row.key.caseId);
    const id = tuple(row.key.caseId, row.key.sampleIndex);
    if (evalCase === undefined || row.key.stage !== stage || row.key.profile !== profile ||
      !samples.includes(row.key.sampleIndex) || predictions.has(id)) throw new CalibrationFatalError(INVALID);
    let prediction: NutritionPrediction;
    if ('status' in row) {
      if (evalCase.scanMode === 'barcode') throw new CalibrationFatalError(INVALID);
      const category = row.status === 'interrupted_reservation' ? 'interrupted_reservation' : row.journal.errorCategory;
      if (category !== 'none') errors.set(id, { caseId: row.key.caseId, sampleIndex: row.key.sampleIndex, errorCategory: category });
      prediction = row.status === 'interrupted_reservation' ? {
        parseStatus: 'failure', source: evalCase.scanMode, decision: 'error', failureCategory: 'runner',
        failureCode: 'interrupted_reservation', sampleIndex: row.key.sampleIndex, cached: false,
      } : row.journal.reportPrediction!;
    } else {
      prediction = row.prediction;
      if (row.reason === 'dataset') {
        if (evalCase.scanMode === 'barcode' || prediction.parseStatus !== 'failure' || prediction.failureCategory !== 'dataset') throw new CalibrationFatalError(INVALID);
      } else if (evalCase.scanMode !== 'barcode' || (prediction.parseStatus === 'failure' &&
        (prediction.failureCategory !== 'product' || (prediction.failureCode !== 'off_product_invalid' && prediction.failureCode !== 'off_product_not_found')))) {
        throw new CalibrationFatalError(INVALID);
      }
    }
    if (prediction.source !== evalCase.scanMode || prediction.sampleIndex !== row.key.sampleIndex || prediction.cached !== false) throw new CalibrationFatalError(INVALID);
    predictions.set(id, prediction);
  }
  if (predictions.size !== sourceCases.length * samples.length) throw new CalibrationFatalError(INCOMPLETE);
  const results = sourceCases.flatMap((evalCase) => samples.map((sample) => {
    const p = predictions.get(tuple(evalCase.id, sample));
    if (p === undefined) throw new CalibrationFatalError(INCOMPLETE);
    return scoreNutritionCase(evalCase, p);
  }));
  const safeErrors = results.flatMap((row) => {
    const error = errors.get(tuple(row.caseId, row.prediction.sampleIndex!));
    return error === undefined ? [] : [error];
  });
  const measuredCases = results.filter((row) => row.prediction.latencyMs !== undefined).length;
  const timestamp = snapshot.startedAt;
  try {
    const report = buildNutritionEvalReport(results, {
      runId: `calibration-${stage}-${profile.toLowerCase()}-${snapshot.identity.implementationCommit.slice(0, 12)}-${timestamp.replace(/[^0-9TZ]/g, '')}`,
      timestamp, datasetId, datasetHash: stage === 'benchmark' ? CALIBRATION_PUBLIC_MANIFEST_HASH : CALIBRATION_MANIFEST_SHA256,
      adapterModelId: 'gemini-3.8-flash', promptHash: snapshot.identity.promptHash,
      codeSha: snapshot.identity.implementationCommit, samples: samples.length, baselineOnly: false,
      publicCases: sourceCases.length, privateCases: 0,
      calibration: { protocolVersion: CALIBRATION_PROTOCOL_VERSION, project: 'calorix-xurschnell', location: 'us',
        model: 'gemini-3.8-flash', thinkingLevel: profile, schemaHash: snapshot.identity.responseSchemaHash,
        stage, imageCallsReserved: snapshot.counts.imageCallsReserved, imageCallsCompleted: snapshot.counts.imageCallsCompleted,
        imageCallsFailed: snapshot.counts.imageCallsFailed, safeErrors,
        latencyCoverage: { measuredCases, missingCases: results.length - measuredCases } },
    });
    renderNutritionEvalJson(report); renderNutritionEvalMarkdown(report);
    freezeOwned(report); return report;
  } catch { throw new CalibrationFatalError(INVALID); }
}

/** Frozen closure retains ONLY the owned source context. */
function createCalibrationStageReportReconstructor(source: OwnedReportSource): Readonly<CalibrationStageReportReconstructor> {
  const reconstruct = (params: unknown): NutritionEvalReport => {
    const request = ownRecord(params, ['stage', 'profile', 'snapshot']);
    return buildCalibrationStageReport(source, request.stage, request.profile, request.snapshot);
  };
  return Object.freeze({ reconstruct });
}

/**
 * Owns and freezes the verified source once. All caller/identity/files
 * primitives are captured before the first await; the returned closure keeps
 * only owned identity, source populations and dataset identifiers.
 */
export async function prepareCalibrationStageReportReconstructor(
  context: unknown,
): Promise<Readonly<CalibrationStageReportReconstructor>> {
  const owned = ownRecord(context, ['baseDir', 'identity', 'owner', 'firstDevelopmentCaseId', 'report', 'files']);
  const identity = ownRecord(owned.identity, IDENTITY_FIELDS);
  const rawFiles = ownRecord(owned.files, CALIBRATION_PREFLIGHT_FILE_NAMES);
  const files = {} as Record<CalibrationPreflightFileName, string>;
  for (const name of CALIBRATION_PREFLIGHT_FILE_NAMES) {
    const text = rawFiles[name];
    if (typeof text !== 'string') throw new CalibrationFatalError(INVALID);
    files[name] = text;
  }
  // Capture all primitive identities before the first await, not caller-owned values later.
  if (typeof identity.implementationCommit !== 'string' || !/^[0-9a-f]{40}$/.test(identity.implementationCommit) ||
    typeof identity.functionsTreeId !== 'string' || !/^[0-9a-f]{40}$/.test(identity.functionsTreeId)) throw new CalibrationFatalError(INVALID);
  const pinned = CALIBRATION_PREFLIGHT_EXPECTED_IDENTITIES;
  const expectedIdentity: Record<string, unknown> = {
    protocolVersion: 'v1', provider: 'vertex-ai', model: 'gemini-3.8-flash',
    implementationCommit: identity.implementationCommit, functionsTreeId: identity.functionsTreeId,
    datasetHash: pinned.publicManifestHash, promptHash: pinned.promptHash, responseSchemaHash: pinned.responseSchemaHash,
    sourceLockHash: pinned.sourceLockHash, manifestHash: pinned.calibrationManifestHash,
    publicManifestHash: pinned.publicManifestHash, snapshotLockHash: pinned.offLockHash,
    historicalReferenceHash: pinned.historicalReferenceHash, plannedImageCalls: 146, hardCeiling: 300,
  };
  if (IDENTITY_FIELDS.some((field) => identity[field] !== expectedIdentity[field])) throw new CalibrationFatalError(INVALID);
  const firstDevelopmentCaseId = owned.firstDevelopmentCaseId;
  try {
    const verified = await verifyCalibrationPreflightState({ files });
    if (firstDevelopmentCaseId !== verified.firstDevelopmentCaseId) throw new Error();
    const training = StrictCalibrationManifestSchema.parse(JSON.parse(files['calibration-manifest']));
    const publicManifest = parseNutritionEvalManifest(JSON.parse(files['public-manifest']));
    // Source planner additionally enforces canonical manifests' closed-key policy.
    deriveCanonicalReportOutcomePlan(files);
    const source: OwnedReportSource = {
      identity: Object.freeze({ ...identity }),
      firstDevelopmentCaseId: verified.firstDevelopmentCaseId,
      trainingCases: training.cases,
      publicCases: publicManifest.cases,
      trainingDatasetId: training.datasetId,
      publicDatasetId: publicManifest.datasetId,
    };
    freezeOwned(source);
    return createCalibrationStageReportReconstructor(source);
  } catch { throw new CalibrationFatalError(INVALID); }
}

export async function assembleCalibrationStageReport(params: unknown): Promise<NutritionEvalReport> {
  const request = ownRecord(params, ['stage', 'profile', 'context', 'readSnapshot']);
  const stage = request.stage;
  const profile = request.profile;
  if ((stage !== 'preflight' && stage !== 'development' && stage !== 'validation' && stage !== 'benchmark') ||
    (profile !== 'LOW' && profile !== 'MEDIUM') || typeof request.readSnapshot !== 'function') {
    throw new CalibrationFatalError(INVALID);
  }
  const readSnapshot = request.readSnapshot as AssembleCalibrationStageReportParams['readSnapshot'];
  // The factory captures descriptors/source synchronously before it suspends.
  const ready = await prepareCalibrationStageReportReconstructor(request.context);
  let snapshot: unknown;
  try { snapshot = readSnapshot(stage, profile); }
  catch { throw new CalibrationFatalError('calibration:stage-report-read-failed'); }
  return ready.reconstruct({ stage, profile, snapshot });
}
