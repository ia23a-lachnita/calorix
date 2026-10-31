import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';
import type { CalibrationIdentity } from '../../src/nutrition-eval/calibration';
import { prepareCalibrationV2BootstrapContext, requireCalibrationV2Context } from '../../src/nutrition-eval/calibration-protocol-bindings';
import type { CalibrationV2PreparedContext } from '../../src/nutrition-eval/calibration-protocol-bindings';
import { captureCalibrationStageReportSnapshot, captureCalibrationStageReportSnapshotV2 } from '../../src/nutrition-eval/calibration-report-state';
import { captureCalibrationRuntimeEvidenceHeader, captureCalibrationRuntimeEvidenceHeaderV2,
  captureCalibrationRuntimeEvidenceEvent, captureCalibrationRuntimeEvidenceEventV2,
  encodeCalibrationRuntimeEvidenceHeader, encodeCalibrationRuntimeEvidenceHeaderV2,
  encodeCalibrationRuntimeEvidenceEvent, encodeCalibrationRuntimeEvidenceEventV2,
  hashCalibrationRuntimeEvidenceBinding, hashCalibrationRuntimeEvidenceBindingV2 } from '../../src/nutrition-eval/calibration-runtime-evidence-codec';
import { v2BootstrapFixture } from './helpers/calibration-v2-bootstrap-fixtures';
import { canonicalFixtureJson } from './helpers/calibration-v2-admission-fixtures';
import { legacyIdentity } from './helpers/calibration-v2-ledger-fixtures';

const trust = vi.hoisted(() => ({ sha: '', clients: 0, network: 0, writes: 0 }));
vi.mock('../../src/nutrition-eval/calibration-v2-lock', async original => ({
  ...await original<typeof import('../../src/nutrition-eval/calibration-v2-lock')>(),
  get CALIBRATION_ACTIVATION_LOCK_V2_SHA256() { return trust.sha; },
}));
vi.mock('@google/genai', async original => ({
  ...await original<typeof import('@google/genai')>(),
  GoogleGenAI: class { constructor() { trust.clients++; throw new Error('forbidden codec client'); } },
}));
beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => { trust.network++; throw new Error('forbidden codec fetch'); });
  for (const method of ['writeFile', 'mkdir', 'rename'] as const) {
    vi.spyOn(fs, method).mockImplementation(() => { trust.writes++; throw new Error('forbidden codec write'); });
  }
});
afterEach(() => {
  try { expect({ clients: trust.clients, network: trust.network, writes: trust.writes }).toEqual({ clients: 0, network: 0, writes: 0 }); }
  finally { vi.restoreAllMocks(); trust.clients = 0; trust.network = 0; trust.writes = 0; }
});
type Context = Readonly<CalibrationV2PreparedContext>;
const AT = '2026-10-30T00:00:00.000Z';
const OWNER = { hostname: 'fixture-host', bootId: '11111111-1111-4111-8111-111111111111',
  pid: 12345, startTicks: 987654, acquiredAt: AT };
async function context(tree?: string): Promise<Context> {
  const f = v2BootstrapFixture(); trust.sha = f.fixture.input.expectedActivationLockSha256;
  if (tree !== undefined) f.git.functionsTreeId = tree;
  return prepareCalibrationV2BootstrapContext(f.deps);
}
const header = (identity: CalibrationIdentity) => ({ type: 'protocol_identity', identity: { ...identity }, at: AT,
  reportAuthority: 'verified_artifacts_v1', runtimeEvidenceVersion: 1, owner: { ...OWNER } });
const snapshot = (identity: CalibrationIdentity) => ({ stage: 'preflight', profile: 'LOW', identity: { ...identity },
  counts: { imageCallsReserved: 0, imageCallsCompleted: 0, imageCallsFailed: 0, imageCallsPending: 0 }, images: [], nonReservations: [] });
const event = () => ({ type: 'runtime_attempt_started', version: 1, sequence: 1, owner: { ...OWNER }, at: AT,
  key: { stage: 'preflight', profile: 'LOW', caseId: 'calibration-dish_9001000004', sampleIndex: 1 }, attempt: 1 });
const binding = (identity: CalibrationIdentity) => ({ version: 1, identity: { ...identity }, stage: 'preflight', profile: 'LOW',
  throughSequence: 0, events: [], terminals: [], receipt: { stage: 'preflight', profile: 'LOW',
    runId: `calibration-preflight-low-${identity.implementationCommit.slice(0, 12)}-20261030T000000000Z`,
    jsonSha256: 'a'.repeat(64), markdownSha256: 'b'.repeat(64) } });

// Independent fixed bytes from the explicit legacyIdentity/OWNER data above,
// sorted once with Python's standard JSON encoder BEFORE codec refactoring.
// Neither expected bytes nor their pinned digest come from the codec.
const V1_HEADER_BYTES = '{"at":"2026-10-30T00:00:00.000Z","identity":{"datasetHash":"1111111111111111111111111111111111111111111111111111111111111111","functionsTreeId":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","hardCeiling":300,"historicalReferenceHash":"8888888888888888888888888888888888888888888888888888888888888888","implementationCommit":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","manifestHash":"5555555555555555555555555555555555555555555555555555555555555555","model":"gemini-3.8-flash","plannedImageCalls":146,"promptHash":"2222222222222222222222222222222222222222222222222222222222222222","protocolVersion":"v1","provider":"vertex-ai","publicManifestHash":"6666666666666666666666666666666666666666666666666666666666666666","responseSchemaHash":"3333333333333333333333333333333333333333333333333333333333333333","snapshotLockHash":"7777777777777777777777777777777777777777777777777777777777777777","sourceLockHash":"4444444444444444444444444444444444444444444444444444444444444444"},"owner":{"acquiredAt":"2026-10-30T00:00:00.000Z","bootId":"11111111-1111-4111-8111-111111111111","hostname":"fixture-host","pid":12345,"startTicks":987654},"reportAuthority":"verified_artifacts_v1","runtimeEvidenceVersion":1,"type":"protocol_identity"}';
const V1_HEADER_SHA256 = '778c4dbc1b2d3aa51769ea1f9f927237995b439115149f2583fdb40d3fc72e31';

describe('context-bound v2 identity codecs', () => {
  it('preserves_existing_v1_encoded_bytes', () => {
    const encoded = encodeCalibrationRuntimeEvidenceHeader(header(legacyIdentity()));
    expect(encoded).toBe(V1_HEADER_BYTES);
    expect(createHash('sha256').update(encoded, 'utf8').digest('hex')).toBe(V1_HEADER_SHA256);
  });
  it('rejects_v2_header_in_default_v1_codec_and_reverse', async () => {
    const c = await context();
    expect(() => captureCalibrationRuntimeEvidenceHeader(header(c.identity))).toThrow(CalibrationFatalError);
    expect(() => captureCalibrationRuntimeEvidenceHeaderV2(c, header(legacyIdentity()))).toThrow(CalibrationFatalError);
    expect(captureCalibrationRuntimeEvidenceHeaderV2(c, header(c.identity)).identity).toEqual(c.identity);
    expect(captureCalibrationRuntimeEvidenceHeader(header(legacyIdentity())).identity).toEqual(legacyIdentity());
  });
  it('encodes a complete v2 identity with the unchanged canonical header format', async () => {
    const c = await context(); const h = header(c.identity);
    const encoded = encodeCalibrationRuntimeEvidenceHeaderV2(c, h);
    expect(encoded).toBe(canonicalFixtureJson(h));
    expect(JSON.parse(encoded).identity).toEqual(c.identity);
    expect(encoded.endsWith('\n')).toBe(false);
    const reversed = Object.fromEntries(Object.entries(h).reverse());
    expect(encodeCalibrationRuntimeEvidenceHeaderV2(c, reversed)).toBe(encoded);
  });
  it('applies the same explicit protocol boundary to stage snapshots and binding hashes', async () => {
    const c = await context();
    expect(() => captureCalibrationStageReportSnapshot(snapshot(c.identity))).toThrow(CalibrationFatalError);
    expect(() => captureCalibrationStageReportSnapshotV2(c, snapshot(legacyIdentity()))).toThrow(CalibrationFatalError);
    expect(() => hashCalibrationRuntimeEvidenceBinding(binding(c.identity))).toThrow(CalibrationFatalError);
    expect(() => hashCalibrationRuntimeEvidenceBindingV2(c, binding(legacyIdentity()))).toThrow(CalibrationFatalError);
    expect(captureCalibrationStageReportSnapshotV2(c, snapshot(c.identity)).identity).toEqual(c.identity);
    expect(hashCalibrationRuntimeEvidenceBindingV2(c, binding(c.identity))).toMatch(/^[a-f0-9]{64}$/);
  });
  it('rejects all unregistered contexts before any payload reflection at all six entries', async () => {
    const c = await context(); let traps = 0;
    const payload = new Proxy({}, { getOwnPropertyDescriptor() { traps++; throw new Error('private payload'); },
      ownKeys() { traps++; throw new Error('private payload'); }, getPrototypeOf() { traps++; throw new Error('private payload'); } });
    const revoked = Proxy.revocable(c, {}); revoked.revoke();
    const accessor = Object.defineProperty({}, 'identity', { get() { traps++; throw new Error('private context'); } });
    const consumers: Array<(ctx: Context, value: unknown) => unknown> = [captureCalibrationStageReportSnapshotV2,
      captureCalibrationRuntimeEvidenceHeaderV2, captureCalibrationRuntimeEvidenceEventV2,
      encodeCalibrationRuntimeEvidenceHeaderV2, encodeCalibrationRuntimeEvidenceEventV2, hashCalibrationRuntimeEvidenceBindingV2];
    for (const value of [{ ...c }, structuredClone(c), new Proxy(c, {}), revoked.proxy, accessor, null, {}]) {
      for (const consumer of consumers) expect(() => consumer(value as Context, payload)).toThrow(CalibrationFatalError);
    }
    expect(traps).toBe(0);
  });
  it.each(Object.keys(legacyIdentity()) as Array<keyof CalibrationIdentity>)('rejects full identity drift at %s', async field => {
    const c = await context(); const bad = { ...c.identity, [field]: typeof c.identity[field] === 'number' ? 999
      : 'f'.repeat(field === 'implementationCommit' || field === 'functionsTreeId' ? 40 : 64) } as CalibrationIdentity;
    expect(() => captureCalibrationRuntimeEvidenceHeaderV2(c, header(bad))).toThrow(CalibrationFatalError);
    expect(() => captureCalibrationStageReportSnapshotV2(c, snapshot(bad))).toThrow(CalibrationFatalError);
    expect(() => hashCalibrationRuntimeEvidenceBindingV2(c, binding(bad))).toThrow(CalibrationFatalError);
  });
  it('owns and freezes copied payloads without treating them as registered contexts', async () => {
    const c = await context(); const input = header(c.identity); const raw = snapshot(c.identity);
    const h = captureCalibrationRuntimeEvidenceHeaderV2(c, input); const s = captureCalibrationStageReportSnapshotV2(c, raw);
    input.identity.manifestHash = 'f'.repeat(64); input.owner.hostname = 'changed'; raw.counts.imageCallsPending = 999;
    expect(h.identity).toEqual(c.identity); expect(h.owner).toEqual(OWNER); expect(s.counts.imageCallsPending).toBe(0);
    expect(Object.isFrozen(h)).toBe(true); expect(Object.isFrozen(h.identity)).toBe(true);
    expect(Object.isFrozen(s.counts)).toBe(true); expect(Object.isFrozen(s.images)).toBe(true);
    expect(() => requireCalibrationV2Context(h)).toThrow(CalibrationFatalError);
    expect(() => requireCalibrationV2Context(s)).toThrow(CalibrationFatalError);
  });
  it('keeps durable header owner structural instead of binding it to the current process owner', async () => {
    const c = await context(); const h = header(c.identity); h.owner.pid++;
    expect(captureCalibrationRuntimeEvidenceHeaderV2(c, h).owner.pid).toBe(h.owner.pid);
  });
  it('preserves shared identity-free event bytes while requiring a context at v2 entries', async () => {
    const c = await context(); const input = event();
    const before = encodeCalibrationRuntimeEvidenceEvent(input);
    expect(captureCalibrationRuntimeEvidenceEventV2(c, input)).toEqual(captureCalibrationRuntimeEvidenceEvent(input));
    expect(encodeCalibrationRuntimeEvidenceEventV2(c, input)).toBe(before);
  });
  it.each([0, 2, 99])('rejects unknown header and event format revision %s', async version => {
    const c = await context();
    expect(() => captureCalibrationRuntimeEvidenceHeaderV2(c, { ...header(c.identity), runtimeEvidenceVersion: version })).toThrow(CalibrationFatalError);
    expect(() => captureCalibrationRuntimeEvidenceEventV2(c, { ...event(), version })).toThrow(CalibrationFatalError);
    expect(() => hashCalibrationRuntimeEvidenceBindingV2(c, { ...binding(c.identity), version })).toThrow(CalibrationFatalError);
  });
  it('retains header size, exact-record and descriptor guards without invoking caller getters', async () => {
    const c = await context(); let getters = 0; const h = header(c.identity);
    Object.defineProperty(h, 'owner', { enumerable: true, get() { getters++; throw new Error('private owner'); } });
    expect(() => captureCalibrationRuntimeEvidenceHeaderV2(c, h)).toThrow(CalibrationFatalError); expect(getters).toBe(0);
    expect(() => encodeCalibrationRuntimeEvidenceHeaderV2(c, { ...header(c.identity), extra: true })).toThrow(CalibrationFatalError);
    expect(() => encodeCalibrationRuntimeEvidenceHeaderV2(c, { ...header(c.identity), owner: { ...OWNER, hostname: 'h'.repeat(17000) } })).toThrow(CalibrationFatalError);
  });
  it.each([-1, 1.5, Number.NaN])('retains numeric snapshot refinements for %s', async count => {
    const c = await context(); const s = snapshot(c.identity); s.counts.imageCallsReserved = count;
    expect(() => captureCalibrationStageReportSnapshotV2(c, s)).toThrow(CalibrationFatalError);
  });
  it('retains receipt implementation-prefix validation in binding hashes', async () => {
    const c = await context(); const b = binding(c.identity); b.receipt.runId = 'calibration-preflight-low-aaaaaaaaaaaa-20261030T000000000Z';
    expect(() => hashCalibrationRuntimeEvidenceBindingV2(c, b)).toThrow(CalibrationFatalError);
  });
  it('keeps interleaved contexts fully distinct and includes complete identity in the binding digest', async () => {
    const a = await context(); const b = await context('c'.repeat(40));
    const old = encodeCalibrationRuntimeEvidenceHeader(header(legacyIdentity()));
    const ah = hashCalibrationRuntimeEvidenceBindingV2(a, binding(a.identity));
    const bh = hashCalibrationRuntimeEvidenceBindingV2(b, binding(b.identity));
    expect(ah).not.toBe(bh);
    expect(() => captureCalibrationRuntimeEvidenceHeaderV2(a, header(b.identity))).toThrow(CalibrationFatalError);
    expect(() => hashCalibrationRuntimeEvidenceBindingV2(b, binding(a.identity))).toThrow(CalibrationFatalError);
    expect(hashCalibrationRuntimeEvidenceBindingV2(a, binding(a.identity))).toBe(ah);
    expect(encodeCalibrationRuntimeEvidenceHeader(header(legacyIdentity()))).toBe(old);
  });
});
