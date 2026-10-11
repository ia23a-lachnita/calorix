/**
 * Task 2 foundation: opt-in authoritative report admission RED scaffold.
 *
 * Exercises the real legacy fourth-option ledger, genuine native publication
 * and verification, and the future fifth-option/marker/admission contracts
 * through the shared authoritative fixture. Missing production behavior
 * (trailing fifth option, mode marker, admission API) fails at runtime;
 * nothing is mocked in the production ledger.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync, renameSync as nativeRenameSync, rmSync, statSync, writeFileSync, writeSync as nativeFdWriteSync } from 'node:fs';
import { basename, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  makeAuthoritativeFixture,
  makeAuthoritativeOwner,
} from './calibration-authoritative-fixtures';
import type {
  AuthoritativeFixture,
  AuthoritativeTestLedger,
  TestAuthoritativeVerifyOptions,
} from './calibration-authoritative-fixtures';
import type { CalibrationOwner } from '../../src/nutrition-eval/calibration';
import {
  evaluateCalibrationStageGate,
  selectCalibrationProfile,
} from '../../src/nutrition-eval/calibration';
import { measureCalibrationStageReport } from '../../src/nutrition-eval/calibration-report-measurements';
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';

const sdkGuard = vi.hoisted(() => ({ constructCalls: 0 }));
const networkGuard = vi.hoisted(() => {
  const state = { attemptCalls: 0 };
  const holder = globalThis as unknown as Record<string, unknown> & {
    __authoritativeFetchGuard?: { original: unknown; hadOwn: boolean };
  };
  const original = (globalThis as unknown as Record<string, unknown>)['fetch'];
  const hadOwn = Object.prototype.hasOwnProperty.call(globalThis, 'fetch');
  holder.__authoritativeFetchGuard = { original, hadOwn };
  (globalThis as unknown as Record<string, unknown>)['fetch'] = (..._args: unknown[]) => {
    state.attemptCalls += 1;
    throw new Error('authoritative-test-network-guard: fetch forbidden');
  };
  return state;
});
const fsObserver = vi.hoisted(() => ({ mkdtempPaths: [] as string[] }));

vi.mock('@google/genai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/genai')>();
  class GuardedGoogleGenAI {
    constructor() {
      sdkGuard.constructCalls += 1;
      throw new Error('authoritative-test-sdk-guard: GoogleGenAI construction forbidden');
    }
  }
  return { ...actual, GoogleGenAI: GuardedGoogleGenAI };
});

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const path = await import('node:path');
  const url = await import('node:url');
  const resolveExpectedParent = (): string => {
    const configured = process.env.TMPDIR;
    if (typeof configured === 'string' && configured.trim().length > 0) {
      return path.resolve(configured);
    }
    return path.resolve(
      url.fileURLToPath(new URL('.', import.meta.url)),
      '../../lib/calibration-authoritative-test-tmp',
    );
  };
  const wrappedMkdtempSync = (...args: Parameters<typeof actual.mkdtempSync>): string => {
    const parent = resolveExpectedParent();
    const expectedPrefix = path.resolve(parent, 'authoritative-reports-');
    const created = (actual.mkdtempSync as (...a: typeof args) => string)(...args);
    const requestedPrefix = args[0] as unknown;
    if (
      requestedPrefix === expectedPrefix &&
      typeof created === 'string' &&
      path.dirname(created) === parent &&
      path.basename(created).startsWith('authoritative-reports-')
    ) {
      (fsObserver.mkdtempPaths as string[]).push(created);
    }
    return created;
  };
  return { ...actual, mkdtempSync: wrappedMkdtempSync };
});

const tracked: AuthoritativeFixture[] = [];
// This guards SDK construction/fetch only, not every possible transport or
// full controller dispatch.
beforeAll(() => {
  expect(sdkGuard.constructCalls).toBe(0);
  expect(networkGuard.attemptCalls).toBe(0);
});
beforeEach(() => {
  try {
    expect(sdkGuard.constructCalls).toBe(0);
    expect(networkGuard.attemptCalls).toBe(0);
  } finally {
    sdkGuard.constructCalls = 0;
    networkGuard.attemptCalls = 0;
    fsObserver.mkdtempPaths.length = 0;
  }
});
afterEach(() => {
  try {
    expect(sdkGuard.constructCalls).toBe(0);
    expect(networkGuard.attemptCalls).toBe(0);
  } finally {
    while (tracked.length > 0) {
      const fixture = tracked.pop();
      try {
        fixture?.cleanup();
      } catch {
        // Best effort.
      }
    }
    const owned = [...fsObserver.mkdtempPaths];
    fsObserver.mkdtempPaths.length = 0;
    for (const dir of owned) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Best-effort fallback only; in-test assertions own the contract.
      }
    }
  }
});
afterAll(() => {
  const holder = globalThis as unknown as Record<string, unknown> & {
    __authoritativeFetchGuard?: { original: unknown; hadOwn: boolean };
  };
  const saved = holder.__authoritativeFetchGuard;
  if (saved !== undefined) {
    if (saved.hadOwn) {
      (globalThis as unknown as Record<string, unknown>)['fetch'] = saved.original;
    } else {
      delete (globalThis as unknown as Record<string, unknown>)['fetch'];
    }
    delete holder.__authoritativeFetchGuard;
  }
});
async function openFixture(
  owner: Readonly<CalibrationOwner> = makeAuthoritativeOwner(0),
  acquire = true,
): Promise<AuthoritativeFixture> {
  const fixture = await makeAuthoritativeFixture(owner, { acquire });
  tracked.push(fixture);
  return fixture;
}
async function completeOptOutPreflight(fixture: AuthoritativeFixture): Promise<void> {
  fixture.ledger.completeStage('preflight', { stage: 'preflight', passed: true, completedStages: [] });
}
async function advanceOptOutToValidation(fixture: AuthoritativeFixture): Promise<void> {
  fixture.ledger.completeStage('preflight', { stage: 'preflight', passed: true, completedStages: [] });
  await fixture.finishDevelopment('LOW', 'exact');
  await fixture.finishDevelopment('MEDIUM', 'exact');
  fixture.ledger.recordProfileSelection('MEDIUM', 'default_medium_tie_breaker', {
    stage: 'development',
    passed: true,
    completedStages: ['preflight'],
  });
  fixture.ledger.completeStage('development', {
    stage: 'development',
    passed: true,
    completedStages: ['preflight'],
  });
}
function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}
function captureFifthResult(
  fixture: AuthoritativeFixture,
  fifth: unknown,
): unknown {
  try {
    fixture.createLedger(
      fixture.reportOptions,
      fifth as TestAuthoritativeVerifyOptions,
    );
  } catch (error) {
    return error;
  }
  return undefined;
}
function expectOptionsInvalid(caught: unknown, reads: number): void {
  expect(reads).toBe(0);
  expect(caught).toBeInstanceOf(CalibrationFatalError);
  expect((caught as Error).message).toBe('calibration:report-authority-options-invalid');
  expect(asRecord(caught).cause).toBeUndefined();
}
function acquireWith(
  fixture: AuthoritativeFixture,
  reportOptions: Parameters<AuthoritativeFixture['createLedger']>[0],
  fifth: Parameters<AuthoritativeFixture['createLedger']>[1],
): unknown {
  try {
    const ledger = fixture.createLedger(reportOptions, fifth);
    ledger.acquireLock({ ...fixture.owner });
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('authoritative fixture controls (genuine native artifacts)', () => {
  it('records exactly one preflight image outcome per profile from genuine scored journals', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    for (const profile of ['LOW', 'MEDIUM'] as const) {
      const snapshot = fixture.ledger.getStageReportSnapshot('preflight', profile);
      expect(snapshot.images).toHaveLength(1);
      expect(snapshot.nonReservations).toHaveLength(0);
      expect(snapshot.counts).toEqual({
        imageCallsReserved: 1,
        imageCallsCompleted: 1,
        imageCallsFailed: 0,
        imageCallsPending: 0,
      });
      expect(typeof snapshot.startedAt).toBe('string');
    }
    expect(sdkGuard.constructCalls).toBe(0);
    expect(networkGuard.attemptCalls).toBe(0);
    expect(fixture.receiptEvents()).toHaveLength(0);
  });
  it('publishes genuine JSON and Markdown artifacts verified by the native reader', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    await fixture.publish('preflight', 'MEDIUM');
    for (const profile of ['LOW', 'MEDIUM'] as const) {
      const jsonPath = fixture.artifactPath('preflight', profile, 'json');
      const markdownPath = fixture.artifactPath('preflight', profile, 'md');
      const parsed = JSON.parse(readFileSync(jsonPath, 'utf8')) as {
        cases: unknown[];
        runId: string;
        publicCases: number;
      };
      expect(parsed.cases).toHaveLength(1);
      expect(parsed.publicCases).toBe(1);
      expect(typeof parsed.runId).toBe('string');
      const markdown = readFileSync(markdownPath, 'utf8');
      expect(markdown.startsWith('# Nutrition evaluation report')).toBe(true);
      expect(statSync(jsonPath).mode & 0o777).toBe(0o600);
      expect(statSync(markdownPath).mode & 0o777).toBe(0o600);
    }
    expect(statSync(dirname(fixture.artifactPath('preflight', 'LOW', 'json'))).mode & 0o777).toBe(
      0o700,
    );
    expect(fixture.effects.verifierCalls).toBe(2);
    expect(sdkGuard.constructCalls).toBe(0);
    expect(networkGuard.attemptCalls).toBe(0);
    expect(fixture.receiptEvents()).toHaveLength(0);
  });
});

describe('trailing fifth option capture', () => {
  it('accepts a closed plain fifth with one callable field and keeps the caller usable', async () => {
    const fixture = await openFixture();
    const fifth = {
      verifyStageReportArtifacts: fixture.verifierOptions.verifyStageReportArtifacts,
    } as Record<string, unknown>;
    const ledger = fixture.createLedger(
      fixture.reportOptions,
      fifth as unknown as TestAuthoritativeVerifyOptions,
    );
    expect(typeof ledger.getStageReportSnapshot).toBe('function');
    expect(ledger.getCounts()).toEqual({ tokenCountReserved: 0, imageReserved: 0 });
    fifth.replaced = true;
    expect(ledger.getCounts()).toEqual({ tokenCountReserved: 0, imageReserved: 0 });
    expect(fixture.effects.verifierCalls).toBe(0);
  });
  it('accepts a null-prototype fifth with one callable field', async () => {
    const fixture = await openFixture();
    const fifth = Object.assign(Object.create(null) as Record<string, unknown>, {
      verifyStageReportArtifacts: fixture.verifierOptions.verifyStageReportArtifacts,
    });
    const ledger = fixture.createLedger(
      fixture.reportOptions,
      fifth as unknown as TestAuthoritativeVerifyOptions,
    );
    expect(typeof ledger.getStageReportSnapshot).toBe('function');
    expect(fixture.effects.verifierCalls).toBe(0);
  });
  it('rejects an accessor fifth without invoking the getter', async () => {
    const fixture = await openFixture();
    let getterCalls = 0;
    const fifth = {};
    Object.defineProperty(fifth, 'verifyStageReportArtifacts', {
      enumerable: true,
      configurable: true,
      get: (): unknown => {
        getterCalls += 1;
        return fixture.verifierOptions.verifyStageReportArtifacts;
      },
    });
    expectOptionsInvalid(captureFifthResult(fixture, fifth), getterCalls);
  });
  it('rejects a symbol-keyed fifth with fresh errors', async () => {
    const fixture = await openFixture();
    const build = (): Record<string | symbol, unknown> => {
      const fifth = {
        verifyStageReportArtifacts: fixture.verifierOptions.verifyStageReportArtifacts,
      } as Record<string | symbol, unknown>;
      fifth[Symbol('extra')] = 1;
      return fifth;
    };
    const first = captureFifthResult(fixture, build());
    expectOptionsInvalid(first, 0);
    const second = captureFifthResult(fixture, build());
    expectOptionsInvalid(second, 0);
    expect(second === first).toBe(false);
  });
  it('rejects a hidden nonenumerable fifth field', async () => {
    const fixture = await openFixture();
    const fifth = {
      verifyStageReportArtifacts: fixture.verifierOptions.verifyStageReportArtifacts,
    };
    Object.defineProperty(fifth, 'hidden', { enumerable: false, value: 1 });
    expectOptionsInvalid(captureFifthResult(fixture, fifth), 0);
  });
  it('rejects a present-undefined fifth value', async () => {
    const fixture = await openFixture();
    const fifth = {
      verifyStageReportArtifacts: fixture.verifierOptions.verifyStageReportArtifacts,
      extra: undefined,
    };
    expectOptionsInvalid(captureFifthResult(fixture, fifth), 0);
  });
  it('rejects a foreign-prototype fifth', async () => {
    const fixture = await openFixture();
    const fifth = {
      verifyStageReportArtifacts: fixture.verifierOptions.verifyStageReportArtifacts,
    };
    Object.setPrototypeOf(fifth, { marker: 1 });
    expectOptionsInvalid(captureFifthResult(fixture, fifth), 0);
  });
  it('rejects a non-callable fifth value', async () => {
    const fixture = await openFixture();
    expectOptionsInvalid(captureFifthResult(fixture, { verifyStageReportArtifacts: 7 }), 0);
  });
  it('rejects an extra-field fifth', async () => {
    const fixture = await openFixture();
    expectOptionsInvalid(
      captureFifthResult(fixture, {
        verifyStageReportArtifacts: fixture.verifierOptions.verifyStageReportArtifacts,
        extra: 1,
      }),
      0,
    );
  });
  it('rejects a fifth without fourth report options', async () => {
    const fixture = await openFixture();
    let caught: unknown;
    try {
      fixture.createLedger(undefined, fixture.verifierOptions);
    } catch (error) {
      caught = error;
    }
    expectOptionsInvalid(caught, 0);
  });
  it('hostile throwing traps yield fresh static errors without foreign reads', async () => {
    const fixture = await openFixture();
    let messageReads = 0;
    let causeReads = 0;
    let stackReads = 0;
    const foreign = new Error('foreign-boom');
    Object.defineProperty(foreign, 'message', {
      enumerable: true,
      get: (): string => {
        messageReads += 1;
        return 'foreign-boom';
      },
    });
    Object.defineProperty(foreign, 'cause', {
      enumerable: true,
      get: (): unknown => {
        causeReads += 1;
        return undefined;
      },
    });
    let stackTracked = false;
    try {
      Object.defineProperty(foreign, 'stack', {
        enumerable: true,
        get: (): string => {
          stackReads += 1;
          return 'foreign-stack';
        },
      });
      stackTracked = true;
    } catch {
      stackTracked = false;
    }
    const build = (): unknown =>
      new Proxy(
        { verifyStageReportArtifacts: fixture.verifierOptions.verifyStageReportArtifacts },
        {
          getOwnPropertyDescriptor(): PropertyDescriptor | undefined {
            throw foreign;
          },
        },
      );
    const first = captureFifthResult(fixture, build());
    expect(messageReads).toBe(0);
    expect(causeReads).toBe(0);
    if (stackTracked) {
      expect(stackReads).toBe(0);
    }
    expect(first).toBeInstanceOf(CalibrationFatalError);
    expect(first === foreign).toBe(false);
    expect((first as Error).message).toBe('calibration:report-authority-options-invalid');
    expect(asRecord(first).cause).toBeUndefined();
    const second = captureFifthResult(fixture, build());
    expect(second).toBeInstanceOf(CalibrationFatalError);
    expect(second === first).toBe(false);
    expect(messageReads).toBe(0);
    expect(causeReads).toBe(0);
    if (stackTracked) {
      expect(stackReads).toBe(0);
    }
  });
  it('captured callable survives later property replacement', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    const original = fixture.verifierOptions.verifyStageReportArtifacts;
    const before = fixture.effects.verifierCalls;
    let swappedCalls = 0;
    (fixture.verifierOptions as unknown as Record<string, unknown>).verifyStageReportArtifacts =
      () => {
        swappedCalls += 1;
        throw new Error('swapped-dependency');
      };
    expect(
      (fixture.verifierOptions as unknown as Record<string, unknown>)
        .verifyStageReportArtifacts === original,
    ).toBe(false);
    const receipt = fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    expect(receipt.profile).toBe('LOW');
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(swappedCalls).toBe(0);
    expect(fixture.effects.verifierCalls).toBe(before + 1);
  });
  it('three-argument compatibility is preserved', async () => {
    const fixture = await openFixture(makeAuthoritativeOwner(30), false);
    const ledger = fixture.createLedger(undefined, undefined);
    expect(typeof ledger.getStageReportSnapshot).toBe('function');
    expect(ledger.getCounts()).toEqual({ tokenCountReserved: 0, imageReserved: 0 });
    expect(fixture.effects.verifierCalls).toBe(0);
  });
  it('four-argument compatibility is preserved', async () => {
    const fixture = await openFixture(makeAuthoritativeOwner(31), false);
    const ledger = fixture.createLedger(fixture.reportOptions, undefined);
    expect(typeof ledger.getStageReportSnapshot).toBe('function');
    expect(ledger.getCounts()).toEqual({ tokenCountReserved: 0, imageReserved: 0 });
    expect(fixture.effects.verifierCalls).toBe(0);
  });
});

describe('authoritative stream marker', () => {
  it('opt-out acquire on an empty stream writes the legacy closed three-field header', async () => {
    const fixture = await openFixture(makeAuthoritativeOwner(11), false);
    const caught = acquireWith(fixture, fixture.reportOptions, undefined);
    expect(caught).toBeUndefined();
    const events = fixture.ledgerEvents();
    expect(events).toHaveLength(1);
    const header = events[0] as Record<string, unknown>;
    expect(Object.keys(header).sort()).toEqual(['at', 'identity', 'type']);
    expect(header.type).toBe('protocol_identity');
    expect(fixture.effects.verifierCalls).toBe(0);
    expect(fixture.receiptEvents()).toHaveLength(0);
  });
  it('opt-in acquire on an empty stream writes the exact four-field authoritative marker', async () => {
    const fixture = await openFixture(makeAuthoritativeOwner(10), false);
    const caught = acquireWith(fixture, fixture.reportOptions, fixture.verifierOptions);
    expect(caught).toBeUndefined();
    const events = fixture.ledgerEvents();
    expect(events).toHaveLength(1);
    const header = events[0] as Record<string, unknown>;
    expect(Object.keys(header).sort()).toEqual(['at', 'identity', 'reportAuthority', 'type']);
    expect(header.type).toBe('protocol_identity');
    expect(header.reportAuthority).toBe('verified_artifacts_v1');
    expect(fixture.effects.ledgerAppends).toBeGreaterThan(0);
    expect(fixture.effects.fsyncs).toBeGreaterThan(0);
    expect(fixture.effects.journalAppends).toBe(0);
    expect(fixture.effects.verifierCalls).toBe(0);
    expect(fixture.receiptEvents()).toHaveLength(0);
  });
  it('opt-in acquire refuses a legacy stream (upgrade refused)', async () => {
    const fixture = await openFixture(makeAuthoritativeOwner(12), false);
    const optOut = fixture.createLedger(fixture.reportOptions, undefined);
    optOut.acquireLock({ ...fixture.owner });
    optOut.releaseLock({ ...fixture.owner });
    const caught = acquireWith(fixture, fixture.reportOptions, fixture.verifierOptions);
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect((caught as Error).message).toBe('calibration:report-authority-mode-mismatch');
    expect(asRecord(caught).cause).toBeUndefined();
    expect(fixture.effects.verifierCalls).toBe(0);
  });
  it('opt-out acquire refuses a marked stream (downgrade refused)', async () => {
    const fixture = await openFixture(makeAuthoritativeOwner(13), false);
    fixture.appendRawLedgerEvent({
      type: 'protocol_identity',
      identity: JSON.parse(JSON.stringify(fixture.identity)),
      at: '2026-10-11T00:00:00.000Z',
      reportAuthority: 'verified_artifacts_v1',
    });
    const caught = acquireWith(fixture, fixture.reportOptions, undefined);
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect((caught as Error).message).toBe('calibration:report-authority-mode-mismatch');
    expect(asRecord(caught).cause).toBeUndefined();
    expect(fixture.effects.verifierCalls).toBe(0);
  });
  it('opt-in acquire refuses a nonempty stream without a header', async () => {
    const fixture = await openFixture(makeAuthoritativeOwner(14), false);
    fixture.appendRawLedgerEvent({
      type: 'model_version_pinned',
      version: 'gemini-3.8-fixture-pin',
      at: '2026-10-11T00:00:00.000Z',
    });
    const caught = acquireWith(fixture, fixture.reportOptions, fixture.verifierOptions);
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect((caught as Error).message).toBe('calibration:ledger-event-malformed:protocol_identity');
    expect(asRecord(caught).cause).toBeUndefined();
    expect(fixture.effects.verifierCalls).toBe(0);
  });
  it('opt-in acquire refuses a wrong marker value', async () => {
    const fixture = await openFixture(makeAuthoritativeOwner(15), false);
    fixture.appendRawLedgerEvent({
      type: 'protocol_identity',
      identity: JSON.parse(JSON.stringify(fixture.identity)),
      at: '2026-10-11T00:00:00.000Z',
      reportAuthority: 'bogus-marker',
    });
    const caught = acquireWith(fixture, fixture.reportOptions, fixture.verifierOptions);
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect((caught as Error).message).toBe('calibration:ledger-event-malformed:protocol_identity');
    expect(asRecord(caught).cause).toBeUndefined();
    expect(fixture.effects.verifierCalls).toBe(0);
  });
  it('opt-in acquire refuses an extra marker field', async () => {
    const fixture = await openFixture(makeAuthoritativeOwner(16), false);
    fixture.appendRawLedgerEvent({
      type: 'protocol_identity',
      identity: JSON.parse(JSON.stringify(fixture.identity)),
      at: '2026-10-11T00:00:00.000Z',
      reportAuthority: 'verified_artifacts_v1',
      extra: 1,
    });
    const caught = acquireWith(fixture, fixture.reportOptions, fixture.verifierOptions);
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect((caught as Error).message).toBe('calibration:ledger-event-malformed:protocol_identity');
    expect(asRecord(caught).cause).toBeUndefined();
    expect(fixture.effects.verifierCalls).toBe(0);
  });
  it('constructing ledgers performs zero artifact verifier calls', async () => {
    const fixture = await openFixture(makeAuthoritativeOwner(17), false);
    fixture.createLedger(fixture.reportOptions, fixture.verifierOptions);
    fixture.createLedger(fixture.reportOptions, undefined);
    expect(fixture.effects.verifierCalls).toBe(0);
  });
});

describe('preflight admission gates completion (representative)', () => {
  it('admitting LOW only leaves completion blocked until MEDIUM is admitted', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    await fixture.publish('preflight', 'MEDIUM');
    const low = fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    expect(low.profile).toBe('LOW');
    expect(fixture.receiptEvents()).toHaveLength(1);
    expect(() =>
      fixture.ledger.completeStage('preflight', {
        stage: 'preflight',
        passed: true,
        completedStages: [],
      }),
    ).toThrow('calibration:artifact-receipt-required');
    fixture.ledger.admitStageReportReceipt('preflight', 'MEDIUM');
    expect(fixture.receiptEvents()).toHaveLength(2);
    fixture.ledger.completeStage('preflight', {
      stage: 'preflight',
      passed: true,
      completedStages: [],
    });
    expect(fixture.ledger.getCompletedStages()).toEqual(['preflight']);
  });
});
describe('preflight native authority (both receipts, measured success)', () => {
  it('requires both native receipts with successful 1/1 measured reports', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    await fixture.publish('preflight', 'MEDIUM');
    const low = fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    const medium = fixture.ledger.admitStageReportReceipt('preflight', 'MEDIUM');
    expect(low.stage).toBe('preflight');
    expect(low.profile).toBe('LOW');
    expect(medium.stage).toBe('preflight');
    expect(medium.profile).toBe('MEDIUM');
    expect(typeof low.runId).toBe('string');
    expect(low.runId.length).toBeGreaterThan(0);
    expect(low.jsonSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(low.markdownSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.isFrozen(low)).toBe(true);
    expect(Object.isFrozen(medium)).toBe(true);
    expect(fixture.receiptEvents()).toHaveLength(2);
    for (const profile of ['LOW', 'MEDIUM'] as const) {
      const text = readFileSync(fixture.artifactPath('preflight', profile, 'json'), 'utf8');
      const measured = measureCalibrationStageReport(JSON.parse(text));
      expect(measured.profile.parseCount).toBe(1);
      expect(measured.profile.unsafeCount).toBe(0);
      expect(measured.profile.catastrophicCount).toBe(0);
      expect(measured.stage.totalOutcomes).toBe(1);
      expect(measured.stage.parseCases).toBe(1);
      expect(measured.stage.failureCount).toBe(0);
      expect(measured.latency.measuredCases).toBe(1);
      expect(measured.latency.missingCases).toBe(0);
    }
    const tokenCounts = fixture.ledger.getCounts();
    expect(tokenCounts.tokenCountReserved).toBeGreaterThan(0);
    expect(fixture.identity).toBeDefined();
    expect(sdkGuard.constructCalls).toBe(0);
    expect(networkGuard.attemptCalls).toBe(0);
  });
  it('caller passed true cannot manufacture preflight success without both receipts', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    await fixture.publish('preflight', 'MEDIUM');
    fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    const appends = fixture.effects.ledgerAppends;
    const clocks = fixture.effects.clockReads;
    const syncs = fixture.effects.fsyncs;
    let caught: unknown;
    try {
      fixture.ledger.completeStage('preflight', {
        stage: 'preflight',
        passed: true,
        completedStages: [],
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect((caught as Error).message).toBe('calibration:artifact-receipt-required');
    expect(asRecord(caught).cause).toBeUndefined();
    expect(fixture.ledger.getCompletedStages()).toEqual([]);
    expect(fixture.effects.ledgerAppends).toBe(appends);
    expect(fixture.effects.clockReads).toBe(clocks);
    expect(fixture.effects.fsyncs).toBe(syncs);
    expect(fixture.receiptEvents()).toHaveLength(1);
  });
});
describe('development measured winner and reason (seven genuine rows)', () => {
  const rows = [
    {
      name: 'unsafe lower wins',
      low: 'exact' as const,
      medium: { unsafeIndices: [0] } as const,
      winner: 'LOW' as const,
      reason: 'fewer_unsafe' as const,
    },
    {
      name: 'parse higher wins',
      low: 'exact' as const,
      medium: { failures: [0] } as const,
      winner: 'LOW' as const,
      reason: 'higher_parse' as const,
    },
    {
      name: 'catastrophic fewer wins',
      low: 'exact' as const,
      medium: { catastrophicIndices: [0] } as const,
      winner: 'LOW' as const,
      reason: 'fewer_catastrophic' as const,
    },
    {
      name: 'macro lower wins',
      low: 'exact' as const,
      medium: { proteinScale: 1.5 } as const,
      winner: 'LOW' as const,
      reason: 'lower_macro_error' as const,
    },
    {
      name: 'kcal lower wins',
      low: 'exact' as const,
      medium: { kcalScale: 1.5 } as const,
      winner: 'LOW' as const,
      reason: 'lower_kcal_error' as const,
    },
    {
      name: 'latency lower wins',
      low: { latencyMs: 1000 } as const,
      medium: { latencyMs: 2000 } as const,
      winner: 'LOW' as const,
      reason: 'lower_latency' as const,
    },
    {
      name: 'complete tie breaks MEDIUM',
      low: 'exact' as const,
      medium: 'exact' as const,
      winner: 'MEDIUM' as const,
      reason: 'default_medium_tie_breaker' as const,
    },
  ];
  for (const row of rows) {
    it(`measured ${row.name} selects ${row.winner} for ${row.reason}`, async () => {
      const fixture = await openFixture();
      await fixture.finishPreflight();
      await fixture.publish('preflight', 'LOW');
      await fixture.publish('preflight', 'MEDIUM');
      fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
      fixture.ledger.admitStageReportReceipt('preflight', 'MEDIUM');
      fixture.ledger.completeStage('preflight', { stage: 'preflight', passed: true, completedStages: [] });
      await fixture.finishDevelopment('LOW', row.low);
      await fixture.finishDevelopment('MEDIUM', row.medium);
      await fixture.publish('development', 'LOW');
      await fixture.publish('development', 'MEDIUM');
      fixture.ledger.admitStageReportReceipt('development', 'LOW');
      fixture.ledger.admitStageReportReceipt('development', 'MEDIUM');
      const lowNative = measureCalibrationStageReport(
        JSON.parse(readFileSync(fixture.artifactPath('development', 'LOW', 'json'), 'utf8')),
      );
      const medNative = measureCalibrationStageReport(
        JSON.parse(readFileSync(fixture.artifactPath('development', 'MEDIUM', 'json'), 'utf8')),
      );
      if (row.name === 'unsafe lower wins') {
        expect(lowNative.profile.unsafeCount).toBe(0);
        expect(medNative.profile.unsafeCount).toBe(1);
      } else if (row.name === 'parse higher wins') {
        expect(lowNative.profile.parseCount).toBe(24);
        expect(medNative.profile.parseCount).toBe(23);
      } else if (row.name === 'catastrophic fewer wins') {
        expect(lowNative.profile.catastrophicCount).toBe(0);
        expect(medNative.profile.catastrophicCount).toBe(1);
      } else if (row.name === 'macro lower wins') {
        expect(lowNative.stage.meanZeroSafeMacroRelativeError).toBe(0);
        expect(medNative.stage.meanZeroSafeMacroRelativeError).toBeGreaterThan(0);
      } else if (row.name === 'kcal lower wins') {
        expect(lowNative.stage.medianRelativeCalorieError).toBe(0);
        expect(medNative.stage.medianRelativeCalorieError).toBeGreaterThan(0);
      } else if (row.name === 'latency lower wins') {
        expect(lowNative.stage.p90AnalysisLatencyMs).toBe(1000);
        expect(medNative.stage.p90AnalysisLatencyMs).toBe(2000);
      } else {
        expect(lowNative.profile.parseCount).toBe(24);
        expect(medNative.profile.parseCount).toBe(24);
        expect(lowNative.stage.medianRelativeCalorieError).toBe(0);
        expect(medNative.stage.medianRelativeCalorieError).toBe(0);
      }
      fixture.ledger.recordProfileSelection(row.winner, row.reason, {
        stage: 'development',
        passed: true,
        completedStages: ['preflight'],
      });
      expect(fixture.ledger.getSelectedProfile()).toBe(row.winner);
      expect(sdkGuard.constructCalls).toBe(0);
      expect(networkGuard.attemptCalls).toBe(0);
    });
  }
  it('rejects wrong profile and wrong reason before effects then accepts exact decision', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    await fixture.publish('preflight', 'MEDIUM');
    fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    fixture.ledger.admitStageReportReceipt('preflight', 'MEDIUM');
    fixture.ledger.completeStage('preflight', { stage: 'preflight', passed: true, completedStages: [] });
    await fixture.finishDevelopment('LOW', { latencyMs: 1000 });
    await fixture.finishDevelopment('MEDIUM', { latencyMs: 2000 });
    await fixture.publish('development', 'LOW');
    await fixture.publish('development', 'MEDIUM');
    fixture.ledger.admitStageReportReceipt('development', 'LOW');
    fixture.ledger.admitStageReportReceipt('development', 'MEDIUM');
    const lowMeasured = measureCalibrationStageReport(
      JSON.parse(readFileSync(fixture.artifactPath('development', 'LOW', 'json'), 'utf8')),
    );
    const medMeasured = measureCalibrationStageReport(
      JSON.parse(readFileSync(fixture.artifactPath('development', 'MEDIUM', 'json'), 'utf8')),
    );
    expect(lowMeasured.stage.p90AnalysisLatencyMs).toBe(1000);
    expect(medMeasured.stage.p90AnalysisLatencyMs).toBe(2000);
    expect(lowMeasured.profile.parseCount).toBe(24);
    expect(medMeasured.profile.parseCount).toBe(24);
    let first: unknown;
    const appends = fixture.effects.ledgerAppends;
    const clocks = fixture.effects.clockReads;
    const syncs = fixture.effects.fsyncs;
    try {
      fixture.ledger.recordProfileSelection('MEDIUM', 'lower_latency', {
        stage: 'development',
        passed: true,
        completedStages: ['preflight'],
      });
    } catch (error) {
      first = error;
    }
    expect(first).toBeInstanceOf(CalibrationFatalError);
    expect((first as Error).message).toBe('calibration:artifact-selection-mismatch');
    expect(asRecord(first).cause).toBeUndefined();
    expect(fixture.effects.ledgerAppends).toBe(appends);
    expect(fixture.effects.clockReads).toBe(clocks);
    expect(fixture.effects.fsyncs).toBe(syncs);
    let second: unknown;
    try {
      fixture.ledger.recordProfileSelection('LOW', 'fewer_unsafe', {
        stage: 'development',
        passed: true,
        completedStages: ['preflight'],
      });
    } catch (error) {
      second = error;
    }
    expect(second).toBeInstanceOf(CalibrationFatalError);
    expect((second as Error).message).toBe('calibration:artifact-selection-mismatch');
    expect(fixture.ledger.getSelectedProfile()).toBeUndefined();
    fixture.ledger.recordProfileSelection('LOW', 'lower_latency', {
      stage: 'development',
      passed: true,
      completedStages: ['preflight'],
    });
    expect(fixture.ledger.getSelectedProfile()).toBe('LOW');
  });
  it('scaled macro faults yield literal 24/23 measured means before admission exists', async () => {
    const fixture = await makeAuthoritativeFixture(makeAuthoritativeOwner(92), { authoritative: false });
    tracked.push(fixture);
    await fixture.finishPreflight();
    await completeOptOutPreflight(fixture);
    await fixture.finishDevelopment('LOW', { proteinScale: 2, carbsScale: 2, fatScale: 2 });
    await fixture.finishDevelopment('MEDIUM', { failures: [0] });
    await fixture.publish('development', 'LOW');
    await fixture.publish('development', 'MEDIUM');
    const lowText = readFileSync(fixture.artifactPath('development', 'LOW', 'json'), 'utf8');
    const medText = readFileSync(fixture.artifactPath('development', 'MEDIUM', 'json'), 'utf8');
    const lowMeasured = measureCalibrationStageReport(JSON.parse(lowText));
    const medMeasured = measureCalibrationStageReport(JSON.parse(medText));
    expect(lowMeasured.stage.totalOutcomes).toBe(24);
    expect(lowMeasured.stage.parseCases).toBe(24);
    expect(lowMeasured.stage.medianRelativeCalorieError).toBe(0);
    expect(lowMeasured.stage.meanZeroSafeMacroRelativeError).toBe(1);
    expect(lowMeasured.profile.unsafeCount).toBe(0);
    expect(lowMeasured.profile.catastrophicCount).toBe(0);
    expect(medMeasured.stage.totalOutcomes).toBe(24);
    expect(medMeasured.stage.parseCases).toBe(23);
    expect(medMeasured.stage.medianRelativeCalorieError).toBe(0);
    expect(medMeasured.stage.meanZeroSafeMacroRelativeError).toBe(0);
    expect(medMeasured.profile.unsafeCount).toBe(0);
    expect(medMeasured.profile.catastrophicCount).toBe(0);
    const lowGate = evaluateCalibrationStageGate('development', lowMeasured.stage);
    expect(lowGate.passed).toBe(false);
    expect(lowGate.failedChecks).toContain('meanZeroSafeMacroRelativeError');
    const medGate = evaluateCalibrationStageGate('development', medMeasured.stage);
    expect(medGate.passed).toBe(true);
    expect(sdkGuard.constructCalls).toBe(0);
    expect(networkGuard.attemptCalls).toBe(0);
  });
  it('failing measured winner cannot be overridden by a worse but passing profile', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    await fixture.publish('preflight', 'MEDIUM');
    fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    fixture.ledger.admitStageReportReceipt('preflight', 'MEDIUM');
    fixture.ledger.completeStage('preflight', { stage: 'preflight', passed: true, completedStages: [] });
    await fixture.finishDevelopment('LOW', { proteinScale: 2, carbsScale: 2, fatScale: 2 });
    await fixture.finishDevelopment('MEDIUM', { failures: [0] });
    await fixture.publish('development', 'LOW');
    await fixture.publish('development', 'MEDIUM');
    fixture.ledger.admitStageReportReceipt('development', 'LOW');
    fixture.ledger.admitStageReportReceipt('development', 'MEDIUM');
    const appends = fixture.effects.ledgerAppends;
    const clocks = fixture.effects.clockReads;
    const syncs = fixture.effects.fsyncs;
    let winnerFail: unknown;
    try {
      fixture.ledger.recordProfileSelection('LOW', 'higher_parse', {
        stage: 'development',
        passed: true,
        completedStages: ['preflight'],
      });
    } catch (error) {
      winnerFail = error;
    }
    expect(winnerFail).toBeInstanceOf(CalibrationFatalError);
    expect((winnerFail as Error).message).toBe('calibration:artifact-gate-failed');
    expect(fixture.effects.ledgerAppends).toBe(appends);
    expect(fixture.effects.clockReads).toBe(clocks);
    expect(fixture.effects.fsyncs).toBe(syncs);
    let substituteFail: unknown;
    try {
      fixture.ledger.recordProfileSelection('MEDIUM', 'higher_parse', {
        stage: 'development',
        passed: true,
        completedStages: ['preflight'],
      });
    } catch (error) {
      substituteFail = error;
    }
    expect(substituteFail).toBeInstanceOf(CalibrationFatalError);
    expect((substituteFail as Error).message).toBe('calibration:artifact-selection-mismatch');
    expect(fixture.ledger.getSelectedProfile()).toBeUndefined();
  });
  it('development completion without the exact selected winner is blocked', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    await fixture.publish('preflight', 'MEDIUM');
    fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    fixture.ledger.admitStageReportReceipt('preflight', 'MEDIUM');
    fixture.ledger.completeStage('preflight', { stage: 'preflight', passed: true, completedStages: [] });
    await fixture.finishDevelopment('LOW', 'exact');
    await fixture.finishDevelopment('MEDIUM', 'exact');
    await fixture.publish('development', 'LOW');
    await fixture.publish('development', 'MEDIUM');
    fixture.ledger.admitStageReportReceipt('development', 'LOW');
    fixture.ledger.admitStageReportReceipt('development', 'MEDIUM');
    const appends = fixture.effects.ledgerAppends;
    let caught: unknown;
    try {
      fixture.ledger.completeStage('development', {
        stage: 'development',
        passed: true,
        completedStages: ['preflight'],
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect((caught as Error).message).toBe('calibration:stage-not-ready');
    expect(fixture.effects.ledgerAppends).toBe(appends);
    expect(fixture.ledger.getCompletedStages()).toEqual(['preflight']);
  });
});
describe('validation measured authority (48 outcomes, 46 parsed)', () => {
  it('two ordinary failures yield 46 parsed meals with honest finite latency', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    await fixture.publish('preflight', 'MEDIUM');
    fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    fixture.ledger.admitStageReportReceipt('preflight', 'MEDIUM');
    fixture.ledger.completeStage('preflight', { stage: 'preflight', passed: true, completedStages: [] });
    await fixture.finishDevelopment('LOW', 'exact');
    await fixture.finishDevelopment('MEDIUM', 'exact');
    await fixture.publish('development', 'LOW');
    await fixture.publish('development', 'MEDIUM');
    fixture.ledger.admitStageReportReceipt('development', 'LOW');
    fixture.ledger.admitStageReportReceipt('development', 'MEDIUM');
    fixture.ledger.recordProfileSelection('MEDIUM', 'default_medium_tie_breaker', {
      stage: 'development',
      passed: true,
      completedStages: ['preflight'],
    });
    fixture.ledger.completeStage('development', {
      stage: 'development',
      passed: true,
      completedStages: ['preflight'],
    });
    await fixture.finishValidation('MEDIUM', { failures: [0, 1] });
    await fixture.publish('validation', 'MEDIUM');
    const receipt = fixture.ledger.admitStageReportReceipt('validation', 'MEDIUM');
    expect(receipt.stage).toBe('validation');
    expect(receipt.profile).toBe('MEDIUM');
    const text = readFileSync(fixture.artifactPath('validation', 'MEDIUM', 'json'), 'utf8');
    const measured = measureCalibrationStageReport(JSON.parse(text));
    expect(measured.stage.totalOutcomes).toBe(48);
    expect(measured.stage.parseCases).toBe(46);
    expect(measured.stage.parsedMealCount).toBe(46);
    expect(measured.stage.mealMassEligibleCount).toBe(46);
    expect(measured.stage.mealDensityCoverageCount).toBe(46);
    expect(measured.stage.mealCarbDensityEligibleCount).toBe(46);
    expect(measured.stage.mealFatDensityEligibleCount).toBe(46);
    expect(measured.latency.measuredCases).toBe(48);
    expect(measured.latency.missingCases).toBe(0);
    expect(measured.profile.parseCount).toBe(46);
    fixture.ledger.completeStage('validation', {
      stage: 'validation',
      passed: true,
      completedStages: ['preflight', 'development'],
    });
    expect(fixture.ledger.getCompletedStages()).toEqual(['preflight', 'development', 'validation']);
    expect(sdkGuard.constructCalls).toBe(0);
    expect(networkGuard.attemptCalls).toBe(0);
  });
  it('interruptions report missing latency without invented zero', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    await fixture.publish('preflight', 'MEDIUM');
    fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    fixture.ledger.admitStageReportReceipt('preflight', 'MEDIUM');
    fixture.ledger.completeStage('preflight', { stage: 'preflight', passed: true, completedStages: [] });
    await fixture.finishDevelopment('LOW', 'exact');
    await fixture.finishDevelopment('MEDIUM', 'exact');
    await fixture.publish('development', 'LOW');
    await fixture.publish('development', 'MEDIUM');
    fixture.ledger.admitStageReportReceipt('development', 'LOW');
    fixture.ledger.admitStageReportReceipt('development', 'MEDIUM');
    fixture.ledger.recordProfileSelection('MEDIUM', 'default_medium_tie_breaker', {
      stage: 'development',
      passed: true,
      completedStages: ['preflight'],
    });
    fixture.ledger.completeStage('development', {
      stage: 'development',
      passed: true,
      completedStages: ['preflight'],
    });
    await fixture.finishValidation('MEDIUM', { interruptions: [0] });
    await fixture.publish('validation', 'MEDIUM');
    fixture.ledger.admitStageReportReceipt('validation', 'MEDIUM');
    const text = readFileSync(fixture.artifactPath('validation', 'MEDIUM', 'json'), 'utf8');
    const measured = measureCalibrationStageReport(JSON.parse(text));
    expect(measured.latency.missingCases).toBeGreaterThan(0);
    expect(measured.latency.measuredCases + measured.latency.missingCases).toBe(48);
  });
  it('failing measured validation cannot be overridden by passed true', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    await fixture.publish('preflight', 'MEDIUM');
    fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    fixture.ledger.admitStageReportReceipt('preflight', 'MEDIUM');
    fixture.ledger.completeStage('preflight', { stage: 'preflight', passed: true, completedStages: [] });
    await fixture.finishDevelopment('LOW', 'exact');
    await fixture.finishDevelopment('MEDIUM', 'exact');
    await fixture.publish('development', 'LOW');
    await fixture.publish('development', 'MEDIUM');
    fixture.ledger.admitStageReportReceipt('development', 'LOW');
    fixture.ledger.admitStageReportReceipt('development', 'MEDIUM');
    fixture.ledger.recordProfileSelection('MEDIUM', 'default_medium_tie_breaker', {
      stage: 'development',
      passed: true,
      completedStages: ['preflight'],
    });
    fixture.ledger.completeStage('development', {
      stage: 'development',
      passed: true,
      completedStages: ['preflight'],
    });
    await fixture.finishValidation('MEDIUM', { proteinScale: 2 });
    await fixture.publish('validation', 'MEDIUM');
    fixture.ledger.admitStageReportReceipt('validation', 'MEDIUM');
    const appends = fixture.effects.ledgerAppends;
    const clocks = fixture.effects.clockReads;
    const syncs = fixture.effects.fsyncs;
    let caught: unknown;
    try {
      fixture.ledger.completeStage('validation', {
        stage: 'validation',
        passed: true,
        completedStages: ['preflight', 'development'],
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect((caught as Error).message).toBe('calibration:artifact-gate-failed');
    expect(fixture.effects.ledgerAppends).toBe(appends);
    expect(fixture.effects.clockReads).toBe(clocks);
    expect(fixture.effects.fsyncs).toBe(syncs);
  });
});
describe('pure gate literal boundaries (new file only)', () => {
  it('development numeric thresholds pass on boundary and fail one over', () => {
    const base = {
      totalCases: 24,
      runCases: 24,
      totalOutcomes: 24,
      parseCases: 24,
      unsafeCompletionCount: 0,
      catastrophicCount: 0,
      failureCount: 0,
      medianRelativeCalorieError: 0.35,
      meanZeroSafeMacroRelativeError: 0.5,
      p90AnalysisLatencyMs: 30000,
    };
    const devBase = evaluateCalibrationStageGate('development', base);
    expect(devBase.passed).toBe(true);
    expect(devBase.failedChecks).toEqual([]);
    for (const totalCases of [23, 25]) {
      const result = evaluateCalibrationStageGate('development', { ...base, totalCases });
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('totalCases');
    }
    for (const runCases of [23, 25]) {
      const result = evaluateCalibrationStageGate('development', { ...base, runCases });
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('runCases');
    }
    expect(evaluateCalibrationStageGate('development', { ...base, parseCases: 24 }).passed).toBe(true);
    expect(evaluateCalibrationStageGate('development', { ...base, parseCases: 23 }).passed).toBe(true);
    {
      const result = evaluateCalibrationStageGate('development', { ...base, parseCases: 22 });
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('parseCases');
    }
    {
      const result = evaluateCalibrationStageGate('development', { ...base, unsafeCompletionCount: 1 });
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('unsafeCompletionCount');
    }
    expect(evaluateCalibrationStageGate('development', { ...base, catastrophicCount: 0 }).passed).toBe(true);
    expect(evaluateCalibrationStageGate('development', { ...base, catastrophicCount: 6 }).passed).toBe(true);
    {
      const result = evaluateCalibrationStageGate('development', { ...base, catastrophicCount: 7 });
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('catastrophicCount');
    }
    expect(
      evaluateCalibrationStageGate('development', { ...base, medianRelativeCalorieError: 0.34 }).passed,
    ).toBe(true);
    expect(
      evaluateCalibrationStageGate('development', { ...base, medianRelativeCalorieError: 0.35 }).passed,
    ).toBe(true);
    {
      const result = evaluateCalibrationStageGate('development', {
        ...base,
        medianRelativeCalorieError: 0.36,
      });
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('medianRelativeCalorieError');
    }
    expect(
      evaluateCalibrationStageGate('development', { ...base, meanZeroSafeMacroRelativeError: 0.49 })
        .passed,
    ).toBe(true);
    expect(
      evaluateCalibrationStageGate('development', { ...base, meanZeroSafeMacroRelativeError: 0.5 })
        .passed,
    ).toBe(true);
    {
      const result = evaluateCalibrationStageGate('development', {
        ...base,
        meanZeroSafeMacroRelativeError: 0.51,
      });
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('meanZeroSafeMacroRelativeError');
    }
    expect(
      evaluateCalibrationStageGate('development', { ...base, p90AnalysisLatencyMs: 29999 }).passed,
    ).toBe(true);
    expect(
      evaluateCalibrationStageGate('development', { ...base, p90AnalysisLatencyMs: 30000 }).passed,
    ).toBe(true);
    {
      const result = evaluateCalibrationStageGate('development', {
        ...base,
        p90AnalysisLatencyMs: 30001,
      });
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('p90AnalysisLatencyMs');
    }
  });
  it('validation numeric thresholds pass on boundary and fail one over', () => {
    const base = {
      totalCases: 48,
      runCases: 48,
      totalOutcomes: 48,
      parseCases: 48,
      unsafeCompletionCount: 0,
      catastrophicCount: 8,
      failureCount: 0,
      medianRelativeCalorieError: 0.25,
      p90RelativeCalorieError: 0.9,
      meanZeroSafeMacroRelativeError: 0.45,
      medianProteinRelativeError: 0.35,
      medianCarbsRelativeError: 0.35,
      medianFatRelativeError: 0.35,
      medianMealMassRelativeError: 0.35,
      p90AnalysisLatencyMs: 30000,
      parsedMealCount: 48,
      mealMassEligibleCount: 48,
      mealDensityCoverageCount: 48,
      mealCarbDensityEligibleCount: 48,
      mealFatDensityEligibleCount: 48,
    };
    const valBase = evaluateCalibrationStageGate('validation', base);
    expect(valBase.passed).toBe(true);
    expect(valBase.failedChecks).toEqual([]);
    for (const totalCases of [47, 49]) {
      const result = evaluateCalibrationStageGate('validation', { ...base, totalCases });
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('totalCases');
    }
    for (const runCases of [47, 49]) {
      const result = evaluateCalibrationStageGate('validation', { ...base, runCases });
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('runCases');
    }
    {
      const matched46 = {
        ...base,
        parseCases: 46,
        parsedMealCount: 46,
        mealMassEligibleCount: 46,
        mealDensityCoverageCount: 46,
        mealCarbDensityEligibleCount: 46,
        mealFatDensityEligibleCount: 46,
      };
      expect(evaluateCalibrationStageGate('validation', matched46).passed).toBe(true);
    }
    {
      const matched45 = {
        ...base,
        parseCases: 45,
        parsedMealCount: 45,
        mealMassEligibleCount: 45,
        mealDensityCoverageCount: 45,
        mealCarbDensityEligibleCount: 45,
        mealFatDensityEligibleCount: 45,
      };
      const result = evaluateCalibrationStageGate('validation', matched45);
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('parseCases');
    }
    {
      const result = evaluateCalibrationStageGate('validation', { ...base, unsafeCompletionCount: 1 });
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('unsafeCompletionCount');
    }
    expect(evaluateCalibrationStageGate('validation', { ...base, catastrophicCount: 8 }).passed).toBe(
      true,
    );
    {
      const result = evaluateCalibrationStageGate('validation', { ...base, catastrophicCount: 9 });
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('catastrophicCount');
    }
    expect(
      evaluateCalibrationStageGate('validation', { ...base, medianRelativeCalorieError: 0.24 }).passed,
    ).toBe(true);
    expect(
      evaluateCalibrationStageGate('validation', { ...base, medianRelativeCalorieError: 0.25 }).passed,
    ).toBe(true);
    {
      const result = evaluateCalibrationStageGate('validation', {
        ...base,
        medianRelativeCalorieError: 0.26,
      });
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('medianRelativeCalorieError');
    }
    expect(
      evaluateCalibrationStageGate('validation', { ...base, p90RelativeCalorieError: 0.89 }).passed,
    ).toBe(true);
    expect(
      evaluateCalibrationStageGate('validation', { ...base, p90RelativeCalorieError: 0.9 }).passed,
    ).toBe(true);
    {
      const result = evaluateCalibrationStageGate('validation', {
        ...base,
        p90RelativeCalorieError: 0.91,
      });
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('p90RelativeCalorieError');
    }
    expect(
      evaluateCalibrationStageGate('validation', { ...base, meanZeroSafeMacroRelativeError: 0.44 })
        .passed,
    ).toBe(true);
    expect(
      evaluateCalibrationStageGate('validation', { ...base, meanZeroSafeMacroRelativeError: 0.45 })
        .passed,
    ).toBe(true);
    {
      const result = evaluateCalibrationStageGate('validation', {
        ...base,
        meanZeroSafeMacroRelativeError: 0.46,
      });
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('meanZeroSafeMacroRelativeError');
    }
    for (const field of [
      'medianProteinRelativeError',
      'medianCarbsRelativeError',
      'medianFatRelativeError',
      'medianMealMassRelativeError',
    ] as const) {
      expect(evaluateCalibrationStageGate('validation', { ...base, [field]: 0.34 }).passed).toBe(
        true,
      );
      expect(evaluateCalibrationStageGate('validation', { ...base, [field]: 0.35 }).passed).toBe(
        true,
      );
      const result = evaluateCalibrationStageGate('validation', { ...base, [field]: 0.36 });
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain(field);
    }
    expect(
      evaluateCalibrationStageGate('validation', { ...base, p90AnalysisLatencyMs: 29999 }).passed,
    ).toBe(true);
    expect(
      evaluateCalibrationStageGate('validation', { ...base, p90AnalysisLatencyMs: 30000 }).passed,
    ).toBe(true);
    {
      const result = evaluateCalibrationStageGate('validation', {
        ...base,
        p90AnalysisLatencyMs: 30001,
      });
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('p90AnalysisLatencyMs');
    }
    {
      const result = evaluateCalibrationStageGate('validation', { ...base, parsedMealCount: 47 });
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('parsedMealCount');
    }
    {
      const matched46 = {
        ...base,
        parseCases: 46,
        parsedMealCount: 46,
        mealMassEligibleCount: 46,
        mealDensityCoverageCount: 46,
        mealCarbDensityEligibleCount: 46,
        mealFatDensityEligibleCount: 46,
      };
      expect(evaluateCalibrationStageGate('validation', matched46).passed).toBe(true);
      for (const field of [
        'parsedMealCount',
        'mealMassEligibleCount',
        'mealDensityCoverageCount',
        'mealCarbDensityEligibleCount',
        'mealFatDensityEligibleCount',
      ] as const) {
        for (const value of [45, 47]) {
          const result = evaluateCalibrationStageGate('validation', { ...matched46, [field]: value });
          expect(result.passed).toBe(false);
          expect(result.failedChecks).toContain(field);
        }
      }
    }
  });
  it('report-based development kcal, mean macro and latency fail the intended gate field', async () => {
    const kcalFixture = await makeAuthoritativeFixture(makeAuthoritativeOwner(96), { authoritative: false });
    tracked.push(kcalFixture);
    await kcalFixture.finishPreflight();
    await completeOptOutPreflight(kcalFixture);
    await kcalFixture.finishDevelopment('LOW', 'exact');
    await kcalFixture.finishDevelopment('MEDIUM', { kcalScale: 2 });
    await kcalFixture.publish('development', 'LOW');
    await kcalFixture.publish('development', 'MEDIUM');
    const kcalLow = measureCalibrationStageReport(
      JSON.parse(readFileSync(kcalFixture.artifactPath('development', 'LOW', 'json'), 'utf8')),
    );
    const kcalMed = measureCalibrationStageReport(
      JSON.parse(readFileSync(kcalFixture.artifactPath('development', 'MEDIUM', 'json'), 'utf8')),
    );
    expect(evaluateCalibrationStageGate('development', kcalLow.stage).passed).toBe(true);
    {
      const result = evaluateCalibrationStageGate('development', kcalMed.stage);
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('medianRelativeCalorieError');
    }
    const meanFixture = await makeAuthoritativeFixture(makeAuthoritativeOwner(97), { authoritative: false });
    tracked.push(meanFixture);
    await meanFixture.finishPreflight();
    await completeOptOutPreflight(meanFixture);
    await meanFixture.finishDevelopment('LOW', 'exact');
    await meanFixture.finishDevelopment('MEDIUM', { proteinScale: 2, carbsScale: 2, fatScale: 2 });
    await meanFixture.publish('development', 'LOW');
    await meanFixture.publish('development', 'MEDIUM');
    const meanMed = measureCalibrationStageReport(
      JSON.parse(readFileSync(meanFixture.artifactPath('development', 'MEDIUM', 'json'), 'utf8')),
    );
    expect(meanMed.stage.medianRelativeCalorieError).toBe(0);
    {
      const result = evaluateCalibrationStageGate('development', meanMed.stage);
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('meanZeroSafeMacroRelativeError');
    }
    const latencyFixture = await makeAuthoritativeFixture(makeAuthoritativeOwner(98), { authoritative: false });
    tracked.push(latencyFixture);
    await latencyFixture.finishPreflight();
    await completeOptOutPreflight(latencyFixture);
    await latencyFixture.finishDevelopment('LOW', { latencyMs: 1000 });
    await latencyFixture.finishDevelopment('MEDIUM', { latencyMs: 30001 });
    await latencyFixture.publish('development', 'LOW');
    await latencyFixture.publish('development', 'MEDIUM');
    const latLow = measureCalibrationStageReport(
      JSON.parse(readFileSync(latencyFixture.artifactPath('development', 'LOW', 'json'), 'utf8')),
    );
    const latMed = measureCalibrationStageReport(
      JSON.parse(readFileSync(latencyFixture.artifactPath('development', 'MEDIUM', 'json'), 'utf8')),
    );
    expect(evaluateCalibrationStageGate('development', latLow.stage).passed).toBe(true);
    {
      const result = evaluateCalibrationStageGate('development', latMed.stage);
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('p90AnalysisLatencyMs');
    }
    expect(sdkGuard.constructCalls).toBe(0);
    expect(networkGuard.attemptCalls).toBe(0);
  });
  it('report-based validation kcal, protein, carbs, fat, mass and latency fail the intended field', async () => {
    const fixture = await makeAuthoritativeFixture(makeAuthoritativeOwner(99), { authoritative: false });
    tracked.push(fixture);
    await fixture.finishPreflight();
    await advanceOptOutToValidation(fixture);
    await fixture.finishValidation('MEDIUM', 'exact');
    await fixture.publish('validation', 'MEDIUM');
    const exactMeasured = measureCalibrationStageReport(
      JSON.parse(readFileSync(fixture.artifactPath('validation', 'MEDIUM', 'json'), 'utf8')),
    );
    expect(evaluateCalibrationStageGate('validation', exactMeasured.stage).passed).toBe(true);
    const cases: Array<{ scenario: { kcalScale?: number; proteinScale?: number; carbsScale?: number; fatScale?: number; massScale?: number; latencyMs?: number }; field: string }> = [
      { scenario: { kcalScale: 1.5 }, field: 'medianRelativeCalorieError' },
      { scenario: { proteinScale: 1.5 }, field: 'medianProteinRelativeError' },
      { scenario: { carbsScale: 1.5 }, field: 'medianCarbsRelativeError' },
      { scenario: { fatScale: 1.5 }, field: 'medianFatRelativeError' },
      { scenario: { massScale: 1.5 }, field: 'medianMealMassRelativeError' },
      { scenario: { latencyMs: 30001 }, field: 'p90AnalysisLatencyMs' },
    ];
    let suffix = 100;
    for (const entry of cases) {
      suffix += 1;
      const faulted = await makeAuthoritativeFixture(makeAuthoritativeOwner(suffix), {
        authoritative: false,
      });
      tracked.push(faulted);
      await faulted.finishPreflight();
      await advanceOptOutToValidation(faulted);
      await faulted.finishValidation('MEDIUM', entry.scenario);
      await faulted.publish('validation', 'MEDIUM');
      const measured = measureCalibrationStageReport(
        JSON.parse(readFileSync(faulted.artifactPath('validation', 'MEDIUM', 'json'), 'utf8')),
      );
      const result = evaluateCalibrationStageGate('validation', measured.stage);
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain(entry.field);
    }
    expect(sdkGuard.constructCalls).toBe(0);
    expect(networkGuard.attemptCalls).toBe(0);
  });
  it('report-based validation p90, pooled mean and parse diagnostics isolate the intended field', async () => {
    const p90Outliers: Array<number | undefined> = new Array(48).fill(undefined);
    for (let index = 42; index < 48; index += 1) {
      p90Outliers[index] = 2;
    }
    const p90Fixture = await makeAuthoritativeFixture(makeAuthoritativeOwner(110), { authoritative: false });
    tracked.push(p90Fixture);
    await p90Fixture.finishPreflight();
    await advanceOptOutToValidation(p90Fixture);
    await p90Fixture.finishValidation('MEDIUM', { perOutcomeKcalScale: p90Outliers });
    await p90Fixture.publish('validation', 'MEDIUM');
    const p90Measured = measureCalibrationStageReport(
      JSON.parse(readFileSync(p90Fixture.artifactPath('validation', 'MEDIUM', 'json'), 'utf8')),
    );
    expect(p90Measured.stage.medianRelativeCalorieError).toBe(0);
    expect(p90Measured.stage.p90RelativeCalorieError).toBeCloseTo(1, 9);
    expect(p90Measured.stage.catastrophicCount).toBe(0);
    {
      const result = evaluateCalibrationStageGate('validation', p90Measured.stage);
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('p90RelativeCalorieError');
    }
    const meanOutliers: Array<number | undefined> = new Array(48).fill(undefined);
    for (let index = 0; index < 12; index += 1) {
      meanOutliers[index] = 5;
    }
    const meanFixture = await makeAuthoritativeFixture(makeAuthoritativeOwner(111), { authoritative: false });
    tracked.push(meanFixture);
    await meanFixture.finishPreflight();
    await advanceOptOutToValidation(meanFixture);
    await meanFixture.finishValidation('MEDIUM', { perOutcomeMacroScale: meanOutliers });
    await meanFixture.publish('validation', 'MEDIUM');
    const meanMeasured = measureCalibrationStageReport(
      JSON.parse(readFileSync(meanFixture.artifactPath('validation', 'MEDIUM', 'json'), 'utf8')),
    );
    expect(meanMeasured.stage.medianProteinRelativeError).toBe(0);
    expect(meanMeasured.stage.medianCarbsRelativeError).toBe(0);
    expect(meanMeasured.stage.medianFatRelativeError).toBe(0);
    {
      const result = evaluateCalibrationStageGate('validation', meanMeasured.stage);
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('meanZeroSafeMacroRelativeError');
    }
    const parseFixture = await makeAuthoritativeFixture(makeAuthoritativeOwner(112), { authoritative: false });
    tracked.push(parseFixture);
    await parseFixture.finishPreflight();
    await advanceOptOutToValidation(parseFixture);
    await parseFixture.finishValidation('MEDIUM', { failures: [0, 1, 2] });
    await parseFixture.publish('validation', 'MEDIUM');
    const parseMeasured = measureCalibrationStageReport(
      JSON.parse(readFileSync(parseFixture.artifactPath('validation', 'MEDIUM', 'json'), 'utf8')),
    );
    expect(parseMeasured.stage.parseCases).toBe(45);
    expect(parseMeasured.stage.parsedMealCount).toBe(45);
    {
      const result = evaluateCalibrationStageGate('validation', parseMeasured.stage);
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('parseCases');
    }
    expect(sdkGuard.constructCalls).toBe(0);
    expect(networkGuard.attemptCalls).toBe(0);
  });
  it('selector retains original validation error order for simultaneous invalid inputs', () => {
    const good = {
      unsafeCount: 0,
      parseCount: 24,
      catastrophicCount: 0,
      meanZeroSafeMacroError: 0,
      medianKcalError: 0,
      p90AnalysisLatencyMs: 1500,
    };
    let caught: unknown;
    try {
      selectCalibrationProfile(
        { ...good, unsafeCount: -1 },
        { ...good, unsafeCount: -1 },
      );
    } catch (error) {
      caught = error;
    }
    expect((caught as Error).message).toBe(
      'calibration:profile-selection-invalid-count:low.unsafeCount',
    );
    caught = undefined;
    try {
      selectCalibrationProfile(good, { ...good, parseCount: -1 });
    } catch (error) {
      caught = error;
    }
    expect((caught as Error).message).toBe(
      'calibration:profile-selection-invalid-count:medium.parseCount',
    );
    caught = undefined;
    try {
      selectCalibrationProfile(
        { ...good, meanZeroSafeMacroError: Number.NaN },
        { ...good, meanZeroSafeMacroError: Number.NaN },
      );
    } catch (error) {
      caught = error;
    }
    expect((caught as Error).message).toBe(
      'calibration:profile-selection-invalid-metric:low.meanZeroSafeMacroError',
    );
  });
});
describe('benchmark native admission remains fail-closed (60 outcomes)', () => {
  it('admits a complete 60-outcome report then blocks completion for runtime evidence', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    await fixture.publish('preflight', 'MEDIUM');
    fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    fixture.ledger.admitStageReportReceipt('preflight', 'MEDIUM');
    fixture.ledger.completeStage('preflight', { stage: 'preflight', passed: true, completedStages: [] });
    await fixture.finishDevelopment('LOW', 'exact');
    await fixture.finishDevelopment('MEDIUM', 'exact');
    await fixture.publish('development', 'LOW');
    await fixture.publish('development', 'MEDIUM');
    fixture.ledger.admitStageReportReceipt('development', 'LOW');
    fixture.ledger.admitStageReportReceipt('development', 'MEDIUM');
    fixture.ledger.recordProfileSelection('MEDIUM', 'default_medium_tie_breaker', {
      stage: 'development',
      passed: true,
      completedStages: ['preflight'],
    });
    fixture.ledger.completeStage('development', {
      stage: 'development',
      passed: true,
      completedStages: ['preflight'],
    });
    await fixture.finishValidation('MEDIUM', 'exact');
    await fixture.publish('validation', 'MEDIUM');
    fixture.ledger.admitStageReportReceipt('validation', 'MEDIUM');
    fixture.ledger.completeStage('validation', {
      stage: 'validation',
      passed: true,
      completedStages: ['preflight', 'development'],
    });
    await fixture.finishBenchmark('MEDIUM', 'exact');
    await fixture.publish('benchmark', 'MEDIUM');
    const receipt = fixture.ledger.admitStageReportReceipt('benchmark', 'MEDIUM');
    expect(receipt.stage).toBe('benchmark');
    expect(receipt.profile).toBe('MEDIUM');
    const text = readFileSync(fixture.artifactPath('benchmark', 'MEDIUM', 'json'), 'utf8');
    const measured = measureCalibrationStageReport(JSON.parse(text));
    expect(measured.stage.totalOutcomes).toBe(60);
    expect(measured.stage.mealOutcomeCount).toBe(36);
    expect(measured.stage.labelOutcomeCount).toBe(12);
    expect(measured.stage.suppliedBarcodeOutcomeCount).toBe(12);
    expect(measured.stage.parsedMealCount).toBe(36);
    const snapshot = fixture.ledger.getStageReportSnapshot('benchmark', 'MEDIUM');
    expect(snapshot.images.length + snapshot.nonReservations.length).toBe(60);
    const appends = fixture.effects.ledgerAppends;
    const clocks = fixture.effects.clockReads;
    const syncs = fixture.effects.fsyncs;
    let caught: unknown;
    try {
      fixture.ledger.completeStage('benchmark', {
        stage: 'benchmark',
        passed: true,
        completedStages: ['preflight', 'development', 'validation'],
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect((caught as Error).message).toBe('calibration:benchmark-runtime-evidence-required');
    expect(asRecord(caught).cause).toBeUndefined();
    expect(fixture.effects.ledgerAppends).toBe(appends);
    expect(fixture.effects.clockReads).toBe(clocks);
    expect(fixture.effects.fsyncs).toBe(syncs);
    expect(sdkGuard.constructCalls).toBe(0);
    expect(networkGuard.attemptCalls).toBe(0);
  });
});
describe('drift reverification and chronological replay', () => {
  it('drift after admission poisons idempotent selection with lock retained', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    await fixture.publish('preflight', 'MEDIUM');
    fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    fixture.ledger.admitStageReportReceipt('preflight', 'MEDIUM');
    fixture.ledger.completeStage('preflight', { stage: 'preflight', passed: true, completedStages: [] });
    await fixture.finishDevelopment('LOW', 'exact');
    await fixture.finishDevelopment('MEDIUM', 'exact');
    await fixture.publish('development', 'LOW');
    await fixture.publish('development', 'MEDIUM');
    fixture.ledger.admitStageReportReceipt('development', 'LOW');
    fixture.ledger.admitStageReportReceipt('development', 'MEDIUM');
    fixture.ledger.recordProfileSelection('MEDIUM', 'default_medium_tie_breaker', {
      stage: 'development',
      passed: true,
      completedStages: ['preflight'],
    });
    expect(fixture.ledger.getSelectedProfile()).toBe('MEDIUM');
    const verifierBeforeRepeat = fixture.effects.verifierCalls;
    const jsonPath = fixture.artifactPath('development', 'LOW', 'json');
    const text = readFileSync(jsonPath, 'utf8');
    writeFileSync(jsonPath, text.slice(0, 120) + 'X' + text.slice(121));
    let first: unknown;
    try {
      fixture.ledger.recordProfileSelection('MEDIUM', 'default_medium_tie_breaker', {
        stage: 'development',
        passed: true,
        completedStages: ['preflight'],
      });
    } catch (error) {
      first = error;
    }
    expect(first).toBeInstanceOf(CalibrationFatalError);
    expect((first as Error).message).toBe('calibration:artifact-verification-failed');
    expect(asRecord(first).cause).toBeUndefined();
    expect(fixture.effects.verifierCalls).toBeGreaterThan(verifierBeforeRepeat);
    const traceAfterDrift = fixture.nativeTrace();
    expect(traceAfterDrift.length).toBeGreaterThan(verifierBeforeRepeat);
    const driftRepeats = traceAfterDrift.slice(verifierBeforeRepeat);
    expect(driftRepeats.some((entry) => entry.stage === 'development' && entry.profile === 'LOW')).toBe(true);
    expect(() => statSync(fixture.lockPath())).not.toThrow();
    const appends = fixture.effects.ledgerAppends;
    const clocks = fixture.effects.clockReads;
    const syncs = fixture.effects.fsyncs;
    let second: unknown;
    try {
      fixture.ledger.getStageReportSnapshot('development', 'LOW');
    } catch (error) {
      second = error;
    }
    expect(second).toBeInstanceOf(CalibrationFatalError);
    expect((second as Error).message).toBe('calibration:ledger-poisoned');
    expect(fixture.effects.ledgerAppends).toBe(appends);
    expect(fixture.effects.clockReads).toBe(clocks);
    expect(fixture.effects.fsyncs).toBe(syncs);
  });
  it('chronological replay preserves early bytes across later selection', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    await fixture.publish('preflight', 'MEDIUM');
    fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    fixture.ledger.admitStageReportReceipt('preflight', 'MEDIUM');
    fixture.ledger.completeStage('preflight', { stage: 'preflight', passed: true, completedStages: [] });
    await fixture.finishDevelopment('LOW', 'exact');
    await fixture.finishDevelopment('MEDIUM', 'exact');
    await fixture.publish('development', 'LOW');
    await fixture.publish('development', 'MEDIUM');
    fixture.ledger.admitStageReportReceipt('development', 'LOW');
    fixture.ledger.admitStageReportReceipt('development', 'MEDIUM');
    fixture.ledger.recordProfileSelection('MEDIUM', 'default_medium_tie_breaker', {
      stage: 'development',
      passed: true,
      completedStages: ['preflight'],
    });
    const devLowBefore = readFileSync(fixture.artifactPath('development', 'LOW', 'json'), 'utf8');
    const devMedBefore = readFileSync(fixture.artifactPath('development', 'MEDIUM', 'json'), 'utf8');
    const devLowMdBefore = readFileSync(fixture.artifactPath('development', 'LOW', 'md'), 'utf8');
    const devMedMdBefore = readFileSync(fixture.artifactPath('development', 'MEDIUM', 'md'), 'utf8');
    const next = await fixture.reopen(makeAuthoritativeOwner(77), { acquire: false });
    tracked.push(next);
    expect(next.effects.verifierCalls).toBe(0);
    expect(next.nativeTrace()).toHaveLength(0);
    next.ledger.acquireLock({ ...next.owner });
    expect(next.effects.verifierCalls).toBeGreaterThanOrEqual(4);
    expect(next.nativeTrace().length).toBeGreaterThanOrEqual(4);
    expect(next.effects.nativeVerifierCalls).toBeGreaterThanOrEqual(4);
    expect(readFileSync(next.artifactPath('development', 'LOW', 'json'), 'utf8')).toBe(devLowBefore);
    expect(readFileSync(next.artifactPath('development', 'MEDIUM', 'json'), 'utf8')).toBe(devMedBefore);
    expect(readFileSync(next.artifactPath('development', 'LOW', 'md'), 'utf8')).toBe(devLowMdBefore);
    expect(readFileSync(next.artifactPath('development', 'MEDIUM', 'md'), 'utf8')).toBe(devMedMdBefore);
    expect(next.ledger.getSelectedProfile()).toBe('MEDIUM');
  });
  it('idempotent completion rereads artifacts and poisons with lock retained', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    await fixture.publish('preflight', 'MEDIUM');
    fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    fixture.ledger.admitStageReportReceipt('preflight', 'MEDIUM');
    fixture.ledger.completeStage('preflight', { stage: 'preflight', passed: true, completedStages: [] });
    await fixture.finishDevelopment('LOW', 'exact');
    await fixture.finishDevelopment('MEDIUM', 'exact');
    await fixture.publish('development', 'LOW');
    await fixture.publish('development', 'MEDIUM');
    fixture.ledger.admitStageReportReceipt('development', 'LOW');
    fixture.ledger.admitStageReportReceipt('development', 'MEDIUM');
    fixture.ledger.recordProfileSelection('MEDIUM', 'default_medium_tie_breaker', {
      stage: 'development',
      passed: true,
      completedStages: ['preflight'],
    });
    fixture.ledger.completeStage('development', {
      stage: 'development',
      passed: true,
      completedStages: ['preflight'],
    });
    expect(fixture.ledger.getCompletedStages()).toEqual(['preflight', 'development']);
    const verifierBeforeRepeat = fixture.effects.verifierCalls;
    const jsonPath = fixture.artifactPath('development', 'MEDIUM', 'json');
    const text = readFileSync(jsonPath, 'utf8');
    writeFileSync(jsonPath, text.slice(0, 120) + 'X' + text.slice(121));
    let first: unknown;
    try {
      fixture.ledger.completeStage('development', {
        stage: 'development',
        passed: true,
        completedStages: ['preflight'],
      });
    } catch (error) {
      first = error;
    }
    expect(first).toBeInstanceOf(CalibrationFatalError);
    expect((first as Error).message).toBe('calibration:artifact-verification-failed');
    expect(asRecord(first).cause).toBeUndefined();
    expect(fixture.effects.verifierCalls).toBeGreaterThan(verifierBeforeRepeat);
    const traceAfterDrift = fixture.nativeTrace();
    expect(traceAfterDrift.length).toBeGreaterThan(verifierBeforeRepeat);
    const driftRepeats = traceAfterDrift.slice(verifierBeforeRepeat);
    expect(driftRepeats.some((entry) => entry.stage === 'development' && entry.profile === 'MEDIUM')).toBe(true);
    expect(() => statSync(fixture.lockPath())).not.toThrow();
    const appends = fixture.effects.ledgerAppends;
    const clocks = fixture.effects.clockReads;
    const syncs = fixture.effects.fsyncs;
    let second: unknown;
    try {
      fixture.ledger.getStageReportSnapshot('development', 'MEDIUM');
    } catch (error) {
      second = error;
    }
    expect(second).toBeInstanceOf(CalibrationFatalError);
    expect((second as Error).message).toBe('calibration:ledger-poisoned');
    expect(fixture.effects.ledgerAppends).toBe(appends);
    expect(fixture.effects.clockReads).toBe(clocks);
    expect(fixture.effects.fsyncs).toBe(syncs);
  });
});
describe('report-based gate failures from genuine scored faults', () => {
  it('development selection requires both native 24 receipts', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    await fixture.publish('preflight', 'MEDIUM');
    fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    fixture.ledger.admitStageReportReceipt('preflight', 'MEDIUM');
    fixture.ledger.completeStage('preflight', { stage: 'preflight', passed: true, completedStages: [] });
    await fixture.finishDevelopment('LOW', 'exact');
    await fixture.finishDevelopment('MEDIUM', 'exact');
    await fixture.publish('development', 'LOW');
    await fixture.publish('development', 'MEDIUM');
    fixture.ledger.admitStageReportReceipt('development', 'LOW');
    const appends = fixture.effects.ledgerAppends;
    let caught: unknown;
    try {
      fixture.ledger.recordProfileSelection('MEDIUM', 'default_medium_tie_breaker', {
        stage: 'development',
        passed: true,
        completedStages: ['preflight'],
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect((caught as Error).message).toBe('calibration:artifact-receipt-required');
    expect(fixture.effects.ledgerAppends).toBe(appends);
  });
  it('validation diagnostic omissions fail the measured gate from genuine reports', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    await fixture.publish('preflight', 'MEDIUM');
    fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    fixture.ledger.admitStageReportReceipt('preflight', 'MEDIUM');
    fixture.ledger.completeStage('preflight', { stage: 'preflight', passed: true, completedStages: [] });
    await fixture.finishDevelopment('LOW', 'exact');
    await fixture.finishDevelopment('MEDIUM', 'exact');
    await fixture.publish('development', 'LOW');
    await fixture.publish('development', 'MEDIUM');
    fixture.ledger.admitStageReportReceipt('development', 'LOW');
    fixture.ledger.admitStageReportReceipt('development', 'MEDIUM');
    fixture.ledger.recordProfileSelection('MEDIUM', 'default_medium_tie_breaker', {
      stage: 'development',
      passed: true,
      completedStages: ['preflight'],
    });
    fixture.ledger.completeStage('development', {
      stage: 'development',
      passed: true,
      completedStages: ['preflight'],
    });
    const missing: number[] = [];
    for (let index = 0; index < 48; index += 1) {
      missing.push(index);
    }
    await fixture.finishValidation('MEDIUM', { missingDiagnostics: missing });
    await fixture.publish('validation', 'MEDIUM');
    fixture.ledger.admitStageReportReceipt('validation', 'MEDIUM');
    const text = readFileSync(fixture.artifactPath('validation', 'MEDIUM', 'json'), 'utf8');
    const measured = measureCalibrationStageReport(JSON.parse(text));
    expect(measured.stage.parseCases).toBe(48);
    expect(measured.stage.parsedMealCount).toBe(48);
    expect(measured.stage.mealMassEligibleCount).toBe(0);
    expect(measured.stage.mealDensityCoverageCount).toBe(0);
    expect(measured.stage.mealCarbDensityEligibleCount).toBe(0);
    expect(measured.stage.mealFatDensityEligibleCount).toBe(0);
    expect(measured.stage.medianMealMassRelativeError).toBeUndefined();
    let caught: unknown;
    try {
      fixture.ledger.completeStage('validation', {
        stage: 'validation',
        passed: true,
        completedStages: ['preflight', 'development'],
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect((caught as Error).message).toBe('calibration:artifact-gate-failed');
  });
});
describe('opt-out fixture mode and legacy genuine generation', () => {
  it('opt-out ledger refuses admission with mode-required and still generates genuine reports', async () => {
    const fixture = await makeAuthoritativeFixture(makeAuthoritativeOwner(90), { authoritative: false });
    tracked.push(fixture);
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    const text = readFileSync(fixture.artifactPath('preflight', 'LOW', 'json'), 'utf8');
    const measured = measureCalibrationStageReport(JSON.parse(text));
    expect(measured.profile.parseCount).toBe(1);
    expect(measured.stage.totalOutcomes).toBe(1);
    let caught: unknown;
    try {
      fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect((caught as Error).message).toBe('calibration:report-authority-mode-required');
    expect(sdkGuard.constructCalls).toBe(0);
    expect(networkGuard.attemptCalls).toBe(0);
  });
  it('legacy opt-out chain generates genuine development reports before admission exists', async () => {
    const fixture = await makeAuthoritativeFixture(makeAuthoritativeOwner(91), { authoritative: false });
    tracked.push(fixture);
    await fixture.finishPreflight();
    fixture.ledger.completeStage('preflight', { stage: 'preflight', passed: true, completedStages: [] });
    await fixture.finishDevelopment('LOW', 'exact');
    await fixture.finishDevelopment('MEDIUM', 'exact');
    await fixture.publish('development', 'LOW');
    await fixture.publish('development', 'MEDIUM');
    for (const profile of ['LOW', 'MEDIUM'] as const) {
      const devText = readFileSync(fixture.artifactPath('development', profile, 'json'), 'utf8');
      const devMeasured = measureCalibrationStageReport(JSON.parse(devText));
      expect(devMeasured.stage.totalOutcomes).toBe(24);
      expect(devMeasured.stage.parseCases).toBe(24);
    }
    fixture.ledger.recordProfileSelection('MEDIUM', 'default_medium_tie_breaker', {
      stage: 'development',
      passed: true,
      completedStages: ['preflight'],
    });
    fixture.ledger.completeStage('development', {
      stage: 'development',
      passed: true,
      completedStages: ['preflight'],
    });
    await fixture.finishValidation('MEDIUM', 'exact');
    await fixture.publish('validation', 'MEDIUM');
    const text = readFileSync(fixture.artifactPath('validation', 'MEDIUM', 'json'), 'utf8');
    const measured = measureCalibrationStageReport(JSON.parse(text));
    expect(measured.stage.totalOutcomes).toBe(48);
    expect(measured.stage.parseCases).toBe(48);
    expect(sdkGuard.constructCalls).toBe(0);
    expect(networkGuard.attemptCalls).toBe(0);
  });
  it('opt-out validation helpers genuinely yield missing, failure and interruption counts', async () => {
    const missingFixture = await makeAuthoritativeFixture(makeAuthoritativeOwner(93), { authoritative: false });
    tracked.push(missingFixture);
    await missingFixture.finishPreflight();
    await advanceOptOutToValidation(missingFixture);
    const missing: number[] = [];
    for (let index = 0; index < 48; index += 1) {
      missing.push(index);
    }
    await missingFixture.finishValidation('MEDIUM', { missingDiagnostics: missing });
    await missingFixture.publish('validation', 'MEDIUM');
    const missingMeasured = measureCalibrationStageReport(
      JSON.parse(readFileSync(missingFixture.artifactPath('validation', 'MEDIUM', 'json'), 'utf8')),
    );
    expect(missingMeasured.stage.parseCases).toBe(48);
    expect(missingMeasured.stage.parsedMealCount).toBe(48);
    expect(missingMeasured.stage.mealMassEligibleCount).toBe(0);
    expect(missingMeasured.stage.mealDensityCoverageCount).toBe(0);
    const failFixture = await makeAuthoritativeFixture(makeAuthoritativeOwner(94), { authoritative: false });
    tracked.push(failFixture);
    await failFixture.finishPreflight();
    await advanceOptOutToValidation(failFixture);
    await failFixture.finishValidation('MEDIUM', { failures: [0, 1] });
    await failFixture.publish('validation', 'MEDIUM');
    const failMeasured = measureCalibrationStageReport(
      JSON.parse(readFileSync(failFixture.artifactPath('validation', 'MEDIUM', 'json'), 'utf8')),
    );
    expect(failMeasured.stage.totalOutcomes).toBe(48);
    expect(failMeasured.stage.parseCases).toBe(46);
    expect(failMeasured.stage.parsedMealCount).toBe(46);
    const interruptFixture = await makeAuthoritativeFixture(makeAuthoritativeOwner(95), { authoritative: false });
    tracked.push(interruptFixture);
    await interruptFixture.finishPreflight();
    await advanceOptOutToValidation(interruptFixture);
    await interruptFixture.finishValidation('MEDIUM', { interruptions: [0] });
    await interruptFixture.publish('validation', 'MEDIUM');
    const interruptMeasured = measureCalibrationStageReport(
      JSON.parse(readFileSync(interruptFixture.artifactPath('validation', 'MEDIUM', 'json'), 'utf8')),
    );
    expect(interruptMeasured.latency.measuredCases).toBe(47);
    expect(interruptMeasured.latency.missingCases).toBe(1);
    expect(interruptMeasured.latency.measuredCases + interruptMeasured.latency.missingCases).toBe(48);
    expect(sdkGuard.constructCalls).toBe(0);
    expect(networkGuard.attemptCalls).toBe(0);
  });
  it('generic pure preflight evaluator remains not-defined', () => {
    const result = evaluateCalibrationStageGate('preflight', {
      totalCases: 1,
      runCases: 1,
      totalOutcomes: 1,
      parseCases: 1,
      unsafeCompletionCount: 0,
      catastrophicCount: 0,
      failureCount: 0,
    } as never);
    expect(result.passed).toBe(false);
    expect(result.failedChecks).toEqual(['preflight-gate-not-defined']);
  });
});

describe('re-admission, replay and provisional authority', () => {
  it('identical re-admission rereads artifacts with no new event, clock, or fsync', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    const first = fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    expect(first.profile).toBe('LOW');
    expect(Object.isFrozen(first)).toBe(true);
    const appends = fixture.effects.ledgerAppends;
    const clocks = fixture.effects.clockReads;
    const syncs = fixture.effects.fsyncs;
    const verifierBefore = fixture.effects.verifierCalls;
    const nativeBefore = fixture.nativeTrace().length;
    const second = fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    expect(second === first).toBe(false);
    expect(second).toEqual(first);
    expect(Object.isFrozen(second)).toBe(true);
    expect(fixture.effects.ledgerAppends).toBe(appends);
    expect(fixture.effects.clockReads).toBe(clocks);
    expect(fixture.effects.fsyncs).toBe(syncs);
    expect(fixture.effects.verifierCalls).toBeGreaterThan(verifierBefore);
    expect(fixture.nativeTrace().length).toBeGreaterThan(nativeBefore);
    expect(fixture.effects.nativeVerifierCalls).toBeGreaterThan(nativeBefore);
    expect(fixture.receiptEvents()).toHaveLength(1);
  });
  for (const kind of [
    'missing-json',
    'missing-markdown',
    'drift-json',
    'drift-markdown',
    'lock-mismatch',
  ] as const) {
    it(`tampered stage artifacts (${kind}) fail re-admission causeless with lock retained`, async () => {
      const fixture = await openFixture();
      await fixture.finishPreflight();
      await fixture.publish('preflight', 'LOW');
      fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
      const jsonPath = fixture.artifactPath('preflight', 'LOW', 'json');
      const markdownPath = fixture.artifactPath('preflight', 'LOW', 'md');
      if (kind === 'missing-json') {
        rmSync(jsonPath);
      } else if (kind === 'missing-markdown') {
        rmSync(markdownPath);
      } else if (kind === 'drift-json') {
        const text = readFileSync(jsonPath, 'utf8');
        writeFileSync(jsonPath, `${text.slice(0, 120)}X${text.slice(121)}`);
      } else if (kind === 'drift-markdown') {
        const text = readFileSync(markdownPath, 'utf8');
        writeFileSync(markdownPath, `${text.slice(0, 120)}X${text.slice(121)}`);
      } else {
        const lockText = readFileSync(fixture.lockPath(), 'utf8');
        writeFileSync(fixture.lockPath(), `${lockText.slice(0, 10)}X${lockText.slice(11)}`);
      }
      let first: unknown;
      try {
        fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
      } catch (error) {
        first = error;
      }
      expect(first).toBeInstanceOf(CalibrationFatalError);
      expect((first as Error).message).toBe('calibration:artifact-verification-failed');
      expect(asRecord(first).cause).toBeUndefined();
      expect(() => statSync(fixture.lockPath())).not.toThrow();
      const appends = fixture.effects.ledgerAppends;
      const verifierAfterFirst = fixture.effects.verifierCalls;
      const clocks = fixture.effects.clockReads;
      const syncs = fixture.effects.fsyncs;
      const receipts = fixture.receiptEvents().length;
      let snapshotPoison: unknown;
      try {
        fixture.ledger.getStageReportSnapshot('preflight', 'LOW');
      } catch (error) {
        snapshotPoison = error;
      }
      expect(snapshotPoison).toBeInstanceOf(CalibrationFatalError);
      expect((snapshotPoison as Error).message).toBe('calibration:ledger-poisoned');
      expect(asRecord(snapshotPoison).cause).toBeUndefined();
      expect(snapshotPoison === first).toBe(false);
      let second: unknown;
      try {
        fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
      } catch (error) {
        second = error;
      }
      expect(second).toBeInstanceOf(CalibrationFatalError);
      expect((second as Error).message).toBe('calibration:ledger-poisoned');
      expect(asRecord(second).cause).toBeUndefined();
      expect(second === first).toBe(false);
      expect(second === snapshotPoison).toBe(false);
      expect(fixture.effects.ledgerAppends).toBe(appends);
      expect(fixture.effects.verifierCalls).toBe(verifierAfterFirst);
      expect(fixture.effects.clockReads).toBe(clocks);
      expect(fixture.effects.fsyncs).toBe(syncs);
      expect(fixture.receiptEvents().length).toBe(receipts);
    });
  }
  it('new-owner reopen preserves bytes and replays genuinely before any new reservation', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    await fixture.publish('preflight', 'MEDIUM');
    const lowReceipt = fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    const mediumReceipt = fixture.ledger.admitStageReportReceipt('preflight', 'MEDIUM');
    expect(lowReceipt.profile).toBe('LOW');
    expect(mediumReceipt.profile).toBe('MEDIUM');
    expect(fixture.receiptEvents()).toHaveLength(2);
    const jsonLowBefore = readFileSync(fixture.artifactPath('preflight', 'LOW', 'json'), 'utf8');
    const mdLowBefore = readFileSync(fixture.artifactPath('preflight', 'LOW', 'md'), 'utf8');
    const jsonMedBefore = readFileSync(
      fixture.artifactPath('preflight', 'MEDIUM', 'json'),
      'utf8',
    );
    const mdMedBefore = readFileSync(fixture.artifactPath('preflight', 'MEDIUM', 'md'), 'utf8');
    const snapshotLowBefore = JSON.stringify(
      fixture.ledger.getStageReportSnapshot('preflight', 'LOW'),
    );
    const snapshotMedBefore = JSON.stringify(
      fixture.ledger.getStageReportSnapshot('preflight', 'MEDIUM'),
    );
    const next = await fixture.reopen(makeAuthoritativeOwner(7), { acquire: false });
    tracked.push(next);
    expect(next.effects.verifierCalls).toBe(0);
    expect(next.nativeTrace()).toHaveLength(0);
    expect(next.effects.nativeVerifierCalls).toBe(0);
    let guarded: unknown;
    try {
      next.ledger.getStageReportSnapshot('preflight', 'LOW');
    } catch (error) {
      guarded = error;
    }
    expect(guarded).toBeInstanceOf(CalibrationFatalError);
    expect((guarded as Error).message).toBe('calibration:artifact-authority-lock-required');
    expect(asRecord(guarded).cause).toBeUndefined();
    expect(next.effects.verifierCalls).toBe(0);
    expect(next.nativeTrace()).toHaveLength(0);
    const receiptsBefore = fixture.receiptEvents();
    const clocksBefore = next.effects.clockReads;
    const syncsBefore = next.effects.fsyncs;
    const countsBefore = next.ledger.getCounts();
    next.ledger.acquireLock({ ...next.owner });
    expect(next.effects.verifierCalls).toBeGreaterThanOrEqual(2);
    expect(next.nativeTrace().length).toBeGreaterThanOrEqual(2);
    expect(next.effects.nativeVerifierCalls).toBeGreaterThanOrEqual(2);
    expect(next.effects.journalAppends).toBe(0);
    expect(next.effects.ledgerAppends).toBe(0);
    expect(next.effects.clockReads).toBe(clocksBefore);
    expect(next.effects.fsyncs).toBe(syncsBefore);
    expect(next.ledger.getCounts()).toEqual(countsBefore);
    const receiptsAfter = next.receiptEvents();
    expect(receiptsAfter).toHaveLength(2);
    expect(receiptsAfter).toEqual(receiptsBefore);
    expect(readFileSync(next.artifactPath('preflight', 'LOW', 'json'), 'utf8')).toBe(
      jsonLowBefore,
    );
    expect(readFileSync(next.artifactPath('preflight', 'LOW', 'md'), 'utf8')).toBe(mdLowBefore);
    expect(readFileSync(next.artifactPath('preflight', 'MEDIUM', 'json'), 'utf8')).toBe(
      jsonMedBefore,
    );
    expect(readFileSync(next.artifactPath('preflight', 'MEDIUM', 'md'), 'utf8')).toBe(
      mdMedBefore,
    );
    expect(JSON.stringify(next.ledger.getStageReportSnapshot('preflight', 'LOW'))).toBe(
      snapshotLowBefore,
    );
    expect(JSON.stringify(next.ledger.getStageReportSnapshot('preflight', 'MEDIUM'))).toBe(
      snapshotMedBefore,
    );
  });
  it.each([
    ['selected profile', (ledger: AuthoritativeTestLedger) => ledger.getSelectedProfile()],
    ['completed stages', (ledger: AuthoritativeTestLedger) => ledger.getCompletedStages()],
    [
      'completed report predictions',
      (ledger: AuthoritativeTestLedger) => ledger.getCompletedReportPredictions(),
    ],
    [
      'stage report snapshot',
      (ledger: AuthoritativeTestLedger) => ledger.getStageReportSnapshot('preflight', 'LOW'),
    ],
    ['report rebuild', (ledger: AuthoritativeTestLedger) => ledger.rebuildReport()],
    [
      'stage transition',
      (ledger: AuthoritativeTestLedger) =>
        ledger.assertStageTransition('preflight', 'development', {
          stage: 'development',
          passed: true,
          completedStages: ['preflight'],
        }),
    ],
  ])('%s grants no provisional authority before acquire', async (_name, call) => {
    const fixture = await openFixture(makeAuthoritativeOwner(21), false);
    const ledger = fixture.createLedger(fixture.reportOptions, fixture.verifierOptions);
    let caught: unknown;
    try {
      call(ledger);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect((caught as Error).message).toBe('calibration:artifact-authority-lock-required');
    expect(asRecord(caught).cause).toBeUndefined();
    expect(fixture.effects.verifierCalls).toBe(0);
  });
});

describe('failing initial fixture setup cleanup (regression)', () => {
  it('failed authoritative fixture setup removes its just-created owned directory before rejecting', async () => {
    const ownedBefore = fsObserver.mkdtempPaths.length;
    let caught: unknown;
    try {
      await makeAuthoritativeFixture({ ...makeAuthoritativeOwner(99), hostname: '' });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect(fsObserver.mkdtempPaths.length - ownedBefore).toBe(1);
    const created = fsObserver.mkdtempPaths[fsObserver.mkdtempPaths.length - 1] as string;
    expect(typeof created).toBe('string');
    const configuredTmp = process.env.TMPDIR;
    const expectedParent =
      typeof configuredTmp === 'string' && configuredTmp.trim().length > 0
        ? resolve(configuredTmp)
        : resolve(
            fileURLToPath(new URL('.', import.meta.url)),
            '../../lib/calibration-authoritative-test-tmp',
          );
    expect(dirname(created)).toBe(expectedParent);
    expect(basename(created).startsWith('authoritative-reports-')).toBe(true);
    expect(created).toBe(resolve(expectedParent, basename(created)));
    expect(sdkGuard.constructCalls).toBe(0);
    expect(networkGuard.attemptCalls).toBe(0);
    expect(existsSync(created)).toBe(false);
  });
});

it('configured missing TMPDIR parent is honored and created for native fixtures', async () => {
  const first = await openFixture(makeAuthoritativeOwner(70));
  const configuredParent = resolve(first.baseDir, 'configured-missing-temp-parent');
  expect(existsSync(configuredParent)).toBe(false);
  const hadTmpdir = Object.prototype.hasOwnProperty.call(process.env, 'TMPDIR');
  const savedTmpdir = process.env.TMPDIR;
  const ownedBefore = fsObserver.mkdtempPaths.length;
  process.env.TMPDIR = configuredParent;
  try {
    const second = await makeAuthoritativeFixture(makeAuthoritativeOwner(71));
    tracked.push(second);
    expect(second.baseDir.startsWith(configuredParent + sep)).toBe(true);
    expect(existsSync(configuredParent)).toBe(true);
    expect(existsSync(second.baseDir)).toBe(true);
    expect(statSync(configuredParent).isDirectory()).toBe(true);
    expect(statSync(second.baseDir).isDirectory()).toBe(true);
    expect(statSync(configuredParent).mode & 0o777).toBe(0o700);
    expect(statSync(second.baseDir).mode & 0o777).toBe(0o700);
    expect(sdkGuard.constructCalls).toBe(0);
    expect(networkGuard.attemptCalls).toBe(0);
    expect(fsObserver.mkdtempPaths.length - ownedBefore).toBe(1);
    const created = fsObserver.mkdtempPaths[fsObserver.mkdtempPaths.length - 1] as string;
    expect(created.startsWith(configuredParent + sep)).toBe(true);
  } finally {
    if (hadTmpdir) {
      process.env.TMPDIR = savedTmpdir as string;
    } else {
      delete process.env.TMPDIR;
    }
  }
});

describe('admission primitive validation and hostile verifier envelopes', () => {
  it('rejects invalid stage/profile primitives before reflection with zero effects', async () => {
    const invalidPairs = [
      ['not-a-stage', 'LOW'],
      ['preflight', 'HIGH'],
      ['', 'LOW'],
      ['preflight', ''],
    ] as unknown as Array<[unknown, unknown]>;
    for (const args of invalidPairs) {
      const fixture = await openFixture();
      await fixture.finishPreflight();
      await fixture.publish('preflight', 'LOW');
      await fixture.publish('preflight', 'MEDIUM');
      const appends = fixture.effects.ledgerAppends;
      const clocks = fixture.effects.clockReads;
      const syncs = fixture.effects.fsyncs;
      const verifierBefore = fixture.effects.verifierCalls;
      const nativeBefore = fixture.nativeTrace().length;
      let caught: unknown;
      try {
        (fixture.ledger.admitStageReportReceipt as unknown as (...a: unknown[]) => unknown)(
          args[0],
          args[1],
        );
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(CalibrationFatalError);
      expect((caught as Error).message).toBe('calibration:artifact-verification-failed');
      expect(asRecord(caught).cause).toBeUndefined();
      expect(fixture.effects.ledgerAppends).toBe(appends);
      expect(fixture.effects.clockReads).toBe(clocks);
      expect(fixture.effects.fsyncs).toBe(syncs);
      expect(fixture.effects.verifierCalls).toBe(verifierBefore);
      expect(fixture.nativeTrace()).toHaveLength(nativeBefore);
      expect(fixture.receiptEvents()).toHaveLength(0);
    }
  });
  it('malformed verifier envelopes poison causeless without foreign reads', async () => {
    const envelopes: unknown[] = [
      undefined,
      null,
      42,
      'receipt',
      {},
      { report: {}, receipt: {} },
      { report: null, receipt: null },
      { report: {}, receipt: null, extra: 1 },
    ];
    for (const envelope of envelopes) {
      const fixture = await openFixture();
      await fixture.finishPreflight();
      await fixture.publish('preflight', 'LOW');
      fixture.setVerifierOverride(() => envelope as never);
      let first: unknown;
      try {
        fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
      } catch (error) {
        first = error;
      }
      expect(first).toBeInstanceOf(CalibrationFatalError);
      expect((first as Error).message).toBe('calibration:artifact-verification-failed');
      expect(asRecord(first).cause).toBeUndefined();
      fixture.setVerifierOverride(undefined);
      const appends = fixture.effects.ledgerAppends;
      const clocks = fixture.effects.clockReads;
      const syncs = fixture.effects.fsyncs;
      let second: unknown;
      try {
        fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
      } catch (error) {
        second = error;
      }
      expect(second).toBeInstanceOf(CalibrationFatalError);
      expect((second as Error).message).toBe('calibration:ledger-poisoned');
      expect(asRecord(second).cause).toBeUndefined();
      expect(second === first).toBe(false);
      expect(fixture.effects.ledgerAppends).toBe(appends);
      expect(fixture.effects.clockReads).toBe(clocks);
      expect(fixture.effects.fsyncs).toBe(syncs);
    }
  });
  it('hostile verifier callback throw stays foreign with fresh static fatal', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    let messageReads = 0;
    let stackReads = 0;
    let nameReads = 0;
    let causeReads = 0;
    const hostile = new Error('foreign-boom');
    Object.defineProperty(hostile, 'message', {
      configurable: true,
      enumerable: true,
      get: () => {
        messageReads += 1;
        return 'foreign-boom';
      },
    });
    Object.defineProperty(hostile, 'stack', {
      configurable: true,
      enumerable: true,
      get: () => {
        stackReads += 1;
        return 'foreign-stack';
      },
    });
    Object.defineProperty(hostile, 'name', {
      configurable: true,
      enumerable: true,
      get: () => {
        nameReads += 1;
        return 'Error';
      },
    });
    Object.defineProperty(hostile, 'cause', {
      configurable: true,
      enumerable: true,
      get: () => {
        causeReads += 1;
        return undefined;
      },
    });
    fixture.setVerifierOverride(() => {
      throw hostile;
    });
    let caught: unknown;
    try {
      fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    } catch (error) {
      caught = error;
    }
    fixture.setVerifierOverride(undefined);
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect((caught as Error).message).toBe('calibration:artifact-verification-failed');
    expect(asRecord(caught).cause).toBeUndefined();
    expect(caught === hostile).toBe(false);
    expect(messageReads).toBe(0);
    expect(stackReads).toBe(0);
    expect(nameReads).toBe(0);
    expect(causeReads).toBe(0);
  });
  it('promise and thenable verifier returns poison causeless', async () => {
    const values: unknown[] = [Promise.resolve({}), { then: () => undefined }];
    for (const value of values) {
      const fixture = await openFixture();
      await fixture.finishPreflight();
      await fixture.publish('preflight', 'LOW');
      fixture.setVerifierOverride(() => value as never);
      let first: unknown;
      try {
        fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
      } catch (error) {
        first = error;
      }
      expect(first).toBeInstanceOf(CalibrationFatalError);
      expect((first as Error).message).toBe('calibration:artifact-verification-failed');
      expect(asRecord(first).cause).toBeUndefined();
      fixture.setVerifierOverride(undefined);
      const appends = fixture.effects.ledgerAppends;
      const clocks = fixture.effects.clockReads;
      const syncs = fixture.effects.fsyncs;
      let second: unknown;
      try {
        fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
      } catch (error) {
        second = error;
      }
      expect(second).toBeInstanceOf(CalibrationFatalError);
      expect((second as Error).message).toBe('calibration:ledger-poisoned');
      expect(asRecord(second).cause).toBeUndefined();
      expect(second === first).toBe(false);
      expect(fixture.effects.ledgerAppends).toBe(appends);
      expect(fixture.effects.clockReads).toBe(clocks);
      expect(fixture.effects.fsyncs).toBe(syncs);
    }
  });
  it('admission uses the private snapshot even when the public hook is forged', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    const ledgerRecord = fixture.ledger as unknown as Record<string, unknown>;
    const originalSnapshot = ledgerRecord['getStageReportSnapshot'];
    const forgedSnapshot = {
      stage: 'preflight',
      profile: 'LOW',
      identity: fixture.identity,
      counts: {
        imageCallsReserved: 999,
        imageCallsCompleted: 999,
        imageCallsFailed: 0,
        imageCallsPending: 0,
      },
      images: [],
      nonReservations: [],
    };
    ledgerRecord['getStageReportSnapshot'] = () => forgedSnapshot;
    try {
      const receipt = fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
      expect(receipt.profile).toBe('LOW');
      expect(receipt.stage).toBe('preflight');
    } finally {
      ledgerRecord['getStageReportSnapshot'] = originalSnapshot;
    }
    const throwingSnapshot = () => {
      throw new CalibrationFatalError('calibration:forged-snapshot-throw');
    };
    ledgerRecord['getStageReportSnapshot'] = throwingSnapshot;
    try {
      const receipt = fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
      expect(receipt.profile).toBe('LOW');
    } finally {
      ledgerRecord['getStageReportSnapshot'] = originalSnapshot;
    }
  });
  it('successful admission returns a closed receipt with lowercase hashes and frozen params', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    let seenParams: unknown;
    fixture.setVerifierOverride((params) => {
      seenParams = params;
      return fixture.nativeVerify(
        params as Readonly<{
          stage: 'preflight';
          profile: 'LOW';
          snapshot: never;
        }> as never,
      );
    });
    const receipt = fixture.ledger.admitStageReportReceipt('preflight', 'LOW') as unknown as Record<
      string,
      unknown
    >;
    fixture.setVerifierOverride(undefined);
    expect(Object.keys(receipt).sort()).toEqual([
      'jsonSha256',
      'markdownSha256',
      'profile',
      'runId',
      'stage',
    ]);
    expect(typeof receipt['runId']).toBe('string');
    expect((receipt['runId'] as string).length).toBeGreaterThan(0);
    expect(receipt['jsonSha256']).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt['markdownSha256']).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(seenParams).not.toBe(undefined);
    const paramsRecord = seenParams as Record<string, unknown>;
    expect(Object.keys(paramsRecord).sort()).toEqual(['profile', 'snapshot', 'stage']);
    expect(Object.isFrozen(seenParams)).toBe(true);
    expect(Object.isFrozen(paramsRecord['snapshot'])).toBe(true);
  });
});

describe('re-admission conflicts, duplicates and replay shapes', () => {
  it('differing valid receipt conflicts poison with lock retained', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    await fixture.publish('preflight', 'MEDIUM');
    const first = fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    expect(first.profile).toBe('LOW');
    const nativeBefore = fixture.nativeTrace().length;
    fixture.setVerifierOverride((params) => {
      const native = fixture.nativeVerify(params as never) as unknown as Record<string, unknown>;
      const receipt = (native['receipt'] as Record<string, unknown>) ?? {};
      const forged = {
        ...native,
        receipt: {
          ...(receipt as Record<string, unknown>),
          jsonSha256: '0'.repeat(64),
        },
      };
      return forged as never;
    });
    let conflict: unknown;
    try {
      fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    } catch (error) {
      conflict = error;
    }
    fixture.setVerifierOverride(undefined);
    expect(conflict).toBeInstanceOf(CalibrationFatalError);
    expect((conflict as Error).message).toBe('calibration:artifact-receipt-conflict');
    expect(asRecord(conflict).cause).toBeUndefined();
    expect(conflict === first).toBe(false);
    expect(() => statSync(fixture.lockPath())).not.toThrow();
    expect(fixture.nativeTrace().length).toBeGreaterThan(nativeBefore);
    const appends = fixture.effects.ledgerAppends;
    const clocks = fixture.effects.clockReads;
    const syncs = fixture.effects.fsyncs;
    let poisoned: unknown;
    try {
      fixture.ledger.getStageReportSnapshot('preflight', 'LOW');
    } catch (error) {
      poisoned = error;
    }
    expect(poisoned).toBeInstanceOf(CalibrationFatalError);
    expect((poisoned as Error).message).toBe('calibration:ledger-poisoned');
    expect(poisoned === conflict).toBe(false);
    expect(fixture.effects.ledgerAppends).toBe(appends);
    expect(fixture.effects.clockReads).toBe(clocks);
    expect(fixture.effects.fsyncs).toBe(syncs);
  });
  it('duplicate durable receipt events are malformed on replay', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    const events = fixture.ledgerEvents();
    const receiptEvent = events.find(
      (event) =>
        typeof event === 'object' &&
        event !== null &&
        (event as Record<string, unknown>)['type'] === 'artifact_receipt_admitted',
    );
    expect(receiptEvent).not.toBe(undefined);
    fixture.appendRawLedgerEvent(JSON.parse(JSON.stringify(receiptEvent)));
    const verifierBefore = fixture.effects.verifierCalls;
    const nativeBefore = fixture.effects.nativeVerifierCalls;
    const appendsBefore = fixture.effects.ledgerAppends;
    const journalBefore = fixture.effects.journalAppends;
    const fsyncsBefore = fixture.effects.fsyncs;
    const clocksBefore = fixture.effects.clockReads;
    let caught: unknown;
    try {
      fixture.createLedger(fixture.reportOptions, fixture.verifierOptions);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect((caught as Error).message).toBe('calibration:ledger-event-malformed:artifact_receipt_admitted');
    expect(asRecord(caught).cause).toBeUndefined();
    expect(fixture.effects.verifierCalls).toBe(verifierBefore);
    expect(fixture.effects.nativeVerifierCalls).toBe(nativeBefore);
    expect(fixture.effects.ledgerAppends).toBe(appendsBefore);
    expect(fixture.effects.journalAppends).toBe(journalBefore);
    expect(fixture.effects.fsyncs).toBe(fsyncsBefore);
    expect(fixture.effects.clockReads).toBe(clocksBefore);
  });
  it('receipt events carry no owner, path, report or provider text', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    const events = fixture.receiptEvents();
    expect(events).toHaveLength(1);
    const event = events[0] as Record<string, unknown>;
    expect(Object.keys(event).sort()).toEqual(['at', 'receipt', 'type']);
    const receipt = event['receipt'] as Record<string, unknown>;
    expect(Object.keys(receipt).sort()).toEqual([
      'jsonSha256',
      'markdownSha256',
      'profile',
      'runId',
      'stage',
    ]);
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain('hostname');
    expect(serialized).not.toContain('bootId');
    expect(serialized).not.toContain(fixture.baseDir);
    expect(serialized).not.toContain('provider');
  });
  it('empty journal-only stream without a header is rejected', async () => {
    const fixture = await openFixture(makeAuthoritativeOwner(79), false);
    fixture.appendRawLedgerEvent({
      type: 'reserved',
      key: { stage: 'preflight', profile: 'LOW', caseId: 'x', sampleIndex: 1 },
      at: '2026-10-11T00:00:00.000Z',
    });
    const caught = acquireWith(fixture, fixture.reportOptions, fixture.verifierOptions);
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect((caught as Error).message).toBe('calibration:ledger-event-malformed:protocol_identity');
    expect(asRecord(caught).cause).toBeUndefined();
    expect(fixture.effects.verifierCalls).toBe(0);
    expect(fixture.nativeTrace()).toHaveLength(0);
  });
});

describe('post-seal runtime and replay writes', () => {
  it('sealed stage/profile rejects reservations, journals and completions with valid data', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    await fixture.publish('preflight', 'MEDIUM');
    fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    fixture.ledger.admitStageReportReceipt('preflight', 'MEDIUM');
    fixture.ledger.completeStage('preflight', { stage: 'preflight', passed: true, completedStages: [] });
    await fixture.finishDevelopment('LOW', 'exact');
    await fixture.finishDevelopment('MEDIUM', 'exact');
    await fixture.publish('development', 'LOW');
    await fixture.publish('development', 'MEDIUM');
    fixture.ledger.admitStageReportReceipt('development', 'LOW');
    fixture.ledger.admitStageReportReceipt('development', 'MEDIUM');
    const snapshot = fixture.ledger.getStageReportSnapshot('development', 'LOW');
    const firstImage = snapshot.images[0];
    expect(firstImage).not.toBe(undefined);
    if (firstImage === undefined || firstImage.status !== 'completed') {
      throw new Error('authoritative-test-precondition: expected completed image outcome');
    }
    const sealedKey = { ...firstImage.key };
    const sealedJournal = JSON.parse(JSON.stringify(firstImage.journal)) as Parameters<AuthoritativeTestLedger['appendResultJournal']>[0];
    const sealedHash = firstImage.journalHash;
    expect(sealedHash).toMatch(/^[0-9a-f]{64}$/);
    const appendsBefore = fixture.effects.ledgerAppends;
    const journalsBefore = fixture.effects.journalAppends;
    const clocksBefore = fixture.effects.clockReads;
    const syncsBefore = fixture.effects.fsyncs;
    const attempts: Array<() => void> = [
      () => fixture.ledger.reserve({ ...sealedKey } as never),
      () => fixture.ledger.appendResultJournal(JSON.parse(JSON.stringify(sealedJournal)) as never),
      () => fixture.ledger.complete({ ...sealedKey } as never, sealedHash),
    ];
    for (const attempt of attempts) {
      let caught: unknown;
      try {
        attempt();
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(CalibrationFatalError);
      expect((caught as Error).message).toBe('calibration:stage-profile-sealed');
      expect(asRecord(caught).cause).toBeUndefined();
    }
    expect(fixture.effects.ledgerAppends).toBe(appendsBefore);
    expect(fixture.effects.journalAppends).toBe(journalsBefore);
    expect(fixture.effects.clockReads).toBe(clocksBefore);
    expect(fixture.effects.fsyncs).toBe(syncsBefore);
    expect(() => statSync(fixture.lockPath())).not.toThrow();
    expect(fixture.ledger.getStageReportSnapshot('development', 'MEDIUM').images.length).toBeGreaterThan(
      0,
    );
  });
  it('failed LOW admission leaves no development receipt while fresh replay keeps MEDIUM pair usable', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    await fixture.publish('preflight', 'MEDIUM');
    fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    fixture.ledger.admitStageReportReceipt('preflight', 'MEDIUM');
    fixture.ledger.completeStage('preflight', { stage: 'preflight', passed: true, completedStages: [] });
    await fixture.finishDevelopment('LOW', 'exact');
    await fixture.publish('development', 'LOW');
    const lowSnapshot = fixture.ledger.getStageReportSnapshot('development', 'LOW');
    const lowFirst = lowSnapshot.images[0];
    if (lowFirst === undefined || lowFirst.status !== 'completed') {
      throw new Error('authoritative-test-precondition: expected completed development image');
    }
    const unsealedKey = { ...(lowFirst.key as unknown as Record<string, unknown>), profile: 'MEDIUM' };
    const jsonPath = fixture.artifactPath('development', 'LOW', 'json');
    const originalText = readFileSync(jsonPath, 'utf8');
    writeFileSync(jsonPath, `${originalText.slice(0, 120)}X${originalText.slice(121)}`);
    let failed: unknown;
    try {
      fixture.ledger.admitStageReportReceipt('development', 'LOW');
    } catch (error) {
      failed = error;
    }
    expect(failed).toBeInstanceOf(CalibrationFatalError);
    expect((failed as Error).message).toBe('calibration:artifact-verification-failed');
    expect(asRecord(failed).cause).toBeUndefined();
    expect(fixture.receiptEvents().filter((event) => (event['receipt'] as Record<string, unknown>)['stage'] === 'development')).toHaveLength(0);
    expect(() => statSync(fixture.lockPath())).not.toThrow();
    const appends = fixture.effects.ledgerAppends;
    const clocks = fixture.effects.clockReads;
    const syncs = fixture.effects.fsyncs;
    let poisoned: unknown;
    try {
      fixture.ledger.getStageReportSnapshot('development', 'LOW');
    } catch (error) {
      poisoned = error;
    }
    expect(poisoned).toBeInstanceOf(CalibrationFatalError);
    expect((poisoned as Error).message).toBe('calibration:ledger-poisoned');
    expect(poisoned === failed).toBe(false);
    expect(fixture.effects.ledgerAppends).toBe(appends);
    expect(fixture.effects.clockReads).toBe(clocks);
    expect(fixture.effects.fsyncs).toBe(syncs);
    writeFileSync(jsonPath, originalText);
    fixture.releaseLockViaNativeDeps();
    const fresh = fixture.createLedger(fixture.reportOptions, fixture.verifierOptions);
    fresh.acquireLock({ ...fixture.owner });
    const freshAppendsBefore = fixture.effects.ledgerAppends;
    const freshCountsBefore = fresh.getCounts();
    const devReceiptsBefore = fixture.receiptEvents().filter((event) => (event['receipt'] as Record<string, unknown>)['stage'] === 'development').length;
    try {
      fresh.reserve(unsealedKey as never);
    } finally {
      expect(fixture.effects.ledgerAppends).toBeGreaterThan(freshAppendsBefore);
      expect(fixture.receiptEvents().filter((event) => (event['receipt'] as Record<string, unknown>)['stage'] === 'development')).toHaveLength(devReceiptsBefore);
      expect(devReceiptsBefore).toBe(0);
      expect(fresh.getCounts().imageReserved).toBeGreaterThan(freshCountsBefore.imageReserved);
      try {
        fresh.releaseLock({ ...fixture.owner });
      } catch {
        // Best effort; original fixture cleanup owns the directory.
      }
    }
  });
});

describe('reentrant public ledger guard (26 APIs)', () => {
  it('returned ledger exposes exactly the 26 inventoried public methods', async () => {
    const fixture = await openFixture();
    const expected = [
      'acquireLock',
      'releaseLock',
      'assertIdentity',
      'assertGitState',
      'assertStageTransition',
      'reserve',
      'reserveSynthetic',
      'reserveTokenCount',
      'completeTokenCount',
      'failTokenCount',
      'getCounts',
      'appendResultJournal',
      'complete',
      'rebuildReport',
      'recoverAfterCrash',
      'recordSafeError',
      'pinModelVersion',
      'getPinnedModelVersion',
      'recordProfileSelection',
      'getSelectedProfile',
      'completeStage',
      'getCompletedStages',
      'getCompletedReportPredictions',
      'recordNonReservationResult',
      'getStageReportSnapshot',
      'admitStageReportReceipt',
    ];
    expect([...Object.keys(fixture.ledger)].sort()).toEqual([...expected].sort());
    expect(fixture.effects.verifierCalls).toBe(0);
    expect(fixture.nativeTrace()).toHaveLength(0);
  });
  it.each([
    ['acquireLock', (ledger: AuthoritativeTestLedger, ctx: Record<string, unknown>) =>
      ledger.acquireLock({ ...(ctx['ownerClone'] as Record<string, unknown>) } as never)],
    ['releaseLock', (ledger: AuthoritativeTestLedger, ctx: Record<string, unknown>) =>
      ledger.releaseLock({ ...(ctx['ownerClone'] as Record<string, unknown>) } as never)],
    ['assertIdentity', (ledger: AuthoritativeTestLedger, ctx: Record<string, unknown>) =>
      ledger.assertIdentity({ ...(ctx['identityClone'] as Record<string, unknown>) } as never)],
    ['assertGitState', (ledger: AuthoritativeTestLedger) =>
      ledger.assertGitState({
        headCommit: 'a'.repeat(40),
        functionsTreeId: 'c'.repeat(40),
        dirtyPaths: [],
      })],
    ['assertStageTransition', (ledger: AuthoritativeTestLedger) =>
      ledger.assertStageTransition('preflight', 'development', {
        stage: 'development',
        passed: true,
        completedStages: ['preflight'],
      })],
    ['reserve', (ledger: AuthoritativeTestLedger, ctx: Record<string, unknown>) =>
      ledger.reserve({ stage: 'development', profile: 'LOW', caseId: ctx['caseId'] as string, sampleIndex: 1 })],
    ['reserveSynthetic', (ledger: AuthoritativeTestLedger) =>
      ledger.reserveSynthetic({ reason: 'reentrant-test', index: 0 }, () => undefined)],
    ['reserveTokenCount', (ledger: AuthoritativeTestLedger, ctx: Record<string, unknown>) =>
      ledger.reserveTokenCount({
        kind: 'token_count',
        stage: 'preflight',
        caseId: ctx['caseId'] as string,
        model: 'gemini-3.8-flash',
      })],
    ['completeTokenCount', (ledger: AuthoritativeTestLedger, ctx: Record<string, unknown>) =>
      ledger.completeTokenCount(
        {
          kind: 'token_count',
          stage: 'preflight',
          caseId: ctx['caseId'] as string,
          model: 'gemini-3.8-flash',
        },
        1,
      )],
    ['failTokenCount', (ledger: AuthoritativeTestLedger, ctx: Record<string, unknown>) =>
      ledger.failTokenCount(
        {
          kind: 'token_count',
          stage: 'preflight',
          caseId: ctx['caseId'] as string,
          model: 'gemini-3.8-flash',
        },
        'http_5xx',
      )],
    ['getCounts', (ledger: AuthoritativeTestLedger) => ledger.getCounts()],
    ['appendResultJournal', (ledger: AuthoritativeTestLedger, ctx: Record<string, unknown>) =>
      ledger.appendResultJournal(JSON.parse(JSON.stringify(ctx['journalClone'])) as never)],
    ['complete', (ledger: AuthoritativeTestLedger, ctx: Record<string, unknown>) =>
      ledger.complete(
        JSON.parse(JSON.stringify(ctx['keyClone'])) as never,
        ctx['journalHash'] as string,
      )],
    ['rebuildReport', (ledger: AuthoritativeTestLedger) => ledger.rebuildReport()],
    ['recoverAfterCrash', (ledger: AuthoritativeTestLedger) => ledger.recoverAfterCrash()],
    ['recordSafeError', (ledger: AuthoritativeTestLedger, ctx: Record<string, unknown>) =>
      ledger.recordSafeError({
        stage: 'preflight',
        kind: 'token_count',
        caseId: ctx['caseId'] as string,
        errorCategory: 'http_5xx',
      } as never)],
    ['pinModelVersion', (ledger: AuthoritativeTestLedger) => ledger.pinModelVersion('gemini-3.8-fixture-pin')],
    ['getPinnedModelVersion', (ledger: AuthoritativeTestLedger) => ledger.getPinnedModelVersion()],
    ['recordProfileSelection', (ledger: AuthoritativeTestLedger) =>
      ledger.recordProfileSelection('MEDIUM', 'default_medium_tie_breaker', {
        stage: 'development',
        passed: true,
        completedStages: ['preflight'],
      })],
    ['getSelectedProfile', (ledger: AuthoritativeTestLedger) => ledger.getSelectedProfile()],
    ['completeStage', (ledger: AuthoritativeTestLedger) =>
      ledger.completeStage('preflight', { stage: 'preflight', passed: true, completedStages: [] })],
    ['getCompletedStages', (ledger: AuthoritativeTestLedger) => ledger.getCompletedStages()],
    ['getCompletedReportPredictions', (ledger: AuthoritativeTestLedger) =>
      ledger.getCompletedReportPredictions()],
    ['recordNonReservationResult', (ledger: AuthoritativeTestLedger, ctx: Record<string, unknown>) =>
      ledger.recordNonReservationResult({
        key: JSON.parse(JSON.stringify(ctx['benchmarkKey'])) as never,
        reason: 'barcode',
        prediction: {
          parseStatus: 'failure',
          source: 'barcode',
          decision: 'error',
          failureCategory: 'product',
          failureCode: 'off_product_not_found',
          latencyMs: 200,
          sampleIndex: 1,
          cached: false,
        },
      } as never)],
    ['getStageReportSnapshot', (ledger: AuthoritativeTestLedger) =>
      ledger.getStageReportSnapshot('preflight', 'LOW')],
    ['admitStageReportReceipt', (ledger: AuthoritativeTestLedger) =>
      ledger.admitStageReportReceipt('preflight', 'LOW')],
  ])('%s invoked reentrantly poisons before effects and blocks outer admission', async (_name, call) => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    const snapshot = fixture.ledger.getStageReportSnapshot('preflight', 'LOW');
    const first = snapshot.images[0];
    if (first === undefined || first.status !== 'completed') {
      throw new Error('authoritative-test-precondition: expected completed image');
    }
    const caseId = (first.key as unknown as { caseId: string }).caseId;
    const journalClone = JSON.parse(JSON.stringify(first.journal)) as unknown;
    const journalHash = first.journalHash;
    const keyClone = JSON.parse(JSON.stringify(first.key)) as unknown;
    const plan = fixture.reportOptions.getReportOutcomePlan('MEDIUM');
    const barcodeRow = plan.find((row) => row.key.stage === 'benchmark' && row.scanMode === 'barcode');
    if (barcodeRow === undefined) {
      throw new Error('authoritative-test-precondition: expected benchmark barcode plan row');
    }
    const benchmarkKey = JSON.parse(JSON.stringify(barcodeRow.key)) as unknown;
    const ctx: Record<string, unknown> = {
      caseId,
      journalClone,
      journalHash,
      keyClone,
      benchmarkKey,
      ownerClone: { ...fixture.owner },
      identityClone: { ...fixture.identity },
    };
    const appendsBefore = fixture.effects.ledgerAppends;
    const journalsBefore = fixture.effects.journalAppends;
    const clocksBefore = fixture.effects.clockReads;
    const syncsBefore = fixture.effects.fsyncs;
    let namedTargetInvocations = 0;
    let nested: unknown;
    fixture.setVerifierOverride((params) => {
      try {
        namedTargetInvocations += 1;
        (call as (ledger: AuthoritativeTestLedger, ctx: Record<string, unknown>) => unknown)(
          fixture.ledger,
          ctx,
        );
      } catch (error) {
        nested = error;
      }
      return fixture.nativeVerify(params as never);
    });
    let outer: unknown;
    try {
      fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    } catch (error) {
      outer = error;
    }
    fixture.setVerifierOverride(undefined);
    expect(namedTargetInvocations).toBe(1);
    expect(nested).toBeInstanceOf(CalibrationFatalError);
    expect((nested as Error).message).toBe('calibration:reentrant-call');
    expect(asRecord(nested).cause).toBeUndefined();
    expect(outer).toBeInstanceOf(CalibrationFatalError);
    expect((outer as Error).message).toBe('calibration:artifact-verification-failed');
    expect(asRecord(outer).cause).toBeUndefined();
    expect(outer === nested).toBe(false);
    expect(() => statSync(fixture.lockPath())).not.toThrow();
    expect(fixture.effects.ledgerAppends).toBe(appendsBefore);
    expect(fixture.effects.journalAppends).toBe(journalsBefore);
    expect(fixture.effects.clockReads).toBe(clocksBefore);
    expect(fixture.effects.fsyncs).toBe(syncsBefore);
    const appends = fixture.effects.ledgerAppends;
    const clocks = fixture.effects.clockReads;
    const syncs = fixture.effects.fsyncs;
    let poisoned: unknown;
    try {
      fixture.ledger.getStageReportSnapshot('preflight', 'LOW');
    } catch (error) {
      poisoned = error;
    }
    expect(poisoned).toBeInstanceOf(CalibrationFatalError);
    expect((poisoned as Error).message).toBe('calibration:ledger-poisoned');
    expect(poisoned === outer).toBe(false);
    expect(poisoned === nested).toBe(false);
    expect(fixture.effects.ledgerAppends).toBe(appends);
    expect(fixture.effects.clockReads).toBe(clocks);
    expect(fixture.effects.fsyncs).toBe(syncs);
  });
});

describe('constructor provisional authority and owner-change rereverification', () => {
  it('populated constructor grants no authority before current-owner replay', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    await fixture.publish('preflight', 'MEDIUM');
    fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    fixture.ledger.admitStageReportReceipt('preflight', 'MEDIUM');
    fixture.ledger.completeStage('preflight', { stage: 'preflight', passed: true, completedStages: [] });
    const next = await fixture.reopen(makeAuthoritativeOwner(80), { acquire: false });
    tracked.push(next);
    expect(next.effects.verifierCalls).toBe(0);
    expect(next.nativeTrace()).toHaveLength(0);
    expect(next.effects.nativeVerifierCalls).toBe(0);
    const probes: Array<() => void> = [
      () => next.ledger.getSelectedProfile(),
      () => next.ledger.getCompletedStages(),
      () => next.ledger.getCompletedReportPredictions(),
      () => next.ledger.getStageReportSnapshot('preflight', 'LOW'),
      () => next.ledger.rebuildReport(),
      () =>
        next.ledger.assertStageTransition('preflight', 'development', {
          stage: 'development',
          passed: true,
          completedStages: ['preflight'],
        }),
    ];
    for (const probe of probes) {
      let caught: unknown;
      try {
        probe();
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(CalibrationFatalError);
      expect((caught as Error).message).toBe('calibration:artifact-authority-lock-required');
      expect(asRecord(caught).cause).toBeUndefined();
    }
    expect(next.effects.verifierCalls).toBe(0);
    expect(next.nativeTrace()).toHaveLength(0);
  });
  it('new-owner acquire reverifies each receipt chronologically before selection', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    await fixture.publish('preflight', 'MEDIUM');
    fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    fixture.ledger.admitStageReportReceipt('preflight', 'MEDIUM');
    fixture.ledger.completeStage('preflight', { stage: 'preflight', passed: true, completedStages: [] });
    await fixture.finishDevelopment('LOW', 'exact');
    await fixture.finishDevelopment('MEDIUM', 'exact');
    await fixture.publish('development', 'LOW');
    await fixture.publish('development', 'MEDIUM');
    fixture.ledger.admitStageReportReceipt('development', 'LOW');
    fixture.ledger.admitStageReportReceipt('development', 'MEDIUM');
    fixture.ledger.recordProfileSelection('MEDIUM', 'default_medium_tie_breaker', {
      stage: 'development',
      passed: true,
      completedStages: ['preflight'],
    });
    const next = await fixture.reopen(makeAuthoritativeOwner(81), { acquire: false });
    tracked.push(next);
    next.ledger.acquireLock({ ...next.owner });
    const trace = next.nativeTrace();
    expect(trace.length).toBeGreaterThanOrEqual(4);
    const pairs = trace.map((entry) => `${entry.stage}:${entry.profile}`);
    const firstLowPreflight = pairs.indexOf('preflight:LOW');
    const firstMedPreflight = pairs.indexOf('preflight:MEDIUM');
    const firstLowDev = pairs.indexOf('development:LOW');
    const firstMedDev = pairs.indexOf('development:MEDIUM');
    expect(firstLowPreflight).toBeGreaterThanOrEqual(0);
    expect(firstMedPreflight).toBeGreaterThanOrEqual(0);
    expect(firstLowDev).toBeGreaterThanOrEqual(0);
    expect(firstMedDev).toBeGreaterThanOrEqual(0);
    expect(firstLowPreflight).toBeLessThan(firstLowDev);
    expect(firstMedPreflight).toBeLessThan(firstMedDev);
    expect(firstLowPreflight).toBeLessThan(firstMedPreflight);
    expect(firstMedPreflight).toBeLessThan(firstLowDev);
    expect(firstLowDev).toBeLessThan(firstMedDev);
    const devLowEntry = trace[firstLowDev] as Readonly<{
      selectedProfile?: string;
    }>;
    expect(devLowEntry.selectedProfile).toBe(undefined);
    const devMedEntry = trace[firstMedDev] as Readonly<{
      selectedProfile?: string;
    }>;
    expect(devMedEntry.selectedProfile).toBe(undefined);
    expect(next.ledger.getSelectedProfile()).toBe('MEDIUM');
  });
  it('missing artifact on owner-change replay poisons with lock retained', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    const next = await fixture.reopen(makeAuthoritativeOwner(82), { acquire: false });
    tracked.push(next);
    rmSync(next.artifactPath('preflight', 'LOW', 'json'));
    let caught: unknown;
    try {
      next.ledger.acquireLock({ ...next.owner });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect((caught as Error).message).toBe('calibration:ledger-poisoned');
    expect(asRecord(caught).cause).toBeUndefined();
    expect(() => statSync(next.lockPath())).not.toThrow();
  });
});

describe('real durability faults at file seams', () => {
  it('receipt fdWrite fault armed only for persistence poisons with lock retained', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    fixture.ledger.releaseLock({ ...fixture.owner });
    let armed = false;
    let fdWriteHits = 0;
    const faulty = fixture.createLedgerWithFileStoreOverrides(
      {
        fdWriteSync: (fd, buffer, offset, length) => {
          if (!armed) {
            return nativeFdWriteSync(fd, buffer, offset, length);
          }
          fdWriteHits += 1;
          throw new Error('authoritative-test-fd-write-fault');
        },
      },
      fixture.reportOptions,
      fixture.verifierOptions,
    );
    faulty.acquireLock({ ...fixture.owner });
    armed = true;
    const nativeBefore = fixture.nativeTrace().length;
    let failed: unknown;
    try {
      faulty.admitStageReportReceipt('preflight', 'LOW');
    } catch (error) {
      failed = error;
    }
    expect(failed).toBeInstanceOf(CalibrationFatalError);
    expect(asRecord(failed).cause).toBeUndefined();
    expect(fdWriteHits).toBeGreaterThanOrEqual(1);
    expect(fixture.nativeTrace().length).toBeGreaterThan(nativeBefore);
    expect(fixture.receiptEvents()).toHaveLength(0);
    expect(() => statSync(fixture.lockPath())).not.toThrow();
    const appends = fixture.effects.ledgerAppends;
    const clocks = fixture.effects.clockReads;
    const syncs = fixture.effects.fsyncs;
    let poisoned: unknown;
    try {
      faulty.getStageReportSnapshot('preflight', 'LOW');
    } catch (error) {
      poisoned = error;
    }
    expect(poisoned).toBeInstanceOf(CalibrationFatalError);
    expect((poisoned as Error).message).toBe('calibration:ledger-poisoned');
    expect(poisoned === failed).toBe(false);
    expect(fixture.effects.ledgerAppends).toBe(appends);
    expect(fixture.effects.clockReads).toBe(clocks);
    expect(fixture.effects.fsyncs).toBe(syncs);
    try {
      faulty.releaseLock({ ...fixture.owner });
    } catch {
      // Best effort; lock-retained assertion above is authoritative.
    }
  });
  it('receipt rename pre-rename fault grants no authority and poisons', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    fixture.ledger.releaseLock({ ...fixture.owner });
    let armed = false;
    let renameHits = 0;
    let renameTarget = '';
    const faulty = fixture.createLedgerWithFileStoreOverrides(
      {
        renameSync: (from, to) => {
          if (!armed) {
            return nativeRenameSync(from, to);
          }
          if (typeof to === 'string' && to.endsWith('ledger.json')) {
            renameHits += 1;
            renameTarget = to;
            throw new Error('authoritative-test-rename-fault');
          }
          return nativeRenameSync(from, to);
        },
      },
      fixture.reportOptions,
      fixture.verifierOptions,
    );
    faulty.acquireLock({ ...fixture.owner });
    armed = true;
    const nativeBefore = fixture.nativeTrace().length;
    let failed: unknown;
    try {
      faulty.admitStageReportReceipt('preflight', 'LOW');
    } catch (error) {
      failed = error;
    }
    expect(failed).toBeInstanceOf(CalibrationFatalError);
    expect(asRecord(failed).cause).toBeUndefined();
    expect(renameHits).toBeGreaterThanOrEqual(1);
    expect(renameTarget.endsWith('ledger.json')).toBe(true);
    expect(fixture.nativeTrace().length).toBeGreaterThan(nativeBefore);
    expect(fixture.receiptEvents()).toHaveLength(0);
    expect(() => statSync(fixture.lockPath())).not.toThrow();
    const appends = fixture.effects.ledgerAppends;
    let poisoned: unknown;
    try {
      faulty.getStageReportSnapshot('preflight', 'LOW');
    } catch (error) {
      poisoned = error;
    }
    expect(poisoned).toBeInstanceOf(CalibrationFatalError);
    expect((poisoned as Error).message).toBe('calibration:ledger-poisoned');
    expect(poisoned === failed).toBe(false);
    expect(fixture.effects.ledgerAppends).toBe(appends);
    try {
      faulty.releaseLock({ ...fixture.owner });
    } catch {
      // Best effort.
    }
  });
  it('receipt rename post-rename ambiguity still poisons without authority', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    fixture.ledger.releaseLock({ ...fixture.owner });
    let armed = false;
    let renameHits = 0;
    let renameTarget = '';
    const faulty = fixture.createLedgerWithFileStoreOverrides(
      {
        renameSync: (from, to) => {
          if (!armed) {
            return nativeRenameSync(from, to);
          }
          if (typeof to === 'string' && to.endsWith('ledger.json')) {
            renameHits += 1;
            renameTarget = to;
            nativeRenameSync(from, to);
            throw new Error('authoritative-test-rename-ambiguity');
          }
          return nativeRenameSync(from, to);
        },
      },
      fixture.reportOptions,
      fixture.verifierOptions,
    );
    faulty.acquireLock({ ...fixture.owner });
    armed = true;
    const nativeBefore = fixture.nativeTrace().length;
    let failed: unknown;
    try {
      faulty.admitStageReportReceipt('preflight', 'LOW');
    } catch (error) {
      failed = error;
    }
    expect(failed).toBeInstanceOf(CalibrationFatalError);
    expect(asRecord(failed).cause).toBeUndefined();
    expect(renameHits).toBeGreaterThanOrEqual(1);
    expect(renameTarget.endsWith('ledger.json')).toBe(true);
    expect(fixture.nativeTrace().length).toBeGreaterThan(nativeBefore);
    expect(existsSync(renameTarget)).toBe(true);
    expect(readFileSync(renameTarget, 'utf8').length).toBeGreaterThan(0);
    const persisted = JSON.parse(readFileSync(renameTarget, 'utf8')) as unknown;
    expect(Array.isArray(persisted)).toBe(true);
    const persistedReceiptEvents = (persisted as Array<Record<string, unknown>>).filter((event) => typeof event === 'object' && event !== null && (event as Record<string, unknown>)['type'] === 'artifact_receipt_admitted');
    expect(persistedReceiptEvents).toHaveLength(1);
    const persistedEvent = persistedReceiptEvents[0] as Record<string, unknown>;
    expect(Object.keys(persistedEvent).sort()).toEqual(['at', 'receipt', 'type']);
    const persistedReceipt = persistedEvent['receipt'] as Record<string, unknown>;
    expect(Object.keys(persistedReceipt).sort()).toEqual(['jsonSha256', 'markdownSha256', 'profile', 'runId', 'stage']);
    expect(persistedReceipt['stage']).toBe('preflight');
    expect(persistedReceipt['profile']).toBe('LOW');
    expect(typeof persistedReceipt['runId']).toBe('string');
    expect((persistedReceipt['runId'] as string).length).toBeGreaterThan(0);
    expect(persistedReceipt['jsonSha256']).toMatch(/^[0-9a-f]{64}$/);
    expect(persistedReceipt['markdownSha256']).toMatch(/^[0-9a-f]{64}$/);
    const readAppends = fixture.effects.ledgerAppends;
    const readJournals = fixture.effects.journalAppends;
    const readClocks = fixture.effects.clockReads;
    const readSyncs = fixture.effects.fsyncs;
    expect(fixture.receiptEvents()).toHaveLength(1);
    expect(fixture.effects.ledgerAppends).toBe(readAppends);
    expect(fixture.effects.journalAppends).toBe(readJournals);
    expect(fixture.effects.clockReads).toBe(readClocks);
    expect(fixture.effects.fsyncs).toBe(readSyncs);
    expect(() => statSync(fixture.lockPath())).not.toThrow();
    const appends = fixture.effects.ledgerAppends;
    const journals = fixture.effects.journalAppends;
    const clocks = fixture.effects.clockReads;
    const syncs = fixture.effects.fsyncs;
    let poisoned: unknown;
    try {
      faulty.getStageReportSnapshot('preflight', 'LOW');
    } catch (error) {
      poisoned = error;
    }
    expect(poisoned).toBeInstanceOf(CalibrationFatalError);
    expect((poisoned as Error).message).toBe('calibration:ledger-poisoned');
    expect(poisoned === failed).toBe(false);
    expect(fixture.effects.ledgerAppends).toBe(appends);
    expect(fixture.effects.journalAppends).toBe(journals);
    expect(fixture.effects.clockReads).toBe(clocks);
    expect(fixture.effects.fsyncs).toBe(syncs);
    try {
      faulty.releaseLock({ ...fixture.owner });
    } catch {
      // Best effort.
    }
  });
  it('armed fault hooks pass through natively on legacy mode when disarmed', async () => {
    const legacy = await makeAuthoritativeFixture(makeAuthoritativeOwner(83), { authoritative: false, acquire: false });
    tracked.push(legacy);
    let armed = false;
    let unarmedFdWrites = 0;
    let armedFdWrites = 0;
    let armedRenameTarget = '';
    const hooked = legacy.createLedgerWithFileStoreOverrides(
      {
        fdWriteSync: (fd, buffer, offset, length) => {
          if (!armed) {
            unarmedFdWrites += 1;
            return nativeFdWriteSync(fd, buffer, offset, length);
          }
          armedFdWrites += 1;
          throw new Error('authoritative-test-legacy-armed-fault');
        },
        renameSync: (from, to) => {
          if (typeof to === 'string' && to.endsWith('ledger.json') && armed) {
            armedRenameTarget = to;
          }
          return nativeRenameSync(from, to);
        },
      },
      legacy.reportOptions,
      undefined,
    );
    hooked.acquireLock({ ...legacy.owner });
    expect(unarmedFdWrites).toBeGreaterThan(0);
    const initialPlan = legacy.reportOptions.getReportOutcomePlan(undefined as never);
    const preflightRow = initialPlan.find((row) => row.key.stage === 'preflight' && row.key.profile === 'LOW');
    if (preflightRow === undefined) {
      throw new Error('authoritative-test-precondition: expected preflight LOW plan row');
    }
    const preflightCaseId = (preflightRow.key as unknown as { caseId: string }).caseId;
    const tokenKey = { kind: 'token_count', stage: 'preflight', caseId: preflightCaseId, model: 'gemini-3.8-flash' } as never;
    armed = true;
    let failed: unknown;
    try {
      hooked.reserveTokenCount(tokenKey);
    } catch (error) {
      failed = error;
    }
    expect(failed).toBeInstanceOf(CalibrationFatalError);
    expect((failed as Error).message.startsWith('calibration:')).toBe(true);
    expect(armedFdWrites).toBeGreaterThanOrEqual(1);
    expect(() => statSync(legacy.lockPath())).not.toThrow();
    const expectedLedgerPath = resolve(legacy.baseDir, '.nutrition-eval/calibration/calorix-gemini-38-calibration-v1/ledger.json');
    expect(existsSync(expectedLedgerPath)).toBe(true);
    expect(readFileSync(expectedLedgerPath, 'utf8').length).toBeGreaterThan(0);
    try {
      hooked.releaseLock({ ...legacy.owner });
    } catch {
      // Best effort; lock-retained assertion above is authoritative.
    }
    expect(armedRenameTarget).toBe('');
  });
});
describe('nativeTrace helper positive controls (genuine artifacts only)', () => {
  it('publish records native trace with correct stage, profile and scalar snapshot values', async () => {
    const fixture = await openFixture();
    expect(fixture.nativeTrace()).toHaveLength(0);
    expect(fixture.effects.nativeVerifierCalls).toBe(0);
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    const trace = fixture.nativeTrace();
    expect(trace).toHaveLength(1);
    const entry = trace[0];
    expect(entry).not.toBe(undefined);
    expect(entry!.stage).toBe('preflight');
    expect(entry!.profile).toBe('LOW');
    expect(entry!.imageCallsReserved).toBe(1);
    expect(entry!.imageCallsCompleted).toBe(1);
    expect(entry!.selectedProfile).toBe(undefined);
    expect(entry!.pinnedModelVersion).toBe('gemini-3.8-fixture-pin');
    expect(fixture.effects.nativeVerifierCalls).toBe(1);
  });
  it('direct nativeVerify bypasses override dispatch without recursion', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    const dispatchBefore = fixture.effects.verifierCalls;
    const nativeBefore = fixture.effects.nativeVerifierCalls;
    let overrideCalls = 0;
    fixture.setVerifierOverride(() => {
      overrideCalls += 1;
      throw new Error('authoritative-test-override-should-be-bypassed');
    });
    const snapshot = fixture.ledger.getStageReportSnapshot('preflight', 'LOW');
    const result = fixture.nativeVerify({ stage: 'preflight', profile: 'LOW', snapshot });
    expect(result.receipt.stage).toBe('preflight');
    expect(result.receipt.profile).toBe('LOW');
    expect(overrideCalls).toBe(0);
    expect(fixture.effects.verifierCalls).toBe(dispatchBefore);
    expect(fixture.effects.nativeVerifierCalls).toBe(nativeBefore + 1);
    fixture.setVerifierOverride(undefined);
  });
  it('override calling nativeVerify does not recurse through dispatch', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    const dispatchBefore = fixture.effects.verifierCalls;
    const nativeBefore = fixture.effects.nativeVerifierCalls;
    const traceBefore = fixture.nativeTrace().length;
    fixture.setVerifierOverride((params) => fixture.nativeVerify(params as never));
    try {
      await fixture.publish('preflight', 'MEDIUM');
    } finally {
      fixture.setVerifierOverride(undefined);
    }
    expect(fixture.effects.verifierCalls).toBe(dispatchBefore + 1);
    expect(fixture.effects.nativeVerifierCalls).toBe(nativeBefore + 1);
    const trace = fixture.nativeTrace();
    expect(trace.length).toBe(traceBefore + 1);
    const last = trace[trace.length - 1]!;
    expect(last.stage).toBe('preflight');
    expect(last.profile).toBe('MEDIUM');
  });
  it('returned trace is owned and stored entries capture pre-mutation scalars', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    const firstCopy = fixture.nativeTrace();
    expect(firstCopy).toHaveLength(1);
    (firstCopy as unknown as unknown[]).push({ stage: 'forged' });
    (firstCopy[0] as unknown as Record<string, unknown>)['stage'] = 'forged';
    const secondCopy = fixture.nativeTrace();
    expect(secondCopy).toHaveLength(1);
    expect(secondCopy[0]!.stage).toBe('preflight');
    const snapshot = fixture.ledger.getStageReportSnapshot('preflight', 'LOW');
    const mutableParams = {
      stage: 'preflight' as const,
      profile: 'LOW' as const,
      snapshot: JSON.parse(JSON.stringify(snapshot)) as never,
    };
    const snapshotRecord = mutableParams.snapshot as unknown as Record<string, unknown>;
    const countsValue = snapshotRecord['counts'];
    if (typeof countsValue !== 'object' || countsValue === null || Array.isArray(countsValue)) {
      throw new Error('authoritative-test-precondition: expected snapshot counts');
    }
    const countsBefore = countsValue as Record<string, unknown>;
    const reservedValue = countsBefore['imageCallsReserved'];
    if (typeof reservedValue !== 'number' || !Number.isFinite(reservedValue)) {
      throw new Error('authoritative-test-precondition: expected numeric imageCallsReserved');
    }
    const reservedBefore: number = reservedValue;
    expect(reservedBefore).toBe(1);
    fixture.nativeVerify(mutableParams as never);
    countsBefore['imageCallsReserved'] = -999;
    expect(Object.isFrozen(mutableParams)).toBe(false);
    const trace = fixture.nativeTrace();
    const last = trace[trace.length - 1]!;
    expect(last.imageCallsReserved).toBe(reservedBefore);
    expect(last.stage).toBe('preflight');
  });
});
describe('exact envelope and receipt descriptor capture', () => {
  it('accepts valid closed receipt with lowercase hashes and frozen params', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    await fixture.publish('preflight', 'MEDIUM');
    const receipt = fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    expect(receipt.stage).toBe('preflight');
    expect(receipt.profile).toBe('LOW');
    expect(Object.keys(receipt).sort()).toEqual(
      ['jsonSha256', 'markdownSha256', 'profile', 'runId', 'stage'].sort(),
    );
    expect(receipt.jsonSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.markdownSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.isFrozen(receipt)).toBe(true);
  });

  const malformedEnvelopeRows: ReadonlyArray<
    [string, (genuine: Record<string, unknown>, bump: () => void) => unknown]
  > = [
    [
      'envelope receipt getter trap never invoked',
      (genuine, bump) => {
        const malformed: Record<string, unknown> = { report: genuine['report'] };
        Object.defineProperty(malformed, 'receipt', {
          enumerable: true,
          configurable: true,
          get: () => {
            bump();
            return { ...(genuine['receipt'] as Record<string, unknown>) };
          },
        });
        return malformed;
      },
    ],
    [
      'envelope report getter trap never invoked',
      (genuine, bump) => {
        const malformed: Record<string, unknown> = {
          receipt: { ...(genuine['receipt'] as Record<string, unknown>) },
        };
        Object.defineProperty(malformed, 'report', {
          enumerable: true,
          configurable: true,
          get: () => {
            bump();
            return genuine['report'];
          },
        });
        return malformed;
      },
    ],
    [
      'envelope symbol-keyed extra own key',
      (genuine, _bump) => ({
        report: genuine['report'],
        receipt: { ...(genuine['receipt'] as Record<string, unknown>) },
        [Symbol('extra')]: 'value',
      }),
    ],
    [
      'envelope hidden nonenumerable extra own key',
      (genuine, _bump) => {
        const malformed: Record<string, unknown> = {
          report: genuine['report'],
          receipt: { ...(genuine['receipt'] as Record<string, unknown>) },
        };
        Object.defineProperty(malformed, 'hiddenExtra', {
          value: 'value',
          enumerable: false,
          configurable: true,
        });
        return malformed;
      },
    ],
    [
      'envelope foreign prototype',
      (genuine, _bump) => {
        class ForeignEnvelope {}
        return Object.assign(new ForeignEnvelope(), {
          report: genuine['report'],
          receipt: { ...(genuine['receipt'] as Record<string, unknown>) },
        });
      },
    ],
    [
      'envelope receipt present but undefined',
      (genuine, _bump) => ({
        report: genuine['report'],
        receipt: undefined,
      }),
    ],
    [
      'envelope missing report key',
      (genuine, _bump) => ({
        receipt: { ...(genuine['receipt'] as Record<string, unknown>) },
      }),
    ],
    [
      'envelope extra unexpected own key',
      (genuine, _bump) => ({
        report: genuine['report'],
        receipt: { ...(genuine['receipt'] as Record<string, unknown>) },
        unexpected: 'value',
      }),
    ],
    [
      'receipt jsonSha256 getter trap never invoked',
      (genuine, bump) => {
        const receiptSource = genuine['receipt'] as Record<string, unknown>;
        const malformedReceipt: Record<string, unknown> = {
          stage: receiptSource['stage'],
          profile: receiptSource['profile'],
          runId: receiptSource['runId'],
          markdownSha256: receiptSource['markdownSha256'],
        };
        Object.defineProperty(malformedReceipt, 'jsonSha256', {
          enumerable: true,
          configurable: true,
          get: () => {
            bump();
            return receiptSource['jsonSha256'];
          },
        });
        return { report: genuine['report'], receipt: malformedReceipt };
      },
    ],
    ...(['stage', 'profile', 'runId', 'markdownSha256'] as const).map(
      (field) =>
        [
          `receipt ${field} getter trap never invoked`,
          (genuine: Record<string, unknown>, bump: () => void) => {
            const receiptSource = genuine['receipt'] as Record<string, unknown>;
            const malformedReceipt: Record<string, unknown> = {};
            for (const key of ['stage', 'profile', 'runId', 'jsonSha256', 'markdownSha256'] as const) {
              if (key === field) continue;
              malformedReceipt[key] = receiptSource[key];
            }
            Object.defineProperty(malformedReceipt, field, {
              enumerable: true,
              configurable: true,
              get: () => {
                bump();
                return receiptSource[field];
              },
            });
            return { report: genuine['report'], receipt: malformedReceipt };
          },
        ] as [string, (genuine: Record<string, unknown>, bump: () => void) => unknown],
    ),
    [
      'receipt symbol-keyed extra own key',
      (genuine, _bump) => ({
        report: genuine['report'],
        receipt: Object.assign(
          { ...(genuine['receipt'] as Record<string, unknown>) },
          { [Symbol('extra')]: 'value' },
        ),
      }),
    ],
    [
      'receipt hidden nonenumerable extra own key',
      (genuine, _bump) => {
        const receipt: Record<string, unknown> = { ...(genuine['receipt'] as Record<string, unknown>) };
        Object.defineProperty(receipt, 'hiddenExtra', {
          value: 'value',
          enumerable: false,
          configurable: true,
        });
        return { report: genuine['report'], receipt };
      },
    ],
    [
      'receipt foreign prototype',
      (genuine, _bump) => {
        class ForeignReceipt {}
        return {
          report: genuine['report'],
          receipt: Object.assign(new ForeignReceipt(), { ...(genuine['receipt'] as Record<string, unknown>) }),
        };
      },
    ],
    [
      'receipt markdownSha256 present but undefined',
      (genuine, _bump) => ({
        report: genuine['report'],
        receipt: { ...(genuine['receipt'] as Record<string, unknown>), markdownSha256: undefined },
      }),
    ],
    [
      'receipt missing runId key',
      (genuine, _bump) => {
        const receipt: Record<string, unknown> = { ...(genuine['receipt'] as Record<string, unknown>) };
        delete receipt['runId'];
        return { report: genuine['report'], receipt };
      },
    ],
    [
      'receipt extra unexpected own key',
      (genuine, _bump) => ({
        report: genuine['report'],
        receipt: { ...(genuine['receipt'] as Record<string, unknown>), unexpected: 'value' },
      }),
    ],
    [
      'receipt stage mismatched from requested stage',
      (genuine, _bump) => ({
        report: genuine['report'],
        receipt: { ...(genuine['receipt'] as Record<string, unknown>), stage: 'development' },
      }),
    ],
    [
      'receipt profile mismatched from requested profile',
      (genuine, _bump) => ({
        report: genuine['report'],
        receipt: { ...(genuine['receipt'] as Record<string, unknown>), profile: 'MEDIUM' },
      }),
    ],
    [
      'receipt runId blank',
      (genuine, _bump) => ({
        report: genuine['report'],
        receipt: { ...(genuine['receipt'] as Record<string, unknown>), runId: '' },
      }),
    ],
    [
      'receipt runId noncanonical format',
      (genuine, _bump) => ({
        report: genuine['report'],
        receipt: { ...(genuine['receipt'] as Record<string, unknown>), runId: 'not-a-canonical-run-id' },
      }),
    ],
    [
      'receipt jsonSha256 uppercase hex',
      (genuine, _bump) => {
        const receiptSource = genuine['receipt'] as Record<string, unknown>;
        const original = receiptSource['jsonSha256'] as string;
        const upper = original.toUpperCase();
        if (upper === original || !/[A-F]/.test(upper)) {
          throw new Error('authoritative-test-precondition: expected genuine hash to contain a-f hex letters');
        }
        return {
          report: genuine['report'],
          receipt: { ...receiptSource, jsonSha256: upper },
        };
      },
    ],
    [
      'receipt jsonSha256 wrong length',
      (genuine, _bump) => {
        const receiptSource = genuine['receipt'] as Record<string, unknown>;
        return {
          report: genuine['report'],
          receipt: {
            ...receiptSource,
            jsonSha256: (receiptSource['jsonSha256'] as string).slice(0, 63),
          },
        };
      },
    ],
    [
      'receipt jsonSha256 non-hex character',
      (genuine, _bump) => {
        const receiptSource = genuine['receipt'] as Record<string, unknown>;
        return {
          report: genuine['report'],
          receipt: {
            ...receiptSource,
            jsonSha256: `g${(receiptSource['jsonSha256'] as string).slice(1)}`,
          },
        };
      },
    ],
    [
      'receipt markdownSha256 uppercase hex',
      (genuine, _bump) => {
        const receiptSource = genuine['receipt'] as Record<string, unknown>;
        const original = receiptSource['markdownSha256'] as string;
        const upper = original.toUpperCase();
        if (upper === original || !/[A-F]/.test(upper)) {
          throw new Error('authoritative-test-precondition: expected genuine hash to contain a-f hex letters');
        }
        return {
          report: genuine['report'],
          receipt: { ...receiptSource, markdownSha256: upper },
        };
      },
    ],
  ];

  it.each(malformedEnvelopeRows)(
    '%s is rejected with zero effects then poisons the ledger',
    async (_label, mutate) => {
      const fixture = await openFixture();
      await fixture.finishPreflight();
      await fixture.publish('preflight', 'LOW');
      await fixture.publish('preflight', 'MEDIUM');
      const snapshot = fixture.ledger.getStageReportSnapshot('preflight', 'LOW');
      const genuine = fixture.nativeVerify({
        stage: 'preflight',
        profile: 'LOW',
        snapshot,
      }) as unknown as Record<string, unknown>;
      let probeCalls = 0;
      const malformed = mutate(genuine, () => {
        probeCalls += 1;
      });
      fixture.setVerifierOverride(() => malformed as never);
      const appendsBefore = fixture.effects.ledgerAppends;
      const journalBefore = fixture.effects.journalAppends;
      const fsyncsBefore = fixture.effects.fsyncs;
      const clocksBefore = fixture.effects.clockReads;
      let caught: unknown;
      try {
        fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(CalibrationFatalError);
      expect((caught as Error).message).toBe('calibration:artifact-verification-failed');
      expect(asRecord(caught).cause).toBeUndefined();
      expect(probeCalls).toBe(0);
      expect(fixture.effects.ledgerAppends).toBe(appendsBefore);
      expect(fixture.effects.journalAppends).toBe(journalBefore);
      expect(fixture.effects.fsyncs).toBe(fsyncsBefore);
      expect(fixture.effects.clockReads).toBe(clocksBefore);
      expect(() => statSync(fixture.lockPath())).not.toThrow();
      let second: unknown;
      try {
        fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
      } catch (error) {
        second = error;
      }
      expect(second).toBeInstanceOf(CalibrationFatalError);
      expect((second as Error).message).toBe('calibration:ledger-poisoned');
      expect(asRecord(second).cause).toBeUndefined();
      expect(second === caught).toBe(false);
      expect(fixture.effects.ledgerAppends).toBe(appendsBefore);
      expect(fixture.effects.journalAppends).toBe(journalBefore);
      expect(fixture.effects.fsyncs).toBe(fsyncsBefore);
      expect(fixture.effects.clockReads).toBe(clocksBefore);
      fixture.setVerifierOverride(undefined);
    },
  );

  it('rejects receipt runId bound to a different profile than requested', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    await fixture.publish('preflight', 'MEDIUM');
    const lowSnapshot = fixture.ledger.getStageReportSnapshot('preflight', 'LOW');
    const mediumSnapshot = fixture.ledger.getStageReportSnapshot('preflight', 'MEDIUM');
    const genuineLow = fixture.nativeVerify({ stage: 'preflight', profile: 'LOW', snapshot: lowSnapshot });
    const genuineMedium = fixture.nativeVerify({
      stage: 'preflight',
      profile: 'MEDIUM',
      snapshot: mediumSnapshot,
    });
    expect(genuineMedium.receipt.runId).not.toBe(genuineLow.receipt.runId);
    fixture.setVerifierOverride(
      () =>
        ({
          report: genuineLow.report,
          receipt: { ...genuineLow.receipt, runId: genuineMedium.receipt.runId },
        }) as never,
    );
    const appendsBefore = fixture.effects.ledgerAppends;
    const journalBefore = fixture.effects.journalAppends;
    const fsyncsBefore = fixture.effects.fsyncs;
    const clocksBefore = fixture.effects.clockReads;
    let caught: unknown;
    try {
      fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect((caught as Error).message).toBe('calibration:artifact-verification-failed');
    expect(asRecord(caught).cause).toBeUndefined();
    expect(fixture.effects.ledgerAppends).toBe(appendsBefore);
    expect(fixture.effects.journalAppends).toBe(journalBefore);
    expect(fixture.effects.fsyncs).toBe(fsyncsBefore);
    expect(fixture.effects.clockReads).toBe(clocksBefore);
    expect(() => statSync(fixture.lockPath())).not.toThrow();
    let second: unknown;
    try {
      fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    } catch (error) {
      second = error;
    }
    fixture.setVerifierOverride(undefined);
    expect(second).toBeInstanceOf(CalibrationFatalError);
    expect((second as Error).message).toBe('calibration:ledger-poisoned');
    expect(asRecord(second).cause).toBeUndefined();
    expect(fixture.effects.ledgerAppends).toBe(appendsBefore);
    expect(fixture.effects.journalAppends).toBe(journalBefore);
    expect(fixture.effects.fsyncs).toBe(fsyncsBefore);
    expect(fixture.effects.clockReads).toBe(clocksBefore);
  });
});

function flipHexHash(hash: string): string {
  return `${hash[0] === '0' ? '1' : '0'}${hash.slice(1)}`;
}

function ledgerJsonPath(fixture: AuthoritativeFixture): string {
  return resolve(dirname(fixture.lockPath()), 'ledger.json');
}
function journalJsonPath(fixture: AuthoritativeFixture): string {
  return resolve(dirname(fixture.lockPath()), 'journal.json');
}
function readLedgerArray(fixture: AuthoritativeFixture): unknown[] {
  return JSON.parse(readFileSync(ledgerJsonPath(fixture), 'utf8')) as unknown[];
}
function writeLedgerArray(fixture: AuthoritativeFixture, events: readonly unknown[]): void {
  writeFileSync(ledgerJsonPath(fixture), JSON.stringify(events));
}
function moveEventBefore(events: readonly unknown[], movingIndex: number, beforeIndex: number): unknown[] {
  const moving = events[movingIndex];
  const without = events.filter((_event, idx) => idx !== movingIndex);
  const adjustedBefore = movingIndex < beforeIndex ? beforeIndex - 1 : beforeIndex;
  return [...without.slice(0, adjustedBefore), moving, ...without.slice(adjustedBefore)];
}

describe('report-binding discrimination against the admitted stage/profile', () => {
  const bindingMismatchRows: ReadonlyArray<
    [string, (report: Record<string, unknown>) => Record<string, unknown>]
  > = [
    [
      'schemaHash differs from the actual pinned response schema identity',
      (report) => ({
        ...report,
        calibration: {
          ...(report['calibration'] as Record<string, unknown>),
          schemaHash: flipHexHash((report['calibration'] as Record<string, unknown>)['schemaHash'] as string),
        },
      }),
    ],
    [
      'promptHash differs from the actual pinned prompt identity',
      (report) => ({
        ...report,
        promptHash: flipHexHash(report['promptHash'] as string),
      }),
    ],
    [
      'codeSha differs from the actual implementation commit identity (still 40 lowercase hex)',
      (report) => ({
        ...report,
        codeSha: flipHexHash(report['codeSha'] as string),
      }),
    ],
    [
      'population swaps public/private coverage while preserving the total',
      (report) => ({
        ...report,
        publicCases: 0,
        privateCases: report['publicCases'] as number,
      }),
    ],
    [
      'calibration.thinkingLevel disagrees with the admitted profile',
      (report) => ({
        ...report,
        calibration: {
          ...(report['calibration'] as Record<string, unknown>),
          thinkingLevel: 'MEDIUM',
        },
      }),
    ],
    [
      'calibration.stage disagrees with the admitted stage',
      (report) => ({
        ...report,
        calibration: {
          ...(report['calibration'] as Record<string, unknown>),
          stage: 'development',
        },
      }),
    ],
  ];

  it.each(bindingMismatchRows)(
    '%s: pure measurement succeeds, admission still rejects with zero effects then poisons',
    async (_label, mutateReport) => {
      const fixture = await openFixture();
      await fixture.finishPreflight();
      await fixture.publish('preflight', 'LOW');
      await fixture.publish('preflight', 'MEDIUM');
      const snapshot = fixture.ledger.getStageReportSnapshot('preflight', 'LOW');
      const genuine = fixture.nativeVerify({ stage: 'preflight', profile: 'LOW', snapshot });
      const mutatedReport = mutateReport(genuine.report as unknown as Record<string, unknown>);
      expect(() => measureCalibrationStageReport(mutatedReport)).not.toThrow();
      fixture.setVerifierOverride(() => ({ report: mutatedReport, receipt: genuine.receipt }) as never);
      const appendsBefore = fixture.effects.ledgerAppends;
      const journalBefore = fixture.effects.journalAppends;
      const fsyncsBefore = fixture.effects.fsyncs;
      const clocksBefore = fixture.effects.clockReads;
      let caught: unknown;
      try {
        fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(CalibrationFatalError);
      expect((caught as Error).message).toBe('calibration:artifact-verification-failed');
      expect(asRecord(caught).cause).toBeUndefined();
      expect(fixture.effects.ledgerAppends).toBe(appendsBefore);
      expect(fixture.effects.journalAppends).toBe(journalBefore);
      expect(fixture.effects.fsyncs).toBe(fsyncsBefore);
      expect(fixture.effects.clockReads).toBe(clocksBefore);
      expect(() => statSync(fixture.lockPath())).not.toThrow();
      let second: unknown;
      try {
        fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
      } catch (error) {
        second = error;
      }
      fixture.setVerifierOverride(undefined);
      expect(second).toBeInstanceOf(CalibrationFatalError);
      expect((second as Error).message).toBe('calibration:ledger-poisoned');
      expect(asRecord(second).cause).toBeUndefined();
      expect(fixture.effects.ledgerAppends).toBe(appendsBefore);
      expect(fixture.effects.journalAppends).toBe(journalBefore);
      expect(fixture.effects.fsyncs).toBe(fsyncsBefore);
      expect(fixture.effects.clockReads).toBe(clocksBefore);
    },
  );

  it('ledger-runId binding fails even when report and receipt runId mutually agree on a different syntactically valid ID', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    await fixture.publish('preflight', 'MEDIUM');
    const snapshot = fixture.ledger.getStageReportSnapshot('preflight', 'LOW');
    const genuine = fixture.nativeVerify({ stage: 'preflight', profile: 'LOW', snapshot });
    const parts = genuine.receipt.runId.split('-');
    parts[3] = flipHexHash(parts[3]!);
    const differentRunId = parts.join('-');
    expect(differentRunId).not.toBe(genuine.receipt.runId);
    const mutatedReport = { ...(genuine.report as unknown as Record<string, unknown>), runId: differentRunId };
    expect(() => measureCalibrationStageReport(mutatedReport)).not.toThrow();
    fixture.setVerifierOverride(
      () => ({ report: mutatedReport, receipt: { ...genuine.receipt, runId: differentRunId } }) as never,
    );
    const appendsBefore = fixture.effects.ledgerAppends;
    const journalBefore = fixture.effects.journalAppends;
    const fsyncsBefore = fixture.effects.fsyncs;
    const clocksBefore = fixture.effects.clockReads;
    let caught: unknown;
    try {
      fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect((caught as Error).message).toBe('calibration:artifact-verification-failed');
    expect(asRecord(caught).cause).toBeUndefined();
    expect(fixture.effects.ledgerAppends).toBe(appendsBefore);
    expect(fixture.effects.journalAppends).toBe(journalBefore);
    expect(fixture.effects.fsyncs).toBe(fsyncsBefore);
    expect(fixture.effects.clockReads).toBe(clocksBefore);
    expect(() => statSync(fixture.lockPath())).not.toThrow();
    let second: unknown;
    try {
      fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    } catch (error) {
      second = error;
    }
    fixture.setVerifierOverride(undefined);
    expect(second).toBeInstanceOf(CalibrationFatalError);
    expect((second as Error).message).toBe('calibration:ledger-poisoned');
    expect(asRecord(second).cause).toBeUndefined();
    expect(fixture.effects.ledgerAppends).toBe(appendsBefore);
    expect(fixture.effects.journalAppends).toBe(journalBefore);
    expect(fixture.effects.fsyncs).toBe(fsyncsBefore);
    expect(fixture.effects.clockReads).toBe(clocksBefore);
  });

  const captureRejectionRows: ReadonlyArray<
    [string, (report: Record<string, unknown>) => Record<string, unknown>]
  > = [
    [
      'calibration.project mismatch fails pure capture (schema-enforced identity), not binding',
      (report) => ({
        ...report,
        calibration: { ...(report['calibration'] as Record<string, unknown>), project: 'not-calorix-xurschnell' },
      }),
    ],
    [
      'calibration.location mismatch fails pure capture (schema-enforced identity), not binding',
      (report) => ({
        ...report,
        calibration: { ...(report['calibration'] as Record<string, unknown>), location: 'eu' },
      }),
    ],
    [
      'calibration.model-only mismatch fails pure capture (schema-enforced identity), not binding',
      (report) => ({
        ...report,
        calibration: { ...(report['calibration'] as Record<string, unknown>), model: 'gemini-9-fake' },
      }),
    ],
    [
      'adapterModelId-only mismatch fails pure capture (must equal calibration.model), not binding',
      (report) => ({
        ...report,
        adapterModelId: 'gemini-9-fake',
      }),
    ],
  ];

  it.each(captureRejectionRows)(
    '%s: pure measurement throws, admission still rejects with zero effects then poisons',
    async (_label, mutateReport) => {
      const fixture = await openFixture();
      await fixture.finishPreflight();
      await fixture.publish('preflight', 'LOW');
      await fixture.publish('preflight', 'MEDIUM');
      const snapshot = fixture.ledger.getStageReportSnapshot('preflight', 'LOW');
      const genuine = fixture.nativeVerify({ stage: 'preflight', profile: 'LOW', snapshot });
      const mutatedReport = mutateReport(genuine.report as unknown as Record<string, unknown>);
      expect(() => measureCalibrationStageReport(mutatedReport)).toThrow(CalibrationFatalError);
      fixture.setVerifierOverride(() => ({ report: mutatedReport, receipt: genuine.receipt }) as never);
      const appendsBefore = fixture.effects.ledgerAppends;
      const journalBefore = fixture.effects.journalAppends;
      const fsyncsBefore = fixture.effects.fsyncs;
      const clocksBefore = fixture.effects.clockReads;
      let caught: unknown;
      try {
        fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(CalibrationFatalError);
      expect((caught as Error).message).toBe('calibration:artifact-verification-failed');
      expect(asRecord(caught).cause).toBeUndefined();
      expect(fixture.effects.ledgerAppends).toBe(appendsBefore);
      expect(fixture.effects.journalAppends).toBe(journalBefore);
      expect(fixture.effects.fsyncs).toBe(fsyncsBefore);
      expect(fixture.effects.clockReads).toBe(clocksBefore);
      expect(() => statSync(fixture.lockPath())).not.toThrow();
      let second: unknown;
      try {
        fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
      } catch (error) {
        second = error;
      }
      fixture.setVerifierOverride(undefined);
      expect(second).toBeInstanceOf(CalibrationFatalError);
      expect((second as Error).message).toBe('calibration:ledger-poisoned');
      expect(asRecord(second).cause).toBeUndefined();
      expect(fixture.effects.ledgerAppends).toBe(appendsBefore);
      expect(fixture.effects.journalAppends).toBe(journalBefore);
      expect(fixture.effects.fsyncs).toBe(fsyncsBefore);
      expect(fixture.effects.clockReads).toBe(clocksBefore);
    },
  );
});

describe('capture-phase reentry safety (one trap, one real public target, per row)', () => {
  it('ownKeys trap reentering recoverAfterCrash fails closed without corrupting the outer admission', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    await fixture.publish('preflight', 'MEDIUM');
    let trapInvocations = 0;
    let guardFired = false;
    let nestedCaught: unknown;
    fixture.setVerifierOverride((params) => {
      const real = fixture.nativeVerify(params as never) as unknown as Record<string, unknown>;
      const ownedCopy: Record<string, unknown> = {
        report: real['report'],
        receipt: { ...(real['receipt'] as Record<string, unknown>) },
      };
      return new Proxy(ownedCopy, {
        ownKeys(target) {
          trapInvocations += 1;
          if (!guardFired) {
            guardFired = true;
            try {
              fixture.ledger.recoverAfterCrash();
            } catch (error) {
              nestedCaught = error;
            }
          }
          return Reflect.ownKeys(target);
        },
      }) as never;
    });
    const appendsBefore = fixture.effects.ledgerAppends;
    const journalBefore = fixture.effects.journalAppends;
    const fsyncsBefore = fixture.effects.fsyncs;
    const clocksBefore = fixture.effects.clockReads;
    let caught: unknown;
    try {
      fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    } catch (error) {
      caught = error;
    }
    expect(trapInvocations).toBeGreaterThan(0);
    expect(nestedCaught).toBeInstanceOf(CalibrationFatalError);
    expect((nestedCaught as Error).message).toBe('calibration:reentrant-call');
    expect(asRecord(nestedCaught).cause).toBeUndefined();
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect((caught as Error).message).toBe('calibration:artifact-verification-failed');
    expect(asRecord(caught).cause).toBeUndefined();
    expect(caught === nestedCaught).toBe(false);
    expect(fixture.effects.ledgerAppends).toBe(appendsBefore);
    expect(fixture.effects.journalAppends).toBe(journalBefore);
    expect(fixture.effects.fsyncs).toBe(fsyncsBefore);
    expect(fixture.effects.clockReads).toBe(clocksBefore);
    expect(() => statSync(fixture.lockPath())).not.toThrow();
    let second: unknown;
    try {
      fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    } catch (error) {
      second = error;
    }
    fixture.setVerifierOverride(undefined);
    expect(second).toBeInstanceOf(CalibrationFatalError);
    expect((second as Error).message).toBe('calibration:ledger-poisoned');
    expect(asRecord(second).cause).toBeUndefined();
    expect(fixture.effects.ledgerAppends).toBe(appendsBefore);
    expect(fixture.effects.journalAppends).toBe(journalBefore);
    expect(fixture.effects.fsyncs).toBe(fsyncsBefore);
    expect(fixture.effects.clockReads).toBe(clocksBefore);
  });

  it('ownKeys trap reentering getCounts (a genuine public read) fails closed without corrupting the outer admission', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    await fixture.publish('preflight', 'MEDIUM');
    let trapInvocations = 0;
    let guardFired = false;
    let nestedCaught: unknown;
    fixture.setVerifierOverride((params) => {
      const real = fixture.nativeVerify(params as never) as unknown as Record<string, unknown>;
      const ownedCopy: Record<string, unknown> = {
        report: real['report'],
        receipt: { ...(real['receipt'] as Record<string, unknown>) },
      };
      return new Proxy(ownedCopy, {
        ownKeys(target) {
          trapInvocations += 1;
          if (!guardFired) {
            guardFired = true;
            try {
              fixture.ledger.getCounts();
            } catch (error) {
              nestedCaught = error;
            }
          }
          return Reflect.ownKeys(target);
        },
      }) as never;
    });
    const appendsBefore = fixture.effects.ledgerAppends;
    const journalBefore = fixture.effects.journalAppends;
    const fsyncsBefore = fixture.effects.fsyncs;
    const clocksBefore = fixture.effects.clockReads;
    let caught: unknown;
    try {
      fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    } catch (error) {
      caught = error;
    }
    expect(trapInvocations).toBeGreaterThan(0);
    expect(nestedCaught).toBeInstanceOf(CalibrationFatalError);
    expect((nestedCaught as Error).message).toBe('calibration:reentrant-call');
    expect(asRecord(nestedCaught).cause).toBeUndefined();
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect((caught as Error).message).toBe('calibration:artifact-verification-failed');
    expect(asRecord(caught).cause).toBeUndefined();
    expect(caught === nestedCaught).toBe(false);
    expect(fixture.effects.ledgerAppends).toBe(appendsBefore);
    expect(fixture.effects.journalAppends).toBe(journalBefore);
    expect(fixture.effects.fsyncs).toBe(fsyncsBefore);
    expect(fixture.effects.clockReads).toBe(clocksBefore);
    expect(() => statSync(fixture.lockPath())).not.toThrow();
    let second: unknown;
    try {
      fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    } catch (error) {
      second = error;
    }
    fixture.setVerifierOverride(undefined);
    expect(second).toBeInstanceOf(CalibrationFatalError);
    expect((second as Error).message).toBe('calibration:ledger-poisoned');
    expect(asRecord(second).cause).toBeUndefined();
    expect(fixture.effects.ledgerAppends).toBe(appendsBefore);
    expect(fixture.effects.journalAppends).toBe(journalBefore);
    expect(fixture.effects.fsyncs).toBe(fsyncsBefore);
    expect(fixture.effects.clockReads).toBe(clocksBefore);
  });

  it('getOwnPropertyDescriptor trap reentering releaseLock fails closed without corrupting the outer admission', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    await fixture.publish('preflight', 'MEDIUM');
    const ownerClone = { ...fixture.owner };
    let trapInvocations = 0;
    let guardFired = false;
    let nestedCaught: unknown;
    fixture.setVerifierOverride((params) => {
      const real = fixture.nativeVerify(params as never) as unknown as Record<string, unknown>;
      const ownedCopy: Record<string, unknown> = {
        report: real['report'],
        receipt: { ...(real['receipt'] as Record<string, unknown>) },
      };
      return new Proxy(ownedCopy, {
        getOwnPropertyDescriptor(target, key) {
          trapInvocations += 1;
          if (!guardFired) {
            guardFired = true;
            try {
              fixture.ledger.releaseLock({ ...ownerClone });
            } catch (error) {
              nestedCaught = error;
            }
          }
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      }) as never;
    });
    const appendsBefore = fixture.effects.ledgerAppends;
    const journalBefore = fixture.effects.journalAppends;
    const fsyncsBefore = fixture.effects.fsyncs;
    const clocksBefore = fixture.effects.clockReads;
    let caught: unknown;
    try {
      fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    } catch (error) {
      caught = error;
    }
    expect(trapInvocations).toBeGreaterThan(0);
    expect(nestedCaught).toBeInstanceOf(CalibrationFatalError);
    expect((nestedCaught as Error).message).toBe('calibration:reentrant-call');
    expect(asRecord(nestedCaught).cause).toBeUndefined();
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect((caught as Error).message).toBe('calibration:artifact-verification-failed');
    expect(asRecord(caught).cause).toBeUndefined();
    expect(caught === nestedCaught).toBe(false);
    expect(fixture.effects.ledgerAppends).toBe(appendsBefore);
    expect(fixture.effects.journalAppends).toBe(journalBefore);
    expect(fixture.effects.fsyncs).toBe(fsyncsBefore);
    expect(fixture.effects.clockReads).toBe(clocksBefore);
    expect(() => statSync(fixture.lockPath())).not.toThrow();
    let second: unknown;
    try {
      fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    } catch (error) {
      second = error;
    }
    fixture.setVerifierOverride(undefined);
    expect(second).toBeInstanceOf(CalibrationFatalError);
    expect((second as Error).message).toBe('calibration:ledger-poisoned');
    expect(asRecord(second).cause).toBeUndefined();
    expect(fixture.effects.ledgerAppends).toBe(appendsBefore);
    expect(fixture.effects.journalAppends).toBe(journalBefore);
    expect(fixture.effects.fsyncs).toBe(fsyncsBefore);
    expect(fixture.effects.clockReads).toBe(clocksBefore);
  });

  it('getPrototypeOf trap reentering admitStageReportReceipt fails closed without corrupting the outer admission', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    await fixture.publish('preflight', 'MEDIUM');
    const stageArg = 'preflight' as const;
    const profileArg = 'LOW' as const;
    let trapInvocations = 0;
    let guardFired = false;
    let nestedCaught: unknown;
    fixture.setVerifierOverride((params) => {
      const real = fixture.nativeVerify(params as never) as unknown as Record<string, unknown>;
      const ownedCopy: Record<string, unknown> = {
        report: real['report'],
        receipt: { ...(real['receipt'] as Record<string, unknown>) },
      };
      return new Proxy(ownedCopy, {
        getPrototypeOf(target) {
          trapInvocations += 1;
          if (!guardFired) {
            guardFired = true;
            try {
              fixture.ledger.admitStageReportReceipt(stageArg, profileArg);
            } catch (error) {
              nestedCaught = error;
            }
          }
          return Reflect.getPrototypeOf(target);
        },
      }) as never;
    });
    const appendsBefore = fixture.effects.ledgerAppends;
    const journalBefore = fixture.effects.journalAppends;
    const fsyncsBefore = fixture.effects.fsyncs;
    const clocksBefore = fixture.effects.clockReads;
    let caught: unknown;
    try {
      fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    } catch (error) {
      caught = error;
    }
    expect(trapInvocations).toBeGreaterThan(0);
    expect(nestedCaught).toBeInstanceOf(CalibrationFatalError);
    expect((nestedCaught as Error).message).toBe('calibration:reentrant-call');
    expect(asRecord(nestedCaught).cause).toBeUndefined();
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect((caught as Error).message).toBe('calibration:artifact-verification-failed');
    expect(asRecord(caught).cause).toBeUndefined();
    expect(caught === nestedCaught).toBe(false);
    expect(fixture.effects.ledgerAppends).toBe(appendsBefore);
    expect(fixture.effects.journalAppends).toBe(journalBefore);
    expect(fixture.effects.fsyncs).toBe(fsyncsBefore);
    expect(fixture.effects.clockReads).toBe(clocksBefore);
    expect(() => statSync(fixture.lockPath())).not.toThrow();
    let second: unknown;
    try {
      fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    } catch (error) {
      second = error;
    }
    fixture.setVerifierOverride(undefined);
    expect(second).toBeInstanceOf(CalibrationFatalError);
    expect((second as Error).message).toBe('calibration:ledger-poisoned');
    expect(asRecord(second).cause).toBeUndefined();
    expect(fixture.effects.ledgerAppends).toBe(appendsBefore);
    expect(fixture.effects.journalAppends).toBe(journalBefore);
    expect(fixture.effects.fsyncs).toBe(fsyncsBefore);
    expect(fixture.effects.clockReads).toBe(clocksBefore);
  });
});

describe('receipt-event replay shape and chronology faults (constructor-phase, in-place replacement)', () => {
  const receiptShapeRows: ReadonlyArray<
    [string, (event: Record<string, unknown>) => Record<string, unknown>, string]
  > = [
    [
      'outer extra unexpected own key',
      (event) => ({ ...event, unexpected: 'value' }),
      'calibration:ledger-event-malformed:artifact_receipt_admitted',
    ],
    [
      'outer missing at key',
      (event) => {
        const next = { ...event };
        delete next['at'];
        return next;
      },
      'calibration:ledger-event-malformed:artifact_receipt_admitted',
    ],
    [
      'outer at is not a canonical timestamp',
      (event) => ({ ...event, at: 'not-a-timestamp' }),
      'calibration:ledger-event-malformed:artifact_receipt_admitted',
    ],
    [
      'outer type is unrecognized (falls back to the generic unknown-type contract)',
      (event) => ({ ...event, type: 'artifact_receipt_admitted_v2' }),
      'calibration:ledger-event-unknown-type',
    ],
    [
      'nested receipt extra unexpected own key',
      (event) => ({
        ...event,
        receipt: { ...(event['receipt'] as Record<string, unknown>), unexpected: 'value' },
      }),
      'calibration:ledger-event-malformed:artifact_receipt_admitted',
    ],
    [
      'nested receipt missing stage key',
      (event) => {
        const receipt: Record<string, unknown> = { ...(event['receipt'] as Record<string, unknown>) };
        delete receipt['stage'];
        return { ...event, receipt };
      },
      'calibration:ledger-event-malformed:artifact_receipt_admitted',
    ],
    [
      'nested receipt stage is invalid',
      (event) => ({
        ...event,
        receipt: { ...(event['receipt'] as Record<string, unknown>), stage: 'not-a-stage' },
      }),
      'calibration:ledger-event-malformed:artifact_receipt_admitted',
    ],
    [
      'nested receipt profile is invalid',
      (event) => ({
        ...event,
        receipt: { ...(event['receipt'] as Record<string, unknown>), profile: 'HIGH' },
      }),
      'calibration:ledger-event-malformed:artifact_receipt_admitted',
    ],
    [
      'nested receipt runId is blank',
      (event) => ({
        ...event,
        receipt: { ...(event['receipt'] as Record<string, unknown>), runId: '' },
      }),
      'calibration:ledger-event-malformed:artifact_receipt_admitted',
    ],
    [
      'nested receipt jsonSha256 is not 64 hex characters',
      (event) => ({
        ...event,
        receipt: { ...(event['receipt'] as Record<string, unknown>), jsonSha256: 'short' },
      }),
      'calibration:ledger-event-malformed:artifact_receipt_admitted',
    ],
  ];

  it.each(receiptShapeRows)(
    '%s on the replaced sole receipt event fails closed at construction',
    async (_label, corrupt, expectedMessage) => {
      const fixture = await openFixture();
      await fixture.finishPreflight();
      await fixture.publish('preflight', 'LOW');
      fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
      const before = readLedgerArray(fixture);
      const index = before.findIndex(
        (event) =>
          typeof event === 'object' &&
          event !== null &&
          (event as Record<string, unknown>)['type'] === 'artifact_receipt_admitted',
      );
      expect(index).toBeGreaterThan(-1);
      const original = before[index] as Record<string, unknown>;
      const corrupted = corrupt(JSON.parse(JSON.stringify(original)) as Record<string, unknown>);
      const replaced = [...before];
      replaced[index] = corrupted;
      expect(replaced.length).toBe(before.length);
      for (let otherIndex = 0; otherIndex < before.length; otherIndex += 1) {
        if (otherIndex === index) continue;
        expect(JSON.stringify(replaced[otherIndex])).toBe(JSON.stringify(before[otherIndex]));
      }
      writeLedgerArray(fixture, replaced);
      const verifierBefore = fixture.effects.verifierCalls;
      const nativeBefore = fixture.effects.nativeVerifierCalls;
      const appendsBefore = fixture.effects.ledgerAppends;
      const journalBefore = fixture.effects.journalAppends;
      const fsyncsBefore = fixture.effects.fsyncs;
      const clocksBefore = fixture.effects.clockReads;
      let caught: unknown;
      try {
        fixture.createLedger(fixture.reportOptions, fixture.verifierOptions);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(CalibrationFatalError);
      expect((caught as Error).message).toBe(expectedMessage);
      expect(asRecord(caught).cause).toBeUndefined();
      expect(fixture.effects.verifierCalls).toBe(verifierBefore);
      expect(fixture.effects.nativeVerifierCalls).toBe(nativeBefore);
      expect(fixture.effects.ledgerAppends).toBe(appendsBefore);
      expect(fixture.effects.journalAppends).toBe(journalBefore);
      expect(fixture.effects.fsyncs).toBe(fsyncsBefore);
      expect(fixture.effects.clockReads).toBe(clocksBefore);
    },
  );

  it('a receipt event moved right after the header, before its own required completed outcomes, is out-of-order at construction', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    const before = readLedgerArray(fixture);
    const receiptIndex = before.findIndex(
      (event) => typeof event === 'object' && event !== null && (event as Record<string, unknown>)['type'] === 'artifact_receipt_admitted',
    );
    expect(receiptIndex).toBeGreaterThan(0);
    const moved = moveEventBefore(before, receiptIndex, 1);
    expect(moved.length).toBe(before.length);
    writeLedgerArray(fixture, moved);
    const verifierBefore = fixture.effects.verifierCalls;
    const nativeBefore = fixture.effects.nativeVerifierCalls;
    const appendsBefore = fixture.effects.ledgerAppends;
    const journalBefore = fixture.effects.journalAppends;
    const fsyncsBefore = fixture.effects.fsyncs;
    const clocksBefore = fixture.effects.clockReads;
    let caught: unknown;
    try {
      fixture.createLedger(fixture.reportOptions, fixture.verifierOptions);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect((caught as Error).message).toBe('calibration:ledger-event-out-of-order:artifact_receipt_admitted');
    expect(asRecord(caught).cause).toBeUndefined();
    expect(fixture.effects.verifierCalls).toBe(verifierBefore);
    expect(fixture.effects.nativeVerifierCalls).toBe(nativeBefore);
    expect(fixture.effects.ledgerAppends).toBe(appendsBefore);
    expect(fixture.effects.journalAppends).toBe(journalBefore);
    expect(fixture.effects.fsyncs).toBe(fsyncsBefore);
    expect(fixture.effects.clockReads).toBe(clocksBefore);
  });

  it('profile_selected moved before its development receipts is out-of-order at construction (receipt dependency isolated)', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    await fixture.publish('preflight', 'MEDIUM');
    fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    fixture.ledger.admitStageReportReceipt('preflight', 'MEDIUM');
    fixture.ledger.completeStage('preflight', { stage: 'preflight', passed: true, completedStages: [] });
    await fixture.finishDevelopment('LOW', 'exact');
    await fixture.finishDevelopment('MEDIUM', 'exact');
    await fixture.publish('development', 'LOW');
    await fixture.publish('development', 'MEDIUM');
    fixture.ledger.admitStageReportReceipt('development', 'LOW');
    fixture.ledger.admitStageReportReceipt('development', 'MEDIUM');
    fixture.ledger.recordProfileSelection('MEDIUM', 'default_medium_tie_breaker', {
      stage: 'development',
      passed: true,
      completedStages: ['preflight'],
    });
    const before = readLedgerArray(fixture);
    const selectionIndex = before.findIndex(
      (event) => typeof event === 'object' && event !== null && (event as Record<string, unknown>)['type'] === 'profile_selected',
    );
    const firstDevReceiptIndex = before.findIndex(
      (event) =>
        typeof event === 'object' &&
        event !== null &&
        (event as Record<string, unknown>)['type'] === 'artifact_receipt_admitted' &&
        ((event as Record<string, unknown>)['receipt'] as Record<string, unknown>)['stage'] === 'development',
    );
    expect(selectionIndex).toBeGreaterThan(-1);
    expect(firstDevReceiptIndex).toBeGreaterThan(-1);
    expect(selectionIndex).toBeGreaterThan(firstDevReceiptIndex);
    const moved = moveEventBefore(before, selectionIndex, firstDevReceiptIndex);
    expect(moved.length).toBe(before.length);
    writeLedgerArray(fixture, moved);
    const verifierBefore = fixture.effects.verifierCalls;
    const nativeBefore = fixture.effects.nativeVerifierCalls;
    const appendsBefore = fixture.effects.ledgerAppends;
    const journalBefore = fixture.effects.journalAppends;
    const fsyncsBefore = fixture.effects.fsyncs;
    const clocksBefore = fixture.effects.clockReads;
    let caught: unknown;
    try {
      fixture.createLedger(fixture.reportOptions, fixture.verifierOptions);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect((caught as Error).message).toBe('calibration:ledger-event-out-of-order:profile_selected');
    expect(asRecord(caught).cause).toBeUndefined();
    expect(fixture.effects.verifierCalls).toBe(verifierBefore);
    expect(fixture.effects.nativeVerifierCalls).toBe(nativeBefore);
    expect(fixture.effects.ledgerAppends).toBe(appendsBefore);
    expect(fixture.effects.journalAppends).toBe(journalBefore);
    expect(fixture.effects.fsyncs).toBe(fsyncsBefore);
    expect(fixture.effects.clockReads).toBe(clocksBefore);
  });

  it('stage_completed moved before its own preflight receipts is out-of-order at construction (receipt dependency isolated)', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    await fixture.publish('preflight', 'MEDIUM');
    fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    fixture.ledger.admitStageReportReceipt('preflight', 'MEDIUM');
    fixture.ledger.completeStage('preflight', { stage: 'preflight', passed: true, completedStages: [] });
    const before = readLedgerArray(fixture);
    const stageCompletedIndex = before.findIndex(
      (event) =>
        typeof event === 'object' &&
        event !== null &&
        (event as Record<string, unknown>)['type'] === 'stage_completed' &&
        (event as Record<string, unknown>)['stage'] === 'preflight',
    );
    const firstPreflightReceiptIndex = before.findIndex(
      (event) =>
        typeof event === 'object' &&
        event !== null &&
        (event as Record<string, unknown>)['type'] === 'artifact_receipt_admitted' &&
        ((event as Record<string, unknown>)['receipt'] as Record<string, unknown>)['stage'] === 'preflight',
    );
    expect(stageCompletedIndex).toBeGreaterThan(-1);
    expect(firstPreflightReceiptIndex).toBeGreaterThan(-1);
    expect(stageCompletedIndex).toBeGreaterThan(firstPreflightReceiptIndex);
    const moved = moveEventBefore(before, stageCompletedIndex, firstPreflightReceiptIndex);
    expect(moved.length).toBe(before.length);
    writeLedgerArray(fixture, moved);
    const verifierBefore = fixture.effects.verifierCalls;
    const nativeBefore = fixture.effects.nativeVerifierCalls;
    const appendsBefore = fixture.effects.ledgerAppends;
    const journalBefore = fixture.effects.journalAppends;
    const fsyncsBefore = fixture.effects.fsyncs;
    const clocksBefore = fixture.effects.clockReads;
    let caught: unknown;
    try {
      fixture.createLedger(fixture.reportOptions, fixture.verifierOptions);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect((caught as Error).message).toBe('calibration:ledger-event-out-of-order:stage_completed');
    expect(asRecord(caught).cause).toBeUndefined();
    expect(fixture.effects.verifierCalls).toBe(verifierBefore);
    expect(fixture.effects.nativeVerifierCalls).toBe(nativeBefore);
    expect(fixture.effects.ledgerAppends).toBe(appendsBefore);
    expect(fixture.effects.journalAppends).toBe(journalBefore);
    expect(fixture.effects.fsyncs).toBe(fsyncsBefore);
    expect(fixture.effects.clockReads).toBe(clocksBefore);
  });
});

describe('genuine nonempty journal with a missing ledger header (existing negative control)', () => {
  it('replacing ledger.json with an empty array while journal.json stays populated fails closed at construction', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    const journalBefore = JSON.parse(readFileSync(journalJsonPath(fixture), 'utf8')) as unknown[];
    expect(journalBefore.length).toBeGreaterThan(0);
    const firstEntry = journalBefore[0];
    expect(typeof firstEntry).toBe('object');
    expect(firstEntry).not.toBe(null);
    fixture.releaseLockViaNativeDeps();
    writeLedgerArray(fixture, []);
    const nativeBefore = fixture.effects.nativeVerifierCalls;
    const appendsBefore = fixture.effects.ledgerAppends;
    const journalAppendsBefore = fixture.effects.journalAppends;
    const fsyncsBefore = fixture.effects.fsyncs;
    const clocksBefore = fixture.effects.clockReads;
    let caught: unknown;
    try {
      fixture.createLedger(fixture.reportOptions, fixture.verifierOptions);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect((caught as Error).message).toBe('calibration:ledger-header-missing');
    expect(asRecord(caught).cause).toBeUndefined();
    expect(fixture.effects.nativeVerifierCalls).toBe(nativeBefore);
    expect(fixture.effects.ledgerAppends).toBe(appendsBefore);
    expect(fixture.effects.journalAppends).toBe(journalAppendsBefore);
    expect(fixture.effects.fsyncs).toBe(fsyncsBefore);
    expect(fixture.effects.clockReads).toBe(clocksBefore);
    const journalAfter = JSON.parse(readFileSync(journalJsonPath(fixture), 'utf8')) as unknown[];
    expect(journalAfter).toEqual(journalBefore);
  });
});
