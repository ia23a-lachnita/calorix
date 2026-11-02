import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { rmSync } from 'node:fs';
import {
  prepareCalibrationRuntimeCapabilities, prepareCalibrationRuntimeCapabilitiesV2,
} from '../../src/nutrition-eval/calibration-runtime-capabilities';
import type { CalibrationOutcomeCapabilities } from '../../src/nutrition-eval/calibration-runtime-capabilities';
import type { CalibrationV2PreparedContext } from '../../src/nutrition-eval/calibration-protocol-bindings';
import type { CalibrationProfile } from '../../src/nutrition-eval/calibration';
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';
import { buildRuntimeHarness } from './calibration-runtime-capabilities-fixtures';
import type { RuntimeHarness } from './calibration-runtime-capabilities-fixtures';
import { nativeV2RuntimeFixture } from './helpers/calibration-v2-native-runtime-fixtures';

const trust = vi.hoisted(() => ({ sha: '' }));
vi.mock('../../src/nutrition-eval/calibration-v2-lock', async original => ({
  ...await original<typeof import('../../src/nutrition-eval/calibration-v2-lock')>(),
  get CALIBRATION_ACTIVATION_LOCK_V2_SHA256() { return trust.sha; },
}));
const roots: string[] = [];
let f: Awaited<ReturnType<typeof nativeV2RuntimeFixture>>;
beforeAll(async () => { f = await nativeV2RuntimeFixture(roots, sha => { trust.sha = sha; }); }, 120000);
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
function ports(h: RuntimeHarness, selectedProfile?: CalibrationProfile) {
  return { loadImage: h.deps.loadImage, generateVision: h.deps.generateVision,
    reserveImage: h.deps.reserveImage, onModelVersion: h.deps.onModelVersion, lookupSnapshot: h.deps.lookupSnapshot,
    ...(selectedProfile === undefined ? {} : { selectedProfile }) };
}
const request = { prompt: 'fixture prompt', imageBase64: Buffer.from([1, 2, 3]).toString('base64') };
const INVALID = 'calibration:runtime-input-invalid';

describe('registered V2 runtime capability planner boundary', () => {
  it('independent V1 primitive baseline runs a real mediated lease with a fake SDK port', async () => {
    const h = await buildRuntimeHarness(); const runtime = prepareCalibrationRuntimeCapabilities(h.deps);
    expect(runtime.getPlannedOutcomes()).toHaveLength(50);
    const result = await runtime.runOutcome(h.plan[0]!.key, async caps => {
      expect(await caps.loadImage()).toEqual(new Uint8Array([1, 2, 3]));
      return caps.generateVision(request);
    });
    expect(result).toBe('{"fixture":true}');
    expect(h.calls).toEqual(['image', 'reserve', 'sdk', 'metadata']);
  });

  it.each([undefined, 'LOW', 'MEDIUM'] as const)('derives exact source-owned order and counts for %s without caller files', async selected => {
    const h = await buildRuntimeHarness(selected);
    const runtime = prepareCalibrationRuntimeCapabilitiesV2(f.context, ports(h, selected));
    const training = JSON.parse(f.context.files['calibration-manifest']) as { cases: Array<{ id: string; group: string }> };
    const publicCases = (JSON.parse(f.context.files['public-manifest']) as { cases: Array<{ id: string; scanMode: string }> }).cases;
    const row = (stage: string, profile: CalibrationProfile, caseId: string, sampleIndex: number, scanMode: string) => ({ key: { stage, profile, caseId, sampleIndex }, scanMode });
    const expected = (['LOW', 'MEDIUM'] as const).map(p => row('preflight', p, f.context.firstDevelopmentCaseId, 1, 'meal'));
    for (const c of training.cases.filter(c => c.group === 'development')) for (const p of ['LOW', 'MEDIUM'] as const) expected.push(row('development', p, c.id, 1, 'meal'));
    if (selected !== undefined) {
      for (const c of training.cases.filter(c => c.group === 'validation')) for (const sample of [1, 2, 3]) expected.push(row('validation', selected, c.id, sample, 'meal'));
      for (const c of publicCases) for (const sample of [1, 2, 3]) expected.push(row('benchmark', selected, c.id, sample, c.scanMode));
    }
    expect(runtime.getPlannedOutcomes()).toEqual(expected);
    expect(expected).toHaveLength(selected === undefined ? 50 : 158);
    expect(expected.filter(r => r.scanMode === 'barcode')).toHaveLength(selected === undefined ? 0 : 12);
    expect(expected.filter(r => r.scanMode !== 'barcode')).toHaveLength(selected === undefined ? 50 : 146);
    expect(Object.isFrozen(runtime.getPlannedOutcomes()[0]!.key)).toBe(true);
    expect(h.calls).toEqual([]); expect(runtime.getObservations()).toEqual([]);
  });

  it('mediates a V2 meal lease through image, reservation, fake SDK and metadata in order', async () => {
    const h = await buildRuntimeHarness(); const runtime = prepareCalibrationRuntimeCapabilitiesV2(f.context, ports(h));
    const key = runtime.getPlannedOutcomes()[0]!.key;
    const value = await runtime.runOutcome(key, async caps => {
      await caps.loadImage(); return caps.generateVision(request);
    });
    expect(value).toBe('{"fixture":true}'); expect(h.calls).toEqual(['image', 'reserve', 'sdk', 'metadata']);
    expect(h.capturedKeys.loadImageKeys).toEqual([key]); expect(h.capturedKeys.reserveImageKeys).toEqual([key]);
    expect(h.capturedKeys.modelVersionCalls).toEqual([{ key, version: 'fixture-model-v1' }]);
    expect(h.witness).toEqual({ sdk: 1, transport: 1 }); // Injected fake client only, never a live SDK/transport.
  });

  it('serves twelve barcode outcomes using real frozen snapshot products with no image or vision reservation', async () => {
    const h = await buildRuntimeHarness('MEDIUM'); const runtime = prepareCalibrationRuntimeCapabilitiesV2(f.context, ports(h, 'MEDIUM'));
    const rows = runtime.getPlannedOutcomes().filter(r => r.scanMode === 'barcode'); expect(rows).toHaveLength(12);
    for (const row of rows) await runtime.runOutcome(row.key, async caps => { expect(caps.lookupSnapshot()).toBeDefined(); });
    expect(h.calls).toEqual(Array.from({ length: 12 }, () => 'snapshot'));
    expect(h.capturedKeys.reserveImageKeys).toEqual([]); expect(h.witness).toEqual({ sdk: 0, transport: 0 });
  });

  it.each(['shallow', 'structured', 'proxy', 'revoked', 'getter', 'identity', 'null'] as const)('rejects %s context before secondary deps traps', kind => {
    let traps = 0; const revoked = Proxy.revocable(f.context, {}); revoked.revoke();
    const contexts = { shallow: { ...f.context }, structured: structuredClone(f.context), proxy: new Proxy(f.context, {}),
      revoked: revoked.proxy, getter: Object.defineProperty({}, 'identity', { enumerable: true, get() { traps++; throw new Error('PRIVATE'); } }),
      identity: f.context.identity, null: null };
    const deps = new Proxy({}, { ownKeys() { traps++; throw new Error('PRIVATE'); }, getPrototypeOf() { traps++; throw new Error('PRIVATE'); } });
    expect(() => prepareCalibrationRuntimeCapabilitiesV2(contexts[kind] as CalibrationV2PreparedContext, deps)).toThrow('calibration:v2-context-unregistered');
    expect(traps).toBe(0);
  });

  it.each(['files', 'context', 'baseDir', 'identity', 'version'] as const)('rejects duplicate %s input even if it matches context', async field => {
    const h = await buildRuntimeHarness(); const values = { files: f.context.files, context: f.context, baseDir: f.context.baseDir, identity: f.context.identity, version: 'v2' };
    expect(() => prepareCalibrationRuntimeCapabilitiesV2(f.context, { ...ports(h), [field]: values[field] })).toThrow(INVALID);
    expect(h.calls).toEqual([]);
  });

  it.each(['unknown-profile', 'undefined-profile', 'missing-callback', 'callback-getter'] as const)('rejects %s deps before callback use', async kind => {
    const h = await buildRuntimeHarness(); const deps = ports(h); let reads = 0;
    if (kind === 'unknown-profile') Object.assign(deps, { selectedProfile: 'unknown' });
    if (kind === 'undefined-profile') Object.assign(deps, { selectedProfile: undefined });
    if (kind === 'missing-callback') Reflect.deleteProperty(deps, 'reserveImage');
    if (kind === 'callback-getter') Object.defineProperty(deps, 'loadImage', { enumerable: true, get() { reads++; throw new Error('PRIVATE'); } });
    expect(() => prepareCalibrationRuntimeCapabilitiesV2(f.context, deps)).toThrow(INVALID);
    expect(h.calls).toEqual([]); expect(reads).toBe(0);
  });

  it('rejects unselected validation profile before any port call', async () => {
    const h = await buildRuntimeHarness('MEDIUM'); const runtime = prepareCalibrationRuntimeCapabilitiesV2(f.context, ports(h, 'MEDIUM'));
    const key = runtime.getPlannedOutcomes().find(r => r.key.stage === 'validation')!.key;
    await expect(runtime.runOutcome({ ...key, profile: 'LOW' }, async () => undefined)).rejects.toBeInstanceOf(CalibrationFatalError);
    expect(h.calls).toEqual([]);
  });

  it('captures callback identities and prevents a completed lease from being reused', async () => {
    const h = await buildRuntimeHarness(); const deps = ports(h); const runtime = prepareCalibrationRuntimeCapabilitiesV2(f.context, deps);
    deps.loadImage = async () => { throw new Error('PRIVATE'); };
    let late: CalibrationOutcomeCapabilities['loadImage'] | undefined;
    await runtime.runOutcome(runtime.getPlannedOutcomes()[0]!.key, async caps => {
      late = caps.loadImage; await caps.loadImage(); return caps.generateVision(request);
    });
    const before = [...h.calls]; await expect(late!()).rejects.toThrow('calibration:runtime-lease-expired');
    expect(h.calls).toEqual(before);
  });

  it('interleaves V1 and V2 without changing the legacy plan', async () => {
    const h = await buildRuntimeHarness(); const old = prepareCalibrationRuntimeCapabilities(h.deps);
    const before = JSON.stringify(old.getPlannedOutcomes());
    const next = prepareCalibrationRuntimeCapabilitiesV2(f.context, ports(h));
    await next.runOutcome(next.getPlannedOutcomes()[0]!.key, async caps => { await caps.loadImage(); return caps.generateVision(request); });
    expect(JSON.stringify(old.getPlannedOutcomes())).toBe(before);
    expect(old.getObservations()).toEqual([]);
  });
});
