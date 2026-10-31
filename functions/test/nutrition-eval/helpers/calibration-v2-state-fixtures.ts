import { createHash } from 'node:crypto';
import type { CalibrationIdentity, CalibrationOwner, CalibrationProfile } from '../../../src/nutrition-eval/calibration';
import type { CalibrationPlannedReportOutcome, CalibrationReportOutcomeKey } from '../../../src/nutrition-eval/calibration-report-state';
import type { RuntimeCanonicalPlans } from '../../../src/nutrition-eval/calibration-runtime-evidence-state';
import { captureCalibrationReportPrediction } from '../../../src/nutrition-eval/calibration-report-journal';
import { captureCalibrationNonReservationEvent } from '../../../src/nutrition-eval/calibration-report-state';
import type { v2BootstrapFixture } from './calibration-v2-bootstrap-fixtures';

// Trusted test plans, not a test of the future native V2 key derivation.
// Training comes from the independent fixture expected manifest, while the
// public rows come from the shipped shared fixture bytes.
export function statePlansFixture(f: ReturnType<typeof v2BootstrapFixture>): RuntimeCanonicalPlans {
  const development = f.fixture.expectedManifest.cases.filter(c => c.group === 'development');
  const validation = f.fixture.expectedManifest.cases.filter(c => c.group === 'validation');
  const text = f.shared.get('functions/eval/nutrition/public-manifest.json');
  if (!text) throw new Error('missing public fixture');
  const publicCases = (JSON.parse(text) as { cases: Array<{ id: string; scanMode: 'meal' | 'label' | 'barcode' }> }).cases;
  const row = (stage: CalibrationReportOutcomeKey['stage'], profile: CalibrationProfile, caseId: string,
    sampleIndex: number, scanMode: 'meal' | 'label' | 'barcode'): CalibrationPlannedReportOutcome =>
    ({ key: { stage, profile, caseId, sampleIndex }, scanMode });
  const initial: CalibrationPlannedReportOutcome[] = (['LOW', 'MEDIUM'] as const)
    .map(profile => row('preflight', profile, development[0]!.id, 1, 'meal'));
  for (const c of development) for (const profile of ['LOW', 'MEDIUM'] as const) initial.push(row('development', profile, c.id, 1, 'meal'));
  const expanded = (profile: CalibrationProfile): CalibrationPlannedReportOutcome[] => {
    const rows = structuredClone(initial);
    for (const c of validation) for (const sample of [1, 2, 3]) rows.push(row('validation', profile, c.id, sample, 'meal'));
    for (const c of publicCases) for (const sample of [1, 2, 3]) rows.push(row('benchmark', profile, c.id, sample, c.scanMode));
    return rows;
  };
  return { initial, LOW: expanded('LOW'), MEDIUM: expanded('MEDIUM') };
}

export function stateHeaderFixture(identity: CalibrationIdentity, owner: CalibrationOwner) {
  return { type: 'protocol_identity' as const, identity: { ...identity }, owner: { ...owner },
    at: owner.acquiredAt, reportAuthority: 'verified_artifacts_v1' as const, runtimeEvidenceVersion: 1 as const };
}

// Five hand-ordered frames complete a dataset-load-failed preflight pair.
// Real existing prediction/event codecs validate the fixture; no SDK, image,
// reservation or report artifact is created by constructing this data.
export function datasetFailureFrames(key: CalibrationReportOutcomeKey, owner: CalibrationOwner) {
  const at = owner.acquiredAt;
  const prediction = captureCalibrationReportPrediction({ parseStatus: 'failure', source: 'meal', decision: 'error',
    failureCategory: 'dataset', failureCode: 'dataset_load_failed', latencyMs: 11, sampleIndex: key.sampleIndex, cached: false });
  const contentDigest = createHash('sha256').update(JSON.stringify({ key, reason: 'dataset', prediction, at }), 'utf8').digest('hex');
  const terminal = captureCalibrationNonReservationEvent({ type: 'non_reservation_result', key, reason: 'dataset', prediction, contentDigest, at });
  const common = { version: 1, owner: { ...owner }, at, key: { ...key }, attempt: 1 };
  return [
    { kind: 'runtime', eventIndex: 2, event: { ...common, type: 'runtime_attempt_started', sequence: 1 } },
    { kind: 'runtime', eventIndex: 3, event: { ...common, type: 'runtime_operation_started', sequence: 2, operation: 'image' } },
    { kind: 'runtime', eventIndex: 4, event: { ...common, type: 'runtime_operation_settled', sequence: 3, operation: 'image', result: 'failed' } },
    { kind: 'non_reservation_result', eventIndex: 5, event: terminal },
    { kind: 'runtime', eventIndex: 6, event: { ...common, type: 'runtime_attempt_finished', sequence: 4,
      terminal: { kind: 'non_reservation', eventIndex: 5, contentDigest } } },
  ];
}
