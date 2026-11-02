/** Parser-level PNG header fixtures; no decoded image, SDK request or visual/accuracy claim. */
import fs from 'node:fs/promises';
import { mkdirSync, readFileSync, rmSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadVerifiedCaseImage } from '../../src/nutrition-eval/assets';
import { readNativeCalibrationV2CaseImage } from '../../src/nutrition-eval/calibration-v2-native-images';
import { readCalibrationV2BoundedFile } from '../../src/nutrition-eval/calibration-v2-native-read';
import { prepareCalibrationBootstrapContext } from '../../src/nutrition-eval/calibration-bootstrap';
import type { CalibrationV2PreparedContext } from '../../src/nutrition-eval/calibration-protocol-bindings';
import { StrictCalibrationManifestV2Schema } from '../../src/nutrition-eval/schema';
import { nativeV2RuntimeFixture, nativeTreeSnapshot } from './helpers/calibration-v2-native-runtime-fixtures';

const trust = vi.hoisted(() => ({ sha: '' }));
vi.mock('../../src/nutrition-eval/calibration-v2-lock', async original => ({
  ...await original<typeof import('../../src/nutrition-eval/calibration-v2-lock')>(),
  get CALIBRATION_ACTIVATION_LOCK_V2_SHA256() { return trust.sha; },
}));
const INVALID_IMAGE = 'calibration:v2-case-image-invalid';
const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
async function fixture() {
  const f = await nativeV2RuntimeFixture(roots, sha => { trust.sha = sha; });
  const cases = StrictCalibrationManifestV2Schema.parse(JSON.parse(f.context.files['calibration-manifest'])).cases;
  const first = cases[0]!; const bytes = f.data.fixture.input.images.get(first.image.sha256)!;
  const imageRoot = join(f.mini.root, '.nutrition-eval/corpus-quality-v2/images');
  mkdirSync(imageRoot, { recursive: true }); const path = join(imageRoot, first.image.sha256 + '.bin'); writeFileSync(path, bytes);
  return { ...f, first, bytes, path, imageRoot };
}

describe('qualified fixed native V2 images', () => {
  it('independent existing verified-cache loader baseline accepts the same header bytes without downloading', async () => {
    const f = await fixture(); const cacheRoot = join(f.mini.root, '.nutrition-eval/cache'); mkdirSync(cacheRoot, { recursive: true });
    writeFileSync(join(cacheRoot, f.first.image.sha256 + '.png'), f.bytes);
    const actual = await loadVerifiedCaseImage(f.first, { cacheRoot });
    expect(Buffer.from(actual)).toEqual(Buffer.from(f.bytes));
  }, 30000);

  it('reads the exact qualified .bin bytes without changing source, input files or the Git index', async () => {
    const f = await fixture(); const before = nativeTreeSnapshot(join(f.mini.root, '.nutrition-eval'));
    const index = readFileSync(join(f.mini.root, '.git/index'));
    const actual = await readNativeCalibrationV2CaseImage(f.context, f.first.id);
    expect(actual).toBeInstanceOf(Uint8Array); expect(Buffer.from(actual)).toEqual(Buffer.from(f.bytes));
    expect(nativeTreeSnapshot(join(f.mini.root, '.nutrition-eval'))).toEqual(before);
    expect(readFileSync(join(f.mini.root, '.git/index'))).toEqual(index);
  }, 30000);

  it('returns fresh owned bytes on every read', async () => {
    const f = await fixture(); const first = await readNativeCalibrationV2CaseImage(f.context, f.first.id); first[0] = 0;
    const second = await readNativeCalibrationV2CaseImage(f.context, f.first.id);
    expect(Buffer.from(second)).toEqual(Buffer.from(f.bytes)); expect(second).not.toBe(first);
    expect(readFileSync(f.path)).toEqual(Buffer.from(f.bytes));
  }, 30000);

  it('never writes caches or downloads during a successful qualified read', async () => {
    const f = await fixture();
    const write = vi.spyOn(fs, 'writeFile'); const mkdir = vi.spyOn(fs, 'mkdir'); const rename = vi.spyOn(fs, 'rename');
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('PRIVATE forbidden download'));
    expect(Buffer.from(await readNativeCalibrationV2CaseImage(f.context, f.first.id))).toEqual(Buffer.from(f.bytes));
    expect(write).not.toHaveBeenCalled(); expect(mkdir).not.toHaveBeenCalled(); expect(rename).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  }, 30000);

  it.each(['clone', 'proxy', 'revoked', 'V1'] as const)('rejects %s context before case coercion or filesystem calls', async kind => {
    const f = await fixture(); const revoked = Proxy.revocable(f.context, {}); revoked.revoke();
    const context = kind === 'clone' ? { ...f.context } : kind === 'proxy' ? new Proxy(f.context, {}) : kind === 'revoked' ? revoked.proxy
      : await prepareCalibrationBootstrapContext(f.nativePorts);
    let coerced = 0; const id = { [Symbol.toPrimitive]() { coerced++; throw new Error('PRIVATE'); } };
    const read = vi.spyOn(fs, 'readFile'); const stat = vi.spyOn(fs, 'stat'); const lstat = vi.spyOn(fs, 'lstat');
    await expect(readNativeCalibrationV2CaseImage(context as Readonly<CalibrationV2PreparedContext>, id)).rejects.toThrow('calibration:v2-context-unregistered');
    expect(coerced).toBe(0); expect(read).not.toHaveBeenCalled(); expect(stat).not.toHaveBeenCalled(); expect(lstat).not.toHaveBeenCalled();
  }, 30000);

  it.each(['missing', 'public', 'object', 'symbol', 'empty', 'traversal'] as const)('rejects %s case selector before file reads', async kind => {
    const f = await fixture(); let coerced = 0;
    const publicCase = (JSON.parse(f.context.files['public-manifest']) as { cases: Array<{ id: string }> }).cases[0]!.id;
    const id = kind === 'missing' ? 'absent-case' : kind === 'public' ? publicCase : kind === 'object'
      ? { [Symbol.toPrimitive]() { coerced++; return f.first.id; } } : kind === 'symbol' ? Symbol('case') : kind === 'empty' ? '' : '../../private.bin';
    const read = vi.spyOn(fs, 'readFile');
    await expect(readNativeCalibrationV2CaseImage(f.context, id)).rejects.toThrow(INVALID_IMAGE); expect(read).not.toHaveBeenCalled(); expect(coerced).toBe(0);
  }, 30000);

  it.each(['missing', 'tampered', 'oversized', 'directory', 'file-symlink', 'parent-symlink'] as const)('rejects %s qualified file without a download fallback', async kind => {
    const f = await fixture();
    if (kind === 'missing') rmSync(f.path);
    if (kind === 'tampered') writeFileSync(f.path, Buffer.from('PRIVATE wrong image bytes'));
    if (kind === 'oversized') writeFileSync(f.path, Buffer.alloc(5 * 1024 * 1024 + 1));
    if (kind === 'directory') { rmSync(f.path); mkdirSync(f.path); }
    if (kind === 'file-symlink') { const other = join(f.mini.root, 'outside-qualified.bin'); writeFileSync(other, f.bytes); rmSync(f.path); symlinkSync(other, f.path); }
    if (kind === 'parent-symlink') { const other = f.imageRoot + '-moved'; renameSync(f.imageRoot, other); symlinkSync(other, f.imageRoot, 'dir'); }
    const before = nativeTreeSnapshot(f.v1Root); const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('PRIVATE forbidden download'));
    let caught: unknown; try { await readNativeCalibrationV2CaseImage(f.context, f.first.id); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(Error); expect((caught as Error).message).toBe(INVALID_IMAGE); expect((caught as Error).cause).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled(); expect(nativeTreeSnapshot(f.v1Root)).toEqual(before);
  }, 30000);

  it('does not substitute a valid legacy cache image for a missing qualified file', async () => {
    const f = await fixture(); rmSync(f.path); const cacheRoot = join(f.mini.root, '.nutrition-eval/cache'); mkdirSync(cacheRoot, { recursive: true });
    writeFileSync(join(cacheRoot, f.first.image.sha256 + '.png'), f.bytes);
    await expect(readNativeCalibrationV2CaseImage(f.context, f.first.id)).rejects.toThrow(INVALID_IMAGE);
  }, 30000);
});

describe('shared bounded native read leaf', () => {
  it('reads existing bytes within the admitted repository root without changing files', async () => {
    const f = await fixture(); const before = nativeTreeSnapshot(f.imageRoot);
    expect(await readCalibrationV2BoundedFile(f.mini.root, '.nutrition-eval/corpus-quality-v2/images/' + f.first.image.sha256 + '.bin', 5 * 1024 * 1024))
      .toEqual(Buffer.from(f.bytes));
    expect(nativeTreeSnapshot(f.imageRoot)).toEqual(before);
  }, 30000);

  it.each(['outside', 'size', 'symlink'] as const)('rejects %s bounded-read input', async kind => {
    const f = await fixture();
    if (kind === 'symlink') { const other = join(f.mini.root, 'other.bin'); writeFileSync(other, f.bytes); rmSync(f.path); symlinkSync(other, f.path); }
    const path = kind === 'outside' ? '../outside.bin' : '.nutrition-eval/corpus-quality-v2/images/' + f.first.image.sha256 + '.bin';
    await expect(readCalibrationV2BoundedFile(f.mini.root, path, kind === 'size' ? 1 : 5 * 1024 * 1024)).rejects.toThrow(/unsafe|size|symlink/);
  }, 30000);
});
