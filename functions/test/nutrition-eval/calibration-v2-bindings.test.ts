import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import { v2BootstrapFixture, formatV2FixtureLock } from './helpers/calibration-v2-bootstrap-fixtures';
import { admissionSha, repinFixture } from './helpers/calibration-v2-admission-fixtures';
import { admitCalibrationV2Candidate } from '../../src/nutrition-eval/calibration-v2-admission';
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';
import { prepareCalibrationV2BootstrapContext, requireCalibrationV2Context } from '../../src/nutrition-eval/calibration-protocol-bindings';

const trust = vi.hoisted(() => ({ sha: '', clients: 0, network: 0, writes: 0 }));
vi.mock('../../src/nutrition-eval/calibration-v2-lock', async original => ({
  ...await original<typeof import('../../src/nutrition-eval/calibration-v2-lock')>(),
  get CALIBRATION_ACTIVATION_LOCK_V2_SHA256() { return trust.sha; },
}));
vi.mock('@google/genai', async original => ({
  ...await original<typeof import('@google/genai')>(),
  GoogleGenAI: class { constructor() { trust.clients++; throw new Error('forbidden bootstrap client'); } },
}));
beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => { trust.network++; throw new Error('forbidden bootstrap network'); });
  for (const method of ['writeFile', 'mkdir', 'rename'] as const) {
    vi.spyOn(fs, method).mockImplementation(() => { trust.writes++; throw new Error('forbidden bootstrap write'); });
  }
});
afterEach(() => {
  try { expect({ clients: trust.clients, network: trust.network, writes: trust.writes }).toEqual({ clients: 0, network: 0, writes: 0 }); }
  finally { vi.restoreAllMocks(); trust.clients = 0; trust.network = 0; trust.writes = 0; }
});
function fixture() { const f = v2BootstrapFixture(); trust.sha = f.fixture.input.expectedActivationLockSha256; return f; }
function repin(f: ReturnType<typeof fixture>) {
  repinFixture(f.fixture); trust.sha = f.fixture.input.expectedActivationLockSha256;
  f.fixture.expectedManifest.sourceLockHash = trust.sha;
}

describe('guarded v2 prepared contexts', () => {
  it('admits real fixture data and produces the six owned v2 fields with current source identity', async () => {
    const f = fixture();
    expect(admitCalibrationV2Candidate(f.fixture.input).manifest).toEqual(f.fixture.expectedManifest);
    const context = await prepareCalibrationV2BootstrapContext(f.deps);
    expect(Object.keys(context).sort()).toEqual(['baseDir', 'files', 'firstDevelopmentCaseId', 'identity', 'owner', 'report']);
    expect(context.baseDir).toBe('/fixture/calorix');
    expect(context.identity).toEqual({ protocolVersion: 'v2', provider: 'vertex-ai', model: 'gemini-3.8-flash',
      implementationCommit: 'd'.repeat(40), functionsTreeId: 'e'.repeat(40),
      datasetHash: f.fixture.lock.shared.publicManifestHash, publicManifestHash: f.fixture.lock.shared.publicManifestHash,
      promptHash: f.fixture.lock.shared.promptHash, responseSchemaHash: f.fixture.lock.shared.responseSchemaHash,
      sourceLockHash: trust.sha, manifestHash: f.expectedManifestHash(),
      snapshotLockHash: f.fixture.lock.shared.offLockRawSha256,
      historicalReferenceHash: f.fixture.lock.shared.historicalReferenceRawSha256,
      plannedImageCalls: 146, hardCeiling: 146 });
    expect(context.owner).toEqual(f.owner);
    expect(context.firstDevelopmentCaseId).toBe('calibration-dish_9001000004');
    expect(context.report).toMatchObject({ datasetId: 'calorix-public-v1',
      publicManifestHash: f.fixture.lock.shared.publicManifestHash, promptHash: f.fixture.lock.shared.promptHash,
      firstDevelopmentCaseId: 'calibration-dish_9001000004', historicalCompatible: false });
    expect(context.report.compatibilityNotes.map(note => note.key)).toEqual([
      'historicalCodeSha', 'generationProfile', 'mediaTypeLabel', 'offRoute', 'sliceGCaveat',
    ]);
    expect(context.files['source-lock']).toBe(Buffer.from(f.fixture.input.activationLockBytes).toString('utf8'));
    expect(context.files['calibration-manifest']).toBe(f.expectedManifestText());
    for (const [path, text] of f.shared) {
      const key = path.includes('public-manifest') ? 'public-manifest' : path.includes('off-snapshot') ? 'off-lock' : 'historical-reference';
      expect(context.files[key]).toBe(text);
    }
    expect(f.deps.readAdmissionInputs).toHaveBeenCalledTimes(1);
    expect(f.deps.readGitState.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(f.deps.readCommittedSharedFile.mock.calls.map(([path, commit]) => [path, commit]))
      .toEqual(f.paths.map(path => [path, 'c'.repeat(40)]));
    expect(trust.clients).toBe(0);
  });

  it('preserves exact formatted activation bytes and binds derived manifest to their raw digest', async () => {
    const f = fixture(); formatV2FixtureLock(f); trust.sha = f.fixture.input.expectedActivationLockSha256;
    const context = await prepareCalibrationV2BootstrapContext(f.deps);
    expect(context.files['source-lock']).toBe(Buffer.from(f.fixture.input.activationLockBytes).toString('utf8'));
    expect(admissionSha(Buffer.from(context.files['source-lock']))).toBe(context.identity.sourceLockHash);
    expect(context.files['calibration-manifest']).toBe(f.expectedManifestText());
    expect(context.identity.manifestHash).toBe(f.expectedManifestHash());
  });

  it('rejects_unregistered_context_clone', async () => {
    const f = fixture(); const context = await prepareCalibrationV2BootstrapContext(f.deps);
    expect(requireCalibrationV2Context(context)).toBe(context);
    let traps = 0; const proxy = new Proxy(context, { get() { traps++; throw new Error('private caller property'); } });
    const revoked = Proxy.revocable(context, {}); revoked.revoke();
    const accessor = Object.defineProperty({}, 'identity', { get() { traps++; throw new Error('private caller property'); } });
    const legacy = { ...context, identity: { ...context.identity, protocolVersion: 'v1', hardCeiling: 300 } };
    const values = [{ ...context }, structuredClone(context), proxy, revoked.proxy, accessor,
      Object.freeze({ ...context }), legacy, null, 42];
    f.deps.readAdmissionInputs.mockClear(); f.deps.readCommittedSharedFile.mockClear(); f.deps.readOwner.mockClear();
    const errors: string[] = [];
    for (const value of values) {
      let caught: unknown;
      try { requireCalibrationV2Context(value); } catch (error) { caught = error; }
      expect(caught).toBeInstanceOf(CalibrationFatalError);
      errors.push((caught as Error).message);
    }
    expect(new Set(errors).size).toBe(1);
    expect(errors[0]).not.toContain('private caller property');
    expect(traps).toBe(0);
    expect(f.deps.readAdmissionInputs).not.toHaveBeenCalled();
    expect(f.deps.readCommittedSharedFile).not.toHaveBeenCalled(); expect(f.deps.readOwner).not.toHaveBeenCalled();
    expect(trust.clients).toBe(0);
  });

  it('owns and freezes identity, owner, report, notes and files after caller mutation', async () => {
    const f = fixture(); const context = await prepareCalibrationV2BootstrapContext(f.deps);
    const before = structuredClone(context);
    f.owner.hostname = 'changed'; f.git.functionsTreeId = 'f'.repeat(40);
    f.fixture.input.activationLockBytes.fill(0); f.fixture.input.bundle.cafe1.fill(0);
    f.fixture.input.images.clear(); f.shared.clear();
    expect(context).toEqual(before);
    for (const [object, key, value] of [[context, 'baseDir', 'changed'], [context.identity, 'hardCeiling', 999],
      [context.owner, 'hostname', 'changed'], [context.report, 'historicalCompatible', true],
      [context.report.compatibilityNotes[0]!, 'detail', 'changed'], [context.files, 'source-lock', 'changed']] as const) {
      expect(Reflect.set(object, key, value)).toBe(false);
    }
    expect(requireCalibrationV2Context(context)).toBe(context);
  });

  it('rejects a fixture raw pin that is not the module-owned native pin', async () => {
    const f = fixture(); trust.sha = 'f'.repeat(64);
    await expect(prepareCalibrationV2BootstrapContext(f.deps)).rejects.toThrow(CalibrationFatalError);
    expect(trust.clients).toBe(0);
  });

  it.each(['candidateBytes', 'corpusLockBytes'] as const)('validates actual admission %s rather than trusting a shaped result', async field => {
    const f = fixture(); f.fixture.input[field][0] = 0;
    await expect(prepareCalibrationV2BootstrapContext(f.deps)).rejects.toThrow(CalibrationFatalError);
    expect(trust.clients).toBe(0);
  });

  it.each(['image', 'prior'] as const)('rejects actual %s byte drift', async kind => {
    const f = fixture();
    if (kind === 'image') f.fixture.input.images.values().next().value!.fill(0);
    else f.fixture.input.priorEvidence.values().next().value!.fill(0);
    await expect(prepareCalibrationV2BootstrapContext(f.deps)).rejects.toThrow(CalibrationFatalError);
  });

  it.each(['publicManifestHash', 'promptHash', 'responseSchemaHash', 'offLockRawSha256', 'historicalReferenceRawSha256'] as const)(
    'checks locked shared %s against actual shipped inputs', async field => {
      const f = fixture(); f.fixture.lock.shared[field] = 'f'.repeat(64); repin(f);
      expect(() => admitCalibrationV2Candidate(f.fixture.input)).not.toThrow();
      await expect(prepareCalibrationV2BootstrapContext(f.deps)).rejects.toThrow(CalibrationFatalError);
      expect(trust.clients).toBe(0);
    });

  it.each([0, 1, 2])('rejects changed committed shared asset %i', async index => {
    const f = fixture(); f.shared.set(f.paths[index]!, '{"changed":true}');
    await expect(prepareCalibrationV2BootstrapContext(f.deps)).rejects.toThrow(CalibrationFatalError);
  });

  it.each(['dirty', 'untracked'] as const)('rejects initial %s Functions source before awaiting raw inputs', async kind => {
    const f = fixture(); f.git.dirtyPaths.push(kind === 'dirty' ? 'functions/runtime.ts' : 'functions/untracked.ts');
    await expect(prepareCalibrationV2BootstrapContext(f.deps)).rejects.toThrow(CalibrationFatalError);
    expect(f.deps.readAdmissionInputs).not.toHaveBeenCalled();
  });

  it.each(['implementationCommit', 'functionsTreeId', 'dirtyPaths'] as const)('rejects %s drift across await', async field => {
    const f = fixture(); f.deps.readAdmissionInputs.mockImplementation(async () => {
      if (field === 'dirtyPaths') f.git.dirtyPaths.push('functions/changed.ts'); else f.git[field] = 'f'.repeat(40);
      return f.fixture.input;
    });
    await expect(prepareCalibrationV2BootstrapContext(f.deps)).rejects.toThrow(CalibrationFatalError);
    expect(trust.clients).toBe(0);
  });

  it.each(['relative', '/fixture/../calorix', ''])('rejects noncanonical base directory %j', async baseDir => {
    const f = fixture(); f.deps.baseDir = baseDir;
    await expect(prepareCalibrationV2BootstrapContext(f.deps)).rejects.toThrow(CalibrationFatalError);
    expect(f.deps.readAdmissionInputs).not.toHaveBeenCalled();
  });

  it.each(['pid', 'startTicks', 'acquiredAt'] as const)('rejects malformed owner %s', async field => {
    const f = fixture(); if (field === 'acquiredAt') f.owner[field] = 'bad'; else f.owner[field] = -1;
    await expect(prepareCalibrationV2BootstrapContext(f.deps)).rejects.toThrow(CalibrationFatalError);
  });
});
