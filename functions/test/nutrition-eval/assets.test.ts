import { afterEach, describe, it, expect, beforeEach, vi } from 'vitest';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'fs/promises';

// These imports will fail until implementation exists - that's the RED phase
import { inspectImage } from '../../src/nutrition-eval/image-metadata';
import { sha256Hex, loadVerifiedCaseImage } from '../../src/nutrition-eval/assets';

import type { NutritionEvalCase } from '../../src/nutrition-eval/schema';

// ── Tiny valid PNG (1x1 transparent) ──────────────────────────────────────────
// PNG signature + IHDR (1x1) + IDAT (empty) + IEND
const validPng = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // signature
  0x00, 0x00, 0x00, 0x0d, // IHDR length
  0x49, 0x48, 0x44, 0x52, // "IHDR"
  0x00, 0x00, 0x00, 0x01, // width: 1
  0x00, 0x00, 0x00, 0x01, // height: 1
  0x08, 0x06, 0x00, 0x00, 0x00, // bit depth, color type, compression, filter, interlace
  0x1f, 0x15, 0xc4, 0x89, // CRC
  0x00, 0x00, 0x00, 0x0c, // IDAT length
  0x49, 0x44, 0x41, 0x54, // "IDAT"
  0x08, 0xd7, 0x63, 0xf8, 0x0f, 0x00, 0x01, 0x01, 0x01, 0x00, 0x07, 0x9a, 0x2b, // compressed data + CRC
  0x00, 0x00, 0x00, 0x00, // IEND length
  0x49, 0x45, 0x4e, 0x44, // "IEND"
  0xae, 0x42, 0x60, 0x82, // CRC
]);

// ── Tiny valid JPEG (1x1) ─────────────────────────────────────────────────────
// SOI + APP0 (JFIF) + SOF0 (1x1) + DHT (minimal) + SOS + EOI
const validJpeg = new Uint8Array([
  0xff, 0xd8, // SOI
  0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, // APP0
  0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, // SOF0 baseline DCT, 1x1
  0xff, 0xc4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08, // DHT
  0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, // SOS
  0xff, 0xd9, // EOI
]);

// ── Test case factory ─────────────────────────────────────────────────────────
function makeTestCase(overrides: Partial<NutritionEvalCase> = {}): NutritionEvalCase {
  return {
    id: 'test-case-1',
    visibility: 'public',
    scanMode: 'meal',
    source: { dataset: 'test', objectId: 'obj-1' },
    image: {
      url: 'https://example.com/test.png',
      sha256: 'a'.repeat(64),
      mediaType: 'image/png',
      width: 1,
      height: 1,
    },
    truth: {
      basis: 'portion',
      amount: 1,
      unit: 'portion',
      kcal: 100,
      proteinG: 10,
      carbsG: 20,
      fatG: 5,
    },
    toleranceClass: 'meal-estimate',
    attributionId: 'test-attribution',
    ...overrides,
  };
}

describe('nutrition-eval/assets', () => {
  let cacheRoot: string;

  beforeEach(async () => {
    cacheRoot = await mkdtemp(join(tmpdir(), 'nutrition-eval-test-'));
  });

  afterEach(async () => {
    await rm(cacheRoot, { recursive: true, force: true });
  });

  describe('inspectImage', () => {
    it('returns correct mediaType, width, height for valid PNG', () => {
      const result = inspectImage(validPng);
      expect(result).toEqual({ mediaType: 'image/png', width: 1, height: 1 });
    });

    it('returns correct mediaType, width, height for valid JPEG', () => {
      const result = inspectImage(validJpeg);
      expect(result).toEqual({ mediaType: 'image/jpeg', width: 1, height: 1 });
    });

    it('throws on invalid PNG signature', () => {
      const badPng = new Uint8Array([0x00, 0x00, 0x00, 0x00]);
      expect(() => inspectImage(badPng)).toThrow();
    });

    it('throws on invalid JPEG signature', () => {
      const badJpeg = new Uint8Array([0x00, 0x00]);
      expect(() => inspectImage(badJpeg)).toThrow();
    });

    it('throws on truncated PNG', () => {
      const truncated = validPng.slice(0, 20);
      expect(() => inspectImage(truncated)).toThrow();
    });

    it('throws on truncated JPEG', () => {
      const truncated = validJpeg.slice(0, 10);
      expect(() => inspectImage(truncated)).toThrow();
    });
  });

  describe('sha256Hex', () => {
    it('produces lowercase 64-char hex for known input', () => {
      const input = new TextEncoder().encode('hello');
      const hash = sha256Hex(input);
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      // Known SHA-256 of "hello"
      expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    });

    it('produces different hashes for different inputs', () => {
      const h1 = sha256Hex(new TextEncoder().encode('a'));
      const h2 = sha256Hex(new TextEncoder().encode('b'));
      expect(h1).not.toBe(h2);
    });
  });

  describe('loadVerifiedCaseImage', () => {
    it('success: fetches, verifies hash/media/dimensions, caches atomically, returns bytes', async () => {
      const testCase = makeTestCase({
        image: {
          url: 'https://example.com/test.png',
          sha256: sha256Hex(validPng),
          mediaType: 'image/png',
          width: 1,
          height: 1,
        },
      });

      let fetchCount = 0;
      const fetchFn = vi.fn(async () => {
        fetchCount++;
        return new Response(validPng, { status: 200 });
      });

      const result = await loadVerifiedCaseImage(testCase, { cacheRoot, fetchFn });

      expect(result).toEqual(validPng);
      expect(fetchCount).toBe(1);
      expect(fetchFn).toHaveBeenCalledWith(testCase.image.url);
    });

    it('checksum mismatch: throws typed dataset_checksum_mismatch error', async () => {
      const testCase = makeTestCase({
        image: {
          url: 'https://example.com/test.png',
          sha256: '0'.repeat(64), // wrong hash
          mediaType: 'image/png',
          width: 1,
          height: 1,
        },
      });

      const fetchFn = vi.fn(async () => new Response(validPng, { status: 200 }));

      await expect(loadVerifiedCaseImage(testCase, { cacheRoot, fetchFn }))
        .rejects.toMatchObject({ code: 'dataset_checksum_mismatch' });

      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('HTTP failure: throws typed dataset_fetch_failed error with status', async () => {
      const testCase = makeTestCase({
        image: {
          url: 'https://example.com/test.png',
          sha256: sha256Hex(validPng),
          mediaType: 'image/png',
          width: 1,
          height: 1,
        },
      });

      const fetchFn = vi.fn(async () => new Response(null, { status: 404, statusText: 'Not Found' }));

      await expect(loadVerifiedCaseImage(testCase, { cacheRoot, fetchFn }))
        .rejects.toMatchObject({ code: 'dataset_fetch_failed' });

      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('media type mismatch: throws typed dataset_media_mismatch error', async () => {
      const testCase = makeTestCase({
        image: {
          url: 'https://example.com/test.png',
          sha256: sha256Hex(validPng),
          mediaType: 'image/jpeg', // declared JPEG but PNG bytes
          width: 1,
          height: 1,
        },
      });

      const fetchFn = vi.fn(async () => new Response(validPng, { status: 200 }));

      await expect(loadVerifiedCaseImage(testCase, { cacheRoot, fetchFn }))
        .rejects.toMatchObject({ code: 'dataset_media_mismatch' });
    });

    it('dimension mismatch: throws typed dataset_dimension_mismatch error', async () => {
      const testCase = makeTestCase({
        image: {
          url: 'https://example.com/test.png',
          sha256: sha256Hex(validPng),
          mediaType: 'image/png',
          width: 999, // wrong width
          height: 1,
        },
      });

      const fetchFn = vi.fn(async () => new Response(validPng, { status: 200 }));

      await expect(loadVerifiedCaseImage(testCase, { cacheRoot, fetchFn }))
        .rejects.toMatchObject({ code: 'dataset_dimension_mismatch' });
    });

    it('cache reuse: second call does not invoke fetchFn again', async () => {
      const testCase = makeTestCase({
        image: {
          url: 'https://example.com/test.png',
          sha256: sha256Hex(validPng),
          mediaType: 'image/png',
          width: 1,
          height: 1,
        },
      });

      let fetchCount = 0;
      const fetchFn = vi.fn(async () => {
        fetchCount++;
        return new Response(validPng, { status: 200 });
      });

      // First call
      await loadVerifiedCaseImage(testCase, { cacheRoot, fetchFn });
      expect(fetchCount).toBe(1);

      // Second call - should use cache
      await loadVerifiedCaseImage(testCase, { cacheRoot, fetchFn });
      expect(fetchCount).toBe(1); // still 1, no second fetch
    });

    it('partial download cleanup on hash mismatch', async () => {
      const testCase = makeTestCase({
        image: {
          url: 'https://example.com/test.png',
          sha256: '0'.repeat(64),
          mediaType: 'image/png',
          width: 1,
          height: 1,
        },
      });

      const fetchFn = vi.fn(async () => new Response(validPng, { status: 200 }));

      await expect(loadVerifiedCaseImage(testCase, { cacheRoot, fetchFn })).rejects.toThrow();

      // Verify no partial files remain
      const files = await import('fs/promises').then(fs => fs.readdir(cacheRoot, { recursive: true }));
      const partialFiles = files.filter(f => f.toString().includes('.partial-'));
      expect(partialFiles).toHaveLength(0);
    });

    it('private case support: resolves from privateRoot when visibility is private', async () => {
      const privateRoot = join(cacheRoot, 'private');
      await mkdir(privateRoot, { recursive: true });
      const privatePath = join(privateRoot, 'test.jpg');
      await writeFile(privatePath, validJpeg);

      const testCase = makeTestCase({
        visibility: 'private',
        image: {
          path: 'test.jpg',
          sha256: sha256Hex(validJpeg),
          mediaType: 'image/jpeg',
          width: 1,
          height: 1,
        },
      } as NutritionEvalCase);

      const fetchFn = vi.fn();
      const result = await loadVerifiedCaseImage(testCase, { cacheRoot, fetchFn, privateRoot });

      expect(result).toEqual(validJpeg);
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('rejects every private traversal and never calls the network or leaks local roots', async () => {
      const privateRoot = join(cacheRoot, 'private');
      const outsideRoot = join(cacheRoot, 'outside');
      await Promise.all([
        mkdir(privateRoot, { recursive: true }),
        mkdir(outsideRoot, { recursive: true }),
      ]);
      await writeFile(join(outsideRoot, 'image.png'), validPng);
      await symlink(join(outsideRoot, 'image.png'), join(privateRoot, 'linked.png'));

      for (const path of ['../outside/image.png', 'linked.png']) {
        const testCase = makeTestCase({
          visibility: 'private',
          image: {
            path,
            sha256: sha256Hex(validPng),
            mediaType: 'image/png',
            width: 1,
            height: 1,
          },
        });
        const fetchFn = vi.fn();

        const failure = await loadVerifiedCaseImage(testCase, { cacheRoot, fetchFn, privateRoot }).then(
          () => undefined,
          (error: unknown) => error,
        );
        expect(failure).toMatchObject({ code: 'dataset_private_asset_unavailable' });
        const message = failure instanceof Error ? failure.message : String(failure);
        expect(message).not.toContain(privateRoot);
        expect(message).not.toContain(outsideRoot);
        expect(fetchFn).not.toHaveBeenCalled();
      }
    });

    it.each(['C:foo.png', 'C:dir/foo.png'])(
      'rejects a Windows drive-relative private path %s without fetching',
      async (path) => {
        const privateRoot = join(cacheRoot, 'private');
        const assetPath = join(privateRoot, path);
        await mkdir(dirname(assetPath), { recursive: true });
        await writeFile(assetPath, validPng);
        const testCase = makeTestCase({
          visibility: 'private',
          image: {
            path,
            sha256: sha256Hex(validPng),
            mediaType: 'image/png',
            width: 1,
            height: 1,
          },
        });
        const fetchFn = vi.fn();

        const failure = await loadVerifiedCaseImage(testCase, { cacheRoot, fetchFn, privateRoot }).then(
          () => undefined,
          (error: unknown) => error,
        );
        expect(failure).toMatchObject({ code: 'dataset_private_asset_unavailable' });
        expect(fetchFn).not.toHaveBeenCalled();
      },
    );

    it('rechecks canonical private containment and exact bytes on each load after a safe preflight', async () => {
      const privateRoot = join(cacheRoot, 'private');
      const outsideRoot = join(cacheRoot, 'outside');
      await Promise.all([
        mkdir(privateRoot, { recursive: true }),
        mkdir(outsideRoot, { recursive: true }),
      ]);
      const assetPath = join(privateRoot, 'asset.png');
      await writeFile(assetPath, validPng);
      await writeFile(join(outsideRoot, 'replacement.png'), validPng);
      const testCase = makeTestCase({
        visibility: 'private',
        image: {
          path: 'asset.png',
          sha256: sha256Hex(validPng),
          mediaType: 'image/png',
          width: 1,
          height: 1,
        },
      });
      const fetchFn = vi.fn();

      const preflightBytes = await loadVerifiedCaseImage(testCase, { cacheRoot, fetchFn, privateRoot });
      expect(preflightBytes).toEqual(validPng);

      await rm(assetPath);
      await symlink(join(outsideRoot, 'replacement.png'), assetPath);

      await expect(loadVerifiedCaseImage(testCase, { cacheRoot, fetchFn, privateRoot }))
        .rejects.toMatchObject({ code: 'dataset_private_asset_unavailable' });
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('rechecks private exact bytes on each actual load after an in-root regular-file replacement', async () => {
      const privateRoot = join(cacheRoot, 'private');
      await mkdir(privateRoot, { recursive: true });
      const assetPath = join(privateRoot, 'asset.png');
      await writeFile(assetPath, validPng);
      const testCase = makeTestCase({
        visibility: 'private',
        image: {
          path: 'asset.png',
          sha256: sha256Hex(validPng),
          mediaType: 'image/png',
          width: 1,
          height: 1,
        },
      });
      const fetchFn = vi.fn();

      expect(await loadVerifiedCaseImage(testCase, { cacheRoot, fetchFn, privateRoot })).toEqual(validPng);
      await writeFile(assetPath, new Uint8Array([...validPng, 0x00]));

      const failure = await loadVerifiedCaseImage(testCase, { cacheRoot, fetchFn, privateRoot }).then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(failure).toMatchObject({ code: 'dataset_checksum_mismatch' });
      const message = failure instanceof Error ? failure.message : String(failure);
      expect(message).not.toContain(privateRoot);
      expect(message).not.toContain(assetPath);
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it.each([
      ['checksum', { sha256: '0'.repeat(64) }],
      ['media type', { mediaType: 'image/jpeg' as const }],
      ['dimensions', { width: 2 }],
    ])('verifies private exact bytes for a %s mismatch without fetching', async (_label, imageOverride) => {
      const privateRoot = join(cacheRoot, 'private');
      await mkdir(privateRoot, { recursive: true });
      await writeFile(join(privateRoot, 'asset.png'), validPng);
      const testCase = makeTestCase({
        visibility: 'private',
        image: {
          path: 'asset.png',
          sha256: sha256Hex(validPng),
          mediaType: 'image/png',
          width: 1,
          height: 1,
          ...imageOverride,
        },
      });
      const fetchFn = vi.fn();

      await expect(loadVerifiedCaseImage(testCase, { cacheRoot, fetchFn, privateRoot }))
        .rejects.toMatchObject({
          code: _label === 'checksum'
            ? 'dataset_checksum_mismatch'
            : _label === 'media type' ? 'dataset_media_mismatch' : 'dataset_dimension_mismatch',
        });
      expect(fetchFn).not.toHaveBeenCalled();
    });
  });
});
