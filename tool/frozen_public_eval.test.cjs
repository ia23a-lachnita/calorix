const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {buildFrozenBundle,verifyFrozenBundle,assertInputs}=require('./run_frozen_public_eval.cjs');
const sourceRepo=path.resolve(__dirname,'..');
const engine=execFileSync('git',['rev-parse','HEAD'],{cwd:sourceRepo,encoding:'utf8'}).trim();
function temporary(t){const p=fs.mkdtempSync(path.join(os.tmpdir(),'tier1-frozen-'));t.after(()=>fs.rmSync(p,{recursive:true,force:true}));return p;}
function fixture(t){
  const repo=temporary(t),manifest=path.join(repo,'manifest.json');
  fs.writeFileSync(manifest,JSON.stringify({scope:'public_dataset',sampleCount:1,cases:[{}]}));
  const git=(...args)=>execFileSync('git',args,{cwd:repo,stdio:'pipe'});
  git('init','-q');git('add','manifest.json');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','Add fixture');
  return {repo,manifest,runDir:path.join(repo,'run'),git};
}
test('exact Git-source bundle verifies; changed compiled bytes fail even if receipt hash is altered',t=>{
  const bundle=path.join(temporary(t),'bundle');buildFrozenBundle(sourceRepo,engine,bundle);
  const receipt=verifyFrozenBundle(sourceRepo,engine,bundle);assert.equal(receipt.engineCommit,engine);assert.equal(Object.keys(receipt.files).length,5);
  const name='tier1-analysis';fs.appendFileSync(path.join(bundle,name+'.js'),'\nthrow new Error("tampered");\n');
  const raw=JSON.parse(fs.readFileSync(path.join(bundle,'bundle.json')));
  raw.files[name].compiledSha256=require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(bundle,name+'.js'))).digest('hex');
  fs.writeFileSync(path.join(bundle,'bundle.json'),JSON.stringify(raw));
  assert.throws(()=>verifyFrozenBundle(sourceRepo,engine,bundle),/compiled/);
});
test('existing bundle and wrong requested source commit fail closed',t=>{
  const bundle=path.join(temporary(t),'bundle');buildFrozenBundle(sourceRepo,engine,bundle);
  assert.throws(()=>buildFrozenBundle(sourceRepo,engine,bundle));
  assert.throws(()=>verifyFrozenBundle(sourceRepo,'0'.repeat(40),bundle),/commit/);
});
test('committed clean manifest is accepted without creating a run or network request',t=>{
  const f=fixture(t);const info=assertInputs(f.repo,f.manifest,f.runDir,true);
  assert.equal(info.manifest.sampleCount,1);assert.match(info.manifestCommit,/^[a-f0-9]{40}$/);assert.equal(fs.existsSync(f.runDir),false);
});
test('missing consent and existing run or control receipt refuse before execution',t=>{
  const f=fixture(t);assert.throws(()=>assertInputs(f.repo,f.manifest,f.runDir,false),/consent/);
  fs.mkdirSync(f.runDir);assert.throws(()=>assertInputs(f.repo,f.manifest,f.runDir,true),/exists/);
  fs.rmdirSync(f.runDir);fs.writeFileSync(f.runDir+'.control.json','{}');assert.throws(()=>assertInputs(f.repo,f.manifest,f.runDir,true),/exists/);
});
test('dirty or outside manifests cannot bypass committed-input gate',t=>{
  const f=fixture(t);fs.appendFileSync(f.manifest,' ');
  assert.throws(()=>assertInputs(f.repo,f.manifest,f.runDir,true),/clean/);
  f.git('checkout','--','manifest.json');
  const outside=path.join(temporary(t),'outside.json');fs.copyFileSync(f.manifest,outside);
  assert.throws(()=>assertInputs(f.repo,outside,f.runDir,true),/inside/);
});
test('research profiles are explicit and bind the exact prompt and function',()=>{
  const select=require('./run_frozen_public_eval.cjs').resolveInferenceProfile;
  assert.equal(typeof select,'function');
  const engine={TIER1_PROMPT:'baseline',TIER1_PORTION_AUDIT_PROMPT:'baseline\naudit',
    inferTier1:async()=>{},inferTier1PortionAudit:async()=>{}};
  const original=select(engine,'original'),candidate=select(engine,'portion-audit-v1');
  assert.equal(original.infer,engine.inferTier1);assert.equal(candidate.infer,engine.inferTier1PortionAudit);
  assert.equal(original.promptSha256,require('node:crypto').createHash('sha256').update(engine.TIER1_PROMPT).digest('hex'));
  assert.equal(candidate.promptSha256,require('node:crypto').createHash('sha256').update(engine.TIER1_PORTION_AUDIT_PROMPT).digest('hex'));
  assert.equal(candidate.id,'portion-audit-v1');
});
test('unknown profiles and unavailable frozen candidate exports fail without dispatch',()=>{
  const select=require('./run_frozen_public_eval.cjs').resolveInferenceProfile;
  assert.equal(typeof select,'function');let calls=0;
  const engine={TIER1_PROMPT:'baseline',inferTier1:async()=>{calls++;}};
  assert.throws(()=>select(engine,'arbitrary'),/profile/);
  assert.throws(()=>select(engine,'portion-audit-v1'),/profile/);
  assert.equal(calls,0);
});
