import { describe, expect, it } from 'vitest';
import { reconcileInventory, answerPreparation, estimateA0, parseInventory } from '../src/tier1-analysis';

const rice = {name:'Rice',massG:200,catalogId:'usda:168878',preparation:'cooked',assumptions:[],estimatedPer100:null};
const inventory = (extra = {}) => ({schemaVersion:1,mealName:'Rice bowl',components:[rice],ambiguities:[],askAddedFat:false,...extra});

describe('Tier1 nutrient reconciliation', () => {
  it('computes served nutrients from actual cooked record, never model arithmetic', () => {
    const result = reconcileInventory(inventory({components:[{...rice,estimatedPer100:{kcal:999,proteinG:0,carbsG:0,fatG:0}}]}));
    expect(result.totals).toEqual({kcal:260,proteinG:5.38,carbsG:56.34,fatG:0.56});
    expect(result.components[0]?.source.recordId).toBe('usda:168878');
    expect(result.components[0]?.source.kind).toBe('database_match');
    expect(result.question).toBeNull();
  });
  it('retains unmatched foods as explicitly unverified estimates', () => {
    const result = reconcileInventory(inventory({components:[rice,{...rice,name:'Unknown curry',catalogId:null,massG:100,estimatedPer100:{kcal:200,proteinG:4,carbsG:10,fatG:16}}]}));
    expect(result.totals.kcal).toBe(460);
    expect(result.components[1]?.source.kind).toBe('unverified_vlm_estimate');
    expect(result.components[1]?.source.recordId).toBeNull();
    expect(result.requiresReview).toBe(true);
  });
  it('rejects invented catalog records and unresolved components instead of dropping them', () => {
    expect(() => reconcileInventory(inventory({components:[{...rice,catalogId:'usda:invented'}]}))).toThrow();
    expect(() => reconcileInventory(inventory({components:[{...rice,catalogId:null}]}))).toThrow();
  });
  it.each([0,-1,Infinity,NaN,100001])('rejects invalid grams %s', massG => {
    expect(() => parseInventory(inventory({components:[{...rice,massG}]}))).toThrow();
  });
  it('rejects no food, too many foods and schema drift', () => {
    expect(() => parseInventory(inventory({components:[]}))).toThrow();
    expect(() => parseInventory(inventory({components:Array(21).fill(rice)}))).toThrow();
    expect(() => parseInventory(inventory({schemaVersion:2}))).toThrow();
  });
  it('asks at most once and adds only confirmed extra oil exactly once', () => {
    const first = reconcileInventory(inventory({askAddedFat:true}));
    expect(first.question?.answered).toBe(false);
    const answered = answerPreparation(first,'oil_10g');
    expect(answered.totals.kcal).toBeCloseTo(348.4);
    expect(answered.totals.fatG).toBeCloseTo(10.56);
    expect(answered.question?.answer).toBe('oil_10g');
    expect(() => answerPreparation(answered,'oil_5g')).toThrow();
    expect(() => answerPreparation(reconcileInventory(inventory()),'none')).toThrow();
    expect(first.totals.kcal).toBe(260);
  });
  it('A0 uses frozen priors and the same nutrient records, failing uncovered foods', () => {
    const baseline=estimateA0(['usda:168878']);
    expect(baseline.totals.kcal).toBe(260);
    expect(baseline.provenance.model).toBe('A0-serving-prior-v1');
    expect(() => estimateA0(['uncovered'])).toThrow();
    expect(() => estimateA0([])).toThrow();
  });
});
