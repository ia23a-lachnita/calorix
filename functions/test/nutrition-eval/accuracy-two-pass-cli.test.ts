import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ client: vi.fn(), asset: vi.fn() }));
vi.mock('../../src/genai-adapter', async original => ({
  ...await original<typeof import('../../src/genai-adapter')>(), createCalibrationGenAIClient: mocks.client,
}));
vi.mock('../../src/nutrition-eval/assets', async original => ({
  ...await original<typeof import('../../src/nutrition-eval/assets')>(), loadVerifiedCaseImage: mocks.asset,
}));
import { runNativeTwoPassAccuracyDevelopment } from '../../src/nutrition-eval/accuracy-two-pass-cli';
import { INVENTORY_RESPONSE_SCHEMA } from '../../src/nutrition-eval/accuracy-two-pass';
import type { GenAIClient } from '../../src/genai-adapter';
import type { NutritionEvalCase } from '../../src/nutrition-eval/schema';
const manifestPath = resolve(__dirname, '../../eval/nutrition/accuracy-development-manifest-v1.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { cases: NutritionEvalCase[] };
const inventory = JSON.stringify({ components: [{ name: 'Visible food', preparation: 'cooked',
  visualEvidence: 'surface texture', estimatedMassG: 100, alternatives: [] }], scaleEvidence: 'uncertain', uncertainties: [] });
const nutrition = JSON.stringify({ name: 'Meal', kcal: 100, proteinG: 10, carbsG: 10, fatG: 2,
  confidence: 0.9, candidates: [], barcode: null, detectedItems: [{ name: 'Visible food', weight: 100 }],
  boundingBox: null, nutritionBasis: 'portion', nutritionAmount: 1, nutritionUnit: 'portion' });
const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
let root: string; let runRoot: string; let sdkCalls: number; let invalidInventory: boolean; let blockPublication: boolean;
const invoke = (env: NodeJS.ProcessEnv = { RUN_NUTRITION_TWO_PASS_DEV: '1' }) => runNativeTwoPassAccuracyDevelopment(root, env);
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'two-pass-native-')); runRoot = join(root, '.nutrition-eval/accuracy-development/two-pass-v1');
  mkdirSync(join(root, 'functions/eval/nutrition'), { recursive: true });
  copyFileSync(manifestPath, join(root, 'functions/eval/nutrition/accuracy-development-manifest-v1.json'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'fixture@example.invalid'], { cwd: root });
  execFileSync('git', ['add', 'functions'], { cwd: root });
  execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'Create fixture'], { cwd: root });
  sdkCalls = 0; invalidInventory = false; blockPublication = false; mocks.client.mockReset(); mocks.asset.mockReset();
  mocks.asset.mockImplementation(async (c: NutritionEvalCase) => new Uint8Array([manifest.cases.findIndex(x => x.id === c.id)]));
  mocks.client.mockImplementation(() => {
    expect(mocks.asset).toHaveBeenCalledTimes(24); expect(existsSync(join(runRoot, 'run.json'))).toBe(true);
    if (blockPublication) mkdirSync(join(runRoot, 'diagnostics.json'));
    return { models: { generateContent: async (request: Parameters<GenAIClient['models']['generateContent']>[0]) => {
      const events = readFileSync(join(runRoot, 'events.jsonl'), 'utf8').trim().split('\n').map(s => JSON.parse(s));
      const stage = request.config?.responseJsonSchema === INVENTORY_RESPONSE_SCHEMA ? 'inventory' : 'nutrition';
      expect(events.at(-1)).toMatchObject({ type: 'stage-reserved', stage });
      expect(events.filter(e => e.type === 'stage-reserved')).toHaveLength(sdkCalls + 1);
      sdkCalls++;
      return { text: invalidInventory && sdkCalls === 1 ? '{bad' : stage === 'inventory' ? inventory : nutrition,
        modelVersion: 'gemini-3.8-flash' };
    } } };
  });
});
afterEach(() => { expect(root.startsWith(join(tmpdir(), 'two-pass-native-'))).toBe(true); rmSync(root, { recursive: true, force: true }); });
describe('once-only two-pass native entrypoint', () => {
  it('imports without client or run artifacts', () => { expect(mocks.client).not.toHaveBeenCalled(); expect(existsSync(runRoot)).toBe(false); });
  it('refuses missing opt-in before assets/client', async () => {
    await expect(invoke({})).resolves.toMatchObject({ status: 'failed' }); expect(mocks.asset).not.toHaveBeenCalled(); expect(mocks.client).not.toHaveBeenCalled();
  });
  it('refuses dirty source before client', async () => {
    writeFileSync(join(root, 'functions/dirty'), 'dirty'); await expect(invoke()).resolves.toMatchObject({ status: 'failed' }); expect(mocks.client).not.toHaveBeenCalled();
  });
  it('refuses changed committed manifest', async () => {
    writeFileSync(join(root, 'functions/eval/nutrition/accuracy-development-manifest-v1.json'), '{}');
    execFileSync('git', ['add', 'functions'], { cwd: root });
    execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'Change fixture'], { cwd: root });
    await expect(invoke()).resolves.toMatchObject({ status: 'failed' }); expect(mocks.client).not.toHaveBeenCalled();
  });
  it('uses real offline verification to reject missing cache before SDK', async () => {
    const real = await vi.importActual<typeof import('../../src/nutrition-eval/assets')>('../../src/nutrition-eval/assets');
    mocks.asset.mockImplementation(real.loadVerifiedCaseImage); await expect(invoke()).resolves.toMatchObject({ status: 'failed' }); expect(mocks.client).not.toHaveBeenCalled();
  });
  it.each(['partial', 'complete'])('preserves existing %s root without dispatch', async kind => {
    mkdirSync(runRoot, { recursive: true }); const marker = join(runRoot, kind + '.json'); writeFileSync(marker, 'preserve'); const before = sha(marker);
    await expect(invoke()).resolves.toMatchObject({ status: 'failed' }); expect(sha(marker)).toBe(before); expect(sdkCalls).toBe(0);
  });
  it.each([false, true])('publishes all24 outcomes and exact actual counts, failed inventory=%s', async invalid => {
    invalidInventory = invalid; const actual = invalid ? 47 : 48;
    await expect(invoke()).resolves.toMatchObject({ status: 'completed', imageCalls: actual, tokenCountCalls: 0 });
    expect(sdkCalls).toBe(actual);
    const read = (name: string) => JSON.parse(readFileSync(join(runRoot, name), 'utf8'));
    const report = read('report.json'); expect(report.cases).toHaveLength(24); expect(report.calibration).toBeUndefined();
    expect(report.summary.parseCases).toBe(invalid ? 23 : 24);
    expect(read('diagnostics.json')).toMatchObject({ sdkVisionCalls: actual, inventoryCalls: 24, nutritionCalls: invalid ? 23 : 24, logicalAnalysisCalls: 24 });
    expect(read('complete.json')).toMatchObject({ imageCalls: actual, reportSha256: sha(join(runRoot, 'report.json')),
      markdownSha256: sha(join(runRoot, 'report.md')), diagnosticsSha256: sha(join(runRoot, 'diagnostics.json')), eventsSha256: sha(join(runRoot, 'events.jsonl')) });
    const before = sha(join(runRoot, 'events.jsonl')); await expect(invoke()).resolves.toMatchObject({ status: 'failed' }); expect(sdkCalls).toBe(actual); expect(sha(join(runRoot, 'events.jsonl'))).toBe(before);
  });
  it('never marks a partial report publication complete', async () => {
    blockPublication = true; await expect(invoke()).resolves.toMatchObject({ status: 'failed' }); expect(sdkCalls).toBe(48); expect(existsSync(join(runRoot, 'complete.json'))).toBe(false);
  });
});
