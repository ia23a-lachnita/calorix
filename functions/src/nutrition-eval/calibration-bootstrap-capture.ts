/**
 * Pure version-neutral bootstrap capture validators (Task 2 extraction).
 *
 * Leaf module with no runtime ledger/bootstrap/orchestrator/SDK dependency:
 * only `node:path` and the typed fatal error. Shared by the v1 bootstrap and
 * the v2 protocol bindings so both import the identical validation instead
 * of risking a prospective import cycle through the v1 bootstrap module.
 */
import { isAbsolute, resolve } from 'node:path';
import { CalibrationFatalError } from './fatal-error';

function bootstrapFatal(message: string): CalibrationFatalError {
  return new CalibrationFatalError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const HEX40 = /^[0-9a-f]{40}$/;
const CANONICAL_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function assertValidBaseDir(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0 || !isAbsolute(value)) {
    throw bootstrapFatal('calibration:bootstrap-input-invalid:baseDir');
  }
  if (resolve(value) !== value) {
    throw bootstrapFatal('calibration:bootstrap-input-invalid:baseDir');
  }
}

function readGitField(state: Record<string, unknown>, field: string): unknown {
  return state[field];
}

interface ValidatedGitSnapshot {
  headCommit: string;
  implementationCommit: string;
  functionsTreeId: string;
  dirtyPaths: string[];
}

export function validateGitSnapshot(raw: unknown): ValidatedGitSnapshot {
  if (!isRecord(raw)) {
    throw bootstrapFatal('calibration:bootstrap-git-state-invalid');
  }
  let head: unknown;
  let impl: unknown;
  let tree: unknown;
  let dirty: unknown;
  try {
    head = readGitField(raw, 'headCommit');
    impl = readGitField(raw, 'implementationCommit');
    tree = readGitField(raw, 'functionsTreeId');
    dirty = readGitField(raw, 'dirtyPaths');
  } catch {
    throw bootstrapFatal('calibration:bootstrap-git-failed');
  }
  if (typeof head !== 'string' || !HEX40.test(head)) {
    throw bootstrapFatal('calibration:bootstrap-git-state-invalid:headCommit');
  }
  if (typeof impl !== 'string' || !HEX40.test(impl)) {
    throw bootstrapFatal('calibration:bootstrap-git-state-invalid:implementationCommit');
  }
  if (typeof tree !== 'string' || !HEX40.test(tree)) {
    throw bootstrapFatal('calibration:bootstrap-git-state-invalid:functionsTreeId');
  }
  if (!Array.isArray(dirty)) {
    throw bootstrapFatal('calibration:bootstrap-git-state-invalid:dirtyPaths');
  }
  let rawLength: unknown;
  try {
    rawLength = (dirty as readonly unknown[]).length;
  } catch {
    throw bootstrapFatal('calibration:bootstrap-git-failed');
  }
  if (typeof rawLength !== 'number' || !Number.isSafeInteger(rawLength) || rawLength < 0) {
    throw bootstrapFatal('calibration:bootstrap-git-failed');
  }
  const dirtyCount: number = rawLength;
  const clonedDirty: string[] = [];
  for (let index = 0; index < dirtyCount; index += 1) {
    let entry: unknown;
    try {
      entry = (dirty as readonly unknown[])[index];
    } catch {
      throw bootstrapFatal('calibration:bootstrap-git-failed');
    }
    if (typeof entry !== 'string' || entry.length === 0) {
      throw bootstrapFatal('calibration:bootstrap-git-state-invalid:dirtyPaths');
    }
    clonedDirty.push(entry);
  }
  return {
    headCommit: head,
    implementationCommit: impl,
    functionsTreeId: tree,
    dirtyPaths: clonedDirty,
  };
}

export function assertCleanFunctionsTree(dirtyPaths: readonly string[]): void {
  for (const entry of dirtyPaths) {
    if (entry === 'functions' || entry.startsWith('functions/')) {
      throw bootstrapFatal('calibration:bootstrap-git-dirty');
    }
  }
}

interface ValidatedOwner {
  hostname: string;
  bootId: string;
  pid: number;
  startTicks: number;
  acquiredAt: string;
}

export function validateOwner(raw: unknown): ValidatedOwner {
  if (!isRecord(raw)) {
    throw bootstrapFatal('calibration:bootstrap-owner-invalid');
  }
  let host: unknown;
  let boot: unknown;
  let pid: unknown;
  let ticks: unknown;
  let acquired: unknown;
  try {
    host = raw['hostname'];
    boot = raw['bootId'];
    pid = raw['pid'];
    ticks = raw['startTicks'];
    acquired = raw['acquiredAt'];
  } catch {
    throw bootstrapFatal('calibration:bootstrap-owner-failed');
  }
  if (typeof host !== 'string' || host.trim().length === 0) {
    throw bootstrapFatal('calibration:bootstrap-owner-invalid:hostname');
  }
  if (typeof boot !== 'string' || boot.trim().length === 0) {
    throw bootstrapFatal('calibration:bootstrap-owner-invalid:bootId');
  }
  if (typeof pid !== 'number' || !Number.isSafeInteger(pid) || pid <= 0) {
    throw bootstrapFatal('calibration:bootstrap-owner-invalid:pid');
  }
  if (typeof ticks !== 'number' || !Number.isSafeInteger(ticks) || ticks <= 0) {
    throw bootstrapFatal('calibration:bootstrap-owner-invalid:startTicks');
  }
  if (typeof acquired !== 'string' || !CANONICAL_ISO.test(acquired)) {
    throw bootstrapFatal('calibration:bootstrap-owner-invalid:acquiredAt');
  }
  const parsed = Date.parse(acquired);
  if (!Number.isFinite(parsed) || new Date(acquired).toISOString() !== acquired) {
    throw bootstrapFatal('calibration:bootstrap-owner-invalid:acquiredAt');
  }
  return { hostname: host, bootId: boot, pid, startTicks: ticks, acquiredAt: acquired };
}
