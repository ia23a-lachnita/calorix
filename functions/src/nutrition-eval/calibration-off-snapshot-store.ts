import { createHash } from 'node:crypto';
import { fetchOffProduct } from '../off-client';
import { CalibrationFatalError } from './fatal-error';
import { CALIBRATION_OFF_SNAPSHOT_LOCK_SHA256 } from './calibration-cli';
import {
  createOffSnapshotStore,
  validateOffSnapshotLock,
  type OffSnapshotLock,
  type OffSnapshotStore,
} from './off-snapshot-store';

export type CalibrationOffSnapshotPath =
  | 'functions/eval/nutrition/off-snapshots/3017624010701.json'
  | 'functions/eval/nutrition/off-snapshots/5449000000996.json'
  | 'functions/eval/nutrition/off-snapshots/4056489686941.json'
  | 'functions/eval/nutrition/off-snapshots/7622210449283.json';

export interface CalibrationOffSnapshotStartupDeps {
  readonly lockText: string;
  readonly readSnapshot: (path: CalibrationOffSnapshotPath) => Promise<string>;
}

const INPUT_INVALID = 'calibration:off-snapshot-input-invalid';
const STARTUP_FAILED = 'calibration:off-snapshot-startup-failed';

const LOCK_PATH = 'functions/eval/nutrition/off-snapshot-lock.json';

const FIXED_PATHS: readonly CalibrationOffSnapshotPath[] = [
  'functions/eval/nutrition/off-snapshots/3017624010701.json',
  'functions/eval/nutrition/off-snapshots/5449000000996.json',
  'functions/eval/nutrition/off-snapshots/4056489686941.json',
  'functions/eval/nutrition/off-snapshots/7622210449283.json',
];

const BARCODE_BY_PATH: Record<CalibrationOffSnapshotPath, string> = {
  'functions/eval/nutrition/off-snapshots/3017624010701.json': '3017624010701',
  'functions/eval/nutrition/off-snapshots/5449000000996.json': '5449000000996',
  'functions/eval/nutrition/off-snapshots/4056489686941.json': '4056489686941',
  'functions/eval/nutrition/off-snapshots/7622210449283.json': '7622210449283',
};

function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Guards the closed own-data dependency record before any effect. Plain
 * objects (including null-prototype) with exactly the own data properties
 * `lockText`/`readSnapshot` are accepted; arrays, non-plain prototypes,
 * inherited overrides, extra or symbol keys, non-enumerable smuggled keys,
 * and accessor properties are rejected. Required values are captured once
 * from the own descriptors — the caller record is never read through a
 * property access, so a virtual get trap cannot fire. Every reflection
 * failure becomes a fresh static causeless fatal; the foreign error is never
 * inspected, rethrown, or probed for message, cause, or prototype.
 */
function guardDeps(deps: unknown): CalibrationOffSnapshotStartupDeps {
  try {
    if (typeof deps !== 'object' || deps === null || Array.isArray(deps)) {
      throw new CalibrationFatalError(INPUT_INVALID);
    }
    const proto = Object.getPrototypeOf(deps);
    if (proto !== Object.prototype && proto !== null) {
      throw new CalibrationFatalError(INPUT_INVALID);
    }
    const keys = Reflect.ownKeys(deps);
    if (
      keys.length !== 2 ||
      !keys.includes('lockText') ||
      !keys.includes('readSnapshot')
    ) {
      throw new CalibrationFatalError(INPUT_INVALID);
    }
    const lockDescriptor = Object.getOwnPropertyDescriptor(deps, 'lockText');
    const readDescriptor = Object.getOwnPropertyDescriptor(deps, 'readSnapshot');
    if (
      lockDescriptor === undefined ||
      readDescriptor === undefined ||
      !('value' in lockDescriptor) ||
      !('value' in readDescriptor)
    ) {
      throw new CalibrationFatalError(INPUT_INVALID);
    }
    const lockText: unknown = lockDescriptor.value;
    const readSnapshot: unknown = readDescriptor.value;
    if (typeof lockText !== 'string' || typeof readSnapshot !== 'function') {
      throw new CalibrationFatalError(INPUT_INVALID);
    }
    return {
      lockText,
      readSnapshot: readSnapshot as CalibrationOffSnapshotStartupDeps['readSnapshot'],
    };
  } catch {
    throw new CalibrationFatalError(INPUT_INVALID);
  }
}

/**
 * Prepares the calibration-only OFF snapshot store from pinned, prevalidated
 * inputs. The caller-supplied lock string and reader are captured before the
 * first await and never re-read from the caller object. All four payloads are
 * read and SHA-verified against the pinned lock before the production parser
 * runs once per barcode through the existing snapshot store, which owns
 * freezing and get-only lookup. Any startup failure becomes a fresh static
 * causeless fatal without raw errors or causes.
 */
export async function prepareCalibrationOffSnapshotStore(
  deps: unknown,
): Promise<OffSnapshotStore> {
  const guarded = guardDeps(deps);
  const lockText = guarded.lockText;
  const readSnapshot = guarded.readSnapshot;
  try {
    if (sha256Hex(lockText) !== CALIBRATION_OFF_SNAPSHOT_LOCK_SHA256) {
      throw new CalibrationFatalError(STARTUP_FAILED);
    }
    const lock = JSON.parse(lockText) as OffSnapshotLock;
    validateOffSnapshotLock(lock);

    const payloads = new Map<CalibrationOffSnapshotPath, string>();
    for (const path of FIXED_PATHS) {
      const payload = await readSnapshot(path);
      if (typeof payload !== 'string') {
        throw new CalibrationFatalError(STARTUP_FAILED);
      }
      payloads.set(path, payload);
    }

    for (const path of FIXED_PATHS) {
      const barcode = BARCODE_BY_PATH[path];
      const expected = lock.snapshots[barcode]?.sha256;
      const payload = payloads.get(path) as string;
      if (typeof expected !== 'string' || sha256Hex(payload) !== expected) {
        throw new CalibrationFatalError(STARTUP_FAILED);
      }
    }

    const verified = new Map<string, string>();
    verified.set(LOCK_PATH, lockText);
    for (const [path, payload] of payloads) verified.set(path, payload);
    const readFile = async (path: string, _encoding: string): Promise<string> => {
      const hit = verified.get(path);
      if (hit === undefined) throw new Error(`unknown internal snapshot path: ${path}`);
      return hit;
    };

    return await createOffSnapshotStore({
      readFile,
      fetchOffProductFn: fetchOffProduct,
    });
  } catch {
    // Reader, parser, and verification failures — including foreign fatals
    // carrying private messages or causes — are always replaced by a fresh
    // static fatal. The foreign error is never inspected, so no secret-bearing
    // message, cause, or trap can escape.
    throw new CalibrationFatalError(STARTUP_FAILED);
  }
}
