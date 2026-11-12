/* Paired private prototype evaluation. No production caller imports this module. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const adapter=require('./structured_food_routing.cjs'),frozen=require('./run_frozen_public_eval.cjs'),transfer=require('./run_transfer_a1.cjs');
const {privateOutput}=require('./run_portion_prior_a1.cjs');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex'),sha=/^[a-f0-9]{64}$/;
const safeId=x=>typeof x==='string'&&/^nv-dish-(0|[1-9][0-9]*)$/.test(x);
const save=(file,value)=>{fs.writeFileSync(file+'.pending',JSON.stringify(value,null,2)+'\n',{mode:0o600});fs.renameSync(file+'.pending',file);};
const empty=()=>({status:'not_attempted',failure:null,sdkInvoked:false,runnerWallMs:null});
function verifyController(repo,running=__filename){
 const root=fs.realpathSync(repo);
 if(fs.realpathSync(running)!==fs.realpathSync(path.join(root,'tool/run_structured_paired_eval.cjs')))throw Error('Executing controller must belong to verified checkout');
 for(const file of ['structured_food_routing.cjs','run_frozen_public_eval.cjs','run_transfer_a1.cjs','run_portion_prior_a1.cjs'])if(fs.realpathSync(require.resolve('./'+file))!==fs.realpathSync(path.join(root,'tool',file)))throw Error('Loaded helpers must belong to verified checkout');
}
function projectPairedCases(manifest,assetsRoot,validatePhoto){
 transfer.validateManifest(manifest);
 return manifest.cases.map(c=>{
  if(c.inputStatus==='dataset_failure')return {id:c.id,photo:null,armOrder:c.armOrder};
  const projected=transfer.projectCase(c,assetsRoot),bytes=fs.readFileSync(projected.inputFile);
  if(hash(bytes)!==projected.inputSha256)throw Error('Image changed before projection');
  const photo=validatePhoto({cloudConsent:'tier1-v1',imageBase64:bytes.toString('base64')});
  if(typeof photo!=='string'||!photo)throw Error('Validated JPEG required');
  return {id:c.id,photo,armOrder:c.armOrder};
 });
}
function validateCases(cases){
 if(!Array.isArray(cases)||cases.length!==20||new Set(cases.map(c=>c.id)).size!==20||cases.some(c=>!safeId(c.id)||(c.photo!==null&&(typeof c.photo!=='string'||!c.photo))||!Array.isArray(c.armOrder)||c.armOrder.length!==2||new Set(c.armOrder).size!==2||!c.armOrder.every(a=>['A1','Structured'].includes(a)))||cases.filter(c=>c.armOrder[0]==='A1').length!==10)throw Error('Exactly twenty unique cases and balanced arm order required');
}
function failureInfo(error,responseReturned){
 if(typeof error?.status==='number'&&error.status>=400&&error.status<=599)return {category:'http_'+error.status,halt:![408,504].includes(error.status),known:true};
 if(error instanceof Error&&['Unexpected returned model version','Paired model or profile drift'].includes(error.message))return {category:'model_or_profile_drift',halt:true,known:true};
 if(error?.category==='no_food')return {category:'no_food',halt:false,known:true};
 if(error instanceof SyntaxError||error?.name==='ZodError'||(error instanceof Error&&(/^Invalid structured routing /.test(error.message)||['Unknown nutrient record','Unresolved food requires manual entry','Empty model response'].includes(error.message))))return {category:'invalid_model_output',halt:false,known:true};
 return {category:'inference_system_failure',halt:true,known:responseReturned};
}
async function executePaired(o,steps){
 if(o.consent!==true||typeof o.model!=='string'||![o.promptA1,o.promptStructured,o.schemaStructured].every(v=>typeof v==='string'&&sha.test(v)))throw Error('Explicit consent and pinned arm profiles required');
 validateCases(o.cases);adapter.validatePriors(o.priors);
 if(fs.existsSync(o.outputDir))throw Error('Fresh private output required');
 const registry={...o.pins,maxSdkInvocations:40,sdkInvocations:0,status:'reserved',unknownInFlight:false,startedAt:new Date().toISOString()};
 fs.writeFileSync(o.registryPath,JSON.stringify(registry,null,2)+'\n',{flag:'wx',mode:0o600});fs.mkdirSync(o.outputDir,{mode:0o700});
 const rows=o.cases.map(c=>({id:c.id,arms:{A1:empty(),Structured:empty()}}));let halted=false;
 const checkpoint=()=>{
  const arms=Object.fromEntries(['A1','Structured'].map(name=>[name,{valid:rows.filter(r=>r.arms[name].status==='ok').length,failed:rows.filter(r=>r.arms[name].status==='failed').length,pending:rows.filter(r=>r.arms[name].status==='pending').length,notAttempted:rows.filter(r=>r.arms[name].status==='not_attempted').length}]));
  const status={selected:20,sdkInvocations:registry.sdkInvocations,arms,completePairs:rows.filter(r=>r.arms.A1.status==='ok'&&r.arms.Structured.status==='ok').length,pending:arms.A1.pending+arms.Structured.pending,notAttempted:arms.A1.notAttempted+arms.Structured.notAttempted,applied:rows.filter(r=>r.arms.Structured.decision?.status==='applied').length,halted,unknownInFlight:registry.unknownInFlight,costUsd:null};
  save(o.registryPath,registry);save(path.join(o.outputDir,'status.json'),status);return status;
 };
 for(const row of rows)save(path.join(o.outputDir,row.id+'.json'),row);registry.status='running';checkpoint();
 for(let i=0;i<rows.length&&!halted;i++){
  const row=rows[i],c=o.cases[i];
  if(c.photo===null){for(const arm of Object.values(row.arms)){arm.status='failed';arm.failure='dataset_input_failure';}save(path.join(o.outputDir,row.id+'.json'),row);checkpoint();continue;}
  for(const name of c.armOrder){
   if(halted)break;
   const arm=row.arms[name],start=Date.now();let responseReturned=false;
   arm.status='pending';arm.sdkInvoked=true;registry.sdkInvocations++;registry.unknownInFlight=true;registry.inFlight={id:row.id,arm:name};save(path.join(o.outputDir,row.id+'.json'),row);checkpoint();
   try{
    const value=await (name==='A1'?steps.inferA1(c.photo):steps.inferStructured(c.photo));responseReturned=true;
    const estimate=name==='A1'?value:value?.estimate,p=estimate?.provenance;
    if(p?.model!==o.model||p.returnedModel!==o.model||p.promptSha256!==(name==='A1'?o.promptA1:o.promptStructured)||(name==='Structured'&&p.schemaSha256!==o.schemaStructured))throw Error('Paired model or profile drift');
    if(name==='A1')arm.estimate=estimate;
    else{arm.receipt=value;arm.decision=adapter.routeStructuredEstimate(value,o.priors);}
    arm.status='ok';registry.unknownInFlight=false;
   }catch(error){
    const f=failureInfo(error,responseReturned);arm.status='failed';arm.failure=f.category;halted=f.halt;registry.unknownInFlight=!f.known;
    if(halted)registry.haltCategory=f.category;else registry.lastCaseFailure=f.category;
   }
   if(!registry.unknownInFlight)delete registry.inFlight;
   arm.runnerWallMs=Date.now()-start;save(path.join(o.outputDir,row.id+'.json'),row);checkpoint();
  }
 }
 registry.status=halted?'halted':'completed';registry.finishedAt=new Date().toISOString();return checkpoint();
}
function value(args,key){const hits=args.flatMap((x,i)=>x===key?[i]:[]);if(hits.length!==1||!args[hits[0]+1]||args[hits[0]+1].startsWith('--'))throw Error('Unique explicit '+key+' required');return args[hits[0]+1];}
let stage='startup';
async function main(args){
 const v=k=>value(args,k);if(v('--cloud-consent')!=='tier1-v1')throw Error('Cloud consent required');
 const repo=fs.realpathSync(v('--repo'));verifyController(repo);
 const profilePath=fs.realpathSync(v('--profile')),manifestPath=fs.realpathSync(v('--manifest')),priorsPath=fs.realpathSync(v('--priors')),root=fs.realpathSync(v('--assets-root')),bundle=fs.realpathSync(v('--bundle')),outputDir=privateOutput(v('--output'),repo);
 const git=(...a)=>execFileSync('git',a,{cwd:repo,encoding:'utf8',stdio:'pipe'}).trim();stage='source';
 if(git('status','--porcelain')||git('rev-parse','HEAD')!==git('rev-parse','@{upstream}'))throw Error('Commit and push clean source before calls');
 if(!profilePath.startsWith(repo+path.sep))throw Error('Committed profile required');
 const raw=fs.readFileSync(profilePath),p=JSON.parse(raw);
 if(!raw.equals(execFileSync('git',['show','HEAD:'+path.relative(repo,profilePath)],{cwd:repo,stdio:'pipe'}))||p.id!=='structured-routing-nv-paired-v2'||p.maxSdkInvocations!==40||p.retryAttempts!==0||p.nodeVersion!==process.versions.node)throw Error('Frozen paired profile mismatch');
 for(const pin of p.sourceFiles){
  if(path.isAbsolute(pin.path)||pin.path.split('/').includes('..'))throw Error('Unsafe source pin');
  const data=fs.readFileSync(path.join(repo,pin.path));if(hash(data)!==pin.sha256||!data.equals(execFileSync('git',['show','HEAD:'+pin.path],{cwd:repo,stdio:'pipe'})))throw Error('Frozen source drift');
 }
 stage='private-inputs';
 const manifestRaw=fs.readFileSync(manifestPath),selectionRaw=fs.readFileSync(path.join(path.dirname(manifestPath),'selection.json')),priorRaw=fs.readFileSync(priorsPath),unitRaw=fs.readFileSync(path.join(path.dirname(priorsPath),'training-units-v1.json')),scanRaw=fs.readFileSync(v('--exposure-scan'));
 if(hash(manifestRaw)!==p.manifestSha256||hash(selectionRaw)!==p.selectionSha256||hash(priorRaw)!==p.priorsSha256||hash(unitRaw)!==p.trainingUnitsSha256||hash(scanRaw)!==p.exposureScanSha256)throw Error('Frozen private input drift');
 const manifest=transfer.validateManifest(JSON.parse(manifestRaw)),selection=JSON.parse(selectionRaw),priors=JSON.parse(priorRaw),scan=JSON.parse(scanRaw);
 if(manifest.sampleCount!==20||manifest.selectionSha256!==p.selectionSha256||manifest.exposureScanSha256!==p.exposureScanSha256||JSON.stringify(manifest.cases.map(c=>[c.id,c.sourceImagePath,c.armOrder]))!==JSON.stringify(selection.cases.map(c=>[c.id,c.sourceImagePath,c.armOrder]))||manifest.cases.some(c=>scan.excludedIds.includes(c.id)))throw Error('Fresh paired selection mismatch');
 const ready=manifest.cases.filter(c=>c.inputStatus==='ready');if(new Set(ready.map(c=>c.inputSha256)).size!==ready.length)throw Error('Duplicate prepared photos');
 const rightsRaw=fs.readFileSync(path.join(repo,'functions/eval/transfer/nutritionverse-rights-v1.json')),rights=JSON.parse(rightsRaw);
 if(hash(rightsRaw)!==p.rightsDecisionSha256||manifest.rightsDecisionSha256!==p.rightsDecisionSha256||rights.rights?.evaluationAllowed!==true||rights.rights.purpose!=='personal_noncommercial_evaluation'||typeof rights.rights.decisionEvidence!=='string'||!rights.rights.decisionEvidence.trim())throw Error('Compatible private prototype purpose required');
 if(priors.sourceReceiptSha256!==p.trainingUnitsSha256||Object.values(priors.classes).some(c=>c.sourceReceiptSha256!==p.trainingUnitsSha256)||manifest.cases.some(c=>priors.fittingIds.includes(c.id)))throw Error('Qualified training priors required');
 adapter.validatePriors(priors.classes);stage='bundle';frozen.verifyFrozenBundle(repo,p.engineCommit,bundle);
 const engine=require(path.join(bundle,'tier1-analysis.js')),validate=require(path.join(bundle,'tier1-callable.js')).validateTier1Photo;
 if(engine.TIER1_MODEL!==p.model||hash(engine.TIER1_PROMPT)!==p.originalPromptSha256||hash(JSON.stringify(engine.TIER1_RESPONSE_SCHEMA))!==p.originalSchemaSha256||hash(adapter.buildPrompt(engine.TIER1_PROMPT))!==p.structuredPromptSha256||hash(JSON.stringify(adapter.buildSchema(engine.TIER1_RESPONSE_SCHEMA)))!==p.structuredSchemaSha256)throw Error('Arm model/schema/profile mismatch');
 const cases=projectPairedCases(manifest,root,validate);validateCases(cases);
 const common=path.resolve(repo,git('rev-parse','--git-common-dir')),budgetDir=path.join(common,'calorix-eval-budgets');fs.mkdirSync(budgetDir,{recursive:true});
 const {GoogleGenAI}=require(path.join(bundle,'node_modules/@google/genai')),client=new GoogleGenAI({vertexai:true,project:'calorix-xurschnell',location:'us',apiVersion:'v1',httpOptions:{baseUrl:'https://aiplatform.us.rep.googleapis.com/',timeout:30000,retryOptions:{attempts:1}}});stage='dispatch';
 const status=await executePaired({cases,outputDir,registryPath:path.join(budgetDir,'structured-routing-nv-paired-v2.json'),consent:true,model:p.model,promptA1:p.originalPromptSha256,promptStructured:p.structuredPromptSha256,schemaStructured:p.structuredSchemaSha256,priors:priors.classes,pins:{sourceCommit:git('rev-parse','HEAD'),profileSha256:hash(raw),manifestSha256:p.manifestSha256,selectionSha256:p.selectionSha256,exposureScanSha256:p.exposureScanSha256}}, {inferA1:photo=>engine.inferTier1(photo),inferStructured:photo=>adapter.inferStructuredTier1(photo,engine,request=>client.models.generateContent(request))});
 process.stdout.write(JSON.stringify(status)+'\n');if(status.halted)process.exitCode=2;
}
module.exports={executePaired,projectPairedCases,verifyController};
if(require.main===module)main(process.argv.slice(2)).catch(()=>{process.stderr.write(JSON.stringify({status:'failed',stage,detail:'Inspect private receipts; no retry performed'})+'\n');process.exitCode=1;});
