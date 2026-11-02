import fs from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

function fail(message: string): never { throw new Error('calibration:v2-input:' + message); }

// Fixed paths with per-segment symlink rejection. Like the existing offline
// reader, this is not a guarantee against a hostile local filesystem race.
async function confined(root: string, path: string): Promise<void> {
  const rel = relative(root, path);
  if (rel.startsWith('..') || isAbsolute(rel)) fail('unsafe path');
  let current = root;
  for (const part of ['', ...rel.split('/').filter(Boolean)]) {
    if (part) current = join(current, part);
    if ((await fs.lstat(current)).isSymbolicLink()) fail('symlink path rejected');
  }
}
export async function readCalibrationV2BoundedFile(root: string, relativePath: string, max: number): Promise<Buffer> {
  const path = resolve(root, relativePath);
  await confined(root, path);
  const stat = await fs.stat(path);
  if (!stat.isFile() || stat.size > max) fail('file size bound exceeded');
  const bytes = await fs.readFile(path);
  if (bytes.length > max) fail('file size bound exceeded');
  await confined(root, path);
  return bytes;
}

