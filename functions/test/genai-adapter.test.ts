import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatContent } from '../src/ai-chat';
import { createGenAIAdapter } from '../src/genai-adapter';

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
