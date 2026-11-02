/** Native command composition; raw SDK constructor/methods and public media alone are fake. */
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runNativeCalibrationV2Cli } from '../../src/nutrition-eval/calibration-v2-native-cli';
import { runNativeCalibrationCli } from '../../src/nutrition-eval/calibration-native-cli';
import { validateCalibrationCliInvocation } from '../../src/nutrition-eval/calibration-cli';
import { createCalibrationBootstrapReadDeps, prepareCalibrationBootstrapContext } from '../../src/nutrition-eval/calibration-bootstrap';
import { prepareNativeCalibrationBenchmarkAuthorityLedger, prepareNativeCalibrationBenchmarkAuthorityLedgerV2 } from '../../src/nutrition-eval/calibration-runtime-evidence-ledger';
import { nativeTreeSnapshot } from './helpers/calibration-v2-native-runtime-fixtures';
import { v2NativeCliFixture } from './helpers/calibration-v2-native-cli-fixtures';
import { makeCalibrationNativeCliFixture } from './calibration-native-controller-fixtures';

const trust = vi.hoisted(() => ({ sha: '' }));
const sdk = vi.hoisted(() => ({ options: [] as unknown[],
  generate: undefined as undefined | ((request: unknown) => Promise<unknown>),
  count: undefined as undefined | ((request: unknown) => Promise<unknown>) }));
vi.mock('@google/genai', async original => ({ ...await original<typeof import('@google/genai')>(),
  GoogleGenAI: class {
    models = { generateContent: (request: unknown) => sdk.generate ? sdk.generate(request) : Promise.reject(new Error('fixture missing vision handler')),
      countTokens: (request: unknown) => sdk.count ? sdk.count(request) : Promise.reject(new Error('fixture missing token handler')) };
    constructor(options: unknown) { sdk.options.push(options); }
  },
}));
vi.mock('../../src/nutrition-eval/calibration-v2-lock', async original => ({
  ...await original<typeof import('../../src/nutrition-eval/calibration-v2-lock')>(),
  get CALIBRATION_ACTIVATION_LOCK_V2_SHA256() { return trust.sha; },
}));
const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); sdk.options.length = 0; sdk.generate = undefined; sdk.count = undefined;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const fixture = (options: Parameters<typeof v2NativeCliFixture>[3] = {}) => v2NativeCliFixture(roots, sha => { trust.sha = sha; }, sdk, options);
const optIn = { RUN_NUTRITION_CALIBRATION_LIVE: '1' };

describe('explicit native V2 command', () => {
  it('independent existing V1 native preflight baseline uses the same intercepted SDK constructor', async () => {
    const f = await makeCalibrationNativeCliFixture(roots, { winner: 'LOW' }); f.beginInvocation('preflight');
    const result = await runNativeCalibrationCli(['preflight'], f.env);
    expect(result.exitCode).toBe(0); expect(f.witness.sdkVision).toBe(2); expect(f.witness.sdkToken).toBe(1); expect(sdk.options).toHaveLength(1);
  }, 600000);

  it.each([
    { argv: [] as string[], env: {}, code: 'invalid_command' },
    { argv: ['preflight'], env: {}, code: 'opt_in_missing' },
    { argv: ['preflight', '--thinking-level', 'low'], env: optIn, code: 'thinking_level_forbidden' },
    { argv: ['validation'], env: optIn, code: 'thinking_level_required' },
    { argv: ['preflight'], env: { ...optIn, GOOGLE_VERTEX_BASE_URL: 'https://override.invalid' }, code: 'override_forbidden' },
    { argv: ['preflight'], env: { ...optIn, CALORIX_NUTRITION_EVAL_PROJECT: 'wrong-project' }, code: 'identity_mismatch' },
    { argv: ['preflight'], env: { ...optIn, CALORIX_NUTRITION_EVAL_MODEL: 'gemini-2.5-flash' }, code: 'gemini_2_5_forbidden' },
  ])('preserves pure $code rejection before native preparation', async ({ argv, env, code }) => {
    const f = await fixture(); const before = nativeTreeSnapshot(join(f.mini.root, '.nutrition-eval'));
    expect(validateCalibrationCliInvocation(argv, env)).toEqual({ valid: false, result: { exitCode: 1, failureCode: code } });
    expect(await runNativeCalibrationV2Cli(argv, env)).toEqual({ exitCode: 1, failureCode: code });
    expect(f.reads).not.toHaveBeenCalled(); expect(sdk.options).toHaveLength(0); expect(f.witness.vision).toBe(0); expect(f.witness.token).toBe(0);
    expect(nativeTreeSnapshot(join(f.mini.root, '.nutrition-eval'))).toEqual(before);
  }, 30000);

  it('native_preflight_spends_exactly_two_images_and_one_token through the explicit V2 entry', async () => {
    const f = await fixture(); f.begin('preflight'); const result = await runNativeCalibrationV2Cli(['preflight'], f.env);
    expect(result.exitCode).toBe(0); expect(result.execution).toMatchObject({ cumulativeImageReservations: 2, cumulativeTokenReservations: 1,
      newSdkMethodInvocations: { vision: 2, tokenCount: 1 } });
    expect(sdk.options).toHaveLength(1); expect(sdk.options[0]).toMatchObject({ vertexai: true, project: 'calorix-xurschnell', location: 'us', apiVersion: 'v1', httpOptions: { timeout: 30000 } });
    expect(f.witness.vision).toBe(2); expect(f.witness.token).toBe(1); expect(f.witness.levels).toEqual(['LOW', 'MEDIUM']);
    expect(existsSync(join(f.root, 'lock.json'))).toBe(false); expect(existsSync(f.v1Root)).toBe(false);
  }, 600000);

  it('full_hermetic_sequence_spends_146_images_and_12_barcode_outcomes through four V2 commands', async () => {
    const f = await fixture(); const stages = ['preflight', 'development', 'validation', 'benchmark'] as const;
    let selected: 'LOW' | 'MEDIUM' | undefined;
    for (const [i, stage] of stages.entries()) {
      f.begin(stage); const argv = i > 1 ? [stage, '--thinking-level', selected!.toLowerCase()] : [stage];
      const result = await runNativeCalibrationV2Cli(argv, f.env);
      expect(result.exitCode).toBe(0); expect(result.execution?.cumulativeImageReservations).toBe([2, 50, 98, 146][i]);
      expect(result.execution?.newSdkMethodInvocations).toEqual({ vision: i === 0 ? 2 : 48, tokenCount: i === 0 ? 1 : 0 });
      if (stage === 'development') { selected = result.execution?.selectedProfile; expect(['LOW', 'MEDIUM']).toContain(selected); }
      if (i > 1) expect(result.execution?.selectedProfile).toBe(selected);
      expect(existsSync(join(f.root, 'lock.json'))).toBe(false);
    }
    expect(sdk.options).toHaveLength(4); expect(f.witness.vision).toBe(146); expect(f.witness.token).toBe(1); expect(f.witness.transport).toBe(146);
    expect(f.witness.visionByStage).toEqual({ preflight: 2, development: 48, validation: 48, benchmark: 48 });
    expect(new Set(f.witness.models)).toEqual(new Set(['gemini-3.8-flash']));
    const events = JSON.parse(readFileSync(join(f.root, 'ledger.json'), 'utf8')) as Array<{ type: string; reason?: string }>;
    expect(events.filter(r => r.type === 'runtime_attempt_finished')).toHaveLength(158);
    expect(events.filter(r => r.type === 'runtime_report_bound')).toHaveLength(6);
    expect(events.filter(r => r.type === 'non_reservation_result' && r.reason === 'barcode')).toHaveLength(12);
    f.begin('benchmark'); const again = await runNativeCalibrationV2Cli(['benchmark', '--thinking-level', selected!.toLowerCase()], f.env);
    expect(again.exitCode).toBe(0); expect(again.execution?.newSdkMethodInvocations).toEqual({ vision: 0, tokenCount: 0 });
    expect(sdk.options).toHaveLength(4); expect(f.witness.vision).toBe(146); expect(f.witness.token).toBe(1);
    expect(await runNativeCalibrationV2Cli(['benchmark', '--thinking-level', selected === 'LOW' ? 'medium' : 'low'], f.env))
      .toEqual({ exitCode: 1, failureCode: 'thinking_level_mismatch' });
    expect(sdk.options).toHaveLength(4); expect(existsSync(join(f.root, 'lock.json'))).toBe(true);
  }, 600000);

  it('refuses validation before its measured predecessors without constructing a client', async () => {
    const f = await fixture(); f.begin('validation');
    expect((await runNativeCalibrationV2Cli(['validation', '--thinking-level', 'medium'], f.env)).exitCode).toBe(1);
    expect(sdk.options).toHaveLength(0); expect(f.witness.vision).toBe(0); expect(f.witness.token).toBe(0);
  }, 30000);

  it('rejects real Functions source drift before creating runtime state or a client', async () => {
    const f = await fixture(); writeFileSync(join(f.mini.root, 'functions/drift.ts'), '// deliberate source drift\n');
    expect((await runNativeCalibrationV2Cli(['preflight'], f.env)).exitCode).toBe(1);
    expect(sdk.options).toHaveLength(0); expect(existsSync(f.root)).toBe(false);
  }, 30000);

  it.each(['copied-mode', 'private-mode'] as const)('rejects foreign V1 state in %s before a client or state mutation', async kind => {
    const f = await fixture(); const old = await prepareCalibrationBootstrapContext(createCalibrationBootstrapReadDeps(f.mini.root));
    const ledger = await prepareNativeCalibrationBenchmarkAuthorityLedger({ context: old }); ledger.acquireLock(old.owner); ledger.releaseLock(old.owner);
    cpSync(f.v1Root, f.root, { recursive: true, preserveTimestamps: true });
    if (kind === 'private-mode') chmodSync(f.root, 0o700);
    const before = nativeTreeSnapshot(f.root);
    expect((await runNativeCalibrationV2Cli(['preflight'], f.env)).exitCode).toBe(1);
    expect(sdk.options).toHaveLength(0); expect(nativeTreeSnapshot(f.root)).toEqual(before);
  }, 30000);

  it('the native V2 factory itself refuses stale lock archival after a caller precheck', async () => {
    const f = await fixture(); const ledger = await prepareNativeCalibrationBenchmarkAuthorityLedgerV2({ context: f.context });
    mkdirSync(f.root, { recursive: true, mode: 0o700 });
    writeFileSync(join(f.root, 'lock.json'), JSON.stringify({ ...f.context.owner, pid: 2147483647, startTicks: 1 }), { mode: 0o600 });
    const before = nativeTreeSnapshot(f.root);
    expect(() => ledger.acquireLock(f.context.owner)).toThrow();
    expect(nativeTreeSnapshot(f.root)).toEqual(before); expect(sdk.options).toHaveLength(0);
  }, 30000);

  it('refuses a spent token prefix even when a fixture has deliberately released its lock', async () => {
    const f = await fixture(); const ledger = await prepareNativeCalibrationBenchmarkAuthorityLedgerV2({ context: f.context });
    ledger.acquireLock(f.context.owner);
    const token = { kind: 'token_count', stage: 'preflight', caseId: f.context.firstDevelopmentCaseId, model: 'gemini-3.8-flash' } as const;
    ledger.reserveTokenCount(token); ledger.completeTokenCount(token, 1); ledger.releaseLock(f.context.owner);
    // Fixture prefix setup, not runtime failure recovery/unlock or an SDK grant.
    f.begin('preflight'); expect((await runNativeCalibrationV2Cli(['preflight'], f.env)).exitCode).toBe(1);
    expect(sdk.options).toHaveLength(0); expect(f.witness.vision).toBe(0); expect(f.witness.token).toBe(0);
  }, 30000);

  it('preserves a real failed development gate and stops later commands', async () => {
    const f = await fixture({ failDevelopmentGate: true }); f.begin('preflight');
    expect((await runNativeCalibrationV2Cli(['preflight'], f.env)).exitCode).toBe(0); f.begin('development');
    expect((await runNativeCalibrationV2Cli(['development'], f.env)).exitCode).toBe(1);
    expect(f.witness.vision).toBe(50); expect(f.witness.token).toBe(1); const clients = sdk.options.length;
    const before = nativeTreeSnapshot(f.root);
    expect((await runNativeCalibrationV2Cli(['validation', '--thinking-level', 'medium'], f.env)).exitCode).toBe(1);
    expect(sdk.options).toHaveLength(clients); expect(f.witness.vision).toBe(50); expect(nativeTreeSnapshot(f.root)).toEqual(before);
  }, 600000);

  it('rejects a missing public benchmark cache before creating another client', async () => {
    const f = await fixture({ publicCacheMiss: true }); let selected: 'LOW' | 'MEDIUM' | undefined;
    for (const stage of ['preflight', 'development', 'validation'] as const) {
      f.begin(stage); const argv = stage === 'validation' ? [stage, '--thinking-level', selected!.toLowerCase()] : [stage];
      const result = await runNativeCalibrationV2Cli(argv, f.env); expect(result.exitCode).toBe(0);
      if (stage === 'development') { selected = result.execution?.selectedProfile; expect(['LOW', 'MEDIUM']).toContain(selected); }
    }
    expect(sdk.options).toHaveLength(3); f.begin('benchmark');
    expect((await runNativeCalibrationV2Cli(['benchmark', '--thinking-level', selected!.toLowerCase()], f.env)).exitCode).toBe(1);
    expect(sdk.options).toHaveLength(3); expect(f.witness.vision).toBe(98); expect(f.witness.token).toBe(1);
    expect(existsSync(join(f.root, 'lock.json'))).toBe(true);
  }, 600000);

  it.each(['live', 'dead', 'foreign'] as const)('refuses an existing %s V2 lock without changing it or constructing a client', async kind => {
    const f = await fixture(); mkdirSync(f.root, { recursive: true, mode: 0o700 });
    const owner = { ...f.context.owner, ...(kind === 'dead' ? { pid: 2147483647, startTicks: 1 } : kind === 'foreign' ? { hostname: 'foreign-fixture' } : {}) };
    writeFileSync(join(f.root, 'lock.json'), JSON.stringify(owner), { mode: 0o600 }); const before = nativeTreeSnapshot(f.root);
    expect(await runNativeCalibrationV2Cli(['preflight'], f.env)).toEqual({ exitCode: 1, failureCode: 'preflight_verification_failed' });
    expect(sdk.options).toHaveLength(0); expect(f.witness.vision).toBe(0); expect(f.witness.token).toBe(0); expect(nativeTreeSnapshot(f.root)).toEqual(before);
  }, 30000);

  it.each(['token', 'vision'] as const)('retains %s failure and refuses another command without another client or request', async kind => {
    const f = await fixture(kind === 'token' ? { failToken: true } : { failVisionAt: 1 }); f.begin('preflight');
    expect((await runNativeCalibrationV2Cli(['preflight'], f.env)).exitCode).toBe(1);
    expect(sdk.options).toHaveLength(1); expect(existsSync(join(f.root, 'lock.json'))).toBe(true);
    const before = nativeTreeSnapshot(f.root); const counts = { ...f.witness };
    expect((await runNativeCalibrationV2Cli(['preflight'], f.env)).exitCode).toBe(1);
    expect(sdk.options).toHaveLength(1); expect(f.witness.vision).toBe(counts.vision); expect(f.witness.token).toBe(counts.token);
    expect(nativeTreeSnapshot(f.root)).toEqual(before);
  }, 600000);

  it.each(['missing', 'tampered'] as const)('rejects a %s qualified first image before SDK client construction', async kind => {
    const f = await fixture(); const first = f.training[0]!; const path = join(f.imageRoot, first.image.sha256 + '.bin');
    if (kind === 'missing') rmSync(path); else writeFileSync(path, 'PRIVATE tampered bytes');
    f.begin('preflight'); expect((await runNativeCalibrationV2Cli(['preflight'], f.env)).exitCode).toBe(1);
    expect(sdk.options).toHaveLength(0); expect(f.witness.vision).toBe(0); expect(f.witness.token).toBe(0);
  }, 30000);
});
