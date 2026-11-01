import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';
import { createProtocolCalibrationLedger, createRuntimeEvidenceCalibrationLedger, createBenchmarkAuthorityCalibrationLedger,
  createProtocolCalibrationLedgerV2, createRuntimeEvidenceCalibrationLedgerV2, createBenchmarkAuthorityCalibrationLedgerV2 } from '../../src/nutrition-eval/calibration';
import type { CalibrationLedgerDeps, CalibrationProtocolLedger, CalibrationRuntimeEvidenceLedger } from '../../src/nutrition-eval/calibration';
import type { CalibrationV2PreparedContext } from '../../src/nutrition-eval/calibration-protocol-bindings';
import { captureCalibrationReportPrediction } from '../../src/nutrition-eval/calibration-report-journal';
import { memoryWorld, V1_ROOT, V2_ROOT } from './helpers/calibration-v2-ledger-fixtures';
import { stateHeaderFixture } from './helpers/calibration-v2-state-fixtures';
import { strictLedgerFixture } from './helpers/calibration-v2-strict-ledger-fixtures';

const trust = vi.hoisted(() => ({ sha: '', clients: 0, network: 0, writes: 0 }));
vi.mock('../../src/nutrition-eval/calibration-v2-lock', async original => ({
  ...await original<typeof import('../../src/nutrition-eval/calibration-v2-lock')>(),
  get CALIBRATION_ACTIVATION_LOCK_V2_SHA256() { return trust.sha; },
}));
vi.mock('@google/genai', async original => ({ ...await original<typeof import('@google/genai')>(),
  GoogleGenAI: class { constructor() { trust.clients++; throw new Error('forbidden strict ledger SDK'); } } }));
beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => { trust.network++; throw new Error('forbidden strict ledger fetch'); });
  for (const method of ['writeFile', 'mkdir', 'rename'] as const) vi.spyOn(fs, method).mockImplementation(() => { trust.writes++; throw new Error('forbidden strict ledger file'); });
});
afterEach(() => {
  try { expect({ clients: trust.clients, network: trust.network, writes: trust.writes }).toEqual({ clients: 0, network: 0, writes: 0 }); }
  finally { vi.restoreAllMocks(); trust.clients = 0; trust.network = 0; trust.writes = 0; }
});
type Mode = 'protocol' | 'runtime' | 'benchmark';
type Fixture = Awaited<ReturnType<typeof strictLedgerFixture>>;
const modes = ['protocol', 'runtime', 'benchmark'] as const;
const fixture = () => strictLedgerFixture(sha => { trust.sha = sha; });
const legacy = (f: Fixture) => ({ ...f.context.identity, protocolVersion: 'v1', hardCeiling: 300 });
function createV1(mode: Mode, f: Fixture, deps: CalibrationLedgerDeps) {
  if (mode === 'protocol') return createProtocolCalibrationLedger(deps, legacy(f), f.resolver, f.reportOptions);
  if (mode === 'runtime') return createRuntimeEvidenceCalibrationLedger(deps, legacy(f), f.resolver, f.reportOptions, f.authorityOptions, f.runtimeOptions);
  return createBenchmarkAuthorityCalibrationLedger(deps, legacy(f), f.resolver, f.reportOptions, f.authorityOptions, f.runtimeOptions, f.config);
}
function createV2(mode: Mode, f: Fixture, deps: CalibrationLedgerDeps) {
  if (mode === 'protocol') return createProtocolCalibrationLedgerV2(f.context, deps, f.resolver, f.reportOptions);
  if (mode === 'runtime') return createRuntimeEvidenceCalibrationLedgerV2(f.context, deps, f.resolver, f.reportOptions, f.authorityOptions, f.runtimeOptions);
  return createBenchmarkAuthorityCalibrationLedgerV2(f.context, deps, f.resolver, f.reportOptions, f.authorityOptions, f.runtimeOptions, f.config);
}
function finishTokenCount(ledger: CalibrationProtocolLedger, f: Fixture) {
  const key = { kind: 'token_count' as const, stage: 'preflight' as const, caseId: f.key.caseId, model: f.context.identity.model };
  ledger.reserveTokenCount(key); ledger.completeTokenCount(key, 1200);
}
function finishDatasetFailure(ledger: CalibrationRuntimeEvidenceLedger, f: Fixture) {
  finishTokenCount(ledger, f);
  const ref = ledger.startRuntimeAttempt(f.key);
  ledger.startRuntimeOperation(ref, 'image'); ledger.settleRuntimeOperation(ref, 'image', 'failed');
  ledger.recordNonReservationResult({ key: f.key, reason: 'dataset', prediction: captureCalibrationReportPrediction({
    parseStatus: 'failure', source: 'meal', decision: 'error', failureCategory: 'dataset', failureCode: 'dataset_load_failed',
    latencyMs: 11, sampleIndex: f.key.sampleIndex, cached: false }) });
  ledger.finishRuntimeAttempt(ref);
}

describe('strict context-bound v2 ledger variants', () => {
  it.each(modes)('validates trusted fixture ports through existing structural v1 %s mode', async mode => {
    const f = await fixture(); const world = memoryWorld(V1_ROOT); const ledger = createV1(mode, f, world.deps);
    ledger.acquireLock(f.context.owner);
    expect(world.events[0]).toMatchObject({ type: 'protocol_identity', identity: legacy(f) });
    expect(ledger.getStageReportSnapshot('preflight', 'LOW').identity).toEqual(legacy(f));
    if (mode !== 'protocol') finishDatasetFailure(ledger as CalibrationRuntimeEvidenceLedger, f);
    expect(f.authorityOptions.verifyStageReportArtifacts).not.toHaveBeenCalled();
  });
  it.each(modes)('creates a frozen original-context %s v2 handle and full-identity header/snapshot', async mode => {
    const f = await fixture(); const world = memoryWorld(); const ledger = createV2(mode, f, world.deps);
    expect(Object.isFrozen(ledger)).toBe(true); ledger.acquireLock(f.context.owner);
    expect(world.events[0]).toMatchObject({ type: 'protocol_identity', identity: f.context.identity });
    expect(ledger.getStageReportSnapshot('preflight', 'LOW').identity).toEqual(f.context.identity);
    expect(ledger.getCounts()).toEqual({ imageReserved: 0, tokenCountReserved: 0 });
    expect(() => ledger.assertIdentity(legacy(f))).toThrow(CalibrationFatalError);
    expect(f.authorityOptions.verifyStageReportArtifacts).not.toHaveBeenCalled();
  });
  it('rejects forged contexts at every new factory before port or argument reflection', async () => {
    const f = await fixture(); let traps = 0;
    const port = new Proxy({}, { get() { traps++; throw new Error('private port'); },
      getOwnPropertyDescriptor() { traps++; throw new Error('private port'); }, ownKeys() { traps++; throw new Error('private port'); } });
    const revoked = Proxy.revocable(f.context, {}); revoked.revoke();
    const getter = Object.defineProperty({}, 'identity', { get() { traps++; throw new Error('private context'); } });
    for (const raw of [{ ...f.context }, structuredClone(f.context), new Proxy(f.context, {}), revoked.proxy, getter, {}, null]) {
      const ctx = raw as Readonly<CalibrationV2PreparedContext>; const deps = port as CalibrationLedgerDeps;
      expect(() => createProtocolCalibrationLedgerV2(ctx, deps, f.resolver, f.reportOptions)).toThrow(CalibrationFatalError);
      expect(() => createRuntimeEvidenceCalibrationLedgerV2(ctx, deps, f.resolver, f.reportOptions, f.authorityOptions, f.runtimeOptions)).toThrow(CalibrationFatalError);
      expect(() => createBenchmarkAuthorityCalibrationLedgerV2(ctx, deps, f.resolver, f.reportOptions, f.authorityOptions, f.runtimeOptions, f.config)).toThrow(CalibrationFatalError);
    }
    expect(traps).toBe(0); expect(f.resolver).not.toHaveBeenCalled(); expect(f.reportOptions.getReportOutcomePlan).not.toHaveBeenCalled();
    expect(f.runtimeOptions.readCurrentGitState).not.toHaveBeenCalled();
  });
  it.each(['runtime', 'benchmark'] as const)('runs a complete SDK-free dataset-failure trace in %s v2 state', async mode => {
    const f = await fixture(); const world = memoryWorld(); const ledger = createV2(mode, f, world.deps) as CalibrationRuntimeEvidenceLedger;
    ledger.acquireLock(f.context.owner); finishDatasetFailure(ledger, f);
    expect(ledger.getRuntimeEvidenceSnapshot()).toMatchObject({ sequence: 4, activeAttempt: null, owner: f.context.owner });
    const snapshot = ledger.getStageReportSnapshot('preflight', 'LOW');
    expect(snapshot.identity).toEqual(f.context.identity); expect(snapshot.nonReservations).toHaveLength(1);
    expect(ledger.getCounts()).toEqual({ imageReserved: 0, tokenCountReserved: 1 });
    expect(f.authorityOptions.verifyStageReportArtifacts).not.toHaveBeenCalled();
  });
  it.each(['runtime', 'benchmark'] as const)('replays a completed v2 %s history without downgrading its header/state', async mode => {
    const f = await fixture(); const world = memoryWorld();
    const first = createV2(mode, f, world.deps) as CalibrationRuntimeEvidenceLedger;
    first.acquireLock(f.context.owner); finishDatasetFailure(first, f); first.releaseLock(f.context.owner);
    const second = createV2(mode, f, world.deps) as CalibrationRuntimeEvidenceLedger;
    second.acquireLock(f.context.owner);
    expect(second.getRuntimeEvidenceSnapshot()).toMatchObject({ sequence: 4, activeAttempt: null });
    expect(second.getStageReportSnapshot('preflight', 'LOW').identity).toEqual(f.context.identity);
  });
  it.each(modes)('rejects a v2 identity in the default v1 %s constructor before persistence', async mode => {
    const f = await fixture(); const world = memoryWorld(V1_ROOT);
    const action = () => mode === 'protocol'
      ? createProtocolCalibrationLedger(world.deps, f.context.identity, f.resolver, f.reportOptions)
      : mode === 'runtime' ? createRuntimeEvidenceCalibrationLedger(world.deps, f.context.identity, f.resolver, f.reportOptions, f.authorityOptions, f.runtimeOptions)
        : createBenchmarkAuthorityCalibrationLedger(world.deps, f.context.identity, f.resolver, f.reportOptions, f.authorityOptions, f.runtimeOptions, f.config);
    expect(action).toThrow('calibration:identity-invalid:protocolVersion'); expect(world.writes).toEqual([]);
  });
  it.each(['runtime', 'benchmark'] as const)('rejects a structurally valid v1 header at the v2 %s replay boundary', async mode => {
    const f = await fixture(); const old = memoryWorld(V1_ROOT); old.events.push(stateHeaderFixture(legacy(f), f.context.owner));
    const baseline = createV1(mode, f, old.deps); baseline.acquireLock(f.context.owner);
    const world = memoryWorld(); world.events.push(stateHeaderFixture(legacy(f), f.context.owner));
    expect(() => createV2(mode, f, world.deps)).toThrow(CalibrationFatalError); expect(world.writes).toEqual([]);
  });
  it.each(['runtime', 'benchmark'] as const)('forbids synthetic %s reservations before descriptor reflection with a valid lock/source', async mode => {
    const f = await fixture(); const world = memoryWorld(); const ledger = createV2(mode, f, world.deps);
    ledger.acquireLock(f.context.owner); expect(ledger.getCounts()).toEqual({ imageReserved: 0, tokenCountReserved: 0 });
    expect(world.events[0]).toMatchObject({ identity: f.context.identity }); const count = world.events.length;
    let traps = 0; const onFatal = vi.fn(); const descriptor = new Proxy({ reason: 'probe', index: 0 }, {
      getOwnPropertyDescriptor() { traps++; throw new Error('private descriptor'); }, ownKeys() { traps++; throw new Error('private descriptor'); },
      getPrototypeOf() { traps++; throw new Error('private descriptor'); },
    });
    expect(() => ledger.reserveSynthetic(descriptor, onFatal)).toThrow('calibration:runtime-operation-failed');
    // The evidence wrapper poisons on failure; inspect injected persistence,
    // not another ledger method that would itself reject after poisoning.
    expect(traps).toBe(0); expect(onFatal).not.toHaveBeenCalled(); expect(world.events).toHaveLength(count);
    expect(f.runtimeOptions.readCurrentGitState).toHaveBeenCalled();
  });
  it('keeps interleaved v1/v2 strict protocol handles independent', async () => {
    const f = await fixture(); const a = memoryWorld(V1_ROOT); const b = memoryWorld(V2_ROOT);
    const one = createV1('protocol', f, a.deps); const two = createV2('protocol', f, b.deps);
    one.acquireLock(f.context.owner); two.acquireLock(f.context.owner);
    finishTokenCount(one, f); finishTokenCount(two, f); two.reserve(f.key);
    expect(one.getCounts().imageReserved).toBe(0); expect(two.getCounts().imageReserved).toBe(1);
    one.reserve(f.key); expect(one.getCounts().imageReserved).toBe(1);
    expect(one.getStageReportSnapshot('preflight', 'LOW').identity).toEqual(legacy(f));
    expect(two.getStageReportSnapshot('preflight', 'LOW').identity).toEqual(f.context.identity);
  });
});
