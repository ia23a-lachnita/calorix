/* One fixed eleven-entry experiment; production never imports this module. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const frozen=require('./run_frozen_public_eval.cjs'),{inspectArm}=require('./run_bounded_calibration.cjs');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const MODEL='gemini-3.8-flash',ENGINE='f5af422eeaf753440349f20065a1e937e6084a17';
const PROMPT='7131abc1a34804893a785c500091401d7619708acd4994105a1a7d509d5e9566',SCHEMA='4306216d1b1b075e3994265d84527e1fc32fa29f80591201b1aab63d47288185';
const save=(p,x)=>{fs.writeFileSync(p+'.pending',JSON.stringify(x,null,2)+'\n',{mode:0o600});fs.renameSync(p+'.pending',p);};
async function executeMassPower(o,steps){
 if(o.consent!==true)throw Error('Explicit consent required');
 if(fs.existsSync(o.outputDir))throw Error('Output exists');
 if(hash(o.profileRaw)!==o.profileSha256)throw Error('Frozen profile hash mismatch');
 const r={...o.pins,status:'reserved',phase:'none',maxSdkEntries:11,completedSdkEntries:0,profileSha256:o.profileSha256,unknownInFlight:false,startedAt:new Date().toISOString()};
 fs.writeFileSync(o.registryPath,JSON.stringify(r,null,2)+'\n',{flag:'wx',mode:0o600});
 const checkpoint=()=>{save(o.registryPath,r);save(path.join(o.outputDir,'experiment.json'),r);};
 try{
  fs.mkdirSync(o.outputDir);fs.writeFileSync(path.join(o.outputDir,'profile.json'),o.profileRaw,{flag:'wx',mode:0o600});
  r.phase='probe';r.status='running';r.unknownInFlight=true;checkpoint();
  const p=await steps.probe();
  if(p.sdkInvocations!==1||p.successfulCompatibility!==true||p.returnedModel!==MODEL)throw Error('Probe failure');
  r.completedSdkEntries=1;r.phase='test';checkpoint();
  const calls=await steps.test();
  if(!Number.isInteger(calls)||calls<0||calls>10||hash(fs.readFileSync(path.join(o.outputDir,'profile.json')))!==o.profileSha256)throw Error('TEST count/profile mismatch');
  r.completedSdkEntries+=calls;r.unknownInFlight=false;r.phase='complete';r.status='completed';
 }catch(e){r.status='halted';r.failureCategory=r.phase+'_failure';if(typeof e?.status==='number'&&e.status>=400&&e.status<=599)r.failureHttpStatus=e.status;}
 save(o.registryPath,r);if(fs.existsSync(o.outputDir))save(path.join(o.outputDir,'experiment.json'),r);return r;
}
async function main(args){
 const value=k=>{const i=args.flatMap((v,n)=>v===k?[n]:[]);if(i.length!==1||!args[i[0]+1]||args[i[0]+1].startsWith('--'))throw Error('Missing/duplicate '+k);return args[i[0]+1];};
 if(value('--cloud-consent')!=='tier1-v1')throw Error('Explicit consent required');
 const repo=fs.realpathSync(value('--repo')),bundleDir=fs.realpathSync(value('--bundle')),assetsRoot=fs.realpathSync(value('--assets-root'));
 const out=path.resolve(value('--output')),outputDir=path.join(fs.realpathSync(path.dirname(out)),path.basename(out));
 if(outputDir===repo||outputDir.startsWith(repo+path.sep))throw Error('Output must be outside repository');
 const base=path.join(repo,'functions/eval/tier1-public'),manifestPath=path.join(base,'mass-power-test-v1.json'),profilePath=path.join(base,'mass-power-profile-v1.json'),inputPath=path.join(base,'mass-power-training-v1.json');
 const configPath=path.join(base,'mass-power-protocol-v1.json'),config=JSON.parse(fs.readFileSync(configPath));
 const input=frozen.assertInputs(repo,manifestPath,path.join(outputDir,'test'),true);
 if(input.manifest.sampleCount!==10||input.manifestSha256!==config.manifestSha256)throw Error('Fixed TEST10 manifest mismatch');
 const profileRaw=fs.readFileSync(profilePath);
 if(hash(profileRaw)!==config.profileSha256||hash(fs.readFileSync(inputPath))!==config.trainingInputSha256)throw Error('Fit/profile input pin drift');
 execFileSync('python3',['-m','tool.mass_power_calibration','--verify-input',inputPath,'--input-sha256',config.trainingInputSha256,'--profile',profilePath],{cwd:repo,stdio:'pipe'});
 for(const c of input.manifest.cases)if(c.inputStatus==='ready'&&hash(fs.readFileSync(path.join(assetsRoot,c.inputPath)))!==c.inputSha256)throw Error('Input image drift');
 const bundle=frozen.verifyFrozenBundle(repo,ENGINE,bundleDir),engine=require(path.join(bundleDir,'tier1-analysis.js'));
 if(engine.TIER1_MODEL!==MODEL||hash(engine.TIER1_PROMPT)!==PROMPT||hash(JSON.stringify(engine.TIER1_RESPONSE_SCHEMA))!==SCHEMA||bundle.dependencies['@google/genai']!=='2.19.0'||!process.versions.node.startsWith('22.'))throw Error('Frozen model/runtime drift');
 // Reuse CI qualification only for byte-identical production modules, not new tool code.
 for(const name of Object.keys(bundle.files))if(hash(fs.readFileSync(path.join(repo,'functions/src',name+'.ts')))!==bundle.files[name].sourceSha256)throw Error('Current core differs from qualified engine');
 const blank=fs.readFileSync(path.join(assetsRoot,'owned-blank.jpg'));if(hash(blank)!==config.probeImageSha256)throw Error('Probe image drift');
 const common=execFileSync('git',['rev-parse','--path-format=absolute','--git-common-dir'],{cwd:repo,encoding:'utf8'}).trim();
 const registryDir=path.join(common,'tier1-experiments');fs.mkdirSync(registryDir,{recursive:true});
 const pins={sourceCommit:input.manifestCommit,engineCommit:ENGINE,manifestSha256:input.manifestSha256,trainingInputSha256:config.trainingInputSha256,protocolSha256:hash(fs.readFileSync(configPath)),bundleSha256:hash(fs.readFileSync(path.join(bundleDir,'bundle.json'))),model:MODEL,promptSha256:PROMPT,schemaSha256:SCHEMA,outputDir,assetsRoot,consentVersion:'tier1-v1'};
 const result=await executeMassPower({registryPath:path.join(registryDir,'mass-power-v1.json'),outputDir,profileRaw,profileSha256:config.profileSha256,consent:true,pins},{
 probe:async()=>{
  const {GoogleGenAI,ThinkingLevel}=require(path.join(repo,'functions/node_modules/@google/genai'));
  const client=new GoogleGenAI({vertexai:true,project:'calorix-xurschnell',location:'us',apiVersion:'v1',httpOptions:{baseUrl:'https://aiplatform.us.rep.googleapis.com/',timeout:30000,retryOptions:{attempts:1}}});
  const started=Date.now();const response=await client.models.generateContent({model:MODEL,contents:[{role:'user',parts:[{text:engine.TIER1_PROMPT},{inlineData:{mimeType:'image/jpeg',data:blank.toString('base64')}}]}],config:{responseMimeType:'application/json',responseJsonSchema:engine.TIER1_RESPONSE_SCHEMA,thinkingConfig:{thinkingLevel:ThinkingLevel.LOW},maxOutputTokens:8192}});
  const p={sdkInvocations:1,successfulCompatibility:false,requestedModel:MODEL,returnedModel:response.modelVersion,text:response.text,usageMetadata:response.usageMetadata??null,latencyMs:Date.now()-started,costUsd:null,foodRequests:0};
  if(response.modelVersion===MODEL){try{engine.decodeTier1Output(response.text);}catch(e){if(e instanceof engine.Tier1InferenceFailure&&e.category==='no_food')p.successfulCompatibility=true;}}
  fs.writeFileSync(path.join(outputDir,'probe.json'),JSON.stringify(p,null,2)+'\n',{flag:'wx',mode:0o600});return p;
 },test:async()=>{
  const runDir=path.join(outputDir,'test');const summary=await frozen.runFrozenEvaluation({repo,engineCommit:ENGINE,bundleDir,manifestPath,assetsRoot,runDir,consent:true});return inspectArm(input.manifest,runDir,summary);
 }});
 console.log(JSON.stringify(result));if(result.status!=='completed')process.exitCode=1;
}
module.exports={executeMassPower};
if(require.main===module)void main(process.argv.slice(2)).catch(()=>{console.error('Mass calibration experiment refused; inspect retained receipts. No retry/resume.');process.exitCode=1;});
