import { parseAndVerifySource, parseCsvRecords } from './calibration-corpus';

import type { ExpectedSourceBytes } from './calibration-corpus';

export interface QualityIngredient {
  ingredientId: string;
  name: string;
  caloriesPerG: number;
  fatPerG: number;
  carbsPerG: number;
  proteinPerG: number;
  deprecated: boolean;
}

const VOCAB_HEADER_FIELDS = ['ingr', 'id', 'cal/g', 'fat(g)', 'carb(g)', 'protein(g)'];

const CANONICAL_ID_PATTERN = /^[1-9][0-9]{0,9}$/;

const RATE_FIELD_NAMES = ['cal/g', 'fat(g)', 'carb(g)', 'protein(g)'] as const;

function parseVocabularyRate(value: string, fieldName: string): number {
  if (value.trim() === '') {
    throw new Error(`empty numeric rate field ${fieldName}`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`non-finite numeric rate field ${fieldName}: ${JSON.stringify(value)}`);
  }
  if (parsed < 0) {
    throw new Error(`negative numeric rate field ${fieldName}: ${value}`);
  }
  return parsed;
}

function parseVocabularyText(text: string): ReadonlyMap<string, QualityIngredient> {
  const records = parseCsvRecords(text);
  if (records.length === 0) {
    throw new Error('quality vocabulary source is missing its header row');
  }

  const [header, ...dataRows] = records;
  const headerMatches =
    header!.length === VOCAB_HEADER_FIELDS.length &&
    header!.every((field, index) => field === VOCAB_HEADER_FIELDS[index]);
  if (!headerMatches) {
    throw new Error('quality vocabulary header does not match the required six fixed columns');
  }

  if (dataRows.length === 0) {
    throw new Error('quality vocabulary must contain at least one ingredient row');
  }

  const vocabulary = new Map<string, QualityIngredient>();
  for (const fields of dataRows) {
    if (fields.length !== VOCAB_HEADER_FIELDS.length) {
      throw new Error(`quality vocabulary row must have exactly 6 fields (got ${fields.length})`);
    }

    const [rawName, rawId, rawCalories, rawFat, rawCarb, rawProtein] = fields;
    if (!CANONICAL_ID_PATTERN.test(rawId!)) {
      throw new Error(`invalid ingredient id: ${JSON.stringify(rawId)}`);
    }

    const ingredientId = `ingr_${rawId!.padStart(10, '0')}`;
    if (vocabulary.has(ingredientId)) {
      throw new Error(`duplicate ingredient id: ${rawId}`);
    }

    const caloriesPerG = parseVocabularyRate(rawCalories!, RATE_FIELD_NAMES[0]);
    const fatPerG = parseVocabularyRate(rawFat!, RATE_FIELD_NAMES[1]);
    const carbsPerG = parseVocabularyRate(rawCarb!, RATE_FIELD_NAMES[2]);
    const proteinPerG = parseVocabularyRate(rawProtein!, RATE_FIELD_NAMES[3]);

    const name = rawName!.trim();
    const deprecated = name.toLowerCase() === 'deprecated';

    vocabulary.set(ingredientId, {
      ingredientId,
      name,
      caloriesPerG,
      fatPerG,
      carbsPerG,
      proteinPerG,
      deprecated,
    });
  }

  return vocabulary;
}

export function parseQualityVocabulary(
  bytes: Uint8Array,
  expected: ExpectedSourceBytes,
): ReadonlyMap<string, QualityIngredient> {
  return parseAndVerifySource(bytes, expected, parseVocabularyText);
}
