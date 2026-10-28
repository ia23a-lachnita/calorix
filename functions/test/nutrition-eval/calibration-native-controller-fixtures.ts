/** Test-only raw SDK/media observations over real native authority and committed assets. */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CountTokensResponse, GenerateContentResponse } from '@google/genai';
import { vi } from 'vitest';
import * as genAI from '../../src/genai-adapter';
import * as bootstrap from '../../src/nutrition-eval/calibration-bootstrap';
import * as assets from '../../src/nutrition-eval/assets';
import * as snapshots from '../../src/nutrition-eval/calibration-off-snapshot-store';
import { CALIBRATION_ROOT } from '../../src/nutrition-eval/calibration';
import type { CalibrationProfile, CalibrationRuntimeEvidenceLedger, StageName } from '../../src/nutrition-eval/calibration';
import type { CalibrationPreparedContext } from '../../src/nutrition-eval/calibration-bootstrap';
import type { CalibrationReportOutcomeKey } from '../../src/nutrition-eval/calibration-report-state';
import type { CalibrationOffSnapshotPath } from '../../src/nutrition-eval/calibration-off-snapshot-store';
import type { OffSnapshotStore } from '../../src/nutrition-eval/off-snapshot-store';
import { prepareNativeCalibrationBenchmarkAuthorityLedger } from '../../src/nutrition-eval/calibration-runtime-evidence-ledger';
import { parseNutritionEvalManifest, StrictCalibrationManifestSchema } from '../../src/nutrition-eval/schema';
import type { NutritionEvalCase } from '../../src/nutrition-eval/schema';
import { makeMiniGitRepoTask4 } from './calibration-runtime-evidence-fixtures';
// Erased: fixture controls run before the production driver module exists.
import type { CalibrationSdkMethodCounts, CalibrationStageDriverDeps } from '../../src/nutrition-eval/calibration-stage-driver';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const actualFactory = genAI.createCalibrationGenAIClient;
const actualReadDeps = bootstrap.createCalibrationBootstrapReadDeps;
const actualSnapshotStore = snapshots.prepareCalibrationOffSnapshotStore;
const snapshotPaths: readonly CalibrationOffSnapshotPath[] = [
  'functions/eval/nutrition/off-snapshots/3017624010701.json',
  'functions/eval/nutrition/off-snapshots/5449000000996.json',
  'functions/eval/nutrition/off-snapshots/4056489686941.json',
  'functions/eval/nutrition/off-snapshots/7622210449283.json',
];

export type ControllerVisionRequest = Parameters<ReturnType<typeof actualFactory>['models']['generateContent']>[0];
export type ControllerTokenRequest = Parameters<ReturnType<typeof actualFactory>['models']['countTokens']>[0];
export interface ControllerFixtureOptions {
  winner: CalibrationProfile;
  extraTransportOnVision?: number;
}
type ImageObservation = Readonly<{ stage: StageName | undefined; caseId: string; key?: Readonly<CalibrationReportOutcomeKey> }>;
type SnapshotObservation = Readonly<{ stage: StageName | undefined; barcode: string }>;
type VisionObservation = Readonly<{ stage: StageName | undefined; request: ControllerVisionRequest }>;
type TokenObservation = Readonly<{ stage: StageName | undefined; request: ControllerTokenRequest }>;
export interface ControllerWitness {
  visionByStage: Record<StageName, number>;
  sdkVision: number;
  sdkToken: number;
  transportVision: number;
  barcodeLookups: number;
  readonly imageLoads: readonly ImageObservation[];
  readonly snapshotLookups: readonly SnapshotObservation[];
  readonly visionRequests: readonly VisionObservation[];
  readonly tokenRequests: readonly TokenObservation[];
}
interface MutableWitness extends ControllerWitness {
  imageLoads: ImageObservation[];
  snapshotLookups: SnapshotObservation[];
  visionRequests: VisionObservation[];
  tokenRequests: TokenObservation[];
}
export interface DriverFixture {
  root: string;
  context: CalibrationPreparedContext;
  ledger: Readonly<CalibrationRuntimeEvidenceLedger>;
  driverDeps: CalibrationStageDriverDeps;
  witness: ControllerWitness;
  forbiddenCalls: string[];
  beginInvocation(stage: StageName): void;
  finishedCanonicalKeys(): readonly CalibrationReportOutcomeKey[];
  bindingCount(): number;
}
export interface NativeCliFixture {
  root: string;
  env: Record<string, string | undefined>;
  witness: ControllerWitness;
  forbiddenCalls: string[];
  beginInvocation(stage: StageName): void;
  finishedCanonicalKeys(): readonly CalibrationReportOutcomeKey[];
  bindingCount(): number;
}

function git(root: string, args: readonly string[]): string {
  return execFileSync('git', [...args], { cwd: root, encoding: 'utf8' });
}
function miniGit(roots: string[]): string {
  const mini = makeMiniGitRepoTask4(roots);
  for (const path of snapshotPaths) {
    const dest = resolve(mini.root, path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, readFileSync(resolve(repoRoot, path)));
  }
  git(mini.root, ['add', ...snapshotPaths]);
  git(mini.root, ['commit', '-m', 'fixture pinned off-snapshot payloads']);
  return mini.root;
}
function casesFromFiles(files: Pick<CalibrationPreparedContext['files'], 'calibration-manifest' | 'public-manifest'>): ReadonlyMap<string, NutritionEvalCase> {
  const calibration = StrictCalibrationManifestSchema.parse(JSON.parse(files['calibration-manifest']));
  const benchmark = parseNutritionEvalManifest(JSON.parse(files['public-manifest']));
  return new Map([...calibration.cases, ...benchmark.cases].map((row) => [row.id, row]));
}
function freshWitness(): MutableWitness {
  return {
    visionByStage: { preflight: 0, development: 0, validation: 0, benchmark: 0 },
    sdkVision: 0, sdkToken: 0, transportVision: 0, barcodeLookups: 0,
    imageLoads: [], snapshotLookups: [], visionRequests: [], tokenRequests: [],
  };
}
function rejected(calls: string[], reason: string): never {
  calls.push(reason);
  throw new Error('controller-fixture-forbidden-operation');
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function mediaIdentity(contents: unknown): { caseId: string; mimeType: string } {
  if (!Array.isArray(contents)) throw new Error('fixture-content-array-required');
  const rows: unknown[] = contents;
  for (const row of rows) {
    if (!record(row) || !Array.isArray(row.parts)) continue;
    const parts: unknown[] = row.parts;
    for (const part of parts) {
      if (!record(part) || !record(part.inlineData)) continue;
      const { data, mimeType } = part.inlineData;
      if (typeof data !== 'string' || typeof mimeType !== 'string') continue;
      const decoded: unknown = JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
      if (record(decoded) && typeof decoded.caseId === 'string') return { caseId: decoded.caseId, mimeType };
    }
  }
  throw new Error('fixture-case-media-required');
}
function buildRawWireResponse(truth: NutritionEvalCase['truth'], mode: NutritionEvalCase['scanMode'], degrade: boolean): string {
  const nutrients = { kcal: truth.kcal * (degrade ? 1.05 : 1), proteinG: truth.proteinG, carbsG: truth.carbsG, fatG: truth.fatG };
  return JSON.stringify({
    name: 'fixture scan', confidence: 0.99, candidates: [], boundingBox: null, barcode: null,
    ...nutrients, nutritionBasis: truth.basis, nutritionAmount: truth.amount, nutritionUnit: truth.unit,
    detectedItems: mode === 'meal' && truth.referenceMassG !== undefined ? [{ name: 'fixture scan', weight: truth.referenceMassG }] : [],
    ...(truth.basis === 'package' ? {
      observedPackageAmount: truth.amount, observedPackageUnit: truth.unit,
      packageReference: { ...nutrients, amount: truth.amount, unit: truth.unit },
    } : {}),
  });
}

function instrumentGenAIClient(
  client: ReturnType<typeof actualFactory>, cases: ReadonlyMap<string, NutritionEvalCase>,
  witness: MutableWitness, calls: string[], currentStage: () => StageName | undefined,
  options: ControllerFixtureOptions,
) {
  const firstCaseId = cases.keys().next().value;
  vi.spyOn(client.models, 'generateContent').mockImplementation(async (request) => {
    witness.sdkVision++;
    const ordinal = witness.sdkVision;
    const stage = currentStage();
    if (stage !== undefined) witness.visionByStage[stage]++;
    witness.visionRequests.push(Object.freeze({ stage, request: structuredClone(request) }));
    if (stage === undefined) return rejected(calls, 'vision:no-invocation');
    let media: ReturnType<typeof mediaIdentity>;
    try { media = mediaIdentity(request.contents); } catch { return rejected(calls, 'vision:malformed-media'); }
    const row = cases.get(media.caseId);
    if (!row || row.scanMode === 'barcode') return rejected(calls, 'vision:invalid-case');
    if (request.model !== genAI.CALIBRATION_MODEL || media.mimeType !== row.image.mediaType) return rejected(calls, 'vision:wrong-route-or-media');
    const transport = (): GenerateContentResponse => {
      witness.transportVision++;
      const level = request.config?.thinkingConfig?.thinkingLevel;
      const text = buildRawWireResponse(row.truth, row.scanMode, options.winner === 'LOW' && stage === 'development' && level === 'MEDIUM');
      const response = new GenerateContentResponse();
      response.candidates = [{ content: { role: 'model', parts: [{ text }] } }];
      response.modelVersion = genAI.CALIBRATION_MODEL;
      return response;
    };
    const response = transport();
    return options.extraTransportOnVision === ordinal ? transport() : response;
  });
  vi.spyOn(client.models, 'countTokens').mockImplementation(async (request) => {
    witness.sdkToken++;
    const stage = currentStage();
    witness.tokenRequests.push(Object.freeze({ stage, request: structuredClone(request) }));
    if (stage !== 'preflight' || request.model !== genAI.CALIBRATION_MODEL) return rejected(calls, 'token:wrong-stage-or-model');
    let media: ReturnType<typeof mediaIdentity>;
    try { media = mediaIdentity(request.contents); } catch { return rejected(calls, 'token:malformed-media'); }
    if (media.caseId !== firstCaseId || media.mimeType !== cases.get(media.caseId)?.image.mediaType) return rejected(calls, 'token:wrong-first-case-media');
    const response = new CountTokensResponse();
    response.totalTokens = 1;
    return response;
  });
  return client;
}
function fakeImage(
  row: NutritionEvalCase, stage: StageName | undefined, witness: MutableWitness,
  calls: string[], key?: Readonly<CalibrationReportOutcomeKey>,
): Uint8Array {
  witness.imageLoads.push(Object.freeze({ stage, caseId: row.id, ...(key === undefined ? {} : { key: Object.freeze({ ...key }) }) }));
  if (row.scanMode === 'barcode') return rejected(calls, 'image:barcode');
  return new TextEncoder().encode(JSON.stringify({ caseId: row.id }));
}
function observedStore(store: OffSnapshotStore, stage: () => StageName | undefined, witness: MutableWitness): OffSnapshotStore {
  return Object.freeze({ size: store.size, get(barcode: string) {
    witness.barcodeLookups++;
    witness.snapshotLookups.push(Object.freeze({ stage: stage(), barcode }));
    return store.get(barcode);
  } });
}
function diskEvents(root: string): Record<string, unknown>[] {
  if (!existsSync(join(root, 'ledger.json'))) return [];
  const rows: unknown = JSON.parse(readFileSync(join(root, 'ledger.json'), 'utf8'));
  if (!Array.isArray(rows) || rows.some((row: unknown) => !record(row))) throw new Error('fixture-ledger-array-required');
  return rows as Record<string, unknown>[];
}
function finishedKeys(root: string): CalibrationReportOutcomeKey[] {
  return diskEvents(root).filter((row) => row.type === 'runtime_attempt_finished').map((row) => {
    const key = row.key;
    if (!record(key) || !['preflight', 'development', 'validation', 'benchmark'].includes(String(key.stage))
      || (key.profile !== 'LOW' && key.profile !== 'MEDIUM') || typeof key.caseId !== 'string'
      || typeof key.sampleIndex !== 'number' || !Number.isInteger(key.sampleIndex) || key.sampleIndex < 1 || key.sampleIndex > 3) {
      throw new Error('fixture-finished-key-malformed');
    }
    return { stage: key.stage as StageName, profile: key.profile, caseId: key.caseId, sampleIndex: key.sampleIndex };
  });
}

export async function makeCalibrationDriverFixture(roots: string[], options: ControllerFixtureOptions): Promise<DriverFixture> {
  const base = miniGit(roots);
  const context = await bootstrap.prepareCalibrationBootstrapContext(actualReadDeps(base));
  const cases = casesFromFiles(context.files);
  const witness = freshWitness();
  const forbiddenCalls: string[] = [];
  let stage: StageName | undefined;
  const currentStage = () => stage;
  const ledger = await prepareNativeCalibrationBenchmarkAuthorityLedger({ context });
  ledger.acquireLock(context.owner);
  const store = observedStore(await actualSnapshotStore({
    lockText: context.files['off-lock'],
    readSnapshot: async (path: CalibrationOffSnapshotPath) => git(base, ['show', `${context.identity.implementationCommit}:${path}`]),
  }), currentStage, witness);
  const client = instrumentGenAIClient(actualFactory({}), cases, witness, forbiddenCalls, currentStage, { ...options });
  const raw = genAI.createGenAIAdapter({ project: genAI.CALIBRATION_VERTEX_PROJECT, location: genAI.CALIBRATION_VERTEX_LOCATION, googleGenAI: client });
  let clock = 0;
  const driverDeps: CalibrationStageDriverDeps = {
    context, ledger,
    loadImage: async (key: Readonly<CalibrationReportOutcomeKey>) => {
      const row = cases.get(key.caseId);
      if (!row) return rejected(forbiddenCalls, 'image:unknown-case');
      return fakeImage(row, stage, witness, forbiddenCalls, key);
    },
    generateVision: raw.generateVision,
    lookupSnapshot: (barcode: string) => store.get(barcode),
    countTokens: async () => {
      const first = cases.get(context.firstDevelopmentCaseId);
      const prompts: unknown = JSON.parse(context.files.prompt);
      if (!first || !Array.isArray(prompts) || typeof prompts[0] !== 'string') throw new Error('fixture-token-source-missing');
      return genAI.countCalibrationTokens(client, {
        model: genAI.CALIBRATION_MODEL, prompt: prompts[0],
        imageBase64: Buffer.from(JSON.stringify({ caseId: first.id })).toString('base64'),
        imageMediaType: first.image.mediaType, timeoutMs: 30000,
      });
    },
    nowMs: () => ++clock,
    getSdkMethodCounts: (): Readonly<CalibrationSdkMethodCounts> => Object.freeze({ vision: witness.sdkVision, tokenCount: witness.sdkToken }),
  };
  const root = resolve(base, CALIBRATION_ROOT);
  return { root, context, ledger, driverDeps, witness, forbiddenCalls,
    beginInvocation(value) { stage = value; },
    finishedCanonicalKeys: () => finishedKeys(root),
    bindingCount: () => diskEvents(root).filter((row) => row.type === 'runtime_report_bound').length,
  };
}

export async function makeCalibrationNativeCliFixture(roots: string[], options: ControllerFixtureOptions): Promise<NativeCliFixture> {
  const base = miniGit(roots);
  const commit = git(base, ['rev-parse', 'HEAD']).trim();
  const cases = casesFromFiles({
    'calibration-manifest': git(base, ['show', `${commit}:functions/eval/nutrition/calibration-manifest.json`]),
    'public-manifest': git(base, ['show', `${commit}:functions/eval/nutrition/public-manifest.json`]),
  });
  const witness = freshWitness();
  const forbiddenCalls: string[] = [];
  let stage: StageName | undefined;
  const currentStage = () => stage;
  vi.spyOn(bootstrap, 'createCalibrationBootstrapReadDeps').mockImplementation((root) => actualReadDeps(root ?? base));
  vi.spyOn(genAI, 'createCalibrationGenAIClient').mockImplementation((env) =>
    instrumentGenAIClient(actualFactory(env), cases, witness, forbiddenCalls, currentStage, { ...options }));
  vi.spyOn(assets, 'loadVerifiedCaseImage').mockImplementation(async (input) => {
    const row = cases.get(input.id);
    if (!row) return rejected(forbiddenCalls, 'image:unknown-case');
    return fakeImage(row, stage, witness, forbiddenCalls);
  });
  vi.spyOn(snapshots, 'prepareCalibrationOffSnapshotStore').mockImplementation(async (deps) =>
    observedStore(await actualSnapshotStore(deps), currentStage, witness));
  const root = resolve(base, CALIBRATION_ROOT);
  if (existsSync(root)) throw new Error('fixture-native-root-must-start-absent');
  return { root: base, env: { RUN_NUTRITION_CALIBRATION_LIVE: '1' }, witness, forbiddenCalls,
    beginInvocation(value) { stage = value; },
    finishedCanonicalKeys: () => finishedKeys(root),
    bindingCount: () => diskEvents(root).filter((row) => row.type === 'runtime_report_bound').length,
  };
}
