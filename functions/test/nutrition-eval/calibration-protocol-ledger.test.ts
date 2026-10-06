/**
 * Strict protocol ledger contract (timeless).
 *
 * Covers `createProtocolCalibrationLedger(deps, identity, keyResolver)` and
 * its `CalibrationProtocolLedger` / `CalibrationKeyResolver` /
 * `CalibrationProfileSelectionReason` surface: durable `protocol_identity`
 * header grammar, `pinModelVersion` ordering, `recordProfileSelection` with
 * closed reasons and dynamic 50 -> 146 key expansion, ordered
 * `completeStage` gates, reservation sequencing on new writes and replay,
 * restart durability, poison, and legacy strict-header refusal.
 *
 * Proposed metadata event shapes (per Task 2 brief/plan inference; host to
 * clarify if source field names differ rather than guessing silently):
 * - `{ type: 'protocol_identity', identity, at }` as event zero with exact
 *   15 identity fields and canonical ISO `at`.
 * - `{ type: 'model_version_pinned', responseModelVersion, at }`.
 * - `{ type: 'profile_selected', profile, reason, at }`.
 * - `{ type: 'stage_completed', stage, passed: true, at }`.
 * Metadata events use closed fields and canonical ISO timestamps; failures
 * are fresh static causeless `CalibrationFatalError`s with no private
 * payload. Gate summaries reuse `CalibrationStageGateSummary` with exactly
 * already-completed predecessors (`[]` preflight, `['preflight']`
 * development/selection, `['preflight','development']` validation,
 * `['preflight','development','validation']` benchmark); structural coverage
 * only, never a nutrition-accuracy or 12-barcode approval claim.
 *
 * Fixture keys use safe-char generated IDs; canonical Task 3 assets pin real
 * manifest IDs later. Journal hashes are real sha256 of the JSON entry per
 * the existing helper. Injected fakes only; no provider/network access.
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';
import {
  HARD_CALL_CEILING,
  PLANNED_IMAGE_CALLS,
  createCalibrationLedger,
  createProtocolCalibrationLedger,
} from '../../src/nutrition-eval/calibration';
import type {
  CalibrationIdentity,
  CalibrationKeyResolver,
  CalibrationLedgerDeps,
  CalibrationLiveness,
  CalibrationOwner,
  CalibrationProfile,
  CalibrationProfileSelectionReason,
  CalibrationProtocolLedger,
  CalibrationStageGateSummary,
  JournalEntry,
  ReservationKey,
  StageName,
  TokenCountReservationKey,
} from '../../src/nutrition-eval/calibration';

const MODEL = 'gemini-3.8-flash';
const PINNED_VERSION = 'gemini-3.8-flash-001';
const OTHER_VERSION = 'gemini-3.8-flash-002';

const HEX40_A = 'a'.repeat(40);
const HEX40_B = 'b'.repeat(40);
const HEX64_C = 'c'.repeat(64);
const HEX64_D = 'd'.repeat(64);
const HEX64_E = 'e'.repeat(64);
const HEX64_F = 'f'.repeat(64);
const HEX64_0 = '0'.repeat(64);
const HEX64_1 = '1'.repeat(64);
const HEX64_2 = '2'.repeat(64);
const HEX64_3 = '3'.repeat(64);

function makeStrictIdentity(
  overrides: Partial<CalibrationIdentity> = {},
): CalibrationIdentity {
  return {
    protocolVersion: 'v1',
    provider: 'vertex-ai',
    model: MODEL,
    implementationCommit: HEX40_A,
    functionsTreeId: HEX40_B,
    datasetHash: HEX64_C,
    promptHash: HEX64_D,
    responseSchemaHash: HEX64_E,
    sourceLockHash: HEX64_F,
    manifestHash: HEX64_0,
    publicManifestHash: HEX64_1,
    snapshotLockHash: HEX64_2,
    historicalReferenceHash: HEX64_3,
    plannedImageCalls: PLANNED_IMAGE_CALLS,
    hardCeiling: HARD_CALL_CEILING,
    ...overrides,
  };
}

function makeOwner(overrides: Partial<CalibrationOwner> = {}): CalibrationOwner {
  return {
    hostname: 'pi-host',
    bootId: 'boot-abc-123',
    pid: 4242,
    startTicks: 987654,
    acquiredAt: '2026-10-05T00:00:00.000Z',
    ...overrides,
  };
}

const DEV_CASE_IDS: readonly string[] = Array.from(
  { length: 24 },
  (_, i) => `calibration-dev-${String(i + 1).padStart(4, '0')}`,
);
const FIRST_DEV = DEV_CASE_IDS[0];
const VALIDATION_CASE_IDS: readonly string[] = Array.from(
  { length: 16 },
  (_, i) => `calibration-validation-${String(i + 1).padStart(4, '0')}`,
);
const BENCHMARK_CASE_IDS: readonly string[] = Array.from(
  { length: 16 },
  (_, i) => `calibration-benchmark-${String(i + 1).padStart(4, '0')}`,
);

function buildInitial50(): ReservationKey[] {
  const keys: ReservationKey[] = [
    { stage: 'preflight', profile: 'LOW', caseId: FIRST_DEV, sampleIndex: 1 },
    { stage: 'preflight', profile: 'MEDIUM', caseId: FIRST_DEV, sampleIndex: 1 },
  ];
  for (const caseId of DEV_CASE_IDS) {
    keys.push({ stage: 'development', profile: 'LOW', caseId, sampleIndex: 1 });
    keys.push({ stage: 'development', profile: 'MEDIUM', caseId, sampleIndex: 1 });
  }
  return keys;
}

function expand146(selected: CalibrationProfile): ReservationKey[] {
  const keys = buildInitial50();
  for (const caseId of VALIDATION_CASE_IDS) {
    for (let sample = 1; sample <= 3; sample += 1) {
      keys.push({ stage: 'validation', profile: selected, caseId, sampleIndex: sample });
    }
  }
  for (const caseId of BENCHMARK_CASE_IDS) {
    for (let sample = 1; sample <= 3; sample += 1) {
      keys.push({ stage: 'benchmark', profile: selected, caseId, sampleIndex: sample });
    }
  }
  return keys;
}

function makeCanonicalResolver(tracker?: { calls: number }): CalibrationKeyResolver {
  return ((selectedProfile?: CalibrationProfile) => {
    if (tracker !== undefined) tracker.calls += 1;
    if (selectedProfile === undefined) return Object.freeze([...buildInitial50()]);
    if (selectedProfile !== 'LOW' && selectedProfile !== 'MEDIUM') {
      throw new CalibrationFatalError('calibration:resolver-invalid-profile');
    }
    return Object.freeze([...expand146(selectedProfile)]);
  }) as CalibrationKeyResolver;
}

function makeTokenKey(overrides: Partial<TokenCountReservationKey> = {}): TokenCountReservationKey {
  return {
    kind: 'token_count',
    stage: 'preflight',
    caseId: FIRST_DEV,
    model: MODEL,
    ...overrides,
  };
}

function journalHashFor(entry: JournalEntry): string {
  return createHash('sha256').update(JSON.stringify(entry)).digest('hex');
}

function successJournal(
  key: ReservationKey,
  version = PINNED_VERSION,
): JournalEntry {
  return {
    key,
    predictionHash: 'f'.repeat(64),
    normalizedPrediction: { kcal: 210 },
    analysisLatencyMs: 120,
    errorCategory: 'none',
    responseModelVersion: version,
  };
}

function failureJournal(
  key: ReservationKey,
  errorCategory: JournalEntry['errorCategory'] = 'timeout',
): JournalEntry {
  if (errorCategory === 'none') throw new Error('failure fixture requires non-none category');
  return {
    key,
    predictionHash: errorCategory,
    normalizedPrediction: null,
    analysisLatencyMs: 0,
    errorCategory,
    responseModelVersion: 'n/a',
  };
}

function preflightSummary(): CalibrationStageGateSummary {
  return { stage: 'preflight', passed: true, completedStages: [] };
}

function developmentSummary(): CalibrationStageGateSummary {
  return { stage: 'development', passed: true, completedStages: ['preflight'] };
}

function validationSummary(): CalibrationStageGateSummary {
  return {
    stage: 'validation',
    passed: true,
    completedStages: ['preflight', 'development'],
  };
}

function benchmarkSummary(): CalibrationStageGateSummary {
  return {
    stage: 'benchmark',
    passed: true,
    completedStages: ['preflight', 'development', 'validation'],
  };
}

interface FakeBacking {
  lock: CalibrationOwner | undefined;
  liveness: 'live' | 'dead' | 'unknown';
  events: unknown[];
  journals: JournalEntry[];
  ops: string[];
  deps: CalibrationLedgerDeps;
  journalReads: number;
  ledgerReads: number;
  resolverCalls: { calls: number };
  privateMarker: string;
  readShouldFail: boolean;
  clock: number;
}

function makeBacking(liveness: FakeBacking['liveness'] = 'live'): FakeBacking {
  const backing = {
    lock: undefined as CalibrationOwner | undefined,
    liveness,
    events: [] as unknown[],
    journals: [] as JournalEntry[],
    ops: [] as string[],
    deps: undefined as unknown as CalibrationLedgerDeps,
    journalReads: 0,
    ledgerReads: 0,
    resolverCalls: { calls: 0 },
    privateMarker: 'SECRET-protocol-bytes-xyz',
    readShouldFail: false,
    clock: 0,
  };
  const deps: CalibrationLedgerDeps = {
    getRoot: () => '.nutrition-eval/calibration/calorix-gemini-38-calibration-v1/',
    readLock: () => backing.lock,
    writeLockExclusive: (owner: CalibrationOwner) => {
      backing.ops.push('writeLockExclusive');
      if (backing.lock !== undefined) throw new CalibrationFatalError('lock:already-held');
      backing.lock = owner;
    },
    archiveLock: (_owner: CalibrationOwner) => {
      backing.ops.push('archiveLock');
      if (backing.lock === undefined) throw new CalibrationFatalError('lock:archive-foreign');
      backing.lock = undefined;
    },
    removeLock: (_owner: CalibrationOwner) => {
      backing.ops.push('removeLock');
      backing.lock = undefined;
    },
    appendLedgerEvent: (event: unknown) => {
      backing.ops.push('appendLedgerEvent');
      backing.events.push(event);
    },
    fsyncLedgerFile: () => {
      backing.ops.push('fsyncLedgerFile');
    },
    fsyncLedgerDir: () => {
      backing.ops.push('fsyncLedgerDir');
    },
    appendJournal: (entry: JournalEntry) => {
      backing.ops.push('appendJournal');
      backing.journals.push(entry);
    },
    fsyncJournalFile: () => {
      backing.ops.push('fsyncJournalFile');
    },
    fsyncJournalDir: () => {
      backing.ops.push('fsyncJournalDir');
    },
    probeOwnerLiveness: () => {
      backing.ops.push('probeOwnerLiveness');
      return backing.liveness;
    },
    nowIso: () => {
      backing.clock += 1;
      const seconds = String(backing.clock % 60).padStart(2, '0');
      return `2026-10-05T00:00:${seconds}.000Z`;
    },
    readLedgerEvents: () => {
      backing.ops.push('readLedgerEvents');
      backing.ledgerReads += 1;
      if (backing.readShouldFail) {
        throw Object.assign(new Error(`EIO ${backing.privateMarker}`), {
          privateBytes: backing.privateMarker,
        });
      }
      return [...backing.events];
    },
    readJournalEntries: () => {
      backing.ops.push('readJournalEntries');
      backing.journalReads += 1;
      if (backing.readShouldFail) {
        throw new Error(`EACCES ${backing.privateMarker}`);
      }
      return [...backing.journals];
    },
  };
  backing.deps = deps;
  return backing as FakeBacking;
}

function expectStaticCauseless(error: unknown, marker: string): void {
  expect(error).toBeInstanceOf(CalibrationFatalError);
  const message = (error as CalibrationFatalError).message;
  expect(message.startsWith('calibration:')).toBe(true);
  expect(message).not.toContain(marker);
  expect((error as CalibrationFatalError).cause).toBeUndefined();
}

function createStrict(
  backing: FakeBacking,
  identity?: CalibrationIdentity,
  resolver?: CalibrationKeyResolver,
): CalibrationProtocolLedger {
  return createProtocolCalibrationLedger(
    backing.deps,
    identity ?? makeStrictIdentity(),
    resolver ?? makeCanonicalResolver(backing.resolverCalls),
  );
}

function eventTypes(backing: FakeBacking): string[] {
  return backing.events.map((event) => (event as { type: string }).type);
}

function completePreflightLocked(
  ledger: CalibrationProtocolLedger,
  backing: FakeBacking,
): void {
  const tokenKey = makeTokenKey();
  ledger.reserveTokenCount(tokenKey);
  ledger.completeTokenCount(tokenKey, 1200);
  const low = { stage: 'preflight', profile: 'LOW', caseId: FIRST_DEV, sampleIndex: 1 } as ReservationKey;
  const medium = {
    stage: 'preflight',
    profile: 'MEDIUM',
    caseId: FIRST_DEV,
    sampleIndex: 1,
  } as ReservationKey;
  ledger.reserve(low);
  ledger.pinModelVersion(PINNED_VERSION);
  const lowJournal = successJournal(low);
  const lowHash = ledger.appendResultJournal(lowJournal);
  expect(lowHash).toBe(journalHashFor(lowJournal));
  ledger.complete(low, lowHash);
  ledger.reserve(medium);
  const mediumJournal = successJournal(medium);
  const mediumHash = ledger.appendResultJournal(mediumJournal);
  ledger.complete(medium, mediumHash);
  ledger.completeStage('preflight', preflightSummary());
  expect(backing.events.length).toBeGreaterThan(0);
}

function completePreflightHappyPath(
  ledger: CalibrationProtocolLedger,
  backing: FakeBacking,
): CalibrationOwner {
  const owner = makeOwner();
  ledger.acquireLock(owner);
  completePreflightLocked(ledger, backing);
  return owner;
}

function completeDevelopment48(ledger: CalibrationProtocolLedger): void {
  for (const caseId of DEV_CASE_IDS) {
    for (const profile of ['LOW', 'MEDIUM'] as const) {
      const key = {
        stage: 'development',
        profile,
        caseId,
        sampleIndex: 1,
      } as ReservationKey;
      ledger.reserve(key);
      // Later-gate inputs may be scored failures; terminal outcome required.
      // Both profiles complete every development case: 24 IDs x 2 = 48 keys.
      const entry =
        caseId.endsWith('0002') || caseId.endsWith('0004')
          ? failureJournal(key)
          : successJournal(key);
      const hash = ledger.appendResultJournal(entry);
      ledger.complete(key, hash);
    }
  }
}

describe('strict protocol header grammar', () => {
  it('initial construction performs no metadata writes', () => {
    const backing = makeBacking();
    const ledger = createStrict(backing);
    expect(backing.events).toHaveLength(0);
    expect(backing.ops).not.toContain('appendLedgerEvent');
    expect(ledger.getPinnedModelVersion()).toBeUndefined();
    expect(ledger.getSelectedProfile()).toBeUndefined();
    expect(ledger.getCompletedStages()).toEqual([]);
  });

  it('fresh acquire initializes identity event zero before any lifecycle event', () => {
    const backing = makeBacking();
    const identity = makeStrictIdentity();
    const ledger = createStrict(backing, identity);
    ledger.acquireLock(makeOwner());
    expect(backing.events.length).toBeGreaterThan(0);
    const first = backing.events[0] as Record<string, unknown>;
    expect(first.type).toBe('protocol_identity');
    expect(Object.keys(first).sort()).toEqual(['at', 'identity', 'type']);
    expect(first.identity).toEqual(identity);
    expect(typeof first.at).toBe('string');
    expect(eventTypes(backing).slice(1)).not.toContain('protocol_identity');
  });

  it('dead refresh initializes identity event zero before the recovery audit', () => {
    const backing = makeBacking('dead');
    const ledger = createStrict(backing);
    backing.lock = makeOwner();
    ledger.acquireLock(makeOwner({ pid: 7777, startTicks: 111 }));
    const types = eventTypes(backing);
    expect(types[0]).toBe('protocol_identity');
    const recoveryIndex = types.indexOf('lock_recovery');
    expect(recoveryIndex).toBeGreaterThan(0);
  });

  it('rejects non-empty legacy history or journal without a header', () => {
    const backing = makeBacking();
    const legacyKey = {
      stage: 'development',
      profile: 'MEDIUM',
      caseId: FIRST_DEV,
      sampleIndex: 1,
    } as ReservationKey;
    backing.events.push({ type: 'reserved', key: legacyKey, at: '2026-10-05T00:00:01.000Z' });
    expect(() => createStrict(backing)).toThrow(CalibrationFatalError);
    const journalBacking = makeBacking();
    journalBacking.journals.push(successJournal(legacyKey));
    expect(() => createStrict(journalBacking)).toThrow(CalibrationFatalError);
  });

  it('rejects duplicate, drifted, extra-field, and invalid-hex headers', () => {
    const backing = makeBacking();
    const ledger = createStrict(backing);
    ledger.acquireLock(makeOwner());
    const header = backing.events[0] as Record<string, unknown>;
    expect(header.type).toBe('protocol_identity');
    // Duplicate header on replay fails closed.
    const dupBacking = makeBacking();
    dupBacking.events.push(header, { ...header });
    expect(() => createStrict(dupBacking)).toThrow(CalibrationFatalError);
    // Extra header field fails closed.
    const extraBacking = makeBacking();
    extraBacking.events.push({ ...header, extraField: 'nope' });
    expect(() => createStrict(extraBacking)).toThrow(CalibrationFatalError);
    // Invalid hex fails closed.
    const badHexBacking = makeBacking();
    badHexBacking.events.push({
      type: 'protocol_identity',
      identity: makeStrictIdentity({ implementationCommit: 'NOT-HEX' }),
      at: '2026-10-05T00:00:01.000Z',
    });
    expect(() => createStrict(badHexBacking)).toThrow(CalibrationFatalError);
  });

  it('characterizes every identity field drift', () => {
    const fields: Array<keyof CalibrationIdentity> = [
      'protocolVersion',
      'provider',
      'model',
      'implementationCommit',
      'functionsTreeId',
      'datasetHash',
      'promptHash',
      'responseSchemaHash',
      'sourceLockHash',
      'manifestHash',
      'publicManifestHash',
      'snapshotLockHash',
      'historicalReferenceHash',
      'plannedImageCalls',
      'hardCeiling',
    ];
    expect(fields).toHaveLength(15);
    for (const field of fields) {
      const backing = makeBacking();
      const ledger = createStrict(backing);
      ledger.acquireLock(makeOwner());
      const candidate = makeStrictIdentity();
      if (typeof candidate[field] === 'number') {
        (candidate[field] as number) = (candidate[field] as number) + 1;
      } else {
        (candidate[field] as string) = `${candidate[field]}-drift`;
      }
      let caught: unknown;
      try {
        ledger.assertIdentity(candidate);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(CalibrationFatalError);
      expect((caught as CalibrationFatalError).message).toContain(String(field));
    }
  });

  it('legacy factory refuses strict headers without changing old hermetic APIs', () => {
    const backing = makeBacking();
    const identity = makeStrictIdentity();
    backing.events.push({
      type: 'protocol_identity',
      identity,
      at: '2026-10-05T00:00:01.000Z',
    });
    expect(() =>
      createCalibrationLedger(backing.deps, identity, buildInitial50()),
    ).toThrow(/calibration:protocol-ledger-required/);
    // Old hermetic factory still accepts legacy history without a header.
    const legacyBacking = makeBacking();
    const key = buildInitial50()[2];
    legacyBacking.events.push({ type: 'reserved', key, at: '2026-10-05T00:00:01.000Z' });
    const legacyLedger = createCalibrationLedger(
      legacyBacking.deps,
      makeStrictIdentity(),
      [key],
    );
    expect(legacyLedger.getCounts().imageReserved).toBe(1);
    expect(legacyLedger.rebuildReport().completed).toHaveLength(0);
  });
});

describe('strict defensive snapshots and privacy', () => {
  it('returns immutable defensive snapshots with no retained caller references', () => {
    const backing = makeBacking();
    const ledger = createStrict(backing);
    completePreflightHappyPath(ledger, backing);
    completeDevelopment48(ledger);
    ledger.recordProfileSelection('LOW', 'fewer_unsafe', developmentSummary());
    ledger.completeStage('development', developmentSummary());
    const stages = ledger.getCompletedStages();
    expect(Object.isFrozen(stages)).toBe(true);
    expect(() => {
      (stages as StageName[]).push('benchmark');
    }).toThrow();
    expect(ledger.getCompletedStages()).toEqual(['preflight', 'development']);
  });

  it('never serializes caller toJSON nor retains foreign errors or causes', () => {
    const backing = makeBacking();
    let serialized = 0;
    const identity = makeStrictIdentity();
    Object.defineProperty(identity, 'toJSON', {
      value: () => {
        serialized += 1;
        return {};
      },
      enumerable: false,
    });
    const ledger = createStrict(backing, identity);
    ledger.acquireLock(makeOwner());
    expect(serialized).toBe(0);
    (identity as Record<string, unknown>).model = 'tampered';
    expect(() => ledger.assertIdentity(makeStrictIdentity())).not.toThrow();
    // Throwing private identity getter fails closed with no private payload.
    const getterBacking = makeBacking();
    const getterIdentity = makeStrictIdentity();
    Object.defineProperty(getterIdentity, 'model', {
      get: () => {
        throw Object.assign(new Error(`EIO ${getterBacking.privateMarker}`), {
          privateBytes: getterBacking.privateMarker,
        });
      },
      enumerable: true,
    });
    let getterCaught: unknown;
    try {
      createStrict(getterBacking, getterIdentity);
    } catch (error) {
      getterCaught = error;
    }
    expectStaticCauseless(getterCaught, getterBacking.privateMarker);
    expect(JSON.stringify(getterCaught ?? {})).not.toContain(getterBacking.privateMarker);
    // Throwing private clock callback fails closed with no private payload.
    const clockBacking = makeBacking();
    const clockLedger = createStrict(clockBacking);
    clockBacking.deps.nowIso = () => {
      throw Object.assign(new Error(`EIO ${clockBacking.privateMarker}`), {
        privateBytes: clockBacking.privateMarker,
      });
    };
    let clockCaught: unknown;
    try {
      clockLedger.acquireLock(makeOwner());
    } catch (error) {
      clockCaught = error;
    }
    expectStaticCauseless(clockCaught, clockBacking.privateMarker);
    expect(JSON.stringify(clockCaught ?? {})).not.toContain(clockBacking.privateMarker);
    expect(JSON.stringify(clockBacking.events)).not.toContain(clockBacking.privateMarker);
    // Throwing private append callback fails closed with no private payload.
    const appendBacking = makeBacking();
    const appendLedger = createStrict(appendBacking);
    appendLedger.acquireLock(makeOwner());
    appendBacking.deps.appendLedgerEvent = () => {
      throw Object.assign(new Error(`ENOSPC ${appendBacking.privateMarker}`), {
        privateBytes: appendBacking.privateMarker,
      });
    };
    let appendCaught: unknown;
    try {
      appendLedger.reserveTokenCount(makeTokenKey());
    } catch (error) {
      appendCaught = error;
    }
    expectStaticCauseless(appendCaught, appendBacking.privateMarker);
    expect(JSON.stringify(appendCaught ?? {})).not.toContain(appendBacking.privateMarker);
    // Throwing private reservation-key getter fails closed with no payload.
    const keyBacking = makeBacking();
    const keyLedger = createStrict(keyBacking);
    keyLedger.acquireLock(makeOwner());
    const evilKey = {} as ReservationKey;
    Object.defineProperty(evilKey, 'stage', {
      get: () => {
        throw Object.assign(new Error(`EIO ${keyBacking.privateMarker}`), {
          privateBytes: keyBacking.privateMarker,
        });
      },
      enumerable: true,
    });
    let keyCaught: unknown;
    try {
      keyLedger.reserve(evilKey);
    } catch (error) {
      keyCaught = error;
    }
    expectStaticCauseless(keyCaught, keyBacking.privateMarker);
    expect(JSON.stringify(keyCaught ?? {})).not.toContain(keyBacking.privateMarker);
  });

  it('rejects unknown event types, extra lifecycle fields, bad timestamps, and bad keys without private payload', () => {
    const marker = 'SECRET-protocol-bytes-xyz';
    const cases: unknown[] = [
      { type: `bogus-unknown-event-${marker}` },
      {
        type: 'protocol_identity',
        identity: makeStrictIdentity(),
        at: '2026-10-05T00:00:01.000Z',
        extra: 'field',
      },
      { type: 'reserved', key: buildInitial50()[0], at: 'not-canonical' },
      {
        type: 'completed',
        key: buildInitial50()[0],
        journalHash: 'x',
        at: '2026-10-05T00:00:01.000Z',
        injected: true,
      },
    ];
    for (const seeded of cases) {
      const backing = makeBacking();
      backing.events.push({
        type: 'protocol_identity',
        identity: makeStrictIdentity(),
        at: '2026-10-05T00:00:01.000Z',
      });
      backing.events.push(seeded);
      const eventsBefore = backing.events.length;
      let caught: unknown;
      try {
        const ledger = createStrict(backing);
        ledger.acquireLock(makeOwner());
      } catch (error) {
        caught = error;
      }
      expectStaticCauseless(caught, marker);
      expect(JSON.stringify(caught ?? {})).not.toContain(marker);
      // No additional ledger writes after the two seeded events.
      expect(backing.events).toHaveLength(eventsBefore);
    }
  });

  it('sanitizes typed fatal reader failures at construction and under-lock refresh', () => {
    const header = {
      type: 'protocol_identity',
      identity: makeStrictIdentity(),
      at: '2026-10-05T00:00:01.000Z',
    };
    // Constructor path: malicious typed fatal active before construction
    // must fail closed inside catch as a fresh static causeless fatal.
    const preBacking = makeBacking();
    preBacking.events.push(header);
    const preMalicious = new CalibrationFatalError(
      `calibration:tampered ${preBacking.privateMarker}`,
      { cause: { privateBytes: preBacking.privateMarker } },
    );
    preBacking.deps.readLedgerEvents = () => {
      throw preMalicious;
    };
    let ctorCaught: unknown;
    try {
      createProtocolCalibrationLedger(
        preBacking.deps,
        makeStrictIdentity(),
        makeCanonicalResolver(preBacking.resolverCalls),
      );
    } catch (error) {
      ctorCaught = error;
    }
    expectStaticCauseless(ctorCaught, preBacking.privateMarker);
    expect(JSON.stringify(ctorCaught ?? {})).not.toContain(preBacking.privateMarker);

    // Post-construction activation: construct healthy, then arm the
    // malicious reader so the under-lock refresh on acquire poisons.
    const failing = makeBacking();
    const victim = createProtocolCalibrationLedger(
      failing.deps,
      makeStrictIdentity(),
      makeCanonicalResolver(failing.resolverCalls),
    );
    expect(victim).toBeDefined();
    const malicious = new CalibrationFatalError(
      `calibration:tampered ${failing.privateMarker}`,
      { cause: { privateBytes: failing.privateMarker } },
    );
    failing.deps.readLedgerEvents = () => {
      throw malicious;
    };
    let caught: unknown;
    try {
      victim.acquireLock(makeOwner());
    } catch (error) {
      caught = error;
    }
    expectStaticCauseless(caught, failing.privateMarker);
    expect(JSON.stringify(caught ?? {})).not.toContain(failing.privateMarker);
    expect(JSON.stringify(failing.events)).not.toContain(failing.privateMarker);
    // Poisoned instance blocks every method before any dependency operation.
    const opsBefore = failing.ops.length;
    const probes: Array<() => void> = [
      () => victim.getPinnedModelVersion(),
      () => victim.getSelectedProfile(),
      () => victim.getCompletedStages(),
      () => victim.pinModelVersion(PINNED_VERSION),
    ];
    for (const probe of probes) {
      let failed: unknown;
      try {
        probe();
      } catch (error) {
        failed = error;
      }
      expectStaticCauseless(failed, failing.privateMarker);
    }
    expect(failing.ops.length).toBe(opsBefore);
  });

  it('token model and case must match the planned preflight key', () => {
    const backing = makeBacking();
    const ledger = createStrict(backing);
    ledger.acquireLock(makeOwner());
    expect(() => ledger.reserveTokenCount(makeTokenKey({ model: 'gemini-2.5-flash' }))).toThrow(
      CalibrationFatalError,
    );
    expect(() =>
      ledger.reserveTokenCount(makeTokenKey({ caseId: 'calibration-dev-9999' })),
    ).toThrow(CalibrationFatalError);
    expect(() => ledger.reserveTokenCount(makeTokenKey())).not.toThrow();
  });
});

describe('strict version pin and preflight sequencing', () => {
  it('runs token -> LOW reserve -> pin while LOW active -> journal/complete -> MEDIUM -> stage', () => {
    const backing = makeBacking();
    const ledger = createStrict(backing);
    ledger.acquireLock(makeOwner());
    const tokenKey = makeTokenKey();
    ledger.reserveTokenCount(tokenKey);
    ledger.completeTokenCount(tokenKey, 900);
    const low = {
      stage: 'preflight',
      profile: 'LOW',
      caseId: FIRST_DEV,
      sampleIndex: 1,
    } as ReservationKey;
    const medium = {
      stage: 'preflight',
      profile: 'MEDIUM',
      caseId: FIRST_DEV,
      sampleIndex: 1,
    } as ReservationKey;
    ledger.reserve(low);
    ledger.pinModelVersion(PINNED_VERSION);
    expect(ledger.getPinnedModelVersion()).toBe(PINNED_VERSION);
    const lowEntry = successJournal(low);
    const lowHash = ledger.appendResultJournal(lowEntry);
    ledger.complete(low, lowHash);
    ledger.reserve(medium);
    const mediumEntry = successJournal(medium);
    const mediumHash = ledger.appendResultJournal(mediumEntry);
    ledger.complete(medium, mediumHash);
    ledger.completeStage('preflight', preflightSummary());
    const types = eventTypes(backing);
    expect(types[0]).toBe('protocol_identity');
    const pinIndex = types.indexOf('model_version_pinned');
    const lowComplete = types.indexOf('completed');
    expect(pinIndex).toBeGreaterThan(types.indexOf('reserved'));
    expect(pinIndex).toBeLessThan(lowComplete);
    expect(ledger.getCompletedStages()).toEqual(['preflight']);
  });

  it('rejects a first pin before completed token count and an active LOW reservation', () => {
    const backing = makeBacking();
    const ledger = createStrict(backing);
    ledger.acquireLock(makeOwner());
    expect(() => ledger.pinModelVersion(PINNED_VERSION)).toThrow(CalibrationFatalError);
    ledger.reserveTokenCount(makeTokenKey());
    expect(() => ledger.pinModelVersion(PINNED_VERSION)).toThrow(CalibrationFatalError);
  });

  it('treats a matching repeat pin as a no-op and a mismatch as fatal', () => {
    const backing = makeBacking();
    const ledger = createStrict(backing);
    completePreflightHappyPath(ledger, backing);
    const before = backing.events.length;
    ledger.pinModelVersion(PINNED_VERSION);
    expect(backing.events.length).toBe(before);
    expect(() => ledger.pinModelVersion(OTHER_VERSION)).toThrow(CalibrationFatalError);
  });

  it('requires successful journal versions to match the pin; n/a failures stay terminal-only', () => {
    const backing = makeBacking();
    const ledger = createStrict(backing);
    ledger.acquireLock(makeOwner());
    const tokenKey = makeTokenKey();
    ledger.reserveTokenCount(tokenKey);
    ledger.completeTokenCount(tokenKey, 10);
    const low = {
      stage: 'preflight',
      profile: 'LOW',
      caseId: FIRST_DEV,
      sampleIndex: 1,
    } as ReservationKey;
    ledger.reserve(low);
    ledger.pinModelVersion(PINNED_VERSION);
    expect(() => ledger.appendResultJournal(successJournal(low, OTHER_VERSION))).toThrow(
      CalibrationFatalError,
    );
    const failed = failureJournal(low, 'timeout');
    const failedHash = ledger.appendResultJournal(failed);
    ledger.complete(low, failedHash);
    const medium = {
      stage: 'preflight',
      profile: 'MEDIUM',
      caseId: FIRST_DEV,
      sampleIndex: 1,
    } as ReservationKey;
    expect(() => ledger.reserve(medium)).toThrow(CalibrationFatalError);
    expect(() => ledger.completeStage('preflight', preflightSummary())).toThrow(
      CalibrationFatalError,
    );
  });

  it('keeps success predictions on the privacy allowlist and failure hashes as plain categories', () => {
    const backing = makeBacking();
    const ledger = createStrict(backing);
    completePreflightHappyPath(ledger, backing);
    for (const entry of backing.journals) {
      if (entry.errorCategory === 'none') {
        expect(entry.normalizedPrediction).not.toBeNull();
        for (const key of Object.keys(entry.normalizedPrediction ?? {})) {
          expect(['kcal', 'calories', 'proteinG', 'carbsG', 'fatG', 'estimatedTotalMassG']).toContain(
            key,
          );
        }
      } else {
        expect(entry.normalizedPrediction).toBeNull();
        expect(entry.responseModelVersion).toBe('n/a');
        expect(entry.predictionHash).not.toMatch(/^[0-9a-f]{64}$/);
      }
    }
  });

  it('recovers interrupted reservations with a bound terminal marker and checks bound journal outcomes', () => {
    const backing = makeBacking();
    const ledger = createStrict(backing);
    ledger.acquireLock(makeOwner());
    const tokenKey = makeTokenKey();
    ledger.reserveTokenCount(tokenKey);
    ledger.completeTokenCount(tokenKey, 5);
    const low = {
      stage: 'preflight',
      profile: 'LOW',
      caseId: FIRST_DEV,
      sampleIndex: 1,
    } as ReservationKey;
    ledger.reserve(low);
    const report = ledger.recoverAfterCrash();
    expect(report.interrupted).toContainEqual(low);
    const failureEntry = backing.journals[backing.journals.length - 1];
    expect(failureEntry.errorCategory).toBe('interrupted_reservation');
    expect(failureEntry.normalizedPrediction).toBeNull();
    expect(journalHashFor(failureEntry)).toHaveLength(64);
    expect(() => ledger.completeStage('preflight', preflightSummary())).toThrow(
      CalibrationFatalError,
    );
  });

  it('rejects invalid pin patterns including n/a without mutating the pin', () => {
    const backing = makeBacking();
    const ledger = createStrict(backing);
    completePreflightHappyPath(ledger, backing);
    expect(ledger.getPinnedModelVersion()).toBe(PINNED_VERSION);
    const eventsBefore = backing.events.length;
    for (const bad of ['n/a', '', 'NOT-A-VERSION', 'gemini-3.8-flash']) {
      expect(() => ledger.pinModelVersion(bad)).toThrow(CalibrationFatalError);
    }
    expect(ledger.getPinnedModelVersion()).toBe(PINNED_VERSION);
    expect(backing.events).toHaveLength(eventsBefore);
  });

  it('binds failed terminal hashes explicitly on replay', () => {
    function buildInterruptedLow(): FakeBacking {
      const backing = makeBacking();
      const ledger = createStrict(backing);
      ledger.acquireLock(makeOwner());
      const tokenKey = makeTokenKey();
      ledger.reserveTokenCount(tokenKey);
      ledger.completeTokenCount(tokenKey, 5);
      const low = {
        stage: 'preflight',
        profile: 'LOW',
        caseId: FIRST_DEV,
        sampleIndex: 1,
      } as ReservationKey;
      ledger.reserve(low);
      const report = ledger.recoverAfterCrash();
      expect(report.interrupted).toContainEqual(low);
      ledger.releaseLock(makeOwner());
      return backing;
    }
    function cloneBacking(source: FakeBacking): FakeBacking {
      const copy = makeBacking();
      copy.events.push(...(JSON.parse(JSON.stringify(source.events)) as unknown[]));
      copy.journals.push(...(JSON.parse(JSON.stringify(source.journals)) as JournalEntry[]));
      return copy;
    }
    // Missing journalHash on the failed terminal rejects on replay.
    const missing = cloneBacking(buildInterruptedLow());
    const failedMissing = missing.events.find(
      (e) => (e as { type: string }).type === 'failed',
    ) as Record<string, unknown>;
    expect(failedMissing).toBeDefined();
    delete failedMissing.journalHash;
    expect(() => createStrict(missing)).toThrow(CalibrationFatalError);
    // Wrong-key journalHash (bound to another entry) rejects on replay.
    const wrongKey = cloneBacking(buildInterruptedLow());
    const failedWrong = wrongKey.events.find(
      (e) => (e as { type: string }).type === 'failed',
    ) as Record<string, unknown>;
    const otherJournal = successJournal({
      stage: 'preflight',
      profile: 'MEDIUM',
      caseId: FIRST_DEV,
      sampleIndex: 1,
    } as ReservationKey);
    (failedWrong as Record<string, unknown>).journalHash = journalHashFor(otherJournal);
    expect(() => createStrict(wrongKey)).toThrow(CalibrationFatalError);
    // JournalHash pointing at a different durable entry rejects on replay.
    const another = cloneBacking(buildInterruptedLow());
    const failedAnother = another.events.find(
      (e) => (e as { type: string }).type === 'failed',
    ) as Record<string, unknown>;
    failedAnother.journalHash = '0'.repeat(64);
    expect(() => createStrict(another)).toThrow(CalibrationFatalError);
  });

  it('fails version drift on the version contract with an intact hash binding', () => {
    const backing = makeBacking();
    const ledger = createStrict(backing);
    const owner = completePreflightHappyPath(ledger, backing);
    ledger.releaseLock(owner);
    // Rewrite the first success journal to the drifted version and rebind
    // its completed event to the rehashed entry, so only the version
    // contract (not a missing hash) can explain the replay refusal.
    const drifted = makeBacking();
    drifted.events.push(...(JSON.parse(JSON.stringify(backing.events)) as unknown[]));
    drifted.journals.push(...(JSON.parse(JSON.stringify(backing.journals)) as JournalEntry[]));
    const journalIndex = 0;
    const driftedJournal = {
      ...drifted.journals[journalIndex],
      responseModelVersion: OTHER_VERSION,
    };
    drifted.journals[journalIndex] = driftedJournal;
    const reboundHash = journalHashFor(driftedJournal);
    const completedEvent = drifted.events.find(
      (e) =>
        (e as { type: string }).type === 'completed' &&
        JSON.stringify((e as { key: unknown }).key) ===
          JSON.stringify(driftedJournal.key),
    ) as Record<string, unknown>;
    expect(completedEvent).toBeDefined();
    completedEvent.journalHash = reboundHash;
    expect(() => createStrict(drifted)).toThrow(/calibration:/);
  });
});

describe('strict profile selection and ordered stages', () => {
  const REASONS: readonly CalibrationProfileSelectionReason[] = [
    'fewer_unsafe',
    'higher_parse',
    'fewer_catastrophic',
    'lower_macro_error',
    'lower_kcal_error',
    'lower_latency',
    'default_medium_tie_breaker',
  ];

  it('accepts each closed reason after preflight plus 48 terminal development outcomes', () => {
    for (const reason of REASONS) {
      // default_medium_tie_breaker means MEDIUM on a full tie (pure
      // selectCalibrationProfile returns MEDIUM); all other closed reasons
      // are exercised with LOW here. Deeper metric semantics stay deferred.
      const profile: CalibrationProfile =
        reason === 'default_medium_tie_breaker' ? 'MEDIUM' : 'LOW';
      const backing = makeBacking();
      const ledger = createStrict(backing);
      completePreflightHappyPath(ledger, backing);
      completeDevelopment48(ledger);
      expect(ledger.getCounts().imageReserved).toBe(2 + 48);
      ledger.recordProfileSelection(profile, reason, developmentSummary());
      expect(ledger.getSelectedProfile()).toBe(profile);
      ledger.completeStage('development', developmentSummary());
      expect(ledger.getCompletedStages()).toEqual(['preflight', 'development']);
    }
    // LOW with the MEDIUM tie-breaker reason rejects.
    const tieBacking = makeBacking();
    const tieLedger = createStrict(tieBacking);
    completePreflightHappyPath(tieLedger, tieBacking);
    completeDevelopment48(tieLedger);
    expect(() =>
      tieLedger.recordProfileSelection('LOW', 'default_medium_tie_breaker', developmentSummary()),
    ).toThrow(CalibrationFatalError);
  });

  it('rejects freeform reasons and mismatched or failed gate summaries', () => {
    const backing = makeBacking();
    const ledger = createStrict(backing);
    completePreflightHappyPath(ledger, backing);
    completeDevelopment48(ledger);
    expect(() =>
      ledger.recordProfileSelection(
        'LOW',
        'provider_timeout' as CalibrationProfileSelectionReason,
        developmentSummary(),
      ),
    ).toThrow(CalibrationFatalError);
    expect(() =>
      ledger.recordProfileSelection('LOW', 'fewer_unsafe', {
        stage: 'development',
        passed: false,
        completedStages: ['preflight'],
      }),
    ).toThrow(CalibrationFatalError);
    expect(() =>
      ledger.recordProfileSelection('LOW', 'fewer_unsafe', {
        stage: 'development',
        passed: true,
        completedStages: [],
      }),
    ).toThrow(CalibrationFatalError);
    expect(() =>
      ledger.completeStage('development', {
        stage: 'development',
        passed: true,
        completedStages: [],
      }),
    ).toThrow(CalibrationFatalError);
  });

  it('enforces reservation order, sealed stages, selection, and downstream profile binding', () => {
    const backing = makeBacking();
    const ledger = createStrict(backing);
    const owner = makeOwner();
    ledger.acquireLock(owner);
    // Genuine double-acquire guard: second acquisition while held fails
    // without invalidating owned state.
    expect(() => ledger.acquireLock(makeOwner({ pid: 9999 }))).toThrow(
      CalibrationFatalError,
    );
    expect(ledger.getPinnedModelVersion()).toBeUndefined();
    const devKey = {
      stage: 'development',
      profile: 'LOW',
      caseId: DEV_CASE_IDS[0],
      sampleIndex: 1,
    } as ReservationKey;
    expect(() => ledger.reserve(devKey)).toThrow(CalibrationFatalError);
    // Already holds the lock; continue without a second acquisition.
    completePreflightLocked(ledger, backing);
    completeDevelopment48(ledger);
    ledger.recordProfileSelection('LOW', 'fewer_unsafe', developmentSummary());
    ledger.completeStage('development', developmentSummary());
    const wrongProfile = {
      stage: 'validation',
      profile: 'MEDIUM',
      caseId: VALIDATION_CASE_IDS[0],
      sampleIndex: 1,
    } as ReservationKey;
    expect(() => ledger.reserve(wrongProfile)).toThrow(CalibrationFatalError);
    const sealed = {
      stage: 'development',
      profile: 'LOW',
      caseId: DEV_CASE_IDS[0],
      sampleIndex: 1,
    } as ReservationKey;
    expect(() => ledger.reserve(sealed)).toThrow(CalibrationFatalError);
  });

  it('keeps profile and stage completion immutable and idempotent', () => {
    const backing = makeBacking();
    const ledger = createStrict(backing);
    completePreflightHappyPath(ledger, backing);
    completeDevelopment48(ledger);
    ledger.recordProfileSelection('LOW', 'fewer_unsafe', developmentSummary());
    const before = backing.events.length;
    ledger.recordProfileSelection('LOW', 'fewer_unsafe', developmentSummary());
    expect(backing.events.length).toBe(before);
    expect(() =>
      ledger.recordProfileSelection('MEDIUM', 'fewer_unsafe', developmentSummary()),
    ).toThrow(CalibrationFatalError);
    expect(() =>
      ledger.recordProfileSelection('LOW', 'higher_parse', developmentSummary()),
    ).toThrow(CalibrationFatalError);
    ledger.completeStage('development', developmentSummary());
    const afterStage = backing.events.length;
    ledger.completeStage('development', developmentSummary());
    expect(backing.events.length).toBe(afterStage);
  });

  it('covers validation and benchmark structurally without accuracy or barcode claims', () => {
    const backing = makeBacking();
    const ledger = createStrict(backing);
    completePreflightHappyPath(ledger, backing);
    completeDevelopment48(ledger);
    ledger.recordProfileSelection('LOW', 'fewer_unsafe', developmentSummary());
    ledger.completeStage('development', developmentSummary());
    for (const caseId of VALIDATION_CASE_IDS) {
      for (let sample = 1; sample <= 3; sample += 1) {
        const key = { stage: 'validation', profile: 'LOW', caseId, sampleIndex: sample } as ReservationKey;
        ledger.reserve(key);
        const entry =
          caseId === VALIDATION_CASE_IDS[0] && sample === 1
            ? failureJournal(key, 'http_5xx')
            : successJournal(key);
        const hash = ledger.appendResultJournal(entry);
        ledger.complete(key, hash);
      }
    }
    expect(ledger.getCounts().imageReserved).toBe(2 + 48 + 48);
    ledger.completeStage('validation', validationSummary());
    expect(ledger.getCompletedStages()).toEqual(['preflight', 'development', 'validation']);
    for (const caseId of BENCHMARK_CASE_IDS) {
      for (let sample = 1; sample <= 3; sample += 1) {
        const key = { stage: 'benchmark', profile: 'LOW', caseId, sampleIndex: sample } as ReservationKey;
        ledger.reserve(key);
        const hash = ledger.appendResultJournal(successJournal(key));
        ledger.complete(key, hash);
      }
    }
    ledger.completeStage('benchmark', benchmarkSummary());
    expect(ledger.getCounts().imageReserved).toBe(146);
    expect(ledger.getCompletedStages()).toEqual([
      'preflight',
      'development',
      'validation',
      'benchmark',
    ]);
    // Sealed stages reject further reservations; structural coverage only.
    const sealed = {
      stage: 'validation',
      profile: 'LOW',
      caseId: VALIDATION_CASE_IDS[0],
      sampleIndex: 1,
    } as ReservationKey;
    expect(() => ledger.reserve(sealed)).toThrow(CalibrationFatalError);
  });

  it('rejects validation reservations before durable development completion and selection', () => {
    const backing = makeBacking();
    const ledger = createStrict(backing);
    completePreflightHappyPath(ledger, backing);
    completeDevelopment48(ledger);
    const early = {
      stage: 'validation',
      profile: 'LOW',
      caseId: VALIDATION_CASE_IDS[0],
      sampleIndex: 1,
    } as ReservationKey;
    expect(() => ledger.reserve(early)).toThrow(CalibrationFatalError);
    expect(() => ledger.completeStage('validation', validationSummary())).toThrow(
      CalibrationFatalError,
    );
    expect(() => ledger.completeStage('benchmark', benchmarkSummary())).toThrow(
      CalibrationFatalError,
    );
  });

  it('rejects early stage completion, closed extra fields, bad identity hashes, and wrong-stage replay', () => {
    // Early development completion before all 48 terminal outcomes rejects.
    const earlyBacking = makeBacking();
    const earlyLedger = createStrict(earlyBacking);
    completePreflightHappyPath(earlyLedger, earlyBacking);
    expect(() =>
      earlyLedger.completeStage('development', developmentSummary()),
    ).toThrow(CalibrationFatalError);
    // Closed summaries reject extra fields.
    const extraBacking = makeBacking();
    const extraLedger = createStrict(extraBacking);
    completePreflightHappyPath(extraLedger, extraBacking);
    completeDevelopment48(extraLedger);
    expect(() =>
      extraLedger.recordProfileSelection('LOW', 'fewer_unsafe', {
        ...developmentSummary(),
        extra: 'field',
      } as unknown as CalibrationStageGateSummary),
    ).toThrow(CalibrationFatalError);
    expect(() =>
      extraLedger.completeStage('development', {
        ...developmentSummary(),
        extra: 'field',
      } as unknown as CalibrationStageGateSummary),
    ).toThrow(CalibrationFatalError);
    // Bad identity hash (non-hex datasetHash) rejects on replay.
    const badHashBacking = makeBacking();
    badHashBacking.events.push({
      type: 'protocol_identity',
      identity: makeStrictIdentity({ datasetHash: 'NOT-HEX' }),
      at: '2026-10-05T00:00:01.000Z',
    });
    expect(() => createStrict(badHashBacking)).toThrow(CalibrationFatalError);
    // Wrong-stage replay: a validation reservation before selection rejects.
    const wrongStage = makeBacking();
    wrongStage.events.push({
      type: 'protocol_identity',
      identity: makeStrictIdentity(),
      at: '2026-10-05T00:00:01.000Z',
    });
    wrongStage.events.push({
      type: 'reserved',
      key: {
        stage: 'validation',
        profile: 'LOW',
        caseId: VALIDATION_CASE_IDS[0],
        sampleIndex: 1,
      },
      at: '2026-10-05T00:00:02.000Z',
    });
    expect(() => createStrict(wrongStage)).toThrow(CalibrationFatalError);
  });
});

describe('strict dynamic key resolver', () => {
  it('preserves 50 initial keys and expands to exactly 146 for the selected profile', () => {
    const backing = makeBacking();
    const resolverSeen: Array<{ selected: CalibrationProfile | undefined; held: boolean }> = [];
    const trackingResolver: CalibrationKeyResolver = (
      selectedProfile?: CalibrationProfile,
    ) => {
      resolverSeen.push({ selected: selectedProfile, held: backing.lock !== undefined });
      if (selectedProfile === undefined) return Object.freeze([...buildInitial50()]);
      if (selectedProfile !== 'LOW' && selectedProfile !== 'MEDIUM') {
        throw new CalibrationFatalError('calibration:resolver-invalid-profile');
      }
      return Object.freeze([...expand146(selectedProfile)]);
    };
    const ledger = createStrict(backing, makeStrictIdentity(), trackingResolver);
    completePreflightHappyPath(ledger, backing);
    completeDevelopment48(ledger);
    expect(ledger.getCounts().imageReserved).toBe(50);
    // Initial resolver call observed the undefined branch.
    expect(resolverSeen.some((s) => s.selected === undefined)).toBe(true);
    ledger.recordProfileSelection('LOW', 'fewer_unsafe', developmentSummary());
    // Resolver was invoked for the selected profile while the backing
    // exclusive lock was held (no provider callbacks involved).
    expect(
      resolverSeen.some((s) => s.selected === 'LOW' && s.held === true),
    ).toBe(true);
    const report = ledger.recoverAfterCrash();
    expect(report.interrupted).toHaveLength(0);
    expect(report.resumable).toHaveLength(96);
    const initialIds = new Set(
      buildInitial50().map((k) => `${k.stage}|${k.profile}|${k.caseId}|${k.sampleIndex}`),
    );
    const expectedRemaining = expand146('LOW').filter(
      (k) => !initialIds.has(`${k.stage}|${k.profile}|${k.caseId}|${k.sampleIndex}`),
    );
    expect(expectedRemaining).toHaveLength(96);
    for (const key of expectedRemaining) {
      expect(report.resumable).toContainEqual(key);
    }
    for (const key of report.resumable) {
      expect(key.profile).toBe('LOW');
      expect(['validation', 'benchmark']).toContain(key.stage);
    }
  });

  it('rejects 242-key, wrong-profile, duplicate, malformed, and throwing resolvers without provider callbacks', () => {
    const bothProfiles: CalibrationKeyResolver = (selectedProfile?: CalibrationProfile) => {
      if (selectedProfile === undefined) return Object.freeze([...buildInitial50()]);
      const keys = [...buildInitial50()];
      for (const profile of ['LOW', 'MEDIUM'] as const) {
        for (const caseId of VALIDATION_CASE_IDS) {
          for (let sample = 1; sample <= 3; sample += 1) {
            keys.push({ stage: 'validation', profile, caseId, sampleIndex: sample });
          }
        }
        for (const caseId of BENCHMARK_CASE_IDS) {
          for (let sample = 1; sample <= 3; sample += 1) {
            keys.push({ stage: 'benchmark', profile, caseId, sampleIndex: sample });
          }
        }
      }
      return Object.freeze(keys);
    };
    const backing = makeBacking();
    const ledger = createStrict(backing, makeStrictIdentity(), bothProfiles);
    completePreflightHappyPath(ledger, backing);
    completeDevelopment48(ledger);
    expect(() =>
      ledger.recordProfileSelection('LOW', 'fewer_unsafe', developmentSummary()),
    ).toThrow(CalibrationFatalError);
    const duplicate: CalibrationKeyResolver = (selectedProfile?: CalibrationProfile) => {
      if (selectedProfile === undefined) return buildInitial50();
      const expanded = expand146(selectedProfile);
      return [...expanded, expanded[0]];
    };
    const dupBacking = makeBacking();
    const dupLedger = createStrict(dupBacking, makeStrictIdentity(), duplicate);
    completePreflightHappyPath(dupLedger, dupBacking);
    completeDevelopment48(dupLedger);
    expect(() =>
      dupLedger.recordProfileSelection('LOW', 'fewer_unsafe', developmentSummary()),
    ).toThrow(CalibrationFatalError);
    // Wrong-profile 146: correct length but bound to the unselected profile.
    const wrongProfile: CalibrationKeyResolver = (selectedProfile?: CalibrationProfile) => {
      if (selectedProfile === undefined) return Object.freeze([...buildInitial50()]);
      const opposite = selectedProfile === 'LOW' ? 'MEDIUM' : 'LOW';
      return Object.freeze([...expand146(opposite)]);
    };
    const wrongBacking = makeBacking();
    const wrongLedger = createStrict(wrongBacking, makeStrictIdentity(), wrongProfile);
    completePreflightHappyPath(wrongLedger, wrongBacking);
    completeDevelopment48(wrongLedger);
    expect(() =>
      wrongLedger.recordProfileSelection('LOW', 'fewer_unsafe', developmentSummary()),
    ).toThrow(CalibrationFatalError);
    // Nonmonotonic: expanded set drops an initial key.
    const nonmonotonic: CalibrationKeyResolver = (selectedProfile?: CalibrationProfile) => {
      if (selectedProfile === undefined) return Object.freeze([...buildInitial50()]);
      const expanded = expand146(selectedProfile).slice(1);
      return Object.freeze(expanded);
    };
    const nonBacking = makeBacking();
    const nonLedger = createStrict(nonBacking, makeStrictIdentity(), nonmonotonic);
    completePreflightHappyPath(nonLedger, nonBacking);
    completeDevelopment48(nonLedger);
    expect(() =>
      nonLedger.recordProfileSelection('LOW', 'fewer_unsafe', developmentSummary()),
    ).toThrow(CalibrationFatalError);
    // Malformed key: illegal sample index in the expanded tail.
    const malformed: CalibrationKeyResolver = (selectedProfile?: CalibrationProfile) => {
      if (selectedProfile === undefined) return Object.freeze([...buildInitial50()]);
      const expanded = [...expand146(selectedProfile)];
      expanded[50] = { ...expanded[50], sampleIndex: 99 } as ReservationKey;
      return Object.freeze(expanded);
    };
    const malBacking = makeBacking();
    const malLedger = createStrict(malBacking, makeStrictIdentity(), malformed);
    completePreflightHappyPath(malLedger, malBacking);
    completeDevelopment48(malLedger);
    expect(() =>
      malLedger.recordProfileSelection('LOW', 'fewer_unsafe', developmentSummary()),
    ).toThrow(CalibrationFatalError);
    const failBacking = makeBacking();
    const throwing: CalibrationKeyResolver = (selectedProfile?: CalibrationProfile) => {
      if (selectedProfile === undefined) return Object.freeze([...buildInitial50()]);
      throw Object.assign(new Error(`provider boom ${failBacking.privateMarker}`), {
        privateBytes: failBacking.privateMarker,
      });
    };
    const failLedger = createStrict(failBacking, makeStrictIdentity(), throwing);
    completePreflightHappyPath(failLedger, failBacking);
    completeDevelopment48(failLedger);
    let caught: unknown;
    try {
      failLedger.recordProfileSelection('LOW', 'fewer_unsafe', developmentSummary());
    } catch (error) {
      caught = error;
    }
    expectStaticCauseless(caught, failBacking.privateMarker);
    expect(JSON.stringify(caught ?? {})).not.toContain(failBacking.privateMarker);
  });
});

describe('strict restart durability and poison', () => {
  function buildFullProtocol(): FakeBacking {
    const backing = makeBacking();
    const ledger = createStrict(backing);
    const owner = completePreflightHappyPath(ledger, backing);
    completeDevelopment48(ledger);
    ledger.recordProfileSelection('LOW', 'fewer_unsafe', developmentSummary());
    ledger.completeStage('development', developmentSummary());
    // Release the actual live owner so the restart below takes the
    // legitimate fresh-wx path; no dead-owner proof is invented.
    ledger.releaseLock(owner);
    expect(backing.lock).toBeUndefined();
    return backing;
  }

  it('reconstructs pin, selection, stages, counters, and expanded keys after restart', () => {
    const backing = buildFullProtocol();
    const eventsBefore = backing.events.length;
    const journalsBefore = backing.journals.length;
    const restarted = createStrict(backing);
    expect(restarted.getPinnedModelVersion()).toBe(PINNED_VERSION);
    expect(restarted.getSelectedProfile()).toBe('LOW');
    expect(restarted.getCompletedStages()).toEqual(['preflight', 'development']);
    expect(restarted.getCounts().imageReserved).toBeGreaterThan(0);
    expect(backing.events).toHaveLength(eventsBefore);
    expect(backing.journals).toHaveLength(journalsBefore);
    restarted.acquireLock(makeOwner({ pid: 9999, startTicks: 1 }));
    const allowed = makeCanonicalResolver()('LOW');
    expect(allowed).toHaveLength(146);
    const nextValidation = {
      stage: 'validation',
      profile: 'LOW',
      caseId: VALIDATION_CASE_IDS[0],
      sampleIndex: 1,
    } as ReservationKey;
    expect(() => restarted.reserve(nextValidation)).not.toThrow();
  });

  it('respects poison across constructor read-only getters and lock refresh for all new methods', () => {
    const backing = makeBacking();
    const ledger = createStrict(backing);
    backing.readShouldFail = true;
    let caught: unknown;
    try {
      ledger.acquireLock(makeOwner());
    } catch (error) {
      caught = error;
    }
    expectStaticCauseless(caught, backing.privateMarker);
    const opsBefore = backing.ops.length;
    const probes: Array<() => void> = [
      () => ledger.pinModelVersion(PINNED_VERSION),
      () => ledger.getPinnedModelVersion(),
      () => ledger.recordProfileSelection('LOW', 'fewer_unsafe', developmentSummary()),
      () => ledger.getSelectedProfile(),
      () => ledger.completeStage('preflight', preflightSummary()),
      () => ledger.getCompletedStages(),
    ];
    for (const probe of probes) {
      let failed: unknown;
      try {
        probe();
      } catch (error) {
        failed = error;
      }
      expectStaticCauseless(failed, backing.privateMarker);
    }
    expect(backing.ops.length).toBe(opsBefore);
  });

  it('enforces replay sequencing invariants after restart', () => {
    const backing = buildFullProtocol();
    const restarted = createStrict(backing);
    restarted.acquireLock(makeOwner({ pid: 5555, startTicks: 5 }));
    const sealedDev = {
      stage: 'development',
      profile: 'LOW',
      caseId: DEV_CASE_IDS[0],
      sampleIndex: 1,
    } as ReservationKey;
    expect(() => restarted.reserve(sealedDev)).toThrow(CalibrationFatalError);
    expect(() =>
      restarted.recordProfileSelection('MEDIUM', 'fewer_unsafe', developmentSummary()),
    ).toThrow(CalibrationFatalError);
    expect(() => restarted.pinModelVersion(OTHER_VERSION)).toThrow(CalibrationFatalError);
  });
});

describe('strict writer lock and poison guards (review)', () => {
  function catchSync(fn: () => void): unknown {
    try {
      fn();
    } catch (error) {
      return error;
    }
    return undefined;
  }

  function expectExactLockNotHeld(error: unknown): void {
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect((error as CalibrationFatalError).message).toBe('calibration:lock-not-held');
    expect((error as CalibrationFatalError).cause).toBeUndefined();
  }

  function expectExactPoisoned(error: unknown): void {
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect((error as CalibrationFatalError).message).toBe('calibration:ledger-poisoned');
    expect((error as CalibrationFatalError).cause).toBeUndefined();
  }

  it('new writers require lock before acquire even for otherwise-valid inputs', () => {
    const backing = makeBacking();
    const ledger = createStrict(backing);
    expect(backing.events).toHaveLength(0);
    expectExactLockNotHeld(catchSync(() => ledger.pinModelVersion(PINNED_VERSION)));
    expectExactLockNotHeld(
      catchSync(() => ledger.recordProfileSelection('LOW', 'fewer_unsafe', developmentSummary())),
    );
    expectExactLockNotHeld(catchSync(() => ledger.completeStage('preflight', preflightSummary())));
    expect(backing.events).toHaveLength(0);
    expect(backing.ops).not.toContain('appendLedgerEvent');
  });

  it('pin requires lock after release with token complete and LOW active', () => {
    const backing = makeBacking();
    const ledger = createStrict(backing);
    const owner = makeOwner();
    ledger.acquireLock(owner);
    const tokenKey = makeTokenKey();
    ledger.reserveTokenCount(tokenKey);
    ledger.completeTokenCount(tokenKey, 1200);
    const low = {
      stage: 'preflight',
      profile: 'LOW',
      caseId: FIRST_DEV,
      sampleIndex: 1,
    } as ReservationKey;
    ledger.reserve(low);
    ledger.releaseLock(owner);
    const eventsBefore = backing.events.length;
    expectExactLockNotHeld(catchSync(() => ledger.pinModelVersion(PINNED_VERSION)));
    expect(backing.events).toHaveLength(eventsBefore);
    expect(ledger.getPinnedModelVersion()).toBeUndefined();
  });

  it('selection requires lock after release with preflight and 48 development terminals', () => {
    const backing = makeBacking();
    const ledger = createStrict(backing);
    const owner = makeOwner();
    ledger.acquireLock(owner);
    completePreflightLocked(ledger, backing);
    completeDevelopment48(ledger);
    ledger.releaseLock(owner);
    const eventsBefore = backing.events.length;
    expectExactLockNotHeld(
      catchSync(() => ledger.recordProfileSelection('LOW', 'fewer_unsafe', developmentSummary())),
    );
    expect(backing.events).toHaveLength(eventsBefore);
    expect(ledger.getSelectedProfile()).toBeUndefined();
  });

  it('completed-stage idempotent repeat requires ownership after release', () => {
    const backing = makeBacking();
    const ledger = createStrict(backing);
    const owner = makeOwner();
    ledger.acquireLock(owner);
    completePreflightLocked(ledger, backing);
    expect(ledger.getCompletedStages()).toEqual(['preflight']);
    ledger.releaseLock(owner);
    const eventsBefore = backing.events.length;
    expectExactLockNotHeld(catchSync(() => ledger.completeStage('preflight', preflightSummary())));
    expect(backing.events).toHaveLength(eventsBefore);
    expect(ledger.getCompletedStages()).toEqual(['preflight']);
  });

  it('late persistence fault poisons all new writers before idempotent returns', () => {
    const backing = makeBacking();
    const ledger = createStrict(backing);
    const owner = makeOwner();
    ledger.acquireLock(owner);
    completePreflightLocked(ledger, backing);
    completeDevelopment48(ledger);
    const originalAppend = backing.deps.appendLedgerEvent;
    const originalFsync = backing.deps.fsyncLedgerFile;
    let fsyncArmed = false;
    backing.deps.appendLedgerEvent = (event: unknown) => {
      originalAppend(event);
      if ((event as { type?: string }).type === 'profile_selected') {
        fsyncArmed = true;
      }
    };
    backing.deps.fsyncLedgerFile = () => {
      if (fsyncArmed) {
        fsyncArmed = false;
        throw new CalibrationFatalError(`calibration:boom ${backing.privateMarker}`, {
          cause: { privateBytes: backing.privateMarker },
        });
      }
      originalFsync();
    };
    const first = catchSync(() =>
      ledger.recordProfileSelection('LOW', 'fewer_unsafe', developmentSummary()),
    );
    expectStaticCauseless(first, backing.privateMarker);
    expect(JSON.stringify(first ?? {})).not.toContain(backing.privateMarker);
    // Uncertain persistence: the profile_selected bytes reached the journal
    // while durability is unknown, so the instance must be poisoned.
    expect(eventTypes(backing)).toContain('profile_selected');
    backing.deps.appendLedgerEvent = originalAppend;
    backing.deps.fsyncLedgerFile = originalFsync;
    const opsBefore = backing.ops.length;
    const eventsBefore = backing.events.length;
    const resolverBefore = backing.resolverCalls.calls;
    // Idempotent repeats must still fail closed once poisoned.
    expectExactPoisoned(catchSync(() => ledger.pinModelVersion(PINNED_VERSION)));
    expectExactPoisoned(
      catchSync(() => ledger.recordProfileSelection('LOW', 'fewer_unsafe', developmentSummary())),
    );
    expectExactPoisoned(catchSync(() => ledger.completeStage('preflight', preflightSummary())));
    expectExactPoisoned(catchSync(() => ledger.getPinnedModelVersion()));
    expectExactPoisoned(catchSync(() => ledger.getSelectedProfile()));
    expectExactPoisoned(catchSync(() => ledger.getCompletedStages()));
    expect(backing.ops.length).toBe(opsBefore);
    expect(backing.events).toHaveLength(eventsBefore);
    expect(backing.resolverCalls.calls).toBe(resolverBefore);
  });
});

describe('strict acquire and transition sanitization (review)', () => {
  function catchSync(fn: () => void): unknown {
    try {
      fn();
    } catch (error) {
      return error;
    }
    return undefined;
  }

  function foreignFault(marker: string, typed: boolean): Error {
    if (typed) {
      return new CalibrationFatalError(`calibration:evil ${marker}`, {
        cause: { privateBytes: marker },
      });
    }
    return Object.assign(new Error(`EIO ${marker}`), { privateBytes: marker });
  }

  it('sanitizes throwing getRoot and runDir accessors', () => {
    for (const typed of [false, true]) {
      const backing = makeBacking();
      const ledger = createStrict(backing);
      const fault = foreignFault(backing.privateMarker, typed);
      backing.deps.getRoot = (): string => {
        throw fault;
      };
      const rootCaught = catchSync(() => ledger.acquireLock(makeOwner()));
      expectStaticCauseless(rootCaught, backing.privateMarker);
      expect(JSON.stringify(rootCaught ?? {})).not.toContain(backing.privateMarker);
      expect(backing.lock).toBeUndefined();
      expect(backing.events).toHaveLength(0);

      const dirBacking = makeBacking();
      const dirLedger = createStrict(dirBacking);
      const dirFault = foreignFault(dirBacking.privateMarker, typed);
      const opts = {};
      Object.defineProperty(opts, 'runDir', {
        get: (): string => {
          throw dirFault;
        },
        enumerable: true,
      });
      const dirCaught = catchSync(() =>
        dirLedger.acquireLock(makeOwner(), opts as { runDir?: string }),
      );
      expectStaticCauseless(dirCaught, dirBacking.privateMarker);
      expect(JSON.stringify(dirCaught ?? {})).not.toContain(dirBacking.privateMarker);
      expect(dirBacking.lock).toBeUndefined();
      expect(dirBacking.events).toHaveLength(0);
    }
  });

  it('sanitizes stale-owner field getters and foreign liveness strings', () => {
    for (const typed of [false, true]) {
      const backing = makeBacking();
      const ledger = createStrict(backing);
      const stale = makeOwner();
      const fault = foreignFault(backing.privateMarker, typed);
      Object.defineProperty(stale, 'hostname', {
        get: (): string => {
          throw fault;
        },
        enumerable: true,
      });
      backing.lock = stale;
      const caught = catchSync(() => ledger.acquireLock(makeOwner({ pid: 9999, startTicks: 7 })));
      expectStaticCauseless(caught, backing.privateMarker);
      expect(JSON.stringify(caught ?? {})).not.toContain(backing.privateMarker);
      expect(backing.lock).toBe(stale);
      expect(backing.events).toHaveLength(0);
    }
    const liveBacking = makeBacking();
    const liveLedger = createStrict(liveBacking);
    liveBacking.lock = makeOwner();
    liveBacking.deps.probeOwnerLiveness = (): CalibrationLiveness =>
      `live-${liveBacking.privateMarker}` as unknown as CalibrationLiveness;
    const liveCaught = catchSync(() => liveLedger.acquireLock(makeOwner({ pid: 5, startTicks: 5 })));
    expect(liveCaught).toBeInstanceOf(CalibrationFatalError);
    expect((liveCaught as CalibrationFatalError).message).toBe('calibration:lock-held-unknown');
    expect((liveCaught as CalibrationFatalError).cause).toBeUndefined();
    expect(JSON.stringify(liveCaught ?? {})).not.toContain(liveBacking.privateMarker);
    expect(liveBacking.events).toHaveLength(0);
  });

  it('dead-recovery clock failure is static with lock retained and no audit', () => {
    const backing = makeBacking('dead');
    const first = createStrict(backing);
    first.acquireLock(makeOwner());
    expect(backing.events).toHaveLength(1);
    const second = createStrict(backing);
    const fault = foreignFault(backing.privateMarker, true);
    backing.deps.nowIso = (): string => {
      throw fault;
    };
    const ownerB = makeOwner({ pid: 7777, startTicks: 111 });
    const caught = catchSync(() => second.acquireLock(ownerB));
    expectStaticCauseless(caught, backing.privateMarker);
    expect(JSON.stringify(caught ?? {})).not.toContain(backing.privateMarker);
    expect(backing.lock).toEqual(ownerB);
    expect(eventTypes(backing)).not.toContain('lock_recovery');
    expect(backing.events).toHaveLength(1);
  });

  it('stale-owner audit persists a fresh closed snapshot', () => {
    const backing = makeBacking('dead');
    const first = createStrict(backing);
    first.acquireLock(makeOwner());
    const stale = backing.lock as CalibrationOwner;
    let serialized = 0;
    Object.defineProperty(stale, 'extraField', { value: 'leak', enumerable: true });
    Object.defineProperty(stale, 'toJSON', {
      value: () => {
        serialized += 1;
        return {};
      },
      enumerable: false,
    });
    const second = createStrict(backing);
    second.acquireLock(makeOwner({ pid: 7777, startTicks: 111 }));
    const audit = backing.events.find(
      (event) => (event as { type: string }).type === 'lock_recovery',
    ) as unknown as Record<string, unknown> | undefined;
    expect(audit).toBeDefined();
    const persistedStale = (audit as unknown as { staleOwner: unknown }).staleOwner as Record<
      string,
      unknown
    >;
    expect(Object.keys(persistedStale).sort()).toEqual([
      'acquiredAt',
      'bootId',
      'hostname',
      'pid',
      'startTicks',
    ]);
    const persistedRecovering = (audit as unknown as { recoveringOwner: unknown })
      .recoveringOwner as Record<string, unknown>;
    expect(Object.keys(persistedRecovering).sort()).toEqual([
      'acquiredAt',
      'bootId',
      'hostname',
      'pid',
      'startTicks',
    ]);
    expect(serialized).toBe(0);
  });

  it('assertStageTransition sanitizes foreign summary accessors', () => {
    const backing = makeBacking();
    const ledger = createStrict(backing);
    ledger.acquireLock(makeOwner());
    const opsBefore = backing.ops.length;
    for (const typed of [false, true]) {
      const fault = foreignFault(backing.privateMarker, typed);
      const evil = {};
      Object.defineProperty(evil, 'stage', {
        get: (): string => {
          throw fault;
        },
        enumerable: true,
      });
      Object.defineProperty(evil, 'passed', { value: true, enumerable: true });
      Object.defineProperty(evil, 'completedStages', { value: [], enumerable: true });
      const caught = catchSync(() =>
        ledger.assertStageTransition(
          'preflight',
          'development',
          evil as unknown as CalibrationStageGateSummary,
        ),
      );
      expectStaticCauseless(caught, backing.privateMarker);
      expect(JSON.stringify(caught ?? {})).not.toContain(backing.privateMarker);
    }
    expect(backing.ops.length).toBe(opsBefore);
    expect(() =>
      ledger.assertStageTransition('preflight', 'development', {
        stage: 'validation',
        passed: true,
        completedStages: [],
      }),
    ).toThrow(CalibrationFatalError);
    expect(backing.ops.length).toBe(opsBefore);
  });
});

describe('strict synthetic prohibition (review)', () => {
  function catchSync(fn: () => void): unknown {
    try {
      fn();
    } catch (error) {
      return error;
    }
    return undefined;
  }

  it('strict reserveSynthetic statically rejects without reading inputs', () => {
    const backing = makeBacking();
    const ledger = createStrict(backing);
    ledger.acquireLock(makeOwner());
    const opsBefore = backing.ops.length;
    expectStaticCauseless(
      catchSync(() => ledger.reserveSynthetic({ reason: 'calibration-run', index: 0 }, () => {})),
      backing.privateMarker,
    );
    expectStaticCauseless(
      catchSync(() => ledger.reserveSynthetic({ reason: 'provider timeout', index: 0 }, () => {})),
      backing.privateMarker,
    );
    for (const index of [-1, Number.NaN, 301]) {
      expectStaticCauseless(
        catchSync(() => ledger.reserveSynthetic({ reason: 'calibration-run', index }, () => {})),
        backing.privateMarker,
      );
    }
    const evil = { reason: 'ok', index: 0 };
    Object.defineProperty(evil, 'index', {
      get: (): number => {
        throw Object.assign(new Error(`EIO ${backing.privateMarker}`), {
          privateBytes: backing.privateMarker,
        });
      },
      enumerable: true,
    });
    expectStaticCauseless(
      catchSync(() => ledger.reserveSynthetic(evil, () => {})),
      backing.privateMarker,
    );
    let onFatalInvoked = false;
    const originalAppend = backing.deps.appendLedgerEvent;
    let armed = true;
    backing.deps.appendLedgerEvent = (event: unknown) => {
      if (armed) {
        armed = false;
        throw new Error(`ENOSPC ${backing.privateMarker}`);
      }
      originalAppend(event);
    };
    const fatalCaught = catchSync(() =>
      ledger.reserveSynthetic({ reason: 'calibration-run', index: 0 }, () => {
        onFatalInvoked = true;
        throw Object.assign(new Error(`boom ${backing.privateMarker}`), {
          privateBytes: backing.privateMarker,
        });
      }),
    );
    backing.deps.appendLedgerEvent = originalAppend;
    expectStaticCauseless(fatalCaught, backing.privateMarker);
    expect(onFatalInvoked).toBe(false);
    expect(backing.ops.length).toBe(opsBefore);
    expect(eventTypes(backing)).not.toContain('synthetic_reserved');
  });

  it('strict replay rejects synthetic_reserved while legacy accepts it', () => {
    const backing = makeBacking();
    backing.events.push({
      type: 'protocol_identity',
      identity: makeStrictIdentity(),
      at: '2026-10-05T00:00:01.000Z',
    });
    backing.events.push({
      type: 'synthetic_reserved',
      reason: 'r',
      index: 0,
      at: '2026-10-05T00:00:02.000Z',
    });
    expect(() => createStrict(backing)).toThrow(CalibrationFatalError);
    const legacyBacking = makeBacking();
    const key = buildInitial50()[0] as ReservationKey;
    legacyBacking.events.push({ type: 'reserved', key, at: '2026-10-05T00:00:01.000Z' });
    legacyBacking.events.push({
      type: 'synthetic_reserved',
      reason: 'freeform provider text',
      index: 0,
      at: '2026-10-05T00:00:02.000Z',
    });
    const legacy = createCalibrationLedger(legacyBacking.deps, makeStrictIdentity(), [key]);
    expect(legacy.getCounts().imageReserved).toBe(1);
    legacy.acquireLock(makeOwner());
    legacy.reserveSynthetic({ reason: 'provider timeout freeform', index: 0 }, () => {});
    expect(eventTypes(legacyBacking)).toContain('synthetic_reserved');
  });
});

describe('strict event-zero exact type (review)', () => {
  function catchSync(fn: () => void): unknown {
    try {
      fn();
    } catch (error) {
      return error;
    }
    return undefined;
  }

  it('constructor rejects non-protocol_identity event zero', () => {
    const at = '2026-10-05T00:00:01.000Z';
    const zeros: unknown[] = [
      { type: 'not_identity', identity: makeStrictIdentity(), at },
      { type: null, identity: makeStrictIdentity(), at },
      { type: { nested: 'object' }, identity: makeStrictIdentity(), at },
    ];
    for (const zero of zeros) {
      const backing = makeBacking();
      backing.events.push(zero);
      expect(() => createStrict(backing)).toThrow(CalibrationFatalError);
    }
    for (const typed of [false, true]) {
      const backing = makeBacking();
      const fault =
        typed === true
          ? new CalibrationFatalError(`calibration:evil ${backing.privateMarker}`, {
              cause: { privateBytes: backing.privateMarker },
            })
          : Object.assign(new Error(`EIO ${backing.privateMarker}`), {
              privateBytes: backing.privateMarker,
            });
      const evil = { identity: makeStrictIdentity(), at };
      Object.defineProperty(evil, 'type', {
        get: (): string => {
          throw fault;
        },
        enumerable: true,
      });
      backing.events.push(evil);
      const caught = catchSync(() => createStrict(backing));
      expectStaticCauseless(caught, backing.privateMarker);
      expect(JSON.stringify(caught ?? {})).not.toContain(backing.privateMarker);
    }
  });

  it('under-lock refresh poisons on bad event zero with lock retained', () => {
    const at = '2026-10-05T00:00:01.000Z';
    const zeros: unknown[] = [
      { type: 'not_identity', identity: makeStrictIdentity(), at },
      (() => {
        const evil = { identity: makeStrictIdentity(), at };
        Object.defineProperty(evil, 'type', {
          get: (): string => {
            throw new CalibrationFatalError('calibration:evil typed-getter');
          },
          enumerable: true,
        });
        return evil;
      })(),
    ];
    for (const zero of zeros) {
      const backing = makeBacking();
      const ledger = createStrict(backing);
      backing.events.push(zero);
      const caught = catchSync(() => ledger.acquireLock(makeOwner()));
      expect(caught).toBeInstanceOf(CalibrationFatalError);
      expect((caught as CalibrationFatalError).message).toBe('calibration:ledger-poisoned');
      expect((caught as CalibrationFatalError).cause).toBeUndefined();
      expect(backing.lock).toBeDefined();
      expect(backing.events).toHaveLength(1);
      const poisoned = catchSync(() => ledger.getPinnedModelVersion());
      expect(poisoned).toBeInstanceOf(CalibrationFatalError);
      expect((poisoned as CalibrationFatalError).message).toBe('calibration:ledger-poisoned');
    }
  });
});

describe('strict journal reconciliation (review)', () => {
  function cloneReviewBacking(source: FakeBacking): FakeBacking {
    const copy = makeBacking();
    copy.events.push(...(JSON.parse(JSON.stringify(source.events)) as unknown[]));
    copy.journals.push(...(JSON.parse(JSON.stringify(source.journals)) as JournalEntry[]));
    return copy;
  }

  function buildPinnedHistory(): FakeBacking {
    const backing = makeBacking();
    const ledger = createStrict(backing);
    completePreflightHappyPath(ledger, backing);
    return backing;
  }

  it('rejects unplanned and never-reserved journals even without terminal events', () => {
    const unplannedKey = {
      stage: 'validation',
      profile: 'LOW',
      caseId: VALIDATION_CASE_IDS[0],
      sampleIndex: 1,
    } as ReservationKey;
    const neverReservedKey = {
      stage: 'development',
      profile: 'LOW',
      caseId: DEV_CASE_IDS[5],
      sampleIndex: 1,
    } as ReservationKey;
    const cases: JournalEntry[] = [
      successJournal(unplannedKey),
      failureJournal(unplannedKey, 'timeout'),
      successJournal(neverReservedKey),
      failureJournal(neverReservedKey, 'timeout'),
    ];
    for (const entry of cases) {
      const seeded = cloneReviewBacking(buildPinnedHistory());
      seeded.journals.push(entry);
      expect(() => createStrict(seeded)).toThrow(CalibrationFatalError);
    }
  });

  it('accepts crash-window and expanded downstream journals without terminal events', () => {
    const backing = makeBacking();
    const ledger = createStrict(backing);
    completePreflightHappyPath(ledger, backing);
    const windowKey = {
      stage: 'development',
      profile: 'LOW',
      caseId: DEV_CASE_IDS[0],
      sampleIndex: 1,
    } as ReservationKey;
    ledger.reserve(windowKey);
    ledger.appendResultJournal(successJournal(windowKey));
    const crash = cloneReviewBacking(backing);
    const crashLedger = createStrict(crash);
    expect(crashLedger.getCounts().imageReserved).toBe(3);
    expect(crashLedger.getPinnedModelVersion()).toBe(PINNED_VERSION);

    const selected = makeBacking();
    const selectedLedger = createStrict(selected);
    const selectedOwner = makeOwner();
    selectedLedger.acquireLock(selectedOwner);
    completePreflightLocked(selectedLedger, selected);
    completeDevelopment48(selectedLedger);
    selectedLedger.recordProfileSelection('LOW', 'fewer_unsafe', developmentSummary());
    selectedLedger.completeStage('development', developmentSummary());
    const downstreamKey = {
      stage: 'validation',
      profile: 'LOW',
      caseId: VALIDATION_CASE_IDS[0],
      sampleIndex: 1,
    } as ReservationKey;
    selectedLedger.reserve(downstreamKey);
    selectedLedger.appendResultJournal(successJournal(downstreamKey));
    const expanded = cloneReviewBacking(selected);
    const expandedLedger = createStrict(expanded);
    expect(expandedLedger.getSelectedProfile()).toBe('LOW');
    expect(expandedLedger.getCounts().imageReserved).toBe(2 + 48 + 1);
  });
});

describe('strict interrupted binding (review)', () => {
  function catchSync(fn: () => void): unknown {
    try {
      fn();
    } catch (error) {
      return error;
    }
    return undefined;
  }

  function cloneReviewBacking(source: FakeBacking): FakeBacking {
    const copy = makeBacking();
    copy.events.push(...(JSON.parse(JSON.stringify(source.events)) as unknown[]));
    copy.journals.push(...(JSON.parse(JSON.stringify(source.journals)) as JournalEntry[]));
    return copy;
  }

  function buildReservedLow(): { backing: FakeBacking; low: ReservationKey; successHash: string } {
    const backing = makeBacking();
    const ledger = createStrict(backing);
    ledger.acquireLock(makeOwner());
    const tokenKey = makeTokenKey();
    ledger.reserveTokenCount(tokenKey);
    ledger.completeTokenCount(tokenKey, 5);
    const low = {
      stage: 'preflight',
      profile: 'LOW',
      caseId: FIRST_DEV,
      sampleIndex: 1,
    } as ReservationKey;
    ledger.reserve(low);
    ledger.pinModelVersion(PINNED_VERSION);
    const successHash = ledger.appendResultJournal(successJournal(low));
    return { backing, low, successHash };
  }

  function failedEventFor(key: ReservationKey, journalHash: string): unknown {
    return { type: 'failed', key, journalHash, at: '2026-10-05T00:00:09.000Z' };
  }

  it('failed events must bind the canonical interrupted marker', () => {
    const { backing, low, successHash } = buildReservedLow();
    const boundSuccess = cloneReviewBacking(backing);
    boundSuccess.events.push(failedEventFor(low, successHash));
    expect(() => createStrict(boundSuccess)).toThrow(CalibrationFatalError);

    const failureEntry = failureJournal(low, 'timeout');
    const failureHash = journalHashFor(failureEntry);
    const boundFailure = cloneReviewBacking(backing);
    boundFailure.journals.push(failureEntry);
    boundFailure.events.push(failedEventFor(low, failureHash));
    expect(() => createStrict(boundFailure)).toThrow(CalibrationFatalError);

    const impatient: JournalEntry = {
      key: low,
      predictionHash: 'interrupted_reservation',
      normalizedPrediction: null,
      analysisLatencyMs: 5,
      errorCategory: 'interrupted_reservation',
      responseModelVersion: 'n/a',
    };
    const impatientHash = journalHashFor(impatient);
    const boundImpatient = cloneReviewBacking(backing);
    boundImpatient.journals.push(impatient);
    boundImpatient.events.push(failedEventFor(low, impatientHash));
    expect(() => createStrict(boundImpatient)).toThrow(CalibrationFatalError);
    expect(catchSync(() => createStrict(boundImpatient))).not.toBeUndefined();
  });

  it('preserves actual interrupted recovery journal replay', () => {
    const backing = makeBacking();
    const ledger = createStrict(backing);
    ledger.acquireLock(makeOwner());
    const tokenKey = makeTokenKey();
    ledger.reserveTokenCount(tokenKey);
    ledger.completeTokenCount(tokenKey, 5);
    const low = {
      stage: 'preflight',
      profile: 'LOW',
      caseId: FIRST_DEV,
      sampleIndex: 1,
    } as ReservationKey;
    ledger.reserve(low);
    const report = ledger.recoverAfterCrash();
    expect(report.interrupted).toContainEqual(low);
    const failureEntry = backing.journals[backing.journals.length - 1] as JournalEntry;
    expect(failureEntry.errorCategory).toBe('interrupted_reservation');
    expect(failureEntry.predictionHash).toBe('interrupted_reservation');
    expect(failureEntry.normalizedPrediction).toBeNull();
    expect(failureEntry.responseModelVersion).toBe('n/a');
    expect(failureEntry.analysisLatencyMs).toBe(0);
    const replayed = createStrict(backing);
    expect(replayed.getCounts().imageReserved).toBe(1);
    expect(replayed.rebuildReport().completed).toHaveLength(0);
  });
});
