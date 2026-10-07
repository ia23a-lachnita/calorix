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
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { isAbsolute, resolve } from 'node:path';
import type { CalibrationIdentity, CalibrationLedger, CalibrationOwner } from './calibration';
import type { CalibrationProfile, ReservationKey } from './calibration';
import { HARD_CALL_CEILING, PLANNED_IMAGE_CALLS } from './calibration';
import {
  CALIBRATION_HISTORICAL_REFERENCE_SHA256,
  CALIBRATION_MANIFEST_SHA256,
  CALIBRATION_OFF_SNAPSHOT_LOCK_SHA256,
  CALIBRATION_PUBLIC_MANIFEST_HASH,
  CALIBRATION_RESPONSE_SCHEMA_HASH,
  CALIBRATION_SOURCE_LOCK_SHA256,
  verifyCalibrationPreflightState,
} from './calibration-cli';
import type {
  CalibrationPreflightFileName,
  CalibrationPreflightReport,
} from './calibration-cli';
import type { CalibrationPlannedReportOutcome } from './calibration-report-state';
import { parseProcStartTicks } from './calibration-file-store';
import { CalibrationFatalError } from './fatal-error';
import { CALIBRATION_MODEL } from '../genai-adapter';
import { visionResponseJsonSchema } from '../nutrition-json-schema';
import {
  BARCODE_ANALYSIS_PROMPT,
  LABEL_ANALYSIS_PROMPT,
  MEAL_ANALYSIS_PROMPT,
} from '../prompts';
import { hashNutritionEvalManifest, resolveNutritionEvalRuntimePaths } from './cli';
import { parseNutritionEvalManifest, StrictCalibrationManifestSchema } from './schema';

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

/**
 * Task 3 canonical allowed-keys planner (pure, synchronous).
 *
 * Derives the exact image reservation keys from the two committed manifests
 * only; it does NOT authorize full setup and never touches the other five
 * preflight files. Inputs are raw committed bytes keyed by preflight file
 * name. Only `calibration-manifest` and `public-manifest` are read.
 *
 * Gates:
 * - `calibration-manifest` bytes must hash (raw sha256) to
 *   `CALIBRATION_MANIFEST_SHA256`, parse as JSON, and validate through the
 *   strict `StrictCalibrationManifestSchema` (unknown fields, duplicates,
 *   wrong slot ranges all fail closed).
 * - `public-manifest` bytes must parse as JSON, validate through the existing
 *   backward-compatible `parseNutritionEvalManifest`, contain no unknown
 *   raw fields at any depth (recursive raw/parsed key-set comparison, so
 *   formatting-only reserialization stays valid), and hash semantically to
 *   `CALIBRATION_PUBLIC_MANIFEST_HASH` via `hashNutritionEvalManifest`.
 *
 * Shapes:
 * - no profile: exactly 50 keys (preflight LOW+MEDIUM sample 1 on the first
 *   development case, plus 24 development cases x LOW/MEDIUM sample 1).
 * - selected LOW/MEDIUM: exactly 146 keys (unchanged 50 prefix, plus 16
 *   validation cases x 3 samples plus 16 public meal/label cases x 3
 *   benchmark samples, all in the selected profile). Barcode cases receive
 *   zero image keys; benchmark keys are never derived from the 40
 *   calibration cases.
 *
 * Pure: never invokes caller `toJSON` or custom iterators, never mutates the
 * input, returns a deeply frozen array of frozen keys. Every failure is a
 * fresh static causeless `CalibrationFatalError` with no private payload.
 */
export function deriveCanonicalAllowedKeys(
  files: Record<CalibrationPreflightFileName, string>,
  selectedProfile?: CalibrationProfile,
): readonly ReservationKey[] {
  let calibrationBytes: unknown;
  let publicBytes: unknown;
  let selected: CalibrationProfile | undefined;
  try {
    if (
      typeof files !== 'object' ||
      files === null ||
      Array.isArray(files)
    ) {
      throw new CalibrationFatalError('calibration:canonical-keys-invalid');
    }
    calibrationBytes =
      (files as Record<string, unknown>)['calibration-manifest'];
    publicBytes = (files as Record<string, unknown>)['public-manifest'];
    if (typeof calibrationBytes !== 'string' || typeof publicBytes !== 'string') {
      throw new CalibrationFatalError('calibration:canonical-keys-invalid');
    }
    if (selectedProfile === undefined) {
      selected = undefined;
    } else if (selectedProfile === 'LOW' || selectedProfile === 'MEDIUM') {
      selected = selectedProfile;
    } else {
      throw new CalibrationFatalError('calibration:canonical-keys-invalid');
    }
  } catch {
    // Never trust a foreign typed error or revoked-proxy TypeError: any
    // caller-structural failure becomes a fresh static causeless fatal.
    throw new CalibrationFatalError('calibration:canonical-keys-invalid');
  }

  const calibrationText: string = calibrationBytes;
  const publicText: string = publicBytes;

  if (
    createHash('sha256').update(calibrationText, 'utf8').digest('hex') !==
    CALIBRATION_MANIFEST_SHA256
  ) {
    throw new CalibrationFatalError('calibration:canonical-keys-invalid');
  }
  let calibrationRaw: unknown;
  try {
    calibrationRaw = JSON.parse(calibrationText) as unknown;
  } catch {
    throw new CalibrationFatalError('calibration:canonical-keys-invalid');
  }
  let calibrationManifest: {
    cases: Array<{ id: string; group: string }>;
  };
  try {
    calibrationManifest = StrictCalibrationManifestSchema.parse(
      calibrationRaw,
    ) as unknown as { cases: Array<{ id: string; group: string }> };
  } catch {
    throw new CalibrationFatalError('calibration:canonical-keys-invalid');
  }

  let publicRaw: unknown;
  try {
    publicRaw = JSON.parse(publicText) as unknown;
  } catch {
    throw new CalibrationFatalError('calibration:canonical-keys-invalid');
  }
  let publicParsed: { cases: Array<{ id: string; scanMode: string }> };
  try {
    publicParsed = parseNutritionEvalManifest(publicRaw) as unknown as {
      cases: Array<{ id: string; scanMode: string }>;
    };
  } catch {
    throw new CalibrationFatalError('calibration:canonical-keys-invalid');
  }
  assertNoUnknownPublicKeys(publicRaw, publicParsed);
  let publicHash: string;
  try {
    publicHash = hashNutritionEvalManifest(publicParsed);
  } catch {
    throw new CalibrationFatalError('calibration:canonical-keys-invalid');
  }
  if (publicHash !== CALIBRATION_PUBLIC_MANIFEST_HASH) {
    throw new CalibrationFatalError('calibration:canonical-keys-invalid');
  }

  const devIds: string[] = [];
  const validationIds: string[] = [];
  const calibrationCases = calibrationManifest.cases;
  const calibrationCount = calibrationCases.length;
  for (let index = 0; index < calibrationCount; index += 1) {
    const entry = calibrationCases[index] as { id: string; group: string };
    if (entry.group === 'development') {
      devIds.push(entry.id);
    } else if (entry.group === 'validation') {
      validationIds.push(entry.id);
    } else {
      throw new CalibrationFatalError('calibration:canonical-keys-invalid');
    }
  }
  if (devIds.length !== 24 || validationIds.length !== 16) {
    throw new CalibrationFatalError('calibration:canonical-keys-invalid');
  }
  const firstDev = devIds[0] as string;
  if (typeof firstDev !== 'string' || firstDev.length === 0) {
    throw new CalibrationFatalError('calibration:canonical-keys-invalid');
  }

  const benchmarkIds: string[] = [];
  const publicCases = publicParsed.cases;
  const publicCount = publicCases.length;
  for (let index = 0; index < publicCount; index += 1) {
    const entry = publicCases[index] as { id: string; scanMode: string };
    if (entry.scanMode === 'meal' || entry.scanMode === 'label') {
      benchmarkIds.push(entry.id);
    } else if (entry.scanMode === 'barcode') {
      continue;
    } else {
      throw new CalibrationFatalError('calibration:canonical-keys-invalid');
    }
  }
  if (benchmarkIds.length !== 16) {
    throw new CalibrationFatalError('calibration:canonical-keys-invalid');
  }

  const keys: ReservationKey[] = [];
  keys.push({ stage: 'preflight', profile: 'LOW', caseId: firstDev, sampleIndex: 1 });
  keys.push({ stage: 'preflight', profile: 'MEDIUM', caseId: firstDev, sampleIndex: 1 });
  for (let index = 0; index < devIds.length; index += 1) {
    const caseId = devIds[index] as string;
    keys.push({ stage: 'development', profile: 'LOW', caseId, sampleIndex: 1 });
    keys.push({ stage: 'development', profile: 'MEDIUM', caseId, sampleIndex: 1 });
  }
  if (selected !== undefined) {
    for (let index = 0; index < validationIds.length; index += 1) {
      const caseId = validationIds[index] as string;
      for (let sample = 1; sample <= 3; sample += 1) {
        keys.push({ stage: 'validation', profile: selected, caseId, sampleIndex: sample });
      }
    }
    for (let index = 0; index < benchmarkIds.length; index += 1) {
      const caseId = benchmarkIds[index] as string;
      for (let sample = 1; sample <= 3; sample += 1) {
        keys.push({ stage: 'benchmark', profile: selected, caseId, sampleIndex: sample });
      }
    }
  }

  const expectedLength = selected === undefined ? 50 : 146;
  if (keys.length !== expectedLength) {
    throw new CalibrationFatalError('calibration:canonical-keys-invalid');
  }
  const seen = new Set<string>();
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index] as ReservationKey;
    const id = `${key.stage}|${key.profile}|${key.caseId}|${key.sampleIndex}`;
    if (seen.has(id)) {
      throw new CalibrationFatalError('calibration:canonical-keys-invalid');
    }
    seen.add(id);
    Object.freeze(key);
  }
  return Object.freeze(keys) as readonly ReservationKey[];
}

/**
 * Recursive raw/parsed key-set comparison for the public manifest. The
 * generic public schema stays stripping-tolerant and backward compatible;
 * an unknown raw field at any depth fails closed here instead. Formatting
 * or key-order differences are legitimate: only the presence of a raw key
 * absent from the parsed output is rejected, never a serialization
 * round-trip string comparison.
 */
function assertNoUnknownPublicKeys(raw: unknown, parsed: unknown): void {
  try {
    if (Array.isArray(raw)) {
      if (!Array.isArray(parsed)) {
        throw new CalibrationFatalError('calibration:canonical-keys-invalid');
      }
      const parsedArray = parsed as readonly unknown[];
      let rawLength: unknown;
      let parsedLength: unknown;
      try {
        rawLength = (raw as readonly unknown[]).length;
        parsedLength = parsedArray.length;
      } catch {
        throw new CalibrationFatalError('calibration:canonical-keys-invalid');
      }
      if (rawLength !== parsedLength) {
        throw new CalibrationFatalError('calibration:canonical-keys-invalid');
      }
      const count = rawLength as number;
      for (let index = 0; index < count; index += 1) {
        let rawItem: unknown;
        let parsedItem: unknown;
        try {
          rawItem = (raw as readonly unknown[])[index];
          parsedItem = parsedArray[index];
        } catch {
          throw new CalibrationFatalError('calibration:canonical-keys-invalid');
        }
        assertNoUnknownPublicKeys(rawItem, parsedItem);
      }
      return;
    }
    if (typeof raw === 'object' && raw !== null) {
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new CalibrationFatalError('calibration:canonical-keys-invalid');
      }
      const rawRecord = raw as Record<string, unknown>;
      const parsedRecord = parsed as Record<string, unknown>;
      let rawKeys: string[];
      try {
        rawKeys = Object.keys(rawRecord);
      } catch {
        throw new CalibrationFatalError('calibration:canonical-keys-invalid');
      }
      for (let index = 0; index < rawKeys.length; index += 1) {
        const key = rawKeys[index] as string;
        let has: boolean;
        try {
          has = Object.prototype.hasOwnProperty.call(parsedRecord, key);
        } catch {
          throw new CalibrationFatalError('calibration:canonical-keys-invalid');
        }
        if (!has) {
          throw new CalibrationFatalError('calibration:canonical-keys-invalid');
        }
      }
      for (let index = 0; index < rawKeys.length; index += 1) {
        const key = rawKeys[index] as string;
        let rawChild: unknown;
        let parsedChild: unknown;
        try {
          rawChild = rawRecord[key];
          parsedChild = parsedRecord[key];
        } catch {
          throw new CalibrationFatalError('calibration:canonical-keys-invalid');
        }
        assertNoUnknownPublicKeys(rawChild, parsedChild);
      }
    }
  } catch {
    // Any revoked-proxy, foreign getter, or reflection failure fails closed
    // with a fresh static causeless fatal; never retain the foreign error.
    throw new CalibrationFatalError('calibration:canonical-keys-invalid');
  }
}

// ── Canonical report outcome planner (Task 1 Step 3, bootstrap piece) ───────

const CALIBRATION_REPORT_PLAN_FILE_NAMES: readonly CalibrationPreflightFileName[] = [
  'public-manifest',
  'prompt',
  'response-schema',
  'source-lock',
  'calibration-manifest',
  'off-lock',
  'historical-reference',
];

/** Descriptor-only exact seven-field capture; rejects any coercive/hidden shape. */
function captureReportPlanFilesRecord(
  value: unknown,
): Record<CalibrationPreflightFileName, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('calibration-bootstrap:report-plan-files-invalid');
  }
  let proto: unknown;
  try {
    proto = Object.getPrototypeOf(value);
  } catch {
    throw new Error('calibration-bootstrap:report-plan-files-invalid');
  }
  if (proto !== Object.prototype && proto !== null) {
    throw new Error('calibration-bootstrap:report-plan-files-invalid');
  }
  let names: string[];
  let symbols: symbol[];
  try {
    names = Object.getOwnPropertyNames(value);
    symbols = Object.getOwnPropertySymbols(value);
  } catch {
    throw new Error('calibration-bootstrap:report-plan-files-invalid');
  }
  if (symbols.length !== 0) {
    throw new Error('calibration-bootstrap:report-plan-files-invalid');
  }
  if (names.length !== CALIBRATION_REPORT_PLAN_FILE_NAMES.length) {
    throw new Error('calibration-bootstrap:report-plan-files-invalid');
  }
  const allowedSet = new Set<string>(CALIBRATION_REPORT_PLAN_FILE_NAMES);
  const owned: Record<string, string> = {};
  for (const name of names) {
    if (!allowedSet.has(name)) {
      throw new Error('calibration-bootstrap:report-plan-files-invalid');
    }
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, name);
    } catch {
      throw new Error('calibration-bootstrap:report-plan-files-invalid');
    }
    if (
      descriptor === undefined ||
      descriptor.enumerable !== true ||
      !('value' in descriptor) ||
      'get' in descriptor ||
      'set' in descriptor
    ) {
      throw new Error('calibration-bootstrap:report-plan-files-invalid');
    }
    const raw = descriptor.value;
    if (typeof raw !== 'string') {
      throw new Error('calibration-bootstrap:report-plan-files-invalid');
    }
    owned[name] = raw;
  }
  for (const name of CALIBRATION_REPORT_PLAN_FILE_NAMES) {
    if (!(name in owned)) {
      throw new Error('calibration-bootstrap:report-plan-files-invalid');
    }
  }
  return owned as Record<CalibrationPreflightFileName, string>;
}

interface ReportOutcomeRow {
  key: {
    stage: 'preflight' | 'development' | 'validation' | 'benchmark';
    profile: CalibrationProfile;
    caseId: string;
    sampleIndex: number;
  };
  scanMode: 'meal' | 'label' | 'barcode';
}

/**
 * Source-derived frozen outcome plan (pure, synchronous). Calls the
 * unchanged `deriveCanonicalAllowedKeys` on the same owned strings to prove
 * pinned bytes/hash/unknown-field policy, then independently re-parses the
 * identical validated strings (never re-reads the hash) to recover each
 * case's source `scanMode` and manifest slot/sample order, which
 * `deriveCanonicalAllowedKeys` does not expose. No case truth/URLs are
 * copied into the plan; every row/key is frozen and owned.
 */
export function deriveCanonicalReportOutcomePlan(
  files: Record<CalibrationPreflightFileName, string>,
  selectedProfile?: CalibrationProfile,
): readonly CalibrationPlannedReportOutcome[] {
  try {
    const owned = captureReportPlanFilesRecord(files);
    let selected: CalibrationProfile | undefined;
    if (selectedProfile === undefined) {
      selected = undefined;
    } else if (selectedProfile === 'LOW' || selectedProfile === 'MEDIUM') {
      selected = selectedProfile;
    } else {
      throw new Error('calibration-bootstrap:report-plan-profile-invalid');
    }

    // Unchanged pinned-bytes/hash/unknown-field policy proof on the same
    // owned strings; its own allowed-key set is not reused here, only its
    // fail-closed validation of calibration/public manifest bytes.
    deriveCanonicalAllowedKeys(owned, selected);

    const calibrationRaw = JSON.parse(owned['calibration-manifest']) as unknown;
    const calibrationManifest = StrictCalibrationManifestSchema.parse(calibrationRaw) as unknown as {
      cases: Array<{ id: string; group: string }>;
    };
    const devIds: string[] = [];
    const validationIds: string[] = [];
    for (const entry of calibrationManifest.cases) {
      if (entry.group === 'development') devIds.push(entry.id);
      else if (entry.group === 'validation') validationIds.push(entry.id);
    }
    if (devIds.length !== 24 || validationIds.length !== 16) {
      throw new Error('calibration-bootstrap:report-plan-manifest-invalid');
    }
    const firstDev = devIds[0] as string;

    const publicRaw = JSON.parse(owned['public-manifest']) as unknown;
    const publicParsed = parseNutritionEvalManifest(publicRaw) as unknown as {
      cases: Array<{ id: string; scanMode: string }>;
    };
    if (publicParsed.cases.length !== 20) {
      throw new Error('calibration-bootstrap:report-plan-manifest-invalid');
    }

    const rows: ReportOutcomeRow[] = [];
    rows.push({
      key: { stage: 'preflight', profile: 'LOW', caseId: firstDev, sampleIndex: 1 },
      scanMode: 'meal',
    });
    rows.push({
      key: { stage: 'preflight', profile: 'MEDIUM', caseId: firstDev, sampleIndex: 1 },
      scanMode: 'meal',
    });
    for (const caseId of devIds) {
      rows.push({ key: { stage: 'development', profile: 'LOW', caseId, sampleIndex: 1 }, scanMode: 'meal' });
      rows.push({ key: { stage: 'development', profile: 'MEDIUM', caseId, sampleIndex: 1 }, scanMode: 'meal' });
    }

    if (selected !== undefined) {
      for (const caseId of validationIds) {
        for (let sampleIndex = 1; sampleIndex <= 3; sampleIndex += 1) {
          rows.push({
            key: { stage: 'validation', profile: selected, caseId, sampleIndex },
            scanMode: 'meal',
          });
        }
      }
      // Source case/sample order: iterate the public manifest exactly as
      // committed (12 meal, 4 barcode, 4 label in this corpus) so barcode
      // rows stay interleaved at their source position, never appended
      // after all vision rows.
      for (const entry of publicParsed.cases) {
        const scanMode = entry.scanMode;
        if (scanMode !== 'meal' && scanMode !== 'label' && scanMode !== 'barcode') {
          throw new Error('calibration-bootstrap:report-plan-scan-mode-invalid');
        }
        for (let sampleIndex = 1; sampleIndex <= 3; sampleIndex += 1) {
          rows.push({
            key: { stage: 'benchmark', profile: selected, caseId: entry.id, sampleIndex },
            scanMode,
          });
        }
      }
    }

    const expectedLength = selected === undefined ? 50 : 158;
    if (rows.length !== expectedLength) {
      throw new Error('calibration-bootstrap:report-plan-length-invalid');
    }

    const seen = new Set<string>();
    const frozenRows: CalibrationPlannedReportOutcome[] = [];
    for (const row of rows) {
      const id = `${row.key.stage}|${row.key.profile}|${row.key.caseId}|${row.key.sampleIndex}`;
      if (seen.has(id)) {
        throw new Error('calibration-bootstrap:report-plan-duplicate-key');
      }
      seen.add(id);
      const key = Object.freeze({ ...row.key });
      const frozenRow = Object.freeze({ key, scanMode: row.scanMode });
      frozenRows.push(frozenRow as unknown as CalibrationPlannedReportOutcome);
    }
    return Object.freeze(frozenRows) as readonly CalibrationPlannedReportOutcome[];
  } catch {
    throw new CalibrationFatalError('calibration:report-outcome-plan-invalid');
  }
}
