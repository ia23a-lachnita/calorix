import { describe, expect, it, vi } from 'vitest';
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';
import {
  createCalibrationLedger,
  createCalibrationLedgerV2,
  createProtocolCalibrationLedgerV2,
  createRuntimeEvidenceCalibrationLedgerV2,
  createBenchmarkAuthorityCalibrationLedgerV2,
  requireMatchingCalibrationV2Ledger,
} from '../../src/nutrition-eval/calibration';
import type { CalibrationLedgerDeps } from '../../src/nutrition-eval/calibration';
import type { CalibrationV2PreparedContext } from '../../src/nutrition-eval/calibration-protocol-bindings';
import { memoryWorld, V1_ROOT } from './helpers/calibration-v2-ledger-fixtures';
import { strictLedgerFixture } from './helpers/calibration-v2-strict-ledger-fixtures';

// Only the trusted activation-lock pin is mocked. Admission, registration,
// identity, ledger and guard algorithms all run for real in this file.
const trust = vi.hoisted(() => ({ sha: '' }));
vi.mock('../../src/nutrition-eval/calibration-v2-lock', async original => ({
  ...await original<typeof import('../../src/nutrition-eval/calibration-v2-lock')>(),
  get CALIBRATION_ACTIVATION_LOCK_V2_SHA256() { return trust.sha; },
}));

const fixture = () => strictLedgerFixture(sha => { trust.sha = sha; });
type Fixture = Awaited<ReturnType<typeof strictLedgerFixture>>;
type World = ReturnType<typeof memoryWorld>;
type Mode = 'base' | 'protocol' | 'runtime' | 'benchmark';
const modes: readonly Mode[] = ['base', 'protocol', 'runtime', 'benchmark'];

function createHandle(mode: Mode, f: Fixture, deps: CalibrationLedgerDeps): unknown {
  if (mode === 'base') return createCalibrationLedgerV2(f.context, deps, [f.key]);
  if (mode === 'protocol') return createProtocolCalibrationLedgerV2(f.context, deps, f.resolver, f.reportOptions);
  if (mode === 'runtime') {
    return createRuntimeEvidenceCalibrationLedgerV2(f.context, deps, f.resolver, f.reportOptions, f.authorityOptions, f.runtimeOptions);
  }
  return createBenchmarkAuthorityCalibrationLedgerV2(f.context, deps, f.resolver, f.reportOptions, f.authorityOptions, f.runtimeOptions, f.config);
}

function worldSnapshot(world: World) {
  return { calls: world.calls.length, writes: world.writes.length, events: world.events.length };
}

function callbackSnapshot(f: Fixture) {
  return {
    resolver: f.resolver.mock.calls.length,
    getReportOutcomePlan: f.reportOptions.getReportOutcomePlan.mock.calls.length,
    verifyStageReportArtifacts: f.authorityOptions.verifyStageReportArtifacts.mock.calls.length,
    readCurrentGitState: f.runtimeOptions.readCurrentGitState.mock.calls.length,
  };
}

function expectFatal(action: () => void, code: string): void {
  let caught: unknown;
  try { action(); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(CalibrationFatalError);
  const error = caught as CalibrationFatalError;
  expect(error.message).toBe(code);
  expect(error.cause).toBeUndefined();
  expect(error.message).not.toContain('PRIVATE');
}

describe('requireMatchingCalibrationV2Ledger original-context/handle pairing guard', () => {
  it.each(modes)('accepts the real originally-paired %s handle, returns undefined, and leaves injected persistence unchanged', async mode => {
    const f = await fixture();
    const world = memoryWorld();
    const handle = createHandle(mode, f, world.deps);
    const before = worldSnapshot(world);
    const callbacksBefore = callbackSnapshot(f);
    expect(requireMatchingCalibrationV2Ledger(f.context, handle)).toBeUndefined();
    expect(worldSnapshot(world)).toEqual(before);
    expect(callbackSnapshot(f)).toEqual(callbacksBefore);
  });

  it('proves two separately admitted contexts are identity-value-equal but reference-distinct, with correct pairs accepted and crossed pairs rejected', async () => {
    const a = await fixture();
    const b = await fixture();
    expect(a.context).not.toBe(b.context);
    expect(a.context.identity).toEqual(b.context.identity);
    expect(a.context.identity).not.toBe(b.context.identity);
    for (const mode of modes) {
      const worldA = memoryWorld();
      const worldB = memoryWorld();
      const handleA = createHandle(mode, a, worldA.deps);
      const handleB = createHandle(mode, b, worldB.deps);
      const callbacksABefore = callbackSnapshot(a);
      const callbacksBBefore = callbackSnapshot(b);
      expect(requireMatchingCalibrationV2Ledger(a.context, handleA)).toBeUndefined();
      expect(requireMatchingCalibrationV2Ledger(b.context, handleB)).toBeUndefined();
      expectFatal(() => requireMatchingCalibrationV2Ledger(a.context, handleB), 'calibration:v2-ledger-context-mismatch');
      expectFatal(() => requireMatchingCalibrationV2Ledger(b.context, handleA), 'calibration:v2-ledger-context-mismatch');
      expect(callbackSnapshot(a)).toEqual(callbacksABefore);
      expect(callbackSnapshot(b)).toEqual(callbacksBBefore);
    }
  });

  const invalidContextCases: ReadonlyArray<{ name: string; make: (ctx: Readonly<CalibrationV2PreparedContext>) => unknown }> = [
    { name: 'shallow clone of the context', make: ctx => ({ ...ctx }) },
    { name: 'structuredClone of the context', make: ctx => structuredClone(ctx) },
    { name: 'transparent Proxy of the context', make: ctx => new Proxy(ctx, {}) },
    { name: 'revoked Proxy of the context', make: ctx => { const r = Proxy.revocable(ctx, {}); r.revoke(); return r.proxy; } },
    { name: 'getter object pretending to hold identity', make: () => Object.defineProperty({}, 'identity', {
      enumerable: true, get() { throw new Error('must not read a bad context'); } }) },
    { name: 'raw report data', make: ctx => ctx.report },
    { name: 'raw identity data', make: ctx => ctx.identity },
    { name: 'number primitive', make: () => 42 },
    { name: 'string primitive', make: () => 'context' },
    { name: 'boolean primitive', make: () => true },
    { name: 'null', make: () => null },
    { name: 'undefined', make: () => undefined },
    { name: 'function value', make: () => function fakeContext() { /* not a context */ } },
  ];
  it.each(invalidContextCases)('rejects an unregistered context ($name) as v2-context-unregistered before any trap on the supplied handle', async ({ make }) => {
    const f = await fixture();
    const world = memoryWorld();
    const realHandle = createHandle('protocol', f, world.deps);
    let traps = 0;
    const guardedHandle = new Proxy(realHandle as object, {
      get() { traps++; throw new Error('must not touch the handle'); },
      has() { traps++; throw new Error('must not touch the handle'); },
      getOwnPropertyDescriptor() { traps++; throw new Error('must not touch the handle'); },
      ownKeys() { traps++; throw new Error('must not touch the handle'); },
    });
    const badContext = make(f.context) as Readonly<CalibrationV2PreparedContext>;
    const callbacksBefore = callbackSnapshot(f);
    expectFatal(() => requireMatchingCalibrationV2Ledger(badContext, guardedHandle), 'calibration:v2-context-unregistered');
    expect(traps).toBe(0);
    expect(callbackSnapshot(f)).toEqual(callbacksBefore);
  });

  const invalidHandleCases: ReadonlyArray<{ name: string; make: (handle: unknown, ctx: Readonly<CalibrationV2PreparedContext>) => unknown }> = [
    { name: 'shallow clone of the real handle', make: handle => ({ ...(handle as object) }) },
    { name: 'Object.create of the real handle', make: handle => Object.create(handle as object) },
    { name: 'transparent Proxy of the real handle', make: handle => new Proxy(handle as object, {}) },
    { name: 'revoked Proxy of the real handle', make: handle => { const r = Proxy.revocable(handle as object, {}); r.revoke(); return r.proxy; } },
    { name: 'getter object pretending to be a handle', make: () => Object.defineProperty({}, 'acquireLock', {
      enumerable: true, get() { throw new Error('must not read a bad handle'); } }) },
    { name: 'raw report-shaped object', make: (_handle, ctx) => ({ ...ctx.report }) },
    { name: 'parsed JSON of the real handle', make: handle => JSON.parse(JSON.stringify(handle)) },
    { name: 'number primitive', make: () => 42 },
    { name: 'string primitive', make: () => 'handle' },
    { name: 'boolean primitive', make: () => true },
    { name: 'null', make: () => null },
    { name: 'undefined', make: () => undefined },
    { name: 'function value', make: () => function fakeHandle() { /* not a handle */ } },
  ];
  it.each(invalidHandleCases)('rejects a mismatched handle ($name) against a validly registered context as v2-ledger-context-mismatch with no persistence', async ({ make }) => {
    const f = await fixture();
    const world = memoryWorld();
    const realHandle = createHandle('runtime', f, world.deps);
    const before = worldSnapshot(world);
    const callbacksBefore = callbackSnapshot(f);
    const badHandle = make(realHandle, f.context);
    expectFatal(() => requireMatchingCalibrationV2Ledger(f.context, badHandle), 'calibration:v2-ledger-context-mismatch');
    expect(worldSnapshot(world)).toEqual(before);
    expect(callbackSnapshot(f)).toEqual(callbacksBefore);
  });

  it('rejects an instrumented-Proxy-wrapped real handle and a throwing-getter fake handle, after a positive control proves the real pair matches, without ever reflecting into the handle', async () => {
    const f = await fixture();
    const world = memoryWorld();
    const realHandle = createHandle('runtime', f, world.deps);
    const before = worldSnapshot(world);
    const callbacksBefore = callbackSnapshot(f);

    expect(requireMatchingCalibrationV2Ledger(f.context, realHandle)).toBeUndefined();
    expect(worldSnapshot(world)).toEqual(before);
    expect(callbackSnapshot(f)).toEqual(callbacksBefore);

    let proxyTraps = 0;
    const instrumentedHandle = new Proxy(realHandle as object, {
      get() { proxyTraps++; throw new Error('PRIVATE'); },
      has() { proxyTraps++; throw new Error('PRIVATE'); },
      ownKeys() { proxyTraps++; throw new Error('PRIVATE'); },
      getOwnPropertyDescriptor() { proxyTraps++; throw new Error('PRIVATE'); },
      getPrototypeOf() { proxyTraps++; throw new Error('PRIVATE'); },
    });
    expectFatal(() => requireMatchingCalibrationV2Ledger(f.context, instrumentedHandle), 'calibration:v2-ledger-context-mismatch');
    expect(proxyTraps).toBe(0);
    expect(worldSnapshot(world)).toEqual(before);
    expect(callbackSnapshot(f)).toEqual(callbacksBefore);

    let getterReads = 0;
    const getterHandle = Object.defineProperty({}, 'acquireLock', {
      enumerable: true,
      get() { getterReads++; throw new Error('PRIVATE'); },
    });
    expectFatal(() => requireMatchingCalibrationV2Ledger(f.context, getterHandle), 'calibration:v2-ledger-context-mismatch');
    expect(getterReads).toBe(0);
    expect(worldSnapshot(world)).toEqual(before);
    expect(callbackSnapshot(f)).toEqual(callbacksBefore);
  });

  it('rejects a legacy v1 handle built from the same identity values as v2-ledger-context-mismatch with no effects', async () => {
    const f = await fixture();
    const v1World = memoryWorld(V1_ROOT);
    const legacyHandle = createCalibrationLedger(
      v1World.deps, { ...f.context.identity, protocolVersion: 'v1', hardCeiling: 300 }, [f.key],
    );
    const before = worldSnapshot(v1World);
    const callbacksBefore = callbackSnapshot(f);
    expectFatal(() => requireMatchingCalibrationV2Ledger(f.context, legacyHandle), 'calibration:v2-ledger-context-mismatch');
    expect(worldSnapshot(v1World)).toEqual(before);
    expect(callbackSnapshot(f)).toEqual(callbacksBefore);
  });
});
