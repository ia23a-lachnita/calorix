import { createHash } from 'crypto';
import { readFile, writeFile, rename, unlink, mkdir } from 'fs/promises';
import { dirname, join } from 'path';

import { inspectImage } from './image-metadata';

import type { NutritionEvalCase } from './schema';

export class DatasetError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'DatasetError';
    this.code = code;
  }
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function extensionFor(mediaType: string): string {
  return mediaType === 'image/jpeg' ? 'jpg' : 'png';
}

export interface LoadCaseImageOptions {
  cacheRoot: string;
  fetchFn?: (url: string) => Promise<Response>;
  privateRoot?: string;
}

export async function loadVerifiedCaseImage(
  evalCase: NutritionEvalCase,
  options: LoadCaseImageOptions,
): Promise<Uint8Array> {
  const { cacheRoot, fetchFn, privateRoot } = options;
  const ext = extensionFor(evalCase.image.mediaType);
  const cachePath = join(cacheRoot, `${evalCase.image.sha256}.${ext}`);

  if (evalCase.visibility === 'private') {
    if (!privateRoot) throw new DatasetError('dataset_invalid_config', 'privateRoot required for private cases');
    const img = evalCase.image as { path: string };
    const filePath = join(privateRoot, img.path);
    let bytes: Uint8Array;
    try {
      const buf = await readFile(filePath);
      bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } catch {
      throw new DatasetError('dataset_fetch_failed', `Cannot read private file: ${img.path}`);
    }
    verifyBytes(bytes, evalCase);
    return bytes;
  }

  const img = evalCase.image as { url: string };

  try {
    const existing = await readFile(cachePath);
    const cached = new Uint8Array(existing.buffer, existing.byteOffset, existing.byteLength);
    const meta = inspectImage(cached);
    if (meta.mediaType !== evalCase.image.mediaType)
      throw new DatasetError('dataset_media_mismatch', `Cached media type ${meta.mediaType} !== ${evalCase.image.mediaType}`);
    if (meta.width !== evalCase.image.width || meta.height !== evalCase.image.height)
      throw new DatasetError('dataset_dimension_mismatch', `Cached dimensions ${meta.width}x${meta.height} !== ${evalCase.image.width}x${evalCase.image.height}`);
    if (sha256Hex(cached) !== evalCase.image.sha256)
      throw new DatasetError('dataset_checksum_mismatch', 'Cached file hash mismatch');
    return cached;
  } catch (e) {
    if (e instanceof DatasetError) throw e;
  }

  if (!fetchFn) throw new DatasetError('dataset_invalid_config', 'fetchFn required for public cases');
  const response = await fetchFn(img.url);
  if (!response.ok) {
    throw new DatasetError('dataset_fetch_failed', `HTTP ${response.status}: ${response.statusText}`);
  }
  const buf = await response.arrayBuffer();
  const bytes = new Uint8Array(buf);
  verifyBytes(bytes, evalCase);

  const partialPath = `${cachePath}.partial-${process.pid}`;
  try {
    await mkdir(dirname(partialPath), { recursive: true });
    await writeFile(partialPath, bytes);
    await rename(partialPath, cachePath);
  } catch (err) {
    try { await unlink(partialPath); } catch { /* best effort */ }
    throw new DatasetError('dataset_write_failed', `Cache write failed: ${err}`);
  }

  return bytes;
}

function verifyBytes(bytes: Uint8Array, evalCase: NutritionEvalCase): void {
  const hash = sha256Hex(bytes);
  if (hash !== evalCase.image.sha256) {
    throw new DatasetError('dataset_checksum_mismatch', `SHA-256 mismatch: expected ${evalCase.image.sha256}, got ${hash}`);
  }
  const meta = inspectImage(bytes);
  if (meta.mediaType !== evalCase.image.mediaType) {
    throw new DatasetError('dataset_media_mismatch', `Media type mismatch: declared ${evalCase.image.mediaType}, actual ${meta.mediaType}`);
  }
  if (meta.width !== evalCase.image.width || meta.height !== evalCase.image.height) {
    throw new DatasetError('dataset_dimension_mismatch', `Dimension mismatch: declared ${evalCase.image.width}x${evalCase.image.height}, actual ${meta.width}x${meta.height}`);
  }
}
