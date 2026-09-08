import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

let env: RulesTestEnvironment;

const OWNER = 'user-owner';
const OTHER = 'user-other';

function validEntry(overrides: Record<string, unknown> = {}) {
  return {
    uid: OWNER,
    date: '2026-07-07',
    status: 'pending',
    scanMode: 'meal',
    imageUrl: 'https://example.com/scan.jpg',
    ...overrides,
  };
}

const completeFields = {
  status: 'complete',
  foodName: 'Chicken Rice Bowl',
  baseKcal: 620,
  baseProtein: 48,
  baseCarbs: 72,
  baseFat: 16,
  confidence: 0.91,
};

const per100Reference = {
  kcal: 17,
  proteinG: 0,
  carbsG: 4.2,
  fatG: 0,
  amount: 100,
  unit: 'ml',
};

const servingReference = {
  kcal: 42.5,
  proteinG: 0,
  carbsG: 10.5,
  fatG: 0,
  amount: 250,
  unit: 'ml',
};

const per100ReferenceG = {...per100Reference, unit: 'g'};
const servingReferenceG = {...servingReference, unit: 'g'};
const servingReferenceNon250 = {...servingReference, amount: 300};
const per100ReferenceAtBounds = {
  kcal: 10_000,
  proteinG: 1_000_000_000,
  carbsG: 1_000_000_000,
  fatG: 1_000_000_000,
  amount: 100,
  unit: 'ml',
};
const servingReferenceAtBounds = {
  kcal: 10_000,
  proteinG: 1_000_000_000,
  carbsG: 1_000_000_000,
  fatG: 1_000_000_000,
  amount: 1_000_000_000,
  unit: 'ml',
};

const canonicalPackage = {
  ...completeFields,
  nutritionBasis: 'package',
  nutritionAmount: 500,
  nutritionUnit: 'ml',
  consumedAmount: 500,
  per100Reference,
  servingReference,
  reviewReasons: [],
};

function withoutUndefined(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  );
}

function omitFields(data: Record<string, unknown>, ...keys: string[]): Record<string, unknown> {
  const result = {...data};
  for (const key of keys) delete result[key];
  return result;
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'calorix-rules-test',
    firestore: {
      rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'),
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

function ownerDb() {
  return env.authenticatedContext(OWNER).firestore();
}

function otherDb() {
  return env.authenticatedContext(OTHER).firestore();
}

describe('entries', () => {
  it('lets the owner create a pending scan entry with a valid date', async () => {
    await assertSucceeds(
      setDoc(doc(ownerDb(), `users/${OWNER}/entries/e1`), validEntry()),
    );
  });

  it('lets the owner create a manual complete entry with full nutrition', async () => {
    await assertSucceeds(
      setDoc(doc(ownerDb(), `users/${OWNER}/entries/e2`), validEntry(completeFields)),
    );
  });

  it('accepts complete legacy nutrition and pending raw-barcode documents without canonical fields', async () => {
    await assertSucceeds(
      setDoc(doc(ownerDb(), `users/${OWNER}/entries/legacy-complete`), validEntry(completeFields)),
    );
    await assertSucceeds(
      setDoc(
        doc(ownerDb(), `users/${OWNER}/entries/raw-barcode-pending`),
        validEntry({ rawBarcode: '7350042716380' }),
      ),
    );
  });

  it.each([
    ['portion', { nutritionBasis: 'portion', nutritionAmount: 1, nutritionUnit: 'portion', consumedAmount: 1 }],
    ['package', { nutritionBasis: 'package', nutritionAmount: 500, nutritionUnit: 'ml', consumedAmount: 500 }],
    ['per100g', { nutritionBasis: 'per100g', nutritionAmount: 100, nutritionUnit: 'ml', consumedAmount: 100 }],
  ])('accepts a complete canonical %s entry', async (_label, canonical) => {
    await assertSucceeds(
      setDoc(
        doc(ownerDb(), `users/${OWNER}/entries/canonical-${canonical.nutritionBasis}`),
        validEntry({
          ...completeFields,
          ...canonical,
          per100Reference,
          servingReference,
          reviewReasons: [],
        }),
      ),
    );
  });

  it.each([
    ['both references omitted', ['per100Reference', 'servingReference']],
    ['per100 reference omitted', ['per100Reference']],
    ['serving reference omitted', ['servingReference']],
  ])('accepts a canonical entry when %s', async (_label, omitted) => {
    await assertSucceeds(
      setDoc(
        doc(ownerDb(), `users/${OWNER}/entries/optional-${_label}`),
        validEntry(omitFields(canonicalPackage, ...omitted)),
      ),
    );
  });

  it.each([
    ['package in grams', {
      nutritionBasis: 'package', nutritionAmount: 500, nutritionUnit: 'g', consumedAmount: 250,
      per100Reference: per100ReferenceG, servingReference: servingReferenceG,
    }],
    ['per100g in grams', {
      nutritionBasis: 'per100g', nutritionAmount: 100, nutritionUnit: 'g', consumedAmount: 100,
      per100Reference: per100ReferenceG, servingReference: servingReferenceG,
    }],
  ])('accepts a valid canonical %s entry', async (_label, canonical) => {
    await assertSucceeds(
      setDoc(
        doc(ownerDb(), `users/${OWNER}/entries/grams-${_label}`),
        validEntry({...completeFields, ...canonical, reviewReasons: []}),
      ),
    );
  });

  it('accepts both exact six-key nutrition reference maps on a canonical entry', async () => {
    await assertSucceeds(
      setDoc(
        doc(ownerDb(), `users/${OWNER}/entries/reference-valid`),
        validEntry(canonicalPackage),
      ),
    );
  });

  it('accepts a serving reference with a finite positive non-250 amount', async () => {
    await assertSucceeds(
      setDoc(
        doc(ownerDb(), `users/${OWNER}/entries/reference-serving-non250`),
        validEntry({...canonicalPackage, servingReference: servingReferenceNon250}),
      ),
    );
  });

  it.each([
    ['per100Reference', {per100Reference: per100ReferenceAtBounds, servingReference: undefined}],
    ['servingReference', {per100Reference: undefined, servingReference: servingReferenceAtBounds}],
  ])('accepts inclusive numeric bounds in %s', async (label, references) => {
    await assertSucceeds(
      setDoc(
        doc(ownerDb(), `users/${OWNER}/entries/reference-bounds-${label}`),
        withoutUndefined(validEntry({...canonicalPackage, ...references})),
      ),
    );
  });

  it('does not treat barcode or Atwater metadata as a canonical-validation trigger', async () => {
    await assertSucceeds(
      setDoc(
        doc(ownerDb(), `users/${OWNER}/entries/legacy-metadata`),
        validEntry({
          ...completeFields,
          rawBarcode: 'raw-123',
          modelBarcode: 'model-456',
          confirmedBarcode: 'confirmed-789',
          barcode: 'legacy-000',
          atwaterKcal: 'server-owned metadata',
        }),
      ),
    );
  });

  it.each([
    ['nutritionBasis', {nutritionBasis: 'package'}],
    ['nutritionAmount', {nutritionAmount: 500}],
    ['nutritionUnit', {nutritionUnit: 'ml'}],
    ['consumedAmount', {consumedAmount: 250}],
    ['packageUnitCount', {packageUnitCount: 2}],
    ['unitAmount', {unitAmount: 250}],
    ['per100Reference', {per100Reference}],
    ['servingReference', {servingReference}],
    ['reviewReasons', {reviewReasons: []}],
  ])('treats canonical-adjacent %s as an independent validation trigger', async (label, trigger) => {
    await assertFails(
      setDoc(
        doc(ownerDb(), `users/${OWNER}/entries/${label}-trigger`),
        validEntry({...completeFields, ...trigger}),
      ),
    );
  });

  it('allows a server-seeded needs_review canonical draft without consumedAmount', async () => {
    const ref = doc(ownerDb(), `users/${OWNER}/entries/review-unresolved`);
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), ref.path),
        withoutUndefined(validEntry({
          ...canonicalPackage,
          status: 'needs_review',
          consumedAmount: undefined,
          reviewReasons: ['nutrition_basis_ambiguous'],
        })),
      );
    });
    await assertSucceeds(updateDoc(ref, { foodName: 'Resolved at review' }));
  });

  it('rejects confirming a Review draft that has no consumed amount', async () => {
    const ref = doc(ownerDb(), `users/${OWNER}/entries/review-no-consumption`);
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), ref.path),
        withoutUndefined(validEntry({
          ...canonicalPackage,
          status: 'needs_review',
          consumedAmount: undefined,
          reviewReasons: ['nutrition_basis_ambiguous'],
        })),
      );
    });
    await assertFails(updateDoc(ref, { status: 'complete' }));
  });

  it('allows confirming a Review draft after finite positive consumption is supplied', async () => {
    const ref = doc(ownerDb(), `users/${OWNER}/entries/review-resolved`);
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), ref.path),
        withoutUndefined(validEntry({
          ...canonicalPackage,
          status: 'needs_review',
          consumedAmount: undefined,
          reviewReasons: ['nutrition_basis_ambiguous'],
        })),
      );
    });
    await assertSucceeds(updateDoc(ref, { status: 'complete', consumedAmount: 250 }));
  });

  it.each([
    ['zero consumedAmount', {consumedAmount: 0}],
    ['negative consumedAmount', {consumedAmount: -1}],
    ['NaN consumedAmount', {consumedAmount: Number.NaN}],
    ['Infinity consumedAmount', {consumedAmount: Number.POSITIVE_INFINITY}],
    ['over-bound consumedAmount', {consumedAmount: 1_000_000_001}],
  ])('rejects a needs_review update with %s', async (_label, invalid) => {
    const ref = doc(ownerDb(), `users/${OWNER}/entries/review-invalid-consumption-${_label}`);
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), ref.path),
        validEntry({...canonicalPackage, status: 'needs_review'}),
      );
    });
    await assertFails(updateDoc(ref, invalid));
  });

  it.each([
    ['missing consumedAmount', { consumedAmount: undefined }],
    ['missing reviewReasons', { reviewReasons: undefined }],
    ['partial tuple', { nutritionAmount: undefined, nutritionUnit: undefined }],
    ['invalid basis', { nutritionBasis: 'serving' }],
    ['invalid unit', { nutritionUnit: 'portion' }],
    ['zero amount', { nutritionAmount: 0 }],
    ['negative nutritionAmount', { nutritionAmount: -1 }],
    ['zero consumedAmount', { consumedAmount: 0 }],
    ['negative consumedAmount', { consumedAmount: -1 }],
    ['portion amount mismatch', { nutritionBasis: 'portion', nutritionAmount: 2, nutritionUnit: 'portion', consumedAmount: 1 }],
    ['per100g amount mismatch', { nutritionBasis: 'per100g', nutritionAmount: 99, nutritionUnit: 'ml', consumedAmount: 99 }],
  ])('rejects a complete canonical entry with %s', async (_label, invalid) => {
    await assertFails(
      setDoc(
        doc(ownerDb(), `users/${OWNER}/entries/invalid-canonical-${_label}`),
        withoutUndefined(validEntry({ ...canonicalPackage, ...invalid })),
      ),
    );
  });

  it.each([
    ['NaN base protein', { baseProtein: Number.NaN }],
    ['Infinity base protein', { baseProtein: Number.POSITIVE_INFINITY }],
    ['base protein over the numeric bound', { baseProtein: 1_000_000_001 }],
    ['NaN base kcal', { baseKcal: Number.NaN }],
    ['Infinity base kcal', { baseKcal: Number.POSITIVE_INFINITY }],
    ['base kcal over its stricter bound', { baseKcal: 10_001 }],
    ['NaN base carbs', { baseCarbs: Number.NaN }],
    ['Infinity base carbs', { baseCarbs: Number.POSITIVE_INFINITY }],
    ['base carbs over the numeric bound', { baseCarbs: 1_000_000_001 }],
    ['NaN base fat', { baseFat: Number.NaN }],
    ['Infinity base fat', { baseFat: Number.POSITIVE_INFINITY }],
    ['base fat over the numeric bound', { baseFat: 1_000_000_001 }],
    ['NaN nutritionAmount', { nutritionAmount: Number.NaN }],
    ['Infinity nutritionAmount', { nutritionAmount: Number.POSITIVE_INFINITY }],
    ['nutritionAmount over the numeric bound', { nutritionAmount: 1_000_000_001 }],
    ['NaN consumedAmount', { consumedAmount: Number.NaN }],
    ['Infinity consumedAmount', { consumedAmount: Number.POSITIVE_INFINITY }],
    ['consumedAmount over the numeric bound', { consumedAmount: 1_000_000_001 }],
  ])('rejects %s', async (_label, invalid) => {
    await assertFails(
      setDoc(
        doc(ownerDb(), `users/${OWNER}/entries/nonfinite-${_label}`),
        validEntry({ ...canonicalPackage, ...invalid }),
      ),
    );
  });

  it.each([
    ['fractional package count', { packageUnitCount: 1.5, unitAmount: 250 }],
    ['zero package count', { packageUnitCount: 0, unitAmount: 250 }],
    ['package count over the numeric bound', { packageUnitCount: 1_000_000_001, unitAmount: 0.0000005 }],
    ['missing unit amount', { packageUnitCount: 2 }],
    ['missing package count', { unitAmount: 250 }],
    ['multipack on the wrong basis', { nutritionBasis: 'per100g', nutritionAmount: 100, consumedAmount: 100, packageUnitCount: 2, unitAmount: 50 }],
    ['package product mismatch', { packageUnitCount: 2, unitAmount: 240 }],
    ['package product just below tolerance', { packageUnitCount: 2, unitAmount: 249.9949 }],
    ['package product just above tolerance', { packageUnitCount: 2, unitAmount: 250.0051 }],
  ])('rejects invalid multipack metadata: %s', async (_label, invalid) => {
    await assertFails(
      setDoc(
        doc(ownerDb(), `users/${OWNER}/entries/multipack-${_label}`),
        withoutUndefined(validEntry({ ...canonicalPackage, ...invalid })),
      ),
    );
  });

  it('accepts the inclusive package count upper bound when the product agrees', async () => {
    await assertSucceeds(
      setDoc(
        doc(ownerDb(), `users/${OWNER}/entries/multipack-count-upper-bound`),
        validEntry({...canonicalPackage, packageUnitCount: 1_000_000_000, unitAmount: 0.0000005}),
      ),
    );
  });

  it.each([249.995, 250.005])(
    'accepts a multipack at the %s unit amount ±0.01 boundary',
    async (unitAmount) => {
      await assertSucceeds(
        setDoc(
          doc(ownerDb(), `users/${OWNER}/entries/multipack-tolerance-${unitAmount}`),
          validEntry({ ...canonicalPackage, packageUnitCount: 2, unitAmount }),
        ),
      );
    },
  );

  it.each([
    ['per100 reference missing a required key', { per100Reference: omitFields(per100Reference, 'fatG') }],
    ['per100 reference has an extra key', { per100Reference: { ...per100Reference, extra: 1 } }],
    ['per100 reference has a negative nutrient', { per100Reference: { ...per100Reference, kcal: -1 } }],
    ['per100 reference has a nonfinite nutrient', { per100Reference: { ...per100Reference, proteinG: Number.POSITIVE_INFINITY } }],
    ['per100 reference kcal exceeds 10000', { per100Reference: { ...per100Reference, kcal: 10_001 } }],
    ['per100 reference nutrient exceeds 1e9', { per100Reference: { ...per100Reference, proteinG: 1_000_000_001 } }],
    ['per100 reference amount exceeds 1e9', { per100Reference: { ...per100Reference, amount: 1_000_000_001 } }],
    ['per100 reference has the wrong amount', { per100Reference: { ...per100Reference, amount: 99 } }],
    ['per100 reference has a wrong unit', { per100Reference: { ...per100Reference, unit: 'portion' } }],
    ['serving reference missing a required key', { servingReference: omitFields(servingReference, 'fatG') }],
    ['serving reference has an extra key', { servingReference: { ...servingReference, extra: 1 } }],
    ['serving reference has a negative nutrient', { servingReference: { ...servingReference, carbsG: -1 } }],
    ['serving reference has a nonfinite nutrient', { servingReference: { ...servingReference, proteinG: Number.NaN } }],
    ['serving reference kcal exceeds 10000', { servingReference: { ...servingReference, kcal: 10_001 } }],
    ['serving reference nutrient exceeds 1e9', { servingReference: { ...servingReference, carbsG: 1_000_000_001 } }],
    ['serving reference amount is zero', { servingReference: { ...servingReference, amount: 0 } }],
    ['serving reference amount is negative', { servingReference: { ...servingReference, amount: -1 } }],
    ['serving reference amount is NaN', { servingReference: { ...servingReference, amount: Number.NaN } }],
    ['serving reference amount is Infinity', { servingReference: { ...servingReference, amount: Number.POSITIVE_INFINITY } }],
    ['serving reference amount exceeds 1e9', { servingReference: { ...servingReference, amount: 1_000_000_001 } }],
    ['serving reference has a mismatched unit', { servingReference: { ...servingReference, unit: 'g' } }],
  ])('rejects invalid exact nutrition reference maps: %s', async (_label, invalid) => {
    await assertFails(
      setDoc(
        doc(ownerDb(), `users/${OWNER}/entries/reference-${_label}`),
        withoutUndefined(validEntry({ ...canonicalPackage, ...invalid })),
      ),
    );
  });

  it.each([
    'package_quantity_missing',
    'package_unit_unsupported',
    'barcode_unconfirmed',
    'nutrition_basis_ambiguous',
    'nutrition_arithmetic_mismatch',
    'atwater_mismatch',
    'model_schema_invalid',
  ])('accepts the declared ReviewReason enum value %s', async (reason) => {
    await assertSucceeds(
      setDoc(
        doc(ownerDb(), `users/${OWNER}/entries/reason-${reason}`),
        validEntry({ ...canonicalPackage, reviewReasons: [reason] }),
      ),
    );
  });

  it.each([
    ['an unknown enum value', ['other_reason']],
    ['a mixed allowed and unknown enum value', ['barcode_unconfirmed', 'other_reason']],
    ['a non-list reviewReasons value', 'barcode_unconfirmed'],
  ])('rejects %s', async (_label, reviewReasons) => {
    await assertFails(
      setDoc(
        doc(ownerDb(), `users/${OWNER}/entries/invalid-reasons-${_label}`),
        validEntry({ ...canonicalPackage, reviewReasons }),
      ),
    );
  });

  it.each([
    ['tuple corruption', {nutritionBasis: 'serving'}],
    ['numeric corruption', {baseProtein: Number.POSITIVE_INFINITY}],
    ['reference corruption', {per100Reference: {...per100Reference, extra: 1}}],
    ['multipack corruption', {packageUnitCount: 2, unitAmount: 240}],
    ['reason corruption', {reviewReasons: ['other_reason']}],
  ])('rejects owner update with %s', async (_label, invalid) => {
    const ref = doc(ownerDb(), `users/${OWNER}/entries/invalid-update-${_label}`);
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), ref.path), validEntry(canonicalPackage));
    });
    await assertFails(updateDoc(ref, invalid));
  });

  it('forbids canonical-to-legacy updates while allowing legacy document edits', async () => {
    const canonicalRef = doc(ownerDb(), `users/${OWNER}/entries/canonical-downgrade`);
    const legacyRef = doc(ownerDb(), `users/${OWNER}/entries/legacy-update`);
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), canonicalRef.path), validEntry(canonicalPackage));
      await setDoc(doc(ctx.firestore(), legacyRef.path), validEntry(completeFields));
    });

    await assertFails(updateDoc(canonicalRef, {
      nutritionBasis: deleteField(),
      nutritionAmount: deleteField(),
      nutritionUnit: deleteField(),
      consumedAmount: deleteField(),
      per100Reference: deleteField(),
      servingReference: deleteField(),
      reviewReasons: deleteField(),
    }));
    await assertSucceeds(updateDoc(legacyRef, { baseKcal: 500 }));
  });

  it('rejects complete entries missing nutrition fields', async () => {
    await assertFails(
      setDoc(
        doc(ownerDb(), `users/${OWNER}/entries/e3`),
        validEntry({ status: 'complete', foodName: 'Mystery' }),
      ),
    );
  });

  it('rejects invalid date keys and out-of-range values', async () => {
    await assertFails(
      setDoc(doc(ownerDb(), `users/${OWNER}/entries/e4`), validEntry({ date: '07/07/2026' })),
    );
    await assertFails(
      setDoc(
        doc(ownerDb(), `users/${OWNER}/entries/e5`),
        validEntry({ ...completeFields, baseKcal: 60000 }),
      ),
    );
    await assertFails(
      setDoc(
        doc(ownerDb(), `users/${OWNER}/entries/e6`),
        validEntry({ ...completeFields, confidence: 1.5 }),
      ),
    );
  });

  it('rejects legacy nutrition fields on new complete entries', async () => {
    await assertFails(
      setDoc(
        doc(ownerDb(), `users/${OWNER}/entries/legacy`),
        validEntry({
          status: 'complete',
          foodName: 'Legacy meal',
          kcal: 100,
          protein: 10,
          carbs: 20,
          fat: 5,
        }),
      ),
    );
  });

  it('rejects client-side server statuses on create', async () => {
    await assertFails(
      setDoc(doc(ownerDb(), `users/${OWNER}/entries/e7`), validEntry({ status: 'processing' })),
    );
    await assertFails(
      setDoc(doc(ownerDb(), `users/${OWNER}/entries/e8`), validEntry({ status: 'needs_review' })),
    );
  });

  it('blocks other users from reading or listing my entries (cross-user regression)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `users/${OWNER}/entries/e1`), validEntry());
    });
    await assertFails(getDoc(doc(otherDb(), `users/${OWNER}/entries/e1`)));
    await assertFails(
      getDocs(query(collection(otherDb(), `users/${OWNER}/entries`), where('date', '==', '2026-07-07'))),
    );
  });

  it('allows confirming a review (needs_review -> complete) but not skipping analysis', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `users/${OWNER}/entries/review1`),
        validEntry({ ...completeFields, status: 'needs_review', confidence: 0.6 }),
      );
      await setDoc(doc(ctx.firestore(), `users/${OWNER}/entries/pend1`), validEntry());
    });
    await assertSucceeds(
      updateDoc(doc(ownerDb(), `users/${OWNER}/entries/review1`), { status: 'complete' }),
    );
    await assertFails(
      updateDoc(doc(ownerDb(), `users/${OWNER}/entries/pend1`), {
        ...completeFields,
      }),
    );
  });

  it('allows retrying a failed scan (error -> pending)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `users/${OWNER}/entries/err1`),
        validEntry({ status: 'error', errorMessage: 'boom' }),
      );
    });
    await assertSucceeds(
      updateDoc(doc(ownerDb(), `users/${OWNER}/entries/err1`), { status: 'pending' }),
    );
  });

  it('rejects nutrition corrections while analysis is pending or processing', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `users/${OWNER}/entries/pending-edit`), validEntry());
      await setDoc(
        doc(ctx.firestore(), `users/${OWNER}/entries/processing-edit`),
        validEntry({ status: 'processing' }),
      );
    });

    await assertFails(
      updateDoc(doc(ownerDb(), `users/${OWNER}/entries/pending-edit`), {
        baseKcal: 500,
      }),
    );
    await assertFails(
      updateDoc(doc(ownerDb(), `users/${OWNER}/entries/processing-edit`), {
        servingMultiplier: 2,
      }),
    );
  });

  it('lets the owner edit and delete complete entries', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `users/${OWNER}/entries/e9`),
        validEntry(completeFields),
      );
    });
    await assertSucceeds(
      updateDoc(doc(ownerDb(), `users/${OWNER}/entries/e9`), { baseKcal: 500 }),
    );
    await assertFails(
      updateDoc(doc(otherDb(), `users/${OWNER}/entries/e9`), { baseKcal: 1 }),
    );
    await assertSucceeds(deleteDoc(doc(ownerDb(), `users/${OWNER}/entries/e9`)));
  });
});

describe('dailyLogs', () => {
  it('is owner-readable but never client-writable', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `users/${OWNER}/dailyLogs/2026-07-07`), {
        kcal: 845,
        protein: 74,
        carbs: 92,
        fat: 20,
        entryCount: 3,
        date: '2026-07-07',
      });
    });
    await assertSucceeds(getDoc(doc(ownerDb(), `users/${OWNER}/dailyLogs/2026-07-07`)));
    await assertFails(getDoc(doc(otherDb(), `users/${OWNER}/dailyLogs/2026-07-07`)));
    await assertFails(
      setDoc(doc(ownerDb(), `users/${OWNER}/dailyLogs/2026-07-07`), { kcal: 1 }),
    );
    await assertFails(deleteDoc(doc(ownerDb(), `users/${OWNER}/dailyLogs/2026-07-07`)));
  });
});

describe('owner-only subcollections', () => {
  it('targets, weightLogs and aiThreads are owner read/write', async () => {
    await assertSucceeds(
      setDoc(doc(ownerDb(), `users/${OWNER}/targets/plan1`), { kcal: 2400 }),
    );
    await assertSucceeds(
      setDoc(doc(ownerDb(), `users/${OWNER}/weightLogs/2026-07-07`), { weight: 80.4 }),
    );
    await assertSucceeds(
      setDoc(doc(ownerDb(), `users/${OWNER}/aiThreads/t1`), { title: 'Macros' }),
    );
    await assertSucceeds(
      setDoc(doc(ownerDb(), `users/${OWNER}/aiThreads/t1/messages/m1`), { text: 'hi' }),
    );
    await assertFails(
      setDoc(doc(otherDb(), `users/${OWNER}/targets/plan1`), { kcal: 1 }),
    );
  });
});

describe('assistant thread security', () => {
  it('allows only the owner to read threads and active messages', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `users/${OWNER}/aiThreads/t1`), {
        title: 'Macros',
      });
      await setDoc(
        doc(ctx.firestore(), `users/${OWNER}/aiThreads/t1/messages/m1`),
        { role: 'user', content: 'hi' },
      );
    });

    await assertSucceeds(
      getDoc(doc(ownerDb(), `users/${OWNER}/aiThreads/t1`)),
    );
    await assertSucceeds(
      getDoc(doc(ownerDb(), `users/${OWNER}/aiThreads/t1/messages/m1`)),
    );
    await assertFails(
      getDoc(doc(otherDb(), `users/${OWNER}/aiThreads/t1`)),
    );
    await assertFails(
      getDoc(
        doc(
          env.unauthenticatedContext().firestore(),
          `users/${OWNER}/aiThreads/t1/messages/m1`,
        ),
      ),
    );
  });

  it('allows owner archive reads/deletes but denies client create/update', async () => {
    const path = `users/${OWNER}/aiThreads/t1/messageArchive/m0`;
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), path), {
        role: 'assistant',
        content: 'old',
      });
    });

    await assertSucceeds(getDoc(doc(ownerDb(), path)));
    await assertFails(getDoc(doc(otherDb(), path)));
    await assertFails(setDoc(doc(ownerDb(), path), { content: 'tampered' }));
    await assertFails(
      setDoc(
        doc(ownerDb(), `users/${OWNER}/aiThreads/t1/messageArchive/new`),
        { content: 'injected' },
      ),
    );
    await assertFails(deleteDoc(doc(otherDb(), path)));
    await assertSucceeds(deleteDoc(doc(ownerDb(), path)));
  });
});

describe('server-owned collections', () => {
  it('denies all client access to catalog, barcode index, and model configs', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'catalog_products/p1'), { canonicalName: 'X' });
      await setDoc(doc(ctx.firestore(), 'barcode_index/123'), { productId: 'p1' });
      await setDoc(doc(ctx.firestore(), 'model_configs/default'), { visionModel: 'm' });
    });
    await assertFails(getDoc(doc(ownerDb(), 'catalog_products/p1')));
    await assertFails(setDoc(doc(ownerDb(), 'catalog_products/p2'), { a: 1 }));
    await assertFails(getDoc(doc(ownerDb(), 'barcode_index/123')));
    await assertFails(setDoc(doc(ownerDb(), 'barcode_index/456'), { a: 1 }));
    await assertFails(getDoc(doc(ownerDb(), 'model_configs/default')));
    await assertFails(setDoc(doc(ownerDb(), 'model_configs/default'), { a: 1 }));
  });
});
