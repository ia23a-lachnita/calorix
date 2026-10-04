/**
 * Task 7 RED test: durable safe-error ledger event.
 *
 * Uses a real temporary file store, acquires the ledger lock, reserves the
 * Stage 0 token key, fails it with http_429, then calls the future
 * ledger.recordSafeError with the exact token safe entry. A fresh disk replay
 * must show token_count_reserved, token_count_failed, safe_error with the
 * exact event/entry keys, and counts of 1 token / 0 images.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { closeSync, fsyncSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCalibrationLedger } from '../../src/nutrition-eval/calibration';
import { createFileCalibrationLedgerDeps } from '../../src/nutrition-eval/calibration-file-store';
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';
import type {
  CalibrationIdentity,
  CalibrationLedgerSafeErrorEntry,
  CalibrationOwner,
  ReservationKey,
  TokenCountReservationKey,
  CalibrationSafeErrorCategory,
} from '../../src/nutrition-eval/calibration';

const PREFLIGHT_CASE_ID = 'calibration-dish_1565117892';

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop() as string;
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'calorix-safe-error-ledger-'));
  tempDirs.push(dir);
  return dir;
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

describe('calibration safe-error ledger', () => {
  it('records token 429 safe error with exact replay grammar and no budget effect', () => {
    const baseDir = makeTempDir();
    const lowKey: ReservationKey = {
      stage: 'preflight',
      profile: 'LOW',
      caseId: PREFLIGHT_CASE_ID,
      sampleIndex: 1,
    };
    const mediumKey: ReservationKey = {
      stage: 'preflight',
      profile: 'MEDIUM',
      caseId: PREFLIGHT_CASE_ID,
      sampleIndex: 1,
    };
    const identity = makeIdentity();
    const owner = makeOwner();

    const deps = createFileCalibrationLedgerDeps(baseDir);
    const ledger = createCalibrationLedger(deps, identity, [lowKey, mediumKey]);

    // Acquire lock
    ledger.acquireLock(owner);

    // Reserve Stage 0 token key
    const tokenKey: TokenCountReservationKey = {
      kind: 'token_count',
      stage: 'preflight',
      caseId: PREFLIGHT_CASE_ID,
      model: 'gemini-3.8-flash',
    };
    ledger.reserveTokenCount(tokenKey);

    // Fail token with http_429
    ledger.failTokenCount(tokenKey, 'http_429');

    // Record safe error with exact token safe entry
    const safeEntry = {
      stage: 'preflight' as const,
      kind: 'token_count' as const,
      caseId: PREFLIGHT_CASE_ID,
      errorCategory: 'http_429' as CalibrationSafeErrorCategory,
    };
    ledger.recordSafeError(safeEntry);

    // Fresh disk replay: re-open with new deps/ledger
    const freshDeps = createFileCalibrationLedgerDeps(baseDir);
    const fresh = createCalibrationLedger(freshDeps, makeIdentity(), [lowKey, mediumKey]);

    // Assert counts remain 1 token / 0 images
    expect(fresh.getCounts()).toMatchObject({ tokenCountReserved: 1, imageReserved: 0 });

    // Assert replay event types
    const events = freshDeps.readLedgerEvents() as Array<Record<string, unknown>>;
    expect(events.map((event) => event.type)).toEqual([
      'token_count_reserved',
      'token_count_failed',
      'safe_error',
    ]);

    // Assert safe_error event has exactly type, entry, at keys
    const safeErrorEvent = events.find((event) => event.type === 'safe_error') as
      | { type?: unknown; entry?: unknown; at?: unknown }
      | undefined;
    expect(safeErrorEvent).toBeDefined();
    expect(Object.keys(safeErrorEvent ?? {}).sort()).toEqual(['at', 'entry', 'type']);
    expect(safeErrorEvent?.type).toBe('safe_error');

    // Assert entry has exactly four fields
    const entry = safeErrorEvent?.entry as Record<string, unknown> | undefined;
    expect(entry).toBeDefined();
    expect(Object.keys(entry ?? {}).sort()).toEqual([
      'caseId',
      'errorCategory',
      'kind',
      'stage',
    ]);
    expect(entry?.stage).toBe('preflight');
    expect(entry?.kind).toBe('token_count');
    expect(entry?.caseId).toBe(PREFLIGHT_CASE_ID);
    expect(entry?.errorCategory).toBe('http_429');

    // Assert at is a canonical ISO timestamp
    expect(typeof safeErrorEvent?.at).toBe('string');
    expect(() => new Date(safeErrorEvent?.at as string).toISOString()).not.toThrow();

    // Lock remains held (fixture will release in afterEach via cleanup)
    expect(freshDeps.readLock()).toEqual(owner);
  });

  it('rejects syntactically valid but unplanned safe-error keys before append', () => {
    const baseDir = makeTempDir();
    const lowKey: ReservationKey = {
      stage: 'preflight',
      profile: 'LOW',
      caseId: PREFLIGHT_CASE_ID,
      sampleIndex: 1,
    };
    const mediumKey: ReservationKey = {
      stage: 'preflight',
      profile: 'MEDIUM',
      caseId: PREFLIGHT_CASE_ID,
      sampleIndex: 1,
    };
    const identity = makeIdentity();
    const owner = makeOwner();

    const deps = createFileCalibrationLedgerDeps(baseDir);
    const ledger = createCalibrationLedger(deps, identity, [lowKey, mediumKey]);

    ledger.acquireLock(owner);

    const unplannedTokenEntry = {
      stage: 'preflight' as const,
      kind: 'token_count' as const,
      caseId: 'unrelated_dish_1',
      errorCategory: 'http_429' as CalibrationSafeErrorCategory,
    };
    expect(() => ledger.recordSafeError(unplannedTokenEntry)).toThrow(
      CalibrationFatalError,
    );

    const unplannedImageEntry = {
      stage: 'preflight' as const,
      kind: 'image' as const,
      caseId: 'unrelated_dish_1',
      profile: 'LOW' as const,
      sampleIndex: 1 as const,
      errorCategory: 'http_5xx' as CalibrationSafeErrorCategory,
    };
    expect(() => ledger.recordSafeError(unplannedImageEntry)).toThrow(
      CalibrationFatalError,
    );

    expect(deps.readLedgerEvents()).toEqual([]);
    expect(ledger.getCounts()).toMatchObject({
      tokenCountReserved: 0,
      imageReserved: 0,
    });
    expect(deps.readLock()).toEqual(owner);
  });

  it('records LOW image 5xx safe error with durable journal and no extra budget', () => {
    const baseDir = makeTempDir();
    const lowKey: ReservationKey = {
      stage: 'preflight',
      profile: 'LOW',
      caseId: PREFLIGHT_CASE_ID,
      sampleIndex: 1,
    };
    const mediumKey: ReservationKey = {
      stage: 'preflight',
      profile: 'MEDIUM',
      caseId: PREFLIGHT_CASE_ID,
      sampleIndex: 1,
    };
    const identity = makeIdentity();
    const owner = makeOwner();

    const deps = createFileCalibrationLedgerDeps(baseDir);
    const ledger = createCalibrationLedger(deps, identity, [lowKey, mediumKey]);

    ledger.acquireLock(owner);
    ledger.reserve(lowKey);
    const journalHash = ledger.appendResultJournal({
      key: lowKey,
      predictionHash: 'http_5xx',
      normalizedPrediction: null,
      analysisLatencyMs: 0,
      errorCategory: 'http_5xx',
      responseModelVersion: 'n/a',
    });
    ledger.complete(lowKey, journalHash);

    const safeEntry = {
      stage: 'preflight' as const,
      kind: 'image' as const,
      caseId: PREFLIGHT_CASE_ID,
      profile: 'LOW' as const,
      sampleIndex: 1 as const,
      errorCategory: 'http_5xx' as CalibrationSafeErrorCategory,
    };
    ledger.recordSafeError(safeEntry);

    const freshDeps = createFileCalibrationLedgerDeps(baseDir);
    const fresh = createCalibrationLedger(freshDeps, makeIdentity(), [lowKey, mediumKey]);

    expect(fresh.getCounts()).toMatchObject({ tokenCountReserved: 0, imageReserved: 1 });
    expect(fresh.rebuildReport().completed).toEqual([lowKey]);

    const journals = freshDeps.readJournalEntries();
    expect(journals).toHaveLength(1);
    expect(journals[0]?.key).toEqual(lowKey);
    expect(journals[0]).toMatchObject({
      predictionHash: 'http_5xx',
      normalizedPrediction: null,
      errorCategory: 'http_5xx',
      responseModelVersion: 'n/a',
    });

    const events = freshDeps.readLedgerEvents() as Array<Record<string, unknown>>;
    expect(events.map((event) => event.type)).toEqual([
      'reserved',
      'completed',
      'safe_error',
    ]);

    const safeErrorEvent = events.find((event) => event.type === 'safe_error') as
      | { type?: unknown; entry?: unknown; at?: unknown }
      | undefined;
    expect(safeErrorEvent).toBeDefined();
    expect(Object.keys(safeErrorEvent ?? {}).sort()).toEqual(['at', 'entry', 'type']);
    expect(safeErrorEvent?.type).toBe('safe_error');

    const entry = safeErrorEvent?.entry as Record<string, unknown> | undefined;
    expect(entry).toBeDefined();
    expect(Object.keys(entry ?? {}).sort()).toEqual([
      'caseId',
      'errorCategory',
      'kind',
      'profile',
      'sampleIndex',
      'stage',
    ]);
    expect(entry).toEqual({
      stage: 'preflight',
      kind: 'image',
      caseId: PREFLIGHT_CASE_ID,
      profile: 'LOW',
      sampleIndex: 1,
      errorCategory: 'http_5xx',
    });

    expect(typeof safeErrorEvent?.at).toBe('string');
    expect(() => new Date(safeErrorEvent?.at as string).toISOString()).not.toThrow();

    expect(freshDeps.readLock()).toEqual(owner);
  });

  it('records provider unknown token failure as separate terminal and safe events', () => {
    const baseDir = makeTempDir();
    const lowKey: ReservationKey = {
      stage: 'preflight',
      profile: 'LOW',
      caseId: PREFLIGHT_CASE_ID,
      sampleIndex: 1,
    };
    const mediumKey: ReservationKey = {
      stage: 'preflight',
      profile: 'MEDIUM',
      caseId: PREFLIGHT_CASE_ID,
      sampleIndex: 1,
    };
    const identity = makeIdentity();
    const owner = makeOwner();

    const deps = createFileCalibrationLedgerDeps(baseDir);
    const ledger = createCalibrationLedger(deps, identity, [lowKey, mediumKey]);

    ledger.acquireLock(owner);

    const tokenKey: TokenCountReservationKey = {
      kind: 'token_count',
      stage: 'preflight',
      caseId: PREFLIGHT_CASE_ID,
      model: 'gemini-3.8-flash',
    };
    ledger.reserveTokenCount(tokenKey);
    ledger.failTokenCount(tokenKey, 'unknown');

    const safeEntry = {
      stage: 'preflight' as const,
      kind: 'token_count' as const,
      caseId: PREFLIGHT_CASE_ID,
      errorCategory: 'unknown' as CalibrationSafeErrorCategory,
    };
    ledger.recordSafeError(safeEntry);

    const freshDeps = createFileCalibrationLedgerDeps(baseDir);
    const fresh = createCalibrationLedger(freshDeps, makeIdentity(), [lowKey, mediumKey]);

    expect(fresh.getCounts()).toMatchObject({ tokenCountReserved: 1, imageReserved: 0 });

    const events = freshDeps.readLedgerEvents() as Array<Record<string, unknown>>;
    expect(events.map((event) => event.type)).toEqual([
      'token_count_reserved',
      'token_count_failed',
      'safe_error',
    ]);

    const failedEvent = events[1] as Record<string, unknown>;
    expect(failedEvent?.errorCategory).toBe('unknown');

    const safeErrorEvent = events.find((event) => event.type === 'safe_error') as
      | { type?: unknown; entry?: unknown; at?: unknown }
      | undefined;
    expect(safeErrorEvent).toBeDefined();
    expect(Object.keys(safeErrorEvent ?? {}).sort()).toEqual(['at', 'entry', 'type']);
    expect(safeErrorEvent?.type).toBe('safe_error');

    const entry = safeErrorEvent?.entry as Record<string, unknown> | undefined;
    expect(entry).toBeDefined();
    expect(Object.keys(entry ?? {}).sort()).toEqual([
      'caseId',
      'errorCategory',
      'kind',
      'stage',
    ]);
    expect(entry).toEqual({
      stage: 'preflight',
      kind: 'token_count',
      caseId: PREFLIGHT_CASE_ID,
      errorCategory: 'unknown',
    });

    expect(typeof safeErrorEvent?.at).toBe('string');
    expect(() => new Date(safeErrorEvent?.at as string).toISOString()).not.toThrow();

    const reservedEvents = events.filter(
      (event) => event.type === 'token_count_reserved',
    );
    expect(reservedEvents).toHaveLength(1);

    expect(freshDeps.readLock()).toEqual(owner);
  });

  it('records a duplicate token reservation as a new safe_error unknown without reusing the old completion', () => {
    const baseDir = makeTempDir();
    const lowKey: ReservationKey = {
      stage: 'preflight',
      profile: 'LOW',
      caseId: PREFLIGHT_CASE_ID,
      sampleIndex: 1,
    };
    const mediumKey: ReservationKey = {
      stage: 'preflight',
      profile: 'MEDIUM',
      caseId: PREFLIGHT_CASE_ID,
      sampleIndex: 1,
    };
    const tokenKey: TokenCountReservationKey = {
      kind: 'token_count',
      stage: 'preflight',
      caseId: PREFLIGHT_CASE_ID,
      model: 'gemini-3.8-flash',
    };
    const fixtureOwner = makeOwner();
    const wrapperOwner = makeOwner({ acquiredAt: '2026-10-01T00:00:01.000Z' });

    const fixtureDeps = createFileCalibrationLedgerDeps(baseDir);
    const fixture = createCalibrationLedger(fixtureDeps, makeIdentity(), [
      lowKey,
      mediumKey,
    ]);
    fixture.acquireLock(fixtureOwner);
    fixture.reserveTokenCount(tokenKey);
    fixture.completeTokenCount(tokenKey, 42);
    fixture.releaseLock(fixtureOwner);

    const deps = createFileCalibrationLedgerDeps(baseDir);
    const ledger = createCalibrationLedger(deps, makeIdentity(), [lowKey, mediumKey]);
    ledger.acquireLock(wrapperOwner);

    expect(() => ledger.reserveTokenCount(tokenKey)).toThrow(CalibrationFatalError);

    const safeEntry = {
      stage: 'preflight' as const,
      kind: 'token_count' as const,
      caseId: PREFLIGHT_CASE_ID,
      errorCategory: 'unknown' as CalibrationSafeErrorCategory,
    };
    ledger.recordSafeError(safeEntry);
    expect(ledger.getCounts()).toMatchObject({ tokenCountReserved: 1, imageReserved: 0 });
    expect(deps.readLock()).toEqual(wrapperOwner);

    const freshDeps = createFileCalibrationLedgerDeps(baseDir);
    const fresh = createCalibrationLedger(freshDeps, makeIdentity(), [lowKey, mediumKey]);

    expect(fresh.getCounts()).toMatchObject({ tokenCountReserved: 1, imageReserved: 0 });

    const events = freshDeps.readLedgerEvents() as Array<Record<string, unknown>>;
    expect(events.map((event) => event.type)).toEqual([
      'token_count_reserved',
      'token_count_completed',
      'safe_error',
    ]);
    expect(
      events.filter((event) => event.type === 'token_count_reserved'),
    ).toHaveLength(1);

    const completedEvent = events.find(
      (event) => event.type === 'token_count_completed',
    ) as Record<string, unknown> | undefined;
    expect(completedEvent).toBeDefined();
    expect(completedEvent?.count).toBe(42);

    const safeErrorEvent = events.find((event) => event.type === 'safe_error') as
      | { type?: unknown; entry?: unknown; at?: unknown }
      | undefined;
    expect(safeErrorEvent).toBeDefined();
    expect(Object.keys(safeErrorEvent ?? {}).sort()).toEqual(['at', 'entry', 'type']);

    const entry = safeErrorEvent?.entry as Record<string, unknown> | undefined;
    expect(entry).toBeDefined();
    expect(Object.keys(entry ?? {}).sort()).toEqual([
      'caseId',
      'errorCategory',
      'kind',
      'stage',
    ]);
    expect(entry).toEqual({
      stage: 'preflight',
      kind: 'token_count',
      caseId: PREFLIGHT_CASE_ID,
      errorCategory: 'unknown',
    });

    expect(typeof safeErrorEvent?.at).toBe('string');
    expect(() => new Date(safeErrorEvent?.at as string).toISOString()).not.toThrow();

    expect(freshDeps.readLock()).toEqual(wrapperOwner);
  });

  const privacyCases: ReadonlyArray<{ name: string; entry: Record<string, unknown> }> = [
    {
      name: 'extra message with private URL',
      entry: {
        stage: 'preflight',
        kind: 'token_count',
        caseId: PREFLIGHT_CASE_ID,
        errorCategory: 'http_429',
        message: 'private https://secret.invalid',
      },
    },
    {
      name: 'malformed case ID',
      entry: {
        stage: 'preflight',
        kind: 'token_count',
        caseId: 'bad id!',
        errorCategory: 'http_429',
      },
    },
    {
      name: 'wrong stage',
      entry: {
        stage: 'development',
        kind: 'token_count',
        caseId: PREFLIGHT_CASE_ID,
        errorCategory: 'http_429',
      },
    },
    {
      name: 'category none',
      entry: {
        stage: 'preflight',
        kind: 'token_count',
        caseId: PREFLIGHT_CASE_ID,
        errorCategory: 'none',
      },
    },
    {
      name: 'missing image profile',
      entry: {
        stage: 'preflight',
        kind: 'image',
        caseId: PREFLIGHT_CASE_ID,
        sampleIndex: 1,
        errorCategory: 'http_5xx',
      },
    },
    {
      name: 'sampleIndex 2',
      entry: {
        stage: 'preflight',
        kind: 'image',
        caseId: PREFLIGHT_CASE_ID,
        profile: 'LOW',
        sampleIndex: 2,
        errorCategory: 'http_5xx',
      },
    },
  ];

  for (const privacyCase of privacyCases) {
    it(`rejects unsafe safe-error entry: ${privacyCase.name}`, () => {
      const baseDir = makeTempDir();
      const lowKey: ReservationKey = {
        stage: 'preflight',
        profile: 'LOW',
        caseId: PREFLIGHT_CASE_ID,
        sampleIndex: 1,
      };
      const mediumKey: ReservationKey = {
        stage: 'preflight',
        profile: 'MEDIUM',
        caseId: PREFLIGHT_CASE_ID,
        sampleIndex: 1,
      };
      const owner = makeOwner();

      const deps = createFileCalibrationLedgerDeps(baseDir);
      const ledger = createCalibrationLedger(deps, makeIdentity(), [lowKey, mediumKey]);
      ledger.acquireLock(owner);

      const tainted = privacyCase.entry as unknown as CalibrationLedgerSafeErrorEntry;
      expect(() => ledger.recordSafeError(tainted)).toThrow(CalibrationFatalError);

      const events = deps.readLedgerEvents() as Array<Record<string, unknown>>;
      expect(events).toEqual([]);
      const serialized = JSON.stringify(events);
      expect(serialized).not.toContain('secret.invalid');
      expect(serialized).not.toContain('private');
      expect(ledger.getCounts()).toMatchObject({
        tokenCountReserved: 0,
        imageReserved: 0,
      });
      expect(deps.readLock()).toEqual(owner);
    });
  }

  const toJSONPrivacyCases: ReadonlyArray<{ name: string; makeEntry: () => unknown }> = [
    {
      name: 'non-enumerable own toJSON',
      makeEntry: () => {
        const entry = {
          stage: 'preflight',
          kind: 'token_count',
          caseId: PREFLIGHT_CASE_ID,
          errorCategory: 'http_429',
        };
        Object.defineProperty(entry, 'toJSON', {
          enumerable: false,
          configurable: true,
          value(this: object) {
            return { ...this, message: 'private https://secret.invalid' };
          },
        });
        return entry;
      },
    },
    {
      name: 'inherited toJSON',
      makeEntry: () => {
        const proto = {
          toJSON(this: object) {
            return { ...this, message: 'private https://secret.invalid' };
          },
        };
        return Object.assign(Object.create(proto), {
          stage: 'preflight',
          kind: 'token_count',
          caseId: PREFLIGHT_CASE_ID,
          errorCategory: 'http_429',
        });
      },
    },
  ];

  for (const toJSONCase of toJSONPrivacyCases) {
    it(`privacy: recordSafeError strips toJSON-injected secret fields (${toJSONCase.name})`, () => {
      const baseDir = makeTempDir();
      const lowKey: ReservationKey = {
        stage: 'preflight',
        profile: 'LOW',
        caseId: PREFLIGHT_CASE_ID,
        sampleIndex: 1,
      };
      const mediumKey: ReservationKey = {
        stage: 'preflight',
        profile: 'MEDIUM',
        caseId: PREFLIGHT_CASE_ID,
        sampleIndex: 1,
      };
      const owner = makeOwner();
      const deps = createFileCalibrationLedgerDeps(baseDir);
      const ledger = createCalibrationLedger(deps, makeIdentity(), [lowKey, mediumKey]);
      ledger.acquireLock(owner);

      const entry = toJSONCase.makeEntry();
      expect(Object.keys(entry as Record<string, unknown>).sort()).toEqual([
        'caseId',
        'errorCategory',
        'kind',
        'stage',
      ]);
      ledger.recordSafeError(entry as unknown as CalibrationLedgerSafeErrorEntry);

      const events = deps.readLedgerEvents() as Array<Record<string, unknown>>;
      const serialized = JSON.stringify(events);
      expect(serialized).not.toContain('secret.invalid');
      expect(serialized).not.toContain('private');
      const safeErrorEvent = events.find((event) => event.type === 'safe_error') as
        | { entry?: unknown }
        | undefined;
      expect(Object.keys(safeErrorEvent?.entry as Record<string, unknown>).sort()).toEqual([
        'caseId',
        'errorCategory',
        'kind',
        'stage',
      ]);

      const freshDeps = createFileCalibrationLedgerDeps(baseDir);
      createCalibrationLedger(freshDeps, makeIdentity(), [lowKey, mediumKey]);
      const replayed = JSON.stringify(freshDeps.readLedgerEvents());
      expect(replayed).not.toContain('secret.invalid');
      expect(replayed).not.toContain('private');
    });
  }

  it('fails closed on tampered safe_error replay without leaking secrets', () => {
    const baseDir = makeTempDir();
    const lowKey: ReservationKey = {
      stage: 'preflight',
      profile: 'LOW',
      caseId: PREFLIGHT_CASE_ID,
      sampleIndex: 1,
    };
    const mediumKey: ReservationKey = {
      stage: 'preflight',
      profile: 'MEDIUM',
      caseId: PREFLIGHT_CASE_ID,
      sampleIndex: 1,
    };
    const owner = makeOwner();
    const deps = createFileCalibrationLedgerDeps(baseDir);
    const ledger = createCalibrationLedger(deps, makeIdentity(), [lowKey, mediumKey]);
    ledger.acquireLock(owner);
    const tokenKey: TokenCountReservationKey = {
      kind: 'token_count',
      stage: 'preflight',
      caseId: PREFLIGHT_CASE_ID,
      model: 'gemini-3.8-flash',
    };
    ledger.reserveTokenCount(tokenKey);
    ledger.failTokenCount(tokenKey, 'http_429');
    const baseEvents = [
      ...(deps.readLedgerEvents() as Array<Record<string, unknown>>),
    ];
    const validEntry = {
      stage: 'preflight',
      kind: 'token_count',
      caseId: PREFLIGHT_CASE_ID,
      errorCategory: 'http_429',
    };
    const validAt = '2026-10-01T00:00:00.000Z';
    const tamperedCases: ReadonlyArray<{ name: string; event: unknown }> = [
      {
        name: 'extra secret-bearing field',
        event: {
          type: 'safe_error',
          entry: { ...validEntry, apiKey: 'sk-secret.invalid' },
          at: validAt,
        },
      },
      {
        name: 'unplanned but syntactically valid key',
        event: {
          type: 'safe_error',
          entry: { ...validEntry, caseId: 'unrelated_dish_1' },
          at: validAt,
        },
      },
      {
        name: 'invalid timestamp',
        event: {
          type: 'safe_error',
          entry: { ...validEntry },
          at: 'not-a-timestamp',
        },
      },
    ];
    for (const tampered of tamperedCases) {
      const replayDeps = createFileCalibrationLedgerDeps(baseDir);
      const wrapped = {
        ...replayDeps,
        readLedgerEvents: () => [...baseEvents, tampered.event],
      };
      let thrown: unknown;
      try {
        createCalibrationLedger(wrapped, makeIdentity(), [lowKey, mediumKey]);
      } catch (error) {
        thrown = error;
      }
      expect(thrown, tampered.name).toBeInstanceOf(CalibrationFatalError);
      const message =
        thrown instanceof Error
          ? `${thrown.message} ${String(thrown.cause ?? '')}`
          : String(thrown);
      expect(message).not.toContain('secret.invalid');
      expect(message).not.toContain('sk-secret');
    }
  });

  it('throws on safe_error dir-fsync failure after lock and reservation without releasing the lock', () => {
    const baseDir = makeTempDir();
    const lowKey: ReservationKey = {
      stage: 'preflight',
      profile: 'LOW',
      caseId: PREFLIGHT_CASE_ID,
      sampleIndex: 1,
    };
    const mediumKey: ReservationKey = {
      stage: 'preflight',
      profile: 'MEDIUM',
      caseId: PREFLIGHT_CASE_ID,
      sampleIndex: 1,
    };
    const owner = makeOwner();
    let failDirFsync = false;
    const deps = createFileCalibrationLedgerDeps(baseDir, {
      fsyncDirSync: (dir: string) => {
        if (failDirFsync) throw new Error('injected safe_error dir-fsync failure');
        const fd = openSync(dir, 'r');
        try {
          fsyncSync(fd);
        } finally {
          closeSync(fd);
        }
      },
    });
    const ledger = createCalibrationLedger(deps, makeIdentity(), [lowKey, mediumKey]);
    ledger.acquireLock(owner);
    const tokenKey: TokenCountReservationKey = {
      kind: 'token_count',
      stage: 'preflight',
      caseId: PREFLIGHT_CASE_ID,
      model: 'gemini-3.8-flash',
    };
    ledger.reserveTokenCount(tokenKey);
    ledger.failTokenCount(tokenKey, 'http_429');
    failDirFsync = true;
    const safeEntry = {
      stage: 'preflight' as const,
      kind: 'token_count' as const,
      caseId: PREFLIGHT_CASE_ID,
      errorCategory: 'http_429' as CalibrationSafeErrorCategory,
    };
    expect(() => ledger.recordSafeError(safeEntry)).toThrow(CalibrationFatalError);
    expect(deps.readLock()).toEqual(owner);
    expect(ledger.getCounts()).toMatchObject({ tokenCountReserved: 1, imageReserved: 0 });
  });

  it('rejects recordSafeError without holding the lock before append', () => {
    const baseDir = makeTempDir();
    const lowKey: ReservationKey = {
      stage: 'preflight',
      profile: 'LOW',
      caseId: PREFLIGHT_CASE_ID,
      sampleIndex: 1,
    };
    const mediumKey: ReservationKey = {
      stage: 'preflight',
      profile: 'MEDIUM',
      caseId: PREFLIGHT_CASE_ID,
      sampleIndex: 1,
    };
    const deps = createFileCalibrationLedgerDeps(baseDir);
    const ledger = createCalibrationLedger(deps, makeIdentity(), [lowKey, mediumKey]);
    const safeEntry = {
      stage: 'preflight' as const,
      kind: 'token_count' as const,
      caseId: PREFLIGHT_CASE_ID,
      errorCategory: 'http_429' as CalibrationSafeErrorCategory,
    };
    expect(() => ledger.recordSafeError(safeEntry)).toThrow(CalibrationFatalError);
    expect(deps.readLedgerEvents()).toEqual([]);
    expect(deps.readLock()).toBeUndefined();
  });

  it('replays an old ledger without safe_error and leaves counts and report unchanged after a valid safe_error', () => {
    const baseDir = makeTempDir();
    const lowKey: ReservationKey = {
      stage: 'preflight',
      profile: 'LOW',
      caseId: PREFLIGHT_CASE_ID,
      sampleIndex: 1,
    };
    const mediumKey: ReservationKey = {
      stage: 'preflight',
      profile: 'MEDIUM',
      caseId: PREFLIGHT_CASE_ID,
      sampleIndex: 1,
    };
    const owner = makeOwner();
    const deps = createFileCalibrationLedgerDeps(baseDir);
    const ledger = createCalibrationLedger(deps, makeIdentity(), [lowKey, mediumKey]);
    ledger.acquireLock(owner);
    ledger.reserve(lowKey);
    const journalHash = ledger.appendResultJournal({
      key: lowKey,
      predictionHash: 'http_5xx',
      normalizedPrediction: null,
      analysisLatencyMs: 0,
      errorCategory: 'http_5xx',
      responseModelVersion: 'n/a',
    });
    ledger.complete(lowKey, journalHash);
    const beforeCounts = ledger.getCounts();
    const beforeReport = ledger.rebuildReport();
    const replayDeps = createFileCalibrationLedgerDeps(baseDir);
    const replay = createCalibrationLedger(replayDeps, makeIdentity(), [lowKey, mediumKey]);
    expect(replay.getCounts()).toEqual(beforeCounts);
    expect(replay.rebuildReport()).toEqual(beforeReport);
    expect(
      (replayDeps.readLedgerEvents() as Array<Record<string, unknown>>).map(
        (event) => event.type,
      ),
    ).toEqual(['reserved', 'completed']);
    ledger.recordSafeError({
      stage: 'preflight',
      kind: 'image',
      caseId: PREFLIGHT_CASE_ID,
      profile: 'LOW',
      sampleIndex: 1,
      errorCategory: 'http_5xx',
    });
    expect(ledger.getCounts()).toEqual(beforeCounts);
    expect(ledger.rebuildReport()).toEqual(beforeReport);
    const freshDeps = createFileCalibrationLedgerDeps(baseDir);
    const fresh = createCalibrationLedger(freshDeps, makeIdentity(), [lowKey, mediumKey]);
    expect(fresh.getCounts()).toEqual(beforeCounts);
    expect(fresh.rebuildReport()).toEqual(beforeReport);
    expect(
      (freshDeps.readLedgerEvents() as Array<Record<string, unknown>>).map(
        (event) => event.type,
      ),
    ).toEqual(['reserved', 'completed', 'safe_error']);
  });
});