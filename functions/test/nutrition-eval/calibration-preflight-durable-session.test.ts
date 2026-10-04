/**
 * Task 7 Step 1 RED tests: durable preflight session entry point.
 *
 * Uses real temporary file store, real ledger replay, and fake provider
 * callbacks. Imports the absent `runCalibrationPreflightDurableSession`
 * so the intended RED occurs at execution. Six cases cover success, token
 * failure, image failure, duplicate reservation, input rejection (runtime
 * recorder cast + malformed case ID), and live lock rejection.
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
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';
import type {
  CalibrationIdentity,
  CalibrationOwner,
  ReservationKey,
  TokenCountReservationKey,
} from '../../src/nutrition-eval/calibration';
import type { CalibrationPreflightSafeErrorEntry } from '../../src/nutrition-eval/calibration-cli';
// Import the absent durable entry point so tests fail RED as intended
import {
  runCalibrationPreflightDurableSession,
} from '../../src/nutrition-eval/calibration-preflight-session';


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
  const dir = mkdtempSync(join(tmpdir(), 'calorix-durable-preflight-'));
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

describe('calibration preflight durable session', () => {
  it('runs the hermetic durable preflight session and replays token count plus LOW/MEDIUM completions with the lock released', async () => {
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

    const countTokens = vi.fn(async () => ({ tokenCount: PREFLIGHT_TOKEN_COUNT }));
    const generateImage = vi.fn(async () => ({
      prediction: { kcal: 320, proteinG: 20, carbsG: 30, fatG: 10 },
      modelVersion: PREFLIGHT_PINNED_VERSION,
    }));

    const result = await runCalibrationPreflightDurableSession({
      baseDir,
      identity,
      owner,
      firstDevelopmentCaseId: PREFLIGHT_CASE_ID,
      countTokens,
      generateImage,
    });

    expect(result.tokenCount).toBe(PREFLIGHT_TOKEN_COUNT);
    expect(result.pinnedModelVersion).toBe(PREFLIGHT_PINNED_VERSION);
    expect(countTokens).toHaveBeenCalledTimes(1);
    expect(generateImage).toHaveBeenCalledTimes(2);
    expect(generateImage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ model: 'gemini-3.8-flash', profile: 'LOW', caseId: PREFLIGHT_CASE_ID }),
    );
    expect(generateImage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ model: 'gemini-3.8-flash', profile: 'MEDIUM', caseId: PREFLIGHT_CASE_ID }),
    );

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

  it('fails on secret-bearing token error without image work, keeping token terminal, safe error, and lock with no private bytes', async () => {
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

    const countTokens = vi.fn(async () => {
      throw new Error(`private ${secretUrl}`);
    });
    const generateImage = vi.fn(async () => ({
      prediction: { kcal: 320, proteinG: 20, carbsG: 30, fatG: 10 },
      modelVersion: PREFLIGHT_PINNED_VERSION,
    }));

    const error = await runCalibrationPreflightDurableSession({
      baseDir,
      identity,
      owner,
      firstDevelopmentCaseId: PREFLIGHT_CASE_ID,
      countTokens,
      generateImage,
    }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect((error as CalibrationFatalError).message).toBe('calibration:preflight-token-call-failed');
    expect((error as { cause?: unknown }).cause).toBeUndefined();
    expect((error as CalibrationFatalError).message).not.toContain('private');
    expect((error as CalibrationFatalError).message).not.toContain(secretUrl);
    expect(countTokens).toHaveBeenCalledTimes(1);
    expect(generateImage).toHaveBeenCalledTimes(0);

    const freshDeps = createFileCalibrationLedgerDeps(baseDir);
    const fresh = createCalibrationLedger(freshDeps, makeIdentity(), [lowKey, mediumKey]);
    expect(fresh.getCounts()).toMatchObject({ tokenCountReserved: 1, imageReserved: 0 });
    const events = freshDeps.readLedgerEvents() as Array<Record<string, unknown>>;
    expect(events.map((event) => event.type)).toEqual([
      'token_count_reserved',
      'token_count_failed',
      'safe_error',
    ]);
    expect(events[1]).toMatchObject({ errorCategory: 'unknown' });
    const safeErrorEvent = events.find((event) => event.type === 'safe_error') as
      | { entry?: unknown }
      | undefined;
    expect(safeErrorEvent).toBeDefined();
    const entry = safeErrorEvent?.entry as Record<string, unknown> | undefined;
    expect(entry).toMatchObject({
      stage: 'preflight',
      kind: 'token_count',
      caseId: PREFLIGHT_CASE_ID,
      errorCategory: 'unknown',
    });
    expect(Object.keys(entry ?? {}).sort()).toEqual([
      'caseId',
      'errorCategory',
      'kind',
      'stage',
    ]);
    expect(events.some((event) => event.type === 'reserved')).toBe(false);
    expect(events.some((event) => event.type === 'completed')).toBe(false);
    expect(JSON.stringify(events)).not.toContain(secretUrl);
    expect(JSON.stringify(events)).not.toContain('private');
    const tokenJournals = freshDeps.readJournalEntries();
    expect(tokenJournals).toHaveLength(0);
    expect(JSON.stringify(tokenJournals)).not.toContain(secretUrl);
    expect(JSON.stringify(tokenJournals)).not.toContain('private');
    expect(fresh.rebuildReport().completed).toHaveLength(0);
    expect(freshDeps.readLock()).toEqual(owner);
  });

  it('records LOW 503 failure with null-prediction journal before safe event and retains the lock', async () => {
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

    const countTokens = vi.fn(async () => ({ tokenCount: PREFLIGHT_TOKEN_COUNT }));
    const generateImage = vi.fn(async (request: unknown) => {
      const profile = (request as { profile?: unknown }).profile;
      if (profile === 'LOW') {
        throw Object.assign(new Error('private https://secret.invalid'), { status: 503 });
      }
      return {
        prediction: { kcal: 320, proteinG: 20, carbsG: 30, fatG: 10 },
        modelVersion: PREFLIGHT_PINNED_VERSION,
      };
    });

    const error = await runCalibrationPreflightDurableSession({
      baseDir,
      identity,
      owner,
      firstDevelopmentCaseId: PREFLIGHT_CASE_ID,
      countTokens,
      generateImage,
    }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect((error as CalibrationFatalError).message).toBe('calibration:preflight-image-call-failed');
    expect((error as { cause?: unknown }).cause).toBeUndefined();
    expect((error as CalibrationFatalError).message).not.toContain('private');
    expect((error as CalibrationFatalError).message).not.toContain('https://secret.invalid');
    expect(countTokens).toHaveBeenCalledTimes(1);
    expect(generateImage).toHaveBeenCalledTimes(1);

    const freshDeps = createFileCalibrationLedgerDeps(baseDir);
    const fresh = createCalibrationLedger(freshDeps, makeIdentity(), [lowKey, mediumKey]);
    expect(fresh.getCounts()).toMatchObject({ tokenCountReserved: 1, imageReserved: 1 });
    const events = freshDeps.readLedgerEvents() as Array<Record<string, unknown>>;
    expect(events.map((event) => event.type)).toEqual([
      'token_count_reserved',
      'token_count_completed',
      'reserved',
      'completed',
      'safe_error',
    ]);
    const journals = freshDeps.readJournalEntries();
    expect(journals).toHaveLength(1);
    expect(journals[0]?.key).toEqual(lowKey);
    expect(journals[0]?.normalizedPrediction).toBeNull();
    expect(journals[0]?.errorCategory).toBe('http_5xx');
    expect(journals[0]?.responseModelVersion).toBe('n/a');
    const safeErrorEvent = events.find((event) => event.type === 'safe_error') as
      | { entry?: unknown }
      | undefined;
    expect(safeErrorEvent).toBeDefined();
    const entry = safeErrorEvent?.entry as Record<string, unknown> | undefined;
    expect(entry).toMatchObject({
      stage: 'preflight',
      kind: 'image',
      caseId: PREFLIGHT_CASE_ID,
      profile: 'LOW',
      sampleIndex: 1,
      errorCategory: 'http_5xx',
    });
    expect(Object.keys(entry ?? {}).sort()).toEqual([
      'caseId',
      'errorCategory',
      'kind',
      'profile',
      'sampleIndex',
      'stage',
    ]);
    expect(JSON.stringify(events)).not.toContain('https://secret.invalid');
    expect(JSON.stringify(events)).not.toContain('private');
    expect(JSON.stringify(journals)).not.toContain('https://secret.invalid');
    expect(JSON.stringify(journals)).not.toContain('private');
    expect(freshDeps.readLock()).toEqual(owner);
  });

  it('rejects duplicate token reservation with zero provider calls, appends new safe_error/unknown after old completion, and retains the new lock', async () => {
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
    const fixtureOwner = makeOwner({ acquiredAt: '2026-09-30T00:00:00.000Z' });
    const sessionOwner = makeOwner({ acquiredAt: '2026-10-01T00:00:00.000Z' });

    // Pre-seed a completed token reservation and release the fixture lock
    const fixtureDeps = createFileCalibrationLedgerDeps(baseDir);
    const fixtureLedger = createCalibrationLedger(fixtureDeps, makeIdentity(), [lowKey, mediumKey]);
    fixtureLedger.acquireLock(fixtureOwner);
    fixtureLedger.reserveTokenCount(tokenKey);
    fixtureLedger.completeTokenCount(tokenKey, PREFLIGHT_TOKEN_COUNT);
    fixtureLedger.releaseLock(fixtureOwner);
    expect(fixtureDeps.readLedgerEvents()).toHaveLength(2);
    expect(fixtureDeps.readLock()).toBeUndefined();

    const countTokens = vi.fn(async () => ({ tokenCount: PREFLIGHT_TOKEN_COUNT }));
    const generateImage = vi.fn(async () => ({
      prediction: { kcal: 320, proteinG: 20, carbsG: 30, fatG: 10 },
      modelVersion: PREFLIGHT_PINNED_VERSION,
    }));

    const error = await runCalibrationPreflightDurableSession({
      baseDir,
      identity: makeIdentity(),
      owner: sessionOwner,
      firstDevelopmentCaseId: PREFLIGHT_CASE_ID,
      countTokens,
      generateImage,
    }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect((error as CalibrationFatalError).message).toBe('calibration:preflight-token-reservation-failed');
    expect(countTokens).toHaveBeenCalledTimes(0);
    expect(generateImage).toHaveBeenCalledTimes(0);

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
    expect(completedEvent?.count).toBe(PREFLIGHT_TOKEN_COUNT);
    const safeErrorEvent = events.find((event) => event.type === 'safe_error') as
      | { entry?: unknown }
      | undefined;
    expect(safeErrorEvent).toBeDefined();
    const entry = safeErrorEvent?.entry as Record<string, unknown> | undefined;
    expect(entry).toMatchObject({
      stage: 'preflight',
      kind: 'token_count',
      caseId: PREFLIGHT_CASE_ID,
      errorCategory: 'unknown',
    });
    expect(freshDeps.readLock()).toEqual(sessionOwner);
  });

  it('rejects runtime-cast caller recorder, inherited recorder, and malformed case ID before canonical-root creation or callbacks', async () => {
    // Case 1: caller passes recordSafeError via runtime cast (own recorder)
    const baseDir1 = makeTempDir();
    const recorderCast = vi.fn((_entry: CalibrationPreflightSafeErrorEntry) => undefined);
    const countTokens1 = vi.fn(async () => ({ tokenCount: PREFLIGHT_TOKEN_COUNT }));
    const generateImage1 = vi.fn(async () => ({
      prediction: { kcal: 320, proteinG: 20, carbsG: 30, fatG: 10 },
      modelVersion: PREFLIGHT_PINNED_VERSION,
    }));

    const error1 = await runCalibrationPreflightDurableSession({
      baseDir: baseDir1,
      identity: makeIdentity(),
      owner: makeOwner(),
      firstDevelopmentCaseId: PREFLIGHT_CASE_ID,
      countTokens: countTokens1,
      generateImage: generateImage1,
      recordSafeError: recorderCast as never,
    }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error1).toBeInstanceOf(CalibrationFatalError);
    expect((error1 as CalibrationFatalError).message).toBe('calibration:preflight-session-input-invalid');
    expect(countTokens1).toHaveBeenCalledTimes(0);
    expect(generateImage1).toHaveBeenCalledTimes(0);
    expect(recorderCast).toHaveBeenCalledTimes(0);
    expect(existsSync(join(baseDir1, CALIBRATION_ROOT))).toBe(false);

    // Case 2: inherited recorder via prototype (no own recorder)
    const baseDir2 = makeTempDir();
    const recorderSpy2 = vi.fn((_entry: CalibrationPreflightSafeErrorEntry) => undefined);
    const countTokens2 = vi.fn(async () => ({ tokenCount: PREFLIGHT_TOKEN_COUNT }));
    const generateImage2 = vi.fn(async () => ({
      prediction: { kcal: 320, proteinG: 20, carbsG: 30, fatG: 10 },
      modelVersion: PREFLIGHT_PINNED_VERSION,
    }));
    const deps2 = {
      baseDir: baseDir2,
      identity: makeIdentity(),
      owner: makeOwner(),
      firstDevelopmentCaseId: PREFLIGHT_CASE_ID,
      countTokens: countTokens2,
      generateImage: generateImage2,
    };
    Object.setPrototypeOf(deps2, { recordSafeError: recorderSpy2 });
    expect(Object.prototype.hasOwnProperty.call(deps2, 'recordSafeError')).toBe(false);
    expect('recordSafeError' in deps2).toBe(true);

    const error2 = await runCalibrationPreflightDurableSession(
      deps2 as unknown as Parameters<typeof runCalibrationPreflightDurableSession>[0],
    ).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error2).toBeInstanceOf(CalibrationFatalError);
    expect((error2 as CalibrationFatalError).message).toBe('calibration:preflight-session-input-invalid');
    expect(countTokens2).toHaveBeenCalledTimes(0);
    expect(generateImage2).toHaveBeenCalledTimes(0);
    expect(recorderSpy2).toHaveBeenCalledTimes(0);
    expect(existsSync(join(baseDir2, CALIBRATION_ROOT))).toBe(false);

    // Case 3: malformed case IDs (table-driven subcases)
    const malformedCases = [
      { name: 'blank', caseId: '   ' },
      { name: 'padded', caseId: `  ${PREFLIGHT_CASE_ID}  ` },
      { name: 'slash', caseId: 'case/id' },
      { name: 'pipe', caseId: 'case|id' },
      { name: 'newline', caseId: 'case\nid' },
      { name: '129chars', caseId: 'a'.repeat(129) },
    ];

    for (const { name, caseId } of malformedCases) {
      const caseDir = makeTempDir();
      const countTokens = vi.fn(async () => ({ tokenCount: PREFLIGHT_TOKEN_COUNT }));
      const generateImage = vi.fn(async () => ({
        prediction: { kcal: 320, proteinG: 20, carbsG: 30, fatG: 10 },
        modelVersion: PREFLIGHT_PINNED_VERSION,
      }));

      const error = await runCalibrationPreflightDurableSession({
        baseDir: caseDir,
        identity: makeIdentity(),
        owner: makeOwner(),
        firstDevelopmentCaseId: caseId,
        countTokens,
        generateImage,
      }).then(
        () => null,
        (cause: unknown) => cause,
      );
      expect(error, `malformed case: ${name}`).toBeInstanceOf(CalibrationFatalError);
      expect((error as CalibrationFatalError).message).toBe('calibration:preflight-session-input-invalid');
      expect(countTokens, `malformed case: ${name}`).toHaveBeenCalledTimes(0);
      expect(generateImage, `malformed case: ${name}`).toHaveBeenCalledTimes(0);
      expect(existsSync(join(caseDir, CALIBRATION_ROOT)), `malformed case: ${name}`).toBe(false);
    }
  });

  it('rejects a live conflicting lock before provider callbacks and preserves the owner', async () => {
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

    const error = await runCalibrationPreflightDurableSession({
      baseDir,
      identity: makeIdentity(),
      owner: sessionOwner,
      firstDevelopmentCaseId: PREFLIGHT_CASE_ID,
      countTokens,
      generateImage,
    }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect((error as CalibrationFatalError).message).toBe('calibration:lock-held-live');
    expect(countTokens).toHaveBeenCalledTimes(0);
    expect(generateImage).toHaveBeenCalledTimes(0);

    const freshDeps = createFileCalibrationLedgerDeps(baseDir);
    expect(freshDeps.readLock()).toEqual(liveOwner);
    expect(freshDeps.readLedgerEvents()).toHaveLength(0);
    expect(freshDeps.readJournalEntries()).toHaveLength(0);
  });
});