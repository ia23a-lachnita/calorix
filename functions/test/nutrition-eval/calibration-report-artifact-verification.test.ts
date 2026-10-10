/**
 * Task 1 Step 1 tests-only for native calibration report artifact verification.
 *
 * No application source exists yet. Every behavior case dynamically loads the
 * NEW module `src/nutrition-eval/calibration-report-artifact-verification` so
 * RED is the deliberate `artifact-verifier-module-missing` failure, not a
 * compile/fixture/RPC failure. Fixture setup consumes only existing source
 * functions; no existing test modules are imported.
 *
 * All filesystem work uses task disk TMPDIR via os tmpdir + mkdtemp; only
 * tracked fixture directories are removed in afterEach. File-local 60s
 * test/hook allowances only, no config edits.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { constants, mkdtempSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  prepareCalibrationBootstrapContext,
  deriveCanonicalAllowedKeys,
  deriveCanonicalReportOutcomePlan,
} from '../../src/nutrition-eval/calibration-bootstrap';
import { CALIBRATION_ROOT, createProtocolCalibrationLedger } from '../../src/nutrition-eval/calibration';
import type { CalibrationProfile, ReservationKey, StageName } from '../../src/nutrition-eval/calibration';
import { createFileCalibrationLedgerDeps } from '../../src/nutrition-eval/calibration-file-store';
import { captureCalibrationReportPrediction } from '../../src/nutrition-eval/calibration-report-journal';
import { publishCalibrationStageReport } from '../../src/nutrition-eval/calibration-report-publication';
import type { CalibrationReportPublicationResult } from '../../src/nutrition-eval/calibration-report-publication';
import { assembleCalibrationStageReport } from '../../src/nutrition-eval/calibration-report-assembly';
import { renderNutritionEvalJson, renderNutritionEvalMarkdown } from '../../src/nutrition-eval/report';
import type { CalibrationStageReportSnapshot } from '../../src/nutrition-eval/calibration-report-state';
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';

// File-local allowances only (no vitest config change).
vi.setConfig({ testTimeout: 60000, hookTimeout: 60000 });

const INPUT = 'calibration:report-artifact-input-invalid';
const LOCK_CODE = 'calibration:report-artifact-lock-invalid';
const TAMPER_CODE = 'calibration:report-file-tampered';
const READ_FAILED_CODE = 'calibration:report-artifact-read-failed';
const STAGE_INVALID = 'calibration:stage-report-invalid';
const STAGE_INCOMPLETE = 'calibration:stage-report-incomplete';

/**
 * Delegated native mocks via vi.mock/importOriginal (never vi.spyOn frozen ESM
 * builtins). Wrappers delegate to genuine originals and only observe/count;
 * fault hooks run through originals separately from verifier reads.
 */
const fsGuard = vi.hoisted(() => ({
  mode: 'off' as 'off' | 'factory' | 'verify',
  calls: [] as string[],
  openFlags: [] as Array<{ path: string; flags: number }>,
  opened: [] as number[],
  // Per-acquisition tracking: Linux may reuse fd numbers after close, so
  // uniqueness of fd numbers is NOT required. Each open pushes one entry;
  // each close pushes one attempt, recorded BEFORE the native call so a blind
  // retry on an already-released fd shows up as an unmatched attempt. Lengths
  // must match, not Set sizes.
  acquisitions: [] as Array<{ gen: number; fd: number; path: string }>,
  closeAttempts: [] as Array<{ fd: number; gen: number; path: string; failed: boolean }>,
  fdPath: new Map<number, string>(),
  fdGen: new Map<number, number>(),
  nextGen: 1,
  closed: [] as Array<{ fd: number; failed: boolean }>,
  readSeq: 0,
  reads: [] as Array<{ seq: number; fd: number; gen: number; path: string; bufferLength: number; length: number; offset: number; position: number | null; returned: number }>,
  lstatHook: null as null | ((path: string) => void),
  openHook: null as null | ((path: string) => void),
  readHook: null as null | ((fd: number, offset: number) => void),
  lstatOverride: null as null | ((path: string, real: unknown) => unknown),
  fstatOverride: null as null | ((fd: number, real: unknown) => unknown),
  readChunk: null as null | number,
  readInject: null as null | number,
  readInjectFilter: null as null | 'artifacts-only' | 'lock-only',
  openError: null as null | unknown,
  openErrorFilter: null as null | 'artifacts-only' | 'lock-only',
  fstatError: null as null | unknown,
  fstatErrorFilter: null as null | 'artifacts-only' | 'lock-only',
  readError: null as null | unknown,
  readErrorFilter: null as null | 'artifacts-only' | 'lock-only',
  closeFailFds: new Set<number>(),
  closeFailGens: new Set<number>(),
  closeFailNext: 0,
  closeError: null as null | unknown,
  original: null as null | typeof import('node:fs'),
}));
const netGuard = vi.hoisted(() => ({
  fetchCalls: 0,
  nowCalls: 0,
  origFetch: null as unknown,
  origNow: null as null | (() => number),
  armed: false,
}));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const g = fsGuard;
  g.original = actual;
  const allowVerify = new Set(['lstatSync', 'openSync', 'fstatSync', 'readSync', 'closeSync']);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wrapped: Record<string, any> = { ...actual };
  // Owned copy of constants: tests may override nofollow/nonblock on the
  // delegated mock only, never the original platform object.
  wrapped.constants = { ...(actual as unknown as { constants: Record<string, unknown> }).constants };
  const block = (name: string): boolean => {
    if (g.mode === 'factory') return true;
    if (g.mode === 'verify' && !allowVerify.has(name)) return true;
    return false;
  };
  const note = (name: string): void => {
    g.calls.push(name);
  };
  wrapped.lstatSync = (...args: Parameters<typeof actual.lstatSync>) => {
    if (block('lstatSync')) { note('lstatSync'); throw new Error('fs-blocked:lstatSync'); }
    const out = actual.lstatSync(...args) as unknown;
    if (g.lstatHook && typeof args[0] === 'string') {
      g.lstatHook(args[0] as string);
    }
    if (g.lstatOverride && typeof args[0] === 'string') {
      const fake = g.lstatOverride(args[0] as string, out);
      if (fake !== undefined) return fake as never;
    }
    return out as never;
  };
  const isLockPath = (p: string): boolean => p.endsWith('lock.json');
  const openShouldFault = (p: string): boolean => {
    if (g.openError === null) return false;
    if (g.openErrorFilter === 'artifacts-only') return !isLockPath(p);
    if (g.openErrorFilter === 'lock-only') return isLockPath(p);
    return true;
  };
  const fstatShouldFault = (fd: number): boolean => {
    if (g.fstatError === null) return false;
    if (g.fstatErrorFilter === 'artifacts-only') {
      const p = g.fdPath.get(fd) ?? '';
      // If fd unknown (e.g. fixture fd), do not fault to keep lock native.
      if (p === '') return false;
      return !isLockPath(p);
    }
    if (g.fstatErrorFilter === 'lock-only') {
      const p = g.fdPath.get(fd) ?? '';
      if (p === '') return false;
      return isLockPath(p);
    }
    return true;
  };
  const readShouldFault = (fd: number): boolean => {
    if (g.readError === null) return false;
    if (g.readErrorFilter === 'artifacts-only') {
      const p = g.fdPath.get(fd) ?? '';
      if (p === '') return false;
      return !isLockPath(p);
    }
    if (g.readErrorFilter === 'lock-only') {
      const p = g.fdPath.get(fd) ?? '';
      if (p === '') return false;
      return isLockPath(p);
    }
    return true;
  };
  const readInjectShouldApply = (fd: number): boolean => {
    if (g.readInject === null) return false;
    if (g.readInjectFilter === 'artifacts-only') {
      const p = g.fdPath.get(fd) ?? '';
      if (p === '') return false;
      return !isLockPath(p);
    }
    if (g.readInjectFilter === 'lock-only') {
      const p = g.fdPath.get(fd) ?? '';
      if (p === '') return false;
      return isLockPath(p);
    }
    return true;
  };
  wrapped.openSync = (...args: Parameters<typeof actual.openSync>) => {
    if (block('openSync')) { note('openSync'); throw new Error('fs-blocked:openSync'); }
    const path = String(args[0]);
    if (g.openHook) {
      g.openHook(path);
    }
    if (openShouldFault(path)) {
      const err = g.openError;
      throw err;
    }
    const fd = actual.openSync(...args);
    g.opened.push(fd);
    g.openFlags.push({ path, flags: Number(args[1]) });
    const gen = g.nextGen++;
    g.acquisitions.push({ gen, fd, path });
    g.fdPath.set(fd, path);
    g.fdGen.set(fd, gen);
    return fd;
  };
  wrapped.fstatSync = (...args: Parameters<typeof actual.fstatSync>) => {
    if (block('fstatSync')) { note('fstatSync'); throw new Error('fs-blocked:fstatSync'); }
    if (fstatShouldFault(args[0] as number)) {
      const err = g.fstatError;
      throw err;
    }
    const out = actual.fstatSync(...args) as unknown;
    if (g.fstatOverride) {
      const fake = g.fstatOverride(args[0] as number, out);
      if (fake !== undefined) return fake as never;
    }
    return out as never;
  };
  const recordRead = (fd: number, bufferLength: number, length: number, offset: number, position: number | null, returned: number): void => {
    g.reads.push({ seq: g.readSeq++, fd, gen: g.fdGen.get(fd) ?? -1, path: g.fdPath.get(fd) ?? '', bufferLength, length, offset, position, returned });
  };
  wrapped.readSync = (...args: Parameters<typeof actual.readSync>) => {
    if (block('readSync')) { note('readSync'); throw new Error('fs-blocked:readSync'); }
    const fd = args[0] as number;
    if (g.readHook) {
      g.readHook(fd, args[2] as number);
    }
    if (readShouldFault(fd)) {
      const err = g.readError;
      throw err;
    }
    const buffer = args[1] as Buffer;
    const offset = args[2] as number;
    const length = args[3] as number;
    const position = (args[4] as number | null) ?? null;
    if (readInjectShouldApply(fd)) {
      const injected = g.readInject as number;
      recordRead(fd, buffer.length, length, offset, position, injected);
      return injected;
    }
    if (g.readChunk !== null && length > (g.readChunk as number)) {
      const want = g.readChunk as number;
      const got = actual.readSync(fd, buffer, offset, want, position ?? offset);
      recordRead(fd, buffer.length, length, offset, position, got);
      return got;
    }
    const got = actual.readSync(...args);
    recordRead(fd, buffer.length, length, offset, position, got);
    return got;
  };
  wrapped.closeSync = (...args: Parameters<typeof actual.closeSync>) => {
    if (block('closeSync')) { note('closeSync'); throw new Error('fs-blocked:closeSync'); }
    const fd = args[0] as number;
    const path = g.fdPath.get(fd) ?? '';
    const gen = g.fdGen.get(fd) ?? -1;
    // Record the attempt BEFORE the native call. A stale/unknown fd (gen -1)
    // is an unmatched or double close and stays visible for assertions.
    const attempt = { fd, gen, path, failed: false };
    g.closeAttempts.push(attempt);
    const shouldFail = (gen !== -1 && g.closeFailGens.has(gen)) || g.closeFailFds.has(fd) || g.closeFailNext > 0;
    if (shouldFail) {
      if (g.closeFailNext > 0) g.closeFailNext -= 1;
      // Genuinely close exactly once, then throw. Never swallow a native
      // EBADF: it means the fd was already released, so surface it instead of
      // hiding an unexpected retry.
      let nativeError: unknown;
      try { actual.closeSync(fd); } catch (err) { nativeError = err; }
      g.fdPath.delete(fd);
      g.fdGen.delete(fd);
      attempt.failed = true;
      g.closed.push({ fd, failed: true });
      throw g.closeError ?? nativeError ?? new Error('injected-close-failed');
    }
    const out = actual.closeSync(...args);
    g.fdPath.delete(fd);
    g.fdGen.delete(fd);
    g.closed.push({ fd, failed: false });
    return out;
  };
  const passthrough = (name: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (actual as unknown as Record<string, any>)[name];
    if (typeof fn !== 'function') return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    wrapped[name] = (...args: any[]) => {
      if (block(name)) { note(name); throw new Error(`fs-blocked:${name}`); }
      return fn(...args);
    };
  };
  for (const name of Object.getOwnPropertyNames(actual)) {
    if (['lstatSync', 'openSync', 'fstatSync', 'readSync', 'closeSync'].includes(name)) continue;
    const v = (actual as unknown as Record<string, unknown>)[name];
    if (typeof v === 'function') passthrough(name);
  }
  const promises = (actual as unknown as { promises?: Record<string, unknown> }).promises;
  if (promises && typeof promises === 'object') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wp: Record<string, any> = { ...promises };
    for (const key of Object.getOwnPropertyNames(promises)) {
      const v = promises[key];
      if (typeof v === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        wp[key] = (...args: any[]) => {
          if (g.mode !== 'off') { note(`promises.${key}`); throw new Error(`fs-blocked:promises.${key}`); }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (v as (...a: any[]) => unknown)(...args);
        };
      }
    }
    wrapped.promises = wp;
  }
  // Default fs imports must not bypass the same delegated guards.
  wrapped.default = wrapped;
  return wrapped;
});
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  const wrapped: Record<string, unknown> = { ...actual };
  for (const key of Object.getOwnPropertyNames(actual)) {
    const fn = (actual as unknown as Record<string, unknown>)[key];
    if (typeof fn !== 'function') continue;
    wrapped[key] = (...args: unknown[]) => {
      if (fsGuard.mode !== 'off') {
        fsGuard.calls.push(`promises.${key}`);
        throw new Error(`fs-blocked:promises.${key}`);
      }
      return Reflect.apply(fn, actual, args);
    };
  }
  wrapped.default = wrapped;
  return wrapped;
});
function orig(): NonNullable<typeof fsGuard.original> {
  const o = fsGuard.original;
  if (o === null) throw new Error('fs-original-unavailable');
  return o;
}
function resetGuard(): void {
  fsGuard.mode = 'off';
  fsGuard.calls = [];
  fsGuard.openFlags = [];
  fsGuard.opened = [];
  fsGuard.acquisitions = [];
  fsGuard.closeAttempts = [];
  fsGuard.fdPath = new Map<number, string>();
  fsGuard.fdGen = new Map<number, number>();
  fsGuard.nextGen = 1;
  fsGuard.closed = [];
  fsGuard.readSeq = 0;
  fsGuard.reads = [];
  fsGuard.lstatHook = null;
  fsGuard.openHook = null;
  fsGuard.readHook = null;
  fsGuard.lstatOverride = null;
  fsGuard.fstatOverride = null;
  fsGuard.readChunk = null;
  fsGuard.readInject = null;
  fsGuard.readInjectFilter = null;
  fsGuard.openError = null;
  fsGuard.openErrorFilter = null;
  fsGuard.fstatError = null;
  fsGuard.fstatErrorFilter = null;
  fsGuard.readError = null;
  fsGuard.readErrorFilter = null;
  fsGuard.closeFailFds = new Set<number>();
  fsGuard.closeFailGens = new Set<number>();
  fsGuard.closeFailNext = 0;
  fsGuard.closeError = null;
}
function armFactory(): void {
  armVerify();
  fsGuard.mode = 'factory';
}
function armVerify(): void {
  fsGuard.mode = 'verify';
  fsGuard.calls = [];
  fsGuard.openFlags = [];
  fsGuard.opened = [];
  fsGuard.acquisitions = [];
  fsGuard.closeAttempts = [];
  fsGuard.fdPath = new Map<number, string>();
  fsGuard.fdGen = new Map<number, number>();
  fsGuard.nextGen = 1;
  fsGuard.closed = [];
  fsGuard.readSeq = 0;
  fsGuard.reads = [];
}
function disarm(): void {
  fsGuard.mode = 'off';
  fsGuard.lstatHook = null;
  fsGuard.openHook = null;
  fsGuard.readHook = null;
  fsGuard.lstatOverride = null;
  fsGuard.fstatOverride = null;
  fsGuard.readChunk = null;
  fsGuard.readInject = null;
  fsGuard.readInjectFilter = null;
  fsGuard.openError = null;
  fsGuard.openErrorFilter = null;
  fsGuard.fstatError = null;
  fsGuard.fstatErrorFilter = null;
  fsGuard.readError = null;
  fsGuard.readErrorFilter = null;
  fsGuard.closeFailFds = new Set<number>();
  fsGuard.closeFailGens = new Set<number>();
  fsGuard.closeFailNext = 0;
  fsGuard.closeError = null;
}
function armNet(): void {
  netGuard.armed = true;
  netGuard.fetchCalls = 0;
  netGuard.nowCalls = 0;
  netGuard.origFetch = (globalThis as unknown as Record<string, unknown>).fetch;
  netGuard.origNow = Date.now;
  const g = netGuard;
  (globalThis as unknown as Record<string, unknown>).fetch = (...args: unknown[]): unknown => {
    g.fetchCalls += 1;
    throw new Error(`network-blocked:${String(args[0] ?? 'fetch')}`);
  };
  Date.now = (): number => {
    g.nowCalls += 1;
    return (g.origNow as () => number)();
  };
}
function disarmNet(): { fetchCalls: number; nowCalls: number } {
  (globalThis as unknown as Record<string, unknown>).fetch = netGuard.origFetch;
  if (netGuard.origNow) Date.now = netGuard.origNow;
  const out = { fetchCalls: netGuard.fetchCalls, nowCalls: netGuard.nowCalls };
  netGuard.armed = false;
  netGuard.fetchCalls = 0;
  netGuard.nowCalls = 0;
  return out;
}

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const dirs: string[] = [];
const sha256 = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
afterEach(() => {
  disarm();
  if (netGuard.armed) disarmNet();
  resetGuard();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function assertDeepFrozen(value: unknown, seen = new Set<unknown>()): void {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value as Record<string, unknown>)) assertDeepFrozen(child, seen);
}
function expectFreshSyncFatal(fn: () => unknown, code: string, injected?: unknown): void {
  let caught: unknown;
  try { fn(); } catch (error) { caught = error; }
  if (injected !== undefined) expect(caught === injected).toBe(false);
  expect(caught).toBeInstanceOf(CalibrationFatalError);
  expect((caught as Error).message).toBe(code);
  expect(Object.prototype.hasOwnProperty.call(caught as object, 'cause')).toBe(false);
}
function makeForeignException(): { proxy: object; trapCalls: Record<string, number> } {
  const trapCalls: Record<string, number> = { get: 0, getPrototypeOf: 0, ownKeys: 0, ownPropertyDescriptor: 0, has: 0 };
  const proxy = new Proxy({}, {
    get: (_t, key) => {
      trapCalls.get++;
      if (key === 'message' || key === 'stack') return 'private-leak';
      if (key === 'name') return 'ForeignError';
      return undefined;
    },
    getPrototypeOf: () => { trapCalls.getPrototypeOf++; return Error.prototype; },
    ownKeys: () => { trapCalls.ownKeys++; return ['message', 'stack']; },
    getOwnPropertyDescriptor: () => { trapCalls.ownPropertyDescriptor++; return undefined; },
    has: () => { trapCalls.has++; return true; },
  });
  return { proxy, trapCalls };
}
function expectAllNativeClosed(o: NonNullable<typeof fsGuard.original>): void {
  expect(fsGuard.closeAttempts.every((a) => a.gen > 0)).toBe(true);
  for (const a of fsGuard.acquisitions) {
    expect(fsGuard.closeAttempts.filter((c) => c.gen === a.gen)).toHaveLength(1);
  }
  expect(fsGuard.fdGen.size).toBe(0);
  // Every acquired descriptor must be released: a native fstat on the
  // now-closed fd numbers must fail with EBADF, including after injection.
  for (const fd of new Set(fsGuard.acquisitions.map((a) => a.fd))) {
    let err: unknown;
    try { o.fstatSync(fd); } catch (e) { err = e; }
    expect(err).toBeDefined();
    expect((err as { code?: string }).code).toBe('EBADF');
  }
}

async function fixture(full = false) {
  const dir = mkdtempSync(resolve(tmpdir(), 'report-artifact-'));
  dirs.push(dir);
  const context = await prepareCalibrationBootstrapContext({
    baseDir: dir,
    readGitState: () => ({ headCommit: 'a'.repeat(40), implementationCommit: 'b'.repeat(40), functionsTreeId: 'c'.repeat(40), dirtyPaths: [] }),
    readCommittedFile: (path: string) => readFileSync(resolve(repo, path), 'utf8'),
    readOwner: () => ({ hostname: 'artifact-fixture', bootId: 'artifact-boot', pid: 44, startTicks: 44, acquiredAt: '2026-10-09T00:00:00.000Z' }),
  });
  const native = createFileCalibrationLedgerDeps(dir);
  const effects = { append: 0, fsync: 0, clock: 0 };
  let ticks = 0;
  const ledger = createProtocolCalibrationLedger({
    ...native,
    appendLedgerEvent: (e) => { effects.append++; native.appendLedgerEvent(e); },
    fsyncLedgerFile: () => { effects.fsync++; native.fsyncLedgerFile(); },
    fsyncLedgerDir: () => { effects.fsync++; native.fsyncLedgerDir(); },
    fsyncJournalFile: () => { effects.fsync++; native.fsyncJournalFile(); },
    fsyncJournalDir: () => { effects.fsync++; native.fsyncJournalDir(); },
    nowIso: () => { effects.clock++; return new Date(Date.UTC(2026, 9, 9) + ticks++ * 1000).toISOString(); },
  }, context.identity, (selected) => deriveCanonicalAllowedKeys(context.files, selected), {
    getReportOutcomePlan: (selected) => deriveCanonicalReportOutcomePlan(context.files, selected),
  });
  ledger.acquireLock(context.owner);
  const token = { kind: 'token_count', stage: 'preflight', caseId: context.firstDevelopmentCaseId, model: 'gemini-3.8-flash' } as const;
  ledger.reserveTokenCount(token); ledger.completeTokenCount(token, 42);
  for (const profile of ['LOW', 'MEDIUM'] as const) {
    const key = { stage: 'preflight', profile, caseId: context.firstDevelopmentCaseId, sampleIndex: 1 } as const;
    const four = { kcal: 120, proteinG: 10, carbsG: 0, fatG: 8 };
    const prediction = captureCalibrationReportPrediction({
      parseStatus: 'success', source: 'meal', ...four,
      confidence: 0.8, basis: 'portion', amount: 1, unit: 'portion', decision: 'needs_review', reviewReasons: [],
      latencyMs: 17, sampleIndex: 1, cached: false, diagnostics: {
        rawNutrients: four, detectedItemCount: 1,
        estimatedTotalMassG: 90, declaredBasis: 'portion', declaredAmount: 1, declaredUnit: 'portion',
      },
    });
    ledger.reserve(key);
    if (profile === 'LOW') ledger.pinModelVersion('gemini-3.8-fixture-pin');
    ledger.complete(key, ledger.appendResultJournal({
      key, normalizedPrediction: { ...four, estimatedTotalMassG: 90 },
      predictionHash: sha256(JSON.stringify(four)), analysisLatencyMs: 17, errorCategory: 'none',
      responseModelVersion: 'gemini-3.8-fixture-pin', reportPrediction: prediction,
    }));
  }
  const root = resolve(dir, CALIBRATION_ROOT), reports = resolve(root, 'reports');
  const snapshots = { LOW: ledger.getStageReportSnapshot('preflight', 'LOW'), MEDIUM: ledger.getStageReportSnapshot('preflight', 'MEDIUM') };
  const allSnapshots = new Map<string, CalibrationStageReportSnapshot>([
    ['preflight/LOW', snapshots.LOW], ['preflight/MEDIUM', snapshots.MEDIUM],
  ]);
  const save = (stage: StageName, profile: CalibrationProfile) => allSnapshots.set(`${stage}/${profile}`, ledger.getStageReportSnapshot(stage, profile));
  const terminal = (key: ReservationKey, mode: 'meal' | 'label') => {
    const four = { kcal: 120, proteinG: 10, carbsG: 0, fatG: 8 };
    const p = captureCalibrationReportPrediction({
      parseStatus: 'success', source: mode, ...four,
      confidence: 0.8, basis: 'portion', amount: 1, unit: 'portion', decision: 'needs_review', reviewReasons: [],
      latencyMs: 17, sampleIndex: key.sampleIndex, cached: false,
      ...(mode === 'meal' ? {
        diagnostics: {
          rawNutrients: four, detectedItemCount: 1, estimatedTotalMassG: 90,
          declaredBasis: 'portion', declaredAmount: 1, declaredUnit: 'portion',
        },
      } : {}),
    });
    ledger.reserve(key);
    ledger.complete(key, ledger.appendResultJournal({
      key, normalizedPrediction: { ...four, ...(mode === 'meal' ? { estimatedTotalMassG: 90 } : {}) },
      predictionHash: sha256(JSON.stringify(four)), analysisLatencyMs: 17, errorCategory: 'none',
      responseModelVersion: 'gemini-3.8-fixture-pin', reportPrediction: p,
    }));
  };
  if (full) {
    // Legacy fixture transitions are NOT measured gate-pass evidence.
    ledger.completeStage('preflight', { stage: 'preflight', passed: true, completedStages: [] });
    for (const row of deriveCanonicalReportOutcomePlan(context.files).filter((r) => r.key.stage === 'development')) terminal(row.key, 'meal');
    save('development', 'LOW'); save('development', 'MEDIUM');
    ledger.recordProfileSelection('MEDIUM', 'default_medium_tie_breaker', { stage: 'development', passed: true, completedStages: ['preflight'] });
    ledger.completeStage('development', { stage: 'development', passed: true, completedStages: ['preflight'] });
    const expanded = deriveCanonicalReportOutcomePlan(context.files, 'MEDIUM');
    for (const row of expanded.filter((r) => r.key.stage === 'validation')) terminal(row.key, 'meal');
    ledger.completeStage('validation', { stage: 'validation', passed: true, completedStages: ['preflight', 'development'] });
    save('validation', 'MEDIUM');
    for (const row of expanded.filter((r) => r.key.stage === 'benchmark')) {
      if (row.scanMode !== 'barcode') terminal(row.key, row.scanMode);
      else ledger.recordNonReservationResult({
        key: row.key, reason: 'barcode', prediction: {
          parseStatus: 'failure',
          source: 'barcode', decision: 'error', failureCategory: 'product', failureCode: 'off_product_invalid',
          sampleIndex: row.key.sampleIndex, cached: false, latencyMs: 17,
        },
      });
    }
    save('benchmark', 'MEDIUM');
  }
  const published = {} as Record<CalibrationProfile, Readonly<CalibrationReportPublicationResult>>;
  const allPublished = new Map<string, Readonly<CalibrationReportPublicationResult>>();
  for (const [slot, snapshot] of allSnapshots) {
    const result = await publishCalibrationStageReport({ stage: snapshot.stage, profile: snapshot.profile, context, readSnapshot: () => snapshot });
    allPublished.set(slot, result);
    if (snapshot.stage === 'preflight') published[snapshot.profile] = result;
  }
  const path = (profile: CalibrationProfile, ext: 'json' | 'md', stage: StageName = 'preflight') => resolve(reports, `${stage}-${profile.toLowerCase()}.${ext}`);
  const state = () => Object.fromEntries(['ledger.json', 'journal.json', 'lock.json'].map((name) => [name, readFileSync(resolve(root, name), 'utf8')]));
  return { dir, root, reports, context, ledger, effects, snapshots, published, allSnapshots, allPublished, path, state };
}
type Prepared = { readonly verify: (params: unknown) => Readonly<CalibrationReportPublicationResult> };
type Prepare = (context: unknown) => Promise<Readonly<Prepared>>;
async function loadPrepare(): Promise<Prepare> {
  const path = '../../src/nutrition-eval/calibration-report-artifact-verification';
  let module: Record<string, unknown>;
  try { module = await import(/* @vite-ignore */ path) as Record<string, unknown>; }
  catch { throw new Error('artifact-verifier-module-missing'); }
  if (typeof module.prepareCalibrationStageReportArtifactVerifier !== 'function') throw new Error('artifact-verifier-module-missing');
  return module.prepareCalibrationStageReportArtifactVerifier as Prepare;
}

describe('calibration report artifact verification (tests-only)', () => {
  it.each(['LOW', 'MEDIUM'] as const)('verifies actual preflight/%s and returns immutable actual-byte hashes', async (profile) => {
    const fx = await fixture(), prepare = await loadPrepare(), ready = await prepare(fx.context);
    const before = fx.state(), effects = { ...fx.effects };
    const result = ready.verify({ stage: 'preflight', profile, snapshot: fx.snapshots[profile] });
    expect(result instanceof Promise).toBe(false);
    expect(Object.isFrozen(ready)).toBe(true);
    expect(result).toEqual(fx.published[profile]);
    expect(result.receipt.jsonSha256).toBe(sha256(readFileSync(fx.path(profile, 'json'))));
    expect(result.receipt.markdownSha256).toBe(sha256(readFileSync(fx.path(profile, 'md'))));
    expect(fx.state()).toEqual(before); expect(fx.effects).toEqual(effects);
  });
  it('one prepared reader verifies all six actual stage/profile pairs, without evaluating failure gates', async () => {
    const fx = await fixture(true), prepare = await loadPrepare(), ready = await prepare(fx.context);
    expect([...fx.allSnapshots.keys()]).toEqual(['preflight/LOW', 'preflight/MEDIUM', 'development/LOW', 'development/MEDIUM', 'validation/MEDIUM', 'benchmark/MEDIUM']);
    const before = fx.state(), effects = { ...fx.effects };
    for (const [slot, snapshot] of fx.allSnapshots) {
      const result = ready.verify({ stage: snapshot.stage, profile: snapshot.profile, snapshot });
      expect(result).toEqual(fx.allPublished.get(slot));
      expect(result.receipt.jsonSha256).toBe(sha256(readFileSync(fx.path(snapshot.profile, 'json', snapshot.stage))));
      expect(result.receipt.markdownSha256).toBe(sha256(readFileSync(fx.path(snapshot.profile, 'md', snapshot.stage))));
      if (snapshot.stage === 'benchmark') {
        const barcode = result.report.cases.filter((row) => row.prediction.source === 'barcode');
        expect(barcode).toHaveLength(12);
        expect(barcode.every((row) => row.prediction.parseStatus === 'failure')).toBe(true);
      }
    }
    expect(fx.state()).toEqual(before); expect(fx.effects).toEqual(effects);
  });
  it('returns deeply frozen distinct results on reuse without freezing callers', async () => {
    const fx = await fixture();
    const expectedLow = await assembleCalibrationStageReport({ stage: 'preflight', profile: 'LOW', context: fx.context, readSnapshot: () => fx.snapshots.LOW });
    expect(expectedLow.calibration.thinkingLevel).toBe('LOW');
    const prepare = await loadPrepare();
    // Use owned mutable deep copies for caller-freeze assertions: ledger
    // snapshots and bootstrap context are already deeply frozen.
    const mutableLow = clone(fx.snapshots.LOW);
    const mutableMed = clone(fx.snapshots.MEDIUM);
    expect(Object.isFrozen(mutableLow)).toBe(false);
    const ready = await prepare(fx.context);
    const paramsLow = { stage: 'preflight' as const, profile: 'LOW' as const, snapshot: mutableLow };
    const paramsMed = { stage: 'preflight' as const, profile: 'MEDIUM' as const, snapshot: mutableMed };
    const firstLow = ready.verify(paramsLow);
    const med = ready.verify(paramsMed);
    const secondLow = ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: clone(fx.snapshots.LOW) });
    assertDeepFrozen(firstLow);
    assertDeepFrozen(med);
    expect(firstLow).toEqual(secondLow);
    expect(firstLow).not.toBe(secondLow);
    expect(firstLow.report).not.toBe(secondLow.report);
    expect(firstLow.receipt).not.toBe(secondLow.receipt);
    expect(firstLow.receipt.jsonSha256).not.toBe(med.receipt.jsonSha256);
    // Caller objects remain mutable; genuine frozen sources untouched.
    expect(Object.isFrozen(paramsLow)).toBe(false);
    expect(Object.isFrozen(mutableLow)).toBe(false);
    expect(Object.isFrozen(fx.snapshots.LOW)).toBe(true);
    expect(String(firstLow.report.runId)).toContain('calibration-preflight-low-');
    // Stable prior bytes: earlier result unchanged by later verifies.
    const firstJson = firstLow.receipt.jsonSha256;
    expect(secondLow.receipt.jsonSha256).toBe(firstJson);
  });

  describe('factory exact fields, owner capture and source ownership', () => {
    it.each([
      'missing-baseDir', 'missing-identity', 'missing-owner', 'missing-firstDevelopmentCaseId', 'missing-report', 'missing-files',
      'extra-field', 'hidden-field', 'symbol-field', 'accessor-baseDir', 'present-undefined', 'foreign-prototype',
      'baseDir-number', 'baseDir-blank', 'baseDir-nul',
    ] as const)('rejects factory context fault %s with INPUT', async (kind) => {
      const fx = await fixture();
      await assembleCalibrationStageReport({ stage: 'preflight', profile: 'LOW', context: fx.context, readSnapshot: () => fx.snapshots.LOW });
      const prepare = await loadPrepare();
      const base = fx.context as unknown as Record<string, unknown>;
      let ctx: unknown;
      const getter = vi.fn(() => base.baseDir);
      if (kind.startsWith('missing-')) {
        const field = kind.slice('missing-'.length);
        ctx = { ...base };
        delete (ctx as Record<string, unknown>)[field];
      } else if (kind === 'extra-field') ctx = { ...base, evil: 'x' };
      else if (kind === 'hidden-field') {
        ctx = { ...base };
        Object.defineProperty(ctx, 'secret', { value: 'x', enumerable: false });
      } else if (kind === 'symbol-field') {
        ctx = { ...base, [Symbol('extra')]: 'x' };
      } else if (kind === 'accessor-baseDir') {
        ctx = { ...base };
        Object.defineProperty(ctx, 'baseDir', { enumerable: true, get: getter });
      } else if (kind === 'present-undefined') ctx = { ...base, baseDir: undefined };
      else if (kind === 'foreign-prototype') {
        ctx = { ...base };
        Object.setPrototypeOf(ctx, { hidden: true });
      } else if (kind === 'baseDir-number') ctx = { ...base, baseDir: 42 };
      else if (kind === 'baseDir-blank') ctx = { ...base, baseDir: '   ' };
      else ctx = { ...base, baseDir: 'a\0b' };
      armFactory();
      try {
        await expect(prepare(ctx)).rejects.toThrow(INPUT);
      } finally { disarm(); }
      expect(getter).not.toHaveBeenCalled();
    });
    it.each([
      'owner-missing-pid', 'owner-missing-hostname', 'owner-missing-bootId', 'owner-missing-startTicks', 'owner-missing-acquiredAt',
      'owner-extra', 'owner-accessor', 'owner-hidden', 'owner-symbol', 'owner-prototype', 'owner-present-undefined',
      'owner-blank-hostname', 'owner-hostname-number', 'owner-blank-bootId',
      'owner-bad-pid-float', 'owner-bad-pid-zero', 'owner-bad-pid-negative', 'owner-bad-pid-string', 'owner-bad-pid-unsafe',
      'owner-bad-ticks-zero', 'owner-bad-ticks-float', 'owner-bad-ticks-string',
      'owner-bad-iso', 'owner-non-canonical-iso', 'owner-bad-iso-number',
    ] as const)('rejects factory owner fault %s with INPUT', async (kind) => {
      const fx = await fixture();
      const prepare = await loadPrepare();
      const owner = { ...(fx.context.owner as unknown as Record<string, unknown>) };
      const getter = vi.fn(() => 44);
      let next: Record<string, unknown> = owner;
      if (kind === 'owner-missing-pid') { next = { ...owner }; delete next.pid; }
      if (kind === 'owner-missing-hostname') { next = { ...owner }; delete next.hostname; }
      if (kind === 'owner-missing-bootId') { next = { ...owner }; delete next.bootId; }
      if (kind === 'owner-missing-startTicks') { next = { ...owner }; delete next.startTicks; }
      if (kind === 'owner-missing-acquiredAt') { next = { ...owner }; delete next.acquiredAt; }
      if (kind === 'owner-extra') next = { ...owner, evil: 1 };
      if (kind === 'owner-accessor') { next = { ...owner }; Object.defineProperty(next, 'pid', { enumerable: true, get: getter }); }
      if (kind === 'owner-hidden') { next = { ...owner }; Object.defineProperty(next, 'secret', { value: 1, enumerable: false }); }
      if (kind === 'owner-symbol') next = { ...owner, [Symbol('s')]: 1 } as unknown as Record<string, unknown>;
      if (kind === 'owner-prototype') { next = { ...owner }; Object.setPrototypeOf(next, { x: 1 }); }
      if (kind === 'owner-present-undefined') next = { ...owner, pid: undefined };
      if (kind === 'owner-blank-hostname') next = { ...owner, hostname: '  ' };
      if (kind === 'owner-hostname-number') next = { ...owner, hostname: 42 };
      if (kind === 'owner-blank-bootId') next = { ...owner, bootId: '' };
      if (kind === 'owner-bad-pid-float') next = { ...owner, pid: 1.5 };
      if (kind === 'owner-bad-pid-zero') next = { ...owner, pid: 0 };
      if (kind === 'owner-bad-pid-negative') next = { ...owner, pid: -5 };
      if (kind === 'owner-bad-pid-string') next = { ...owner, pid: '44' };
      if (kind === 'owner-bad-pid-unsafe') next = { ...owner, pid: Number.MAX_SAFE_INTEGER + 1 };
      if (kind === 'owner-bad-ticks-zero') next = { ...owner, startTicks: 0 };
      if (kind === 'owner-bad-ticks-float') next = { ...owner, startTicks: 1.5 };
      if (kind === 'owner-bad-ticks-string') next = { ...owner, startTicks: '44' };
      if (kind === 'owner-bad-iso') next = { ...owner, acquiredAt: 'not-a-date' };
      if (kind === 'owner-non-canonical-iso') next = { ...owner, acquiredAt: '2026-10-09T00:00:00Z' };
      if (kind === 'owner-bad-iso-number') next = { ...owner, acquiredAt: 123 };
      const ctx = { ...(fx.context as unknown as Record<string, unknown>), owner: next };
      armFactory();
      try {
        await expect(prepare(ctx)).rejects.toThrow(INPUT);
      } finally { disarm(); }
      expect(getter).not.toHaveBeenCalled();
    });
    it('accepts honest descriptor proxies with zero property Gets', async () => {
      const fx = await fixture();
      const prepare = await loadPrepare();
      let gets = 0;
      const wrap = <T extends object>(value: T): T => new Proxy(value, {
        get: (t, k, r) => { gets++; return Reflect.get(t, k, r); },
      });
      const c = fx.context as unknown as Record<string, unknown>;
      const ctx = wrap({
        ...c,
        files: wrap({ ...(c.files as object) }),
        identity: wrap({ ...(c.identity as object) }),
        owner: wrap({ ...(c.owner as object) }),
        report: wrap({ ...(c.report as object) }),
      });
      disarm();
      const ready = await prepare(ctx);
      expect(gets).toBe(0);
      armVerify();
      try {
        const out = ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: fx.snapshots.LOW });
        expect(out.receipt.profile).toBe('LOW');
      } finally { disarm(); }
    });
    it.each(['corrupt-manifest', 'malformed-identity-length', 'mismatched-pinned-provider', 'mismatched-planned-count', 'wrong-first-case'] as const)('preserves STAGE_REPORT_INVALID for factory source fault %s', async (kind) => {
      const fx = await fixture();
      const prepare = await loadPrepare();
      const c = clone(fx.context as unknown as Record<string, Record<string, string | number> & { firstDevelopmentCaseId: string }>);
      const ident = c.identity as unknown as Record<string, unknown>;
      if (kind === 'corrupt-manifest') (c.files as Record<string, string>)['calibration-manifest'] = 'not-json';
      if (kind === 'malformed-identity-length') ident.implementationCommit = 'a'.repeat(39);
      if (kind === 'mismatched-pinned-provider') ident.provider = 'vertex-wrong';
      if (kind === 'mismatched-planned-count') ident.plannedImageCalls = 999;
      if (kind === 'wrong-first-case') c.firstDevelopmentCaseId = 'changed-case-id';
      const ctx = { ...(fx.context as unknown as Record<string, unknown>), files: c.files, identity: c.identity, firstDevelopmentCaseId: c.firstDevelopmentCaseId };
      armFactory();
      try {
        await expect(prepare(ctx)).rejects.toThrow(STAGE_INVALID);
      } finally { disarm(); }
    });
    it('accepts alternative valid 40hex identities at preparation but binds snapshots to source', async () => {
      const fx = await fixture();
      const prepare = await loadPrepare();
      const c = clone(fx.context as unknown as Record<string, unknown>);
      const ident = { ...((c.identity as unknown as Record<string, unknown>)) };
      ident.implementationCommit = 'd'.repeat(40);
      ident.functionsTreeId = 'd'.repeat(40);
      const ctx = { ...(fx.context as unknown as Record<string, unknown>), identity: ident, files: c.files, firstDevelopmentCaseId: c.firstDevelopmentCaseId };
      // Preparation succeeds: arbitrary valid 40hex commits are accepted.
      const ready = await prepare(ctx);
      expect(Object.isFrozen(ready)).toBe(true);
      // Snapshot still carries original a/b/c identity, so reconstruction
      // against the d-committed source must hold INVALID with zero fs.
      armFactory();
      const openedBefore = fsGuard.opened.length;
      try {
        expectFreshSyncFatal(() => ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: fx.snapshots.LOW }), STAGE_INVALID);
        expect(fsGuard.opened.length).toBe(openedBefore);
        expect(fsGuard.calls).toEqual([]);
      } finally { disarm(); }
    });
    it('ignores report metadata proxies without traversal, freeze or retention', async () => {
      const fx = await fixture();
      const prepare = await loadPrepare();
      const traps = { get: 0, ownKeys: 0, getPrototypeOf: 0, getOwnPropertyDescriptor: 0, freeze: 0 };
      const nested = { deep: { v: 1 } };
      const target = { nested, marker: 'ignore-me' };
      const { proxy, revoke } = Proxy.revocable(target, {
        get: (t, k, r) => { traps.get++; return Reflect.get(t, k, r); },
        ownKeys: (t) => { traps.ownKeys++; return Reflect.ownKeys(t); },
        getPrototypeOf: (t) => { traps.getPrototypeOf++; return Reflect.getPrototypeOf(t); },
        getOwnPropertyDescriptor: (t, p) => { traps.getOwnPropertyDescriptor++; return Reflect.getOwnPropertyDescriptor(t, p); },
        preventExtensions: (t) => { traps.freeze++; return Reflect.preventExtensions(t); },
      });
      const ctx = { ...(fx.context as unknown as Record<string, unknown>), report: proxy };
      const ready = await prepare(ctx);
      expect(traps.get).toBe(0);
      expect(traps.ownKeys).toBe(0);
      expect(traps.getPrototypeOf).toBe(0);
      expect(traps.getOwnPropertyDescriptor).toBe(0);
      expect(traps.freeze).toBe(0);
      // Inspect the underlying target, never the proxy: Object.isFrozen(proxy)
      // would itself fire ownKeys/getOwnPropertyDescriptor traps.
      expect(Object.isFrozen(target)).toBe(false);
      expect(Object.isFrozen(nested)).toBe(false);
      // Revoke: verifier must not retain/traverse report metadata.
      revoke();
      const out = ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: fx.snapshots.LOW });
      expect(out.receipt.profile).toBe('LOW');
      (ctx as Record<string, unknown>).report = { replaced: true };
      const again = ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: fx.snapshots.LOW });
      expect(again).toEqual(out);
      expect(traps.get).toBe(0);
      expect(traps.ownKeys).toBe(0);
      expect(traps.getPrototypeOf).toBe(0);
      expect(traps.getOwnPropertyDescriptor).toBe(0);
      expect(traps.freeze).toBe(0);
      expect(Object.isFrozen(target)).toBe(false);
      expect(Object.isFrozen(nested)).toBe(false);
    });
    it('captures owned baseDir/owner/files/identity/firstcase before await and after readiness', async () => {
      const fx = await fixture();
      const prepare = await loadPrepare();
      const mutable = clone(fx.context as unknown as Record<string, unknown>);
      (mutable as Record<string, unknown>).baseDir = fx.context.baseDir;
      const pending = prepare(mutable);
      // Mutate before first await resolves: owned values must prevail.
      (mutable as Record<string, unknown>).baseDir = resolve(fx.dir, 'redirect-elsewhere');
      ((mutable.owner as unknown as Record<string, unknown>)).pid = 99999;
      ((mutable.files as unknown as Record<string, string>))['calibration-manifest'] = 'mutated';
      ((mutable.identity as unknown as Record<string, unknown>)).provider = 'mutated-provider';
      (mutable as Record<string, unknown>).firstDevelopmentCaseId = 'mutated-case';
      const ready = await pending;
      expect(Object.isFrozen(mutable)).toBe(false);
      expect(Object.isFrozen(mutable.owner)).toBe(false);
      // Mutate again AFTER readiness: closure must not recapture.
      (mutable as Record<string, unknown>).baseDir = resolve(fx.dir, 'redirect-again');
      ((mutable.owner as unknown as Record<string, unknown>)).hostname = 'mutated-after';
      const out = ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: fx.snapshots.LOW });
      expect(out.receipt.profile).toBe('LOW');
      expect(Object.isFrozen(mutable)).toBe(false);
    });
    it('performs zero fs/clock/network during preparation', async () => {
      const fx = await fixture();
      const prepare = await loadPrepare();
      const frozenContext = fx.context;
      armFactory();
      armNet();
      try {
        const ready = await prepare(frozenContext);
        expect(Object.isFrozen(ready)).toBe(true);
        expect(fsGuard.calls).toEqual([]);
        expect(netGuard.fetchCalls).toBe(0);
        expect(netGuard.nowCalls).toBe(0);
      } finally {
        const net = disarmNet();
        disarm();
        expect(net.fetchCalls).toBe(0);
        expect(net.nowCalls).toBe(0);
      }
    });
  });

  describe('verify request shape and snapshot policy', () => {
    it.each([
      'missing-stage', 'missing-profile', 'missing-snapshot', 'extra-receipt', 'extra-path', 'extra-hash',
      'extra-report', 'extra-context', 'extra-readSnapshot', 'extra-override', 'hidden', 'symbol', 'accessor', 'undefined-field', 'prototype',
      'bad-stage', 'bad-profile',
    ] as const)('rejects verify request fault %s with INPUT before snapshot access', async (kind) => {
      const fx = await fixture();
      const prepare = await loadPrepare();
      const ready = await prepare(fx.context);
      const traps = { get: 0, ownKeys: 0, getPrototypeOf: 0, getOwnPropertyDescriptor: 0 };
      const snapshotProxy = new Proxy(clone(fx.snapshots.LOW), {
        get: (t, k, r) => { traps.get++; return Reflect.get(t, k, r); },
        ownKeys: (t) => { traps.ownKeys++; return Reflect.ownKeys(t); },
        getPrototypeOf: (t) => { traps.getPrototypeOf++; return Reflect.getPrototypeOf(t); },
        getOwnPropertyDescriptor: (t, p) => { traps.getOwnPropertyDescriptor++; return Reflect.getOwnPropertyDescriptor(t, p); },
      });
      const params: Record<string | symbol, unknown> = { stage: 'preflight', profile: 'LOW', snapshot: snapshotProxy };
      const getter = vi.fn(() => 'preflight');
      if (kind === 'missing-stage') delete params.stage;
      if (kind === 'missing-profile') delete params.profile;
      if (kind === 'missing-snapshot') delete params.snapshot;
      if (kind.startsWith('extra-')) params[kind.slice('extra-'.length)] = 'override';
      if (kind === 'hidden') Object.defineProperty(params, 'secret', { value: 1, enumerable: false });
      if (kind === 'symbol') params[Symbol('x')] = 1;
      if (kind === 'accessor') Object.defineProperty(params, 'stage', { enumerable: true, get: getter });
      if (kind === 'undefined-field') params.stage = undefined;
      if (kind === 'prototype') Object.setPrototypeOf(params, { x: 1 });
      if (kind === 'bad-stage') params.stage = 'preflite';
      if (kind === 'bad-profile') params.profile = 'HIGH';
      armFactory();
      try {
        expectFreshSyncFatal(() => ready.verify(params), INPUT);
        expect(fsGuard.calls).toEqual([]);
        expect(getter).not.toHaveBeenCalled();
        // Malformed request/invalid enums reject before ANY snapshot reflection.
        expect(traps.get).toBe(0);
        expect(traps.ownKeys).toBe(0);
        expect(traps.getPrototypeOf).toBe(0);
        expect(traps.getOwnPropertyDescriptor).toBe(0);
      } finally { disarm(); }
    });
    it.each([
      'mismatched-stage', 'mismatched-profile', 'bad-identity-length', 'mismatched-pinned-hash', 'unstarted', 'pending-coherent', 'missing-row',
    ] as const)('holds snapshot %s with existing INVALID/INCOMPLETE and zero native fs', async (kind) => {
      const fx = await fixture();
      const prepare = await loadPrepare();
      const ready = await prepare(fx.context);
      // Coherent cloned preflight snapshot: no costly full fixture needed.
      const target = clone(fx.snapshots.LOW) as unknown as Record<string, unknown>;
      const counts = target.counts as unknown as Record<string, number>;
      const images = target.images as unknown[];
      if (kind === 'mismatched-stage') target.stage = 'development';
      if (kind === 'mismatched-profile') target.profile = 'MEDIUM';
      if (kind === 'bad-identity-length') (target.identity as Record<string, unknown>).implementationCommit = 'a'.repeat(39);
      if (kind === 'mismatched-pinned-hash') (target.identity as Record<string, unknown>).promptHash = '0'.repeat(64);
      if (kind === 'unstarted') delete target.startedAt;
      if (kind === 'pending-coherent') {
        images.pop();
        counts.imageCallsCompleted -= 1;
        counts.imageCallsPending = 1;
      }
      if (kind === 'missing-row') {
        images.pop();
        counts.imageCallsReserved -= 1;
        counts.imageCallsCompleted -= 1;
      }
      const code = (kind === 'unstarted' || kind === 'pending-coherent' || kind === 'missing-row') ? STAGE_INCOMPLETE : STAGE_INVALID;
      armFactory();
      try {
        // Source INVALID/INCOMPLETE must block ALL fs, not just zero opens.
        expectFreshSyncFatal(() => ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: target }), code);
        expect(fsGuard.calls).toEqual([]);
        expect(fsGuard.opened).toEqual([]);
        expect(fsGuard.acquisitions).toEqual([]);
        expect(fsGuard.reads).toEqual([]);
        expect(fsGuard.openFlags).toEqual([]);
      } finally { disarm(); }
    });
    it('rejects throwing snapshot reflection without foreign inspection and zero opens', async () => {
      const fx = await fixture();
      const prepare = await loadPrepare();
      const ready = await prepare(fx.context);
      let gets = 0;
      const foreign = new Proxy({}, {
        get: () => { gets++; throw new Error('private'); },
        getPrototypeOf: () => { gets++; throw new Error('private'); },
      });
      const hostile = new Proxy(clone(fx.snapshots.LOW), { ownKeys: () => { throw foreign; } });
      armFactory();
      try {
        expectFreshSyncFatal(() => ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: hostile }), STAGE_INVALID, foreign);
        expect(fsGuard.calls).toEqual([]);
        expect(gets).toBe(0);
        expect(fsGuard.opened.length).toBe(0);
      } finally { disarm(); }
    });
  });

  describe('artifact tamper fidelity', () => {
    it.each([
      'missing-json', 'missing-md', 'missing-reports',
      'mode-json-644', 'mode-md-640', 'mode-reports-755', 'mode-special-bits', 'mode-md-special-bits',
      'symlink-json', 'dir-json', 'hardlink-json',
      'symlink-md', 'dir-md', 'hardlink-md',
      'empty-json', 'truncated-json', 'oversized-json',
      'empty-md', 'truncated-md', 'oversized-md',
      'malformed-utf8', 'malformed-utf8-md', 'altered-numeric', 'altered-identity', 'malformed-json', 'copied-medium-at-low', 'copied-medium-md-at-low', 'json-only-drift', 'md-only-drift',
    ] as const)('rejects artifact fault %s with TAMPER and no repair', async (kind) => {
      const fx = await fixture();
      const prepare = await loadPrepare();
      const ready = await prepare(fx.context);
      const o = orig();
      const jsonPath = fx.path('LOW', 'json');
      const mdPath = fx.path('LOW', 'md');
      const beforeJson = o.readFileSync(jsonPath, 'utf8');
      const beforeMd = o.readFileSync(mdPath, 'utf8');
      if (kind === 'missing-json') o.unlinkSync(jsonPath);
      if (kind === 'missing-md') o.unlinkSync(mdPath);
      if (kind === 'missing-reports') o.rmSync(fx.reports, { recursive: true, force: true });
      if (kind === 'mode-json-644') o.chmodSync(jsonPath, 0o644);
      if (kind === 'mode-md-640') o.chmodSync(mdPath, 0o640);
      if (kind === 'mode-reports-755') o.chmodSync(fx.reports, 0o755);
      if (kind === 'mode-special-bits') o.chmodSync(jsonPath, 0o4644);
      if (kind === 'mode-md-special-bits') o.chmodSync(mdPath, 0o4600);
      if (kind === 'symlink-json') {
        const tmp = `${jsonPath}.real`;
        o.renameSync(jsonPath, tmp);
        o.symlinkSync(tmp, jsonPath);
      }
      if (kind === 'dir-json') {
        o.unlinkSync(jsonPath);
        o.mkdirSync(jsonPath, { mode: 0o700 });
      }
      if (kind === 'hardlink-json') {
        const extra = `${jsonPath}.hardlink`;
        try { o.unlinkSync(extra); } catch { /* ignore */ }
        o.linkSync(jsonPath, extra);
      }
      if (kind === 'empty-json') o.writeFileSync(jsonPath, '');
      if (kind === 'truncated-json') o.writeFileSync(jsonPath, beforeJson.slice(0, Math.floor(beforeJson.length / 2)));
      if (kind === 'oversized-json') o.writeFileSync(jsonPath, `${beforeJson} `);
      if (kind === 'malformed-utf8') {
        const bytes = Buffer.from(beforeJson); bytes[0] = 0xff;
        o.writeFileSync(jsonPath, bytes);
        expect(o.lstatSync(jsonPath).size).toBe(Buffer.byteLength(beforeJson));
      }
      if (kind === 'symlink-md') {
        const tmp = `${mdPath}.real`;
        o.renameSync(mdPath, tmp);
        o.symlinkSync(tmp, mdPath);
      }
      if (kind === 'dir-md') {
        o.unlinkSync(mdPath);
        o.mkdirSync(mdPath, { mode: 0o700 });
      }
      if (kind === 'hardlink-md') {
        const extra = `${mdPath}.hardlink`;
        try { o.unlinkSync(extra); } catch { /* ignore */ }
        o.linkSync(mdPath, extra);
      }
      if (kind === 'empty-md') o.writeFileSync(mdPath, '');
      if (kind === 'truncated-md') o.writeFileSync(mdPath, beforeMd.slice(0, Math.floor(beforeMd.length / 2)));
      if (kind === 'oversized-md') o.writeFileSync(mdPath, `${beforeMd} `);
      if (kind === 'malformed-utf8-md') {
        const bytes = Buffer.from(beforeMd); bytes[0] = 0xff;
        o.writeFileSync(mdPath, bytes);
        expect(o.lstatSync(mdPath).size).toBe(Buffer.byteLength(beforeMd));
      }
      if (kind === 'altered-numeric') {
        const altered = beforeJson.replace(/120/, '121');
        expect(altered).not.toBe(beforeJson);
        expect(Buffer.byteLength(altered)).toBe(Buffer.byteLength(beforeJson));
        o.writeFileSync(jsonPath, altered);
      }
      if (kind === 'altered-identity') {
        const altered = beforeJson.replace('b'.repeat(40), 'd'.repeat(40));
        expect(altered).not.toBe(beforeJson);
        expect(Buffer.byteLength(altered)).toBe(Buffer.byteLength(beforeJson));
        o.writeFileSync(jsonPath, altered);
      }
      if (kind === 'malformed-json') o.writeFileSync(jsonPath, `!${beforeJson.slice(1)}`);
      if (kind === 'copied-medium-at-low') {
        const med = o.readFileSync(fx.path('MEDIUM', 'json'), 'utf8');
        o.writeFileSync(jsonPath, med);
      }
      if (kind === 'copied-medium-md-at-low') o.writeFileSync(mdPath, o.readFileSync(fx.path('MEDIUM', 'md')));
      if (kind === 'json-only-drift') o.writeFileSync(jsonPath, `${beforeJson.slice(0, -2)} }`);
      if (kind === 'md-only-drift') {
        o.writeFileSync(mdPath, `!${beforeMd.slice(1)}`);
        expect(o.lstatSync(mdPath).size).toBe(Buffer.byteLength(beforeMd));
      }
      if (kind === 'missing-reports') {
        armVerify();
        try {
          expectFreshSyncFatal(() => ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: fx.snapshots.LOW }), TAMPER_CODE);
        } finally { disarm(); }
        expect(o.existsSync(jsonPath)).toBe(false);
        return;
      }
      armVerify();
      try {
        expectFreshSyncFatal(() => ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: fx.snapshots.LOW }), TAMPER_CODE);
        for (const r of fsGuard.reads) expect(r.length).toBeLessThanOrEqual(beforeJson.length + beforeMd.length);
      } finally { disarm(); }
      if (kind === 'missing-json') expect(o.existsSync(jsonPath)).toBe(false);
    });
    it('accepts owned baseDir 0755 while requiring root/reports 0700', async () => {
      const fx = await fixture();
      const prepare = await loadPrepare();
      const ready = await prepare(fx.context);
      const o = orig();
      o.chmodSync(fx.dir, 0o755);
      armVerify();
      try {
        const out = ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: fx.snapshots.LOW });
        expect(out.receipt.profile).toBe('LOW');
      } finally { disarm(); }
      o.chmodSync(fx.reports, 0o755);
      armVerify();
      try {
        expectFreshSyncFatal(() => ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: fx.snapshots.LOW }), TAMPER_CODE);
      } finally {
        disarm();
        o.chmodSync(fx.reports, 0o700);
      }
    });
    it.each(['json', 'md'] as const)('rejects oversized %s before target open/read or attacker-sized allocation', async (ext) => {
      const fx = await fixture();
      const prepare = await loadPrepare();
      const ready = await prepare(fx.context);
      const o = orig();
      const jsonPath = fx.path('LOW', 'json');
      const mdPath = fx.path('LOW', 'md');
      const jsonLen = o.readFileSync(jsonPath).length;
      const mdLen = o.readFileSync(mdPath).length;
      const bound = Math.max(4096, jsonLen, mdLen);
      const target = fx.path('LOW', ext);
      const oversizedLen = 2 ** 30;
      o.truncateSync(target, oversizedLen); // Sparse disk file: no giant RAM buffer.
      // Observe actual allocation attempts, not merely read lengths.
      const allocSizes: number[] = [];
      const realAlloc = Buffer.alloc;
      const realAllocUnsafe = Buffer.allocUnsafe;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bufAny = Buffer as any;
      bufAny.alloc = (size: number, ...rest: unknown[]) => { allocSizes.push(size); return (realAlloc as (...a: unknown[]) => Buffer)(size, ...rest); };
      bufAny.allocUnsafe = (size: number) => { allocSizes.push(size); return realAllocUnsafe(size); };
      armVerify();
      try {
        expectFreshSyncFatal(() => ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: fx.snapshots.LOW }), TAMPER_CODE);
        // Bounded by the exact expected rendered length; never the attacker size.
        expect(allocSizes.every((n) => n <= bound)).toBe(true);
        expect(allocSizes).not.toContain(oversizedLen);
        // No target reads after the bad (oversized) size is observed.
        expect(fsGuard.reads.some((r) => r.path === target)).toBe(false);
        expect(fsGuard.openFlags.some((r) => r.path === target)).toBe(false);
        for (const r of fsGuard.reads) expect(r.length).toBeLessThanOrEqual(bound);
      } finally {
        bufAny.alloc = realAlloc;
        bufAny.allocUnsafe = realAllocUnsafe;
        disarm();
      }
    });
  });

  describe('lock binding and canonical directories', () => {
    it.each([
      'root-badmode', 'lock-missing', 'lock-oversized', 'lock-symlink', 'lock-hardlinked', 'lock-badmode', 'lock-dir', 'lock-special-bits',
      'lock-malformed-utf8', 'lock-bad-json', 'lock-extra-owner', 'lock-wrong-owner',
    ] as const)('rejects lock fault %s with LOCK', async (kind) => {
      const fx = await fixture();
      const prepare = await loadPrepare();
      const ready = await prepare(fx.context);
      const o = orig();
      const lockPath = resolve(fx.root, 'lock.json');
      const beforeLock = o.readFileSync(lockPath, 'utf8');
      if (kind === 'root-badmode') o.chmodSync(fx.root, 0o755);
      if (kind === 'lock-missing') o.unlinkSync(lockPath);
      if (kind === 'lock-oversized') o.writeFileSync(lockPath, `${beforeLock}${'x'.repeat(5000)}`);
      if (kind === 'lock-symlink') {
        const real = `${lockPath}.real`;
        o.renameSync(lockPath, real);
        o.symlinkSync(real, lockPath);
      }
      if (kind === 'lock-hardlinked') {
        const extra = `${lockPath}.hardlink`;
        try { o.unlinkSync(extra); } catch { /* ignore */ }
        o.linkSync(lockPath, extra);
      }
      if (kind === 'lock-badmode') o.chmodSync(lockPath, 0o644);
      if (kind === 'lock-special-bits') o.chmodSync(lockPath, 0o4600);
      if (kind === 'lock-dir') { o.unlinkSync(lockPath); o.mkdirSync(lockPath, { mode: 0o700 }); }
      if (kind === 'lock-malformed-utf8') o.writeFileSync(lockPath, Buffer.from([0xff, 0xfe]));
      if (kind === 'lock-bad-json') o.writeFileSync(lockPath, '{not-json');
      if (kind === 'lock-extra-owner') {
        const obj = { ...JSON.parse(beforeLock), evil: 1 };
        o.writeFileSync(lockPath, JSON.stringify(obj));
      }
      if (kind === 'lock-wrong-owner') {
        const obj = { ...JSON.parse(beforeLock), pid: 99999 };
        o.writeFileSync(lockPath, JSON.stringify(obj));
      }
      armVerify();
      try {
        expectFreshSyncFatal(() => ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: fx.snapshots.LOW }), LOCK_CODE);
      } finally {
        disarm();
        if (kind === 'root-badmode') o.chmodSync(fx.root, 0o700);
      }
    });
    it.each(['delete', 'owner', 'replace'] as const)('rejects persistent lock %s during artifact reading', async (kind) => {
      const fx = await fixture();
      const prepare = await loadPrepare();
      const ready = await prepare(fx.context);
      const o = orig();
      const lockPath = resolve(fx.root, 'lock.json');
      const saved = o.readFileSync(lockPath, 'utf8');
      let triggered = false;
      fsGuard.readHook = (fd) => {
        if (triggered || fsGuard.fdPath.get(fd) !== fx.path('LOW', 'json')) return;
        triggered = true;
        if (kind === 'delete') o.unlinkSync(lockPath);
        if (kind === 'owner') o.writeFileSync(lockPath, JSON.stringify({ ...JSON.parse(saved), pid: 99999 }));
        if (kind === 'replace') {
          const sibling = `${lockPath}.replacement`;
          o.writeFileSync(sibling, saved, { mode: 0o600, flag: 'wx' });
          o.renameSync(sibling, lockPath);
        }
      };
      armVerify();
      try {
        expectFreshSyncFatal(() => ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: fx.snapshots.LOW }), LOCK_CODE);
        expect(triggered).toBe(true);
        expectAllNativeClosed(o);
      } finally { disarm(); }
    });
    it('succeeds with artifact inodes distinct from lock inode', async () => {
      const fx = await fixture();
      const prepare = await loadPrepare();
      const ready = await prepare(fx.context);
      const o = orig();
      const lockIno = o.lstatSync(resolve(fx.root, 'lock.json')).ino;
      const jsonIno = o.lstatSync(fx.path('LOW', 'json')).ino;
      const mdIno = o.lstatSync(fx.path('LOW', 'md')).ino;
      expect(jsonIno).not.toBe(lockIno);
      expect(mdIno).not.toBe(lockIno);
      expect(jsonIno).not.toBe(mdIno);
      armVerify();
      try {
        const out = ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: fx.snapshots.LOW });
        expect(out.receipt.profile).toBe('LOW');
        // Per-acquisition count, not fd-number uniqueness (Linux reuses numbers).
        expect(fsGuard.acquisitions.length).toBeGreaterThanOrEqual(3);
        expect(fsGuard.closeAttempts.length).toBe(fsGuard.acquisitions.length);
      } finally { disarm(); }
    });
    it('fails artifact replacement between lstat and open against its own lstat, not lock', async () => {
      const fx = await fixture();
      const prepare = await loadPrepare();
      const ready = await prepare(fx.context);
      const o = orig();
      const jsonPath = fx.path('LOW', 'json');
      const genuine = o.readFileSync(jsonPath, 'utf8');
      let mutated = false;
      fsGuard.lstatHook = (p) => {
        if (p === jsonPath && !mutated) {
          mutated = true;
          // Genuine replacement: exclusive sibling + atomic rename after lstat, before open.
          const sibling = `${jsonPath}.replace-${process.pid}`;
          try { o.unlinkSync(sibling); } catch { /* ignore */ }
          o.writeFileSync(sibling, genuine, { mode: 0o600, flag: 'wx' });
          o.chmodSync(sibling, 0o600);
          o.renameSync(sibling, jsonPath);
        }
      };
      armVerify();
      try {
        expectFreshSyncFatal(() => ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: fx.snapshots.LOW }), TAMPER_CODE);
        expect(mutated).toBe(true);
        expect(fsGuard.closeAttempts.length).toBe(fsGuard.acquisitions.length);
      } finally {
        disarm();
        o.writeFileSync(jsonPath, genuine);
        try { o.chmodSync(jsonPath, 0o600); } catch { /* ignore */ }
        try { o.unlinkSync(`${jsonPath}.replace-${process.pid}`); } catch { /* ignore */ }
      }
    });
    it.each(['root-symlink', 'root-nondir', 'ancestor-symlink', 'ancestor-nondir', 'reports-symlink', 'reports-nondir'] as const)('rejects %s canonical shape before any native open', async (kind) => {
      const fx = await fixture();
      const prepare = await loadPrepare();
      const ready = await prepare(fx.context);
      const o = orig();
      const ancestor = resolve(fx.root, '..');
      const restore: Array<() => void> = [];
      if (kind === 'root-symlink') {
        const real = `${fx.root}.real`;
        o.renameSync(fx.root, real);
        o.symlinkSync(real, fx.root);
        restore.push(() => { try { o.unlinkSync(fx.root); } catch { /* ignore */ } try { o.renameSync(real, fx.root); } catch { /* ignore */ } });
      }
      if (kind === 'ancestor-symlink') {
        const real = `${ancestor}.real`;
        o.renameSync(ancestor, real);
        o.symlinkSync(real, ancestor);
        restore.push(() => { try { o.unlinkSync(ancestor); } catch { /* ignore */ } try { o.renameSync(real, ancestor); } catch { /* ignore */ } });
      }
      if (kind === 'root-nondir') {
        const bak = `${fx.root}.bak`;
        o.renameSync(fx.root, bak);
        o.writeFileSync(fx.root, 'not-a-directory', { mode: 0o600 });
        restore.push(() => { try { o.unlinkSync(fx.root); } catch { /* ignore */ } try { o.renameSync(bak, fx.root); } catch { /* ignore */ } });
      }
      if (kind === 'ancestor-nondir' || kind.startsWith('reports-')) {
        const target = kind === 'ancestor-nondir' ? ancestor : fx.reports;
        const bak = `${target}.bak`;
        o.renameSync(target, bak);
        if (kind.endsWith('symlink')) o.symlinkSync(bak, target);
        else o.writeFileSync(target, 'not-a-directory', { mode: 0o600 });
        restore.push(() => { o.unlinkSync(target); o.renameSync(bak, target); });
      }
      armVerify();
      try {
        expectFreshSyncFatal(() => ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: fx.snapshots.LOW }), kind.startsWith('reports-') ? TAMPER_CODE : LOCK_CODE);
        // Shape faults reject before opening any descriptor.
        expect(fsGuard.opened).toEqual([]);
      } finally {
        disarm();
        for (const fn of restore.reverse()) fn();
      }
    });
    it.each(['root-inode', 'ancestor-inode', 'reports-inode'] as const)('detects observed %s replacement via directory recheck before artifact access', async (kind) => {
      const fx = await fixture();
      const prepare = await loadPrepare();
      const ready = await prepare(fx.context);
      const o = orig();
      const target = kind === 'root-inode' ? fx.root : kind === 'ancestor-inode' ? resolve(fx.root, '..') : fx.reports;
      const moved = `${target}.moved-${process.pid}`;
      const mode = o.lstatSync(target).mode & 0o777;
      let done = false;
      // Fire during the held-lock read, which completes before any artifact is
      // inspected: the following assertDirectories observes the inode drift.
      fsGuard.readHook = () => {
        if (done) return;
        done = true;
        o.renameSync(target, moved);
        o.mkdirSync(target, { mode });
        try { o.chmodSync(target, mode); } catch { /* ignore */ }
      };
      const expected = kind === 'reports-inode' ? TAMPER_CODE : LOCK_CODE;
      armVerify();
      try {
        expectFreshSyncFatal(() => ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: fx.snapshots.LOW }), expected);
        expect(done).toBe(true);
        // Only the held lock was opened before the drift was observed.
        expect(fsGuard.acquisitions.length).toBeGreaterThanOrEqual(1);
        expect(fsGuard.acquisitions.every((a) => a.path.endsWith('lock.json'))).toBe(true);
      } finally {
        disarm();
        try { o.rmSync(target, { recursive: true, force: true }); } catch { /* ignore */ }
        try { o.renameSync(moved, target); } catch { /* ignore */ }
      }
    });
  });

  describe('delegated races, open flags and descriptor cleanup', () => {
    it('opens lock and artifacts readonly nonblock nofollow without create or write flags', async () => {
      const fx = await fixture();
      const prepare = await loadPrepare();
      const ready = await prepare(fx.context);
      armVerify();
      try {
        const out = ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: fx.snapshots.LOW });
        expect(out.receipt.profile).toBe('LOW');
        expect(fsGuard.openFlags.length).toBeGreaterThanOrEqual(3);
        for (const entry of fsGuard.openFlags) {
          expect(entry.flags & constants.O_NONBLOCK).not.toBe(0);
          expect(entry.flags & constants.O_NOFOLLOW).not.toBe(0);
          expect(entry.flags & constants.O_CREAT).toBe(0);
          expect(entry.flags & constants.O_TRUNC).toBe(0);
          expect(entry.flags & constants.O_APPEND).toBe(0);
          expect(entry.flags & constants.O_WRONLY).toBe(0);
          expect(entry.flags & constants.O_RDWR).toBe(0);
        }
        expect(fsGuard.opened.length).toBe(fsGuard.closed.length);
      } finally { disarm(); }
    });
    it.each(['json-inode', 'md-inode', 'lock-inode', 'json-symlink', 'md-symlink', 'lock-symlink', 'json-fifo', 'md-fifo', 'lock-fifo'] as const)('rejects native race %s after genuine lstat', async (kind) => {
      const fx = await fixture();
      const prepare = await loadPrepare();
      const ready = await prepare(fx.context);
      const o = orig();
      const jsonPath = fx.path('LOW', 'json');
      const mdPath = fx.path('LOW', 'md');
      const lockPath = resolve(fx.root, 'lock.json');
      const savedJson = o.readFileSync(jsonPath, 'utf8');
      const savedMd = o.readFileSync(mdPath, 'utf8');
      const savedLock = o.readFileSync(lockPath, 'utf8');
      let mutated = false;
      const genuineReplace = (target: string, bytes: string): void => {
        // Genuine inode replacement: exclusive sibling 0600 + identical bytes + atomic rename.
        const sibling = `${target}.sibling-${process.pid}`;
        try { o.unlinkSync(sibling); } catch { /* ignore */ }
        o.writeFileSync(sibling, bytes, { mode: 0o600, flag: 'wx' });
        o.chmodSync(sibling, 0o600);
        o.renameSync(sibling, target);
      };
      fsGuard.lstatHook = (p) => {
        if (mutated) return;
        if (kind === 'json-inode' && p === jsonPath) { mutated = true; genuineReplace(jsonPath, savedJson); }
        if (kind === 'md-inode' && p === mdPath) { mutated = true; genuineReplace(mdPath, savedMd); }
        if (kind === 'lock-inode' && p === lockPath) { mutated = true; genuineReplace(lockPath, savedLock); }
        if (kind === 'lock-symlink' && p === lockPath) {
          mutated = true;
          const real = `${lockPath}.racer`;
          o.writeFileSync(real, savedLock, { mode: 0o600 });
          o.unlinkSync(lockPath); o.symlinkSync(real, lockPath);
        }
        if ((kind === 'json-symlink' || kind === 'md-symlink') && p === (kind === 'json-symlink' ? jsonPath : mdPath)) {
          mutated = true;
          const target = kind === 'json-symlink' ? jsonPath : mdPath;
          const saved = kind === 'json-symlink' ? savedJson : savedMd;
          const real = `${target}.racer`;
          o.writeFileSync(real, saved);
          genuineReplace(target, saved);
          // Replace with symlink after genuine lstat, before open.
          o.unlinkSync(target);
          o.symlinkSync(real, target);
        }
        if ((kind === 'json-fifo' || kind === 'md-fifo' || kind === 'lock-fifo') && p === (kind === 'json-fifo' ? jsonPath : kind === 'md-fifo' ? mdPath : lockPath)) {
          mutated = true;
          const target = kind === 'json-fifo' ? jsonPath : kind === 'md-fifo' ? mdPath : lockPath;
          o.unlinkSync(target);
          execFileSync('mkfifo', [target]);
        }
      };
      // Plan policy: raced artifact open ELOOP maps READ_FAILED; observed
      // nonregular fd/byte/inode drift maps TAMPER; lock ops always LOCK.
      const expected = kind.startsWith('lock-') ? LOCK_CODE : (kind.endsWith('-symlink') ? READ_FAILED_CODE : TAMPER_CODE);
      armVerify();
      try {
        expectFreshSyncFatal(() => ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: fx.snapshots.LOW }), expected);
        expect(mutated).toBe(true);
        expectAllNativeClosed(o);
        expect(fsGuard.closeAttempts.length).toBe(fsGuard.acquisitions.length);
      } finally {
        disarm();
        // Never read/open FIFO to probe cleanup: use known injected type.
        const racedTarget = kind.includes('json') ? jsonPath : kind.includes('md') ? mdPath : lockPath;
        const racedSaved = kind.includes('json') ? savedJson : kind.includes('md') ? savedMd : savedLock;
        if (kind.endsWith('-fifo')) {
          try { o.unlinkSync(racedTarget); } catch { /* ignore */ }
          try { o.writeFileSync(racedTarget, racedSaved, { mode: 0o600 }); } catch { /* ignore */ }
          try { o.chmodSync(racedTarget, 0o600); } catch { /* ignore */ }
        } else {
          try { o.writeFileSync(jsonPath, savedJson); } catch { /* ignore */ }
          try { o.writeFileSync(mdPath, savedMd); } catch { /* ignore */ }
          try { o.writeFileSync(lockPath, savedLock); } catch { /* ignore */ }
          try { o.chmodSync(jsonPath, 0o600); } catch { /* ignore */ }
          try { o.chmodSync(mdPath, 0o600); } catch { /* ignore */ }
          try { o.chmodSync(lockPath, 0o600); } catch { /* ignore */ }
        }
        try { o.unlinkSync(`${jsonPath}.racer`); } catch { /* ignore */ }
        try { o.unlinkSync(`${mdPath}.racer`); } catch { /* ignore */ }
        try { o.unlinkSync(`${jsonPath}.sibling-${process.pid}`); } catch { /* ignore */ }
        try { o.unlinkSync(`${mdPath}.sibling-${process.pid}`); } catch { /* ignore */ }
        try { o.unlinkSync(`${lockPath}.sibling-${process.pid}`); } catch { /* ignore */ }
      }
    });
    it('releases every acquisition once without requiring fd-number uniqueness', async () => {
      const fx = await fixture();
      const prepare = await loadPrepare();
      const ready = await prepare(fx.context);
      const o = orig();
      armVerify();
      try {
        const out = ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: fx.snapshots.LOW });
        expect(out.receipt.profile).toBe('LOW');
        // One close attempt PER acquisition; Linux may reuse numbers.
        expect(fsGuard.closeAttempts.length).toBe(fsGuard.acquisitions.length);
        expect(fsGuard.closed.length).toBe(fsGuard.acquisitions.length);
        // No unmatched/double close: every attempt maps to a live acquisition.
        expect(fsGuard.closeAttempts.every((a) => a.gen !== -1)).toBe(true);
        // No blind retry: attempts equal acquisitions, not more.
        const openCount = new Map<number, number>();
        for (const a of fsGuard.acquisitions) openCount.set(a.fd, (openCount.get(a.fd) ?? 0) + 1);
        const closeCount = new Map<number, number>();
        for (const c of fsGuard.closeAttempts) closeCount.set(c.fd, (closeCount.get(c.fd) ?? 0) + 1);
        for (const [fd, n] of openCount) expect(closeCount.get(fd)).toBe(n);
        expectAllNativeClosed(o);
      } finally { disarm(); }
    });
    it('injected temporary-check close genuinely closes then throws once without preventing held cleanup', async () => {
      const fx = await fixture();
      const prepare = await loadPrepare();
      const ready = await prepare(fx.context);
      const o = orig();
      armVerify();
      // Held lock is acquisition gen 1; the first temporary check-lock fd is
      // gen 2. Fail ONLY that temporary close (native closes, then throws).
      fsGuard.closeFailGens = new Set([2]);
      fsGuard.closeError = new Error('injected-close-failed');
      try {
        let caught: unknown;
        try { ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: fx.snapshots.LOW }); } catch (error) { caught = error; }
        expect(caught).toBeInstanceOf(CalibrationFatalError);
        expect((caught as Error).message).toBe(READ_FAILED_CODE);
        // Hook genuinely triggered on the intended generation.
        expect(fsGuard.closeAttempts.some((a) => a.gen === 2 && a.failed)).toBe(true);
        // All acquisitions attempted once; held lock still released.
        expect(fsGuard.closeAttempts.length).toBe(fsGuard.acquisitions.length);
        expect(fsGuard.acquisitions[0]?.gen).toBe(1);
        expect(fsGuard.closed.some((c) => !c.failed)).toBe(true);
        expectAllNativeClosed(o);
      } finally {
        disarm();
      }
    });
  });

  describe('bounded reads, foreign errors and close persistence', () => {
    it('preserves observed lock identity mismatch when its temporary check close also fails', async () => {
      const fx = await fixture(), prepare = await loadPrepare(), ready = await prepare(fx.context);
      const o = orig(), lockPath = resolve(fx.root, 'lock.json');
      // A real unlink/rename alters the HELD lock's nlink/ctime, so it would
      // correctly fail before acquiring the temporary descriptor. Delegate
      // genuine stats but inject a consistent different identity ONLY for
      // this temporary lock's lstat/fstat, to reach checkLock's comparison.
      let lockStats = 0, triggered = false;
      const otherIdentity = (real: unknown): unknown => {
        const desc = Object.getOwnPropertyDescriptors(real);
        desc.ino = { ...desc.ino, value: (desc.ino!.value as number) + 1 };
        return Object.create(Object.getPrototypeOf(real), desc);
      };
      fsGuard.lstatOverride = (path, real) => {
        if (path !== lockPath || ++lockStats !== 2) return undefined;
        triggered = true; return otherIdentity(real);
      };
      fsGuard.fstatOverride = (fd, real) => fsGuard.fdGen.get(fd) === 2 ? otherIdentity(real) : undefined;
      armVerify();
      fsGuard.closeFailGens = new Set([2]);
      const { proxy, trapCalls } = makeForeignException();
      fsGuard.closeError = proxy;
      try {
        expectFreshSyncFatal(() => ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: fx.snapshots.LOW }), LOCK_CODE);
        expect(triggered).toBe(true);
        expect(fsGuard.closeAttempts.some((a) => a.gen === 2 && a.failed)).toBe(true);
        expect(Object.values(trapCalls)).toEqual([0, 0, 0, 0, 0]);
        expectAllNativeClosed(o);
      } finally { disarm(); }
    });
    it.each([17, 31] as const)('delivers %s-byte chunks with exact offsets/positions/remaining for every initial and final pass', async (chunk) => {
      const fx = await fixture();
      const prepare = await loadPrepare();
      const ready = await prepare(fx.context);
      const jsonPath = fx.path('LOW', 'json');
      const mdPath = fx.path('LOW', 'md');
      const expectedJson = Buffer.from(renderNutritionEvalJson(fx.published.LOW.report), 'utf8');
      const expectedMd = Buffer.from(renderNutritionEvalMarkdown(fx.published.LOW.report), 'utf8');
      // Expected sizes are file-derived and independent of observed reads.
      expect(expectedJson.length).toBe(readFileSync(jsonPath).length);
      expect(expectedMd.length).toBe(readFileSync(mdPath).length);
      fsGuard.readChunk = chunk;
      armVerify();
      try {
        const out = ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: fx.snapshots.LOW });
        expect(out.receipt.profile).toBe('LOW');
      } finally { disarm(); }
      const passesFor = (path: string): Array<Array<(typeof fsGuard.reads)[number]>> => {
        const rs = fsGuard.reads.filter((r) => r.path === path).sort((a, b) => a.seq - b.seq);
        const passes: Array<Array<(typeof fsGuard.reads)[number]>> = [];
        let current: Array<(typeof fsGuard.reads)[number]> = [];
        for (const r of rs) {
          if (r.offset === 0) { if (current.length) passes.push(current); current = []; }
          current.push(r);
        }
        if (current.length) passes.push(current);
        return passes;
      };
      const assertComplete = (path: string, expected: Buffer): void => {
        const passes = passesFor(path);
        // Each artifact is read at least twice (initial pass + final reread);
        // every pass must cover the full expected file exactly once.
        expect(passes.length).toBeGreaterThanOrEqual(2);
        for (const pass of passes) {
          let cursor = 0;
          for (const r of pass) {
            expect(r.gen).toBeGreaterThan(0);
            expect(r.bufferLength).toBe(expected.length);
            expect(r.offset).toBe(cursor);
            // pread-style: explicit position equal to the running offset.
            expect(r.position).toBe(r.offset);
            // requested length is always exactly the remaining bytes.
            expect(r.length).toBe(expected.length - r.offset);
            expect(r.returned).toBe(Math.min(chunk, expected.length - r.offset));
            cursor += r.returned;
          }
          expect(cursor).toBe(expected.length);
        }
      };
      assertComplete(jsonPath, expectedJson);
      assertComplete(mdPath, expectedMd);
    });
    it.each([0, -1, 1.5, 999999] as const)('maps artifact short-read return %s before full length to TAMPER', async (value) => {
      const fx = await fixture();
      const prepare = await loadPrepare();
      const ready = await prepare(fx.context);
      fsGuard.readInject = value;
      fsGuard.readInjectFilter = 'artifacts-only';
      armVerify();
      try {
        expectFreshSyncFatal(() => ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: fx.snapshots.LOW }), TAMPER_CODE);
      } finally { disarm(); }
    });
    it.each([0, -1, 1.5] as const)('maps lock short-read return %s to LOCK', async (value) => {
      const fx = await fixture();
      const prepare = await loadPrepare();
      const ready = await prepare(fx.context);
      fsGuard.readInject = value;
      fsGuard.readInjectFilter = 'lock-only';
      armVerify();
      try {
        expectFreshSyncFatal(() => ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: fx.snapshots.LOW }), LOCK_CODE);
      } finally { disarm(); }
    });
    it.each(['open', 'fstat', 'read'] as const)('maps foreign artifact %s exception to fresh causeless READ_FAILED without leaks', async (op) => {
      const fx = await fixture();
      const prepare = await loadPrepare();
      const ready = await prepare(fx.context);
      const { proxy, trapCalls } = makeForeignException();
      if (op === 'open') { fsGuard.openError = proxy; fsGuard.openErrorFilter = 'artifacts-only'; }
      if (op === 'fstat') { fsGuard.fstatError = proxy; fsGuard.fstatErrorFilter = 'artifacts-only'; }
      if (op === 'read') { fsGuard.readError = proxy; fsGuard.readErrorFilter = 'artifacts-only'; }
      armVerify();
      try {
        let caught: unknown;
        try { ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: fx.snapshots.LOW }); } catch (error) { caught = error; }
        expect(caught).toBeInstanceOf(CalibrationFatalError);
        expect((caught as Error).message).toBe(READ_FAILED_CODE);
        expect(caught === proxy).toBe(false);
        expect(String((caught as Error).message)).not.toContain(fx.root);
        expect(trapCalls.get).toBe(0);
        expect(trapCalls.getPrototypeOf).toBe(0);
        expect(trapCalls.ownKeys).toBe(0);
        expect(trapCalls.ownPropertyDescriptor).toBe(0);
        // Cleanup verified even on failures: every acquisition attempted close.
        expect(fsGuard.closeAttempts.length).toBe(fsGuard.acquisitions.length);
      } finally { disarm(); }
    });
    it.each(['open', 'fstat', 'read'] as const)('maps foreign lock %s exception to LOCK without leaks', async (op) => {
      const fx = await fixture();
      const prepare = await loadPrepare();
      const ready = await prepare(fx.context);
      const { proxy, trapCalls } = makeForeignException();
      if (op === 'open') { fsGuard.openError = proxy; fsGuard.openErrorFilter = 'lock-only'; }
      if (op === 'fstat') { fsGuard.fstatError = proxy; fsGuard.fstatErrorFilter = 'lock-only'; }
      if (op === 'read') { fsGuard.readError = proxy; fsGuard.readErrorFilter = 'lock-only'; }
      armVerify();
      try {
        let caught: unknown;
        try { ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: fx.snapshots.LOW }); } catch (error) { caught = error; }
        expect(caught).toBeInstanceOf(CalibrationFatalError);
        expect((caught as Error).message).toBe(LOCK_CODE);
        expect(caught === proxy).toBe(false);
        expect(trapCalls.get).toBe(0);
        expect(trapCalls.getPrototypeOf).toBe(0);
        expect(trapCalls.ownKeys).toBe(0);
        expect(trapCalls.ownPropertyDescriptor).toBe(0);
        expect(fsGuard.closeAttempts.length).toBe(fsGuard.acquisitions.length);
      } finally { disarm(); }
    });
    it('preserves primary TAMPER despite a later held-lock close failure', async () => {
      const fx = await fixture();
      const prepare = await loadPrepare();
      const ready = await prepare(fx.context);
      const o = orig();
      o.chmodSync(fx.path('LOW', 'json'), 0o644);
      armVerify();
      // Fail the HELD lock close (gen 1), which happens during cleanup AFTER
      // the primary TAMPER was observed at document open.
      fsGuard.closeFailGens = new Set([1]);
      fsGuard.closeError = new Error('close-after-tamper');
      try {
        expectFreshSyncFatal(() => ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: fx.snapshots.LOW }), TAMPER_CODE);
        expect(fsGuard.closeAttempts.some((a) => a.gen === 1 && a.failed)).toBe(true);
        expect(fsGuard.closeAttempts.length).toBe(fsGuard.acquisitions.length);
        expectAllNativeClosed(o);
      } finally {
        disarm();
        o.chmodSync(fx.path('LOW', 'json'), 0o600);
      }
    });
    it('preserves primary LOCK despite a later held-lock close failure', async () => {
      const fx = await fixture();
      const prepare = await loadPrepare();
      const ready = await prepare(fx.context);
      const o = orig();
      const lockPath = resolve(fx.root, 'lock.json');
      const saved = o.readFileSync(lockPath, 'utf8');
      o.writeFileSync(lockPath, JSON.stringify({ ...JSON.parse(saved), pid: 99999 }));
      armVerify();
      fsGuard.closeFailGens = new Set([1]);
      fsGuard.closeError = new Error('close-after-lock');
      try {
        expectFreshSyncFatal(() => ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: fx.snapshots.LOW }), LOCK_CODE);
        expect(fsGuard.closeAttempts.some((a) => a.gen === 1 && a.failed)).toBe(true);
        expect(fsGuard.closeAttempts.length).toBe(fsGuard.acquisitions.length);
        expectAllNativeClosed(o);
      } finally {
        disarm();
        o.writeFileSync(lockPath, saved);
      }
    });
    it.each([1, 3, 5] as const)('close failure on held fd gen %s prevents result return', async (gen) => {
      const fx = await fixture();
      const prepare = await loadPrepare();
      const ready = await prepare(fx.context);
      const o = orig();
      armVerify();
      // Held fds: lock gen 1, json gen 3, md gen 5; each is released in cleanup.
      fsGuard.closeFailGens = new Set([gen]);
      fsGuard.closeError = new Error('injected-close-failed');
      try {
        let caught: unknown;
        try { ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: fx.snapshots.LOW }); } catch (error) { caught = error; }
        expect(caught).toBeInstanceOf(CalibrationFatalError);
        expect((caught as Error).message).toBe(READ_FAILED_CODE);
        expect(fsGuard.closeAttempts.some((a) => a.gen === gen && a.failed)).toBe(true);
        expect(fsGuard.closeAttempts.length).toBe(fsGuard.acquisitions.length);
        expectAllNativeClosed(o);
      } finally { disarm(); }
    });
    it('check-lock close failure still attempts all fds and maps READ_FAILED', async () => {
      const fx = await fixture();
      const prepare = await loadPrepare();
      const ready = await prepare(fx.context);
      const o = orig();
      armVerify();
      // Fail the temp check-lock close in the read loop (gen 6), after both
      // documents are open: success becomes READ_FAILED with all fds released.
      fsGuard.closeFailGens = new Set([6]);
      fsGuard.closeError = new Error('check-close-failed');
      try {
        let caught: unknown;
        try { ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: fx.snapshots.LOW }); } catch (error) { caught = error; }
        expect(caught).toBeInstanceOf(CalibrationFatalError);
        expect((caught as Error).message).toBe(READ_FAILED_CODE);
        expect(fsGuard.closeAttempts.some((a) => a.gen === 6 && a.failed)).toBe(true);
        expect(fsGuard.closeAttempts.length).toBe(fsGuard.acquisitions.length);
        expect(fsGuard.acquisitions.length).toBeGreaterThanOrEqual(6);
        expectAllNativeClosed(o);
      } finally { disarm(); }
    });
    it('maps foreign close exception proxy to READ_FAILED without inspecting it', async () => {
      const fx = await fixture();
      const prepare = await loadPrepare();
      const ready = await prepare(fx.context);
      const { proxy, trapCalls } = makeForeignException();
      armVerify();
      // Fail a held document close (md, gen 5) during cleanup with a hostile proxy.
      fsGuard.closeFailGens = new Set([5]);
      fsGuard.closeError = proxy;
      try {
        let caught: unknown;
        try { ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: fx.snapshots.LOW }); } catch (error) { caught = error; }
        expect(caught).toBeInstanceOf(CalibrationFatalError);
        expect((caught as Error).message).toBe(READ_FAILED_CODE);
        expect(caught === proxy).toBe(false);
        expect(trapCalls.get).toBe(0);
        expect(trapCalls.getPrototypeOf).toBe(0);
        expect(trapCalls.ownKeys).toBe(0);
        expect(trapCalls.ownPropertyDescriptor).toBe(0);
        expect(fsGuard.closeAttempts.some((a) => a.gen === 5 && a.failed)).toBe(true);
        expect(fsGuard.closeAttempts.length).toBe(fsGuard.acquisitions.length);
      } finally { disarm(); }
    });
  });

  describe('final pair reread and persistent mutation', () => {
    it('rejects persistent first-document rewrite during final second-document reads', async () => {
      const fx = await fixture();
      const prepare = await loadPrepare();
      const ready = await prepare(fx.context);
      const o = orig();
      const jsonPath = fx.path('LOW', 'json');
      const mdPath = fx.path('LOW', 'md');
      const savedJson = o.readFileSync(jsonPath, 'utf8');
      const savedMd = o.readFileSync(mdPath, 'utf8');
      const mdFdHint = { readsSeen: 0, mutated: false, finalPhase: false };
      // Track initial vs final reads via acquisition phases: mutate persistently
      // during FINAL second-document reads using native fs, not lstat.
      let readCount = 0;
      fsGuard.readHook = (fd, offset) => {
        const p = fsGuard.fdPath.get(fd) ?? '';
        readCount++;
        if (p === mdPath && offset === 0) mdFdHint.readsSeen++;
        // After several reads (initial pass done), inject persistent rewrite
        // of FIRST doc during FINAL second-doc reads.
        if (p === mdPath && offset === 0 && !mdFdHint.mutated && mdFdHint.readsSeen === 2) {
          mdFdHint.mutated = true;
          mdFdHint.finalPhase = true;
          expect(fsGuard.reads.filter((r) => r.path === jsonPath && r.offset === 0)).toHaveLength(2);
          o.writeFileSync(jsonPath, `${savedJson.slice(0, -2)} }`);
        }
      };
      armVerify();
      try {
        expectFreshSyncFatal(() => ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: fx.snapshots.LOW }), TAMPER_CODE);
        expect(mdFdHint.mutated).toBe(true);
        expect(mdFdHint.finalPhase).toBe(true);
        // Stable other doc, mutated first doc persists via native reads.
        expect(o.readFileSync(mdPath, 'utf8')).toBe(savedMd);
        expect(o.readFileSync(jsonPath, 'utf8')).not.toBe(savedJson);
        expect(readCount).toBeGreaterThan(2);
      } finally {
        disarm();
        o.writeFileSync(jsonPath, savedJson);
        try { o.chmodSync(jsonPath, 0o600); } catch { /* ignore */ }
      }
    });
    it.each(['truncate', 'identical-inode-replacement'] as const)('rejects first-document %s during FINAL Markdown read', async (kind) => {
      const fx = await fixture();
      const prepare = await loadPrepare();
      const ready = await prepare(fx.context);
      const o = orig();
      const jsonPath = fx.path('LOW', 'json');
      const mdPath = fx.path('LOW', 'md');
      const savedJson = o.readFileSync(jsonPath, 'utf8');
      const savedMd = o.readFileSync(mdPath, 'utf8');
      const jsonMetaBefore = o.lstatSync(jsonPath);
      const mdMetaBefore = o.lstatSync(mdPath);
      let mutated = false;
      let readsSeen = 0;
      fsGuard.readHook = (fd, offset) => {
        const p = fsGuard.fdPath.get(fd) ?? '';
        if (p === mdPath && offset === 0) readsSeen++;
        if (p === mdPath && offset === 0 && !mutated && readsSeen === 2) {
          mutated = true;
          expect(fsGuard.reads.filter((r) => r.path === jsonPath && r.offset === 0)).toHaveLength(2);
          if (kind === 'truncate') o.writeFileSync(jsonPath, savedJson.slice(0, 10));
          else {
            const sibling = `${jsonPath}.final-replacement`;
            o.writeFileSync(sibling, savedJson, { mode: 0o600, flag: 'wx' });
            o.renameSync(sibling, jsonPath);
          }
        }
      };
      armVerify();
      try {
        expectFreshSyncFatal(() => ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: fx.snapshots.LOW }), TAMPER_CODE);
        expect(mutated).toBe(true);
        // Final BOTH-document metadata/path checks required: json drifted, md stable.
        expect(readsSeen).toBe(2);
        if (kind === 'truncate') expect(o.lstatSync(jsonPath).size).not.toBe(jsonMetaBefore.size);
        else {
          expect(o.lstatSync(jsonPath).ino).not.toBe(jsonMetaBefore.ino);
          expect(o.readFileSync(jsonPath, 'utf8')).toBe(savedJson);
        }
        expect(o.lstatSync(mdPath).size).toBe(mdMetaBefore.size);
        expect(o.readFileSync(mdPath, 'utf8')).toBe(savedMd);
      } finally {
        disarm();
        o.writeFileSync(jsonPath, savedJson);
        try { o.chmodSync(jsonPath, 0o600); } catch { /* ignore */ }
      }
    });
    it('rechecks FIRST document after FINAL lock check, not only after its final read', async () => {
      const fx = await fixture();
      const prepare = await loadPrepare();
      const ready = await prepare(fx.context);
      const o = orig();
      const lockPath = resolve(fx.root, 'lock.json');
      const savedLock = o.readFileSync(lockPath, 'utf8');
      const jsonPath = fx.path('LOW', 'json'), mdPath = fx.path('LOW', 'md');
      const savedMd = o.readFileSync(mdPath);
      let mutated = false;
      fsGuard.readHook = (fd) => {
        const mdPasses = fsGuard.reads.filter((r) => r.path === mdPath && r.offset === 0).length;
        if (!mutated && fsGuard.fdPath.get(fd) === lockPath && mdPasses === 2) {
          mutated = true;
          o.truncateSync(jsonPath, 10);
        }
      };
      armVerify();
      try {
        expectFreshSyncFatal(() => ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: fx.snapshots.LOW }), TAMPER_CODE);
        expect(mutated).toBe(true);
        expect(o.readFileSync(lockPath, 'utf8')).toBe(savedLock);
        expect(o.readFileSync(mdPath)).toEqual(savedMd);
        expectAllNativeClosed(o);
      } finally {
        disarm();
        o.writeFileSync(lockPath, savedLock);
      }
    });
    it('detects observed root/reports dir mode/inode drift scoped inside fixture', async () => {
      const fx = await fixture();
      const prepare = await loadPrepare();
      const ready = await prepare(fx.context);
      const o = orig();
      const rootStatBefore = o.lstatSync(fx.root);
      const reportsStatBefore = o.lstatSync(fx.reports);
      o.chmodSync(fx.reports, 0o755);
      armVerify();
      try {
        expectFreshSyncFatal(() => ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: fx.snapshots.LOW }), TAMPER_CODE);
        expect(o.lstatSync(fx.reports).mode).not.toBe(reportsStatBefore.mode);
        expect(o.lstatSync(fx.root).ino).toBe(rootStatBefore.ino);
      } finally {
        disarm();
        o.chmodSync(fx.reports, 0o700);
      }
    });
    it('rechecks canonical directories and held lock after final reads with zero verifier writes', async () => {
      const fx = await fixture(true);
      const prepare = await loadPrepare();
      const ready = await prepare(fx.context);
      const o = orig();
      // Snapshot real state BEFORE guard; never assert via wrapped calls while armed.
      const beforeState = fx.state();
      const effectsBefore = { ...fx.effects };
      const namesBefore = o.readdirSync(fx.reports).sort();
      const modesBefore = new Map<string, number>();
      const inosBefore = new Map<string, number>();
      for (const n of namesBefore) {
        const st = o.lstatSync(resolve(fx.reports, n));
        modesBefore.set(n, st.mode);
        inosBefore.set(n, st.ino);
      }
      armVerify();
      armNet();
      try {
        for (const [, snapshot] of fx.allSnapshots) {
          const out = ready.verify({ stage: snapshot.stage, profile: snapshot.profile, snapshot });
          expect(out.receipt.stage).toBe(snapshot.stage);
        }
        // Native checks while armed (original fs bypasses guard).
        expect(o.readdirSync(fx.reports).sort()).toEqual(namesBefore);
        for (const n of namesBefore) {
          expect(o.lstatSync(resolve(fx.reports, n)).mode).toBe(modesBefore.get(n));
          expect(o.lstatSync(resolve(fx.reports, n)).ino).toBe(inosBefore.get(n));
        }
        expect(fx.effects).toEqual(effectsBefore);
      } finally {
        const net = disarmNet();
        disarm();
        expect(net.fetchCalls).toBe(0);
        expect(net.nowCalls).toBe(0);
        // Compare ledger bytes after disarm via wrapped helper.
        expect(fx.state()).toEqual(beforeState);
      }
    });
  });

  describe('guard scope, clock/network silence and ledger stability', () => {
    it('permits only five sync reads during verify and blocks mutations, fsync and async fs', async () => {
      const fx = await fixture();
      const prepare = await loadPrepare();
      const ready = await prepare(fx.context);
      const o = orig();
      // Snapshot BEFORE guard; use originalfs for after-state while armed.
      const before = fx.state();
      const effects = { ...fx.effects };
      const lockBytesBefore = o.readFileSync(resolve(fx.root, 'lock.json'), 'utf8');
      const jsonBytesBefore = o.readFileSync(fx.path('LOW', 'json'), 'utf8');
      armVerify();
      armNet();
      try {
        const out = ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: fx.snapshots.LOW });
        expect(out.receipt.profile).toBe('LOW');
        expect(fsGuard.calls).toEqual([]);
        for (const name of ['writeFileSync', 'mkdirSync', 'chmodSync', 'fsyncSync', 'linkSync', 'unlinkSync', 'renameSync'] as const) {
          expect(fsGuard.calls).not.toContain(name);
        }
        expect(fsGuard.calls.filter((c) => c.startsWith('promises.'))).toEqual([]);
        expect(netGuard.fetchCalls).toBe(0);
        expect(netGuard.nowCalls).toBe(0);
        // Native checks while armed (bypass wrapped forbidden calls).
        expect(o.readFileSync(resolve(fx.root, 'lock.json'), 'utf8')).toBe(lockBytesBefore);
        expect(o.readFileSync(fx.path('LOW', 'json'), 'utf8')).toBe(jsonBytesBefore);
        expect(fx.effects).toEqual(effects);
      } finally {
        disarmNet();
        disarm();
      }
      // Wrapped comparison only after disarm.
      expect(fx.state()).toEqual(before);
    });
    it('keeps ledger counters, modes, inodes, names and bytes stable (ignoring atime)', async () => {
      const fx = await fixture(true);
      const prepare = await loadPrepare();
      const ready = await prepare(fx.context);
      const o = orig();
      const lockStat = o.lstatSync(resolve(fx.root, 'lock.json'));
      const lockMode = lockStat.mode;
      const lockIno = lockStat.ino;
      const lockDev = lockStat.dev;
      const names = o.readdirSync(fx.reports).sort();
      const bytes = new Map<string, string>();
      const modes = new Map<string, number>();
      const inos = new Map<string, number>();
      const devs = new Map<string, number>();
      for (const n of names) {
        const st = o.lstatSync(resolve(fx.reports, n));
        bytes.set(n, o.readFileSync(resolve(fx.reports, n), 'utf8'));
        modes.set(n, st.mode);
        inos.set(n, st.ino);
        devs.set(n, st.dev);
      }
      const effects = { ...fx.effects };
      const ledgerBefore = fx.state();
      const ledgerMetadata = ['ledger.json', 'journal.json', 'lock.json'].map((name) => {
        const st = o.lstatSync(resolve(fx.root, name));
        return { name, mode: st.mode, dev: st.dev, ino: st.ino };
      });
      armVerify();
      try {
        for (const [, snapshot] of fx.allSnapshots) {
          ready.verify({ stage: snapshot.stage, profile: snapshot.profile, snapshot });
        }
        // Native assertions while armed; ignore atime, check dev/ino/mode/names/bytes.
        const afterLock = o.lstatSync(resolve(fx.root, 'lock.json'));
        expect(afterLock.mode).toBe(lockMode);
        expect(afterLock.ino).toBe(lockIno);
        expect(afterLock.dev).toBe(lockDev);
        expect(o.readdirSync(fx.reports).sort()).toEqual(names);
        for (const n of names) {
          const st = o.lstatSync(resolve(fx.reports, n));
          expect(st.mode).toBe(modes.get(n));
          expect(st.ino).toBe(inos.get(n));
          expect(st.dev).toBe(devs.get(n));
          expect(o.readFileSync(resolve(fx.reports, n), 'utf8')).toBe(bytes.get(n));
        }
        expect(fx.effects).toEqual(effects);
        for (const before of ledgerMetadata) {
          const st = o.lstatSync(resolve(fx.root, before.name));
          expect({ name: before.name, mode: st.mode, dev: st.dev, ino: st.ino }).toEqual(before);
        }
        expect(parse(fx.root).root).toBe(parse(resolve(fx.dir, CALIBRATION_ROOT)).root);
      } finally { disarm(); }
      expect(fx.state()).toEqual(ledgerBefore);
    });
    it('uses file-local real-file fixture distinct from source and preserves digests', async () => {
      const fx = await fixture();
      const low = await assembleCalibrationStageReport({ stage: 'preflight', profile: 'LOW', context: fx.context, readSnapshot: () => fx.snapshots.LOW });
      expect(renderNutritionEvalJson(low)).toBe(renderNutritionEvalJson(fx.published.LOW.report));
      expect(renderNutritionEvalMarkdown(low)).toBe(renderNutritionEvalMarkdown(fx.published.LOW.report));
      const prepare = await loadPrepare();
      const ready = await prepare(fx.context);
      const out = ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: fx.snapshots.LOW });
      expect(out.receipt.jsonSha256).toBe(sha256(readFileSync(fx.path('LOW', 'json'))));
      expect(readdirSync(fx.reports).sort()).toEqual(['preflight-low.json', 'preflight-low.md', 'preflight-medium.json', 'preflight-medium.md'].sort());
    });
  });

  describe('mandatory fidelity gaps', () => {
    it.each(['nofollow-absent', 'nofollow-zero', 'nonblock-absent', 'nonblock-zero'] as const)('rejects preparation %s with INPUT and zero fs', async (kind) => {
      const fx = await fixture();
      const prepare = await loadPrepare();
      const mocked = (await import('node:fs')) as unknown as { constants: Record<string, unknown> };
      const savedNofollow = mocked.constants.O_NOFOLLOW;
      const savedNonblock = mocked.constants.O_NONBLOCK;
      if (kind === 'nofollow-absent') delete mocked.constants.O_NOFOLLOW;
      if (kind === 'nofollow-zero') mocked.constants.O_NOFOLLOW = 0;
      if (kind === 'nonblock-absent') delete mocked.constants.O_NONBLOCK;
      if (kind === 'nonblock-zero') mocked.constants.O_NONBLOCK = 0;
      armFactory();
      try {
        await expect(prepare(fx.context)).rejects.toThrow(INPUT);
        expect(fsGuard.calls).toEqual([]);
        expect(fsGuard.opened).toEqual([]);
      } finally {
        disarm();
        // Restore delegated constants only; original platform object untouched.
        if (kind.startsWith('nofollow')) mocked.constants.O_NOFOLLOW = savedNofollow;
        else mocked.constants.O_NONBLOCK = savedNonblock;
      }
    });
    it.each([
      ...(['ancestor', 'root', 'reports', 'lock', 'json', 'md'] as const).flatMap((target) =>
        (['dev-negative', 'ino-negative', 'dev-unsafe', 'ino-unsafe'] as const).map((kind) => ({ target, kind }))),
      ...(['lock', 'json', 'md'] as const).flatMap((target) =>
        (['mtime-nonfinite', 'ctime-nonfinite', 'size-negative', 'size-unsafe'] as const).map((kind) => ({ target, kind }))),
    ])('rejects targeted unsafe $target stat $kind with its precise static class', async ({ target, kind }) => {
      const fx = await fixture();
      const prepare = await loadPrepare();
      const ready = await prepare(fx.context);
      const path = target === 'ancestor' ? resolve(fx.root, '..') : target === 'root' ? fx.root :
        target === 'reports' ? fx.reports : target === 'lock' ? resolve(fx.root, 'lock.json') : fx.path('LOW', target);
      const wrapStat = (real: unknown): unknown => {
        // Retain full real stat behavior via prototype delegation; override one scalar.
        const proto = Object.getPrototypeOf(real);
        const desc = Object.getOwnPropertyDescriptors(real);
        if (kind === 'dev-negative') desc.dev = { ...desc.dev, value: -1 };
        if (kind === 'ino-negative') desc.ino = { ...desc.ino, value: -5 };
        if (kind === 'dev-unsafe') desc.dev = { ...desc.dev, value: Number.MAX_SAFE_INTEGER + 1 };
        if (kind === 'ino-unsafe') desc.ino = { ...desc.ino, value: Number.MAX_SAFE_INTEGER + 1 };
        if (kind === 'mtime-nonfinite') desc.mtimeMs = { ...desc.mtimeMs, value: Number.NaN };
        if (kind === 'ctime-nonfinite') desc.ctimeMs = { ...desc.ctimeMs, value: Number.POSITIVE_INFINITY };
        if (kind === 'size-negative') desc.size = { ...desc.size, value: -1 };
        if (kind === 'size-unsafe') desc.size = { ...desc.size, value: Number.MAX_SAFE_INTEGER + 1 };
        return Object.create(proto, desc);
      };
      let triggered = false;
      fsGuard.lstatOverride = (p, real) => {
        if (p !== path) return undefined;
        triggered = true; return wrapStat(real);
      };
      fsGuard.fstatOverride = (fd, real) => fsGuard.fdPath.get(fd) === path ? wrapStat(real) : undefined;
      armVerify();
      try {
        const expected = target === 'ancestor' || target === 'root' || target === 'lock' ? LOCK_CODE : TAMPER_CODE;
        expectFreshSyncFatal(() => ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: fx.snapshots.LOW }), expected);
        expect(triggered).toBe(true);
        expectAllNativeClosed(orig());
      } finally { disarm(); }
    });
    it.each(['lock-fifo-static', 'json-fifo-static', 'md-fifo-static'] as const)('rejects static FIFO %s without opening it', async (kind) => {
      const fx = await fixture();
      const prepare = await loadPrepare();
      const ready = await prepare(fx.context);
      const o = orig();
      const target = kind === 'lock-fifo-static' ? resolve(fx.root, 'lock.json') : kind === 'json-fifo-static' ? fx.path('LOW', 'json') : fx.path('LOW', 'md');
      const saved = o.readFileSync(target, 'utf8');
      o.unlinkSync(target);
      execFileSync('mkfifo', [target]);
      const expected = kind === 'lock-fifo-static' ? LOCK_CODE : TAMPER_CODE;
      armVerify();
      try {
        expectFreshSyncFatal(() => ready.verify({ stage: 'preflight', profile: 'LOW', snapshot: fx.snapshots.LOW }), expected);
      } finally {
        disarm();
        try { o.unlinkSync(target); } catch { /* ignore */ }
        o.writeFileSync(target, saved, { mode: 0o600 });
        try { o.chmodSync(target, 0o600); } catch { /* ignore */ }
      }
    });
  });
});
