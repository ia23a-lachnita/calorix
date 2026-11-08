import { expect, it } from 'vitest';
import { CATALOG } from '../src/tier1-catalog';
import { reconcileInventory, estimateA0 } from '../src/tier1-analysis';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const food=(id:string,massG:number)=>({name:'Food',massG,catalogId:id,preparation:'cooked',assumptions:[],estimatedPer100:null});
it('all frozen catalog nutrients and descriptions match attributed source rows',()=>{
  const source=JSON.parse(readFileSync(join(__dirname,'../eval/tier1-public/catalog-v2-provenance.json'),'utf8')) as {
    archiveSha256:string;sourceRows:Array<{id:string;foodRow:{description:string};nutrientRows:Array<{nutrient_id:string;amount:string}>}>;
  };
  expect(CATALOG).toHaveLength(73);expect(new Set(CATALOG.map(r=>r.id)).size).toBe(73);
  const keys={kcal:'1008',proteinG:'1003',fatG:'1004',carbsG:'1005'} as const;
  for(const record of CATALOG){
    const row=source.sourceRows.find(r=>r.id===record.id)!;
    expect(row.foodRow.description).toBe(record.description);
    expect(record.sourceArchiveSha256).toBe(source.archiveSha256);
    for(const [key,id] of Object.entries(keys))expect(record.per100[key as keyof typeof keys]).toBe(Number(row.nutrientRows.find(n=>n.nutrient_id===id)!.amount));
  }
});
it('uses expanded official cooked pasta and lentil densities for A1 and A0',()=>{
  const ids=['usda:169737','usda:172421'];
  const records=ids.map(id=>CATALOG.find(r=>r.id===id));
  expect(records.every(Boolean)).toBe(true);
  const result=reconcileInventory({schemaVersion:1,mealName:'Pasta and lentils',components:ids.map(id=>food(id,100)),ambiguities:[],askAddedFat:false});
  expect(result.components.every(c=>c.source.kind==='database_match')).toBe(true);
  expect(result.totals.kcal).toBe(274); // USDA cooked pasta158 + cooked lentils116 per100g.
  expect(estimateA0(ids).totals.kcal).toBe(490); // Frozen200g pasta and150g lentil serving priors.
});
it('keeps ambiguous mixed recipes unverified even with the larger catalog',()=>{
  const result=reconcileInventory({schemaVersion:1,mealName:'Unknown casserole',components:[{...food('unused',100),catalogId:null,estimatedPer100:{kcal:230,proteinG:8,carbsG:22,fatG:12}}],ambiguities:['Unknown recipe'],askAddedFat:false});
  expect(result.components[0]?.source.kind).toBe('unverified_vlm_estimate');
  expect(result.components[0]?.source.recordId).toBeNull();expect(result.requiresReview).toBe(true);
});
