/**
 * Task 7 hermetic preflight session: success plus provider/recorder/lock/input cases.
 *
 * Contract for `runCalibrationPreflightSession`
 * (`functions/src/nutrition-eval/calibration-preflight-session.ts`). The caller
 * injects baseDir/identity/owner/firstDevelopmentCaseId plus fake
 * countTokens/generateImage/recordSafeError callbacks; each test uses a real
 * temporary file store and real ledger replay. No provider, Firebase,
 * network, device, emulator, or live call occurs here.
 *
 * Covered here: hermetic success/replay/lock-release; token 429 privacy/lock
 * retention; MEDIUM image 503 after LOW success with lock retention; recorder
 * failure that replaces the stage fatal without leaking private text;
 * live-owner lock rejection before provider/recorder work with the original
 * lock retained; dead same-host owner takeover on an empty ledger with
 * lock_recovery first and success lock release; duplicate token fixture with
 * deliberate fixture-lock release asserting exact reservation failure; missing
 * recorder and blank caseId rejected before canonical root/file effects.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CALIBRATION_ROOT,
  createCalibrationLedger,
} from '../../src/nutrition-eval/calibration';
import { createFileCalibrationLedgerDeps } from '../../src/nutrition-eval/calibration-file-store';
import { runCalibrationPreflightSession } from '../../src/nutrition-eval/calibration-preflight-session';
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';
import type {
  CalibrationIdentity,
  CalibrationOwner,
  ReservationKey,
  TokenCountReservationKey,
} from '../../src/nutrition-eval/calibration';
import type { CalibrationPreflightSafeErrorEntry } from '../../src/nutrition-eval/calibration-cli';

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
  const dir = mkdtempSync(join(tmpdir(), 'calorix-preflight-session-'));
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

describe('calibration preflight session', () => {
  it('runs the hermetic preflight session and replays one token count plus LOW/MEDIUM completions with the lock released', async () => {
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

    const safeEntries: CalibrationPreflightSafeErrorEntry[] = [];
    const countTokens = vi.fn(async () => ({ tokenCount: PREFLIGHT_TOKEN_COUNT }));
    const generateImage = vi.fn(async () => ({
      prediction: { kcal: 320, proteinG: 20, carbsG: 30, fatG: 10 },
      modelVersion: PREFLIGHT_PINNED_VERSION,
    }));
    const recordSafeError = vi.fn((entry: CalibrationPreflightSafeErrorEntry) => {
      safeEntries.push(entry);
    });

    const result = await runCalibrationPreflightSession({
      baseDir,
      identity,
      owner,
      firstDevelopmentCaseId: PREFLIGHT_CASE_ID,
      countTokens,
      generateImage,
      recordSafeError,
    });

    expect(result.tokenCount).toBe(PREFLIGHT_TOKEN_COUNT);
    expect(result.pinnedModelVersion).toBe(PREFLIGHT_PINNED_VERSION);
    expect(countTokens).toHaveBeenCalledTimes(1);
    expect(generateImage).toHaveBeenCalledTimes(2);
    expect(recordSafeError).toHaveBeenCalledTimes(0);
    expect(safeEntries).toHaveLength(0);

    const freshDeps = createFileCalibrationLedgerDeps(baseDir);
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
    }
    expect(fresh.rebuildReport().completed).toHaveLength(2);
    expect(fresh.rebuildReport().completed).toContainEqual(lowKey);
    expect(fresh.rebuildReport().completed).toContainEqual(mediumKey);
    expect(freshDeps.readLock()).toBeUndefined();
  });

  it('fails on secret-bearing token 429 without image work, keeping only the safe category and the lock', async () => {
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
    const secretUrl = 'https://secret.invalid';

    const safeEntries: CalibrationPreflightSafeErrorEntry[] = [];
    const countTokens = vi.fn(async () => {
      throw Object.assign(new Error(`private ${secretUrl}`), { status: 429 });
    });
    const generateImage = vi.fn(async () => ({
      prediction: { kcal: 320, proteinG: 20, carbsG: 30, fatG: 10 },
      modelVersion: PREFLIGHT_PINNED_VERSION,
    }));
    const recordSafeError = vi.fn((entry: CalibrationPreflightSafeErrorEntry) => {
      safeEntries.push(entry);
    });

    const error = await runCalibrationPreflightSession({
      baseDir,
      identity,
      owner,
      firstDevelopmentCaseId: PREFLIGHT_CASE_ID,
      countTokens,
      generateImage,
      recordSafeError,
    }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect((error as CalibrationFatalError).message).toBe(
      'calibration:preflight-token-call-failed',
    );
    expect(countTokens).toHaveBeenCalledTimes(1);
    expect(generateImage).toHaveBeenCalledTimes(0);
    expect(recordSafeError).toHaveBeenCalledTimes(1);
    expect(safeEntries).toHaveLength(1);
    expect(safeEntries[0]).toEqual({
      stage: 'preflight',
      kind: 'token_count',
      caseId: PREFLIGHT_CASE_ID,
      errorCategory: 'http_429',
    });
    expect(Object.keys(safeEntries[0] ?? {}).sort()).toEqual([
      'caseId',
      'errorCategory',
      'kind',
      'stage',
    ]);
    expect((error as Error).message).not.toContain(secretUrl);
    expect(JSON.stringify(safeEntries)).not.toContain(secretUrl);
    expect(JSON.stringify(safeEntries)).not.toContain('private');

    const freshDeps = createFileCalibrationLedgerDeps(baseDir);
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
    expect(JSON.stringify(events)).not.toContain(secretUrl);
    expect(JSON.stringify(events)).not.toContain('private');
    expect(freshDeps.readJournalEntries()).toHaveLength(0);
    expect(fresh.rebuildReport().completed).toHaveLength(0);
    expect(freshDeps.readLock()).toEqual(owner);
  });

  it('records LOW success then MEDIUM 503 failure with one safe image entry and the lock retained', async () => {
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

    const safeEntries: CalibrationPreflightSafeErrorEntry[] = [];
    const countTokens = vi.fn(async () => ({ tokenCount: PREFLIGHT_TOKEN_COUNT }));
    const generateImage = vi.fn(async (request: unknown) => {
      const profile = (request as { profile?: unknown }).profile;
      if (profile === 'MEDIUM') throw { status: 503 };
      return {
        prediction: { kcal: 320, proteinG: 20, carbsG: 30, fatG: 10 },
        modelVersion: PREFLIGHT_PINNED_VERSION,
      };
    });
    const recordSafeError = vi.fn((entry: CalibrationPreflightSafeErrorEntry) => {
      safeEntries.push(entry);
    });

    const error = await runCalibrationPreflightSession({
      baseDir,
      identity,
      owner,
      firstDevelopmentCaseId: PREFLIGHT_CASE_ID,
      countTokens,
      generateImage,
      recordSafeError,
    }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect((error as CalibrationFatalError).message).toBe(
      'calibration:preflight-image-call-failed',
    );
    expect(countTokens).toHaveBeenCalledTimes(1);
    expect(generateImage).toHaveBeenCalledTimes(2);
    expect(recordSafeError).toHaveBeenCalledTimes(1);
    expect(safeEntries).toHaveLength(1);
    expect(safeEntries[0]).toEqual({
      stage: 'preflight',
      kind: 'image',
      caseId: PREFLIGHT_CASE_ID,
      profile: 'MEDIUM',
      sampleIndex: 1,
      errorCategory: 'http_5xx',
    });
    expect(Object.keys(safeEntries[0] ?? {}).sort()).toEqual([
      'caseId',
      'errorCategory',
      'kind',
      'profile',
      'sampleIndex',
      'stage',
    ]);

    const freshDeps = createFileCalibrationLedgerDeps(baseDir);
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
    const journals = freshDeps.readJournalEntries();
    expect(journals).toHaveLength(2);
    expect(journals[0]?.key).toEqual(lowKey);
    expect(journals[0]?.errorCategory).toBe('none');
    expect(journals[0]?.responseModelVersion).toBe(PREFLIGHT_PINNED_VERSION);
    expect(journals[0]?.normalizedPrediction).toMatchObject({
      kcal: 320,
      proteinG: 20,
      carbsG: 30,
      fatG: 10,
    });
    expect(journals[1]?.key).toEqual(mediumKey);
    expect(journals[1]?.normalizedPrediction).toBeNull();
    expect(journals[1]?.errorCategory).toBe('http_5xx');
    expect(journals[1]?.responseModelVersion).toBe('n/a');
    expect(freshDeps.readLock()).toEqual(owner);
  });

  it('replaces the stage fatal when recordSafeError throws private text on token 429', async () => {
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
    const privateRecorderText = 'private recorder text';

    const countTokens = vi.fn(async () => {
      throw { status: 429 };
    });
    const generateImage = vi.fn(async () => ({
      prediction: { kcal: 320, proteinG: 20, carbsG: 30, fatG: 10 },
      modelVersion: PREFLIGHT_PINNED_VERSION,
    }));
    const recordSafeError = vi.fn(() => {
      throw new Error(privateRecorderText);
    });

    const error = await runCalibrationPreflightSession({
      baseDir,
      identity,
      owner,
      firstDevelopmentCaseId: PREFLIGHT_CASE_ID,
      countTokens,
      generateImage,
      recordSafeError,
    }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect((error as CalibrationFatalError).message).toBe(
      'calibration:preflight-safe-error-persist-failed',
    );
    expect((error as { cause?: unknown }).cause).toBeUndefined();
    expect((error as Error).message).not.toContain(privateRecorderText);
    expect(countTokens).toHaveBeenCalledTimes(1);
    expect(generateImage).toHaveBeenCalledTimes(0);
    expect(recordSafeError).toHaveBeenCalledTimes(1);

    const freshDeps = createFileCalibrationLedgerDeps(baseDir);
    const fresh = createCalibrationLedger(freshDeps, makeIdentity(), [lowKey, mediumKey]);
    expect(fresh.getCounts()).toMatchObject({ tokenCountReserved: 1, imageReserved: 0 });
    const events = freshDeps.readLedgerEvents() as Array<Record<string, unknown>>;
    expect(events.map((event) => event.type)).toEqual([
      'token_count_reserved',
      'token_count_failed',
    ]);
    expect(events[1]).toMatchObject({ errorCategory: 'http_429' });
    expect(JSON.stringify(events)).not.toContain(privateRecorderText);
    expect(freshDeps.readJournalEntries()).toHaveLength(0);
    expect(fresh.rebuildReport().completed).toHaveLength(0);
    expect(freshDeps.readLock()).toEqual(owner);
  });

  it('rejects a live same-host owner lock before token/image/recorder work with the original lock retained', async () => {
    const baseDir = makeTempDir();
    const liveOwner = makeOwner({ acquiredAt: '2026-09-30T00:00:00.000Z' });
    const sessionOwner = makeOwner({ acquiredAt: '2026-10-01T00:00:00.000Z' });
    const setupDeps = createFileCalibrationLedgerDeps(baseDir);
    setupDeps.writeLockExclusive(liveOwner);
    expect(setupDeps.readLedgerEvents()).toHaveLength(0);

    const countTokens = vi.fn(async () => ({ tokenCount: PREFLIGHT_TOKEN_COUNT }));
    const generateImage = vi.fn(async () => ({
      prediction: { kcal: 320, proteinG: 20, carbsG: 30, fatG: 10 },
      modelVersion: PREFLIGHT_PINNED_VERSION,
    }));
    const recordSafeError = vi.fn((_entry: CalibrationPreflightSafeErrorEntry) => undefined);

    const error = await runCalibrationPreflightSession({
      baseDir,
      identity: makeIdentity(),
      owner: sessionOwner,
      firstDevelopmentCaseId: PREFLIGHT_CASE_ID,
      countTokens,
      generateImage,
      recordSafeError,
    }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect((error as CalibrationFatalError).message).toBe('calibration:lock-held-live');
    expect(countTokens).toHaveBeenCalledTimes(0);
    expect(generateImage).toHaveBeenCalledTimes(0);
    expect(recordSafeError).toHaveBeenCalledTimes(0);

    const freshDeps = createFileCalibrationLedgerDeps(baseDir);
    expect(freshDeps.readLock()).toEqual(liveOwner);
    expect(freshDeps.readLedgerEvents()).toHaveLength(0);
    expect(freshDeps.readJournalEntries()).toHaveLength(0);
  });

  it('takes over a provably dead same-host owner lock on an empty ledger with lock_recovery first and releases on success', async () => {
    const baseDir = makeTempDir();
    const liveStartTicks = currentStartTicks();
    const deadOwner = makeOwner({
      startTicks: liveStartTicks + 1000000,
      acquiredAt: '2026-09-30T00:00:00.000Z',
    });
    const liveOwner = makeOwner({ acquiredAt: '2026-10-01T00:00:00.000Z' });
    expect(deadOwner.startTicks).not.toBe(liveOwner.startTicks);
    const setupDeps = createFileCalibrationLedgerDeps(baseDir);
    setupDeps.writeLockExclusive(deadOwner);
    expect(setupDeps.readLedgerEvents()).toHaveLength(0);
    expect(setupDeps.readLock()).toEqual(deadOwner);

    const safeEntries: CalibrationPreflightSafeErrorEntry[] = [];
    const countTokens = vi.fn(async () => ({ tokenCount: PREFLIGHT_TOKEN_COUNT }));
    const generateImage = vi.fn(async () => ({
      prediction: { kcal: 320, proteinG: 20, carbsG: 30, fatG: 10 },
      modelVersion: PREFLIGHT_PINNED_VERSION,
    }));
    const recordSafeError = vi.fn((entry: CalibrationPreflightSafeErrorEntry) => {
      safeEntries.push(entry);
    });

    const result = await runCalibrationPreflightSession({
      baseDir,
      identity: makeIdentity(),
      owner: liveOwner,
      firstDevelopmentCaseId: PREFLIGHT_CASE_ID,
      countTokens,
      generateImage,
      recordSafeError,
    });

    expect(result.tokenCount).toBe(PREFLIGHT_TOKEN_COUNT);
    expect(result.pinnedModelVersion).toBe(PREFLIGHT_PINNED_VERSION);
    expect(countTokens).toHaveBeenCalledTimes(1);
    expect(generateImage).toHaveBeenCalledTimes(2);
    expect(recordSafeError).toHaveBeenCalledTimes(0);
    expect(safeEntries).toHaveLength(0);

    const freshDeps = createFileCalibrationLedgerDeps(baseDir);
    const events = freshDeps.readLedgerEvents() as Array<Record<string, unknown>>;
    expect(events.map((event) => event.type)).toEqual([
      'lock_recovery',
      'token_count_reserved',
      'token_count_completed',
      'reserved',
      'completed',
      'reserved',
      'completed',
    ]);
    expect(events[0]).toMatchObject({ staleOwner: deadOwner, recoveringOwner: liveOwner });
    expect(freshDeps.readLock()).toBeUndefined();
    expect(freshDeps.readJournalEntries()).toHaveLength(2);
  });

  it('fails duplicate preflight token reservation without provider work and retains the new session lock', async () => {
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
    const fixtureOwner = makeOwner({ acquiredAt: '2026-09-30T00:00:00.000Z' });
    const sessionOwner = makeOwner({ acquiredAt: '2026-10-01T00:00:00.000Z' });
    const fixtureDeps = createFileCalibrationLedgerDeps(baseDir);
    const fixtureLedger = createCalibrationLedger(fixtureDeps, makeIdentity(), [lowKey, mediumKey]);
    fixtureLedger.acquireLock(fixtureOwner);
    const tokenKey: TokenCountReservationKey = {
      kind: 'token_count',
      stage: 'preflight',
      caseId: PREFLIGHT_CASE_ID,
      model: 'gemini-3.8-flash',
    };
    fixtureLedger.reserveTokenCount(tokenKey);
    // Deliberate test-setup release only; production fatal paths must retain the lock.
    fixtureLedger.releaseLock(fixtureOwner);
    expect(fixtureDeps.readLedgerEvents()).toHaveLength(1);
    expect(fixtureDeps.readLock()).toBeUndefined();

    const safeEntries: CalibrationPreflightSafeErrorEntry[] = [];
    const countTokens = vi.fn(async () => ({ tokenCount: PREFLIGHT_TOKEN_COUNT }));
    const generateImage = vi.fn(async () => ({
      prediction: { kcal: 320, proteinG: 20, carbsG: 30, fatG: 10 },
      modelVersion: PREFLIGHT_PINNED_VERSION,
    }));
    const recordSafeError = vi.fn((entry: CalibrationPreflightSafeErrorEntry) => {
      safeEntries.push(entry);
    });

    const error = await runCalibrationPreflightSession({
      baseDir,
      identity: makeIdentity(),
      owner: sessionOwner,
      firstDevelopmentCaseId: PREFLIGHT_CASE_ID,
      countTokens,
      generateImage,
      recordSafeError,
    }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect((error as CalibrationFatalError).message).toBe(
      'calibration:preflight-token-reservation-failed',
    );
    expect(countTokens).toHaveBeenCalledTimes(0);
    expect(generateImage).toHaveBeenCalledTimes(0);
    expect(recordSafeError).toHaveBeenCalledTimes(1);
    expect(safeEntries).toHaveLength(1);
    expect(safeEntries[0]).toEqual({
      stage: 'preflight',
      kind: 'token_count',
      caseId: PREFLIGHT_CASE_ID,
      errorCategory: 'unknown',
    });
    expect(Object.keys(safeEntries[0] ?? {}).sort()).toEqual([
      'caseId',
      'errorCategory',
      'kind',
      'stage',
    ]);

    const freshDeps = createFileCalibrationLedgerDeps(baseDir);
    const events = freshDeps.readLedgerEvents() as Array<Record<string, unknown>>;
    expect(events.map((event) => event.type)).toEqual(['token_count_reserved']);
    expect(events).toHaveLength(1);
    expect(freshDeps.readLock()).toEqual(sessionOwner);
  });

  it('rejects missing recordSafeError and blank caseId before canonical root/file effects with zero callbacks', async () => {
    const missingRecorderDir = makeTempDir();
    const missingCountTokens = vi.fn(async () => ({ tokenCount: PREFLIGHT_TOKEN_COUNT }));
    const missingGenerateImage = vi.fn(async () => ({
      prediction: { kcal: 320, proteinG: 20, carbsG: 30, fatG: 10 },
      modelVersion: PREFLIGHT_PINNED_VERSION,
    }));
    const missingError = await runCalibrationPreflightSession({
      baseDir: missingRecorderDir,
      identity: makeIdentity(),
      owner: makeOwner(),
      firstDevelopmentCaseId: PREFLIGHT_CASE_ID,
      countTokens: missingCountTokens,
      generateImage: missingGenerateImage,
      recordSafeError: undefined as unknown as (
        entry: CalibrationPreflightSafeErrorEntry,
      ) => void,
    }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(missingError).toBeInstanceOf(CalibrationFatalError);
    expect((missingError as CalibrationFatalError).message).toBe(
      'calibration:preflight-session-input-invalid',
    );
    expect(missingCountTokens).toHaveBeenCalledTimes(0);
    expect(missingGenerateImage).toHaveBeenCalledTimes(0);
    expect(existsSync(join(missingRecorderDir, CALIBRATION_ROOT))).toBe(false);

    const blankCaseDir = makeTempDir();
    const blankCountTokens = vi.fn(async () => ({ tokenCount: PREFLIGHT_TOKEN_COUNT }));
    const blankGenerateImage = vi.fn(async () => ({
      prediction: { kcal: 320, proteinG: 20, carbsG: 30, fatG: 10 },
      modelVersion: PREFLIGHT_PINNED_VERSION,
    }));
    const blankRecordSafeError = vi.fn((_entry: CalibrationPreflightSafeErrorEntry) => undefined);
    const blankError = await runCalibrationPreflightSession({
      baseDir: blankCaseDir,
      identity: makeIdentity(),
      owner: makeOwner(),
      firstDevelopmentCaseId: '   ',
      countTokens: blankCountTokens,
      generateImage: blankGenerateImage,
      recordSafeError: blankRecordSafeError,
    }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(blankError).toBeInstanceOf(CalibrationFatalError);
    expect((blankError as CalibrationFatalError).message).toBe(
      'calibration:preflight-session-input-invalid',
    );
    expect(blankCountTokens).toHaveBeenCalledTimes(0);
    expect(blankGenerateImage).toHaveBeenCalledTimes(0);
    expect(blankRecordSafeError).toHaveBeenCalledTimes(0);
    expect(existsSync(join(blankCaseDir, CALIBRATION_ROOT))).toBe(false);
  });

  it('rejects padded case ID with surrounding spaces before any filesystem or callback effects', async () => {
    const baseDir = makeTempDir();
    const paddedCaseId = `  ${PREFLIGHT_CASE_ID}  `;
    const countTokens = vi.fn(async () => ({ tokenCount: PREFLIGHT_TOKEN_COUNT }));
    const generateImage = vi.fn(async () => ({
      prediction: { kcal: 320, proteinG: 20, carbsG: 30, fatG: 10 },
      modelVersion: PREFLIGHT_PINNED_VERSION,
    }));
    const recordSafeError = vi.fn((_entry: CalibrationPreflightSafeErrorEntry) => undefined);

    const error = await runCalibrationPreflightSession({
      baseDir,
      identity: makeIdentity(),
      owner: makeOwner(),
      firstDevelopmentCaseId: paddedCaseId,
      countTokens,
      generateImage,
      recordSafeError,
    }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect((error as CalibrationFatalError).message).toBe(
      'calibration:preflight-session-input-invalid',
    );
    expect(countTokens).toHaveBeenCalledTimes(0);
    expect(generateImage).toHaveBeenCalledTimes(0);
    expect(recordSafeError).toHaveBeenCalledTimes(0);
    expect(existsSync(join(baseDir, CALIBRATION_ROOT))).toBe(false);
  });

  it.each([
    {
      name: 'wrong model',
      identityOverride: { model: 'gemini-2.5-flash' },
      ownerOverride: {},
      blankBaseDir: false,
      omitGenerateImage: false,
    },
    {
      name: 'blank required hash',
      identityOverride: { datasetHash: '   ' },
      ownerOverride: {},
      blankBaseDir: false,
      omitGenerateImage: false,
    },
    {
      name: 'invalid owner pid',
      identityOverride: {},
      ownerOverride: { pid: 0 },
      blankBaseDir: false,
      omitGenerateImage: false,
    },
    {
      name: 'invalid owner startTicks',
      identityOverride: {},
      ownerOverride: { startTicks: 0 },
      blankBaseDir: false,
      omitGenerateImage: false,
    },
    {
      name: 'blank baseDir',
      identityOverride: {},
      ownerOverride: {},
      blankBaseDir: true,
      omitGenerateImage: false,
    },
    {
      name: 'missing generateImage',
      identityOverride: {},
      ownerOverride: {},
      blankBaseDir: false,
      omitGenerateImage: true,
    },
  ])(
    'rejects malformed identity/owner/baseDir/provider input ($name)',
    async ({ identityOverride, ownerOverride, blankBaseDir, omitGenerateImage }) => {
      const tempDir = makeTempDir();
      const baseDir = blankBaseDir ? '   ' : tempDir;
      const countTokens = vi.fn(async () => ({ tokenCount: PREFLIGHT_TOKEN_COUNT }));
      const generateImage = vi.fn(async () => ({
        prediction: { kcal: 320, proteinG: 20, carbsG: 30, fatG: 10 },
        modelVersion: PREFLIGHT_PINNED_VERSION,
      }));
      const recordSafeError = vi.fn((_entry: CalibrationPreflightSafeErrorEntry) => undefined);
      const error = await runCalibrationPreflightSession({
        baseDir,
        identity: { ...makeIdentity(), ...identityOverride },
        owner: makeOwner(ownerOverride),
        firstDevelopmentCaseId: PREFLIGHT_CASE_ID,
        countTokens,
        generateImage: (omitGenerateImage ? undefined : generateImage) as unknown as (
          request: unknown,
        ) => Promise<unknown>,
        recordSafeError,
      }).then(
        () => null,
        (cause: unknown) => cause,
      );
      expect(error).toBeInstanceOf(CalibrationFatalError);
      expect((error as CalibrationFatalError).message).toBe(
        'calibration:preflight-session-input-invalid',
      );
      expect(countTokens).toHaveBeenCalledTimes(0);
      if (!omitGenerateImage) {
        expect(generateImage).toHaveBeenCalledTimes(0);
      }
      expect(recordSafeError).toHaveBeenCalledTimes(0);
      if (!blankBaseDir) {
        expect(existsSync(join(tempDir, CALIBRATION_ROOT))).toBe(false);
      }
    },
  );
});
