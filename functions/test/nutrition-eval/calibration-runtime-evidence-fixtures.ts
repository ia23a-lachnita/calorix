/**
 * Calibration durable runtime evidence test-only fixtures (Task 1 Step 1).
 *
 * Builds independently pinned data using committed bootstrap/assets/planner.
 * No future/new source imports at module scope; behavioral tests dynamically
 * import the missing codec so a failure is attributable to the missing
 * feature. This file stays runnable and GREEN before, during, and after the
 * codec's RED/GREEN cycle.
 *
 * Portable paths: repo root is derived from import.meta.url and committed
 * bytes are read via resolve(repoRoot, bootstrapAssetPath). Header/key/start
 * are fresh mutable copies so caller-mutation assertions can mutate them;
 * context/plans remain the frozen owned values returned by bootstrap/planner.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  deriveCanonicalReportOutcomePlan,
  prepareCalibrationBootstrapContext,
} from '../../src/nutrition-eval/calibration-bootstrap';
import type { CalibrationPreparedContext } from '../../src/nutrition-eval/calibration-bootstrap';
import type {
  CalibrationIdentity,
  CalibrationOwner,
} from '../../src/nutrition-eval/calibration';
import type {
  CalibrationPlannedReportOutcome,
  CalibrationReportOutcomeKey,
} from '../../src/nutrition-eval/calibration-report-state';
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

function makeTestBootstrapDeps(baseDir: string) {
  return {
    baseDir,
    readGitState: () => ({
      headCommit: 'a'.repeat(40),
      implementationCommit: 'b'.repeat(40),
      functionsTreeId: 'c'.repeat(40),
      dirtyPaths: [] as string[],
    }),
    readCommittedFile: (path: string, _commit: string): string => {
      void _commit;
      return readFileSync(resolve(repoRoot, path), 'utf8');
    },
    readOwner: (): CalibrationOwner => ({
      hostname: 'runtime-evidence-fixture-host',
      bootId: 'runtime-evidence-fixture-boot',
      pid: 99999,
      startTicks: 88888,
      acquiredAt: '2026-10-14T00:00:00.000Z',
    }),
  };
}

export interface RuntimeEvidenceFixtureData {
  readonly context: CalibrationPreparedContext;
  readonly header: {
    readonly type: 'protocol_identity';
    readonly identity: Readonly<CalibrationIdentity>;
    readonly at: string;
    readonly reportAuthority: 'verified_artifacts_v1';
    readonly runtimeEvidenceVersion: 1;
    readonly owner: Readonly<CalibrationOwner>;
  };
  readonly plans: {
    readonly initial: readonly CalibrationPlannedReportOutcome[];
    readonly LOW: readonly CalibrationPlannedReportOutcome[];
    readonly MEDIUM: readonly CalibrationPlannedReportOutcome[];
  };
  readonly key: CalibrationReportOutcomeKey;
  readonly start: {
    readonly type: 'runtime_attempt_started';
    readonly version: 1;
    readonly sequence: 1;
    readonly owner: Readonly<CalibrationOwner>;
    readonly at: string;
    readonly key: CalibrationReportOutcomeKey;
    readonly attempt: 1;
  };
}

export async function makeRuntimeEvidenceData(): Promise<RuntimeEvidenceFixtureData> {
  const baseDir = resolve(repoRoot);
  const deps = makeTestBootstrapDeps(baseDir);
  const context = await prepareCalibrationBootstrapContext(deps);

  const initialPlan = deriveCanonicalReportOutcomePlan(context.files);
  const lowPlan = deriveCanonicalReportOutcomePlan(context.files, 'LOW');
  const mediumPlan = deriveCanonicalReportOutcomePlan(context.files, 'MEDIUM');

  if (initialPlan.length !== 50) {
    throw new CalibrationFatalError('calibration:fixture-invalid-initial-plan');
  }
  if (lowPlan.length !== 158) {
    throw new CalibrationFatalError('calibration:fixture-invalid-low-plan');
  }
  if (mediumPlan.length !== 158) {
    throw new CalibrationFatalError('calibration:fixture-invalid-medium-plan');
  }

  const firstDevCaseId = context.firstDevelopmentCaseId;
  const key: CalibrationReportOutcomeKey = {
    stage: 'preflight',
    profile: 'LOW',
    caseId: firstDevCaseId,
    sampleIndex: 1,
  };

  const header = {
    type: 'protocol_identity' as const,
    identity: { ...context.identity },
    at: context.owner.acquiredAt,
    reportAuthority: 'verified_artifacts_v1' as const,
    runtimeEvidenceVersion: 1 as const,
    owner: { ...context.owner },
  };

  const start = {
    type: 'runtime_attempt_started' as const,
    version: 1 as const,
    sequence: 1 as const,
    owner: { ...context.owner },
    at: context.owner.acquiredAt,
    key: { ...key },
    attempt: 1 as const,
  };

  return {
    context,
    header,
    plans: { initial: initialPlan, LOW: lowPlan, MEDIUM: mediumPlan },
    key,
    start,
  };
}

export type RuntimeEvidenceFixtureDataPromise = Promise<RuntimeEvidenceFixtureData>;
