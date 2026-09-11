export type VisionSource = 'meal' | 'label' | 'barcode';

type JsonSchema = Record<string, unknown>;

const nonemptyNameSchema: JsonSchema = {
  type: 'string',
  description: 'Nonempty food name',
};

const nonnegativeNumberSchema: JsonSchema = {
  type: 'number',
  minimum: 0,
};

const positiveNumberSchema: JsonSchema = {
  type: 'number',
  minimum: 1e-9,
};

const unitIntervalSchema: JsonSchema = {
  type: 'number',
  minimum: 0,
  maximum: 1,
};

const candidateSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: nonemptyNameSchema,
    confidence: unitIntervalSchema,
    kcal: nonnegativeNumberSchema,
    proteinG: nonnegativeNumberSchema,
    carbsG: nonnegativeNumberSchema,
    fatG: nonnegativeNumberSchema,
  },
  required: ['name', 'confidence', 'kcal', 'proteinG', 'carbsG', 'fatG'],
};

const detectedItemSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: nonemptyNameSchema,
    weight: nonnegativeNumberSchema,
  },
  required: ['name', 'weight'],
};

const candidatesSchema: JsonSchema = {
  type: 'array',
  items: candidateSchema,
};

const detectedItemsSchema: JsonSchema = {
  type: 'array',
  description:
    'Omit any detected item with unknown weight; never emit null and never fabricate zero.',
  items: detectedItemSchema,
};

const boundingBoxSchema: JsonSchema = {
  anyOf: [
    { type: 'null' },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        width: nonnegativeNumberSchema,
        height: nonnegativeNumberSchema,
      },
      required: ['x', 'y', 'width', 'height'],
    },
  ],
};

const mealBarcodeSchema: JsonSchema = { type: 'null' };

const packageBarcodeSchema: JsonSchema = {
  anyOf: [
    { type: 'null' },
    {
      type: 'string',
      description: '8-14 digit barcode observed in the image',
    },
  ],
};

const mealBasisSchema: JsonSchema = { type: 'string', enum: ['portion'] };
const mealAmountSchema: JsonSchema = { type: 'number', enum: [1] };
const mealUnitSchema: JsonSchema = { type: 'string', enum: ['portion'] };

const packageBasisSchema: JsonSchema = {
  type: 'string',
  enum: ['portion', 'package', 'per100g'],
};
const packageUnitSchema: JsonSchema = {
  type: 'string',
  enum: ['portion', 'g', 'ml'],
};
const observedPackageUnitSchema: JsonSchema = {
  type: 'string',
  enum: ['g', 'ml'],
};

const referenceSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    kcal: nonnegativeNumberSchema,
    proteinG: nonnegativeNumberSchema,
    carbsG: nonnegativeNumberSchema,
    fatG: nonnegativeNumberSchema,
    amount: positiveNumberSchema,
    unit: { type: 'string', enum: ['g', 'ml'] },
  },
  required: ['kcal', 'proteinG', 'carbsG', 'fatG', 'amount', 'unit'],
};

const commonRequired = [
  'name',
  'kcal',
  'proteinG',
  'carbsG',
  'fatG',
  'confidence',
  'candidates',
  'barcode',
  'detectedItems',
  'boundingBox',
  'nutritionBasis',
  'nutritionAmount',
  'nutritionUnit',
] as const;

function commonProperties(source: VisionSource): Record<string, JsonSchema> {
  const packageCapable = source !== 'meal';
  return {
    name: nonemptyNameSchema,
    kcal: nonnegativeNumberSchema,
    proteinG: nonnegativeNumberSchema,
    carbsG: nonnegativeNumberSchema,
    fatG: nonnegativeNumberSchema,
    confidence: unitIntervalSchema,
    candidates: candidatesSchema,
    barcode: packageCapable ? packageBarcodeSchema : mealBarcodeSchema,
    detectedItems: detectedItemsSchema,
    boundingBox: boundingBoxSchema,
    nutritionBasis: packageCapable ? packageBasisSchema : mealBasisSchema,
    nutritionAmount: packageCapable ? positiveNumberSchema : mealAmountSchema,
    nutritionUnit: packageCapable ? packageUnitSchema : mealUnitSchema,
  };
}

const mealVisionJsonSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: commonProperties('meal'),
  required: [...commonRequired],
};

const packageVisionJsonSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ...commonProperties('label'),
    observedPackageAmount: positiveNumberSchema,
    observedPackageUnit: observedPackageUnitSchema,
    packageReference: referenceSchema,
    per100Reference: referenceSchema,
    servingReference: referenceSchema,
  },
  required: [...commonRequired],
};

export function visionResponseJsonSchema(source: VisionSource): JsonSchema {
  return source === 'meal' ? mealVisionJsonSchema : packageVisionJsonSchema;
}
