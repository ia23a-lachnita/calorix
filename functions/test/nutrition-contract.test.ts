import { describe, expect, it } from 'vitest';

import {
  NutritionContractError,
  atwaterMismatch,
  consumptionRatio,
  hasResolvedConsumption,
  orderedReviewReasons,
  scaleCanonicalNutrition,
} from '../src/nutrition-contract';

import type { NutritionDraft } from '../src/nutrition-contract';

const completePackage = {
  baseKcal: 85,
  baseProtein: 10,
  baseCarbs: 21,
  baseFat: 4,
  nutritionBasis: 'package',
  nutritionAmount: 500,
  nutritionUnit: 'ml',
  consumedAmount: 250,
} as const;

describe('nutrition contract exact scaling', () => {
  it('exposes distinct required review and barcode fields on a valid NutritionDraft', () => {
    const draft: NutritionDraft = {
      baseKcal: 85,
      baseProtein: 0,
      baseCarbs: 21,
      baseFat: 0,
      nutritionBasis: 'package',
      nutritionAmount: 500,
      nutritionUnit: 'ml',
      consumedAmount: 500,
      reviewReasons: ['barcode_unconfirmed'],
      rawBarcode: '7350042716380',
      modelBarcode: '7350042716380',
      confirmedBarcode: '7350042716380',
    };

    expect(draft).toMatchObject({
      reviewReasons: ['barcode_unconfirmed'],
      rawBarcode: '7350042716380',
      modelBarcode: '7350042716380',
      confirmedBarcode: '7350042716380',
    });
    expect(Object.keys(draft)).not.toContain('barcode');
  });

  it('scales every canonical nutrient by the exact consumed-to-reference ratio', () => {
    expect(consumptionRatio(completePackage)).toBe(0.5);
    expect(scaleCanonicalNutrition(completePackage)).toEqual({
      kcal: 42.5,
      proteinG: 5,
      carbsG: 10.5,
      fatG: 2,
    });
  });

  it('uses servingMultiplier exactly once only when no canonical key exists', () => {
    const legacy = {
      baseKcal: 100,
      baseProtein: 20,
      baseCarbs: 30,
      baseFat: 10,
      servingMultiplier: 1.5,
    };
    const canonicalWithLegacyMultiplier = {
      ...completePackage,
      servingMultiplier: 4,
    };

    expect(consumptionRatio(legacy)).toBe(1.5);
    expect(scaleCanonicalNutrition(legacy)).toEqual({
      kcal: 150,
      proteinG: 30,
      carbsG: 45,
      fatG: 15,
    });
    expect(consumptionRatio(canonicalWithLegacyMultiplier)).toBe(0.5);
    expect(scaleCanonicalNutrition(canonicalWithLegacyMultiplier).kcal).toBe(42.5);
  });

  it.each([
    ['basis only', { baseKcal: 85, nutritionBasis: 'package' }],
    ['amount only', { baseKcal: 85, nutritionAmount: 500 }],
    ['unit only', { baseKcal: 85, nutritionUnit: 'ml' }],
    ['missing consumed amount', { ...completePackage, consumedAmount: undefined }],
    ['zero canonical amount', { ...completePackage, nutritionAmount: 0 }],
    ['string canonical amount', { ...completePackage, nutritionAmount: '500' }],
    ['null canonical amount', { ...completePackage, nutritionAmount: null }],
    ['nonfinite canonical amount', { ...completePackage, nutritionAmount: Infinity }],
    ['invalid basis', { ...completePackage, nutritionBasis: 'serving' }],
    ['negative consumed amount', { ...completePackage, consumedAmount: -1 }],
    ['zero consumed amount', { ...completePackage, consumedAmount: 0 }],
    ['nonfinite consumed amount', { ...completePackage, consumedAmount: NaN }],
    ['non-string unit', { ...completePackage, nutritionUnit: 500 }],
    ['null unit', { ...completePackage, nutritionUnit: null }],
    ['unsupported unit', { ...completePackage, nutritionUnit: 'kg' }],
  ])('fails closed for %s canonical input rather than using legacy arithmetic',
    (_label, entry) => {
      expect(() => consumptionRatio(entry)).toThrow(NutritionContractError);
      expect(() => scaleCanonicalNutrition(entry)).toThrow(NutritionContractError);
    });

  it.each([
    ['missing calories', { ...completePackage, baseKcal: undefined }],
    ['string protein', { ...completePackage, baseProtein: '10' }],
    ['null carbs', { ...completePackage, baseCarbs: null }],
    ['missing fat', { ...completePackage, baseFat: undefined }],
  ])('rejects a %s vector field rather than treating it as zero', (_label, entry) => {
    expect(() => scaleCanonicalNutrition(entry)).toThrow(NutritionContractError);
  });

  it.each([
    ['portion amount other than one', { ...completePackage, nutritionBasis: 'portion', nutritionAmount: 2, nutritionUnit: 'portion', consumedAmount: 1 }],
    ['portion with mass unit', { ...completePackage, nutritionBasis: 'portion', nutritionAmount: 1, nutritionUnit: 'ml', consumedAmount: 1 }],
    ['per100g amount other than one hundred', { ...completePackage, nutritionBasis: 'per100g', nutritionAmount: 99, nutritionUnit: 'ml', consumedAmount: 99 }],
    ['per100g with portion unit', { ...completePackage, nutritionBasis: 'per100g', nutritionAmount: 100, nutritionUnit: 'portion', consumedAmount: 100 }],
    ['package with portion unit', { ...completePackage, nutritionBasis: 'package', nutritionUnit: 'portion' }],
  ])('rejects %s as an incompatible canonical basis and unit tuple', (_label, entry) => {
    expect(() => scaleCanonicalNutrition(entry)).toThrow(NutritionContractError);
  });

  it.each([
    ['nonfinite calories', { ...completePackage, baseKcal: Infinity }],
    ['negative protein', { ...completePackage, baseProtein: -0.01 }],
    ['nonfinite carbs', { ...completePackage, baseCarbs: NaN }],
    ['negative fat', { ...completePackage, baseFat: -1 }],
    ['negative legacy multiplier', {
      baseKcal: 100,
      baseProtein: 20,
      baseCarbs: 30,
      baseFat: 10,
      servingMultiplier: -1,
    }],
    ['nonfinite legacy multiplier', {
      baseKcal: 100,
      baseProtein: 20,
      baseCarbs: 30,
      baseFat: 10,
      servingMultiplier: Infinity,
    }],
    ['string legacy multiplier', {
      baseKcal: 100,
      baseProtein: 20,
      baseCarbs: 30,
      baseFat: 10,
      servingMultiplier: '1',
    }],
    ['null legacy multiplier', {
      baseKcal: 100,
      baseProtein: 20,
      baseCarbs: 30,
      baseFat: 10,
      servingMultiplier: null,
    }],
    ['NaN legacy multiplier', {
      baseKcal: 100,
      baseProtein: 20,
      baseCarbs: 30,
      baseFat: 10,
      servingMultiplier: NaN,
    }],
  ])('rejects %s rather than producing invalid scaled nutrition', (_label, entry) => {
    expect(() => scaleCanonicalNutrition(entry)).toThrow(NutritionContractError);
  });

  it('accepts an explicit zero legacy multiplier and scales every nutrient to zero', () => {
    const legacyZero = {
      baseKcal: 100,
      baseProtein: 20,
      baseCarbs: 30,
      baseFat: 10,
      servingMultiplier: 0,
    };

    expect(consumptionRatio(legacyZero)).toBe(0);
    expect(scaleCanonicalNutrition(legacyZero)).toEqual({
      kcal: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
    });
  });

  it.each([
    ['finite nutrient product overflow', {
      ...completePackage,
      baseKcal: Number.MAX_VALUE,
      nutritionAmount: 1,
      consumedAmount: 2,
    }],
    ['finite ratio overflow', {
      ...completePackage,
      baseKcal: 1,
      nutritionAmount: Number.MIN_VALUE,
      consumedAmount: Number.MAX_VALUE,
    }],
    ['finite ratio underflow', {
      ...completePackage,
      nutritionAmount: Number.MAX_VALUE,
      consumedAmount: Number.MIN_VALUE,
    }],
  ])('fails closed for %s', (_label, entry) => {
    expect(() => scaleCanonicalNutrition(entry)).toThrow(NutritionContractError);
  });
});

describe('hasResolvedConsumption', () => {
  it('distinguishes valid legacy, resolved canonical, and unresolved canonical records', () => {
    expect(hasResolvedConsumption({
      baseKcal: 100,
      baseProtein: 20,
      baseCarbs: 30,
      baseFat: 10,
      servingMultiplier: 1.5,
    })).toBe(true);
    expect(hasResolvedConsumption(completePackage)).toBe(true);
    const { consumedAmount: _consumedAmount, ...unresolved } = completePackage;
    expect(hasResolvedConsumption(unresolved)).toBe(false);
  });

  it.each([
    ['partial canonical tuple', { nutritionBasis: 'package' }],
    ['infinite legacy multiplier', { servingMultiplier: Infinity }],
    ['NaN legacy multiplier', { servingMultiplier: NaN }],
    ['string legacy multiplier', { servingMultiplier: '1' }],
  ])('rejects %s', (_label, entry) => {
    expect(() => hasResolvedConsumption(entry)).toThrow(NutritionContractError);
  });
});

describe('orderedReviewReasons', () => {
  it('pins the declared order, removes duplicates, and discards unknown values', () => {
    const rawReasons: unknown[] = [
      'atwater_mismatch',
      'not_a_review_reason',
      'barcode_unconfirmed',
      'atwater_mismatch',
      'package_quantity_missing',
      'model_schema_invalid',
      'nutrition_basis_ambiguous',
      'package_unit_unsupported',
      'nutrition_arithmetic_mismatch',
      'package_quantity_missing',
      42,
      null,
    ];

    expect(orderedReviewReasons(rawReasons)).toEqual([
      'package_quantity_missing',
      'package_unit_unsupported',
      'barcode_unconfirmed',
      'nutrition_basis_ambiguous',
      'nutrition_arithmetic_mismatch',
      'atwater_mismatch',
      'model_schema_invalid',
    ]);
  });

  it('accepts a Set while retaining the declared persisted order', () => {
    expect(orderedReviewReasons(new Set([
      'model_schema_invalid',
      'atwater_mismatch',
      'barcode_unconfirmed',
    ]))).toEqual([
      'barcode_unconfirmed',
      'atwater_mismatch',
      'model_schema_invalid',
    ]);
  });
});

describe('atwaterMismatch', () => {
  it('does not flag equality at the fixed 50 kcal threshold but flags values beyond it', () => {
    expect(atwaterMismatch(150, 25, 0, 0)).toBe(false);
    expect(atwaterMismatch(151, 25, 0, 0)).toBe(true);
    expect(atwaterMismatch(50, 25, 0, 0)).toBe(false);
    expect(atwaterMismatch(49, 25, 0, 0)).toBe(true);
  });

  it('does not flag equality at the 20 percent threshold but flags either side beyond it', () => {
    expect(atwaterMismatch(1250, 250, 0, 0)).toBe(false);
    expect(atwaterMismatch(1251, 250, 0, 0)).toBe(true);
    expect(atwaterMismatch(800, 250, 0, 0)).toBe(false);
    expect(atwaterMismatch(799, 250, 0, 0)).toBe(true);
  });

  it.each([
    ['NaN calories', NaN, 25, 0, 0],
    ['infinite protein', 100, Infinity, 0, 0],
    ['negative carbs', 100, 0, -1, 0],
    ['non-number fat', 100, 0, 0, '4'],
  ])('fails closed for %s', (_label, kcal, proteinG, carbsG, fatG) => {
    expect(() => atwaterMismatch(kcal, proteinG, carbsG, fatG))
      .toThrow(NutritionContractError);
  });

  it('fails closed when finite Atwater components overflow their weighted total', () => {
    expect(() => atwaterMismatch(0, Number.MAX_VALUE, 0, 0))
      .toThrow(NutritionContractError);
  });
});
