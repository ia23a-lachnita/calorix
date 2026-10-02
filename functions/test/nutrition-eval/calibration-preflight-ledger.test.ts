/**
 * Task 7 Stage 0 file-ledger bridge: hermetic preflight ledger replay.
 *
 * Contract for the `createCalibrationPreflightLedgerHooks` adapter
 * (`CalibrationLedger` -> Stage 0 token/image reservation and terminal hooks,
 * with required injected `countTokens`, `generateImage`, and `recordSafeError`).
 *
 * The source adapter exists and six tests pass. This file documents the
 * current bridge contract; do not replace the real bridge with a placeholder
 * implementation.
 *
 * Hermetic contract: real temp dir only via `createFileCalibrationLedgerDeps`,
 * real `createCalibrationLedger` replay, fake token/image providers, required
 * safe recorder. No provider, Firebase, network, or device access occurs here.
 */
import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir, hostname } from 'node:os';
import { join } from 'node:path';
import { createCalibrationLedger } from '../../src/nutrition-eval/calibration';
import { createFileCalibrationLedgerDeps } from '../../src/nutrition-eval/calibration-file-store';
import { createCalibrationPreflightLedgerHooks } from '../../src/nutrition-eval/calibration-preflight-ledger';
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';
import { executeCalibrationPreflight } from '../../src/nutrition-eval/calibration-cli';
import type {
  CalibrationIdentity,
  CalibrationOwner,
  ReservationKey,
} from '../../src/nutrition-eval/calibration';

const PREFLIGHT_CASE_ID = 'calibration-dish_1565117892';
const PREFLIGHT_PINNED_VERSION = 'gemini-3.8-20260923';
const PREFLIGHT_TOKEN_COUNT = 42;

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

function makePreflightKey(profile: 'LOW' | 'MEDIUM'): ReservationKey {
  return {
    stage: 'preflight',
    profile,
    caseId: PREFLIGHT_CASE_ID,
    sampleIndex: 1,
  };
}

describe('calibration preflight ledger bridge', () => {
  it('runs Stage 0 preflight on the real file ledger and replays one token count plus two completed images', async () => {
    const tempDir = makeTempDir();
    const lowKey = makePreflightKey('LOW');
    const mediumKey = makePreflightKey('MEDIUM');
    const ledger = createCalibrationLedger(
      createFileCalibrationLedgerDeps(tempDir),
      makeIdentity(),
      [lowKey, mediumKey],
    );
    const owner = makeOwner();
    ledger.acquireLock(owner);

    const safeEntries: unknown[] = [];
    let tokenCalls = 0;
    let imageCalls = 0;
    const hooks = createCalibrationPreflightLedgerHooks(ledger, {
      countTokens: async () => {
        tokenCalls += 1;
        return { tokenCount: PREFLIGHT_TOKEN_COUNT };
      },
      generateImage: async () => {
        imageCalls += 1;
        return {
          prediction: { kcal: 320, proteinG: 20, carbsG: 30, fatG: 10 },
          modelVersion: PREFLIGHT_PINNED_VERSION,
        };
      },
      recordSafeError: (entry: unknown) => {
        safeEntries.push(entry);
      },
    });

    const result = await executeCalibrationPreflight(
      { __mockClient: true },
      { firstDevelopmentCaseId: PREFLIGHT_CASE_ID, ...hooks },
    );
    expect(result.tokenCount).toBe(PREFLIGHT_TOKEN_COUNT);
    expect(result.pinnedModelVersion).toBe(PREFLIGHT_PINNED_VERSION);
    expect(tokenCalls).toBe(1);
    expect(imageCalls).toBe(2);
    expect(safeEntries).toHaveLength(0);

    ledger.releaseLock(owner);

    const freshDeps = createFileCalibrationLedgerDeps(tempDir);
    const fresh = createCalibrationLedger(freshDeps, makeIdentity(), [lowKey, mediumKey]);
    expect(fresh.getCounts()).toMatchObject({ tokenCountReserved: 1, imageReserved: 2 });
    const events = freshDeps.readLedgerEvents() as Array<Record<string, unknown>>;
    expect(events.map((event) => event.type)).toEqual([
      'token_count_reserved',
      'token_count_completed',
      'reserved',
      'completed',
      'reserved',
      'completed',
    ]);
    const tokenCompleted = events.find((event) => event.type === 'token_count_completed') as
      | { count?: unknown }
      | undefined;
    expect(tokenCompleted?.count).toBe(PREFLIGHT_TOKEN_COUNT);
    const journals = freshDeps.readJournalEntries();
    expect(journals).toHaveLength(2);
    expect(journals[0]?.key).toEqual(lowKey);
    expect(journals[1]?.key).toEqual(mediumKey);
    for (const entry of journals) {
      expect(entry.errorCategory).toBe('none');
      expect(entry.responseModelVersion).toBe(PREFLIGHT_PINNED_VERSION);
      expect(entry.normalizedPrediction).toMatchObject({
        kcal: 320,
        proteinG: 20,
        carbsG: 30,
        fatG: 10,
      });
      for (const value of Object.values(entry.normalizedPrediction ?? {})) {
        expect(typeof value).toBe('number');
        expect(Number.isFinite(value as number)).toBe(true);
        expect(value as number).toBeGreaterThanOrEqual(0);
      }
    }
    expect(fresh.rebuildReport().completed).toHaveLength(2);
    expect(fresh.rebuildReport().completed).toContainEqual(lowKey);
    expect(fresh.rebuildReport().completed).toContainEqual(mediumKey);
  });

  it('fails preflight when countTokens throws HTTP 429 and replays token_count_failed with no image reservations', async () => {
    const tempDir = makeTempDir();
    const lowKey = makePreflightKey('LOW');
    const mediumKey = makePreflightKey('MEDIUM');
    const ledger = createCalibrationLedger(
      createFileCalibrationLedgerDeps(tempDir),
      makeIdentity(),
      [lowKey, mediumKey],
    );
    const owner = makeOwner();
    ledger.acquireLock(owner);

    const safeEntries: Array<Record<string, unknown>> = [];
    let tokenCalls = 0;
    let imageCalls = 0;
    const hooks = createCalibrationPreflightLedgerHooks(ledger, {
      countTokens: async () => {
        tokenCalls += 1;
        throw { status: 429 };
      },
      generateImage: async () => {
        imageCalls += 1;
        return {
          prediction: { kcal: 320, proteinG: 20, carbsG: 30, fatG: 10 },
          modelVersion: PREFLIGHT_PINNED_VERSION,
        };
      },
      recordSafeError: (entry: unknown) => {
        safeEntries.push(entry as Record<string, unknown>);
      },
    });

    await expect(
      executeCalibrationPreflight(
        { __mockClient: true },
        { firstDevelopmentCaseId: PREFLIGHT_CASE_ID, ...hooks },
      ),
    ).rejects.toBeInstanceOf(CalibrationFatalError);
    expect(tokenCalls).toBe(1);
    expect(imageCalls).toBe(0);
    expect(safeEntries).toHaveLength(1);
    expect(safeEntries[0]).toMatchObject({ kind: 'token_count', errorCategory: 'http_429' });

    // Never release lock after fatal; caller owns it. Replay from a fresh ledger.
    const freshDeps = createFileCalibrationLedgerDeps(tempDir);
    const fresh = createCalibrationLedger(freshDeps, makeIdentity(), [lowKey, mediumKey]);
    expect(fresh.getCounts()).toMatchObject({ tokenCountReserved: 1, imageReserved: 0 });
    const events = freshDeps.readLedgerEvents() as Array<Record<string, unknown>>;
    expect(events.map((event) => event.type)).toEqual([
      'token_count_reserved',
      'token_count_failed',
    ]);
    expect(events[1]).toMatchObject({ errorCategory: 'http_429' });
    expect(events.some((event) => event.type === 'reserved')).toBe(false);
    expect(events.some((event) => event.type === 'completed')).toBe(false);
    expect(freshDeps.readJournalEntries()).toHaveLength(0);
    expect(fresh.rebuildReport().completed).toHaveLength(0);
  });

  it('fails preflight when LOW generateImage throws HTTP 503 and replays LOW reserved+completed with http_5xx and no MEDIUM reservation', async () => {
    const tempDir = makeTempDir();
    const lowKey = makePreflightKey('LOW');
    const mediumKey = makePreflightKey('MEDIUM');
    const ledger = createCalibrationLedger(
      createFileCalibrationLedgerDeps(tempDir),
      makeIdentity(),
      [lowKey, mediumKey],
    );
    const owner = makeOwner();
    ledger.acquireLock(owner);

    const safeEntries: Array<Record<string, unknown>> = [];
    let tokenCalls = 0;
    let imageCalls = 0;
    const seenProfiles: unknown[] = [];
    const hooks = createCalibrationPreflightLedgerHooks(ledger, {
      countTokens: async () => {
        tokenCalls += 1;
        return { tokenCount: PREFLIGHT_TOKEN_COUNT };
      },
      generateImage: async (request: unknown) => {
        imageCalls += 1;
        const profile = (request as { profile?: unknown }).profile;
        seenProfiles.push(profile);
        if (profile === 'LOW') throw { status: 503 };
        throw new Error('MEDIUM must never be called after LOW failure');
      },
      recordSafeError: (entry: unknown) => {
        safeEntries.push(entry as Record<string, unknown>);
      },
    });

    await expect(
      executeCalibrationPreflight(
        { __mockClient: true },
        { firstDevelopmentCaseId: PREFLIGHT_CASE_ID, ...hooks },
      ),
    ).rejects.toBeInstanceOf(CalibrationFatalError);
    expect(tokenCalls).toBe(1);
    expect(imageCalls).toBe(1);
    expect(seenProfiles).toEqual(['LOW']);
    expect(safeEntries).toHaveLength(1);
    expect(safeEntries[0]).toMatchObject({
      kind: 'image',
      profile: 'LOW',
      errorCategory: 'http_5xx',
    });

    // Never release lock after fatal; caller owns it. Replay from a fresh ledger.
    const freshDeps = createFileCalibrationLedgerDeps(tempDir);
    const fresh = createCalibrationLedger(freshDeps, makeIdentity(), [lowKey, mediumKey]);
    expect(fresh.getCounts()).toMatchObject({ tokenCountReserved: 1, imageReserved: 1 });
    const events = freshDeps.readLedgerEvents() as Array<Record<string, unknown>>;
    expect(events.map((event) => event.type)).toEqual([
      'token_count_reserved',
      'token_count_completed',
      'reserved',
      'completed',
    ]);
    const reservedEvents = events.filter((event) => event.type === 'reserved');
    expect(reservedEvents).toHaveLength(1);
    expect(reservedEvents[0]?.key).toEqual(lowKey);
    expect(
      events.some(
        (event) =>
          (event.type === 'reserved' || event.type === 'completed') &&
          JSON.stringify(event.key ?? {}).includes('MEDIUM'),
      ),
    ).toBe(false);
    const journals = freshDeps.readJournalEntries();
    expect(journals).toHaveLength(1);
    expect(journals[0]?.key).toEqual(lowKey);
    expect(journals[0]?.normalizedPrediction).toBeNull();
    expect(journals[0]?.errorCategory).toBe('http_5xx');
  });

  it('fails factory immediately when recordSafeError is missing with no reservations or provider calls', () => {
    const tempDir = makeTempDir();
    const lowKey = makePreflightKey('LOW');
    const mediumKey = makePreflightKey('MEDIUM');
    const ledger = createCalibrationLedger(
      createFileCalibrationLedgerDeps(tempDir),
      makeIdentity(),
      [lowKey, mediumKey],
    );
    const owner = makeOwner();
    ledger.acquireLock(owner);

    let tokenCalls = 0;
    let imageCalls = 0;
    expect(() =>
      createCalibrationPreflightLedgerHooks(ledger, {
        countTokens: async () => {
          tokenCalls += 1;
          return { tokenCount: PREFLIGHT_TOKEN_COUNT };
        },
        generateImage: async () => {
          imageCalls += 1;
          return {
            prediction: { kcal: 320, proteinG: 20, carbsG: 30, fatG: 10 },
            modelVersion: PREFLIGHT_PINNED_VERSION,
          };
        },
      } as unknown as Parameters<typeof createCalibrationPreflightLedgerHooks>[1]),
    ).toThrow(CalibrationFatalError);
    expect(tokenCalls).toBe(0);
    expect(imageCalls).toBe(0);

    // Never release lock after fatal; caller owns it. Replay from a fresh ledger.
    const freshDeps = createFileCalibrationLedgerDeps(tempDir);
    const fresh = createCalibrationLedger(freshDeps, makeIdentity(), [lowKey, mediumKey]);
    expect(fresh.getCounts()).toMatchObject({ tokenCountReserved: 0, imageReserved: 0 });
    expect(freshDeps.readLedgerEvents()).toHaveLength(0);
    expect(freshDeps.readJournalEntries()).toHaveLength(0);
  });

  it('fails preflight on MEDIUM model-version drift and replays LOW completed plus MEDIUM interrupted after crash recovery', async () => {
    const tempDir = makeTempDir();
    const lowKey = makePreflightKey('LOW');
    const mediumKey = makePreflightKey('MEDIUM');
    const ledger = createCalibrationLedger(
      createFileCalibrationLedgerDeps(tempDir),
      makeIdentity(),
      [lowKey, mediumKey],
    );
    const owner = makeOwner();
    ledger.acquireLock(owner);

    const safeEntries: Array<Record<string, unknown>> = [];
    let tokenCalls = 0;
    let imageCalls = 0;
    const hooks = createCalibrationPreflightLedgerHooks(ledger, {
      countTokens: async () => {
        tokenCalls += 1;
        return { tokenCount: PREFLIGHT_TOKEN_COUNT };
      },
      generateImage: async (request: unknown) => {
        imageCalls += 1;
        const profile = (request as { profile?: unknown }).profile;
        return {
          prediction: { kcal: 320, proteinG: 20, carbsG: 30, fatG: 10 },
          modelVersion: profile === 'MEDIUM' ? 'ver-2' : 'ver-1',
        };
      },
      recordSafeError: (entry: unknown) => {
        safeEntries.push(entry as Record<string, unknown>);
      },
    });

    const error = await executeCalibrationPreflight(
      { __mockClient: true },
      { firstDevelopmentCaseId: PREFLIGHT_CASE_ID, ...hooks },
    ).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect((error as CalibrationFatalError).message).toBe(
      'calibration:preflight-model-version-mismatch',
    );
    expect(tokenCalls).toBe(1);
    expect(imageCalls).toBe(2);
    expect(safeEntries).toHaveLength(0);

    // Never release lock after fatal; caller owns it. Fresh replay before
    // recovery has two image reservations, exactly one LOW success
    // journal/completed report, and no MEDIUM journal/completion.
    const beforeDeps = createFileCalibrationLedgerDeps(tempDir);
    const before = createCalibrationLedger(beforeDeps, makeIdentity(), [lowKey, mediumKey]);
    expect(before.getCounts()).toMatchObject({ tokenCountReserved: 1, imageReserved: 2 });
    const beforeEvents = beforeDeps.readLedgerEvents() as Array<Record<string, unknown>>;
    expect(beforeEvents.map((event) => event.type)).toEqual([
      'token_count_reserved',
      'token_count_completed',
      'reserved',
      'completed',
      'reserved',
    ]);
    const beforeReserved = beforeEvents.filter((event) => event.type === 'reserved');
    expect(beforeReserved).toHaveLength(2);
    expect(beforeReserved[0]?.key).toEqual(lowKey);
    expect(beforeReserved[1]?.key).toEqual(mediumKey);
    const beforeCompleted = beforeEvents.filter((event) => event.type === 'completed');
    expect(beforeCompleted).toHaveLength(1);
    expect(beforeCompleted[0]?.key).toEqual(lowKey);
    expect(
      beforeEvents.some(
        (event) =>
          event.type === 'failed' ||
          ((event.type === 'completed' || event.type === 'reserved') &&
            JSON.stringify(event.key ?? {}).includes('MEDIUM') &&
            event.type === 'completed'),
      ),
    ).toBe(false);
    const beforeJournals = beforeDeps.readJournalEntries();
    expect(beforeJournals).toHaveLength(1);
    expect(beforeJournals[0]?.key).toEqual(lowKey);
    expect(beforeJournals[0]?.errorCategory).toBe('none');
    expect(beforeJournals[0]?.responseModelVersion).toBe('ver-1');
    expect(before.rebuildReport().completed).toHaveLength(1);
    expect(before.rebuildReport().completed).toContainEqual(lowKey);
    expect(before.rebuildReport().completed).not.toContainEqual(mediumKey);

    // Recover on the original lock-held ledger; the drifted MEDIUM
    // reservation is interrupted without any safe-recorder write.
    const recovered = ledger.recoverAfterCrash();
    expect(recovered.interrupted).toContainEqual(mediumKey);
    expect(recovered.interrupted).not.toContainEqual(lowKey);
    expect(safeEntries).toHaveLength(0);

    const afterDeps = createFileCalibrationLedgerDeps(tempDir);
    const after = createCalibrationLedger(afterDeps, makeIdentity(), [lowKey, mediumKey]);
    const afterEvents = afterDeps.readLedgerEvents() as Array<Record<string, unknown>>;
    expect(afterEvents.map((event) => event.type)).toEqual([
      'token_count_reserved',
      'token_count_completed',
      'reserved',
      'completed',
      'reserved',
      'failed',
    ]);
    const failedEvents = afterEvents.filter((event) => event.type === 'failed');
    expect(failedEvents).toHaveLength(1);
    expect(failedEvents[0]).toMatchObject({
      key: mediumKey,
      status: 'interrupted_reservation',
    });
    const afterJournals = afterDeps.readJournalEntries();
    expect(afterJournals).toHaveLength(2);
    expect(afterJournals[0]?.key).toEqual(lowKey);
    expect(afterJournals[0]?.errorCategory).toBe('none');
    expect(afterJournals[1]?.key).toEqual(mediumKey);
    expect(afterJournals[1]).toMatchObject({
      predictionHash: 'interrupted_reservation',
      normalizedPrediction: null,
      errorCategory: 'interrupted_reservation',
      responseModelVersion: 'n/a',
    });
    expect(after.rebuildReport().completed).toHaveLength(1);
    expect(after.rebuildReport().completed).toContainEqual(lowKey);
    expect(after.rebuildReport().completed).not.toContainEqual(mediumKey);
  });

  it('fails preflight when LOW image reservation is unplanned and replays token count only with lock still held', async () => {
    const tempDir = makeTempDir();
    const mediumKey = makePreflightKey('MEDIUM');
    const ledger = createCalibrationLedger(
      createFileCalibrationLedgerDeps(tempDir),
      makeIdentity(),
      [mediumKey],
    );
    const owner = makeOwner();
    ledger.acquireLock(owner);

    const safeEntries: Array<Record<string, unknown>> = [];
    let tokenCalls = 0;
    let imageCalls = 0;
    const hooks = createCalibrationPreflightLedgerHooks(ledger, {
      countTokens: async () => {
        tokenCalls += 1;
        return { tokenCount: PREFLIGHT_TOKEN_COUNT };
      },
      generateImage: async () => {
        imageCalls += 1;
        return {
          prediction: { kcal: 320, proteinG: 20, carbsG: 30, fatG: 10 },
          modelVersion: PREFLIGHT_PINNED_VERSION,
        };
      },
      recordSafeError: (entry: unknown) => {
        safeEntries.push(entry as Record<string, unknown>);
      },
    });

    const error = await executeCalibrationPreflight(
      { __mockClient: true },
      { firstDevelopmentCaseId: PREFLIGHT_CASE_ID, ...hooks },
    ).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect((error as CalibrationFatalError).message).toBe(
      'calibration:preflight-image-reservation-failed',
    );
    expect(tokenCalls).toBe(1);
    expect(imageCalls).toBe(0);
    expect(safeEntries).toHaveLength(1);
    expect(safeEntries[0]).toMatchObject({
      stage: 'preflight',
      kind: 'image',
      caseId: PREFLIGHT_CASE_ID,
      profile: 'LOW',
      sampleIndex: 1,
      errorCategory: 'unknown',
    });
    expect(Object.keys(safeEntries[0] ?? {}).sort()).toEqual([
      'caseId',
      'errorCategory',
      'kind',
      'profile',
      'sampleIndex',
      'stage',
    ]);

    // Never release lock after fatal; caller owns it. Replay from a fresh ledger.
    const freshDeps = createFileCalibrationLedgerDeps(tempDir);
    expect(freshDeps.readLock()).toEqual(owner);
    const fresh = createCalibrationLedger(freshDeps, makeIdentity(), [mediumKey]);
    expect(fresh.getCounts()).toMatchObject({ tokenCountReserved: 1, imageReserved: 0 });
    const events = freshDeps.readLedgerEvents() as Array<Record<string, unknown>>;
    expect(events.map((event) => event.type)).toEqual([
      'token_count_reserved',
      'token_count_completed',
    ]);
    expect(events.some((event) => event.type === 'reserved')).toBe(false);
    expect(events.some((event) => event.type === 'completed')).toBe(false);
    expect(events.some((event) => event.type === 'failed')).toBe(false);
    expect(freshDeps.readJournalEntries()).toHaveLength(0);
    expect(fresh.rebuildReport().completed).toHaveLength(0);
  });
});
