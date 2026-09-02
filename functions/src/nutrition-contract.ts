/** Shared, runtime-validated nutrition scaling contract. */

export type NutritionBasis = 'portion' | 'package' | 'per100g';
export type NutritionUnit = 'portion' | 'g' | 'ml';

export interface NutritionReference {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  amount: number;
  unit: NutritionUnit;
}

export type ReviewReason =
  | 'package_quantity_missing'
  | 'package_unit_unsupported'
  | 'barcode_unconfirmed'
  | 'nutrition_basis_ambiguous'
  | 'nutrition_arithmetic_mismatch'
  | 'atwater_mismatch'
  | 'model_schema_invalid';

/**
 * The persisted, analysis-owned nutrition fields. `base*` describes exactly
 * `nutritionAmount` in `nutritionUnit`; `consumedAmount` is the amount added
 * to daily totals when it is established.
 */
export interface NutritionDraft {
  baseKcal: number;
  baseProtein: number;
  baseCarbs: number;
  baseFat: number;
  nutritionBasis: NutritionBasis;
  nutritionAmount: number;
  nutritionUnit: NutritionUnit;
  consumedAmount?: number;
  packageUnitCount?: number;
  unitAmount?: number;
  per100Reference?: NutritionReference;
  servingReference?: NutritionReference;
  reviewReasons: ReviewReason[];
  rawBarcode?: string;
  modelBarcode?: string;
  confirmedBarcode?: string;
}

export interface CanonicalNutritionInput {
  baseKcal: number;
  baseProtein: number;
  baseCarbs: number;
  baseFat: number;
  nutritionBasis: NutritionBasis;
  nutritionAmount: number;
  nutritionUnit: NutritionUnit;
  consumedAmount?: number;
  servingMultiplier?: number;
}

export interface LegacyNutritionInput {
  baseKcal?: number;
  baseProtein?: number;
  baseCarbs?: number;
  baseFat?: number;
  kcal?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  servingMultiplier?: number;
  nutritionBasis?: never;
  nutritionAmount?: never;
  nutritionUnit?: never;
  consumedAmount?: never;
}

export interface ScaledNutrition {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export class NutritionContractError extends Error {
  constructor(message = 'Invalid nutrition contract') {
    super(message);
    this.name = 'NutritionContractError';
  }
}

const CANONICAL_TUPLE_KEYS = [
  'nutritionBasis',
  'nutritionAmount',
  'nutritionUnit',
] as const;

const CANONICAL_KEYS = [...CANONICAL_TUPLE_KEYS, 'consumedAmount'] as const;

const REVIEW_REASON_ORDER: readonly ReviewReason[] = [
  'package_quantity_missing',
  'package_unit_unsupported',
  'barcode_unconfirmed',
  'nutrition_basis_ambiguous',
  'nutrition_arithmetic_mismatch',
  'atwater_mismatch',
  'model_schema_invalid',
];

type NutritionRecord = Record<string, unknown>;

function asRecord(value: unknown): NutritionRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new NutritionContractError();
  }
  return value as NutritionRecord;
}

function hasOwn(record: NutritionRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function hasAnyCanonicalKey(record: NutritionRecord): boolean {
  return CANONICAL_KEYS.some((key) => hasOwn(record, key));
}

function validateCanonicalTuple(record: NutritionRecord): {amount: number} {
  if (!CANONICAL_TUPLE_KEYS.every((key) => hasOwn(record, key))) {
    throw new NutritionContractError();
  }

  const basis = record.nutritionBasis;
  const amount = record.nutritionAmount;
  const unit = record.nutritionUnit;
  if (
    (basis !== 'portion' && basis !== 'package' && basis !== 'per100g') ||
    !isFinitePositive(amount) ||
    (unit !== 'portion' && unit !== 'g' && unit !== 'ml')
  ) {
    throw new NutritionContractError();
  }
  if (
    (basis === 'portion' && (amount !== 1 || unit !== 'portion')) ||
    (basis === 'per100g' && (amount !== 100 || (unit !== 'g' && unit !== 'ml'))) ||
    (basis === 'package' && unit !== 'g' && unit !== 'ml')
  ) {
    throw new NutritionContractError();
  }
  return {amount};
}

function canonicalRatio(record: NutritionRecord): number {
  const {amount} = validateCanonicalTuple(record);
  if (!hasOwn(record, 'consumedAmount') || !isFinitePositive(record.consumedAmount)) {
    throw new NutritionContractError();
  }
  const ratio = record.consumedAmount / amount;
  if (!isFinitePositive(ratio)) throw new NutritionContractError();
  return ratio;
}

function legacyRatio(record: NutritionRecord): number {
  const multiplier = record.servingMultiplier;
  if (multiplier === undefined) return 1;
  if (!isFiniteNonNegative(multiplier)) throw new NutritionContractError();
  return multiplier;
}

function canonicalVector(record: NutritionRecord): ScaledNutrition {
  const kcal = record.baseKcal;
  const proteinG = record.baseProtein;
  const carbsG = record.baseCarbs;
  const fatG = record.baseFat;
  if (
    !isFiniteNonNegative(kcal) ||
    !isFiniteNonNegative(proteinG) ||
    !isFiniteNonNegative(carbsG) ||
    !isFiniteNonNegative(fatG)
  ) {
    throw new NutritionContractError();
  }
  return {kcal, proteinG, carbsG, fatG};
}

function legacyValue(record: NutritionRecord, baseKey: string, fallbackKey: string): number {
  const value = record[baseKey] ?? record[fallbackKey] ?? 0;
  if (!isFiniteNonNegative(value)) throw new NutritionContractError();
  return value;
}

function legacyVector(record: NutritionRecord): ScaledNutrition {
  return {
    kcal: legacyValue(record, 'baseKcal', 'kcal'),
    proteinG: legacyValue(record, 'baseProtein', 'protein'),
    carbsG: legacyValue(record, 'baseCarbs', 'carbs'),
    fatG: legacyValue(record, 'baseFat', 'fat'),
  };
}

/** Returns the consumed-to-described amount ratio, without legacy double scaling. */
export function consumptionRatio(input: unknown): number {
  const record = asRecord(input);
  return hasAnyCanonicalKey(record) ? canonicalRatio(record) : legacyRatio(record);
}

/** True for a valid canonical consumed amount or a legacy record. Partial canonical data fails closed. */
export function hasResolvedConsumption(input: unknown): boolean {
  const record = asRecord(input);
  if (!hasAnyCanonicalKey(record)) {
    legacyRatio(record);
    return true;
  }
  validateCanonicalTuple(record);
  if (!hasOwn(record, 'consumedAmount') || record.consumedAmount === undefined) {
    return false;
  }
  canonicalRatio(record);
  return true;
}

/** Validates and scales the four nutrient values under either storage contract. */
export function scaleCanonicalNutrition(input: unknown): ScaledNutrition {
  const record = asRecord(input);
  const canonical = hasAnyCanonicalKey(record);
  const ratio = canonical ? canonicalRatio(record) : legacyRatio(record);
  const vector = canonical ? canonicalVector(record) : legacyVector(record);
  const scaled = {
    kcal: vector.kcal * ratio,
    proteinG: vector.proteinG * ratio,
    carbsG: vector.carbsG * ratio,
    fatG: vector.fatG * ratio,
  };
  if (!Object.values(scaled).every(Number.isFinite)) throw new NutritionContractError();
  return scaled;
}

/** Filters unknown values and emits the stable persisted review-reason order. */
export function orderedReviewReasons(reasons: unknown): ReviewReason[] {
  if (
    reasons === null ||
    reasons === undefined ||
    typeof (reasons as {[Symbol.iterator]?: unknown})[Symbol.iterator] !== 'function'
  ) return [];
  const supplied = new Set(
    Array.from(reasons as Iterable<unknown>).filter((reason): reason is ReviewReason =>
      REVIEW_REASON_ORDER.includes(reason as ReviewReason),
    ),
  );
  return REVIEW_REASON_ORDER.filter((reason) => supplied.has(reason));
}

/** Returns whether reported calories disagree materially with Atwater calories. */
export function atwaterMismatch(
  kcal: unknown,
  proteinG: unknown,
  carbsG: unknown,
  fatG: unknown,
): boolean {
  if (
    !isFiniteNonNegative(kcal) ||
    !isFiniteNonNegative(proteinG) ||
    !isFiniteNonNegative(carbsG) ||
    !isFiniteNonNegative(fatG)
  ) {
    throw new NutritionContractError();
  }
  const proteinCalories = proteinG * 4;
  const carbCalories = carbsG * 4;
  const fatCalories = fatG * 9;
  const atwater = proteinCalories + carbCalories + fatCalories;
  if (![proteinCalories, carbCalories, fatCalories, atwater].every(Number.isFinite)) {
    throw new NutritionContractError();
  }
  return Math.abs(kcal - atwater) > Math.max(50, 0.2 * Math.max(kcal, atwater, 1));
}
