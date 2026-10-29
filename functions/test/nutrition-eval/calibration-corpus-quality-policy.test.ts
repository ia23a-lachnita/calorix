import { createHash } from 'crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  parseQualityVocabulary, prepareQualityPool, rankQualityDish, selectQualityCandidates,
} from '../../src/nutrition-eval/calibration-corpus-quality-policy';
import type {
  QualityPool, QualitySourceBundle, QualitySourcePins,
} from '../../src/nutrition-eval/calibration-corpus-quality-policy';
import { fillCalibrationSlots } from '../../src/nutrition-eval/calibration-corpus';
import type { EligibleDish } from '../../src/nutrition-eval/calibration-corpus';

import type { ExpectedSourceBytes } from '../../src/nutrition-eval/calibration-corpus';

// ── Fixture helpers (test-local; production has no fixture pin helper) ─────

const VOCAB_HEADER = 'ingr,id,cal/g,fat(g),carb(g),protein(g)';

function pinFor(bytes: Uint8Array): ExpectedSourceBytes {
  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    byteLength: bytes.length,
  };
}

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

// Tiny real-rate fixture: apple (id 54) and a deprecated entry (id 453),
// using the actual official vocabulary rates for those two IDs.
const VALID_VOCAB_TEXT =
  `${VOCAB_HEADER}\n` +
  'apple,54,0.520,0.002,0.140,0.003\n' +
  'deprecated,453,0.520,0.002,0.003,0.140\n';

describe('parseQualityVocabulary: valid input parsing', () => {
  it('parses an ordinary valid vocabulary into the exact named rates and flags', () => {
    const bytes = encode(VALID_VOCAB_TEXT);
    const vocabulary = parseQualityVocabulary(bytes, pinFor(bytes));

    expect(vocabulary.size).toBe(2);

    const apple = vocabulary.get('ingr_0000000054');
    expect(apple).toEqual({
      ingredientId: 'ingr_0000000054',
      name: 'apple',
      caloriesPerG: 0.52,
      fatPerG: 0.002,
      carbsPerG: 0.14,
      proteinPerG: 0.003,
      deprecated: false,
    });

    const deprecatedEntry = vocabulary.get('ingr_0000000453');
    expect(deprecatedEntry).toEqual({
      ingredientId: 'ingr_0000000453',
      name: 'deprecated',
      caloriesPerG: 0.52,
      fatPerG: 0.002,
      carbsPerG: 0.003,
      proteinPerG: 0.14,
      deprecated: true,
    });
  });

  it('flags a name as deprecated when it only matches "deprecated" after trim and case-fold', () => {
    const bytes = encode(
      `${VOCAB_HEADER}\n` + 'apple,54,0.520,0.002,0.140,0.003\n' + '  DEPRECATED  ,453,0.520,0.002,0.003,0.140\n',
    );
    const vocabulary = parseQualityVocabulary(bytes, pinFor(bytes));

    expect(vocabulary.get('ingr_0000000453')?.deprecated).toBe(true);
    expect(vocabulary.get('ingr_0000000054')?.deprecated).toBe(false);
  });

  it('parses an RFC 4180 quoted name containing an embedded comma', () => {
    const bytes = encode(
      `${VOCAB_HEADER}\n` + '"apple, red",54,0.520,0.002,0.140,0.003\n' + 'deprecated,453,0.520,0.002,0.003,0.140\n',
    );
    const vocabulary = parseQualityVocabulary(bytes, pinFor(bytes));

    expect(vocabulary.get('ingr_0000000054')?.name).toBe('apple, red');
  });
});

describe('parseQualityVocabulary: source verification precedes parsing', () => {
  it('rejects a sha256 mismatch before attempting to parse otherwise-malformed bytes', () => {
    const bytes = encode('this is not a valid vocabulary CSV at all');
    const expected: ExpectedSourceBytes = {
      sha256: 'f'.repeat(64),
      byteLength: bytes.length,
    };

    expect(() => parseQualityVocabulary(bytes, expected)).toThrow(/sha256 mismatch/i);
  });

  it('rejects a byte-length mismatch', () => {
    const bytes = encode(VALID_VOCAB_TEXT);
    const expected: ExpectedSourceBytes = {
      sha256: pinFor(bytes).sha256,
      byteLength: bytes.length + 1,
    };

    expect(() => parseQualityVocabulary(bytes, expected)).toThrow(/byte-length mismatch/i);
  });
});

describe('parseQualityVocabulary: format rejection', () => {
  it('rejects a header that does not exactly match the six fixed columns', () => {
    const bytes = encode(
      'name,id,kcal_per_g,fat_per_g,carbs_per_g,protein_per_g\n' + 'apple,54,0.520,0.002,0.140,0.003\n',
    );

    expect(() => parseQualityVocabulary(bytes, pinFor(bytes))).toThrow(/header/i);
  });

  it('rejects a duplicate numeric ingredient ID', () => {
    const bytes = encode(
      `${VOCAB_HEADER}\n` + 'apple,54,0.520,0.002,0.140,0.003\n' + 'apple again,54,0.300,0.010,0.200,0.100\n',
    );

    expect(() => parseQualityVocabulary(bytes, pinFor(bytes))).toThrow(/duplicate/i);
  });

  it('rejects a non-finite or negative numeric rate', () => {
    const nonFinite = encode(`${VOCAB_HEADER}\n` + 'apple,54,NaN,0.002,0.140,0.003\n');
    expect(() => parseQualityVocabulary(nonFinite, pinFor(nonFinite))).toThrow(/numeric|finite/i);

    const negative = encode(`${VOCAB_HEADER}\n` + 'apple,54,0.520,-0.002,0.140,0.003\n');
    expect(() => parseQualityVocabulary(negative, pinFor(negative))).toThrow(/negative|numeric/i);
  });

  it('rejects a blank numeric rate cell', () => {
    const blank = encode(`${VOCAB_HEADER}\n` + 'apple,54,,0.002,0.140,0.003\n');
    expect(() => parseQualityVocabulary(blank, pinFor(blank))).toThrow(/numeric|finite|empty/i);
  });
});

describe('parseQualityVocabulary: ingredient ID validation', () => {
  const invalidIds: Array<[label: string, id: string]> = [
    ['zero', '0'],
    ['negative', '-5'],
    ['fractional', '54.5'],
    ['non-decimal', '54a'],
    ['blank', ''],
    ['more than 10 digits', '12345678901'],
  ];

  it.each(invalidIds)('rejects an invalid ingredient ID (%s: %j)', (_label, badId) => {
    const bytes = encode(`${VOCAB_HEADER}\n` + `apple,${badId},0.520,0.002,0.140,0.003\n`);
    expect(() => parseQualityVocabulary(bytes, pinFor(bytes))).toThrow(/ingredient id/i);
  });
});

describe('parseQualityVocabulary: row arity', () => {
  it('rejects a row with fewer than six fields', () => {
    const bytes = encode(`${VOCAB_HEADER}\n` + 'apple,54,0.520,0.002,0.140\n');
    expect(() => parseQualityVocabulary(bytes, pinFor(bytes))).toThrow(/6 fields|six fields/i);
  });

  it('rejects a row with more than six fields', () => {
    const bytes = encode(`${VOCAB_HEADER}\n` + 'apple,54,0.520,0.002,0.140,0.003,extra\n');
    expect(() => parseQualityVocabulary(bytes, pinFor(bytes))).toThrow(/6 fields|six fields/i);
  });
});

describe('parseQualityVocabulary: empty vocabulary', () => {
  it('rejects a header-only vocabulary with zero ingredient rows', () => {
    const bytes = encode(`${VOCAB_HEADER}\n`);
    expect(() => parseQualityVocabulary(bytes, pinFor(bytes))).toThrow(/at least one|empty/i);
  });

  it('rejects a completely empty source (missing header)', () => {
    const bytes = encode('');
    expect(() => parseQualityVocabulary(bytes, pinFor(bytes))).toThrow(/header/i);
  });
});

describe('parseQualityVocabulary: source byte decoding', () => {
  it('rejects invalid UTF-8 bytes even when the byte pin matches exactly', () => {
    const bytes = new Uint8Array([0x80]); // lone continuation byte: not valid UTF-8
    const expected = pinFor(bytes);
    expect(expected.byteLength).toBe(1);

    expect(() => parseQualityVocabulary(bytes, expected)).toThrow(/utf-8|utf8/i);
  });
});

// Synthetic metadata exercises eligibility only; it does not replace any
// historical dish's nutrition. The committed v1 bytes supply quarantine IDs.
const V1_MANIFEST_BYTES = new Uint8Array(readFileSync(
  new URL('../../eval/nutrition/calibration-manifest.json', import.meta.url),
));
const V1_IDS: string[] = JSON.parse(new TextDecoder().decode(V1_MANIFEST_BYTES))
  .cases.map((row: { source: { objectId: string } }) => row.source.objectId);
const BENCHMARK_IDS = [
  'dish_1558549605', 'dish_1558639787', 'dish_1558639818', 'dish_1560456326',
  'dish_1561663580', 'dish_1562788601', 'dish_1564427430', 'dish_1565035746',
  'dish_1565898402', 'dish_1566328724', 'dish_1566838351', 'dish_1567107839',
];
const EXPECTED_QUARANTINE = [...V1_IDS, ...BENCHMARK_IDS].sort();
const POOL_VOCAB = VALID_VOCAB_TEXT +
  'fixture_a,1,1,0,0,0\nfixture_b,2,1,0,0,0\n';

function dishCsv(id: string, options: {
  ingredientIds?: number[]; names?: string[]; kcal?: number; mass?: number;
  fat?: number; carb?: number; protein?: number;
} = {}): string {
  const ids = options.ingredientIds ?? [54];
  const { kcal = 100, mass = 100, fat = 1, carb = 5, protein = 18 } = options;
  const fields: Array<string | number> = [id, kcal, mass, fat, carb, protein];
  ids.forEach((ingredient, index) => fields.push(
    `ingr_${String(ingredient).padStart(10, '0')}`, options.names?.[index] ?? 'fixture',
    Math.max(mass, 1) / ids.length, Math.max(kcal, 0) / ids.length,
    Math.max(fat, 0) / ids.length, Math.max(carb, 0) / ids.length,
    Math.max(protein, 0) / ids.length,
  ));
  return fields.join(',');
}

function bundleFor(rows: string[], trainIds?: string[]): QualitySourceBundle {
  return {
    cafe1: encode(rows.join('\n') + '\n'), cafe2: encode(''),
    trainSplit: encode((trainIds ?? rows.map(row => row.split(',')[0]!)).join('\n') + '\n'),
    vocabulary: encode(POOL_VOCAB), v1Manifest: V1_MANIFEST_BYTES.slice(),
  };
}

function pinsForBundle(bundle: QualitySourceBundle): QualitySourcePins {
  return {
    cafe1: pinFor(bundle.cafe1), cafe2: pinFor(bundle.cafe2),
    trainSplit: pinFor(bundle.trainSplit), vocabulary: pinFor(bundle.vocabulary),
    v1Manifest: pinFor(bundle.v1Manifest),
  };
}

describe('prepareQualityPool: trusted sources and semantic eligibility', () => {
  it.each(['cafe1', 'cafe2', 'trainSplit', 'vocabulary', 'v1Manifest'] as const)(
    'rejects the %s source pin before accepting a pool', key => {
      const bundle = bundleFor([dishCsv('dish_9000000001')]);
      const pins = pinsForBundle(bundle);
      pins[key] = { ...pins[key], sha256: 'f'.repeat(64) };
      expect(() => prepareQualityPool(bundle, pins)).toThrow(/sha256 mismatch/);
    },
  );

  it('checks every pin before parsing even an earlier malformed source', () => {
    const bundle = bundleFor([]);
    bundle.cafe1 = encode('not a dish CSV');
    const pins = pinsForBundle(bundle);
    pins.cafe2 = { ...pins.cafe2, sha256: 'f'.repeat(64) };
    expect(() => prepareQualityPool(bundle, pins)).toThrow(/sha256 mismatch/);
  });

  it('excludes deprecated IDs, deprecated descriptions and unknown IDs before ranking', () => {
    const bundle = bundleFor([
      dishCsv('dish_9000000004', { ingredientIds: [999, 998, 453] }),
      dishCsv('dish_9000000002', { ingredientIds: [453], names: [''] }),
      dishCsv('dish_9000000001', { names: [''] }),
      dishCsv('dish_9000000003', { names: [' DEPRECATED '] }),
    ]);
    const before = Object.fromEntries(Object.entries(bundle).map(([key, value]) => [key, [...value]]));
    const pool = prepareQualityPool(bundle, pinsForBundle(bundle));
    expect(pool.eligible.map(row => row.dishId)).toEqual(['dish_9000000001']);
    expect(pool.excluded).toEqual([
      { dishId: 'dish_9000000002', reason: 'deprecated_ingredient', affectedIngredientIds: ['ingr_0000000453'] },
      { dishId: 'dish_9000000003', reason: 'deprecated_ingredient', affectedIngredientIds: ['ingr_0000000054'] },
      { dishId: 'dish_9000000004', reason: 'unknown_ingredient', affectedIngredientIds: ['ingr_0000000998', 'ingr_0000000999'] },
    ]);
    expect(Object.fromEntries(Object.entries(bundle).map(([key, value]) => [key, [...value]]))).toEqual(before);
  });

  it('quarantines all forty old training dishes and twelve benchmark meals with exact digests', () => {
    const bundle = bundleFor([
      dishCsv(V1_IDS[0]!), dishCsv(BENCHMARK_IDS[0]!), dishCsv('dish_9000000001'),
    ]);
    const pool = prepareQualityPool(bundle, pinsForBundle(bundle));
    expect(pool.quarantineIds).toEqual(EXPECTED_QUARANTINE);
    expect(pool.quarantineIds).toHaveLength(52);
    expect(pool.quarantineDigest).toBe(createHash('sha256').update(JSON.stringify(EXPECTED_QUARANTINE)).digest('hex'));
    expect(pool.eligible.map(row => row.dishId)).toEqual(['dish_9000000001']);
    expect(pool.excluded.find(row => row.dishId === V1_IDS[0])?.reason).toBe('quarantined_v1');
    expect(pool.excluded.find(row => row.dishId === BENCHMARK_IDS[0])?.reason).toBe('quarantined_benchmark');
    expect(pool.sourceDigests).toEqual({
      cafe1: pinFor(bundle.cafe1).sha256, cafe2: pinFor(bundle.cafe2).sha256,
      trainSplit: pinFor(bundle.trainSplit).sha256, vocabulary: pinFor(bundle.vocabulary).sha256,
      v1Manifest: pinFor(bundle.v1Manifest).sha256,
    });
  });

  it('retains legacy totals and missing-metadata exclusions without reclassifying them as quality fixes', () => {
    const ids = [1, 2, 3, 4].map(n => `dish_900000000${n}`);
    const bundle = bundleFor([
      dishCsv(ids[0]!, { kcal: 0 }), dishCsv(ids[1]!, { mass: 0 }),
      dishCsv(ids[2]!, { fat: -1 }),
    ], ids);
    const pool = prepareQualityPool(bundle, pinsForBundle(bundle));
    expect(pool.eligible).toEqual([]);
    expect(pool.excluded.map(row => [row.dishId, row.reason])).toEqual([
      [ids[0], 'non_positive_calories'], [ids[1], 'non_positive_mass'],
      [ids[2], 'negative_macros'], [ids[3], 'missing_metadata'],
    ]);
  });

  it('fails on duplicate metadata instead of silently skipping source corruption', () => {
    const bundle = bundleFor([dishCsv('dish_9000000001')]);
    bundle.cafe2 = bundle.cafe1.slice();
    expect(() => prepareQualityPool(bundle, pinsForBundle(bundle))).toThrow(/duplicate/);
  });
});

function selectionPool(): QualityPool {
  const eligible: EligibleDish[] = [];
  for (const componentBin of [0, 1, 2] as const) {
    for (const calorieBin of [0, 1, 2] as const) {
      for (const macroBin of [0, 1, 2] as const) {
        for (let i = 0; i < 5; i += 1) eligible.push({
          dishId: `dish_${9001000000 + componentBin * 100000 + calorieBin * 10000 + macroBin * 1000 + i}`,
          componentBin, calorieBin, macroBin, totalMass: 100,
          totalCalories: [100, 250, 500][calorieBin]!, totalProtein: macroBin === 0 ? 20 : 1,
          totalCarb: macroBin === 1 ? 20 : 1, totalFat: macroBin === 2 ? 20 : 1,
        });
      }
    }
  }
  return { eligible, excluded: [], quarantineIds: EXPECTED_QUARANTINE,
    sourceDigests: { cafe1: '', cafe2: '', trainSplit: '', vocabulary: '', v1Manifest: '' }, quarantineDigest: '' };
}

describe('quality selection: fixed namespace, old defaults and disjoint exact schedules', () => {
  it('uses an independently calculated v2 rank rather than the old v1 seed', () => {
    expect(rankQualityDish('dish_9000000101')).toBe('e70e4ec1da13078ea569aec0e845ee747d7e1bd0c6c9e250f8b6cf40ff8dc0b8');
  });

  it('keeps the legacy default while honoring an explicit rank callback on the pure filler', () => {
    const pool = [101, 102, 103].map(n => ({ ...selectionPool().eligible[0]!, dishId: `dish_9000000${n}` }));
    const schedule = { development: [{ componentBin: 0 as const, calorieBin: 0 as const, macroBin: 0 as const }], validation: [] };
    expect(fillCalibrationSlots(pool, schedule).development.map(row => row.dishId)).toEqual(['dish_9000000101']);
    const options = { rankDishId: (id: string) => id.endsWith('103') ? '0' : '1' + id } as unknown as
      NonNullable<Parameters<typeof fillCalibrationSlots>[2]>;
    expect(fillCalibrationSlots(pool, schedule, options).development.map(row => row.dishId)).toEqual(['dish_9000000103']);
  });

  it('fills exactly twenty-four and sixteen disjoint balanced slots independently of input order', () => {
    const pool = selectionPool();
    const selected = selectQualityCandidates(pool, new Set());
    const all = [...selected.development, ...selected.validation];
    expect(selected.development).toHaveLength(24);
    expect(selected.validation).toHaveLength(16);
    expect(new Set(all.map(row => row.dishId)).size).toBe(40);
    expect(all.some(row => EXPECTED_QUARANTINE.includes(row.dishId))).toBe(false);
    for (const axis of ['componentBin', 'calorieBin', 'macroBin'] as const) {
      expect([0, 1, 2].map(bin => selected.development.filter(row => row[axis] === bin).length)).toEqual([8, 8, 8]);
    }
    expect([0, 1, 2].map(bin => selected.validation.filter(row => row.componentBin === bin).length)).toEqual([6, 5, 5]);
    expect([0, 1, 2].map(bin => selected.validation.filter(row => row.calorieBin === bin).length)).toEqual([5, 5, 6]);
    expect([0, 1, 2].map(bin => selected.validation.filter(row => row.macroBin === bin).length)).toEqual([5, 6, 5]);
    expect(selectQualityCandidates({ ...pool, eligible: [...pool.eligible].reverse() }, new Set())).toEqual(selected);
  });

  it('replaces only within the same stratum and refuses neighboring-stratum rescue', () => {
    const pool = selectionPool();
    const selected = selectQualityCandidates(pool, new Set());
    const first = selected.development[0]!;
    const rejected = new Set([first.dishId]);
    const replaced = selectQualityCandidates(pool, rejected);
    expect(replaced.development[0]!.dishId).not.toBe(first.dishId);
    expect([replaced.development[0]!.componentBin, replaced.development[0]!.calorieBin, replaced.development[0]!.macroBin]).toEqual([0, 0, 0]);
    expect([...rejected]).toEqual([first.dishId]);
    const exhausted = new Set(pool.eligible.filter(row => row.componentBin === 0 && row.calorieBin === 0 && row.macroBin === 0).map(row => row.dishId));
    expect(() => selectQualityCandidates(pool, exhausted)).toThrow(/stratum exhausted/);
  });
});
