/* Fixed model challenger; no production caller or automatic promotion. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const frozen=require('./run_frozen_public_eval.cjs');
const {executePair}=require('./run_bounded_portion_experiment.cjs');
const BASE_MODEL='gemini-3.8-flash',CHALLENGER_MODEL='gemini-4-argon';
const MANIFEST_SHA='9d7d8f2b3097d551df8ca93d35dcd800a594ce45fd97f3e7ac1d71c8653ff9e7';
const PROMPT_SHA='7131abc1a34804893a785c500091401d7619708acd4994105a1a7d509d5e9566';
const SCHEMA_SHA='4306216d1b1b075e3994265d84527e1fc32fa29f80591201b1aab63d47288185';
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function validateModelPins(profile,manifest,engine,bundle,probeRaw){
  if(profile.baselineModel!==BASE_MODEL||profile.challengerModel!==CHALLENGER_MODEL||engine.TIER1_MODEL!==BASE_MODEL||engine.TIER1_CHALLENGER_MODEL!==CHALLENGER_MODEL||
    profile.manifestSha256!==MANIFEST_SHA||hash(manifest)!==MANIFEST_SHA||profile.promptSha256!==PROMPT_SHA||hash(engine.TIER1_PROMPT)!==PROMPT_SHA||
    profile.responseSchemaSha256!==SCHEMA_SHA||hash(JSON.stringify(engine.TIER1_RESPONSE_SCHEMA))!==SCHEMA_SHA||
    profile.analysisSourceSha256!==bundle.files['tier1-analysis'].sourceSha256||profile.catalogSourceSha256!==bundle.files['tier1-catalog'].sourceSha256||
    profile.dependencyLockSha256!==bundle.lockSha256||profile.probeReceiptSha256!==hash(probeRaw))throw new Error('Challenger experiment pin drift');
  const probe=JSON.parse(probeRaw);
  if(probe.successfulCompatibility!==true||probe.sdkInvocations!==1||probe.maxSdkInvocations!==1||probe.foodRequests!==0||
    probe.requestedModel!==CHALLENGER_MODEL||probe.returnedModel!==CHALLENGER_MODEL||probe.outcome!=='expected_no_food')throw new Error('Successful single-call probe required');
}
async function main(args){
  const value=key=>{const positions=args.flatMap((v,i)=>v===key?[i]:[]);if(positions.length!==1||!args[positions[0]+1]||args[positions[0]+1].startsWith('--'))throw new Error('Exactly one '+key+' required');return args[positions[0]+1];};
  if(value('--cloud-consent')!=='tier1-v1')throw new Error('Explicit cloud consent required');
  const repo=fs.realpathSync(value('--repo')),engineCommit=value('--engine'),bundleDir=fs.realpathSync(value('--bundle'));
  const assetsRoot=fs.realpathSync(value('--assets-root')),outputArg=path.resolve(value('--output'));
  const outputDir=path.join(fs.realpathSync(path.dirname(outputArg)),path.basename(outputArg));
  if(outputDir===repo||outputDir.startsWith(repo+path.sep))throw new Error('Keep experiment output outside repository');
  const manifestPath=path.join(repo,'functions/eval/tier1-public/manifest-mealrange-v1.json');
  const profilePath=path.join(repo,'functions/eval/tier1-public/vlm-challenger-profile-v1.json');
  const probePath=path.join(repo,'functions/eval/tier1-public/vlm-challenger-probe-v1.json');
  const inputs=frozen.assertInputs(repo,manifestPath,path.join(outputDir,'original'),true);
  if(inputs.manifestCommit!==engineCommit)throw new Error('Use the current committed experiment source');
  const bundle=frozen.verifyFrozenBundle(repo,engineCommit,bundleDir);
  const engine=require(path.join(bundleDir,'tier1-analysis.js')),profile=JSON.parse(fs.readFileSync(profilePath)),probeRaw=fs.readFileSync(probePath);
  validateModelPins(profile,fs.readFileSync(manifestPath),engine,bundle,probeRaw);
  frozen.resolveInferenceProfile(engine,'original');frozen.resolveInferenceProfile(engine,'vlm-challenger-v1');
  const common=execFileSync('git',['rev-parse','--path-format=absolute','--git-common-dir'],{cwd:repo,encoding:'utf8'}).trim();
  const registryDir=path.join(common,'tier1-experiments');
  const probeClaim=JSON.parse(fs.readFileSync(path.join(registryDir,'vlm-challenger-v1-probe.json')));
  if(probeClaim.model!==CHALLENGER_MODEL||probeClaim.maxSdkInvocations!==1||probeClaim.consentVersion!=='tier1-v1')throw new Error('Probe registry mismatch');
  const registryPath=path.join(registryDir,'vlm-challenger-v1-'+MANIFEST_SHA+'.json');
  const pins={engineCommit,manifestCommit:inputs.manifestCommit,manifestSha256:MANIFEST_SHA,baselineModel:BASE_MODEL,challengerModel:CHALLENGER_MODEL,
    promptSha256:PROMPT_SHA,schemaSha256:SCHEMA_SHA,profileSha256:hash(fs.readFileSync(profilePath)),probeReceiptSha256:hash(probeRaw),
    bundleSha256:hash(fs.readFileSync(path.join(bundleDir,'bundle.json'))),consentVersion:'tier1-v1',probeSdkInvocations:1,maxTotalIncludingProbe:21};
  const result=await executePair({registryPath,outputDir,manifest:inputs.manifest,consent:true,pins,candidateProfile:'vlm-challenger-v1'},
    arm=>frozen.runFrozenEvaluation({repo,engineCommit,bundleDir,manifestPath,assetsRoot,consent:true,...arm}));
  console.log(JSON.stringify(result));if(result.status!=='completed')process.exitCode=1;
}
module.exports={validateModelPins};
if(require.main===module)void main(process.argv.slice(2)).catch(()=>{console.error('Bounded challenger refused; no retry or resume. Inspect retained receipts.');process.exitCode=1;});
