/**
 * Calibration durable runtime evidence codec RED behavioral contract
 * (Task 1 Step 1, bounded corrections).
 *
 * The codec module does not exist yet. Every test fails at dynamic-import
 * time with a missing-module error until a worker authors that source file
 * in a later stage. Do NOT create a stub to turn any of this green; the host
 * authorizes the source worker separately after witnessing this RED and
 * freezing this file.
 *
 * Each test names the break it catches. Expectations are hand-derived
 * literals or independently sorted canonical bytes hashed with Node
 * createHash, never the codec under test. A literal pinned SHA accompanies
 * the literal bytes. Hostile proxies use owned primitive counters and raw
 * identity checks before instanceof, never passing foreign throwables into
 * matchers. Exact static message calibration:runtime-evidence-invalid, no
 * cause, fresh each call is required. The pure codec cannot prevent
 * arbitrary caller code, authenticate ports, or attest network isolation;
 * no such claim is made here.
 */
import { afterAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { makeRuntimeEvidenceData } from './calibration-runtime-evidence-fixtures';
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';

const sdkGuard = vi.hoisted(() => ({ constructCalls: 0 }));
const fetchGuard = vi.hoisted(() => {
  const state = { attemptCalls: 0 };
  const holder = globalThis as unknown as Record<string, unknown> & {
    __codecFetchGuard?: { original: unknown; hadOwn: boolean };
  };
  const original = (globalThis as unknown as Record<string, unknown>)['fetch'];
  const hadOwn = Object.prototype.hasOwnProperty.call(globalThis, 'fetch');
  holder.__codecFetchGuard = { original, hadOwn };
  (globalThis as unknown as Record<string, unknown>)['fetch'] = (..._args: unknown[]) => {
    state.attemptCalls += 1;
    throw new Error('codec-test-guard: fetch forbidden');
  };
  return state;
});

vi.mock('@google/genai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/genai')>();
  class GuardedGoogleGenAI {
    constructor() {
      sdkGuard.constructCalls += 1;
      throw new Error('codec-test-guard: GoogleGenAI construction forbidden');
    }
  }
  return { ...actual, GoogleGenAI: GuardedGoogleGenAI };
});

beforeEach(() => {
  expect(sdkGuard.constructCalls).toBe(0);
  expect(fetchGuard.attemptCalls).toBe(0);
  sdkGuard.constructCalls = 0;
  fetchGuard.attemptCalls = 0;
});

afterEach(() => {
  try {
    expect(sdkGuard.constructCalls).toBe(0);
    expect(fetchGuard.attemptCalls).toBe(0);
  } finally {
    sdkGuard.constructCalls = 0;
    fetchGuard.attemptCalls = 0;
  }
});

afterAll(() => {
  const holder = globalThis as unknown as Record<string, unknown> & {
    __codecFetchGuard?: { original: unknown; hadOwn: boolean };
  };
  const saved = holder.__codecFetchGuard;
  if (saved !== undefined) {
    if (saved.hadOwn) {
      (globalThis as unknown as Record<string, unknown>)['fetch'] = saved.original;
    } else {
      delete (globalThis as unknown as Record<string, unknown>)['fetch'];
    }
    delete holder.__codecFetchGuard;
  }
});

type CodecModule = {
  captureCalibrationRuntimeEvidenceHeader: (value: unknown) => unknown;
  captureCalibrationRuntimeEvidenceEvent: (value: unknown) => unknown;
  encodeCalibrationRuntimeEvidenceHeader: (value: unknown) => string;
  encodeCalibrationRuntimeEvidenceEvent: (value: unknown) => string;
  hashCalibrationRuntimeEvidenceBinding: (value: unknown) => string;
};

async function loadCodec(): Promise<CodecModule> {
  const mod = await import('../../src/nutrition-eval/calibration-runtime-evidence-codec');
  const record = mod as unknown as Record<string, unknown>;
  expect(typeof record['captureCalibrationRuntimeEvidenceHeader']).toBe('function');
  expect(typeof record['captureCalibrationRuntimeEvidenceEvent']).toBe('function');
  expect(typeof record['encodeCalibrationRuntimeEvidenceHeader']).toBe('function');
  expect(typeof record['encodeCalibrationRuntimeEvidenceEvent']).toBe('function');
  expect(typeof record['hashCalibrationRuntimeEvidenceBinding']).toBe('function');
  return record as unknown as CodecModule;
}

const EXPECTED_FATAL = 'calibration:runtime-evidence-invalid';

function sortedCanonical(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('nonfinite test value');
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) {
    return `[${value.map((entry) => sortedCanonical(entry)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const parts = keys.map((key) => `${JSON.stringify(key)}:${sortedCanonical((value as Record<string, unknown>)[key])}`);
    return `{${parts.join(',')}}`;
  }
  throw new Error('unsupported test value');
}

function isFreshFatal(error: unknown, foreign: unknown): boolean {
  if (error === foreign) return false;
  if (!(error instanceof CalibrationFatalError)) return false;
  const message: unknown = (error as Error).message;
  if (message !== EXPECTED_FATAL) return false;
  const cause: unknown = (error as unknown as Record<string, unknown>)['cause'];
  if (cause !== undefined) return false;
  return true;
}

function makeValidRunId(stage: string, profile: string, implementationCommit: string): string {
  const prefix = `calibration-${stage}-${profile.toLowerCase()}-${implementationCommit.slice(0, 12)}-`;
  return `${prefix}20261014T000000000Z`;
}

function validReceipt(stage: string, profile: string, implementationCommit: string) {
  return {
    stage,
    profile,
    runId: makeValidRunId(stage, profile, implementationCommit),
    jsonSha256: 'b'.repeat(64),
    markdownSha256: 'c'.repeat(64),
  };
}

function imageTerminal(eventIndex: number) {
  return { kind: 'image', eventIndex, journalHash: 'a'.repeat(64) };
}

function nonReservationTerminal(eventIndex: number) {
  return { kind: 'non_reservation', eventIndex, contentDigest: 'a'.repeat(64) };
}

function copyRecord(value: unknown): Record<string, unknown> {
  return { ...(value as Record<string, unknown>) };
}

describe('closed header capture', () => {
  it('encodes a closed start and preserves caller ownership', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const captured = m.captureCalibrationRuntimeEvidenceEvent(f.start) as Record<string, unknown>;
    expect(captured).toEqual(f.start);
    expect(captured === (f.start as unknown)).toBe(false);
    expect(Object.isFrozen(f.start)).toBe(false);
    expect(Object.isFrozen(captured)).toBe(true);
    const reordered = Object.fromEntries(Object.entries(f.start as unknown as Record<string, unknown>).reverse());
    expect(m.encodeCalibrationRuntimeEvidenceEvent(reordered)).toBe(m.encodeCalibrationRuntimeEvidenceEvent(f.start));
  });

  it('accepts plain and null-prototype headers as closed shapes', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const plain = m.captureCalibrationRuntimeEvidenceHeader({ ...(f.header as unknown as Record<string, unknown>) }) as Record<string, unknown>;
    expect((plain['reportAuthority'] as string)).toBe('verified_artifacts_v1');
    const nullProto: Record<string, unknown> = Object.assign(Object.create(null), f.header as unknown as Record<string, unknown>);
    const captured = m.captureCalibrationRuntimeEvidenceHeader(nullProto) as Record<string, unknown>;
    expect((captured['runtimeEvidenceVersion'] as number)).toBe(1);
  });

  it('requires authority and evidence markers together', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const header = copyRecord(f.header);
    delete header['reportAuthority'];
    let first: unknown;
    try {
      m.captureCalibrationRuntimeEvidenceHeader(header);
    } catch (error) {
      first = error;
    }
    expect(isFreshFatal(first, header)).toBe(true);
  });

  it('rejects a header missing the evidence version as legacy confusion', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const header = copyRecord(f.header);
    delete header['runtimeEvidenceVersion'];
    let first: unknown;
    try {
      m.captureCalibrationRuntimeEvidenceHeader(header);
    } catch (error) {
      first = error;
    }
    expect(isFreshFatal(first, header)).toBe(true);
  });

  it.each([
    ['null header', null],
    ['string header', 'x'],
    ['array header', []],
    ['missing identity', 'identity'],
    ['missing owner', 'owner'],
    ['missing at', 'at'],
    ['present undefined owner', 'owner-undefined'],
  ])('rejects malformed header shape %s without accepting it', async (_label, kind) => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    let value: unknown;
    if (kind === null || typeof kind === 'string' && (kind === 'x')) value = kind === 'x' ? 'x' : null;
    else if (Array.isArray(kind)) value = [];
    else {
      const base = copyRecord(f.header);
      if (kind === 'identity' || kind === 'owner' || kind === 'at') delete base[kind];
      if (kind === 'owner-undefined') base['owner'] = undefined;
      value = base;
    }
    if (kind === 'string header') value = 'x';
    let threw = false;
    try {
      m.captureCalibrationRuntimeEvidenceHeader(value);
    } catch (error) {
      threw = isFreshFatal(error, value);
    }
    expect(threw).toBe(true);
  });

  it.each([
    ['extra field', { extra: 'x' }],
    ['class instance', 'class'],
    ['inherited extra', 'inherited'],
    ['nonenumerable extra', 'hidden'],
    ['symbol extra', 'symbol'],
  ])('rejects open header %s instead of silently keeping it', async (_label, kind) => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const base = copyRecord(f.header);
    let value: unknown = base;
    if (kind !== null && typeof kind === 'object' && 'extra' in (kind as Record<string, unknown>)) {
      value = { ...base, extra: 'x' };
    } else if (kind === 'class') {
      class Fake { [key: string]: unknown }
      const inst = new Fake();
      Object.assign(inst, base);
      value = inst;
    } else if (kind === 'inherited') {
      const child = Object.create({ hidden: true });
      Object.assign(child, base);
      value = child;
    } else if (kind === 'hidden') {
      Object.defineProperty(base, 'secret', { value: 'private', enumerable: false });
      value = base;
    } else if (kind === 'symbol') {
      (base as Record<string | symbol, unknown>)[Symbol('extra')] = 'private';
      value = base;
    }
    let threw = false;
    try {
      m.captureCalibrationRuntimeEvidenceHeader(value);
    } catch (error) {
      threw = isFreshFatal(error, value);
    }
    expect(threw).toBe(true);
  });

  it('never invokes header accessors while rejecting them', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    let gets = 0;
    const bad = copyRecord(f.header);
    Object.defineProperty(bad, 'owner', { enumerable: true, get: () => { gets += 1; return f.header.owner; } });
    let threw = false;
    try {
      m.captureCalibrationRuntimeEvidenceHeader(bad);
    } catch (error) {
      threw = isFreshFatal(error, bad);
    }
    expect(threw).toBe(true);
    expect(gets).toBe(0);
  });

  it('keeps honest get-trap proxies at zero gets via descriptor capture', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    let gets = 0;
    const wrap = <T extends object>(value: T): T =>
      new Proxy(value, { get: (target, key, receiver) => { gets += 1; return Reflect.get(target, key, receiver); } });
    const proxied = wrap(copyRecord(f.header));
    const captured = m.captureCalibrationRuntimeEvidenceHeader(proxied) as Record<string, unknown>;
    expect((captured['reportAuthority'] as string)).toBe('verified_artifacts_v1');
    expect(gets).toBe(0);
    expect(Object.isFrozen(proxied)).toBe(false);
  });

  it('accepts successful nested traps without get or caller freeze', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const counters = { proto: 0, keys: 0, desc: 0, get: 0, frozen: 0 };
    const inner = copyRecord((f.header as unknown as Record<string, unknown>)['owner']);
    const proxiedInner = new Proxy(inner, {
      getPrototypeOf(t) { counters.proto += 1; return Reflect.getPrototypeOf(t); },
      ownKeys(t) { counters.keys += 1; return Reflect.ownKeys(t); },
      getOwnPropertyDescriptor(t, p) { counters.desc += 1; return Reflect.getOwnPropertyDescriptor(t, p); },
      get(t, p, r) { counters.get += 1; return Reflect.get(t, p, r); },
    });
    const outer = copyRecord(f.header);
    outer['owner'] = proxiedInner;
    const good = new Proxy(outer, {
      getPrototypeOf(t) { counters.proto += 1; return Reflect.getPrototypeOf(t); },
      ownKeys(t) { counters.keys += 1; return Reflect.ownKeys(t); },
      getOwnPropertyDescriptor(t, p) { counters.desc += 1; return Reflect.getOwnPropertyDescriptor(t, p); },
      get(t, p, r) { counters.get += 1; return Reflect.get(t, p, r); },
    });
    const captured = m.captureCalibrationRuntimeEvidenceHeader(good) as Record<string, unknown>;
    expect((captured['reportAuthority'] as string)).toBe('verified_artifacts_v1');
    expect(counters.get).toBe(0);
    expect(counters.proto > 0).toBe(true);
    expect(counters.keys > 0).toBe(true);
    expect(counters.desc > 0).toBe(true);
    expect(Object.isFrozen(good)).toBe(false);
    expect(Object.isFrozen(proxiedInner)).toBe(false);
    expect(Object.isFrozen(captured)).toBe(true);
    void counters.frozen;
  });

  it('turns throwing getPrototypeOf into an owned fresh fatal with no foreign inspection', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const counters = { trap: 0, thrownGets: 0 };
    const hostileThrown = new Proxy({}, { get(t, p, r) { counters.thrownGets += 1; return Reflect.get(t, p, r); } });
    const bad = new Proxy(copyRecord(f.header), {
      getPrototypeOf() { counters.trap += 1; throw hostileThrown; },
    });
    let first: unknown;
    try {
      m.captureCalibrationRuntimeEvidenceHeader(bad);
    } catch (error) {
      first = error;
    }
    expect(first === (hostileThrown as unknown)).toBe(false);
    expect(isFreshFatal(first, hostileThrown)).toBe(true);
    expect(counters.thrownGets).toBe(0);
    let second: unknown;
    try {
      m.captureCalibrationRuntimeEvidenceHeader(bad);
    } catch (error) {
      second = error;
    }
    expect(isFreshFatal(second, hostileThrown)).toBe(true);
    expect(first === second).toBe(false);
    expect(counters.thrownGets).toBe(0);
  });

  it('turns throwing ownKeys into an owned fresh fatal with no foreign inspection', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const counters = { trap: 0, thrownGets: 0 };
    const hostileThrown = new Proxy({}, { get(t, p, r) { counters.thrownGets += 1; return Reflect.get(t, p, r); } });
    const bad = new Proxy(copyRecord(f.header), {
      ownKeys() { counters.trap += 1; throw hostileThrown; },
    });
    let first: unknown;
    try {
      m.captureCalibrationRuntimeEvidenceHeader(bad);
    } catch (error) {
      first = error;
    }
    expect(first === (hostileThrown as unknown)).toBe(false);
    expect(isFreshFatal(first, hostileThrown)).toBe(true);
    expect(counters.thrownGets).toBe(0);
  });

  it('turns throwing getOwnPropertyDescriptor into an owned fresh fatal with no foreign inspection', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const counters = { trap: 0, thrownGets: 0 };
    const hostileThrown = new Proxy({}, { get(t, p, r) { counters.thrownGets += 1; return Reflect.get(t, p, r); } });
    const bad = new Proxy(copyRecord(f.header), {
      getOwnPropertyDescriptor() { counters.trap += 1; throw hostileThrown; },
    });
    let first: unknown;
    try {
      m.captureCalibrationRuntimeEvidenceHeader(bad);
    } catch (error) {
      first = error;
    }
    expect(first === (hostileThrown as unknown)).toBe(false);
    expect(isFreshFatal(first, hostileThrown)).toBe(true);
    expect(counters.thrownGets).toBe(0);
  });

  it('rejects non-plain header prototypes as prototype pollution', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const bad = copyRecord(f.header);
    Object.setPrototypeOf(bad, { hidden: true });
    let threw = false;
    try {
      m.captureCalibrationRuntimeEvidenceHeader(bad);
    } catch (error) {
      threw = isFreshFatal(error, bad);
    }
    expect(threw).toBe(true);
  });

  it('rejects malformed header timestamps instead of accepting drift', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const list = ['not-a-time', '2026-10-14T00:00:00Z', '2026-13-40T99:99:99.000Z', '2026-10-14T00:00:00.000+00:00', '2026-02-30T00:00:00.000Z'];
    for (const at of list) {
      const bad = copyRecord(f.header);
      bad['at'] = at;
      let threw = false;
      try {
        m.captureCalibrationRuntimeEvidenceHeader(bad);
      } catch (error) {
        threw = isFreshFatal(error, bad);
      }
      expect(threw).toBe(true);
    }
  });

  it('freezes owned header copies so caller mutation cannot rewrite history', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const captured = m.captureCalibrationRuntimeEvidenceHeader(f.header) as Record<string, unknown>;
    expect(Object.isFrozen(captured)).toBe(true);
    expect(Object.isFrozen((captured['owner'] as Record<string, unknown>))).toBe(true);
    (f.header as unknown as Record<string, unknown>)['at'] = '2026-10-15T00:00:00.000Z';
    expect((captured['at'] as string)).toBe('2026-10-14T00:00:00.000Z');
  });
});

describe('identity, owner, and key closed matrices', () => {
  it.each([
    ['wrong protocolVersion', 'protocolVersion', 'v2'],
    ['wrong provider', 'provider', 'other'],
    ['wrong model', 'model', 'gemini-2.5-flash'],
    ['wrong plannedImageCalls', 'plannedImageCalls', 0],
    ['wrong hardCeiling', 'hardCeiling', 0],
    ['uppercase commit', 'implementationCommit', 'B'.repeat(40)],
    ['short commit', 'implementationCommit', 'b'.repeat(39)],
    ['uppercase hash', 'datasetHash', 'A'.repeat(64)],
    ['short hash', 'promptHash', 'b'.repeat(63)],
  ])('rejects identity drift %s instead of accepting it', async (_l, field, value) => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const header = copyRecord(f.header);
    const identity = copyRecord(header['identity']);
    identity[field] = value;
    header['identity'] = identity;
    let threw = false;
    try {
      m.captureCalibrationRuntimeEvidenceHeader(header);
    } catch (error) {
      threw = isFreshFatal(error, header);
    }
    expect(threw).toBe(true);
  });

  it('accepts Unicode hostnames but rejects lone surrogates there', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const good = copyRecord(f.start);
    const goodOwner = copyRecord(good['owner']);
    goodOwner['hostname'] = 'caf\u00E9-\u{1F600}-\u4E2D-host';
    goodOwner['bootId'] = 'boot-\u00E9-\u{1F601}';
    good['owner'] = goodOwner;
    const captured = m.captureCalibrationRuntimeEvidenceEvent(good) as Record<string, unknown>;
    expect(((captured['owner'] as Record<string, unknown>)['hostname'] as string)).toBe('caf\u00E9-\u{1F600}-\u4E2D-host');
    const bad = copyRecord(f.start);
    const badOwner = copyRecord(bad['owner']);
    badOwner['hostname'] = '\uD800';
    bad['owner'] = badOwner;
    let threw = false;
    try {
      m.encodeCalibrationRuntimeEvidenceEvent(bad);
    } catch (error) {
      threw = isFreshFatal(error, bad);
    }
    expect(threw).toBe(true);
  });

  it.each([
    ['blank caseId', '   '],
    ['过长129', 'a'.repeat(129)],
    ['slash path', 'a/b'],
    ['dotdot', '../evil'],
    ['space', 'has space'],
    ['injection', 'x|y;rm'],
  ])('rejects malformed caseId %s instead of persisting it', async (_l, caseId) => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const bad = copyRecord(f.start);
    const key = copyRecord(bad['key']);
    if (caseId === '过长129') key['caseId'] = 'a'.repeat(129);
    else key['caseId'] = caseId;
    bad['key'] = key;
    let threw = false;
    try {
      m.captureCalibrationRuntimeEvidenceEvent(bad);
    } catch (error) {
      threw = isFreshFatal(error, bad);
    }
    expect(threw).toBe(true);
  });

  it.each([
    ['preflight sample 2', 'preflight', 'LOW', 2],
    ['development sample 2', 'development', 'LOW', 2],
    ['validation sample 0', 'validation', 'LOW', 0],
    ['validation sample 4', 'validation', 'LOW', 4],
    ['benchmark sample 0', 'benchmark', 'MEDIUM', 0],
    ['wrong stage', 'prod', 'LOW', 1],
    ['wrong profile', 'preflight', 'HIGH', 1],
    ['noninteger sample', 'preflight', 'LOW', 1.5],
  ])('rejects illegal key %s instead of routing it', async (_l, stage, profile, sampleIndex) => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const bad = copyRecord(f.start);
    bad['key'] = { stage, profile, caseId: 'valid-case_1', sampleIndex };
    let threw = false;
    try {
      m.captureCalibrationRuntimeEvidenceEvent(bad);
    } catch (error) {
      threw = isFreshFatal(error, bad);
    }
    expect(threw).toBe(true);
  });

  it.each([
    ['zero sequence', 'sequence', 0],
    ['negative sequence', 'sequence', -2],
    ['fractional sequence', 'sequence', 1.5],
    ['nan sequence', 'sequence', Number.NaN],
    ['infinite sequence', 'sequence', Number.POSITIVE_INFINITY],
    ['unsafe sequence', 'sequence', Number.MAX_SAFE_INTEGER + 1],
    ['zero attempt', 'attempt', 0],
    ['negative attempt', 'attempt', -1],
    ['fractional attempt', 'attempt', 1.5],
    ['zero pid', 'owner.pid', 0],
    ['negative ticks', 'owner.startTicks', -5],
  ])('rejects numeric anomaly %s instead of truncating it', async (_l, field, value) => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const bad = copyRecord(f.start);
    if (field.startsWith('owner.')) {
      const owner = copyRecord(bad['owner']);
      owner[field.slice(6)] = value;
      bad['owner'] = owner;
    } else {
      bad[field] = value;
    }
    let threw = false;
    try {
      m.captureCalibrationRuntimeEvidenceEvent(bad);
    } catch (error) {
      threw = isFreshFatal(error, bad);
    }
    expect(threw).toBe(true);
  });

  it('rejects negative-zero sequence and attempt as index aliasing', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    for (const field of ['sequence', 'attempt']) {
      const bad = copyRecord(f.start);
      bad[field] = -0;
      let threw = false;
      try {
        m.captureCalibrationRuntimeEvidenceEvent(bad);
      } catch (error) {
        threw = isFreshFatal(error, bad);
      }
      expect(threw).toBe(true);
    }
  });
});

describe('all seven runtime variants', () => {
  it('captures operation-started with the exact operation instead of swapping image and vision', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const event = {
      type: 'runtime_operation_started', version: 1, sequence: 2,
      owner: copyRecord((f.start as unknown as Record<string, unknown>)['owner']),
      at: '2026-10-14T00:00:01.000Z',
      key: copyRecord((f.start as unknown as Record<string, unknown>)['key']), attempt: 1, operation: 'image',
    };
    const captured = m.captureCalibrationRuntimeEvidenceEvent(event) as Record<string, unknown>;
    expect((captured['operation'] as string)).toBe('image');
  });

  it('captures operation-settled failed distinctly from returned', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const base = {
      type: 'runtime_operation_settled', version: 1, sequence: 3,
      owner: copyRecord((f.start as unknown as Record<string, unknown>)['owner']),
      at: '2026-10-14T00:00:02.000Z',
      key: copyRecord((f.start as unknown as Record<string, unknown>)['key']), attempt: 1, operation: 'vision',
    };
    const failed = m.captureCalibrationRuntimeEvidenceEvent({ ...base, result: 'failed' }) as Record<string, unknown>;
    expect((failed['result'] as string)).toBe('failed');
    const returned = m.captureCalibrationRuntimeEvidenceEvent({ ...base, result: 'returned' }) as Record<string, unknown>;
    expect((returned['result'] as string)).toBe('returned');
  });

  it('captures request authorization only with a backward reservation index', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const event = {
      type: 'runtime_request_authorized', version: 1, sequence: 4,
      owner: copyRecord((f.start as unknown as Record<string, unknown>)['owner']),
      at: '2026-10-14T00:00:03.000Z',
      key: copyRecord((f.start as unknown as Record<string, unknown>)['key']), attempt: 1, reservationEventIndex: 2,
    };
    const captured = m.captureCalibrationRuntimeEvidenceEvent(event) as Record<string, unknown>;
    expect((captured['reservationEventIndex'] as number)).toBe(2);
  });

  it('captures image-terminal finish without inventing a second journal hash', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const event = {
      type: 'runtime_attempt_finished', version: 1, sequence: 5,
      owner: copyRecord((f.start as unknown as Record<string, unknown>)['owner']),
      at: '2026-10-14T00:00:04.000Z',
      key: copyRecord((f.start as unknown as Record<string, unknown>)['key']), attempt: 1, terminal: imageTerminal(2),
    };
    const captured = m.captureCalibrationRuntimeEvidenceEvent(event) as Record<string, unknown>;
    expect(((captured['terminal'] as Record<string, unknown>)['kind'] as string)).toBe('image');
  });

  it('captures non-reservation finish with a content digest rather than a journal hash', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const event = {
      type: 'runtime_attempt_finished', version: 1, sequence: 5,
      owner: copyRecord((f.start as unknown as Record<string, unknown>)['owner']),
      at: '2026-10-14T00:00:04.000Z',
      key: copyRecord((f.start as unknown as Record<string, unknown>)['key']), attempt: 1, terminal: nonReservationTerminal(2),
    };
    const captured = m.captureCalibrationRuntimeEvidenceEvent(event) as Record<string, unknown>;
    expect(((captured['terminal'] as Record<string, unknown>)['kind'] as string)).toBe('non_reservation');
  });

  it('captures all three dispositions including incomplete image and non-reservation terminals', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const impl = ((f.header as unknown as Record<string, unknown>)['identity'] as Record<string, unknown>)['implementationCommit'] as string;
    void impl;
    const base = {
      type: 'runtime_attempt_abandoned', version: 1, sequence: 6,
      owner: copyRecord((f.start as unknown as Record<string, unknown>)['owner']),
      at: '2026-10-14T00:00:05.000Z',
      key: copyRecord((f.start as unknown as Record<string, unknown>)['key']), attempt: 1,
    };
    const unreserved = m.captureCalibrationRuntimeEvidenceEvent({ ...base, disposition: { kind: 'unreserved_interruption' } }) as Record<string, unknown>;
    expect(((unreserved['disposition'] as Record<string, unknown>)['kind'] as string)).toBe('unreserved_interruption');
    const reserved = m.captureCalibrationRuntimeEvidenceEvent({ ...base, disposition: { kind: 'reserved_interruption', terminal: imageTerminal(2) } }) as Record<string, unknown>;
    expect(((reserved['disposition'] as Record<string, unknown>)['kind'] as string)).toBe('reserved_interruption');
    const incompleteImage = m.captureCalibrationRuntimeEvidenceEvent({ ...base, disposition: { kind: 'terminal_evidence_incomplete', terminal: imageTerminal(2) } }) as Record<string, unknown>;
    expect(((incompleteImage['disposition'] as Record<string, unknown>)['kind'] as string)).toBe('terminal_evidence_incomplete');
    const incompleteNon = m.captureCalibrationRuntimeEvidenceEvent({ ...base, disposition: { kind: 'terminal_evidence_incomplete', terminal: nonReservationTerminal(2) } }) as Record<string, unknown>;
    expect(((incompleteNon['disposition'] as Record<string, unknown>)['kind'] as string)).toBe('terminal_evidence_incomplete');
  });

  it('rejects reserved interruption with a non-reservation terminal as wrong-kind binding', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const bad = {
      type: 'runtime_attempt_abandoned', version: 1, sequence: 6,
      owner: copyRecord((f.start as unknown as Record<string, unknown>)['owner']),
      at: '2026-10-14T00:00:05.000Z',
      key: copyRecord((f.start as unknown as Record<string, unknown>)['key']), attempt: 1,
      disposition: { kind: 'reserved_interruption', terminal: nonReservationTerminal(2) },
    };
    let threw = false;
    try {
      m.captureCalibrationRuntimeEvidenceEvent(bad);
    } catch (error) {
      threw = isFreshFatal(error, bad);
    }
    expect(threw).toBe(true);
  });

  it('rejects extra union branch fields instead of keeping them', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const bad = {
      type: 'runtime_attempt_started', version: 1, sequence: 1,
      owner: copyRecord((f.start as unknown as Record<string, unknown>)['owner']),
      at: '2026-10-14T00:00:00.000Z',
      key: copyRecord((f.start as unknown as Record<string, unknown>)['key']), attempt: 1, operation: 'image',
    };
    let threw = false;
    try {
      m.captureCalibrationRuntimeEvidenceEvent(bad);
    } catch (error) {
      threw = isFreshFatal(error, bad);
    }
    expect(threw).toBe(true);
  });

  it.each([
    ['bad operation', { operation: 'compute' }],
    ['bad result', { result: 'maybe' }],
    ['bad version', { version: 2 }],
    ['bad type', { type: 'runtime_unknown' }],
  ])('rejects enum confusion %s instead of accepting it', async (_l, patch) => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const base = {
      type: 'runtime_operation_started', version: 1, sequence: 2,
      owner: copyRecord((f.start as unknown as Record<string, unknown>)['owner']),
      at: '2026-10-14T00:00:01.000Z',
      key: copyRecord((f.start as unknown as Record<string, unknown>)['key']), attempt: 1, operation: 'image',
    };
    const bad = { ...base, ...(patch as Record<string, unknown>) };
    if ((patch as Record<string, unknown>)['result'] !== undefined) {
      (bad as Record<string, unknown>)['type'] = 'runtime_operation_settled';
    }
    if ((patch as Record<string, unknown>)['type'] !== undefined) {
      (bad as Record<string, unknown>)['type'] = (patch as Record<string, unknown>)['type'];
    }
    let threw = false;
    try {
      m.captureCalibrationRuntimeEvidenceEvent(bad);
    } catch (error) {
      threw = isFreshFatal(error, bad);
    }
    expect(threw).toBe(true);
  });

  it('captures report binding event with valid runId grammar as baseline', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const identity = (f.header as unknown as Record<string, unknown>)['identity'] as Record<string, unknown>;
    const impl = identity['implementationCommit'] as string;
    const receipt = validReceipt('preflight', 'LOW', impl);
    const event = {
      type: 'runtime_report_bound', version: 1, sequence: 7,
      owner: copyRecord((f.start as unknown as Record<string, unknown>)['owner']),
      at: '2026-10-14T00:00:06.000Z',
      stage: 'preflight', profile: 'LOW', receipt,
      throughSequence: 6, bindingSha256: 'a'.repeat(64),
    };
    const captured = m.captureCalibrationRuntimeEvidenceEvent(event) as Record<string, unknown>;
    expect((captured['throughSequence'] as number)).toBe(6);
    expect(((captured['receipt'] as Record<string, unknown>)['runId'] as string)).toBe(receipt.runId);
  });

  it('rejects malformed runId shapes with a valid baseline for comparison', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const identity = (f.header as unknown as Record<string, unknown>)['identity'] as Record<string, unknown>;
    const impl = identity['implementationCommit'] as string;
    const valid = {
      type: 'runtime_report_bound', version: 1, sequence: 7,
      owner: copyRecord((f.start as unknown as Record<string, unknown>)['owner']),
      at: '2026-10-14T00:00:06.000Z',
      stage: 'preflight', profile: 'LOW', receipt: validReceipt('preflight', 'LOW', impl),
      throughSequence: 6, bindingSha256: 'a'.repeat(64),
    };
    const baseline = m.captureCalibrationRuntimeEvidenceEvent(valid) as Record<string, unknown>;
    expect(((baseline['receipt'] as Record<string, unknown>)['runId'] as string)).toContain('calibration-preflight-low-');
    for (const runId of ['run-1', '', 'calibration-preflight-low-bbbbbbbbbbbb-2026101T000000000Z', 'calibration-preflight-low-bbbbbbbbbbbb-20261014T00000000Z']) {
      const badReceipt = { ...validReceipt('preflight', 'LOW', impl), runId };
      const bad = { ...valid, receipt: badReceipt };
      let threw = false;
      try {
        m.captureCalibrationRuntimeEvidenceEvent(bad);
      } catch (error) {
        threw = isFreshFatal(error, bad);
      }
      expect(threw).toBe(true);
    }
  });

  it('rejects receipt pair mismatch in the event as cross-report confusion', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const identity = (f.header as unknown as Record<string, unknown>)['identity'] as Record<string, unknown>;
    const impl = identity['implementationCommit'] as string;
    const bad = {
      type: 'runtime_report_bound', version: 1, sequence: 7,
      owner: copyRecord((f.start as unknown as Record<string, unknown>)['owner']),
      at: '2026-10-14T00:00:06.000Z',
      stage: 'preflight', profile: 'LOW', receipt: validReceipt('development', 'LOW', impl),
      throughSequence: 6, bindingSha256: 'a'.repeat(64),
    };
    let threw = false;
    try {
      m.captureCalibrationRuntimeEvidenceEvent(bad);
    } catch (error) {
      threw = isFreshFatal(error, bad);
    }
    expect(threw).toBe(true);
  });
});

describe('shape, ownership, privacy, and numeric guards', () => {
  it('rejects unknown event fields rather than persisting attacker extras', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const bad = copyRecord(f.start);
    bad['extra'] = 1;
    let threw = false;
    try {
      m.captureCalibrationRuntimeEvidenceEvent(bad);
    } catch (error) {
      threw = isFreshFatal(error, bad);
    }
    expect(threw).toBe(true);
  });

  it('rejects prompt and image bytes smuggled into runtime records', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    for (const field of ['prompt', 'imageBytes', 'rawResponse', 'prediction', 'stack', 'credentials', 'reportPrediction']) {
      const bad = copyRecord(f.start);
      bad[field] = 'leak';
      let threw = false;
      try {
        m.captureCalibrationRuntimeEvidenceEvent(bad);
      } catch (error) {
        threw = isFreshFatal(error, bad);
      }
      expect(threw).toBe(true);
    }
  });

  it('rejects malformed digests instead of accepting truncated hashes', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const base = {
      type: 'runtime_attempt_finished', version: 1, sequence: 5,
      owner: copyRecord((f.start as unknown as Record<string, unknown>)['owner']),
      at: '2026-10-14T00:00:04.000Z',
      key: copyRecord((f.start as unknown as Record<string, unknown>)['key']), attempt: 1,
    };
    for (const journalHash of ['xyz', 'A'.repeat(64), 'a'.repeat(63), 'a'.repeat(65), '']) {
      const bad = { ...base, terminal: { kind: 'image', eventIndex: 2, journalHash } };
      let threw = false;
      try {
        m.captureCalibrationRuntimeEvidenceEvent(bad);
      } catch (error) {
        threw = isFreshFatal(error, bad);
      }
      expect(threw).toBe(true);
    }
  });

  it('keeps mutable aliases from aliasing captured state and deep-freezes owned output', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const shared = copyRecord((f.start as unknown as Record<string, unknown>)['owner']);
    const input = copyRecord(f.start);
    input['owner'] = shared;
    const captured = m.captureCalibrationRuntimeEvidenceEvent(input) as Record<string, unknown>;
    expect(Object.isFrozen(captured)).toBe(true);
    expect(Object.isFrozen(captured['owner'])).toBe(true);
    expect(Object.isFrozen(captured['key'])).toBe(true);
    shared['hostname'] = 'mutated';
    expect(((captured['owner'] as Record<string, unknown>)['hostname'] as string)).not.toBe('mutated');
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(shared)).toBe(false);
  });

  it('turns foreign event owner into a fresh fatal without reflecting on the foreign value', async () => {
    const _f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const counters = { gets: 0 };
    const target = new Error('foreign');
    const proxy = new Proxy(target, {
      get(obj, prop, receiver) {
        if (prop === 'message' || prop === 'stack' || prop === 'cause' || prop === 'name') {
          counters.gets += 1;
          throw new Error('HOSTILE-PROBE');
        }
        return Reflect.get(obj, prop, receiver);
      },
    });
    const bad = { type: 'runtime_attempt_started', version: 1, sequence: 1, owner: proxy, at: '2026-10-14T00:00:00.000Z', key: { stage: 'preflight', profile: 'LOW', caseId: 'valid1', sampleIndex: 1 }, attempt: 1 };
    let threwFresh = false;
    try {
      m.captureCalibrationRuntimeEvidenceEvent(bad);
    } catch (error) {
      threwFresh = error === (proxy as unknown) ? false : isFreshFatal(error, bad);
    }
    expect(threwFresh).toBe(true);
    expect(counters.gets).toBe(0);
  });
});

describe('canonical bytes and exact size bounds', () => {
  it('emits sorted-key canonical JSON with no whitespace or trailing newline', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const reordered = Object.fromEntries(Object.entries(f.start as unknown as Record<string, unknown>).reverse());
    const encoded = m.encodeCalibrationRuntimeEvidenceEvent(reordered);
    const expected = sortedCanonical(f.start);
    expect(encoded).toBe(expected);
    expect(encoded.includes('\n')).toBe(false);
    expect(encoded.includes(' ')).toBe(false);
  });

  it('holds exactly 16384 event bytes valid and 16385 invalid in both capture and encode', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const base = copyRecord(f.start);
    const baseOwner = copyRecord(base['owner']);
    const origHostname = baseOwner['hostname'] as string;
    const baseBytes = Buffer.byteLength(sortedCanonical(base), 'utf8');
    const origBytes = Buffer.byteLength(JSON.stringify(origHostname), 'utf8') - 2;
    const needValid = 16384 - baseBytes;
    const validLen = origHostname.length + needValid;
    const validOwner = { ...baseOwner, hostname: 'h'.repeat(validLen) };
    const valid = { ...base, owner: validOwner };
    expect(Buffer.byteLength(sortedCanonical(valid), 'utf8')).toBe(16384);
    const capturedValid = m.captureCalibrationRuntimeEvidenceEvent(valid) as Record<string, unknown>;
    expect(((capturedValid['owner'] as Record<string, unknown>)['hostname'] as string).length).toBe(validLen);
    expect(m.encodeCalibrationRuntimeEvidenceEvent(valid).length > 0).toBe(true);
    expect(Buffer.byteLength(m.encodeCalibrationRuntimeEvidenceEvent(valid), 'utf8')).toBe(16384);
    const over = { ...base, owner: { ...baseOwner, hostname: `h`.repeat(validLen + 1) } };
    expect(Buffer.byteLength(sortedCanonical(over), 'utf8')).toBe(16385);
    let threwCapture = false;
    try {
      m.captureCalibrationRuntimeEvidenceEvent(over);
    } catch (error) {
      threwCapture = isFreshFatal(error, over);
    }
    expect(threwCapture).toBe(true);
    let threwEncode = false;
    try {
      m.encodeCalibrationRuntimeEvidenceEvent(over);
    } catch (error) {
      threwEncode = isFreshFatal(error, over);
    }
    expect(threwEncode).toBe(true);
    void origBytes;
  });

  it('holds exactly 16384 header bytes valid and 16385 invalid in both capture and encode', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const base = copyRecord(f.header);
    const baseOwner = copyRecord(base['owner']);
    const origHostname = baseOwner['hostname'] as string;
    const baseBytes = Buffer.byteLength(sortedCanonical(base), 'utf8');
    const needValid = 16384 - baseBytes;
    const validLen = origHostname.length + needValid;
    const valid = { ...base, owner: { ...baseOwner, hostname: 'h'.repeat(validLen) } };
    expect(Buffer.byteLength(sortedCanonical(valid), 'utf8')).toBe(16384);
    const capturedValid = m.captureCalibrationRuntimeEvidenceHeader(valid) as Record<string, unknown>;
    expect(((capturedValid['owner'] as Record<string, unknown>)['hostname'] as string).length).toBe(validLen);
    expect(Buffer.byteLength(m.encodeCalibrationRuntimeEvidenceHeader(valid), 'utf8')).toBe(16384);
    const over = { ...base, owner: { ...baseOwner, hostname: 'h'.repeat(validLen + 1) } };
    expect(Buffer.byteLength(sortedCanonical(over), 'utf8')).toBe(16385);
    let threwCapture = false;
    try {
      m.captureCalibrationRuntimeEvidenceHeader(over);
    } catch (error) {
      threwCapture = isFreshFatal(error, over);
    }
    expect(threwCapture).toBe(true);
    let threwEncode = false;
    try {
      m.encodeCalibrationRuntimeEvidenceHeader(over);
    } catch (error) {
      threwEncode = isFreshFatal(error, over);
    }
    expect(threwEncode).toBe(true);
  });

  it('counts UTF-8 multibyte hostname bytes against the bound with valid and over cases', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const base = copyRecord(f.start);
    const baseOwner = copyRecord(base['owner']);
    const origHostname = baseOwner['hostname'] as string;
    const baseBytes = Buffer.byteLength(sortedCanonical(base), 'utf8');
    const origJsonLen = Buffer.byteLength(JSON.stringify(origHostname), 'utf8');
    const unitJsonLen = Buffer.byteLength(JSON.stringify('\u00E9'), 'utf8') - 2;
    expect('\u00E9'.length).toBe(1);
    expect(unitJsonLen).toBe(2);
    const needOver = 16384 - baseBytes + origJsonLen - 2;
    const nOver = Math.floor(needOver / unitJsonLen) + 1;
    const nValid = nOver - 1;
    const valid = { ...base, owner: { ...baseOwner, hostname: '\u00E9'.repeat(nValid) } };
    const validBytes = Buffer.byteLength(sortedCanonical(valid), 'utf8');
    expect(validBytes <= 16384).toBe(true);
    const capturedValid = m.captureCalibrationRuntimeEvidenceEvent(valid) as Record<string, unknown>;
    expect(((capturedValid['owner'] as Record<string, unknown>)['hostname'] as string).length).toBe(nValid);
    expect(Buffer.byteLength(m.encodeCalibrationRuntimeEvidenceEvent(valid), 'utf8') <= 16384).toBe(true);
    const over = { ...base, owner: { ...baseOwner, hostname: '\u00E9'.repeat(nOver) } };
    const overBytes = Buffer.byteLength(sortedCanonical(over), 'utf8');
    expect(overBytes > 16384).toBe(true);
    let threw = false;
    try {
      m.encodeCalibrationRuntimeEvidenceEvent(over);
    } catch (error) {
      threw = isFreshFatal(error, over);
    }
    expect(threw).toBe(true);
  });

  it('counts JSON-escape expansion hostname bytes against the bound with valid and over cases', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const base = copyRecord(f.start);
    const baseOwner = copyRecord(base['owner']);
    const origHostname = baseOwner['hostname'] as string;
    const baseBytes = Buffer.byteLength(sortedCanonical(base), 'utf8');
    const origJsonLen = Buffer.byteLength(JSON.stringify(origHostname), 'utf8');
    const unitJsonLen = Buffer.byteLength(JSON.stringify('"'), 'utf8') - 2;
    expect(unitJsonLen).toBe(2);
    const needOver = 16384 - baseBytes + origJsonLen - 2;
    const nOver = Math.floor(needOver / unitJsonLen) + 1;
    const nValid = nOver - 1;
    const valid = { ...base, owner: { ...baseOwner, hostname: '"'.repeat(nValid) } };
    const validBytes = Buffer.byteLength(sortedCanonical(valid), 'utf8');
    expect(validBytes <= 16384).toBe(true);
    expect(Buffer.byteLength(m.encodeCalibrationRuntimeEvidenceEvent(valid), 'utf8') <= 16384).toBe(true);
    const over = { ...base, owner: { ...baseOwner, hostname: '"'.repeat(nOver) } };
    expect(Buffer.byteLength(sortedCanonical(over), 'utf8') > 16384).toBe(true);
    let threw = false;
    try {
      m.encodeCalibrationRuntimeEvidenceEvent(over);
    } catch (error) {
      threw = isFreshFatal(error, over);
    }
    expect(threw).toBe(true);
  });

  it('rejects a raw overlong hostname before encoding allocation', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const base = copyRecord(f.start);
    const baseOwner = copyRecord(base['owner']);
    const rawLong = { ...base, owner: { ...baseOwner, hostname: 'h'.repeat(20000) } };
    let threw = false;
    try {
      m.captureCalibrationRuntimeEvidenceEvent(rawLong);
    } catch (error) {
      threw = isFreshFatal(error, rawLong);
    }
    expect(threw).toBe(true);
  });
});

describe('deterministic binding digest', () => {
  it('hashes hand-pinned canonical binding bytes matching the pinned SHA', async () => {
    const m = await loadCodec();
    const expectedBytes =
      '{"events":[{"at":"2026-10-14T00:00:00.000Z","attempt":1,"key":{"caseId":"case-a","profile":"LOW","sampleIndex":1,"stage":"preflight"},"owner":{"acquiredAt":"2026-10-14T00:00:00.000Z","bootId":"b","hostname":"h","pid":1,"startTicks":1},"sequence":1,"type":"runtime_attempt_started","version":1}],"identity":{"datasetHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","functionsTreeId":"cccccccccccccccccccccccccccccccccccccccc","hardCeiling":300,"historicalReferenceHash":"0000000000000000000000000000000000000000000000000000000000000000","implementationCommit":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","manifestHash":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","model":"gemini-3.8-flash","plannedImageCalls":146,"promptHash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","protocolVersion":"v1","provider":"vertex-ai","publicManifestHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","responseSchemaHash":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","snapshotLockHash":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff","sourceLockHash":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"},"profile":"LOW","receipt":{"jsonSha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","markdownSha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","profile":"LOW","runId":"calibration-preflight-low-bbbbbbbbbbbb-20261014T000000000Z","stage":"preflight"},"stage":"preflight","terminals":[{"key":{"caseId":"case-a","profile":"LOW","sampleIndex":1,"stage":"preflight"},"terminal":{"eventIndex":2,"journalHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","kind":"image"}}],"throughSequence":1,"version":1}';
    const pinnedSha = '190922da41dc936d0d73ad99f23b1e940a375a68a4c043af1354fb415acccd98';
    const nodeHash = createHash('sha256').update(expectedBytes, 'utf8').digest('hex');
    expect(nodeHash).toBe(pinnedSha);
    const identity = {
      historicalReferenceHash: '0'.repeat(64),
      manifestHash: 'e'.repeat(64),
      implementationCommit: 'b'.repeat(40),
      functionsTreeId: 'c'.repeat(40),
      datasetHash: 'a'.repeat(64),
      promptHash: 'b'.repeat(64),
      responseSchemaHash: 'c'.repeat(64),
      sourceLockHash: 'd'.repeat(64),
      publicManifestHash: 'a'.repeat(64),
      snapshotLockHash: 'f'.repeat(64),
      protocolVersion: 'v1',
      provider: 'vertex-ai',
      model: 'gemini-3.8-flash',
      plannedImageCalls: 146,
      hardCeiling: 300,
    };
    const owner = { hostname: 'h', bootId: 'b', pid: 1, startTicks: 1, acquiredAt: '2026-10-14T00:00:00.000Z' };
    const key = { stage: 'preflight', profile: 'LOW', caseId: 'case-a', sampleIndex: 1 };
    const runId = 'calibration-preflight-low-bbbbbbbbbbbb-20261014T000000000Z';
    const events = [{ version: 1, type: 'runtime_attempt_started', sequence: 1, owner, at: '2026-10-14T00:00:00.000Z', key, attempt: 1 }];
    const terminals = [{ key, terminal: { kind: 'image', eventIndex: 2, journalHash: 'a'.repeat(64) } }];
    const receipt = { stage: 'preflight', profile: 'LOW', runId, jsonSha256: 'b'.repeat(64), markdownSha256: 'c'.repeat(64) };
    const input = { receipt, version: 1, throughSequence: 1, events, terminals, stage: 'preflight', profile: 'LOW', identity };
    expect(sortedCanonical(input)).toBe(expectedBytes);
    expect(m.hashCalibrationRuntimeEvidenceBinding(input)).toBe(pinnedSha);
  });

  it('allows an aggregate binding over 16 KiB when each event stays bounded with matching digest', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const identity = copyRecord((f.header as unknown as Record<string, unknown>)['identity']) as Record<string, unknown>;
    const impl = identity['implementationCommit'] as string;
    const events: unknown[] = [];
    for (let index = 1; index <= 80; index += 1) {
      events.push({
        type: 'runtime_operation_started', version: 1, sequence: index,
        owner: copyRecord((f.start as unknown as Record<string, unknown>)['owner']),
        at: '2026-10-14T00:00:00.000Z',
        key: copyRecord((f.start as unknown as Record<string, unknown>)['key']), attempt: 1, operation: 'image',
      });
    }
    for (const event of events) {
      const bytes = Buffer.byteLength(m.encodeCalibrationRuntimeEvidenceEvent(event), 'utf8');
      expect(bytes <= 16384).toBe(true);
    }
    const terminals = [{ key: copyRecord((f.start as unknown as Record<string, unknown>)['key']), terminal: imageTerminal(500) }];
    const receipt = validReceipt('preflight', 'LOW', impl);
    const input = {
      version: 1, identity, stage: 'preflight', profile: 'LOW', throughSequence: 80, events, terminals, receipt,
    };
    const aggregateBytes = Buffer.byteLength(sortedCanonical(input), 'utf8');
    expect(aggregateBytes > 16 * 1024).toBe(true);
    const expectedDigest = createHash('sha256').update(sortedCanonical(input), 'utf8').digest('hex');
    expect(m.hashCalibrationRuntimeEvidenceBinding(input)).toBe(expectedDigest);
  });

  it('rejects binding events smuggled into the pair array as cross-stage confusion', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const identity = copyRecord((f.header as unknown as Record<string, unknown>)['identity']) as Record<string, unknown>;
    const impl = identity['implementationCommit'] as string;
    const pair = copyRecord(f.start);
    const bindingEvent = {
      type: 'runtime_report_bound', version: 1, sequence: 2,
      owner: copyRecord((f.start as unknown as Record<string, unknown>)['owner']),
      at: '2026-10-14T00:00:01.000Z',
      stage: 'preflight', profile: 'LOW', receipt: validReceipt('preflight', 'LOW', impl),
      throughSequence: 1, bindingSha256: 'a'.repeat(64),
    };
    const input = {
      version: 1, identity, stage: 'preflight', profile: 'LOW', throughSequence: 2, events: [pair, bindingEvent],
      terminals: [{ key: copyRecord((f.start as unknown as Record<string, unknown>)['key']), terminal: imageTerminal(9) }],
      receipt: validReceipt('preflight', 'LOW', impl),
    };
    let threw = false;
    try {
      m.hashCalibrationRuntimeEvidenceBinding(input);
    } catch (error) {
      threw = isFreshFatal(error, input);
    }
    expect(threw).toBe(true);
  });

  it('rejects wrong-pair terminal rows and future event sequences', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const identity = copyRecord((f.header as unknown as Record<string, unknown>)['identity']) as Record<string, unknown>;
    const impl = identity['implementationCommit'] as string;
    const baseEvents = [copyRecord(f.start)];
    const wrongPairInput = {
      version: 1, identity, stage: 'preflight', profile: 'LOW', throughSequence: 1, events: baseEvents,
      terminals: [{ key: { stage: 'development', profile: 'LOW', caseId: 'valid-case_1', sampleIndex: 1 }, terminal: imageTerminal(2) }],
      receipt: validReceipt('preflight', 'LOW', impl),
    };
    let threwPair = false;
    try {
      m.hashCalibrationRuntimeEvidenceBinding(wrongPairInput);
    } catch (error) {
      threwPair = isFreshFatal(error, wrongPairInput);
    }
    expect(threwPair).toBe(true);
    const futureInput = {
      version: 1, identity, stage: 'preflight', profile: 'LOW', throughSequence: 1,
      events: [{ ...copyRecord(f.start), sequence: 5 }],
      terminals: [{ key: copyRecord((f.start as unknown as Record<string, unknown>)['key']), terminal: imageTerminal(9) }],
      receipt: validReceipt('preflight', 'LOW', impl),
    };
    let threwFuture = false;
    try {
      m.hashCalibrationRuntimeEvidenceBinding(futureInput);
    } catch (error) {
      threwFuture = isFreshFatal(error, futureInput);
    }
    expect(threwFuture).toBe(true);
  });

  it('allows gapped pair sequences but rejects duplicate and reversed order', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const identity = copyRecord((f.header as unknown as Record<string, unknown>)['identity']) as Record<string, unknown>;
    const impl = identity['implementationCommit'] as string;
    const key = copyRecord((f.start as unknown as Record<string, unknown>)['key']);
    const owner = copyRecord((f.start as unknown as Record<string, unknown>)['owner']);
    const at = '2026-10-14T00:00:00.000Z';
    const gapped = [1, 3, 5].map((sequence) => ({ type: 'runtime_operation_started', version: 1, sequence, owner: copyRecord(owner), at, key: copyRecord(key), attempt: 1, operation: 'image' }));
    const gappedInput = {
      version: 1, identity, stage: 'preflight', profile: 'LOW', throughSequence: 5, events: gapped,
      terminals: [{ key: copyRecord(key), terminal: imageTerminal(9) }],
      receipt: validReceipt('preflight', 'LOW', impl),
    };
    const gappedDigest = m.hashCalibrationRuntimeEvidenceBinding(gappedInput) as string;
    expect(gappedDigest).toMatch(/^[0-9a-f]{64}$/);
    const dupEvents = [1, 1].map((sequence) => ({ type: 'runtime_operation_started', version: 1, sequence, owner: copyRecord(owner), at, key: copyRecord(key), attempt: 1, operation: 'image' }));
    const dupInput = { ...gappedInput, events: dupEvents, throughSequence: 1 };
    let threwDup = false;
    try {
      m.hashCalibrationRuntimeEvidenceBinding(dupInput);
    } catch (error) {
      threwDup = isFreshFatal(error, dupInput);
    }
    expect(threwDup).toBe(true);
    const reversed = [5, 3, 1].map((sequence) => ({ type: 'runtime_operation_started', version: 1, sequence, owner: copyRecord(owner), at, key: copyRecord(key), attempt: 1, operation: 'image' }));
    const reversedInput = { ...gappedInput, events: reversed };
    let threwRev = false;
    try {
      m.hashCalibrationRuntimeEvidenceBinding(reversedInput);
    } catch (error) {
      threwRev = isFreshFatal(error, reversedInput);
    }
    expect(threwRev).toBe(true);
  });

  it('rejects unsorted and duplicate terminal rows instead of silently reordering', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const identity = copyRecord((f.header as unknown as Record<string, unknown>)['identity']) as Record<string, unknown>;
    const impl = identity['implementationCommit'] as string;
    const keyA = { stage: 'preflight', profile: 'LOW', caseId: 'aaa', sampleIndex: 1 };
    const keyB = { stage: 'preflight', profile: 'LOW', caseId: 'bbb', sampleIndex: 1 };
    const base = {
      version: 1, identity, stage: 'preflight', profile: 'LOW', throughSequence: 1,
      events: [copyRecord(f.start)],
      receipt: validReceipt('preflight', 'LOW', impl),
    };
    const unsorted = { ...base, terminals: [{ key: keyB, terminal: imageTerminal(2) }, { key: keyA, terminal: imageTerminal(3) }] };
    let threwUnsorted = false;
    try {
      m.hashCalibrationRuntimeEvidenceBinding(unsorted);
    } catch (error) {
      threwUnsorted = isFreshFatal(error, unsorted);
    }
    expect(threwUnsorted).toBe(true);
    const duplicate = { ...base, terminals: [{ key: keyA, terminal: imageTerminal(2) }, { key: keyA, terminal: imageTerminal(2) }] };
    let threwDup = false;
    try {
      m.hashCalibrationRuntimeEvidenceBinding(duplicate);
    } catch (error) {
      threwDup = isFreshFatal(error, duplicate);
    }
    expect(threwDup).toBe(true);
  });

  it('rejects receipt pair mismatch and wrong identity prefix with a valid baseline', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const identity = copyRecord((f.header as unknown as Record<string, unknown>)['identity']) as Record<string, unknown>;
    const impl = identity['implementationCommit'] as string;
    const validInput = {
      version: 1, identity, stage: 'preflight', profile: 'LOW', throughSequence: 1,
      events: [copyRecord(f.start)],
      terminals: [{ key: copyRecord((f.start as unknown as Record<string, unknown>)['key']), terminal: imageTerminal(2) }],
      receipt: validReceipt('preflight', 'LOW', impl),
    };
    const validDigest = m.hashCalibrationRuntimeEvidenceBinding(validInput) as string;
    expect(validDigest).toMatch(/^[0-9a-f]{64}$/);
    const pairMismatch = { ...validInput, receipt: validReceipt('development', 'LOW', impl) };
    let threwPair = false;
    try {
      m.hashCalibrationRuntimeEvidenceBinding(pairMismatch);
    } catch (error) {
      threwPair = isFreshFatal(error, pairMismatch);
    }
    expect(threwPair).toBe(true);
    const wrongPrefix = { ...validInput, receipt: validReceipt('preflight', 'LOW', 'a'.repeat(40)) };
    let threwPrefix = false;
    try {
      m.hashCalibrationRuntimeEvidenceBinding(wrongPrefix);
    } catch (error) {
      threwPrefix = isFreshFatal(error, wrongPrefix);
    }
    expect(threwPrefix).toBe(true);
  });

  it('rejects sparse binding arrays and extra array properties', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const identity = copyRecord((f.header as unknown as Record<string, unknown>)['identity']) as Record<string, unknown>;
    const impl = identity['implementationCommit'] as string;
    const sparse = new Array(2);
    sparse[0] = copyRecord(f.start);
    const sparseInput = {
      version: 1, identity, stage: 'preflight', profile: 'LOW', throughSequence: 1, events: sparse,
      terminals: [{ key: copyRecord((f.start as unknown as Record<string, unknown>)['key']), terminal: imageTerminal(2) }],
      receipt: validReceipt('preflight', 'LOW', impl),
    };
    let threwSparse = false;
    try {
      m.hashCalibrationRuntimeEvidenceBinding(sparseInput);
    } catch (error) {
      threwSparse = isFreshFatal(error, sparseInput);
    }
    expect(threwSparse).toBe(true);
    const withExtra = [copyRecord(f.start)] as unknown as Record<string, unknown>;
    (withExtra as Record<string, unknown>)['extra'] = 'x';
    const extraInput = {
      version: 1, identity, stage: 'preflight', profile: 'LOW', throughSequence: 1, events: withExtra,
      terminals: [{ key: copyRecord((f.start as unknown as Record<string, unknown>)['key']), terminal: imageTerminal(2) }],
      receipt: validReceipt('preflight', 'LOW', impl),
    };
    let threwExtra = false;
    try {
      m.hashCalibrationRuntimeEvidenceBinding(extraInput);
    } catch (error) {
      threwExtra = isFreshFatal(error, extraInput);
    }
    expect(threwExtra).toBe(true);
    const withSymbol = [copyRecord(f.start)];
    (withSymbol as unknown as Record<string | symbol, unknown>)[Symbol('extra')] = 'x';
    const symbolInput = {
      version: 1, identity, stage: 'preflight', profile: 'LOW', throughSequence: 1, events: withSymbol,
      terminals: [{ key: copyRecord((f.start as unknown as Record<string, unknown>)['key']), terminal: imageTerminal(2) }],
      receipt: validReceipt('preflight', 'LOW', impl),
    };
    let threwSymbol = false;
    try {
      m.hashCalibrationRuntimeEvidenceBinding(symbolInput);
    } catch (error) {
      threwSymbol = isFreshFatal(error, symbolInput);
    }
    expect(threwSymbol).toBe(true);
  });

  it('rejects custom array prototypes and index accessors in binding arrays', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const identity = copyRecord((f.header as unknown as Record<string, unknown>)['identity']) as Record<string, unknown>;
    const impl = identity['implementationCommit'] as string;
    const customProto = [copyRecord(f.start)];
    Object.setPrototypeOf(customProto, { hidden: true });
    const protoInput = {
      version: 1, identity, stage: 'preflight', profile: 'LOW', throughSequence: 1, events: customProto,
      terminals: [{ key: copyRecord((f.start as unknown as Record<string, unknown>)['key']), terminal: imageTerminal(2) }],
      receipt: validReceipt('preflight', 'LOW', impl),
    };
    let threwProto = false;
    try {
      m.hashCalibrationRuntimeEvidenceBinding(protoInput);
    } catch (error) {
      threwProto = isFreshFatal(error, protoInput);
    }
    expect(threwProto).toBe(true);
    const accessorArr = [copyRecord(f.start)];
    Object.defineProperty(accessorArr, '0', { enumerable: true, get: () => copyRecord(f.start) });
    const accessorInput = {
      version: 1, identity, stage: 'preflight', profile: 'LOW', throughSequence: 1, events: accessorArr,
      terminals: [{ key: copyRecord((f.start as unknown as Record<string, unknown>)['key']), terminal: imageTerminal(2) }],
      receipt: validReceipt('preflight', 'LOW', impl),
    };
    let threwAccessor = false;
    try {
      m.hashCalibrationRuntimeEvidenceBinding(accessorInput);
    } catch (error) {
      threwAccessor = isFreshFatal(error, accessorInput);
    }
    expect(threwAccessor).toBe(true);
  });

  it('holds exactly 4096 events accepted and 4097 rejected with all rows bounded', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const identity = copyRecord((f.header as unknown as Record<string, unknown>)['identity']) as Record<string, unknown>;
    const impl = identity['implementationCommit'] as string;
    const key = copyRecord((f.start as unknown as Record<string, unknown>)['key']);
    const owner = copyRecord((f.start as unknown as Record<string, unknown>)['owner']);
    const at = '2026-10-14T00:00:00.000Z';
    const makeEvents = (count: number) => {
      const list: unknown[] = [];
      for (let index = 1; index <= count; index += 1) {
        list.push({ type: 'runtime_operation_started', version: 1, sequence: index, owner: copyRecord(owner), at, key: copyRecord(key), attempt: 1, operation: 'image' });
      }
      return list;
    };
    const events4096 = makeEvents(4096);
    const input4096 = {
      version: 1, identity, stage: 'preflight', profile: 'LOW', throughSequence: 4096, events: events4096,
      terminals: [{ key: copyRecord(key), terminal: imageTerminal(5000) }],
      receipt: validReceipt('preflight', 'LOW', impl),
    };
    const digest4096 = m.hashCalibrationRuntimeEvidenceBinding(input4096) as string;
    expect(digest4096).toMatch(/^[0-9a-f]{64}$/);
    const events4097 = makeEvents(4097);
    const input4097 = { ...input4096, events: events4097, throughSequence: 4097 };
    let threw = false;
    try {
      m.hashCalibrationRuntimeEvidenceBinding(input4097);
    } catch (error) {
      threw = isFreshFatal(error, input4097);
    }
    expect(threw).toBe(true);
  });

  it('holds exactly 158 same-pair sorted terminal rows accepted and 159 rejected', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const identity = copyRecord((f.header as unknown as Record<string, unknown>)['identity']) as Record<string, unknown>;
    const impl = identity['implementationCommit'] as string;
    const makeKey = (index: number) => ({ stage: 'preflight', profile: 'LOW', caseId: `t1c-${String(index).padStart(3, '0')}`, sampleIndex: 1 });
    const terminals158 = Array.from({ length: 158 }, (_v, i) => ({ key: makeKey(i), terminal: imageTerminal(i + 2) }));
    expect(terminals158).toHaveLength(158);
    for (const row of terminals158) {
      expect(row.key.stage).toBe('preflight');
      expect(row.key.profile).toBe('LOW');
      expect(row.key.sampleIndex).toBe(1);
    }
    const ids = terminals158.map((row) => `${row.key.stage}|${row.key.profile}|${row.key.caseId}|${row.key.sampleIndex}`);
    expect(new Set(ids).size).toBe(158);
    for (let i = 1; i < ids.length; i += 1) {
      expect((ids[i - 1] as string) < (ids[i] as string)).toBe(true);
    }
    const events = [copyRecord(f.start)];
    const input158 = {
      version: 1, identity, stage: 'preflight', profile: 'LOW', throughSequence: 1, events,
      terminals: terminals158, receipt: validReceipt('preflight', 'LOW', impl),
    };
    const digest158 = m.hashCalibrationRuntimeEvidenceBinding(input158) as string;
    expect(digest158).toMatch(/^[0-9a-f]{64}$/);
    const extraRow = { key: makeKey(158), terminal: imageTerminal(9999) };
    expect((ids[ids.length - 1] as string) < `preflight|LOW|t1c-158|1`).toBe(true);
    const terminals159 = [...terminals158, extraRow];
    expect(terminals159).toHaveLength(159);
    const input159 = { ...input158, terminals: terminals159 };
    let threw = false;
    try {
      m.hashCalibrationRuntimeEvidenceBinding(input159);
    } catch (error) {
      threw = isFreshFatal(error, input159);
    }
    expect(threw).toBe(true);
  });
});

describe('compact closed-record matrices from valid baselines', () => {
  type FixtureData = Awaited<ReturnType<typeof makeRuntimeEvidenceData>>;
  const headerOf = (f: FixtureData) => structuredClone(f.header) as unknown as Record<string, unknown>;
  const startOf = (f: FixtureData) => structuredClone(f.start) as unknown as Record<string, unknown>;
  const finishedImageOf = (f: FixtureData) => ({
    type: 'runtime_attempt_finished', version: 1, sequence: 5,
    owner: copyRecord((f.start as unknown as Record<string, unknown>)['owner']),
    at: '2026-10-14T00:00:04.000Z',
    key: copyRecord((f.start as unknown as Record<string, unknown>)['key']), attempt: 1, terminal: imageTerminal(2),
  });
  const finishedNonResOf = (f: FixtureData) => ({
    type: 'runtime_attempt_finished', version: 1, sequence: 5,
    owner: copyRecord((f.start as unknown as Record<string, unknown>)['owner']),
    at: '2026-10-14T00:00:04.000Z',
    key: copyRecord((f.start as unknown as Record<string, unknown>)['key']), attempt: 1, terminal: nonReservationTerminal(2),
  });
  const abandonedOf = (f: FixtureData) => ({
    type: 'runtime_attempt_abandoned', version: 1, sequence: 6,
    owner: copyRecord((f.start as unknown as Record<string, unknown>)['owner']),
    at: '2026-10-14T00:00:05.000Z',
    key: copyRecord((f.start as unknown as Record<string, unknown>)['key']), attempt: 1,
    disposition: { kind: 'unreserved_interruption' },
  });
  const boundEventOf = (f: FixtureData, impl: string) => ({
    type: 'runtime_report_bound', version: 1, sequence: 7,
    owner: copyRecord((f.start as unknown as Record<string, unknown>)['owner']),
    at: '2026-10-14T00:00:06.000Z',
    stage: 'preflight', profile: 'LOW', receipt: validReceipt('preflight', 'LOW', impl),
    throughSequence: 6, bindingSha256: 'a'.repeat(64),
  });
  const bindingOf = (f: FixtureData, impl: string) => ({
    version: 1,
    identity: copyRecord((f.header as unknown as Record<string, unknown>)['identity']),
    stage: 'preflight', profile: 'LOW', throughSequence: 1,
    events: [copyRecord(f.start)],
    terminals: [{ key: copyRecord((f.start as unknown as Record<string, unknown>)['key']), terminal: imageTerminal(2) }],
    receipt: validReceipt('preflight', 'LOW', impl),
  });

  it('rejects a missing required field in each nested record', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const origModel = ((f.header.identity as unknown) as Record<string, unknown>)['model'];
    const origCaseId = ((f.key as unknown) as Record<string, unknown>)['caseId'];
    const origPid = (((f.start as unknown) as Record<string, unknown>)['owner'] as Record<string, unknown>)['pid'];
    const baselineHeader = headerOf(f);
    expect((baselineHeader['reportAuthority'] as string)).toBe('verified_artifacts_v1');
    const baselineStart = startOf(f);
    expect((baselineStart['sequence'] as number)).toBe(1);
    const impl = ((f.header as unknown as Record<string, unknown>)['identity'] as Record<string, unknown>)['implementationCommit'] as string;
    const headerRoot = headerOf(f);
    (headerRoot['identity'] as Record<string, unknown>) = (() => { const v = copyRecord(headerRoot['identity']); delete v['model']; return v; })();
    let t1 = false;
    try { m.captureCalibrationRuntimeEvidenceHeader(headerRoot); } catch (e) { t1 = isFreshFatal(e, headerRoot); }
    expect(t1).toBe(true);
    const headerOwnerRoot = headerOf(f);
    (headerOwnerRoot['owner'] as Record<string, unknown>) = (() => { const v = copyRecord(headerOwnerRoot['owner']); delete v['hostname']; return v; })();
    let t2 = false;
    try { m.captureCalibrationRuntimeEvidenceHeader(headerOwnerRoot); } catch (e) { t2 = isFreshFatal(e, headerOwnerRoot); }
    expect(t2).toBe(true);
    const eventRoot = startOf(f);
    delete eventRoot['sequence'];
    let t3 = false;
    try { m.captureCalibrationRuntimeEvidenceEvent(eventRoot); } catch (e) { t3 = isFreshFatal(e, eventRoot); }
    expect(t3).toBe(true);
    const keyRoot = startOf(f);
    (keyRoot['key'] as Record<string, unknown>) = (() => { const v = copyRecord(keyRoot['key']); delete v['caseId']; return v; })();
    let t4 = false;
    try { m.captureCalibrationRuntimeEvidenceEvent(keyRoot); } catch (e) { t4 = isFreshFatal(e, keyRoot); }
    expect(t4).toBe(true);
    const ownerRoot = startOf(f);
    (ownerRoot['owner'] as Record<string, unknown>) = (() => { const v = copyRecord(ownerRoot['owner']); delete v['pid']; return v; })();
    let t5 = false;
    try { m.captureCalibrationRuntimeEvidenceEvent(ownerRoot); } catch (e) { t5 = isFreshFatal(e, ownerRoot); }
    expect(t5).toBe(true);
    const termImageRoot = finishedImageOf(f);
    (termImageRoot['terminal'] as Record<string, unknown>) = (() => { const v = copyRecord(termImageRoot['terminal']); delete v['journalHash']; return v; })();
    let t6 = false;
    try { m.captureCalibrationRuntimeEvidenceEvent(termImageRoot); } catch (e) { t6 = isFreshFatal(e, termImageRoot); }
    expect(t6).toBe(true);
    const termNonRoot = finishedNonResOf(f);
    (termNonRoot['terminal'] as Record<string, unknown>) = (() => { const v = copyRecord(termNonRoot['terminal']); delete v['contentDigest']; return v; })();
    let t7 = false;
    try { m.captureCalibrationRuntimeEvidenceEvent(termNonRoot); } catch (e) { t7 = isFreshFatal(e, termNonRoot); }
    expect(t7).toBe(true);
    const dispRoot = abandonedOf(f);
    (dispRoot['disposition'] as Record<string, unknown>) = {};
    let t8 = false;
    try { m.captureCalibrationRuntimeEvidenceEvent(dispRoot); } catch (e) { t8 = isFreshFatal(e, dispRoot); }
    expect(t8).toBe(true);
    const receiptRoot = boundEventOf(f, impl);
    (receiptRoot['receipt'] as Record<string, unknown>) = (() => { const v = copyRecord(receiptRoot['receipt']); delete v['runId']; return v; })();
    let t9 = false;
    try { m.captureCalibrationRuntimeEvidenceEvent(receiptRoot); } catch (e) { t9 = isFreshFatal(e, receiptRoot); }
    expect(t9).toBe(true);
    const bindRoot = bindingOf(f, impl) as Record<string, unknown>;
    delete bindRoot['receipt'];
    let t10 = false;
    try { m.hashCalibrationRuntimeEvidenceBinding(bindRoot); } catch (e) { t10 = isFreshFatal(e, bindRoot); }
    expect(t10).toBe(true);
    const rowRoot = bindingOf(f, impl) as Record<string, unknown>;
    (rowRoot['terminals'] as Array<Record<string, unknown>>)[0] = { key: copyRecord((f.start as unknown as Record<string, unknown>)['key']) };
    let t11 = false;
    try { m.hashCalibrationRuntimeEvidenceBinding(rowRoot); } catch (e) { t11 = isFreshFatal(e, rowRoot); }
    expect(t11).toBe(true);
    expect(((f.header.identity as unknown) as Record<string, unknown>)['model']).toBe(origModel);
    expect(((f.key as unknown) as Record<string, unknown>)['caseId']).toBe(origCaseId);
    expect((((f.start as unknown) as Record<string, unknown>)['owner'] as Record<string, unknown>)['pid']).toBe(origPid);
  });

  it('rejects present-undefined in each nested record', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const origModel = ((f.header.identity as unknown) as Record<string, unknown>)['model'];
    const origCaseId = ((f.key as unknown) as Record<string, unknown>)['caseId'];
    const origPid = (((f.start as unknown) as Record<string, unknown>)['owner'] as Record<string, unknown>)['pid'];
    const baselineHeader = headerOf(f);
    expect((baselineHeader['reportAuthority'] as string)).toBe('verified_artifacts_v1');
    const baselineStart = startOf(f);
    expect((baselineStart['sequence'] as number)).toBe(1);
    const impl = ((f.header as unknown as Record<string, unknown>)['identity'] as Record<string, unknown>)['implementationCommit'] as string;
    const mkPairs: Array<[string, unknown, (m: CodecModule, v: unknown) => unknown]> = [];
    const h1 = headerOf(f); (h1['identity'] as Record<string, unknown>)['model'] = undefined;
    mkPairs.push(['header.identity', h1, (mm, v) => mm.captureCalibrationRuntimeEvidenceHeader(v)]);
    const h2 = headerOf(f); (h2['owner'] as Record<string, unknown>)['hostname'] = undefined;
    mkPairs.push(['header.owner', h2, (mm, v) => mm.captureCalibrationRuntimeEvidenceHeader(v)]);
    const e1 = startOf(f); e1['sequence'] = undefined;
    mkPairs.push(['event root', e1, (mm, v) => mm.captureCalibrationRuntimeEvidenceEvent(v)]);
    const e2 = startOf(f); (e2['key'] as Record<string, unknown>)['caseId'] = undefined;
    mkPairs.push(['event.key', e2, (mm, v) => mm.captureCalibrationRuntimeEvidenceEvent(v)]);
    const e3 = startOf(f); (e3['owner'] as Record<string, unknown>)['pid'] = undefined;
    mkPairs.push(['event.owner', e3, (mm, v) => mm.captureCalibrationRuntimeEvidenceEvent(v)]);
    const b1 = bindingOf(f, impl) as Record<string, unknown>; b1['receipt'] = undefined;
    mkPairs.push(['binding root', b1, (mm, v) => mm.hashCalibrationRuntimeEvidenceBinding(v)]);
    for (const [name, root, invoke] of mkPairs) {
      let threw = false;
      try { invoke(m, root); } catch (error) { threw = isFreshFatal(error, root); }
      expect(threw).toBe(true);
      void name;
    }
    expect(((f.header.identity as unknown) as Record<string, unknown>)['model']).toBe(origModel);
    expect(((f.key as unknown) as Record<string, unknown>)['caseId']).toBe(origCaseId);
    expect((((f.start as unknown) as Record<string, unknown>)['owner'] as Record<string, unknown>)['pid']).toBe(origPid);
  });

  it('rejects unknown enumerable extras in each nested record', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const origModel = ((f.header.identity as unknown) as Record<string, unknown>)['model'];
    const origCaseId = ((f.key as unknown) as Record<string, unknown>)['caseId'];
    const origPid = (((f.start as unknown) as Record<string, unknown>)['owner'] as Record<string, unknown>)['pid'];
    const baselineHeader = headerOf(f);
    expect((baselineHeader['reportAuthority'] as string)).toBe('verified_artifacts_v1');
    const baselineStart = startOf(f);
    expect((baselineStart['sequence'] as number)).toBe(1);
    const impl = ((f.header as unknown as Record<string, unknown>)['identity'] as Record<string, unknown>)['implementationCommit'] as string;
    const targets: Array<{ root: unknown; invoke: (m: CodecModule, v: unknown) => unknown }> = [];
    const h1 = headerOf(f); (h1['identity'] as Record<string, unknown>)['extra'] = 1;
    targets.push({ root: h1, invoke: (mm, v) => mm.captureCalibrationRuntimeEvidenceHeader(v) });
    const h2 = headerOf(f); (h2['owner'] as Record<string, unknown>)['extra'] = 1;
    targets.push({ root: h2, invoke: (mm, v) => mm.captureCalibrationRuntimeEvidenceHeader(v) });
    const e1 = startOf(f); (e1 as Record<string, unknown>)['extra'] = 1;
    targets.push({ root: e1, invoke: (mm, v) => mm.captureCalibrationRuntimeEvidenceEvent(v) });
    const e2 = startOf(f); ((e2['key'] as Record<string, unknown>)['extra'] as unknown) = 1;
    targets.push({ root: e2, invoke: (mm, v) => mm.captureCalibrationRuntimeEvidenceEvent(v) });
    const e3 = startOf(f); ((e3['owner'] as Record<string, unknown>)['extra'] as unknown) = 1;
    targets.push({ root: e3, invoke: (mm, v) => mm.captureCalibrationRuntimeEvidenceEvent(v) });
    const fin = finishedImageOf(f) as unknown as Record<string, unknown>; ((fin['terminal'] as Record<string, unknown>)['extra'] as unknown) = 1;
    targets.push({ root: fin, invoke: (mm, v) => mm.captureCalibrationRuntimeEvidenceEvent(v) });
    const abd = abandonedOf(f) as unknown as Record<string, unknown>; ((abd['disposition'] as Record<string, unknown>)['extra'] as unknown) = 1;
    targets.push({ root: abd, invoke: (mm, v) => mm.captureCalibrationRuntimeEvidenceEvent(v) });
    const bev = boundEventOf(f, impl) as unknown as Record<string, unknown>; ((bev['receipt'] as Record<string, unknown>)['extra'] as unknown) = 1;
    targets.push({ root: bev, invoke: (mm, v) => mm.captureCalibrationRuntimeEvidenceEvent(v) });
    const broot = bindingOf(f, impl) as unknown as Record<string, unknown>; (broot['extra'] as unknown) = 1;
    targets.push({ root: broot, invoke: (mm, v) => mm.hashCalibrationRuntimeEvidenceBinding(v) });
    const brow = bindingOf(f, impl) as unknown as Record<string, unknown>;
    (((brow['terminals'] as Array<Record<string, unknown>>)[0] as Record<string, unknown>)['extra'] as unknown) = 1;
    targets.push({ root: brow, invoke: (mm, v) => mm.hashCalibrationRuntimeEvidenceBinding(v) });
    for (const t of targets) {
      let threw = false;
      try { t.invoke(m, t.root); } catch (error) { threw = isFreshFatal(error, t.root); }
      expect(threw).toBe(true);
    }
    expect(((f.header.identity as unknown) as Record<string, unknown>)['model']).toBe(origModel);
    expect(((f.key as unknown) as Record<string, unknown>)['caseId']).toBe(origCaseId);
    expect((((f.start as unknown) as Record<string, unknown>)['owner'] as Record<string, unknown>)['pid']).toBe(origPid);
  });

  it('rejects nonenumerable, symbol, accessor, and inherited extras without invoking getters', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const check = async (make: (base: Record<string, unknown>) => Record<string, unknown>, invoke: (m: CodecModule, v: unknown) => unknown) => {
      const base = startOf(f);
      const keyBase = copyRecord(base['key']);
      const hidden = make(keyBase);
      const root = { ...base, key: hidden };
      let threw = false;
      try { invoke(m, root); } catch (error) { threw = isFreshFatal(error, root); }
      expect(threw).toBe(true);
    };
    const invokeEvent = (mm: CodecModule, v: unknown) => mm.captureCalibrationRuntimeEvidenceEvent(v);
    await check((v) => { Object.defineProperty(v, 'secret', { value: 1, enumerable: false }); return v; }, invokeEvent);
    await check((v) => { (v as Record<string | symbol, unknown>)[Symbol('s')] = 1; return v; }, invokeEvent);
    let gets = 0;
    await check((v) => { Object.defineProperty(v, 'caseId', { enumerable: true, get: () => { gets += 1; return 'x'; } }); return v; }, invokeEvent);
    expect(gets).toBe(0);
    await check((v) => { const c = Object.create({ injected: 1 }); Object.assign(c, v); return c; }, invokeEvent);
    class Cl { [k: string]: unknown }
    await check((v) => { const inst = new Cl(); Object.assign(inst, v); return inst as unknown as Record<string, unknown>; }, invokeEvent);
    const nullProtoTarget = Object.assign(Object.create(null), copyRecord((startOf(f)['key'] as Record<string, unknown>)));
    const nullProtoRoot = { ...startOf(f), key: nullProtoTarget };
    const captured = m.captureCalibrationRuntimeEvidenceEvent(nullProtoRoot) as Record<string, unknown>;
    expect(((captured['key'] as Record<string, unknown>)['sampleIndex'] as number)).toBe(1);
  });

  it('rejects null, primitive, array, and nonplain nested records', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const badKeys: unknown[] = [null, 'x', 42, [], { a: 1 }];
    for (const badKey of badKeys) {
      const root = { ...startOf(f), key: badKey };
      let threw = false;
      try { m.captureCalibrationRuntimeEvidenceEvent(root); } catch (error) { threw = isFreshFatal(error, root); }
      expect(threw).toBe(true);
    }
    const badOwners: unknown[] = [null, 'x', [], 7];
    for (const badOwner of badOwners) {
      const root = { ...startOf(f), owner: badOwner };
      let threw = false;
      try { m.captureCalibrationRuntimeEvidenceEvent(root); } catch (error) { threw = isFreshFatal(error, root); }
      expect(threw).toBe(true);
    }
    const badHeaders: unknown[] = [null, 'x', [], 7];
    for (const badHeader of badHeaders) {
      let threw = false;
      try { m.captureCalibrationRuntimeEvidenceHeader(badHeader); } catch (error) { threw = isFreshFatal(error, badHeader); }
      expect(threw).toBe(true);
    }
  });
});

describe('compact numeric, time, and enum boundaries', () => {
  it('rejects terminal, reservation, pid, ticks, and attempt numerics', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const badNumbers: unknown[] = [-0, 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1];
    for (const n of badNumbers) {
      const tRoot = {
        type: 'runtime_attempt_finished', version: 1, sequence: 5,
        owner: copyRecord((f.start as unknown as Record<string, unknown>)['owner']),
        at: '2026-10-14T00:00:04.000Z',
        key: copyRecord((f.start as unknown as Record<string, unknown>)['key']), attempt: 1,
        terminal: { kind: 'image', eventIndex: n, journalHash: 'a'.repeat(64) },
      };
      let t1 = false;
      try { m.captureCalibrationRuntimeEvidenceEvent(tRoot); } catch (e) { t1 = isFreshFatal(e, tRoot); }
      expect(t1).toBe(true);
      const rRoot = {
        type: 'runtime_request_authorized', version: 1, sequence: 4,
        owner: copyRecord((f.start as unknown as Record<string, unknown>)['owner']),
        at: '2026-10-14T00:00:03.000Z',
        key: copyRecord((f.start as unknown as Record<string, unknown>)['key']), attempt: 1, reservationEventIndex: n,
      };
      let t2 = false;
      try { m.captureCalibrationRuntimeEvidenceEvent(rRoot); } catch (e) { t2 = isFreshFatal(e, rRoot); }
      expect(t2).toBe(true);
      for (const field of ['pid', 'startTicks'] as const) {
        const oRoot = copyRecord(f.start);
        const o = copyRecord(oRoot['owner']); (o[field] as unknown) = n;
        oRoot['owner'] = o;
        let t3 = false;
        try { m.captureCalibrationRuntimeEvidenceEvent(oRoot); } catch (e) { t3 = isFreshFatal(e, oRoot); }
        expect(t3).toBe(true);
      }
      const aRoot = copyRecord(f.start);
      (aRoot['attempt'] as unknown) = n;
      let t4 = false;
      try { m.captureCalibrationRuntimeEvidenceEvent(aRoot); } catch (e) { t4 = isFreshFatal(e, aRoot); }
      expect(t4).toBe(true);
    }
  });

  it('rejects invalid throughSequence and mismatched bound-event prefix', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const identity = copyRecord((f.header as unknown as Record<string, unknown>)['identity']) as Record<string, unknown>;
    const impl = identity['implementationCommit'] as string;
    for (const throughSequence of [-0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      const input = {
        version: 1, identity, stage: 'preflight', profile: 'LOW', throughSequence,
        events: [copyRecord(f.start)],
        terminals: [{ key: copyRecord((f.start as unknown as Record<string, unknown>)['key']), terminal: imageTerminal(2) }],
        receipt: validReceipt('preflight', 'LOW', impl),
      };
      let threw = false;
      try { m.hashCalibrationRuntimeEvidenceBinding(input); } catch (e) { threw = isFreshFatal(e, input); }
      expect(threw).toBe(true);
    }
    const badBound = {
      type: 'runtime_report_bound', version: 1, sequence: 7,
      owner: copyRecord((f.start as unknown as Record<string, unknown>)['owner']),
      at: '2026-10-14T00:00:06.000Z',
      stage: 'preflight', profile: 'LOW', receipt: validReceipt('preflight', 'LOW', impl),
      throughSequence: 5, bindingSha256: 'a'.repeat(64),
    };
    let threwBound = false;
    try { m.captureCalibrationRuntimeEvidenceEvent(badBound); } catch (e) { threwBound = isFreshFatal(e, badBound); }
    expect(threwBound).toBe(true);
  });

  it('rejects offset, missing-ms, and invalid-calendar timestamps', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    for (const at of ['2026-10-14T00:00:00.000+00:00', '2026-10-14T00:00:00Z', '2026-02-30T00:00:00.000Z']) {
      const eRoot = { ...copyRecord(f.start), at };
      let t1 = false;
      try { m.captureCalibrationRuntimeEvidenceEvent(eRoot); } catch (e) { t1 = isFreshFatal(e, eRoot); }
      expect(t1).toBe(true);
      const oRoot = copyRecord(f.start);
      const o = copyRecord(oRoot['owner']); o['acquiredAt'] = at;
      oRoot['owner'] = o;
      let t2 = false;
      try { m.captureCalibrationRuntimeEvidenceEvent(oRoot); } catch (e) { t2 = isFreshFatal(e, oRoot); }
      expect(t2).toBe(true);
    }
  });

  it('holds snapshot operation and both settled results valid, unknown enums invalid', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const base = {
      type: 'runtime_operation_started', version: 1, sequence: 2,
      owner: copyRecord((f.start as unknown as Record<string, unknown>)['owner']),
      at: '2026-10-14T00:00:01.000Z',
      key: { stage: 'benchmark', profile: 'LOW', caseId: 'valid-barcode_1', sampleIndex: 1 }, attempt: 1,
    };
    for (const operation of ['image', 'vision', 'snapshot']) {
      const good = { ...base, operation };
      const captured = m.captureCalibrationRuntimeEvidenceEvent(good) as Record<string, unknown>;
      expect((captured['operation'] as string)).toBe(operation);
    }
    const badOp = { ...base, operation: 'compute' };
    let tOp = false;
    try { m.captureCalibrationRuntimeEvidenceEvent(badOp); } catch (e) { tOp = isFreshFatal(e, badOp); }
    expect(tOp).toBe(true);
    const settleBase = { ...base, type: 'runtime_operation_settled', sequence: 3, operation: 'snapshot' };
    for (const result of ['returned', 'failed']) {
      const good = { ...settleBase, result };
      const captured = m.captureCalibrationRuntimeEvidenceEvent(good) as Record<string, unknown>;
      expect((captured['result'] as string)).toBe(result);
      expect((captured['operation'] as string)).toBe('snapshot');
    }
    const badRes = { ...settleBase, result: 'maybe' };
    let tRes = false;
    try { m.captureCalibrationRuntimeEvidenceEvent(badRes); } catch (e) { tRes = isFreshFatal(e, badRes); }
    expect(tRes).toBe(true);
  });

  it('rejects terminal and disposition kind confusion with digest checks', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const base = {
      type: 'runtime_attempt_finished', version: 1, sequence: 5,
      owner: copyRecord((f.start as unknown as Record<string, unknown>)['owner']),
      at: '2026-10-14T00:00:04.000Z',
      key: copyRecord((f.start as unknown as Record<string, unknown>)['key']), attempt: 1,
    };
    const badKind = { ...base, terminal: { kind: 'other', eventIndex: 2, journalHash: 'a'.repeat(64) } };
    let t1 = false;
    try { m.captureCalibrationRuntimeEvidenceEvent(badKind); } catch (e) { t1 = isFreshFatal(e, badKind); }
    expect(t1).toBe(true);
    const badDigest = { ...base, terminal: { kind: 'image', eventIndex: 2, journalHash: 'A'.repeat(64) } };
    let t2 = false;
    try { m.captureCalibrationRuntimeEvidenceEvent(badDigest); } catch (e) { t2 = isFreshFatal(e, badDigest); }
    expect(t2).toBe(true);
    const badDisp = {
      type: 'runtime_attempt_abandoned', version: 1, sequence: 6,
      owner: copyRecord((f.start as unknown as Record<string, unknown>)['owner']),
      at: '2026-10-14T00:00:05.000Z',
      key: copyRecord((f.start as unknown as Record<string, unknown>)['key']), attempt: 1,
      disposition: { kind: 'unknown_kind' },
    };
    let t3 = false;
    try { m.captureCalibrationRuntimeEvidenceEvent(badDisp); } catch (e) { t3 = isFreshFatal(e, badDisp); }
    expect(t3).toBe(true);
  });

  it('rejects explicit wrong-pair events and closed-array violations for both arrays', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const identity = copyRecord((f.header as unknown as Record<string, unknown>)['identity']) as Record<string, unknown>;
    const impl = identity['implementationCommit'] as string;
    const wrongKey = { stage: 'development', profile: 'LOW', caseId: 'valid-case_1', sampleIndex: 1 };
    const wrongEvent = {
      type: 'runtime_attempt_started', version: 1, sequence: 1,
      owner: copyRecord((f.start as unknown as Record<string, unknown>)['owner']),
      at: '2026-10-14T00:00:00.000Z', key: wrongKey, attempt: 1,
    };
    const wrongEventInput = {
      version: 1, identity, stage: 'preflight', profile: 'LOW', throughSequence: 1, events: [wrongEvent],
      terminals: [{ key: copyRecord((f.start as unknown as Record<string, unknown>)['key']), terminal: imageTerminal(2) }],
      receipt: validReceipt('preflight', 'LOW', impl),
    };
    let tPair = false;
    try { m.hashCalibrationRuntimeEvidenceBinding(wrongEventInput); } catch (e) { tPair = isFreshFatal(e, wrongEventInput); }
    expect(tPair).toBe(true);
    const makeBase = () => ({
      version: 1, identity, stage: 'preflight', profile: 'LOW', throughSequence: 1,
      events: [structuredClone(f.start) as unknown],
      terminals: [{ key: structuredClone((f.start as unknown as Record<string, unknown>)['key']), terminal: imageTerminal(2) }],
      receipt: validReceipt('preflight', 'LOW', impl),
    });
    for (const key of ['events', 'terminals'] as const) {
      const undefBase = makeBase();
      const undefArr = (undefBase[key] as unknown[]).slice();
      (undefArr[0] as unknown) = undefined;
      const undefInput = { ...undefBase, [key]: undefArr };
      let tU = false;
      try { m.hashCalibrationRuntimeEvidenceBinding(undefInput); } catch (e) { tU = isFreshFatal(e, undefInput); }
      expect(tU).toBe(true);
      const numBase = makeBase();
      ((numBase[key] as unknown) as Record<string, unknown>)['5'] = structuredClone(f.start) as unknown;
      let tN = false;
      try { m.hashCalibrationRuntimeEvidenceBinding(numBase); } catch (e) { tN = isFreshFatal(e, numBase); }
      expect(tN).toBe(true);
      const symBase = makeBase();
      const symArr = (symBase[key] as unknown[]).slice() as unknown as Record<string | symbol, unknown>;
      symArr[Symbol('extra')] = 1;
      const symInput = { ...symBase, [key]: symArr };
      let tS = false;
      try { m.hashCalibrationRuntimeEvidenceBinding(symInput); } catch (e) { tS = isFreshFatal(e, symInput); }
      expect(tS).toBe(true);
      const accBase = makeBase();
      const accArr = [(accBase[key] as unknown[])[0]];
      let accGets = 0;
      Object.defineProperty(accArr, '0', { enumerable: true, get: () => { accGets += 1; return structuredClone(f.start) as unknown; } });
      const accInput = { ...accBase, [key]: accArr };
      let tA = false;
      try { m.hashCalibrationRuntimeEvidenceBinding(accInput); } catch (e) { tA = isFreshFatal(e, accInput); }
      expect(tA).toBe(true);
      expect(accGets).toBe(0);
    }
  });

  it('accepts all matrix base builders before mutation', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const impl = ((f.header as unknown as Record<string, unknown>)['identity'] as Record<string, unknown>)['implementationCommit'] as string;
    const validHeader = structuredClone(f.header) as unknown as Record<string, unknown>;
    const capturedHeader = m.captureCalibrationRuntimeEvidenceHeader(validHeader) as Record<string, unknown>;
    expect((capturedHeader['reportAuthority'] as string)).toBe('verified_artifacts_v1');
    const validStart = structuredClone(f.start) as unknown as Record<string, unknown>;
    const capturedStart = m.captureCalibrationRuntimeEvidenceEvent(validStart) as Record<string, unknown>;
    expect((capturedStart['sequence'] as number)).toBe(1);
    const validImageFinish = {
      type: 'runtime_attempt_finished', version: 1, sequence: 5,
      owner: structuredClone((f.start as unknown as Record<string, unknown>)['owner']),
      at: '2026-10-14T00:00:04.000Z',
      key: structuredClone((f.start as unknown as Record<string, unknown>)['key']), attempt: 1, terminal: imageTerminal(2),
    };
    expect(((m.captureCalibrationRuntimeEvidenceEvent(validImageFinish) as Record<string, unknown>)['type'] as string)).toBe('runtime_attempt_finished');
    const validNonResFinish = {
      type: 'runtime_attempt_finished', version: 1, sequence: 5,
      owner: structuredClone((f.start as unknown as Record<string, unknown>)['owner']),
      at: '2026-10-14T00:00:04.000Z',
      key: structuredClone((f.start as unknown as Record<string, unknown>)['key']), attempt: 1, terminal: nonReservationTerminal(2),
    };
    expect(((m.captureCalibrationRuntimeEvidenceEvent(validNonResFinish) as Record<string, unknown>)['type'] as string)).toBe('runtime_attempt_finished');
    const validAbandoned = {
      type: 'runtime_attempt_abandoned', version: 1, sequence: 6,
      owner: structuredClone((f.start as unknown as Record<string, unknown>)['owner']),
      at: '2026-10-14T00:00:05.000Z',
      key: structuredClone((f.start as unknown as Record<string, unknown>)['key']), attempt: 1,
      disposition: { kind: 'unreserved_interruption' },
    };
    expect(((m.captureCalibrationRuntimeEvidenceEvent(validAbandoned) as Record<string, unknown>)['type'] as string)).toBe('runtime_attempt_abandoned');
    const validBoundEvent = {
      type: 'runtime_report_bound', version: 1, sequence: 7,
      owner: structuredClone((f.start as unknown as Record<string, unknown>)['owner']),
      at: '2026-10-14T00:00:06.000Z',
      stage: 'preflight', profile: 'LOW', receipt: validReceipt('preflight', 'LOW', impl),
      throughSequence: 6, bindingSha256: 'a'.repeat(64),
    };
    expect(((m.captureCalibrationRuntimeEvidenceEvent(validBoundEvent) as Record<string, unknown>)['throughSequence'] as number)).toBe(6);
    const validBinding = {
      version: 1,
      identity: structuredClone((f.header as unknown as Record<string, unknown>)['identity']),
      stage: 'preflight', profile: 'LOW', throughSequence: 1,
      events: [structuredClone(f.start) as unknown],
      terminals: [{ key: structuredClone((f.start as unknown as Record<string, unknown>)['key']), terminal: imageTerminal(2) }],
      receipt: validReceipt('preflight', 'LOW', impl),
    };
    expect((m.hashCalibrationRuntimeEvidenceBinding(validBinding) as string)).toMatch(/^[0-9a-f]{64}$/);
    expect(((f.header.identity as unknown) as Record<string, unknown>)['model']).toBe('gemini-3.8-flash');
  });
});

describe('revoked-proxy normalization regressions', () => {
  function revokedRecord(): { proxy: unknown } {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    return { proxy };
  }

  function expectOwnFreshFatal(error: unknown, foreign: unknown): void {
    const isForeign = error === (foreign as unknown);
    expect(isForeign).toBe(false);
    expect(isFreshFatal(error, foreign)).toBe(true);
  }

  it('normalizes a revoked root in all five public functions', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const baselineHeader = m.captureCalibrationRuntimeEvidenceHeader(structuredClone(f.header)) as Record<string, unknown>;
    expect((baselineHeader['reportAuthority'] as string)).toBe('verified_artifacts_v1');
    const baselineEvent = m.captureCalibrationRuntimeEvidenceEvent(structuredClone(f.start)) as Record<string, unknown>;
    expect((baselineEvent['sequence'] as number)).toBe(1);
    const cases: Array<{ name: string; run: () => unknown; foreign: unknown }> = [];
    const r1 = revokedRecord();
    cases.push({ name: 'captureHeader', run: () => m.captureCalibrationRuntimeEvidenceHeader(r1.proxy), foreign: r1.proxy });
    const r2 = revokedRecord();
    cases.push({ name: 'captureEvent', run: () => m.captureCalibrationRuntimeEvidenceEvent(r2.proxy), foreign: r2.proxy });
    const r3 = revokedRecord();
    cases.push({ name: 'encodeHeader', run: () => m.encodeCalibrationRuntimeEvidenceHeader(r3.proxy), foreign: r3.proxy });
    const r4 = revokedRecord();
    cases.push({ name: 'encodeEvent', run: () => m.encodeCalibrationRuntimeEvidenceEvent(r4.proxy), foreign: r4.proxy });
    const r5 = revokedRecord();
    cases.push({ name: 'hashBinding', run: () => m.hashCalibrationRuntimeEvidenceBinding(r5.proxy), foreign: r5.proxy });
    for (const c of cases) {
      let first: unknown;
      try {
        c.run();
      } catch (error) {
        first = error;
      }
      let second: unknown;
      try {
        c.run();
      } catch (error) {
        second = error;
      }
      expectOwnFreshFatal(first, c.foreign);
      expectOwnFreshFatal(second, c.foreign);
      expect(first === (second as unknown)).toBe(false);
      void c.name;
    }
  });

  it('normalizes revoked nested records without masking baseline validity', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const impl = ((f.header as unknown as Record<string, unknown>)['identity'] as Record<string, unknown>)['implementationCommit'] as string;
    const ownerBase = structuredClone((f.start as unknown as Record<string, unknown>)['owner']);
    const keyBase = structuredClone((f.start as unknown as Record<string, unknown>)['key']);
    const at = '2026-10-14T00:00:00.000Z';
    type NestedCase = { name: string; make: () => unknown; run: (root: unknown) => unknown };
    const cases: NestedCase[] = [
      {
        name: 'header.identity',
        make: () => {
          const h = structuredClone(f.header) as unknown as Record<string, unknown>;
          const r = revokedRecord();
          h['identity'] = r.proxy;
          return { root: h, foreign: r.proxy };
        },
        run: (wrapped: unknown) => {
          const w = wrapped as { root: unknown; foreign: unknown };
          return m.captureCalibrationRuntimeEvidenceHeader(w.root);
        },
      },
      {
        name: 'header.owner',
        make: () => {
          const h = structuredClone(f.header) as unknown as Record<string, unknown>;
          const r = revokedRecord();
          h['owner'] = r.proxy;
          return { root: h, foreign: r.proxy };
        },
        run: (wrapped: unknown) => {
          const w = wrapped as { root: unknown; foreign: unknown };
          return m.captureCalibrationRuntimeEvidenceHeader(w.root);
        },
      },
      {
        name: 'event.key',
        make: () => {
          const e = structuredClone(f.start) as unknown as Record<string, unknown>;
          const r = revokedRecord();
          e['key'] = r.proxy;
          return { root: e, foreign: r.proxy };
        },
        run: (wrapped: unknown) => {
          const w = wrapped as { root: unknown; foreign: unknown };
          return m.captureCalibrationRuntimeEvidenceEvent(w.root);
        },
      },
      {
        name: 'event.owner',
        make: () => {
          const e = structuredClone(f.start) as unknown as Record<string, unknown>;
          const r = revokedRecord();
          e['owner'] = r.proxy;
          return { root: e, foreign: r.proxy };
        },
        run: (wrapped: unknown) => {
          const w = wrapped as { root: unknown; foreign: unknown };
          return m.captureCalibrationRuntimeEvidenceEvent(w.root);
        },
      },
      {
        name: 'event.terminal',
        make: () => {
          const r = revokedRecord();
          return {
            root: {
              type: 'runtime_attempt_finished', version: 1, sequence: 5,
              owner: structuredClone(ownerBase), at,
              key: structuredClone(keyBase), attempt: 1, terminal: r.proxy,
            },
            foreign: r.proxy,
          };
        },
        run: (wrapped: unknown) => {
          const w = wrapped as { root: unknown; foreign: unknown };
          return m.captureCalibrationRuntimeEvidenceEvent(w.root);
        },
      },
      {
        name: 'event.disposition',
        make: () => {
          const r = revokedRecord();
          return {
            root: {
              type: 'runtime_attempt_abandoned', version: 1, sequence: 6,
              owner: structuredClone(ownerBase), at: '2026-10-14T00:00:05.000Z',
              key: structuredClone(keyBase), attempt: 1, disposition: r.proxy,
            },
            foreign: r.proxy,
          };
        },
        run: (wrapped: unknown) => {
          const w = wrapped as { root: unknown; foreign: unknown };
          return m.captureCalibrationRuntimeEvidenceEvent(w.root);
        },
      },
      {
        name: 'event.receipt',
        make: () => {
          const r = revokedRecord();
          return {
            root: {
              type: 'runtime_report_bound', version: 1, sequence: 7,
              owner: structuredClone(ownerBase), at: '2026-10-14T00:00:06.000Z',
              stage: 'preflight', profile: 'LOW', receipt: r.proxy,
              throughSequence: 6, bindingSha256: 'a'.repeat(64),
            },
            foreign: r.proxy,
          };
        },
        run: (wrapped: unknown) => {
          const w = wrapped as { root: unknown; foreign: unknown };
          return m.captureCalibrationRuntimeEvidenceEvent(w.root);
        },
      },
      {
        name: 'binding.events',
        make: () => {
          const { proxy, revoke } = Proxy.revocable([], {});
          revoke();
          const identity = structuredClone((f.header as unknown as Record<string, unknown>)['identity']);
          return {
            root: {
              version: 1, identity, stage: 'preflight', profile: 'LOW', throughSequence: 1,
              events: proxy,
              terminals: [{ key: structuredClone(keyBase), terminal: imageTerminal(2) }],
              receipt: validReceipt('preflight', 'LOW', impl),
            },
            foreign: proxy,
          };
        },
        run: (wrapped: unknown) => {
          const w = wrapped as { root: unknown; foreign: unknown };
          return m.hashCalibrationRuntimeEvidenceBinding(w.root);
        },
      },
      {
        name: 'binding.terminals',
        make: () => {
          const { proxy, revoke } = Proxy.revocable([], {});
          revoke();
          const identity = structuredClone((f.header as unknown as Record<string, unknown>)['identity']);
          return {
            root: {
              version: 1, identity, stage: 'preflight', profile: 'LOW', throughSequence: 1,
              events: [structuredClone(f.start) as unknown],
              terminals: proxy,
              receipt: validReceipt('preflight', 'LOW', impl),
            },
            foreign: proxy,
          };
        },
        run: (wrapped: unknown) => {
          const w = wrapped as { root: unknown; foreign: unknown };
          return m.hashCalibrationRuntimeEvidenceBinding(w.root);
        },
      },
    ];
    const baselineBinding = {
      version: 1,
      identity: structuredClone((f.header as unknown as Record<string, unknown>)['identity']),
      stage: 'preflight', profile: 'LOW', throughSequence: 1,
      events: [structuredClone(f.start) as unknown],
      terminals: [{ key: structuredClone(keyBase), terminal: imageTerminal(2) }],
      receipt: validReceipt('preflight', 'LOW', impl),
    };
    expect((m.hashCalibrationRuntimeEvidenceBinding(baselineBinding) as string)).toMatch(/^[0-9a-f]{64}$/);
    for (const c of cases) {
      const wrapped = c.make() as { root: unknown; foreign: unknown };
      let first: unknown;
      try {
        c.run(wrapped);
      } catch (error) {
        first = error;
      }
      let second: unknown;
      try {
        c.run(wrapped);
      } catch (error) {
        second = error;
      }
      expectOwnFreshFatal(first, wrapped.foreign);
      expectOwnFreshFatal(second, wrapped.foreign);
      expect(first === (second as unknown)).toBe(false);
      void c.name;
    }
  });
});

describe('binding array cap-before-indices regressions', () => {
  it('checks the events cap on the same length before reading indices', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const identity = structuredClone((f.header as unknown as Record<string, unknown>)['identity']);
    const impl = (identity as Record<string, unknown>)['implementationCommit'] as string;
    const keyBase = structuredClone((f.start as unknown as Record<string, unknown>)['key']) as Record<string, unknown>;
    const ownerBase = structuredClone((f.start as unknown as Record<string, unknown>)['owner']) as Record<string, unknown>;
    const smallBinding = {
      version: 1, identity: structuredClone(identity), stage: 'preflight', profile: 'LOW', throughSequence: 1,
      events: [structuredClone(f.start) as unknown],
      terminals: [{ key: structuredClone(keyBase), terminal: imageTerminal(2) }],
      receipt: validReceipt('preflight', 'LOW', impl),
    };
    expect((m.hashCalibrationRuntimeEvidenceBinding(smallBinding) as string)).toMatch(/^[0-9a-f]{64}$/);
    const target: unknown[] = [];
    for (let index = 1; index <= 4097; index += 1) {
      target.push({
        type: 'runtime_operation_started', version: 1, sequence: index,
        owner: structuredClone(ownerBase), at: '2026-10-14T00:00:00.000Z',
        key: structuredClone(keyBase), attempt: 1, operation: 'image',
      });
    }
    let lengthReads = 0;
    let indexReads = 0;
    let getCalls = 0;
    const eventsProxy = new Proxy(target, {
      getPrototypeOf(t) {
        return Reflect.getPrototypeOf(t);
      },
      ownKeys(t) {
        return Reflect.ownKeys(t);
      },
      getOwnPropertyDescriptor(t, p) {
        if (p === 'length') {
          lengthReads += 1;
          const d = Reflect.getOwnPropertyDescriptor(t, p) as PropertyDescriptor;
          if (lengthReads === 1) {
            return { ...d, value: 4096 };
          }
          return d;
        }
        if (typeof p === 'string' && /^\d+$/.test(p)) {
          indexReads += 1;
        }
        return Reflect.getOwnPropertyDescriptor(t, p);
      },
      get(t, p, r) {
        getCalls += 1;
        return Reflect.get(t, p, r);
      },
    });
    const input = {
      version: 1, identity: structuredClone(identity), stage: 'preflight', profile: 'LOW', throughSequence: 4097,
      events: eventsProxy,
      terminals: [{ key: structuredClone(keyBase), terminal: imageTerminal(5000) }],
      receipt: validReceipt('preflight', 'LOW', impl),
    };
    let thrown: unknown;
    try {
      m.hashCalibrationRuntimeEvidenceBinding(input);
    } catch (error) {
      thrown = error;
    }
    expectOwnFreshFatalFor(thrown, eventsProxy);
    expect(indexReads).toBe(0);
    expect(getCalls).toBe(0);
    expect(Object.isFrozen(target)).toBe(false);
    function expectOwnFreshFatalFor(error: unknown, foreign: unknown): void {
      const isForeign = error === (foreign as unknown);
      expect(isForeign).toBe(false);
      expect(isFreshFatal(error, foreign)).toBe(true);
    }
  });

  it('checks the terminals cap on the same length before reading indices', async () => {
    const f = await makeRuntimeEvidenceData();
    const m = await loadCodec();
    const identity = structuredClone((f.header as unknown as Record<string, unknown>)['identity']);
    const impl = (identity as Record<string, unknown>)['implementationCommit'] as string;
    const keyBase = structuredClone((f.start as unknown as Record<string, unknown>)['key']) as Record<string, unknown>;
    const smallBinding = {
      version: 1, identity: structuredClone(identity), stage: 'preflight', profile: 'LOW', throughSequence: 1,
      events: [structuredClone(f.start) as unknown],
      terminals: [{ key: structuredClone(keyBase), terminal: imageTerminal(2) }],
      receipt: validReceipt('preflight', 'LOW', impl),
    };
    expect((m.hashCalibrationRuntimeEvidenceBinding(smallBinding) as string)).toMatch(/^[0-9a-f]{64}$/);
    const rows: unknown[] = [];
    for (let index = 0; index <= 158; index += 1) {
      rows.push({ key: { stage: 'preflight', profile: 'LOW', caseId: `t3c-${String(index).padStart(3, '0')}`, sampleIndex: 1 }, terminal: imageTerminal(index + 2) });
    }
    let lengthReads = 0;
    let indexReads = 0;
    let getCalls = 0;
    const terminalsProxy = new Proxy(rows, {
      getPrototypeOf(t) {
        return Reflect.getPrototypeOf(t);
      },
      ownKeys(t) {
        return Reflect.ownKeys(t);
      },
      getOwnPropertyDescriptor(t, p) {
        if (p === 'length') {
          lengthReads += 1;
          const d = Reflect.getOwnPropertyDescriptor(t, p) as PropertyDescriptor;
          if (lengthReads === 1) {
            return { ...d, value: 158 };
          }
          return d;
        }
        if (typeof p === 'string' && /^\d+$/.test(p)) {
          indexReads += 1;
        }
        return Reflect.getOwnPropertyDescriptor(t, p);
      },
      get(t, p, r) {
        getCalls += 1;
        return Reflect.get(t, p, r);
      },
    });
    const input = {
      version: 1, identity: structuredClone(identity), stage: 'preflight', profile: 'LOW', throughSequence: 1,
      events: [structuredClone(f.start) as unknown],
      terminals: terminalsProxy,
      receipt: validReceipt('preflight', 'LOW', impl),
    };
    let thrown: unknown;
    try {
      m.hashCalibrationRuntimeEvidenceBinding(input);
    } catch (error) {
      thrown = error;
    }
    const isForeign = thrown === (terminalsProxy as unknown);
    expect(isForeign).toBe(false);
    expect(isFreshFatal(thrown, terminalsProxy)).toBe(true);
    expect(indexReads).toBe(0);
    expect(getCalls).toBe(0);
    expect(Object.isFrozen(rows)).toBe(false);
  });
});
