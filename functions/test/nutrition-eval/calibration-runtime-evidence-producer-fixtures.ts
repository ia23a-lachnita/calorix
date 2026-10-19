/** Owned native composition fixtures; no producer import or live client. */
import { closeSync, constants, existsSync, fstatSync, fsyncSync, openSync, readFileSync, readlinkSync, renameSync, writeSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect } from 'vitest';
import { CALIBRATION_ROOT } from '../../src/nutrition-eval/calibration';
import type { CalibrationSafeErrorCategory, JournalEntry } from '../../src/nutrition-eval/calibration';
import { createCalibrationBootstrapReadDeps, deriveCanonicalReportOutcomePlan, prepareCalibrationBootstrapContext } from '../../src/nutrition-eval/calibration-bootstrap';
import type { RuntimeEvidenceFileStoreOverrides } from '../../src/nutrition-eval/calibration-file-store';
import { prepareNativeCalibrationRuntimeEvidenceLedger } from '../../src/nutrition-eval/calibration-runtime-evidence-ledger';
import { captureCalibrationReportJournalEntry, captureCalibrationReportPrediction } from '../../src/nutrition-eval/calibration-report-journal';
import type { CalibrationReportOutcomeKey } from '../../src/nutrition-eval/calibration-report-state';
import { parseNutritionEvalManifest, StrictCalibrationManifestSchema } from '../../src/nutrition-eval/schema';
import type { NutritionPrediction } from '../../src/nutrition-eval/schema';
import { buildRuntimeHarness } from './calibration-runtime-capabilities-fixtures';
import {
  buildCoreSuccessJournal,
  CORE_PINNED_VERSION,
  createCoreExactPrediction,
  makeRuntimeEvidenceNativeFixture,
  makeMiniGitRepoTask4,
} from './calibration-runtime-evidence-fixtures';

export function failurePrediction(
  key: CalibrationReportOutcomeKey, source: 'meal' | 'label' | 'barcode',
  kind: 'provider' | 'schema' | 'product',
): NutritionPrediction {
  return captureCalibrationReportPrediction({
    parseStatus: 'failure', source, decision: 'error', failureCategory: kind,
    failureCode: kind === 'provider' ? 'provider_request_failed'
      : kind === 'schema' ? 'model_response_invalid' : 'off_product_not_found',
    ...(kind === 'schema' ? { failureDetail: 'invalid_json' } : {}),
    latencyMs: 9, sampleIndex: key.sampleIndex, cached: false,
  });
}

/** Pure image-journal construction; barcode uses the non-reservation codec. */
export function buildProducerResultJournal(
  key: CalibrationReportOutcomeKey, prediction: NutritionPrediction,
  category: CalibrationSafeErrorCategory, responseModelVersion: string,
): JournalEntry {
  return prediction.parseStatus === 'failure'
    ? captureCalibrationReportJournalEntry({
      key, predictionHash: category, normalizedPrediction: null,
      analysisLatencyMs: prediction.latencyMs, errorCategory: category,
      responseModelVersion: 'n/a', reportPrediction: prediction,
    })
    : captureCalibrationReportJournalEntry({ ...buildCoreSuccessJournal(key, prediction), responseModelVersion });
}

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

  function publishPrediction(
    key: CalibrationReportOutcomeKey, value: NutritionPrediction,
    category: CalibrationSafeErrorCategory, responseModelVersion: string,
  ): void {
    if (value.source === 'barcode') {
      native.ledger.recordNonReservationResult({ key, reason: 'barcode', prediction: value });
      return;
    }
    const hash = native.ledger.appendResultJournal(buildProducerResultJournal(key, value, category, responseModelVersion));
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
  return { native, raw, deps, plan, prediction, publish, publishPrediction, disk };
}

export type ProducerFixture = Awaited<ReturnType<typeof makeProducerFixture>>;

export function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

export type ProducerFaultOp = 'write' | 'file-fsync' | 'close' | 'rename' | 'dir-fsync';
export type ProducerFaultBoundary = 'attempt' | 'image-start' | 'image-settle' |
  'vision-start' | 'reserve' | 'authorize' | 'pin' | 'vision-settle' |
  'journal' | 'terminal' | 'finish';
export interface ProducerFaultArm {
  readonly boundary: ProducerFaultBoundary;
  readonly operation: ProducerFaultOp;
  readonly effect: 'before' | 'after';
}
export interface ProducerFaultWitness {
  readonly trace: readonly string[];
  readonly fired: () => boolean;
  readonly arm: (fault: ProducerFaultArm) => void;
  readonly overrides: RuntimeEvidenceFileStoreOverrides;
}
type FaultFile = {
  readonly path: string;
  readonly dev: number;
  readonly ino: number;
  readonly boundary: ProducerFaultBoundary | undefined;
};

/** Test-only delegates; authority stays with real native files and ledger. */
export function makeProducerFaultWitness(root: string): ProducerFaultWitness {
  const canonicalRoot = resolve(root);
  const trace: string[] = [];
  const descriptors = new Map<number, FaultFile>();
  const temps = new Map<string, FaultFile>();
  let pendingDirectory: FaultFile | undefined;
  let armed: ProducerFaultArm | undefined;
  let didFire = false;

  function boundary(path: string, buffer: Buffer): ProducerFaultBoundary | undefined {
    if (path.startsWith(join(canonicalRoot, 'journal.json.tmp.'))) return 'journal';
    if (!path.startsWith(join(canonicalRoot, 'ledger.json.tmp.'))) return undefined;
    const parsed: unknown = JSON.parse(buffer.toString('utf8'));
    if (!Array.isArray(parsed)) throw new Error('producer-fault-fixture-array-required');
    const last: unknown = parsed.at(-1);
    if (typeof last !== 'object' || last === null) return undefined;
    const row = last as Record<string, unknown>;
    switch (row.type) {
      case 'runtime_attempt_started': return 'attempt';
      case 'runtime_operation_started':
        return row.operation === 'image' ? 'image-start' : row.operation === 'vision' ? 'vision-start' : undefined;
      case 'runtime_operation_settled':
        return row.operation === 'image' ? 'image-settle' : row.operation === 'vision' ? 'vision-settle' : undefined;
      case 'reserved': return 'reserve';
      case 'runtime_request_authorized': return 'authorize';
      case 'model_version_pinned': return 'pin';
      case 'completed': return 'terminal';
      case 'runtime_attempt_finished': return 'finish';
      default: return undefined;
    }
  }
  function descriptor(fd: number): FaultFile | undefined {
    const file = descriptors.get(fd);
    if (file === undefined) return undefined;
    const stat = fstatSync(fd);
    if (stat.dev !== file.dev || stat.ino !== file.ino) {
      descriptors.delete(fd);
      throw new Error('producer-fault-fixture-descriptor-reused');
    }
    return file;
  }
  function around<T>(file: FaultFile | undefined, operation: ProducerFaultOp, action: () => T): T {
    const label = `${file?.boundary ?? 'setup'}/${operation}`;
    trace.push(`${label}:entered`);
    const matched = !didFire && armed !== undefined && file?.boundary === armed.boundary && operation === armed.operation;
    if (matched && armed?.effect === 'before') {
      didFire = true;
      trace.push(`${label}:fault-before`);
      throw new Error('producer-fixture-fault');
    }
    const result = action();
    trace.push(`${label}:completed`);
    if (matched && armed?.effect === 'after') {
      didFire = true;
      trace.push(`${label}:fault-after`);
      throw new Error('producer-fixture-fault');
    }
    return result;
  }
  const overrides: RuntimeEvidenceFileStoreOverrides = {
    fdWriteSync(fd, buffer, offset, length) {
      if (offset === 0) {
        const stat = fstatSync(fd);
        const path = readlinkSync(`/proc/self/fd/${fd}`);
        const file = { path, dev: stat.dev, ino: stat.ino, boundary: boundary(path, buffer) };
        descriptors.set(fd, file);
        temps.set(path, file);
      }
      return around(descriptor(fd), 'write', () => writeSync(fd, buffer, offset, length));
    },
    fdFsyncSync(fd) {
      around(descriptor(fd), 'file-fsync', () => fsyncSync(fd));
    },
    fdCloseSync(fd) {
      const file = descriptor(fd);
      try { around(file, 'close', () => closeSync(fd)); }
      finally { descriptors.delete(fd); }
    },
    renameSync(from, to) {
      const file = temps.get(from);
      if (file !== undefined && to !== join(canonicalRoot, file.boundary === 'journal' ? 'journal.json' : 'ledger.json')) {
        throw new Error('producer-fault-fixture-destination-mismatch');
      }
      around(file, 'rename', () => {
        renameSync(from, to);
        pendingDirectory = file;
      });
    },
    fsyncDirSync(dir) {
      const file = resolve(dir) === canonicalRoot ? pendingDirectory : undefined;
      try {
        around(file, 'dir-fsync', () => {
          const fd = openSync(dir, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
          try { fsyncSync(fd); }
          finally { closeSync(fd); }
        });
      } finally {
        if (resolve(dir) === canonicalRoot) pendingDirectory = undefined;
      }
    },
  };
  return Object.freeze({
    trace,
    fired: () => didFire,
    arm(fault: ProducerFaultArm) {
      if (armed !== undefined) throw new Error('producer-fault-fixture-already-armed');
      armed = Object.freeze({ ...fault });
      didFire = false;
      trace.length = 0;
    },
    overrides,
  });
}

export async function makeProducerFaultFixture(ownedRoots: string[]) {
  const mini = makeMiniGitRepoTask4(ownedRoots);
  const context = await prepareCalibrationBootstrapContext(createCalibrationBootstrapReadDeps(mini.root));
  const root = resolve(context.baseDir, CALIBRATION_ROOT);
  const faults = makeProducerFaultWitness(root);
  const ledger = await prepareNativeCalibrationRuntimeEvidenceLedger({ context }, faults.overrides);
  ledger.acquireLock(context.owner);
  const tokenKey = { kind: 'token_count' as const, stage: 'preflight' as const,
    caseId: context.firstDevelopmentCaseId, model: context.identity.model };
  ledger.reserveTokenCount(tokenKey);
  ledger.completeTokenCount(tokenKey, 1200);
  return Object.freeze({ context, ledger, root, faults });
}
