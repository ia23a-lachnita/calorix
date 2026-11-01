import { vi } from 'vitest';
import type { CalibrationProfile } from '../../../src/nutrition-eval/calibration';
import { prepareCalibrationV2BootstrapContext } from '../../../src/nutrition-eval/calibration-protocol-bindings';
import { v2BootstrapFixture } from './calibration-v2-bootstrap-fixtures';
import { statePlansFixture } from './calibration-v2-state-fixtures';

// All ports below are trusted test DI, never a native execution/admission token.
export async function strictLedgerFixture(setPin: (sha: string) => void) {
  const f = v2BootstrapFixture(); setPin(f.fixture.input.expectedActivationLockSha256);
  const context = await prepareCalibrationV2BootstrapContext(f.deps);
  const plans = statePlansFixture(f);
  const plan = (selected?: CalibrationProfile) => selected === undefined ? plans.initial : plans[selected];
  const resolver = vi.fn((selected?: CalibrationProfile) => plan(selected).filter(row => row.scanMode !== 'barcode').map(row => ({ ...row.key })));
  const reportOptions = { getReportOutcomePlan: vi.fn(plan) };
  const authorityOptions = { verifyStageReportArtifacts: vi.fn(() => { throw new Error('unexpected artifact verification in fixture'); }) };
  const runtimeOptions = { initialOwner: context.owner, plans,
    readCurrentGitState: vi.fn(() => ({ headCommit: context.identity.implementationCommit,
      functionsTreeId: context.identity.functionsTreeId, dirtyPaths: [] as string[] })) };
  const bytes = f.shared.get('functions/eval/nutrition/historical-reference-v1.json');
  if (bytes === undefined) throw new Error('missing fixture history');
  return { context, plans, resolver, reportOptions, authorityOptions, runtimeOptions,
    config: { historicalReferenceBytes: bytes }, key: plans.initial[0]!.key };
}
