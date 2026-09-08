import { lstat, readFile, realpath } from 'fs/promises';
import { resolve, sep } from 'path';

import {
  NutritionEvalReportSchema,
  type BaselineComparison,
  type NutritionEvalReport,
} from './schema';

const HISTORICAL_RUN_ID = 'run-2026-09-02T04-44-02-551Z';
const HISTORICAL_DATASET_ID = 'calorix-public-v1';
const HISTORICAL_CASE_COUNT = 20;
const SAFE_RUN_ID = /^run-[A-Za-z0-9][A-Za-z0-9_-]*$/;

type StableBaselineErrorCode =
  | 'path_traversal_detected'
  | 'baseline_not_found'
  | 'malformed_baseline'
  | 'current_report_invalid';

function stableError(code: StableBaselineErrorCode): Error & { code: StableBaselineErrorCode } {
  const messages: Record<StableBaselineErrorCode, string> = {
    path_traversal_detected: 'baseline run path traversal detected',
    baseline_not_found: 'baseline report not found',
    malformed_baseline: 'baseline report is malformed',
    current_report_invalid: 'current report is invalid',
  };
  return Object.assign(new Error(messages[code]), { code });
}

function isStableBaselineError(error: unknown): error is Error & { code: StableBaselineErrorCode } {
  if (!(error instanceof Error)) return false;
  const code = (error as NodeJS.ErrnoException).code;
  return typeof code === 'string'
    && (['path_traversal_detected', 'baseline_not_found', 'malformed_baseline', 'current_report_invalid'] as const)
      .includes(code as StableBaselineErrorCode);
}

function isWithin(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(root + sep);
}

export function isSafeBaselineRunId(runId: unknown): runId is string {
  return typeof runId === 'string' && SAFE_RUN_ID.test(runId);
}

async function baselineReportPath(reportRoot: string, runId: string): Promise<string> {
  if (!isSafeBaselineRunId(runId) || typeof reportRoot !== 'string' || reportRoot.trim().length === 0) {
    throw stableError('path_traversal_detected');
  }
  const requestedRoot = resolve(reportRoot);
  const requestedDirectory = resolve(requestedRoot, runId);
  const requestedReport = resolve(requestedDirectory, 'report.json');
  if (!isWithin(requestedRoot, requestedDirectory) || !isWithin(requestedRoot, requestedReport)) {
    throw stableError('path_traversal_detected');
  }

  let root: string;
  try {
    root = await realpath(requestedRoot);
  } catch {
    throw stableError('baseline_not_found');
  }
  try {
    const directoryInfo = await lstat(requestedDirectory);
    if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) {
      throw stableError('path_traversal_detected');
    }
    const reportInfo = await lstat(requestedReport);
    if (!reportInfo.isFile() || reportInfo.isSymbolicLink()) {
      throw stableError('path_traversal_detected');
    }
    const [directory, report] = await Promise.all([realpath(requestedDirectory), realpath(requestedReport)]);
    if (!isWithin(root, directory) || !isWithin(root, report) || report !== resolve(directory, 'report.json')) {
      throw stableError('path_traversal_detected');
    }
  } catch (error) {
    if (isStableBaselineError(error)) throw error;
    if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw stableError('baseline_not_found');
    }
    throw stableError('baseline_not_found');
  }
  return requestedReport;
}

function parseRate(summary: { parseCases: number; runCases: number }): number {
  return summary.runCases === 0 ? 0 : summary.parseCases / summary.runCases;
}

function enrichKnownHistoricalBaseline(raw: unknown, requestedRunId: string): unknown {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw stableError('malformed_baseline');
  const record = raw as Record<string, unknown>;
  const hasPublicCases = Object.hasOwn(record, 'publicCases');
  const hasPrivateCases = Object.hasOwn(record, 'privateCases');
  if (hasPublicCases || hasPrivateCases) return raw;
  const summary = record.summary;
  const cases = record.cases;
  if (
    requestedRunId !== HISTORICAL_RUN_ID
    || record.runId !== HISTORICAL_RUN_ID
    || record.datasetId !== HISTORICAL_DATASET_ID
    || !Array.isArray(cases)
    || cases.length !== HISTORICAL_CASE_COUNT
    || summary === null
    || typeof summary !== 'object'
    || Array.isArray(summary)
    || (summary as Record<string, unknown>).totalCases !== HISTORICAL_CASE_COUNT
    || (summary as Record<string, unknown>).runCases !== HISTORICAL_CASE_COUNT
  ) {
    throw stableError('malformed_baseline');
  }
  return { ...record, publicCases: HISTORICAL_CASE_COUNT, privateCases: 0 };
}

function parseBaseline(raw: unknown, requestedRunId: string): NutritionEvalReport {
  const enriched = enrichKnownHistoricalBaseline(raw, requestedRunId);
  const parsed = NutritionEvalReportSchema.safeParse(enriched);
  if (!parsed.success || parsed.data.runId !== requestedRunId) throw stableError('malformed_baseline');
  return parsed.data;
}

function compatibilityReasonsFor(
  baseline: NutritionEvalReport,
  current: NutritionEvalReport,
): BaselineComparison['compatibilityReasons'] {
  const reasons: BaselineComparison['compatibilityReasons'] = [];
  if (current.datasetId !== baseline.datasetId) reasons.push('dataset_id_mismatch');
  if (current.datasetHash !== baseline.datasetHash) reasons.push('dataset_hash_mismatch');
  if (
    current.cases.length !== baseline.cases.length
    || current.summary.totalCases !== baseline.summary.totalCases
    || current.summary.runCases !== baseline.summary.runCases
  ) {
    reasons.push('case_count_mismatch');
  }
  if (current.publicCases !== baseline.publicCases) reasons.push('public_cases_mismatch');
  if (current.privateCases !== baseline.privateCases || current.privateCases > 0 || baseline.privateCases > 0) {
    reasons.push('private_coverage_unsupported');
  }
  if (current.samples !== baseline.samples) reasons.push('samples_mismatch');
  if (current.promptHash !== baseline.promptHash) reasons.push('prompt_hash_mismatch');
  if (current.adapterModelId !== baseline.adapterModelId) reasons.push('model_mismatch');
  return reasons;
}

/**
 * Loads the one known legacy public report without rewriting it, validates it
 * under the current report contract, then exposes deltas only when compatible.
 */
export async function loadBaselineComparison(
  reportRoot: string,
  runId: string,
  currentReport: NutritionEvalReport,
): Promise<BaselineComparison> {
  const current = NutritionEvalReportSchema.safeParse(currentReport);
  if (!current.success) throw stableError('current_report_invalid');
  const reportPath = await baselineReportPath(reportRoot, runId);

  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(reportPath, 'utf8'));
  } catch {
    throw stableError('malformed_baseline');
  }
  const baseline = parseBaseline(raw, runId);
  const reasons = compatibilityReasonsFor(baseline, current.data);
  if (reasons.length > 0) {
    return {
      baselineRunId: runId,
      baselineTimestamp: baseline.timestamp,
      baselineCodeSha: baseline.codeSha,
      baselinePromptHash: baseline.promptHash,
      baselineModelId: baseline.adapterModelId,
      compatible: false,
      compatibilityReason: reasons[0],
      compatibilityReasons: reasons,
    };
  }
  return {
    baselineRunId: runId,
    baselineTimestamp: baseline.timestamp,
    baselineCodeSha: baseline.codeSha,
    baselinePromptHash: baseline.promptHash,
    baselineModelId: baseline.adapterModelId,
    compatible: true,
    compatibilityReasons: [],
    deltas: {
      parseRate: parseRate(current.data.summary) - parseRate(baseline.summary),
      medianAbsoluteCalorieError: current.data.summary.medianAbsoluteCalorieError - baseline.summary.medianAbsoluteCalorieError,
      medianRelativeCalorieError: current.data.summary.medianRelativeCalorieError - baseline.summary.medianRelativeCalorieError,
      p90AbsoluteCalorieError: current.data.summary.p90AbsoluteCalorieError - baseline.summary.p90AbsoluteCalorieError,
      p90RelativeCalorieError: current.data.summary.p90RelativeCalorieError - baseline.summary.p90RelativeCalorieError,
      meanMacroRelativeError: current.data.summary.meanMacroRelativeError - baseline.summary.meanMacroRelativeError,
      reviewRate: current.data.summary.reviewRate - baseline.summary.reviewRate,
      catastrophicCount: current.data.summary.catastrophicCount - baseline.summary.catastrophicCount,
      unsafeCompletionCount: current.data.summary.unsafeCompletionCount - baseline.summary.unsafeCompletionCount,
    },
  };
}
