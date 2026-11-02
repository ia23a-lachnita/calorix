/** Genuine native data/ownership/authority; trusted admission ports and raw SDK/public media alone are fake. */
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';
import * as bootstrap from '../../../src/nutrition-eval/calibration-v2-bootstrap';
import * as assets from '../../../src/nutrition-eval/assets';
import type { NutritionEvalCase } from '../../../src/nutrition-eval/schema';
import type { StageName } from '../../../src/nutrition-eval/calibration';
import { nativeV2RuntimeFixture } from './calibration-v2-native-runtime-fixtures';

const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const nativeReadDeps = bootstrap.createCalibrationV2BootstrapReadDeps;
export interface CliSdkHooks {
  options: unknown[];
  generate?: ((request: unknown) => Promise<unknown>) | undefined;
  count?: ((request: unknown) => Promise<unknown>) | undefined;
}
export interface CliFixtureOptions { readonly failVisionAt?: number; readonly failToken?: boolean; readonly failDevelopmentGate?: boolean; readonly publicCacheMiss?: boolean }
function wire(c: NutritionEvalCase, fail: boolean): string {
  const t = c.truth, nutrients = { kcal: t.kcal * (fail ? 10 : 1), proteinG: t.proteinG, carbsG: t.carbsG, fatG: t.fatG };
  return JSON.stringify({ name: 'fixture scan', confidence: 0.99, candidates: [], boundingBox: null, barcode: null,
    ...nutrients, nutritionBasis: t.basis, nutritionAmount: t.amount, nutritionUnit: t.unit,
    detectedItems: c.scanMode === 'meal' && t.referenceMassG !== undefined ? [{ name: 'fixture scan', weight: t.referenceMassG }] : [],
    ...(t.basis === 'package' ? { observedPackageAmount: t.amount, observedPackageUnit: t.unit, packageReference: { ...nutrients, amount: t.amount, unit: t.unit } } : {}) });
}
export async function v2NativeCliFixture(roots: string[], setPin: (sha: string) => void, hooks: CliSdkHooks, options: CliFixtureOptions = {}) {
  const f = await nativeV2RuntimeFixture(roots, setPin);
  const paths = ['3017624010701', '5449000000996', '4056489686941', '7622210449283'].map(code => `functions/eval/nutrition/off-snapshots/${code}.json`);
  for (const path of paths) { const target = resolve(f.mini.root, path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, readFileSync(resolve(repo, path))); }
  execFileSync('git', ['add', '--', ...paths], { cwd: f.mini.root }); execFileSync('git', ['commit', '--quiet', '-m', 'Add fixture product snapshots'], { cwd: f.mini.root });
  const context = await f.admit();
  const imageRoot = join(f.mini.root, '.nutrition-eval/corpus-quality-v2/images'); mkdirSync(imageRoot, { recursive: true });
  for (const [hash, bytes] of f.data.fixture.input.images) writeFileSync(join(imageRoot, hash + '.bin'), bytes);
  const training = (JSON.parse(context.files['calibration-manifest']) as { cases: NutritionEvalCase[] }).cases;
  const publicCases = (JSON.parse(context.files['public-manifest']) as { cases: NutritionEvalCase[] }).cases;
  const cases = new Map([...training, ...publicCases].map(c => [c.id, c])); const trainingIds = new Set(training.map(c => c.id));
  const reads = vi.spyOn(bootstrap, 'createCalibrationV2BootstrapReadDeps').mockImplementation(root => ({
    ...nativeReadDeps(root ?? f.mini.root), readAdmissionInputs: f.data.deps.readAdmissionInputs,
  }));
  f.data.deps.readAdmissionInputs.mockClear();
  const publicLoads = vi.spyOn(assets, 'loadVerifiedCaseImage').mockImplementation(async (row, opts) => {
    if (trainingIds.has(row.id) || row.scanMode === 'barcode' || opts.fetchFn !== undefined) throw new Error('fixture requires qualified training files and cache-only public images');
    if (options.publicCacheMiss) throw new Error('fixture public cache miss');
    return Buffer.from(JSON.stringify({ caseId: row.id }));
  });
  let stage: StageName | undefined;
  const witness = { vision: 0, token: 0, transport: 0, visionByStage: { preflight: 0, development: 0, validation: 0, benchmark: 0 }, models: [] as string[], levels: [] as unknown[] };
  function imageCase(contents: unknown): NutritionEvalCase {
    for (const row of contents as Array<{ parts?: Array<{ inlineData?: { data: string } }> }>) for (const part of row.parts ?? []) if (part.inlineData) {
      const bytes = Buffer.from(part.inlineData.data, 'base64');
      const id = bytes[0] === 123 ? (JSON.parse(bytes.toString('utf8')) as { caseId: string }).caseId : 'calibration-' + bytes.subarray(24).toString('utf8');
      const c = cases.get(id); if (c && c.scanMode !== 'barcode') return c;
    }
    throw new Error('fixture malformed image request');
  }
  hooks.generate = async raw => {
    const request = raw as { model: string; contents: unknown; config?: { thinkingConfig?: { thinkingLevel?: unknown } } };
    witness.vision++; witness.transport++; witness.models.push(request.model); witness.levels.push(request.config?.thinkingConfig?.thinkingLevel);
    if (stage === undefined || request.model !== 'gemini-3.8-flash') throw new Error('fixture invalid model/stage');
    witness.visionByStage[stage]++; const c = imageCase(request.contents);
    if (options.failVisionAt === witness.vision) throw new Error('fixture lost model response');
    return { text: wire(c, options.failDevelopmentGate === true && stage === 'development'), modelVersion: 'gemini-3.8-flash' };
  };
  hooks.count = async raw => {
    witness.token++; const request = raw as { model: string; contents: unknown };
    if (stage !== 'preflight' || request.model !== 'gemini-3.8-flash' || imageCase(request.contents).id !== context.firstDevelopmentCaseId) throw new Error('fixture invalid token request');
    if (options.failToken) throw new Error('fixture lost token response'); return { totalTokens: 1 };
  };
  return { ...f, context, training, publicCases, cases, imageRoot, witness, reads, publicLoads,
    env: { RUN_NUTRITION_CALIBRATION_LIVE: '1' }, begin(next: StageName) { stage = next; },
    serializedAdmission() {
      const input = f.data.fixture.input; const encode = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
      return { ...input, activationLockBytes: encode(input.activationLockBytes), candidateBytes: encode(input.candidateBytes), corpusLockBytes: encode(input.corpusLockBytes),
        bundle: Object.fromEntries(Object.entries(input.bundle).map(([k, v]) => [k, encode(v)])), images: [...input.images].map(([k, v]) => [k, encode(v)]), priorEvidence: [...input.priorEvidence].map(([k, v]) => [k, encode(v)]) };
    } };
}
