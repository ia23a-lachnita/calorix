import { ThinkingLevel } from '@google/genai';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import type { GenAIClient } from '../../src/genai-adapter';
import { visionResponseJsonSchema } from '../../src/nutrition-json-schema';
import { ACCURACY_MEAL_PROMPT_V1 } from '../../src/nutrition-eval/accuracy-development';
import { parseNutritionEvalManifest } from '../../src/nutrition-eval/schema';
import {
  runTwoPassAccuracyDevelopment, INVENTORY_PROMPT_V1, INVENTORY_RESPONSE_SCHEMA,
  TWO_PASS_NUTRITION_SUFFIX_V1, TWO_PASS_PROMPT_SHA256,
  type TwoPassAccuracyDeps, type AccuracyStage, type AccuracyStageRecord,
} from '../../src/nutrition-eval/accuracy-two-pass';

const cases = parseNutritionEvalManifest(JSON.parse(readFileSync(join(__dirname,
  '../../eval/nutrition/accuracy-development-manifest-v1.json'), 'utf8'))).cases;
const identity = { runId: 'two-pass-test', timestamp: '2026-11-07T00:00:00Z',
  codeSha: 'a'.repeat(40), datasetHash: 'b'.repeat(64) };
const inventory = JSON.stringify({ components: [{ name: 'Visible food', preparation: 'cooked',
  visualEvidence: 'rough surface', estimatedMassG: 100, alternatives: [] }],
scaleEvidence: 'Scale uncertain', uncertainties: [] });
const nutrition = JSON.stringify({ name: 'Synthetic meal', kcal: 100, proteinG: 10, carbsG: 10,
  fatG: 2, confidence: 0.9, candidates: [], barcode: null,
  detectedItems: [{ name: 'Visible food', weight: 100 }], boundingBox: null,
  nutritionBasis: 'portion', nutritionAmount: 1, nutritionUnit: 'portion' });
type Request = Parameters<GenAIClient['models']['generateContent']>[0];
type Response = Awaited<ReturnType<GenAIClient['models']['generateContent']>>;
function fixture(rule?: (stage: AccuracyStage, index: number, request: Request) => Response | undefined) {
  const requests: Request[] = []; const events: string[] = []; const stages: AccuracyStageRecord[] = [];
  let clock = 0; let clients = 0;
  const deps: TwoPassAccuracyDeps = {
    loadImage: async c => new Uint8Array([cases.findIndex(row => row.id === c.id)]),
    createClient: () => { clients++; return { models: { generateContent: async request => {
      requests.push(request);
      const stage: AccuracyStage = request.config?.responseJsonSchema === INVENTORY_RESPONSE_SCHEMA ? 'inventory' : 'nutrition';
      const image = request.contents[0]!.parts.find(p => p.inlineData)?.inlineData;
      const index = Buffer.from(image!.data, 'base64')[0]!;
      expect(events.at(-1)).toBe(`reserve:${index}:${stage}`);
      events.push(`sdk:${index}:${stage}`);
      return rule?.(stage, index, request) ?? { text: stage === 'inventory' ? inventory : nutrition,
        modelVersion: 'gemini-3.8-flash' };
    } } }; },
    reserveStage: async (id, stage) => { events.push(`reserve:${cases.findIndex(c => c.id === id)}:${stage}`); },
    persistStage: async record => { stages.push(record); events.push(`stage:${record.caseId}:${record.stage}`); },
    persistOutcome: async outcome => { events.push(`dish:${outcome.caseId}`); },
    nowMs: () => ++clock,
  };
  return { deps, requests, events, stages, clients: () => clients, run: () => runTwoPassAccuracyDevelopment(cases, deps, identity) };
}
describe('independent component inventory before nutrition', () => {
  it('uses two real SDK seams per dish, independent inventory and image-conditioned nutrition, with composite identity', async () => {
    const f = fixture(); const result = await f.run();
    expect(result).toMatchObject({ sdkVisionCalls: 48, inventoryCalls: 24, nutritionCalls: 24, logicalAnalysisCalls: 24 });
    expect(result.report.summary.parseCases).toBe(24); expect(result.report.cases).toHaveLength(24);
    expect(result.stages).toHaveLength(48); expect(result.diagnostics).toHaveLength(24);
    expect(f.clients()).toBe(1); expect(f.events.filter(s => s.startsWith('dish:'))).toHaveLength(24);
    for (let i = 0; i < 24; i++) {
      const first = f.requests[2 * i]!; const second = f.requests[2 * i + 1]!;
      for (const r of [first, second]) {
        expect(r.model).toBe('gemini-3.8-flash');
        expect(r.config).toMatchObject({ thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM }, httpOptions: { timeout: 30000 } });
        expect(r.config).not.toHaveProperty('temperature');
      }
      expect(first.contents[0]!.parts[0]).toEqual({ text: INVENTORY_PROMPT_V1 });
      expect(JSON.stringify(first)).not.toContain(cases[i]!.id);
      expect(JSON.stringify(first)).not.toContain(String(cases[i]!.truth.kcal));
      expect(second.contents[0]!.parts[1]).toEqual(first.contents[0]!.parts[1]);
      expect(second.config?.responseJsonSchema).toEqual(visionResponseJsonSchema('meal'));
      const text = second.contents[0]!.parts[0]!.text!;
      expect(text).toContain(ACCURACY_MEAL_PROMPT_V1); expect(text).toContain(TWO_PASS_NUTRITION_SUFFIX_V1);
      expect(text).toContain('Visible food'); expect(text).toContain('rough surface');
    }
    expect(INVENTORY_PROMPT_V1.length).toBeGreaterThan(100);
    expect(TWO_PASS_NUTRITION_SUFFIX_V1).toMatch(/tentative|untrusted/i);
    expect(TWO_PASS_PROMPT_SHA256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.report.promptHash).toBe(TWO_PASS_PROMPT_SHA256);
  });
  it.each(['invalid_json', 'empty', 'provider', 'extra_field', 'invalid_mass', 'oversized'])('retains a failed %s inventory in all24 and skips its nutrient call', async kind => {
    const f = fixture((stage, index) => {
      if (stage !== 'inventory' || index !== 0) return;
      if (kind === 'provider') throw { status: 429, message: 'secret-test-string' };
      let text = inventory;
      if (kind === 'invalid_json') text = '{bad';
      if (kind === 'empty') return { text: '' };
      if (kind === 'extra_field') text = JSON.stringify({ ...JSON.parse(inventory), truth: 999 });
      if (kind === 'invalid_mass') { const value = JSON.parse(inventory); value.components[0].estimatedMassG = 0; text = JSON.stringify(value); }
      if (kind === 'oversized') text = 'x'.repeat(16 * 1024 + 1);
      return { text, modelVersion: 'gemini-3.8-flash' };
    });
    const r = await f.run();
    expect(r).toMatchObject({ sdkVisionCalls: 47, inventoryCalls: 24, nutritionCalls: 23, logicalAnalysisCalls: 24 });
    expect(r.report.summary.parseCases).toBe(23); expect(r.report.cases[0]!.prediction.parseStatus).toBe('failure');
    expect(r.stages[0]).toMatchObject({ caseId: cases[0]!.id, stage: 'inventory', status: 'failure' });
    expect(JSON.stringify(r)).not.toContain('secret-test-string');
    if (kind === 'oversized') expect(r.stages[0]).toMatchObject({ oversized: true,
      finalTextBytes: 16 * 1024 + 1, finalTextSha256: createHash('sha256').update('x'.repeat(16 * 1024 + 1)).digest('hex') });
    if (kind === 'oversized') expect(r.stages[0]).not.toHaveProperty('finalText');
  });
  it('keeps failed nutrition calls spent with no retry and exact24population', async () => {
    const f = fixture((s, i) => { if (s === 'nutrition' && i === 0) throw { status: 503 }; });
    const r = await f.run(); expect(r.sdkVisionCalls).toBe(48); expect(r.report.summary.parseCases).toBe(23);
    expect(r.stages[1]).toMatchObject({ status: 'failure', stage: 'nutrition', safeErrorCategory: 'http_5xx' });
  });
  it.each(['missing_inventory', 'foreign_inventory', 'foreign_empty', 'foreign_nutrition'])('halts on %s metadata without another SDK dispatch', async kind => {
    const f = fixture((stage, i) => {
      if (i !== 0) return;
      if (stage === 'inventory' && kind !== 'foreign_nutrition') return {
        text: kind === 'foreign_empty' ? '' : inventory,
        ...(kind === 'missing_inventory' ? {} : { modelVersion: 'foreign-model' }),
      };
      if (stage === 'nutrition') return { text: nutrition, modelVersion: 'foreign-model' };
      return;
    });
    await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(kind === 'foreign_nutrition' ? 2 : 1);
    expect(f.events.filter(s => s.startsWith('dish:'))).toHaveLength(0);
  });
  it.each(['reserve_inventory', 'reserve_nutrition', 'persist_stage', 'persist_dish'])('halts on %s persistence errors even when delegated adapter catches errors', async kind => {
    const f = fixture(); const reserve = f.deps.reserveStage;
    if (kind.startsWith('reserve_')) f.deps.reserveStage = async (id, stage) => {
      if (kind === 'reserve_' + stage) throw new Error('private-persistence-message'); await reserve(id, stage);
    };
    if (kind === 'persist_stage') f.deps.persistStage = async () => { throw new Error('private-persistence-message'); };
    if (kind === 'persist_dish') f.deps.persistOutcome = async () => { throw new Error('private-persistence-message'); };
    await expect(f.run()).rejects.toThrow();
    expect(f.requests).toHaveLength(kind === 'reserve_inventory' ? 0 : kind === 'persist_dish' ? 2 : 1);
  });
  it('validates all images and identity before creating the underlying client', async () => {
    const f = fixture(); f.deps.loadImage = async () => new Uint8Array();
    await expect(f.run()).rejects.toThrow(); expect(f.clients()).toBe(0); expect(f.requests).toHaveLength(0);
  });
});
