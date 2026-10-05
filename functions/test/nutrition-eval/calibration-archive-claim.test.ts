/**
 * Task 1 RED: atomic stale archive claim via link (not rename).
 *
 * Desired fix (not yet applied): validate canonical chain, regular
 * non-symlink lock and matching stale owner, capture expected dev/ino, then
 * atomically `linkSync(lock, archive)` to the existing sibling
 * `lock.archive.<pid>.<ticks>.json` name. EEXIST maps to static
 * `calibration:lock-archive-destination-exists` with no overwrite/rename
 * fallback. Fsync directory before unlink, re-verify archive/current lock
 * remain regular with expected inode/device and stale owner, then unlink old
 * lock and fsync directory again. Archive-specific `linkSync`/`unlinkSync`
 * seams must not affect JSON-array rename or removeLock paths.
 *
 * Current source archives with `renameSync`, ignoring the proposed
 * link/unlink seams. Every interleaving/order/fault test below therefore
 * REDs (hook never runs, rename fallback used, single fsync, replacement
 * clobbered) while preexisting-file/symlink guards stay GREEN.
 *
 * Real temp dirs only; no provider/Firebase/network access.
 */
import { describe, expect, it, afterEach } from 'vitest';
import {
  existsSync,
  linkSync as nodeLinkSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync as nodeUnlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { CALIBRATION_ROOT, createCalibrationLedger } from '../../src/nutrition-eval/calibration';
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';
import { createFileCalibrationLedgerDeps } from '../../src/nutrition-eval/calibration-file-store';
import type { CalibrationFileStoreOverrides } from '../../src/nutrition-eval/calibration-file-store';
import type {
  CalibrationIdentity,
  CalibrationOwner,
} from '../../src/nutrition-eval/calibration';

/** Proposed archive seams, absent from source until the fix lands. */
interface ArchiveSeams {
  linkSync?: (from: string, to: string) => void;
  unlinkSync?: (path: string) => void;
}

type ArchiveOverrides = CalibrationFileStoreOverrides & ArchiveSeams;

function depsFor(baseDir: string, overrides: ArchiveOverrides = {}) {
  // Cast ONLY at this seam while the typed seams are absent from source.
  return createFileCalibrationLedgerDeps(
    baseDir,
    overrides as unknown as CalibrationFileStoreOverrides,
  );
}

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop() as string;
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'calorix-archive-'));
  tempDirs.push(dir);
  return dir;
}

function canonicalDirFor(baseDir: string): string {
  return resolve(baseDir, CALIBRATION_ROOT);
}

function lockPathFor(baseDir: string): string {
  return join(canonicalDirFor(baseDir), 'lock.json');
}

function archivePathFor(baseDir: string, owner: CalibrationOwner): string {
  return join(canonicalDirFor(baseDir), `lock.archive.${owner.pid}.${owner.startTicks}.json`);
}

function makeOwner(overrides: Partial<CalibrationOwner> = {}): CalibrationOwner {
  return {
    hostname: 'test-host',
    bootId: 'test-boot-123',
    pid: 1111,
    startTicks: 2222,
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

function readLockBytes(baseDir: string): string {
  return readFileSync(lockPathFor(baseDir), 'utf8');
}

describe('calibration archive claim uses atomic link, not rename', () => {
  it('delayed contender interleaving fails EEXIST and preserves winner lock plus old archive', () => {
    const baseDir = makeTempDir();
    const stale = makeOwner({ pid: 1111, startTicks: 2222 });
    const winnerOwner = makeOwner({ pid: 2222, startTicks: 3333 });
    const setup = depsFor(baseDir);
    setup.writeLockExclusive(stale);
    const staleBytes = readLockBytes(baseDir);
    const archivePath = archivePathFor(baseDir, stale);

    let linkCalls = 0;
    const winnerDeps = depsFor(baseDir);
    const loserDeps = depsFor(baseDir, {
      linkSync: (from: string, to: string): void => {
        linkCalls += 1;
        // Winner archives the stale lock and writes its fresh wx lock during
        // the loser's link hook, so native link must then fail EEXIST.
        winnerDeps.archiveLock(stale);
        winnerDeps.writeLockExclusive(winnerOwner);
        nodeLinkSync(from, to);
      },
    });

    let caught: unknown;
    try {
      loserDeps.archiveLock(stale);
    } catch (error) {
      caught = error;
    }
    // Hook must have run; otherwise a rename-based implementation false-passes
    // by never invoking the link seam.
    expect(linkCalls).toBeGreaterThan(0);
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect((caught as CalibrationFatalError).message).toContain(
      'calibration:lock-archive-destination-exists',
    );
    // Winner lock remains by inode/bytes; old archive preserved by bytes.
    expect(readLockBytes(baseDir)).toBe(JSON.stringify(winnerOwner));
    expect(lstatSync(lockPathFor(baseDir)).isFile()).toBe(true);
    expect(readFileSync(archivePath, 'utf8')).toBe(staleBytes);
    expect(lstatSync(archivePath).isFile()).toBe(true);
  });

  it('substituted source inode before link leaves the replacement lock intact', () => {
    const baseDir = makeTempDir();
    const stale = makeOwner({ pid: 1111, startTicks: 2222 });
    const replacement = makeOwner({ pid: 9999, startTicks: 8888 });
    const setup = depsFor(baseDir);
    setup.writeLockExclusive(stale);

    let linkCalls = 0;
    const deps = depsFor(baseDir, {
      linkSync: (from: string, to: string): void => {
        linkCalls += 1;
        // Swap the stale lock for a different owner inode before native link.
        nodeUnlinkSync(lockPathFor(baseDir));
        writeFileSync(lockPathFor(baseDir), JSON.stringify(replacement), { mode: 0o600 });
        nodeLinkSync(from, to);
      },
    });

    let caught: unknown;
    try {
      deps.archiveLock(stale);
    } catch (error) {
      caught = error;
    }
    expect(linkCalls).toBeGreaterThan(0);
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    // Replacement must remain; the stale archive attempt must not unlink it.
    const fresh = depsFor(baseDir);
    expect(fresh.readLock()).toEqual(replacement);
    expect(readLockBytes(baseDir)).toBe(JSON.stringify(replacement));
  });

  it('performs exact link, fsync, unlink, fsync order with no rename fallback', () => {
    const baseDir = makeTempDir();
    const stale = makeOwner({ pid: 1111, startTicks: 2222 });
    const setup = depsFor(baseDir);
    setup.writeLockExclusive(stale);

    const order: string[] = [];
    let linkCalls = 0;
    let unlinkCalls = 0;
    let renameCalls = 0;
    const deps = depsFor(baseDir, {
      linkSync: (from: string, to: string): void => {
        linkCalls += 1;
        order.push('link');
        nodeLinkSync(from, to);
      },
      unlinkSync: (path: string): void => {
        unlinkCalls += 1;
        order.push('unlink');
        nodeUnlinkSync(path);
      },
      renameSync: (from: string, to: string): void => {
        renameCalls += 1;
        order.push('rename');
        void from;
        void to;
        throw new Error('rename fallback must not be used for archive');
      },
      fsyncDirSync: (): void => {
        order.push('fsyncDir');
      },
    });
    // Construction writes above are cleared; only archive ops are recorded.
    order.length = 0;

    deps.archiveLock(stale);
    expect(linkCalls).toBe(1);
    expect(unlinkCalls).toBe(1);
    expect(renameCalls).toBe(0);
    expect(order).toEqual(['link', 'fsyncDir', 'unlink', 'fsyncDir']);
    expect(existsSync(lockPathFor(baseDir))).toBe(false);
    expect(existsSync(archivePathFor(baseDir, stale))).toBe(true);
  });

  it('directory fsync fault before unlink leaves archive plus lock', () => {
    const baseDir = makeTempDir();
    const stale = makeOwner({ pid: 1111, startTicks: 2222 });
    depsFor(baseDir).writeLockExclusive(stale);
    const staleBytes = readLockBytes(baseDir);
    const staleStat = lstatSync(lockPathFor(baseDir));

    let linkCalls = 0;
    let fsyncCalls = 0;
    const deps = depsFor(baseDir, {
      linkSync: (from: string, to: string): void => {
        linkCalls += 1;
        nodeLinkSync(from, to);
      },
      fsyncDirSync: (): void => {
        fsyncCalls += 1;
        if (fsyncCalls === 1) throw new Error('EIO: link dir fsync failed');
      },
    });

    expect(() => deps.archiveLock(stale)).toThrow(CalibrationFatalError);
    expect(linkCalls).toBe(1);
    // Both hard-linked names remain with identical inode/bytes.
    expect(readLockBytes(baseDir)).toBe(staleBytes);
    expect(readFileSync(archivePathFor(baseDir, stale), 'utf8')).toBe(staleBytes);
    expect(lstatSync(lockPathFor(baseDir)).ino).toBe(staleStat.ino);
    expect(lstatSync(archivePathFor(baseDir, stale)).ino).toBe(staleStat.ino);
  });

  it('unlink failure retains archive plus lock evidence', () => {
    const baseDir = makeTempDir();
    const stale = makeOwner({ pid: 1111, startTicks: 2222 });
    depsFor(baseDir).writeLockExclusive(stale);
    const staleBytes = readLockBytes(baseDir);

    let linkCalls = 0;
    const deps = depsFor(baseDir, {
      linkSync: (from: string, to: string): void => {
        linkCalls += 1;
        nodeLinkSync(from, to);
      },
      unlinkSync: (): void => {
        throw new Error('EIO: unlink failed');
      },
    });

    expect(() => deps.archiveLock(stale)).toThrow(CalibrationFatalError);
    expect(linkCalls).toBe(1);
    expect(readLockBytes(baseDir)).toBe(staleBytes);
    expect(readFileSync(archivePathFor(baseDir, stale), 'utf8')).toBe(staleBytes);
  });

  it('second directory fsync failure retains the archive and reports fatal', () => {
    const baseDir = makeTempDir();
    const stale = makeOwner({ pid: 1111, startTicks: 2222 });
    depsFor(baseDir).writeLockExclusive(stale);

    let linkCalls = 0;
    let unlinkCalls = 0;
    let fsyncCalls = 0;
    const deps = depsFor(baseDir, {
      linkSync: (from: string, to: string): void => {
        linkCalls += 1;
        nodeLinkSync(from, to);
      },
      unlinkSync: (path: string): void => {
        unlinkCalls += 1;
        nodeUnlinkSync(path);
      },
      fsyncDirSync: (): void => {
        fsyncCalls += 1;
        if (fsyncCalls === 2) throw new Error('EIO: post-unlink dir fsync failed');
      },
    });

    expect(() => deps.archiveLock(stale)).toThrow(CalibrationFatalError);
    expect(linkCalls).toBe(1);
    expect(unlinkCalls).toBe(1);
    expect(fsyncCalls).toBe(2);
    expect(existsSync(archivePathFor(baseDir, stale))).toBe(true);
  });

  it('unsupported link never falls back to rename and preserves the lock', () => {
    const baseDir = makeTempDir();
    const stale = makeOwner({ pid: 1111, startTicks: 2222 });
    depsFor(baseDir).writeLockExclusive(stale);

    let linkCalls = 0;
    let renameCalls = 0;
    const deps = depsFor(baseDir, {
      linkSync: (): void => {
        linkCalls += 1;
        throw Object.assign(new Error('link unsupported'), { code: 'ENOSYS' });
      },
      renameSync: (): void => {
        renameCalls += 1;
        throw new Error('rename fallback must not run');
      },
    });

    expect(() => deps.archiveLock(stale)).toThrow(CalibrationFatalError);
    expect(linkCalls).toBeGreaterThan(0);
    expect(renameCalls).toBe(0);
    expect(depsFor(baseDir).readLock()).toEqual(stale);
    expect(existsSync(archivePathFor(baseDir, stale))).toBe(false);
  });

  it('a throwing rename seam does not break the link-based archive', () => {
    const baseDir = makeTempDir();
    const stale = makeOwner({ pid: 1111, startTicks: 2222 });
    depsFor(baseDir).writeLockExclusive(stale);

    let linkCalls = 0;
    const deps = depsFor(baseDir, {
      linkSync: (from: string, to: string): void => {
        linkCalls += 1;
        nodeLinkSync(from, to);
      },
      renameSync: (): void => {
        throw new Error('array rename seam must not affect archive');
      },
    });

    deps.archiveLock(stale);
    expect(linkCalls).toBe(1);
    expect(existsSync(lockPathFor(baseDir))).toBe(false);
    expect(existsSync(archivePathFor(baseDir, stale))).toBe(true);
  });

  it('link/unlink seams never affect array rename or removeLock paths', () => {
    const baseDir = makeTempDir();
    const owner = makeOwner();
    const deps = depsFor(baseDir, {
      linkSync: (): void => {
        throw new Error('array path must not call linkSync');
      },
      unlinkSync: (): void => {
        throw new Error('array path must not call unlinkSync');
      },
    });
    expect(() => deps.appendLedgerEvent({ type: 'probe' })).not.toThrow();
    expect(deps.readLedgerEvents()).toEqual([{ type: 'probe' }]);
    deps.writeLockExclusive(owner);
    expect(() => deps.removeLock(owner)).not.toThrow();
    expect(deps.readLock()).toBeUndefined();
  });

  it('preexisting archive file blocks the claim and preserves both files', () => {
    const baseDir = makeTempDir();
    const stale = makeOwner({ pid: 1111, startTicks: 2222 });
    const deps = depsFor(baseDir);
    deps.writeLockExclusive(stale);
    const archivePath = archivePathFor(baseDir, stale);
    writeFileSync(archivePath, JSON.stringify({ old: true }), { mode: 0o600 });

    expect(() => deps.archiveLock(stale)).toThrow(CalibrationFatalError);
    expect(deps.readLock()).toEqual(stale);
    expect(JSON.parse(readFileSync(archivePath, 'utf8'))).toEqual({ old: true });
  });

  it('symlinked archive destination blocks the claim without touching the target', () => {
    const baseDir = makeTempDir();
    const stale = makeOwner({ pid: 1111, startTicks: 2222 });
    const deps = depsFor(baseDir);
    deps.writeLockExclusive(stale);
    const outside = join(makeTempDir(), 'outside.json');
    writeFileSync(outside, '{"outside":true}', { mode: 0o600 });
    symlinkSync(outside, archivePathFor(baseDir, stale));

    expect(() => deps.archiveLock(stale)).toThrow(CalibrationFatalError);
    expect(deps.readLock()).toEqual(stale);
    expect(JSON.parse(readFileSync(outside, 'utf8'))).toEqual({ outside: true });
  });

  it('crash leftover with lock plus archive present requires operator intervention', () => {
    const baseDir = makeTempDir();
    const stale = makeOwner({ pid: 1111, startTicks: 2222 });
    const deps = depsFor(baseDir);
    deps.writeLockExclusive(stale);
    // Simulate crash after link but before unlink: both names share one inode.
    nodeLinkSync(lockPathFor(baseDir), archivePathFor(baseDir, stale));

    expect(() => deps.archiveLock(stale)).toThrow(CalibrationFatalError);
    expect(existsSync(lockPathFor(baseDir))).toBe(true);
    expect(existsSync(archivePathFor(baseDir, stale))).toBe(true);
    expect(lstatSync(lockPathFor(baseDir)).ino).toBe(
      lstatSync(archivePathFor(baseDir, stale)).ino,
    );
  });

  it('fresh wx contender wins after the old lock is unlinked and keeps its lock', () => {
    const baseDir = makeTempDir();
    const stale = makeOwner({ pid: 1111, startTicks: 2222 });
    const freshOwner = makeOwner({ pid: 3333, startTicks: 4444 });
    const deps = depsFor(baseDir);
    deps.writeLockExclusive(stale);
    deps.archiveLock(stale);
    expect(deps.readLock()).toBeUndefined();
    deps.writeLockExclusive(freshOwner);
    expect(deps.readLock()).toEqual(freshOwner);
  });

  it('fresh contender wx win during unlink leaves winner lock plus old archive with no recovery audit', () => {
    const baseDir = makeTempDir();
    const stale = makeOwner({ pid: 1111, startTicks: 2222 });
    const freshOwner = makeOwner({ pid: 3333, startTicks: 4444 });
    const loserOwner = makeOwner({ pid: 5555, startTicks: 6666 });
    const setup = depsFor(baseDir);
    setup.writeLockExclusive(stale);
    const staleBytes = readLockBytes(baseDir);
    const archivePath = archivePathFor(baseDir, stale);

    const winnerDeps = depsFor(baseDir);
    let unlinkCalls = 0;
    const loserDeps = depsFor(baseDir, {
      unlinkSync: (path: string): void => {
        unlinkCalls += 1;
        nodeUnlinkSync(path);
        winnerDeps.writeLockExclusive(freshOwner);
      },
      procStatReader: (): string => {
        throw Object.assign(new Error('ENOENT: no such process'), { code: 'ENOENT' });
      },
    });
    const ledger = createCalibrationLedger(loserDeps, makeIdentity(), []);
    let caught: unknown;
    try {
      ledger.acquireLock(loserOwner);
    } catch (error) {
      caught = error;
    }
    // Hook must have run; otherwise a rename-based implementation false-passes.
    expect(unlinkCalls).toBeGreaterThan(0);
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    // Fresh winner holds the wx lock; old archive preserved; loser wrote nothing.
    expect(readLockBytes(baseDir)).toBe(JSON.stringify(freshOwner));
    expect(loserDeps.readLock()).toEqual(freshOwner);
    expect(readFileSync(archivePath, 'utf8')).toBe(staleBytes);
    expect(lstatSync(archivePath).isFile()).toBe(true);
    // No recovery audit appended by the losing contender.
    expect(loserDeps.readLedgerEvents()).toHaveLength(0);
  });
});
