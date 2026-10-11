/**
 * Task 2 foundation: opt-in authoritative report admission RED scaffold.
 *
 * Exercises the real legacy fourth-option ledger, genuine native publication
 * and verification, and the future fifth-option/marker/admission contracts
 * through the shared authoritative fixture. Missing production behavior
 * (trailing fifth option, mode marker, admission API) fails at runtime;
 * nothing is mocked in the production ledger.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
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
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';

const sdkGuard = vi.hoisted(() => ({ constructCalls: 0 }));
const networkGuard = vi.hoisted(() => ({ attemptCalls: 0 }));
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
  const ownedRoot =
    '/home/agent-runner/projects/calorix/.superpowers/sdd/2026-10-10-calibration-authoritative-report-gates/tmp/authoritative-reports-';
  const wrappedMkdtempSync = (...args: Parameters<typeof actual.mkdtempSync>): string => {
    const created = (actual.mkdtempSync as (...a: typeof args) => string)(...args);
    if (typeof created === 'string' && created.startsWith(ownedRoot)) {
      (fsObserver.mkdtempPaths as string[]).push(created);
    }
    return created;
  };
  return { ...actual, mkdtempSync: wrappedMkdtempSync };
});

const OWNED_TMP_PREFIX =
  '/home/agent-runner/projects/calorix/.superpowers/sdd/2026-10-10-calibration-authoritative-report-gates/tmp/authoritative-reports-';

const tracked: AuthoritativeFixture[] = [];
let savedFetch: typeof fetch | undefined;
beforeEach(() => {
  sdkGuard.constructCalls = 0;
  networkGuard.attemptCalls = 0;
  fsObserver.mkdtempPaths.length = 0;
  savedFetch = globalThis.fetch;
  globalThis.fetch = (async (..._args: unknown[]) => {
    networkGuard.attemptCalls += 1;
    throw new Error('authoritative-test-network-guard: fetch forbidden');
  }) as typeof fetch;
});
afterEach(() => {
  try {
    expect(sdkGuard.constructCalls).toBe(0);
    expect(networkGuard.attemptCalls).toBe(0);
  } finally {
    if (savedFetch !== undefined) {
      globalThis.fetch = savedFetch;
      savedFetch = undefined;
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
    while (tracked.length > 0) {
      const fixture = tracked.pop();
      try {
        fixture?.cleanup();
      } catch {
        // Best effort.
      }
    }
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
    expect(created.startsWith(OWNED_TMP_PREFIX)).toBe(true);
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
