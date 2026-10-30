import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { QualitySourceBundle } from '../../../src/nutrition-eval/calibration-corpus-quality-policy';
import { QUALITY_GOLDEN_IDS, qualityContextFixture, qualityReadyFixture } from './corpus-quality-fixtures';

// Independent, synthetic source/decision fixtures. No admission/audit producer,
// manifest serializer, source-pool builder or expected-value generator is used.
export const admissionSha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
export const admissionJsonBytes = (value: unknown): Uint8Array => Buffer.from(JSON.stringify(value));
export const PRIOR_EVIDENCE_PATHS = [
  'ledger.json', 'journal.json', 'lock.json',
  'reports/development-low.md', 'reports/development-medium.md',
  'reports/preflight-medium.md', 'reports/preflight-medium.json',
  'reports/preflight-low.md', 'reports/preflight-low.json',
  'reports/development-medium.json', 'reports/development-low.json',
] as const;
const benchmarkIds = [
  'dish_1558549605', 'dish_1558639787', 'dish_1558639818', 'dish_1560456326',
  'dish_1561663580', 'dish_1562788601', 'dish_1564427430', 'dish_1565035746',
  'dish_1565898402', 'dish_1566328724', 'dish_1566838351', 'dish_1567107839',
];
const baseUrl = 'https://storage.googleapis.com/nutrition5k_dataset/nutrition5k_dataset/';

function imageBytes(id: string): Uint8Array {
  // A parser-level PNG header fixture, not a decoded or visually audited image.
  const bytes = Buffer.alloc(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  bytes.writeUInt32BE(640, 16); bytes.writeUInt32BE(480, 20);
  return Buffer.concat([bytes, Buffer.from(id)]);
}

export function admissionFixture() {
  const context = qualityContextFixture();
  const rows = context.pool.eligible.map(row => {
    const refs = context.ingredientsByDish.get(row.dishId)!;
    return [row.dishId, row.totalCalories, row.totalMass, row.totalFat, row.totalCarb, row.totalProtein,
      ...refs.flatMap(ref => [ref.ingredientId, ref.sourceName, 100 / refs.length,
        row.totalCalories / refs.length, row.totalFat / refs.length,
        row.totalCarb / refs.length, row.totalProtein / refs.length])].join(',');
  });
  const bundle: QualitySourceBundle = {
    cafe1: Buffer.from(rows.slice(0, 100).join('\n') + '\n'),
    cafe2: Buffer.from(rows.slice(100).join('\n') + '\n'),
    trainSplit: Buffer.from(context.pool.eligible.map(row => row.dishId).join('\n') + '\n'),
    vocabulary: Buffer.from('ingr,id,cal/g,fat(g),carb(g),protein(g)\n' +
      'fixture_label_0,54,1,0,0,0\nfixture_label_1,1,1,0,0,0\nfixture_label_2,2,1,0,0,0\n'),
    v1Manifest: new Uint8Array(readFileSync(new URL('../../../eval/nutrition/calibration-manifest.json', import.meta.url))),
  };
  const pin = (bytes: Uint8Array) => ({ byteLength: bytes.length, sha256: admissionSha(bytes) });
  const corpusLock = {
    candidateId: 'calorix-n5k-quality-candidate-v2', rankPrefix: 'calorix-n5k-calibration-v2:',
    checklistVersion: 'single-container-v1',
    sources: Object.fromEntries(([
      ['metadataCafe1', 'cafe1', 'metadata/dish_metadata_cafe1.csv'],
      ['metadataCafe2', 'cafe2', 'metadata/dish_metadata_cafe2.csv'],
      ['trainSplit', 'trainSplit', 'dish_ids/splits/rgb_train_ids.txt'],
      ['vocabulary', 'vocabulary', 'metadata/ingredients_metadata.csv'],
    ] as const).map(([key, field, path]) => [key, { ...pin(bundle[field]), path, url: baseUrl + path }])),
    v1Manifest: { ...pin(bundle.v1Manifest), path: 'functions/eval/nutrition/calibration-manifest.json' },
  };
  const corpusLockBytes = admissionJsonBytes(corpusLock);
  context.sourceLockSha256 = admissionSha(corpusLockBytes);
  context.pool.sourceDigests = Object.fromEntries(Object.entries(bundle).map(([key, bytes]) => [key, admissionSha(bytes)])) as typeof context.pool.sourceDigests;
  const oldIds = JSON.parse(Buffer.from(bundle.v1Manifest).toString('utf8')).cases
    .map((row: { source: { objectId: string } }) => row.source.objectId) as string[];
  context.pool.quarantineIds = [...oldIds, ...benchmarkIds].sort();
  context.pool.quarantineDigest = admissionSha(admissionJsonBytes(context.pool.quarantineIds));
  const audit = qualityReadyFixture(context);
  const images = new Map<string, Uint8Array>();
  for (const photo of audit.photos) {
    const bytes = imageBytes(photo.dish.dishId); const hash = admissionSha(bytes);
    images.set(hash, bytes); photo.image.sha256 = hash;
    audit.decisions.find(row => row.dishId === photo.dish.dishId)!.imageSha = hash;
  }
  // Reject the first considered photo; same-stratum rank order shifts slots
  // 0,3,24 to the next three literal goldens. Preserve the rejected photo.
  audit.decisions[0] = { ...audit.decisions[0]!, verdict: 'reject', reason: 'qc_uncertain' };
  const replacementId = 'dish_9001000000';
  const replacementBytes = imageBytes(replacementId); const replacementSha = admissionSha(replacementBytes);
  images.set(replacementSha, replacementBytes);
  audit.photos.push({
    dish: { ...context.pool.eligible.find(row => row.dishId === replacementId)! },
    ingredients: context.ingredientsByDish.get(replacementId)!.map(row => ({ ...row })),
    image: { sha256: replacementSha, width: 640, height: 480, mediaType: 'image/png',
      url: baseUrl + 'imagery/realsense_overhead/' + replacementId + '/rgb.png' },
    rank: admissionSha(Buffer.from('calorix-n5k-calibration-v2:' + replacementId)),
    consideredSlot: { dishId: replacementId, slotIndex: 24, group: 'validation' },
    considerationSequence: 41, afterDecisionSequence: 40,
  });
  audit.decisions.push({ sequence: 41, checklistVersion: 'single-container-v1', dishId: replacementId,
    imageSha: replacementSha, verdict: 'pass', reviewer: 'fixture-operator',
    note: 'Synthetic disposition only.', at: '2026-10-29T00:00:00.000Z' });
  const finalIds = [...QUALITY_GOLDEN_IDS];
  finalIds[0] = 'dish_9001000004'; finalIds[3] = 'dish_9001000001'; finalIds[24] = replacementId;
  audit.selection = finalIds.map((dishId, slotIndex) => ({ dishId, slotIndex,
    group: slotIndex < 24 ? 'development' : 'validation' }));
  audit.status = 'finalized';
  const priorEvidence = new Map(PRIOR_EVIDENCE_PATHS.map(path => [path, Buffer.from('fixture prior evidence:' + path)]));
  const lock = {
    version: 1, protocolVersion: 'calorix-gemini-38-calibration-v2', ledgerProtocolVersion: 'v2',
    candidate: { candidateId: 'calorix-n5k-quality-candidate-v2', checklistVersion: 'single-container-v1',
      rawSha256: admissionSha(admissionJsonBytes(audit)), producer: { ...context.codeCheckpoint },
      corpusLockRawSha256: admissionSha(corpusLockBytes), quarantineDigest: context.pool.quarantineDigest },
    shared: { publicManifestHash: '1'.repeat(64), promptHash: '2'.repeat(64), responseSchemaHash: '3'.repeat(64),
      offLockRawSha256: '4'.repeat(64), historicalReferenceRawSha256: '5'.repeat(64) },
    prior: { root: '.nutrition-eval/calibration/calorix-gemini-38-calibration-v1/',
      protocolVersion: 'calorix-gemini-38-calibration-v1', imageReservations: 50, tokenReservations: 1,
      evidenceSha256: Object.fromEntries([...priorEvidence].map(([key, bytes]) => [key, admissionSha(bytes)])) },
    route: { provider: 'vertex-ai', project: 'calorix-xurschnell', location: 'us', model: 'gemini-3.8-flash',
      apiVersion: 'v1', httpTimeoutMs: 30_000 },
    budget: { priorImageReservations: 50, plannedImageCalls: 146, hardImageCeiling: 146,
      tokenCountCalls: 1, workstreamImageCeiling: 196, containmentImageCeiling: 300 },
  };
  const activationLockBytes = admissionJsonBytes(lock);
  const input = { activationLockBytes, expectedActivationLockSha256: admissionSha(activationLockBytes),
    candidateBytes: admissionJsonBytes(audit), corpusLockBytes, bundle, images, priorEvidence };
  const expectedManifest = { version: 2, datasetId: 'calorix-n5k-calibration-v2',
    sourceLockHash: input.expectedActivationLockSha256,
    cases: finalIds.map((id, slotIndex) => {
      const row = context.pool.eligible.find(dish => dish.dishId === id)!;
      const photo = audit.photos.find(item => item.dish.dishId === id)!;
      return { id: 'calibration-' + id, visibility: 'public', scanMode: 'meal',
        source: { dataset: 'nutrition5k', objectId: id }, image: { ...photo.image },
        truth: { basis: 'portion', amount: 1, unit: 'portion', kcal: row.totalCalories,
          proteinG: row.totalProtein, carbsG: row.totalCarb, fatG: row.totalFat, referenceMassG: row.totalMass },
        toleranceClass: 'meal-estimate', attributionId: 'nutrition5k-cc-by-4.0',
        group: slotIndex < 24 ? 'development' : 'validation',
        stratum: { componentBin: row.componentBin, calorieBin: row.calorieBin, macroBin: row.macroBin },
        rank: admissionSha(Buffer.from('calorix-n5k-calibration-v2:' + id)), slotIndex };
    }) };
  return { input, lock, audit, context, corpusLock, expectedManifest };
}

export function repinFixture(fixture: ReturnType<typeof admissionFixture>): void {
  fixture.input.candidateBytes = admissionJsonBytes(fixture.audit);
  fixture.input.corpusLockBytes = admissionJsonBytes(fixture.corpusLock);
  fixture.lock.candidate.rawSha256 = admissionSha(fixture.input.candidateBytes);
  fixture.lock.candidate.corpusLockRawSha256 = admissionSha(fixture.input.corpusLockBytes);
  fixture.input.activationLockBytes = admissionJsonBytes(fixture.lock);
  fixture.input.expectedActivationLockSha256 = admissionSha(fixture.input.activationLockBytes);
}

export function invalidSkipFixture() {
  const fixture = admissionFixture(); const { audit, input } = fixture;
  // Skip the first replacement after the forty original considerations and
  // their forty decisions; then consider the next literal rank in slot24.
  const skipped = audit.photos.pop()!;
  audit.decisions.pop();
  const badBytes = Buffer.from('synthetic invalid PNG'); const imageSha = admissionSha(badBytes);
  input.images.set(imageSha, badBytes);
  audit.skipped.push({ dishId: skipped.dish.dishId, reason: 'invalid_signature', imageSha,
    rank: skipped.rank, consideredSlot: skipped.consideredSlot,
    considerationSequence: 41, afterDecisionSequence: 40 });
  const id = 'dish_9001000002'; const bytes = imageBytes(id); const hash = admissionSha(bytes);
  input.images.set(hash, bytes);
  audit.photos.push({ dish: { ...fixture.context.pool.eligible.find(row => row.dishId === id)! },
    ingredients: fixture.context.ingredientsByDish.get(id)!.map(row => ({ ...row })),
    image: { sha256: hash, width: 640, height: 480, mediaType: 'image/png',
      url: baseUrl + 'imagery/realsense_overhead/' + id + '/rgb.png' },
    rank: admissionSha(Buffer.from('calorix-n5k-calibration-v2:' + id)),
    consideredSlot: { dishId: id, slotIndex: 24, group: 'validation' },
    considerationSequence: 42, afterDecisionSequence: 40 });
  audit.decisions.push({ sequence: 41, checklistVersion: 'single-container-v1', dishId: id,
    imageSha: hash, verdict: 'pass', reviewer: 'fixture-operator',
    note: 'Synthetic disposition only.', at: '2026-10-29T00:00:00.000Z' });
  audit.selection![24]!.dishId = id;
  repinFixture(fixture);
  return fixture;
}

export function canonicalFixtureJson(value: unknown): string {
  // Independent test-only ordering, never the production canonicalizer.
  const ordered = (_key: string, item: unknown): unknown => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item;
  return JSON.stringify(value, ordered);
}

