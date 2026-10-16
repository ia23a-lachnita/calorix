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
    const fdWrites: Array<{ fd: number; dev: number; ino: number }> = [];
    const renames: Array<{ from: string; to: string; dev: number; ino: number }> = [];
    const deps = createFileCalibrationLedgerDeps(miniRoot, {
      fdWriteSync: (fd: number, buf: Buffer, off: number, len: number): number => {
        const st = fstatSyncTest(fd);
        fdWrites.push({ fd, dev: st.dev, ino: st.ino });
        order.push(`write:fd=${fd}:ino=${st.ino}:len=${len}`);
        const n = writeSyncTest(fd, buf, off, len);
        order.push(`wrote:${n}`);
        return n;
      },
      fdFsyncSync: (fd: number): void => {
        order.push(`fsync:${fd}`);
        fsyncSyncTest(fd);
        order.push(`fsynced:${fd}`);
      },
      fdCloseSync: (fd: number): void => {
        order.push(`close:${fd}`);
        closeSyncTest(fd);
        order.push(`closed:${fd}`);
      },
      renameSync: (from: string, to: string): void => {
        order.push(`rename:${basename(from)}->${basename(to)}`);
        renameSyncTest(from, to);
        const st = lstatSync(to);
        renames.push({ from: basename(from), to: basename(to), dev: st.dev, ino: st.ino });
        order.push(`renamed:${basename(to)}:ino=${st.ino}`);
      },
      fsyncDirSync: (dir: string): void => {
        order.push(`dir:${basename(dir)}`);
        const fd = openSyncTest(dir, constantsTest.O_RDONLY | constantsTest.O_DIRECTORY | constantsTest.O_NOFOLLOW);
        try {
          fsyncSyncTest(fd);
        } finally {
          closeSyncTest(fd);
        }
        order.push(`dir-synced:${basename(dir)}`);
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
    ledger.complete({ ...lowKey }, ledger.appendResultJournal(lowJournal));
    const mediumKey: ReservationKey = { stage: 'preflight', profile: 'MEDIUM', caseId: firstDev, sampleIndex: 1 };
    ledger.reserve({ ...mediumKey });
    const mediumPrediction = createCoreExactPrediction(realCase, 1);
    const mediumJournal = buildCoreSuccessJournal({ ...mediumKey }, mediumPrediction);
    ledger.complete({ ...mediumKey }, ledger.appendResultJournal(mediumJournal));
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
    const ledgerEvents = JSON.parse(readFileSync(ledgerPath, 'utf8')) as Array<{ type: string; key?: ReservationKey; journalHash?: string }>;
    const completed = ledgerEvents.filter((e) => e.type === 'completed');
    expect(completed).toHaveLength(2);
    const journals = JSON.parse(readFileSync(journalPath, 'utf8')) as Array<{ key: ReservationKey }>;
    expect(journals).toHaveLength(2);
    expect(journals.map((j) => `${j.key.stage}|${j.key.profile}|${j.key.caseId}`)).toEqual([
      `preflight|LOW|${firstDev}`,
      `preflight|MEDIUM|${firstDev}`,
    ]);
    for (const c of completed) {
      const match = journals.find((j) => j.key.stage === c.key?.stage && j.key.profile === c.key?.profile && j.key.caseId === c.key?.caseId);
      expect(match).toBeDefined();
    }
    const indexAfter = (sub: string, from: number): number => {
      for (let i = from; i < order.length; i += 1) {
        if ((order[i] as string).includes(sub)) {
          return i;
        }
      }
      return -1;
    };
    let sameTransaction = false;
    for (const { fd } of fdWrites) {
      const writeIdx = indexAfter(`write:fd=${fd}:`, 0);
      if (writeIdx < 0) {
        continue;
      }
      const fsyncIdx = indexAfter(`fsync:${fd}`, writeIdx + 1);
      if (fsyncIdx < 0) {
        continue;
      }
      const closeIdx = indexAfter(`close:${fd}`, fsyncIdx + 1);
      if (closeIdx < 0) {
        continue;
      }
      const renameIdx = indexAfter('rename:', closeIdx + 1);
      if (renameIdx < 0) {
        continue;
      }
      const dirIdx = indexAfter('dir:', renameIdx + 1);
      if (dirIdx < 0) {
        continue;
      }
      sameTransaction = true;
      break;
    }
    expect(sameTransaction).toBe(true);
    expect(renames.length).toBeGreaterThan(0);
    const finalLedgerStat = lstatSync(ledgerPath);
    expect(renames.some((r) => r.dev === finalLedgerStat.dev && r.ino === finalLedgerStat.ino)).toBe(true);
    expect(fdWrites.length).toBeGreaterThan(0);
    expect(fdWrites.some((w) => w.dev === finalLedgerStat.dev && w.ino === finalLedgerStat.ino)).toBe(true);
    const ledgerRenames = renames.filter((r) => r.to === 'ledger.json');
    expect(ledgerRenames.length).toBeGreaterThan(0);
    expect(ledgerRenames.some((r) => r.dev === finalLedgerStat.dev && r.ino === finalLedgerStat.ino)).toBe(true);
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
