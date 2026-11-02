/** Real context admission, native owner/Git and protocol store; only provider replies are fake. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { prepareCalibrationBootstrapContext } from '../../src/nutrition-eval/calibration-bootstrap';
import { createProtocolCalibrationLedgerV2 } from '../../src/nutrition-eval/calibration';
import { deriveCanonicalAllowedKeysV2 } from '../../src/nutrition-eval/calibration-bootstrap';
import * as stores from '../../src/nutrition-eval/calibration-file-store';
import { runCalibrationProtocolPreflightSession, runCalibrationProtocolPreflightSessionV2 } from '../../src/nutrition-eval/calibration-preflight-session';
import type { CalibrationV2PreparedContext } from '../../src/nutrition-eval/calibration-protocol-bindings';
import type { CalibrationPreflightImageRequest } from '../../src/nutrition-eval/calibration-cli';
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';
import { nativeMiniFixture, nativeV2RuntimeFixture, nativeTreeSnapshot } from './helpers/calibration-v2-native-runtime-fixtures';

const fsWitness = vi.hoisted(() => ({ enabled: false,
  calls: { chmodSync: 0, mkdirSync: 0, renameSync: 0, unlinkSync: 0, linkSync: 0, writeSync: 0 } }));
vi.mock('node:fs', async original => {
  const actual = await original<typeof import('node:fs')>();
  return { ...actual, ...Object.fromEntries(
    (['chmodSync', 'mkdirSync', 'renameSync', 'unlinkSync', 'linkSync', 'writeSync'] as const).map(name =>
      [name, (...args: unknown[]) => {
        if (fsWitness.enabled) fsWitness.calls[name]++;
        return Reflect.apply(actual[name], undefined, args);
      }]),
  ) };
});

const trust = vi.hoisted(() => ({ sha: '' }));
vi.mock('../../src/nutrition-eval/calibration-v2-lock', async original => ({
  ...await original<typeof import('../../src/nutrition-eval/calibration-v2-lock')>(),
  get CALIBRATION_ACTIVATION_LOCK_V2_SHA256() { return trust.sha; },
}));
const roots: string[] = [];
afterEach(() => { fsWitness.enabled = false; vi.restoreAllMocks(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const fixture = () => nativeV2RuntimeFixture(roots, sha => { trust.sha = sha; });
const version = 'gemini-3.8-preflight-fixture';
function ports() {
  return { countTokens: vi.fn(async () => ({ tokenCount: 42 })),
    generateImage: vi.fn(async (_request: CalibrationPreflightImageRequest) => ({
      prediction: { kcal: 320, proteinG: 20, carbsG: 30, fatG: 10 }, modelVersion: version,
    })) };
}
function rows(root: string): Array<{ type: string; key?: { profile?: string }; identity?: { protocolVersion: string } }> {
  return JSON.parse(readFileSync(join(root, 'ledger.json'), 'utf8'));
}
function seedLock(f: Awaited<ReturnType<typeof fixture>>, kind: 'live' | 'dead' | 'foreign') {
  mkdirSync(f.root, { recursive: true, mode: 0o700 });
  const owner = kind === 'live' ? f.context.owner : { ...f.context.owner,
    ...(kind === 'dead' ? { pid: 2147483647, startTicks: 1 } : { hostname: 'foreign-fixture-host' }) };
  writeFileSync(join(f.root, 'lock.json'), JSON.stringify(owner), { mode: 0o600 });
}

describe('one-shot standalone V2 protocol preflight', () => {
  it('independent V1 native baseline retains its existing protocol session behavior', async () => {
    const f = nativeMiniFixture(roots); const context = await prepareCalibrationBootstrapContext(f.nativePorts);
    const deps = ports(); const result = await runCalibrationProtocolPreflightSession({ context, ...deps });
    expect(result).toMatchObject({ tokenCount: 42, pinnedModelVersion: version, verifiedProfiles: ['LOW', 'MEDIUM'] });
    expect(deps.countTokens).toHaveBeenCalledTimes(1); expect(deps.generateImage).toHaveBeenCalledTimes(2);
  }, 30000);

  it('runs two provider image callbacks and one token callback, then releases only its V2 lock', async () => {
    const f = await fixture(); const deps = ports(); mkdirSync(f.v1Root, { recursive: true, mode: 0o700 });
    writeFileSync(join(f.v1Root, 'sentinel'), 'frozen-v1-fixture', { mode: 0o600 }); const old = nativeTreeSnapshot(f.v1Root);
    const result = await runCalibrationProtocolPreflightSessionV2(f.context, deps);
    expect(result).toMatchObject({ stage: 'preflight', caseId: f.context.firstDevelopmentCaseId,
      model: 'gemini-3.8-flash', tokenCount: 42, pinnedModelVersion: version, verifiedProfiles: ['LOW', 'MEDIUM'] });
    expect(deps.countTokens).toHaveBeenCalledTimes(1); expect(deps.countTokens).toHaveBeenCalledWith({ model: 'gemini-3.8-flash' });
    expect(deps.generateImage).toHaveBeenNthCalledWith(1, { model: 'gemini-3.8-flash', profile: 'LOW', caseId: f.context.firstDevelopmentCaseId });
    expect(deps.generateImage).toHaveBeenNthCalledWith(2, { model: 'gemini-3.8-flash', profile: 'MEDIUM', caseId: f.context.firstDevelopmentCaseId });
    const events = rows(f.root); expect(events[0]!.identity!.protocolVersion).toBe('v2');
    expect(events.filter(r => r.type === 'reserved')).toHaveLength(2);
    expect(events.filter(r => r.type === 'completed')).toHaveLength(2);
    expect(events.filter(r => r.type === 'token_count_reserved')).toHaveLength(1);
    expect(events.filter(r => r.type === 'token_count_completed')).toHaveLength(1);
    const pin = events.findIndex(r => r.type === 'model_version_pinned');
    expect(pin).toBeGreaterThan(-1); expect(pin).toBeLessThan(events.findIndex(r => r.type === 'completed'));
    expect(events.at(-1)!.type).toBe('stage_completed'); expect(events.some(r => r.type === 'lock_recovery')).toBe(false);
    expect(existsSync(join(f.root, 'lock.json'))).toBe(false); expect(nativeTreeSnapshot(f.v1Root)).toEqual(old);
  }, 30000);

  it('refuses a completed session before another callback or file mutation', async () => {
    const f = await fixture(); const deps = ports(); await runCalibrationProtocolPreflightSessionV2(f.context, deps);
    const before = nativeTreeSnapshot(f.root);
    await expect(runCalibrationProtocolPreflightSessionV2(f.context, deps)).rejects.toThrow(CalibrationFatalError);
    expect(deps.countTokens).toHaveBeenCalledTimes(1); expect(deps.generateImage).toHaveBeenCalledTimes(2);
    expect(nativeTreeSnapshot(f.root)).toEqual(before);
  }, 30000);

  it.each(['token', 'LOW', 'MEDIUM'] as const)('preserves %s failure and refuses replay without recovery', async phase => {
    const f = await fixture(); const deps = ports();
    if (phase === 'token') deps.countTokens.mockRejectedValue(new Error('PRIVATE-provider-token'));
    else deps.generateImage.mockImplementation(async request => {
      if (request.profile === phase) throw new Error('PRIVATE-provider-image');
      return { prediction: { kcal: 320, proteinG: 20, carbsG: 30, fatG: 10 }, modelVersion: version };
    });
    await expect(runCalibrationProtocolPreflightSessionV2(f.context, deps)).rejects.toThrow(CalibrationFatalError);
    expect(deps.countTokens).toHaveBeenCalledTimes(1);
    expect(deps.generateImage).toHaveBeenCalledTimes(phase === 'token' ? 0 : phase === 'LOW' ? 1 : 2);
    expect(existsSync(join(f.root, 'lock.json'))).toBe(true); const before = nativeTreeSnapshot(f.root);
    const fresh = ports(); await expect(runCalibrationProtocolPreflightSessionV2(f.context, fresh)).rejects.toThrow(CalibrationFatalError);
    expect(fresh.countTokens).not.toHaveBeenCalled(); expect(fresh.generateImage).not.toHaveBeenCalled();
    expect(nativeTreeSnapshot(f.root)).toEqual(before); expect(JSON.stringify(rows(f.root))).not.toContain('PRIVATE-provider');
    expect(rows(f.root).some(r => r.type === 'lock_recovery')).toBe(false);
  }, 30000);

  it.each(['clone', 'proxy', 'revoked', 'V1'] as const)('rejects %s context before secondary dependency reflection', async kind => {
    const f = await fixture(); let reads = 0;
    const revoked = Proxy.revocable(f.context, {}); revoked.revoke();
    const context = kind === 'clone' ? { ...f.context } : kind === 'proxy' ? new Proxy(f.context, {}) : kind === 'revoked' ? revoked.proxy
      : await prepareCalibrationBootstrapContext(f.nativePorts);
    const deps = new Proxy({}, { getOwnPropertyDescriptor() { reads++; throw new Error('PRIVATE'); },
      ownKeys() { reads++; throw new Error('PRIVATE'); }, getPrototypeOf() { reads++; throw new Error('PRIVATE'); } });
    await expect(runCalibrationProtocolPreflightSessionV2(context as Readonly<CalibrationV2PreparedContext>, deps))
      .rejects.toThrow('calibration:v2-context-unregistered');
    expect(reads).toBe(0); expect(existsSync(f.root)).toBe(false);
  }, 30000);

  it.each(['countTokens', 'generateImage'] as const)('rejects accessor %s without invoking it', async field => {
    const f = await fixture(); const deps = ports(); let reads = 0;
    Object.defineProperty(deps, field, { enumerable: true, get() { reads++; throw new Error('PRIVATE'); } });
    await expect(runCalibrationProtocolPreflightSessionV2(f.context, deps)).rejects.toThrow(CalibrationFatalError);
    expect(reads).toBe(0); expect(existsSync(f.root)).toBe(false);
  }, 30000);

  it.each(['context', 'baseDir', 'owner', 'identity', 'expected', 'keyResolver', 'recordSafeError', 'firstDevelopmentCaseId'] as const)('rejects caller %s override before effects', async field => {
      const f = await fixture(); const deps = ports();
      await expect(runCalibrationProtocolPreflightSessionV2(f.context, { ...deps, [field]: f.context })).rejects.toThrow(CalibrationFatalError);
      expect(deps.countTokens).not.toHaveBeenCalled(); expect(deps.generateImage).not.toHaveBeenCalled(); expect(existsSync(f.root)).toBe(false);
    }, 30000);

  it.each(['live', 'dead', 'foreign'] as const)('retains an existing %s lock without takeover or callbacks', async kind => {
    const f = await fixture(); const deps = ports(); seedLock(f, kind); const before = nativeTreeSnapshot(f.root);
    await expect(runCalibrationProtocolPreflightSessionV2(f.context, deps)).rejects.toThrow(CalibrationFatalError);
    expect(deps.countTokens).not.toHaveBeenCalled(); expect(deps.generateImage).not.toHaveBeenCalled(); expect(nativeTreeSnapshot(f.root)).toEqual(before);
  }, 30000);

  it.each(['token', 'image'] as const)('refuses spent %s state even when its fixture lock is absent', async kind => {
    const f = await fixture(); const deps = ports(); const store = stores.createFileCalibrationLedgerDepsV2(f.context);
    const ledger = createProtocolCalibrationLedgerV2(f.context, store, profile => deriveCanonicalAllowedKeysV2(f.context, profile));
    ledger.acquireLock(f.context.owner);
    const token = { kind: 'token_count', stage: 'preflight', caseId: f.context.firstDevelopmentCaseId, model: 'gemini-3.8-flash' } as const;
    ledger.reserveTokenCount(token);
    if (kind === 'image') { ledger.completeTokenCount(token, 42); ledger.reserve({ stage: 'preflight', profile: 'LOW', caseId: token.caseId, sampleIndex: 1 }); }
    // Pure fixture setup only: no runtime failure unlock or SDK call is performed.
    ledger.releaseLock(f.context.owner); const before = nativeTreeSnapshot(f.root);
    await expect(runCalibrationProtocolPreflightSessionV2(f.context, deps)).rejects.toThrow(CalibrationFatalError);
    expect(deps.countTokens).not.toHaveBeenCalled(); expect(deps.generateImage).not.toHaveBeenCalled(); expect(nativeTreeSnapshot(f.root)).toEqual(before);
  }, 30000);

  it('blocks stale-owner archival if a lock appears between the precheck and acquisition', async () => {
    const f = await fixture(); const deps = ports(); const original = stores.createFileCalibrationLedgerDepsV2;
    const originalBenchmark = stores.createBenchmarkAuthorityFileCalibrationLedgerDepsV2;
    let archiveCalls = 0; let afterRace: Record<string, unknown> | undefined; let reads = 0;
    vi.spyOn(stores, 'createFileCalibrationLedgerDepsV2').mockImplementation(context => {
      const native = original(context);
      return { ...native, readLock: () => {
        if (++reads === 2) { seedLock(f, 'dead'); afterRace = nativeTreeSnapshot(f.root); }
        return native.readLock();
      }, archiveLock: owner => { archiveCalls++; native.archiveLock(owner); } };
    });
    vi.spyOn(stores, 'createBenchmarkAuthorityFileCalibrationLedgerDepsV2').mockImplementation(context => {
      const native = originalBenchmark(context);
      return { ...native, readLock: () => {
        if (++reads === 2) { seedLock(f, 'dead'); afterRace = nativeTreeSnapshot(f.root); }
        return native.readLock();
      }, archiveLock: owner => { archiveCalls++; native.archiveLock(owner); } };
    });
    await expect(runCalibrationProtocolPreflightSessionV2(f.context, deps)).rejects.toThrow(CalibrationFatalError);
    expect(afterRace).toBeDefined(); expect(nativeTreeSnapshot(f.root)).toEqual(afterRace);
    expect(archiveCalls).toBe(0); expect(deps.countTokens).not.toHaveBeenCalled(); expect(deps.generateImage).not.toHaveBeenCalled();
  }, 30000);

  it.each([{ label: '0755', mode: 0o755 }, { label: '0700', mode: 0o700 }])(
    'preserves retained-lock metadata at $label with zero preparation mutations', async ({ mode }) => {
      const f = await fixture(); const deps = ports(); seedLock(f, 'dead');
      chmodSync(f.root, mode);
      await rejectWithoutPreparationEffects(f, deps);
    }, 30000);

  it.each([{ label: '0755', mode: 0o755 }, { label: '0700', mode: 0o700 }])(
    'preserves a genuine copied V1 header at $label with zero preparation mutations', async ({ mode }) => {
      const f = await fixture(); const deps = ports();
      const oldContext = await prepareCalibrationBootstrapContext(f.nativePorts);
      // Separate fixture setup callbacks create genuine V1 state, never a target V2 request.
      await runCalibrationProtocolPreflightSession({ context: oldContext, ...ports() });
      expect(rows(f.v1Root)[0]?.identity?.protocolVersion).toBe('v1');
      cpSync(f.v1Root, f.root, { recursive: true, preserveTimestamps: true });
      chmodSync(f.root, mode);
      expect(rows(f.root)[0]?.identity?.protocolVersion).toBe('v1');
      await rejectWithoutPreparationEffects(f, deps);
    }, 30000);
});

function metadataInventory(root: string): Record<string, unknown> {
  const inventory: Record<string, unknown> = {};
  function visit(path: string, key: string): void {
    const stat = lstatSync(path, { bigint: true });
    inventory[key] = { mode: stat.mode.toString(), size: stat.size.toString(),
      mtimeNs: stat.mtimeNs.toString(), ctimeNs: stat.ctimeNs.toString(),
      sha256: stat.isFile() ? createHash('sha256').update(readFileSync(path)).digest('hex') : null };
    if (stat.isDirectory()) for (const name of readdirSync(path).sort()) visit(join(path, name), key + '/' + name);
  }
  visit(root, '.'); return inventory;
}

async function rejectWithoutPreparationEffects(
  f: Awaited<ReturnType<typeof fixture>>, deps: ReturnType<typeof ports>,
): Promise<void> {
  const before = metadataInventory(f.root);
  for (const name of Object.keys(fsWitness.calls) as Array<keyof typeof fsWitness.calls>) fsWitness.calls[name] = 0;
  fsWitness.enabled = true;
  try { await expect(runCalibrationProtocolPreflightSessionV2(f.context, deps)).rejects.toThrow(CalibrationFatalError); }
  finally { fsWitness.enabled = false; }
  expect(deps.countTokens).not.toHaveBeenCalled(); expect(deps.generateImage).not.toHaveBeenCalled();
  expect(fsWitness.calls).toEqual({ chmodSync: 0, mkdirSync: 0, renameSync: 0, unlinkSync: 0, linkSync: 0, writeSync: 0 });
  expect(metadataInventory(f.root)).toEqual(before);
}
