import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  prepareCalibrationBootstrapContext, deriveCanonicalAllowedKeys, deriveCanonicalAllowedKeysV2,
  deriveCanonicalReportOutcomePlan, deriveCanonicalReportOutcomePlanV2,
} from '../../../src/nutrition-eval/calibration-bootstrap';
import { createProtocolCalibrationLedger, createProtocolCalibrationLedgerV2 } from '../../../src/nutrition-eval/calibration';
import type { CalibrationProfile, JournalEntry, ReservationKey, StageName } from '../../../src/nutrition-eval/calibration';
import type { CalibrationStageReportSnapshot } from '../../../src/nutrition-eval/calibration-report-state';
import type { NutritionEvalCase } from '../../../src/nutrition-eval/schema';
import { captureCalibrationReportPrediction } from '../../../src/nutrition-eval/calibration-report-journal';
import { prepareCalibrationV2BootstrapContext } from '../../../src/nutrition-eval/calibration-protocol-bindings';
import { v2BootstrapFixture } from './calibration-v2-bootstrap-fixtures';
import { memoryWorld, V1_ROOT } from './calibration-v2-ledger-fixtures';

export const reportHash = (text: string) => createHash('sha256').update(text).digest('hex');

// These are trusted fixture inputs, not native admission or SDK evidence. No
// scorer, report builder, registration, ledger or planner algorithm is mocked.
export async function reportFixture(setPin: (sha: string) => void, mixed = false, legacy = false, baseDir = '/fixture/calorix') {
  const input = v2BootstrapFixture(); input.deps.baseDir = baseDir;
  setPin(input.fixture.input.expectedActivationLockSha256);
  const registered = { context: await prepareCalibrationV2BootstrapContext(input.deps) };
  const context = legacy ? await prepareCalibrationBootstrapContext({
    baseDir,
    readGitState: () => ({ headCommit: 'a'.repeat(40), implementationCommit: 'b'.repeat(40),
      functionsTreeId: 'c'.repeat(40), dirtyPaths: [] }),
    readCommittedFile: path => readFileSync(new URL('../../../../' + path, import.meta.url), 'utf8'),
    readOwner: () => registered.context.owner,
  }) : registered.context;
  const world = memoryWorld(legacy ? V1_ROOT : undefined);
  const plan = (profile?: CalibrationProfile) => legacy
    ? deriveCanonicalReportOutcomePlan(context.files, profile)
    : deriveCanonicalReportOutcomePlanV2(registered.context, profile);
  const ledger = legacy ? createProtocolCalibrationLedger(world.deps, context.identity,
    p => deriveCanonicalAllowedKeys(context.files, p), { getReportOutcomePlan: plan })
    : createProtocolCalibrationLedgerV2(registered.context, world.deps,
      p => deriveCanonicalAllowedKeysV2(registered.context, p), { getReportOutcomePlan: plan });
  const training = JSON.parse(context.files['calibration-manifest']) as { datasetId: string; cases: Array<NutritionEvalCase & { group: string }> };
  const publicManifest = JSON.parse(context.files['public-manifest']) as { datasetId: string; cases: NutritionEvalCase[] };
  const byId = new Map([...training.cases, ...publicManifest.cases].map(c => [c.id, c]));
  const pin = 'gemini-3.8-fixture-pin';
  const terminal = (key: ReservationKey) => {
    const c = byId.get(key.caseId)!;
    if (c.scanMode === 'barcode') {
      ledger.recordNonReservationResult({ key, reason: 'barcode', prediction: {
        parseStatus: 'failure', source: 'barcode', decision: 'error', failureCategory: 'product',
        failureCode: 'off_product_invalid', sampleIndex: key.sampleIndex, cached: false, latencyMs: 17,
      } });
      return;
    }
    const { kcal, proteinG, carbsG, fatG } = c.truth;
    const four = { kcal, proteinG, carbsG, fatG };
    const p = captureCalibrationReportPrediction({ parseStatus: 'success', source: c.scanMode, ...four,
      confidence: 0.8, basis: c.truth.basis, amount: c.truth.amount, unit: c.truth.unit,
      decision: 'needs_review', reviewReasons: [], latencyMs: 17, sampleIndex: key.sampleIndex, cached: false });
    const journal: JournalEntry = { key, normalizedPrediction: four, predictionHash: reportHash(JSON.stringify(four)),
      analysisLatencyMs: 17, errorCategory: 'none', responseModelVersion: pin, reportPrediction: p };
    ledger.reserve(key);
    if (ledger.getPinnedModelVersion() === undefined) ledger.pinModelVersion(pin);
    ledger.complete(key, ledger.appendResultJournal(journal));
  };
  ledger.acquireLock(context.owner);
  const token = { kind: 'token_count', stage: 'preflight', caseId: context.firstDevelopmentCaseId, model: 'gemini-3.8-flash' } as const;
  ledger.reserveTokenCount(token); ledger.completeTokenCount(token, 42);
  const snapshots = new Map<string, CalibrationStageReportSnapshot>();
  const save = (stage: StageName, profile: CalibrationProfile) => snapshots.set(`${stage}/${profile}`, ledger.getStageReportSnapshot(stage, profile));
  for (const row of plan().filter(r => r.key.stage === 'preflight')) terminal(row.key);
  ledger.completeStage('preflight', { stage: 'preflight', passed: true, completedStages: [] });
  save('preflight', 'LOW'); save('preflight', 'MEDIUM');
  for (const [index, row] of plan().filter(r => r.key.stage === 'development').entries()) {
    if (mixed && index === 0) ledger.recordNonReservationResult({ key: row.key, reason: 'dataset', prediction: {
      parseStatus: 'failure', source: 'meal', decision: 'error', failureCategory: 'dataset',
      failureCode: 'dataset_fetch_failed', latencyMs: 9, sampleIndex: 1, cached: false,
    } });
    else if (mixed && index === 1) { ledger.reserve(row.key); ledger.recoverAfterCrash(); }
    else terminal(row.key);
  }
  save('development', 'LOW'); save('development', 'MEDIUM');
  if (!mixed) {
    ledger.recordProfileSelection('MEDIUM', 'default_medium_tie_breaker', { stage: 'development', passed: true, completedStages: ['preflight'] });
    ledger.completeStage('development', { stage: 'development', passed: true, completedStages: ['preflight'] });
    for (const row of plan('MEDIUM').filter(r => r.key.stage === 'validation')) terminal(row.key);
    ledger.completeStage('validation', { stage: 'validation', passed: true, completedStages: ['preflight', 'development'] });
    save('validation', 'MEDIUM');
    for (const row of plan('MEDIUM').filter(r => r.key.stage === 'benchmark')) terminal(row.key);
    save('benchmark', 'MEDIUM');
  }
  return { context, v2Context: registered.context, world, training, publicManifest, snapshots,
    snapshot: (stage: StageName = 'preflight', profile: CalibrationProfile = 'LOW') => snapshots.get(`${stage}/${profile}`)! };
}
