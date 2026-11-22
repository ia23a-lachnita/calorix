/* Operator-only replay. Never calls inference or changes app/server records. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createHash}=require('node:crypto');
const ENGINE_COMMIT='7ece3163e19b79b7c059ff31e03f123c8ad138ce';
const hash=b=>createHash('sha256').update(b).digest('hex');
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const ignored='Unassisted reconstruction excludes saved answers, corrections and consumption; saved edits are not independent references.';

// Defense against accidental standard Node network dispatch in this operator process.
// This is not a sandbox against arbitrary native code or subprocesses.
function disableNetwork(){
  const denied=()=>{throw new Error('Offline comparator: network dispatch prohibited');};
  globalThis.fetch=denied;
  for(const name of ['node:http','node:https']){
    const m=require(name);m.request=denied;m.get=denied;
  }
  const net=require('node:net');net.connect=denied;net.createConnection=denied;net.Socket.prototype.connect=denied;
  require('node:tls').connect=denied;require('node:dgram').createSocket=denied;
}
function boundedRead(file,limit){
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  try{
    const stat=fs.fstatSync(fd);
    if(!stat.isFile()||stat.size>limit)throw new Error('Input is not a regular file within size limit');
    const chunks=[];let size=0;
    while(size<=limit){
      const chunk=Buffer.alloc(Math.min(65536,limit+1-size));
      const count=fs.readSync(fd,chunk,0,chunk.length,null);if(!count)break;
      size+=count;chunks.push(chunk.subarray(0,count));
    }
    if(size>limit)throw new Error('Input exceeds size limit');
    return Buffer.concat(chunks,size);
  }finally{fs.closeSync(fd);}
}
function validateExport(record,photo){
  const meal=record?.meal;
  if(!object(record)||record.schemaVersion!==1||record.referenceMeasurementsIncluded!==false||
    record.photoFile!=='photo.jpg'||!/^\d{4}-\d\d-\d\dT/.test(record.exportedAtUtc??'')||
    !/^[a-f0-9]{64}$/.test(record.photoSha256??'')||record.photoSha256!==hash(photo)||
    photo.length<4||photo[0]!==255||photo[1]!==216||!object(meal)||
    ![1,2,3].includes(meal.schemaVersion)||
    (meal.schemaVersion===3 && (!object(meal.portionInputs)||!Object.keys(meal.portionInputs).length))||!Number.isSafeInteger(meal.revision)||meal.revision<1||
    typeof meal.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(meal.id)||Object.hasOwn(meal,'photoPath')){
    throw new Error('Invalid saved meal export, JPEG or photo hash');
  }
  return meal;
}
function reconstruct(meal,engine,cli){
  if(meal.analysis===null||meal.analysis===undefined){
    return {meal_id:meal.id,initial_estimate:null,estimate:null,warnings:[ignored],
      baseline_scope:'A0 shares A1 identities/preparation; only portions differ',
      predictions:['A0','A1'].map(route=>({route,status:'failed',served_kcal:null,consumed_kcal:null,
        model_version:route==='A0'?'A0-serving-prior-v1':engine.TIER1_MODEL,
        prompt_sha256:route==='A1'?hash(engine.TIER1_PROMPT):'',nutrient_data_version:null,
        preparation_context_id:null,latency_ms:null,cost_usd:null,corrections:0,missing_foods:[],
        failure_reason:route==='A0'?'Stored A1 inventory unavailable for shared-input A0':'No saved analysis; original server attempt unknown; offline comparator performs no inference',user_answer:null}))};
  }
  const analysis=meal.analysis,p=analysis.provenance;
  const catalog=engine.reconcileInventory(analysis.rawInventory);
  if(analysis.schemaVersion!==1||!object(p)||p.schemaVersion!==1||p.model!==engine.TIER1_MODEL||
    p.returnedModel!==engine.TIER1_MODEL||p.promptSha256!==hash(engine.TIER1_PROMPT)||
    p.catalogVersion!==catalog.provenance.catalogVersion||
    (p.latencyMs!==undefined&&(!Number.isFinite(p.latencyMs)||p.latencyMs<0))){
    throw new Error('Unsupported stored analysis profile; no inference attempted');
  }
  // Do not reuse saved totals/components/question answers: raw inventory is the unassisted input.
  catalog.provenance={...catalog.provenance,returnedModel:p.returnedModel,
    ...(p.latencyMs===undefined?{}:{latencyMs:p.latencyMs})};
  const report=cli.createPilotPredictions(catalog,meal.id);
  report.warnings.push(ignored);
  return report;
}
function compareSavedMeal({recordPath,outputPath}){
  if(!recordPath||!outputPath)throw new Error('Meal input and new output required');
  const input=path.resolve(recordPath),output=path.resolve(outputPath);
  try{fs.lstatSync(output);throw new Error('Output exists; refusing overwrite');}
  catch(error){if(error.code!=='ENOENT')throw error;}
  const raw=boundedRead(input,1024*1024);
  const photo=boundedRead(path.join(path.dirname(input),'photo.jpg'),20*1024*1024);
  const record=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
  const meal=validateExport(record,photo);
  disableNetwork();
  const {buildFrozenBundle,verifyFrozenBundle}=require('./run_frozen_public_eval.cjs');
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'ravlo-offline-engine-'));
  try{
    const bundle=path.join(temporary,'bundle'),repo=path.resolve(__dirname,'..');
    buildFrozenBundle(repo,ENGINE_COMMIT,bundle);
    const receipt=verifyFrozenBundle(repo,ENGINE_COMMIT,bundle);
    const engine=require(path.join(bundle,'tier1-analysis.js')),cli=require(path.join(bundle,'tier1-cli.js'));
    const report=reconstruct(meal,engine,cli);
    report.reconstruction={schemaVersion:1,
      scope:'Offline compatible-engine reconstruction from stored raw inventory; historical exactness not established',
      engine:receipt,recordSha256:hash(raw),photoSha256:hash(photo),inferenceInputSha256:null,
      inferenceInputNote:'Saved capture JPEG is not the unrecorded recompressed Android inference upload',
      exportedAtUtc:record.exportedAtUtc,savedRevision:meal.revision,sdkCalls:0,
      analysisAvailability:report.initial_estimate?'present':'absent',
      originalInferenceStatus:report.initial_estimate?'saved_output_present':'unknown',
      availabilityNote:'No saved analysis does not establish that an original inference was attempted or failed',
      latencyScope:'A1 latency, if present, is the original server duration; not this replay or app workflow',
      referenceMeasurementsIncluded:false};
    fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
    return report;
  }finally{
    // Remove imports from the temporary bundle that is about to be deleted.
    for(const key of Object.keys(require.cache))if(key.startsWith(temporary+path.sep))delete require.cache[key];
    fs.rmSync(temporary,{recursive:true,force:true});
  }
}
function main(args){
  if(args.length!==4||args[0]!=='--meal'||args[2]!=='--output'||!args[1]||!args[3]){
    throw new Error('Usage: node tool/compare_saved_meal.cjs --meal EXTRACTED/meal.json --output NEW.json (offline only; no inference arguments)');
  }
  const report=compareSavedMeal({recordPath:args[1],outputPath:args[3]});
  console.log(JSON.stringify({meal_id:report.meal_id,sdkCalls:0,routes:report.predictions.map(p=>({route:p.route,status:p.status}))}));
}
if(require.main===module){try{main(process.argv.slice(2));}catch{console.error('Offline comparison failed. Check arguments, export integrity, full Git history, supported profile and fresh output; offline comparator performs no inference.');process.exitCode=1;}}
module.exports={compareSavedMeal,ENGINE_COMMIT,disableNetwork};
