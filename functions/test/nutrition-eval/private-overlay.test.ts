import { afterEach, describe, expect, it } from 'vitest';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { mkdtemp, realpath, rm, symlink, writeFile } from 'fs/promises';

import { sha256Hex } from '../../src/nutrition-eval/assets';
import { loadPrivateOverlay, mergePrivateOverlay } from '../../src/nutrition-eval/private-overlay';

import type { NutritionEvalCase, NutritionEvalManifest } from '../../src/nutrition-eval/schema';

const validPng = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
  0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54,
  0x08, 0xd7, 0x63, 0xf8, 0x0f, 0x00, 0x01, 0x01, 0x01, 0x00, 0x07, 0x9a, 0x2b,
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

function privateCase(overrides: Partial<NutritionEvalCase> = {}): NutritionEvalCase {
  return {
    id: 'private-case',
    visibility: 'private',
    scanMode: 'label',
    source: { dataset: 'private-fixture', objectId: 'private-object' },
    image: {
      path: 'asset.png',
      sha256: sha256Hex(validPng),
      mediaType: 'image/png',
      width: 1,
      height: 1,
    },
    truth: { basis: 'package', amount: 1, unit: 'ml', kcal: 85, proteinG: 0, carbsG: 21, fatG: 0 },
    toleranceClass: 'label-exact',
    attributionId: 'private-source',
    ...overrides,
  };
}

function publicCase(overrides: Partial<NutritionEvalCase> = {}): NutritionEvalCase {
  return {
    ...privateCase(),
    id: 'public-case',
    visibility: 'public',
    source: { dataset: 'public-fixture', objectId: 'public-object' },
    image: {
      url: 'https://example.test/public.png',
      sha256: sha256Hex(validPng),
      mediaType: 'image/png',
      width: 1,
      height: 1,
    },
    ...overrides,
  };
}

function manifest(cases: NutritionEvalCase[], datasetId = 'private-dataset'): NutritionEvalManifest {
  return { version: 1, datasetId, cases };
}

describe('nutrition-eval/private-overlay', () => {
  const roots: string[] = [];
  const aliases: string[] = [];

  afterEach(async () => {
    await Promise.all(aliases.splice(0).map((alias) => rm(alias, { recursive: true, force: true })));
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  async function createOverlay(value: unknown, asset = validPng): Promise<{ root: string; manifestPath: string }> {
    const root = await mkdtemp(join(tmpdir(), 'nutrition-overlay-'));
    roots.push(root);
    const manifestPath = join(root, 'manifest.json');
    await writeFile(manifestPath, JSON.stringify(value));
    await writeFile(join(root, 'asset.png'), asset);
    return { root, manifestPath };
  }

  async function expectSanitizedOverlayFailure(manifestPath: string, root: string): Promise<void> {
    const failure = await loadPrivateOverlay(manifestPath).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toMatchObject({ code: 'private_case_unavailable' });
    const message = failure instanceof Error ? failure.message : String(failure);
    expect(message).not.toContain(root);
    expect(message).not.toContain(manifestPath);
    expect(message).not.toContain(basename(root));
  }

  it('loads a valid private manifest with a verified portable 1x1 fixture', async () => {
    const input = manifest([privateCase()]);
    const { root, manifestPath } = await createOverlay(input);

    const overlay = await loadPrivateOverlay(manifestPath);

    expect(overlay.root).toBe(root);
    expect(overlay.manifest).toEqual(input);
  });

  it('accepts a valid overlay through a directory symlink and returns its canonical manifest root', async () => {
    const input = manifest([privateCase()]);
    const { root } = await createOverlay(input);
    const alias = `${root}-alias`;
    aliases.push(alias);
    await symlink(root, alias, 'dir');

    const overlay = await loadPrivateOverlay(join(alias, 'manifest.json'));

    expect(overlay.root).toBe(await realpath(root));
    expect(overlay.manifest).toEqual(input);
  });

  it.each([
    ['invalid JSON', '{not-json'],
    ['invalid schema', { version: 1, datasetId: 'private-dataset', cases: [] }],
    ['public case', manifest([publicCase()])],
  ])('rejects a %s overlay without leaking its local root', async (_label, value) => {
    const root = await mkdtemp(join(tmpdir(), 'nutrition-overlay-'));
    roots.push(root);
    const manifestPath = join(root, 'manifest.json');
    await writeFile(manifestPath, typeof value === 'string' ? value : JSON.stringify(value));

    await expectSanitizedOverlayFailure(manifestPath, root);
  });

  it.each([
    ['', 'empty path'],
    ['.', 'dot path'],
    ['file:///private/asset.png', 'file URL'],
    ['/private/asset.png', 'POSIX absolute path'],
    ['C:\\private\\asset.png', 'Windows drive path'],
    ['\\\\server\\share\\asset.png', 'Windows UNC path'],
    ['nested\\asset.png', 'backslash path'],
    ['nested/../asset.png', 'parent traversal'],
  ])('rejects a private %s before reading it', async (path, _label) => {
    const input = manifest([privateCase({
      image: {
        path,
        sha256: sha256Hex(validPng),
        mediaType: 'image/png',
        width: 1,
        height: 1,
      },
    })]);
    const { root, manifestPath } = await createOverlay(input);

    await expectSanitizedOverlayFailure(manifestPath, root);
  });

  it.each([
    ['missing asset', privateCase({ image: { path: 'missing.png', sha256: sha256Hex(validPng), mediaType: 'image/png', width: 1, height: 1 } })],
    ['checksum mismatch', privateCase({ image: { path: 'asset.png', sha256: '0'.repeat(64), mediaType: 'image/png', width: 1, height: 1 } })],
    ['media mismatch', privateCase({ image: { path: 'asset.png', sha256: sha256Hex(validPng), mediaType: 'image/jpeg', width: 1, height: 1 } })],
    ['dimension mismatch', privateCase({ image: { path: 'asset.png', sha256: sha256Hex(validPng), mediaType: 'image/png', width: 2, height: 1 } })],
  ])('preflights and rejects a private %s without leaking local paths', async (_label, testCase) => {
    const { root, manifestPath } = await createOverlay(manifest([testCase]));

    await expectSanitizedOverlayFailure(manifestPath, root);
  });

  it('rejects a symlinked private asset that resolves outside the canonical overlay root', async () => {
    const { root, manifestPath } = await createOverlay(manifest([privateCase()]));
    const outsideRoot = await mkdtemp(join(tmpdir(), 'nutrition-overlay-outside-'));
    roots.push(outsideRoot);
    const outsideAsset = join(outsideRoot, 'outside.png');
    await writeFile(outsideAsset, validPng);
    await rm(join(root, 'asset.png'));
    await symlink(outsideAsset, join(root, 'asset.png'));

    await expectSanitizedOverlayFailure(manifestPath, root);
  });

  it('merges public cases before private cases, retains the public dataset identity, and preserves truth', () => {
    const publicManifest = manifest([publicCase()], 'public-dataset');
    const privateManifest = manifest([privateCase()]);

    const merged = mergePrivateOverlay(publicManifest, privateManifest);

    expect(merged.datasetId).toBe('public-dataset');
    expect(merged.cases.map((testCase) => testCase.id)).toEqual(['public-case', 'private-case']);
    expect(merged.cases[1]?.truth).toEqual(privateManifest.cases[0]?.truth);
  });

  it.each([
    ['a public and private case ID', manifest([publicCase()]), manifest([privateCase({ id: 'public-case' })])],
    ['a public and private source object ID', manifest([publicCase()]), manifest([privateCase({ source: { dataset: 'private-fixture', objectId: 'public-object' } })])],
    ['duplicate case IDs within the public input', manifest([publicCase(), publicCase()]), manifest([privateCase()])],
    ['duplicate case IDs within the private input', manifest([publicCase()]), manifest([privateCase(), privateCase()])],
    ['duplicate source object IDs within the public input', manifest([publicCase(), publicCase({ id: 'another-public-case' })]), manifest([privateCase()])],
    ['duplicate source object IDs within the private input', manifest([publicCase()]), manifest([privateCase(), privateCase({ id: 'another-private-case' })])],
  ])('rejects %s rather than rewriting declared truth', (_label, publicManifest, privateManifest) => {
    expect(() => mergePrivateOverlay(publicManifest, privateManifest)).toThrow(/duplicate/i);
  });
});
