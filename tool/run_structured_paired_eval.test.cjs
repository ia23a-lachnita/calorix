const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const engine=require('../functions/lib/tier1-analysis.js'),adapter=require('./structured_food_routing.cjs');
const {executePaired,projectPairedCases,verifyController}=require('./run_structured_paired_eval.cjs');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex'),read=f=>JSON.parse(fs.readFileSync(f));
function inventory(){return {schemaVersion:1,mealName:'Synthetic fixture',components:[{name:'Display words',massG:50,catalogId:null,preparation:'baked',assumptions:[],estimatedPer100:{kcal:200,proteinG:10,carbsG:30,fatG:5}}],ambiguities:[],askAddedFat:false};}
function a1(){const e=engine.reconcileInventory(inventory());e.provenance.returnedModel=engine.TIER1_MODEL;return e;}
async function structured(){const raw=inventory();raw.components[0].evalRouting={category:'bread',count:'one',form:'bread_slice',variant:'standard',abstainReason:null};return adapter.inferStructuredTier1('fake-jpeg',engine,async()=>({modelVersion:engine.TIER1_MODEL,text:JSON.stringify(raw)}));}
function options(root){return {cases:Array.from({length:20},(_,i)=>({id:'nv-dish-'+i,photo:'photo-'+i,armOrder:i<10?['A1','Structured']:['Structured','A1']})),outputDir:path.join(root,'run'),registryPath:path.join(root,'budget.json'),consent:true,model:engine.TIER1_MODEL,promptA1:hash(engine.TIER1_PROMPT),promptStructured:hash(adapter.buildPrompt(engine.TIER1_PROMPT)),schemaStructured:hash(JSON.stringify(adapter.buildSchema(engine.TIER1_RESPONSE_SCHEMA))),priors:{bread:{medianMassG:30,fitGroups:3,qualification:'train_single_unit_v1',sourceReceiptSha256:'a'.repeat(64)}},pins:{profileSha256:'b'.repeat(64)}};}
async function scope(fn){const root=fs.mkdtempSync(path.join(os.tmpdir(),'structured-pair-'));try{return await fn(root);}finally{fs.rmSync(root,{recursive:true,force:true});}}
test('same photo feeds both arms once in frozen balanced order with forty ceiling',()=>scope(async root=>{
 const o=options(root),seen=[];const status=await executePaired(o,{inferA1:async photo=>{seen.push(['A1',photo]);return a1();},inferStructured:async photo=>{seen.push(['Structured',photo]);return structured();}});
 assert.equal(seen.length,40);assert.deepEqual(seen.slice(0,2),[['A1','photo-0'],['Structured','photo-0']]);assert.deepEqual(seen.slice(20,22),[['Structured','photo-10'],['A1','photo-10']]);
 assert.equal(status.completePairs,20);assert.equal(status.sdkInvocations,40);assert.equal(read(o.registryPath).maxSdkInvocations,40);
 const row=read(path.join(o.outputDir,'nv-dish-0.json'));assert.equal(row.arms.A1.estimate.components[0].massG,50);assert.equal(row.arms.Structured.receipt.estimate.components[0].massG,50);assert.equal(row.arms.Structured.decision.estimate.components[0].massG,30);
}));
test('every arm has a pending receipt and counted entry before dispatch',()=>scope(async root=>{
 const o=options(root);const inspect=()=>{const reg=read(o.registryPath),r=read(path.join(o.outputDir,reg.inFlight.id+'.json'));assert.equal(r.arms[reg.inFlight.arm].status,'pending');assert.equal(reg.unknownInFlight,true);assert.equal(r.arms[reg.inFlight.arm].sdkInvoked,true);};
 await executePaired(o,{inferA1:async()=>{inspect();return a1();},inferStructured:async()=>{inspect();return structured();}});
}));
test('408 and504 count terminal case failures without retries and preserve counterpart',()=>scope(async root=>{
 for(const code of [408,504]){
  const o=options(root);o.outputDir+=code;o.registryPath+=code;let count=0;
  const s=await executePaired(o,{inferA1:async()=>{count++;if(count===1)throw Object.assign(new Error('private error'),{status:code});return a1();},inferStructured:structured});
  assert.equal(count,20);assert.equal(s.sdkInvocations,40);assert.equal(s.completePairs,19);assert.equal(s.halted,false);assert.equal(s.notAttempted,0);assert.equal(s.unknownInFlight,false);
  const row=read(path.join(o.outputDir,'nv-dish-0.json'));assert.equal(row.arms.A1.failure,'http_'+code);assert.equal(row.arms.Structured.status,'ok');assert.ok(!JSON.stringify(row).includes('private error'));
 }
}));
test('quota and model drift halt without consuming remaining budget',()=>scope(async root=>{
 for(const failure of ['quota','drift']){
  const o=options(root);o.outputDir+=failure;o.registryPath+=failure;let count=0;
  const s=await executePaired(o,{inferA1:async()=>{count++;if(failure==='quota')throw Object.assign(new Error('detail'),{status:429});const e=a1();e.provenance.returnedModel='other';return e;},inferStructured:structured});
  assert.equal(count,1);assert.equal(s.sdkInvocations,1);assert.equal(s.halted,true);assert.equal(s.notAttempted,39);assert.equal(s.unknownInFlight,false);
 }
}));
test('unknown transport uncertainty halts after one call and semantic parse errors continue',()=>scope(async root=>{
 const o=options(root);let count=0;const s=await executePaired(o,{inferA1:async()=>{count++;throw Error('unknown socket');},inferStructured:structured});assert.equal(count,1);assert.equal(s.unknownInFlight,true);assert.equal(s.notAttempted,39);
 const other=options(root);other.outputDir+='semantic';other.registryPath+='semantic';count=0;
 const t=await executePaired(other,{inferA1:async()=>{count++;if(count===1)throw SyntaxError('bad JSON');return a1();},inferStructured:structured});assert.equal(t.sdkInvocations,40);assert.equal(t.completePairs,19);assert.equal(t.halted,false);
}));
test('dataset failures keep both denominator slots without dispatching a photo',()=>scope(async root=>{
 const o=options(root);o.cases[0].photo=null;const s=await executePaired(o,{inferA1:async()=>a1(),inferStructured:structured});assert.equal(s.sdkInvocations,38);assert.equal(s.completePairs,19);assert.equal(s.selected,20);assert.equal(s.arms.A1.failed,1);assert.equal(s.arms.Structured.failed,1);
}));
test('canonical budget cannot reset via output changes and invalid bounds fail before writes',()=>scope(async root=>{
 const o=options(root);await executePaired(o,{inferA1:async()=>a1(),inferStructured:structured});o.outputDir+='new';let calls=0;await assert.rejects(executePaired(o,{inferA1:async()=>{calls++;return a1();},inferStructured:structured}));assert.equal(calls,0);
 for(const mutate of [o=>o.consent=false,o=>o.cases.pop(),o=>o.cases[1].id=o.cases[0].id,o=>o.cases[0].armOrder=['A1','A1'],o=>o.cases.forEach(c=>c.armOrder=['A1','Structured'])]){
  const x=options(root);x.registryPath+='invalid';x.outputDir+='invalid';mutate(x);await assert.rejects(executePaired(x,{inferA1:async()=>a1(),inferStructured:structured}));assert.ok(!fs.existsSync(x.registryPath));
 }
}));
test('projection strips reference labels, IDs and file paths from generator input',()=>scope(async root=>{
 const file=path.join(root,'sample.jpg'),bytes=Buffer.from('test-jpeg');fs.writeFileSync(file,bytes);
 const manifest={schemaVersion:1,datasetId:'nutritionverse-real',sampleCount:20,cases:Array.from({length:20},(_,i)=>({id:'nv-dish-'+i,physicalMealId:'nutritionverse-real/dish/'+i,inputStatus:'ready',inputPath:'sample.jpg',inputSha256:hash(bytes),armOrder:i<10?['A1','Structured']:['Structured','A1'],reference:{kcal:999},filename:'hidden-source-food'}))};
 const out=projectPairedCases(manifest,root,value=>{assert.deepEqual(Object.keys(value).sort(),['cloudConsent','imageBase64']);return value.imageBase64;});
 assert.deepEqual(Object.keys(out[0]).sort(),['armOrder','id','photo']);assert.equal(out[0].photo,bytes.toString('base64'));assert.ok(!JSON.stringify(out).includes('999'));
}));
test('controller and loaded adapter must belong to the verified checkout',()=>{
 const repo=path.resolve(__dirname,'..');verifyController(repo);assert.throws(()=>verifyController(repo,__filename),/controller|checkout/i);
});
