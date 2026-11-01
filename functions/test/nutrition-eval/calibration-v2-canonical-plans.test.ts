import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import { deriveCanonicalAllowedKeys, deriveCanonicalAllowedKeysV2, deriveCanonicalReportOutcomePlan,
  deriveCanonicalReportOutcomePlanV2 } from '../../src/nutrition-eval/calibration-bootstrap';
import { createProtocolCalibrationLedgerV2 } from '../../src/nutrition-eval/calibration';
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';
import type { CalibrationProfile } from '../../src/nutrition-eval/calibration';
import type { CalibrationV2PreparedContext } from '../../src/nutrition-eval/calibration-protocol-bindings';
import { strictLedgerFixture } from './helpers/calibration-v2-strict-ledger-fixtures';
import { memoryWorld } from './helpers/calibration-v2-ledger-fixtures';

const trust = vi.hoisted(() => ({ sha: '', clients: 0, fetches: 0, writes: 0 }));
vi.mock('../../src/nutrition-eval/calibration-v2-lock', async original => ({
  ...await original<typeof import('../../src/nutrition-eval/calibration-v2-lock')>(),
  get CALIBRATION_ACTIVATION_LOCK_V2_SHA256() { return trust.sha; },
}));
vi.mock('@google/genai', async original => ({ ...await original<typeof import('@google/genai')>(),
  GoogleGenAI: class { constructor() { trust.clients++; throw new Error('forbidden planner SDK'); } } }));
beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => { trust.fetches++; throw new Error('forbidden planner fetch'); });
  for (const method of ['writeFile', 'mkdir', 'rename'] as const) vi.spyOn(fs, method).mockImplementation(() => {
    trust.writes++; throw new Error('forbidden planner filesystem port');
  });
});
afterEach(() => {
  try { expect({ clients: trust.clients, fetches: trust.fetches, writes: trust.writes }).toEqual({ clients: 0, fetches: 0, writes: 0 }); }
  finally { vi.restoreAllMocks(); trust.clients = 0; trust.fetches = 0; trust.writes = 0; }
});
const fixture = () => strictLedgerFixture(sha => { trust.sha = sha; });

describe('source-derived registered v2 canonical plans', () => {
  it.each([undefined, 'LOW', 'MEDIUM'] as const)('derives exact independent source order for profile %s', async profile => {
    const f = await fixture();
    const expected = profile === undefined ? f.plans.initial : f.plans[profile];
    const rows = deriveCanonicalReportOutcomePlanV2(f.context, profile);
    const keys = deriveCanonicalAllowedKeysV2(f.context, profile);
    expect(rows).toEqual(expected);
    expect(keys).toEqual(expected.filter(row => row.scanMode !== 'barcode').map(row => row.key));
    expect(rows).toHaveLength(profile === undefined ? 50 : 158);
    expect(keys).toHaveLength(profile === undefined ? 50 : 146);
    expect(rows.filter(row => row.scanMode === 'barcode')).toHaveLength(profile === undefined ? 0 : 12);
    expect(Object.isFrozen(rows)).toBe(true); expect(Object.isFrozen(keys)).toBe(true);
    for (const row of rows) { expect(Object.isFrozen(row)).toBe(true); expect(Object.isFrozen(row.key)).toBe(true); }
    for (const key of keys) expect(Object.isFrozen(key)).toBe(true);
    expect(keys.slice(0, 50)).toEqual(f.plans.initial.map(row => row.key));
    expect(rows.slice(0, 50)).toEqual(f.plans.initial);
  });
  it('preserves default v1 raw manifest/schema boundaries against admitted v2 files', async () => {
    const f = await fixture();
    expect(() => deriveCanonicalAllowedKeys(f.context.files)).toThrow(CalibrationFatalError);
    expect(() => deriveCanonicalReportOutcomePlan(f.context.files)).toThrow(CalibrationFatalError);
  });
  it('rejects every unregistered context before reflection or profile evaluation', async () => {
    const f = await fixture(); let traps = 0;
    const handler = { get() { traps++; throw new Error('PRIVATE planner'); },
      getOwnPropertyDescriptor() { traps++; throw new Error('PRIVATE planner'); },
      getPrototypeOf() { traps++; throw new Error('PRIVATE planner'); }, ownKeys() { traps++; throw new Error('PRIVATE planner'); } };
    const revoked = Proxy.revocable(f.context, {}); revoked.revoke();
    const profile = new Proxy({}, handler) as CalibrationProfile;
    for (const raw of [{ ...f.context }, structuredClone(f.context), new Proxy(f.context, handler), revoked.proxy,
      Object.defineProperty({}, 'files', { get() { traps++; throw new Error('PRIVATE planner'); } }), {}, null]) {
      const context = raw as Readonly<CalibrationV2PreparedContext>;
      expect(() => deriveCanonicalAllowedKeysV2(context, profile)).toThrow('calibration:v2-context-unregistered');
      expect(() => deriveCanonicalReportOutcomePlanV2(context, profile)).toThrow('calibration:v2-context-unregistered');
    }
    expect(traps).toBe(0);
  });
  it.each([null, 'low', 'HIGH', 1, NaN])('rejects invalid selected profile %s on a valid original context', async value => {
    const f = await fixture();
    expect(() => deriveCanonicalAllowedKeysV2(f.context, value as CalibrationProfile)).toThrow(CalibrationFatalError);
    expect(() => deriveCanonicalReportOutcomePlanV2(f.context, value as CalibrationProfile)).toThrow(CalibrationFatalError);
  });
  it('never coerces a hostile selected profile or exposes its private error', async () => {
    const f = await fixture(); let traps = 0;
    const profile = new Proxy({}, { get() { traps++; throw new Error('PRIVATE planner payload'); },
      getPrototypeOf() { traps++; throw new Error('PRIVATE planner payload'); } }) as CalibrationProfile;
    for (const planner of [deriveCanonicalAllowedKeysV2, deriveCanonicalReportOutcomePlanV2]) {
      let caught: unknown; try { planner(f.context, profile); } catch (error) { caught = error; }
      expect(caught).toBeInstanceOf(CalibrationFatalError); expect(String(caught)).not.toContain('PRIVATE');
    }
    expect(traps).toBe(0);
  });
  it('returns owned outputs across original contexts and interleaved profiles', async () => {
    const a = await fixture(); const b = await fixture();
    const before = deriveCanonicalReportOutcomePlanV2(a.context, 'LOW');
    const other = deriveCanonicalReportOutcomePlanV2(b.context, 'MEDIUM');
    const after = deriveCanonicalReportOutcomePlanV2(a.context, 'LOW');
    expect(before).toEqual(after); expect(before).not.toBe(after); expect(before[0]).not.toBe(after[0]);
    expect(other).toEqual(b.plans.MEDIUM); expect(before).toEqual(a.plans.LOW);
  });
  it('composes real v2 plans with the strict protocol ledger without image/client effects', async () => {
    const f = await fixture(); const world = memoryWorld();
    const ledger = createProtocolCalibrationLedgerV2(f.context, world.deps,
      profile => deriveCanonicalAllowedKeysV2(f.context, profile),
      { getReportOutcomePlan: profile => deriveCanonicalReportOutcomePlanV2(f.context, profile) });
    ledger.acquireLock(f.context.owner);
    expect(ledger.getStageReportSnapshot('preflight', 'LOW').identity).toEqual(f.context.identity);
    expect(ledger.getCounts()).toEqual({ imageReserved: 0, tokenCountReserved: 0 });
    expect(world.events).toHaveLength(1);
  });
});
