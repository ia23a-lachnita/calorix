/**
 * Task 3 contract: explicit strict protocol preflight session.
 *
 * Contract for `runCalibrationProtocolPreflightSession`
 * (`functions/src/nutrition-eval/calibration-preflight-session.ts`); the
 * legacy `runCalibrationPreflightSession`,
 * `runCalibrationPreflightDurableSession`, and `executeCalibrationPreflight`
 * coverage below it stays intact.
 *
 * Intended API (the contract these tests pin):
 *
 * ```ts
 * export function runCalibrationProtocolPreflightSession(deps: {
 *   readonly context: CalibrationPreparedContext;
 *   readonly countTokens: (request: CalibrationPreflightTokenCountRequest) => Promise<unknown>;
 *   readonly generateImage: (request: CalibrationPreflightImageRequest) => Promise<unknown>;
 * }): Promise<CalibrationPreflightStageResult>;
 * ```
 *
 * Exact own deps only: `context`, `countTokens`, `generateImage`. No
 * `baseDir`/`owner`/`identity`/`keyResolver`/`recorder`/`expected`/case
 * overrides, own or inherited. The session works only on a genuine prepared
 * frozen context (actual verified `prepareCalibrationBootstrapContext` with
 * injected Git/owner readers plus read-only actual committed asset
 * fixtures), validates native owner/baseDir canonical shape plus the full
 * `verifyCalibrationPreflightState({ files })` gate with NO expected
 * overrides before any file-store or provider effect, then internally
 * derives the canonical resolver and runs `createFileStore` plus the strict
 * ledger acquire/recover without resending. Prior token/image reservations
 * refuse with static `calibration:preflight-already-started`, the lock
 * retained, zero provider calls. This is one-shot Stage 0, not a partial
 * resume or the whole driver.
 *
 * Hermetic contract: owned `mkdtemp` real file stores, actual valid asset
 * context, fake token/image callbacks only. No provider client, SDK
 * construction, network, Firebase, device, deployment, image download, or
 * live inference occurs here.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspect } from 'node:util';
import { CALIBRATION_ROOT, createProtocolCalibrationLedger } from '../../src/nutrition-eval/calibration';
import type {
  CalibrationIdentity,
  CalibrationKeyResolver,
  CalibrationOwner,
  ReservationKey,
  TokenCountReservationKey,
} from '../../src/nutrition-eval/calibration';
import * as bootstrapModule from '../../src/nutrition-eval/calibration-bootstrap';
import type { CalibrationPreparedContext } from '../../src/nutrition-eval/calibration-bootstrap';
import { createFileCalibrationLedgerDeps } from '../../src/nutrition-eval/calibration-file-store';
import * as preflightSessionModule from '../../src/nutrition-eval/calibration-preflight-session';
import { executeCalibrationPreflight } from '../../src/nutrition-eval/calibration-cli';
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';

const execFileMockState = vi.hoisted(() => ({
  override: null as ((...args: unknown[]) => unknown) | null,
  calls: [] as unknown[][],
}));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  const wrapped = (...args: unknown[]): unknown => {
    execFileMockState.calls.push(args);
    if (execFileMockState.override !== null) return execFileMockState.override(...args);
    return (actual.execFileSync as (...callArgs: unknown[]) => unknown)(...args);
  };
  return {
    ...actual,
    execFileSync: wrapped as typeof actual.execFileSync,
  };
});

const SECRET_SENTINEL = 'SECRET-PROTOCOL-5e71c2';
const PINNED_VERSION = 'gemini-3.8-test-pin-001';
const OTHER_VERSION = 'gemini-3.8-test-pin-002';
const TOKEN_COUNT = 42;
const MODEL = 'gemini-3.8-flash';

const HEAD_A = 'a'.repeat(40);
const IMPL_B = 'b'.repeat(40);
const TREE_C = 'c'.repeat(40);

const IDENTITY_FIELDS = [
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
] as const;

const ASSET_HASH_IDENTITY_FIELDS = [
  'datasetHash',
  'promptHash',
  'responseSchemaHash',
  'sourceLockHash',
  'manifestHash',
  'publicManifestHash',
  'snapshotLockHash',
  'historicalReferenceHash',
] as const;

const HEX64_PATTERN = /^[0-9a-f]{64}$/;

function flipFirstHexChar(hash: string): string {
  expect(hash).toMatch(HEX64_PATTERN);
  const first = hash[0] as string;
  const flipped = first === '0' ? '1' : '0';
  return `${flipped}${hash.slice(1)}`;
}

type ProtocolSessionFn = (deps: unknown) => Promise<{
  stage: string;
  caseId: string;
  model: string;
  tokenCount: number;
  pinnedModelVersion: string;
  verifiedProfiles: readonly string[];
}>;

function loadProtocolSession(): ProtocolSessionFn {
  const fn = (preflightSessionModule as Record<string, unknown>)[
    'runCalibrationProtocolPreflightSession'
  ];
  expect(typeof fn, 'runCalibrationProtocolPreflightSession must be exported (Task 3 RED)').toBe(
    'function',
  );
  return fn as ProtocolSessionFn;
}

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop() as string;
    rmSync(dir, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'calorix-protocol-session-'));
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

function makeFixtureOwner(overrides: Record<string, unknown> = {}): CalibrationOwner {
  return {
    hostname: 'fixture-host',
    bootId: 'fixture-boot',
    pid: 123,
    startTicks: 42,
    acquiredAt: '2026-10-05T00:00:00.000Z',
    ...overrides,
  } as CalibrationOwner;
}

function makeLiveOwner(acquiredAt: string): CalibrationOwner {
  return {
    hostname: hostname(),
    bootId: readBootId(),
    pid: process.pid,
    startTicks: currentStartTicks(),
    acquiredAt,
  };
}

function makeCommittedReader(): ReturnType<typeof vi.fn> {
  const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
  const paths: Record<string, string> = {
    'functions/eval/nutrition/public-manifest.json': 'public-manifest',
    'functions/eval/nutrition/calibration-source-lock.json': 'source-lock',
    'functions/eval/nutrition/calibration-manifest.json': 'calibration-manifest',
    'functions/eval/nutrition/off-snapshot-lock.json': 'off-lock',
    'functions/eval/nutrition/historical-reference-v1.json': 'historical-reference',
  };
  return vi.fn((path: string, _commit: string) => {
    void _commit;
    if (!(path in paths)) throw new Error(`unexpected asset path ${path}`);
    return readFileSync(join(repoRoot, path), 'utf8');
  });
}

async function prepareContext(
  baseDir: string,
  owner?: CalibrationOwner,
): Promise<CalibrationPreparedContext> {
  const prepare = (bootstrapModule as Record<string, unknown>)[
    'prepareCalibrationBootstrapContext'
  ] as (deps: unknown) => Promise<CalibrationPreparedContext>;
  const gitState = {
    headCommit: HEAD_A,
    implementationCommit: IMPL_B,
    functionsTreeId: TREE_C,
    dirtyPaths: [] as string[],
  };
  const resolvedOwner = owner ?? makeFixtureOwner();
  return prepare({
    baseDir,
    readGitState: vi.fn(() => ({ ...gitState, dirtyPaths: [...gitState.dirtyPaths] })),
    readCommittedFile: makeCommittedReader(),
    readOwner: vi.fn(() => ({ ...resolvedOwner })),
  });
}

function readDevIds(context: CalibrationPreparedContext): { first: string; dev: string[] } {
  const manifest = JSON.parse(
    (context.files as Record<string, string>)['calibration-manifest'] as string,
  ) as { cases: Array<{ id: string; group: string }> };
  const dev = manifest.cases.filter((c) => c.group === 'development').map((c) => c.id);
  return { first: context.firstDevelopmentCaseId, dev };
}

/** Hand resolver mirroring the canonical initial 50 for replay-only reads. */
function makeInitial50Resolver(firstDev: string, devIds: string[]): CalibrationKeyResolver {
  return () => {
    const keys: ReservationKey[] = [
      { stage: 'preflight', profile: 'LOW', caseId: firstDev, sampleIndex: 1 },
      { stage: 'preflight', profile: 'MEDIUM', caseId: firstDev, sampleIndex: 1 },
    ];
    for (const caseId of devIds) {
      keys.push({ stage: 'development', profile: 'LOW', caseId, sampleIndex: 1 });
      keys.push({ stage: 'development', profile: 'MEDIUM', caseId, sampleIndex: 1 });
    }
    return Object.freeze([...keys]);
  };
}

function makeTokenKey(firstDev: string): TokenCountReservationKey {
  return { kind: 'token_count', stage: 'preflight', caseId: firstDev, model: MODEL };
}

function makeCountTokens(count = TOKEN_COUNT): ReturnType<typeof vi.fn> {
  return vi.fn(async () => ({ tokenCount: count }));
}

function makeGenerateImage(version: string = PINNED_VERSION): ReturnType<typeof vi.fn> {
  return vi.fn(async () => ({
    prediction: { kcal: 320, proteinG: 20, carbsG: 30, fatG: 10 },
    modelVersion: version,
  }));
}

function readEvents(baseDir: string): Array<Record<string, unknown>> {
  return createFileCalibrationLedgerDeps(baseDir).readLedgerEvents() as Array<
    Record<string, unknown>
  >;
}

function eventIndex(events: Array<Record<string, unknown>>, type: string, from = 0): number {
  return events.findIndex((e, i) => i >= from && e.type === type);
}

function collectOwnStrings(value: unknown, depth = 0, seen: Set<unknown> = new Set()): string[] {
  if (value === null || value === undefined || depth > 8) return [];
  if (typeof value === 'string') return [value];
  if (typeof value !== 'object') return [String(value)];
  if (seen.has(value)) return [];
  seen.add(value);
  const out: string[] = [];
  for (const key of Object.getOwnPropertyNames(value)) {
    let child: unknown;
    try {
      child = (value as Record<string, unknown>)[key];
    } catch {
      continue;
    }
    out.push(key, ...collectOwnStrings(child, depth + 1, seen));
  }
  return out;
}

/**
 * Guarded recursive freeze for trusted plain JSON fixture data only
 * (`JSON.parse(JSON.stringify(...))` clones). Prototype-guarded and
 * getter-tolerant: a throwing accessor is left in place while every
 * reachable plain container is still frozen, so forged contexts reach the
 * intended binding/getter validation instead of a thaw rejection.
 */
function deepFreezeJson(value: unknown): void {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return;
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== Array.prototype) return;
  if (Array.isArray(value)) {
    for (const item of value) {
      try {
        deepFreezeJson(item);
      } catch {
        // Foreign throwing element: freeze the container only.
      }
    }
  } else {
    for (const key of Object.getOwnPropertyNames(value)) {
      let child: unknown;
      try {
        child = (value as Record<string, unknown>)[key];
      } catch {
        continue;
      }
      try {
        deepFreezeJson(child);
      } catch {
        // Foreign throwing child: freeze the container only.
      }
    }
  }
  Object.freeze(value);
}

function expectFatalWithoutSecret(error: unknown, secret: string): void {
  expect(error).toBeInstanceOf(CalibrationFatalError);
  const fatal = error as CalibrationFatalError;
  expect(fatal.cause).toBeUndefined();
  expect(Object.getOwnPropertyNames(fatal)).not.toContain('cause');
  const surfaces = [
    fatal.name,
    fatal.message,
    String(fatal),
    fatal.stack ?? '',
    inspect(fatal, { depth: null, showHidden: true }),
    ...collectOwnStrings(fatal),
  ];
  for (const surface of surfaces) {
    expect(surface).not.toContain(secret);
  }
}

describe('protocol session export (Task 3 RED gate)', () => {
  it('exports runCalibrationProtocolPreflightSession with exact deps shape', () => {
    const fn = (preflightSessionModule as Record<string, unknown>)[
      'runCalibrationProtocolPreflightSession'
    ];
    expect(typeof fn).toBe('function');
  });

  it('preserves both legacy session APIs and the hermetic primitive', () => {
    expect(typeof preflightSessionModule.runCalibrationPreflightSession).toBe('function');
    expect(typeof preflightSessionModule.runCalibrationPreflightDurableSession).toBe('function');
    expect(typeof executeCalibrationPreflight).toBe('function');
  });
});

describe('protocol session happy path on a real file store', () => {
  it('runs header->token->LOW reserve->pin-before-LOW-complete->MED->stage with lock release', async () => {
    const baseDir = makeTempDir();
    const context = await prepareContext(baseDir);
    const { first } = readDevIds(context);
    const countTokens = makeCountTokens();
    const generateImage = makeGenerateImage();

    const result = await loadProtocolSession()({ context, countTokens, generateImage });

    expect(result.tokenCount).toBe(TOKEN_COUNT);
    expect(result.pinnedModelVersion).toBe(PINNED_VERSION);
    expect(result.stage).toBe('preflight');
    expect(result.caseId).toBe(first);
    expect(result.model).toBe(MODEL);
    expect(result.verifiedProfiles).toEqual(['LOW', 'MEDIUM']);
    expect(countTokens).toHaveBeenCalledTimes(1);
    expect(countTokens).toHaveBeenCalledWith({ model: MODEL });
    expect(generateImage).toHaveBeenCalledTimes(2);
    expect(generateImage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ model: MODEL, profile: 'LOW', caseId: first }),
    );
    expect(generateImage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ model: MODEL, profile: 'MEDIUM', caseId: first }),
    );

    const deps = createFileCalibrationLedgerDeps(baseDir);
    const events = readEvents(baseDir);
    const types = events.map((e) => e.type);
    expect(types[0]).toBe('protocol_identity');
    expect(types).not.toContain('lock_recovery');
    expect(types).not.toContain('failed');
    expect(types).not.toContain('safe_error');
    const tokenReserved = eventIndex(events, 'token_count_reserved');
    const tokenCompleted = eventIndex(events, 'token_count_completed');
    const lowReserved = eventIndex(events, 'reserved');
    const pin = eventIndex(events, 'model_version_pinned');
    const lowCompleted = eventIndex(events, 'completed');
    const medReserved = eventIndex(events, 'reserved', lowCompleted + 1);
    const medCompleted = eventIndex(events, 'completed', medReserved + 1);
    const stageDone = eventIndex(events, 'stage_completed');
    for (const idx of [
      tokenReserved,
      tokenCompleted,
      lowReserved,
      pin,
      lowCompleted,
      medReserved,
      medCompleted,
      stageDone,
    ]) {
      expect(idx).toBeGreaterThanOrEqual(0);
    }
    expect(tokenReserved).toBeLessThan(tokenCompleted);
    expect(tokenCompleted).toBeLessThan(lowReserved);
    expect(lowReserved).toBeLessThan(pin);
    expect(pin).toBeLessThan(lowCompleted);
    expect(lowCompleted).toBeLessThan(medReserved);
    expect(medReserved).toBeLessThan(medCompleted);
    expect(medCompleted).toBeLessThan(stageDone);

    const journals = deps.readJournalEntries();
    expect(journals).toHaveLength(2);
    expect(journals[0]?.key).toEqual({
      stage: 'preflight',
      profile: 'LOW',
      caseId: first,
      sampleIndex: 1,
    });
    expect(journals[1]?.key).toEqual({
      stage: 'preflight',
      profile: 'MEDIUM',
      caseId: first,
      sampleIndex: 1,
    });
    for (const entry of journals) {
      expect(entry.errorCategory).toBe('none');
      expect(entry.normalizedPrediction).not.toBeNull();
      expect(entry.responseModelVersion).toBe(PINNED_VERSION);
    }
    expect(deps.readLock()).toBeUndefined();
    // No SDK client, default activation, or stray side files: the store nests
    // exactly `.nutrition-eval/calibration/<protocol>/` with no stray siblings
    // at any ancestor level. The baseDir itself holds only `.nutrition-eval`.
    const segments = CALIBRATION_ROOT.split('/').filter((part) => part.length > 0);
    expect(segments).toEqual([
      '.nutrition-eval',
      'calibration',
      'calorix-gemini-38-calibration-v1',
    ]);
    expect(readdirSync(baseDir).sort()).toEqual([segments[0] as string]);
    expect(readdirSync(join(baseDir, segments[0] as string)).sort()).toEqual([
      segments[1] as string,
    ]);
    expect(
      readdirSync(join(baseDir, segments[0] as string, segments[1] as string)).sort(),
    ).toEqual([segments[2] as string]);
    expect(existsSync(join(baseDir, CALIBRATION_ROOT))).toBe(true);
  });

  it('reconstructs exact identity/version/stages/counts on a readonly strict-ledger restart', async () => {
    const baseDir = makeTempDir();
    const context = await prepareContext(baseDir);
    const { first, dev } = readDevIds(context);
    await loadProtocolSession()({
      context,
      countTokens: makeCountTokens(),
      generateImage: makeGenerateImage(),
    });

    const deps = createFileCalibrationLedgerDeps(baseDir);
    const header = readEvents(baseDir)[0] as { identity?: unknown };
    expect(header.identity).toEqual({ ...(context.identity as object) });
    const replay = createProtocolCalibrationLedger(
      createFileCalibrationLedgerDeps(baseDir),
      context.identity as CalibrationIdentity,
      makeInitial50Resolver(first, dev),
    );
    expect(replay.getPinnedModelVersion()).toBe(PINNED_VERSION);
    expect(replay.getCompletedStages()).toEqual(['preflight']);
    expect(replay.getCounts()).toMatchObject({ tokenCountReserved: 1, imageReserved: 2 });
    expect(deps.readLock()).toBeUndefined();
  });

  it('uses fixture Git IDs and fixture owner without any native git subprocess', async () => {
    execFileMockState.calls.length = 0;
    execFileMockState.override = () => {
      throw new Error('native git must not run inside the hermetic session');
    };
    try {
      const baseDir = makeTempDir();
      const context = await prepareContext(baseDir);
      expect(context.identity.implementationCommit).toBe(IMPL_B);
      const result = await loadProtocolSession()({
        context,
        countTokens: makeCountTokens(),
        generateImage: makeGenerateImage(),
      });
      expect(result.pinnedModelVersion).toBe(PINNED_VERSION);
      expect(execFileMockState.calls).toHaveLength(0);
    } finally {
      execFileMockState.override = null;
    }
  });
});

describe('protocol session deps shape', () => {
  it('rejects non-object deps and missing callbacks before store effects', async () => {
    for (const deps of [undefined, null, []] as const) {
      const error = await loadProtocolSession()(deps).then(
        () => null,
        (cause: unknown) => cause,
      );
      expect(error).toBeInstanceOf(CalibrationFatalError);
    }
  });

  it.each([['countTokens'], ['generateImage'], ['context']])(
    'rejects a missing %s with zero provider calls',
    async (missing) => {
      const baseDir = makeTempDir();
      const context = await prepareContext(baseDir);
      const bag: Record<string, unknown> = {
        context,
        countTokens: makeCountTokens(),
        generateImage: makeGenerateImage(),
      };
      delete bag[missing];
      const error = await loadProtocolSession()(bag).then(
        () => null,
        (cause: unknown) => cause,
      );
      expect(error).toBeInstanceOf(CalibrationFatalError);
      expect((error as CalibrationFatalError).message).toMatch(/^calibration:/);
      expect((bag.countTokens as ReturnType<typeof vi.fn> | undefined)?.mock.calls.length ?? 0).toBe(
        0,
      );
      expect(
        (bag.generateImage as ReturnType<typeof vi.fn> | undefined)?.mock.calls.length ?? 0,
      ).toBe(0);
      expect(existsSync(join(baseDir, CALIBRATION_ROOT))).toBe(false);
    },
  );

  it.each([
    ['baseDir'],
    ['owner'],
    ['identity'],
    ['keyResolver'],
    ['recordSafeError'],
    ['recorder'],
    ['expected'],
    ['firstDevelopmentCaseId'],
    ['caseId'],
  ])('rejects a forbidden own %s override with zero callbacks', async (prop) => {
    const baseDir = makeTempDir();
    const context = await prepareContext(baseDir);
    const countTokens = makeCountTokens();
    const generateImage = makeGenerateImage();
    const error = await loadProtocolSession()({
      context,
      countTokens,
      generateImage,
      [prop]: prop === 'firstDevelopmentCaseId' || prop === 'caseId' ? context.firstDevelopmentCaseId : {},
    }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect((error as CalibrationFatalError).message).toMatch(/^calibration:/);
    expect(countTokens).toHaveBeenCalledTimes(0);
    expect(generateImage).toHaveBeenCalledTimes(0);
    expect(existsSync(join(baseDir, CALIBRATION_ROOT))).toBe(false);
  });

  it.each([['recordSafeError'], ['baseDir'], ['expected'], ['keyResolver']])(
    'rejects a forbidden inherited %s override with zero callbacks',
    async (prop) => {
      const baseDir = makeTempDir();
      const context = await prepareContext(baseDir);
      const countTokens = makeCountTokens();
      const generateImage = makeGenerateImage();
      const deps = { context, countTokens, generateImage };
      Object.setPrototypeOf(deps, { [prop]: {} });
      expect(Object.prototype.hasOwnProperty.call(deps, prop)).toBe(false);
      const error = await loadProtocolSession()(deps).then(
        () => null,
        (cause: unknown) => cause,
      );
      expect(error).toBeInstanceOf(CalibrationFatalError);
      expect(countTokens).toHaveBeenCalledTimes(0);
      expect(generateImage).toHaveBeenCalledTimes(0);
      expect(existsSync(join(baseDir, CALIBRATION_ROOT))).toBe(false);
    },
  );

  it('rejects an unknown extra deps property with zero callbacks', async () => {
    const baseDir = makeTempDir();
    const context = await prepareContext(baseDir);
    const countTokens = makeCountTokens();
    const generateImage = makeGenerateImage();
    const error = await loadProtocolSession()({
      context,
      countTokens,
      generateImage,
      extra: 1,
    }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect((error as CalibrationFatalError).message).toMatch(/^calibration:/);
    expect((error as { cause?: unknown }).cause).toBeUndefined();
    expect(countTokens).toHaveBeenCalledTimes(0);
    expect(generateImage).toHaveBeenCalledTimes(0);
    expect(existsSync(join(baseDir, CALIBRATION_ROOT))).toBe(false);
  });

  it('drops a secret-bearing plain deps getter with zero store/callback effects', async () => {
    const baseDir = makeTempDir();
    const context = await prepareContext(baseDir);
    const generateImage = makeGenerateImage();
    const deps: Record<string, unknown> = { context, generateImage };
    Object.defineProperty(deps, 'countTokens', {
      get(): unknown {
        throw new Error(`deps boom ${SECRET_SENTINEL} /private/repo/path`);
      },
      enumerable: true,
      configurable: true,
    });
    const error = await loadProtocolSession()(deps).then(
      () => null,
      (cause: unknown) => cause,
    );
    expectFatalWithoutSecret(error, SECRET_SENTINEL);
    expect(generateImage).toHaveBeenCalledTimes(0);
    expect(existsSync(join(baseDir, CALIBRATION_ROOT))).toBe(false);
  });

  it('sanitizes a secret-bearing typed fatal deps getter with zero store/callback effects', async () => {
    const baseDir = makeTempDir();
    const context = await prepareContext(baseDir);
    const countTokens = makeCountTokens();
    const generateImage = makeGenerateImage();
    const privateCause = new Error(`private bytes ${SECRET_SENTINEL} /private/repo/path`);
    const foreign = new CalibrationFatalError(`foreign wrapper ${SECRET_SENTINEL}`, {
      cause: privateCause,
    });
    expect(inspect(foreign, { depth: null })).toContain(SECRET_SENTINEL);
    const deps: Record<string, unknown> = { context, countTokens, generateImage };
    Object.defineProperty(deps, 'generateImage', {
      get(): unknown {
        throw foreign;
      },
      enumerable: true,
      configurable: true,
    });
    const error = await loadProtocolSession()(deps).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).not.toBe(foreign);
    expectFatalWithoutSecret(error, SECRET_SENTINEL);
    expect(countTokens).toHaveBeenCalledTimes(0);
    expect(generateImage).toHaveBeenCalledTimes(0);
    expect(existsSync(join(baseDir, CALIBRATION_ROOT))).toBe(false);
  });

  it('rejects a revoked deps proxy with a fresh static input fatal and zero effects', async () => {
    const baseDir = makeTempDir();
    const context = await prepareContext(baseDir);
    const countTokens = makeCountTokens();
    const generateImage = makeGenerateImage();
    const { proxy, revoke } = Proxy.revocable({ context, countTokens, generateImage }, {});
    revoke();
    const error = await loadProtocolSession()(proxy).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect((error as CalibrationFatalError).message).toBe(
      'calibration:preflight-session-input-invalid',
    );
    expect((error as { cause?: unknown }).cause).toBeUndefined();
    expect(countTokens).toHaveBeenCalledTimes(0);
    expect(generateImage).toHaveBeenCalledTimes(0);
    expect(existsSync(join(baseDir, CALIBRATION_ROOT))).toBe(false);
  });

  it('rejects a revoked context proxy with a fresh static input fatal and zero effects', async () => {
    const baseDir = makeTempDir();
    const genuine = await prepareContext(baseDir);
    const countTokens = makeCountTokens();
    const generateImage = makeGenerateImage();
    const { proxy, revoke } = Proxy.revocable(genuine, {});
    revoke();
    const error = await loadProtocolSession()({
      context: proxy,
      countTokens,
      generateImage,
    }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect((error as CalibrationFatalError).message).toBe(
      'calibration:preflight-session-input-invalid',
    );
    expect((error as { cause?: unknown }).cause).toBeUndefined();
    expect(countTokens).toHaveBeenCalledTimes(0);
    expect(generateImage).toHaveBeenCalledTimes(0);
    expect(existsSync(join(baseDir, CALIBRATION_ROOT))).toBe(false);
  });

  it('drops a deps descriptor-trap typed fatal with zero store/callback effects', async () => {
    const baseDir = makeTempDir();
    const context = await prepareContext(baseDir);
    const countTokens = makeCountTokens();
    const generateImage = makeGenerateImage();
    const foreign = new CalibrationFatalError(`foreign descriptor ${SECRET_SENTINEL}`);
    (foreign as unknown as Record<string, unknown>)['ownData'] =
      `private bytes ${SECRET_SENTINEL} /private/repo/path`;
    expect(inspect(foreign, { depth: null })).toContain(SECRET_SENTINEL);
    const proxy = new Proxy(
      { context, countTokens, generateImage },
      {
        getOwnPropertyDescriptor() {
          throw foreign;
        },
      },
    );
    const error = await loadProtocolSession()(proxy).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).not.toBe(foreign);
    expectFatalWithoutSecret(error, SECRET_SENTINEL);
    expect((error as CalibrationFatalError).message).toBe(
      'calibration:preflight-session-input-invalid',
    );
    expect(countTokens).toHaveBeenCalledTimes(0);
    expect(generateImage).toHaveBeenCalledTimes(0);
    expect(existsSync(join(baseDir, CALIBRATION_ROOT))).toBe(false);
  });

  it('drops a deps ownKeys-trap typed fatal with zero store/callback effects', async () => {
    const baseDir = makeTempDir();
    const context = await prepareContext(baseDir);
    const countTokens = makeCountTokens();
    const generateImage = makeGenerateImage();
    const foreign = new CalibrationFatalError(`foreign ownKeys ${SECRET_SENTINEL}`);
    (foreign as unknown as Record<string, unknown>)['ownData'] =
      `private bytes ${SECRET_SENTINEL} /private/repo/path`;
    expect(inspect(foreign, { depth: null })).toContain(SECRET_SENTINEL);
    const proxy = new Proxy(
      { context, countTokens, generateImage },
      {
        ownKeys() {
          throw foreign;
        },
      },
    );
    const error = await loadProtocolSession()(proxy).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).not.toBe(foreign);
    expectFatalWithoutSecret(error, SECRET_SENTINEL);
    expect((error as CalibrationFatalError).message).toBe(
      'calibration:preflight-session-input-invalid',
    );
    expect(countTokens).toHaveBeenCalledTimes(0);
    expect(generateImage).toHaveBeenCalledTimes(0);
    expect(existsSync(join(baseDir, CALIBRATION_ROOT))).toBe(false);
  });

  it('drops a deps own-symbol rejection with zero store/callback effects', async () => {
    const baseDir = makeTempDir();
    const context = await prepareContext(baseDir);
    const countTokens = makeCountTokens();
    const generateImage = makeGenerateImage();
    const deps: Record<string | symbol, unknown> = { context, countTokens, generateImage };
    deps[Symbol('sneaky')] = `smuggled ${SECRET_SENTINEL}`;
    const error = await loadProtocolSession()(deps).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect((error as CalibrationFatalError).message).toBe(
      'calibration:preflight-session-input-invalid',
    );
    expect((error as { cause?: unknown }).cause).toBeUndefined();
    expect(countTokens).toHaveBeenCalledTimes(0);
    expect(generateImage).toHaveBeenCalledTimes(0);
    expect(existsSync(join(baseDir, CALIBRATION_ROOT))).toBe(false);
  });
});

describe('protocol session prepared-context validation', () => {
  async function forgedContext(
    mutate: (draft: Record<string, unknown>) => void,
  ): Promise<{ context: unknown; baseDir: string }> {
    const baseDir = makeTempDir();
    const genuine = await prepareContext(baseDir);
    const draft = JSON.parse(JSON.stringify(genuine)) as Record<string, unknown>;
    mutate(draft);
    deepFreezeJson(draft);
    return { context: draft, baseDir };
  }

  it.each(IDENTITY_FIELDS.map((field) => [field]))(
    'rejects drifted identity field %s before store/callback effects',
    async (field) => {
      const { context, baseDir } = await forgedContext((draft) => {
        const identity = draft.identity as Record<string, unknown>;
        const current = identity[field as string];
        if ((ASSET_HASH_IDENTITY_FIELDS as readonly string[]).includes(field as string)) {
          const original = String(current);
          const mutated = flipFirstHexChar(original);
          expect(mutated).toMatch(HEX64_PATTERN);
          expect(mutated).not.toBe(original);
          identity[field as string] = mutated;
          return;
        }
        identity[field as string] =
          typeof current === 'number' ? (current as number) + 1 : `${String(current)}-drift`;
      });
      if ((ASSET_HASH_IDENTITY_FIELDS as readonly string[]).includes(field as string)) {
        const mutatedValue = String(
          (context as Record<string, Record<string, unknown>>).identity[field as string],
        );
        expect(mutatedValue).toMatch(HEX64_PATTERN);
      }
      const countTokens = makeCountTokens();
      const generateImage = makeGenerateImage();
      const error = await loadProtocolSession()({ context, countTokens, generateImage }).then(
        () => null,
        (cause: unknown) => cause,
      );
      expect(error).toBeInstanceOf(CalibrationFatalError);
      expect(countTokens).toHaveBeenCalledTimes(0);
      expect(generateImage).toHaveBeenCalledTimes(0);
      expect(existsSync(join(baseDir, CALIBRATION_ROOT))).toBe(false);
    },
  );

  it('rejects tampered files, report mismatch, first-case mismatch, and bad owner/baseDir before effects', async () => {
    const cases: Array<{ name: string; mutate: (draft: Record<string, unknown>) => void }> = [
      {
        name: 'tampered calibration-manifest bytes',
        mutate: (draft) => {
          const files = draft.files as Record<string, string>;
          files['calibration-manifest'] = `${files['calibration-manifest']} `;
        },
      },
      {
        name: 'report firstDevelopmentCaseId mismatch',
        mutate: (draft) => {
          (draft.report as Record<string, unknown>)['firstDevelopmentCaseId'] = 'calibration-dish_0000000000';
        },
      },
      {
        name: 'top-level firstDevelopmentCaseId mismatch',
        mutate: (draft) => {
          draft.firstDevelopmentCaseId = 'calibration-dish_0000000000';
        },
      },
      {
        name: 'blank firstDevelopmentCaseId',
        mutate: (draft) => {
          draft.firstDevelopmentCaseId = '   ';
        },
      },
      {
        name: 'invalid owner pid',
        mutate: (draft) => {
          (draft.owner as Record<string, unknown>)['pid'] = 0;
        },
      },
      {
        name: 'blank owner hostname',
        mutate: (draft) => {
          (draft.owner as Record<string, unknown>)['hostname'] = '  ';
        },
      },
      {
        name: 'relative baseDir',
        mutate: (draft) => {
          draft.baseDir = 'relative/store-dir';
        },
      },
      {
        name: 'blank baseDir',
        mutate: (draft) => {
          draft.baseDir = '   ';
        },
      },
    ];
    for (const { name, mutate } of cases) {
      const { context, baseDir } = await forgedContext(mutate);
      const countTokens = makeCountTokens();
      const generateImage = makeGenerateImage();
      const error = await loadProtocolSession()({ context, countTokens, generateImage }).then(
        () => null,
        (cause: unknown) => cause,
      );
      expect(error, name).toBeInstanceOf(CalibrationFatalError);
      expect(countTokens, name).toHaveBeenCalledTimes(0);
      expect(generateImage, name).toHaveBeenCalledTimes(0);
      expect(existsSync(join(baseDir, CALIBRATION_ROOT)), name).toBe(false);
    }
  });

  it('rejects an unfrozen context or unfrozen nested shape before effects', async () => {
    const baseDir = makeTempDir();
    const genuine = await prepareContext(baseDir);
    expect(Object.isFrozen(genuine)).toBe(true);
    expect(Object.isFrozen(genuine.identity)).toBe(true);
    expect(Object.isFrozen(genuine.files)).toBe(true);
    const countTokens = makeCountTokens();
    const generateImage = makeGenerateImage();
    const thawed = JSON.parse(JSON.stringify(genuine)) as unknown;
    const error = await loadProtocolSession()({
      context: thawed,
      countTokens,
      generateImage,
    }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect(countTokens).toHaveBeenCalledTimes(0);
    expect(generateImage).toHaveBeenCalledTimes(0);
    expect(existsSync(join(baseDir, CALIBRATION_ROOT))).toBe(false);
  });

  it('rejects a nested-only-unfrozen identity beneath a frozen top level', async () => {
    const baseDir = makeTempDir();
    const genuine = await prepareContext(baseDir);
    const thawedIdentity = JSON.parse(JSON.stringify(genuine.identity)) as unknown;
    const nested = { ...(genuine as unknown as Record<string, unknown>), identity: thawedIdentity };
    Object.freeze(nested);
    expect(Object.isFrozen(nested)).toBe(true);
    expect(Object.isFrozen(thawedIdentity)).toBe(false);
    const countTokens = makeCountTokens();
    const generateImage = makeGenerateImage();
    const error = await loadProtocolSession()({
      context: nested,
      countTokens,
      generateImage,
    }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect(countTokens).toHaveBeenCalledTimes(0);
    expect(generateImage).toHaveBeenCalledTimes(0);
    expect(existsSync(join(baseDir, CALIBRATION_ROOT))).toBe(false);
  });

  it('drops a secret-bearing private identity getter before store/callback effects', async () => {
    const baseDir = makeTempDir();
    const genuine = await prepareContext(baseDir);
    const evilIdentity = { ...(genuine.identity as object) };
    Object.defineProperty(evilIdentity, 'model', {
      get(): string {
        throw new Error(`getter boom ${SECRET_SENTINEL} /private/repo/path`);
      },
      enumerable: true,
      configurable: true,
    });
    deepFreezeJson(evilIdentity);
    const evilContext = { ...(genuine as object), identity: evilIdentity } as unknown;
    deepFreezeJson(evilContext);
    const countTokens = makeCountTokens();
    const generateImage = makeGenerateImage();
    const error = await loadProtocolSession()({
      context: evilContext,
      countTokens,
      generateImage,
    }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expectFatalWithoutSecret(error, SECRET_SENTINEL);
    expect(countTokens).toHaveBeenCalledTimes(0);
    expect(generateImage).toHaveBeenCalledTimes(0);
    expect(existsSync(join(baseDir, CALIBRATION_ROOT))).toBe(false);
  });

  it('sanitizes a typed fatal getter cause before store/callback effects', async () => {
    const baseDir = makeTempDir();
    const genuine = await prepareContext(baseDir);
    const privateCause = new Error(`private bytes ${SECRET_SENTINEL} /private/repo/path`);
    const foreign = new CalibrationFatalError(`foreign wrapper ${SECRET_SENTINEL}`, {
      cause: privateCause,
    });
    expect(inspect(foreign, { depth: null })).toContain(SECRET_SENTINEL);
    const evilFiles = { ...((genuine as unknown as Record<string, unknown>).files as object) };
    Object.defineProperty(evilFiles, 'calibration-manifest', {
      get(): string {
        throw foreign;
      },
      enumerable: true,
      configurable: true,
    });
    deepFreezeJson(evilFiles);
    const evilContext = { ...(genuine as object), files: evilFiles } as unknown;
    deepFreezeJson(evilContext);
    const countTokens = makeCountTokens();
    const generateImage = makeGenerateImage();
    const error = await loadProtocolSession()({
      context: evilContext,
      countTokens,
      generateImage,
    }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).not.toBe(foreign);
    expectFatalWithoutSecret(error, SECRET_SENTINEL);
    expect(countTokens).toHaveBeenCalledTimes(0);
    expect(generateImage).toHaveBeenCalledTimes(0);
    expect(existsSync(join(baseDir, CALIBRATION_ROOT))).toBe(false);
  });

  it('rejects an impossible owner calendar timestamp with a fresh static fatal and zero effects', async () => {
    const { context, baseDir } = await forgedContext((draft) => {
      (draft.owner as Record<string, unknown>)['acquiredAt'] = '2026-13-05T00:00:00.000Z';
    });
    const rawAcquiredAt = (context as Record<string, Record<string, unknown>>).owner['acquiredAt'];
    expect(rawAcquiredAt).toBe('2026-13-05T00:00:00.000Z');
    const countTokens = makeCountTokens();
    const generateImage = makeGenerateImage();
    const error = await loadProtocolSession()({ context, countTokens, generateImage }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect(error).not.toBeInstanceOf(RangeError);
    expect((error as CalibrationFatalError).message).toMatch(/^calibration:/);
    expect((error as { cause?: unknown }).cause).toBeUndefined();
    expect(countTokens).toHaveBeenCalledTimes(0);
    expect(generateImage).toHaveBeenCalledTimes(0);
    expect(existsSync(join(baseDir, CALIBRATION_ROOT))).toBe(false);
  });

  it('rejects a sixth claimed compatibility note before store/callback effects', async () => {
    const { context, baseDir } = await forgedContext((draft) => {
      const notes = (draft.report as Record<string, unknown>)['compatibilityNotes'] as Array<
        Record<string, unknown>
      >;
      expect(notes).toHaveLength(5);
      notes.push({ key: 'extra-note', detail: 'An unapproved sixth claim.' });
    });
    const forgedNotes = (context as Record<string, Record<string, Array<unknown>>>).report[
      'compatibilityNotes'
    ];
    expect(forgedNotes).toHaveLength(6);
    const countTokens = makeCountTokens();
    const generateImage = makeGenerateImage();
    const error = await loadProtocolSession()({ context, countTokens, generateImage }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect((error as CalibrationFatalError).message).toMatch(/^calibration:/);
    expect(countTokens).toHaveBeenCalledTimes(0);
    expect(generateImage).toHaveBeenCalledTimes(0);
    expect(existsSync(join(baseDir, CALIBRATION_ROOT))).toBe(false);
  });

  it('drops a nested owner isExtensible-trap typed fatal with zero store/callback effects', async () => {
    const baseDir = makeTempDir();
    const genuine = await prepareContext(baseDir);
    const foreign = new CalibrationFatalError(`foreign owner liveness ${SECRET_SENTINEL}`);
    (foreign as unknown as Record<string, unknown>)['ownData'] =
      `private bytes ${SECRET_SENTINEL} /private/repo/path`;
    expect(inspect(foreign, { depth: null })).toContain(SECRET_SENTINEL);
    const ownerProxy = new Proxy(genuine.owner as unknown as Record<string, unknown>, {
      isExtensible() {
        throw foreign;
      },
    });
    // The trap must fire only inside the production frozen check, never here.
    const context = Object.freeze({
      ...(genuine as unknown as Record<string, unknown>),
      owner: ownerProxy,
    });
    expect(Object.isFrozen(context)).toBe(true);
    const countTokens = makeCountTokens();
    const generateImage = makeGenerateImage();
    const error = await loadProtocolSession()({
      context,
      countTokens,
      generateImage,
    }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).not.toBe(foreign);
    expectFatalWithoutSecret(error, SECRET_SENTINEL);
    expect((error as CalibrationFatalError).message).toMatch(/^calibration:/);
    expect(countTokens).toHaveBeenCalledTimes(0);
    expect(generateImage).toHaveBeenCalledTimes(0);
    expect(existsSync(join(baseDir, CALIBRATION_ROOT))).toBe(false);
  });

  it('drops a compat-note indexed-getter typed fatal with zero store/callback effects', async () => {
    const baseDir = makeTempDir();
    const genuine = await prepareContext(baseDir);
    const foreign = new CalibrationFatalError(`foreign note ${SECRET_SENTINEL}`);
    (foreign as unknown as Record<string, unknown>)['ownData'] =
      `private bytes ${SECRET_SENTINEL} /private/repo/path`;
    expect(inspect(foreign, { depth: null })).toContain(SECRET_SENTINEL);
    const genuineReport = (genuine as unknown as Record<string, unknown>).report as Record<
      string,
      unknown
    >;
    const notes = [...(genuineReport['compatibilityNotes'] as Array<unknown>)];
    expect(notes).toHaveLength(5);
    Object.defineProperty(notes, 0, {
      get(): unknown {
        throw foreign;
      },
      enumerable: true,
      configurable: true,
    });
    // The indexed getter would fire under `for..of` iteration, so freeze the
    // array directly: its elements are already frozen genuine fixtures.
    Object.freeze(notes);
    const context = Object.freeze({
      ...(genuine as unknown as Record<string, unknown>),
      report: Object.freeze({ ...genuineReport, compatibilityNotes: notes }),
    });
    const countTokens = makeCountTokens();
    const generateImage = makeGenerateImage();
    const error = await loadProtocolSession()({
      context,
      countTokens,
      generateImage,
    }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).not.toBe(foreign);
    expectFatalWithoutSecret(error, SECRET_SENTINEL);
    expect((error as CalibrationFatalError).message).toMatch(/^calibration:/);
    expect(countTokens).toHaveBeenCalledTimes(0);
    expect(generateImage).toHaveBeenCalledTimes(0);
    expect(existsSync(join(baseDir, CALIBRATION_ROOT))).toBe(false);
  });
});

describe('protocol session failure retention (no retry, lock kept)', () => {
  it('keeps the lock and pins nothing when LOW provider fails; MEDIUM never runs', async () => {
    const secretUrl = 'https://secret.invalid';
    const baseDir = makeTempDir();
    const context = await prepareContext(baseDir);
    const { first } = readDevIds(context);
    const countTokens = makeCountTokens();
    const generateImage = vi.fn(async () => {
      throw Object.assign(new Error(`private ${secretUrl}`), { status: 503 });
    });

    const error = await loadProtocolSession()({ context, countTokens, generateImage }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect((error as CalibrationFatalError).message).toMatch(/^calibration:/);
    expectFatalWithoutSecret(error, secretUrl);
    expect(countTokens).toHaveBeenCalledTimes(1);
    expect(generateImage).toHaveBeenCalledTimes(1);

    const deps = createFileCalibrationLedgerDeps(baseDir);
    const events = readEvents(baseDir);
    expect(events.map((e) => e.type)).not.toContain('model_version_pinned');
    expect(events.map((e) => e.type)).not.toContain('stage_completed');
    const journals = deps.readJournalEntries();
    expect(journals).toHaveLength(1);
    expect(journals[0]?.key).toEqual({
      stage: 'preflight',
      profile: 'LOW',
      caseId: first,
      sampleIndex: 1,
    });
    expect(journals[0]?.normalizedPrediction).toBeNull();
    expect(journals[0]?.errorCategory).toBe('http_5xx');
    expect(journals[0]?.responseModelVersion).toBe('n/a');
    const safe = events.filter((e) => e.type === 'safe_error');
    expect(safe).toHaveLength(1);
    expect((safe[0] as { entry?: unknown }).entry).toEqual({
      stage: 'preflight',
      kind: 'image',
      caseId: first,
      profile: 'LOW',
      sampleIndex: 1,
      errorCategory: 'http_5xx',
    });
    expect(JSON.stringify(events)).not.toContain(secretUrl);
    expect(JSON.stringify(journals)).not.toContain(secretUrl);
    expect(deps.readLock()).toEqual(context.owner);
  });

  it('keeps the lock and pins nothing when LOW prediction is unparsable; MEDIUM never runs', async () => {
    const baseDir = makeTempDir();
    const context = await prepareContext(baseDir);
    const countTokens = makeCountTokens();
    const generateImage = vi.fn(async () => ({
      prediction: { kcal: 'bad', proteinG: 20, carbsG: 30, fatG: 10 },
      modelVersion: PINNED_VERSION,
    }));

    const error = await loadProtocolSession()({ context, countTokens, generateImage }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect(countTokens).toHaveBeenCalledTimes(1);
    expect(generateImage).toHaveBeenCalledTimes(1);
    const events = readEvents(baseDir);
    expect(events.map((e) => e.type)).not.toContain('model_version_pinned');
    expect(events.map((e) => e.type)).not.toContain('stage_completed');
    expect(createFileCalibrationLedgerDeps(baseDir).readLock()).toEqual(context.owner);
  });

  it('runs no image work and keeps the lock when the token call fails', async () => {
    const secretUrl = 'https://secret.invalid/token';
    const baseDir = makeTempDir();
    const context = await prepareContext(baseDir);
    const { first } = readDevIds(context);
    const countTokens = vi.fn(async () => {
      throw Object.assign(new Error(`private ${secretUrl}`), { status: 429 });
    });
    const generateImage = makeGenerateImage();

    const error = await loadProtocolSession()({ context, countTokens, generateImage }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expectFatalWithoutSecret(error, secretUrl);
    expect(countTokens).toHaveBeenCalledTimes(1);
    expect(generateImage).toHaveBeenCalledTimes(0);

    const deps = createFileCalibrationLedgerDeps(baseDir);
    const events = readEvents(baseDir);
    expect(events.map((e) => e.type)).toEqual([
      'protocol_identity',
      'token_count_reserved',
      'token_count_failed',
      'safe_error',
    ]);
    const safe = events.find((e) => e.type === 'safe_error') as { entry?: unknown } | undefined;
    expect(safe?.entry).toEqual({
      stage: 'preflight',
      kind: 'token_count',
      caseId: first,
      errorCategory: 'http_429',
    });
    expect(deps.readJournalEntries()).toHaveLength(0);
    expect(deps.readLock()).toEqual(context.owner);
    expect(JSON.stringify(events)).not.toContain(secretUrl);
  });

  it('records LOW success then stops on MEDIUM drift with no stage completion and lock kept', async () => {
    const baseDir = makeTempDir();
    const context = await prepareContext(baseDir);
    const countTokens = makeCountTokens();
    const generateImage = vi.fn(async (request: unknown) => {
      const profile = (request as { profile?: unknown }).profile;
      return {
        prediction: { kcal: 320, proteinG: 20, carbsG: 30, fatG: 10 },
        modelVersion: profile === 'MEDIUM' ? OTHER_VERSION : PINNED_VERSION,
      };
    });

    const error = await loadProtocolSession()({ context, countTokens, generateImage }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect(countTokens).toHaveBeenCalledTimes(1);
    expect(generateImage).toHaveBeenCalledTimes(2);
    const deps = createFileCalibrationLedgerDeps(baseDir);
    const events = readEvents(baseDir);
    expect(events.map((e) => e.type)).not.toContain('stage_completed');
    const journals = deps.readJournalEntries();
    expect(journals).toHaveLength(1);
    expect(journals[0]?.profile).toBeUndefined();
    expect(journals[0]?.key).toMatchObject({ profile: 'LOW' });
    expect(journals[0]?.responseModelVersion).toBe(PINNED_VERSION);
    expect(deps.readLock()).toEqual(context.owner);
  });

  it('persists an uncertain MEDIUM outcome with zero retry and lock kept', async () => {
    const baseDir = makeTempDir();
    const context = await prepareContext(baseDir);
    const countTokens = makeCountTokens();
    const generateImage = vi.fn(async (request: unknown) => {
      const profile = (request as { profile?: unknown }).profile;
      if (profile === 'MEDIUM') {
        return { prediction: null, modelVersion: PINNED_VERSION };
      }
      return {
        prediction: { kcal: 320, proteinG: 20, carbsG: 30, fatG: 10 },
        modelVersion: PINNED_VERSION,
      };
    });

    const error = await loadProtocolSession()({ context, countTokens, generateImage }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect(countTokens).toHaveBeenCalledTimes(1);
    expect(generateImage).toHaveBeenCalledTimes(2);
    const deps = createFileCalibrationLedgerDeps(baseDir);
    const events = readEvents(baseDir);
    expect(events.map((e) => e.type)).not.toContain('stage_completed');
    expect(deps.readJournalEntries()).toHaveLength(2);
    expect(deps.readLock()).toEqual(context.owner);
  });
});

describe('protocol session provider-response getter privacy', () => {
  it('drops a throwing tokenCount getter with lock kept, no pin, no stage, no MEDIUM call', async () => {
    const baseDir = makeTempDir();
    const context = await prepareContext(baseDir);
    const foreign = new Error(`foreign token boom ${SECRET_SENTINEL} /private/repo/path`);
    const countTokens = vi.fn(async () => {
      const response: Record<string, unknown> = {};
      Object.defineProperty(response, 'tokenCount', {
        get(): unknown {
          throw foreign;
        },
        enumerable: true,
        configurable: true,
      });
      return response;
    });
    const generateImage = makeGenerateImage();
    const error = await loadProtocolSession()({ context, countTokens, generateImage }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).not.toBe(foreign);
    expectFatalWithoutSecret(error, SECRET_SENTINEL);
    expect((error as CalibrationFatalError).message).toMatch(/^calibration:/);
    expect(countTokens).toHaveBeenCalledTimes(1);
    expect(generateImage).toHaveBeenCalledTimes(0);
    const events = readEvents(baseDir);
    expect(events.map((e) => e.type)).not.toContain('model_version_pinned');
    expect(events.map((e) => e.type)).not.toContain('stage_completed');
    expect(createFileCalibrationLedgerDeps(baseDir).readLock()).toEqual(context.owner);
  });

  it('drops a throwing prediction getter with lock kept, no pin, no stage, no MEDIUM call', async () => {
    const baseDir = makeTempDir();
    const context = await prepareContext(baseDir);
    const foreign = new Error(`foreign prediction boom ${SECRET_SENTINEL} /private/repo/path`);
    const countTokens = makeCountTokens();
    const generateImage = vi.fn(async () => {
      const response: Record<string, unknown> = { modelVersion: PINNED_VERSION };
      Object.defineProperty(response, 'prediction', {
        get(): unknown {
          throw foreign;
        },
        enumerable: true,
        configurable: true,
      });
      return response;
    });
    const error = await loadProtocolSession()({ context, countTokens, generateImage }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).not.toBe(foreign);
    expectFatalWithoutSecret(error, SECRET_SENTINEL);
    expect((error as CalibrationFatalError).message).toMatch(/^calibration:/);
    expect(countTokens).toHaveBeenCalledTimes(1);
    expect(generateImage).toHaveBeenCalledTimes(1);
    const events = readEvents(baseDir);
    expect(events.map((e) => e.type)).not.toContain('model_version_pinned');
    expect(events.map((e) => e.type)).not.toContain('stage_completed');
    expect(createFileCalibrationLedgerDeps(baseDir).readLock()).toEqual(context.owner);
  });

  it('sanitizes a typed fatal modelVersion getter cause with lock kept, no pin, no stage, no MEDIUM call', async () => {
    const baseDir = makeTempDir();
    const context = await prepareContext(baseDir);
    const privateCause = new Error(`private bytes ${SECRET_SENTINEL} /private/repo/path`);
    const foreign = new CalibrationFatalError(`foreign wrapper ${SECRET_SENTINEL}`, {
      cause: privateCause,
    });
    expect(inspect(foreign, { depth: null })).toContain(SECRET_SENTINEL);
    const countTokens = makeCountTokens();
    const generateImage = vi.fn(async () => {
      const response: Record<string, unknown> = {
        prediction: { kcal: 320, proteinG: 20, carbsG: 30, fatG: 10 },
      };
      Object.defineProperty(response, 'modelVersion', {
        get(): unknown {
          throw foreign;
        },
        enumerable: true,
        configurable: true,
      });
      return response;
    });
    const error = await loadProtocolSession()({ context, countTokens, generateImage }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).not.toBe(foreign);
    expectFatalWithoutSecret(error, SECRET_SENTINEL);
    expect((error as CalibrationFatalError).message).toMatch(/^calibration:/);
    expect(countTokens).toHaveBeenCalledTimes(1);
    expect(generateImage).toHaveBeenCalledTimes(1);
    const events = readEvents(baseDir);
    expect(events.map((e) => e.type)).not.toContain('model_version_pinned');
    expect(events.map((e) => e.type)).not.toContain('stage_completed');
    expect(createFileCalibrationLedgerDeps(baseDir).readLock()).toEqual(context.owner);
  });

  it('drops an arbitrary calibration-prefixed provider getter fatal without cause', async () => {
    const baseDir = makeTempDir();
    const context = await prepareContext(baseDir);
    const countTokens = makeCountTokens();
    const generateImage = vi.fn(async () => {
      const response: Record<string, unknown> = { modelVersion: PINNED_VERSION };
      Object.defineProperty(response, 'prediction', {
        get(): unknown {
          throw new CalibrationFatalError(`calibration:PRIVATE-boom-${SECRET_SENTINEL}`);
        },
        enumerable: true,
        configurable: true,
      });
      return response;
    });
    const error = await loadProtocolSession()({ context, countTokens, generateImage }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expectFatalWithoutSecret(error, SECRET_SENTINEL);
    expect((error as CalibrationFatalError).message).toMatch(/^calibration:/);
    expect(countTokens).toHaveBeenCalledTimes(1);
    expect(generateImage).toHaveBeenCalledTimes(1);
    const events = readEvents(baseDir);
    expect(events.map((e) => e.type)).not.toContain('model_version_pinned');
    expect(events.map((e) => e.type)).not.toContain('stage_completed');
    expect(createFileCalibrationLedgerDeps(baseDir).readLock()).toEqual(context.owner);
  });

  it('strips private ownData from an approved-message provider getter fatal', async () => {
    const baseDir = makeTempDir();
    const context = await prepareContext(baseDir);
    const foreign = new CalibrationFatalError('calibration:preflight-image-call-failed');
    (foreign as unknown as Record<string, unknown>)['ownData'] =
      `private bytes ${SECRET_SENTINEL} /private/repo/path`;
    expect(inspect(foreign, { depth: null })).toContain(SECRET_SENTINEL);
    const countTokens = makeCountTokens();
    const generateImage = vi.fn(async () => {
      const response: Record<string, unknown> = { modelVersion: PINNED_VERSION };
      Object.defineProperty(response, 'prediction', {
        get(): unknown {
          throw foreign;
        },
        enumerable: true,
        configurable: true,
      });
      return response;
    });
    const error = await loadProtocolSession()({ context, countTokens, generateImage }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).not.toBe(foreign);
    expectFatalWithoutSecret(error, SECRET_SENTINEL);
    expect((error as CalibrationFatalError).message).toMatch(/^calibration:/);
    expect(countTokens).toHaveBeenCalledTimes(1);
    expect(generateImage).toHaveBeenCalledTimes(1);
    const events = readEvents(baseDir);
    expect(events.map((e) => e.type)).not.toContain('model_version_pinned');
    expect(events.map((e) => e.type)).not.toContain('stage_completed');
    expect(createFileCalibrationLedgerDeps(baseDir).readLock()).toEqual(context.owner);
  });

  it('drops a proxy-thrown provider error whose prototype trap throws private bytes', async () => {
    const baseDir = makeTempDir();
    const context = await prepareContext(baseDir);
    const privateBlast = new Error(`private prototype ${SECRET_SENTINEL} /private/repo/path`);
    const thrown = new Proxy(new Error('provider blew up'), {
      getPrototypeOf() {
        throw privateBlast;
      },
    });
    const countTokens = makeCountTokens();
    const generateImage = vi.fn(async () => {
      const response: Record<string, unknown> = { modelVersion: PINNED_VERSION };
      Object.defineProperty(response, 'prediction', {
        get(): unknown {
          throw thrown;
        },
        enumerable: true,
        configurable: true,
      });
      return response;
    });
    const error = await loadProtocolSession()({ context, countTokens, generateImage }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error === thrown).toBe(false);
    expectFatalWithoutSecret(error, SECRET_SENTINEL);
    expect((error as CalibrationFatalError).message).toMatch(/^calibration:/);
    expect(countTokens).toHaveBeenCalledTimes(1);
    expect(generateImage).toHaveBeenCalledTimes(1);
    const events = readEvents(baseDir);
    expect(events.map((e) => e.type)).not.toContain('model_version_pinned');
    expect(events.map((e) => e.type)).not.toContain('stage_completed');
    expect(createFileCalibrationLedgerDeps(baseDir).readLock()).toEqual(context.owner);
  });
});

describe('protocol session pre-pin projection regression', () => {
  it.each([
    ['NaN', Number.NaN],
    ['negative', -5],
    ['string', 'bad'],
  ] as Array<[string, unknown]>)(
    'pins nothing when the LOW kcal projection turns %s after validation',
    async (_label, invalid) => {
      const baseDir = makeTempDir();
      const context = await prepareContext(baseDir);
      const countTokens = makeCountTokens();
      // Exact primitive reads: `isStructuredPrediction` retrieves each
      // nutrient once for its typeof/finite/nonnegative validation, and
      // `successfulImageJournalEntry` retrieves it a second time to project
      // the journal snapshot. The first read stays finite-valid so
      // validation passes; the projection read turns invalid.
      const seen: unknown[] = [];
      const generateImage = vi.fn(async () => ({
        prediction: {
          get kcal(): unknown {
            seen.push(seen.length === 0 ? 320 : invalid);
            return seen[seen.length - 1];
          },
          proteinG: 20,
          carbsG: 30,
          fatG: 10,
        },
        modelVersion: PINNED_VERSION,
      }));
      const error = await loadProtocolSession()({ context, countTokens, generateImage }).then(
        () => null,
        (cause: unknown) => cause,
      );
      // The getter really did flip on projection: validation saw 320, the
      // snapshot saw the invalid value.
      expect(seen.length).toBeGreaterThanOrEqual(2);
      expect(seen[0]).toBe(320);
      expect(seen[1]).toBe(invalid);
      expect(error).toBeInstanceOf(CalibrationFatalError);
      expect((error as CalibrationFatalError).message).toMatch(/^calibration:/);
      expect(countTokens).toHaveBeenCalledTimes(1);
      expect(generateImage).toHaveBeenCalledTimes(1);
      const events = readEvents(baseDir);
      expect(events.map((e) => e.type)).not.toContain('model_version_pinned');
      expect(events.map((e) => e.type)).not.toContain('stage_completed');
      expect(createFileCalibrationLedgerDeps(baseDir).readJournalEntries()).toHaveLength(0);
      expect(createFileCalibrationLedgerDeps(baseDir).readLock()).toEqual(context.owner);
    },
  );
});

describe('protocol session already-started and existing-disk refusal', () => {
  it('refuses a second run after a released success with already-started, new lock, zero calls', async () => {
    const baseDir = makeTempDir();
    const context = await prepareContext(baseDir);
    const first = await loadProtocolSession()({
      context,
      countTokens: makeCountTokens(),
      generateImage: makeGenerateImage(),
    });
    expect(first.tokenCount).toBe(TOKEN_COUNT);
    expect(first.pinnedModelVersion).toBe(PINNED_VERSION);
    // A successful run auto-releases the lock.
    expect(createFileCalibrationLedgerDeps(baseDir).readLock()).toBeUndefined();
    const fileDeps = createFileCalibrationLedgerDeps(baseDir);
    const eventsBefore = readEvents(baseDir);
    const journalsBefore = fileDeps.readJournalEntries();

    const countTokens = makeCountTokens();
    const generateImage = makeGenerateImage();
    const error = await loadProtocolSession()({ context, countTokens, generateImage }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect((error as CalibrationFatalError).message).toBe(
      'calibration:preflight-already-started',
    );
    expect((error as { cause?: unknown }).cause).toBeUndefined();
    expect(countTokens).toHaveBeenCalledTimes(0);
    expect(generateImage).toHaveBeenCalledTimes(0);
    // The vacant lock is reacquired and kept by the refusing run.
    expect(createFileCalibrationLedgerDeps(baseDir).readLock()).toEqual(context.owner);
    // No new reservation records: journals identical, and the ledger grew by
    // lock events at most.
    expect(createFileCalibrationLedgerDeps(baseDir).readJournalEntries()).toEqual(journalsBefore);
    const eventsAfter = readEvents(baseDir);
    const isLockEvent = (event: Record<string, unknown>): boolean =>
      event.type === 'lock_recovery';
    expect(eventsAfter.filter((event) => !isLockEvent(event))).toEqual(
      eventsBefore.filter((event) => !isLockEvent(event)),
    );
    expect(
      eventsAfter.filter((event) => event.type === 'reserved').length,
    ).toBe(eventsBefore.filter((event) => event.type === 'reserved').length);
  });

  it('recovers a legitimate dead-owner interrupted LOW without resending, then refuses already-started', async () => {
    const baseDir = makeTempDir();
    const liveTicks = currentStartTicks();
    const sessionOwner: CalibrationOwner = {
      hostname: hostname(),
      bootId: readBootId(),
      pid: process.pid,
      startTicks: liveTicks,
      acquiredAt: '2026-10-01T00:00:00.000Z',
    };
    const staleOwner: CalibrationOwner = {
      ...sessionOwner,
      startTicks: liveTicks + 1000000,
      acquiredAt: '2026-09-30T00:00:00.000Z',
    };
    expect(staleOwner.startTicks).not.toBe(sessionOwner.startTicks);
    expect(Number.isInteger(staleOwner.startTicks)).toBe(true);
    expect(staleOwner.startTicks).toBeGreaterThan(0);
    const nativeDeps = createFileCalibrationLedgerDeps(baseDir);
    expect(nativeDeps.probeOwnerLiveness(staleOwner)).toBe('dead');
    expect(nativeDeps.probeOwnerLiveness(sessionOwner)).toBe('live');
    const context = await prepareContext(baseDir, sessionOwner);
    const { first, dev } = readDevIds(context);
    const seedDeps = createFileCalibrationLedgerDeps(baseDir);
    const seed = createProtocolCalibrationLedger(
      seedDeps,
      context.identity as CalibrationIdentity,
      makeInitial50Resolver(first, dev),
    );
    seed.acquireLock(staleOwner);
    const tokenKey = makeTokenKey(first);
    seed.reserveTokenCount(tokenKey);
    seed.completeTokenCount(tokenKey, 7);
    const lowKey: ReservationKey = {
      stage: 'preflight',
      profile: 'LOW',
      caseId: first,
      sampleIndex: 1,
    };
    seed.reserve(lowKey);
    const reservedBefore = readEvents(baseDir).filter((e) => e.type === 'reserved').length;
    expect(reservedBefore).toBe(1);

    const countTokens = makeCountTokens();
    const generateImage = makeGenerateImage();
    const error = await loadProtocolSession()({ context, countTokens, generateImage }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect((error as CalibrationFatalError).message).toBe(
      'calibration:preflight-already-started',
    );
    // Never resend: no provider calls at all, LOW reservation count unchanged.
    expect(countTokens).toHaveBeenCalledTimes(0);
    expect(generateImage).toHaveBeenCalledTimes(0);
    const events = readEvents(baseDir);
    expect(events.filter((e) => e.type === 'reserved').length).toBe(reservedBefore);
    // Recovery accounting: the interrupted LOW reached a bound failed terminal.
    const failed = events.filter((e) => e.type === 'failed');
    expect(failed.length).toBeGreaterThanOrEqual(1);
    const journals = createFileCalibrationLedgerDeps(baseDir).readJournalEntries();
    const tail = journals[journals.length - 1];
    expect(tail?.errorCategory).toBe('interrupted_reservation');
    expect(tail?.normalizedPrediction).toBeNull();
    expect(createFileCalibrationLedgerDeps(baseDir).readLock()).toEqual(context.owner);
  });

  it('refuses tampered existing disk with zero callbacks', async () => {
    const baseDir = makeTempDir();
    const context = await prepareContext(baseDir);
    mkdirSync(join(baseDir, CALIBRATION_ROOT), { recursive: true });
    writeFileSync(join(baseDir, CALIBRATION_ROOT, 'ledger.json'), 'not-json{{{', 'utf8');
    const countTokens = makeCountTokens();
    const generateImage = makeGenerateImage();
    const error = await loadProtocolSession()({ context, countTokens, generateImage }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect(countTokens).toHaveBeenCalledTimes(0);
    expect(generateImage).toHaveBeenCalledTimes(0);
  });

  it('refuses a live conflicting lock with zero callbacks and the original lock kept', async () => {
    const baseDir = makeTempDir();
    const liveOwner = makeLiveOwner('2026-09-30T00:00:00.000Z');
    const sessionOwner = makeLiveOwner('2026-10-01T00:00:00.000Z');
    const context = await prepareContext(baseDir, sessionOwner);
    const setupDeps = createFileCalibrationLedgerDeps(baseDir);
    setupDeps.writeLockExclusive(liveOwner);
    expect(readEvents(baseDir)).toHaveLength(0);

    const countTokens = makeCountTokens();
    const generateImage = makeGenerateImage();
    const error = await loadProtocolSession()({ context, countTokens, generateImage }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect((error as CalibrationFatalError).message).toMatch(/^calibration:/);
    expect(countTokens).toHaveBeenCalledTimes(0);
    expect(generateImage).toHaveBeenCalledTimes(0);
    expect(createFileCalibrationLedgerDeps(baseDir).readLock()).toEqual(liveOwner);
    expect(readEvents(baseDir)).toHaveLength(0);
  });
});

describe('protocol session legacy compatibility', () => {
  it('leaves the legacy preflight session working on its own shape', async () => {
    const baseDir = makeTempDir();
    const context = await prepareContext(baseDir);
    const { first } = readDevIds(context);
    const countTokens = makeCountTokens();
    const generateImage = makeGenerateImage();
    const recordSafeError = vi.fn(() => undefined);
    const result = await preflightSessionModule.runCalibrationPreflightSession({
      baseDir,
      identity: JSON.parse(JSON.stringify(context.identity)) as CalibrationIdentity,
      owner: JSON.parse(JSON.stringify(context.owner)) as CalibrationOwner,
      firstDevelopmentCaseId: first,
      countTokens,
      generateImage,
      recordSafeError,
    });
    expect(result.tokenCount).toBe(TOKEN_COUNT);
    expect(result.pinnedModelVersion).toBe(PINNED_VERSION);
  });
});
