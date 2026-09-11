import {
  NutritionContractError,
  orderedReviewReasons,
  type NutritionDraft,
  type NutritionReference,
  type NutritionUnit,
  type ReviewReason,
} from './nutrition-contract';
import type { OffProduct } from './off-client';

type PackageUnit = Extract<NutritionUnit, 'g' | 'ml'>;

interface MultipackQuantity {
  packageUnitCount?: number;
  unitAmount?: number;
  inferredTotal?: number;
}

interface ParsedMultipack extends Required<MultipackQuantity> {
  unit: PackageUnit;
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function finitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function packageUnit(value: unknown): value is PackageUnit {
  return value === 'g' || value === 'ml';
}

function parseReliableMultipack(text: string): ParsedMultipack | null {
  const match = /(?:^|[\s(])([1-9]\d*)\s*[x×]\s*([1-9]\d*)\s*(ml|g)\b/i.exec(text);
  if (!match) return null;
  const count = Number(match[1]);
  const amount = Number(match[2]);
  const unit = match[3]?.toLowerCase();
  if (!Number.isSafeInteger(count) || !Number.isSafeInteger(amount) || !packageUnit(unit)) {
    return null;
  }
  const inferredTotal = count * amount;
  if (!Number.isSafeInteger(inferredTotal) || inferredTotal <= 0) return null;
  return { packageUnitCount: count, unitAmount: amount, inferredTotal, unit };
}

/** Extracts a whole-number NxU pack amount without inferring units or conversions. */
export function parseMultipackQuantity(text: string): MultipackQuantity {
  if (typeof text !== 'string') return {};
  const parsed = parseReliableMultipack(text);
  if (!parsed) return {};
  const { unit: _unit, ...quantity } = parsed;
  return quantity;
}

function hasUnreliableMultipackText(text: string | undefined): boolean {
  if (!text) return false;
  return (
    /\bmultipack\b/i.test(text) ||
    /(?:^|[^\d.])[1-9]\d*\s*[x×]/i.test(text) ||
    /[x×]\s*[1-9]\d*\s*(?:ml|g)\b/i.test(text)
  );
}

function hasUnsupportedRawMultipackUnit(text: string | undefined): boolean {
  if (!text) return false;
  const match = /(?:^|[\s(])[1-9]\d*\s*[x×]\s*[1-9]\d*\s*([a-z]+)\b/i.exec(text);
  return match !== null && !packageUnit(match[1]?.toLowerCase());
}

function rawHasUnsupportedUnit(text: string | undefined): boolean {
  if (!text) return false;
  const match = /(?:^|\s)\d+(?:\.\d+)?\s*([a-z]+)\b/i.exec(text);
  if (!match) return false;
  return !packageUnit(match[1]?.toLowerCase());
}

function validReference(value: unknown, requirePer100Amount = false): NutritionReference | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const reference = value as Record<string, unknown>;
  if (
    !finiteNonNegative(reference.kcal) ||
    !finiteNonNegative(reference.proteinG) ||
    !finiteNonNegative(reference.carbsG) ||
    !finiteNonNegative(reference.fatG) ||
    !finitePositive(reference.amount) ||
    !packageUnit(reference.unit) ||
    (requirePer100Amount && reference.amount !== 100)
  ) {
    return null;
  }
  return {
    kcal: reference.kcal,
    proteinG: reference.proteinG,
    carbsG: reference.carbsG,
    fatG: reference.fatG,
    amount: reference.amount,
    unit: reference.unit,
  };
}

function fallbackReference(product: OffProduct): NutritionReference {
  const unit = packageUnit(product.productQuantity?.unit) ? product.productQuantity.unit : 'g';
  if (
    !finiteNonNegative(product.kcalPer100g) ||
    !finiteNonNegative(product.proteinPer100g) ||
    !finiteNonNegative(product.carbsPer100g) ||
    !finiteNonNegative(product.fatPer100g)
  ) {
    throw new NutritionContractError();
  }
  return {
    kcal: product.kcalPer100g,
    proteinG: product.proteinPer100g,
    carbsG: product.carbsPer100g,
    fatG: product.fatPer100g,
    amount: 100,
    unit,
  };
}

function per100Reference(product: OffProduct): NutritionReference {
  const reference = product.per100Reference === undefined
    ? fallbackReference(product)
    : validReference(product.per100Reference, true);
  if (!reference) throw new NutritionContractError();
  return reference;
}

function structuredQuantity(value: unknown): { amount: number; unit: PackageUnit } | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const quantity = value as Record<string, unknown>;
  if (!finitePositive(quantity.amount) || !packageUnit(quantity.unit)) return null;
  return { amount: quantity.amount, unit: quantity.unit };
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function malformedQuantityReason(value: unknown): ReviewReason {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const quantity = value as Record<string, unknown>;
    if (hasOwn(quantity, 'unit') && quantity.unit !== undefined && !packageUnit(quantity.unit)) {
      return 'package_unit_unsupported';
    }
  }
  return 'package_quantity_missing';
}

function scaledBase(reference: NutritionReference, amount: number): Pick<NutritionDraft, 'baseKcal' | 'baseProtein' | 'baseCarbs' | 'baseFat'> {
  const base = {
    baseKcal: reference.kcal * amount / 100,
    baseProtein: reference.proteinG * amount / 100,
    baseCarbs: reference.carbsG * amount / 100,
    baseFat: reference.fatG * amount / 100,
  };
  if (!Object.values(base).every(finiteNonNegative)) throw new NutritionContractError();
  return base;
}

function makeDraft(
  reference: NutritionReference,
  amount: number,
  nutritionBasis: 'package' | 'per100g',
  reviewReasons: Iterable<ReviewReason>,
  servingReference?: NutritionReference,
  confirmedBarcode?: string,
): NutritionDraft {
  const draft: NutritionDraft = {
    ...scaledBase(reference, amount),
    nutritionBasis,
    nutritionAmount: amount,
    nutritionUnit: reference.unit,
    per100Reference: reference,
    reviewReasons: orderedReviewReasons(reviewReasons),
  };
  if (servingReference) draft.servingReference = servingReference;
  if (confirmedBarcode) draft.confirmedBarcode = confirmedBarcode;
  return draft;
}

function unresolvedDraft(
  reference: NutritionReference,
  reason: ReviewReason,
  servingReference?: NutritionReference,
  confirmedBarcode?: string,
): NutritionDraft {
  return makeDraft(reference, 100, 'per100g', [reason], servingReference, confirmedBarcode);
}

function confirmedBarcode(value: unknown): string | undefined {
  return typeof value === 'string' && /^\d{8,14}$/.test(value) ? value : undefined;
}

/** Produces canonical package totals only when quantity evidence is unambiguous. */
export function normalizeOffPackage(product: OffProduct): NutritionDraft {
  const reference = per100Reference(product);
  const servingReference = validReference(product.servingReference);
  const quantity = structuredQuantity(product.productQuantity);
  const rawMultipack = product.rawQuantity ? parseReliableMultipack(product.rawQuantity) : null;
  const nameMultipack = product.name ? parseReliableMultipack(product.name) : null;
  const barcode = confirmedBarcode(product.barcode);

  if (product.productQuantityIssue) {
    return unresolvedDraft(
      reference,
      product.productQuantityIssue === 'unsupported_unit'
        ? 'package_unit_unsupported'
        : 'package_quantity_missing',
      servingReference ?? undefined,
      barcode,
    );
  }

  if (hasUnsupportedRawMultipackUnit(product.rawQuantity)) {
    return unresolvedDraft(reference, 'package_unit_unsupported', servingReference ?? undefined, barcode);
  }

  if (hasOwn(product, 'productQuantity') && !quantity) {
    return unresolvedDraft(
      reference,
      malformedQuantityReason(product.productQuantity),
      servingReference ?? undefined,
      barcode,
    );
  }

  if (!rawMultipack && hasUnreliableMultipackText(product.rawQuantity)) {
    return unresolvedDraft(reference, 'nutrition_basis_ambiguous', servingReference ?? undefined, barcode);
  }

  if (
    rawMultipack && nameMultipack && (
      rawMultipack.packageUnitCount !== nameMultipack.packageUnitCount ||
      rawMultipack.unitAmount !== nameMultipack.unitAmount ||
      rawMultipack.unit !== nameMultipack.unit
    )
  ) {
    return unresolvedDraft(reference, 'nutrition_basis_ambiguous', servingReference ?? undefined, barcode);
  }

  const multipack = rawMultipack ?? nameMultipack;
  if (multipack) {
    if (multipack.unit !== reference.unit) {
      return unresolvedDraft(reference, 'nutrition_basis_ambiguous', servingReference ?? undefined, barcode);
    }
    if (quantity && quantity.unit !== reference.unit) {
      return unresolvedDraft(reference, 'nutrition_basis_ambiguous', servingReference ?? undefined, barcode);
    }
    const draft = makeDraft(
      reference,
      multipack.inferredTotal,
      'package',
      quantity && quantity.amount !== multipack.inferredTotal
        ? ['nutrition_basis_ambiguous']
        : [],
      servingReference ?? undefined,
      barcode,
    );
    draft.packageUnitCount = multipack.packageUnitCount;
    draft.unitAmount = multipack.unitAmount;
    if (draft.reviewReasons.length === 0) draft.consumedAmount = multipack.inferredTotal;
    return draft;
  }

  if (quantity) {
    if (quantity.unit !== reference.unit) {
      return unresolvedDraft(reference, 'nutrition_basis_ambiguous', servingReference ?? undefined, barcode);
    }
    const draft = makeDraft(reference, quantity.amount, 'package', [], servingReference ?? undefined, barcode);
    draft.consumedAmount = quantity.amount;
    return draft;
  }

  return unresolvedDraft(
    reference,
    rawHasUnsupportedUnit(product.rawQuantity)
      ? 'package_unit_unsupported'
      : 'package_quantity_missing',
    servingReference ?? undefined,
    barcode,
  );
}
