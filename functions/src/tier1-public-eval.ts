/** Small public-reference evaluator; never labels these rows Android pilot meals. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import { CATALOG, CATALOG_VERSION } from './tier1-catalog';
import { estimateA0, inferTier1, Tier1InferenceFailure, TIER1_MODEL, TIER1_PROMPT, TIER1_RESPONSE_SCHEMA, type Nutrients, type Tier1Estimate } from './tier1-analysis';
import { validateTier1Photo } from './tier1-callable';
import { createPilotPredictions } from './tier1-cli';

const number=z.number().finite().nonnegative();
const vector=z.object({kcal:number,proteinG:number,carbsG:number,fatG:number});
const caseSchema=z.object({id:z.string().regex(/^dish_[0-9]{10}$/),captureDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reference:vector.extend({kcal:number.positive(),massG:number.positive()}),ingredients:z.array(z.object({id:z.string(),name:z.string()}).passthrough()).min(1),
  inputStatus:z.enum(['ready','dataset_failure']),inputPath:z.string().regex(/^inputs\/dish_[0-9]{10}\.jpg$/).nullable(),inputSha256:z.string().regex(/^[0-9a-f]{64}$/).nullable(),inputFailure:z.string().nullable().optional()}).passthrough();
const manifestSchema=z.object({schemaVersion:z.literal(1),scope:z.literal('public_dataset'),datasetId:z.literal('nutrition5k'),sampleCount:z.number().int().min(1).max(20),cases:z.array(caseSchema).min(1).max(20)}).passthrough().superRefine((m,ctx)=>{
  if(m.sampleCount!==m.cases.length || new Set(m.cases.map(c=>c.id)).size!==m.cases.length || new Set(m.cases.map(c=>c.captureDate)).size!==m.cases.length)ctx.addIssue({code:z.ZodIssueCode.custom,message:'Count/unique scan/date mismatch'});
  if(m.cases.some(c=>c.inputStatus==='ready'&&(!c.inputPath||!c.inputSha256)))ctx.addIssue({code:z.ZodIssueCode.custom,message:'Ready input lacks path/hash'});
});
type PublicCase=z.infer<typeof caseSchema>;
type Status='ok'|'failed'|'not_attempted'|'pending';
interface RouteResult {status:Status;predicted:Nutrients|null;massG:number|null;failure:string|null}
interface Outcome {id:string;A0:RouteResult;A1:RouteResult;sdkInvoked:boolean;datasetFailure:boolean;runnerWallMs:number|null;comparisonContextId?:string;estimate?:Tier1Estimate}
interface Options {manifest:unknown;assetsRoot:string;runDir:string;consent:boolean;sourceCommit:string;expectedPromptSha256?:string;infer?:(image:string)=>Promise<Tier1Estimate>;onProgress?:(result:Outcome)=>void}
const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const empty=(status:Status='not_attempted',failure:string|null=null):RouteResult=>({status,predicted:null,massG:null,failure});
const answer=(estimate:Tier1Estimate):RouteResult=>({status:'ok',predicted:estimate.totals,massG:estimate.components.reduce((sum,c)=>sum+c.massG,0),failure:null});
function quantile(values:number[],p:number):number|null {
  if(!values.length)return null;
  const a=[...values].sort((x,y)=>x-y),index=(a.length-1)*p,low=Math.floor(index),high=Math.ceil(index);
  return a[low]!+(a[high]!-a[low]!)*(index-low);
}
function metrics(pairs:Array<[number,number]>,normalized=false) {
  const errors=pairs.map(([predicted,truth])=>predicted-truth),absolute=errors.map(Math.abs);
  const mean=(values:number[])=>values.length?values.reduce((s,v)=>s+v,0)/values.length:null;
  return {scoredCases:pairs.length,mae:mean(absolute),bias:mean(errors),p90AbsoluteError:quantile(absolute,.9),
    meanNormalizedAbsoluteError:normalized?mean(pairs.map(([p,t])=>Math.abs(p-t)/Math.max(t,200))):null};
}
function routeSummary(cases:PublicCase[],rows:Outcome[],route:'A0'|'A1') {
  const scored=cases.flatMap((c,i)=>rows[i]?.[route].status==='ok'?[{c,r:rows[i]![route]}]:[]);
  const kcal=(filter:(c:PublicCase)=>boolean=()=>true)=>metrics(scored.filter(({c})=>filter(c)).map(({c,r})=>[r.predicted!.kcal,c.reference.kcal]),true);
  return {scoredCases:scored.length,coverage:scored.length/cases.length,
    failed:rows.filter(r=>r[route].status==='failed').length,notAttempted:rows.filter(r=>r[route].status==='not_attempted').length,pending:rows.filter(r=>r[route].status==='pending').length,
    kcal:kcal(),macros:{proteinG:metrics(scored.map(({c,r})=>[r.predicted!.proteinG,c.reference.proteinG])),carbsG:metrics(scored.map(({c,r})=>[r.predicted!.carbsG,c.reference.carbsG])),fatG:metrics(scored.map(({c,r})=>[r.predicted!.fatG,c.reference.fatG]))},
    massG:metrics(scored.map(({c,r})=>[r.massG!,c.reference.massG])),
    referenceComponentSlices:{single:kcal(c=>c.ingredients.length===1),multiple:kcal(c=>c.ingredients.length>1)},
    energyBins:{under200:kcal(c=>c.reference.kcal<200),from200to600:kcal(c=>c.reference.kcal>=200&&c.reference.kcal<=600),over600:kcal(c=>c.reference.kcal>600)}};
}
export function summarizePublicEvaluation(cases:PublicCase[],rows:Outcome[]) {
  const estimates=rows.flatMap(r=>r.estimate?[r.estimate]:[]),components=estimates.flatMap(e=>e.components);
  const allKcal=components.reduce((s,c)=>s+c.nutrients.kcal,0),unverified=components.filter(c=>c.source.kind!=='database_match');
  const paired=cases.flatMap((c,i)=>rows[i]?.A0.status==='ok'&&rows[i]?.A1.status==='ok'?[{c,r:rows[i]!}]:[]);
  const timings=estimates.flatMap(e=>typeof e.provenance.latencyMs==='number'?[e.provenance.latencyMs]:[]);
  return {scope:'public_dataset' as const,dataset:'nutrition5k',selectedCases:cases.length,androidWeighedMeals:0,sdkInvocations:rows.filter(r=>r.sdkInvoked).length,
    datasetFailures:rows.filter(r=>r.datasetFailure).length,routes:{A0:routeSummary(cases,rows,'A0'),A1:routeSummary(cases,rows,'A1')},
    paired:{scoredCases:paired.length,scope:'catalog-covered paired subset',A0:metrics(paired.map(({c,r})=>[r.A0.predicted!.kcal,c.reference.kcal]),true),A1:metrics(paired.map(({c,r})=>[r.A1.predicted!.kcal,c.reference.kcal]),true)},
    preparationQuestions:{unanswered:estimates.filter(e=>e.question&&!e.question.answered).length,answered:0,policy:'No owner knowledge; no reference-derived answers'},
    nutrientProvenance:{components:components.length,databaseMatchedComponents:components.length-unverified.length,unverifiedComponents:unverified.length,unverifiedPredictedKcalFraction:allKcal?unverified.reduce((s,c)=>s+c.nutrients.kcal,0)/allKcal:null},
    inferenceLatencyMs:{measured:timings.length,p50:quantile(timings,.5),p90:quantile(timings,.9)},runnerWallMs:{measured:rows.filter(r=>r.runnerWallMs!==null).length,p50:quantile(rows.flatMap(r=>r.runnerWallMs===null?[]:[r.runnerWallMs]),.5)},
    phoneShutterToEstimateMs:null,costUsd:null,billingStatus:'Unmeasured; failed and thought-token usage incomplete',
    tokenUsage:{knownPromptTokens:estimates.reduce((s,e)=>s+(e.provenance.inputTokens??0),0),knownCandidateTokens:estimates.reduce((s,e)=>s+(e.provenance.outputTokens??0),0),recordsWithUsage:estimates.filter(e=>e.provenance.inputTokens!=null&&e.provenance.outputTokens!=null).length},
    missingFoodsAudit:'not_assessed',manualCorrections:0,interpretation:'Conditional accuracy on successful answers; failures/unattempted cases remain in fixed coverage denominator. Capture-date thinning does not establish independence; closed-model pretraining exposure unknown.'};
}
function failure(error:unknown):{category:string;halt:boolean} {
  try {
    if(error instanceof Tier1InferenceFailure)return {category:error.category,halt:false};
    if(error instanceof z.ZodError||error instanceof SyntaxError)return {category:'invalid_model_output',halt:false};
    if(error instanceof Error&&['Unknown nutrient record','Unresolved food requires manual entry','Empty model response'].includes(error.message))return {category:'invalid_model_output',halt:false};
    if(error instanceof Error&&error.message==='Unexpected returned model version')return {category:'model_drift',halt:true};
    if(error instanceof Error&&error.message==='Unexpected inference prompt profile')return {category:'prompt_drift',halt:true};
    if(error&&typeof error==='object'&&'status' in error&&typeof error.status==='number'&&error.status>=400&&error.status<=599)return {category:`http_${error.status}`,halt:true};
  }catch{/* Foreign error objects are never serialized. */}
  return {category:'inference_system_failure',halt:true};
}
function save(path:string,value:unknown) {writeFileSync(path+'.pending',JSON.stringify(value,null,2)+'\n',{mode:0o600});renameSync(path+'.pending',path);}
export async function runPublicEvaluation(options:Options) {
  if(!options.consent)throw new Error('Explicit public-photo cloud consent required');
  if(options.expectedPromptSha256!==undefined && (typeof options.expectedPromptSha256!=='string'||!/^[0-9a-f]{64}$/.test(options.expectedPromptSha256)))throw new Error('Invalid expected prompt profile');
  if(options.expectedPromptSha256!==undefined && options.expectedPromptSha256!==hash(TIER1_PROMPT) && !options.infer)throw new Error('Custom prompt requires an explicit inference function');
  const manifest=manifestSchema.parse(options.manifest),root=realpathSync(options.assetsRoot);
  mkdirSync(options.runDir); // Exclusive claim, before any inference. No implicit resume/retry.
  writeFileSync(join(options.runDir,'run.json'),JSON.stringify({sourceCommit:options.sourceCommit,manifestSha256:hash(JSON.stringify(manifest)),model:TIER1_MODEL,catalogVersion:CATALOG_VERSION,baselineScope:'A0 shares A1 identities/preparation/catalog; only serving priors differ',portionPriorSha256:hash(JSON.stringify(CATALOG.map(r=>[r.id,r.priorG]))),promptSha256:options.expectedPromptSha256??hash(TIER1_PROMPT),schemaSha256:hash(JSON.stringify(TIER1_RESPONSE_SCHEMA)),maxSdkInvocations:manifest.sampleCount,startedAt:new Date().toISOString()},null,2)+'\n',{flag:'wx',mode:0o600});
  save(join(options.runDir,'manifest.json'),manifest);
  const rows:Outcome[]=manifest.cases.map(c=>({id:c.id,A0:empty(),A1:empty(),sdkInvoked:false,datasetFailure:false,runnerWallMs:null}));
  const checkpoint=()=>save(join(options.runDir,'summary.json'),summarizePublicEvaluation(manifest.cases,rows));
  checkpoint();let halted=false;
  for(let i=0;i<manifest.cases.length;i++) {
    if(halted)break;
    const c=manifest.cases[i]!,r=rows[i]!,started=Date.now();let image:string;
    try {
      if(c.inputStatus!=='ready'||!c.inputPath||!c.inputSha256)throw new Error('Unavailable input');
      const input=realpathSync(resolve(root,c.inputPath));
      if(!input.startsWith(root+sep))throw new Error('Input outside assets root');
      const bytes=readFileSync(input);
      if(hash(bytes)!==c.inputSha256)throw new Error('Input hash mismatch');
      image=validateTier1Photo({cloudConsent:'tier1-v1',imageBase64:bytes.toString('base64')});
    }catch {
      r.datasetFailure=true;r.A1=empty('failed','dataset_input_failure');r.A0=empty('failed','inventory_unavailable');
      r.runnerWallMs=Date.now()-started;save(join(options.runDir,c.id+'.json'),r);checkpoint();options.onProgress?.(r);continue;
    }
    r.sdkInvoked=true;r.A1=empty('pending');r.A0=empty('pending');save(join(options.runDir,c.id+'.json'),r);checkpoint();
    try {
      const estimate=await (options.infer??inferTier1)(image);
      if(options.expectedPromptSha256!==undefined&&estimate.provenance.promptSha256!==options.expectedPromptSha256)throw new Error('Unexpected inference prompt profile');
      r.estimate=estimate;r.A1=answer(estimate);
      const pilot=createPilotPredictions(estimate,c.id);r.comparisonContextId=pilot.predictions[0]!.preparation_context_id;
      if(pilot.predictions[0]!.status==='ok')r.A0=answer(estimateA0(estimate.components.map(part=>part.catalogId!)));
      else r.A0=empty('failed','catalog_coverage_failure');
    }catch(error) {const f=failure(error);r.A1=empty('failed',f.category);r.A0=empty('failed','inventory_unavailable');halted=f.halt;}
    r.runnerWallMs=Date.now()-started;save(join(options.runDir,c.id+'.json'),r);checkpoint();options.onProgress?.(r);
  }
  const report=summarizePublicEvaluation(manifest.cases,rows);save(join(options.runDir,'summary.json'),report);return report;
}
async function main(args:string[]) {
  const value=(key:string)=>{const i=args.indexOf(key);return i<0?undefined:args[i+1];};
  const manifestPath=value('--manifest'),runDir=value('--run-dir');
  if(!manifestPath||!runDir||value('--cloud-consent')!=='tier1-v1')throw new Error('Use --manifest FILE --run-dir NEW --cloud-consent tier1-v1; sends public images to Vertex US');
  const repo=resolve(__dirname,'../..');
  const manifestFile=realpathSync(resolve(manifestPath));
  if(!manifestFile.startsWith(repo+sep))throw new Error('Use a committed manifest inside this repository');
  execFileSync('git',['ls-files','--error-unmatch','--',relative(repo,manifestFile)],{cwd:repo,stdio:'pipe'});
  if(execFileSync('git',['status','--porcelain'],{cwd:repo,encoding:'utf8'}).trim())throw new Error('Commit source/manifest before a live run');
  const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim();
  const report=await runPublicEvaluation({manifest:JSON.parse(readFileSync(manifestPath,'utf8')),assetsRoot:resolve(value('--assets-root')??dirname(manifestFile)),runDir:resolve(runDir),consent:true,sourceCommit,
    onProgress:r=>console.log(JSON.stringify({id:r.id,A1:r.A1.status,A0:r.A0.status,failure:r.A1.failure}))});
  console.log(JSON.stringify(report));
}
if(require.main===module)void main(process.argv.slice(2)).catch(()=>{console.error('Public evaluation failed; inspect retained receipts. No automatic retry.');process.exitCode=1;});
