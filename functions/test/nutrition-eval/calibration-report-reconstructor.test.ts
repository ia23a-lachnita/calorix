/**
 * Task1 Step1 tests/digest controls ONLY for prepared calibration report reconstruction.
 *
 * Uses the UNCHANGED assembler for baseline digest controls and dynamically loads
 * the NEW factory `prepareCalibrationStageReportReconstructor` so RED is a missing
 * export (`report-reconstructor-missing`), not a TS/import/fixture error.
 *
 * No imports from existing test modules (their describes have side effects).
 * All filesystem work uses task disk TMPDIR via os tmpdir + mkdtemp; afterAll
 * removes ONLY tracked fixture directories. No Vitest config change.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareCalibrationBootstrapContext, deriveCanonicalAllowedKeys, deriveCanonicalReportOutcomePlan } from '../../src/nutrition-eval/calibration-bootstrap';
import { createProtocolCalibrationLedger } from '../../src/nutrition-eval/calibration';
import type { CalibrationProfile, JournalEntry, ReservationKey, StageName } from '../../src/nutrition-eval/calibration';
import { createFileCalibrationLedgerDeps } from '../../src/nutrition-eval/calibration-file-store';
import { captureCalibrationReportPrediction } from '../../src/nutrition-eval/calibration-report-journal';
import { CALIBRATION_MANIFEST_SHA256, CALIBRATION_PUBLIC_MANIFEST_HASH } from '../../src/nutrition-eval/calibration-cli';
import { renderNutritionEvalJson, renderNutritionEvalMarkdown } from '../../src/nutrition-eval/report';
import { NutritionEvalReportSchema, parseNutritionEvalManifest, StrictCalibrationManifestSchema } from '../../src/nutrition-eval/schema';
import type { NutritionEvalReport, NutritionPrediction } from '../../src/nutrition-eval/schema';
import type { CalibrationStageReportSnapshot } from '../../src/nutrition-eval/calibration-report-state';
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';

// File-local timeouts only (no vitest config change) for busy-Pi disk fixtures.
vi.setConfig({ testTimeout: 60000, hookTimeout: 60000 });

const fsGuard = vi.hoisted(() => ({ armed: false, calls: 0, details: [] as string[] }));
const netGuard = vi.hoisted(() => ({ armed: false, fetchCalls: 0, nowCalls: 0 }));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const wrapped: Record<string, unknown> = { ...(actual as unknown as Record<string, unknown>) };
  for (const key of Object.getOwnPropertyNames(actual)) {
    const value = (actual as unknown as Record<string, unknown>)[key];
    if (typeof value === 'function') {
      wrapped[key] = (...args: unknown[]): unknown => {
        if (fsGuard.armed) {
          fsGuard.calls += 1;
          fsGuard.details.push(key);
          throw new Error(`fs-blocked:${key}`);
        }
        return (value as (...callArgs: unknown[]) => unknown)(...args);
      };
    }
  }
  const promises = (actual as unknown as { promises?: Record<string, unknown> }).promises;
  if (promises !== undefined && typeof promises === 'object' && promises !== null) {
    const wrappedPromises: Record<string, unknown> = { ...promises };
    for (const key of Object.getOwnPropertyNames(promises)) {
      const value = promises[key];
      if (typeof value === 'function') {
        wrappedPromises[key] = (...args: unknown[]): unknown => {
          if (fsGuard.armed) {
            fsGuard.calls += 1;
            fsGuard.details.push(`promises.${key}`);
            throw new Error(`fs-blocked:promises.${key}`);
          }
          return (value as (...callArgs: unknown[]) => unknown)(...args);
        };
      }
    }
    wrapped.promises = wrappedPromises;
  }
  return wrapped;
});
function armPureGuards(): { origFetch: unknown; origNow: () => number } {
  fsGuard.armed = true;
  fsGuard.calls = 0;
  fsGuard.details = [];
  netGuard.armed = true;
  netGuard.fetchCalls = 0;
  netGuard.nowCalls = 0;
  const origFetch = (globalThis as unknown as Record<string, unknown>).fetch;
  const origNow = Date.now;
  (globalThis as unknown as Record<string, unknown>).fetch = (...args: unknown[]): unknown => {
    netGuard.fetchCalls += 1;
    throw new Error(`network-blocked:${String(args[0] ?? 'fetch')}`);
  };
  Date.now = (): number => {
    netGuard.nowCalls += 1;
    return origNow();
  };
  return { origFetch, origNow };
}
function disarmPureGuards(state: { origFetch: unknown; origNow: () => number }): { fsCalls: number; fetchCalls: number; nowCalls: number; details: string[] } {
  fsGuard.armed = false;
  netGuard.armed = false;
  (globalThis as unknown as Record<string, unknown>).fetch = state.origFetch;
  Date.now = state.origNow;
  const result = { fsCalls: fsGuard.calls, fetchCalls: netGuard.fetchCalls, nowCalls: netGuard.nowCalls, details: [...fsGuard.details] };
  fsGuard.calls = 0;
  fsGuard.details = [];
  netGuard.fetchCalls = 0;
  netGuard.nowCalls = 0;
  return result;
}

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const dirs: string[] = [];
const pin = 'gemini-3.8-fixture-pin';
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function assertDeepFrozen(value: unknown, seen = new Set<unknown>()): void {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value as Record<string, unknown>)) assertDeepFrozen(child, seen);
}

type OldAssembly = (params: unknown) => Promise<NutritionEvalReport>;
async function oldAssembler(): Promise<OldAssembly> {
  const path = '../../src/nutrition-eval/calibration-report-assembly';
  const module = await import(/* @vite-ignore */ path) as Record<string, unknown>;
  expect(typeof module.assembleCalibrationStageReport).toBe('function');
  return module.assembleCalibrationStageReport as OldAssembly;
}

type Prepared = { readonly reconstruct: (params: unknown) => NutritionEvalReport };
type Prepare = (context: unknown) => Promise<Prepared>;
async function loadPrepare(): Promise<Prepare> {
  const path = '../../src/nutrition-eval/calibration-report-assembly';
  const module = await import(/* @vite-ignore */ path) as Record<string, unknown>;
  if (typeof module.prepareCalibrationStageReportReconstructor !== 'function') {
    throw new Error('report-reconstructor-missing');
  }
  return module.prepareCalibrationStageReportReconstructor as Prepare;
}

function successPrediction(source: 'meal' | 'label', sampleIndex: number): NutritionPrediction {
  return captureCalibrationReportPrediction({
    parseStatus: 'success', source, kcal: 120,
    proteinG: 10, carbsG: 0, fatG: 8, confidence: 0.8, basis: 'portion', amount: 1,
    unit: 'portion', decision: 'needs_review', reviewReasons: [], latencyMs: 17,
    sampleIndex, cached: false,
    ...(source === 'meal'
      ? {
        diagnostics: {
          rawNutrients: { kcal: 120, proteinG: 10, carbsG: 0, fatG: 8 },
          detectedItemCount: 1, estimatedTotalMassG: 90,
          declaredBasis: 'portion', declaredAmount: 1, declaredUnit: 'portion',
        },
      }
      : {}),
  });
}

function toJournal(key: ReservationKey, p: NutritionPrediction): JournalEntry {
  const four = { kcal: p.kcal!, proteinG: p.proteinG!, carbsG: p.carbsG!, fatG: p.fatG! };
  return {
    key,
    normalizedPrediction: {
      ...four,
      ...(p.diagnostics?.estimatedTotalMassG === undefined
        ? {}
        : { estimatedTotalMassG: p.diagnostics.estimatedTotalMassG }),
    },
    predictionHash: sha256(JSON.stringify(four)),
    analysisLatencyMs: p.latencyMs!,
    errorCategory: 'none',
    responseModelVersion: pin,
    reportPrediction: p,
  };
}

interface Fixture {
  readonly context: Awaited<ReturnType<typeof prepareCalibrationBootstrapContext>>;
  readonly reopened: ReturnType<ReturnType<typeof makeOpener>['open']>;
  readonly snapshots: Map<string, CalibrationStageReportSnapshot>;
  readonly effects: { append: number; fsync: number; clock: number };
}

function makeOpener(
  dir: string,
  context: Awaited<ReturnType<typeof prepareCalibrationBootstrapContext>>,
  effects: { append: number; fsync: number; clock: number },
  ticks: { n: number },
) {
  const open = () => {
    const native = createFileCalibrationLedgerDeps(dir);
    const ledger = createProtocolCalibrationLedger({
      ...native,
      appendLedgerEvent: (event) => {
        effects.append++;
        native.appendLedgerEvent(event);
      },
      fsyncLedgerFile: () => {
        effects.fsync++;
        native.fsyncLedgerFile();
      },
      fsyncLedgerDir: () => {
        effects.fsync++;
        native.fsyncLedgerDir();
      },
      fsyncJournalFile: () => {
        effects.fsync++;
        native.fsyncJournalFile();
      },
      fsyncJournalDir: () => {
        effects.fsync++;
        native.fsyncJournalDir();
      },
      nowIso: () => {
        effects.clock++;
        return new Date(Date.UTC(2026, 9, 8) + ticks.n++ * 1000).toISOString();
      },
    }, context.identity, (selected) => deriveCanonicalAllowedKeys(context.files, selected), {
      getReportOutcomePlan: (selected) => deriveCanonicalReportOutcomePlan(context.files, selected),
    });
    return ledger;
  };
  return { open };
}

async function buildCleanFixture(): Promise<Fixture> {
  const dir = mkdtempSync(join(tmpdir(), 'calibration-reconstruction-clean-'));
  dirs.push(dir);
  const context = await prepareCalibrationBootstrapContext({
    baseDir: dir,
    readGitState: () => ({
      headCommit: 'a'.repeat(40), implementationCommit: 'b'.repeat(40),
      functionsTreeId: 'c'.repeat(40), dirtyPaths: [],
    }),
    readCommittedFile: (path) => readFileSync(resolve(repo, path), 'utf8'),
    readOwner: () => ({
      hostname: 'reconstruction-fixture', bootId: 'reconstruction-boot', pid: 44,
      startTicks: 44, acquiredAt: '2026-10-08T00:00:00.000Z',
    }),
  });
  const effects = { append: 0, fsync: 0, clock: 0 };
  const ticks = { n: 0 };
  const { open } = makeOpener(dir, context, effects, ticks);
  const ledger = open();
  ledger.acquireLock(context.owner);
  const first = context.firstDevelopmentCaseId;
  const token = { kind: 'token_count', stage: 'preflight', caseId: first, model: 'gemini-3.8-flash' } as const;
  ledger.reserveTokenCount(token);
  ledger.completeTokenCount(token, 42);
  const low = { stage: 'preflight', profile: 'LOW', caseId: first, sampleIndex: 1 } as const;
  ledger.reserve(low);
  ledger.pinModelVersion(pin);
  ledger.complete(low, ledger.appendResultJournal(toJournal(low, successPrediction('meal', 1))));
  const med = { ...low, profile: 'MEDIUM' } as const;
  ledger.reserve(med);
  ledger.complete(med, ledger.appendResultJournal(toJournal(med, successPrediction('meal', 1))));
  ledger.completeStage('preflight', { stage: 'preflight', passed: true, completedStages: [] });
  const initial = deriveCanonicalReportOutcomePlan(context.files);
  const snapshots = new Map<string, CalibrationStageReportSnapshot>();
  const save = (stage: StageName, profile: CalibrationProfile): void => {
    snapshots.set(`${stage}/${profile}`, ledger.getStageReportSnapshot(stage, profile));
  };
  save('preflight', 'LOW');
  save('preflight', 'MEDIUM');
  const terminal = (key: ReservationKey, mode: 'meal' | 'label'): void => {
    ledger.reserve(key);
    ledger.complete(key, ledger.appendResultJournal(toJournal(key, successPrediction(mode, key.sampleIndex))));
  };
  for (const row of initial.filter((r) => r.key.stage === 'development')) {
    terminal(row.key, row.scanMode === 'label' ? 'label' : 'meal');
  }
  save('development', 'LOW');
  save('development', 'MEDIUM');
  ledger.recordProfileSelection('MEDIUM', 'default_medium_tie_breaker', {
    stage: 'development', passed: true, completedStages: ['preflight'],
  });
  ledger.completeStage('development', { stage: 'development', passed: true, completedStages: ['preflight'] });
  const expanded = deriveCanonicalReportOutcomePlan(context.files, 'MEDIUM');
  for (const row of expanded.filter((r) => r.key.stage === 'validation')) {
    terminal(row.key, 'meal');
  }
  ledger.completeStage('validation', {
    stage: 'validation', passed: true, completedStages: ['preflight', 'development'],
  });
  save('validation', 'MEDIUM');
  for (const row of expanded.filter((r) => r.key.stage === 'benchmark')) {
    if (row.scanMode !== 'barcode') {
      terminal(row.key, row.scanMode);
    } else {
      ledger.recordNonReservationResult({
        key: row.key,
        reason: 'barcode',
        prediction: {
          parseStatus: 'failure', source: 'barcode', decision: 'error', failureCategory: 'product',
          failureCode: 'off_product_invalid', sampleIndex: row.key.sampleIndex, cached: false, latencyMs: 17,
        },
      });
    }
  }
  save('benchmark', 'MEDIUM');
  save('development', 'LOW');
  save('development', 'MEDIUM');
  ledger.releaseLock(context.owner);
  const reopened = open();
  return { context, reopened, snapshots, effects };
}

async function buildMixedFixture(): Promise<Fixture> {
  const dir = mkdtempSync(join(tmpdir(), 'calibration-reconstruction-mixed-'));
  dirs.push(dir);
  const context = await prepareCalibrationBootstrapContext({
    baseDir: dir,
    readGitState: () => ({
      headCommit: 'a'.repeat(40), implementationCommit: 'b'.repeat(40),
      functionsTreeId: 'c'.repeat(40), dirtyPaths: [],
    }),
    readCommittedFile: (path) => readFileSync(resolve(repo, path), 'utf8'),
    readOwner: () => ({
      hostname: 'reconstruction-fixture', bootId: 'reconstruction-boot', pid: 44,
      startTicks: 44, acquiredAt: '2026-10-08T00:00:00.000Z',
    }),
  });
  const effects = { append: 0, fsync: 0, clock: 0 };
  const ticks = { n: 0 };
  const { open } = makeOpener(dir, context, effects, ticks);
  const ledger = open();
  ledger.acquireLock(context.owner);
  const first = context.firstDevelopmentCaseId;
  const token = { kind: 'token_count', stage: 'preflight', caseId: first, model: 'gemini-3.8-flash' } as const;
  ledger.reserveTokenCount(token);
  ledger.completeTokenCount(token, 42);
  const low = { stage: 'preflight', profile: 'LOW', caseId: first, sampleIndex: 1 } as const;
  ledger.reserve(low);
  ledger.pinModelVersion(pin);
  ledger.complete(low, ledger.appendResultJournal(toJournal(low, successPrediction('meal', 1))));
  const med = { ...low, profile: 'MEDIUM' } as const;
  ledger.reserve(med);
  ledger.complete(med, ledger.appendResultJournal(toJournal(med, successPrediction('meal', 1))));
  ledger.completeStage('preflight', { stage: 'preflight', passed: true, completedStages: [] });
  const initial = deriveCanonicalReportOutcomePlan(context.files);
  const snapshots = new Map<string, CalibrationStageReportSnapshot>();
  const save = (stage: StageName, profile: CalibrationProfile): void => {
    snapshots.set(`${stage}/${profile}`, ledger.getStageReportSnapshot(stage, profile));
  };
  const terminal = (key: ReservationKey, mode: 'meal' | 'label'): void => {
    ledger.reserve(key);
    ledger.complete(key, ledger.appendResultJournal(toJournal(key, successPrediction(mode, key.sampleIndex))));
  };
  const lowKeys = initial.filter((r) => r.key.stage === 'development' && r.key.profile === 'LOW');
  const medKeys = initial.filter((r) => r.key.stage === 'development' && r.key.profile === 'MEDIUM');
  const firstLow = lowKeys[0]!.key;
  ledger.recordNonReservationResult({
    key: firstLow,
    reason: 'dataset',
    prediction: {
      parseStatus: 'failure', source: 'meal', decision: 'error', failureCategory: 'dataset',
      failureCode: 'dataset_fetch_failed', latencyMs: 9, sampleIndex: firstLow.sampleIndex, cached: false,
    },
  });
  const secondLow = lowKeys[1]!.key;
  ledger.reserve(secondLow);
  ledger.recoverAfterCrash();
  for (const row of lowKeys.slice(2)) terminal(row.key, 'meal');
  for (const row of medKeys) terminal(row.key, 'meal');
  save('development', 'LOW');
  save('development', 'MEDIUM');
  ledger.releaseLock(context.owner);
  const reopened = open();
  return { context, reopened, snapshots, effects };
}

let clean: Fixture;
let mixed: Fixture;

beforeAll(async () => {
  clean = await buildCleanFixture();
  mixed = await buildMixedFixture();
}, 60000);

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

interface DigestTable {
  readonly fixtureVersion: number;
  readonly assemblerSha: string;
  readonly functionsTree: string;
  readonly digests: Record<string, { jsonSha256: string; markdownSha256: string }>;
}

function loadDigests(): DigestTable {
  const raw = readFileSync(
    resolve(repo, 'functions/test/nutrition-eval/fixtures/calibration-report-reconstruction-digests.json'),
    'utf8',
  );
  return JSON.parse(raw) as DigestTable;
}

interface FsRecord {
  readonly path: string;
  readonly size: number;
  readonly mode: number;
  readonly sha256: string;
}
function snapshotFsState(dir: string): FsRecord[] {
  const out: FsRecord[] = [];
  const walk = (base: string): void => {
    for (const name of readdirSync(base).sort()) {
      const full = join(base, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
        continue;
      }
      const bytes = readFileSync(full);
      out.push({
        path: full.slice(dir.length),
        size: st.size,
        mode: st.mode,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
    }
  };
  walk(dir);
  return out;
}

const cleanParams = (stage: StageName = 'development', profile: CalibrationProfile = 'LOW') => ({
  stage, profile, context: clean.context, readSnapshot: clean.reopened.getStageReportSnapshot,
});
const mixedParams = (stage: StageName = 'development', profile: CalibrationProfile = 'LOW') => ({
  stage, profile, context: mixed.context, readSnapshot: mixed.reopened.getStageReportSnapshot,
});

describe('reconstruction baseline digest controls (old assembler)', () => {
  it('digest fixture carries version1 and pinned source provenance', () => {
    const table = loadDigests();
    expect(table.fixtureVersion).toBe(1);
    expect(table.assemblerSha).toBe('8e0b6a2819a4b5357d776284bee32e93d77e3152b97e4d3c2dd13809858f3356');
    expect(table.functionsTree).toBe('ea9365bd9c5cdbd58b1e8582b4f75386b9624e05');
    for (const key of [
      'preflight/LOW', 'preflight/MEDIUM', 'development/LOW', 'development/MEDIUM',
      'validation/MEDIUM', 'benchmark/MEDIUM', 'mixed-development/LOW', 'mixed-development/MEDIUM',
    ]) {
      expect(table.digests[key]?.jsonSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(table.digests[key]?.markdownSha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it.each([
    ['preflight', 'LOW', 1, false],
    ['preflight', 'MEDIUM', 1, false],
    ['development', 'LOW', 24, false],
    ['development', 'MEDIUM', 24, false],
    ['validation', 'MEDIUM', 48, false],
    ['benchmark', 'MEDIUM', 60, false],
  ] as const)('clean %s/%s has %i rows with exact identity and frozen digests', async (stage, profile, count, isMixed) => {
    void isMixed;
    const assemble = await oldAssembler();
    const table = loadDigests();
    const report = await assemble(cleanParams(stage, profile));
    expect(report.cases).toHaveLength(count);
    expect(report.codeSha).toBe('b'.repeat(40));
    expect(report.datasetHash).toBe(
      stage === 'benchmark' ? CALIBRATION_PUBLIC_MANIFEST_HASH : CALIBRATION_MANIFEST_SHA256,
    );
    const trainingManifest = StrictCalibrationManifestSchema.parse(JSON.parse(clean.context.files['calibration-manifest']));
    const publicManifest = parseNutritionEvalManifest(JSON.parse(clean.context.files['public-manifest']));
    expect(report.datasetId).toBe(stage === 'benchmark' ? publicManifest.datasetId : trainingManifest.datasetId);
    expect(report.runId).toBe(
      `calibration-${stage}-${profile.toLowerCase()}-${'b'.repeat(12)}-${report.timestamp.replace(/[^0-9TZ]/g, '')}`,
    );
    const key = `${stage}/${profile}`;
    expect(sha256(renderNutritionEvalJson(report))).toBe(table.digests[key]!.jsonSha256);
    expect(sha256(renderNutritionEvalMarkdown(report))).toBe(table.digests[key]!.markdownSha256);
    expect(Object.isFrozen(report)).toBe(true);
  });

  it.each([['LOW'], ['MEDIUM']] as const)('mixed development/%s preserves measured/missing latency contract', async (profile) => {
    const assemble = await oldAssembler();
    const table = loadDigests();
    const report = await assemble(mixedParams('development', profile));
    expect(report.cases).toHaveLength(24);
    const key = `mixed-development/${profile}`;
    expect(sha256(renderNutritionEvalJson(report))).toBe(table.digests[key]!.jsonSha256);
    expect(sha256(renderNutritionEvalMarkdown(report))).toBe(table.digests[key]!.markdownSha256);
    if (profile === 'LOW') {
      expect(report.calibration?.latencyCoverage).toEqual({ measuredCases: 23, missingCases: 1 });
      const interrupted = report.cases.find((r) => r.prediction.failureCode === 'interrupted_reservation');
      expect(interrupted).toBeDefined();
      expect(interrupted!.prediction).not.toHaveProperty('latencyMs');
      const dataset = report.cases.find((r) => r.prediction.failureCategory === 'dataset');
      expect(dataset?.prediction.latencyMs).toBe(9);
      expect(report.calibration?.safeErrors).toEqual([{
        caseId: interrupted!.caseId, sampleIndex: 1, errorCategory: 'interrupted_reservation',
      }]);
    } else {
      expect(report.calibration?.latencyCoverage).toEqual({ measuredCases: 24, missingCases: 0 });
    }
  });

  it('benchmark control has exactly 36 meal / 12 label / 12 barcode source rows', async () => {
    const assemble = await oldAssembler();
    const report = await assemble(cleanParams('benchmark', 'MEDIUM'));
    expect(report.cases.filter((r) => r.prediction.source === 'meal')).toHaveLength(36);
    expect(report.cases.filter((r) => r.prediction.source === 'label')).toHaveLength(12);
    expect(report.cases.filter((r) => r.prediction.source === 'barcode')).toHaveLength(12);
    const barcode = report.cases.filter((r) => r.prediction.source === 'barcode');
    expect(barcode.every((r) => r.prediction.failureCategory === 'product' && r.prediction.latencyMs === 17)).toBe(true);
    expect(report.calibration?.latencyCoverage).toEqual({ measuredCases: 60, missingCases: 0 });
    expect(report.calibration?.safeErrors).toEqual([]);
  });

  it('clean development truth matches committed source populations', async () => {
    const assemble = await oldAssembler();
    const training = StrictCalibrationManifestSchema.parse(JSON.parse(clean.context.files['calibration-manifest']));
    const report = await assemble(cleanParams('development', 'LOW'));
    const byId = new Map(training.cases.filter((c) => c.group === 'development').map((c) => [c.id, c]));
    expect(report.cases).toHaveLength(24);
    for (const row of report.cases) {
      expect(row.truth).toEqual(byId.get(row.caseId)!.truth);
      expect(row.prediction.sampleIndex).toBe(1);
      expect(row.prediction.cached).toBe(false);
    }
  });

  it('public benchmark truth comes from committed public manifest, not caller truth', async () => {
    const assemble = await oldAssembler();
    const pub = parseNutritionEvalManifest(JSON.parse(clean.context.files['public-manifest']));
    const report = await assemble(cleanParams('benchmark', 'MEDIUM'));
    expect(pub.cases).toHaveLength(20);
    const planned = deriveCanonicalReportOutcomePlan(clean.context.files, 'MEDIUM').filter((r) => r.key.stage === 'benchmark');
    expect(report.cases.map((r) => `${r.caseId}/${r.prediction.sampleIndex}`)).toEqual(
      planned.map((r) => `${r.key.caseId}/${r.key.sampleIndex}`),
    );
  });
});

describe('prepared reconstructor factory (new export)', () => {
  it('preflight LOW reconstructs synchronously with frozen bytes matching digests', async () => {
    const prepare = await loadPrepare();
    const table = loadDigests();
    const ready = await prepare(clean.context);
    const snapshot = clean.snapshots.get('preflight/LOW')!;
    const result = ready.reconstruct({ stage: 'preflight', profile: 'LOW', snapshot });
    expect(result instanceof Promise).toBe(false);
    expect(Object.isFrozen(ready)).toBe(true);
    assertDeepFrozen(result);
    expect(sha256(renderNutritionEvalJson(result))).toBe(table.digests['preflight/LOW']!.jsonSha256);
    expect(sha256(renderNutritionEvalMarkdown(result))).toBe(table.digests['preflight/LOW']!.markdownSha256);
  });

  it.each([
    ['preflight', 'LOW', false],
    ['preflight', 'MEDIUM', false],
    ['development', 'LOW', false],
    ['development', 'MEDIUM', false],
    ['validation', 'MEDIUM', false],
    ['benchmark', 'MEDIUM', false],
  ] as const)('clean %s/%s reconstruct matches frozen digests and legacy bytes', async (stage, profile) => {
    const prepare = await loadPrepare();
    const table = loadDigests();
    const legacy = await (await oldAssembler())(cleanParams(stage, profile));
    const ready = await prepare(clean.context);
    const result = ready.reconstruct({ stage, profile, snapshot: clean.snapshots.get(`${stage}/${profile}`)! });
    expect(renderNutritionEvalJson(result)).toBe(renderNutritionEvalJson(legacy));
    expect(renderNutritionEvalMarkdown(result)).toBe(renderNutritionEvalMarkdown(legacy));
    expect(sha256(renderNutritionEvalJson(result))).toBe(table.digests[`${stage}/${profile}`]!.jsonSha256);
    expect(sha256(renderNutritionEvalMarkdown(result))).toBe(table.digests[`${stage}/${profile}`]!.markdownSha256);
    assertDeepFrozen(result);
  });

  it.each([['LOW'], ['MEDIUM']] as const)('mixed development/%s reconstruct matches frozen digests', async (profile) => {
    const prepare = await loadPrepare();
    const table = loadDigests();
    const ready = await prepare(mixed.context);
    const result = ready.reconstruct({
      stage: 'development', profile, snapshot: mixed.snapshots.get(`development/${profile}`)!,
    });
    expect(sha256(renderNutritionEvalJson(result))).toBe(table.digests[`mixed-development/${profile}`]!.jsonSha256);
    expect(sha256(renderNutritionEvalMarkdown(result))).toBe(table.digests[`mixed-development/${profile}`]!.markdownSha256);
    if (profile === 'LOW') {
      expect(result.calibration?.latencyCoverage).toEqual({ measuredCases: 23, missingCases: 1 });
    }
    assertDeepFrozen(result);
  });

  it.each(['accessor', 'hidden', 'symbol', 'prototype', 'missing', 'extra', 'present-undefined'] as const)(
    'rejects hostile context shape %s with fresh causeless INVALID', async (kind) => {
      const prepare = await loadPrepare();
      const base = clone(clean.context) as Record<string, unknown>;
      let request: unknown = base;
      const getter = (): unknown => {
        throw new Error('getter must not run');
      };
      if (kind === 'accessor') {
        request = { ...base };
        Object.defineProperty(request, 'files', { enumerable: true, get: getter });
      }
      if (kind === 'hidden') {
        request = { ...base };
        Object.defineProperty(request, 'secret', { value: 'private', enumerable: false });
      }
      if (kind === 'symbol') {
        request = { ...base, [Symbol('extra')]: 'private' };
      }
      if (kind === 'prototype') {
        request = { ...base };
        Object.setPrototypeOf(request, { hidden: true });
      }
      if (kind === 'missing') {
        const { files: _drop, ...rest } = base;
        void _drop;
        request = rest;
      }
      if (kind === 'extra') request = { ...base, extra: 'nope' };
      if (kind === 'present-undefined') request = { ...base, files: undefined };
      let caught: unknown;
      try {
        await prepare(request);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(CalibrationFatalError);
      expect((caught as Error).message).toBe('calibration:stage-report-invalid');
      expect(caught).not.toHaveProperty('cause');
    },
  );

  it.each([
    'files-prompt-accessor', 'identity-model-accessor',
    'files-hidden-existing', 'identity-hidden-existing',
    'files-symbol', 'identity-symbol',
    'files-prototype', 'identity-prototype',
    'files-missing', 'identity-missing',
    'files-extra', 'identity-extra',
    'files-present-undefined', 'identity-present-undefined',
    'file-nonstring',
  ] as const)(
    'rejects nested %s with zero Get and fresh causeless INVALID', async (kind) => {
      const prepare = await loadPrepare();
      let gets = 0;
      const context = clone(clean.context) as Record<string, unknown>;
      const files = context.files as Record<string, unknown>;
      const identity = context.identity as Record<string, unknown>;
      const validPrompt = clone(clean.context.files)['prompt'] as string;
      const validModel = clone(clean.context.identity)['model'] as string;
      if (kind === 'files-prompt-accessor') {
        Object.defineProperty(files, 'prompt', {
          enumerable: true,
          get: () => {
            gets += 1;
            return validPrompt;
          },
        });
      }
      if (kind === 'identity-model-accessor') {
        Object.defineProperty(identity, 'model', {
          enumerable: true,
          get: () => {
            gets += 1;
            return validModel;
          },
        });
      }
      if (kind === 'files-hidden-existing') Object.defineProperty(files, 'prompt', { value: validPrompt, enumerable: false });
      if (kind === 'identity-hidden-existing') Object.defineProperty(identity, 'model', { value: validModel, enumerable: false });
      if (kind === 'files-symbol') {
        (files as unknown as Record<symbol, unknown>)[Symbol('extra')] = 1;
      }
      if (kind === 'identity-symbol') {
        (identity as unknown as Record<symbol, unknown>)[Symbol('extra')] = 1;
      }
      if (kind === 'files-prototype') Object.setPrototypeOf(files, { hidden: true });
      if (kind === 'identity-prototype') Object.setPrototypeOf(identity, { hidden: true });
      if (kind === 'files-missing') delete files['prompt'];
      if (kind === 'identity-missing') delete identity['model'];
      if (kind === 'files-extra') files['extra-file'] = 'nope';
      if (kind === 'identity-extra') identity['extra-field'] = 'nope';
      if (kind === 'files-present-undefined') files['prompt'] = undefined;
      if (kind === 'identity-present-undefined') identity['model'] = undefined;
      if (kind === 'file-nonstring') {
        files['prompt'] = 123;
      }
      let first: unknown;
      try {
        await prepare(context);
      } catch (error) {
        first = error;
      }
      expect(first).toBeInstanceOf(CalibrationFatalError);
      expect((first as Error).message).toBe('calibration:stage-report-invalid');
      expect(first).not.toHaveProperty('cause');
      expect(gets).toBe(0);
      let second: unknown;
      try {
        await prepare(context);
      } catch (error) {
        second = error;
      }
      expect(second).toBeInstanceOf(CalibrationFatalError);
      expect(second).not.toBe(first);
      expect(second).not.toHaveProperty('cause');
      expect(gets).toBe(0);
    },
  );

  it('accepts null-prototype files and identity as honest without Gets', async () => {
    const prepare = await loadPrepare();
    let gets = 0;
    const files = Object.assign(Object.create(null), clone(clean.context.files));
    const identity = Object.assign(Object.create(null), clone(clean.context.identity));
    const proxiedFiles = new Proxy(files, {
      get: (target, key, receiver) => {
        gets += 1;
        return Reflect.get(target, key, receiver);
      },
    });
    const proxiedIdentity = new Proxy(identity, {
      get: (target, key, receiver) => {
        gets += 1;
        return Reflect.get(target, key, receiver);
      },
    });
    const ready = await prepare({ ...clone(clean.context), files: proxiedFiles, identity: proxiedIdentity });
    const result = ready.reconstruct({
      stage: 'preflight', profile: 'LOW', snapshot: clean.snapshots.get('preflight/LOW')!,
    });
    expect(result.cases).toHaveLength(1);
    expect(gets).toBe(0);
  });

  it.each(['files-ownKeys', 'identity-ownKeys', 'files-descriptor', 'identity-descriptor'] as const)(
    'rejects throwing %s reflection with fresh causeless INVALID', async (kind) => {
      const prepare = await loadPrepare();
      let gets = 0;
      const foreign = new Proxy({}, {
        get: () => {
          gets++;
          throw new Error('private');
        },
        getPrototypeOf: () => {
          gets++;
          throw new Error('private');
        },
      });
      const context = clone(clean.context) as Record<string, unknown>;
      const throwingOwnKeys = (): string[] => {
        throw foreign;
      };
      const throwingDesc = (): PropertyDescriptor | undefined => {
        throw foreign;
      };
      if (kind === 'files-ownKeys') {
        context.files = new Proxy(clone(clean.context.files), { ownKeys: throwingOwnKeys });
      }
      if (kind === 'identity-ownKeys') {
        context.identity = new Proxy(clone(clean.context.identity), { ownKeys: throwingOwnKeys });
      }
      if (kind === 'files-descriptor') {
        context.files = new Proxy(clone(clean.context.files), { getOwnPropertyDescriptor: throwingDesc });
      }
      if (kind === 'identity-descriptor') {
        context.identity = new Proxy(clone(clean.context.identity), { getOwnPropertyDescriptor: throwingDesc });
      }
      let caught: unknown;
      try {
        await prepare(context);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(CalibrationFatalError);
      expect((caught as Error).message).toBe('calibration:stage-report-invalid');
      expect(caught === foreign).toBe(false);
      expect(caught).not.toHaveProperty('cause');
      expect(gets).toBe(0);
    },
  );

  it.each([
    'public-manifest', 'calibration-manifest', 'prompt', 'source-lock', 'off-lock',
    'response-schema', 'historical-reference',
  ] as const)('rejects unpinned %s bytes before any snapshot work', async (name) => {
    const prepare = await loadPrepare();
    const tampered = `${clean.context.files[name]}x`;
    await expect(prepare({
      ...clone(clean.context),
      files: { ...clone(clean.context.files), [name]: tampered },
    })).rejects.toThrow('calibration:stage-report-invalid');
  });

  it.each([
    'wrong-first-case',
    'wrong-code-short',
    'wrong-code-uppercase',
    'wrong-code-nonstring',
    'wrong-tree-short',
    'wrong-tree-uppercase',
    'wrong-tree-nonstring',
    'wrong-model',
    'wrong-profile-count',
  ] as const)(
    'rejects malformed source identity %s', async (kind) => {
      const prepare = await loadPrepare();
      const context = clone(clean.context) as {
        identity: Record<string, unknown>;
        firstDevelopmentCaseId: string;
        files: Record<string, string>;
      };
      if (kind === 'wrong-first-case') context.firstDevelopmentCaseId = 'not-a-case';
      if (kind === 'wrong-code-short') context.identity.implementationCommit = 'd'.repeat(39);
      if (kind === 'wrong-code-uppercase') context.identity.implementationCommit = 'D'.repeat(40);
      if (kind === 'wrong-code-nonstring') context.identity.implementationCommit = 123;
      if (kind === 'wrong-tree-short') context.identity.functionsTreeId = 'e'.repeat(39);
      if (kind === 'wrong-tree-uppercase') context.identity.functionsTreeId = 'E'.repeat(40);
      if (kind === 'wrong-tree-nonstring') context.identity.functionsTreeId = null;
      if (kind === 'wrong-model') context.identity.model = 'gemini-2.5-flash';
      if (kind === 'wrong-profile-count') context.identity.plannedImageCalls = 10;
      await expect(prepare(context)).rejects.toThrow('calibration:stage-report-invalid');
    },
  );

  it('accepts syntactically valid alternate 40hex code/tree at preparation; source binds snapshots', async () => {
    const prepare = await loadPrepare();
    const context = clone(clean.context) as {
      identity: Record<string, unknown>;
      firstDevelopmentCaseId: string;
      files: Record<string, string>;
    };
    context.identity.implementationCommit = 'd'.repeat(40);
    context.identity.functionsTreeId = 'e'.repeat(40);
    const ready = await prepare(context);
    expect(Object.isFrozen(ready)).toBe(true);
    expect(() => ready.reconstruct({
      stage: 'preflight', profile: 'LOW', snapshot: clean.snapshots.get('preflight/LOW')!,
    })).toThrow('calibration:stage-report-invalid');
  });

  it('replaces throwing ownKeys/descriptor reflection without inspecting foreign values', async () => {
    const prepare = await loadPrepare();
    let reads = 0;
    const foreign = new Proxy({}, {
      get: () => {
        reads++;
        throw new Error('private');
      },
      getPrototypeOf: () => {
        reads++;
        throw new Error('private');
      },
    });
    const hostile = new Proxy(clone(clean.context), {
      ownKeys: () => {
        throw foreign;
      },
    });
    let caught: unknown;
    try {
      await prepare(hostile);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect(caught === foreign).toBe(false);
    expect(caught).not.toHaveProperty('cause');
    expect(reads).toBe(0);
  });

  it('accepts honest get-trap proxies on context with zero Gets', async () => {
    const prepare = await loadPrepare();
    let gets = 0;
    const wrap = <T extends object>(value: T): T => new Proxy(value, {
      get: (target, key, receiver) => {
        gets++;
        return Reflect.get(target, key, receiver);
      },
    });
    const ready = await prepare(wrap({
      ...clone(clean.context),
      files: wrap(clone(clean.context.files)),
      identity: wrap(clone(clean.context.identity)),
    }));
    const result = ready.reconstruct({
      stage: 'preflight', profile: 'LOW', snapshot: clean.snapshots.get('preflight/LOW')!,
    });
    expect(result.cases).toHaveLength(1);
    expect(gets).toBe(0);
  });

  it('leaves unused owner/report/base proxies untraversed and caller source unfrozen', async () => {
    const prepare = await loadPrepare();
    let gets = 0;
    let ownKeysCalls = 0;
    let descCalls = 0;
    const throwing = new Proxy({}, {
      get: () => {
        gets++;
        throw new Error('must not traverse');
      },
      ownKeys: () => {
        ownKeysCalls++;
        throw new Error('must not traverse');
      },
      getOwnPropertyDescriptor: () => {
        descCalls++;
        throw new Error('must not traverse');
      },
    });
    const context = clone(clean.context) as Record<string, unknown>;
    const mutableFiles = { ...clean.context.files };
    const mutableIdentity = { ...clean.context.identity };
    const request = {
      ...context, files: mutableFiles, identity: mutableIdentity, owner: throwing, report: throwing, baseDir: throwing,
    };
    const ready = await prepare(request);
    const result = ready.reconstruct({
      stage: 'preflight', profile: 'LOW', snapshot: clean.snapshots.get('preflight/LOW')!,
    });
    expect(result.cases).toHaveLength(1);
    expect(Object.isFrozen(mutableFiles)).toBe(false);
    expect(Object.isFrozen(mutableIdentity)).toBe(false);
    expect(Object.isFrozen(ready)).toBe(true);
    assertDeepFrozen(result);
    expect(gets).toBe(0);
    expect(ownKeysCalls).toBe(0);
    expect(descCalls).toBe(0);
  });

  it('closure retains owned source across caller mutation before await and after prepare', async () => {
    const prepare = await loadPrepare();
    const files = { ...clean.context.files };
    const identity = { ...clean.context.identity };
    const firstDevelopmentCaseId = clean.context.firstDevelopmentCaseId;
    const context = {
      ...clean.context, files, identity, firstDevelopmentCaseId,
      owner: { ...clean.context.owner },
      report: { ...clean.context.report },
      baseDir: clean.context.baseDir,
    } as Record<string, unknown>;
    const pending = prepare(context);
    files['calibration-manifest'] = 'mutated-before-await';
    files['public-manifest'] = 'mutated-before-await';
    (identity as Record<string, unknown>).model = 'mutated-before-await';
    (identity as Record<string, unknown>).implementationCommit = 'f'.repeat(40);
    context.firstDevelopmentCaseId = 'mutated-before-await';
    context.owner = { mutated: true };
    context.report = { mutated: true };
    context.baseDir = '/mutated-before-await';
    const ready = await pending;
    files['public-manifest'] = 'mutated-after-prepare';
    files['calibration-manifest'] = 'mutated-after-prepare';
    (identity as Record<string, unknown>).model = 'mutated-after-prepare';
    context.firstDevelopmentCaseId = 'mutated-after-prepare';
    context.owner = { mutatedAfter: true };
    const first = ready.reconstruct({ stage: 'preflight', profile: 'LOW', snapshot: clean.snapshots.get('preflight/LOW')! });
    expect(first.cases).toHaveLength(1);
    const second = ready.reconstruct({ stage: 'preflight', profile: 'LOW', snapshot: clean.snapshots.get('preflight/LOW')! });
    expect(renderNutritionEvalJson(second)).toBe(renderNutritionEvalJson(first));
  });

  it('preparation performs zero snapshot/provider/clock/ledger/fs effects', async () => {
    const prepare = await loadPrepare();
    const before = { ...clean.effects };
    const contextDir = (clean.context as { baseDir: string }).baseDir;
    const fsBefore = snapshotFsState(contextDir);
    let dateCalls = 0;
    const origNow = Date.now;
    (Date as { now: () => number }).now = () => {
      dateCalls++;
      return origNow();
    };
    try {
      const ready = await prepare(clone(clean.context));
      ready.reconstruct({ stage: 'preflight', profile: 'LOW', snapshot: clone(clean.snapshots.get('preflight/LOW')!) });
    } finally {
      (Date as { now: () => number }).now = origNow;
    }
    expect(clean.effects).toEqual(before);
    expect(snapshotFsState(contextDir)).toEqual(fsBefore);
    expect(dateCalls).toBe(0);
  });
});

describe('reconstruct closed three-field requests', () => {
  it.each([
    'bad-stage', 'bad-profile', 'extra-context', 'extra-readSnapshot', 'missing-snapshot',
    'extra-truth', 'extra-receipt', 'extra-report', 'extra-path', 'extra-hash', 'extra-threshold',
  ] as const)(
    'rejects malformed reconstruct request %s', async (kind) => {
      const ready = await (await loadPrepare())(clone(clean.context));
      const good = {
        stage: 'preflight', profile: 'LOW', snapshot: clean.snapshots.get('preflight/LOW')!,
      } as Record<string, unknown>;
      if (kind === 'bad-stage') good.stage = 'nope';
      if (kind === 'bad-profile') good.profile = 'HIGH';
      if (kind === 'extra-context') good.context = {};
      if (kind === 'extra-readSnapshot') good.readSnapshot = (): unknown => null;
      if (kind === 'missing-snapshot') delete good.snapshot;
      if (kind === 'extra-truth') good.truth = [];
      if (kind === 'extra-receipt') good.receipt = {};
      if (kind === 'extra-report') good.report = {};
      if (kind === 'extra-path') good.path = '/tmp/x';
      if (kind === 'extra-hash') good.hash = 'abc';
      if (kind === 'extra-threshold') good.threshold = 1;
      expect(() => ready.reconstruct(good)).toThrow(CalibrationFatalError);
    },
  );

  it('rejects invalid stage/profile before traversing hostile snapshot getters', async () => {
    const ready = await (await loadPrepare())(clone(clean.context));
    let gets = 0;
    let ownKeysCalls = 0;
    let descCalls = 0;
    let protoCalls = 0;
    const hostileSnapshot = new Proxy(clone(clean.snapshots.get('preflight/LOW')!), {
      get: (target, key, receiver) => {
        gets += 1;
        return Reflect.get(target, key, receiver);
      },
      ownKeys: (target) => {
        ownKeysCalls += 1;
        return Reflect.ownKeys(target);
      },
      getOwnPropertyDescriptor: (target, key) => {
        descCalls += 1;
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
      getPrototypeOf: (target) => {
        protoCalls += 1;
        return Reflect.getPrototypeOf(target);
      },
    });
    expect(() => ready.reconstruct({ stage: 'nope', profile: 'LOW', snapshot: hostileSnapshot })).toThrow(
      'calibration:stage-report-invalid',
    );
    expect(() => ready.reconstruct({ stage: 'preflight', profile: 'HIGH', snapshot: hostileSnapshot })).toThrow(
      'calibration:stage-report-invalid',
    );
    expect(gets).toBe(0);
    expect(ownKeysCalls).toBe(0);
    expect(descCalls).toBe(0);
    expect(protoCalls).toBe(0);
  });

  it.each(['accessor', 'hidden', 'symbol', 'prototype'] as const)(
    'rejects hostile reconstruct wrapper %s before snapshot getters', async (kind) => {
      const ready = await (await loadPrepare())(clone(clean.context));
      let gets = 0;
      let ownKeysCalls = 0;
      let descCalls = 0;
      let protoCalls = 0;
      const snapshot = clone(clean.snapshots.get('preflight/LOW')!);
      Object.defineProperty(snapshot, 'spy', {
        enumerable: true, get: () => {
          gets += 1;
          return 1;
        },
      });
      const guardedSnapshot = new Proxy(snapshot, {
        get: (target, key, receiver) => {
          gets += 1;
          return Reflect.get(target, key, receiver);
        },
        ownKeys: (target) => {
          ownKeysCalls += 1;
          return Reflect.ownKeys(target);
        },
        getOwnPropertyDescriptor: (target, key) => {
          descCalls += 1;
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
        getPrototypeOf: (target) => {
          protoCalls += 1;
          return Reflect.getPrototypeOf(target);
        },
      });
      const request: Record<string | symbol, unknown> = {
        stage: 'preflight', profile: 'LOW', snapshot: guardedSnapshot,
      };
      if (kind === 'accessor') Object.defineProperty(request, 'stage', { enumerable: true, get: () => {
        gets += 1;
        return 'preflight';
      } });
      if (kind === 'hidden') Object.defineProperty(request, 'secret', { value: 1, enumerable: false });
      if (kind === 'symbol') request[Symbol('extra')] = 1;
      if (kind === 'prototype') Object.setPrototypeOf(request, { hidden: true });
      expect(() => ready.reconstruct(request)).toThrow('calibration:stage-report-invalid');
      expect(gets).toBe(0);
      expect(ownKeysCalls).toBe(0);
      expect(descCalls).toBe(0);
      expect(protoCalls).toBe(0);
    },
  );

  it.each([
    'mismatch-identity', 'mismatch-stage', 'mismatch-profile', 'selected-missing', 'selected-mismatch',
    'duplicate', 'unplanned', 'wrong-sample', 'cached-true', 'wrong-source',
  ] as const)('rejects hostile snapshot %s with static INVALID', async (kind) => {
    const ready = await (await loadPrepare())(clone(clean.context));
    const snapshot = clone(clean.snapshots.get('benchmark/MEDIUM')!) as unknown as {
      images: Array<Record<string, unknown>>;
      counts: Record<string, number>;
      startedAt?: string;
      identity: Record<string, unknown>;
      stage: string;
      profile: string;
      selectedProfile?: string;
    };
    const row = snapshot.images[0]!;
    if (kind === 'mismatch-identity') snapshot.identity.implementationCommit = 'd'.repeat(40);
    if (kind === 'mismatch-stage') snapshot.stage = 'preflight';
    if (kind === 'mismatch-profile') snapshot.profile = 'LOW';
    if (kind === 'selected-missing') delete snapshot.selectedProfile;
    if (kind === 'selected-mismatch') snapshot.selectedProfile = 'LOW';
    if (kind === 'duplicate') snapshot.images.push(clone(row));
    if (kind === 'unplanned') {
      const extra = clone(row);
      (extra.key as Record<string, unknown>).caseId = 'unplanned-case';
      snapshot.images.push(extra);
    }
    if (kind === 'wrong-sample') (row.key as Record<string, unknown>).sampleIndex = 99;
    if (kind === 'cached-true') {
      ((row.journal as Record<string, unknown>).reportPrediction as Record<string, unknown>).cached = true;
    }
    if (kind === 'wrong-source') {
      ((row.journal as Record<string, unknown>).reportPrediction as Record<string, unknown>).source = 'label';
    }
    let caught: unknown;
    try {
      ready.reconstruct({ stage: 'benchmark', profile: 'MEDIUM', snapshot });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect((caught as Error).message).toBe('calibration:stage-report-invalid');
    expect(caught).not.toHaveProperty('cause');
  });

  it.each(['unstarted', 'pending', 'missing-row'] as const)(
    'holds incomplete snapshot %s with static INCOMPLETE', async (kind) => {
    const ready = await (await loadPrepare())(clone(clean.context));
    const snapshot = clone(clean.snapshots.get('benchmark/MEDIUM')!) as unknown as {
      images: Array<Record<string, unknown>>;
      counts: Record<string, number>;
      startedAt?: string;
      identity: Record<string, unknown>;
      stage: string;
      profile: string;
      selectedProfile?: string;
    };
    if (kind === 'unstarted') delete snapshot.startedAt;
    if (kind === 'pending') {
      snapshot.images.pop();
      snapshot.counts.imageCallsCompleted!--;
      snapshot.counts.imageCallsPending = 1;
    }
    if (kind === 'missing-row') {
      snapshot.images.pop();
      snapshot.counts.imageCallsReserved!--;
      snapshot.counts.imageCallsCompleted!--;
    }
    let caught: unknown;
    try {
      ready.reconstruct({ stage: 'benchmark', profile: 'MEDIUM', snapshot });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect((caught as Error).message).toBe('calibration:stage-report-incomplete');
    expect(caught).not.toHaveProperty('cause');
  });

  it('rejects snapshot with throwing reflection without foreign inspection', async () => {
    const ready = await (await loadPrepare())(clone(clean.context));
    let gets = 0;
    const foreign = new Proxy({}, {
      get: () => {
        gets++;
        throw new Error('private');
      },
      getPrototypeOf: () => {
        gets++;
        throw new Error('private');
      },
    });
    const hostile = new Proxy(clone(clean.snapshots.get('preflight/LOW')!), {
      ownKeys: () => {
        throw foreign;
      },
    });
    let caught: unknown;
    try {
      ready.reconstruct({ stage: 'preflight', profile: 'LOW', snapshot: hostile });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect((caught as Error).message).toBe('calibration:stage-report-invalid');
    expect(caught === foreign).toBe(false);
    expect(caught).not.toHaveProperty('cause');
    expect(gets).toBe(0);
    let second: unknown;
    try {
      ready.reconstruct({ stage: 'preflight', profile: 'LOW', snapshot: hostile });
    } catch (error) {
      second = error;
    }
    expect(second).toBeInstanceOf(CalibrationFatalError);
    expect(second).not.toBe(caught);
    expect(second).not.toHaveProperty('cause');
  });

  it.each(['row-ownKeys', 'row-descriptor', 'prediction-ownKeys', 'prediction-descriptor'] as const)(
    'rejects snapshot nested %s fault with static INVALID and zero Gets', async (kind) => {
      const ready = await (await loadPrepare())(clone(clean.context));
      let gets = 0;
      const foreign = new Proxy({}, {
        get: () => {
          gets += 1;
          throw new Error('private');
        },
        getPrototypeOf: () => {
          gets += 1;
          throw new Error('private');
        },
      });
      const throwingOwnKeys = (): string[] => {
        throw foreign;
      };
      const throwingDesc = (): PropertyDescriptor | undefined => {
        throw foreign;
      };
      const snapshot = clone(clean.snapshots.get('benchmark/MEDIUM')!) as unknown as {
        images: unknown[];
      };
      if (kind === 'row-ownKeys') {
        snapshot.images[0] = new Proxy(snapshot.images[0] as object, { ownKeys: throwingOwnKeys });
      }
      if (kind === 'row-descriptor') {
        snapshot.images[0] = new Proxy(snapshot.images[0] as object, { getOwnPropertyDescriptor: throwingDesc });
      }
      if (kind === 'prediction-ownKeys' || kind === 'prediction-descriptor') {
        const row = clone(snapshot.images[0]) as Record<string, unknown>;
        const journal = clone((row as { journal: unknown }).journal) as Record<string, unknown>;
        const prediction = clone(journal.reportPrediction) as object;
        journal.reportPrediction = kind === 'prediction-ownKeys'
          ? new Proxy(prediction, { ownKeys: throwingOwnKeys })
          : new Proxy(prediction, { getOwnPropertyDescriptor: throwingDesc });
        (row as Record<string, unknown>).journal = journal;
        snapshot.images[0] = row;
      }
      let caught: unknown;
      try {
        ready.reconstruct({ stage: 'benchmark', profile: 'MEDIUM', snapshot });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(CalibrationFatalError);
      expect((caught as Error).message).toBe('calibration:stage-report-invalid');
      expect(caught === foreign).toBe(false);
      expect(caught).not.toHaveProperty('cause');
      expect(gets).toBe(0);
    },
  );

  it('reconstruct is synchronous and deeply frozen, immune to later caller mutation', async () => {
    const ready = await (await loadPrepare())(clone(clean.context));
    const snapshot = clone(clean.snapshots.get('development/LOW')!);
    const first = ready.reconstruct({ stage: 'development', profile: 'LOW', snapshot });
    const bytes = renderNutritionEvalJson(first);
    (snapshot.images as unknown[]).pop();
    ((snapshot.images[0] as Record<string, unknown>).journal as Record<string, unknown>).reportPrediction = { mutated: true };
    expect(renderNutritionEvalJson(first)).toBe(bytes);
    assertDeepFrozen(first);
    expect(Object.isFrozen(snapshot)).toBe(false);
  });

  it('one closure serves all stages/profiles/mixed snapshots without leakage', async () => {
    const ready = await (await loadPrepare())(clone(clean.context));
    const table = loadDigests();
    const jobs: Array<{
      readonly label: string;
      readonly stage: StageName;
      readonly profile: CalibrationProfile;
      readonly snapshot: CalibrationStageReportSnapshot;
      readonly digestKey: string;
    }> = [
      { label: 'first-preflight-LOW', stage: 'preflight', profile: 'LOW', snapshot: clean.snapshots.get('preflight/LOW')!, digestKey: 'preflight/LOW' },
      { label: 'development-MEDIUM', stage: 'development', profile: 'MEDIUM', snapshot: clean.snapshots.get('development/MEDIUM')!, digestKey: 'development/MEDIUM' },
      { label: 'preflight-MEDIUM', stage: 'preflight', profile: 'MEDIUM', snapshot: clean.snapshots.get('preflight/MEDIUM')!, digestKey: 'preflight/MEDIUM' },
      { label: 'development-LOW', stage: 'development', profile: 'LOW', snapshot: clean.snapshots.get('development/LOW')!, digestKey: 'development/LOW' },
      { label: 'validation-MEDIUM', stage: 'validation', profile: 'MEDIUM', snapshot: clean.snapshots.get('validation/MEDIUM')!, digestKey: 'validation/MEDIUM' },
      { label: 'mixed-LOW', stage: 'development', profile: 'LOW', snapshot: mixed.snapshots.get('development/LOW')!, digestKey: 'mixed-development/LOW' },
      { label: 'benchmark-MEDIUM', stage: 'benchmark', profile: 'MEDIUM', snapshot: clean.snapshots.get('benchmark/MEDIUM')!, digestKey: 'benchmark/MEDIUM' },
      { label: 'mixed-MEDIUM', stage: 'development', profile: 'MEDIUM', snapshot: mixed.snapshots.get('development/MEDIUM')!, digestKey: 'mixed-development/MEDIUM' },
    ];
    const seen = new Map<string, string>();
    const objects: NutritionEvalReport[] = [];
    for (const job of jobs) {
      const result = ready.reconstruct({ stage: job.stage, profile: job.profile, snapshot: job.snapshot });
      assertDeepFrozen(result);
      const json = renderNutritionEvalJson(result);
      expect(sha256(json)).toBe(table.digests[job.digestKey]!.jsonSha256);
      expect(sha256(renderNutritionEvalMarkdown(result))).toBe(table.digests[job.digestKey]!.markdownSha256);
      for (const [prevLabel, prevJson] of seen) {
        const prevObj = objects.find((o, idx) => jobs[idx]!.label === prevLabel)!;
        expect(renderNutritionEvalJson(prevObj)).toBe(prevJson);
      }
      seen.set(job.label, json);
      objects.push(result);
    }
    expect(objects).toHaveLength(8);
    expect(objects[0]).not.toBe(objects[1]);
    expect(objects[0]!.cases).toHaveLength(1);
    expect(objects[6]!.cases).toHaveLength(60);
    expect(objects[5]!.calibration?.latencyCoverage).toEqual({ measuredCases: 23, missingCases: 1 });
    expect(renderNutritionEvalJson(objects[0]!)).toBe(seen.get('first-preflight-LOW'));
  });
});

describe('legacy async callback ownership (old assembler)', () => {
  it('captures readSnapshot before await and calls original exactly once despite replacement', async () => {
    const assemble = await oldAssembler();
    let calls = 0;
    const seen: unknown[][] = [];
    const original = (stage: unknown, profile: unknown): CalibrationStageReportSnapshot => {
      calls++;
      seen.push([stage, profile]);
      return clean.snapshots.get('development/LOW')!;
    };
    const params = { ...cleanParams('development', 'LOW'), readSnapshot: original };
    const promise = assemble(params);
    expect(calls).toBe(0);
    params.readSnapshot = (() => {
      throw new Error('replacement must not be used');
    }) as unknown as typeof original;
    const report = await promise;
    expect(report.cases).toHaveLength(24);
    expect(calls).toBe(1);
    expect(seen).toEqual([['development', 'LOW']]);
  });

  it('maps original callback throw to fresh READ_FAILED without foreign inspection', async () => {
    const assemble = await oldAssembler();
    let reads = 0;
    const foreign = new Proxy({}, {
      get: () => {
        reads++;
        throw new Error('private');
      },
      getPrototypeOf: () => {
        reads++;
        throw new Error('private');
      },
    });
    let caught: unknown;
    try {
      await assemble({ ...cleanParams('development', 'LOW'), readSnapshot: () => {
        throw foreign;
      } });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect((caught as Error).message).toBe('calibration:stage-report-read-failed');
    expect(caught === foreign).toBe(false);
    expect(caught).not.toHaveProperty('cause');
    expect(reads).toBe(0);
  });

  it('incomplete snapshot stays INCOMPLETE and preparation failure calls callback zero times', async () => {
    const assemble = await oldAssembler();
    const incomplete = clone(clean.snapshots.get('benchmark/MEDIUM')!) as unknown as {
      images: unknown[];
      counts: Record<string, number>;
    };
    incomplete.images.pop();
    incomplete.counts.imageCallsReserved!--;
    incomplete.counts.imageCallsCompleted!--;
    await expect(assemble({ ...cleanParams('benchmark', 'MEDIUM'), readSnapshot: () => incomplete })).rejects.toThrow(
      'calibration:stage-report-incomplete',
    );
    let calls = 0;
    await expect(assemble({
      ...cleanParams('benchmark', 'MEDIUM'),
      context: { ...clean.context, files: { ...clean.context.files, prompt: 'tampered' } },
      readSnapshot: () => {
        calls++;
        return clean.snapshots.get('benchmark/MEDIUM')!;
      },
    })).rejects.toThrow('calibration:stage-report-invalid');
    expect(calls).toBe(0);
  });
});

describe('pure-operation filesystem and dispatch isolation', () => {
  it('pure reconstruct leaves native ledger/journal bytes and counters identical', async () => {
    const prepare = await loadPrepare();
    const ready = await prepare(clone(clean.context));
    const contextDir = (clean.context as { baseDir: string }).baseDir;
    const before = { ...clean.effects };
    const fsBefore = snapshotFsState(contextDir);
    const first = ready.reconstruct({ stage: 'validation', profile: 'MEDIUM', snapshot: clone(clean.snapshots.get('validation/MEDIUM')!) });
    const second = ready.reconstruct({ stage: 'validation', profile: 'MEDIUM', snapshot: clone(clean.snapshots.get('validation/MEDIUM')!) });
    expect(renderNutritionEvalJson(first)).toBe(renderNutritionEvalJson(second));
    expect(first).not.toBe(second);
    expect(clean.effects).toEqual(before);
    expect(snapshotFsState(contextDir)).toEqual(fsBefore);
  });

  it('pure async prepare then sync reconstruct performs zero real fs/network/clock calls', async () => {
    const prepare = await loadPrepare();
    const contextCopy = clone(clean.context);
    const snapshotCopy = clone(clean.snapshots.get('preflight/LOW')!);
    const table = loadDigests();
    const beforeEffects = { ...clean.effects };
    expect(Object.keys(beforeEffects).sort()).toEqual(['append', 'clock', 'fsync']);
    const guard = armPureGuards();
    let result: NutritionEvalReport | undefined;
    try {
      const ready = await prepare(contextCopy);
      result = ready.reconstruct({ stage: 'preflight', profile: 'LOW', snapshot: snapshotCopy });
    } finally {
      const counts = disarmPureGuards(guard);
      expect(counts.details).toEqual([]);
      expect(counts.fsCalls).toBe(0);
      expect(counts.fetchCalls).toBe(0);
      expect(counts.nowCalls).toBe(0);
    }
    expect(result?.cases).toHaveLength(1);
    expect(sha256(renderNutritionEvalJson(result as NutritionEvalReport))).toBe(table.digests['preflight/LOW']!.jsonSha256);
    expect(clean.effects).toEqual(beforeEffects);
  });

  it('reused sync reconstruct performs zero real fs/network/clock calls', async () => {
    const prepare = await loadPrepare();
    const ready = await prepare(clone(clean.context));
    const firstSnapshot = clone(clean.snapshots.get('validation/MEDIUM')!);
    const secondSnapshot = clone(clean.snapshots.get('validation/MEDIUM')!);
    const beforeEffects = { ...clean.effects };
    const guard = armPureGuards();
    try {
      const first = ready.reconstruct({ stage: 'validation', profile: 'MEDIUM', snapshot: firstSnapshot });
      const second = ready.reconstruct({ stage: 'validation', profile: 'MEDIUM', snapshot: secondSnapshot });
      expect(renderNutritionEvalJson(first)).toBe(renderNutritionEvalJson(second));
      expect(first).not.toBe(second);
    } finally {
      const counts = disarmPureGuards(guard);
      expect(counts.details).toEqual([]);
      expect(counts.fsCalls).toBe(0);
      expect(counts.fetchCalls).toBe(0);
      expect(counts.nowCalls).toBe(0);
    }
    expect(clean.effects).toEqual(beforeEffects);
  });

  it('report schema still accepts historical v1 without new metadata', () => {
    const historical = NutritionEvalReportSchema.parse(JSON.parse(readFileSync(
      resolve(repo, 'functions/test/nutrition-eval/fixtures/historical-report-v1.json'), 'utf8',
    )));
    expect(renderNutritionEvalMarkdown(historical)).not.toContain('latencyMeasuredCases');
  });
});
