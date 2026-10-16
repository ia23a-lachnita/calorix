/**
 * Task 3 Step 1 RED-only core tests: explicit shared-core evidence mode.
 *
 * `createRuntimeEvidenceCalibrationLedger` and `CalibrationRuntimeEvidenceLedger`
 * do not exist in `calibration.ts` yet (Task 3 Step 3 is unimplemented). Every
 * test that needs the new factory goes through
 * `makeRuntimeEvidenceCoreFixture()` / `loadRuntimeEvidenceCalibrationLedgerFactory()`,
 * which look the export up dynamically at runtime and throw a
 * `CalibrationFatalError` attributable to that absence; this keeps the
 * failure scoped to these new tests and leaves Task 1/2 suites and the
 * existing-source fixture controls below unaffected by any import crash.
 *
 * No production ledger mock: all in-memory deps clone persisted arrays and
 * expose each write/fsync/fault point independently; all report admission
 * goes through the real scorer/report-assembler via
 * `prepareCalibrationStageReportReconstructor`, not a fabricated report.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCalibrationLedger,
  createProtocolCalibrationLedger,
} from '../../src/nutrition-eval/calibration';
import type {
  CalibrationOwner,
  CalibrationProtocolLedger,
  ReservationKey,
} from '../../src/nutrition-eval/calibration';
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';
import { StrictCalibrationManifestSchema } from '../../src/nutrition-eval/schema';
import {
  buildCoreSuccessJournal,
  CORE_PINNED_VERSION,
  createCoreExactPrediction,
  loadRuntimeEvidenceCalibrationLedgerFactory,
  makeRuntimeEvidenceCoreBacking,
  makeRuntimeEvidenceCoreFixture,
  makeExistingAuthoritativeCoreFixture,
  makeRuntimeEvidenceData,
} from './calibration-runtime-evidence-fixtures';

const sdkGuard = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@google/genai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/genai')>();
  return { ...actual, GoogleGenAI: class {
    constructor() {
      sdkGuard.calls += 1;
      throw new Error('core-test: SDK construction forbidden');
    }
  } };
});
let fetchCalls = 0;
beforeAll(() => {
  vi.stubGlobal('fetch', () => {
    fetchCalls += 1;
    throw new Error('core-test: fetch forbidden');
  });
});
beforeEach(() => {
  expect(sdkGuard.calls).toBe(0);
  expect(fetchCalls).toBe(0);
});
afterAll(() => vi.unstubAllGlobals());
import type {
  CalibrationRuntimeEvidenceLedger,
  RuntimeEvidenceCoreBacking,
  RuntimeEvidenceCoreFixture,
} from './calibration-runtime-evidence-fixtures';

function expectStaticCauseless(error: unknown, marker: string): void {
  expect(error).toBeInstanceOf(CalibrationFatalError);
  const message = (error as CalibrationFatalError).message;
  expect(message.startsWith('calibration:')).toBe(true);
  expect(message).not.toContain(marker);
  expect((error as CalibrationFatalError).cause).toBeUndefined();
}

function laterOwner(owner: CalibrationOwner, suffix: number): CalibrationOwner {
  return {
    ...owner,
    pid: owner.pid + suffix,
    startTicks: owner.startTicks + suffix,
    acquiredAt: `2026-10-15T01:0${suffix}:00.000Z`,
  };
}

const openFixtures: RuntimeEvidenceCoreFixture[] = [];
async function openCoreFixture(): Promise<RuntimeEvidenceCoreFixture> {
  const fixture = await makeRuntimeEvidenceCoreFixture();
  openFixtures.push(fixture);
  // Readiness belongs to this test convenience wrapper, NOT initialization:
  // the public fixture itself still creates exactly the extended header.
  fixture.completeTokenPrerequisites();
  return fixture;
}
afterEach(() => {
  try {
    expect(sdkGuard.calls).toBe(0);
    expect(fetchCalls).toBe(0);
  } finally {
    for (const fixture of openFixtures.splice(0)) fixture.cleanup();
  }
});

// ── 0. Existing-source fixture controls (old mode, no new factory call) ────
//
// Proves the shared data/key/report/identity/journal fixtures are valid
// against the CURRENT strict/authoritative factory before any test below
// touches the still-missing new factory.

describe('existing-source fixture controls (old mode)', () => {
  it('completes the shared synthetic stage builders through validation using the existing authoritative factory', async () => {
    const f = await makeExistingAuthoritativeCoreFixture();
    try {
      expect(f.events[0]).toMatchObject({ type: 'protocol_identity', reportAuthority: 'verified_artifacts_v1' });
      expect((f.events[0] as { runtimeEvidenceVersion?: unknown }).runtimeEvidenceVersion).toBeUndefined();
      f.finishPreflight();
      f.finishDevelopment();
      f.finishValidation();
      expect(f.ledger.getCompletedStages()).toEqual(['preflight', 'development', 'validation']);
      expect(f.ledger.getSelectedProfile()).toBe('MEDIUM');
      expect(f.ledger.getCounts().imageReserved).toBe(98);
      expect(f.ledger.getStageReportSnapshot('validation', 'MEDIUM').images).toHaveLength(48);
      expect(f.ledger.getStageReportSnapshot('validation', 'MEDIUM').nonReservations).toHaveLength(0);
    } finally {
      f.cleanup();
    }
  });

  it('uses real benchmark label and twelve barcode outcomes without giving barcodes image reservations', async () => {
    const f = await makeExistingAuthoritativeCoreFixture();
    try {
      f.finishPreflight();
      f.finishDevelopment();
      f.finishValidation();
      const barcodeRows = f.plans.MEDIUM.filter((row) => row.key.stage === 'benchmark' && row.scanMode === 'barcode');
      const labelRows = f.plans.MEDIUM.filter((row) => row.key.stage === 'benchmark' && row.scanMode === 'label');
      expect(barcodeRows).toHaveLength(12);
      expect(labelRows).toHaveLength(12);
      for (const row of barcodeRows) f.completeOutcomeKey(row.key);
      expect(f.ledger.getCounts().imageReserved).toBe(98);
      expect(f.ledger.getStageReportSnapshot('benchmark', 'MEDIUM').nonReservations).toHaveLength(12);
      for (const row of labelRows) f.completeOutcomeKey(row.key);
      expect(f.ledger.getCounts().imageReserved).toBe(110);
      expect(f.ledger.getStageReportSnapshot('benchmark', 'MEDIUM').images).toHaveLength(12);
      expect(() => f.ledger.completeStage('benchmark', {
        stage: 'benchmark', passed: true, completedStages: ['preflight', 'development', 'validation'],
      })).toThrow('calibration:benchmark-runtime-evidence-required');
    } finally {
      f.cleanup();
    }
  });

  it('replays the original persisted identity after a caller mutates a store read snapshot', async () => {
    const data = await makeRuntimeEvidenceData();
    const backing = makeRuntimeEvidenceCoreBacking();
    const resolver = () => data.plans.initial.map((row) => ({ ...row.key }));
    const first = createProtocolCalibrationLedger(backing.deps, data.header.identity, resolver);
    first.acquireLock(data.header.owner);
    first.releaseLock(data.header.owner);
    const readSnapshot = backing.deps.readLedgerEvents();
    const header = readSnapshot[0] as { identity: { functionsTreeId: string } };
    header.identity.functionsTreeId = 'f'.repeat(40);
    expect(() => {
      const restarted = createProtocolCalibrationLedger(backing.deps, data.header.identity, resolver);
      restarted.acquireLock(data.header.owner);
    }).not.toThrow();
  });

  it('builds a real old-mode protocol ledger from the shared fixture data and completes a reservation', async () => {
    const data = await makeRuntimeEvidenceData();
    const backing = makeRuntimeEvidenceCoreBacking();
    const owner: CalibrationOwner = { ...data.header.owner };
    const resolver = ((selectedProfile?: 'LOW' | 'MEDIUM') =>
      selectedProfile === undefined
        ? Object.freeze(data.plans.initial.map((row) => ({ ...row.key })))
        : Object.freeze(
            (selectedProfile === 'LOW' ? data.plans.LOW : data.plans.MEDIUM).map((row) => ({ ...row.key })),
          )) as unknown as (selectedProfile?: 'LOW' | 'MEDIUM') => readonly ReservationKey[];
    const ledger: CalibrationProtocolLedger = createProtocolCalibrationLedger(
      backing.deps,
      data.header.identity,
      resolver,
    );
    ledger.acquireLock(owner);
    expect(backing.events).toHaveLength(1);
    expect(backing.events[0]).toMatchObject({ type: 'protocol_identity' });
    expect((backing.events[0] as { reportAuthority?: unknown }).reportAuthority).toBeUndefined();
    ledger.reserveTokenCount({
      kind: 'token_count', stage: 'preflight', caseId: data.key.caseId, model: data.header.identity.model,
    });
    ledger.completeTokenCount({
      kind: 'token_count', stage: 'preflight', caseId: data.key.caseId, model: data.header.identity.model,
    }, 1200);
    ledger.reserve(data.key);
    ledger.pinModelVersion(CORE_PINNED_VERSION);
    const manifest = StrictCalibrationManifestSchema.parse(
      JSON.parse(data.context.files['calibration-manifest']),
    );
    const evalCase = manifest.cases.find((row) => row.id === data.key.caseId)!;
    const prediction = createCoreExactPrediction(evalCase, data.key.sampleIndex);
    const journal = buildCoreSuccessJournal(data.key, prediction);
    const hash = ledger.appendResultJournal(journal);
    ledger.complete(data.key, hash);
    expect(ledger.getCounts().imageReserved).toBe(1);
  });

  it('old factories reject the new extended header (reportAuthority + runtimeEvidenceVersion)', async () => {
    const data = await makeRuntimeEvidenceData();
    const backing = makeRuntimeEvidenceCoreBacking();
    backing.events.push({
      type: 'protocol_identity',
      identity: data.header.identity,
      at: data.header.at,
      reportAuthority: 'verified_artifacts_v1',
      runtimeEvidenceVersion: 1,
      owner: data.header.owner,
    });
    const owner: CalibrationOwner = { ...data.header.owner };
    let caught: unknown;
    try {
      const ledger = createCalibrationLedger(
        backing.deps,
        data.header.identity,
        data.plans.initial.map((row) => ({ ...row.key })),
      );
      ledger.acquireLock(owner);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CalibrationFatalError);
  });
});

// ── 1. Missing-factory attribution ──────────────────────────────────────────

describe('explicit factory initialization stays unused and provisional', () => {
  it('loads the explicit evidence factory without constructing a provider', async () => {
    expect(typeof await loadRuntimeEvidenceCalibrationLedgerFactory()).toBe('function');
  });

  it('the bare fixture publishes exactly one extended header before any token/runtime work', async () => {
    const f = await makeRuntimeEvidenceCoreFixture();
    openFixtures.push(f);
    expect(f.events).toHaveLength(1);
    expect(f.events[0]).toMatchObject({ type: 'protocol_identity', runtimeEvidenceVersion: 1, owner: f.owner });
  });
});

// ── 2. Atomic header / single reservation authority (plan example tests) ───

describe('atomic evidence-mode header and reservation authority', () => {
  it('has one atomic mode header and one reservation authority', async () => {
    const f = await openCoreFixture();
    const ref = f.ledger.startRuntimeAttempt(f.key);
    f.ledger.startRuntimeOperation(ref, 'image');
    f.ledger.settleRuntimeOperation(ref, 'image', 'returned');
    f.ledger.startRuntimeOperation(ref, 'vision');
    f.ledger.reserve(f.key);
    f.ledger.authorizeRuntimeRequest(ref);
    expect(f.events[0]).toMatchObject({
      type: 'protocol_identity',
      reportAuthority: 'verified_artifacts_v1',
      runtimeEvidenceVersion: 1,
      owner: f.owner,
    });
    expect(f.events.filter((e) => (e as { type: string }).type === 'protocol_identity')).toHaveLength(1);
    expect(f.events.filter((e) => (e as { type: string }).type === 'reserved')).toHaveLength(1);
    expect(f.events.filter((e) => (e as { type: string }).type === 'runtime_request_authorized')).toHaveLength(1);
    expect(f.ledger.getCounts().imageReserved).toBe(1);
  });

  it('does not expose constructor replay as current-owner authority', async () => {
    const f = await openCoreFixture();
    const other = f.createUnacquiredLedger();
    expect(() => other.getRuntimeEvidenceSnapshot()).toThrow(CalibrationFatalError);
    expect(() => other.startRuntimeAttempt(f.key)).toThrow(CalibrationFatalError);
  });
});

// ── 3. Ruling12: every new-mode stored-state getter requires authority ─────

describe('Ruling12: unacquired constructor replay grants no stored-state getter authority', () => {
  it('getCounts/getPinnedModelVersion/getSelectedProfile/getCompletedStages/getStageReportSnapshot all require acquired authority', async () => {
    const f = await openCoreFixture();
    const other = f.createUnacquiredLedger();
    expect(() => other.getCounts()).toThrow(CalibrationFatalError);
    expect(() => other.getPinnedModelVersion()).toThrow(CalibrationFatalError);
    expect(() => other.getSelectedProfile()).toThrow(CalibrationFatalError);
    expect(() => other.getCompletedStages()).toThrow(CalibrationFatalError);
    expect(() => other.getStageReportSnapshot('preflight', 'LOW')).toThrow(CalibrationFatalError);
    expect(() => other.getRuntimeEvidenceSnapshot()).toThrow(CalibrationFatalError);
  });
});

// ── 4. Strict header combinations rejected by the new mode ─────────────────

describe('new-mode strict header combinations', () => {
  async function rejectedHeaderCase(mutate: (backing: RuntimeEvidenceCoreBacking) => void): Promise<void> {
    const data = await makeRuntimeEvidenceData();
    const factory = await loadRuntimeEvidenceCalibrationLedgerFactory();
    const backing = makeRuntimeEvidenceCoreBacking();
    mutate(backing);
    const owner: CalibrationOwner = { ...data.header.owner };
    expect(() => {
      const ledger: CalibrationRuntimeEvidenceLedger = factory(
      backing.deps,
      data.header.identity,
      ((selectedProfile?: 'LOW' | 'MEDIUM') =>
        Object.freeze(
          (selectedProfile === undefined
            ? data.plans.initial
            : selectedProfile === 'LOW' ? data.plans.LOW : data.plans.MEDIUM
          ).map((row) => ({ ...row.key })),
        )) as never,
      { getReportOutcomePlan: (selectedProfile) =>
        selectedProfile === undefined
          ? data.plans.initial
          : selectedProfile === 'LOW' ? data.plans.LOW : data.plans.MEDIUM },
      { verifyStageReportArtifacts: () => { throw new CalibrationFatalError('calibration:fixture-verifier-not-reached'); } },
      {
        initialOwner: owner,
        plans: data.plans,
        readCurrentGitState: () => ({ headCommit: 'a'.repeat(40), functionsTreeId: data.header.identity.functionsTreeId, dirtyPaths: [] }),
      },
    );
      ledger.acquireLock(owner);
    }).toThrow(CalibrationFatalError);
  }

  it('rejects an ordinary legacy header (no reportAuthority marker)', async () => {
    const data = await makeRuntimeEvidenceData();
    await rejectedHeaderCase((backing) => {
      backing.events.push({ type: 'protocol_identity', identity: data.header.identity, at: data.header.at });
    });
  });

  it('rejects an authority-only header (reportAuthority without runtimeEvidenceVersion)', async () => {
    const data = await makeRuntimeEvidenceData();
    await rejectedHeaderCase((backing) => {
      backing.events.push({
        type: 'protocol_identity', identity: data.header.identity, at: data.header.at,
        reportAuthority: 'verified_artifacts_v1', owner: data.header.owner,
      });
    });
  });

  it('rejects a wrong authority marker', async () => {
    const data = await makeRuntimeEvidenceData();
    await rejectedHeaderCase((backing) => {
      backing.events.push({
        type: 'protocol_identity', identity: data.header.identity, at: data.header.at,
        reportAuthority: 'unverified_v0', runtimeEvidenceVersion: 1, owner: data.header.owner,
      });
    });
  });

  it('rejects an unknown evidence version', async () => {
    const data = await makeRuntimeEvidenceData();
    await rejectedHeaderCase((backing) => {
      backing.events.push({
        type: 'protocol_identity', identity: data.header.identity, at: data.header.at,
        reportAuthority: 'verified_artifacts_v1', runtimeEvidenceVersion: 2, owner: data.header.owner,
      });
    });
  });

  it('rejects a missing evidence version', async () => {
    const data = await makeRuntimeEvidenceData();
    await rejectedHeaderCase((backing) => {
      backing.events.push({
        type: 'protocol_identity', identity: data.header.identity, at: data.header.at,
        reportAuthority: 'verified_artifacts_v1', owner: data.header.owner,
      });
    });
  });

  it('rejects a nonempty journal with no ledger header', async () => {
    const data = await makeRuntimeEvidenceData();
    const manifest = StrictCalibrationManifestSchema.parse(JSON.parse(data.context.files['calibration-manifest']));
    const evalCase = manifest.cases.find((row) => row.id === data.key.caseId)!;
    await rejectedHeaderCase((backing) => {
      backing.journals.push(buildCoreSuccessJournal(data.key, createCoreExactPrediction(evalCase, 1)));
    });
  });

  it('rejects a duplicate extended header', async () => {
    const data = await makeRuntimeEvidenceData();
    await rejectedHeaderCase((backing) => {
      const header = {
        type: 'protocol_identity', identity: data.header.identity, at: data.header.at,
        reportAuthority: 'verified_artifacts_v1', runtimeEvidenceVersion: 1, owner: data.header.owner,
      };
      backing.events.push({ ...header }, { ...header });
    });
  });
});

// ── 5. Durable failure at each persistence boundary ─────────────────────────

describe('durable failure at each persistence boundary poisons the instance without faking success', () => {
  it('fails header publication on append and leaves zero candidate state', async () => {
    const data = await makeRuntimeEvidenceData();
    const factory = await loadRuntimeEvidenceCalibrationLedgerFactory();
    const backing = makeRuntimeEvidenceCoreBacking();
    backing.faults.failNextAppend = true;
    const owner: CalibrationOwner = { ...data.header.owner };
    const ledger = factory(
      backing.deps, data.header.identity,
      ((selectedProfile?: 'LOW' | 'MEDIUM') =>
        Object.freeze((selectedProfile === undefined ? data.plans.initial
          : selectedProfile === 'LOW' ? data.plans.LOW : data.plans.MEDIUM).map((row) => ({ ...row.key })))) as never,
      { getReportOutcomePlan: (selectedProfile) =>
        selectedProfile === undefined ? data.plans.initial
          : selectedProfile === 'LOW' ? data.plans.LOW : data.plans.MEDIUM },
      { verifyStageReportArtifacts: () => { throw new CalibrationFatalError('calibration:fixture-verifier-not-reached'); } },
      { initialOwner: owner, plans: data.plans,
        readCurrentGitState: () => ({ headCommit: 'a'.repeat(40), functionsTreeId: data.header.identity.functionsTreeId, dirtyPaths: [] }) },
    );
    let caught: unknown;
    try { ledger.acquireLock(owner); } catch (error) { caught = error; }
    expectStaticCauseless(caught, 'core-fixture-private-bytes');
    expect(backing.events).toHaveLength(0);
    expect(() => ledger.releaseLock(owner)).toThrow(CalibrationFatalError);
  });

  it('fails header publication on file fsync, retains the raw bytes but poisons candidate state and the lock', async () => {
    const data = await makeRuntimeEvidenceData();
    const factory = await loadRuntimeEvidenceCalibrationLedgerFactory();
    const backing = makeRuntimeEvidenceCoreBacking();
    backing.faults.failNextFile = true;
    const owner: CalibrationOwner = { ...data.header.owner };
    const ledger = factory(
      backing.deps, data.header.identity,
      ((selectedProfile?: 'LOW' | 'MEDIUM') =>
        Object.freeze((selectedProfile === undefined ? data.plans.initial
          : selectedProfile === 'LOW' ? data.plans.LOW : data.plans.MEDIUM).map((row) => ({ ...row.key })))) as never,
      { getReportOutcomePlan: (selectedProfile) =>
        selectedProfile === undefined ? data.plans.initial
          : selectedProfile === 'LOW' ? data.plans.LOW : data.plans.MEDIUM },
      { verifyStageReportArtifacts: () => { throw new CalibrationFatalError('calibration:fixture-verifier-not-reached'); } },
      { initialOwner: owner, plans: data.plans,
        readCurrentGitState: () => ({ headCommit: 'a'.repeat(40), functionsTreeId: data.header.identity.functionsTreeId, dirtyPaths: [] }) },
    );
    let caught: unknown;
    try { ledger.acquireLock(owner); } catch (error) { caught = error; }
    expectStaticCauseless(caught, 'core-fixture-private-bytes');
    expect(backing.events).toHaveLength(1);
    expect(() => ledger.getRuntimeEvidenceSnapshot()).toThrow(CalibrationFatalError);
    expect(() => ledger.releaseLock(owner)).toThrow(CalibrationFatalError);
  });

  it('fails a runtime_attempt_started append and keeps the raw event count at the pre-call baseline', async () => {
    const f = await openCoreFixture();
    const before = f.events.length;
    f.faults.failNextAppend = true;
    let caught: unknown;
    try { f.ledger.startRuntimeAttempt(f.key); } catch (error) { caught = error; }
    expectStaticCauseless(caught, 'core-fixture-private-bytes');
    expect(f.events.length).toBe(before);
    expect(() => f.ledger.getRuntimeEvidenceSnapshot()).toThrow(CalibrationFatalError);
  });

  it('fails a runtime_attempt_started dir fsync, retains the raw bytes but poisons candidate state', async () => {
    const f = await openCoreFixture();
    const before = f.events.length;
    f.faults.failNextDir = true;
    let caught: unknown;
    try { f.ledger.startRuntimeAttempt(f.key); } catch (error) { caught = error; }
    expectStaticCauseless(caught, 'core-fixture-private-bytes');
    expect(f.events.length).toBe(before + 1);
    expect(() => f.ledger.getRuntimeEvidenceSnapshot()).toThrow(CalibrationFatalError);
    expect(() => f.ledger.releaseLock(f.owner)).toThrow(CalibrationFatalError);
  });

  it('fails the reserved event append during authorization and advances no counters', async () => {
    const f = await openCoreFixture();
    const ref = f.ledger.startRuntimeAttempt(f.key);
    f.ledger.startRuntimeOperation(ref, 'image');
    f.ledger.settleRuntimeOperation(ref, 'image', 'returned');
    f.ledger.startRuntimeOperation(ref, 'vision');
    f.faults.failNextAppend = true;
    let caught: unknown;
    try { f.ledger.reserve(f.key); } catch (error) { caught = error; }
    expectStaticCauseless(caught, 'core-fixture-private-bytes');
    expect(() => f.ledger.getCounts()).toThrow(CalibrationFatalError);
  });

  it('fails the finish-attempt append after a real terminal and does not advance completed state', async () => {
    const f = await openCoreFixture();
    const ref = f.ledger.startRuntimeAttempt(f.key);
    f.ledger.startRuntimeOperation(ref, 'image');
    f.ledger.settleRuntimeOperation(ref, 'image', 'returned');
    f.ledger.startRuntimeOperation(ref, 'vision');
    f.ledger.reserve(f.key);
    f.ledger.authorizeRuntimeRequest(ref);
    f.pinOnce();
    f.ledger.settleRuntimeOperation(ref, 'vision', 'returned');
    const prediction = createCoreExactPrediction(f.evalCase, f.key.sampleIndex);
    const journal = buildCoreSuccessJournal(f.key, prediction);
    const hash = f.ledger.appendResultJournal(journal);
    f.ledger.complete(f.key, hash);
    f.faults.failNextAppend = true;
    let caught: unknown;
    try { f.ledger.finishRuntimeAttempt(ref); } catch (error) { caught = error; }
    expectStaticCauseless(caught, 'core-fixture-private-bytes');
    expect(() => f.ledger.getRuntimeEvidenceSnapshot()).toThrow(CalibrationFatalError);
  });

  it('fails receipt admission append and leaves the pair unsealed', async () => {
    const f = await openCoreFixture();
    f.finishPreflightOutcomes();
    f.faults.failNextAppend = true;
    let caught: unknown;
    try { f.ledger.admitStageReportReceipt('preflight', 'LOW'); } catch (error) { caught = error; }
    expectStaticCauseless(caught, 'core-fixture-private-bytes');
    expect(f.events.filter((e) => (e as { type: string }).type === 'artifact_receipt_admitted')).toHaveLength(0);
  });

  it('fails binding append after a real admitted receipt and does not commit a binding', async () => {
    const f = await openCoreFixture();
    f.finishPreflightOutcomes();
    f.ledger.admitStageReportReceipt('preflight', 'LOW');
    f.faults.failNextAppend = true;
    let caught: unknown;
    try { f.ledger.bindRuntimeStageReport('preflight', 'LOW'); } catch (error) { caught = error; }
    expectStaticCauseless(caught, 'core-fixture-private-bytes');
    expect(f.events.filter((e) => (e as { type: string }).type === 'runtime_report_bound')).toHaveLength(0);
  });
});

// ── 6. Reflection / reentry traps ────────────────────────────────────────────

describe('hostile reflection reentry is poisoned, not silently tolerated', () => {
  it('rejects an accessor without executing its getter and preserves zero capture-stage writes', async () => {
    const f = await openCoreFixture();
    const before = f.events.length;
    let reentered = false;
    const hostileKey = {
      stage: f.key.stage,
      profile: f.key.profile,
      get caseId() {
        if (!reentered) {
          reentered = true;
          try { f.ledger.getCounts(); } catch { /* reentrant call is expected to fail or poison */ }
        }
        return f.key.caseId;
      },
      sampleIndex: f.key.sampleIndex,
    };
    let caught: unknown;
    try { f.ledger.startRuntimeAttempt(hostileKey); } catch (error) { caught = error; }
    expect(reentered).toBe(false);
    expect(f.events.length).toBe(before);
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect(() => f.ledger.getRuntimeEvidenceSnapshot()).toThrow(CalibrationFatalError);
  });
});

// ── 7. protocol_noop mapping stays narrow ───────────────────────────────────

describe('protocol_noop maps only the five already-validated kinds', () => {
  it('accepts an inherited safe_error noop unchanged in the new mode', async () => {
    const f = await openCoreFixture();
    expect(() =>
      f.ledger.recordSafeError({
        stage: 'preflight', kind: 'token_count', caseId: f.key.caseId, errorCategory: 'timeout',
      }),
    ).not.toThrow();
    expect(f.events.some((e) => (e as { type: string }).type === 'safe_error')).toBe(true);
  });

  it('rejects an unknown synthetic ledger event on replay', async () => {
    const data = await makeRuntimeEvidenceData();
    const factory = await loadRuntimeEvidenceCalibrationLedgerFactory();
    const backing = makeRuntimeEvidenceCoreBacking();
    backing.events.push(
      {
        type: 'protocol_identity', identity: data.header.identity, at: data.header.at,
        reportAuthority: 'verified_artifacts_v1', runtimeEvidenceVersion: 1, owner: data.header.owner,
      },
      { type: 'runtime_evidence_synthetic_unknown', at: data.header.at },
    );
    const owner: CalibrationOwner = { ...data.header.owner };
    const ledger = factory(
      backing.deps, data.header.identity,
      ((selectedProfile?: 'LOW' | 'MEDIUM') =>
        Object.freeze((selectedProfile === undefined ? data.plans.initial
          : selectedProfile === 'LOW' ? data.plans.LOW : data.plans.MEDIUM).map((row) => ({ ...row.key })))) as never,
      { getReportOutcomePlan: (selectedProfile) =>
        selectedProfile === undefined ? data.plans.initial
          : selectedProfile === 'LOW' ? data.plans.LOW : data.plans.MEDIUM },
      { verifyStageReportArtifacts: () => { throw new CalibrationFatalError('calibration:fixture-verifier-not-reached'); } },
      { initialOwner: owner, plans: data.plans,
        readCurrentGitState: () => ({ headCommit: 'a'.repeat(40), functionsTreeId: data.header.identity.functionsTreeId, dirtyPaths: [] }) },
    );
    expect(() => ledger.acquireLock(owner)).toThrow(CalibrationFatalError);
  });
});

// ── 8. Bare reserve/terminal without a corresponding attempt ───────────────

describe('bare reserve/terminal without an attempt is rejected only in the new mode', () => {
  it('new mode rejects a bare reserve with no active runtime attempt', async () => {
    const f = await openCoreFixture();
    expect(() => f.ledger.reserve(f.key)).toThrow(CalibrationFatalError);
  });

  it('new mode rejects finishRuntimeAttempt on a ref never produced by startRuntimeAttempt', async () => {
    const f = await openCoreFixture();
    const foreignRef = { key: f.key, attempt: 1 };
    expect(() => f.ledger.finishRuntimeAttempt(foreignRef)).toThrow(CalibrationFatalError);
  });

  it('old mode is unaffected: reserve still succeeds without any runtime concept', async () => {
    const data = await makeRuntimeEvidenceData();
    const backing = makeRuntimeEvidenceCoreBacking();
    const owner: CalibrationOwner = { ...data.header.owner };
    const ledger = createProtocolCalibrationLedger(
      backing.deps, data.header.identity,
      ((selectedProfile?: 'LOW' | 'MEDIUM') =>
        Object.freeze((selectedProfile === undefined ? data.plans.initial
          : selectedProfile === 'LOW' ? data.plans.LOW : data.plans.MEDIUM).map((row) => ({ ...row.key })))) as never,
    );
    ledger.acquireLock(owner);
    ledger.reserveTokenCount({
      kind: 'token_count', stage: 'preflight', caseId: data.key.caseId, model: data.header.identity.model,
    });
    ledger.completeTokenCount({
      kind: 'token_count', stage: 'preflight', caseId: data.key.caseId, model: data.header.identity.model,
    }, 1200);
    expect(() => ledger.reserve(data.key)).not.toThrow();
  });
});

// ── 9. Barcode keys reject image/vision/reservation operations ─────────────

describe('a barcode key rejects image/vision/reservation operations', () => {
  it.each(['image', 'vision', 'reserve'] as const)('%s fails for a valid-stage barcode key before any extra writes', async (kind) => {
    const f = await openCoreFixture();
    f.finishPreflight();
    f.finishDevelopment();
    f.finishValidation();
    const barcodeRow = f.plans.MEDIUM.find((row) => row.scanMode === 'barcode');
    expect(barcodeRow).toBeDefined();
    const barcodeKey = barcodeRow!.key;
    const ref = f.ledger.startRuntimeAttempt(barcodeKey);
    const before = f.events.length;
    expect(() => kind === 'reserve'
      ? f.ledger.reserve(barcodeKey)
      : f.ledger.startRuntimeOperation(ref, kind)).toThrow(CalibrationFatalError);
    expect(f.events).toHaveLength(before);
  });
});

// ── 10. Recovery matrix with a proven dead owner ────────────────────────────

function eventsOfType(events: readonly unknown[], type: string): unknown[] {
  return events.filter((e) => (e as { type?: unknown }).type === type);
}

describe('recovery matrix rows under a proven dead owner', () => {
  it('unreserved vision intent: preserves history, abandons, and permits a fresh attempt under a new epoch', async () => {
    const f = await openCoreFixture();
    const ref = f.ledger.startRuntimeAttempt(f.key);
    f.ledger.startRuntimeOperation(ref, 'image');
    f.ledger.settleRuntimeOperation(ref, 'image', 'returned');
    f.ledger.startRuntimeOperation(ref, 'vision');
    f.setLiveness('dead');
    const next = laterOwner(f.owner, 1);
    const other = f.restart(next);
    other.acquireLock(next);
    other.recoverAfterCrash();
    const abandoned = eventsOfType(f.events, 'runtime_attempt_abandoned');
    expect(abandoned).toHaveLength(1);
    expect(abandoned[0]).toMatchObject({ disposition: { kind: 'unreserved_interruption' } });
    expect(() => other.startRuntimeAttempt(f.key)).not.toThrow();
  });

  it('reservation exists with no terminal: recovery abandons the reservation and the key is never dispatched again', async () => {
    const f = await openCoreFixture();
    const ref = f.ledger.startRuntimeAttempt(f.key);
    f.ledger.startRuntimeOperation(ref, 'image');
    f.ledger.settleRuntimeOperation(ref, 'image', 'returned');
    f.ledger.startRuntimeOperation(ref, 'vision');
    f.ledger.reserve(f.key);
    f.ledger.authorizeRuntimeRequest(ref);
    f.setLiveness('dead');
    const next = laterOwner(f.owner, 2);
    const other = f.restart(next);
    other.acquireLock(next);
    other.recoverAfterCrash();
    const abandoned = eventsOfType(f.events, 'runtime_attempt_abandoned');
    expect(abandoned).toHaveLength(1);
    expect(abandoned[0]).toMatchObject({ disposition: { kind: 'reserved_interruption' } });
    expect(() => other.startRuntimeAttempt(f.key)).toThrow(CalibrationFatalError);
  });

  it('real terminal with all settlements but no finish: recovery only appends the missing finish reference', async () => {
    const f = await openCoreFixture();
    const ref = f.ledger.startRuntimeAttempt(f.key);
    f.ledger.startRuntimeOperation(ref, 'image');
    f.ledger.settleRuntimeOperation(ref, 'image', 'returned');
    f.ledger.startRuntimeOperation(ref, 'vision');
    f.ledger.reserve(f.key);
    f.ledger.authorizeRuntimeRequest(ref);
    f.pinOnce();
    f.ledger.settleRuntimeOperation(ref, 'vision', 'returned');
    const prediction = createCoreExactPrediction(f.evalCase, f.key.sampleIndex);
    const journal = buildCoreSuccessJournal(f.key, prediction);
    const hash = f.ledger.appendResultJournal(journal);
    f.ledger.complete(f.key, hash);
    f.setLiveness('dead');
    const next = laterOwner(f.owner, 3);
    const other = f.restart(next);
    other.acquireLock(next);
    other.recoverAfterCrash();
    expect(eventsOfType(f.events, 'runtime_attempt_abandoned')).toHaveLength(0);
    expect(eventsOfType(f.events, 'runtime_attempt_finished')).toHaveLength(1);
  });

  it('real terminal with missing runtime settlement/authorization: recovery marks evidence incomplete, never redispatches', async () => {
    const f = await openCoreFixture();
    const ref = f.ledger.startRuntimeAttempt(f.key);
    f.ledger.startRuntimeOperation(ref, 'image');
    f.ledger.settleRuntimeOperation(ref, 'image', 'returned');
    f.ledger.startRuntimeOperation(ref, 'vision');
    f.ledger.reserve(f.key);
    f.ledger.authorizeRuntimeRequest(ref);
    f.pinOnce();
    const prediction = createCoreExactPrediction(f.evalCase, f.key.sampleIndex);
    const journal = buildCoreSuccessJournal(f.key, prediction);
    const hash = f.ledger.appendResultJournal(journal);
    f.ledger.complete(f.key, hash);
    f.setLiveness('dead');
    const next = laterOwner(f.owner, 4);
    const other = f.restart(next);
    other.acquireLock(next);
    other.recoverAfterCrash();
    const abandoned = eventsOfType(f.events, 'runtime_attempt_abandoned');
    expect(abandoned).toHaveLength(1);
    expect(abandoned[0]).toMatchObject({ disposition: { kind: 'terminal_evidence_incomplete' } });
    expect(eventsOfType(f.events, 'runtime_attempt_finished')).toHaveLength(0);
    expect(() => other.startRuntimeAttempt(f.key)).toThrow(CalibrationFatalError);
  });

  it('an orphan result journal with no ledger terminal is rejected, not repaired into a success', async () => {
    const f = await openCoreFixture();
    const ref = f.ledger.startRuntimeAttempt(f.key);
    f.ledger.startRuntimeOperation(ref, 'image');
    f.ledger.settleRuntimeOperation(ref, 'image', 'returned');
    f.ledger.startRuntimeOperation(ref, 'vision');
    f.ledger.reserve(f.key);
    f.ledger.authorizeRuntimeRequest(ref);
    f.pinOnce();
    f.ledger.settleRuntimeOperation(ref, 'vision', 'returned');
    const prediction = createCoreExactPrediction(f.evalCase, f.key.sampleIndex);
    const journal = buildCoreSuccessJournal(f.key, prediction);
    f.ledger.appendResultJournal(journal);
    f.setLiveness('dead');
    const next = laterOwner(f.owner, 5);
    expect(() => {
      const other = f.restart(next);
      other.acquireLock(next);
      other.recoverAfterCrash();
    }).toThrow(CalibrationFatalError);
  });

  it('an admitted receipt without a binding survives recovery and can still be bound fresh afterward', async () => {
    const f = await openCoreFixture();
    f.finishPreflightOutcomes();
    const receipt = f.ledger.admitStageReportReceipt('preflight', 'LOW');
    f.setLiveness('dead');
    const next = laterOwner(f.owner, 6);
    const other = f.restart(next);
    expect(() => other.acquireLock(next)).not.toThrow();
    other.recoverAfterCrash();
    const bound = other.bindRuntimeStageReport('preflight', 'LOW');
    expect(bound).toMatchObject({ type: 'runtime_report_bound', stage: 'preflight', profile: 'LOW' });
    expect((bound as { receipt: unknown }).receipt).toEqual(receipt);
  });
});

// ── 11. Report admission and binding ────────────────────────────────────────

describe('report admission is noncircular and binding is idempotent across other pair events', () => {
  it('admits a receipt without requiring a prior binding, then binds it', async () => {
    const f = await openCoreFixture();
    f.finishPreflightOutcomes();
    const receipt = f.ledger.admitStageReportReceipt('preflight', 'LOW');
    expect(receipt).toMatchObject({ stage: 'preflight', profile: 'LOW' });
    const bound = f.ledger.bindRuntimeStageReport('preflight', 'LOW');
    expect(bound).toMatchObject({ type: 'runtime_report_bound', stage: 'preflight', profile: 'LOW' });
  });

  it('retains the original throughSequence/digest on retry after other pair events', async () => {
    const f = await openCoreFixture();
    f.finishPreflightOutcomes();
    f.ledger.admitStageReportReceipt('preflight', 'LOW');
    const first = f.ledger.bindRuntimeStageReport('preflight', 'LOW');
    f.ledger.admitStageReportReceipt('preflight', 'MEDIUM');
    f.ledger.bindRuntimeStageReport('preflight', 'MEDIUM');
    const beforeCount = f.events.length;
    const again = f.ledger.bindRuntimeStageReport('preflight', 'LOW');
    expect(again).toEqual(first);
    expect(f.events.length).toBe(beforeCount);
    expect(eventsOfType(f.events, 'runtime_report_bound').filter(
      (e) => (e as { stage: string; profile: string }).stage === 'preflight'
        && (e as { stage: string; profile: string }).profile === 'LOW',
    )).toHaveLength(1);
  });
});

// ── 12. Benchmark completion remains unconditional in evidence mode ────────

describe('the unconditional benchmark block is intact in evidence mode', () => {
  it('throws calibration:benchmark-runtime-evidence-required immediately, with no prior stages done', async () => {
    const f = await openCoreFixture();
    expect(() =>
      f.ledger.completeStage('benchmark', {
        stage: 'benchmark', passed: true, completedStages: ['preflight', 'development', 'validation'],
      }),
    ).toThrow(CalibrationFatalError);
    try {
      f.ledger.completeStage('benchmark', {
        stage: 'benchmark', passed: true, completedStages: ['preflight', 'development', 'validation'],
      });
    } catch (error) {
      expect((error as CalibrationFatalError).message).toBe('calibration:benchmark-runtime-evidence-required');
    }
  });

  it('still throws after a real full preflight/development/validation pipeline', async () => {
    const f = await openCoreFixture();
    f.finishPreflight();
    f.finishDevelopment();
    f.finishValidation();
    let caught: unknown;
    try {
      f.ledger.completeStage('benchmark', {
        stage: 'benchmark', passed: true, completedStages: ['preflight', 'development', 'validation'],
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CalibrationFatalError);
    expect((caught as CalibrationFatalError).message).toBe('calibration:benchmark-runtime-evidence-required');
  });
});

// ── 13. No raw-event append or counter authority API ────────────────────────

describe('the new surface exposes no raw-event append or inference/counter-authority API', () => {
  it('has no appendRuntimeEvidenceEvent, appendRawEvent, or inferTerminal method', async () => {
    const f = await openCoreFixture();
    const surface = f.ledger as unknown as Record<string, unknown>;
    expect(surface['appendRuntimeEvidenceEvent']).toBeUndefined();
    expect(surface['appendRawEvent']).toBeUndefined();
    expect(surface['inferTerminal']).toBeUndefined();
    expect(surface['setRuntimeEvidenceSnapshot']).toBeUndefined();
  });
});
