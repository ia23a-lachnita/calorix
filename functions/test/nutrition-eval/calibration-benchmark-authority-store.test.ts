import { createHash } from 'node:crypto';
import {
  chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync,
  readFileSync, renameSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CALIBRATION_ROOT } from '../../src/nutrition-eval/calibration';
import type { CalibrationOwner } from '../../src/nutrition-eval/calibration';
import {
  createBenchmarkAuthorityFileCalibrationLedgerDeps,
  createRuntimeEvidenceFileCalibrationLedgerDeps,
} from '../../src/nutrition-eval/calibration-file-store';
import {
  createCalibrationBootstrapReadDeps, prepareCalibrationBootstrapContext,
} from '../../src/nutrition-eval/calibration-bootstrap';
import {
  prepareNativeCalibrationBenchmarkAuthorityLedger, prepareNativeCalibrationRuntimeEvidenceLedger,
} from '../../src/nutrition-eval/calibration-runtime-evidence-ledger';
import { buildBenchmarkTemplate, copyBenchmarkTemplate } from './calibration-benchmark-authority-fixtures';
import type { BenchmarkTemplate } from './calibration-benchmark-authority-fixtures';

const roots: string[] = [];
const owner: CalibrationOwner = {
  hostname: 'preparation-store-test', bootId: 'preparation-store-boot',
  pid: 12345, startTicks: 6789, acquiredAt: '2026-10-20T00:00:00.000Z',
};
function base(): string {
  const root = mkdtempSync(join(tmpdir(), 'calorix-benchmark-store-'));
  roots.push(root);
  return root;
}
function inventory(root: string): Record<string, { kind: string; mode: number; sha?: string }> {
  const entries: Record<string, { kind: string; mode: number; sha?: string }> = {};
  function visit(path: string, name: string): void {
    const stat = lstatSync(path);
    const kind = stat.isSymbolicLink() ? 'symlink' : stat.isDirectory() ? 'directory' : 'file';
    entries[name] = { kind, mode: stat.mode };
    if (kind === 'file') entries[name]!.sha = createHash('sha256').update(readFileSync(path)).digest('hex');
    if (kind === 'directory') for (const item of readdirSync(path)) visit(join(path, item), `${name}/${item}`);
  }
  visit(root, '.');
  return entries;
}
function privateRoot(root: string): string {
  const path = resolve(root, CALIBRATION_ROOT);
  mkdirSync(path, { recursive: true, mode: 0o700 });
  chmodSync(path, 0o700);
  return path;
}
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

describe.sequential('benchmark preparation store', () => {
  it.each(['absent', 'partial'] as const)('reads an %s chain repeatedly without creating directories or invoking mutation hooks', (shape) => {
    const root = base();
    if (shape === 'partial') mkdirSync(join(root, '.nutrition-eval'), { mode: 0o700 });
    const effects: string[] = [];
    const before = inventory(root);
    const deps = createBenchmarkAuthorityFileCalibrationLedgerDeps(root, owner, {
      fdWriteSync: () => { effects.push('write'); throw new Error('unexpected write'); },
      fdFsyncSync: () => { effects.push('fsync'); },
      fdCloseSync: () => { effects.push('close'); },
      fsyncDirSync: () => { effects.push('directory-fsync'); },
    });
    for (let i = 0; i < 2; i += 1) {
      expect(deps.readJournalEntries()).toEqual([]);
      expect(deps.readLedgerEvents()).toEqual([]);
      expect(deps.readLock()).toBeUndefined();
      expect(inventory(root)).toEqual(before);
      expect(effects).toEqual([]);
    }
    expect(existsSync(resolve(root, CALIBRATION_ROOT))).toBe(false);
  });

  it('reads actual existing private files unchanged', () => {
    const root = base();
    const canonical = privateRoot(root);
    writeFileSync(join(canonical, 'ledger.json'), '[]\n', { mode: 0o600 });
    writeFileSync(join(canonical, 'journal.json'), '[]\n', { mode: 0o600 });
    const before = inventory(root);
    const deps = createBenchmarkAuthorityFileCalibrationLedgerDeps(root, owner);
    expect(deps.readLedgerEvents()).toEqual([]);
    expect(deps.readJournalEntries()).toEqual([]);
    expect(inventory(root)).toEqual(before);
  });

  it('preserves the old native helper creation behavior separately', () => {
    const root = base();
    expect(existsSync(resolve(root, CALIBRATION_ROOT))).toBe(false);
    const old = createRuntimeEvidenceFileCalibrationLedgerDeps(root, owner);
    expect(old.readLedgerEvents()).toEqual([]);
    expect(existsSync(resolve(root, CALIBRATION_ROOT))).toBe(true);
    expect(lstatSync(resolve(root, CALIBRATION_ROOT)).mode & 0o7777).toBe(0o700);
  });

  it('preserves private modes and exact bytes when the real helper copies a released minimal tree', () => {
    const source = base();
    const canonical = privateRoot(source);
    for (const name of ['journal.json', 'ledger.json']) {
      writeFileSync(join(canonical, name), '[]\n', { mode: 0o600 });
    }
    expect(lstatSync(canonical).mode & 0o7777).toBe(0o700);
    expect(existsSync(join(canonical, 'lock.json'))).toBe(false);
    // Only a copy-construction regression; this empty tree is not authority evidence.
    const copy = copyBenchmarkTemplate(roots, {
      baseDir: source, profile: 'MEDIUM',
      eventBytes: Buffer.from('[]\n'), journalBytes: Buffer.from('[]\n'),
    });
    expect(lstatSync(resolve(copy, CALIBRATION_ROOT)).mode & 0o7777).toBe(0o700);
    for (const name of ['journal.json', 'ledger.json']) {
      const path = resolve(copy, CALIBRATION_ROOT, name);
      expect(lstatSync(path).mode & 0o7777).toBe(0o600);
      expect(lstatSync(path).nlink).toBe(1);
      expect(readFileSync(path, 'utf8')).toBe('[]\n');
    }
    const deps = createRuntimeEvidenceFileCalibrationLedgerDeps(copy, owner);
    expect(deps.readJournalEntries()).toEqual([]);
    expect(deps.readLedgerEvents()).toEqual([]);
    expect(inventory(copy)).toEqual(inventory(source));
  });

  it('creates a real owner lock through the existing mutation path after absent reads', () => {
    const root = base();
    const deps = createBenchmarkAuthorityFileCalibrationLedgerDeps(root, owner);
    expect(deps.readLedgerEvents()).toEqual([]);
    expect(existsSync(resolve(root, CALIBRATION_ROOT))).toBe(false);
    deps.writeLockExclusive(owner);
    const canonical = resolve(root, CALIBRATION_ROOT);
    expect(JSON.parse(readFileSync(join(canonical, 'lock.json'), 'utf8'))).toEqual(owner);
    expect(lstatSync(canonical).mode & 0o7777).toBe(0o700);
    expect(lstatSync(join(canonical, 'lock.json')).mode & 0o7777).toBe(0o600);
    expect(deps.readLock()).toEqual(owner);
    deps.removeLock(owner);
    expect(existsSync(join(canonical, 'lock.json'))).toBe(false);
  });

  it('rejects the wrong acquisition owner before creating a missing chain', () => {
    const root = base();
    const deps = createBenchmarkAuthorityFileCalibrationLedgerDeps(root, owner);
    expect(deps.readLock()).toBeUndefined();
    const before = inventory(root);
    expect(() => deps.writeLockExclusive({ ...owner, pid: owner.pid + 1 })).toThrow('calibration:runtime-evidence-storage-failed');
    expect(inventory(root)).toEqual(before);
    expect(() => deps.readLedgerEvents()).toThrow('calibration:runtime-evidence-storage-failed');
    expect(inventory(root)).toEqual(before);
  });

  it.each(['symlink', 'file'] as const)('rejects an intermediate %s without following it', (kind) => {
    const root = base();
    const other = base();
    if (kind === 'symlink') symlinkSync(other, join(root, '.nutrition-eval'), 'dir');
    else writeFileSync(join(root, '.nutrition-eval'), 'not a directory', { mode: 0o600 });
    const before = inventory(root);
    const outside = inventory(other);
    const deps = createBenchmarkAuthorityFileCalibrationLedgerDeps(root, owner);
    expect(() => deps.readLedgerEvents()).toThrow('calibration:runtime-evidence-storage-failed');
    expect(inventory(root)).toEqual(before);
    expect(inventory(other)).toEqual(outside);
    expect(() => deps.readJournalEntries()).toThrow('calibration:runtime-evidence-storage-failed');
  });

  it.each(['symlink', 'directory', 'public-mode'] as const)('rejects a malformed %s ledger leaf', (kind) => {
    const root = base();
    const canonical = privateRoot(root);
    const path = join(canonical, 'ledger.json');
    if (kind === 'directory') mkdirSync(path, { mode: 0o700 });
    else if (kind === 'symlink') {
      const other = base();
      writeFileSync(join(other, 'target'), '[]', { mode: 0o600 });
      symlinkSync(join(other, 'target'), path);
    } else writeFileSync(path, '[]', { mode: 0o644 });
    const before = inventory(root);
    const deps = createBenchmarkAuthorityFileCalibrationLedgerDeps(root, owner);
    expect(() => deps.readLedgerEvents()).toThrow('calibration:runtime-evidence-storage-failed');
    expect(inventory(root)).toEqual(before);
  });

  it('rejects a nonprivate canonical root without chmod repair', () => {
    const root = base();
    chmodSync(privateRoot(root), 0o755);
    const before = inventory(root);
    const deps = createBenchmarkAuthorityFileCalibrationLedgerDeps(root, owner);
    expect(() => deps.readJournalEntries()).toThrow('calibration:runtime-evidence-storage-failed');
    expect(inventory(root)).toEqual(before);
  });

  it('retains observed ancestor identity across missing reads and acquisition', () => {
    const root = base();
    const ancestor = join(root, '.nutrition-eval');
    mkdirSync(ancestor, { mode: 0o700 });
    const deps = createBenchmarkAuthorityFileCalibrationLedgerDeps(root, owner);
    expect(deps.readJournalEntries()).toEqual([]);
    renameSync(ancestor, `${ancestor}.retained`);
    mkdirSync(ancestor, { mode: 0o700 });
    const before = inventory(root);
    expect(() => deps.writeLockExclusive(owner)).toThrow('calibration:runtime-evidence-storage-failed');
    expect(inventory(root)).toEqual(before);
    expect(() => deps.readLedgerEvents()).toThrow('calibration:runtime-evidence-storage-failed');
    expect(inventory(root)).toEqual(before);
  });
});

let template: Readonly<BenchmarkTemplate> | undefined;
function readyTemplate(): Readonly<BenchmarkTemplate> {
  if (template === undefined) throw new Error('genuine full-history foundation did not complete');
  return template;
}
describe.sequential('full-history preparation diagnosis', () => {
  it('builds a genuine released MEDIUM history before reopening controls', async () => {
    template = await buildBenchmarkTemplate(roots, 'MEDIUM');
    const events = JSON.parse(template.eventBytes.toString('utf8')) as { type: string }[];
    expect(events.filter((row) => row.type === 'runtime_attempt_finished')).toHaveLength(158);
    expect(events.filter((row) => row.type === 'reserved')).toHaveLength(146);
    expect(events.filter((row) => row.type === 'non_reservation_result')).toHaveLength(12);
    expect(events.filter((row) => row.type === 'runtime_report_bound')).toHaveLength(6);
    expect(existsSync(resolve(template.baseDir, CALIBRATION_ROOT, 'lock.json'))).toBe(false);
  }, 600000);

  it('reads the exact copied full history using the unchanged native store', async () => {
    const original = readyTemplate();
    const root = copyBenchmarkTemplate(roots, original);
    const context = await prepareCalibrationBootstrapContext(createCalibrationBootstrapReadDeps(root));
    const before = inventory(resolve(root, CALIBRATION_ROOT));
    expect(readFileSync(resolve(root, CALIBRATION_ROOT, 'ledger.json'))).toEqual(original.eventBytes);
    expect(readFileSync(resolve(root, CALIBRATION_ROOT, 'journal.json'))).toEqual(original.journalBytes);
    expect(lstatSync(resolve(root, CALIBRATION_ROOT)).mode & 0o7777).toBe(0o700);
    for (const name of ['journal.json', 'ledger.json']) {
      const stat = lstatSync(resolve(root, CALIBRATION_ROOT, name));
      expect(stat.isFile()).toBe(true);
      expect(stat.isSymbolicLink()).toBe(false);
      expect(stat.mode & 0o7777).toBe(0o600);
      expect(stat.nlink).toBe(1);
    }
    const deps = createRuntimeEvidenceFileCalibrationLedgerDeps(root, context.owner);
    expect(deps.readJournalEntries()).toHaveLength(146);
    const events = deps.readLedgerEvents() as { type: string; identity?: unknown }[];
    expect(events[0]!.identity).toEqual(context.identity);
    expect(events.filter((row) => row.type === 'runtime_report_bound')).toHaveLength(6);
    expect(inventory(resolve(root, CALIBRATION_ROOT))).toEqual(before);
  }, 600000);

  it.each(['old', 'benchmark'] as const)('constructs the %s native preparer over a valid full copy without effects', async (kind) => {
    const root = copyBenchmarkTemplate(roots, readyTemplate());
    const context = await prepareCalibrationBootstrapContext(createCalibrationBootstrapReadDeps(root));
    const before = inventory(resolve(root, CALIBRATION_ROOT));
    const ledger = kind === 'old'
      ? await prepareNativeCalibrationRuntimeEvidenceLedger({ context })
      : await prepareNativeCalibrationBenchmarkAuthorityLedger({ context });
    expect(inventory(resolve(root, CALIBRATION_ROOT))).toEqual(before);
    expect(() => ledger.getCompletedStages()).toThrow(); // provisional, not authority
    expect(inventory(resolve(root, CALIBRATION_ROOT))).toEqual(before);
  }, 600000);
});
