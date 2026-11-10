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
  const engine={TIER1_MODEL:'gemini-3.8-flash',TIER1_PROMPT:'baseline',TIER1_PORTION_AUDIT_PROMPT:'baseline\naudit',
    inferTier1:async()=>{},inferTier1PortionAudit:async()=>{}};
  const original=select(engine,'original'),candidate=select(engine,'portion-audit-v1');
  assert.equal(original.infer,engine.inferTier1);assert.equal(candidate.infer,engine.inferTier1PortionAudit);
  assert.equal(original.promptSha256,require('node:crypto').createHash('sha256').update(engine.TIER1_PROMPT).digest('hex'));
  assert.equal(candidate.promptSha256,require('node:crypto').createHash('sha256').update(engine.TIER1_PORTION_AUDIT_PROMPT).digest('hex'));
  assert.equal(candidate.id,'portion-audit-v1');
  assert.equal(original.model,engine.TIER1_MODEL);assert.equal(candidate.model,engine.TIER1_MODEL);
});
test('unknown profiles and unavailable frozen candidate exports fail without dispatch',()=>{
  const select=require('./run_frozen_public_eval.cjs').resolveInferenceProfile;
  assert.equal(typeof select,'function');let calls=0;
  const engine={TIER1_PROMPT:'baseline',inferTier1:async()=>{calls++;}};
  assert.throws(()=>select(engine,'arbitrary'),/profile/);
  assert.throws(()=>select(engine,'portion-audit-v1'),/profile/);
  assert.equal(calls,0);
});
test('explicit missing, duplicate or unknown profile flags cannot silently select the baseline',()=>{
  const parse=require('./run_frozen_public_eval.cjs').parseProfileArgument;
  assert.equal(typeof parse,'function');
  assert.equal(parse([]),'original');assert.equal(parse(['--profile','portion-audit-v1']),'portion-audit-v1');
  for(const args of [['--profile'],['--profile=portion-audit-v1'],['--profile','unknown'],['--profile','original','--profile','portion-audit-v1']]){
    assert.throws(()=>parse(args),/profile/);
  }
});

const paired=require('./run_bounded_portion_experiment.cjs');
function pairFixture(t){
  const root=temporary(t),outputDir=path.join(root,'experiment'),registryPath=path.join(root,'registry.json');
  const manifest={sampleCount:10,cases:Array.from({length:10},(_,i)=>({id:'dish_'+String(1500000000+i)}))};
  const options={outputDir,registryPath,manifest,consent:true,pins:{manifestSha256:'a'.repeat(64)}};
  const calls=[];
  const arm=async args=>{
    calls.push(args.profile);fs.mkdirSync(args.runDir);
    for(const c of manifest.cases)fs.writeFileSync(path.join(args.runDir,c.id+'.json'),JSON.stringify({id:c.id,sdkInvoked:true,A1:{status:'ok',failure:null}}));
    return {selectedCases:10,sdkInvocations:10,routes:{A1:{scoredCases:10,failed:0,pending:0,notAttempted:0}}};
  };
  return {root,options,calls,arm};
}
test('paired experiment reserves both arms once and cannot reset with another output directory',async t=>{
  const f=pairFixture(t);const result=await paired.executePair(f.options,f.arm);
  assert.equal(result.status,'completed');assert.deepEqual(f.calls,['original','portion-audit-v1']);
  assert.equal(result.sdkInvocations,20);assert.equal(result.maxSdkInvocations,20);
  assert.equal(result.arms[0].runDir,path.join(f.options.outputDir,'original'));
  await assert.rejects(()=>paired.executePair({...f.options,outputDir:path.join(f.root,'other')},f.arm));
  assert.equal(f.calls.length,2);assert.equal(fs.existsSync(path.join(f.root,'other')),false);
});
test('paired experiment refuses missing consent and excess or duplicate cases before claiming',async t=>{
  const f=pairFixture(t);
  for(const options of [{...f.options,consent:false},{...f.options,manifest:{...f.options.manifest,sampleCount:11}},
    {...f.options,manifest:{sampleCount:10,cases:Array(10).fill({id:'dish_1500000000'})}}])await assert.rejects(()=>paired.executePair(options,f.arm));
  assert.equal(f.calls.length,0);assert.equal(fs.existsSync(f.options.registryPath),false);
});
test('paired systemic or incomplete baseline halts candidate and retains claimed receipt',async t=>{
  for(const mode of ['http_429','model_drift','prompt_drift','inference_system_failure','unknown','missing','pending','inconsistent']){
    const f=pairFixture(t);
    const result=await paired.executePair(f.options,async args=>{
      const report=await f.arm(args),file=path.join(args.runDir,f.options.manifest.cases[0].id+'.json');
      if(mode==='missing')fs.unlinkSync(file);
      else if(mode==='inconsistent')report.sdkInvocations=9;
      else {const row=JSON.parse(fs.readFileSync(file));row.A1={status:mode==='pending'?'pending':'failed',failure:mode};fs.writeFileSync(file,JSON.stringify(row));}
      return report;
    });
    assert.equal(result.status,'halted',mode);assert.equal(f.calls.length,1,mode);
    assert.equal(result.arms[1].status,'not_attempted',mode);assert.ok(fs.existsSync(f.options.registryPath));
  }
});
test('paired per-image failures remain counted and allow candidate without retry',async t=>{
  const f=pairFixture(t);const result=await paired.executePair(f.options,async args=>{
    const report=await f.arm(args),file=path.join(args.runDir,f.options.manifest.cases[0].id+'.json');
    const row=JSON.parse(fs.readFileSync(file));row.A1={status:'failed',failure:'invalid_model_output'};fs.writeFileSync(file,JSON.stringify(row));
    report.routes.A1.scoredCases=9;report.routes.A1.failed=1;return report;
  });
  assert.equal(result.status,'completed');assert.equal(result.sdkInvocations,20);assert.equal(f.calls.length,2);
});
test('paired thrown arm closes experiment and never permits resumption',async t=>{
  const f=pairFixture(t);const result=await paired.executePair(f.options,async()=>{f.calls.push('throw');throw new Error('private provider detail');});
  assert.equal(result.status,'halted');assert.equal(f.calls.length,1);assert.equal(result.sdkInvocations,null);
  assert.equal(JSON.stringify(result).includes('private provider detail'),false);
  await assert.rejects(()=>paired.executePair(f.options,f.arm));assert.equal(f.calls.length,1);
});
test('paired immutable source profile pins reject drift before dispatch',()=>{
  const profile=JSON.parse(fs.readFileSync(path.join(sourceRepo,'functions/eval/tier1-public/portion-audit-profile-v1.json')));
  const manifest=fs.readFileSync(path.join(sourceRepo,profile.manifestPath));
  const engine={TIER1_PROMPT:profile.prompt.slice(0,-profile.addendum.length-1),TIER1_PORTION_AUDIT_PROMPT:profile.prompt};
  const bundle={lockSha256:profile.dependencyLockSha256,files:{'tier1-analysis':{sourceSha256:profile.analysisSourceSha256},'tier1-catalog':{sourceSha256:profile.catalogSourceSha256}}};
  assert.doesNotThrow(()=>paired.validatePins(profile,manifest,engine,bundle));
  for(const changed of [{...profile,promptSha256:'0'.repeat(64)},{...profile,manifestSha256:'0'.repeat(64)},{...profile,dependencyLockSha256:'0'.repeat(64)}])assert.throws(()=>paired.validatePins(changed,manifest,engine,bundle),/pin|drift/i);
});
test('model challenger profile selects a fixed function/model and reuses the production prompt',()=>{
  const select=require('./run_frozen_public_eval.cjs').resolveInferenceProfile;
  const engine={TIER1_MODEL:'gemini-3.8-flash',TIER1_CHALLENGER_MODEL:'gemini-4-argon',TIER1_PROMPT:'fixed',inferTier1:async()=>{},inferTier1Challenger:async()=>{}};
  const selected=select(engine,'vlm-challenger-v1');assert.equal(selected.model,'gemini-4-argon');assert.equal(selected.infer,engine.inferTier1Challenger);
  assert.equal(selected.promptSha256,require('node:crypto').createHash('sha256').update('fixed').digest('hex'));
  assert.equal(require('./run_frozen_public_eval.cjs').parseProfileArgument(['--profile','vlm-challenger-v1']),'vlm-challenger-v1');
  assert.throws(()=>select({...engine,TIER1_CHALLENGER_MODEL:engine.TIER1_MODEL},'vlm-challenger-v1'),/model|profile/i);
});
test('shared pair supports only the explicit research challenger while preserving its twenty-call cap',async t=>{
  const f=pairFixture(t);const result=await paired.executePair({...f.options,candidateProfile:'vlm-challenger-v1'},f.arm);
  assert.deepEqual(f.calls,['original','vlm-challenger-v1']);assert.equal(result.sdkInvocations,20);
  const bad=pairFixture(t);await assert.rejects(()=>paired.executePair({...bad.options,candidateProfile:'arbitrary'},bad.arm));
  assert.equal(bad.calls.length,0);assert.equal(fs.existsSync(bad.options.registryPath),false);
});
test('challenger source pins require the exact frozen manifest, model, schema and successful one-call probe',t=>{
  const directory=path.join(temporary(t),'bundle'),bundle=buildFrozenBundle(sourceRepo,engine,directory);
  const sourceEngine={...require(path.join(directory,'tier1-analysis.js')),TIER1_CHALLENGER_MODEL:'gemini-4-argon'};
  const manifest=fs.readFileSync(path.join(sourceRepo,'functions/eval/tier1-public/manifest-mealrange-v1.json'));
  const probeRaw=fs.readFileSync(path.join(sourceRepo,'functions/eval/tier1-public/vlm-challenger-probe-v1.json'));
  const hash=x=>require('node:crypto').createHash('sha256').update(x).digest('hex');
  const profile={baselineModel:'gemini-3.8-flash',challengerModel:'gemini-4-argon',manifestSha256:hash(manifest),promptSha256:hash(sourceEngine.TIER1_PROMPT),responseSchemaSha256:hash(JSON.stringify(sourceEngine.TIER1_RESPONSE_SCHEMA)),analysisSourceSha256:bundle.files['tier1-analysis'].sourceSha256,catalogSourceSha256:bundle.files['tier1-catalog'].sourceSha256,dependencyLockSha256:bundle.lockSha256,probeReceiptSha256:hash(probeRaw)};
  const validate=require('./run_bounded_vlm_experiment.cjs').validateModelPins;
  assert.doesNotThrow(()=>validate(profile,manifest,sourceEngine,bundle,probeRaw));
  for(const key of ['challengerModel','manifestSha256','promptSha256','responseSchemaSha256','analysisSourceSha256','catalogSourceSha256','dependencyLockSha256','probeReceiptSha256'])assert.throws(()=>validate({...profile,[key]:'wrong'},manifest,sourceEngine,bundle,probeRaw),/pin|drift|probe/i);
  const badProbe=Buffer.from(JSON.stringify({...JSON.parse(probeRaw),successfulCompatibility:false}));
  assert.throws(()=>validate({...profile,probeReceiptSha256:hash(badProbe)},manifest,sourceEngine,bundle,badProbe),/probe/i);
});

test('calibration reserves single canonical claim before calls and locks fit before TEST',async t=>{
 const root=temporary(t),registryPath=path.join(root,'claim.json'),outputDir=path.join(root,'out');
 const {execute}=require('./run_bounded_calibration.cjs');const seen=[];
 const steps={probe:async()=>{assert.ok(fs.existsSync(registryPath));seen.push('probe');return {sdkInvocations:1,successfulCompatibility:true,returnedModel:'gemini-3.8-flash'};},
 train:async()=>{seen.push('train');return 20;},fit:async()=>{seen.push('fit');return {scale:1.2,selected_training_scans:20,usable_training_scans:20};},
 test:async sha=>{seen.push('test');assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(outputDir,'profile.json'))).digest('hex'),sha);return 10;}};
 const result=await execute({registryPath,outputDir,consent:true,pins:{}},steps);
 assert.deepEqual(seen,['probe','train','fit','test']);assert.equal(result.completedSdkEntries,31);assert.equal(result.status,'completed');
 await assert.rejects(execute({registryPath,outputDir:path.join(root,'alternate'),consent:true,pins:{}},steps));assert.equal(seen.length,4);
});
test('calibration halts on invalid TRAIN or fit, never spends TEST budget, retains unknown call state',async t=>{
 const {execute}=require('./run_bounded_calibration.cjs');
 for(const failure of ['probe','train','fit','test']){
 const root=temporary(t);let tests=0;
 const result=await execute({registryPath:path.join(root,'claim'),outputDir:path.join(root,'out'),consent:true,pins:{}},{
 probe:async()=>{if(failure==='probe')throw Error('network');return {sdkInvocations:1,successfulCompatibility:true,returnedModel:'gemini-3.8-flash'};},
 train:async()=>failure==='train'?21:20,fit:async()=>({scale:failure==='fit'?Infinity:1.2,selected_training_scans:20,usable_training_scans:20}),
 test:async()=>{tests++;throw Error('interrupted');}});
 assert.equal(result.status,'halted');assert.equal(tests,failure==='test'?1:0);assert.equal(result.unknownInFlight,failure!=='fit');
 }
});
