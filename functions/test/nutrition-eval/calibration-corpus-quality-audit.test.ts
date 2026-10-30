import { describe, expect, it } from 'vitest';
import {
  createQualityAudit, validateQualityAudit, addQualityPhoto, recordQualityImageSkip,
  recordQualityDecision, finalizeQualityAudit, qualityReviewStatus,
} from '../../src/nutrition-eval/calibration-corpus-quality-audit';
import type { QualityDecisionInput } from '../../src/nutrition-eval/calibration-corpus-quality-audit';
import { StrictCalibrationManifestSchema } from '../../src/nutrition-eval/schema';
import { createHash } from 'node:crypto';
import {
  QUALITY_GOLDEN_IDS, qualityContextFixture, qualityDraftFixture, qualityReadyFixture,
  qualityPhotoFixture, qualityPassInput, qualityImageMetaFixture,
} from './helpers/corpus-quality-fixtures';

describe('quality audit: source-bound candidate data, never runtime authority', () => {
  it('creates the exact independently specified draft and forty pending reviews', () => {
    const context = qualityContextFixture();
    const audit = createQualityAudit(context);
    expect(audit).toEqual(qualityDraftFixture(context));
    expect(qualityReviewStatus(audit, context)).toEqual({
      exhausted: false, missingImages: audit.selection, pending: audit.selection,
    });
  });

  it('rejects source/code identity drift before treating an audit as valid', () => {
    const context = qualityContextFixture();
    const audit = qualityDraftFixture(context);
    audit.identity.codeCheckpoint.functionsTreeId = 'd'.repeat(40);
    expect(() => validateQualityAudit(audit, context)).toThrow(/identity/);
  });

  it('recomputes the full selection and rejects a substituted slot', () => {
    const context = qualityContextFixture();
    const audit = qualityDraftFixture(context);
    audit.selection![0]!.dishId = context.pool.quarantineIds[0]!;
    expect(() => validateQualityAudit(audit, context)).toThrow(/selection/);
  });

  it('derives photo metadata from sources and does not mutate its input draft', () => {
    const context = qualityContextFixture();
    const audit = qualityDraftFixture(context);
    const id = QUALITY_GOLDEN_IDS[0]!;
    const added = addQualityPhoto(audit, context, id, qualityImageMetaFixture(id));
    expect(added.photos).toEqual([qualityPhotoFixture(context, id)]);
    expect(audit.photos).toEqual([]);
    expect(() => addQualityPhoto(added, context, id, qualityImageMetaFixture(id))).toThrow(/already|duplicate/);
    expect(() => addQualityPhoto(audit, context, 'dish_8000000000', qualityImageMetaFixture(id))).toThrow(/eligible|quarantin/);
  });

  it('rejects altered dish truth or ingredient descriptions in stored photos', () => {
    const context = qualityContextFixture();
    const truth = qualityReadyFixture(context);
    truth.photos[0]!.dish.totalCalories += 1;
    expect(() => validateQualityAudit(truth, context)).toThrow(/photo|source|metadata/);
    const ingredients = qualityReadyFixture(context);
    ingredients.photos[0]!.ingredients[0]!.vocabularyName = 'invented replacement';
    expect(() => validateQualityAudit(ingredients, context)).toThrow(/photo|source|metadata/);
  });

  it('reproduces serialized source-bound records using JSON numeric semantics', () => {
    const context = qualityContextFixture();
    context.pool.eligible.find(row => row.dishId === QUALITY_GOLDEN_IDS[0])!.totalFat = -0;
    const serialized: unknown = JSON.parse(JSON.stringify(qualityReadyFixture(context)));
    const validated = validateQualityAudit(serialized, context);
    expect(Object.is(validated.photos[0]!.dish.totalFat, 0)).toBe(true);
  });

  it('reports source metadata mismatch for a stored ineligible photo', () => {
    const context = qualityContextFixture();
    const audit = qualityReadyFixture(context);
    audit.photos[0]!.dish.dishId = 'dish_8000000000';
    expect(() => validateQualityAudit(audit, context)).toThrow(/source metadata mismatch/);
  });

  it('binds considered photos to their original slot and deterministic rank', () => {
    const context = qualityContextFixture();
    const draft = qualityDraftFixture(context);
    const id = QUALITY_GOLDEN_IDS[0]!;
    const provenance = { rank: createHash('sha256').update('calorix-n5k-calibration-v2:' + id).digest('hex'),
      consideredSlot: { dishId: id, slotIndex: 0, group: 'development' } };
    expect(addQualityPhoto(draft, context, id, qualityImageMetaFixture(id)).photos[0]).toMatchObject(provenance);
  });

  it('binds image skips to their original slot and deterministic rank', () => {
    const context = qualityContextFixture();
    const id = QUALITY_GOLDEN_IDS[0]!;
    expect(recordQualityImageSkip(qualityDraftFixture(context), context, { dishId: id, reason: 'http_404' }).skipped[0])
      .toMatchObject({ rank: createHash('sha256').update('calorix-n5k-calibration-v2:' + id).digest('hex'),
        consideredSlot: { dishId: id, slotIndex: 0, group: 'development' } });
  });

  it('replays exact consideration order instead of accepting a same-stratum invented slot', () => {
    const context = qualityContextFixture();
    const audit = qualityReadyFixture(context);
    audit.photos[0]!.consideredSlot = { dishId: QUALITY_GOLDEN_IDS[0]!, slotIndex: 24, group: 'validation' };
    expect(() => finalizeQualityAudit(audit, context)).toThrow(/consideration|provenance/);
  });

  it('rejects a never-reached lower-ranked skip even if its stratum and rank look valid', () => {
    const context = qualityContextFixture();
    const audit = qualityReadyFixture(context);
    const id = 'dish_9001000002';
    audit.skipped.push({ dishId: id, reason: 'http_404',
      rank: createHash('sha256').update('calorix-n5k-calibration-v2:' + id).digest('hex'),
      consideredSlot: { dishId: id, slotIndex: 0, group: 'development' },
      considerationSequence: 41, afterDecisionSequence: 40 });
    expect(() => finalizeQualityAudit(audit, context)).toThrow(/consideration|provenance/);
  });

  it('replays legitimate rejection, replacement photo and later superseding correction', () => {
    const context = qualityContextFixture();
    const id = QUALITY_GOLDEN_IDS[0]!;
    const rejected = recordQualityDecision(qualityReadyFixture(context), context,
      { ...qualityPassInput(id), verdict: 'reject', reason: 'qc_uncertain', supersedes: 1 });
    const replacement = 'dish_9001000000';
    const withPhoto = addQualityPhoto(rejected, context, replacement, qualityImageMetaFixture(replacement));
    expect(withPhoto.photos[40]).toMatchObject({ considerationSequence: 41, afterDecisionSequence: 41 });
    const corrected = recordQualityDecision(withPhoto, context, { ...qualityPassInput(id), supersedes: 41 });
    expect(finalizeQualityAudit(corrected, context).photos).toHaveLength(41);
    expect(corrected.selection!.map(row => row.dishId)).toEqual(QUALITY_GOLDEN_IDS);
  });

  it('rejects duplicate consideration ordinals and decisions that precede their photo', () => {
    const context = qualityContextFixture();
    const duplicate = qualityReadyFixture(context);
    duplicate.photos[1]!.considerationSequence = 1;
    expect(() => validateQualityAudit(duplicate, context)).toThrow(/consideration/);
    const premature = qualityReadyFixture(context);
    premature.photos[0]!.afterDecisionSequence = 1;
    expect(() => validateQualityAudit(premature, context)).toThrow(/precedes|consideration/);
  });

  it('requires a considered image and matching image hash for each decision', () => {
    const context = qualityContextFixture();
    const id = QUALITY_GOLDEN_IDS[0]!;
    expect(() => recordQualityDecision(qualityDraftFixture(context), context, qualityPassInput(id))).toThrow(/photo|image/);
    const audit = qualityReadyFixture(context);
    expect(() => recordQualityDecision(audit, context, {
      ...qualityPassInput(id), imageSha: '0'.repeat(64), supersedes: 1,
    })).toThrow(/image|hash/);
  });

  it('requires explicit current supersession and preserves every prior decision', () => {
    const context = qualityContextFixture();
    const audit = qualityReadyFixture(context);
    const id = QUALITY_GOLDEN_IDS[0]!;
    expect(() => recordQualityDecision(audit, context, qualityPassInput(id))).toThrow(/supersed/);
    expect(() => recordQualityDecision(audit, context, { ...qualityPassInput(id), supersedes: 2 })).toThrow(/supersed/);
    const rejected = recordQualityDecision(audit, context, {
      ...qualityPassInput(id), verdict: 'reject', reason: 'qc_uncertain', supersedes: 1,
    });
    expect(rejected.decisions).toHaveLength(41);
    expect(rejected.decisions[0]).toEqual(audit.decisions[0]);
    expect(rejected.decisions[40]!.sequence).toBe(41);
    expect(rejected.selection![0]!.dishId).toBe('dish_9001000004');
    expect(qualityReviewStatus(rejected, context).missingImages.map(row => row.dishId)).toEqual(['dish_9001000000']);
    const corrected = recordQualityDecision(rejected, context, { ...qualityPassInput(id), supersedes: 41 });
    expect(corrected.decisions).toHaveLength(42);
    expect(corrected.selection!.map(row => row.dishId)).toEqual(QUALITY_GOLDEN_IDS);
    expect(audit.decisions).toHaveLength(40);
  });

  it('rejects blank reviewers/notes and reasons on pass dispositions', () => {
    const context = qualityContextFixture();
    const audit = qualityReadyFixture(context);
    const input = { ...qualityPassInput(QUALITY_GOLDEN_IDS[0]!), supersedes: 1 };
    expect(() => recordQualityDecision(audit, context, { ...input, reviewer: ' ' })).toThrow(/reviewer/);
    expect(() => recordQualityDecision(audit, context, { ...input, note: ' ' })).toThrow(/note/);
    expect(() => recordQualityDecision(audit, context, {
      ...input, reason: 'qc_uncertain',
    } as unknown as QualityDecisionInput)).toThrow(/reason|unrecognized/);
  });

  it('validates sequence/checklist/supersession history rather than trusting the last row', () => {
    const context = qualityContextFixture();
    const sequence = qualityReadyFixture(context);
    sequence.decisions[0]!.sequence = 9;
    expect(() => validateQualityAudit(sequence, context)).toThrow(/sequence/);
    const hash = qualityReadyFixture(context);
    hash.decisions[0]!.imageSha = '0'.repeat(64);
    expect(() => validateQualityAudit(hash, context)).toThrow(/image|hash/);
  });

  it('retains typed image skips and refuses to replace a previously considered image', () => {
    const context = qualityContextFixture();
    const draft = qualityDraftFixture(context);
    const id = QUALITY_GOLDEN_IDS[0]!;
    const skipped = recordQualityImageSkip(draft, context, { dishId: id, reason: 'http_404' });
    expect(skipped.skipped).toEqual([{ dishId: id, reason: 'http_404',
      rank: createHash('sha256').update('calorix-n5k-calibration-v2:' + id).digest('hex'),
      consideredSlot: { dishId: id, slotIndex: 0, group: 'development' },
      considerationSequence: 1, afterDecisionSequence: 0 }]);
    expect(skipped.selection![0]!.dishId).toBe('dish_9001000004');
    expect(() => recordQualityImageSkip(skipped, context, { dishId: id, reason: 'http_404' })).toThrow(/already|duplicate/);
    expect(() => recordQualityImageSkip(qualityReadyFixture(context), context,
      { dishId: id, reason: 'http_404' })).toThrow(/already|photo/);
  });

  it('retains the rejection that exhausts a stratum while refusing finalization', () => {
    const context = qualityContextFixture();
    context.pool.eligible = context.pool.eligible.filter(row =>
      !(row.componentBin === 0 && row.calorieBin === 0 && row.macroBin === 0) ||
      ['dish_9001000003', 'dish_9001000004', 'dish_9001000001'].includes(row.dishId));
    const audit = qualityReadyFixture(context);
    const exhausted = recordQualityDecision(audit, context, {
      ...qualityPassInput(QUALITY_GOLDEN_IDS[0]!), verdict: 'reject', reason: 'qc_uncertain', supersedes: 1,
    });
    expect(exhausted.selection).toBeNull();
    expect(exhausted.decisions).toHaveLength(41);
    expect(qualityReviewStatus(exhausted, context).exhausted).toBe(true);
    expect(() => finalizeQualityAudit(exhausted, context)).toThrow(/exhaust|incomplete/);
  });

  it('finalizes only forty source-bound passed photos and cannot become a v1 manifest', () => {
    const context = qualityContextFixture();
    expect(() => finalizeQualityAudit(qualityDraftFixture(context), context)).toThrow(/incomplete|review|photo/);
    const ready = qualityReadyFixture(context);
    const finalized = finalizeQualityAudit(ready, context);
    expect(finalized.status).toBe('finalized');
    expect(finalized.photos).toHaveLength(40);
    expect(finalized.decisions).toHaveLength(40);
    expect(finalized.modelRequests).toBe(0);
    expect(qualityReviewStatus(finalized, context).pending).toEqual([]);
    expect(StrictCalibrationManifestSchema.safeParse(finalized).success).toBe(false);
    expect(() => recordQualityDecision(finalized, context, {
      ...qualityPassInput(QUALITY_GOLDEN_IDS[0]!), supersedes: 1,
    })).toThrow(/finalized/);
    expect(ready.status).toBe('draft');
  });

  it('rejects unknown runtime-like fields and a nonzero model-call declaration', () => {
    const context = qualityContextFixture();
    expect(() => validateQualityAudit({ ...qualityDraftFixture(context), profile: 'LOW' }, context)).toThrow(/profile|unrecognized/);
    expect(() => validateQualityAudit({ ...qualityDraftFixture(context), modelRequests: 1 }, context)).toThrow(/modelRequests|literal/);
  });
});
