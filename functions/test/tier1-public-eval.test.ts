import { afterEach, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPublicEvaluation } from '../src/tier1-public-eval';
import { reconcileInventory, Tier1InferenceFailure } from '../src/tier1-analysis';
const roots:string[]=[];
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});
function setup() {
  const root=mkdtempSync(join(tmpdir(),'tier1-public-test-'));roots.push(root);mkdirSync(join(root,'inputs'));
  const image=Buffer.from([255,216,255,224,1,2,3,4,5,6,255,217]);
  const cases=[1550000000,1550086400].map((stamp,i)=>{
    const id=`dish_${stamp}`;writeFileSync(join(root,'inputs',`${id}.jpg`),image);
    return {id,captureDate:`2019-02-${12+i}`,reference:{kcal:i?400:100,massG:100,proteinG:5,carbsG:15,fatG:3},ingredients:[{id:'reference-only',name:'Hidden reference'}],inputStatus:'ready',inputPath:`inputs/${id}.jpg`,inputSha256:createHash('sha256').update(image).digest('hex')};
  });
  return {root,image,manifest:{schemaVersion:1,scope:'public_dataset',datasetId:'nutrition5k',sampleCount:2,cases}};
}
const rice=(grams=100)=>reconcileInventory({schemaVersion:1,mealName:'Rice',components:[{name:'Rice',massG:grams,catalogId:'usda:168878',preparation:'cooked',assumptions:[],estimatedPer100:null}],ambiguities:[],askAddedFat:true});
it('scores whole public images without reference leakage or Android-reference claims',async()=>{
  const f=setup();const seen:string[]=[];
  const r=await runPublicEvaluation({manifest:f.manifest,assetsRoot:f.root,runDir:join(f.root,'run'),consent:true,sourceCommit:'hermetic',infer:async image=>{seen.push(image);return rice(seen.length*100);}});
  expect(seen).toEqual([f.image.toString('base64'),f.image.toString('base64')]);
  expect(r.scope).toBe('public_dataset');expect(r.androidWeighedMeals).toBe(0);expect(r.routes.A1.coverage).toBe(1);
  expect(r.routes.A1.kcal.mae).toBeCloseTo(85);expect(r.routes.A1.kcal.bias).toBeCloseTo(-55);expect(r.routes.A1.kcal.p90AbsoluteError).toBeCloseTo(129);expect(r.routes.A1.kcal.meanNormalizedAbsoluteError).toBeCloseTo(.25);
  expect(r.preparationQuestions.unanswered).toBe(2);expect(r.preparationQuestions.answered).toBe(0);expect(r.costUsd).toBeNull();expect(r.missingFoodsAudit).toBe('not_assessed');expect(r.paired.scoredCases).toBe(2);
});
it('keeps unverified A1 answers but reports A0 catalog gaps and paired attrition',async()=>{
  const f=setup();let n=0;
  const r=await runPublicEvaluation({manifest:f.manifest,assetsRoot:f.root,runDir:join(f.root,'run'),consent:true,sourceCommit:'hermetic',infer:async()=>{
    if(++n===1)return rice();
    return reconcileInventory({schemaVersion:1,mealName:'Unknown',components:[{name:'Mixed dish',massG:100,catalogId:null,preparation:'unknown',assumptions:[],estimatedPer100:{kcal:200,proteinG:4,carbsG:20,fatG:10}}],ambiguities:[],askAddedFat:false});
  }});
  expect(r.routes.A1.scoredCases).toBe(2);expect(r.routes.A0.coverage).toBe(.5);expect(r.routes.A0.failed).toBe(1);expect(r.paired.scoredCases).toBe(1);expect(r.nutrientProvenance.unverifiedPredictedKcalFraction).toBeGreaterThan(0);
});
it('counts damaged inputs without model calls or dropped denominators',async()=>{
  const f=setup();f.manifest.cases[0]!.inputSha256='0'.repeat(64);let n=0;
  const r=await runPublicEvaluation({manifest:f.manifest,assetsRoot:f.root,runDir:join(f.root,'run'),consent:true,sourceCommit:'hermetic',infer:async()=>{n++;return rice();}});
  expect(n).toBe(1);expect(r.selectedCases).toBe(2);expect(r.routes.A1.coverage).toBe(.5);expect(r.datasetFailures).toBe(1);
});
it('halts infrastructure errors without retrying or hiding unattempted cases',async()=>{
  const f=setup();let n=0;
  const r=await runPublicEvaluation({manifest:f.manifest,assetsRoot:f.root,runDir:join(f.root,'run'),consent:true,sourceCommit:'hermetic',infer:async()=>{n++;throw {status:429};}});
  expect(n).toBe(1);expect(r.sdkInvocations).toBe(1);expect(r.routes.A1.failed).toBe(1);expect(r.routes.A1.notAttempted).toBe(1);expect(r.routes.A1.coverage).toBe(0);
});
it('continues per-image no-food failures and retains them in coverage',async()=>{
  const f=setup();let n=0;
  const r=await runPublicEvaluation({manifest:f.manifest,assetsRoot:f.root,runDir:join(f.root,'run'),consent:true,sourceCommit:'hermetic',infer:async()=>{if(++n===1)throw new Tier1InferenceFailure('no_food');return rice();}});
  expect(n).toBe(2);expect(r.routes.A1.coverage).toBe(.5);expect(r.routes.A1.failed).toBe(1);
});
it('requires consent and rejects reused run directories before new calls',async()=>{
  const f=setup();const runDir=join(f.root,'run');let n=0;const infer=async()=>{n++;return rice();};
  await expect(runPublicEvaluation({manifest:f.manifest,assetsRoot:f.root,runDir,consent:false,sourceCommit:'hermetic',infer})).rejects.toThrow();expect(n).toBe(0);expect(existsSync(runDir)).toBe(false);
  await runPublicEvaluation({manifest:f.manifest,assetsRoot:f.root,runDir,consent:true,sourceCommit:'hermetic',infer});
  await expect(runPublicEvaluation({manifest:f.manifest,assetsRoot:f.root,runDir,consent:true,sourceCommit:'hermetic',infer})).rejects.toThrow();expect(n).toBe(2);
});
it('records and verifies the explicit research prompt hash',async()=>{
  const f=setup(),expected='a'.repeat(64),runDir=join(f.root,'run');
  const options={manifest:f.manifest,assetsRoot:f.root,runDir,consent:true,sourceCommit:'hermetic',expectedPromptSha256:expected,
    infer:async()=>{const e=rice();return {...e,provenance:{...e.provenance,promptSha256:expected}};}};
  const result=await runPublicEvaluation(options);
  expect(result.routes.A1.scoredCases).toBe(2);
  expect(JSON.parse(readFileSync(join(runDir,'run.json'),'utf8')).promptSha256).toBe(expected);
});
it('halts a prompt-profile mismatch without scoring it or dispatching the next case',async()=>{
  const f=setup();let calls=0;
  const options={manifest:f.manifest,assetsRoot:f.root,runDir:join(f.root,'run'),consent:true,sourceCommit:'hermetic',expectedPromptSha256:'a'.repeat(64),infer:async()=>{calls++;return rice();}};
  const result=await runPublicEvaluation(options);
  expect(calls).toBe(1);expect(result.routes.A1.failed).toBe(1);expect(result.routes.A1.notAttempted).toBe(1);
  const stored=JSON.parse(readFileSync(join(f.root,'run',f.manifest.cases[0]!.id+'.json'),'utf8'));
  expect(stored.A1.failure).toBe('prompt_drift');expect(stored.estimate).toBeUndefined();
});
it('rejects malformed expected prompt hashes before creating a run or dispatching',async()=>{
  const f=setup(),runDir=join(f.root,'run');let calls=0;
  const options={manifest:f.manifest,assetsRoot:f.root,runDir,consent:true,sourceCommit:'hermetic',expectedPromptSha256:'invalid',infer:async()=>{calls++;return rice();}};
  await expect(runPublicEvaluation(options)).rejects.toThrow();expect(calls).toBe(0);expect(existsSync(runDir)).toBe(false);
});
it('pins research model metadata to the actual returned model',async()=>{
  const f=setup(),runDir=join(f.root,'run'),expectedModel='gemini-4-argon';
  const options={manifest:f.manifest,assetsRoot:f.root,runDir,consent:true,sourceCommit:'hermetic',expectedModel,
    infer:async()=>{const e=rice();return {...e,provenance:{...e.provenance,model:expectedModel,returnedModel:expectedModel}};}};
  const result=await runPublicEvaluation(options);
  expect(result.routes.A1.scoredCases).toBe(2);expect(JSON.parse(readFileSync(join(runDir,'run.json'),'utf8')).model).toBe(expectedModel);
});
it('halts either declared or returned model mismatch before scoring the next image',async()=>{
  for(const field of ['model','returnedModel'] as const){
    const f=setup();let calls=0;const runDir=join(f.root,'run'),expectedModel='gemini-4-argon';
    const options={manifest:f.manifest,assetsRoot:f.root,runDir,consent:true,sourceCommit:'hermetic',expectedModel,
      infer:async()=>{calls++;const e=rice();return {...e,provenance:{...e.provenance,model:expectedModel,returnedModel:expectedModel,[field]:'gemini-3.8-flash'}};}};
    const result=await runPublicEvaluation(options);expect(calls).toBe(1);expect(result.routes.A1.failed).toBe(1);expect(result.routes.A1.notAttempted).toBe(1);
    const receipt=JSON.parse(readFileSync(join(runDir,f.manifest.cases[0]!.id+'.json'),'utf8'));
    expect(receipt.A1.failure).toBe('model_drift');expect(receipt.estimate).toBeUndefined();
  }
});
it('refuses malformed model pins and a nondefault model without injected inference before creating a run',async()=>{
  const f=setup(),runDir=join(f.root,'run');let calls=0;
  const base={manifest:f.manifest,assetsRoot:f.root,runDir,consent:true,sourceCommit:'hermetic'};
  for(const expectedModel of ['', 'gemini invalid','../model'])await expect(runPublicEvaluation({...base,expectedModel,infer:async()=>{calls++;return rice();}})).rejects.toThrow();
  await expect(runPublicEvaluation({...base,expectedModel:'gemini-4-argon'})).rejects.toThrow();
  expect(calls).toBe(0);expect(existsSync(runDir)).toBe(false);
});
