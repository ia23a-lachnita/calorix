import { describe, expect, it } from 'vitest';
import * as nutrition from '../src/nutrition';
import {
  BARCODE_ANALYSIS_PROMPT,
  LABEL_ANALYSIS_PROMPT,
  MEAL_ANALYSIS_PROMPT,
} from '../src/prompts';

type Source = 'meal' | 'barcode' | 'label';
type Payload = Record<string, unknown>;

const vitaminPer100 = {
  kcal: 17,
  proteinG: 0,
  carbsG: 4.2,
  fatG: 0,
  amount: 100,
  unit: 'ml',
};

const vitaminPackage = {
  kcal: 85,
  proteinG: 0,
  carbsG: 21,
  fatG: 0,
  amount: 500,
  unit: 'ml',
};

function basePayload(overrides: Payload = {}): Payload {
  return {
    name: 'Synthetic nutrition result',
    kcal: 620,
    proteinG: 48,
    carbsG: 72,
    fatG: 16,
    confidence: 0.91,
    candidates: [],
    barcode: null,
    detectedItems: [],
    boundingBox: null,
    ...overrides,
  };
}

function portionPayload(overrides: Payload = {}): Payload {
  return basePayload({
    nutritionBasis: 'portion',
    nutritionAmount: 1,
    nutritionUnit: 'portion',
    ...overrides,
  });
}

function packagePayload(overrides: Payload = {}): Payload {
  return basePayload({
    kcal: vitaminPackage.kcal,
    proteinG: vitaminPackage.proteinG,
    carbsG: vitaminPackage.carbsG,
    fatG: vitaminPackage.fatG,
    nutritionBasis: 'package',
    nutritionAmount: 500,
    nutritionUnit: 'ml',
    observedPackageAmount: 500,
    observedPackageUnit: 'ml',
    packageReference: vitaminPackage,
    ...overrides,
  });
}

function per100Payload(overrides: Payload = {}): Payload {
  return basePayload({
    kcal: vitaminPer100.kcal,
    proteinG: vitaminPer100.proteinG,
    carbsG: vitaminPer100.carbsG,
    fatG: vitaminPer100.fatG,
    nutritionBasis: 'per100g',
    nutritionAmount: 100,
    nutritionUnit: 'ml',
    observedPackageAmount: 500,
    observedPackageUnit: 'ml',
    per100Reference: vitaminPer100,
    ...overrides,
  });
}

function servingPayload(overrides: Payload = {}): Payload {
  const servingReference = {
    kcal: 120,
    proteinG: 4,
    carbsG: 20,
    fatG: 2,
    amount: 30,
    unit: 'g',
  };
  return basePayload({
    kcal: servingReference.kcal,
    proteinG: servingReference.proteinG,
    carbsG: servingReference.carbsG,
    fatG: servingReference.fatG,
    nutritionBasis: 'portion',
    nutritionAmount: 1,
    nutritionUnit: 'portion',
    servingReference,
    ...overrides,
  });
}

type NormalizationResult =
  | { kind: 'draft'; status: 'complete' | 'needs_review'; draft: Record<string, unknown> }
  | {
    kind: 'error';
    status: 'error';
    failureCode: 'model_schema_invalid';
    reviewReasons: ['model_schema_invalid'];
  };

function parsePayload(payload: Payload, source: Source) {
  const outcome = nutrition.parseNutritionResponse(JSON.stringify(payload), source);
  expect(outcome).toMatchObject({ ok: true });
  if (!outcome.ok) throw new Error(outcome.reason);
  return outcome.result;
}

function normalizeVisionNutrition(
  parsed: unknown,
  rawBarcode?: string,
  confirmedBarcode?: string,
): NormalizationResult {
  const fn: unknown = Reflect.get(nutrition, 'normalizeVisionNutrition');
  if (typeof fn !== 'function') {
    throw new Error('normalizeVisionNutrition is required for canonical vision drafts');
  }
  const result: unknown = Reflect.apply(fn, undefined, [parsed, rawBarcode, confirmedBarcode]);
  if (result === null || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error('normalizeVisionNutrition must return an object');
  }
  const record = result as Record<string, unknown>;
  if (record.kind === 'draft' && (record.status === 'complete' || record.status === 'needs_review') &&
      record.draft !== null && typeof record.draft === 'object' && !Array.isArray(record.draft)) {
    return { kind: 'draft', status: record.status, draft: record.draft as Record<string, unknown> };
  }
  if (
    record.kind === 'error' &&
    record.status === 'error' &&
    record.failureCode === 'model_schema_invalid' &&
    Array.isArray(record.reviewReasons) &&
    record.reviewReasons.length === 1 &&
    record.reviewReasons[0] === 'model_schema_invalid'
  ) {
    return {
      kind: 'error',
      status: 'error',
      failureCode: 'model_schema_invalid',
      reviewReasons: ['model_schema_invalid'],
    };
  }
  throw new Error('normalizeVisionNutrition returned an invalid result shape');
}

function expectBarcodeProvenance(
  result: NormalizationResult,
  rawBarcode: string | undefined,
  modelBarcode: string | null,
  confirmedBarcode: string | undefined,
  reviewReasons: string[],
) {
  expect(result).toMatchObject({
    kind: 'draft',
    status: reviewReasons.length === 0 ? 'complete' : 'needs_review',
    draft: { reviewReasons },
  });
  if (result.kind !== 'draft') return;
  if (rawBarcode) expect(result.draft.rawBarcode).toBe(rawBarcode);
  else expect(result.draft).not.toHaveProperty('rawBarcode');
  if (modelBarcode) expect(result.draft.modelBarcode).toBe(modelBarcode);
  else expect(result.draft).not.toHaveProperty('modelBarcode');
  if (confirmedBarcode) expect(result.draft.confirmedBarcode).toBe(confirmedBarcode);
  else expect(result.draft).not.toHaveProperty('confirmedBarcode');
}

describe('basis-aware nutrition response schema', () => {
  it('computes 4/4/9 Atwater kcal', () => {
    expect(nutrition.atwaterKcal(10, 20, 5)).toBe(165);
  });

  it.each([
    ['meal portion', 'meal', portionPayload(), { nutritionBasis: 'portion', nutritionAmount: 1, nutritionUnit: 'portion' }],
    ['label package without optional density', 'label', packagePayload(), { nutritionBasis: 'package', nutritionAmount: 500, nutritionUnit: 'ml' }],
    ['barcode package with optional density', 'barcode', packagePayload({ per100Reference: vitaminPer100 }), { nutritionBasis: 'package', nutritionAmount: 500, nutritionUnit: 'ml' }],
    ['label per-100 with required density', 'label', per100Payload(), { nutritionBasis: 'per100g', nutritionAmount: 100, nutritionUnit: 'ml' }],
    ['barcode portion with a serving reference', 'barcode', servingPayload(), { nutritionBasis: 'portion', nutritionAmount: 1, nutritionUnit: 'portion' }],
  ])('parses valid %s evidence', (_label, source: Source, payload: Payload, expected) => {
    expect(parsePayload(payload, source)).toMatchObject(expected);
  });

  it.each([
    ['meal rejects package', 'meal', packagePayload()],
    ['label package needs package reference', 'label', packagePayload({ packageReference: undefined })],
    ['barcode per-100 needs density', 'barcode', per100Payload({ per100Reference: undefined })],
    ['label portion needs serving reference', 'label', servingPayload({ servingReference: undefined })],
    ['barcode package needs observed amount', 'barcode', packagePayload({ observedPackageAmount: undefined })],
    ['meal requires explicit barcode null', 'meal', portionPayload({ barcode: undefined })],
    ['label requires explicit barcode', 'label', packagePayload({ barcode: undefined })],
    ['barcode requires explicit barcode', 'barcode', packagePayload({ barcode: undefined })],
    ['label requires candidates', 'label', packagePayload({ candidates: undefined })],
    ['barcode requires candidates', 'barcode', packagePayload({ candidates: undefined })],
  ])('rejects invalid mode/basis/reference combination: %s', (_label, source: Source, payload: Payload) => {
    expect(nutrition.parseNutritionResponse(JSON.stringify(payload), source).ok).toBe(false);
  });

  it.each(['label', 'barcode'] as const)(
    'canonicalizes an exact null package-observation pair to absent %s evidence',
    (source) => {
      const parsed = parsePayload(per100Payload({
        observedPackageAmount: null,
        observedPackageUnit: null,
      }), source);

      expect(parsed).toMatchObject({
        nutritionBasis: 'per100g',
        nutritionAmount: 100,
        nutritionUnit: 'ml',
      });
      expect(parsed).not.toHaveProperty('observedPackageAmount');
      expect(parsed).not.toHaveProperty('observedPackageUnit');
    },
  );

  it.each(['label', 'barcode'] as const)(
    'accepts omitted package-observation evidence for an unresolved per-100 %s result',
    (source) => {
      const parsed = parsePayload(per100Payload({
        observedPackageAmount: undefined,
        observedPackageUnit: undefined,
      }), source);

      expect(parsed).not.toHaveProperty('observedPackageAmount');
      expect(parsed).not.toHaveProperty('observedPackageUnit');
    },
  );

  it.each([
    ['null amount with a unit', { observedPackageAmount: null, observedPackageUnit: 'ml' }],
    ['amount with a null unit', { observedPackageAmount: 500, observedPackageUnit: null }],
    ['missing amount with a unit', { observedPackageAmount: undefined, observedPackageUnit: 'ml' }],
    ['amount with a missing unit', { observedPackageAmount: 500, observedPackageUnit: undefined }],
  ])('rejects a partial or mixed-null package-observation pair: %s', (_label, observation) => {
    expect(nutrition.parseNutritionResponse(JSON.stringify(per100Payload(observation)), 'label').ok).toBe(false);
    expect(nutrition.parseNutritionResponse(JSON.stringify(per100Payload(observation)), 'barcode').ok).toBe(false);
  });

  it.each(['label', 'barcode'] as const)(
    'still rejects a package basis with an absent %s package-observation pair',
    (source) => {
      expect(nutrition.parseNutritionResponse(JSON.stringify(packagePayload({
        observedPackageAmount: null,
        observedPackageUnit: null,
      })), source).ok).toBe(false);
    },
  );

  it.each([
    ['wrong amount type', packagePayload({ nutritionAmount: '500' })],
    ['null raw nutrient', packagePayload({ kcal: null })],
    ['negative raw nutrient', packagePayload({ carbsG: -0.1 })],
    ['malformed model barcode', packagePayload({ barcode: 'barcode-7350042716380' })],
    ['malformed candidate vector', packagePayload({ candidates: [{ name: 'Other' }] })],
    ['malformed package vector', packagePayload({ packageReference: { ...vitaminPackage, amount: 0 } })],
    ['portion amount other than one', portionPayload({ nutritionAmount: 2 })],
    ['portion mass unit', portionPayload({ nutritionUnit: 'g' })],
    ['per-100 amount other than one hundred', per100Payload({ nutritionAmount: 99 })],
    ['per-100 portion unit', per100Payload({ nutritionUnit: 'portion' })],
  ])('rejects malformed input: %s', (_label, payload) => {
    expect(nutrition.parseNutritionResponse(JSON.stringify(payload), 'barcode').ok).toBe(false);
  });

  it('rejects a raw JSON non-finite numeric token rather than JSON.stringify null coercion', () => {
    const text = JSON.stringify(packagePayload()).replace('"kcal":85', '"kcal":1e999');
    expect(nutrition.parseNutritionResponse(text, 'barcode').ok).toBe(false);
  });

  it.each([
    [500, 495, true],
    [500, 505, true],
    [500, 494.9, false],
    [500, 505.1, false],
    [50, 49, true],
    [50, 51, true],
    [50, 48.9, false],
    [50, 51.1, false],
  ])('uses max(1 unit, 1%%) declaration tolerance for %i observed as %f', (amount, observed, accepted) => {
    const payload = packagePayload({
      nutritionAmount: amount,
      observedPackageAmount: observed,
      packageReference: { ...vitaminPackage, amount },
    });
    expect(nutrition.parseNutritionResponse(JSON.stringify(payload), 'barcode').ok).toBe(accepted);
  });

  it('rejects a package declaration unit mismatch', () => {
    expect(
      nutrition.parseNutritionResponse(
        JSON.stringify(packagePayload({ observedPackageUnit: 'g' })),
        'label',
      ).ok,
    ).toBe(false);
  });

  it.each([
    ['unknown top-level key', packagePayload({ unsupportedTopLevel: true })],
    ['unknown package reference key', packagePayload({
      packageReference: { ...vitaminPackage, unsupportedReference: true },
    })],
    ['unknown per-100 reference key', per100Payload({
      per100Reference: { ...vitaminPer100, unsupportedReference: true },
    })],
  ])('rejects strict-schema %s', (_label, payload) => {
    expect(nutrition.parseNutritionResponse(JSON.stringify(payload), 'label').ok).toBe(false);
  });
});

describe('vision normalization', () => {
  it('keeps a label per-100 declaration with observed package evidence in Review', () => {
    const result = normalizeVisionNutrition(parsePayload(per100Payload({
      observedPackageAmount: 495,
      packageReference: vitaminPackage,
    }), 'label'));
    expect(result).toMatchObject({
      kind: 'draft',
      status: 'needs_review',
      draft: {
        nutritionBasis: 'package',
        nutritionAmount: 500,
        nutritionUnit: 'ml',
        consumedAmount: 500,
        baseKcal: 85,
        reviewReasons: ['nutrition_basis_ambiguous'],
      },
    });
  });

  it('flags package raw nutrients that contradict package reference when density is absent', () => {
    const result = normalizeVisionNutrition(parsePayload(packagePayload({
      kcal: 90,
      packageReference: vitaminPackage,
    }), 'label'));
    expect(result).toMatchObject({
      kind: 'draft',
      status: 'needs_review',
      draft: { baseKcal: 85, reviewReasons: ['nutrition_basis_ambiguous', 'nutrition_arithmetic_mismatch'] },
    });
  });

  it('flags a per-100 raw nutrient vector that contradicts its density reference', () => {
    const result = normalizeVisionNutrition(parsePayload(per100Payload({ kcal: 18 }), 'label'));
    expect(result).toMatchObject({
      kind: 'draft',
      status: 'needs_review',
      draft: { baseKcal: 85, reviewReasons: ['nutrition_basis_ambiguous', 'nutrition_arithmetic_mismatch'] },
    });
  });

  it('flags optional per-100 package totals that contradict server recomputation', () => {
    const result = normalizeVisionNutrition(parsePayload(per100Payload({
      packageReference: { ...vitaminPackage, kcal: 90 },
    }), 'label'));
    expect(result).toMatchObject({
      kind: 'draft',
      status: 'needs_review',
      draft: { baseKcal: 85, reviewReasons: ['nutrition_basis_ambiguous', 'nutrition_arithmetic_mismatch'] },
    });
  });

  it('flags a portion raw nutrient vector that contradicts its serving reference', () => {
    const result = normalizeVisionNutrition(parsePayload(servingPayload({ kcal: 121 }), 'label'));
    expect(result).toMatchObject({
      kind: 'draft',
      status: 'needs_review',
      draft: { reviewReasons: ['package_quantity_missing', 'nutrition_basis_ambiguous', 'nutrition_arithmetic_mismatch'] },
    });
  });

  it.each([
    ['per-100', 'label', per100Payload({
      observedPackageAmount: 495,
      packageReference: { ...vitaminPackage, amount: 500 },
    }), true],
    ['per-100', 'label', per100Payload({
      observedPackageAmount: 494.9,
      packageReference: { ...vitaminPackage, amount: 500 },
    }), false],
    ['portion', 'label', servingPayload({
      observedPackageAmount: 49,
      observedPackageUnit: 'g',
      packageReference: { kcal: 200, proteinG: 6, carbsG: 30, fatG: 4, amount: 50, unit: 'g' },
    }), true],
    ['portion', 'label', servingPayload({
      observedPackageAmount: 48.9,
      observedPackageUnit: 'g',
      packageReference: { kcal: 200, proteinG: 6, carbsG: 30, fatG: 4, amount: 50, unit: 'g' },
    }), false],
  ])('uses declaration tolerance for %s evidence', (_basis, source: Source, payload: Payload, accepted) => {
    expect(nutrition.parseNutritionResponse(JSON.stringify(payload), source).ok).toBe(accepted);
  });

  it('returns model_schema_invalid rather than throwing when canonical scaling overflows', () => {
    const result = normalizeVisionNutrition(parsePayload(per100Payload({
      kcal: 1e308,
      per100Reference: { ...vitaminPer100, kcal: 1e308 },
    }), 'label'));
    expect(result).toEqual({
      kind: 'error',
      status: 'error',
      failureCode: 'model_schema_invalid',
      reviewReasons: ['model_schema_invalid'],
    });
  });

  it('recomputes the synthetic Vitamin Well package and retains reported energy rather than Atwater 84', () => {
    const result = normalizeVisionNutrition(
      parsePayload(packagePayload({ barcode: '7350042716380', per100Reference: vitaminPer100 }), 'barcode'),
      '7350042716380',
      undefined,
    );
    expect(result).toMatchObject({
      kind: 'draft',
      status: 'needs_review',
      draft: {
        baseKcal: 85,
        baseCarbs: 21,
        consumedAmount: 500,
        reviewReasons: ['barcode_unconfirmed'],
      },
    });
  });

  it('adds label basis ambiguity and nutrition arithmetic mismatch when package values disagree with density but remain Atwater-consistent', () => {
    const result = normalizeVisionNutrition(parsePayload(packagePayload({
      kcal: 100,
      carbsG: 25,
      proteinG: 0,
      fatG: 0,
      per100Reference: vitaminPer100,
      packageReference: { ...vitaminPackage, kcal: 100, carbsG: 25 },
    }), 'label'));
    expect(result).toMatchObject({
      kind: 'draft',
      status: 'needs_review',
      draft: { baseKcal: 85, baseCarbs: 21, reviewReasons: ['nutrition_basis_ambiguous', 'nutrition_arithmetic_mismatch'] },
    });
  });

  it('adds label basis ambiguity and Atwater mismatch when density and package arithmetic agree but source energy disagrees with macros', () => {
    const density = { ...vitaminPer100, proteinG: 15 };
    const result = normalizeVisionNutrition(parsePayload(packagePayload({
      proteinG: 75,
      per100Reference: density,
      packageReference: { ...vitaminPackage, proteinG: 75 },
    }), 'label'));
    expect(result).toMatchObject({
      kind: 'draft',
      status: 'needs_review',
      draft: { baseKcal: 85, baseProtein: 75, reviewReasons: ['nutrition_basis_ambiguous', 'atwater_mismatch'] },
    });
  });

  it('keeps a per-100 label with no independently observed package quantity unresolved', () => {
    const result = normalizeVisionNutrition(parsePayload(per100Payload({
      observedPackageAmount: null,
      observedPackageUnit: null,
      packageReference: vitaminPackage,
    }), 'label'));
    expect(result).toMatchObject({
      kind: 'draft',
      status: 'needs_review',
      draft: {
        baseKcal: 17,
        baseCarbs: 4.2,
        nutritionBasis: 'per100g',
        nutritionAmount: 100,
        nutritionUnit: 'ml',
        per100Reference: vitaminPer100,
        reviewReasons: ['package_quantity_missing', 'nutrition_basis_ambiguous'],
      },
    });
    if (result.kind === 'draft') expect(result.draft).not.toHaveProperty('consumedAmount');
  });

  it('keeps a per-100 barcode result with no independently observed package quantity unresolved', () => {
    const result = normalizeVisionNutrition(parsePayload(per100Payload({
      observedPackageAmount: undefined,
      observedPackageUnit: undefined,
      packageReference: vitaminPackage,
    }), 'barcode'));
    expect(result).toMatchObject({
      kind: 'draft',
      status: 'needs_review',
      draft: {
        baseKcal: 17,
        baseCarbs: 4.2,
        nutritionBasis: 'per100g',
        nutritionAmount: 100,
        nutritionUnit: 'ml',
        per100Reference: vitaminPer100,
        reviewReasons: ['package_quantity_missing'],
      },
    });
    if (result.kind === 'draft') expect(result.draft).not.toHaveProperty('consumedAmount');
  });

  it.each(['label', 'barcode'] as const)(
    'rejects a per-100 %s result with an unobserved package reference in a different unit',
    (source) => {
      expect(nutrition.parseNutritionResponse(JSON.stringify(per100Payload({
        observedPackageAmount: undefined,
        observedPackageUnit: undefined,
        packageReference: { ...vitaminPackage, unit: 'g' },
      })), source).ok).toBe(false);
    },
  );

  it.each([
    ['label', ['package_quantity_missing', 'nutrition_basis_ambiguous', 'nutrition_arithmetic_mismatch']],
    ['barcode', ['package_quantity_missing', 'nutrition_arithmetic_mismatch']],
  ] as const)(
    'keeps a per-100 %s result with inconsistent unobserved package totals unresolved',
    (source, reviewReasons) => {
      const result = normalizeVisionNutrition(parsePayload(per100Payload({
        observedPackageAmount: undefined,
        observedPackageUnit: undefined,
        packageReference: { ...vitaminPackage, kcal: 90 },
      }), source));

      expect(result).toMatchObject({
        kind: 'draft',
        status: 'needs_review',
        draft: {
          baseKcal: 17,
          baseProtein: 0,
          baseCarbs: 4.2,
          baseFat: 0,
          nutritionBasis: 'per100g',
          nutritionAmount: 100,
          nutritionUnit: 'ml',
          per100Reference: vitaminPer100,
          reviewReasons,
        },
      });
      if (result.kind === 'draft') expect(result.draft).not.toHaveProperty('consumedAmount');
    },
  );

  it.each([
    ['label', ['package_quantity_missing', 'nutrition_basis_ambiguous', 'nutrition_arithmetic_mismatch']],
    ['barcode', ['package_quantity_missing', 'nutrition_arithmetic_mismatch']],
  ] as const)(
    'flags a per-100 %s package reference whose finite expected totals overflow',
    (source, reviewReasons) => {
      const overflowingDensity = {
        kcal: 9e307,
        proteinG: 0,
        carbsG: 0,
        fatG: 1e307,
        amount: 100,
        unit: 'ml',
      };
      const result = normalizeVisionNutrition(parsePayload(per100Payload({
        kcal: overflowingDensity.kcal,
        proteinG: overflowingDensity.proteinG,
        carbsG: overflowingDensity.carbsG,
        fatG: overflowingDensity.fatG,
        observedPackageAmount: undefined,
        observedPackageUnit: undefined,
        per100Reference: overflowingDensity,
        packageReference: { ...overflowingDensity, amount: 1e308 },
      }), source));

      expect(result).toMatchObject({
        kind: 'draft',
        status: 'needs_review',
        draft: {
          baseKcal: 9e307,
          baseProtein: 0,
          baseCarbs: 0,
          baseFat: 1e307,
          nutritionBasis: 'per100g',
          nutritionAmount: 100,
          nutritionUnit: 'ml',
          per100Reference: overflowingDensity,
          reviewReasons,
        },
      });
      if (result.kind === 'draft') expect(result.draft).not.toHaveProperty('consumedAmount');
    },
  );

  it.each([
    ['label', ['package_quantity_missing', 'nutrition_basis_ambiguous']],
    ['barcode', ['package_quantity_missing']],
  ] as const)('keeps a per-100 %s result with no package reference or observed quantity unresolved', (source, reviewReasons) => {
    const parsed = parsePayload(per100Payload({
      observedPackageAmount: undefined,
      observedPackageUnit: undefined,
      packageReference: undefined,
    }), source);
    expect(parsed).not.toHaveProperty('observedPackageAmount');
    expect(parsed).not.toHaveProperty('observedPackageUnit');
    expect(parsed).not.toHaveProperty('packageReference');

    const result = normalizeVisionNutrition(parsed);
    expect(result).toMatchObject({
      kind: 'draft',
      status: 'needs_review',
      draft: {
        baseKcal: 17,
        baseProtein: 0,
        baseCarbs: 4.2,
        baseFat: 0,
        nutritionBasis: 'per100g',
        nutritionAmount: 100,
        nutritionUnit: 'ml',
        per100Reference: vitaminPer100,
        reviewReasons,
      },
    });
    if (result.kind === 'draft') expect(result.draft).not.toHaveProperty('consumedAmount');
  });

  it('keeps a per-100 label with observed evidence in Review rather than completing it', () => {
    const result = normalizeVisionNutrition(parsePayload(per100Payload(), 'label'));
    expect(result).toMatchObject({
      kind: 'draft',
      status: 'needs_review',
      draft: {
        baseKcal: 85,
        baseCarbs: 21,
        nutritionBasis: 'package',
        nutritionAmount: 500,
        nutritionUnit: 'ml',
        consumedAmount: 500,
        reviewReasons: ['nutrition_basis_ambiguous'],
      },
    });
  });

  it('keeps a portion label unresolved when no package amount is observed', () => {
    const result = normalizeVisionNutrition(parsePayload(servingPayload(), 'label'));
    expect(result).toMatchObject({
      kind: 'draft',
      status: 'needs_review',
      draft: {
        nutritionBasis: 'portion',
        nutritionAmount: 1,
        nutritionUnit: 'portion',
        reviewReasons: ['package_quantity_missing', 'nutrition_basis_ambiguous'],
      },
    });
    if (result.kind === 'draft') expect(result.draft).not.toHaveProperty('consumedAmount');
  });

  it('keeps a label package draft in Review even when observed evidence is within tolerance', () => {
    const result = normalizeVisionNutrition(parsePayload(packagePayload({
      observedPackageAmount: 495,
      per100Reference: vitaminPer100,
    }), 'label'));
    expect(result).toMatchObject({
      kind: 'draft',
      status: 'needs_review',
      draft: {
        nutritionBasis: 'package',
        nutritionAmount: 500,
        nutritionUnit: 'ml',
        consumedAmount: 500,
        baseKcal: 85,
        baseCarbs: 21,
        reviewReasons: ['nutrition_basis_ambiguous'],
      },
    });
  });

  it.each([
    ['all agree', '7350042716380', '7350042716380', '7350042716380', []],
    ['raw only confirmed', '7350042716380', null, '7350042716380', []],
    ['model only confirmed', undefined, '7350042716380', '7350042716380', []],
    ['raw mismatch', '0000000000000', '7350042716380', '7350042716380', ['barcode_unconfirmed']],
    ['model mismatch', '7350042716380', '0000000000000', '7350042716380', ['barcode_unconfirmed']],
    ['no confirmation', '7350042716380', '7350042716380', undefined, ['barcode_unconfirmed']],
  ])('keeps barcode provenance distinct: %s', (_label, rawBarcode, modelBarcode, confirmedBarcode, reasons) => {
    const result = normalizeVisionNutrition(
      parsePayload(packagePayload({ barcode: modelBarcode, per100Reference: vitaminPer100 }), 'barcode'),
      rawBarcode,
      confirmedBarcode,
    );
    expectBarcodeProvenance(result, rawBarcode, modelBarcode, confirmedBarcode, reasons);
  });

  it('returns the exact model-schema-invalid error union for unusable parsed input', () => {
    expect(normalizeVisionNutrition({ nutritionBasis: 'package' })).toEqual({
      kind: 'error',
      status: 'error',
      failureCode: 'model_schema_invalid',
      reviewReasons: ['model_schema_invalid'],
    });
  });
});

describe('vision prompt contracts', () => {
  it.each([LABEL_ANALYSIS_PROMPT, BARCODE_ANALYSIS_PROMPT])(
    'binds top-level nutrient vectors and optional package totals to their references',
    (prompt) => {
      expect(prompt).toMatch(/top-level kcal, proteinG, carbsG, and fatG must match the selected reference/i);
      expect(prompt).toMatch(/optional package totals must match the server recomputation from per100Reference/i);
    },
  );

  it.each([MEAL_ANALYSIS_PROMPT, LABEL_ANALYSIS_PROMPT, BARCODE_ANALYSIS_PROMPT])(
    'names every shared raw response field',
    (prompt) => {
      for (const field of [
        'kcal',
        'proteinG',
        'carbsG',
        'fatG',
        'confidence',
        'candidates',
        'barcode',
        'nutritionBasis',
        'nutritionAmount',
        'nutritionUnit',
      ]) expect(prompt).toContain(field);
    },
  );

  it('instructs meal analysis to return exactly one full visible portion and a nullable barcode', () => {
    expect(MEAL_ANALYSIS_PROMPT).toMatch(/full visible portion/i);
    expect(MEAL_ANALYSIS_PROMPT).toMatch(/"nutritionBasis"\s*:\s*"portion"/);
    expect(MEAL_ANALYSIS_PROMPT).toMatch(/"nutritionAmount"\s*:\s*1/);
    expect(MEAL_ANALYSIS_PROMPT).toMatch(/"nutritionUnit"\s*:\s*"portion"/);
    expect(MEAL_ANALYSIS_PROMPT).toMatch(/barcode.*null|null.*barcode/i);
  });

  it.each([['label', LABEL_ANALYSIS_PROMPT], ['barcode', BARCODE_ANALYSIS_PROMPT]])(
    'instructs %s analysis to target the complete physical package with observed evidence and no invented amount',
    (_mode, prompt) => {
      expect(prompt).toMatch(/complete physical package/i);
      expect(prompt).toMatch(/observed package/i);
      expect(prompt).toMatch(/do not invent.*package amount/i);
      expect(prompt).toMatch(/observedPackageAmount/);
      expect(prompt).toMatch(/observedPackageUnit/);
      expect(prompt).toMatch(/per100Reference/);
      expect(prompt).toMatch(/packageReference/);
      expect(prompt).toMatch(/servingReference/);
      expect(prompt).toMatch(/"nutritionBasis"\s*:\s*"package"[\s\S]{0,300}"packageReference"/);
      expect(prompt).toMatch(/"nutritionBasis"\s*:\s*"per100g"[\s\S]{0,300}"per100Reference"/);
      expect(prompt).toMatch(/"nutritionBasis"\s*:\s*"portion"[\s\S]{0,300}"servingReference"/);
      expect(prompt).toMatch(/barcode.*null|null.*barcode/i);
    },
  );

  it('instructs barcode analysis to return a nullable, model-observed barcode', () => {
    expect(BARCODE_ANALYSIS_PROMPT).toMatch(/barcode/i);
    expect(BARCODE_ANALYSIS_PROMPT).toMatch(/null|nullable/i);
  });
});
