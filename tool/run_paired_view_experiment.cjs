/* Research-only fixed same-meal supplementary-view comparison. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const frozen=require('./run_frozen_public_eval.cjs'),{inspectArm}=require('./run_bounded_calibration.cjs');
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const MODEL='gemini-3.8-flash',ENGINE='f5af422eeaf753440349f20065a1e937e6084a17';
const ORIGINAL_PROMPT_SHA='7131abc1a34804893a785c500091401d7619708acd4994105a1a7d509d5e9566',SCHEMA_SHA='4306216d1b1b075e3994265d84527e1fc32fa29f80591201b1aab63d47288185';
const ADDENDUM='All provided photographs show the SAME served meal. Use the available views to estimate ONE combined food inventory and serving. Never sum or duplicate foods merely because they appear in more than one view.';
function makeViewPrompt(original){
 const needle='in this single photograph.';
 if(typeof original!=='string'||original.split(needle).length!==2)throw Error('Expected exact original prompt wording');
 return original.replace(needle,'in the provided photograph(s).')+'\n'+ADDENDUM;
}
const save=(p,v)=>{fs.writeFileSync(p+'.pending',JSON.stringify(v,null,2)+'\n',{mode:0o600});fs.renameSync(p+'.pending',p);};
async function executePairedViews(o,steps){
 if(o.consent!==true)throw Error('Explicit consent required');
 if(!Array.isArray(o.cases)||o.cases.length!==6||new Set(o.cases.map(c=>c.id)).size!==6||o.cases.some(c=>!/^dish_[0-9]{10}$/.test(c.id)||!Array.isArray(c.armOrder)||!['single,paired','paired,single'].includes(c.armOrder.join(',')))||o.cases.filter(c=>c.armOrder[0]==='single').length!==3)throw Error('Fixed six counterbalanced cases required');
 if(fs.existsSync(o.outputDir))throw Error('Output exists');
 const r={...o.pins,status:'reserved',phase:'none',maxSdkEntries:13,completedSdkEntries:0,unknownInFlight:false,startedAt:new Date().toISOString(),order:o.cases.map(c=>({id:c.id,arms:c.armOrder})),outcomes:[]};
 fs.writeFileSync(o.registryPath,JSON.stringify(r,null,2)+'\n',{flag:'wx',mode:0o600});
 const checkpoint=()=>{save(o.registryPath,r);save(path.join(o.outputDir,'experiment.json'),r);};
 try{
  fs.mkdirSync(o.outputDir);r.status='running';r.phase='probe';r.unknownInFlight=true;checkpoint();
  const p=await steps.probe();
  if(p.sdkInvocations!==1||p.successfulCompatibility!==true||p.returnedModel!==MODEL)throw Error('Two-image compatibility failed');
  r.completedSdkEntries=1;r.unknownInFlight=false;checkpoint();
  for(const c of o.cases)for(const arm of c.armOrder){
   r.phase=c.id+'/'+arm;r.unknownInFlight=true;checkpoint();const outcome=await steps.run(c,arm);
   if(!Number.isInteger(outcome.sdkInvocations)||outcome.sdkInvocations<0||outcome.sdkInvocations>1||!['ok','failed'].includes(outcome.status)||(outcome.status==='ok'&&outcome.sdkInvocations!==1))throw Error('Invalid arm receipt');
   r.completedSdkEntries+=outcome.sdkInvocations;if(r.completedSdkEntries>13)throw Error('Budget overflow');
   r.outcomes.push({id:c.id,arm,...outcome});r.unknownInFlight=false;checkpoint();
  }
  r.status='completed';r.phase='complete';
 }catch(e){r.status='halted';r.failureCategory=r.phase+'_failure';if(typeof e?.status==='number'&&e.status>=400&&e.status<=599)r.failureHttpStatus=e.status;}
 save(o.registryPath,r);if(fs.existsSync(o.outputDir))save(path.join(o.outputDir,'experiment.json'),r);return r;
}
async function main(args){
 const value=k=>{const i=args.flatMap((v,n)=>v===k?[n]:[]);if(i.length!==1||!args[i[0]+1]||args[i[0]+1].startsWith('--'))throw Error('Missing/duplicate '+k);return args[i[0]+1];};
 if(value('--cloud-consent')!=='tier1-v1')throw Error('Explicit consent required');
 const repo=fs.realpathSync(value('--repo')),bundleDir=fs.realpathSync(value('--bundle')),assetsRoot=fs.realpathSync(value('--assets-root'));
 const arg=path.resolve(value('--output')),outputDir=path.join(fs.realpathSync(path.dirname(arg)),path.basename(arg));
 if(outputDir===repo||outputDir.startsWith(repo+path.sep))throw Error('Output must be outside repository');
 const base=path.join(repo,'functions/eval/tier1-public'),manifestPath=path.join(base,'manifest-paired-view-v1.json'),protocolPath=path.join(base,'paired-view-protocol-v1.json');
 const config=JSON.parse(fs.readFileSync(protocolPath)),input=frozen.assertInputs(repo,manifestPath,outputDir,true);
 if(input.manifest.sampleCount!==6||input.manifestSha256!==config.manifestSha256)throw Error('Fixed six-case manifest pin mismatch');
 const bundle=frozen.verifyFrozenBundle(repo,ENGINE,bundleDir),engine=require(path.join(bundleDir,'tier1-analysis.js'));
 if(engine.TIER1_MODEL!==MODEL||hash(engine.TIER1_PROMPT)!==ORIGINAL_PROMPT_SHA||hash(JSON.stringify(engine.TIER1_RESPONSE_SCHEMA))!==SCHEMA_SHA||bundle.dependencies['@google/genai']!=='2.19.0'||!process.versions.node.startsWith('22.'))throw Error('Engine/model/runtime drift');
 for(const name of Object.keys(bundle.files))if(hash(fs.readFileSync(path.join(repo,'functions/src',name+'.ts')))!==bundle.files[name].sourceSha256)throw Error('Current core differs from qualified engine');
 const prompt=makeViewPrompt(engine.TIER1_PROMPT),promptSha256=hash(prompt);
 if(prompt!==config.prompt||promptSha256!==config.promptSha256||config.maxSdkEntries!==13)throw Error('Protocol/prompt drift');
 const photoValidator=require(path.join(bundleDir,'tier1-callable.js')).validateTier1Photo;
 const loadPhoto=(file,sha)=>{
  const real=fs.realpathSync(path.join(assetsRoot,file));if(!real.startsWith(assetsRoot+path.sep))throw Error('Photo escapes assets root');
  const data=fs.readFileSync(real);if(hash(data)!==sha)throw Error('Photo hash mismatch');
  photoValidator({cloudConsent:'tier1-v1',imageBase64:data.toString('base64')});return data;
 };
 const images=new Map();
 for(const c of input.manifest.cases){
  if(c.inputStatus!=='ready'||c.sidePairPreflightUsable!==true)throw Error('Every paired input must be ready and preflight inspected');
  images.set(c.id,{overhead:loadPhoto(c.inputPath,c.inputSha256),side:loadPhoto(c.sideInputPath,c.sideInputSha256)});
 }
 const blank=loadPhoto('owned-blank.jpg',config.probeImageSha256);
 const ids=input.manifest.cases.map(c=>c.id).sort((a,b)=>hash('calorix-paired-view-v1|'+a).localeCompare(hash('calorix-paired-view-v1|'+b))||a.localeCompare(b));
 const cases=input.manifest.cases.map(c=>({...c,armOrder:ids.indexOf(c.id)<3?['single','paired']:['paired','single']}));
 if(JSON.stringify(cases.map(c=>({id:c.id,arms:c.armOrder})))!==JSON.stringify(config.order))throw Error('Counterbalance order drift');
 const common=execFileSync('git',['rev-parse','--path-format=absolute','--git-common-dir'],{cwd:repo,encoding:'utf8'}).trim();
 const registryDir=path.join(common,'tier1-experiments');fs.mkdirSync(registryDir,{recursive:true});
 const {GoogleGenAI,ThinkingLevel}=require(path.join(repo,'functions/node_modules/@google/genai'));
 const {runPublicEvaluation}=require(path.join(bundleDir,'tier1-public-eval.js'));
 const request=async(pictures,file)=>{
  const client=new GoogleGenAI({vertexai:true,project:'calorix-xurschnell',location:'us',apiVersion:'v1',httpOptions:{baseUrl:'https://aiplatform.us.rep.googleapis.com/',timeout:30000,retryOptions:{attempts:1}}});
  const start=Date.now();const response=await client.models.generateContent({model:MODEL,contents:[{role:'user',parts:[{text:prompt},...pictures.map(data=>({inlineData:{mimeType:'image/jpeg',data:data.toString('base64')}}))]}],config:{responseMimeType:'application/json',responseJsonSchema:engine.TIER1_RESPONSE_SCHEMA,thinkingConfig:{thinkingLevel:ThinkingLevel.LOW},maxOutputTokens:8192}});
  const receipt={requestedModel:MODEL,returnedModel:response.modelVersion,text:response.text,usageMetadata:response.usageMetadata??null,latencyMs:Date.now()-start,inputSha256:pictures.map(hash),promptSha256,costUsd:null};
  fs.writeFileSync(file,JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
  if(response.modelVersion!==MODEL)throw Error('Unexpected returned model version');
  if(!response.text)throw Error('Empty model response');return receipt;
 };
 const pins={sourceCommit:input.manifestCommit,engineCommit:ENGINE,manifestSha256:input.manifestSha256,protocolSha256:hash(fs.readFileSync(protocolPath)),bundleSha256:hash(fs.readFileSync(path.join(bundleDir,'bundle.json'))),model:MODEL,promptSha256,schemaSha256:SCHEMA_SHA,outputDir,assetsRoot,consentVersion:'tier1-v1'};
 const result=await executePairedViews({registryPath:path.join(registryDir,'paired-view-v1.json'),outputDir,cases,consent:true,pins},{
  probe:async()=>{
   const response=await request([blank,blank],path.join(outputDir,'probe-response.json'));let ok=false;
   try{engine.decodeTier1Output(response.text);}catch(e){if(e instanceof engine.Tier1InferenceFailure&&e.category==='no_food')ok=true;}
   const p={sdkInvocations:1,foodRequests:0,successfulCompatibility:ok,returnedModel:response.returnedModel};fs.writeFileSync(path.join(outputDir,'probe.json'),JSON.stringify(p,null,2)+'\n',{flag:'wx',mode:0o600});return p;
  },run:async(c,arm)=>{
   const parent=path.join(outputDir,c.id);fs.mkdirSync(parent,{recursive:true});const runDir=path.join(parent,arm),manifest={...input.manifest,sampleCount:1,cases:[c]};
   const summary=await runPublicEvaluation({manifest,assetsRoot,runDir,consent:true,sourceCommit:ENGINE,expectedModel:MODEL,expectedPromptSha256:promptSha256,
    infer:async photo=>{
     const image=images.get(c.id),pictures=arm==='single'?[Buffer.from(photo,'base64')]:[Buffer.from(photo,'base64'),image.side];
     const response=await request(pictures,path.join(runDir,'sdk-response.json'));const estimate=engine.decodeTier1Output(response.text);
     return {...estimate,provenance:{...estimate.provenance,model:MODEL,returnedModel:response.returnedModel,promptSha256,latencyMs:response.latencyMs,inputTokens:response.usageMetadata?.promptTokenCount??null,outputTokens:response.usageMetadata?.candidatesTokenCount??null,costUsd:null}};
    }});
   const calls=inspectArm(manifest,runDir,summary),row=JSON.parse(fs.readFileSync(path.join(runDir,c.id+'.json')));
   console.log(JSON.stringify({id:c.id,arm,status:row.A1.status,failure:row.A1.failure}));return {sdkInvocations:calls,status:row.A1.status,failure:row.A1.failure??null};
  }});
 console.log(JSON.stringify(result));if(result.status!=='completed')process.exitCode=1;
}
module.exports={makeViewPrompt,executePairedViews};
if(require.main===module)void main(process.argv.slice(2)).catch(()=>{console.error('Paired view experiment refused; inspect retained receipts. No retry/resume.');process.exitCode=1;});
