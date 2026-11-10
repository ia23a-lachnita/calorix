/* Research-only same-photo LOW versus HIGH thinking comparison. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const frozen=require('./run_frozen_public_eval.cjs'),{inspectArm}=require('./run_bounded_calibration.cjs');
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const MODEL='gemini-3.8-flash',ENGINE='f5af422eeaf753440349f20065a1e937e6084a17';
const ORIGINAL_PROMPT_SHA='7131abc1a34804893a785c500091401d7619708acd4994105a1a7d509d5e9566',SCHEMA_SHA='4306216d1b1b075e3994265d84527e1fc32fa29f80591201b1aab63d47288185';
function makeInferenceConfig(engine,ThinkingLevel,arm){
 if(!['low','high'].includes(arm))throw Error('Fixed thinking arm required');
 return {responseMimeType:'application/json',responseJsonSchema:engine.TIER1_RESPONSE_SCHEMA,thinkingConfig:{thinkingLevel:arm==='low'?ThinkingLevel.LOW:ThinkingLevel.HIGH},maxOutputTokens:8192};
}
const save=(p,v)=>{fs.writeFileSync(p+'.pending',JSON.stringify(v,null,2)+'\n',{mode:0o600});fs.renameSync(p+'.pending',p);};
async function executeThinking(o,steps){
 if(o.consent!==true)throw Error('Explicit consent required');
 if(!Array.isArray(o.cases)||o.cases.length!==10||new Set(o.cases.map(c=>c.id)).size!==10||o.cases.some((c,i)=>!/^dish_[0-9]{10}$/.test(c.id)||!Array.isArray(c.armOrder)||c.armOrder.join(',')!==(i%2?'high,low':'low,high'))||o.cases.filter(c=>c.armOrder[0]==='low').length!==5)throw Error('Fixed ten counterbalanced cases required');
 if(fs.existsSync(o.outputDir))throw Error('Output exists');
 const r={...o.pins,status:'reserved',phase:'none',maxSdkEntries:21,completedSdkEntries:0,unknownInFlight:false,startedAt:new Date().toISOString(),order:o.cases.map(c=>({id:c.id,arms:c.armOrder})),outcomes:[]};
 fs.writeFileSync(o.registryPath,JSON.stringify(r,null,2)+'\n',{flag:'wx',mode:0o600});
 const checkpoint=()=>{save(o.registryPath,r);save(path.join(o.outputDir,'experiment.json'),r);};
 try{
  fs.mkdirSync(o.outputDir);r.status='running';r.phase='probe';r.unknownInFlight=true;checkpoint();
  const p=await steps.probe();
  if(p.sdkInvocations!==1||p.successfulCompatibility!==true||p.returnedModel!==MODEL)throw Error('High-thinking compatibility failed');
  r.completedSdkEntries=1;r.unknownInFlight=false;checkpoint();
  for(const c of o.cases)for(const arm of c.armOrder){
   r.phase=c.id+'/'+arm;r.unknownInFlight=true;checkpoint();const outcome=await steps.run(c,arm);
   if(outcome.sdkInvocations!==1||!['ok','failed'].includes(outcome.status)||(outcome.status==='failed'&&!['no_food','invalid_model_output'].includes(outcome.failure))||(outcome.status==='ok'&&outcome.failure!==null))throw Error('Invalid arm receipt');
   r.completedSdkEntries+=outcome.sdkInvocations;if(r.completedSdkEntries>21)throw Error('Budget overflow');
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
 const base=path.join(repo,'functions/eval/tier1-public'),manifestPath=path.join(base,'manifest-mealrange-v1.json'),protocolPath=path.join(base,'thinking-level-protocol-v1.json');
 const config=JSON.parse(fs.readFileSync(protocolPath)),input=frozen.assertInputs(repo,manifestPath,outputDir,true);
 if(input.manifest.sampleCount!==10||input.manifestSha256!==config.manifestSha256)throw Error('Fixed ten-case manifest pin mismatch');
 const bundle=frozen.verifyFrozenBundle(repo,ENGINE,bundleDir),engine=require(path.join(bundleDir,'tier1-analysis.js'));
 if(engine.TIER1_MODEL!==MODEL||hash(engine.TIER1_PROMPT)!==ORIGINAL_PROMPT_SHA||hash(JSON.stringify(engine.TIER1_RESPONSE_SCHEMA))!==SCHEMA_SHA||bundle.dependencies['@google/genai']!=='2.19.0'||!process.versions.node.startsWith('22.'))throw Error('Engine/model/runtime drift');
 for(const name of Object.keys(bundle.files))if(hash(fs.readFileSync(path.join(repo,'functions/src',name+'.ts')))!==bundle.files[name].sourceSha256)throw Error('Current core differs from qualified engine');
 const prompt=engine.TIER1_PROMPT,promptSha256=hash(prompt);
 if(prompt!==config.prompt||promptSha256!==config.promptSha256||config.maxSdkEntries!==21)throw Error('Protocol/prompt drift');
 const photoValidator=require(path.join(bundleDir,'tier1-callable.js')).validateTier1Photo;
 const loadPhoto=(file,sha)=>{
  const real=fs.realpathSync(path.join(assetsRoot,file));if(!real.startsWith(assetsRoot+path.sep))throw Error('Photo escapes assets root');
  const data=fs.readFileSync(real);if(hash(data)!==sha)throw Error('Photo hash mismatch');
  photoValidator({cloudConsent:'tier1-v1',imageBase64:data.toString('base64')});return data;
 };
 const images=new Map();
 for(const c of input.manifest.cases){
  if(c.inputStatus!=='ready')throw Error('Every input must be ready');
  images.set(c.id,loadPhoto(c.inputPath,c.inputSha256));
 }
 const blank=loadPhoto('owned-blank.jpg',config.probeImageSha256);
 const cases=input.manifest.cases.map((c,i)=>({...c,armOrder:i%2?['high','low']:['low','high']}));
 if(JSON.stringify(cases.map(c=>({id:c.id,arms:c.armOrder})))!==JSON.stringify(config.order))throw Error('Counterbalance order drift');
 const common=execFileSync('git',['rev-parse','--path-format=absolute','--git-common-dir'],{cwd:repo,encoding:'utf8'}).trim();
 const registryDir=path.join(common,'tier1-experiments');fs.mkdirSync(registryDir,{recursive:true});
 const {GoogleGenAI,ThinkingLevel}=require(path.join(repo,'functions/node_modules/@google/genai'));
 const {runPublicEvaluation}=require(path.join(bundleDir,'tier1-public-eval.js'));
 const request=async(pictures,arm,file)=>{
  const client=new GoogleGenAI({vertexai:true,project:'calorix-xurschnell',location:'us',apiVersion:'v1',httpOptions:{baseUrl:'https://aiplatform.us.rep.googleapis.com/',timeout:60000,retryOptions:{attempts:1}}});
  const start=Date.now();const response=await client.models.generateContent({model:MODEL,contents:[{role:'user',parts:[{text:prompt},...pictures.map(data=>({inlineData:{mimeType:'image/jpeg',data:data.toString('base64')}}))]}],config:makeInferenceConfig(engine,ThinkingLevel,arm)});
  const receipt={requestedModel:MODEL,returnedModel:response.modelVersion,text:response.text,usageMetadata:response.usageMetadata??null,latencyMs:Date.now()-start,thinkingLevel:arm.toUpperCase(),timeoutMs:60000,inputSha256:pictures.map(hash),promptSha256,costUsd:null};
  fs.writeFileSync(file,JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
  if(response.modelVersion!==MODEL)throw Error('Unexpected returned model version');
  if(!response.text)throw Error('Empty model response');return receipt;
 };
 const pins={sourceCommit:input.manifestCommit,engineCommit:ENGINE,manifestSha256:input.manifestSha256,protocolSha256:hash(fs.readFileSync(protocolPath)),bundleSha256:hash(fs.readFileSync(path.join(bundleDir,'bundle.json'))),model:MODEL,promptSha256,schemaSha256:SCHEMA_SHA,outputDir,assetsRoot,consentVersion:'tier1-v1'};
 const result=await executeThinking({registryPath:path.join(registryDir,'thinking-level-v1.json'),outputDir,cases,consent:true,pins},{
  probe:async()=>{
   const response=await request([blank],'high',path.join(outputDir,'probe-response.json'));let ok=false;
   try{engine.decodeTier1Output(response.text);}catch(e){if(e instanceof engine.Tier1InferenceFailure&&e.category==='no_food')ok=true;}
   const p={sdkInvocations:1,foodRequests:0,successfulCompatibility:ok,returnedModel:response.returnedModel};fs.writeFileSync(path.join(outputDir,'probe.json'),JSON.stringify(p,null,2)+'\n',{flag:'wx',mode:0o600});return p;
  },run:async(c,arm)=>{
   const parent=path.join(outputDir,c.id);fs.mkdirSync(parent,{recursive:true});const runDir=path.join(parent,arm),manifest={...input.manifest,sampleCount:1,cases:[c]};
   const summary=await runPublicEvaluation({manifest,assetsRoot,runDir,consent:true,sourceCommit:ENGINE,expectedModel:MODEL,expectedPromptSha256:promptSha256,
    infer:async photo=>{
     const pictures=[Buffer.from(photo,'base64')];
     const response=await request(pictures,arm,path.join(runDir,'sdk-response.json'));const estimate=engine.decodeTier1Output(response.text);
     return {...estimate,provenance:{...estimate.provenance,model:MODEL,returnedModel:response.returnedModel,promptSha256,latencyMs:response.latencyMs,inputTokens:response.usageMetadata?.promptTokenCount??null,outputTokens:response.usageMetadata?.candidatesTokenCount??null,costUsd:null}};
    }});
   const calls=inspectArm(manifest,runDir,summary),row=JSON.parse(fs.readFileSync(path.join(runDir,c.id+'.json')));
   console.log(JSON.stringify({id:c.id,arm,status:row.A1.status,failure:row.A1.failure}));return {sdkInvocations:calls,status:row.A1.status,failure:row.A1.failure??null};
  }});
 console.log(JSON.stringify(result));if(result.status!=='completed')process.exitCode=1;
}
module.exports={makeInferenceConfig,executeThinking};
if(require.main===module)void main(process.argv.slice(2)).catch(()=>{console.error('Thinking-level experiment refused; inspect retained receipts. No retry/resume.');process.exitCode=1;});
