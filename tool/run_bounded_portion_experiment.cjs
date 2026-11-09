/* Fixed, non-resumable paired experiment. Never used by the callable. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const frozen=require('./run_frozen_public_eval.cjs');
const MANIFEST_SHA='d150ef3c0503487116a65337817f0eccff8a8ab48124d3ff47a4ca09cca88e63';
const CANDIDATE_SHA='1d2406db986503a127eb04367f692e1c87d1a9e58311d343de49e5ebb6a25e77';
const BASE_SHA='7131abc1a34804893a785c500091401d7619708acd4994105a1a7d509d5e9566';
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const save=(file,value)=>{fs.writeFileSync(file+'.pending',JSON.stringify(value,null,2)+'\n',{mode:0o600});fs.renameSync(file+'.pending',file);};
function validatePins(profile,manifest,engine,bundle){
  if(hash(manifest)!==MANIFEST_SHA||profile.manifestSha256!==MANIFEST_SHA||profile.promptSha256!==CANDIDATE_SHA||
    profile.baselinePromptSha256!==BASE_SHA||hash(engine.TIER1_PROMPT)!==BASE_SHA||hash(engine.TIER1_PORTION_AUDIT_PROMPT)!==CANDIDATE_SHA||
    profile.prompt!==engine.TIER1_PORTION_AUDIT_PROMPT||profile.dependencyLockSha256!==bundle.lockSha256||
    profile.analysisSourceSha256!==bundle.files['tier1-analysis'].sourceSha256||profile.catalogSourceSha256!==bundle.files['tier1-catalog'].sourceSha256)
    throw new Error('Experiment source/profile/input pin drift');
}
function checkArm(manifest,runDir,summary){
  let calls=0,ok=0,failed=0;
  for(const c of manifest.cases){
    const row=JSON.parse(fs.readFileSync(path.join(runDir,c.id+'.json')));
    if(row.id!==c.id||typeof row.sdkInvoked!=='boolean')throw new Error('Invalid case receipt');
    calls+=Number(row.sdkInvoked);
    if(row.A1.status==='ok'){if(!row.sdkInvoked)throw new Error('Success without invocation');ok++;}
    else if(row.A1.status==='failed'&&['no_food','invalid_model_output','dataset_input_failure'].includes(row.A1.failure))failed++;
    else throw new Error('Systemic or incomplete arm');
  }
  if(summary.selectedCases!==10||summary.sdkInvocations!==calls||calls>10||summary.routes.A1.scoredCases!==ok||
    summary.routes.A1.failed!==failed||summary.routes.A1.pending!==0||summary.routes.A1.notAttempted!==0)throw new Error('Inconsistent arm summary');
  return calls;
}
/** Caller supplies a canonical registry path; the CLI derives it from Git common-dir. */
async function executePair(options,runArm){
  const {manifest,registryPath,outputDir}=options;
  if(!options.consent)throw new Error('Explicit cloud consent required');
  const candidateProfile=options.candidateProfile??'portion-audit-v1';
  if(!['portion-audit-v1','vlm-challenger-v1'].includes(candidateProfile))throw new Error('Unknown paired candidate profile');
  if(manifest.sampleCount!==10||manifest.cases.length!==10||new Set(manifest.cases.map(c=>c.id)).size!==10)throw new Error('Exactly ten unique fixed cases required');
  if(fs.existsSync(outputDir))throw new Error('Experiment output already exists');
  const receipt={...options.pins,status:'reserved',maxSdkInvocations:20,sdkInvocations:0,startedAt:new Date().toISOString(),
    arms:[{profile:'original',runDir:path.join(outputDir,'original'),status:'not_attempted'},
      {profile:candidateProfile,runDir:path.join(outputDir,'candidate'),status:'not_attempted'}]};
  // This receipt is never removed or resumed, including after crashes or failures.
  fs.writeFileSync(registryPath,JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
  try{
    fs.mkdirSync(outputDir);save(path.join(outputDir,'experiment.json'),receipt);
    for(const arm of receipt.arms){
      arm.status='running';receipt.status='running';save(registryPath,receipt);save(path.join(outputDir,'experiment.json'),receipt);
      const summary=await runArm({profile:arm.profile,runDir:arm.runDir});
      // Inspect persisted receipts rather than inferring success from an exit status.
      receipt.sdkInvocations+=checkArm(manifest,arm.runDir,summary);arm.status='completed';
      save(registryPath,receipt);save(path.join(outputDir,'experiment.json'),receipt);
    }
    receipt.status='completed';
  }catch{
    receipt.status='halted';receipt.sdkInvocations=null;
    const active=receipt.arms.find(a=>a.status==='running');if(active)active.status='halted';
    receipt.failure='Systemic, incomplete or inconsistent arm; inspect retained receipts. No retry or resume.';
  }
  save(registryPath,receipt);if(fs.existsSync(outputDir))save(path.join(outputDir,'experiment.json'),receipt);
  return receipt;
}
async function main(args){
  const value=key=>{const positions=args.flatMap((v,i)=>v===key?[i]:[]);if(positions.length!==1||!args[positions[0]+1]||args[positions[0]+1].startsWith('--'))throw new Error('Exactly one '+key+' required');return args[positions[0]+1];};
  if(value('--cloud-consent')!=='tier1-v1')throw new Error('Explicit cloud consent required');
  const repo=fs.realpathSync(value('--repo')),engineCommit=value('--engine'),bundleDir=fs.realpathSync(value('--bundle'));
  const assetsRoot=fs.realpathSync(value('--assets-root')),outputArg=path.resolve(value('--output'));
  const outputDir=path.join(fs.realpathSync(path.dirname(outputArg)),path.basename(outputArg));
  if(outputDir===repo||outputDir.startsWith(repo+path.sep))throw new Error('Keep experiment output outside repository');
  const manifestPath=path.join(repo,'functions/eval/tier1-public/manifest-portion-audit-v1.json');
  const profilePath=path.join(repo,'functions/eval/tier1-public/portion-audit-profile-v1.json');
  const inputs=frozen.assertInputs(repo,manifestPath,path.join(outputDir,'original'),true);
  const bundle=frozen.verifyFrozenBundle(repo,engineCommit,bundleDir);
  const engine=require(path.join(bundleDir,'tier1-analysis.js'));
  const profile=JSON.parse(fs.readFileSync(profilePath));
  validatePins(profile,fs.readFileSync(manifestPath),engine,bundle);
  const schemaSha256=hash(JSON.stringify(engine.TIER1_RESPONSE_SCHEMA));
  if(schemaSha256!==profile.responseSchemaSha256)throw new Error('Schema pin drift');
  const common=execFileSync('git',['rev-parse','--path-format=absolute','--git-common-dir'],{cwd:repo,encoding:'utf8'}).trim();
  const registryDir=path.join(common,'tier1-experiments');fs.mkdirSync(registryDir,{recursive:true});
  const registryPath=path.join(registryDir,'portion-audit-v1-'+MANIFEST_SHA+'.json');
  const pins={engineCommit,manifestCommit:inputs.manifestCommit,manifestSha256:MANIFEST_SHA,
    candidatePromptSha256:CANDIDATE_SHA,baselinePromptSha256:BASE_SHA,profileSha256:hash(fs.readFileSync(profilePath)),
    schemaSha256,bundleSha256:hash(fs.readFileSync(path.join(bundleDir,'bundle.json'))),consentVersion:'tier1-v1'};
  const result=await executePair({registryPath,outputDir,manifest:inputs.manifest,consent:true,pins},
    arm=>frozen.runFrozenEvaluation({repo,engineCommit,bundleDir,manifestPath,assetsRoot,consent:true,...arm}));
  console.log(JSON.stringify(result));if(result.status!=='completed')process.exitCode=1;
}
module.exports={executePair,validatePins};
if(require.main===module)void main(process.argv.slice(2)).catch(()=>{console.error('Bounded experiment refused; no retry or resume. Inspect retained receipts.');process.exitCode=1;});
