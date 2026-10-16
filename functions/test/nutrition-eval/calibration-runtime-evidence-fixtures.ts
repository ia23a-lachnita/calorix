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

// ── Task 3 Step 1: shared-core evidence-mode RED fixture (additive only) ────
//
// Everything below is appended after the frozen Task 1 prefix above; no
// existing byte/import/function above this point is modified. The new
// low-level factory `createRuntimeEvidenceCalibrationLedger` does not exist
// yet (Task 3 Step 3 is unimplemented); it is looked up dynamically so a
// missing-feature failure is attributable to that absence, not to this
// fixture or to Task 1/2 behavior. `CalibrationRuntimeEvidenceLedger` and its
// companion types are local structural test interfaces describing the
// approved plan contract; they never weaken real-source typing and are never
// exported as production `.d.ts`.

import { createHash } from 'node:crypto';
import { StrictCalibrationManifestSchema, parseNutritionEvalManifest } from '../../src/nutrition-eval/schema';
import { deriveCanonicalAllowedKeys } from '../../src/nutrition-eval/calibration-bootstrap';
import { measureCalibrationStageReport } from '../../src/nutrition-eval/calibration-report-measurements';
import type { NutritionEvalCase, NutritionPrediction } from '../../src/nutrition-eval/schema';
import { renderNutritionEvalJson, renderNutritionEvalMarkdown } from '../../src/nutrition-eval/report';
import { prepareCalibrationStageReportReconstructor } from '../../src/nutrition-eval/calibration-report-assembly';
import type {
  CalibrationAuthoritativeReportOptions,
  CalibrationKeyResolver,
  CalibrationLedgerDeps,
  CalibrationLiveness,
  CalibrationProfile,
  CalibrationProtocolLedger,
  JournalEntry,
  ReservationKey,
  StageName,
  TokenCountReservationKey,
} from '../../src/nutrition-eval/calibration';
import {
  CALIBRATION_ROOT,
  createProtocolCalibrationLedger,
  evaluateCalibrationStageGate,
  selectCalibrationProfile,
} from '../../src/nutrition-eval/calibration';
import type {
  CalibrationProtocolReportOptions,
  CalibrationStageReportSnapshot,
} from '../../src/nutrition-eval/calibration-report-state';
import type {
  CalibrationPublishedReportReceipt,
  CalibrationReportPublicationResult,
} from '../../src/nutrition-eval/calibration-report-publication';

// ── Local structural future-API types (plan Shared Interfaces, Task 3) ──────

import type {
  RuntimeAttemptRef,
  RuntimeEvidenceEvent,
} from '../../src/nutrition-eval/calibration-runtime-evidence-codec';
import type { RuntimeEvidenceSnapshot } from '../../src/nutrition-eval/calibration-runtime-evidence-state';

export type { RuntimeAttemptRef };
export type { RuntimeEvidenceSnapshot };

export interface CalibrationRuntimeEvidenceLedger extends CalibrationProtocolLedger {
  startRuntimeAttempt(key: unknown): Readonly<RuntimeAttemptRef>;
  startRuntimeOperation(ref: unknown, operation: unknown): void;
  settleRuntimeOperation(ref: unknown, operation: unknown, result: unknown): void;
  authorizeRuntimeRequest(ref: unknown): void;
  finishRuntimeAttempt(ref: unknown): void;
  bindRuntimeStageReport(
    stage: StageName,
    profile: CalibrationProfile,
  ): Readonly<RuntimeEvidenceEvent & { type: 'runtime_report_bound' }>;
  getRuntimeEvidenceSnapshot(): Readonly<RuntimeEvidenceSnapshot>;
}

export type RuntimeCanonicalPlans = RuntimeEvidenceFixtureData['plans'];

export type CreateRuntimeEvidenceCalibrationLedger = (
  deps: CalibrationLedgerDeps,
  identity: CalibrationIdentity,
  keyResolver: CalibrationKeyResolver,
  reportOptions: CalibrationProtocolReportOptions,
  authoritativeOptions: CalibrationAuthoritativeReportOptions,
  runtimeOptions: Readonly<{
    initialOwner: CalibrationOwner;
    plans: RuntimeCanonicalPlans;
    readCurrentGitState: () => Readonly<{
      headCommit: string;
      functionsTreeId: string;
      dirtyPaths: readonly string[];
    }>;
  }>,
) => CalibrationRuntimeEvidenceLedger;

/**
 * Dynamic future-factory lookup. `calibration.ts` already exists (Task 1/2
 * are complete), so a static named import of a still-missing export would
 * crash this whole module at load time and take unrelated old-mode controls
 * down with it. Looking the export up at runtime keeps the failure scoped to
 * exactly the tests that call it.
 */
export async function loadRuntimeEvidenceCalibrationLedgerFactory(): Promise<CreateRuntimeEvidenceCalibrationLedger> {
  const mod: unknown = await import('../../src/nutrition-eval/calibration');
  const candidate = (mod as Record<string, unknown>)['createRuntimeEvidenceCalibrationLedger'];
  if (typeof candidate !== 'function') {
    throw new CalibrationFatalError('calibration:runtime-evidence-core-missing');
  }
  return candidate as unknown as CreateRuntimeEvidenceCalibrationLedger;
}

// ── Owned in-memory ledger deps with independent fault/trace controls ───────

export interface RuntimeEvidenceCoreFaults {
  failNextAppend: boolean;
  failNextFile: boolean;
  failNextDir: boolean;
  failNextJournalAppend: boolean;
  failNextJournalFile: boolean;
  failNextJournalDir: boolean;
  dirtyGitState: boolean;
  afterAppend?: (event: unknown) => void;
  afterFile?: () => void;
  afterDir?: () => void;
  afterJournalAppend?: () => void;
  afterJournalFile?: () => void;
  afterJournalDir?: () => void;
  onReadGitState?: () => Parameters<CalibrationProtocolLedger['assertGitState']>[0];
  onVerify?: () => void;
  onVerified?: (result: Readonly<CalibrationReportPublicationResult>) => Readonly<CalibrationReportPublicationResult>;
}

export interface RuntimeEvidenceCoreBacking {
  lock: CalibrationOwner | undefined;
  liveness: CalibrationLiveness;
  readonly events: unknown[];
  readonly journals: JournalEntry[];
  readonly trace: string[];
  clock: number;
  gitReads: number;
  readonly faults: RuntimeEvidenceCoreFaults;
  readonly deps: CalibrationLedgerDeps;
}

const CORE_FIXTURE_FOREIGN_MARKER = 'FOREIGN-core-fixture-private-bytes';

export function makeRuntimeEvidenceCoreBacking(): RuntimeEvidenceCoreBacking {
  const events: unknown[] = [];
  const journals: JournalEntry[] = [];
  const trace: string[] = [];
  const faults: RuntimeEvidenceCoreFaults = {
    failNextAppend: false,
    failNextFile: false,
    failNextDir: false,
    failNextJournalAppend: false,
    failNextJournalFile: false,
    failNextJournalDir: false,
    dirtyGitState: false,
  };
  const backing: RuntimeEvidenceCoreBacking = {
    lock: undefined,
    liveness: 'live',
    events,
    journals,
    trace,
    clock: 0,
    gitReads: 0,
    faults,
    deps: undefined as unknown as CalibrationLedgerDeps,
  };
  const deps: CalibrationLedgerDeps = {
    getRoot: () => CALIBRATION_ROOT,
    readLock: () => backing.lock === undefined ? undefined : structuredClone(backing.lock),
    writeLockExclusive: (owner: CalibrationOwner) => {
      trace.push('writeLockExclusive');
      if (backing.lock !== undefined) {
        throw new CalibrationFatalError('calibration:fixture-lock-already-held');
      }
      backing.lock = structuredClone(owner);
    },
    archiveLock: (_owner: CalibrationOwner) => {
      trace.push('archiveLock');
      backing.lock = undefined;
    },
    removeLock: (_owner: CalibrationOwner) => {
      trace.push('removeLock');
      backing.lock = undefined;
    },
    appendLedgerEvent: (event: unknown) => {
      trace.push('appendLedgerEvent');
      if (faults.failNextAppend) {
        faults.failNextAppend = false;
        throw Object.assign(new Error(`EIO ${CORE_FIXTURE_FOREIGN_MARKER}`), {
          privateBytes: CORE_FIXTURE_FOREIGN_MARKER,
        });
      }
      events.push(structuredClone(event));
      faults.afterAppend?.(structuredClone(event));
    },
    fsyncLedgerFile: () => {
      trace.push('fsyncLedgerFile');
      if (faults.failNextFile) {
        faults.failNextFile = false;
        throw Object.assign(new Error(`EIO ${CORE_FIXTURE_FOREIGN_MARKER}`), {
          privateBytes: CORE_FIXTURE_FOREIGN_MARKER,
        });
      }
      faults.afterFile?.();
    },
    fsyncLedgerDir: () => {
      trace.push('fsyncLedgerDir');
      if (faults.failNextDir) {
        faults.failNextDir = false;
        throw Object.assign(new Error(`EIO ${CORE_FIXTURE_FOREIGN_MARKER}`), {
          privateBytes: CORE_FIXTURE_FOREIGN_MARKER,
        });
      }
      faults.afterDir?.();
    },
    appendJournal: (entry: JournalEntry) => {
      trace.push('appendJournal');
      if (faults.failNextJournalAppend) {
        faults.failNextJournalAppend = false;
        throw new Error(`EIO ${CORE_FIXTURE_FOREIGN_MARKER}`);
      }
      journals.push(structuredClone(entry));
      faults.afterJournalAppend?.();
    },
    fsyncJournalFile: () => {
      trace.push('fsyncJournalFile');
      if (faults.failNextJournalFile) {
        faults.failNextJournalFile = false;
        throw new Error(`EIO ${CORE_FIXTURE_FOREIGN_MARKER}`);
      }
      faults.afterJournalFile?.();
    },
    fsyncJournalDir: () => {
      trace.push('fsyncJournalDir');
      if (faults.failNextJournalDir) {
        faults.failNextJournalDir = false;
        throw new Error(`EIO ${CORE_FIXTURE_FOREIGN_MARKER}`);
      }
      faults.afterJournalDir?.();
    },
    probeOwnerLiveness: (_owner: CalibrationOwner) => {
      trace.push('probeOwnerLiveness');
      return backing.liveness;
    },
    nowIso: () => {
      backing.clock += 1;
      const minutes = String(Math.floor(backing.clock / 60) % 60).padStart(2, '0');
      const seconds = String(backing.clock % 60).padStart(2, '0');
      return `2026-10-15T00:${minutes}:${seconds}.000Z`;
    },
    readLedgerEvents: () => {
      trace.push('readLedgerEvents');
      return structuredClone(events);
    },
    readJournalEntries: () => {
      trace.push('readJournalEntries');
      return structuredClone(journals);
    },
  };
  (backing as { deps: CalibrationLedgerDeps }).deps = deps;
  return backing;
}

// ── Real (non-native) prediction/journal builders for stage completion ──────
//
// Mirrors the proven exact-prediction/success-journal shape used by the
// existing authoritative report fixtures. These are genuinely schema-valid
// records scored by the real scorer/report assembler through
// `prepareCalibrationStageReportReconstructor`; nothing here is a mock of
// production validation.

export const CORE_PINNED_VERSION = 'gemini-3.8-core-fixture-pin';

export function createCoreExactPrediction(
  evalCase: NutritionEvalCase,
  sampleIndex: number,
): NutritionPrediction {
  const truth = evalCase.truth;
  const prediction: Record<string, unknown> = {
    parseStatus: 'success',
    source: evalCase.scanMode,
    kcal: truth.kcal,
    proteinG: truth.proteinG,
    carbsG: truth.carbsG,
    fatG: truth.fatG,
    confidence: 0.85,
    basis: truth.basis,
    amount: truth.amount,
    unit: truth.unit,
    decision: 'needs_review',
    reviewReasons: [],
    latencyMs: 1500,
    sampleIndex,
    cached: false,
  };
  if (evalCase.expectedBarcode !== undefined) {
    prediction.barcode = evalCase.expectedBarcode;
  }
  if (evalCase.scanMode === 'meal' && truth.referenceMassG !== undefined) {
    prediction.diagnostics = {
      rawNutrients: { kcal: truth.kcal, proteinG: truth.proteinG, carbsG: truth.carbsG, fatG: truth.fatG },
      detectedItemCount: 1,
      estimatedTotalMassG: truth.referenceMassG,
      declaredBasis: truth.basis,
      declaredAmount: truth.amount,
      declaredUnit: truth.unit,
    };
  }
  return prediction as unknown as NutritionPrediction;
}

export function buildCoreSuccessJournal(
  key: ReservationKey,
  prediction: NutritionPrediction,
): JournalEntry {
  const four = {
    kcal: prediction.kcal as number,
    proteinG: prediction.proteinG as number,
    carbsG: prediction.carbsG as number,
    fatG: prediction.fatG as number,
  };
  const mass = prediction.diagnostics?.estimatedTotalMassG;
  return {
    key: { ...key },
    predictionHash: createHash('sha256').update(JSON.stringify(four)).digest('hex'),
    normalizedPrediction: mass === undefined ? { ...four } : { ...four, estimatedTotalMassG: mass },
    analysisLatencyMs: (prediction.latencyMs as number) ?? 1500,
    errorCategory: 'none',
    responseModelVersion: CORE_PINNED_VERSION,
    reportPrediction: prediction,
  };
}

// ── Full core fixture: owned deps + real stage-completion helpers ───────────

export interface RuntimeEvidenceCoreFixture<L extends CalibrationProtocolLedger = CalibrationRuntimeEvidenceLedger> {
  readonly ledger: L;
  readonly owner: Readonly<CalibrationOwner>;
  readonly identity: Readonly<CalibrationIdentity>;
  readonly key: CalibrationReportOutcomeKey;
  readonly evalCase: NutritionEvalCase;
  readonly plans: RuntimeCanonicalPlans;
  readonly events: readonly unknown[];
  readonly journals: readonly JournalEntry[];
  readonly trace: readonly string[];
  readonly faults: RuntimeEvidenceCoreFaults;
  readonly backing: RuntimeEvidenceCoreBacking;
  getCase(caseId: string): NutritionEvalCase;
  createUnacquiredLedger(): L;
  restart(nextOwner: CalibrationOwner): L;
  setLiveness(liveness: CalibrationLiveness): void;
  completeTokenPrerequisites(): void;
  pinOnce(): void;
  completeImageKey(key: CalibrationReportOutcomeKey): void;
  completeOutcomeKey(key: CalibrationReportOutcomeKey): void;
  finishPreflightOutcomes(): void;
  finishPreflight(): void;
  finishDevelopment(): void;
  finishValidation(): void;
  cleanup(): void;
}

export async function makeRuntimeEvidenceCoreFixture(options: Readonly<{ acquire?: boolean }> = {}): Promise<RuntimeEvidenceCoreFixture> {
  return makeCoreFixture('runtime', options);
}

/** Same data/stage builders, actual existing five-argument authoritative factory. */
export async function makeExistingAuthoritativeCoreFixture(options: Readonly<{ acquire?: boolean }> = {}): Promise<RuntimeEvidenceCoreFixture<CalibrationProtocolLedger>> {
  return makeCoreFixture('existing', options);
}

function makeCoreFixture(mode: 'runtime', options?: Readonly<{ acquire?: boolean }>): Promise<RuntimeEvidenceCoreFixture>;
function makeCoreFixture(mode: 'existing', options?: Readonly<{ acquire?: boolean }>): Promise<RuntimeEvidenceCoreFixture<CalibrationProtocolLedger>>;
async function makeCoreFixture(mode: 'runtime' | 'existing', options: Readonly<{ acquire?: boolean }> = {}): Promise<RuntimeEvidenceCoreFixture<CalibrationProtocolLedger>> {
  const data = await makeRuntimeEvidenceData();
  const factory = mode === 'runtime' ? await loadRuntimeEvidenceCalibrationLedgerFactory() : undefined;
  const backing = makeRuntimeEvidenceCoreBacking();
  const owner: CalibrationOwner = { ...data.header.owner };
  const identity: CalibrationIdentity = { ...data.header.identity };

  // Reservation plans have 146 image keys; report plans have 158 outcomes.
  // In particular the twelve public barcode outcomes are NOT reservations.
  const keyResolver: CalibrationKeyResolver = (selectedProfile) =>
    deriveCanonicalAllowedKeys({ ...data.context.files }, selectedProfile);

  const reportOptions: CalibrationProtocolReportOptions = {
    getReportOutcomePlan: (selectedProfile) =>
      selectedProfile === undefined
        ? data.plans.initial
        : selectedProfile === 'LOW' ? data.plans.LOW : data.plans.MEDIUM,
  };

  const reconstructor = await prepareCalibrationStageReportReconstructor(data.context);

  // Trusted UNIT seam: reconstructs/scorers real synthetic journals, never
  // claims on-disk publication or native artifact verification.
  const verifyStageReportArtifacts = (
    params: Readonly<{ stage: StageName; profile: CalibrationProfile; snapshot: CalibrationStageReportSnapshot }>,
  ): Readonly<CalibrationReportPublicationResult> => {
    backing.faults.onVerify?.();
    const report = reconstructor.reconstruct(params);
    const json = renderNutritionEvalJson(report);
    const markdown = renderNutritionEvalMarkdown(report);
    const receipt: CalibrationPublishedReportReceipt = {
      stage: params.stage,
      profile: params.profile,
      runId: report.runId,
      jsonSha256: createHash('sha256').update(json, 'utf8').digest('hex'),
      markdownSha256: createHash('sha256').update(markdown, 'utf8').digest('hex'),
    };
    const result = Object.freeze({ report, receipt: Object.freeze({ ...receipt }) });
    return backing.faults.onVerified?.(result) ?? result;
  };
  const authoritativeOptions: CalibrationAuthoritativeReportOptions = { verifyStageReportArtifacts };

  const readCurrentGitState = () => {
    backing.gitReads += 1;
    backing.trace.push('readCurrentGitState');
    if (backing.faults.onReadGitState !== undefined) return backing.faults.onReadGitState();
    return {
      headCommit: 'a'.repeat(40),
      functionsTreeId: identity.functionsTreeId,
      dirtyPaths: backing.faults.dirtyGitState ? ['functions/core-fixture-dirty.ts'] : [],
    };
  };

  function build(initialOwner: CalibrationOwner): CalibrationProtocolLedger {
    if (factory === undefined) {
      return createProtocolCalibrationLedger(backing.deps, identity, keyResolver, reportOptions, authoritativeOptions);
    }
    return factory(backing.deps, identity, keyResolver, reportOptions, authoritativeOptions, {
      initialOwner,
      plans: data.plans,
      readCurrentGitState,
    });
  }

  const ledger = build(owner);
  if (options.acquire !== false) ledger.acquireLock(owner);
  // This is a real future ledger only in runtime mode, never a mock adapter
  // pretending the old factory implements runtime APIs.
  const runtime = mode === 'runtime' ? ledger as CalibrationRuntimeEvidenceLedger : undefined;

  const manifest = StrictCalibrationManifestSchema.parse(
    JSON.parse(data.context.files['calibration-manifest']),
  );
  const casesById = new Map<string, NutritionEvalCase>(
    [...manifest.cases, ...parseNutritionEvalManifest(JSON.parse(data.context.files['public-manifest'])).cases]
      .map((evalCase) => [evalCase.id, evalCase]),
  );
  function getCase(caseId: string): NutritionEvalCase {
    const found = casesById.get(caseId);
    if (found === undefined) {
      throw new CalibrationFatalError('calibration:fixture-unknown-case');
    }
    return found;
  }

  let pinned = false;
  function pinOnce(): void {
    if (!pinned) {
      ledger.pinModelVersion(CORE_PINNED_VERSION);
      pinned = true;
    }
  }

  let tokensCompleted = false;
  function completeTokenPrerequisites(): void {
    if (tokensCompleted) return;
    const tokenKey: TokenCountReservationKey = {
      kind: 'token_count', stage: 'preflight', caseId: data.key.caseId, model: identity.model,
    };
    ledger.reserveTokenCount(tokenKey);
    ledger.completeTokenCount(tokenKey, 1200);
    tokensCompleted = true;
  }

  function completeOutcomeKey(key: CalibrationReportOutcomeKey): void {
    const evalCase = getCase(key.caseId);
    const prediction = createCoreExactPrediction(evalCase, key.sampleIndex);
    const reservationKey: ReservationKey = { ...key };
    const ref = runtime?.startRuntimeAttempt(reservationKey);
    if (evalCase.scanMode === 'barcode') {
      if (runtime !== undefined && ref !== undefined) {
        runtime.startRuntimeOperation(ref, 'snapshot');
        runtime.settleRuntimeOperation(ref, 'snapshot', 'returned');
      }
      ledger.recordNonReservationResult({ key: reservationKey, reason: 'barcode', prediction });
      if (runtime !== undefined && ref !== undefined) runtime.finishRuntimeAttempt(ref);
      return;
    }
    if (runtime !== undefined && ref !== undefined) {
      runtime.startRuntimeOperation(ref, 'image');
      runtime.settleRuntimeOperation(ref, 'image', 'returned');
      runtime.startRuntimeOperation(ref, 'vision');
    }
    ledger.reserve(reservationKey);
    if (runtime !== undefined && ref !== undefined) runtime.authorizeRuntimeRequest(ref);
    pinOnce();
    if (runtime !== undefined && ref !== undefined) runtime.settleRuntimeOperation(ref, 'vision', 'returned');
    const journal = buildCoreSuccessJournal(reservationKey, prediction);
    const hash = ledger.appendResultJournal(journal);
    ledger.complete(reservationKey, hash);
    if (runtime !== undefined && ref !== undefined) runtime.finishRuntimeAttempt(ref);
  }

  function completeImageKey(key: CalibrationReportOutcomeKey): void {
    if (getCase(key.caseId).scanMode === 'barcode') {
      throw new CalibrationFatalError('calibration:fixture-barcode-not-image');
    }
    completeOutcomeKey(key);
  }

  function finishPreflightOutcomes(): void {
    const low = data.plans.initial.find(
      (row) => row.key.stage === 'preflight' && row.key.profile === 'LOW',
    )!.key;
    const medium = data.plans.initial.find(
      (row) => row.key.stage === 'preflight' && row.key.profile === 'MEDIUM',
    )!.key;
    completeTokenPrerequisites();
    completeImageKey(low);
    completeImageKey(medium);
  }

  function measuredPair(stage: StageName, profile: CalibrationProfile) {
    return measureCalibrationStageReport(reconstructor.reconstruct({
      stage, profile, snapshot: ledger.getStageReportSnapshot(stage, profile),
    }));
  }

  function admitAndBind(stage: StageName, profile: CalibrationProfile): void {
    ledger.admitStageReportReceipt(stage, profile);
    runtime?.bindRuntimeStageReport(stage, profile);
  }

  function finishPreflight(): void {
    finishPreflightOutcomes();
    for (const profile of ['LOW', 'MEDIUM'] as const) {
      const measured = measuredPair('preflight', profile);
      if (measured.stage.totalOutcomes !== 1 || measured.stage.parseCases !== 1
          || measured.stage.failureCount !== 0 || measured.stage.unsafeCompletionCount !== 0) {
        throw new CalibrationFatalError('calibration:fixture-preflight-failed');
      }
      admitAndBind('preflight', profile);
    }
    ledger.completeStage('preflight', { stage: 'preflight', passed: true, completedStages: [] });
  }

  function finishDevelopment(): void {
    const rows = data.plans.initial.filter((row) => row.key.stage === 'development');
    for (const row of rows) completeImageKey(row.key);
    const low = measuredPair('development', 'LOW');
    const medium = measuredPair('development', 'MEDIUM');
    const selected = selectCalibrationProfile(low.profile, medium.profile);
    // Synthetic exact outcomes have identical metrics/latency for both
    // profiles. The existing core independently verifies this decision.
    if (selected !== 'MEDIUM') throw new CalibrationFatalError('calibration:fixture-expected-profile-tie');
    const passed = evaluateCalibrationStageGate('development', medium.stage).passed;
    admitAndBind('development', 'LOW');
    admitAndBind('development', 'MEDIUM');
    ledger.recordProfileSelection(selected, 'default_medium_tie_breaker', {
      stage: 'development',
      passed,
      completedStages: ['preflight'],
    });
    ledger.completeStage('development', {
      stage: 'development',
      passed,
      completedStages: ['preflight'],
    });
  }

  function finishValidation(): void {
    const selected = ledger.getSelectedProfile();
    if (selected === undefined) throw new CalibrationFatalError('calibration:fixture-profile-required');
    const rows = data.plans[selected].filter((row) => row.key.stage === 'validation');
    for (const row of rows) completeImageKey(row.key);
    const passed = evaluateCalibrationStageGate('validation', measuredPair('validation', selected).stage).passed;
    admitAndBind('validation', selected);
    ledger.completeStage('validation', {
      stage: 'validation',
      passed,
      completedStages: ['preflight', 'development'],
    });
  }

  function createUnacquiredLedger(): CalibrationProtocolLedger {
    return build(owner);
  }

  function restart(nextOwner: CalibrationOwner): CalibrationProtocolLedger {
    return build(nextOwner);
  }

  function setLiveness(liveness: CalibrationLiveness): void {
    backing.liveness = liveness;
  }

  function cleanup(): void {
    backing.events.length = 0;
    backing.journals.length = 0;
    backing.trace.length = 0;
  }

  return {
    ledger,
    owner: Object.freeze({ ...owner }),
    identity: Object.freeze({ ...identity }),
    key: { ...data.key },
    evalCase: getCase(data.key.caseId),
    plans: data.plans,
    events: backing.events,
    journals: backing.journals,
    trace: backing.trace,
    faults: backing.faults,
    backing,
    getCase,
    createUnacquiredLedger,
    restart,
    setLiveness,
    completeTokenPrerequisites,
    pinOnce,
    completeImageKey,
    completeOutcomeKey,
    finishPreflightOutcomes,
    finishPreflight,
    finishDevelopment,
    finishValidation,
    cleanup,
  };
}

// ── Task 4 Step 1: native disk fixture (additive only) ───────────────────────
//
// Everything below is appended after the frozen 29360-byte prefix above; no
// existing byte/import/function above this point is modified. The guarded
// store factory `createRuntimeEvidenceFileCalibrationLedgerDeps` does not exist
// in `calibration-file-store.ts` yet and the native assembly module
// `calibration-runtime-evidence-ledger.ts` does not exist yet (Task 4 Step 3
// unimplemented). Both are looked up dynamically so a missing-feature failure
// is attributable to that absence, not to this fixture or to Tasks 1–3.
// `RuntimeEvidenceFileStoreOverrides` is the exact plan Pick of eight
// low-level seams; no high-level writeExclusiveSync/fsyncFileSync, injected
// plans/verifier/Git-reader/provider/alternate root is admitted.

import { execFileSync as execFileSyncNativeTask4 } from 'node:child_process';
import {
  mkdirSync as mkdirSyncNativeTask4,
  mkdtempSync as mkdtempSyncNativeTask4,
  rmSync as rmSyncNativeTask4,
  writeFileSync as writeFileSyncNativeTask4,
} from 'node:fs';
import { tmpdir as tmpdirNativeTask4 } from 'node:os';
import { join as joinNativeTask4 } from 'node:path';
import type { CalibrationFileStoreOverrides as CalibrationFileStoreOverridesTask4Base } from '../../src/nutrition-eval/calibration-file-store';
import { createFileCalibrationLedgerDeps as createFileCalibrationLedgerDepsTask4Base } from '../../src/nutrition-eval/calibration-file-store';
import { createCalibrationBootstrapReadDeps as createCalibrationBootstrapReadDepsTask4Base } from '../../src/nutrition-eval/calibration-bootstrap';
import { prepareCalibrationStageReportArtifactVerifier as prepareVerifierTask4Base } from '../../src/nutrition-eval/calibration-report-artifact-verification';

export type RuntimeEvidenceFileStoreOverrides = Pick<
  CalibrationFileStoreOverridesTask4Base,
  | 'procStatReader'
  | 'nowIso'
  | 'renameSync'
  | 'fsyncDirSync'
  | 'fdWriteSync'
  | 'fdFsyncSync'
  | 'fdCloseSync'
  | 'linkSync'
  | 'unlinkSync'
>;

export type CreateRuntimeEvidenceFileLedgerDepsTask4 = (
  baseDir: string,
  owner: CalibrationOwner,
  overrides?: RuntimeEvidenceFileStoreOverrides,
) => CalibrationLedgerDeps;

export async function loadRuntimeEvidenceFileLedgerDepsFactoryTask4(): Promise<CreateRuntimeEvidenceFileLedgerDepsTask4> {
  const mod: unknown = await import('../../src/nutrition-eval/calibration-file-store');
  const candidate = (mod as Record<string, unknown>)['createRuntimeEvidenceFileCalibrationLedgerDeps'];
  if (typeof candidate !== 'function') {
    throw new CalibrationFatalError('calibration:runtime-evidence-native-missing');
  }
  return candidate as unknown as CreateRuntimeEvidenceFileLedgerDepsTask4;
}

export type PrepareNativeLedgerTask4 = (
  params: unknown,
  overrides?: RuntimeEvidenceFileStoreOverrides,
) => Promise<CalibrationRuntimeEvidenceLedger>;

export async function loadPrepareNativeLedgerFactoryTask4(): Promise<PrepareNativeLedgerTask4> {
  const mod: unknown = await import('../../src/nutrition-eval/calibration-runtime-evidence-ledger');
  const candidate = (mod as Record<string, unknown>)['prepareNativeCalibrationRuntimeEvidenceLedger'];
  if (typeof candidate !== 'function') {
    throw new CalibrationFatalError('calibration:runtime-evidence-native-missing');
  }
  return candidate as unknown as PrepareNativeLedgerTask4;
}

function nativeTmpBaseTask4(): string {
  const env: unknown = process.env.TMPDIR;
  if (typeof env === 'string' && env.length > 0) {
    return env;
  }
  return tmpdirNativeTask4();
}

function gitTask4(repoDir: string, argv: readonly string[]): string {
  const args: string[] = [...argv];
  const out: unknown = execFileSyncNativeTask4('git', args, { cwd: repoDir, encoding: 'utf8' });
  if (typeof out !== 'string') {
    throw new CalibrationFatalError('calibration:fixture-git-failed');
  }
  return out;
}

export interface MiniGitRepoTask4 {
  readonly root: string;
  readonly headCommit: string;
}

export function makeMiniGitRepoTask4(ownedRoots: string[]): MiniGitRepoTask4 {
  const base = nativeTmpBaseTask4();
  const root = mkdtempSyncNativeTask4(joinNativeTask4(base, 'calorix-mini-git-'));
  ownedRoots.push(root);
  gitTask4(root, ['init']);
  gitTask4(root, ['config', 'user.name', 'calorix-fixture']);
  gitTask4(root, ['config', 'user.email', 'fixture@calorix.test']);
  gitTask4(root, ['config', 'commit.gpgsign', 'false']);
  const functionsDir = joinNativeTask4(root, 'functions');
  mkdirSyncNativeTask4(functionsDir, { recursive: true });
  writeFileSyncNativeTask4(joinNativeTask4(functionsDir, 'marker.txt'), 'functions-marker\n');
  writeFileSyncNativeTask4(joinNativeTask4(root, 'README.md'), '# fixture\n');
  gitTask4(root, ['add', 'functions/marker.txt', 'README.md']);
  gitTask4(root, ['commit', '-m', 'fixture init']);
  const head = gitTask4(root, ['rev-parse', 'HEAD']).trim();
  const readDeps = createCalibrationBootstrapReadDepsTask4Base(root);
  const state = readDeps.readGitState();
  if (typeof state.headCommit !== 'string' || state.headCommit.length !== 40) {
    throw new CalibrationFatalError('calibration:fixture-git-state-invalid');
  }
  void state.functionsTreeId;
  return { root, headCommit: head };
}

export interface ExistingNativeBootFixtureTask4 {
  readonly context: CalibrationPreparedContext;
  readonly plans: RuntimeCanonicalPlans;
  readonly key: CalibrationReportOutcomeKey;
  readonly ledgerRoot: string;
  readonly deps: CalibrationLedgerDeps;
}

export async function makeExistingNativeBootFixtureTask4(ownedRoots: string[]): Promise<ExistingNativeBootFixtureTask4> {
  const data = await makeRuntimeEvidenceData();
  const base = nativeTmpBaseTask4();
  const ledgerRoot = mkdtempSyncNativeTask4(joinNativeTask4(base, 'calorix-native-boot-'));
  ownedRoots.push(ledgerRoot);
  const deps = createFileCalibrationLedgerDepsTask4Base(ledgerRoot);
  const verifier = await prepareVerifierTask4Base(data.context);
  void verifier;
  return { context: data.context, plans: data.plans, key: data.key, ledgerRoot, deps };
}

export interface RuntimeEvidenceNativeFaultsTask4 {
  failNextLedgerDirFsync: boolean;
  failNextLedgerFileFsync: boolean;
  failNextLedgerClose: boolean;
  failNextLedgerRename: boolean;
  failNextLedgerWrite: boolean;
}

export interface RuntimeEvidenceNativeFixtureTask4 {
  readonly ledger: CalibrationRuntimeEvidenceLedger;
  readonly owner: Readonly<CalibrationOwner>;
  readonly key: CalibrationReportOutcomeKey;
  readonly context: CalibrationPreparedContext;
  readonly root: string;
  readonly gitRoot: string;
  readonly trace: readonly string[];
  readonly faults: RuntimeEvidenceNativeFaultsTask4;
  completeTokenPrerequisites(): void;
  finishPreflight(): Promise<void>;
  restart(nextOwner: CalibrationOwner): Promise<CalibrationRuntimeEvidenceLedger>;
  createUnacquiredLedger(): Promise<CalibrationRuntimeEvidenceLedger>;
  cleanup(): void;
}

export async function makeRuntimeEvidenceNativeFixture(
  ownedRoots: string[] = [],
): Promise<RuntimeEvidenceNativeFixtureTask4> {
  const base = nativeTmpBaseTask4();
  const ledgerRoot = mkdtempSyncNativeTask4(joinNativeTask4(base, 'calorix-native-ledger-'));
  ownedRoots.push(ledgerRoot);
  const git = makeMiniGitRepoTask4(ownedRoots);
  const data = await makeRuntimeEvidenceData();
  const createGuardedDeps = await loadRuntimeEvidenceFileLedgerDepsFactoryTask4();
  void createGuardedDeps;
  const prepareNative = await loadPrepareNativeLedgerFactoryTask4();
  const trace: string[] = [];
  const faults: RuntimeEvidenceNativeFaultsTask4 = {
    failNextLedgerDirFsync: false,
    failNextLedgerFileFsync: false,
    failNextLedgerClose: false,
    failNextLedgerRename: false,
    failNextLedgerWrite: false,
  };
  const overrides: RuntimeEvidenceFileStoreOverrides = {
    procStatReader: (_pid: number): string => {
      trace.push('ledger:proc-stat:read');
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    },
    nowIso: (): string => {
      trace.push('ledger:now');
      return '2026-10-14T00:00:00.000Z';
    },
    renameSync: (_from: string, _to: string): void => {
      trace.push('ledger:rename');
      if (faults.failNextLedgerRename) {
        faults.failNextLedgerRename = false;
        trace.push('ledger:rename:fault');
        throw new CalibrationFatalError('calibration:ledger-persist-failed');
      }
    },
    fsyncDirSync: (_dir: string): void => {
      trace.push('ledger:dir-fsync');
      if (faults.failNextLedgerDirFsync) {
        faults.failNextLedgerDirFsync = false;
        trace.push('ledger:dir-fsync:fault');
        throw new CalibrationFatalError('calibration:ledger-persist-failed');
      }
    },
    fdWriteSync: (_fd: number, _buffer: Buffer, _offset: number, _length: number): number => {
      trace.push('ledger:fd-write');
      if (faults.failNextLedgerWrite) {
        faults.failNextLedgerWrite = false;
        trace.push('ledger:fd-write:fault');
        throw new CalibrationFatalError('calibration:ledger-persist-failed');
      }
      return _length;
    },
    fdFsyncSync: (_fd: number): void => {
      trace.push('ledger:fd-fsync');
      if (faults.failNextLedgerFileFsync) {
        faults.failNextLedgerFileFsync = false;
        trace.push('ledger:fd-fsync:fault');
        throw new CalibrationFatalError('calibration:ledger-persist-failed');
      }
    },
    fdCloseSync: (_fd: number): void => {
      trace.push('ledger:fd-close');
      if (faults.failNextLedgerClose) {
        faults.failNextLedgerClose = false;
        trace.push('ledger:fd-close:fault');
        throw new CalibrationFatalError('calibration:ledger-persist-failed');
      }
    },
    linkSync: (_from: string, _to: string): void => {
      trace.push('ledger:link');
    },
    unlinkSync: (_path: string): void => {
      trace.push('ledger:unlink');
    },
  };
  const owner: CalibrationOwner = { ...data.header.owner };
  const params: unknown = { context: data.context };
  const ledger = await prepareNative(params, overrides);
  ledger.acquireLock(owner);
  const tokenKey = {
    kind: 'token_count' as const,
    stage: 'preflight' as const,
    caseId: data.key.caseId,
    model: data.context.identity.model,
  };
  let tokensDone = false;
  function completeTokenPrerequisites(): void {
    if (tokensDone) {
      return;
    }
    ledger.reserveTokenCount(tokenKey);
    ledger.completeTokenCount(tokenKey, 1200);
    tokensDone = true;
  }
  async function finishPreflight(): Promise<void> {
    completeTokenPrerequisites();
    const lowKey = { ...data.key };
    const mediumKey = { ...data.key, profile: 'MEDIUM' as const };
    const lowRef = ledger.startRuntimeAttempt(lowKey);
    ledger.startRuntimeOperation(lowRef, 'image');
    ledger.settleRuntimeOperation(lowRef, 'image', 'returned');
    ledger.startRuntimeOperation(lowRef, 'vision');
    ledger.reserve(lowKey);
    ledger.authorizeRuntimeRequest(lowRef);
    ledger.settleRuntimeOperation(lowRef, 'vision', 'returned');
    ledger.finishRuntimeAttempt(lowRef);
    const mediumRef = ledger.startRuntimeAttempt(mediumKey);
    ledger.startRuntimeOperation(mediumRef, 'image');
    ledger.settleRuntimeOperation(mediumRef, 'image', 'returned');
    ledger.startRuntimeOperation(mediumRef, 'vision');
    ledger.reserve(mediumKey);
    ledger.authorizeRuntimeRequest(mediumRef);
    ledger.settleRuntimeOperation(mediumRef, 'vision', 'returned');
    ledger.finishRuntimeAttempt(mediumRef);
    ledger.admitStageReportReceipt('preflight', 'LOW');
    ledger.admitStageReportReceipt('preflight', 'MEDIUM');
  }
  async function restart(nextOwner: CalibrationOwner): Promise<CalibrationRuntimeEvidenceLedger> {
    const fresh = await prepareNative(params, overrides);
    fresh.acquireLock(nextOwner);
    return fresh;
  }
  async function createUnacquiredLedger(): Promise<CalibrationRuntimeEvidenceLedger> {
    return prepareNative(params, overrides);
  }
  function cleanup(): void {
    try {
      rmSyncNativeTask4(ledgerRoot, { recursive: true, force: true });
    } catch {
      // best-effort owned cleanup only
    }
    try {
      rmSyncNativeTask4(git.root, { recursive: true, force: true });
    } catch {
      // best-effort owned cleanup only
    }
  }
  return {
    ledger,
    owner: Object.freeze({ ...owner }),
    key: { ...data.key },
    context: data.context,
    root: ledgerRoot,
    gitRoot: git.root,
    trace,
    faults,
    completeTokenPrerequisites,
    finishPreflight,
    restart,
    createUnacquiredLedger,
    cleanup,
  };
}
