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
  dirtyGitState: boolean;
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
    },
    fsyncLedgerFile: () => {
      trace.push('fsyncLedgerFile');
      if (faults.failNextFile) {
        faults.failNextFile = false;
        throw Object.assign(new Error(`EIO ${CORE_FIXTURE_FOREIGN_MARKER}`), {
          privateBytes: CORE_FIXTURE_FOREIGN_MARKER,
        });
      }
    },
    fsyncLedgerDir: () => {
      trace.push('fsyncLedgerDir');
      if (faults.failNextDir) {
        faults.failNextDir = false;
        throw Object.assign(new Error(`EIO ${CORE_FIXTURE_FOREIGN_MARKER}`), {
          privateBytes: CORE_FIXTURE_FOREIGN_MARKER,
        });
      }
    },
    appendJournal: (entry: JournalEntry) => {
      trace.push('appendJournal');
      journals.push(structuredClone(entry));
    },
    fsyncJournalFile: () => trace.push('fsyncJournalFile'),
    fsyncJournalDir: () => trace.push('fsyncJournalDir'),
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

export async function makeRuntimeEvidenceCoreFixture(): Promise<RuntimeEvidenceCoreFixture> {
  return makeCoreFixture('runtime');
}

/** Same data/stage builders, actual existing five-argument authoritative factory. */
export async function makeExistingAuthoritativeCoreFixture(): Promise<RuntimeEvidenceCoreFixture<CalibrationProtocolLedger>> {
  return makeCoreFixture('existing');
}

function makeCoreFixture(mode: 'runtime'): Promise<RuntimeEvidenceCoreFixture>;
function makeCoreFixture(mode: 'existing'): Promise<RuntimeEvidenceCoreFixture<CalibrationProtocolLedger>>;
async function makeCoreFixture(mode: 'runtime' | 'existing'): Promise<RuntimeEvidenceCoreFixture<CalibrationProtocolLedger>> {
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
    return Object.freeze({ report, receipt: Object.freeze({ ...receipt }) });
  };
  const authoritativeOptions: CalibrationAuthoritativeReportOptions = { verifyStageReportArtifacts };

  const readCurrentGitState = () => {
    backing.gitReads += 1;
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
  ledger.acquireLock(owner);
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
