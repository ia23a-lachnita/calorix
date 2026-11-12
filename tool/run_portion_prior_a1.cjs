/* Bounded original-A1 prediction run; no reference labels enter inference. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const frozen=require('./run_frozen_public_eval.cjs');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const safeId=x=>typeof x==='string'&&/^(bread|bun|doughnut|fired_dough_twist|mooncake|sachima)[0-9]{3}$/.test(x);
const save=(file,value)=>{fs.writeFileSync(file+'.pending',JSON.stringify(value,null,2)+'\n',{mode:0o600});fs.renameSync(file+'.pending',file);};
const empty=(status='not_attempted',failure=null)=>({status,predicted:null,massG:null,failure});
function projectCases(cases,assetsRoot,validatePhoto){
 if(!Array.isArray(cases)||cases.length<1||cases.length>20||new Set(cases.map(c=>c.id)).size!==cases.length)throw Error('Unique bounded cases required');
 const root=fs.realpathSync(assetsRoot);
 return cases.map(c=>{
  if(!safeId(c.id))throw Error('Canonical portion ID required');
  if(c.inputStatus==='dataset_failure')return {id:c.id,photo:null};
  if(c.inputStatus!=='ready'||typeof c.inputPath!=='string'||path.isAbsolute(c.inputPath)||c.inputPath.split(/[\\/]/).includes('..')||!/^([0-9a-f]{64})$/.test(c.inputSha256))throw Error('Pinned relative image required');
  const file=fs.realpathSync(path.resolve(root,c.inputPath));
  if(!file.startsWith(root+path.sep)||!fs.statSync(file).isFile()||fs.statSync(file).size>4*1024*1024)throw Error('Escaped or oversized image');
  const bytes=fs.readFileSync(file);if(hash(bytes)!==c.inputSha256)throw Error('Image hash drift');
  const photo=validatePhoto({cloudConsent:'tier1-v1',imageBase64:bytes.toString('base64')});
  if(typeof photo!=='string'||!photo)throw Error('Validated image required');
  return {id:c.id,photo};
 });
}
async function executeStudy(o,steps){
 if(o.consent!==true||!Array.isArray(o.cases)||o.cases.length<1||o.cases.length>20||new Set(o.cases.map(c=>c.id)).size!==o.cases.length||o.cases.some(c=>!safeId(c.id)||(c.photo!==null&&typeof c.photo!=='string'))||typeof o.expectedModel!=='string'||!/^([a-f0-9]{64})$/.test(o.expectedPromptSha256))throw Error('Explicit consent and frozen bounded cases/model/prompt required');
 if(fs.existsSync(o.outputDir))throw Error('Fresh output required');
 const registry={...o.pins,maxSdkInvocations:20,sdkInvocations:0,status:'reserved',unknownInFlight:false,startedAt:new Date().toISOString()};
 fs.writeFileSync(o.registryPath,JSON.stringify(registry,null,2)+'\n',{flag:'wx',mode:0o600}); // Canonical Git-common-dir claim; no resume or alternate-output reset.
 fs.mkdirSync(o.outputDir);const rows=o.cases.map(c=>({id:c.id,A1:empty(),sdkInvoked:false,datasetFailure:false,runnerWallMs:null}));let halted=false;
 const checkpoint=()=>{const status={selected:rows.length,sdkInvocations:registry.sdkInvocations,valid:rows.filter(r=>r.A1.status==='ok').length,failed:rows.filter(r=>r.A1.status==='failed').length,notAttempted:rows.filter(r=>r.A1.status==='not_attempted').length,pending:rows.filter(r=>r.A1.status==='pending').length,halted,unknownInFlight:registry.unknownInFlight,costUsd:null};save(o.registryPath,registry);save(path.join(o.outputDir,'status.json'),status);return status;};
 for(const r of rows)save(path.join(o.outputDir,r.id+'.json'),r);registry.status='running';checkpoint();
 for(let i=0;i<rows.length&&!halted;i++){
  const row=rows[i],c=o.cases[i],start=Date.now();
  if(c.photo===null){row.A1=empty('failed','dataset_input_failure');row.datasetFailure=true;row.runnerWallMs=Date.now()-start;save(path.join(o.outputDir,row.id+'.json'),row);checkpoint();continue;}
  row.sdkInvoked=true;row.A1=empty('pending');registry.sdkInvocations++;registry.unknownInFlight=true;registry.inFlightId=row.id;save(path.join(o.outputDir,row.id+'.json'),row);checkpoint();
  try{
   const e=await steps.infer(c.photo);
   if(e?.provenance?.model!==o.expectedModel||e.provenance.returnedModel!==o.expectedModel||e.provenance.promptSha256!==o.expectedPromptSha256)throw Error('Frozen model or prompt drift');
   const mass=e.components.reduce((a,c)=>a+c.massG,0);if(!Number.isFinite(mass)||mass<=0)throw Error('Invalid estimate mass');
   row.estimate=e;row.A1={status:'ok',predicted:e.totals,massG:mass,failure:null};registry.unknownInFlight=false;
  }catch(error){
   let category='inference_system_failure',semantic=false;
   if(steps.NoFoodError&&error instanceof steps.NoFoodError){category='no_food';semantic=true;}
   else if(error instanceof SyntaxError||(steps.InvalidOutputError&&error instanceof steps.InvalidOutputError)||(error instanceof Error&&['Unknown nutrient record','Unresolved food requires manual entry','Empty model response'].includes(error.message))){category='invalid_model_output';semantic=true;}
   else if(error instanceof Error&&['Frozen model or prompt drift','Unexpected returned model version'].includes(error.message))category='model_or_prompt_drift';
   else if(typeof error?.status==='number'&&error.status>=400&&error.status<=599)category='http_'+error.status;
   row.A1=empty('failed',category);halted=!semantic;registry.unknownInFlight=halted&&category==='inference_system_failure';registry.failureCategory=category;
  }
  row.runnerWallMs=Date.now()-start;if(!registry.unknownInFlight)delete registry.inFlightId;save(path.join(o.outputDir,row.id+'.json'),row);checkpoint();process.stdout.write(JSON.stringify({id:row.id,status:row.A1.status})+'\n');
 }
 registry.status=halted?'halted':'completed';registry.finishedAt=new Date().toISOString();return checkpoint();
}
function assertController(repo,runningFile=__filename,helperFile=require.resolve('./run_frozen_public_eval.cjs')){
 const root=fs.realpathSync(repo);
 if(fs.realpathSync(runningFile)!==fs.realpathSync(path.join(root,'tool/run_portion_prior_a1.cjs'))||fs.realpathSync(helperFile)!==fs.realpathSync(path.join(root,'tool/run_frozen_public_eval.cjs')))throw Error('Executing controller/helper must belong to verified checkout');
}
function privateOutput(value,repo){
 const out=path.resolve(value),resolved=path.join(fs.realpathSync(path.dirname(out)),path.basename(out)),root=fs.realpathSync(repo);
 if(resolved===root||resolved.startsWith(root+path.sep))throw Error('Output must remain outside repository');return resolved;
}
function mainValue(args,key){const ids=args.flatMap((v,i)=>v===key?[i]:[]);if(ids.length!==1||!args[ids[0]+1]||args[ids[0]+1].startsWith('--'))throw Error('Explicit unique '+key+' required');return args[ids[0]+1];}
async function main(args){
 const value=k=>mainValue(args,k);if(value('--cloud-consent')!=='tier1-v1')throw Error('Cloud consent required');
 const repo=fs.realpathSync(value('--repo')),profilePath=fs.realpathSync(value('--profile')),manifestPath=fs.realpathSync(value('--manifest')),assetsRoot=fs.realpathSync(value('--assets-root')),bundle=fs.realpathSync(value('--bundle')),outputDir=privateOutput(value('--output'),repo);
 assertController(repo);
 const git=(...a)=>execFileSync('git',a,{cwd:repo,encoding:'utf8',stdio:'pipe'}).trim();
 if(git('status','--porcelain')||git('rev-parse','HEAD')!==git('rev-parse','@{upstream}'))throw Error('Commit and push clean source before calls');
 if(!profilePath.startsWith(repo+path.sep)||outputDir===repo||outputDir.startsWith(repo+path.sep))throw Error('Committed profile and private output required');
 const relative=path.relative(repo,profilePath),profileRaw=fs.readFileSync(profilePath);
 if(!profileRaw.equals(execFileSync('git',['show','HEAD:'+relative],{cwd:repo,stdio:'pipe'})))throw Error('Committed profile drift');
 const p=JSON.parse(profileRaw);
 if(p.id!=='predicted-portion-prior-stress-v1'||p.maxSdkInvocations!==20||p.retryAttempts!==0||p.newLocalForwards!==0||process.versions.node!==p.nodeVersion)throw Error('Frozen budget/runtime contract required');
 for(const pin of p.sourceFiles){if(path.isAbsolute(pin.path)||pin.path.split('/').includes('..'))throw Error('Invalid source pin');const bytes=fs.readFileSync(path.join(repo,pin.path));if(hash(bytes)!==pin.sha256||!bytes.equals(execFileSync('git',['show','HEAD:'+pin.path],{cwd:repo,stdio:'pipe'})))throw Error('Frozen source drift');}
 const raw=fs.readFileSync(manifestPath);if(hash(raw)!==p.manifestSha256||hash(fs.readFileSync(path.join(path.dirname(manifestPath),'stress-selection.json')))!==p.selectionSha256||hash(fs.readFileSync(path.join(path.dirname(manifestPath),'priors-v1.json')))!==p.priorsSha256)throw Error('Frozen cohort/selection/prior drift');
 const m=JSON.parse(raw);if(m.sampleCount!==20||m.cases.length!==20||m.selectionSha256!==p.selectionSha256||m.aliasPolicySha256!==p.aliasPolicySha256||m.priorsSha256!==p.priorsSha256)throw Error('Frozen cohort contract mismatch');
 frozen.verifyFrozenBundle(repo,p.engineCommit,bundle);const engine=require(path.join(bundle,'tier1-analysis.js')),validate=require(path.join(bundle,'tier1-callable.js')).validateTier1Photo;
 if(engine.TIER1_MODEL!==p.model||hash(engine.TIER1_PROMPT)!==p.promptSha256||hash(JSON.stringify(engine.TIER1_RESPONSE_SCHEMA))!==p.schemaSha256)throw Error('Frozen inference profile mismatch');
 const projected=projectCases(m.cases,assetsRoot,validate);const common=path.resolve(repo,git('rev-parse','--git-common-dir')),budgetDir=path.join(common,'calorix-eval-budgets');fs.mkdirSync(budgetDir,{recursive:true});const registryPath=path.join(budgetDir,'predicted-portion-prior-stress-v1.json');
 const result=await executeStudy({cases:projected,outputDir,registryPath,consent:true,expectedModel:p.model,expectedPromptSha256:p.promptSha256,pins:{sourceCommit:git('rev-parse','HEAD'),profileSha256:hash(profileRaw),manifestSha256:p.manifestSha256,selectionSha256:p.selectionSha256,engineCommit:p.engineCommit}}, {infer:engine.inferTier1,NoFoodError:engine.Tier1InferenceFailure,InvalidOutputError:require(path.join(repo,'functions/node_modules/zod')).ZodError});
 process.stdout.write(JSON.stringify(result)+'\n');
}
module.exports={projectCases,executeStudy,assertController,privateOutput};
if(require.main===module)main(process.argv.slice(2)).catch(e=>{process.stderr.write(JSON.stringify({status:'failed',category:e?.name||'Error',detail:'Inspect private receipts; no retry performed'})+'\n');process.exitCode=1;});
