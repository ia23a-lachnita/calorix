import { describe, expect, it, vi } from 'vitest';
import { admitCalibrationV2Candidate } from '../../src/nutrition-eval/calibration-v2-admission';
import { CalibrationActivationLockV2Schema } from '../../src/nutrition-eval/calibration-v2-lock';
import { validateQualityAudit } from '../../src/nutrition-eval/calibration-corpus-quality-audit';
import { StrictCalibrationManifestSchema } from '../../src/nutrition-eval/schema';
import {
  admissionFixture, admissionJsonBytes, admissionSha, canonicalFixtureJson,
  invalidSkipFixture, PRIOR_EVIDENCE_PATHS, repinFixture,
} from './helpers/calibration-v2-admission-fixtures';

describe('closed activation-lock data schema', () => {
  it('round-trips the complete explicit v2 fixture lock', () => {
    const { lock } = admissionFixture();
    expect(CalibrationActivationLockV2Schema.parse(lock)).toEqual(lock);
  });

  it.each([
    ['unknown field', (lock: ReturnType<typeof admissionFixture>['lock']) => { Object.assign(lock, { extra: true }); }],
    ['self hash', (lock: ReturnType<typeof admissionFixture>['lock']) => { Object.assign(lock, { manifestRawSha256: 'a'.repeat(64) }); }],
    ['v1 identity', (lock: ReturnType<typeof admissionFixture>['lock']) => { lock.ledgerProtocolVersion = 'v1'; }],
    ['wrong native root', (lock: ReturnType<typeof admissionFixture>['lock']) => { lock.prior.root = '.nutrition-eval/foreign/'; }],
    ['missing prior evidence', (lock: ReturnType<typeof admissionFixture>['lock']) => { delete lock.prior.evidenceSha256['ledger.json']; }],
    ['extra prior evidence', (lock: ReturnType<typeof admissionFixture>['lock']) => { lock.prior.evidenceSha256['foreign.json'] = 'a'.repeat(64); }],
    ['wrong model', (lock: ReturnType<typeof admissionFixture>['lock']) => { lock.route.model = 'gemini-2.5-flash'; }],
    ['wrong project', (lock: ReturnType<typeof admissionFixture>['lock']) => { lock.route.project = 'other'; }],
    ['extra route option', (lock: ReturnType<typeof admissionFixture>['lock']) => { Object.assign(lock.route, { retries: 1 }); }],
    ['spare image ceiling', (lock: ReturnType<typeof admissionFixture>['lock']) => { lock.budget.hardImageCeiling = 147; }],
    ['inconsistent total', (lock: ReturnType<typeof admissionFixture>['lock']) => { lock.budget.workstreamImageCeiling = 195; }],
    ['another token count', (lock: ReturnType<typeof admissionFixture>['lock']) => { lock.budget.tokenCountCalls = 2; }],
    ['wrong historical count', (lock: ReturnType<typeof admissionFixture>['lock']) => { lock.prior.imageReservations = 49; }],
    ['bad producer', (lock: ReturnType<typeof admissionFixture>['lock']) => { lock.candidate.producer.functionsTreeId = 'bad'; }],
  ])('rejects %s', (_label, mutate) => {
    const lock = structuredClone(admissionFixture().lock);
    mutate(lock);
    expect(CalibrationActivationLockV2Schema.safeParse(lock).success).toBe(false);
  });
});

describe('pure historical candidate admission', () => {
  it('accepts_locked_historical_producer_after_runtime_source_moves', () => {
    const fixture = admissionFixture();
    // Independently assembled audit/source goldens must satisfy the old audit
    // validator before the new admission result can be credited.
    expect(validateQualityAudit(fixture.audit, fixture.context)).toEqual(fixture.audit);
    const result = admitCalibrationV2Candidate(fixture.input);
    expect(result.audit.identity.codeCheckpoint).toEqual({
      implementationCommit: 'a'.repeat(40), functionsTreeId: 'b'.repeat(40),
    });
    expect(result.manifest).toEqual(fixture.expectedManifest);
    expect(result.audit.photos).toHaveLength(41);
    expect(result.audit.decisions.filter(row => row.verdict === 'reject')).toHaveLength(1);
    expect(result.manifest.cases.map(row => row.source.objectId)).not.toContain(fixture.audit.photos[0]!.dish.dishId);
    expect(result.activationLockRawSha256).toBe(fixture.input.expectedActivationLockSha256);
    const expectedText = canonicalFixtureJson(fixture.expectedManifest);
    expect(result.manifestText).toBe(expectedText);
    expect(result.manifestText.endsWith('\n')).toBe(false);
    expect(result.manifestRawSha256).toBe(admissionSha(Buffer.from(expectedText)));
    expect(result.manifest.sourceLockHash).toBe(result.activationLockRawSha256);
    expect(result.lock).not.toHaveProperty('manifestRawSha256');
  });

  it('owns and recursively freezes returned data without changing inputs', () => {
    const { input } = admissionFixture(); const before = structuredClone(input);
    const result = admitCalibrationV2Candidate(input);
    // structuredClone normalizes Node Buffer to Uint8Array; compare the same
    // representation on both sides so byte mutation, rather than type, fails.
    expect(structuredClone(input)).toEqual(before);
    expect(Reflect.set(result.manifest.cases[0]!.truth, 'kcal', 999)).toBe(false);
    expect(Reflect.set(result.audit.photos[0]!.ingredients[0]!, 'sourceName', 'changed')).toBe(false);
    expect(Reflect.set(result.lock.candidate.producer, 'implementationCommit', 'f'.repeat(40))).toBe(false);
    expect(Reflect.set(result, 'manifestText', 'changed')).toBe(false);
    input.candidateBytes.fill(0); input.bundle.cafe1.fill(0);
    expect(result.audit.status).toBe('finalized');
    expect(result.manifest.cases[0]!.truth.kcal).toBe(100);
  });

  it('keeps_v1_schema_and_cli_current_checkpoint_guard', () => {
    const fixture = admissionFixture(); const result = admitCalibrationV2Candidate(fixture.input);
    expect(StrictCalibrationManifestSchema.safeParse(result.manifest).success).toBe(false);
    const current = { ...fixture.context, codeCheckpoint: {
      implementationCommit: 'd'.repeat(40), functionsTreeId: 'e'.repeat(40),
    } };
    expect(() => validateQualityAudit(fixture.audit, current)).toThrow(/identity/i);
    expect(result.audit.identity.codeCheckpoint).not.toEqual(current.codeCheckpoint);
  });

  it('hashes_before_parsing_candidate_and_corpus_lock', () => {
    for (const field of ['candidateBytes', 'corpusLockBytes'] as const) {
      const { input } = admissionFixture(); const malformed = '{unparseable:' + field;
      input[field] = Buffer.from(malformed);
      const parse = JSON.parse; let malformedParses = 0;
      const spy = vi.spyOn(JSON, 'parse').mockImplementation((text, reviver) => {
        if (text === malformed) malformedParses += 1;
        return parse(text, reviver);
      });
      try {
        expect(() => admitCalibrationV2Candidate(input)).toThrow(/sha256 mismatch/i);
        expect(malformedParses).toBe(0);
      } finally { spy.mockRestore(); }
    }
  });

  it('checks activation-lock raw identity before parsing malformed JSON', () => {
    const { input } = admissionFixture(); input.activationLockBytes = Buffer.from('{bad');
    expect(() => admitCalibrationV2Candidate(input)).toThrow(/sha256 mismatch/i);
  });

  it.each(['candidate', 'corpus-lock'] as const)('rejects hash-matching malformed %s JSON', kind => {
    const fixture = admissionFixture();
    if (kind === 'candidate') {
      fixture.input.candidateBytes = Buffer.from('{bad candidate');
      fixture.lock.candidate.rawSha256 = admissionSha(fixture.input.candidateBytes);
    } else {
      fixture.input.corpusLockBytes = Buffer.from('{bad corpus lock');
      fixture.lock.candidate.corpusLockRawSha256 = admissionSha(fixture.input.corpusLockBytes);
    }
    fixture.input.activationLockBytes = admissionJsonBytes(fixture.lock);
    fixture.input.expectedActivationLockSha256 = admissionSha(fixture.input.activationLockBytes);
    expect(() => admitCalibrationV2Candidate(fixture.input)).toThrow();
  });

  it.each([
    ['forged producer', (f: ReturnType<typeof admissionFixture>) => { f.audit.identity.codeCheckpoint.implementationCommit = 'd'.repeat(40); }],
    ['wrong source lock', (f: ReturnType<typeof admissionFixture>) => { f.audit.identity.sourceLockSha256 = 'f'.repeat(64); }],
    ['wrong vocabulary', (f: ReturnType<typeof admissionFixture>) => { f.audit.identity.sourceDigests.vocabulary = 'f'.repeat(64); }],
    ['wrong quarantine', (f: ReturnType<typeof admissionFixture>) => { f.lock.candidate.quarantineDigest = 'f'.repeat(64); }],
    ['draft', (f: ReturnType<typeof admissionFixture>) => { f.audit.status = 'draft'; }],
    ['null selection', (f: ReturnType<typeof admissionFixture>) => { f.audit.selection = null; }],
    ['rejected selection', (f: ReturnType<typeof admissionFixture>) => { f.audit.selection![0]!.dishId = f.audit.photos[0]!.dish.dishId; }],
    ['changed source URL', (f: ReturnType<typeof admissionFixture>) => { f.corpusLock.sources.vocabulary!.url = 'https://example.com/foreign'; }],
    ['changed source path', (f: ReturnType<typeof admissionFixture>) => { f.corpusLock.sources.trainSplit!.path = 'foreign.txt'; }],
  ])('rejects %s under an explicit fixture raw pin', (_label, mutate) => {
    const fixture = admissionFixture(); mutate(fixture); repinFixture(fixture);
    expect(() => admitCalibrationV2Candidate(fixture.input)).toThrow();
  });

  it('rejects changed source bytes against the admitted corpus lock', () => {
    const { input } = admissionFixture(); input.bundle.vocabulary[0] = 0;
    expect(() => admitCalibrationV2Candidate(input)).toThrow(/sha256 mismatch/i);
  });

  it('rejects_changed_rejected_photo', () => {
    const { input, audit } = admissionFixture();
    input.images.set(audit.photos[0]!.image.sha256, Buffer.from('changed rejected photo'));
    expect(() => admitCalibrationV2Candidate(input)).toThrow(/image|sha256/i);
  });

  it.each(['selected', 'rejected'] as const)('rejects missing %s image bytes', kind => {
    const { input, audit } = admissionFixture();
    input.images.delete(audit.photos[kind === 'rejected' ? 0 : 1]!.image.sha256);
    expect(() => admitCalibrationV2Candidate(input)).toThrow(/image/i);
  });

  it('rejects altered selected image dimensions even with unchanged binary hash', () => {
    const fixture = admissionFixture(); fixture.audit.photos[1]!.image.width += 1; repinFixture(fixture);
    expect(() => admitCalibrationV2Candidate(fixture.input)).toThrow(/image|dimension/i);
  });

  it('verifies invalid-image skip bytes and the declared reason', () => {
    const fixture = invalidSkipFixture();
    expect(validateQualityAudit(fixture.audit, fixture.context)).toEqual(fixture.audit);
    expect(admitCalibrationV2Candidate(fixture.input).audit.skipped).toEqual(fixture.audit.skipped);
  });

  it('rejects missing invalid-image skip bytes', () => {
    const fixture = invalidSkipFixture(); const skip = fixture.audit.skipped[0]!;
    if (skip.reason === 'http_404') throw new Error('fixture requires invalid-image evidence');
    fixture.input.images.delete(skip.imageSha);
    expect(() => admitCalibrationV2Candidate(fixture.input)).toThrow(/image/i);
  });

  it('rejects a false invalid-image skip classification', () => {
    const fixture = invalidSkipFixture(); const skip = fixture.audit.skipped[0]!;
    if (skip.reason === 'http_404') throw new Error('fixture requires invalid-image evidence');
    skip.reason = 'invalid_dimensions'; repinFixture(fixture);
    expect(() => admitCalibrationV2Candidate(fixture.input)).toThrow(/image|reason|classification/i);
  });

  it.each(PRIOR_EVIDENCE_PATHS)('rejects byte drift in frozen prior %s', path => {
    const { input } = admissionFixture(); input.priorEvidence.set(path, Buffer.from('changed'));
    expect(() => admitCalibrationV2Candidate(input)).toThrow(/prior|sha256/i);
  });
});
