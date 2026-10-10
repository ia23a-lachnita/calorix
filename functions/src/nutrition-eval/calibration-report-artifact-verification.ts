/** Read-only byte verification under a cooperative private lock, not receipt admission. */
import { createHash } from 'node:crypto';
import { constants, lstatSync, openSync, fstatSync, readSync, closeSync } from 'node:fs';
import type { Stats } from 'node:fs';
import { parse, resolve, sep } from 'node:path';
import { CALIBRATION_ROOT } from './calibration';
import type { CalibrationOwner, CalibrationProfile, StageName } from './calibration';
import { prepareCalibrationStageReportReconstructor } from './calibration-report-assembly';
import type { CalibrationStageReportReconstructor } from './calibration-report-assembly';
import type { CalibrationReportPublicationResult } from './calibration-report-publication';
import type { CalibrationStageReportSnapshot } from './calibration-report-state';
import { CalibrationFatalError } from './fatal-error';
import { renderNutritionEvalJson, renderNutritionEvalMarkdown } from './report';

export interface VerifyCalibrationStageReportArtifactsParams {
  readonly stage: StageName;
  readonly profile: CalibrationProfile;
  readonly snapshot: CalibrationStageReportSnapshot;
}
export interface CalibrationStageReportArtifactVerifier {
  readonly verify: (params: unknown) => Readonly<CalibrationReportPublicationResult>;
}
const LOCK = Symbol('lock-invalid');
const TAMPER = Symbol('file-tampered');
const FAILED = Symbol('artifact-read-failed');
const INPUT = 'calibration:report-artifact-input-invalid';
const OWNER_FIELDS = ['hostname', 'bootId', 'pid', 'startTicks', 'acquiredAt'] as const;
type Failure = typeof LOCK | typeof TAMPER | typeof FAILED;
type Inode = { readonly dev: number; readonly ino: number };
type Directory = Inode & { readonly path: string; readonly privateMode: boolean; readonly failure: Failure };
type Opened = Inode & {
  readonly path: string; readonly fd: number; readonly size: number;
  readonly mtimeMs: number; readonly ctimeMs: number;
};
type Document = Opened & { readonly expected: Buffer; actual: Buffer };

function fatal(failure: Failure): CalibrationFatalError {
  return new CalibrationFatalError(failure === LOCK ? 'calibration:report-artifact-lock-invalid' :
    failure === TAMPER ? 'calibration:report-file-tampered' : 'calibration:report-artifact-read-failed');
}
/** Descriptor-only capture; no foreign exception inspection or caller freezing. */
function ownRecord(value: unknown, fields: readonly string[]): Record<string, unknown> {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw FAILED;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw FAILED;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== fields.length || keys.some((key) => typeof key !== 'string' || !fields.includes(key))) throw FAILED;
    const owned: Record<string, unknown> = {};
    for (const field of fields) {
      const descriptor = Object.getOwnPropertyDescriptor(value, field);
      if (descriptor === undefined || descriptor.enumerable !== true ||
        !Object.prototype.hasOwnProperty.call(descriptor, 'value') || descriptor.value === undefined) throw FAILED;
      owned[field] = descriptor.value;
    }
    return owned;
  } catch { throw new CalibrationFatalError(INPUT); }
}
function captureOwner(value: unknown): Readonly<CalibrationOwner> {
  const owner = ownRecord(value, OWNER_FIELDS);
  if (typeof owner.hostname !== 'string' || owner.hostname.trim().length === 0 ||
    typeof owner.bootId !== 'string' || owner.bootId.trim().length === 0 ||
    typeof owner.pid !== 'number' || !Number.isSafeInteger(owner.pid) || owner.pid <= 0 ||
    typeof owner.startTicks !== 'number' || !Number.isSafeInteger(owner.startTicks) || owner.startTicks <= 0 ||
    typeof owner.acquiredAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(owner.acquiredAt) ||
    !Number.isFinite(Date.parse(owner.acquiredAt)) || new Date(owner.acquiredAt).toISOString() !== owner.acquiredAt) {
    throw new CalibrationFatalError(INPUT);
  }
  return Object.freeze(owner) as unknown as Readonly<CalibrationOwner>;
}
function safeInode(stat: Inode): boolean {
  return Number.isSafeInteger(stat.dev) && stat.dev >= 0 && Number.isSafeInteger(stat.ino) && stat.ino >= 0;
}
function sameInode(a: Inode, b: Inode): boolean { return a.dev === b.dev && a.ino === b.ino; }
function privateRegular(stat: Stats, size?: number): boolean {
  return stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && (stat.mode & 0o7777) === 0o600 &&
    safeInode(stat) && Number.isSafeInteger(stat.size) && stat.size >= 0 &&
    Number.isFinite(stat.mtimeMs) && Number.isFinite(stat.ctimeMs) && (size === undefined || stat.size === size);
}
function sameMetadata(stat: Stats | Opened, opened: Opened): boolean {
  return sameInode(stat, opened) && stat.size === opened.size &&
    stat.mtimeMs === opened.mtimeMs && stat.ctimeMs === opened.ctimeMs;
}
function inspectDirectory(path: string, privateMode: boolean, failure: Failure): Stats {
  try {
    const stat = lstatSync(path);
    if (!stat.isDirectory() || stat.isSymbolicLink() || !safeInode(stat) ||
      (privateMode && (stat.mode & 0o7777) !== 0o700)) throw failure;
    return stat;
  } catch { throw failure; }
}
/** Leaf nofollow plus observed ancestor stability; not an atomic directory-fd walk. */
function captureDirectories(root: string, reports: string): Directory[] {
  const directories: Directory[] = [];
  const capture = (path: string, privateMode: boolean, failure: Failure): void => {
    const stat = inspectDirectory(path, privateMode, failure);
    directories.push({ path, privateMode, failure, dev: stat.dev, ino: stat.ino });
  };
  let path = parse(root).root;
  capture(path, path === root, LOCK);
  for (const component of root.slice(path.length).split(sep).filter(Boolean)) {
    path = resolve(path, component);
    capture(path, path === root, LOCK);
  }
  capture(reports, true, TAMPER);
  return directories;
}
function assertDirectories(directories: readonly Directory[]): void {
  for (const directory of directories) {
    const stat = inspectDirectory(directory.path, directory.privateMode, directory.failure);
    if (!sameInode(stat, directory)) throw directory.failure;
  }
}
function readBounded(fd: number, size: number, failure: Failure): Buffer {
  const bytes = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    const count = readSync(fd, bytes, offset, size - offset, offset);
    if (!Number.isSafeInteger(count) || count <= 0 || count > size - offset) throw failure;
    offset += count;
  }
  return bytes;
}
function readFlags(): number { return constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK; }
function openLock(root: string, owner: Readonly<CalibrationOwner>, fds: Set<number>): Opened {
  try {
    const path = resolve(root, 'lock.json');
    const before = lstatSync(path);
    if (!privateRegular(before) || before.size > 4096) throw LOCK;
    const fd = openSync(path, readFlags());
    fds.add(fd); // Every successful acquisition belongs to outer cleanup immediately.
    const opened: Opened = { path, fd, dev: before.dev, ino: before.ino, size: before.size,
      mtimeMs: before.mtimeMs, ctimeMs: before.ctimeMs };
    const stat = fstatSync(fd);
    if (!privateRegular(stat, opened.size) || !sameMetadata(stat, opened)) throw LOCK;
    const packet = new TextDecoder('utf-8', { fatal: true }).decode(readBounded(fd, opened.size, LOCK));
    const observed = captureOwner(JSON.parse(packet));
    if (OWNER_FIELDS.some((field) => observed[field] !== owner[field])) throw LOCK;
    const after = fstatSync(fd);
    if (!privateRegular(after, opened.size) || !sameMetadata(after, opened)) throw LOCK;
    return opened;
  } catch { throw LOCK; }
}
function checkLock(root: string, owner: Readonly<CalibrationOwner>, held: Opened, fds: Set<number>): void {
  let current: Opened | undefined;
  let failure: Failure | undefined;
  try {
    const stat = fstatSync(held.fd);
    if (!privateRegular(stat, held.size) || !sameMetadata(stat, held)) throw LOCK;
    current = openLock(root, owner, fds);
    if (!sameMetadata(current, held)) throw LOCK;
  } catch { failure = LOCK; }
  finally {
    if (current !== undefined) {
      fds.delete(current.fd); // Attempt once; Linux close may release fd even when throwing.
      try { closeSync(current.fd); } catch { failure ??= FAILED; }
    }
  }
  if (failure !== undefined) throw failure;
}
/** Only native lstat errno's own data code is inspected; never a message/cause/prototype. */
function isMissing(error: unknown): boolean {
  try {
    if ((typeof error !== 'object' || error === null) && typeof error !== 'function') return false;
    const descriptor = Object.getOwnPropertyDescriptor(error, 'code');
    return descriptor !== undefined && Object.prototype.hasOwnProperty.call(descriptor, 'value') && descriptor.value === 'ENOENT';
  } catch { return false; }
}
function artifactStat(path: string): Stats {
  try { return lstatSync(path); }
  catch (error) { throw isMissing(error) ? TAMPER : FAILED; }
}
function assertDocument(document: Document): void {
  const stat = fstatSync(document.fd);
  const pathStat = artifactStat(document.path);
  if (!privateRegular(stat, document.expected.length) || !sameMetadata(stat, document) ||
    !privateRegular(pathStat, document.expected.length) || !sameMetadata(pathStat, document)) throw TAMPER;
}
function openDocument(path: string, expected: Buffer, fds: Set<number>): Document {
  const before = artifactStat(path);
  if (!privateRegular(before, expected.length)) throw TAMPER;
  const fd = openSync(path, readFlags());
  fds.add(fd);
  const opened: Opened = { path, fd, dev: before.dev, ino: before.ino, size: before.size,
    mtimeMs: before.mtimeMs, ctimeMs: before.ctimeMs };
  const stat = fstatSync(fd);
  if (!privateRegular(stat, expected.length) || !sameMetadata(stat, opened)) throw TAMPER;
  const actual = readBounded(fd, expected.length, TAMPER);
  if (!actual.equals(expected)) throw TAMPER;
  const document: Document = { ...opened, expected, actual };
  assertDocument(document);
  return document;
}
function sha256(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }
/** Returned closure retains only owned path/owner/source, never caller metadata. */
function createVerifier(
  root: string, owner: Readonly<CalibrationOwner>, ready: Readonly<CalibrationStageReportReconstructor>,
): Readonly<CalibrationStageReportArtifactVerifier> {
  return Object.freeze({ verify: (params: unknown): Readonly<CalibrationReportPublicationResult> => {
    const request = ownRecord(params, ['stage', 'profile', 'snapshot']);
    const stage = request.stage, profile = request.profile;
    if ((stage !== 'preflight' && stage !== 'development' && stage !== 'validation' && stage !== 'benchmark') ||
      (profile !== 'LOW' && profile !== 'MEDIUM')) throw new CalibrationFatalError(INPUT);
    // Preserve source INVALID/INCOMPLETE before any native operation/catch.
    const report = ready.reconstruct({ stage, profile, snapshot: request.snapshot });
    const fds = new Set<number>();
    let failure: Failure | undefined, result: Readonly<CalibrationReportPublicationResult> | undefined;
    try {
      const reports = resolve(root, 'reports');
      const directories = captureDirectories(root, reports);
      const held = openLock(root, owner, fds);
      const documents: Document[] = [];
      for (const [ext, text] of [['json', renderNutritionEvalJson(report)], ['md', renderNutritionEvalMarkdown(report)]] as const) {
        assertDirectories(directories); checkLock(root, owner, held, fds);
        documents.push(openDocument(resolve(reports, `${stage}-${profile.toLowerCase()}.${ext}`), Buffer.from(text, 'utf8'), fds));
      }
      for (const document of documents) {
        assertDirectories(directories); checkLock(root, owner, held, fds);
        assertDocument(document);
        document.actual = readBounded(document.fd, document.expected.length, TAMPER);
        if (!document.actual.equals(document.expected)) throw TAMPER;
        assertDocument(document);
      }
      assertDirectories(directories); checkLock(root, owner, held, fds);
      // First-document drift during final Markdown/lock reads must still be observed.
      for (const document of documents) assertDocument(document);
      result = Object.freeze({ report, receipt: Object.freeze({ stage, profile, runId: report.runId,
        jsonSha256: sha256(documents[0]!.actual), markdownSha256: sha256(documents[1]!.actual) }) });
    } catch (error) { failure = error === LOCK ? LOCK : error === TAMPER ? TAMPER : FAILED; }
    finally {
      for (const fd of Array.from(fds).reverse()) {
        fds.delete(fd);
        try { closeSync(fd); } catch { failure ??= FAILED; }
      }
    }
    if (failure !== undefined) throw fatal(failure);
    return result!;
  } });
}
export async function prepareCalibrationStageReportArtifactVerifier(
  context: unknown,
): Promise<Readonly<CalibrationStageReportArtifactVerifier>> {
  const captured = ownRecord(context, ['baseDir', 'identity', 'owner', 'firstDevelopmentCaseId', 'report', 'files']);
  if (typeof captured.baseDir !== 'string' || captured.baseDir.trim().length === 0 || captured.baseDir.includes('\0') ||
    typeof constants.O_NOFOLLOW !== 'number' || constants.O_NOFOLLOW <= 0 ||
    typeof constants.O_NONBLOCK !== 'number' || constants.O_NONBLOCK <= 0) throw new CalibrationFatalError(INPUT);
  const root = resolve(captured.baseDir, CALIBRATION_ROOT);
  const owner = captureOwner(captured.owner);
  // Invoke immediately: reconstructor owns all identity/file primitives before suspension.
  const ready = await prepareCalibrationStageReportReconstructor(captured);
  return createVerifier(root, owner, ready);
}
