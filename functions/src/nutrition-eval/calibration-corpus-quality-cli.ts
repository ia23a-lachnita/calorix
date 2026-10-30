import { resolve, dirname, relative, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { z } from 'zod';
import {
  QUALITY_WORKING_ROOT, QUALITY_CANDIDATE_ID, QUALITY_CHECKLIST_VERSION,
  createQualityAudit, validateQualityAudit, addQualityPhoto, recordQualityDecision,
  recordQualityImageSkip, finalizeQualityAudit, qualityReviewStatus,
} from './calibration-corpus-quality-audit';
import type { QualityAudit, QualityAuditContext, QualityDecisionInput } from './calibration-corpus-quality-audit';
import {
  buildSourceUrl, buildOverheadImageUrl, verifyPinnedSourceBytes, verifyOverheadImage,
  OverheadImageCheckError, parseDishMetadataCsv, mergeDishMetadata, CALIBRATION_SOURCE_PATHS,
} from './calibration-corpus';
import type { FetchImageResult } from './calibration-corpus';
import { prepareQualityPool, parseQualityVocabulary } from './calibration-corpus-quality-policy';
import type { QualitySourceBundle, QualitySourcePins } from './calibration-corpus-quality-policy';

export interface QualityCliDeps {
  repositoryRoot: string;
  loadContext?: (allowDownloads: boolean) => Promise<QualityAuditContext>;
  fetch?: typeof globalThis.fetch;
  now?: () => string;
}
export interface QualityCliResult {
  exitCode: 0 | 1;
  status: string;
  photos?: number;
  skipped?: number;
  pending?: number;
  auditSha256?: string;
}
export function createNativeQualityCliDeps(): QualityCliDeps {
  return { repositoryRoot: resolve(__dirname, '../../..') };
}
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_AUDIT_BYTES = 4 * 1024 * 1024;
const publicPaths = { ...CALIBRATION_SOURCE_PATHS, vocabulary: 'metadata/ingredients_metadata.csv' };
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const pinSchema = z.strictObject({ byteLength: z.number().int().positive().max(4 * 1024 * 1024), sha256: sha });
const publicPin = pinSchema.extend({ path: z.string(), url: z.string().url() }).strict();
const lockSchema = z.strictObject({
  candidateId: z.literal(QUALITY_CANDIDATE_ID), rankPrefix: z.literal('calorix-n5k-calibration-v2:'),
  checklistVersion: z.literal(QUALITY_CHECKLIST_VERSION),
  sources: z.strictObject({ metadataCafe1: publicPin, metadataCafe2: publicPin, trainSplit: publicPin, vocabulary: publicPin }),
  v1Manifest: pinSchema.extend({ path: z.literal('functions/eval/nutrition/calibration-manifest.json') }).strict(),
});
type Command = { name: 'prepare' | 'finalize' | 'verify'; allowDownloads: boolean } |
  { name: 'record-quality'; allowDownloads: false; input: Omit<QualityDecisionInput, 'at'> };
class CommandError extends Error {
  constructor(readonly status: string) { super(status); }
}
function fail(status: string): never { throw new CommandError(status); }
function digest(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
function isMissing(error: unknown): boolean { return (error as NodeJS.ErrnoException)?.code === 'ENOENT'; }

function parseArgs(argv: readonly string[]): Command {
  const [name, ...args] = argv;
  if (name === 'prepare') {
    if (args.length === 0) return { name, allowDownloads: false };
    if (args.length === 1 && args[0] === '--allow-public-downloads') return { name, allowDownloads: true };
    return fail('invalid_arguments');
  }
  if ((name === 'finalize' || name === 'verify') && args.length === 0) return { name, allowDownloads: false };
  if (name !== 'record-quality' || args.length % 2 !== 0) return fail('invalid_arguments');
  const values = new Map<string, string>();
  const keys = ['--case-id', '--image-sha', '--verdict', '--reviewer', '--note', '--reason', '--supersedes'];
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]!; const value = args[i + 1]!;
    if (!keys.includes(key) || values.has(key) || !value.trim()) return fail('invalid_arguments');
    values.set(key, value);
  }
  const id = values.get('--case-id'); const imageSha = values.get('--image-sha');
  const verdict = values.get('--verdict'); const reviewer = values.get('--reviewer'); const note = values.get('--note');
  const reason = values.get('--reason'); const supersedes = values.get('--supersedes');
  if (!id || !/^dish_[0-9]+$/.test(id) || !sha.safeParse(imageSha).success ||
      !reviewer || reviewer.length > 128 || !note || note.length > 2000 ||
      (verdict !== 'pass' && verdict !== 'reject') ||
      (verdict === 'pass' && reason !== undefined) ||
      (verdict === 'reject' && !['no_food', 'additional_food_container', 'target_clipped',
        'target_occluded', 'label_conflict', 'qc_uncertain'].includes(reason ?? '')) ||
      (supersedes !== undefined && (!/^[1-9][0-9]*$/.test(supersedes) || !Number.isSafeInteger(Number(supersedes))))) {
    return fail('invalid_arguments');
  }
  const base = { dishId: id, imageSha: imageSha!, reviewer, note,
    ...(supersedes === undefined ? {} : { supersedes: Number(supersedes) }) };
  const input = verdict === 'pass' ? { ...base, verdict: 'pass' as const } :
    { ...base, verdict: 'reject' as const, reason: reason as Extract<QualityDecisionInput, { verdict: 'reject' }>['reason'] };
  return { name, allowDownloads: false, input };
}

// All paths are fixed/internally constructed; check every existing segment before access.
// This protects against accidental symlinks, not a hostile user racing filesystem calls.
async function confined(root: string, path: string): Promise<string> {
  const base = resolve(root); const target = resolve(path); const rel = relative(base, target);
  if (rel.startsWith('..') || rel.startsWith('/')) return fail('unsafe_path');
  let current = base;
  for (const part of ['', ...rel.split('/').filter(Boolean)]) {
    if (part) current = join(current, part);
    try { if ((await fs.lstat(current)).isSymbolicLink()) return fail('unsafe_path'); }
    catch (error) { if (!isMissing(error)) throw error; }
  }
  return target;
}
async function readBounded(root: string, path: string, max: number): Promise<Buffer> {
  await confined(root, path);
  const stat = await fs.stat(path);
  if (!stat.isFile() || stat.size > max) return fail('invalid_file');
  const bytes = await fs.readFile(path);
  if (bytes.length > max) return fail('invalid_file');
  return bytes;
}
async function syncDirectory(path: string): Promise<void> {
  const directory = await fs.open(path, 'r');
  try { await directory.sync(); } finally { await directory.close(); }
}
async function durableMkdir(root: string, path: string): Promise<void> {
  await confined(root, path);
  let current = resolve(root);
  for (const segment of relative(current, resolve(path)).split('/').filter(Boolean)) {
    current = join(current, segment);
    try { await fs.mkdir(current); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (!(await fs.lstat(current)).isDirectory()) return fail('unsafe_path');
      continue;
    }
    await syncDirectory(current);
    await syncDirectory(dirname(current));
  }
}
async function publish(root: string, path: string, bytes: Uint8Array): Promise<void> {
  await confined(root, path);
  await durableMkdir(root, dirname(path));
  const temporary = path + '.' + randomUUID() + '.tmp';
  const handle = await fs.open(temporary, 'wx', 0o600);
  try {
    await handle.writeFile(bytes); await handle.sync(); await handle.close();
    await confined(root, path);
    await fs.rename(temporary, path);
    await syncDirectory(dirname(path));
  } finally {
    await handle.close().catch(() => undefined);
    await fs.unlink(temporary).catch(error => { if (!isMissing(error)) throw error; });
  }
}
async function download(deps: QualityCliDeps, url: string, limit: number): Promise<FetchImageResult> {
  try {
    const response = await (deps.fetch ?? globalThis.fetch)(url, {
      signal: AbortSignal.timeout(30_000), redirect: 'error',
    });
    if (response.status !== 200) {
      await response.body?.cancel();
      return { status: response.status, bytes: new Uint8Array() };
    }
    if (Number(response.headers.get('content-length') ?? 0) > limit) {
      await response.body?.cancel(); return fail('download_too_large');
    }
    const reader = response.body?.getReader();
    if (!reader) return { status: 200, bytes: new Uint8Array() };
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > limit) { await reader.cancel(); return fail('download_too_large'); }
        chunks.push(chunk.value);
      }
    } finally { reader.releaseLock(); }
    return { status: 200, bytes: Buffer.concat(chunks, size) };
  } catch (error) {
    if (error instanceof CommandError) throw error;
    return fail('download_failed');
  }
}
async function loadNativeContext(deps: QualityCliDeps, working: string, allowDownloads: boolean): Promise<QualityAuditContext> {
  const root = deps.repositoryRoot;
  const git = (args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  if (git(['status', '--porcelain', '--untracked-files=normal', '--', 'functions'])) return fail('uncommitted_tool_source');
  const codeCheckpoint = { implementationCommit: git(['log', '-1', '--format=%H', '--', 'functions']),
    functionsTreeId: git(['rev-parse', 'HEAD:functions']) };
  const lockBytes = await readBounded(root, join(root, 'functions/eval/nutrition/corpus-quality-source-lock-v2.json'), 65_536);
  const lock = lockSchema.parse(JSON.parse(lockBytes.toString('utf8')));
  const cache = async (key: keyof typeof publicPaths): Promise<Buffer> => {
    const pin = lock.sources[key];
    if (pin.path !== publicPaths[key] || pin.url !== buildSourceUrl(publicPaths[key])) return fail('source_mismatch');
    const path = join(working, 'inputs', key + '.bin');
    let bytes: Buffer;
    try { bytes = await readBounded(root, path, pin.byteLength); }
    catch (error) {
      if (!isMissing(error)) throw error;
      if (!allowDownloads) return fail('download_required');
      const result = await download(deps, pin.url, pin.byteLength);
      if (result.status !== 200) return fail('source_http_' + result.status);
      bytes = Buffer.from(result.bytes);
      verifyPinnedSourceBytes(bytes, pin);
      await publish(root, path, bytes);
    }
    verifyPinnedSourceBytes(bytes, pin);
    return bytes;
  };
  const bundle: QualitySourceBundle = { cafe1: await cache('metadataCafe1'), cafe2: await cache('metadataCafe2'),
    trainSplit: await cache('trainSplit'), vocabulary: await cache('vocabulary'),
    v1Manifest: await readBounded(root, join(root, lock.v1Manifest.path), lock.v1Manifest.byteLength) };
  const pins: QualitySourcePins = { cafe1: lock.sources.metadataCafe1, cafe2: lock.sources.metadataCafe2,
    trainSplit: lock.sources.trainSplit, vocabulary: lock.sources.vocabulary, v1Manifest: lock.v1Manifest };
  const pool = prepareQualityPool(bundle, pins);
  const vocabulary = parseQualityVocabulary(bundle.vocabulary, pins.vocabulary);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const metadata = mergeDishMetadata(parseDishMetadataCsv(decoder.decode(bundle.cafe1)), parseDishMetadataCsv(decoder.decode(bundle.cafe2)));
  return { pool, codeCheckpoint, sourceLockSha256: digest(lockBytes),
    ingredientsByDish: new Map(pool.eligible.map(row => [row.dishId, metadata.get(row.dishId)!.ingredients.map(item => ({
      ingredientId: item.ingredientId, sourceName: item.name, vocabularyName: vocabulary.get(item.ingredientId)!.name,
    }))])) };
}
function blobPath(working: string, hash: string): string { return join(working, 'images', hash + '.bin'); }
async function checkedImage(id: string, bytes: Uint8Array) {
  return verifyOverheadImage(id, async () => ({ status: 200, bytes }));
}
async function verifyBlobs(deps: QualityCliDeps, working: string, audit: QualityAudit): Promise<void> {
  const read = async (hash: string) => {
    try {
      const bytes = await readBounded(deps.repositoryRoot, blobPath(working, hash), MAX_IMAGE_BYTES);
      if (digest(bytes) !== hash) return fail('image_mismatch');
      return bytes;
    } catch (error) {
      if (error instanceof CommandError && error.status === 'unsafe_path') throw error;
      return fail('image_mismatch');
    }
  };
  for (const photo of audit.photos) {
    const meta = await checkedImage(photo.dish.dishId, await read(photo.image.sha256));
    if (meta.sha256 !== photo.image.sha256 || meta.width !== photo.image.width ||
        meta.height !== photo.image.height || meta.mediaType !== photo.image.mediaType) return fail('image_mismatch');
  }
  for (const skip of audit.skipped) {
    if (skip.reason === 'http_404') continue;
    let observed: string | undefined;
    try { await checkedImage(skip.dishId, await read(skip.imageSha)); }
    catch (error) {
      if (!(error instanceof OverheadImageCheckError)) throw error;
      observed = error.reason;
    }
    if (observed !== skip.reason) return fail('image_mismatch');
  }
}
function counts(audit: QualityAudit, context: QualityAuditContext): Pick<QualityCliResult, 'photos' | 'skipped' | 'pending'> {
  return { photos: audit.photos.length, skipped: audit.skipped.length, pending: qualityReviewStatus(audit, context).pending.length };
}
async function execute(command: Command, deps: QualityCliDeps, working: string): Promise<QualityCliResult> {
  const path = join(working, 'audit.json');
  let raw: Buffer | undefined;
  try { raw = await readBounded(deps.repositoryRoot, path, MAX_AUDIT_BYTES); }
  catch (error) { if (!isMissing(error)) throw error; }
  const value: unknown = raw ? JSON.parse(raw.toString('utf8')) : undefined;
  if (command.name !== 'verify' && value && typeof value === 'object' && 'status' in value && value.status === 'finalized') {
    return fail('already_finalized');
  }
  const context = await (deps.loadContext ? deps.loadContext(command.allowDownloads) : loadNativeContext(deps, working, command.allowDownloads));
  let audit = value === undefined ? createQualityAudit(context) : validateQualityAudit(value, context);
  await verifyBlobs(deps, working, audit);
  const save = async () => publish(deps.repositoryRoot, path, Buffer.from(JSON.stringify(audit, null, 2) + '\n'));
  if (command.name === 'verify') {
    if (!raw || audit.status !== 'finalized') return fail('not_finalized');
    return { exitCode: 0, status: 'verified', ...counts(audit, context), auditSha256: digest(raw) };
  }
  if (command.name === 'prepare') {
    if (!raw) await save();
    for (;;) {
      const state = qualityReviewStatus(audit, context);
      if (state.exhausted) return fail('stratum_exhausted');
      const next = state.missingImages[0];
      if (!next) break;
      if (!command.allowDownloads) return fail('download_required');
      const result = await download(deps, buildOverheadImageUrl(next.dishId), MAX_IMAGE_BYTES);
      if (result.status === 404) audit = recordQualityImageSkip(audit, context, { dishId: next.dishId, reason: 'http_404' });
      else {
        if (result.status !== 200) return fail('image_http_' + result.status);
        const hash = digest(result.bytes);
        await publish(deps.repositoryRoot, blobPath(working, hash), result.bytes);
        try { audit = addQualityPhoto(audit, context, next.dishId, await checkedImage(next.dishId, result.bytes)); }
        catch (error) {
          if (!(error instanceof OverheadImageCheckError) || !['invalid_signature', 'invalid_dimensions', 'invalid_media_type'].includes(error.reason)) throw error;
          audit = recordQualityImageSkip(audit, context, { dishId: next.dishId,
            reason: error.reason as 'invalid_signature' | 'invalid_dimensions' | 'invalid_media_type', imageSha: hash });
        }
      }
      await save();
    }
    return { exitCode: 0, status: 'prepared', ...counts(audit, context) };
  }
  if (command.name === 'record-quality') {
    audit = recordQualityDecision(audit, context, { ...command.input, at: (deps.now ?? (() => new Date().toISOString()))() } as QualityDecisionInput);
    await save();
    return { exitCode: 0, status: 'recorded', ...counts(audit, context) };
  }
  audit = finalizeQualityAudit(audit, context);
  await save();
  return { exitCode: 0, status: 'finalized', ...counts(audit, context) };
}
async function releaseWriter(lock: Awaited<ReturnType<typeof fs.open>>, path: string): Promise<void> {
  const owned = await lock.stat();
  await lock.close();
  try {
    const current = await fs.lstat(path);
    if (current.ino === owned.ino && current.dev === owned.dev) await fs.unlink(path);
  } catch (error) { if (!isMissing(error)) throw error; }
}
async function withWriter(command: Command, deps: QualityCliDeps, working: string): Promise<QualityCliResult> {
  let lock: Awaited<ReturnType<typeof fs.open>> | undefined;
  let lockPath: string | undefined;
  try {
    const root = deps.repositoryRoot;
    await durableMkdir(root, working);
    lockPath = await confined(root, join(working, 'writer.lock'));
    try { lock = await fs.open(lockPath, 'wx', 0o600); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') return fail('writer_locked'); throw error; }
    return await execute(command, deps, working);
  } finally {
    if (lock && lockPath) await releaseWriter(lock, lockPath);
  }
}
export async function runCorpusQualityCli(argv: readonly string[], deps: QualityCliDeps): Promise<QualityCliResult> {
  try {
    const command = parseArgs(argv); // No filesystem/client work before validation.
    const working = await confined(deps.repositoryRoot, join(deps.repositoryRoot, QUALITY_WORKING_ROOT));
    return await (command.name === 'verify' ? execute(command, deps, working) : withWriter(command, deps, working));
  } catch (error) {
    return { exitCode: 1, status: error instanceof CommandError ? error.status : 'operation_failed' };
  }
}
if (require.main === module) {
  void runCorpusQualityCli(process.argv.slice(2), createNativeQualityCliDeps()).then(result => {
    console.log(JSON.stringify(result)); process.exitCode = result.exitCode;
  }).catch(() => { console.log(JSON.stringify({ exitCode: 1, status: 'operation_failed' })); process.exitCode = 1; });
}
