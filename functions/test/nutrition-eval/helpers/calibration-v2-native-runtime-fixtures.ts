import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createCalibrationBootstrapReadDeps } from '../../../src/nutrition-eval/calibration-bootstrap';
import { prepareCalibrationV2BootstrapContext } from '../../../src/nutrition-eval/calibration-protocol-bindings';
import { makeMiniGitRepoTask4 } from '../calibration-runtime-evidence-fixtures';
import { v2BootstrapFixture } from './calibration-v2-bootstrap-fixtures';

export const nativeFixtureSha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export function nativeMiniFixture(ownedRoots: string[]) {
  const mini = makeMiniGitRepoTask4(ownedRoots);
  return { mini, nativePorts: createCalibrationBootstrapReadDeps(mini.root) };
}

// Synthetic admission bytes / trusted pin only; Git, owner, committed shared
// reads, admission, registration and later ledger/verifier algorithms are real.
export async function nativeV2RuntimeFixture(ownedRoots: string[], setPin: (sha: string) => void) {
  const base = nativeMiniFixture(ownedRoots);
  const data = v2BootstrapFixture();
  const admit = async () => {
    setPin(data.fixture.input.expectedActivationLockSha256);
    return prepareCalibrationV2BootstrapContext({
      baseDir: base.mini.root,
      readGitState: base.nativePorts.readGitState,
      readOwner: base.nativePorts.readOwner,
      readAdmissionInputs: data.deps.readAdmissionInputs,
      readCommittedSharedFile: (path, commit) => base.nativePorts.readCommittedFile(path, commit),
    });
  };
  const context = await admit();
  return { ...base, context, admit, data,
    root: join(base.mini.root, '.nutrition-eval/calibration/calorix-gemini-38-calibration-v2'),
    v1Root: join(base.mini.root, '.nutrition-eval/calibration/calorix-gemini-38-calibration-v1') };
}

// Read-only inventory excludes atime/ctime; reads can legitimately affect atime.
export function nativeTreeSnapshot(root: string): Record<string, unknown> {
  if (!existsSync(root)) return { exists: false };
  const rows: Record<string, unknown> = {};
  const visit = (path: string, key: string) => {
    const stat = lstatSync(path, { bigint: true });
    rows[key] = { mode: stat.mode.toString(), size: stat.size.toString(), mtimeNs: stat.mtimeNs.toString(),
      ino: stat.ino.toString(), nlink: stat.nlink.toString(),
      ...(stat.isFile() ? { sha256: nativeFixtureSha(readFileSync(path)) } : {}) };
    if (stat.isDirectory()) for (const name of readdirSync(path).sort()) visit(join(path, name), key + '/' + name);
  };
  visit(root, '.'); return rows;
}
