import { expect, it } from 'vitest';
import { CATALOG } from '../src/tier1-catalog';
import { reconcileInventory, estimateA0 } from '../src/tier1-analysis';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const food=(id:string,massG:number)=>({name:'Food',massG,catalogId:id,preparation:'cooked',assumptions:[],estimatedPer100:null});
it('does not promote candidate-only records into the active reconciliation or A0',()=>{
  expect(CATALOG.map(r=>r.id)).not.toContain('usda:169737');
  const input={schemaVersion:1,mealName:'Pasta',components:[food('usda:169737',100)],ambiguities:[],askAddedFat:false};
  expect(()=>reconcileInventory(input)).toThrow('Unknown nutrient record');
  expect(()=>estimateA0(['usda:169737'])).toThrow('A0 catalog coverage failure');
});
it('all frozen catalog nutrients and descriptions match attributed source rows',()=>{
  const source=JSON.parse(readFileSync(join(__dirname,'../eval/tier1-public/catalog-v2-provenance.json'),'utf8')) as {
    archiveSha256:string;sourceRows:Array<{id:string;foodRow:{description:string};nutrientRows:Array<{nutrient_id:string;amount:string}>}>;
  };
  const candidate=JSON.parse(readFileSync(join(__dirname,'../eval/tier1-public/catalog-v2.json'),'utf8')) as {version:string;records:Array<{id:string;description:string;sourceArchiveSha256:string;per100:{kcal:number;proteinG:number;fatG:number;carbsG:number}}>} ;
  expect(candidate.version).toBe('usda-sr-2018-tier1-20261108-v2');
  expect(candidate.records).toHaveLength(73);expect(new Set(candidate.records.map(r=>r.id)).size).toBe(73);
  const keys={kcal:'1008',proteinG:'1003',fatG:'1004',carbsG:'1005'} as const;
  for(const record of candidate.records){
    const row=source.sourceRows.find(r=>r.id===record.id)!;
    expect(row.foodRow.description).toBe(record.description);
    expect(record.sourceArchiveSha256).toBe(source.archiveSha256);
    for(const [key,id] of Object.entries(keys))expect(record.per100[key as keyof typeof keys]).toBe(Number(row.nutrientRows.find(n=>n.nutrient_id===id)!.amount));
  }
});
it('keeps ambiguous mixed recipes unverified even with the larger catalog',()=>{
  const result=reconcileInventory({schemaVersion:1,mealName:'Unknown casserole',components:[{...food('unused',100),catalogId:null,estimatedPer100:{kcal:230,proteinG:8,carbsG:22,fatG:12}}],ambiguities:['Unknown recipe'],askAddedFat:false});
  expect(result.components[0]?.source.kind).toBe('unverified_vlm_estimate');
  expect(result.components[0]?.source.recordId).toBeNull();expect(result.requiresReview).toBe(true);
});
