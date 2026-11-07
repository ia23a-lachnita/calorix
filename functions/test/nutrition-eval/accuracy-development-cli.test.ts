import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NutritionEvalCase } from '../../src/nutrition-eval/schema';

const mocks = vi.hoisted(() => ({ client: vi.fn(), asset: vi.fn() }));
vi.mock('../../src/genai-adapter', async (original) => ({
  ...await original<typeof import('../../src/genai-adapter')>(),
  createCalibrationGenAIClient: mocks.client,
}));
vi.mock('../../src/nutrition-eval/assets', async (original) => ({
  ...await original<typeof import('../../src/nutrition-eval/assets')>(),
  loadVerifiedCaseImage: mocks.asset,
}));
import { runNativeAccuracyDevelopment } from '../../src/nutrition-eval/accuracy-development-cli';

const manifestPath = resolve(__dirname, '../../eval/nutrition/accuracy-development-manifest-v1.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { cases: NutritionEvalCase[] };
const finalText = JSON.stringify({ name: 'Synthetic meal', kcal: 100, proteinG: 10, carbsG: 10,
  fatG: 2, confidence: 0.9, candidates: [], barcode: null,
  detectedItems: [{ name: 'Synthetic food', weight: 100 }], boundingBox: null,
  nutritionBasis: 'portion', nutritionAmount: 1, nutritionUnit: 'portion' });
const sha = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
let root: string;
let runRoot: string;
let sdkCalls: number;
let blockPublication: boolean;
const invoke = (env: NodeJS.ProcessEnv = { RUN_NUTRITION_ACCURACY_DEV: '1' }) => runNativeAccuracyDevelopment(root, env);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'accuracy-native-'));
  runRoot = join(root, '.nutrition-eval/accuracy-development/meal-prompt-v1');
  const target = join(root, 'functions/eval/nutrition'); mkdirSync(target, { recursive: true });
  copyFileSync(manifestPath, join(target, 'accuracy-development-manifest-v1.json'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'fixture@example.invalid'], { cwd: root });
  execFileSync('git', ['add', 'functions'], { cwd: root });
  execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'Create fixture'], { cwd: root });
  sdkCalls = 0; blockPublication = false;
  mocks.asset.mockReset(); mocks.client.mockReset();
  // Positive filesystem tests replace ONLY image verification and the SDK.
  // Actual source images/hash verification are checked by the separate host preflight.
  mocks.asset.mockImplementation(async (c: NutritionEvalCase) => new Uint8Array([manifest.cases.findIndex(row => row.id === c.id)]));
  mocks.client.mockImplementation(() => {
    expect(mocks.asset).toHaveBeenCalledTimes(24);
    expect(existsSync(join(runRoot, 'run.json'))).toBe(true);
    if (blockPublication) mkdirSync(join(runRoot, 'diagnostics.json'));
    return { models: { generateContent: async () => {
      const events = readFileSync(join(runRoot, 'events.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line) as { type: string });
      expect(events.at(-1)?.type).toBe('reserved');
      expect(events.filter(e => e.type === 'reserved')).toHaveLength(sdkCalls + 1);
      sdkCalls++;
      return { text: finalText, modelVersion: 'gemini-3.8-flash' };
    } } };
  });
});
afterEach(() => {
  expect(root.startsWith(join(tmpdir(), 'accuracy-native-'))).toBe(true);
  rmSync(root, { recursive: true, force: true });
});

describe('native accuracy development containment', () => {
  it('has no client or filesystem side effect merely from importing', () => {
    expect(mocks.client).not.toHaveBeenCalled(); expect(existsSync(runRoot)).toBe(false);
  });
  it('refuses missing live opt-in before assets/client/run root', async () => {
    await expect(invoke({})).resolves.toMatchObject({ status: 'failed' });
    expect(mocks.asset).not.toHaveBeenCalled(); expect(mocks.client).not.toHaveBeenCalled();
    expect(existsSync(runRoot)).toBe(false);
  });
  it('refuses dirty Functions source before constructing a client', async () => {
    writeFileSync(join(root, 'functions/uncommitted.txt'), 'dirty');
    await expect(invoke()).resolves.toMatchObject({ status: 'failed' });
    expect(mocks.client).not.toHaveBeenCalled(); expect(existsSync(runRoot)).toBe(false);
  });
  it('refuses a changed committed manifest before constructing a client', async () => {
    writeFileSync(join(root, 'functions/eval/nutrition/accuracy-development-manifest-v1.json'), '{}');
    execFileSync('git', ['add', 'functions'], { cwd: root });
    execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'Change fixture'], { cwd: root });
    await expect(invoke()).resolves.toMatchObject({ status: 'failed' });
    expect(mocks.client).not.toHaveBeenCalled(); expect(existsSync(runRoot)).toBe(false);
  });
  it('uses the real offline verifier to reject missing cached images before client/run root', async () => {
    const real = await vi.importActual<typeof import('../../src/nutrition-eval/assets')>('../../src/nutrition-eval/assets');
    mocks.asset.mockImplementation(real.loadVerifiedCaseImage);
    await expect(invoke()).resolves.toMatchObject({ status: 'failed' });
    expect(mocks.client).not.toHaveBeenCalled(); expect(existsSync(runRoot)).toBe(false);
  });
  it.each(['partial', 'complete'])('refuses an existing %s run without modifying it', async (kind) => {
    mkdirSync(runRoot, { recursive: true });
    const sentinel = join(runRoot, kind === 'complete' ? 'complete.json' : 'run.json');
    writeFileSync(sentinel, 'preserve exactly'); const before = sha(sentinel);
    await expect(invoke()).resolves.toMatchObject({ status: 'failed' });
    expect(mocks.client).not.toHaveBeenCalled(); expect(sdkCalls).toBe(0); expect(sha(sentinel)).toBe(before);
  });
  it('durably records all24 attempts and publishes digest-bound completion without legacy calibration metadata', async () => {
    await expect(invoke()).resolves.toMatchObject({ status: 'completed' });
    expect(sdkCalls).toBe(24); expect(mocks.client).toHaveBeenCalledTimes(1);
    const events = readFileSync(join(runRoot, 'events.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line) as { type: string });
    expect(events.filter(e => e.type === 'reserved')).toHaveLength(24);
    expect(events.filter(e => e.type === 'outcome')).toHaveLength(24);
    const report = JSON.parse(readFileSync(join(runRoot, 'report.json'), 'utf8'));
    expect(report.cases).toHaveLength(24); expect(report.calibration).toBeUndefined();
    const complete = JSON.parse(readFileSync(join(runRoot, 'complete.json'), 'utf8'));
    expect(complete).toMatchObject({ imageCalls: 24, tokenCountCalls: 0,
      reportSha256: sha(join(runRoot, 'report.json')), markdownSha256: sha(join(runRoot, 'report.md')),
      diagnosticsSha256: sha(join(runRoot, 'diagnostics.json')) });
    const before = sha(join(runRoot, 'events.jsonl'));
    await expect(invoke()).resolves.toMatchObject({ status: 'failed' });
    expect(sdkCalls).toBe(24); expect(sha(join(runRoot, 'events.jsonl'))).toBe(before);
  });
  it('does not publish completion after a real filesystem publication failure', async () => {
    blockPublication = true;
    await expect(invoke()).resolves.toMatchObject({ status: 'failed' });
    expect(sdkCalls).toBe(24); expect(existsSync(join(runRoot, 'complete.json'))).toBe(false);
  });
});
