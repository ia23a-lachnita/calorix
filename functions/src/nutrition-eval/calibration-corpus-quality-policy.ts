import { createHash } from 'node:crypto';
import {
  parseAndVerifySource, parseCsvRecords, verifyPinnedSourceBytes,
  parseDishMetadataCsv, mergeDishMetadata, parseTrainSplit, buildExcludedDishes,
  buildEligibleDishes, FROZEN_PUBLIC_MANIFEST_DISH_IDS, fillCalibrationSlots,
  DEVELOPMENT_SLOT_SCHEDULE, VALIDATION_SLOT_SCHEDULE,
} from './calibration-corpus';
import { StrictCalibrationManifestSchema } from './schema';

import type { ExpectedSourceBytes, EligibleDish, CalibrationSlotFillResult } from './calibration-corpus';

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

export interface QualitySourceBundle {
  cafe1: Uint8Array;
  cafe2: Uint8Array;
  trainSplit: Uint8Array;
  vocabulary: Uint8Array;
  v1Manifest: Uint8Array;
}

export type QualitySourcePins = { [K in keyof QualitySourceBundle]: ExpectedSourceBytes };
export type QualityExcludedReason =
  | 'non_positive_calories' | 'non_positive_mass' | 'negative_macros' | 'missing_metadata'
  | 'deprecated_ingredient' | 'unknown_ingredient' | 'quarantined_v1' | 'quarantined_benchmark';

export interface QualityPool {
  eligible: EligibleDish[];
  excluded: Array<{ dishId: string; reason: QualityExcludedReason; affectedIngredientIds: string[] }>;
  quarantineIds: readonly string[];
  sourceDigests: Readonly<Record<keyof QualitySourceBundle, string>>;
  quarantineDigest: string;
}

export function prepareQualityPool(bundle: QualitySourceBundle, pins: QualitySourcePins): QualityPool {
  // Own the bytes and verify every pin before any source is decoded or parsed.
  const owned: QualitySourceBundle = {
    cafe1: Uint8Array.from(bundle.cafe1), cafe2: Uint8Array.from(bundle.cafe2),
    trainSplit: Uint8Array.from(bundle.trainSplit), vocabulary: Uint8Array.from(bundle.vocabulary),
    v1Manifest: Uint8Array.from(bundle.v1Manifest),
  };
  const keys = ['cafe1', 'cafe2', 'trainSplit', 'vocabulary', 'v1Manifest'] as const;
  for (const key of keys) verifyPinnedSourceBytes(owned[key], pins[key]);
  const text = (bytes: Uint8Array): string => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const vocabulary = parseQualityVocabulary(owned.vocabulary, pins.vocabulary);
  const manifest = StrictCalibrationManifestSchema.parse(JSON.parse(text(owned.v1Manifest)));
  const oldTraining = new Set(manifest.cases.map(row => row.source.objectId));
  const benchmark = new Set(FROZEN_PUBLIC_MANIFEST_DISH_IDS);
  const quarantineIds = [...new Set([...oldTraining, ...benchmark])].sort();
  const trainIds = parseTrainSplit(text(owned.trainSplit));
  const metadata = mergeDishMetadata(
    parseDishMetadataCsv(text(owned.cafe1)), parseDishMetadataCsv(text(owned.cafe2)),
  );
  const legacy = new Map(buildExcludedDishes(trainIds, metadata).map(row => [row.dishId, row.reason]));
  const excluded: QualityPool['excluded'] = [];
  const acceptedIds: string[] = [];
  for (const dishId of trainIds) {
    const exclude = (reason: QualityExcludedReason, affectedIngredientIds: string[] = []): void => {
      excluded.push({ dishId, reason, affectedIngredientIds });
    };
    if (oldTraining.has(dishId)) { exclude('quarantined_v1'); continue; }
    if (benchmark.has(dishId)) { exclude('quarantined_benchmark'); continue; }
    const oldReason = legacy.get(dishId);
    if (oldReason !== undefined) { exclude(oldReason); continue; }
    const row = metadata.get(dishId);
    if (row === undefined) throw new Error('quality pool has unclassified missing metadata');
    const unknown = [...new Set(row.ingredients
      .filter(ingredient => !vocabulary.has(ingredient.ingredientId))
      .map(ingredient => ingredient.ingredientId))].sort();
    if (unknown.length > 0) { exclude('unknown_ingredient', unknown); continue; }
    const deprecated = [...new Set(row.ingredients.filter(ingredient =>
      vocabulary.get(ingredient.ingredientId)!.deprecated || ingredient.name.trim().toLowerCase() === 'deprecated',
    ).map(ingredient => ingredient.ingredientId))].sort();
    if (deprecated.length > 0) { exclude('deprecated_ingredient', deprecated); continue; }
    acceptedIds.push(dishId);
  }
  excluded.sort((a, b) => a.dishId < b.dishId ? -1 : a.dishId > b.dishId ? 1 : 0);
  return {
    eligible: buildEligibleDishes(acceptedIds, metadata).sort((a, b) => a.dishId < b.dishId ? -1 : a.dishId > b.dishId ? 1 : 0),
    excluded, quarantineIds,
    sourceDigests: {
      cafe1: createHash('sha256').update(owned.cafe1).digest('hex'),
      cafe2: createHash('sha256').update(owned.cafe2).digest('hex'),
      trainSplit: createHash('sha256').update(owned.trainSplit).digest('hex'),
      vocabulary: createHash('sha256').update(owned.vocabulary).digest('hex'),
      v1Manifest: createHash('sha256').update(owned.v1Manifest).digest('hex'),
    },
    quarantineDigest: createHash('sha256').update(JSON.stringify(quarantineIds)).digest('hex'),
  };
}

export function rankQualityDish(dishId: string): string {
  return createHash('sha256').update('calorix-n5k-calibration-v2:' + dishId).digest('hex');
}

export function selectQualityCandidates(pool: QualityPool, rejectedIds: ReadonlySet<string>): CalibrationSlotFillResult {
  return fillCalibrationSlots(pool.eligible, {
    development: DEVELOPMENT_SLOT_SCHEDULE, validation: VALIDATION_SLOT_SCHEDULE,
  }, { skipDishIds: new Set(rejectedIds), rankDishId: rankQualityDish });
}
