import { z } from 'zod';
import { CALIBRATION_SOURCE_PATHS, parseDishMetadataCsv, mergeDishMetadata } from './calibration-corpus';
import { prepareQualityPool, parseQualityVocabulary } from './calibration-corpus-quality-policy';
import { QUALITY_CANDIDATE_ID, QUALITY_CHECKLIST_VERSION } from './calibration-corpus-quality-audit';
import type { QualitySourceBundle, QualitySourcePins } from './calibration-corpus-quality-policy';
import type { QualityAuditContext } from './calibration-corpus-quality-audit';

export const CORPUS_QUALITY_PUBLIC_PATHS = Object.freeze({
  ...CALIBRATION_SOURCE_PATHS, vocabulary: 'metadata/ingredients_metadata.csv',
});
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const pinSchema = z.strictObject({ byteLength: z.number().int().positive().max(4 * 1024 * 1024), sha256: sha });
const publicPin = pinSchema.extend({ path: z.string(), url: z.string().url() }).strict();
export const QualitySourceLockSchema = z.strictObject({
  candidateId: z.literal(QUALITY_CANDIDATE_ID), rankPrefix: z.literal('calorix-n5k-calibration-v2:'),
  checklistVersion: z.literal(QUALITY_CHECKLIST_VERSION),
  sources: z.strictObject({ metadataCafe1: publicPin, metadataCafe2: publicPin, trainSplit: publicPin, vocabulary: publicPin }),
  v1Manifest: pinSchema.extend({ path: z.literal('functions/eval/nutrition/calibration-manifest.json') }).strict(),
});

// Pure data assembly: callers supply either current CLI or trusted historical
// producer identity. This does not confer runtime authority or query Git.
export function buildQualityAuditContext(
  bundle: QualitySourceBundle, pins: QualitySourcePins, sourceLockSha256: string,
  codeCheckpoint: QualityAuditContext['codeCheckpoint'],
): QualityAuditContext {
  const pool = prepareQualityPool(bundle, pins);
  const vocabulary = parseQualityVocabulary(bundle.vocabulary, pins.vocabulary);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const metadata = mergeDishMetadata(parseDishMetadataCsv(decoder.decode(bundle.cafe1)), parseDishMetadataCsv(decoder.decode(bundle.cafe2)));
  return { pool, codeCheckpoint: { ...codeCheckpoint }, sourceLockSha256,
    ingredientsByDish: new Map(pool.eligible.map(row => [row.dishId, metadata.get(row.dishId)!.ingredients.map(item => ({
      ingredientId: item.ingredientId, sourceName: item.name, vocabularyName: vocabulary.get(item.ingredientId)!.name,
    }))])) };
}
