import {
  StrictCalibrationManifestV2Schema,
  canonicalizeForHash,
  type StrictCalibrationManifestV2,
} from './schema';
import { createHash } from 'node:crypto';
import { CalibrationActivationLockV2Schema, CALIBRATION_V2_PRIOR_EVIDENCE_PATHS } from './calibration-v2-lock';
import type { CalibrationActivationLockV2 } from './calibration-v2-lock';
import { validateQualityAudit } from './calibration-corpus-quality-audit';
import type { QualityAudit } from './calibration-corpus-quality-audit';
import type { QualitySourceBundle } from './calibration-corpus-quality-policy';
import { QualitySourceLockSchema, CORPUS_QUALITY_PUBLIC_PATHS, buildQualityAuditContext } from './calibration-corpus-quality-source';
import { buildSourceUrl } from './calibration-corpus';
import { inspectImage } from './image-metadata';

export interface CalibrationV2AdmissionInput {
  activationLockBytes: Uint8Array;
  expectedActivationLockSha256: string;
  candidateBytes: Uint8Array;
  corpusLockBytes: Uint8Array;
  bundle: QualitySourceBundle;
  images: ReadonlyMap<string, Uint8Array>;
  priorEvidence: ReadonlyMap<string, Uint8Array>;
}
export interface CalibrationV2Admission {
  lock: Readonly<CalibrationActivationLockV2>;
  audit: Readonly<QualityAudit>;
  manifest: Readonly<StrictCalibrationManifestV2>;
  manifestText: string;
  manifestRawSha256: string;
  activationLockRawSha256: string;
}
function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
function requireDigest(bytes: Uint8Array, expected: string, label: string): void {
  if (!/^[a-f0-9]{64}$/.test(expected) || digest(bytes) !== expected) {
    throw new Error(`calibration:v2-admission:${label}:sha256 mismatch`);
  }
}
function json(bytes: Uint8Array): unknown {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
function freezeData<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeData(child);
    Object.freeze(value);
  }
  return value;
}
function checkImage(bytes: Uint8Array) {
  try {
    const meta = inspectImage(bytes);
    return meta.mediaType === 'image/png' ? { ok: true as const, meta } :
      { ok: false as const, reason: 'invalid_media_type' as const };
  } catch (error) {
    return { ok: false as const, reason: error instanceof Error && /dimensions must be positive/i.test(error.message)
      ? 'invalid_dimensions' as const : 'invalid_signature' as const };
  }
}

// Fixture pins can validate data here; only the fixed native reader and the
// later registered bootstrap may turn admitted data into runtime authority.
export function admitCalibrationV2Candidate(input: CalibrationV2AdmissionInput): Readonly<CalibrationV2Admission> {
  const activationBytes = Uint8Array.from(input.activationLockBytes);
  requireDigest(activationBytes, input.expectedActivationLockSha256, 'activation-lock');
  const lock = CalibrationActivationLockV2Schema.parse(json(activationBytes));
  const candidateBytes = Uint8Array.from(input.candidateBytes);
  const corpusLockBytes = Uint8Array.from(input.corpusLockBytes);
  // Both raw pins precede either JSON parse, including malformed data.
  requireDigest(candidateBytes, lock.candidate.rawSha256, 'candidate');
  requireDigest(corpusLockBytes, lock.candidate.corpusLockRawSha256, 'corpus-lock');
  const sourceLock = QualitySourceLockSchema.parse(json(corpusLockBytes));
  for (const key of Object.keys(CORPUS_QUALITY_PUBLIC_PATHS) as (keyof typeof CORPUS_QUALITY_PUBLIC_PATHS)[]) {
    const expected = CORPUS_QUALITY_PUBLIC_PATHS[key]; const pin = sourceLock.sources[key];
    if (pin.path !== expected || pin.url !== buildSourceUrl(expected)) throw new Error('calibration:v2-admission:source path/URL mismatch');
  }
  for (const path of CALIBRATION_V2_PRIOR_EVIDENCE_PATHS) {
    const bytes = input.priorEvidence.get(path);
    if (bytes === undefined) throw new Error('calibration:v2-admission:missing prior evidence');
    requireDigest(bytes, lock.prior.evidenceSha256[path], 'prior evidence');
  }
  const context = buildQualityAuditContext(input.bundle, {
    cafe1: sourceLock.sources.metadataCafe1, cafe2: sourceLock.sources.metadataCafe2,
    trainSplit: sourceLock.sources.trainSplit, vocabulary: sourceLock.sources.vocabulary,
    v1Manifest: sourceLock.v1Manifest,
  }, lock.candidate.corpusLockRawSha256, lock.candidate.producer);
  if (context.pool.quarantineDigest !== lock.candidate.quarantineDigest) throw new Error('calibration:v2-admission:quarantine mismatch');
  const audit = validateQualityAudit(json(candidateBytes), context);
  if (audit.status !== 'finalized' || audit.selection === null || audit.selection.length !== 40) {
    throw new Error('calibration:v2-admission:finalized complete candidate required');
  }
  const readImage = (hash: string): Uint8Array => {
    const source = input.images.get(hash);
    if (source === undefined || source.length > 5 * 1024 * 1024) throw new Error('calibration:v2-admission:missing or oversized image');
    const bytes = Uint8Array.from(source);
    requireDigest(bytes, hash, 'image');
    return bytes;
  };
  for (const photo of audit.photos) {
    const checked = checkImage(readImage(photo.image.sha256));
    if (!checked.ok || checked.meta.width !== photo.image.width || checked.meta.height !== photo.image.height) {
      throw new Error('calibration:v2-admission:image metadata mismatch');
    }
  }
  for (const skip of audit.skipped) {
    if (skip.reason === 'http_404') continue;
    const checked = checkImage(readImage(skip.imageSha));
    if (checked.ok || checked.reason !== skip.reason) throw new Error('calibration:v2-admission:invalid-image classification mismatch');
  }
  const photos = new Map(audit.photos.map(photo => [photo.dish.dishId, photo]));
  const activationLockRawSha256 = digest(activationBytes);
  const manifest = StrictCalibrationManifestV2Schema.parse({
    version: 2, datasetId: 'calorix-n5k-calibration-v2', sourceLockHash: activationLockRawSha256,
    cases: audit.selection.map(slot => {
      const photo = photos.get(slot.dishId)!; const dish = photo.dish;
      return { id: 'calibration-' + slot.dishId, visibility: 'public', scanMode: 'meal',
        source: { dataset: 'nutrition5k', objectId: slot.dishId }, image: { ...photo.image },
        truth: { basis: 'portion', amount: 1, unit: 'portion', kcal: dish.totalCalories,
          proteinG: dish.totalProtein, carbsG: dish.totalCarb, fatG: dish.totalFat, referenceMassG: dish.totalMass },
        toleranceClass: 'meal-estimate', attributionId: 'nutrition5k-cc-by-4.0',
        group: slot.group, slotIndex: slot.slotIndex, rank: photo.rank,
        stratum: { componentBin: dish.componentBin, calorieBin: dish.calorieBin, macroBin: dish.macroBin } };
    }),
  });
  const manifestText = serializeCalibrationV2Manifest(manifest);
  return freezeData({ lock, audit, manifest, manifestText,
    manifestRawSha256: digest(Buffer.from(manifestText, 'utf8')), activationLockRawSha256 });
}

// Recursively sorted-key, array-order-preserving canonical JSON text for a
// strict v2 manifest. Strict-validates its input first so a serialized
// manifest is always a schema-valid one, and reuses the schema module's
// canonicalization (no duplicated canonicalization algorithm here).
export function serializeCalibrationV2Manifest(manifest: StrictCalibrationManifestV2): string {
  const parsed = StrictCalibrationManifestV2Schema.parse(manifest);
  const canonical = canonicalizeForHash(parsed);
  return JSON.stringify(canonical);
}
