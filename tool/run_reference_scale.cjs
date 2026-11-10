/* Research-only same-photo known-diameter instruction experiment. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const frozen=require('./run_frozen_public_eval.cjs');
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const MODEL='gemini-3.8-flash',ENGINE='f5af422eeaf753440349f20065a1e937e6084a17';
const ORIGINAL='7131abc1a34804893a785c500091401d7619708acd4994105a1a7d509d5e9566',SCHEMA='4306216d1b1b075e3994265d84527e1fc32fa29f80591201b1aab63d47288185';
function makePrompts(base){const neutral=base+'\nThe coin and plate are not food. Estimate only the complete visible edible food mass in grams.';return {neutral,metric:neutral+'\nThe visible reference coin has a documented diameter of 25.0 mm. Use this known physical scale to inform food dimensions and edible mass estimation.'};}
const save=(p,v)=>{fs.writeFileSync(p+'.pending',JSON.stringify(v,null,2)+'\n',{mode:0o600});fs.renameSync(p+'.pending',p);};
async function executeScale(o,steps){
 if(o.consent!==true)throw Error('Explicit consent required');
 if(!Array.isArray(o.cases)||o.cases.length!==6||new Set(o.cases.map(c=>c.id)).size!==6||o.cases.some(c=>!/^\w+$/.test(c.id)||!Array.isArray(c.armOrder)||!['neutral,metric','metric,neutral'].includes(c.armOrder.join(',')))||o.cases.filter(c=>c.armOrder[0]==='neutral').length!==3)throw Error('Fixed six balanced cases required');
 if(fs.existsSync(o.outputDir))throw Error('Output exists');
 const r={...o.pins,status:'reserved',phase:'none',maxSdkEntries:13,completedSdkEntries:0,unknownInFlight:false,startedAt:new Date().toISOString(),order:o.cases.map(c=>({id:c.id,arms:c.armOrder})),outcomes:[]};
 fs.writeFileSync(o.registryPath,JSON.stringify(r,null,2)+'\n',{flag:'wx',mode:0o600});
 const checkpoint=()=>{save(o.registryPath,r);save(path.join(o.outputDir,'experiment.json'),r);};
 try{
  fs.mkdirSync(o.outputDir);r.status='running';r.phase='probe';r.unknownInFlight=true;checkpoint();const probe=await steps.probe();
  if(probe.sdkInvocations!==1||probe.successfulCompatibility!==true||probe.returnedModel!==MODEL)throw Error('Blank compatibility failed');
  r.completedSdkEntries=1;r.unknownInFlight=false;checkpoint();
  for(const c of o.cases)for(const arm of c.armOrder){
   r.phase=c.id+'/'+arm;r.unknownInFlight=true;checkpoint();const outcome=await steps.run(c,arm);
   if(outcome.sdkInvocations!==1||!['ok','failed'].includes(outcome.status)||(outcome.status==='failed'&&!['no_food','invalid_model_output'].includes(outcome.failure))||(outcome.status==='ok'&&outcome.failure!==null))throw Error('Invalid completed arm');
   r.completedSdkEntries++;r.outcomes.push({id:c.id,arm,...outcome});r.unknownInFlight=false;checkpoint();
  }
  r.status='completed';r.phase='complete';
 }catch(e){r.status='halted';r.failureCategory=r.phase+'_failure';if(typeof e?.status==='number'&&e.status>=400&&e.status<=599)r.failureHttpStatus=e.status;}
 save(o.registryPath,r);if(fs.existsSync(o.outputDir))save(path.join(o.outputDir,'experiment.json'),r);return r;
}
function decodeMass(engine,z,text){
 try{
  if(typeof text!=='string'||!text)throw Error('Empty model response');
  const estimate=engine.decodeTier1Output(text),massG=estimate.components.reduce((n,c)=>n+c.massG,0);
  if(!Number.isFinite(massG)||massG<=0)throw Error('Unexpected decoded mass');
  return {estimate,massG,status:'ok',failure:null};
 }catch(e){
  if(e instanceof engine.Tier1InferenceFailure&&e.category==='no_food')return {estimate:null,massG:null,status:'failed',failure:'no_food'};
  if(e instanceof SyntaxError||e instanceof z.ZodError||(e instanceof Error&&['Unknown nutrient record','Unresolved food requires manual entry','Empty model response'].includes(e.message)))return {estimate:null,massG:null,status:'failed',failure:'invalid_model_output'};
  throw e;
 }
}
function pythonEntry(file){const entry=path.resolve(file);fs.accessSync(entry,fs.constants.X_OK);return entry;}
async function main(args){
 const value=k=>{const i=args.flatMap((v,n)=>v===k?[n]:[]);if(i.length!==1||!args[i[0]+1]||args[i[0]+1].startsWith('--'))throw Error('Missing/duplicate '+k);return args[i[0]+1];};
 if(value('--cloud-consent')!=='tier1-v1')throw Error('Consent required');
 const repo=fs.realpathSync(value('--repo')),bundleDir=fs.realpathSync(value('--bundle')),sourceRoot=fs.realpathSync(value('--source-root')),python=pythonEntry(value('--python'));
 const out=path.resolve(value('--output')),outputDir=path.join(fs.realpathSync(path.dirname(out)),path.basename(out));
 if(outputDir===repo||outputDir.startsWith(repo+path.sep))throw Error('Output must be outside repository');
 const base=path.join(repo,'functions/eval/tier1-public'),manifestPath=path.join(base,'manifest-reference-scale-v1.json'),protocolPath=path.join(base,'reference-scale-protocol-v1.json');
 const input=frozen.assertInputs(repo,manifestPath,outputDir,true),config=JSON.parse(fs.readFileSync(protocolPath));
 if(input.manifestSha256!==config.manifestSha256||input.manifest.sampleCount!==6||input.manifest.dataset!=='ECUSTFD original-author resized'||config.maxSdkEntries!==13)throw Error('Manifest/protocol drift');
 const bundle=frozen.verifyFrozenBundle(repo,ENGINE,bundleDir),engine=require(path.join(bundleDir,'tier1-analysis.js'));
 if(engine.TIER1_MODEL!==MODEL||hash(engine.TIER1_PROMPT)!==ORIGINAL||hash(JSON.stringify(engine.TIER1_RESPONSE_SCHEMA))!==SCHEMA||config.model!==MODEL||config.engineCommit!==ENGINE||config.schemaSha256!==SCHEMA||bundle.dependencies['@google/genai']!=='2.19.0'||!process.versions.node.startsWith('22.'))throw Error('Engine/runtime drift');
 for(const name of Object.keys(bundle.files))if(hash(fs.readFileSync(path.join(repo,'functions/src',name+'.ts')))!==bundle.files[name].sourceSha256)throw Error('Qualified core drift');
 const prompts=makePrompts(engine.TIER1_PROMPT),promptSha256=Object.fromEntries(Object.entries(prompts).map(([k,v])=>[k,hash(v)]));
 if(JSON.stringify(prompts)!==JSON.stringify(config.prompts)||JSON.stringify(promptSha256)!==JSON.stringify(config.promptSha256))throw Error('Prompt drift');
 const verification=JSON.parse(execFileSync(python,['-m','tool.verify_reference_scale','--source-root',sourceRoot,'--manifest',manifestPath],{cwd:repo,encoding:'utf8',stdio:'pipe'}));
 if(verification.cases!==6||verification.portionImageMassMappingVerified!==true||verification.originalPhotosVerified!==true)throw Error('Original reference verification failed');
 const validate=require(path.join(bundleDir,'tier1-callable.js')).validateTier1Photo;
 const load=(name,sha)=>{const p=fs.realpathSync(path.join(sourceRoot,name));if(!p.startsWith(sourceRoot+path.sep))throw Error('Photo path escape');const bytes=fs.readFileSync(p);if(hash(bytes)!==sha)throw Error('Photo hash drift');validate({cloudConsent:'tier1-v1',imageBase64:bytes.toString('base64')});return bytes;};
 const images=new Map(input.manifest.cases.map(c=>[c.id,load('originals/'+c.id+'.jpg',c.imageSha256)])),blank=load('owned-blank.jpg',config.probeImageSha256);
 const ranked=input.manifest.cases.map(c=>c.id).sort((a,b)=>hash('calorix-reference-scale-v1|'+a).localeCompare(hash('calorix-reference-scale-v1|'+b))||a.localeCompare(b));
 const cases=input.manifest.cases.map(c=>({...c,armOrder:ranked.indexOf(c.id)<3?['neutral','metric']:['metric','neutral']}));
 if(JSON.stringify(cases.map(c=>({id:c.id,arms:c.armOrder})))!==JSON.stringify(config.order))throw Error('Call order drift');
 const common=execFileSync('git',['rev-parse','--path-format=absolute','--git-common-dir'],{cwd:repo,encoding:'utf8'}).trim(),registryDir=path.join(common,'tier1-experiments');fs.mkdirSync(registryDir,{recursive:true});
 const {GoogleGenAI,ThinkingLevel}=require(path.join(repo,'functions/node_modules/@google/genai'));
 const request=async(bytes,arm,file)=>{
  const client=new GoogleGenAI({vertexai:true,project:'calorix-xurschnell',location:'us',apiVersion:'v1',httpOptions:{baseUrl:'https://aiplatform.us.rep.googleapis.com/',timeout:30000,retryOptions:{attempts:1}}});
  const start=Date.now();const response=await client.models.generateContent({model:MODEL,contents:[{role:'user',parts:[{text:prompts[arm]},{inlineData:{mimeType:'image/jpeg',data:bytes.toString('base64')}}]}],config:{responseMimeType:'application/json',responseJsonSchema:engine.TIER1_RESPONSE_SCHEMA,thinkingConfig:{thinkingLevel:ThinkingLevel.LOW},maxOutputTokens:8192}});
  const receipt={requestedModel:MODEL,returnedModel:response.modelVersion,text:response.text,usageMetadata:response.usageMetadata??null,latencyMs:Date.now()-start,inputSha256:hash(bytes),promptSha256:promptSha256[arm],costUsd:null};
  fs.writeFileSync(file,JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
  if(response.modelVersion!==MODEL)throw Error('Unexpected returned model');return receipt;
 };
 const pins={sourceCommit:input.manifestCommit,engineCommit:ENGINE,manifestSha256:input.manifestSha256,protocolSha256:hash(fs.readFileSync(protocolPath)),bundleSha256:hash(fs.readFileSync(path.join(bundleDir,'bundle.json'))),model:MODEL,promptSha256,schemaSha256:SCHEMA,outputDir,sourceRoot,consentVersion:'tier1-v1',referenceVerification:verification};
 const result=await executeScale({registryPath:path.join(registryDir,'reference-scale-cue-v1.json'),outputDir,cases,consent:true,pins},{
  probe:async()=>{const r=await request(blank,'metric',path.join(outputDir,'probe-response.json'));let ok=false;try{const raw=JSON.parse(r.text);ok=Array.isArray(raw.components)&&raw.components.length===0;engine.decodeTier1Output(r.text);ok=false;}catch(e){ok=ok&&e instanceof engine.Tier1InferenceFailure&&e.category==='no_food';}const p={sdkInvocations:1,successfulCompatibility:ok,returnedModel:r.returnedModel};save(path.join(outputDir,'probe.json'),p);return p;},
  run:async(c,arm)=>{
   const root=path.join(outputDir,c.id,arm);fs.mkdirSync(root,{recursive:true});const response=await request(images.get(c.id),arm,path.join(root,'sdk-response.json'));
   let {estimate,massG,status,failure}=decodeMass(engine,require(path.join(repo,'functions/node_modules/zod')),response.text);
   if(estimate)estimate={...estimate,provenance:{...estimate.provenance,model:MODEL,returnedModel:response.returnedModel,promptSha256:promptSha256[arm],latencyMs:response.latencyMs}};
   const row={id:c.id,arm,sdkInvocations:1,status,failure,massG,estimate,referenceMassG:c.referenceMassG,calorieReference:null,volumeReferenceUsed:false};save(path.join(root,'record.json'),row);console.log(JSON.stringify({id:c.id,arm,status,massG}));return {sdkInvocations:1,status,failure};
  }});
 console.log(JSON.stringify({status:result.status,completedSdkEntries:result.completedSdkEntries,unknownInFlight:result.unknownInFlight}));if(result.status!=='completed')process.exitCode=1;
}
module.exports={executeScale,makePrompts,decodeMass,pythonEntry};
if(require.main===module)void main(process.argv.slice(2)).catch(()=>{console.error('Reference-scale study refused. Inspect retained receipts; no retry/resume.');process.exitCode=1;});
