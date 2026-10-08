/** Opt-in durable byte publication; never advances the calibration ledger. */
import { createHash, randomBytes } from 'node:crypto';
import {
  constants, lstatSync, openSync, fstatSync, readSync, writeSync, fsyncSync,
  closeSync, linkSync, unlinkSync, mkdirSync,
} from 'node:fs';
import type { Stats } from 'node:fs';
import { parse, resolve, sep } from 'node:path';
import { CALIBRATION_ROOT } from './calibration';
import type { CalibrationOwner, CalibrationProfile, StageName } from './calibration';
import { assembleCalibrationStageReport } from './calibration-report-assembly';
import { CalibrationFatalError } from './fatal-error';
import { renderNutritionEvalJson, renderNutritionEvalMarkdown } from './report';
import type { NutritionEvalReport } from './schema';

export interface CalibrationPublishedReportReceipt {
  readonly stage: StageName;
  readonly profile: CalibrationProfile;
  readonly runId: string;
  readonly jsonSha256: string;
  readonly markdownSha256: string;
}
export interface CalibrationReportPublicationResult {
  readonly report: NutritionEvalReport;
  readonly receipt: Readonly<CalibrationPublishedReportReceipt>;
}
export interface CalibrationReportPublicationOverrides {
  readonly fdWriteSync?: (fd: number, buffer: Buffer, offset: number, length: number) => number;
  readonly fdFsyncSync?: (fd: number) => void;
  readonly fdCloseSync?: (fd: number) => void;
  readonly linkSync?: (from: string, to: string) => void;
  readonly unlinkSync?: (path: string) => void;
  readonly fsyncDirSync?: (dir: string) => void;
}
type Hooks = Required<CalibrationReportPublicationOverrides>;
const OWNER_FIELDS = ['hostname', 'bootId', 'pid', 'startTicks', 'acquiredAt'] as const;
const HOOK_FIELDS = ['fdWriteSync', 'fdFsyncSync', 'fdCloseSync', 'linkSync', 'unlinkSync', 'fsyncDirSync'] as const;
const LOCK = Symbol('lock-invalid');
const TAMPER = Symbol('file-tampered');
const FAILED = Symbol('publication-failed');
const invalid = () => new CalibrationFatalError('calibration:report-publication-input-invalid');

/** No property gets, caller-owned freezes, or foreign exception inspection. */
function ownRecord(value: unknown, fields: readonly string[], exact = true): Record<string, unknown> {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw FAILED;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw FAILED;
    const keys = Reflect.ownKeys(value);
    if ((exact && keys.length !== fields.length) ||
      keys.some((key) => typeof key !== 'string' || !fields.includes(key))) throw FAILED;
    const captured: Record<string, unknown> = {};
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || descriptor.enumerable !== true ||
        !Object.prototype.hasOwnProperty.call(descriptor, 'value') || descriptor.value === undefined) throw FAILED;
      captured[key as string] = descriptor.value;
    }
    return captured;
  } catch { throw invalid(); }
}
function captureOwner(value: unknown): Readonly<CalibrationOwner> {
  const owner = ownRecord(value, OWNER_FIELDS);
  if (typeof owner.hostname !== 'string' || owner.hostname.trim().length === 0 ||
    typeof owner.bootId !== 'string' || owner.bootId.trim().length === 0 ||
    typeof owner.pid !== 'number' || !Number.isSafeInteger(owner.pid) || owner.pid <= 0 ||
    typeof owner.startTicks !== 'number' || !Number.isSafeInteger(owner.startTicks) || owner.startTicks <= 0 ||
    typeof owner.acquiredAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(owner.acquiredAt) ||
    !Number.isFinite(Date.parse(owner.acquiredAt)) || new Date(owner.acquiredAt).toISOString() !== owner.acquiredAt) throw invalid();
  return Object.freeze(owner) as unknown as Readonly<CalibrationOwner>;
}
function nativeDirFsync(dir: string): void {
  const fd = openSync(dir, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
function captureHooks(value: unknown): Hooks {
  const captured = value === undefined ? {} : ownRecord(value, HOOK_FIELDS, false);
  if (Object.values(captured).some((hook) => typeof hook !== 'function')) throw invalid();
  return {
    fdWriteSync: writeSync, fdFsyncSync: fsyncSync, fdCloseSync: closeSync,
    linkSync, unlinkSync, fsyncDirSync: nativeDirFsync, ...captured,
  } as Hooks;
}
/** Inspect only native errno's own data descriptor, never message/prototype/cause. */
function errno(error: unknown, code: string): boolean {
  try {
    if ((typeof error !== 'object' || error === null) && typeof error !== 'function') return false;
    const descriptor = Object.getOwnPropertyDescriptor(error, 'code');
    return descriptor !== undefined && Object.prototype.hasOwnProperty.call(descriptor, 'value') && descriptor.value === code;
  } catch { return false; }
}
function privateRegular(stat: Stats, size?: number): boolean {
  return stat.isFile() && stat.nlink === 1 && (stat.mode & 0o7777) === 0o600 &&
    (size === undefined || stat.size === size);
}
function sameInode(a: Pick<Stats, 'dev' | 'ino'>, b: Pick<Stats, 'dev' | 'ino'>): boolean {
  return a.dev === b.dev && a.ino === b.ino;
}
function validateCanonical(root: string): void {
  try {
    let path = parse(root).root;
    if (!lstatSync(path).isDirectory()) throw LOCK;
    for (const component of root.slice(path.length).split(sep)) {
      path = resolve(path, component);
      const stat = lstatSync(path);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw LOCK;
    }
    if ((lstatSync(root).mode & 0o7777) !== 0o700) throw LOCK;
  } catch { throw LOCK; }
}
function readBounded(fd: number, size: number, failure: symbol): Buffer {
  const bytes = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    const count = readSync(fd, bytes, offset, size - offset, offset);
    if (!Number.isInteger(count) || count <= 0 || count > size - offset) throw failure;
    offset += count;
  }
  return bytes;
}
interface HeldLock { readonly fd: number; readonly dev: number; readonly ino: number }
function openHeldLock(root: string, owner: Readonly<CalibrationOwner>): HeldLock {
  let fd: number | undefined;
  try {
    validateCanonical(root);
    const path = resolve(root, 'lock.json');
    const before = lstatSync(path);
    if (!privateRegular(before) || before.size > 4096) throw LOCK;
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    if (!privateRegular(stat) || stat.size > 4096 || !sameInode(before, stat)) throw LOCK;
    const packet = new TextDecoder('utf-8', { fatal: true }).decode(readBounded(fd, stat.size, LOCK));
    const observed = captureOwner(JSON.parse(packet));
    if (OWNER_FIELDS.some((field) => observed[field] !== owner[field])) throw LOCK;
    return { fd, dev: stat.dev, ino: stat.ino };
  } catch {
    if (fd !== undefined) { try { closeSync(fd); } catch { /* Preserve static lock failure. */ } }
    throw LOCK;
  }
}
function checkLock(root: string, owner: Readonly<CalibrationOwner>, held: HeldLock): void {
  const current = openHeldLock(root, owner);
  try { if (!sameInode(current, held)) throw LOCK; }
  finally { closeReadLock(current.fd); }
}
function closeReadLock(fd: number): void {
  try { closeSync(fd); } catch { throw fsFatal(FAILED); }
}
function validateReports(dir: string): void {
  const stat = lstatSync(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o7777) !== 0o700) throw TAMPER;
}
/** A failing privileged close seam cannot leave an owned descriptor open. */
function closeOwned(fd: number, hooks: Hooks): void {
  try { hooks.fdCloseSync(fd); }
  catch (error) { try { closeSync(fd); } catch { /* It may already have closed. */ } throw error; }
}
function sha256(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }
function verifyArtifact(path: string, expected: Buffer, hooks: Hooks, sync = false): boolean {
  let before: Stats;
  try { before = lstatSync(path); }
  catch (error) { if (errno(error, 'ENOENT')) return false; throw error; }
  if (!privateRegular(before, expected.length)) throw TAMPER;
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!privateRegular(stat, expected.length) || !sameInode(before, stat)) throw TAMPER;
    const actual = readBounded(fd, stat.size, TAMPER);
    if (!actual.equals(expected) || sha256(actual) !== sha256(expected)) throw TAMPER;
    if (sync) hooks.fdFsyncSync(fd);
    return true;
  } finally { closeOwned(fd, hooks); }
}
function fsFatal(error: unknown): CalibrationFatalError {
  return new CalibrationFatalError(error === LOCK ? 'calibration:report-publication-lock-invalid' :
    error === TAMPER ? 'calibration:report-file-tampered' : 'calibration:report-publication-failed');
}

export async function publishCalibrationStageReport(
  params: unknown,
  overrides?: CalibrationReportPublicationOverrides,
): Promise<Readonly<CalibrationReportPublicationResult>> {
  const request = ownRecord(params, ['stage', 'profile', 'context', 'readSnapshot']);
  const context = ownRecord(request.context, ['baseDir', 'identity', 'owner', 'firstDevelopmentCaseId', 'report', 'files']);
  const stage = request.stage;
  const profile = request.profile;
  if ((stage !== 'preflight' && stage !== 'development' && stage !== 'validation' && stage !== 'benchmark') ||
    (profile !== 'LOW' && profile !== 'MEDIUM') || typeof request.readSnapshot !== 'function' ||
    typeof context.baseDir !== 'string' || context.baseDir.trim().length === 0 || context.baseDir.includes('\0')) throw invalid();
  const baseDir = resolve(context.baseDir);
  const owner = captureOwner(context.owner);
  const hooks = captureHooks(overrides);
  const root = resolve(baseDir, CALIBRATION_ROOT);
  const reports = resolve(root, 'reports');
  let held: HeldLock;
  try { held = openHeldLock(root, owner); } catch (error) { throw fsFatal(error); }
  try {
    // Call immediately: the assembler owns every source primitive before its first await.
    // Keep its documented static errors unchanged rather than wrapping as filesystem failures.
    const report = await assembleCalibrationStageReport({ ...request, context: { ...context, baseDir, owner } });
    const temps = new Set<string>();
    try {
      const assertPaths = () => { checkLock(root, owner, held); validateReports(reports); };
      checkLock(root, owner, held);
      try { validateReports(reports); }
      catch (error) {
        if (!errno(error, 'ENOENT')) throw error;
        try { mkdirSync(reports, { mode: 0o700 }); }
        catch (creationError) { if (!errno(creationError, 'EEXIST')) throw creationError; }
        validateReports(reports);
      }
      // Also on retries: persist a directory created by an earlier failed invocation.
      hooks.fsyncDirSync(root);
      const documents = [
        { path: resolve(reports, `${stage}-${profile.toLowerCase()}.json`), bytes: Buffer.from(renderNutritionEvalJson(report), 'utf8') },
        { path: resolve(reports, `${stage}-${profile.toLowerCase()}.md`), bytes: Buffer.from(renderNutritionEvalMarkdown(report), 'utf8') },
      ];
      for (const document of documents) {
        assertPaths();
        if (verifyArtifact(document.path, document.bytes, hooks)) continue;
        const temp = `${document.path}.tmp.${randomBytes(16).toString('hex')}`;
        const fd = openSync(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        temps.add(temp); // Only exclusive-create success establishes ownership.
        try {
          if (!privateRegular(fstatSync(fd))) throw FAILED;
          let offset = 0;
          while (offset < document.bytes.length) {
            const remaining = document.bytes.length - offset;
            const count = hooks.fdWriteSync(fd, document.bytes, offset, remaining);
            if (!Number.isSafeInteger(count) || count <= 0 || count > remaining) throw FAILED;
            offset += count;
          }
          hooks.fdFsyncSync(fd);
        } finally { closeOwned(fd, hooks); }
        assertPaths();
        try { hooks.linkSync(temp, document.path); }
        catch (error) {
          if (!errno(error, 'EEXIST')) throw error;
          if (!verifyArtifact(document.path, document.bytes, hooks)) throw TAMPER;
        }
        hooks.unlinkSync(temp);
        temps.delete(temp);
        hooks.fsyncDirSync(reports);
      }
      for (const document of documents) {
        assertPaths();
        if (!verifyArtifact(document.path, document.bytes, hooks, true)) throw TAMPER;
      }
      assertPaths();
      hooks.fsyncDirSync(reports);
      assertPaths();
      const receipt = Object.freeze({ stage, profile, runId: report.runId,
        jsonSha256: sha256(documents[0]!.bytes), markdownSha256: sha256(documents[1]!.bytes) });
      return Object.freeze({ report, receipt });
    } catch (error) { throw fsFatal(error); }
    finally {
      // Never sweep a directory or remove final artifacts. Native fallback handles
      // an unlink seam failing after link, so a retry sees a single-link final.
      for (const temp of temps) { try { unlinkSync(temp); } catch { /* Best effort, only owned names. */ } }
    }
  } finally { closeReadLock(held.fd); }
}
