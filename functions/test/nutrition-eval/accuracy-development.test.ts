import { ThinkingLevel } from '@google/genai';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import type { GenAIClient } from '../../src/genai-adapter';
import { visionResponseJsonSchema } from '../../src/nutrition-json-schema';
import { MEAL_ANALYSIS_PROMPT } from '../../src/prompts';
import {
  parseNutritionEvalManifest,
  type NutritionEvalCase,
} from '../../src/nutrition-eval/schema';
import {
  ACCURACY_MEAL_PROMPT_V1,
  runAccuracyDevelopment,
  type AccuracyDevelopmentDeps,
  type AccuracyDevelopmentDiagnostic,
  type AccuracyDevelopmentIdentity,
  type AccuracyDevelopmentOutcome,
  type AccuracyDevelopmentResult,
} from '../../src/nutrition-eval/accuracy-development';

const MANIFEST_PATH = join(
  __dirname,
  '..',
  '..',
  'eval',
  'nutrition',
  'accuracy-development-manifest-v1.json',
);

const manifest = parseNutritionEvalManifest(
  JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')),
);
const CASES: readonly NutritionEvalCase[] = manifest.cases;
const MODEL = 'gemini-3.8-flash';

const IDENTITY: AccuracyDevelopmentIdentity = {
  runId: 'accuracy-development-test',
  timestamp: '2026-11-03T00:00:00.000Z',
  codeSha: 'a'.repeat(40),
  datasetHash: 'b'.repeat(64),
};

const FINAL_JSON = JSON.stringify({
  name: 'Test meal',
  kcal: 100,
  proteinG: 10,
  carbsG: 20,
  fatG: 5,
  confidence: 0.9,
  candidates: [],
  barcode: null,
  detectedItems: [{ name: 'Test food', weight: 100 }],
  boundingBox: null,
  nutritionBasis: 'portion',
  nutritionAmount: 1,
  nutritionUnit: 'portion',
});

const OVERSIZED_TEXT = `${FINAL_JSON}${' '.repeat(70_000)}`;

type GenerateParams = Parameters<GenAIClient['models']['generateContent']>[0];
type GenerateResponse = Awaited<
  ReturnType<GenAIClient['models']['generateContent']>
>;

interface ObservedSdkConfig {
  responseMimeType?: unknown;
  responseJsonSchema?: unknown;
  thinkingConfig?: { thinkingLevel?: unknown };
  httpOptions?: { timeout?: unknown };
  temperature?: unknown;
  topP?: unknown;
  topK?: unknown;
}

interface HarnessOptions {
  response?: (index: number, params: GenerateParams) => Promise<GenerateResponse>;
  reserve?: (caseId: string, index: number) => Promise<void>;
  persist?: (outcome: AccuracyDevelopmentOutcome) => Promise<void>;
  image?: (index: number) => Uint8Array;
}

interface Harness {
  deps: AccuracyDevelopmentDeps;
  events: string[];
  prompts: string[];
  sdkParams: GenerateParams[];
  reserves: Array<{ caseId: string; index: number }>;
  outcomes: AccuracyDevelopmentOutcome[];
  sdkCalls: () => number;
  loadCalls: () => number;
  createClientCalls: () => number;
}

function caseIndexFromParams(params: GenerateParams): number {
  const inline = params.contents[0]?.parts?.find(
    (part) => part.inlineData !== undefined,
  )?.inlineData;
  if (inline === undefined) throw new Error('missing inline image part');
  const bytes = Buffer.from(inline.data, 'base64');
  return bytes.length === 0 ? -1 : (bytes[0] as number);
}

function promptFromParams(params: GenerateParams): string {
  const text = params.contents[0]?.parts?.find(
    (part) => part.text !== undefined,
  )?.text;
  return text ?? '';
}

function createHarness(options: HarnessOptions = {}): Harness {
  const events: string[] = [];
  const prompts: string[] = [];
  const sdkParams: GenerateParams[] = [];
  const reserves: Array<{ caseId: string; index: number }> = [];
  const outcomes: AccuracyDevelopmentOutcome[] = [];
  let sdkCalls = 0;
  let loadCalls = 0;
  let createClientCalls = 0;

  const images = new Map<string, Uint8Array>();
  CASES.forEach((evalCase, index) => {
    images.set(evalCase.id, new Uint8Array([index]));
  });

  const client: GenAIClient = {
    models: {
      async generateContent(params) {
        const index = caseIndexFromParams(params);
        const evalCase = CASES[index];
        if (evalCase === undefined) throw new Error('unknown fixture image');
        sdkCalls += 1;
        events.push(`sdk:${evalCase.id}`);
        prompts.push(promptFromParams(params));
        sdkParams.push(params);
        if (options.response !== undefined) {
          return options.response(index, params);
        }
        return { text: FINAL_JSON, modelVersion: MODEL };
      },
    },
  };

  const deps: AccuracyDevelopmentDeps = {
    async loadImage(evalCase) {
      loadCalls += 1;
      events.push(`load:${evalCase.id}`);
      if (options.image !== undefined) {
        const index = CASES.findIndex(
          (candidate) => candidate.id === evalCase.id,
        );
        return options.image(index);
      }
      const bytes = images.get(evalCase.id);
      if (bytes === undefined) throw new Error(`missing fixture ${evalCase.id}`);
      return bytes;
    },
    createClient() {
      createClientCalls += 1;
      events.push('createClient');
      return client;
    },
    async reserve(caseId, index) {
      reserves.push({ caseId, index });
      events.push(`reserve:${caseId}`);
      if (options.reserve !== undefined) await options.reserve(caseId, index);
    },
    async persistOutcome(outcome) {
      outcomes.push(outcome);
      events.push(`outcome:${outcome.caseId}`);
      if (options.persist !== undefined) await options.persist(outcome);
    },
    nowMs() {
      return 1_000 + outcomes.length;
    },
  };

  return {
    deps,
    events,
    prompts,
    sdkParams,
    reserves,
    outcomes,
    sdkCalls: () => sdkCalls,
    loadCalls: () => loadCalls,
    createClientCalls: () => createClientCalls,
  };
}

function sortedCaseIds(cases: readonly NutritionEvalCase[]): string[] {
  return cases.map((evalCase) => evalCase.id).sort();
}

function sortedResultIds(result: AccuracyDevelopmentResult): string[] {
  return result.report.cases.map((entry) => entry.caseId).sort();
}

function diagnosticFor(
  result: AccuracyDevelopmentResult,
  caseId: string,
): AccuracyDevelopmentDiagnostic {
  const diagnostic = result.diagnostics.find((entry) => entry.caseId === caseId);
  if (diagnostic === undefined) throw new Error(`missing diagnostic ${caseId}`);
  return diagnostic;
}

describe('accuracy development manifest', () => {
  it('contains the pinned 24 unique public meal development cases', () => {
    expect(manifest.datasetId).toBe('calorix-n5k-accuracy-development-v1');
    expect(CASES).toHaveLength(24);
    expect(new Set(CASES.map((evalCase) => evalCase.id)).size).toBe(24);
    for (const evalCase of CASES) {
      expect(evalCase.visibility).toBe('public');
      expect(evalCase.scanMode).toBe('meal');
    }
  });
});

describe('candidate meal prompt', () => {
  it('extends the unchanged production meal prompt instead of replacing it', () => {
    expect(ACCURACY_MEAL_PROMPT_V1).not.toBe('');
    expect(ACCURACY_MEAL_PROMPT_V1.startsWith(MEAL_ANALYSIS_PROMPT)).toBe(true);
    expect(ACCURACY_MEAL_PROMPT_V1).not.toBe(MEAL_ANALYSIS_PROMPT);
  });
});

describe('runAccuracyDevelopment', () => {
  it('preloads all images before creating the client and reserves before each SDK call', async () => {
    const harness = createHarness();
    const result = await runAccuracyDevelopment(CASES, harness.deps, IDENTITY);

    const createIndex = harness.events.indexOf('createClient');
    expect(createIndex).toBeGreaterThanOrEqual(0);
    const loadsBeforeClient = harness.events
      .slice(0, createIndex)
      .filter((event) => event.startsWith('load:'));
    expect(loadsBeforeClient).toHaveLength(24);
    expect(new Set(loadsBeforeClient)).toEqual(
      new Set(CASES.map((evalCase) => `load:${evalCase.id}`)),
    );

    expect(harness.sdkCalls()).toBe(24);
    expect(harness.createClientCalls()).toBe(1);
    expect(result.sdkVisionCalls).toBe(24);
    expect(result.report.cases).toHaveLength(24);
    expect(result.diagnostics).toHaveLength(24);
    expect(harness.outcomes).toHaveLength(24);
    expect(harness.reserves).toHaveLength(24);
    expect(harness.prompts).toHaveLength(24);

    expect(sortedResultIds(result)).toEqual(sortedCaseIds(CASES));

    for (const evalCase of CASES) {
      expect(harness.events.filter((event) => event === `reserve:${evalCase.id}`))
        .toHaveLength(1);
      expect(harness.events.filter((event) => event === `sdk:${evalCase.id}`))
        .toHaveLength(1);
      expect(harness.events.indexOf(`reserve:${evalCase.id}`))
        .toBeLessThan(harness.events.indexOf(`sdk:${evalCase.id}`));
      expect(harness.reserves.find((entry) => entry.caseId === evalCase.id)?.index)
        .toBe(1);
    }

    for (const prompt of harness.prompts) {
      expect(prompt).toBe(ACCURACY_MEAL_PROMPT_V1);
    }

    expect(
      result.report.cases.every(
        (entry) => entry.prediction.parseStatus === 'success',
      ),
    ).toBe(true);
  });

  it('dispatches the fixed 3.8 MEDIUM png request shape with structured output only', async () => {
    const harness = createHarness();
    await runAccuracyDevelopment(CASES, harness.deps, IDENTITY);

    expect(harness.sdkParams).toHaveLength(24);
    for (const params of harness.sdkParams) {
      expect(params.model).toBe('gemini-3.8-flash');
      const config = params.config as ObservedSdkConfig | undefined;
      expect(config?.responseMimeType).toBe('application/json');
      expect(config?.responseJsonSchema).toEqual(visionResponseJsonSchema('meal'));
      expect(config?.thinkingConfig?.thinkingLevel).toBe(ThinkingLevel.MEDIUM);
      expect(config?.thinkingConfig?.thinkingLevel).toBe('MEDIUM');
      expect(config?.httpOptions?.timeout).toBe(30_000);
      expect(config?.temperature).toBeUndefined();
      expect(config?.topP).toBeUndefined();
      expect(config?.topK).toBeUndefined();

      const imagePart = params.contents[0]?.parts?.find(
        (part) => part.inlineData !== undefined,
      )?.inlineData;
      expect(imagePart?.mimeType).toBe('image/png');
    }
  });

  it('treats missing metadata on a nonempty JSON response as fatal after one SDK call', async () => {
    const harness = createHarness({
      response: async (index) =>
        index === 0
          ? { text: FINAL_JSON }
          : { text: FINAL_JSON, modelVersion: MODEL },
    });

    await expect(
      runAccuracyDevelopment(CASES, harness.deps, IDENTITY),
    ).rejects.toThrow(/^accuracy:/);
    expect(harness.sdkCalls()).toBe(1);
    expect(harness.reserves).toHaveLength(1);
  });

  it('keeps invalid JSON with correct metadata as an ordinary failure among all 24', async () => {
    const invalidIndex = 11;
    const invalidText = '{"name":';
    const harness = createHarness({
      response: async (index) =>
        index === invalidIndex
          ? { text: invalidText, modelVersion: MODEL }
          : { text: FINAL_JSON, modelVersion: MODEL },
    });

    const result = await runAccuracyDevelopment(CASES, harness.deps, IDENTITY);
    const invalidCase = CASES[invalidIndex]!;

    expect(result.sdkVisionCalls).toBe(24);
    expect(result.report.cases).toHaveLength(24);
    expect(result.diagnostics).toHaveLength(24);
    expect(harness.outcomes).toHaveLength(24);

    const failed = result.report.cases.find(
      (entry) => entry.caseId === invalidCase.id,
    );
    expect(failed?.prediction.parseStatus).toBe('failure');
    expect(failed?.prediction.failureCategory).toBe('schema');
    expect(failed?.prediction.failureCode).toBe('model_response_invalid');

    const diagnostic = diagnosticFor(result, invalidCase.id);
    expect(diagnostic.modelVersion).toBe(MODEL);
    expect(diagnostic.finalText).toBe(invalidText);
    expect(diagnostic.oversized).toBe(false);
  });

  it('rejects invalid case sets before the client while still accepting the pinned 24', async () => {
    const notEnough = createHarness();
    await expect(
      runAccuracyDevelopment(CASES.slice(0, 23), notEnough.deps, IDENTITY),
    ).rejects.toThrow(/^accuracy:/);
    expect(notEnough.createClientCalls()).toBe(0);
    expect(notEnough.sdkCalls()).toBe(0);

    const duplicated = createHarness();
    await expect(
      runAccuracyDevelopment(
        [...CASES.slice(0, 23), CASES[0]!],
        duplicated.deps,
        IDENTITY,
      ),
    ).rejects.toThrow(/^accuracy:/);
    expect(duplicated.createClientCalls()).toBe(0);
    expect(duplicated.sdkCalls()).toBe(0);

    const nonMeal = createHarness();
    const mixedCases: readonly NutritionEvalCase[] = CASES.map(
      (evalCase, index) =>
        index === 5 ? { ...evalCase, scanMode: 'label' as const } : evalCase,
    );
    await expect(
      runAccuracyDevelopment(mixedCases, nonMeal.deps, IDENTITY),
    ).rejects.toThrow(/^accuracy:/);
    expect(nonMeal.createClientCalls()).toBe(0);
    expect(nonMeal.sdkCalls()).toBe(0);

    const valid = createHarness();
    const result = await runAccuracyDevelopment(CASES, valid.deps, IDENTITY);
    expect(result.sdkVisionCalls).toBe(24);
  });

  it('rejects a failed image load before client construction and SDK dispatch', async () => {
    const failingIndex = 5;
    const failureMessage = 'image source unavailable';
    const harness = createHarness({
      image: (index) => {
        if (index === failingIndex) throw new Error(failureMessage);
        return new Uint8Array([index]);
      },
    });

    const error = await runAccuracyDevelopment(CASES, harness.deps, IDENTITY)
      .then(() => undefined, (reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/^accuracy:/);
    expect((error as Error).message).not.toContain(failureMessage);
    expect(harness.events).toContain(`load:${CASES[failingIndex]!.id}`);
    expect(harness.loadCalls()).toBeGreaterThanOrEqual(1);
    expect(harness.createClientCalls()).toBe(0);
    expect(harness.sdkCalls()).toBe(0);
  });

  it('stops after the first SDK call when outcome persistence fails', async () => {
    const failureMessage = 'outcome store unavailable';
    let persistCalls = 0;
    const harness = createHarness({
      persist: async () => {
        persistCalls += 1;
        throw new Error(failureMessage);
      },
    });

    const error = await runAccuracyDevelopment(CASES, harness.deps, IDENTITY)
      .then(() => undefined, (reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/^accuracy:/);
    expect((error as Error).message).not.toContain(failureMessage);
    expect(harness.sdkCalls()).toBe(1);
    expect(harness.reserves).toHaveLength(1);
    expect(harness.outcomes).toHaveLength(1);
    expect(persistCalls).toBe(1);
  });

  it('never reads accessor-backed status and records an unknown category without secrets', async () => {
    const failingIndex = 9;
    const secret = 'sk-accessor-SECRET-987654321';
    let statusReads = 0;
    const harness = createHarness({
      response: async (index) => {
        if (index === failingIndex) {
          const error = new Error(`raw provider message ${secret}`);
          Object.defineProperty(error, 'status', {
            enumerable: true,
            configurable: true,
            get() {
              statusReads += 1;
              throw new Error('status getter must not run');
            },
          });
          Object.defineProperty(error, 'secret', {
            enumerable: true,
            value: secret,
          });
          throw error;
        }
        return { text: FINAL_JSON, modelVersion: MODEL };
      },
    });

    const result = await runAccuracyDevelopment(CASES, harness.deps, IDENTITY);
    const failedCase = CASES[failingIndex]!;

    expect(statusReads).toBe(0);
    expect(result.sdkVisionCalls).toBe(24);
    expect(result.report.cases).toHaveLength(24);
    expect(harness.outcomes).toHaveLength(24);
    expect(diagnosticFor(result, failedCase.id).safeErrorCategory).toBe('unknown');

    const serialized = JSON.stringify({
      report: result.report,
      diagnostics: result.diagnostics,
      outcomes: harness.outcomes,
    });
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain('raw provider message');
    expect(serialized).not.toContain('status getter must not run');
  });

  it('keeps a 429 as a spent ordinary failure while accounting for all 24 cases', async () => {
    const failedIndex = 7;
    const secret = 'sk-live-SECRETVALUE-0123456789';
    const harness = createHarness({
      response: async (index) => {
        if (index === failedIndex) {
          throw Object.assign(new Error(`provider rejected ${secret}`), {
            status: 429,
            secret,
          });
        }
        return { text: FINAL_JSON, modelVersion: MODEL };
      },
    });

    const result = await runAccuracyDevelopment(CASES, harness.deps, IDENTITY);
    const failedCase = CASES[failedIndex]!;

    expect(result.sdkVisionCalls).toBe(24);
    expect(result.report.cases).toHaveLength(24);
    expect(result.diagnostics).toHaveLength(24);
    expect(harness.outcomes).toHaveLength(24);
    expect(sortedResultIds(result)).toEqual(sortedCaseIds(CASES));

    const failed = result.report.cases.find(
      (entry) => entry.caseId === failedCase.id,
    );
    expect(failed?.prediction.parseStatus).toBe('failure');
    expect(diagnosticFor(result, failedCase.id).safeErrorCategory).toBe('http_429');

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain('SECRETVALUE');
    expect(serialized).not.toContain('provider rejected');
  });

  it('halts on wrong model metadata without issuing an extra SDK call', async () => {
    const wrongIndex = 4;
    const harness = createHarness({
      response: async (index) => ({
        text: FINAL_JSON,
        modelVersion: index === wrongIndex ? 'gemini-3.7-flash' : MODEL,
      }),
    });

    await expect(
      runAccuracyDevelopment(CASES, harness.deps, IDENTITY),
    ).rejects.toThrow(/^accuracy:/);
    expect(harness.sdkCalls()).toBe(wrongIndex + 1);
    expect(harness.reserves).toHaveLength(wrongIndex + 1);
  });

  it('stops before dispatch of the failing reservation and subsequent cases', async () => {
    const failingIndex = 2;
    const failureMessage = 'reservation store unavailable';
    const harness = createHarness({
      reserve: async (caseId) => {
        if (caseId === CASES[failingIndex]!.id) {
          throw new Error(failureMessage);
        }
      },
    });

    const error = await runAccuracyDevelopment(CASES, harness.deps, IDENTITY)
      .then(() => undefined, (reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/^accuracy:/);
    expect((error as Error).message).not.toContain(failureMessage);
    expect(harness.reserves).toHaveLength(failingIndex + 1);
    expect(harness.outcomes).toHaveLength(failingIndex);
    expect(harness.sdkCalls()).toBe(failingIndex);
  });

  it('retains a bounded final JSON response verbatim with its parsed items', async () => {
    const harness = createHarness();
    const result = await runAccuracyDevelopment(CASES, harness.deps, IDENTITY);
    const diagnostic = diagnosticFor(result, CASES[0]!.id);

    expect(diagnostic.modelVersion).toBe(MODEL);
    expect(diagnostic.oversized).toBe(false);
    expect(diagnostic.finalText).toBe(FINAL_JSON);
    expect(diagnostic.finalTextBytes).toBe(Buffer.byteLength(FINAL_JSON, 'utf8'));
    expect(diagnostic.finalTextSha256).toBe(
      createHash('sha256').update(FINAL_JSON, 'utf8').digest('hex'),
    );
    expect(diagnostic.items).toEqual([{ name: 'Test food', weight: 100 }]);
  });

  it('stores only an oversized marker while parsing the complete response', async () => {
    const harness = createHarness({
      response: async () => ({ text: OVERSIZED_TEXT, modelVersion: MODEL }),
    });
    const result = await runAccuracyDevelopment(CASES, harness.deps, IDENTITY);

    expect(result.sdkVisionCalls).toBe(24);
    expect(
      result.report.cases.every(
        (entry) => entry.prediction.parseStatus === 'success',
      ),
    ).toBe(true);

    const diagnostic = diagnosticFor(result, CASES[0]!.id);
    expect(diagnostic.oversized).toBe(true);
    expect(diagnostic.finalText).toBeUndefined();
    expect(diagnostic.finalTextBytes).toBe(
      Buffer.byteLength(OVERSIZED_TEXT, 'utf8'),
    );
    expect(diagnostic.finalTextSha256).toBe(
      createHash('sha256').update(OVERSIZED_TEXT, 'utf8').digest('hex'),
    );
  });
});

describe('development measurement integrity', () => {
  it('rejects a nonfinite clock before any SDK dispatch', async () => {
    const h = createHarness(); h.deps.nowMs = () => Number.NaN;
    await expect(runAccuracyDevelopment(CASES, h.deps, IDENTITY)).rejects.toThrow(/^accuracy:/);
    expect(h.sdkCalls()).toBe(0);
  });
  it('rejects a backwards clock after preserving the one spent dispatch', async () => {
    const h = createHarness(); let reads = 0;
    h.deps.nowMs = () => ++reads === 1 ? 100 : 90;
    await expect(runAccuracyDevelopment(CASES, h.deps, IDENTITY)).rejects.toThrow(/^accuracy:/);
    expect(h.sdkCalls()).toBe(1); expect(h.outcomes).toHaveLength(0);
  });
  it('rejects empty image bytes before constructing a client', async () => {
    const h = createHarness({ image: (i) => i === 3 ? new Uint8Array() : new Uint8Array([i]) });
    await expect(runAccuracyDevelopment(CASES, h.deps, IDENTITY)).rejects.toThrow(/^accuracy:/);
    expect(h.createClientCalls()).toBe(0); expect(h.sdkCalls()).toBe(0);
  });
  it('rejects missing source identity before constructing a client', async () => {
    const h = createHarness();
    await expect(runAccuracyDevelopment(CASES, h.deps, { ...IDENTITY, codeSha: '' })).rejects.toThrow(/^accuracy:/);
    expect(h.createClientCalls()).toBe(0); expect(h.sdkCalls()).toBe(0);
  });
  it('records the same final response text that the existing parser consumed', async () => {
    let reads = 0; let lastText = '';
    const h = createHarness({ response: async (i) => i === 0 ? {
      get text() { lastText = ++reads === 1 ? FINAL_JSON : '{broken'; return lastText; },
      modelVersion: MODEL,
    } : { text: FINAL_JSON, modelVersion: MODEL } });
    const r = await runAccuracyDevelopment(CASES, h.deps, IDENTITY);
    expect(diagnosticFor(r, CASES[0]!.id).finalText).toBe(lastText);
    expect(r.report.cases[0]?.prediction.parseStatus).toBe(lastText === FINAL_JSON ? 'success' : 'failure');
  });
  it('never publishes an inconsistent version from a changing SDK getter', async () => {
    let reads = 0;
    const h = createHarness({ response: async (i) => i === 0 ? {
      text: FINAL_JSON, get modelVersion() { return ++reads === 1 ? MODEL : 'foreign-model'; },
    } : { text: FINAL_JSON, modelVersion: MODEL } });
    const outcome = await runAccuracyDevelopment(CASES, h.deps, IDENTITY).then(value => ({ value }), (error: unknown) => ({ error }));
    if ('error' in outcome) {
      expect(outcome.error).toBeInstanceOf(Error);
      expect((outcome.error as Error).message).toMatch(/^accuracy:/); expect(h.sdkCalls()).toBe(1);
    } else expect(outcome.value.diagnostics.every(d => d.modelVersion === MODEL)).toBe(true);
  });
});

describe('whole-feature review regressions', () => {
  it.each([
    ['foreign string', 'foreign-model'],
    ['number', 123],
    ['object', { secret: 'SYNTHETIC_METADATA_SENTINEL' }],
  ])('rejects present invalid %s metadata even when response text is empty', async (_label, version) => {
    const h = createHarness({ response: async (i) => i === 0 ? {
      text: '', modelVersion: version as unknown as string,
    } : { text: FINAL_JSON, modelVersion: MODEL } });
    await expect(runAccuracyDevelopment(CASES, h.deps, IDENTITY)).rejects.toThrow(/^accuracy:/);
    expect(h.sdkCalls()).toBe(1);
    expect(h.outcomes).toHaveLength(0);
    expect(JSON.stringify(h.outcomes)).not.toContain('SYNTHETIC_METADATA_SENTINEL');
  });

  it('retains only a marker for oversized item arrays while scoring their complete parsed contents', async () => {
    const large = JSON.stringify({ ...JSON.parse(FINAL_JSON),
      detectedItems: Array.from({ length: 1000 }, () => ({ name: 'x'.repeat(80), weight: 0.1 })) });
    expect(Buffer.byteLength(large)).toBeGreaterThan(64 * 1024);
    const h = createHarness({ response: async i => ({ text: i === 0 ? large : FINAL_JSON, modelVersion: MODEL }) });
    const result = await runAccuracyDevelopment(CASES, h.deps, IDENTITY);
    const d = diagnosticFor(result, CASES[0]!.id);
    expect(result.report.cases[0]?.prediction.parseStatus).toBe('success');
    expect(result.report.cases[0]?.prediction.diagnostics?.detectedItemCount).toBe(1000);
    expect(d.oversized).toBe(true); expect(d.finalText).toBeUndefined(); expect(d.items).toBeUndefined();
    expect(Buffer.byteLength(JSON.stringify(d))).toBeLessThan(1024);
  });
});
