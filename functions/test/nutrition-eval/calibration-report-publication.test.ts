import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
  chmodSync, closeSync, fsyncSync, ftruncateSync, linkSync, lstatSync, mkdirSync, mkdtempSync,
  openSync, readFileSync, readdirSync, readlinkSync, renameSync, rmSync, symlinkSync, unlinkSync,
  writeFileSync, writeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  prepareCalibrationBootstrapContext, deriveCanonicalAllowedKeys, deriveCanonicalReportOutcomePlan,
} from '../../src/nutrition-eval/calibration-bootstrap';
import { CALIBRATION_ROOT, createProtocolCalibrationLedger } from '../../src/nutrition-eval/calibration';
import type { CalibrationProfile, StageName } from '../../src/nutrition-eval/calibration';
import { createFileCalibrationLedgerDeps } from '../../src/nutrition-eval/calibration-file-store';
import { captureCalibrationReportPrediction } from '../../src/nutrition-eval/calibration-report-journal';
import { assembleCalibrationStageReport } from '../../src/nutrition-eval/calibration-report-assembly';
import { renderNutritionEvalJson, renderNutritionEvalMarkdown } from '../../src/nutrition-eval/report';
import type { NutritionEvalReport } from '../../src/nutrition-eval/schema';
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';

// Bounded local timeout for disk-contention-sensitive real-fs fixtures; test-file-local only
// (no vitest.config/package.json change), per host-observed 5000ms default-timeout flakiness.
vi.setConfig({ testTimeout: 60000, hookTimeout: 60000 });

/**
 * ESM built-in `fs` exports are non-configurable, so `vi.spyOn(nodeFs, 'readFileSync')` throws
 * "Cannot redefine property". `vi.mock` with `importOriginal` replaces module resolution instead
 * of mutating the frozen namespace, so every other fs call (including the production module's own,
 * once it exists) stays genuinely native; only readFileSync/readSync are wrapped, and only while a
 * single target path is armed for exactly one test.
 */
const fsReadGuard = vi.hoisted(() => ({ armedPath: null as string | null, attempts: 0 }));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const matchesArmedTarget = (value: unknown): boolean => {
    if (fsReadGuard.armedPath === null) return false;
    if (typeof value === 'string' && value === fsReadGuard.armedPath) return true;
    if (typeof value === 'number') {
      try { return actual.readlinkSync(`/proc/self/fd/${value}`) === fsReadGuard.armedPath; } catch { return false; }
    }
    return false;
  };
  return {
    ...actual,
    readFileSync: (...args: Parameters<typeof actual.readFileSync>) => {
      if (matchesArmedTarget(args[0])) { fsReadGuard.attempts++; throw new Error('oversized-read-blocked'); }
      return actual.readFileSync(...args);
    },
    readSync: (...args: Parameters<typeof actual.readSync>) => {
      if (matchesArmedTarget(args[0])) { fsReadGuard.attempts++; throw new Error('oversized-read-blocked'); }
      return actual.readSync(...args);
    },
  };
});
function armOversizedReadGuard(path: string): void { fsReadGuard.armedPath = path; fsReadGuard.attempts = 0; }
function disarmOversizedReadGuard(): { attempts: number } {
  const result = { attempts: fsReadGuard.attempts };
  fsReadGuard.armedPath = null; fsReadGuard.attempts = 0;
  return result;
}

// Local structural types only: the real publication module does not exist yet.
// A dynamic (non-statically-resolved) import below is what must fail, not TS.
interface LocalReceipt {
  readonly stage: StageName;
  readonly profile: CalibrationProfile;
  readonly runId: string;
  readonly jsonSha256: string;
  readonly markdownSha256: string;
}
interface LocalPublicationResult {
  readonly report: NutritionEvalReport;
  readonly receipt: Readonly<LocalReceipt>;
}
interface LocalPublicationOverrides {
  readonly fdWriteSync?: (fd: number, buffer: Buffer, offset: number, length: number) => number;
  readonly fdFsyncSync?: (fd: number) => void;
  readonly fdCloseSync?: (fd: number) => void;
  readonly linkSync?: (from: string, to: string) => void;
  readonly unlinkSync?: (path: string) => void;
  readonly fsyncDirSync?: (dir: string) => void;
}
type PublishFn = (
  params: unknown,
  overrides?: LocalPublicationOverrides,
) => Promise<Readonly<LocalPublicationResult>>;

class PublicationModuleMissingError extends Error {
  constructor(cause: unknown) {
    super('publication-module-missing', cause === undefined ? undefined : { cause });
    this.name = 'PublicationModuleMissingError';
  }
}
const PUBLICATION_MODULE_PATH = '../../src/nutrition-eval/calibration-report-publication';
/** Deliberately-missing-module RED comes from this loader, not from a dedicated canary test. */
async function publisher(): Promise<PublishFn> {
  let module: Record<string, unknown>;
  try {
    module = await import(/* @vite-ignore */ PUBLICATION_MODULE_PATH) as Record<string, unknown>;
  } catch (error) {
    throw new PublicationModuleMissingError(error);
  }
  if (typeof module.publishCalibrationStageReport !== 'function') {
    throw new PublicationModuleMissingError(undefined);
  }
  return module.publishCalibrationStageReport as PublishFn;
}

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function fdPath(fd: number): string {
  try { return readlinkSync(`/proc/self/fd/${fd}`); } catch { return `fd:${fd}`; }
}

/** `injected` is typed unknown (not Error) so a hostile foreign Proxy can be passed without coercion. */
async function expectFreshFatal(promise: Promise<unknown>, code: string, injected?: unknown): Promise<void> {
  let caught: unknown;
  try { await promise; } catch (error) { caught = error; }
  if (injected !== undefined) expect(caught === injected).toBe(false);
  expect(caught).toBeInstanceOf(CalibrationFatalError);
  expect((caught as Error).message).toBe(code);
  expect(Object.prototype.hasOwnProperty.call(caught as object, 'cause')).toBe(false);
}

function assertDeepFrozen(value: unknown, seen: Set<unknown> = new Set()): void {
  if (value === null || typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value as Record<string, unknown>)) assertDeepFrozen(child, seen);
}

/** A hostile foreign exception whose traps must never be invoked by fresh-fatal handling. */
function makeForeignException(): { proxy: object; trapCalls: Record<string, number> } {
  const trapCalls: Record<string, number> = { get: 0, getPrototypeOf: 0, ownKeys: 0, has: 0 };
  const proxy = new Proxy({}, {
    get: (_t, key) => {
      trapCalls.get++;
      if (key === 'message' || key === 'stack') return 'private-leak';
      if (key === 'name') return 'ForeignError';
      return undefined;
    },
    getPrototypeOf: () => { trapCalls.getPrototypeOf++; return Error.prototype; },
    ownKeys: () => { trapCalls.ownKeys++; return ['message', 'stack']; },
    has: () => { trapCalls.has++; return true; },
  });
  return { proxy, trapCalls };
}

function readersFor(dir: string) {
  return {
    baseDir: dir,
    readGitState: () => ({ headCommit: 'a'.repeat(40), implementationCommit: 'b'.repeat(40),
      functionsTreeId: 'c'.repeat(40), dirtyPaths: [] }),
    readCommittedFile: (path: string) => readFileSync(resolve(repo, path), 'utf8'),
    readOwner: () => ({ hostname: 'publication-fixture', bootId: 'publication-boot', pid: 44,
      startTicks: 44, acquiredAt: '2026-10-08T00:00:00.000Z' }),
  };
}

async function buildFixture(profiles: readonly CalibrationProfile[] = ['LOW', 'MEDIUM']) {
  const dir = mkdtempSync(resolve(tmpdir(), 'report-publication-'));
  dirs.push(dir);
  const context = await prepareCalibrationBootstrapContext(readersFor(dir));
  const effects = { append: 0, fsync: 0, clock: 0 };
  const fileDeps = createFileCalibrationLedgerDeps(dir);
  const ledger = createProtocolCalibrationLedger({
    ...fileDeps,
    appendLedgerEvent: (event) => { effects.append++; fileDeps.appendLedgerEvent(event); },
    fsyncLedgerFile: () => { effects.fsync++; fileDeps.fsyncLedgerFile(); },
    fsyncLedgerDir: () => { effects.fsync++; fileDeps.fsyncLedgerDir(); },
    fsyncJournalFile: () => { effects.fsync++; fileDeps.fsyncJournalFile(); },
    fsyncJournalDir: () => { effects.fsync++; fileDeps.fsyncJournalDir(); },
    nowIso: () => { effects.clock++; return fileDeps.nowIso(); },
  }, context.identity, (selected) => deriveCanonicalAllowedKeys(context.files, selected), {
    getReportOutcomePlan: (selected) => deriveCanonicalReportOutcomePlan(context.files, selected),
  });
  ledger.acquireLock(context.owner);
  const token = { kind: 'token_count', stage: 'preflight', caseId: context.firstDevelopmentCaseId,
    model: 'gemini-3.8-flash' } as const;
  ledger.reserveTokenCount(token); ledger.completeTokenCount(token, 42);
  for (const profile of profiles) {
    const key = { stage: 'preflight', profile, caseId: context.firstDevelopmentCaseId, sampleIndex: 1 } as const;
    const prediction = captureCalibrationReportPrediction({ parseStatus: 'success', source: 'meal', kcal: 120,
      proteinG: 10, carbsG: 0, fatG: 8, confidence: 0.8, basis: 'portion', amount: 1, unit: 'portion',
      decision: 'needs_review', reviewReasons: [], latencyMs: 17, sampleIndex: 1, cached: false,
      diagnostics: { rawNutrients: { kcal: 120, proteinG: 10, carbsG: 0, fatG: 8 }, detectedItemCount: 1,
        estimatedTotalMassG: 90, declaredBasis: 'portion', declaredAmount: 1, declaredUnit: 'portion' } });
    const four = { kcal: 120, proteinG: 10, carbsG: 0, fatG: 8 };
    ledger.reserve(key);
    if (profile === 'LOW') ledger.pinModelVersion('gemini-3.8-fixture-pin');
    ledger.complete(key, ledger.appendResultJournal({ key, normalizedPrediction: { ...four, estimatedTotalMassG: 90 },
      predictionHash: sha256(JSON.stringify(four)), analysisLatencyMs: 17, errorCategory: 'none',
      responseModelVersion: 'gemini-3.8-fixture-pin', reportPrediction: prediction }));
  }
  const canonicalDir = resolve(dir, CALIBRATION_ROOT);
  const reportsDir = resolve(canonicalDir, 'reports');
  const jsonPath = (stage: StageName, profile: CalibrationProfile) =>
    resolve(reportsDir, `${stage}-${profile.toLowerCase()}.json`);
  const mdPath = (stage: StageName, profile: CalibrationProfile) =>
    resolve(reportsDir, `${stage}-${profile.toLowerCase()}.md`);
  const request = (profile: CalibrationProfile, stage: StageName = 'preflight') =>
    ({ stage, profile, context, readSnapshot: ledger.getStageReportSnapshot });
  /** Raw bytes only; never routes through fileDeps.readLock/readLedgerEvents (those mkdir/chmod). */
  const ledgerJournalBytes = () => {
    const read = (name: string) => { try { return readFileSync(resolve(canonicalDir, name), 'utf8'); } catch { return undefined; } };
    return { ledger: read('ledger.json'), journal: read('journal.json') };
  };
  return { dir, context, ledger, effects, canonicalDir, reportsDir, jsonPath, mdPath, request, ledgerJournalBytes };
}

describe('calibration stage report publication (Task 1, tests-only)', () => {
  describe('success: exact bytes, hashes, and deep freeze', () => {
    it.each(['LOW', 'MEDIUM'] as const)(
      'publishes preflight/%s bytes matching the assembler exactly, with a fully frozen result', async (profile) => {
        const fx = await buildFixture();
        const expected = await assembleCalibrationStageReport(fx.request(profile));
        const publish = await publisher();
        const result = await publish(fx.request(profile));
        expect(readFileSync(fx.jsonPath('preflight', profile), 'utf8')).toBe(renderNutritionEvalJson(expected));
        expect(readFileSync(fx.mdPath('preflight', profile), 'utf8')).toBe(renderNutritionEvalMarkdown(expected));
        expect(result.receipt).toEqual({ stage: 'preflight', profile, runId: expected.runId,
          jsonSha256: sha256(renderNutritionEvalJson(expected)), markdownSha256: sha256(renderNutritionEvalMarkdown(expected)) });
        assertDeepFrozen(result);
      });
    it('publishes LOW and MEDIUM to distinct fixed lowercase paths without collision', async () => {
      const fx = await buildFixture();
      const publish = await publisher();
      const low = await publish(fx.request('LOW'));
      const medium = await publish(fx.request('MEDIUM'));
      expect(fx.jsonPath('preflight', 'LOW')).not.toBe(fx.jsonPath('preflight', 'MEDIUM'));
      expect(JSON.parse(readFileSync(fx.jsonPath('preflight', 'LOW'), 'utf8')).calibration.thinkingLevel).toBe('LOW');
      expect(JSON.parse(readFileSync(fx.jsonPath('preflight', 'MEDIUM'), 'utf8')).calibration.thinkingLevel).toBe('MEDIUM');
      expect(low.receipt.profile).toBe('LOW'); expect(medium.receipt.profile).toBe('MEDIUM');
      expect(low.receipt.jsonSha256).not.toBe(medium.receipt.jsonSha256);
    });
    it('creates the private reports directory at mode 0700 and artifacts at mode 0600', async () => {
      const fx = await buildFixture();
      const publish = await publisher();
      await publish(fx.request('LOW'));
      expect(lstatSync(fx.reportsDir).mode & 0o777).toBe(0o700);
      expect(lstatSync(fx.jsonPath('preflight', 'LOW')).mode & 0o777).toBe(0o600);
      expect(lstatSync(fx.mdPath('preflight', 'LOW')).mode & 0o777).toBe(0o600);
    });
    it('propagates the assembler\'s own incomplete-stage error unchanged for an unfinished profile', async () => {
      const fx = await buildFixture(['LOW']);
      const publish = await publisher();
      await expect(publish(fx.request('MEDIUM'))).rejects.toThrow('calibration:stage-report-incomplete');
    });
    it('never deletes existing matching artifacts from an unrelated profile when another publish call fails', async () => {
      const fx = await buildFixture();
      const publish = await publisher();
      const low = await publish(fx.request('LOW'));
      const lowJsonBytes = readFileSync(fx.jsonPath('preflight', 'LOW'), 'utf8');
      await expect(publish(fx.request('MEDIUM'), { fdFsyncSync: () => { throw new Error('injected'); } })).rejects.toThrow();
      expect(readFileSync(fx.jsonPath('preflight', 'LOW'), 'utf8')).toBe(lowJsonBytes);
      expect(low.receipt.profile).toBe('LOW');
    });
  });

  describe('ledger and snapshot non-mutation', () => {
    it('invokes the snapshot callback exactly once per publish call', async () => {
      const fx = await buildFixture();
      const read = vi.fn(fx.ledger.getStageReportSnapshot);
      const publish = await publisher();
      await publish({ ...fx.request('LOW'), readSnapshot: read });
      expect(read).toHaveBeenCalledTimes(1);
    });
    it('leaves ledger/journal bytes and effect counters byte-identical on success, with no release', async () => {
      const fx = await buildFixture();
      const before = { effects: { ...fx.effects }, files: fx.ledgerJournalBytes() };
      const publish = await publisher();
      await publish(fx.request('LOW'));
      expect(fx.effects).toEqual(before.effects);
      expect(fx.ledgerJournalBytes()).toEqual(before.files);
    });
    it('leaves ledger/journal bytes and effect counters byte-identical on failure, with no release', async () => {
      const fx = await buildFixture();
      const before = { effects: { ...fx.effects }, files: fx.ledgerJournalBytes() };
      const publish = await publisher();
      await expect(publish(fx.request('LOW'), { fdFsyncSync: () => { throw new Error('injected'); } }))
        .rejects.toThrow();
      expect(fx.effects).toEqual(before.effects);
      expect(fx.ledgerJournalBytes()).toEqual(before.files);
    });
  });

  describe('captured input and proxy privacy', () => {
    it.each([
      'context-accessor', 'context-hidden', 'context-symbol', 'context-prototype', 'context-extra',
      'owner-accessor', 'owner-hidden', 'owner-symbol', 'owner-prototype', 'owner-extra',
      'readSnapshot-accessor', 'top-hidden', 'top-symbol', 'top-prototype', 'top-extra',
    ] as const)('rejects hostile %s shapes without getters, reads, or ledger effects', async (kind) => {
      const fx = await buildFixture();
      const before = { ...fx.effects };
      const read = vi.fn(fx.ledger.getStageReportSnapshot);
      const getter = vi.fn();
      const context: Record<string | symbol, unknown> = { ...fx.context, owner: { ...fx.context.owner } };
      const request: Record<string | symbol, unknown> = { stage: 'preflight', profile: 'LOW', context, readSnapshot: read };
      const owner = context.owner as Record<string | symbol, unknown>;
      if (kind === 'context-accessor') Object.defineProperty(context, 'baseDir', { enumerable: true, get: getter });
      if (kind === 'context-hidden') Object.defineProperty(context, 'secret', { value: 'private', enumerable: false });
      if (kind === 'context-symbol') context[Symbol('extra')] = 'private';
      if (kind === 'context-prototype') Object.setPrototypeOf(context, { hidden: true });
      if (kind === 'context-extra') context.extraField = 'unexpected';
      if (kind === 'owner-accessor') Object.defineProperty(owner, 'pid', { enumerable: true, get: getter });
      if (kind === 'owner-hidden') Object.defineProperty(owner, 'secret', { value: 'private', enumerable: false });
      if (kind === 'owner-symbol') owner[Symbol('extra')] = 'private';
      if (kind === 'owner-prototype') Object.setPrototypeOf(owner, { hidden: true });
      if (kind === 'owner-extra') owner.extraField = 'unexpected';
      if (kind === 'readSnapshot-accessor') Object.defineProperty(request, 'readSnapshot', { enumerable: true, get: getter });
      if (kind === 'top-hidden') Object.defineProperty(request, 'secret', { value: 'private', enumerable: false });
      if (kind === 'top-symbol') request[Symbol('extra')] = 'private';
      if (kind === 'top-prototype') Object.setPrototypeOf(request, { hidden: true });
      if (kind === 'top-extra') request.path = '/tmp/evil.json';
      const publish = await publisher();
      await expect(publish(request)).rejects.toThrow('calibration:report-publication-input-invalid');
      expect(getter).not.toHaveBeenCalled();
      expect(read).not.toHaveBeenCalled();
      expect(fx.effects).toEqual(before);
    });
    it.each(['report', 'receipt', 'jsonSha256', 'markdownSha256', 'path', 'jsonPath', 'markdownPath'])(
      'rejects a caller-supplied %s override before any snapshot read', async (field) => {
        const fx = await buildFixture();
        const publish = await publisher();
        const read = vi.fn(fx.ledger.getStageReportSnapshot);
        await expect(publish({ ...fx.request('LOW'), readSnapshot: read, [field]: 'override' }))
          .rejects.toThrow('calibration:report-publication-input-invalid');
        expect(read).not.toHaveBeenCalled();
      });
    it('accepts honest get-trap proxies around params/context/files/identity/owner with zero Get calls', async () => {
      const fx = await buildFixture();
      const publish = await publisher();
      let gets = 0;
      const wrap = <T extends object>(value: T): T => new Proxy(value, {
        get: (target, key, receiver) => { gets++; return Reflect.get(target, key, receiver); },
      });
      const context = wrap({ ...fx.context, files: wrap({ ...fx.context.files }),
        identity: wrap({ ...fx.context.identity }), owner: wrap({ ...fx.context.owner }),
        report: wrap({ ...fx.context.report }) });
      const result = await publish(wrap({ stage: 'preflight', profile: 'LOW', context,
        readSnapshot: fx.ledger.getStageReportSnapshot }));
      expect(result.receipt.profile).toBe('LOW');
      expect(gets).toBe(0);
    });
    it('replaces a foreign ownKeys failure with a fresh causeless fatal without inspecting it', async () => {
      const fx = await buildFixture();
      const publish = await publisher();
      const { proxy: foreign, trapCalls } = makeForeignException();
      const request = new Proxy({ stage: 'preflight', profile: 'LOW', context: fx.context,
        readSnapshot: fx.ledger.getStageReportSnapshot }, { ownKeys: () => { throw foreign; } });
      await expectFreshFatal(publish(request), 'calibration:report-publication-input-invalid', foreign);
      expect(trapCalls.get).toBe(0);
      expect(trapCalls.getPrototypeOf).toBe(0);
    });
    it('captures owner, baseDir, files, identity, and callback before the first await; every post-dispatch mutation is ignored', async () => {
      const fx = await buildFixture();
      const expected = await assembleCalibrationStageReport(fx.request('LOW'));
      const originalReadSnapshot = fx.ledger.getStageReportSnapshot;
      let originalCalls = 0;
      const trackedOriginal: typeof originalReadSnapshot = (...args) => { originalCalls++; return originalReadSnapshot(...args); };
      const forbiddenReplacement = vi.fn(() => { throw new Error('forbidden-replacement-must-not-be-called'); });
      const redirectDir = resolve(fx.dir, 'redirect-target-in-own-fixture');
      mkdirSync(redirectDir, { recursive: true });
      const mutableFiles = { ...fx.context.files };
      const mutableIdentity = { ...fx.context.identity };
      const mutableOwner = { ...fx.context.owner };
      const context: Record<string, unknown> = { ...fx.context, owner: mutableOwner, files: mutableFiles, identity: mutableIdentity };
      const request: { stage: 'preflight'; profile: 'LOW'; context: typeof context; readSnapshot: typeof trackedOriginal } = {
        stage: 'preflight', profile: 'LOW', context, readSnapshot: trackedOriginal,
      };
      const publish = await publisher();
      const promise = publish(request);
      // Mutate everything reachable, synchronously, before the first internal await settles.
      request.readSnapshot = forbiddenReplacement as unknown as typeof trackedOriginal;
      mutableFiles['calibration-manifest'] = 'mutated-after-dispatch';
      mutableIdentity.implementationCommit = 'd'.repeat(40);
      context.firstDevelopmentCaseId = 'mutated-case-id';
      mutableOwner.hostname = 'mutated-after-dispatch';
      context.baseDir = redirectDir;
      const result = await promise;
      expect(result.receipt).toEqual({ stage: 'preflight', profile: 'LOW', runId: expected.runId,
        jsonSha256: sha256(renderNutritionEvalJson(expected)), markdownSha256: sha256(renderNutritionEvalMarkdown(expected)) });
      expect(readFileSync(fx.jsonPath('preflight', 'LOW'), 'utf8')).toBe(renderNutritionEvalJson(expected));
      expect(readFileSync(fx.mdPath('preflight', 'LOW'), 'utf8')).toBe(renderNutritionEvalMarkdown(expected));
      expect(originalCalls).toBe(1);
      expect(forbiddenReplacement).not.toHaveBeenCalled();
      expect(readdirSync(redirectDir)).toEqual([]);
      const lockRaw = JSON.parse(readFileSync(resolve(fx.canonicalDir, 'lock.json'), 'utf8'));
      expect(lockRaw.hostname).toBe('publication-fixture');
    });
  });

  describe('override-object validation', () => {
    it.each(['unknown-field', 'hidden', 'symbol', 'prototype', 'accessor', 'nonfunction'] as const)(
      'rejects a hostile overrides object (%s) before any snapshot read or fs effect', async (kind) => {
        const fx = await buildFixture();
        const read = vi.fn(fx.ledger.getStageReportSnapshot);
        const getter = vi.fn();
        const overrides: Record<string | symbol, unknown> = {};
        if (kind === 'unknown-field') overrides.unexpectedHook = () => {};
        if (kind === 'hidden') Object.defineProperty(overrides, 'secret', { value: 'private', enumerable: false });
        if (kind === 'symbol') overrides[Symbol('extra')] = 'private';
        if (kind === 'prototype') Object.setPrototypeOf(overrides, { hidden: true });
        if (kind === 'accessor') Object.defineProperty(overrides, 'fdWriteSync', { enumerable: true, get: getter });
        if (kind === 'nonfunction') overrides.fdWriteSync = 'not-a-function';
        const publish = await publisher();
        const hostileOverrides = overrides as unknown as LocalPublicationOverrides;
        await expect(publish({ ...fx.request('LOW'), readSnapshot: read }, hostileOverrides))
          .rejects.toThrow('calibration:report-publication-input-invalid');
        expect(read).not.toHaveBeenCalled();
        expect(getter).not.toHaveBeenCalled();
      });
    it('captures override hooks once before the first await; post-dispatch hook swap has no effect', async () => {
      const fx = await buildFixture();
      const calls: string[] = [];
      const overrides: LocalPublicationOverrides = { fdWriteSync: (fd, buffer, offset, length) => {
        calls.push('original'); return writeSync(fd, buffer, offset, length);
      } };
      const publish = await publisher();
      const promise = publish(fx.request('LOW'), overrides);
      (overrides as { fdWriteSync: unknown }).fdWriteSync = () => { calls.push('swapped'); throw new Error('must-not-be-used'); };
      const result = await promise;
      expect(result.receipt.profile).toBe('LOW');
      expect(calls.length).toBeGreaterThan(0);
      expect(calls.every((call) => call === 'original')).toBe(true);
    });
  });

  describe('canonical path integrity: missing root, wrong modes, symlinked components', () => {
    it('rejects publication when no lock has ever been acquired, never creating the root', async () => {
      const dir = mkdtempSync(resolve(tmpdir(), 'report-publication-nolock-'));
      dirs.push(dir);
      const context = await prepareCalibrationBootstrapContext(readersFor(dir));
      const read = vi.fn();
      const publish = await publisher();
      await expect(publish({ stage: 'preflight', profile: 'LOW', context, readSnapshot: read }))
        .rejects.toThrow('calibration:report-publication-lock-invalid');
      expect(read).not.toHaveBeenCalled();
      expect(() => lstatSync(resolve(dir, CALIBRATION_ROOT))).toThrow();
    });
    it('rejects when baseDir itself is a symlink, without following it', async () => {
      const realBase = mkdtempSync(resolve(tmpdir(), 'report-publication-realbase-'));
      dirs.push(realBase);
      const symlinkBase = resolve(tmpdir(), `report-publication-symlink-base-${process.pid}-${Date.now()}`);
      symlinkSync(realBase, symlinkBase);
      try {
        const context = await prepareCalibrationBootstrapContext(readersFor(symlinkBase));
        const read = vi.fn();
        const publish = await publisher();
        await expect(publish({ stage: 'preflight', profile: 'LOW', context, readSnapshot: read })).rejects.toThrow();
        expect(read).not.toHaveBeenCalled();
      } finally {
        unlinkSync(symlinkBase);
      }
    });
    it('rejects when the fixture-owned canonical directory is removed, without recreating it', async () => {
      const fx = await buildFixture();
      const snapshot = fx.ledger.getStageReportSnapshot('preflight', 'LOW');
      const read = vi.fn(() => snapshot);
      rmSync(fx.canonicalDir, { recursive: true, force: true });
      const publish = await publisher();
      await expect(publish({ ...fx.request('LOW'), readSnapshot: read }))
        .rejects.toThrow('calibration:report-publication-lock-invalid');
      expect(() => lstatSync(fx.canonicalDir)).toThrow();
    });
    it('preserves an unusual 0755 base directory mode across both success and failure', async () => {
      const fx = await buildFixture();
      chmodSync(fx.dir, 0o755);
      const publish = await publisher();
      await publish(fx.request('LOW'));
      expect(lstatSync(fx.dir).mode & 0o777).toBe(0o755);
      await expect(publish(fx.request('MEDIUM'), { fdFsyncSync: () => { throw new Error('injected'); } }))
        .rejects.toThrow();
      expect(lstatSync(fx.dir).mode & 0o777).toBe(0o755);
    });
    it('rejects when the canonical root has an unexpected mode, without repairing it', async () => {
      const fx = await buildFixture();
      chmodSync(fx.canonicalDir, 0o755);
      const publish = await publisher();
      await expect(publish(fx.request('LOW'))).rejects.toThrow();
      expect(lstatSync(fx.canonicalDir).mode & 0o777).toBe(0o755);
    });
    it('rejects when a pre-existing reports directory has an unexpected mode, without repairing it', async () => {
      const fx = await buildFixture();
      mkdirSync(fx.reportsDir, { mode: 0o755 });
      const publish = await publisher();
      await expect(publish(fx.request('LOW'))).rejects.toThrow();
      expect(lstatSync(fx.reportsDir).mode & 0o777).toBe(0o755);
    });
    it.each(['intermediate-symlink', 'intermediate-nondirectory', 'root-symlink'] as const)(
      'rejects a %s in the canonical path chain without touching the external target', async (kind) => {
        const fx = await buildFixture();
        const elsewhere = resolve(fx.dir, 'elsewhere-target');
        mkdirSync(elsewhere, { recursive: true });
        writeFileSync(resolve(elsewhere, 'sentinel.txt'), 'sentinel-content', { mode: 0o600 });
        const segments = CALIBRATION_ROOT.split('/').filter((part) => part.length > 0);
        const firstSegment = resolve(fx.dir, segments[0]!);
        if (kind === 'intermediate-symlink') {
          rmSync(firstSegment, { recursive: true, force: true });
          symlinkSync(elsewhere, firstSegment);
        } else if (kind === 'intermediate-nondirectory') {
          rmSync(firstSegment, { recursive: true, force: true });
          writeFileSync(firstSegment, 'not-a-directory');
        } else {
          rmSync(fx.canonicalDir, { recursive: true, force: true });
          symlinkSync(elsewhere, fx.canonicalDir);
        }
        const publish = await publisher();
        await expect(publish(fx.request('LOW'))).rejects.toThrow();
        expect(readFileSync(resolve(elsewhere, 'sentinel.txt'), 'utf8')).toBe('sentinel-content');
        expect(readdirSync(elsewhere)).toEqual(['sentinel.txt']);
      });
  });

  describe('exact permission-bit checks including special bits', () => {
    it('rejects a canonical root carrying the sticky bit even though base bits are 0700', async () => {
      const fx = await buildFixture();
      chmodSync(fx.canonicalDir, 0o1700);
      const publish = await publisher();
      await expect(publish(fx.request('LOW'))).rejects.toThrow();
      expect(lstatSync(fx.canonicalDir).mode & 0o7777).toBe(0o1700);
    });
    it('rejects a pre-existing reports directory carrying the sticky bit even though base bits are 0700', async () => {
      const fx = await buildFixture();
      mkdirSync(fx.reportsDir, { mode: 0o700 });
      chmodSync(fx.reportsDir, 0o1700);
      const publish = await publisher();
      await expect(publish(fx.request('LOW'))).rejects.toThrow();
      expect(lstatSync(fx.reportsDir).mode & 0o7777).toBe(0o1700);
    });
    it('rejects an existing matching-bytes json artifact carrying setuid even though base bits are 0600', async () => {
      const fx = await buildFixture();
      const expected = await assembleCalibrationStageReport(fx.request('LOW'));
      mkdirSync(fx.reportsDir, { recursive: true, mode: 0o700 });
      const target = fx.jsonPath('preflight', 'LOW');
      writeFileSync(target, renderNutritionEvalJson(expected));
      chmodSync(target, 0o4600);
      const publish = await publisher();
      await expect(publish(fx.request('LOW'))).rejects.toThrow('calibration:report-file-tampered');
      expect(lstatSync(target).mode & 0o7777).toBe(0o4600);
    });
    it('rejects a lock carrying setuid even though base bits are 0600', async () => {
      const fx = await buildFixture();
      const lockPath = resolve(fx.canonicalDir, 'lock.json');
      chmodSync(lockPath, 0o4600);
      const publish = await publisher();
      await expectFreshFatal(publish(fx.request('LOW')), 'calibration:report-publication-lock-invalid');
      expect(lstatSync(lockPath).mode & 0o7777).toBe(0o4600);
    });
  });

  describe('lock continuity, modes, and size bounds', () => {
    it('rejects when the lock is removed before publication', async () => {
      const fx = await buildFixture();
      unlinkSync(resolve(fx.canonicalDir, 'lock.json'));
      const publish = await publisher();
      await expectFreshFatal(publish(fx.request('LOW')), 'calibration:report-publication-lock-invalid');
    });
    it('rejects when the on-disk lock owner differs from the context owner', async () => {
      const fx = await buildFixture();
      const lockPath = resolve(fx.canonicalDir, 'lock.json');
      const foreign = { ...fx.context.owner, pid: fx.context.owner.pid + 1 };
      writeFileSync(lockPath, JSON.stringify(foreign));
      const publish = await publisher();
      await expectFreshFatal(publish(fx.request('LOW')), 'calibration:report-publication-lock-invalid');
    });
    it.each([
      'oversized', 'malformed-json', 'extra-field', 'wrong-mode', 'symlink', 'hardlink', 'nonregular-directory',
    ] as const)('rejects a %s lock before publication, never touching an unrelated sentinel', async (kind) => {
      const fx = await buildFixture();
      const lockPath = resolve(fx.canonicalDir, 'lock.json');
      const sentinel = resolve(fx.dir, 'lock-sentinel.json');
      const sentinelBytes = JSON.stringify(fx.context.owner);
      writeFileSync(sentinel, sentinelBytes, { mode: 0o600 });
      if (kind === 'oversized') {
        writeFileSync(lockPath, JSON.stringify({ ...fx.context.owner, acquiredAt: fx.context.owner.acquiredAt + 'x'.repeat(5000) }));
      } else if (kind === 'malformed-json') {
        writeFileSync(lockPath, '{not-json');
      } else if (kind === 'extra-field') {
        writeFileSync(lockPath, JSON.stringify({ ...fx.context.owner, extra: 'unexpected' }));
      } else if (kind === 'wrong-mode') {
        writeFileSync(lockPath, JSON.stringify(fx.context.owner));
        chmodSync(lockPath, 0o644);
      } else if (kind === 'symlink') {
        unlinkSync(lockPath); symlinkSync(sentinel, lockPath);
      } else if (kind === 'hardlink') {
        unlinkSync(lockPath); linkSync(sentinel, lockPath);
      } else {
        unlinkSync(lockPath); mkdirSync(lockPath);
      }
      const publish = await publisher();
      if (kind === 'oversized') armOversizedReadGuard(lockPath);
      try {
        await expectFreshFatal(publish(fx.request('LOW')), 'calibration:report-publication-lock-invalid');
      } finally {
        if (kind === 'oversized') expect(disarmOversizedReadGuard().attempts).toBe(0);
      }
      expect(readFileSync(sentinel, 'utf8')).toBe(sentinelBytes);
    });
    it('rejects identical-byte lock replacement mid-publication via dev/ino drift (inode-reuse-safe)', async () => {
      const fx = await buildFixture();
      const lockPath = resolve(fx.canonicalDir, 'lock.json');
      const backupPath = resolve(fx.canonicalDir, 'lock.original-backup.json');
      const originalBytes = readFileSync(lockPath, 'utf8');
      const originalIno = lstatSync(lockPath).ino;
      let swapped = false;
      let newIno = -1;
      const publish = await publisher();
      await expectFreshFatal(publish(fx.request('LOW'), {
        fdFsyncSync: (fd: number) => {
          if (!swapped) {
            swapped = true;
            renameSync(lockPath, backupPath);
            writeFileSync(lockPath, originalBytes, { mode: 0o600 });
            newIno = lstatSync(lockPath).ino;
          }
          fsyncSync(fd);
        },
      }), 'calibration:report-publication-lock-invalid');
      expect(swapped).toBe(true);
      expect(newIno).not.toBe(-1);
      expect(newIno).not.toBe(originalIno);
    });
    it('rejects when the lock disappears mid-publication', async () => {
      const fx = await buildFixture();
      const lockPath = resolve(fx.canonicalDir, 'lock.json');
      let removed = false;
      const publish = await publisher();
      await expectFreshFatal(publish(fx.request('LOW'), {
        fdFsyncSync: (fd: number) => {
          if (!removed) { removed = true; unlinkSync(lockPath); }
          fsyncSync(fd);
        },
      }), 'calibration:report-publication-lock-invalid');
      expect(removed).toBe(true);
    });
  });

  describe('conflicting existing artifacts: exact bytes, modes, symlink/hardlink, oversized', () => {
    it.each(['json', 'md'] as const)(
      'rejects a conflicting existing %s with wrong bytes, leaving it byte/inode/mode unchanged', async (doc) => {
        const fx = await buildFixture();
        mkdirSync(fx.reportsDir, { recursive: true, mode: 0o700 });
        const target = doc === 'json' ? fx.jsonPath('preflight', 'LOW') : fx.mdPath('preflight', 'LOW');
        writeFileSync(target, 'tampered-content', { mode: 0o600 });
        const before = { bytes: readFileSync(target, 'utf8'), ino: lstatSync(target).ino, mode: lstatSync(target).mode & 0o777 };
        const publish = await publisher();
        await expectFreshFatal(publish(fx.request('LOW')), 'calibration:report-file-tampered');
        expect(readFileSync(target, 'utf8')).toBe(before.bytes);
        expect(lstatSync(target).ino).toBe(before.ino);
        expect(lstatSync(target).mode & 0o777).toBe(before.mode);
      });
    it.each(['json', 'md'] as const)(
      'rejects an existing %s with matching bytes but an unexpected mode, without repairing it', async (doc) => {
        const fx = await buildFixture();
        const expected = await assembleCalibrationStageReport(fx.request('LOW'));
        mkdirSync(fx.reportsDir, { recursive: true, mode: 0o700 });
        const target = doc === 'json' ? fx.jsonPath('preflight', 'LOW') : fx.mdPath('preflight', 'LOW');
        const text = doc === 'json' ? renderNutritionEvalJson(expected) : renderNutritionEvalMarkdown(expected);
        writeFileSync(target, text);
        chmodSync(target, 0o644);
        const publish = await publisher();
        await expect(publish(fx.request('LOW'))).rejects.toThrow('calibration:report-file-tampered');
        expect(lstatSync(target).mode & 0o777).toBe(0o644);
      });
    it.each(['json', 'md'] as const)(
      'rejects a symlinked existing %s without following or removing it', async (doc) => {
        const fx = await buildFixture();
        mkdirSync(fx.reportsDir, { recursive: true, mode: 0o700 });
        const target = doc === 'json' ? fx.jsonPath('preflight', 'LOW') : fx.mdPath('preflight', 'LOW');
        const sentinel = resolve(fx.dir, `sentinel.${doc}`);
        writeFileSync(sentinel, 'sentinel-content', { mode: 0o600 });
        symlinkSync(sentinel, target);
        const publish = await publisher();
        await expectFreshFatal(publish(fx.request('LOW')), 'calibration:report-file-tampered');
        expect(readFileSync(sentinel, 'utf8')).toBe('sentinel-content');
        expect(lstatSync(target).isSymbolicLink()).toBe(true);
      });
    it.each(['json', 'md'] as const)(
      'rejects a hardlinked existing %s without touching the external sentinel', async (doc) => {
        const fx = await buildFixture();
        mkdirSync(fx.reportsDir, { recursive: true, mode: 0o700 });
        const target = doc === 'json' ? fx.jsonPath('preflight', 'LOW') : fx.mdPath('preflight', 'LOW');
        const sentinel = resolve(fx.dir, `sentinel-hardlink.${doc}`);
        writeFileSync(sentinel, 'sentinel-content', { mode: 0o600 });
        linkSync(sentinel, target);
        const publish = await publisher();
        await expectFreshFatal(publish(fx.request('LOW')), 'calibration:report-file-tampered');
        expect(readFileSync(sentinel, 'utf8')).toBe('sentinel-content');
        expect(lstatSync(sentinel).nlink).toBe(2);
      });
    it.each(['json', 'md'] as const)(
      'rejects a non-regular existing %s target (a directory) without removing it', async (doc) => {
        const fx = await buildFixture();
        mkdirSync(fx.reportsDir, { recursive: true, mode: 0o700 });
        const target = doc === 'json' ? fx.jsonPath('preflight', 'LOW') : fx.mdPath('preflight', 'LOW');
        mkdirSync(target);
        const publish = await publisher();
        await expectFreshFatal(publish(fx.request('LOW')), 'calibration:report-file-tampered');
        expect(lstatSync(target).isDirectory()).toBe(true);
      });
    it('rejects a symlinked reports directory without traversing into it', async () => {
      const fx = await buildFixture();
      const elsewhere = resolve(fx.dir, 'elsewhere-reports');
      mkdirSync(elsewhere, { mode: 0o700 });
      symlinkSync(elsewhere, fx.reportsDir);
      const publish = await publisher();
      await expect(publish(fx.request('LOW'))).rejects.toThrow();
      expect(readdirSync(elsewhere)).toEqual([]);
    });
    it('rejects an oversized sparse existing json artifact before reading its full content, with zero native reads of it', async () => {
      const fx = await buildFixture();
      mkdirSync(fx.reportsDir, { recursive: true, mode: 0o700 });
      const target = fx.jsonPath('preflight', 'LOW');
      const expected = await assembleCalibrationStageReport(fx.request('LOW'));
      const expectedSize = Buffer.byteLength(renderNutritionEvalJson(expected), 'utf8');
      const createFd = openSync(target, 'w', 0o600);
      ftruncateSync(createFd, 64 * 1024 * 1024);
      closeSync(createFd);
      expect(lstatSync(target).size).toBeGreaterThan(expectedSize);
      const publish = await publisher();
      const allocSpy = vi.spyOn(Buffer, 'alloc');
      const allocUnsafeSpy = vi.spyOn(Buffer, 'allocUnsafe');
      armOversizedReadGuard(target);
      try {
        await expect(publish(fx.request('LOW'))).rejects.toThrow('calibration:report-file-tampered');
      } finally {
        const { attempts } = disarmOversizedReadGuard();
        const largeAllocations = [...allocSpy.mock.calls, ...allocUnsafeSpy.mock.calls]
          .filter(([size]) => typeof size === 'number' && size > 10 * 1024 * 1024);
        allocSpy.mockRestore(); allocUnsafeSpy.mockRestore();
        expect(attempts).toBe(0);
        expect(largeAllocations).toHaveLength(0);
      }
    });
  });

  describe('low-level fault ordering and retry', () => {
    it('writes the complete exact output even when fdWriteSync caps each call at 3 bytes', async () => {
      const fx = await buildFixture();
      const expected = await assembleCalibrationStageReport(fx.request('LOW'));
      let calls = 0;
      const publish = await publisher();
      await publish(fx.request('LOW'), {
        fdWriteSync: (fd, buffer, offset, length) => {
          calls++;
          return writeSync(fd, buffer, offset, Math.min(3, length));
        },
      });
      expect(calls).toBeGreaterThan(1);
      expect(readFileSync(fx.jsonPath('preflight', 'LOW'), 'utf8')).toBe(renderNutritionEvalJson(expected));
      expect(readFileSync(fx.mdPath('preflight', 'LOW'), 'utf8')).toBe(renderNutritionEvalMarkdown(expected));
    });
    it.each([0, -1, Number.NaN, 1.5, 999999])('rejects an invalid fdWriteSync byte count: %s', async (count) => {
      const fx = await buildFixture();
      const publish = await publisher();
      await expectFreshFatal(publish(fx.request('LOW'), { fdWriteSync: () => count }), 'calibration:report-publication-failed');
      expect(() => readFileSync(fx.jsonPath('preflight', 'LOW'), 'utf8')).toThrow();
    });
    it('fails closed and keeps the lock held when fdFsyncSync always throws, sweeping only its own temp', async () => {
      const fx = await buildFixture();
      const publish = await publisher();
      const injected = new Error('injected-fsync');
      await expectFreshFatal(publish(fx.request('LOW'), { fdFsyncSync: () => { throw injected; } }),
        'calibration:report-publication-failed', injected);
      expect(JSON.parse(readFileSync(resolve(fx.canonicalDir, 'lock.json'), 'utf8'))).toEqual(fx.context.owner);
      expect(() => readFileSync(fx.jsonPath('preflight', 'LOW'), 'utf8')).toThrow();
      let reportsDirExists = true;
      try { lstatSync(fx.reportsDir); } catch { reportsDirExists = false; }
      if (reportsDirExists) {
        expect(readdirSync(fx.reportsDir).some((name) => name.includes('.tmp.'))).toBe(false);
      }
    });
    it('fails closed when fdCloseSync throws, after genuinely closing the fd to avoid leaking it', async () => {
      const fx = await buildFixture();
      const publish = await publisher();
      const injected = new Error('injected-close');
      await expectFreshFatal(publish(fx.request('LOW'), {
        fdCloseSync: (fd: number) => { closeSync(fd); throw injected; },
      }), 'calibration:report-publication-failed', injected);
      expect(() => readFileSync(fx.jsonPath('preflight', 'LOW'), 'utf8')).toThrow();
    });
    it.each(['fdWriteSync', 'fdFsyncSync', 'fdCloseSync', 'linkSync', 'unlinkSync', 'fsyncDirSync'] as const)(
      'wraps a foreign thrown exception from %s into a fresh causeless fatal, never inspecting its traps', async (hook) => {
        const fx = await buildFixture();
        const { proxy: foreign, trapCalls } = makeForeignException();
        const publish = await publisher();
        const expected = await assembleCalibrationStageReport(fx.request('LOW'));
        const overrides: Record<string, unknown> = {
          [hook]: hook === 'fdCloseSync'
            ? (fd: number) => { closeSync(fd); throw foreign; }
            : () => { throw foreign; },
        };
        await expectFreshFatal(publish(fx.request('LOW'), overrides as LocalPublicationOverrides),
          'calibration:report-publication-failed', foreign);
        expect(trapCalls.get).toBe(0);
        expect(trapCalls.getPrototypeOf).toBe(0);
        expect(trapCalls.ownKeys).toBe(0);
        expect(trapCalls.has).toBe(0);
        const jsonPath = fx.jsonPath('preflight', 'LOW');
        const mdPath = fx.mdPath('preflight', 'LOW');
        const retained = new Map<string, { bytes: string; ino: number }>();
        for (const [path, bytes] of [[jsonPath, renderNutritionEvalJson(expected)],
          [mdPath, renderNutritionEvalMarkdown(expected)]] as const) {
          if (readdirSync(fx.reportsDir).includes(path === jsonPath ? 'preflight-low.json' : 'preflight-low.md')) {
            expect(readFileSync(path, 'utf8')).toBe(bytes);
            retained.set(path, { bytes, ino: lstatSync(path).ino });
          }
        }
        // A temp-unlink fault occurs after the successful final JSON link.
        if (hook === 'unlinkSync') expect(retained.has(jsonPath)).toBe(true);
        expect(JSON.parse(readFileSync(resolve(fx.canonicalDir, 'lock.json'), 'utf8'))).toEqual(fx.context.owner);
        await publish(fx.request('LOW'));
        for (const [path, before] of retained) {
          expect(readFileSync(path, 'utf8')).toBe(before.bytes);
          expect(lstatSync(path).ino).toBe(before.ino);
        }
        expect(readFileSync(jsonPath, 'utf8')).toBe(renderNutritionEvalJson(expected));
        expect(readFileSync(mdPath, 'utf8')).toBe(renderNutritionEvalMarkdown(expected));
      });
    it('never sweeps a foreign temp-like sentinel file during failure cleanup', async () => {
      const fx = await buildFixture();
      mkdirSync(fx.reportsDir, { recursive: true, mode: 0o700 });
      const foreignTemp = resolve(fx.reportsDir, 'preflight-low.json.tmp.foreign.999');
      writeFileSync(foreignTemp, 'foreign-temp-content', { mode: 0o600 });
      const publish = await publisher();
      await expect(publish(fx.request('LOW'), { fdFsyncSync: () => { throw new Error('injected'); } }))
        .rejects.toThrow();
      expect(readFileSync(foreignTemp, 'utf8')).toBe('foreign-temp-content');
    });
    it('fails closed when the final directory fsync throws after both artifacts already exist, and retry succeeds', async () => {
      const fx = await buildFixture();
      const publish = await publisher();
      const jsonPath = fx.jsonPath('preflight', 'LOW');
      const mdPath = fx.mdPath('preflight', 'LOW');
      const bothPresent = () => {
        try { readFileSync(jsonPath); readFileSync(mdPath); return true; } catch { return false; }
      };
      const injected = new Error('injected-final-dirfsync');
      await expectFreshFatal(publish(fx.request('LOW'), {
        fsyncDirSync: (dir: string) => {
          if (bothPresent()) throw injected;
          const fd = openSync(dir, 'r');
          try { fsyncSync(fd); } finally { closeSync(fd); }
        },
      }), 'calibration:report-publication-failed', injected);
      expect(bothPresent()).toBe(true);
      const retry = await publish(fx.request('LOW'));
      expect(retry.receipt.profile).toBe('LOW');
    });
    it('retries after a first-document link failure, with nothing persisted beforehand and the lock held', async () => {
      const fx = await buildFixture();
      const publish = await publisher();
      let linkCalls = 0;
      const injected = new Error('injected-first-link');
      await expectFreshFatal(publish(fx.request('LOW'), {
        linkSync: (from: string, to: string) => {
          linkCalls++;
          if (linkCalls === 1) throw injected;
          linkSync(from, to);
        },
      }), 'calibration:report-publication-failed', injected);
      expect(() => readFileSync(fx.jsonPath('preflight', 'LOW'), 'utf8')).toThrow();
      expect(() => readFileSync(fx.mdPath('preflight', 'LOW'), 'utf8')).toThrow();
      expect(JSON.parse(readFileSync(resolve(fx.canonicalDir, 'lock.json'), 'utf8'))).toEqual(fx.context.owner);
      const result = await publish(fx.request('LOW'));
      expect(result.receipt.profile).toBe('LOW');
      const expected = await assembleCalibrationStageReport(fx.request('LOW'));
      expect(readFileSync(fx.jsonPath('preflight', 'LOW'), 'utf8')).toBe(renderNutritionEvalJson(expected));
    });
    it('retries after a second-document link failure, keeping the first document byte/inode identical', async () => {
      const fx = await buildFixture();
      const publish = await publisher();
      let linkCalls = 0;
      const injected = new Error('injected-second-link');
      await expectFreshFatal(publish(fx.request('LOW'), {
        linkSync: (from: string, to: string) => {
          linkCalls++;
          if (linkCalls === 2) throw injected;
          linkSync(from, to);
        },
      }), 'calibration:report-publication-failed', injected);
      const jsonPath = fx.jsonPath('preflight', 'LOW');
      const jsonBytesBefore = readFileSync(jsonPath, 'utf8');
      const jsonInoBefore = lstatSync(jsonPath).ino;
      const result = await publish(fx.request('LOW'));
      expect(lstatSync(jsonPath).ino).toBe(jsonInoBefore);
      expect(readFileSync(jsonPath, 'utf8')).toBe(jsonBytesBefore);
      expect(readFileSync(fx.mdPath('preflight', 'LOW'), 'utf8')).toBe(renderNutritionEvalMarkdown(result.report));
    });
    it('traces per-document temp fsync/close -> link -> own-temp unlink -> dir fsync, then both finals readback-fsynced before the last reports-dir sync', async () => {
      const fx = await buildFixture();
      type TraceEntry = { op: 'fsync' | 'close' | 'link' | 'unlink' | 'dirfsync'; path: string; from?: string };
      const trace: TraceEntry[] = [];
      const publish = await publisher();
      const jsonPath = fx.jsonPath('preflight', 'LOW');
      const mdPath = fx.mdPath('preflight', 'LOW');
      const finalPaths = [jsonPath, mdPath];
      const result = await publish(fx.request('LOW'), {
        fdFsyncSync: (fd) => { trace.push({ op: 'fsync', path: fdPath(fd) }); fsyncSync(fd); },
        fdCloseSync: (fd) => { trace.push({ op: 'close', path: fdPath(fd) }); closeSync(fd); },
        linkSync: (from, to) => { trace.push({ op: 'link', path: to, from }); linkSync(from, to); },
        unlinkSync: (path) => { trace.push({ op: 'unlink', path }); unlinkSync(path); },
        fsyncDirSync: (dir) => {
          trace.push({ op: 'dirfsync', path: dir });
          const fd = openSync(dir, 'r');
          try { fsyncSync(fd); } finally { closeSync(fd); }
        },
      });
      expect(result.receipt.profile).toBe('LOW');
      // Every fsync'd fd path is closed later, regardless of whether it is a temp or final fd.
      for (let index = 0; index < trace.length; index++) {
        const entry = trace[index]!;
        if (entry.op !== 'fsync') continue;
        expect(trace.slice(index + 1).some((e) => e.op === 'close' && e.path === entry.path)).toBe(true);
      }
      for (const finalPath of finalPaths) {
        const linkEntry = trace.find((e) => e.op === 'link' && e.path === finalPath);
        expect(linkEntry).toBeDefined();
        const linkIndex = trace.indexOf(linkEntry!);
        const tempPath = linkEntry!.from!;
        expect(tempPath).not.toBe(finalPath);
        const tempFsyncIndex = trace.findIndex((e) => e.op === 'fsync' && e.path === tempPath);
        expect(tempFsyncIndex).toBeGreaterThanOrEqual(0);
        expect(tempFsyncIndex).toBeLessThan(linkIndex);
        const tempCloseIndex = trace.findIndex((e, i) => i > tempFsyncIndex && i < linkIndex && e.op === 'close' && e.path === tempPath);
        expect(tempCloseIndex).toBeGreaterThan(tempFsyncIndex);
        const tempUnlinkIndex = trace.findIndex((e, i) => i > linkIndex && e.op === 'unlink' && e.path === tempPath);
        expect(tempUnlinkIndex).toBeGreaterThan(linkIndex);
        const dirFsyncAfterUnlink = trace.findIndex((e, i) => i > tempUnlinkIndex && e.op === 'dirfsync');
        expect(dirFsyncAfterUnlink).toBeGreaterThan(tempUnlinkIndex);
        const finalFsyncIndex = trace.findIndex((e, i) => i > dirFsyncAfterUnlink && e.op === 'fsync' && e.path === finalPath);
        expect(finalFsyncIndex).toBeGreaterThan(dirFsyncAfterUnlink);
        const finalCloseIndex = trace.findIndex((e, i) => i > finalFsyncIndex && e.op === 'close' && e.path === finalPath);
        expect(finalCloseIndex).toBeGreaterThan(finalFsyncIndex);
      }
      expect(trace.some((e) => e.op === 'dirfsync' && e.path === fx.canonicalDir)).toBe(true);
      const reportsDirFsyncIndices = trace
        .map((e, i) => ({ e, i })).filter(({ e }) => e.op === 'dirfsync' && e.path === fx.reportsDir).map(({ i }) => i);
      expect(reportsDirFsyncIndices.length).toBeGreaterThan(0);
      const lastReportsDirFsyncIndex = reportsDirFsyncIndices[reportsDirFsyncIndices.length - 1]!;
      for (const finalPath of finalPaths) {
        const fsyncIndices = trace.map((e, i) => ({ e, i })).filter(({ e }) => e.op === 'fsync' && e.path === finalPath).map(({ i }) => i);
        const lastFsyncIndex = fsyncIndices[fsyncIndices.length - 1]!;
        const closeIndex = trace.findIndex((e, i) => i > lastFsyncIndex && e.op === 'close' && e.path === finalPath);
        expect(closeIndex).toBeGreaterThan(-1);
        expect(lastReportsDirFsyncIndex).toBeGreaterThan(closeIndex);
      }
      // Final required lock reread/close is not traced here and may legitimately occur after the
      // last reports-dir sync; this test excludes it from required ordering, per host instruction.
    });
  });

  describe('EEXIST race on the final no-replace link', () => {
    it('accepts a genuine competing writer that already placed exact matching bytes at 0600', async () => {
      const fx = await buildFixture();
      const expected = await assembleCalibrationStageReport(fx.request('LOW'));
      const jsonPath = fx.jsonPath('preflight', 'LOW');
      let raced = false;
      const publish = await publisher();
      const result = await publish(fx.request('LOW'), {
        linkSync: (from: string, to: string) => {
          if (!raced && to === jsonPath) {
            raced = true;
            writeFileSync(jsonPath, renderNutritionEvalJson(expected), { mode: 0o600 });
          }
          linkSync(from, to);
        },
      });
      expect(raced).toBe(true);
      expect(result.receipt.jsonSha256).toBe(sha256(renderNutritionEvalJson(expected)));
      expect(readFileSync(jsonPath, 'utf8')).toBe(renderNutritionEvalJson(expected));
      expect(readdirSync(fx.reportsDir).some((name) => name.includes('.tmp.'))).toBe(false);
    });
    it('rejects a competing writer that placed conflicting bytes, without overwriting them', async () => {
      const fx = await buildFixture();
      const jsonPath = fx.jsonPath('preflight', 'LOW');
      let raced = false;
      const publish = await publisher();
      await expect(publish(fx.request('LOW'), {
        linkSync: (from: string, to: string) => {
          if (!raced && to === jsonPath) {
            raced = true;
            writeFileSync(jsonPath, 'conflicting-raced-content', { mode: 0o600 });
          }
          linkSync(from, to);
        },
      })).rejects.toThrow('calibration:report-file-tampered');
      expect(raced).toBe(true);
      expect(readFileSync(jsonPath, 'utf8')).toBe('conflicting-raced-content');
    });
  });

  describe('idempotency and partial-publication recovery', () => {
    it('is idempotent: identical bytes/inodes, zero writes/links/unlinks, and both documents still get a readback fsync', async () => {
      const fx = await buildFixture();
      const publish = await publisher();
      const first = await publish(fx.request('LOW'));
      const jsonPath = fx.jsonPath('preflight', 'LOW');
      const mdPath = fx.mdPath('preflight', 'LOW');
      const jsonIno = lstatSync(jsonPath).ino;
      const mdIno = lstatSync(mdPath).ino;
      const calls = { write: 0, link: 0, unlink: 0 };
      const fsyncedPaths = new Set<string>();
      const second = await publish(fx.request('LOW'), {
        fdWriteSync: (fd, buffer, offset, length) => { calls.write++; return writeSync(fd, buffer, offset, length); },
        fdFsyncSync: (fd) => { fsyncedPaths.add(fdPath(fd)); fsyncSync(fd); },
        linkSync: (from, to) => { calls.link++; linkSync(from, to); },
        unlinkSync: (path) => { calls.unlink++; unlinkSync(path); },
      });
      expect(calls).toEqual({ write: 0, link: 0, unlink: 0 });
      expect(lstatSync(jsonPath).ino).toBe(jsonIno);
      expect(lstatSync(mdPath).ino).toBe(mdIno);
      expect(second.receipt).toEqual(first.receipt);
      expect(fsyncedPaths.has(jsonPath)).toBe(true);
      expect(fsyncedPaths.has(mdPath)).toBe(true);
    });
    it('restores a deleted markdown artifact on retry: json gets only a readback fsync, markdown gets a fresh write+link+fsync', async () => {
      const fx = await buildFixture();
      const publish = await publisher();
      const first = await publish(fx.request('LOW'));
      const jsonPath = fx.jsonPath('preflight', 'LOW');
      const mdPath = fx.mdPath('preflight', 'LOW');
      const jsonBytesBefore = readFileSync(jsonPath, 'utf8');
      const jsonInoBefore = lstatSync(jsonPath).ino;
      unlinkSync(mdPath);
      const linksTo = new Set<string>();
      const fsyncedPaths = new Set<string>();
      const second = await publish(fx.request('LOW'), {
        linkSync: (from, to) => { linksTo.add(to); linkSync(from, to); },
        fdFsyncSync: (fd) => { fsyncedPaths.add(fdPath(fd)); fsyncSync(fd); },
      });
      expect(lstatSync(jsonPath).ino).toBe(jsonInoBefore);
      expect(readFileSync(jsonPath, 'utf8')).toBe(jsonBytesBefore);
      expect(second.receipt).toEqual(first.receipt);
      expect(readFileSync(mdPath, 'utf8')).toBe(renderNutritionEvalMarkdown(first.report));
      expect(linksTo.has(mdPath)).toBe(true);
      expect(linksTo.has(jsonPath)).toBe(false);
      expect(fsyncedPaths.has(jsonPath)).toBe(true);
      expect(fsyncedPaths.has(mdPath)).toBe(true);
    });
  });
});
