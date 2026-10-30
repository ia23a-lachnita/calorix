import type { EligibleDish, VerifiedCalibrationImage } from './calibration-corpus';
import type { QualityPool } from './calibration-corpus-quality-policy';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { buildOverheadImageUrl, DEVELOPMENT_SLOT_SCHEDULE, VALIDATION_SLOT_SCHEDULE } from './calibration-corpus';
import { selectQualityCandidates, rankQualityDish } from './calibration-corpus-quality-policy';

export interface QualityIngredientReference {
  ingredientId: string;
  sourceName: string;
  vocabularyName: string;
}
export interface QualityAuditContext {
  pool: QualityPool;
  sourceLockSha256: string;
  codeCheckpoint: { implementationCommit: string; functionsTreeId: string };
  ingredientsByDish: ReadonlyMap<string, readonly QualityIngredientReference[]>;
}
export interface QualityConsideration {
  rank: string;
  consideredSlot: QualitySlot;
  considerationSequence: number;
  afterDecisionSequence: number;
}
export interface QualityPhoto extends QualityConsideration {
  dish: EligibleDish;
  ingredients: QualityIngredientReference[];
  image: VerifiedCalibrationImage & { url: string };
}
export interface QualitySlot {
  dishId: string;
  slotIndex: number;
  group: 'development' | 'validation';
}
export type QualityQCReason = 'no_food' | 'additional_food_container' | 'target_clipped' |
  'target_occluded' | 'label_conflict' | 'qc_uncertain';
export type QualityDecisionInput = {
  dishId: string; imageSha: string; reviewer: string; note: string; at: string; supersedes?: number | undefined;
} & ({ verdict: 'pass' } | { verdict: 'reject'; reason: QualityQCReason });
export type QualityDecision = QualityDecisionInput & { sequence: number; checklistVersion: 'single-container-v1' };
export type QualityImageSkipInput = { dishId: string; reason: 'http_404' } | {
  dishId: string; reason: 'invalid_signature' | 'invalid_media_type' | 'invalid_dimensions'; imageSha: string;
};
export type QualityImageSkip = QualityImageSkipInput & QualityConsideration;
export interface QualityAudit {
  candidateId: 'calorix-n5k-quality-candidate-v2';
  checklistVersion: 'single-container-v1';
  status: 'draft' | 'finalized';
  modelRequests: 0;
  identity: {
    codeCheckpoint: QualityAuditContext['codeCheckpoint']; sourceLockSha256: string;
    sourceDigests: QualityPool['sourceDigests']; quarantineDigest: string;
  };
  quarantineIds: string[];
  excluded: QualityPool['excluded'];
  photos: QualityPhoto[];
  skipped: QualityImageSkip[];
  decisions: QualityDecision[];
  selection: QualitySlot[] | null;
}
export interface QualityReviewStatus {
  exhausted: boolean;
  missingImages: QualitySlot[];
  pending: QualitySlot[];
}

export const QUALITY_CANDIDATE_ID = 'calorix-n5k-quality-candidate-v2';
export const QUALITY_CHECKLIST_VERSION = 'single-container-v1';
export const QUALITY_WORKING_ROOT = '.nutrition-eval/corpus-quality-v2';

const sha = z.string().regex(/^[0-9a-f]{64}$/);
const gitSha = z.string().regex(/^[0-9a-f]{40}$/);
const dishId = z.string().regex(/^dish_[0-9]+$/);
const bin = z.union([z.literal(0), z.literal(1), z.literal(2)]);
const checkpoint = z.strictObject({ implementationCommit: gitSha, functionsTreeId: gitSha });
const sourceDigests = z.strictObject({ cafe1: sha, cafe2: sha, trainSplit: sha, vocabulary: sha, v1Manifest: sha });
const identity = z.strictObject({ codeCheckpoint: checkpoint, sourceLockSha256: sha,
  sourceDigests, quarantineDigest: sha });
const eligible = z.strictObject({ dishId, componentBin: bin, calorieBin: bin, macroBin: bin,
  totalCalories: z.number().finite().positive(), totalMass: z.number().finite().positive(),
  totalFat: z.number().finite().nonnegative(), totalCarb: z.number().finite().nonnegative(),
  totalProtein: z.number().finite().nonnegative() });
const ingredient = z.strictObject({ ingredientId: z.string().regex(/^ingr_[0-9]{10}$/),
  sourceName: z.string(), vocabularyName: z.string() });
const slot = z.strictObject({ dishId, slotIndex: z.number().int().min(0).max(39),
  group: z.enum(['development', 'validation']) });
const provenance = { rank: sha, consideredSlot: slot,
  considerationSequence: z.number().int().positive(), afterDecisionSequence: z.number().int().nonnegative() };
const photo = z.strictObject({ dish: eligible, ingredients: z.array(ingredient).nonempty(),
  image: z.strictObject({ sha256: sha, width: z.number().int().positive(),
    height: z.number().int().positive(), mediaType: z.literal('image/png'), url: z.string().url() }), ...provenance });
const reason = z.enum(['no_food', 'additional_food_container', 'target_clipped',
  'target_occluded', 'label_conflict', 'qc_uncertain']);
const nonblank = (label: string, max: number) => z.string().max(max)
  .refine(value => value.trim().length > 0, `${label} must not be blank`);
const decisionBase = {
  sequence: z.number().int().positive(), checklistVersion: z.literal(QUALITY_CHECKLIST_VERSION),
  dishId, imageSha: sha, reviewer: nonblank('reviewer', 128), note: nonblank('note', 2000),
  at: z.string().datetime(), supersedes: z.number().int().positive().optional(),
};
const decision = z.discriminatedUnion('verdict', [
  z.strictObject({ ...decisionBase, verdict: z.literal('pass') }),
  z.strictObject({ ...decisionBase, verdict: z.literal('reject'), reason }),
]);
const imageSkip = z.union([
  z.strictObject({ dishId, reason: z.literal('http_404'), ...provenance }),
  z.strictObject({ dishId, reason: z.enum(['invalid_signature', 'invalid_media_type', 'invalid_dimensions']), imageSha: sha, ...provenance }),
]);
const auditSchema: z.ZodType<QualityAudit> = z.strictObject({
  candidateId: z.literal(QUALITY_CANDIDATE_ID), checklistVersion: z.literal(QUALITY_CHECKLIST_VERSION),
  status: z.enum(['draft', 'finalized']), modelRequests: z.literal(0), identity,
  quarantineIds: z.array(dishId).length(52),
  excluded: z.array(z.strictObject({ dishId, affectedIngredientIds: z.array(z.string()), reason: z.enum([
    'non_positive_calories', 'non_positive_mass', 'negative_macros', 'missing_metadata',
    'deprecated_ingredient', 'unknown_ingredient', 'quarantined_v1', 'quarantined_benchmark',
  ]) })),
  photos: z.array(photo), skipped: z.array(imageSkip), decisions: z.array(decision),
  selection: z.array(slot).length(40).nullable(),
});

function sameJson(left: unknown, right: unknown): boolean {
  if (left === undefined || right === undefined) return left === right;
  // JSON is the persistence format; in particular -0 is serialized as 0.
  return isDeepStrictEqual(JSON.parse(JSON.stringify(left)), JSON.parse(JSON.stringify(right)));
}
function expectedIdentity(context: QualityAuditContext): QualityAudit['identity'] {
  return identity.parse({ codeCheckpoint: context.codeCheckpoint, sourceLockSha256: context.sourceLockSha256,
    sourceDigests: context.pool.sourceDigests, quarantineDigest: context.pool.quarantineDigest });
}
function latestDecisions(audit: QualityAudit): Map<string, QualityDecision> {
  return new Map(audit.decisions.map(row => [row.dishId, row]));
}
function expectedSelection(audit: QualityAudit, context: QualityAuditContext): QualitySlot[] | null {
  const rejected = new Set(audit.skipped.map(row => row.dishId));
  for (const row of latestDecisions(audit).values()) if (row.verdict === 'reject') rejected.add(row.dishId);
  try {
    const selected = selectQualityCandidates(context.pool, rejected);
    return [...selected.development, ...selected.validation].map((row, index) => ({
      dishId: row.dishId, slotIndex: index, group: index < 24 ? 'development' : 'validation',
    }));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('calibration stratum exhausted')) return null;
    throw error;
  }
}
function reviewStatus(audit: QualityAudit): QualityReviewStatus {
  if (audit.selection === null) return { exhausted: true, missingImages: [], pending: [] };
  const considered = new Set(audit.photos.map(row => row.dish.dishId));
  const latest = latestDecisions(audit);
  return { exhausted: false,
    missingImages: audit.selection.filter(row => !considered.has(row.dishId)),
    pending: audit.selection.filter(row => !considered.has(row.dishId) || latest.get(row.dishId)?.verdict !== 'pass') };
}
function mutable(audit: QualityAudit, context: QualityAuditContext): QualityAudit {
  const owned = validateQualityAudit(audit, context);
  if (owned.status === 'finalized') throw new Error('quality audit is finalized');
  return owned;
}
function updated(audit: QualityAudit, context: QualityAuditContext): QualityAudit {
  audit.selection = expectedSelection(audit, context);
  return validateQualityAudit(audit, context);
}
function consideredProvenance(audit: QualityAudit, id: string): QualityConsideration {
  const selected = reviewStatus(audit).missingImages[0];
  if (!selected || selected.dishId !== id) throw new Error('quality image is not the next selected eligible consideration');
  return { rank: rankQualityDish(id), consideredSlot: { ...selected },
    considerationSequence: audit.photos.length + audit.skipped.length + 1, afterDecisionSequence: audit.decisions.length };
}
function checkProvenance(id: string, value: { rank: string; consideredSlot: QualitySlot }, context: QualityAuditContext): void {
  const dish = context.pool.eligible.find(row => row.dishId === id);
  const index = value.consideredSlot.slotIndex;
  const schedule = [...DEVELOPMENT_SLOT_SCHEDULE, ...VALIDATION_SLOT_SCHEDULE][index];
  if (!dish || !schedule || value.rank !== rankQualityDish(id) || value.consideredSlot.dishId !== id ||
      value.consideredSlot.group !== (index < 24 ? 'development' : 'validation') ||
      dish.componentBin !== schedule.componentBin || dish.calorieBin !== schedule.calorieBin || dish.macroBin !== schedule.macroBin) {
    throw new Error('quality image slot/rank provenance mismatch');
  }
}
function replayConsiderations(audit: QualityAudit, context: QualityAuditContext): void {
  const events: ({ kind: 'photo'; value: QualityPhoto } | { kind: 'skip'; value: QualityImageSkip })[] = [
    ...audit.photos.map(value => ({ kind: 'photo' as const, value })),
    ...audit.skipped.map(value => ({ kind: 'skip' as const, value })),
  ];
  events.sort((a, b) => a.value.considerationSequence - b.value.considerationSequence);
  const replay: QualityAudit = { ...audit, photos: [], skipped: [], decisions: [], selection: null };
  replay.selection = expectedSelection(replay, context);
  const applyDecisions = (until: number): void => {
    if (until < replay.decisions.length || until > audit.decisions.length) throw new Error('quality consideration decision order mismatch');
    const changed = until > replay.decisions.length;
    while (replay.decisions.length < until) {
      const row = audit.decisions[replay.decisions.length]!;
      if (!replay.photos.some(item => item.dish.dishId === row.dishId)) throw new Error('quality decision precedes image consideration');
      replay.decisions.push(row);
    }
    if (changed) replay.selection = expectedSelection(replay, context);
  };
  events.forEach((event, index) => {
    if (event.value.considerationSequence !== index + 1) throw new Error('quality consideration sequence mismatch');
    applyDecisions(event.value.afterDecisionSequence);
    const next = reviewStatus(replay).missingImages[0];
    if (!sameJson(event.value.consideredSlot, next)) throw new Error('quality consideration provenance mismatch');
    if (event.kind === 'photo') replay.photos.push(event.value);
    else { replay.skipped.push(event.value); replay.selection = expectedSelection(replay, context); }
  });
  applyDecisions(audit.decisions.length);
  if (!sameJson(audit.selection, replay.selection)) throw new Error('quality audit selection mismatch');
}

export function createQualityAudit(context: QualityAuditContext): QualityAudit {
  const draft: QualityAudit = {
    candidateId: QUALITY_CANDIDATE_ID, checklistVersion: QUALITY_CHECKLIST_VERSION,
    status: 'draft', modelRequests: 0, identity: expectedIdentity(context),
    quarantineIds: [...context.pool.quarantineIds], excluded: context.pool.excluded,
    photos: [], skipped: [], decisions: [], selection: null,
  };
  return updated(draft, context);
}
export function validateQualityAudit(value: unknown, context: QualityAuditContext): QualityAudit {
  const audit = auditSchema.parse(value);
  if (!sameJson(audit.identity, expectedIdentity(context))) throw new Error('quality audit source/code identity mismatch');
  if (!sameJson(audit.quarantineIds, context.pool.quarantineIds) || !sameJson(audit.excluded, context.pool.excluded)) {
    throw new Error('quality audit source exclusion metadata mismatch');
  }
  const eligibleById = new Map(context.pool.eligible.map(row => [row.dishId, row]));
  const considered = new Map<string, QualityPhoto>();
  for (const row of audit.photos) {
    if (considered.has(row.dish.dishId)) throw new Error('duplicate quality photo');
    if (!sameJson(row.dish, eligibleById.get(row.dish.dishId)) ||
        !sameJson(row.ingredients, context.ingredientsByDish.get(row.dish.dishId)) ||
        row.image.url !== buildOverheadImageUrl(row.dish.dishId)) throw new Error('quality photo source metadata mismatch');
    checkProvenance(row.dish.dishId, row, context);
    considered.set(row.dish.dishId, row);
  }
  const skipped = new Set<string>();
  for (const row of audit.skipped) {
    if (!eligibleById.has(row.dishId) || skipped.has(row.dishId) || considered.has(row.dishId)) {
      throw new Error('duplicate or ineligible quality image skip');
    }
    checkProvenance(row.dishId, row, context);
    skipped.add(row.dishId);
  }
  const latest = new Map<string, QualityDecision>();
  audit.decisions.forEach((row, index) => {
    if (row.sequence !== index + 1) throw new Error('quality decision sequence mismatch');
    if (considered.get(row.dishId)?.image.sha256 !== row.imageSha) throw new Error('quality decision image hash mismatch');
    if (row.supersedes !== latest.get(row.dishId)?.sequence) throw new Error('quality decision must supersede the current disposition');
    latest.set(row.dishId, row);
  });
  replayConsiderations(audit, context);
  if (audit.status === 'finalized') {
    const status = reviewStatus(audit);
    if (status.exhausted || status.pending.length > 0) throw new Error('finalized quality audit is incomplete');
  }
  return audit;
}
export function addQualityPhoto(
  audit: QualityAudit, context: QualityAuditContext, id: string, image: VerifiedCalibrationImage,
): QualityAudit {
  const owned = mutable(audit, context);
  if (owned.photos.some(row => row.dish.dishId === id) || owned.skipped.some(row => row.dishId === id)) {
    throw new Error('quality photo already considered');
  }
  const dish = context.pool.eligible.find(row => row.dishId === id);
  const ingredients = context.ingredientsByDish.get(id);
  if (!dish || !ingredients) throw new Error('quality photo is not eligible');
  owned.photos.push(photo.parse({ dish, ingredients, image: { ...image, url: buildOverheadImageUrl(id) },
    ...consideredProvenance(owned, id) }));
  return updated(owned, context);
}
export function recordQualityImageSkip(
  audit: QualityAudit, context: QualityAuditContext, skip: QualityImageSkipInput,
): QualityAudit {
  const owned = mutable(audit, context);
  if (owned.photos.some(row => row.dish.dishId === skip.dishId) || owned.skipped.some(row => row.dishId === skip.dishId)) {
    throw new Error('quality image already considered');
  }
  owned.skipped.push(imageSkip.parse({ ...skip, ...consideredProvenance(owned, skip.dishId) }));
  return updated(owned, context);
}
export function recordQualityDecision(
  audit: QualityAudit, context: QualityAuditContext, input: QualityDecisionInput,
): QualityAudit {
  const owned = mutable(audit, context);
  owned.decisions.push(decision.parse({ ...input, sequence: owned.decisions.length + 1,
    checklistVersion: QUALITY_CHECKLIST_VERSION }));
  return updated(owned, context);
}
export function finalizeQualityAudit(audit: QualityAudit, context: QualityAuditContext): QualityAudit {
  const owned = mutable(audit, context);
  const status = reviewStatus(owned);
  if (status.exhausted || status.pending.length > 0) throw new Error('quality audit incomplete or stratum exhausted');
  owned.status = 'finalized';
  return validateQualityAudit(owned, context);
}
export function qualityReviewStatus(audit: QualityAudit, context: QualityAuditContext): QualityReviewStatus {
  return reviewStatus(validateQualityAudit(audit, context));
}
