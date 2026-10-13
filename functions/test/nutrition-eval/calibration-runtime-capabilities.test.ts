/**
 * Calibration runtime capabilities RED behavioral contract (plan Task 1
 * Step 1, `docs/superpowers/plans/2026-10-13-calibration-runtime-capabilities.md`;
 * design `docs/superpowers/specs/2026-10-12-calibration-controller-runtime-design.md`).
 *
 * `functions/src/nutrition-eval/calibration-runtime-capabilities.ts` does not
 * exist yet. Every test here fails at dynamic-import time with a
 * missing-module error until a worker authors that source file in a
 * separate, later stage. Do NOT create a stub or placeholder source to turn
 * any of this green; the main host authorizes the source worker separately
 * after witnessing this RED and freezing this file.
 *
 * Hermetic contract: the shared `buildRuntimeHarness` fixture (sibling file,
 * never importing the runtime module) reads only committed
 * `functions/eval/nutrition/*` assets through portable `new URL(...,
 * import.meta.url)` paths, prepares all four real OFF products through the
 * production parser, and injects a native `createGenAIAdapter` with a fake
 * `GenAIClient`. No downloaded images, fabricated snapshot products,
 * subprocess, or cloud/device access occurs anywhere in this file.
 *
 * Two independent, differently-scoped guards protect against real
 * side-effecting access:
 *
 * - A `beforeEach`/`afterEach` pair spies on `globalThis.fetch` for the
 *   ENTIRE duration of every test in this file -- including that test's own
 *   fixture reads and module import, which run inside the test body only
 *   after `beforeEach` has already installed the spy -- and makes it throw.
 *   This is safe because `buildRuntimeHarness` never calls `fetch`; it only
 *   reads committed files and OFF snapshots through injected functions.
 * - `fsGuard`/`execGuard` below are `vi.mock` wrappers around `node:fs`,
 *   `node:fs/promises`, and `node:child_process` that delegate to the real
 *   implementation unless a mutable hoisted flag is explicitly flipped on.
 *   Individual tests only flip that flag on AFTER their own fixture reads,
 *   plan derivation, and dynamic runtime-module import have already
 *   completed, because `calibration-bootstrap.ts` (which the eventual
 *   source module calls into for its pure synchronous planner) is a mixed
 *   module that also contains real native readers elsewhere in the same
 *   file -- so this guard is not vacuous, and flipping it on too early
 *   would falsely block legitimate fixture/module loading rather than
 *   runtime behavior.
 * - The real `@google/genai` `GoogleGenAI` constructor is guarded
 *   unconditionally for the whole file: no test here ever needs to
 *   construct one, since a fake client is always injected via
 *   `createGenAIAdapter({ googleGenAI: client })`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThinkingLevel } from '@google/genai';
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';
import { visionResponseJsonSchema } from '../../src/nutrition-json-schema';
import { buildRuntimeHarness, type RuntimeHarness } from './calibration-runtime-capabilities-fixtures';
import type { VisionGenerationOptions } from '../../src/genai-adapter';
import type { ReservationKey } from '../../src/nutrition-eval/calibration';

// ── Hoisted, narrowly-scoped native-access guards ───────────────────────────

const fsGuard = vi.hoisted(() => ({ active: false }));
const execGuard = vi.hoisted(() => ({ active: false }));
const sdkGuard = vi.hoisted(() => ({ active: true }));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    readFileSync: (...args: Parameters<typeof actual.readFileSync>) => {
      if (fsGuard.active) throw new Error('UNEXPECTED-FS-READFILESYNC');
      return actual.readFileSync(...args);
    },
  };
});

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    readFile: (...args: Parameters<typeof actual.readFile>) => {
      if (fsGuard.active) throw new Error('UNEXPECTED-FS-READFILE');
      return actual.readFile(...args);
    },
  };
});

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    exec: ((...args: unknown[]) => {
      if (execGuard.active) throw new Error('UNEXPECTED-CHILD-PROCESS-EXEC');
      return (actual.exec as (...a: unknown[]) => unknown)(...args);
    }) as typeof actual.exec,
    execSync: ((...args: unknown[]) => {
      if (execGuard.active) throw new Error('UNEXPECTED-CHILD-PROCESS-EXECSYNC');
      return (actual.execSync as (...a: unknown[]) => unknown)(...args);
    }) as typeof actual.execSync,
    spawn: ((...args: unknown[]) => {
      if (execGuard.active) throw new Error('UNEXPECTED-CHILD-PROCESS-SPAWN');
      return (actual.spawn as (...a: unknown[]) => unknown)(...args);
    }) as typeof actual.spawn,
  };
});

vi.mock('@google/genai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/genai')>();
  class GuardedGoogleGenAI extends actual.GoogleGenAI {
    constructor(...args: ConstructorParameters<typeof actual.GoogleGenAI>) {
      if (sdkGuard.active) {
        throw new Error('UNEXPECTED-REAL-SDK-CONSTRUCTION');
      }
      super(...args);
    }
  }
  return { ...actual, GoogleGenAI: GuardedGoogleGenAI };
});

// ── Local structural types mirroring the plan's Shared Interfaces ──────────
// (the real module does not exist yet; these are never imported from it).

interface RuntimeCapsLike {
  loadImage: () => Promise<Uint8Array>;
  generateVision: (request: { prompt: string; imageBase64: string }) => Promise<string>;
  lookupSnapshot: () => unknown;
}

interface RuntimeObservationLike {
  readonly sequence: number;
  readonly key: Readonly<{ stage: string; profile: string; caseId: string; sampleIndex: number }>;
  readonly operation: 'outcome' | 'image' | 'vision' | 'reservation' | 'metadata' | 'snapshot';
  readonly status: 'attempted' | 'completed' | 'failed' | 'blocked';
}

interface RuntimeInstanceLike {
  runOutcome: <T>(key: unknown, body: (caps: RuntimeCapsLike) => Promise<T>) => Promise<T>;
  getPlannedOutcomes: () => readonly unknown[];
  getObservations: () => readonly RuntimeObservationLike[];
}

type RuntimeFactory = (deps: unknown) => RuntimeInstanceLike;

async function loadRuntimeModule(): Promise<{ factory: RuntimeFactory; ProviderError: new () => Error }> {
  const mod = await import('../../src/nutrition-eval/calibration-runtime-capabilities');
  const record = mod as unknown as Record<string, unknown>;
  const factory = record.prepareCalibrationRuntimeCapabilities;
  expect(typeof factory).toBe('function');
  const ProviderError = record.CalibrationRuntimeProviderError;
  expect(typeof ProviderError).toBe('function');
  return {
    factory: factory as RuntimeFactory,
    ProviderError: ProviderError as new () => Error,
  };
}

const VISION_REQUEST = Object.freeze({ prompt: 'fixture prompt', imageBase64: 'AQID' });

function deferredVoid(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Independent test-only witness: reservation-completed observations must equal actual lower-transport calls. */
function assertTransportParity(observations: readonly RuntimeObservationLike[], actualTransport: number): void {
  const expected = observations.filter((r) => r.operation === 'reservation' && r.status === 'completed').length;
  if (actualTransport !== expected) {
    throw new Error('test-transport-reservation-mismatch');
  }
}

function findKey(
  h: RuntimeHarness,
  predicate: (row: RuntimeHarness['plan'][number]) => boolean,
): RuntimeHarness['plan'][number]['key'] {
  const row = h.plan.find(predicate);
  if (row === undefined) throw new Error('test setup: no matching planned outcome');
  return row.key;
}

interface HostileForeignErrorWitness {
  readonly error: Error;
  getProbes: () => number;
}

/**
 * A thrown value whose message/stack/toString/cause/name/prototype all throw
 * if probed, with an externally-owned counter. If a compliant implementation
 * ever caught one of these probe exceptions internally (e.g. to fall back to
 * a generic message) the resulting behavior could still look superficially
 * correct from the outside, so the counter -- not "did the test crash" -- is
 * the actual witness that no probe fired.
 */
function hostileForeignError(baseMessage: string): HostileForeignErrorWitness {
  const target = new Error(baseMessage);
  let probes = 0;
  const error = new Proxy(target, {
    get(obj, prop, receiver) {
      if (prop === 'message' || prop === 'stack' || prop === 'toString' || prop === 'cause' || prop === 'name') {
        probes++;
        throw new Error(`HOSTILE-PROBE-${String(prop)}`);
      }
      return Reflect.get(obj, prop, receiver);
    },
    getPrototypeOf() {
      probes++;
      throw new Error('HOSTILE-PROBE-PROTOTYPE');
    },
  }) as Error;
  return { error, getProbes: () => probes };
}

interface ReflectionTrapWitness {
  ownKeys: number;
  getOwnPropertyDescriptor: number;
  getPrototypeOf: number;
}

function freshReflectionTrapWitness(): ReflectionTrapWitness {
  return { ownKeys: 0, getOwnPropertyDescriptor: 0, getPrototypeOf: 0 };
}

/**
 * Wraps a plain owned object in a Proxy whose `ownKeys`,
 * `getOwnPropertyDescriptor`, and `getPrototypeOf` traps each throw and
 * increment their own counter. Deliberately does NOT trap `has` -- a
 * universal "does this Proxy respond to anything" detector is broader than
 * what production descriptor-only validation actually calls; these three
 * traps match the reflection calls already used by the existing
 * descriptor-only capture style elsewhere in this codebase.
 */
function hostileReflectionProxy<T extends object>(target: T, witness: ReflectionTrapWitness): T {
  return new Proxy(target, {
    ownKeys() {
      witness.ownKeys++;
      throw new Error('HOSTILE-REFLECTION-OWNKEYS');
    },
    getOwnPropertyDescriptor() {
      witness.getOwnPropertyDescriptor++;
      throw new Error('HOSTILE-REFLECTION-GETOWNPROPERTYDESCRIPTOR');
    },
    getPrototypeOf() {
      witness.getPrototypeOf++;
      throw new Error('HOSTILE-REFLECTION-GETPROTOTYPEOF');
    },
  });
}

function totalReflectionProbes(witness: ReflectionTrapWitness): number {
  return witness.ownKeys + witness.getOwnPropertyDescriptor + witness.getPrototypeOf;
}

/**
 * Single-trap variant: only the selected reflection trap throws; the other
 * two delegate to the target. The all-three-traps proxy above only ever
 * exercises whichever trap the implementation calls first, so per-trap
 * coverage requires isolating each of `ownKeys`,
 * `getOwnPropertyDescriptor`, and `getPrototypeOf` in turn. Deliberately
 * never traps `has`.
 */
function hostileSingleTrapProxy<T extends object>(
  target: T,
  witness: ReflectionTrapWitness,
  trap: 'ownKeys' | 'getOwnPropertyDescriptor' | 'getPrototypeOf',
): T {
  return new Proxy(target, {
    ownKeys(t) {
      if (trap === 'ownKeys') {
        witness.ownKeys++;
        throw new Error('HOSTILE-REFLECTION-OWNKEYS');
      }
      return Reflect.ownKeys(t);
    },
    getOwnPropertyDescriptor(t, p) {
      if (trap === 'getOwnPropertyDescriptor') {
        witness.getOwnPropertyDescriptor++;
        throw new Error('HOSTILE-REFLECTION-GETOWNPROPERTYDESCRIPTOR');
      }
      return Reflect.getOwnPropertyDescriptor(t, p);
    },
    getPrototypeOf(t) {
      if (trap === 'getPrototypeOf') {
        witness.getPrototypeOf++;
        throw new Error('HOSTILE-REFLECTION-GETPROTOTYPEOF');
      }
      return Reflect.getPrototypeOf(t);
    },
  });
}

let restoreFetch: (() => void) | undefined;

beforeEach(() => {
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
    throw new Error('UNEXPECTED-GLOBAL-FETCH');
  });
  restoreFetch = () => spy.mockRestore();
});

afterEach(() => {
  restoreFetch?.();
  restoreFetch = undefined;
});

// ── Constructible factory examples (plan Step 1) ────────────────────────────

describe('constructible factory examples', () => {
  it('reserves once at final SDK hook and records completion', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    const key = findKey(h, (r) => r.key.stage === 'development' && r.key.profile === 'LOW' && r.scanMode !== 'barcode');
    const text = await runtime.runOutcome(key, async (caps) => {
      await caps.loadImage();
      return caps.generateVision(VISION_REQUEST);
    });
    expect(text).toBe('{"fixture":true}');
    expect(h.calls).toEqual(['image', 'reserve', 'sdk', 'metadata']);
    expect(h.witness).toEqual({ sdk: 1, transport: 1 });
    expect(
      runtime.getObservations().filter((r) => r.operation === 'reservation' && r.status === 'completed'),
    ).toHaveLength(1);
  });

  it('rejects a barcode image attempt before the loader', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    const key = findKey(h, (r) => r.key.stage === 'benchmark' && r.scanMode === 'barcode');
    await expect(runtime.runOutcome(key, async (caps) => caps.loadImage())).rejects.toThrow(
      'calibration:runtime-forbidden-operation',
    );
    expect(h.calls).toEqual([]);
  });

  it('does not invoke dependency accessors for any required field', async () => {
    for (const field of ['files', 'loadImage', 'generateVision', 'reserveImage', 'onModelVersion', 'lookupSnapshot'] as const) {
      const h = await buildRuntimeHarness();
      const { factory } = await loadRuntimeModule();
      let gets = 0;
      const polluted: Record<string, unknown> = { ...h.deps };
      Object.defineProperty(polluted, field, {
        enumerable: true,
        get() {
          gets++;
          throw new Error('PRIVATE-SENTINEL');
        },
      });
      expect(() => factory(polluted)).toThrow('calibration:runtime-input-invalid');
      expect(gets).toBe(0);
      expect(h.calls).toEqual([]);
    }
  });
});

// ── Dependency-record structural validation ─────────────────────────────────

describe('dependency record validation', () => {
  it('rejects deps with forbidden extra capability fields', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    for (const forbidden of ['readCache', 'writeCache', 'fetchLiveOff', 'readSnapshot'] as const) {
      const polluted: Record<string, unknown> = { ...h.deps, [forbidden]: async () => undefined };
      expect(() => factory(polluted)).toThrow('calibration:runtime-input-invalid');
    }
    expect(h.calls).toEqual([]);
  });

  it('rejects deps missing a required field', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    for (const field of ['files', 'loadImage', 'generateVision', 'reserveImage', 'onModelVersion', 'lookupSnapshot'] as const) {
      const incomplete: Record<string, unknown> = { ...h.deps };
      delete incomplete[field];
      expect(() => factory(incomplete)).toThrow('calibration:runtime-input-invalid');
    }
  });

  it('rejects deps with a present-undefined required field', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const polluted: Record<string, unknown> = { ...h.deps, loadImage: undefined };
    expect(() => factory(polluted)).toThrow('calibration:runtime-input-invalid');
  });

  it('rejects a present-undefined selectedProfile and an unknown profile value', async () => {
    const h = await buildRuntimeHarness();
    const { factory } = await loadRuntimeModule();
    expect(() => factory({ ...h.deps, selectedProfile: undefined })).toThrow('calibration:runtime-input-invalid');
    expect(() => factory({ ...h.deps, selectedProfile: 'HIGH' })).toThrow('calibration:runtime-input-invalid');
  });

  it('rejects deps carrying a symbol-keyed or non-enumerable required field', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const withSymbol: Record<string | symbol, unknown> = { ...h.deps };
    withSymbol[Symbol('marker')] = 'nope';
    expect(() => factory(withSymbol)).toThrow('calibration:runtime-input-invalid');

    const withNonEnumerable: Record<string, unknown> = { ...h.deps };
    Object.defineProperty(withNonEnumerable, 'loadImage', {
      enumerable: false,
      value: h.deps.loadImage,
    });
    expect(() => factory(withNonEnumerable)).toThrow('calibration:runtime-input-invalid');
  });

  it('rejects an array or primitive in place of the dependency record', async () => {
    const { factory } = await loadRuntimeModule();
    expect(() => factory([])).toThrow('calibration:runtime-input-invalid');
    expect(() => factory('deps')).toThrow('calibration:runtime-input-invalid');
    expect(() => factory(null)).toThrow('calibration:runtime-input-invalid');
    expect(() => factory(undefined)).toThrow('calibration:runtime-input-invalid');
  });

  it('rejects deps with a non-plain, non-null prototype', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const polluted = Object.assign(Object.create({ evil: true }), h.deps);
    expect(() => factory(polluted)).toThrow('calibration:runtime-input-invalid');
  });

  it('accepts a null-prototype dependency record', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const nullProtoDeps = Object.assign(Object.create(null), h.deps);
    const runtime = factory(nullProtoDeps);
    const key = findKey(h, (r) => r.scanMode === 'barcode');
    const product = await runtime.runOutcome(key, async (caps) => caps.lookupSnapshot());
    expect(product).toBeDefined();
  });

  it('rejects malformed files sub-record entries across all seven keys', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const fileNames = [
      'public-manifest',
      'prompt',
      'response-schema',
      'source-lock',
      'calibration-manifest',
      'off-lock',
      'historical-reference',
    ] as const;
    for (const name of fileNames) {
      const missing: Record<string, unknown> = { ...h.deps, files: { ...h.deps.files } };
      delete (missing.files as Record<string, unknown>)[name];
      expect(() => factory(missing)).toThrow('calibration:runtime-input-invalid');

      const wrongType: Record<string, unknown> = { ...h.deps, files: { ...h.deps.files, [name]: 12345 } };
      expect(() => factory(wrongType)).toThrow('calibration:runtime-input-invalid');

      const presentUndefined: Record<string, unknown> = {
        ...h.deps,
        files: { ...h.deps.files, [name]: undefined },
      };
      expect(() => factory(presentUndefined)).toThrow('calibration:runtime-input-invalid');
    }

    const extraKey: Record<string, unknown> = {
      ...h.deps,
      files: { ...h.deps.files, 'unknown-extra-file': 'nope' },
    };
    expect(() => factory(extraKey)).toThrow('calibration:runtime-input-invalid');

    const withSymbol: Record<string, unknown> = { ...h.deps, files: { ...h.deps.files } };
    (withSymbol.files as Record<string | symbol, unknown>)[Symbol('x')] = 'nope';
    expect(() => factory(withSymbol)).toThrow('calibration:runtime-input-invalid');

    const nonEnumerable: Record<string, unknown> = { ...h.deps, files: { ...h.deps.files } };
    Object.defineProperty(nonEnumerable.files as object, 'prompt', {
      enumerable: false,
      value: h.deps.files.prompt,
    });
    expect(() => factory(nonEnumerable)).toThrow('calibration:runtime-input-invalid');

    const nonPlainFiles: Record<string, unknown> = {
      ...h.deps,
      files: Object.assign(Object.create({ evil: true }), h.deps.files),
    };
    expect(() => factory(nonPlainFiles)).toThrow('calibration:runtime-input-invalid');

    expect(h.calls).toEqual([]);
  });

  it('rejects a mutated pinned file string before any port is invoked', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const corrupted: Record<string, unknown> = {
      ...h.deps,
      files: { ...h.deps.files, prompt: 'this is not the pinned prompt bytes' },
    };
    expect(() => factory(corrupted)).toThrow(CalibrationFatalError);
    expect(h.calls).toEqual([]);
  });
});

// ── Outcome key validation ──────────────────────────────────────────────────

describe('outcome key validation', () => {
  it('rejects malformed outcome keys without invoking any capability', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const validKey = findKey(h, (r) => r.key.stage === 'development');
    const malformed: ReadonlyArray<{ name: string; key: unknown }> = [
      { name: 'string', key: 'development|LOW|case|1' },
      { name: 'null', key: null },
      { name: 'array', key: [] },
      { name: 'missing field', key: { stage: validKey.stage, profile: validKey.profile, caseId: validKey.caseId } },
      { name: 'extra field', key: { ...validKey, extra: 'nope' } },
      {
        name: 'symbol key',
        key: (() => {
          const o: Record<string | symbol, unknown> = { ...validKey };
          o[Symbol('x')] = 1;
          return o;
        })(),
      },
      { name: 'non-plain prototype', key: Object.assign(Object.create({ evil: true }), validKey) },
    ];
    for (const { key } of malformed) {
      const runtime = factory(h.deps);
      await expect(runtime.runOutcome(key, async (caps) => caps.loadImage())).rejects.toThrow(
        'calibration:runtime-key-invalid',
      );
      expect(h.calls).toEqual([]);
    }
  });

  it('rejects a key with a throwing accessor field without invoking the trap', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const validKey = findKey(h, (r) => r.key.stage === 'development');
    let gets = 0;
    const trapped: Record<string, unknown> = { ...validKey };
    Object.defineProperty(trapped, 'caseId', {
      enumerable: true,
      get() {
        gets++;
        throw new Error('PRIVATE-SENTINEL');
      },
    });
    const runtime = factory(h.deps);
    await expect(runtime.runOutcome(trapped, async (caps) => caps.loadImage())).rejects.toThrow(
      'calibration:runtime-key-invalid',
    );
    expect(gets).toBe(0);
  });

  it('rejects a well-shaped key absent from the prepared plan', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    const foreignKey = { stage: 'development', profile: 'LOW', caseId: 'nonexistent-case-id', sampleIndex: 1 };
    await expect(runtime.runOutcome(foreignKey, async (caps) => caps.loadImage())).rejects.toThrow(
      'calibration:runtime-key-invalid',
    );
    expect(h.calls).toEqual([]);
  });

  it('rejects a validation/benchmark key using the non-selected profile', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    const validationLow = findKey(h, (r) => r.key.stage === 'validation');
    const wrongProfile = { ...validationLow, profile: 'MEDIUM' };
    await expect(runtime.runOutcome(wrongProfile, async (caps) => caps.loadImage())).rejects.toThrow(
      'calibration:runtime-key-invalid',
    );
    expect(h.calls).toEqual([]);
  });
});

// ── Review Focus 1: body returns while an operation is still pending ───────

describe('Review Focus 1 — pending operation after body return', () => {
  it('blocks SDK after body returns with pending reservation', async () => {
    const h = await buildRuntimeHarness('LOW');
    const waiting = deferredVoid();
    h.deps.reserveImage = () => waiting.promise;
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    let operation!: Promise<string>;
    await expect(
      runtime.runOutcome(h.plan[0]!.key, async (caps) => {
        operation = caps.generateVision(VISION_REQUEST);
        return 'premature';
      }),
    ).rejects.toThrow('calibration:runtime-callback-failed');
    waiting.resolve();
    await expect(operation).rejects.toBeInstanceOf(CalibrationFatalError);
    expect(h.witness.sdk).toBe(0);
  });

  it('rejects a premature body return while the loader is still pending', async () => {
    const h = await buildRuntimeHarness('LOW');
    const waiting = deferredVoid();
    h.deps.loadImage = () => waiting.promise.then(() => new Uint8Array([1, 2, 3]));
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    let dangling!: Promise<Uint8Array>;
    await expect(
      runtime.runOutcome(h.plan[0]!.key, async (caps) => {
        dangling = caps.loadImage();
        return 'premature';
      }),
    ).rejects.toThrow('calibration:runtime-callback-failed');
    waiting.resolve();
    await expect(dangling).rejects.toBeInstanceOf(CalibrationFatalError);
  });

  it('attaches an internal rejection observer so a dangling pending operation never raises a Node unhandledRejection', async () => {
    const h = await buildRuntimeHarness('LOW');
    const waiting = deferredVoid();
    h.deps.reserveImage = () => waiting.promise;
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    let dangling!: Promise<string>;
    let unhandledCount = 0;
    const onUnhandled = () => {
      unhandledCount++;
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      await expect(
        runtime.runOutcome(h.plan[0]!.key, async (caps) => {
          dangling = caps.generateVision(VISION_REQUEST);
          return 'premature';
        }),
      ).rejects.toThrow('calibration:runtime-callback-failed');
      waiting.resolve();
      // Give the event loop two turns to surface a Node unhandledRejection
      // BEFORE this test attaches its own handler to `dangling`, so that an
      // absence of a crash reflects the runtime's own internal rejection
      // observer, not a test-side `.catch` race. This does not claim
      // detection of an already-settled, never-awaited operation -- only
      // the absence of a detached unhandled rejection.
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
      expect(unhandledCount).toBe(0);
      await expect(dangling).rejects.toBeInstanceOf(CalibrationFatalError);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('rejects reuse of capabilities retained past lease end', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    const key = findKey(h, (r) => r.key.stage === 'development' && r.scanMode !== 'barcode');
    let retained: RuntimeCapsLike | undefined;
    await runtime.runOutcome(key, async (caps) => {
      retained = caps;
      await caps.loadImage();
      return caps.generateVision(VISION_REQUEST);
    });
    expect(retained).toBeDefined();
    h.calls.length = 0;
    await expect(retained!.loadImage()).rejects.toBeInstanceOf(CalibrationFatalError);
    await expect(retained!.generateVision(VISION_REQUEST)).rejects.toBeInstanceOf(CalibrationFatalError);
    expect(h.calls).toEqual([]);
  });

  it('rejects stale beforeRequest/metadata callbacks invoked after lease end with no further effect', async () => {
    const h = await buildRuntimeHarness('LOW');
    let savedOptions:
      | { beforeRequest?: () => Promise<void>; onResponseMetadata?: (m: { modelVersion?: string }) => void }
      | undefined;
    h.deps.generateVision = async (
      _model: string,
      _prompt: string,
      _imageBase64: string,
      _source?: unknown,
      options?: { beforeRequest?: () => Promise<void>; onResponseMetadata?: (m: { modelVersion?: string }) => void },
    ) => {
      savedOptions = options;
      await options?.beforeRequest?.();
      options?.onResponseMetadata?.({ modelVersion: 'fixture-model-v1' });
      return '{"fixture":true}';
    };
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    const text = await runtime.runOutcome(h.plan[0]!.key, async (caps) => caps.generateVision(VISION_REQUEST));
    expect(text).toBe('{"fixture":true}');
    expect(savedOptions).toBeDefined();
    h.calls.length = 0;
    await expect(savedOptions!.beforeRequest!()).rejects.toBeInstanceOf(CalibrationFatalError);
    expect(() => savedOptions!.onResponseMetadata!({ modelVersion: 'late-version' })).toThrow();
    expect(h.calls).toEqual([]);
  });
});

// ── Review Focus 2: nested reentrant dependency calls ───────────────────────

describe('Review Focus 2 — nested reentrant dependency calls', () => {
  it('poison survives a swallowed nested outcome rejection via reserveImage', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    h.deps.reserveImage = async () => {
      await runtime2.runOutcome(h.plan[1]!.key, async () => undefined).catch(() => undefined);
    };
    const runtime2 = factory(h.deps);
    await expect(
      runtime2.runOutcome(h.plan[0]!.key, async (caps) => caps.generateVision(VISION_REQUEST)),
    ).rejects.toBeInstanceOf(CalibrationFatalError);
    expect(h.witness.sdk).toBe(0);
    expect(runtime.getObservations()).toEqual([]);
  });

  it('poison survives a swallowed nested outcome rejection via loadImage', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    h.deps.loadImage = async () => {
      await runtime2.runOutcome(h.plan[1]!.key, async () => undefined).catch(() => undefined);
      return new Uint8Array([1, 2, 3]);
    };
    const runtime2 = factory(h.deps);
    await expect(
      runtime2.runOutcome(h.plan[0]!.key, async (caps) => {
        await caps.loadImage();
        return caps.generateVision(VISION_REQUEST);
      }),
    ).rejects.toBeInstanceOf(CalibrationFatalError);
    expect(h.witness.sdk).toBe(0);
  });

  it('poison survives a synchronous nested re-entry via onModelVersion', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    h.deps.onModelVersion = () => {
      void runtime2.runOutcome(h.plan[1]!.key, async () => undefined).catch(() => undefined);
    };
    const runtime2 = factory(h.deps);
    await expect(
      runtime2.runOutcome(h.plan[0]!.key, async (caps) => {
        await caps.loadImage();
        return caps.generateVision(VISION_REQUEST);
      }),
    ).rejects.toBeInstanceOf(CalibrationFatalError);
  });

  it('poison survives a swallowed nested outcome rejection via generateVision', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    h.deps.generateVision = async () => {
      await runtime2.runOutcome(h.plan[1]!.key, async () => undefined).catch(() => undefined);
      return '{"fixture":true}';
    };
    const runtime2 = factory(h.deps);
    await expect(
      runtime2.runOutcome(h.plan[0]!.key, async (caps) => caps.generateVision(VISION_REQUEST)),
    ).rejects.toBeInstanceOf(CalibrationFatalError);
    expect(h.witness.sdk).toBe(0);
  });

  it('poison survives a swallowed nested outcome rejection via lookupSnapshot', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    h.deps.lookupSnapshot = (barcode: string) => {
      void runtime2.runOutcome(h.plan[1]!.key, async () => undefined).catch(() => undefined);
      return h.store.get(barcode);
    };
    const runtime2 = factory(h.deps);
    const barcodeKey = findKey(h, (r) => r.scanMode === 'barcode');
    await expect(runtime2.runOutcome(barcodeKey, async (caps) => caps.lookupSnapshot())).rejects.toBeInstanceOf(
      CalibrationFatalError,
    );
  });
});

// ── Review Focus 3: final-hook dispatch contract ────────────────────────────

describe('Review Focus 3 — final-hook dispatch contract', () => {
  it('does not accept generator return without final hook', async () => {
    const h = await buildRuntimeHarness('LOW');
    h.deps.generateVision = async () => 'fixture text';
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    await expect(runtime.runOutcome(h.plan[0]!.key, async (caps) => caps.generateVision(VISION_REQUEST))).rejects.toThrow(
      'calibration:runtime-dispatch-contract-invalid',
    );
    expect(h.calls).toEqual([]);
    expect(h.witness.sdk).toBe(0);
  });

  it('rejects a repeated final-hook reservation as a duplicate operation', async () => {
    const h = await buildRuntimeHarness('LOW');
    h.deps.generateVision = async (
      _model: string,
      _prompt: string,
      _imageBase64: string,
      _source?: unknown,
      options?: { beforeRequest?: () => Promise<void> },
    ) => {
      await options?.beforeRequest?.();
      await options?.beforeRequest?.();
      return '{"fixture":true}';
    };
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    await expect(runtime.runOutcome(h.plan[0]!.key, async (caps) => caps.generateVision(VISION_REQUEST))).rejects.toThrow(
      'calibration:runtime-duplicate-operation',
    );
  });

  it('rejects missing response metadata', async () => {
    const h = await buildRuntimeHarness('LOW');
    h.client.models.generateContent = async () => {
      h.witness.sdk++;
      h.witness.transport++;
      h.calls.push('sdk');
      return { text: '{"fixture":true}', modelVersion: undefined };
    };
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    await expect(runtime.runOutcome(h.plan[0]!.key, async (caps) => caps.generateVision(VISION_REQUEST))).rejects.toThrow(
      'calibration:runtime-metadata-invalid',
    );
    expect(h.calls).toEqual(['reserve', 'sdk']);
    expect(h.witness.sdk).toBe(1);
  });

  it('rejects malformed response metadata version', async () => {
    const h = await buildRuntimeHarness('LOW');
    h.client.models.generateContent = async () => {
      h.witness.sdk++;
      h.witness.transport++;
      h.calls.push('sdk');
      return { text: '{"fixture":true}', modelVersion: 'bad version!' };
    };
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    await expect(runtime.runOutcome(h.plan[0]!.key, async (caps) => caps.generateVision(VISION_REQUEST))).rejects.toThrow(
      'calibration:runtime-metadata-invalid',
    );
    expect(h.calls).toEqual(['reserve', 'sdk']);
  });

  it('rejects metadata delivered before reservation completes', async () => {
    const h = await buildRuntimeHarness('LOW');
    h.deps.generateVision = async (
      _model: string,
      _prompt: string,
      _imageBase64: string,
      _source?: unknown,
      options?: { beforeRequest?: () => Promise<void>; onResponseMetadata?: (m: { modelVersion?: string }) => void },
    ) => {
      options?.onResponseMetadata?.({ modelVersion: 'fixture-model-v1' });
      await options?.beforeRequest?.();
      return '{"fixture":true}';
    };
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    await expect(runtime.runOutcome(h.plan[0]!.key, async (caps) => caps.generateVision(VISION_REQUEST))).rejects.toThrow(
      'calibration:runtime-metadata-invalid',
    );
    expect(h.calls).not.toContain('metadata');
  });
});

// ── Review Focus 4: caller aliasing and immutable diagnostics ──────────────

describe('Review Focus 4 — caller aliasing and immutable diagnostics', () => {
  it('captures caller aliases and returns immutable observations', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    h.deps.reserveImage = async () => {
      throw new Error('PRIVATE-SENTINEL');
    };
    h.deps.files.prompt = 'mutated caller input';
    const key = { ...h.plan[0]!.key };
    const originalId = key.caseId;
    const result = runtime.runOutcome(key, async (caps) => caps.generateVision(VISION_REQUEST));
    key.caseId = 'mutated_key';
    await result;
    const observations = runtime.getObservations();
    expect(observations.every((r) => r.key.caseId === originalId)).toBe(true);
    expect(Reflect.set(observations[0]!.key, 'caseId', 'attempted_mutation')).toBe(false);
    expect(Object.isFrozen(key)).toBe(false);
    expect(h.calls).toEqual(['reserve', 'sdk', 'metadata']);
  });

  it('freezes the planned outcome list and ignores function-reference mutation after preparation', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    const planned = runtime.getPlannedOutcomes();
    expect(Object.isFrozen(planned)).toBe(true);
    expect(Reflect.set(planned, 0, 'attempted_mutation')).toBe(false);

    const originalLoadImage = h.deps.loadImage;
    h.deps.loadImage = async () => {
      throw new Error('PRIVATE-SENTINEL-REASSIGNED-AFTER-PREPARE');
    };
    const key = findKey(h, (r) => r.key.stage === 'development' && r.scanMode !== 'barcode');
    const text = await runtime.runOutcome(key, async (caps) => {
      await caps.loadImage();
      return caps.generateVision(VISION_REQUEST);
    });
    expect(text).toBe('{"fixture":true}');
    expect(h.calls).toEqual(['image', 'reserve', 'sdk', 'metadata']);
    h.deps.loadImage = originalLoadImage;
  });

  it('returns distinct defensive copies of planned outcomes and observations on every read', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    const key = h.plan[0]!.key;
    await runtime.runOutcome(key, async (caps) => caps.generateVision(VISION_REQUEST));

    const planA = runtime.getPlannedOutcomes();
    const planB = runtime.getPlannedOutcomes();
    expect(planA).not.toBe(planB);
    expect(planA).toEqual(planB);
    expect(Object.isFrozen(planA[0])).toBe(true);

    const obsA = runtime.getObservations();
    const obsB = runtime.getObservations();
    expect(obsA).not.toBe(obsB);
    expect(obsA).toEqual(obsB);
    expect(Object.isFrozen(obsA[0])).toBe(true);
    expect(Object.isFrozen(obsA[0]!.key)).toBe(true);
  });

  it('keeps diagnostics readable after a poisoning outcome has fully settled', async () => {
    const h = await buildRuntimeHarness('LOW');
    h.deps.generateVision = async (
      _model: string,
      _prompt: string,
      _imageBase64: string,
      _source?: unknown,
      options?: { beforeRequest?: () => Promise<void> },
    ) => {
      await options?.beforeRequest?.();
      await options?.beforeRequest?.();
      return '{"fixture":true}';
    };
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    await expect(
      runtime.runOutcome(h.plan[0]!.key, async (caps) => caps.generateVision(VISION_REQUEST)),
    ).rejects.toThrow('calibration:runtime-duplicate-operation');
    expect(() => runtime.getObservations()).not.toThrow();
    expect(() => runtime.getPlannedOutcomes()).not.toThrow();
    expect(Array.isArray(runtime.getObservations())).toBe(true);
  });
});

// ── Review Focus 5: transport-parity witness ────────────────────────────────

describe('Review Focus 5 — transport parity witness', () => {
  it('test witness detects opaque lower transport duplication', async () => {
    const h = await buildRuntimeHarness('LOW');
    h.client.models.generateContent = async () => {
      h.witness.sdk++;
      h.witness.transport += 2;
      return { text: 'fixture text', modelVersion: 'fixture-model-v1' };
    };
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    await runtime.runOutcome(h.plan[0]!.key, async (caps) => caps.generateVision(VISION_REQUEST));
    expect(h.witness.sdk).toBe(1);
    expect(h.witness.transport).toBe(2);
    expect(() => assertTransportParity(runtime.getObservations(), h.witness.transport)).toThrow(
      'test-transport-reservation-mismatch',
    );
  });

  it('positive control: transport parity holds for one reservation and one dispatch', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    await runtime.runOutcome(h.plan[0]!.key, async (caps) => caps.generateVision(VISION_REQUEST));
    expect(() => assertTransportParity(runtime.getObservations(), h.witness.transport)).not.toThrow();
  });
});

// ── Duplicate and overlapping operations ────────────────────────────────────

describe('duplicate and overlapping operations', () => {
  it('rejects reusing the same outcome key a second time', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    const key = h.plan[0]!.key;
    const text = await runtime.runOutcome(key, async (caps) => caps.generateVision(VISION_REQUEST));
    expect(text).toBe('{"fixture":true}');
    expect(h.witness.sdk).toBe(1);
    await expect(runtime.runOutcome(key, async (caps) => caps.generateVision(VISION_REQUEST))).rejects.toThrow(
      'calibration:runtime-duplicate-key',
    );
    expect(h.witness.sdk).toBe(1);
  });

  it('rejects invoking loadImage twice within one outcome', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    const key = findKey(h, (r) => r.key.stage === 'development' && r.scanMode !== 'barcode');
    await expect(
      runtime.runOutcome(key, async (caps) => {
        await caps.loadImage();
        await caps.loadImage();
        return 'unreached';
      }),
    ).rejects.toThrow('calibration:runtime-duplicate-operation');
    expect(h.calls).toEqual(['image']);
  });

  it('rejects invoking generateVision twice within one outcome', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    const key = h.plan[0]!.key;
    await expect(
      runtime.runOutcome(key, async (caps) => {
        await caps.generateVision(VISION_REQUEST);
        return caps.generateVision(VISION_REQUEST);
      }),
    ).rejects.toThrow('calibration:runtime-duplicate-operation');
    expect(h.witness.sdk).toBe(1);
  });

  it('rejects invoking lookupSnapshot twice within one outcome', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    const key = findKey(h, (r) => r.scanMode === 'barcode');
    await expect(
      runtime.runOutcome(key, async (caps) => {
        caps.lookupSnapshot();
        return caps.lookupSnapshot();
      }),
    ).rejects.toThrow('calibration:runtime-duplicate-operation');
    expect(h.calls).toEqual(['snapshot']);
  });

  it('rejects a snapshot attempt on a meal or label key', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    for (const key of [findKey(h, (r) => r.scanMode === 'meal'), findKey(h, (r) => r.scanMode === 'label')]) {
      h.calls.length = 0;
      const runtime = factory(h.deps);
      await expect(runtime.runOutcome(key, async (caps) => caps.lookupSnapshot())).rejects.toThrow(
        'calibration:runtime-forbidden-operation',
      );
      expect(h.calls).toEqual([]);
    }
  });

  it('rejects a vision attempt started while the loader is still pending, before reaching the generator', async () => {
    const h = await buildRuntimeHarness('LOW');
    const loaderWaiting = deferredVoid();
    h.deps.loadImage = () => loaderWaiting.promise.then(() => new Uint8Array([1, 2, 3]));
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    const key = findKey(h, (r) => r.scanMode !== 'barcode');
    const outcome = runtime.runOutcome(key, async (caps) => {
      const loadPromise = caps.loadImage();
      const visionPromise = caps.generateVision(VISION_REQUEST);
      loaderWaiting.resolve();
      await Promise.allSettled([loadPromise, visionPromise]);
      return visionPromise;
    });
    await expect(outcome).rejects.toBeInstanceOf(CalibrationFatalError);
    expect(h.witness.sdk).toBe(0);
  });

  it('rejects a read API call attempted from within an active body', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    const key = h.plan[0]!.key;
    await expect(
      runtime.runOutcome(key, async () => {
        runtime.getObservations();
        return 'unreached';
      }),
    ).rejects.toBeInstanceOf(CalibrationFatalError);
  });

  it('rejects overlapping outcome leases', async () => {
    const h = await buildRuntimeHarness('LOW');
    const waiting = deferredVoid();
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    const keyA = h.plan[0]!.key;
    const keyB = h.plan[1]!.key;
    const firstOutcome = runtime.runOutcome(keyA, async () => {
      await waiting.promise;
      return 'first';
    });
    await expect(runtime.runOutcome(keyB, async () => 'second')).rejects.toThrow(
      'calibration:runtime-reentrant-operation',
    );
    waiting.resolve();
    await expect(firstOutcome).rejects.toThrow('calibration:runtime-poisoned');
  });
});

// ── Barcode isolation across the full twelve-key benchmark matrix ──────────

describe('barcode isolation across the full twelve-key benchmark matrix', () => {
  it('rejects image and vision on all twelve barcode keys before invoking any port', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const barcodeKeys = h.plan.filter((r) => r.scanMode === 'barcode').map((r) => r.key);
    expect(barcodeKeys).toHaveLength(12);
    for (const key of barcodeKeys) {
      h.calls.length = 0;
      const imageRuntime = factory(h.deps);
      await expect(imageRuntime.runOutcome(key, async (caps) => caps.loadImage())).rejects.toThrow(
        'calibration:runtime-forbidden-operation',
      );
      expect(h.calls).toEqual([]);

      h.calls.length = 0;
      const visionRuntime = factory(h.deps);
      await expect(
        visionRuntime.runOutcome(key, async (caps) => caps.generateVision(VISION_REQUEST)),
      ).rejects.toThrow('calibration:runtime-forbidden-operation');
      expect(h.calls).toEqual([]);
    }
    expect(h.witness.sdk).toBe(0);
  });

  it('allows exactly one snapshot lookup on all twelve barcode keys, calling the real committed barcode and returning the real committed product', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const barcodeRows = h.plan.filter((r) => r.scanMode === 'barcode');
    expect(barcodeRows).toHaveLength(12);
    for (const row of barcodeRows) {
      h.calls.length = 0;
      h.capturedKeys.snapshotBarcodes.length = 0;
      const runtime = factory(h.deps);
      const product = await runtime.runOutcome(row.key, async (caps) => caps.lookupSnapshot());
      const expectedBarcode = h.caseMetadata.get(row.key.caseId)?.barcode;
      expect(expectedBarcode).toBeDefined();
      expect(h.capturedKeys.snapshotBarcodes).toEqual([expectedBarcode]);
      expect(product).toEqual(h.store.get(expectedBarcode as string));
      expect(h.calls).toEqual(['snapshot']);
      expect(
        runtime.getObservations().filter((o) => o.operation === 'snapshot' && o.status === 'completed'),
      ).toHaveLength(1);
    }
    expect(h.witness.sdk).toBe(0);
  });

  it('fails closed when the snapshot lookup yields no product', async () => {
    const h = await buildRuntimeHarness('LOW');
    h.deps.lookupSnapshot = (): undefined => undefined;
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    const key = findKey(h, (r) => r.scanMode === 'barcode');
    await expect(runtime.runOutcome(key, async (caps) => caps.lookupSnapshot())).rejects.toThrow(
      'calibration:runtime-callback-failed',
    );
  });
});

// ── Full vision dispatch matrix across all 146 selected-profile keys ───────

describe('full vision dispatch matrix across all 146 selected-profile keys', () => {
  // This proves the primitive dispatches a native positive generation for
  // every selected-profile vision key once each; it is not a full-controller
  // (146-call production run, restart/completion, or accuracy) proof.
  it('completes exactly one generation per vision key across the entire plan', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    expect(h.plan).toHaveLength(158);
    const visionRows = h.plan.filter((r) => r.scanMode !== 'barcode');
    expect(visionRows).toHaveLength(146);

    for (const row of visionRows) {
      const text = await runtime.runOutcome(row.key, async (caps) => {
        await caps.loadImage();
        return caps.generateVision(VISION_REQUEST);
      });
      expect(text).toBe('{"fixture":true}');
    }

    expect(h.witness.sdk).toBe(146);
    expect(h.witness.transport).toBe(146);
    // Per-row native dispatch sanity (not a full-controller proof): every
    // SDK call carries its own row profile as the thinking level, and every
    // owned reserve key matches its canonical row key.
    expect(h.sdkCalls).toHaveLength(146);
    expect(h.capturedKeys.reserveImageKeys).toHaveLength(146);
    visionRows.forEach((row, index) => {
      const config = h.sdkCalls[index]!.config as { thinkingConfig?: { thinkingLevel?: unknown } };
      expect(config.thinkingConfig?.thinkingLevel).toBe(row.key.profile);
      expect(h.capturedKeys.reserveImageKeys[index]).toEqual({ ...row.key });
    });
    expect(
      runtime.getObservations().filter((r) => r.operation === 'reservation' && r.status === 'completed'),
    ).toHaveLength(146);
    expect(
      runtime.getObservations().filter((r) => r.operation === 'vision' && r.status === 'completed'),
    ).toHaveLength(146);
  }, 30000);
});

// ── Native SDK dispatch payload assertions ──────────────────────────────────

describe('native SDK dispatch payload assertions', () => {
  it('dispatches fixed generator arguments for a LOW-profile meal key using the case-specific png media type', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    const key = findKey(h, (r) => r.key.stage === 'development' && r.key.profile === 'LOW' && r.scanMode === 'meal');
    await runtime.runOutcome(key, async (caps) => {
      await caps.loadImage();
      return caps.generateVision(VISION_REQUEST);
    });
    expect(h.sdkCalls).toHaveLength(1);
    const call = h.sdkCalls[0]!;
    expect(call.model).toBe('gemini-3.8-flash');
    const config = call.config as {
      responseMimeType?: string;
      responseJsonSchema?: unknown;
      httpOptions?: { timeout?: number };
      temperature?: unknown;
      topP?: unknown;
      topK?: unknown;
    };
    expect(config.responseMimeType).toBe('application/json');
    expect(config.responseJsonSchema).toEqual(visionResponseJsonSchema('meal'));
    expect(config.httpOptions?.timeout).toBe(30000);
    expect(config.temperature).toBeUndefined();
    expect(config.topP).toBeUndefined();
    expect(config.topK).toBeUndefined();
    const contents = call.contents as Array<{ parts: Array<{ inlineData?: { mimeType?: string } }> }>;
    expect(h.caseMetadata.get(key.caseId)?.mediaType).toBe('image/png');
    expect(contents[0]!.parts[1]!.inlineData?.mimeType).toBe(h.caseMetadata.get(key.caseId)?.mediaType);
  });

  it('maps MEDIUM thinkingLevel distinctly from LOW for the same case', async () => {
    const mediumHarness = await buildRuntimeHarness('MEDIUM');
    const { factory } = await loadRuntimeModule();
    const mediumRuntime = factory(mediumHarness.deps);
    const mediumKey = findKey(
      mediumHarness,
      (r) => r.key.stage === 'development' && r.key.profile === 'MEDIUM' && r.scanMode === 'meal',
    );
    await mediumRuntime.runOutcome(mediumKey, async (caps) => {
      await caps.loadImage();
      return caps.generateVision(VISION_REQUEST);
    });
    const mediumConfig = mediumHarness.sdkCalls[0]!.config as { thinkingConfig?: { thinkingLevel?: unknown } };
    // Installed SDK enum values are uppercase literals, not lowercase.
    expect(mediumConfig.thinkingConfig?.thinkingLevel).toBe(ThinkingLevel.MEDIUM);
    expect(mediumConfig.thinkingConfig?.thinkingLevel).toBe('MEDIUM');

    const lowHarness = await buildRuntimeHarness('LOW');
    const lowRuntime = factory(lowHarness.deps);
    const lowKey = findKey(
      lowHarness,
      (r) => r.key.stage === 'development' && r.key.profile === 'LOW' && r.scanMode === 'meal',
    );
    await lowRuntime.runOutcome(lowKey, async (caps) => {
      await caps.loadImage();
      return caps.generateVision(VISION_REQUEST);
    });
    const lowConfig = lowHarness.sdkCalls[0]!.config as { thinkingConfig?: { thinkingLevel?: unknown } };
    expect(lowConfig.thinkingConfig?.thinkingLevel).toBe(ThinkingLevel.LOW);
    expect(lowConfig.thinkingConfig?.thinkingLevel).toBe('LOW');
    expect(lowConfig.thinkingConfig?.thinkingLevel).not.toBe(mediumConfig.thinkingConfig?.thinkingLevel);
  });

  it('dispatches the key profile MEDIUM even when the selected profile is LOW', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    // A LOW-selected plan still contains canonical MEDIUM development keys;
    // dispatch must use the key's own profile, not the global selection.
    const mediumKey = findKey(
      h,
      (r) => r.key.stage === 'development' && r.key.profile === 'MEDIUM' && r.scanMode === 'meal',
    );
    await runtime.runOutcome(mediumKey, async (caps) => {
      await caps.loadImage();
      return caps.generateVision(VISION_REQUEST);
    });
    expect(h.sdkCalls).toHaveLength(1);
    const config = h.sdkCalls[0]!.config as { thinkingConfig?: { thinkingLevel?: unknown } };
    expect(config.thinkingConfig?.thinkingLevel).toBe(ThinkingLevel.MEDIUM);
    expect(config.thinkingConfig?.thinkingLevel).toBe('MEDIUM');
  });

  it('forwards the exact prompt, image bytes, model, media type, schema, timeout, and owned hooks', async () => {
    const h = await buildRuntimeHarness('LOW');
    // Capture the real native generator BEFORE installing the inspecting
    // wrapper, then delegate so the real adapter hook still runs; a
    // stub-only positive must not stand in for native dispatch.
    const originalGenerateVision = h.deps.generateVision;
    let observedArgs:
      | { model: string; prompt: string; imageBase64: string; source: unknown; options: unknown }
      | undefined;
    h.deps.generateVision = async (
      model: string,
      prompt: string,
      imageBase64: string,
      source?: unknown,
      options?: unknown,
    ) => {
      observedArgs = { model, prompt, imageBase64, source, options };
      return (originalGenerateVision as (...a: unknown[]) => Promise<string>)(model, prompt, imageBase64, source, options);
    };
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    const key = findKey(h, (r) => r.key.stage === 'development' && r.key.profile === 'LOW' && r.scanMode === 'meal');
    const request = { prompt: 'exact prompt bytes', imageBase64: 'AQID' };
    await runtime.runOutcome(key, async (caps) => {
      await caps.loadImage();
      return caps.generateVision(request);
    });
    expect(observedArgs).toBeDefined();
    expect(observedArgs!.model).toBe('gemini-3.8-flash');
    expect(observedArgs!.prompt).toBe('exact prompt bytes');
    expect(observedArgs!.imageBase64).toBe('AQID');
    const options = observedArgs!.options as {
      mode?: unknown;
      thinkingLevel?: unknown;
      imageMediaType?: unknown;
      timeoutMs?: unknown;
      beforeRequest?: unknown;
      onResponseMetadata?: unknown;
    };
    expect(options.mode).toBe('calibration');
    // Observed generator options carry the key profile, not a global.
    expect(options.thinkingLevel).toBe('LOW');
    expect(options.imageMediaType).toBe(h.caseMetadata.get(key.caseId)?.mediaType);
    expect(options.timeoutMs).toBe(30000);
    expect(typeof options.beforeRequest).toBe('function');
    expect(typeof options.onResponseMetadata).toBe('function');
    // Native SDK payload mirrors the same request bytes.
    expect(h.sdkCalls).toHaveLength(1);
    const sdkCall = h.sdkCalls[0]!;
    expect(sdkCall.model).toBe('gemini-3.8-flash');
    const contents = sdkCall.contents as Array<{ parts: Array<{ text?: string; inlineData?: { data?: string; mimeType?: string } }> }>;
    expect(contents[0]!.parts[0]!.text).toBe('exact prompt bytes');
    expect(contents[0]!.parts[1]!.inlineData?.data).toBe('AQID');
    const sdkConfig = sdkCall.config as {
      responseMimeType?: unknown;
      responseJsonSchema?: unknown;
      thinkingConfig?: { thinkingLevel?: unknown };
      httpOptions?: { timeout?: unknown };
      temperature?: unknown;
      topP?: unknown;
      topK?: unknown;
    };
    expect(sdkConfig.responseMimeType).toBe('application/json');
    expect(sdkConfig.responseJsonSchema).toEqual(visionResponseJsonSchema('meal'));
    expect(sdkConfig.thinkingConfig?.thinkingLevel).toBe(ThinkingLevel.LOW);
    expect(sdkConfig.httpOptions?.timeout).toBe(30000);
    expect(sdkConfig.temperature).toBeUndefined();
    expect(sdkConfig.topP).toBeUndefined();
    expect(sdkConfig.topK).toBeUndefined();
  });

  it('dispatches the label schema and jpeg media type for a benchmark label key', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    const key = findKey(h, (r) => r.scanMode === 'label');
    await runtime.runOutcome(key, async (caps) => {
      await caps.loadImage();
      return caps.generateVision(VISION_REQUEST);
    });
    const call = h.sdkCalls[0]!;
    expect((call.config as { responseJsonSchema?: unknown }).responseJsonSchema).toEqual(
      visionResponseJsonSchema('label'),
    );
    const contents = call.contents as Array<{ parts: Array<{ inlineData?: { mimeType?: string } }> }>;
    expect(h.caseMetadata.get(key.caseId)?.mediaType).toBe('image/jpeg');
    expect(contents[0]!.parts[1]!.inlineData?.mimeType).toBe('image/jpeg');
  });
});

// ── Provider failure, continuation, and contract-fatal blank text ──────────

describe('provider failure, continuation, and contract-fatal blank text', () => {
  it('maps an ordinary provider rejection to CalibrationRuntimeProviderError without poisoning later keys, and the failed key is consumed, not retried', async () => {
    const h = await buildRuntimeHarness('LOW');
    h.client.models.generateContent = async (params: { model: string; contents: unknown; config?: unknown }) => {
      h.witness.sdk++;
      h.witness.transport++;
      h.calls.push('sdk');
      h.sdkCalls.push({ model: params.model, contents: params.contents, config: params.config });
      return { text: '', modelVersion: 'fixture-model-v1' };
    };
    const { factory, ProviderError } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    const firstKey = h.plan[0]!.key;
    await expect(
      runtime.runOutcome(firstKey, async (caps) => {
        await caps.loadImage();
        return caps.generateVision(VISION_REQUEST);
      }),
    ).rejects.toBeInstanceOf(ProviderError);
    expect(h.witness.sdk).toBe(1);
    expect(
      runtime.getObservations().filter((r) => r.operation === 'vision' && r.status === 'completed'),
    ).toHaveLength(0);
    expect(
      runtime.getObservations().filter((r) => r.operation === 'vision' && r.status === 'failed'),
    ).toHaveLength(1);

    h.client.models.generateContent = async (params: { model: string; contents: unknown; config?: unknown }) => {
      h.witness.sdk++;
      h.witness.transport++;
      h.calls.push('sdk');
      h.sdkCalls.push({ model: params.model, contents: params.contents, config: params.config });
      return { text: '{"fixture":true}', modelVersion: 'fixture-model-v1' };
    };
    const secondKey = findKey(
      h,
      (r) => r.key.stage === 'development' && r.scanMode !== 'barcode' && r.key.caseId !== firstKey.caseId,
    );
    const text = await runtime.runOutcome(secondKey, async (caps) => {
      await caps.loadImage();
      return caps.generateVision(VISION_REQUEST);
    });
    expect(text).toBe('{"fixture":true}');
    expect(h.witness.sdk).toBe(2);

    await expect(
      runtime.runOutcome(firstKey, async (caps) => caps.generateVision(VISION_REQUEST)),
    ).rejects.toThrow('calibration:runtime-duplicate-key');
    expect(h.witness.sdk).toBe(2);
  });

  it('maps a hostile foreign SDK throw to a fresh CalibrationRuntimeProviderError with exactly one SDK call and zero completed vision observations', async () => {
    const h = await buildRuntimeHarness('LOW');
    const witness = hostileForeignError('PRIVATE-SENTINEL-FOREIGN-SDK-THROW');
    h.client.models.generateContent = async () => {
      h.witness.sdk++;
      h.calls.push('sdk');
      throw witness.error;
    };
    const { factory, ProviderError } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    const rejection = runtime.runOutcome(h.plan[0]!.key, async (caps) => caps.generateVision(VISION_REQUEST));
    await expect(rejection).rejects.toBeInstanceOf(ProviderError);
    await expect(rejection).rejects.not.toThrow('PRIVATE-SENTINEL-FOREIGN-SDK-THROW');
    const caught = await rejection.catch((error: unknown) => error);
    // The escaped error is a locally constructed static error, never the
    // foreign hostile proxy itself (never inspected via instanceof/prototype
    // against the foreign value).
    expect(caught).not.toBe(witness.error);
    expect((caught as { code?: unknown }).code).toBe('provider_request_failed');
    expect((caught as Error).name).toBe('CalibrationRuntimeProviderError');
    expect((caught as Error).message).toBe('calibration:runtime-provider-failed');
    expect((caught as { cause?: unknown }).cause).toBeUndefined();
    // No probe of the foreign error's message/stack/cause/name/prototype may
    // have fired; a source that caught a probe exception internally would
    // otherwise still look superficially correct.
    expect(witness.getProbes()).toBe(0);
    expect(h.witness.sdk).toBe(1);
    expect(
      runtime.getObservations().filter((r) => r.operation === 'vision' && r.status === 'completed'),
    ).toHaveLength(0);
    expect(
      runtime.getObservations().filter((r) => r.operation === 'vision' && r.status === 'failed'),
    ).toHaveLength(1);
  });

  it('rejects a generator that returns a blank string after completing the hook and valid metadata as a contract fatal, not a provider failure', async () => {
    const h = await buildRuntimeHarness('LOW');
    h.deps.generateVision = async (
      _model: string,
      _prompt: string,
      _imageBase64: string,
      _source?: unknown,
      options?: { beforeRequest?: () => Promise<void>; onResponseMetadata?: (m: { modelVersion?: string }) => void },
    ) => {
      await options?.beforeRequest?.();
      options?.onResponseMetadata?.({ modelVersion: 'fixture-model-v1' });
      return '';
    };
    const { factory, ProviderError } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    const rejection = runtime.runOutcome(h.plan[0]!.key, async (caps) => caps.generateVision(VISION_REQUEST));
    await expect(rejection).rejects.toBeInstanceOf(CalibrationFatalError);
    await expect(rejection).rejects.not.toBeInstanceOf(ProviderError);
    await expect(rejection).rejects.toThrow('calibration:runtime-dispatch-contract-invalid');
  });
});

// ── Opaque and unknown failure handling ─────────────────────────────────────

describe('opaque and unknown failure handling', () => {
  it('returns an opaque parse-failure-shaped body result without treating it as fatal', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    const key = h.plan[0]!.key;
    const result = await runtime.runOutcome(key, async () => ({ parseFailed: true, reason: 'unparseable' }));
    expect(result).toEqual({ parseFailed: true, reason: 'unparseable' });
    expect(h.calls).toEqual([]);
  });

  it('wraps an unknown body exception as a static causeless fatal', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    const key = h.plan[0]!.key;
    const rejection = runtime.runOutcome(key, async () => {
      throw new Error('PRIVATE-SENTINEL-BODY');
    });
    await expect(rejection).rejects.toBeInstanceOf(CalibrationFatalError);
    await expect(rejection).rejects.not.toThrow('PRIVATE-SENTINEL-BODY');
    await expect(rejection).rejects.toThrow('calibration:runtime-callback-failed');
  });

  it('wraps an unknown loader exception as a static causeless fatal', async () => {
    const h = await buildRuntimeHarness('LOW');
    h.deps.loadImage = async () => {
      throw new Error('PRIVATE-SENTINEL-LOADER');
    };
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    const key = findKey(h, (r) => r.scanMode !== 'barcode');
    const rejection = runtime.runOutcome(key, async (caps) => caps.loadImage());
    await expect(rejection).rejects.toBeInstanceOf(CalibrationFatalError);
    await expect(rejection).rejects.not.toThrow('PRIVATE-SENTINEL-LOADER');
    await expect(rejection).rejects.toThrow('calibration:runtime-callback-failed');
  });

  it('wraps an unknown version-callback exception as a static causeless fatal', async () => {
    const h = await buildRuntimeHarness('LOW');
    h.deps.onModelVersion = () => {
      throw new Error('PRIVATE-SENTINEL-VERSION-CALLBACK');
    };
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    const rejection = runtime.runOutcome(h.plan[0]!.key, async (caps) => caps.generateVision(VISION_REQUEST));
    await expect(rejection).rejects.toBeInstanceOf(CalibrationFatalError);
    await expect(rejection).rejects.not.toThrow('PRIVATE-SENTINEL-VERSION-CALLBACK');
  });

  it('wraps a reserveImage failure as a dedicated reservation fatal with zero SDK dispatches, stopping future scheduling', async () => {
    const h = await buildRuntimeHarness('LOW');
    h.deps.reserveImage = async () => {
      throw new Error('PRIVATE-SENTINEL-RESERVE');
    };
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    const rejection = runtime.runOutcome(h.plan[0]!.key, async (caps) => caps.generateVision(VISION_REQUEST));
    await expect(rejection).rejects.toBeInstanceOf(CalibrationFatalError);
    await expect(rejection).rejects.toThrow('calibration:runtime-reservation-failed');
    expect(h.witness.sdk).toBe(0);
    await expect(
      runtime.runOutcome(h.plan[1]!.key, async (caps) => caps.generateVision(VISION_REQUEST)),
    ).rejects.toThrow('calibration:runtime-poisoned');
  });

  it('never reuses a mutated locally received fatal error instance', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    const key = findKey(h, (r) => r.key.stage === 'development' && r.scanMode !== 'barcode');
    let capturedMessage: string | undefined;
    const outer = runtime.runOutcome(key, async (caps) => {
      try {
        await caps.loadImage();
        await caps.loadImage();
      } catch (caught) {
        if (caught instanceof Error) {
          capturedMessage = caught.message;
          caught.message = 'SENTINEL-MUTATED-BY-BODY';
          (caught as { cause?: unknown }).cause = 'SENTINEL-CAUSE';
        }
        throw caught;
      }
      return 'unreached';
    });
    await expect(outer).rejects.toBeInstanceOf(CalibrationFatalError);
    await expect(outer).rejects.not.toThrow('SENTINEL-MUTATED-BY-BODY');
    expect(capturedMessage).toBe('calibration:runtime-duplicate-operation');
  });

  it('never reuses a mutated locally received provider error instance', async () => {
    const h = await buildRuntimeHarness('LOW');
    h.client.models.generateContent = async () => {
      h.witness.sdk++;
      h.witness.transport++;
      return { text: '', modelVersion: 'fixture-model-v1' };
    };
    const { factory, ProviderError } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    const key = h.plan[0]!.key;
    let innerSeen: unknown;
    let probeCount = 0;
    const outer = runtime.runOutcome(key, async (caps) => {
      try {
        await caps.generateVision(VISION_REQUEST);
      } catch (caught) {
        innerSeen = caught;
        if (caught instanceof Error) {
          caught.name = 'SentinelMutatedName';
          caught.message = 'SENTINEL-MUTATED-PROVIDER';
          (caught as { code?: unknown }).code = 'SENTINEL-MUTATED-CODE';
          (caught as { cause?: unknown }).cause = { sentinel: 'cause' };
          Object.setPrototypeOf(caught, null);
          Object.defineProperty(caught, 'message', {
            enumerable: true,
            get() {
              probeCount++;
              throw new Error('HOSTILE-MESSAGE-GETTER');
            },
          });
        }
        throw caught;
      }
      return 'unreached';
    });
    await expect(outer).rejects.toBeInstanceOf(ProviderError);
    await expect(outer).rejects.not.toThrow('SENTINEL-MUTATED-PROVIDER');
    const outerError = await outer.then(
      () => {
        throw new Error('test setup: expected rejection');
      },
      (error: unknown) => error,
    );
    expect(innerSeen).toBeDefined();
    expect(outerError).not.toBe(innerSeen);
    expect(outerError).toBeInstanceOf(ProviderError);
    expect((outerError as Error).name).toBe('CalibrationRuntimeProviderError');
    expect((outerError as Error).message).toBe('calibration:runtime-provider-failed');
    expect((outerError as { code?: unknown }).code).toBe('provider_request_failed');
    expect((outerError as { cause?: unknown }).cause).toBeUndefined();
    expect(probeCount).toBe(0);
  });
});

// ── generateVision capability request shape ─────────────────────────────────

describe('generateVision capability request shape', () => {
  it('rejects malformed two-field vision requests', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const malformedRequests: readonly unknown[] = [
      { prompt: '', imageBase64: 'AQID' },
      { prompt: 'fixture prompt', imageBase64: '' },
      { prompt: 'fixture prompt', imageBase64: 'AQID', model: 'gemini-3.8-flash' },
      { prompt: 'fixture prompt' },
      { prompt: 123, imageBase64: 'AQID' },
      { prompt: 'fixture prompt', imageBase64: undefined },
      'fixture prompt',
      null,
    ];
    for (const request of malformedRequests) {
      const runtime = factory(h.deps);
      const key = findKey(h, (r) => r.scanMode !== 'barcode');
      await expect(
        runtime.runOutcome(key, async (caps) => caps.generateVision(request as { prompt: string; imageBase64: string })),
      ).rejects.toThrow('calibration:runtime-dispatch-contract-invalid');
    }
    expect(h.calls).toEqual([]);
  });

  it('rejects structurally hostile two-field vision requests (symbol key, non-enumerable field, getter trap, non-plain prototype)', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const key = findKey(h, (r) => r.scanMode !== 'barcode');

    const withSymbol: Record<string | symbol, unknown> = { prompt: 'fixture prompt', imageBase64: 'AQID' };
    withSymbol[Symbol('x')] = 1;
    await expect(
      factory(h.deps).runOutcome(key, async (caps) =>
        caps.generateVision(withSymbol as unknown as { prompt: string; imageBase64: string }),
      ),
    ).rejects.toThrow('calibration:runtime-dispatch-contract-invalid');

    const nonEnumerable: Record<string, unknown> = { imageBase64: 'AQID' };
    Object.defineProperty(nonEnumerable, 'prompt', { value: 'fixture prompt', enumerable: false });
    await expect(
      factory(h.deps).runOutcome(key, async (caps) =>
        caps.generateVision(nonEnumerable as unknown as { prompt: string; imageBase64: string }),
      ),
    ).rejects.toThrow('calibration:runtime-dispatch-contract-invalid');

    let gets = 0;
    const trapped: Record<string, unknown> = { imageBase64: 'AQID' };
    Object.defineProperty(trapped, 'prompt', {
      enumerable: true,
      get() {
        gets++;
        throw new Error('PRIVATE-SENTINEL-REQUEST');
      },
    });
    await expect(
      factory(h.deps).runOutcome(key, async (caps) =>
        caps.generateVision(trapped as unknown as { prompt: string; imageBase64: string }),
      ),
    ).rejects.toThrow('calibration:runtime-dispatch-contract-invalid');
    expect(gets).toBe(0);

    const nonPlainProto = Object.assign(Object.create({ evil: true }), {
      prompt: 'fixture prompt',
      imageBase64: 'AQID',
    });
    await expect(
      factory(h.deps).runOutcome(key, async (caps) =>
        caps.generateVision(nonPlainProto as unknown as { prompt: string; imageBase64: string }),
      ),
    ).rejects.toThrow('calibration:runtime-dispatch-contract-invalid');

    expect(h.calls).toEqual([]);
  });
});

// ── Response metadata structural validation ─────────────────────────────────

describe('response metadata structural validation', () => {
  it('rejects malformed response metadata object shapes before forwarding to onModelVersion', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const scenarios: ReadonlyArray<{ name: string; build: () => unknown }> = [
      { name: 'extra field', build: () => ({ modelVersion: 'fixture-model-v1', extra: 'nope' }) },
      {
        name: 'symbol key',
        build: () => {
          const o: Record<string | symbol, unknown> = { modelVersion: 'fixture-model-v1' };
          o[Symbol('x')] = 1;
          return o;
        },
      },
      {
        name: 'non-enumerable modelVersion',
        build: () => {
          const o: Record<string, unknown> = {};
          Object.defineProperty(o, 'modelVersion', { value: 'fixture-model-v1', enumerable: false });
          return o;
        },
      },
      { name: 'present-undefined modelVersion', build: () => ({ modelVersion: undefined }) },
      { name: 'empty-string modelVersion', build: () => ({ modelVersion: '' }) },
      { name: 'whitespace modelVersion', build: () => ({ modelVersion: '   ' }) },
      {
        name: 'non-plain prototype',
        build: () => Object.assign(Object.create({ evil: true }), { modelVersion: 'fixture-model-v1' }),
      },
    ];
    for (const scenario of scenarios) {
      // The override MUST be installed before the factory captures the
      // generator reference: a compliant source captures the OLD function at
      // preparation time, so assigning after factory would leave the runtime
      // holding the previous generator and the assertion would be vacuous.
      h.calls.length = 0;
      const buildMetadata = scenario.build;
      h.deps.generateVision = async (
        _model: string,
        _prompt: string,
        _imageBase64: string,
        _source?: unknown,
        options?: VisionGenerationOptions,
      ) => {
        await options?.beforeRequest?.();
        (options?.onResponseMetadata as ((m: unknown) => void) | undefined)?.(buildMetadata());
        return '{"fixture":true}';
      };
      const runtime = factory(h.deps);
      await expect(
        runtime.runOutcome(h.plan[0]!.key, async (caps) => caps.generateVision(VISION_REQUEST)),
      ).rejects.toThrow('calibration:runtime-metadata-invalid');
      expect(h.calls).not.toContain('metadata');
    }
  });

  it('rejects a metadata getter trap without invoking it', async () => {
    const h = await buildRuntimeHarness('LOW');
    let gets = 0;
    h.deps.generateVision = async (
      _model: string,
      _prompt: string,
      _imageBase64: string,
      _source?: unknown,
      options?: VisionGenerationOptions,
    ) => {
      await options?.beforeRequest?.();
      const trapped: Record<string, unknown> = {};
      Object.defineProperty(trapped, 'modelVersion', {
        enumerable: true,
        get() {
          gets++;
          throw new Error('PRIVATE-SENTINEL-METADATA');
        },
      });
      (options?.onResponseMetadata as ((m: unknown) => void) | undefined)?.(trapped);
      return '{"fixture":true}';
    };
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    await expect(
      runtime.runOutcome(h.plan[0]!.key, async (caps) => caps.generateVision(VISION_REQUEST)),
    ).rejects.toThrow('calibration:runtime-metadata-invalid');
    expect(gets).toBe(0);
  });

  it('rejects repeated metadata delivery within one dispatch', async () => {
    const h = await buildRuntimeHarness('LOW');
    h.deps.generateVision = async (
      _model: string,
      _prompt: string,
      _imageBase64: string,
      _source?: unknown,
      options?: VisionGenerationOptions,
    ) => {
      await options?.beforeRequest?.();
      options?.onResponseMetadata?.({ modelVersion: 'fixture-model-v1' });
      options?.onResponseMetadata?.({ modelVersion: 'fixture-model-v1' });
      return '{"fixture":true}';
    };
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    // Either a generic fatal class or the specific metadata-invalid message
    // is an acceptable assertion here (no invented taxonomy beyond the
    // plan's fixed static labels); this suite asserts the specific label for
    // consistency with the rest of this describe block.
    await expect(
      runtime.runOutcome(h.plan[0]!.key, async (caps) => caps.generateVision(VISION_REQUEST)),
    ).rejects.toThrow('calibration:runtime-metadata-invalid');
  });
});

// ── Filesystem, process, and real-SDK isolation guards ──────────────────────

describe('filesystem, process, and real-SDK isolation guards', () => {
  it('performs no additional filesystem or process access once fixtures, derivation, and the runtime module are already loaded', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    fsGuard.active = true;
    execGuard.active = true;
    try {
      const runtime = factory(h.deps);
      const visionKey = findKey(h, (r) => r.scanMode !== 'barcode');
      const text = await runtime.runOutcome(visionKey, async (caps) => {
        await caps.loadImage();
        return caps.generateVision(VISION_REQUEST);
      });
      expect(text).toBe('{"fixture":true}');

      const freshRuntime = factory(h.deps);
      const barcodeKey = findKey(h, (r) => r.scanMode === 'barcode');
      const product = await freshRuntime.runOutcome(barcodeKey, async (caps) => caps.lookupSnapshot());
      expect(product).toBeDefined();
    } finally {
      fsGuard.active = false;
      execGuard.active = false;
    }
  });
});

// ── Observation ledger integrity ────────────────────────────────────────────

describe('observation ledger integrity', () => {
  it('assigns 1-based strictly monotonic sequence numbers with a closed field set', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    const rows = h.plan.filter((r) => r.scanMode !== 'barcode').slice(0, 3);
    for (const row of rows) {
      await runtime.runOutcome(row.key, async (caps) => {
        await caps.loadImage();
        return caps.generateVision(VISION_REQUEST);
      });
    }
    const observations = runtime.getObservations();
    expect(observations.length).toBeGreaterThan(0);
    expect(observations[0]!.sequence).toBe(1);
    for (let i = 1; i < observations.length; i++) {
      expect(observations[i]!.sequence).toBeGreaterThan(observations[i - 1]!.sequence);
    }
    for (const observation of observations) {
      expect(Object.keys(observation).sort()).toEqual(['key', 'operation', 'sequence', 'status']);
      expect(Object.keys(observation.key).sort()).toEqual(['caseId', 'profile', 'sampleIndex', 'stage']);
    }
  });

  it('never retains prompts, image bytes, response text, or private sentinel strings in observations', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    const key = findKey(h, (r) => r.scanMode !== 'barcode');
    await runtime.runOutcome(key, async (caps) => {
      await caps.loadImage();
      return caps.generateVision(VISION_REQUEST);
    });
    const serialized = JSON.stringify(runtime.getObservations());
    for (const forbidden of ['fixture prompt', 'AQID', '{"fixture":true}', 'PRIVATE-SENTINEL', 'fixture-model-v1']) {
      expect(serialized.includes(forbidden)).toBe(false);
    }
  });
});

// ── Closed input reflection matrix (deps/files/key/request/metadata) ────────
// Each exercised reflection trap (ownKeys, getOwnPropertyDescriptor,
// getPrototypeOf) is isolated with a single-trap proxy so every trap path is
// covered; the all-traps proxy only exercises whichever trap fires first.
// `has` is deliberately never trapped: production uses descriptor-only
// validation, not a universal proxy detector.

describe('closed input reflection traps', () => {
  it.each(['ownKeys', 'getOwnPropertyDescriptor', 'getPrototypeOf'] as const)(
    'rejects a deps record whose %s trap throws, with zero ports invoked',
    async (trap) => {
      const h = await buildRuntimeHarness('LOW');
      const { factory } = await loadRuntimeModule();
      const witness = freshReflectionTrapWitness();
      const trappedDeps = hostileSingleTrapProxy(
        { ...h.deps } as unknown as Record<string, unknown> & object,
        witness,
        trap,
      );
      expect(() => factory(trappedDeps)).toThrow('calibration:runtime-input-invalid');
      expect(totalReflectionProbes(witness)).toBeGreaterThan(0);
      expect(h.calls).toEqual([]);
      expect(h.witness.sdk).toBe(0);
    },
  );

  it('rejects a deps record wrapped in an all-traps hostile proxy, with zero ports invoked', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const witness = freshReflectionTrapWitness();
    const trappedDeps = hostileReflectionProxy({ ...h.deps } as unknown as Record<string, unknown> & object, witness);
    expect(() => factory(trappedDeps)).toThrow('calibration:runtime-input-invalid');
    expect(totalReflectionProbes(witness)).toBeGreaterThan(0);
    expect(h.calls).toEqual([]);
    expect(h.witness.sdk).toBe(0);
  });

  it.each(['ownKeys', 'getOwnPropertyDescriptor', 'getPrototypeOf'] as const)(
    'rejects a files sub-record whose %s trap throws, with zero ports invoked',
    async (trap) => {
      const h = await buildRuntimeHarness('LOW');
      const { factory } = await loadRuntimeModule();
      const witness = freshReflectionTrapWitness();
      const trappedFiles = hostileSingleTrapProxy({ ...h.deps.files }, witness, trap);
      expect(() => factory({ ...h.deps, files: trappedFiles })).toThrow('calibration:runtime-input-invalid');
      expect(totalReflectionProbes(witness)).toBeGreaterThan(0);
      expect(h.calls).toEqual([]);
    },
  );

  it('never invokes a throwing own getter on any of the seven files', async () => {
    const fileNames = [
      'public-manifest',
      'prompt',
      'response-schema',
      'source-lock',
      'calibration-manifest',
      'off-lock',
      'historical-reference',
    ] as const;
    for (const name of fileNames) {
      const h = await buildRuntimeHarness('LOW');
      const { factory } = await loadRuntimeModule();
      let gets = 0;
      const files: Record<string, unknown> = { ...h.deps.files };
      Object.defineProperty(files, name, {
        enumerable: true,
        get() {
          gets++;
          throw new Error('PRIVATE-SENTINEL-FILE-GETTER');
        },
      });
      expect(() => factory({ ...h.deps, files })).toThrow('calibration:runtime-input-invalid');
      expect(gets).toBe(0);
      expect(h.calls).toEqual([]);
    }
  });

  it('accepts a null-prototype files sub-record', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const nullProtoFiles = Object.assign(Object.create(null), h.deps.files);
    const runtime = factory({ ...h.deps, files: nullProtoFiles });
    const key = findKey(h, (r) => r.scanMode !== 'barcode');
    const text = await runtime.runOutcome(key, async (caps) => caps.generateVision(VISION_REQUEST));
    expect(text).toBe('{"fixture":true}');
  });

  it.each(['ownKeys', 'getOwnPropertyDescriptor', 'getPrototypeOf'] as const)(
    'rejects an outcome key whose %s trap throws before any port',
    async (trap) => {
      const h = await buildRuntimeHarness('LOW');
      const { factory } = await loadRuntimeModule();
      const runtime = factory(h.deps);
      const witness = freshReflectionTrapWitness();
      const trappedKey = hostileSingleTrapProxy({ ...h.plan[0]!.key }, witness, trap);
      await expect(runtime.runOutcome(trappedKey, async (caps) => caps.loadImage())).rejects.toThrow(
        'calibration:runtime-key-invalid',
      );
      expect(totalReflectionProbes(witness)).toBeGreaterThan(0);
      expect(h.calls).toEqual([]);
      expect(h.witness.sdk).toBe(0);
    },
  );

  it('rejects non-coercible key field types without invoking any port', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const validKey = findKey(h, (r) => r.key.stage === 'development');
    const wrongTyped: ReadonlyArray<{ name: string; key: unknown }> = [
      { name: 'sampleIndex string', key: { ...validKey, sampleIndex: '1' } },
      { name: 'sampleIndex zero', key: { ...validKey, sampleIndex: 0 } },
      { name: 'sampleIndex NaN', key: { ...validKey, sampleIndex: NaN } },
      { name: 'sampleIndex Infinity', key: { ...validKey, sampleIndex: Infinity } },
      { name: 'sampleIndex fraction', key: { ...validKey, sampleIndex: 1.5 } },
      { name: 'stage number', key: { ...validKey, stage: 42 } },
      { name: 'profile number', key: { ...validKey, profile: 42 } },
      { name: 'caseId number', key: { ...validKey, caseId: 42 } },
      { name: 'invalid stage literal', key: { ...validKey, stage: 'production' } },
      { name: 'invalid profile literal', key: { ...validKey, profile: 'HIGH' } },
      { name: 'missing sampleIndex', key: { stage: validKey.stage, profile: validKey.profile, caseId: validKey.caseId } },
      { name: 'present-undefined caseId', key: { ...validKey, caseId: undefined } },
      {
        name: 'non-enumerable caseId',
        key: (() => {
          const o: Record<string, unknown> = { ...validKey };
          Object.defineProperty(o, 'caseId', { enumerable: false, value: validKey.caseId });
          return o;
        })(),
      },
    ];
    for (const { key } of wrongTyped) {
      const runtime = factory(h.deps);
      await expect(runtime.runOutcome(key, async (caps) => caps.loadImage())).rejects.toThrow(
        'calibration:runtime-key-invalid',
      );
      expect(h.calls).toEqual([]);
    }
    expect(h.witness.sdk).toBe(0);
  });

  it('accepts a null-prototype outcome key with canonical fields', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    const validKey = findKey(h, (r) => r.scanMode !== 'barcode');
    const nullProtoKey = Object.assign(Object.create(null), { ...validKey });
    const text = await runtime.runOutcome(nullProtoKey, async (caps) => caps.generateVision(VISION_REQUEST));
    expect(text).toBe('{"fixture":true}');
  });

  it.each(['ownKeys', 'getOwnPropertyDescriptor', 'getPrototypeOf'] as const)(
    'rejects a vision request whose %s trap throws before the generator',
    async (trap) => {
      const h = await buildRuntimeHarness('LOW');
      const { factory } = await loadRuntimeModule();
      const runtime = factory(h.deps);
      const key = findKey(h, (r) => r.scanMode !== 'barcode');
      const witness = freshReflectionTrapWitness();
      const trappedRequest = hostileSingleTrapProxy(
        { prompt: 'fixture prompt', imageBase64: 'AQID' },
        witness,
        trap,
      );
      await expect(
        runtime.runOutcome(key, async (caps) =>
          caps.generateVision(trappedRequest as unknown as { prompt: string; imageBase64: string }),
        ),
      ).rejects.toThrow('calibration:runtime-dispatch-contract-invalid');
      expect(totalReflectionProbes(witness)).toBeGreaterThan(0);
      expect(h.calls).toEqual([]);
      expect(h.witness.sdk).toBe(0);
    },
  );

  it('accepts a null-prototype vision request with valid fields', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    const key = findKey(h, (r) => r.scanMode !== 'barcode');
    const nullProtoRequest = Object.assign(Object.create(null), { prompt: 'fixture prompt', imageBase64: 'AQID' });
    const text = await runtime.runOutcome(key, async (caps) =>
      caps.generateVision(nullProtoRequest as unknown as { prompt: string; imageBase64: string }),
    );
    expect(text).toBe('{"fixture":true}');
  });

  it.each(['ownKeys', 'getOwnPropertyDescriptor', 'getPrototypeOf'] as const)(
    'rejects response metadata whose %s trap throws, without a version port',
    async (trap) => {
      const h = await buildRuntimeHarness('LOW');
      const witness = freshReflectionTrapWitness();
      // Override BEFORE factory so the runtime captures this generator.
      h.deps.generateVision = async (
        _model: string,
        _prompt: string,
        _imageBase64: string,
        _source?: unknown,
        options?: VisionGenerationOptions,
      ) => {
        await options?.beforeRequest?.();
        const trapped = hostileSingleTrapProxy({ modelVersion: 'fixture-model-v1' }, witness, trap);
        options?.onResponseMetadata?.(trapped);
        return '{"fixture":true}';
      };
      const { factory } = await loadRuntimeModule();
      const runtime = factory(h.deps);
      await expect(
        runtime.runOutcome(h.plan[0]!.key, async (caps) => caps.generateVision(VISION_REQUEST)),
      ).rejects.toThrow('calibration:runtime-metadata-invalid');
      expect(totalReflectionProbes(witness)).toBeGreaterThan(0);
      expect(h.calls).not.toContain('metadata');
    },
  );

  it('accepts null-prototype response metadata and forwards the version', async () => {
    const h = await buildRuntimeHarness('LOW');
    h.deps.generateVision = async (
      _model: string,
      _prompt: string,
      _imageBase64: string,
      _source?: unknown,
      options?: VisionGenerationOptions,
    ) => {
      await options?.beforeRequest?.();
      options?.onResponseMetadata?.(Object.assign(Object.create(null), { modelVersion: 'fixture-model-v1' }));
      return '{"fixture":true}';
    };
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    const text = await runtime.runOutcome(h.plan[0]!.key, async (caps) => caps.generateVision(VISION_REQUEST));
    expect(text).toBe('{"fixture":true}');
    expect(h.calls).toContain('metadata');
  });

  it('rejects caller plan/key-list overrides at preparation time', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    expect(() => factory({ ...h.deps, plan: h.plan })).toThrow('calibration:runtime-input-invalid');
    expect(() => factory({ ...h.deps, keyList: h.plan.map((r) => r.key) })).toThrow(
      'calibration:runtime-input-invalid',
    );
    expect(h.calls).toEqual([]);
  });
});

// ── Both read APIs under reentry (body + all five ports) ────────────────────
// getObservations AND getPlannedOutcomes are both unavailable during an
// active lease. Each port deliberately catches the read error and returns
// normally; permanent poison must still win at the next await/callback
// boundary, the same-runtime next key must be runtime-poisoned, and no
// additional ports may fire afterwards.

describe('read APIs under reentry', () => {
  it('rejects a getPlannedOutcomes call attempted from within an active body', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    const key = h.plan[0]!.key;
    await expect(
      runtime.runOutcome(key, async () => {
        runtime.getPlannedOutcomes();
        return 'unreached';
      }),
    ).rejects.toBeInstanceOf(CalibrationFatalError);
  });

  it.each([
    ['loadImage', 'getObservations'],
    ['loadImage', 'getPlannedOutcomes'],
    ['generateVision', 'getObservations'],
    ['generateVision', 'getPlannedOutcomes'],
    ['reserveImage', 'getObservations'],
    ['reserveImage', 'getPlannedOutcomes'],
    ['onModelVersion', 'getObservations'],
    ['onModelVersion', 'getPlannedOutcomes'],
    ['lookupSnapshot', 'getObservations'],
    ['lookupSnapshot', 'getPlannedOutcomes'],
  ] as const)(
    'poison wins after %s swallows a %s read: outer fails, next key poisoned, no further ports',
    async (port, readApi) => {
      const h = await buildRuntimeHarness('LOW');
      // Capture the healthy native generator first so the wrapper below
      // delegates to real adapter dispatch; a missing hook must not mask the
      // read-poison assertion.
      const originalGenerateVision = h.deps.generateVision;
      const nativeGenerate = (...args: unknown[]) =>
        (originalGenerateVision as (...a: unknown[]) => Promise<string>)(...args);
      let readRejected = false;
      // `runtime` is declared below after the port wrappers are installed
      // (wrappers must be in place BEFORE the factory captures references);
      // the closures only run later during runOutcome, so the forward capture
      // is safe. Same established pattern as the Review Focus 2 tests above.
      const attemptRead = () => {
        try {
          if (readApi === 'getObservations') {
            (runtime as unknown as { getObservations: () => unknown }).getObservations();
          } else {
            (runtime as unknown as { getPlannedOutcomes: () => unknown }).getPlannedOutcomes();
          }
        } catch {
          readRejected = true;
        }
      };
      if (port === 'loadImage') {
        const original = h.deps.loadImage;
        h.deps.loadImage = async (key: Readonly<ReservationKey>) => {
          attemptRead();
          return original(key);
        };
      } else if (port === 'generateVision') {
        h.deps.generateVision = async (model: string, prompt: string, imageBase64: string, source?: unknown, options?: unknown) => {
          attemptRead();
          return nativeGenerate(model, prompt, imageBase64, source, options);
        };
      } else if (port === 'reserveImage') {
        const original = h.deps.reserveImage;
        h.deps.reserveImage = async (key: Readonly<ReservationKey>) => {
          attemptRead();
          return original(key);
        };
      } else if (port === 'onModelVersion') {
        const original = h.deps.onModelVersion;
        h.deps.onModelVersion = (key: Readonly<ReservationKey>, version: string) => {
          attemptRead();
          return original(key, version);
        };
      } else {
        const original = h.deps.lookupSnapshot;
        h.deps.lookupSnapshot = (barcode: string) => {
          attemptRead();
          return original(barcode);
        };
      }
      const { factory } = await loadRuntimeModule();
      const runtime = factory(h.deps);
      const useBarcode = port === 'lookupSnapshot';
      const key = useBarcode ? findKey(h, (r) => r.scanMode === 'barcode') : findKey(h, (r) => r.scanMode !== 'barcode');
      const portsBefore = h.calls.length;
      if (useBarcode) {
        await expect(runtime.runOutcome(key, async (caps) => caps.lookupSnapshot())).rejects.toBeInstanceOf(
          CalibrationFatalError,
        );
      } else {
        await expect(
          runtime.runOutcome(key, async (caps) => {
            await caps.loadImage().catch(() => new Uint8Array([9]));
            return caps.generateVision(VISION_REQUEST).catch(() => 'swallowed-vision');
          }),
        ).rejects.toBeInstanceOf(CalibrationFatalError);
      }
      expect(readRejected).toBe(true);
      // Poison is permanent on this runtime: the next key fails poisoned.
      const portsAfterFailure = h.calls.length;
      const nextKey = findKey(h, (r) => r.key.caseId !== key.caseId && (useBarcode ? r.scanMode === 'barcode' : r.scanMode !== 'barcode'));
      await expect(
        runtime.runOutcome(nextKey, async (caps) =>
          useBarcode ? caps.lookupSnapshot() : caps.generateVision(VISION_REQUEST),
        ),
      ).rejects.toThrow('calibration:runtime-poisoned');
      expect(h.calls.length).toBe(portsAfterFailure);
      expect(portsAfterFailure).toBeGreaterThanOrEqual(portsBefore);
      // Diagnostics stay readable after the settled poison.
      expect(() => runtime.getObservations()).not.toThrow();
      expect(() => runtime.getPlannedOutcomes()).not.toThrow();
    },
  );

  it('load/reserve/generator read poison stops before a later SDK dispatch', async () => {
    for (const port of ['loadImage', 'reserveImage', 'generateVision'] as const) {
      const h = await buildRuntimeHarness('LOW');
      const originalGenerateVision = h.deps.generateVision;
      const nativeGenerate = (...args: unknown[]) =>
        (originalGenerateVision as (...a: unknown[]) => Promise<string>)(...args);
      if (port === 'loadImage') {
        const original = h.deps.loadImage;
        h.deps.loadImage = async (key: Readonly<ReservationKey>) => {
          try {
            (runtime as unknown as { getObservations: () => unknown }).getObservations();
          } catch {
            /* swallowed on purpose: poison must still win */
          }
          return original(key);
        };
      } else if (port === 'reserveImage') {
        const original = h.deps.reserveImage;
        h.deps.reserveImage = async (key: Readonly<ReservationKey>) => {
          try {
            (runtime as unknown as { getObservations: () => unknown }).getObservations();
          } catch {
            /* swallowed on purpose */
          }
          return original(key);
        };
      } else {
        h.deps.generateVision = async (model: string, prompt: string, imageBase64: string, source?: unknown, options?: unknown) => {
          try {
            (runtime as unknown as { getObservations: () => unknown }).getObservations();
          } catch {
            /* swallowed on purpose */
          }
          return nativeGenerate(model, prompt, imageBase64, source, options);
        };
      }
      const { factory } = await loadRuntimeModule();
      const runtime = factory(h.deps);
      const key = findKey(h, (r) => r.scanMode !== 'barcode');
      await expect(
        runtime.runOutcome(key, async (caps) => {
          await caps.loadImage().catch(() => new Uint8Array([9]));
          return caps.generateVision(VISION_REQUEST).catch(() => 'swallowed');
        }),
      ).rejects.toBeInstanceOf(CalibrationFatalError);
      expect(h.witness.sdk).toBe(0);
    }
  });
});

// ── Fresh static errors, frozen owned callback keys, omitted cases ──────────

describe('fresh errors, frozen callback keys, and omitted cases', () => {
  it('rebuilds unknown body/loader/reserve/version/snapshot failures as fresh causeless statics', async () => {
    for (const failing of ['body', 'loader', 'reserve', 'version', 'snapshot'] as const) {
      const h = await buildRuntimeHarness('LOW');
      const inner = new Error(`PRIVATE-SENTINEL-${failing.toUpperCase()}`);
      (inner as { cause?: unknown }).cause = { sentinel: true };
      if (failing === 'body') {
        // Body throws an unknown error carrying a cause; nothing leaks.
      } else if (failing === 'loader') {
        h.deps.loadImage = async () => {
          throw inner;
        };
      } else if (failing === 'reserve') {
        h.deps.reserveImage = async () => {
          throw inner;
        };
      } else if (failing === 'version') {
        h.deps.onModelVersion = () => {
          throw inner;
        };
      } else {
        h.deps.lookupSnapshot = () => {
          throw inner;
        };
      }
      const { factory } = await loadRuntimeModule();
      const runtime = factory(h.deps);
      const key =
        failing === 'snapshot'
          ? findKey(h, (r) => r.scanMode === 'barcode')
          : findKey(h, (r) => r.scanMode !== 'barcode');
      const outer = failing === 'body'
        ? runtime.runOutcome(key, async () => {
            throw inner;
          })
        : failing === 'snapshot'
          ? runtime.runOutcome(key, async (caps) => caps.lookupSnapshot())
          : failing === 'loader'
            ? runtime.runOutcome(key, async (caps) => caps.loadImage())
            : runtime.runOutcome(key, async (caps) => caps.generateVision(VISION_REQUEST));
      const caught = await outer.then(
        () => {
          throw new Error('test setup: expected rejection');
        },
        (error: unknown) => error,
      );
      expect(caught).toBeInstanceOf(CalibrationFatalError);
      expect(caught).not.toBe(inner);
      expect((caught as Error).message).not.toContain('PRIVATE-SENTINEL');
      expect((caught as { cause?: unknown }).cause).toBeUndefined();
      // Poison schedules fresh poisoned errors afterwards.
      const nextKey = findKey(h, (r) => r.key.caseId !== key.caseId && (failing === 'snapshot' ? r.scanMode === 'barcode' : r.scanMode !== 'barcode'));
      const second = await runtime
        .runOutcome(nextKey, async (caps) =>
          failing === 'snapshot' ? caps.lookupSnapshot() : caps.generateVision(VISION_REQUEST),
        )
        .then(
          () => {
            throw new Error('test setup: expected poisoned rejection');
          },
          (error: unknown) => error,
        );
      expect((second as Error).message).toBe('calibration:runtime-poisoned');
      expect(second).not.toBe(caught);
      expect((second as { cause?: unknown }).cause).toBeUndefined();
    }
  });

  it('proves static reconstruction from a mutated local error with throwing getters', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    const key = findKey(h, (r) => r.key.stage === 'development' && r.scanMode !== 'barcode');
    let innerSeen: unknown;
    const outer = runtime.runOutcome(key, async (caps) => {
      try {
        await caps.loadImage();
        await caps.loadImage();
      } catch (caught) {
        innerSeen = caught;
        if (caught instanceof Error) {
          // Mutate every observable channel, including prototype and
          // throwing accessors, to prove the escaping error is rebuilt from
          // private identity rather than foreign property reflection.
          caught.message = 'SENTINEL-MUTATED-MESSAGE';
          caught.name = 'SentinelMutatedName';
          (caught as { cause?: unknown }).cause = { sentinel: 'cause' };
          Object.setPrototypeOf(caught, null);
          Object.defineProperty(caught, 'message', {
            enumerable: true,
            get() {
              throw new Error('HOSTILE-MESSAGE-GETTER');
            },
          });
        }
        throw caught;
      }
      return 'unreached';
    });
    const outerError = await outer.then(
      () => {
        throw new Error('test setup: expected rejection');
      },
      (error: unknown) => error,
    );
    expect(innerSeen).toBeDefined();
    expect(outerError).not.toBe(innerSeen);
    expect(outerError).toBeInstanceOf(CalibrationFatalError);
    expect((outerError as Error).message).toBe('calibration:runtime-duplicate-operation');
    expect((outerError as { cause?: unknown }).cause).toBeUndefined();
  });

  it('maps a hostile foreign snapshot throw to a fresh callback-failed static with zero probes, no fallback, and poisoned future keys', async () => {
    const h = await buildRuntimeHarness('LOW');
    const witness = hostileForeignError('PRIVATE-SENTINEL-FOREIGN-SNAPSHOT');
    h.deps.lookupSnapshot = () => {
      throw witness.error;
    };
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    const key = findKey(h, (r) => r.scanMode === 'barcode');
    const rejection = runtime.runOutcome(key, async (caps) => caps.lookupSnapshot());
    await expect(rejection).rejects.toBeInstanceOf(CalibrationFatalError);
    await expect(rejection).rejects.toThrow('calibration:runtime-callback-failed');
    await expect(rejection).rejects.not.toThrow('PRIVATE-SENTINEL-FOREIGN-SNAPSHOT');
    const caught = await rejection.catch((error: unknown) => error);
    expect(caught).not.toBe(witness.error);
    expect((caught as { cause?: unknown }).cause).toBeUndefined();
    expect(witness.getProbes()).toBe(0);
    // No live fallback ran and the next key is poisoned with no more ports.
    expect(h.calls).toHaveLength(0);
    const portsAfter = h.calls.length;
    const nextKey = findKey(h, (r) => r.scanMode === 'barcode' && r.key.caseId !== key.caseId);
    await expect(runtime.runOutcome(nextKey, async (caps) => caps.lookupSnapshot())).rejects.toThrow(
      'calibration:runtime-poisoned',
    );
    expect(h.calls.length).toBe(portsAfter);
  });

  it('freezes owned loader/reserve/version callback keys while caller records stay mutable', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    const callerKey = { ...findKey(h, (r) => r.key.stage === 'development' && r.scanMode !== 'barcode') };
    const keySnapshot = { ...callerKey };
    const outcome = runtime.runOutcome(callerKey, async (caps) => {
      await caps.loadImage();
      return caps.generateVision(VISION_REQUEST);
    });
    // Caller alias mutates mid-flight; owned dispatches must keep originals.
    callerKey.caseId = 'mutated-after-begin';
    await outcome;
    expect(h.capturedKeys.loadImageKeys).toHaveLength(1);
    expect(h.capturedKeys.reserveImageKeys).toHaveLength(1);
    expect(h.capturedKeys.modelVersionCalls).toHaveLength(1);
    for (const owned of [
      h.capturedKeys.loadImageKeys[0],
      h.capturedKeys.reserveImageKeys[0],
      h.capturedKeys.modelVersionCalls[0]!.key,
    ]) {
      expect(owned).toEqual(keySnapshot);
      expect(owned).not.toBe(callerKey);
      expect(Object.isFrozen(owned)).toBe(true);
    }
    expect(h.capturedKeys.modelVersionCalls[0]!.version).toBe('fixture-model-v1');
    // Caller-side records are never frozen or retained by reference.
    expect(Object.isFrozen(callerKey)).toBe(false);
    expect(Object.isFrozen(h.deps)).toBe(false);
    expect(Object.isFrozen(h.deps.files)).toBe(false);
  });

  it('returns deep fresh copies of plans and observations across reads', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    await runtime.runOutcome(h.plan[0]!.key, async (caps) => caps.generateVision(VISION_REQUEST));
    const planA = runtime.getPlannedOutcomes() as unknown[];
    const planB = runtime.getPlannedOutcomes() as unknown[];
    expect(planA).not.toBe(planB);
    expect(planA).toEqual(planB);
    expect((planA[0] as object)).not.toBe(planB[0] as object);
    const rowA = planA[0] as { key?: object };
    const rowB = planB[0] as { key?: object };
    if (rowA.key !== undefined && rowB.key !== undefined) {
      expect(rowA.key).not.toBe(rowB.key);
      expect(rowA.key).toEqual(rowB.key);
    }
    const obsA = runtime.getObservations();
    const obsB = runtime.getObservations();
    expect(obsA).not.toBe(obsB);
    expect(obsA).toEqual(obsB);
    expect(obsA[0]).not.toBe(obsB[0]);
    expect(obsA[0]!.key).not.toBe(obsB[0]!.key);
    expect(obsA[0]!.key).toEqual(obsB[0]!.key);
  });

  it('exposes no cache/reader/injected-plan fields on returned capabilities and returns opaque body results by identity', async () => {
    const h = await buildRuntimeHarness('LOW');
    const { factory } = await loadRuntimeModule();
    const runtime = factory(h.deps);
    const key = findKey(h, (r) => r.scanMode !== 'barcode');
    await runtime.runOutcome(key, async (caps) => {
      const record = caps as unknown as Record<string, unknown>;
      for (const absent of ['readCache', 'writeCache', 'fetchLiveOff', 'readSnapshot', 'plan', 'keyList']) {
        expect(absent in record).toBe(false);
        expect(record[absent]).toBeUndefined();
      }
      return 'checked';
    });
    const opaque = { parseFailed: true as const, reason: 'unparseable' };
    const runtime2 = factory(h.deps);
    const key2 = findKey(h, (r) => r.scanMode !== 'barcode' && r.key.caseId !== key.caseId);
    const returned = await runtime2.runOutcome(key2, async () => opaque);
    expect(returned).toBe(opaque);
  });
});
