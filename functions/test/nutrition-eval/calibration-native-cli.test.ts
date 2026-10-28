/** Native command integration: real authority and normalization, fake raw SDK/media. */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs, { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runNativeCalibrationCli } from '../../src/nutrition-eval/calibration-native-cli';
import { runCalibrationCli, validateCalibrationCliInvocation } from '../../src/nutrition-eval/calibration-cli';
import { CALIBRATION_ROOT } from '../../src/nutrition-eval/calibration';
import { createCalibrationBootstrapReadDeps, prepareCalibrationBootstrapContext } from '../../src/nutrition-eval/calibration-bootstrap';
import { prepareNativeCalibrationBenchmarkAuthorityLedger } from '../../src/nutrition-eval/calibration-runtime-evidence-ledger';
import { prepareCalibrationStageReportArtifactVerifier } from '../../src/nutrition-eval/calibration-report-artifact-verification';
import { NutritionEvalReportSchema } from '../../src/nutrition-eval/schema';
import * as genAI from '../../src/genai-adapter';
import * as snapshots from '../../src/nutrition-eval/calibration-off-snapshot-store';
import type { CalibrationOffSnapshotPath, CalibrationOffSnapshotStartupDeps } from '../../src/nutrition-eval/calibration-off-snapshot-store';
import * as publication from '../../src/nutrition-eval/calibration-report-publication';
import { makeCalibrationNativeCliFixture } from './calibration-native-controller-fixtures';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const roots: string[] = [];
const optIn = { RUN_NUTRITION_CALIBRATION_LIVE: '1' };
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
afterEach(() => {
  vi.restoreAllMocks();
  syncBuiltinESMExports();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function childRoot(): string {
  const parent = process.env.TMPDIR ?? resolve(repoRoot, 'functions/lib/native-cli-test-tmp');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, 'native-cli-child-'));
  roots.push(root);
  return root;
}
function childEnv(): NodeJS.ProcessEnv {
  return { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR };
}
function storedEvents(base: string): Array<Record<string, unknown>> {
  return JSON.parse(readFileSync(resolve(base, CALIBRATION_ROOT, 'ledger.json'), 'utf8')) as Array<Record<string, unknown>>;
}
function storedFiles(base: string): Record<string, string> {
  const root = resolve(base, CALIBRATION_ROOT);
  const files: Record<string, string> = {};
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else files[path.slice(root.length)] = hash(readFileSync(path));
    }
  };
  walk(root);
  return files;
}

describe('native calibration invocation validation', () => {
  it.each([
    { argv: [], env: {}, code: 'invalid_command' },
    { argv: ['preflight'], env: {}, code: 'opt_in_missing' },
    { argv: ['preflight'], env: { RUN_NUTRITION_CALIBRATION_LIVE: '0', GOOGLE_VERTEX_BASE_URL: 'https://override.invalid' }, code: 'opt_in_missing' },
    { argv: ['wrong'], env: { ...optIn, CALORIX_NUTRITION_EVAL_MODEL: 'gemini-2.5-flash' }, code: 'gemini_2_5_forbidden' },
    { argv: ['wrong'], env: optIn, code: 'invalid_command' },
    { argv: ['validation'], env: optIn, code: 'thinking_level_required' },
    { argv: ['preflight', '--thinking-level', 'low'], env: optIn, code: 'thinking_level_forbidden' },
    { argv: ['benchmark', '--thinking-level', 'LOW'], env: optIn, code: 'thinking_level_invalid' },
    { argv: ['preflight', '--run-dir', 'elsewhere'], env: optIn, code: 'invalid_command' },
    { argv: ['preflight'], env: { ...optIn, GOOGLE_VERTEX_BASE_URL: 'https://override.invalid' }, code: 'override_forbidden' },
    { argv: ['preflight'], env: { ...optIn, GOOGLE_GENAI_RETRY_OPTIONS: '{}' }, code: 'override_forbidden' },
    { argv: ['preflight'], env: { ...optIn, CALIBRATION_RUN_DIR: 'elsewhere' }, code: 'override_forbidden' },
    { argv: ['preflight'], env: { ...optIn, CALORIX_NUTRITION_EVAL_PROJECT: 'another-project' }, code: 'identity_mismatch' },
    { argv: ['preflight'], env: { ...optIn, CALORIX_NUTRITION_EVAL_MODEL: 'gemini-3.7-flash' }, code: 'identity_mismatch' },
  ])('preserves $code precedence before native effects for $argv', async ({ argv, env, code }) => {
    const fixture = await makeCalibrationNativeCliFixture(roots, { winner: 'LOW' });
    const expected = { exitCode: 1, failureCode: code };
    expect(validateCalibrationCliInvocation(argv, env)).toEqual({ valid: false, result: expected });
    expect(await runCalibrationCli(argv, env, {})).toEqual(expected);
    expect(await runNativeCalibrationCli(argv, env)).toEqual(expected);
    expect(vi.mocked(genAI.createCalibrationGenAIClient).mock.calls).toHaveLength(0);
    expect(fixture.witness.imageLoads).toEqual([]);
    expect(fixture.witness.sdkVision).toBe(0);
    expect(fixture.witness.sdkToken).toBe(0);
    expect(existsSync(resolve(fixture.root, CALIBRATION_ROOT))).toBe(false);
  });

  it('keeps the explicit old missing-dependencies boundary while returning pure valid invocation data', async () => {
    expect(validateCalibrationCliInvocation(['preflight'], optIn)).toEqual({ valid: true, stage: 'preflight' });
    expect(validateCalibrationCliInvocation(['validation', '--thinking-level', 'low'], optIn)).toEqual({ valid: true, stage: 'validation', thinkingLevel: 'low' });
    expect(await runCalibrationCli(['preflight'], optIn, {})).toEqual({ exitCode: 1, failureCode: 'dependency_missing' });
  });

  it.each([
    { argv: ['not-a-command'], code: 'invalid_command' },
    { argv: ['preflight'], code: 'opt_in_missing' },
  ])('prints one safe JSON failure from the compiled main outside repository cwd: $code', ({ argv, code }) => {
    const root = childRoot();
    const result = spawnSync(process.execPath, [resolve(repoRoot, 'functions/lib/nutrition-eval/calibration-cli.js'), ...argv], {
      cwd: root, env: childEnv(), encoding: 'utf8', timeout: 4000,
    });
    expect(result.status).toBe(1);
    expect(result.error).toBeUndefined();
    const lines = result.stdout.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toEqual({ exitCode: 1, failureCode: code });
    expect(result.stderr).not.toContain('Error:');
  });

  it('imports CLI, bootstrap, producer and native entry without starting preparation or a client', () => {
    const root = childRoot();
    const script = join(root, 'imports.cjs');
    const modulePath = resolve(repoRoot, 'functions/lib/nutrition-eval');
    writeFileSync(script, `
const path=require('node:path');
const counts={context:0,ledger:0,client:0,fetch:0};
global.fetch=async()=>{counts.fetch++;throw Error('unexpected-fetch');};
const bootstrap=require(${JSON.stringify(join(modulePath, 'calibration-bootstrap.js'))});
const authority=require(${JSON.stringify(join(modulePath, 'calibration-runtime-evidence-ledger.js'))});
const sdk=require(${JSON.stringify(resolve(repoRoot, 'functions/lib/genai-adapter.js'))});
bootstrap.prepareCalibrationBootstrapContext=async()=>{counts.context++;throw Error('unexpected-context');};
authority.prepareNativeCalibrationBenchmarkAuthorityLedger=async()=>{counts.ledger++;throw Error('unexpected-ledger');};
sdk.createCalibrationGenAIClient=()=>{counts.client++;throw Error('unexpected-client');};
let failed=false;
try { for(const name of ['calibration-cli','calibration-bootstrap','calibration-runtime-evidence-producer','calibration-native-cli'])require(path.join(${JSON.stringify(modulePath)},name+'.js')); }catch{failed=true;}
setImmediate(()=>process.stdout.write(JSON.stringify({counts,failed})+'\\n'));
`);
    const result = JSON.parse(execFileSync(process.execPath, [script], { cwd: root, env: childEnv(), encoding: 'utf8', timeout: 4000 }));
    expect(result).toEqual({ counts: { context: 0, ledger: 0, client: 0, fetch: 0 }, failed: false });
  });
});

describe('actual native calibration commands', () => {
  it('drives four LOW commands with real authority, actual SDK methods and all twelve artifacts', async () => {
    const f = await makeCalibrationNativeCliFixture(roots, { winner: 'LOW' });
    const snapshotSpy = vi.mocked(snapshots.prepareCalibrationOffSnapshotStore);
    const original = snapshotSpy.getMockImplementation();
    if (!original) throw new Error('missing-real-snapshot-observer');
    const reads: string[] = [];
    snapshotSpy.mockImplementation((deps) => {
      const captured = deps as CalibrationOffSnapshotStartupDeps;
      return original({ lockText: captured.lockText, readSnapshot: async (path: CalibrationOffSnapshotPath) => {
        reads.push(path);
        return captured.readSnapshot(path);
      } });
    });
    for (const stage of ['preflight', 'development', 'validation', 'benchmark'] as const) {
      f.beginInvocation(stage);
      const argv = stage === 'validation' || stage === 'benchmark' ? [stage, '--thinking-level', 'low'] : [stage];
      const result = await runNativeCalibrationCli(argv, f.env);
      expect(result.exitCode).toBe(0);
      expect(result.execution?.stage).toBe(stage);
      if (stage !== 'preflight') expect(result.execution?.selectedProfile).toBe('LOW');
      expect(JSON.stringify(result)).not.toContain(f.root);
      expect(JSON.stringify(result)).not.toContain('"cases"');
      expect(existsSync(resolve(f.root, CALIBRATION_ROOT, 'lock.json'))).toBe(false);
    }
    expect(f.witness.visionByStage).toEqual({ preflight: 2, development: 48, validation: 48, benchmark: 48 });
    expect(f.witness.sdkVision).toBe(146);
    expect(f.witness.sdkToken).toBe(1);
    expect(f.witness.transportVision).toBe(146);
    expect(f.witness.barcodeLookups).toBe(12);
    expect(f.witness.imageLoads).toHaveLength(147); // first token media load is separate
    expect(f.witness.imageLoads.every((row) => row.key === undefined)).toBe(true);
    expect(f.forbiddenCalls).toEqual([]);
    expect(f.finishedCanonicalKeys()).toHaveLength(158);
    expect(new Set(f.finishedCanonicalKeys().map((key) => JSON.stringify(key))).size).toBe(158);
    expect(f.bindingCount()).toBe(6);
    expect(reads).toHaveLength(16);
    for (let start = 0; start < 16; start += 4) expect(new Set(reads.slice(start, start + 4)).size).toBe(4);
    expect(vi.mocked(genAI.createCalibrationGenAIClient).mock.calls).toHaveLength(4);

    const reports = resolve(f.root, CALIBRATION_ROOT, 'reports');
    expect(readdirSync(reports)).toHaveLength(12);
    const hashes = Object.fromEntries(readdirSync(reports).map((name) => [name, hash(readFileSync(join(reports, name)))]));
    f.beginInvocation('benchmark');
    const repeat = await runNativeCalibrationCli(['benchmark', '--thinking-level', 'low'], f.env);
    expect(repeat.exitCode).toBe(0);
    expect(repeat.execution?.newSdkMethodInvocations).toEqual({ vision: 0, tokenCount: 0 });
    expect(vi.mocked(genAI.createCalibrationGenAIClient).mock.calls).toHaveLength(4);
    expect(f.witness.sdkVision).toBe(146);
    expect(f.witness.sdkToken).toBe(1);
    expect(f.bindingCount()).toBe(6);
    expect(f.finishedCanonicalKeys()).toHaveLength(158);
    expect(reads).toHaveLength(20);
    expect(Object.fromEntries(readdirSync(reports).map((name) => [name, hash(readFileSync(join(reports, name)))]))).toEqual(hashes);
    const context = await prepareCalibrationBootstrapContext(createCalibrationBootstrapReadDeps(f.root));
    const ledger = await prepareNativeCalibrationBenchmarkAuthorityLedger({ context });
    ledger.acquireLock(context.owner);
    const verifier = await prepareCalibrationStageReportArtifactVerifier(context);
    for (const stage of ['preflight', 'development', 'validation', 'benchmark'] as const) {
      const profiles = stage === 'preflight' || stage === 'development' ? ['LOW', 'MEDIUM'] as const : ['LOW'] as const;
      for (const profile of profiles) {
        const stem = `${stage}-${profile.toLowerCase()}`;
        const report = NutritionEvalReportSchema.parse(JSON.parse(readFileSync(join(reports, `${stem}.json`), 'utf8')));
        const verified = verifier.verify({ stage, profile, snapshot: ledger.getStageReportSnapshot(stage, profile) });
        expect(verified.report).toEqual(report);
        expect(verified.receipt.jsonSha256).toBe(hashes[`${stem}.json`]);
        expect(verified.receipt.markdownSha256).toBe(hashes[`${stem}.md`]);
        expect(report.cases.every((row) => row.prediction.cached === false)).toBe(true);
        expect(report.cases).toHaveLength(stage === 'preflight' ? 1 : stage === 'development' ? 24 : stage === 'validation' ? 48 : 60);
        if (stage === 'validation' || stage === 'benchmark') expect(new Set(report.cases.map((row) => row.prediction.sampleIndex))).toEqual(new Set([1, 2, 3]));
        if (stage === 'benchmark') {
          expect(report.publicCases).toBe(20);
          expect(report.privateCases).toBe(0);
          expect(report.cases.filter((row) => row.prediction.source === 'meal')).toHaveLength(36);
          expect(report.cases.filter((row) => row.prediction.source === 'label')).toHaveLength(12);
          expect(report.cases.filter((row) => row.prediction.source === 'barcode')).toHaveLength(12);
        }
      }
    }
    ledger.releaseLock(context.owner);
    expect(await runNativeCalibrationCli(['benchmark', '--thinking-level', 'medium'], f.env))
      .toEqual({ exitCode: 1, failureCode: 'thinking_level_mismatch' });
    expect(vi.mocked(genAI.createCalibrationGenAIClient).mock.calls).toHaveLength(4);
    expect(f.witness.sdkVision).toBe(146);
    expect(existsSync(resolve(f.root, CALIBRATION_ROOT, 'lock.json'))).toBe(true);
  }, 600000);

  it.each(['unreserved', 'reserved'] as const)('handles explicit recovery of a %s interruption from normally exited real child owners', async (cut) => {
    const f = await makeCalibrationNativeCliFixture(roots, { winner: 'LOW' });
    const root = childRoot();
    const script = join(root, 'unreserved-owner.cjs');
    const lib = resolve(repoRoot, 'functions/lib');
    writeFileSync(script, `
const path=require('node:path');
const {mock}=require('node:test');
const {CountTokensResponse}=require(${JSON.stringify(resolve(repoRoot, 'functions/node_modules/@google/genai'))});
const lib=${JSON.stringify(lib)};
const base=${JSON.stringify(f.root)};
const cut=${JSON.stringify(cut)};
const bootstrap=require(path.join(lib,'nutrition-eval/calibration-bootstrap.js'));
const originalRead=bootstrap.createCalibrationBootstrapReadDeps;
bootstrap.createCalibrationBootstrapReadDeps=(root)=>originalRead(root===undefined?base:root);
const assets=require(path.join(lib,'nutrition-eval/assets.js'));
const sdk=require(path.join(lib,'genai-adapter.js'));
const originalFactory=sdk.createCalibrationGenAIClient;
const counts={client:0,token:0,vision:0,images:0};
function interrupt(){process.stdout.write(JSON.stringify({interrupted:true,counts,pid:process.pid})+'\\n');process.exit(0);}
assets.loadVerifiedCaseImage=async(row)=>{
  counts.images++;
  if(counts.images>1&&cut==='unreserved')interrupt();
  return Buffer.from(JSON.stringify({caseId:row.id}));
};
sdk.createCalibrationGenAIClient=(env)=>{
  counts.client++;
  const client=originalFactory(env);
  mock.method(client.models,'countTokens',async()=>{counts.token++;const response=new CountTokensResponse();response.totalTokens=1;return response;});
  mock.method(client.models,'generateContent',async()=>{counts.vision++;interrupt();});
  return client;
};
const native=require(path.join(lib,'nutrition-eval/calibration-native-cli.js'));
native.runNativeCalibrationCli(['preflight'],{RUN_NUTRITION_CALIBRATION_LIVE:'1'})
  .then(result=>process.stdout.write(JSON.stringify({result,counts,pid:process.pid})+'\\n'))
  .catch(()=>{process.stdout.write(JSON.stringify({unexpected:true})+'\\n');process.exitCode=2;});
`);
    const first = JSON.parse(execFileSync(process.execPath, [script], { cwd: root, env: childEnv(), encoding: 'utf8', timeout: 30000 }));
    expect(first.interrupted).toBe(true);
    expect(first.result).toBeUndefined();
    expect(first.counts).toEqual({ client: 1, token: 1, vision: cut === 'reserved' ? 1 : 0, images: 2 });
    expect(existsSync(`/proc/${first.pid}`)).toBe(false);
    const reservations = storedEvents(f.root).filter((row) => row.type === 'reserved');
    expect(reservations).toHaveLength(cut === 'reserved' ? 1 : 0);
    const beforeRefusal = storedEvents(f.root);
    const second = JSON.parse(execFileSync(process.execPath, [script], { cwd: root, env: childEnv(), encoding: 'utf8', timeout: 30000 }));
    expect(second.result).toEqual({ exitCode: 1, failureCode: 'preflight_verification_failed' });
    expect(second.counts).toEqual({ client: 0, token: 0, vision: 0, images: 0 });
    expect(existsSync(`/proc/${second.pid}`)).toBe(false);
    expect(storedEvents(f.root).slice(0, beforeRefusal.length)).toEqual(beforeRefusal);
    expect(storedEvents(f.root).filter((row) => row.type === 'reserved')).toEqual(reservations);
    expect(storedEvents(f.root).filter((row) => row.type === 'runtime_attempt_finished')).toEqual([]);

    const context = await prepareCalibrationBootstrapContext(createCalibrationBootstrapReadDeps(f.root));
    const ledger = await prepareNativeCalibrationBenchmarkAuthorityLedger({ context });
    ledger.acquireLock(context.owner);
    const recovered = ledger.recoverAfterCrash(); // explicit operator action, never invoked by CLI
    expect(recovered.interrupted).toHaveLength(cut === 'reserved' ? 1 : 0);
    expect(ledger.getRuntimeEvidenceSnapshot().activeAttempt).toBe(null);
    expect(ledger.getCounts()).toEqual({ tokenCountReserved: 1, imageReserved: cut === 'reserved' ? 1 : 0 });
    expect(storedEvents(f.root).some((row) => row.type === 'runtime_attempt_abandoned')).toBe(true);
    if (cut === 'reserved') {
      expect(recovered.resumable).not.toContainEqual(recovered.interrupted[0]);
      const afterRecovery = storedFiles(f.root);
      expect(() => ledger.reserve(recovered.interrupted[0]!)).toThrow();
      expect(storedFiles(f.root)).toEqual(afterRecovery);
      expect(vi.mocked(genAI.createCalibrationGenAIClient).mock.calls).toHaveLength(0);
      expect(f.witness.sdkVision).toBe(0);
      expect(f.witness.sdkToken).toBe(0);
      return; // poisoned negative retains the actual lock; no forced release
    }
    ledger.releaseLock(context.owner);
    f.beginInvocation('preflight');
    const result = await runNativeCalibrationCli(['preflight'], f.env);
    expect(result.exitCode).toBe(0);
    expect(result.execution?.newSdkMethodInvocations).toEqual({ vision: 2, tokenCount: 0 });
    expect(f.witness.sdkVision).toBe(2);
    expect(f.witness.sdkToken).toBe(0);
    expect(f.finishedCanonicalKeys()).toHaveLength(2);
    expect(f.bindingCount()).toBe(2);
  }, 600000);

  it('captures the validated invocation before caller mutations during preparation', async () => {
    const f = await makeCalibrationNativeCliFixture(roots, { winner: 'LOW' });
    f.beginInvocation('preflight');
    const argv = ['preflight'];
    const env = { ...f.env };
    const pending = runNativeCalibrationCli(argv, env);
    argv[0] = 'benchmark';
    env.RUN_NUTRITION_CALIBRATION_LIVE = '0';
    const result = await pending;
    expect(result.exitCode).toBe(0);
    expect(result.execution?.stage).toBe('preflight');
    expect(f.witness.sdkVision).toBe(2);
    expect(f.witness.sdkToken).toBe(1);
  }, 600000);

  it.each([
    { argv: ['validation', '--thinking-level', 'low'], code: 'ledger_pin_unavailable' },
    { argv: ['development'], code: 'preflight_verification_failed' },
  ])('refuses invalid native state before client construction: $argv', async ({ argv, code }) => {
    const f = await makeCalibrationNativeCliFixture(roots, { winner: 'LOW' });
    expect(await runNativeCalibrationCli(argv, f.env)).toEqual({ exitCode: 1, failureCode: code });
    expect(vi.mocked(genAI.createCalibrationGenAIClient).mock.calls).toHaveLength(0);
    expect(f.witness.sdkVision).toBe(0);
    expect(f.witness.sdkToken).toBe(0);
  });

  it('rejects dirty Functions source before constructing a client or acquiring a root', async () => {
    const f = await makeCalibrationNativeCliFixture(roots, { winner: 'LOW' });
    writeFileSync(resolve(f.root, 'functions/dirty-native-source.ts'), 'export const dirty = true;\n');
    expect(await runNativeCalibrationCli(['preflight'], f.env)).toEqual({ exitCode: 1, failureCode: 'preflight_verification_failed' });
    expect(vi.mocked(genAI.createCalibrationGenAIClient).mock.calls).toHaveLength(0);
    expect(existsSync(resolve(f.root, CALIBRATION_ROOT))).toBe(false);
  });

  it('rejects fresh report tampering before constructing another client', async () => {
    const f = await makeCalibrationNativeCliFixture(roots, { winner: 'LOW' });
    f.beginInvocation('preflight');
    expect((await runNativeCalibrationCli(['preflight'], f.env)).exitCode).toBe(0);
    const path = resolve(f.root, CALIBRATION_ROOT, 'reports/preflight-low.json');
    const changed = readFileSync(path, 'utf8') + ' ';
    writeFileSync(path, changed);
    expect(await runNativeCalibrationCli(['preflight'], f.env)).toEqual({ exitCode: 1, failureCode: 'preflight_verification_failed' });
    expect(readFileSync(path, 'utf8')).toBe(changed);
    expect(vi.mocked(genAI.createCalibrationGenAIClient).mock.calls).toHaveLength(1);
    expect(f.witness.sdkVision).toBe(2);
  }, 600000);

  it('settles a token failure without image requests and refuses the live retained lock on repetition', async () => {
    const f = await makeCalibrationNativeCliFixture(roots, { winner: 'LOW' });
    const factory = vi.mocked(genAI.createCalibrationGenAIClient);
    const original = factory.getMockImplementation();
    if (!original) throw new Error('missing-real-client-observer');
    factory.mockImplementation((env) => {
      const client = original(env);
      const tokenSpy = vi.mocked(client.models.countTokens);
      const token = tokenSpy.getMockImplementation();
      if (!token) throw new Error('missing-sdk-token-observer');
      tokenSpy.mockImplementation(async (request) => { await token(request); throw new Error('private-token-failure'); });
      return client;
    });
    f.beginInvocation('preflight');
    const result = await runNativeCalibrationCli(['preflight'], f.env);
    expect(result).toEqual({ exitCode: 1, failureCode: 'stage_failed' });
    expect(JSON.stringify(result)).not.toContain('private-token-failure');
    expect(f.witness.sdkToken).toBe(1);
    expect(f.witness.sdkVision).toBe(0);
    expect(f.finishedCanonicalKeys()).toEqual([]);
    expect(storedEvents(f.root).filter((row) => row.type === 'token_count_failed')).toHaveLength(1);
    expect(existsSync(resolve(f.root, CALIBRATION_ROOT, 'lock.json'))).toBe(true);
    const prefix = storedFiles(f.root);
    expect(await runNativeCalibrationCli(['preflight'], f.env)).toEqual({ exitCode: 1, failureCode: 'preflight_verification_failed' });
    expect(storedFiles(f.root)).toEqual(prefix);
    expect(factory.mock.calls).toHaveLength(1);
  }, 600000);

  it('retains real publication effects and the lock when report publication becomes uncertain', async () => {
    const f = await makeCalibrationNativeCliFixture(roots, { winner: 'LOW' });
    const original = publication.publishCalibrationStageReport;
    vi.spyOn(publication, 'publishCalibrationStageReport').mockImplementation(async (...args) => { await original(...args); throw new Error('publication-after-effect'); });
    f.beginInvocation('preflight');
    expect(await runNativeCalibrationCli(['preflight'], f.env)).toEqual({ exitCode: 1, failureCode: 'stage_failed' });
    expect(existsSync(resolve(f.root, CALIBRATION_ROOT, 'reports/preflight-low.json'))).toBe(true);
    expect(existsSync(resolve(f.root, CALIBRATION_ROOT, 'reports/preflight-low.md'))).toBe(true);
    expect(existsSync(resolve(f.root, CALIBRATION_ROOT, 'lock.json'))).toBe(true);
    expect(f.bindingCount()).toBe(0);
    expect(f.finishedCanonicalKeys()).toHaveLength(2);
  }, 600000);

  it.each(['before', 'after'] as const)('reports release failure %s unlink without restoring or retrying actual effects', async (mode) => {
    const f = await makeCalibrationNativeCliFixture(roots, { winner: 'LOW' });
    const lock = resolve(f.root, CALIBRATION_ROOT, 'lock.json');
    const original = fs.unlinkSync;
    let entries = 0;
    vi.spyOn(fs, 'unlinkSync').mockImplementation((path) => {
      if (path !== lock) return original(path);
      entries++;
      if (mode === 'after') original(path);
      throw new Error('controlled-release-fault');
    });
    syncBuiltinESMExports();
    f.beginInvocation('preflight');
    const result = await runNativeCalibrationCli(['preflight'], f.env);
    expect(result.exitCode).toBe(1);
    expect(result.failureCode).toBe('stage_failed');
    expect(entries).toBe(1);
    expect(existsSync(lock)).toBe(mode === 'before');
    expect(f.finishedCanonicalKeys()).toHaveLength(2);
    expect(f.bindingCount()).toBe(2);
    expect(storedEvents(f.root).filter((row) => row.type === 'stage_completed')).toHaveLength(1);
  }, 600000);
});
