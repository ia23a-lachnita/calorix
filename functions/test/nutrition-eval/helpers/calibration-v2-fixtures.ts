import { createHash } from 'node:crypto';

// Independent test fixtures for the strict calibration v2 manifest. These
// are literal goldens built by hand/Node crypto, never by calling the
// schema/hash/serializer under test.

const CALIBRATION_V2_BASE_URL = 'https://storage.googleapis.com/nutrition5k_dataset/nutrition5k_dataset/';
const CALIBRATION_V2_ATTRIBUTION_ID = 'nutrition5k-cc-by-4.0';
const CALIBRATION_V2_RANK_PREFIX = 'calorix-n5k-calibration-v2:';

// Exact pinned slot-ordered (componentBin, calorieBin, macroBin) schedule
// tuples for all 40 slots: slots 0-23 are development, slots 24-39 are
// validation. Copied verbatim as a literal golden from the existing fixed
// schedule used by the v1 strict manifest schema.
const CALIBRATION_V2_SCHEDULE_STRATA: ReadonlyArray<readonly [0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2]> = [
  [0, 0, 0], [1, 1, 1], [2, 2, 2],
  [0, 0, 0], [1, 1, 2], [2, 2, 1],
  [0, 0, 1], [1, 1, 0], [2, 2, 2],
  [0, 0, 1], [1, 1, 2], [2, 2, 0],
  [0, 0, 2], [1, 1, 0], [2, 2, 1],
  [0, 0, 2], [1, 1, 1], [2, 2, 0],
  [0, 1, 1], [1, 0, 2], [2, 2, 0],
  [0, 2, 2], [1, 0, 1], [2, 1, 0],
  [0, 0, 0], [1, 2, 2], [2, 1, 1],
  [0, 0, 1], [1, 2, 2], [2, 1, 0],
  [0, 1, 0], [1, 0, 1], [2, 2, 2],
  [0, 1, 0], [1, 0, 2], [2, 2, 1],
  [0, 1, 2], [1, 0, 1], [2, 2, 0],
  [0, 2, 1],
];

if (CALIBRATION_V2_SCHEDULE_STRATA.length !== 40) {
  throw new Error('calibration-v2 fixture schedule must have exactly 40 slot-ordered tuples');
}

function expectedCalibrationRankV2(dishId: string): string {
  return createHash('sha256').update(`${CALIBRATION_V2_RANK_PREFIX}${dishId}`).digest('hex');
}

function buildCalibrationV2Case(slotIndex: number): Record<string, unknown> {
  const dishId = `dish_9${String(slotIndex).padStart(9, '0')}`;
  const imageSha256 = createHash('sha256').update(`image:${dishId}`).digest('hex');
  const stratum = CALIBRATION_V2_SCHEDULE_STRATA[slotIndex]!;

  return {
    id: `calibration-${dishId}`,
    visibility: 'public',
    scanMode: 'meal',
    source: { dataset: 'nutrition5k', objectId: dishId },
    image: {
      url: `${CALIBRATION_V2_BASE_URL}imagery/realsense_overhead/${dishId}/rgb.png`,
      sha256: imageSha256,
      mediaType: 'image/png',
      width: 640,
      height: 480,
    },
    truth: {
      basis: 'portion',
      amount: 1,
      unit: 'portion',
      kcal: 100 + slotIndex,
      proteinG: 5,
      carbsG: 10,
      fatG: 2,
      referenceMassG: 150,
    },
    toleranceClass: 'meal-estimate',
    attributionId: CALIBRATION_V2_ATTRIBUTION_ID,
    group: slotIndex < 24 ? 'development' : 'validation',
    stratum: { componentBin: stratum[0], calorieBin: stratum[1], macroBin: stratum[2] },
    rank: expectedCalibrationRankV2(dishId),
    slotIndex,
  };
}

export const CALIBRATION_V2_SOURCE_LOCK_HASH = 'a'.repeat(64);

export const CALIBRATION_V2_MANIFEST_CASES: ReadonlyArray<Record<string, unknown>> = Array.from(
  { length: 40 },
  (_unused, slotIndex) => buildCalibrationV2Case(slotIndex),
);

if (CALIBRATION_V2_MANIFEST_CASES.length !== 40) {
  throw new Error('calibration-v2 fixture cases must have exactly 40 entries (24 development + 16 validation)');
}
