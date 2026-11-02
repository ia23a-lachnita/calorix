/** Compiled child-process import, invalid-main and interrupted-owner checks; never real model calls. */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nativeTreeSnapshot } from './helpers/calibration-v2-native-runtime-fixtures';
import { v2NativeCliFixture } from './helpers/calibration-v2-native-cli-fixtures';

const trust = vi.hoisted(() => ({ sha: '' }));
vi.mock('../../src/nutrition-eval/calibration-v2-lock', async original => ({
  ...await original<typeof import('../../src/nutrition-eval/calibration-v2-lock')>(),
  get CALIBRATION_ACTIVATION_LOCK_V2_SHA256() { return trust.sha; },
}));
const root = fileURLToPath(new URL('../../../', import.meta.url));
const lib = resolve(root, 'functions/lib'); const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true }); });
function taskDir(): string {
  const parent = process.env.TMPDIR ?? join(root, '.superpowers/sdd/2026-10-30-calibration-v2-runtime/tmp');
  mkdirSync(parent, { recursive: true }); const path = mkdtempSync(join(parent, 'v2-cli-child-')); roots.push(path); return path;
}
const childEnv = (): NodeJS.ProcessEnv => ({ PATH: process.env.PATH, TMPDIR: process.env.TMPDIR });

describe('compiled explicit V2 entrypoints', () => {
  it('compiled_import_and_invalid_main_have_zero_effects', () => {
    const temp = taskDir(); const preload = join(temp, 'traps.cjs'); const report = join(temp, 'counts.json');
    writeFileSync(preload, `
const fs=require('node:fs'),fsp=require('node:fs/promises'),Module=require('node:module');
const originalWrite=fs.writeFileSync;
const counts={context:0,ledger:0,clientFactory:0,sdkConstructors:0,fetch:0,writes:0,nativeImports:0};
global.fetch=async()=>{counts.fetch++;throw Error('forbidden fetch');};
for(const obj of [fs,fsp])for(const name of ['writeFileSync','mkdirSync','renameSync','unlinkSync','linkSync','writeFile','mkdir','rename','unlink','link'])if(typeof obj[name]==='function')obj[name]=()=>{counts.writes++;throw Error('forbidden write');};
const originalLoad=Module._load;
Module._load=function(id,parent,main){
 if(typeof id==='string'&&/calibration-(v2-native-cli|native-cli)(\\.js)?$/.test(id))counts.nativeImports++;
 const actual=originalLoad.call(this,id,parent,main);
 if(id==='@google/genai')return {...actual,GoogleGenAI:class{constructor(){counts.sdkConstructors++;throw Error('forbidden client');}}};
 if(typeof id==='string'&&/calibration-v2-bootstrap(\\.js)?$/.test(id))actual.createCalibrationV2BootstrapReadDeps=()=>{counts.context++;throw Error('forbidden context');};
 if(typeof id==='string'&&/calibration-runtime-evidence-ledger(\\.js)?$/.test(id))actual.prepareNativeCalibrationBenchmarkAuthorityLedgerV2=()=>{counts.ledger++;throw Error('forbidden ledger');};
 if(typeof id==='string'&&/genai-adapter(\\.js)?$/.test(id))actual.createCalibrationGenAIClient=()=>{counts.clientFactory++;throw Error('forbidden factory');};
 return actual;
};
process.on('exit',()=>originalWrite(${JSON.stringify(report)},JSON.stringify(counts)));
`);
    const imported = spawnSync(process.execPath, ['--require', preload, '-e', `for(const name of ['calibration-v2-cli','calibration-v2-native-cli','calibration-native-cli'])require(${JSON.stringify(join(lib, 'nutrition-eval'))}+'/'+name+'.js')`],
      { cwd: temp, env: childEnv(), encoding: 'utf8', timeout: 15000 });
    expect(imported.status).toBe(0); expect(imported.error).toBeUndefined();
    const importedCounts = JSON.parse(readFileSync(report, 'utf8')) as Record<string, number>;
    expect(importedCounts).toMatchObject({ context: 0, ledger: 0, clientFactory: 0, sdkConstructors: 0, fetch: 0, writes: 0 });
    for (const argv of [['not-a-command'], ['preflight']]) {
      const child = spawnSync(process.execPath, ['--require', preload, join(lib, 'nutrition-eval/calibration-v2-cli.js'), ...argv],
        { cwd: temp, env: childEnv(), encoding: 'utf8', timeout: 15000 });
      expect(child.status).toBe(1); expect(child.error).toBeUndefined();
      expect(JSON.parse(child.stdout.trim())).toEqual({ exitCode: 1, failureCode: argv[0] === 'preflight' ? 'opt_in_missing' : 'invalid_command' });
      expect(JSON.parse(readFileSync(report, 'utf8'))).toEqual({ context: 0, ledger: 0, clientFactory: 0, sdkConstructors: 0, fetch: 0, writes: 0, nativeImports: 0 });
    }
  }, 60000);

  it('preserves the additive package command and the existing V1 command', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'functions/package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['eval:nutrition:calibration']).toBe('npm run build && node lib/nutrition-eval/calibration-cli.js');
    expect(pkg.scripts['eval:nutrition:calibration:v2']).toBe('npm run build && node lib/nutrition-eval/calibration-v2-cli.js');
  });

  it('retains a SIGTERM owner lock and ambiguous spent request, then refuses retry with zero more calls', async () => {
    const hooks = { options: [] as unknown[] }; const f = await v2NativeCliFixture(roots, sha => { trust.sha = sha; }, hooks);
    const temp = taskDir(); const data = join(temp, 'admission.json'); const script = join(temp, 'interrupt.cjs');
    writeFileSync(data, JSON.stringify(f.serializedAdmission()));
    writeFileSync(script, `
const fs=require('node:fs'),path=require('node:path'),lib=${JSON.stringify(lib)},base=${JSON.stringify(f.mini.root)};
const raw=JSON.parse(fs.readFileSync(${JSON.stringify(data)},'utf8'));
const decode=s=>Buffer.from(s,'base64');
function input(){return {...raw,activationLockBytes:decode(raw.activationLockBytes),candidateBytes:decode(raw.candidateBytes),corpusLockBytes:decode(raw.corpusLockBytes),bundle:Object.fromEntries(Object.entries(raw.bundle).map(([k,v])=>[k,decode(v)])),images:new Map(raw.images.map(([k,v])=>[k,decode(v)])),priorEvidence:new Map(raw.priorEvidence.map(([k,v])=>[k,decode(v)]))};}
const lock=require(path.join(lib,'nutrition-eval/calibration-v2-lock.js'));lock.CALIBRATION_ACTIVATION_LOCK_V2_SHA256=raw.expectedActivationLockSha256;
const bootstrap=require(path.join(lib,'nutrition-eval/calibration-v2-bootstrap.js')),actualRead=bootstrap.createCalibrationV2BootstrapReadDeps;
bootstrap.createCalibrationV2BootstrapReadDeps=root=>({...actualRead(root===undefined?base:root),readAdmissionInputs:async()=>input()});
const counts={clientFactory:0,token:0,vision:0,fetch:0};global.fetch=async()=>{counts.fetch++;throw Error('forbidden fetch');};
const sdk=require(path.join(lib,'genai-adapter.js'));
sdk.createCalibrationGenAIClient=()=>{counts.clientFactory++;return {models:{countTokens:async()=>{counts.token++;return {totalTokens:1};},generateContent:async()=>{counts.vision++;fs.writeSync(1,JSON.stringify({interrupted:true,counts,pid:process.pid})+'\\n');process.kill(process.pid,'SIGTERM');return new Promise(()=>{});}}};};
require(path.join(lib,'nutrition-eval/calibration-v2-native-cli.js')).runNativeCalibrationV2Cli(['preflight'],{RUN_NUTRITION_CALIBRATION_LIVE:'1'})
 .then(result=>fs.writeSync(1,JSON.stringify({result,counts,pid:process.pid})+'\\n'))
 .catch(()=>{fs.writeSync(1,JSON.stringify({unexpected:true,counts})+'\\n');process.exitCode=2;});
`);
    const interrupted = spawnSync(process.execPath, [script], { cwd: temp, env: childEnv(), encoding: 'utf8', timeout: 30000 });
    expect(interrupted.signal).toBe('SIGTERM'); expect(interrupted.error).toBeUndefined();
    const first = JSON.parse(interrupted.stdout.trim()) as { interrupted: boolean; counts: Record<string, number>; pid: number };
    expect(first.interrupted).toBe(true); expect(first.counts).toEqual({ clientFactory: 1, token: 1, vision: 1, fetch: 0 });
    expect(existsSync(`/proc/${first.pid}`)).toBe(false); expect(existsSync(join(f.root, 'lock.json'))).toBe(true);
    const events = JSON.parse(readFileSync(join(f.root, 'ledger.json'), 'utf8')) as Array<{ type: string }>;
    expect(events.filter(row => row.type === 'reserved')).toHaveLength(1); expect(events.filter(row => row.type === 'runtime_request_authorized')).toHaveLength(1);
    expect(events.filter(row => row.type === 'runtime_attempt_finished')).toHaveLength(0);
    const before = nativeTreeSnapshot(f.root);
    const retry = spawnSync(process.execPath, [script], { cwd: temp, env: childEnv(), encoding: 'utf8', timeout: 30000 });
    expect(retry.status).toBe(0); expect(retry.error).toBeUndefined();
    expect(JSON.parse(retry.stdout.trim())).toMatchObject({ result: { exitCode: 1, failureCode: 'preflight_verification_failed' }, counts: { clientFactory: 0, token: 0, vision: 0, fetch: 0 } });
    expect(nativeTreeSnapshot(f.root)).toEqual(before);
  }, 90000);
});
