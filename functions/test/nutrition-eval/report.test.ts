import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fsPromises from 'fs/promises';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  return { ...actual, chmod: vi.fn(actual.chmod), rm: vi.fn(actual.rm) };
});

import {
  buildNutritionEvalReport,
  renderNutritionEvalJson,
  renderNutritionEvalMarkdown,
  writeNutritionEvalReport,
} from '../../src/nutrition-eval/report';
import { scoreNutritionCase } from '../../src/nutrition-eval/scorer';
import {
  BaselineComparisonSchema,
  NutritionEvalReportSchema,
  type NutritionEvalCase,
  type NutritionCaseResult,
  type NutritionEvalReport,
} from '../../src/nutrition-eval/schema';

const HISTORICAL_RUN_ID = 'run-2026-09-02T04-44-02-551Z';
const HISTORICAL_PROMPT_HASH = '294ea620c053db3687704a7b589c824776d138817b10c4d71f29abb734e6be49';
const CURRENT_PROMPT_HASH = '205b635a252e1f378023f5e1f3c670a6fba0ecfdfc8ce4f08f30efa24c544263';
const reportsRoot = resolve(process.cwd(), '..', '.nutrition-eval', 'reports');

interface BaselineComparison {
  baselineRunId: string;
  baselineTimestamp?: string;
  baselineCodeSha?: string;
  baselinePromptHash?: string;
  baselineModelId?: string;
  compatible: boolean;
  compatibilityReason?: string;
  compatibilityReasons: string[];
  deltas?: {
    parseRate: number;
    medianAbsoluteCalorieError: number;
    medianRelativeCalorieError: number;
    p90AbsoluteCalorieError: number;
    p90RelativeCalorieError: number;
    meanMacroRelativeError: number;
    reviewRate: number;
    catastrophicCount: number;
    unsafeCompletionCount: number;
  };
}

type LoadBaselineComparison = (
  reportRoot: string,
  runId: string,
  currentReport: NutritionEvalReport,
) => Promise<BaselineComparison>;

async function loadBaselineComparison(): Promise<LoadBaselineComparison> {
  const modulePath = '../../src/nutrition-eval/baseline-comparison';
  const loaded = await import(/* @vite-ignore */ modulePath) as {
    loadBaselineComparison?: unknown;
  };
  if (typeof loaded.loadBaselineComparison !== 'function') {
    throw new Error('loadBaselineComparison export is missing');
  }
  return loaded.loadBaselineComparison as LoadBaselineComparison;
}

async function readHistoricalReport(): Promise<{
  report: Record<string, unknown>;
  source: string;
}> {
  const source = await readFile(join(reportsRoot, HISTORICAL_RUN_ID, 'report.json'), 'utf8');
  const report: unknown = JSON.parse(source);
  if (report === null || typeof report !== 'object' || Array.isArray(report)) {
    throw new Error('historical fixture must be an object');
  }
  return { report: report as Record<string, unknown>, source };
}

function currentReportFromHistorical(
  historical: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
): NutritionEvalReport {
  return NutritionEvalReportSchema.parse({
    ...historical,
    publicCases: 20,
    privateCases: 0,
    ...overrides,
  });
}

const reportCase: NutritionEvalCase = {
  id: 'report-case',
  visibility: 'public',
  scanMode: 'meal',
  source: { dataset: 'test', objectId: 'report-case' },
  image: {
    url: 'https://example.com/report-case.png',
    sha256: 'b'.repeat(64),
    mediaType: 'image/png',
    width: 1,
    height: 1,
  },
  truth: { basis: 'portion', amount: 1, unit: 'portion', kcal: 100, proteinG: 1, carbsG: 2, fatG: 3 },
  toleranceClass: 'test',
  attributionId: 'test',
};

const metadata = {
  runId: 'run-20260901-001',
  timestamp: '2026-09-01T12:00:00.000Z',
  datasetId: 'calorix-nutrition-eval-v1',
  datasetHash: '1'.repeat(64),
  adapterModelId: 'gemini-test-model',
  promptHash: '2'.repeat(64),
  codeSha: '3'.repeat(40),
  samples: 1,
  baselineOnly: true,
  publicCases: 2,
  privateCases: 0,
};

function results(): NutritionCaseResult[] {
  return [
    scoreNutritionCase(reportCase, {
      parseStatus: 'success', source: 'meal', kcal: 110, proteinG: 1, carbsG: 2, fatG: 3,
      confidence: 0.9, decision: 'complete', latencyMs: 20,
    }),
    scoreNutritionCase({ ...reportCase, id: 'provider-failure' }, {
      parseStatus: 'failure', source: 'meal', decision: 'error',
      failureCategory: 'provider', failureCode: 'provider_request_failed', latencyMs: 10,
    }),
  ];
}

describe('nutrition evaluation reports', () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  it('renders deterministic JSON and Markdown with identity, case metrics, aggregate failure categories, and baseline-only status', () => {
    const report = buildNutritionEvalReport(results(), metadata);

    const json = renderNutritionEvalJson(report);
    const markdown = renderNutritionEvalMarkdown(report);

    expect(renderNutritionEvalJson(report)).toBe(json);
    expect(renderNutritionEvalMarkdown(report)).toBe(markdown);
    expect(JSON.parse(json)).toMatchObject({
      datasetHash: '1111111111111111111111111111111111111111111111111111111111111111',
      adapterModelId: 'gemini-test-model',
      promptHash: '2222222222222222222222222222222222222222222222222222222222222222',
      codeSha: '3333333333333333333333333333333333333333',
      baselineOnly: true,
      publicCases: 2,
      privateCases: 0,
      summary: { failuresByCode: { provider_request_failed: 1 } },
    });
    expect(markdown).toContain('run-20260901-001');
    expect(markdown).toContain('provider_request_failed');
    expect(markdown).toContain('baselineOnly: true');
    expect(markdown).toContain('medianAbsoluteCalorieError: 10');
    expect(markdown).toContain('p90RelativeCalorieError: 0.1');
    expect(markdown).toContain('failuresByCategory: provider=1');
    expect(markdown).toContain('| report-case | meal | success | 110 | 1 | 2 | 3 |');
    expect(markdown).toContain('| provider-failure | meal | failure | - | - | - | - |');
    expect(report.cases).toHaveLength(2);
    expect(report.summary.failuresByCategory).toEqual({ provider: 1 });
    expect(report.summary.latencyMs).toEqual({ min: 10, max: 20, median: 15, p90: 19 });
  });

  it.each([
    ['blank run ID', { runId: ' ' }],
    ['non-ISO timestamp', { timestamp: '2026-09-01' }],
    ['malformed dataset hash', { datasetHash: 'g'.repeat(64) }],
    ['malformed prompt hash', { promptHash: '2'.repeat(63) }],
    ['blank adapter model', { adapterModelId: '' }],
    ['blank dataset ID', { datasetId: ' ' }],
    ['blank adapter model whitespace', { adapterModelId: ' ' }],
    ['blank code SHA', { codeSha: ' ' }],
    ['zero samples', { samples: 0 }],
    ['eleven samples', { samples: 11 }],
    ['fractional samples', { samples: 1.5 }],
  ])('rejects report metadata with %s', (_label, invalid) => {
    expect(() => buildNutritionEvalReport(results(), { ...metadata, ...invalid })).toThrow();
  });

  it('rejects embedded paths, token-like strings, and stack-shaped diagnostics instead of emitting them', () => {
    const posixPathReport = buildNutritionEvalReport(results(), { ...metadata, runId: '/home/user/private-report.json' });
    const fileUrlReport = buildNutritionEvalReport(results(), { ...metadata, runId: 'file:///home/user/private-report.json' });
    const windowsPathReport = buildNutritionEvalReport(results(), { ...metadata, runId: 'C:\\Users\\private\\report.json' });
    const uncPathReport = buildNutritionEvalReport(results(), { ...metadata, runId: '\\\\server\\share\\report.json' });
    const tokenReport = buildNutritionEvalReport([
      scoreNutritionCase({ ...reportCase, id: 'token-case' }, {
        parseStatus: 'failure', source: 'meal', decision: 'error',
        failureCategory: 'provider', failureCode: 'Bearer secret-token',
      }),
    ], { ...metadata, publicCases: 1 });
    const stackReport = buildNutritionEvalReport([
      scoreNutritionCase({ ...reportCase, id: 'Error: boom\n    at private.ts:42:7' }, {
        parseStatus: 'success', source: 'meal', kcal: 100, proteinG: 1, carbsG: 2, fatG: 3,
        confidence: 0.9, decision: 'complete',
      }),
    ], { ...metadata, publicCases: 1 });

    const embeddedPathReport = buildNutritionEvalReport(results(), { ...metadata, runId: 'note path=/tmp/private-report.json' });
    const slashPathReport = buildNutritionEvalReport(results(), { ...metadata, runId: 'note /var/private/report.json' });
    const windowsSlashReport = buildNutritionEvalReport(results(), { ...metadata, runId: 'C:/Users/private/report.json' });
    const assignmentReports = ['token=redacted', 'api-key: redacted', 'secret = redacted', 'sk-test1', 'aaa.bbb.ccc']
      .map((failureCode) => buildNutritionEvalReport([
        scoreNutritionCase({ ...reportCase, id: `private-${failureCode}` }, {
          parseStatus: 'failure', source: 'meal', decision: 'error', failureCategory: 'provider', failureCode,
        }),
      ], { ...metadata, publicCases: 1 }));

    for (const tainted of [
      posixPathReport, fileUrlReport, windowsPathReport, uncPathReport, embeddedPathReport,
      slashPathReport, windowsSlashReport, tokenReport, stackReport, ...assignmentReports,
    ]) {
      expect(() => renderNutritionEvalJson(tainted)).toThrow(/privacy_leak/);
      expect(() => renderNutritionEvalMarkdown(tainted)).toThrow(/privacy_leak/);
    }
  });

  it('rejects colon-prefixed absolute paths and file URLs in serializable strings', () => {
    const taintedValues = [
      'path:/tmp/secret.txt',
      'path:file:///tmp/secret.txt',
      'path:C:\\Users\\private\\report.json',
      'path= C:\\Users\\private\\report.json',
      'path:\\\\server\\share\\private-report.json',
      'path=\\\\server\\share\\private-report.json',
    ];

    for (const value of taintedValues) {
      const report = buildNutritionEvalReport([
        scoreNutritionCase({ ...reportCase, id: `tainted-${taintedValues.indexOf(value)}` }, {
          parseStatus: 'failure', source: 'meal', decision: 'error',
          failureCategory: 'provider', failureCode: value,
        }),
      ], { ...metadata, publicCases: 1 });
      expect(() => renderNutritionEvalJson(report), value).toThrow(/privacy_leak/);
      expect(() => renderNutritionEvalMarkdown(report), value).toThrow(/privacy_leak/);
    }
  });

  it('does not mistake a model identifier, MIME value, timestamp, or hash for a privacy leak', () => {
    const report = buildNutritionEvalReport([
      scoreNutritionCase(reportCase, {
        parseStatus: 'failure', source: 'meal', decision: 'error',
        failureCategory: 'schema', failureCode: 'image/png',
      }),
    ], {
      ...metadata,
      publicCases: 1,
      adapterModelId: 'google/gemini-2.5-flash',
    });

    expect(() => renderNutritionEvalJson(report)).not.toThrow();
    expect(() => renderNutritionEvalMarkdown(report)).not.toThrow();
    expect(JSON.parse(renderNutritionEvalJson(report))).toMatchObject({
      adapterModelId: 'google/gemini-2.5-flash',
      timestamp: '2026-09-01T12:00:00.000Z',
      datasetHash: '1'.repeat(64),
      promptHash: '2'.repeat(64),
      summary: { failuresByCode: { 'image/png': 1 } },
    });
  });

  it('serializes explicit public/private coverage and baseline provenance without claiming private Vitamin coverage', () => {
    const report = buildNutritionEvalReport(results(), {
      ...metadata,
      publicCases: 2,
      privateCases: 0,
      comparison: {
        baselineRunId: HISTORICAL_RUN_ID,
        baselineTimestamp: '2026-09-02T04:44:02.551Z',
        baselineCodeSha: '0cf3b1295d121be7f137f36c16c0447f1970d88f',
        baselinePromptHash: HISTORICAL_PROMPT_HASH,
        baselineModelId: 'gemini-2.5-flash',
        compatible: false,
        compatibilityReason: 'prompt_hash_mismatch',
        compatibilityReasons: ['prompt_hash_mismatch', 'model_mismatch'],
      },
    });

    const json = renderNutritionEvalJson(report);
    const markdown = renderNutritionEvalMarkdown(report);

    expect(JSON.parse(json)).toMatchObject({
      publicCases: 2,
      privateCases: 0,
      comparison: {
        baselineRunId: HISTORICAL_RUN_ID,
        baselineTimestamp: '2026-09-02T04:44:02.551Z',
        baselineCodeSha: '0cf3b1295d121be7f137f36c16c0447f1970d88f',
        baselinePromptHash: HISTORICAL_PROMPT_HASH,
        baselineModelId: 'gemini-2.5-flash',
        compatible: false,
        compatibilityReasons: ['prompt_hash_mismatch', 'model_mismatch'],
      },
    });
    expect(markdown).toContain('Public cases: 2');
    expect(markdown).toContain('Private cases: 0');
    expect(markdown).toContain(`Baseline run: ${HISTORICAL_RUN_ID}`);
    expect(markdown).toContain('Baseline compatibility: incompatible');
    expect(markdown).toContain('prompt_hash_mismatch');
    expect(markdown).not.toContain('Vitamin Well coverage complete');
    expect(markdown).not.toContain('## Baseline metric deltas');
  });

  it.each([
    ['token-shaped metadata', {
      baselineRunId: HISTORICAL_RUN_ID,
      baselineCodeSha: 'token=synthetic-redacted-value',
    }],
    ['path-shaped metadata', { baselineRunId: '/private/baseline' }],
  ])('applies report privacy checks to comparison provenance with fake %s', (_label, provenance) => {
    const report = buildNutritionEvalReport(results(), {
      ...metadata,
      publicCases: 2,
      privateCases: 0,
      comparison: {
        ...provenance,
        compatible: false,
        compatibilityReason: 'prompt_hash_mismatch',
        compatibilityReasons: ['prompt_hash_mismatch'],
      },
    });

    expect(() => renderNutritionEvalJson(report)).toThrow(/privacy_leak/);
    expect(() => renderNutritionEvalMarkdown(report)).toThrow(/privacy_leak/);
  });

  it('serializes and renders every approved compatible metric delta including parse rate', () => {
    const deltas = {
      parseRate: 0.05,
      medianAbsoluteCalorieError: -1,
      medianRelativeCalorieError: -0.01,
      p90AbsoluteCalorieError: -2,
      p90RelativeCalorieError: -0.02,
      meanMacroRelativeError: -0.03,
      reviewRate: 0.04,
      catastrophicCount: -1,
      unsafeCompletionCount: 0,
    };
    const report = buildNutritionEvalReport(results(), {
      ...metadata,
      comparison: {
        baselineRunId: HISTORICAL_RUN_ID,
        compatible: true,
        compatibilityReasons: [],
        deltas,
      },
    });

    expect(JSON.parse(renderNutritionEvalJson(report))).toMatchObject({
      comparison: { compatible: true, compatibilityReasons: [], deltas },
    });
    const markdown = renderNutritionEvalMarkdown(report);
    expect(markdown).toContain('## Baseline metric deltas');
    for (const [metric, delta] of Object.entries(deltas)) {
      expect(markdown).toContain(`${metric}: ${delta}`);
    }
  });

  it.each([
    ['compatible complete', {
      baselineRunId: HISTORICAL_RUN_ID,
      compatible: true,
      compatibilityReasons: [],
      deltas: {
        parseRate: 0,
        medianAbsoluteCalorieError: 0,
        medianRelativeCalorieError: 0,
        p90AbsoluteCalorieError: 0,
        p90RelativeCalorieError: 0,
        meanMacroRelativeError: 0,
        reviewRate: 0,
        catastrophicCount: 0,
        unsafeCompletionCount: 0,
      },
    }, true],
    ['compatible missing delta', {
      baselineRunId: HISTORICAL_RUN_ID,
      compatible: true,
      compatibilityReasons: [],
      deltas: {},
    }, false],
    ['compatible with reason', {
      baselineRunId: HISTORICAL_RUN_ID,
      compatible: true,
      compatibilityReasons: ['model_mismatch'],
    }, false],
    ['incompatible with deltas', {
      baselineRunId: HISTORICAL_RUN_ID,
      compatible: false,
      compatibilityReasons: ['model_mismatch'],
      deltas: {
        parseRate: 0,
        medianAbsoluteCalorieError: 0,
        medianRelativeCalorieError: 0,
        p90AbsoluteCalorieError: 0,
        p90RelativeCalorieError: 0,
        meanMacroRelativeError: 0,
        reviewRate: 0,
        catastrophicCount: 0,
        unsafeCompletionCount: 0,
      },
    }, false],
    ['incompatible with unordered reason', {
      baselineRunId: HISTORICAL_RUN_ID,
      compatible: false,
      compatibilityReasons: ['model_mismatch', 'prompt_hash_mismatch'],
    }, false],
    ['incompatible with mismatched primary reason', {
      baselineRunId: HISTORICAL_RUN_ID,
      compatible: false,
      compatibilityReason: 'model_mismatch',
      compatibilityReasons: ['prompt_hash_mismatch', 'model_mismatch'],
    }, false],
  ])('enforces baseline comparison schema invariants: %s', (_label, comparison, expected) => {
    expect(BaselineComparisonSchema.safeParse(comparison).success).toBe(expected);
  });

  it('enforces report count invariants across cases, visibility coverage, samples, and parse count', async () => {
    const { report } = await readHistoricalReport();
    const exactHistorical = currentReportFromHistorical(report);
    const variants: Array<[string, unknown, boolean]> = [
      ['exact enriched historical report', exactHistorical, true],
      ['summary total not equal to cases', {
        ...exactHistorical,
        summary: { ...exactHistorical.summary, totalCases: exactHistorical.cases.length - 1 },
      }, false],
      ['summary run count not equal to cases', {
        ...exactHistorical,
        summary: { ...exactHistorical.summary, runCases: exactHistorical.cases.length - 1 },
      }, false],
      ['public and private coverage not equal to samples times cases', {
        ...exactHistorical,
        publicCases: exactHistorical.publicCases - 1,
      }, false],
      ['parse count greater than run count', {
        ...exactHistorical,
        summary: { ...exactHistorical.summary, parseCases: exactHistorical.summary.runCases + 1 },
      }, false],
    ];

    for (const [_label, candidate, expected] of variants) {
      expect(NutritionEvalReportSchema.safeParse(candidate).success).toBe(expected);
    }
  });

  it('loads the historical v1 report without rewriting it and derives 20 public and 0 private cases in memory', async () => {
    const load = await loadBaselineComparison();
    const { report, source } = await readHistoricalReport();
    const current = currentReportFromHistorical(report);

    const comparison = await load(reportsRoot, HISTORICAL_RUN_ID, current);

    expect(comparison).toMatchObject({
      baselineRunId: HISTORICAL_RUN_ID,
      baselineTimestamp: '2026-09-02T04:44:02.551Z',
      baselineCodeSha: '0cf3b1295d121be7f137f36c16c0447f1970d88f',
      baselinePromptHash: HISTORICAL_PROMPT_HASH,
      baselineModelId: 'gemini-2.5-flash',
      compatible: true,
      compatibilityReasons: [],
    });
    expect(await readFile(join(reportsRoot, HISTORICAL_RUN_ID, 'report.json'), 'utf8')).toBe(source);
  });

  it.each([
    ['path traversal', '../run-2026-09-02T04-44-02-551Z', 'path_traversal_detected'],
    ['missing run', 'run-does-not-exist', 'baseline_not_found'],
  ])('rejects %s with a stable path-safe baseline error', async (_label, runId, code) => {
    const load = await loadBaselineComparison();
    const { report } = await readHistoricalReport();
    const current = currentReportFromHistorical(report);

    await expect(load(reportsRoot, runId, current)).rejects.toMatchObject({ code });
  });

  it('rejects a malformed baseline report with a stable error before comparison', async () => {
    const load = await loadBaselineComparison();
    const parent = await mkdtemp(join(tmpdir(), 'nutrition-eval-baseline-'));
    directories.push(parent);
    const malformedRoot = join(parent, 'reports');
    const runDir = join(malformedRoot, HISTORICAL_RUN_ID);
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, 'report.json'), '{"version":1,"promptHash":"not-a-hash"}');
    const { report } = await readHistoricalReport();
    const current = currentReportFromHistorical(report);

    await expect(load(malformedRoot, HISTORICAL_RUN_ID, current)).rejects.toMatchObject({
      code: 'malformed_baseline',
    });
  });

  it.each([
    ['embedded run mismatch', HISTORICAL_RUN_ID, (report: Record<string, unknown>) => ({ ...report, runId: 'run-other' })],
    ['count-less nonhistorical run', 'run-other', (report: Record<string, unknown>) => ({ ...report, runId: 'run-other' })],
    ['null case', HISTORICAL_RUN_ID, (report: Record<string, unknown>) => ({ ...report, cases: report.cases.map(() => null) })],
  ])('rejects an invalid historical baseline shape: %s', async (_label, requestedRunId, mutate) => {
    const load = await loadBaselineComparison();
    const parent = await mkdtemp(join(tmpdir(), 'nutrition-eval-baseline-'));
    directories.push(parent);
    const root = join(parent, 'reports');
    const runDir = join(root, requestedRunId);
    await mkdir(runDir, { recursive: true });
    const { report } = await readHistoricalReport();
    await writeFile(join(runDir, 'report.json'), JSON.stringify(mutate(report)));

    await expect(load(root, requestedRunId, currentReportFromHistorical(report))).rejects.toMatchObject({
      code: 'malformed_baseline',
    });
  });

  it('rejects a symlinked baseline report rather than reading outside the report root', async () => {
    const load = await loadBaselineComparison();
    const parent = await mkdtemp(join(tmpdir(), 'nutrition-eval-baseline-'));
    directories.push(parent);
    const root = join(parent, 'reports');
    const runDir = join(root, HISTORICAL_RUN_ID);
    const outside = join(parent, 'outside.json');
    const { report } = await readHistoricalReport();
    await mkdir(runDir, { recursive: true });
    await writeFile(outside, JSON.stringify(report));
    await symlink(outside, join(runDir, 'report.json'));

    await expect(load(root, HISTORICAL_RUN_ID, currentReportFromHistorical(report))).rejects.toMatchObject({
      code: 'path_traversal_detected',
    });
  });

  it('rejects an inconsistent already-counted baseline as malformed', async () => {
    const load = await loadBaselineComparison();
    const parent = await mkdtemp(join(tmpdir(), 'nutrition-eval-baseline-'));
    directories.push(parent);
    const root = join(parent, 'reports');
    const runDir = join(root, HISTORICAL_RUN_ID);
    const { report } = await readHistoricalReport();
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, 'report.json'), JSON.stringify({
      ...report,
      publicCases: 20,
      privateCases: 0,
      summary: { ...report.summary, totalCases: 19 },
    }));

    await expect(load(root, HISTORICAL_RUN_ID, currentReportFromHistorical(report))).rejects.toMatchObject({
      code: 'malformed_baseline',
    });
  });

  it('sanitizes an unexpected filesystem code while loading a baseline', async () => {
    const load = await loadBaselineComparison();
    const { report } = await readHistoricalReport();
    const accessFailure = Object.assign(new Error('EACCES /private/nutrition-eval/report.json'), {
      code: 'EACCES',
    });
    const lstatSpy = vi.spyOn(fsPromises, 'lstat').mockRejectedValueOnce(accessFailure);
    try {
      await expect(load(reportsRoot, HISTORICAL_RUN_ID, currentReportFromHistorical(report))).rejects.toMatchObject({
        code: 'baseline_not_found',
      });
    } finally {
      lstatSpy.mockRestore();
    }
  });

  it('returns compatible zero deltas for a self-comparison and computes current minus baseline deltas', async () => {
    const load = await loadBaselineComparison();
    const { report } = await readHistoricalReport();
    const current = currentReportFromHistorical(report);

    const selfComparison = await load(reportsRoot, HISTORICAL_RUN_ID, current);
    expect(selfComparison).toMatchObject({
      compatible: true,
      compatibilityReasons: [],
      deltas: {
        parseRate: 0,
        medianAbsoluteCalorieError: 0,
        medianRelativeCalorieError: 0,
        p90AbsoluteCalorieError: 0,
        p90RelativeCalorieError: 0,
        meanMacroRelativeError: 0,
        reviewRate: 0,
        catastrophicCount: 0,
        unsafeCompletionCount: 0,
      },
    });

    const improved = currentReportFromHistorical(report, {
      summary: {
        ...current.summary,
        medianAbsoluteCalorieError: current.summary.medianAbsoluteCalorieError - 10,
      },
    });
    const directional = await load(reportsRoot, HISTORICAL_RUN_ID, improved);
    expect(directional.deltas?.medianAbsoluteCalorieError).toBe(-10);
  });

  it('fails closed for the real current prompt hash against the historical baseline and omits deltas', async () => {
    const load = await loadBaselineComparison();
    const { report } = await readHistoricalReport();
    expect(report.promptHash).toBe(HISTORICAL_PROMPT_HASH);
    const current = currentReportFromHistorical(report, {
      promptHash: CURRENT_PROMPT_HASH,
    });

    const comparison = await load(reportsRoot, HISTORICAL_RUN_ID, current);

    expect(comparison).toMatchObject({
      compatible: false,
      compatibilityReason: 'prompt_hash_mismatch',
      compatibilityReasons: ['prompt_hash_mismatch'],
    });
    expect(comparison.deltas).toBeUndefined();
  });

  it('reports all compatibility mismatches in deterministic precedence order', async () => {
    const load = await loadBaselineComparison();
    const { report } = await readHistoricalReport();
    const baselineCurrent = currentReportFromHistorical(report);
    const current = currentReportFromHistorical(report, {
      datasetId: 'calorix-public-v2',
      datasetHash: 'f'.repeat(64),
      promptHash: CURRENT_PROMPT_HASH,
      adapterModelId: 'gemini-current-model',
      samples: 2,
      publicCases: 9,
      privateCases: 2,
      summary: {
        ...baselineCurrent.summary,
        totalCases: 22,
        runCases: 22,
      },
      cases: [...baselineCurrent.cases, baselineCurrent.cases[0]!, baselineCurrent.cases[1]!],
    });

    const comparison = await load(reportsRoot, HISTORICAL_RUN_ID, current);

    expect(comparison.compatibilityReasons).toEqual([
      'dataset_id_mismatch',
      'dataset_hash_mismatch',
      'case_count_mismatch',
      'public_cases_mismatch',
      'private_coverage_unsupported',
      'samples_mismatch',
      'prompt_hash_mismatch',
      'model_mismatch',
    ]);
    expect(comparison.compatibilityReason).toBe('dataset_id_mismatch');
    expect(comparison.deltas).toBeUndefined();
  });

  it('includes all per-case numeric error and boolean match fields in stable Markdown columns', () => {
    const detailedCase: NutritionEvalCase = {
      ...reportCase,
      id: 'detailed-case',
      expectedBarcode: '12345678',
    };
    const report = buildNutritionEvalReport([
      scoreNutritionCase(detailedCase, {
        parseStatus: 'success', source: 'meal', kcal: 110, proteinG: 2, carbsG: 4, fatG: 6,
        confidence: 0.9, basis: 'portion', amount: 1, unit: 'portion', barcode: '12345678', decision: 'complete',
      }),
    ], { ...metadata, publicCases: 1 });
    const markdown = renderNutritionEvalMarkdown(report);

    expect(markdown).toContain('kcalRatioToTruth | kcalAbsoluteError | kcalRelativeError');
    expect(markdown).toContain('proteinGRatioToTruth | proteinGAbsoluteError | proteinGRelativeError');
    expect(markdown).toContain('carbsGRatioToTruth | carbsGAbsoluteError | carbsGRelativeError');
    expect(markdown).toContain('fatGRatioToTruth | fatGAbsoluteError | fatGRelativeError');
    expect(markdown).toContain('barcodeExactMatch | basisExactMatch | unitExactMatch');
    expect(markdown).toContain(
      '| detailed-case | meal | success | 110 | 2 | 4 | 6 | portion | 1 | portion | 12345678 | complete | - | - | false | false | 1.1 | 10 | 0.1 | 2 | 1 | 1 | 2 | 2 | 1 | 2 | 3 | 1 | true | true | true |',
    );
  });

  it('escapes Markdown table cells and keeps string values on one physical row', () => {
    const report = buildNutritionEvalReport([
      scoreNutritionCase({ ...reportCase, id: 'case|id\nnext' }, {
        parseStatus: 'failure', source: 'meal', decision: 'error',
        failureCategory: 'provider', failureCode: 'bad|code\r\nnext',
      }),
    ], { ...metadata, publicCases: 1 });
    const markdown = renderNutritionEvalMarkdown(report);

    expect(markdown).toContain('| case\\|id next | meal | failure |');
    expect(markdown).toContain('| provider/bad\\|code next |');
    expect(markdown.split('\n').filter((line) => line.includes('case\\|id')).length).toBe(1);
  });

  it('writes exactly private JSON and Markdown report files directly inside the requested directory', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'nutrition-eval-report-'));
    directories.push(parent);
    const outputDir = join(parent, 'output');
    const report = buildNutritionEvalReport(results(), metadata);

    await mkdir(outputDir, { mode: 0o700 });
    await writeFile(join(outputDir, 'report.json'), 'old');
    await writeFile(join(outputDir, 'report.md'), 'old');
    await chmod(join(outputDir, 'report.json'), 0o644);
    await chmod(join(outputDir, 'report.md'), 0o644);

    const written = await writeNutritionEvalReport(report, outputDir);

    expect(written).toEqual({
      reportDir: outputDir,
      jsonPath: join(outputDir, 'report.json'),
      markdownPath: join(outputDir, 'report.md'),
    });
    expect(await readFile(written.jsonPath, 'utf8')).toBe(renderNutritionEvalJson(report));
    expect(await readFile(written.markdownPath, 'utf8')).toBe(renderNutritionEvalMarkdown(report));
    expect((await stat(outputDir)).mode & 0o777).toBe(0o700);
    expect((await stat(written.jsonPath)).mode & 0o777).toBe(0o600);
    expect((await stat(written.markdownPath)).mode & 0o777).toBe(0o600);
    expect(await readdir(outputDir)).toEqual(['report.json', 'report.md']);
  });

  it('keeps a committed report successful when backup cleanup is blocked', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'nutrition-eval-report-'));
    directories.push(parent);
    const outputDir = join(parent, 'output');
    const report = buildNutritionEvalReport(results(), metadata);
    const actualRm = fsPromises.rm;
    const removeSpy = vi.spyOn(fsPromises, 'rm').mockImplementation(async (path, options) => {
      if (String(path).endsWith('.bak')) throw new Error('backup cleanup blocked');
      return actualRm(path, options);
    });

    try {
      await expect(writeNutritionEvalReport(report, outputDir)).resolves.toMatchObject({ reportDir: outputDir });
      expect(await readFile(join(outputDir, 'report.json'), 'utf8')).toBe(renderNutritionEvalJson(report));
      expect(removeSpy.mock.calls.filter(([path]) => String(path).endsWith('.bak'))).toHaveLength(2);
    } finally {
      removeSpy.mockRestore();
    }
  });

  it('removes the exact temporary file when post-write chmod fails', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'nutrition-eval-report-'));
    directories.push(parent);
    const outputDir = join(parent, 'output');
    const report = buildNutritionEvalReport(results(), metadata);
    const actualChmod = fsPromises.chmod;
    const chmodSpy = vi.spyOn(fsPromises, 'chmod').mockImplementation(async (path, mode) => {
      if (String(path).includes('.report.json.') && String(path).endsWith('.tmp')) {
        throw new Error('chmod blocked');
      }
      return actualChmod(path, mode);
    });

    try {
      await expect(writeNutritionEvalReport(report, outputDir)).rejects.toThrow('chmod blocked');
      expect(await readdir(outputDir)).toEqual([]);
    } finally {
      chmodSpy.mockRestore();
    }
  });

  // Production bug caught: reports currently have nowhere to serialize
  // privacy-safe decomposition, so ratio/driver evidence disappears on JSON roundtrip.
  it('roundtrips optional diagnostics and renders them in a separate table', () => {
    const base = scoreNutritionCase({ ...reportCase, truth: { ...reportCase.truth, referenceMassG: 400 } }, {
      parseStatus: 'success', source: 'meal', kcal: 110, proteinG: 2, carbsG: 4, fatG: 6,
      confidence: 0.9, decision: 'needs_review',
    });
    const detailed = {
      ...base,
      diagnostics: {
        mealMassG: { predicted: 500, truth: 400, absoluteError: 100, ratioToTruth: 1.25, relativeError: 0.25 },
        mealDensityPer100: {
          kcal: { predicted: 27.5, truth: 25, absoluteError: 2.5, ratioToTruth: 1.1, relativeError: 0.1 },
          proteinG: { predicted: 0.5, truth: 0.25, absoluteError: 0.25, ratioToTruth: 2, relativeError: 1 },
          carbsG: { predicted: 1, truth: 0.5, absoluteError: 0.5, ratioToTruth: 2, relativeError: 1 },
          fatG: { predicted: 1.5, truth: 0.75, absoluteError: 0.75, ratioToTruth: 2, relativeError: 1 },
        },
        mealDominantDriver: 'mass_dominated',
      },
    };
    const report = buildNutritionEvalReport([detailed], { ...metadata, publicCases: 1 });
    const withoutDiagnostics = buildNutritionEvalReport([base], { ...metadata, publicCases: 1 });
    const json = renderNutritionEvalJson(report);
    const roundTrip = NutritionEvalReportSchema.parse(JSON.parse(json));
    expect(roundTrip.cases[0]?.diagnostics).toEqual(detailed.diagnostics);

    const markdown = renderNutritionEvalMarkdown(report);
    expect(markdown).toContain('## Cases');
    expect(markdown).toContain('## Case diagnostics');
    expect(markdown).toContain('| caseId | mealMassRatioToTruth | mealMassRelativeError | mealDominantDriver | kcalDensityRatioToTruth | kcalDensityRelativeError | proteinGDensityRatioToTruth | proteinGDensityRelativeError | carbsGDensityRatioToTruth | carbsGDensityRelativeError | fatGDensityRatioToTruth | fatGDensityRelativeError |');
    expect(markdown).toContain('| report-case | 1.25 | 0.25 | mass_dominated | 1.1 | 0.1 | 2 | 1 | 2 | 1 | 2 | 1 |');
    const casesBlock = (value: string) => {
      const start = value.indexOf('## Cases');
      const end = value.indexOf('## Case diagnostics');
      return value.slice(start, end < 0 ? value.length : end);
    };
    expect(casesBlock(markdown)).toBe(casesBlock(renderNutritionEvalMarkdown(withoutDiagnostics)));
    expect(markdown.indexOf('## Case diagnostics')).toBeGreaterThan(markdown.indexOf('## Cases'));
  });

  // Production bug caught: optional diagnostics must remain backward compatible;
  // absent diagnostics should not add an empty or misleading report section.
  it('omits the diagnostics section when no case provides diagnostics', () => {
    const report = buildNutritionEvalReport(results(), metadata);
    expect(renderNutritionEvalMarkdown(report)).not.toContain('## Case diagnostics');
  });

  // Production bug caught: report validation currently permits arbitrary
  // diagnostic strings, which could persist model names, paths, or raw output.
  it('rejects arbitrary diagnostic strings through the report schema', () => {
    const result = scoreNutritionCase(reportCase, {
      parseStatus: 'success', source: 'meal', kcal: 110, proteinG: 1, carbsG: 2, fatG: 3,
      confidence: 0.9, decision: 'complete',
    });
    const cleanDiagnostics = {
      rawNutrients: { kcal: 110, proteinG: 1, carbsG: 2, fatG: 3 },
      detectedItemCount: 1,
      estimatedTotalMassG: 100,
      declaredBasis: 'portion', declaredAmount: 1, declaredUnit: 'portion',
    };
    const clean = {
      ...result,
      prediction: { ...result.prediction, diagnostics: cleanDiagnostics },
    };
    expect(() => buildNutritionEvalReport([clean], { ...metadata, publicCases: 1 })).not.toThrow();
    const tainted = {
      ...result,
      prediction: { ...result.prediction, diagnostics: { ...cleanDiagnostics, rawText: 'Secret provider response' } },
    };
    expect(() => buildNutritionEvalReport([tainted], { ...metadata, publicCases: 1 })).toThrow();
  });
});
