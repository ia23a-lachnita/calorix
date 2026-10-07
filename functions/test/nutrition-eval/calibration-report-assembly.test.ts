import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareCalibrationBootstrapContext, deriveCanonicalAllowedKeys, deriveCanonicalReportOutcomePlan } from '../../src/nutrition-eval/calibration-bootstrap';
import { createProtocolCalibrationLedger } from '../../src/nutrition-eval/calibration';
import type { ReservationKey, StageName, CalibrationProfile, JournalEntry } from '../../src/nutrition-eval/calibration';
import { createFileCalibrationLedgerDeps } from '../../src/nutrition-eval/calibration-file-store';
import { prepareCalibrationOffSnapshotStore } from '../../src/nutrition-eval/calibration-off-snapshot-store';
import { createLiveNutritionEvalAdapter } from '../../src/nutrition-eval/live-adapter';
import { runNutritionEval } from '../../src/nutrition-eval/runner';
import { captureCalibrationReportPrediction } from '../../src/nutrition-eval/calibration-report-journal';
import { CALIBRATION_MANIFEST_SHA256, CALIBRATION_PUBLIC_MANIFEST_HASH } from '../../src/nutrition-eval/calibration-cli';
import { buildNutritionEvalReport, renderNutritionEvalJson, renderNutritionEvalMarkdown } from '../../src/nutrition-eval/report';
import { NutritionEvalReportSchema, parseNutritionEvalManifest, StrictCalibrationManifestSchema } from '../../src/nutrition-eval/schema';
import type { NutritionPrediction, NutritionEvalReport } from '../../src/nutrition-eval/schema';
import type { CalibrationStageReportSnapshot } from '../../src/nutrition-eval/calibration-report-state';
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const dirs: string[] = [];
const pin = 'gemini-3.8-fixture-pin';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
type Assembly = (params: unknown) => Promise<NutritionEvalReport>;
async function assembler(): Promise<Assembly> {
  const path = '../../src/nutrition-eval/calibration-report-assembly';
  const module = await import(/* @vite-ignore */ path) as Record<string, unknown>;
  expect(typeof module.assembleCalibrationStageReport).toBe('function');
  return module.assembleCalibrationStageReport as Assembly;
}
function prediction(source: 'meal' | 'label', sampleIndex: number): NutritionPrediction {
  return captureCalibrationReportPrediction({ parseStatus: 'success', source, kcal: 120,
    proteinG: 10, carbsG: 0, fatG: 8, confidence: 0.8, basis: 'portion', amount: 1,
    unit: 'portion', decision: 'needs_review', reviewReasons: [], latencyMs: 17,
    sampleIndex, cached: false, ...(source === 'meal' ? { diagnostics: {
      rawNutrients: { kcal: 120, proteinG: 10, carbsG: 0, fatG: 8 }, detectedItemCount: 1,
      estimatedTotalMassG: 90, declaredBasis: 'portion', declaredAmount: 1, declaredUnit: 'portion',
    } } : {}) });
}
function journal(key: ReservationKey, p: NutritionPrediction): JournalEntry {
  const four = { kcal: p.kcal!, proteinG: p.proteinG!, carbsG: p.carbsG!, fatG: p.fatG! };
  return { key, normalizedPrediction: { ...four, ...(p.diagnostics?.estimatedTotalMassG === undefined ? {} : {
    estimatedTotalMassG: p.diagnostics.estimatedTotalMassG,
  }) }, predictionHash: hash(JSON.stringify(four)), analysisLatencyMs: p.latencyMs!,
  errorCategory: 'none', responseModelVersion: pin, reportPrediction: p };
}
async function fixture(mixed = false) {
  const dir = mkdtempSync(resolve(tmpdir(), 'stage-report-assembly-')); dirs.push(dir);
  const context = await prepareCalibrationBootstrapContext({ baseDir: dir,
    readGitState: () => ({ headCommit: 'a'.repeat(40), implementationCommit: 'b'.repeat(40),
      functionsTreeId: 'c'.repeat(40), dirtyPaths: [] }),
    readCommittedFile: (path) => readFileSync(resolve(repo, path), 'utf8'),
    readOwner: () => ({ hostname: 'report-fixture', bootId: 'report-boot', pid: 44,
      startTicks: 44, acquiredAt: '2026-10-07T00:00:00.000Z' }),
  });
  let ticks = 0;
  const effects = { append: 0, fsync: 0, clock: 0 };
  const open = () => {
    const deps = createFileCalibrationLedgerDeps(dir);
    return createProtocolCalibrationLedger({ ...deps,
      appendLedgerEvent: (event) => { effects.append++; deps.appendLedgerEvent(event); },
      fsyncLedgerFile: () => { effects.fsync++; deps.fsyncLedgerFile(); },
      fsyncLedgerDir: () => { effects.fsync++; deps.fsyncLedgerDir(); },
      fsyncJournalFile: () => { effects.fsync++; deps.fsyncJournalFile(); },
      fsyncJournalDir: () => { effects.fsync++; deps.fsyncJournalDir(); },
      nowIso: () => { effects.clock++; return new Date(Date.UTC(2026, 9, 7) + ticks++ * 1000).toISOString(); },
    }, context.identity, (profile) => deriveCanonicalAllowedKeys(context.files, profile), {
      getReportOutcomePlan: (profile) => deriveCanonicalReportOutcomePlan(context.files, profile),
    });
  };
  const ledger = open(); ledger.acquireLock(context.owner);
  const terminal = (key: ReservationKey, mode: 'meal' | 'label') => {
    ledger.reserve(key); ledger.complete(key, ledger.appendResultJournal(journal(key, prediction(mode, key.sampleIndex))));
  };
  const first = context.firstDevelopmentCaseId;
  const token = { kind: 'token_count', stage: 'preflight', caseId: first, model: 'gemini-3.8-flash' } as const;
  ledger.reserveTokenCount(token); ledger.completeTokenCount(token, 42);
  const low = { stage: 'preflight', profile: 'LOW', caseId: first, sampleIndex: 1 } as const;
  ledger.reserve(low); ledger.pinModelVersion(pin);
  ledger.complete(low, ledger.appendResultJournal(journal(low, prediction('meal', 1))));
  terminal({ ...low, profile: 'MEDIUM' }, 'meal');
  ledger.completeStage('preflight', { stage: 'preflight', passed: true, completedStages: [] });
  const initial = deriveCanonicalReportOutcomePlan(context.files);
  const snapshots = new Map<string, CalibrationStageReportSnapshot>();
  const save = (stage: StageName, profile: CalibrationProfile) => snapshots.set(`${stage}/${profile}`, ledger.getStageReportSnapshot(stage, profile));
  save('preflight', 'LOW'); save('preflight', 'MEDIUM');
  const dev = initial.filter((row) => row.key.stage === 'development');
  for (let index = 0; index < dev.length; index++) {
    const key = dev[index]!.key;
    if (mixed && index === 0) {
      ledger.recordNonReservationResult({ key, reason: 'dataset', prediction: {
        parseStatus: 'failure', source: 'meal', decision: 'error', failureCategory: 'dataset',
        failureCode: 'dataset_fetch_failed', latencyMs: 9, sampleIndex: 1, cached: false,
      } });
    } else if (mixed && index === 1) {
      ledger.reserve(key); ledger.recoverAfterCrash();
    } else terminal(key, 'meal');
  }
  save('development', 'LOW'); save('development', 'MEDIUM');
  const forbidden = { image: vi.fn(() => { throw new Error('unexpected-image'); }),
    vision: vi.fn(() => { throw new Error('unexpected-vision'); }),
    off: vi.fn(() => { throw new Error('unexpected-off'); }),
    reserve: vi.fn(async () => { throw new Error('unexpected-reservation'); }),
    cache: vi.fn(async () => { throw new Error('unexpected-cache'); }) };
  let barcodePredictions: NutritionPrediction[] = [];
  if (!mixed) {
    ledger.recordProfileSelection('MEDIUM', 'fewer_unsafe', { stage: 'development', passed: true, completedStages: ['preflight'] });
    ledger.completeStage('development', { stage: 'development', passed: true, completedStages: ['preflight'] });
    const expanded = deriveCanonicalReportOutcomePlan(context.files, 'MEDIUM');
    for (const row of expanded.filter((row) => row.key.stage === 'validation')) terminal(row.key, 'meal');
    ledger.completeStage('validation', { stage: 'validation', passed: true, completedStages: ['preflight', 'development'] });
    save('validation', 'MEDIUM');
    const store = await prepareCalibrationOffSnapshotStore({ lockText: context.files['off-lock'],
      readSnapshot: async (path: string) => readFileSync(resolve(repo, path), 'utf8') });
    const adapter = createLiveNutritionEvalAdapter({ project: 'calorix-xurschnell', location: 'us', model: 'gemini-3.8-flash',
      offSnapshotMap: store, fetchOffProductFn: forbidden.off,
      genAIAdapter: { generateVision: forbidden.vision } as never,
      calibrationReservation: { stage: 'benchmark', profile: 'MEDIUM', onBeforeVisionRequest: forbidden.reserve } });
    let clock = 0;
    const barcodeCases = parseNutritionEvalManifest(JSON.parse(context.files['public-manifest'])).cases.filter((c) => c.scanMode === 'barcode');
    const results = await runNutritionEval(barcodeCases, { loadImage: forbidden.image,
      analyzeCase: adapter.analyzeCase, nowMs: () => clock += 10,
      cacheStore: { get: forbidden.cache, set: forbidden.cache } }, {
      datasetId: 'fixture', adapterModelId: 'gemini-3.8-flash', promptHash: context.identity.promptHash,
      codeSha: context.identity.implementationCommit, samples: 3,
      calibration: { mode: 'strict', skipImageForSuppliedBarcode: true, analysisOnlyLatency: true } });
    expect(results).toHaveLength(12);
    barcodePredictions = results.map((r) => captureCalibrationReportPrediction(r.prediction));
    expect(barcodePredictions.filter((p) => p.decision === 'complete')).toHaveLength(9);
    expect(barcodePredictions.filter((p) => p.decision === 'needs_review')).toHaveLength(3);
    for (const row of expanded.filter((row) => row.key.stage === 'benchmark')) {
      if (row.scanMode !== 'barcode') terminal(row.key, row.scanMode);
      else {
        const p = results.find((r) => r.caseId === row.key.caseId && r.prediction.sampleIndex === row.key.sampleIndex)!.prediction;
        ledger.recordNonReservationResult({ key: row.key, reason: 'barcode', prediction: p });
      }
    }
    save('benchmark', 'MEDIUM');
    // Both development profiles must remain readable after downstream selection.
    save('development', 'LOW'); save('development', 'MEDIUM');
  }
  ledger.releaseLock(context.owner);
  const reopened = open();
  return { context, ledger, reopened, snapshots, effects, forbidden, barcodePredictions };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
let clean: Fixture;
let mixed: Fixture;
beforeAll(async () => { clean = await fixture(); mixed = await fixture(true); }, 120000);
afterAll(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });
const params = (f = clean, stage: StageName = 'benchmark', profile: CalibrationProfile = 'MEDIUM') => ({
  stage, profile, context: f.context, readSnapshot: f.reopened.getStageReportSnapshot,
});

describe('new report metadata descriptor boundaries', () => {
  const kinds = ['safeErrors-accessor', 'latency-accessor', 'row-accessor', 'coverage-accessor',
    'row-hidden', 'row-symbol', 'coverage-hidden', 'coverage-symbol', 'array-accessor', 'array-hidden',
    'array-symbol', 'calibration-hidden', 'calibration-symbol', 'nonplain-row', 'inherited-addition'] as const;
  for (const route of ['builder', 'schema'] as const) {
    it.each(kinds)(`${route} rejects %s before any getter effect`, async (kind) => {
      const report = await (await assembler())(params(mixed, 'development', 'MEDIUM'));
      const input = clone(report);
      const calibration = input.calibration!;
      const row = calibration.safeErrors![0]!;
      const coverage = calibration.latencyCoverage!;
      const errors = calibration.safeErrors!;
      let reads = 0;
      const accessor = (target: object, key: string, value: unknown) => Object.defineProperty(target, key, {
        enumerable: true, configurable: true, get: () => { reads++; return value; },
      });
      const hidden = (target: object) => Object.defineProperty(target, 'privateExtra', { value: 'private', enumerable: false });
      const symbol = (target: object) => Object.defineProperty(target, Symbol('privateExtra'), { value: 'private', enumerable: true });
      if (kind === 'safeErrors-accessor') accessor(calibration, 'safeErrors', errors);
      if (kind === 'latency-accessor') accessor(calibration, 'latencyCoverage', coverage);
      if (kind === 'row-accessor') accessor(row, 'errorCategory', row.errorCategory);
      if (kind === 'coverage-accessor') accessor(coverage, 'measuredCases', coverage.measuredCases);
      if (kind === 'array-accessor') accessor(errors, '0', row);
      if (kind === 'row-hidden') hidden(row);
      if (kind === 'row-symbol') symbol(row);
      if (kind === 'coverage-hidden') hidden(coverage);
      if (kind === 'coverage-symbol') symbol(coverage);
      if (kind === 'array-hidden') hidden(errors);
      if (kind === 'array-symbol') symbol(errors);
      if (kind === 'calibration-hidden') hidden(calibration);
      if (kind === 'calibration-symbol') symbol(calibration);
      if (kind === 'nonplain-row') Object.setPrototypeOf(row, { privateExtra: 'private' });
      if (kind === 'inherited-addition') {
        delete calibration.safeErrors;
        Object.setPrototypeOf(calibration, { safeErrors: errors });
      }
      let thrown: unknown;
      try { if (route === 'builder') buildNutritionEvalReport(input.cases, input); else NutritionEvalReportSchema.parse(input); }
      catch (error) { thrown = error; }
      expect(thrown !== undefined).toBe(true);
      expect(reads).toBe(0);
    });
    it(`${route} accepts honest proxies without any Get on new metadata`, async () => {
      const input = clone(await (await assembler())(params(mixed, 'development', 'MEDIUM')));
      let gets = 0;
      const wrap = <T extends object>(value: T): T => new Proxy(value, { get: (target, key, receiver) => {
        gets++; return Reflect.get(target, key, receiver);
      } });
      input.calibration!.safeErrors![0] = wrap(input.calibration!.safeErrors![0]!);
      input.calibration!.safeErrors = wrap(input.calibration!.safeErrors!);
      input.calibration!.latencyCoverage = wrap(input.calibration!.latencyCoverage!);
      input.calibration = wrap(input.calibration!);
      const result = route === 'builder' ? buildNutritionEvalReport(input.cases, input) : NutritionEvalReportSchema.parse(input);
      expect(result.cases).toHaveLength(24); expect(result.calibration!.safeErrors).toHaveLength(1);
      expect(gets).toBe(0);
    });
    it(`${route} replaces foreign reflection failure without inspecting it`, async () => {
      const input = clone(await (await assembler())(params(mixed, 'development', 'MEDIUM')));
      let reads = 0;
      const foreign = new Proxy({}, { get: () => { reads++; throw new Error('private'); }, getPrototypeOf: () => { reads++; throw new Error('private'); } });
      input.calibration = new Proxy(input.calibration!, { ownKeys: () => { throw foreign; } });
      let caught: unknown;
      try { if (route === 'builder') buildNutritionEvalReport(input.cases, input); else NutritionEvalReportSchema.parse(input); }
      catch (error) { caught = error; }
      expect(caught !== undefined).toBe(true); expect(caught === foreign).toBe(false);
      expect(caught).not.toHaveProperty('cause'); expect(reads).toBe(0);
    });
  }
});
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('source-bound calibration stage reports', () => {
  it.each([['preflight', 'LOW', 1], ['preflight', 'MEDIUM', 1], ['development', 'LOW', 24],
    ['development', 'MEDIUM', 24], ['validation', 'MEDIUM', 48], ['benchmark', 'MEDIUM', 60]] as const)(
    'reconstructs %s/%s in immutable source/sample order (%i rows)', async (stage, profile, count) => {
      const assemble = await assembler(); const before = { ...clean.effects };
      const report = await assemble(params(clean, stage, profile));
      expect(report.cases).toHaveLength(count); expect(report.timestamp).toBe(clean.snapshots.get(`${stage}/${profile}`)!.startedAt);
      expect(report.datasetHash).toBe(stage === 'benchmark' ? CALIBRATION_PUBLIC_MANIFEST_HASH : CALIBRATION_MANIFEST_SHA256);
      expect(report.datasetId).toBe(stage === 'benchmark' ? 'calorix-public-v1' : 'calorix-n5k-calibration-v1');
      expect(report.codeSha).toBe('b'.repeat(40)); expect(report.comparison).toBeUndefined();
      expect(report.runId).toBe(`calibration-${stage}-${profile.toLowerCase()}-${'b'.repeat(12)}-${report.timestamp.replace(/[^0-9TZ]/g, '')}`);
      expect(report.calibration).toMatchObject({ safeErrors: [], latencyCoverage: { measuredCases: count, missingCases: 0 } });
      const planned = deriveCanonicalReportOutcomePlan(clean.context.files, 'MEDIUM').filter((row) => row.key.stage === stage && row.key.profile === profile);
      expect(report.cases.map((row) => `${row.caseId}/${row.prediction.sampleIndex}`)).toEqual(planned.map((row) => `${row.key.caseId}/${row.key.sampleIndex}`));
      expect(Object.isFrozen(report)).toBe(true); expect(Object.isFrozen(report.cases[0]!.truth)).toBe(true);
      expect(clean.effects).toEqual(before);
    });
  it('preserves all12 actual offline barcode predictions, measured latency, zero vision/OFF/cache/reserve effects, restart bytes', async () => {
    const assemble = await assembler(); const report = await assemble(params());
    expect(report.calibration?.imageCallsReserved).toBe(48);
    expect(report.cases.filter((row) => row.prediction.source === 'barcode').map((row) => row.prediction)).toEqual(clean.barcodePredictions);
    expect(clean.barcodePredictions.every((p) => p.latencyMs === 10 && p.cached === false)).toBe(true);
    for (const hook of Object.values(clean.forbidden)) expect(hook).not.toHaveBeenCalled();
    const live = await assemble({ ...params(), readSnapshot: clean.ledger.getStageReportSnapshot });
    expect(renderNutritionEvalJson(live)).toBe(renderNutritionEvalJson(report));
    expect(renderNutritionEvalMarkdown(live)).toBe(renderNutritionEvalMarkdown(report));
    expect(hash(renderNutritionEvalJson(live))).toBe(hash(renderNutritionEvalJson(report)));
  });
  it.each(['LOW', 'MEDIUM'] as const)('accounts for dataset/interrupted outcomes at zero invented latency or provider errors: %s', async (profile) => {
    const assemble = await assembler(); const report = await assemble(params(mixed, 'development', profile));
    const snapshot = mixed.reopened.getStageReportSnapshot('development', profile);
    expect(report.cases).toHaveLength(24); expect(report.calibration?.imageCallsReserved).toBe(snapshot.counts.imageCallsReserved);
    expect(report.calibration?.safeErrors).toHaveLength(snapshot.counts.imageCallsFailed);
    const interrupted = report.cases.find((row) => row.prediction.failureCode === 'interrupted_reservation');
    if (interrupted) {
      expect(interrupted.prediction).toMatchObject({ failureCategory: 'runner', source: 'meal', cached: false });
      expect(interrupted.prediction).not.toHaveProperty('latencyMs'); expect(interrupted.prediction).not.toHaveProperty('kcal');
      expect(report.calibration?.latencyCoverage).toEqual({ measuredCases: 23, missingCases: 1 });
      expect(report.calibration?.safeErrors).toEqual([{ caseId: interrupted.caseId, sampleIndex: 1, errorCategory: 'interrupted_reservation' }]);
    } else {
      expect(report.cases.some((row) => row.prediction.failureCategory === 'dataset')).toBe(true);
      expect(report.calibration?.imageCallsReserved).toBe(23); expect(report.calibration?.safeErrors).toEqual([]);
    }
    expect(renderNutritionEvalJson(await assemble({ ...params(mixed, 'development', profile), readSnapshot: mixed.ledger.getStageReportSnapshot }))).toBe(renderNutritionEvalJson(report));
  });
  it('scores valid inaccurate nutrients/mass instead of replacing or filtering them', async () => {
    const report = await (await assembler())(params(clean, 'development', 'LOW'));
    const source = StrictCalibrationManifestSchema.parse(JSON.parse(clean.context.files['calibration-manifest'])).cases[0]!;
    const result = report.cases[0]!;
    expect(result.prediction.kcal).toBe(120); expect(result.truth).toEqual(source.truth);
    for (const [field, actual] of [['kcal', 120], ['proteinG', 10], ['carbsG', 0], ['fatG', 8]] as const) {
      expect(result.numeric[field]?.absoluteError).toBeCloseTo(Math.abs(actual - source.truth[field]), 8);
      expect(result.numeric[field]?.relativeError).toBeCloseTo(Math.abs(actual - source.truth[field]) / Math.max(Math.abs(source.truth[field]), 1), 8);
    }
    expect(result.diagnostics?.mealMassG?.relativeError).toBeCloseTo(Math.abs(90 - source.truth.referenceMassG) / source.truth.referenceMassG, 8);
    expect(result.diagnostics?.mealDensityPer100?.carbsG?.relativeError).toBe(source.truth.carbsG === 0 ? undefined : 1);
    for (const [field, actual] of [['proteinG', 10], ['fatG', 8]] as const) {
      const actualDensity = actual * 100 / 90;
      const truthDensity = source.truth[field] * 100 / source.truth.referenceMassG;
      expect(result.diagnostics?.mealDensityPer100?.[field]?.relativeError).toBeCloseTo(Math.abs(actualDensity - truthDensity) / truthDensity, 8);
    }
    const cases = StrictCalibrationManifestSchema.parse(JSON.parse(clean.context.files['calibration-manifest'])).cases.filter((c) => c.group === 'development');
    const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); return (sorted[Math.floor((sorted.length - 1) / 2)]! + sorted[Math.floor(sorted.length / 2)]!) / 2; };
    const macros = [['proteinG', 10, 'medianProteinRelativeError'], ['carbsG', 0, 'medianCarbsRelativeError'], ['fatG', 8, 'medianFatRelativeError']] as const;
    const pooled: number[] = [];
    for (const [field, actual, metric] of macros) {
      const errors = cases.filter((c) => c.truth[field] > 0).map((c) => Math.abs(actual - c.truth[field]) / c.truth[field]);
      pooled.push(...errors); expect(report.summary[metric]).toBeCloseTo(median(errors), 8);
    }
    expect(report.summary.meanZeroSafeMacroRelativeError).toBeCloseTo(average(pooled), 8);
    expect(report.summary.meanMealMassRelativeError).toBeCloseTo(average(cases.map((c) => Math.abs(90 - c.truth.referenceMassG) / c.truth.referenceMassG)), 8);
    expect(report.summary.meanMealCarbDensityRelativeError).toBe(1);
    expect(report.summary.meanMealFatDensityRelativeError).toBeCloseTo(average(cases.filter((c) => c.truth.fatG > 0).map((c) => Math.abs(8 / 90 - c.truth.fatG / c.truth.referenceMassG) / (c.truth.fatG / c.truth.referenceMassG))), 8);
  });
  it('captures source and callback before await and keeps truth immutable under callback mutation', async () => {
    const assemble = await assembler(); const files = { ...clean.context.files }; const context = { ...clean.context, files };
    const read = vi.fn(() => { files['calibration-manifest'] = 'mutated'; return clean.reopened.getStageReportSnapshot('development', 'LOW'); });
    const promise = assemble({ stage: 'development', profile: 'LOW', context, readSnapshot: read });
    files['public-manifest'] = 'mutated-before-await';
    const report = await promise; expect(report.cases).toHaveLength(24); expect(read).toHaveBeenCalledTimes(1);
    expect(report.truth).toBeUndefined();
  });
  it.each(['missing', 'duplicate', 'extra', 'source', 'profile', 'sample', 'pending', 'counter', 'timestamp', 'identity'])(
    'fails closed for malformed snapshot: %s', async (kind) => {
      const assemble = await assembler(); const snapshot = clone(clean.snapshots.get('benchmark/MEDIUM')!);
      const raw = snapshot as unknown as { images: Array<Record<string, unknown>>; counts: Record<string, number>; startedAt?: string; identity: Record<string, unknown> };
      const row = raw.images[0]!;
      if (kind === 'missing') { raw.images.pop(); raw.counts.imageCallsReserved!--; raw.counts.imageCallsCompleted!--; }
      if (kind === 'duplicate') raw.images.push(clone(row));
      if (kind === 'extra') { const extra = clone(row); (extra.key as Record<string, unknown>).caseId = 'unplanned-case'; raw.images.push(extra); }
      if (kind === 'source') ((row.journal as JournalEntry).reportPrediction as NutritionPrediction).source = 'barcode';
      if (kind === 'profile') (row.key as Record<string, unknown>).profile = 'LOW';
      if (kind === 'sample') (row.key as Record<string, unknown>).sampleIndex = 4;
      if (kind === 'pending') { row.status = 'reserved'; delete row.journal; delete row.journalHash; }
      if (kind === 'counter') raw.counts.imageCallsReserved = 2;
      if (kind === 'timestamp') delete raw.startedAt;
      if (kind === 'identity') raw.identity.implementationCommit = 'd'.repeat(40);
      await expect(assemble({ ...params(), readSnapshot: () => snapshot })).rejects.toBeInstanceOf(CalibrationFatalError);
    });
  it.each(['truth', 'comparison', 'runId', 'timestamp', 'results'])('rejects caller replacement %s before reading snapshot', async (field) => {
    const assemble = await assembler(); const read = vi.fn(() => clean.snapshots.get('benchmark/MEDIUM'));
    await expect(assemble({ ...params(), readSnapshot: read, [field]: 'override' })).rejects.toThrow('calibration:stage-report-invalid');
    expect(read).not.toHaveBeenCalled();
  });
  it.each(['public-manifest', 'calibration-manifest', 'prompt', 'source-lock', 'off-lock', 'response-schema', 'historical-reference'] as const)(
    'rejects unpinned %s bytes before snapshot callback', async (name) => {
      const assemble = await assembler(); const read = vi.fn();
      const parsed = JSON.parse(clean.context.files[name]);
      const tampered = JSON.stringify(Array.isArray(parsed) ? [...parsed, 'tampered'] : { ...parsed, unapproved: 'tampered' });
      await expect(assemble({ ...params(), context: { ...clean.context, files: { ...clean.context.files, [name]: tampered } }, readSnapshot: read })).rejects.toThrow('calibration:stage-report-invalid');
      expect(read).not.toHaveBeenCalled();
    });
  it.each(['accessor', 'hidden', 'symbol', 'prototype'])('rejects hostile request %s without getters or callback effects', async (kind) => {
    const assemble = await assembler(); const read = vi.fn(); const getter = vi.fn(); const request: Record<string | symbol, unknown> = { ...params(), readSnapshot: read };
    if (kind === 'accessor') Object.defineProperty(request, 'stage', { enumerable: true, get: getter });
    if (kind === 'hidden') Object.defineProperty(request, 'secret', { value: 'private', enumerable: false });
    if (kind === 'symbol') request[Symbol('extra')] = 'private';
    if (kind === 'prototype') Object.setPrototypeOf(request, { hidden: true });
    await expect(assemble(request)).rejects.toThrow('calibration:stage-report-invalid'); expect(getter).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled();
  });
  it('accepts honest get-trap proxies with zero Get calls', async () => {
    const assemble = await assembler(); let gets = 0;
    const wrap = <T extends object>(value: T): T => new Proxy(value, { get: (target, key, receiver) => { gets++; return Reflect.get(target, key, receiver); } });
    const report = await assemble(wrap({ ...params(), context: wrap({ ...clean.context, files: wrap({ ...clean.context.files }), identity: wrap({ ...clean.context.identity }) }) }));
    expect(report.cases).toHaveLength(60); expect(gets).toBe(0);
  });
  it('replaces foreign callback exceptions with fresh causeless static fatal without inspecting it', async () => {
    const assemble = await assembler(); let reads = 0;
    const foreign = new Proxy({}, { get: () => { reads++; throw new Error('private'); }, getPrototypeOf: () => { reads++; throw new Error('private'); } });
    let caught: unknown;
    try { await assemble({ ...params(), readSnapshot: () => { throw foreign; } }); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(CalibrationFatalError); expect((caught as Error).message).toBe('calibration:stage-report-read-failed');
    expect(caught === foreign).toBe(false); expect(caught).not.toHaveProperty('cause'); expect(reads).toBe(0);
  });
  it.each(['context', 'files', 'identity'] as const)('rejects accessor %s without invoking it or snapshot', async (target) => {
    const assemble = await assembler(); const read = vi.fn(); const getter = vi.fn();
    const context = { ...clean.context, files: { ...clean.context.files }, identity: { ...clean.context.identity } };
    const object = target === 'context' ? context : context[target];
    const key = target === 'context' ? 'files' : target === 'files' ? 'prompt' : 'implementationCommit';
    Object.defineProperty(object, key, { enumerable: true, get: getter });
    await expect(assemble({ ...params(), context, readSnapshot: read })).rejects.toThrow('calibration:stage-report-invalid');
    expect(getter).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled();
  });
  it.each(['unknown-category', 'none', 'extra-field', 'duplicate', 'wrong-case', 'wrong-sample', 'undefined', 'null', 'timing-extra', 'timing-undefined'])(
    'rejects unapproved additive metadata: %s', async (kind) => {
      const report = await (await assembler())(params(mixed, 'development', 'MEDIUM'));
      const invalid = clone(report) as unknown as { calibration: Record<string, unknown> };
      const original = report.calibration!.safeErrors![0]!;
      let errors: unknown = [{ ...original }];
      if (kind === 'unknown-category') errors = [{ ...original, errorCategory: 'raw-private' }];
      if (kind === 'none') errors = [{ ...original, errorCategory: 'none' }];
      if (kind === 'extra-field') errors = [{ ...original, rawResponse: 'private' }];
      if (kind === 'duplicate') errors = [original, original];
      if (kind === 'wrong-case') errors = [{ ...original, caseId: 'not-a-case' }];
      if (kind === 'wrong-sample') errors = [{ ...original, sampleIndex: 2 }];
      if (kind === 'undefined') errors = undefined;
      if (kind === 'null') errors = null;
      invalid.calibration.safeErrors = errors;
      if (kind === 'timing-extra') invalid.calibration.latencyCoverage = { measuredCases: 23, missingCases: 1, raw: 'private' };
      if (kind === 'timing-undefined') invalid.calibration.latencyCoverage = undefined;
      expect(NutritionEvalReportSchema.safeParse(invalid).success).toBe(false);
    });
  it('publishes measured/missing timing and closed safe errors in Markdown and schema', async () => {
    const report = await (await assembler())(params(mixed, 'development', 'MEDIUM'));
    expect(renderNutritionEvalMarkdown(report)).toContain('latencyMeasuredCases: 23');
    expect(renderNutritionEvalMarkdown(report)).toContain('interrupted_reservation');
    const invalid = clone(report) as unknown as { calibration: Record<string, unknown> };
    invalid.calibration.safeErrors = [{ caseId: report.cases[0]!.caseId, sampleIndex: 1, errorCategory: 'raw-private-error' }];
    expect(NutritionEvalReportSchema.safeParse(invalid).success).toBe(false);
    invalid.calibration.safeErrors = []; expect(NutritionEvalReportSchema.safeParse(invalid).success).toBe(false);
    invalid.calibration.safeErrors = report.calibration!.safeErrors;
    invalid.calibration.latencyCoverage = { measuredCases: 24, missingCases: 0 };
    expect(NutritionEvalReportSchema.safeParse(invalid).success).toBe(false);
  });
  it('preserves historical v1 schema and Markdown when metadata is absent', () => {
    const historical = NutritionEvalReportSchema.parse(JSON.parse(readFileSync(resolve(repo, 'functions/test/nutrition-eval/fixtures/historical-report-v1.json'), 'utf8')));
    expect(renderNutritionEvalMarkdown(historical)).not.toContain('latencyMeasuredCases');
    expect(hash(renderNutritionEvalJson(historical))).toBe('6b3991cda0fa3ecb601abc5b108715057a2302b9314f1df2ad9224a6eb1c9906');
    expect(hash(renderNutritionEvalMarkdown(historical))).toBe('bf01ddb65da5a9d321fc0d1f684b136caf4f989ca0b45948f9ebc739ccd02c18');
  });
  it.each(['LOW', undefined])('refuses downstream snapshot selection %s', async (selectedProfile) => {
    const assemble = await assembler(); const snapshot = clone(clean.snapshots.get('benchmark/MEDIUM')!);
    await expect(assemble({ ...params(), readSnapshot: () => ({ ...snapshot, ...(selectedProfile === undefined ? {} : { selectedProfile }), selectedProfile }) })).rejects.toBeInstanceOf(CalibrationFatalError);
  });
  it.each(['product', 'barcode-and-basis'])('retains valid non-reservation %s errors for scoring instead of filtering', async (kind) => {
    const assemble = await assembler(); const snapshot = clone(clean.snapshots.get('benchmark/MEDIUM')!);
    const row = snapshot.nonReservations[0]!;
    const p = captureCalibrationReportPrediction(kind === 'product' ? {
      parseStatus: 'failure', source: 'barcode', decision: 'error', failureCategory: 'product',
      failureCode: 'off_product_not_found', latencyMs: 10, sampleIndex: row.key.sampleIndex, cached: false,
    } : { ...row.prediction, barcode: '12345678', basis: 'portion', amount: 1, unit: 'portion' });
    Object.assign(row, { prediction: p, contentDigest: hash(JSON.stringify({ key: row.key, reason: row.reason, prediction: p, at: row.at })) });
    const report = await assemble({ ...params(), readSnapshot: () => snapshot });
    const result = report.cases.find((r) => r.caseId === row.key.caseId && r.prediction.sampleIndex === row.key.sampleIndex)!;
    expect(result.prediction).toEqual(p); expect(report.cases).toHaveLength(60);
    expect(report.calibration?.imageCallsReserved).toBe(48); expect(report.calibration?.safeErrors).toEqual([]);
    if (kind === 'product') expect(result.prediction.failureCode).toBe('off_product_not_found');
    else { expect(result.booleans.barcodeExactMatch).toBe(false); expect(result.booleans.basisExactMatch).toBe(false); }
  });
});
