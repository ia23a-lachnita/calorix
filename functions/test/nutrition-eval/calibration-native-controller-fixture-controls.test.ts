/** Raw fixture/component controls. These do not qualify controller execution. */
import { readFileSync, rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CALIBRATION_ROOT } from '../../src/nutrition-eval/calibration';
import { createCalibrationBootstrapReadDeps } from '../../src/nutrition-eval/calibration-bootstrap';
import { loadVerifiedCaseImage } from '../../src/nutrition-eval/assets';
import { createCalibrationGenAIClient, createGenAIAdapter } from '../../src/genai-adapter';
import { prepareCalibrationOffSnapshotStore } from '../../src/nutrition-eval/calibration-off-snapshot-store';
import { createLiveNutritionEvalAdapter } from '../../src/nutrition-eval/live-adapter';
import { parseNutritionEvalManifest } from '../../src/nutrition-eval/schema';
import { scoreNutritionCase } from '../../src/nutrition-eval/scorer';
import type { GenAIAdapter } from '../../src/genai-adapter';
import { makeCalibrationDriverFixture, makeCalibrationNativeCliFixture } from './calibration-native-controller-fixtures';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const manifest = parseNutritionEvalManifest(JSON.parse(readFileSync(resolve(repoRoot, 'functions/eval/nutrition/public-manifest.json'), 'utf8')));
const roots: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function publicCase(id: string) {
  const row = manifest.cases.find((candidate) => candidate.id === id);
  if (!row) throw new Error('fixture-control-case-missing');
  return row;
}

function noUnexpectedOperation(calls: string[]): GenAIAdapter {
  const fail = async (): Promise<string> => {
    calls.push('unexpected-live-operation');
    throw new Error('fixture-control-forbidden-operation');
  };
  return { generateChat: fail, generateVision: fail };
}

describe('native controller fixture controls without a driver import', () => {
  it.each(['off-3017624010701', 'off-5449000000996', 'off-4056489686941', 'off-7622210449283'])(
    'scores the real frozen OFF product %s without media or SDK calls', async (id) => {
      const fixture = await makeCalibrationDriverFixture(roots, { winner: 'MEDIUM' });
      fixture.beginInvocation('benchmark');
      const row = publicCase(id);
      const adapter = createLiveNutritionEvalAdapter({
        project: 'calorix-xurschnell', location: 'us', model: 'gemini-3.8-flash',
        genAIAdapter: noUnexpectedOperation(fixture.forbiddenCalls),
        fetchOffProductFn: async () => { throw new Error('fixture-control-live-off-forbidden'); },
        offSnapshotMap: { get: fixture.driverDeps.lookupSnapshot },
      });
      const prediction = await adapter.analyzeCase(row, undefined, { sampleIndex: 1 });
      expect(prediction.parseStatus).toBe('success');
      expect(prediction.source).toBe('barcode');
      if (id === 'off-4056489686941') expect(prediction.decision).toBe('needs_review');
      const measured = scoreNutritionCase(row, prediction);
      for (const field of ['kcal', 'proteinG', 'carbsG', 'fatG'] as const) {
        expect(measured.numeric[field]?.relativeError).toBeCloseTo(0, 10);
      }
      expect(fixture.witness.sdkVision).toBe(0);
      expect(fixture.witness.sdkToken).toBe(0);
      expect(fixture.witness.imageLoads).toEqual([]);
      expect(fixture.witness.snapshotLookups).toEqual([{ stage: 'benchmark', barcode: id.slice(4) }]);
      expect(fixture.witness.visionRequests).toEqual([]);
      expect(fixture.forbiddenCalls).toEqual([]);
      fixture.ledger.releaseLock(fixture.context.owner);
    },
  );

  it.each(['off-8076809513753', 'off-8000500310427', 'off-4008400404127', 'off-3228857000166'])(
    'passes candidate label wire %s through the real parser and scorer', async (id) => {
      const fixture = await makeCalibrationDriverFixture(roots, { winner: 'MEDIUM' });
      fixture.beginInvocation('benchmark');
      const row = publicCase(id);
      const key = { stage: 'benchmark', profile: 'MEDIUM', caseId: id, sampleIndex: 1 } as const;
      const bytes = await fixture.driverDeps.loadImage(key);
      const adapter = createLiveNutritionEvalAdapter({
        project: 'calorix-xurschnell', location: 'us', model: 'gemini-3.8-flash',
        genAIAdapter: { generateChat: noUnexpectedOperation(fixture.forbiddenCalls).generateChat, generateVision: fixture.driverDeps.generateVision },
        fetchOffProductFn: async () => { throw new Error('fixture-control-live-off-forbidden'); },
      });
      const prediction = await adapter.analyzeCase(row, bytes, { sampleIndex: 1 });
      expect(prediction.parseStatus).toBe('success');
      const measured = scoreNutritionCase(row, prediction);
      for (const field of ['kcal', 'proteinG', 'carbsG', 'fatG'] as const) {
        expect(measured.numeric[field]?.relativeError).toBeCloseTo(0, 10);
      }
      expect(fixture.witness.sdkVision).toBe(1);
      expect(fixture.witness.transportVision).toBe(1);
      expect(fixture.witness.imageLoads).toEqual([{ stage: 'benchmark', caseId: id, key }]);
      expect(fixture.witness.visionRequests[0]?.stage).toBe('benchmark');
      expect(fixture.witness.visionRequests[0]?.request.model).toBe('gemini-3.8-flash');
      expect(fixture.forbiddenCalls).toEqual([]);
      fixture.ledger.releaseLock(fixture.context.owner);
    },
  );

  it('refuses a barcode at the raw image port before returning media', async () => {
    const fixture = await makeCalibrationDriverFixture(roots, { winner: 'MEDIUM' });
    fixture.beginInvocation('benchmark');
    await expect(fixture.driverDeps.loadImage({ stage: 'benchmark', profile: 'MEDIUM', caseId: 'off-3017624010701', sampleIndex: 1 })).rejects.toThrow();
    expect(fixture.witness.sdkVision).toBe(0);
  });

  it('counts an entered SDK method even when malformed media prevents transport', async () => {
    const fixture = await makeCalibrationDriverFixture(roots, { winner: 'MEDIUM' });
    fixture.beginInvocation('preflight');
    await expect(fixture.driverDeps.generateVision('gemini-3.8-flash', 'fixture control', Buffer.from('not-json').toString('base64'), 'meal')).rejects.toThrow();
    expect(fixture.witness.sdkVision).toBe(1);
    expect(fixture.witness.transportVision).toBe(0);
  });

  it('redirects the real default bootstrap reader to the owned miniGit without creating a calibration root', async () => {
    const fixture = await makeCalibrationNativeCliFixture(roots, { winner: 'LOW' });
    expect(createCalibrationBootstrapReadDeps().baseDir).toBe(fixture.root);
    expect(existsSync(resolve(fixture.root, CALIBRATION_ROOT))).toBe(false);
    expect(fixture.witness.sdkVision).toBe(0);
    expect(fixture.witness.sdkToken).toBe(0);
  });

  it('uses the real token request builder with the first development media and no image dispatch', async () => {
    const fixture = await makeCalibrationDriverFixture(roots, { winner: 'MEDIUM' });
    fixture.beginInvocation('preflight');
    expect(await fixture.driverDeps.countTokens()).toEqual({ tokenCount: 1 });
    expect(fixture.witness.sdkVision).toBe(0);
    expect(fixture.witness.sdkToken).toBe(1);
    expect(fixture.witness.tokenRequests[0]?.stage).toBe('preflight');
    const request = fixture.witness.tokenRequests[0]?.request;
    expect(request?.model).toBe('gemini-3.8-flash');
    expect(JSON.stringify(request?.contents)).toContain(Buffer.from(JSON.stringify({ caseId: fixture.context.firstDevelopmentCaseId })).toString('base64'));
    expect(fixture.finishedCanonicalKeys()).toEqual([]);
    expect(fixture.witness.imageLoads).toEqual([]);
    expect(fixture.forbiddenCalls).toEqual([]);
    fixture.ledger.releaseLock(fixture.context.owner);
  });

  it('wires native media, SDK response parsing and the verified OFF store without constructing authority', async () => {
    const fixture = await makeCalibrationNativeCliFixture(roots, { winner: 'LOW' });
    fixture.beginInvocation('benchmark');
    const client = createCalibrationGenAIClient({});
    // Guard this characterization control against accidental unmocked transport.
    if (!vi.isMockFunction(client.models.generateContent)) throw new Error('fixture-transport-not-isolated');
    const row = publicCase('off-8076809513753');
    const bytes = await loadVerifiedCaseImage(row, {
      cacheRoot: resolve(fixture.root, 'owned-media-cache'),
      fetchFn: async () => { throw new Error('fixture-network-forbidden'); },
    });
    const store = await prepareCalibrationOffSnapshotStore({
      lockText: readFileSync(resolve(fixture.root, 'functions/eval/nutrition/off-snapshot-lock.json'), 'utf8'),
      readSnapshot: async (path: string) => readFileSync(resolve(fixture.root, path), 'utf8'),
    });
    const adapter = createLiveNutritionEvalAdapter({
      project: 'calorix-xurschnell', location: 'us', model: 'gemini-3.8-flash',
      genAIAdapter: createGenAIAdapter({ project: 'calorix-xurschnell', location: 'us', googleGenAI: client }),
      offSnapshotMap: store,
      fetchOffProductFn: async () => { throw new Error('fixture-live-off-forbidden'); },
    });
    const label = await adapter.analyzeCase(row, bytes, { sampleIndex: 1 });
    expect(label.parseStatus).toBe('success');
    expect(scoreNutritionCase(row, label).numeric.kcal?.relativeError).toBeCloseTo(0, 10);
    const barcode = await adapter.analyzeCase(publicCase('off-3017624010701'), undefined, { sampleIndex: 1 });
    expect(barcode.source).toBe('barcode');
    expect(barcode.parseStatus).toBe('success');
    expect(fixture.witness.imageLoads).toEqual([{ stage: 'benchmark', caseId: row.id }]);
    expect(fixture.witness.sdkVision).toBe(1);
    expect(fixture.witness.transportVision).toBe(1);
    expect(fixture.witness.snapshotLookups).toEqual([{ stage: 'benchmark', barcode: '3017624010701' }]);
    expect(fixture.forbiddenCalls).toEqual([]);
    expect(existsSync(resolve(fixture.root, CALIBRATION_ROOT))).toBe(false);
  });
});
