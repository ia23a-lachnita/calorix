/** One opt-in, at-most48-image two-pass development attempt; never resumes. */
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import * as fs from 'fs/promises';
import { dirname, extname, join, resolve } from 'path';
import { performance } from 'perf_hooks';
import { createCalibrationGenAIClient, type GenAIClient } from '../genai-adapter';
import { visionResponseJsonSchema } from '../nutrition-json-schema';
import { loadVerifiedCaseImage } from './assets';
import { ACCURACY_MEAL_PROMPT_V1 } from './accuracy-development';
import { runTwoPassAccuracyDevelopment, TWO_PASS_PROMPT_SHA256, INVENTORY_PROMPT_V1,
  INVENTORY_RESPONSE_SCHEMA, TWO_PASS_NUTRITION_SUFFIX_V1 } from './accuracy-two-pass';
import { renderNutritionEvalJson, renderNutritionEvalMarkdown } from './report';
import { parseNutritionEvalManifest } from './schema';

const EXPERIMENT = 'calorix-accuracy-two-pass-v1';
const MANIFEST_SHA = '59231d1cfda7e8a795901086f379f0bdb331dbf082ff51b37e3758e381bebd4e';
const MANIFEST_PATH = 'functions/eval/nutrition/accuracy-development-manifest-v1.json';
const hash = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');
const failed = () => ({ status: 'failed' as const, failureCode: 'accuracy:native-preflight-or-execution-failed' });
function git(root: string, args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, maxBuffer: 4 * 1024 * 1024 }).trim();
}
async function exists(path: string): Promise<boolean> {
  try { await fs.lstat(path); return true; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
async function safeParents(root: string): Promise<void> {
  for (const suffix of ['.nutrition-eval', '.nutrition-eval/accuracy-development']) {
    const path = join(root, suffix);
    if (await exists(path)) {
      const stat = await fs.lstat(path);
      if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(path) !== path) throw new Error('accuracy:unsafe-parent');
    }
  }
}
async function durableFile(path: string, contents: string): Promise<void> {
  const handle = await fs.open(path, 'wx', 0o600);
  try { await handle.writeFile(contents, 'utf8'); await handle.sync(); } finally { await handle.close(); }
}
async function syncDirectory(path: string): Promise<void> {
  const handle = await fs.open(path, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

export async function runNativeTwoPassAccuracyDevelopment(
  repositoryRoot: string,
  env: NodeJS.ProcessEnv,
): Promise<{ status: 'completed'; runId: string; imageCalls: number; tokenCountCalls: 0 } | ReturnType<typeof failed>> {
  try {
    if (env.RUN_NUTRITION_TWO_PASS_DEV !== '1') return failed();
    if (resolve(repositoryRoot) !== repositoryRoot || await fs.realpath(repositoryRoot) !== repositoryRoot) return failed();
    if (git(repositoryRoot, ['rev-parse', '--show-toplevel']) !== repositoryRoot) return failed();
    if (git(repositoryRoot, ['status', '--porcelain', '--untracked-files=all', '--', 'functions'])) return failed();
    for (const [name, expected] of [
      ['CALORIX_NUTRITION_EVAL_PROJECT', 'calorix-xurschnell'],
      ['CALORIX_NUTRITION_EVAL_LOCATION', 'us'],
      ['CALORIX_NUTRITION_EVAL_MODEL', 'gemini-3.8-flash'],
    ] as const) if (env[name] && env[name] !== expected) return failed();
    if (env.GOOGLE_VERTEX_BASE_URL?.trim() || env.GOOGLE_GEMINI_BASE_URL?.trim()
      || env.GOOGLE_GENAI_RETRY_OPTIONS || env.CALIBRATION_MAX_RETRIES) return failed();

    const head = git(repositoryRoot, ['rev-parse', 'HEAD']);
    const implementationCommit = git(repositoryRoot, ['log', '-1', '--format=%H', '--', 'functions']);
    const functionsTreeId = git(repositoryRoot, ['rev-parse', 'HEAD:functions']);
    if (![head, implementationCommit, functionsTreeId].every(value => /^[a-f0-9]{40}$/.test(value))) return failed();
    const manifestBytes = await fs.readFile(join(repositoryRoot, MANIFEST_PATH));
    if (hash(manifestBytes) !== MANIFEST_SHA) return failed();
    // Also compare against the committed bytes, not just an ignored working artifact.
    if (hash(execFileSync('git', ['show', `${head}:${MANIFEST_PATH}`], { cwd: repositoryRoot,
      stdio: ['ignore', 'pipe', 'pipe'] })) !== MANIFEST_SHA) return failed();
    const manifest = parseNutritionEvalManifest(JSON.parse(manifestBytes.toString('utf8')));
    if (manifest.datasetId !== 'calorix-n5k-accuracy-development-v1' || manifest.cases.length !== 24
      || manifest.cases.some(row => row.visibility !== 'public' || row.scanMode !== 'meal')) return failed();
    await safeParents(repositoryRoot);
    const parent = join(repositoryRoot, '.nutrition-eval/accuracy-development');
    const runRoot = join(parent, 'two-pass-v1');
    if (await exists(runRoot)) return failed();
    const images = new Map<string, Uint8Array>();
    for (const row of manifest.cases) {
      images.set(row.id, await loadVerifiedCaseImage(row, { cacheRoot: join(parent, 'inputs') }));
    }
    const sdkEntry = require.resolve('@google/genai');
    const sdkPackage = JSON.parse(await fs.readFile(resolve(dirname(sdkEntry), '../../package.json'), 'utf8')) as { version?: unknown };
    if (sdkPackage.version !== '2.19.0') return failed();
    const timestamp = new Date().toISOString();
    const runId = `accuracy-two-pass-v1-${implementationCommit.slice(0, 12)}-${timestamp.replace(/[:.]/g, '-')}`;
    const identity = {
      experimentId: EXPERIMENT, runId, timestamp, head, implementationCommit, functionsTreeId,
      manifestSha256: MANIFEST_SHA, promptSha256: TWO_PASS_PROMPT_SHA256,
      inventoryPromptSha256: hash(INVENTORY_PROMPT_V1), inventorySchemaSha256: hash(JSON.stringify(INVENTORY_RESPONSE_SCHEMA)),
      nutritionPromptPrefixSha256: hash(ACCURACY_MEAL_PROMPT_V1), nutritionSuffixSha256: hash(TWO_PASS_NUTRITION_SUFFIX_V1),
      responseSchemaSha256: hash(JSON.stringify(visionResponseJsonSchema('meal'))),
      sdkVersion: sdkPackage.version, sdkSha256: hash(await fs.readFile(sdkEntry)),
      nativeModuleSha256: hash(await fs.readFile(__filename)),
      coreModuleSha256: hash(await fs.readFile(join(__dirname, `accuracy-two-pass${extname(__filename)}`))),
      delegatedCoreModuleSha256: hash(await fs.readFile(join(__dirname, `accuracy-development${extname(__filename)}`))),
      route: { provider: 'vertex-ai', project: 'calorix-xurschnell', location: 'us', model: 'gemini-3.8-flash',
        apiVersion: 'v1', thinkingLevel: 'MEDIUM', timeoutMs: 30000 },
      maxImageCalls: 48, plannedLogicalCases: 24, tokenCountCalls: 0, samples: 1,
    };
    await fs.mkdir(parent, { recursive: true, mode: 0o700 });
    await safeParents(repositoryRoot);
    await fs.mkdir(runRoot, { mode: 0o700 }); // Exclusive: no recursive merge, reset or recovery.
    await syncDirectory(parent);
    await durableFile(join(runRoot, 'run.json'), JSON.stringify(identity, null, 2) + '\n');
    const events = await fs.open(join(runRoot, 'events.jsonl'), 'ax', 0o600);
    try {
      await events.sync(); await syncDirectory(runRoot);
      let sequence = 0;
      const append = async (row: object): Promise<void> => {
        await events.writeFile(JSON.stringify({ sequence: ++sequence, ...row }) + '\n', 'utf8');
        await events.sync();
      };
      const result = await runTwoPassAccuracyDevelopment(manifest.cases, {
        loadImage: async row => {
          const bytes = images.get(row.id); if (!bytes) throw new Error('accuracy:missing-image'); return bytes;
        },
        createClient: () => {
          const client = createCalibrationGenAIClient(env);
          const models = client.models;
          const generate = models.generateContent.bind(models);
          return { models: { generateContent: request => generate(request) } } as GenAIClient;
        },
        reserveStage: async (caseId, stage) => append({ type: 'stage-reserved', caseId, stage }),
        persistStage: async record => append({ type: 'stage-outcome', ...record }),
        persistOutcome: async outcome => append({ type: 'dish-outcome', ...outcome }),
        nowMs: () => performance.now(),
      }, { runId, timestamp, codeSha: implementationCommit, datasetHash: MANIFEST_SHA });
      if (result.logicalAnalysisCalls !== 24 || result.inventoryCalls !== 24 || result.nutritionCalls > 24
        || result.sdkVisionCalls !== result.inventoryCalls + result.nutritionCalls || result.sdkVisionCalls > 48
        || result.stages.length !== result.sdkVisionCalls
        || result.report.cases.length !== 24 || result.diagnostics.length !== 24) return failed();
      if (git(repositoryRoot, ['rev-parse', 'HEAD']) !== head
        || git(repositoryRoot, ['status', '--porcelain', '--untracked-files=all', '--', 'functions'])) return failed();
      const report = renderNutritionEvalJson(result.report);
      const markdown = renderNutritionEvalMarkdown(result.report);
      const diagnostics = JSON.stringify({ ...identity, sdkVisionCalls: result.sdkVisionCalls, inventoryCalls: result.inventoryCalls, nutritionCalls: result.nutritionCalls,
        logicalAnalysisCalls: result.logicalAnalysisCalls, stages: result.stages, diagnostics: result.diagnostics }, null, 2) + '\n';
      await durableFile(join(runRoot, 'report.json'), report);
      await durableFile(join(runRoot, 'report.md'), markdown);
      await durableFile(join(runRoot, 'diagnostics.json'), diagnostics);
      await syncDirectory(runRoot);
      await durableFile(join(runRoot, 'complete.json'), JSON.stringify({ status: 'completed', experimentId: EXPERIMENT, runId,
        imageCalls: result.sdkVisionCalls, tokenCountCalls: 0, reportSha256: hash(report), markdownSha256: hash(markdown),
        diagnosticsSha256: hash(diagnostics), eventsSha256: hash(await fs.readFile(join(runRoot, 'events.jsonl'))) }, null, 2) + '\n');
      await syncDirectory(runRoot);
      return { status: 'completed', runId, imageCalls: result.sdkVisionCalls, tokenCountCalls: 0 };
    } finally { await events.close(); }
  } catch { return failed(); }
}

if (require.main === module) {
  if (process.argv.length !== 2) {
    process.stdout.write(JSON.stringify({ status: 'failed', failureCode: 'accuracy:arguments-forbidden' }) + '\n');
    process.exitCode = 1;
  } else {
    void runNativeTwoPassAccuracyDevelopment(resolve(__dirname, '../../..'), process.env).then(result => {
      process.stdout.write(JSON.stringify(result) + '\n'); process.exitCode = result.status === 'completed' ? 0 : 1;
    });
  }
}
