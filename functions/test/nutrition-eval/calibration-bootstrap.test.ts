/**
 * Calibration bootstrap preparation test contract.
 *
 * If the source `functions/src/nutrition-eval/calibration-bootstrap.ts` is
 * absent, this file fails at import time with a missing-module error. Do NOT
 * create a placeholder implementation to satisfy these tests.
 *
 * Hermetic contract: injected-reader tests use dependency injection only plus
 * read-only `readFileSync` of the five committed
 * `functions/eval/nutrition/*.json` fixtures as local inputs. Native-reader
 * tests build real temporary Git repositories strictly inside their owned
 * `os.tmpdir()` directories (init/add/commit with local `-c` fixture author
 * identity) and never commit or push the actual Calorix checkout. No provider
 * client, SDK construction, network, Firebase, or device access occurs here.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspect } from 'node:util';
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';
import {
  CALIBRATION_BOOTSTRAP_ASSET_PATHS,
  createCalibrationBootstrapReadDeps,
  prepareCalibrationBootstrapContext,
} from '../../src/nutrition-eval/calibration-bootstrap';

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

const HEAD_A = 'a'.repeat(40);
const IMPL_B = 'b'.repeat(40);
const TREE_C = 'c'.repeat(40);
const FIRST_DEV_CASE_ID = 'calibration-dish_1565117892';
const FIXTURE_OWNER_ACQUIRED_AT = '2026-10-05T00:00:00.000Z';
const SECRET_SENTINEL = 'SECRET-BOOTSTRAP-7f3a9d';

const realRepoRoot = fileURLToPath(new URL('../../../', import.meta.url));

type FixtureAssetKey =
  | 'public-manifest'
  | 'source-lock'
  | 'calibration-manifest'
  | 'off-lock'
  | 'historical-reference';

const FIXTURE_REPO_PATHS: Record<FixtureAssetKey, string> = {
  'public-manifest': 'functions/eval/nutrition/public-manifest.json',
  'source-lock': 'functions/eval/nutrition/calibration-source-lock.json',
  'calibration-manifest': 'functions/eval/nutrition/calibration-manifest.json',
  'off-lock': 'functions/eval/nutrition/off-snapshot-lock.json',
  'historical-reference': 'functions/eval/nutrition/historical-reference-v1.json',
};

function readRealAsset(key: FixtureAssetKey): string {
  return readFileSync(resolve(realRepoRoot, FIXTURE_REPO_PATHS[key]), 'utf8');
}

function makeGitState(overrides: Record<string, unknown> = {}): {
  headCommit: string;
  implementationCommit: string;
  functionsTreeId: string;
  dirtyPaths: string[];
} {
  return {
    headCommit: HEAD_A,
    implementationCommit: IMPL_B,
    functionsTreeId: TREE_C,
    dirtyPaths: [],
    ...overrides,
  } as {
    headCommit: string;
    implementationCommit: string;
    functionsTreeId: string;
    dirtyPaths: string[];
  };
}

function makeOwner(overrides: Record<string, unknown> = {}): {
  hostname: string;
  bootId: string;
  pid: number;
  startTicks: number;
  acquiredAt: string;
} {
  return {
    hostname: 'fixture-host',
    bootId: 'fixture-boot',
    pid: 123,
    startTicks: 42,
    acquiredAt: FIXTURE_OWNER_ACQUIRED_AT,
    ...overrides,
  } as {
    hostname: string;
    bootId: string;
    pid: number;
    startTicks: number;
    acquiredAt: string;
  };
}

function makeCommittedReader(
  tamper: Partial<Record<FixtureAssetKey | string, string>> = {},
  onCall?: (path: string, commit: string) => void,
): ReturnType<typeof vi.fn> {
  return vi.fn((path: string, _commit: string) => {
    onCall?.(path, _commit);
    const match = (Object.entries(FIXTURE_REPO_PATHS) as Array<[FixtureAssetKey, string]>).find(
      ([, repoPath]) => repoPath === path,
    );
    if (match === undefined) throw new Error(`unexpected asset path ${path}`);
    const key = match[0];
    if (tamper[key] !== undefined) return tamper[key] as string;
    return readRealAsset(key);
  });
}

function makeDeps(overrides: Record<string, unknown> = {}): {
  baseDir: string;
  readGitState: ReturnType<typeof vi.fn>;
  readCommittedFile: ReturnType<typeof vi.fn>;
  readOwner: ReturnType<typeof vi.fn>;
} {
  const gitState = makeGitState();
  const owner = makeOwner();
  return {
    baseDir: '/tmp/calorix-bootstrap-fixture',
    readGitState: vi.fn(() => ({ ...gitState, dirtyPaths: [...gitState.dirtyPaths] })),
    readCommittedFile: makeCommittedReader(),
    readOwner: vi.fn(() => ({ ...owner })),
    ...overrides,
  } as {
    baseDir: string;
    readGitState: ReturnType<typeof vi.fn>;
    readCommittedFile: ReturnType<typeof vi.fn>;
    readOwner: ReturnType<typeof vi.fn>;
  };
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

function expectFatalWithoutSentinel(error: unknown, sentinel: string): void {
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
    expect(surface).not.toContain(sentinel);
  }
}

async function captureError(
  deps: unknown,
): Promise<{ error: unknown }> {
  const error = await (
    prepareCalibrationBootstrapContext as unknown as (d: unknown) => Promise<unknown>
  )(deps).then(
    () => null,
    (cause: unknown) => cause,
  );
  return { error };
}

describe('calibration bootstrap happy path (injected readers)', () => {
  it('prepares a frozen context from committed fixtures with pinned identity', async () => {
    const gitState = makeGitState();
    const owner = makeOwner();
    const readCommittedFile = makeCommittedReader();
    const deps = {
      baseDir: '/tmp/calorix-bootstrap-fixture',
      readGitState: vi.fn(() => ({ ...gitState })),
      readCommittedFile,
      readOwner: vi.fn(() => ({ ...owner })),
    };
    const result = (await (
      prepareCalibrationBootstrapContext as unknown as (d: unknown) => Promise<{
        baseDir: string;
        identity: Record<string, unknown>;
        owner: Record<string, unknown>;
        firstDevelopmentCaseId: string;
        report: Record<string, unknown>;
        files: Record<string, string>;
      }>
    )(deps)) as {
      baseDir: string;
      identity: Record<string, unknown>;
      owner: Record<string, unknown>;
      firstDevelopmentCaseId: string;
      report: Record<string, unknown>;
      files: Record<string, string>;
    };
    expect(result.firstDevelopmentCaseId).toBe(FIRST_DEV_CASE_ID);
    expect(result.identity['implementationCommit']).toBe(IMPL_B);
    expect(result.identity['functionsTreeId']).toBe(TREE_C);
    expect(result.identity['model']).toBe('gemini-3.8-flash');
    expect(result.identity['plannedImageCalls']).toBe(146);
    expect(result.report['historicalCompatible']).toBe(false);
    expect(readCommittedFile).toHaveBeenCalledTimes(5);
    for (const [, commit] of readCommittedFile.mock.calls) expect(commit).toBe(HEAD_A);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.identity)).toBe(true);
    expect(Object.isFrozen(result.owner)).toBe(true);
    expect(Object.isFrozen(result.files)).toBe(true);
  });

  it('exposes the five fixed pinned asset paths', () => {
    expect(CALIBRATION_BOOTSTRAP_ASSET_PATHS).toEqual({
      'public-manifest': 'functions/eval/nutrition/public-manifest.json',
      'source-lock': 'functions/eval/nutrition/calibration-source-lock.json',
      'calibration-manifest': 'functions/eval/nutrition/calibration-manifest.json',
      'off-lock': 'functions/eval/nutrition/off-snapshot-lock.json',
      'historical-reference': 'functions/eval/nutrition/historical-reference-v1.json',
    });
  });
});

describe('calibration bootstrap deps validation', () => {
  it.each([
    ['undefined deps', undefined],
    ['null deps', null],
    ['array deps', []],
    ['missing readGitState', { without: 'readGitState' }],
    ['missing readCommittedFile', { without: 'readCommittedFile' }],
    ['missing readOwner', { without: 'readOwner' }],
    ['missing baseDir', { without: 'baseDir' }],
    ['relative baseDir', { baseDir: 'relative/fixture' }],
    ['blank baseDir', { baseDir: '   ' }],
    ['non-function readGitState', { readGitState: 'not-a-function' }],
    ['non-function readCommittedFile', { readCommittedFile: 42 }],
    ['non-function readOwner', { readOwner: null }],
  ])('rejects %s before any reader effects', async (_label, shape) => {
    const full = makeDeps();
    let deps: unknown = shape;
    if (
      shape !== undefined &&
      shape !== null &&
      typeof shape === 'object' &&
      !Array.isArray(shape) &&
      'without' in (shape as Record<string, unknown>)
    ) {
      const { without } = shape as { without: string };
      const cloned: Record<string, unknown> = { ...full };
      delete cloned[without];
      deps = cloned;
    } else if (
      shape !== undefined &&
      shape !== null &&
      typeof shape === 'object' &&
      !Array.isArray(shape) &&
      ('baseDir' in (shape as Record<string, unknown>) ||
        'readGitState' in (shape as Record<string, unknown>) ||
        'readCommittedFile' in (shape as Record<string, unknown>) ||
        'readOwner' in (shape as Record<string, unknown>))
    ) {
      deps = { ...full, ...(shape as Record<string, unknown>) };
    }
    const bag =
      deps === null || deps === undefined
        ? ({} as Record<string, unknown>)
        : (deps as unknown as Record<string, unknown>);
    const readGitState = bag['readGitState'] as ReturnType<typeof vi.fn> | undefined;
    const readCommittedFile = bag['readCommittedFile'] as ReturnType<typeof vi.fn> | undefined;
    const readOwner = bag['readOwner'] as ReturnType<typeof vi.fn> | undefined;
    const { error } = await captureError(deps);
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect((error as CalibrationFatalError).cause).toBeUndefined();
    if (typeof readGitState === 'function' && typeof (readGitState as unknown as { mock?: unknown }).mock === 'object') {
      expect((readGitState as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
    }
    if (
      typeof readCommittedFile === 'function' &&
      typeof (readCommittedFile as unknown as { mock?: unknown }).mock === 'object'
    ) {
      expect((readCommittedFile as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
    }
    if (typeof readOwner === 'function' && typeof (readOwner as unknown as { mock?: unknown }).mock === 'object') {
      expect((readOwner as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
    }
    expect(full.readGitState).not.toHaveBeenCalled();
  });
});

describe('calibration bootstrap git dirt boundary', () => {
  it.each([
    ['tracked functions file', ['functions/src/nutrition-eval/cli.ts']],
    ['tracked nested eval file', ['functions/eval/nutrition/public-manifest.json']],
    ['untracked functions file', ['functions/new-scratch-file.txt']],
    ['mixed tracked and untracked', ['functions/src/index.ts', 'functions/untracked-notes.txt']],
    ['filename with spaces', ['functions/eval/nutrition/space name fixture.txt']],
  ])('blocks dirty %s before file/owner reads', async (_label, dirtyPaths) => {
    const deps = makeDeps({ readGitState: vi.fn(() => makeGitState({ dirtyPaths })) });
    const { error } = await captureError(deps);
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect(deps.readCommittedFile).not.toHaveBeenCalled();
    expect(deps.readOwner).not.toHaveBeenCalled();
  });

  it('accepts an unrelated root .mcp.json change', async () => {
    const deps = makeDeps({ readGitState: vi.fn(() => makeGitState({ dirtyPaths: ['.mcp.json'] })) });
    const result = (await (
      prepareCalibrationBootstrapContext as unknown as (d: unknown) => Promise<{
        firstDevelopmentCaseId: string;
      }>
    )(deps)) as { firstDevelopmentCaseId: string };
    expect(result.firstDevelopmentCaseId).toBe(FIRST_DEV_CASE_ID);
    expect(deps.readCommittedFile).toHaveBeenCalledTimes(5);
  });

  it.each([
    ['root docs only', ['docs/notes.md']],
    ['root config only', ['package.json']],
    ['root mcp plus docs', ['.mcp.json', 'README.md']],
  ])('accepts unrelated non-functions dirt %s', async (_label, dirtyPaths) => {
    const deps = makeDeps({ readGitState: vi.fn(() => makeGitState({ dirtyPaths })) });
    const result = (await (
      prepareCalibrationBootstrapContext as unknown as (d: unknown) => Promise<{
        firstDevelopmentCaseId: string;
      }>
    )(deps)) as { firstDevelopmentCaseId: string };
    expect(result.firstDevelopmentCaseId).toBe(FIRST_DEV_CASE_ID);
  });
});

describe('calibration bootstrap git identity shapes', () => {
  it.each([
    ['uppercase head', { headCommit: HEAD_A.toUpperCase() }],
    ['short head', { headCommit: 'abc123' }],
    ['empty head', { headCommit: '' }],
    ['non-string head', { headCommit: 42 }],
    ['uppercase tree', { functionsTreeId: TREE_C.toUpperCase() }],
    ['short tree', { functionsTreeId: 'deadbeef' }],
    ['uppercase implementation', { implementationCommit: IMPL_B.toUpperCase() }],
    ['short implementation', { implementationCommit: 'b'.repeat(39) }],
    ['41-char implementation', { implementationCommit: 'b'.repeat(41) }],
    ['non-hex implementation', { implementationCommit: 'z'.repeat(40) }],
    ['missing tree', { functionsTreeId: undefined }],
    ['missing implementation', { implementationCommit: undefined }],
    ['dirtyPaths as string', { dirtyPaths: 'functions/dirty.ts' }],
    ['dirtyPaths with non-string entry', { dirtyPaths: ['functions/a.ts', 42] }],
    ['dirtyPaths with blank entry', { dirtyPaths: [''] }],
    ['dirtyPaths null', { dirtyPaths: null }],
  ])('rejects malformed git state %s before file/owner reads', async (_label, patch) => {
    const gitState = { ...makeGitState(), ...patch };
    const deps = makeDeps({ readGitState: vi.fn(() => gitState) });
    const { error } = await captureError(deps);
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect(deps.readCommittedFile).not.toHaveBeenCalled();
    expect(deps.readOwner).not.toHaveBeenCalled();
  });
});

describe('calibration bootstrap committed assets', () => {
  const assetKeys: FixtureAssetKey[] = [
    'public-manifest',
    'source-lock',
    'calibration-manifest',
    'off-lock',
    'historical-reference',
  ];
  it.each(assetKeys.map((key) => [key]))(
    'rejects tampered %s before owner read',
    async (key) => {
      const typedKey = key as FixtureAssetKey;
      const deps = makeDeps();
      deps.readCommittedFile = makeCommittedReader({ [typedKey]: '{"tampered":true}' });
      const { error } = await captureError(deps);
      expect(error).toBeInstanceOf(CalibrationFatalError);
      expect(deps.readOwner).not.toHaveBeenCalled();
    },
  );

  it.each(assetKeys.map((key) => [key]))(
    'rejects missing %s before owner read',
    async (key) => {
      const typedKey = key as FixtureAssetKey;
      const deps = makeDeps();
      const reader = vi.fn((path: string, commit: string) => {
        void commit;
        const repoPath = FIXTURE_REPO_PATHS[typedKey];
        if (path === repoPath) throw new Error(`missing ${typedKey}`);
        const match = (Object.entries(FIXTURE_REPO_PATHS) as Array<[FixtureAssetKey, string]>).find(
          ([, p]) => p === path,
        );
        if (match === undefined) throw new Error('unexpected path');
        return readRealAsset(match[0]);
      });
      deps.readCommittedFile = reader;
      const { error } = await captureError(deps);
      expect(error).toBeInstanceOf(CalibrationFatalError);
      expect(deps.readOwner).not.toHaveBeenCalled();
    },
  );

  it('rejects malformed public-manifest JSON before owner read', async () => {
    const deps = makeDeps();
    deps.readCommittedFile = makeCommittedReader({ 'public-manifest': 'not-json{' });
    const { error } = await captureError(deps);
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect(deps.readOwner).not.toHaveBeenCalled();
  });
});

describe('calibration bootstrap foreign failure privacy', () => {
  it('drops secret-bearing git failures without cause or sentinel', async () => {
    const deps = makeDeps({
      readGitState: vi.fn(() => {
        throw new Error(`git blew up ${SECRET_SENTINEL} /private/repo/path`);
      }),
    });
    const { error } = await captureError(deps);
    expectFatalWithoutSentinel(error, SECRET_SENTINEL);
    expect(deps.readCommittedFile).not.toHaveBeenCalled();
    expect(deps.readOwner).not.toHaveBeenCalled();
  });

  it('drops secret-bearing file failures without cause or sentinel', async () => {
    const deps = makeDeps({
      readCommittedFile: vi.fn(() => {
        throw new Error(`file leaked ${SECRET_SENTINEL} git show private-bytes`);
      }),
    });
    const { error } = await captureError(deps);
    expectFatalWithoutSentinel(error, SECRET_SENTINEL);
    expect(deps.readOwner).not.toHaveBeenCalled();
  });

  it('drops secret-bearing owner failures without cause or sentinel', async () => {
    const deps = makeDeps({
      readOwner: vi.fn(() => {
        throw new Error(`owner leaked ${SECRET_SENTINEL} /proc/999/stat`);
      }),
    });
    const { error } = await captureError(deps);
    expectFatalWithoutSentinel(error, SECRET_SENTINEL);
  });

  it('keeps fixed verifier failures causeless with no injected sentinel', async () => {
    const injectedSentinel = `INJECTED-${SECRET_SENTINEL}`;
    const deps = makeDeps();
    deps.readCommittedFile = makeCommittedReader({ 'source-lock': injectedSentinel });
    const { error } = await captureError(deps);
    expectFatalWithoutSentinel(error, injectedSentinel);
    expect(deps.readOwner).not.toHaveBeenCalled();
  });
});

describe('calibration bootstrap foreign fatal privacy', () => {
  it.each([
    ['readGitState', 'readGitState'],
    ['readCommittedFile', 'readCommittedFile'],
    ['readOwner', 'readOwner'],
  ])('sanitizes secret-bearing CalibrationFatalError from %s with private cause', async (_label, reader) => {
    const privateCause = new Error(`private bytes ${SECRET_SENTINEL} /private/repo/path`);
    const foreign = new CalibrationFatalError(`foreign wrapper ${SECRET_SENTINEL}`, {
      cause: privateCause,
    });
    expect(inspect(foreign, { depth: null })).toContain(SECRET_SENTINEL);
    const deps = makeDeps({
      [reader]: vi.fn(() => {
        throw foreign;
      }),
    });
    const { error } = await captureError(deps);
    expect(error).not.toBe(foreign);
    expectFatalWithoutSentinel(error, SECRET_SENTINEL);
    if (reader === 'readGitState') {
      expect(deps.readCommittedFile).not.toHaveBeenCalled();
      expect(deps.readOwner).not.toHaveBeenCalled();
    }
    if (reader === 'readCommittedFile') {
      expect(deps.readOwner).not.toHaveBeenCalled();
    }
  });
});

describe('calibration bootstrap owner validation', () => {
  it.each([
    ['blank hostname', { hostname: '   ' }],
    ['empty hostname', { hostname: '' }],
    ['non-string hostname', { hostname: 42 }],
    ['blank bootId', { bootId: '  ' }],
    ['empty bootId', { bootId: '' }],
    ['zero pid', { pid: 0 }],
    ['negative pid', { pid: -3 }],
    ['fractional pid', { pid: 1.5 }],
    ['non-number pid', { pid: '123' }],
    ['zero startTicks', { startTicks: 0 }],
    ['negative startTicks', { startTicks: -1 }],
    ['fractional startTicks', { startTicks: 2.5 }],
    ['non-number startTicks', { startTicks: '42' }],
    ['blank acquiredAt', { acquiredAt: '   ' }],
    ['non-canonical acquiredAt', { acquiredAt: '2026-10-05 00:00:00' }],
    ['invalid acquiredAt', { acquiredAt: 'not-a-time' }],
    ['missing acquiredAt', { acquiredAt: undefined }],
  ])('rejects invalid owner %s without returning context', async (_label, patch) => {
    const deps = makeDeps({ readOwner: vi.fn(() => ({ ...makeOwner(), ...patch })) });
    const { error } = await captureError(deps);
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect((error as CalibrationFatalError).cause).toBeUndefined();
  });

  it('reads the owner only after assets pass', async () => {
    const order: string[] = [];
    const deps = makeDeps();
    deps.readCommittedFile = makeCommittedReader({}, () => {
      order.push('file');
    });
    const originalOwner = deps.readOwner;
    deps.readOwner = vi.fn(() => {
      order.push('owner');
      return (originalOwner as ReturnType<typeof vi.fn>)();
    });
    await (prepareCalibrationBootstrapContext as unknown as (d: unknown) => Promise<unknown>)(deps);
    expect(order[0]).toBe('file');
    expect(order[order.length - 1]).toBe('owner');
    expect(deps.readCommittedFile).toHaveBeenCalledTimes(5);
    expect(deps.readOwner).toHaveBeenCalledTimes(1);
  });
});

describe('calibration bootstrap owner numeric bounds', () => {
  it.each([
    ['pid above MAX_SAFE_INTEGER', { pid: Number.MAX_SAFE_INTEGER + 1 }],
    ['startTicks above MAX_SAFE_INTEGER', { startTicks: Number.MAX_SAFE_INTEGER + 1 }],
    ['pid NaN', { pid: Number.NaN }],
    ['startTicks NaN', { startTicks: Number.NaN }],
    ['pid Infinity', { pid: Number.POSITIVE_INFINITY }],
    ['startTicks Infinity', { startTicks: Number.POSITIVE_INFINITY }],
    ['pid -Infinity', { pid: Number.NEGATIVE_INFINITY }],
    ['startTicks -Infinity', { startTicks: Number.NEGATIVE_INFINITY }],
  ])('rejects invalid owner %s without returning context', async (_label, patch) => {
    const deps = makeDeps({ readOwner: vi.fn(() => ({ ...makeOwner(), ...patch })) });
    const { error } = await captureError(deps);
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect((error as CalibrationFatalError).cause).toBeUndefined();
  });
});

describe('calibration bootstrap second-read identity', () => {
  it('rejects second-read functions tree drift', async () => {
    const first = makeGitState();
    const second = makeGitState({ functionsTreeId: 'd'.repeat(40) });
    const readGitState = vi
      .fn()
      .mockReturnValueOnce({ ...first })
      .mockReturnValue({ ...second });
    const deps = makeDeps({ readGitState });
    const { error } = await captureError(deps);
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect(readGitState.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects second-read implementation-commit drift', async () => {
    const first = makeGitState();
    const second = makeGitState({ implementationCommit: 'd'.repeat(40) });
    const readGitState = vi
      .fn()
      .mockReturnValueOnce({ ...first })
      .mockReturnValue({ ...second });
    const deps = makeDeps({ readGitState });
    const { error } = await captureError(deps);
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect(readGitState.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects newly dirty functions tree on second read', async () => {
    const first = makeGitState();
    const second = makeGitState({ dirtyPaths: ['functions/src/nutrition-eval/cli.ts'] });
    const readGitState = vi
      .fn()
      .mockReturnValueOnce({ ...first })
      .mockReturnValue({ ...second });
    const deps = makeDeps({ readGitState });
    const { error } = await captureError(deps);
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect(readGitState.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('accepts docs-only second HEAD movement with stable tree and implementation', async () => {
    const first = makeGitState();
    const second = makeGitState({ headCommit: 'd'.repeat(40) });
    const readGitState = vi
      .fn()
      .mockReturnValueOnce({ ...first })
      .mockReturnValue({ ...second });
    const deps = makeDeps({ readGitState });
    const result = (await (
      prepareCalibrationBootstrapContext as unknown as (d: unknown) => Promise<{
        firstDevelopmentCaseId: string;
        identity: Record<string, unknown>;
      }>
    )(deps)) as { firstDevelopmentCaseId: string; identity: Record<string, unknown> };
    expect(result.firstDevelopmentCaseId).toBe(FIRST_DEV_CASE_ID);
    expect(result.identity['implementationCommit']).toBe(IMPL_B);
    expect(result.identity['functionsTreeId']).toBe(TREE_C);
    expect(readGitState.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe('calibration bootstrap frozen output', () => {
  it('caller mutations of returned identity/owner/report/files cannot change prepared values', async () => {
    const deps = makeDeps();
    const result = (await (
      prepareCalibrationBootstrapContext as unknown as (d: unknown) => Promise<{
        identity: Record<string, unknown>;
        owner: Record<string, unknown>;
        report: Record<string, unknown>;
        files: Record<string, string>;
        firstDevelopmentCaseId: string;
      }>
    )(deps)) as {
      identity: Record<string, unknown>;
      owner: Record<string, unknown>;
      report: Record<string, unknown>;
      files: Record<string, string>;
      firstDevelopmentCaseId: string;
    };
    const identityBefore = { ...result.identity };
    const ownerBefore = { ...result.owner };
    const reportBefore = { ...result.report };
    const filesBefore = { ...result.files };
    try {
      (result.identity as Record<string, unknown>)['model'] = 'mutated-model';
    } catch {
      // frozen assignment throws in strict mode; the value must still be pinned
    }
    try {
      (result.owner as Record<string, unknown>)['hostname'] = 'mutated-host';
    } catch {
      // frozen assignment throws in strict mode
    }
    try {
      (result.report as Record<string, unknown>)['historicalCompatible'] = true;
    } catch {
      // frozen assignment throws in strict mode
    }
    try {
      (result.files as Record<string, string>)['public-manifest'] = 'mutated';
    } catch {
      // frozen assignment throws in strict mode
    }
    expect(result.identity).toEqual(identityBefore);
    expect(result.owner).toEqual(ownerBefore);
    expect(result.report).toEqual(reportBefore);
    expect(result.files).toEqual(filesBefore);
    expect(result.identity['model']).toBe('gemini-3.8-flash');
    expect(result.report['historicalCompatible']).toBe(false);
  });
});

describe('calibration bootstrap caller isolation', () => {
  it('clones caller owner/git, leaves callers unfrozen, freezes notes, survives caller mutation', async () => {
    const callerGit = makeGitState();
    const callerOwner = makeOwner();
    const deps = {
      baseDir: '/tmp/calorix-bootstrap-fixture',
      readGitState: vi.fn(() => callerGit),
      readCommittedFile: makeCommittedReader(),
      readOwner: vi.fn(() => callerOwner),
    };
    const result = (await (
      prepareCalibrationBootstrapContext as unknown as (d: unknown) => Promise<{
        identity: Record<string, unknown>;
        owner: Record<string, unknown>;
        report: Record<string, unknown>;
        firstDevelopmentCaseId: string;
      }>
    )(deps)) as {
      identity: Record<string, unknown>;
      owner: Record<string, unknown>;
      report: Record<string, unknown>;
      firstDevelopmentCaseId: string;
    };
    expect(result.firstDevelopmentCaseId).toBe(FIRST_DEV_CASE_ID);
    expect(result.identity['implementationCommit']).toBe(callerGit.implementationCommit);
    expect(result.identity['functionsTreeId']).toBe(callerGit.functionsTreeId);
    expect(result.owner).toEqual(callerOwner);
    expect(result.owner).not.toBe(callerOwner as unknown as Record<string, unknown>);
    expect(Object.isFrozen(callerOwner)).toBe(false);
    expect(Object.isFrozen(callerGit)).toBe(false);
    expect(Object.isFrozen(result.owner)).toBe(true);
    expect(Object.isFrozen(result.report)).toBe(true);
    expect(Array.isArray(result.report['compatibilityNotes'])).toBe(true);
    const notes = result.report['compatibilityNotes'] as unknown[];
    expect(Object.isFrozen(notes)).toBe(true);
    for (const note of notes) expect(Object.isFrozen(note)).toBe(true);
    callerOwner.hostname = 'mutated-after-return';
    callerOwner.pid = 999999;
    expect(result.owner['hostname']).toBe('fixture-host');
    expect(result.owner['pid']).toBe(123);
    expect(result.owner).toEqual(makeOwner());
  });
});

describe('calibration bootstrap git snapshot isolation', () => {
  it('clones the first git snapshot before file reads', async () => {
    const sharedFirst = makeGitState();
    const cleanSecond = makeGitState();
    const readGitState = vi
      .fn()
      .mockReturnValueOnce(sharedFirst)
      .mockReturnValue({ ...cleanSecond, dirtyPaths: [...cleanSecond.dirtyPaths] });
    const baseReader = makeCommittedReader();
    const readCommittedFile = vi.fn((path: string, commit: string) => {
      if (baseReader.mock.calls.length === 0) {
        sharedFirst.functionsTreeId = 'd'.repeat(40);
        sharedFirst.implementationCommit = 'e'.repeat(40);
      }
      return (baseReader as unknown as (p: string, c: string) => string)(path, commit);
    });
    const deps = { ...makeDeps(), readGitState, readCommittedFile };
    const result = (await (
      prepareCalibrationBootstrapContext as unknown as (d: unknown) => Promise<{
        firstDevelopmentCaseId: string;
        identity: Record<string, unknown>;
      }>
    )(deps)) as { firstDevelopmentCaseId: string; identity: Record<string, unknown> };
    expect(result.firstDevelopmentCaseId).toBe(FIRST_DEV_CASE_ID);
    expect(result.identity['functionsTreeId']).toBe(TREE_C);
    expect(result.identity['implementationCommit']).toBe(IMPL_B);
  });
});

// ── Native readers (owned temporary Git repositories only) ───────────────────
// Every repo below lives under `os.tmpdir()` and is removed in `afterEach`.
// Commits here use local `-c` fixture author identity inside the owned temp
// directory and never touch the actual Calorix checkout.

const ownedTempRoots: string[] = [];

afterEach(() => {
  while (ownedTempRoots.length > 0) {
    const root = ownedTempRoots.pop() as string;
    rmSync(root, { recursive: true, force: true });
  }
});

function git(root: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 10000,
    maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }) as unknown as string;
}

function makeOwnedRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'calorix-bootstrap-native-'));
  ownedTempRoots.push(root);
  return root;
}

function seedOwnedRepo(root: string): void {
  for (const key of Object.keys(FIXTURE_REPO_PATHS) as FixtureAssetKey[]) {
    const dest = join(root, FIXTURE_REPO_PATHS[key]);
    mkdirSync(join(dest, '..'), { recursive: true });
    writeFileSync(dest, readRealAsset(key), 'utf8');
  }
}

function commitOwnedRepo(root: string, message: string): void {
  git(root, ['init']);
  git(root, ['add', 'functions']);
  git(root, [
    '-c',
    'user.name=fixture-author',
    '-c',
    'user.email=fixture-author@example.com',
    'commit',
    '-m',
    message,
  ]);
}

function initOwnedRepoWithAssets(message = 'fixture assets'): string {
  const root = makeOwnedRepo();
  seedOwnedRepo(root);
  commitOwnedRepo(root, message);
  return root;
}

describe('calibration bootstrap native readers', () => {
  it('derives head/tree/implementation commits from the owned repository', () => {
    const root = initOwnedRepoWithAssets();
    const deps = (
      createCalibrationBootstrapReadDeps as unknown as (r?: string) => {
        baseDir: string;
        readGitState: () => {
          headCommit: string;
          implementationCommit: string;
          functionsTreeId: string;
          dirtyPaths: string[];
        };
      }
    )(root);
    expect(deps.baseDir).toBe(root);
    const state = deps.readGitState();
    const head = git(root, ['rev-parse', 'HEAD']).trim();
    const tree = git(root, ['rev-parse', `${head}:functions`]).trim();
    const impl = git(root, ['log', '-1', '--format=%H', head, '--', 'functions']).trim();
    expect(state.headCommit).toBe(head);
    expect(state.functionsTreeId).toBe(tree);
    expect(state.implementationCommit).toBe(impl);
    expect(state.dirtyPaths).toEqual([]);
  });

  it('reads original committed bytes despite an edited working file', () => {
    const root = initOwnedRepoWithAssets();
    const deps = (
      createCalibrationBootstrapReadDeps as unknown as (r?: string) => {
        readGitState: () => { headCommit: string };
        readCommittedFile: (path: string, commit: string) => string;
      }
    )(root);
    const committed = deps.readGitState().headCommit;
    const assetPath = FIXTURE_REPO_PATHS['public-manifest'];
    const original = readFileSync(join(root, assetPath), 'utf8');
    writeFileSync(join(root, assetPath), '{"edited":true}', 'utf8');
    expect(deps.readCommittedFile(assetPath, committed)).toBe(original);
  });

  it('reports NUL-delimited tracked/untracked status including filenames with spaces', () => {
    const root = initOwnedRepoWithAssets();
    const deps = (
      createCalibrationBootstrapReadDeps as unknown as (r?: string) => {
        readGitState: () => { dirtyPaths: string[] };
      }
    )(root);
    const spaced = join(root, 'functions', 'eval', 'nutrition', 'space name fixture.txt');
    writeFileSync(spaced, 'untracked fixture', 'utf8');
    const tracked = join(root, FIXTURE_REPO_PATHS['off-lock']);
    writeFileSync(tracked, `${readFileSync(tracked, 'utf8')}\n`, 'utf8');
    const state = deps.readGitState();
    expect(state.dirtyPaths.some((p) => p.includes('space name fixture.txt'))).toBe(true);
    expect(state.dirtyPaths.some((p) => p.includes('off-snapshot-lock.json'))).toBe(true);
  });

  it('excludes root .mcp.json changes from functions dirt', () => {
    const root = initOwnedRepoWithAssets();
    writeFileSync(join(root, '.mcp.json'), '{"fixture":true}', 'utf8');
    const deps = (
      createCalibrationBootstrapReadDeps as unknown as (r?: string) => {
        readGitState: () => { dirtyPaths: string[] };
      }
    )(root);
    expect(deps.readGitState().dirtyPaths).toEqual([]);
  });

  it('keeps latest-functions-commit stable across a docs-only commit', () => {
    const root = initOwnedRepoWithAssets();
    const deps = (
      createCalibrationBootstrapReadDeps as unknown as (r?: string) => {
        readGitState: () => { headCommit: string; implementationCommit: string };
      }
    )(root);
    const before = deps.readGitState();
    mkdirSync(join(root, 'docs'), { recursive: true });
    writeFileSync(join(root, 'docs', 'note.md'), '# fixture note\n', 'utf8');
    git(root, ['add', 'docs']);
    git(root, [
      '-c',
      'user.name=fixture-author',
      '-c',
      'user.email=fixture-author@example.com',
      'commit',
      '-m',
      'docs only',
    ]);
    const after = deps.readGitState();
    expect(after.headCommit).not.toBe(before.headCommit);
    expect(after.implementationCommit).toBe(before.implementationCommit);
  });

  it('derives a native owner for the current process without secrets', () => {
    const root = initOwnedRepoWithAssets();
    const deps = (
      createCalibrationBootstrapReadDeps as unknown as (r?: string) => {
        readOwner: () => {
          hostname: string;
          bootId: string;
          pid: number;
          startTicks: number;
          acquiredAt: string;
        };
      }
    )(root);
    const owner = deps.readOwner();
    expect(owner.hostname.trim().length).toBeGreaterThan(0);
    expect(owner.bootId.trim().length).toBeGreaterThan(0);
    expect(owner.pid).toBe(process.pid);
    expect(Number.isInteger(owner.startTicks)).toBe(true);
    expect(owner.startTicks).toBeGreaterThan(0);
    expect(new Date(owner.acquiredAt).toISOString()).toBe(owner.acquiredAt);
  });

  it('returns callable readers for a nonexistent absolute temp child without creating it', () => {
    const parent = makeOwnedRepo();
    const absentChild = join(parent, `absent-child-${Date.now()}`);
    expect(absentChild.startsWith(tmpdir())).toBe(true);
    expect(existsSync(absentChild)).toBe(false);
    const deps = (
      createCalibrationBootstrapReadDeps as unknown as (r?: string) => {
        baseDir: string;
        readGitState: () => unknown;
        readCommittedFile: (path: string, commit: string) => string;
        readOwner: () => unknown;
      }
    )(absentChild);
    expect(deps.baseDir).toBe(absentChild);
    expect(typeof deps.readGitState).toBe('function');
    expect(typeof deps.readCommittedFile).toBe('function');
    expect(typeof deps.readOwner).toBe('function');
    expect(existsSync(absentChild)).toBe(false);
  });

  it('parses porcelain -z renames with both original and spaced new paths', () => {
    const root = initOwnedRepoWithAssets();
    const original = FIXTURE_REPO_PATHS['source-lock'];
    const renamed = 'functions/eval/nutrition/space renamed lock.json';
    git(root, ['mv', original, renamed]);
    const deps = (
      createCalibrationBootstrapReadDeps as unknown as (r?: string) => {
        readGitState: () => { dirtyPaths: string[] };
      }
    )(root);
    const state = deps.readGitState();
    expect(state.dirtyPaths).toEqual(expect.arrayContaining([original, renamed]));
  });

  it('rejects off-allowlist paths and malformed commits without needing git access', () => {
    const parent = makeOwnedRepo();
    const absentRoot = join(parent, `absent-validate-${Date.now()}`);
    expect(existsSync(absentRoot)).toBe(false);
    const deps = (
      createCalibrationBootstrapReadDeps as unknown as (r?: string) => {
        readCommittedFile: (path: string, commit: string) => string;
      }
    )(absentRoot);
    const offAllowlist = [
      'functions/eval/nutrition/evil.json',
      'functions/src/index.ts',
      '/etc/passwd',
      '',
      'functions/eval/nutrition/../evil.json',
    ];
    for (const badPath of offAllowlist) {
      let thrown: unknown;
      try {
        deps.readCommittedFile(badPath, HEAD_A);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(CalibrationFatalError);
      expect((thrown as CalibrationFatalError).cause).toBeUndefined();
      expect(Object.getOwnPropertyNames(thrown as object)).not.toContain('cause');
    }
    const goodPath = FIXTURE_REPO_PATHS['public-manifest'];
    const malformedCommits = [
      '',
      'abc123',
      HEAD_A.toUpperCase(),
      'z'.repeat(40),
      'b'.repeat(39),
      'b'.repeat(41),
    ];
    for (const badCommit of malformedCommits) {
      let thrown: unknown;
      try {
        deps.readCommittedFile(goodPath, badCommit);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(CalibrationFatalError);
      expect((thrown as CalibrationFatalError).cause).toBeUndefined();
      expect(Object.getOwnPropertyNames(thrown as object)).not.toContain('cause');
    }
    expect(existsSync(absentRoot)).toBe(false);
  });
});

describe('calibration bootstrap iteration privacy', () => {
  it('iteration privacy drops secret-bearing index getter without file/owner reads', async () => {
    const dirty: string[] = ['outside.txt'];
    Object.defineProperty(dirty, '0', {
      get(): string {
        throw new Error(`getter boom ${SECRET_SENTINEL} /private/repo/path`);
      },
      enumerable: true,
      configurable: true,
    });
    const deps = makeDeps({ readGitState: vi.fn(() => makeGitState({ dirtyPaths: dirty })) });
    const { error } = await captureError(deps);
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expectFatalWithoutSentinel(error, SECRET_SENTINEL);
    expect(deps.readCommittedFile).not.toHaveBeenCalled();
    expect(deps.readOwner).not.toHaveBeenCalled();
  });

  it('iteration privacy drops secret-bearing iterator fatal with private cause', async () => {
    const privateCause = new Error(`private bytes ${SECRET_SENTINEL} /private/repo/path`);
    const foreign = new CalibrationFatalError(`foreign wrapper ${SECRET_SENTINEL}`, {
      cause: privateCause,
    });
    expect(inspect(foreign, { depth: null })).toContain(SECRET_SENTINEL);
    const dirty: string[] = ['functions/dirty.ts'];
    let iteratorInvoked = false;
    Object.defineProperty(dirty, Symbol.iterator, {
      value: (): IterableIterator<string> => {
        iteratorInvoked = true;
        throw foreign;
      },
      configurable: true,
      writable: true,
    });
    const deps = makeDeps({ readGitState: vi.fn(() => makeGitState({ dirtyPaths: dirty })) });
    const { error } = await captureError(deps);
    expect(error).not.toBe(foreign);
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expectFatalWithoutSentinel(error, SECRET_SENTINEL);
    expect(deps.readCommittedFile).not.toHaveBeenCalled();
    expect(deps.readOwner).not.toHaveBeenCalled();
    expect(iteratorInvoked).toBe(false);
  });

  it('iteration privacy rejects hidden functions dirt when iterator yields nothing', async () => {
    const dirty: string[] = ['functions/dirty.ts'];
    Object.defineProperty(dirty, Symbol.iterator, {
      value: (): IterableIterator<string> => ([] as string[])[Symbol.iterator](),
      configurable: true,
      writable: true,
    });
    const deps = makeDeps({ readGitState: vi.fn(() => makeGitState({ dirtyPaths: dirty })) });
    const { error } = await captureError(deps);
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect(deps.readCommittedFile).not.toHaveBeenCalled();
    expect(deps.readOwner).not.toHaveBeenCalled();
  });
});

describe('calibration bootstrap native malformed status', () => {
  it.each([
    ['non-NUL terminated', ' M functions/x.ts'],
    ['unknown XY', 'XX functions/x.ts\0'],
    ['empty-status XY', '   functions/x.ts\0'],
    ['rename missing original', 'R  functions/x.ts\0'],
  ])('malformed status %s throws bootstrap-git-failed without real git', async (_label, row) => {
    const parent = makeOwnedRepo();
    const absentChild = join(parent, `absent-malformed-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    expect(absentChild.startsWith(tmpdir())).toBe(true);
    expect(existsSync(absentChild)).toBe(false);
    let revHeadHits = 0;
    let revTreeHits = 0;
    let logHits = 0;
    let statusHits = 0;
    execFileMockState.calls.length = 0;
    execFileMockState.override = (...callArgs: unknown[]) => {
      const file = callArgs[0] as string;
      const args = callArgs[1] as readonly string[] | undefined;
      if (file !== 'git' || !Array.isArray(args)) throw new Error('unexpected exec');
      if (args[0] === 'rev-parse' && args[1] === 'HEAD') {
        revHeadHits += 1;
        return `${HEAD_A}\n`;
      }
      if (args[0] === 'rev-parse' && typeof args[1] === 'string' && args[1].endsWith(':functions')) {
        revTreeHits += 1;
        return `${TREE_C}\n`;
      }
      if (args[0] === 'log') {
        logHits += 1;
        return `${IMPL_B}\n`;
      }
      if (args[0] === 'status') {
        statusHits += 1;
        return row;
      }
      throw new Error(`unexpected git args ${args.join(' ')}`);
    };
    try {
      const deps = (
        createCalibrationBootstrapReadDeps as unknown as (r?: string) => {
          readGitState: () => unknown;
        }
      )(absentChild);
      let thrown: unknown;
      try {
        deps.readGitState();
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(CalibrationFatalError);
      expect((thrown as CalibrationFatalError).message).toBe('calibration:bootstrap-git-failed');
      expect((thrown as CalibrationFatalError).cause).toBeUndefined();
      expect(Object.getOwnPropertyNames(thrown as object)).not.toContain('cause');
      expect(statusHits).toBeGreaterThan(0);
      expect(
        execFileMockState.calls.some((call) => Array.isArray(call[1]) && (call[1] as string[])[0] === 'status'),
      ).toBe(true);
      expect(revHeadHits).toBeGreaterThan(0);
      expect(revTreeHits).toBeGreaterThan(0);
      expect(logHits).toBeGreaterThan(0);
      expect(existsSync(absentChild)).toBe(false);
    } finally {
      execFileMockState.override = null;
    }
  });
});
