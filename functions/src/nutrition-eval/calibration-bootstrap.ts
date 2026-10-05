/**
 * Calibration bootstrap preparation (Task 1 Step 3).
 *
 * Read-only assembly of the validated, immutable source/input/owner context
 * needed by the default calibration runtime. Consumes injectable Git,
 * committed-file and owner readers; native readers use argument-array Git
 * commands and Linux process metadata. Always uses the existing pinned asset
 * verifier, then rechecks source identity before returning a frozen context.
 * No provider client, file write, lock, network, or device effect occurs here;
 * importing this module has no read/write/network side effects.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { isAbsolute, resolve } from 'node:path';
import type { CalibrationIdentity, CalibrationLedger, CalibrationOwner } from './calibration';
import { HARD_CALL_CEILING, PLANNED_IMAGE_CALLS } from './calibration';
import {
  CALIBRATION_HISTORICAL_REFERENCE_SHA256,
  CALIBRATION_MANIFEST_SHA256,
  CALIBRATION_OFF_SNAPSHOT_LOCK_SHA256,
  CALIBRATION_RESPONSE_SCHEMA_HASH,
  CALIBRATION_SOURCE_LOCK_SHA256,
  verifyCalibrationPreflightState,
} from './calibration-cli';
import type {
  CalibrationPreflightFileName,
  CalibrationPreflightReport,
} from './calibration-cli';
import { parseProcStartTicks } from './calibration-file-store';
import { CalibrationFatalError } from './fatal-error';
import { CALIBRATION_MODEL } from '../genai-adapter';
import { visionResponseJsonSchema } from '../nutrition-json-schema';
import {
  BARCODE_ANALYSIS_PROMPT,
  LABEL_ANALYSIS_PROMPT,
  MEAL_ANALYSIS_PROMPT,
} from '../prompts';
import { resolveNutritionEvalRuntimePaths } from './cli';

export type CalibrationBootstrapGitState =
  Parameters<CalibrationLedger['assertGitState']>[0] & { implementationCommit: string };

export const CALIBRATION_BOOTSTRAP_ASSET_PATHS = {
  'public-manifest': 'functions/eval/nutrition/public-manifest.json',
  'source-lock': 'functions/eval/nutrition/calibration-source-lock.json',
  'calibration-manifest': 'functions/eval/nutrition/calibration-manifest.json',
  'off-lock': 'functions/eval/nutrition/off-snapshot-lock.json',
  'historical-reference': 'functions/eval/nutrition/historical-reference-v1.json',
} as const;
export type CalibrationBootstrapAssetPath =
  (typeof CALIBRATION_BOOTSTRAP_ASSET_PATHS)[keyof typeof CALIBRATION_BOOTSTRAP_ASSET_PATHS];

export interface CalibrationBootstrapReadDeps {
  readonly baseDir: string;
  readonly readGitState: () => CalibrationBootstrapGitState;
  readonly readCommittedFile: (path: CalibrationBootstrapAssetPath, commit: string) => string;
  readonly readOwner: () => CalibrationOwner;
}

export interface CalibrationPreparedContext {
  readonly baseDir: string;
  readonly identity: Readonly<CalibrationIdentity>;
  readonly owner: Readonly<CalibrationOwner>;
  readonly firstDevelopmentCaseId: string;
  readonly report: Readonly<CalibrationPreflightReport>;
  readonly files: Readonly<Record<CalibrationPreflightFileName, string>>;
}

const HEX40 = /^[0-9a-f]{40}$/;
const CANONICAL_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const BOOTSTRAP_ASSET_ALLOWLIST = new Set<string>(Object.values(CALIBRATION_BOOTSTRAP_ASSET_PATHS));

function bootstrapFatal(message: string): CalibrationFatalError {
  return new CalibrationFatalError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertValidBaseDir(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0 || !isAbsolute(value)) {
    throw bootstrapFatal('calibration:bootstrap-input-invalid:baseDir');
  }
  if (resolve(value) !== value) {
    throw bootstrapFatal('calibration:bootstrap-input-invalid:baseDir');
  }
}

function readGitField(state: Record<string, unknown>, field: string): unknown {
  return state[field];
}

interface ValidatedGitSnapshot {
  headCommit: string;
  implementationCommit: string;
  functionsTreeId: string;
  dirtyPaths: string[];
}

function validateGitSnapshot(raw: unknown): ValidatedGitSnapshot {
  if (!isRecord(raw)) {
    throw bootstrapFatal('calibration:bootstrap-git-state-invalid');
  }
  let head: unknown;
  let impl: unknown;
  let tree: unknown;
  let dirty: unknown;
  try {
    head = readGitField(raw, 'headCommit');
    impl = readGitField(raw, 'implementationCommit');
    tree = readGitField(raw, 'functionsTreeId');
    dirty = readGitField(raw, 'dirtyPaths');
  } catch {
    throw bootstrapFatal('calibration:bootstrap-git-failed');
  }
  if (typeof head !== 'string' || !HEX40.test(head)) {
    throw bootstrapFatal('calibration:bootstrap-git-state-invalid:headCommit');
  }
  if (typeof impl !== 'string' || !HEX40.test(impl)) {
    throw bootstrapFatal('calibration:bootstrap-git-state-invalid:implementationCommit');
  }
  if (typeof tree !== 'string' || !HEX40.test(tree)) {
    throw bootstrapFatal('calibration:bootstrap-git-state-invalid:functionsTreeId');
  }
  if (!Array.isArray(dirty)) {
    throw bootstrapFatal('calibration:bootstrap-git-state-invalid:dirtyPaths');
  }
  let rawLength: unknown;
  try {
    rawLength = (dirty as readonly unknown[]).length;
  } catch {
    throw bootstrapFatal('calibration:bootstrap-git-failed');
  }
  if (typeof rawLength !== 'number' || !Number.isSafeInteger(rawLength) || rawLength < 0) {
    throw bootstrapFatal('calibration:bootstrap-git-failed');
  }
  const dirtyCount: number = rawLength;
  const clonedDirty: string[] = [];
  for (let index = 0; index < dirtyCount; index += 1) {
    let entry: unknown;
    try {
      entry = (dirty as readonly unknown[])[index];
    } catch {
      throw bootstrapFatal('calibration:bootstrap-git-failed');
    }
    if (typeof entry !== 'string' || entry.length === 0) {
      throw bootstrapFatal('calibration:bootstrap-git-state-invalid:dirtyPaths');
    }
    clonedDirty.push(entry);
  }
  return {
    headCommit: head,
    implementationCommit: impl,
    functionsTreeId: tree,
    dirtyPaths: clonedDirty,
  };
}

function assertCleanFunctionsTree(dirtyPaths: readonly string[]): void {
  for (const entry of dirtyPaths) {
    if (entry === 'functions' || entry.startsWith('functions/')) {
      throw bootstrapFatal('calibration:bootstrap-git-dirty');
    }
  }
}

function safeReadGitState(
  read: () => CalibrationBootstrapGitState,
): CalibrationBootstrapGitState {
  try {
    return read();
  } catch {
    throw bootstrapFatal('calibration:bootstrap-git-failed');
  }
}

function safeReadCommittedFile(
  read: (path: CalibrationBootstrapAssetPath, commit: string) => string,
  path: CalibrationBootstrapAssetPath,
  commit: string,
): string {
  let content: unknown;
  try {
    content = read(path, commit);
  } catch {
    throw bootstrapFatal('calibration:bootstrap-file-failed');
  }
  if (typeof content !== 'string') {
    throw bootstrapFatal('calibration:bootstrap-file-failed');
  }
  return content;
}

function safeReadOwner(read: () => CalibrationOwner): CalibrationOwner {
  try {
    return read();
  } catch {
    throw bootstrapFatal('calibration:bootstrap-owner-failed');
  }
}

interface ValidatedOwner {
  hostname: string;
  bootId: string;
  pid: number;
  startTicks: number;
  acquiredAt: string;
}

function validateOwner(raw: unknown): ValidatedOwner {
  if (!isRecord(raw)) {
    throw bootstrapFatal('calibration:bootstrap-owner-invalid');
  }
  let host: unknown;
  let boot: unknown;
  let pid: unknown;
  let ticks: unknown;
  let acquired: unknown;
  try {
    host = raw['hostname'];
    boot = raw['bootId'];
    pid = raw['pid'];
    ticks = raw['startTicks'];
    acquired = raw['acquiredAt'];
  } catch {
    throw bootstrapFatal('calibration:bootstrap-owner-failed');
  }
  if (typeof host !== 'string' || host.trim().length === 0) {
    throw bootstrapFatal('calibration:bootstrap-owner-invalid:hostname');
  }
  if (typeof boot !== 'string' || boot.trim().length === 0) {
    throw bootstrapFatal('calibration:bootstrap-owner-invalid:bootId');
  }
  if (typeof pid !== 'number' || !Number.isSafeInteger(pid) || pid <= 0) {
    throw bootstrapFatal('calibration:bootstrap-owner-invalid:pid');
  }
  if (typeof ticks !== 'number' || !Number.isSafeInteger(ticks) || ticks <= 0) {
    throw bootstrapFatal('calibration:bootstrap-owner-invalid:startTicks');
  }
  if (typeof acquired !== 'string' || !CANONICAL_ISO.test(acquired)) {
    throw bootstrapFatal('calibration:bootstrap-owner-invalid:acquiredAt');
  }
  const parsed = Date.parse(acquired);
  if (!Number.isFinite(parsed) || new Date(acquired).toISOString() !== acquired) {
    throw bootstrapFatal('calibration:bootstrap-owner-invalid:acquiredAt');
  }
  return { hostname: host, bootId: boot, pid, startTicks: ticks, acquiredAt: acquired };
}

function gitExec(root: string, args: readonly string[]): string {
  try {
    const out = execFileSync('git', [...args], {
      cwd: root,
      encoding: 'utf8',
      timeout: 10000,
      maxBuffer: 8 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }) as unknown as string;
    return typeof out === 'string' ? out : String(out);
  } catch {
    throw bootstrapFatal('calibration:bootstrap-git-failed');
  }
}

function parsePorcelainZStatus(output: string): string[] {
  if (output === '') return [];
  if (!output.endsWith('\0')) {
    throw bootstrapFatal('calibration:bootstrap-git-failed');
  }
  const records = output.split('\0');
  if (records.length > 0 && records[records.length - 1] === '') {
    records.pop();
  }
  const paths: string[] = [];
  let index = 0;
  while (index < records.length) {
    const maybeRecord = records[index];
    if (typeof maybeRecord !== 'string') {
      throw bootstrapFatal('calibration:bootstrap-git-failed');
    }
    const record: string = maybeRecord;
    if (record.length < 4 || record[2] !== ' ') {
      throw bootstrapFatal('calibration:bootstrap-git-failed');
    }
    const xy = record.slice(0, 2);
    if (!/^(?:[ MTADRCU]{2}|\?\?|!!)$/.test(xy) || xy === '  ') {
      throw bootstrapFatal('calibration:bootstrap-git-failed');
    }
    const path = record.slice(3);
    if (path.length === 0) {
      throw bootstrapFatal('calibration:bootstrap-git-failed');
    }
    paths.push(path);
    const renamed = xy[0] === 'R' || xy[1] === 'R' || xy[0] === 'C' || xy[1] === 'C';
    index += 1;
    if (renamed) {
      if (index >= records.length) {
        throw bootstrapFatal('calibration:bootstrap-git-failed');
      }
      const second = records[index];
      if (typeof second !== 'string' || second.length === 0) {
        throw bootstrapFatal('calibration:bootstrap-git-failed');
      }
      paths.push(second);
      index += 1;
    }
  }
  return paths;
}

function nativeReadGitState(root: string): CalibrationBootstrapGitState {
  const head = gitExec(root, ['rev-parse', 'HEAD']).trim();
  if (!HEX40.test(head)) {
    throw bootstrapFatal('calibration:bootstrap-git-failed');
  }
  const tree = gitExec(root, ['rev-parse', `${head}:functions`]).trim();
  if (!HEX40.test(tree)) {
    throw bootstrapFatal('calibration:bootstrap-git-failed');
  }
  const impl = gitExec(root, ['log', '-1', '--format=%H', head, '--', 'functions']).trim();
  if (!HEX40.test(impl)) {
    throw bootstrapFatal('calibration:bootstrap-git-failed');
  }
  const status = gitExec(root, [
    'status',
    '--porcelain=v1',
    '-z',
    '--untracked-files=all',
    '--',
    'functions',
  ]);
  const dirtyPaths = parsePorcelainZStatus(status);
  return { headCommit: head, implementationCommit: impl, functionsTreeId: tree, dirtyPaths };
}

function nativeReadCommittedFile(root: string, path: string, commit: string): string {
  if (typeof path !== 'string' || !BOOTSTRAP_ASSET_ALLOWLIST.has(path)) {
    throw bootstrapFatal('calibration:bootstrap-file-failed');
  }
  if (typeof commit !== 'string' || !HEX40.test(commit)) {
    throw bootstrapFatal('calibration:bootstrap-file-failed');
  }
  try {
    const out = execFileSync('git', ['show', `${commit}:${path}`], {
      cwd: root,
      encoding: 'utf8',
      timeout: 10000,
      maxBuffer: 8 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }) as unknown as string;
    return typeof out === 'string' ? out : String(out);
  } catch {
    throw bootstrapFatal('calibration:bootstrap-file-failed');
  }
}

function nativeReadOwner(): CalibrationOwner {
  let host: string;
  let boot: string;
  let stat: string;
  let acquired: string;
  const pid = process.pid;
  try {
    host = hostname();
    boot = readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
    stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    acquired = new Date().toISOString();
  } catch {
    throw bootstrapFatal('calibration:bootstrap-owner-failed');
  }
  if (typeof host !== 'string' || host.trim().length === 0) {
    throw bootstrapFatal('calibration:bootstrap-owner-failed');
  }
  if (typeof boot !== 'string' || boot.trim().length === 0) {
    throw bootstrapFatal('calibration:bootstrap-owner-failed');
  }
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    throw bootstrapFatal('calibration:bootstrap-owner-failed');
  }
  const ticks = parseProcStartTicks(stat);
  if (typeof ticks !== 'number' || !Number.isSafeInteger(ticks) || ticks <= 0) {
    throw bootstrapFatal('calibration:bootstrap-owner-failed');
  }
  if (!CANONICAL_ISO.test(acquired) || new Date(acquired).toISOString() !== acquired) {
    throw bootstrapFatal('calibration:bootstrap-owner-failed');
  }
  return { hostname: host, bootId: boot, pid, startTicks: ticks, acquiredAt: acquired };
}

export function createCalibrationBootstrapReadDeps(repoRoot?: string): CalibrationBootstrapReadDeps {
  let root: string;
  if (repoRoot === undefined) {
    root = resolveNutritionEvalRuntimePaths(__dirname).repoRoot;
  } else {
    if (typeof repoRoot !== 'string' || repoRoot.trim().length === 0 || !isAbsolute(repoRoot)) {
      throw bootstrapFatal('calibration:bootstrap-input-invalid:baseDir');
    }
    if (resolve(repoRoot) !== repoRoot) {
      throw bootstrapFatal('calibration:bootstrap-input-invalid:baseDir');
    }
    root = repoRoot;
  }
  const baseDir = root;
  return {
    baseDir,
    readGitState: () => nativeReadGitState(baseDir),
    readCommittedFile: (path, commit) => nativeReadCommittedFile(baseDir, path, commit),
    readOwner: () => nativeReadOwner(),
  };
}

export async function prepareCalibrationBootstrapContext(
  deps: CalibrationBootstrapReadDeps,
): Promise<CalibrationPreparedContext> {
  if (!isRecord(deps)) {
    throw bootstrapFatal('calibration:bootstrap-input-invalid');
  }
  let baseDirRaw: unknown;
  let readGitState: unknown;
  let readCommittedFile: unknown;
  let readOwner: unknown;
  try {
    baseDirRaw = (deps as Record<string, unknown>)['baseDir'];
    readGitState = (deps as Record<string, unknown>)['readGitState'];
    readCommittedFile = (deps as Record<string, unknown>)['readCommittedFile'];
    readOwner = (deps as Record<string, unknown>)['readOwner'];
  } catch {
    throw bootstrapFatal('calibration:bootstrap-input-invalid');
  }
  assertValidBaseDir(baseDirRaw);
  if (
    typeof readGitState !== 'function' ||
    typeof readCommittedFile !== 'function' ||
    typeof readOwner !== 'function'
  ) {
    throw bootstrapFatal('calibration:bootstrap-input-invalid');
  }
  const canonicalBaseDir = baseDirRaw as string;
  const gitReader = readGitState as () => CalibrationBootstrapGitState;
  const fileReader = readCommittedFile as (
    path: CalibrationBootstrapAssetPath,
    commit: string,
  ) => string;
  const ownerReader = readOwner as () => CalibrationOwner;

  const firstRaw = safeReadGitState(gitReader);
  const first = validateGitSnapshot(firstRaw);
  assertCleanFunctionsTree(first.dirtyPaths);
  const firstHead = first.headCommit;
  const firstTree = first.functionsTreeId;
  const firstImpl = first.implementationCommit;

  const publicManifestBytes = safeReadCommittedFile(
    fileReader,
    CALIBRATION_BOOTSTRAP_ASSET_PATHS['public-manifest'],
    firstHead,
  );
  const sourceLockBytes = safeReadCommittedFile(
    fileReader,
    CALIBRATION_BOOTSTRAP_ASSET_PATHS['source-lock'],
    firstHead,
  );
  const calibrationManifestBytes = safeReadCommittedFile(
    fileReader,
    CALIBRATION_BOOTSTRAP_ASSET_PATHS['calibration-manifest'],
    firstHead,
  );
  const offLockBytes = safeReadCommittedFile(
    fileReader,
    CALIBRATION_BOOTSTRAP_ASSET_PATHS['off-lock'],
    firstHead,
  );
  const historicalReferenceBytes = safeReadCommittedFile(
    fileReader,
    CALIBRATION_BOOTSTRAP_ASSET_PATHS['historical-reference'],
    firstHead,
  );

  const promptBytes = JSON.stringify([
    MEAL_ANALYSIS_PROMPT,
    LABEL_ANALYSIS_PROMPT,
    BARCODE_ANALYSIS_PROMPT,
  ]);
  const schemaBytes = JSON.stringify([
    visionResponseJsonSchema('meal'),
    visionResponseJsonSchema('label'),
    visionResponseJsonSchema('barcode'),
  ]);

  const files: Record<CalibrationPreflightFileName, string> = {
    'public-manifest': publicManifestBytes,
    prompt: promptBytes,
    'response-schema': schemaBytes,
    'source-lock': sourceLockBytes,
    'calibration-manifest': calibrationManifestBytes,
    'off-lock': offLockBytes,
    'historical-reference': historicalReferenceBytes,
  };

  let verified: CalibrationPreflightReport;
  try {
    verified = await verifyCalibrationPreflightState({ files });
  } catch (error) {
    if (error instanceof CalibrationFatalError) {
      let message: unknown;
      try {
        message = error.message;
      } catch {
        throw bootstrapFatal('calibration:bootstrap-preflight-failed');
      }
      if (typeof message !== 'string' || message.length === 0) {
        throw bootstrapFatal('calibration:bootstrap-preflight-failed');
      }
      throw bootstrapFatal(message);
    }
    throw bootstrapFatal('calibration:bootstrap-preflight-failed');
  }

  const ownerRaw = safeReadOwner(ownerReader);
  const ownerValidated = validateOwner(ownerRaw);
  const ownerSnapshot: CalibrationOwner = {
    hostname: ownerValidated.hostname,
    bootId: ownerValidated.bootId,
    pid: ownerValidated.pid,
    startTicks: ownerValidated.startTicks,
    acquiredAt: ownerValidated.acquiredAt,
  };

  const secondRaw = safeReadGitState(gitReader);
  const second = validateGitSnapshot(secondRaw);
  assertCleanFunctionsTree(second.dirtyPaths);
  if (second.functionsTreeId !== firstTree) {
    throw bootstrapFatal('calibration:bootstrap-identity-drift:functionsTreeId');
  }
  if (second.implementationCommit !== firstImpl) {
    throw bootstrapFatal('calibration:bootstrap-identity-drift:implementationCommit');
  }

  const identity: CalibrationIdentity = {
    protocolVersion: 'v1',
    provider: 'vertex-ai',
    model: CALIBRATION_MODEL,
    implementationCommit: firstImpl,
    functionsTreeId: firstTree,
    datasetHash: verified.publicManifestHash,
    promptHash: verified.promptHash,
    responseSchemaHash: CALIBRATION_RESPONSE_SCHEMA_HASH,
    sourceLockHash: CALIBRATION_SOURCE_LOCK_SHA256,
    manifestHash: CALIBRATION_MANIFEST_SHA256,
    publicManifestHash: verified.publicManifestHash,
    snapshotLockHash: CALIBRATION_OFF_SNAPSHOT_LOCK_SHA256,
    historicalReferenceHash: CALIBRATION_HISTORICAL_REFERENCE_SHA256,
    plannedImageCalls: PLANNED_IMAGE_CALLS,
    hardCeiling: HARD_CALL_CEILING,
  };

  const frozenIdentity = Object.freeze({ ...identity });
  const frozenOwner = Object.freeze({ ...ownerSnapshot });
  const frozenFiles = Object.freeze({ ...files });
  const notesSource = verified.compatibilityNotes;
  const clonedNotes = Array.isArray(notesSource)
    ? notesSource.map((note) => Object.freeze({ key: note.key, detail: note.detail }))
    : [];
  const frozenNotes = Object.freeze(clonedNotes);
  const frozenReport = Object.freeze({
    datasetId: verified.datasetId,
    publicManifestHash: verified.publicManifestHash,
    promptHash: verified.promptHash,
    firstDevelopmentCaseId: verified.firstDevelopmentCaseId,
    compatibilityNotes: frozenNotes,
    historicalCompatible: verified.historicalCompatible,
  });
  const context: CalibrationPreparedContext = {
    baseDir: canonicalBaseDir,
    identity: frozenIdentity,
    owner: frozenOwner,
    firstDevelopmentCaseId: verified.firstDevelopmentCaseId,
    report: frozenReport,
    files: frozenFiles,
  };
  return Object.freeze(context) as CalibrationPreparedContext;
}
