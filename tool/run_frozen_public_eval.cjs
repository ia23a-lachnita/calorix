/* Reuse unchanged committed Tier1 engines; verify every byte before network use. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const FILES=['tier1-analysis','tier1-catalog','tier1-callable','tier1-cli','tier1-public-eval'];
const PROFILES=['original','portion-audit-v1','vlm-challenger-v1'];
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const git=(repo,...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8',stdio:'pipe'});
function source(repo,commit,file){
  if(!/^[a-f0-9]{40}$/.test(commit))throw new Error('Full source commit required');
  return git(repo,'show',commit+':functions/'+file);
}
function context(repo,commit){
  const root=path.join(repo,'functions');const lock=source(repo,commit,'package-lock.json');
  if(hash(lock)!==hash(fs.readFileSync(path.join(root,'package-lock.json'))))throw new Error('Dependency lock drift');
  const parsed=JSON.parse(lock),versions={};
  const names=[...Object.keys(parsed.packages[''].dependencies),'typescript'];
  for(const name of names){
    const installed=JSON.parse(fs.readFileSync(path.join(root,'node_modules',name,'package.json'))).version;
    if(installed!==parsed.packages['node_modules/'+name].version)throw new Error('Installed dependency drift');
    versions[name]=installed;
  }
  const ts=require(path.join(root,'node_modules/typescript'));
  const config=JSON.parse(source(repo,commit,'tsconfig.json'));
  const converted=ts.convertCompilerOptionsFromJson(config.compilerOptions,root);
  if(converted.errors.length)throw new Error('Invalid frozen compiler options');
  const options={...converted.options,sourceMap:false};
  return {root,ts,options,versions,lockSha256:hash(lock)};
}
function compile(context,code,name){
  const result=context.ts.transpileModule(code,{compilerOptions:context.options,fileName:path.join(context.root,'src',name+'.ts'),reportDiagnostics:true});
  if(result.diagnostics?.some(d=>d.category===context.ts.DiagnosticCategory.Error))throw new Error('Frozen compilation failed');
  return result.outputText;
}
function buildFrozenBundle(repo,commit,directory){
  repo=fs.realpathSync(repo);const c=context(repo,commit);
  fs.mkdirSync(directory); // Exclusive; never replace an earlier bundle.
  fs.symlinkSync(path.join(c.root,'node_modules'),path.join(directory,'node_modules'),'junction');
  const receipt={engineCommit:commit,lockSha256:c.lockSha256,dependencies:c.versions,nodeVersion:process.versions.node,files:{}};
  for(const name of FILES){
    const code=source(repo,commit,'src/'+name+'.ts'),js=compile(c,code,name);
    fs.writeFileSync(path.join(directory,name+'.js'),js,{flag:'wx',mode:0o600});
    receipt.files[name]={sourceSha256:hash(code),compiledSha256:hash(js)};
  }
  fs.writeFileSync(path.join(directory,'bundle.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
  return receipt;
}
function verifyFrozenBundle(repo,commit,directory){
  const receipt=JSON.parse(fs.readFileSync(path.join(directory,'bundle.json')));
  if(receipt.engineCommit!==commit)throw new Error('Requested commit differs from bundle');
  const c=context(repo,commit);
  if(receipt.lockSha256!==c.lockSha256||JSON.stringify(receipt.dependencies)!==JSON.stringify(c.versions)||receipt.nodeVersion!==process.versions.node)throw new Error('Frozen runtime/dependency drift');
  if(JSON.stringify(Object.keys(receipt.files))!==JSON.stringify(FILES))throw new Error('Frozen module set drift');
  for(const name of FILES){
    const code=source(repo,commit,'src/'+name+'.ts'),js=fs.readFileSync(path.join(directory,name+'.js'));
    if(receipt.files[name].sourceSha256!==hash(code))throw new Error('Frozen source digest drift');
    if(receipt.files[name].compiledSha256!==hash(js)||hash(compile(c,code,name))!==hash(js))throw new Error('Frozen compiled digest drift');
  }
  // A changed dependency symlink must not redirect module resolution elsewhere.
  if(fs.realpathSync(path.join(directory,'node_modules'))!==fs.realpathSync(path.join(c.root,'node_modules')))throw new Error('Frozen dependency path drift');
  return receipt;
}
function assertInputs(repo,manifestPath,runDir,consent){
  if(!consent)throw new Error('Explicit cloud consent required');
  if(fs.existsSync(runDir)||fs.existsSync(runDir+'.control.json'))throw new Error('Run or control receipt exists');
  repo=fs.realpathSync(repo);const file=fs.realpathSync(manifestPath);
  if(!file.startsWith(repo+path.sep))throw new Error('Manifest must be inside repository');
  if(git(repo,'status','--porcelain').trim())throw new Error('Commit source/manifest in a clean checkout first');
  const relative=path.relative(repo,file);git(repo,'ls-files','--error-unmatch','--',relative);
  const manifestCommit=git(repo,'rev-parse','HEAD').trim(),raw=fs.readFileSync(file);
  if(hash(git(repo,'show',manifestCommit+':'+relative))!==hash(raw))throw new Error('Manifest differs from committed bytes');
  const manifest=JSON.parse(raw);
  if(manifest.scope!=='public_dataset'||!Number.isInteger(manifest.sampleCount)||manifest.sampleCount<1||manifest.sampleCount>20||manifest.cases.length!==manifest.sampleCount)throw new Error('Invalid bounded public manifest');
  return {manifest,manifestCommit,manifestSha256:hash(raw)};
}
function resolveInferenceProfile(engine,profile='original'){
  if(!PROFILES.includes(profile))throw new Error('Unknown inference profile');
  const prompt=profile==='portion-audit-v1'?engine.TIER1_PORTION_AUDIT_PROMPT:engine.TIER1_PROMPT;
  const infer=profile==='original'?engine.inferTier1:profile==='portion-audit-v1'?engine.inferTier1PortionAudit:engine.inferTier1Challenger;
  const model=profile==='vlm-challenger-v1'?engine.TIER1_CHALLENGER_MODEL:engine.TIER1_MODEL;
  if(typeof prompt!=='string'||typeof infer!=='function'||typeof model!=='string'||!model)throw new Error('Frozen inference profile is unavailable');
  if(profile==='portion-audit-v1'&&prompt===engine.TIER1_PROMPT)throw new Error('Candidate inference profile duplicates the default');
  if(profile==='vlm-challenger-v1'&&model===engine.TIER1_MODEL)throw new Error('Challenger model duplicates the default');
  return {id:profile,model,promptSha256:hash(prompt),infer};
}
function parseProfileArgument(args){
  if(args.some(value=>value.startsWith('--profile=')))throw new Error('Use separate --profile and value arguments');
  const positions=args.flatMap((value,index)=>value==='--profile'?[index]:[]);
  if(!positions.length)return 'original';
  if(positions.length!==1||!PROFILES.includes(args[positions[0]+1]))throw new Error('Specify exactly one valid inference profile');
  return args[positions[0]+1];
}
async function runFrozenEvaluation({repo,engineCommit,bundleDir,manifestPath,assetsRoot,runDir,consent,profile='original'}){
  if(!PROFILES.includes(profile))throw new Error('Unknown inference profile');
  const inputs=assertInputs(repo,manifestPath,runDir,consent);
  const bundle=verifyFrozenBundle(repo,engineCommit,bundleDir);
  const selected=resolveInferenceProfile(require(path.resolve(bundleDir,'tier1-analysis.js')),profile);
  if(profile!=='original'&&inputs.manifest.sampleCount>10)throw new Error('Candidate profile is limited to ten cases');
  fs.writeFileSync(runDir+'.control.json',JSON.stringify({engineCommit,manifestCommit:inputs.manifestCommit,
    manifestSha256:inputs.manifestSha256,bundleSha256:hash(fs.readFileSync(path.join(bundleDir,'bundle.json'))),
    profile:selected.id,model:selected.model,promptSha256:selected.promptSha256,maxSdkInvocations:inputs.manifest.sampleCount,consentVersion:'tier1-v1',bundle},null,2)+'\n',{flag:'wx',mode:0o600});
  const {runPublicEvaluation}=require(path.resolve(bundleDir,'tier1-public-eval.js'));
  return runPublicEvaluation({manifest:inputs.manifest,assetsRoot,runDir,consent:true,sourceCommit:engineCommit,infer:selected.infer,expectedPromptSha256:selected.promptSha256,expectedModel:selected.model,
    onProgress:r=>console.log(JSON.stringify({id:r.id,A1:r.A1.status,A0:r.A0.status}))});
}
async function main(args){
  const value=key=>{const i=args.indexOf(key);return i<0?undefined:args[i+1];};
  const repo=path.resolve(value('--repo')??path.join(__dirname,'..')),engineCommit=value('--engine'),bundleDir=value('--bundle');
  const profile=parseProfileArgument(args);
  if(!engineCommit||!bundleDir)throw new Error('Specify frozen --engine and new/existing --bundle');
  if(args.includes('--build-only')){const receipt=buildFrozenBundle(repo,engineCommit,path.resolve(bundleDir));console.log(JSON.stringify({engineCommit:receipt.engineCommit,files:FILES.length}));return;}
  const manifestPath=value('--manifest'),assetsRoot=value('--assets-root'),runDir=value('--run-dir');
  if(!manifestPath||!assetsRoot||!runDir)throw new Error('Specify manifest, assets and fresh run directory');
  const result=await runFrozenEvaluation({repo,engineCommit,bundleDir:path.resolve(bundleDir),manifestPath:path.resolve(manifestPath),assetsRoot:path.resolve(assetsRoot),runDir:path.resolve(runDir),consent:value('--cloud-consent')==='tier1-v1',profile});
  console.log(JSON.stringify(result));if(result.routes.A1.failed||result.routes.A1.notAttempted)process.exitCode=1;
}
module.exports={buildFrozenBundle,verifyFrozenBundle,assertInputs,runFrozenEvaluation,resolveInferenceProfile,parseProfileArgument};
if(require.main===module)void main(process.argv.slice(2)).catch(()=>{console.error('Frozen evaluation refused or failed; inspect retained local receipts. No retry performed.');process.exitCode=1;});
