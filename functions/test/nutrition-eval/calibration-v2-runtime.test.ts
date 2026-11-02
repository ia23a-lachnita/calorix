import { afterEach, describe, expect, it, vi } from 'vitest';
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { prepareCalibrationBootstrapContext } from '../../src/nutrition-eval/calibration-bootstrap';
import { requireMatchingCalibrationV2Ledger } from '../../src/nutrition-eval/calibration';
import { prepareNativeCalibrationBenchmarkAuthorityLedger, prepareNativeCalibrationBenchmarkAuthorityLedgerV2 } from '../../src/nutrition-eval/calibration-runtime-evidence-ledger';
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';
import { nativeMiniFixture, nativeV2RuntimeFixture, nativeTreeSnapshot } from './helpers/calibration-v2-native-runtime-fixtures';
import { captureCalibrationV2ExecutionBinding } from '../../src/nutrition-eval/calibration-v2-execution-capture';
import { captureProducerInputV2 } from '../../src/nutrition-eval/calibration-runtime-evidence-producer-input';
import { prepareCalibrationRuntimeEvidenceProducerV2 } from '../../src/nutrition-eval/calibration-runtime-evidence-producer';
import { prepareCalibrationStageDriver, prepareCalibrationStageDriverV2 } from '../../src/nutrition-eval/calibration-stage-driver';
import { v1StageDriverFixture, v2StageDriverFixture } from './helpers/calibration-v2-stage-driver-fixtures';

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

const driverFixture = (options: Parameters<typeof v2StageDriverFixture>[2] = {}) =>
  v2StageDriverFixture(roots, sha => { trust.sha = sha; }, options);
type DriverFixtureV2 = Awaited<ReturnType<typeof driverFixture>>;
const producerDeps = (f: DriverFixtureV2) => ({ context: f.context, ledger: f.ledger,
  loadImage: f.deps.loadImage, generateVision: f.deps.generateVision, lookupSnapshot: f.deps.lookupSnapshot });
const preflightKey = (f: DriverFixtureV2) => ({ stage: 'preflight' as const, profile: 'LOW' as const,
  caseId: f.context.firstDevelopmentCaseId, sampleIndex: 1 });
const sdkCounts = (f: DriverFixtureV2) => ({ vision: f.witness.sdkVision, token: f.witness.sdkToken });
const DRIVER_FAILED = 'calibration:stage-driver-failed';
const PRODUCER_FAILED = 'calibration:runtime-evidence-producer-failed';

describe('V2 original-reference producer and native stage driver', () => {
  it('independent V1 native driver preflight baseline uses the same raw fake SDK/media fixture', async () => {
    const f = await v1StageDriverFixture(roots); f.beginStage('preflight');
    const driver = await prepareCalibrationStageDriver(f.deps); const result = await driver.executeStage('preflight');
    expect(result.cumulativeImageReservations).toBe(2); expect(result.cumulativeTokenReservations).toBe(1);
    expect(f.witness.sdkVision).toBe(2); expect(f.witness.sdkToken).toBe(1);
    expect(result.receipts).toHaveLength(2); f.ledger.releaseLock(f.context.owner);
  }, 600000);

  it('captures genuine original references only, leaving secondary fields unreflected', async () => {
    const f = await driverFixture(); let reads = 0;
    const deps = { context: f.context, ledger: f.ledger };
    Object.defineProperty(deps, 'callback', { enumerable: true, get() { reads++; throw new Error('PRIVATE'); } });
    const before = nativeTreeSnapshot(f.root); const binding = captureCalibrationV2ExecutionBinding(deps);
    expect(binding.context).toBe(f.context); expect(binding.ledger).toBe(f.ledger); expect(Object.isFrozen(binding)).toBe(true);
    expect(reads).toBe(0); expect(nativeTreeSnapshot(f.root)).toEqual(before);
  });

  it('retains the registered context in captured input and never registers its bound method view', async () => {
    const f = await driverFixture(); const checkExecution = vi.fn(); const before = nativeTreeSnapshot(f.root);
    const input = captureProducerInputV2({ ...producerDeps(f), checkExecution });
    expect(input.context).toBe(f.context); expect(input.plan).toHaveLength(50);
    expect(input.checkExecution).toBe(checkExecution); expect(checkExecution).not.toHaveBeenCalled();
    expect(() => requireMatchingCalibrationV2Ledger(f.context, input.ledger)).toThrow('calibration:v2-ledger-context-mismatch');
    expect(nativeTreeSnapshot(f.root)).toEqual(before);
  });

  it.each(['clone-context', 'proxy-context', 'wrapped-handle', 'proxy-handle'] as const)('rejects %s before callback descriptor getters', async kind => {
    const f = await driverFixture(); let reads = 0;
    const context = kind === 'clone-context' ? { ...f.context } : kind === 'proxy-context' ? new Proxy(f.context, {}) : f.context;
    const ledger = kind === 'wrapped-handle' ? { ...f.ledger } : kind === 'proxy-handle' ? new Proxy(f.ledger, {}) : f.ledger;
    const input = { ...producerDeps(f), context, ledger };
    Object.defineProperty(input, 'loadImage', { enumerable: true, get() { reads++; throw new Error('PRIVATE'); } });
    const code = kind.includes('context') ? 'calibration:v2-context-unregistered' : 'calibration:v2-ledger-context-mismatch';
    expect(() => captureProducerInputV2(input)).toThrow(code);
    await expect(prepareCalibrationRuntimeEvidenceProducerV2(input)).rejects.toThrow(code);
    const deps = { ...f.deps, context, ledger };
    Object.defineProperty(deps, 'countTokens', { enumerable: true, get() { reads++; throw new Error('PRIVATE'); } });
    await expect(prepareCalibrationStageDriverV2(deps)).rejects.toThrow(code);
    expect(reads).toBe(0); expect(sdkCounts(f)).toEqual({ vision: 0, token: 0 });
  });

  it('rejects an observed context reference swap between prefix validation and full input capture', async () => {
    const f = await driverFixture(); let reads = 0; const input = producerDeps(f);
    const deps = new Proxy(input, { getOwnPropertyDescriptor(target, name) {
      const descriptor = Reflect.getOwnPropertyDescriptor(target, name);
      if (name === 'context' && ++reads > 1) return { ...descriptor!, value: { ...f.context } };
      return descriptor;
    } });
    expect(() => captureProducerInputV2(deps)).toThrow(PRODUCER_FAILED);
    expect(reads).toBeGreaterThan(1); expect(sdkCounts(f)).toEqual({ vision: 0, token: 0 });
  });

  it('does not call the parent guard during construction and sanitizes its execution rejection', async () => {
    const f = await driverFixture(); const checkExecution = vi.fn(() => { throw new Error('PRIVATE-parent'); });
    const before = nativeTreeSnapshot(f.root);
    const producer = await prepareCalibrationRuntimeEvidenceProducerV2({ ...producerDeps(f), checkExecution });
    expect(checkExecution).not.toHaveBeenCalled();
    await expect(producer.runOutcome(preflightKey(f), async () => 'unused', () => undefined)).rejects.toThrow(PRODUCER_FAILED);
    expect(checkExecution).toHaveBeenCalled(); expect(nativeTreeSnapshot(f.root)).toEqual(before);
    expect(sdkCounts(f)).toEqual({ vision: 0, token: 0 });
  });

  it('checks producer phase again after a swallowed parent-guard reentry before reserving an image', async () => {
    const f = await driverFixture(); f.beginStage('preflight');
    const token = { kind: 'token_count', stage: 'preflight', caseId: f.context.firstDevelopmentCaseId, model: 'gemini-3.8-flash' } as const;
    f.ledger.reserveTokenCount(token); f.ledger.completeTokenCount(token, (await f.deps.countTokens()).tokenCount);
    let armed = false, fired = false;
    const deps = { ...producerDeps(f), generateVision: ((...args: Parameters<DriverFixtureV2['deps']['generateVision']>) => {
      armed = true; return f.deps.generateVision(...args);
    }), checkExecution: () => {
      if (armed && !fired) { fired = true; void producer.runOutcome(preflightKey(f), async () => 'stale', () => undefined).catch(() => undefined); }
    } };
    const producer: Awaited<ReturnType<typeof prepareCalibrationRuntimeEvidenceProducerV2>> = await prepareCalibrationRuntimeEvidenceProducerV2(deps);
    await expect(producer.runOutcome(preflightKey(f), async caps => {
      const bytes = await caps.loadImage(); return caps.generateVision({ prompt: 'fixture prompt', imageBase64: Buffer.from(bytes).toString('base64') });
    }, () => undefined)).rejects.toThrow(PRODUCER_FAILED);
    expect(fired).toBe(true); expect(f.ledger.getCounts()).toMatchObject({ imageReserved: 0 });
    expect(sdkCounts(f)).toEqual({ vision: 0, token: 1 });
  });

  it('retains the driver guard when a raw callback reenters across original-handle producer dispatch', async () => {
    const f = await driverFixture(); f.beginStage('preflight');
    let reentries = 0;
    const deps = { ...f.deps, generateVision: ((...args: Parameters<DriverFixtureV2['deps']['generateVision']>) => {
      reentries++;
      void driver.executeStage('preflight').catch(() => undefined);
      return f.deps.generateVision(...args);
    }) };
    const driver: Awaited<ReturnType<typeof prepareCalibrationStageDriverV2>> = await prepareCalibrationStageDriverV2(deps);
    await expect(driver.executeStage('preflight')).rejects.toThrow(DRIVER_FAILED);
    expect(reentries).toBe(1); expect(f.ledger.getCounts()).toMatchObject({ imageReserved: 0 });
    expect(sdkCounts(f)).toEqual({ vision: 0, token: 1 });
    expect(existsSync(join(f.root, 'lock.json'))).toBe(true);
  }, 600000);

  it('rejects source drift after driver preparation before token or image effects', async () => {
    const f = await driverFixture(); const driver = await prepareCalibrationStageDriverV2(f.deps);
    const before = nativeTreeSnapshot(f.root);
    writeFileSync(join(f.context.baseDir, 'functions/drift.ts'), '// deliberate fixture source drift\n');
    f.beginStage('preflight'); await expect(driver.executeStage('preflight')).rejects.toThrow(DRIVER_FAILED);
    expect(sdkCounts(f)).toEqual({ vision: 0, token: 0 }); expect(nativeTreeSnapshot(f.root)).toEqual(before);
  }, 600000);

  it('native_preflight_spends_exactly_two_images_and_one_token', async () => {
    const f = await driverFixture(); const before = nativeTreeSnapshot(f.root);
    const driver = await prepareCalibrationStageDriverV2(f.deps);
    expect(nativeTreeSnapshot(f.root)).toEqual(before); expect(sdkCounts(f)).toEqual({ vision: 0, token: 0 });
    f.beginStage('preflight'); const result = await driver.executeStage('preflight');
    expect(result.newSdkMethodInvocations).toEqual({ vision: 2, tokenCount: 1 });
    expect(result.cumulativeImageReservations).toBe(2); expect(result.cumulativeTokenReservations).toBe(1);
    expect(result.receipts).toHaveLength(2); expect(sdkCounts(f)).toEqual({ vision: 2, token: 1 });
    expect(f.witness.modelIds).toEqual(['gemini-3.8-flash', 'gemini-3.8-flash']);
    expect(f.witness.thinkingLevels).toEqual(['LOW', 'MEDIUM']);
    for (const receipt of result.receipts) {
      const report = JSON.parse(readFileSync(join(f.root, 'reports', `preflight-${receipt.profile.toLowerCase()}.json`), 'utf8')) as { calibration: { protocolVersion: string } };
      expect(report.calibration.protocolVersion).toBe('calorix-gemini-38-calibration-v2');
    }
  }, 600000);

  it('full_hermetic_sequence_spends_146_images_and_12_barcode_outcomes', async () => {
    const f = await driverFixture(); const driver = await prepareCalibrationStageDriverV2(f.deps);
    const stages = ['preflight', 'development', 'validation', 'benchmark'] as const;
    for (const [i, stage] of stages.entries()) {
      f.beginStage(stage); const result = await driver.executeStage(stage);
      expect(result.cumulativeImageReservations).toBe([2, 50, 98, 146][i]);
      expect(result.cumulativeTokenReservations).toBe(1);
      expect(result.newSdkMethodInvocations).toEqual({ vision: i === 0 ? 2 : 48, tokenCount: i === 0 ? 1 : 0 });
      if (i > 0) expect(result.selectedProfile).toBe('MEDIUM');
    }
    expect(f.witness.visionByStage).toEqual({ preflight: 2, development: 48, validation: 48, benchmark: 48 });
    expect(f.witness.sdkVision).toBe(146); expect(f.witness.transportVision).toBe(146);
    expect(f.witness.sdkToken).toBe(1); expect(f.witness.barcodeLookups).toBe(12);
    expect(f.witness.imageCaseIds).toHaveLength(146);
    const rows = JSON.parse(readFileSync(join(f.root, 'ledger.json'), 'utf8')) as Array<{ type: string }>;
    expect(rows.filter(r => r.type === 'runtime_attempt_finished')).toHaveLength(158);
    expect(rows.filter(r => r.type === 'runtime_report_bound')).toHaveLength(6);
    const before = nativeTreeSnapshot(f.root); f.beginStage('benchmark');
    const replay = await driver.executeStage('benchmark');
    expect(replay.newSdkMethodInvocations).toEqual({ vision: 0, tokenCount: 0 });
    expect(nativeTreeSnapshot(f.root)).toEqual(before);
    f.ledger.releaseLock(f.context.owner);
  }, 600000);

  it.each(['failed', 'ambiguous'] as const)('failed_or_ambiguous_stage_replay_spends_zero_more_calls: %s', async kind => {
    const f = await driverFixture(kind === 'failed' ? { failVisionAt: 1 } : {}); f.beginStage('preflight');
    if (kind === 'ambiguous') {
      const token = { kind: 'token_count', stage: 'preflight', caseId: f.context.firstDevelopmentCaseId, model: 'gemini-3.8-flash' } as const;
      f.ledger.reserveTokenCount(token); f.ledger.completeTokenCount(token, (await f.deps.countTokens()).tokenCount);
      const key = preflightKey(f); const ref = f.ledger.startRuntimeAttempt(key);
      f.ledger.startRuntimeOperation(ref, 'image'); f.ledger.settleRuntimeOperation(ref, 'image', 'returned');
      f.ledger.startRuntimeOperation(ref, 'vision');
      await f.deps.generateVision('gemini-3.8-flash', 'fixture prompt', Buffer.from(JSON.stringify({ caseId: key.caseId })).toString('base64'), 'meal', {
        mode: 'calibration', thinkingLevel: 'LOW', imageMediaType: 'image/png', timeoutMs: 30000,
        beforeRequest: async () => { f.ledger.reserve(key); f.ledger.authorizeRuntimeRequest(ref); },
      });
      expect(f.ledger.getCounts()).toMatchObject({ imageReserved: 1 });
      expect(f.ledger.getStageReportSnapshot('preflight', 'LOW').counts.imageCallsPending).toBe(1);
    }
    const driver = await prepareCalibrationStageDriverV2(f.deps);
    await expect(driver.executeStage('preflight')).rejects.toThrow(DRIVER_FAILED);
    const before = sdkCounts(f); const again = await prepareCalibrationStageDriverV2(f.deps);
    await expect(again.executeStage('preflight')).rejects.toThrow(DRIVER_FAILED);
    expect(sdkCounts(f)).toEqual(before); expect(before).toEqual({ vision: 1, token: 1 });
    const reopened = await prepareNativeCalibrationBenchmarkAuthorityLedgerV2({ context: f.context });
    const restarted = await prepareCalibrationStageDriverV2({ ...f.deps, ledger: reopened });
    await expect(restarted.executeStage('preflight')).rejects.toThrow(DRIVER_FAILED);
    expect(sdkCounts(f)).toEqual(before);
    expect(existsSync(join(f.root, 'lock.json'))).toBe(true);
  }, 600000);

  it('preserves a genuine development gate failure and refuses further SDK calls', async () => {
    const f = await driverFixture({ failDevelopmentGate: true }); const driver = await prepareCalibrationStageDriverV2(f.deps);
    f.beginStage('preflight'); await driver.executeStage('preflight'); f.beginStage('development');
    await expect(driver.executeStage('development')).rejects.toThrow(DRIVER_FAILED);
    expect(sdkCounts(f)).toEqual({ vision: 50, token: 1 });
    const again = await prepareCalibrationStageDriverV2(f.deps);
    await expect(again.executeStage('development')).rejects.toThrow(DRIVER_FAILED);
    expect(sdkCounts(f)).toEqual({ vision: 50, token: 1 }); expect(existsSync(join(f.root, 'lock.json'))).toBe(true);
  }, 600000);

  it('foreign_report_receipt_never_grants_authority', async () => {
    const f = await driverFixture(); const driver = await prepareCalibrationStageDriverV2(f.deps);
    f.beginStage('preflight'); await driver.executeStage('preflight');
    const old = await v1StageDriverFixture(roots); const oldDriver = await prepareCalibrationStageDriver(old.deps);
    old.beginStage('preflight'); await oldDriver.executeStage('preflight');
    for (const ext of ['json', 'md']) writeFileSync(join(f.root, 'reports', `preflight-low.${ext}`), readFileSync(join(old.root, 'reports', `preflight-low.${ext}`)));
    const before = nativeTreeSnapshot(f.root), counts = sdkCounts(f);
    expect(() => f.ledger.admitStageReportReceipt('preflight', 'LOW')).toThrow();
    f.beginStage('development'); await expect(driver.executeStage('development')).rejects.toThrow(DRIVER_FAILED);
    expect(sdkCounts(f)).toEqual(counts); expect(nativeTreeSnapshot(f.root)).toEqual(before);
  }, 600000);

  it.each(['validation', 'benchmark'] as const)('refuses unselected %s before any SDK method', async stage => {
    const f = await driverFixture(); const driver = await prepareCalibrationStageDriverV2(f.deps);
    f.beginStage(stage); await expect(driver.executeStage(stage)).rejects.toThrow(DRIVER_FAILED);
    expect(sdkCounts(f)).toEqual({ vision: 0, token: 0 });
  });

  it.each(['accessor', 'undefined'] as const)('rejects %s checkExecution dependency without invoking it', async kind => {
    const f = await driverFixture(); const deps = producerDeps(f); let calls = 0;
    if (kind === 'accessor') Object.defineProperty(deps, 'checkExecution', { enumerable: true, get() { calls++; return () => undefined; } });
    else Object.assign(deps, { checkExecution: undefined });
    expect(() => captureProducerInputV2(deps)).toThrow(PRODUCER_FAILED);
    expect(calls).toBe(0); expect(sdkCounts(f)).toEqual({ vision: 0, token: 0 });
  });
});
