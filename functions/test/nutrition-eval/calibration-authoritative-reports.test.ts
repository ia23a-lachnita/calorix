/**
 * Task 2 foundation: opt-in authoritative report admission RED scaffold.
 *
 * Exercises the real legacy fourth-option ledger, genuine native publication
 * and verification, and the future fifth-option/marker/admission contracts
 * through the shared authoritative fixture. Missing production behavior
 * (trailing fifth option, mode marker, admission API) fails at runtime;
 * nothing is mocked in the production ledger.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
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

const tracked: AuthoritativeFixture[] = [];
afterEach(() => {
  while (tracked.length > 0) {
    const fixture = tracked.pop();
    fixture?.cleanup();
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
  const ledger = fixture.createLedger(reportOptions, fifth);
  try {
    ledger.acquireLock({ ...fixture.owner });
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('authoritative fixture controls (legacy ledger with genuine native artifacts)', () => {
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
    expect(fixture.effects.providerCalls).toBe(0);
    expect(fixture.effects.networkCalls).toBe(0);
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
    expect(fixture.effects.providerCalls).toBe(0);
    expect(fixture.effects.networkCalls).toBe(0);
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
    const fifth = {
      verifyStageReportArtifacts: fixture.verifierOptions.verifyStageReportArtifacts,
    };
    const ledger = fixture.createLedger(fixture.reportOptions, fifth);
    let swappedCalls = 0;
    fifth.verifyStageReportArtifacts = () => {
      swappedCalls += 1;
      throw new Error('swapped-dependency');
    };
    expect(asRecord(fifth).verifyStageReportArtifacts).not.toBe(
      fixture.verifierOptions.verifyStageReportArtifacts,
    );
    let caught: unknown;
    try {
      ledger.admitStageReportReceipt('preflight', 'LOW');
    } catch (error) {
      caught = error;
    }
    expect(swappedCalls).toBe(0);
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect((caught as Error).message).toBe('calibration:artifact-verification-failed');
    expect(asRecord(caught).cause).toBeUndefined();
  });
  it('three-argument compatibility is preserved', async () => {
    const fixture = await openFixture();
    const ledger = fixture.createLedger(undefined, undefined);
    expect(typeof ledger.getStageReportSnapshot).toBe('function');
    expect(ledger.getCounts()).toEqual({ tokenCountReserved: 0, imageReserved: 0 });
  });
  it('four-argument compatibility is preserved', async () => {
    const fixture = await openFixture();
    const ledger = fixture.createLedger(fixture.reportOptions, undefined);
    expect(typeof ledger.getStageReportSnapshot).toBe('function');
    expect(ledger.getCounts()).toEqual({ tokenCountReserved: 0, imageReserved: 0 });
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
  it('opt-in acquire refuses a legacy stream (downgrade refused)', async () => {
    const fixture = await openFixture(makeAuthoritativeOwner(12), false);
    const optOut = fixture.createLedger(fixture.reportOptions, undefined);
    optOut.acquireLock({ ...fixture.owner });
    optOut.releaseLock({ ...fixture.owner });
    const caught = acquireWith(fixture, fixture.reportOptions, fixture.verifierOptions);
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect((caught as Error).message).toBe('calibration:report-authority-mode-mismatch');
    expect(asRecord(caught).cause).toBeUndefined();
  });
  it('opt-out acquire refuses a marked stream (upgrade refused)', async () => {
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
    expect((caught as Error).message).toBe('calibration:report-authority-mode-mismatch');
    expect(asRecord(caught).cause).toBeUndefined();
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
    expect((caught as Error).message).toBe('calibration:report-authority-mode-mismatch');
    expect(asRecord(caught).cause).toBeUndefined();
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
    expect((caught as Error).message).toBe('calibration:report-authority-mode-mismatch');
    expect(asRecord(caught).cause).toBeUndefined();
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
    const second = fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
    expect(second === first).toBe(false);
    expect(second).toEqual(first);
    expect(Object.isFrozen(second)).toBe(true);
    expect(fixture.effects.ledgerAppends).toBe(appends);
    expect(fixture.effects.clockReads).toBe(clocks);
    expect(fixture.effects.fsyncs).toBe(syncs);
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
      expect(fixture.ledger.getStageReportSnapshot('preflight', 'LOW').images).toHaveLength(1);
      expect(() => statSync(fixture.lockPath())).not.toThrow();
      let second: unknown;
      try {
        fixture.ledger.admitStageReportReceipt('preflight', 'LOW');
      } catch (error) {
        second = error;
      }
      expect(second).toBeInstanceOf(CalibrationFatalError);
      expect((second as Error).message).toBe('calibration:artifact-verification-failed');
      expect(second === first).toBe(false);
    });
  }
  it('new-owner reopen preserves bytes and replays genuinely before any new reservation', async () => {
    const fixture = await openFixture();
    await fixture.finishPreflight();
    await fixture.publish('preflight', 'LOW');
    await fixture.publish('preflight', 'MEDIUM');
    const before = JSON.stringify(fixture.ledger.getStageReportSnapshot('preflight', 'LOW'));
    const next = await fixture.reopen(makeAuthoritativeOwner(7));
    tracked.push(next);
    expect(JSON.stringify(next.ledger.getStageReportSnapshot('preflight', 'LOW'))).toBe(before);
    const publishedRunId = (
      JSON.parse(readFileSync(next.artifactPath('preflight', 'LOW', 'json'), 'utf8')) as {
        runId: string;
      }
    ).runId;
    const receipt = next.ledger.admitStageReportReceipt('preflight', 'LOW');
    expect(receipt.runId).toBe(publishedRunId);
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(next.receiptEvents()).toHaveLength(1);
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
