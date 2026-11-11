const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {validateManifest,projectCase,executeCases,assertTransferInputs}=require('./run_transfer_a1.cjs');
const {execFileSync}=require('node:child_process');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function fixture(n=3){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'transfer-owned-'));fs.mkdirSync(path.join(root,'inputs'));
 const image=Buffer.from([255,216,255,224,0,0,255,217]);fs.writeFileSync(path.join(root,'inputs/x.jpg'),image);
 const cases=Array.from({length:n},(_,i)=>({id:'nv-dish-'+i,physicalMealId:'nutritionverse-real/dish/'+i,inputStatus:'ready',inputPath:'inputs/x.jpg',inputSha256:hash(image),reference:{kcal:99999}}));
 return {root,manifest:{schemaVersion:1,datasetId:'nutritionverse-real',sampleCount:n,cases},cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}
function engine(infer){
 class Failure extends Error{constructor(){super('no_food');this.category='no_food';}}
 return {Tier1InferenceFailure:Failure,inferTier1:infer,validateTier1Photo:data=>{assert.equal(data.cloudConsent,'tier1-v1');return data.imageBase64;},estimateA0:()=>{throw Error('unexpected prior match');}};
}
const estimate=()=>({components:[{name:'owned fixture food',massG:100,catalogId:null}],totals:{kcal:200,proteinG:1,carbsG:2,fatG:3},provenance:{model:'gemini-3.8-flash',returnedModel:'gemini-3.8-flash',promptSha256:'a'.repeat(64)},question:null});
test('generic manifest accepts physical dish IDs without inventing capture dates',()=>{
 const f=fixture();try{assert.equal(validateManifest(f.manifest),f.manifest);}finally{f.cleanup();}
});
test('duplicates, mismatching physical IDs, unsafe paths and invalid counts rejected',()=>{
 const f=fixture();try{
  for(const change of [m=>m.cases[1].id=m.cases[0].id,m=>m.cases[1].physicalMealId=m.cases[0].physicalMealId,m=>m.sampleCount=21,m=>m.cases[0].inputPath='../x.jpg',m=>m.datasetId='nutrition5k']){
   const m=structuredClone(f.manifest);change(m);assert.throws(()=>validateManifest(m));
  }
 }finally{f.cleanup();}
});
test('image projection verifies bytes and excludes reference information',()=>{
 const f=fixture();try{
  const c=f.manifest.cases[0];Object.defineProperty(c,'reference',{get(){throw Error('reference read');}});
  assert.deepEqual(Object.keys(projectCase(c,f.root)).sort(),['id','inputFile','inputSha256']);
  fs.writeFileSync(path.join(f.root,'inputs/x.jpg'),'changed');assert.throws(()=>projectCase(c,f.root));
 }finally{f.cleanup();}
});
test('each inference receives only image bytes and has a pending receipt first',async()=>{
 const f=fixture();let calls=0;const runDir=path.join(f.root,'run');
 try{
  const e=engine(async(...args)=>{const index=calls++;assert.equal(args.length,1);assert.equal(typeof args[0],'string');const r=JSON.parse(fs.readFileSync(path.join(runDir,'nv-dish-'+index+'.json')));assert.equal(r.A1.status,'pending');assert.equal(r.sdkInvoked,true);return estimate();});
  const r=await executeCases({manifest:f.manifest,assetsRoot:f.root,runDir,engine:e,consent:true,expectedModel:'gemini-3.8-flash',expectedPromptSha256:'a'.repeat(64)});
  assert.equal(calls,3);assert.equal(r.sdkInvocations,3);assert.equal(r.valid,3);
  for(const c of f.manifest.cases){const row=JSON.parse(fs.readFileSync(path.join(runDir,c.id+'.json')));assert.equal(row.A0.status,'failed');assert.equal(row.A0.failure,'catalog_coverage_failure');}
  await assert.rejects(executeCases({manifest:f.manifest,assetsRoot:f.root,runDir,engine:e,consent:true}));assert.equal(calls,3);
 }finally{f.cleanup();}
});
test('systemic error halts with unattempted remainder and no retry',async()=>{
 const f=fixture();let calls=0;try{
  const e=engine(async()=>{calls++;throw Object.assign(Error('private payload must not be serialized'),{status:429});});
  const r=await executeCases({manifest:f.manifest,assetsRoot:f.root,runDir:path.join(f.root,'run'),engine:e,consent:true,expectedModel:'gemini-3.8-flash',expectedPromptSha256:'a'.repeat(64)});
  assert.equal(calls,1);assert.equal(r.failed,1);assert.equal(r.notAttempted,2);assert.equal(r.halted,true);
  const text=fs.readFileSync(path.join(f.root,'run/nv-dish-0.json'),'utf8');assert.ok(!text.includes('private payload'));
 }finally{f.cleanup();}
});
test('no-food result continues to next meal; drift halts',async()=>{
 const f=fixture();let calls=0;try{
  let e;e=engine(async()=>{calls++;if(calls===1)throw new e.Tier1InferenceFailure();return {...estimate(),provenance:{...estimate().provenance,returnedModel:'wrong'}};});
  const r=await executeCases({manifest:f.manifest,assetsRoot:f.root,runDir:path.join(f.root,'run'),engine:e,consent:true,expectedModel:'gemini-3.8-flash',expectedPromptSha256:'a'.repeat(64)});
  assert.equal(calls,2);assert.equal(r.failed,2);assert.equal(r.notAttempted,1);assert.equal(r.halted,true);
 }finally{f.cleanup();}
});
test('missing cloud consent prevents output or calls',async()=>{
 const f=fixture();try{
  await assert.rejects(executeCases({manifest:f.manifest,assetsRoot:f.root,runDir:path.join(f.root,'run'),engine:engine(async()=>{throw Error('must not call');}),consent:false}));
  assert.equal(fs.existsSync(path.join(f.root,'run')),false);
 }finally{f.cleanup();}
});
function committedFixture(){
 const f=fixture(2),repo=path.join(f.root,'repo'),remote=path.join(f.root,'remote.git');fs.mkdirSync(repo);
 const selectionPath=path.join(f.root,'selection.json');fs.writeFileSync(selectionPath,JSON.stringify(f.manifest));f.manifest.selectionSha256=hash(fs.readFileSync(selectionPath));
 const manifestPath=path.join(f.root,'private-manifest.json');fs.writeFileSync(manifestPath,JSON.stringify(f.manifest));
 fs.writeFileSync(path.join(repo,'source.txt'),'owned source');
 const profile={rights:{evaluationAllowed:true,purpose:'personal_noncommercial_evaluation',decisionEvidence:'owned test fixture only'},sampleCount:2,manifestSha256:hash(fs.readFileSync(manifestPath)),selectionSha256:f.manifest.selectionSha256,sourceFiles:[{path:'source.txt',bytes:12,sha256:hash('owned source')}]};
 const profilePath=path.join(repo,'profile.json');fs.writeFileSync(profilePath,JSON.stringify(profile));
 const git=(...a)=>execFileSync('git',a,{cwd:repo,stdio:'pipe'});
 git('init','-q','-b','main');git('init','--bare','-q',remote);git('remote','add','origin',remote);
 const commit=()=>{git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','Seed fixture');git('push','-qu','origin','main');};commit();
 return {...f,repo,profile,profilePath,manifestPath,commit,options:{repo,profilePath,manifestPath,runDir:path.join(f.root,'run'),consent:true}};
}
test('committed source gates accept exact private bytes and reject manifest drift or undecided purpose',()=>{
 const f=committedFixture();try{
  assert.equal(assertTransferInputs(f.options).manifest.sampleCount,2);
  fs.appendFileSync(f.manifestPath,' ');assert.throws(()=>assertTransferInputs(f.options),/manifest drift/);
  fs.writeFileSync(f.manifestPath,JSON.stringify(f.manifest));
  f.profile.rights.purpose='pending';fs.writeFileSync(f.profilePath,JSON.stringify(f.profile));f.commit();
  assert.throws(()=>assertTransferInputs(f.options),/purpose decision/);
 }finally{f.cleanup();}
});
test('frozen source pins cannot name a file outside the Git checkout',()=>{
 const f=committedFixture();try{
  const privateFile=path.join(f.root,'outside.txt');fs.writeFileSync(privateFile,'outside');
  f.profile.sourceFiles=[{path:'../outside.txt',bytes:7,sha256:hash('outside')}];fs.writeFileSync(f.profilePath,JSON.stringify(f.profile));f.commit();
  assert.throws(()=>assertTransferInputs(f.options),/source pin|Source pin/);
 }finally{f.cleanup();}
});
test('profile must match committed bytes even if Git hides its working-file change',()=>{
 const f=committedFixture();try{
  execFileSync('git',['update-index','--assume-unchanged','profile.json'],{cwd:f.repo,stdio:'pipe'});
  fs.appendFileSync(f.manifestPath,' ');f.profile.manifestSha256=hash(fs.readFileSync(f.manifestPath));fs.writeFileSync(f.profilePath,JSON.stringify(f.profile));
  assert.throws(()=>assertTransferInputs(f.options),/profile.*drift|Profile.*drift/);
 }finally{f.cleanup();}
});
test('pre-image selection receipt is bound to the final frozen manifest',()=>{
 const f=committedFixture();try{
  fs.appendFileSync(path.join(f.root,'selection.json'),' ');
  assert.throws(()=>assertTransferInputs(f.options),/selection.*drift|Selection.*drift/);
 }finally{f.cleanup();}
});
