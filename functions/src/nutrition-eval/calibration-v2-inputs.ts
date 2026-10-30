import type { CalibrationV2AdmissionInput, CalibrationV2Admission } from './calibration-v2-admission';
import { admitCalibrationV2Candidate } from './calibration-v2-admission';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import {
  CALIBRATION_ACTIVATION_LOCK_V2_PATH, CALIBRATION_ACTIVATION_LOCK_V2_SHA256,
  CALIBRATION_V2_PRIOR_EVIDENCE_PATHS, CalibrationActivationLockV2Schema,
} from './calibration-v2-lock';
import {
  CORPUS_QUALITY_PUBLIC_PATHS, QualitySourceLockSchema, buildQualityAuditContext,
} from './calibration-corpus-quality-source';
import { QUALITY_WORKING_ROOT, validateQualityAudit } from './calibration-corpus-quality-audit';
import { buildSourceUrl } from './calibration-corpus';
import type { QualitySourceBundle } from './calibration-corpus-quality-policy';

const CORPUS_LOCK_PATH = 'functions/eval/nutrition/corpus-quality-source-lock-v2.json';
const MAX_SOURCE_BYTES = 4 * 1024 * 1024;
function fail(message: string): never { throw new Error('calibration:v2-input:' + message); }
function git(root: string, args: string[], maxBuffer = MAX_SOURCE_BYTES): Buffer {
  try {
    return execFileSync('git', args, { cwd: root, maxBuffer, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } });
  }
  catch { return fail('git source unavailable'); }
}
function gitText(root: string, args: string[]): string { return git(root, args).toString('utf8').trim(); }
function sourceSnapshot(root: string) {
  if (gitText(root, ['status', '--porcelain', '--untracked-files=all', '--', 'functions'])) fail('uncommitted Functions source');
  const implementationCommit = gitText(root, ['log', '-1', '--format=%H', '--', 'functions']);
  const functionsTreeId = gitText(root, ['rev-parse', 'HEAD:functions']);
  if (!/^[a-f0-9]{40}$/.test(implementationCommit) || !/^[a-f0-9]{40}$/.test(functionsTreeId)) fail('invalid Git source identity');
  return { implementationCommit, functionsTreeId };
}
function requireDigest(bytes: Uint8Array, expected: string, label: string): void {
  if (createHash('sha256').update(bytes).digest('hex') !== expected) fail(label + ':sha256 mismatch');
}
function json(bytes: Uint8Array): unknown { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }

// Fixed paths with per-segment symlink rejection. Like the existing offline
// reader, this is not a guarantee against a hostile local filesystem race.
async function confined(root: string, path: string): Promise<void> {
  const rel = relative(root, path);
  if (rel.startsWith('..') || isAbsolute(rel)) fail('unsafe path');
  let current = root;
  for (const part of ['', ...rel.split('/').filter(Boolean)]) {
    if (part) current = join(current, part);
    if ((await fs.lstat(current)).isSymbolicLink()) fail('symlink path rejected');
  }
}
async function readBounded(root: string, relativePath: string, max: number): Promise<Buffer> {
  const path = resolve(root, relativePath);
  await confined(root, path);
  const stat = await fs.stat(path);
  if (!stat.isFile() || stat.size > max) fail('file size bound exceeded');
  const bytes = await fs.readFile(path);
  if (bytes.length > max) fail('file size bound exceeded');
  await confined(root, path);
  return bytes;
}

export async function readNativeCalibrationV2AdmissionInput(repositoryRoot: string): Promise<CalibrationV2AdmissionInput> {
  if (!isAbsolute(repositoryRoot) || resolve(repositoryRoot) !== repositoryRoot) fail('canonical repository path required');
  if (await fs.realpath(repositoryRoot) !== repositoryRoot) fail('symlink repository path rejected');
  const first = sourceSnapshot(repositoryRoot);
  const expectedActivationLockSha256 = CALIBRATION_ACTIVATION_LOCK_V2_SHA256;
  const committedLock = git(repositoryRoot, ['show', first.implementationCommit + ':' + CALIBRATION_ACTIVATION_LOCK_V2_PATH], 65_537);
  requireDigest(committedLock, expectedActivationLockSha256, 'committed activation-lock');
  const activationLockBytes = await readBounded(repositoryRoot, CALIBRATION_ACTIVATION_LOCK_V2_PATH, 65_536);
  requireDigest(activationLockBytes, expectedActivationLockSha256, 'activation-lock');
  const lock = CalibrationActivationLockV2Schema.parse(json(activationLockBytes));
  const producer = lock.candidate.producer;
  if (gitText(repositoryRoot, ['cat-file', '-t', producer.implementationCommit]) !== 'commit' ||
      gitText(repositoryRoot, ['rev-parse', producer.implementationCommit + ':functions']) !== producer.functionsTreeId) {
    fail('historical producer tree mismatch');
  }
  const candidateBytes = await readBounded(repositoryRoot, join(QUALITY_WORKING_ROOT, 'audit.json'), MAX_SOURCE_BYTES);
  const corpusLockBytes = await readBounded(repositoryRoot, CORPUS_LOCK_PATH, 65_536);
  requireDigest(candidateBytes, lock.candidate.rawSha256, 'candidate');
  requireDigest(corpusLockBytes, lock.candidate.corpusLockRawSha256, 'corpus-lock');
  requireDigest(git(repositoryRoot, ['show', first.implementationCommit + ':' + CORPUS_LOCK_PATH], 65_537),
    lock.candidate.corpusLockRawSha256, 'committed corpus-lock');
  const sourceLock = QualitySourceLockSchema.parse(json(corpusLockBytes));
  for (const key of Object.keys(CORPUS_QUALITY_PUBLIC_PATHS) as (keyof typeof CORPUS_QUALITY_PUBLIC_PATHS)[]) {
    const expected = CORPUS_QUALITY_PUBLIC_PATHS[key]; const pin = sourceLock.sources[key];
    if (pin.path !== expected || pin.url !== buildSourceUrl(expected)) fail('source path/URL mismatch');
  }
  const cached = (key: keyof typeof CORPUS_QUALITY_PUBLIC_PATHS) => readBounded(repositoryRoot,
    join(QUALITY_WORKING_ROOT, 'inputs', key + '.bin'), sourceLock.sources[key].byteLength);
  const bundle: QualitySourceBundle = {
    cafe1: await cached('metadataCafe1'), cafe2: await cached('metadataCafe2'),
    trainSplit: await cached('trainSplit'), vocabulary: await cached('vocabulary'),
    v1Manifest: await readBounded(repositoryRoot, sourceLock.v1Manifest.path, sourceLock.v1Manifest.byteLength),
  };
  requireDigest(git(repositoryRoot, ['show', first.implementationCommit + ':' + sourceLock.v1Manifest.path]),
    sourceLock.v1Manifest.sha256, 'committed manifest');
  const context = buildQualityAuditContext(bundle, {
    cafe1: sourceLock.sources.metadataCafe1, cafe2: sourceLock.sources.metadataCafe2,
    trainSplit: sourceLock.sources.trainSplit, vocabulary: sourceLock.sources.vocabulary, v1Manifest: sourceLock.v1Manifest,
  }, lock.candidate.corpusLockRawSha256, producer);
  // Validate shape/provenance before any SHA becomes a filesystem name. The
  // final pure admission below still owns complete admission/manifest checks.
  const audit = validateQualityAudit(json(candidateBytes), context);
  const references = new Set(audit.photos.map(photo => photo.image.sha256));
  for (const skip of audit.skipped) if (skip.reason !== 'http_404') references.add(skip.imageSha);
  const images = new Map<string, Uint8Array>();
  for (const hash of references) {
    if (!/^[a-f0-9]{64}$/.test(hash)) fail('unsafe image path');
    images.set(hash, await readBounded(repositoryRoot, join(QUALITY_WORKING_ROOT, 'images', hash + '.bin'), 5 * 1024 * 1024));
  }
  const priorEvidence = new Map<string, Uint8Array>();
  for (const path of CALIBRATION_V2_PRIOR_EVIDENCE_PATHS) {
    const bytes = await readBounded(repositoryRoot, join(lock.prior.root, path), MAX_SOURCE_BYTES);
    requireDigest(bytes, lock.prior.evidenceSha256[path], 'prior evidence');
    priorEvidence.set(path, bytes);
  }
  const second = sourceSnapshot(repositoryRoot);
  if (first.implementationCommit !== second.implementationCommit || first.functionsTreeId !== second.functionsTreeId) fail('Functions source identity drift');
  return { activationLockBytes, expectedActivationLockSha256, candidateBytes, corpusLockBytes, bundle, images, priorEvidence };
}
export async function readNativeCalibrationV2Admission(repositoryRoot: string): Promise<Readonly<CalibrationV2Admission>> {
  return admitCalibrationV2Candidate(await readNativeCalibrationV2AdmissionInput(repositoryRoot));
}
