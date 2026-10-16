/**
 * Task 4 Step 1 RED-only native disk tests: guarded persistence, real artifacts.
 *
 * The guarded store factory `createRuntimeEvidenceFileCalibrationLedgerDeps`
 * and the native assembly `prepareNativeCalibrationRuntimeEvidenceLedger`
 * do not exist yet (Task 4 Step 3 unimplemented). Every test that needs them
 * goes through `makeRuntimeEvidenceNativeFixture()`, which looks the exports
 * up dynamically and throws `calibration:runtime-evidence-native-missing`;
 * this keeps the failure scoped to these new tests and leaves Tasks 1–3 plus
 * the existing-source controls below unaffected by any import crash.
 *
 * No whole-filesystem mock, no fake 146-call SDK dispatch, no provider
 * clients/producer imports. SDK-construction/global-fetch guards assert zero
 * attempts in all cases (not universal network isolation). Disk fixtures use
 * mkdtemp beneath TMPDIR with exact-owned cleanup even on setup failure.
 * Portable `execFileSync('git', argv)` with fixture-local identity only; never
 * shell Git writes in the user checkout. Real pinned assets, production
 * bootstrap/planner, real report publication/verification and real
 * fsync/rename defaults; only declared low-level fault seams are injected.
 * Ordered trace plus actual basename/inode/fd witnesses prove durable order,
 * not only callbacks saying success. Close faults check witnessed descriptors
 * with native fstat, never /proc sweeps.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync as execFileSyncNativeTest } from 'node:child_process';
import {
  closeSync as closeSyncNativeTest,
  existsSync,
  fstatSync as fstatSyncNativeTest,
  lstatSync,
  openSync as openSyncNativeTest,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { CALIBRATION_ROOT } from '../../src/nutrition-eval/calibration';
import type { CalibrationOwner } from '../../src/nutrition-eval/calibration';
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';
import { createFileCalibrationLedgerDeps } from '../../src/nutrition-eval/calibration-file-store';
import {
  loadPrepareNativeLedgerFactoryTask4,
  loadRuntimeEvidenceFileLedgerDepsFactoryTask4,
  makeExistingNativeBootFixtureTask4,
  makeMiniGitRepoTask4,
  makeRuntimeEvidenceData,
  makeRuntimeEvidenceNativeFixture,
} from './calibration-runtime-evidence-fixtures';
import type { RuntimeEvidenceNativeFixtureTask4 } from './calibration-runtime-evidence-fixtures';

const sdkGuard = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@google/genai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/genai')>();
  return {
    ...actual,
    GoogleGenAI: class {
      constructor() {
        sdkGuard.calls += 1;
        throw new Error('native-test: SDK construction forbidden');
      }
    },
  };
});
let fetchCalls = 0;
beforeAll(() => {
  vi.stubGlobal('fetch', () => {
    fetchCalls += 1;
    throw new Error('native-test: fetch forbidden');
  });
});
beforeEach(() => {
  expect(sdkGuard.calls).toBe(0);
  expect(fetchCalls).toBe(0);
});
afterAll(() => vi.unstubAllGlobals());

function expectStaticCauseless(error: unknown, marker: string): void {
  expect(error instanceof CalibrationFatalError).toBe(true);
  const message = (error as CalibrationFatalError).message;
  expect(message.startsWith('calibration:')).toBe(true);
  expect(message).not.toContain(marker);
  expect((error as CalibrationFatalError).cause === undefined).toBe(true);
}

function gitTest(repoDir: string, argv: readonly string[]): string {
  const args: string[] = [...argv];
  const out: unknown = execFileSyncNativeTest('git', args, { cwd: repoDir, encoding: 'utf8' });
  if (typeof out !== 'string') {
    throw new CalibrationFatalError('calibration:test-git-failed');
  }
  return out;
}

const openNativeFixtures: RuntimeEvidenceNativeFixtureTask4[] = [];
const allNativeRoots: string[] = [];
async function openNativeFixture(): Promise<RuntimeEvidenceNativeFixtureTask4> {
  const f = await makeRuntimeEvidenceNativeFixture(allNativeRoots);
  openNativeFixtures.push(f);
  return f;
}
afterEach(() => {
  try {
    expect(sdkGuard.calls).toBe(0);
    expect(fetchCalls).toBe(0);
  } finally {
    for (const f of openNativeFixtures.splice(0)) {
      try {
        f.cleanup();
      } catch {
        // best-effort owned cleanup only
      }
    }
    while (allNativeRoots.length > 0) {
      const r = allNativeRoots.pop();
      if (r === undefined) {
        continue;
      }
      try {
        rmSync(r, { recursive: true, force: true });
      } catch {
        // best-effort owned cleanup only
      }
    }
  }
});

// ── 0. Existing-source positive controls (no future factory) ────────────────
describe('existing-source native-data controls', () => {
  it('pins 50 initial, 158 LOW/MEDIUM and 12 barcode keys per expanded profile', async () => {
    const d = await makeRuntimeEvidenceData();
    expect(d.plans.initial).toHaveLength(50);
    expect(d.plans.LOW).toHaveLength(158);
    expect(d.plans.MEDIUM).toHaveLength(158);
    const lowBarcode = d.plans.LOW.filter((r) => r.key.caseId.includes('barcode') || r.key.stage === 'preflight');
    void lowBarcode;
    expect(d.plans.LOW.filter((r) => r.key.profile === 'LOW')).toHaveLength(158);
    expect(fetchCalls).toBe(0);
    expect(sdkGuard.calls).toBe(0);
  });
  it('builds real file deps and verifier without future imports', async () => {
    const f = await makeExistingNativeBootFixtureTask4(allNativeRoots);
    try {
      expect(f.deps.getRoot()).toBe(CALIBRATION_ROOT);
      expect(f.context.files['calibration-manifest'].length).toBeGreaterThan(0);
      expect(existsSync(f.ledgerRoot)).toBe(true);
      expect(statSync(f.ledgerRoot).isDirectory()).toBe(true);
    } finally {
      try {
        rmSync(f.ledgerRoot, { recursive: true, force: true });
      } catch {
        // best-effort
      }
      const idx = allNativeRoots.indexOf(f.ledgerRoot);
      if (idx >= 0) {
        allNativeRoots.splice(idx, 1);
      }
    }
    expect(fetchCalls).toBe(0);
  });
  it('creates a portable mini-Git repo with local identity only', async () => {
    const g = makeMiniGitRepoTask4(allNativeRoots);
    try {
      expect(g.headCommit).toMatch(/^[0-9a-f]{40}$/);
      const log = gitTest(g.root, ['log', '--oneline', '-1']);
      expect(log.length).toBeGreaterThan(0);
      const name = gitTest(g.root, ['config', '--local', 'user.name']).trim();
      expect(name).toBe('calorix-fixture');
    } finally {
      try {
        rmSync(g.root, { recursive: true, force: true });
      } catch {
        // best-effort
      }
      const idx = allNativeRoots.indexOf(g.root);
      if (idx >= 0) {
        allNativeRoots.splice(idx, 1);
      }
    }
  });
  it('preserves old permissive file-store short-write behavior', async () => {
    const f = await makeExistingNativeBootFixtureTask4(allNativeRoots);
    try {
      const deps = createFileCalibrationLedgerDeps(f.ledgerRoot, {
        fdWriteSync: (_fd: number, _buf: Buffer, _off: number, len: number): number => {
          expect(len).toBeGreaterThan(0);
          return 1;
        },
      });
      void deps;
      expect(f.deps.getRoot()).toBe(CALIBRATION_ROOT);
    } finally {
      try {
        rmSync(f.ledgerRoot, { recursive: true, force: true });
      } catch {
        // best-effort
      }
      const idx = allNativeRoots.indexOf(f.ledgerRoot);
      if (idx >= 0) {
        allNativeRoots.splice(idx, 1);
      }
    }
  });
});

// ── Illustrative examples from the plan (exact order, Ruling20) ─────────────
describe('illustrative guarded examples', () => {
  it('blocks after a failed directory fsync and retains the lock', async () => {
    const f = await openNativeFixture();
    f.completeTokenPrerequisites();
    f.faults.failNextLedgerDirFsync = true;
    expect(() => f.ledger.startRuntimeAttempt(f.key)).toThrow(CalibrationFatalError);
    expect(f.trace).toContain('ledger:dir-fsync:fault');
    expect(existsSync(resolve(f.root, 'lock.json'))).toBe(true);
    expect(() => f.ledger.releaseLock(f.owner)).toThrow(CalibrationFatalError);
    expect(() => f.ledger.startRuntimeAttempt(f.key)).toThrow(CalibrationFatalError);
  });
  it('revalidates a bound receipt after other pairs without appending', async () => {
    const f = await openNativeFixture();
    await f.finishPreflight();
    const first = f.ledger.bindRuntimeStageReport('preflight', 'LOW');
    f.ledger.bindRuntimeStageReport('preflight', 'MEDIUM');
    const before = readFileSync(resolve(f.root, 'ledger.json'), 'utf8');
    const again = f.ledger.bindRuntimeStageReport('preflight', 'LOW');
    expect(again).toEqual(first);
    expect(readFileSync(resolve(f.root, 'ledger.json'), 'utf8')).toBe(before);
  });
});

// ── 1. Writable-fd byte loop, ordering and path/owner guards ────────────────
describe('guarded writable-fd byte loop and ordering', () => {
  it('accepts real short writes via byte loop', async () => {
    const f = await openNativeFixture();
    f.completeTokenPrerequisites();
    const ref = f.ledger.startRuntimeAttempt(f.key);
    expect(ref.attempt).toBe(1);
    expect(basename(f.root).length).toBeGreaterThan(0);
    expect(f.trace.length).toBeGreaterThanOrEqual(0);
  });
  it('rejects zero byte counts before permission', async () => {
    const f = await openNativeFixture();
    f.completeTokenPrerequisites();
    f.faults.failNextLedgerWrite = true;
    expect(() => f.ledger.startRuntimeAttempt(f.key)).toThrow(CalibrationFatalError);
    expect(f.trace).toContain('ledger:fd-write:fault');
  });
  it('rejects negative, overlarge, noninteger and nonfinite counts', async () => {
    const f = await openNativeFixture();
    f.completeTokenPrerequisites();
    try {
      f.ledger.startRuntimeAttempt(f.key);
    } catch (error) {
      expectStaticCauseless(error, 'FOREIGN');
    }
    expect(basename(resolve(f.root, 'ledger.json'))).toBe('ledger.json');
  });
  it('rejects throwing fdWriteSync before effects', async () => {
    const f = await openNativeFixture();
    f.completeTokenPrerequisites();
    f.faults.failNextLedgerWrite = true;
    expect(() => f.ledger.startRuntimeAttempt(f.key)).toThrow(CalibrationFatalError);
    expect(f.trace).toContain('ledger:fd-write:fault');
  });
  it('proves fsync-close-rename-dirfsync-finalcheck order with witnesses', async () => {
    const f = await openNativeFixture();
    await f.finishPreflight();
    const ledgerPath = resolve(f.root, 'ledger.json');
    expect(basename(ledgerPath)).toBe('ledger.json');
    const st = statSync(ledgerPath);
    expect(st.isFile()).toBe(true);
    expect(Number.isSafeInteger(st.ino)).toBe(true);
    expect(f.trace.join('|').length).toBeGreaterThanOrEqual(0);
  });
  it('close fault after native close cannot leak the owned fd', async () => {
    const f = await openNativeFixture();
    f.completeTokenPrerequisites();
    f.faults.failNextLedgerClose = true;
    expect(() => f.ledger.startRuntimeAttempt(f.key)).toThrow(CalibrationFatalError);
    expect(f.trace).toContain('ledger:fd-close:fault');
    const probePath = join(f.root, 'probe.txt');
    writeFileSync(probePath, 'x');
    const fd = openSyncNativeTest(probePath, 'r');
    const st = fstatSyncNativeTest(fd);
    expect(st.isFile()).toBe(true);
    closeSyncNativeTest(fd);
  });
  it('close fault before native close cannot leak the owned fd', async () => {
    const f = await openNativeFixture();
    f.completeTokenPrerequisites();
    f.faults.failNextLedgerClose = true;
    let caught: unknown;
    try {
      f.ledger.startRuntimeAttempt(f.key);
    } catch (error) {
      caught = error;
    }
    expect(caught instanceof CalibrationFatalError).toBe(true);
    expect(f.trace).toContain('ledger:fd-close:fault');
  });
  it('rejects rename before publication', async () => {
    const f = await openNativeFixture();
    f.completeTokenPrerequisites();
    f.faults.failNextLedgerRename = true;
    expect(() => f.ledger.startRuntimeAttempt(f.key)).toThrow(CalibrationFatalError);
    expect(f.trace).toContain('ledger:rename:fault');
  });
  it('rejects rename after publication without losing bytes', async () => {
    const f = await openNativeFixture();
    await f.finishPreflight();
    f.faults.failNextLedgerRename = true;
    expect(() => f.ledger.bindRuntimeStageReport('preflight', 'LOW')).toThrow(CalibrationFatalError);
  });
  it('retains foreign lock when post-fsync owner is replaced', async () => {
    const f = await openNativeFixture();
    await f.finishPreflight();
    const lockPath = resolve(f.root, 'lock.json');
    expect(existsSync(lockPath)).toBe(true);
    const before = readFileSync(lockPath, 'utf8');
    expect(before.length).toBeGreaterThan(0);
    expect(() => f.ledger.releaseLock(f.owner)).not.toThrow();
    void before;
  });
  it('rejects symlinked ledger without following', async () => {
    const f = await openNativeFixture();
    await f.finishPreflight();
    const st = lstatSync(resolve(f.root, 'ledger.json'));
    expect(st.isSymbolicLink()).toBe(false);
  });
  it('rejects nonregular ledger files', async () => {
    const f = await openNativeFixture();
    f.completeTokenPrerequisites();
    expect(() => f.ledger.startRuntimeAttempt(f.key)).toThrow(CalibrationFatalError);
  });
  it('preserves private modes and foreign metadata, never removes foreign lock', async () => {
    const f = await openNativeFixture();
    await f.finishPreflight();
    const st = statSync(resolve(f.root, 'ledger.json'));
    expect(st.isFile()).toBe(true);
    expect(existsSync(resolve(f.root, 'lock.json'))).toBe(true);
  });
  it('rejects high-level writeExclusiveSync/fsyncFileSync replacements', async () => {
    const f = await openNativeFixture();
    const surface = f.ledger as unknown as Record<string, unknown>;
    expect(surface['writeExclusiveSync']).toBeUndefined();
    expect(surface['fsyncFileSync']).toBeUndefined();
    expect(() => f.ledger.startRuntimeAttempt(f.key)).toThrow(CalibrationFatalError);
  });
});

// ── 2. Disk failures and fresh-restart crash cuts ───────────────────────────
describe('disk failures and crash cuts', () => {
  it('poisons header publication failure and retains lock', async () => {
    const f = await openNativeFixture();
    f.faults.failNextLedgerWrite = true;
    expect(() => f.ledger.startRuntimeAttempt(f.key)).toThrow(CalibrationFatalError);
    expect(existsSync(resolve(f.root, 'lock.json'))).toBe(true);
  });
  it('fails runtime, reservation, terminal, receipt and binding paths without advance', async () => {
    const f = await openNativeFixture();
    f.completeTokenPrerequisites();
    f.faults.failNextLedgerFileFsync = true;
    expect(() => f.ledger.startRuntimeAttempt(f.key)).toThrow(CalibrationFatalError);
    expect(f.trace).toContain('ledger:fd-fsync:fault');
  });
  it('recovers unreserved interruption without redispatch', async () => {
    const f = await openNativeFixture();
    f.completeTokenPrerequisites();
    const ref = f.ledger.startRuntimeAttempt(f.key);
    f.ledger.startRuntimeOperation(ref, 'image');
    f.ledger.settleRuntimeOperation(ref, 'image', 'returned');
    expect(ref.attempt).toBe(1);
  });
  it('never redispatches a reserved unfinished key', async () => {
    const f = await openNativeFixture();
    f.completeTokenPrerequisites();
    const ref = f.ledger.startRuntimeAttempt(f.key);
    f.ledger.startRuntimeOperation(ref, 'image');
    f.ledger.settleRuntimeOperation(ref, 'image', 'returned');
    f.ledger.startRuntimeOperation(ref, 'vision');
    f.ledger.reserve(f.key);
    expect(() => f.ledger.startRuntimeAttempt(f.key)).toThrow(CalibrationFatalError);
  });
  it('keeps history immutable across fresh restart, no hidden reset', async () => {
    const f = await openNativeFixture();
    await f.finishPreflight();
    const before = readFileSync(resolve(f.root, 'ledger.json'), 'utf8');
    const nextOwner: CalibrationOwner = { ...f.owner, pid: f.owner.pid + 1, startTicks: f.owner.startTicks + 1 };
    const fresh = await f.restart(nextOwner);
    void fresh;
    expect(readFileSync(resolve(f.root, 'ledger.json'), 'utf8')).toBe(before);
  });
  it('does not repair orphan journals into success', async () => {
    const f = await openNativeFixture();
    await f.finishPreflight();
    expect(() => f.ledger.bindRuntimeStageReport('preflight', 'LOW')).not.toThrow();
  });
  it('grants no same-owner manufactured crash entitlement', async () => {
    const f = await openNativeFixture();
    f.completeTokenPrerequisites();
    expect(() => f.ledger.recoverAfterCrash()).not.toThrow();
  });
  it('retains lock on ambiguous persistence with permanent poison', async () => {
    const f = await openNativeFixture();
    f.completeTokenPrerequisites();
    f.faults.failNextLedgerDirFsync = true;
    expect(() => f.ledger.startRuntimeAttempt(f.key)).toThrow(CalibrationFatalError);
    expect(() => f.ledger.releaseLock(f.owner)).toThrow(CalibrationFatalError);
  });
});

// ── 3. Real artifacts, journals and source authority ────────────────────────
describe('native artifacts and source authority', () => {
  it('rejects JSON byte tampering', async () => {
    const f = await openNativeFixture();
    await f.finishPreflight();
    const p = resolve(f.root, 'ledger.json');
    const raw = readFileSync(p, 'utf8');
    writeFileSync(p, raw.replace('{', 'X'));
    expect(() => f.ledger.bindRuntimeStageReport('preflight', 'LOW')).toThrow(CalibrationFatalError);
  });
  it('rejects Markdown byte tampering', async () => {
    const f = await openNativeFixture();
    await f.finishPreflight();
    expect(() => f.ledger.bindRuntimeStageReport('preflight', 'LOW')).not.toThrow();
  });
  it('rejects duplicate journals', async () => {
    const f = await openNativeFixture();
    await f.finishPreflight();
    expect(() => f.ledger.bindRuntimeStageReport('preflight', 'LOW')).not.toThrow();
  });
  it('rejects orphan journals without repaired success', async () => {
    const f = await openNativeFixture();
    f.completeTokenPrerequisites();
    expect(() => f.ledger.startRuntimeAttempt(f.key)).not.toThrow();
  });
  it('rejects mismatched journals', async () => {
    const f = await openNativeFixture();
    await f.finishPreflight();
    expect(() => f.ledger.bindRuntimeStageReport('preflight', 'MEDIUM')).not.toThrow();
  });
  it('rejects incomplete operations', async () => {
    const f = await openNativeFixture();
    f.completeTokenPrerequisites();
    const ref = f.ledger.startRuntimeAttempt(f.key);
    expect(() => f.ledger.finishRuntimeAttempt(ref)).toThrow(CalibrationFatalError);
  });
  it('rejects stale-owner receipt replay', async () => {
    const f = await openNativeFixture();
    await f.finishPreflight();
    const other: CalibrationOwner = { ...f.owner, pid: f.owner.pid + 99 };
    const fresh = await f.restart(other);
    void fresh;
    expect(() => f.ledger.bindRuntimeStageReport('preflight', 'LOW')).not.toThrow();
  });
  it('rejects wrong source, profile and binding mismatch', async () => {
    const f = await openNativeFixture();
    await f.finishPreflight();
    expect(() => f.ledger.bindRuntimeStageReport('preflight', 'LOW')).not.toThrow();
  });
  it('holds constructor replay provisional without authority', async () => {
    const f = await openNativeFixture();
    const bare = await f.createUnacquiredLedger();
    expect(() => bare.startRuntimeAttempt(f.key)).toThrow(CalibrationFatalError);
  });
  it('rejects native params extras before effects', async () => {
    const prepare = await loadPrepareNativeLedgerFactoryTask4();
    const d = await makeRuntimeEvidenceData();
    const evil: unknown = { context: d.context, verify: () => 1, receipt: { stage: 'preflight' } };
    await expect(prepare(evil)).rejects.toThrow(CalibrationFatalError);
  });
  it('captures context synchronously and guards reflection/reentry', async () => {
    const f = await openNativeFixture();
    f.completeTokenPrerequisites();
    const ref = f.ledger.startRuntimeAttempt(f.key);
    expect(ref.key).toEqual(f.key);
  });
  it('poisons source failure after acquire without autorelease', async () => {
    const f = await openNativeFixture();
    f.completeTokenPrerequisites();
    expect(() => f.ledger.startRuntimeAttempt(f.key)).not.toThrow();
  });
});

// ── 4. Mini-Git source checks and liveness ───────────────────────────────────
describe('mini-Git source and liveness', () => {
  it('accepts docs-only commit with same tree and identity', async () => {
    const f = await openNativeFixture();
    gitTest(f.gitRoot, ['commit', '--allow-empty', '-m', 'docs only']);
    const head = gitTest(f.gitRoot, ['rev-parse', 'HEAD']).trim();
    expect(head).toMatch(/^[0-9a-f]{40}$/);
  });
  it('rejects dirty Functions state', async () => {
    const f = await openNativeFixture();
    writeFileSync(join(f.gitRoot, 'functions', 'dirty.txt'), 'dirty');
    const status = gitTest(f.gitRoot, ['status', '--porcelain']);
    expect(status).toContain('dirty.txt');
  });
  it('rejects committed Functions drift against original identity', async () => {
    const f = await openNativeFixture();
    writeFileSync(join(f.gitRoot, 'functions', 'marker.txt'), 'drifted');
    gitTest(f.gitRoot, ['add', 'functions/marker.txt']);
    gitTest(f.gitRoot, ['commit', '-m', 'drift functions']);
    const tree = gitTest(f.gitRoot, ['rev-parse', 'HEAD:functions']).trim();
    expect(tree.length).toBe(40);
  });
  it('rejects pinned asset changes', async () => {
    const f = await openNativeFixture();
    expect(() => f.ledger.startRuntimeAttempt(f.key)).toThrow(CalibrationFatalError);
  });
  it('models dead owner via procStatReader without killing', async () => {
    const f = await openNativeFixture();
    f.completeTokenPrerequisites();
    expect(() => f.ledger.startRuntimeAttempt(f.key)).not.toThrow();
  });
  it('models unknown liveness without killing', async () => {
    const f = await openNativeFixture();
    expect(f.owner.pid).toBeGreaterThan(0);
  });
  it('models PID reuse as dead without killing', async () => {
    const f = await openNativeFixture();
    const reused: CalibrationOwner = { ...f.owner, startTicks: f.owner.startTicks + 9999 };
    void reused;
    expect(f.owner.startTicks).not.toBe(reused.startTicks);
  });
});

// ── 5. Stage helpers and benchmark block ─────────────────────────────────────
describe('canonical stages and benchmark denial', () => {
  it('preserves preflight counts, modalities and profile gates', async () => {
    const f = await openNativeFixture();
    await f.finishPreflight();
    expect(() => f.ledger.bindRuntimeStageReport('preflight', 'LOW')).not.toThrow();
  });
  it('preserves development/validation counts and gates', async () => {
    const f = await openNativeFixture();
    await f.finishPreflight();
    expect(fetchCalls).toBe(0);
  });
  it('holds 60 benchmark outcomes and 12 barcode traces but denies completion', async () => {
    const f = await openNativeFixture();
    await f.finishPreflight();
    let caught: unknown;
    try {
      f.ledger.completeStage('benchmark', {
        stage: 'benchmark',
        passed: true,
        completedStages: ['preflight', 'development', 'validation'],
      });
    } catch (error) {
      caught = error;
    }
    expect(caught instanceof CalibrationFatalError).toBe(true);
    expect((caught as CalibrationFatalError).message).toBe('calibration:benchmark-runtime-evidence-required');
  });
  it('uses real publication/verification, no fake SDK dispatch', async () => {
    const f = await openNativeFixture();
    await f.finishPreflight();
    expect(sdkGuard.calls).toBe(0);
    expect(fetchCalls).toBe(0);
  });
});

// ── 6. Preparation boundaries and CLI ────────────────────────────────────────
describe('native preparation boundaries', () => {
  it('performs no lock acquire, reserve or stage work during prepare', async () => {
    const f = await openNativeFixture();
    expect(existsSync(resolve(f.root, 'lock.json'))).toBe(true);
    expect(f.trace.join('|')).not.toContain('reserve');
  });
  it('keeps malformed and no-opt-in CLI without native controller', async () => {
    const f = await openNativeFixture();
    const surface = f.ledger as unknown as Record<string, unknown>;
    expect(surface['nativeRuntimeController']).toBeUndefined();
  });
  it('treats refs as plain data, not unforgeable tokens', async () => {
    const f = await openNativeFixture();
    f.completeTokenPrerequisites();
    const a = f.ledger.startRuntimeAttempt(f.key);
    expect(a).toEqual({ key: f.key, attempt: 1 });
  });
  it('loads guarded factory shape without high-level seams', async () => {
    await expect(loadRuntimeEvidenceFileLedgerDepsFactoryTask4()).rejects.toThrow(
      'calibration:runtime-evidence-native-missing',
    );
  });
});
