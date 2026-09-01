import { readFile, realpath } from 'fs/promises';
import { dirname } from 'path';

import { loadVerifiedCaseImage } from './assets';
import { parseNutritionEvalManifest } from './schema';

import type { NutritionEvalManifest } from './schema';

const PRIVATE_OVERLAY_UNAVAILABLE = 'Private nutrition evaluation overlay is unavailable.';

export class PrivateOverlayError extends Error {
  readonly code = 'private_case_unavailable';

  constructor(message = PRIVATE_OVERLAY_UNAVAILABLE) {
    super(message);
    this.name = 'PrivateOverlayError';
  }
}

export interface PrivateOverlay {
  root: string;
  manifest: NutritionEvalManifest;
}

function unavailable(): PrivateOverlayError {
  return new PrivateOverlayError();
}

export async function loadPrivateOverlay(manifestPath: string): Promise<PrivateOverlay> {
  try {
    const canonicalManifestPath = await realpath(manifestPath);
    const root = await realpath(dirname(canonicalManifestPath));
    const manifest = parseNutritionEvalManifest(JSON.parse(await readFile(canonicalManifestPath, 'utf8')));
    if (manifest.cases.some((evalCase) => evalCase.visibility !== 'private')) throw unavailable();

    for (const evalCase of manifest.cases) {
      await loadVerifiedCaseImage(evalCase, { cacheRoot: root, privateRoot: root });
    }

    return { root, manifest };
  } catch (error) {
    if (error instanceof PrivateOverlayError) throw error;
    throw unavailable();
  }
}

function hasDuplicates(values: readonly string[]): boolean {
  return values.length !== new Set(values).size;
}

export function mergePrivateOverlay(
  publicManifest: NutritionEvalManifest,
  privateManifest: NutritionEvalManifest,
): NutritionEvalManifest {
  const cases = [...publicManifest.cases, ...privateManifest.cases];
  if (hasDuplicates(cases.map((evalCase) => evalCase.id))
    || hasDuplicates(cases.map((evalCase) => evalCase.source.objectId))) {
    throw new PrivateOverlayError('Private overlay contains duplicate case identity.');
  }

  try {
    return parseNutritionEvalManifest({
      version: publicManifest.version,
      datasetId: publicManifest.datasetId,
      cases,
    });
  } catch {
    throw unavailable();
  }
}
