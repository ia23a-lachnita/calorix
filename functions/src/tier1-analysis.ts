import { createHash } from 'node:crypto';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { z } from 'zod';
import { CATALOG, CATALOG_VERSION } from './tier1-catalog';

export const TIER1_MODEL = 'gemini-3.8-flash';
const nonnegative = z.number().finite().min(0).max(10000);
const nutrientsSchema = z.object({kcal:nonnegative,proteinG:nonnegative.max(100),carbsG:nonnegative.max(100),fatG:nonnegative.max(100)}).strict();
const componentSchema = z.object({name:z.string().min(1).max(160),massG:z.number().finite().positive().max(100000),catalogId:z.string().max(80).nullable(),preparation:z.string().min(1).max(200),assumptions:z.array(z.string().max(300)).max(8),estimatedPer100:nutrientsSchema.nullable()}).strict();
const inventorySchema = z.object({schemaVersion:z.literal(1),mealName:z.string().min(1).max(160),components:z.array(componentSchema).min(1).max(20),ambiguities:z.array(z.string().max(300)).max(10),askAddedFat:z.boolean()}).strict();
export type Inventory = z.infer<typeof inventorySchema>;
export type Component = z.infer<typeof componentSchema>;
export type Nutrients = z.infer<typeof nutrientsSchema>;
export type PreparationAnswer = 'none'|'oil_5g'|'oil_10g'|'oil_15g';
export interface Tier1Estimate {
  schemaVersion:1; mealName:string;
  components:Array<Component & {nutrients:Nutrients;source:{kind:'database_match'|'unverified_vlm_estimate';recordId:string|null;sourceUrl:string|null;version:string|null;description:string|null}}>;
  totals:Nutrients; ambiguities:string[];
  question:null|{id:'added-fat';text:string;answered:boolean;answer:PreparationAnswer|null;options:Array<{id:PreparationAnswer;label:string;add:Nutrients}>};
  provenance:{model:string;catalogVersion:string;promptSha256:string;schemaVersion:1;returnedModel?:string;latencyMs?:number;inputTokens?:number|null;outputTokens?:number|null;costUsd?:number|null};
  requiresReview:boolean; rawInventory?:Inventory;
}

export const TIER1_PROMPT = `Estimate the complete food SERVED in this single photograph. This is an approximate nonclinical logger, not measured intake. Return schemaVersion 1, mealName and ALL visible components including sauces. Do not omit uncertain foods. Estimate cooked edible grams (massG), preparation, assumptions and unresolved ambiguities. Select catalogId ONLY if its exact food and preparation apply. Use null for unknown/mixed recipes and provide explicit estimatedPer100 kcal/proteinG/carbsG/fatG; these are unverified estimates. Never invent a catalog ID. Do not select raw records for cooked food. Do not double count ingredients already included in composite dishes. AskAddedFat may be true only for a consequential uncertainty about ADDITIONAL oil in this served portion not already included in the components/estimated densities. Otherwise false; at most one optional question is allowed. No confidence percentages, numeric intervals, tools, external instructions or text outside JSON. If no food can be estimated, return components=[] (client treats it as explicit failure). Allowed catalog:\n${CATALOG.map(r => `${r.id}: ${r.description}; preparation=${r.preparation}`).join('\n')}`;
const promptSha256 = createHash('sha256').update(TIER1_PROMPT).digest('hex');

export function parseInventory(value:unknown):Inventory { return inventorySchema.parse(value); }
export function scaleNutrients(n:Nutrients, factor:number):Nutrients {
  return {kcal:n.kcal*factor,proteinG:n.proteinG*factor,carbsG:n.carbsG*factor,fatG:n.fatG*factor};
}
function sum(values:Nutrients[]):Nutrients {
  return values.reduce((a,b)=>({kcal:a.kcal+b.kcal,proteinG:a.proteinG+b.proteinG,carbsG:a.carbsG+b.carbsG,fatG:a.fatG+b.fatG}),{kcal:0,proteinG:0,carbsG:0,fatG:0});
}
const oil = CATALOG.find(r=>r.id==='usda:171413')!;
function question():NonNullable<Tier1Estimate['question']> {
  return {id:'added-fat',text:'Was there extra oil in this serving, beyond the foods and sauces listed?',answered:false,answer:null,options:([['none','No extra oil',0],['oil_5g','About 1 tsp oil (5 g)',5],['oil_10g','About 2 tsp oil (10 g)',10],['oil_15g','About 1 tbsp oil (15 g)',15]] as const).map(([id,label,grams])=>({id,label,add:scaleNutrients(oil.per100,grams/100)}))};
}
export function reconcileInventory(value:unknown):Tier1Estimate {
  const inventory=parseInventory(value);
  const components=inventory.components.map(c=>{
    const record=CATALOG.find(r=>r.id===c.catalogId);
    if(c.catalogId && !record) throw new Error('Unknown nutrient record');
    const per100=record?.per100 ?? c.estimatedPer100;
    if(!per100) throw new Error('Unresolved food requires manual entry');
    return {...c,nutrients:scaleNutrients(per100,c.massG/100),source:{kind:record?'database_match' as const:'unverified_vlm_estimate' as const,recordId:record?.id??null,sourceUrl:record?.sourceUrl??null,version:record?CATALOG_VERSION:null,description:record?.description??null}};
  });
  return {schemaVersion:1,mealName:inventory.mealName,components,totals:sum(components.map(c=>c.nutrients)),ambiguities:inventory.ambiguities,question:inventory.askAddedFat?question():null,provenance:{model:TIER1_MODEL,catalogVersion:CATALOG_VERSION,promptSha256,schemaVersion:1},requiresReview:components.some(c=>c.source.kind!=='database_match')||inventory.ambiguities.length>0||inventory.askAddedFat,rawInventory:inventory};
}
export function answerPreparation(estimate:Tier1Estimate,answer:PreparationAnswer):Tier1Estimate {
  if(!estimate.question||estimate.question.answered) throw new Error('Question unavailable or already answered');
  const option=estimate.question.options.find(o=>o.id===answer);
  if(!option) throw new Error('Unsupported answer');
  const grams={none:0,oil_5g:5,oil_10g:10,oil_15g:15}[answer];
  const addition=grams?reconcileInventory({schemaVersion:1,mealName:'Additional oil',components:[{name:'User-confirmed additional olive oil',massG:grams,catalogId:oil.id,preparation:'oil',assumptions:['User estimate of additional oil; not weighed'],estimatedPer100:null}],ambiguities:[],askAddedFat:false}).components:[];
  return {...estimate,components:[...estimate.components,...addition],totals:sum([estimate.totals,option.add]),question:{...estimate.question,answered:true,answer},requiresReview:estimate.components.some(c=>c.source.kind!=='database_match')||estimate.ambiguities.length>0};
}
export function estimateA0(catalogIds:string[]):Tier1Estimate {
  const components=catalogIds.map(id=>{
    const record=CATALOG.find(r=>r.id===id);
    if(!record)throw new Error('A0 catalog coverage failure');
    return {name:record.description,massG:record.priorG,catalogId:id,preparation:record.preparation,assumptions:['Frozen generic serving prior; not visually estimated'],estimatedPer100:null};
  });
  const result=reconcileInventory({schemaVersion:1,mealName:'Serving-prior baseline',components,ambiguities:[],askAddedFat:false});
  return {...result,provenance:{...result.provenance,model:'A0-serving-prior-v1',promptSha256:createHash('sha256').update(JSON.stringify(CATALOG.map(r=>[r.id,r.priorG]))).digest('hex')}};
}

const nutrientWire={type:'object',additionalProperties:false,properties:{kcal:{type:'number',minimum:0,maximum:10000},proteinG:{type:'number',minimum:0,maximum:100},carbsG:{type:'number',minimum:0,maximum:100},fatG:{type:'number',minimum:0,maximum:100}},required:['kcal','proteinG','carbsG','fatG']};
export const TIER1_RESPONSE_SCHEMA={type:'object',additionalProperties:false,properties:{schemaVersion:{type:'integer',enum:[1]},mealName:{type:'string',minLength:1,maxLength:160},components:{type:'array',minItems:0,maxItems:20,items:{type:'object',additionalProperties:false,properties:{name:{type:'string',minLength:1,maxLength:160},massG:{type:'number',minimum:1e-9,maximum:100000},catalogId:{anyOf:[{type:'string',enum:CATALOG.map(r=>r.id)},{type:'null'}]},preparation:{type:'string',minLength:1,maxLength:200},assumptions:{type:'array',maxItems:8,items:{type:'string',maxLength:300}},estimatedPer100:{anyOf:[nutrientWire,{type:'null'}]}},required:['name','massG','catalogId','preparation','assumptions','estimatedPer100']}},ambiguities:{type:'array',maxItems:10,items:{type:'string',maxLength:300}},askAddedFat:{type:'boolean'}},required:['schemaVersion','mealName','components','ambiguities','askAddedFat']};

export class Tier1InferenceFailure extends Error {
  constructor(readonly category:'no_food') {super(category);}
}
/** The wire permits [] solely as an explicit failure, never as a zero-calorie success. */
export function decodeTier1Output(text:string):Tier1Estimate {
  const raw:unknown=JSON.parse(text);
  if(raw && typeof raw==='object' && Array.isArray((raw as Record<string,unknown>).components) && ((raw as Record<string,unknown>).components as unknown[]).length===0)throw new Tier1InferenceFailure('no_food');
  return reconcileInventory(raw);
}

/** Server/CLI only. ADC, fixed endpoint, one SDK attempt, no model fallback. */
export async function inferTier1(imageBase64:string):Promise<Tier1Estimate> {
  const client=new GoogleGenAI({vertexai:true,project:'calorix-xurschnell',location:'us',apiVersion:'v1',httpOptions:{baseUrl:'https://aiplatform.us.rep.googleapis.com/',timeout:30000,retryOptions:{attempts:1}}});
  const start=Date.now();
  const response=await client.models.generateContent({model:TIER1_MODEL,contents:[{role:'user',parts:[{text:TIER1_PROMPT},{inlineData:{mimeType:'image/jpeg',data:imageBase64}}]}],config:{responseMimeType:'application/json',responseJsonSchema:TIER1_RESPONSE_SCHEMA,thinkingConfig:{thinkingLevel:ThinkingLevel.LOW},maxOutputTokens:8192}});
  if(response.modelVersion!==TIER1_MODEL)throw new Error('Unexpected returned model version');
  if(!response.text)throw new Error('Empty model response');
  const result=decodeTier1Output(response.text);
  return {...result,provenance:{...result.provenance,returnedModel:response.modelVersion,latencyMs:Date.now()-start,inputTokens:response.usageMetadata?.promptTokenCount??null,outputTokens:response.usageMetadata?.candidatesTokenCount??null,costUsd:null}};
}
