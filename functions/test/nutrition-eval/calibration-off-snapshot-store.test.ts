/**
 * Calibration off-snapshot startup RED contract (Task 1, Step 1).
 *
 * If `functions/src/nutrition-eval/calibration-off-snapshot-store.ts` is
 * absent, every factory case fails at dynamic-import time with a
 * missing-module error. Do NOT create a stub or placeholder source to
 * satisfy these tests; the main host authorizes a source worker separately.
 *
 * Hermetic contract: tests load the committed UTF8 lock plus four committed
 * OFF payloads through portable `new URL(..., import.meta.url)` paths and
 * inject them via the closed `{ lockText, readSnapshot }` deps. The
 * production parser (`fetchOffProduct`) is wrapped via `importOriginal` and
 * always delegates to the real implementation — products are never
 * fabricated. No provider client, SDK construction, network, Firebase, or
 * device access occurs here.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { inspect } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CALIBRATION_OFF_SNAPSHOT_LOCK_SHA256 } from '../../src/nutrition-eval/calibration-cli';
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';
import type { GenAIAdapter } from '../../src/genai-adapter';
import type { ReservationKey } from '../../src/nutrition-eval/calibration';
import { createLiveNutritionEvalAdapter } from '../../src/nutrition-eval/live-adapter';
import type { OffProduct } from '../../src/off-client';
import type { OffSnapshotStore } from '../../src/nutrition-eval/off-snapshot-store';
import { runNutritionEval } from '../../src/nutrition-eval/runner';
import { parseNutritionEvalManifest } from '../../src/nutrition-eval/schema';

const shared = vi.hoisted(() => ({ events: [] as string[], globalFetchCalls: 0 }));

vi.mock('../../src/off-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/off-client')>();
  const fetchOffProduct = (...args: Parameters<typeof actual.fetchOffProduct>) => {
    shared.events.push(`parser:${args[0]}`);
    return actual.fetchOffProduct(...args);
  };
  return { ...actual, fetchOffProduct };
});

const INPUT_INVALID = 'calibration:off-snapshot-input-invalid';
const STARTUP_FAILED = 'calibration:off-snapshot-startup-failed';
const SECRET_SENTINEL = 'SECRET-OFF-SNAPSHOT-9c41ab';

const FOUR_BARCODES = [
  '3017624010701',
  '5449000000996',
  '4056489686941',
  '7622210449283',
] as const;

const FIXED_PATHS = FOUR_BARCODES.map(
  (barcode) => `functions/eval/nutrition/off-snapshots/${barcode}.json`,
);

const LOCK_URL = new URL('../../eval/nutrition/off-snapshot-lock.json', import.meta.url);
const MANIFEST_URL = new URL('../../eval/nutrition/public-manifest.json', import.meta.url);

function snapshotUrl(barcode: string): URL {
  return new URL(`../../eval/nutrition/off-snapshots/${barcode}.json`, import.meta.url);
}

type FactoryFn = (deps: unknown) => Promise<OffSnapshotStore>;

async function loadFactory(): Promise<FactoryFn> {
  const mod = await import('../../src/nutrition-eval/calibration-off-snapshot-store');
  const factory = (mod as unknown as Record<string, unknown>).prepareCalibrationOffSnapshotStore;
  expect(typeof factory).toBe('function');
  return factory as FactoryFn;
}

interface ValidDeps {
  lockText: string;
  readSnapshot: (path: string) => Promise<string>;
  payloads: Map<string, string>;
}

async function makeValidDeps(): Promise<ValidDeps> {
  const lockText = await readFile(LOCK_URL, 'utf8');
  const payloads = new Map<string, string>();
  for (const barcode of FOUR_BARCODES) {
    payloads.set(
      `functions/eval/nutrition/off-snapshots/${barcode}.json`,
      await readFile(snapshotUrl(barcode), 'utf8'),
    );
  }
  const readSnapshot = async (path: string): Promise<string> => {
    shared.events.push(`read:${path}`);
    const payload = payloads.get(path);
    if (payload === undefined) throw new Error(`ENOENT: ${path}`);
    return payload;
  };
  return { lockText, readSnapshot, payloads };
}

function parserBarcodes(): string[] {
  return shared.events
    .filter((event) => event.startsWith('parser:'))
    .map((event) => event.slice('parser:'.length));
}

function readPaths(): string[] {
  return shared.events
    .filter((event) => event.startsWith('read:'))
    .map((event) => event.slice('read:'.length));
}

async function captureError(factory: FactoryFn, deps: unknown): Promise<unknown> {
  try {
    await factory(deps);
  } catch (error) {
    return error;
  }
  throw new Error('expected factory to reject but it resolved');
}

function expectStaticFatal(error: unknown, message: string, sentinel?: string): void {
  expect(error).toBeInstanceOf(CalibrationFatalError);
  const fatal = error as CalibrationFatalError;
  expect(fatal.message).toBe(message);
  expect(fatal.name).toBe('CalibrationFatalError');
  expect(fatal.cause).toBeUndefined();
  expect(Object.getOwnPropertyNames(fatal)).not.toContain('cause');
  if (sentinel !== undefined) {
    const surfaces = [
      fatal.name,
      fatal.message,
      String(fatal),
      fatal.stack ?? '',
      inspect(fatal, { depth: null, showHidden: true }),
    ];
    for (const surface of surfaces) expect(surface).not.toContain(sentinel);
  }
}

beforeEach(() => {
  shared.events.length = 0;
  shared.globalFetchCalls = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      shared.globalFetchCalls += 1;
      throw new Error('global fetch must not be used');
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('calibration off-snapshot factory contract', () => {
  it('exposes prepareCalibrationOffSnapshotStore as a callable factory', async () => {
    const factory = await loadFactory();
    expect(typeof factory).toBe('function');
  });

  it('pins the committed lock bytes to CALIBRATION_OFF_SNAPSHOT_LOCK_SHA256', async () => {
    const lockText = await readFile(LOCK_URL, 'utf8');
    expect(createHash('sha256').update(lockText, 'utf8').digest('hex')).toBe(
      CALIBRATION_OFF_SNAPSHOT_LOCK_SHA256,
    );
  });
});

describe('calibration off-snapshot startup happy path', () => {
  it('reads the four fixed paths once in order before any parser call', async () => {
    const factory = await loadFactory();
    const { lockText, readSnapshot } = await makeValidDeps();
    const store = await factory({ lockText, readSnapshot });

    expect(readPaths()).toEqual([...FIXED_PATHS]);
    expect(parserBarcodes().sort()).toEqual([...FOUR_BARCODES].sort());
    const firstParser = shared.events.findIndex((event) => event.startsWith('parser:'));
    const lastRead = shared.events.reduce(
      (latest, event, index) => (event.startsWith('read:') ? index : latest),
      -1,
    );
    expect(firstParser).toBeGreaterThan(lastRead);
    expect(store.size).toBe(4);
    expect(shared.globalFetchCalls).toBe(0);
  });

  it('returns all four barcodes with an undefined unknown lookup', async () => {
    const factory = await loadFactory();
    const { lockText, readSnapshot } = await makeValidDeps();
    const store = await factory({ lockText, readSnapshot });

    for (const barcode of FOUR_BARCODES) {
      expect(store.get(barcode)?.barcode).toBe(barcode);
    }
    expect(store.get('0000000000000')).toBeUndefined();
  });

  it('captures caller lock and reader before awaiting so stale replacement still succeeds', async () => {
    const factory = await loadFactory();
    const { lockText, payloads } = await makeValidDeps();
    const deps: Record<string, unknown> = { lockText, readSnapshot: undefined };
    let calls = 0;
    deps.readSnapshot = async (path: string): Promise<string> => {
      shared.events.push(`read:${path}`);
      calls += 1;
      if (calls === 1) {
        deps.lockText = JSON.stringify({ forged: true });
        deps.readSnapshot = async (): Promise<string> => {
          throw new Error('stale replacement reader must not be called');
        };
      }
      const payload = payloads.get(path);
      if (payload === undefined) throw new Error(`ENOENT: ${path}`);
      return payload;
    };
    const store = await factory(deps);
    expect(store.size).toBe(4);
    for (const barcode of FOUR_BARCODES) {
      expect(store.get(barcode)?.barcode).toBe(barcode);
    }
    expect(readPaths()).toEqual([...FIXED_PATHS]);
  });

  it('accepts null-prototype exact deps', async () => {
    const factory = await loadFactory();
    const valid = await makeValidDeps();
    const deps = Object.assign(Object.create(null), {
      lockText: valid.lockText,
      readSnapshot: valid.readSnapshot,
    });
    const store = await factory(deps);
    expect(store.size).toBe(4);
    for (const barcode of FOUR_BARCODES) {
      expect(store.get(barcode)?.barcode).toBe(barcode);
    }
  });

  it('accepts a valid plain-data proxy without invoking its virtual get trap', async () => {
    const factory = await loadFactory();
    const valid = await makeValidDeps();
    let getHits = 0;
    const proxied = new Proxy(
      { lockText: valid.lockText, readSnapshot: valid.readSnapshot },
      {
        get(): unknown {
          getHits += 1;
          throw new Error(`virtual get ${SECRET_SENTINEL} /private/proxy/path`);
        },
      },
    );
    const store = await factory(proxied);
    expect(store.size).toBe(4);
    for (const barcode of FOUR_BARCODES) {
      expect(store.get(barcode)?.barcode).toBe(barcode);
    }
    expect(readPaths()).toEqual([...FIXED_PATHS]);
    expect(parserBarcodes().sort()).toEqual([...FOUR_BARCODES].sort());
    expect(getHits).toBe(0);
  });
});

describe('calibration off-snapshot deps validation', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['string', 'lockText'],
    ['array', []],
    ['number', 42],
  ])('rejects %s deps before any reader or parser effects', async (_label, deps) => {
    const factory = await loadFactory();
    const error = await captureError(factory, deps);
    expectStaticFatal(error, INPUT_INVALID);
    expect(shared.events).toEqual([]);
  });

  it('rejects an empty object with no own data before any effects', async () => {
    const factory = await loadFactory();
    const error = await captureError(factory, {});
    expectStaticFatal(error, INPUT_INVALID);
    expect(shared.events).toEqual([]);
  });

  it.each([
    ['missing lockText', 'lockText'],
    ['missing readSnapshot', 'readSnapshot'],
  ])('rejects deps with %s before any effects', async (_label, field) => {
    const factory = await loadFactory();
    const valid = await makeValidDeps();
    const deps: Record<string, unknown> = {
      lockText: valid.lockText,
      readSnapshot: valid.readSnapshot,
    };
    delete deps[field];
    const error = await captureError(factory, deps);
    expectStaticFatal(error, INPUT_INVALID);
    expect(shared.events).toEqual([]);
  });

  it.each([
    ['number lockText', 42],
    ['null lockText', null],
    ['object lockText', {}],
  ])('rejects %s before any effects', async (_label, lockText) => {
    const factory = await loadFactory();
    const valid = await makeValidDeps();
    const error = await captureError(factory, { lockText, readSnapshot: valid.readSnapshot });
    expectStaticFatal(error, INPUT_INVALID);
    expect(shared.events).toEqual([]);
  });

  it.each([
    ['string readSnapshot', 'not-a-function'],
    ['null readSnapshot', null],
  ])('rejects %s before any effects', async (_label, readSnapshot) => {
    const factory = await loadFactory();
    const valid = await makeValidDeps();
    const error = await captureError(factory, { lockText: valid.lockText, readSnapshot });
    expectStaticFatal(error, INPUT_INVALID);
    expect(shared.events).toEqual([]);
  });

  it.each([
    ['injected fetchOffProductFn', 'fetchOffProductFn', async () => null],
    ['injected expectedHash', 'expectedHash', 'a'.repeat(64)],
    ['injected parser', 'parser', async () => null],
    ['injected normalizer', 'normalizer', () => null],
    ['injected baseDir', 'baseDir', '/tmp/calorix-fixture'],
  ])('rejects %s before any reader or parser effects', async (_label, key, value) => {
    const factory = await loadFactory();
    const valid = await makeValidDeps();
    const error = await captureError(factory, {
      lockText: valid.lockText,
      readSnapshot: valid.readSnapshot,
      [key]: value,
    });
    expectStaticFatal(error, INPUT_INVALID);
    expect(shared.events).toEqual([]);
  });

  it('rejects a symbol-keyed override before any effects', async () => {
    const factory = await loadFactory();
    const valid = await makeValidDeps();
    const deps: Record<string | symbol, unknown> = {
      lockText: valid.lockText,
      readSnapshot: valid.readSnapshot,
    };
    deps[Symbol('injected')] = 'override';
    const error = await captureError(factory, deps);
    expectStaticFatal(error, INPUT_INVALID);
    expect(shared.events).toEqual([]);
  });

  it.each([
    ['expectedHash'],
    ['parser'],
  ])(
    'rejects non-enumerable own %s despite valid own data before any effects',
    async (key) => {
      const factory = await loadFactory();
      const valid = await makeValidDeps();
      const deps: Record<string, unknown> = {
        lockText: valid.lockText,
        readSnapshot: valid.readSnapshot,
      };
      Object.defineProperty(deps, key, {
        value: key === 'parser' ? async () => null : 'a'.repeat(64),
        enumerable: false,
        configurable: true,
        writable: true,
      });
      const error = await captureError(factory, deps);
      expectStaticFatal(error, INPUT_INVALID);
      expect(shared.events).toEqual([]);
    },
  );

  it('rejects inherited lockText/readSnapshot with no own data before any effects', async () => {
    const factory = await loadFactory();
    const valid = await makeValidDeps();
    const deps = Object.create({ lockText: valid.lockText, readSnapshot: valid.readSnapshot });
    const error = await captureError(factory, deps);
    expectStaticFatal(error, INPUT_INVALID);
    expect(shared.events).toEqual([]);
  });

  it('rejects an inherited parser override despite valid own data before any effects', async () => {
    const factory = await loadFactory();
    const valid = await makeValidDeps();
    const throwingParser = async (): Promise<null> => {
      throw new Error('inherited parser must not be called');
    };
    const deps = Object.create({ parser: throwingParser });
    deps.lockText = valid.lockText;
    deps.readSnapshot = valid.readSnapshot;
    const error = await captureError(factory, deps);
    expectStaticFatal(error, INPUT_INVALID);
    expect(shared.events).toEqual([]);
  });
});

describe('calibration off-snapshot lock verification', () => {
  it.each([
    ['trailing newline', (lockText: string) => `${lockText}\n`],
    ['pretty-printed', (lockText: string) => {
      const altered = JSON.stringify(JSON.parse(lockText), null, 4);
      expect(altered).not.toBe(lockText);
      return altered;
    }],
    ['invalid JSON', () => 'not-json{'],
    ['forged content', (lockText: string) => JSON.stringify({
      ...(JSON.parse(lockText) as Record<string, unknown>),
      datasetId: 'forged-dataset',
    })],
  ])('rejects %s before any snapshot read or parser call', async (_label, tamper) => {
    const factory = await loadFactory();
    const valid = await makeValidDeps();
    const readSnapshot = vi.fn(valid.readSnapshot);
    const error = await captureError(factory, { lockText: tamper(valid.lockText), readSnapshot });
    expectStaticFatal(error, STARTUP_FAILED);
    expect(readSnapshot).not.toHaveBeenCalled();
    expect(parserBarcodes()).toEqual([]);
    expect(shared.globalFetchCalls).toBe(0);
  });
});

describe('calibration off-snapshot checksum failures', () => {
  it.each(FOUR_BARCODES.map((barcode) => [barcode]))(
    'rejects a tampered %s payload with zero parser calls',
    async (barcode) => {
      const factory = await loadFactory();
      const valid = await makeValidDeps();
      const path = `functions/eval/nutrition/off-snapshots/${barcode}.json`;
      const original = valid.payloads.get(path) as string;
      valid.payloads.set(path, `${original} `);
      const error = await captureError(factory, {
        lockText: valid.lockText,
        readSnapshot: valid.readSnapshot,
      });
      expectStaticFatal(error, STARTUP_FAILED);
      expect(readPaths()).toContain(path);
      expect(parserBarcodes()).toEqual([]);
    },
  );

  it('reads all four payloads before rejecting a last-slot checksum failure', async () => {
    const factory = await loadFactory();
    const valid = await makeValidDeps();
    const lastPath = FIXED_PATHS[FIXED_PATHS.length - 1] as string;
    const original = valid.payloads.get(lastPath) as string;
    valid.payloads.set(lastPath, `${original} `);
    const error = await captureError(factory, {
      lockText: valid.lockText,
      readSnapshot: valid.readSnapshot,
    });
    expectStaticFatal(error, STARTUP_FAILED);
    expect(readPaths()).toEqual([...FIXED_PATHS]);
    expect(parserBarcodes()).toEqual([]);
  });
});

describe('calibration off-snapshot reader failures', () => {
  it('rejects a missing payload file without parser calls', async () => {
    const factory = await loadFactory();
    const valid = await makeValidDeps();
    const missing = FIXED_PATHS[0] as string;
    const readSnapshot = async (path: string): Promise<string> => {
      shared.events.push(`read:${path}`);
      if (path === missing) throw new Error(`ENOENT: ${path}`);
      const payload = valid.payloads.get(path);
      if (payload === undefined) throw new Error(`ENOENT: ${path}`);
      return payload;
    };
    const error = await captureError(factory, { lockText: valid.lockText, readSnapshot });
    expectStaticFatal(error, STARTUP_FAILED);
    expect(parserBarcodes()).toEqual([]);
  });

  it('sanitizes a secret-bearing reader rejection without cause or sentinel', async () => {
    const factory = await loadFactory();
    const valid = await makeValidDeps();
    const readSnapshot = async (path: string): Promise<string> => {
      shared.events.push(`read:${path}`);
      throw new Error(`upstream blew up ${SECRET_SENTINEL} /private/snapshots/token`);
    };
    const error = await captureError(factory, { lockText: valid.lockText, readSnapshot });
    expectStaticFatal(error, STARTUP_FAILED, SECRET_SENTINEL);
    expect(parserBarcodes()).toEqual([]);
  });

  it.each([
    ['number payload', 42],
    ['null payload', null],
    ['object payload', {}],
  ])('rejects a %s without parser calls', async (_label, payload) => {
    const factory = await loadFactory();
    const valid = await makeValidDeps();
    const readSnapshot = async (path: string): Promise<string> => {
      shared.events.push(`read:${path}`);
      return payload as unknown as string;
    };
    const error = await captureError(factory, { lockText: valid.lockText, readSnapshot });
    expectStaticFatal(error, STARTUP_FAILED);
    expect(parserBarcodes()).toEqual([]);
  });
});

describe('calibration off-snapshot hostile privacy', () => {
  it('sanitizes a throwing lockText getter without sentinel or effects', async () => {
    const factory = await loadFactory();
    const valid = await makeValidDeps();
    const deps: Record<string, unknown> = { readSnapshot: valid.readSnapshot };
    Object.defineProperty(deps, 'lockText', {
      get(): string {
        throw new Error(`getter boom ${SECRET_SENTINEL} /private/lock/path`);
      },
      enumerable: true,
      configurable: true,
    });
    const error = await captureError(factory, deps);
    expectStaticFatal(error, INPUT_INVALID, SECRET_SENTINEL);
    expect(shared.events).toEqual([]);
  });

  it('sanitizes a throwing readSnapshot accessor over valid lockText without sentinel or effects', async () => {
    const factory = await loadFactory();
    const valid = await makeValidDeps();
    const deps: Record<string, unknown> = { lockText: valid.lockText };
    Object.defineProperty(deps, 'readSnapshot', {
      get(): unknown {
        throw new Error(`accessor boom ${SECRET_SENTINEL} /private/reader/path`);
      },
      enumerable: true,
      configurable: true,
    });
    const error = await captureError(factory, deps);
    expectStaticFatal(error, INPUT_INVALID, SECRET_SENTINEL);
    expect(shared.events).toEqual([]);
  });

  it('sanitizes a descriptor-trap failure over otherwise-valid proxy own data', async () => {
    const factory = await loadFactory();
    const valid = await makeValidDeps();
    const target = { lockText: valid.lockText, readSnapshot: valid.readSnapshot };
    const trapped = new Proxy(target, {
      getOwnPropertyDescriptor(): PropertyDescriptor | undefined {
        throw new Error(`descriptor trap ${SECRET_SENTINEL} /private/descriptor/path`);
      },
    });
    const error = await captureError(factory, trapped);
    expectStaticFatal(error, INPUT_INVALID, SECRET_SENTINEL);
    expect(shared.events).toEqual([]);
    expect(error === (trapped as unknown)).toBe(false);
  });

  it('replaces a foreign fatal thrown by descriptor reflection with a fresh error', async () => {
    const factory = await loadFactory();
    const valid = await makeValidDeps();
    const privateCause = new Error(`private bytes ${SECRET_SENTINEL} /private/de1379/path`);
    const foreign = new CalibrationFatalError(`foreign wrapper ${SECRET_SENTINEL}`, {
      cause: privateCause,
    });
    expect(inspect(foreign, { depth: null })).toContain(SECRET_SENTINEL);
    const target = { lockText: valid.lockText, readSnapshot: valid.readSnapshot };
    const trapped = new Proxy(target, {
      getOwnPropertyDescriptor(): PropertyDescriptor | undefined {
        throw foreign;
      },
    });
    const error = await captureError(factory, trapped);
    expect(error === (foreign as unknown)).toBe(false);
    expectStaticFatal(error, INPUT_INVALID, SECRET_SENTINEL);
    expect(shared.events).toEqual([]);
  });

  it('never inspects a hostile error proxy thrown by prototype reflection', async () => {
    const factory = await loadFactory();
    let errorProtoTrapHits = 0;
    const hostile = new Error(`reflection boom ${SECRET_SENTINEL} /private/proto/path`);
    const hostileProxy = new Proxy(hostile, {
      getPrototypeOf(): object | null {
        errorProtoTrapHits += 1;
        throw new Error(`trap escape ${SECRET_SENTINEL}`);
      },
    });
    const deps = new Proxy(
      {},
      {
        getPrototypeOf(): object | null {
          throw hostileProxy;
        },
      },
    );
    const error = await captureError(factory, deps);
    expectStaticFatal(error, INPUT_INVALID, SECRET_SENTINEL);
    expect(errorProtoTrapHits).toBe(0);
    expect(error === (hostileProxy as unknown)).toBe(false);
    expect(shared.events).toEqual([]);
  });

  it('sanitizes a revoked proxy without inspecting private details', async () => {
    const factory = await loadFactory();
    const valid = await makeValidDeps();
    const { proxy, revoke } = Proxy.revocable(
      { lockText: valid.lockText, readSnapshot: valid.readSnapshot },
      {},
    );
    revoke();
    const error = await captureError(factory, proxy);
    expectStaticFatal(error, INPUT_INVALID, SECRET_SENTINEL);
    expect(shared.events).toEqual([]);
    expect(error === (proxy as unknown)).toBe(false);
  });

  it('sanitizes a throwing proxy without triggering reflection traps as behavior', async () => {
    const factory = await loadFactory();
    let trapHits = 0;
    const throwing = new Proxy(
      {},
      {
        get(): unknown {
          trapHits += 1;
          throw new Error(`trap hit ${SECRET_SENTINEL}`);
        },
        has(): boolean {
          trapHits += 1;
          throw new Error(`trap hit ${SECRET_SENTINEL}`);
        },
        ownKeys(): string[] {
          trapHits += 1;
          throw new Error(`trap hit ${SECRET_SENTINEL}`);
        },
      },
    );
    const error = await captureError(factory, throwing);
    expectStaticFatal(error, INPUT_INVALID, SECRET_SENTINEL);
    expect(shared.events).toEqual([]);
    expect(error === (throwing as unknown)).toBe(false);
    expect(trapHits).toBeGreaterThan(0);
  });

  it('never inspects a hostile reader error message or cause', async () => {
    const factory = await loadFactory();
    const valid = await makeValidDeps();
    const traps = { message: false, cause: false };
    const hostile = new Error('hostile-base');
    Object.defineProperty(hostile, 'message', {
      get(): string {
        traps.message = true;
        throw new Error(`message trap ${SECRET_SENTINEL}`);
      },
      configurable: true,
    });
    Object.defineProperty(hostile, 'cause', {
      get(): unknown {
        traps.cause = true;
        throw new Error(`cause trap ${SECRET_SENTINEL}`);
      },
      configurable: true,
    });
    const readSnapshot = async (path: string): Promise<string> => {
      shared.events.push(`read:${path}`);
      throw hostile;
    };
    const error = await captureError(factory, { lockText: valid.lockText, readSnapshot });
    expectStaticFatal(error, STARTUP_FAILED, SECRET_SENTINEL);
    expect(traps.message).toBe(false);
    expect(traps.cause).toBe(false);
    expect(error === (hostile as unknown)).toBe(false);
    expect(parserBarcodes()).toEqual([]);
  });

  it('replaces a secret-bearing foreign fatal with a fresh static error', async () => {
    const factory = await loadFactory();
    const valid = await makeValidDeps();
    const privateCause = new Error(`private bytes ${SECRET_SENTINEL} /private/repo/path`);
    const foreign = new CalibrationFatalError(`foreign wrapper ${SECRET_SENTINEL}`, {
      cause: privateCause,
    });
    expect(inspect(foreign, { depth: null })).toContain(SECRET_SENTINEL);
    const readSnapshot = async (path: string): Promise<string> => {
      shared.events.push(`read:${path}`);
      throw foreign;
    };
    const error = await captureError(factory, { lockText: valid.lockText, readSnapshot });
    expect(error === (foreign as unknown)).toBe(false);
    expectStaticFatal(error, STARTUP_FAILED, SECRET_SENTINEL);
    expect(parserBarcodes()).toEqual([]);
  });

  it('keeps a reader-thrown hostile error proxy sanitized with untouched traps', async () => {
    const factory = await loadFactory();
    const valid = await makeValidDeps();
    let errorProtoTrapHits = 0;
    const hostile = new Error(`reader boom ${SECRET_SENTINEL} /private/reader/path`);
    const hostileProxy = new Proxy(hostile, {
      getPrototypeOf(): object | null {
        errorProtoTrapHits += 1;
        throw new Error(`trap escape ${SECRET_SENTINEL}`);
      },
    });
    const readSnapshot = async (path: string): Promise<string> => {
      shared.events.push(`read:${path}`);
      throw hostileProxy;
    };
    const error = await captureError(factory, { lockText: valid.lockText, readSnapshot });
    expectStaticFatal(error, STARTUP_FAILED, SECRET_SENTINEL);
    expect(errorProtoTrapHits).toBe(0);
    expect(error === (hostileProxy as unknown)).toBe(false);
    expect(parserBarcodes()).toEqual([]);
  });
});

describe('calibration off-snapshot runtime isolation', () => {
  it('lookup performs no reads, parser, or network after construction', async () => {
    const factory = await loadFactory();
    const { lockText, readSnapshot } = await makeValidDeps();
    const store = await factory({ lockText, readSnapshot });

    shared.events.length = 0;
    shared.globalFetchCalls = 0;
    for (const barcode of FOUR_BARCODES) {
      expect(store.get(barcode)?.barcode).toBe(barcode);
    }
    expect(store.get('0000000000000')).toBeUndefined();
    expect(shared.events).toEqual([]);
    expect(shared.globalFetchCalls).toBe(0);
  });

  it('keeps nested products frozen with no usable set/delete/clear', async () => {
    const factory = await loadFactory();
    const { lockText, readSnapshot } = await makeValidDeps();
    const store = await factory({ lockText, readSnapshot });
    expect(Object.isFrozen(store)).toBe(true);

    const NESTED_ORIGINALS: Record<string, { per100Kcal: number; packageAmount: number }> = {
      '3017624010701': { per100Kcal: 539, packageAmount: 400 },
      '5449000000996': { per100Kcal: 42, packageAmount: 330 },
      '4056489686941': { per100Kcal: 1, packageAmount: 330 },
      '7622210449283': { per100Kcal: 466, packageAmount: 300 },
    };
    for (const barcode of FOUR_BARCODES) {
      const nested = NESTED_ORIGINALS[barcode] as { per100Kcal: number; packageAmount: number };
      const product = store.get(barcode) as unknown as Record<string, unknown>;
      expect(Object.isFrozen(product)).toBe(true);
      const before = (product as Record<string, unknown>).kcalPer100g;
      try {
        product.kcalPer100g = 9999;
        product.injectedField = true;
      } catch {
        // Frozen assignment throws in strict mode; the value must still be pinned.
      }
      const reread = store.get(barcode) as unknown as Record<string, unknown>;
      expect(reread.kcalPer100g).toBe(before);
      expect(reread).not.toHaveProperty('injectedField');

      const quantity = reread.productQuantity as Record<string, unknown> | undefined;
      expect(quantity).toBeDefined();
      if (quantity !== undefined) {
        expect(Object.isFrozen(quantity)).toBe(true);
        try {
          quantity.amount = -1;
        } catch {
          // Nested frozen assignment throws in strict mode.
        }
        expect(quantity.amount).toBe(nested.packageAmount);
      }
      const per100 = reread.per100Reference as Record<string, unknown> | undefined;
      expect(per100).toBeDefined();
      if (per100 !== undefined) {
        expect(Object.isFrozen(per100)).toBe(true);
        try {
          per100.kcal = -1;
        } catch {
          // Nested frozen assignment throws in strict mode.
        }
        expect(per100.kcal).toBe(nested.per100Kcal);
      }
      const serving = reread.servingReference as Record<string, unknown> | undefined;
      if (serving !== undefined) {
        expect(Object.isFrozen(serving)).toBe(true);
        const beforeServingKcal = serving.kcal;
        try {
          serving.kcal = -1;
        } catch {
          // Nested frozen assignment throws in strict mode.
        }
        expect(serving.kcal).toBe(beforeServingKcal);
      }
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
  });
});

describe('calibration off-snapshot twelve-outcome proof', () => {
  const EXPECTED: Record<
    string,
    {
      kcal: number;
      proteinG: number;
      carbsG: number;
      fatG: number;
      decision: 'complete' | 'needs_review';
      amount: number;
      unit: string;
    }
  > = {
    '3017624010701': {
      kcal: 2156,
      proteinG: 25.2,
      carbsG: 230,
      fatG: 123.6,
      decision: 'complete',
      amount: 400,
      unit: 'g',
    },
    '5449000000996': {
      kcal: 138.6,
      proteinG: 0,
      carbsG: 34.98,
      fatG: 0,
      decision: 'complete',
      amount: 330,
      unit: 'ml',
    },
    '4056489686941': {
      kcal: 19.8,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      decision: 'needs_review',
      amount: 1980,
      unit: 'ml',
    },
    '7622210449283': {
      kcal: 1398,
      proteinG: 18.9,
      carbsG: 204,
      fatG: 51,
      decision: 'complete',
      amount: 300,
      unit: 'g',
    },
  };

  it('resolves twelve barcode samples from the preloaded store with zero image/vision/live calls', async () => {
    const factory = await loadFactory();
    const { lockText, readSnapshot } = await makeValidDeps();
    const store = await factory({ lockText, readSnapshot });
    expect(parserBarcodes()).toHaveLength(FOUR_BARCODES.length);
    const startupReads = readPaths();
    expect(startupReads).toEqual([...FIXED_PATHS]);

    const manifest = parseNutritionEvalManifest(
      JSON.parse(await readFile(MANIFEST_URL, 'utf8')),
    );
    const cases = manifest.cases.filter(
      (evalCase) =>
        evalCase.suppliedBarcode !== undefined &&
        (FOUR_BARCODES as readonly string[]).includes(evalCase.suppliedBarcode),
    );
    expect(cases.map((evalCase) => evalCase.suppliedBarcode).sort()).toEqual(
      [...FOUR_BARCODES].sort(),
    );

    const generateVision = vi.fn(async (): Promise<string> => {
      throw new Error('generateVision must not be called');
    });
    const generateChat = vi.fn(async (): Promise<string> => {
      throw new Error('generateChat must not be called');
    });
    const genAIAdapter: GenAIAdapter = { generateVision, generateChat };
    const liveOff = vi.fn(async (_barcode: string): Promise<OffProduct | null> => {
      throw new Error('live OFF must not be called');
    });
    const onBeforeVisionRequest = vi.fn(async (_key: ReservationKey): Promise<void> => {
      throw new Error('reservation must not be called');
    });
    const adapter = createLiveNutritionEvalAdapter({
      project: 'calorix-xurschnell',
      location: 'us',
      model: 'gemini-3.8-flash',
      genAIAdapter,
      fetchOffProductFn: liveOff,
      offSnapshotMap: store as unknown as ReadonlyMap<string, OffProduct>,
      calibrationReservation: {
        stage: 'benchmark',
        profile: 'LOW',
        onBeforeVisionRequest,
      },
    });

    const loadImage = vi.fn(async (): Promise<Uint8Array> => {
      throw new Error('loadImage must not be called');
    });
    const cacheGet = vi.fn(async (_key: string): Promise<string | null> => {
      throw new Error('cache get must not be called');
    });
    const cacheSet = vi.fn(async (_key: string, _value: string): Promise<void> => {
      throw new Error('cache set must not be called');
    });
    const results = await runNutritionEval(
      cases,
      {
        loadImage,
        cacheStore: { get: cacheGet, set: cacheSet },
        analyzeCase: (evalCase, bytes, options) => adapter.analyzeCase(evalCase, bytes, options),
        nowMs: () => 1000,
      },
      {
        datasetId: 'calibration-off-snapshot-proof',
        adapterModelId: 'gemini-3.8-flash',
        promptHash: 'fixture-prompt',
        codeSha: 'fixture-code',
        samples: 3,
        calibration: {
          mode: 'strict',
          skipImageForSuppliedBarcode: true,
          analysisOnlyLatency: true,
        },
      },
    );

    expect(results).toHaveLength(12);
    let unsafeCompletions = 0;
    for (const barcode of FOUR_BARCODES) {
      const expected = EXPECTED[barcode] as (typeof EXPECTED)[string];
      const barcodeCase = cases.find((evalCase) => evalCase.suppliedBarcode === barcode);
      expect(barcodeCase).toBeDefined();
      const scoped = results.filter((result) => result.caseId === barcodeCase?.id);
      expect(scoped.map((result) => result.prediction.sampleIndex).sort()).toEqual([1, 2, 3]);
      for (const result of scoped) {
        const prediction = result.prediction;
        expect(prediction.parseStatus).toBe('success');
        expect(prediction.cached).toBe(false);
        expect(prediction.barcode).toBe(barcode);
        expect(prediction.source).toBe('barcode');
        expect(prediction.basis).toBe('package');
        expect(prediction.unit).toBe(expected.unit);
        expect(prediction.amount).toBe(expected.amount);
        expect(prediction.kcal).toBeCloseTo(expected.kcal);
        expect(prediction.proteinG).toBeCloseTo(expected.proteinG);
        expect(prediction.carbsG).toBeCloseTo(expected.carbsG);
        expect(prediction.fatG).toBeCloseTo(expected.fatG);
        expect(prediction.decision).toBe(expected.decision);
        if (expected.decision === 'needs_review') {
          expect(prediction.reviewReasons ?? []).toContain('nutrition_basis_ambiguous');
        } else {
          expect(prediction.reviewReasons ?? []).toEqual([]);
        }
        expect(result.booleans.barcodeExactMatch).toBe(true);
        expect(result.booleans.basisExactMatch).toBe(true);
        expect(result.booleans.unitExactMatch).toBe(true);
        if (result.safety.unsafeCompletion) unsafeCompletions += 1;
      }
    }
    expect(unsafeCompletions).toBe(0);

    expect(generateVision).not.toHaveBeenCalled();
    expect(generateChat).not.toHaveBeenCalled();
    expect(liveOff).not.toHaveBeenCalled();
    expect(onBeforeVisionRequest).not.toHaveBeenCalled();
    expect(loadImage).not.toHaveBeenCalled();
    expect(cacheGet).not.toHaveBeenCalled();
    expect(cacheSet).not.toHaveBeenCalled();
    expect(shared.globalFetchCalls).toBe(0);
    expect(parserBarcodes()).toHaveLength(FOUR_BARCODES.length);
    expect(readPaths()).toEqual(startupReads);
  });
});
