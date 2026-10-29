import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';

import { parseQualityVocabulary } from '../../src/nutrition-eval/calibration-corpus-quality-policy';

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
