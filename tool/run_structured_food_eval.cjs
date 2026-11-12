/* Engineering qualification only; never an accuracy benchmark or callable route. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const adapter=require('./structured_food_routing.cjs'),frozen=require('./run_frozen_public_eval.cjs');
const {projectCases,privateOutput}=require('./run_portion_prior_a1.cjs');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const shaPattern=/^[a-f0-9]{64}$/;
const save=(file,value)=>{fs.writeFileSync(file+'.pending',JSON.stringify(value,null,2)+'\n',{mode:0o600});fs.renameSync(file+'.pending',file);};
function verifyController(repo,runningFile=__filename,adapterFile=require.resolve('./structured_food_routing.cjs')){
 const root=fs.realpathSync(repo);
 if(fs.realpathSync(runningFile)!==fs.realpathSync(path.join(root,'tool/run_structured_food_eval.cjs'))||fs.realpathSync(adapterFile)!==fs.realpathSync(path.join(root,'tool/structured_food_routing.cjs'))||fs.realpathSync(require.resolve('./run_frozen_public_eval.cjs'))!==fs.realpathSync(path.join(root,'tool/run_frozen_public_eval.cjs'))||fs.realpathSync(require.resolve('./run_portion_prior_a1.cjs'))!==fs.realpathSync(path.join(root,'tool/run_portion_prior_a1.cjs')))throw Error('Executing controller/adapter/helpers must belong to verified checkout');
}
async function executeQualification(o,steps){
 if(o.consent!==true||!Array.isArray(o.cases)||o.cases.length!==3||new Set(o.cases.map(c=>c.id)).size!==3||o.cases.some(c=>! /^(bread|bun|doughnut|fired_dough_twist|mooncake|sachima)[0-9]{3}$/.test(c.id)||typeof c.photo!=='string'||!c.photo)||typeof o.model!=='string'||!shaPattern.test(o.promptSha256)||!shaPattern.test(o.schemaSha256))throw Error('Exactly three unique validated engineering cases and pinned profile required');
 adapter.validatePriors(o.priors);
 if(fs.existsSync(o.outputDir))throw Error('Fresh private output required');
 const registry={...o.pins,maxSdkInvocations:3,sdkInvocations:0,status:'reserved',unknownInFlight:false,startedAt:new Date().toISOString(),purpose:'known-source engineering qualification only'};
 fs.writeFileSync(o.registryPath,JSON.stringify(registry,null,2)+'\n',{flag:'wx',mode:0o600});
 fs.mkdirSync(o.outputDir,{mode:0o700});let halted=false;
 const rows=o.cases.map(c=>({id:c.id,status:'not_attempted',sdkInvoked:false,failure:null,runnerWallMs:null}));
 const checkpoint=()=>{
  const status={selected:3,sdkInvocations:registry.sdkInvocations,valid:rows.filter(r=>r.status==='ok').length,failed:rows.filter(r=>r.status==='failed').length,notAttempted:rows.filter(r=>r.status==='not_attempted').length,pending:rows.filter(r=>r.status==='pending').length,applied:rows.filter(r=>r.decision?.status==='applied').length,halted,unknownInFlight:registry.unknownInFlight,costUsd:null,purpose:registry.purpose};
  save(o.registryPath,registry);save(path.join(o.outputDir,'status.json'),status);return status;
 };
 for(const row of rows)save(path.join(o.outputDir,row.id+'.json'),row);registry.status='running';checkpoint();
 for(let i=0;i<rows.length&&!halted;i++){
  const row=rows[i],start=Date.now();let decodedReturned=false;
  row.status='pending';row.sdkInvoked=true;registry.sdkInvocations++;registry.unknownInFlight=true;registry.inFlightId=row.id;
  save(path.join(o.outputDir,row.id+'.json'),row);checkpoint();
  try{
   const decoded=await steps.infer(o.cases[i].photo);decodedReturned=true;
   const p=decoded?.estimate?.provenance;
   if(p?.model!==o.model||p.returnedModel!==o.model||p.promptSha256!==o.promptSha256||p.schemaSha256!==o.schemaSha256)throw Error('Structured model or profile drift');
   row.receipt=decoded;row.decision=adapter.routeStructuredEstimate(decoded,o.priors);row.status='ok';registry.unknownInFlight=false;
  }catch(error){
   let failure='inference_system_failure',semantic=false,knownResponse=decodedReturned;
   if(typeof error?.status==='number'&&error.status>=400&&error.status<=599){failure='http_'+error.status;knownResponse=true;}
   else if(error instanceof Error&&['Unexpected returned model version','Structured model or profile drift'].includes(error.message)){failure='model_or_profile_drift';knownResponse=true;}
   else if(error?.category==='no_food'){failure='no_food';semantic=true;knownResponse=true;}
   else if(error instanceof SyntaxError||error?.name==='ZodError'||(error instanceof Error&&(/^Invalid structured routing /.test(error.message)||['Unknown nutrient record','Unresolved food requires manual entry','Empty model response'].includes(error.message)))){failure='invalid_model_output';semantic=true;knownResponse=true;}
   row.status='failed';row.failure=failure;halted=!semantic;registry.failureCategory=failure;registry.unknownInFlight=!knownResponse;
  }
  if(!registry.unknownInFlight)delete registry.inFlightId;
  row.runnerWallMs=Date.now()-start;save(path.join(o.outputDir,row.id+'.json'),row);checkpoint();
 }
 registry.status=halted?'halted':'completed';registry.finishedAt=new Date().toISOString();return checkpoint();
}
function value(args,key){const hits=args.flatMap((x,i)=>x===key?[i]:[]);if(hits.length!==1||!args[hits[0]+1]||args[hits[0]+1].startsWith('--'))throw Error('Unique explicit '+key+' required');return args[hits[0]+1];}
async function main(args){
 const v=k=>value(args,k);if(v('--cloud-consent')!=='tier1-v1')throw Error('Cloud photo consent required');
 const repo=fs.realpathSync(v('--repo'));verifyController(repo);
 const outputDir=privateOutput(v('--output'),repo),profilePath=fs.realpathSync(v('--profile')),manifestPath=fs.realpathSync(v('--manifest')),priorsPath=fs.realpathSync(v('--priors')),root=fs.realpathSync(v('--assets-root')),bundle=fs.realpathSync(v('--bundle'));
 const git=(...a)=>execFileSync('git',a,{cwd:repo,encoding:'utf8',stdio:'pipe'}).trim();
 if(git('status','--porcelain')||git('rev-parse','HEAD')!==git('rev-parse','@{upstream}'))throw Error('Commit and push clean source before calls');
 if(!profilePath.startsWith(repo+path.sep))throw Error('Committed profile required');
 const profileRaw=fs.readFileSync(profilePath),p=JSON.parse(profileRaw),relative=path.relative(repo,profilePath);
 if(!profileRaw.equals(execFileSync('git',['show','HEAD:'+relative],{cwd:repo,stdio:'pipe'}))||p.id!=='structured-routing-qualification-v1'||p.maxSdkInvocations!==3||p.retryAttempts!==0||p.nodeVersion!==process.versions.node)throw Error('Frozen qualification profile mismatch');
 for(const pin of p.sourceFiles){
  if(path.isAbsolute(pin.path)||pin.path.split('/').includes('..'))throw Error('Invalid source pin');
  const bytes=fs.readFileSync(path.join(repo,pin.path));if(hash(bytes)!==pin.sha256||!bytes.equals(execFileSync('git',['show','HEAD:'+pin.path],{cwd:repo,stdio:'pipe'})))throw Error('Frozen source drift');
 }
 const manifestRaw=fs.readFileSync(manifestPath),priorsRaw=fs.readFileSync(priorsPath),unitRaw=fs.readFileSync(path.join(path.dirname(priorsPath),'training-units-v1.json'));
 if(hash(manifestRaw)!==p.manifestSha256||hash(priorsRaw)!==p.priorsSha256||hash(unitRaw)!==p.trainingUnitsSha256)throw Error('Pinned private input drift');
 const manifest=JSON.parse(manifestRaw),priors=JSON.parse(priorsRaw),units=JSON.parse(unitRaw);
 if(JSON.stringify(manifest.cases.map(c=>c.id))!==JSON.stringify(p.caseIds)||manifest.cases.length!==3||manifest.scope!=='known-source engineering qualification only')throw Error('Frozen engineering cases mismatch');
 if(priors.sourceReceiptSha256!==p.trainingUnitsSha256||manifest.cases.some(c=>priors.fittingIds.includes(c.id))||Object.values(priors.classes).some(c=>c.sourceReceiptSha256!==p.trainingUnitsSha256)||JSON.stringify(priors.excludedEvaluationIds)!==JSON.stringify(units.excludedEvaluationIds))throw Error('Qualified fitting/evaluation contract mismatch');
 adapter.validatePriors(priors.classes);
 frozen.verifyFrozenBundle(repo,p.engineCommit,bundle);
 const engine=require(path.join(bundle,'tier1-analysis.js')),validate=require(path.join(bundle,'tier1-callable.js')).validateTier1Photo;
 if(engine.TIER1_MODEL!==p.model||hash(engine.TIER1_PROMPT)!==p.originalPromptSha256||hash(JSON.stringify(engine.TIER1_RESPONSE_SCHEMA))!==p.originalSchemaSha256||hash(adapter.buildPrompt(engine.TIER1_PROMPT))!==p.promptSha256||hash(JSON.stringify(adapter.buildSchema(engine.TIER1_RESPONSE_SCHEMA)))!==p.schemaSha256)throw Error('Frozen model/prompt/schema mismatch');
 const cases=projectCases(manifest.cases,root,validate);
 const common=path.resolve(repo,git('rev-parse','--git-common-dir')),budgetDir=path.join(common,'calorix-eval-budgets');fs.mkdirSync(budgetDir,{recursive:true});
 const {GoogleGenAI}=require(path.join(bundle,'node_modules/@google/genai'));
 const client=new GoogleGenAI({vertexai:true,project:'calorix-xurschnell',location:'us',apiVersion:'v1',httpOptions:{baseUrl:'https://aiplatform.us.rep.googleapis.com/',timeout:30000,retryOptions:{attempts:1}}});
 const status=await executeQualification({cases,outputDir,registryPath:path.join(budgetDir,'structured-routing-qualification-v1.json'),consent:true,model:p.model,promptSha256:p.promptSha256,schemaSha256:p.schemaSha256,priors:priors.classes,pins:{sourceCommit:git('rev-parse','HEAD'),profileSha256:hash(profileRaw),manifestSha256:p.manifestSha256,priorsSha256:p.priorsSha256}}, {infer:photo=>adapter.inferStructuredTier1(photo,engine,request=>client.models.generateContent(request))});
 process.stdout.write(JSON.stringify(status)+'\n');if(status.halted)process.exitCode=2;
}
module.exports={executeQualification,verifyController};
if(require.main===module)main(process.argv.slice(2)).catch(()=>{process.stderr.write(JSON.stringify({status:'failed',detail:'Inspect private qualification receipts; no retry performed'})+'\n');process.exitCode=1;});
