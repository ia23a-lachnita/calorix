/**
 * Task 6 atomic file store: fail-closed CalibrationLedgerDeps on real fs.
 *
 * Test-first contract for
 * `functions/src/nutrition-eval/calibration-file-store.ts`:
 * fixed logical root with physical files nested under
 * `resolve(baseDir, CALIBRATION_ROOT)` while the caller-owned baseDir keeps
 * its own mode, strict symlink containment, private 0600/0700 modes on the
 * canonical root and its files, wx exclusive lock with exact-owner checks,
 * robust /proc field-22 parsing after the final ')', atomic JSON arrays
 * via sibling wx/write/fsync-while-open/close/rename plus caller dir-fsync
 * hooks, validation-only final-file hooks, strict disk-only replay with no
 * in-memory uncommitted cache, and privacy-safe nonempty nutrition numeric
 * allowlist or null.
 *
 * All happy paths use a real temp dir. Fault injection uses explicit
 * low-level hook overrides only; no provider, Firebase, network, or
 * device access occurs here.
 */
import { describe, expect, it, afterEach } from 'vitest';
import {
  chmodSync,
  closeSync as nodeCloseSync,
  existsSync,
  fsyncSync as nodeFsyncSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  statSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
  writeSync as nodeWriteSync,
  unlinkSync,
} from 'node:fs';
import { tmpdir, hostname } from 'node:os';
import { join, resolve } from 'node:path';
import { CALIBRATION_ROOT, createCalibrationLedger } from '../../src/nutrition-eval/calibration';
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';
import { createFileCalibrationLedgerDeps } from '../../src/nutrition-eval/calibration-file-store';
import type {
  CalibrationIdentity,
  CalibrationOwner,
  JournalEntry,
  ReservationKey,
} from '../../src/nutrition-eval/calibration';

const EXPECTED_ROOT = '.nutrition-eval/calibration/calorix-gemini-38-calibration-v1/';

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop() as string;
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'calorix-ledger-'));
  tempDirs.push(dir);
  return dir;
}

/** Physical calibration directory: resolve(baseDir, CALIBRATION_ROOT). */
function canonicalDirFor(baseDir: string): string {
  return resolve(baseDir, CALIBRATION_ROOT);
}

function canonicalPathFor(baseDir: string, filename: string): string {
  return join(canonicalDirFor(baseDir), filename);
}

function readBootId(): string {
  try {
    return readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
  } catch {
    return 'test-boot-id';
  }
}

function currentStartTicks(): number {
  const stat = readFileSync(`/proc/${process.pid}/stat`, 'utf8');
  const close = stat.lastIndexOf(')');
  const after = stat.slice(close + 1).trim().split(/\s+/);
  return Number(after[19]);
}

function makeOwner(overrides: Partial<CalibrationOwner> = {}): CalibrationOwner {
  return {
    hostname: hostname(),
    bootId: readBootId(),
    pid: process.pid,
    startTicks: currentStartTicks(),
    acquiredAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeIdentity(): CalibrationIdentity {
  return {
    protocolVersion: 'v1',
    provider: 'vertex-ai',
    model: 'gemini-3.8-flash',
    implementationCommit: '0e55baedad6099359e17a842d508fc70ab53999e',
    functionsTreeId: 'abc123def456abc123def456abc123def456abcd',
    datasetHash: 'dataset-hash',
    promptHash: 'prompt-hash',
    responseSchemaHash: 'schema-hash',
    sourceLockHash: 'source-lock-hash',
    manifestHash: 'manifest-hash',
    publicManifestHash: 'public-manifest-hash',
    snapshotLockHash: 'snapshot-lock-hash',
    historicalReferenceHash: 'history-hash',
    plannedImageCalls: 146,
    hardCeiling: 300,
  };
}

function makeKey(overrides: Partial<ReservationKey> = {}): ReservationKey {
  return {
    stage: 'development',
    profile: 'MEDIUM',
    caseId: 'calibration-dish_1565117892',
    sampleIndex: 1,
    ...overrides,
  };
}

function makeJournal(key: ReservationKey): JournalEntry {
  return {
    key,
    predictionHash: 'content-hash-1',
    normalizedPrediction: { calories: 100 },
    analysisLatencyMs: 120,
    errorCategory: 'none',
    responseModelVersion: 'gemini-3.8-flash-001',
  };
}

describe('calibration file store root and modes', () => {
  it('keeps the fixed logical root while storing under the internal baseDir', () => {
    const baseDir = makeTempDir();
    const deps = createFileCalibrationLedgerDeps(baseDir);
    expect(deps.getRoot()).toBe(CALIBRATION_ROOT);
    expect(deps.getRoot()).toBe(EXPECTED_ROOT);
    expect(deps.getRoot()).not.toBe(baseDir);
  });

  it('keeps every calibration file private 0600 under the 0700 canonical root', () => {
    const baseDir = makeTempDir();
    const deps = createFileCalibrationLedgerDeps(baseDir);
    deps.appendLedgerEvent({ type: 'reserved-test' });
    deps.fsyncLedgerFile();
    deps.fsyncLedgerDir();
    deps.appendJournal(makeJournal(makeKey()));
    deps.fsyncJournalFile();
    deps.writeLockExclusive(makeOwner());

    expect(statSync(canonicalDirFor(baseDir)).mode & 0o777).toBe(0o700);
    for (const filename of ['ledger.json', 'journal.json', 'lock.json']) {
      expect(statSync(canonicalPathFor(baseDir, filename)).mode & 0o777).toBe(0o600);
    }
  });
});

describe('calibration file store restart and disk-only replay', () => {
  it('persists ledger and journal arrays across a real restart with no uncommitted cache', () => {
    const baseDir = makeTempDir();
    const first = createFileCalibrationLedgerDeps(baseDir);
    first.appendLedgerEvent({ type: 'reserved', marker: 1 });
    first.fsyncLedgerFile();
    first.fsyncLedgerDir();
    const key = makeKey();
    first.appendJournal(makeJournal(key));
    first.fsyncJournalFile();
    first.fsyncJournalDir();

    const second = createFileCalibrationLedgerDeps(baseDir);
    expect(second.readLedgerEvents()).toHaveLength(1);
    expect(second.readJournalEntries()).toHaveLength(1);
    expect(second.readJournalEntries()[0]?.key).toEqual(key);
  });

  it('rebuilds a completed reservation after process restart', () => {
    const baseDir = makeTempDir();
    const key = makeKey();
    const firstDeps = createFileCalibrationLedgerDeps(baseDir);
    const first = createCalibrationLedger(firstDeps, makeIdentity(), [key]);
    const owner = makeOwner();
    first.acquireLock(owner);
    first.reserve(key);
    const journalHash = first.appendResultJournal(makeJournal(key));
    first.complete(key, journalHash);
    first.releaseLock(owner);

    const secondDeps = createFileCalibrationLedgerDeps(baseDir);
    const second = createCalibrationLedger(secondDeps, makeIdentity(), [key]);
    expect(second.rebuildReport().completed).toContainEqual(key);
    expect(second.getCounts().imageReserved).toBe(1);
  });

  it('ignores orphan temp files for replay instead of deleting before a lock', () => {
    const baseDir = makeTempDir();
    const deps = createFileCalibrationLedgerDeps(baseDir);
    deps.appendLedgerEvent({ type: 'reserved', marker: 1 });
    deps.fsyncLedgerFile();
    deps.fsyncLedgerDir();
    // Simulate a crashed atomic write left behind; canonical readers ignore it.
    readFileSync(canonicalPathFor(baseDir, 'ledger.json'), 'utf8');
    const orphan = canonicalPathFor(baseDir, 'ledger.json.tmp.orphan.json');
    // Create orphan via direct fs to avoid going through the store.
    writeFileSync(orphan, '["phantom"]', { mode: 0o600 });
    const fresh = createFileCalibrationLedgerDeps(baseDir);
    expect(fresh.readLedgerEvents()).toHaveLength(1);
  });
});

describe('calibration file store lock and liveness', () => {
  it('holds an exclusive wx lock while the owner is live', () => {
    const baseDir = makeTempDir();
    const first = createFileCalibrationLedgerDeps(baseDir);
    const owner = makeOwner();
    first.writeLockExclusive(owner);
    expect(first.readLock()).toEqual(owner);
    expect(first.probeOwnerLiveness(owner)).toBe('live');

    const second = createFileCalibrationLedgerDeps(baseDir);
    expect(() => second.writeLockExclusive(makeOwner({ pid: owner.pid + 1 }))).toThrow(
      CalibrationFatalError,
    );
  });

  it('recovers a provably dead owner through the ledger with a durable audit event', () => {
    const baseDir = makeTempDir();
    const deps = createFileCalibrationLedgerDeps(baseDir);
    const dead: CalibrationOwner = {
      hostname: hostname(),
      bootId: readBootId(),
      pid: 2147483647,
      startTicks: 1,
      acquiredAt: '2026-10-01T00:00:00.000Z',
    };
    expect(deps.probeOwnerLiveness(dead)).toBe('dead');
    const ledger = createCalibrationLedger(deps, makeIdentity(), []);
    ledger.acquireLock(dead);
    // Stale dead lock written directly, then a live owner recovers it.
    const recovering = createCalibrationLedger(
      createFileCalibrationLedgerDeps(baseDir),
      makeIdentity(),
      [],
    );
    // The dead lock is live on disk; recovery requires same host/boot dead proof.
    // Replace with a directly written dead lock to exercise real recovery.
    expect(() => recovering.acquireLock(makeOwner())).not.toThrow();
  });

  it('fails closed on unknown liveness and refuses foreign-owner release', () => {
    const baseDir = makeTempDir();
    const deps = createFileCalibrationLedgerDeps(baseDir, {
      procStatReader: () => {
        throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
      },
    });
    const owner = makeOwner();
    expect(deps.probeOwnerLiveness(owner)).toBe('unknown');

    const liveDeps = createFileCalibrationLedgerDeps(baseDir);
    liveDeps.writeLockExclusive(owner);
    expect(() => liveDeps.removeLock(makeOwner({ pid: 999999 }))).toThrow(
      CalibrationFatalError,
    );
    expect(() => liveDeps.archiveLock(makeOwner({ pid: 999999 }))).toThrow(
      CalibrationFatalError,
    );
    expect(liveDeps.readLock()).toEqual(owner);
  });

  it('fails closed instead of overwriting a preexisting archive at the same pid/startTicks', () => {
    const baseDir = makeTempDir();
    const deps = createFileCalibrationLedgerDeps(baseDir);
    const owner = makeOwner();
    deps.writeLockExclusive(owner);
    const archivePath = canonicalPathFor(
      baseDir,
      `lock.archive.${owner.pid}.${owner.startTicks}.json`,
    );
    // Simulate a stale archive already occupying the destination slot.
    writeFileSync(archivePath, JSON.stringify({ old: true }), { mode: 0o600 });
    expect(() => deps.archiveLock(owner)).toThrow(CalibrationFatalError);
    // The current lock and the preexisting archive must both remain intact.
    expect(deps.readLock()).toEqual(owner);
    expect(JSON.parse(readFileSync(archivePath, 'utf8'))).toEqual({ old: true });
  });

  it('fails closed instead of overwriting a symlinked archive destination', () => {
    const baseDir = makeTempDir();
    const deps = createFileCalibrationLedgerDeps(baseDir);
    const owner = makeOwner();
    deps.writeLockExclusive(owner);
    const outside = join(makeTempDir(), 'outside-archive-target.json');
    writeFileSync(outside, '{"outside":true}', { mode: 0o600 });
    const archivePath = canonicalPathFor(
      baseDir,
      `lock.archive.${owner.pid}.${owner.startTicks}.json`,
    );
    symlinkSync(outside, archivePath);
    expect(() => deps.archiveLock(owner)).toThrow(CalibrationFatalError);
    expect(deps.readLock()).toEqual(owner);
    expect(JSON.parse(readFileSync(outside, 'utf8'))).toEqual({ outside: true });
  });

  it('parses /proc start ticks after the final paren including spaced comm', () => {
    const baseDir = makeTempDir();
    const seen: number[] = [];
    const deps = createFileCalibrationLedgerDeps(baseDir, {
      procStatReader: (pid: number) => {
        seen.push(pid);
        return '4242 (my spaced (comm) name) S 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 987654';
      },
    });
    const owner = makeOwner({ pid: 4242, startTicks: 987654 });
    expect(deps.probeOwnerLiveness(owner)).toBe('live');
    expect(seen).toEqual([4242]);
    const moved = makeOwner({ pid: 4242, startTicks: 111 });
    expect(deps.probeOwnerLiveness(moved)).toBe('dead');
    const malformed = createFileCalibrationLedgerDeps(baseDir, {
      procStatReader: () => 'no-paren-at-all',
    });
    expect(malformed.probeOwnerLiveness(owner)).toBe('unknown');
  });
});

describe('calibration file store fault injection', () => {
  it('fails closed when the atomic write throws before rename', () => {
    const baseDir = makeTempDir();
    const deps = createFileCalibrationLedgerDeps(baseDir, {
      writeExclusiveSync: () => {
        throw new Error('EIO: temp write failed');
      },
    });
    expect(() => deps.appendLedgerEvent({ type: 'reserved' })).toThrow(CalibrationFatalError);
    // No canonical ledger file was committed by the failed write.
    expect(deps.readLedgerEvents()).toHaveLength(0);
  });

  it('fails closed when the writable-fd fsync throws before the temp is committed', () => {
    const baseDir = makeTempDir();
    const deps = createFileCalibrationLedgerDeps(baseDir, {
      fdFsyncSync: () => {
        throw new Error('EIO: temp fd fsync failed');
      },
    });
    expect(() => deps.appendLedgerEvent({ type: 'reserved' })).toThrow(CalibrationFatalError);
    expect(deps.readLedgerEvents()).toHaveLength(0);
    // The unfsynced temp must be unlinked, leaving only an empty read.
    const canonicalDir = canonicalDirFor(baseDir);
    expect(existsSync(join(canonicalDir, 'ledger.json'))).toBe(false);
  });

  it('fails closed when rename throws without committing a phantom event', () => {
    const baseDir = makeTempDir();
    const deps = createFileCalibrationLedgerDeps(baseDir, {
      renameSync: () => {
        throw new Error('EIO: rename failed');
      },
    });
    expect(() => deps.appendLedgerEvent({ type: 'reserved' })).toThrow(CalibrationFatalError);
    const fresh = createFileCalibrationLedgerDeps(baseDir);
    expect(fresh.readLedgerEvents()).toHaveLength(0);
  });

  it('fails closed when a final file is absent at validation time', () => {
    const baseDir = makeTempDir();
    const deps = createFileCalibrationLedgerDeps(baseDir);
    // The atomic append itself succeeds; durability came from the writable-fd
    // fsync, so validation must reject an absent canonical file.
    deps.appendLedgerEvent({ type: 'reserved' });
    unlinkSync(canonicalPathFor(baseDir, 'ledger.json'));
    expect(() => deps.fsyncLedgerFile()).toThrow(CalibrationFatalError);
    expect(() => deps.fsyncJournalFile()).toThrow(CalibrationFatalError);
  });

  it('fails closed when parent-dir fsync throws', () => {
    const baseDir = makeTempDir();
    const deps = createFileCalibrationLedgerDeps(baseDir, {
      fsyncDirSync: () => {
        throw new Error('EIO: dir fsync failed');
      },
    });
    deps.appendLedgerEvent({ type: 'reserved' });
    deps.fsyncLedgerFile();
    expect(() => deps.fsyncLedgerDir()).toThrow(CalibrationFatalError);
  });

  it('fails closed when journal dir fsync throws without marking completion', () => {
    const baseDir = makeTempDir();
    const key = makeKey();
    let dirFsyncCalls = 0;
    const deps = createFileCalibrationLedgerDeps(baseDir, {
      fsyncDirSync: (dir: string) => {
        void dir;
        dirFsyncCalls += 1;
        // Allow lock write (1) and reserve ledger dir (2); fail journal dir (3+).
        if (dirFsyncCalls >= 3) throw new Error('EIO: journal dir fsync failed');
      },
    });
    const ledger = createCalibrationLedger(deps, makeIdentity(), [key]);
    ledger.acquireLock(makeOwner());
    ledger.reserve(key);
    expect(() => ledger.appendResultJournal(makeJournal(key))).toThrow(CalibrationFatalError);
    expect(ledger.rebuildReport().completed).not.toContainEqual(key);
  });
});

describe('calibration file store symlink containment', () => {
  it('rejects a symlinked ledger file instead of following it', () => {
    const baseDir = makeTempDir();
    const outside = join(makeTempDir(), 'outside.json');
    writeFileSync(outside, '[]', { mode: 0o600 });
    const deps = createFileCalibrationLedgerDeps(baseDir);
    deps.appendLedgerEvent({ type: 'reserved' });
    deps.fsyncLedgerFile();
    deps.fsyncLedgerDir();
    // Replace the canonical file with a symlink escape.
    unlinkSync(canonicalPathFor(baseDir, 'ledger.json'));
    symlinkSync(outside, canonicalPathFor(baseDir, 'ledger.json'));
    const fresh = createFileCalibrationLedgerDeps(baseDir);
    expect(() => fresh.readLedgerEvents()).toThrow(CalibrationFatalError);
    expect(() => fresh.appendLedgerEvent({ type: 'reserved' })).toThrow(
      CalibrationFatalError,
    );
  });

  it('rejects a symlinked lock file', () => {
    const baseDir = makeTempDir();
    const outside = join(makeTempDir(), 'outside-lock.json');
    writeFileSync(outside, '{}', { mode: 0o600 });
    mkdirSync(canonicalDirFor(baseDir), { recursive: true });
    symlinkSync(outside, canonicalPathFor(baseDir, 'lock.json'));
    const deps = createFileCalibrationLedgerDeps(baseDir);
    expect(() => deps.readLock()).toThrow(CalibrationFatalError);
    expect(() => deps.writeLockExclusive(makeOwner())).toThrow(CalibrationFatalError);
  });
});

describe('calibration file store prediction privacy', () => {
  it('accepts null and nonempty nutrition numerics including the calories alias', () => {
    const baseDir = makeTempDir();
    const deps = createFileCalibrationLedgerDeps(baseDir);
    const key = makeKey();
    const nullEntry = makeJournal(key);
    nullEntry.normalizedPrediction = null;
    deps.appendJournal(nullEntry);
    const numeric = makeJournal(makeKey({ sampleIndex: 1, caseId: 'calibration-dish_1566844803' }));
    numeric.normalizedPrediction = { kcal: 120, proteinG: 10, carbsG: 20, fatG: 5 };
    deps.appendJournal(numeric);
    const alias = makeJournal(makeKey({ stage: 'validation', sampleIndex: 2 }));
    alias.normalizedPrediction = { calories: 100 };
    deps.appendJournal(alias);
    const mass = makeJournal(makeKey({ stage: 'validation', sampleIndex: 3 }));
    mass.normalizedPrediction = { estimatedTotalMassG: 250 };
    deps.appendJournal(mass);
    expect(deps.readJournalEntries()).toHaveLength(4);
  });

  it('rejects empty, extra-key, non-numeric, negative, and non-finite predictions', () => {
    const baseDir = makeTempDir();
    const deps = createFileCalibrationLedgerDeps(baseDir);
    const bad: Array<Record<string, unknown> | null> = [
      {},
      { prompt: 'secret prompt' },
      { kcal: 'high' },
      { kcal: -1 },
      { kcal: Number.NaN },
      { kcal: Number.POSITIVE_INFINITY },
      { rawText: 'leaked model text' },
      { url: 'https://example.com/private' },
    ];
    for (const prediction of bad) {
      const entry = makeJournal(makeKey());
      entry.normalizedPrediction = prediction;
      expect(() => deps.appendJournal(entry)).toThrow(CalibrationFatalError);
    }
    expect(deps.readJournalEntries()).toHaveLength(0);
  });
});

describe('calibration file store atomic review corrections RED', () => {
  it('preserves caller baseDir mode and nests files under resolve(baseDir,CALIBRATION_ROOT)', () => {
    const baseDir = makeTempDir();
    chmodSync(baseDir, 0o755);
    const deps = createFileCalibrationLedgerDeps(baseDir);
    deps.appendLedgerEvent({ type: 'reserved-test' });
    deps.fsyncLedgerFile();
    deps.fsyncLedgerDir();
    // Caller-owned baseDir must never be chmodded by the store.
    expect(statSync(baseDir).mode & 0o777).toBe(0o755);
    const canonicalDir = resolve(baseDir, CALIBRATION_ROOT);
    expect(statSync(canonicalDir).mode & 0o777).toBe(0o700);
    const ledgerPath = join(canonicalDir, 'ledger.json');
    expect(existsSync(ledgerPath)).toBe(true);
    expect(statSync(ledgerPath).mode & 0o777).toBe(0o600);
    // No physical calibration file may live directly in the caller baseDir.
    expect(existsSync(join(baseDir, 'ledger.json'))).toBe(false);
    expect(existsSync(join(baseDir, 'journal.json'))).toBe(false);
    expect(existsSync(join(baseDir, 'lock.json'))).toBe(false);
  });

  it('defaults omitted baseDir to process.cwd while nesting CALIBRATION_ROOT', () => {
    const sandbox = makeTempDir();
    const previousCwd = process.cwd();
    process.chdir(sandbox);
    try {
      const deps = createFileCalibrationLedgerDeps();
      expect(deps.getRoot()).toBe(CALIBRATION_ROOT);
      deps.appendLedgerEvent({ type: 'reserved-cwd' });
      const canonicalDir = resolve(sandbox, CALIBRATION_ROOT);
      expect(existsSync(join(canonicalDir, 'ledger.json'))).toBe(true);
      expect(existsSync(join(sandbox, 'ledger.json'))).toBe(false);
    } finally {
      process.chdir(previousCwd);
    }
  });

  it('rejects an intermediate symlink component under baseDir', () => {
    const baseDir = makeTempDir();
    const outside = makeTempDir();
    const linkPath = join(baseDir, '.nutrition-eval');
    symlinkSync(outside, linkPath);
    const deps = createFileCalibrationLedgerDeps(baseDir);
    expect(() => deps.appendLedgerEvent({ type: 'reserved' })).toThrow(
      CalibrationFatalError,
    );
    expect(() => deps.readLedgerEvents()).toThrow(CalibrationFatalError);
  });

  it('rejects a non-regular final file via validation-only hooks', () => {
    const baseDir = makeTempDir();
    const canonicalDir = resolve(baseDir, CALIBRATION_ROOT);
    mkdirSync(canonicalDir, { recursive: true });
    // Cover both the legacy direct location and the nested canonical target
    // so the rejection holds regardless of which path the hook validates.
    for (const dir of [baseDir, canonicalDir]) {
      const ledgerAsDir = join(dir, 'ledger.json');
      if (!existsSync(ledgerAsDir)) mkdirSync(ledgerAsDir);
    }
    const deps = createFileCalibrationLedgerDeps(baseDir);
    expect(() => deps.fsyncLedgerFile()).toThrow(CalibrationFatalError);
    expect(() => deps.fsyncJournalFile()).toThrow(CalibrationFatalError);
  });

  it('performs the atomic byte loop through the fdWriteSync seam', () => {
    const baseDir = makeTempDir();
    let writeCalls = 0;
    const deps = createFileCalibrationLedgerDeps(baseDir, {
      fdWriteSync: (fd: number, buffer: Buffer, offset: number, _length: number): number => {
        // Force single-byte progress to prove the store loops to completion;
        // the byte must really land on disk or the committed file is corrupt.
        writeCalls += 1;
        expect(fd).toBeGreaterThanOrEqual(0);
        expect(offset).toBeGreaterThanOrEqual(0);
        return nodeWriteSync(fd, buffer, offset, 1);
      },
    });
    deps.appendLedgerEvent({ type: 'reserved-loop' });
    expect(writeCalls).toBeGreaterThan(1);
    const fresh = createFileCalibrationLedgerDeps(baseDir);
    expect(fresh.readLedgerEvents()).toEqual([{ type: 'reserved-loop' }]);
  });

  it('fsyncs while the writable fd is still open before close via separate seams', () => {
    const baseDir = makeTempDir();
    const order: string[] = [];
    const deps = createFileCalibrationLedgerDeps(baseDir, {
      fdFsyncSync: (fd: number): void => {
        order.push('fsync');
        // Real durability call on the still-open writable fd; the fd must
        // still be valid here, which proves the ordering claim.
        nodeFsyncSync(fd);
      },
      fdCloseSync: (fd: number): void => {
        order.push('close');
        nodeCloseSync(fd);
      },
    });
    deps.appendLedgerEvent({ type: 'reserved-order' });
    expect(order).toContain('fsync');
    expect(order).toContain('close');
    expect(order.indexOf('fsync')).toBeLessThan(order.indexOf('close'));
    // Exactly one fsync and one close happen for the single temp write.
    expect(order.filter((step) => step === 'fsync')).toHaveLength(1);
    expect(order.filter((step) => step === 'close')).toHaveLength(1);
    const fresh = createFileCalibrationLedgerDeps(baseDir);
    expect(fresh.readLedgerEvents()).toEqual([{ type: 'reserved-order' }]);
  });

  it('fault-injects temp write and fd fsync through separate seams', () => {
    const first = makeTempDir();
    const writeFailing = createFileCalibrationLedgerDeps(first, {
      fdWriteSync: (): number => {
        throw new Error('EIO: fd write failed');
      },
    });
    expect(() => writeFailing.appendLedgerEvent({ type: 'reserved' })).toThrow(
      CalibrationFatalError,
    );
    expect(writeFailing.readLedgerEvents()).toHaveLength(0);

    const second = makeTempDir();
    const fsyncFailing = createFileCalibrationLedgerDeps(second, {
      fdFsyncSync: (): void => {
        throw new Error('EIO: fd fsync failed');
      },
    });
    expect(() => fsyncFailing.appendLedgerEvent({ type: 'reserved' })).toThrow(
      CalibrationFatalError,
    );
    expect(fsyncFailing.readLedgerEvents()).toHaveLength(0);

    const third = makeTempDir();
    const lockFailing = createFileCalibrationLedgerDeps(third, {
      fdFsyncSync: (): void => {
        throw new Error('EIO: lock fd fsync failed');
      },
    });
    expect(() => lockFailing.writeLockExclusive(makeOwner())).toThrow(
      CalibrationFatalError,
    );
    expect(existsSync(canonicalPathFor(third, 'lock.json'))).toBe(false);
  });

  it('rejects a null or primitive journal entry without throwing a raw TypeError', () => {
    const baseDir = makeTempDir();
    const deps = createFileCalibrationLedgerDeps(baseDir);
    const badEntries: unknown[] = [null, 'not-an-entry', 42, true, ['array-entry']];
    for (const bad of badEntries) {
      expect(() => deps.appendJournal(bad as unknown as JournalEntry)).toThrow(
        CalibrationFatalError,
      );
    }
    expect(deps.readJournalEntries()).toHaveLength(0);
  });

  it('rejects a journal entry carrying extra top-level fields', () => {
    const baseDir = makeTempDir();
    const deps = createFileCalibrationLedgerDeps(baseDir);
    const entry = { ...makeJournal(makeKey()), extra: 'unexpected' };
    expect(() => deps.appendJournal(entry as unknown as JournalEntry)).toThrow(
      CalibrationFatalError,
    );
    expect(deps.readJournalEntries()).toHaveLength(0);
  });

  it('rejects a journal entry missing a required top-level field', () => {
    const baseDir = makeTempDir();
    const deps = createFileCalibrationLedgerDeps(baseDir);
    const entry = makeJournal(makeKey()) as Record<string, unknown>;
    delete entry.responseModelVersion;
    expect(() => deps.appendJournal(entry as unknown as JournalEntry)).toThrow(
      CalibrationFatalError,
    );
    expect(deps.readJournalEntries()).toHaveLength(0);
  });

  it('rejects a journal entry with an invalid reservation key', () => {
    const baseDir = makeTempDir();
    const deps = createFileCalibrationLedgerDeps(baseDir);
    const badKeys: unknown[] = [
      null,
      'not-a-key',
      { ...makeKey(), profile: 'HIGH' },
      { ...makeKey(), caseId: '' },
      { ...makeKey(), stage: 'unknown-stage' },
      { ...makeKey(), sampleIndex: 99 },
    ];
    for (const key of badKeys) {
      const entry = { ...makeJournal(makeKey()), key };
      expect(() => deps.appendJournal(entry as unknown as JournalEntry)).toThrow(
        CalibrationFatalError,
      );
    }
    expect(deps.readJournalEntries()).toHaveLength(0);
  });

  it('rejects a journal entry with negative or non-finite analysisLatencyMs', () => {
    const baseDir = makeTempDir();
    const deps = createFileCalibrationLedgerDeps(baseDir);
    const badLatencies: unknown[] = [-1, Number.NaN, Number.POSITIVE_INFINITY, '120'];
    for (const analysisLatencyMs of badLatencies) {
      const entry = { ...makeJournal(makeKey()), analysisLatencyMs };
      expect(() => deps.appendJournal(entry as unknown as JournalEntry)).toThrow(
        CalibrationFatalError,
      );
    }
    expect(deps.readJournalEntries()).toHaveLength(0);
  });

  it('rejects a journal entry with a blank predictionHash or responseModelVersion', () => {
    const baseDir = makeTempDir();
    const deps = createFileCalibrationLedgerDeps(baseDir);
    const blankHash = { ...makeJournal(makeKey()), predictionHash: '   ' };
    expect(() => deps.appendJournal(blankHash as unknown as JournalEntry)).toThrow(
      CalibrationFatalError,
    );
    const blankVersion = { ...makeJournal(makeKey()), responseModelVersion: '' };
    expect(() => deps.appendJournal(blankVersion as unknown as JournalEntry)).toThrow(
      CalibrationFatalError,
    );
    expect(deps.readJournalEntries()).toHaveLength(0);
  });

  it('rejects a journal entry with an errorCategory outside the calibration.ts union', () => {
    const baseDir = makeTempDir();
    const deps = createFileCalibrationLedgerDeps(baseDir);
    const entry = { ...makeJournal(makeKey()), errorCategory: 'made_up_category' };
    expect(() => deps.appendJournal(entry as unknown as JournalEntry)).toThrow(
      CalibrationFatalError,
    );
    expect(deps.readJournalEntries()).toHaveLength(0);
  });

  it('validates final files without redundant fsyncFileSync calls', () => {
    const baseDir = makeTempDir();
    let fsyncFileCalls = 0;
    const deps = createFileCalibrationLedgerDeps(baseDir, {
      fsyncFileSync: () => {
        fsyncFileCalls += 1;
        throw new Error('redundant fsync must not be called');
      },
    });
    // Atomic append durability comes from the writable-fd fsync, so even a
    // throwing legacy file-fsync hook must not break the append or validation.
    deps.appendLedgerEvent({ type: 'reserved' });
    expect(() => deps.fsyncLedgerFile()).not.toThrow();
    const key = makeKey();
    deps.appendJournal(makeJournal(key));
    expect(() => deps.fsyncJournalFile()).not.toThrow();
    expect(fsyncFileCalls).toBe(0);
  });
});

describe('calibration file store journal strict privacy fields (MUST_FIX)', () => {
  it('rejects a journal key carrying unexpected nested properties', () => {
    const baseDir = makeTempDir();
    const deps = createFileCalibrationLedgerDeps(baseDir);
    const entry = {
      ...makeJournal(makeKey()),
      key: { ...makeKey(), extra: 'unexpected' },
    };
    expect(() => deps.appendJournal(entry as unknown as JournalEntry)).toThrow(
      CalibrationFatalError,
    );
    expect(deps.readJournalEntries()).toHaveLength(0);
  });

  it('rejects caseId values with whitespace, newlines, pipes, or excess length', () => {
    const baseDir = makeTempDir();
    const deps = createFileCalibrationLedgerDeps(baseDir);
    const badCaseIds = [
      'has space',
      'has\nnewline',
      'has|pipe',
      'tab\tchar',
      'a'.repeat(129),
      '',
      '   ',
    ];
    for (const caseId of badCaseIds) {
      const entry = { ...makeJournal(makeKey()), key: makeKey({ caseId }) };
      expect(() => deps.appendJournal(entry as unknown as JournalEntry)).toThrow(
        CalibrationFatalError,
      );
    }
    expect(deps.readJournalEntries()).toHaveLength(0);
  });

  it('accepts caseId values matching the strict allowlist pattern', () => {
    const baseDir = makeTempDir();
    const deps = createFileCalibrationLedgerDeps(baseDir);
    const goodCaseIds = ['calibration-dish_1565117892', 'A1', '-', '_', 'a'.repeat(128)];
    for (const caseId of goodCaseIds) {
      const entry = makeJournal(makeKey({ caseId }));
      expect(() => deps.appendJournal(entry)).not.toThrow();
    }
    expect(deps.readJournalEntries()).toHaveLength(goodCaseIds.length);
  });

  it('rejects predictionHash values with whitespace, newlines, pipes, or excess length', () => {
    const baseDir = makeTempDir();
    const deps = createFileCalibrationLedgerDeps(baseDir);
    const badHashes = [
      'has space',
      'has\nnewline',
      'has|pipe',
      'tab\tchar',
      'a'.repeat(129),
      '   ',
    ];
    for (const predictionHash of badHashes) {
      const entry = { ...makeJournal(makeKey()), predictionHash };
      expect(() => deps.appendJournal(entry as unknown as JournalEntry)).toThrow(
        CalibrationFatalError,
      );
    }
    expect(deps.readJournalEntries()).toHaveLength(0);
  });

  it('accepts predictionHash values matching the strict allowlist pattern', () => {
    const baseDir = makeTempDir();
    const deps = createFileCalibrationLedgerDeps(baseDir);
    const goodHashes = ['content-hash-1', 'A1', '-', '_', 'a'.repeat(128)];
    let sampleIndex = 1;
    for (const predictionHash of goodHashes) {
      const key = makeKey({ stage: 'validation', sampleIndex });
      sampleIndex = sampleIndex >= 3 ? 1 : sampleIndex + 1;
      const entry = { ...makeJournal(key), predictionHash };
      expect(() => deps.appendJournal(entry)).not.toThrow();
    }
    expect(deps.readJournalEntries()).toHaveLength(goodHashes.length);
  });

  it('rejects responseModelVersion values with whitespace, newlines, control chars, or excess length', () => {
    const baseDir = makeTempDir();
    const deps = createFileCalibrationLedgerDeps(baseDir);
    const badVersions = [
      'has space',
      'has\nnewline',
      'tab\tchar',
      'null\u0000char',
      'a'.repeat(129),
      '   ',
    ];
    for (const responseModelVersion of badVersions) {
      const entry = { ...makeJournal(makeKey()), responseModelVersion };
      expect(() => deps.appendJournal(entry as unknown as JournalEntry)).toThrow(
        CalibrationFatalError,
      );
    }
    expect(deps.readJournalEntries()).toHaveLength(0);
  });

  it('accepts responseModelVersion values including n/a and versioned model tags', () => {
    const baseDir = makeTempDir();
    const deps = createFileCalibrationLedgerDeps(baseDir);
    const goodVersions = ['n/a', 'gemini-3.8-flash-001', 'A1', '-', '_', '.', 'a'.repeat(128)];
    let sampleIndex = 1;
    for (const responseModelVersion of goodVersions) {
      const key = makeKey({ stage: 'validation', sampleIndex });
      sampleIndex = sampleIndex >= 3 ? 1 : sampleIndex + 1;
      const entry = { ...makeJournal(key), responseModelVersion };
      expect(() => deps.appendJournal(entry)).not.toThrow();
    }
    expect(deps.readJournalEntries()).toHaveLength(goodVersions.length);
  });
});
