import type { CalibrationIdentity, CalibrationLedgerDeps, CalibrationOwner, JournalEntry, ReservationKey } from '../../../src/nutrition-eval/calibration';

export const V1_ROOT = '.nutrition-eval/calibration/calorix-gemini-38-calibration-v1/';
export const V2_ROOT = '.nutrition-eval/calibration/calorix-gemini-38-calibration-v2/';
export const key = (index = 0): ReservationKey => ({ stage: 'preflight', profile: 'LOW',
  caseId: `calibration-dish_${9001000000 + index}`, sampleIndex: 1 });
export function legacyIdentity(): CalibrationIdentity {
  return { protocolVersion: 'v1', provider: 'vertex-ai', model: 'gemini-3.8-flash',
    implementationCommit: 'a'.repeat(40), functionsTreeId: 'b'.repeat(40),
    datasetHash: '1'.repeat(64), promptHash: '2'.repeat(64), responseSchemaHash: '3'.repeat(64),
    sourceLockHash: '4'.repeat(64), manifestHash: '5'.repeat(64), publicManifestHash: '6'.repeat(64),
    snapshotLockHash: '7'.repeat(64), historicalReferenceHash: '8'.repeat(64), plannedImageCalls: 146, hardCeiling: 300 };
}

// Persistence is an injected memory port. Counts are always read from the real
// ledger, never implemented by this fixture. No provider/client exists here.
export function memoryWorld(root = V2_ROOT) {
  const events: unknown[] = []; const journals: JournalEntry[] = [];
  const calls: string[] = []; const writes: string[] = [];
  let lock: CalibrationOwner | undefined;
  const world = { root, events, journals, calls, writes };
  const write = (name: string) => { calls.push(name); writes.push(name); };
  const deps: CalibrationLedgerDeps = {
    getRoot: () => { calls.push('getRoot'); return world.root; },
    readLock: () => { calls.push('readLock'); return lock; },
    writeLockExclusive: owner => { write('writeLockExclusive'); if (lock) throw new Error('fixture lock held'); lock = structuredClone(owner); },
    archiveLock: () => { write('archiveLock'); lock = undefined; },
    removeLock: () => { write('removeLock'); lock = undefined; },
    appendLedgerEvent: event => { write('appendLedgerEvent'); events.push(structuredClone(event)); },
    fsyncLedgerFile: () => write('fsyncLedgerFile'), fsyncLedgerDir: () => write('fsyncLedgerDir'),
    appendJournal: entry => { write('appendJournal'); journals.push(structuredClone(entry)); },
    fsyncJournalFile: () => write('fsyncJournalFile'), fsyncJournalDir: () => write('fsyncJournalDir'),
    probeOwnerLiveness: () => 'live', nowIso: () => '2026-10-31T00:00:00.000Z',
    readLedgerEvents: () => { calls.push('readLedgerEvents'); return structuredClone(events); },
    readJournalEntries: () => { calls.push('readJournalEntries'); return structuredClone(journals); },
  };
  return { ...world, get root() { return world.root; }, set root(value: string) { world.root = value; }, deps };
}
