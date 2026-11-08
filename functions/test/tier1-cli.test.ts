import { expect, it } from 'vitest';
import { createPilotPredictions } from '../src/tier1-cli';
import { reconcileInventory } from '../src/tier1-analysis';
const rice={name:'Rice',massG:100,catalogId:'usda:168878',preparation:'cooked',assumptions:[],estimatedPer100:null};
const make=(component=rice)=>reconcileInventory({schemaVersion:1,mealName:'Meal',components:[component],ambiguities:[],askAddedFat:true});
it('pairs A0/A1 with identical nutrient/preparation context and recorded question answer', () => {
  const report=createPilotPredictions(make(),'m1','oil_10g');
  expect(report.predictions[0]?.served_kcal).toBeCloseTo(348.4);
  expect(report.predictions[1]?.served_kcal).toBeCloseTo(218.4);
  expect(report.predictions[0]?.preparation_context_id).toBe(report.predictions[1]?.preparation_context_id);
  expect(report.predictions[1]?.consumed_kcal).toBeNull();
  expect(report.predictions[1]?.cost_usd).toBeNull();
});
it('records A0 coverage failure without dropping successful unverified A1 foods', () => {
  const unknown={...rice,catalogId:null,estimatedPer100:{kcal:200,proteinG:4,carbsG:10,fatG:16}};
  const report=createPilotPredictions(make(unknown as unknown as typeof rice),'m2');
  expect(report.predictions.map(p=>p.status)).toEqual(['failed','ok']);
  expect(report.predictions[1]?.served_kcal).toBe(200);
});

it('applies an answer to the saved inference without requiring a new image', async () => {
  const {applyPilotAnswer}=await import('../src/tier1-cli');
  const saved=createPilotPredictions(make(),'saved-meal');
  const answered=applyPilotAnswer(JSON.parse(JSON.stringify(saved)),'oil_10g');
  expect(answered.predictions[1]?.served_kcal).toBeCloseTo(218.4);
  expect(answered.predictions[0]?.served_kcal).toBeCloseTo(348.4);
  expect(() => applyPilotAnswer(answered,'oil_10g')).toThrow();
});
it('an inapplicable pre-supplied answer never discards successful inference', () => {
  const noQuestion=reconcileInventory({schemaVersion:1,mealName:'Rice',components:[rice],ambiguities:[],askAddedFat:false});
  const result=createPilotPredictions(noQuestion,'no-question','oil_10g');
  expect(result.predictions[1]?.status).toBe('ok');
  expect(result.predictions[1]?.served_kcal).toBe(130);
});
