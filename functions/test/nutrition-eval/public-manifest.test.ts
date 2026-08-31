import { describe, it, expect, vi } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

import { parseNutritionEvalManifest } from '../../src/nutrition-eval/schema';
import { loadVerifiedCaseImage } from '../../src/nutrition-eval/assets';

// ── Manifest path (relative to functions/) ─────────────────────────────────────
const MANIFEST_PATH = join(__dirname, '../../eval/nutrition/public-manifest.json');
const OFF_SNAPSHOTS_DIR = join(__dirname, '../../eval/nutrition/off-snapshots');
const ATTRIBUTION_PATH = join(__dirname, '../../eval/nutrition/ATTRIBUTION.md');

// ── Expected Nutrition5k meal cases (12) ──────────────────────────────────────
// All are scanMode: 'meal', source.dataset: 'nutrition5k', basis: 'portion',
// unit: 'portion', amount: 1, all 640x480 overhead rgb.png.
const EXPECTED_NUTRITION5K_CASES: ReadonlyArray<{
  dishId: string;
  sha256: string;
  kcal: number;
  massG: number;
  fatG: number;
  carbsG: number;
  proteinG: number;
}> = [
  { dishId: 'dish_1565035746', sha256: '28f5fe26394586f124c04af2d22270d8a8079c141fc1f2b0fe80593d77ae2869', kcal: 43.099998, massG: 149, fatG: 0.369, carbsG: 9.010, proteinG: 2.409 },
  { dishId: 'dish_1558639818', sha256: '333154ffcf6f3f1a76a2e90e9d352082de170322bad411a33adbef4b5f0c8718', kcal: 20.059999, massG: 59, fatG: 0.118, carbsG: 4.720, proteinG: 0.472 },
  { dishId: 'dish_1558549605', sha256: '4dd2f659ecb68f246f59499171b54f0ba840ba8abf6d6d9a62e1f951d78fb72f', kcal: 97.500000, massG: 75, fatG: 0.225, carbsG: 21.000, proteinG: 2.025 },
  { dishId: 'dish_1561663580', sha256: '70b81a49263e9dd88c81974f4725291c1734ddf1cf2f1bc1d0c84f617262c879', kcal: 432.063416, massG: 307, fatG: 9.844143, carbsG: 31.344984, proteinG: 51.432281 },
  { dishId: 'dish_1565898402', sha256: '33f29ac52f0c32d8551907de5fadbf77cdd7efa60861e367767fe6b53261ed4c', kcal: 384.799225, massG: 229, fatG: 19.544107, carbsG: 9.462811, proteinG: 39.424374 },
  { dishId: 'dish_1566328724', sha256: 'd6f1c4eb86cf70b21b10f5c86ccc56cc459154df6a3c24b088a9948dd35dd5c5', kcal: 275.549988, massG: 167, fatG: 6.012, carbsG: 0, proteinG: 51.770 },
  { dishId: 'dish_1566838351', sha256: 'e52ed4ed6036d46b44f023764a48c5f6acb74e39e90edce44a099aa3a0289cbf', kcal: 190.009995, massG: 417, fatG: 0.822, carbsG: 48.034, proteinG: 2.490 },
  { dishId: 'dish_1567107839', sha256: '8bc958e56690b8d6fe090ccb5d212eb4cf4dafeaec7bcdcf5af1bf31a08cb5c2', kcal: 174.284485, massG: 156, fatG: 16.469330, carbsG: 11.980703, proteinG: 18.763048 },
  { dishId: 'dish_1558639787', sha256: 'd6c6f2f9749620979295f4d95213f9c3a28608d0b0fc93255417667e8d50a98d', kcal: 24.750000, massG: 99, fatG: 0.297, carbsG: 4.950, proteinG: 1.782 },
  { dishId: 'dish_1562788601', sha256: 'bff5ff57197d63c46b62109182d1cfba0a90da518fe1a73ed109ecdc20d08b73', kcal: 413.170135, massG: 287, fatG: 19.139153, carbsG: 48.766399, proteinG: 23.146877 },
  { dishId: 'dish_1560456326', sha256: 'b545d87192f92951a94a51bfe67573cefaf6605523676f9efc118125234c96cd', kcal: 206.872757, massG: 138, fatG: 7.522188, carbsG: 3.791613, proteinG: 29.742077 },
  { dishId: 'dish_1564427430', sha256: '1a353b0de279f264bbbf48e613948b83291d99e50d9d19910732d1d7ef02baeb', kcal: 345.620026, massG: 170, fatG: 23.860001, carbsG: 2.340, proteinG: 30.790001 },
];

// ── Expected Open Food Facts cases (8) ────────────────────────────────────────
// 4 barcode scanMode, 4 label scanMode. Each must have a committed snapshot.
const EXPECTED_OFF_BARCODE_IDS: ReadonlyArray<string> = [
  '3017624010701',
  '5449000000996',
  '4056489686941',
  '7622210449283',
];

const EXPECTED_OFF_LABEL_IDS: ReadonlyArray<string> = [
  '8076809513753',
  '8000500310427',
  '4008400404127',
  '3228857000166',
];

const EXPECTED_OFF_IDS = [
  ...EXPECTED_OFF_BARCODE_IDS,
  ...EXPECTED_OFF_LABEL_IDS,
];

// ── Attributions required by the plan ─────────────────────────────────────────
const REQUIRED_ATTRIBUTION_IDS = ['nutrition5k-cc-by-4.0', 'open-food-facts-odbl'];

// ── Helpers ────────────────────────────────────────────────────────────────────
function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(
      `Public manifest not found at ${MANIFEST_PATH}. ` +
        'This file must be created as part of Task 2 Step 4.',
    );
  }
  const raw = readFileSync(MANIFEST_PATH, 'utf-8');
  return parseNutritionEvalManifest(JSON.parse(raw));
}

// ── Tests ──────────────────────────────────────────────────────────────────────
describe('public-manifest', () => {
  it('manifest file exists and parses as a valid NutritionEvalManifest', () => {
    const manifest = loadManifest();
    expect(manifest.version).toBe(1);
    expect(manifest.datasetId).toBeTruthy();
    expect(Array.isArray(manifest.cases)).toBe(true);
  });

  it('contains exactly 20 unique public cases', () => {
    const manifest = loadManifest();
    const ids = manifest.cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(20);
    expect(manifest.cases).toHaveLength(20);
    for (const c of manifest.cases) {
      expect(c.visibility).toBe('public');
    }
  });

  it('contains exactly 12 meal, 4 barcode, 4 label scan modes', () => {
    const manifest = loadManifest();
    const byMode = { meal: 0, barcode: 0, label: 0 };
    for (const c of manifest.cases) {
      byMode[c.scanMode]++;
    }
    expect(byMode.meal).toBe(12);
    expect(byMode.barcode).toBe(4);
    expect(byMode.label).toBe(4);
  });

  it('all case IDs are unique', () => {
    const manifest = loadManifest();
    const ids = manifest.cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('contains exactly the 12 planned Nutrition5k meal cases with correct SHA-256 hashes', () => {
    const manifest = loadManifest();
    const mealCases = manifest.cases.filter((c) => c.scanMode === 'meal');

    const mealIds = mealCases.map((c) => c.source.objectId).sort();
    const expectedIds = EXPECTED_NUTRITION5K_CASES.map((e) => e.dishId).sort();
    expect(mealIds).toEqual(expectedIds);

    for (const expected of EXPECTED_NUTRITION5K_CASES) {
      const match = mealCases.find(
        (c) => c.source.objectId === expected.dishId,
      );
      expect(match).toBeDefined();
      expect(match!.source.dataset).toBe('nutrition5k');
      expect(match!.image.sha256).toBe(expected.sha256);
      expect(match!.truth.kcal).toBeCloseTo(expected.kcal, 5);
      expect(match!.truth.amount).toBe(1);
      expect(match!.truth.unit).toBe('portion');
      expect(match!.truth.fatG).toBeCloseTo(expected.fatG, 5);
      expect(match!.truth.carbsG).toBeCloseTo(expected.carbsG, 5);
      expect(match!.truth.proteinG).toBeCloseTo(expected.proteinG, 5);
      expect(match!.toleranceClass).toBe('meal-estimate');
      expect(match!.truth.basis).toBe('portion');
      expect(match!.truth).toMatchObject({ referenceMassG: expected.massG });
    }
  });

  it('all 12 Nutrition5k cases use overhead 640x480 png images', () => {
    const manifest = loadManifest();
    const mealCases = manifest.cases.filter((c) => c.scanMode === 'meal');
    expect(mealCases).toHaveLength(12);

    for (const c of mealCases) {
      expect(c.image.mediaType).toBe('image/png');
      expect(c.image.width).toBe(640);
      expect(c.image.height).toBe(480);
      expect(c.image.url).toContain('realsense_overhead');
      expect(c.image.url).toMatch(/\.png$/);
    }
  });

  it('contains exactly the 8 planned Open Food Facts cases', () => {
    const manifest = loadManifest();
    const offCases = manifest.cases.filter(
      (c) => c.source.dataset === 'open-food-facts',
    );
    expect(offCases).toHaveLength(8);

    const offIds = offCases.map((c) => c.source.objectId).sort();
    const expectedIds = [...EXPECTED_OFF_IDS].sort();
    expect(offIds).toEqual(expectedIds);
  });

  it('4 OFF barcode cases are scanMode barcode', () => {
    const manifest = loadManifest();
    const barcodeCases = manifest.cases.filter(
      (c) =>
        c.source.dataset === 'open-food-facts' && c.scanMode === 'barcode',
    );
    const barcodeIds = barcodeCases.map((c) => c.source.objectId).sort();
    expect(barcodeIds).toEqual([...EXPECTED_OFF_BARCODE_IDS].sort());
  });

  it('4 OFF label cases are scanMode label', () => {
    const manifest = loadManifest();
    const labelCases = manifest.cases.filter(
      (c) => c.source.dataset === 'open-food-facts' && c.scanMode === 'label',
    );
    const labelIds = labelCases.map((c) => c.source.objectId).sort();
    expect(labelIds).toEqual([...EXPECTED_OFF_LABEL_IDS].sort());
  });

  it('each OFF case declares expectedBarcode equal to its object ID', () => {
    const manifest = loadManifest();
    const offCases = manifest.cases.filter(
      (c) => c.source.dataset === 'open-food-facts',
    );
    for (const c of offCases) {
      const r = c as unknown as Record<string, unknown>;
      expect(r.expectedBarcode, `case ${c.id}`).toBe(c.source.objectId);
    }
  });

  it('barcode cases declare expectedDecision; the contradictory multipack 4056489686941 declares needs_review', () => {
    const manifest = loadManifest();
    const barcodeCases = manifest.cases.filter(
      (c) =>
        c.source.dataset === 'open-food-facts' && c.scanMode === 'barcode',
    );

    for (const c of barcodeCases) {
      const r = c as unknown as Record<string, unknown>;
      expect(r.expectedDecision, `case ${c.id}`).toBeDefined();
    }

    const multipack = barcodeCases.find(
      (c) => c.source.objectId === '4056489686941',
    );
    expect(multipack).toBeDefined();
    const mr = multipack! as unknown as Record<string, unknown>;
    expect(mr.expectedDecision).toBe('needs_review');
    expect(mr.packageUnitCount).toBe(6);
    expect(mr.unitAmount).toBe(330);
    expect(multipack!.truth.basis).toBe('package');
    expect(multipack!.truth.amount).toBe(1980);
    expect(multipack!.truth.unit).toBe('ml');
    expect(multipack!.truth.kcal).toBeCloseTo(19.8, 1);
    expect(multipack!.truth.proteinG).toBe(0);
    expect(multipack!.truth.carbsG).toBe(0);
    expect(multipack!.truth.fatG).toBe(0);

    for (const c of barcodeCases) {
      if (c.source.objectId === '4056489686941') continue;
      const r = c as unknown as Record<string, unknown>;
      expect(
        r.expectedDecision,
        `barcode case ${c.source.objectId}`,
      ).toBe('complete');
    }
  });

  it('label cases may declare expectedDecision needs_review (package amount may not be visible in the label image)', () => {
    const manifest = loadManifest();
    const labelCases = manifest.cases.filter(
      (c) =>
        c.source.dataset === 'open-food-facts' && c.scanMode === 'label',
    );
    for (const c of labelCases) {
      const r = c as unknown as Record<string, unknown>;
      expect(r.expectedDecision, `case ${c.id}`).toBeDefined();
      expect(
        ['complete', 'needs_review'],
        `label case ${c.source.objectId} decision`,
      ).toContain(r.expectedDecision);
    }
  });

  it('every case has an attributionId', () => {
    const manifest = loadManifest();
    for (const c of manifest.cases) {
      expect(c.attributionId).toBeTruthy();
    }
  });

  it('all attribution IDs referenced by cases are defined in ATTRIBUTION.md', () => {
    if (!existsSync(ATTRIBUTION_PATH)) {
      throw new Error(
        `ATTRIBUTION.md not found at ${ATTRIBUTION_PATH}. ` +
          'This file must be created as part of Task 2 Step 6.',
      );
    }
    const attrContent = readFileSync(ATTRIBUTION_PATH, 'utf-8');

    const manifest = loadManifest();
    const usedAttributionIds = [
      ...new Set(manifest.cases.map((c) => c.attributionId)),
    ];

    for (const required of REQUIRED_ATTRIBUTION_IDS) {
      expect(attrContent).toContain(required);
    }

    for (const attrId of usedAttributionIds) {
      expect(
        attrContent.includes(attrId),
        `Attribution ID "${attrId}" referenced in manifest but not found in ATTRIBUTION.md`,
      ).toBe(true);
    }
  });

  it('OFF snapshot files are required, parseable, and conform to the v3 minimal snapshot shape', () => {
    for (const offId of EXPECTED_OFF_IDS) {
      const snapshotPath = join(OFF_SNAPSHOTS_DIR, `${offId}.json`);
      expect(
        existsSync(snapshotPath),
        `Missing off-snapshot for OFF ID ${offId} at ${snapshotPath}`,
      ).toBe(true);

      const raw = readFileSync(snapshotPath, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      expect(
        Object.keys(parsed).sort(),
        `snapshot ${offId} must have exactly top-level status, result, product`,
      ).toEqual(['product', 'result', 'status']);

      expect(parsed.status, `snapshot ${offId} status`).toBe('success');

      const result = parsed.result as Record<string, unknown>;
      expect(typeof result).toBe('object');
      expect(result).not.toBeNull();
      expect(result.id, `snapshot ${offId} result.id`).toBe('product_found');

      const product = parsed.product as Record<string, unknown>;
      expect(typeof product).toBe('object');
      expect(product).not.toBeNull();

      expect(product.code, `snapshot ${offId} product.code`).toBe(offId);

      const productName = product.product_name as string | undefined;
      expect(productName, `snapshot ${offId} product.product_name`).toBeDefined();
      expect(
        typeof productName === 'string' && productName.length > 0,
        `snapshot ${offId} product.product_name must be nonempty`,
      ).toBe(true);

      const pq = product.quantity as string | undefined;
      expect(pq, `snapshot ${offId} product.quantity`).toBeDefined();
      expect(typeof pq === 'string' && pq.length > 0).toBe(true);

      const pqty = product.product_quantity as number | undefined;
      expect(pqty, `snapshot ${offId} product.product_quantity`).toBeDefined();
      expect(
        typeof pqty === 'number' && Number.isFinite(pqty) && pqty > 0,
        `snapshot ${offId} product.product_quantity must be a finite positive number`,
      ).toBe(true);

      const unit = product.product_quantity_unit as string | undefined;
      expect(unit, `snapshot ${offId} product.product_quantity_unit`).toBeDefined();
      expect(['g', 'ml']).toContain(unit);

      const nutriments = product.nutriments as Record<string, unknown> | undefined;
      expect(nutriments, `snapshot ${offId} product.nutriments`).toBeDefined();
      expect(typeof nutriments).toBe('object');
      expect(nutriments).not.toBeNull();

      for (const nutKey of [
        'energy-kcal_100g',
        'proteins_100g',
        'carbohydrates_100g',
        'fat_100g',
      ]) {
        const val = (nutriments as Record<string, unknown>)[nutKey];
        expect(
          typeof val === 'number' && Number.isFinite(val) && val >= 0,
          `snapshot ${offId} product.nutriments.${nutKey} must be a finite nonnegative number`,
        ).toBe(true);
      }

      if (typeof product.image_front_url === 'string') {
        expect(
          product.image_front_url,
          `snapshot ${offId} image_front_url must be HTTPS`,
        ).toMatch(/^https:\/\//);
      }
      if (typeof product.image_nutrition_url === 'string') {
        expect(
          product.image_nutrition_url,
          `snapshot ${offId} image_nutrition_url must be HTTPS`,
        ).toMatch(/^https:\/\//);
      }
    }
  });

  it('Nutrition5k cases all reference the official depth_test_ids dataset', () => {
    const manifest = loadManifest();
    const mealCases = manifest.cases.filter((c) => c.scanMode === 'meal');
    for (const c of mealCases) {
      expect(c.source.dataset).toBe('nutrition5k');
    }
  });

  it('no case references a local file path in its image', () => {
    const manifest = loadManifest();
    for (const c of manifest.cases) {
      expect(c.image).toHaveProperty('url');
      expect(c.image).not.toHaveProperty('path');
    }
  });

  it('all image URLs use HTTPS', () => {
    const manifest = loadManifest();
    for (const c of manifest.cases) {
      if ('url' in c.image) {
        expect(c.image.url).toMatch(/^https:\/\//);
      }
    }
  });

  it('no test performs network requests (default mode)', () => {
    const originalFetch = globalThis.fetch;
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
    try {
      const manifest = loadManifest();
      expect(manifest.cases.length).toBeGreaterThan(0);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // ── Opt-in live fetch integrity test ────────────────────────────────────────
  // Skipped by default. Enable with: RUN_NUTRITION_EVAL_FETCH=1 vitest run
  const runLiveFetch = process.env.RUN_NUTRITION_EVAL_FETCH === '1';
  const itLive = runLiveFetch ? it : it.skip;

  itLive('fetches and verifies all 20 public case images against their SHA-256', async () => {
    const cacheRoot = join(__dirname, '../../../.nutrition-eval/cache');
    const manifest = loadManifest();
    const originalFetch = globalThis.fetch;
    const fetchFn = (url: string) => originalFetch(url);
    for (const c of manifest.cases) {
      const bytes = await loadVerifiedCaseImage(c, { cacheRoot, fetchFn });
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBeGreaterThan(0);
    }
  }, 120_000);
});
