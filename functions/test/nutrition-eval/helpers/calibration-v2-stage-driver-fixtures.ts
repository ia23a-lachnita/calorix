/** Raw media / SDK ports alone are fake; native ownership, source, state and reports are real. */
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createGenAIAdapter, countCalibrationTokens, CALIBRATION_MODEL } from '../../../src/genai-adapter';
import type { GenAIClient, CalibrationCountTokensClient } from '../../../src/genai-adapter';
import { prepareCalibrationBootstrapContext } from '../../../src/nutrition-eval/calibration-bootstrap';
import type { CalibrationPreparedContext } from '../../../src/nutrition-eval/calibration-bootstrap';
import { prepareNativeCalibrationBenchmarkAuthorityLedger, prepareNativeCalibrationBenchmarkAuthorityLedgerV2 } from '../../../src/nutrition-eval/calibration-runtime-evidence-ledger';
import type { CalibrationRuntimeEvidenceLedger, StageName } from '../../../src/nutrition-eval/calibration';
import type { CalibrationStageDriverDeps } from '../../../src/nutrition-eval/calibration-stage-driver';
import { prepareCalibrationOffSnapshotStore } from '../../../src/nutrition-eval/calibration-off-snapshot-store';
import type { CalibrationOffSnapshotPath } from '../../../src/nutrition-eval/calibration-off-snapshot-store';
import type { NutritionEvalCase } from '../../../src/nutrition-eval/schema';
import { nativeMiniFixture, nativeV2RuntimeFixture } from './calibration-v2-native-runtime-fixtures';

const repo = fileURLToPath(new URL('../../../../', import.meta.url));
function snapshotAssets(root: string): void {
  const paths = ['3017624010701', '5449000000996', '4056489686941', '7622210449283']
    .map(code => `functions/eval/nutrition/off-snapshots/${code}.json`);
  for (const path of paths) { const target = resolve(root, path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, readFileSync(resolve(repo, path))); }
  execFileSync('git', ['add', '--', ...paths], { cwd: root });
  execFileSync('git', ['commit', '--quiet', '-m', 'Add fixture product snapshots'], { cwd: root });
}
function imageCase(contents: unknown): string {
  for (const row of contents as Array<{ parts?: Array<{ inlineData?: { data: string } }> }>) {
    for (const part of row.parts ?? []) if (part.inlineData) {
      const decoded = JSON.parse(Buffer.from(part.inlineData.data, 'base64').toString('utf8')) as { caseId: string };
      if (typeof decoded.caseId === 'string') return decoded.caseId;
    }
  }
  throw new Error('fixture missing case media');
}
function wire(c: NutritionEvalCase, factor: number): string {
  const t = c.truth, nutrients = { kcal: t.kcal * factor, proteinG: t.proteinG, carbsG: t.carbsG, fatG: t.fatG };
  return JSON.stringify({ name: 'fixture scan', confidence: 0.99, candidates: [], boundingBox: null, barcode: null,
    ...nutrients, nutritionBasis: t.basis, nutritionAmount: t.amount, nutritionUnit: t.unit,
    detectedItems: c.scanMode === 'meal' && t.referenceMassG !== undefined ? [{ name: 'fixture scan', weight: t.referenceMassG }] : [],
    ...(t.basis === 'package' ? { observedPackageAmount: t.amount, observedPackageUnit: t.unit,
      packageReference: { ...nutrients, amount: t.amount, unit: t.unit } } : {}) });
}
export interface V2DriverFixtureOptions { readonly failVisionAt?: number; readonly failDevelopmentGate?: boolean }
async function ports(context: CalibrationPreparedContext, ledger: Readonly<CalibrationRuntimeEvidenceLedger>, root: string, options: V2DriverFixtureOptions) {
  const training = JSON.parse(context.files['calibration-manifest']) as { cases: NutritionEvalCase[] };
  const publicManifest = JSON.parse(context.files['public-manifest']) as { cases: NutritionEvalCase[] };
  const cases = new Map([...training.cases, ...publicManifest.cases].map(c => [c.id, c]));
  const witness = { sdkVision: 0, sdkToken: 0, transportVision: 0, barcodeLookups: 0,
    visionByStage: { preflight: 0, development: 0, validation: 0, benchmark: 0 },
    imageCaseIds: [] as string[], modelIds: [] as string[], thinkingLevels: [] as unknown[] };
  let stage: StageName | undefined;
  const client: GenAIClient & CalibrationCountTokensClient = { models: {
    generateContent: async request => {
      witness.sdkVision++; witness.transportVision++; witness.modelIds.push(request.model);
      witness.thinkingLevels.push(request.config?.thinkingConfig?.thinkingLevel);
      if (stage === undefined) throw new Error('fixture requires stage');
      witness.visionByStage[stage]++;
      if (request.model !== CALIBRATION_MODEL) throw new Error('fixture wrong model');
      const c = cases.get(imageCase(request.contents)); if (!c || c.scanMode === 'barcode') throw new Error('fixture wrong image case');
      if (options.failVisionAt === witness.sdkVision) throw new Error('fixture transport lost response');
      return { text: wire(c, options.failDevelopmentGate && stage === 'development' ? 10 : 1), modelVersion: CALIBRATION_MODEL };
    },
    countTokens: async request => {
      witness.sdkToken++;
      if (stage !== 'preflight' || request.model !== CALIBRATION_MODEL || imageCase(request.contents) !== context.firstDevelopmentCaseId) throw new Error('fixture wrong token request');
      return { totalTokens: 1 };
    },
  } };
  const adapter = createGenAIAdapter({ project: 'calorix-xurschnell', location: 'us', googleGenAI: client });
  const store = await prepareCalibrationOffSnapshotStore({ lockText: context.files['off-lock'],
    readSnapshot: async (path: CalibrationOffSnapshotPath) => execFileSync('git', ['show', `${context.identity.implementationCommit}:${path}`], { cwd: context.baseDir, encoding: 'utf8' }) });
  let clock = 0;
  const deps: CalibrationStageDriverDeps = { context, ledger,
    loadImage: async key => { const c = cases.get(key.caseId); if (!c || c.scanMode === 'barcode') throw new Error('fixture forbidden image'); witness.imageCaseIds.push(c.id); return Buffer.from(JSON.stringify({ caseId: c.id })); },
    generateVision: adapter.generateVision,
    lookupSnapshot: barcode => { witness.barcodeLookups++; return store.get(barcode); },
    countTokens: async () => { const first = cases.get(context.firstDevelopmentCaseId)!; const prompts = JSON.parse(context.files.prompt) as string[];
      return countCalibrationTokens(client, { model: CALIBRATION_MODEL, prompt: prompts[0]!, imageBase64: Buffer.from(JSON.stringify({ caseId: first.id })).toString('base64'), imageMediaType: first.image.mediaType, timeoutMs: 30000 }); },
    nowMs: () => ++clock, getSdkMethodCounts: () => ({ vision: witness.sdkVision, tokenCount: witness.sdkToken }) };
  return { context, ledger, root, deps, witness, cases, beginStage(next: StageName) { stage = next; } };
}
export async function v2StageDriverFixture(roots: string[], setPin: (sha: string) => void, options: V2DriverFixtureOptions = {}) {
  const f = await nativeV2RuntimeFixture(roots, setPin); snapshotAssets(f.mini.root);
  const context = await f.admit();
  const ledger = await prepareNativeCalibrationBenchmarkAuthorityLedgerV2({ context }); ledger.acquireLock(context.owner);
  return { ...await ports(context, ledger, f.root, options), context };
}
export async function v1StageDriverFixture(roots: string[]) {
  const f = nativeMiniFixture(roots); snapshotAssets(f.mini.root);
  const context = await prepareCalibrationBootstrapContext(f.nativePorts);
  const ledger = await prepareNativeCalibrationBenchmarkAuthorityLedger({ context }); ledger.acquireLock(context.owner);
  return ports(context, ledger, join(f.mini.root, '.nutrition-eval/calibration/calorix-gemini-38-calibration-v1'), {});
}
