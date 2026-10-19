import { readFile } from "fs/promises";
import { resolve } from "path";

import { parseHistoricalReference } from "./historical-reference-pure";
import type { HistoricalReference } from "./historical-reference-pure";

export * from "./historical-reference-pure";

// Runtime loading stays here, isolated from the pure comparison/schema
// module above: this is the only place in the historical-reference surface
// that touches the filesystem or a resolved repository path.

export interface HistoricalReferenceRuntimePaths {
  referencePath: string;
}

export function resolveHistoricalReferenceRuntimePaths(
  moduleDir = __dirname,
): HistoricalReferenceRuntimePaths {
  const repoRoot = resolve(moduleDir, "../../..");
  return {
    referencePath: resolve(repoRoot, "functions/eval/nutrition/historical-reference-v1.json"),
  };
}

export async function defaultLoadHistoricalReference(
  paths: HistoricalReferenceRuntimePaths = resolveHistoricalReferenceRuntimePaths(),
): Promise<unknown> {
  return JSON.parse(await readFile(paths.referencePath, "utf8"));
}

export async function loadHistoricalReference(
  paths: HistoricalReferenceRuntimePaths = resolveHistoricalReferenceRuntimePaths(),
  loadRaw: (paths: HistoricalReferenceRuntimePaths) => Promise<unknown> = defaultLoadHistoricalReference,
): Promise<HistoricalReference> {
  const raw = await loadRaw(paths);
  return parseHistoricalReference(raw);
}
