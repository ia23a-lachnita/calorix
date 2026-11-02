import { afterEach, describe, expect, it, vi } from 'vitest';
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { prepareCalibrationBootstrapContext } from '../../src/nutrition-eval/calibration-bootstrap';
import { requireMatchingCalibrationV2Ledger } from '../../src/nutrition-eval/calibration';
import { prepareNativeCalibrationBenchmarkAuthorityLedger, prepareNativeCalibrationBenchmarkAuthorityLedgerV2 } from '../../src/nutrition-eval/calibration-runtime-evidence-ledger';
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';
import { nativeMiniFixture, nativeV2RuntimeFixture, nativeTreeSnapshot } from './helpers/calibration-v2-native-runtime-fixtures';

const trust = vi.hoisted(() => ({ sha: '' }));
vi.mock('../../src/nutrition-eval/calibration-v2-lock', async original => ({
  ...await original<typeof import('../../src/nutrition-eval/calibration-v2-lock')>(),
  get CALIBRATION_ACTIVATION_LOCK_V2_SHA256() { return trust.sha; },
}));
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const fixture = () => nativeV2RuntimeFixture(roots, sha => { trust.sha = sha; });
const INPUT = 'calibration:benchmark-authority-native-input-invalid';

describe('native V2 benchmark ledger composition with real local Git and owner', () => {
  it('independent V1 native baseline prepares without writes and supports an empty lock lifecycle', async () => {
    const f = nativeMiniFixture(roots); const ctx = await prepareCalibrationBootstrapContext(f.nativePorts);
    const root = join(f.mini.root, '.nutrition-eval/calibration/calorix-gemini-38-calibration-v1');
    const index = readFileSync(join(f.mini.root, '.git/index'));
    const ledger = await prepareNativeCalibrationBenchmarkAuthorityLedger({ context: ctx });
    expect(existsSync(root)).toBe(false);
    expect(readFileSync(join(f.mini.root, '.git/index'))).toEqual(index);
    ledger.acquireLock(ctx.owner);
    expect(ledger.getCounts()).toMatchObject({ imageReserved: 0, tokenCountReserved: 0 });
    ledger.releaseLock(ctx.owner);
    expect(existsSync(join(root, 'lock.json'))).toBe(false);
  });

  it('prepares the original V2 context without creating state or changing the Git index', async () => {
    const f = await fixture(); const before = nativeTreeSnapshot(f.root);
    const index = readFileSync(join(f.mini.root, '.git/index'));
    const ledger = await prepareNativeCalibrationBenchmarkAuthorityLedgerV2({ context: f.context });
    expect(Object.isFrozen(ledger)).toBe(true);
    expect(requireMatchingCalibrationV2Ledger(f.context, ledger)).toBeUndefined();
    expect(nativeTreeSnapshot(f.root)).toEqual(before);
    expect(before).toEqual({ exists: false });
    expect(readFileSync(join(f.mini.root, '.git/index'))).toEqual(index);
  });

  it('creates only V2 private state through an explicit healthy empty lock lifecycle', async () => {
    const f = await fixture(); mkdirSync(f.v1Root, { recursive: true, mode: 0o700 });
    writeFileSync(join(f.v1Root, 'sentinel'), 'frozen-v1-fixture', { mode: 0o600 });
    const v1 = nativeTreeSnapshot(f.v1Root);
    const ledger = await prepareNativeCalibrationBenchmarkAuthorityLedgerV2({ context: f.context });
    expect(existsSync(f.root)).toBe(false);
    ledger.acquireLock(f.context.owner);
    expect(ledger.getCounts()).toMatchObject({ imageReserved: 0, tokenCountReserved: 0 });
    const events = JSON.parse(readFileSync(join(f.root, 'ledger.json'), 'utf8')) as Array<{ type: string; identity?: unknown }>;
    expect(events[0]).toMatchObject({ type: 'protocol_identity', identity: f.context.identity });
    expect(f.context.identity.protocolVersion).toBe('v2'); expect(f.context.identity.hardCeiling).toBe(146);
    expect(JSON.parse(readFileSync(join(f.root, 'lock.json'), 'utf8'))).toEqual(f.context.owner);
    expect(lstatSync(f.root).mode & 0o7777).toBe(0o700);
    expect(lstatSync(join(f.root, 'lock.json')).mode & 0o7777).toBe(0o600);
    ledger.releaseLock(f.context.owner);
    expect(existsSync(join(f.root, 'lock.json'))).toBe(false);
    expect(nativeTreeSnapshot(f.v1Root)).toEqual(v1);
  });

  it('pairs native handles with original contexts even when two admitted identities are equal', async () => {
    const f = await fixture(); const second = await f.admit();
    expect(second).not.toBe(f.context); expect(second.identity).toEqual(f.context.identity);
    const a = await prepareNativeCalibrationBenchmarkAuthorityLedgerV2({ context: f.context });
    const b = await prepareNativeCalibrationBenchmarkAuthorityLedgerV2({ context: second });
    expect(requireMatchingCalibrationV2Ledger(f.context, a)).toBeUndefined();
    expect(requireMatchingCalibrationV2Ledger(second, b)).toBeUndefined();
    expect(() => requireMatchingCalibrationV2Ledger(f.context, b)).toThrow('calibration:v2-ledger-context-mismatch');
    expect(() => requireMatchingCalibrationV2Ledger(second, a)).toThrow('calibration:v2-ledger-context-mismatch');
    expect(existsSync(f.root)).toBe(false);
  });

  it('reopens valid V2 state without writing bytes or changing metadata', async () => {
    const f = await fixture(); const a = await prepareNativeCalibrationBenchmarkAuthorityLedgerV2({ context: f.context });
    a.acquireLock(f.context.owner); a.releaseLock(f.context.owner);
    const before = nativeTreeSnapshot(f.root);
    const b = await prepareNativeCalibrationBenchmarkAuthorityLedgerV2({ context: f.context });
    expect(requireMatchingCalibrationV2Ledger(f.context, b)).toBeUndefined();
    expect(nativeTreeSnapshot(f.root)).toEqual(before);
  });

  it.each(['shallow', 'structured', 'proxy', 'revoked', 'getter', 'identity', 'null'] as const)('rejects %s context before secondary override traps', async kind => {
    const f = await fixture(); let traps = 0;
    const revoked = Proxy.revocable(f.context, {}); revoked.revoke();
    const values = { shallow: { ...f.context }, structured: structuredClone(f.context), proxy: new Proxy(f.context, {}),
      revoked: revoked.proxy, getter: Object.defineProperty({}, 'identity', { enumerable: true, get() { traps++; throw new Error('PRIVATE'); } }),
      identity: f.context.identity, null: null };
    const overrides = new Proxy({}, { ownKeys() { traps++; throw new Error('PRIVATE'); }, getPrototypeOf() { traps++; throw new Error('PRIVATE'); } });
    await expect(prepareNativeCalibrationBenchmarkAuthorityLedgerV2({ context: values[kind] }, overrides)).rejects.toThrow('calibration:v2-context-unregistered');
    expect(traps).toBe(0); expect(existsSync(f.root)).toBe(false);
  });

  it.each(['verifier', 'plans', 'reference', 'root', 'version', 'baseDir', 'identity', 'keyResolver'] as const)('rejects outer %s override before writes', async name => {
    const f = await fixture(); const before = nativeTreeSnapshot(f.root);
    await expect(prepareNativeCalibrationBenchmarkAuthorityLedgerV2({ context: f.context, [name]: f.context })).rejects.toThrow(INPUT);
    expect(nativeTreeSnapshot(f.root)).toEqual(before);
  });

  it('rejects an outer context accessor without invoking it', async () => {
    const f = await fixture(); let reads = 0;
    const params = Object.defineProperty({}, 'context', { enumerable: true, get() { reads++; throw new Error('PRIVATE'); } });
    await expect(prepareNativeCalibrationBenchmarkAuthorityLedgerV2(params)).rejects.toThrow(INPUT);
    expect(reads).toBe(0); expect(existsSync(f.root)).toBe(false);
  });

  it('rejects unknown low-level override hooks without creating state', async () => {
    const f = await fixture();
    await expect(prepareNativeCalibrationBenchmarkAuthorityLedgerV2({ context: f.context },
      { root: f.v1Root } as unknown as Parameters<typeof prepareNativeCalibrationBenchmarkAuthorityLedgerV2>[1])).rejects.toThrow(INPUT);
    expect(existsSync(f.root)).toBe(false);
  });

  it('rejects both cross-version context routes', async () => {
    const f = await fixture(); const old = await prepareCalibrationBootstrapContext(f.nativePorts);
    await expect(prepareNativeCalibrationBenchmarkAuthorityLedger({ context: f.context })).rejects.toThrow(INPUT);
    await expect(prepareNativeCalibrationBenchmarkAuthorityLedgerV2({ context: old })).rejects.toThrow('calibration:v2-context-unregistered');
    expect(existsSync(f.root)).toBe(false); expect(existsSync(f.v1Root)).toBe(false);
  });

  it('rejects real functions source drift before a native lock or state write', async () => {
    const f = await fixture(); const ledger = await prepareNativeCalibrationBenchmarkAuthorityLedgerV2({ context: f.context });
    const index = readFileSync(join(f.mini.root, '.git/index'));
    writeFileSync(join(f.mini.root, 'functions/drift.ts'), '// deliberate fixture source drift\n');
    expect(() => ledger.acquireLock(f.context.owner)).toThrow('calibration:runtime-operation-failed');
    expect(existsSync(f.root)).toBe(false);
    expect(readFileSync(join(f.mini.root, '.git/index'))).toEqual(index);
  });

  it('rejects a real V1 header copied into the V2 root without modifying the foreign state', async () => {
    const f = await fixture(); const old = await prepareCalibrationBootstrapContext(f.nativePorts);
    const legacy = await prepareNativeCalibrationBenchmarkAuthorityLedger({ context: old });
    legacy.acquireLock(old.owner); legacy.releaseLock(old.owner);
    cpSync(f.v1Root, f.root, { recursive: true, preserveTimestamps: true });
    const before = nativeTreeSnapshot(f.root);
    await expect(prepareNativeCalibrationBenchmarkAuthorityLedgerV2({ context: f.context })).rejects.toThrow(CalibrationFatalError);
    expect(nativeTreeSnapshot(f.root)).toEqual(before);
  });
});
