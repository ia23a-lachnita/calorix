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
