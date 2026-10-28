/** Native controller behavior; raw media and SDK transport alone are fake. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareCalibrationStageDriver } from '../../src/nutrition-eval/calibration-stage-driver';
import type { CalibrationStageDriver, CalibrationStageDriverDeps } from '../../src/nutrition-eval/calibration-stage-driver';
import { selectCalibrationProfileDecision } from '../../src/nutrition-eval/calibration';
import type { StageName } from '../../src/nutrition-eval/calibration';
import type { CalibrationProfileMetrics } from '../../src/nutrition-eval/calibration-report-measurements';
import { prepareCalibrationStageReportArtifactVerifier } from '../../src/nutrition-eval/calibration-report-artifact-verification';
import { NutritionEvalReportSchema, parseNutritionEvalManifest, StrictCalibrationManifestSchema } from '../../src/nutrition-eval/schema';
import * as liveAdapter from '../../src/nutrition-eval/live-adapter';
import * as publication from '../../src/nutrition-eval/calibration-report-publication';
import { makeCalibrationDriverFixture } from './calibration-native-controller-fixtures';
import type { DriverFixture } from './calibration-native-controller-fixtures';
import type { GenAIAdapter } from '../../src/genai-adapter';

const roots: string[] = [];
const stages = ['preflight', 'development', 'validation', 'benchmark'] as const;
const fatal = 'calibration:stage-driver-failed';
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
function prefix(root: string): Record<string, string> {
  const result: Record<string, string> = {};
  function walk(path: string): void {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) walk(file);
      else result[file.slice(root.length)] = sha(readFileSync(file));
    }
  }
  walk(root);
  return result;
}
async function rejectsWithoutMoreEffects(driver: Readonly<CalibrationStageDriver>, f: DriverFixture) {
  const before = prefix(f.root);
  const ports = JSON.stringify(f.witness);
  await expect(driver.executeStage('preflight')).rejects.toThrow(fatal);
  expect(prefix(f.root)).toEqual(before);
  expect(JSON.stringify(f.witness)).toBe(ports);
}
async function runThrough(driver: Readonly<CalibrationStageDriver>, f: DriverFixture, last: StageName) {
  for (const stage of stages) {
    f.beginInvocation(stage);
    await driver.executeStage(stage);
    if (stage === last) break;
  }
}
function assertIndependentProtocol(f: DriverFixture): void {
  expect(f.witness.visionByStage).toEqual({ preflight: 2, development: 48, validation: 48, benchmark: 48 });
  expect(f.witness.sdkVision).toBe(146);
  expect(f.witness.sdkToken).toBe(1);
  expect(f.witness.transportVision).toBe(146);
  expect(f.witness.barcodeLookups).toBe(12);
}

describe('leased native stage driver', () => {
  it('drives the complete MEDIUM protocol with independent SDK methods and all twelve native artifacts', async () => {
    const f = await makeCalibrationDriverFixture(roots, { winner: 'MEDIUM' });
    const before = prefix(f.root);
    const driver = await prepareCalibrationStageDriver(f.driverDeps);
    expect(prefix(f.root)).toEqual(before);
    expect(f.witness.sdkVision).toBe(0);
    const receipts: publication.CalibrationPublishedReportReceipt[] = [];
    let reservationIndex = 0;
    for (const stage of stages) {
      f.beginInvocation(stage);
      const result = await driver.executeStage(stage);
      expect(result.stage).toBe(stage);
      expect(result.cumulativeImageReservations).toBe([2, 50, 98, 146][reservationIndex]);
      expect(result.cumulativeTokenReservations).toBe(1);
      expect(result.newSdkMethodInvocations).toEqual({ vision: [2, 48, 48, 48][reservationIndex], tokenCount: reservationIndex === 0 ? 1 : 0 });
      expect(result.receipts).toHaveLength(reservationIndex < 2 ? 2 : 1);
      if (stage !== 'preflight') expect(result.selectedProfile).toBe('MEDIUM');
      if (stage === 'benchmark') {
        expect(Object.keys(result.historical ?? {}).sort()).toEqual(['comparison', 'provenance', 'subset']);
        expect(result.historical?.comparison.compatible).toBe(true);
        expect(Object.keys(result.historical?.comparison.deltas ?? {})).toHaveLength(7);
      }
      receipts.push(...result.receipts);
      reservationIndex++;
    }
    assertIndependentProtocol(f);
    expect(f.forbiddenCalls).toEqual([]);
    const keys = f.finishedCanonicalKeys();
    expect(keys).toHaveLength(158);
    expect(new Set(keys.map((key) => JSON.stringify(key))).size).toBe(158);
    expect(f.bindingCount()).toBe(6);
    expect(readdirSync(join(f.root, 'reports'))).toHaveLength(12);
    const calibration = StrictCalibrationManifestSchema.parse(JSON.parse(f.context.files['calibration-manifest']));
    const benchmark = parseNutritionEvalManifest(JSON.parse(f.context.files['public-manifest']));
    expect(calibration.cases.filter((row) => row.group === 'development')).toHaveLength(24);
    expect(calibration.cases.filter((row) => row.group === 'validation')).toHaveLength(16);
    expect(benchmark.cases).toHaveLength(20);
    const verifier = await prepareCalibrationStageReportArtifactVerifier(f.context);
    for (const receipt of receipts) {
      const { stage, profile } = receipt;
      const stem = join(f.root, 'reports', `${stage}-${profile.toLowerCase()}`);
      const json = readFileSync(`${stem}.json`);
      const markdown = readFileSync(`${stem}.md`);
      expect(sha(json)).toBe(receipt.jsonSha256);
      expect(sha(markdown)).toBe(receipt.markdownSha256);
      expect(markdown.length).toBeGreaterThan(0);
      const report = NutritionEvalReportSchema.parse(JSON.parse(json.toString('utf8')));
      const verified = verifier.verify({ stage, profile, snapshot: f.ledger.getStageReportSnapshot(stage, profile) });
      expect(verified.receipt).toEqual(receipt);
      expect(verified.report).toEqual(report);
      const population = stage === 'benchmark' ? benchmark.cases : stage === 'preflight'
        ? calibration.cases.filter((row) => row.id === f.context.firstDevelopmentCaseId)
        : calibration.cases.filter((row) => row.group === stage);
      const samples = stage === 'validation' || stage === 'benchmark' ? [1, 2, 3] : [1];
      const expected = population.flatMap((row) => samples.map((sample) => `${row.id}|${sample}`)).sort();
      expect(report.cases.map((row) => `${row.caseId}|${row.prediction.sampleIndex}`).sort()).toEqual(expected);
      expect(report.cases.every((row) => row.prediction.cached === false)).toBe(true);
      expect(report.cases.every((row) => row.prediction.latencyMs === 1)).toBe(true);
      if (stage === 'benchmark') {
        expect(report.publicCases).toBe(20);
        expect(report.privateCases).toBe(0);
        expect(report.cases.filter((row) => row.prediction.source === 'meal')).toHaveLength(36);
        expect(report.cases.filter((row) => row.prediction.source === 'label')).toHaveLength(12);
        expect(report.cases.filter((row) => row.prediction.source === 'barcode')).toHaveLength(12);
      }
    }
    expect(f.witness.imageLoads).toHaveLength(146);
    const barcodeIds = new Set(benchmark.cases.filter((row) => row.scanMode === 'barcode').map((row) => row.id.slice(4)));
    expect(f.witness.imageLoads.every((row) => row.key !== undefined && !barcodeIds.has(row.caseId.slice(4)))).toBe(true);
    expect(f.witness.snapshotLookups.every((row) => row.stage === 'benchmark' && barcodeIds.has(row.barcode))).toBe(true);
    const completedPrefix = prefix(f.root);
    f.beginInvocation('benchmark');
    const repeated = await driver.executeStage('benchmark');
    expect(repeated.newSdkMethodInvocations).toEqual({ vision: 0, tokenCount: 0 });
    expect(prefix(f.root)).toEqual(completedPrefix);
    assertIndependentProtocol(f);
    f.ledger.releaseLock(f.context.owner);
  }, 600000);

  it('rejects independent witness qualification when one SDK call hides a transport retry', async () => {
    const f = await makeCalibrationDriverFixture(roots, { winner: 'MEDIUM', extraTransportOnVision: 1 });
    const driver = await prepareCalibrationStageDriver(f.driverDeps);
    await runThrough(driver, f, 'benchmark');
    expect(f.witness.sdkVision).toBe(146);
    expect(f.witness.transportVision).toBe(147);
    expect(() => assertIndependentProtocol(f)).toThrow();
    expect(f.finishedCanonicalKeys()).toHaveLength(158);
    f.ledger.releaseLock(f.context.owner);
  }, 600000);

  it.each(['validation', 'benchmark'] as const)('refuses %s before a profile is selected, without invoking a port', async (stage) => {
    const f = await makeCalibrationDriverFixture(roots, { winner: 'MEDIUM' });
    let counterReads = 0;
    const driver = await prepareCalibrationStageDriver({ ...f.driverDeps,
      getSdkMethodCounts() { counterReads++; return f.driverDeps.getSdkMethodCounts(); },
    });
    const before = prefix(f.root);
    await expect(driver.executeStage(stage)).rejects.toThrow(fatal);
    expect(prefix(f.root)).toEqual(before);
    expect(f.witness.sdkVision).toBe(0);
    expect(f.witness.sdkToken).toBe(0);
    expect(counterReads).toBe(0);
    await rejectsWithoutMoreEffects(driver, f);
  });

  it.each(['accessor', 'symbol', 'undefined', 'array', 'prototype', 'reflection'] as const)(
    'rejects %s dependencies before any callback or ledger effect', async (kind) => {
      const f = await makeCalibrationDriverFixture(roots, { winner: 'MEDIUM' });
      let reads = 0;
      const deps = { ...f.driverDeps };
      let input: unknown = deps;
      if (kind === 'accessor') Object.defineProperty(deps, 'countTokens', { enumerable: true, get() { reads++; return f.driverDeps.countTokens; } });
      if (kind === 'symbol') Object.defineProperty(deps, Symbol('extra'), { value: 1 });
      if (kind === 'undefined') Object.defineProperty(deps, 'nowMs', { value: undefined });
      if (kind === 'array') input = [];
      if (kind === 'prototype') Object.setPrototypeOf(deps, { injected: true });
      if (kind === 'reflection') input = new Proxy(deps, { ownKeys() { throw new Proxy({}, { get() { reads++; throw 0; } }); } });
      const before = prefix(f.root);
      await expect(prepareCalibrationStageDriver(input)).rejects.toThrow(fatal);
      expect(reads).toBe(0);
      expect(prefix(f.root)).toEqual(before);
      expect(f.witness.sdkVision).toBe(0);
      expect(f.witness.sdkToken).toBe(0);
    },
  );

  it('captures caller dependencies and context before suspension without freezing the caller', async () => {
    const f = await makeCalibrationDriverFixture(roots, { winner: 'MEDIUM' });
    const context = { ...f.context, files: { ...f.context.files } };
    const deps = { ...f.driverDeps, context };
    const preparing = prepareCalibrationStageDriver(deps);
    deps.countTokens = async () => { throw new Error('mutated-callback'); };
    context.files.prompt = 'mutated';
    const driver = await preparing;
    expect(Object.isFrozen(deps)).toBe(false);
    expect(Object.isFrozen(context)).toBe(false);
    f.beginInvocation('preflight');
    await driver.executeStage('preflight');
    expect(f.witness.sdkVision).toBe(2);
    expect(f.witness.sdkToken).toBe(1);
    f.ledger.releaseLock(f.context.owner);
  }, 600000);

  it('excludes slow image loading from measured analysis latency', async () => {
    const f = await makeCalibrationDriverFixture(roots, { winner: 'MEDIUM' });
    let clock = 0;
    const driver = await prepareCalibrationStageDriver({ ...f.driverDeps,
      loadImage: async (key: Parameters<CalibrationStageDriverDeps['loadImage']>[0]) => { clock += 120000; return f.driverDeps.loadImage(key); },
      nowMs: () => ++clock,
    });
    await runThrough(driver, f, 'preflight');
    for (const profile of ['LOW', 'MEDIUM'] as const) {
      const snapshot = f.ledger.getStageReportSnapshot('preflight', profile);
      expect(snapshot.images[0]?.status).toBe('completed');
      const image = snapshot.images[0];
      if (image?.status !== 'completed') throw new Error('expected-completed-image');
      expect(image.journal.analysisLatencyMs).toBe(1);
    }
    f.ledger.releaseLock(f.context.owner);
  }, 600000);

  it.each(['provider', 'parse'] as const)('finishes an ordinary %s failure in losing development LOW and selects measured MEDIUM', async (kind) => {
    const f = await makeCalibrationDriverFixture(roots, { winner: 'MEDIUM' });
    let stage: StageName = 'preflight';
    let failed = false;
    const driver = await prepareCalibrationStageDriver({ ...f.driverDeps,
      generateVision: async (...args: Parameters<CalibrationStageDriverDeps['generateVision']>) => {
        const text = await f.driverDeps.generateVision(...args);
        if (stage === 'development' && args[4]?.thinkingLevel === 'LOW' && !failed) {
          failed = true;
          if (kind === 'provider') throw new Error('private-provider-detail');
          return '{broken';
        }
        return text;
      },
    });
    await runThrough(driver, f, 'preflight');
    stage = 'development';
    f.beginInvocation(stage);
    const result = await driver.executeStage(stage);
    expect(result.selectedProfile).toBe('MEDIUM');
    expect(f.finishedCanonicalKeys()).toHaveLength(50);
    const low = f.ledger.getStageReportSnapshot(stage, 'LOW');
    expect(low.images.filter((row) => row.status === 'completed' && row.journal.reportPrediction?.parseStatus === 'failure')).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain('private-provider-detail');
    f.ledger.releaseLock(f.context.owner);
  }, 600000);

  it('stops before MEDIUM when the first preflight prediction fails parsing', async () => {
    const f = await makeCalibrationDriverFixture(roots, { winner: 'MEDIUM' });
    const driver = await prepareCalibrationStageDriver({ ...f.driverDeps,
      generateVision: async (...args: Parameters<CalibrationStageDriverDeps['generateVision']>) => { await f.driverDeps.generateVision(...args); return '{broken'; },
    });
    f.beginInvocation('preflight');
    await expect(driver.executeStage('preflight')).rejects.toThrow(fatal);
    expect(f.witness.sdkVision).toBe(1);
    expect(f.finishedCanonicalKeys()).toHaveLength(1);
    expect(f.bindingCount()).toBe(0);
    await rejectsWithoutMoreEffects(driver, f);
  });

  it.each(['missing', 'duplicate', 'mismatch'] as const)('halts on %s response metadata without a result journal', async (kind) => {
    const f = await makeCalibrationDriverFixture(roots, { winner: 'MEDIUM' });
    let calls = 0;
    const driver = await prepareCalibrationStageDriver({ ...f.driverDeps,
      generateVision: async (...args: Parameters<CalibrationStageDriverDeps['generateVision']>) => {
        calls++;
        const original = args[4];
        if (!original) throw new Error('missing-options');
        return f.driverDeps.generateVision(args[0], args[1], args[2], args[3], { ...original,
          onResponseMetadata: (metadata) => {
            if (kind === 'missing') return;
            original.onResponseMetadata?.(kind === 'mismatch' && calls === 2 ? { modelVersion: 'wrong-version' } : metadata);
            if (kind === 'duplicate') original.onResponseMetadata?.(metadata);
          },
        });
      },
    });
    f.beginInvocation('preflight');
    await expect(driver.executeStage('preflight')).rejects.toThrow(fatal);
    expect(f.witness.sdkVision).toBe(kind === 'mismatch' ? 2 : 1);
    expect(f.finishedCanonicalKeys()).toHaveLength(kind === 'mismatch' ? 1 : 0);
    await rejectsWithoutMoreEffects(driver, f);
  });

  it('revokes a captured earlier live-adapter capability without new native or raw effects', async () => {
    const f = await makeCalibrationDriverFixture(roots, { winner: 'MEDIUM' });
    const original = liveAdapter.createLiveNutritionEvalAdapter;
    let escaped: GenAIAdapter['generateVision'] | undefined;
    vi.spyOn(liveAdapter, 'createLiveNutritionEvalAdapter').mockImplementation((options) => {
      escaped ??= options.genAIAdapter?.generateVision;
      return original(options);
    });
    const driver = await prepareCalibrationStageDriver(f.driverDeps);
    await runThrough(driver, f, 'preflight');
    if (!escaped) throw new Error('missing-live-adapter-capability');
    const before = prefix(f.root);
    const calls = JSON.stringify(f.witness);
    await expect(escaped('gemini-3.8-flash', 'expired', 'eA==', 'meal')).rejects.toThrow();
    expect(prefix(f.root)).toEqual(before);
    expect(JSON.stringify(f.witness)).toBe(calls);
    await rejectsWithoutMoreEffects(driver, f);
  }, 600000);

  it('poisons the current stage when an old lease is invoked and swallowed inside its image port', async () => {
    const f = await makeCalibrationDriverFixture(roots, { winner: 'MEDIUM' });
    const original = liveAdapter.createLiveNutritionEvalAdapter;
    let escaped: GenAIAdapter['generateVision'] | undefined;
    vi.spyOn(liveAdapter, 'createLiveNutritionEvalAdapter').mockImplementation((options) => {
      escaped ??= options.genAIAdapter?.generateVision;
      return original(options);
    });
    const driver = await prepareCalibrationStageDriver({ ...f.driverDeps,
      loadImage: async (key: Parameters<CalibrationStageDriverDeps['loadImage']>[0]) => {
        if (key.stage === 'development') {
          if (!escaped) throw new Error('missing-old-lease');
          await escaped('gemini-3.8-flash', 'expired', 'eA==', 'meal').catch(() => undefined);
        }
        return f.driverDeps.loadImage(key);
      },
    });
    await runThrough(driver, f, 'preflight');
    f.beginInvocation('development');
    await expect(driver.executeStage('development')).rejects.toThrow(fatal);
    expect(f.witness.sdkVision).toBe(2);
    expect(f.finishedCanonicalKeys()).toHaveLength(2);
    await rejectsWithoutMoreEffects(driver, f);
  }, 600000);

  it('refuses a cached prediction marker instead of publishing it as a fresh result', async () => {
    const f = await makeCalibrationDriverFixture(roots, { winner: 'MEDIUM' });
    const original = liveAdapter.createLiveNutritionEvalAdapter;
    vi.spyOn(liveAdapter, 'createLiveNutritionEvalAdapter').mockImplementation((options) => {
      const adapter = original(options);
      return { analyzeCase: async (...args) => ({ ...await adapter.analyzeCase(...args), cached: true }) };
    });
    const driver = await prepareCalibrationStageDriver(f.driverDeps);
    f.beginInvocation('preflight');
    await expect(driver.executeStage('preflight')).rejects.toThrow(fatal);
    expect(f.witness.sdkVision).toBe(1);
    expect(f.finishedCanonicalKeys()).toEqual([]);
    await rejectsWithoutMoreEffects(driver, f);
  });

  it('rejects an unexpected prototype-named data field instead of dropping it during capture', async () => {
    const f = await makeCalibrationDriverFixture(roots, { winner: 'MEDIUM' });
    const original = liveAdapter.createLiveNutritionEvalAdapter;
    vi.spyOn(liveAdapter, 'createLiveNutritionEvalAdapter').mockImplementation((options) => {
      const adapter = original(options);
      return { analyzeCase: async (...args) => {
        const prediction = { ...await adapter.analyzeCase(...args) };
        Object.defineProperty(prediction, '__proto__', { value: { ignored: true }, enumerable: true });
        return prediction;
      } };
    });
    const driver = await prepareCalibrationStageDriver(f.driverDeps);
    f.beginInvocation('preflight');
    await expect(driver.executeStage('preflight')).rejects.toThrow(fatal);
    expect(f.witness.sdkVision).toBe(1);
    expect(f.finishedCanonicalKeys()).toEqual([]);
    await rejectsWithoutMoreEffects(driver, f);
  });

  it('freshly verifies completed artifacts from a new driver on the held ledger', async () => {
    const f = await makeCalibrationDriverFixture(roots, { winner: 'MEDIUM' });
    const driver = await prepareCalibrationStageDriver(f.driverDeps);
    await runThrough(driver, f, 'preflight');
    const next = await prepareCalibrationStageDriver(f.driverDeps);
    const before = prefix(f.root);
    const repeated = await next.executeStage('preflight');
    expect(repeated.newSdkMethodInvocations).toEqual({ vision: 0, tokenCount: 0 });
    expect(prefix(f.root)).toEqual(before);
    const path = join(f.root, 'reports', 'preflight-low.json');
    const changed = readFileSync(path, 'utf8') + ' ';
    writeFileSync(path, changed);
    await expect(next.executeStage('preflight')).rejects.toThrow(fatal);
    expect(readFileSync(path, 'utf8')).toBe(changed);
    expect(f.witness.sdkVision).toBe(2);
    expect(f.witness.sdkToken).toBe(1);
    await rejectsWithoutMoreEffects(next, f);
  }, 600000);

  it('blocks an unresolved native attempt before repeating its consumed reservation', async () => {
    const f = await makeCalibrationDriverFixture(roots, { winner: 'MEDIUM' });
    const key = { stage: 'preflight', profile: 'LOW', caseId: f.context.firstDevelopmentCaseId, sampleIndex: 1 } as const;
    const token = { kind: 'token_count', stage: 'preflight', caseId: key.caseId, model: 'gemini-3.8-flash' } as const;
    f.ledger.reserveTokenCount(token);
    f.ledger.completeTokenCount(token, 1);
    const ref = f.ledger.startRuntimeAttempt(key);
    f.ledger.startRuntimeOperation(ref, 'image');
    f.ledger.settleRuntimeOperation(ref, 'image', 'returned');
    f.ledger.startRuntimeOperation(ref, 'vision');
    f.ledger.reserve(key);
    f.ledger.authorizeRuntimeRequest(ref);
    const driver = await prepareCalibrationStageDriver(f.driverDeps);
    const before = prefix(f.root);
    f.beginInvocation('preflight');
    await expect(driver.executeStage('preflight')).rejects.toThrow(fatal);
    expect(prefix(f.root)).toEqual(before);
    expect(f.witness.sdkVision).toBe(0);
    expect(f.witness.sdkToken).toBe(0);
    await rejectsWithoutMoreEffects(driver, f);
  });

  it.each(['model', 'source', 'outer-options'] as const)('refuses the live adapter supplying an invalid %s before SDK entry', async (kind) => {
    const f = await makeCalibrationDriverFixture(roots, { winner: 'MEDIUM' });
    const original = liveAdapter.createLiveNutritionEvalAdapter;
    vi.spyOn(liveAdapter, 'createLiveNutritionEvalAdapter').mockImplementation((options) => {
      const adapter = options.genAIAdapter;
      if (!adapter) throw new Error('missing-leased-adapter');
      return original({ ...options, genAIAdapter: { ...adapter, generateVision: (model, prompt, image, source) => adapter.generateVision(
        kind === 'model' ? 'gemini-2.5-flash' : model, prompt, image,
        kind === 'source' ? 'barcode' : source,
        kind === 'outer-options' ? { mode: 'calibration', thinkingLevel: 'LOW', imageMediaType: 'image/png', timeoutMs: 30000 } : undefined,
      ) } });
    });
    const driver = await prepareCalibrationStageDriver(f.driverDeps);
    f.beginInvocation('preflight');
    await expect(driver.executeStage('preflight')).rejects.toThrow(fatal);
    expect(f.witness.sdkVision).toBe(0);
    expect(f.finishedCanonicalKeys()).toEqual([]);
    await rejectsWithoutMoreEffects(driver, f);
  });

  it.each(['negative', 'fraction', 'symbol', 'accessor', 'extra'] as const)('rejects an invalid %s SDK counter snapshot before token dispatch', async (kind) => {
    const f = await makeCalibrationDriverFixture(roots, { winner: 'MEDIUM' });
    const counts = { vision: 0, tokenCount: 0 };
    if (kind === 'negative') counts.vision = -1;
    if (kind === 'fraction') counts.tokenCount = 0.1;
    if (kind === 'symbol') Object.defineProperty(counts, Symbol('hidden'), { value: 1 });
    if (kind === 'accessor') Object.defineProperty(counts, 'vision', { enumerable: true, get() { throw new Error('getter-must-not-run'); } });
    if (kind === 'extra') Object.defineProperty(counts, 'extra', { value: 1 });
    const driver = await prepareCalibrationStageDriver({ ...f.driverDeps, getSdkMethodCounts: () => counts });
    f.beginInvocation('preflight');
    await expect(driver.executeStage('preflight')).rejects.toThrow(fatal);
    expect(f.witness.sdkToken).toBe(0);
    expect(f.witness.sdkVision).toBe(0);
    await rejectsWithoutMoreEffects(driver, f);
  });

  it('detects a second actual SDK entry before journaling the first outcome', async () => {
    const f = await makeCalibrationDriverFixture(roots, { winner: 'MEDIUM' });
    const driver = await prepareCalibrationStageDriver({ ...f.driverDeps,
      generateVision: async (...args: Parameters<CalibrationStageDriverDeps['generateVision']>) => {
        const text = await f.driverDeps.generateVision(...args);
        const options = args[4];
        if (!options) throw new Error('missing-options');
        await f.driverDeps.generateVision(args[0], args[1], args[2], args[3], {
          mode: 'calibration', thinkingLevel: options.thinkingLevel,
          imageMediaType: options.imageMediaType, timeoutMs: options.timeoutMs,
        });
        return text;
      },
    });
    f.beginInvocation('preflight');
    await expect(driver.executeStage('preflight')).rejects.toThrow(fatal);
    expect(f.witness.sdkVision).toBe(2);
    expect(f.finishedCanonicalKeys()).toEqual([]);
    await rejectsWithoutMoreEffects(driver, f);
  });

  it('blocks producer settlement after swallowed reentry from an already-entered image port', async () => {
    const f = await makeCalibrationDriverFixture(roots, { winner: 'MEDIUM' });
    let settlements = 0;
    const driver: Readonly<CalibrationStageDriver> = await prepareCalibrationStageDriver({ ...f.driverDeps,
      ledger: { ...f.ledger, settleRuntimeOperation(...args: Parameters<typeof f.ledger.settleRuntimeOperation>) { settlements++; return f.ledger.settleRuntimeOperation(...args); } },
      loadImage: async (key: Parameters<CalibrationStageDriverDeps['loadImage']>[0]) => {
        await driver.executeStage('preflight').catch(() => undefined);
        return f.driverDeps.loadImage(key);
      },
    });
    f.beginInvocation('preflight');
    await expect(driver.executeStage('preflight')).rejects.toThrow(fatal);
    expect(f.witness.imageLoads).toHaveLength(1); // already-entered opaque call retained its actual effect
    expect(settlements).toBe(0);
    expect(f.witness.sdkVision).toBe(0);
    await rejectsWithoutMoreEffects(driver, f);
  });

  it('does not inspect a foreign thrown proxy and returns a fresh causeless public fatal', async () => {
    const f = await makeCalibrationDriverFixture(roots, { winner: 'MEDIUM' });
    let reads = 0;
    const foreign = new Proxy({}, { get() { reads++; throw 0; }, getPrototypeOf() { reads++; throw 0; } });
    const driver = await prepareCalibrationStageDriver({ ...f.driverDeps, nowMs() { throw foreign; } });
    f.beginInvocation('preflight');
    let caught: unknown;
    try { await driver.executeStage('preflight'); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(Error);
    // Never hand the hostile value to a matcher that may inspect it.
    expect(caught === foreign).toBe(false);
    expect((caught as Error).message).toBe(fatal);
    expect(Object.hasOwn(caught as object, 'cause')).toBe(false);
    expect(reads).toBe(0);
    await rejectsWithoutMoreEffects(driver, f);
  });

  it('stops descriptor inspection after SDK snapshot reflection swallows reentry', async () => {
    const f = await makeCalibrationDriverFixture(roots, { winner: 'MEDIUM' });
    let descriptorReads = 0;
    const driver: Readonly<CalibrationStageDriver> = await prepareCalibrationStageDriver({ ...f.driverDeps,
      getSdkMethodCounts: () => new Proxy({ vision: 0, tokenCount: 0 }, {
        ownKeys(target) {
          void driver.executeStage('preflight').catch(() => undefined);
          return Reflect.ownKeys(target);
        },
        getOwnPropertyDescriptor(target, key) { descriptorReads++; return Reflect.getOwnPropertyDescriptor(target, key); },
      }),
    });
    f.beginInvocation('preflight');
    await expect(driver.executeStage('preflight')).rejects.toThrow(fatal);
    expect(descriptorReads).toBe(0);
    expect(f.witness.sdkToken).toBe(0);
    expect(f.witness.sdkVision).toBe(0);
    await rejectsWithoutMoreEffects(driver, f);
  });

  it('captures returned prediction data without invoking foreign property getters', async () => {
    const f = await makeCalibrationDriverFixture(roots, { winner: 'MEDIUM' });
    let reads = 0;
    const original = liveAdapter.createLiveNutritionEvalAdapter;
    vi.spyOn(liveAdapter, 'createLiveNutritionEvalAdapter').mockImplementation((options) => {
      const adapter = original(options);
      return { analyzeCase: async (...args) => new Proxy(await adapter.analyzeCase(...args), {
        get(_target, key) {
          if (key === 'then') return undefined; // JS promise assimilation, outside the capture contract
          reads++;
          throw new Error('prediction-property-get-forbidden');
        },
      }) };
    });
    const driver = await prepareCalibrationStageDriver(f.driverDeps);
    f.beginInvocation('preflight');
    let failed = false;
    try { await driver.executeStage('preflight'); } catch { failed = true; }
    expect(reads).toBe(0);
    expect(failed).toBe(false);
    expect(f.finishedCanonicalKeys()).toHaveLength(2);
    f.ledger.releaseLock(f.context.owner);
  }, 600000);

  it('refuses dirty committed source before a port can run', async () => {
    const f = await makeCalibrationDriverFixture(roots, { winner: 'MEDIUM' });
    const driver = await prepareCalibrationStageDriver(f.driverDeps);
    writeFileSync(resolve(f.context.baseDir, 'functions', 'unexpected-controller-source.ts'), 'export const dirty = true;\n');
    f.beginInvocation('preflight');
    await expect(driver.executeStage('preflight')).rejects.toThrow(fatal);
    expect(f.witness.sdkToken).toBe(0);
    expect(f.witness.sdkVision).toBe(0);
    await rejectsWithoutMoreEffects(driver, f);
  });

  it('refuses a changed lock owner before any request and never repairs the lock', async () => {
    const f = await makeCalibrationDriverFixture(roots, { winner: 'MEDIUM' });
    const driver = await prepareCalibrationStageDriver(f.driverDeps);
    const path = join(f.root, 'lock.json');
    writeFileSync(path, JSON.stringify({ ...f.context.owner, pid: f.context.owner.pid + 1 }));
    const changed = readFileSync(path, 'utf8');
    f.beginInvocation('preflight');
    await expect(driver.executeStage('preflight')).rejects.toThrow(fatal);
    expect(readFileSync(path, 'utf8')).toBe(changed);
    expect(f.witness.sdkToken).toBe(0);
    expect(f.witness.sdkVision).toBe(0);
    await rejectsWithoutMoreEffects(driver, f);
  });

  it.each(['rejected', 'malformed'] as const)('records a known %s token failure once and stops before images', async (kind) => {
    const f = await makeCalibrationDriverFixture(roots, { winner: 'MEDIUM' });
    const driver = await prepareCalibrationStageDriver({ ...f.driverDeps, countTokens: async () => {
      await f.driverDeps.countTokens();
      if (kind === 'rejected') throw new Error('private-token-detail');
      return { tokenCount: -1 };
    } });
    f.beginInvocation('preflight');
    await expect(driver.executeStage('preflight')).rejects.toThrow(fatal);
    expect(f.witness.sdkToken).toBe(1);
    expect(f.witness.sdkVision).toBe(0);
    const events = JSON.parse(readFileSync(join(f.root, 'ledger.json'), 'utf8')) as Array<{ type: string; errorCategory?: string }>;
    expect(events.filter((row) => row.type === 'token_count_failed').map((row) => row.errorCategory)).toEqual([kind === 'rejected' ? 'unknown' : 'empty_response']);
    expect(events.filter((row) => row.type === 'safe_error')).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain('private-token-detail');
    await rejectsWithoutMoreEffects(driver, f);
  });

  it('records an early raw token rejection before SDK entry as a known failure without inspecting the throw', async () => {
    const f = await makeCalibrationDriverFixture(roots, { winner: 'MEDIUM' });
    let reads = 0;
    const foreign = new Proxy({}, { get() { reads++; throw 0; }, getPrototypeOf() { reads++; throw 0; } });
    const driver = await prepareCalibrationStageDriver({ ...f.driverDeps, countTokens: async () => { throw foreign; } });
    f.beginInvocation('preflight');
    await expect(driver.executeStage('preflight')).rejects.toThrow(fatal);
    expect(reads).toBe(0);
    expect(f.witness.sdkToken).toBe(0);
    expect(f.witness.sdkVision).toBe(0);
    const events = JSON.parse(readFileSync(join(f.root, 'ledger.json'), 'utf8')) as Array<{ type: string; errorCategory?: string }>;
    expect(events.slice(-2).map((row) => row.type)).toEqual(['token_count_failed', 'safe_error']);
    expect(events.find((row) => row.type === 'token_count_failed')?.errorCategory).toBe('unknown');
    await rejectsWithoutMoreEffects(driver, f);
  });

  it.each(['zero-entry-success', 'extra-token-rejection', 'vision-rejection'] as const)(
    'preserves a pending token reservation on %s rather than recording a counterfeit terminal', async (kind) => {
      const f = await makeCalibrationDriverFixture(roots, { winner: 'MEDIUM' });
      const driver = await prepareCalibrationStageDriver({ ...f.driverDeps, countTokens: async () => {
        if (kind === 'zero-entry-success') return { tokenCount: 1 };
        if (kind === 'extra-token-rejection') {
          await f.driverDeps.countTokens();
          await f.driverDeps.countTokens();
        } else {
          await f.driverDeps.generateVision('gemini-3.8-flash', 'unexpected token-port vision',
            Buffer.from(JSON.stringify({ caseId: f.context.firstDevelopmentCaseId })).toString('base64'), 'meal',
            { mode: 'calibration', thinkingLevel: 'LOW', imageMediaType: 'image/png', timeoutMs: 30000 });
        }
        throw new Error('mismatched-method-history');
      } });
      f.beginInvocation('preflight');
      await expect(driver.executeStage('preflight')).rejects.toThrow(fatal);
      const events = JSON.parse(readFileSync(join(f.root, 'ledger.json'), 'utf8')) as Array<{ type: string }>;
      expect(events.filter((row) => ['token_count_completed', 'token_count_failed', 'safe_error'].includes(row.type))).toEqual([]);
      expect(events.filter((row) => row.type === 'token_count_reserved')).toHaveLength(1);
      expect(f.witness.sdkToken).toBe(kind === 'extra-token-rejection' ? 2 : 0);
      expect(f.witness.sdkVision).toBe(kind === 'vision-rejection' ? 1 : 0);
      await rejectsWithoutMoreEffects(driver, f);
    },
  );

  it('does not repeat a consumed pending token reservation or load an image before native refusal', async () => {
    const f = await makeCalibrationDriverFixture(roots, { winner: 'MEDIUM' });
    f.ledger.reserveTokenCount({ kind: 'token_count', stage: 'preflight', caseId: f.context.firstDevelopmentCaseId, model: 'gemini-3.8-flash' });
    const driver = await prepareCalibrationStageDriver(f.driverDeps);
    const before = prefix(f.root);
    f.beginInvocation('preflight');
    await expect(driver.executeStage('preflight')).rejects.toThrow(fatal);
    expect(f.witness.sdkToken).toBe(0);
    expect(f.witness.sdkVision).toBe(0);
    expect(f.witness.imageLoads).toEqual([]);
    expect(prefix(f.root)).toEqual(before);
    await rejectsWithoutMoreEffects(driver, f);
  });

  it('retains an uncertain journal prefix and never completes or redispatches it', async () => {
    const f = await makeCalibrationDriverFixture(roots, { winner: 'MEDIUM' });
    const driver = await prepareCalibrationStageDriver({ ...f.driverDeps,
      ledger: { ...f.ledger, appendResultJournal(...args: Parameters<typeof f.ledger.appendResultJournal>) {
        f.ledger.appendResultJournal(...args);
        throw new Error('effect-then-throw');
      } },
    });
    f.beginInvocation('preflight');
    await expect(driver.executeStage('preflight')).rejects.toThrow(fatal);
    expect(f.witness.sdkVision).toBe(1);
    expect(f.finishedCanonicalKeys()).toEqual([]);
    expect(readdirSync(f.root).some((file) => /journal/.test(file) && readFileSync(join(f.root, file)).length > 0)).toBe(true);
    await rejectsWithoutMoreEffects(driver, f);
  });

  it('retains a real published report pair after uncertain publication and performs no admission', async () => {
    const f = await makeCalibrationDriverFixture(roots, { winner: 'MEDIUM' });
    const original = publication.publishCalibrationStageReport;
    vi.spyOn(publication, 'publishCalibrationStageReport').mockImplementation(async (...args) => {
      await original(...args);
      throw new Error('publication-effect-then-throw');
    });
    const driver = await prepareCalibrationStageDriver(f.driverDeps);
    f.beginInvocation('preflight');
    await expect(driver.executeStage('preflight')).rejects.toThrow(fatal);
    expect(existsSync(join(f.root, 'reports', 'preflight-low.json'))).toBe(true);
    expect(existsSync(join(f.root, 'reports', 'preflight-low.md'))).toBe(true);
    expect(f.bindingCount()).toBe(0);
    await rejectsWithoutMoreEffects(driver, f);
  }, 600000);
});

describe('canonical profile decision reasons', () => {
  const equal: CalibrationProfileMetrics = { unsafeCount: 0, parseCount: 24, catastrophicCount: 0, meanZeroSafeMacroError: 0.1, medianKcalError: 0.1, p90AnalysisLatencyMs: 100 };
  it.each([
    { reason: 'fewer_unsafe', low: { unsafeCount: 0 }, medium: { unsafeCount: 1 }, winner: 'LOW' },
    { reason: 'higher_parse', low: { parseCount: 23 }, medium: { parseCount: 24 }, winner: 'MEDIUM' },
    { reason: 'fewer_catastrophic', low: { catastrophicCount: 0 }, medium: { catastrophicCount: 1 }, winner: 'LOW' },
    { reason: 'lower_macro_error', low: { meanZeroSafeMacroError: 0.2 }, medium: { meanZeroSafeMacroError: 0.1 }, winner: 'MEDIUM' },
    { reason: 'lower_kcal_error', low: { medianKcalError: 0.1 }, medium: { medianKcalError: 0.2 }, winner: 'LOW' },
    { reason: 'lower_latency', low: { p90AnalysisLatencyMs: 101 }, medium: { p90AnalysisLatencyMs: 100 }, winner: 'MEDIUM' },
    { reason: 'default_medium_tie_breaker', low: {}, medium: {}, winner: 'MEDIUM' },
  ])('returns $reason without mutating metrics', ({ reason, low, medium, winner }) => {
    const first = Object.freeze({ ...equal, ...low });
    const second = Object.freeze({ ...equal, ...medium });
    const before = JSON.stringify([first, second]);
    expect(selectCalibrationProfileDecision(first, second)).toEqual({ profile: winner, reason });
    expect(JSON.stringify([first, second])).toBe(before);
  });
});
