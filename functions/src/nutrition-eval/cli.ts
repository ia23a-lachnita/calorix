import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import { resolve } from 'path';

import { loadVerifiedCaseImage } from './assets';
import { createLiveNutritionEvalAdapter } from './live-adapter';
import { loadPrivateOverlay, mergePrivateOverlay } from './private-overlay';
import { buildNutritionEvalReport, writeNutritionEvalReport } from './report';
import { runNutritionEval } from './runner';
import { parseNutritionEvalManifest } from './schema';
import {
  BARCODE_ANALYSIS_PROMPT,
  LABEL_ANALYSIS_PROMPT,
  MEAL_ANALYSIS_PROMPT,
} from '../prompts';

import type { LiveNutritionEvalAdapter } from './live-adapter';
import type { NutritionEvalManifest, NutritionCaseResult, NutritionEvalReport } from './schema';
import type { PrivateOverlay } from './private-overlay';

export type CliFailureCode =
  | 'invalid_command'
  | 'opt_in_missing'
  | 'missing_config'
  | 'manifest_invalid'
  | 'private_case_unavailable'
  | 'dataset_failure'
  | 'runner_failure'
  | 'privacy_leak'
  | 'report_write_failed'
  | 'safety_violation'
  | 'threshold_violation';

export interface CliResult {
  exitCode: 0 | 1;
  failureCode?: CliFailureCode;
  reportPaths?: { reportDir: string; jsonPath: string; markdownPath: string } | undefined;
}

interface CliDependencies {
  createLiveAdapter?: (options: {
    project: string;
    location: string;
    model: string;
  }) => LiveNutritionEvalAdapter;
  loadManifest?: () => Promise<unknown>;
  loadImage?: (
    evalCase: NutritionEvalManifest['cases'][number],
    options?: { privateRoot?: string },
  ) => Promise<Uint8Array>;
  loadPrivateOverlay?: (manifestPath: string) => Promise<PrivateOverlay>;
  runNutritionEval?: typeof runNutritionEval;
  writeReport?: typeof writeNutritionEvalReport;
  getCodeSha?: () => string | undefined;
  outputDir?: string;
  now?: () => Date;
}

interface ParsedArgs {
  command?: string | undefined;
  project?: string | undefined;
  location?: string | undefined;
  model?: string | undefined;
  codeSha?: string | undefined;
  outDir?: string | undefined;
  samples?: string | undefined;
  minParseRate?: string | undefined;
  maxMedianRelativeKcal?: string | undefined;
  maxP90RelativeKcal?: string | undefined;
  maxMeanMacroRelativeError?: string | undefined;
  maxUnsafeCount?: string | undefined;
  maxCatastrophicCount?: string | undefined;
  privateManifest?: string | undefined;
  invalidCommand: boolean;
}

export interface NutritionEvalRuntimePaths {
  repoRoot: string;
  manifestPath: string;
  cacheRoot: string;
  reportsRoot: string;
}

export function resolveNutritionEvalRuntimePaths(
  moduleDir = __dirname,
): NutritionEvalRuntimePaths {
  const repoRoot = resolve(moduleDir, '../../..');
  return {
    repoRoot,
    manifestPath: resolve(repoRoot, 'functions/eval/nutrition/public-manifest.json'),
    cacheRoot: resolve(repoRoot, '.nutrition-eval/cache'),
    reportsRoot: resolve(repoRoot, '.nutrition-eval/reports'),
  };
}

function nonblank(value: string | undefined): string | undefined {
  return value?.trim() ? value.trim() : undefined;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const parsed: ParsedArgs = { command: argv[0], invalidCommand: false };
  const fields: Record<string, keyof Omit<ParsedArgs, 'command' | 'invalidCommand'>> = {
    '--project': 'project',
    '--location': 'location',
    '--model': 'model',
    '--code-sha': 'codeSha',
    '--out-dir': 'outDir',
    '--samples': 'samples',
    '--min-parse-rate': 'minParseRate',
    '--max-median-relative-kcal': 'maxMedianRelativeKcal',
    '--max-p90-relative-kcal': 'maxP90RelativeKcal',
    '--max-mean-macro-relative-error': 'maxMeanMacroRelativeError',
    '--max-unsafe-count': 'maxUnsafeCount',
    '--max-catastrophic-count': 'maxCatastrophicCount',
    '--private-manifest': 'privateManifest',
  };
  const seenFlags = new Set<string>();
  for (let index = 1; index < argv.length; index++) {
    const flag = argv[index];
    const value = argv[index + 1];
    const field = typeof flag === 'string' ? fields[flag] : undefined;
    if (typeof flag !== 'string' || !field || seenFlags.has(flag)
      || value === undefined || value.startsWith('--')) {
      parsed.invalidCommand = true;
      break;
    }
    seenFlags.add(flag);
    parsed[field] = value;
    index++;
  }
  return parsed;
}

function fail(
  failureCode: CliFailureCode,
  reportPaths?: CliResult['reportPaths'],
): CliResult {
  return reportPaths ? { exitCode: 1, failureCode, reportPaths } : { exitCode: 1, failureCode };
}

export function hashNutritionEvalManifest(value: unknown): string {
  const manifest = parseNutritionEvalManifest(value);
  return createHash('sha256').update(JSON.stringify(manifest), 'utf8').digest('hex');
}

export function hashNutritionEvalPrompts(
  mealPrompt: string,
  labelPrompt: string,
  barcodePrompt: string,
): string {
  return createHash('sha256')
    .update(JSON.stringify([mealPrompt, labelPrompt, barcodePrompt]), 'utf8')
    .digest('hex');
}

async function defaultLoadManifest(paths: NutritionEvalRuntimePaths): Promise<unknown> {
  return JSON.parse(await readFile(paths.manifestPath, 'utf8'));
}

function defaultLoadImage(
  evalCase: NutritionEvalManifest['cases'][number],
  paths: NutritionEvalRuntimePaths,
  options: { privateRoot?: string } = {},
): Promise<Uint8Array> {
  return loadVerifiedCaseImage(evalCase, {
    cacheRoot: paths.cacheRoot,
    fetchFn: fetch,
    ...(options.privateRoot ? { privateRoot: options.privateRoot } : {}),
  });
}

function defaultCodeSha(env: Record<string, string | undefined>): string | undefined {
  return env.CALORIX_NUTRITION_EVAL_CODE_SHA ?? env.GITHUB_SHA;
}

export function resolveNutritionEvalOutputDir(
  now: Date,
  configured: string | undefined,
  paths: NutritionEvalRuntimePaths,
): string {
  const normalized = nonblank(configured);
  if (normalized) return resolve(paths.repoRoot, normalized);
  const suffix = now.toISOString().replace(/[:.]/g, '-');
  return resolve(paths.reportsRoot, `run-${suffix}`);
}

interface Thresholds {
  samples: number;
  minParseRate?: number | undefined;
  maxMedianRelativeKcal?: number | undefined;
  maxP90RelativeKcal?: number | undefined;
  maxMeanMacroRelativeError?: number | undefined;
  maxUnsafeCount?: number | undefined;
  maxCatastrophicCount?: number | undefined;
}

function firstDefined(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value !== undefined);
}

function parseThresholds(args: ParsedArgs, env: Record<string, string | undefined>): Thresholds | null {
  const samplesValue = firstDefined(args.samples, env.CALORIX_NUTRITION_EVAL_SAMPLES) ?? '1';
  const samples = Number(samplesValue);
  if (!Number.isInteger(samples) || samples < 1 || samples > 10) return null;
  const decimal = (value: string | undefined): number | undefined | null => {
    if (value === undefined) return undefined;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  };
  const parseRate = (value: string | undefined): number | undefined | null => {
    const number = decimal(value);
    return number === null || (number !== undefined && number > 1) ? null : number;
  };
  const count = (value: string | undefined): number | undefined | null => {
    const number = decimal(value);
    return number === null || (number !== undefined && !Number.isInteger(number)) ? null : number;
  };
  const minParseRate = parseRate(firstDefined(args.minParseRate, env.CALORIX_NUTRITION_EVAL_MIN_PARSE_RATE));
  const maxMedianRelativeKcal = decimal(firstDefined(args.maxMedianRelativeKcal, env.CALORIX_NUTRITION_EVAL_MAX_MEDIAN_RELATIVE_KCAL));
  const maxP90RelativeKcal = decimal(firstDefined(args.maxP90RelativeKcal, env.CALORIX_NUTRITION_EVAL_MAX_P90_RELATIVE_KCAL));
  const maxMeanMacroRelativeError = decimal(firstDefined(args.maxMeanMacroRelativeError, env.CALORIX_NUTRITION_EVAL_MAX_MEAN_MACRO_RELATIVE_ERROR));
  const maxUnsafeCount = count(firstDefined(args.maxUnsafeCount, env.CALORIX_NUTRITION_EVAL_MAX_UNSAFE_COUNT));
  const maxCatastrophicCount = count(firstDefined(args.maxCatastrophicCount, env.CALORIX_NUTRITION_EVAL_MAX_CATASTROPHIC_COUNT));
  if (minParseRate === null || maxMedianRelativeKcal === null || maxP90RelativeKcal === null
    || maxMeanMacroRelativeError === null || maxUnsafeCount === null || maxCatastrophicCount === null) return null;
  return { samples, minParseRate, maxMedianRelativeKcal, maxP90RelativeKcal, maxMeanMacroRelativeError, maxUnsafeCount, maxCatastrophicCount };
}

function thresholdsExceeded(
  summary: NutritionEvalReport['summary'],
  thresholds: Thresholds,
): boolean {
  const parseRate = summary.runCases === 0 ? 0 : summary.parseCases / summary.runCases;
  return (thresholds.minParseRate !== undefined && parseRate < thresholds.minParseRate)
    || (thresholds.maxMedianRelativeKcal !== undefined
      && summary.medianRelativeCalorieError > thresholds.maxMedianRelativeKcal)
    || (thresholds.maxP90RelativeKcal !== undefined
      && summary.p90RelativeCalorieError > thresholds.maxP90RelativeKcal)
    || (thresholds.maxMeanMacroRelativeError !== undefined
      && summary.meanMacroRelativeError > thresholds.maxMeanMacroRelativeError)
    || (thresholds.maxUnsafeCount !== undefined
      && summary.unsafeCompletionCount > thresholds.maxUnsafeCount)
    || (thresholds.maxCatastrophicCount !== undefined
      && summary.catastrophicCount > thresholds.maxCatastrophicCount);
}

function hasFailure(results: readonly NutritionCaseResult[], category: 'dataset' | 'runner'): boolean {
  return results.some((result) =>
    result.prediction.parseStatus === 'failure' && result.prediction.failureCategory === category,
  );
}

function releaseUnsafe(results: readonly NutritionCaseResult[]): boolean {
  return results.some((result) =>
    result.prediction.parseStatus === 'failure' || result.safety.unsafeCompletion,
  );
}

export async function runNutritionEvalCli(
  argv: readonly string[],
  env: Record<string, string | undefined> = process.env,
  deps: CliDependencies = {},
): Promise<CliResult> {
  const args = parseArgs(argv);
  if (args.command !== 'fixtures' && args.command !== 'baseline' && args.command !== 'release') {
    return fail('invalid_command');
  }
  if (args.invalidCommand) return fail('invalid_command');
  if (args.command === 'fixtures') return { exitCode: 0 };
  if (env.RUN_NUTRITION_EVAL_LIVE !== '1') return fail('opt_in_missing');
  const thresholds = parseThresholds(args, env);
  if (!thresholds) return fail('threshold_violation');

  const project = nonblank(args.project) ?? nonblank(env.CALORIX_NUTRITION_EVAL_PROJECT);
  const location = nonblank(args.location) ?? nonblank(env.CALORIX_NUTRITION_EVAL_LOCATION);
  const model = nonblank(args.model) ?? nonblank(env.CALORIX_NUTRITION_EVAL_MODEL);
  if (!project || !location || !model) return fail('missing_config');

  let manifest: NutritionEvalManifest;
  const paths = resolveNutritionEvalRuntimePaths();
  try {
    manifest = parseNutritionEvalManifest(await (deps.loadManifest ?? (() => defaultLoadManifest(paths)))());
  } catch {
    return fail('manifest_invalid');
  }
  const requestedPrivateManifest = args.privateManifest === undefined
    ? nonblank(env.CALORIX_NUTRITION_EVAL_PRIVATE_MANIFEST)
    : nonblank(args.privateManifest);
  if (args.privateManifest !== undefined && !requestedPrivateManifest) return fail('private_case_unavailable');
  let privateRoot: string | undefined;
  if (requestedPrivateManifest) {
    try {
      const overlay = await (deps.loadPrivateOverlay ?? loadPrivateOverlay)(requestedPrivateManifest);
      manifest = mergePrivateOverlay(manifest, overlay.manifest);
      privateRoot = overlay.root;
    } catch {
      return fail('private_case_unavailable');
    }
  }
  const codeSha = nonblank(firstDefined(args.codeSha, (deps.getCodeSha ?? (() => defaultCodeSha(env)))()));
  if (!codeSha) return fail('missing_config');

  const now = deps.now ?? (() => new Date());
  const started = now();
  const promptHash = hashNutritionEvalPrompts(
    MEAL_ANALYSIS_PROMPT, LABEL_ANALYSIS_PROMPT, BARCODE_ANALYSIS_PROMPT,
  );
  const datasetHash = hashNutritionEvalManifest(manifest);
  const adapter = (deps.createLiveAdapter ?? createLiveNutritionEvalAdapter)({ project, location, model });
  const internalLoadImage = deps.loadImage
    ?? ((evalCase: NutritionEvalManifest['cases'][number], options?: { privateRoot?: string }) =>
      defaultLoadImage(evalCase, paths, options));
  let results: NutritionCaseResult[];
  try {
    results = await (deps.runNutritionEval ?? runNutritionEval)(manifest.cases, {
      loadImage: (evalCase) => evalCase.visibility === 'private'
        ? privateRoot
          ? internalLoadImage(evalCase, { privateRoot })
          : internalLoadImage(evalCase)
        : internalLoadImage(evalCase),
      analyzeCase: (evalCase, bytes, options) => adapter.analyzeCase(evalCase, bytes, options),
      nowMs: () => Date.now(),
    }, {
      datasetId: manifest.datasetId,
      adapterModelId: model,
      promptHash,
      codeSha,
      samples: thresholds.samples,
    });
  } catch {
    return fail('runner_failure');
  }

  const report = buildNutritionEvalReport(results, {
    runId: `run-${started.toISOString().replace(/[:.]/g, '-')}`,
    timestamp: started.toISOString(),
    datasetId: manifest.datasetId,
    datasetHash,
    adapterModelId: model,
    promptHash,
    codeSha,
    samples: thresholds.samples,
    baselineOnly: args.command === 'baseline',
  });
  let reportPaths: CliResult['reportPaths'];
  try {
    reportPaths = await (deps.writeReport ?? writeNutritionEvalReport)(
      report,
      resolveNutritionEvalOutputDir(
        started,
        nonblank(args.outDir) ?? nonblank(env.CALORIX_NUTRITION_EVAL_OUTPUT_DIR) ?? deps.outputDir,
        paths,
      ),
    );
  } catch (error) {
    return fail(error instanceof Error && error.message === 'privacy_leak' ? 'privacy_leak' : 'report_write_failed');
  }

  if (hasFailure(results, 'dataset')) return fail('dataset_failure', reportPaths);
  if (hasFailure(results, 'runner')) return fail('runner_failure', reportPaths);
  if (args.command === 'release') {
    if (thresholdsExceeded(report.summary, thresholds)) return fail('threshold_violation', reportPaths);
    if (releaseUnsafe(results)) return fail('safety_violation', reportPaths);
  }
  return { exitCode: 0, reportPaths };
}

if (require.main === module) {
  void runNutritionEvalCli(process.argv.slice(2), process.env).then((result) => {
    process.exitCode = result.exitCode;
  }).catch(() => {
    process.exitCode = 1;
  });
}
