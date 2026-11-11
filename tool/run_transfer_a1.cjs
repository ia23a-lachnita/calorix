/* Generic private-manifest evaluation; original inference engine remains frozen. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {verifyFrozenBundle}=require('./run_frozen_public_eval.cjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const safeId=id=>typeof id==='string'&&/^nv-dish-(0|[1-9][0-9]*)$/.test(id);
const safeRelative=p=>typeof p==='string'&&/^[A-Za-z0-9_./-]+$/.test(p)&&!path.posix.isAbsolute(p)&&!p.split('/').some(x=>x==='.'||x==='..'||!x);
function validateManifest(value){
 if(!value||value.schemaVersion!==1||value.datasetId!=='nutritionverse-real'||!Number.isInteger(value.sampleCount)||value.sampleCount<1||value.sampleCount>20||!Array.isArray(value.cases)||value.cases.length!==value.sampleCount)throw Error('Invalid bounded transfer manifest');
 const seen=new Set();
 for(const c of value.cases){
  if(!safeId(c.id)||seen.has(c.id)||c.physicalMealId!=='nutritionverse-real/dish/'+c.id.slice(8))throw Error('Unique physical dish IDs required');
  seen.add(c.id);
  if(!['ready','dataset_failure'].includes(c.inputStatus))throw Error('Explicit input status required');
  if(c.inputStatus==='ready'&&(!safeRelative(c.inputPath)||typeof c.inputSha256!=='string'||!/^[a-f0-9]{64}$/.test(c.inputSha256)))throw Error('Pinned safe image path required');
 }
 return value;
}
function projectCase(value,assetsRoot){
 if(!safeId(value.id)||!safeRelative(value.inputPath)||typeof value.inputSha256!=='string'||!/^[a-f0-9]{64}$/.test(value.inputSha256))throw Error('Invalid image projection');
 const root=fs.realpathSync(assetsRoot),file=fs.realpathSync(path.resolve(root,value.inputPath));
 if(!file.startsWith(root+path.sep)||fs.statSync(file).size>4*1024*1024)throw Error('Escaped or oversized image');
 if(hash(fs.readFileSync(file))!==value.inputSha256)throw Error('Frozen image drift');
 return {id:value.id,inputFile:file,inputSha256:value.inputSha256};
}
const empty=(status='not_attempted',failure=null)=>({status,predicted:null,massG:null,failure});
const point=e=>({status:'ok',predicted:e.totals,massG:e.components.reduce((s,c)=>s+c.massG,0),failure:null});
function save(file,value){fs.writeFileSync(file+'.pending',JSON.stringify(value,null,2)+'\n',{mode:0o600});fs.renameSync(file+'.pending',file);}
function failureInfo(error,engine,invalidOutputError){
 try{
  if(error instanceof engine.Tier1InferenceFailure)return {category:error.category,halt:false};
  if(error instanceof SyntaxError||(invalidOutputError&&error instanceof invalidOutputError))return {category:'invalid_model_output',halt:false};
  if(error instanceof Error&&['Unknown nutrient record','Unresolved food requires manual entry','Empty model response'].includes(error.message))return {category:'invalid_model_output',halt:false};
  if(error instanceof Error&&error.message==='Model or prompt drift')return {category:'model_or_prompt_drift',halt:true};
  if(error&&typeof error.status==='number'&&error.status>=400&&error.status<=599)return {category:'http_'+error.status,halt:true};
 }catch{/* Never serialize foreign errors: they may contain photos or credentials. */}
 return {category:'inference_system_failure',halt:true};
}
async function executeCases({manifest,assetsRoot,runDir,engine,consent,expectedModel,expectedPromptSha256,invalidOutputError}){
 if(!consent)throw Error('Explicit cloud consent required');
 validateManifest(manifest);
 if(typeof expectedModel!=='string'||typeof expectedPromptSha256!=='string')throw Error('Frozen model and prompt required');
 fs.mkdirSync(runDir); // Exclusive; no resume or implicit overwrite/retry.
 const rows=manifest.cases.map(c=>({id:c.id,A1:empty(),A0:empty(),sdkInvoked:false,datasetFailure:false,runnerWallMs:null}));
 let halted=false;
 const checkpoint=()=>{const r={selected:rows.length,sdkInvocations:rows.filter(x=>x.sdkInvoked).length,valid:rows.filter(x=>x.A1.status==='ok').length,failed:rows.filter(x=>x.A1.status==='failed').length,notAttempted:rows.filter(x=>x.A1.status==='not_attempted').length,pending:rows.filter(x=>x.A1.status==='pending').length,halted,costUsd:null};save(path.join(runDir,'status.json'),r);return r;};
 for(const r of rows)save(path.join(runDir,r.id+'.json'),r);
 checkpoint();
 for(let i=0;i<rows.length&&!halted;i++){
  const row=rows[i],c=manifest.cases[i],start=Date.now();let image;
  try{
   if(c.inputStatus!=='ready')throw Error('Dataset input unavailable');
   const projected=projectCase(c,assetsRoot),bytes=fs.readFileSync(projected.inputFile);
   if(hash(bytes)!==projected.inputSha256)throw Error('Image changed before call');
   image=engine.validateTier1Photo({cloudConsent:'tier1-v1',imageBase64:bytes.toString('base64')});
  }catch{
   row.datasetFailure=true;row.A1=empty('failed','dataset_input_failure');row.A0=empty('failed','inventory_unavailable');
   row.runnerWallMs=Date.now()-start;save(path.join(runDir,row.id+'.json'),row);checkpoint();continue;
  }
  row.sdkInvoked=true;row.A1=empty('pending');save(path.join(runDir,row.id+'.json'),row);checkpoint();
  try{
   const estimate=await engine.inferTier1(image);
   if(estimate.provenance.model!==expectedModel||estimate.provenance.returnedModel!==expectedModel||estimate.provenance.promptSha256!==expectedPromptSha256)throw Error('Model or prompt drift');
   row.estimate=estimate;row.A1=point(estimate);
   if(estimate.components.every(c=>typeof c.catalogId==='string'))row.A0=point(engine.estimateA0(estimate.components.map(c=>c.catalogId)));
   else row.A0=empty('failed','catalog_coverage_failure');
  }catch(error){const f=failureInfo(error,engine,invalidOutputError);row.A1=empty('failed',f.category);row.A0=empty('failed','inventory_unavailable');halted=f.halt;}
  row.runnerWallMs=Date.now()-start;save(path.join(runDir,row.id+'.json'),row);checkpoint();
  process.stdout.write(JSON.stringify({id:row.id,A1:row.A1.status})+'\n');
 }
 return checkpoint();
}
function assertTransferInputs({repo,profilePath,manifestPath,runDir,consent}){
 if(!consent)throw Error('Explicit cloud consent required');
 repo=fs.realpathSync(repo);profilePath=fs.realpathSync(profilePath);
 if(!profilePath.startsWith(repo+path.sep))throw Error('Use a committed profile');
 const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8',stdio:'pipe'}).trim();
 if(git('status','--porcelain')||git('rev-parse','HEAD')!==git('rev-parse','@{upstream}'))throw Error('Commit and push clean source first');
 const relative=path.relative(repo,profilePath);git('ls-files','--error-unmatch','--',relative);
 const profileBytes=fs.readFileSync(profilePath),committedProfile=execFileSync('git',['show','HEAD:'+relative],{cwd:repo,stdio:'pipe'});
 if(!profileBytes.equals(committedProfile))throw Error('Frozen profile drift');
 const profile=JSON.parse(profileBytes);
 if(profile.rights?.evaluationAllowed!==true||!['personal_noncommercial_evaluation','separate_permission'].includes(profile.rights.purpose)||!profile.rights.decisionEvidence)throw Error('Compatible dataset-purpose decision required');
 for(const pin of profile.sourceFiles){
  if(!safeRelative(pin.path))throw Error('Invalid source pin path');
  const filePath=fs.realpathSync(path.join(repo,pin.path));
  if(!filePath.startsWith(repo+path.sep))throw Error('Escaped source pin');
  git('ls-files','--error-unmatch','--',pin.path);
  const file=fs.readFileSync(filePath),committed=execFileSync('git',['show','HEAD:'+pin.path],{cwd:repo,stdio:'pipe'});
  if(file.length!==pin.bytes||hash(file)!==pin.sha256||!file.equals(committed))throw Error('Source pin drift');
 }
 const raw=fs.readFileSync(manifestPath);
 if(hash(raw)!==profile.manifestSha256)throw Error('Private frozen manifest drift');
 const manifest=validateManifest(JSON.parse(raw));
 if(typeof profile.selectionSha256!=='string'||!/^[a-f0-9]{64}$/.test(profile.selectionSha256)||manifest.selectionSha256!==profile.selectionSha256||hash(fs.readFileSync(path.join(path.dirname(manifestPath),'selection.json')))!==profile.selectionSha256)throw Error('Frozen selection receipt drift');
 if(manifest.sampleCount!==profile.sampleCount||fs.existsSync(runDir)||fs.existsSync(runDir+'.control.json'))throw Error('Frozen count/fresh output required');
 return {manifest,profile,sourceCommit:git('rev-parse','HEAD'),profileSha256:hash(fs.readFileSync(profilePath))};
}
async function main(args){
 const value=k=>{const i=args.indexOf(k);return i<0?undefined:args[i+1];};
 for(const k of ['--repo','--profile','--private-manifest','--assets-root','--bundle','--run-dir'])if(!value(k))throw Error('Explicit paths required');
 const repo=path.resolve(value('--repo')),profilePath=path.resolve(value('--profile')),manifestPath=path.resolve(value('--private-manifest')),runDir=path.resolve(value('--run-dir')),bundleDir=path.resolve(value('--bundle'));
 const consent=value('--cloud-consent')==='tier1-v1',context=assertTransferInputs({repo,profilePath,manifestPath,runDir,consent});
 const receipt=verifyFrozenBundle(repo,context.profile.engineCommit,bundleDir),engine=require(path.join(bundleDir,'tier1-analysis.js'));
 if(engine.TIER1_MODEL!==context.profile.model||hash(engine.TIER1_PROMPT)!==context.profile.promptSha256||hash(JSON.stringify(engine.TIER1_RESPONSE_SCHEMA))!==context.profile.schemaSha256)throw Error('Frozen inference profile mismatch');
 fs.writeFileSync(runDir+'.control.json',JSON.stringify({sourceCommit:context.sourceCommit,profileSha256:context.profileSha256,manifestSha256:context.profile.manifestSha256,engineCommit:context.profile.engineCommit,maxSdkInvocations:context.manifest.sampleCount,bundle:receipt},null,2)+'\n',{flag:'wx',mode:0o600});
 const callable=require(path.join(bundleDir,'tier1-callable.js'));
 const invalidOutputError=require(path.join(bundleDir,'node_modules/zod')).ZodError;
 const result=await executeCases({manifest:context.manifest,assetsRoot:path.resolve(value('--assets-root')),runDir,engine:{...engine,validateTier1Photo:callable.validateTier1Photo},consent,expectedModel:context.profile.model,expectedPromptSha256:context.profile.promptSha256,invalidOutputError});
 console.log(JSON.stringify(result));if(result.failed||result.notAttempted)process.exitCode=1;
}
module.exports={validateManifest,projectCase,executeCases,assertTransferInputs};
if(require.main===module)void main(process.argv.slice(2)).catch(()=>{console.error('Transfer run refused or incomplete; inspect private receipts. No retry performed.');process.exitCode=1;});
