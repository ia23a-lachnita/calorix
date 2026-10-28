/** Serial composition over existing authority; the caller owns the lock lifecycle. */
import { createHash } from 'node:crypto';
import type { GenAIAdapter } from '../genai-adapter';
import type { OffProduct } from '../off-client';
import { evaluateCalibrationStageGate, selectCalibrationProfileDecision } from './calibration';
import type { CalibrationProfile, CalibrationRuntimeEvidenceLedger, JournalEntry, StageName } from './calibration';
import type { CalibrationPreparedContext } from './calibration-bootstrap';
import { deriveCanonicalReportOutcomePlan } from './calibration-bootstrap';
import { verifyCalibrationPreflightState } from './calibration-cli';
import { prepareCalibrationBenchmarkHistory } from './calibration-benchmark-history';
import type { CalibrationBenchmarkHistoricalAssessment } from './calibration-benchmark-history';
import { captureProducerInput } from './calibration-runtime-evidence-producer-input';
import { prepareCalibrationRuntimeEvidenceProducer } from './calibration-runtime-evidence-producer';
import { captureCalibrationReportJournalEntry, captureCalibrationReportPrediction } from './calibration-report-journal';
import { assembleCalibrationStageReport } from './calibration-report-assembly';
import { measureCalibrationStageReport } from './calibration-report-measurements';
import { publishCalibrationStageReport } from './calibration-report-publication';
import type { CalibrationPublishedReportReceipt, CalibrationReportPublicationResult } from './calibration-report-publication';
import type { CalibrationReportOutcomeKey } from './calibration-report-state';
import { createLiveNutritionEvalAdapter } from './live-adapter';
import { parseNutritionEvalManifest, StrictCalibrationManifestSchema } from './schema';
import type { NutritionPrediction } from './schema';
import { CalibrationFatalError } from './fatal-error';

export interface CalibrationSdkMethodCounts { readonly vision: number; readonly tokenCount: number }
export interface CalibrationStageDriverDeps {
  readonly context: CalibrationPreparedContext;
  readonly ledger: Readonly<CalibrationRuntimeEvidenceLedger>;
  readonly loadImage: (key: Readonly<CalibrationReportOutcomeKey>) => Promise<Uint8Array>;
  readonly generateVision: GenAIAdapter['generateVision'];
  readonly lookupSnapshot: (barcode: string) => Readonly<OffProduct> | undefined;
  readonly countTokens: () => Promise<{ tokenCount: number }>;
  readonly nowMs: () => number;
  readonly getSdkMethodCounts: () => Readonly<CalibrationSdkMethodCounts>;
}
export interface CalibrationStageExecutionResult {
  readonly stage: StageName;
  readonly selectedProfile?: CalibrationProfile;
  readonly receipts: readonly Readonly<CalibrationPublishedReportReceipt>[];
  readonly cumulativeImageReservations: number;
  readonly cumulativeTokenReservations: number;
  readonly newSdkMethodInvocations: Readonly<CalibrationSdkMethodCounts>;
  readonly historical?: Readonly<Pick<CalibrationBenchmarkHistoricalAssessment, 'comparison' | 'subset' | 'provenance'>>;
}
export interface CalibrationStageDriver {
  executeStage(stage: StageName): Promise<Readonly<CalibrationStageExecutionResult>>;
}
const STAGES = ['preflight', 'development', 'validation', 'benchmark'] as const;
const FIELDS = ['context', 'ledger', 'loadImage', 'generateVision', 'lookupSnapshot', 'countTokens', 'nowMs', 'getSdkMethodCounts'] as const;
const METHODS = [
  'assertIdentity', 'getCounts', 'reserveTokenCount', 'completeTokenCount', 'failTokenCount', 'recordSafeError',
  'getRuntimeEvidenceSnapshot', 'getStageReportSnapshot', 'getSelectedProfile', 'getPinnedModelVersion',
  'startRuntimeAttempt', 'startRuntimeOperation', 'settleRuntimeOperation', 'reserve', 'authorizeRuntimeRequest',
  'pinModelVersion', 'finishRuntimeAttempt', 'appendResultJournal', 'complete', 'recordNonReservationResult',
  'admitStageReportReceipt', 'bindRuntimeStageReport', 'getCompletedStages', 'recordProfileSelection', 'completeStage',
] as const;
type DriverLedger = Pick<CalibrationRuntimeEvidenceLedger, typeof METHODS[number]>;
function freshFatal(): CalibrationFatalError { return new CalibrationFatalError('calibration:stage-driver-failed'); }
function plain(value: unknown, check: () => void = () => undefined): object {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw freshFatal();
  const prototype = Object.getPrototypeOf(value);
  check();
  if (prototype !== Object.prototype && prototype !== null) throw freshFatal();
  return value;
}
function data(value: unknown, fields: readonly string[], check: () => void = () => undefined): Record<string, unknown> {
  const object = plain(value, check);
  const keys = Reflect.ownKeys(object);
  check();
  if (keys.length !== fields.length || keys.some((key) => typeof key !== 'string' || !fields.includes(key))) throw freshFatal();
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(object, field);
    check();
    if (!descriptor || descriptor.enumerable !== true || !Object.hasOwn(descriptor, 'value') || descriptor.value === undefined) throw freshFatal();
    result[field] = descriptor.value;
  }
  return result;
}
function captureMethods(value: unknown): Readonly<DriverLedger> {
  const receiver = plain(value);
  const result: Record<string, unknown> = {};
  for (const name of METHODS) {
    const descriptor = Object.getOwnPropertyDescriptor(receiver, name);
    if (!descriptor || descriptor.enumerable !== true || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'function') throw freshFatal();
    const method = descriptor.value as (...args: unknown[]) => unknown;
    result[name] = (...args: unknown[]) => Reflect.apply(method, receiver, args);
  }
  return Object.freeze(result) as unknown as Readonly<DriverLedger>;
}
function observed<T>(promise: Promise<T>): Promise<T> { void promise.then(undefined, () => undefined); return promise; }
function keyId(key: CalibrationReportOutcomeKey): string { return `${key.stage}|${key.profile}|${key.caseId}|${key.sampleIndex}`; }

export async function prepareCalibrationStageDriver(deps: unknown): Promise<Readonly<CalibrationStageDriver>> {
  // Capture every foreign descriptor/function before the first suspension; no effects.
  let input: ReturnType<typeof captureProducerInput>;
  let native: Readonly<DriverLedger>;
  let countTokens: CalibrationStageDriverDeps['countTokens'];
  let nowMs: CalibrationStageDriverDeps['nowMs'];
  let getSdkMethodCounts: CalibrationStageDriverDeps['getSdkMethodCounts'];
  try {
    const owned = data(deps, FIELDS);
    for (const name of ['countTokens', 'nowMs', 'getSdkMethodCounts']) if (typeof owned[name] !== 'function') throw freshFatal();
    input = captureProducerInput({ context: owned.context, ledger: owned.ledger,
      loadImage: owned.loadImage, generateVision: owned.generateVision, lookupSnapshot: owned.lookupSnapshot });
    native = captureMethods(owned.ledger);
    countTokens = owned.countTokens as typeof countTokens;
    nowMs = owned.nowMs as typeof nowMs;
    getSdkMethodCounts = owned.getSdkMethodCounts as typeof getSdkMethodCounts;
    await verifyCalibrationPreflightState({ files: input.context.files });
  } catch { throw freshFatal(); }
  const context = input.context;
  const training = StrictCalibrationManifestSchema.parse(JSON.parse(context.files['calibration-manifest']));
  const benchmark = parseNutritionEvalManifest(JSON.parse(context.files['public-manifest']));
  const cases = new Map([...training.cases, ...benchmark.cases].map((row) => [row.id, row]));
  const history = prepareCalibrationBenchmarkHistory({ historicalReferenceBytes: context.files['historical-reference'],
    historicalReferenceHash: context.identity.historicalReferenceHash });
  let active = false;
  let poisoned = false;
  function fail(): never { poisoned = true; throw freshFatal(); }
  function guard(): void { if (!active || poisoned) fail(); }
  function call<T>(action: () => T): T {
    guard();
    const result = action();
    guard();
    return result;
  }
  async function wait<T>(action: () => T | Promise<T>): Promise<T> {
    guard();
    try {
      const result = await action();
      guard();
      return result;
    } catch (error) {
      guard();
      // A raw provider rejection must reach the producer's known rejection path.
      throw error;
    }
  }
  const ledger = Object.freeze(Object.fromEntries(METHODS.map((name) => [name, (...args: unknown[]) => {
    try { return call(() => Reflect.apply(native[name], native, args)); }
    catch { return fail(); }
  }]))) as unknown as Readonly<DriverLedger>;
  function counts(): Readonly<CalibrationSdkMethodCounts> {
    const raw = call(getSdkMethodCounts);
    const own = data(raw, ['vision', 'tokenCount'], guard);
    guard();
    for (const field of ['vision', 'tokenCount']) if (typeof own[field] !== 'number' || !Number.isInteger(own[field]) || own[field] < 0) fail();
    return Object.freeze({ vision: own.vision as number, tokenCount: own.tokenCount as number });
  }
  function delta(before: CalibrationSdkMethodCounts): Readonly<CalibrationSdkMethodCounts> {
    const after = counts();
    const result = { vision: after.vision - before.vision, tokenCount: after.tokenCount - before.tokenCount };
    if (result.vision < 0 || result.tokenCount < 0) fail();
    return Object.freeze(result);
  }
  function requireDelta(before: CalibrationSdkMethodCounts, vision: number, tokenCount: number): void {
    const actual = delta(before);
    if (actual.vision !== vision || actual.tokenCount !== tokenCount) fail();
  }
  function clock(): number {
    const value = call(nowMs);
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) fail();
    return value;
  }
  function predictionData(value: unknown): Record<string, unknown> {
    const object = plain(value, guard);
    const keys = Reflect.ownKeys(object);
    guard();
    const owned: Record<string, unknown> = {};
    for (const key of keys) {
      if (typeof key !== 'string') return fail();
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      guard();
      if (!descriptor || descriptor.enumerable !== true || !Object.hasOwn(descriptor, 'value') || descriptor.value === undefined) return fail();
      Object.defineProperty(owned, key, { value: descriptor.value, enumerable: true });
    }
    return owned;
  }
  async function token(): Promise<void> {
    if (ledger.getCounts().tokenCountReserved !== 0) return;
    const before = counts();
    const key = { kind: 'token_count' as const, stage: 'preflight' as const, caseId: context.firstDevelopmentCaseId, model: 'gemini-3.8-flash' };
    ledger.reserveTokenCount(key);
    let raw: unknown;
    let errorCategory: 'unknown' | 'empty_response' | undefined;
    try { raw = await wait(countTokens); }
    catch { guard(); errorCategory = 'unknown'; }
    const actual = delta(before);
    if (actual.vision !== 0 || (errorCategory === undefined ? actual.tokenCount !== 1 : actual.tokenCount > 1)) fail();
    let tokenCount: number | undefined;
    if (errorCategory === undefined) {
      try {
        const own = data(raw, ['tokenCount'], guard);
        guard();
        if (typeof own.tokenCount !== 'number' || !Number.isInteger(own.tokenCount) || own.tokenCount < 0) throw freshFatal();
        tokenCount = own.tokenCount;
      } catch { guard(); errorCategory = 'empty_response'; }
    }
    if (errorCategory !== undefined) {
      ledger.failTokenCount(key, errorCategory);
      ledger.recordSafeError({ kind: 'token_count', stage: 'preflight', caseId: key.caseId, errorCategory });
      fail();
    }
    if (tokenCount === undefined) fail();
    ledger.completeTokenCount(key, tokenCount);
  }
  function publishPrediction(key: Readonly<CalibrationReportOutcomeKey>, prediction: NutritionPrediction, barcode: boolean): void {
    guard();
    if (barcode) { ledger.recordNonReservationResult({ key, reason: 'barcode', prediction }); return; }
    const success = prediction.parseStatus === 'success';
    const nutrients = { kcal: prediction.kcal, proteinG: prediction.proteinG, carbsG: prediction.carbsG, fatG: prediction.fatG };
    const mass = prediction.diagnostics?.estimatedTotalMassG;
    const journal: JournalEntry = {
      key, predictionHash: success ? createHash('sha256').update(JSON.stringify(nutrients)).digest('hex') : 'unknown',
      normalizedPrediction: success ? { ...nutrients, ...(mass === undefined ? {} : { estimatedTotalMassG: mass }) } : null,
      analysisLatencyMs: prediction.latencyMs!, errorCategory: success ? 'none' : 'unknown',
      responseModelVersion: success ? ledger.getPinnedModelVersion()! : 'n/a', reportPrediction: prediction,
    };
    const owned = captureCalibrationReportJournalEntry(journal);
    guard();
    const hash = ledger.appendResultJournal(owned);
    ledger.complete(key, hash);
  }
  async function execute(stage: StageName): Promise<Readonly<CalibrationStageExecutionResult>> {
    if (active || poisoned) return fail();
    active = true;
    try {
      if (!STAGES.includes(stage)) return fail();
      ledger.assertIdentity(context.identity);
      const runtime = ledger.getRuntimeEvidenceSnapshot();
      if (runtime.activeAttempt !== null) return fail();
      for (const name of Object.keys(context.owner) as Array<keyof typeof context.owner>) if (runtime.owner[name] !== context.owner[name]) fail();
      let selected = ledger.getSelectedProfile();
      if ((stage === 'validation' || stage === 'benchmark') && selected !== 'LOW' && selected !== 'MEDIUM') return fail();
      const predecessors = STAGES.slice(0, STAGES.indexOf(stage));
      const completed = ledger.getCompletedStages();
      if (!predecessors.every((name, i) => completed[i] === name)) return fail();
      const alreadyComplete = completed.includes(stage);
      const profiles: readonly CalibrationProfile[] = stage === 'preflight' || stage === 'development' ? ['LOW', 'MEDIUM'] : [selected!];
      const before = counts();
      const receipts: Readonly<CalibrationPublishedReportReceipt>[] = [];
      const reports: CalibrationReportPublicationResult[] = [];
      if (!alreadyComplete) {
        if (completed.length !== predecessors.length) return fail();
        if (stage === 'preflight') await token();
        guard();
        const producer = await prepareCalibrationRuntimeEvidenceProducer({ context, ledger,
          ...(selected === undefined ? {} : { selectedProfile: selected }),
          loadImage: (key: Readonly<CalibrationReportOutcomeKey>) => observed(wait(() => input.loadImage(key))),
          generateVision: ((...args) => observed(wait(() => input.generateVision(...args)))) as GenAIAdapter['generateVision'],
          lookupSnapshot: (barcode: string) => call(() => input.lookupSnapshot(barcode)),
        });
        guard();
        const finished = new Set(runtime.events.filter((event) => event.type === 'runtime_attempt_finished').map((event) => keyId(event.key)));
        const rows = deriveCanonicalReportOutcomePlan(context.files, selected).filter((row) => row.key.stage === stage);
        for (const row of rows) {
          if (finished.has(keyId(row.key))) continue;
          const evalCase = cases.get(row.key.caseId);
          if (!evalCase) return fail();
          const startCounts = counts();
          const prediction = await producer.runOutcome(row.key, async (caps) => {
            guard();
            const barcode = evalCase.scanMode === 'barcode';
            const bytes = barcode ? undefined : await wait(() => caps.loadImage());
            guard();
            // Each closure owns this lease only. A swallowed stale call poisons
            // the enclosing driver even when a different producer is now active.
            let leaseOpen = true;
            const guardLease = (): void => { guard(); if (!leaseOpen) fail(); };
            try {
              const leasedAdapter = Object.freeze<GenAIAdapter>({
                generateChat: async () => fail(),
                generateVision: (model, prompt, imageBase64, source, options) => observed((async () => {
                  guardLease();
                  if (model !== 'gemini-3.8-flash' || source !== evalCase.scanMode || barcode || options !== undefined) return fail();
                  return await wait(() => caps.generateVision({ prompt, imageBase64 }));
                })()),
              });
              const adapter = createLiveNutritionEvalAdapter({ project: 'calorix-xurschnell', location: 'us', model: 'gemini-3.8-flash',
                genAIAdapter: leasedAdapter,
                fetchOffProductFn: async () => fail(),
                offSnapshotMap: { get(requested: string) {
                  guardLease();
                  if (!barcode || requested !== evalCase.suppliedBarcode) return fail();
                  return call(() => caps.lookupSnapshot());
                } },
              });
              guard();
              const start = clock();
              const value = await wait(() => adapter.analyzeCase(evalCase, bytes, { sampleIndex: row.key.sampleIndex }));
              const latencyMs = Math.max(0, clock() - start);
              // The live adapter has no runner metadata yet. Capture descriptors
              // before adding ours, then let the existing full codec own/validate it.
              const owned = predictionData(value);
              if (Object.hasOwn(owned, 'cached') && owned.cached !== false) return fail();
              const captured = captureCalibrationReportPrediction({ ...owned, latencyMs, sampleIndex: row.key.sampleIndex, cached: false });
              guard();
              requireDelta(startCounts, barcode ? 0 : 1, 0);
              return captured;
            } finally { leaseOpen = false; }
          }, (key, prediction) => publishPrediction(key, prediction, evalCase.scanMode === 'barcode'));
          guard();
          if (stage === 'preflight' && prediction.parseStatus !== 'success') return fail();
        }
        for (const profile of profiles) {
          const result = await wait(() => publishCalibrationStageReport({ stage, profile, context, readSnapshot: ledger.getStageReportSnapshot }));
          receipts.push(ledger.admitStageReportReceipt(stage, profile));
          ledger.bindRuntimeStageReport(stage, profile);
          reports.push(result);
        }
        if (stage === 'development') {
          const low = measureCalibrationStageReport(reports[0]!.report);
          const medium = measureCalibrationStageReport(reports[1]!.report);
          const decision = selectCalibrationProfileDecision(low.profile, medium.profile);
          const passed = evaluateCalibrationStageGate('development', decision.profile === 'LOW' ? low.stage : medium.stage).passed;
          ledger.recordProfileSelection(decision.profile, decision.reason, { stage, passed, completedStages: predecessors });
          selected = ledger.getSelectedProfile();
        }
      }
      ledger.completeStage(stage, { stage, passed: true, completedStages: predecessors });
      if (alreadyComplete) {
        const events = ledger.getRuntimeEvidenceSnapshot().events;
        for (const profile of profiles) {
          const binding = events.find((event) => event.type === 'runtime_report_bound' && event.stage === stage && event.profile === profile);
          if (binding?.type !== 'runtime_report_bound') return fail();
          receipts.push(binding.receipt);
        }
      }
      let historical: CalibrationStageExecutionResult['historical'];
      if (stage === 'benchmark') {
        const report = await wait(() => assembleCalibrationStageReport({ stage, profile: selected, context, readSnapshot: ledger.getStageReportSnapshot }));
        const assessment = call(() => history.assess(report));
        historical = Object.freeze({ comparison: assessment.comparison, subset: assessment.subset, provenance: assessment.provenance });
      }
      const reservations = ledger.getCounts();
      return Object.freeze({ stage, ...(selected === undefined ? {} : { selectedProfile: selected }), receipts: Object.freeze(receipts),
        cumulativeImageReservations: reservations.imageReserved, cumulativeTokenReservations: reservations.tokenCountReserved,
        newSdkMethodInvocations: delta(before), ...(historical === undefined ? {} : { historical }) });
    } catch { return fail(); }
    finally { active = false; }
  }
  return Object.freeze({ executeStage: (stage: StageName) => observed(execute(stage)) });
}
