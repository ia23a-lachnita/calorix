/**
 * Independent fixture controls for calibration durable runtime evidence
 * (Task 1 Step 1/2).
 *
 * This file NEVER imports the not-yet-authored
 * calibration-runtime-evidence-codec module (no static or dynamic import)
 * and must stay runnable and GREEN before, during, and after that module's
 * RED/GREEN cycle. It proves the committed-asset fixture itself: real
 * 50/158 plan arithmetic, 12 barcode keys per expanded profile, pinned
 * manifest hashes, correctly shaped mutable header/key/start copies, and
 * zero SDK/fetch during fixture construction.
 *
 * Break caught if missing: a fixture that invents case IDs, returns frozen
 * caller-mutable records, drifts from pinned hashes, or performs network/
 * SDK effects would pass codec tests vacuously.
 */
import { afterAll, beforeEach, afterEach, expect, it, vi } from 'vitest';
import { makeRuntimeEvidenceData } from './calibration-runtime-evidence-fixtures';
import {
  CALIBRATION_HISTORICAL_REFERENCE_SHA256,
  CALIBRATION_MANIFEST_SHA256,
  CALIBRATION_OFF_SNAPSHOT_LOCK_SHA256,
  CALIBRATION_PROMPT_HASH,
  CALIBRATION_PUBLIC_MANIFEST_HASH,
  CALIBRATION_RESPONSE_SCHEMA_HASH,
  CALIBRATION_SOURCE_LOCK_SHA256,
} from '../../src/nutrition-eval/calibration-cli';

const sdkGuard = vi.hoisted(() => ({ constructCalls: 0 }));
const fetchGuard = vi.hoisted(() => {
  const state = { attemptCalls: 0 };
  const holder = globalThis as unknown as Record<string, unknown> & {
    __runtimeEvidenceFetchGuard?: { original: unknown; hadOwn: boolean };
  };
  const original = (globalThis as unknown as Record<string, unknown>)['fetch'];
  const hadOwn = Object.prototype.hasOwnProperty.call(globalThis, 'fetch');
  holder.__runtimeEvidenceFetchGuard = { original, hadOwn };
  (globalThis as unknown as Record<string, unknown>)['fetch'] = (..._args: unknown[]) => {
    state.attemptCalls += 1;
    throw new Error('runtime-evidence-fixture-guard: fetch forbidden');
  };
  return state;
});

vi.mock('@google/genai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/genai')>();
  class GuardedGoogleGenAI {
    constructor() {
      sdkGuard.constructCalls += 1;
      throw new Error('runtime-evidence-fixture-guard: GoogleGenAI construction forbidden');
    }
  }
  return { ...actual, GoogleGenAI: GuardedGoogleGenAI };
});

beforeEach(() => {
  expect(sdkGuard.constructCalls).toBe(0);
  expect(fetchGuard.attemptCalls).toBe(0);
  sdkGuard.constructCalls = 0;
  fetchGuard.attemptCalls = 0;
});

afterEach(() => {
  try {
    expect(sdkGuard.constructCalls).toBe(0);
    expect(fetchGuard.attemptCalls).toBe(0);
  } finally {
    sdkGuard.constructCalls = 0;
    fetchGuard.attemptCalls = 0;
  }
});

afterAll(() => {
  const holder = globalThis as unknown as Record<string, unknown> & {
    __runtimeEvidenceFetchGuard?: { original: unknown; hadOwn: boolean };
  };
  const saved = holder.__runtimeEvidenceFetchGuard;
  if (saved !== undefined) {
    if (saved.hadOwn) {
      (globalThis as unknown as Record<string, unknown>)['fetch'] = saved.original;
    } else {
      delete (globalThis as unknown as Record<string, unknown>)['fetch'];
    }
    delete holder.__runtimeEvidenceFetchGuard;
  }
});

it('control catches invented plans: real 50 initial and 158 expanded outcomes with 146 vision and 12 barcode', async () => {
  const f = await makeRuntimeEvidenceData();
  expect(f.plans.initial).toHaveLength(50);
  expect(f.plans.LOW).toHaveLength(158);
  expect(f.plans.MEDIUM).toHaveLength(158);
  for (const profile of ['LOW', 'MEDIUM'] as const) {
    const plan = f.plans[profile];
    const barcode = plan.filter((r) => r.scanMode === 'barcode');
    const vision = plan.filter((r) => r.scanMode !== 'barcode');
    expect(barcode).toHaveLength(12);
    expect(vision).toHaveLength(146);
  }
  expect(sdkGuard.constructCalls).toBe(0);
  expect(fetchGuard.attemptCalls).toBe(0);
});

it('control catches hash drift: identity hashes equal pinned committed digests', async () => {
  const f = await makeRuntimeEvidenceData();
  expect(f.context.identity.protocolVersion).toBe('v1');
  expect(f.context.identity.provider).toBe('vertex-ai');
  expect(f.context.identity.model).toBe('gemini-3.8-flash');
  expect(f.context.identity.plannedImageCalls).toBe(146);
  expect(f.context.identity.hardCeiling).toBe(300);
  expect(f.context.identity.publicManifestHash).toBe(CALIBRATION_PUBLIC_MANIFEST_HASH);
  expect(f.context.identity.datasetHash).toBe(CALIBRATION_PUBLIC_MANIFEST_HASH);
  expect(f.context.identity.promptHash).toBe(CALIBRATION_PROMPT_HASH);
  expect(f.context.identity.responseSchemaHash).toBe(CALIBRATION_RESPONSE_SCHEMA_HASH);
  expect(f.context.identity.sourceLockHash).toBe(CALIBRATION_SOURCE_LOCK_SHA256);
  expect(f.context.identity.manifestHash).toBe(CALIBRATION_MANIFEST_SHA256);
  expect(f.context.identity.snapshotLockHash).toBe(CALIBRATION_OFF_SNAPSHOT_LOCK_SHA256);
  expect(f.context.identity.historicalReferenceHash).toBe(CALIBRATION_HISTORICAL_REFERENCE_SHA256);
  expect(f.context.identity.functionsTreeId).toMatch(/^[0-9a-f]{40}$/);
  expect(f.context.identity.implementationCommit).toMatch(/^[0-9a-f]{40}$/);
  expect(sdkGuard.constructCalls).toBe(0);
  expect(fetchGuard.attemptCalls).toBe(0);
});

it('control catches invented keys: first preflight LOW key uses the real first development case', async () => {
  const f = await makeRuntimeEvidenceData();
  expect(f.key.stage).toBe('preflight');
  expect(f.key.profile).toBe('LOW');
  expect(f.key.caseId).toBe(f.context.firstDevelopmentCaseId);
  expect(f.key.sampleIndex).toBe(1);
  const firstDev = f.plans.initial.find((r) => r.key.stage === 'development' && r.key.profile === 'LOW');
  expect(firstDev).toBeDefined();
  expect(firstDev?.key.caseId).toBe(f.context.firstDevelopmentCaseId);
  expect(firstDev?.key.sampleIndex).toBe(1);
  const preflightLow = f.plans.initial.find((r) => r.key.stage === 'preflight' && r.key.profile === 'LOW');
  expect(preflightLow).toBeDefined();
  expect(preflightLow?.key.caseId).toBe(f.context.firstDevelopmentCaseId);
  expect(sdkGuard.constructCalls).toBe(0);
  expect(fetchGuard.attemptCalls).toBe(0);
});

it('control catches frozen caller records: header and start are mutable owned copies', async () => {
  const f = await makeRuntimeEvidenceData();
  expect(f.header.type).toBe('protocol_identity');
  expect(f.header.reportAuthority).toBe('verified_artifacts_v1');
  expect(f.header.runtimeEvidenceVersion).toBe(1);
  expect(f.header.at).toBe(f.context.owner.acquiredAt);
  expect(f.header.identity).toEqual(f.context.identity);
  expect(f.header.owner).toEqual(f.context.owner);
  expect(f.header.identity === (f.context.identity as unknown)).toBe(false);
  expect(f.header.owner === (f.context.owner as unknown)).toBe(false);
  expect(Object.isFrozen(f.header)).toBe(false);
  expect(Object.isFrozen(f.key)).toBe(false);
  expect(Object.isFrozen(f.start)).toBe(false);
  expect(f.start.type).toBe('runtime_attempt_started');
  expect(f.start.version).toBe(1);
  expect(f.start.sequence).toBe(1);
  expect(f.start.attempt).toBe(1);
  expect(f.start.at).toBe(f.context.owner.acquiredAt);
  expect(f.start.key).toEqual(f.key);
  expect(f.start.owner).toEqual(f.context.owner);
  const before = f.context.owner.acquiredAt;
  (f.start as unknown as Record<string, unknown>)['sequence'] = 999;
  expect(f.context.owner.acquiredAt).toBe(before);
  expect(sdkGuard.constructCalls).toBe(0);
  expect(fetchGuard.attemptCalls).toBe(0);
});

it('control catches reordered prefix loss: expanded plans start with the exact initial key order', async () => {
  const f = await makeRuntimeEvidenceData();
  const keyId = (r: { key: { stage: string; profile: string; caseId: string; sampleIndex: number } }) =>
    `${r.key.stage}|${r.key.profile}|${r.key.caseId}|${r.key.sampleIndex}`;
  const initialIds = f.plans.initial.map(keyId);
  const lowIds = f.plans.LOW.map(keyId);
  const mediumIds = f.plans.MEDIUM.map(keyId);
  expect(lowIds.slice(0, 50)).toEqual(initialIds);
  expect(mediumIds.slice(0, 50)).toEqual(initialIds);
  for (const plan of [f.plans.initial, f.plans.LOW, f.plans.MEDIUM]) {
    const ids = plan.map(keyId);
    expect(new Set(ids).size).toBe(ids.length);
  }
  expect(sdkGuard.constructCalls).toBe(0);
  expect(fetchGuard.attemptCalls).toBe(0);
});

it('control catches barcode miscount: 12 barcode keys per expanded profile across benchmark cases', async () => {
  const f = await makeRuntimeEvidenceData();
  for (const profile of ['LOW', 'MEDIUM'] as const) {
    const plan = f.plans[profile];
    const barcodeKeys = plan.filter((r) => r.scanMode === 'barcode');
    expect(barcodeKeys).toHaveLength(12);
    const byCase = new Map<string, Set<number>>();
    for (const row of barcodeKeys) {
      expect(row.key.stage).toBe('benchmark');
      expect(row.key.profile).toBe(profile);
      let samples = byCase.get(row.key.caseId);
      if (samples === undefined) {
        samples = new Set();
        byCase.set(row.key.caseId, samples);
      }
      samples.add(row.key.sampleIndex);
    }
    expect(byCase.size).toBe(4);
    for (const samples of byCase.values()) {
      expect([...samples].sort()).toEqual([1, 2, 3]);
    }
  }
  expect(sdkGuard.constructCalls).toBe(0);
  expect(fetchGuard.attemptCalls).toBe(0);
});

it('control catches network use: building the fixture performs zero fetch and zero SDK construction', async () => {
  expect(sdkGuard.constructCalls).toBe(0);
  expect(fetchGuard.attemptCalls).toBe(0);
  await makeRuntimeEvidenceData();
  expect(sdkGuard.constructCalls).toBe(0);
  expect(fetchGuard.attemptCalls).toBe(0);
});
