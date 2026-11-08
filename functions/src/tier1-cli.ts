import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { answerPreparation, estimateA0, inferTier1, type PreparationAnswer, type Tier1Estimate } from './tier1-analysis';
import { validateTier1Photo } from './tier1-callable';

interface Prediction {
  route:'A0'|'A1';status:'ok'|'failed';served_kcal:number|null;consumed_kcal:null;
  model_version:string;prompt_sha256:string;nutrient_data_version:string;
  preparation_context_id:string;latency_ms:number|null;cost_usd:null;
  corrections:number;missing_foods:string[];failure_reason:string|null;user_answer:string|null;
}
/** A0 shares the A1 food identities/preparation; this isolates serving priors, not recognition. */
export function createPilotPredictions(initial:Tier1Estimate,mealId:string,answer?:PreparationAnswer) {
  const estimate=answer?answerPreparation(initial,answer):initial;
  const context=createHash('sha256').update(JSON.stringify({foods:initial.components.map(c=>[c.catalogId,c.name,c.preparation]),answer:answer??null})).digest('hex');
  const record=(route:'A0'|'A1',result:Tier1Estimate|null,failure:string|null):Prediction=>({
    route,status:result?'ok':'failed',served_kcal:result?.totals.kcal??null,consumed_kcal:null,
    model_version:result?.provenance.returnedModel??result?.provenance.model??'A0-serving-prior-v1',
    prompt_sha256:result?.provenance.promptSha256??'',nutrient_data_version:initial.provenance.catalogVersion,
    preparation_context_id:context,latency_ms:route==='A1'?initial.provenance.latencyMs??null:null,
    cost_usd:null,corrections:0,missing_foods:[],failure_reason:failure,user_answer:answer??null,
  });
  let a0:Tier1Estimate|null=null;
  let failure:string|null=null;
  try{
    a0=estimateA0(initial.components.map(c=>{if(!c.catalogId)throw new Error('A0 catalog coverage failure');return c.catalogId;}));
    if(answer){a0=answerPreparation({...a0,question:initial.question},answer);}
  }catch{failure='A0 catalog coverage failure; no synthetic nutrient substitution';a0=null;}
  return {meal_id:mealId,baseline_scope:'A0 shares A1 identities/preparation; only portions differ',estimate,predictions:[record('A0',a0,failure),record('A1',estimate,null)]};
}

async function main(args:string[]) {
  const value=(key:string)=>{const i=args.indexOf(key);return i<0?undefined:args[i+1];};
  const image=value('--image'),mealId=value('--meal-id'),output=value('--output');
  if(!image||!mealId||!output||value('--cloud-consent')!=='tier1-v1')throw new Error('Usage: --image PHOTO.jpg --meal-id ID --output NEW.json --cloud-consent tier1-v1 [--preparation-answer none|oil_5g|oil_10g|oil_15g]. Sends photo to Vertex US; provider caching/retention applies.');
  if(existsSync(output))throw new Error('Output exists; refusing another inference or overwrite');
  const imageBase64=readFileSync(image).toString('base64');
  validateTier1Photo({cloudConsent:'tier1-v1',imageBase64});
  const answer=value('--preparation-answer');
  if(answer&&!['none','oil_5g','oil_10g','oil_15g'].includes(answer))throw new Error('Invalid preparation answer');
  let report:unknown;
  let failed=false;
  try{report=createPilotPredictions(await inferTier1(imageBase64),mealId,answer as PreparationAnswer|undefined);}
  catch{failed=true;report={meal_id:mealId,predictions:[{route:'A0',status:'failed',failure_reason:'A1 inventory unavailable for shared-input A0'},{route:'A1',status:'failed',failure_reason:'Inference failed; no retry or fallback performed'}]};}
  writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
  if(failed)process.exitCode=1;
}
if(require.main===module)void main(process.argv.slice(2)).catch(error=>{console.error(error instanceof Error?error.message:'Tier1 command failed');process.exitCode=1;});
