import { describe, expect, it, vi } from 'vitest';
import { resolve } from 'path';

import {
  hashNutritionEvalManifest,
  hashNutritionEvalPrompts,
  resolveNutritionEvalOutputDir,
  resolveNutritionEvalRuntimePaths,
  runNutritionEvalCli,
} from '../../src/nutrition-eval/cli';
import { DatasetError } from '../../src/nutrition-eval/assets';
import { scoreNutritionCase } from '../../src/nutrition-eval/scorer';
import {
  BARCODE_ANALYSIS_PROMPT,
  LABEL_ANALYSIS_PROMPT,
  MEAL_ANALYSIS_PROMPT,
} from '../../src/prompts';
import type { NutritionEvalCase, NutritionPrediction } from '../../src/nutrition-eval/schema';

const liveEnv = {
  RUN_NUTRITION_EVAL_LIVE: '1',
  CALORIX_NUTRITION_EVAL_PROJECT: 'test-project',
  CALORIX_NUTRITION_EVAL_LOCATION: 'europe-west1',
  CALORIX_NUTRITION_EVAL_MODEL: 'gemini-test-model',
};

const evalCase: NutritionEvalCase = {
  id: 'cli-case',
  visibility: 'public',
  scanMode: 'meal',
  source: { dataset: 'test', objectId: 'cli-case' },
  image: {
    url: 'https://example.com/cli-case.png',
    sha256: 'a'.repeat(64),
    mediaType: 'image/png',
    width: 1,
    height: 1,
  },
  truth: { basis: 'portion', amount: 1, unit: 'portion', kcal: 100, proteinG: 1, carbsG: 2, fatG: 3 },
  toleranceClass: 'test',
  attributionId: 'test',
};

const manifest = {
  version: 1 as const,
  datasetId: 'cli-test-dataset',
  cases: [evalCase],
};

const secondCase: NutritionEvalCase = {
  ...evalCase,
  id: 'cli-case-second',
  source: { dataset: 'test', objectId: 'cli-case-second' },
  image: { ...evalCase.image, sha256: 'b'.repeat(64) },
};

const privateEvalCase: NutritionEvalCase = {
  ...evalCase,
  id: 'private-cli-case',
  visibility: 'private',
  source: { dataset: 'private', objectId: 'private-cli-object' },
  image: {
    path: 'asset.png',
    sha256: 'c'.repeat(64),
    mediaType: 'image/png',
    width: 1,
    height: 1,
  },
  truth: { basis: 'package', amount: 500, unit: 'ml', kcal: 85, proteinG: 0, carbsG: 21, fatG: 0 },
};

const reverseOrderedManifest = {
  version: 1 as const,
  datasetId: 'cli-test-dataset',
  cases: [secondCase, evalCase],
};

const forwardOrderedManifest = {
  version: 1 as const,
  datasetId: 'cli-test-dataset',
  cases: [evalCase, secondCase],
};

const providerFailure: NutritionPrediction = {
  parseStatus: 'failure',
  source: 'meal',
  decision: 'error',
  failureCategory: 'provider',
  failureCode: 'provider_request_failed',
};

function makeLiveDeps(
  prediction: NutritionPrediction = providerFailure,
  manifestValue = manifest,
) {
  const events: string[] = [];
  const adapter = {
    analyzeCase: vi.fn(async () => {
      events.push('analyze');
      return prediction;
    }),
  };
  const createLiveAdapter = vi.fn(() => {
    events.push('adapter');
    return adapter;
  });
  const loadManifest = vi.fn(async () => {
    events.push('manifest');
    return manifestValue;
  });
  const loadImage = vi.fn(async () => {
    events.push('image');
    return new Uint8Array([1]);
  });
  const writeReport = vi.fn(async (report: { summary: unknown }) => {
    events.push('report');
    return {
      reportDir: '/tmp/nutrition-eval-report',
      jsonPath: '/tmp/nutrition-eval-report/report.json',
      markdownPath: '/tmp/nutrition-eval-report/report.md',
      report,
    };
  });
  const getCodeSha = vi.fn(() => {
    events.push('code-sha');
    return '4'.repeat(40);
  });

  return {
    events,
    adapter,
    createLiveAdapter,
    loadManifest,
    loadImage,
    writeReport,
    getCodeSha,
    outputDir: '/tmp/nutrition-eval-report',
    now: () => new Date('2026-09-01T12:00:00.000Z'),
  };
}

describe('runNutritionEvalCli', () => {
  it('rejects an invalid command before constructing live dependencies', async () => {
    const createLiveAdapter = vi.fn();

    const result = await runNutritionEvalCli(['unknown'], {}, { createLiveAdapter });

    expect(result).toMatchObject({ exitCode: 1, failureCode: 'invalid_command' });
    expect(createLiveAdapter).not.toHaveBeenCalled();
  });

  it('refuses baseline before constructing the live adapter when live opt-in is absent', async () => {
    const deps = makeLiveDeps();

    const result = await runNutritionEvalCli(
      ['baseline', '--project', 'test-project', '--location', 'europe-west1', '--model', 'gemini-test-model'],
      {},
      deps,
    );

    expect(result).toMatchObject({ exitCode: 1, failureCode: 'opt_in_missing' });
    expect(deps.loadManifest).not.toHaveBeenCalled();
    expect(deps.getCodeSha).not.toHaveBeenCalled();
    expect(deps.createLiveAdapter).not.toHaveBeenCalled();
    expect(deps.loadImage).not.toHaveBeenCalled();
    expect(deps.writeReport).not.toHaveBeenCalled();
  });

  it.each([
    ['project', { ...liveEnv, CALORIX_NUTRITION_EVAL_PROJECT: ' ' }],
    ['location', { ...liveEnv, CALORIX_NUTRITION_EVAL_LOCATION: '' }],
    ['model', { ...liveEnv, CALORIX_NUTRITION_EVAL_MODEL: '  ' }],
  ])('refuses live baseline with missing %s configuration before manifest or adapter work', async (_field, env) => {
    const deps = makeLiveDeps();

    const result = await runNutritionEvalCli(['baseline'], env, deps);

    expect(result).toMatchObject({ exitCode: 1, failureCode: 'missing_config' });
    expect(deps.loadManifest).not.toHaveBeenCalled();
    expect(deps.getCodeSha).not.toHaveBeenCalled();
    expect(deps.createLiveAdapter).not.toHaveBeenCalled();
  });

  it('runs a baseline provider quality failure through manifest, adapter, scorer report, and write while exiting zero', async () => {
    const deps = makeLiveDeps();

    const result = await runNutritionEvalCli(['baseline'], liveEnv, deps);

    expect(result).toMatchObject({ exitCode: 0 });
    expect(deps.events.indexOf('manifest')).toBeLessThan(deps.events.indexOf('adapter'));
    expect(deps.events.indexOf('adapter')).toBeLessThan(deps.events.indexOf('report'));
    expect(deps.writeReport).toHaveBeenCalledTimes(1);
    const writtenReport = deps.writeReport.mock.calls[0]?.[0];
    if (!writtenReport) throw new Error('baseline did not supply a report to the writer');
    expect(writtenReport.summary).toMatchObject({
      totalCases: 1,
      parseCases: 0,
      failuresByCategory: { provider: 1 },
      failuresByCode: { provider_request_failed: 1 },
    });
  });

  it('writes hand-derived canonical dataset and prompt identities while preserving manifest case order', async () => {
    const success: NutritionPrediction = {
      parseStatus: 'success', source: 'meal', kcal: 100, proteinG: 1, carbsG: 2, fatG: 3,
      confidence: 0.9, decision: 'complete',
    };
    const deps = makeLiveDeps(success, reverseOrderedManifest);

    const result = await runNutritionEvalCli(['baseline'], liveEnv, deps);

    expect(result).toMatchObject({ exitCode: 0 });
    expect(hashNutritionEvalManifest(manifest))
      .toBe('6b8b3e8add891b35386f138b3027424f02bfbad784b4845d49324d147cc76400');
    expect(hashNutritionEvalManifest(reverseOrderedManifest))
      .toBe('5f503b1996c52c0a1b6be97cf76527caf10d83953832180fcacd1748295e9faf');
    expect(hashNutritionEvalManifest(forwardOrderedManifest))
      .toBe('d259d62d9c6cc3672e60fc231a66d777a68af72435e66336ab0d75432b3c90d1');
    expect(hashNutritionEvalManifest(forwardOrderedManifest))
      .not.toBe(hashNutritionEvalManifest(reverseOrderedManifest));
    expect(hashNutritionEvalPrompts(
      MEAL_ANALYSIS_PROMPT, LABEL_ANALYSIS_PROMPT, BARCODE_ANALYSIS_PROMPT,
    )).toBe('294ea620c053db3687704a7b589c824776d138817b10c4d71f29abb734e6be49');
    const writtenReport = deps.writeReport.mock.calls[0]?.[0];
    if (!writtenReport) throw new Error('baseline did not supply a report to the writer');
    expect(writtenReport).toMatchObject({
      datasetHash: '5f503b1996c52c0a1b6be97cf76527caf10d83953832180fcacd1748295e9faf',
      promptHash: '294ea620c053db3687704a7b589c824776d138817b10c4d71f29abb734e6be49',
      codeSha: '4444444444444444444444444444444444444444',
      cases: [{ caseId: 'cli-case-second' }, { caseId: 'cli-case' }],
    });
  });

  it.each([undefined, '', '   '])(
    'returns missing_config for blank code SHA %j before adapter, image, or report work',
    async (codeSha) => {
      const deps = makeLiveDeps();
      deps.getCodeSha.mockReturnValueOnce(codeSha);

      const result = await runNutritionEvalCli(['baseline'], liveEnv, deps);

      expect(result).toMatchObject({ exitCode: 1, failureCode: 'missing_config' });
      expect(deps.createLiveAdapter).not.toHaveBeenCalled();
      expect(deps.loadImage).not.toHaveBeenCalled();
      expect(deps.writeReport).not.toHaveBeenCalled();
    },
  );

  it('writes a report then returns dataset_failure for a per-case image integrity failure', async () => {
    const deps = makeLiveDeps();
    deps.loadImage.mockRejectedValueOnce(
      new DatasetError('dataset_checksum_mismatch', 'fixture checksum mismatch'),
    );

    const result = await runNutritionEvalCli(['baseline'], liveEnv, deps);

    expect(result).toMatchObject({
      exitCode: 1, failureCode: 'dataset_failure',
      reportPaths: { reportDir: '/tmp/nutrition-eval-report' },
    });
    expect(deps.writeReport).toHaveBeenCalledTimes(1);
    expect(deps.writeReport.mock.calls[0]?.[0].summary.failuresByCategory).toEqual({ dataset: 1 });
  });

  it('writes a report then returns runner_failure for a per-case runner failure result', async () => {
    const deps = makeLiveDeps();
    const runNutritionEval = vi.fn(async () => [
      scoreNutritionCase(evalCase, {
        parseStatus: 'failure', source: 'meal', decision: 'error',
        failureCategory: 'runner', failureCode: 'cache_read_failed',
      }),
    ]);

    const result = await runNutritionEvalCli(
      ['baseline'],
      liveEnv,
      { ...deps, runNutritionEval },
    );

    expect(result).toMatchObject({
      exitCode: 1, failureCode: 'runner_failure',
      reportPaths: { reportDir: '/tmp/nutrition-eval-report' },
    });
    expect(deps.writeReport).toHaveBeenCalledTimes(1);
    expect(deps.writeReport.mock.calls[0]?.[0].summary.failuresByCategory).toEqual({ runner: 1 });
  });

  it.each([
    ['dataset', 'dataset_checksum_mismatch'],
    ['runner', 'cache_read_failed'],
  ])('classifies release %s failures before safety and threshold checks', async (category, failureCode) => {
    const deps = makeLiveDeps();
    const runNutritionEval = vi.fn(async () => [
      scoreNutritionCase(evalCase, {
        parseStatus: 'failure', source: 'meal', decision: 'error',
        failureCategory: category as 'dataset' | 'runner', failureCode,
      }),
    ]);

    const result = await runNutritionEvalCli(
      ['release', '--min-parse-rate', '1'],
      liveEnv,
      { ...deps, runNutritionEval },
    );

    expect(result).toMatchObject({ exitCode: 1, failureCode: `${category}_failure` });
    expect(deps.writeReport).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['parse failure', providerFailure],
    ['unsafe completion', {
      parseStatus: 'success', source: 'meal', kcal: 300, proteinG: 1, carbsG: 2, fatG: 3,
      confidence: 1, decision: 'complete',
    } satisfies NutritionPrediction],
  ])('makes release fail and still write its report for every %s', async (_label, prediction) => {
    const deps = makeLiveDeps(prediction);

    const result = await runNutritionEvalCli(['release'], liveEnv, deps);

    expect(result).toMatchObject({ exitCode: 1, failureCode: 'safety_violation' });
    expect(deps.writeReport).toHaveBeenCalledTimes(1);
  });

  it('fails release with threshold_violation when an explicit valid parse-rate threshold is breached', async () => {
    const deps = makeLiveDeps();

    const result = await runNutritionEvalCli(
      ['release', '--min-parse-rate', '1'],
      liveEnv,
      deps,
    );

    expect(result).toMatchObject({ exitCode: 1, failureCode: 'threshold_violation' });
    expect(deps.writeReport).toHaveBeenCalledTimes(1);
  });

  it.each(['Infinity', 'NaN', '-0.01', '1.01'])(
    'rejects nonfinite or out-of-range explicit parse-rate threshold %s before live work',
    async (threshold) => {
      const deps = makeLiveDeps();

      const result = await runNutritionEvalCli(
        ['release', '--min-parse-rate', threshold],
        liveEnv,
        deps,
      );

      expect(result).toMatchObject({ exitCode: 1, failureCode: 'threshold_violation' });
      expect(deps.loadManifest).not.toHaveBeenCalled();
      expect(deps.createLiveAdapter).not.toHaveBeenCalled();
    },
  );

  it('runs fixtures successfully without live opt-in, adapter construction, image loading, or report writing', async () => {
    const createLiveAdapter = vi.fn();
    const loadManifest = vi.fn();
    const loadImage = vi.fn();
    const writeReport = vi.fn();

    const result = await runNutritionEvalCli(
      ['fixtures'],
      {},
      { createLiveAdapter, loadManifest, loadImage, writeReport },
    );

    expect(result).toMatchObject({ exitCode: 0 });
    expect(createLiveAdapter).not.toHaveBeenCalled();
    expect(loadManifest).not.toHaveBeenCalled();
    expect(loadImage).not.toHaveBeenCalled();
    expect(writeReport).not.toHaveBeenCalled();
  });

  it('keeps an absent private overlay public-only', async () => {
    const deps = makeLiveDeps();
    const loadPrivateOverlay = vi.fn();

    const result = await runNutritionEvalCli(['baseline'], liveEnv, { ...deps, loadPrivateOverlay });

    expect(result).toMatchObject({ exitCode: 0 });
    expect(loadPrivateOverlay).not.toHaveBeenCalled();
    expect(deps.adapter.analyzeCase).toHaveBeenCalledWith(evalCase, expect.any(Uint8Array), { sampleIndex: 1 });
  });

  it.each([
    ['missing flag value', ['baseline', '--private-manifest'], 'invalid_command'],
    ['duplicate flag', ['baseline', '--private-manifest', 'one.json', '--private-manifest', 'two.json'], 'invalid_command'],
  ])('rejects a %s before any live work', async (_label, argv, failureCode) => {
    const deps = makeLiveDeps();
    const loadPrivateOverlay = vi.fn();

    const result = await runNutritionEvalCli(argv, liveEnv, { ...deps, loadPrivateOverlay });

    expect(result).toMatchObject({ exitCode: 1, failureCode });
    expect(loadPrivateOverlay).not.toHaveBeenCalled();
    expect(deps.loadManifest).not.toHaveBeenCalled();
    expect(deps.createLiveAdapter).not.toHaveBeenCalled();
  });

  it.each([
    ['flag', ['baseline', '--private-manifest', 'missing-overlay.json'], liveEnv, 'missing-overlay.json'],
    ['environment', ['baseline'], { ...liveEnv, CALORIX_NUTRITION_EVAL_PRIVATE_MANIFEST: 'missing-overlay.json' }, 'missing-overlay.json'],
  ])('returns private_case_unavailable for a requested missing overlay from %s before adapter construction', async (_source, argv, env, requestedPath) => {
    const deps = makeLiveDeps();
    const loadPrivateOverlay = vi.fn(async () => {
      throw new Error('private overlay is unavailable');
    });

    const result = await runNutritionEvalCli(argv, env, { ...deps, loadPrivateOverlay });

    expect(result).toMatchObject({ exitCode: 1, failureCode: 'private_case_unavailable' });
    expect(loadPrivateOverlay).toHaveBeenCalledWith(requestedPath);
    expect(deps.createLiveAdapter).not.toHaveBeenCalled();
    expect(deps.loadImage).not.toHaveBeenCalled();
    expect(deps.writeReport).not.toHaveBeenCalled();
  });

  it('prefers a trimmed private-manifest flag over the environment fallback', async () => {
    const deps = makeLiveDeps();
    const loadPrivateOverlay = vi.fn(async () => {
      throw new Error('private overlay is unavailable');
    });

    const result = await runNutritionEvalCli(
      ['baseline', '--private-manifest', '  from-flag.json  '],
      { ...liveEnv, CALORIX_NUTRITION_EVAL_PRIVATE_MANIFEST: 'from-environment.json' },
      { ...deps, loadPrivateOverlay },
    );

    expect(result).toMatchObject({ exitCode: 1, failureCode: 'private_case_unavailable' });
    expect(loadPrivateOverlay).toHaveBeenCalledWith('from-flag.json');
    expect(deps.createLiveAdapter).not.toHaveBeenCalled();
  });

  it('loads a valid overlay before hashing and runner work, then passes only its canonical root to private image loading', async () => {
    const deps = makeLiveDeps();
    const canonicalPrivateRoot = '/private-overlay-root';
    const privateManifest = {
      version: 1 as const,
      datasetId: 'private-overlay-dataset',
      cases: [privateEvalCase],
    };
    const mergedManifest = {
      version: 1 as const,
      datasetId: 'cli-test-dataset',
      cases: [evalCase, privateEvalCase],
    };
    const loadPrivateOverlay = vi.fn(async () => {
      deps.events.push('overlay');
      return { root: canonicalPrivateRoot, manifest: privateManifest };
    });
    const loadImage = vi.fn(async () => new Uint8Array([1]));
    const runNutritionEval = vi.fn(async (
      cases: readonly NutritionEvalCase[],
      runtime: { loadImage: (testCase: NutritionEvalCase) => Promise<Uint8Array> },
    ) => {
      deps.events.push('runner');
      await runtime.loadImage(privateEvalCase);
      return cases.map((testCase) => scoreNutritionCase(testCase, providerFailure));
    });

    const result = await runNutritionEvalCli(
      ['baseline', '--private-manifest', 'requested-overlay.json'],
      liveEnv,
      { ...deps, loadPrivateOverlay, loadImage, runNutritionEval },
    );

    expect(result).toMatchObject({ exitCode: 0 });
    expect(loadPrivateOverlay).toHaveBeenCalledWith('requested-overlay.json');
    expect(deps.events.indexOf('overlay')).toBeLessThan(deps.events.indexOf('adapter'));
    expect(deps.events.indexOf('overlay')).toBeLessThan(deps.events.indexOf('runner'));
    expect(runNutritionEval.mock.calls[0]?.[0].map((testCase) => testCase.id))
      .toEqual(['cli-case', 'private-cli-case']);
    expect(runNutritionEval.mock.calls[0]?.[2]).toMatchObject({ datasetId: 'cli-test-dataset' });
    expect(loadImage).toHaveBeenCalledWith(privateEvalCase, { privateRoot: canonicalPrivateRoot });
    const writtenReport = deps.writeReport.mock.calls[0]?.[0];
    if (!writtenReport) throw new Error('valid overlay did not produce a report');
    expect(writtenReport.datasetHash).toBe(hashNutritionEvalManifest(mergedManifest));
    expect(JSON.stringify(writtenReport)).not.toContain(canonicalPrivateRoot);
    expect(JSON.stringify(writtenReport)).not.toContain('asset.png');
    expect(JSON.stringify(writtenReport)).not.toContain('requested-overlay.json');
    expect(JSON.stringify(result)).not.toContain(canonicalPrivateRoot);
    expect(JSON.stringify(result)).not.toContain('asset.png');
    expect(JSON.stringify(result)).not.toContain('requested-overlay.json');
  });

  it('sanitizes an invalid requested overlay before any adapter, model, report, or result serialization work', async () => {
    const deps = makeLiveDeps();
    const privateRoot = '/do-not-report-private-overlay';
    const loadPrivateOverlay = vi.fn(async () => {
      throw new Error(`invalid overlay at ${privateRoot}`);
    });

    const result = await runNutritionEvalCli(
      ['baseline', '--private-manifest', 'invalid-overlay.json'],
      liveEnv,
      { ...deps, loadPrivateOverlay },
    );

    expect(result).toMatchObject({ exitCode: 1, failureCode: 'private_case_unavailable' });
    expect(JSON.stringify(result)).not.toContain(privateRoot);
    expect(deps.createLiveAdapter).not.toHaveBeenCalled();
    expect(deps.writeReport).not.toHaveBeenCalled();
  });

  it('resolves manifest, cache, and report roots from either source or compiled module locations', () => {
    const expected = {
      repoRoot: '/repo',
      manifestPath: '/repo/functions/eval/nutrition/public-manifest.json',
      cacheRoot: '/repo/.nutrition-eval/cache',
      reportsRoot: '/repo/.nutrition-eval/reports',
    };
    expect(resolveNutritionEvalRuntimePaths('/repo/functions/src/nutrition-eval')).toEqual(expected);
    expect(resolveNutritionEvalRuntimePaths('/repo/functions/lib/nutrition-eval')).toEqual(expected);
  });

  it('passes validated samples and code-SHA flags into the runner and report and returns report paths', async () => {
    const deps = makeLiveDeps();
    const runNutritionEval = vi.fn(async () => [scoreNutritionCase(evalCase, providerFailure)]);

    const result = await runNutritionEvalCli(
      ['baseline', '--samples', '2', '--code-sha', 'a'.repeat(40), '--out-dir', '/tmp/out'],
      liveEnv,
      { ...deps, runNutritionEval },
    );

    expect(result).toMatchObject({
      exitCode: 0,
      reportPaths: {
        reportDir: '/tmp/nutrition-eval-report',
        jsonPath: '/tmp/nutrition-eval-report/report.json',
        markdownPath: '/tmp/nutrition-eval-report/report.md',
      },
    });
    expect(runNutritionEval.mock.calls[0]?.[2]).toMatchObject({ samples: 2, codeSha: 'a'.repeat(40) });
    expect(deps.writeReport.mock.calls[0]?.[0]).toMatchObject({ samples: 2, codeSha: 'a'.repeat(40) });
    expect(deps.writeReport.mock.calls[0]?.[1]).toBe('/tmp/out');
  });

  it('uses explicit samples, code-SHA, and output-directory environment fallbacks', async () => {
    const deps = makeLiveDeps();
    const runNutritionEval = vi.fn(async () => [scoreNutritionCase(evalCase, providerFailure)]);
    const result = await runNutritionEvalCli(['baseline'], {
      ...liveEnv,
      CALORIX_NUTRITION_EVAL_SAMPLES: '3',
      CALORIX_NUTRITION_EVAL_CODE_SHA: 'b'.repeat(40),
      CALORIX_NUTRITION_EVAL_OUTPUT_DIR: '/tmp/from-env',
    }, { ...deps, getCodeSha: undefined, runNutritionEval });

    expect(result).toMatchObject({ exitCode: 0 });
    expect(runNutritionEval.mock.calls[0]?.[2]).toMatchObject({ samples: 3, codeSha: 'b'.repeat(40) });
    expect(deps.writeReport.mock.calls[0]?.[1]).toBe('/tmp/from-env');
  });

  it('resolves relative output directories against repo root while retaining absolute output directories', async () => {
    const paths = resolveNutritionEvalRuntimePaths();
    expect(resolveNutritionEvalOutputDir(new Date('2026-09-01T12:00:00.000Z'), 'relative/reports', paths))
      .toBe(resolve(paths.repoRoot, 'relative/reports'));
    expect(resolveNutritionEvalOutputDir(new Date('2026-09-01T12:00:00.000Z'), '/tmp/absolute-reports', paths))
      .toBe('/tmp/absolute-reports');

    const deps = makeLiveDeps();
    const result = await runNutritionEvalCli(['baseline'], liveEnv, {
      ...deps,
      outputDir: 'relative/from-deps',
    });

    expect(result).toMatchObject({ exitCode: 0 });
    expect(deps.writeReport.mock.calls[0]?.[1]).toBe(resolve(paths.repoRoot, 'relative/from-deps'));
  });

  it.each([
    ['flag', ['baseline', '--out-dir', 'relative/from-flag']],
    ['environment', ['baseline']],
  ])('resolves relative output directory from %s against repo root', async (_source, argv) => {
    const paths = resolveNutritionEvalRuntimePaths();
    const deps = makeLiveDeps();
    const env = argv.length > 1
      ? liveEnv
      : { ...liveEnv, CALORIX_NUTRITION_EVAL_OUTPUT_DIR: 'relative/from-env' };

    const result = await runNutritionEvalCli(argv, env, deps);

    expect(result).toMatchObject({ exitCode: 0 });
    expect(deps.writeReport.mock.calls[0]?.[1]).toBe(resolve(
      paths.repoRoot,
      argv.length > 1 ? 'relative/from-flag' : 'relative/from-env',
    ));
  });

  it.each([
    ['unknown flag', ['baseline', '--unknown', 'x'], 'invalid_command'],
    ['missing flag value', ['baseline', '--samples'], 'invalid_command'],
    ['duplicate flag', ['baseline', '--samples', '1', '--samples', '2'], 'invalid_command'],
    ['invalid sample count', ['baseline', '--samples', '0'], 'threshold_violation'],
    ['fractional sample count', ['baseline', '--samples', '1.5'], 'threshold_violation'],
    ['invalid max relative calorie threshold', ['release', '--max-median-relative-kcal', '-1'], 'threshold_violation'],
    ['fractional max count', ['release', '--max-unsafe-count', '1.5'], 'threshold_violation'],
  ])('rejects %s before live work', async (_label, argv, failureCode) => {
    const deps = makeLiveDeps();
    const result = await runNutritionEvalCli(argv, liveEnv, deps);

    expect(result).toMatchObject({ exitCode: 1, failureCode });
    expect(deps.loadManifest).not.toHaveBeenCalled();
    expect(deps.createLiveAdapter).not.toHaveBeenCalled();
  });

  it.each([
    '--max-median-relative-kcal',
    '--max-p90-relative-kcal',
    '--max-mean-macro-relative-error',
    '--max-unsafe-count',
    '--max-catastrophic-count',
  ])('fails release after writing a report when %s is exceeded', async (flag) => {
    const relativePrediction: NutritionPrediction = {
      parseStatus: 'success', source: 'meal', kcal: 190, proteinG: 2, carbsG: 4, fatG: 6,
      confidence: 0.2, decision: 'needs_review',
    };
    const countPrediction: NutritionPrediction = {
      parseStatus: 'success', source: 'meal', kcal: 300, proteinG: 2, carbsG: 4, fatG: 6,
      confidence: 1, decision: 'complete',
    };
    const deps = makeLiveDeps(flag.includes('count') ? countPrediction : relativePrediction);
    const value = flag.includes('count') ? '0' : '0.1';
    const result = await runNutritionEvalCli(['release', flag, value], liveEnv, deps);

    expect(result).toMatchObject({ exitCode: 1, failureCode: 'threshold_violation' });
    expect(deps.writeReport).toHaveBeenCalledTimes(1);
  });
});
