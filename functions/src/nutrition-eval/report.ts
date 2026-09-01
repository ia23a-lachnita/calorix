import { chmod, mkdir, rename, rm, writeFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import { join } from 'path';

import { aggregateNutritionResults } from './scorer';
import { NutritionEvalReportSchema } from './schema';

import type { NutritionCaseResult, NutritionEvalReport } from './schema';

export interface NutritionEvalReportMetadata {
  runId: string;
  timestamp: string;
  datasetId: string;
  datasetHash: string;
  adapterModelId: string;
  promptHash: string;
  codeSha: string;
  samples: number;
  baselineOnly: boolean;
}

function percentile(sorted: readonly number[], percentileValue: number): number {
  if (sorted.length === 0) return 0;
  const index = (percentileValue / 100) * (sorted.length - 1);
  const low = Math.floor(index);
  const high = Math.ceil(index);
  if (low === high) return sorted[low] as number;
  return (sorted[low] as number) + ((sorted[high] as number) - (sorted[low] as number)) * (index - low);
}

function latencySummary(results: readonly NutritionCaseResult[]): NutritionEvalReport['summary']['latencyMs'] {
  const values = results
    .map((result) => result.prediction.latencyMs)
    .filter((value): value is number => value !== undefined)
    .sort((a, b) => a - b);
  if (values.length === 0) return undefined;
  return {
    min: values[0] as number,
    max: values[values.length - 1] as number,
    median: percentile(values, 50),
    p90: percentile(values, 90),
  };
}

export function buildNutritionEvalReport(
  results: readonly NutritionCaseResult[],
  metadata: NutritionEvalReportMetadata,
): NutritionEvalReport {
  const summary = aggregateNutritionResults(results);
  const latencyMs = latencySummary(results);
  return NutritionEvalReportSchema.parse({
    version: 1,
    ...metadata,
    summary: { ...summary, ...(latencyMs ? { latencyMs } : {}) },
    cases: results,
  });
}

function containsPrivacyLeak(value: unknown): boolean {
  if (typeof value === 'string') {
    return /(?:^|[\s=:])file:\/\//i.test(value)
      || /(?:^|[\s=:])\/[\w.-]+(?:\/|$)/.test(value)
      || /(?:^|[\s=:])[a-z]:[\\/]/i.test(value)
      || /\\\\[^\\\s]+\\[^\\\s]+/.test(value)
      || /\bbearer\s+\S+/i.test(value)
      || /\b(?:token|api[-_]?key|secret)\s*[:=]\s*\S+/i.test(value)
      || /\bsk-[a-z0-9_-]{4,}\b/i.test(value)
      || /\b[a-z0-9_-]{3,}\.[a-z0-9_-]{3,}\.[a-z0-9_-]{3,}\b/i.test(value)
      || /(?:^|\n)\s*at\s+.+:\d+:\d+/.test(value)
      || /^Error:\s/m.test(value);
  }
  if (Array.isArray(value)) return value.some(containsPrivacyLeak);
  if (value && typeof value === 'object') return Object.values(value).some(containsPrivacyLeak);
  return false;
}

function assertPrivate(report: NutritionEvalReport): void {
  if (containsPrivacyLeak(report)) throw new Error('privacy_leak');
}

function markdownCell(input: string | number | boolean | undefined): string {
  if (input === undefined) return '-';
  return String(input)
    .replace(/\\/g, '\\\\')
    .replace(/\r\n?|\n/g, ' ')
    .replace(/\|/g, '\\|');
}

export function renderNutritionEvalJson(report: NutritionEvalReport): string {
  assertPrivate(report);
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function renderNutritionEvalMarkdown(report: NutritionEvalReport): string {
  assertPrivate(report);
  const summary = report.summary;
  const failureCategories = Object.entries(summary.failuresByCategory)
    .map(([category, count]) => markdownCell(category) + '=' + count).join(', ') || 'none';
  const failureCodes = Object.entries(summary.failuresByCode)
    .map(([code, count]) => markdownCell(code) + '=' + count).join(', ') || 'none';
  const cases = report.cases.map((result) => {
    const prediction = result.prediction;
    const failure = prediction.failureCategory && prediction.failureCode
      ? `${prediction.failureCategory}/${prediction.failureCode}` : '-';
    const metric = (field: keyof NutritionCaseResult['numeric']): string[] => {
      const values = result.numeric[field];
      return [
        markdownCell(values?.ratioToTruth),
        markdownCell(values?.absoluteError),
        markdownCell(values?.relativeError),
      ];
    };
    const row = [
      markdownCell(result.caseId),
      markdownCell(prediction.source),
      markdownCell(prediction.parseStatus),
      markdownCell(prediction.kcal),
      markdownCell(prediction.proteinG),
      markdownCell(prediction.carbsG),
      markdownCell(prediction.fatG),
      markdownCell(prediction.basis),
      markdownCell(prediction.amount),
      markdownCell(prediction.unit),
      markdownCell(prediction.barcode),
      markdownCell(prediction.decision),
      markdownCell(failure),
      markdownCell(prediction.latencyMs),
      markdownCell(result.safety.catastrophicCalorieMiss),
      markdownCell(result.safety.unsafeCompletion),
      ...metric('kcal'),
      ...metric('proteinG'),
      ...metric('carbsG'),
      ...metric('fatG'),
      markdownCell(result.booleans.barcodeExactMatch),
      markdownCell(result.booleans.basisExactMatch),
      markdownCell(result.booleans.unitExactMatch),
    ].join(' | ');
    return '| ' + row + ' |';
  });
  const latency = summary.latencyMs
    ? `min=${summary.latencyMs.min}, max=${summary.latencyMs.max}, median=${summary.latencyMs.median}, p90=${summary.latencyMs.p90}`
    : 'none';
  return [
    '# Nutrition evaluation report', '',
    `runId: ${report.runId}`,
    `timestamp: ${report.timestamp}`,
    `datasetId: ${report.datasetId}`,
    `datasetHash: ${report.datasetHash}`,
    `adapterModelId: ${report.adapterModelId}`,
    `promptHash: ${report.promptHash}`,
    `codeSha: ${report.codeSha}`,
    `samples: ${report.samples}`,
    `baselineOnly: ${report.baselineOnly}`,
    '', '## Aggregate metrics',
    `totalCases: ${summary.totalCases}`,
    `runCases: ${summary.runCases}`,
    `parseCases: ${summary.parseCases}`,
    `basisAccuracyDenom: ${summary.basisAccuracyDenom}`,
    `barcodeAccuracyDenom: ${summary.barcodeAccuracyDenom}`,
    `medianAbsoluteCalorieError: ${summary.medianAbsoluteCalorieError}`,
    `medianRelativeCalorieError: ${summary.medianRelativeCalorieError}`,
    `p90AbsoluteCalorieError: ${summary.p90AbsoluteCalorieError}`,
    `p90RelativeCalorieError: ${summary.p90RelativeCalorieError}`,
    `meanMacroRelativeError: ${summary.meanMacroRelativeError}`,
    `reviewRate: ${summary.reviewRate}`,
    `catastrophicCount: ${summary.catastrophicCount}`,
    `unsafeCompletionCount: ${summary.unsafeCompletionCount}`,
    `latencyMs: ${latency}`,
    `failuresByCategory: ${failureCategories}`,
    `failuresByCode: ${failureCodes}`,
    '', '## Cases',
    '| caseId | source | parse | kcal | proteinG | carbsG | fatG | basis | amount | unit | barcode | decision | failure | latencyMs | catastrophic | unsafe | kcalRatioToTruth | kcalAbsoluteError | kcalRelativeError | proteinGRatioToTruth | proteinGAbsoluteError | proteinGRelativeError | carbsGRatioToTruth | carbsGAbsoluteError | carbsGRelativeError | fatGRatioToTruth | fatGAbsoluteError | fatGRelativeError | barcodeExactMatch | basisExactMatch | unitExactMatch |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: | --- | --- | --- | --- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |',
    ...cases, '',
  ].join('\n');
}

async function writePrivateTemp(
  outputDir: string,
  basename: string,
  contents: string,
): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const path = join(outputDir, `.${basename}.${randomUUID()}.tmp`);
    try {
      await writeFile(path, contents, { mode: 0o600, flag: 'wx' });
      try {
        await chmod(path, 0o600);
      } catch (error) {
        await rm(path, { force: true });
        throw error;
      }
      return path;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'EEXIST') continue;
      throw error;
    }
  }
  throw new Error('report_temp_collision');
}

async function moveExisting(target: string, backup: string): Promise<boolean> {
  try {
    await rename(target, backup);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

export async function writeNutritionEvalReport(
  report: NutritionEvalReport,
  outputDir: string,
): Promise<{ reportDir: string; jsonPath: string; markdownPath: string }> {
  const json = renderNutritionEvalJson(report);
  const markdown = renderNutritionEvalMarkdown(report);
  await mkdir(outputDir, { recursive: true, mode: 0o700 });
  await chmod(outputDir, 0o700);
  const jsonPath = join(outputDir, 'report.json');
  const markdownPath = join(outputDir, 'report.md');
  let jsonTemp: string | undefined;
  let markdownTemp: string | undefined;
  const jsonBackup = join(outputDir, `.report.json.${randomUUID()}.bak`);
  const markdownBackup = join(outputDir, `.report.md.${randomUUID()}.bak`);
  let hadJson = false;
  let hadMarkdown = false;
  let wroteJson = false;
  let wroteMarkdown = false;
  let committed = false;
  try {
    jsonTemp = await writePrivateTemp(outputDir, 'report.json', json);
    markdownTemp = await writePrivateTemp(outputDir, 'report.md', markdown);
    hadJson = await moveExisting(jsonPath, jsonBackup);
    hadMarkdown = await moveExisting(markdownPath, markdownBackup);
    await rename(jsonTemp, jsonPath);
    wroteJson = true;
    await rename(markdownTemp, markdownPath);
    wroteMarkdown = true;
    await chmod(jsonPath, 0o600);
    await chmod(markdownPath, 0o600);
    committed = true;
    await Promise.allSettled([
      rm(jsonBackup, { force: true }),
      rm(markdownBackup, { force: true }),
    ]);
  } catch (error) {
    if (committed) throw error;
    await Promise.all([
      ...(jsonTemp ? [rm(jsonTemp, { force: true })] : []),
      ...(markdownTemp ? [rm(markdownTemp, { force: true })] : []),
      ...(wroteJson ? [rm(jsonPath, { force: true })] : []),
      ...(wroteMarkdown ? [rm(markdownPath, { force: true })] : []),
    ]);
    if (hadJson) await rename(jsonBackup, jsonPath);
    if (hadMarkdown) await rename(markdownBackup, markdownPath);
    throw error;
  }
  return { reportDir: outputDir, jsonPath, markdownPath };
}
