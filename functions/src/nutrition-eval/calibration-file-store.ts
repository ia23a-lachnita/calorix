/**
 * Task 6 atomic file store: real-filesystem CalibrationLedgerDeps.
 *
 * Fixed logical root (`CALIBRATION_ROOT`) with physical files exclusively
 * inside `resolve(callerBase, CALIBRATION_ROOT)`. The caller-owned baseDir
 * is never chmodded; only the canonical root is enforced private 0700 and
 * calibration files 0600. Every path segment from the caller base through
 * the canonical directory to each target is lstat-validated (symlinks and
 * non-directories rejected, never followed). Atomic JSON arrays use sibling
 * wx temp files with a complete byte loop plus fsync while the writable fd
 * is still open before close (separate fdWrite/fdFsync/fdClose seams),
 * then rename; caller dir-fsync hooks persist the rename. Final
 * file-validation hooks (`fsyncLedgerFile`/`fsyncJournalFile`) only check
 * existence, non-symlink, and regular-file type and perform no redundant
 * fsync. Strict disk-only replay holds no in-memory uncommitted cache, and
 * only privacy-safe nonempty nutrition numerics or null are journalled.
 *
 * No provider, Firebase, network, or device access occurs here.
 */
import {
  constants as nodeConstants,
  closeSync as nodeCloseSync,
  chmodSync,
  fstatSync as nodeFstatSync,
  fsyncSync as nodeFsyncSync,
  linkSync as nodeLinkSync,
  lstatSync,
  mkdirSync,
  openSync as nodeOpenSync,
  readFileSync as nodeReadFileSync,
  renameSync as nodeRenameSync,
  unlinkSync as nodeUnlinkSync,
  writeSync as nodeWriteSync,
} from 'node:fs';
import type { Stats } from 'node:fs';
import { isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { CALIBRATION_ROOT } from './calibration';
import type {
  CalibrationLedgerDeps,
  CalibrationLiveness,
  CalibrationOwner,
  JournalEntry,
  ReservationKey,
} from './calibration';
import { CalibrationFatalError } from './fatal-error';
import { captureCalibrationReportJournalEntry } from './calibration-report-journal';

const LEDGER_FILE = 'ledger.json';
const JOURNAL_FILE = 'journal.json';
const LOCK_FILE = 'lock.json';

const FILE_MODE = 0o600;
const DIR_MODE = 0o700;

const NUTRITION_NUMERIC_ALLOWLIST = new Set([
  'kcal',
  'calories',
  'proteinG',
  'carbsG',
  'fatG',
  'estimatedTotalMassG',
]);

export interface CalibrationFileStoreOverrides {
  procStatReader?: (pid: number) => string;
  nowIso?: () => string;
  writeExclusiveSync?: (path: string, data: string) => void;
  /**
   * Legacy hook retained for API compatibility. The store no longer performs
   * a redundant separate-open file fsync for temp, lock, or final-file
   * validation paths; durability comes from the writable-fd fsync inside the
   * exclusive write. This hook is never called internally.
   */
  fsyncFileSync?: (path: string) => void;
  renameSync?: (from: string, to: string) => void;
  fsyncDirSync?: (dir: string) => void;
  /** Archive-only atomic sibling-claim seam; defaults to native link. */
  linkSync?: (from: string, to: string) => void;
  /** Archive-only old-lock removal seam; defaults to native unlink. */
  unlinkSync?: (path: string) => void;
  /** Low-level writable-fd byte seam; must return bytes written (> 0). */
  fdWriteSync?: (fd: number, buffer: Buffer, offset: number, length: number) => number;
  /** Low-level writable-fd durability seam; runs while the fd is still open. */
  fdFsyncSync?: (fd: number) => void;
  /** Low-level fd close seam. */
  fdCloseSync?: (fd: number) => void;
}

export type RuntimeEvidenceFileStoreOverrides = Pick<CalibrationFileStoreOverrides,
  'procStatReader' | 'nowIso' | 'renameSync' | 'fsyncDirSync' | 'fdWriteSync' |
  'fdFsyncSync' | 'fdCloseSync' | 'linkSync' | 'unlinkSync'>;

const NATIVE_HOOKS = ['procStatReader', 'nowIso', 'renameSync', 'fsyncDirSync',
  'fdWriteSync', 'fdFsyncSync', 'fdCloseSync', 'linkSync', 'unlinkSync'] as const;
const NATIVE_OWNER_FIELDS = ['hostname', 'bootId', 'pid', 'startTicks', 'acquiredAt'] as const;
function nativeInputFailure(): never {
  throw new CalibrationFatalError('calibration:runtime-evidence-storage-input-invalid');
}
function captureNativeRecord(value: unknown, fields: readonly string[], optional = false): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return nativeInputFailure();
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== null && proto !== Object.prototype) return nativeInputFailure();
  const keys = Reflect.ownKeys(value);
  if ((!optional && keys.length !== fields.length) || keys.some((k) => typeof k !== 'string' || !fields.includes(k))) return nativeInputFailure();
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || d === undefined || d.enumerable !== true || !Object.hasOwn(d, 'value') || d.value === undefined) return nativeInputFailure();
    result[key] = d.value;
  }
  return result;
}
function captureNativeOwner(value: unknown): Readonly<CalibrationOwner> {
  const owner = captureNativeRecord(value, NATIVE_OWNER_FIELDS);
  for (const field of ['hostname', 'bootId'] as const) {
    const text = owner[field];
    if (typeof text !== 'string' || text.trim().length === 0 || /[\uD800-\uDFFF]/u.test(text)) return nativeInputFailure();
  }
  for (const field of ['pid', 'startTicks'] as const) {
    const n = owner[field];
    if (typeof n !== 'number' || !Number.isSafeInteger(n) || n <= 0 || Object.is(n, -0)) return nativeInputFailure();
  }
  const at = owner.acquiredAt;
  if (typeof at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(at)
    || !Number.isFinite(Date.parse(at)) || new Date(at).toISOString() !== at
    || Buffer.byteLength(JSON.stringify(owner), 'utf8') > 4096) return nativeInputFailure();
  return Object.freeze(owner) as unknown as Readonly<CalibrationOwner>;
}

/** Explicit native opt-in; legacy overrides and defaults remain separate. */
export function createRuntimeEvidenceFileCalibrationLedgerDeps(
  baseDir: string,
  owner: CalibrationOwner,
  overrides?: RuntimeEvidenceFileStoreOverrides,
): CalibrationLedgerDeps {
  return createNativeFileCalibrationLedgerDeps(baseDir, owner, overrides, false);
}

/** Explicit benchmark construction; only preparation reads may observe absence without creating it. */
export function createBenchmarkAuthorityFileCalibrationLedgerDeps(
  baseDir: string,
  owner: CalibrationOwner,
  overrides?: RuntimeEvidenceFileStoreOverrides,
): CalibrationLedgerDeps {
  return createNativeFileCalibrationLedgerDeps(baseDir, owner, overrides, true);
}

function createNativeFileCalibrationLedgerDeps(
  baseDir: string,
  owner: CalibrationOwner,
  overrides: RuntimeEvidenceFileStoreOverrides | undefined,
  nonMutatingPreparationReads: boolean,
): CalibrationLedgerDeps {
  try {
    if (typeof baseDir !== 'string' || baseDir.includes('\0') || !isAbsolute(baseDir) || resolve(baseDir) !== baseDir) return nativeInputFailure();
    const ownedOwner = captureNativeOwner(owner);
    const hooks = captureNativeRecord(overrides === undefined ? {} : overrides, NATIVE_HOOKS, true);
    for (const key of Object.keys(hooks)) if (typeof hooks[key] !== 'function') return nativeInputFailure();
    return createFileCalibrationLedgerDepsImpl(baseDir, Object.freeze(hooks) as RuntimeEvidenceFileStoreOverrides, ownedOwner, nonMutatingPreparationReads);
  } catch { return nativeInputFailure(); }
}

let tempCounter = 0;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameOwner(left: CalibrationOwner, right: CalibrationOwner): boolean {
  return (
    left.hostname === right.hostname &&
    left.bootId === right.bootId &&
    left.pid === right.pid &&
    left.startTicks === right.startTicks &&
    left.acquiredAt === right.acquiredAt
  );
}

function isValidOwnerShape(value: unknown): value is CalibrationOwner {
  if (!isPlainRecord(value)) return false;
  return (
    typeof value.hostname === 'string' &&
    value.hostname.trim().length > 0 &&
    typeof value.bootId === 'string' &&
    value.bootId.trim().length > 0 &&
    typeof value.pid === 'number' &&
    Number.isInteger(value.pid) &&
    value.pid > 0 &&
    typeof value.startTicks === 'number' &&
    Number.isFinite(value.startTicks) &&
    value.startTicks >= 0 &&
    typeof value.acquiredAt === 'string' &&
    value.acquiredAt.length > 0
  );
}

/**
 * Parse Linux `/proc/<pid>/stat` starttime (field 22) robustly: the
 * comm field (field 2) may contain spaces and parens, so split after
 * the final `)`. Tokens after it start at field 3, making starttime
 * index 19. Returns undefined when malformed (caller maps to unknown).
 */
export function parseProcStartTicks(statContent: string): number | undefined {
  const close = statContent.lastIndexOf(')');
  if (close === -1) return undefined;
  const after = statContent.slice(close + 1).trim().split(/\s+/);
  if (after.length < 20) return undefined;
  const raw = after[19] as string;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

const JOURNAL_ENTRY_KEYS = [
  'key',
  'predictionHash',
  'normalizedPrediction',
  'analysisLatencyMs',
  'errorCategory',
  'responseModelVersion',
] as const;

const JOURNAL_ENTRY_KEY_SET = new Set<string>(JOURNAL_ENTRY_KEYS);

/** Mirrors `CalibrationSafeErrorCategory` in calibration.ts; keep in sync. */
const CALIBRATION_SAFE_ERROR_CATEGORIES = new Set<string>([
  'none',
  'http_400',
  'http_401',
  'http_403',
  'http_404',
  'http_408',
  'http_429',
  'http_other_4xx',
  'http_5xx',
  'timeout',
  'network',
  'empty_response',
  'interrupted_reservation',
  'unknown',
]);

/** Mirrors `STAGE_SAMPLE_RANGE` in calibration.ts; keep in sync. */
const JOURNAL_KEY_STAGE_SAMPLE_RANGE: Record<string, { min: number; max: number }> = {
  preflight: { min: 1, max: 1 },
  development: { min: 1, max: 1 },
  validation: { min: 1, max: 3 },
  benchmark: { min: 1, max: 3 },
};

const RESERVATION_KEY_FIELDS = ['stage', 'profile', 'caseId', 'sampleIndex'] as const;
const RESERVATION_KEY_FIELD_SET = new Set<string>(RESERVATION_KEY_FIELDS);

/** Strict token pattern: no whitespace, newlines, pipes, or control chars. */
const CASE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const PREDICTION_HASH_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
/** Allows dotted/versioned model tags (e.g. `gemini-3.8-flash-001`) and `n/a`. */
const RESPONSE_MODEL_VERSION_PATTERN = /^[A-Za-z0-9_./-]{1,128}$/;

function isValidJournalKeyShape(value: unknown): value is ReservationKey {
  if (!isPlainRecord(value)) return false;
  const keys = Object.keys(value);
  if (
    keys.length !== RESERVATION_KEY_FIELDS.length ||
    keys.some((key) => !RESERVATION_KEY_FIELD_SET.has(key))
  ) {
    return false;
  }
  if (value.profile !== 'LOW' && value.profile !== 'MEDIUM') return false;
  if (typeof value.caseId !== 'string' || !CASE_ID_PATTERN.test(value.caseId)) return false;
  if (typeof value.stage !== 'string') return false;
  const range = JOURNAL_KEY_STAGE_SAMPLE_RANGE[value.stage];
  if (range === undefined) return false;
  if (typeof value.sampleIndex !== 'number' || !Number.isInteger(value.sampleIndex)) return false;
  return value.sampleIndex >= range.min && value.sampleIndex <= range.max;
}

/**
 * Validate the full journal entry shape before any field is dereferenced,
 * so a null/primitive/malformed entry throws CalibrationFatalError instead
 * of a raw TypeError.
 */
function assertValidJournalEntry(value: unknown): JournalEntry {
  let hasReportExtension = false;
  try {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, 'reportPrediction');
      if (descriptor !== undefined) {
        hasReportExtension = true;
      }
    }
  } catch {
    throw new CalibrationFatalError('calibration:journal-entry-malformed');
  }
  if (hasReportExtension) {
    return captureCalibrationReportJournalEntry(value);
  }
  if (!isPlainRecord(value)) {
    throw new CalibrationFatalError('calibration:journal-entry-malformed');
  }
  const keys = Object.keys(value);
  if (
    keys.length !== JOURNAL_ENTRY_KEYS.length ||
    keys.some((key) => !JOURNAL_ENTRY_KEY_SET.has(key))
  ) {
    throw new CalibrationFatalError('calibration:journal-entry-malformed:fields');
  }
  if (!isValidJournalKeyShape(value.key)) {
    throw new CalibrationFatalError('calibration:journal-entry-malformed:key');
  }
  if (
    typeof value.predictionHash !== 'string' ||
    !PREDICTION_HASH_PATTERN.test(value.predictionHash)
  ) {
    throw new CalibrationFatalError('calibration:journal-entry-malformed:predictionHash');
  }
  assertPrivacySafePrediction(value.normalizedPrediction);
  if (
    typeof value.analysisLatencyMs !== 'number' ||
    !Number.isFinite(value.analysisLatencyMs) ||
    value.analysisLatencyMs < 0
  ) {
    throw new CalibrationFatalError('calibration:journal-entry-malformed:analysisLatencyMs');
  }
  if (
    typeof value.errorCategory !== 'string' ||
    !CALIBRATION_SAFE_ERROR_CATEGORIES.has(value.errorCategory)
  ) {
    throw new CalibrationFatalError('calibration:journal-entry-malformed:errorCategory');
  }
  if (
    typeof value.responseModelVersion !== 'string' ||
    !RESPONSE_MODEL_VERSION_PATTERN.test(value.responseModelVersion)
  ) {
    throw new CalibrationFatalError('calibration:journal-entry-malformed:responseModelVersion');
  }
  return value as unknown as JournalEntry;
}

function assertPrivacySafePrediction(value: unknown): void {
  if (value === null) return;
  if (!isPlainRecord(value)) {
    throw new CalibrationFatalError('calibration:journal-privacy-rejected');
  }
  const keys = Object.keys(value);
  if (keys.length === 0) {
    throw new CalibrationFatalError('calibration:journal-privacy-rejected:empty');
  }
  for (const key of keys) {
    if (!NUTRITION_NUMERIC_ALLOWLIST.has(key)) {
      throw new CalibrationFatalError(`calibration:journal-privacy-rejected:${key}`);
    }
    const entry = (value as Record<string, unknown>)[key];
    if (typeof entry !== 'number' || !Number.isFinite(entry) || entry < 0) {
      throw new CalibrationFatalError(`calibration:journal-privacy-rejected:${key}`);
    }
  }
}

export function createFileCalibrationLedgerDeps(
  baseDir?: string,
  overrides: CalibrationFileStoreOverrides = {},
): CalibrationLedgerDeps {
  return createFileCalibrationLedgerDepsImpl(baseDir, overrides);
}

function createFileCalibrationLedgerDepsImpl(
  baseDir: string | undefined,
  overrides: CalibrationFileStoreOverrides,
  nativeOwner?: Readonly<CalibrationOwner>,
  nonMutatingPreparationReads = false,
): CalibrationLedgerDeps {
  const callerBase = resolve(baseDir ?? process.cwd());
  const canonicalDir = resolve(callerBase, CALIBRATION_ROOT);
  type DirectoryIdentity = { path: string; dev: number; ino: number };
  let directories: readonly DirectoryIdentity[] | undefined;
  let lockIdentity: Stats | undefined;
  let pendingPublication: { path: string; stat: Stats } | undefined;
  let nativePoisoned = false;
  let nativeBusy = false;
  let nativeReadOnlyTraversal = false;
  let archiveLinkActive = false;
  let namespaceReady = false;

  function nativeFail(): never {
    nativePoisoned = true;
    throw new CalibrationFatalError('calibration:runtime-evidence-storage-failed');
  }
  function nativeReady(): void { if (nativePoisoned) nativeFail(); }
  function sameInode(a: { dev: number; ino: number }, b: { dev: number; ino: number }): boolean {
    return a.dev === b.dev && a.ino === b.ino;
  }
  function sameMetadata(a: Stats, b: Stats): boolean {
    return sameInode(a, b) && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
  }
  function privateFile(stat: Stats, links = 1): boolean {
    return stat.isFile() && !stat.isSymbolicLink() && stat.nlink === links && (stat.mode & 0o7777) === FILE_MODE
      && Number.isSafeInteger(stat.size) && stat.size >= 0;
  }
  function checkDirectories(): void {
    nativeReady();
    for (const expected of directories ?? []) {
      const current = lstatSync(expected.path);
      if (!current.isDirectory() || current.isSymbolicLink() || !sameInode(current, expected)
        || (expected.path === canonicalDir && (current.mode & 0o7777) !== DIR_MODE)) nativeFail();
    }
  }
  function observeDirectories(target = canonicalDir): void {
    if (directories !== undefined) { checkDirectories(); return; }
    const captured: DirectoryIdentity[] = [];
    let current = parse(canonicalDir).root;
    const capture = () => {
      const stat = lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()
        || (current === canonicalDir && (stat.mode & 0o7777) !== DIR_MODE)) nativeFail();
      captured.push({ path: current, dev: stat.dev, ino: stat.ino });
    };
    capture();
    for (const component of target.slice(current.length).split(sep).filter(Boolean)) {
      current = join(current, component);
      capture();
    }
    directories = captured;
  }
  function nativeLeaves(): void {
    checkDirectories();
    for (const name of [LEDGER_FILE, JOURNAL_FILE, LOCK_FILE]) {
      const path = resolve(canonicalDir, name);
      let stat: Stats;
      try { stat = lstatSync(path); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
      if (!privateFile(stat, name === LOCK_FILE && archiveLinkActive ? 2 : 1)) nativeFail();
    }
  }
  /** Leaf nofollow, descriptor/path identity and metadata recheck, not an atomic dir-fd walk. */
  function nativeRead(path: string, maxBytes?: number): string | undefined {
    nativeLeaves();
    let before: Stats;
    try { before = lstatSync(path); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
    const links = path === resolve(canonicalDir, LOCK_FILE) && archiveLinkActive ? 2 : 1;
    if (!privateFile(before, links) || (maxBytes !== undefined && before.size > maxBytes)) nativeFail();
    const fd = nodeOpenSync(path, nodeConstants.O_RDONLY | nodeConstants.O_NOFOLLOW | nodeConstants.O_NONBLOCK);
    try {
      const opened = nodeFstatSync(fd);
      if (!privateFile(opened, links) || !sameMetadata(opened, before)) nativeFail();
      const bytes = nodeReadFileSync(fd);
      const after = nodeFstatSync(fd);
      if (bytes.length !== opened.size || !privateFile(after, links) || !sameMetadata(after, opened)
        || !sameMetadata(lstatSync(path), opened)) nativeFail();
      checkDirectories();
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } finally { nodeCloseSync(fd); }
  }
  function nativeReadLock(): CalibrationOwner | undefined {
    const text = nativeRead(resolve(canonicalDir, LOCK_FILE), 4096);
    if (text === undefined) return undefined;
    const owner = captureNativeOwner(JSON.parse(text));
    const stat = lstatSync(resolve(canonicalDir, LOCK_FILE));
    if (lockIdentity !== undefined && !sameMetadata(lockIdentity, stat)) nativeFail();
    if (sameOwner(owner, nativeOwner!) && lockIdentity === undefined) lockIdentity = stat;
    return owner;
  }
  function requireNativeOwner(): void {
    nativeReady();
    const current = nativeReadLock();
    if (current === undefined || !sameOwner(current, nativeOwner!)) nativeFail();
  }
  function nativeFinal(): void {
    requireNativeOwner();
    if (pendingPublication !== undefined) {
      const stat = lstatSync(pendingPublication.path);
      if (!privateFile(stat) || !sameMetadata(stat, pendingPublication.stat)) nativeFail();
    }
  }
  function cleanupNativeTemp(path: string, expected: Stats): void {
    // No callbacks or poison reset during cleanup; uncertain/foreign paths are
    // left in place. A final ledger, journal or lock is never a cleanup target.
    if (!path.startsWith(canonicalDir + sep) || !path.includes('.tmp.')) return;
    try {
      for (const directory of directories ?? []) {
        const stat = lstatSync(directory.path);
        if (!stat.isDirectory() || stat.isSymbolicLink() || !sameInode(stat, directory)) return;
      }
      const stat = lstatSync(path);
      if (privateFile(stat) && sameInode(stat, expected)) nodeUnlinkSync(path);
    } catch { /* preserve uncertain owned artifacts, never sweep */ }
  }
  function nativeWritableIdentity(fd: number, expected: Stats): Stats {
    let current: Stats;
    try { current = nodeFstatSync(fd); } catch { return nativeFail(); }
    if (!sameInode(current, expected)) return nativeFail();
    return current;
  }
  function requireNativeWritable(fd: number, expected: Stats): void {
    if (!privateFile(nativeWritableIdentity(fd, expected))) nativeFail();
  }
  function establishNativeNamespace(): void {
    if (directories === undefined) ensureCanonicalChain();
    checkDirectories();
    if (namespaceReady) return;
    const observed = directories;
    if (observed === undefined) return nativeFail();
    const first = observed.findIndex((entry) => entry.path === callerBase);
    const last = observed.findIndex((entry) => entry.path === canonicalDir);
    if (first < 0 || last <= first || last !== observed.length - 1) nativeFail();
    for (const parent of observed.slice(first, last)) {
      try { fsyncDirSync(parent.path); } catch { nativeFail(); }
      nativeReady();
      checkDirectories();
    }
    namespaceReady = true;
  }
  function closeNativeWritable(fd: number, expected: Stats): void {
    // Cleanup still closes our descriptor after poison, but never a foreign
    // inode installed by a write/fsync hook before this close boundary.
    nativeWritableIdentity(fd, expected);
    let failed = false;
    try { fdCloseSync(fd); } catch { failed = true; }
    let remaining: Stats | undefined;
    try { remaining = nodeFstatSync(fd); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EBADF') failed = true; }
    if (remaining !== undefined) {
      // The hook may have closed fd and reused its number for a foreign inode.
      // Never blindly retry close on that descriptor number.
      if (sameInode(remaining, expected)) nodeCloseSync(fd);
      failed = true;
    }
    if (failed) nativeFail();
  }
  function nativeWriteExclusive(path: string, data: string): void {
    establishNativeNamespace();
    if (path !== resolve(canonicalDir, LOCK_FILE)) requireNativeOwner();
    nativeLeaves();
    const bytes = Buffer.from(data, 'utf8');
    const fd = nodeOpenSync(path, nodeConstants.O_WRONLY | nodeConstants.O_CREAT | nodeConstants.O_EXCL | nodeConstants.O_NOFOLLOW, FILE_MODE);
    let identity: Stats;
    try { identity = nodeFstatSync(fd); }
    catch {
      // No foreign callback has run since exclusive open: this descriptor is
      // still ours, even when its first metadata read fails.
      try { nodeCloseSync(fd); } catch { /* uncertain native close; no retry */ }
      nativeFail();
    }
    let failed = !privateFile(identity);
    try {
      if (failed) nativeFail();
      let offset = 0;
      while (offset < bytes.length) {
        const remaining = bytes.length - offset;
        requireNativeWritable(fd, identity);
        const count = fdWriteSync(fd, bytes, offset, remaining);
        nativeReady();
        requireNativeWritable(fd, identity);
        if (!Number.isSafeInteger(count) || count <= 0 || count > remaining) nativeFail();
        offset += count;
      }
      requireNativeWritable(fd, identity);
      fdFsyncSync(fd);
      nativeReady();
      requireNativeWritable(fd, identity);
    } catch { failed = true; }
    try { closeNativeWritable(fd, identity); } catch { failed = true; }
    if (failed) { cleanupNativeTemp(path, identity); nativeFail(); }
    checkDirectories();
    const finalStat = lstatSync(path);
    if (!privateFile(finalStat) || !sameInode(finalStat, identity)) nativeFail();
  }

  const procStatReader =
    overrides.procStatReader ??
    ((pid: number): string => nodeReadFileSync(`/proc/${pid}/stat`, 'utf8'));
  const nowIso = overrides.nowIso ?? ((): string => new Date().toISOString());

  function fatal(message: string, cause: unknown): CalibrationFatalError {
    // Never traverse or retain a foreign exception in the guarded route.
    if (nativeOwner !== undefined) nativeFail();
    if (cause instanceof CalibrationFatalError) return cause;
    return new CalibrationFatalError(message, { cause });
  }

  /**
   * Validate the caller base exists as a real directory without mutating it.
   * The caller-owned baseDir is never chmodded, even when it carries 0755.
   */
  function ensureCallerBase(): void {
    if (nativeOwner !== undefined) {
      nativeReady();
      let current = parse(callerBase).root;
      const check = () => {
        const stat = lstatSync(current);
        if (!stat.isDirectory() || stat.isSymbolicLink()) nativeFail();
      };
      check();
      for (const component of callerBase.slice(current.length).split(sep).filter(Boolean)) {
        current = join(current, component);
        check();
      }
      return;
    }
    let stat;
    try {
      stat = lstatSync(callerBase);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        throw fatal('calibration:base-dir-lstat-failed', error);
      }
      try {
        mkdirSync(callerBase, { recursive: true });
      } catch (mkdirError) {
        throw fatal('calibration:base-dir-mkdir-failed', mkdirError);
      }
      try {
        stat = lstatSync(callerBase);
      } catch (restatError) {
        throw fatal('calibration:base-dir-lstat-failed', restatError);
      }
    }
    if (stat.isSymbolicLink()) {
      throw new CalibrationFatalError('calibration:base-dir-symlink-rejected');
    }
    if (!stat.isDirectory()) {
      throw new CalibrationFatalError('calibration:base-dir-not-directory');
    }
  }

  /**
   * Check every path segment from the caller base through the canonical
   * directory: reject symlinks and non-directories, create missing segments
   * private, and enforce 0700 on the canonical root only.
   */
  function ensureCanonicalChain(): boolean {
    if (nativeOwner !== undefined) checkDirectories();
    ensureCallerBase();
    const rel = relative(callerBase, canonicalDir);
    if (rel === '') {
      throw new CalibrationFatalError('calibration:canonical-root-escape');
    }
    if (rel.startsWith('..') || rel.split(sep).includes('..')) {
      throw new CalibrationFatalError('calibration:canonical-root-escape');
    }
    const parts = rel.split(sep).filter((part) => part.length > 0);
    if (nativeOwner !== undefined) {
      if (directories?.[directories.length - 1]?.path !== canonicalDir) {
        // Retain any previously observed prefix; never rebind its identities.
        // Only the explicit benchmark reader may stop at native absence.
        if (directories === undefined) observeDirectories(callerBase);
        let current = directories![directories!.length - 1]!.path;
        for (const part of relative(current, canonicalDir).split(sep).filter(Boolean)) {
          checkDirectories();
          current = join(current, part);
          let stat: Stats;
          try { stat = lstatSync(current); }
          catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') nativeFail();
            if (nativeReadOnlyTraversal) { checkDirectories(); return false; }
            mkdirSync(current, { mode: DIR_MODE });
            stat = lstatSync(current);
          }
          if (!stat.isDirectory() || stat.isSymbolicLink()
            || (current === canonicalDir && (stat.mode & 0o7777) !== DIR_MODE)) nativeFail();
          directories = [...directories!, { path: current, dev: stat.dev, ino: stat.ino }];
          checkDirectories();
        }
      }
      nativeLeaves();
      return true;
    }
    let current = callerBase;
    for (const part of parts) {
      current = join(current, part);
      let stat;
      try {
        stat = lstatSync(current);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT') {
          throw fatal('calibration:canonical-dir-lstat-failed', error);
        }
        try {
          mkdirSync(current, { mode: DIR_MODE });
        } catch (mkdirError) {
          throw fatal('calibration:canonical-dir-mkdir-failed', mkdirError);
        }
        continue;
      }
      if (stat.isSymbolicLink()) {
        throw new CalibrationFatalError('calibration:canonical-dir-symlink-rejected');
      }
      if (!stat.isDirectory()) {
        throw new CalibrationFatalError('calibration:canonical-dir-not-directory');
      }
    }
    try {
      chmodSync(canonicalDir, DIR_MODE);
    } catch (error) {
      throw fatal('calibration:canonical-dir-chmod-failed', error);
    }
    return true;
  }

  function containedPath(filename: string): string {
    ensureCanonicalChain();
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      throw new CalibrationFatalError('calibration:file-path-escape');
    }
    const joined = resolve(canonicalDir, filename);
    if (joined !== canonicalDir && !joined.startsWith(canonicalDir + sep)) {
      throw new CalibrationFatalError('calibration:file-path-escape');
    }
    return joined;
  }

  /**
   * Lstat the target without following symlinks. Missing files return
   * undefined; symlinks always throw. Callers decide whether missing or
   * non-regular types are fatal for their operation.
   */
  function lstatTarget(path: string, label: string) {
    let stat;
    try {
      stat = lstatSync(path);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return undefined;
      throw fatal(`calibration:${label}-lstat-failed`, error);
    }
    if (stat.isSymbolicLink()) {
      throw new CalibrationFatalError(`calibration:${label}-symlink-rejected`);
    }
    return stat;
  }

  function assertNotSymlink(path: string, label: string): void {
    lstatTarget(path, label);
  }

  function assertRegularFile(path: string, label: string): void {
    const stat = lstatTarget(path, label);
    if (stat === undefined) {
      throw new CalibrationFatalError(`calibration:${label}-missing`);
    }
    if (!stat.isFile()) {
      throw new CalibrationFatalError(`calibration:${label}-not-regular-file`);
    }
  }

  const fdWriteSync =
    overrides.fdWriteSync ??
    ((fd: number, buffer: Buffer, offset: number, length: number): number =>
      nodeWriteSync(fd, buffer, offset, length));
  const fdFsyncSync = overrides.fdFsyncSync ?? ((fd: number): void => nodeFsyncSync(fd));
  const fdCloseSync = overrides.fdCloseSync ?? ((fd: number): void => nodeCloseSync(fd));

  /**
   * Exclusive creation with a complete byte loop plus fsync while the
   * writable fd is still open, before close. Write and fsync failures use
   * separate seams so each can be fault-injected independently. Partial
   * outputs are unlinked; only fully written and fsynced files remain.
   */
  const defaultWriteExclusiveSync = (path: string, data: string): void => {
    if (nativeOwner !== undefined) { nativeWriteExclusive(path, data); return; }
    const buffer = Buffer.from(data, 'utf8');
    const fd = nodeOpenSync(path, 'wx', FILE_MODE);
    try {
      let offset = 0;
      while (offset < buffer.length) {
        let written: number;
        try {
          written = fdWriteSync(fd, buffer, offset, buffer.length - offset);
        } catch (error) {
          throw fatal('calibration:file-write-failed', error);
        }
        if (!Number.isInteger(written) || written <= 0) {
          throw new CalibrationFatalError('calibration:file-write-zero');
        }
        offset += Math.min(written, buffer.length - offset);
      }
      try {
        fdFsyncSync(fd);
      } catch (error) {
        throw fatal('calibration:file-fsync-failed', error);
      }
    } catch (error) {
      try {
        fdCloseSync(fd);
      } catch {
        // Close failure during cleanup must not mask the original error.
      }
      try {
        nodeUnlinkSync(path);
      } catch {
        // Best effort: orphan temp files are ignored by canonical readers.
      }
      throw fatal('calibration:file-write-failed', error);
    }
    try {
      fdCloseSync(fd);
    } catch (error) {
      try {
        nodeUnlinkSync(path);
      } catch {
        // Best effort orphan cleanup.
      }
      throw fatal('calibration:file-close-failed', error);
    }
    try {
      chmodSync(path, FILE_MODE);
    } catch {
      // Best effort: wx already applied FILE_MODE on creation.
    }
  };

  const defaultRenameSync = (from: string, to: string): void => {
    nodeRenameSync(from, to);
  };

  const defaultFsyncDirSync = (dir: string): void => {
    const fd = nativeOwner === undefined ? nodeOpenSync(dir, 'r')
      : nodeOpenSync(dir, nodeConstants.O_RDONLY | nodeConstants.O_DIRECTORY | nodeConstants.O_NOFOLLOW);
    try {
      nodeFsyncSync(fd);
    } finally {
      nodeCloseSync(fd);
    }
  };

  const writeExclusiveSync = overrides.writeExclusiveSync ?? defaultWriteExclusiveSync;
  // Legacy separate-open file-fsync hook: retained for compatibility but never
  // called internally; atomic durability comes from the writable-fd fsync and
  // final-file hooks are validation-only. Referencing it keeps the field live.
  const legacyFsyncFileSync = overrides.fsyncFileSync;
  void legacyFsyncFileSync;
  const renameSync = overrides.renameSync ?? defaultRenameSync;
  const fsyncDirSync = overrides.fsyncDirSync ?? defaultFsyncDirSync;
  // Archive-only seams: the JSON-array atomic path keeps using renameSync
  // above, and removeLock/temp cleanup keeps native unlink below. Only
  // archiveLock dispatches through these two seams.
  const archiveLinkSync = overrides.linkSync ?? nodeLinkSync;
  const archiveUnlinkSync = overrides.unlinkSync ?? nodeUnlinkSync;

  function readJsonArray(path: string, label: string): unknown[] {
    const present = ensureCanonicalChain();
    if (nativeOwner !== undefined) {
      if (!present) return [];
      const raw = nativeRead(path);
      if (raw === undefined) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) nativeFail();
      return parsed;
    }
    const stat = lstatTarget(path, `${label}-symlink`);
    if (stat === undefined) return [];
    if (!stat.isFile()) {
      throw new CalibrationFatalError(`calibration:${label}-not-regular-file`);
    }
    let raw: string;
    try {
      raw = nodeReadFileSync(path, 'utf8');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return [];
      throw fatal(`calibration:${label}-read-failed`, error);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch (error) {
      throw fatal(`calibration:${label}-parse-failed`, error);
    }
    if (!Array.isArray(parsed)) {
      throw new CalibrationFatalError(`calibration:${label}-not-array`);
    }
    return parsed;
  }

  function writeJsonArrayAtomic(finalPath: string, values: readonly unknown[], label: string): void {
    ensureCanonicalChain();
    if (nativeOwner !== undefined) {
      requireNativeOwner();
      if (pendingPublication !== undefined) nativeFail();
      const data = JSON.stringify(values);
      tempCounter += 1;
      const tempPath = `${finalPath}.tmp.${process.pid}.${tempCounter}.json`;
      let ownedTemp: Stats | undefined;
      try {
        defaultWriteExclusiveSync(tempPath, data);
        ownedTemp = lstatSync(tempPath);
        requireNativeOwner();
        renameSync(tempPath, finalPath);
        nativeReady();
        requireNativeOwner();
        const stat = lstatSync(finalPath);
        if (!privateFile(stat) || !sameInode(stat, ownedTemp)) nativeFail();
        pendingPublication = { path: finalPath, stat };
      } finally {
        if (ownedTemp !== undefined) cleanupNativeTemp(tempPath, ownedTemp);
      }
      return;
    }
    const existing = lstatTarget(finalPath, `${label}-symlink`);
    if (existing !== undefined && !existing.isFile()) {
      throw new CalibrationFatalError(`calibration:${label}-not-regular-file`);
    }
    const data = JSON.stringify(values);
    tempCounter += 1;
    const tempPath = `${finalPath}.tmp.${process.pid}.${tempCounter}.json`;
    try {
      writeExclusiveSync(tempPath, data);
    } catch (error) {
      throw fatal(`calibration:${label}-write-failed`, error);
    }
    try {
      renameSync(tempPath, finalPath);
    } catch (error) {
      try {
        nodeUnlinkSync(tempPath);
      } catch {
        // Orphan temp remains; canonical readers ignore it.
      }
      throw fatal(`calibration:${label}-rename-failed`, error);
    }
    try {
      chmodSync(finalPath, FILE_MODE);
    } catch {
      // Best effort; rename preserves the temp 0600 mode.
    }
  }

  /**
   * Validation-only final-file hook: confirms the canonical file exists, is
   * not a symlink, and is a regular file. Performs no fsync; durability was
   * established by the writable-fd fsync inside the atomic write.
   */
  function validateFinalFile(finalPath: string, label: string): void {
    ensureCanonicalChain();
    if (nativeOwner !== undefined) {
      if (pendingPublication === undefined || pendingPublication.path !== finalPath) nativeFail();
      nativeFinal();
      return;
    }
    assertRegularFile(finalPath, `${label}-symlink`);
  }

  function fsyncParentDir(label: string): void {
    ensureCanonicalChain();
    if (nativeOwner !== undefined) {
      const publication = pendingPublication;
      if (publication === undefined || publication.path !== resolve(canonicalDir, label === 'ledger' ? LEDGER_FILE : JOURNAL_FILE)) nativeFail();
      nativeFinal();
      fsyncDirSync(canonicalDir);
      nativeReady();
      nativeFinal();
      pendingPublication = undefined;
      return;
    }
    try {
      fsyncDirSync(canonicalDir);
    } catch (error) {
      throw fatal(`calibration:${label}-dir-fsync-failed`, error);
    }
  }

  function ledgerPath(): string {
    return containedPath(LEDGER_FILE);
  }

  function journalPath(): string {
    return containedPath(JOURNAL_FILE);
  }

  function lockPath(): string {
    return containedPath(LOCK_FILE);
  }

  function getRoot(): string {
    return CALIBRATION_ROOT;
  }

  function readLock(): CalibrationOwner | undefined {
    const present = ensureCanonicalChain();
    if (!present) return undefined;
    if (nativeOwner !== undefined) return nativeReadLock();
    const path = lockPath();
    const stat = lstatTarget(path, 'lock');
    if (stat === undefined) return undefined;
    if (!stat.isFile()) {
      throw new CalibrationFatalError('calibration:lock-not-regular-file');
    }
    let raw: string;
    try {
      raw = nodeReadFileSync(path, 'utf8');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return undefined;
      throw fatal('calibration:lock-read-failed', error);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch (error) {
      throw fatal('calibration:lock-parse-failed', error);
    }
    if (!isValidOwnerShape(parsed)) {
      throw new CalibrationFatalError('calibration:lock-malformed');
    }
    return parsed;
  }

  function writeLockExclusive(owner: CalibrationOwner): void {
    const requestedOwner = nativeOwner !== undefined && nonMutatingPreparationReads
      ? captureNativeOwner(owner) : undefined;
    if (requestedOwner !== undefined && !sameOwner(requestedOwner, nativeOwner!)) nativeFail();
    ensureCanonicalChain();
    if (nativeOwner !== undefined) {
      const captured = requestedOwner ?? captureNativeOwner(owner);
      if (!sameOwner(captured, nativeOwner)) nativeFail();
      const path = resolve(canonicalDir, LOCK_FILE);
      defaultWriteExclusiveSync(path, JSON.stringify(captured));
      requireNativeOwner();
      fsyncDirSync(canonicalDir);
      nativeReady();
      requireNativeOwner();
      return;
    }
    if (!isValidOwnerShape(owner)) {
      throw new CalibrationFatalError('calibration:lock-owner-invalid');
    }
    const path = lockPath();
    assertNotSymlink(path, 'lock');
    try {
      writeExclusiveSync(path, JSON.stringify(owner));
    } catch (error) {
      throw fatal('calibration:lock-write-failed', error);
    }
    try {
      fsyncDirSync(canonicalDir);
    } catch (error) {
      throw fatal('calibration:lock-dir-fsync-failed', error);
    }
  }

  function archiveLock(owner: CalibrationOwner): void {
    ensureCanonicalChain();
    if (nativeOwner !== undefined) establishNativeNamespace();
    const path = lockPath();
    // Validate the live lock is a regular non-symlink file owned by the
    // stale claimant, then capture its expected device/inode identity.
    const lockStat = lstatTarget(path, 'lock');
    if (lockStat === undefined || !lockStat.isFile()) {
      throw new CalibrationFatalError('calibration:lock-archive-not-regular-file');
    }
    const current = readLock();
    if (current === undefined || !sameOwner(current, owner)) {
      throw new CalibrationFatalError('calibration:lock-archive-foreign-owner');
    }
    const expectedDev = lockStat.dev;
    const expectedIno = lockStat.ino;
    const archiveName = `lock.archive.${owner.pid}.${owner.startTicks}.json`;
    const archivePath = containedPath(archiveName);
    // Atomically claim the sibling archive name with a hard link. An
    // existing file or symlink destination fails EEXIST here and must never
    // fall back to overwrite/rename; crash leftovers require operator action.
    try {
      archiveLinkSync(path, archivePath);
      if (nativeOwner !== undefined) { nativeReady(); archiveLinkActive = true; }
    } catch (error) {
      // The hook may already have linked the names. Preserve reached effects
      // and poison without invoking a foreign code getter or prototype trap.
      if (nativeOwner !== undefined) nativeFail();
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new CalibrationFatalError('calibration:lock-archive-destination-exists');
      }
      throw fatal('calibration:lock-archive-failed', error);
    }
    // Persist the new sibling name before removing the old lock name.
    try {
      fsyncDirSync(canonicalDir);
      if (nativeOwner !== undefined) { nativeReady(); nativeLeaves(); }
    } catch (error) {
      throw fatal('calibration:lock-archive-dir-fsync-failed', error);
    }
    // Re-verify both names still reference the same regular non-symlink
    // inode/device captured above, and the live lock still names the stale
    // owner (the owner check covers inode-reuse replacement). Any drift
    // fails closed before unlinking, preserving the replacement.
    const lockRecheck = lstatTarget(path, 'lock');
    const archiveRecheck = lstatTarget(archivePath, 'lock-archive');
    if (
      lockRecheck === undefined ||
      !lockRecheck.isFile() ||
      lockRecheck.dev !== expectedDev ||
      lockRecheck.ino !== expectedIno ||
      archiveRecheck === undefined ||
      !archiveRecheck.isFile() ||
      archiveRecheck.dev !== expectedDev ||
      archiveRecheck.ino !== expectedIno
    ) {
      throw new CalibrationFatalError('calibration:lock-archive-drift');
    }
    const reread = readLock();
    if (reread === undefined || !sameOwner(reread, owner)) {
      throw new CalibrationFatalError('calibration:lock-archive-drift');
    }
    // Archive-only unlink seam: removeLock/temp paths keep native unlink.
    try {
      archiveUnlinkSync(path);
      if (nativeOwner !== undefined) { nativeReady(); archiveLinkActive = false; }
    } catch (error) {
      throw fatal('calibration:lock-archive-unlink-failed', error);
    }
    try {
      fsyncDirSync(canonicalDir);
      if (nativeOwner !== undefined) { nativeReady(); nativeLeaves(); }
    } catch (error) {
      throw fatal('calibration:lock-archive-dir-fsync-failed', error);
    }
  }

  function removeLock(owner: CalibrationOwner): void {
    ensureCanonicalChain();
    if (nativeOwner !== undefined) {
      establishNativeNamespace();
      const captured = captureNativeOwner(owner);
      if (!sameOwner(captured, nativeOwner)) nativeFail();
      requireNativeOwner();
      nodeUnlinkSync(resolve(canonicalDir, LOCK_FILE));
      fsyncDirSync(canonicalDir);
      nativeReady();
      checkDirectories();
      if (lstatTarget(resolve(canonicalDir, LOCK_FILE), 'lock') !== undefined) nativeFail();
      lockIdentity = undefined;
      return;
    }
    const path = lockPath();
    assertNotSymlink(path, 'lock');
    const current = readLock();
    if (current === undefined || !sameOwner(current, owner)) {
      throw new CalibrationFatalError('calibration:lock-release-foreign-owner');
    }
    try {
      nodeUnlinkSync(path);
    } catch (error) {
      throw fatal('calibration:lock-remove-failed', error);
    }
    try {
      fsyncDirSync(canonicalDir);
    } catch (error) {
      throw fatal('calibration:lock-remove-dir-fsync-failed', error);
    }
  }

  function appendLedgerEvent(event: unknown): void {
    const path = ledgerPath();
    const current = readJsonArray(path, 'ledger');
    writeJsonArrayAtomic(path, [...current, event], 'ledger');
  }

  function fsyncLedgerFile(): void {
    validateFinalFile(ledgerPath(), 'ledger');
  }

  function fsyncLedgerDir(): void {
    fsyncParentDir('ledger');
  }

  function appendJournal(entry: JournalEntry): void {
    const validated = assertValidJournalEntry(entry as unknown);
    const path = journalPath();
    const current = readJsonArray(path, 'journal');
    writeJsonArrayAtomic(path, [...current, validated], 'journal');
  }

  function fsyncJournalFile(): void {
    validateFinalFile(journalPath(), 'journal');
  }

  function fsyncJournalDir(): void {
    fsyncParentDir('journal');
  }

  function probeOwnerLiveness(owner: CalibrationOwner): CalibrationLiveness {
    if (!Number.isInteger(owner.pid) || owner.pid <= 0) return 'unknown';
    if (!Number.isFinite(owner.startTicks) || owner.startTicks < 0) return 'unknown';
    let stat: string;
    try {
      stat = procStatReader(owner.pid);
    } catch (error) {
      if (nativeOwner !== undefined) {
        nativeReady();
        if ((typeof error !== 'object' || error === null) && typeof error !== 'function') return 'unknown';
        // Descriptor reflection can run a Proxy trap. Ports stay trusted;
        // no foreign property getter or prototype traversal is needed here.
        const descriptor = Object.getOwnPropertyDescriptor(error, 'code');
        nativeReady();
        return descriptor !== undefined && Object.hasOwn(descriptor, 'value') && descriptor.value === 'ENOENT'
          ? 'dead' : 'unknown';
      }
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return 'dead';
      return 'unknown';
    }
    if (nativeOwner !== undefined) {
      nativeReady();
      if (typeof stat !== 'string') return 'unknown';
      const close = stat.lastIndexOf(')');
      if (close === -1) return 'unknown';
      const raw = stat.slice(close + 1).trim().split(/\s+/)[19];
      if (raw === undefined || !/^[1-9]\d*$/.test(raw)) return 'unknown';
      const ticks = Number(raw);
      if (!Number.isSafeInteger(ticks)) return 'unknown';
      return ticks === owner.startTicks ? 'live' : 'dead';
    }
    const startTicks = parseProcStartTicks(stat);
    if (startTicks === undefined) return 'unknown';
    return startTicks === owner.startTicks ? 'live' : 'dead';
  }

  function readLedgerEvents(): readonly unknown[] {
    return readJsonArray(ledgerPath(), 'ledger');
  }

  function readJournalEntries(): readonly JournalEntry[] {
    const values = readJsonArray(journalPath(), 'journal');
    return values as JournalEntry[];
  }

  const deps: CalibrationLedgerDeps = {
    getRoot,
    readLock,
    writeLockExclusive,
    archiveLock,
    removeLock,
    appendLedgerEvent,
    fsyncLedgerFile,
    fsyncLedgerDir,
    appendJournal,
    fsyncJournalFile,
    fsyncJournalDir,
    probeOwnerLiveness,
    nowIso,
    readLedgerEvents,
    readJournalEntries,
  };
  if (nativeOwner === undefined) return deps;
  // One store implementation, opt-in guard only. The legacy returned object,
  // overrides and error behavior are left untouched.
  return Object.freeze(Object.fromEntries(Object.entries(deps).map(([name, method]) => [name, (...args: unknown[]) => {
    if (nativePoisoned || nativeBusy) nativeFail();
    nativeBusy = true;
    nativeReadOnlyTraversal = nonMutatingPreparationReads
      && (name === 'readJournalEntries' || name === 'readLedgerEvents' || name === 'readLock');
    try {
      const result: unknown = Reflect.apply(method, undefined, args);
      nativeReady();
      return result;
    } catch { return nativeFail(); }
    finally { nativeReadOnlyTraversal = false; nativeBusy = false; }
  }]))) as unknown as CalibrationLedgerDeps;
}
