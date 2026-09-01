import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fsPromises from 'fs/promises';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

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
import type { NutritionEvalCase, NutritionCaseResult } from '../../src/nutrition-eval/schema';

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
    ], metadata);
    const stackReport = buildNutritionEvalReport([
      scoreNutritionCase({ ...reportCase, id: 'Error: boom\n    at private.ts:42:7' }, {
        parseStatus: 'success', source: 'meal', kcal: 100, proteinG: 1, carbsG: 2, fatG: 3,
        confidence: 0.9, decision: 'complete',
      }),
    ], metadata);

    const embeddedPathReport = buildNutritionEvalReport(results(), { ...metadata, runId: 'note path=/tmp/private-report.json' });
    const slashPathReport = buildNutritionEvalReport(results(), { ...metadata, runId: 'note /var/private/report.json' });
    const windowsSlashReport = buildNutritionEvalReport(results(), { ...metadata, runId: 'C:/Users/private/report.json' });
    const assignmentReports = ['token=redacted', 'api-key: redacted', 'secret = redacted', 'sk-test1', 'aaa.bbb.ccc']
      .map((failureCode) => buildNutritionEvalReport([
        scoreNutritionCase({ ...reportCase, id: `private-${failureCode}` }, {
          parseStatus: 'failure', source: 'meal', decision: 'error', failureCategory: 'provider', failureCode,
        }),
      ], metadata));

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
      ], metadata);
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
    ], metadata);
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
    ], metadata);
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
});
