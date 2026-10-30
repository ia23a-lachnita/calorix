import { createHash } from 'node:crypto';
import type { EligibleDish, VerifiedCalibrationImage } from '../../../src/nutrition-eval/calibration-corpus';
import type {
  QualityAudit, QualityAuditContext, QualityDecisionInput, QualityPhoto,
} from '../../../src/nutrition-eval/calibration-corpus-quality-audit';

// Independent fixed input/goldens; these helpers never invoke audit producers.
export const QUALITY_GOLDEN_IDS = [
  'dish_9001000003', 'dish_9001111002', 'dish_9001222003', 'dish_9001000004',
  'dish_9001112001', 'dish_9001221000', 'dish_9001001001', 'dish_9001110003',
  'dish_9001222001', 'dish_9001001004', 'dish_9001112002', 'dish_9001220003',
  'dish_9001002001', 'dish_9001110004', 'dish_9001221001', 'dish_9001002002',
  'dish_9001111004', 'dish_9001220002', 'dish_9001011002', 'dish_9001102000',
  'dish_9001220004', 'dish_9001022001', 'dish_9001101002', 'dish_9001210001',
  'dish_9001000001', 'dish_9001122004', 'dish_9001211001', 'dish_9001001000',
  'dish_9001122001', 'dish_9001210004', 'dish_9001010003', 'dish_9001101004',
  'dish_9001222004', 'dish_9001010000', 'dish_9001102004', 'dish_9001221004',
  'dish_9001012000', 'dish_9001101000', 'dish_9001220000', 'dish_9001021002',
];

export function qualityContextFixture(): QualityAuditContext {
  const eligible: EligibleDish[] = [];
  for (const componentBin of [0, 1, 2] as const) for (const calorieBin of [0, 1, 2] as const) {
    for (const macroBin of [0, 1, 2] as const) for (let i = 0; i < 5; i += 1) eligible.push({
      dishId: `dish_${9001000000 + componentBin * 100000 + calorieBin * 10000 + macroBin * 1000 + i}`,
      componentBin, calorieBin, macroBin, totalMass: 100,
      totalCalories: [100, 250, 500][calorieBin]!, totalProtein: macroBin === 0 ? 20 : 1,
      totalCarb: macroBin === 1 ? 20 : 1, totalFat: macroBin === 2 ? 20 : 1,
    });
  }
  const quarantineIds = Array.from({ length: 52 }, (_, i) => `dish_${8000000000 + i}`);
  return {
    pool: { eligible, excluded: [], quarantineIds,
      sourceDigests: { cafe1: '1'.repeat(64), cafe2: '2'.repeat(64), trainSplit: '3'.repeat(64),
        vocabulary: '4'.repeat(64), v1Manifest: '5'.repeat(64) },
      quarantineDigest: createHash('sha256').update(JSON.stringify(quarantineIds)).digest('hex') },
    sourceLockSha256: 'c'.repeat(64),
    codeCheckpoint: { implementationCommit: 'a'.repeat(40), functionsTreeId: 'b'.repeat(40) },
    ingredientsByDish: new Map(eligible.map(row => [row.dishId,
      Array.from({ length: row.componentBin + 1 }, (_, index) => ({
        ingredientId: `ingr_${String([54, 1, 2][index]).padStart(10, '0')}`,
        sourceName: index === 0 ? '' : `fixture_${index}`, vocabularyName: `fixture_label_${index}`,
      })),
    ])),
  };
}

export function qualityImageMetaFixture(id: string): VerifiedCalibrationImage {
  return { sha256: createHash('sha256').update('fixture-photo:' + id).digest('hex'),
    width: 640, height: 480, mediaType: 'image/png' };
}

export function qualityPhotoFixture(context: QualityAuditContext, id: string): QualityPhoto {
  const slotIndex = QUALITY_GOLDEN_IDS.indexOf(id);
  return {
    dish: { ...context.pool.eligible.find(row => row.dishId === id)! },
    ingredients: context.ingredientsByDish.get(id)!.map(row => ({ ...row })),
    image: { ...qualityImageMetaFixture(id),
      url: `https://storage.googleapis.com/nutrition5k_dataset/nutrition5k_dataset/imagery/realsense_overhead/${id}/rgb.png` },
    rank: createHash('sha256').update('calorix-n5k-calibration-v2:' + id).digest('hex'),
    consideredSlot: { dishId: id, slotIndex, group: slotIndex < 24 ? 'development' : 'validation' },
    considerationSequence: slotIndex + 1, afterDecisionSequence: 0,
  };
}

export function qualityPassInput(id: string): QualityDecisionInput {
  return { dishId: id, imageSha: qualityImageMetaFixture(id).sha256, verdict: 'pass',
    reviewer: 'fixture-operator', note: 'Synthetic test disposition, not a real photo inspection.',
    at: '2026-10-29T00:00:00.000Z' };
}

export function qualityDraftFixture(context = qualityContextFixture()): QualityAudit {
  return {
    candidateId: 'calorix-n5k-quality-candidate-v2', checklistVersion: 'single-container-v1',
    status: 'draft', modelRequests: 0,
    identity: { codeCheckpoint: { ...context.codeCheckpoint }, sourceLockSha256: context.sourceLockSha256,
      sourceDigests: { ...context.pool.sourceDigests }, quarantineDigest: context.pool.quarantineDigest },
    quarantineIds: [...context.pool.quarantineIds], excluded: context.pool.excluded.map(row => ({ ...row })),
    photos: [], skipped: [], decisions: [],
    selection: QUALITY_GOLDEN_IDS.map((dishId, slotIndex) => ({ dishId, slotIndex,
      group: slotIndex < 24 ? 'development' : 'validation' })),
  };
}

export function qualityReadyFixture(context = qualityContextFixture()): QualityAudit {
  const audit = qualityDraftFixture(context);
  audit.photos = QUALITY_GOLDEN_IDS.map(id => qualityPhotoFixture(context, id));
  audit.decisions = QUALITY_GOLDEN_IDS.map((id, index) => ({ ...qualityPassInput(id),
    sequence: index + 1, checklistVersion: 'single-container-v1' }));
  return audit;
}
