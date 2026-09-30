import { createHash } from 'node:crypto';
import type { OffProduct } from '../off-client';

export interface OffSnapshotLock {
  version: number;
  datasetId: string;
  baseUrl: string;
  snapshots: Record<string, OffSnapshotEntry>;
}

export interface OffSnapshotEntry {
  path: string;
  url: string;
  sha256: string;
}

export interface OffSnapshotStore {
  get(barcode: string): Readonly<OffProduct> | undefined;
  readonly size: number;
}

function deepFreeze<T>(obj: T): Readonly<T> {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const key of Object.keys(obj)) {
      const value = (obj as Record<string, unknown>)[key];
      if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        deepFreeze(value);
      }
    }
  }
  return obj as Readonly<T>;
}

export async function loadOffSnapshotLock(opts: {
  readFile: (path: string, encoding: string) => Promise<string | Buffer>;
}): Promise<OffSnapshotLock> {
  const lockPath = 'functions/eval/nutrition/off-snapshot-lock.json';
  const lockRaw = await opts.readFile(lockPath, 'utf8');
  const lockText = Buffer.isBuffer(lockRaw) ? lockRaw.toString('utf8') : lockRaw;
  return JSON.parse(lockText) as OffSnapshotLock;
}

export function validateOffSnapshotLock(lock: OffSnapshotLock): void {
  if (lock.version !== 1) {
    throw new Error('lock version must be 1');
  }
  if (lock.datasetId !== 'calorix-off-snapshot-v1') {
    throw new Error('lock datasetId must be calorix-off-snapshot-v1');
  }
  if (lock.baseUrl !== 'https://world.openfoodfacts.org/api/v3/') {
    throw new Error('lock baseUrl mismatch');
  }

  const expectedBarcodes = [
    '3017624010701',
    '5449000000996',
    '4056489686941',
    '7622210449283',
  ] as const;

  for (const barcode of expectedBarcodes) {
    if (!lock.snapshots[barcode]) {
      throw new Error(`missing barcode mapping: ${barcode}`);
    }
  }

  const snapshotKeys = Object.keys(lock.snapshots);

  for (const key of snapshotKeys) {
    if (!expectedBarcodes.includes(key as typeof expectedBarcodes[number])) {
      throw new Error(`extra barcode mapping: ${key}`);
    }
  }

  if (snapshotKeys.length !== expectedBarcodes.length) {
    throw new Error(`lock must contain exactly ${expectedBarcodes.length} barcodes`);
  }

  const OFF_FIELDS =
    'code,product_name,quantity,product_quantity,product_quantity_unit,' +
    'serving_size,serving_quantity,serving_quantity_unit,nutrition_data_per,nutriments';

  function expectedUrl(barcode: string): string {
    return (
      `https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(barcode)}` +
      `?fields=${encodeURIComponent(OFF_FIELDS)}`
    );
  }

  function expectedPath(barcode: string): string {
    return `functions/eval/nutrition/off-snapshots/${barcode}.json`;
  }

  for (const barcode of expectedBarcodes) {
    const entry = lock.snapshots[barcode];
    if (!entry) {
      throw new Error(`missing entry for ${barcode}`);
    }

    if (entry.path.includes('..') || entry.path.startsWith('/')) {
      throw new Error(`path traversal or absolute path for ${barcode}`);
    }

    if (entry.path !== expectedPath(barcode)) {
      throw new Error(`path mismatch for ${barcode}`);
    }

    if (entry.url !== expectedUrl(barcode)) {
      throw new Error(`URL mismatch for ${barcode}`);
    }

    if (!/^[a-f0-9]{64}$/i.test(entry.sha256)) {
      throw new Error(`invalid sha256 format for ${barcode}`);
    }
  }
}

export async function createOffSnapshotStore(opts: {
  readFile: (path: string, encoding: string) => Promise<string | Buffer>;
  fetchOffProductFn: (barcode: string, options: { fetchFn: typeof fetch }) => Promise<OffProduct | null>;
}): Promise<OffSnapshotStore> {
  const lock = await loadOffSnapshotLock({ readFile: opts.readFile });
  validateOffSnapshotLock(lock);

  const products = new Map<string, Readonly<OffProduct>>();

  for (const [barcode, entry] of Object.entries(lock.snapshots)) {
    const rawBytes = await opts.readFile(entry.path, 'utf8');
    const buffer = Buffer.isBuffer(rawBytes) ? rawBytes : Buffer.from(rawBytes, 'utf8');

    const actualHash = createHash('sha256').update(buffer).digest('hex');
    if (actualHash !== entry.sha256) {
      throw new Error(`sha256 mismatch for ${barcode}`);
    }

    // Snapshot replay serves the verified bytes and ignores transport opts
    // (method/headers/signal) supplied by the production parser.
    const fetchFn: typeof fetch = async (
      input: string | URL | Request,
      _init?: RequestInit,
    ): Promise<Response> => {
      const url =
        typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString();
      if (url !== entry.url) {
        throw new Error(`unexpected fetch URL: ${url}`);
      }
      return new Response(buffer, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const parsed = await opts.fetchOffProductFn(barcode, { fetchFn });
    if (!parsed) {
      throw new Error(`parser returned null for ${barcode}`);
    }
    if (parsed.barcode !== barcode) {
      throw new Error(`product.code mismatch for ${barcode}`);
    }

    products.set(barcode, deepFreeze(parsed));
  }

  const store: OffSnapshotStore = {
    get(barcode: string): Readonly<OffProduct> | undefined {
      return products.get(barcode);
    },
    get size(): number {
      return products.size;
    },
  };

  return Object.freeze(store);
}