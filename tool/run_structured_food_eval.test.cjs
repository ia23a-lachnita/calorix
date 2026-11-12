const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const engine=require('../functions/lib/tier1-analysis.js'),adapter=require('./structured_food_routing.cjs');
const {executeQualification,verifyController}=require('./run_structured_food_eval.cjs');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function options(root){return {cases:['bread004','doughnut003','mooncake001'].map(id=>({id,photo:'synthetic-test-jpeg'})),outputDir:path.join(root,'output'),registryPath:path.join(root,'budget.json'),consent:true,model:'gemini-3.8-flash',promptSha256:hash(adapter.buildPrompt(engine.TIER1_PROMPT)),schemaSha256:hash(JSON.stringify(adapter.buildSchema(engine.TIER1_RESPONSE_SCHEMA))),priors:{bread:{medianMassG:30,fitGroups:3,qualification:'train_single_unit_v1',sourceReceiptSha256:'a'.repeat(64)}},pins:{profileSha256:'b'.repeat(64)}};}
async function receipt(massG=50){return adapter.inferStructuredTier1('synthetic-test-jpeg',engine,async()=>({modelVersion:engine.TIER1_MODEL,text:JSON.stringify({schemaVersion:1,mealName:'Synthetic fixture',components:[{name:'Any display name',massG,catalogId:null,preparation:'baked',assumptions:[],estimatedPer100:{kcal:200,proteinG:10,carbsG:30,fatG:5},evalRouting:{category:'bread',count:'one',form:'bread_slice',variant:'standard',abstainReason:null}}],ambiguities:[],askAddedFat:false})}));}
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
async function scope(fn){const root=fs.mkdtempSync(path.join(os.tmpdir(),'structured-qual-'));try{return await fn(root);}finally{fs.rmSync(root,{recursive:true,force:true});}}
test('three successful requests preserve raw and counterfactual receipts',()=>scope(async root=>{
 const o=options(root);let calls=0;const status=await executeQualification(o,{infer:async()=>{calls++;return receipt();}});
 assert.equal(calls,3);assert.deepEqual([status.valid,status.failed,status.notAttempted,status.sdkInvocations],[3,0,0,3]);
 const row=read(path.join(o.outputDir,'bread004.json'));assert.equal(row.receipt.estimate.components[0].massG,50);assert.equal(row.decision.estimate.components[0].massG,30);
 assert.equal(read(o.registryPath).maxSdkInvocations,3);assert.equal(read(o.registryPath).status,'completed');
}));
test('pending receipt and counted SDK entry exist before the only dispatch',()=>scope(async root=>{
 const o=options(root);await executeQualification(o,{infer:async()=>{
  const reg=read(o.registryPath),row=read(path.join(o.outputDir,reg.inFlightId+'.json'));
  assert.equal(row.status,'pending');assert.equal(row.sdkInvoked,true);assert.equal(reg.unknownInFlight,true);assert.ok(reg.sdkInvocations>=1);return receipt();
 }});
}));
test('received HTTP504 halts with unattempted remainder, without retry or raw error disclosure',()=>scope(async root=>{
 const o=options(root);let calls=0;const result=await executeQualification(o,{infer:async()=>{calls++;if(calls===2)throw Object.assign(new Error('private provider credential detail'),{status:504});return receipt();}});
 assert.equal(calls,2);assert.deepEqual([result.valid,result.failed,result.notAttempted,result.pending],[1,1,1,0]);assert.equal(result.halted,true);assert.equal(result.unknownInFlight,false);
 assert.equal(read(path.join(o.outputDir,'doughnut003.json')).failure,'http_504');
 assert.ok(!fs.readFileSync(path.join(o.outputDir,'doughnut003.json'),'utf8').includes('private provider'));
}));
test('unknown transport failure preserves uncertain-flight accounting and does not continue',()=>scope(async root=>{
 const o=options(root);let calls=0;const status=await executeQualification(o,{infer:async()=>{calls++;throw Error('socket detail');}});
 assert.equal(calls,1);assert.equal(status.unknownInFlight,true);assert.equal(status.notAttempted,2);
}));
test('semantic malformed output counts failure and keeps the denominator',()=>scope(async root=>{
 const o=options(root);let calls=0;const status=await executeQualification(o,{infer:async()=>{calls++;if(calls===1)throw SyntaxError('bad JSON');return receipt();}});
 assert.equal(calls,3);assert.equal(status.failed,1);assert.equal(status.valid,2);assert.equal(status.selected,3);assert.equal(status.halted,false);
}));
test('model, prompt and schema drift stop further calls',()=>scope(async root=>{
 for(const key of ['returnedModel','promptSha256','schemaSha256']){
  const o=options(root);o.outputDir+=key;o.registryPath+=key;let calls=0;
  const status=await executeQualification(o,{infer:async()=>{calls++;const out=await receipt();out.estimate.provenance[key]='different';return out;}});
  assert.equal(calls,1);assert.equal(status.halted,true);assert.equal(status.unknownInFlight,false);
 }
}));
test('canonical one-use budget cannot be reset by changing output directory',()=>scope(async root=>{
 const o=options(root);await executeQualification(o,{infer:()=>receipt()});o.outputDir+='different';let calls=0;
 await assert.rejects(executeQualification(o,{infer:async()=>{calls++;return receipt();}}));assert.equal(calls,0);assert.equal(read(o.registryPath).sdkInvocations,3);
}));
test('invalid consent, duplicate cases and wrong bounds fail before side effects',()=>scope(async root=>{
 for(const mutate of [o=>o.consent=false,o=>o.cases.pop(),o=>o.cases.push(o.cases[0]),o=>o.cases[1].id=o.cases[0].id,o=>o.priors={classes:{}}]){
  const o=options(root);mutate(o);await assert.rejects(executeQualification(o,{infer:()=>receipt()}));assert.ok(!fs.existsSync(o.registryPath));
 }
}));
test('executing controller and adapter must belong to the verified checkout',()=>{
 const repo=path.resolve(__dirname,'..');verifyController(repo);
 assert.throws(()=>verifyController(repo,__filename),/controller|checkout/i);
 assert.throws(()=>verifyController(repo,path.join(__dirname,'run_structured_food_eval.cjs'),__filename),/controller|checkout/i);
});

test('numeric scaling failure is recorded as failed rather than successful null nutrients',()=>scope(async root=>{
 const o=options(root);let calls=0;
 const status=await executeQualification(o,{infer:async()=>{calls++;return receipt(calls===1?5e-324:50);}});
 assert.equal(calls,3);assert.equal(status.failed,1);assert.equal(status.valid,2);
 const row=read(path.join(o.outputDir,'bread004.json'));assert.equal(row.status,'failed');assert.equal(row.failure,'invalid_model_output');assert.equal(row.decision,undefined);
}));
