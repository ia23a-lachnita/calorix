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
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
    expect(fixture.effects.verifierCalls).toBe(verifierBeforeRepeat + 1);
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
    next.ledger.acquireLock({ ...next.owner });
    expect(next.effects.verifierCalls).toBe(4);
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
    expect(fixture.effects.verifierCalls).toBe(verifierBeforeRepeat + 1);
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
    const second = fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    expect(second === first).toBe(false);
    expect(second).toEqual(first);
    expect(Object.isFrozen(second)).toBe(true);
    expect(fixture.effects.ledgerAppends).toBe(appends);
    expect(fixture.effects.clockReads).toBe(clocks);
    expect(fixture.effects.fsyncs).toBe(syncs);
    expect(fixture.effects.verifierCalls).toBe(verifierBefore + 1);
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
    const receiptsBefore = fixture.receiptEvents();
    const clocksBefore = next.effects.clockReads;
    const syncsBefore = next.effects.fsyncs;
    const countsBefore = next.ledger.getCounts();
    next.ledger.acquireLock({ ...next.owner });
    expect(next.effects.verifierCalls).toBe(2);
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
