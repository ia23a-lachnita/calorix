/* Single-use TRAIN->lock->TEST experiment. No production imports. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const frozen=require('./run_frozen_public_eval.cjs');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const PROMPT='7131abc1a34804893a785c500091401d7619708acd4994105a1a7d509d5e9566';
const SCHEMA='4306216d1b1b075e3994265d84527e1fc32fa29f80591201b1aab63d47288185';
const MODEL='gemini-3.8-flash';
function save(file,value){fs.writeFileSync(file+'.pending',JSON.stringify(value,null,2)+'\n',{mode:0o600});fs.renameSync(file+'.pending',file);}
async function execute(options,steps){
  if(options.consent!==true)throw Error('Explicit consent required');
  if(fs.existsSync(options.outputDir))throw Error('Output exists');
  const receipt={...options.pins,maxSdkEntries:31,completedSdkEntries:0,unknownInFlight:false,status:'reserved',phase:'none',startedAt:new Date().toISOString()};
  fs.writeFileSync(options.registryPath,JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
  const checkpoint=()=>{save(options.registryPath,receipt);save(path.join(options.outputDir,'experiment.json'),receipt);};
  try{
    fs.mkdirSync(options.outputDir);checkpoint();
    receipt.phase='probe';receipt.status='running';receipt.unknownInFlight=true;checkpoint();
    const probe=await steps.probe();
    if(probe.sdkInvocations!==1||probe.successfulCompatibility!==true||probe.returnedModel!==MODEL)throw Error('Probe failed');
    receipt.completedSdkEntries=1;receipt.unknownInFlight=false;receipt.phase='train';checkpoint();
    receipt.unknownInFlight=true;checkpoint();const train=await steps.train();
    if(!Number.isInteger(train)||train<0||train>20)throw Error('Invalid TRAIN count');
    receipt.completedSdkEntries+=train;receipt.unknownInFlight=false;receipt.phase='fit';checkpoint();
    const profile=await steps.fit();
    if(!profile||typeof profile.scale!=='number'||!Number.isFinite(profile.scale)||profile.scale<.5||profile.scale>2||profile.usable_training_scans<16||profile.selected_training_scans!==20)throw Error('Invalid fit');
    const target=path.join(options.outputDir,'profile.json');fs.writeFileSync(target,JSON.stringify(profile,null,2)+'\n',{flag:'wx',mode:0o600});
    receipt.profileSha256=hash(fs.readFileSync(target));receipt.phase='test';receipt.unknownInFlight=true;checkpoint();
    const test=await steps.test(receipt.profileSha256);
    if(!Number.isInteger(test)||test<0||test>10||hash(fs.readFileSync(target))!==receipt.profileSha256)throw Error('Invalid TEST count or changed fit');
    receipt.completedSdkEntries+=test;receipt.unknownInFlight=false;receipt.status='completed';receipt.phase='complete';
  }catch(error){receipt.status='halted';receipt.failure='Incomplete or inconsistent experiment. No retry/resume.';receipt.failureCategory=receipt.phase+'_failure';}
  save(options.registryPath,receipt);if(fs.existsSync(options.outputDir))save(path.join(options.outputDir,'experiment.json'),receipt);
  return receipt;
}
function inspectArm(manifest,runDir,summary){
  let calls=0,ok=0,failed=0;
  for(const c of manifest.cases){
    const r=JSON.parse(fs.readFileSync(path.join(runDir,c.id+'.json')));
    if(r.id!==c.id||typeof r.sdkInvoked!=='boolean')throw Error('Case receipt mismatch');calls+=Number(r.sdkInvoked);
    if(r.A1.status==='ok'&&r.sdkInvoked)ok++;
    else if(r.A1.status==='failed'&&['no_food','invalid_model_output','dataset_input_failure'].includes(r.A1.failure))failed++;
    else throw Error('Systemic/incomplete arm');
  }
  if(summary.selectedCases!==manifest.sampleCount||summary.sdkInvocations!==calls||calls>manifest.sampleCount||summary.routes.A1.scoredCases!==ok||summary.routes.A1.failed!==failed||summary.routes.A1.pending!==0||summary.routes.A1.notAttempted!==0)throw Error('Arm summary mismatch');
  return calls;
}
async function main(args){
  const value=k=>{const indexes=args.flatMap((a,i)=>a===k?[i]:[]);if(indexes.length!==1||!args[indexes[0]+1]||args[indexes[0]+1].startsWith('--'))throw Error('Missing/duplicate '+k);return args[indexes[0]+1];};
  if(value('--cloud-consent')!=='tier1-v1')throw Error('Explicit consent required');
  const repo=fs.realpathSync(value('--repo')),engineCommit=value('--engine'),bundleDir=fs.realpathSync(value('--bundle')),assetsRoot=fs.realpathSync(value('--assets-root'));
  const out=path.resolve(value('--output')),outputDir=path.join(fs.realpathSync(path.dirname(out)),path.basename(out));
  if(outputDir===repo||outputDir.startsWith(repo+path.sep))throw Error('Output outside repository required');
  const configFile=path.join(repo,'functions/eval/tier1-public/portion-scale-protocol-v1.json');
  const config=JSON.parse(fs.readFileSync(configFile));
  const manifests={};
  for(const arm of ['train','test']){
    const file=path.join(repo,'functions/eval/tier1-public/portion-scale-'+arm+'-v1.json');
    manifests[arm]={file,...frozen.assertInputs(repo,file,path.join(outputDir,arm),true)};
    if(manifests[arm].manifestCommit!==engineCommit||manifests[arm].manifestSha256!==config[arm+'ManifestSha256']||manifests[arm].manifest.sampleCount!==(arm==='train'?20:10))throw Error('Manifest pin/count drift');
    for(const c of manifests[arm].manifest.cases){if(c.inputStatus==='ready'&&hash(fs.readFileSync(path.join(assetsRoot,c.inputPath)))!==c.inputSha256)throw Error('Image drift');}
  }
  const bundle=frozen.verifyFrozenBundle(repo,engineCommit,bundleDir),engine=require(path.join(bundleDir,'tier1-analysis.js'));
  if(engine.TIER1_MODEL!==MODEL||hash(engine.TIER1_PROMPT)!==PROMPT||hash(JSON.stringify(engine.TIER1_RESPONSE_SCHEMA))!==SCHEMA||bundle.dependencies['@google/genai']!=='2.19.0'||!process.versions.node.startsWith('22.'))throw Error('Runtime/model/prompt/schema drift');
  const blank=fs.readFileSync(path.join(assetsRoot,'owned-blank.jpg'));
  if(hash(blank)!==config.probeImageSha256)throw Error('Probe image drift');
  const common=execFileSync('git',['rev-parse','--path-format=absolute','--git-common-dir'],{cwd:repo,encoding:'utf8'}).trim();
  const registryDir=path.join(common,'tier1-experiments');fs.mkdirSync(registryDir,{recursive:true});
  const pins={engineCommit,trainManifestSha256:manifests.train.manifestSha256,testManifestSha256:manifests.test.manifestSha256,
    protocolSha256:hash(fs.readFileSync(configFile)),bundleSha256:hash(fs.readFileSync(path.join(bundleDir,'bundle.json'))),model:MODEL,promptSha256:PROMPT,schemaSha256:SCHEMA,outputDir,assetsRoot,consentVersion:'tier1-v1'};
  const arm=async name=>{const runDir=path.join(outputDir,name);const summary=await frozen.runFrozenEvaluation({repo,engineCommit,bundleDir,manifestPath:manifests[name].file,assetsRoot,runDir,consent:true});return inspectArm(manifests[name].manifest,runDir,summary);};
  const result=await execute({registryPath:path.join(registryDir,'portion-scale-v1.json'),outputDir,pins,consent:true},{
    probe:async()=>{
      const {GoogleGenAI,ThinkingLevel}=require(path.join(repo,'functions/node_modules/@google/genai'));
      const client=new GoogleGenAI({vertexai:true,project:'calorix-xurschnell',location:'us',apiVersion:'v1',httpOptions:{baseUrl:'https://aiplatform.us.rep.googleapis.com/',timeout:30000,retryOptions:{attempts:1}}});
      const started=Date.now();
      const response=await client.models.generateContent({model:MODEL,contents:[{role:'user',parts:[{text:engine.TIER1_PROMPT},{inlineData:{mimeType:'image/jpeg',data:blank.toString('base64')}}]}],config:{responseMimeType:'application/json',responseJsonSchema:engine.TIER1_RESPONSE_SCHEMA,thinkingConfig:{thinkingLevel:ThinkingLevel.LOW},maxOutputTokens:8192}});
      const probe={sdkInvocations:1,successfulCompatibility:false,requestedModel:MODEL,returnedModel:response.modelVersion,text:response.text,usageMetadata:response.usageMetadata??null,latencyMs:Date.now()-started,costUsd:null,foodRequests:0};
      if(response.modelVersion===MODEL){try{engine.decodeTier1Output(response.text);}catch(e){if(e instanceof engine.Tier1InferenceFailure&&e.category==='no_food')probe.successfulCompatibility=true;}}
      fs.writeFileSync(path.join(outputDir,'probe.json'),JSON.stringify(probe,null,2)+'\n',{flag:'wx',mode:0o600});return probe;
    },train:()=>arm('train'),
    fit:()=>JSON.parse(execFileSync('python3',['-m','tool.fit_portion_calibration','--manifest',manifests.train.file,'--run-dir',path.join(outputDir,'train')],{cwd:repo,encoding:'utf8',stdio:['ignore','pipe','pipe']})),
    test:()=>arm('test')});
  console.log(JSON.stringify(result));if(result.status!=='completed')process.exitCode=1;
}
module.exports={execute,inspectArm};
if(require.main===module)void main(process.argv.slice(2)).catch(()=>{console.error('Calibration experiment refused; inspect retained receipts. No retry/resume.');process.exitCode=1;});
