/**
 * Task 3 contract: canonical allowed-keys derivation.
 *
 * Contract for `deriveCanonicalAllowedKeys(files, selectedProfile?)`
 * (`functions/src/nutrition-eval/calibration-bootstrap.ts`):
 *
 * ```ts
 * export function deriveCanonicalAllowedKeys(
 *   files: Record<CalibrationPreflightFileName, string>,
 *   selectedProfile?: CalibrationProfile,
 * ): readonly ReservationKey[];
 * ```
 *
 * Synchronous, pure, deeply frozen output. Inputs come from the actual
 * verified `prepareCalibrationBootstrapContext` (injected Git/owner readers
 * plus read-only actual committed asset fixtures). The planner checksum and
 * schema gate the calibration manifest (`CALIBRATION_MANIFEST_SHA256`, raw
 * committed bytes) and the canonical public manifest (semantic
 * `CALIBRATION_PUBLIC_MANIFEST_HASH`, never a raw-sha256 alias).
 *
 * Canonical arithmetic over the real fixtures:
 * - no profile: exactly 50 keys (preflight LOW+MEDIUM sample 1 on the first
 *   development case, plus 24 development cases x LOW/MEDIUM sample 1);
 * - selected LOW/MEDIUM: exactly 146 keys (the unchanged 50 prefix, plus
 *   16 validation cases x 3 samples plus 16 public meal/label benchmark
 *   cases x 3 samples, all in the selected profile);
 * - barcode cases receive zero image keys; the 12 later barcode outcomes are
 *   NOT part of this approval, and benchmark keys are never derived from the
 *   40 calibration cases.
 *
 * Hermetic contract: read-only `readFileSync` of committed
 * `functions/eval/nutrition/*.json` fixtures plus the real prompt/schema
 * modules as local inputs. No provider client, network, Firebase, device,
 * deployment, or image download occurs here. Fake data only.
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspect } from 'node:util';
import * as bootstrapModule from '../../src/nutrition-eval/calibration-bootstrap';
import {
  CALIBRATION_MANIFEST_SHA256,
  CALIBRATION_PUBLIC_MANIFEST_HASH,
} from '../../src/nutrition-eval/calibration-cli';
import { hashNutritionEvalManifest } from '../../src/nutrition-eval/cli';
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';
import { visionResponseJsonSchema } from '../../src/nutrition-json-schema';
import {
  BARCODE_ANALYSIS_PROMPT,
  LABEL_ANALYSIS_PROMPT,
  MEAL_ANALYSIS_PROMPT,
} from '../../src/prompts';

const SECRET_SENTINEL = 'SECRET-CANONICAL-9c41ab';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

function readCommittedAsset(relPath: string): string {
  return readFileSync(resolve(repoRoot, relPath), 'utf8');
}

function buildVerifiedFiles(): Record<string, string> {
  const promptBytes = JSON.stringify([
    MEAL_ANALYSIS_PROMPT,
    LABEL_ANALYSIS_PROMPT,
    BARCODE_ANALYSIS_PROMPT,
  ]);
  const schemaBytes = JSON.stringify([
    visionResponseJsonSchema('meal'),
    visionResponseJsonSchema('label'),
    visionResponseJsonSchema('barcode'),
  ]);
  return {
    'public-manifest': readCommittedAsset('functions/eval/nutrition/public-manifest.json'),
    prompt: promptBytes,
    'response-schema': schemaBytes,
    'source-lock': readCommittedAsset('functions/eval/nutrition/calibration-source-lock.json'),
    'calibration-manifest': readCommittedAsset('functions/eval/nutrition/calibration-manifest.json'),
    'off-lock': readCommittedAsset('functions/eval/nutrition/off-snapshot-lock.json'),
    'historical-reference': readCommittedAsset(
      'functions/eval/nutrition/historical-reference-v1.json',
    ),
  };
}

interface FixtureCase {
  id: string;
  group: string;
  scanMode: string;
}

function readCalibrationCases(): FixtureCase[] {
  const parsed = JSON.parse(
    readCommittedAsset('functions/eval/nutrition/calibration-manifest.json'),
  ) as { cases: FixtureCase[] };
  return parsed.cases;
}

function readPublicCases(): FixtureCase[] {
  const parsed = JSON.parse(
    readCommittedAsset('functions/eval/nutrition/public-manifest.json'),
  ) as { cases: FixtureCase[] };
  return parsed.cases;
}

interface CanonicalKey {
  stage: string;
  profile: string;
  caseId: string;
  sampleIndex: number;
}

type DeriveFn = (files: unknown, selectedProfile?: unknown) => readonly CanonicalKey[];

function loadDerive(): DeriveFn {
  const fn = (bootstrapModule as Record<string, unknown>)['deriveCanonicalAllowedKeys'];
  expect(typeof fn, 'deriveCanonicalAllowedKeys must be exported (Task 3 RED)').toBe('function');
  return fn as DeriveFn;
}

function keyId(key: CanonicalKey): string {
  return `${key.stage}|${key.profile}|${key.caseId}|${key.sampleIndex}`;
}

function sortedIds(keys: readonly CanonicalKey[]): string[] {
  return keys.map(keyId).sort();
}

function collectOwnStrings(value: unknown, depth = 0, seen: Set<unknown> = new Set()): string[] {
  if (value === null || value === undefined || depth > 8) return [];
  if (typeof value === 'string') return [value];
  if (typeof value !== 'object') return [String(value)];
  if (seen.has(value)) return [];
  seen.add(value);
  const out: string[] = [];
  for (const key of Object.getOwnPropertyNames(value)) {
    let child: unknown;
    try {
      child = (value as Record<string, unknown>)[key];
    } catch {
      continue;
    }
    out.push(key, ...collectOwnStrings(child, depth + 1, seen));
  }
  return out;
}

function expectFatalWithoutSentinel(error: unknown, sentinel: string): void {
  expect(error).toBeInstanceOf(CalibrationFatalError);
  const fatal = error as CalibrationFatalError;
  expect(fatal.cause).toBeUndefined();
  expect(Object.getOwnPropertyNames(fatal)).not.toContain('cause');
  const surfaces = [
    fatal.name,
    fatal.message,
    String(fatal),
    fatal.stack ?? '',
    inspect(fatal, { depth: null, showHidden: true }),
    ...collectOwnStrings(fatal),
  ];
  for (const surface of surfaces) {
    expect(surface).not.toContain(sentinel);
  }
}

function captureDeriveError(files: unknown, selectedProfile?: unknown): unknown {
  try {
    loadDerive()(files, selectedProfile);
  } catch (error) {
    return error;
  }
  return null;
}

describe('canonical keys export (Task 3 RED gate)', () => {
  it('exports a synchronous deriveCanonicalAllowedKeys function', () => {
    const fn = (bootstrapModule as Record<string, unknown>)['deriveCanonicalAllowedKeys'];
    expect(typeof fn).toBe('function');
    expect((fn as { length?: unknown }).length).toBeLessThanOrEqual(2);
  });
});

describe('canonical keys fixture checksums', () => {
  it('pins the calibration manifest by raw committed bytes, not semantics', () => {
    const bytes = readCommittedAsset('functions/eval/nutrition/calibration-manifest.json');
    expect(createHash('sha256').update(bytes, 'utf8').digest('hex')).toBe(
      CALIBRATION_MANIFEST_SHA256,
    );
  });

  it('pins the public manifest by the semantic export, not a raw-sha256 alias', () => {
    const bytes = readCommittedAsset('functions/eval/nutrition/public-manifest.json');
    const parsed = JSON.parse(bytes) as unknown;
    expect(hashNutritionEvalManifest(parsed)).toBe(CALIBRATION_PUBLIC_MANIFEST_HASH);
    expect(createHash('sha256').update(bytes, 'utf8').digest('hex')).not.toBe(
      CALIBRATION_PUBLIC_MANIFEST_HASH,
    );
  });

  it('fixtures hold 24 development plus 16 validation calibration cases', () => {
    const cases = readCalibrationCases();
    expect(cases).toHaveLength(40);
    expect(cases.filter((c) => c.group === 'development')).toHaveLength(24);
    expect(cases.filter((c) => c.group === 'validation')).toHaveLength(16);
  });

  it('public dataset holds 12 meal plus 4 label plus 4 barcode cases', () => {
    const cases = readPublicCases();
    expect(cases).toHaveLength(20);
    expect(cases.filter((c) => c.scanMode === 'meal')).toHaveLength(12);
    expect(cases.filter((c) => c.scanMode === 'label')).toHaveLength(4);
    expect(cases.filter((c) => c.scanMode === 'barcode')).toHaveLength(4);
  });
});

describe('canonical keys initial 50 (no selected profile)', () => {
  it('derives exactly the preflight pair plus 24x2 development keys', () => {
    const derive = loadDerive();
    const files = buildVerifiedFiles();
    const keys = derive(files);
    expect(keys).toHaveLength(50);
    const calibrationCases = readCalibrationCases();
    const devCases = calibrationCases.filter((c) => c.group === 'development');
    const firstDev = devCases[0]?.id as string;
    const expected: string[] = [
      `preflight|LOW|${firstDev}|1`,
      `preflight|MEDIUM|${firstDev}|1`,
    ];
    for (const dev of devCases) {
      expected.push(`development|LOW|${dev.id}|1`);
      expected.push(`development|MEDIUM|${dev.id}|1`);
    }
    expect(sortedIds(keys)).toEqual([...expected].sort());
  });

  it('uses only sample 1 before selection', () => {
    const keys = loadDerive()(buildVerifiedFiles());
    for (const key of keys) {
      expect(key.sampleIndex).toBe(1);
    }
  });

  it('returns a deeply frozen array with frozen keys', () => {
    const keys = loadDerive()(buildVerifiedFiles());
    expect(Object.isFrozen(keys)).toBe(true);
    for (const key of keys) {
      expect(Object.isFrozen(key)).toBe(true);
    }
    expect(Object.keys(keys[0] as Record<string, unknown>).sort()).toEqual([
      'caseId',
      'profile',
      'sampleIndex',
      'stage',
    ]);
  });

  it('preserves the source fixture bytes', () => {
    const files = buildVerifiedFiles();
    const before = JSON.stringify(files);
    loadDerive()(files);
    loadDerive()(files, 'LOW');
    expect(JSON.stringify(files)).toBe(before);
  });

  it('treats explicit undefined profile as unselected', () => {
    const derive = loadDerive();
    const files = buildVerifiedFiles();
    expect(sortedIds(derive(files, undefined))).toEqual(sortedIds(derive(files)));
  });
});

describe('canonical keys selected expansion to 146', () => {
  it.each([['LOW'], ['MEDIUM']])('expands the selected %s profile to exactly 146 keys', (profile) => {
    const derive = loadDerive();
    const files = buildVerifiedFiles();
    const initial = derive(files);
    const expanded = derive(files, profile);
    expect(expanded).toHaveLength(146);
    // Unchanged 50 prefix: the first 50 entries hold exactly the initial set.
    expect(sortedIds(expanded.slice(0, 50))).toEqual(sortedIds(initial));
    // Selected-only beyond the prefix: every later key carries the profile.
    for (const key of expanded.slice(50)) {
      expect(key.profile).toBe(profile);
      expect([1, 2, 3]).toContain(key.sampleIndex);
    }
  });

  it('covers 16 validation cases x3 samples in the selected profile only', () => {
    const expanded = loadDerive()(buildVerifiedFiles(), 'LOW');
    const validation = expanded.filter((k) => k.stage === 'validation');
    expect(validation).toHaveLength(48);
    const valIds = readCalibrationCases()
      .filter((c) => c.group === 'development')
      .map((c) => c.id);
    expect(valIds).toHaveLength(24);
    const expectedValIds = readCalibrationCases()
      .filter((c) => c.group === 'validation')
      .map((c) => c.id);
    expect(expectedValIds).toHaveLength(16);
    const expected: string[] = [];
    for (const id of expectedValIds) {
      for (const sample of [1, 2, 3]) expected.push(`validation|LOW|${id}|${sample}`);
    }
    expect(validation.map(keyId).sort()).toEqual([...expected].sort());
    for (const key of validation) {
      expect(key.profile).toBe('LOW');
    }
  });

  it('derives benchmark keys from public meal/label cases, never barcode or calibration 40', () => {
    const expanded = loadDerive()(buildVerifiedFiles(), 'MEDIUM');
    const benchmark = expanded.filter((k) => k.stage === 'benchmark');
    expect(benchmark).toHaveLength(48);
    const publicCases = readPublicCases();
    const mealLabelIds = publicCases
      .filter((c) => c.scanMode === 'meal' || c.scanMode === 'label')
      .map((c) => c.id);
    expect(mealLabelIds).toHaveLength(16);
    const barcodeIds = new Set(
      publicCases.filter((c) => c.scanMode === 'barcode').map((c) => c.id),
    );
    expect(barcodeIds.size).toBe(4);
    const expected: string[] = [];
    for (const id of mealLabelIds) {
      for (const sample of [1, 2, 3]) expected.push(`benchmark|MEDIUM|${id}|${sample}`);
    }
    expect(benchmark.map(keyId).sort()).toEqual([...expected].sort());
    for (const id of barcodeIds) {
      expect(benchmark.some((k) => k.caseId === id)).toBe(false);
    }
  });

  it('gives barcode cases zero image keys across the whole expansion', () => {
    for (const profile of [undefined, 'LOW', 'MEDIUM'] as const) {
      const keys = loadDerive()(buildVerifiedFiles(), profile);
      const barcodeIds = new Set(
        readPublicCases()
          .filter((c) => c.scanMode === 'barcode')
          .map((c) => c.id),
      );
      for (const key of keys) {
        expect(barcodeIds.has(key.caseId)).toBe(false);
      }
    }
  });

  it('holds no duplicate keys in either shape', () => {
    const derive = loadDerive();
    const files = buildVerifiedFiles();
    for (const profile of [undefined, 'LOW', 'MEDIUM'] as const) {
      const ids = derive(files, profile).map(keyId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('canonical keys rejection boundary', () => {
  it('rejects malformed calibration-manifest JSON', () => {
    const files = buildVerifiedFiles();
    files['calibration-manifest'] = 'not-json{';
    expect(captureDeriveError(files)).toBeInstanceOf(CalibrationFatalError);
  });

  it('rejects malformed public-manifest JSON', () => {
    const files = buildVerifiedFiles();
    files['public-manifest'] = '{"broken":';
    expect(captureDeriveError(files)).toBeInstanceOf(CalibrationFatalError);
  });

  it('rejects hash-drifted calibration-manifest bytes', () => {
    const files = buildVerifiedFiles();
    files['calibration-manifest'] = `${files['calibration-manifest']} `;
    expect(captureDeriveError(files)).toBeInstanceOf(CalibrationFatalError);
    expect(captureDeriveError(files, 'LOW')).toBeInstanceOf(CalibrationFatalError);
  });

  it('rejects semantically drifted public-manifest bytes', () => {
    const files = buildVerifiedFiles();
    const parsed = JSON.parse(files['public-manifest'] as string) as {
      cases: Array<Record<string, unknown>>;
    };
    parsed.cases = parsed.cases.slice(1);
    files['public-manifest'] = JSON.stringify(parsed);
    expect(captureDeriveError(files, 'LOW')).toBeInstanceOf(CalibrationFatalError);
  });

  it('rejects schema-violating calibration-manifest content', () => {
    const files = buildVerifiedFiles();
    const parsed = JSON.parse(files['calibration-manifest'] as string) as {
      cases: Array<Record<string, unknown>>;
    };
    (parsed.cases[0] as Record<string, unknown>)['group'] = 'bogus-group';
    files['calibration-manifest'] = JSON.stringify(parsed);
    expect(captureDeriveError(files)).toBeInstanceOf(CalibrationFatalError);
  });

  it('rejects a duplicated development case id', () => {
    const files = buildVerifiedFiles();
    const parsed = JSON.parse(files['calibration-manifest'] as string) as {
      cases: Array<Record<string, unknown>>;
    };
    parsed.cases.push({ ...(parsed.cases[1] as Record<string, unknown>) });
    files['calibration-manifest'] = JSON.stringify(parsed);
    expect(captureDeriveError(files)).toBeInstanceOf(CalibrationFatalError);
  });

  it.each([['HIGH'], ['low'], [''], [' LOW'], [42], [null]])(
    'rejects invalid selected profile %p',
    (profile) => {
      expect(captureDeriveError(buildVerifiedFiles(), profile)).toBeInstanceOf(
        CalibrationFatalError,
      );
    },
  );

  it.each([['missing files', undefined], ['null files', null], ['array files', []]])(
    'rejects %s',
    (_label, files) => {
      expect(captureDeriveError(files)).toBeInstanceOf(CalibrationFatalError);
    },
  );

  it('rejects a missing calibration-manifest entry', () => {
    const files = buildVerifiedFiles();
    delete files['calibration-manifest'];
    expect(captureDeriveError(files)).toBeInstanceOf(CalibrationFatalError);
  });

  it('rejects a non-string manifest entry', () => {
    const files = { ...buildVerifiedFiles(), 'public-manifest': 42 };
    expect(captureDeriveError(files, 'LOW')).toBeInstanceOf(CalibrationFatalError);
  });
});

describe('canonical keys public-manifest closed shape', () => {
  it('rejects an unknown root field even though the permissive semantic hash still matches', () => {
    const files = buildVerifiedFiles();
    const raw = JSON.parse(files['public-manifest'] as string) as Record<string, unknown>;
    const withExtra = { ...raw, extraRootField: 'unexpected' };
    expect(hashNutritionEvalManifest(withExtra)).toBe(CALIBRATION_PUBLIC_MANIFEST_HASH);
    files['public-manifest'] = JSON.stringify(withExtra);
    expect(captureDeriveError(files, 'LOW')).toBeInstanceOf(CalibrationFatalError);
  });

  it('rejects an unknown nested case field even though the permissive semantic hash still matches', () => {
    const files = buildVerifiedFiles();
    const raw = JSON.parse(files['public-manifest'] as string) as {
      cases: Array<Record<string, unknown>>;
    };
    const cases = raw.cases.map((entry, index) =>
      index === 0 ? { ...entry, extraNestedField: 'unexpected' } : entry,
    );
    const withExtra = { ...raw, cases };
    expect(hashNutritionEvalManifest(withExtra)).toBe(CALIBRATION_PUBLIC_MANIFEST_HASH);
    files['public-manifest'] = JSON.stringify(withExtra);
    expect(captureDeriveError(files, 'LOW')).toBeInstanceOf(CalibrationFatalError);
  });

  it('keeps the semantic hash and 146 keys on formatting-only reserialization', () => {
    const files = buildVerifiedFiles();
    const raw = JSON.parse(files['public-manifest'] as string) as unknown;
    const reserialized = JSON.stringify(raw, null, 2);
    expect(hashNutritionEvalManifest(JSON.parse(reserialized))).toBe(
      CALIBRATION_PUBLIC_MANIFEST_HASH,
    );
    files['public-manifest'] = reserialized;
    expect(loadDerive()(files)).toHaveLength(50);
    expect(loadDerive()(files, 'LOW')).toHaveLength(146);
  });
});

describe('canonical keys caller isolation and privacy', () => {
  it('drops a secret-bearing plain getter without cause or sentinel', () => {
    const files = buildVerifiedFiles();
    Object.defineProperty(files, 'calibration-manifest', {
      get(): string {
        throw new Error(`getter boom ${SECRET_SENTINEL} /private/repo/path`);
      },
      enumerable: true,
      configurable: true,
    });
    expectFatalWithoutSentinel(captureDeriveError(files), SECRET_SENTINEL);
  });

  it('sanitizes a secret-bearing typed fatal with a private cause', () => {
    const privateCause = new Error(`private bytes ${SECRET_SENTINEL} /private/repo/path`);
    const foreign = new CalibrationFatalError(`foreign wrapper ${SECRET_SENTINEL}`, {
      cause: privateCause,
    });
    expect(inspect(foreign, { depth: null })).toContain(SECRET_SENTINEL);
    const files = buildVerifiedFiles();
    Object.defineProperty(files, 'public-manifest', {
      get(): string {
        throw foreign;
      },
      enumerable: true,
      configurable: true,
    });
    const error = captureDeriveError(files, 'LOW');
    expect(error).not.toBe(foreign);
    expectFatalWithoutSentinel(error, SECRET_SENTINEL);
  });

  it('never invokes caller toJSON or custom iterators', () => {
    const files = buildVerifiedFiles();
    let serialized = 0;
    let iterated = 0;
    Object.defineProperty(files, 'toJSON', {
      value: () => {
        serialized += 1;
        return {};
      },
      enumerable: false,
      configurable: true,
    });
    Object.defineProperty(files, Symbol.iterator, {
      value: function* (): IterableIterator<string> {
        iterated += 1;
        yield 'calibration-manifest';
      },
      configurable: true,
      writable: true,
    });
    const keys = loadDerive()(files, 'MEDIUM');
    expect(keys).toHaveLength(146);
    expect(serialized).toBe(0);
    expect(iterated).toBe(0);
  });

  it('rejects a revoked files proxy with a fresh static causeless fatal', () => {
    const { proxy, revoke } = Proxy.revocable(buildVerifiedFiles(), {});
    revoke();
    const error = captureDeriveError(proxy);
    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect((error as CalibrationFatalError).message).toBe('calibration:canonical-keys-invalid');
    expect((error as { cause?: unknown }).cause).toBeUndefined();
    expect(Object.getOwnPropertyNames(error as object)).not.toContain('cause');
  });
});
