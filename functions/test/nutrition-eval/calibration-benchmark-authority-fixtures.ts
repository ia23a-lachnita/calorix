/**
 * Calibration benchmark authority fixtures (Task 2 Step 1 and Step 2).
 *
 * buildBenchmarkTemplate (Step 1) is old-capability foundation only: a
 * prior-failure LOW or MEDIUM selected benchmark template built using
 * nothing but the existing native runtime-evidence preparer, the shared
 * preflight helper, the public ledger/publication/measurement APIs, the
 * existing artifact verifier, and the existing exported runtime-evidence
 * reducer.
 *
 * BenchmarkNativeCase, copyBenchmarkTemplate, openBenchmarkBase and
 * openBenchmarkTemplate (Step 2) are the planned opt-in native benchmark
 * authority surface. openBenchmarkBase/openBenchmarkTemplate call
 * prepareNativeCalibrationBenchmarkAuthorityLedger, which is imported below
 * even though it does not exist in frozen source yet; this is an
 * intentional feature RED, not a stub or implementation.
 */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  realpathSync,
  renameSync as nodeRenameSync,
  writeSync as nodeWriteSync,
} from "node:fs";
import { basename, dirname } from "node:path";
import {
  CALIBRATION_ROOT,
  evaluateCalibrationStageGate,
  selectCalibrationProfile,
} from "../../src/nutrition-eval/calibration";
import type {
  CalibrationIdentity,
  CalibrationOwner,
  CalibrationProfile,
  CalibrationRuntimeEvidenceLedger,
  StageName,
} from "../../src/nutrition-eval/calibration";
import {
  createCalibrationBootstrapReadDeps,
  deriveCanonicalReportOutcomePlan,
  prepareCalibrationBootstrapContext,
} from "../../src/nutrition-eval/calibration-bootstrap";
import type { CalibrationPreparedContext } from "../../src/nutrition-eval/calibration-bootstrap";
import { prepareNativeCalibrationRuntimeEvidenceLedger } from "../../src/nutrition-eval/calibration-runtime-evidence-ledger";
// Task 2 Step 2 (feature RED): this export does not exist in the frozen
// source yet. The import is intentionally left unresolved so the host
// observes an honest absent-export or post-setup denial, not a stub.
import { prepareNativeCalibrationBenchmarkAuthorityLedger } from "../../src/nutrition-eval/calibration-runtime-evidence-ledger";
import type { RuntimeEvidenceFileStoreOverrides } from "../../src/nutrition-eval/calibration-file-store";
import { publishCalibrationStageReport } from "../../src/nutrition-eval/calibration-report-publication";
import type { CalibrationPublishedReportReceipt } from "../../src/nutrition-eval/calibration-report-publication";
import { prepareCalibrationStageReportArtifactVerifier } from "../../src/nutrition-eval/calibration-report-artifact-verification";
import type { CalibrationStageReportArtifactVerifier } from "../../src/nutrition-eval/calibration-report-artifact-verification";
import { measureCalibrationStageReport } from "../../src/nutrition-eval/calibration-report-measurements";
import type { CalibrationReportMeasurements } from "../../src/nutrition-eval/calibration-report-measurements";
import type {
  CalibrationNonReservationOutcome,
  CalibrationPlannedReportOutcome,
  CalibrationReportOutcomeKey,
} from "../../src/nutrition-eval/calibration-report-state";
import { captureCalibrationNonReservationEvent } from "../../src/nutrition-eval/calibration-report-state";
import {
  captureCalibrationRuntimeEvidenceEvent,
  captureCalibrationRuntimeEvidenceHeader,
  hashCalibrationRuntimeEvidenceBinding,
} from "../../src/nutrition-eval/calibration-runtime-evidence-codec";
import type { RuntimeEvidenceEvent } from "../../src/nutrition-eval/calibration-runtime-evidence-codec";
import { prepareCalibrationRuntimeEvidenceState } from "../../src/nutrition-eval/calibration-runtime-evidence-state";
import { StrictCalibrationManifestSchema, parseNutritionEvalManifest } from "../../src/nutrition-eval/schema";
import type { NutritionEvalCase } from "../../src/nutrition-eval/schema";
import { CalibrationFatalError } from "../../src/nutrition-eval/fatal-error";
import {
  buildCoreSuccessJournal,
  CORE_PINNED_VERSION,
  createCoreExactPrediction,
  makeMiniGitRepoTask4,
  runSharedFoundationPreflight,
} from "./calibration-runtime-evidence-fixtures";
import { buildProducerResultJournal, failurePrediction } from "./calibration-runtime-evidence-producer-fixtures";

export interface BenchmarkTemplate {
  readonly baseDir: string;
  readonly profile: CalibrationProfile;
  readonly eventBytes: Buffer;
  readonly journalBytes: Buffer;
}

const LEDGER_FILE_NAME = "ledger.json";
const JOURNAL_FILE_NAME = "journal.json";

const IDENTITY_FIELDS = [
  "protocolVersion", "provider", "model", "implementationCommit", "functionsTreeId",
  "datasetHash", "promptHash", "responseSchemaHash", "sourceLockHash", "manifestHash",
  "publicManifestHash", "snapshotLockHash", "historicalReferenceHash", "plannedImageCalls", "hardCeiling",
] as const satisfies readonly (keyof CalibrationIdentity)[];

const OWNER_FIELDS = ["hostname", "bootId", "pid", "startTicks", "acquiredAt"] as const satisfies readonly (keyof CalibrationOwner)[];

type BoundReport = ReturnType<CalibrationRuntimeEvidenceLedger["bindRuntimeStageReport"]>;

function canonicalKeyId(key: Readonly<{ stage: string; profile: string; caseId: string; sampleIndex: number }>): string {
  return `${key.stage}|${key.profile}|${key.caseId}|${key.sampleIndex}`;
}

function assertKeySetEquals(actual: ReadonlySet<string>, expected: ReadonlySet<string>): void {
  if (actual.size !== expected.size) {
    throw new CalibrationFatalError("calibration:benchmark-authority-fixture-key-set-mismatch");
  }
  for (const id of expected) {
    if (!actual.has(id)) {
      throw new CalibrationFatalError("calibration:benchmark-authority-fixture-key-set-mismatch");
    }
  }
}

function resolveEvalCase(context: CalibrationPreparedContext, caseId: string): NutritionEvalCase {
  const calibrationManifest = StrictCalibrationManifestSchema.parse(
    JSON.parse(context.files["calibration-manifest"]),
  );
  const publicManifest = parseNutritionEvalManifest(JSON.parse(context.files["public-manifest"]));
  const found = [...calibrationManifest.cases, ...publicManifest.cases].find((row) => row.id === caseId);
  if (found === undefined) {
    throw new CalibrationFatalError("calibration:benchmark-authority-fixture-unknown-case");
  }
  return found;
}

function completeOutcome(
  ledger: CalibrationRuntimeEvidenceLedger,
  key: CalibrationReportOutcomeKey,
  evalCase: NutritionEvalCase,
  forceFailure: boolean,
): void {
  const ref = ledger.startRuntimeAttempt({ ...key });
  if (evalCase.scanMode === "barcode") {
    const prediction = createCoreExactPrediction(evalCase, key.sampleIndex);
    ledger.startRuntimeOperation(ref, "snapshot");
    ledger.settleRuntimeOperation(ref, "snapshot", "returned");
    ledger.recordNonReservationResult({ key: { ...key }, reason: "barcode", prediction });
    ledger.finishRuntimeAttempt(ref);
    return;
  }
  ledger.startRuntimeOperation(ref, "image");
  ledger.settleRuntimeOperation(ref, "image", "returned");
  ledger.startRuntimeOperation(ref, "vision");
  ledger.reserve({ ...key });
  ledger.authorizeRuntimeRequest(ref);
  ledger.settleRuntimeOperation(ref, "vision", "returned");
  const hash = forceFailure
    ? ledger.appendResultJournal(
      buildProducerResultJournal(key, failurePrediction(key, evalCase.scanMode, "provider"), "http_5xx", CORE_PINNED_VERSION),
    )
    : ledger.appendResultJournal(buildCoreSuccessJournal({ ...key }, createCoreExactPrediction(evalCase, key.sampleIndex)));
  ledger.complete({ ...key }, hash);
  ledger.finishRuntimeAttempt(ref);
}

async function publishAdmitBindAndMeasure(
  ledger: CalibrationRuntimeEvidenceLedger,
  context: CalibrationPreparedContext,
  stage: StageName,
  profile: CalibrationProfile,
  bindings: BoundReport[],
): Promise<Readonly<CalibrationReportMeasurements>> {
  const published = await publishCalibrationStageReport({
    stage,
    profile,
    context,
    readSnapshot: () => ledger.getStageReportSnapshot(stage, profile),
  });
  ledger.admitStageReportReceipt(stage, profile);
  bindings.push(ledger.bindRuntimeStageReport(stage, profile));
  return measureCalibrationStageReport(published.report);
}

function assertPreflightMeasured(report: unknown): void {
  const measured = measureCalibrationStageReport(report);
  if (
    measured.stage.totalOutcomes !== 1 || measured.stage.parseCases !== 1 ||
    measured.stage.failureCount !== 0 || measured.stage.unsafeCompletionCount !== 0
  ) {
    throw new CalibrationFatalError("calibration:benchmark-authority-fixture-preflight-measure-mismatch");
  }
}

function journalHashRule(entry: unknown): string {
  return createHash("sha256").update(JSON.stringify(entry)).digest("hex");
}

function captureReceiptLike(value: unknown): CalibrationPublishedReportReceipt {
  if (typeof value !== "object" || value === null) {
    throw new CalibrationFatalError("calibration:benchmark-authority-fixture-receipt-invalid");
  }
  const record = value as Record<string, unknown>;
  const fields = ["stage", "profile", "runId", "jsonSha256", "markdownSha256"];
  const keys = Object.keys(record);
  if (keys.length !== fields.length || fields.some((field) => !Object.hasOwn(record, field))) {
    throw new CalibrationFatalError("calibration:benchmark-authority-fixture-receipt-invalid");
  }
  const stage = record["stage"];
  const profile = record["profile"];
  const runId = record["runId"];
  const jsonSha256 = record["jsonSha256"];
  const markdownSha256 = record["markdownSha256"];
  if (
    (stage !== "preflight" && stage !== "development" && stage !== "validation" && stage !== "benchmark") ||
    (profile !== "LOW" && profile !== "MEDIUM") ||
    typeof runId !== "string" || typeof jsonSha256 !== "string" || typeof markdownSha256 !== "string"
  ) {
    throw new CalibrationFatalError("calibration:benchmark-authority-fixture-receipt-invalid");
  }
  return { stage, profile, runId, jsonSha256, markdownSha256 };
}

function translateLedgerRowToFrame(
  row: Record<string, unknown>,
  eventIndex: number,
  journalByHash: Map<string, unknown>,
): unknown {
  const type = row["type"];
  if (typeof type === "string" && type.startsWith("runtime_")) {
    return { kind: "runtime", eventIndex, event: captureCalibrationRuntimeEvidenceEvent(row) };
  }
  if (type === "reserved") {
    return { kind: "reserved", eventIndex, key: row["key"] };
  }
  if (type === "completed" || type === "failed") {
    const journalHash = row["journalHash"];
    const journal = typeof journalHash === "string" ? journalByHash.get(journalHash) : undefined;
    if (journal === undefined) {
      throw new CalibrationFatalError("calibration:benchmark-authority-fixture-journal-missing");
    }
    return { kind: "image_terminal", eventIndex, key: row["key"], terminalType: type, journalHash, journal };
  }
  if (type === "non_reservation_result") {
    return { kind: "non_reservation_result", eventIndex, event: captureCalibrationNonReservationEvent(row) };
  }
  if (type === "model_version_pinned") {
    return { kind: "model_version_pinned", eventIndex, responseModelVersion: row["responseModelVersion"] };
  }
  if (type === "profile_selected") {
    return { kind: "profile_selected", eventIndex, profile: row["profile"] };
  }
  if (type === "artifact_receipt_admitted") {
    return { kind: "artifact_receipt_admitted", eventIndex, receipt: captureReceiptLike(row["receipt"]) };
  }
  if (type === "lock_recovery") {
    return { kind: "lock_recovery", eventIndex, staleOwner: row["staleOwner"], recoveringOwner: row["recoveringOwner"] };
  }
  if (
    type === "token_count_reserved" || type === "token_count_completed" ||
    type === "token_count_failed" || type === "safe_error" || type === "stage_completed"
  ) {
    return { kind: "protocol_noop", eventIndex, eventType: type };
  }
  throw new CalibrationFatalError("calibration:benchmark-authority-fixture-event-type-invalid");
}

function assertHeaderMatchesContext(
  header: ReturnType<typeof captureCalibrationRuntimeEvidenceHeader>,
  context: CalibrationPreparedContext,
): void {
  for (const field of IDENTITY_FIELDS) {
    if (header.identity[field] !== context.identity[field]) {
      throw new CalibrationFatalError("calibration:benchmark-authority-fixture-header-identity-drift");
    }
  }
  for (const field of OWNER_FIELDS) {
    if (header.owner[field] !== context.owner[field]) {
      throw new CalibrationFatalError("calibration:benchmark-authority-fixture-header-owner-drift");
    }
  }
}

function replayRuntimeEvidenceState(context: CalibrationPreparedContext) {
  const rows = JSON.parse(
    readFileSync(resolve(context.baseDir, CALIBRATION_ROOT, LEDGER_FILE_NAME), "utf8"),
  ) as Record<string, unknown>[];
  const journalRows = JSON.parse(
    readFileSync(resolve(context.baseDir, CALIBRATION_ROOT, JOURNAL_FILE_NAME), "utf8"),
  ) as Record<string, unknown>[];
  const journalByHash = new Map<string, unknown>();
  for (const entry of journalRows) {
    journalByHash.set(journalHashRule(entry), entry);
  }
  if (rows.length === 0) {
    throw new CalibrationFatalError("calibration:benchmark-authority-fixture-ledger-empty");
  }
  const header = captureCalibrationRuntimeEvidenceHeader(rows[0]);
  assertHeaderMatchesContext(header, context);
  const plans = {
    initial: deriveCanonicalReportOutcomePlan(context.files),
    LOW: deriveCanonicalReportOutcomePlan(context.files, "LOW"),
    MEDIUM: deriveCanonicalReportOutcomePlan(context.files, "MEDIUM"),
  };
  let state = prepareCalibrationRuntimeEvidenceState({ header, plans });
  for (let index = 1; index < rows.length; index += 1) {
    const frame = translateLedgerRowToFrame(rows[index] as Record<string, unknown>, index + 1, journalByHash);
    state = state.preview(frame);
  }
  return state;
}

function verifyBindingAgainstReducer(
  state: ReturnType<typeof replayRuntimeEvidenceState>,
  bound: BoundReport,
): void {
  const input = state.pairInput(bound.stage, bound.profile, bound.throughSequence);
  const hash = hashCalibrationRuntimeEvidenceBinding({ ...input, receipt: bound.receipt });
  if (hash !== bound.bindingSha256) {
    throw new CalibrationFatalError("calibration:benchmark-authority-fixture-binding-mismatch");
  }
}

function verifyArtifactReceipt(
  verifier: Readonly<CalibrationStageReportArtifactVerifier>,
  ledger: CalibrationRuntimeEvidenceLedger,
  bound: BoundReport,
): void {
  const result = verifier.verify({
    stage: bound.stage, profile: bound.profile,
    snapshot: ledger.getStageReportSnapshot(bound.stage, bound.profile),
  });
  if (
    result.receipt.stage !== bound.receipt.stage || result.receipt.profile !== bound.receipt.profile ||
    result.receipt.runId !== bound.receipt.runId || result.receipt.jsonSha256 !== bound.receipt.jsonSha256 ||
    result.receipt.markdownSha256 !== bound.receipt.markdownSha256
  ) {
    throw new CalibrationFatalError("calibration:benchmark-authority-fixture-receipt-mismatch");
  }
}

function assertCanonicalKeyIdentity(
  selectedPlan: readonly CalibrationPlannedReportOutcome[],
  imagePredictions: ReturnType<CalibrationRuntimeEvidenceLedger["getCompletedReportPredictions"]>,
  barcodeOutcomes: readonly CalibrationNonReservationOutcome[],
  replayedState: ReturnType<typeof replayRuntimeEvidenceState>,
): void {
  const planKeyIds = new Set(selectedPlan.map((row) => canonicalKeyId(row.key)));
  if (planKeyIds.size !== 158) {
    throw new CalibrationFatalError("calibration:benchmark-authority-fixture-plan-key-count-mismatch");
  }
  const planImageKeyIds = new Set(
    selectedPlan.filter((row) => row.scanMode !== "barcode").map((row) => canonicalKeyId(row.key)),
  );
  const planBarcodeKeyIds = new Set(
    selectedPlan.filter((row) => row.scanMode === "barcode").map((row) => canonicalKeyId(row.key)),
  );
  if (planImageKeyIds.size !== 146 || planBarcodeKeyIds.size !== 12) {
    throw new CalibrationFatalError("calibration:benchmark-authority-fixture-plan-scan-mode-mismatch");
  }

  function isFinishedEvent(
    event: RuntimeEvidenceEvent,
  ): event is Extract<RuntimeEvidenceEvent, { readonly type: "runtime_attempt_finished" }> {
    return event.type === "runtime_attempt_finished";
  }
  const finishedKeyIds = new Set(
    replayedState.snapshot().events.filter(isFinishedEvent).map((event) => canonicalKeyId(event.key)),
  );
  assertKeySetEquals(finishedKeyIds, planKeyIds);

  const imageKeyIds = new Set(imagePredictions.map((row) => canonicalKeyId(row.key)));
  assertKeySetEquals(imageKeyIds, planImageKeyIds);

  if (barcodeOutcomes.some((row) => row.reason !== "barcode")) {
    throw new CalibrationFatalError("calibration:benchmark-authority-fixture-barcode-reason-mismatch");
  }
  const barcodeKeyIds = new Set(barcodeOutcomes.map((row) => canonicalKeyId(row.key)));
  assertKeySetEquals(barcodeKeyIds, planBarcodeKeyIds);

  const allOutcomeKeyIds = new Set([...imageKeyIds, ...barcodeKeyIds]);
  assertKeySetEquals(allOutcomeKeyIds, planKeyIds);

  for (const stage of ["preflight", "development", "validation", "benchmark"] as const) {
    const expectedStageKeyIds = new Set(
      selectedPlan.filter((row) => row.key.stage === stage).map((row) => canonicalKeyId(row.key)),
    );
    const actualStageImageKeyIds = new Set(
      imagePredictions.filter((row) => row.key.stage === stage).map((row) => canonicalKeyId(row.key)),
    );
    if (stage === "benchmark") {
      const actualStageAllKeyIds = new Set([...actualStageImageKeyIds, ...barcodeKeyIds]);
      assertKeySetEquals(actualStageAllKeyIds, expectedStageKeyIds);
    } else {
      assertKeySetEquals(actualStageImageKeyIds, expectedStageKeyIds);
    }
  }
}

export async function buildBenchmarkTemplate(
  roots: string[],
  profile: CalibrationProfile,
  scenario: "prior-failure" | "benchmark-meal-protein" = "prior-failure",
): Promise<Readonly<BenchmarkTemplate>> {
  if (scenario !== "prior-failure") {
    throw new CalibrationFatalError("calibration:benchmark-authority-fixture-scenario-unsupported");
  }
  const mini = makeMiniGitRepoTask4(roots);
  const readDeps = createCalibrationBootstrapReadDeps(mini.root);
  const context = await prepareCalibrationBootstrapContext(readDeps);
  const verifier = await prepareCalibrationStageReportArtifactVerifier(context);
  const ledger = await prepareNativeCalibrationRuntimeEvidenceLedger({ context });
  ledger.acquireLock({ ...context.owner });
  const bindings: BoundReport[] = [];

  await runSharedFoundationPreflight(ledger, context);
  bindings.push(ledger.bindRuntimeStageReport("preflight", "LOW"));
  bindings.push(ledger.bindRuntimeStageReport("preflight", "MEDIUM"));

  for (const preflightProfile of ["LOW", "MEDIUM"] as const) {
    const verified = verifier.verify({
      stage: "preflight", profile: preflightProfile,
      snapshot: ledger.getStageReportSnapshot("preflight", preflightProfile),
    });
    assertPreflightMeasured(verified.report);
  }
  ledger.completeStage("preflight", { stage: "preflight", passed: true, completedStages: [] });

  const initialPlan = deriveCanonicalReportOutcomePlan(context.files);
  const losingProfile: CalibrationProfile = profile === "LOW" ? "MEDIUM" : "LOW";
  let losingCaseFailed = false;
  for (const row of initialPlan) {
    if (row.key.stage !== "development") continue;
    const evalCase = resolveEvalCase(context, row.key.caseId);
    const forceFailure = !losingCaseFailed && row.key.profile === losingProfile;
    completeOutcome(ledger, row.key, evalCase, forceFailure);
    if (forceFailure) losingCaseFailed = true;
  }
  if (!losingCaseFailed) {
    throw new CalibrationFatalError("calibration:benchmark-authority-fixture-losing-case-missing");
  }

  const low = await publishAdmitBindAndMeasure(ledger, context, "development", "LOW", bindings);
  const medium = await publishAdmitBindAndMeasure(ledger, context, "development", "MEDIUM", bindings);
  const selected = selectCalibrationProfile(low.profile, medium.profile);
  if (selected !== profile) {
    throw new CalibrationFatalError("calibration:benchmark-authority-fixture-selection-mismatch");
  }
  const winner = profile === "LOW" ? low : medium;
  const loser = profile === "LOW" ? medium : low;
  if (winner.stage.failureCount !== 0 || loser.stage.failureCount !== 1) {
    throw new CalibrationFatalError("calibration:benchmark-authority-fixture-failure-count-mismatch");
  }
  const developmentGate = evaluateCalibrationStageGate("development", winner.stage);
  ledger.recordProfileSelection(selected, "higher_parse", {
    stage: "development", passed: developmentGate.passed, completedStages: ["preflight"],
  });
  ledger.completeStage("development", {
    stage: "development", passed: developmentGate.passed, completedStages: ["preflight"],
  });

  const selectedPlan = deriveCanonicalReportOutcomePlan(context.files, profile);
  for (const row of selectedPlan) {
    if (row.key.stage !== "validation") continue;
    completeOutcome(ledger, row.key, resolveEvalCase(context, row.key.caseId), false);
  }
  const validation = await publishAdmitBindAndMeasure(ledger, context, "validation", profile, bindings);
  const validationGate = evaluateCalibrationStageGate("validation", validation.stage);
  ledger.completeStage("validation", {
    stage: "validation", passed: validationGate.passed, completedStages: ["preflight", "development"],
  });

  for (const row of selectedPlan) {
    if (row.key.stage !== "benchmark") continue;
    completeOutcome(ledger, row.key, resolveEvalCase(context, row.key.caseId), false);
  }
  await publishAdmitBindAndMeasure(ledger, context, "benchmark", profile, bindings);
  // Benchmark intentionally stays uncompleted here: no ledger.completeStage
  // call for the benchmark stage. Native authority qualification for
  // benchmark completion is Step 3 and later, not this foundation phase.

  if (bindings.length !== 6) {
    throw new CalibrationFatalError("calibration:benchmark-authority-fixture-binding-count-mismatch");
  }
  for (const bound of bindings) {
    verifyArtifactReceipt(verifier, ledger, bound);
  }

  const imagePredictions = ledger.getCompletedReportPredictions();
  if (imagePredictions.length !== 146) {
    throw new CalibrationFatalError("calibration:benchmark-authority-fixture-image-prediction-count-mismatch");
  }
  const benchmarkSnapshot = ledger.getStageReportSnapshot("benchmark", profile);
  const barcodeOutcomes = benchmarkSnapshot.nonReservations;
  if (barcodeOutcomes.length !== 12) {
    throw new CalibrationFatalError("calibration:benchmark-authority-fixture-barcode-outcome-count-mismatch");
  }
  const counts = ledger.getCounts();
  if (counts.imageReserved !== 146 || counts.tokenCountReserved !== 1) {
    throw new CalibrationFatalError("calibration:benchmark-authority-fixture-reservation-count-mismatch");
  }

  const replayedState = replayRuntimeEvidenceState(context);
  if (replayedState.snapshot().activeAttempt !== null) {
    throw new CalibrationFatalError("calibration:benchmark-authority-fixture-active-attempt-leak");
  }
  for (const bound of bindings) {
    verifyBindingAgainstReducer(replayedState, bound);
  }
  assertCanonicalKeyIdentity(selectedPlan, imagePredictions, barcodeOutcomes, replayedState);

  ledger.releaseLock({ ...context.owner });
  const lockPath = resolve(context.baseDir, CALIBRATION_ROOT, "lock.json");
  if (existsSync(lockPath)) {
    throw new CalibrationFatalError("calibration:benchmark-authority-fixture-lock-not-released");
  }

  const eventBytes = readFileSync(resolve(context.baseDir, CALIBRATION_ROOT, LEDGER_FILE_NAME));
  const journalBytes = readFileSync(resolve(context.baseDir, CALIBRATION_ROOT, JOURNAL_FILE_NAME));
  return Object.freeze({ baseDir: context.baseDir, profile, eventBytes, journalBytes });
}

// ── Task 2 Step 2: feature RED surface for opt-in native benchmark authority ──
//
// BenchmarkNativeCase/copyBenchmarkTemplate/openBenchmarkBase/openBenchmarkTemplate
// are the planned Step 2 contract. openBenchmarkBase and openBenchmarkTemplate call
// the not-yet-exported prepareNativeCalibrationBenchmarkAuthorityLedger above; no
// production source is implemented or stubbed here.

export interface BenchmarkNativeCase {
  readonly context: CalibrationPreparedContext;
  readonly ledger: Readonly<CalibrationRuntimeEvidenceLedger>;
  readonly baseDir: string;
  readEvents(): readonly Record<string, unknown>[];
  readJournals(): readonly Record<string, unknown>[];
  readLockBytes(): Buffer;
}

/** mkdtemp + cpSync a fresh registered base; templates are always lock-released. */
export function copyBenchmarkTemplate(
  roots: string[],
  template: Readonly<BenchmarkTemplate>,
): string {
  const sourceLockPath = resolve(template.baseDir, CALIBRATION_ROOT, "lock.json");
  if (existsSync(sourceLockPath)) {
    throw new CalibrationFatalError("calibration:benchmark-authority-fixture-copy-active-lock");
  }
  const dest = mkdtempSync(join(tmpdir(), "calorix-benchmark-copy-"));
  roots.push(dest);
  cpSync(template.baseDir, dest, { recursive: true, preserveTimestamps: true, filter: () => true });
  const destLockPath = resolve(dest, CALIBRATION_ROOT, "lock.json");
  if (existsSync(destLockPath)) {
    throw new CalibrationFatalError("calibration:benchmark-authority-fixture-copy-active-lock");
  }
  return dest;
}

function readRecordArray(path: string): readonly Record<string, unknown>[] {
  return JSON.parse(readFileSync(path, "utf8")) as readonly Record<string, unknown>[];
}

/** Real bootstrap -> new native preparer -> acquireLock(context.owner); no caller-shaped ledger. */
export async function openBenchmarkBase(
  baseDir: string,
  overrides?: RuntimeEvidenceFileStoreOverrides,
): Promise<Readonly<BenchmarkNativeCase>> {
  const readDeps = createCalibrationBootstrapReadDeps(baseDir);
  const context = await prepareCalibrationBootstrapContext(readDeps);
  const ledger = await prepareNativeCalibrationBenchmarkAuthorityLedger({ context }, overrides);
  ledger.acquireLock({ ...context.owner });
  return Object.freeze({
    context,
    ledger,
    baseDir: context.baseDir,
    readEvents: () => readRecordArray(resolve(context.baseDir, CALIBRATION_ROOT, LEDGER_FILE_NAME)),
    readJournals: () => readRecordArray(resolve(context.baseDir, CALIBRATION_ROOT, JOURNAL_FILE_NAME)),
    readLockBytes: () => readFileSync(resolve(context.baseDir, CALIBRATION_ROOT, "lock.json")),
  });
}

/** Copies the released template into a new owned miniGit directory, then opens it natively. */
export async function openBenchmarkTemplate(
  roots: string[],
  template: Readonly<BenchmarkTemplate>,
  overrides?: RuntimeEvidenceFileStoreOverrides,
): Promise<Readonly<BenchmarkNativeCase>> {
  const baseDir = copyBenchmarkTemplate(roots, template);
  return openBenchmarkBase(baseDir, overrides);
}

// ── Task 3 Step 2: benchmark completion native witness ──
//
// makeBenchmarkCompletionWitness observes the five low-level native syscall
// seams (RuntimeEvidenceFileStoreOverrides) used to publish exactly one new
// benchmark stage_completed ledger row, correlating them by descriptor/path
// identity so only that target publication can be armed and cut.

const BENCHMARK_LEDGER_FILE_NAME = "ledger.json";
const BENCHMARK_TEMP_NAME_PATTERN = /^ledger\.json\.tmp\.\d+\.\d+\.json$/;

export type BenchmarkCutOperation = "write" | "file-fsync" | "close" | "rename" | "directory-fsync";

export interface BenchmarkCompletionWitness {
  readonly overrides: RuntimeEvidenceFileStoreOverrides;
  arm(operation: BenchmarkCutOperation, side: "before" | "after"): void;
  disarm(): void;
  readonly trace: readonly string[];
  readonly hitCount: number;
}

interface BenchmarkWriteTargetIdentity {
  readonly fd: number;
  readonly tempPath: string;
  readonly dev: number;
  readonly ino: number;
  closed: boolean;
  initialWriteSeen: boolean;
}

function delegateFsyncDirSync(dir: string): void {
  const fd = openSync(dir, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

export function makeBenchmarkCompletionWitness(root: string): BenchmarkCompletionWitness {
  const canonicalRoot = realpathSync(root);
  const trace: string[] = [];
  let hitCount = 0;
  let hit = false;
  let armed: { operation: BenchmarkCutOperation; side: "before" | "after" } | undefined;
  let target: BenchmarkWriteTargetIdentity | undefined;
  let renameSucceeded = false;

  function isArmedCut(operation: BenchmarkCutOperation, side: "before" | "after"): boolean {
    return !hit && armed !== undefined && armed.operation === operation && armed.side === side;
  }

  function fireFault(operation: BenchmarkCutOperation, side: "before" | "after"): never {
    trace.push(`${operation}:fault-${side}`);
    hit = true;
    hitCount += 1;
    throw new Error(`calibration:benchmark-completion-witness-${operation}-fault-${side}`);
  }

  function runCut<T>(operation: BenchmarkCutOperation, delegate: () => T, afterDelegate?: () => void): T {
    trace.push(`${operation}:before`);
    if (isArmedCut(operation, "before")) fireFault(operation, "before");
    const result = delegate();
    afterDelegate?.();
    trace.push(`${operation}:after`);
    if (isArmedCut(operation, "after")) fireFault(operation, "after");
    return result;
  }

  function matchesTargetFd(fd: number): boolean {
    if (target === undefined || target.closed || fd !== target.fd) return false;
    try {
      const stat = fstatSync(fd);
      return stat.dev === target.dev && stat.ino === target.ino;
    } catch {
      return false;
    }
  }

  function recognizeTargetWrite(
    fd: number,
    buffer: Buffer,
    offset: number,
  ): BenchmarkWriteTargetIdentity | undefined {
    if (offset !== 0) return undefined;
    let linkPath: string;
    try {
      linkPath = realpathSync(`/proc/self/fd/${fd}`);
    } catch {
      return undefined;
    }
    if (dirname(linkPath) !== canonicalRoot || !BENCHMARK_TEMP_NAME_PATTERN.test(basename(linkPath))) {
      return undefined;
    }
    let fdStat: ReturnType<typeof fstatSync>;
    let pathStat: ReturnType<typeof lstatSync>;
    try {
      fdStat = fstatSync(fd);
      pathStat = lstatSync(linkPath);
    } catch {
      return undefined;
    }
    if (!fdStat.isFile() || pathStat.isSymbolicLink() || !pathStat.isFile()) return undefined;
    if (fdStat.dev !== pathStat.dev || fdStat.ino !== pathStat.ino) return undefined;
    let currentRows: unknown;
    try {
      currentRows = JSON.parse(readFileSync(resolve(canonicalRoot, BENCHMARK_LEDGER_FILE_NAME), "utf8"));
    } catch {
      return undefined;
    }
    if (!Array.isArray(currentRows)) return undefined;
    let newRows: unknown;
    try {
      newRows = JSON.parse(buffer.toString("utf8"));
    } catch {
      return undefined;
    }
    if (!Array.isArray(newRows) || newRows.length !== currentRows.length + 1) return undefined;
    for (let index = 0; index < currentRows.length; index += 1) {
      if (JSON.stringify(newRows[index]) !== JSON.stringify(currentRows[index])) return undefined;
    }
    const added: unknown = newRows[currentRows.length];
    if (typeof added !== "object" || added === null) return undefined;
    const addedRecord = added as Record<string, unknown>;
    if (
      Object.keys(addedRecord).length !== 4 ||
      addedRecord["type"] !== "stage_completed" ||
      addedRecord["stage"] !== "benchmark" ||
      addedRecord["passed"] !== true ||
      typeof addedRecord["at"] !== "string"
    ) {
      return undefined;
    }
    return { fd, tempPath: linkPath, dev: fdStat.dev, ino: fdStat.ino, closed: false, initialWriteSeen: false };
  }

  function fdWriteSync(fd: number, buffer: Buffer, offset: number, length: number): number {
    if (target === undefined) {
      const identity = recognizeTargetWrite(fd, buffer, offset);
      if (identity !== undefined) target = identity;
    }
    if (target === undefined || !matchesTargetFd(fd)) {
      return nodeWriteSync(fd, buffer, offset, length);
    }
    const cutEligible = !target.initialWriteSeen && offset === 0;
    target.initialWriteSeen = true;
    trace.push("write:before");
    if (cutEligible && isArmedCut("write", "before")) fireFault("write", "before");
    const count = nodeWriteSync(fd, buffer, offset, length);
    trace.push("write:after");
    if (cutEligible && isArmedCut("write", "after")) fireFault("write", "after");
    return count;
  }

  function fdFsyncSync(fd: number): void {
    if (!matchesTargetFd(fd)) {
      fsyncSync(fd);
      return;
    }
    runCut("file-fsync", () => fsyncSync(fd));
  }

  function fdCloseSync(fd: number): void {
    const frame = target;
    if (frame === undefined || !matchesTargetFd(fd)) {
      closeSync(fd);
      return;
    }
    if (hit) {
      trace.push("cleanup:close:before");
      closeSync(fd);
      frame.closed = true;
      trace.push("cleanup:close:after");
      return;
    }
    runCut("close", () => closeSync(fd), () => { frame.closed = true; });
  }

  function renameSync(from: string, to: string): void {
    if (target === undefined || from !== target.tempPath ||
      to !== resolve(canonicalRoot, BENCHMARK_LEDGER_FILE_NAME)) {
      nodeRenameSync(from, to);
      return;
    }
    let source: ReturnType<typeof lstatSync> | undefined;
    try { source = lstatSync(from); } catch { /* Non-target native rename retains its own error. */ }
    if (source === undefined || !source.isFile() || source.isSymbolicLink() ||
      source.dev !== target.dev || source.ino !== target.ino) {
      nodeRenameSync(from, to);
      return;
    }
    runCut("rename", () => nodeRenameSync(from, to), () => {
      renameSucceeded = true;
    });
  }

  function fsyncDirSync(dir: string): void {
    let isCanonical = false;
    try { isCanonical = realpathSync(dir) === canonicalRoot; } catch { /* Delegate native directory errors. */ }
    const isTarget = renameSucceeded && target !== undefined && isCanonical;
    if (!isTarget) {
      delegateFsyncDirSync(dir);
      return;
    }
    runCut("directory-fsync", () => delegateFsyncDirSync(dir));
    if (!hit) {
      renameSucceeded = false;
      target = undefined;
    }
  }

  return Object.freeze({
    overrides: Object.freeze({ fdWriteSync, fdFsyncSync, fdCloseSync, renameSync, fsyncDirSync }),
    arm(operation: BenchmarkCutOperation, side: "before" | "after"): void {
      armed = { operation, side };
    },
    disarm(): void {
      armed = undefined;
      if (target === undefined || target.closed) return;
      let stat: ReturnType<typeof fstatSync>;
      try {
        stat = fstatSync(target.fd);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "EBADF" && code !== "ENOENT") throw error;
        return;
      }
      if (stat.dev !== target.dev || stat.ino !== target.ino) return;
      try {
        closeSync(target.fd);
        target.closed = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EBADF") throw error;
      }
    },
    get trace(): readonly string[] {
      return trace;
    },
    get hitCount(): number {
      return hitCount;
    },
  });
}
