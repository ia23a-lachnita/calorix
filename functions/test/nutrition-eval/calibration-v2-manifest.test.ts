import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  StrictCalibrationManifestSchema,
  StrictCalibrationManifestV2Schema,
  hashStrictCalibrationManifestV2,
  type StrictCalibrationManifestV2,
} from '../../src/nutrition-eval/schema';
import { serializeCalibrationV2Manifest } from '../../src/nutrition-eval/calibration-v2-admission';
import {
  CALIBRATION_V2_MANIFEST_CASES,
  CALIBRATION_V2_SOURCE_LOCK_HASH,
} from './helpers/calibration-v2-fixtures';

const CALIBRATION_V2_DATASET_ID = 'calorix-n5k-calibration-v2';
const RANK_PREFIX = 'calorix-n5k-calibration-v2:';

function expectedCalibrationRank(dishId: string): string {
  return createHash('sha256').update(`${RANK_PREFIX}${dishId}`).digest('hex');
}

// Independent canonicalization, built by hand in the test (never by calling
// the serializer/hash under test), so the exact-digest/exact-text
// assertions below have a truly independently computed expectation.
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortKeysDeep(item));
  }
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      sorted[key] = sortKeysDeep(source[key]);
    }
    return sorted;
  }
  return value;
}

function independentCanonicalText(manifest: unknown): string {
  return JSON.stringify(sortKeysDeep(manifest));
}

function independentManifestHash(manifest: unknown): string {
  return createHash('sha256').update(independentCanonicalText(manifest), 'utf8').digest('hex');
}

function buildCalibrationV2Manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const cases = CALIBRATION_V2_MANIFEST_CASES.map((c) => ({ ...c }) as Record<string, unknown>);
  return {
    version: 2,
    datasetId: CALIBRATION_V2_DATASET_ID,
    sourceLockHash: CALIBRATION_V2_SOURCE_LOCK_HASH,
    cases,
    ...overrides,
  };
}

describe('StrictCalibrationManifestV2', () => {
  const validV2Manifest = buildCalibrationV2Manifest();

  it('accepts a valid minimal v2 manifest with exactly 40 cases (full roundtrip)', () => {
    const result = StrictCalibrationManifestV2Schema.safeParse(validV2Manifest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validV2Manifest);
      expect((result.data as StrictCalibrationManifestV2).cases).toHaveLength(40);
    }
  });

  it('requires version exactly 2', () => {
    expect(() => {
      StrictCalibrationManifestV2Schema.parse({ ...validV2Manifest, version: 1 });
    }).toThrow();
    expect(() => {
      StrictCalibrationManifestV2Schema.parse({ ...validV2Manifest, version: 3 });
    }).toThrow();
  });

  it('requires datasetId exactly calorix-n5k-calibration-v2', () => {
    expect(() => {
      StrictCalibrationManifestV2Schema.parse({ ...validV2Manifest, datasetId: 'other-dataset' });
    }).toThrow();
  });

  it('requires exactly 40 cases', () => {
    const cases = validV2Manifest.cases as unknown[];
    expect(() => {
      StrictCalibrationManifestV2Schema.parse({ ...validV2Manifest, cases: cases.slice(0, 39) });
    }).toThrow();
    expect(() => {
      StrictCalibrationManifestV2Schema.parse({ ...validV2Manifest, cases: [...cases, { ...(cases[0] as Record<string, unknown>) }] });
    }).toThrow();
  });

  it('rejects duplicate case IDs', () => {
    const cases = (validV2Manifest.cases as Record<string, unknown>[]).slice();
    cases[1] = { ...cases[1], id: cases[0]!.id };
    expect(() => {
      StrictCalibrationManifestV2Schema.parse({ ...validV2Manifest, cases });
    }).toThrow();
  });

  it('rejects duplicate dish objectIds', () => {
    const cases = (validV2Manifest.cases as Record<string, unknown>[]).slice();
    const firstSource = cases[0]!.source as Record<string, unknown>;
    cases[1] = { ...cases[1], source: { ...(cases[1]!.source as Record<string, unknown>), objectId: firstSource.objectId } };
    expect(() => {
      StrictCalibrationManifestV2Schema.parse({ ...validV2Manifest, cases });
    }).toThrow();
  });

  it('rejects a case whose slotIndex does not match its position', () => {
    const cases = (validV2Manifest.cases as Record<string, unknown>[]).slice();
    cases[1] = { ...cases[1], slotIndex: 0 };
    expect(() => {
      StrictCalibrationManifestV2Schema.parse({ ...validV2Manifest, cases });
    }).toThrow();
  });

  it('rejects a case whose group does not match its slotIndex range (group drift)', () => {
    const cases = (validV2Manifest.cases as Record<string, unknown>[]).slice();
    cases[0] = { ...cases[0], group: 'validation' };
    expect(() => {
      StrictCalibrationManifestV2Schema.parse({ ...validV2Manifest, cases });
    }).toThrow();
  });

  it('rejects a case whose stratum deviates from the pinned schedule tuple at its slot', () => {
    const cases = (validV2Manifest.cases as Record<string, unknown>[]).slice();
    const stratum = cases[0]!.stratum as Record<string, unknown>;
    cases[0] = {
      ...cases[0],
      stratum: { ...stratum, componentBin: ((stratum.componentBin as number) + 1) % 3 },
    };
    expect(() => {
      StrictCalibrationManifestV2Schema.parse({ ...validV2Manifest, cases });
    }).toThrow();
  });

  it('rejects a case whose rank does not equal sha256("calorix-n5k-calibration-v2:" + dishId)', () => {
    const cases = (validV2Manifest.cases as Record<string, unknown>[]).slice();
    cases[0] = { ...cases[0], rank: expectedCalibrationRank('dish_9999999999') };
    expect(() => {
      StrictCalibrationManifestV2Schema.parse({ ...validV2Manifest, cases });
    }).toThrow();
  });

  it('rejects a case whose id does not exactly match calibration-<dishId>', () => {
    const cases = (validV2Manifest.cases as Record<string, unknown>[]).slice();
    cases[0] = { ...cases[0], id: 'calibration-dish_0000000000' };
    expect(() => {
      StrictCalibrationManifestV2Schema.parse({ ...validV2Manifest, cases });
    }).toThrow();
  });

  it('rejects a case whose source.dataset is not exactly nutrition5k', () => {
    const cases = (validV2Manifest.cases as Record<string, unknown>[]).slice();
    cases[0] = { ...cases[0], source: { ...(cases[0]!.source as Record<string, unknown>), dataset: 'other-dataset' } };
    expect(() => {
      StrictCalibrationManifestV2Schema.parse({ ...validV2Manifest, cases });
    }).toThrow();
  });

  it('rejects a case whose source.objectId does not match dish_[0-9]+', () => {
    const cases = (validV2Manifest.cases as Record<string, unknown>[]).slice();
    cases[0] = { ...cases[0], source: { ...(cases[0]!.source as Record<string, unknown>), objectId: 'dish_abc' } };
    expect(() => {
      StrictCalibrationManifestV2Schema.parse({ ...validV2Manifest, cases });
    }).toThrow();
  });

  it('rejects a case whose truth basis/amount/unit drifts from the frozen portion-of-one shape', () => {
    const cases = (validV2Manifest.cases as Record<string, unknown>[]).slice();
    const truth = cases[0]!.truth as Record<string, unknown>;

    const wrongBasis = cases.slice();
    wrongBasis[0] = { ...wrongBasis[0], truth: { ...truth, basis: 'package' } };
    expect(() => {
      StrictCalibrationManifestV2Schema.parse({ ...validV2Manifest, cases: wrongBasis });
    }).toThrow();

    const wrongAmount = cases.slice();
    wrongAmount[0] = { ...wrongAmount[0], truth: { ...truth, amount: 2 } };
    expect(() => {
      StrictCalibrationManifestV2Schema.parse({ ...validV2Manifest, cases: wrongAmount });
    }).toThrow();

    const wrongUnit = cases.slice();
    wrongUnit[0] = { ...wrongUnit[0], truth: { ...truth, unit: 'g' } };
    expect(() => {
      StrictCalibrationManifestV2Schema.parse({ ...validV2Manifest, cases: wrongUnit });
    }).toThrow();
  });

  it('rejects a case with non-positive kcal (invalid numeric truth)', () => {
    const cases = (validV2Manifest.cases as Record<string, unknown>[]).slice();
    const truth = cases[0]!.truth as Record<string, unknown>;
    cases[0] = { ...cases[0], truth: { ...truth, kcal: 0 } };
    expect(() => {
      StrictCalibrationManifestV2Schema.parse({ ...validV2Manifest, cases });
    }).toThrow();
  });

  it('rejects a case whose toleranceClass is not exactly meal-estimate', () => {
    const cases = (validV2Manifest.cases as Record<string, unknown>[]).slice();
    cases[0] = { ...cases[0], toleranceClass: 'package-estimate' };
    expect(() => {
      StrictCalibrationManifestV2Schema.parse({ ...validV2Manifest, cases });
    }).toThrow();
  });

  it('rejects a case whose image URL does not match the exact overhead URL pattern', () => {
    const cases = (validV2Manifest.cases as Record<string, unknown>[]).slice();
    cases[0] = { ...cases[0], image: { ...(cases[0]!.image as Record<string, unknown>), url: 'https://example.com/rgb.png' } };
    expect(() => {
      StrictCalibrationManifestV2Schema.parse({ ...validV2Manifest, cases });
    }).toThrow();
  });

  it('rejects a case whose image mediaType is not image/png', () => {
    const cases = (validV2Manifest.cases as Record<string, unknown>[]).slice();
    cases[0] = { ...cases[0], image: { ...(cases[0]!.image as Record<string, unknown>), mediaType: 'image/jpeg' } };
    expect(() => {
      StrictCalibrationManifestV2Schema.parse({ ...validV2Manifest, cases });
    }).toThrow();
  });

  it('rejects a case whose attributionId is not nutrition5k-cc-by-4.0', () => {
    const cases = (validV2Manifest.cases as Record<string, unknown>[]).slice();
    cases[0] = { ...cases[0], attributionId: 'some-other-license' };
    expect(() => {
      StrictCalibrationManifestV2Schema.parse({ ...validV2Manifest, cases });
    }).toThrow();
  });

  it('rejects a case with extra unknown fields', () => {
    const cases = (validV2Manifest.cases as Record<string, unknown>[]).slice();
    cases[0] = { ...cases[0], unexpectedField: 'nope' };
    expect(() => {
      StrictCalibrationManifestV2Schema.parse({ ...validV2Manifest, cases });
    }).toThrow();
  });

  it('rejects unknown top-level keys', () => {
    expect(() => {
      StrictCalibrationManifestV2Schema.parse({ ...validV2Manifest, unexpectedTopLevel: 'nope' });
    }).toThrow();
  });

  it('the v1 strict schema rejects a valid v2 fixture', () => {
    expect(() => {
      StrictCalibrationManifestSchema.parse(validV2Manifest);
    }).toThrow();
  });

  it('hashStrictCalibrationManifestV2 matches the independently computed canonical digest', () => {
    const expectedHash = independentManifestHash(validV2Manifest);
    const result = hashStrictCalibrationManifestV2(validV2Manifest);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
    expect(result).toBe(expectedHash);
  });

  it('serializeCalibrationV2Manifest matches the independently computed canonical JSON text', () => {
    const expectedText = independentCanonicalText(validV2Manifest);
    const result = serializeCalibrationV2Manifest(validV2Manifest as StrictCalibrationManifestV2);
    expect(result).not.toMatch(/\n$/);
    expect(result).toBe(expectedText);
    // Array order (cases) must be preserved, not alphabetically reordered.
    expect(JSON.parse(result).cases[0].slotIndex).toBe(0);
    expect(JSON.parse(result).cases[39].slotIndex).toBe(39);
  });

  it('hash is deterministic for identical valid input', () => {
    const hash1 = hashStrictCalibrationManifestV2(validV2Manifest);
    const hash2 = hashStrictCalibrationManifestV2(validV2Manifest);
    expect(hash1).toBe(hash2);
  });

  it('serialize is deterministic for identical valid input', () => {
    const text1 = serializeCalibrationV2Manifest(validV2Manifest as StrictCalibrationManifestV2);
    const text2 = serializeCalibrationV2Manifest(validV2Manifest as StrictCalibrationManifestV2);
    expect(text1).toBe(text2);
  });

  it('hash changes when truth proteinG changes', () => {
    const cases = (validV2Manifest.cases as Record<string, unknown>[]).slice();
    const truth = cases[0]!.truth as Record<string, unknown>;
    cases[0] = { ...cases[0], truth: { ...truth, proteinG: (truth.proteinG as number) + 1 } };
    const modified = { ...validV2Manifest, cases };
    const baseHash = hashStrictCalibrationManifestV2(validV2Manifest);
    const changedHash = hashStrictCalibrationManifestV2(modified);
    expect(changedHash).not.toBe(baseHash);
    expect(changedHash).toBe(independentManifestHash(modified));
  });

  it('serialize changes when truth proteinG changes', () => {
    const cases = (validV2Manifest.cases as Record<string, unknown>[]).slice();
    const truth = cases[0]!.truth as Record<string, unknown>;
    cases[0] = { ...cases[0], truth: { ...truth, proteinG: (truth.proteinG as number) + 1 } };
    const modified = { ...validV2Manifest, cases };
    const baseText = serializeCalibrationV2Manifest(validV2Manifest as StrictCalibrationManifestV2);
    const changedText = serializeCalibrationV2Manifest(modified as StrictCalibrationManifestV2);
    expect(changedText).not.toBe(baseText);
    expect(changedText).toBe(independentCanonicalText(modified));
  });

  it('input nonmutation: original manifest unchanged after hash and serialize', () => {
    const clone = JSON.parse(JSON.stringify(validV2Manifest));
    hashStrictCalibrationManifestV2(validV2Manifest);
    serializeCalibrationV2Manifest(validV2Manifest as StrictCalibrationManifestV2);
    expect(validV2Manifest).toEqual(clone);
  });

  it('key-order independence: same content with different key order produces the same hash and text', () => {
    const obj1 = {
      version: 2,
      datasetId: CALIBRATION_V2_DATASET_ID,
      sourceLockHash: CALIBRATION_V2_SOURCE_LOCK_HASH,
      cases: validV2Manifest.cases,
    };
    const obj2 = {
      datasetId: CALIBRATION_V2_DATASET_ID,
      version: 2,
      cases: validV2Manifest.cases,
      sourceLockHash: CALIBRATION_V2_SOURCE_LOCK_HASH,
    };
    expect(hashStrictCalibrationManifestV2(obj1)).toBe(hashStrictCalibrationManifestV2(obj2));
    expect(serializeCalibrationV2Manifest(obj1 as StrictCalibrationManifestV2)).toBe(
      serializeCalibrationV2Manifest(obj2 as StrictCalibrationManifestV2),
    );
  });

  it('rejects a V1 dataset ID combined with version 2', () => {
    expect(() => {
      StrictCalibrationManifestV2Schema.parse({ ...validV2Manifest, datasetId: 'calorix-n5k-calibration-v1' });
    }).toThrow();
  });

  it('rejects a case whose rank uses the V1 rank prefix for the same dish id', () => {
    const cases = (validV2Manifest.cases as Record<string, unknown>[]).slice();
    const dishId = (cases[0]!.source as Record<string, unknown>).objectId as string;
    const v1Rank = createHash('sha256').update(`calorix-n5k-calibration-v1:${dishId}`).digest('hex');
    cases[0] = { ...cases[0], rank: v1Rank };
    expect(() => {
      StrictCalibrationManifestV2Schema.parse({ ...validV2Manifest, cases });
    }).toThrow();
  });

  it('rejects truth with NaN, Infinity, negative macro, or nonpositive reference mass', () => {
    const baseCases = (validV2Manifest.cases as Record<string, unknown>[]).slice();
    const truth = baseCases[0]!.truth as Record<string, unknown>;

    const nanKcal = baseCases.slice();
    nanKcal[0] = { ...nanKcal[0], truth: { ...truth, kcal: NaN } };
    expect(() => {
      StrictCalibrationManifestV2Schema.parse({ ...validV2Manifest, cases: nanKcal });
    }).toThrow();

    const infiniteProtein = baseCases.slice();
    infiniteProtein[0] = { ...infiniteProtein[0], truth: { ...truth, proteinG: Infinity } };
    expect(() => {
      StrictCalibrationManifestV2Schema.parse({ ...validV2Manifest, cases: infiniteProtein });
    }).toThrow();

    const negativeCarbs = baseCases.slice();
    negativeCarbs[0] = { ...negativeCarbs[0], truth: { ...truth, carbsG: -1 } };
    expect(() => {
      StrictCalibrationManifestV2Schema.parse({ ...validV2Manifest, cases: negativeCarbs });
    }).toThrow();

    const negativeFat = baseCases.slice();
    negativeFat[0] = { ...negativeFat[0], truth: { ...truth, fatG: -0.5 } };
    expect(() => {
      StrictCalibrationManifestV2Schema.parse({ ...validV2Manifest, cases: negativeFat });
    }).toThrow();

    const zeroMass = baseCases.slice();
    zeroMass[0] = { ...zeroMass[0], truth: { ...truth, referenceMassG: 0 } };
    expect(() => {
      StrictCalibrationManifestV2Schema.parse({ ...validV2Manifest, cases: zeroMass });
    }).toThrow();

    const negativeMass = baseCases.slice();
    negativeMass[0] = { ...negativeMass[0], truth: { ...truth, referenceMassG: -10 } };
    expect(() => {
      StrictCalibrationManifestV2Schema.parse({ ...validV2Manifest, cases: negativeMass });
    }).toThrow();
  });

  it('accepts truth with zero macros (nonnegative permits zero)', () => {
    const cases = (validV2Manifest.cases as Record<string, unknown>[]).slice();
    const truth = cases[0]!.truth as Record<string, unknown>;
    cases[0] = { ...cases[0], truth: { ...truth, proteinG: 0, carbsG: 0, fatG: 0 } };
    const result = StrictCalibrationManifestV2Schema.safeParse({ ...validV2Manifest, cases });
    expect(result.success).toBe(true);
  });
});
