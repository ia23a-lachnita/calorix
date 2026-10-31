/**
 * Calibration v2 native bootstrap composition contract.
 *
 * `createCalibrationV2BootstrapReadDeps` composes exactly five read ports:
 * native Git/owner/committed-asset readers reused from
 * `calibration-bootstrap.ts`, plus a native admission reader delegating
 * exactly to `readNativeCalibrationV2AdmissionInput`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import fsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';
import { resolveNutritionEvalRuntimePaths } from '../../src/nutrition-eval/cli';
import { requireCalibrationV2Context } from '../../src/nutrition-eval/calibration-protocol-bindings';
import type { CalibrationV2SharedAssetPath } from '../../src/nutrition-eval/calibration-protocol-bindings';
import { v2BootstrapFixture } from './helpers/calibration-v2-bootstrap-fixtures';
import {
  createCalibrationV2BootstrapReadDeps,
  prepareCalibrationV2BootstrapContext,
} from '../../src/nutrition-eval/calibration-v2-bootstrap';
import type { CalibrationV2BootstrapReadDeps } from '../../src/nutrition-eval/calibration-v2-bootstrap';

const trust = vi.hoisted(() => ({ sha: '', clients: 0, network: 0, writes: 0 }));
const nativeInput = vi.hoisted(() => ({
  calls: [] as string[],
  impl: null as ((root: string) => Promise<unknown>) | null,
}));
const execFileCalls = vi.hoisted(() => [] as unknown[][]);
const fsSyncGuard = vi.hoisted(() => ({ readFileSyncCalls: 0 }));

vi.mock('node:fs', async original => {
  const actual = await original<typeof import('node:fs')>();
  return {
    ...actual,
    readFileSync: ((...args: unknown[]) => {
      fsSyncGuard.readFileSyncCalls++;
      return (actual.readFileSync as (...values: unknown[]) => unknown)(...args);
    }) as typeof actual.readFileSync,
  };
});
vi.mock('node:child_process', async original => {
  const actual = await original<typeof import('node:child_process')>();
  return {
    ...actual,
    execFileSync: ((...args: unknown[]) => {
      execFileCalls.push(args);
      return (actual.execFileSync as (...values: unknown[]) => unknown)(...args);
    }) as typeof actual.execFileSync,
  };
});
vi.mock('../../src/nutrition-eval/calibration-v2-lock', async original => ({
  ...await original<typeof import('../../src/nutrition-eval/calibration-v2-lock')>(),
  get CALIBRATION_ACTIVATION_LOCK_V2_SHA256() { return trust.sha; },
}));
vi.mock('../../src/nutrition-eval/calibration-v2-inputs', async original => {
  const actual = await original<typeof import('../../src/nutrition-eval/calibration-v2-inputs')>();
  return {
    ...actual,
    readNativeCalibrationV2AdmissionInput: ((root: string) => {
      nativeInput.calls.push(root);
      if (nativeInput.impl === null) return Promise.reject(new Error('no native input seam configured'));
      return nativeInput.impl(root);
    }) as typeof actual.readNativeCalibrationV2AdmissionInput,
  };
});
vi.mock('@google/genai', async original => ({
  ...await original<typeof import('@google/genai')>(),
  GoogleGenAI: class { constructor() { trust.clients++; throw new Error('forbidden bootstrap client'); } },
}));

const ownedRoots: string[] = [];

function fixture() {
  const f = v2BootstrapFixture();
  trust.sha = f.fixture.input.expectedActivationLockSha256;
  return f;
}

function gitIn(root: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: root, encoding: 'utf8', timeout: 10000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  }) as unknown as string;
}
function writeFixtureFile(path: string, bytes: string): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, bytes);
}
function commitFixture(root: string, message: string): void {
  gitIn(root, ['add', '-A', 'functions']);
  gitIn(root, [
    '-c', 'user.name=fixture-author', '-c', 'user.email=fixture-author@example.invalid',
    'commit', '-m', message,
  ]);
}
function makeRepo(f: ReturnType<typeof fixture>): string {
  const root = mkdtempSync(join(tmpdir(), 'calorix-v2-bootstrap-'));
  ownedRoots.push(root);
  gitIn(root, ['init', '-q']);
  gitIn(root, ['config', 'core.hooksPath', join(root, '.git', 'no-hooks')]);
  writeFixtureFile(join(root, 'functions/runtime.ts'), 'export const checkpoint = 1;\n');
  for (const path of f.paths) {
    writeFixtureFile(join(root, path), f.shared.get(path) as string);
  }
  commitFixture(root, 'Initial fixture commit');
  return root;
}
function headCommit(root: string): string {
  return gitIn(root, ['rev-parse', 'HEAD']).trim();
}
function functionsTree(root: string, commit: string): string {
  return gitIn(root, ['rev-parse', `${commit}:functions`]).trim();
}
function implementationCommit(root: string, commit: string): string {
  return gitIn(root, ['log', '-1', '--format=%H', commit, '--', 'functions']).trim();
}

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => { trust.network++; throw new Error('forbidden bootstrap network'); });
  for (const method of ['writeFile', 'mkdir', 'rename'] as const) {
    vi.spyOn(fsPromises, method).mockImplementation(() => { trust.writes++; throw new Error('forbidden bootstrap write'); });
  }
});
afterEach(() => {
  try {
    expect({ clients: trust.clients, network: trust.network, writes: trust.writes }).toEqual({ clients: 0, network: 0, writes: 0 });
  } finally {
    vi.restoreAllMocks();
    trust.clients = 0; trust.network = 0; trust.writes = 0; trust.sha = '';
    nativeInput.calls.length = 0; nativeInput.impl = null;
    execFileCalls.length = 0;
    fsSyncGuard.readFileSyncCalls = 0;
    while (ownedRoots.length > 0) {
      const root = ownedRoots.pop() as string;
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe('native v2 bootstrap read dependency factory', () => {
  it('creates exactly five read dependencies for an explicit canonical root with no Git/file/SDK/fetch effects', () => {
    const root = makeRepo(fixture());
    execFileCalls.length = 0;
    fsSyncGuard.readFileSyncCalls = 0;
    const readFile = vi.spyOn(fsPromises, 'readFile');
    let deps: CalibrationV2BootstrapReadDeps | undefined;
    expect(() => { deps = createCalibrationV2BootstrapReadDeps(root); }).not.toThrow();
    expect(Object.keys(deps as CalibrationV2BootstrapReadDeps).sort()).toEqual([
      'baseDir', 'readAdmissionInputs', 'readCommittedSharedFile', 'readGitState', 'readOwner',
    ]);
    expect((deps as CalibrationV2BootstrapReadDeps).baseDir).toBe(root);
    for (const key of ['readGitState', 'readAdmissionInputs', 'readCommittedSharedFile', 'readOwner'] as const) {
      expect(typeof (deps as CalibrationV2BootstrapReadDeps)[key]).toBe('function');
    }
    expect(execFileCalls.length).toBe(0);
    expect(readFile).not.toHaveBeenCalled();
    expect(fsSyncGuard.readFileSyncCalls).toBe(0);
    expect(nativeInput.calls.length).toBe(0);
  });

  it('defaults to the nutrition-eval functions runtime repository root when no explicit root is given', () => {
    const expectedRoot = resolveNutritionEvalRuntimePaths(fileURLToPath(new URL('.', import.meta.url))).repoRoot;
    const deps = createCalibrationV2BootstrapReadDeps();
    expect(deps.baseDir).toBe(expectedRoot);
  });

  it('rejects a relative, empty, or non-canonical root before any Git/file effect', () => {
    const root = makeRepo(fixture());
    execFileCalls.length = 0;
    const invalidRoots = ['relative/fixture', '', `${root}/../escape`, `${root}/./self`, '   '];
    for (const invalid of invalidRoots) {
      let thrown: unknown;
      try { createCalibrationV2BootstrapReadDeps(invalid); } catch (error) { thrown = error; }
      expect(thrown).toBeInstanceOf(CalibrationFatalError);
    }
    expect(execFileCalls.length).toBe(0);
    expect(nativeInput.calls.length).toBe(0);
  });

  it('reflects a real clean Git head, functions tree, and implementation commit', () => {
    const root = makeRepo(fixture());
    const head = headCommit(root);
    const tree = functionsTree(root, head);
    const impl = implementationCommit(root, head);
    const deps = createCalibrationV2BootstrapReadDeps(root);
    expect(deps.readGitState()).toEqual({ headCommit: head, implementationCommit: impl, functionsTreeId: tree, dirtyPaths: [] });
  });

  it('reflects dirty modified and untracked functions paths', () => {
    const root = makeRepo(fixture());
    const deps = createCalibrationV2BootstrapReadDeps(root);
    writeFixtureFile(join(root, 'functions/runtime.ts'), 'export const checkpoint = 2;\n');
    writeFixtureFile(join(root, 'functions/untracked.ts'), 'export const extra = 1;\n');
    const state = deps.readGitState();
    expect(state.dirtyPaths).toEqual(expect.arrayContaining(['functions/runtime.ts', 'functions/untracked.ts']));
  });

  it('does not refresh the Git index when only functions/runtime.ts gets a new mtime', async () => {
    const root = makeRepo(fixture());
    const deps = createCalibrationV2BootstrapReadDeps(root);
    const path = join(root, 'functions/runtime.ts');
    const stat = await fsPromises.stat(path);
    await fsPromises.utimes(path, stat.atime, new Date(stat.mtimeMs + 1000));
    const before = await fsPromises.readFile(join(root, '.git/index'));
    deps.readGitState();
    expect(await fsPromises.readFile(join(root, '.git/index'))).toEqual(before);
  });

  it('reads exact requested-commit bytes for the three approved shared assets, returning first-commit bytes after a later commit changes one asset', () => {
    const f = fixture();
    const root = makeRepo(f);
    const firstHead = headCommit(root);
    const deps = createCalibrationV2BootstrapReadDeps(root);
    for (const path of f.paths) {
      expect(deps.readCommittedSharedFile(path, firstHead)).toBe(f.shared.get(path));
    }
    const changedPath = f.paths[0] as CalibrationV2SharedAssetPath;
    writeFixtureFile(join(root, changedPath), '{"changed":true}');
    commitFixture(root, 'Change one shared asset');
    const secondHead = headCommit(root);
    expect(deps.readCommittedSharedFile(changedPath, firstHead)).toBe(f.shared.get(changedPath));
    expect(deps.readCommittedSharedFile(changedPath, secondHead)).toBe('{"changed":true}');
  });

  it('rejects V1-only, non-hex, and arbitrary shared-asset path/commit combinations before any Git execution', () => {
    const root = makeRepo(fixture());
    const deps = createCalibrationV2BootstrapReadDeps(root);
    const head = headCommit(root);
    execFileCalls.length = 0;
    const goodPath = 'functions/eval/nutrition/public-manifest.json' as CalibrationV2SharedAssetPath;
    const badPaths = [
      'functions/eval/nutrition/calibration-source-lock.json',
      'functions/eval/nutrition/calibration-manifest.json',
      '/etc/passwd',
      '',
    ];
    for (const badPath of badPaths) {
      let thrown: unknown;
      try { deps.readCommittedSharedFile(badPath as CalibrationV2SharedAssetPath, head); } catch (error) { thrown = error; }
      expect(thrown).toBeInstanceOf(CalibrationFatalError);
    }
    const badCommits = ['', 'abc123', 'A'.repeat(40), 'z'.repeat(40), 'b'.repeat(39), 'b'.repeat(41)];
    for (const badCommit of badCommits) {
      let thrown: unknown;
      try { deps.readCommittedSharedFile(goodPath, badCommit); } catch (error) { thrown = error; }
      expect(thrown).toBeInstanceOf(CalibrationFatalError);
    }
    expect(execFileCalls.length).toBe(0);
  });

  it('derives a real native owner for the current process without fixture impersonation', () => {
    const root = makeRepo(fixture());
    const deps = createCalibrationV2BootstrapReadDeps(root);
    const owner = deps.readOwner();
    expect(owner.hostname.trim().length).toBeGreaterThan(0);
    expect(owner.bootId.trim().length).toBeGreaterThan(0);
    expect(owner.pid).toBe(process.pid);
    expect(Number.isInteger(owner.startTicks)).toBe(true);
    expect(owner.startTicks).toBeGreaterThan(0);
    expect(new Date(owner.acquiredAt).toISOString()).toBe(owner.acquiredAt);
  });

  it('defers the trusted native admission reader until invoked and returns its exact raw result for the exact root', async () => {
    const f = fixture();
    const root = makeRepo(f);
    nativeInput.impl = async (calledRoot: string) => {
      expect(calledRoot).toBe(root);
      return f.fixture.input;
    };
    const deps = createCalibrationV2BootstrapReadDeps(root);
    expect(nativeInput.calls.length).toBe(0);
    const result = await deps.readAdmissionInputs();
    expect(nativeInput.calls).toEqual([root]);
    expect(result).toBe(f.fixture.input);
  });

  it("propagates the trusted native admission reader's rejection unchanged", async () => {
    const root = makeRepo(fixture());
    const failure = new Error('native admission input unavailable');
    nativeInput.impl = async () => { throw failure; };
    const deps = createCalibrationV2BootstrapReadDeps(root);
    await expect(deps.readAdmissionInputs()).rejects.toBe(failure);
  });

  it('composes native read dependencies into a context accepted by the original registry and rejects a cloned object', async () => {
    const f = fixture();
    const root = makeRepo(f);
    nativeInput.impl = async (calledRoot: string) => {
      expect(calledRoot).toBe(root);
      return f.fixture.input;
    };
    const deps = createCalibrationV2BootstrapReadDeps(root);
    const context = await prepareCalibrationV2BootstrapContext(deps);
    const head = headCommit(root);
    expect(context.baseDir).toBe(root);
    expect(context.identity.implementationCommit).toBe(implementationCommit(root, head));
    expect(context.identity.functionsTreeId).toBe(functionsTree(root, head));
    expect(requireCalibrationV2Context(context)).toBe(context);
    expect(() => requireCalibrationV2Context({ ...context })).toThrow(CalibrationFatalError);
    expect(trust.clients).toBe(0);
  });

  it('rejects an invalid trusted raw candidate with no context, client, or write effects', async () => {
    const f = fixture();
    const root = makeRepo(f);
    const tampered = { ...f.fixture.input, candidateBytes: Uint8Array.from(f.fixture.input.candidateBytes) };
    tampered.candidateBytes[0] = ((tampered.candidateBytes[0] ?? 0) + 1) % 256;
    nativeInput.impl = async () => tampered;
    const deps = createCalibrationV2BootstrapReadDeps(root);
    await expect(prepareCalibrationV2BootstrapContext(deps)).rejects.toThrow(CalibrationFatalError);
    expect(trust.clients).toBe(0);
  });
});
