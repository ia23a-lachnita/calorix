/**
 * Task 6 RED-only first slice: fail-closed stage ledger and gates.
 *
 * This file intentionally imports the absent production modules
 * `functions/src/nutrition-eval/calibration.ts` and
 * `functions/src/nutrition-eval/fatal-error.ts`. The expected RED result is a
 * vitest collection failure solely on those missing modules; no other failure
 * is asserted. GREEN will implement the imported contract without changing
 * these tests' intent.
 *
 * Scope (bounded): canonical root/identity, exclusive wx lock with
 * live/dead/unknown owner recovery, reserve+fsync ordering, duplicate /
 * unplanned / invalid / 301st key rejection, journal-before-complete, crash
 * conversion to `interrupted_reservation` with no retry, and stage-transition
 * gates. All filesystem, lock, clock, and liveness effects are injected fakes;
 * no real fs, /proc, provider, Firebase, or network access occurs here.
 *
 * Observation honesty notes (not faked):
 * - `world.lockFile` is a live getter/setter over the same closure cell the
 *   fake `readLock`/`writeLockExclusive`/`archiveLock` mutate, so assertions
 *   observe real fake lock writes instead of a stale snapshot.
 * - Git identity is fully injected: no `git` subprocess, no real filesystem
 *   status, and no network occur. The proposed `assertGitState` contract below
 *   lives only in this test file until GREEN implements it; it compares an
 *   injected `{ headCommit, functionsTreeId, dirtyPaths }` triple against the
 *   pinned `implementationCommit`/`functionsTreeId` identity. `headCommit` may
 *   move for documentation-only commits only while `functionsTreeId` is exact;
 *   a different `functionsTreeId` is never adopted as a new pin.
 * - Reservation/completion ordering is asserted on the actual injected
 *   persistence calls (`appendLedgerEvent`, `appendJournal`,
 *   `fsyncLedgerFile`, `fsyncLedgerDir`, `fsyncJournalFile`,
 *   `fsyncJournalDir`), never on an invented `reserve*`/`complete*` op name.
 * - Reservation keys use committed `calibration-manifest.json` development IDs
 *   (`calibration-dish_1565117892` slot 0, `calibration-dish_1566844803`
 *   slot 1) with positive 1-indexed `sampleIndex`; the allowed set is injected
 *   explicitly per ledger. A well-formed-but-unplanned key and a structurally
 *   invalid key are rejected in separate assertions.
 * - Real kernel `wx` atomicity, real fsync durability bytes, and real
 *   `/proc/<pid>/stat` liveness are untestable here by design; the injected
 *   `probeOwnerLiveness` return stands in for `/proc`, and durability is only
 *   proven as call ordering on the injected fsync hooks, not as bytes on disk.
 */
import { describe, expect, it, vi } from 'vitest';
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';
import {
  CALIBRATION_ROOT,
  HARD_CALL_CEILING,
  PLANNED_IMAGE_CALLS,
  createCalibrationLedger,
  evaluateCalibrationStageGate,
  selectCalibrationProfile,
} from '../../src/nutrition-eval/calibration';
import type {
  CalibrationIdentity,
  CalibrationLedgerDeps,
  CalibrationOwner,
  JournalEntry,
  ReservationKey,
  StageName,
} from '../../src/nutrition-eval/calibration';

const EXPECTED_ROOT =
  '.nutrition-eval/calibration/calorix-gemini-38-calibration-v1/';

// Committed calibration-manifest.json development IDs (slot order). These are
// frozen public fixtures, not invented IDs.
const DEV_CASE_A = 'calibration-dish_1565117892';
const DEV_CASE_B = 'calibration-dish_1566844803';
// Well-formed dish-style ID absent from the committed manifest.
const UNPLANNED_CASE = 'calibration-dish_9999999999';

function makeOwner(overrides: Partial<CalibrationOwner> = {}): CalibrationOwner {
  return {
    hostname: 'pi-host',
    bootId: 'boot-abc-123',
    pid: 4242,
    startTicks: 987654,
    acquiredAt: '2026-09-30T00:00:00.000Z',
    ...overrides,
  };
}

function makeIdentity(overrides: Partial<CalibrationIdentity> = {}): CalibrationIdentity {
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
    plannedImageCalls: PLANNED_IMAGE_CALLS,
    hardCeiling: HARD_CALL_CEILING,
    ...overrides,
  };
}

function makeKey(overrides: Partial<ReservationKey> = {}): ReservationKey {
  return {
    stage: 'development',
    profile: 'MEDIUM',
    caseId: DEV_CASE_A,
    sampleIndex: 1,
    ...overrides,
  };
}

interface FakeWorld {
  deps: CalibrationLedgerDeps;
  ops: string[];
  lockFile: CalibrationOwner | undefined;
  liveness: 'live' | 'dead' | 'unknown';
  events: unknown[];
  journals: JournalEntry[];
}

function makeWorld(liveness: 'live' | 'dead' | 'unknown' = 'live'): FakeWorld {
  const ops: string[] = [];
  const events: unknown[] = [];
  const journals: JournalEntry[] = [];
  let currentLock: CalibrationOwner | undefined = undefined;
  const world = {
    ops,
    events,
    journals,
    liveness,
    get lockFile(): CalibrationOwner | undefined {
      return currentLock;
    },
    set lockFile(next: CalibrationOwner | undefined) {
      currentLock = next;
    },
    deps: {
      getRoot: () => EXPECTED_ROOT,
      readLock: () => currentLock,
      writeLockExclusive: (owner: CalibrationOwner) => {
        ops.push('writeLockExclusive');
        if (currentLock !== undefined) {
          throw new CalibrationFatalError('lock:already-held');
        }
        currentLock = owner;
      },
      archiveLock: (owner: CalibrationOwner) => {
        ops.push('archiveLock');
        if (currentLock === owner) {
          currentLock = undefined;
        }
      },
      appendLedgerEvent: (event: unknown) => {
        ops.push('appendLedgerEvent');
        events.push(event);
      },
      fsyncLedgerFile: () => {
        ops.push('fsyncLedgerFile');
      },
      fsyncLedgerDir: () => {
        ops.push('fsyncLedgerDir');
      },
      appendJournal: (entry: JournalEntry) => {
        ops.push('appendJournal');
        journals.push(entry);
      },
      fsyncJournalFile: () => {
        ops.push('fsyncJournalFile');
      },
      fsyncJournalDir: () => {
        ops.push('fsyncJournalDir');
      },
      probeOwnerLiveness: (_owner: CalibrationOwner) => {
        ops.push('probeOwnerLiveness');
        return world.liveness;
      },
      nowIso: () => '2026-09-30T00:00:00.000Z',
    },
  } as FakeWorld;
  return world;
}

function makeLedger(world: FakeWorld, allowedKeys: ReservationKey[]) {
  return createCalibrationLedger(world.deps, makeIdentity(), allowedKeys);
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

describe('calibration ledger identity', () => {
  it('pins the single canonical root and exact call arithmetic', () => {
    expect(CALIBRATION_ROOT).toBe(EXPECTED_ROOT);
    expect(PLANNED_IMAGE_CALLS).toBe(146);
    expect(HARD_CALL_CEILING).toBe(300);
  });

  it('refuses a redirected run dir instead of creating a second ledger', () => {
    const world = makeWorld();
    const ledger = makeLedger(world, []);
    expect(() =>
      ledger.acquireLock(makeOwner(), { runDir: '/tmp/elsewhere' }),
    ).toThrow(CalibrationFatalError);
    expect(world.lockFile).toBeUndefined();
  });

  it('refuses identity drift on functions tree, hashes, or ceilings', () => {
    const world = makeWorld();
    const ledger = makeLedger(world, []);
    ledger.acquireLock(makeOwner());
    expect(() =>
      ledger.assertIdentity(makeIdentity({ functionsTreeId: 'drifted-tree-id' })),
    ).toThrow(CalibrationFatalError);
    expect(() =>
      ledger.assertIdentity(makeIdentity({ plannedImageCalls: 147 })),
    ).toThrow(CalibrationFatalError);
    expect(() =>
      ledger.assertIdentity(makeIdentity({ hardCeiling: 301 })),
    ).toThrow(CalibrationFatalError);
  });
});

describe('calibration wx lock recovery', () => {
  it('rejects a second owner while the recorded owner is live', () => {
    const world = makeWorld('live');
    const ledger = makeLedger(world, []);
    ledger.acquireLock(makeOwner());
    expect(() => ledger.acquireLock(makeOwner({ pid: 9999 }))).toThrow(
      CalibrationFatalError,
    );
    expect(world.events).toHaveLength(0);
  });

  it('recovers a provably dead same-host owner only after a durable audit event', () => {
    const world = makeWorld('dead');
    const ledger = makeLedger(world, []);
    ledger.acquireLock(makeOwner());
    const stale = world.lockFile;
    expect(stale).toBeDefined();
    ledger.acquireLock(makeOwner({ pid: 7777, startTicks: 111 }));
    // Durable recovery order on the injected hooks: audit event, ledger file
    // fsync, parent-directory fsync, stale-lock archive, then the new
    // exclusive lock.
    const auditIndex = world.ops.indexOf('appendLedgerEvent');
    const fileIndex = world.ops.indexOf('fsyncLedgerFile');
    const dirIndex = world.ops.indexOf('fsyncLedgerDir');
    const archiveIndex = world.ops.indexOf('archiveLock');
    const writeIndex = world.ops.lastIndexOf('writeLockExclusive');
    expect(auditIndex).toBeGreaterThanOrEqual(0);
    expect(fileIndex).toBeGreaterThan(auditIndex);
    expect(dirIndex).toBeGreaterThan(fileIndex);
    expect(archiveIndex).toBeGreaterThan(dirIndex);
    expect(writeIndex).toBeGreaterThan(archiveIndex);
    expect(world.events.length).toBeGreaterThan(0);
  });

  it('fails closed when owner liveness is unknown', () => {
    const world = makeWorld('unknown');
    const ledger = makeLedger(world, []);
    ledger.acquireLock(makeOwner());
    expect(() => ledger.acquireLock(makeOwner({ pid: 7777 }))).toThrow(
      CalibrationFatalError,
    );
    expect(world.events).toHaveLength(0);
  });

  it('refuses recovery across hosts/boots even when the owner looks dead', () => {
    const world = makeWorld('dead');
    const ledger = makeLedger(world, []);
    const first = makeOwner();
    ledger.acquireLock(first);
    expect(() =>
      ledger.acquireLock(makeOwner({ hostname: 'other-host' })),
    ).toThrow(CalibrationFatalError);
    expect(() => ledger.acquireLock(makeOwner({ bootId: 'boot-other' }))).toThrow(
      CalibrationFatalError,
    );
    // No audit event and no archive: the original lock is still observed.
    expect(world.events).toHaveLength(0);
    expect(world.lockFile).toBe(first);
  });
});

describe('calibration reservations', () => {
  it('fsyncs the ledger file then the parent directory on every reservation', () => {
    const world = makeWorld();
    const key = makeKey();
    const ledger = makeLedger(world, [key]);
    ledger.acquireLock(makeOwner());
    ledger.reserve(key);
    // The reservation persistence event is the actual injected
    // `appendLedgerEvent` call; durability order is event, then file fsync,
    // then parent-directory fsync.
    const eventIndex = world.ops.indexOf('appendLedgerEvent');
    const fileIndex = world.ops.indexOf('fsyncLedgerFile');
    const dirIndex = world.ops.indexOf('fsyncLedgerDir');
    expect(eventIndex).toBeGreaterThanOrEqual(0);
    expect(fileIndex).toBeGreaterThan(eventIndex);
    expect(dirIndex).toBeGreaterThan(fileIndex);
    expect(world.events.length).toBeGreaterThan(0);
  });

  it('rejects duplicate reservation keys as fatal', () => {
    const world = makeWorld();
    const key = makeKey();
    const ledger = makeLedger(world, [key]);
    ledger.acquireLock(makeOwner());
    ledger.reserve(key);
    expect(() => ledger.reserve(key)).toThrow(CalibrationFatalError);
  });

  it('rejects well-formed but unplanned keys outside the injected allowed set', () => {
    const world = makeWorld();
    const allowed = [makeKey({ caseId: DEV_CASE_A })];
    const ledger = makeLedger(world, allowed);
    ledger.acquireLock(makeOwner());
    expect(() =>
      ledger.reserve(makeKey({ caseId: DEV_CASE_B })),
    ).toThrow(CalibrationFatalError);
    expect(() =>
      ledger.reserve(makeKey({ caseId: UNPLANNED_CASE })),
    ).toThrow(CalibrationFatalError);
  });

  it('rejects invalid and out-of-range sample indices separately from unplanned keys', () => {
    const world = makeWorld();
    const allowed = [makeKey({ caseId: DEV_CASE_A })];
    const ledger = makeLedger(world, allowed);
    ledger.acquireLock(makeOwner());
    // sampleIndex 0 is structurally invalid: positive 1-indexed sampleIndex
    // is required even for an otherwise allowed case.
    expect(() =>
      ledger.reserve(makeKey({ caseId: DEV_CASE_A, sampleIndex: 0 })),
    ).toThrow(CalibrationFatalError);
    // sampleIndex 9999 is outside the protocol's planned 1..3 range for a
    // benchmark key: well-formed shape but not a reservable protocol slot.
    expect(() =>
      ledger.reserve(makeKey({ stage: 'benchmark', sampleIndex: 9999 })),
    ).toThrow(CalibrationFatalError);
  });

  it('rejects a 301st synthetic reservation as fatal', () => {
    const world = makeWorld();
    // Empty allowed-key set: this probes the hard ceiling independently of
    // any planned protocol reservation.
    const ledger = makeLedger(world, []);
    ledger.acquireLock(makeOwner());
    const onFatal = vi.fn();
    expect(() =>
      ledger.reserveSynthetic({ reason: 'ceiling-probe', index: 300 }, onFatal),
    ).toThrow(CalibrationFatalError);
    expect(onFatal).not.toHaveBeenCalled();
  });
});

describe('calibration journal and crash recovery', () => {
  it('requires the durable journal entry before a reservation may complete', () => {
    const world = makeWorld();
    const key = makeKey();
    const ledger = makeLedger(world, [key]);
    ledger.acquireLock(makeOwner());
    ledger.reserve(key);
    expect(() => ledger.complete(key, 'missing-journal-hash')).toThrow(
      CalibrationFatalError,
    );
    const journalHash = ledger.appendResultJournal(makeJournal(key));
    ledger.complete(key, journalHash);
    // Journal-before-complete is proven on actual injected calls: the
    // `appendJournal` persistence call must precede the completion ledger
    // event. Journal fsync durability itself is a production fsync proof and
    // is not observable from these hooks, so only ordering is asserted here.
    const journalIndex = world.ops.indexOf('appendJournal');
    const completionEventIndex = world.ops.lastIndexOf('appendLedgerEvent');
    expect(journalIndex).toBeGreaterThanOrEqual(0);
    expect(completionEventIndex).toBeGreaterThan(journalIndex);
    expect(world.journals).toHaveLength(1);
    expect(ledger.rebuildReport().completed).toContainEqual(key);
  });

  it('converts a crash-interrupted reservation to failed without retry', () => {
    const world = makeWorld();
    const finished = makeKey({ caseId: DEV_CASE_A });
    const crashed = makeKey({ caseId: DEV_CASE_B });
    const ledger = makeLedger(world, [finished, crashed]);
    ledger.acquireLock(makeOwner());
    ledger.reserve(finished);
    ledger.complete(finished, ledger.appendResultJournal(makeJournal(finished)));
    ledger.reserve(crashed);
    const recovered = ledger.recoverAfterCrash();
    expect(recovered.interrupted).toContainEqual(crashed);
    expect(recovered.failed[0]).toMatchObject({
      key: crashed,
      status: 'interrupted_reservation',
    });
    expect(() => ledger.reserve(crashed)).toThrow(CalibrationFatalError);
    expect(recovered.resumable).not.toContainEqual(crashed);
    expect(recovered.resumable).not.toContainEqual(finished);
  });
});

describe('calibration stage gates', () => {
  function gateSummary(passed: boolean): {
    stage: StageName;
    passed: boolean;
    completedStages: StageName[];
  } {
    return {
      stage: 'development',
      passed,
      completedStages: passed ? ['development'] : [],
    };
  }

  it('blocks validation before a passing development selection', () => {
    const world = makeWorld();
    const ledger = makeLedger(world, []);
    ledger.acquireLock(makeOwner());
    expect(() =>
      ledger.assertStageTransition('development', 'validation', gateSummary(false)),
    ).toThrow(CalibrationFatalError);
    ledger.assertStageTransition('development', 'validation', gateSummary(true));
  });

  it('blocks benchmark before passing validation and rejects repeated stages', () => {
    const world = makeWorld();
    const ledger = makeLedger(world, []);
    ledger.acquireLock(makeOwner());
    expect(() =>
      ledger.assertStageTransition('validation', 'benchmark', {
        stage: 'validation',
        passed: false,
        completedStages: ['development'],
      }),
    ).toThrow(CalibrationFatalError);
    expect(() =>
      ledger.assertStageTransition('development', 'development', gateSummary(true)),
    ).toThrow(CalibrationFatalError);
  });
});

describe('calibration git tree gate', () => {
  const PINNED_HEAD = '0e55baedad6099359e17a842d508fc70ab53999e';
  const PINNED_TREE = 'abc123def456abc123def456abc123def456abcd';

  it('refuses a dirty Functions tree including tracked modifications', () => {
    const world = makeWorld();
    const key = makeKey();
    const ledger = makeLedger(world, [key]);
    const dispatch = vi.fn();
    let threw = false;
    try {
      ledger.assertGitState({
        headCommit: PINNED_HEAD,
        functionsTreeId: PINNED_TREE,
        dirtyPaths: ['functions/src/nutrition-eval/runner.ts'],
      });
      ledger.acquireLock(makeOwner());
      ledger.reserve(key);
      dispatch();
    } catch (error) {
      threw = true;
      expect(error).toBeInstanceOf(CalibrationFatalError);
    }
    expect(threw).toBe(true);
    expect(dispatch).not.toHaveBeenCalled();
    expect(world.lockFile).toBeUndefined();
    expect(world.events).toHaveLength(0);
  });

  it('refuses a non-ignored untracked path under functions/', () => {
    const world = makeWorld();
    const key = makeKey();
    const ledger = makeLedger(world, [key]);
    const dispatch = vi.fn();
    let threw = false;
    try {
      // Non-ignored untracked file: it has never been committed and no ignore
      // rule covers it, so a clean-tree gate must still fail closed.
      ledger.assertGitState({
        headCommit: PINNED_HEAD,
        functionsTreeId: PINNED_TREE,
        dirtyPaths: ['functions/src/nutrition-eval/new-unreviewed-helper.ts'],
      });
      ledger.acquireLock(makeOwner());
      ledger.reserve(key);
      dispatch();
    } catch (error) {
      threw = true;
      expect(error).toBeInstanceOf(CalibrationFatalError);
    }
    expect(threw).toBe(true);
    expect(dispatch).not.toHaveBeenCalled();
    expect(world.lockFile).toBeUndefined();
    expect(world.events).toHaveLength(0);
  });

  it('allows a documentation-only HEAD move when the Functions tree is unchanged', () => {
    const world = makeWorld();
    const key = makeKey();
    const ledger = makeLedger(world, [key]);
    // HEAD differs from the pinned implementationCommit, but the derived
    // clean functionsTreeId is exact, so this is a docs-only move.
    ledger.assertGitState({
      headCommit: 'docs-only-commit-fff000111',
      functionsTreeId: PINNED_TREE,
      dirtyPaths: [],
    });
    ledger.acquireLock(makeOwner());
    ledger.reserve(key);
    expect(world.events.length).toBeGreaterThan(0);
    expect(world.lockFile).toBeDefined();
  });

  it('rejects a different Functions tree and never adopts it as the new pin', () => {
    const world = makeWorld();
    const key = makeKey();
    const ledger = makeLedger(world, [key]);
    const dispatch = vi.fn();
    let threw = false;
    try {
      ledger.assertGitState({
        headCommit: 'docs-only-commit-fff000111',
        functionsTreeId: 'different-functions-tree-id',
        dirtyPaths: [],
      });
      ledger.acquireLock(makeOwner());
      ledger.reserve(key);
      dispatch();
    } catch (error) {
      threw = true;
      expect(error).toBeInstanceOf(CalibrationFatalError);
    }
    expect(threw).toBe(true);
    expect(dispatch).not.toHaveBeenCalled();
    // The rejected tree must not become the new pin: the exact pinned tree
    // still verifies through the existing identity gate.
    ledger.assertIdentity(makeIdentity({ functionsTreeId: PINNED_TREE }));
    expect(() =>
      ledger.assertIdentity(
        makeIdentity({ functionsTreeId: 'different-functions-tree-id' }),
      ),
    ).toThrow(CalibrationFatalError);
  });
});

describe('calibration ledger fsync faults', () => {
  it('fails closed on ledger file fsync before dispatch without marking completion', () => {
    const world = makeWorld();
    world.deps.fsyncLedgerFile = () => {
      world.ops.push('fsyncLedgerFile');
      throw new Error('EIO: ledger file fsync failed');
    };
    const key = makeKey();
    const ledger = makeLedger(world, [key]);
    ledger.acquireLock(makeOwner());
    const dispatch = vi.fn();
    let threw = false;
    try {
      ledger.reserve(key);
      dispatch();
    } catch (error) {
      threw = true;
      expect(error).toBeInstanceOf(CalibrationFatalError);
    }
    expect(threw).toBe(true);
    expect(dispatch).not.toHaveBeenCalled();
    expect(world.ops).toContain('fsyncLedgerFile');
    expect(ledger.rebuildReport().completed).not.toContainEqual(key);
  });

  it('fails closed on ledger parent-directory fsync before dispatch without marking completion', () => {
    const world = makeWorld();
    world.deps.fsyncLedgerDir = () => {
      world.ops.push('fsyncLedgerDir');
      throw new Error('EIO: ledger directory fsync failed');
    };
    const key = makeKey();
    const ledger = makeLedger(world, [key]);
    ledger.acquireLock(makeOwner());
    const dispatch = vi.fn();
    let threw = false;
    try {
      ledger.reserve(key);
      dispatch();
    } catch (error) {
      threw = true;
      expect(error).toBeInstanceOf(CalibrationFatalError);
    }
    expect(threw).toBe(true);
    expect(dispatch).not.toHaveBeenCalled();
    expect(world.ops).toContain('fsyncLedgerDir');
    expect(ledger.rebuildReport().completed).not.toContainEqual(key);
  });
});

describe('calibration journal durability', () => {
  it('fsyncs the journaled result file then the parent directory before completion', () => {
    const world = makeWorld();
    const key = makeKey();
    const ledger = makeLedger(world, [key]);
    ledger.acquireLock(makeOwner());
    ledger.reserve(key);
    const mark = world.ops.length;
    const journalHash = ledger.appendResultJournal(makeJournal(key));
    ledger.complete(key, journalHash);
    const tail = world.ops.slice(mark);
    const journalIndex = tail.indexOf('appendJournal');
    const fileIndex = tail.indexOf('fsyncJournalFile');
    const dirIndex = tail.indexOf('fsyncJournalDir');
    const completionIndex = tail.lastIndexOf('appendLedgerEvent');
    expect(journalIndex).toBeGreaterThanOrEqual(0);
    expect(fileIndex).toBeGreaterThan(journalIndex);
    expect(dirIndex).toBeGreaterThan(fileIndex);
    expect(completionIndex).toBeGreaterThan(dirIndex);
    expect(ledger.rebuildReport().completed).toContainEqual(key);
  });

  it('fails closed on journal fsync fault without marking completion', () => {
    const world = makeWorld();
    const key = makeKey();
    const ledger = makeLedger(world, [key]);
    ledger.acquireLock(makeOwner());
    ledger.reserve(key);
    world.deps.fsyncJournalFile = () => {
      world.ops.push('fsyncJournalFile');
      throw new Error('EIO: journal file fsync failed');
    };
    let journalHash: string | undefined;
    let threw = false;
    try {
      journalHash = ledger.appendResultJournal(makeJournal(key));
    } catch (error) {
      threw = true;
      expect(error).toBeInstanceOf(CalibrationFatalError);
    }
    expect(threw).toBe(true);
    expect(journalHash).toBeUndefined();
    expect(() => ledger.complete(key, 'unset-journal-hash')).toThrow(
      CalibrationFatalError,
    );
    expect(ledger.rebuildReport().completed).not.toContainEqual(key);
  });
});

/**
 * Task 6 Step 2 first RED slice: profile selection only.
 *
 * These cases cover ONLY the planned pure `selectCalibrationProfile`
 * lexicographic ordering. They do not prove any stage gate, ledger, journal,
 * lock, fatal-error, or CLI behavior. Expected RED is the missing-module
 * collection failure on `functions/src/nutrition-eval/calibration.ts`.
 */
describe('calibration profile selection', () => {
  interface ProfileMetrics {
    unsafeCount: number;
    parseCount: number;
    catastrophicCount: number;
    meanZeroSafeMacroError?: number;
    medianKcalError?: number;
    p90AnalysisLatencyMs?: number;
  }

  function metrics(overrides: Partial<ProfileMetrics> = {}): ProfileMetrics {
    return {
      unsafeCount: 0,
      parseCount: 24,
      catastrophicCount: 0,
      meanZeroSafeMacroError: 0.1,
      medianKcalError: 0.1,
      p90AnalysisLatencyMs: 1000,
      ...overrides,
    };
  }

  interface SelectionRow {
    name: string;
    low: ProfileMetrics;
    medium: ProfileMetrics;
    expected: 'LOW' | 'MEDIUM';
  }

  const rows: SelectionRow[] = [
    {
      name: 'unsafe count asc dominates every lower priority',
      low: metrics({
        unsafeCount: 0,
        parseCount: 20,
        catastrophicCount: 5,
        meanZeroSafeMacroError: 0.5,
        medianKcalError: 0.4,
        p90AnalysisLatencyMs: 5000,
      }),
      medium: metrics({
        unsafeCount: 1,
        parseCount: 24,
        catastrophicCount: 0,
        meanZeroSafeMacroError: 0.1,
        medianKcalError: 0.1,
        p90AnalysisLatencyMs: 100,
      }),
      expected: 'LOW',
    },
    {
      name: 'parse count desc beats better catastrophic/error/latency',
      low: metrics({
        parseCount: 24,
        catastrophicCount: 5,
        meanZeroSafeMacroError: 0.5,
        medianKcalError: 0.4,
        p90AnalysisLatencyMs: 5000,
      }),
      medium: metrics({
        parseCount: 20,
        catastrophicCount: 0,
        meanZeroSafeMacroError: 0.1,
        medianKcalError: 0.1,
        p90AnalysisLatencyMs: 100,
      }),
      expected: 'LOW',
    },
    {
      name: 'catastrophic count asc beats better errors and latency',
      low: metrics({
        catastrophicCount: 1,
        meanZeroSafeMacroError: 0.5,
        medianKcalError: 0.4,
        p90AnalysisLatencyMs: 5000,
      }),
      medium: metrics({
        catastrophicCount: 4,
        meanZeroSafeMacroError: 0.1,
        medianKcalError: 0.1,
        p90AnalysisLatencyMs: 100,
      }),
      expected: 'LOW',
    },
    {
      name: 'mean zero-safe macro error asc beats better kcal and latency',
      low: metrics({
        meanZeroSafeMacroError: 0.3,
        medianKcalError: 0.4,
        p90AnalysisLatencyMs: 5000,
      }),
      medium: metrics({
        meanZeroSafeMacroError: 0.4,
        medianKcalError: 0.1,
        p90AnalysisLatencyMs: 100,
      }),
      expected: 'LOW',
    },
    {
      name: 'median kcal error asc beats better latency',
      low: metrics({ medianKcalError: 0.2, p90AnalysisLatencyMs: 5000 }),
      medium: metrics({ medianKcalError: 0.3, p90AnalysisLatencyMs: 100 }),
      expected: 'LOW',
    },
    {
      name: 'p90 analysis-only latency asc decides the final priority',
      low: metrics({ p90AnalysisLatencyMs: 1200 }),
      medium: metrics({ p90AnalysisLatencyMs: 2500 }),
      expected: 'LOW',
    },
    {
      name: 'zero parses rank worst even with perfect later metrics',
      low: metrics({
        parseCount: 0,
        catastrophicCount: 0,
        meanZeroSafeMacroError: 0.0,
        medianKcalError: 0.0,
        p90AnalysisLatencyMs: 1,
      }),
      medium: metrics({
        parseCount: 1,
        catastrophicCount: 100,
        meanZeroSafeMacroError: 10,
        medianKcalError: 10,
        p90AnalysisLatencyMs: 100000,
      }),
      expected: 'MEDIUM',
    },
    {
      name: 'both zero parses tie downstream infinities to MEDIUM despite better raw numbers',
      low: metrics({
        parseCount: 0,
        catastrophicCount: 0,
        meanZeroSafeMacroError: 0.0,
        medianKcalError: 0.0,
        p90AnalysisLatencyMs: 1,
      }),
      medium: metrics({
        parseCount: 0,
        catastrophicCount: 0,
        meanZeroSafeMacroError: 10,
        medianKcalError: 10,
        p90AnalysisLatencyMs: 100000,
      }),
      expected: 'MEDIUM',
    },
    {
      name: 'both zero parses still order by catastrophic count first',
      low: metrics({
        parseCount: 0,
        catastrophicCount: 0,
        meanZeroSafeMacroError: 10,
        medianKcalError: 10,
        p90AnalysisLatencyMs: 100000,
      }),
      medium: metrics({
        parseCount: 0,
        catastrophicCount: 5,
        meanZeroSafeMacroError: 0.0,
        medianKcalError: 0.0,
        p90AnalysisLatencyMs: 1,
      }),
      expected: 'LOW',
    },
    {
      name: 'undefined mean zero-safe macro error ranks worst',
      low: metrics({
        meanZeroSafeMacroError: undefined,
        medianKcalError: 0.01,
        p90AnalysisLatencyMs: 10,
      }),
      medium: metrics({
        meanZeroSafeMacroError: 5.0,
        medianKcalError: 9.0,
        p90AnalysisLatencyMs: 90000,
      }),
      expected: 'MEDIUM',
    },
    {
      name: 'undefined median kcal error ranks worst',
      low: metrics({ medianKcalError: undefined, p90AnalysisLatencyMs: 10 }),
      medium: metrics({ medianKcalError: 5.0, p90AnalysisLatencyMs: 90000 }),
      expected: 'MEDIUM',
    },
    {
      name: 'undefined p90 analysis latency ranks worst',
      low: metrics({ p90AnalysisLatencyMs: undefined }),
      medium: metrics({ p90AnalysisLatencyMs: 90000 }),
      expected: 'MEDIUM',
    },
    {
      name: 'tied undefined means fall through to the next priority',
      low: metrics({
        meanZeroSafeMacroError: undefined,
        medianKcalError: 0.2,
      }),
      medium: metrics({
        meanZeroSafeMacroError: undefined,
        medianKcalError: 0.3,
      }),
      expected: 'LOW',
    },
    {
      name: 'exact full JavaScript-number tie selects MEDIUM',
      low: metrics(),
      medium: metrics(),
      expected: 'MEDIUM',
    },
  ];

  it.each(rows)('$name', ({ low, medium, expected }) => {
    expect(selectCalibrationProfile(low, medium)).toBe(expected);
  });

  it('reverses the latency decision when MEDIUM is faster analysis-only', () => {
    const low = metrics({ p90AnalysisLatencyMs: 2500 });
    const medium = metrics({ p90AnalysisLatencyMs: 1200 });
    expect(selectCalibrationProfile(low, medium)).toBe('MEDIUM');
  });
});

/**
 * Task 6 Step 2 RED-only slice: development stage gate only.
 *
 * Covers ONLY the planned pure `evaluateCalibrationStageGate('development',
 * metrics).passed`. Development expects 24 scored outcomes with at least 23
 * parses accepted (one parse failure allowed): `totalCases`/`runCases` exactly
 * 24, `parseCases >= 23`, `unsafeCompletionCount` exactly 0,
 * `catastrophicCount <= 6`, `medianRelativeCalorieError <= 0.35`,
 * `meanZeroSafeMacroRelativeError <= 0.50`, `p90AnalysisLatencyMs <= 30000`.
 * Inclusive boundaries pass; each threshold is broken one at a time just
 * over/under; wrong total/run counts fail; undefined required error/latency
 * metrics fail closed. No validation/benchmark gate is added here. Expected
 * RED is the missing-module collection failure on
 * `functions/src/nutrition-eval/calibration.ts`. All fixtures are in-memory;
 * no real fs, /proc, provider, Firebase, or network access occurs here.
 */
describe('calibration development stage gate', () => {
  interface DevelopmentGateMetrics {
    totalCases: number;
    runCases: number;
    parseCases: number;
    unsafeCompletionCount: number;
    catastrophicCount: number;
    medianRelativeCalorieError?: number;
    meanZeroSafeMacroRelativeError?: number;
    p90AnalysisLatencyMs?: number;
  }

  function devMetrics(
    overrides: Partial<DevelopmentGateMetrics> = {},
  ): DevelopmentGateMetrics {
    return {
      totalCases: 24,
      runCases: 24,
      parseCases: 24,
      unsafeCompletionCount: 0,
      catastrophicCount: 0,
      medianRelativeCalorieError: 0.1,
      meanZeroSafeMacroRelativeError: 0.1,
      p90AnalysisLatencyMs: 1000,
      ...overrides,
    };
  }

  interface GateRow {
    name: string;
    metrics: DevelopmentGateMetrics;
    expected: boolean;
  }

  const rows: GateRow[] = [
    {
      name: 'exact inclusive boundary passes with 23 parses accepted',
      metrics: devMetrics({
        parseCases: 23,
        catastrophicCount: 6,
        medianRelativeCalorieError: 0.35,
        meanZeroSafeMacroRelativeError: 0.5,
        p90AnalysisLatencyMs: 30000,
      }),
      expected: true,
    },
    {
      name: 'full 24 parses pass',
      metrics: devMetrics(),
      expected: true,
    },
    {
      name: 'parseCases 22 fails (one under the 23 minimum)',
      metrics: devMetrics({ parseCases: 22 }),
      expected: false,
    },
    {
      name: 'single unsafe completion fails',
      metrics: devMetrics({ unsafeCompletionCount: 1 }),
      expected: false,
    },
    {
      name: 'catastrophicCount 7 fails (one over the 6 maximum)',
      metrics: devMetrics({ catastrophicCount: 7 }),
      expected: false,
    },
    {
      name: 'median calorie error just over 0.35 fails',
      metrics: devMetrics({ medianRelativeCalorieError: 0.351 }),
      expected: false,
    },
    {
      name: 'mean zero-safe macro error just over 0.50 fails',
      metrics: devMetrics({ meanZeroSafeMacroRelativeError: 0.501 }),
      expected: false,
    },
    {
      name: 'p90 analysis latency just over 30000ms fails',
      metrics: devMetrics({ p90AnalysisLatencyMs: 30001 }),
      expected: false,
    },
    {
      name: 'wrong totalCases count fails',
      metrics: devMetrics({ totalCases: 23 }),
      expected: false,
    },
    {
      name: 'wrong runCases count fails',
      metrics: devMetrics({ runCases: 23 }),
      expected: false,
    },
    {
      name: 'undefined median calorie error fails closed',
      metrics: devMetrics({ medianRelativeCalorieError: undefined }),
      expected: false,
    },
    {
      name: 'undefined mean zero-safe macro error fails closed',
      metrics: devMetrics({ meanZeroSafeMacroRelativeError: undefined }),
      expected: false,
    },
    {
      name: 'undefined p90 analysis latency fails closed',
      metrics: devMetrics({ p90AnalysisLatencyMs: undefined }),
      expected: false,
    },
  ];

  it.each(rows)('$name', ({ metrics, expected }) => {
    expect(evaluateCalibrationStageGate('development', metrics).passed).toBe(
      expected,
    );
  });
});

/**
 * Task 6 Step 2 RED-only slice: validation stage gate only.
 *
 * Covers ONLY the planned pure `evaluateCalibrationStageGate('validation',
 * metrics).passed`. Validation expects exactly 48 scored outcomes (16 cases x
 * 3 samples) with at least 46 parses accepted (two parse failures allowed):
 * `totalCases`/`runCases` exactly 48, `parseCases >= 46`,
 * `unsafeCompletionCount` exactly 0, `catastrophicCount <= 8`,
 * `medianRelativeCalorieError <= 0.25`, `p90RelativeCalorieError <= 0.90`,
 * `meanZeroSafeMacroRelativeError <= 0.45`, each positive-truth per-macro
 * median (`medianProteinRelativeError`, `medianCarbsRelativeError`,
 * `medianFatRelativeError`) each `<= 0.35`, `medianMealMassRelativeError <=
 * 0.35`, `p90AnalysisLatencyMs <= 30000`.
 *
 * Every parsed validation outcome is a meal, so `parsedMealCount` must equal
 * `parseCases`, and each diagnostic population must equal `parsedMealCount`:
 * `mealMassEligibleCount`, `mealDensityCoverageCount`,
 * `mealCarbDensityEligibleCount`, `mealFatDensityEligibleCount`. The crucial
 * positive boundary is 46/48 parses with exactly 46/46 diagnostics passing;
 * parse failures are governed only by the parse gate and must not create a
 * contradictory 48/48 diagnostic requirement. Missing diagnostics fail
 * coverage rather than shrinking denominators; undefined required error or
 * latency metrics fail closed. Field names match the scorer summary contract.
 * No benchmark gate is added here. Expected RED is the missing-module
 * collection failure on `functions/src/nutrition-eval/calibration.ts`. All
 * fixtures are in-memory; no real fs, /proc, provider, Firebase, or network
 * access occurs here.
 */
describe('calibration validation stage gate', () => {
  interface ValidationGateMetrics {
    totalCases: number;
    runCases: number;
    parseCases: number;
    unsafeCompletionCount: number;
    catastrophicCount: number;
    medianRelativeCalorieError?: number;
    p90RelativeCalorieError?: number;
    meanZeroSafeMacroRelativeError?: number;
    medianProteinRelativeError?: number;
    medianCarbsRelativeError?: number;
    medianFatRelativeError?: number;
    medianMealMassRelativeError?: number;
    parsedMealCount: number;
    mealMassEligibleCount: number;
    mealDensityCoverageCount: number;
    mealCarbDensityEligibleCount: number;
    mealFatDensityEligibleCount: number;
    p90AnalysisLatencyMs?: number;
  }

  function validationMetrics(
    overrides: Partial<ValidationGateMetrics> = {},
  ): ValidationGateMetrics {
    return {
      totalCases: 48,
      runCases: 48,
      parseCases: 48,
      unsafeCompletionCount: 0,
      catastrophicCount: 0,
      medianRelativeCalorieError: 0.1,
      p90RelativeCalorieError: 0.4,
      meanZeroSafeMacroRelativeError: 0.2,
      medianProteinRelativeError: 0.2,
      medianCarbsRelativeError: 0.2,
      medianFatRelativeError: 0.2,
      medianMealMassRelativeError: 0.2,
      parsedMealCount: 48,
      mealMassEligibleCount: 48,
      mealDensityCoverageCount: 48,
      mealCarbDensityEligibleCount: 48,
      mealFatDensityEligibleCount: 48,
      p90AnalysisLatencyMs: 1000,
      ...overrides,
    };
  }

  function validationBoundary(): ValidationGateMetrics {
    return validationMetrics({
      parseCases: 46,
      catastrophicCount: 8,
      medianRelativeCalorieError: 0.25,
      p90RelativeCalorieError: 0.9,
      meanZeroSafeMacroRelativeError: 0.45,
      medianProteinRelativeError: 0.35,
      medianCarbsRelativeError: 0.35,
      medianFatRelativeError: 0.35,
      medianMealMassRelativeError: 0.35,
      parsedMealCount: 46,
      mealMassEligibleCount: 46,
      mealDensityCoverageCount: 46,
      mealCarbDensityEligibleCount: 46,
      mealFatDensityEligibleCount: 46,
      p90AnalysisLatencyMs: 30000,
    });
  }

  interface GateRow {
    name: string;
    metrics: ValidationGateMetrics;
    expected: boolean;
  }

  const rows: GateRow[] = [
    {
      name: 'exact inclusive boundary passes with 46 parses and 46 diagnostics',
      metrics: validationBoundary(),
      expected: true,
    },
    {
      name: 'full 48 parses with 48 diagnostics passes',
      metrics: validationMetrics(),
      expected: true,
    },
    {
      name: 'parseCases 45 fails (one under the 46 minimum)',
      metrics: validationMetrics({
        parseCases: 45,
        parsedMealCount: 45,
        mealMassEligibleCount: 45,
        mealDensityCoverageCount: 45,
        mealCarbDensityEligibleCount: 45,
        mealFatDensityEligibleCount: 45,
      }),
      expected: false,
    },
    {
      name: 'wrong totalCases count fails',
      metrics: validationMetrics({ totalCases: 47 }),
      expected: false,
    },
    {
      name: 'wrong runCases count fails',
      metrics: validationMetrics({ runCases: 47 }),
      expected: false,
    },
    {
      name: 'single unsafe completion fails',
      metrics: validationMetrics({ unsafeCompletionCount: 1 }),
      expected: false,
    },
    {
      name: 'catastrophicCount 9 fails (one over the 8 maximum)',
      metrics: validationMetrics({ catastrophicCount: 9 }),
      expected: false,
    },
    {
      name: 'median calorie error just over 0.25 fails',
      metrics: validationMetrics({ medianRelativeCalorieError: 0.251 }),
      expected: false,
    },
    {
      name: 'p90 calorie error just over 0.90 fails',
      metrics: validationMetrics({ p90RelativeCalorieError: 0.901 }),
      expected: false,
    },
    {
      name: 'mean zero-safe macro error just over 0.45 fails',
      metrics: validationMetrics({ meanZeroSafeMacroRelativeError: 0.451 }),
      expected: false,
    },
    {
      name: 'median protein error just over 0.35 fails',
      metrics: validationMetrics({ medianProteinRelativeError: 0.351 }),
      expected: false,
    },
    {
      name: 'median carbs error just over 0.35 fails',
      metrics: validationMetrics({ medianCarbsRelativeError: 0.351 }),
      expected: false,
    },
    {
      name: 'median fat error just over 0.35 fails',
      metrics: validationMetrics({ medianFatRelativeError: 0.351 }),
      expected: false,
    },
    {
      name: 'median meal mass error just over 0.35 fails',
      metrics: validationMetrics({ medianMealMassRelativeError: 0.351 }),
      expected: false,
    },
    {
      name: 'p90 analysis latency just over 30000ms fails',
      metrics: validationMetrics({ p90AnalysisLatencyMs: 30001 }),
      expected: false,
    },
    {
      name: 'parsedMealCount below parseCases fails diagnostic coverage',
      metrics: validationMetrics({ parsedMealCount: 47 }),
      expected: false,
    },
    {
      name: 'missing meal mass population fails diagnostic coverage',
      metrics: validationMetrics({ mealMassEligibleCount: 47 }),
      expected: false,
    },
    {
      name: 'missing meal density coverage fails diagnostic coverage',
      metrics: validationMetrics({ mealDensityCoverageCount: 47 }),
      expected: false,
    },
    {
      name: 'missing meal carb density population fails diagnostic coverage',
      metrics: validationMetrics({ mealCarbDensityEligibleCount: 47 }),
      expected: false,
    },
    {
      name: 'missing meal fat density population fails diagnostic coverage',
      metrics: validationMetrics({ mealFatDensityEligibleCount: 47 }),
      expected: false,
    },
    {
      name: 'undefined median calorie error fails closed',
      metrics: validationMetrics({ medianRelativeCalorieError: undefined }),
      expected: false,
    },
    {
      name: 'undefined p90 calorie error fails closed',
      metrics: validationMetrics({ p90RelativeCalorieError: undefined }),
      expected: false,
    },
    {
      name: 'undefined mean zero-safe macro error fails closed',
      metrics: validationMetrics({ meanZeroSafeMacroRelativeError: undefined }),
      expected: false,
    },
    {
      name: 'undefined median protein error fails closed',
      metrics: validationMetrics({ medianProteinRelativeError: undefined }),
      expected: false,
    },
    {
      name: 'undefined median carbs error fails closed',
      metrics: validationMetrics({ medianCarbsRelativeError: undefined }),
      expected: false,
    },
    {
      name: 'undefined median fat error fails closed',
      metrics: validationMetrics({ medianFatRelativeError: undefined }),
      expected: false,
    },
    {
      name: 'undefined median meal mass error fails closed',
      metrics: validationMetrics({ medianMealMassRelativeError: undefined }),
      expected: false,
    },
    {
      name: 'undefined p90 analysis latency fails closed',
      metrics: validationMetrics({ p90AnalysisLatencyMs: undefined }),
      expected: false,
    },
  ];

  it.each(rows)('$name', ({ metrics, expected }) => {
    expect(evaluateCalibrationStageGate('validation', metrics).passed).toBe(
      expected,
    );
  });
});

/**
 * Task 6 Step 2 RED-only slice: benchmark stage gate only.
 *
 * Covers ONLY the planned pure `evaluateCalibrationStageGate('benchmark',
 * metrics).passed`. Benchmark expects exactly 60 scored outcomes with 60
 * parses: `totalCases`/`runCases`/`totalOutcomes`/`parseCases` each exactly
 * 60, `unsafeCompletionCount` exactly 0, `failureCount` exactly 0,
 * `catastrophicCount <= 12`, `medianRelativeCalorieError <= 0.25`,
 * `p90RelativeCalorieError <= 0.90`, legacy `meanMacroRelativeError <= 0.45`,
 * `meanMealMassRelativeError <= 0.40`,
 * `meanMealCarbDensityRelativeError <= 0.70`,
 * `meanMealFatDensityRelativeError <= 0.35`, and three MEAL-ONLY
 * positive-truth macro medians (`medianMealProteinRelativeError`,
 * `medianMealCarbsRelativeError`, `medianMealFatRelativeError`) each
 * `<= 0.35` over meal outcomes with positive truth (protein 36, fat 36,
 * carbs 33: frozen `n5k-dish_1566328724` has `truth.carbsG=0` so its 3
 * samples yield complete density diagnostics but no relative
 * carbohydrate-density error).
 *
 * Population isolation: `mealOutcomeCount` exactly 36,
 * `suppliedBarcodeOutcomeCount` exactly 12, `labelOutcomeCount` exactly 12
 * (36 + 12 + 12 = 60). The meal-only medians must be computed over parsed
 * meal outcomes with positive truth only (protein/fat 36, carbs 33);
 * generic all-row medians must not satisfy this gate, so this slice uses only the explicit `medianMeal*` fields and never
 * asserts a generic `medianProtein/Carbs/FatRelativeError` field.
 *
 * Diagnostics: every parsed meal must carry mass/density diagnostics, so
 * `parsedMealCount`, `mealMassEligibleCount`, `mealDensityCoverageCount`,
 * and `mealFatDensityEligibleCount` each equal exactly 36, while
 * `mealCarbDensityEligibleCount` equals exactly 33 (36 - 3 zero-carb
 * samples of frozen `n5k-dish_1566328724` with `truth.carbsG=0`, which
 * have complete density diagnostics but no relative carb-density error
 * because the scorer returns no relativeError on zero truth). Missing
 * diagnostics fail coverage rather than shrinking denominators; the 36/36
 * complete diagnostic coverage requirement is not weakened.
 *
 * Call accounting (explicit enriched fields supplied by the calibration gate
 * input builder, not implied by the generic scorer summary):
 * `visionCallCount` exactly 48, with zero image/vision/live-OFF calls for
 * all 12 supplied-barcode outcomes (`suppliedBarcodeImageCallCount`,
 * `suppliedBarcodeVisionCallCount`, `suppliedBarcodeLiveOffCallCount` each
 * exactly 0).
 *
 * Inclusive boundaries pass; each threshold/count/population is broken one
 * at a time just over/under; undefined required error metrics fail closed.
 * No development/validation gate is modified here. Expected RED is the
 * missing-module collection failure on
 * `functions/src/nutrition-eval/calibration.ts`. All fixtures are in-memory;
 * no real fs, /proc, provider, Firebase, or network access occurs here.
 */
describe('calibration benchmark stage gate', () => {
  interface BenchmarkGateMetrics {
    totalCases: number;
    runCases: number;
    totalOutcomes: number;
    parseCases: number;
    unsafeCompletionCount: number;
    failureCount: number;
    catastrophicCount: number;
    medianRelativeCalorieError?: number;
    p90RelativeCalorieError?: number;
    meanMacroRelativeError?: number;
    meanMealMassRelativeError?: number;
    meanMealCarbDensityRelativeError?: number;
    meanMealFatDensityRelativeError?: number;
    medianMealProteinRelativeError?: number;
    medianMealCarbsRelativeError?: number;
    medianMealFatRelativeError?: number;
    mealOutcomeCount: number;
    suppliedBarcodeOutcomeCount: number;
    labelOutcomeCount: number;
    parsedMealCount: number;
    mealMassEligibleCount: number;
    mealDensityCoverageCount: number;
    mealCarbDensityEligibleCount: number;
    mealFatDensityEligibleCount: number;
    visionCallCount: number;
    suppliedBarcodeImageCallCount: number;
    suppliedBarcodeVisionCallCount: number;
    suppliedBarcodeLiveOffCallCount: number;
  }

  function benchmarkMetrics(
    overrides: Partial<BenchmarkGateMetrics> = {},
  ): BenchmarkGateMetrics {
    return {
      totalCases: 60,
      runCases: 60,
      totalOutcomes: 60,
      parseCases: 60,
      unsafeCompletionCount: 0,
      failureCount: 0,
      catastrophicCount: 0,
      medianRelativeCalorieError: 0.1,
      p90RelativeCalorieError: 0.4,
      meanMacroRelativeError: 0.2,
      meanMealMassRelativeError: 0.2,
      meanMealCarbDensityRelativeError: 0.4,
      meanMealFatDensityRelativeError: 0.2,
      medianMealProteinRelativeError: 0.2,
      medianMealCarbsRelativeError: 0.2,
      medianMealFatRelativeError: 0.2,
      mealOutcomeCount: 36,
      suppliedBarcodeOutcomeCount: 12,
      labelOutcomeCount: 12,
      parsedMealCount: 36,
      mealMassEligibleCount: 36,
      mealDensityCoverageCount: 36,
      mealCarbDensityEligibleCount: 33,
      mealFatDensityEligibleCount: 36,
      visionCallCount: 48,
      suppliedBarcodeImageCallCount: 0,
      suppliedBarcodeVisionCallCount: 0,
      suppliedBarcodeLiveOffCallCount: 0,
      ...overrides,
    };
  }

  function benchmarkBoundary(): BenchmarkGateMetrics {
    return benchmarkMetrics({
      catastrophicCount: 12,
      medianRelativeCalorieError: 0.25,
      p90RelativeCalorieError: 0.9,
      meanMacroRelativeError: 0.45,
      meanMealMassRelativeError: 0.4,
      meanMealCarbDensityRelativeError: 0.7,
      meanMealFatDensityRelativeError: 0.35,
      medianMealProteinRelativeError: 0.35,
      medianMealCarbsRelativeError: 0.35,
      medianMealFatRelativeError: 0.35,
      mealCarbDensityEligibleCount: 33,
    });
  }

  interface GateRow {
    name: string;
    metrics: BenchmarkGateMetrics;
    expected: boolean;
  }

  const rows: GateRow[] = [
    {
      name: 'exact inclusive boundary passes with 60/60, 36/36 complete diagnostics and 33 carb-density eligible',
      metrics: benchmarkBoundary(),
      expected: true,
    },
    {
      name: 'clean mid-range values pass',
      metrics: benchmarkMetrics(),
      expected: true,
    },
    {
      name: 'wrong totalCases count fails',
      metrics: benchmarkMetrics({ totalCases: 59 }),
      expected: false,
    },
    {
      name: 'wrong runCases count fails',
      metrics: benchmarkMetrics({ runCases: 59 }),
      expected: false,
    },
    {
      name: 'wrong totalOutcomes count fails',
      metrics: benchmarkMetrics({ totalOutcomes: 59 }),
      expected: false,
    },
    {
      name: 'parseCases 59 fails (one under the exact 60)',
      metrics: benchmarkMetrics({ parseCases: 59 }),
      expected: false,
    },
    {
      name: 'single unsafe completion fails',
      metrics: benchmarkMetrics({ unsafeCompletionCount: 1 }),
      expected: false,
    },
    {
      name: 'single scored failure fails',
      metrics: benchmarkMetrics({ failureCount: 1 }),
      expected: false,
    },
    {
      name: 'catastrophicCount 13 fails (one over the 12 maximum)',
      metrics: benchmarkMetrics({ catastrophicCount: 13 }),
      expected: false,
    },
    {
      name: 'median calorie error just over 0.25 fails',
      metrics: benchmarkMetrics({ medianRelativeCalorieError: 0.251 }),
      expected: false,
    },
    {
      name: 'p90 calorie error just over 0.90 fails',
      metrics: benchmarkMetrics({ p90RelativeCalorieError: 0.901 }),
      expected: false,
    },
    {
      name: 'legacy mean macro error just over 0.45 fails',
      metrics: benchmarkMetrics({ meanMacroRelativeError: 0.451 }),
      expected: false,
    },
    {
      name: 'mean meal mass error just over 0.40 fails',
      metrics: benchmarkMetrics({ meanMealMassRelativeError: 0.401 }),
      expected: false,
    },
    {
      name: 'mean meal carb density error just over 0.70 fails',
      metrics: benchmarkMetrics({ meanMealCarbDensityRelativeError: 0.701 }),
      expected: false,
    },
    {
      name: 'mean meal fat density error just over 0.35 fails',
      metrics: benchmarkMetrics({ meanMealFatDensityRelativeError: 0.351 }),
      expected: false,
    },
    {
      name: 'meal-only median protein error just over 0.35 fails',
      metrics: benchmarkMetrics({ medianMealProteinRelativeError: 0.351 }),
      expected: false,
    },
    {
      name: 'meal-only median carbs error just over 0.35 fails',
      metrics: benchmarkMetrics({ medianMealCarbsRelativeError: 0.351 }),
      expected: false,
    },
    {
      name: 'meal-only median fat error just over 0.35 fails',
      metrics: benchmarkMetrics({ medianMealFatRelativeError: 0.351 }),
      expected: false,
    },
    {
      name: 'mealOutcomeCount 35 fails (one under the exact 36)',
      metrics: benchmarkMetrics({ mealOutcomeCount: 35 }),
      expected: false,
    },
    {
      name: 'suppliedBarcodeOutcomeCount 11 fails (one under the exact 12)',
      metrics: benchmarkMetrics({ suppliedBarcodeOutcomeCount: 11 }),
      expected: false,
    },
    {
      name: 'labelOutcomeCount 11 fails (one under the exact 12)',
      metrics: benchmarkMetrics({ labelOutcomeCount: 11 }),
      expected: false,
    },
    {
      name: 'parsedMealCount below 36 fails diagnostic coverage',
      metrics: benchmarkMetrics({ parsedMealCount: 35 }),
      expected: false,
    },
    {
      name: 'missing meal mass population fails diagnostic coverage',
      metrics: benchmarkMetrics({ mealMassEligibleCount: 35 }),
      expected: false,
    },
    {
      name: 'missing meal density coverage fails diagnostic coverage',
      metrics: benchmarkMetrics({ mealDensityCoverageCount: 35 }),
      expected: false,
    },
    {
      name: 'missing meal carb density population fails when 32 not exact 33',
      metrics: benchmarkMetrics({ mealCarbDensityEligibleCount: 32 }),
      expected: false,
    },
    {
      name: 'missing meal fat density population fails diagnostic coverage',
      metrics: benchmarkMetrics({ mealFatDensityEligibleCount: 35 }),
      expected: false,
    },
    {
      name: 'visionCallCount 47 fails (one under the exact 48)',
      metrics: benchmarkMetrics({ visionCallCount: 47 }),
      expected: false,
    },
    {
      name: 'visionCallCount 49 fails (one over the exact 48)',
      metrics: benchmarkMetrics({ visionCallCount: 49 }),
      expected: false,
    },
    {
      name: 'single supplied-barcode image call fails isolation',
      metrics: benchmarkMetrics({ suppliedBarcodeImageCallCount: 1 }),
      expected: false,
    },
    {
      name: 'single supplied-barcode vision call fails isolation',
      metrics: benchmarkMetrics({ suppliedBarcodeVisionCallCount: 1 }),
      expected: false,
    },
    {
      name: 'single supplied-barcode live-OFF call fails isolation',
      metrics: benchmarkMetrics({ suppliedBarcodeLiveOffCallCount: 1 }),
      expected: false,
    },
    {
      name: 'undefined median calorie error fails closed',
      metrics: benchmarkMetrics({ medianRelativeCalorieError: undefined }),
      expected: false,
    },
    {
      name: 'undefined p90 calorie error fails closed',
      metrics: benchmarkMetrics({ p90RelativeCalorieError: undefined }),
      expected: false,
    },
    {
      name: 'undefined legacy mean macro error fails closed',
      metrics: benchmarkMetrics({ meanMacroRelativeError: undefined }),
      expected: false,
    },
    {
      name: 'undefined mean meal mass error fails closed',
      metrics: benchmarkMetrics({ meanMealMassRelativeError: undefined }),
      expected: false,
    },
    {
      name: 'undefined mean meal carb density error fails closed',
      metrics: benchmarkMetrics({ meanMealCarbDensityRelativeError: undefined }),
      expected: false,
    },
    {
      name: 'undefined mean meal fat density error fails closed',
      metrics: benchmarkMetrics({ meanMealFatDensityRelativeError: undefined }),
      expected: false,
    },
    {
      name: 'undefined meal-only median protein error fails closed',
      metrics: benchmarkMetrics({ medianMealProteinRelativeError: undefined }),
      expected: false,
    },
    {
      name: 'undefined meal-only median carbs error fails closed',
      metrics: benchmarkMetrics({ medianMealCarbsRelativeError: undefined }),
      expected: false,
    },
    {
      name: 'undefined meal-only median fat error fails closed',
      metrics: benchmarkMetrics({ medianMealFatRelativeError: undefined }),
      expected: false,
    },
  ];

  it.each(rows)('$name', ({ metrics, expected }) => {
    expect(evaluateCalibrationStageGate('benchmark', metrics).passed).toBe(
      expected,
    );
  });
});
