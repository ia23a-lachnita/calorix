import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildQualityAuditContext, CORPUS_QUALITY_PUBLIC_PATHS, QualitySourceLockSchema,
} from '../../src/nutrition-eval/calibration-corpus-quality-source';
import type { QualitySourceBundle, QualitySourcePins } from '../../src/nutrition-eval/calibration-corpus-quality-policy';

const rawLock = JSON.parse(readFileSync(new URL('../../eval/nutrition/corpus-quality-source-lock-v2.json', import.meta.url), 'utf8'));
const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
const keys = ['cafe1', 'cafe2', 'trainSplit', 'vocabulary', 'v1Manifest'] as const;

// Synthetic parser fixtures, not measured food truth or replacement labels.
function fixture(): { bundle: QualitySourceBundle; pins: QualitySourcePins } {
  const bundle: QualitySourceBundle = {
    cafe1: encode('dish_9900000001,100,100,1,5,18,ingr_0000000054,,100,100,1,5,18\n' +
      'dish_9900000002,100,100,1,5,18,ingr_0000000453,deprecated,100,100,1,5,18\n'),
    cafe2: encode(''),
    trainSplit: encode('dish_9900000001\ndish_9900000002\n'),
    vocabulary: encode('ingr,id,cal/g,fat(g),carb(g),protein(g)\napple,54,0.520,0.002,0.140,0.003\n' +
      'deprecated,453,0.520,0.002,0.003,0.140\n'),
    v1Manifest: new Uint8Array(readFileSync(new URL('../../eval/nutrition/calibration-manifest.json', import.meta.url))),
  };
  const pins = Object.fromEntries(keys.map(key => [key, { byteLength: bundle[key].length, sha256: sha(bundle[key]) }])) as QualitySourcePins;
  return { bundle, pins };
}
const checkpoint = (): { implementationCommit: string; functionsTreeId: string } => ({
  implementationCommit: 'a'.repeat(40), functionsTreeId: 'b'.repeat(40),
});

describe('shared quality source-lock contract', () => {
  it('round-trips the committed lock without stripping fields', () => {
    expect(QualitySourceLockSchema.parse(rawLock)).toEqual(rawLock);
  });

  it.each([
    ['unknown top-level field', (lock: typeof rawLock) => { lock.extra = true; }],
    ['unknown source field', (lock: typeof rawLock) => { lock.sources.trainSplit.extra = true; }],
    ['bad digest', (lock: typeof rawLock) => { lock.sources.vocabulary.sha256 = 'F'.repeat(64); }],
    ['wrong checklist', (lock: typeof rawLock) => { lock.checklistVersion = 'other'; }],
    ['wrong rank prefix', (lock: typeof rawLock) => { lock.rankPrefix = 'v1:'; }],
    ['foreign manifest path', (lock: typeof rawLock) => { lock.v1Manifest.path = 'foreign.json'; }],
    ['zero native source size', (lock: typeof rawLock) => { lock.sources.trainSplit.byteLength = 0; }],
    ['oversized native source', (lock: typeof rawLock) => { lock.sources.trainSplit.byteLength = 4 * 1024 * 1024 + 1; }],
  ])('rejects %s', (_label, mutate) => {
    const changed = structuredClone(rawLock);
    mutate(changed);
    expect(QualitySourceLockSchema.safeParse(changed).success).toBe(false);
  });

  it('leaves public path and URL agreement to the native reader', () => {
    const structural = structuredClone(rawLock);
    structural.sources.trainSplit.path = 'structural-only.txt';
    structural.sources.trainSplit.url = 'https://example.com/structural-only.txt';
    expect(QualitySourceLockSchema.parse(structural)).toEqual(structural);
  });

  it('exposes fixed public paths that a caller cannot alter', () => {
    expect(CORPUS_QUALITY_PUBLIC_PATHS).toEqual({
      trainSplit: 'dish_ids/splits/rgb_train_ids.txt',
      metadataCafe1: 'metadata/dish_metadata_cafe1.csv',
      metadataCafe2: 'metadata/dish_metadata_cafe2.csv',
      vocabulary: 'metadata/ingredients_metadata.csv',
    });
    expect(Reflect.set(CORPUS_QUALITY_PUBLIC_PATHS, 'vocabulary', 'foreign.csv')).toBe(false);
    expect(CORPUS_QUALITY_PUBLIC_PATHS.vocabulary).toBe('metadata/ingredients_metadata.csv');
  });
});

describe('pure quality audit context assembly', () => {
  it('uses the supplied historical checkpoint, excludes deprecated ingredients and preserves names', () => {
    const { bundle, pins } = fixture();
    const result = buildQualityAuditContext(bundle, pins, 'c'.repeat(64), checkpoint());
    expect(result.codeCheckpoint).toEqual({ implementationCommit: 'a'.repeat(40), functionsTreeId: 'b'.repeat(40) });
    expect(result.sourceLockSha256).toBe('c'.repeat(64));
    expect(result.pool.eligible.map(row => row.dishId)).toEqual(['dish_9900000001']);
    expect(result.pool.excluded).toEqual([{
      dishId: 'dish_9900000002', reason: 'deprecated_ingredient', affectedIngredientIds: ['ingr_0000000453'],
    }]);
    expect([...result.ingredientsByDish]).toEqual([['dish_9900000001', [{
      ingredientId: 'ingr_0000000054', sourceName: '', vocabularyName: 'apple',
    }]]]);
    expect(result.pool.sourceDigests).toEqual(Object.fromEntries(keys.map(key => [key, sha(bundle[key])])));
    expect(result.pool.quarantineIds).toHaveLength(52);
    expect(result.pool.quarantineDigest).toBe('4f348798181f1eb1ae8dbd73fb0bfb0b8c14bb973b02bd5be06afc0be5627066');
  });

  it('owns its checkpoint and leaves caller source bytes and pins unchanged', () => {
    const { bundle, pins } = fixture();
    const before = structuredClone({ bundle, pins });
    const supplied = checkpoint();
    const result = buildQualityAuditContext(bundle, pins, 'c'.repeat(64), supplied);
    expect({ bundle, pins }).toEqual(before);
    supplied.implementationCommit = 'd'.repeat(40);
    supplied.functionsTreeId = 'e'.repeat(40);
    expect(result.codeCheckpoint).toEqual({ implementationCommit: 'a'.repeat(40), functionsTreeId: 'b'.repeat(40) });
    bundle.cafe1.fill(0);
    pins.cafe1.sha256 = 'f'.repeat(64);
    expect(result.ingredientsByDish.get('dish_9900000001')).toEqual([{
      ingredientId: 'ingr_0000000054', sourceName: '', vocabularyName: 'apple',
    }]);
    expect(result.pool.sourceDigests.cafe1).toBe(before.pins.cafe1.sha256);
  });

  it.each(keys)('rejects a changed %s digest', key => {
    const { bundle, pins } = fixture();
    pins[key].sha256 = 'f'.repeat(64);
    expect(() => buildQualityAuditContext(bundle, pins, 'c'.repeat(64), checkpoint())).toThrow(/sha256 mismatch/i);
  });

  it('checks all source pins before parsing malformed earlier metadata', () => {
    const { bundle, pins } = fixture();
    bundle.cafe1 = encode('malformed metadata');
    pins.cafe1 = { byteLength: bundle.cafe1.length, sha256: sha(bundle.cafe1) };
    pins.v1Manifest.sha256 = 'f'.repeat(64);
    expect(() => buildQualityAuditContext(bundle, pins, 'c'.repeat(64), checkpoint())).toThrow(/sha256 mismatch/i);
  });

  it('rejects a mismatched length even when the digest matches', () => {
    const { bundle, pins } = fixture();
    pins.cafe2.byteLength = 1;
    expect(() => buildQualityAuditContext(bundle, pins, 'c'.repeat(64), checkpoint())).toThrow(/byte-length mismatch/i);
  });

  it('rejects malformed vocabulary after matching byte pins', () => {
    const { bundle, pins } = fixture();
    bundle.vocabulary = encode('wrong,header\napple,54\n');
    pins.vocabulary = { byteLength: bundle.vocabulary.length, sha256: sha(bundle.vocabulary) };
    expect(() => buildQualityAuditContext(bundle, pins, 'c'.repeat(64), checkpoint())).toThrow(/header/i);
  });

  it('rejects duplicate metadata across cafe sources after matching byte pins', () => {
    const { bundle, pins } = fixture();
    bundle.cafe2 = bundle.cafe1.slice();
    pins.cafe2 = { byteLength: bundle.cafe2.length, sha256: sha(bundle.cafe2) };
    expect(() => buildQualityAuditContext(bundle, pins, 'c'.repeat(64), checkpoint())).toThrow(/duplicate/i);
  });
});
