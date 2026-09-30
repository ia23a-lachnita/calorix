import { createHash } from 'node:crypto';
import { readFile as readRealFile } from 'node:fs/promises';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { fetchOffProduct } from '../../src/off-client';
import {
  loadOffSnapshotLock,
  validateOffSnapshotLock,
  createOffSnapshotStore,
} from '../../src/nutrition-eval/off-snapshot-store';

const FOUR_BARCODES = [
  '3017624010701',
  '5449000000996',
  '4056489686941',
  '7622210449283',
] as const;

const BASE_URL = 'https://world.openfoodfacts.org/api/v3/';

// Exact production field list from functions/src/off-client.ts fetchOffProduct.
const OFF_FIELDS =
  'code,product_name,quantity,product_quantity,product_quantity_unit,' +
  'serving_size,serving_quantity,serving_quantity_unit,nutrition_data_per,nutriments';

function snapshotUrl(barcode: string): string {
  return (
    `https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(barcode)}` +
    `?fields=${encodeURIComponent(OFF_FIELDS)}`
  );
}

function sha256Hex(bytes: string | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

// Minimal but complete OFF v3 success envelopes. Per-barcode nutrients are
// distinct so a swapped file or product.code mismatch is observable.
function rawV3Envelope(barcode: string): Record<string, unknown> {
  switch (barcode) {
    case '3017624010701':
      return {
        status: 'success',
        result: { id: 'product_found' },
        product: {
          code: barcode,
          product_name: 'Nutella',
          quantity: '400 g',
          product_quantity: 400,
          product_quantity_unit: 'g',
          nutriments: {
            'energy-kcal_100g': 539,
            proteins_100g: 6.3,
            carbohydrates_100g: 57.5,
            fat_100g: 30.9,
          },
        },
      };
    case '5449000000996':
      return {
        status: 'success',
        result: { id: 'product_found' },
        product: {
          code: barcode,
          product_name: 'Coca-Cola',
          quantity: '330 ml',
          product_quantity: 330,
          product_quantity_unit: 'ml',
          nutriments: {
            'energy-kcal_100g': 42,
            proteins_100g: 0,
            carbohydrates_100g: 10.6,
            fat_100g: 0,
          },
        },
      };
    case '4056489686941':
      return {
        status: 'success',
        result: { id: 'product_found' },
        product: {
          code: barcode,
          product_name: 'Freeway Cola',
          quantity: '330 ml',
          product_quantity: 330,
          product_quantity_unit: 'ml',
          nutriments: {
            'energy-kcal_100g': 1,
            proteins_100g: 0,
            carbohydrates_100g: 0,
            fat_100g: 0,
          },
        },
      };
    default:
      return {
        status: 'success',
        result: { id: 'product_found' },
        product: {
          code: barcode,
          product_name: 'Prince',
          quantity: '300 g',
          product_quantity: 300,
          product_quantity_unit: 'g',
          nutriments: {
            'energy-kcal_100g': 466,
            proteins_100g: 6.3,
            carbohydrates_100g: 68,
            fat_100g: 17,
          },
        },
      };
  }
}

function rawBytesByBarcode(): Map<string, string> {
  const map = new Map<string, string>();
  for (const barcode of FOUR_BARCODES) {
    map.set(barcode, JSON.stringify(rawV3Envelope(barcode)));
  }
  return map;
}

function snapshotPath(barcode: string): string {
  return `functions/eval/nutrition/off-snapshots/${barcode}.json`;
}

function makeLock(rawByBarcode: Map<string, string>) {
  const snapshots: Record<string, { path: string; url: string; sha256: string }> = {};
  for (const barcode of FOUR_BARCODES) {
    snapshots[barcode] = {
      path: snapshotPath(barcode),
      url: snapshotUrl(barcode),
      sha256: sha256Hex(rawByBarcode.get(barcode)!),
    };
  }
  return {
    version: 1,
    datasetId: 'calorix-off-snapshot-v1',
    baseUrl: BASE_URL,
    snapshots,
  };
}

// readFile is the single source of truth: lock JSON as text, raw snapshots
// as Buffer bytes. There is no independent URL->bytes map; the parser spy
// serves Response bodies from these exact read bytes via a store-supplied
// local fetchFn.
function makeReadFile(lockJson: string, rawByPath: Map<string, Buffer>) {
  return vi.fn(async (path: string, encoding: string) => {
    if (path.endsWith('off-snapshot-lock.json')) return lockJson;
    const raw = rawByPath.get(path);
    if (raw === undefined) throw new Error(`ENOENT: ${path}`);
    void encoding;
    return raw;
  });
}

function rawByPath(rawByBarcode: Map<string, string>): Map<string, Buffer> {
  const map = new Map<string, Buffer>();
  for (const [barcode, raw] of rawByBarcode) {
    map.set(snapshotPath(barcode), Buffer.from(raw, 'utf8'));
  }
  return map;
}

type ParseSpy = ReturnType<typeof vi.fn>;

function makeParseSpy(): ParseSpy {
  // Real production parser. The fetchFn comes from the store under test, so
  // the Response body is exactly the bytes the store read via readFile. If
  // the store ignores those bytes or touches global fetch, this spy fails.
  return vi.fn(async (barcode: string, opts: { fetchFn: typeof fetch }) =>
    fetchOffProduct(barcode, { fetchFn: opts.fetchFn }),
  );
}

interface StoreHarness {
  lock: ReturnType<typeof makeLock>;
  readFile: ReturnType<typeof makeReadFile>;
  parseSpy: ParseSpy;
  rawByBarcode: Map<string, string>;
}

function makeHarness(): StoreHarness {
  const rawByBarcode = rawBytesByBarcode();
  const lock = makeLock(rawByBarcode);
  const readFile = makeReadFile(JSON.stringify(lock), rawByPath(rawByBarcode));
  return { lock, readFile, parseSpy: makeParseSpy(), rawByBarcode };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubGlobalFetchMustNotBeUsed(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('global fetch must not be used');
    }),
  );
}

describe('off-snapshot-store lock', () => {
  it('loads the committed lock through the injected readFile', async () => {
    const { lock, readFile } = makeHarness();
    const result = await loadOffSnapshotLock({ readFile });
    expect(result).toEqual(lock);
    expect(readFile).toHaveBeenCalledWith(expect.stringContaining('off-snapshot-lock.json'), 'utf8');
  });

  it('rejects a missing lock file', async () => {
    const readFile = vi.fn(async () => {
      throw new Error('ENOENT: off-snapshot-lock.json');
    });
    await expect(loadOffSnapshotLock({ readFile })).rejects.toThrow(/not found|ENOENT/);
  });

  it('accepts exactly the four locked barcodes', () => {
    const { lock } = makeHarness();
    expect(() => validateOffSnapshotLock(lock)).not.toThrow();
  });

  it('rejects a missing barcode mapping', () => {
    const { lock } = makeHarness();
    delete lock.snapshots['3017624010701'];
    expect(() => validateOffSnapshotLock(lock)).toThrow(/missing.*3017624010701/);
  });

  it('rejects an extra barcode mapping', () => {
    const { lock, rawByBarcode } = makeHarness();
    lock.snapshots['9999999999999'] = {
      path: snapshotPath('9999999999999'),
      url: snapshotUrl('9999999999999'),
      sha256: sha256Hex(rawByBarcode.get('3017624010701')!),
    };
    expect(() => validateOffSnapshotLock(lock)).toThrow(/extra|unexpected/);
  });

  it('rejects a URL that does not match its barcode', () => {
    const { lock } = makeHarness();
    lock.snapshots['3017624010701']!.url = snapshotUrl('5449000000996');
    expect(() => validateOffSnapshotLock(lock)).toThrow(/URL|mismatch/);
  });

  it('rejects a snapshot URL missing the exact production fields query', () => {
    const { lock } = makeHarness();
    lock.snapshots['3017624010701']!.url =
      'https://world.openfoodfacts.org/api/v3/product/3017624010701';
    expect(() => validateOffSnapshotLock(lock)).toThrow(/URL|fields|mismatch/);
  });

  it('rejects a snapshot URL with an unexpected extra query', () => {
    const { lock } = makeHarness();
    lock.snapshots['3017624010701']!.url = `${snapshotUrl('3017624010701')}&extra=1`;
    expect(() => validateOffSnapshotLock(lock)).toThrow(/URL|extra|unexpected|mismatch/);
  });

  it('rejects a path that does not match its barcode', () => {
    const { lock } = makeHarness();
    lock.snapshots['3017624010701']!.path = snapshotPath('5449000000996');
    expect(() => validateOffSnapshotLock(lock)).toThrow(/path|mismatch/);
  });

  it('rejects path traversal', () => {
    const { lock } = makeHarness();
    lock.snapshots['3017624010701']!.path =
      'functions/eval/nutrition/off-snapshots/../../etc/passwd';
    expect(() => validateOffSnapshotLock(lock)).toThrow(/traversal|\.\./);
  });

  it('rejects an absolute snapshot path', () => {
    const { lock } = makeHarness();
    lock.snapshots['3017624010701']!.path = '/tmp/3017624010701.json';
    expect(() => validateOffSnapshotLock(lock)).toThrow(/absolute|relative/);
  });
});

describe('off-snapshot-store startup', () => {
  it('parses each raw v3 file once through the production parser before any lookup', async () => {
    stubGlobalFetchMustNotBeUsed();
    const { readFile, parseSpy } = makeHarness();
    const store = await createOffSnapshotStore({
      readFile,
      fetchOffProductFn: parseSpy,
    });

    expect(parseSpy).toHaveBeenCalledTimes(FOUR_BARCODES.length);
    for (const barcode of FOUR_BARCODES) {
      expect(parseSpy).toHaveBeenCalledWith(
        barcode,
        expect.objectContaining({ fetchFn: expect.any(Function) }),
      );
    }
    // Lock plus four snapshot files are the only startup reads.
    expect(readFile).toHaveBeenCalledTimes(1 + FOUR_BARCODES.length);
    expect(store.size).toBe(4);
  });

  it('replays distinct per-barcode nutrients from the raw envelopes', async () => {
    stubGlobalFetchMustNotBeUsed();
    const { readFile, parseSpy } = makeHarness();
    const store = await createOffSnapshotStore({
      readFile,
      fetchOffProductFn: parseSpy,
    });

    expect(store.get('3017624010701')).toMatchObject({ kcalPer100g: 539, barcode: '3017624010701' });
    expect(store.get('5449000000996')).toMatchObject({ kcalPer100g: 42, barcode: '5449000000996' });
    expect(store.get('4056489686941')).toMatchObject({ kcalPer100g: 1, barcode: '4056489686941' });
    expect(store.get('7622210449283')).toMatchObject({ kcalPer100g: 466, barcode: '7622210449283' });
    expect(store.get('9999999999999')).toBeUndefined();
  });

  it('rejects hash tampering in a snapshot file', async () => {
    stubGlobalFetchMustNotBeUsed();
    const { lock, rawByBarcode } = makeHarness();
    const tampered = rawByBarcode.get('3017624010701')!.replace('539', '538');
    const byPath = rawByPath(rawByBarcode);
    byPath.set(snapshotPath('3017624010701'), Buffer.from(tampered, 'utf8'));
    const tamperedRead = makeReadFile(JSON.stringify(lock), byPath);

    await expect(
      createOffSnapshotStore({
        readFile: tamperedRead,
        fetchOffProductFn: makeParseSpy(),
      }),
    ).rejects.toThrow(/sha256|integrity|mismatch|hash/);
  });

  it('rejects a malformed v3 product envelope with matching hash', async () => {
    stubGlobalFetchMustNotBeUsed();
    const { lock } = makeHarness();
    const malformed = JSON.stringify({
      status: 'success',
      result: { id: 'product_found' },
      product: { code: '3017624010701', product_name: '' },
    });
    const byPath = rawByPath(rawBytesByBarcode());
    byPath.set(snapshotPath('3017624010701'), Buffer.from(malformed, 'utf8'));
    const fixedLock = {
      ...lock,
      snapshots: {
        ...lock.snapshots,
        '3017624010701': {
          ...lock.snapshots['3017624010701']!,
          sha256: sha256Hex(malformed),
        },
      },
    };

    await expect(
      createOffSnapshotStore({
        readFile: makeReadFile(JSON.stringify(fixedLock), byPath),
        fetchOffProductFn: makeParseSpy(),
      }),
    ).rejects.toThrow(/parser|invalid|malformed|product/);
  });

  it('rejects a missing product envelope with matching hash', async () => {
    stubGlobalFetchMustNotBeUsed();
    const { lock } = makeHarness();
    const missingProduct = JSON.stringify({
      status: 'success',
      result: { id: 'product_found' },
    });
    const byPath = rawByPath(rawBytesByBarcode());
    byPath.set(snapshotPath('3017624010701'), Buffer.from(missingProduct, 'utf8'));
    const fixedLock = {
      ...lock,
      snapshots: {
        ...lock.snapshots,
        '3017624010701': {
          ...lock.snapshots['3017624010701']!,
          sha256: sha256Hex(missingProduct),
        },
      },
    };

    await expect(
      createOffSnapshotStore({
        readFile: makeReadFile(JSON.stringify(fixedLock), byPath),
        fetchOffProductFn: makeParseSpy(),
      }),
    ).rejects.toThrow(/parser|invalid|missing|product/);
  });

  it('rejects a missing snapshot file', async () => {
    stubGlobalFetchMustNotBeUsed();
    const { lock, rawByBarcode } = makeHarness();
    const byPath = rawByPath(rawByBarcode);
    byPath.delete(snapshotPath('3017624010701'));
    const missingRead = makeReadFile(JSON.stringify(lock), byPath);

    await expect(
      createOffSnapshotStore({
        readFile: missingRead,
        fetchOffProductFn: makeParseSpy(),
      }),
    ).rejects.toThrow(/missing|not found|ENOENT/);
  });

  it('rejects a product.code mismatch with matching hash', async () => {
    stubGlobalFetchMustNotBeUsed();
    const { lock } = makeHarness();
    // Otherwise-valid envelope for another barcode stored under the locked slot.
    const mismatched = JSON.stringify(rawV3Envelope('5449000000996'));
    expect(mismatched).toContain('5449000000996');
    const byPath = rawByPath(rawBytesByBarcode());
    byPath.set(snapshotPath('3017624010701'), Buffer.from(mismatched, 'utf8'));
    const fixedLock = {
      ...lock,
      snapshots: {
        ...lock.snapshots,
        '3017624010701': {
          ...lock.snapshots['3017624010701']!,
          sha256: sha256Hex(mismatched),
        },
      },
    };

    await expect(
      createOffSnapshotStore({
        readFile: makeReadFile(JSON.stringify(fixedLock), byPath),
        fetchOffProductFn: makeParseSpy(),
      }),
    ).rejects.toThrow(/mismatch|barcode|code/);
  });
});

describe('off-snapshot-store runtime isolation', () => {
  it('lookup performs no file reads and no network after construction', async () => {
    stubGlobalFetchMustNotBeUsed();
    const { readFile, parseSpy } = makeHarness();
    const store = await createOffSnapshotStore({
      readFile,
      fetchOffProductFn: parseSpy,
    });

    readFile.mockClear();
    parseSpy.mockClear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network must not be used at lookup');
      }),
    );

    for (const barcode of FOUR_BARCODES) {
      expect(store.get(barcode)?.barcode).toBe(barcode);
    }
    expect(store.get('9999999999999')).toBeUndefined();

    expect(readFile).not.toHaveBeenCalled();
    expect(parseSpy).not.toHaveBeenCalled();
  });
});

describe('off-snapshot-store committed lock integration', () => {
  it('committed lock maps exactly four barcodes to exact paths, production URLs, and pinned SHA256s matching real bytes', async () => {
    const EXPECTED_SHA256: Record<string, string> = {
      '3017624010701': '6d2d26a27dbc66a85dbb82a538f11e55118c6b8d9e2e3e498851c44bf9870602',
      '5449000000996': '24763e361ef54bcfbc3736966bdadeb4bc4eea9d24a96896740def1b93febbf2',
      '4056489686941': '7e7e30b7aabd564c21fdd645f5c3ba11e9d718a79fa90f7e3f90f2f9f7895906',
      '7622210449283': 'bdd38934d1af3d39584049b75a2c73a5b9f5ec7105bded32fda1f45f8e9af80f',
    };
    const lockUrl = new URL('../../eval/nutrition/off-snapshot-lock.json', import.meta.url);
    const lockText = await readRealFile(lockUrl, 'utf8');
    const lock = JSON.parse(lockText) as {
      snapshots: Record<string, { path: string; url: string; sha256: string }>;
    };
    expect(Object.keys(lock.snapshots).sort()).toEqual([...FOUR_BARCODES].sort());
    expect(() => validateOffSnapshotLock(lock)).not.toThrow();
    for (const barcode of FOUR_BARCODES) {
      expect(lock.snapshots[barcode]!.path).toBe(snapshotPath(barcode));
      expect(lock.snapshots[barcode]!.url).toBe(snapshotUrl(barcode));
      expect(lock.snapshots[barcode]!.sha256).toBe(EXPECTED_SHA256[barcode]);
      const raw = await readRealFile(
        new URL(`../../eval/nutrition/off-snapshots/${barcode}.json`, import.meta.url),
      );
      expect(sha256Hex(raw)).toBe(EXPECTED_SHA256[barcode]);
      expect(sha256Hex(raw)).toBe(lock.snapshots[barcode]!.sha256);
    }
  });
});

describe('off-snapshot-store runtime immutability', () => {
  it('products cannot be mutated through .get and the map exposes no usable set/delete/clear', async () => {
    stubGlobalFetchMustNotBeUsed();
    const { readFile, parseSpy } = makeHarness();
    const store = await createOffSnapshotStore({
      readFile,
      fetchOffProductFn: parseSpy,
    });

    const originalKcal: Record<string, unknown> = {
      '3017624010701': 539,
      '5449000000996': 42,
      '4056489686941': 1,
      '7622210449283': 466,
    };
    for (const barcode of FOUR_BARCODES) {
      const product = store.get(barcode) as unknown as Record<string, unknown>;
      expect(product).toMatchObject({ barcode, kcalPer100g: originalKcal[barcode] });
      let threw = false;
      try {
        product['kcalPer100g'] = 9999;
        (product as Record<string, unknown>)['injectedField'] = true;
      } catch {
        threw = true;
      }
      const reread = store.get(barcode) as unknown as Record<string, unknown>;
      expect(reread['kcalPer100g']).toBe(originalKcal[barcode]);
      expect(reread).not.toHaveProperty('injectedField');
      expect(threw || reread['kcalPer100g'] === originalKcal[barcode]).toBe(true);
    }

    const mutable = store as unknown as Record<string, unknown>;
    for (const method of ['set', 'delete', 'clear'] as const) {
      const candidate = mutable[method];
      if (candidate === undefined) continue;
      if (method === 'set') {
        expect(() =>
          (candidate as (key: string, value: unknown) => unknown).call(store, '__probe__', {
            probe: true,
          }),
        ).toThrow();
      } else if (method === 'delete') {
        expect(() =>
          (candidate as (key: string) => unknown).call(store, '3017624010701'),
        ).toThrow();
      } else {
        expect(() => (candidate as () => unknown).call(store)).toThrow();
      }
    }

    expect(store.size).toBe(4);
    expect(store.get('__probe__')).toBeUndefined();
    for (const barcode of FOUR_BARCODES) {
      expect(store.get(barcode)).toMatchObject({
        barcode,
        kcalPer100g: originalKcal[barcode],
      });
    }
  });
});
