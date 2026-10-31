import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';
import { createCalibrationLedger, createCalibrationLedgerV2 } from '../../src/nutrition-eval/calibration';
import type { CalibrationIdentity } from '../../src/nutrition-eval/calibration';
import { createFileCalibrationLedgerDeps, createFileCalibrationLedgerDepsV2,
  createRuntimeEvidenceFileCalibrationLedgerDepsV2, createBenchmarkAuthorityFileCalibrationLedgerDepsV2 } from '../../src/nutrition-eval/calibration-file-store';
import { prepareCalibrationV2BootstrapContext, requireCalibrationV2Context } from '../../src/nutrition-eval/calibration-protocol-bindings';
import type { CalibrationV2PreparedContext } from '../../src/nutrition-eval/calibration-protocol-bindings';
import { v2BootstrapFixture } from './helpers/calibration-v2-bootstrap-fixtures';
import { key, legacyIdentity, memoryWorld, V1_ROOT, V2_ROOT } from './helpers/calibration-v2-ledger-fixtures';

const trust = vi.hoisted(() => ({ sha: '', clients: 0, network: 0 }));
vi.mock('../../src/nutrition-eval/calibration-v2-lock', async original => ({
  ...await original<typeof import('../../src/nutrition-eval/calibration-v2-lock')>(),
  get CALIBRATION_ACTIVATION_LOCK_V2_SHA256() { return trust.sha; },
}));
vi.mock('@google/genai', async original => ({
  ...await original<typeof import('@google/genai')>(),
  GoogleGenAI: class { constructor() { trust.clients++; throw new Error('forbidden ledger client'); } },
}));
const roots: string[] = [];
beforeEach(() => { vi.spyOn(globalThis, 'fetch').mockImplementation(() => { trust.network++; throw new Error('forbidden ledger network'); }); });
afterEach(async () => {
  try { expect({ clients: trust.clients, network: trust.network }).toEqual({ clients: 0, network: 0 }); }
  finally { vi.restoreAllMocks(); trust.clients = 0; trust.network = 0;
    for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); }
});
async function context(baseDir?: string) {
  const f = v2BootstrapFixture(); trust.sha = f.fixture.input.expectedActivationLockSha256;
  if (baseDir !== undefined) f.deps.baseDir = baseDir;
  return prepareCalibrationV2BootstrapContext(f.deps);
}
type Context = Readonly<CalibrationV2PreparedContext>;
const stores = [createFileCalibrationLedgerDepsV2, createRuntimeEvidenceFileCalibrationLedgerDepsV2,
  createBenchmarkAuthorityFileCalibrationLedgerDepsV2] as const;
const identityFields = ['protocolVersion', 'provider', 'model', 'implementationCommit', 'functionsTreeId',
  'datasetHash', 'promptHash', 'responseSchemaHash', 'sourceLockHash', 'manifestHash', 'publicManifestHash',
  'snapshotLockHash', 'historicalReferenceHash', 'plannedImageCalls', 'hardCeiling'] as const;

describe('registered base v2 ledger and fixed file roots', () => {
  it('accepts the original context and binds full identity without introducing a strict protocol header', async () => {
    const c = await context(); const world = memoryWorld();
    const ledger = createCalibrationLedgerV2(c, world.deps, [key()]);
    expect(requireCalibrationV2Context(c)).toBe(c);
    expect(() => ledger.assertIdentity(c.identity)).not.toThrow();
    expect(c.identity).toMatchObject({ protocolVersion: 'v2', plannedImageCalls: 146, hardCeiling: 146 });
    ledger.acquireLock(c.owner);
    expect(ledger.getCounts()).toEqual({ imageReserved: 0, tokenCountReserved: 0 });
    expect(world.events).toEqual([]); // BASE mode has no strict header.
    ledger.reserve(key());
    expect(world.events).toEqual([{ type: 'reserved', key: key(), at: '2026-10-31T00:00:00.000Z' }]);
  });

  it('rejects unregistered objects at all four entries before touching dependencies or caller properties', async () => {
    const c = await context(); let traps = 0;
    const proxy = new Proxy(c, { get() { traps++; throw new Error('caller property'); } });
    const revoked = Proxy.revocable(c, {}); revoked.revoke();
    const accessor = Object.defineProperty({}, 'identity', { get() { traps++; throw new Error('caller property'); } });
    for (const value of [{ ...c }, structuredClone(c), proxy, revoked.proxy, accessor, {}, null]) {
      const world = memoryWorld(); const candidate = value as Context;
      expect(() => createCalibrationLedgerV2(candidate, world.deps, [])).toThrow(CalibrationFatalError);
      for (const factory of stores) expect(() => factory(candidate)).toThrow(CalibrationFatalError);
      expect(world.calls).toEqual([]); expect(world.writes).toEqual([]);
    }
    expect(traps).toBe(0);
  });

  it.each(identityFields)('rejects drift of full identity field %s without writes', async field => {
    const c = await context(); const world = memoryWorld(); const ledger = createCalibrationLedgerV2(c, world.deps, []);
    const candidate = { ...c.identity, [field]: typeof c.identity[field] === 'number' ? 999 : 'foreign' } as CalibrationIdentity;
    expect(() => ledger.assertIdentity(candidate)).toThrow(CalibrationFatalError);
    expect(world.writes).toEqual([]);
  });

  it('keeps interleaved v1/v2 identity, roots and reservation counts independent', async () => {
    const c = await context(); const a = memoryWorld(V1_ROOT); const b = memoryWorld();
    const one = createCalibrationLedger(a.deps, legacyIdentity(), [key()]);
    const two = createCalibrationLedgerV2(c, b.deps, [key()]);
    one.acquireLock(c.owner); two.acquireLock(c.owner); two.reserve(key());
    expect(one.getCounts().imageReserved).toBe(0); expect(two.getCounts().imageReserved).toBe(1);
    expect(() => one.assertIdentity(c.identity)).toThrow(CalibrationFatalError);
    expect(() => two.assertIdentity(legacyIdentity())).toThrow(CalibrationFatalError);
    one.reserve(key()); expect(one.getCounts().imageReserved).toBe(1);
    expect(a.events).toHaveLength(1); expect(b.events).toHaveLength(1);
  });

  it.each([false, true])('rejects actual v2 dependency root in the legacy boundary, canonical override=%s', async override => {
    const c = await context(); const world = memoryWorld();
    expect(() => createCalibrationLedger(world.deps, legacyIdentity(), [])
      .acquireLock(c.owner, override ? { runDir: V1_ROOT } : undefined)).toThrow('calibration:root-redirected');
    expect(world.writes).toEqual([]);
  });
  it.each([false, true])('rejects actual v1 dependency root in the v2 boundary, canonical override=%s', async override => {
    const c = await context(); const world = memoryWorld(V1_ROOT);
    expect(() => createCalibrationLedgerV2(c, world.deps, [])
      .acquireLock(c.owner, override ? { runDir: V2_ROOT } : undefined)).toThrow('calibration:root-redirected');
    expect(world.writes).toEqual([]);
  });
  it('rejects an explicit foreign run directory even when the dependency root is valid', async () => {
    const c = await context(); const world = memoryWorld(); const ledger = createCalibrationLedgerV2(c, world.deps, []);
    expect(() => ledger.acquireLock(c.owner, { runDir: V1_ROOT })).toThrow('calibration:root-redirected');
    expect(world.writes).toEqual([]);
  });

  it('checks the actual root before constructor replay can invoke storage readers', async () => {
    const c = await context(); const wrongV1 = memoryWorld(); const wrongV2 = memoryWorld(V1_ROOT);
    expect(() => createCalibrationLedger(wrongV1.deps, legacyIdentity(), [])).toThrow('calibration:root-redirected');
    expect(() => createCalibrationLedgerV2(c, wrongV2.deps, [])).toThrow('calibration:root-redirected');
    expect(wrongV1.calls).toEqual(['getRoot']); expect(wrongV2.calls).toEqual(['getRoot']);
    expect(wrongV1.writes).toEqual([]); expect(wrongV2.writes).toEqual([]);
  });
  it('rechecks dependency roots at acquisition after a valid constructor, even with canonical overrides', async () => {
    const c = await context(); const a = memoryWorld(V1_ROOT); const b = memoryWorld();
    const one = createCalibrationLedger(a.deps, legacyIdentity(), []);
    const two = createCalibrationLedgerV2(c, b.deps, []);
    a.root = V2_ROOT; b.root = V1_ROOT;
    expect(() => one.acquireLock(c.owner, { runDir: V1_ROOT })).toThrow('calibration:root-redirected');
    expect(() => two.acquireLock(c.owner, { runDir: V2_ROOT })).toThrow('calibration:root-redirected');
    expect(a.writes).toEqual([]); expect(b.writes).toEqual([]);
  });

  it('reserves 146 real planned keys and rejects an ordinary 147th as unplanned, not as ceiling proof', async () => {
    const c = await context(); const world = memoryWorld(); const keys = Array.from({ length: 146 }, (_, i) => key(i));
    const ledger = createCalibrationLedgerV2(c, world.deps, keys); ledger.acquireLock(c.owner);
    keys.forEach(k => ledger.reserve(k));
    expect(ledger.getCounts()).toEqual({ imageReserved: 146, tokenCountReserved: 0 });
    expect(world.events).toHaveLength(146);
    expect(() => ledger.reserve(key(146))).toThrow('calibration:reservation-unplanned');
    expect(world.events).toHaveLength(146);
  });
  it('caps_new_image_reservations_at_146 via full workload plus the direct pure diagnostic guard', async () => {
    const c = await context(); const world = memoryWorld(); const keys = Array.from({ length: 146 }, (_, i) => key(i));
    const ledger = createCalibrationLedgerV2(c, world.deps, keys); ledger.acquireLock(c.owner);
    keys.forEach(k => ledger.reserve(k)); const count = world.events.length; const onFatal = vi.fn();
    // This exercises the diagnostic comparison, not the unreachable ordinary
    // reserve count-guard. Synthetic itself never increments imageReserved.
    expect(() => ledger.reserveSynthetic({ reason: 'ceiling-probe', index: 146 }, onFatal))
      .toThrow('calibration:ceiling-exceeded:ceiling-probe');
    expect(onFatal).not.toHaveBeenCalled(); expect(world.events).toHaveLength(count);
    expect(ledger.getCounts().imageReserved).toBe(146);
    const old = memoryWorld(V1_ROOT); const legacy = createCalibrationLedger(old.deps, legacyIdentity(), []);
    legacy.acquireLock(c.owner); legacy.reserveSynthetic({ reason: 'ceiling-probe', index: 146 }, onFatal);
    expect(old.events).toHaveLength(1); expect(legacy.getCounts().imageReserved).toBe(0);
  });
  it('keeps the 146 allowed-key construction limit', async () => {
    const c = await context(); const world = memoryWorld();
    expect(() => createCalibrationLedgerV2(c, world.deps, Array.from({ length: 147 }, (_, i) => key(i))))
      .toThrow('calibration:allowed-keys-exceed-planned-ceiling');
    expect(world.writes).toEqual([]);
  });
  it('caps token reservations at one independently of image slots', async () => {
    const c = await context(); const world = memoryWorld(); const ledger = createCalibrationLedgerV2(c, world.deps, [key(), key(1)]);
    ledger.acquireLock(c.owner);
    const token = { kind: 'token_count' as const, stage: 'preflight' as const, caseId: key().caseId, model: 'gemini-3.8-flash' };
    ledger.reserveTokenCount(token); expect(ledger.getCounts()).toEqual({ imageReserved: 0, tokenCountReserved: 1 });
    const count = world.events.length;
    expect(() => ledger.reserveTokenCount({ ...token, caseId: key(1).caseId })).toThrow('calibration:token-reservation-duplicate');
    expect(world.events).toHaveLength(count); ledger.reserve(key());
    expect(ledger.getCounts()).toEqual({ imageReserved: 1, tokenCountReserved: 1 });
  });
  it('rejects changed source tree without persistence effects', async () => {
    const c = await context(); const world = memoryWorld(); const ledger = createCalibrationLedgerV2(c, world.deps, []);
    expect(() => ledger.assertGitState({ headCommit: c.identity.implementationCommit, functionsTreeId: 'f'.repeat(40), dirtyPaths: [] }))
      .toThrow('calibration:git-tree-drift');
    expect(world.writes).toEqual([]);
  });

  it.each(stores.map((factory, index) => ({ factory, index })))('uses only the fixed v2 disk root for file factory $index', async ({ factory }) => {
    const root = await fs.mkdtemp(join(tmpdir(), 'calorix-v2-ledger-root-')); roots.push(root);
    await fs.mkdir(join(root, V1_ROOT), { recursive: true });
    const sentinel = join(root, V1_ROOT, 'sentinel.txt'); await fs.writeFile(sentinel, 'frozen fixture');
    const c = await context(root); const deps = factory(c);
    expect(deps.getRoot()).toBe(V2_ROOT); await expect(fs.stat(join(root, V2_ROOT))).rejects.toThrow();
    deps.writeLockExclusive(c.owner);
    deps.appendLedgerEvent({ type: 'reserved', key: key(), at: '2026-10-31T00:00:00.000Z' });
    expect(JSON.parse(await fs.readFile(join(root, V2_ROOT, 'lock.json'), 'utf8'))).toEqual(c.owner);
    expect(JSON.parse(await fs.readFile(join(root, V2_ROOT, 'ledger.json'), 'utf8'))).toHaveLength(1);
    expect(await fs.readFile(sentinel, 'utf8')).toBe('frozen fixture');
  });
  it('rejects real v1 file dependencies before creating either output root even with v2 override', async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'calorix-v2-ledger-cross-')); roots.push(root);
    const c = await context(root); const deps = createFileCalibrationLedgerDeps(root);
    expect(() => createCalibrationLedgerV2(c, deps, []).acquireLock(c.owner, { runDir: V2_ROOT }))
      .toThrow('calibration:root-redirected');
    await expect(fs.stat(join(root, V1_ROOT))).rejects.toThrow();
    await expect(fs.stat(join(root, V2_ROOT))).rejects.toThrow();
  });
  it.each(stores.map((factory, index) => ({ factory, index })))('rejects real v2 file factory $index in a v1 ledger before any output root', async ({ factory }) => {
    const root = await fs.mkdtemp(join(tmpdir(), 'calorix-v1-ledger-cross-')); roots.push(root);
    const c = await context(root); const deps = factory(c);
    expect(() => createCalibrationLedger(deps, legacyIdentity(), []).acquireLock(c.owner, { runDir: V1_ROOT }))
      .toThrow('calibration:root-redirected');
    await expect(fs.stat(join(root, V1_ROOT))).rejects.toThrow();
    await expect(fs.stat(join(root, V2_ROOT))).rejects.toThrow();
  });
});
