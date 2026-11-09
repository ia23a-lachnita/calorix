/** Synthetic transport fixtures only. No network, references or calorie measurements. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
const mocked=vi.hoisted(()=>({request:vi.fn(),construct:vi.fn()}));
vi.mock('@google/genai',async original=>{
  const actual=await original<typeof import('@google/genai')>();
  return {...actual,GoogleGenAI:class {
    models={generateContent:mocked.request};
    constructor(config:unknown){mocked.construct(config);}
  }};
});
import { ThinkingLevel } from '@google/genai';
import * as original from '../src/tier1-analysis';
const engine=original as typeof original & {
  TIER1_PORTION_AUDIT_ADDENDUM:string;TIER1_PORTION_AUDIT_PROMPT:string;
  inferTier1PortionAudit:(image:string)=>Promise<original.Tier1Estimate>;
};
const addendum='Before returning JSON, audit the portion estimates: include all visible pieces and piles in each component’s combined cooked edible mass. Do not default to a generic serving or a small sample. Check for both overestimation and underestimation of the entire visible serving; do not systematically increase amounts, infer unseen food, or double count composites.';
const digest=(text:string)=>createHash('sha256').update(text).digest('hex');
const inventory={schemaVersion:1,mealName:'Rice',components:[{name:'Rice',massG:100,
  catalogId:'usda:168878',preparation:'cooked',assumptions:[],estimatedPer100:null}],ambiguities:[],askAddedFat:false};
beforeEach(()=>{mocked.request.mockReset();mocked.construct.mockReset();mocked.request.mockResolvedValue({modelVersion:engine.TIER1_MODEL,text:JSON.stringify(inventory),usageMetadata:{promptTokenCount:42,candidatesTokenCount:12}});});
afterEach(()=>vi.clearAllMocks());

it('retains the exact production prompt and request settings',async()=>{
  expect(digest(engine.TIER1_PROMPT)).toBe('7131abc1a34804893a785c500091401d7619708acd4994105a1a7d509d5e9566');
  const result=await engine.inferTier1('AQID');
  expect(mocked.construct).toHaveBeenCalledTimes(1);
  expect(mocked.construct).toHaveBeenCalledWith({vertexai:true,project:'calorix-xurschnell',location:'us',apiVersion:'v1',httpOptions:{baseUrl:'https://aiplatform.us.rep.googleapis.com/',timeout:30000,retryOptions:{attempts:1}}});
  expect(mocked.request).toHaveBeenCalledTimes(1);
  expect(mocked.request).toHaveBeenCalledWith({model:'gemini-3.8-flash',contents:[{role:'user',parts:[{text:engine.TIER1_PROMPT},{inlineData:{mimeType:'image/jpeg',data:'AQID'}}]}],config:{responseMimeType:'application/json',responseJsonSchema:engine.TIER1_RESPONSE_SCHEMA,thinkingConfig:{thinkingLevel:ThinkingLevel.LOW},maxOutputTokens:8192}});
  expect(result.provenance.promptSha256).toBe(digest(engine.TIER1_PROMPT));expect(result.totals.kcal).toBe(130);
});
it('exposes one fixed research-only audit prompt with matching output provenance',async()=>{
  expect(typeof engine.inferTier1PortionAudit).toBe('function');
  expect(engine.TIER1_PORTION_AUDIT_ADDENDUM).toBe(addendum);
  expect(engine.TIER1_PORTION_AUDIT_PROMPT).toBe(engine.TIER1_PROMPT+'\n'+addendum);
  const result=await engine.inferTier1PortionAudit('AQID');
  expect(mocked.request).toHaveBeenCalledTimes(1);
  expect(mocked.request.mock.calls[0]![0]).toEqual({model:engine.TIER1_MODEL,contents:[{role:'user',parts:[{text:engine.TIER1_PORTION_AUDIT_PROMPT},{inlineData:{mimeType:'image/jpeg',data:'AQID'}}]}],config:{responseMimeType:'application/json',responseJsonSchema:engine.TIER1_RESPONSE_SCHEMA,thinkingConfig:{thinkingLevel:ThinkingLevel.LOW},maxOutputTokens:8192}});
  expect(result.provenance.promptSha256).toBe(digest(engine.TIER1_PORTION_AUDIT_PROMPT));
  expect(result.provenance.promptSha256).not.toBe(digest(engine.TIER1_PROMPT));
  expect(result.rawInventory).toEqual(inventory);expect(result.provenance.returnedModel).toBe(engine.TIER1_MODEL);
});
it('rejects candidate model drift without retry or fallback',async()=>{
  expect(typeof engine.inferTier1PortionAudit).toBe('function');
  mocked.request.mockResolvedValue({modelVersion:'unexpected',text:JSON.stringify(inventory)});
  await expect(engine.inferTier1PortionAudit('AQID')).rejects.toThrow('Unexpected returned model version');
  expect(mocked.request).toHaveBeenCalledTimes(1);expect(mocked.construct).toHaveBeenCalledTimes(1);
});
it('keeps empty-food candidate output an explicit failure',async()=>{
  expect(typeof engine.inferTier1PortionAudit).toBe('function');
  mocked.request.mockResolvedValue({modelVersion:engine.TIER1_MODEL,text:JSON.stringify({...inventory,components:[]})});
  await expect(engine.inferTier1PortionAudit('AQID')).rejects.toThrow('no_food');
  expect(mocked.request).toHaveBeenCalledTimes(1);
});
