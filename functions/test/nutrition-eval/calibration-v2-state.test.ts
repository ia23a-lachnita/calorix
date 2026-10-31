import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';
import { prepareCalibrationV2BootstrapContext, requireCalibrationV2Context } from '../../src/nutrition-eval/calibration-protocol-bindings';
import type { CalibrationV2PreparedContext } from '../../src/nutrition-eval/calibration-protocol-bindings';
import { prepareCalibrationRuntimeEvidenceState, prepareCalibrationRuntimeEvidenceStateV2 } from '../../src/nutrition-eval/calibration-runtime-evidence-state';
import type { CalibrationRuntimeEvidenceState } from '../../src/nutrition-eval/calibration-runtime-evidence-state';
import { hashCalibrationRuntimeEvidenceBindingV2 } from '../../src/nutrition-eval/calibration-runtime-evidence-codec';
import { v2BootstrapFixture } from './helpers/calibration-v2-bootstrap-fixtures';
import { legacyIdentity } from './helpers/calibration-v2-ledger-fixtures';
import { datasetFailureFrames, stateHeaderFixture, statePlansFixture } from './helpers/calibration-v2-state-fixtures';

const trust = vi.hoisted(() => ({ sha: '', clients: 0, network: 0, writes: 0 }));
vi.mock('../../src/nutrition-eval/calibration-v2-lock', async original => ({
  ...await original<typeof import('../../src/nutrition-eval/calibration-v2-lock')>(),
  get CALIBRATION_ACTIVATION_LOCK_V2_SHA256() { return trust.sha; },
}));
vi.mock('@google/genai', async original => ({ ...await original<typeof import('@google/genai')>(),
  GoogleGenAI: class { constructor() { trust.clients++; throw new Error('forbidden state SDK'); } } }));
beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => { trust.network++; throw new Error('forbidden state network'); });
  for (const method of ['writeFile', 'mkdir', 'rename'] as const) vi.spyOn(fs, method).mockImplementation(() => { trust.writes++; throw new Error('forbidden state write'); });
});
afterEach(() => {
  try { expect({ clients: trust.clients, network: trust.network, writes: trust.writes }).toEqual({ clients: 0, network: 0, writes: 0 }); }
  finally { vi.restoreAllMocks(); trust.clients = 0; trust.network = 0; trust.writes = 0; }
});
async function fixture() {
  const f = v2BootstrapFixture(); trust.sha = f.fixture.input.expectedActivationLockSha256;
  const context = await prepareCalibrationV2BootstrapContext(f.deps);
  const plans = statePlansFixture(f); const header = stateHeaderFixture(context.identity, context.owner);
  const frames = datasetFailureFrames(plans.initial[0]!.key, header.owner);
  return { context, plans, header, frames };
}
function complete(state: Readonly<CalibrationRuntimeEvidenceState>, frames: unknown[]) {
  return frames.reduce<Readonly<CalibrationRuntimeEvidenceState>>((current, frame) => current.preview(frame), state);
}

describe('registered v2 runtime evidence state', () => {
  it('validates the independent fixture and complete frame sequence through the unchanged v1 state', async () => {
    const f = await fixture();
    expect(f.plans.initial).toHaveLength(50);
    for (const profile of ['LOW', 'MEDIUM'] as const) {
      expect(f.plans[profile]).toHaveLength(158);
      expect(f.plans[profile].filter(r => r.scanMode === 'barcode')).toHaveLength(12);
      expect(f.plans[profile].filter(r => r.scanMode !== 'barcode')).toHaveLength(146);
    }
    const state = prepareCalibrationRuntimeEvidenceState({ header: stateHeaderFixture(legacyIdentity(), f.context.owner), plans: f.plans });
    const done = complete(state, f.frames);
    expect(done.snapshot()).toMatchObject({ sequence: 4, lastEventIndex: 6, activeAttempt: null });
    expect(done.pairInput('preflight', 'LOW', 4).identity).toEqual(legacyIdentity());
  });
  it('creates an immutable initial v2 state without exposing context authority', async () => {
    const f = await fixture(); const state = prepareCalibrationRuntimeEvidenceStateV2(f.context, { header: f.header, plans: f.plans });
    expect(state.snapshot()).toEqual({ sequence: 0, lastEventIndex: 1, owner: f.header.owner, activeAttempt: null, events: [] });
    expect(Object.isFrozen(state)).toBe(true); expect(Object.isFrozen(state.snapshot().owner)).toBe(true);
    expect(() => requireCalibrationV2Context(state)).toThrow(CalibrationFatalError);
  });
  it('retains original v2 identity across every preview and a complete pair binding', async () => {
    const f = await fixture(); const initial = prepareCalibrationRuntimeEvidenceStateV2(f.context, { header: f.header, plans: f.plans });
    const before = initial.snapshot(); const done = complete(initial, f.frames);
    expect(initial.snapshot()).toEqual(before);
    expect(done.snapshot()).toMatchObject({ sequence: 4, lastEventIndex: 6, owner: f.header.owner, activeAttempt: null });
    const pair = done.pairInput('preflight', 'LOW', 4);
    expect(pair.identity).toEqual(f.context.identity); expect(pair.events).toHaveLength(4); expect(pair.terminals).toHaveLength(1);
    const receipt = { stage: 'preflight', profile: 'LOW', runId: `calibration-preflight-low-${f.context.identity.implementationCommit.slice(0, 12)}-20261030T000000000Z`,
      jsonSha256: 'a'.repeat(64), markdownSha256: 'b'.repeat(64) };
    expect(hashCalibrationRuntimeEvidenceBindingV2(f.context, { ...pair, receipt })).toMatch(/^[a-f0-9]{64}$/);
    expect(() => requireCalibrationV2Context(pair)).toThrow(CalibrationFatalError);
  });
  it('rejects v2 headers in the default v1 state and v1 headers at the v2 boundary', async () => {
    const f = await fixture();
    expect(() => prepareCalibrationRuntimeEvidenceState({ header: f.header, plans: f.plans })).toThrow(CalibrationFatalError);
    expect(() => prepareCalibrationRuntimeEvidenceStateV2(f.context, { header: stateHeaderFixture(legacyIdentity(), f.context.owner), plans: f.plans })).toThrow(CalibrationFatalError);
  });
  it('rejects unregistered contexts before payload reflection', async () => {
    const f = await fixture(); let traps = 0;
    const payload = new Proxy({}, { ownKeys() { traps++; throw new Error('private payload'); }, getPrototypeOf() { traps++; throw new Error('private payload'); } });
    const revoked = Proxy.revocable(f.context, {}); revoked.revoke();
    const accessor = Object.defineProperty({}, 'identity', { get() { traps++; throw new Error('private context'); } });
    for (const value of [{ ...f.context }, structuredClone(f.context), new Proxy(f.context, {}), revoked.proxy, accessor, {}, null])
      expect(() => prepareCalibrationRuntimeEvidenceStateV2(value as Readonly<CalibrationV2PreparedContext>, payload)).toThrow(CalibrationFatalError);
    expect(traps).toBe(0);
  });
  it('checks every full identity field through the state entry', async () => {
    const f = await fixture();
    for (const field of Object.keys(f.context.identity) as Array<keyof typeof f.context.identity>) {
      const value = f.context.identity[field];
      const bad = typeof value === 'number' ? 999 : 'f'.repeat(field === 'implementationCommit' || field === 'functionsTreeId' ? 40 : 64);
      expect(() => prepareCalibrationRuntimeEvidenceStateV2(f.context, { header: { ...f.header, identity: { ...f.header.identity, [field]: bad } }, plans: f.plans }))
        .toThrow(CalibrationFatalError);
    }
  });
  it('retains transition order checks and leaves the original unchanged after rejection', async () => {
    const f = await fixture(); const state = prepareCalibrationRuntimeEvidenceStateV2(f.context, { header: f.header, plans: f.plans });
    const before = state.snapshot(); expect(() => state.preview({ ...f.frames[0], eventIndex: 3 })).toThrow(CalibrationFatalError);
    expect(state.snapshot()).toEqual(before);
    const first = state.preview(f.frames[0]); expect(first.snapshot().sequence).toBe(1);
    expect(() => first.preview(f.frames[0])).toThrow(CalibrationFatalError);
    expect(first.snapshot().sequence).toBe(1); expect(state.snapshot().sequence).toBe(0);
  });
  it('keeps durable owners structural and supports the existing lock handoff fact', async () => {
    const f = await fixture(); const owner = { ...f.context.owner, pid: f.context.owner.pid + 1 };
    const state = prepareCalibrationRuntimeEvidenceStateV2(f.context, { header: { ...f.header, owner }, plans: f.plans });
    expect(state.snapshot().owner).toEqual(owner);
    const next = state.preview({ kind: 'lock_recovery', eventIndex: 2, staleOwner: owner, recoveringOwner: f.context.owner });
    expect(next.snapshot().owner).toEqual(f.context.owner); expect(state.snapshot().owner).toEqual(owner);
  });
  it.each(['initial-length', 'prefix', 'tail-mode', 'sparse'] as const)('retains structural plan refinement for %s', async kind => {
    const f = await fixture(); const plans = structuredClone(f.plans);
    if (kind === 'initial-length') (plans.initial as unknown[]).pop();
    if (kind === 'prefix') (plans.LOW[0]!.key as { caseId: string }).caseId = 'foreign-case';
    if (kind === 'tail-mode') (plans.LOW[50]! as { scanMode: string }).scanMode = 'barcode';
    if (kind === 'sparse') delete (plans.MEDIUM as unknown[])[100];
    expect(() => prepareCalibrationRuntimeEvidenceStateV2(f.context, { header: f.header, plans })).toThrow(CalibrationFatalError);
  });
  it('owns input headers and plans before caller mutation', async () => {
    const f = await fixture(); const state = prepareCalibrationRuntimeEvidenceStateV2(f.context, { header: f.header, plans: f.plans });
    f.header.owner.hostname = 'changed'; f.header.identity.manifestHash = 'f'.repeat(64);
    (f.plans.initial[0]!.key as { caseId: string }).caseId = 'changed';
    const done = complete(state, f.frames);
    expect(done.pairInput('preflight', 'LOW', 4).identity).toEqual(f.context.identity);
    expect(done.snapshot().owner.hostname).toBe(f.context.owner.hostname);
  });
  it('keeps interleaved v1/v2 states and pair identities separate', async () => {
    const f = await fixture();
    const one = prepareCalibrationRuntimeEvidenceState({ header: stateHeaderFixture(legacyIdentity(), f.context.owner), plans: f.plans });
    const two = prepareCalibrationRuntimeEvidenceStateV2(f.context, { header: f.header, plans: f.plans });
    const doneTwo = complete(two, f.frames); expect(one.snapshot().sequence).toBe(0);
    const doneOne = complete(one, f.frames);
    expect(doneOne.pairInput('preflight', 'LOW', 4).identity).toEqual(legacyIdentity());
    expect(doneTwo.pairInput('preflight', 'LOW', 4).identity).toEqual(f.context.identity);
  });
  it('rejects malformed payload descriptors without calling getters or retaining foreign errors', async () => {
    const f = await fixture(); let getters = 0;
    const params = Object.defineProperty({ plans: f.plans }, 'header', { enumerable: true, get() { getters++; throw new Error('private header'); } });
    let caught: unknown;
    try { prepareCalibrationRuntimeEvidenceStateV2(f.context, params); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(CalibrationFatalError); expect((caught as Error).message).not.toContain('private'); expect(getters).toBe(0);
    expect(Object.hasOwn(caught as object, 'cause')).toBe(false);
  });
});
