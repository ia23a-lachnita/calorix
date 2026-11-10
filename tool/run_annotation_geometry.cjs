/* Oracle annotation/arithmetic cue only. No automatic localization or physical volume. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const frozen=require('./run_frozen_public_eval.cjs'),{decodeMass,pythonEntry,makePrompts}=require('./run_reference_scale.cjs');
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const MODEL='gemini-3.8-flash',ENGINE='f5af422eeaf753440349f20065a1e937e6084a17';
const ORIGINAL='7131abc1a34804893a785c500091401d7619708acd4994105a1a7d509d5e9566',SCHEMA='4306216d1b1b075e3994265d84527e1fc32fa29f80591201b1aab63d47288185',CONTROL='3cff949e260eef6b99183c7c280ef04274ee7b13ce28408be5008e34ed498cda';
const KEYS=['schemaVersion','imageSizePx','coinBoxCornersPx','coinBoxCornerSpansPx','coinMeanCornerSpanPx','foodBoxCornersPx','foodBoxCornerSpansPx','projectedFoodBoxSpansMm','coinDiameterMm'];
const CAVEAT='Supplementary annotation-derived image geometry (oracle localization, not automatic detection). Corner spans are coordinate differences, not inclusive pixel counts or segmentation areas. The projected millimeter spans use the 25 mm coin and assume the food and coin share the same planar image scale. They are not measured physical dimensions, height, volume, mass or density, and do not correct perspective or camera pose. Use this spatial information to inform edible mass while inferring missing factors from the photograph and stating assumptions. GEOMETRY_JSON=';
function formatRatio(n,d){if(typeof n!=='bigint'||n<0n||typeof d!=='bigint'||d<=0n)throw Error('Nonnegative integer ratio required');const scaled=(n*1000000n+d/2n)/d;return String(scaled/1000000n)+'.'+String(scaled%1000000n).padStart(6,'0');}
function canonicalGeometry(g){
 if(!g||typeof g!=='object'||Array.isArray(g)||JSON.stringify(Object.keys(g).sort())!==JSON.stringify([...KEYS].sort())||g.schemaVersion!==1||g.coinDiameterMm!==25)throw Error('Only exact numeric geometry fields permitted');
 if(!Array.isArray(g.imageSizePx)||g.imageSizePx.length!==2||g.imageSizePx.some(v=>!Number.isSafeInteger(v)||v<=0||v>10000))throw Error('Valid image size required');
 const out={schemaVersion:1,imageSizePx:[...g.imageSizePx]};
 const boxKeys=KEYS.filter(k=>!['schemaVersion','imageSizePx','coinDiameterMm'].includes(k));
 if(boxKeys.every(k=>g[k]===null))return Object.fromEntries(KEYS.map(k=>[k,k==='schemaVersion'?1:k==='imageSizePx'?out.imageSizePx:k==='coinDiameterMm'?25:null]));
 const box=key=>{const v=g[key];if(!Array.isArray(v)||v.length!==4||v.some(x=>!Number.isSafeInteger(x))||!(0<=v[0]&&v[0]<v[2]&&v[2]<=g.imageSizePx[0]&&0<=v[1]&&v[1]<v[3]&&v[3]<=g.imageSizePx[1]))throw Error('Valid complete geometry required');return [...v];};
 const coin=box('coinBoxCornersPx'),food=box('foodBoxCornersPx'),cs=[coin[2]-coin[0],coin[3]-coin[1]],foodSpan=[food[2]-food[0],food[3]-food[1]];
 const expected={...out,coinBoxCornersPx:coin,coinBoxCornerSpansPx:cs,coinMeanCornerSpanPx:formatRatio(BigInt(cs[0]+cs[1]),2n),foodBoxCornersPx:food,foodBoxCornerSpansPx:foodSpan,projectedFoodBoxSpansMm:foodSpan.map(v=>formatRatio(BigInt(v)*50n,BigInt(cs[0]+cs[1]))),coinDiameterMm:25};
 for(const k of KEYS)if(JSON.stringify(g[k])!==JSON.stringify(expected[k]))throw Error('Geometry arithmetic/type mismatch');
 return Object.fromEntries(KEYS.map(k=>[k,expected[k]]));
}
function makeGeometryPrompt(control,g){if(typeof control!=='string'||!control)throw Error('Control prompt required');return control+'\n'+CAVEAT+JSON.stringify(canonicalGeometry(g));}
const save=(p,v)=>{fs.writeFileSync(p+'.pending',JSON.stringify(v,null,2)+'\n',{mode:0o600});fs.renameSync(p+'.pending',p);};
async function executeGeometry(o,steps){
 if(o.consent!==true)throw Error('Explicit consent required');
 if(!Array.isArray(o.cases)||o.cases.length!==6||new Set(o.cases.map(c=>c.id)).size!==6||o.cases.some((c,i)=>!/^\w+$/.test(c.id)||!Array.isArray(c.armOrder)||c.armOrder.join(',')!==(i%2?'geometry,control':'control,geometry')))throw Error('Fixed six alternating cases required');
 if(fs.existsSync(o.outputDir))throw Error('Output exists');
 const r={...o.pins,status:'reserved',phase:'none',maxSdkEntries:13,completedSdkEntries:0,unknownInFlight:false,startedAt:new Date().toISOString(),order:o.cases.map(c=>({id:c.id,arms:c.armOrder})),outcomes:[]};
 fs.writeFileSync(o.registryPath,JSON.stringify(r,null,2)+'\n',{flag:'wx',mode:0o600});
 const checkpoint=()=>{save(o.registryPath,r);save(path.join(o.outputDir,'experiment.json'),r);};
 try{
  fs.mkdirSync(o.outputDir);r.status='running';r.phase='probe';r.unknownInFlight=true;checkpoint();const p=await steps.probe();
  if(p.sdkInvocations!==1||p.successfulCompatibility!==true||p.returnedModel!==MODEL)throw Error('Blank compatibility failed');
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
async function main(args){
 const value=k=>{const ix=args.flatMap((v,n)=>v===k?[n]:[]);if(ix.length!==1||!args[ix[0]+1]||args[ix[0]+1].startsWith('--'))throw Error('Missing/duplicate '+k);return args[ix[0]+1];};
 if(value('--cloud-consent')!=='tier1-v1')throw Error('Consent required');
 const repo=fs.realpathSync(value('--repo')),bundleDir=fs.realpathSync(value('--bundle')),sourceRoot=fs.realpathSync(value('--source-root')),python=pythonEntry(value('--python'));
 const out=path.resolve(value('--output')),outputDir=path.join(fs.realpathSync(path.dirname(out)),path.basename(out));
 if(outputDir===repo||outputDir.startsWith(repo+path.sep))throw Error('Output must be outside repository');
 const base=path.join(repo,'functions/eval/tier1-public'),manifestPath=path.join(base,'manifest-reference-scale-v1.json'),protocolPath=path.join(base,'annotation-geometry-protocol-v1.json');
 const input=frozen.assertInputs(repo,manifestPath,outputDir,true),config=JSON.parse(fs.readFileSync(protocolPath));
 if(input.manifestSha256!==config.manifestSha256||input.manifest.sampleCount!==6||config.maxSdkEntries!==13)throw Error('Manifest/protocol drift');
 const bundle=frozen.verifyFrozenBundle(repo,ENGINE,bundleDir),engine=require(path.join(bundleDir,'tier1-analysis.js'));
 if(engine.TIER1_MODEL!==MODEL||hash(engine.TIER1_PROMPT)!==ORIGINAL||hash(JSON.stringify(engine.TIER1_RESPONSE_SCHEMA))!==SCHEMA||config.model!==MODEL||config.engineCommit!==ENGINE||config.schemaSha256!==SCHEMA||bundle.dependencies['@google/genai']!=='2.19.0'||!process.versions.node.startsWith('22.'))throw Error('Engine/runtime drift');
 for(const name of Object.keys(bundle.files))if(hash(fs.readFileSync(path.join(repo,'functions/src',name+'.ts')))!==bundle.files[name].sourceSha256)throw Error('Qualified core drift');
 const preparedRaw=execFileSync(python,['-m','tool.annotation_geometry','--source-root',sourceRoot,'--manifest',manifestPath],{cwd:repo,encoding:'utf8',stdio:'pipe'}),prepared=JSON.parse(preparedRaw);
 if(hash(preparedRaw)!==config.geometryPreparationSha256||prepared.cases.length!==6)throw Error('Original annotation/reference verification drift');
 const control=makePrompts(engine.TIER1_PROMPT).metric;
 if(hash(control)!==CONTROL||control!==config.controlPrompt)throw Error('Control drift');
 const validate=require(path.join(bundleDir,'tier1-callable.js')).validateTier1Photo;
 const load=(name,sha)=>{const p=fs.realpathSync(path.join(sourceRoot,name));if(!p.startsWith(sourceRoot+path.sep))throw Error('Photo path escape');const b=fs.readFileSync(p);if(hash(b)!==sha)throw Error('Photo hash drift');validate({cloudConsent:'tier1-v1',imageBase64:b.toString('base64')});return b;};
 const images=new Map(),prompts=new Map();
 const cases=input.manifest.cases.map((c,i)=>{
  const facts=prepared.cases[i],pinned=config.cases[i];if(facts.id!==c.id||facts.imageSha256!==c.imageSha256||facts.annotationSha256!==c.annotationSha256||JSON.stringify(facts.geometry)!==JSON.stringify(pinned.geometry)||pinned.id!==c.id)throw Error('Fixed case geometry drift');
  const g=canonicalGeometry(facts.geometry);if(g.foodBoxCornersPx===null||g.coinBoxCornersPx===null)throw Error('Food geometry missing');
  const p={control,geometry:makeGeometryPrompt(control,g)};for(const arm of ['control','geometry'])if(hash(p[arm])!==pinned.promptSha256[arm])throw Error('Per-case prompt drift');
  prompts.set(c.id,p);images.set(c.id,load('originals/'+c.id+'.jpg',c.imageSha256));return {...c,armOrder:i%2?['geometry','control']:['control','geometry']};
 });
 if(JSON.stringify(cases.map(c=>({id:c.id,arms:c.armOrder})))!==JSON.stringify(config.order))throw Error('Order drift');
 const blank=load('owned-blank.jpg',config.probeImageSha256),probePrompt=makeGeometryPrompt(control,prepared.probeGeometry);
 if(hash(probePrompt)!==config.probePromptSha256||prepared.probeGeometry.foodBoxCornersPx!==null||prepared.probeGeometry.coinBoxCornersPx!==null)throw Error('Blank geometry drift');
 if(args.filter(v=>v==='--preflight-only').length>1)throw Error('Duplicate preflight flag');
 if(args.includes('--preflight-only')){console.log(JSON.stringify({cases:cases.length,foodPromptHashesChecked:12,sourceReferencesVerified:prepared.verification,geometryPreparationSha256:config.geometryPreparationSha256,sdkInvocations:0,registryClaimed:false}));return;}
 const common=execFileSync('git',['rev-parse','--path-format=absolute','--git-common-dir'],{cwd:repo,encoding:'utf8'}).trim(),registryDir=path.join(common,'tier1-experiments');fs.mkdirSync(registryDir,{recursive:true});
 const {GoogleGenAI,ThinkingLevel}=require(path.join(repo,'functions/node_modules/@google/genai'));
 const request=async(bytes,prompt,file)=>{
  const client=new GoogleGenAI({vertexai:true,project:'calorix-xurschnell',location:'us',apiVersion:'v1',httpOptions:{baseUrl:'https://aiplatform.us.rep.googleapis.com/',timeout:30000,retryOptions:{attempts:1}}});
  const started=Date.now(),response=await client.models.generateContent({model:MODEL,contents:[{role:'user',parts:[{text:prompt},{inlineData:{mimeType:'image/jpeg',data:bytes.toString('base64')}}]}],config:{responseMimeType:'application/json',responseJsonSchema:engine.TIER1_RESPONSE_SCHEMA,thinkingConfig:{thinkingLevel:ThinkingLevel.LOW},maxOutputTokens:8192}});
  const receipt={requestedModel:MODEL,returnedModel:response.modelVersion,text:response.text,promptText:prompt,promptSha256:hash(prompt),inputSha256:hash(bytes),usageMetadata:response.usageMetadata??null,latencyMs:Date.now()-started,costUsd:null};
  fs.writeFileSync(file,JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});if(response.modelVersion!==MODEL)throw Error('Unexpected returned model');return receipt;
 };
 const pins={sourceCommit:input.manifestCommit,engineCommit:ENGINE,manifestSha256:input.manifestSha256,protocolSha256:hash(fs.readFileSync(protocolPath)),bundleSha256:hash(fs.readFileSync(path.join(bundleDir,'bundle.json'))),model:MODEL,schemaSha256:SCHEMA,geometryPreparationSha256:config.geometryPreparationSha256,outputDir,sourceRoot,consentVersion:'tier1-v1'};
 const result=await executeGeometry({registryPath:path.join(registryDir,'annotation-geometry-v1.json'),outputDir,cases,consent:true,pins},{
  probe:async()=>{const r=await request(blank,probePrompt,path.join(outputDir,'probe-response.json'));let ok=false;try{const raw=JSON.parse(r.text);ok=Array.isArray(raw.components)&&raw.components.length===0;engine.decodeTier1Output(r.text);ok=false;}catch(e){ok=ok&&e instanceof engine.Tier1InferenceFailure&&e.category==='no_food';}const p={sdkInvocations:1,successfulCompatibility:ok,returnedModel:r.returnedModel};save(path.join(outputDir,'probe.json'),p);return p;},
  run:async(c,arm)=>{const root=path.join(outputDir,c.id,arm);fs.mkdirSync(root,{recursive:true});const r=await request(images.get(c.id),prompts.get(c.id)[arm],path.join(root,'sdk-response.json'));let outcome=decodeMass(engine,require(path.join(repo,'functions/node_modules/zod')),r.text);if(outcome.estimate)outcome.estimate={...outcome.estimate,provenance:{...outcome.estimate.provenance,model:MODEL,returnedModel:r.returnedModel,promptSha256:r.promptSha256,latencyMs:r.latencyMs}};const row={id:c.id,arm,sdkInvocations:1,...outcome,referenceMassG:c.referenceMassG,calorieReference:null,volumeReferenceUsed:false};save(path.join(root,'record.json'),row);console.log(JSON.stringify({id:c.id,arm,status:row.status,massG:row.massG}));return {sdkInvocations:1,status:row.status,failure:row.failure};}
 });
 console.log(JSON.stringify({status:result.status,completedSdkEntries:result.completedSdkEntries,unknownInFlight:result.unknownInFlight}));if(result.status!=='completed')process.exitCode=1;
}
module.exports={canonicalGeometry,makeGeometryPrompt,formatRatio,executeGeometry};
if(require.main===module)void main(process.argv.slice(2)).catch(()=>{console.error('Annotation geometry study refused. Inspect retained receipts; no retry/resume.');process.exitCode=1;});
