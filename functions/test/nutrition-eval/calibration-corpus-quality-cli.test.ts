import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { runCorpusQualityCli, createNativeQualityCliDeps } from '../../src/nutrition-eval/calibration-corpus-quality-cli';
import type { QualityCliDeps } from '../../src/nutrition-eval/calibration-corpus-quality-cli';
import type { QualityAudit } from '../../src/nutrition-eval/calibration-corpus-quality-audit';
import { qualityContextFixture, qualityReadyFixture, QUALITY_GOLDEN_IDS } from './helpers/corpus-quality-fixtures';

// Real disk writes/fsync on the Pi can exceed Vitest's 5s default; no product timeout changes.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

// Header-only PNG fixture exercises the existing metadata inspector, not pixel decoding.
const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000280000001e0', 'hex');
const imageSha = createHash('sha256').update(png).digest('hex');
const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});
async function fixture() {
  const repositoryRoot = await fs.mkdtemp(join(tmpdir(), 'corpus-quality-cli-'));
  roots.push(repositoryRoot);
  const context = qualityContextFixture();
  const fetcher = vi.fn(async (_url: string | URL | Request, _options?: RequestInit) => new Response(png, { status: 200 }));
  const loadContext = vi.fn(async () => context);
  const deps: QualityCliDeps = { repositoryRoot, loadContext, fetch: fetcher,
    now: () => '2026-10-29T00:00:00.000Z' };
  const working = join(repositoryRoot, '.nutrition-eval/corpus-quality-v2');
  const auditPath = join(working, 'audit.json');
  const read = async () => JSON.parse(await fs.readFile(auditPath, 'utf8')) as QualityAudit;
  return { repositoryRoot, context, fetcher, loadContext, deps, working, auditPath, read };
}
async function ready(f: Awaited<ReturnType<typeof fixture>>) {
  const audit = qualityReadyFixture(f.context);
  for (const photo of audit.photos) photo.image.sha256 = imageSha;
  for (const row of audit.decisions) row.imageSha = imageSha;
  await fs.mkdir(join(f.working, 'images'), { recursive: true });
  await fs.writeFile(join(f.working, 'images', imageSha + '.bin'), png);
  await fs.writeFile(f.auditPath, JSON.stringify(audit));
  return audit;
}
function disposition(id: string, ...extra: string[]): string[] {
  return ['record-quality', '--case-id', id, '--image-sha', imageSha, '--verdict', 'pass',
    '--reviewer', 'fixture-operator', '--note', 'Synthetic fixture review.', ...extra];
}

describe('offline quality CLI: persistent bytes and operator decisions', () => {
  it('rejects malformed flags before context, filesystem or network work', async () => {
    const f = await fixture();
    for (const argv of [[], ['activate'], ['verify', '--allow-public-downloads'],
      ['prepare', '--allow-public-downloads', '--allow-public-downloads'],
      disposition(QUALITY_GOLDEN_IDS[0]!, '--reason', 'qc_uncertain'),
      disposition(QUALITY_GOLDEN_IDS[0]!, '--supersedes', '0'),
      disposition(QUALITY_GOLDEN_IDS[0]!).map(s => s === 'fixture-operator' ? ' ' : s)]) {
      expect(await runCorpusQualityCli(argv, f.deps)).toEqual({ exitCode: 1, status: 'invalid_arguments' });
    }
    expect(f.loadContext).not.toHaveBeenCalled();
    expect(f.fetcher).not.toHaveBeenCalled();
    expect(await fs.readdir(f.repositoryRoot)).toEqual([]);
  });

  it('requires explicit public downloads and persists forty pending images when opted in', async () => {
    const f = await fixture();
    expect(await runCorpusQualityCli(['prepare'], f.deps)).toMatchObject({ exitCode: 1, status: 'download_required' });
    expect(f.fetcher).not.toHaveBeenCalled();
    expect(await runCorpusQualityCli(['prepare', '--allow-public-downloads'], f.deps))
      .toMatchObject({ exitCode: 0, status: 'prepared', photos: 40, pending: 40 });
    expect(f.fetcher).toHaveBeenCalledTimes(40);
    const audit = await f.read();
    expect(audit.photos.map(row => row.dish.dishId)).toEqual(QUALITY_GOLDEN_IDS);
    expect(audit.modelRequests).toBe(0);
    expect(audit.decisions).toEqual([]);
    expect(await fs.readFile(join(f.working, 'images', imageSha + '.bin'))).toEqual(png);
    expect(await fs.readdir(f.working)).not.toContain('writer.lock');
    expect(await runCorpusQualityCli(['finalize'], f.deps)).toMatchObject({ exitCode: 1 });
    expect((await f.read()).status).toBe('draft');
  });

  it('keeps a successful prefix on transient failure and retries the same candidate on explicit resume', async () => {
    const f = await fixture();
    f.fetcher.mockResolvedValueOnce(new Response(png)).mockResolvedValueOnce(new Response('', { status: 429 }));
    expect(await runCorpusQualityCli(['prepare', '--allow-public-downloads'], f.deps))
      .toMatchObject({ exitCode: 1, status: 'image_http_429' });
    expect((await f.read()).photos).toHaveLength(1);
    expect((await f.read()).skipped).toEqual([]);
    const failedUrl = f.fetcher.mock.calls[1]![0];
    expect(await runCorpusQualityCli(['prepare', '--allow-public-downloads'], f.deps)).toMatchObject({ exitCode: 0 });
    expect(f.fetcher.mock.calls[2]![0]).toBe(failedUrl);
    expect(f.fetcher).toHaveBeenCalledTimes(41);
  });

  it('retains 404 and invalid-byte skips, then fills replacements from the same schedule', async () => {
    const f = await fixture();
    f.fetcher.mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(new Response('bad image', { status: 200 }));
    expect(await runCorpusQualityCli(['prepare', '--allow-public-downloads'], f.deps))
      .toMatchObject({ exitCode: 0, photos: 40, skipped: 2 });
    const audit = await f.read();
    expect(audit.skipped).toMatchObject([
      { dishId: QUALITY_GOLDEN_IDS[0], reason: 'http_404' },
      { dishId: 'dish_9001000004', reason: 'invalid_signature',
        imageSha: createHash('sha256').update('bad image').digest('hex') },
    ]);
    expect(audit.selection!.map(row => row.dishId)).not.toContain(QUALITY_GOLDEN_IDS[0]);
    expect(f.fetcher).toHaveBeenCalledTimes(42);
  });

  it('records exact hash-bound corrections and retains prior decisions', async () => {
    const f = await fixture();
    await ready(f);
    const id = QUALITY_GOLDEN_IDS[0]!;
    expect(await runCorpusQualityCli(disposition(id), f.deps)).toMatchObject({ exitCode: 1 });
    const reject = disposition(id, '--reason', 'qc_uncertain', '--supersedes', '1');
    reject[reject.indexOf('pass')] = 'reject';
    expect(await runCorpusQualityCli(reject, f.deps)).toMatchObject({ exitCode: 0, status: 'recorded' });
    expect((await f.read()).decisions).toHaveLength(41);
    expect(await runCorpusQualityCli(disposition(id, '--supersedes', '1'), f.deps)).toMatchObject({ exitCode: 1 });
    expect(await runCorpusQualityCli(disposition(id, '--supersedes', '41'), f.deps)).toMatchObject({ exitCode: 0 });
    expect((await f.read()).decisions).toHaveLength(42);
    expect((await f.read()).selection!.map(row => row.dishId)).toEqual(QUALITY_GOLDEN_IDS);
  });

  it('refuses changed or missing pinned bytes without replacing them even when downloads are allowed', async () => {
    const f = await fixture();
    await ready(f);
    const path = join(f.working, 'images', imageSha + '.bin');
    await fs.writeFile(path, 'changed');
    expect(await runCorpusQualityCli(['prepare', '--allow-public-downloads'], f.deps))
      .toMatchObject({ exitCode: 1, status: 'image_mismatch' });
    await fs.unlink(path);
    expect(await runCorpusQualityCli(['prepare', '--allow-public-downloads'], f.deps))
      .toMatchObject({ exitCode: 1, status: 'image_mismatch' });
    expect(f.fetcher).not.toHaveBeenCalled();
  });

  it('finalizes complete reviews, verifies read-only and refuses further finalized mutations', async () => {
    const f = await fixture();
    await ready(f);
    expect(await runCorpusQualityCli(['verify'], f.deps)).toMatchObject({ exitCode: 1, status: 'not_finalized' });
    expect(await runCorpusQualityCli(['finalize'], f.deps)).toMatchObject({ exitCode: 0, status: 'finalized', pending: 0 });
    const before = await fs.readFile(f.auditPath);
    const stat = await fs.stat(f.auditPath);
    await fs.writeFile(join(f.working, 'writer.lock'), 'foreign');
    expect(await runCorpusQualityCli(['verify'], f.deps)).toMatchObject({ exitCode: 0, status: 'verified',
      auditSha256: createHash('sha256').update(before).digest('hex') });
    expect((await fs.stat(f.auditPath)).mtimeMs).toBe(stat.mtimeMs);
    await fs.unlink(join(f.working, 'writer.lock'));
    for (const argv of [['prepare', '--allow-public-downloads'], ['finalize'],
      disposition(QUALITY_GOLDEN_IDS[0]!, '--supersedes', '1')]) {
      expect(await runCorpusQualityCli(argv, f.deps)).toMatchObject({ exitCode: 1, status: 'already_finalized' });
    }
    expect(await fs.readFile(f.auditPath)).toEqual(before);
    expect(f.fetcher).not.toHaveBeenCalled();
  });

  it('rejects source identity drift and unknown audit fields', async () => {
    const f = await fixture();
    const audit = await ready(f);
    f.context.sourceLockSha256 = '0'.repeat(64);
    expect(await runCorpusQualityCli(['finalize'], f.deps)).toMatchObject({ exitCode: 1 });
    f.context.sourceLockSha256 = audit.identity.sourceLockSha256;
    await fs.writeFile(f.auditPath, JSON.stringify({ ...audit, runtimeStage: 'done' }));
    expect(await runCorpusQualityCli(['finalize'], f.deps)).toMatchObject({ exitCode: 1 });
  });

  it('preserves a foreign writer lock and blocks symlink escapes before context/network use', async () => {
    const f = await fixture();
    await fs.mkdir(f.working, { recursive: true });
    await fs.writeFile(join(f.working, 'writer.lock'), 'other-owner');
    expect(await runCorpusQualityCli(['prepare'], f.deps)).toMatchObject({ exitCode: 1, status: 'writer_locked' });
    expect(await fs.readFile(join(f.working, 'writer.lock'), 'utf8')).toBe('other-owner');
    expect(f.loadContext).not.toHaveBeenCalled();
    const escape = await fixture();
    await fs.symlink(f.working, join(escape.repositoryRoot, '.nutrition-eval'));
    expect(await runCorpusQualityCli(['prepare', '--allow-public-downloads'], escape.deps))
      .toMatchObject({ exitCode: 1, status: 'unsafe_path' });
    expect(escape.loadContext).not.toHaveBeenCalled();
    expect(escape.fetcher).not.toHaveBeenCalled();
  });

  it('reports failed atomic publication, preserves prior bytes and releases only its lock', async () => {
    const f = await fixture();
    await ready(f);
    const before = await fs.readFile(f.auditPath);
    vi.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('fixture publication failure'));
    expect(await runCorpusQualityCli(['finalize'], f.deps)).toMatchObject({ exitCode: 1, status: 'operation_failed' });
    expect(await fs.readFile(f.auditPath)).toEqual(before);
    expect(await fs.readdir(f.working)).toEqual(['audit.json', 'images']);
  });

  it('constructs native dependencies without accessing the filesystem or creating clients', () => {
    const read = vi.spyOn(fs, 'readFile');
    const native = createNativeQualityCliDeps();
    expect(native.repositoryRoot).toBe(resolve(__dirname, '../../..'));
    expect(native.loadContext).toBeUndefined();
    expect(read).not.toHaveBeenCalled();
  });

  it('aborts network exceptions and oversized bodies without inventing image skips', async () => {
    const f = await fixture();
    f.fetcher.mockRejectedValueOnce(new Error('fixture transport failure'));
    expect(await runCorpusQualityCli(['prepare', '--allow-public-downloads'], f.deps))
      .toMatchObject({ exitCode: 1, status: 'download_failed' });
    expect((await f.read()).skipped).toEqual([]);
    f.fetcher.mockResolvedValueOnce(new Response(png, { headers: { 'content-length': '6000000' } }));
    expect(await runCorpusQualityCli(['prepare', '--allow-public-downloads'], f.deps))
      .toMatchObject({ exitCode: 1, status: 'download_too_large' });
    f.fetcher.mockResolvedValueOnce(new Response(new Uint8Array(5 * 1024 * 1024 + 1)));
    expect(await runCorpusQualityCli(['prepare', '--allow-public-downloads'], f.deps))
      .toMatchObject({ exitCode: 1, status: 'download_too_large' });
    expect((await f.read()).photos).toEqual([]);
    expect((await f.read()).skipped).toEqual([]);
  });

  it('verifies retained invalid-byte evidence and does not fetch over a damaged skip blob', async () => {
    const f = await fixture();
    f.fetcher.mockResolvedValueOnce(new Response('bad image'));
    expect(await runCorpusQualityCli(['prepare', '--allow-public-downloads'], f.deps)).toMatchObject({ exitCode: 0 });
    const skip = (await f.read()).skipped[0]!;
    expect(skip.reason).toBe('invalid_signature');
    if (!('imageSha' in skip)) throw new Error('fixture should retain invalid bytes');
    await fs.writeFile(join(f.working, 'images', skip.imageSha + '.bin'), png);
    f.fetcher.mockClear();
    expect(await runCorpusQualityCli(['prepare', '--allow-public-downloads'], f.deps))
      .toMatchObject({ exitCode: 1, status: 'image_mismatch' });
    expect(f.fetcher).not.toHaveBeenCalled();
  });

  it('does not unlink a replacement foreign lock when releasing its own writer handle', async () => {
    const f = await fixture();
    await ready(f);
    const rename = fs.rename;
    vi.spyOn(fs, 'rename').mockImplementationOnce(async (from, to) => {
      await fs.unlink(join(f.working, 'writer.lock'));
      await fs.writeFile(join(f.working, 'writer.lock'), 'replacement owner');
      await rename(from, to);
    });
    expect(await runCorpusQualityCli(['finalize'], f.deps)).toMatchObject({ exitCode: 0 });
    expect(await fs.readFile(join(f.working, 'writer.lock'), 'utf8')).toBe('replacement owner');
  });

  it('reports lock cleanup failure without leaking a rejected command promise', async () => {
    const f = await fixture();
    await ready(f);
    const unlink = fs.unlink;
    vi.spyOn(fs, 'unlink').mockImplementation(async path => {
      if (String(path).endsWith('/writer.lock')) throw new Error('fixture lock cleanup failure');
      await unlink(path);
    });
    await expect(runCorpusQualityCli(['finalize'], f.deps)).resolves.toMatchObject({ exitCode: 1, status: 'operation_failed' });
    expect((await f.read()).status).toBe('finalized');
    expect(await fs.readdir(f.working)).toContain('writer.lock');
  });

  it('syncs file contents before rename and the publication directory afterward', async () => {
    const f = await fixture();
    await ready(f);
    const open = fs.open; const rename = fs.rename; const trace: string[] = [];
    vi.spyOn(fs, 'open').mockImplementation(async (...args: Parameters<typeof fs.open>) => {
      const handle = await open(...args);
      const path = String(args[0]);
      if (path.startsWith(f.auditPath + '.') || path === f.working) {
        const sync = handle.sync.bind(handle);
        vi.spyOn(handle, 'sync').mockImplementation(async () => {
          trace.push(path === f.working ? 'directory-sync' : 'file-sync'); await sync();
        });
      }
      return handle;
    });
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => { trace.push('rename'); await rename(from, to); });
    expect(await runCorpusQualityCli(['finalize'], f.deps)).toMatchObject({ exitCode: 0 });
    expect(trace).toEqual(['file-sync', 'rename', 'directory-sync']);
  });

  it('reports publication directory-sync failure without claiming completion', async () => {
    const f = await fixture();
    await ready(f);
    const open = fs.open;
    vi.spyOn(fs, 'open').mockImplementation(async (...args: Parameters<typeof fs.open>) => {
      const handle = await open(...args);
      if (String(args[0]) === f.working) vi.spyOn(handle, 'sync').mockRejectedValueOnce(new Error('fixture directory sync failed'));
      return handle;
    });
    expect(await runCorpusQualityCli(['finalize'], f.deps)).toMatchObject({ exitCode: 1, status: 'operation_failed' });
    expect(await fs.readdir(f.working)).not.toContain('writer.lock');
  });

  it('durably establishes new artifact directories before publishing its first draft', async () => {
    const f = await fixture();
    const open = fs.open; const trace: string[] = [];
    vi.spyOn(fs, 'open').mockImplementation(async (...args: Parameters<typeof fs.open>) => {
      const handle = await open(...args);
      if (args[1] === 'r') {
        const sync = handle.sync.bind(handle);
        vi.spyOn(handle, 'sync').mockImplementation(async () => { trace.push(String(args[0])); await sync(); });
      }
      return handle;
    });
    expect(await runCorpusQualityCli(['prepare'], f.deps)).toMatchObject({ exitCode: 1, status: 'download_required' });
    expect(trace.slice(0, 4)).toEqual([join(f.repositoryRoot, '.nutrition-eval'), f.repositoryRoot,
      f.working, join(f.repositoryRoot, '.nutrition-eval')]);
    expect(trace[4]).toBe(f.working);
    expect((await f.read()).status).toBe('draft');
  });

  it('loads native pinned-source paths without implicit downloads and fails cached drift before parsing', async () => {
    const f = await fixture();
    const source = join(f.repositoryRoot, 'functions/eval/nutrition');
    await fs.mkdir(source, { recursive: true });
    await fs.copyFile(resolve(__dirname, '../../eval/nutrition/corpus-quality-source-lock-v2.json'),
      join(source, 'corpus-quality-source-lock-v2.json'));
    const git = (...args: string[]) => execFileSync('git', args, { cwd: f.repositoryRoot, stdio: 'pipe' });
    git('init', '-q'); git('add', 'functions');
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Pin fixture inputs');
    const deps: QualityCliDeps = { repositoryRoot: f.repositoryRoot, fetch: f.fetcher };
    expect(await runCorpusQualityCli(['prepare'], deps)).toMatchObject({ exitCode: 1, status: 'download_required' });
    expect(f.fetcher).not.toHaveBeenCalled();
    f.fetcher.mockResolvedValueOnce(new Response('', { status: 503 }));
    expect(await runCorpusQualityCli(['prepare', '--allow-public-downloads'], deps))
      .toMatchObject({ exitCode: 1, status: 'source_http_503' });
    await fs.mkdir(join(f.working, 'inputs'), { recursive: true });
    await fs.writeFile(join(f.working, 'inputs/metadataCafe1.bin'), 'drifted source');
    f.fetcher.mockClear();
    expect(await runCorpusQualityCli(['prepare', '--allow-public-downloads'], deps)).toMatchObject({ exitCode: 1 });
    expect(f.fetcher).not.toHaveBeenCalled();
    expect(await fs.readFile(join(f.working, 'inputs/metadataCafe1.bin'), 'utf8')).toBe('drifted source');
    await fs.writeFile(join(source, 'uncommitted.txt'), 'new source');
    expect(await runCorpusQualityCli(['prepare'], deps)).toMatchObject({ exitCode: 1, status: 'uncommitted_tool_source' });
  });

  it('imports compiled code and rejects actual main arguments with all I/O and provider routes trapped', async () => {
    const f = await fixture();
    const compiled = resolve(__dirname, '../../lib/nutrition-eval/calibration-corpus-quality-cli.js');
    const hook = join(f.repositoryRoot, 'guard.cjs');
    await fs.writeFile(hook, `
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (id, ...args) {
  if (/@google\\/genai|firebase-admin|calibration-ledger|calibration-runtime/.test(id)) throw new Error('Forbidden client/runtime import');
  return originalLoad.call(this, id, ...args);
};
const promises = require('node:fs/promises');
for (const key of ['readFile','writeFile','mkdir','open','rename','unlink','lstat','stat']) promises[key] = () => { throw new Error('Unexpected file operation'); };
require('node:child_process').execFileSync = () => { throw new Error('Unexpected subprocess'); };
global.fetch = () => { throw new Error('Unexpected network request'); };
`);
    const imported = spawnSync(process.execPath, ['--require', hook, '-e',
      'require(process.argv[1]); console.log("imported")', compiled], { encoding: 'utf8', cwd: f.repositoryRoot });
    expect(imported.status, imported.stderr).toBe(0);
    expect(imported.stdout.trim()).toBe('imported');
    const main = spawnSync(process.execPath, ['--require', hook, compiled, 'prepare', '--runtime-root', '/forbidden'],
      { encoding: 'utf8', cwd: f.repositoryRoot });
    expect(main.status, main.stderr).toBe(1);
    expect(JSON.parse(main.stdout)).toEqual({ exitCode: 1, status: 'invalid_arguments' });
    expect(await fs.readdir(f.repositoryRoot)).toEqual(['guard.cjs']);
  });
});
