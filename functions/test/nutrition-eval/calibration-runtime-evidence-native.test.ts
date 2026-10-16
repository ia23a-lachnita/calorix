/**
 * Task4 Tier1 foundation: real miniGit/bootstrap/file/publisher controls + 2 future RED.
 *
 * Foundation-only, not full Task4 matrix. Real disk miniGit with pinned assets,
 * native bootstrap context, real syscall wrappers with physical witnesses,
 * production publishCalibrationStageReport existing-source controls before
 * missing future module cases. Two illustrative future cases use same
 * validated miniRoot/context and disarmed real hooks, dynamic lookup only
 * inside builder; they RED with genuine native-missing, no stubs.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closeSync as closeSyncTest,
  constants as constantsTest,
  existsSync,
  fstatSync as fstatSyncTest,
  fsyncSync as fsyncSyncTest,
  lstatSync,
  openSync as openSyncTest,
  readFileSync,
  renameSync as renameSyncTest,
  rmSync,
  statSync,
  writeSync as writeSyncTest,
} from 'node:fs';
import { basename, resolve, sep } from 'node:path';
import { CALIBRATION_ROOT, createProtocolCalibrationLedger } from '../../src/nutrition-eval/calibration';
import type { CalibrationOwner, ReservationKey } from '../../src/nutrition-eval/calibration';
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';
import { createFileCalibrationLedgerDeps } from '../../src/nutrition-eval/calibration-file-store';
import { deriveCanonicalAllowedKeys, deriveCanonicalReportOutcomePlan } from '../../src/nutrition-eval/calibration-bootstrap';
import { publishCalibrationStageReport } from '../../src/nutrition-eval/calibration-report-publication';
import { prepareCalibrationStageReportArtifactVerifier } from '../../src/nutrition-eval/calibration-report-artifact-verification';
import { StrictCalibrationManifestSchema } from '../../src/nutrition-eval/schema';
import {
  buildCoreSuccessJournal,
  createCoreExactPrediction,
  CORE_PINNED_VERSION,
  makeExistingNativeBootFixtureTask4,
  makeMiniGitRepoTask4,
  makeRuntimeEvidenceNativeFixture,
} from './calibration-runtime-evidence-fixtures';

function realFirstDevCase(files: Record<string, string>, firstDev: string): Parameters<typeof createCoreExactPrediction>[0] {
  const full = StrictCalibrationManifestSchema.parse(JSON.parse(files['calibration-manifest'] as string)) as unknown as {
    cases: Array<Parameters<typeof createCoreExactPrediction>[0] & { id: string }>;
  };
  const found = full.cases.find((c) => c.id === firstDev);
  if (found === undefined) {
    throw new CalibrationFatalError('calibration:fixture-unknown-case');
  }
  return found;
}

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

const ownedRoots: string[] = [];
afterEach(() => {
  try {
    expect(sdkGuard.calls).toBe(0);
    expect(fetchCalls).toBe(0);
  } finally {
    while (ownedRoots.length > 0) {
      const r = ownedRoots.pop() as string;
      try {
        rmSync(r, { recursive: true, force: true });
      } catch {
        // best-effort owned only, never parent fallback or repoRoot
      }
    }
  }
});

function assertInsideOwned(miniRoot: string, ledgerRoot: string): void {
  expect(basename(miniRoot).startsWith('calorix-mini-git-')).toBe(true);
  expect(resolve(ledgerRoot).startsWith(resolve(miniRoot) + sep)).toBe(true);
  expect(resolve(miniRoot)).not.toBe(resolve(process.cwd()));
}

describe('foundation existing-source controls', () => {
  it('pins miniGit/bootstrap/planner 50/158/146+12 same-root', async () => {
    const boot = await makeExistingNativeBootFixtureTask4(ownedRoots);
    const miniRoot = boot.context.baseDir;
    expect(boot.context.baseDir).toBe(miniRoot);
    expect(boot.ledgerRoot).toBe(resolve(miniRoot, CALIBRATION_ROOT));
    assertInsideOwned(miniRoot, boot.ledgerRoot);
    expect(boot.plans.initial).toHaveLength(50);
    expect(boot.plans.LOW).toHaveLength(158);
    expect(boot.plans.MEDIUM).toHaveLength(158);
    const allowedLow = deriveCanonicalAllowedKeys({ ...boot.context.files }, 'LOW');
    expect(allowedLow).toHaveLength(146);
    const planLow = deriveCanonicalReportOutcomePlan({ ...boot.context.files }, 'LOW');
    const barcode = planLow.filter((r) => {
      const scan = (r as unknown as { scanMode: string }).scanMode;
      return scan === 'barcode';
    });
    expect(barcode).toHaveLength(12);
    expect(boot.context.files['public-manifest'].length).toBeGreaterThan(0);
    expect(boot.context.files['calibration-manifest'].length).toBeGreaterThan(0);
    expect(boot.key.stage).toBe('preflight');
    const g = makeMiniGitRepoTask4(ownedRoots);
    expect(basename(g.root).startsWith('calorix-mini-git-')).toBe(true);
    expect(g.headCommit).toMatch(/^[0-9a-f]{40}$/);
  });

  it('proves file-deps lock/ledger/journal bytes/modes/order with native witnesses', async () => {
    const boot = await makeExistingNativeBootFixtureTask4(ownedRoots);
    const miniRoot = boot.context.baseDir;
    assertInsideOwned(miniRoot, boot.ledgerRoot);
    const order: string[] = [];
    interface SyscallRecord {
      fd: number;
      dev: number;
      ino: number;
      startIdx: number;
      completeIdx: number;
    }
    const fdWrites: SyscallRecord[] = [];
    const fdFsyncs: SyscallRecord[] = [];
    const fdCloses: SyscallRecord[] = [];
    const renames: Array<{ from: string; fromDev: number; fromIno: number; to: string; toDev: number; toIno: number; startIdx: number; completeIdx: number }> = [];
    const dirSyncs: Array<{ dir: string; full: string; startIdx: number; completeIdx: number }> = [];
    const deps = createFileCalibrationLedgerDeps(miniRoot, {
      fdWriteSync: (fd: number, buf: Buffer, off: number, len: number): number => {
        const st = fstatSyncTest(fd);
        order.push(`write:fd=${fd}:dev=${st.dev}:ino=${st.ino}:len=${len}`);
        const startIdx = order.length - 1;
        const n = writeSyncTest(fd, buf, off, len);
        order.push(`wrote:fd=${fd}:count=${n}`);
        fdWrites.push({ fd, dev: st.dev, ino: st.ino, startIdx, completeIdx: order.length - 1 });
        return n;
      },
      fdFsyncSync: (fd: number): void => {
        const st = fstatSyncTest(fd);
        order.push(`fsync:fd=${fd}:dev=${st.dev}:ino=${st.ino}`);
        const startIdx = order.length - 1;
        fsyncSyncTest(fd);
        order.push(`fsynced:fd=${fd}`);
        fdFsyncs.push({ fd, dev: st.dev, ino: st.ino, startIdx, completeIdx: order.length - 1 });
      },
      fdCloseSync: (fd: number): void => {
        const st = fstatSyncTest(fd);
        order.push(`close:fd=${fd}:dev=${st.dev}:ino=${st.ino}`);
        const startIdx = order.length - 1;
        closeSyncTest(fd);
        order.push(`closed:fd=${fd}`);
        fdCloses.push({ fd, dev: st.dev, ino: st.ino, startIdx, completeIdx: order.length - 1 });
      },
      renameSync: (from: string, to: string): void => {
        order.push(`rename:${basename(from)}->${basename(to)}`);
        const startIdx = order.length - 1;
        const fromStat = lstatSync(from);
        renameSyncTest(from, to);
        const st = lstatSync(to);
        order.push(`renamed:${basename(to)}:dev=${st.dev}:ino=${st.ino}`);
        renames.push({ from: basename(from), fromDev: fromStat.dev, fromIno: fromStat.ino, to: basename(to), toDev: st.dev, toIno: st.ino, startIdx, completeIdx: order.length - 1 });
      },
      fsyncDirSync: (dir: string): void => {
        order.push(`dir:${basename(dir)}`);
        const startIdx = order.length - 1;
        const fd = openSyncTest(dir, constantsTest.O_RDONLY | constantsTest.O_DIRECTORY | constantsTest.O_NOFOLLOW);
        try {
          fsyncSyncTest(fd);
        } finally {
          closeSyncTest(fd);
        }
        order.push(`dir-synced:${basename(dir)}`);
        dirSyncs.push({ dir: basename(dir), full: resolve(dir), startIdx, completeIdx: order.length - 1 });
      },
    });
    const keyResolver = (selectedProfile?: 'LOW' | 'MEDIUM') =>
      deriveCanonicalAllowedKeys({ ...boot.context.files }, selectedProfile);
    const reportOptions = {
      getReportOutcomePlan: (selectedProfile?: 'LOW' | 'MEDIUM') =>
        deriveCanonicalReportOutcomePlan({ ...boot.context.files }, selectedProfile),
    };
    const ledger = createProtocolCalibrationLedger(deps, { ...boot.context.identity }, keyResolver, reportOptions, undefined);
    const owner: CalibrationOwner = { ...boot.context.owner };
    ledger.acquireLock(owner);
    const firstDev = boot.context.firstDevelopmentCaseId;
    const tokenKey = { kind: 'token_count' as const, stage: 'preflight' as const, caseId: firstDev, model: boot.context.identity.model };
    ledger.reserveTokenCount(tokenKey);
    ledger.completeTokenCount(tokenKey, 1200);
    const lowKey: ReservationKey = { stage: 'preflight', profile: 'LOW', caseId: firstDev, sampleIndex: 1 };
    ledger.reserve({ ...lowKey });
    ledger.pinModelVersion(CORE_PINNED_VERSION);
    const realCase = realFirstDevCase({ ...boot.context.files }, firstDev);
    const lowPrediction = createCoreExactPrediction(realCase, 1);
    const lowJournal = buildCoreSuccessJournal({ ...lowKey }, lowPrediction);
    const lowJournalHash = ledger.appendResultJournal(lowJournal);
    ledger.complete({ ...lowKey }, lowJournalHash);
    const mediumKey: ReservationKey = { stage: 'preflight', profile: 'MEDIUM', caseId: firstDev, sampleIndex: 1 };
    ledger.reserve({ ...mediumKey });
    const mediumPrediction = createCoreExactPrediction(realCase, 1);
    const mediumJournal = buildCoreSuccessJournal({ ...mediumKey }, mediumPrediction);
    const mediumJournalHash = ledger.appendResultJournal(mediumJournal);
    ledger.complete({ ...mediumKey }, mediumJournalHash);
    const lockPath = resolve(boot.ledgerRoot, 'lock.json');
    expect(existsSync(lockPath)).toBe(true);
    expect((lstatSync(lockPath).mode & 0o7777)).toBe(0o600);
    expect((statSync(boot.ledgerRoot).mode & 0o7777)).toBe(0o700);
    const ledgerPath = resolve(boot.ledgerRoot, 'ledger.json');
    const journalPath = resolve(boot.ledgerRoot, 'journal.json');
    expect(existsSync(ledgerPath)).toBe(true);
    expect(existsSync(journalPath)).toBe(true);
    expect((lstatSync(ledgerPath).mode & 0o7777)).toBe(0o600);
    expect((lstatSync(journalPath).mode & 0o7777)).toBe(0o600);
    const ledgerEvents = JSON.parse(readFileSync(ledgerPath, 'utf8')) as Array<{ type: string; key?: ReservationKey & { kind?: string; model?: string }; journalHash?: string; count?: number }>;
    expect(ledgerEvents.map((e) => e.type)).toEqual([
      'protocol_identity',
      'token_count_reserved',
      'token_count_completed',
      'reserved',
      'model_version_pinned',
      'completed',
      'reserved',
      'completed',
    ]);
    expect(ledgerEvents.filter((e) => e.type === 'reserved')).toHaveLength(2);
    expect(ledgerEvents.filter((e) => e.type === 'completed')).toHaveLength(2);
    expect(ledgerEvents[5]).toMatchObject({ type: 'completed', journalHash: lowJournalHash });
    expect(ledgerEvents[7]).toMatchObject({ type: 'completed', journalHash: mediumJournalHash });
    expect(ledgerEvents[5]?.key).toEqual({ ...lowKey });
    expect(ledgerEvents[7]?.key).toEqual({ ...mediumKey });
    const journals = JSON.parse(readFileSync(journalPath, 'utf8')) as Array<Record<string, unknown>>;
    expect(journals).toHaveLength(2);
    expect(journals[0]).toEqual(JSON.parse(JSON.stringify(lowJournal)) as unknown);
    expect(journals[1]).toEqual(JSON.parse(JSON.stringify(mediumJournal)) as unknown);
    for (const r of renames) {
      expect(['ledger.json', 'journal.json']).toContain(r.to);
    }
    expect(renames.some((r) => r.to === 'lock.json')).toBe(false);
    const ledgerRenames = renames.filter((r) => r.to === 'ledger.json');
    const journalRenames = renames.filter((r) => r.to === 'journal.json');
    expect(ledgerRenames).toHaveLength(ledgerEvents.length);
    expect(journalRenames).toHaveLength(journals.length);
    const finalLedgerStat = lstatSync(ledgerPath);
    const finalJournalStat = lstatSync(journalPath);
    expect(ledgerRenames.some((r) => r.toDev === finalLedgerStat.dev && r.toIno === finalLedgerStat.ino)).toBe(true);
    expect(journalRenames.some((r) => r.toDev === finalJournalStat.dev && r.toIno === finalJournalStat.ino)).toBe(true);
    const allRenames = [...ledgerRenames, ...journalRenames].sort((a, b) => a.startIdx - b.startIdx);
    expect(allRenames).toHaveLength(renames.length);
    for (let ri = 0; ri < allRenames.length; ri += 1) {
      const r = allRenames[ri] as { from: string; fromDev: number; fromIno: number; to: string; toDev: number; toIno: number; startIdx: number; completeIdx: number };
      expect(r.fromDev).toBe(r.toDev);
      expect(r.fromIno).toBe(r.toIno);
      const prevDirs = dirSyncs.filter((d) => d.completeIdx < r.startIdx);
      expect(prevDirs.length).toBeGreaterThan(0);
      const prevDirSync = prevDirs[prevDirs.length - 1] as { completeIdx: number };
      const windowStart = prevDirSync.completeIdx;
      const writes = fdWrites.filter(
        (w) => w.dev === r.fromDev && w.ino === r.fromIno && w.startIdx > windowStart && w.completeIdx < r.startIdx,
      );
      expect(writes.length).toBeGreaterThan(0);
      const tempFd = writes[0]?.fd;
      expect(typeof tempFd).toBe('number');
      for (const w of writes) {
        expect(w.fd).toBe(tempFd);
      }
      const lastWriteCompleteIdx = Math.max(...writes.map((w) => w.completeIdx));
      const fsyncs = fdFsyncs.filter(
        (f) => f.dev === r.fromDev && f.ino === r.fromIno && f.startIdx > windowStart && f.completeIdx < r.startIdx,
      );
      expect(fsyncs).toHaveLength(1);
      expect(fsyncs[0]?.fd).toBe(tempFd);
      const firstFsync = fsyncs[0] as { startIdx: number; completeIdx: number };
      const closes = fdCloses.filter(
        (c) => c.dev === r.fromDev && c.ino === r.fromIno && c.startIdx > windowStart && c.completeIdx < r.startIdx,
      );
      expect(closes).toHaveLength(1);
      expect(closes[0]?.fd).toBe(tempFd);
      const firstClose = closes[0] as { startIdx: number; completeIdx: number };
      expect(lastWriteCompleteIdx).toBeLessThan(firstFsync.startIdx);
      expect(firstFsync.completeIdx).toBeLessThan(firstClose.startIdx);
      expect(firstClose.completeIdx).toBeLessThan(r.startIdx);
      expect(r.startIdx).toBeLessThan(r.completeIdx);
      const matchingDirs = dirSyncs.filter((d) => d.startIdx > r.completeIdx);
      expect(matchingDirs.length).toBeGreaterThan(0);
      const currentDirSync = matchingDirs[0] as { full: string; startIdx: number; completeIdx: number };
      expect(resolve(currentDirSync.full)).toBe(resolve(boot.ledgerRoot));
      expect(r.completeIdx).toBeLessThan(currentDirSync.startIdx);
      expect(currentDirSync.startIdx).toBeLessThan(currentDirSync.completeIdx);
      if (ri < allRenames.length - 1) {
        const subsequentWrites = fdWrites.filter((w) => w.startIdx > r.completeIdx);
        expect(subsequentWrites.length).toBeGreaterThan(0);
        const earliestNextWriteStartIdx = Math.min(...subsequentWrites.map((w) => w.startIdx));
        expect(currentDirSync.completeIdx).toBeLessThan(earliestNextWriteStartIdx);
      }
    }
  });

  it('publishes preflight via existing publisher and admits native receipt', async () => {
    const boot = await makeExistingNativeBootFixtureTask4(ownedRoots);
    const miniRoot = boot.context.baseDir;
    assertInsideOwned(miniRoot, boot.ledgerRoot);
    const deps = createFileCalibrationLedgerDeps(miniRoot);
    const keyResolver = (selectedProfile?: 'LOW' | 'MEDIUM') =>
      deriveCanonicalAllowedKeys({ ...boot.context.files }, selectedProfile);
    const reportOptions = {
      getReportOutcomePlan: (selectedProfile?: 'LOW' | 'MEDIUM') =>
        deriveCanonicalReportOutcomePlan({ ...boot.context.files }, selectedProfile),
    };
    const verifier = await prepareCalibrationStageReportArtifactVerifier({
      baseDir: boot.context.baseDir,
      identity: { ...boot.context.identity },
      owner: { ...boot.context.owner },
      firstDevelopmentCaseId: boot.context.firstDevelopmentCaseId,
      report: boot.context.report,
      files: { ...boot.context.files },
    });
    const ledger = createProtocolCalibrationLedger(
      deps,
      { ...boot.context.identity },
      keyResolver,
      reportOptions,
      { verifyStageReportArtifacts: (params) => verifier.verify(params) },
    );
    const owner: CalibrationOwner = { ...boot.context.owner };
    ledger.acquireLock(owner);
    const firstDev = boot.context.firstDevelopmentCaseId;
    const tokenKey = { kind: 'token_count' as const, stage: 'preflight' as const, caseId: firstDev, model: boot.context.identity.model };
    ledger.reserveTokenCount(tokenKey);
    ledger.completeTokenCount(tokenKey, 1200);
    const lowKey: ReservationKey = { stage: 'preflight', profile: 'LOW', caseId: firstDev, sampleIndex: 1 };
    ledger.reserve({ ...lowKey });
    ledger.pinModelVersion(CORE_PINNED_VERSION);
    const realCase = realFirstDevCase({ ...boot.context.files }, firstDev);
    const lowPrediction = createCoreExactPrediction(realCase, 1);
    ledger.complete({ ...lowKey }, ledger.appendResultJournal(buildCoreSuccessJournal({ ...lowKey }, lowPrediction)));
    const mediumKey: ReservationKey = { stage: 'preflight', profile: 'MEDIUM', caseId: firstDev, sampleIndex: 1 };
    ledger.reserve({ ...mediumKey });
    const mediumPrediction = createCoreExactPrediction(realCase, 1);
    ledger.complete({ ...mediumKey }, ledger.appendResultJournal(buildCoreSuccessJournal({ ...mediumKey }, mediumPrediction)));
    for (const profile of ['LOW', 'MEDIUM'] as const) {
      const published = await publishCalibrationStageReport({
        stage: 'preflight',
        profile,
        context: {
          baseDir: boot.context.baseDir,
          identity: { ...boot.context.identity },
          owner: { ...owner },
          firstDevelopmentCaseId: boot.context.firstDevelopmentCaseId,
          report: boot.context.report,
          files: { ...boot.context.files },
        },
        readSnapshot: () => ledger.getStageReportSnapshot('preflight', profile),
      });
      const snapshot = ledger.getStageReportSnapshot('preflight', profile);
      const verified = verifier.verify({ stage: 'preflight', profile, snapshot });
      expect(verified.receipt.jsonSha256).toBe(published.receipt.jsonSha256);
      expect(verified.receipt.markdownSha256).toBe(published.receipt.markdownSha256);
      const admitted = ledger.admitStageReportReceipt('preflight', profile);
      expect(admitted.jsonSha256).toBe(published.receipt.jsonSha256);
      const jsonPath = resolve(boot.ledgerRoot, 'reports', `preflight-${profile.toLowerCase()}.json`);
      expect(existsSync(jsonPath)).toBe(true);
      expect(readFileSync(jsonPath, 'utf8')).toContain(published.receipt.runId);
    }
  });
});

describe('illustrative future cases', () => {
  it('existing-core regression shared preflight runtime terminals publish admit GREEN', async () => {
    const f = await makeRuntimeEvidenceNativeFixture(ownedRoots, { mode: 'existing-core' });
    await f.finishPreflight();
    const lowSnapshot = f.ledger.getStageReportSnapshot('preflight', 'LOW');
    const mediumSnapshot = f.ledger.getStageReportSnapshot('preflight', 'MEDIUM');
    expect(lowSnapshot.images).toHaveLength(1);
    expect(mediumSnapshot.images).toHaveLength(1);
    const first = f.ledger.bindRuntimeStageReport('preflight', 'LOW');
    f.ledger.bindRuntimeStageReport('preflight', 'MEDIUM');
    const before = readFileSync(resolve(f.root, 'ledger.json'), 'utf8');
    const again = f.ledger.bindRuntimeStageReport('preflight', 'LOW');
    expect(again).toEqual(first);
    expect(readFileSync(resolve(f.root, 'ledger.json'), 'utf8')).toBe(before);
  });
  it('blocks after failed dir-fsync retaining lock with dedicated witness', async () => {
    const f = await makeRuntimeEvidenceNativeFixture(ownedRoots);
    f.completeTokenPrerequisites();
    f.faults.failNextLedgerDirFsync = true;
    expect(() => f.ledger.startRuntimeAttempt({ ...f.key })).toThrow(CalibrationFatalError);
    expect(f.trace.join('|')).toContain('ledger:dir-fsync:fault');
    expect(existsSync(resolve(f.root, 'lock.json'))).toBe(true);
    expect(() => f.ledger.releaseLock({ ...f.owner })).toThrow(CalibrationFatalError);
  });

  it('revalidates bound LOW receipt after MEDIUM without rewriting bytes', async () => {
    const f = await makeRuntimeEvidenceNativeFixture(ownedRoots);
    await f.finishPreflight();
    const first = f.ledger.bindRuntimeStageReport('preflight', 'LOW');
    f.ledger.bindRuntimeStageReport('preflight', 'MEDIUM');
    const before = readFileSync(resolve(f.root, 'ledger.json'), 'utf8');
    const again = f.ledger.bindRuntimeStageReport('preflight', 'LOW');
    expect(again).toEqual(first);
    expect(readFileSync(resolve(f.root, 'ledger.json'), 'utf8')).toBe(before);
  });
});

// Persistence tier: deliberate faults are DISARMED throughout acquisition and
// token prerequisites. Only the next runtime publication may trip a fault.
import {
  loadPrepareNativeLedgerFactoryTask4,
} from './calibration-runtime-evidence-fixtures';
import type { RuntimeEvidenceFileStoreOverrides } from './calibration-runtime-evidence-fixtures';
import { createRuntimeEvidenceCalibrationLedger } from '../../src/nutrition-eval/calibration';
import { createCalibrationBootstrapReadDeps } from '../../src/nutrition-eval/calibration-bootstrap';

type PersistenceBoot = Awaited<ReturnType<typeof makeExistingNativeBootFixtureTask4>>;
type PersistenceFault = 'short' | 'zero' | 'negative' | 'overlarge' | 'fractional' | 'nan' | 'infinity'
  | 'write-throw' | 'fsync' | 'close-before' | 'close-after' | 'rename-before' | 'rename-after'
  | 'dir-before' | 'dir-after';
type FdWitness = { fd: number; dev: number; ino: number; start: number; end: number };

function makePersistenceHooks() {
  const trace: string[] = [];
  const writes: Array<FdWitness & { count: number }> = [];
  const syncs: FdWitness[] = [];
  const closes: FdWitness[] = [];
  const renames: Array<{ to: string; start: number; end: number }> = [];
  const dirs: Array<{ path: string; start: number; end: number }> = [];
  let fault: PersistenceFault | undefined;
  let fired = 0;
  let original: { fd: number; dev: number; ino: number } | undefined;
  const hit = (kind: PersistenceFault): boolean => {
    if (fault !== kind) return false;
    fault = undefined;
    fired += 1;
    trace.push(`FAULT:${kind}`);
    return true;
  };
  const injected = () => new Error('private-native-hook-error-must-not-escape');
  const capture = (fd: number) => {
    const st = fstatSyncTest(fd);
    if (fault !== undefined && original === undefined) original = { fd, dev: st.dev, ino: st.ino };
    return { fd, dev: st.dev, ino: st.ino };
  };
  const overrides: RuntimeEvidenceFileStoreOverrides = {
    fdWriteSync(fd, buffer, offset, remaining) {
      const identity = capture(fd);
      trace.push('write:start');
      const start = trace.length - 1;
      if (hit('write-throw')) throw injected();
      for (const [kind, count] of [
        ['zero', 0], ['negative', -1], ['overlarge', remaining + 1],
        ['fractional', 0.5], ['nan', Number.NaN], ['infinity', Number.POSITIVE_INFINITY],
      ] as const) {
        if (hit(kind)) return count;
      }
      const count = writeSyncTest(fd, buffer, offset, fault === 'short' ? Math.min(7, remaining) : remaining);
      trace.push('write:complete');
      writes.push({ ...identity, start, end: trace.length - 1, count });
      return count;
    },
    fdFsyncSync(fd) {
      const identity = capture(fd);
      trace.push('fsync:start');
      const start = trace.length - 1;
      if (hit('fsync')) throw injected();
      fsyncSyncTest(fd);
      trace.push('fsync:complete');
      syncs.push({ ...identity, start, end: trace.length - 1 });
    },
    fdCloseSync(fd) {
      const identity = capture(fd);
      trace.push('close:start');
      const start = trace.length - 1;
      if (hit('close-before')) throw injected();
      closeSyncTest(fd);
      trace.push('close:complete');
      closes.push({ ...identity, start, end: trace.length - 1 });
      if (hit('close-after')) throw injected();
    },
    renameSync(from, to) {
      trace.push('rename:start');
      const start = trace.length - 1;
      if (basename(to) === 'ledger.json' && hit('rename-before')) throw injected();
      renameSyncTest(from, to);
      trace.push('rename:complete');
      renames.push({ to, start, end: trace.length - 1 });
      if (basename(to) === 'ledger.json' && hit('rename-after')) throw injected();
    },
    fsyncDirSync(path) {
      trace.push('dir:start');
      const start = trace.length - 1;
      if (hit('dir-before')) throw injected();
      const fd = openSyncTest(path, constantsTest.O_RDONLY | constantsTest.O_DIRECTORY | constantsTest.O_NOFOLLOW);
      try { fsyncSyncTest(fd); } finally { closeSyncTest(fd); }
      trace.push('dir:complete');
      dirs.push({ path, start, end: trace.length - 1 });
      if (hit('dir-after')) throw injected();
    },
  };
  return {
    overrides, trace, writes, syncs, closes, renames, dirs,
    get fired() { return fired; },
    get original() { return original; },
    arm(kind: PersistenceFault) {
      fault = kind;
      fired = 0;
      original = undefined;
      trace.length = writes.length = syncs.length = closes.length = renames.length = dirs.length = 0;
    },
    cleanupLeakedDescriptor() {
      // Only after assertions, and only this operation's still-identical fd.
      if (original === undefined) return;
      try {
        const st = fstatSyncTest(original.fd);
        if (st.dev === original.dev && st.ino === original.ino) closeSyncTest(original.fd);
      } catch { /* already closed; never close an unrelated reused descriptor */ }
    },
  };
}

async function openPersistenceLedger(mode: 'future' | 'existing-core', hooks: ReturnType<typeof makePersistenceHooks>) {
  const boot: PersistenceBoot = await makeExistingNativeBootFixtureTask4(ownedRoots);
  const context = boot.context;
  let ledger;
  if (mode === 'future') {
    const prepare = await loadPrepareNativeLedgerFactoryTask4();
    ledger = await prepare({ context }, hooks.overrides);
  } else {
    const readDeps = createCalibrationBootstrapReadDeps(context.baseDir);
    const verifier = await prepareCalibrationStageReportArtifactVerifier(context);
    ledger = createRuntimeEvidenceCalibrationLedger(
      createFileCalibrationLedgerDeps(context.baseDir, hooks.overrides), context.identity,
      (profile) => deriveCanonicalAllowedKeys({ ...context.files }, profile),
      { getReportOutcomePlan: (profile) => deriveCanonicalReportOutcomePlan({ ...context.files }, profile) },
      { verifyStageReportArtifacts: (params) => verifier.verify(params) },
      { initialOwner: context.owner, plans: boot.plans, readCurrentGitState: () => readDeps.readGitState() },
    );
  }
  ledger.acquireLock({ ...context.owner });
  const token = { kind: 'token_count' as const, stage: 'preflight' as const, caseId: boot.key.caseId, model: context.identity.model };
  ledger.reserveTokenCount(token);
  ledger.completeTokenCount(token, 1200);
  expect(hooks.fired).toBe(0);
  return { boot, ledger };
}

function expectStaticPersistenceFatal(error: unknown): void {
  expect(error).toBeInstanceOf(CalibrationFatalError);
  expect(Object.hasOwn(error as object, 'cause')).toBe(false);
  expect((error as Error).message).not.toContain('private-native-hook-error');
}

function expectOriginalFdClosed(hooks: ReturnType<typeof makePersistenceHooks>): void {
  expect(hooks.original).toBeDefined();
  let code: unknown;
  try { fstatSyncTest(hooks.original!.fd); } catch (error) { code = (error as NodeJS.ErrnoException).code; }
  expect(code).toBe('EBADF');
}

async function exerciseShortWrites(mode: 'future' | 'existing-core'): Promise<void> {
  const hooks = makePersistenceHooks();
  try {
    const { boot, ledger } = await openPersistenceLedger(mode, hooks);
    const path = resolve(boot.ledgerRoot, 'ledger.json');
    const before = JSON.parse(readFileSync(path, 'utf8')) as unknown[];
    hooks.arm('short');
    expect(ledger.startRuntimeAttempt({ ...boot.key })).toEqual({ key: { ...boot.key }, attempt: 1 });
    const bytes = readFileSync(path, 'utf8');
    const after = JSON.parse(bytes) as Array<Record<string, unknown>>;
    expect(after.slice(0, -1)).toEqual(before);
    expect(after).toHaveLength(before.length + 1);
    expect(after.at(-1)).toMatchObject({ type: 'runtime_attempt_started', version: 1, sequence: 1, key: boot.key, attempt: 1, owner: boot.context.owner });
    expect(hooks.writes.length).toBeGreaterThan(1);
    expect(hooks.writes.every((w) => w.count > 0 && w.count <= 7)).toBe(true);
    expect(hooks.writes.reduce((sum, w) => sum + w.count, 0)).toBe(Buffer.byteLength(bytes));
    expect(hooks.syncs).toHaveLength(1);
    expect(hooks.closes).toHaveLength(1);
    expect(hooks.renames).toHaveLength(1);
    expect(hooks.dirs).toHaveLength(1);
    const first = hooks.writes[0]!;
    for (const record of [...hooks.writes, ...hooks.syncs, ...hooks.closes]) {
      expect([record.fd, record.dev, record.ino]).toEqual([first.fd, first.dev, first.ino]);
      expect(record.start).toBeLessThan(record.end);
    }
    expect(hooks.writes.at(-1)!.end).toBeLessThan(hooks.syncs[0]!.start);
    expect(hooks.syncs[0]!.end).toBeLessThan(hooks.closes[0]!.start);
    expect(hooks.closes[0]!.end).toBeLessThan(hooks.renames[0]!.start);
    expect(hooks.renames[0]!.to).toBe(path);
    expect(hooks.renames[0]!.end).toBeLessThan(hooks.dirs[0]!.start);
    expect(resolve(hooks.dirs[0]!.path)).toBe(boot.ledgerRoot);
    expectOriginalFdClosed(hooks);
  } finally { hooks.cleanupLeakedDescriptor(); }
}

async function exercisePersistenceFault(mode: 'future' | 'existing-core', kind: Exclude<PersistenceFault, 'short'>): Promise<void> {
  const hooks = makePersistenceHooks();
  try {
    const { boot, ledger } = await openPersistenceLedger(mode, hooks);
    const path = resolve(boot.ledgerRoot, 'ledger.json');
    const lockPath = resolve(boot.ledgerRoot, 'lock.json');
    const before = readFileSync(path, 'utf8');
    const lockBytes = readFileSync(lockPath, 'utf8');
    const lockStat = lstatSync(lockPath);
    hooks.arm(kind);
    let returned: unknown;
    let error: unknown;
    let guardedEffects = 0;
    try { returned = ledger.startRuntimeAttempt({ ...boot.key }); guardedEffects += 1; } catch (caught) { error = caught; }
    expectStaticPersistenceFatal(error);
    expect(returned).toBeUndefined();
    expect(guardedEffects).toBe(0);
    expect(hooks.fired).toBe(1);
    expect(hooks.trace.filter((entry) => entry === `FAULT:${kind}`)).toHaveLength(1);
    expectOriginalFdClosed(hooks);
    const published = kind === 'rename-after' || kind === 'dir-before' || kind === 'dir-after';
    const after = readFileSync(path, 'utf8');
    if (published) {
      const rows = JSON.parse(after) as Array<Record<string, unknown>>;
      expect(rows.slice(0, -1)).toEqual(JSON.parse(before));
      expect(rows.at(-1)).toMatchObject({ type: 'runtime_attempt_started', key: boot.key, attempt: 1, sequence: 1 });
      expect(hooks.renames).toHaveLength(1);
      expect(hooks.renames[0]!.to).toBe(path);
      if (kind.startsWith('dir-')) {
        expect(hooks.trace.indexOf('rename:complete')).toBeLessThan(hooks.trace.indexOf(`FAULT:${kind}`));
      }
    } else {
      expect(after).toBe(before);
      expect(hooks.renames).toHaveLength(0);
    }
    const traceSize = hooks.trace.length;
    expect(() => ledger.startRuntimeAttempt({ ...boot.key })).toThrow(CalibrationFatalError);
    expect(() => ledger.releaseLock({ ...boot.context.owner })).toThrow(CalibrationFatalError);
    expect(hooks.trace).toHaveLength(traceSize);
    expect(readFileSync(path, 'utf8')).toBe(after);
    expect(readFileSync(lockPath, 'utf8')).toBe(lockBytes);
    const retained = lstatSync(lockPath);
    expect([retained.dev, retained.ino]).toEqual([lockStat.dev, lockStat.ino]);
  } finally { hooks.cleanupLeakedDescriptor(); }
}

describe('persistence tier existing-source oracle controls', () => {
  // A truncated short-write loop or close-before-fsync must fail this SAME driver.
  it('physically loops short writes before fsync/close/rename/parent sync', () => exerciseShortWrites('existing-core'));
  // These fault semantics already hold in old native storage + the real Task3
  // core. They validate readiness, one-shot targeting, disk bytes and poison;
  // they do NOT establish the absent guarded factory's authority.
  it.each(['zero', 'write-throw', 'fsync', 'close-after', 'rename-before', 'rename-after', 'dir-before', 'dir-after'] as const)(
    'reaches %s only after readiness and rejects permission', (kind) => exercisePersistenceFault('existing-core', kind),
  );
});

describe('guarded native persistence requirements', () => {
  it('publishes complete short-write bytes in strict descriptor order', () => exerciseShortWrites('future'));
  // A permissive clamp, leaked descriptor, premature success or rollback of a
  // published uncertain event must fail the corresponding case below.
  it.each(['zero', 'negative', 'overlarge', 'fractional', 'nan', 'infinity', 'write-throw', 'fsync',
    'close-before', 'close-after', 'rename-before', 'rename-after', 'dir-before', 'dir-after'] as const)(
    'fails closed on %s without granting permission or losing the lock', (kind) => exercisePersistenceFault('future', kind),
  );
});

// Closed native preparation and real-source authority. Each loader is OUTSIDE
// rejection assertions: absent source cannot masquerade as correct rejection.
import { execFileSync as miniGitExec } from 'node:child_process';
import { writeFileSync as writeOwnedFile, unlinkSync as unlinkOwnedFile } from 'node:fs';
import { loadRuntimeEvidenceFileLedgerDepsFactoryTask4 } from './calibration-runtime-evidence-fixtures';

function miniGitCommand(boot: PersistenceBoot, args: string[]): string {
  return miniGitExec('git', args, { cwd: boot.context.baseDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

describe('closed native preparation authority', () => {
  // Any eager acquisition, reservation, or client call makes this fail.
  it('prepares without lock or ledger publication until explicit acquire', async () => {
    const boot = await makeExistingNativeBootFixtureTask4(ownedRoots);
    const prepare = await loadPrepareNativeLedgerFactoryTask4();
    const hooks = makePersistenceHooks();
    const ledger = await prepare({ context: boot.context }, hooks.overrides);
    expect(hooks.trace).toEqual([]);
    expect(existsSync(resolve(boot.ledgerRoot, 'lock.json'))).toBe(false);
    expect(existsSync(resolve(boot.ledgerRoot, 'ledger.json'))).toBe(false);
    ledger.acquireLock({ ...boot.context.owner });
    expect(JSON.parse(readFileSync(resolve(boot.ledgerRoot, 'ledger.json'), 'utf8'))).toMatchObject([
      { type: 'protocol_identity', runtimeEvidenceVersion: 1, owner: boot.context.owner },
    ]);
  });

  it.each(['verifyStageReportArtifacts', 'readCurrentGitState', 'plans', 'root', 'receipt', 'callback'])(
    'rejects caller-supplied %s before any publication', async (name) => {
      const boot = await makeExistingNativeBootFixtureTask4(ownedRoots);
      const prepare = await loadPrepareNativeLedgerFactoryTask4();
      const hooks = makePersistenceHooks();
      let effects = 0;
      await expect(prepare({ context: boot.context, [name]: () => { effects += 1; } }, hooks.overrides))
        .rejects.toBeInstanceOf(CalibrationFatalError);
      expect(effects).toBe(0);
      expect(hooks.trace).toEqual([]);
      expect(existsSync(resolve(boot.ledgerRoot, 'lock.json'))).toBe(false);
      expect(existsSync(resolve(boot.ledgerRoot, 'ledger.json'))).toBe(false);
    },
  );

  it.each(['writeExclusiveSync', 'fsyncFileSync', 'unknownHook'])(
    'rejects high-level or unknown override %s in BOTH native APIs', async (name) => {
      const boot = await makeExistingNativeBootFixtureTask4(ownedRoots);
      const prepare = await loadPrepareNativeLedgerFactoryTask4();
      const store = await loadRuntimeEvidenceFileLedgerDepsFactoryTask4();
      let effects = 0;
      const overrides = { [name]: () => { effects += 1; } } as unknown as RuntimeEvidenceFileStoreOverrides;
      expect(() => store(boot.context.baseDir, { ...boot.context.owner }, overrides)).toThrow(CalibrationFatalError);
      await expect(prepare({ context: boot.context }, overrides)).rejects.toBeInstanceOf(CalibrationFatalError);
      expect(effects).toBe(0);
      expect(existsSync(resolve(boot.ledgerRoot, 'lock.json'))).toBe(false);
      expect(existsSync(resolve(boot.ledgerRoot, 'ledger.json'))).toBe(false);
    },
  );

  it.each(['extra', 'invalid-pid', 'accessor'])('guarded store rejects %s owner without invoking getters', async (kind) => {
    const boot = await makeExistingNativeBootFixtureTask4(ownedRoots);
    const store = await loadRuntimeEvidenceFileLedgerDepsFactoryTask4();
    let getterCalls = 0;
    const owner: Record<string, unknown> = { ...boot.context.owner };
    if (kind === 'extra') owner.unexpected = 1;
    if (kind === 'invalid-pid') owner.pid = 0;
    if (kind === 'accessor') Object.defineProperty(owner, 'pid', { enumerable: true, get() { getterCalls += 1; return boot.context.owner.pid; } });
    expect(() => store(boot.context.baseDir, owner as unknown as CalibrationOwner)).toThrow(CalibrationFatalError);
    expect(getterCalls).toBe(0);
    expect(existsSync(resolve(boot.ledgerRoot, 'lock.json'))).toBe(false);
    expect(existsSync(resolve(boot.ledgerRoot, 'ledger.json'))).toBe(false);
  });

  it('captures context before suspension rather than reading caller aliases later', async () => {
    const boot = await makeExistingNativeBootFixtureTask4(ownedRoots);
    const prepare = await loadPrepareNativeLedgerFactoryTask4();
    const context = structuredClone(boot.context);
    const params: { context: unknown } = { context };
    const pending = prepare(params);
    // These are newly owned MUTABLE input copies, never production outputs.
    (context.identity as { model: string }).model = 'caller-mutated-model';
    (context.owner as { pid: number }).pid = 0;
    (context.files as Record<string, string>)['calibration-manifest'] = '{}';
    params.context = null;
    const ledger = await pending;
    ledger.acquireLock({ ...boot.context.owner });
    ledger.assertIdentity({ ...boot.context.identity });
    const key = { kind: 'token_count' as const, stage: 'preflight' as const, caseId: boot.key.caseId, model: boot.context.identity.model };
    ledger.reserveTokenCount(key);
    ledger.completeTokenCount(key, 1200);
    expect(ledger.startRuntimeAttempt({ ...boot.key })).toEqual({ key: boot.key, attempt: 1 });
    expect(JSON.parse(readFileSync(resolve(boot.ledgerRoot, 'lock.json'), 'utf8'))).toEqual(boot.context.owner);
  });

  it.each(['counts', 'runtime-snapshot', 'report-snapshot'])('constructor replay grants no %s authority before acquisition', async (read) => {
    const hooks = makePersistenceHooks();
    const { boot } = await openPersistenceLedger('future', hooks);
    const prepare = await loadPrepareNativeLedgerFactoryTask4();
    const before = readFileSync(resolve(boot.ledgerRoot, 'ledger.json'), 'utf8');
    const fresh = await prepare({ context: boot.context });
    const getter = () => {
      if (read === 'counts') return fresh.getCounts();
      if (read === 'runtime-snapshot') return fresh.getRuntimeEvidenceSnapshot();
      return fresh.getStageReportSnapshot('preflight', 'LOW');
    };
    expect(getter).toThrow(CalibrationFatalError);
    expect(readFileSync(resolve(boot.ledgerRoot, 'ledger.json'), 'utf8')).toBe(before);
    expect(existsSync(resolve(boot.ledgerRoot, 'lock.json'))).toBe(true);
  });
});

async function exerciseNativeGitAuthority(mode: 'existing-core' | 'future', change: 'docs' | 'dirty-functions' | 'committed-functions' | 'pinned-asset') {
  const hooks = makePersistenceHooks();
  const { boot, ledger } = await openPersistenceLedger(mode, hooks);
  const root = boot.context.baseDir;
  const path = resolve(boot.ledgerRoot, 'ledger.json');
  const lock = resolve(boot.ledgerRoot, 'lock.json');
  const before = readFileSync(path, 'utf8');
  const lockBytes = readFileSync(lock, 'utf8');
  const traceLength = hooks.trace.length;
  if (change === 'docs') {
    writeOwnedFile(resolve(root, 'fixture-notes.md'), 'docs-only movement\n');
    miniGitCommand(boot, ['add', 'fixture-notes.md']);
    miniGitCommand(boot, ['commit', '-m', 'Update fixture notes']);
    expect(miniGitCommand(boot, ['rev-parse', 'HEAD'])).not.toBe(boot.context.identity.implementationCommit);
    expect(miniGitCommand(boot, ['log', '-1', '--format=%H', 'HEAD', '--', 'functions'])).toBe(boot.context.identity.implementationCommit);
    ledger.startRuntimeAttempt({ ...boot.key });
    const rows = JSON.parse(readFileSync(path, 'utf8')) as Array<Record<string, unknown>>;
    expect(rows.slice(0, -1)).toEqual(JSON.parse(before));
    expect(rows.at(-1)).toMatchObject({ type: 'runtime_attempt_started', sequence: 1, key: boot.key });
    expect((rows[0] as { identity: unknown }).identity).toEqual(boot.context.identity);
    return;
  }
  const drift = resolve(root, 'functions', 'fixture-drift.ts');
  if (change === 'pinned-asset') {
    const asset = resolve(root, 'functions/eval/nutrition/calibration-manifest.json');
    writeOwnedFile(asset, readFileSync(asset, 'utf8') + '\n');
  } else {
    writeOwnedFile(drift, 'export const fixtureDrift = true;\n');
    if (change === 'committed-functions') {
      miniGitCommand(boot, ['add', 'functions/fixture-drift.ts']);
      miniGitCommand(boot, ['commit', '-m', 'Change fixture source']);
    }
  }
  let returned: unknown;
  let error: unknown;
  try { returned = ledger.startRuntimeAttempt({ ...boot.key }); } catch (caught) { error = caught; }
  expectStaticPersistenceFatal(error);
  expect(returned).toBeUndefined();
  expect(hooks.trace).toHaveLength(traceLength);
  expect(readFileSync(path, 'utf8')).toBe(before);
  expect(readFileSync(lock, 'utf8')).toBe(lockBytes);
  if (change === 'dirty-functions') {
    unlinkOwnedFile(drift);
    expect(createCalibrationBootstrapReadDeps(root).readGitState().dirtyPaths).toEqual([]);
  }
  expect(() => ledger.getCounts()).toThrow(CalibrationFatalError);
  expect(() => ledger.releaseLock({ ...boot.context.owner })).toThrow(CalibrationFatalError);
  expect(readFileSync(lock, 'utf8')).toBe(lockBytes);
}

describe('real miniature Git authority controls', () => {
  // Snapshot-only or HEAD-equality checks must fail these SAME real Git cases.
  it.each(['docs', 'dirty-functions', 'committed-functions', 'pinned-asset'] as const)(
    'existing core enforces %s source policy', (change) => exerciseNativeGitAuthority('existing-core', change),
  );
  it.each(['docs', 'dirty-functions', 'committed-functions', 'pinned-asset'] as const)(
    'native composition enforces %s source policy', (change) => exerciseNativeGitAuthority('future', change),
  );
});

import { symlinkSync as linkOwnedPath, mkdirSync as makeOwnedDirectory } from 'node:fs';

describe('native lock identity and private path requirements', () => {
  for (const phase of ['before-effect', 'after-close', 'after-dir-sync'] as const) {
    it.each(['metadata', 'inode'] as const)('retains a replaced %s lock at ' + phase, async (replacement) => {
      const hooks = makePersistenceHooks();
      let armed = false;
      let lockPath = '';
      let changed = false;
      let foreignBytes = '';
      const mutate = () => {
        if (!armed) return;
        armed = false;
        changed = true;
        foreignBytes = JSON.stringify(replacement === 'metadata'
          ? { ...expectedOwner, pid: expectedOwner!.pid + 1000 }
          : expectedOwner);
        if (replacement === 'inode') unlinkOwnedFile(lockPath);
        writeOwnedFile(lockPath, foreignBytes, { flag: replacement === 'inode' ? 'wx' : 'w', mode: 0o600 });
      };
      const close = hooks.overrides.fdCloseSync!;
      hooks.overrides.fdCloseSync = (fd) => { close(fd); if (phase === 'after-close') mutate(); };
      const syncDir = hooks.overrides.fsyncDirSync!;
      hooks.overrides.fsyncDirSync = (dir) => { syncDir(dir); if (phase === 'after-dir-sync') mutate(); };
      const { boot, ledger } = await openPersistenceLedger('future', hooks);
      lockPath = resolve(boot.ledgerRoot, 'lock.json');
      const expectedOwner = { ...boot.context.owner };
      const ledgerPath = resolve(boot.ledgerRoot, 'ledger.json');
      const before = readFileSync(ledgerPath, 'utf8');
      // Keep the old inode alive: same-owner replacement cannot be hidden by
      // immediate inode reuse after unlink.
      const held = openSyncTest(lockPath, constantsTest.O_RDONLY | constantsTest.O_NOFOLLOW);
      const old = fstatSyncTest(held);
      try {
        armed = true;
        if (phase === 'before-effect') mutate();
        let error: unknown;
        let effects = 0;
        try { ledger.startRuntimeAttempt({ ...boot.key }); effects += 1; } catch (caught) { error = caught; }
        expectStaticPersistenceFatal(error);
        expect(effects).toBe(0);
        expect(changed).toBe(true);
        const foreign = lstatSync(lockPath);
        if (replacement === 'inode') expect([foreign.dev, foreign.ino]).not.toEqual([old.dev, old.ino]);
        else expect([foreign.dev, foreign.ino]).toEqual([old.dev, old.ino]);
        expect(readFileSync(lockPath, 'utf8')).toBe(foreignBytes);
        const after = readFileSync(ledgerPath, 'utf8');
        if (phase !== 'after-dir-sync') expect(after).toBe(before);
        else {
          const rows = JSON.parse(after) as Array<Record<string, unknown>>;
          expect(rows.slice(0, -1)).toEqual(JSON.parse(before));
          expect(rows.at(-1)).toMatchObject({ type: 'runtime_attempt_started', sequence: 1, key: boot.key });
        }
        expect(() => ledger.startRuntimeAttempt({ ...boot.key })).toThrow(CalibrationFatalError);
        expect(() => ledger.releaseLock({ ...boot.context.owner })).toThrow(CalibrationFatalError);
        expect(readFileSync(lockPath, 'utf8')).toBe(foreignBytes);
        expect(lstatSync(lockPath).ino).toBe(foreign.ino);
      } finally { closeSyncTest(held); }
    });
  }

  for (const leaf of ['ledger.json', 'journal.json', 'lock.json'] as const) {
    it.each(['symlink', 'directory'] as const)('rejects a ' + leaf + ' %s without following or deleting its target', async (kind) => {
      const hooks = makePersistenceHooks();
      const { boot, ledger } = await openPersistenceLedger('future', hooks);
      const path = resolve(boot.ledgerRoot, leaf);
      const saved = resolve(boot.ledgerRoot, leaf + '.test-preserved');
      const bytes = existsSync(path) ? readFileSync(path, 'utf8') : '[]';
      if (existsSync(path)) renameSyncTest(path, saved);
      else writeOwnedFile(saved, bytes, { flag: 'wx', mode: 0o600 });
      if (kind === 'symlink') linkOwnedPath(saved, path);
      else makeOwnedDirectory(path);
      const beforeTrace = hooks.trace.length;
      expect(() => ledger.startRuntimeAttempt({ ...boot.key })).toThrow(CalibrationFatalError);
      expect(hooks.trace).toHaveLength(beforeTrace);
      expect(readFileSync(saved, 'utf8')).toBe(bytes);
      expect(() => ledger.releaseLock({ ...boot.context.owner })).toThrow(CalibrationFatalError);
      expect(existsSync(resolve(boot.ledgerRoot, 'lock.json'))).toBe(true);
      expect(kind === 'symlink' ? lstatSync(path).isSymbolicLink() : lstatSync(path).isDirectory()).toBe(true);
    });
  }

  it('rejects a canonical-directory symlink without modifying the preserved real directory', async () => {
    const hooks = makePersistenceHooks();
    const { boot, ledger } = await openPersistenceLedger('future', hooks);
    const saved = boot.ledgerRoot + '.test-preserved';
    const before = readFileSync(resolve(boot.ledgerRoot, 'ledger.json'), 'utf8');
    renameSyncTest(boot.ledgerRoot, saved);
    linkOwnedPath(saved, boot.ledgerRoot, 'dir');
    const traceLength = hooks.trace.length;
    expect(() => ledger.startRuntimeAttempt({ ...boot.key })).toThrow(CalibrationFatalError);
    expect(hooks.trace).toHaveLength(traceLength);
    expect(readFileSync(resolve(saved, 'ledger.json'), 'utf8')).toBe(before);
    expect(() => ledger.releaseLock({ ...boot.context.owner })).toThrow(CalibrationFatalError);
    expect(existsSync(resolve(saved, 'lock.json'))).toBe(true);
    expect(lstatSync(boot.ledgerRoot).isSymbolicLink()).toBe(true);
  });

  it('rejects same-byte final-ledger inode substitution after physical directory fsync', async () => {
    const hooks = makePersistenceHooks();
    const syncDir = hooks.overrides.fsyncDirSync!;
    let armed = false;
    let path = '';
    let held: number | undefined;
    let oldIno: number | undefined;
    hooks.overrides.fsyncDirSync = (dir) => {
      syncDir(dir);
      if (!armed) return;
      armed = false;
      held = openSyncTest(path, constantsTest.O_RDONLY | constantsTest.O_NOFOLLOW);
      oldIno = fstatSyncTest(held).ino;
      const temp = path + '.test-replacement';
      writeOwnedFile(temp, readFileSync(path), { flag: 'wx', mode: 0o600 });
      renameSyncTest(temp, path);
    };
    const { boot, ledger } = await openPersistenceLedger('future', hooks);
    path = resolve(boot.ledgerRoot, 'ledger.json');
    try {
      armed = true;
      expect(() => ledger.startRuntimeAttempt({ ...boot.key })).toThrow(CalibrationFatalError);
      expect(oldIno).toBeDefined();
      expect(lstatSync(path).ino).not.toBe(oldIno);
      const rows = JSON.parse(readFileSync(path, 'utf8')) as Array<Record<string, unknown>>;
      expect(rows.at(-1)).toMatchObject({ type: 'runtime_attempt_started', sequence: 1, key: boot.key });
      expect(() => ledger.releaseLock({ ...boot.context.owner })).toThrow(CalibrationFatalError);
      expect(existsSync(resolve(boot.ledgerRoot, 'lock.json'))).toBe(true);
    } finally { if (held !== undefined) closeSyncTest(held); }
  });
});

async function exerciseCloseDescriptorReuse(mode: 'existing-core' | 'future') {
  const hooks = makePersistenceHooks();
  const normalClose = hooks.overrides.fdCloseSync!;
  let armed = false;
  let sentinelPath = '';
  let sentinel: { fd: number; dev: number; ino: number } | undefined;
  let reached = false;
  hooks.overrides.fdCloseSync = (fd) => {
    if (!armed) { normalClose(fd); return; }
    armed = false;
    closeSyncTest(fd);
    const next = openSyncTest(sentinelPath, 'wx', 0o600);
    const st = fstatSyncTest(next);
    sentinel = { fd: next, dev: st.dev, ino: st.ino };
    // POSIX open returns the lowest available descriptor. This synchronous
    // close/open pair deliberately occupies the original number.
    expect(next).toBe(fd);
    reached = true;
    throw new Error('private-native-hook-error-close-after-reuse');
  };
  const { boot, ledger } = await openPersistenceLedger(mode, hooks);
  sentinelPath = resolve(boot.context.baseDir, 'owned-fd-sentinel');
  const before = readFileSync(resolve(boot.ledgerRoot, 'ledger.json'), 'utf8');
  try {
    armed = true;
    let error: unknown;
    try { ledger.startRuntimeAttempt({ ...boot.key }); } catch (caught) { error = caught; }
    expectStaticPersistenceFatal(error);
    expect(reached).toBe(true);
    expect(sentinel).toBeDefined();
    const st = fstatSyncTest(sentinel!.fd);
    expect([st.dev, st.ino]).toEqual([sentinel!.dev, sentinel!.ino]);
    expect(readFileSync(resolve(boot.ledgerRoot, 'ledger.json'), 'utf8')).toBe(before);
    expect(() => ledger.releaseLock({ ...boot.context.owner })).toThrow(CalibrationFatalError);
    expect(existsSync(resolve(boot.ledgerRoot, 'lock.json'))).toBe(true);
  } finally {
    if (sentinel !== undefined) {
      try {
        const st = fstatSyncTest(sentinel.fd);
        if (st.dev === sentinel.dev && st.ino === sentinel.ino) closeSyncTest(sentinel.fd);
      } catch { /* failed assertion may reveal an already-closed sentinel */ }
    }
  }
}

it('existing native close-after-error control leaves a reused foreign descriptor open', () => exerciseCloseDescriptorReuse('existing-core'));
it('guarded native close cleanup never closes a reused foreign descriptor', () => exerciseCloseDescriptorReuse('future'));

it('existing-core restart verifies historical receipts under the new native owner without relabelling history', async () => {
  const f = await makeRuntimeEvidenceNativeFixture(ownedRoots, { mode: 'existing-core' });
  await f.finishPreflight();
  const path = resolve(f.root, 'ledger.json');
  const before = JSON.parse(readFileSync(path, 'utf8')) as Array<{
    type: string;
    receipt?: { stage: string; profile: string };
  }>;
  const receipt = before.find((row) => row.type === 'artifact_receipt_admitted'
    && row.receipt?.stage === 'preflight' && row.receipt.profile === 'LOW')?.receipt;
  expect(receipt).toBeDefined();
  const next: CalibrationOwner = {
    ...f.owner,
    pid: f.owner.pid + 90000,
    startTicks: f.owner.startTicks + 20,
    acquiredAt: new Date(Date.parse(f.owner.acquiredAt) + 1000).toISOString(),
  };
  // Fixture's declared procStatReader simulates the old owner as dead; no
  // actual process is stopped. restart constructs a fresh ledger instance.
  const fresh = await f.restart(next);
  fresh.recoverAfterCrash();
  const bound = fresh.bindRuntimeStageReport('preflight', 'LOW');
  expect(bound.receipt).toEqual(receipt);
  expect(bound.owner).toEqual(next);
  const after = JSON.parse(readFileSync(path, 'utf8')) as Array<Record<string, unknown>>;
  expect(after.slice(0, before.length)).toEqual(before);
  expect(after[0]?.owner).toEqual(f.owner);
});

it('existing-core explicit token readiness is idempotent around the same shared preflight driver', async () => {
  const f = await makeRuntimeEvidenceNativeFixture(ownedRoots, { mode: 'existing-core' });
  f.completeTokenPrerequisites();
  expect(f.ledger.getCounts()).toEqual({ tokenCountReserved: 1, imageReserved: 0 });
  await f.finishPreflight();
  f.completeTokenPrerequisites();
  expect(f.ledger.getCounts()).toEqual({ tokenCountReserved: 1, imageReserved: 2 });
  expect(f.ledger.getRuntimeEvidenceSnapshot().events.filter((e) => e.type === 'runtime_report_bound')).toHaveLength(0);
  expect(f.ledger.bindRuntimeStageReport('preflight', 'LOW').type).toBe('runtime_report_bound');
  expect(f.ledger.bindRuntimeStageReport('preflight', 'MEDIUM').type).toBe('runtime_report_bound');
});

it('existing-core token helper observes completion by preflight before its local cache was set', async () => {
  const f = await makeRuntimeEvidenceNativeFixture(ownedRoots, { mode: 'existing-core' });
  await f.finishPreflight();
  const before = readFileSync(resolve(f.root, 'ledger.json'), 'utf8');
  f.completeTokenPrerequisites();
  expect(f.ledger.getCounts()).toEqual({ tokenCountReserved: 1, imageReserved: 2 });
  expect(readFileSync(resolve(f.root, 'ledger.json'), 'utf8')).toBe(before);
});

it('existing-core token helper never completes an interrupted pending token reservation', async () => {
  const f = await makeRuntimeEvidenceNativeFixture(ownedRoots, { mode: 'existing-core' });
  const key = { kind: 'token_count' as const, stage: 'preflight' as const, caseId: f.key.caseId, model: f.context.identity.model };
  f.ledger.reserveTokenCount(key);
  const path = resolve(f.root, 'ledger.json');
  const before = readFileSync(path, 'utf8');
  expect(() => f.completeTokenPrerequisites()).toThrow(CalibrationFatalError);
  expect(readFileSync(path, 'utf8')).toBe(before);
  const rows = JSON.parse(before) as Array<{ type: string }>;
  expect(rows.filter((row) => row.type === 'token_count_completed')).toHaveLength(0);
  expect(existsSync(resolve(f.root, 'lock.json'))).toBe(true);
});

// Break caught: treating unknown/live ownership as death, or using a PID
// without its start ticks, must never authorize takeover of this real lock.
type NativeOwnerProbe = 'live' | 'unknown' | 'malformed' | 'dead' | 'pid-reused';
async function exerciseNativeOwnerProbe(mode: 'existing-core' | 'future', probe: NativeOwnerProbe): Promise<void> {
  const f = await makeRuntimeEvidenceNativeFixture(ownedRoots, { mode });
  f.completeTokenPrerequisites();
  f.ledger.startRuntimeAttempt(f.key);
  const lockPath = resolve(f.root, 'lock.json');
  const ledgerPath = resolve(f.root, 'ledger.json');
  const lockBytes = readFileSync(lockPath, 'utf8');
  const lockStat = lstatSync(lockPath);
  const before = JSON.parse(readFileSync(ledgerPath, 'utf8')) as Array<Record<string, unknown>>;
  const next: CalibrationOwner = {
    ...f.owner,
    pid: f.owner.pid + 91000,
    startTicks: f.owner.startTicks + 30,
    acquiredAt: new Date(Date.parse(f.owner.acquiredAt) + 2000).toISOString(),
  };
  // Only the declared procStatReader seam is simulated; no process is killed.
  (f.faults as typeof f.faults & { ownerProbe: NativeOwnerProbe }).ownerProbe = probe;
  if (probe === 'live' || probe === 'unknown' || probe === 'malformed') {
    await expect(f.restart(next)).rejects.toBeInstanceOf(CalibrationFatalError);
    expect(readFileSync(lockPath, 'utf8')).toBe(lockBytes);
    expect(lstatSync(lockPath).ino).toBe(lockStat.ino);
    expect(JSON.parse(readFileSync(ledgerPath, 'utf8'))).toEqual(before);
  } else {
    const fresh = await f.restart(next);
    fresh.recoverAfterCrash();
    const rows = JSON.parse(readFileSync(ledgerPath, 'utf8')) as Array<Record<string, unknown>>;
    expect(rows.slice(0, before.length)).toEqual(before);
    expect(rows.filter((row) => row.type === 'lock_recovery')).toEqual([
      expect.objectContaining({ staleOwner: f.owner, recoveringOwner: next }),
    ]);
    expect(rows.filter((row) => row.type === 'runtime_attempt_abandoned')).toEqual([
      expect.objectContaining({ owner: next, key: f.key, attempt: 1, disposition: { kind: 'unreserved_interruption' } }),
    ]);
    expect(fresh.startRuntimeAttempt(f.key).attempt).toBe(2);
    expect(fresh.getCounts()).toEqual({ tokenCountReserved: 1, imageReserved: 0 });
  }
  expect(f.trace).toContain(`ledger:proc-stat:${probe}:pid=${f.owner.pid}`);
}
for (const probe of ['live', 'unknown', 'malformed', 'dead', 'pid-reused'] as const) {
  it(`existing native owner probe distinguishes ${probe} without process control`, () => exerciseNativeOwnerProbe('existing-core', probe));
  it(`guarded native owner probe distinguishes ${probe} without process control`, () => exerciseNativeOwnerProbe('future', probe));
}

// Break caught: deriving reservations from report outcomes would turn twelve
// barcode reads into image calls, or would allow synthetic data to authorize
// benchmark completion. These are real files with synthetic predictions.
async function exerciseNativeStagePopulation(mode: 'existing-core' | 'future'): Promise<void> {
  const f = await makeRuntimeEvidenceNativeFixture(ownedRoots, { mode });
  const staged = f as typeof f & {
    finishDevelopment(): Promise<void>;
    finishValidation(): Promise<void>;
    finishBenchmarkOutcomes(): Promise<void>;
  };
  await f.finishPreflight();
  expect(f.ledger.getCounts()).toEqual({ tokenCountReserved: 1, imageReserved: 2 });
  await staged.finishDevelopment();
  expect(f.ledger.getSelectedProfile()).toBe('MEDIUM');
  expect(f.ledger.getCounts()).toEqual({ tokenCountReserved: 1, imageReserved: 50 });
  await staged.finishValidation();
  expect(f.ledger.getCounts()).toEqual({ tokenCountReserved: 1, imageReserved: 98 });
  await staged.finishBenchmarkOutcomes();
  expect(f.ledger.getCounts()).toEqual({ tokenCountReserved: 1, imageReserved: 146 });
  const rows = JSON.parse(readFileSync(resolve(f.root, 'ledger.json'), 'utf8')) as Array<{
    type: string;
    key?: { stage: string; profile: string; caseId: string; sampleIndex: number };
    stage?: string;
    operation?: string;
  }>;
  const benchmarkTerminals = rows.filter((row) => row.key?.stage === 'benchmark'
    && (row.type === 'completed' || row.type === 'non_reservation_result'));
  expect(benchmarkTerminals).toHaveLength(60);
  const barcodes = benchmarkTerminals.filter((row) => row.type === 'non_reservation_result');
  expect(barcodes).toHaveLength(12);
  expect(new Set(barcodes.map((row) => row.key?.caseId)).size).toBe(4);
  const barcodeKeys = new Set(barcodes.map((row) => JSON.stringify(row.key)));
  expect(rows.filter((row) => row.type === 'reserved')).toHaveLength(146);
  expect(rows.filter((row) => row.type === 'completed')).toHaveLength(146);
  expect(rows.filter((row) => row.type === 'runtime_attempt_finished')).toHaveLength(158);
  expect(rows.filter((row) => row.type === 'runtime_operation_started' && row.operation === 'snapshot')).toHaveLength(12);
  expect(rows.filter((row) => row.type === 'reserved' && barcodeKeys.has(JSON.stringify(row.key)))).toHaveLength(0);
  expect(rows.filter((row) => row.type === 'stage_completed').map((row) => row.stage)).toEqual(['preflight', 'development', 'validation']);
  expect(f.ledger.getRuntimeEvidenceSnapshot().activeAttempt).toBeNull();
  const snapshot = f.ledger.getStageReportSnapshot('benchmark', 'MEDIUM');
  expect(snapshot.images).toHaveLength(48);
  expect(snapshot.nonReservations).toHaveLength(12);
  expect(snapshot.counts).toEqual({ imageCallsReserved: 48, imageCallsCompleted: 48, imageCallsFailed: 0, imageCallsPending: 0 });
  const before = readFileSync(resolve(f.root, 'ledger.json'), 'utf8');
  expect(() => f.ledger.completeStage('benchmark', {
    stage: 'benchmark', passed: true, completedStages: ['preflight', 'development', 'validation'],
  })).toThrow('calibration:benchmark-runtime-evidence-required');
  expect(readFileSync(resolve(f.root, 'ledger.json'), 'utf8')).toBe(before);
  expect(existsSync(resolve(f.root, 'lock.json'))).toBe(true);
}
it('existing native stage driver preserves 158 outcomes, 146 images and twelve barcodes without benchmark authority',
  () => exerciseNativeStagePopulation('existing-core'), 600000);
it('guarded native stage driver preserves 158 outcomes, 146 images and twelve barcodes without benchmark authority',
  () => exerciseNativeStagePopulation('future'), 600000);

const nativeCrashCuts = [
  'untouched', 'attempt', 'image-intent', 'image-returned', 'vision-intent', 'reserved',
  'authorized', 'vision-returned', 'terminal-complete', 'terminal-incomplete', 'orphan-journal', 'finished',
] as const;
type NativeCrashCut = typeof nativeCrashCuts[number];
function nextNativeOwner(owner: CalibrationOwner): CalibrationOwner {
  return {
    ...owner, pid: owner.pid + 92000, startTicks: owner.startTicks + 40,
    acquiredAt: new Date(Date.parse(owner.acquiredAt) + 3000).toISOString(),
  };
}
function nativeRows(root: string): Array<Record<string, unknown>> {
  return JSON.parse(readFileSync(resolve(root, 'ledger.json'), 'utf8')) as Array<Record<string, unknown>>;
}
function sameNativeOutcome(a: ReservationKey, b: ReservationKey): boolean {
  return a.stage === b.stage && a.profile === b.profile && a.caseId === b.caseId && a.sampleIndex === b.sampleIndex;
}

// Break caught: a crash cut cannot reset sequence/history, invent a successful
// result for an orphan journal, or redispatch a durably reserved sample.
async function exerciseNativeCrashCut(mode: 'existing-core' | 'future', cut: NativeCrashCut): Promise<void> {
  const f = await makeRuntimeEvidenceNativeFixture(ownedRoots, { mode });
  f.completeTokenPrerequisites();
  const rank = nativeCrashCuts.indexOf(cut);
  if (rank >= 1) {
    const ref = f.ledger.startRuntimeAttempt(f.key);
    if (rank >= 2) f.ledger.startRuntimeOperation(ref, 'image');
    if (rank >= 3) f.ledger.settleRuntimeOperation(ref, 'image', 'returned');
    if (rank >= 4) f.ledger.startRuntimeOperation(ref, 'vision');
    if (rank >= 5) f.ledger.reserve(f.key);
    if (rank >= 6) {
      f.ledger.authorizeRuntimeRequest(ref);
      f.ledger.pinModelVersion(CORE_PINNED_VERSION);
    }
    if (rank >= 7 && cut !== 'terminal-incomplete') f.ledger.settleRuntimeOperation(ref, 'vision', 'returned');
    if (rank >= 8) {
      const prediction = createCoreExactPrediction(realFirstDevCase(f.context.files, f.key.caseId), f.key.sampleIndex);
      const hash = f.ledger.appendResultJournal(buildCoreSuccessJournal(f.key, prediction));
      if (cut !== 'orphan-journal') f.ledger.complete(f.key, hash);
      if (cut === 'finished') f.ledger.finishRuntimeAttempt(ref);
    }
  }
  const before = nativeRows(f.root);
  const journalPath = resolve(f.root, 'journal.json');
  const journalBefore = existsSync(journalPath) ? readFileSync(journalPath, 'utf8') : undefined;
  const next = nextNativeOwner({ ...f.owner });
  f.faults.ownerProbe = 'dead';
  if (cut === 'orphan-journal') {
    await expect((async () => {
      const fresh = await f.restart(next);
      fresh.recoverAfterCrash();
    })()).rejects.toBeInstanceOf(CalibrationFatalError);
    const after = nativeRows(f.root);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.filter((row) => row.type === 'completed' || row.type === 'failed'
      || row.type === 'runtime_attempt_finished' || row.type === 'runtime_attempt_abandoned')).toHaveLength(0);
    expect(readFileSync(journalPath, 'utf8')).toBe(journalBefore);
    expect(existsSync(resolve(f.root, 'lock.json'))).toBe(true);
    return;
  }
  const fresh = await f.restart(next);
  const report = fresh.recoverAfterCrash();
  const after = nativeRows(f.root);
  expect(after.slice(0, before.length)).toEqual(before);
  expect(after[0]?.owner).toEqual(f.owner);
  expect(after.filter((row) => row.type === 'lock_recovery')).toEqual([
    expect.objectContaining({ staleOwner: f.owner, recoveringOwner: next }),
  ]);
  expect(JSON.parse(readFileSync(resolve(f.root, 'lock.json'), 'utf8'))).toEqual(next);
  expect(f.trace).toContain(`ledger:proc-stat:dead:pid=${f.owner.pid}`);
  const reservedInterrupted = rank >= 5 && rank <= 7;
  const unreserved = rank >= 1 && rank <= 4;
  const incomplete = cut === 'terminal-incomplete';
  const abandoned = after.filter((row) => row.type === 'runtime_attempt_abandoned');
  expect(abandoned).toHaveLength(unreserved || reservedInterrupted || incomplete ? 1 : 0);
  if (abandoned.length > 0) {
    expect(abandoned[0]).toMatchObject({
      owner: next, key: f.key, attempt: 1,
      disposition: { kind: unreserved ? 'unreserved_interruption'
        : reservedInterrupted ? 'reserved_interruption' : 'terminal_evidence_incomplete' },
    });
  }
  const finishes = after.filter((row) => row.type === 'runtime_attempt_finished');
  expect(finishes).toHaveLength(cut === 'terminal-complete' || cut === 'finished' ? 1 : 0);
  if (cut === 'terminal-complete') {
    const terminalIndex = before.findIndex((row) => row.type === 'completed');
    expect(finishes[0]).toMatchObject({ owner: next, key: f.key,
      terminal: { kind: 'image', eventIndex: terminalIndex + 1, journalHash: before[terminalIndex]?.journalHash } });
    expect(after.slice(before.length).map((row) => row.type)).toEqual(['lock_recovery', 'runtime_attempt_finished']);
  }
  expect(fresh.getCounts()).toEqual({ tokenCountReserved: 1, imageReserved: rank >= 5 ? 1 : 0 });
  expect(report.resumable.some((key) => sameNativeOutcome(key, f.key))).toBe(rank < 5);
  if (reservedInterrupted) {
    expect(after.filter((row) => row.type === 'failed')).toHaveLength(1);
    const journal: unknown = JSON.parse(readFileSync(journalPath, 'utf8'));
    expect(journal).toEqual([expect.objectContaining({ key: f.key, predictionHash: 'interrupted_reservation',
      normalizedPrediction: null, errorCategory: 'interrupted_reservation' })]);
  } else {
    expect(existsSync(journalPath) ? readFileSync(journalPath, 'utf8') : undefined).toBe(journalBefore);
  }
  const recoveredBytes = readFileSync(resolve(f.root, 'ledger.json'), 'utf8');
  fresh.recoverAfterCrash();
  expect(readFileSync(resolve(f.root, 'ledger.json'), 'utf8')).toBe(recoveredBytes);
  expect(() => f.ledger.getCounts()).toThrow(CalibrationFatalError);
  if (rank < 5) expect(fresh.startRuntimeAttempt(f.key).attempt).toBe(rank === 0 ? 1 : 2);
  else expect(() => fresh.startRuntimeAttempt(f.key)).toThrow(CalibrationFatalError);
  expect(JSON.parse(readFileSync(resolve(f.root, 'lock.json'), 'utf8'))).toEqual(next);
}
for (const cut of nativeCrashCuts) {
  it(`existing real disk crash cut ${cut} preserves history and request accounting`, () => exerciseNativeCrashCut('existing-core', cut));
  it(`guarded real disk crash cut ${cut} preserves history and request accounting`, () => exerciseNativeCrashCut('future', cut));
}

async function exerciseNativeBarcodeCrash(mode: 'existing-core' | 'future'): Promise<void> {
  const f = await makeRuntimeEvidenceNativeFixture(ownedRoots, { mode });
  await f.finishPreflight();
  await f.finishDevelopment();
  await f.finishValidation();
  const barcode = deriveCanonicalReportOutcomePlan(f.context.files, 'MEDIUM').find((row) => row.scanMode === 'barcode');
  expect(barcode).toBeDefined();
  const key = barcode!.key;
  const ref = f.ledger.startRuntimeAttempt(key);
  f.ledger.startRuntimeOperation(ref, 'snapshot');
  const before = nativeRows(f.root);
  const next = nextNativeOwner({ ...f.owner });
  const fresh = await f.restart(next);
  const report = fresh.recoverAfterCrash();
  const after = nativeRows(f.root);
  expect(after.slice(0, before.length)).toEqual(before);
  expect(after.slice(before.length).map((row) => row.type)).toEqual(['lock_recovery', 'runtime_attempt_abandoned']);
  expect(after.at(-1)).toMatchObject({ owner: next, key, attempt: 1, disposition: { kind: 'unreserved_interruption' } });
  expect(report.resumable.some((candidate) => sameNativeOutcome(candidate, key))).toBe(true);
  expect(fresh.getCounts()).toEqual({ tokenCountReserved: 1, imageReserved: 98 });
  expect(fresh.startRuntimeAttempt(key).attempt).toBe(2);
  expect(after.filter((row) => row.type === 'reserved' && sameNativeOutcome(row.key as ReservationKey, key))).toHaveLength(0);
}
it('existing real disk barcode crash cut remains read-only and may resume under new ownership',
  () => exerciseNativeBarcodeCrash('existing-core'), 600000);
it('guarded real disk barcode crash cut remains read-only and may resume under new ownership',
  () => exerciseNativeBarcodeCrash('future'), 600000);

const nativeArtifactMutations = [
  'json-bytes', 'markdown-bytes', 'duplicate-journal', 'orphan-journal', 'journal-hash',
  'journal-key', 'receipt-hash', 'binding-digest', 'binding-profile', 'binding-owner', 'source-header',
] as const;
type NativeArtifactMutation = typeof nativeArtifactMutations[number];

// Break caught: an admitted receipt or old binding must never cache authority
// over changed physical report/journal bytes or inconsistent replay records.
async function exerciseNativeArtifactMutation(mode: 'existing-core' | 'future', kind: NativeArtifactMutation): Promise<void> {
  const f = await makeRuntimeEvidenceNativeFixture(ownedRoots, { mode });
  await f.finishPreflight();
  f.ledger.bindRuntimeStageReport('preflight', 'LOW');
  const ledgerPath = resolve(f.root, 'ledger.json');
  const journalPath = resolve(f.root, 'journal.json');
  const jsonPath = resolve(f.root, 'reports/preflight-low.json');
  const markdownPath = resolve(f.root, 'reports/preflight-low.md');
  const rows = nativeRows(f.root);
  const journals = JSON.parse(readFileSync(journalPath, 'utf8')) as Array<Record<string, unknown>>;
  const binding = rows.find((row) => row.type === 'runtime_report_bound');
  const receipt = rows.find((row) => row.type === 'artifact_receipt_admitted');
  expect(binding).toBeDefined();
  expect(receipt).toBeDefined();
  if (kind === 'json-bytes' || kind === 'markdown-bytes') {
    const target = kind === 'json-bytes' ? jsonPath : markdownPath;
    const tampered = readFileSync(target, 'utf8') + '\n';
    writeOwnedFile(target, tampered);
    const before = readFileSync(ledgerPath, 'utf8');
    let error: unknown;
    try { f.ledger.bindRuntimeStageReport('preflight', 'LOW'); } catch (caught) { error = caught; }
    expectStaticPersistenceFatal(error);
    expect(readFileSync(ledgerPath, 'utf8')).toBe(before);
    expect(readFileSync(target, 'utf8')).toBe(tampered);
    expect(() => f.ledger.getCounts()).toThrow(CalibrationFatalError);
  } else if (kind === 'duplicate-journal') {
    journals.push(structuredClone(journals[0]!));
    writeOwnedFile(journalPath, JSON.stringify(journals));
  } else if (kind === 'orphan-journal' || kind === 'journal-key') {
    const moved = structuredClone(journals[0]!);
    moved.key = { ...(moved.key as ReservationKey), stage: 'development' };
    if (kind === 'orphan-journal') journals.push(moved);
    else journals[0] = moved;
    writeOwnedFile(journalPath, JSON.stringify(journals));
  } else if (kind === 'journal-hash') {
    journals[0]!.predictionHash = 'private-native-hook-error';
    writeOwnedFile(journalPath, JSON.stringify(journals));
  } else {
    if (kind === 'receipt-hash') (receipt!.receipt as Record<string, unknown>).jsonSha256 = '0'.repeat(64);
    if (kind === 'binding-digest') binding!.bindingSha256 = '0'.repeat(64);
    if (kind === 'binding-profile') binding!.profile = 'MEDIUM';
    if (kind === 'binding-owner') binding!.owner = nextNativeOwner({ ...f.owner });
    if (kind === 'source-header') (rows[0]!.identity as Record<string, unknown>).functionsTreeId = 'f'.repeat(40);
    writeOwnedFile(ledgerPath, JSON.stringify(rows));
  }
  const changedLedger = readFileSync(ledgerPath, 'utf8');
  const changedJournal = readFileSync(journalPath, 'utf8');
  const changedJson = readFileSync(jsonPath, 'utf8');
  const changedMarkdown = readFileSync(markdownPath, 'utf8');
  let error: unknown;
  try { await f.restart(nextNativeOwner({ ...f.owner })); } catch (caught) { error = caught; }
  expectStaticPersistenceFatal(error);
  // Fail/report, never truncate, repair artifacts, release, or hide conflict.
  expect(readFileSync(ledgerPath, 'utf8')).toBe(changedLedger);
  expect(readFileSync(journalPath, 'utf8')).toBe(changedJournal);
  expect(readFileSync(jsonPath, 'utf8')).toBe(changedJson);
  expect(readFileSync(markdownPath, 'utf8')).toBe(changedMarkdown);
  expect(existsSync(resolve(f.root, 'lock.json'))).toBe(true);
}
for (const kind of nativeArtifactMutations) {
  it(`existing native artifact reconciliation rejects ${kind} without repairing history`, () => exerciseNativeArtifactMutation('existing-core', kind));
  it(`guarded native artifact reconciliation rejects ${kind} without repairing history`, () => exerciseNativeArtifactMutation('future', kind));
}

async function exerciseNativeReportWithoutReceipt(mode: 'existing-core' | 'future'): Promise<void> {
  const f = await makeRuntimeEvidenceNativeFixture(ownedRoots, { mode });
  await f.finishPreflight();
  const all = nativeRows(f.root);
  const firstReceipt = all.findIndex((row) => row.type === 'artifact_receipt_admitted');
  expect(firstReceipt).toBeGreaterThan(0);
  // Restore an exact observed ledger prefix containing both finished
  // outcomes; retain the actually published files, not rendered substitutes.
  const prefix = all.slice(0, firstReceipt);
  writeOwnedFile(resolve(f.root, 'ledger.json'), JSON.stringify(prefix));
  const jsonPath = resolve(f.root, 'reports/preflight-low.json');
  const markdownPath = resolve(f.root, 'reports/preflight-low.md');
  const jsonBefore = readFileSync(jsonPath, 'utf8');
  const markdownBefore = readFileSync(markdownPath, 'utf8');
  const next = nextNativeOwner({ ...f.owner });
  const fresh = await f.restart(next);
  fresh.recoverAfterCrash();
  fresh.admitStageReportReceipt('preflight', 'LOW');
  const first = fresh.bindRuntimeStageReport('preflight', 'LOW');
  const beforeRetry = readFileSync(resolve(f.root, 'ledger.json'), 'utf8');
  expect(fresh.bindRuntimeStageReport('preflight', 'LOW')).toEqual(first);
  expect(readFileSync(resolve(f.root, 'ledger.json'), 'utf8')).toBe(beforeRetry);
  const after = nativeRows(f.root);
  expect(after.slice(0, prefix.length)).toEqual(prefix);
  expect(after.slice(prefix.length).map((row) => row.type)).toEqual([
    'lock_recovery', 'artifact_receipt_admitted', 'runtime_report_bound',
  ]);
  expect(first.owner).toEqual(next);
  expect(fresh.getCounts()).toEqual({ tokenCountReserved: 1, imageReserved: 2 });
  expect(readFileSync(jsonPath, 'utf8')).toBe(jsonBefore);
  expect(readFileSync(markdownPath, 'utf8')).toBe(markdownBefore);
}
it('existing native report files without receipt can be verified and bound under a fresh owner without new outcomes',
  () => exerciseNativeReportWithoutReceipt('existing-core'));
it('guarded native report files without receipt can be verified and bound under a fresh owner without new outcomes',
  () => exerciseNativeReportWithoutReceipt('future'));

import { chmodSync as chmodOwnedPath, linkSync as hardLinkOwnedPath } from 'node:fs';
import { runCalibrationCli as runUnactivatedCalibrationCli } from '../../src/nutrition-eval/calibration-cli';

async function exerciseNativePendingAdmission(mode: 'existing-core' | 'future', pending: boolean): Promise<void> {
  const hooks = makePersistenceHooks();
  const { boot, ledger } = await openPersistenceLedger(mode, hooks);
  const key = boot.key;
  const ref = ledger.startRuntimeAttempt(key);
  ledger.startRuntimeOperation(ref, 'image');
  ledger.settleRuntimeOperation(ref, 'image', 'returned');
  ledger.startRuntimeOperation(ref, 'vision');
  ledger.reserve(key);
  ledger.authorizeRuntimeRequest(ref);
  ledger.pinModelVersion(CORE_PINNED_VERSION);
  if (!pending) ledger.settleRuntimeOperation(ref, 'vision', 'returned');
  const prediction = createCoreExactPrediction(realFirstDevCase(boot.context.files, key.caseId), 1);
  ledger.complete(key, ledger.appendResultJournal(buildCoreSuccessJournal(key, prediction)));
  if (!pending) ledger.finishRuntimeAttempt(ref);
  // Publication can render a valid terminal report; only core admission may
  // grant runtime reconciliation authority over that physical document.
  await publishCalibrationStageReport({ stage: 'preflight', profile: 'LOW', context: boot.context,
    readSnapshot: () => ledger.getStageReportSnapshot('preflight', 'LOW') });
  const path = resolve(boot.ledgerRoot, 'ledger.json');
  const before = readFileSync(path, 'utf8');
  if (pending) {
    expect(() => ledger.admitStageReportReceipt('preflight', 'LOW')).toThrow(CalibrationFatalError);
    expect(readFileSync(path, 'utf8')).toBe(before);
    expect(nativeRows(boot.ledgerRoot).filter((row) => row.type === 'artifact_receipt_admitted'
      || row.type === 'runtime_report_bound')).toHaveLength(0);
    expect(() => ledger.releaseLock({ ...boot.context.owner })).toThrow(CalibrationFatalError);
    expect(existsSync(resolve(boot.ledgerRoot, 'lock.json'))).toBe(true);
  } else {
    ledger.admitStageReportReceipt('preflight', 'LOW');
    expect(ledger.bindRuntimeStageReport('preflight', 'LOW').owner).toEqual(boot.context.owner);
    expect(ledger.getCounts()).toEqual({ tokenCountReserved: 1, imageReserved: 1 });
  }
}
for (const pending of [false, true]) {
  it(`existing native report admission distinguishes pending runtime operation=${pending}`,
    () => exerciseNativePendingAdmission('existing-core', pending));
  it(`guarded native report admission distinguishes pending runtime operation=${pending}`,
    () => exerciseNativePendingAdmission('future', pending));
}

describe('native closed capture before any effect', () => {
  it.each(['undefined', 'nonfunction', 'accessor', 'symbol', 'hidden', 'inherited', 'array', 'null', 'throwing-proxy'] as const)(
    'both native APIs reject %s low-level overrides without inspecting foreign errors', async (kind) => {
      const boot = await makeExistingNativeBootFixtureTask4(ownedRoots);
      const prepare = await loadPrepareNativeLedgerFactoryTask4();
      const store = await loadRuntimeEvidenceFileLedgerDepsFactoryTask4();
      let getters = 0;
      const record: Record<PropertyKey, unknown> = {};
      let raw: unknown = record;
      if (kind === 'undefined') record.fdWriteSync = undefined;
      if (kind === 'nonfunction') record.fdWriteSync = 3;
      if (kind === 'accessor') Object.defineProperty(record, 'fdWriteSync', { enumerable: true, get() { getters += 1; return writeSyncTest; } });
      if (kind === 'symbol') record[Symbol('unknown')] = writeSyncTest;
      if (kind === 'hidden') Object.defineProperty(record, 'fdWriteSync', { enumerable: false, value: writeSyncTest });
      if (kind === 'inherited') raw = Object.create({ fdWriteSync: writeSyncTest }) as unknown;
      if (kind === 'array') raw = [];
      if (kind === 'null') raw = null;
      if (kind === 'throwing-proxy') raw = new Proxy({}, { ownKeys() {
        throw Object.defineProperty({}, 'message', { get() { getters += 1; return 'private-native-hook-error'; } });
      } });
      const overrides = raw as RuntimeEvidenceFileStoreOverrides;
      let storeError: unknown;
      let prepareError: unknown;
      try { store(boot.context.baseDir, { ...boot.context.owner }, overrides); } catch (error) { storeError = error; }
      try { await prepare({ context: boot.context }, overrides); } catch (error) { prepareError = error; }
      expectStaticPersistenceFatal(storeError);
      expectStaticPersistenceFatal(prepareError);
      expect(storeError).not.toBe(prepareError);
      expect(getters).toBe(0);
      expect(existsSync(resolve(boot.ledgerRoot, 'lock.json'))).toBe(false);
      expect(existsSync(resolve(boot.ledgerRoot, 'ledger.json'))).toBe(false);
    },
  );

  it.each(['params-accessor', 'params-symbol', 'context-inherited', 'identity-accessor', 'files-accessor', 'report-accessor'] as const)(
    'rejects %s context capture without invoking getters or acquiring', async (kind) => {
      const boot = await makeExistingNativeBootFixtureTask4(ownedRoots);
      const prepare = await loadPrepareNativeLedgerFactoryTask4();
      const hooks = makePersistenceHooks();
      let getters = 0;
      const context = structuredClone(boot.context) as unknown as Record<string, unknown>;
      const params: Record<PropertyKey, unknown> = { context };
      const getter = () => { getters += 1; return 'private-native-hook-error'; };
      if (kind === 'params-accessor') Object.defineProperty(params, 'context', { enumerable: true, get: getter });
      if (kind === 'params-symbol') params[Symbol('context')] = context;
      if (kind === 'context-inherited') params.context = Object.assign(Object.create({ extra: true }) as object, context);
      if (kind === 'identity-accessor') Object.defineProperty(context.identity as object, 'model', { enumerable: true, get: getter });
      if (kind === 'files-accessor') Object.defineProperty(context.files as object, 'calibration-manifest', { enumerable: true, get: getter });
      if (kind === 'report-accessor') Object.defineProperty(context.report as object, 'compatibilityNotes', { enumerable: true, get: getter });
      let error: unknown;
      try { await prepare(params, hooks.overrides); } catch (caught) { error = caught; }
      expectStaticPersistenceFatal(error);
      expect(getters).toBe(0);
      expect(hooks.trace).toEqual([]);
      expect(existsSync(resolve(boot.ledgerRoot, 'lock.json'))).toBe(false);
      expect(existsSync(resolve(boot.ledgerRoot, 'ledger.json'))).toBe(false);
    },
  );
});

describe('guarded native private paths and observed ancestors', () => {
  for (const leaf of ['ledger.json', 'journal.json', 'lock.json'] as const) {
    it.each(['mode', 'hardlink'] as const)(`rejects ${leaf} %s drift before writable effects without repairing it`, async (kind) => {
      const hooks = makePersistenceHooks();
      const { boot, ledger } = await openPersistenceLedger('future', hooks);
      const path = resolve(boot.ledgerRoot, leaf);
      if (!existsSync(path)) writeOwnedFile(path, '[]', { flag: 'wx', mode: 0o600 });
      const bytes = readFileSync(path, 'utf8');
      const ino = lstatSync(path).ino;
      const alias = path + '.test-hardlink';
      if (kind === 'mode') chmodOwnedPath(path, 0o644);
      else hardLinkOwnedPath(path, alias);
      const traceLength = hooks.trace.length;
      expect(() => ledger.startRuntimeAttempt({ ...boot.key })).toThrow(CalibrationFatalError);
      expect(hooks.trace).toHaveLength(traceLength);
      expect(readFileSync(path, 'utf8')).toBe(bytes);
      expect(lstatSync(path).ino).toBe(ino);
      if (kind === 'mode') expect(lstatSync(path).mode & 0o777).toBe(0o644);
      else {
        expect(lstatSync(path).nlink).toBe(2);
        expect(lstatSync(alias).ino).toBe(ino);
        expect(readFileSync(alias, 'utf8')).toBe(bytes);
      }
      expect(() => ledger.releaseLock({ ...boot.context.owner })).toThrow(CalibrationFatalError);
      expect(existsSync(resolve(boot.ledgerRoot, 'lock.json'))).toBe(true);
    });
  }
  it('does not silently chmod an insecure replaced canonical-root mode back into authority', async () => {
    const hooks = makePersistenceHooks();
    const { boot, ledger } = await openPersistenceLedger('future', hooks);
    const before = readFileSync(resolve(boot.ledgerRoot, 'ledger.json'), 'utf8');
    chmodOwnedPath(boot.ledgerRoot, 0o755);
    const traceLength = hooks.trace.length;
    expect(() => ledger.startRuntimeAttempt({ ...boot.key })).toThrow(CalibrationFatalError);
    expect(hooks.trace).toHaveLength(traceLength);
    expect(lstatSync(boot.ledgerRoot).mode & 0o777).toBe(0o755);
    expect(readFileSync(resolve(boot.ledgerRoot, 'ledger.json'), 'utf8')).toBe(before);
    expect(() => ledger.releaseLock({ ...boot.context.owner })).toThrow(CalibrationFatalError);
    expect(existsSync(resolve(boot.ledgerRoot, 'lock.json'))).toBe(true);
  });
  it.each(['after-close', 'after-dir-sync'] as const)(
    'detects an ancestor inode replacement %s even when root and lock inodes are preserved', async (phase) => {
      const hooks = makePersistenceHooks();
      const close = hooks.overrides.fdCloseSync!;
      const sync = hooks.overrides.fsyncDirSync!;
      let armed = false;
      let changed = false;
      let oldAncestorIno = 0;
      const replaceAncestor = () => {
        if (!armed) return;
        armed = false;
        const ancestor = resolve(boot.context.baseDir, '.nutrition-eval');
        const saved = ancestor + '.test-preserved';
        oldAncestorIno = lstatSync(ancestor).ino;
        renameSyncTest(ancestor, saved);
        makeOwnedDirectory(ancestor, { mode: 0o700 });
        makeOwnedDirectory(resolve(ancestor, 'calibration'), { mode: 0o700 });
        // Move the same child root back: checking only root/lock identity
        // misses this change to an observed ancestor.
        renameSyncTest(resolve(saved, 'calibration', basename(boot.ledgerRoot)), boot.ledgerRoot);
        writeOwnedFile(resolve(saved, 'preserved.txt'), 'owned saved ancestor', { flag: 'wx', mode: 0o600 });
        changed = true;
      };
      hooks.overrides.fdCloseSync = (fd) => { close(fd); if (phase === 'after-close') replaceAncestor(); };
      hooks.overrides.fsyncDirSync = (dir) => { sync(dir); if (phase === 'after-dir-sync') replaceAncestor(); };
      const opened = await openPersistenceLedger('future', hooks);
      const boot = opened.boot;
      const ledger = opened.ledger;
      const ledgerPath = resolve(boot.ledgerRoot, 'ledger.json');
      const lockPath = resolve(boot.ledgerRoot, 'lock.json');
      const before = readFileSync(ledgerPath, 'utf8');
      const lockBytes = readFileSync(lockPath, 'utf8');
      const rootIno = lstatSync(boot.ledgerRoot).ino;
      const lockIno = lstatSync(lockPath).ino;
      armed = true;
      let error: unknown;
      let effects = 0;
      try { ledger.startRuntimeAttempt({ ...boot.key }); effects += 1; } catch (caught) { error = caught; }
      expectStaticPersistenceFatal(error);
      expect(effects).toBe(0);
      expect(changed).toBe(true);
      expect(lstatSync(resolve(boot.context.baseDir, '.nutrition-eval')).ino).not.toBe(oldAncestorIno);
      expect(lstatSync(boot.ledgerRoot).ino).toBe(rootIno);
      expect(lstatSync(lockPath).ino).toBe(lockIno);
      expect(readFileSync(lockPath, 'utf8')).toBe(lockBytes);
      expect(readFileSync(resolve(boot.context.baseDir, '.nutrition-eval.test-preserved/preserved.txt'), 'utf8')).toBe('owned saved ancestor');
      const after = readFileSync(ledgerPath, 'utf8');
      if (phase === 'after-close') expect(after).toBe(before);
      else expect(JSON.parse(after)).toEqual([...JSON.parse(before) as unknown[],
        expect.objectContaining({ type: 'runtime_attempt_started', key: boot.key, sequence: 1 })]);
      expect(() => ledger.releaseLock({ ...boot.context.owner })).toThrow(CalibrationFatalError);
      expect(readFileSync(lockPath, 'utf8')).toBe(lockBytes);
    },
  );
});

it.each([
  { argv: ['preflight'], env: {}, failureCode: 'opt_in_missing' },
  { argv: ['preflight', '--unknown', '1'], env: { RUN_NUTRITION_CALIBRATION_LIVE: '1' }, failureCode: 'invalid_command' },
  { argv: ['preflight'], env: { RUN_NUTRITION_CALIBRATION_LIVE: '1' }, failureCode: 'dependency_missing' },
])('default calibration CLI remains unactivated: $failureCode', async ({ argv, env, failureCode }) => {
  expect(await runUnactivatedCalibrationCli(argv, env)).toEqual({ exitCode: 1, failureCode });
  expect(sdkGuard.calls).toBe(0);
  expect(fetchCalls).toBe(0);
});

it('native preparation accepts owned null-prototype records without freezing caller inputs', async () => {
  const boot = await makeExistingNativeBootFixtureTask4(ownedRoots);
  const prepare = await loadPrepareNativeLedgerFactoryTask4();
  const context = structuredClone(boot.context);
  const nullRecords = (value: unknown): void => {
    // Only this test's finite newly cloned fixture, never foreign input.
    if (typeof value !== 'object' || value === null) return;
    if (Array.isArray(value)) {
      for (const item of value) nullRecords(item);
      return;
    }
    for (const item of Object.values(value)) nullRecords(item);
    Object.setPrototypeOf(value, null);
  };
  nullRecords(context);
  const params = Object.assign(Object.create(null) as Record<string, unknown>, { context });
  const overrides = Object.assign(Object.create(null) as Record<string, unknown>, {
    nowIso: () => '2026-10-16T00:00:00.000Z',
  }) as RuntimeEvidenceFileStoreOverrides;
  const ledger = await prepare(params, overrides);
  expect(Object.isFrozen(params)).toBe(false);
  expect(Object.isFrozen(context)).toBe(false);
  expect(Object.isFrozen(context.owner)).toBe(false);
  ledger.acquireLock({ ...boot.context.owner });
  ledger.reserveTokenCount({ kind: 'token_count', stage: 'preflight', caseId: boot.key.caseId, model: boot.context.identity.model });
  ledger.completeTokenCount({ kind: 'token_count', stage: 'preflight', caseId: boot.key.caseId, model: boot.context.identity.model }, 1200);
  expect(ledger.startRuntimeAttempt(boot.key)).toEqual({ key: boot.key, attempt: 1 });
  expect(nativeRows(boot.ledgerRoot).at(-1)).toMatchObject({ type: 'runtime_attempt_started', sequence: 1, owner: boot.context.owner });
});

it('native preparation captures low-level hooks before its first suspension', async () => {
  const boot = await makeExistingNativeBootFixtureTask4(ownedRoots);
  const prepare = await loadPrepareNativeLedgerFactoryTask4();
  let originalWrites = 0;
  let replacementWrites = 0;
  const overrides: RuntimeEvidenceFileStoreOverrides = {
    fdWriteSync(fd, buffer, offset, length) {
      originalWrites += 1;
      return writeSyncTest(fd, buffer, offset, length);
    },
  };
  const pending = prepare({ context: boot.context }, overrides);
  overrides.fdWriteSync = () => { replacementWrites += 1; throw new Error('private-native-hook-error'); };
  const ledger = await pending;
  ledger.acquireLock({ ...boot.context.owner });
  expect(originalWrites).toBeGreaterThan(0);
  expect(replacementWrites).toBe(0);
  expect(nativeRows(boot.ledgerRoot)).toEqual([expect.objectContaining({ type: 'protocol_identity',
    runtimeEvidenceVersion: 1, owner: boot.context.owner })]);
});

// Break caught: inherited legacy error inspection must not invoke exception
// getters/prototype traps or convert unknown liveness into native authority.
describe('guarded native foreign exception boundaries', () => {
  it.each(['link-before', 'link-after', 'dir-before', 'unlink-before'] as const)(
    'retains reached physical archive effects without inspecting %s exceptions', async (phase) => {
      const hooks = makePersistenceHooks();
      hooks.overrides.procStatReader = () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); };
      const counts = { getter: 0, prototype: 0, fault: 0 };
      const foreign = new Proxy(Object.defineProperty({}, 'code', {
        get() { counts.getter += 1; return undefined; },
      }), { getPrototypeOf() { counts.prototype += 1; return Object.prototype; } });
      let armed = false;
      const syncDir = hooks.overrides.fsyncDirSync!;
      hooks.overrides.linkSync = (from, to) => {
        if (armed && phase === 'link-before') { counts.fault += 1; throw foreign; }
        hardLinkOwnedPath(from, to);
        if (armed && phase === 'link-after') { counts.fault += 1; throw foreign; }
      };
      hooks.overrides.unlinkSync = (path) => {
        if (armed && phase === 'unlink-before') { counts.fault += 1; throw foreign; }
        unlinkOwnedFile(path);
      };
      hooks.overrides.fsyncDirSync = (dir) => {
        if (armed && phase === 'dir-before') { counts.fault += 1; throw foreign; }
        syncDir(dir);
      };
      const { boot } = await openPersistenceLedger('future', hooks);
      const lock = resolve(boot.ledgerRoot, 'lock.json');
      const journal = resolve(boot.ledgerRoot, 'ledger.json');
      const lockBytes = readFileSync(lock, 'utf8');
      const lockInode = lstatSync(lock).ino;
      const history = readFileSync(journal, 'utf8');
      const archive = resolve(boot.ledgerRoot, `lock.archive.${boot.context.owner.pid}.${boot.context.owner.startTicks}.json`);
      const prepare = await loadPrepareNativeLedgerFactoryTask4();
      const next = nextNativeOwner(boot.context.owner);
      const fresh = await prepare({ context: { ...boot.context, owner: next } }, hooks.overrides);
      armed = true;
      let error: unknown;
      let permissions = 0;
      try { fresh.acquireLock(next); permissions += 1; } catch (caught) { error = caught; }
      expectStaticPersistenceFatal(error);
      expect(permissions).toBe(0);
      expect(counts.fault).toBe(1);
      expect(readFileSync(lock, 'utf8')).toBe(lockBytes);
      expect(lstatSync(lock).ino).toBe(lockInode);
      expect(readFileSync(journal, 'utf8')).toBe(history);
      expect(existsSync(archive)).toBe(phase !== 'link-before');
      expect(lstatSync(lock).nlink).toBe(phase === 'link-before' ? 1 : 2);
      if (phase !== 'link-before') {
        expect(lstatSync(archive).ino).toBe(lockInode);
        expect(readFileSync(archive, 'utf8')).toBe(lockBytes);
      }
      expect(() => fresh.getCounts()).toThrow(CalibrationFatalError);
      expect(() => fresh.releaseLock(next)).toThrow(CalibrationFatalError);
      expect(readFileSync(lock, 'utf8')).toBe(lockBytes);
      expect(counts).toEqual({ getter: 0, prototype: 0, fault: 1 });
    },
  );

  it('preserves an existing archive destination and original lock on real EEXIST', async () => {
    const hooks = makePersistenceHooks();
    hooks.overrides.procStatReader = () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); };
    const { boot } = await openPersistenceLedger('future', hooks);
    const lock = resolve(boot.ledgerRoot, 'lock.json');
    const archive = resolve(boot.ledgerRoot, `lock.archive.${boot.context.owner.pid}.${boot.context.owner.startTicks}.json`);
    const historyPath = resolve(boot.ledgerRoot, 'ledger.json');
    const history = readFileSync(historyPath, 'utf8');
    const bytes = readFileSync(lock, 'utf8');
    const inode = lstatSync(lock).ino;
    writeOwnedFile(archive, 'preserved archive destination', { flag: 'wx', mode: 0o600 });
    const archiveInode = lstatSync(archive).ino;
    const prepare = await loadPrepareNativeLedgerFactoryTask4();
    const next = nextNativeOwner(boot.context.owner);
    const fresh = await prepare({ context: { ...boot.context, owner: next } }, hooks.overrides);
    expect(() => fresh.acquireLock(next)).toThrow(CalibrationFatalError);
    expect(readFileSync(lock, 'utf8')).toBe(bytes);
    expect(lstatSync(lock).ino).toBe(inode);
    expect(lstatSync(lock).nlink).toBe(1);
    expect(readFileSync(archive, 'utf8')).toBe('preserved archive destination');
    expect(lstatSync(archive).ino).toBe(archiveInode);
    expect(readFileSync(historyPath, 'utf8')).toBe(history);
    expect(() => fresh.releaseLock(next)).toThrow(CalibrationFatalError);
  });

  it.each(['accessor', 'inherited', 'proxy-get'] as const)(
    'does not treat a %s ENOENT exception as own-data proof of owner death', async (kind) => {
      const hooks = makePersistenceHooks();
      let getters = 0;
      const getter = () => { getters += 1; return 'ENOENT'; };
      const foreign = kind === 'accessor' ? Object.defineProperty({}, 'code', { get: getter })
        : kind === 'inherited' ? Object.create({ code: 'ENOENT' }) as unknown
          : new Proxy({}, { get(_target, key) { return key === 'code' ? getter() : undefined; } });
      hooks.overrides.procStatReader = () => { throw foreign; };
      const { boot } = await openPersistenceLedger('future', hooks);
      const lock = resolve(boot.ledgerRoot, 'lock.json');
      const historyPath = resolve(boot.ledgerRoot, 'ledger.json');
      const bytes = readFileSync(lock, 'utf8');
      const inode = lstatSync(lock).ino;
      const history = readFileSync(historyPath, 'utf8');
      const prepare = await loadPrepareNativeLedgerFactoryTask4();
      const next = nextNativeOwner(boot.context.owner);
      const fresh = await prepare({ context: { ...boot.context, owner: next } }, hooks.overrides);
      let error: unknown;
      let permissions = 0;
      try { fresh.acquireLock(next); permissions += 1; } catch (caught) { error = caught; }
      expect(permissions).toBe(0);
      expectStaticPersistenceFatal(error);
      expect(getters).toBe(0);
      expect(readFileSync(lock, 'utf8')).toBe(bytes);
      expect(lstatSync(lock).ino).toBe(inode);
      expect(readFileSync(historyPath, 'utf8')).toBe(history);
      expect(existsSync(resolve(boot.ledgerRoot, `lock.archive.${boot.context.owner.pid}.${boot.context.owner.startTicks}.json`))).toBe(false);
      expect(() => fresh.releaseLock(next)).toThrow(CalibrationFatalError);
    },
  );

  it('rechecks poison after own-descriptor reflection swallows store reentry', async () => {
    const boot = await makeExistingNativeBootFixtureTask4(ownedRoots);
    const create = await loadRuntimeEvidenceFileLedgerDepsFactoryTask4();
    let nested: () => void = () => { throw new Error('not initialized'); };
    let reflections = 0;
    const target = { code: 'ENOENT' };
    const foreign = new Proxy(target, { getOwnPropertyDescriptor(object, key) {
      reflections += 1;
      try { nested(); } catch { /* hostile callback deliberately swallows busy failure */ }
      return Object.getOwnPropertyDescriptor(object, key);
    } });
    const deps = create(boot.context.baseDir, boot.context.owner, { procStatReader: () => { throw foreign; } });
    deps.writeLockExclusive(boot.context.owner);
    nested = () => { deps.getRoot(); };
    const lock = resolve(boot.ledgerRoot, 'lock.json');
    const bytes = readFileSync(lock, 'utf8');
    const inode = lstatSync(lock).ino;
    let error: unknown;
    let disposition: unknown;
    try { disposition = deps.probeOwnerLiveness(boot.context.owner); } catch (caught) { error = caught; }
    expectStaticPersistenceFatal(error);
    expect(disposition).toBeUndefined();
    expect(reflections).toBe(1);
    expect(() => deps.removeLock(boot.context.owner)).toThrow(CalibrationFatalError);
    expect(readFileSync(lock, 'utf8')).toBe(bytes);
    expect(lstatSync(lock).ino).toBe(inode);
  });
});

// Break caught: the native reader must capture a primitive before a legacy
// parser can dereference methods, and must notice swallowed callback poison.
describe('guarded native proc return capture', () => {
  it.each([false, true])('never invokes a malformed stat getter after swallowed reentry=%s', async (reentry) => {
    const boot = await makeExistingNativeBootFixtureTask4(ownedRoots);
    const create = await loadRuntimeEvidenceFileLedgerDepsFactoryTask4();
    let getters = 0;
    let nestedFailures = 0;
    let nested: () => void = () => { throw new Error('not initialized'); };
    const foreign = Object.defineProperty({}, 'lastIndexOf', {
      get() { getters += 1; return () => -1; },
    });
    const deps = create(boot.context.baseDir, boot.context.owner, {
      procStatReader: () => {
        if (reentry) {
          try { nested(); } catch { nestedFailures += 1; }
        }
        return foreign as unknown as string;
      },
    });
    deps.writeLockExclusive(boot.context.owner);
    nested = () => { deps.readLock(); };
    const lock = resolve(boot.ledgerRoot, 'lock.json');
    const bytes = readFileSync(lock, 'utf8');
    const inode = lstatSync(lock).ino;
    let error: unknown;
    let disposition: unknown;
    try { disposition = deps.probeOwnerLiveness(boot.context.owner); } catch (caught) { error = caught; }
    if (reentry) {
      expectStaticPersistenceFatal(error);
      expect(disposition).toBeUndefined();
      expect(nestedFailures).toBe(1);
      expect(() => deps.removeLock(boot.context.owner)).toThrow(CalibrationFatalError);
    } else {
      expect(error).toBeUndefined();
      expect(disposition).toBe('unknown');
      expect(nestedFailures).toBe(0);
    }
    expect(readFileSync(lock, 'utf8')).toBe(bytes);
    expect(lstatSync(lock).ino).toBe(inode);
    expect(getters).toBe(0);
  });
});
