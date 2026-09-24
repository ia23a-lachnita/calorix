import { createHash } from 'crypto';
import { describe, expect, it, vi } from 'vitest';

// These imports fail until functions/src/nutrition-eval/calibration-corpus.ts
// exists (Task 4 Step 3+). This is the intended RED for this file: a single
// module-resolution failure, not per-test logic failures. Every test below is
// hermetic (in-memory fixtures only) and performs no network/model/Firebase/
// device access.
import {
  CALIBRATION_SOURCE_PATHS,
  DEVELOPMENT_SLOT_SCHEDULE,
  FROZEN_PUBLIC_MANIFEST_DISH_IDS,
  NUTRITION5K_BASE_URL,
  VALIDATION_SLOT_SCHEDULE,
  buildCheckImage,
  buildEligibleDishes,
  buildOverheadImageUrl,
  buildSourceUrl,
  calorieBinOf,
  componentBinOf,
  fillCalibrationSlots,
  fillCalibrationSlotsWithImageVerification,
  macroDominanceBinOf,
  mergeDishMetadata,
  parseAndVerifySource,
  parseDishMetadataCsv,
  parseTrainSplit,
  pinCalibrationCorpus,
  rankHash,
  resolveCalibrationCorpusRuntimePaths,
  runCalibrationCorpusCli,
  selectCalibrationCorpus,
  verifyOverheadImage,
  verifyPinnedSourceBytes,
  verifyCalibrationCorpus,
} from '../../src/nutrition-eval/calibration-corpus';
import { hashCalibrationSourceLock } from '../../src/nutrition-eval/schema';
import type {
  CheckImageFn,
  EligibleDish,
} from '../../src/nutrition-eval/calibration-corpus';

// ── Shared helpers ────────────────────────────────────────────────────────────

const RANK_PREFIX = 'calorix-n5k-calibration-v1:';

function localRankHash(dishId: string): string {
  return createHash('sha256').update(`${RANK_PREFIX}${dishId}`).digest('hex');
}

function byLocalRank(a: string, b: string): number {
  const ha = localRankHash(a);
  const hb = localRankHash(b);
  if (ha < hb) return -1;
  if (ha > hb) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function dish(
  dishId: string,
  componentBin: 0 | 1 | 2,
  calorieBin: 0 | 1 | 2,
  macroBin: 0 | 1 | 2,
): EligibleDish {
  return {
    dishId,
    componentBin,
    calorieBin,
    macroBin,
    totalCalories: 200,
    totalMass: 150,
    totalFat: 5,
    totalCarb: 20,
    totalProtein: 10,
  };
}

// ── PNG byte fixtures (mirrors test/nutrition-eval/assets.test.ts) ────────────

const BASE_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // signature
  0x00, 0x00, 0x00, 0x0d, // IHDR length
  0x49, 0x48, 0x44, 0x52, // "IHDR"
  0x00, 0x00, 0x00, 0x01, // width: 1 (patched per-test)
  0x00, 0x00, 0x00, 0x01, // height: 1 (patched per-test)
  0x08, 0x06, 0x00, 0x00, 0x00, // bit depth, color type, compression, filter, interlace
  0x1f, 0x15, 0xc4, 0x89, // CRC (not re-validated by inspectImage)
]);

function buildPngBytes(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(BASE_PNG);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

const MINIMAL_JPEG_BYTES = new Uint8Array([
  0xff, 0xd8, // SOI
  0xff, 0xc0, // SOF0
  0x00, 0x0b, // segment length = 11
  0x08, // precision
  0x00, 0x01, // height = 1
  0x00, 0x01, // width = 1
  0x01, // number of components
  0x11, 0x00,
]);

// ── Source lock: exact paths and hash-before-parse ordering ───────────────────

describe('calibration source lock: exact paths and URL construction', () => {
  it('pins the exact official base URL and three source paths', () => {
    expect(NUTRITION5K_BASE_URL).toBe(
      'https://storage.googleapis.com/nutrition5k_dataset/nutrition5k_dataset/',
    );
    expect(CALIBRATION_SOURCE_PATHS).toEqual({
      trainSplit: 'dish_ids/splits/rgb_train_ids.txt',
      metadataCafe1: 'metadata/dish_metadata_cafe1.csv',
      metadataCafe2: 'metadata/dish_metadata_cafe2.csv',
    });
  });

  it('builds the exact source URL from base + path', () => {
    expect(buildSourceUrl(CALIBRATION_SOURCE_PATHS.trainSplit)).toBe(
      'https://storage.googleapis.com/nutrition5k_dataset/nutrition5k_dataset/dish_ids/splits/rgb_train_ids.txt',
    );
    expect(buildSourceUrl(CALIBRATION_SOURCE_PATHS.metadataCafe1)).toBe(
      'https://storage.googleapis.com/nutrition5k_dataset/nutrition5k_dataset/metadata/dish_metadata_cafe1.csv',
    );
  });

  it('builds the exact overhead rgb.png URL for a dish', () => {
    expect(buildOverheadImageUrl('dish_1565035746')).toBe(
      'https://storage.googleapis.com/nutrition5k_dataset/nutrition5k_dataset/imagery/realsense_overhead/dish_1565035746/rgb.png',
    );
  });
});

describe('verifyPinnedSourceBytes / parseAndVerifySource: hash-before-parse', () => {
  const bytes = new TextEncoder().encode('dish_1\ndish_2\n');
  const correctExpected = {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    byteLength: bytes.length,
  };

  it('accepts bytes whose sha256 and byte length match exactly', () => {
    expect(() => verifyPinnedSourceBytes(bytes, correctExpected)).not.toThrow();
  });

  it('rejects a sha256 mismatch even when byte length matches', () => {
    expect(() =>
      verifyPinnedSourceBytes(bytes, { ...correctExpected, sha256: 'f'.repeat(64) }),
    ).toThrow();
  });

  it('rejects a byte-length mismatch even when the hash happens to be requested correctly', () => {
    expect(() =>
      verifyPinnedSourceBytes(bytes, { ...correctExpected, byteLength: correctExpected.byteLength + 1 }),
    ).toThrow();
  });

  it('never invokes the parser when the hash check fails (verification strictly precedes parsing)', () => {
    const parseSpy = vi.fn((text: string) => text.split('\n'));
    expect(() =>
      parseAndVerifySource(bytes, { ...correctExpected, sha256: 'f'.repeat(64) }, parseSpy),
    ).toThrow();
    expect(parseSpy).not.toHaveBeenCalled();
  });

  it('invokes the parser exactly once, after verification succeeds', () => {
    const parseSpy = vi.fn((text: string) => text.trim().split('\n'));
    const result = parseAndVerifySource(bytes, correctExpected, parseSpy);
    expect(parseSpy).toHaveBeenCalledTimes(1);
    expect(result).toEqual(['dish_1', 'dish_2']);
  });
});

// ── Train split parsing ─────────────────────────────────────────────────────

describe('parseTrainSplit', () => {
  it('parses trimmed unique dish_[0-9]+ IDs, ignoring blank lines', () => {
    const text = 'dish_100\n  dish_200  \n\ndish_300\n';
    expect(parseTrainSplit(text)).toEqual(['dish_100', 'dish_200', 'dish_300']);
  });

  it('rejects a duplicate nonblank ID', () => {
    expect(() => parseTrainSplit('dish_100\ndish_200\ndish_100\n')).toThrow(/duplicate/i);
    // Whitespace-only variation of the same ID is still a duplicate once trimmed.
    expect(() => parseTrainSplit('dish_100\n  dish_100  \n')).toThrow(/duplicate/i);
  });

  it('fails closed on a non-matching (format-drift) line', () => {
    expect(() => parseTrainSplit('dish_100\nbanana_123\n')).toThrow();
    expect(() => parseTrainSplit('dish_100\ndish_abc\n')).toThrow();
  });
});

// ── RFC 4180 dish-metadata CSV parsing ──────────────────────────────────────

describe('parseDishMetadataCsv: RFC 4180 quoting and 6+7 field derivation', () => {
  const twoIngredientRow =
    'dish_5100000001,100,50,2,10,5,' +
    'ingr_a1,"Rice, cooked",30,60,0.5,8,1.5,' +
    'ingr_a2,"Chicken ""breast""",20,40,1.5,2,3.5';
  const oneIngredientRow = 'dish_5100000002,200,80,10,20,15,ingr_b1,Salad,80,200,10,20,15';

  it('parses quoted fields with embedded commas and doubled (escaped) quotes', () => {
    const [row] = parseDishMetadataCsv(twoIngredientRow);
    expect(row).toBeDefined();
    expect(row!.dishId).toBe('dish_5100000001');
    expect(row!.totalCalories).toBe(100);
    expect(row!.totalMass).toBe(50);
    expect(row!.totalFat).toBe(2);
    expect(row!.totalCarb).toBe(10);
    expect(row!.totalProtein).toBe(5);
    expect(row!.ingredients).toEqual([
      { ingredientId: 'ingr_a1', name: 'Rice, cooked', grams: 30, calories: 60, fat: 0.5, carb: 8, protein: 1.5 },
      { ingredientId: 'ingr_a2', name: 'Chicken "breast"', grams: 20, calories: 40, fat: 1.5, carb: 2, protein: 3.5 },
    ]);
  });

  it('derives component count exactly as (columnCount - 6) / 7', () => {
    const rows = parseDishMetadataCsv(`${twoIngredientRow}\n${oneIngredientRow}`);
    expect(rows[0]!.ingredients).toHaveLength(2);
    expect(rows[1]!.ingredients).toHaveLength(1);
  });

  it('rejects a row with zero ingredient groups (component count not a positive integer)', () => {
    expect(() => parseDishMetadataCsv('dish_5100000003,100,50,2,10,5')).toThrow();
  });

  it('rejects a row whose trailing column count is not a multiple of 7 (format drift)', () => {
    // 6 fixed fields + 8 trailing fields: (8) / 7 is not an integer.
    const drifted = 'dish_5100000004,100,50,2,10,5,ingr_c1,Bread,40,120,2,20,4,extra';
    expect(() => parseDishMetadataCsv(drifted)).toThrow();
  });

  it('rejects duplicate dish IDs within one CSV text', () => {
    expect(() => parseDishMetadataCsv(`${twoIngredientRow}\n${twoIngredientRow}`)).toThrow(/duplicate/i);
  });

  it('rejects a malformed (non-finite) numeric field', () => {
    const malformed = 'dish_5100000005,abc,50,2,10,5,ingr_d1,Toast,10,20,1,2,1';
    expect(() => parseDishMetadataCsv(malformed)).toThrow();
  });

  it('rejects a quote character starting mid-way through an already-started unquoted field', () => {
    const bad = 'dish_5100000020,100,50,2,10,5,ingr_g1,Bre"ad,10,20,1,2,1';
    expect(() => parseDishMetadataCsv(bad)).toThrow();
  });

  it('rejects trailing characters appearing after a closing quote, before the next delimiter', () => {
    const bad = 'dish_5100000021,100,50,2,10,5,ingr_g1,"Bread"stuff,10,20,1,2,1';
    expect(() => parseDishMetadataCsv(bad)).toThrow();
  });

  it('rejects an empty numeric string instead of silently coercing it to zero', () => {
    // total_fat is empty; an empty string would otherwise coerce to 0, which
    // passes the nonnegative check and must not be silently accepted.
    const bad = 'dish_5100000022,100,50,,10,5,ingr_g1,Bread,10,20,1,2,1';
    expect(() => parseDishMetadataCsv(bad)).toThrow();
  });

  it.each([
    ['non-positive total_calories', 'dish_5100000006,0,50,2,10,5,ingr_e1,Egg,10,20,1,2,1', 0],
    ['non-positive total_mass', 'dish_5100000007,100,0,2,10,5,ingr_e1,Egg,10,20,1,2,1', 100],
    ['negative total_fat', 'dish_5100000008,100,50,-1,10,5,ingr_e1,Egg,10,20,1,2,1', 100],
    ['negative total_carb', 'dish_5100000009,100,50,2,-1,5,ingr_e1,Egg,10,20,1,2,1', 100],
    ['negative total_protein', 'dish_5100000010,100,50,2,10,-1,ingr_e1,Egg,10,20,1,2,1', 100],
  ])('parses %s as eligibility input (not a parse error)', (_label, row, expectedCalories) => {
    const [parsed] = parseDishMetadataCsv(row);
    expect(parsed!.totalCalories).toBe(expectedCalories);
  });

  it.each([
    ['non-positive ingredient grams', 'dish_5100000011,100,50,2,10,5,ingr_f1,Egg,0,20,1,2,1'],
    ['negative ingredient calories', 'dish_5100000012,100,50,2,10,5,ingr_f1,Egg,10,-1,1,2,1'],
    ['negative ingredient fat', 'dish_5100000013,100,50,2,10,5,ingr_f1,Egg,10,20,-1,2,1'],
    ['empty ingredient ID', 'dish_5100000015,100,50,2,10,5,,Egg,10,20,1,2,1'],
  ])('rejects an invalid ingredient group: %s', (_label, row) => {
    expect(() => parseDishMetadataCsv(row)).toThrow();
  });

  it('parses a structurally valid ingredient group with an empty descriptive name as name exactly \'\'', () => {
    const [row] = parseDishMetadataCsv('dish_5100000014,100,50,2,10,5,ingr_f1,,10,20,1,2,1');
    expect(row!.ingredients).toEqual([
      { ingredientId: 'ingr_f1', name: '', grams: 10, calories: 20, fat: 1, carb: 2, protein: 1 },
    ]);
  });
});

describe('mergeDishMetadata: exactly-once presence across cafe1/cafe2', () => {
  function row(dishId: string) {
    return {
      dishId,
      totalCalories: 100,
      totalMass: 50,
      totalFat: 2,
      totalCarb: 10,
      totalProtein: 5,
      ingredients: [{ ingredientId: 'i1', name: 'x', grams: 10, calories: 20, fat: 1, carb: 2, protein: 1 }],
    };
  }

  it('merges disjoint cafe1/cafe2 rows into one map', () => {
    const merged = mergeDishMetadata([row('dish_a')], [row('dish_b')]);
    expect(merged.size).toBe(2);
    expect(merged.get('dish_a')).toBeDefined();
    expect(merged.get('dish_b')).toBeDefined();
  });

  it('rejects a dish ID duplicated within a single cafe list', () => {
    expect(() => mergeDishMetadata([row('dish_a'), row('dish_a')], [])).toThrow(/duplicate/i);
  });

  it('rejects a dish ID present in both cafe1 and cafe2 (must be exactly once overall)', () => {
    expect(() => mergeDishMetadata([row('dish_a')], [row('dish_a')])).toThrow(/duplicate/i);
  });
});

// ── Bins: component / calorie / macro dominance ─────────────────────────────

describe('componentBinOf: exactly 1 / exactly 2 / 3+', () => {
  it('maps ingredient counts to the exact three bins', () => {
    expect(componentBinOf(1)).toBe(0);
    expect(componentBinOf(2)).toBe(1);
    expect(componentBinOf(3)).toBe(2);
    expect(componentBinOf(10)).toBe(2);
  });

  it('rejects a non-positive ingredient count', () => {
    expect(() => componentBinOf(0)).toThrow();
    expect(() => componentBinOf(-1)).toThrow();
  });
});

describe('calorieBinOf: <150, 150..400 inclusive, >400', () => {
  it('honors both boundaries exactly', () => {
    expect(calorieBinOf(0)).toBe(0);
    expect(calorieBinOf(149.999)).toBe(0);
    expect(calorieBinOf(150)).toBe(1);
    expect(calorieBinOf(400)).toBe(1);
    expect(calorieBinOf(400.0001)).toBe(2);
  });
});

describe('macroDominanceBinOf: 4*protein vs 4*carb vs 9*fat, tie precedence protein > carb > fat', () => {
  it('picks the strictly dominant macro', () => {
    expect(macroDominanceBinOf(10, 1, 1)).toBe(0); // protein: 40 > 4, 9
    expect(macroDominanceBinOf(1, 10, 1)).toBe(1); // carb: 40 > 4, 9
    expect(macroDominanceBinOf(1, 1, 10)).toBe(2); // fat: 90 > 4, 4
  });

  it('resolves an exact three-way tie to protein', () => {
    expect(macroDominanceBinOf(0, 0, 0)).toBe(0);
  });

  it('resolves a protein/carb tie to protein', () => {
    // 4*5 = 20 = 4*5; 9*1 = 9 (loses)
    expect(macroDominanceBinOf(5, 5, 1)).toBe(0);
  });

  it('resolves a carb/fat tie to carb', () => {
    // 4*9 = 36 = 9*4; 4*1 = 4 (loses)
    expect(macroDominanceBinOf(1, 9, 4)).toBe(1);
  });

  it('resolves a protein/fat tie to protein', () => {
    // 4*9 = 36 = 9*4; 4*1 = 4 (loses)
    expect(macroDominanceBinOf(9, 1, 4)).toBe(0);
  });
});

describe('rankHash: lowercase hex sha256("calorix-n5k-calibration-v1:" + dishId)', () => {
  it('matches the exact formula and format', () => {
    const dishId = 'dish_1565035746';
    const expected = createHash('sha256').update(`calorix-n5k-calibration-v1:${dishId}`).digest('hex');
    expect(rankHash(dishId)).toBe(expected);
    expect(rankHash(dishId)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic and distinguishes different dish IDs', () => {
    expect(rankHash('dish_1')).toBe(rankHash('dish_1'));
    expect(rankHash('dish_1')).not.toBe(rankHash('dish_2'));
  });
});

// ── Frozen-ID exclusion and eligible-dish construction ──────────────────────

describe('buildEligibleDishes: split ∩ metadata, minus the 12 frozen public-manifest IDs', () => {
  it('exports exactly the 12 frozen public-manifest dish IDs', () => {
    expect(new Set(FROZEN_PUBLIC_MANIFEST_DISH_IDS).size).toBe(12);
    expect([...FROZEN_PUBLIC_MANIFEST_DISH_IDS].sort()).toEqual(
      [
        'dish_1558549605',
        'dish_1558639787',
        'dish_1558639818',
        'dish_1560456326',
        'dish_1561663580',
        'dish_1562788601',
        'dish_1564427430',
        'dish_1565035746',
        'dish_1565898402',
        'dish_1566328724',
        'dish_1566838351',
        'dish_1567107839',
      ].sort(),
    );
  });

  function metadataRow(dishId: string) {
    return {
      dishId,
      totalCalories: 100,
      totalMass: 50,
      totalFat: 2,
      totalCarb: 10,
      totalProtein: 5,
      ingredients: [{ ingredientId: 'i1', name: 'x', grams: 10, calories: 20, fat: 1, carb: 2, protein: 1 }],
    };
  }

  it('includes only dishes present in both the split and metadata, excluding frozen IDs', () => {
    const frozenId = FROZEN_PUBLIC_MANIFEST_DISH_IDS[0]!;
    const metadataById = new Map([
      ['dish_6000000001', metadataRow('dish_6000000001')],
      ['dish_6000000002', metadataRow('dish_6000000002')], // not in split
      [frozenId, metadataRow(frozenId)],
    ]);
    const trainSplitIds = ['dish_6000000001', frozenId, 'dish_6000000099']; // last one not in metadata

    const eligible = buildEligibleDishes(trainSplitIds, metadataById);
    expect(eligible.map((d) => d.dishId)).toEqual(['dish_6000000001']);
    expect(eligible[0]!.componentBin).toBe(componentBinOf(1));
    expect(eligible[0]!.calorieBin).toBe(calorieBinOf(100));
    expect(eligible[0]!.macroBin).toBe(macroDominanceBinOf(5, 10, 2));
  });
});

// ── Generic slot-filling engine: order, shared IDs, reorder invariance ──────

describe('fillCalibrationSlots (generic engine): rank order, shared used-ID set, never crosses strata', () => {
  const sampleSchedule = {
    development: [
      { componentBin: 0 as const, calorieBin: 0 as const, macroBin: 0 as const },
      { componentBin: 1 as const, calorieBin: 1 as const, macroBin: 1 as const },
    ],
    validation: [{ componentBin: 0 as const, calorieBin: 0 as const, macroBin: 0 as const }],
  };

  it('fills development before validation from a shared used-ID set, lowest rank hash first', () => {
    const ids = ['alpha-a', 'alpha-b', 'alpha-c'];
    const [first, second, third] = [...ids].sort(byLocalRank);
    const pool = [...ids.map((id) => dish(id, 0, 0, 0)), dish('beta-only', 1, 1, 1)];

    const result = fillCalibrationSlots(pool, sampleSchedule);

    expect(result.development.find((d) => d.componentBin === 0)?.dishId).toBe(first);
    expect(result.validation[0]?.dishId).toBe(second);

    const usedIds = [...result.development, ...result.validation].map((d) => d.dishId);
    expect(new Set(usedIds).size).toBe(usedIds.length);
    expect(usedIds).not.toContain(third);
  });

  it('produces identical output regardless of input pool order', () => {
    const pool = [
      dish('alpha-a', 0, 0, 0),
      dish('alpha-b', 0, 0, 0),
      dish('alpha-c', 0, 0, 0),
      dish('beta-only', 1, 1, 1),
    ];
    const forward = fillCalibrationSlots(pool, sampleSchedule);
    const shuffled = [pool[3]!, pool[1]!, pool[2]!, pool[0]!];
    const reordered = fillCalibrationSlots(shuffled, sampleSchedule);
    expect(reordered).toEqual(forward);
  });

  it('never substitutes a near-miss neighboring stratum for an exact one', () => {
    // 'only-neighbor' shares component/calorie bins but not the macro bin
    // required by the first development slot; it must never be used there.
    const pool = [dish('only-neighbor', 0, 0, 1), dish('beta-only', 1, 1, 1)];
    expect(() => fillCalibrationSlots(pool, sampleSchedule)).toThrow();
  });

  it('fails closed when a stratum is exhausted before all of its slots are filled', () => {
    // (0,0,0) is needed by one development slot and one validation slot, but
    // only one candidate exists.
    const pool = [dish('alpha-solo', 0, 0, 0), dish('beta-only', 1, 1, 1)];
    expect(() => fillCalibrationSlots(pool, sampleSchedule)).toThrow();
  });

  it('honors an explicit skipDishIds option, excluding those candidates from consideration', () => {
    const singleDevSlotSchedule = {
      development: [{ componentBin: 0 as const, calorieBin: 0 as const, macroBin: 0 as const }],
      validation: [],
    };
    const ids = ['alpha-a', 'alpha-b'];
    const [top, second] = [...ids].sort(byLocalRank);
    const pool = ids.map((id) => dish(id, 0, 0, 0));

    const result = fillCalibrationSlots(pool, singleDevSlotSchedule, { skipDishIds: new Set([top]) });
    const usedIds = result.development.map((d) => d.dishId);
    expect(usedIds).not.toContain(top);
    expect(usedIds).toContain(second);
  });
});

// ── Exact plan-specified schedules and margins ──────────────────────────────

describe('DEVELOPMENT_SLOT_SCHEDULE / VALIDATION_SLOT_SCHEDULE: immutable exact data', () => {
  const DEV_TUPLES: Array<[number, number, number]> = [
    [0, 0, 0], [1, 1, 1], [2, 2, 2],
    [0, 0, 0], [1, 1, 2], [2, 2, 1],
    [0, 0, 1], [1, 1, 0], [2, 2, 2],
    [0, 0, 1], [1, 1, 2], [2, 2, 0],
    [0, 0, 2], [1, 1, 0], [2, 2, 1],
    [0, 0, 2], [1, 1, 1], [2, 2, 0],
    [0, 1, 1], [1, 0, 2], [2, 2, 0],
    [0, 2, 2], [1, 0, 1], [2, 1, 0],
  ];

  const VALIDATION_TUPLES: Array<[number, number, number]> = [
    [0, 0, 0], [1, 2, 2], [2, 1, 1],
    [0, 0, 1], [1, 2, 2], [2, 1, 0],
    [0, 1, 0], [1, 0, 1], [2, 2, 2],
    [0, 1, 0], [1, 0, 2], [2, 2, 1],
    [0, 1, 2], [1, 0, 1], [2, 2, 0],
    [0, 2, 1],
  ];

  function margin(tuples: ReadonlyArray<[number, number, number]>, axis: 0 | 1 | 2): number[] {
    const counts = [0, 0, 0];
    for (const t of tuples) counts[t[axis]]! += 1;
    return counts;
  }

  it('matches the exact plan-specified development schedule, in order (24 slots)', () => {
    expect(DEVELOPMENT_SLOT_SCHEDULE).toHaveLength(24);
    expect(DEVELOPMENT_SLOT_SCHEDULE.map((s) => [s.componentBin, s.calorieBin, s.macroBin])).toEqual(DEV_TUPLES);
  });

  it('matches the exact plan-specified validation schedule, in order (16 slots)', () => {
    expect(VALIDATION_SLOT_SCHEDULE).toHaveLength(16);
    expect(VALIDATION_SLOT_SCHEDULE.map((s) => [s.componentBin, s.calorieBin, s.macroBin])).toEqual(VALIDATION_TUPLES);
  });

  it('has development marginal counts 8/8/8 on every axis', () => {
    expect(margin(DEV_TUPLES, 0)).toEqual([8, 8, 8]);
    expect(margin(DEV_TUPLES, 1)).toEqual([8, 8, 8]);
    expect(margin(DEV_TUPLES, 2)).toEqual([8, 8, 8]);
  });

  it('has validation marginal counts component 6/5/5, calorie 5/5/6, macro 5/6/5', () => {
    expect(margin(VALIDATION_TUPLES, 0)).toEqual([6, 5, 5]);
    expect(margin(VALIDATION_TUPLES, 1)).toEqual([5, 5, 6]);
    expect(margin(VALIDATION_TUPLES, 2)).toEqual([5, 6, 5]);
  });

  it('has combined total marginal counts component 14/13/13, calorie 13/13/14, macro 13/14/13', () => {
    const all = [...DEV_TUPLES, ...VALIDATION_TUPLES];
    expect(margin(all, 0)).toEqual([14, 13, 13]);
    expect(margin(all, 1)).toEqual([13, 13, 14]);
    expect(margin(all, 2)).toEqual([13, 14, 13]);
  });
});

// ── Full 24/16 selection against the real schedule ──────────────────────────

// Combined (development + validation) required candidate count per exact
// stratum, derived by expanding every round in the plan's slot schedule.
// Sums to exactly 40 and is reused to build an exact-fit synthetic pool.
const COMBINED_STRATUM_COUNTS: ReadonlyArray<[number, number, number, number]> = [
  [0, 0, 0, 3], [1, 1, 1, 2], [2, 2, 2, 3], [1, 1, 2, 2], [2, 2, 1, 3],
  [0, 0, 1, 3], [1, 1, 0, 2], [2, 2, 0, 4], [0, 0, 2, 2], [0, 1, 1, 1],
  [1, 0, 2, 2], [0, 2, 2, 1], [1, 0, 1, 3], [2, 1, 0, 2], [1, 2, 2, 2],
  [2, 1, 1, 1], [0, 1, 0, 2], [0, 1, 2, 1], [0, 2, 1, 1],
];

function buildFullFitPool(adjustments: Record<string, number> = {}): EligibleDish[] {
  const pool: EligibleDish[] = [];
  let counter = 0;
  for (const [c, k, m, baseCount] of COMBINED_STRATUM_COUNTS) {
    const key = `${c},${k},${m}`;
    const count = adjustments[key] ?? baseCount;
    for (let n = 0; n < count; n++) {
      counter += 1;
      pool.push(dish(`dish_7${String(counter).padStart(9, '0')}`, c as 0 | 1 | 2, k as 0 | 1 | 2, m as 0 | 1 | 2));
    }
  }
  return pool;
}

describe('selectCalibrationCorpus: full 24-development/16-validation selection', () => {
  it('selects exactly 24 development and 16 validation cases, no ID overlap, from an exact-fit pool', () => {
    const pool = buildFullFitPool();
    const { development, validation } = selectCalibrationCorpus(pool);
    expect(development).toHaveLength(24);
    expect(validation).toHaveLength(16);
    const devIds = new Set(development.map((d) => d.dishId));
    const valIds = new Set(validation.map((d) => d.dishId));
    expect(devIds.size).toBe(24);
    expect(valIds.size).toBe(16);
    for (const id of devIds) expect(valIds.has(id)).toBe(false);
  });

  it('reproduces the exact plan-specified marginal counts on the selected corpus', () => {
    const pool = buildFullFitPool();
    const { development, validation } = selectCalibrationCorpus(pool);
    const margin = (dishes: EligibleDish[], axis: 'componentBin' | 'calorieBin' | 'macroBin') => {
      const counts = [0, 0, 0];
      for (const d of dishes) counts[d[axis]] += 1;
      return counts;
    };
    expect(margin(development, 'componentBin')).toEqual([8, 8, 8]);
    expect(margin(development, 'calorieBin')).toEqual([8, 8, 8]);
    expect(margin(development, 'macroBin')).toEqual([8, 8, 8]);
    expect(margin(validation, 'componentBin')).toEqual([6, 5, 5]);
    expect(margin(validation, 'calorieBin')).toEqual([5, 5, 6]);
    expect(margin(validation, 'macroBin')).toEqual([5, 6, 5]);
  });

  it('is insensitive to input row order (identical output after reversing the pool)', () => {
    const pool = buildFullFitPool();
    const forward = selectCalibrationCorpus(pool);
    const reordered = selectCalibrationCorpus([...pool].reverse());
    expect(reordered).toEqual(forward);
  });

  it('fails closed with no neighboring-stratum fallback when one required stratum is exhausted', () => {
    const pool = buildFullFitPool({ '2,2,0': 3 }); // one short of the required 4
    expect(() => selectCalibrationCorpus(pool)).toThrow();
  });
});

// ── Image verification: HTTP status, PNG signature, inspectImage, dimensions ─

describe('verifyOverheadImage: HTTP 200 + PNG signature + inspectImage + positive dimensions', () => {
  it('accepts a 200 PNG response and returns sha256/width/height/mediaType', async () => {
    const bytes = buildPngBytes(640, 480);
    const fetchImage = vi.fn(async (url: string) => {
      expect(url).toBe(buildOverheadImageUrl('dish_8000000001'));
      return { status: 200, bytes };
    });
    const result = await verifyOverheadImage('dish_8000000001', fetchImage);
    expect(result.mediaType).toBe('image/png');
    expect(result.width).toBe(640);
    expect(result.height).toBe(480);
    expect(result.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
  });

  it('rejects a non-200 HTTP response', async () => {
    const fetchImage = async (_url: string) => ({ status: 404, bytes: new Uint8Array() });
    await expect(verifyOverheadImage('dish_8000000002', fetchImage)).rejects.toThrow();
  });

  it('rejects bytes without a valid PNG signature', async () => {
    const fetchImage = async () => ({ status: 200, bytes: new Uint8Array([0x00, 0x01, 0x02, 0x03]) });
    await expect(verifyOverheadImage('dish_8000000003', fetchImage)).rejects.toThrow();
  });

  it('rejects a real JPEG payload (wrong media type) even with a 200 status', async () => {
    const fetchImage = async () => ({ status: 200, bytes: MINIMAL_JPEG_BYTES });
    await expect(verifyOverheadImage('dish_8000000004', fetchImage)).rejects.toThrow();
  });

  it('rejects zero decoded dimensions', async () => {
    const fetchImage = async () => ({ status: 200, bytes: buildPngBytes(0, 480) });
    await expect(verifyOverheadImage('dish_8000000005', fetchImage)).rejects.toThrow();
  });
});

describe('buildCheckImage: maps overhead-image failures to the strict stable reason union, no raw text', () => {
  it('maps a non-200 response to http_error with the numeric status', async () => {
    const fetchImage = async (_url: string) => ({ status: 503, bytes: new Uint8Array() });
    const checkImage = buildCheckImage(fetchImage);
    expect(await checkImage('dish_9100000001')).toEqual({ ok: false, reason: 'http_error', status: 503 });
  });

  it('maps an invalid PNG signature to invalid_signature with no status field', async () => {
    const fetchImage = async (_url: string) => ({ status: 200, bytes: new Uint8Array([0x00, 0x01, 0x02, 0x03]) });
    const checkImage = buildCheckImage(fetchImage);
    expect(await checkImage('dish_9100000002')).toEqual({ ok: false, reason: 'invalid_signature' });
  });

  it('maps a valid but wrong-media-type payload (JPEG) to invalid_media_type with no status field', async () => {
    const fetchImage = async (_url: string) => ({ status: 200, bytes: MINIMAL_JPEG_BYTES });
    const checkImage = buildCheckImage(fetchImage);
    expect(await checkImage('dish_9100000003')).toEqual({ ok: false, reason: 'invalid_media_type' });
  });

  it('maps zero decoded dimensions to invalid_dimensions with no status field', async () => {
    const fetchImage = async (_url: string) => ({ status: 200, bytes: buildPngBytes(0, 480) });
    const checkImage = buildCheckImage(fetchImage);
    expect(await checkImage('dish_9100000004')).toEqual({ ok: false, reason: 'invalid_dimensions' });
  });

  it('returns ok:true with sha256/width/height for a valid PNG', async () => {
    const bytes = buildPngBytes(640, 480);
    const fetchImage = async (_url: string) => ({ status: 200, bytes });
    const checkImage = buildCheckImage(fetchImage);
    expect(await checkImage('dish_9100000005')).toEqual({
      ok: true,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      width: 640,
      height: 480,
    });
  });
});

// ── Pin-time same-stratum image skip and exhaustion (no neighbor fallback) ──

describe('fillCalibrationSlotsWithImageVerification: same-stratum skip and exhaustion during initial pinning', () => {
  const singleSlotSchedule = {
    development: [{ componentBin: 0 as const, calorieBin: 0 as const, macroBin: 0 as const }],
    validation: [],
  };

  it('skips a failed-image candidate and advances to the next-ranked candidate in the same stratum', async () => {
    const ids = ['img-a', 'img-b'];
    const [top, second] = [...ids].sort(byLocalRank);
    const pool = ids.map((id) => dish(id, 0, 0, 0));
    const checkImage: CheckImageFn = vi.fn(async (dishId: string) =>
      dishId === top
        ? { ok: false, reason: 'http_error', status: 404 }
        : { ok: true, sha256: 'e'.repeat(64), width: 640, height: 480 },
    );

    const result = await fillCalibrationSlotsWithImageVerification(pool, singleSlotSchedule, checkImage);
    expect(result.development.map((d) => d.dishId)).toEqual([second]);
    expect(result.skippedImages).toEqual([
      { dishId: top, stratum: { componentBin: 0, calorieBin: 0, macroBin: 0 }, reason: 'http_error', status: 404 },
    ]);
  });

  it('records a skipped image without a status field for a non-http reason', async () => {
    const ids = ['img-a', 'img-b'];
    const [top, second] = [...ids].sort(byLocalRank);
    const pool = ids.map((id) => dish(id, 1, 2, 0));
    const schedule = {
      development: [{ componentBin: 1 as const, calorieBin: 2 as const, macroBin: 0 as const }],
      validation: [],
    };
    const checkImage: CheckImageFn = vi.fn(async (dishId: string) =>
      dishId === top
        ? { ok: false, reason: 'invalid_signature' }
        : { ok: true, sha256: 'e'.repeat(64), width: 640, height: 480 },
    );

    const result = await fillCalibrationSlotsWithImageVerification(pool, schedule, checkImage);
    expect(result.development.map((d) => d.dishId)).toEqual([second]);
    expect(result.skippedImages).toEqual([
      { dishId: top, stratum: { componentBin: 1, calorieBin: 2, macroBin: 0 }, reason: 'invalid_signature' },
    ]);
  });

  it('fails closed with no neighboring-stratum fallback when every candidate in a stratum fails its image check', async () => {
    const pool = [dish('img-only', 0, 0, 0)];
    const checkImage: CheckImageFn = vi.fn(async () => ({ ok: false, reason: 'http_error', status: 404 }));
    await expect(fillCalibrationSlotsWithImageVerification(pool, singleSlotSchedule, checkImage)).rejects.toThrow();
  });

  it('matches the pure selection result when every image check succeeds', async () => {
    const pool = [dish('img-solo', 0, 0, 0)];
    const checkImage: CheckImageFn = vi.fn(async () => ({ ok: true, sha256: 'f'.repeat(64), width: 640, height: 480 }));

    const withImages = await fillCalibrationSlotsWithImageVerification(pool, singleSlotSchedule, checkImage);
    const pure = fillCalibrationSlots(pool, singleSlotSchedule);

    expect(withImages.development.map((d) => d.dishId)).toEqual(pure.development.map((d) => d.dishId));
    expect(withImages.images.get('img-solo')).toEqual({ sha256: 'f'.repeat(64), width: 640, height: 480 });
    expect(withImages.skippedImages).toEqual([]);
  });
});

// ── --pin / --verify pipeline: existence guard, atomicity, no substitution ──

describe('pinCalibrationCorpus / verifyCalibrationCorpus: atomic all-or-nothing publication', () => {
  const paths = {
    sourceLockPath: '/virtual/eval/nutrition/calibration-source-lock.json',
    manifestPath: '/virtual/eval/nutrition/calibration-manifest.json',
  };

  const STABLE_RETRIEVED_AT = '2026-09-24T00:00:00.000Z';

  // A schema-conformant source-lock stub (minus `skippedImages`, which
  // buildCalibrationArtifactBytes appends itself). Pin now parses/validates
  // this through CalibrationSourceLockSchema before hashing/writing, so the
  // default fixture must actually satisfy that schema, not just be an
  // arbitrary object.
  function validSourceLockStub(): Record<string, unknown> {
    return {
      version: 1,
      datasetId: 'calorix-n5k-calibration-v1',
      baseUrl: NUTRITION5K_BASE_URL,
      retrievalProvenance: { retrievedAt: STABLE_RETRIEVED_AT, baseUrl: NUTRITION5K_BASE_URL },
      sources: {
        trainSplit: {
          path: CALIBRATION_SOURCE_PATHS.trainSplit,
          url: buildSourceUrl(CALIBRATION_SOURCE_PATHS.trainSplit),
          sha256: 'a'.repeat(64),
          byteLength: 1024,
        },
        metadataCafe1: {
          path: CALIBRATION_SOURCE_PATHS.metadataCafe1,
          url: buildSourceUrl(CALIBRATION_SOURCE_PATHS.metadataCafe1),
          sha256: 'b'.repeat(64),
          byteLength: 2048,
        },
        metadataCafe2: {
          path: CALIBRATION_SOURCE_PATHS.metadataCafe2,
          url: buildSourceUrl(CALIBRATION_SOURCE_PATHS.metadataCafe2),
          sha256: 'c'.repeat(64),
          byteLength: 4096,
        },
      },
      excludedDishes: [],
    };
  }

  // The publisher dependency is deliberately split into the concrete
  // write-temp / rename-to-final / remove-file primitives (rather than one
  // opaque "writeArtifactAtomic" call) so a real implementation is forced to
  // perform an explicit temp-write-then-rename per artifact, and to roll
  // back any already-finalized artifact plus clean up its own temp file when
  // a later rename fails. `_liveState` tracks exactly what a real
  // filesystem would show: which final paths are currently committed, and
  // which temp files are still sitting on disk.
  function makeDeps(overrides: {
    existing?: Record<string, Uint8Array>;
    buildSourceLock?: () => Promise<unknown>;
    buildCandidatePool?: () => Promise<EligibleDish[]>;
    checkImage?: CheckImageFn;
    failRenameFinalPaths?: string[];
    failWriteTempFileOnCallNumber?: number;
  } = {}) {
    const existing = overrides.existing ?? {};
    const renamedFinal = new Set<string>();
    const liveTempFiles = new Set<string>();
    let tempCounter = 0;
    let writeTempCallCount = 0;

    const readArtifact = vi.fn(async (path: string) => existing[path]);

    const writeTempFile = vi.fn(async (finalPath: string, _bytes: Uint8Array) => {
      writeTempCallCount += 1;
      if (overrides.failWriteTempFileOnCallNumber === writeTempCallCount) {
        throw new Error(`simulated temp-write failure on call ${writeTempCallCount}`);
      }
      tempCounter += 1;
      const tempPath = `${finalPath}.tmp-${tempCounter}`;
      liveTempFiles.add(tempPath);
      return tempPath;
    });

    const renameToFinal = vi.fn(async (tempPath: string, finalPath: string) => {
      if (overrides.failRenameFinalPaths?.includes(finalPath)) {
        throw new Error(`simulated rename failure: ${finalPath}`);
      }
      liveTempFiles.delete(tempPath);
      renamedFinal.add(finalPath);
    });

    const removeFile = vi.fn(async (path: string) => {
      liveTempFiles.delete(path);
      renamedFinal.delete(path);
    });

    const buildSourceLock = vi.fn(overrides.buildSourceLock ?? (async () => validSourceLockStub()));
    const buildCandidatePool = vi.fn(overrides.buildCandidatePool ?? (async () => buildFullFitPool()));
    const checkImage: CheckImageFn = vi.fn(
      overrides.checkImage ?? (async () => ({ ok: true, sha256: 'a'.repeat(64), width: 640, height: 480 })),
    );

    return {
      readArtifact,
      writeTempFile,
      renameToFinal,
      removeFile,
      buildSourceLock,
      buildCandidatePool,
      checkImage,
      _liveState: { renamedFinal, liveTempFiles },
    };
  }

  it('fails before any source/pool/image work if either artifact already exists', async () => {
    const deps = makeDeps({ existing: { [paths.sourceLockPath]: new Uint8Array([1]) } });
    await expect(pinCalibrationCorpus(deps, paths)).rejects.toThrow();
    expect(deps.buildSourceLock).not.toHaveBeenCalled();
    expect(deps.buildCandidatePool).not.toHaveBeenCalled();
    expect(deps.writeTempFile).not.toHaveBeenCalled();
    expect(deps.renameToFinal).not.toHaveBeenCalled();
  });

  it('writes both artifacts through write-temp-then-rename-to-final, exactly once each, only after every check succeeds', async () => {
    const deps = makeDeps();
    await pinCalibrationCorpus(deps, paths);

    expect(deps.writeTempFile).toHaveBeenCalledTimes(2);
    expect(deps.renameToFinal).toHaveBeenCalledTimes(2);
    const finalizedPaths = deps.renameToFinal.mock.calls.map((call) => call[1]).sort();
    expect(finalizedPaths).toEqual([paths.manifestPath, paths.sourceLockPath].sort());
    expect(deps.removeFile).not.toHaveBeenCalled();
    expect(deps._liveState.liveTempFiles.size).toBe(0);
  });

  it('writes nothing at all when candidate-pool construction fails', async () => {
    const deps = makeDeps({
      buildCandidatePool: async () => {
        throw new Error('source verification failed');
      },
    });
    await expect(pinCalibrationCorpus(deps, paths)).rejects.toThrow();
    expect(deps.writeTempFile).not.toHaveBeenCalled();
    expect(deps.renameToFinal).not.toHaveBeenCalled();
  });

  it('writes nothing at all when selection cannot fill every slot', async () => {
    const deps = makeDeps({ buildCandidatePool: async () => buildFullFitPool({ '2,2,0': 3 }) });
    await expect(pinCalibrationCorpus(deps, paths)).rejects.toThrow();
    expect(deps.writeTempFile).not.toHaveBeenCalled();
    expect(deps.renameToFinal).not.toHaveBeenCalled();
  });

  it('rolls back the first finalized artifact and leaves neither final artifact when the second final rename fails', async () => {
    // The source lock is finalized first; the manifest rename (the second
    // rename attempted) is forced to fail here to prove that a partial
    // publish is impossible: either both artifacts land, or neither does.
    const deps = makeDeps({ failRenameFinalPaths: [paths.manifestPath] });

    await expect(pinCalibrationCorpus(deps, paths)).rejects.toThrow();

    expect(deps.removeFile).toHaveBeenCalledWith(paths.sourceLockPath);
    expect(deps._liveState.renamedFinal.has(paths.sourceLockPath)).toBe(false);
    expect(deps._liveState.renamedFinal.has(paths.manifestPath)).toBe(false);
    expect(deps._liveState.renamedFinal.size).toBe(0);

    // No temp files survive: the manifest's own failed-rename temp file must
    // be explicitly cleaned up (a failed rename leaves the source/temp file
    // in place, it does not vanish on its own).
    expect(deps._liveState.liveTempFiles.size).toBe(0);
  });

  it('cleans up its own temp file and finalizes nothing when the first final rename fails', async () => {
    const deps = makeDeps({ failRenameFinalPaths: [paths.sourceLockPath] });

    await expect(pinCalibrationCorpus(deps, paths)).rejects.toThrow();

    expect(deps._liveState.renamedFinal.size).toBe(0);
    expect(deps._liveState.liveTempFiles.size).toBe(0);
    // The manifest rename must never even be attempted once the source-lock
    // rename (attempted first) has already failed.
    expect(deps.renameToFinal.mock.calls.map((call) => call[1])).not.toContain(paths.manifestPath);
  });

  it('writes both temp files before any rename is attempted, in order', async () => {
    const deps = makeDeps();
    await pinCalibrationCorpus(deps, paths);
    const firstRenameCallOrder = deps.renameToFinal.mock.invocationCallOrder[0]!;
    const lastWriteTempCallOrder =
      deps.writeTempFile.mock.invocationCallOrder[deps.writeTempFile.mock.invocationCallOrder.length - 1]!;
    expect(lastWriteTempCallOrder).toBeLessThan(firstRenameCallOrder);
  });

  it('cleans up the first temp file and finalizes nothing when the second temp-file write fails', async () => {
    const deps = makeDeps({ failWriteTempFileOnCallNumber: 2 });

    await expect(pinCalibrationCorpus(deps, paths)).rejects.toThrow();

    expect(deps.writeTempFile).toHaveBeenCalledTimes(2);
    expect(deps.renameToFinal).not.toHaveBeenCalled();
    expect(deps._liveState.renamedFinal.size).toBe(0);
    expect(deps._liveState.liveTempFiles.size).toBe(0);
  });

  it('verify fails if either committed artifact is missing, and never writes', async () => {
    const deps = makeDeps();
    await expect(verifyCalibrationCorpus(deps, paths)).rejects.toThrow();
    expect(deps.writeTempFile).not.toHaveBeenCalled();
    expect(deps.renameToFinal).not.toHaveBeenCalled();
  });

  it('verify fails closed on a rebuild mismatch and never substitutes/rewrites the committed artifacts', async () => {
    const existing: Record<string, Uint8Array> = {
      [paths.sourceLockPath]: new TextEncoder().encode(JSON.stringify({ version: 1 })),
      [paths.manifestPath]: new TextEncoder().encode(JSON.stringify({ version: 1, cases: [] })),
    };
    const deps = makeDeps({
      existing,
      // What the current environment would rebuild now disagrees with what
      // was committed (simulated upstream/source drift); verify must fail
      // rather than trust-on-first-use the newly rebuilt bytes.
      buildCandidatePool: async () => buildFullFitPool({ '2,2,0': 3 }),
    });
    await expect(verifyCalibrationCorpus(deps, paths)).rejects.toThrow();
    expect(deps.writeTempFile).not.toHaveBeenCalled();
    expect(deps.renameToFinal).not.toHaveBeenCalled();
  });

  it('verify succeeds without ever writing when the rebuilt corpus matches exactly what pin previously produced', async () => {
    const pinDeps = makeDeps();
    await pinCalibrationCorpus(pinDeps, paths);

    // The bytes committed to each final path are whatever writeTempFile
    // received for that same final path.
    const written: Record<string, Uint8Array> = {};
    for (const call of pinDeps.writeTempFile.mock.calls) {
      written[call[0] as string] = call[1] as Uint8Array;
    }

    const verifyDeps = makeDeps({ existing: written });
    await expect(verifyCalibrationCorpus(verifyDeps, paths)).resolves.toBeTruthy();
    expect(verifyDeps.writeTempFile).not.toHaveBeenCalled();
    expect(verifyDeps.renameToFinal).not.toHaveBeenCalled();
  });

  it('fails immediately on the first selected image mismatch, never checking any other committed case or candidate', async () => {
    const pinDeps = makeDeps();
    await pinCalibrationCorpus(pinDeps, paths);
    const written: Record<string, Uint8Array> = {};
    for (const call of pinDeps.writeTempFile.mock.calls) {
      written[call[0] as string] = call[1] as Uint8Array;
    }

    const manifestJson = JSON.parse(new TextDecoder().decode(written[paths.manifestPath]!)) as {
      cases: Array<{ source: { objectId: string } }>;
    };
    const firstCommittedDishId = manifestJson.cases[0]!.source.objectId;

    const checkImageCalls: string[] = [];
    const verifyDeps = makeDeps({
      existing: written,
      checkImage: async (dishId: string) => {
        checkImageCalls.push(dishId);
        if (dishId === firstCommittedDishId) return { ok: false, reason: 'http_error', status: 500 };
        return { ok: true, sha256: 'a'.repeat(64), width: 640, height: 480 };
      },
    });

    await expect(verifyCalibrationCorpus(verifyDeps, paths)).rejects.toThrow();
    // Only the failing, already-committed dish is ever checked: verify never
    // substitutes an alternate candidate and never continues past the first
    // failure to check the other 39 committed images.
    expect(checkImageCalls).toEqual([firstCommittedDishId]);
  });

  it('reconstructs the exact committed selection by excluding the committed skipped dish (never re-deriving new skips)', async () => {
    const buildPool = () => buildFullFitPool({ '0,0,0': 4 }); // one extra candidate than the 3 the schedule needs
    const strataTop = [...buildPool()]
      .filter((d) => d.componentBin === 0 && d.calorieBin === 0 && d.macroBin === 0)
      .map((d) => d.dishId)
      .sort(byLocalRank)[0]!;

    const pinDeps = makeDeps({
      buildCandidatePool: async () => buildPool(),
      checkImage: async (dishId: string) =>
        dishId === strataTop
          ? { ok: false, reason: 'invalid_signature' }
          : { ok: true, sha256: 'a'.repeat(64), width: 640, height: 480 },
    });
    await pinCalibrationCorpus(pinDeps, paths);
    const written: Record<string, Uint8Array> = {};
    for (const call of pinDeps.writeTempFile.mock.calls) {
      written[call[0] as string] = call[1] as Uint8Array;
    }

    const lockJson = JSON.parse(new TextDecoder().decode(written[paths.sourceLockPath]!)) as {
      skippedImages: Array<{ dishId: string }>;
    };
    expect(lockJson.skippedImages.map((s) => s.dishId)).toEqual([strataTop]);

    const verifyCheckImageCalls: string[] = [];
    const verifyDeps = makeDeps({
      existing: written,
      buildCandidatePool: async () => buildPool(),
      checkImage: async (dishId: string) => {
        verifyCheckImageCalls.push(dishId);
        return { ok: true, sha256: 'a'.repeat(64), width: 640, height: 480 };
      },
    });

    await expect(verifyCalibrationCorpus(verifyDeps, paths)).resolves.toBeTruthy();
    // The previously-skipped dish must never be presented for a fresh image
    // check: verify follows the committed skip record instead of
    // re-deriving its own.
    expect(verifyCheckImageCalls).not.toContain(strataTop);
  });

  it('fails closed when the committed manifest bytes are tampered after pinning (byte-for-byte reproduction)', async () => {
    const pinDeps = makeDeps();
    await pinCalibrationCorpus(pinDeps, paths);
    const written: Record<string, Uint8Array> = {};
    for (const call of pinDeps.writeTempFile.mock.calls) {
      written[call[0] as string] = call[1] as Uint8Array;
    }

    const manifestJson = JSON.parse(new TextDecoder().decode(written[paths.manifestPath]!));
    manifestJson.cases[0].truth.kcal += 1;
    const tamperedManifestBytes = new TextEncoder().encode(JSON.stringify(manifestJson));

    const verifyDeps = makeDeps({ existing: { ...written, [paths.manifestPath]: tamperedManifestBytes } });
    await expect(verifyCalibrationCorpus(verifyDeps, paths)).rejects.toThrow();
    expect(verifyDeps.writeTempFile).not.toHaveBeenCalled();
    expect(verifyDeps.renameToFinal).not.toHaveBeenCalled();
  });
});

describe('resolveCalibrationCorpusRuntimePaths', () => {
  it('resolves the exact committed artifact paths under functions/eval/nutrition', () => {
    const paths = resolveCalibrationCorpusRuntimePaths('/repo/functions/lib/nutrition-eval');
    expect(paths.sourceLockPath).toBe('/repo/functions/eval/nutrition/calibration-source-lock.json');
    expect(paths.manifestPath).toBe('/repo/functions/eval/nutrition/calibration-manifest.json');
  });
});

describe('runCalibrationCorpusCli: exact mutually exclusive --pin/--verify, no network for invalid flags', () => {
  it('fails when neither --pin nor --verify is given', async () => {
    const result = await runCalibrationCorpusCli([]);
    expect(result.exitCode).toBe(1);
  });

  it('fails when both --pin and --verify are given', async () => {
    const result = await runCalibrationCorpusCli(['--pin', '--verify']);
    expect(result.exitCode).toBe(1);
  });
});

describe('Task 4 audit correction: stable fetch_error for thrown image fetch/bytes', () => {
  it('maps a thrown image fetch to fetch_error without a status field', async () => {
    const fetchImage = async (_url: string): Promise<never> => {
      throw new Error('socket hang up');
    };
    const checkImage = buildCheckImage(fetchImage);
    expect(await checkImage('dish_9200000001')).toEqual({ ok: false, reason: 'fetch_error' });
  });

  it('maps a thrown arrayBuffer/bytes failure to fetch_error without a status field', async () => {
    const fetchImage = async (_url: string): Promise<never> => {
      throw new TypeError('arrayBuffer failed');
    };
    const checkImage = buildCheckImage(fetchImage);
    const result = await checkImage('dish_9200000002');
    expect(result).toEqual({ ok: false, reason: 'fetch_error' });
    expect(result).not.toHaveProperty('status');
  });

  it('verifyOverheadImage surfaces a thrown fetch as stable fetch_error (never raw text)', async () => {
    const fetchImage = async (_url: string): Promise<never> => {
      throw new Error('ECONNRESET: connect ETIMEDOUT 172.16.0.5:443');
    };
    const checkImage = buildCheckImage(fetchImage);
    const result = await checkImage('dish_9200000003');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('fetch_error');
      expect(result).not.toHaveProperty('status');
    }
  });
});

describe('Task 4 audit correction: fatal UTF-8 source decoding', () => {
  it('rejects invalid UTF-8 bytes instead of decoding with replacement characters', () => {
    const invalidUtf8 = new Uint8Array([0xff, 0xfe, 0x41]);
    const expected = {
      sha256: createHash('sha256').update(invalidUtf8).digest('hex'),
      byteLength: invalidUtf8.length,
    };
    const identityParser = vi.fn((text: string) => text);
    expect(() => parseAndVerifySource(invalidUtf8, expected, identityParser)).toThrow();
    expect(identityParser).not.toHaveBeenCalled();
  });
});

describe('Task 4 audit correction: verify checks committed sourceLockHash before any dependency call', () => {
  const paths = {
    sourceLockPath: '/virtual/eval/nutrition/calibration-source-lock.json',
    manifestPath: '/virtual/eval/nutrition/calibration-manifest.json',
  };

  const STABLE_RETRIEVED_AT = '2026-09-24T00:00:00.000Z';

  function validSourceLockStub(): Record<string, unknown> {
    return {
      version: 1,
      datasetId: 'calorix-n5k-calibration-v1',
      baseUrl: NUTRITION5K_BASE_URL,
      retrievalProvenance: { retrievedAt: STABLE_RETRIEVED_AT, baseUrl: NUTRITION5K_BASE_URL },
      sources: {
        trainSplit: {
          path: CALIBRATION_SOURCE_PATHS.trainSplit,
          url: buildSourceUrl(CALIBRATION_SOURCE_PATHS.trainSplit),
          sha256: 'a'.repeat(64),
          byteLength: 1024,
        },
        metadataCafe1: {
          path: CALIBRATION_SOURCE_PATHS.metadataCafe1,
          url: buildSourceUrl(CALIBRATION_SOURCE_PATHS.metadataCafe1),
          sha256: 'b'.repeat(64),
          byteLength: 2048,
        },
        metadataCafe2: {
          path: CALIBRATION_SOURCE_PATHS.metadataCafe2,
          url: buildSourceUrl(CALIBRATION_SOURCE_PATHS.metadataCafe2),
          sha256: 'c'.repeat(64),
          byteLength: 4096,
        },
      },
      excludedDishes: [],
    };
  }

  function makeDeps(overrides: {
    existing?: Record<string, Uint8Array>;
    buildSourceLock?: () => Promise<unknown>;
    buildCandidatePool?: () => Promise<EligibleDish[]>;
    checkImage?: CheckImageFn;
  } = {}) {
    const existing = overrides.existing ?? {};
    const readArtifact = vi.fn(async (path: string) => existing[path]);
    const writeTempFile = vi.fn(async (finalPath: string, _bytes: Uint8Array) => `${finalPath}.tmp-1`);
    const renameToFinal = vi.fn(async () => undefined);
    const removeFile = vi.fn(async () => undefined);
    const buildSourceLock = vi.fn(overrides.buildSourceLock ?? (async () => validSourceLockStub()));
    const buildCandidatePool = vi.fn(overrides.buildCandidatePool ?? (async () => buildFullFitPool()));
    const checkImage: CheckImageFn = vi.fn(
      overrides.checkImage ?? (async () => ({ ok: true, sha256: 'a'.repeat(64), width: 640, height: 480 })),
    );
    return { readArtifact, writeTempFile, renameToFinal, removeFile, buildSourceLock, buildCandidatePool, checkImage };
  }

  it('fails before any source/pool/image call when the committed sourceLockHash does not match the committed lock', async () => {
    const pinDeps = makeDeps();
    await pinCalibrationCorpus(pinDeps, paths);
    const written: Record<string, Uint8Array> = {};
    for (const call of pinDeps.writeTempFile.mock.calls) {
      written[call[0] as string] = call[1] as Uint8Array;
    }
    const manifestJson = JSON.parse(new TextDecoder().decode(written[paths.manifestPath]!)) as Record<string, unknown>;
    const tamperedManifest = { ...manifestJson, sourceLockHash: 'f'.repeat(64) };
    const tamperedBytes = new TextEncoder().encode(JSON.stringify(tamperedManifest));

    const verifyDeps = makeDeps({ existing: { ...written, [paths.manifestPath]: tamperedBytes } });
    await expect(verifyCalibrationCorpus(verifyDeps, paths)).rejects.toThrow(/sourceLockHash/i);
    expect(verifyDeps.buildSourceLock).not.toHaveBeenCalled();
    expect(verifyDeps.buildCandidatePool).not.toHaveBeenCalled();
    expect(verifyDeps.checkImage).not.toHaveBeenCalled();
  });
});

describe('Task 4 audit correction: committed skips must be plausible pool members', () => {
  const paths = {
    sourceLockPath: '/virtual/eval/nutrition/calibration-source-lock.json',
    manifestPath: '/virtual/eval/nutrition/calibration-manifest.json',
  };

  const STABLE_RETRIEVED_AT = '2026-09-24T00:00:00.000Z';

  function canonicalForTest(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => canonicalForTest(item));
    if (value !== null && typeof value === 'object') {
      const source = value as Record<string, unknown>;
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(source).sort()) {
        sorted[key] = canonicalForTest(source[key]);
      }
      return sorted;
    }
    return value;
  }

  function canonicalJsonBytes(value: unknown): Uint8Array {
    return new TextEncoder().encode(JSON.stringify(canonicalForTest(value)));
  }

  function validSourceLockStub(): Record<string, unknown> {
    return {
      version: 1,
      datasetId: 'calorix-n5k-calibration-v1',
      baseUrl: NUTRITION5K_BASE_URL,
      retrievalProvenance: { retrievedAt: STABLE_RETRIEVED_AT, baseUrl: NUTRITION5K_BASE_URL },
      sources: {
        trainSplit: {
          path: CALIBRATION_SOURCE_PATHS.trainSplit,
          url: buildSourceUrl(CALIBRATION_SOURCE_PATHS.trainSplit),
          sha256: 'a'.repeat(64),
          byteLength: 1024,
        },
        metadataCafe1: {
          path: CALIBRATION_SOURCE_PATHS.metadataCafe1,
          url: buildSourceUrl(CALIBRATION_SOURCE_PATHS.metadataCafe1),
          sha256: 'b'.repeat(64),
          byteLength: 2048,
        },
        metadataCafe2: {
          path: CALIBRATION_SOURCE_PATHS.metadataCafe2,
          url: buildSourceUrl(CALIBRATION_SOURCE_PATHS.metadataCafe2),
          sha256: 'c'.repeat(64),
          byteLength: 4096,
        },
      },
      excludedDishes: [],
    };
  }

  function makeDeps(overrides: {
    existing?: Record<string, Uint8Array>;
    buildSourceLock?: () => Promise<unknown>;
    buildCandidatePool?: () => Promise<EligibleDish[]>;
    checkImage?: CheckImageFn;
  } = {}) {
    const existing = overrides.existing ?? {};
    const readArtifact = vi.fn(async (path: string) => existing[path]);
    const writeTempFile = vi.fn(async (finalPath: string, _bytes: Uint8Array) => `${finalPath}.tmp-1`);
    const renameToFinal = vi.fn(async () => undefined);
    const removeFile = vi.fn(async () => undefined);
    const buildSourceLock = vi.fn(overrides.buildSourceLock ?? (async () => validSourceLockStub()));
    const buildCandidatePool = vi.fn(overrides.buildCandidatePool ?? (async () => buildFullFitPool()));
    const checkImage: CheckImageFn = vi.fn(
      overrides.checkImage ?? (async () => ({ ok: true, sha256: 'a'.repeat(64), width: 640, height: 480 })),
    );
    return { readArtifact, writeTempFile, renameToFinal, removeFile, buildSourceLock, buildCandidatePool, checkImage };
  }

  function writtenArtifacts(pinDeps: ReturnType<typeof makeDeps>): Record<string, Uint8Array> {
    const written: Record<string, Uint8Array> = {};
    for (const call of pinDeps.writeTempFile.mock.calls) {
      written[call[0] as string] = call[1] as Uint8Array;
    }
    return written;
  }

  it('rejects a fabricated skip for a dish ID absent from the eligible pool', async () => {
    const pinDeps = makeDeps();
    await pinCalibrationCorpus(pinDeps, paths);
    const written = writtenArtifacts(pinDeps);
    const fabricated = {
      dishId: 'dish_9999999999',
      stratum: { componentBin: 0, calorieBin: 0, macroBin: 0 },
      reason: 'fetch_error',
    };
    const baseLock = JSON.parse(new TextDecoder().decode(written[paths.sourceLockPath]!)) as Record<string, unknown>;
    const existingSkips = (baseLock['skippedImages'] as Array<Record<string, unknown>>) ?? [];
    const tamperedLock = { ...baseLock, skippedImages: [...existingSkips, fabricated] };
    const newLockHash = hashCalibrationSourceLock(tamperedLock);
    const baseManifest = JSON.parse(new TextDecoder().decode(written[paths.manifestPath]!)) as Record<string, unknown>;
    const tamperedManifest = { ...baseManifest, sourceLockHash: newLockHash };
    const verifyDeps = makeDeps({
      existing: {
        [paths.sourceLockPath]: canonicalJsonBytes(tamperedLock),
        [paths.manifestPath]: canonicalJsonBytes(tamperedManifest),
      },
    });
    await expect(verifyCalibrationCorpus(verifyDeps, paths)).rejects.toThrow();
  });

  it('rejects a fabricated skip whose stratum does not match the pool dish stratum', async () => {
    const pool = buildFullFitPool();
    const pinDeps = makeDeps({ buildCandidatePool: async () => pool });
    await pinCalibrationCorpus(pinDeps, paths);
    const written = writtenArtifacts(pinDeps);
    const victim = pool.find((d) => d.componentBin === 0 && d.calorieBin === 0 && d.macroBin === 0)!;
    const fabricated = {
      dishId: victim.dishId,
      stratum: { componentBin: 2, calorieBin: 2, macroBin: 2 },
      reason: 'fetch_error',
    };
    const baseLock = JSON.parse(new TextDecoder().decode(written[paths.sourceLockPath]!)) as Record<string, unknown>;
    const tamperedLock = { ...baseLock, skippedImages: [fabricated] };
    const newLockHash = hashCalibrationSourceLock(tamperedLock);
    const baseManifest = JSON.parse(new TextDecoder().decode(written[paths.manifestPath]!)) as Record<string, unknown>;
    const tamperedManifest = { ...baseManifest, sourceLockHash: newLockHash };
    const verifyDeps = makeDeps({
      existing: {
        [paths.sourceLockPath]: canonicalJsonBytes(tamperedLock),
        [paths.manifestPath]: canonicalJsonBytes(tamperedManifest),
      },
      buildCandidatePool: async () => pool,
    });
    await expect(verifyCalibrationCorpus(verifyDeps, paths)).rejects.toThrow();
  });

  it('rejects a fabricated skip in a stratum the schedule never requires', async () => {
    const pool = buildFullFitPool();
    const extraDish: EligibleDish = {
      dishId: 'dish_7999999999',
      componentBin: 2,
      calorieBin: 0,
      macroBin: 0,
      totalCalories: 200,
      totalMass: 150,
      totalFat: 5,
      totalCarb: 20,
      totalProtein: 10,
    };
    const poolWithExtra = [...pool, extraDish];
    const pinDeps = makeDeps({ buildCandidatePool: async () => pool });
    await pinCalibrationCorpus(pinDeps, paths);
    const written = writtenArtifacts(pinDeps);
    const fabricated = {
      dishId: extraDish.dishId,
      stratum: { componentBin: 2, calorieBin: 0, macroBin: 0 },
      reason: 'fetch_error',
    };
    const baseLock = JSON.parse(new TextDecoder().decode(written[paths.sourceLockPath]!)) as Record<string, unknown>;
    const tamperedLock = { ...baseLock, skippedImages: [fabricated] };
    const newLockHash = hashCalibrationSourceLock(tamperedLock);
    const baseManifest = JSON.parse(new TextDecoder().decode(written[paths.manifestPath]!)) as Record<string, unknown>;
    const tamperedManifest = { ...baseManifest, sourceLockHash: newLockHash };
    const verifyDeps = makeDeps({
      existing: {
        [paths.sourceLockPath]: canonicalJsonBytes(tamperedLock),
        [paths.manifestPath]: canonicalJsonBytes(tamperedManifest),
      },
      buildCandidatePool: async () => poolWithExtra,
    });
    await expect(verifyCalibrationCorpus(verifyDeps, paths)).rejects.toThrow();
  });

  it('rejects a fabricated irrelevant skip that ranks after every selected member of its stratum', async () => {
    const pool = buildFullFitPool({ '0,0,0': 4 });
    const stratumMembers = [...pool]
      .filter((d) => d.componentBin === 0 && d.calorieBin === 0 && d.macroBin === 0)
      .map((d) => d.dishId)
      .sort(byLocalRank);
    const irrelevantId = stratumMembers[stratumMembers.length - 1]!;
    const pinDeps = makeDeps({ buildCandidatePool: async () => pool });
    await pinCalibrationCorpus(pinDeps, paths);
    const written = writtenArtifacts(pinDeps);
    const lockJson = JSON.parse(new TextDecoder().decode(written[paths.sourceLockPath]!)) as {
      skippedImages: Array<Record<string, unknown>>;
    };
    expect(lockJson.skippedImages).toEqual([]);
    const selectedIds = (JSON.parse(new TextDecoder().decode(written[paths.manifestPath]!)) as {
      cases: Array<{ source: { objectId: string } }>;
    }).cases.map((c) => c.source.objectId);
    expect(selectedIds).not.toContain(irrelevantId);
    const fabricated = {
      dishId: irrelevantId,
      stratum: { componentBin: 0, calorieBin: 0, macroBin: 0 },
      reason: 'fetch_error',
    };
    const baseLock = JSON.parse(new TextDecoder().decode(written[paths.sourceLockPath]!)) as Record<string, unknown>;
    const tamperedLock = { ...baseLock, skippedImages: [fabricated] };
    const newLockHash = hashCalibrationSourceLock(tamperedLock);
    const baseManifest = JSON.parse(new TextDecoder().decode(written[paths.manifestPath]!)) as Record<string, unknown>;
    const tamperedManifest = { ...baseManifest, sourceLockHash: newLockHash };
    const verifyDeps = makeDeps({
      existing: {
        [paths.sourceLockPath]: canonicalJsonBytes(tamperedLock),
        [paths.manifestPath]: canonicalJsonBytes(tamperedManifest),
      },
      buildCandidatePool: async () => pool,
    });
    await expect(verifyCalibrationCorpus(verifyDeps, paths)).rejects.toThrow();
  });
});

describe('Task 4 audit correction: strict CLI argv (exact --pin / --verify only)', () => {
  const dummyPaths = {
    repoRoot: '/virtual/repo',
    sourceLockPath: '/virtual/eval/nutrition/calibration-source-lock.json',
    manifestPath: '/virtual/eval/nutrition/calibration-manifest.json',
  };

  it.each([
    ['unknown flag', ['--bogus']],
    ['positional argument', ['dish_123']],
    ['trailing positional after valid flag', ['--pin', 'extra']],
    ['duplicate --pin', ['--pin', '--pin']],
    ['duplicate --verify', ['--verify', '--verify']],
    ['both flags plus duplicate', ['--pin', '--verify', '--pin']],
    ['empty string positional', ['--pin', '']],
    ['single-dash variant', ['-pin']],
  ])('rejects %s without touching paths or network', async (_label, argv) => {
    const fetchFn = vi.fn(async (_url: string): Promise<Response> => {
      throw new Error('network must not be touched for invalid argv');
    });
    const result = await runCalibrationCorpusCli(argv, { fetchFn: fetchFn as unknown as typeof fetch, runtimePaths: dummyPaths });
    expect(result.exitCode).toBe(1);
    expect(result.message).toBeTruthy();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

// ── Task 4a RED: official semantic exclusions ─────────────────────────────────
//
// Live-pin correction (2026-09-24): official metadata contains structurally
// valid rows with invalid total-nutrition semantics (e.g. train row
// `dish_1556575700`: 0 kcal, 86 g, zero macros). The reviewed correction keeps
// RFC 4180 / group-count / finite-number / ingredient-group validation strict
// for every row, parses zero/negative totals structurally, and applies
// positive-total-mass/calories plus non-negative-total-macro eligibility only
// to train candidates after frozen-ID removal. Invalid or metadata-missing
// train candidates become a canonical, source-lock-hash-bound `excludedDishes`
// list with stable typed reasons; non-train invalid rows never appear in it.
// Every test below fails until calibration-corpus.ts + schema.ts implement
// that correction (Steps 4a–4b); no test here changes production behavior.

describe('Task 4a RED: structurally valid zero totals parse (totals are eligibility, not parse errors)', () => {
  const zeroTotalRow = 'dish_1556575700,0,86,0,0,0,ingr_z1,Plain rice,86,0,0,0,0';

  it('parses a structurally valid zero-total row instead of throwing', () => {
    const [row] = parseDishMetadataCsv(zeroTotalRow);
    expect(row!.dishId).toBe('dish_1556575700');
    expect(row!.totalCalories).toBe(0);
    expect(row!.totalMass).toBe(86);
    expect(row!.totalFat).toBe(0);
    expect(row!.totalCarb).toBe(0);
    expect(row!.totalProtein).toBe(0);
    expect(row!.ingredients).toHaveLength(1);
  });

  it('keeps strict ingredient-group validation for zero-total rows', () => {
    const zeroGrams = 'dish_1556575701,0,86,0,0,0,ingr_z1,Plain rice,0,0,0,0,0';
    expect(() => parseDishMetadataCsv(zeroGrams)).toThrow();
    const negativeIngredientCalories = 'dish_1556575702,0,86,0,0,0,ingr_z1,Plain rice,86,-1,0,0,0';
    expect(() => parseDishMetadataCsv(negativeIngredientCalories)).toThrow();
    const emptyIngredientId = 'dish_1556575703,0,86,0,0,0,,Plain rice,86,0,0,0,0';
    expect(() => parseDishMetadataCsv(emptyIngredientId)).toThrow();
  });

  it('buildEligibleDishes omits train rows with non-positive totals or negative total macros', () => {
    function totalsRow(
      dishId: string,
      totals: { calories: number; mass: number; fat: number; carb: number; protein: number },
    ) {
      return {
        dishId,
        totalCalories: totals.calories,
        totalMass: totals.mass,
        totalFat: totals.fat,
        totalCarb: totals.carb,
        totalProtein: totals.protein,
        ingredients: [{ ingredientId: 'i1', name: 'x', grams: 10, calories: 20, fat: 1, carb: 2, protein: 1 }],
      };
    }
    const metadataById = new Map([
      ['dish_6000000011', totalsRow('dish_6000000011', { calories: 0, mass: 86, fat: 0, carb: 0, protein: 0 })],
      ['dish_6000000012', totalsRow('dish_6000000012', { calories: 100, mass: 0, fat: 2, carb: 10, protein: 5 })],
      ['dish_6000000013', totalsRow('dish_6000000013', { calories: 100, mass: 50, fat: -1, carb: 10, protein: 5 })],
      ['dish_6000000014', totalsRow('dish_6000000014', { calories: 100, mass: 50, fat: 2, carb: 10, protein: 5 })],
    ]);
    const eligible = buildEligibleDishes(
      ['dish_6000000011', 'dish_6000000012', 'dish_6000000013', 'dish_6000000014'],
      metadataById as never,
    );
    expect(eligible.map((d) => d.dishId)).toEqual(['dish_6000000014']);
  });
});

describe('Task 4a RED: canonical train-only excludedDishes builder', () => {
  // Stable typed reason vocabulary for the canonical exclusion list. The
  // GREEN implementation (Step 4b) must use exactly these literals.
  type ExclusionReason = 'non_positive_calories' | 'non_positive_mass' | 'negative_macros' | 'missing_metadata';

  interface MetadataTotals {
    dishId: string;
    totalCalories: number;
    totalMass: number;
    totalFat: number;
    totalCarb: number;
    totalProtein: number;
  }

  type ExclusionBuilder = (
    trainSplitIds: string[],
    metadataById: Map<string, MetadataTotals>,
  ) => Array<{ dishId: string; reason: ExclusionReason }>;

  async function loadExclusionBuilder(): Promise<ExclusionBuilder> {
    const module = (await import(
      '../../src/nutrition-eval/calibration-corpus'
    )) as Record<string, unknown>;
    const builder = module['buildExcludedDishes'] as ExclusionBuilder | undefined;
    if (typeof builder !== 'function') {
      throw new Error('RED: buildExcludedDishes is not implemented (expected missing exclusion behavior)');
    }
    return builder;
  }

  function totalsRow(
    dishId: string,
    totals: { calories: number; mass: number; fat: number; carb: number; protein: number },
  ): MetadataTotals {
    return {
      dishId,
      totalCalories: totals.calories,
      totalMass: totals.mass,
      totalFat: totals.fat,
      totalCarb: totals.carb,
      totalProtein: totals.protein,
    };
  }

  it('exposes a canonical train-only exclusion builder', async () => {
    await loadExclusionBuilder();
  });

  it('records train candidates with non-positive calories/mass or negative total macros with stable typed reasons', async () => {
    const buildExcludedDishes = await loadExclusionBuilder();
    const metadataById = new Map([
      ['dish_6000000021', totalsRow('dish_6000000021', { calories: 0, mass: 86, fat: 0, carb: 0, protein: 0 })],
      ['dish_6000000022', totalsRow('dish_6000000022', { calories: 100, mass: 0, fat: 2, carb: 10, protein: 5 })],
      ['dish_6000000023', totalsRow('dish_6000000023', { calories: 100, mass: 50, fat: 2, carb: -1, protein: 5 })],
      ['dish_6000000024', totalsRow('dish_6000000024', { calories: -5, mass: 50, fat: 2, carb: 10, protein: -1 })],
      ['dish_6000000025', totalsRow('dish_6000000025', { calories: 100, mass: 50, fat: 2, carb: 10, protein: 5 })],
    ]);
    expect(
      buildExcludedDishes(
        ['dish_6000000021', 'dish_6000000022', 'dish_6000000023', 'dish_6000000024', 'dish_6000000025'],
        metadataById,
      ),
    ).toEqual([
      { dishId: 'dish_6000000021', reason: 'non_positive_calories' },
      { dishId: 'dish_6000000022', reason: 'non_positive_mass' },
      { dishId: 'dish_6000000023', reason: 'negative_macros' },
      { dishId: 'dish_6000000024', reason: 'non_positive_calories' },
    ]);
  });

  it('records train IDs missing from merged metadata as missing_metadata', async () => {
    const buildExcludedDishes = await loadExclusionBuilder();
    const metadataById = new Map([
      ['dish_6000000031', totalsRow('dish_6000000031', { calories: 100, mass: 50, fat: 2, carb: 10, protein: 5 })],
    ]);
    expect(buildExcludedDishes(['dish_6000000031', 'dish_6000000032'], metadataById)).toEqual([
      { dishId: 'dish_6000000032', reason: 'missing_metadata' },
    ]);
  });

  it('never records non-train invalid rows as exclusions', async () => {
    const buildExcludedDishes = await loadExclusionBuilder();
    const metadataById = new Map([
      // Structurally valid but semantically invalid; absent from the train
      // split, so it must never enter the exclusion list.
      ['dish_6000000041', totalsRow('dish_6000000041', { calories: 0, mass: 10, fat: 0, carb: 0, protein: 0 })],
      ['dish_6000000042', totalsRow('dish_6000000042', { calories: 100, mass: 50, fat: 2, carb: 10, protein: 5 })],
    ]);
    expect(buildExcludedDishes(['dish_6000000042'], metadataById)).toEqual([]);
  });

  it('never records frozen public-manifest IDs as exclusions', async () => {
    const buildExcludedDishes = await loadExclusionBuilder();
    const frozenId = FROZEN_PUBLIC_MANIFEST_DISH_IDS[0]!;
    const metadataById = new Map([
      [frozenId, totalsRow(frozenId, { calories: 100, mass: 50, fat: 2, carb: 10, protein: 5 })],
    ]);
    expect(buildExcludedDishes([frozenId], metadataById)).toEqual([]);
  });

  it('returns exclusions sorted canonically by dishId regardless of input order', async () => {
    const buildExcludedDishes = await loadExclusionBuilder();
    const metadataById = new Map([
      ['dish_6000000052', totalsRow('dish_6000000052', { calories: 0, mass: 10, fat: 0, carb: 0, protein: 0 })],
      ['dish_6000000051', totalsRow('dish_6000000051', { calories: 0, mass: 10, fat: 0, carb: 0, protein: 0 })],
    ]);
    const forward = buildExcludedDishes(['dish_6000000051', 'dish_6000000052'], metadataById);
    const reversed = buildExcludedDishes(['dish_6000000052', 'dish_6000000051'], metadataById);
    expect(forward).toEqual([
      { dishId: 'dish_6000000051', reason: 'non_positive_calories' },
      { dishId: 'dish_6000000052', reason: 'non_positive_calories' },
    ]);
    expect(reversed).toEqual(forward);
  });
});

describe('Task 4a RED: pin binds exclusions; verify reconstructs them before image calls/writes', () => {
  const exclusionPaths = {
    sourceLockPath: '/virtual/eval/nutrition/calibration-source-lock.json',
    manifestPath: '/virtual/eval/nutrition/calibration-manifest.json',
  };

  const STABLE_RETRIEVED_AT = '2026-09-24T00:00:00.000Z';

  function exclusionLockStub(excludedDishes: Array<Record<string, unknown>>): Record<string, unknown> {
    return {
      version: 1,
      datasetId: 'calorix-n5k-calibration-v1',
      baseUrl: NUTRITION5K_BASE_URL,
      retrievalProvenance: { retrievedAt: STABLE_RETRIEVED_AT, baseUrl: NUTRITION5K_BASE_URL },
      sources: {
        trainSplit: {
          path: CALIBRATION_SOURCE_PATHS.trainSplit,
          url: buildSourceUrl(CALIBRATION_SOURCE_PATHS.trainSplit),
          sha256: 'a'.repeat(64),
          byteLength: 1024,
        },
        metadataCafe1: {
          path: CALIBRATION_SOURCE_PATHS.metadataCafe1,
          url: buildSourceUrl(CALIBRATION_SOURCE_PATHS.metadataCafe1),
          sha256: 'b'.repeat(64),
          byteLength: 2048,
        },
        metadataCafe2: {
          path: CALIBRATION_SOURCE_PATHS.metadataCafe2,
          url: buildSourceUrl(CALIBRATION_SOURCE_PATHS.metadataCafe2),
          sha256: 'c'.repeat(64),
          byteLength: 4096,
        },
      },
      excludedDishes,
    };
  }

  function canonicalJsonBytes(value: unknown): Uint8Array {
    const canonicalize = (input: unknown): unknown => {
      if (Array.isArray(input)) return input.map((item) => canonicalize(item));
      if (input !== null && typeof input === 'object') {
        const sorted: Record<string, unknown> = {};
        for (const key of Object.keys(input as Record<string, unknown>).sort()) {
          sorted[key] = canonicalize((input as Record<string, unknown>)[key]);
        }
        return sorted;
      }
      return input;
    };
    return new TextEncoder().encode(JSON.stringify(canonicalize(value)));
  }

  function pinExclusionBaseline(
    excludedDishes: Array<Record<string, unknown>>,
    overrides: {
      buildCandidatePool?: () => Promise<EligibleDish[]>;
      checkImage?: CheckImageFn;
    } = {},
  ) {
    const written: Record<string, Uint8Array> = {};
    const readArtifact = vi.fn(async (path: string) => written[path]);
    const writeTempFile = vi.fn(async (finalPath: string, bytes: Uint8Array) => {
      written[finalPath] = bytes;
      return `${finalPath}.tmp-1`;
    });
    const renameToFinal = vi.fn(async () => undefined);
    const removeFile = vi.fn(async () => undefined);
    const buildSourceLock = vi.fn(async () => exclusionLockStub(excludedDishes));
    const buildCandidatePool = vi.fn(overrides.buildCandidatePool ?? (async () => buildFullFitPool()));
    const checkImage: CheckImageFn = vi.fn(
      overrides.checkImage ?? (async () => ({ ok: true, sha256: 'a'.repeat(64), width: 640, height: 480 })),
    );
    return {
      deps: { readArtifact, writeTempFile, renameToFinal, removeFile, buildSourceLock, buildCandidatePool, checkImage },
      written,
    };
  }

  it('pin preserves canonical excludedDishes in the committed lock and binds them into the manifest sourceLockHash', async () => {
    const excludedDishes = [{ dishId: 'dish_1556575700', reason: 'non_positive_calories' }];
    const { deps, written } = pinExclusionBaseline(excludedDishes);
    await pinCalibrationCorpus(deps, exclusionPaths);
    const lockJson = JSON.parse(new TextDecoder().decode(written[exclusionPaths.sourceLockPath]!)) as Record<
      string,
      unknown
    >;
    expect(lockJson['excludedDishes']).toEqual(excludedDishes);
    const manifestJson = JSON.parse(new TextDecoder().decode(written[exclusionPaths.manifestPath]!)) as Record<
      string,
      unknown
    >;
    expect(manifestJson['sourceLockHash']).toBe(hashCalibrationSourceLock(lockJson));
  });

  async function tamperedVerifyDeps(
    baselineExcluded: Array<Record<string, unknown>>,
    tamperExcluded: (baseline: Array<Record<string, unknown>>) => Array<Record<string, unknown>>,
  ) {
    const { deps, written } = pinExclusionBaseline(baselineExcluded);
    await pinCalibrationCorpus(deps, exclusionPaths);
    const baseLock = JSON.parse(new TextDecoder().decode(written[exclusionPaths.sourceLockPath]!)) as Record<
      string,
      unknown
    >;
    const baseManifest = JSON.parse(new TextDecoder().decode(written[exclusionPaths.manifestPath]!)) as Record<
      string,
      unknown
    >;
    const tamperedLock = { ...baseLock, excludedDishes: tamperExcluded(baseLock['excludedDishes'] as Array<Record<string, unknown>>) };
    // Order-drifted tampered locks are schema-invalid by design (non-canonical
    // exclusion order); hashCalibrationSourceLock parses before hashing and
    // therefore throws instead of returning a hash. Fall back to a manual
    // canonical hash so the committed bytes can still be constructed — verify
    // must then fail closed on the committed schema/exclusion check before any
    // image check or write.
    let tamperedHash: string;
    try {
      tamperedHash = hashCalibrationSourceLock(tamperedLock);
    } catch {
      const canonicalize = (input: unknown): unknown => {
        if (Array.isArray(input)) return input.map((item) => canonicalize(item));
        if (input !== null && typeof input === 'object') {
          const sorted: Record<string, unknown> = {};
          for (const key of Object.keys(input as Record<string, unknown>).sort()) {
            sorted[key] = canonicalize((input as Record<string, unknown>)[key]);
          }
          return sorted;
        }
        return input;
      };
      const { createHash: createHashFallback } = await import('crypto');
      tamperedHash = createHashFallback('sha256')
        .update(JSON.stringify(canonicalize(tamperedLock)), 'utf8')
        .digest('hex');
    }
    const tamperedManifest = { ...baseManifest, sourceLockHash: tamperedHash };
    const checkImage = vi.fn(async () => ({ ok: true, sha256: 'a'.repeat(64), width: 640, height: 480 }));
    const writeTempFile = vi.fn(async (finalPath: string, _bytes: Uint8Array) => `${finalPath}.tmp-1`);
    const renameToFinal = vi.fn(async () => undefined);
    const verifyDeps = {
      readArtifact: vi.fn(async (path: string) =>
        path === exclusionPaths.sourceLockPath
          ? canonicalJsonBytes(tamperedLock)
          : canonicalJsonBytes(tamperedManifest),
      ),
      writeTempFile,
      renameToFinal,
      removeFile: vi.fn(async () => undefined),
      buildSourceLock: vi.fn(async () => exclusionLockStub(baselineExcluded)),
      buildCandidatePool: vi.fn(async () => buildFullFitPool()),
      checkImage: checkImage as CheckImageFn,
    };
    return { verifyDeps, checkImage, writeTempFile, renameToFinal };
  }

  it('verify fails with an exclusion error before any image check/write when a committed exclusion is omitted', async () => {
    const baseline = [
      { dishId: 'dish_1556575700', reason: 'non_positive_calories' },
      { dishId: 'dish_1556575701', reason: 'missing_metadata' },
    ];
    const { verifyDeps, checkImage, writeTempFile, renameToFinal } = await tamperedVerifyDeps(baseline, (list) =>
      list.slice(1),
    );
    await expect(verifyCalibrationCorpus(verifyDeps, exclusionPaths)).rejects.toThrow(/exclusion/i);
    expect(checkImage).not.toHaveBeenCalled();
    expect(writeTempFile).not.toHaveBeenCalled();
    expect(renameToFinal).not.toHaveBeenCalled();
  });

  it('verify fails with an exclusion error before any image check/write when an exclusion is added', async () => {
    const baseline = [{ dishId: 'dish_1556575700', reason: 'non_positive_calories' }];
    const { verifyDeps, checkImage, writeTempFile, renameToFinal } = await tamperedVerifyDeps(baseline, (list) => [
      ...list,
      { dishId: 'dish_1556575799', reason: 'missing_metadata' },
    ]);
    await expect(verifyCalibrationCorpus(verifyDeps, exclusionPaths)).rejects.toThrow(/exclusion/i);
    expect(checkImage).not.toHaveBeenCalled();
    expect(writeTempFile).not.toHaveBeenCalled();
    expect(renameToFinal).not.toHaveBeenCalled();
  });

  it('verify fails with an exclusion error before any image check/write when an exclusion reason is tampered', async () => {
    const baseline = [{ dishId: 'dish_1556575700', reason: 'non_positive_calories' }];
    const { verifyDeps, checkImage, writeTempFile, renameToFinal } = await tamperedVerifyDeps(baseline, (list) => [
      { ...list[0], reason: 'missing_metadata' },
    ]);
    await expect(verifyCalibrationCorpus(verifyDeps, exclusionPaths)).rejects.toThrow(/exclusion/i);
    expect(checkImage).not.toHaveBeenCalled();
    expect(writeTempFile).not.toHaveBeenCalled();
    expect(renameToFinal).not.toHaveBeenCalled();
  });

  it('verify fails with an exclusion error before any image check/write on exclusion order drift', async () => {
    const baseline = [
      { dishId: 'dish_1556575700', reason: 'non_positive_calories' },
      { dishId: 'dish_1556575701', reason: 'missing_metadata' },
    ];
    const { verifyDeps, checkImage, writeTempFile, renameToFinal } = await tamperedVerifyDeps(baseline, (list) => [
      list[1]!,
      list[0]!,
    ]);
    await expect(verifyCalibrationCorpus(verifyDeps, exclusionPaths)).rejects.toThrow(/exclusion/i);
    expect(checkImage).not.toHaveBeenCalled();
    expect(writeTempFile).not.toHaveBeenCalled();
    expect(renameToFinal).not.toHaveBeenCalled();
  });

  it('verify fails with an exclusion error when an exclusion overlaps a selected manifest ID', async () => {
    const { deps, written } = pinExclusionBaseline([{ dishId: 'dish_1556575700', reason: 'non_positive_calories' }]);
    await pinCalibrationCorpus(deps, exclusionPaths);
    const baseLock = JSON.parse(new TextDecoder().decode(written[exclusionPaths.sourceLockPath]!)) as Record<
      string,
      unknown
    >;
    const baseManifest = JSON.parse(new TextDecoder().decode(written[exclusionPaths.manifestPath]!)) as Record<
      string,
      unknown
    >;
    const selectedId = (baseManifest['cases'] as Array<{ source: { objectId: string } }>)[0]!.source.objectId;
    const tamperedLock = {
      ...baseLock,
      excludedDishes: [
        ...(baseLock['excludedDishes'] as Array<Record<string, unknown>>),
        { dishId: selectedId, reason: 'missing_metadata' },
      ],
    };
    const tamperedManifest = { ...baseManifest, sourceLockHash: hashCalibrationSourceLock(tamperedLock) };
    const checkImage = vi.fn(async () => ({ ok: true, sha256: 'a'.repeat(64), width: 640, height: 480 }));
    const verifyDeps = {
      readArtifact: vi.fn(async (path: string) =>
        path === exclusionPaths.sourceLockPath ? canonicalJsonBytes(tamperedLock) : canonicalJsonBytes(tamperedManifest),
      ),
      writeTempFile: vi.fn(async (finalPath: string, _bytes: Uint8Array) => `${finalPath}.tmp-1`),
      renameToFinal: vi.fn(async () => undefined),
      removeFile: vi.fn(async () => undefined),
      buildSourceLock: vi.fn(async () => exclusionLockStub([{ dishId: 'dish_1556575700', reason: 'non_positive_calories' }])),
      buildCandidatePool: vi.fn(async () => buildFullFitPool()),
      checkImage: checkImage as CheckImageFn,
    };
    await expect(verifyCalibrationCorpus(verifyDeps, exclusionPaths)).rejects.toThrow(/exclusion/i);
    expect(checkImage).not.toHaveBeenCalled();
  });
});
