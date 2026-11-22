const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {buildFrozenBundle}=require('./run_frozen_public_eval.cjs');
const {compareSavedMeal,ENGINE_COMMIT,disableNetwork}=require('./compare_saved_meal.cjs');
const hash=b=>createHash('sha256').update(b).digest('hex');
const repo=path.resolve(__dirname,'..');
let root,engine,cli;
before(()=>{
  root=fs.mkdtempSync(path.join(os.tmpdir(),'saved-meal-fixtures-'));
  const bundle=path.join(root,'engine');buildFrozenBundle(repo,ENGINE_COMMIT,bundle);
  engine=require(path.join(bundle,'tier1-analysis.js'));cli=require(path.join(bundle,'tier1-cli.js'));
});
after(()=>{if(root)fs.rmSync(root,{recursive:true,force:true});});
function fixture(t,{unknown=false,question=false,analysis=true}={}){
  const dir=fs.mkdtempSync(path.join(root,'case-'));
  const photo=Buffer.from([255,216,255,217]);fs.writeFileSync(path.join(dir,'photo.jpg'),photo);
  const estimate=engine.reconcileInventory({schemaVersion:1,mealName:'Synthetic parser fixture',
    components:[{name:'Rice',massG:100,catalogId:unknown?null:'usda:168878',preparation:'cooked',assumptions:[],
      estimatedPer100:unknown?{kcal:200,proteinG:4,carbsG:10,fatG:16}:null}],ambiguities:[],askAddedFat:question});
  Object.assign(estimate.provenance,{returnedModel:engine.TIER1_MODEL,latencyMs:1234,inputTokens:5,outputTokens:8,costUsd:null});
  const record={schemaVersion:1,exportedAtUtc:'2026-11-18T10:00:00Z',referenceMeasurementsIncluded:false,
    photoFile:'photo.jpg',photoSha256:hash(photo),meal:{schemaVersion:1,id:'synthetic-001',revision:1,
      capturedAt:'2026-11-18T09:00:00Z',name:'Synthetic parser fixture',photoPath:undefined,
      analysis:analysis?estimate:null,served:analysis?estimate.totals:null,cloudConsent:analysis,source:analysis?'A1':'camera',
      consumedFraction:null,consumptionSource:'served_only',metadata:{referenceIsWeighed:false}}};
  const input=path.join(dir,'meal.json'),output=path.join(dir,'comparison.json');
  const save=()=>fs.writeFileSync(input,JSON.stringify(record));save();
  const run=()=>compareSavedMeal({recordPath:input,outputPath:output});
  return {dir,input,output,record,estimate,save,run};
}
test('paired original-inventory comparison uses frozen helpers, hashes and private fresh output',t=>{
  const f=fixture(t),before=fs.readFileSync(f.input),report=f.run();
  assert.deepEqual(report.predictions,cli.createPilotPredictions(f.estimate,'synthetic-001').predictions);
  assert.deepEqual(report.predictions.map(p=>p.served_kcal),[260,130]);
  assert.equal(report.reconstruction.engine.engineCommit,ENGINE_COMMIT);
  assert.match(report.reconstruction.scope,/historical exactness not established/);
  assert.equal(report.reconstruction.sdkCalls,0);
  assert.equal(report.reconstruction.inferenceInputSha256,null);
  assert.equal(report.reconstruction.recordSha256,hash(before));
  assert.equal(report.reconstruction.photoSha256,f.record.photoSha256);
  assert.match(report.reconstruction.latencyScope,/original server/);
  assert.equal(fs.statSync(f.output).mode&0o777,0o600);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.output)),report);
  assert.deepEqual(fs.readFileSync(f.input),before);
});
test('unknown nutrient coverage retains failed A0 and successful A1',t=>{
  const r=fixture(t,{unknown:true}).run();
  assert.deepEqual(r.predictions.map(p=>p.status),['failed','ok']);
  assert.equal(r.predictions[0].served_kcal,null);assert.equal(r.predictions[1].served_kcal,200);
});
test('answered preparation and all saved corrections never enter unassisted reconstruction',t=>{
  const f=fixture(t,{question:true});
  f.record.meal.analysis=engine.answerPreparation(f.estimate,'oil_10g');
  f.record.meal.analysis.userPreparationAnswer='About 2 tsp oil (10 g)';
  Object.assign(f.record.meal,{schemaVersion:2,name:'Edited',served:{kcal:9999},consumedFraction:0.5,
    portionOverrides:{0:999},foodOverrides:{0:'usda:123'},adjustmentHistory:[{kind:'manual_totals'}],revision:8});
  f.save();const r=f.run();
  assert.deepEqual(r.predictions.map(p=>p.served_kcal),[260,130]);
  assert.ok(r.predictions.every(p=>p.user_answer===null&&p.corrections===0&&p.consumed_kcal===null));
  assert.equal(r.initial_estimate.question.answered,false);
  assert.match(r.warnings.join(' '),/answers.*corrections.*consumption/);
});
test('typed component shares never enter the original inventory comparison',t=>{
  const f=fixture(t);
  Object.assign(f.record.meal,{schemaVersion:3,portionInputs:{0:{unit:'batch',amount:1,
    numerator:1,denominator:3,referenceAmount:1,referenceGrams:100,referenceSource:'photo'}},
    portionOverrides:{0:100/3},consumedFraction:1/3,revision:3});
  f.save();
  assert.deepEqual(f.run().predictions,cli.createPilotPredictions(f.estimate,'synthetic-001').predictions);
});
test('no saved analysis yields two explicit failures, not fabricated calorie values',t=>{
  const r=fixture(t,{analysis:false}).run();
  assert.deepEqual(r.predictions.map(p=>p.status),['failed','failed']);
  assert.ok(r.predictions.every(p=>p.served_kcal===null&&p.failure_reason));
  assert.equal(r.reconstruction.sdkCalls,0);
  assert.equal(r.initial_estimate,null);
  assert.equal(r.reconstruction.analysisAvailability,'absent');
  assert.equal(r.reconstruction.originalInferenceStatus,'unknown');
});
test('missing raw inventory or changed profile refuses without creating output',t=>{
  for(const mutate of [a=>delete a.rawInventory,a=>a.provenance.model='other',a=>a.provenance.returnedModel='other',
    a=>delete a.provenance.returnedModel,a=>a.provenance.promptSha256='0'.repeat(64),
    a=>a.provenance.catalogVersion='other',a=>a.provenance.schemaVersion=2,a=>a.schemaVersion=2,
    a=>a.rawInventory.components[0].massG=-1]){
    const f=fixture(t);mutate(f.record.meal.analysis);f.save();
    assert.throws(f.run);assert.equal(fs.existsSync(f.output),false);
  }
});
test('bad envelope, unsaved meal, photo path, hash or JPEG refuses without output',t=>{
  for(const mutate of [r=>r.schemaVersion=2,r=>r.referenceMeasurementsIncluded=true,r=>r.photoFile='../photo.jpg',
    r=>r.photoSha256='0'.repeat(64),r=>r.meal.revision=0,r=>r.meal.id='../escape',
    r=>r.meal.photoPath='/private/app/photo.jpg',r=>r.meal.schemaVersion=3,
    r=>r.meal.id=123,r=>r.meal.id=['synthetic-001']]){
    const f=fixture(t);mutate(f.record);f.save();assert.throws(f.run);assert.equal(fs.existsSync(f.output),false);
  }
  const f=fixture(t);fs.writeFileSync(path.join(f.dir,'photo.jpg'),'not JPEG');assert.throws(f.run);
});
test('JSON and photo size limits reject before output; symlinks cannot redirect fixed sibling',t=>{
  const a=fixture(t);fs.writeFileSync(a.input,' '.repeat(1024*1024+1));assert.throws(a.run,/limit|large/);
  const b=fixture(t);fs.truncateSync(path.join(b.dir,'photo.jpg'),20*1024*1024+1);assert.throws(b.run,/limit|large/);
  const c=fixture(t),target=path.join(root,'redirect.jpg');fs.copyFileSync(path.join(c.dir,'photo.jpg'),target);
  fs.unlinkSync(path.join(c.dir,'photo.jpg'));fs.symlinkSync(target,path.join(c.dir,'photo.jpg'));assert.throws(c.run);
});
test('existing output cannot be overwritten, including dangling symlinks',t=>{
  const f=fixture(t);fs.writeFileSync(f.output,'retain');assert.throws(f.run,/exist/);
  assert.equal(fs.readFileSync(f.output,'utf8'),'retain');
  fs.unlinkSync(f.output);fs.symlinkSync(path.join(f.dir,'missing'),f.output);assert.throws(f.run);
  assert.equal(fs.existsSync(path.join(f.dir,'missing')),false);
});
test('real CLI succeeds offline and rejects inference flags; input remains private',t=>{
  const f=fixture(t);const command=['tool/compare_saved_meal.cjs','--meal',f.input,'--output',f.output];
  const r=spawnSync(process.execPath,command,{cwd:repo,encoding:'utf8',env:{...process.env,GOOGLE_APPLICATION_CREDENTIALS:'/nonexistent'}});
  assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(fs.readFileSync(f.output)).reconstruction.sdkCalls,0);
  const bad=spawnSync(process.execPath,[...command,'--cloud-consent','tier1-v1'],{cwd:repo,encoding:'utf8'});
  assert.notEqual(bad.status,0);assert.match(bad.stderr,/argument|Usage/);
});
test('offline dispatch guard rejects standard HTTP, fetch, TCP, TLS and UDP calls',()=>{
  disableNetwork();
  for(const call of [()=>fetch('https://example.invalid'),()=>require('node:http').get('http://example.invalid'),
    ()=>require('node:https').request('https://example.invalid'),()=>require('node:net').connect(9,'127.0.0.1'),
    ()=>new (require('node:net').Socket)().connect(9,'127.0.0.1'),
    ()=>require('node:tls').connect(9,'127.0.0.1'),()=>require('node:dgram').createSocket('udp4')]){
    assert.throws(call,/network dispatch prohibited/);
  }
});
