/**
 * Task 1 RED: authoritative locked replay, ordered recovery audit, poison.
 *
 * Desired fix (not yet applied): `acquireLock` must archive the stale owner,
 * acquire the new wx lock, mark held owner, reset all replay state and reread
 * journal/events under exclusive ownership, then append the recovery audit.
 * Fresh acquisition also refreshes. No audit/write on failed archive/wx.
 * Failed under-lock refresh permanently poisons the instance: every public
 * method (including getters, release, acquire, recover) throws a fresh static
 * causeless fatal before any dependency operation, retaining the lock.
 * Crash recovery requires held ownership.
 *
 * Current source replays only at construction and audits before archive, so
 * the backing-store update, ordering, poison, and ownership tests below RED.
 *
 * Injected fakes only; no real fs/proc/provider/network access.
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';
import {
  HARD_CALL_CEILING,
  PLANNED_IMAGE_CALLS,
  createCalibrationLedger,
} from '../../src/nutrition-eval/calibration';
import type {
  CalibrationIdentity,
  CalibrationLedgerDeps,
  CalibrationOwner,
  JournalEntry,
  ReservationKey,
  TokenCountReservationKey,
} from '../../src/nutrition-eval/calibration';

const DEV_CASE_A = 'calibration-dish_1565117892';
const DEV_CASE_B = 'calibration-dish_1566844803';

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

function journalHashFor(entry: JournalEntry): string {
  return createHash('sha256').update(JSON.stringify(entry)).digest('hex');
}

function makeTokenKey(overrides: Partial<TokenCountReservationKey> = {}): TokenCountReservationKey {
  return {
    kind: 'token_count',
    stage: 'preflight',
    caseId: DEV_CASE_A,
    model: 'gemini-3.8-flash',
    ...overrides,
  };
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

interface FakeBacking {
  lock: CalibrationOwner | undefined;
  liveness: 'live' | 'dead' | 'unknown';
  events: unknown[];
  journals: JournalEntry[];
  ops: string[];
  deps: CalibrationLedgerDeps;
  failJournalReadsAfterConstruction: boolean;
  failLedgerReadsAfterConstruction: boolean;
  privateMarker: string;
  readCalls: number;
}

function makeBacking(liveness: 'live' | 'dead' | 'unknown' = 'live'): FakeBacking {
  const ops: string[] = [];
  const events: unknown[] = [];
  const journals: JournalEntry[] = [];
  const backing = {
    lock: undefined as CalibrationOwner | undefined,
    liveness,
    events,
    journals,
    ops,
    failJournalReadsAfterConstruction: false,
    failLedgerReadsAfterConstruction: false,
    privateMarker: 'SECRET-private-journal-bytes-xyz',
    readCalls: 0,
    deps: undefined as unknown as CalibrationLedgerDeps,
  };
  const deps: CalibrationLedgerDeps = {
    getRoot: () => '.nutrition-eval/calibration/calorix-gemini-38-calibration-v1/',
    readLock: () => backing.lock,
    writeLockExclusive: (owner: CalibrationOwner) => {
      ops.push('writeLockExclusive');
      if (backing.lock !== undefined) throw new CalibrationFatalError('lock:already-held');
      backing.lock = owner;
    },
    archiveLock: (owner: CalibrationOwner) => {
      ops.push('archiveLock');
      if (backing.lock === undefined || !sameOwner(backing.lock, owner)) {
        throw new CalibrationFatalError('lock:archive-foreign');
      }
      backing.lock = undefined;
    },
    removeLock: (owner: CalibrationOwner) => {
      ops.push('removeLock');
      if (backing.lock === undefined || !sameOwner(backing.lock, owner)) {
        throw new Error('lock:not-owner');
      }
      backing.lock = undefined;
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
    probeOwnerLiveness: () => {
      ops.push('probeOwnerLiveness');
      return backing.liveness;
    },
    nowIso: () => '2026-09-30T00:00:00.000Z',
    readLedgerEvents: () => {
      ops.push('readLedgerEvents');
      backing.readCalls += 1;
      if (backing.failLedgerReadsAfterConstruction && backing.readCalls > 2) {
        throw new Error(`EIO: ${backing.privateMarker} ledger unavailable`);
      }
      return [...events];
    },
    readJournalEntries: () => {
      ops.push('readJournalEntries');
      backing.readCalls += 1;
      if (backing.failJournalReadsAfterConstruction && backing.readCalls > 2) {
        throw Object.assign(new Error(`EACCES: ${backing.privateMarker}`), {
          privateBytes: backing.privateMarker,
        });
      }
      return [...journals];
    },
  };
  backing.deps = deps;
  return backing;
}

function expectStaticCauselessFatal(error: unknown, privateMarker: string): void {
  expect(error).toBeInstanceOf(CalibrationFatalError);
  const message = (error as CalibrationFatalError).message;
  expect(message.startsWith('calibration:')).toBe(true);
  expect(message).not.toContain(privateMarker);
  expect((error as CalibrationFatalError).cause).toBeUndefined();
}

describe('calibration authoritative replay under exclusive lock', () => {
  it('fresh acquisition refreshes disk updates made between construction and acquire without doubling', () => {
    const backing = makeBacking('live');
    const keyA = makeKey({ caseId: DEV_CASE_A });
    const keyB = makeKey({ caseId: DEV_CASE_B });
    // Disk already holds one reservation at construction time.
    backing.events.push({ type: 'reserved', key: keyA, at: backing.deps.nowIso() });
    const ledger = createCalibrationLedger(backing.deps, makeIdentity(), [keyA, keyB]);
    expect(ledger.getCounts().imageReserved).toBe(1);
    // Disk gains a second reservation before the fresh wx acquisition.
    backing.events.push({ type: 'reserved', key: keyB, at: backing.deps.nowIso() });
    backing.ops.length = 0;
    ledger.acquireLock(makeOwner());
    // Authoritative refresh must see both, exactly once.
    expect(ledger.getCounts().imageReserved).toBe(2);
    expect(ledger.rebuildReport().completed).toHaveLength(0);
    expect(() => ledger.reserve(keyA)).toThrow(CalibrationFatalError);
    expect(() => ledger.reserve(keyB)).toThrow(CalibrationFatalError);
  });

  it('dead-owner recovery refreshes disk updates and journal hashes without stale pending state', () => {
    const backing = makeBacking('dead');
    const finished = makeKey({ caseId: DEV_CASE_A });
    const late = makeKey({ caseId: DEV_CASE_B });
    const journal = makeJournal(finished);
    const hash = journalHashFor(journal);
    backing.events.push({ type: 'reserved', key: finished, at: backing.deps.nowIso() });
    backing.journals.push(journal);
    backing.events.push({
      type: 'completed',
      key: finished,
      journalHash: hash,
      at: backing.deps.nowIso(),
    });
    const ledger = createCalibrationLedger(backing.deps, makeIdentity(), [finished, late]);
    expect(ledger.rebuildReport().completed).toContainEqual(finished);
    // Disk gains a late reservation between construction and dead recovery.
    backing.events.push({ type: 'reserved', key: late, at: backing.deps.nowIso() });
    const stale = makeOwner();
    backing.lock = stale;
    backing.ops.length = 0;
    ledger.acquireLock(makeOwner({ pid: 7777, startTicks: 111 }));
    // Both the pre-construction completion (hash-bound) and the late
    // reservation must be visible, with no doubled counts or stale pending.
    expect(ledger.getCounts().imageReserved).toBe(2);
    expect(ledger.rebuildReport().completed).toContainEqual(finished);
    expect(() => ledger.reserve(finished)).toThrow(CalibrationFatalError);
    expect(() => ledger.reserve(late)).toThrow(CalibrationFatalError);
  });

  it('dead recovery audits only after archive, wx, and refresh reads', () => {
    const backing = makeBacking('dead');
    const ledger = createCalibrationLedger(backing.deps, makeIdentity(), []);
    const stale = makeOwner();
    backing.lock = stale;
    backing.ops.length = 0;
    backing.readCalls = 0;
    ledger.acquireLock(makeOwner({ pid: 7777, startTicks: 111 }));
    const archiveIndex = backing.ops.indexOf('archiveLock');
    const writeIndex = backing.ops.indexOf('writeLockExclusive');
    const journalRead = backing.ops.indexOf('readJournalEntries');
    const ledgerRead = backing.ops.indexOf('readLedgerEvents');
    const auditIndex = backing.ops.indexOf('appendLedgerEvent');
    const fileIndex = backing.ops.indexOf('fsyncLedgerFile');
    const dirIndex = backing.ops.indexOf('fsyncLedgerDir');
    expect(archiveIndex).toBeGreaterThanOrEqual(0);
    expect(writeIndex).toBeGreaterThan(archiveIndex);
    expect(journalRead).toBeGreaterThan(writeIndex);
    expect(ledgerRead).toBeGreaterThan(writeIndex);
    expect(auditIndex).toBeGreaterThan(journalRead);
    expect(auditIndex).toBeGreaterThan(ledgerRead);
    expect(fileIndex).toBeGreaterThan(auditIndex);
    expect(dirIndex).toBeGreaterThan(fileIndex);
    expect(backing.events.length).toBeGreaterThan(0);
  });

  it('failed archive performs no ledger append', () => {
    const backing = makeBacking('dead');
    const ledger = createCalibrationLedger(backing.deps, makeIdentity(), []);
    backing.lock = makeOwner();
    backing.deps.archiveLock = () => {
      backing.ops.push('archiveLock');
      throw new Error('EACCES: cannot archive');
    };
    const eventsBefore = backing.events.length;
    expect(() => ledger.acquireLock(makeOwner({ pid: 7777 }))).toThrow(CalibrationFatalError);
    expect(backing.events.length).toBe(eventsBefore);
  });

  it('failed wx performs no ledger append', () => {
    const backing = makeBacking('dead');
    const ledger = createCalibrationLedger(backing.deps, makeIdentity(), []);
    backing.lock = makeOwner();
    backing.deps.writeLockExclusive = () => {
      backing.ops.push('writeLockExclusive');
      throw new Error('EEXIST: concurrent winner');
    };
    const eventsBefore = backing.events.length;
    expect(() => ledger.acquireLock(makeOwner({ pid: 7777 }))).toThrow(CalibrationFatalError);
    expect(backing.events.length).toBe(eventsBefore);
  });

  it('double acquisition fails without invalidating owned state', () => {
    const backing = makeBacking('live');
    const key = makeKey();
    const ledger = createCalibrationLedger(backing.deps, makeIdentity(), [key]);
    const owner = makeOwner();
    ledger.acquireLock(owner);
    ledger.reserve(key);
    expect(() => ledger.acquireLock(makeOwner({ pid: 9999 }))).toThrow(CalibrationFatalError);
    expect(ledger.getCounts().imageReserved).toBe(1);
    expect(backing.lock).toBeDefined();
  });
});

describe('calibration under-lock refresh poison retains lock and blocks every method', () => {
  it('fresh-path private journal failure poisons all methods with a static causeless fatal', () => {
    const backing = makeBacking('live');
    const key = makeKey();
    const ledger = createCalibrationLedger(backing.deps, makeIdentity(), [key]);
    backing.failJournalReadsAfterConstruction = true;
    const owner = makeOwner();
    let caught: unknown;
    try {
      ledger.acquireLock(owner);
    } catch (error) {
      caught = error;
    }
    expectStaticCauselessFatal(caught, backing.privateMarker);
    // Lock retained for operator inspection, never auto-released.
    expect(backing.lock).toBeDefined();
    if (backing.lock !== undefined) {
      expect(sameOwner(backing.lock, owner)).toBe(true);
    }

    const tokenKey = makeTokenKey();
    const journal = makeJournal(key);
    const methods: Array<() => void> = [
      () => ledger.getCounts(),
      () => ledger.rebuildReport(),
      () => ledger.acquireLock(makeOwner({ pid: 9999 })),
      () => ledger.releaseLock(owner),
      () => ledger.recoverAfterCrash(),
      () => ledger.assertIdentity(makeIdentity()),
      () => ledger.assertGitState({ headCommit: 'x', functionsTreeId: makeIdentity().functionsTreeId, dirtyPaths: [] }),
      () => ledger.assertStageTransition('development', 'validation', { stage: 'development', passed: true, completedStages: ['development'] }),
      () => ledger.reserve(key),
      () => ledger.reserveSynthetic({ reason: 'probe', index: 0 }, () => undefined),
      () => ledger.reserveTokenCount(tokenKey),
      () => ledger.completeTokenCount(tokenKey, 10),
      () => ledger.failTokenCount(tokenKey, 'timeout'),
      () => ledger.appendResultJournal(journal),
      () => ledger.complete(key, 'hash'),
      () => ledger.recordSafeError({ stage: 'preflight', kind: 'token_count', caseId: DEV_CASE_A, errorCategory: 'timeout' }),
    ];
    for (const call of methods) {
      const opsBefore = backing.ops.length;
      let failed: unknown;
      try {
        call();
      } catch (error) {
        failed = error;
      }
      expectStaticCauselessFatal(failed, backing.privateMarker);
      expect(backing.ops.length).toBe(opsBefore);
    }
  });

  it('dead-path foreign ledger failure poisons getters and recovery without leaking cause', () => {
    const backing = makeBacking('dead');
    const key = makeKey();
    const ledger = createCalibrationLedger(backing.deps, makeIdentity(), [key]);
    backing.lock = makeOwner();
    backing.failLedgerReadsAfterConstruction = true;
    const recovering = makeOwner({ pid: 7777, startTicks: 111 });
    let caught: unknown;
    try {
      ledger.acquireLock(recovering);
    } catch (error) {
      caught = error;
    }
    expectStaticCauselessFatal(caught, backing.privateMarker);
    expect(backing.lock).toBeDefined();
    const opsBefore = backing.ops.length;
    expect(() => ledger.getCounts()).toThrow(CalibrationFatalError);
    expect(() => ledger.rebuildReport()).toThrow(CalibrationFatalError);
    expect(() => ledger.recoverAfterCrash()).toThrow(CalibrationFatalError);
    expect(() => ledger.releaseLock(recovering)).toThrow(CalibrationFatalError);
    expect(backing.ops.length).toBe(opsBefore);
    // No private bytes ever reach the ledger event store.
    expect(JSON.stringify(backing.events)).not.toContain(backing.privateMarker);
  });

  it('crash recovery without held ownership rejects before effects', () => {
    const backing = makeBacking('live');
    const key = makeKey();
    const ledger = createCalibrationLedger(backing.deps, makeIdentity(), [key]);
    const opsBefore = backing.ops.length;
    expect(() => ledger.recoverAfterCrash()).toThrow(CalibrationFatalError);
    expect(backing.ops.length).toBe(opsBefore);
    expect(backing.events).toHaveLength(0);
  });

  it('corrupt unknown event during acquire retains owned lock and poisons every method', () => {
    const backing = makeBacking('live');
    const key = makeKey();
    const ledger = createCalibrationLedger(backing.deps, makeIdentity(), [key]);
    // Disk gains an unknown event between construction and fresh acquisition.
    backing.events.push({ type: 'bogus-unknown-event' });
    backing.ops.length = 0;
    const owner = makeOwner();
    let caught: unknown;
    try {
      ledger.acquireLock(owner);
    } catch (error) {
      caught = error;
    }
    expectStaticCauselessFatal(caught, backing.privateMarker);
    expect(backing.lock).toBeDefined();
    if (backing.lock !== undefined) {
      expect(sameOwner(backing.lock, owner)).toBe(true);
    }

    const tokenKey = makeTokenKey();
    const journal = makeJournal(key);
    const methods: Array<() => void> = [
      () => ledger.getCounts(),
      () => ledger.rebuildReport(),
      () => ledger.acquireLock(makeOwner({ pid: 9999 })),
      () => ledger.releaseLock(owner),
      () => ledger.recoverAfterCrash(),
      () => ledger.assertIdentity(makeIdentity()),
      () => ledger.assertGitState({ headCommit: 'x', functionsTreeId: makeIdentity().functionsTreeId, dirtyPaths: [] }),
      () => ledger.assertStageTransition('development', 'validation', { stage: 'development', passed: true, completedStages: ['development'] }),
      () => ledger.reserve(key),
      () => ledger.reserveSynthetic({ reason: 'probe', index: 0 }, () => undefined),
      () => ledger.reserveTokenCount(tokenKey),
      () => ledger.completeTokenCount(tokenKey, 10),
      () => ledger.failTokenCount(tokenKey, 'timeout'),
      () => ledger.appendResultJournal(journal),
      () => ledger.complete(key, 'hash'),
      () => ledger.recordSafeError({ stage: 'preflight', kind: 'token_count', caseId: DEV_CASE_A, errorCategory: 'timeout' }),
    ];
    for (const call of methods) {
      const opsBefore = backing.ops.length;
      let failed: unknown;
      try {
        call();
      } catch (error) {
        failed = error;
      }
      expectStaticCauselessFatal(failed, backing.privateMarker);
      expect(backing.ops.length).toBe(opsBefore);
    }
    expect(JSON.stringify(backing.events)).not.toContain(backing.privateMarker);
  });

  it('malicious fatal reader failure is sanitized to a static causeless fatal with no effects', () => {
    const backing = makeBacking('live');
    const key = makeKey();
    const ledger = createCalibrationLedger(backing.deps, makeIdentity(), [key]);
    const malicious = new CalibrationFatalError(
      `calibration:tampered ${backing.privateMarker}`,
      { cause: { privateBytes: backing.privateMarker } },
    );
    backing.deps.readJournalEntries = () => {
      backing.ops.push('readJournalEntries');
      throw malicious;
    };
    const owner = makeOwner();
    let caught: unknown;
    try {
      ledger.acquireLock(owner);
    } catch (error) {
      caught = error;
    }
    // Private message/cause must never propagate; only a static causeless fatal.
    expectStaticCauselessFatal(caught, backing.privateMarker);
    expect(backing.lock).toBeDefined();
    if (backing.lock !== undefined) {
      expect(sameOwner(backing.lock, owner)).toBe(true);
    }
    const opsBefore = backing.ops.length;
    expect(() => ledger.getCounts()).toThrow(CalibrationFatalError);
    expect(() => ledger.rebuildReport()).toThrow(CalibrationFatalError);
    expect(() => ledger.recoverAfterCrash()).toThrow(CalibrationFatalError);
    expect(() => ledger.releaseLock(owner)).toThrow(CalibrationFatalError);
    expect(backing.ops.length).toBe(opsBefore);
    expect(JSON.stringify(backing.events)).not.toContain(backing.privateMarker);
  });
});
