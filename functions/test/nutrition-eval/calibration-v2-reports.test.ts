import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishCalibrationStageReport, publishCalibrationStageReportV2 } from '../../src/nutrition-eval/calibration-report-publication';
import { prepareCalibrationStageReportArtifactVerifier, prepareCalibrationStageReportArtifactVerifierV2 } from '../../src/nutrition-eval/calibration-report-artifact-verification';
import {
  assembleCalibrationStageReport, assembleCalibrationStageReportV2,
  prepareCalibrationStageReportReconstructor, prepareCalibrationStageReportReconstructorV2,
} from '../../src/nutrition-eval/calibration-report-assembly';
import type { CalibrationV2PreparedContext } from '../../src/nutrition-eval/calibration-protocol-bindings';
import type { CalibrationProfile, StageName } from '../../src/nutrition-eval/calibration';
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';
import { renderNutritionEvalJson, renderNutritionEvalMarkdown } from '../../src/nutrition-eval/report';
import { reportFixture, reportHash } from './helpers/calibration-v2-report-fixtures';

const trust = vi.hoisted(() => ({ sha: '' }));
const nativeReads = vi.hoisted(() => ({ active: false, calls: 0 }));
vi.mock('node:fs', async original => {
  const actual = await original<typeof import('node:fs')>();
  return { ...actual,
    openSync: (...args: Parameters<typeof actual.openSync>) => { if (nativeReads.active) nativeReads.calls++; return actual.openSync(...args); },
    lstatSync: (...args: Parameters<typeof actual.lstatSync>) => { if (nativeReads.active) nativeReads.calls++; return actual.lstatSync(...args); },
    mkdirSync: (...args: Parameters<typeof actual.mkdirSync>) => { if (nativeReads.active) nativeReads.calls++; return actual.mkdirSync(...args); },
  };
});
vi.mock('../../src/nutrition-eval/calibration-v2-lock', async original => ({
  ...await original<typeof import('../../src/nutrition-eval/calibration-v2-lock')>(),
  get CALIBRATION_ACTIVATION_LOCK_V2_SHA256() { return trust.sha; },
}));
type Fixture = Awaited<ReturnType<typeof reportFixture>>;
let clean: Fixture; let mixed: Fixture; let legacy: Fixture;
beforeAll(async () => {
  const pin = (sha: string) => { trust.sha = sha; };
  legacy = await reportFixture(pin, false, true);
  clean = await reportFixture(pin);
  mixed = await reportFixture(pin, true);
}, 120000);
const stages: ReadonlyArray<readonly [StageName, CalibrationProfile, number, number]> = [
  ['preflight', 'LOW', 1, 1], ['preflight', 'MEDIUM', 1, 1],
  ['development', 'LOW', 24, 1], ['development', 'MEDIUM', 24, 1],
  ['validation', 'MEDIUM', 16, 3], ['benchmark', 'MEDIUM', 20, 3],
];
const request = (f = clean, stage: StageName = 'preflight', profile: CalibrationProfile = 'LOW') => ({
  stage, profile, readSnapshot: () => f.snapshot(stage, profile),
});

const artifactDirs: string[] = [];
afterEach(() => { nativeReads.active = false; for (const dir of artifactDirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
async function artifactFixture(v1 = false) {
  const dir = mkdtempSync(join(tmpdir(), 'v2-report-artifact-')); artifactDirs.push(dir);
  const f = await reportFixture(sha => { trust.sha = sha; }, false, v1, dir);
  const root = join(dir, '.nutrition-eval/calibration/calorix-gemini-38-calibration-' + (v1 ? 'v1' : 'v2'));
  mkdirSync(root, { recursive: true, mode: 0o700 });
  writeFileSync(join(root, 'lock.json'), JSON.stringify(f.context.owner), { mode: 0o600 });
  const sentinel = join(dir, '.nutrition-eval/calibration/calorix-gemini-38-calibration-v1/sentinel');
  if (!v1) { mkdirSync(join(sentinel, '..'), { recursive: true, mode: 0o700 }); writeFileSync(sentinel, 'frozen-v1-fixture', { mode: 0o600 }); }
  return { ...f, dir, root, sentinel, reports: join(root, 'reports') };
}

describe('durable V2 report artifacts on isolated task disk', () => {
  it('real V1 native publication and verifier baseline succeeds independently', async () => {
    const f = await artifactFixture(true);
    const published = await publishCalibrationStageReport({ ...request(f), context: f.context });
    const ready = await prepareCalibrationStageReportArtifactVerifier(f.context);
    expect(ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: f.snapshot() })).toEqual(published);
    expect(published.report.calibration?.protocolVersion).toBe('calorix-gemini-38-calibration-v1');
  });

  it.each(stages)('publishes and verifies %s/%s with exact durable bytes/receipt and private modes', async (stage, profile) => {
    const f = await artifactFixture(); const before = counters(f);
    const published = await publishCalibrationStageReportV2(f.v2Context, request(f, stage, profile));
    const jsonPath = join(f.reports, `${stage}-${profile.toLowerCase()}.json`);
    const mdPath = join(f.reports, `${stage}-${profile.toLowerCase()}.md`);
    const json = readFileSync(jsonPath, 'utf8'), md = readFileSync(mdPath, 'utf8');
    expect(json).toBe(renderNutritionEvalJson(published.report)); expect(md).toBe(renderNutritionEvalMarkdown(published.report));
    expect(JSON.parse(json).calibration.protocolVersion).toBe('calorix-gemini-38-calibration-v2');
    expect(published.receipt).toEqual({ stage, profile, runId: published.report.runId, jsonSha256: reportHash(json), markdownSha256: reportHash(md) });
    expect(lstatSync(jsonPath).mode & 0o7777).toBe(0o600); expect(lstatSync(mdPath).mode & 0o7777).toBe(0o600);
    expect(lstatSync(f.reports).mode & 0o7777).toBe(0o700);
    expect(readdirSync(f.reports).sort()).toEqual([`${stage}-${profile.toLowerCase()}.json`, `${stage}-${profile.toLowerCase()}.md`]);
    const beforeMetadata = [lstatSync(jsonPath), lstatSync(mdPath)].map(s => [s.ino, s.size, s.mtimeMs, s.mode, s.nlink]);
    const ready = await prepareCalibrationStageReportArtifactVerifierV2(f.v2Context);
    expect(ready.verify({ stage, profile, snapshot: f.snapshot(stage, profile) })).toEqual(published);
    expect([lstatSync(jsonPath), lstatSync(mdPath)].map(s => [s.ino, s.size, s.mtimeMs, s.mode, s.nlink])).toEqual(beforeMetadata);
    expect(await publishCalibrationStageReportV2(f.v2Context, request(f, stage, profile))).toEqual(published);
    expect([lstatSync(jsonPath), lstatSync(mdPath)].map(s => [s.ino, s.size, s.mtimeMs, s.mode, s.nlink])).toEqual(beforeMetadata);
    expect(readFileSync(f.sentinel, 'utf8')).toBe('frozen-v1-fixture');
    expect(readFileSync(join(f.root, 'lock.json'), 'utf8')).toBe(JSON.stringify(f.context.owner));
    expect(counters(f)).toEqual(before);
    expect(Object.isFrozen(published.receipt)).toBe(true);
  });

  it.each(['json', 'md', 'lock-owner', 'lock-mode', 'report-mode', 'symlink'] as const)('rejects %s tampering without altering final artifacts', async kind => {
    const f = await artifactFixture(); await publishCalibrationStageReportV2(f.v2Context, request(f));
    const json = join(f.reports, 'preflight-low.json'); const md = join(f.reports, 'preflight-low.md');
    const ready = await prepareCalibrationStageReportArtifactVerifierV2(f.v2Context);
    if (kind === 'json') writeFileSync(json, readFileSync(json, 'utf8').replace('calibration-v2', 'calibration-v1'));
    if (kind === 'md') writeFileSync(md, readFileSync(md, 'utf8') + 'tampered');
    if (kind === 'lock-owner') writeFileSync(join(f.root, 'lock.json'), JSON.stringify({ ...f.context.owner, pid: 999 }));
    if (kind === 'lock-mode') chmodSync(join(f.root, 'lock.json'), 0o644);
    if (kind === 'report-mode') chmodSync(json, 0o644);
    if (kind === 'symlink') { const original = readFileSync(json); const target = join(f.dir, 'foreign.json'); writeFileSync(target, original, { mode: 0o600 }); unlinkSync(json); symlinkSync(target, json); }
    const before = [readFileSync(json, 'utf8'), readFileSync(md, 'utf8')];
    expect(() => ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: f.snapshot() })).toThrow(CalibrationFatalError);
    await expect(publishCalibrationStageReportV2(f.v2Context, request(f))).rejects.toThrow(CalibrationFatalError);
    expect([readFileSync(json, 'utf8'), readFileSync(md, 'utf8')]).toEqual(before);
    expect(readFileSync(f.sentinel, 'utf8')).toBe('frozen-v1-fixture');
    expect(readdirSync(f.reports).some(name => name.includes('.tmp.'))).toBe(false);
  });

  it('rejects valid foreign V1 artifacts and snapshots without receipt authority', async () => {
    const f = await artifactFixture(); await publishCalibrationStageReportV2(f.v2Context, request(f));
    const old = await assembleCalibrationStageReport({ ...request(legacy), context: legacy.context });
    writeFileSync(join(f.reports, 'preflight-low.json'), renderNutritionEvalJson(old));
    writeFileSync(join(f.reports, 'preflight-low.md'), renderNutritionEvalMarkdown(old));
    const ready = await prepareCalibrationStageReportArtifactVerifierV2(f.v2Context);
    expect(() => ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: f.snapshot() })).toThrow('calibration:report-file-tampered');
    expect(() => ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: legacy.snapshot() })).toThrow('calibration:stage-report-invalid');
  });

  it('rejects foreign snapshot identity before native reads', async () => {
    const f = await artifactFixture(); await publishCalibrationStageReportV2(f.v2Context, request(f));
    const ready = await prepareCalibrationStageReportArtifactVerifierV2(f.v2Context);
    const snapshot = clone(f.snapshot()); snapshot.identity.functionsTreeId = 'f'.repeat(40);
    nativeReads.calls = 0; nativeReads.active = true;
    try { expect(() => ready.verify({ stage: 'preflight', profile: 'LOW', snapshot })).toThrow('calibration:stage-report-invalid'); }
    finally { nativeReads.active = false; }
    expect(nativeReads.calls).toBe(0);
  });

  it.each(['clone', 'proxy', 'revoked', 'getter', 'v1'] as const)('rejects %s context before secondary traps and named filesystem operations', async kind => {
    const f = await artifactFixture(); let traps = 0;
    const revoked = Proxy.revocable(f.v2Context, {}); revoked.revoke();
    const contexts = { clone: { ...f.v2Context }, proxy: new Proxy(f.v2Context, {}), revoked: revoked.proxy,
      getter: Object.defineProperty({}, 'identity', { enumerable: true, get() { traps++; throw new Error('PRIVATE'); } }), v1: legacy.context };
    const params = new Proxy({}, { ownKeys() { traps++; throw new Error('PRIVATE'); }, getPrototypeOf() { traps++; throw new Error('PRIVATE'); } });
    nativeReads.calls = 0; nativeReads.active = true;
    try {
      await expect(publishCalibrationStageReportV2(contexts[kind] as CalibrationV2PreparedContext, params)).rejects.toThrow('calibration:v2-context-unregistered');
      await expect(prepareCalibrationStageReportArtifactVerifierV2(contexts[kind] as CalibrationV2PreparedContext)).rejects.toThrow('calibration:v2-context-unregistered');
    } finally { nativeReads.active = false; }
    expect(traps).toBe(0); expect(nativeReads.calls).toBe(0); expect(readdirSync(f.root)).toEqual(['lock.json']);
  });

  it.each(['baseDir', 'identity', 'context', 'stage', 'profile'] as const)('rejects %s publication override before filesystem operations', async kind => {
    const f = await artifactFixture(); const readSnapshot = vi.fn(() => f.snapshot());
    const params = { stage: 'preflight', profile: 'LOW', readSnapshot };
    if (kind === 'stage' || kind === 'profile') params[kind] = 'unknown';
    else Object.assign(params, { [kind]: kind === 'context' ? f.context : f.context[kind] });
    nativeReads.calls = 0; nativeReads.active = true;
    try { await expect(publishCalibrationStageReportV2(f.v2Context, params)).rejects.toThrow('calibration:report-publication-input-invalid'); }
    finally { nativeReads.active = false; }
    expect(readSnapshot).not.toHaveBeenCalled(); expect(nativeReads.calls).toBe(0);
  });

  it('cleans only owned temporary files on publication write failure and preserves the lock', async () => {
    const f = await artifactFixture();
    await expect(publishCalibrationStageReportV2(f.v2Context, request(f), { fdWriteSync: () => { throw new Error('PRIVATE'); } }))
      .rejects.toThrow(/^calibration:report-publication-failed$/);
    expect(readdirSync(f.reports)).toEqual([]);
    expect(readFileSync(join(f.root, 'lock.json'), 'utf8')).toBe(JSON.stringify(f.context.owner));
    expect(readFileSync(f.sentinel, 'utf8')).toBe('frozen-v1-fixture');
  });

  it('sanitizes a throwing publication snapshot callback without publishing bytes', async () => {
    const f = await artifactFixture();
    await expect(publishCalibrationStageReportV2(f.v2Context, { ...request(f), readSnapshot: () => { throw new Error('PRIVATE'); } }))
      .rejects.toThrow(/^calibration:stage-report-read-failed$/);
    expect(readdirSync(f.root)).toEqual(['lock.json']);
  });
});
const counters = (f: Fixture) => [f.world.calls.length, f.world.writes.length, f.world.events.length];
type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };
const clone = <T>(value: T): Mutable<T> => structuredClone(value) as Mutable<T>;
const prepare = () => prepareCalibrationStageReportReconstructorV2(clean.v2Context);

describe('pure V2 report reconstruction', () => {
  it('independent real V1 bootstrap/ledger baseline succeeds for every stage before V2 assertions', async () => {
    const ready = await prepareCalibrationStageReportReconstructor(legacy.context);
    for (const [stage, profile, count, samples] of stages) {
      const report = ready.reconstruct({ stage, profile, snapshot: legacy.snapshot(stage, profile) });
      expect(report.calibration?.protocolVersion).toBe('calorix-gemini-38-calibration-v1');
      expect(report.cases).toHaveLength(count * samples);
      expect(report.datasetHash).toBe(stage === 'benchmark' ? legacy.context.identity.publicManifestHash : reportHash(legacy.context.files['calibration-manifest']));
    }
  });

  it.each(stages)('reconstructs %s/%s from real complete ledger outcomes with source order, exact truth and metadata', async (stage, profile, count, samples) => {
    const before = counters(clean);
    const ready = await prepare();
    const report = ready.reconstruct({ stage, profile, snapshot: clean.snapshot(stage, profile) });
    const source = stage === 'benchmark' ? clean.publicManifest.cases : clean.training.cases.filter(c =>
      stage === 'preflight' ? c.id === clean.context.firstDevelopmentCaseId : c.group === stage);
    expect(source).toHaveLength(count);
    expect(report.cases.map(c => [c.caseId, c.prediction.sampleIndex])).toEqual(source.flatMap(c =>
      Array.from({ length: samples }, (_, i) => [c.id, i + 1])));
    expect(report.samples).toBe(samples);
    expect(report.datasetId).toBe(stage === 'benchmark' ? clean.publicManifest.datasetId : clean.training.datasetId);
    expect(report.datasetHash).toBe(stage === 'benchmark' ? clean.context.identity.publicManifestHash : reportHash(clean.context.files['calibration-manifest']));
    expect(report.calibration).toEqual({
      protocolVersion: 'calorix-gemini-38-calibration-v2', project: 'calorix-xurschnell', location: 'us',
      model: 'gemini-3.8-flash', thinkingLevel: profile, schemaHash: clean.context.identity.responseSchemaHash,
      stage, imageCallsReserved: stage === 'benchmark' ? 48 : count * samples,
      imageCallsCompleted: stage === 'benchmark' ? 48 : count * samples, imageCallsFailed: 0, safeErrors: [],
      latencyCoverage: { measuredCases: count * samples, missingCases: 0 },
    });
    const byId = new Map(source.map(c => [c.id, c]));
    for (const row of report.cases) {
      const c = byId.get(row.caseId)!;
      expect(row.truth).toEqual(c.truth);
      if (c.scanMode === 'barcode') { expect(row.prediction.failureCategory).toBe('product'); continue; }
      for (const key of ['kcal', 'proteinG', 'carbsG', 'fatG'] as const) {
        expect(row.prediction[key]).toBe(c.truth[key]);
        expect(row.numeric[key]).toEqual({ ratioToTruth: c.truth[key] / Math.max(Math.abs(c.truth[key]), 1), absoluteError: 0, relativeError: 0 });
      }
    }
    expect(report.summary.meanZeroSafeMacroRelativeError).toBe(0);
    expect(report.summary.latencyMs).toEqual({ min: 17, max: 17, median: 17, p90: 17 });
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.cases[0]!.prediction)).toBe(true);
    expect((await assembleCalibrationStageReportV2(clean.v2Context, request(clean, stage, profile)))).toEqual(report);
    expect(renderNutritionEvalJson(report)).toContain('calorix-gemini-38-calibration-v2');
    expect(renderNutritionEvalMarkdown(report)).toContain('calorix-gemini-38-calibration-v2');
    expect(counters(clean)).toEqual(before);
  });

  it('keeps all 12 public barcode outcomes outside image reservations', async () => {
    const report = await assembleCalibrationStageReportV2(clean.v2Context, request(clean, 'benchmark', 'MEDIUM'));
    expect(report.cases.filter(c => c.prediction.source === 'barcode')).toHaveLength(12);
    expect(clean.snapshot('benchmark', 'MEDIUM').nonReservations).toHaveLength(12);
    expect(clean.snapshot('benchmark', 'MEDIUM').images).toHaveLength(48);
    expect(report.calibration?.imageCallsReserved).toBe(48);
  });

  it.each(['LOW', 'MEDIUM'] as const)('preserves mixed dataset/interruption semantics and measured coverage for %s', async profile => {
    const report = await assembleCalibrationStageReportV2(mixed.v2Context, request(mixed, 'development', profile));
    expect(report.cases).toHaveLength(24);
    const first = report.cases[0]!;
    expect(first.prediction.parseStatus).toBe('failure');
    if (profile === 'LOW') {
      expect(first.prediction.failureCategory).toBe('dataset');
      expect(report.calibration?.safeErrors).toEqual([]);
      expect(report.calibration?.latencyCoverage).toEqual({ measuredCases: 24, missingCases: 0 });
      expect(report.calibration?.imageCallsReserved).toBe(23);
    } else {
      expect(first.prediction.failureCode).toBe('interrupted_reservation');
      expect(report.calibration?.safeErrors).toEqual([{ caseId: first.caseId, sampleIndex: 1, errorCategory: 'interrupted_reservation' }]);
      expect(report.calibration?.latencyCoverage).toEqual({ measuredCases: 23, missingCases: 1 });
      expect(report.calibration?.imageCallsFailed).toBe(1);
    }
  });

  const drift = {
    protocolVersion: 'v1', provider: 'other', model: 'other', implementationCommit: 'f'.repeat(40),
    functionsTreeId: 'f'.repeat(40), datasetHash: 'f'.repeat(64), promptHash: 'f'.repeat(64),
    responseSchemaHash: 'f'.repeat(64), sourceLockHash: 'f'.repeat(64), manifestHash: 'f'.repeat(64),
    publicManifestHash: 'f'.repeat(64), snapshotLockHash: 'f'.repeat(64), historicalReferenceHash: 'f'.repeat(64),
    plannedImageCalls: 145, hardCeiling: 300,
  };
  it.each(Object.entries(drift))('rejects snapshot identity drift in %s', async (field, value) => {
    const ready = await prepare(); const snapshot = clone(clean.snapshot());
    Object.assign(snapshot.identity, { [field]: value });
    expect(() => ready.reconstruct({ stage: 'preflight', profile: 'LOW', snapshot })).toThrow('calibration:stage-report-invalid');
  });

  it.each(['stage', 'profile', 'unselected', 'extra', 'duplicate', 'missing', 'pending', 'no-start'] as const)('rejects %s snapshot/result mismatch', async kind => {
    const ready = await prepare(); const snapshot = clone(clean.snapshot());
    if (kind === 'stage') snapshot.stage = 'development';
    if (kind === 'profile') snapshot.profile = 'MEDIUM';
    if (kind === 'unselected') {
      const later = clone(clean.snapshot('validation', 'MEDIUM')); later.selectedProfile = 'LOW';
      expect(() => ready.reconstruct({ stage: 'validation', profile: 'MEDIUM', snapshot: later })).toThrow('calibration:stage-report-invalid'); return;
    }
    if (kind === 'extra') Object.assign(snapshot, { extra: true });
    if (kind === 'duplicate') { snapshot.images = [...snapshot.images, snapshot.images[0]!]; snapshot.counts = { imageCallsReserved: 2, imageCallsCompleted: 2, imageCallsFailed: 0, imageCallsPending: 0 }; }
    if (kind === 'missing' || kind === 'pending') {
      snapshot.images = []; snapshot.counts = { imageCallsReserved: kind === 'pending' ? 1 : 0,
        imageCallsCompleted: 0, imageCallsFailed: 0, imageCallsPending: kind === 'pending' ? 1 : 0 };
    }
    if (kind === 'no-start') delete snapshot.startedAt;
    expect(() => ready.reconstruct({ stage: 'preflight', profile: 'LOW', snapshot })).toThrow(
      kind === 'missing' || kind === 'pending' || kind === 'no-start' ? 'calibration:stage-report-incomplete' : 'calibration:stage-report-invalid');
  });

  it('rejects both cross-version report routes despite independently valid snapshots', async () => {
    const old = await prepareCalibrationStageReportReconstructor(legacy.context); const ready = await prepare();
    expect(() => old.reconstruct({ stage: 'preflight', profile: 'LOW', snapshot: clean.snapshot() })).toThrow(CalibrationFatalError);
    expect(() => ready.reconstruct({ stage: 'preflight', profile: 'LOW', snapshot: legacy.snapshot() })).toThrow(CalibrationFatalError);
    await expect(prepareCalibrationStageReportReconstructor(clean.context)).rejects.toThrow(CalibrationFatalError);
    await expect(prepareCalibrationStageReportReconstructorV2(legacy.context as CalibrationV2PreparedContext)).rejects.toThrow('calibration:v2-context-unregistered');
  });

  it.each(['shallow', 'clone', 'proxy', 'revoked', 'getter', 'identity', 'report', 'null'] as const)('rejects %s context before params reflection or callback', async kind => {
    let traps = 0;
    const ctx = clean.v2Context;
    const revoked = Proxy.revocable(ctx, {}); revoked.revoke();
    const contexts = { shallow: { ...ctx }, clone: clone(ctx), proxy: new Proxy(ctx, {}), revoked: revoked.proxy,
      getter: Object.defineProperty({}, 'identity', { enumerable: true, get() { traps++; return ctx.identity; } }),
      identity: ctx.identity, report: ctx.report, null: null };
    const params = new Proxy({}, { ownKeys() { traps++; throw new Error('PRIVATE'); }, getPrototypeOf() { traps++; throw new Error('PRIVATE'); } });
    await expect(assembleCalibrationStageReportV2(contexts[kind] as CalibrationV2PreparedContext, params)).rejects.toThrow('calibration:v2-context-unregistered');
    await expect(prepareCalibrationStageReportReconstructorV2(contexts[kind] as CalibrationV2PreparedContext)).rejects.toThrow('calibration:v2-context-unregistered');
    expect(traps).toBe(0);
  });

  it.each(['context', 'baseDir', 'identity', 'invalid-stage', 'invalid-profile', 'callback-getter'] as const)('rejects %s params before callback', async kind => {
    const readSnapshot = vi.fn(() => clean.snapshot()); let reads = 0;
    const params = { stage: 'preflight', profile: 'LOW', readSnapshot };
    if (kind === 'context') Object.assign(params, { context: clean.v2Context });
    if (kind === 'baseDir') Object.assign(params, { baseDir: clean.context.baseDir });
    if (kind === 'identity') Object.assign(params, { identity: clean.context.identity });
    if (kind === 'invalid-stage') params.stage = 'unknown';
    if (kind === 'invalid-profile') params.profile = 'unknown';
    if (kind === 'callback-getter') Object.defineProperty(params, 'readSnapshot', { enumerable: true, get() { reads++; return readSnapshot; } });
    await expect(assembleCalibrationStageReportV2(clean.v2Context, params)).rejects.toThrow('calibration:stage-report-invalid');
    expect(readSnapshot).not.toHaveBeenCalled(); expect(reads).toBe(0);
  });

  it('sanitizes snapshot callback exceptions', async () => {
    await expect(assembleCalibrationStageReportV2(clean.v2Context, { ...request(), readSnapshot: () => { throw new Error('PRIVATE-secret'); } }))
      .rejects.toThrow(/^calibration:stage-report-read-failed$/);
  });

  it('captures request primitives before await and never retains mutable snapshots', async () => {
    const snapshot = clone(clean.snapshot()); const params = { ...request(), readSnapshot: () => snapshot };
    const promise = assembleCalibrationStageReportV2(clean.v2Context, params);
    params.stage = 'benchmark'; params.profile = 'MEDIUM'; params.readSnapshot = () => { throw new Error('PRIVATE'); };
    const report = await promise;
    snapshot.identity.implementationCommit = 'f'.repeat(40); snapshot.images = [];
    expect(report.calibration?.stage).toBe('preflight'); expect(report.cases).toHaveLength(1);
    expect(report.codeSha).toBe(clean.context.identity.implementationCommit);
    expect(Object.isFrozen(params)).toBe(false); expect(Object.isFrozen(snapshot)).toBe(false);
  });

  it('interleaves V1/V2 without changing V1 JSON or Markdown', async () => {
    const params = { ...request(legacy), context: legacy.context };
    const before = await assembleCalibrationStageReport(params);
    const json = renderNutritionEvalJson(before); const md = renderNutritionEvalMarkdown(before);
    const [v2, v1] = await Promise.all([assembleCalibrationStageReportV2(clean.v2Context, request()), assembleCalibrationStageReport(params)]);
    expect(v2.calibration?.protocolVersion).toBe('calorix-gemini-38-calibration-v2');
    expect(renderNutritionEvalJson(v1)).toBe(json); expect(renderNutritionEvalMarkdown(v1)).toBe(md);
  });
});
