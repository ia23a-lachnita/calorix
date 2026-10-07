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
  closeSync as nodeCloseSync,
  chmodSync,
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
import { join, relative, resolve, sep } from 'node:path';
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
  const callerBase = resolve(baseDir ?? process.cwd());
  const canonicalDir = resolve(callerBase, CALIBRATION_ROOT);

  const procStatReader =
    overrides.procStatReader ??
    ((pid: number): string => nodeReadFileSync(`/proc/${pid}/stat`, 'utf8'));
  const nowIso = overrides.nowIso ?? ((): string => new Date().toISOString());

  function fatal(message: string, cause: unknown): CalibrationFatalError {
    if (cause instanceof CalibrationFatalError) return cause;
    return new CalibrationFatalError(message, { cause });
  }

  /**
   * Validate the caller base exists as a real directory without mutating it.
   * The caller-owned baseDir is never chmodded, even when it carries 0755.
   */
  function ensureCallerBase(): void {
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
  function ensureCanonicalChain(): void {
    ensureCallerBase();
    const rel = relative(callerBase, canonicalDir);
    if (rel === '') {
      throw new CalibrationFatalError('calibration:canonical-root-escape');
    }
    if (rel.startsWith('..') || rel.split(sep).includes('..')) {
      throw new CalibrationFatalError('calibration:canonical-root-escape');
    }
    const parts = rel.split(sep).filter((part) => part.length > 0);
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
    const fd = nodeOpenSync(dir, 'r');
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
    ensureCanonicalChain();
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
    assertRegularFile(finalPath, `${label}-symlink`);
  }

  function fsyncParentDir(label: string): void {
    ensureCanonicalChain();
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
    ensureCanonicalChain();
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
    ensureCanonicalChain();
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
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new CalibrationFatalError('calibration:lock-archive-destination-exists');
      }
      throw fatal('calibration:lock-archive-failed', error);
    }
    // Persist the new sibling name before removing the old lock name.
    try {
      fsyncDirSync(canonicalDir);
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
    } catch (error) {
      throw fatal('calibration:lock-archive-unlink-failed', error);
    }
    try {
      fsyncDirSync(canonicalDir);
    } catch (error) {
      throw fatal('calibration:lock-archive-dir-fsync-failed', error);
    }
  }

  function removeLock(owner: CalibrationOwner): void {
    ensureCanonicalChain();
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
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return 'dead';
      return 'unknown';
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

  return {
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
}
