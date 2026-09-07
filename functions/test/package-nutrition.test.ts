import { describe, expect, it } from 'vitest';

import {
  normalizeOffPackage,
  parseMultipackQuantity,
} from '../src/package-nutrition';

import type { OffProduct } from '../src/off-client';

const vitamin500: OffProduct = {
  name: 'Vitamin Well Reload',
  barcode: '7350042716380',
  rawQuantity: '500 ml',
  kcalPer100g: 17,
  proteinPer100g: 0,
  carbsPer100g: 4.2,
  fatPer100g: 0,
  productQuantity: { amount: 500, unit: 'ml' },
  per100Reference: {
    kcal: 17,
    proteinG: 0,
    carbsG: 4.2,
    fatG: 0,
    amount: 100,
    unit: 'ml',
  },
  servingReference: {
    kcal: 777,
    proteinG: 77,
    carbsG: 55,
    fatG: 33,
    amount: 250,
    unit: 'ml',
  },
  nutritionDataPer: 'serving',
};

describe('parseMultipackQuantity', () => {
  it('extracts only reliable whole count and whole unit multipacks', () => {
    expect(parseMultipackQuantity('Freeway Cola xX (6x330ml cans)')).toEqual({
      packageUnitCount: 6,
      unitAmount: 330,
      inferredTotal: 1980,
    });
  });

  it('rejects substring matches, non-whole values, missing units, and overflow', () => {
    for (const text of [
      '6.5x330ml cans',
      '6x330.5ml cans',
      '0x330ml cans',
      '-6x330ml cans',
      '6x0ml cans',
      '6x-330ml cans',
      '6x330 cans',
      'multipack of cans',
      'x330ml cans',
      '9007199254740992x330ml cans',
      '6x9007199254740992ml cans',
    ]) {
      expect(parseMultipackQuantity(text)).toEqual({});
    }
  });
});

describe('normalizeOffPackage', () => {
  it('uses per-100 density for a whole package even when nutrition_data_per is serving', () => {
    const draft = normalizeOffPackage(vitamin500);

    expect(draft).toMatchObject({
      nutritionBasis: 'package',
      nutritionAmount: 500,
      nutritionUnit: 'ml',
      baseKcal: 85,
      baseProtein: 0,
      baseCarbs: 21,
      baseFat: 0,
      consumedAmount: 500,
      confirmedBarcode: '7350042716380',
      per100Reference: vitamin500.per100Reference,
      servingReference: vitamin500.servingReference,
      reviewReasons: [],
    });
    expect(draft.baseKcal).toBe(85);
    expect(draft.baseCarbs).toBe(21);
    expect(draft.baseKcal).not.toBe(vitamin500.servingReference?.kcal);
    expect(draft.baseCarbs).not.toBe(vitamin500.servingReference?.carbsG);
  });

  it('returns an unresolved per-100 draft when package quantity is absent', () => {
    const {
      productQuantity: _productQuantity,
      rawQuantity: _rawQuantity,
      ...missingQuantity
    } = vitamin500;
    const draft = normalizeOffPackage(missingQuantity);

    expect(draft).toMatchObject({
      nutritionBasis: 'per100g',
      nutritionAmount: 100,
      nutritionUnit: 'ml',
      baseKcal: 17,
      baseCarbs: 4.2,
      confirmedBarcode: '7350042716380',
      reviewReasons: ['package_quantity_missing'],
    });
    expect(draft).not.toHaveProperty('consumedAmount');
    expect(draft).not.toHaveProperty('packageUnitCount');
    expect(draft).not.toHaveProperty('unitAmount');
  });

  it('does not propagate an invalid OFF barcode', () => {
    const draft = normalizeOffPackage({
      ...vitamin500,
      barcode: 'not-a-barcode',
    });

    expect(draft).toMatchObject({ nutritionBasis: 'package', consumedAmount: 500 });
    expect(draft).not.toHaveProperty('confirmedBarcode');
  });

  it('uses the unsupported-unit reason and never invents a package size', () => {
    const { productQuantity: _productQuantity, ...withoutStructuredQuantity } = vitamin500;
    const unsupported = {
      ...withoutStructuredQuantity,
      rawQuantity: '16 oz',
    };
    const draft = normalizeOffPackage(unsupported);

    expect(draft).toMatchObject({
      nutritionBasis: 'per100g',
      nutritionAmount: 100,
      baseKcal: 17,
      reviewReasons: ['package_unit_unsupported'],
    });
    expect(draft).not.toHaveProperty('consumedAmount');
    expect(draft.nutritionAmount).toBe(100);
  });

  it('uses a valid structured quantity over an ordinary raw quantity disagreement', () => {
    const draft = normalizeOffPackage({
      ...vitamin500,
      rawQuantity: '600 ml',
      productQuantity: { amount: 500, unit: 'ml' },
    });

    expect(draft).toMatchObject({
      nutritionBasis: 'package',
      nutritionAmount: 500,
      baseKcal: 85,
      consumedAmount: 500,
      reviewReasons: [],
    });
  });

  it.each([
    { amount: 0, unit: 'ml' },
    { amount: -1, unit: 'ml' },
    { amount: Number.NaN, unit: 'ml' },
    { amount: Infinity, unit: 'ml' },
    { amount: '500', unit: 'ml' },
  ])('uses a safe unresolved draft for invalid structured quantity %#', (productQuantity) => {
    const draft = normalizeOffPackage({
      ...vitamin500,
      rawQuantity: undefined,
      productQuantity,
    } as unknown as OffProduct);

    expect(draft).toMatchObject({
      nutritionBasis: 'per100g',
      nutritionAmount: 100,
      nutritionUnit: 'ml',
      baseKcal: 17,
      reviewReasons: ['package_quantity_missing'],
    });
    expect(draft).not.toHaveProperty('consumedAmount');
  });

  it.each([
    ['invalid', 'package_quantity_missing'],
    ['unsupported_unit', 'package_unit_unsupported'],
  ] as const)(
    'does not let a raw multipack override %s structured quantity evidence',
    (productQuantityIssue, reviewReason) => {
      const draft = normalizeOffPackage({
        ...vitamin500,
        rawQuantity: '6x330ml cans',
        productQuantity: undefined,
        productQuantityIssue,
      } as OffProduct);

      expect(draft).toMatchObject({
        nutritionBasis: 'per100g',
        nutritionAmount: 100,
        nutritionUnit: 'ml',
        baseKcal: 17,
        confirmedBarcode: '7350042716380',
        reviewReasons: [reviewReason],
      });
      expect(draft).not.toHaveProperty('consumedAmount');
    },
  );

  it.each([
    [{ amount: 0, unit: 'ml' }, 'package_quantity_missing'],
    [{ amount: 16, unit: 'oz' }, 'package_unit_unsupported'],
  ] as const)(
    'does not let a raw multipack override malformed direct structured quantity %#',
    (productQuantity, reviewReason) => {
      const draft = normalizeOffPackage({
        ...vitamin500,
        rawQuantity: '6x330ml cans',
        productQuantity,
        productQuantityIssue: undefined,
      } as unknown as OffProduct);

      expect(draft).toMatchObject({
        nutritionBasis: 'per100g',
        nutritionAmount: 100,
        nutritionUnit: 'ml',
        baseKcal: 17,
        reviewReasons: [reviewReason],
      });
      expect(draft).not.toHaveProperty('consumedAmount');
    },
  );

  it('classifies an unsupported raw multipack unit precisely', () => {
    const draft = normalizeOffPackage({
      ...vitamin500,
      rawQuantity: '6x330oz cans',
      productQuantity: undefined,
    });

    expect(draft).toMatchObject({
      nutritionBasis: 'per100g',
      nutritionAmount: 100,
      nutritionUnit: 'ml',
      baseKcal: 17,
      reviewReasons: ['package_unit_unsupported'],
    });
    expect(draft).not.toHaveProperty('consumedAmount');
  });

  it('rejects structured and per-100 reference unit disagreement without conversion', () => {
    const draft = normalizeOffPackage({
      ...vitamin500,
      productQuantity: { amount: 500, unit: 'ml' },
      per100Reference: { ...vitamin500.per100Reference!, unit: 'g' },
    });

    expect(draft).toMatchObject({
      nutritionBasis: 'per100g',
      nutritionAmount: 100,
      nutritionUnit: 'g',
      baseKcal: 17,
      reviewReasons: ['nutrition_basis_ambiguous'],
    });
    expect(draft).not.toHaveProperty('consumedAmount');
  });

  it('rejects a reliable raw multipack whose unit conflicts with structured nutrition', () => {
    const draft = normalizeOffPackage({
      ...vitamin500,
      rawQuantity: '6x330ml cans',
      productQuantity: { amount: 1980, unit: 'g' },
      per100Reference: { ...vitamin500.per100Reference!, unit: 'g' },
    });

    expect(draft).toMatchObject({
      nutritionBasis: 'per100g',
      nutritionAmount: 100,
      nutritionUnit: 'g',
      baseKcal: 17,
      reviewReasons: ['nutrition_basis_ambiguous'],
    });
    expect(draft).not.toHaveProperty('consumedAmount');
  });

  it('preserves strict decimal nutrition through package scaling', () => {
    const decimalProduct: OffProduct = {
      ...vitamin500,
      per100Reference: {
        kcal: 17.125,
        proteinG: 0.0075,
        carbsG: 4.205,
        fatG: 0.00125,
        amount: 100,
        unit: 'ml',
      },
    };
    const draft = normalizeOffPackage(decimalProduct);

    expect(draft.baseKcal).toBeCloseTo(85.625, 12);
    expect(draft.baseProtein).toBeCloseTo(0.0375, 12);
    expect(draft.baseCarbs).toBeCloseTo(21.025, 12);
    expect(draft.baseFat).toBeCloseTo(0.00625, 12);
  });

  it('normalizes a reliable matching multipack as the whole outer package', () => {
    const matching = {
      ...vitamin500,
      rawQuantity: '6x330ml bottles',
      productQuantity: { amount: 1980, unit: 'ml' as const },
      per100Reference: {
        ...vitamin500.per100Reference!,
        kcal: 17,
        carbsG: 4.2,
      },
    };
    const draft = normalizeOffPackage(matching);

    expect(draft).toMatchObject({
      nutritionBasis: 'package',
      nutritionAmount: 1980,
      nutritionUnit: 'ml',
      baseKcal: 336.6,
      baseCarbs: 83.16,
      packageUnitCount: 6,
      unitAmount: 330,
      consumedAmount: 1980,
      reviewReasons: [],
    });
  });

  it('uses inferred outer quantity for a reliable multipack conflict and requires Review', () => {
    const conflicting = {
      ...vitamin500,
      rawQuantity: '6x330ml cans',
      productQuantity: { amount: 330, unit: 'ml' as const },
      per100Reference: {
        ...vitamin500.per100Reference!,
        kcal: 1,
        carbsG: 0,
      },
    };
    const draft = normalizeOffPackage(conflicting);

    expect(draft).toMatchObject({
      nutritionBasis: 'package',
      nutritionAmount: 1980,
      nutritionUnit: 'ml',
      baseKcal: 19.8,
      baseProtein: 0,
      baseCarbs: 0,
      baseFat: 0,
      packageUnitCount: 6,
      unitAmount: 330,
      reviewReasons: ['nutrition_basis_ambiguous'],
    });
    expect(draft).not.toHaveProperty('consumedAmount');
  });

  it('falls back to per-100 nutrition when multipack text is unreliable', () => {
    const unreliable = {
      ...vitamin500,
      rawQuantity: 'Cola multipack x330ml cans',
      productQuantity: { amount: 330, unit: 'ml' as const },
    };
    const draft = normalizeOffPackage(unreliable);

    expect(draft).toMatchObject({
      nutritionBasis: 'per100g',
      nutritionAmount: 100,
      nutritionUnit: 'ml',
      baseKcal: 17,
      baseCarbs: 4.2,
      reviewReasons: ['nutrition_basis_ambiguous'],
    });
    expect(draft).not.toHaveProperty('consumedAmount');
    expect(draft).not.toHaveProperty('packageUnitCount');
    expect(draft).not.toHaveProperty('unitAmount');
  });

  it('emits review reasons in the stable contract order', () => {
    const conflicting = {
      ...vitamin500,
      rawQuantity: '6x330ml cans',
      productQuantity: { amount: 330, unit: 'ml' as const },
    };
    const first = normalizeOffPackage(conflicting);
    const second = normalizeOffPackage(conflicting);

    expect(first.reviewReasons).toEqual(['nutrition_basis_ambiguous']);
    expect(second.reviewReasons).toEqual(first.reviewReasons);
  });
});
