import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { admissionFixture, repinFixture } from './helpers/calibration-v2-admission-fixtures';
import { readNativeCalibrationV2Admission, readNativeCalibrationV2AdmissionInput } from '../../src/nutrition-eval/calibration-v2-inputs';

// Only the fixed trust digest is substituted in this hermetic module graph.
// Native compiled probes later use the actual committed trust module.
const trust = vi.hoisted(() => ({ sha: '' }));
const execCalls = vi.hoisted(() => [] as unknown[][]);
vi.mock('node:child_process', async original => {
  const actual = await original<typeof import('node:child_process')>();
  return { ...actual, execFileSync: ((...args: unknown[]) => {
    execCalls.push(args);
    return (actual.execFileSync as (...values: unknown[]) => unknown)(...args);
  }) as typeof actual.execFileSync };
});
vi.mock('../../src/nutrition-eval/calibration-v2-lock', async original => {
  const actual = await original<typeof import('../../src/nutrition-eval/calibration-v2-lock')>();
  return { ...actual, get CALIBRATION_ACTIVATION_LOCK_V2_SHA256() { return trust.sha; } };
});

let root: string;
let fixture: ReturnType<typeof admissionFixture>;
const git = (...args: string[]): string => execFileSync('git', args, {
  cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, GIT_AUTHOR_DATE: '2026-10-30T00:00:00Z', GIT_COMMITTER_DATE: '2026-10-30T00:00:00Z' },
}).trim();
const working = (): string => join(root, '.nutrition-eval/corpus-quality-v2');
async function write(path: string, bytes: Uint8Array | string): Promise<void> {
  await fs.mkdir(join(path, '..'), { recursive: true }); await fs.writeFile(path, bytes);
}
const lockPath = (): string => join(root, 'functions/eval/nutrition/calibration-activation-lock-v2.json');
async function commit(message: string): Promise<void> { git('add', 'functions'); git('commit', '-qm', message); }
async function publishFixtureLock(): Promise<void> {
  repinFixture(fixture); trust.sha = fixture.input.expectedActivationLockSha256;
  await write(lockPath(), fixture.input.activationLockBytes);
  await write(join(working(), 'audit.json'), fixture.input.candidateBytes);
  await commit('Pin fixture inputs');
}

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'calorix-v2-native-input-'));
  fixture = admissionFixture();
  git('init', '-q'); git('config', 'user.name', 'Fixture Operator'); git('config', 'user.email', 'fixture@example.invalid');
  await write(join(root, '.gitignore'), '.nutrition-eval/\n'); git('add', '.gitignore');
  await write(join(root, 'functions/runtime.ts'), 'export const checkpoint = 1;\n');
  await write(join(root, 'functions/eval/nutrition/calibration-manifest.json'), fixture.input.bundle.v1Manifest);
  await write(join(root, 'functions/eval/nutrition/corpus-quality-source-lock-v2.json'), fixture.input.corpusLockBytes);
  await commit('Retain historical source');
  const producer = { implementationCommit: git('rev-parse', 'HEAD'), functionsTreeId: git('rev-parse', 'HEAD:functions') };
  fixture.lock.candidate.producer = producer;
  fixture.audit.identity.codeCheckpoint = { ...producer };
  fixture.context.codeCheckpoint = { ...producer };
  const bundleKeys = [['metadataCafe1', 'cafe1'], ['metadataCafe2', 'cafe2'],
    ['trainSplit', 'trainSplit'], ['vocabulary', 'vocabulary']] as const;
  for (const [key, field] of bundleKeys) await write(join(working(), 'inputs', key + '.bin'), fixture.input.bundle[field]);
  for (const [hash, bytes] of fixture.input.images) await write(join(working(), 'images', hash + '.bin'), bytes);
  for (const [path, bytes] of fixture.input.priorEvidence) await write(join(root, fixture.lock.prior.root, path), bytes);
  await write(join(root, 'functions/runtime.ts'), 'export const checkpoint = 2;\n');
  await publishFixtureLock();
  expect(git('status', '--porcelain', '--untracked-files=all', '--', 'functions')).toBe('');
  execCalls.length = 0;
});
afterEach(async () => {
  vi.restoreAllMocks();
  if (root) await fs.rm(root, { recursive: true, force: true });
});

describe('bounded fixed native admission inputs', () => {
  it('accepts real clean Git history and derives data through the real pure validator', async () => {
    const input = await readNativeCalibrationV2AdmissionInput(root);
    expect(input.activationLockBytes).toEqual(fixture.input.activationLockBytes);
    expect(input.images.size).toBe(41);
    expect(input.priorEvidence.size).toBe(11);
    const result = await readNativeCalibrationV2Admission(root);
    expect(result.audit.identity.codeCheckpoint).toEqual(fixture.lock.candidate.producer);
    expect(result.audit.identity.codeCheckpoint.implementationCommit).not.toBe(git('rev-parse', 'HEAD'));
    expect(result.manifest.version).toBe(2);
    expect(result.manifest.cases).toHaveLength(40);
    expect(git('status', '--porcelain')).toBe('');
  });

  it('performs no filesystem writes or downloads', async () => {
    const forbidden = () => { throw new Error('forbidden native-reader effect'); };
    const writeFile = vi.spyOn(fs, 'writeFile').mockImplementation(forbidden);
    const mkdir = vi.spyOn(fs, 'mkdir').mockImplementation(forbidden);
    const rename = vi.spyOn(fs, 'rename').mockImplementation(forbidden);
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(forbidden);
    const result = await readNativeCalibrationV2Admission(root);
    expect(result.manifest.cases).toHaveLength(40);
    expect(writeFile).not.toHaveBeenCalled(); expect(mkdir).not.toHaveBeenCalled();
    expect(rename).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

  it('does not refresh the Git index when unchanged source has new file timestamps', async () => {
    const path = join(root, 'functions/runtime.ts'); const stat = await fs.stat(path);
    await fs.utimes(path, stat.atime, new Date(stat.mtimeMs + 1000));
    const before = await fs.readFile(join(root, '.git/index'));
    await readNativeCalibrationV2Admission(root);
    expect(await fs.readFile(join(root, '.git/index'))).toEqual(before);
  });

  it('rejects a missing Git repository', async () => {
    await fs.rm(join(root, '.git'), { recursive: true, force: true });
    await expect(readNativeCalibrationV2Admission(root)).rejects.toThrow(/git|source|repository/i);
  });

  it.each(['modified', 'untracked'] as const)('rejects %s Functions source before input access', async kind => {
    await write(join(root, 'functions', kind === 'modified' ? 'runtime.ts' : 'unexpected.ts'), 'changed\n');
    const read = vi.spyOn(fs, 'readFile');
    await expect(readNativeCalibrationV2Admission(root)).rejects.toThrow(/source|dirty|uncommitted/i);
    expect(read).not.toHaveBeenCalled();
  });

  it.each(['dirty', 'committed'] as const)('rejects %s Functions source drift during an awaited file read', async kind => {
    const original = fs.readFile.bind(fs); let changed = false;
    vi.spyOn(fs, 'readFile').mockImplementation(async (path, options) => {
      const bytes = await original(path, options);
      if (!changed) {
        changed = true; await fs.writeFile(join(root, 'functions/runtime.ts'), 'changed during await\n');
        if (kind === 'committed') await commit('Change source during read');
      }
      return bytes;
    });
    await expect(readNativeCalibrationV2Admission(root)).rejects.toThrow(/source|dirty|drift|uncommitted/i);
    expect(changed).toBe(true);
  });

  it.each(['missing commit', 'wrong tree'] as const)('rejects historical %s', async kind => {
    if (kind === 'missing commit') fixture.lock.candidate.producer.implementationCommit = 'f'.repeat(40);
    else fixture.lock.candidate.producer.functionsTreeId = 'f'.repeat(40);
    fixture.audit.identity.codeCheckpoint = { ...fixture.lock.candidate.producer };
    await publishFixtureLock();
    await expect(readNativeCalibrationV2Admission(root)).rejects.toThrow(/historical|producer|git|tree/i);
  });

  it('rejects activation-lock raw drift before JSON parsing', async () => {
    await write(lockPath(), '{bad lock'); await commit('Change fixture lock');
    await expect(readNativeCalibrationV2Admission(root)).rejects.toThrow(/sha256|lock/i);
  });

  it('rejects changed candidate bytes before parsing malformed JSON', async () => {
    await write(join(working(), 'audit.json'), '{bad candidate');
    await expect(readNativeCalibrationV2Admission(root)).rejects.toThrow(/sha256|candidate/i);
  });

  it('rejects changed committed corpus-lock bytes before parsing', async () => {
    await write(join(root, 'functions/eval/nutrition/corpus-quality-source-lock-v2.json'), '{bad corpus lock');
    await commit('Change fixture corpus lock');
    await expect(readNativeCalibrationV2Admission(root)).rejects.toThrow(/sha256|corpus/i);
  });

  it.each(['selected', 'rejected'] as const)('rejects missing %s image without downloading', async kind => {
    const photo = fixture.audit.photos[kind === 'rejected' ? 0 : 1]!;
    await fs.unlink(join(working(), 'images', photo.image.sha256 + '.bin'));
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('forbidden download'));
    await expect(readNativeCalibrationV2Admission(root)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects frozen prior evidence byte drift', async () => {
    await write(join(root, fixture.lock.prior.root, 'ledger.json'), 'changed prior bytes');
    await expect(readNativeCalibrationV2Admission(root)).rejects.toThrow(/prior|sha256/i);
  });

  it('rejects an oversized candidate file', async () => {
    await write(join(working(), 'audit.json'), Buffer.alloc(4 * 1024 * 1024 + 1));
    await expect(readNativeCalibrationV2Admission(root)).rejects.toThrow(/bound|size|large|invalid.file/i);
  });

  it.each(['root', 'input parent', 'image', 'prior file'] as const)('rejects a symlink at %s', async kind => {
    const target = kind === 'root' ? root : kind === 'input parent' ? join(working(), 'inputs') :
      kind === 'image' ? join(working(), 'images', fixture.audit.photos[0]!.image.sha256 + '.bin') :
        join(root, fixture.lock.prior.root, 'ledger.json');
    const moved = target + '.fixture-real'; await fs.rename(target, moved); await fs.symlink(moved, target);
    try { await expect(readNativeCalibrationV2Admission(root)).rejects.toThrow(/path|symlink|confine/i); }
    finally { await fs.unlink(target); await fs.rename(moved, target); }
  });

  it('keeps all Git invocations read-only and pins the requested repository', async () => {
    await readNativeCalibrationV2Admission(root);
    expect(execCalls.length).toBeGreaterThan(0);
    for (const [executable, args, options] of execCalls) {
      expect(executable).toBe('git');
      expect(['status', 'log', 'rev-parse', 'show', 'cat-file']).toContain((args as string[])[0]);
      expect(options).toMatchObject({ cwd: root });
    }
  });
});
