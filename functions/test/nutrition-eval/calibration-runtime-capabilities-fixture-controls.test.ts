/**
 * Independent native fixture control for the calibration runtime
 * capabilities harness (plan Task 1 Step 1/2,
 * `docs/superpowers/plans/2026-10-13-calibration-runtime-capabilities.md`).
 *
 * This file never imports `../../src/nutrition-eval/calibration-runtime-capabilities`
 * (the not-yet-authored source module) and must stay runnable and GREEN
 * before, during, and after that module's RED/GREEN cycle. It proves the
 * committed-asset harness itself: the pure planner's 50/158 arithmetic
 * (146 vision + 12 barcode at a selected profile), the four real OFF
 * products, that the harness's own dependency callbacks correctly thread
 * their arguments (independent of any runtime), and that merely building
 * the harness performs zero SDK/transport calls and zero capability-port
 * calls. A literal dynamic import of the runtime module inside the
 * *behavioral* test file may still be resolved during Vite/Vitest module
 * transformation, so filtering that same file is not an equivalent
 * independent control; this file's import graph never mentions the runtime
 * module's specifier at all.
 */
import { it, expect } from 'vitest';
import { buildRuntimeHarness } from './calibration-runtime-capabilities-fixtures';

it('fixture control: native committed plan and products', async () => {
  for (const profile of [undefined, 'LOW', 'MEDIUM'] as const) {
    const h = await buildRuntimeHarness(profile);
    expect(h.store.size).toBe(4);
    expect(h.plan).toHaveLength(profile === undefined ? 50 : 158);
    expect(h.plan.filter((r) => r.scanMode === 'barcode')).toHaveLength(profile === undefined ? 0 : 12);
    expect(h.plan.filter((r) => r.scanMode !== 'barcode')).toHaveLength(profile === undefined ? 50 : 146);
    expect(h.calls).toEqual([]);
    expect(h.witness.sdk).toBe(0);
    expect(h.witness.transport).toBe(0);
    expect(h.sdkCalls).toEqual([]);
  }
});

it('fixture control: all four committed OFF products resolve by barcode with real shape', async () => {
  const h = await buildRuntimeHarness('LOW');
  const barcodes = ['3017624010701', '5449000000996', '4056489686941', '7622210449283'];
  for (const barcode of barcodes) {
    const product = h.store.get(barcode);
    expect(product).toBeDefined();
    expect(typeof product?.name).toBe('string');
    expect(typeof product?.kcalPer100g).toBe('number');
    expect(typeof product?.proteinPer100g).toBe('number');
    expect(typeof product?.carbsPer100g).toBe('number');
    expect(typeof product?.fatPer100g).toBe('number');
  }
  expect(h.store.get('0000000000000')).toBeUndefined();
  // Reading the store directly here (not through a prepared capability) must
  // never route through the fake generateContent transport.
  expect(h.witness.sdk).toBe(0);
});

it('fixture control: each selected profile exposes exactly 12 barcode keys across the 4 committed cases', async () => {
  for (const profile of ['LOW', 'MEDIUM'] as const) {
    const h = await buildRuntimeHarness(profile);
    const barcodeKeys = h.plan.filter((r) => r.scanMode === 'barcode');
    expect(barcodeKeys).toHaveLength(12);
    const byCase = new Map<string, Set<number>>();
    for (const row of barcodeKeys) {
      expect(row.key.stage).toBe('benchmark');
      expect(row.key.profile).toBe(profile);
      let samples = byCase.get(row.key.caseId);
      if (samples === undefined) {
        samples = new Set();
        byCase.set(row.key.caseId, samples);
      }
      samples.add(row.key.sampleIndex);
    }
    expect(byCase.size).toBe(4);
    for (const samples of byCase.values()) {
      expect([...samples].sort()).toEqual([1, 2, 3]);
    }
  }
});

it('fixture control: the fake SDK client is wired but never invoked by harness construction alone', async () => {
  const h = await buildRuntimeHarness('MEDIUM');
  expect(typeof h.client.models.generateContent).toBe('function');
  expect(h.calls).toEqual([]);
  expect(h.witness).toEqual({ sdk: 0, transport: 0 });
});

it('fixture control: dependency callbacks thread their real arguments, independent of any runtime', async () => {
  const h = await buildRuntimeHarness('LOW');
  const key = h.plan[0]!.key;
  const bytes = await h.deps.loadImage(key);
  expect(bytes).toBeInstanceOf(Uint8Array);
  expect(h.capturedKeys.loadImageKeys).toEqual([key]);

  await h.deps.reserveImage(key);
  expect(h.capturedKeys.reserveImageKeys).toEqual([key]);

  h.deps.onModelVersion(key, 'fixture-model-v1');
  expect(h.capturedKeys.modelVersionCalls).toEqual([{ key, version: 'fixture-model-v1' }]);

  const product = h.deps.lookupSnapshot('3017624010701');
  expect(product).toBeDefined();
  expect(h.capturedKeys.snapshotBarcodes).toEqual(['3017624010701']);

  expect(h.calls).toEqual(['image', 'reserve', 'metadata', 'snapshot']);
  expect(h.witness.sdk).toBe(0);
});

it('fixture control: independently parsed case metadata matches the committed manifests (png meals, jpeg barcodes/labels)', async () => {
  const h = await buildRuntimeHarness('LOW');
  // 40 calibration-manifest cases ("calibration-dish_*") plus 20 public
  // manifest cases ("n5k-dish_*" meal / "off-*" barcode+label) never share
  // an id namespace, so the map holds their full union, not an overlap.
  expect(h.caseMetadata.size).toBe(60);
  let pngCount = 0;
  let jpegCount = 0;
  let barcodeCount = 0;
  for (const [, meta] of h.caseMetadata) {
    if (meta.mediaType === 'image/png') pngCount++;
    else if (meta.mediaType === 'image/jpeg') jpegCount++;
    else throw new Error(`unexpected mediaType: ${meta.mediaType}`);
    if (meta.barcode !== undefined) barcodeCount++;
  }
  expect(pngCount + jpegCount).toBe(h.caseMetadata.size);
  // 40 calibration-manifest cases (24 development + 16 validation, all png)
  // + 12 public meal cases (png) = 52 png; 4 barcode + 4 label (jpeg) = 8.
  expect(pngCount).toBe(52);
  expect(jpegCount).toBe(8);
  expect(barcodeCount).toBe(4);
  const firstDevKey = h.plan.find((r) => r.key.stage === 'development')!.key;
  expect(h.caseMetadata.get(firstDevKey.caseId)?.mediaType).toBe('image/png');
  expect(h.caseMetadata.get('off-3017624010701')).toEqual({ mediaType: 'image/jpeg', barcode: '3017624010701' });
  expect(h.caseMetadata.get('off-5449000000996')?.barcode).toBe('5449000000996');
  expect(h.caseMetadata.get('off-4056489686941')?.barcode).toBe('4056489686941');
  expect(h.caseMetadata.get('off-7622210449283')?.barcode).toBe('7622210449283');
  const firstLabelCase = [...h.caseMetadata.entries()].find(([id]) => id.startsWith('off-') && id !== 'off-3017624010701' && id !== 'off-5449000000996' && id !== 'off-4056489686941' && id !== 'off-7622210449283');
  expect(firstLabelCase?.[1].mediaType).toBe('image/jpeg');
});
