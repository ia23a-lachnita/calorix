import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatContent } from '../src/ai-chat';
import {
  createGenAIAdapter,
  resolveVisionGenerationProfile,
  type VisionGenerationOptions,
} from '../src/genai-adapter';
import * as GenAIAdapterModule from '../src/genai-adapter';

type VisionSource = 'meal' | 'label' | 'barcode';

type VisionRequest = {
  model: string;
  contents: Array<{
    role: string;
    parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>;
  }>;
  config?: {
    responseMimeType?: string;
    responseJsonSchema?: Record<string, unknown>;
    temperature?: number;
  };
};

type JsonSchema = Record<string, unknown>;

const commonNutritionFields = [
  'name', 'kcal', 'proteinG', 'carbsG', 'fatG', 'confidence', 'candidates',
  'barcode', 'detectedItems', 'boundingBox', 'nutritionBasis', 'nutritionAmount', 'nutritionUnit',
] as const;

const packageEvidenceFields = [
  'observedPackageAmount', 'observedPackageUnit', 'packageReference',
  'per100Reference', 'servingReference',
] as const;

function structuredVisionRequest(call: unknown): VisionRequest {
  return call as VisionRequest;
}

function resolveSchema(schema: JsonSchema, root: JsonSchema): JsonSchema {
  const reference = schema.$ref;
  if (typeof reference !== 'string' || !reference.startsWith('#/$defs/')) return schema;
  const key = reference.slice('#/$defs/'.length);
  const definitions = root.$defs as Record<string, JsonSchema> | undefined;
  const resolved = definitions?.[key];
  if (!resolved) throw new Error(`Missing local schema definition: ${reference}`);
  return resolveSchema(resolved, root);
}

function schemaAlternatives(schema: JsonSchema): JsonSchema[] {
  const alternatives = schema.anyOf ?? schema.oneOf;
  return Array.isArray(alternatives)
    ? alternatives.filter((value): value is JsonSchema => typeof value === 'object' && value !== null)
    : [schema];
}

function resolvedAlternatives(schema: JsonSchema, root: JsonSchema): JsonSchema[] {
  return schemaAlternatives(resolveSchema(schema, root)).map((alternative) => resolveSchema(alternative, root));
}

function typeSet(schema: JsonSchema): string[] {
  const candidateType = schema.type;
  if (typeof candidateType === 'string') return [candidateType];
  if (Array.isArray(candidateType) && candidateType.every((value) => typeof value === 'string')) {
    return [...candidateType].sort();
  }
  return [];
}

function expectExactTypes(schema: JsonSchema, root: JsonSchema, expected: readonly string[]): void {
  const alternatives = resolvedAlternatives(schema, root);
  expect(alternatives.length).toBeGreaterThan(0);
  const expectedSet = [...expected].sort();
  const admitted = new Set<string>();
  for (const alternative of alternatives) {
    const types = typeSet(alternative);
    expect(types.length).toBeGreaterThan(0);
    expect(types.every((type) => expectedSet.includes(type))).toBe(true);
    for (const type of types) admitted.add(type);
  }
  expect([...admitted].sort()).toEqual(expectedSet);
}

function expectOnlyNumber(schema: JsonSchema, root: JsonSchema): void {
  expectExactTypes(schema, root, ['number']);
}

function expectObjectStructure(
  schema: JsonSchema,
  propertiesExpected: readonly string[],
  required: readonly string[],
): Record<string, JsonSchema> {
  expect(schema.additionalProperties).toBe(false);
  expect([...(schema.required as string[])].sort()).toEqual([...required].sort());
  const properties = schema.properties as Record<string, JsonSchema>;
  expect(Object.keys(properties).sort()).toEqual([...propertiesExpected].sort());
  return properties;
}

function expectExactObjectShape(
  schema: JsonSchema,
  root: JsonSchema,
  propertiesExpected: readonly string[],
  required: readonly string[] = propertiesExpected,
): Record<string, JsonSchema> {
  expectExactTypes(schema, root, ['object']);
  const alternatives = resolvedAlternatives(schema, root);
  const propertySets = alternatives.map((alternative) => expectObjectStructure(
    alternative,
    propertiesExpected,
    required,
  ));
  return propertySets[0]!;
}

function strictArrayItems(schema: JsonSchema, root: JsonSchema): JsonSchema[] {
  expectExactTypes(schema, root, ['array']);
  return resolvedAlternatives(schema, root).map((alternative) => {
    const items = alternative.items;
    if (typeof items !== 'object' || items === null) throw new Error('Array schema must define item schema');
    return resolveSchema(items as JsonSchema, root);
  });
}

function expectNonnegativeNumber(schema: JsonSchema, root: JsonSchema): void {
  expectOnlyNumber(schema, root);
  for (const alternative of resolvedAlternatives(schema, root)) {
    expect(alternative.minimum).toBe(0);
    expect(alternative.default).toBeUndefined();
  }
}

function expectPositiveNumber(schema: JsonSchema, root: JsonSchema): void {
  expectOnlyNumber(schema, root);
  for (const alternative of resolvedAlternatives(schema, root)) {
    expect(typeof alternative.minimum === 'number' && alternative.minimum > 0).toBe(true);
  }
}

function finiteSchemaValues(schema: JsonSchema, root: JsonSchema): unknown[] {
  const resolved = resolveSchema(schema, root);
  const alternatives = resolved.anyOf ?? resolved.oneOf;
  if (Array.isArray(alternatives)) {
    expect(alternatives.length).toBeGreaterThan(0);
    return alternatives.flatMap((alternative) => {
      if (typeof alternative !== 'object' || alternative === null) {
        throw new Error('Schema alternative must be an object');
      }
      return finiteSchemaValues(alternative as JsonSchema, root);
    });
  }
  if (Array.isArray(resolved.enum) && resolved.enum.length > 0) return resolved.enum;
  throw new Error('Every schema alternative must have a nonempty enum');
}

function valueKey(value: unknown): string {
  return `${typeof value}:${JSON.stringify(value)}`;
}

function expectFiniteValues(schema: JsonSchema, root: JsonSchema, expected: readonly unknown[]): void {
  const actual = new Map(finiteSchemaValues(schema, root).map((value) => [valueKey(value), value]));
  const expectedValues = new Map(expected.map((value) => [valueKey(value), value]));
  expect([...actual.keys()].sort()).toEqual([...expectedValues.keys()].sort());
}

function expectSingleton(schema: JsonSchema, root: JsonSchema, value: unknown): void {
  expectFiniteValues(schema, root, [value]);
}

function expectFiniteStringValues(
  schema: JsonSchema,
  root: JsonSchema,
  expected: readonly string[],
): void {
  expectExactTypes(schema, root, ['string']);
  expectFiniteValues(schema, root, expected);
}

function expectNonemptyString(schema: JsonSchema, root: JsonSchema): void {
  expectExactTypes(schema, root, ['string']);
  const descriptions = resolvedAlternatives(schema, root).map((alternative) => alternative.description);
  expect(descriptions.every((description) => typeof description === 'string'
    && /non[- ]?empty|not empty|must not be empty/i.test(description))).toBe(true);
}

function expectProviderSupportedSchema(schema: JsonSchema): void {
  const supported = new Set([
    '$id', '$defs', '$ref', '$anchor', 'type', 'format', 'title', 'description', 'enum',
    'items', 'prefixItems', 'minItems', 'maxItems', 'minimum', 'maximum', 'anyOf', 'oneOf',
    'properties', 'additionalProperties', 'required', 'propertyOrdering',
  ]);
  const unsupported = new Set(['const', 'exclusiveMinimum', 'minLength', 'pattern', 'default']);
  const visit = (value: unknown, containerKey?: string): void => {
    if (Array.isArray(value)) {
      value.forEach((child) => visit(child));
      return;
    }
    if (typeof value !== 'object' || value === null) return;
    for (const [key, child] of Object.entries(value)) {
      if (containerKey !== '$defs' && containerKey !== 'properties') {
        expect(supported.has(key)).toBe(true);
      }
      expect(unsupported.has(key)).toBe(false);
      visit(child, key);
    }
  };
  visit(schema);
}

function expectUnitIntervalNumber(schema: JsonSchema, root: JsonSchema): void {
  expectOnlyNumber(schema, root);
  for (const alternative of resolvedAlternatives(schema, root)) {
    expect(alternative).toMatchObject({ minimum: 0, maximum: 1 });
  }
}

function expectReferenceShape(schema: JsonSchema, root: JsonSchema): void {
  const properties = expectExactObjectShape(
    schema,
    root,
    ['kcal', 'proteinG', 'carbsG', 'fatG', 'amount', 'unit'],
  );
  for (const nutrient of ['kcal', 'proteinG', 'carbsG', 'fatG']) {
    expectNonnegativeNumber(properties[nutrient]!, root);
  }
  expectPositiveNumber(properties.amount!, root);
  expectFiniteStringValues(properties.unit!, root, ['g', 'ml']);
}

function expectCommonNutritionSchema(schema: JsonSchema, source: VisionSource): void {
  expectProviderSupportedSchema(schema);
  const expectedFields = source === 'meal'
    ? commonNutritionFields
    : [...commonNutritionFields, ...packageEvidenceFields];
  const properties = expectExactObjectShape(schema, schema, expectedFields, commonNutritionFields);

  expectNonemptyString(properties.name!, schema);
  for (const nutrient of ['kcal', 'proteinG', 'carbsG', 'fatG']) {
    expectNonnegativeNumber(properties[nutrient]!, schema);
  }
  expectUnitIntervalNumber(properties.confidence!, schema);
  const barcode = properties.barcode!;
  if (source === 'meal') {
    expectExactTypes(barcode, schema, ['null']);
  } else {
    expectExactTypes(barcode, schema, ['null', 'string']);
    for (const alternative of resolvedAlternatives(barcode, schema).filter((item) => typeSet(item).includes('string'))) {
      expect(typeof alternative.description).toBe('string');
      expect(alternative.description).toMatch(/8.{0,12}14.*digit|digit.*8.{0,12}14/i);
    }
  }

  for (const candidateSchema of strictArrayItems(properties.candidates!, schema)) {
    const candidateProperties = expectExactObjectShape(
      candidateSchema,
      schema,
      ['name', 'confidence', 'kcal', 'proteinG', 'carbsG', 'fatG'],
    );
    expectNonemptyString(candidateProperties.name!, schema);
    expectUnitIntervalNumber(candidateProperties.confidence!, schema);
    for (const nutrient of ['kcal', 'proteinG', 'carbsG', 'fatG']) {
      expectNonnegativeNumber(candidateProperties[nutrient]!, schema);
    }
  }

  const detectedItems = properties.detectedItems!;
  const detectedItemSchemas = strictArrayItems(detectedItems, schema);
  const unknownWeightInstruction = [
    ...resolvedAlternatives(detectedItems, schema).map((detectedItemsSchema) => detectedItemsSchema.description),
    ...detectedItemSchemas.flatMap((detectedItemSchema) => {
    const detectedProperties = expectExactObjectShape(detectedItemSchema, schema, ['name', 'weight']);
    expectNonemptyString(detectedProperties.name!, schema);
    expectNonnegativeNumber(detectedProperties.weight!, schema);
    return [detectedItemSchema.description];
    }),
  ]
    .filter((description): description is string => typeof description === 'string')
    .join(' ');
  expect(unknownWeightInstruction).toMatch(/omit.*unknown.*weight|unknown.*weight.*omit/i);
  expect(unknownWeightInstruction).toMatch(/never.*null|do not.*null/i);
  expect(unknownWeightInstruction).toMatch(/never.*zero|do not.*zero/i);

  const boundingBox = properties.boundingBox!;
  expectExactTypes(boundingBox, schema, ['null', 'object']);
  for (const alternative of resolvedAlternatives(boundingBox, schema).filter((item) => typeSet(item).includes('object'))) {
    const boundingBoxProperties = expectObjectStructure(
      alternative,
      ['x', 'y', 'width', 'height'],
      ['x', 'y', 'width', 'height'],
    );
    expectOnlyNumber(boundingBoxProperties.x!, schema);
    expectOnlyNumber(boundingBoxProperties.y!, schema);
    expectNonnegativeNumber(boundingBoxProperties.width!, schema);
    expectNonnegativeNumber(boundingBoxProperties.height!, schema);
  }

  if (source === 'meal') {
    expectFiniteStringValues(properties.nutritionBasis!, schema, ['portion']);
    expectOnlyNumber(properties.nutritionAmount!, schema);
    expectSingleton(properties.nutritionAmount!, schema, 1);
    expectFiniteStringValues(properties.nutritionUnit!, schema, ['portion']);
    return;
  }

  expectFiniteStringValues(properties.nutritionBasis!, schema, ['portion', 'package', 'per100g']);
  expectPositiveNumber(properties.nutritionAmount!, schema);
  expectFiniteStringValues(properties.nutritionUnit!, schema, ['portion', 'g', 'ml']);
  expectPositiveNumber(properties.observedPackageAmount!, schema);
  expectFiniteStringValues(properties.observedPackageUnit!, schema, ['g', 'ml']);
  for (const reference of ['packageReference', 'per100Reference', 'servingReference']) {
    expectReferenceShape(properties[reference]!, schema);
  }
}

describe('createGenAIAdapter', () => {
  const mockGenerateContent = vi.fn();
  const mockGoogleGenAI = {
    models: {
      generateContent: mockGenerateContent,
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('maps ChatContent array to model generation and extracts text', async () => {
    mockGenerateContent.mockResolvedValue({ text: 'Hello, world!' });

    const adapter = createGenAIAdapter({
      googleGenAI: mockGoogleGenAI,
      project: 'test-project',
      location: 'us-central1',
    });

    const contents: ChatContent[] = [
      { role: 'user', parts: [{ text: 'Hello' }] },
      { role: 'model', parts: [{ text: 'Hi there!' }] },
      { role: 'user', parts: [{ text: 'How are you?' }] },
    ];

    const result = await adapter.generateChat('gemini-2.5-flash', contents);

    expect(result).toBe('Hello, world!');
    expect(mockGenerateContent).toHaveBeenCalledWith({
      model: 'gemini-2.5-flash',
      contents,
    });
  });

  it.each(['meal', 'label', 'barcode'] as const)(
    'uses deterministic structured output for %s vision analysis',
    async (source: VisionSource) => {
      mockGenerateContent.mockResolvedValue({ text: 'I see a burger.' });

      const adapter = createGenAIAdapter({
        googleGenAI: mockGoogleGenAI,
        project: 'test-project',
        location: 'us-central1',
      });

      const generateVision = adapter.generateVision as unknown as (
        model: string,
        prompt: string,
        imageBase64: string,
        source: VisionSource,
      ) => Promise<string>;
      const result = await generateVision(
        'gemini-2.5-flash',
        'Analyze this food image',
        'base64imagedata',
        source,
      );

      expect(result).toBe('I see a burger.');
      const request = structuredVisionRequest(mockGenerateContent.mock.calls[0]?.[0]);
      expect(request).toMatchObject({
      model: 'gemini-2.5-flash',
      contents: [{
        role: 'user',
        parts: [
          { text: 'Analyze this food image' },
          { inlineData: { mimeType: 'image/jpeg', data: 'base64imagedata' } },
        ],
      }],
      config: { responseMimeType: 'application/json', temperature: 0 },
      });

      const schema = request.config?.responseJsonSchema;
      expect(schema).toBeDefined();
      expectCommonNutritionSchema(schema!, source);
    },
  );

  it('rejects empty text response from chat model', async () => {
    mockGenerateContent.mockResolvedValue({ text: '' });

    const adapter = createGenAIAdapter({
      googleGenAI: mockGoogleGenAI,
      project: 'test-project',
      location: 'us-central1',
    });

    await expect(
      adapter.generateChat('gemini-2.5-flash', [
        { role: 'user', parts: [{ text: 'Hello' }] },
      ]),
    ).rejects.toThrow('Empty model response');
  });

  it('rejects whitespace-only text response from vision model', async () => {
    mockGenerateContent.mockResolvedValue({ text: '   ' });

    const adapter = createGenAIAdapter({
      googleGenAI: mockGoogleGenAI,
      project: 'test-project',
      location: 'us-central1',
    });

    await expect(
      adapter.generateVision('gemini-2.5-flash', 'Analyze', 'base64data'),
    ).rejects.toThrow('Empty model response');
  });

  it('rejects a response with no text field', async () => {
    mockGenerateContent.mockResolvedValue({});

    const adapter = createGenAIAdapter({
      googleGenAI: mockGoogleGenAI,
      project: 'test-project',
      location: 'us-central1',
    });

    await expect(
      adapter.generateChat('gemini-2.5-flash', [
        { role: 'user', parts: [{ text: 'Hello' }] },
      ]),
    ).rejects.toThrow('Empty model response');
  });
});

describe('resolveVisionGenerationProfile', () => {
  it('resolves gemini-2.5-flash to the gemini-2 temperature profile', () => {
    expect(resolveVisionGenerationProfile('gemini-2.5-flash')).toEqual({
      kind: 'gemini-2',
      temperature: 0,
    });
  });

  it.each(['LOW', 'MEDIUM'] as const)(
    'resolves exact gemini-3.8-flash with %s to the matching gemini-3 profile',
    (thinkingLevel) => {
      expect(resolveVisionGenerationProfile('gemini-3.8-flash', thinkingLevel)).toEqual({
        kind: 'gemini-3',
        thinkingLevel,
      });
    },
  );

  it('rejects gemini-3.8-flash without a thinking level', () => {
    expect(() => resolveVisionGenerationProfile('gemini-3.8-flash')).toThrow();
  });

  it('rejects unknown models', () => {
    expect(() => resolveVisionGenerationProfile('firestore-future-model')).toThrow();
    expect(() => resolveVisionGenerationProfile('gemini-2.0-flash')).toThrow();
  });
});

describe('generateVision no-options compatibility', () => {
  it.each(['gemini-2.5-flash', 'gemini-3.8-flash', 'firestore-future-model'])(
    'bypasses profile resolution for %s with temperature 0, no thinkingConfig, image/jpeg',
    async (model) => {
      const generateContent = vi.fn(async () => ({ text: 'ok' }));
      const adapter = createGenAIAdapter({
        project: 'test-project',
        location: 'us-central1',
        googleGenAI: { models: { generateContent } },
      });

      const result = await adapter.generateVision(model, 'Analyze this food image', 'base64data');

      expect(result).toBe('ok');
      expect(generateContent).toHaveBeenCalledTimes(1);
      const request = generateContent.mock.calls[0]?.[0] as {
        model: string;
        contents: Array<{ parts: Array<{ inlineData?: { mimeType: string } }> }>;
        config?: Record<string, unknown>;
      };
      expect(request.model).toBe(model);
      expect(request.config).toMatchObject({ temperature: 0 });
      expect(request.config).not.toHaveProperty('thinkingConfig');
      expect(request.contents[0]?.parts[1]?.inlineData?.mimeType).toBe('image/jpeg');
    },
  );
});

describe('generateVision calibration profile', () => {
  function calibrationAdapter(
    generateContent: ReturnType<typeof vi.fn>,
  ) {
    return createGenAIAdapter({
      project: 'test-project',
      location: 'us-central1',
      googleGenAI: { models: { generateContent } },
    });
  }

  it.each(['LOW', 'MEDIUM'] as const)(
    'sends thinkingConfig %s with the passed manifest media type and no temperature',
    async (thinkingLevel) => {
      const generateContent = vi.fn(async () => ({ text: 'calibrated', modelVersion: 'v3.8-1' }));
      const adapter = calibrationAdapter(generateContent);
      const seen: Array<{ modelVersion?: string }> = [];
      const options: VisionGenerationOptions = {
        mode: 'calibration',
        thinkingLevel,
        imageMediaType: 'image/png',
        timeoutMs: 30000,
        onResponseMetadata: (metadata) => {
          seen.push(metadata);
        },
      };

      const result = await adapter.generateVision(
        'gemini-3.8-flash',
        'Analyze this food image',
        'base64data',
        'meal',
        options,
      );

      expect(result).toBe('calibrated');
      expect(generateContent).toHaveBeenCalledTimes(1);
      const request = generateContent.mock.calls[0]?.[0] as {
        config?: Record<string, unknown>;
        contents: Array<{ parts: Array<{ inlineData?: { mimeType: string } }> }>;
      };
      expect(request.config).toMatchObject({
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingLevel },
      });
      expect(request.config).not.toHaveProperty('temperature');
      expect(request.config?.httpOptions).toEqual({ timeout: 30000 });
      expect(request.contents[0]?.parts[1]?.inlineData?.mimeType).toBe('image/png');
      expect(seen).toEqual([{ modelVersion: 'v3.8-1' }]);
    },
  );

  it('uses the passed image/jpeg manifest media type on the calibration path', async () => {
    const generateContent = vi.fn(async () => ({ text: 'ok' }));
    const adapter = calibrationAdapter(generateContent);

    await adapter.generateVision('gemini-3.8-flash', 'prompt', 'base64data', 'meal', {
      mode: 'calibration',
      thinkingLevel: 'LOW',
      imageMediaType: 'image/jpeg',
      timeoutMs: 1000,
    });

    const request = generateContent.mock.calls[0]?.[0] as {
      contents: Array<{ parts: Array<{ inlineData?: { mimeType: string } }> }>;
    };
    expect(request.contents[0]?.parts[1]?.inlineData?.mimeType).toBe('image/jpeg');
  });

  it('runs beforeRequest exactly once immediately before generateContent', async () => {
    const order: string[] = [];
    const generateContent = vi.fn(async () => {
      order.push('generateContent');
      return { text: 'ok' };
    });
    const beforeRequest = vi.fn(async () => {
      order.push('beforeRequest');
    });
    const adapter = calibrationAdapter(generateContent);

    await adapter.generateVision('gemini-3.8-flash', 'prompt', 'base64data', 'meal', {
      mode: 'calibration',
      thinkingLevel: 'MEDIUM',
      imageMediaType: 'image/png',
      timeoutMs: 5000,
      beforeRequest,
    });

    expect(beforeRequest).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['beforeRequest', 'generateContent']);
    expect(
      (beforeRequest.mock.invocationCallOrder[0] ?? 0) <
        (generateContent.mock.invocationCallOrder[0] ?? 1),
    ).toBe(true);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects non-finite or non-positive timeoutMs %s',
    async (timeoutMs) => {
      const generateContent = vi.fn(async () => ({ text: 'ok' }));
      const adapter = calibrationAdapter(generateContent);

      await expect(
        adapter.generateVision('gemini-3.8-flash', 'prompt', 'base64data', 'meal', {
          mode: 'calibration',
          thinkingLevel: 'LOW',
          imageMediaType: 'image/png',
          timeoutMs,
        }),
      ).rejects.toThrow();
      expect(generateContent).not.toHaveBeenCalled();
    },
  );

  it('rejects calibration for any model other than exact gemini-3.8-flash', async () => {
    const generateContent = vi.fn(async () => ({ text: 'ok' }));
    const adapter = calibrationAdapter(generateContent);

    await expect(
      adapter.generateVision('gemini-2.5-flash', 'prompt', 'base64data', 'meal', {
        mode: 'calibration',
        thinkingLevel: 'LOW',
        imageMediaType: 'image/png',
        timeoutMs: 1000,
      }),
    ).rejects.toThrow();
    await expect(
      adapter.generateVision('firestore-future-model', 'prompt', 'base64data', 'meal', {
        mode: 'calibration',
        thinkingLevel: 'LOW',
        imageMediaType: 'image/png',
        timeoutMs: 1000,
      }),
    ).rejects.toThrow();
    expect(generateContent).not.toHaveBeenCalled();
  });
});

// ── Task7 Step1 RED: dedicated calibration Vertex client boundary ─────────────
// The Task7 calibration CLI needs a hermetic, never-dispatched client factory in
// `functions/src/genai-adapter.ts` that validates its environment BEFORE
// constructing `GoogleGenAI` and then constructs exactly:
//   { vertexai: true, project: 'calorix-xurschnell', location: 'us',
//     apiVersion: 'v1',
//     httpOptions: { baseUrl: 'https://aiplatform.us.rep.googleapis.com/',
//                    timeout: 30000 } }
// with no API key and no retryOptions, immune to unrelated GOOGLE_API_KEY and
// GOOGLE_CLOUD_* variables. The factory and its identity constants do not exist
// yet, so every test below is RED with `Task7 API missing` until Task7 Step4
// extends `genai-adapter.ts`. All pre-existing tests above keep passing.
// Hermetic: the success-path tests inspect an unmocked, never-dispatched
// client (no `generateContent` call, no fetch, no Firebase, no network).

type CalibrationClientEnv = Record<string, string | undefined>;

type CalibrationClientFactory = (env?: CalibrationClientEnv) => unknown;

function task7Factory(): CalibrationClientFactory | undefined {
  return (GenAIAdapterModule as unknown as Record<string, unknown>)
    .createCalibrationGenAIClient as CalibrationClientFactory | undefined;
}

function task7Constant(name: string): unknown {
  return (GenAIAdapterModule as unknown as Record<string, unknown>)[name];
}

function requireTask7Factory(): CalibrationClientFactory {
  const factory = task7Factory();
  expect(
    factory,
    'Task7 API missing: createCalibrationGenAIClient is not exported from genai-adapter.ts',
  ).toBeDefined();
  return factory as CalibrationClientFactory;
}

function requireTask7Constant(name: string, expected: unknown): void {
  expect(task7Constant(name), `Task7 API missing: ${name} is not exported from genai-adapter.ts`).toBe(
    expected,
  );
}

function clientRecord(client: unknown): Record<string, unknown> {
  expect(client).toBeDefined();
  return client as Record<string, unknown>;
}

function httpOptionsOf(client: Record<string, unknown>): Record<string, unknown> {
  return client.httpOptions as Record<string, unknown>;
}

describe('calibration Vertex client identity constants (Task7 RED)', () => {
  it('pins CALIBRATION_VERTEX_PROJECT to calorix-xurschnell', () => {
    requireTask7Constant('CALIBRATION_VERTEX_PROJECT', 'calorix-xurschnell');
  });

  it('pins CALIBRATION_VERTEX_LOCATION to us', () => {
    requireTask7Constant('CALIBRATION_VERTEX_LOCATION', 'us');
  });

  it('pins CALIBRATION_MODEL to gemini-3.8-flash', () => {
    requireTask7Constant('CALIBRATION_MODEL', 'gemini-3.8-flash');
  });

  it('pins CALIBRATION_API_VERSION to v1', () => {
    requireTask7Constant('CALIBRATION_API_VERSION', 'v1');
  });

  it('pins CALIBRATION_BASE_URL to the regional Vertex endpoint', () => {
    requireTask7Constant('CALIBRATION_BASE_URL', 'https://aiplatform.us.rep.googleapis.com/');
  });

  it('pins CALIBRATION_TIMEOUT_MS to 30000', () => {
    requireTask7Constant('CALIBRATION_TIMEOUT_MS', 30000);
  });
});

describe('calibration Vertex client construction (Task7 RED)', () => {
  it('exposes a createCalibrationGenAIClient factory', () => {
    requireTask7Factory();
  });

  it('constructs an unmocked client with the exact Vertex identity and no dispatch', () => {
    const factory = requireTask7Factory();
    const client = clientRecord(factory({}));

    expect(client.vertexai).toBe(true);
    expect(client.project).toBe('calorix-xurschnell');
    expect(client.location).toBe('us');
    expect(client.apiVersion).toBe('v1');
    expect(httpOptionsOf(client)).toMatchObject({
      baseUrl: 'https://aiplatform.us.rep.googleapis.com/',
      timeout: 30000,
    });
  });

  it('sets no API key and no retry options on the unmocked client', () => {
    const factory = requireTask7Factory();
    const client = clientRecord(factory({}));

    expect(client.apiKey).toBeUndefined();
    expect(client).not.toHaveProperty('retryOptions');
    expect(httpOptionsOf(client)).not.toHaveProperty('retryOptions');
    const apiClient = client.apiClient as Record<string, unknown> | undefined;
    const resolvedHttp = (apiClient?.clientOptions as Record<string, unknown> | undefined)
      ?.httpOptions as Record<string, unknown> | undefined;
    expect(resolvedHttp).toMatchObject({
      baseUrl: 'https://aiplatform.us.rep.googleapis.com/',
      timeout: 30000,
    });
    expect(resolvedHttp).not.toHaveProperty('retryOptions');
  });

  it('is unaffected by unrelated GOOGLE_API_KEY and GOOGLE_CLOUD_* variables', () => {
    const factory = requireTask7Factory();
    const client = clientRecord(
      factory({
        GOOGLE_API_KEY: 'unrelated-test-key',
        GOOGLE_CLOUD_PROJECT: 'some-other-project',
        GOOGLE_CLOUD_REGION: 'some-other-region',
      }),
    );

    expect(client.project).toBe('calorix-xurschnell');
    expect(client.location).toBe('us');
    expect(client.apiKey).toBeUndefined();
    expect(httpOptionsOf(client)).toMatchObject({
      baseUrl: 'https://aiplatform.us.rep.googleapis.com/',
      timeout: 30000,
    });
  });

  it.each(['GOOGLE_VERTEX_BASE_URL', 'GOOGLE_GEMINI_BASE_URL'])(
    'rejects nonblank %s before GoogleGenAI construction',
    (envKey) => {
      const factory = requireTask7Factory();

      expect(() =>
        factory({ [envKey]: 'https://example.com/custom-endpoint' }),
      ).toThrow();
    },
  );

  it('rejects whitespace-padded base-URL overrides before construction', () => {
    const factory = requireTask7Factory();

    expect(() =>
      factory({ GOOGLE_VERTEX_BASE_URL: '  https://example.com/custom  ' }),
    ).toThrow();
  });

  it('rejects 2.5 anywhere in the calibration environment before construction', () => {
    const factory = requireTask7Factory();

    expect(() => factory({ CALORIX_NUTRITION_EVAL_MODEL: 'gemini-2.5-flash' })).toThrow();
    expect(() => factory({ SOME_UNRELATED_NOTE: 'uses gemini-2.5-flash' })).toThrow();
  });

  it('rejects provider retry overrides before construction', () => {
    const factory = requireTask7Factory();

    expect(() => factory({ GOOGLE_GENAI_RETRY_OPTIONS: '{"maxRetries":3}' })).toThrow();
    expect(() => factory({ CALIBRATION_MAX_RETRIES: '3' })).toThrow();
  });

  it('rejects a wrong project/location/model before construction', () => {
    const factory = requireTask7Factory();

    expect(() => factory({ CALORIX_NUTRITION_EVAL_PROJECT: 'wrong-project' })).toThrow();
    expect(() => factory({ CALORIX_NUTRITION_EVAL_LOCATION: 'us-central1' })).toThrow();
    expect(() => factory({ CALORIX_NUTRITION_EVAL_MODEL: 'gemini-2.0-flash' })).toThrow();
  });
});
