/** Owned native composition fixtures; no producer import or live client. */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from 'vitest';
import { deriveCanonicalReportOutcomePlan } from '../../src/nutrition-eval/calibration-bootstrap';
import { captureCalibrationReportJournalEntry } from '../../src/nutrition-eval/calibration-report-journal';
import type { CalibrationReportOutcomeKey } from '../../src/nutrition-eval/calibration-report-state';
import { parseNutritionEvalManifest, StrictCalibrationManifestSchema } from '../../src/nutrition-eval/schema';
import type { NutritionPrediction } from '../../src/nutrition-eval/schema';
import { buildRuntimeHarness } from './calibration-runtime-capabilities-fixtures';
import {
  buildCoreSuccessJournal,
  CORE_PINNED_VERSION,
  createCoreExactPrediction,
  makeRuntimeEvidenceNativeFixture,
} from './calibration-runtime-evidence-fixtures';

export async function makeProducerFixture(
  ownedRoots: string[], stage: 'preflight' | 'benchmark' = 'preflight',
) {
  // The old factory immediately registers each exact miniGit root, even if
  // bootstrap subsequently rejects. The caller cleans only those roots.
  const native = await makeRuntimeEvidenceNativeFixture(ownedRoots, { mode: 'future' });
  native.completeTokenPrerequisites();
  if (stage === 'benchmark') {
    await native.finishPreflight();
    await native.finishDevelopment();
    await native.finishValidation();
  }
  const selectedProfile = native.ledger.getSelectedProfile();
  const raw = await buildRuntimeHarness(selectedProfile);
  expect(raw.deps.files).toEqual(native.context.files);
  // Only the transport is fake: generation still uses the production adapter.
  // Counts advance inside the injected SDK method, not from ledger replay.
  raw.client.models.generateContent = async (params) => {
    raw.witness.sdk++;
    raw.witness.transport++;
    raw.sdkCalls.push({ model: params.model, contents: params.contents, config: params.config });
    return { text: '{"fixture":true}', modelVersion: CORE_PINNED_VERSION };
  };
  const deps = {
    context: native.context,
    ledger: native.ledger,
    ...(selectedProfile === undefined ? {} : { selectedProfile }),
    loadImage: raw.deps.loadImage,
    generateVision: raw.deps.generateVision,
    lookupSnapshot: raw.deps.lookupSnapshot,
  };
  const plan = deriveCanonicalReportOutcomePlan({ ...native.context.files }, selectedProfile);

  function prediction(key: CalibrationReportOutcomeKey): NutritionPrediction {
    const calibration = StrictCalibrationManifestSchema.parse(JSON.parse(native.context.files['calibration-manifest']));
    const benchmark = parseNutritionEvalManifest(JSON.parse(native.context.files['public-manifest']));
    const row = [...calibration.cases, ...benchmark.cases].find((item) => item.id === key.caseId);
    if (row === undefined) throw new Error('producer-fixture-case-missing');
    return createCoreExactPrediction(row, key.sampleIndex);
  }

  function publish(key: CalibrationReportOutcomeKey, value: NutritionPrediction): void {
    if (value.source === 'barcode') {
      native.ledger.recordNonReservationResult({ key, reason: 'barcode', prediction: value });
      return;
    }
    const journal = captureCalibrationReportJournalEntry(buildCoreSuccessJournal(key, value));
    const hash = native.ledger.appendResultJournal(journal);
    native.ledger.complete(key, hash);
  }

  function disk(): { ledger: unknown[]; journal: unknown[]; lock: string } {
    return {
      ledger: JSON.parse(readFileSync(join(native.root, 'ledger.json'), 'utf8')) as unknown[],
      journal: existsSync(join(native.root, 'journal.json'))
        ? JSON.parse(readFileSync(join(native.root, 'journal.json'), 'utf8')) as unknown[] : [],
      lock: readFileSync(join(native.root, 'lock.json'), 'utf8'),
    };
  }
  return { native, raw, deps, plan, prediction, publish, disk };
}

export type ProducerFixture = Awaited<ReturnType<typeof makeProducerFixture>>;

export function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
