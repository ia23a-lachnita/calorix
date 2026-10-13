/**
 * Calibration runtime capabilities test-only native harness (plan Task 1
 * Step 1, `docs/superpowers/plans/2026-10-13-calibration-runtime-capabilities.md`).
 *
 * Reads only committed input assets through portable `new URL(...,
 * import.meta.url)` paths, constructs prompt/schema strings exactly as the
 * existing canonical-key tests do, prepares all four real OFF products
 * through the production `prepareCalibrationOffSnapshotStore`, and injects
 * the native `createGenAIAdapter` with a fake `GenAIClient`. The returned
 * `deps` are an ordinary mutable test-owned record; no sentinel strings are
 * placed in it. No downloaded images, fabricated snapshot products, real
 * SDK construction, global fetch, subprocess, or cloud call occurs here.
 *
 * Correction pass: the four callback-shaped dependencies (`loadImage`,
 * `reserveImage`, `onModelVersion`, `lookupSnapshot`) now accept and record
 * their real arguments instead of being zero-argument stubs, so behavioral
 * tests can assert the runtime dispatches the correct canonical key/version/
 * barcode rather than merely that "a call happened". `caseMetadata` exposes
 * each case's real committed `image.mediaType` and (for barcode cases) its
 * real committed supplied barcode, read independently from the same owned
 * manifest strings already in `files` -- never recomputed through the
 * not-yet-authored runtime module. `sdkCalls` records the exact arguments
 * the fake lower-transport `generateContent` receives, for native SDK
 * payload assertions (model/contents/config) independent of any "expected"
 * value derived from a new factory.
 *
 * This file intentionally imports nothing from the not-yet-authored
 * `calibration-runtime-capabilities` source module; the behavioral test file
 * imports the factory separately via dynamic `import()`.
 */
import { readFileSync } from 'node:fs';
import { createGenAIAdapter, type GenAIClient } from '../../src/genai-adapter';
import { visionResponseJsonSchema } from '../../src/nutrition-json-schema';
import { MEAL_ANALYSIS_PROMPT, LABEL_ANALYSIS_PROMPT, BARCODE_ANALYSIS_PROMPT } from '../../src/prompts';
import { deriveCanonicalReportOutcomePlan } from '../../src/nutrition-eval/calibration-bootstrap';
import { prepareCalibrationOffSnapshotStore } from '../../src/nutrition-eval/calibration-off-snapshot-store';
import type { CalibrationPreflightFileName } from '../../src/nutrition-eval/calibration-cli';
import type { CalibrationProfile, ReservationKey } from '../../src/nutrition-eval/calibration';

function asset(name: string): string {
  return readFileSync(new URL(`../../eval/nutrition/${name}`, import.meta.url), 'utf8');
}

export interface RuntimeHarnessCallWitness {
  sdk: number;
  transport: number;
}

export interface RuntimeHarnessCaseMetadata {
  readonly mediaType: 'image/png' | 'image/jpeg';
  readonly barcode?: string;
}

export interface RuntimeHarnessSdkCall {
  readonly model: string;
  readonly contents: unknown;
  readonly config: unknown;
}

export interface RuntimeHarnessCapturedKeys {
  readonly loadImageKeys: unknown[];
  readonly reserveImageKeys: unknown[];
  readonly modelVersionCalls: Array<{ key: unknown; version: unknown }>;
  readonly snapshotBarcodes: unknown[];
}

/**
 * Independently re-parses the already-owned, already pinned-hash-verified
 * manifest strings (never the production planner's output) to recover each
 * case's real committed `image.mediaType` and real committed supplied
 * barcode. Used only to assert native SDK dispatch payloads and barcode
 * routing against literal committed data, not against anything the runtime
 * itself computes.
 */
function parseCaseMetadata(
  files: Record<CalibrationPreflightFileName, string>,
): Map<string, RuntimeHarnessCaseMetadata> {
  const map = new Map<string, RuntimeHarnessCaseMetadata>();
  const calibrationManifest = JSON.parse(files['calibration-manifest']) as {
    cases: Array<{ id: string; image: { mediaType: string } }>;
  };
  for (const entry of calibrationManifest.cases) {
    map.set(entry.id, { mediaType: entry.image.mediaType as 'image/png' | 'image/jpeg' });
  }
  const publicManifest = JSON.parse(files['public-manifest']) as {
    cases: Array<{
      id: string;
      image: { mediaType: string };
      suppliedBarcode?: string;
    }>;
  };
  for (const entry of publicManifest.cases) {
    const barcode = entry.suppliedBarcode;
    map.set(entry.id, {
      mediaType: entry.image.mediaType as 'image/png' | 'image/jpeg',
      ...(barcode === undefined ? {} : { barcode }),
    });
  }
  return map;
}

export async function buildRuntimeHarness(selectedProfile?: CalibrationProfile) {
  const files: Record<CalibrationPreflightFileName, string> = {
    'public-manifest': asset('public-manifest.json'),
    prompt: JSON.stringify([MEAL_ANALYSIS_PROMPT, LABEL_ANALYSIS_PROMPT, BARCODE_ANALYSIS_PROMPT]),
    'response-schema': JSON.stringify(
      ['meal', 'label', 'barcode'].map((s) => visionResponseJsonSchema(s as 'meal' | 'label' | 'barcode')),
    ),
    'source-lock': asset('calibration-source-lock.json'),
    'calibration-manifest': asset('calibration-manifest.json'),
    'off-lock': asset('off-snapshot-lock.json'),
    'historical-reference': asset('historical-reference-v1.json'),
  };
  const store = await prepareCalibrationOffSnapshotStore({
    lockText: files['off-lock'],
    readSnapshot: async (path: string) => asset(path.slice('functions/eval/nutrition/'.length)),
  });
  const calls: string[] = [];
  const witness: RuntimeHarnessCallWitness = { sdk: 0, transport: 0 };
  const sdkCalls: RuntimeHarnessSdkCall[] = [];
  const capturedKeys: RuntimeHarnessCapturedKeys = {
    loadImageKeys: [],
    reserveImageKeys: [],
    modelVersionCalls: [],
    snapshotBarcodes: [],
  };
  const client: GenAIClient = {
    models: {
      generateContent: async (params: { model: string; contents: unknown; config?: unknown }) => {
        calls.push('sdk');
        witness.sdk++;
        witness.transport++;
        sdkCalls.push({ model: params.model, contents: params.contents, config: params.config });
        return { text: '{"fixture":true}', modelVersion: 'fixture-model-v1' };
      },
    },
  };
  const adapter = createGenAIAdapter({ project: 'calorix-xurschnell', location: 'us', googleGenAI: client });
  const deps = {
    files,
    ...(selectedProfile === undefined ? {} : { selectedProfile }),
    loadImage: async (key: Readonly<ReservationKey>): Promise<Uint8Array> => {
      calls.push('image');
      capturedKeys.loadImageKeys.push(key);
      return new Uint8Array([1, 2, 3]);
    },
    generateVision: adapter.generateVision,
    reserveImage: async (key: Readonly<ReservationKey>): Promise<void> => {
      calls.push('reserve');
      capturedKeys.reserveImageKeys.push(key);
    },
    onModelVersion: (key: Readonly<ReservationKey>, version: string): void => {
      calls.push('metadata');
      capturedKeys.modelVersionCalls.push({ key, version });
    },
    lookupSnapshot: (barcode: string) => {
      calls.push('snapshot');
      capturedKeys.snapshotBarcodes.push(barcode);
      return store.get(barcode);
    },
  };
  return {
    deps,
    calls,
    witness,
    client,
    store,
    sdkCalls,
    capturedKeys,
    caseMetadata: parseCaseMetadata(files),
    plan: deriveCanonicalReportOutcomePlan(files, selectedProfile),
  };
}

export type RuntimeHarness = Awaited<ReturnType<typeof buildRuntimeHarness>>;
