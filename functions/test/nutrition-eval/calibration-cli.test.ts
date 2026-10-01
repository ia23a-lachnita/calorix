/**
 * Task7 Step1 RED: hermetic pre-construction boundary tests for the future
 * dedicated calibration CLI.
 *
 * The CLI source `functions/src/nutrition-eval/calibration-cli.ts` is
 * intentionally absent, so this file is RED at import time until Task7 Step4
 * implements it. Do NOT create a placeholder implementation to satisfy these
 * tests; implement the real CLI instead.
 *
 * Expected future API (the contract these tests pin):
 *
 * ```ts
 * // Single source of truth: Vertex identity constants live in
 * // `functions/src/genai-adapter.ts`; the CLI re-exports them verbatim.
 * export const CALIBRATION_VERTEX_PROJECT = 'calorix-xurschnell';
 * export const CALIBRATION_VERTEX_LOCATION = 'us';
 * export const CALIBRATION_MODEL = 'gemini-3.8-flash';
 * export const CALIBRATION_API_VERSION = 'v1';
 * export const CALIBRATION_BASE_URL = 'https://aiplatform.us.rep.googleapis.com/';
 * export const CALIBRATION_TIMEOUT_MS = 30000;
 * export const CALIBRATION_LIVE_ENV_FLAG = 'RUN_NUTRITION_CALIBRATION_LIVE';
 *
 * export interface CalibrationCliDeps {
 *   verifyPreflightState?: (stage: string) => Promise<void>;
 *   createClient?: (options: {
 *     vertexai: true;
 *     project: string;
 *     location: string;
 *     apiVersion: 'v1';
 *     httpOptions: { baseUrl: string; timeout: number };
 *   }) => unknown;
 *   executeStage?: (stage: string, client: unknown) => Promise<void>;
 *   readLedgerSelectedProfile?: () => 'LOW' | 'MEDIUM' | undefined;
 *   readLedgerModel?: () => string | undefined;
 * }
 *
 * export interface CalibrationCliResult {
 *   exitCode: 0 | 1;
 *   failureCode?: string;
 * }
 *
 * export function runCalibrationCli(
 *   argv: readonly string[],
 *   env?: Record<string, string | undefined>,
 *   deps?: CalibrationCliDeps,
 * ): Promise<CalibrationCliResult>;
 * ```
 *
 * Hermetic contract: tests use dependency injection only. No provider
 * dispatch, no `fetch`, no writes to disk, no Firebase, no network. The only
 * filesystem access is `readFileSync` of committed `functions/eval/nutrition/`
 * fixtures used as read-only local inputs; nothing is written, mutated, or
 * downloaded. Every rejection test asserts the client factory was never
 * called, proving the malformed config returns before `GoogleGenAI` client
 * construction.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  CALIBRATION_API_VERSION,
  CALIBRATION_BASE_URL,
  CALIBRATION_HISTORICAL_REFERENCE_SHA256,
  CALIBRATION_LIVE_ENV_FLAG,
  CALIBRATION_MANIFEST_SHA256,
  CALIBRATION_MODEL,
  CALIBRATION_OFF_SNAPSHOT_LOCK_SHA256,
  CALIBRATION_PREFLIGHT_DATASET_ID,
  CALIBRATION_PREFLIGHT_SAFE_ERROR_CATEGORIES,
  CALIBRATION_PROMPT_HASH,
  CALIBRATION_PUBLIC_MANIFEST_HASH,
  CALIBRATION_SOURCE_LOCK_SHA256,
  CALIBRATION_TIMEOUT_MS,
  CALIBRATION_VERTEX_LOCATION,
  CALIBRATION_VERTEX_PROJECT,
  executeCalibrationPreflight,
  runCalibrationCli,
  verifyCalibrationPreflightState,
} from '../../src/nutrition-eval/calibration-cli';
import type {
  CalibrationCliDeps,
  CalibrationCliResult,
} from '../../src/nutrition-eval/calibration-cli';
import { CalibrationFatalError } from '../../src/nutrition-eval/fatal-error';
import { hashNutritionEvalManifest, hashNutritionEvalPrompts } from '../../src/nutrition-eval/cli';
import {
  BARCODE_ANALYSIS_PROMPT,
  LABEL_ANALYSIS_PROMPT,
  MEAL_ANALYSIS_PROMPT,
} from '../../src/prompts';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inspect } from 'node:util';

const EXACT_PROJECT = 'calorix-xurschnell';
const EXACT_LOCATION = 'us';
const EXACT_MODEL = 'gemini-3.8-flash';
const EXACT_API_VERSION = 'v1';
const EXACT_BASE_URL = 'https://aiplatform.us.rep.googleapis.com/';
const EXACT_TIMEOUT_MS = 30000;

type SelectedProfile = 'LOW' | 'MEDIUM';

interface Harness {
  verifyPreflightState: ReturnType<typeof vi.fn>;
  createClient: ReturnType<typeof vi.fn>;
  executeStage: ReturnType<typeof vi.fn>;
  deps: CalibrationCliDeps;
}

function makeHarness(options: {
  selectedProfile?: SelectedProfile | undefined;
  ledgerModel?: string | undefined;
} = {}): Harness {
  const verifyPreflightState = vi.fn(async (_stage: string) => undefined);
  const createClient = vi.fn((clientOptions: unknown) => ({ __mockClient: true, clientOptions }));
  const executeStage = vi.fn(async (_stage: string, _client: unknown) => undefined);
  const deps: CalibrationCliDeps = {
    verifyPreflightState,
    createClient,
    executeStage,
    readLedgerSelectedProfile: () => options.selectedProfile,
    readLedgerModel: () => options.ledgerModel ?? EXACT_MODEL,
  };
  return { verifyPreflightState, createClient, executeStage, deps };
}

function expectPreStageOrdering(harness: Harness): void {
  expect(harness.verifyPreflightState).toHaveBeenCalledTimes(1);
  expect(harness.createClient).toHaveBeenCalledTimes(1);
  expect(harness.executeStage).toHaveBeenCalledTimes(1);
  const verifyOrder = harness.verifyPreflightState.mock.invocationCallOrder[0] ?? Number.NaN;
  const createOrder = harness.createClient.mock.invocationCallOrder[0] ?? Number.NaN;
  const executeOrder = harness.executeStage.mock.invocationCallOrder[0] ?? Number.NaN;
  expect(Number.isFinite(verifyOrder)).toBe(true);
  expect(Number.isFinite(createOrder)).toBe(true);
  expect(Number.isFinite(executeOrder)).toBe(true);
  expect(verifyOrder).toBeLessThan(createOrder);
  expect(createOrder).toBeLessThan(executeOrder);
}

/** Minimal live env: explicit opt-in only, no base-URL overrides, no 2.5. */
function liveEnv(extra: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    [CALIBRATION_LIVE_ENV_FLAG]: '1',
    ...extra,
  };
}

async function run(
  argv: readonly string[],
  env: Record<string, string | undefined>,
  harness: Harness,
): Promise<CalibrationCliResult> {
  return runCalibrationCli(argv, env, harness.deps);
}

describe('calibration CLI exact provider identity', () => {
  it('pins the Vertex project to calorix-xurschnell', () => {
    expect(CALIBRATION_VERTEX_PROJECT).toBe(EXACT_PROJECT);
  });

  it('pins the Vertex location to us', () => {
    expect(CALIBRATION_VERTEX_LOCATION).toBe(EXACT_LOCATION);
  });

  it('pins the calibration model to gemini-3.8-flash', () => {
    expect(CALIBRATION_MODEL).toBe(EXACT_MODEL);
  });

  it('pins the API version to v1', () => {
    expect(CALIBRATION_API_VERSION).toBe(EXACT_API_VERSION);
  });

  it('pins the regional base URL', () => {
    expect(CALIBRATION_BASE_URL).toBe(EXACT_BASE_URL);
  });

  it('pins the request timeout to 30000ms', () => {
    expect(CALIBRATION_TIMEOUT_MS).toBe(EXACT_TIMEOUT_MS);
  });
});

describe('calibration CLI opt-in boundary', () => {
  it('rejects a missing live opt-in before client construction', async () => {
    const harness = makeHarness();
    const result = await run(['preflight'], {}, harness);

    expect(result.exitCode).toBe(1);
    expect(result.failureCode).toBe('opt_in_missing');
    expect(harness.createClient).not.toHaveBeenCalled();
    expect(harness.verifyPreflightState).not.toHaveBeenCalled();
    expect(harness.executeStage).not.toHaveBeenCalled();
  });

  it('rejects a non-1 opt-in value before client construction', async () => {
    const harness = makeHarness();
    const result = await run(['preflight'], { [CALIBRATION_LIVE_ENV_FLAG]: 'yes' }, harness);

    expect(result.exitCode).toBe(1);
    expect(harness.createClient).not.toHaveBeenCalled();
    expect(harness.verifyPreflightState).not.toHaveBeenCalled();
    expect(harness.executeStage).not.toHaveBeenCalled();
  });
});

describe('calibration CLI project/location/model boundary', () => {
  it.each([
    ['--project', 'wrong-project'],
    ['--project', 'calorix-other'],
    ['--project', ''],
    ['--location', 'europe-west1'],
    ['--location', 'us-central1'],
    ['--location', ''],
    ['--model', 'gemini-2.5-flash'],
    ['--model', 'gemini-3.7-flash'],
    ['--model', 'gemini-3.8-flash-001'],
    ['--model', ''],
  ])('rejects %s %s before client construction', async (flag, value) => {
    const harness = makeHarness();
    const result = await run(['preflight', flag, value], liveEnv(), harness);

    expect(result.exitCode).toBe(1);
    expect(harness.createClient).not.toHaveBeenCalled();
    expect(harness.verifyPreflightState).not.toHaveBeenCalled();
    expect(harness.executeStage).not.toHaveBeenCalled();
  });

  it('rejects a wrong project supplied via environment before client construction', async () => {
    const harness = makeHarness();
    const result = await run(
      ['preflight'],
      liveEnv({ CALORIX_NUTRITION_EVAL_PROJECT: 'wrong-project' }),
      harness,
    );

    expect(result.exitCode).toBe(1);
    expect(harness.createClient).not.toHaveBeenCalled();
    expect(harness.verifyPreflightState).not.toHaveBeenCalled();
    expect(harness.executeStage).not.toHaveBeenCalled();
  });

  it('rejects a wrong location supplied via environment before client construction', async () => {
    const harness = makeHarness();
    const result = await run(
      ['preflight'],
      liveEnv({ CALORIX_NUTRITION_EVAL_LOCATION: 'asia-northeast1' }),
      harness,
    );

    expect(result.exitCode).toBe(1);
    expect(harness.createClient).not.toHaveBeenCalled();
    expect(harness.verifyPreflightState).not.toHaveBeenCalled();
    expect(harness.executeStage).not.toHaveBeenCalled();
  });

  it('rejects a wrong model supplied via environment before client construction', async () => {
    const harness = makeHarness();
    const result = await run(
      ['preflight'],
      liveEnv({ CALORIX_NUTRITION_EVAL_MODEL: 'gemini-2.0-flash' }),
      harness,
    );

    expect(result.exitCode).toBe(1);
    expect(harness.createClient).not.toHaveBeenCalled();
    expect(harness.verifyPreflightState).not.toHaveBeenCalled();
    expect(harness.executeStage).not.toHaveBeenCalled();
  });
});

describe('calibration CLI Gemini 2.5 exclusion', () => {
  it('rejects gemini-2.5-flash as --model before client construction', async () => {
    const harness = makeHarness();
    const result = await run(['preflight', '--model', 'gemini-2.5-flash'], liveEnv(), harness);

    expect(result.exitCode).toBe(1);
    expect(harness.createClient).not.toHaveBeenCalled();
    expect(harness.verifyPreflightState).not.toHaveBeenCalled();
    expect(harness.executeStage).not.toHaveBeenCalled();
  });

  it('rejects 2.5 in an unrelated argument value before client construction', async () => {
    const harness = makeHarness();
    const result = await run(
      ['preflight', '--code-sha', 'abc-gemini-2.5-flash-def'],
      liveEnv(),
      harness,
    );

    expect(result.exitCode).toBe(1);
    expect(harness.createClient).not.toHaveBeenCalled();
    expect(harness.verifyPreflightState).not.toHaveBeenCalled();
    expect(harness.executeStage).not.toHaveBeenCalled();
  });

  it('rejects 2.5 in any environment value before client construction', async () => {
    const harness = makeHarness();
    const result = await run(
      ['preflight'],
      liveEnv({ CALORIX_NUTRITION_EVAL_MODEL: 'gemini-2.5-flash' }),
      harness,
    );

    expect(result.exitCode).toBe(1);
    expect(harness.createClient).not.toHaveBeenCalled();
    expect(harness.verifyPreflightState).not.toHaveBeenCalled();
    expect(harness.executeStage).not.toHaveBeenCalled();
  });

  it('rejects 2.5 in an unrelated environment value before client construction', async () => {
    const harness = makeHarness();
    const result = await run(
      ['preflight'],
      liveEnv({ SOME_UNRELATED_NOTE: 'compare with gemini-2.5-flash later' }),
      harness,
    );

    expect(result.exitCode).toBe(1);
    expect(harness.createClient).not.toHaveBeenCalled();
    expect(harness.verifyPreflightState).not.toHaveBeenCalled();
    expect(harness.executeStage).not.toHaveBeenCalled();
  });

  it('rejects a 2.5 ledger model before client construction', async () => {
    const harness = makeHarness({ ledgerModel: 'gemini-2.5-flash' });
    const result = await run(['preflight'], liveEnv(), harness);

    expect(result.exitCode).toBe(1);
    expect(harness.createClient).not.toHaveBeenCalled();
    expect(harness.verifyPreflightState).not.toHaveBeenCalled();
    expect(harness.executeStage).not.toHaveBeenCalled();
  });
});

describe('calibration CLI run-dir override boundary', () => {
  it.each([
    ['--run-dir', '.nutrition-eval/custom'],
    ['--runDir', '.nutrition-eval/custom'],
    ['--output-dir', '.nutrition-eval/custom'],
    ['--out-dir', '.nutrition-eval/custom'],
    ['--ledger-dir', '/tmp/ledger'],
    ['--work-dir', '/tmp/work'],
    ['--root', '/tmp/root'],
  ])('rejects %s %s before client construction', async (flag, value) => {
    const harness = makeHarness();
    const result = await run(['preflight', flag, value], liveEnv(), harness);

    expect(result.exitCode).toBe(1);
    expect(harness.createClient).not.toHaveBeenCalled();
    expect(harness.verifyPreflightState).not.toHaveBeenCalled();
    expect(harness.executeStage).not.toHaveBeenCalled();
  });

  it('rejects a run-dir override supplied via environment before client construction', async () => {
    const harness = makeHarness();
    const result = await run(
      ['preflight'],
      liveEnv({ CALIBRATION_RUN_DIR: '.nutrition-eval/custom' }),
      harness,
    );

    expect(result.exitCode).toBe(1);
    expect(harness.createClient).not.toHaveBeenCalled();
    expect(harness.verifyPreflightState).not.toHaveBeenCalled();
    expect(harness.executeStage).not.toHaveBeenCalled();
  });
});

describe('calibration CLI retry override boundary', () => {
  it.each([
    ['--retry', '3'],
    ['--retries', '3'],
    ['--max-retries', '3'],
    ['--retry-options', '{"maxRetries":3}'],
  ])('rejects %s %s before client construction', async (flag, value) => {
    const harness = makeHarness();
    const result = await run(['preflight', flag, value], liveEnv(), harness);

    expect(result.exitCode).toBe(1);
    expect(harness.createClient).not.toHaveBeenCalled();
    expect(harness.verifyPreflightState).not.toHaveBeenCalled();
    expect(harness.executeStage).not.toHaveBeenCalled();
  });

  it('rejects a retry override supplied via environment before client construction', async () => {
    const harness = makeHarness();
    const result = await run(
      ['preflight'],
      liveEnv({ GOOGLE_GENAI_RETRY_OPTIONS: '{"maxRetries":3}' }),
      harness,
    );

    expect(result.exitCode).toBe(1);
    expect(harness.createClient).not.toHaveBeenCalled();
    expect(harness.verifyPreflightState).not.toHaveBeenCalled();
    expect(harness.executeStage).not.toHaveBeenCalled();
  });
});

describe('calibration CLI base-URL override boundary', () => {
  it.each(['GOOGLE_VERTEX_BASE_URL', 'GOOGLE_GEMINI_BASE_URL'])(
    'rejects nonblank %s before client construction',
    async (envKey) => {
      const harness = makeHarness();
      const result = await run(
        ['preflight'],
        liveEnv({ [envKey]: 'https://example.com/custom-endpoint' }),
        harness,
      );

      expect(result.exitCode).toBe(1);
      expect(harness.createClient).not.toHaveBeenCalled();
      expect(harness.verifyPreflightState).not.toHaveBeenCalled();
      expect(harness.executeStage).not.toHaveBeenCalled();
    },
  );

  it('rejects whitespace-padded base-URL overrides before client construction', async () => {
    const harness = makeHarness();
    const result = await run(
      ['preflight'],
      liveEnv({ GOOGLE_VERTEX_BASE_URL: '  https://example.com/custom  ' }),
      harness,
    );

    expect(result.exitCode).toBe(1);
    expect(harness.createClient).not.toHaveBeenCalled();
    expect(harness.verifyPreflightState).not.toHaveBeenCalled();
    expect(harness.executeStage).not.toHaveBeenCalled();
  });
});

describe('calibration CLI stage and thinking-level boundary', () => {
  it.each([[], ['smoke'], ['PREFLIGHT'], ['preflight', 'extra-positional']])(
    'rejects invalid stage argv %j before client construction',
    async (argv) => {
      const harness = makeHarness();
      const result = await run(argv, liveEnv(), harness);

      expect(result.exitCode).toBe(1);
      expect(harness.createClient).not.toHaveBeenCalled();
      expect(harness.verifyPreflightState).not.toHaveBeenCalled();
      expect(harness.executeStage).not.toHaveBeenCalled();
    },
  );

  it.each(['low', 'LOW', 'Medium', 'high', ''])(
    'rejects preflight with --thinking-level %j (preflight enumerates both profiles internally)',
    async (level) => {
      const harness = makeHarness();
      const result = await run(['preflight', '--thinking-level', level], liveEnv(), harness);

      expect(result.exitCode).toBe(1);
      expect(harness.createClient).not.toHaveBeenCalled();
      expect(harness.verifyPreflightState).not.toHaveBeenCalled();
      expect(harness.executeStage).not.toHaveBeenCalled();
    },
  );

  it.each(['low', 'medium'])(
    'rejects development with --thinking-level %j (development enumerates both profiles internally)',
    async (level) => {
      const harness = makeHarness();
      const result = await run(['development', '--thinking-level', level], liveEnv(), harness);

      expect(result.exitCode).toBe(1);
      expect(harness.createClient).not.toHaveBeenCalled();
      expect(harness.verifyPreflightState).not.toHaveBeenCalled();
      expect(harness.executeStage).not.toHaveBeenCalled();
    },
  );

  it.each([['validation'], ['benchmark']])(
    'rejects %s without --thinking-level before client construction',
    async (stage) => {
      const harness = makeHarness({ selectedProfile: 'LOW' });
      const result = await run([stage], liveEnv(), harness);

      expect(result.exitCode).toBe(1);
      expect(harness.createClient).not.toHaveBeenCalled();
      expect(harness.verifyPreflightState).not.toHaveBeenCalled();
      expect(harness.executeStage).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['validation', 'LOW', 'high'],
    ['validation', 'LOW', 'LOW'],
    ['validation', 'LOW', ''],
    ['benchmark', 'MEDIUM', 'Medium'],
    ['benchmark', 'MEDIUM', 'ultra'],
  ])(
    'rejects %s with invalid --thinking-level %j before client construction',
    async (stage, _selected, level) => {
      const harness = makeHarness({ selectedProfile: _selected as SelectedProfile });
      const result = await run([stage, '--thinking-level', level], liveEnv(), harness);

      expect(result.exitCode).toBe(1);
      expect(harness.createClient).not.toHaveBeenCalled();
      expect(harness.verifyPreflightState).not.toHaveBeenCalled();
      expect(harness.executeStage).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['validation', 'LOW', 'medium'],
    ['validation', 'MEDIUM', 'low'],
    ['benchmark', 'LOW', 'medium'],
    ['benchmark', 'MEDIUM', 'low'],
  ])(
    'rejects %s when --thinking-level %j does not match the ledger-selected profile',
    async (stage, selected, level) => {
      const harness = makeHarness({ selectedProfile: selected as SelectedProfile });
      const result = await run([stage, '--thinking-level', level], liveEnv(), harness);

      expect(result.exitCode).toBe(1);
      expect(harness.createClient).not.toHaveBeenCalled();
      expect(harness.verifyPreflightState).not.toHaveBeenCalled();
      expect(harness.executeStage).not.toHaveBeenCalled();
    },
  );

  it('rejects validation when the ledger has no selected profile', async () => {
    const harness = makeHarness({ selectedProfile: undefined });
    const result = await run(['validation', '--thinking-level', 'low'], liveEnv(), harness);

    expect(result.exitCode).toBe(1);
    expect(harness.createClient).not.toHaveBeenCalled();
    expect(harness.verifyPreflightState).not.toHaveBeenCalled();
    expect(harness.executeStage).not.toHaveBeenCalled();
  });
});

describe('calibration CLI exact client construction', () => {
  it('constructs the exact Vertex client for preflight', async () => {
    const harness = makeHarness();
    const result = await run(['preflight'], liveEnv(), harness);

    expect(result.exitCode).toBe(0);
    expectPreStageOrdering(harness);
    const options = harness.createClient.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(options).toEqual({
      vertexai: true,
      project: EXACT_PROJECT,
      location: EXACT_LOCATION,
      apiVersion: EXACT_API_VERSION,
      httpOptions: { baseUrl: EXACT_BASE_URL, timeout: EXACT_TIMEOUT_MS },
    });
    expect(options).not.toHaveProperty('apiKey');
    expect(options).not.toHaveProperty('retryOptions');
    expect(options.httpOptions).not.toHaveProperty('retryOptions');
  });

  it.each([
    ['development', undefined, undefined],
    ['validation', 'LOW', 'low'],
    ['validation', 'MEDIUM', 'medium'],
    ['benchmark', 'LOW', 'low'],
    ['benchmark', 'MEDIUM', 'medium'],
  ])(
    'constructs the exact Vertex client for %s (profile %j)',
    async (stage, selected, level) => {
      const harness = makeHarness({
        ...(selected === undefined ? {} : { selectedProfile: selected as SelectedProfile }),
      });
      const argv = level === undefined ? [stage] : [stage, '--thinking-level', level];
      const result = await run(argv, liveEnv(), harness);

      expect(result.exitCode).toBe(0);
      expectPreStageOrdering(harness);
      expect(harness.createClient.mock.calls[0]?.[0]).toEqual({
        vertexai: true,
        project: EXACT_PROJECT,
        location: EXACT_LOCATION,
        apiVersion: EXACT_API_VERSION,
        httpOptions: { baseUrl: EXACT_BASE_URL, timeout: EXACT_TIMEOUT_MS },
      });
    },
  );

  it('is unaffected by unrelated GOOGLE_API_KEY and GOOGLE_CLOUD_* variables', async () => {
    const harness = makeHarness();
    const result = await run(
      ['preflight'],
      liveEnv({
        GOOGLE_API_KEY: 'unrelated-test-key',
        GOOGLE_CLOUD_PROJECT: 'some-other-project',
        GOOGLE_CLOUD_REGION: 'some-other-region',
      }),
      harness,
    );

    expect(result.exitCode).toBe(0);
    expectPreStageOrdering(harness);
    const options = harness.createClient.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(options).toEqual({
      vertexai: true,
      project: EXACT_PROJECT,
      location: EXACT_LOCATION,
      apiVersion: EXACT_API_VERSION,
      httpOptions: { baseUrl: EXACT_BASE_URL, timeout: EXACT_TIMEOUT_MS },
    });
    expect(options).not.toHaveProperty('apiKey');
    expect(options).not.toHaveProperty('retryOptions');
  });
});

describe('calibration CLI preflight gate', () => {
  it('blocks client construction and stage execution when preflight verification fails', async () => {
    const harness = makeHarness();
    harness.verifyPreflightState.mockRejectedValueOnce(new Error('preflight mismatch'));
    const result = await run(['preflight'], liveEnv(), harness);

    expect(result.exitCode).toBe(1);
    expect(harness.verifyPreflightState).toHaveBeenCalledTimes(1);
    expect(harness.createClient).not.toHaveBeenCalled();
    expect(harness.executeStage).not.toHaveBeenCalled();
  });

  it('blocks client construction and stage execution when validation preflight fails', async () => {
    const harness = makeHarness({ selectedProfile: 'LOW' });
    harness.verifyPreflightState.mockRejectedValueOnce(new Error('manifest mismatch'));
    const result = await run(['validation', '--thinking-level', 'low'], liveEnv(), harness);

    expect(result.exitCode).toBe(1);
    expect(harness.verifyPreflightState).toHaveBeenCalledTimes(1);
    expect(harness.createClient).not.toHaveBeenCalled();
    expect(harness.executeStage).not.toHaveBeenCalled();
  });
});

describe('calibration CLI stage execution', () => {
  it('propagates stage failure as exitCode 1 after ordered preflight and client construction', async () => {
    const harness = makeHarness();
    harness.executeStage.mockRejectedValueOnce(new Error('stage failed'));
    const result = await run(['preflight'], liveEnv(), harness);

    expect(result.exitCode).toBe(1);
    expect(harness.verifyPreflightState).toHaveBeenCalledTimes(1);
    expect(harness.createClient).toHaveBeenCalledTimes(1);
    expect(harness.executeStage).toHaveBeenCalledTimes(1);
    const verifyOrder = harness.verifyPreflightState.mock.invocationCallOrder[0] ?? Number.NaN;
    const createOrder = harness.createClient.mock.invocationCallOrder[0] ?? Number.NaN;
    const executeOrder = harness.executeStage.mock.invocationCallOrder[0] ?? Number.NaN;
    expect(verifyOrder).toBeLessThan(createOrder);
    expect(createOrder).toBeLessThan(executeOrder);
  });

  it('passes the constructed client to stage execution in order', async () => {
    const harness = makeHarness();
    const result = await run(['preflight'], liveEnv(), harness);

    expect(result.exitCode).toBe(0);
    expectPreStageOrdering(harness);
    expect(harness.executeStage.mock.calls[0]?.[0]).toBe('preflight');
    const constructedClient = harness.createClient.mock.results[0]?.value;
    expect(harness.executeStage.mock.calls[0]?.[1]).toBe(constructedClient);
  });
});

// ── Task7 Step2 RED: deterministic preflight + Stage0 boundary ──────────────
// Hermetic RED contract for plan Task7 Step2. The CLI module is still absent,
// so every test below is RED at import time for the same single reason as
// Step1 (missing `calibration-cli.ts`) until Step4 implements the real CLI +
// preflight boundary. No provider dispatch, no fetch, no Firebase, no network:
// every committed byte is injected, every
// reservation/client/token/image interaction is an injected fake, and no
// actual SDK method is ever called. Committed 40-case calibration and 20-case
// public manifests are loaded read-only from `functions/eval/nutrition/` as
// hermetic local fixtures; no live download occurs.
//
// Pinned contract:
//
// ```ts
// export const CALIBRATION_PREFLIGHT_DATASET_ID = 'calorix-public-v1';
// export const CALIBRATION_PUBLIC_MANIFEST_HASH =
//   '2dc17d06752c2981862690953a7b134235bb6a20da4dc9b5fef5528f91f5bb56';
// export const CALIBRATION_PROMPT_HASH =
//   '205b635a252e1f378023f5e1f3c670a6fba0ecfdfc8ce4f08f30efa24c544263';
// export const CALIBRATION_SOURCE_LOCK_SHA256 =
//   'f1138680a38aa64eb400bc20c89ec656d771e8f3823ae09bed956a48eff2a43b';
// export const CALIBRATION_MANIFEST_SHA256 =
//   '313c37c14cb912d5dc6410dbb3b812139c22d7533d2341678de3ac860b0c1d6d';
// export const CALIBRATION_OFF_SNAPSHOT_LOCK_SHA256 =
//   '2b9d7b9baecb22ec20662f52010810fdb4f2fde3dd7c464d73b0cb56855003a1';
// export const CALIBRATION_HISTORICAL_REFERENCE_SHA256 =
//   'fd712bee2d4229bc8476d1cc25fce1a21172e6013c6abfe8949498cc5ce15acb';
// export const CALIBRATION_PREFLIGHT_SAFE_ERROR_CATEGORIES = [
//   'http_400', 'http_401', 'http_403', 'http_404', 'http_408', 'http_429',
//   'http_other_4xx', 'http_5xx', 'timeout', 'network', 'empty_response',
//   'interrupted_reservation', 'unknown',
// ] as const;
//
// export type CalibrationPreflightFileName =
//   | 'public-manifest' | 'prompt' | 'response-schema' | 'source-lock'
//   | 'calibration-manifest' | 'off-lock' | 'historical-reference';
//
// export interface CalibrationPreflightReport {
//   datasetId: 'calorix-public-v1';
//   publicManifestHash: string;
//   promptHash: string;
//   firstDevelopmentCaseId: string;
//   compatibilityNotes: ReadonlyArray<{ key: string; detail: string }>;
//   historicalCompatible: false;
// }
//
// export function verifyCalibrationPreflightState(deps: {
//   files: Record<CalibrationPreflightFileName, string>;
//   expected?: {
//     datasetId: string; publicManifestHash: string; promptHash: string;
//     responseSchemaHash: string; sourceLockHash: string;
//     calibrationManifestHash: string; offLockHash: string;
//     historicalReferenceHash: string;
//   };
//   reserveCall?: (key: unknown) => Promise<void> | void;
//   createClient?: (options: unknown) => unknown;
// }): Promise<CalibrationPreflightReport>;
//
// export function executeCalibrationPreflight(
//   client: unknown,
//   deps: {
//     firstDevelopmentCaseId: string;
//     reserveCall: (
//       key:
//         | { kind: 'token_count'; stage: 'preflight'; caseId: string; model: 'gemini-3.8-flash' }
//         | { stage: 'preflight'; profile: 'LOW' | 'MEDIUM'; caseId: string; sampleIndex: number },
//     ) => Promise<void>;
//     countTokens: (request: { model: 'gemini-3.8-flash' }) =>
//       Promise<{ tokenCount: number }>;
//     generateImage: (request: {
//       model: 'gemini-3.8-flash'; profile: 'LOW' | 'MEDIUM'; caseId: string;
//     }) => Promise<{ prediction: Record<string, number> | null;
//       modelVersion: unknown }>;
//     recordSafeError?: (entry: Record<string, unknown>) => void;
//   },
// ): Promise<{ pinnedModelVersion: string }>;
// ```
//
// Public-manifest/prompt values are semantic hashes via the existing canonical
// `hashNutritionEvalManifest(parsed)` / `hashNutritionEvalPrompts(meal,label,
// barcode)` helpers, not raw file SHA. Response-schema uses canonical JSON
// (parse then stringify then SHA). Raw SHA remains only for source-lock,
// calibration-manifest, OFF-lock, and historical-reference. `expected`
// overrides keep tamper tests self-consistent against injected bytes; the
// default-pinned tests prove the real constants gate foreign bytes
// fail-closed, while the canonical-hash tests prove the defaults accept the
// committed assets. Tamper coverage is a single 8-identity matrix at unit
// level plus representative CLI wiring; hermetic CLI success against the real
// pins is impossible without the real committed bytes, so CLI success
// mechanics are proven at unit level while the CLI tests prove fail-closed
// gating with the verify fake omitted (no hook bypass is possible when the
// fake is absent).

const STEP2_DATASET_ID = 'calorix-public-v1';
const STEP2_PUBLIC_MANIFEST_HASH =
  '2dc17d06752c2981862690953a7b134235bb6a20da4dc9b5fef5528f91f5bb56';
const STEP2_PROMPT_HASH =
  '205b635a252e1f378023f5e1f3c670a6fba0ecfdfc8ce4f08f30efa24c544263';
const STEP2_SOURCE_LOCK_SHA256 =
  'f1138680a38aa64eb400bc20c89ec656d771e8f3823ae09bed956a48eff2a43b';
const STEP2_CALIBRATION_MANIFEST_SHA256 =
  '313c37c14cb912d5dc6410dbb3b812139c22d7533d2341678de3ac860b0c1d6d';
const STEP2_OFF_LOCK_SHA256 =
  '2b9d7b9baecb22ec20662f52010810fdb4f2fde3dd7c464d73b0cb56855003a1';
const STEP2_HISTORICAL_REFERENCE_SHA256 =
  'fd712bee2d4229bc8476d1cc25fce1a21172e6013c6abfe8949498cc5ce15acb';
const STEP2_FIRST_DEV_CASE_ID = 'calibration-dish_1565117892';
const STEP2_MODEL = 'gemini-3.8-flash';
const STEP2_PINNED_VERSION = 'gemini-3.8-20260923';

const COMMITTED_PUBLIC_MANIFEST_BYTES = readFileSync(
  new URL('../../eval/nutrition/public-manifest.json', import.meta.url),
  'utf8',
);
const COMMITTED_CALIBRATION_MANIFEST_BYTES = readFileSync(
  new URL('../../eval/nutrition/calibration-manifest.json', import.meta.url),
  'utf8',
);
const STEP2_COMMITTED_PROMPT_TRIPLE = [
  MEAL_ANALYSIS_PROMPT,
  LABEL_ANALYSIS_PROMPT,
  BARCODE_ANALYSIS_PROMPT,
] as const;
const STEP2_COMMITTED_PROMPT_BYTES = JSON.stringify([...STEP2_COMMITTED_PROMPT_TRIPLE]);

const STEP2_SAFE_CATEGORIES = [
  'http_400',
  'http_401',
  'http_403',
  'http_404',
  'http_408',
  'http_429',
  'http_other_4xx',
  'http_5xx',
  'timeout',
  'network',
  'empty_response',
  'interrupted_reservation',
  'unknown',
] as const;

type Step2FileName =
  | 'public-manifest'
  | 'prompt'
  | 'response-schema'
  | 'source-lock'
  | 'calibration-manifest'
  | 'off-lock'
  | 'historical-reference';

type Step2Files = Record<Step2FileName, string>;

function step2Sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function step2CanonicalJsonHash(input: string): string {
  return createHash('sha256').update(JSON.stringify(JSON.parse(input)), 'utf8').digest('hex');
}

function step2PublicManifestHash(publicManifestBytes: string): string {
  return hashNutritionEvalManifest(JSON.parse(publicManifestBytes) as unknown);
}

function step2PromptHash(promptBytes: string): string {
  const triple = JSON.parse(promptBytes) as [string, string, string];
  return hashNutritionEvalPrompts(triple[0], triple[1], triple[2]);
}

function makeStep2Files(overrides: Partial<Step2Files> = {}): Step2Files {
  return {
    'public-manifest': COMMITTED_PUBLIC_MANIFEST_BYTES,
    prompt: STEP2_COMMITTED_PROMPT_BYTES,
    'response-schema': JSON.stringify({ type: 'object', version: 1 }),
    'source-lock': 'synthetic source-lock bytes',
    'calibration-manifest': COMMITTED_CALIBRATION_MANIFEST_BYTES,
    'off-lock': 'synthetic off-lock bytes',
    'historical-reference': 'synthetic historical-reference bytes',
    ...overrides,
  };
}

function expectedForStep2Files(
  files: Step2Files,
  overrides: Record<string, string> = {},
): Record<string, string> {
  return {
    datasetId: STEP2_DATASET_ID,
    publicManifestHash: step2PublicManifestHash(files['public-manifest']),
    promptHash: step2PromptHash(files.prompt),
    responseSchemaHash: step2CanonicalJsonHash(files['response-schema']),
    sourceLockHash: step2Sha256Hex(files['source-lock']),
    calibrationManifestHash: step2Sha256Hex(files['calibration-manifest']),
    offLockHash: step2Sha256Hex(files['off-lock']),
    historicalReferenceHash: step2Sha256Hex(files['historical-reference']),
    ...overrides,
  };
}

function validStep2Prediction(): Record<string, number> {
  return { kcal: 320, proteinG: 20, carbsG: 30, fatG: 10 };
}

// ── Task7 preflight verifier privacy correction ─────────────────────────────
// Planted-sentinel regression: a malformed or schema-invalid committed asset
// must never let its own bytes escape through the exported fatal. `JSON.parse`
// embeds the offending snippet in its `SyntaxError` message, and a Zod error can
// echo received values, so an attached raw exception is a content-leak channel
// via `error.cause`, `error.stack`, serialization, or error inspection. The
// exported `CalibrationFatalError` carries only its identity-naming message.

const PREFLIGHT_LEAK_SENTINEL = 'SECRET-X';

const MALFORMED_SENTINEL_BYTES = `{"datasetId":${PREFLIGHT_LEAK_SENTINEL}}`;

/**
 * Recursively collects every string reachable from an error's own properties,
 * including the non-enumerable `cause`/`stack` slots, so an attached raw
 * exception cannot hide behind a slot that `JSON.stringify` would skip.
 */
function collectOwnPropertyStrings(
  value: unknown,
  depth = 0,
  seen: Set<unknown> = new Set<unknown>(),
): string[] {
  if (value === null || value === undefined || depth > 8) return [];
  if (typeof value === 'string') return [value];
  if (typeof value !== 'object') return [String(value)];
  if (seen.has(value)) return [];
  seen.add(value);
  const collected: string[] = [];
  for (const key of Object.getOwnPropertyNames(value)) {
    let child: unknown;
    try {
      child = (value as Record<string, unknown>)[key];
    } catch {
      continue;
    }
    collected.push(key, ...collectOwnPropertyStrings(child, depth + 1, seen));
  }
  return collected;
}

function stringifyForLeakScan(value: unknown): string {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
}

function inspectForLeakScan(value: unknown): string {
  try {
    return inspect(value, { depth: null, showHidden: true, getters: true });
  } catch {
    return '';
  }
}

function expectSafeFatalWithoutSentinel(error: unknown, sentinel: string): void {
  expect(error).toBeInstanceOf(CalibrationFatalError);
  const fatal = error as CalibrationFatalError;
  expect(fatal.cause).toBeUndefined();
  expect(Object.getOwnPropertyNames(fatal)).not.toContain('cause');
  const surfaces = [
    fatal.name,
    fatal.message,
    String(fatal),
    fatal.stack ?? '',
    stringifyForLeakScan(fatal),
    inspectForLeakScan(fatal),
    ...collectOwnPropertyStrings(fatal),
  ];
  for (const surface of surfaces) {
    expect(surface).not.toContain(sentinel);
  }
}

describe('calibration preflight pinned identities (Task7 Step2 RED)', () => {
  it('pins the preflight dataset id to calorix-public-v1', () => {
    expect(CALIBRATION_PREFLIGHT_DATASET_ID).toBe(STEP2_DATASET_ID);
  });

  it('pins the public-manifest semantic hash', () => {
    expect(CALIBRATION_PUBLIC_MANIFEST_HASH).toBe(STEP2_PUBLIC_MANIFEST_HASH);
  });

  it('pins the prompt semantic hash', () => {
    expect(CALIBRATION_PROMPT_HASH).toBe(STEP2_PROMPT_HASH);
  });

  it('pins the committed source-lock hash', () => {
    expect(CALIBRATION_SOURCE_LOCK_SHA256).toBe(STEP2_SOURCE_LOCK_SHA256);
  });

  it('pins the committed calibration-manifest hash', () => {
    expect(CALIBRATION_MANIFEST_SHA256).toBe(STEP2_CALIBRATION_MANIFEST_SHA256);
  });

  it('pins the committed OFF-lock hash', () => {
    expect(CALIBRATION_OFF_SNAPSHOT_LOCK_SHA256).toBe(STEP2_OFF_LOCK_SHA256);
  });

  it('pins the committed historical-reference hash', () => {
    expect(CALIBRATION_HISTORICAL_REFERENCE_SHA256).toBe(STEP2_HISTORICAL_REFERENCE_SHA256);
  });

  it('accepts the committed public-manifest via the canonical manifest hash', () => {
    const parsed = JSON.parse(COMMITTED_PUBLIC_MANIFEST_BYTES) as unknown;
    expect(hashNutritionEvalManifest(parsed)).toBe(STEP2_PUBLIC_MANIFEST_HASH);
  });

  it('accepts the committed prompts via the canonical prompt hash', () => {
    expect(
      hashNutritionEvalPrompts(
        MEAL_ANALYSIS_PROMPT,
        LABEL_ANALYSIS_PROMPT,
        BARCODE_ANALYSIS_PROMPT,
      ),
    ).toBe(STEP2_PROMPT_HASH);
  });
});

describe('verifyCalibrationPreflightState (Task7 Step2 RED)', () => {
  it('accepts self-consistent bytes without touching reservation or client fakes', async () => {
    const files = makeStep2Files();
    const reserveCall = vi.fn(async (_key: unknown) => undefined);
    const createClient = vi.fn((_options: unknown) => ({ __mockClient: true }));

    const report = await verifyCalibrationPreflightState({
      files,
      expected: expectedForStep2Files(files),
      reserveCall,
      createClient,
    });

    expect(report.datasetId).toBe(STEP2_DATASET_ID);
    expect(report.publicManifestHash).toBe(step2PublicManifestHash(files['public-manifest']));
    expect(report.promptHash).toBe(step2PromptHash(files.prompt));
    expect(report.firstDevelopmentCaseId).toBe(STEP2_FIRST_DEV_CASE_ID);
    expect(report.historicalCompatible).toBe(false);
    const noteKeys = report.compatibilityNotes.map((note) => note.key).sort();
    expect(noteKeys).toEqual(
      ['generationProfile', 'historicalCodeSha', 'mediaTypeLabel', 'offRoute', 'sliceGCaveat'].sort(),
    );
    for (const note of report.compatibilityNotes) {
      expect(note.detail.trim().length).toBeGreaterThan(0);
    }
    expect(reserveCall).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it('derives the first development case id from the committed 40-case fixture', async () => {
    const committed = JSON.parse(COMMITTED_CALIBRATION_MANIFEST_BYTES) as {
      datasetId: string;
      cases: ReadonlyArray<{ id: string; group: string }>;
    };
    const developmentCases = committed.cases.filter((entry) => entry.group === 'development');
    expect(committed.datasetId).toBe('calorix-n5k-calibration-v1');
    expect(committed.cases).toHaveLength(40);
    expect(developmentCases.length).toBeGreaterThan(0);

    const files = makeStep2Files();
    const report = await verifyCalibrationPreflightState({
      files,
      expected: expectedForStep2Files(files),
    });

    expect(report.firstDevelopmentCaseId).toBe(developmentCases[0]?.id);
    expect(report.firstDevelopmentCaseId).toBe(STEP2_FIRST_DEV_CASE_ID);
  });

  it.each([
    ['dataset id', { kind: 'dataset' } as const],
    ['public-manifest bytes', { kind: 'file', name: 'public-manifest' } as const],
    ['prompt bytes', { kind: 'file', name: 'prompt' } as const],
    ['response-schema bytes', { kind: 'file', name: 'response-schema' } as const],
    ['source-lock bytes', { kind: 'file', name: 'source-lock' } as const],
    ['calibration-manifest bytes', { kind: 'file', name: 'calibration-manifest' } as const],
    ['off-lock bytes', { kind: 'file', name: 'off-lock' } as const],
    ['historical-reference bytes', { kind: 'file', name: 'historical-reference' } as const],
  ])('rejects tampered %s as fatal before any reservation or client', async (_label, tamper) => {
    const files = makeStep2Files();
    const expected = expectedForStep2Files(files);
    if (tamper.kind === 'dataset') {
      files['public-manifest'] = JSON.stringify({ datasetId: 'other-dataset', version: 1, cases: [] });
    } else {
      files[tamper.name as Step2FileName] = `${files[tamper.name as Step2FileName]}-tampered`;
    }
    const reserveCall = vi.fn(async (_key: unknown) => undefined);
    const createClient = vi.fn((_options: unknown) => ({ __mockClient: true }));

    const error = await verifyCalibrationPreflightState({
      files,
      expected,
      reserveCall,
      createClient,
    }).then(
      () => null,
      (cause: unknown) => cause,
    );

    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect(reserveCall).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it('rejects a malformed public-manifest envelope as fatal', async () => {
    const files = makeStep2Files({ 'public-manifest': 'not-json{' });
    const reserveCall = vi.fn(async (_key: unknown) => undefined);

    const error = await verifyCalibrationPreflightState({
      files,
      expected: expectedForStep2Files(makeStep2Files()),
      reserveCall,
    }).then(
      () => null,
      (cause: unknown) => cause,
    );

    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect(reserveCall).not.toHaveBeenCalled();
  });

  it('rejects synthetic lock bytes against the default pinned identities', async () => {
    const files = makeStep2Files();
    const reserveCall = vi.fn(async (_key: unknown) => undefined);
    const createClient = vi.fn((_options: unknown) => ({ __mockClient: true }));

    const error = await verifyCalibrationPreflightState({ files, reserveCall, createClient }).then(
      () => null,
      (cause: unknown) => cause,
    );

    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect(reserveCall).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe('calibration preflight fatal error privacy (Task7 preflight correction)', () => {
  it('rejects malformed public-manifest bytes with a safe message and no attached cause', async () => {
    const files = makeStep2Files({ 'public-manifest': MALFORMED_SENTINEL_BYTES });
    const reserveCall = vi.fn(async (_key: unknown) => undefined);
    const createClient = vi.fn((_options: unknown) => ({ __mockClient: true }));

    const error = await verifyCalibrationPreflightState({
      files,
      expected: expectedForStep2Files(makeStep2Files()),
      reserveCall,
      createClient,
    }).then(
      () => null,
      (cause: unknown) => cause,
    );

    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect((error as CalibrationFatalError).message).toBe(
      'calibration:preflight-json-invalid:public-manifest',
    );
    expectSafeFatalWithoutSentinel(error, PREFLIGHT_LEAK_SENTINEL);
    expect(reserveCall).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it('rejects schema-invalid public-manifest bytes with no attached validation cause', async () => {
    const files = makeStep2Files({
      'public-manifest': JSON.stringify({ datasetId: PREFLIGHT_LEAK_SENTINEL }),
    });
    const reserveCall = vi.fn(async (_key: unknown) => undefined);
    const createClient = vi.fn((_options: unknown) => ({ __mockClient: true }));

    const error = await verifyCalibrationPreflightState({
      files,
      expected: expectedForStep2Files(makeStep2Files()),
      reserveCall,
      createClient,
    }).then(
      () => null,
      (cause: unknown) => cause,
    );

    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect((error as CalibrationFatalError).message).toBe(
      'calibration:preflight-manifest-invalid',
    );
    expectSafeFatalWithoutSentinel(error, PREFLIGHT_LEAK_SENTINEL);
    expect(reserveCall).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it('rejects a JSON null public manifest with a safe message and no attached cause', async () => {
    const files = makeStep2Files({ 'public-manifest': 'null' });
    const reserveCall = vi.fn(async (_key: unknown) => undefined);

    const error = await verifyCalibrationPreflightState({
      files,
      expected: expectedForStep2Files(makeStep2Files()),
      reserveCall,
    }).then(
      () => null,
      (cause: unknown) => cause,
    );

    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect((error as CalibrationFatalError).message).toBe('calibration:preflight-manifest-invalid');
    expectSafeFatalWithoutSentinel(error, PREFLIGHT_LEAK_SENTINEL);
    expect(reserveCall).not.toHaveBeenCalled();
  });
});

describe('executeCalibrationPreflight Stage0 (Task7 Step2 RED)', () => {
  function makeStageDeps(overrides: {
    mediumVersion?: unknown;
    lowVersion?: unknown;
  } = {}): {
    reserveCall: ReturnType<typeof vi.fn>;
    countTokens: ReturnType<typeof vi.fn>;
    generateImage: ReturnType<typeof vi.fn>;
    recordSafeError: ReturnType<typeof vi.fn>;
  } {
    const lowVersion = 'lowVersion' in overrides ? overrides.lowVersion : STEP2_PINNED_VERSION;
    const mediumVersion = 'mediumVersion' in overrides ? overrides.mediumVersion : STEP2_PINNED_VERSION;
    const reserveCall = vi.fn(async (_key: unknown) => undefined);
    const countTokens = vi.fn(async (_request: unknown) => ({ tokenCount: 42 }));
    const generateImage = vi.fn(async (request: { profile: string }) => ({
      prediction: validStep2Prediction(),
      modelVersion: request.profile === 'LOW' ? lowVersion : mediumVersion,
    }));
    const recordSafeError = vi.fn((_entry: unknown) => undefined);
    return { reserveCall, countTokens, generateImage, recordSafeError };
  }

  it('reserves one token count then exactly LOW and MEDIUM images on the first dev case', async () => {
    const deps = makeStageDeps();
    const client = { __mockClient: true };

    const result = await executeCalibrationPreflight(client, {
      firstDevelopmentCaseId: STEP2_FIRST_DEV_CASE_ID,
      ...deps,
    });

    expect(result.pinnedModelVersion).toBe(STEP2_PINNED_VERSION);
    expect(deps.reserveCall).toHaveBeenCalledTimes(3);
    expect(deps.reserveCall.mock.calls.map((call) => call[0])).toEqual([
      {
        kind: 'token_count',
        stage: 'preflight',
        caseId: STEP2_FIRST_DEV_CASE_ID,
        model: STEP2_MODEL,
      },
      {
        stage: 'preflight',
        profile: 'LOW',
        caseId: STEP2_FIRST_DEV_CASE_ID,
        sampleIndex: 1,
      },
      {
        stage: 'preflight',
        profile: 'MEDIUM',
        caseId: STEP2_FIRST_DEV_CASE_ID,
        sampleIndex: 1,
      },
    ]);
    expect(deps.countTokens).toHaveBeenCalledTimes(1);
    expect(deps.countTokens.mock.calls[0]?.[0]).toEqual({ model: STEP2_MODEL });
    expect(deps.generateImage).toHaveBeenCalledTimes(2);
    expect(deps.generateImage.mock.calls[0]?.[0]).toEqual({
      model: STEP2_MODEL,
      profile: 'LOW',
      caseId: STEP2_FIRST_DEV_CASE_ID,
    });
    expect(deps.generateImage.mock.calls[1]?.[0]).toEqual({
      model: STEP2_MODEL,
      profile: 'MEDIUM',
      caseId: STEP2_FIRST_DEV_CASE_ID,
    });
    const order = (spy: ReturnType<typeof vi.fn>): number =>
      spy.mock.invocationCallOrder[0] ?? Number.NaN;
    expect(order(deps.reserveCall)).toBeLessThan(order(deps.countTokens));
    expect(order(deps.countTokens)).toBeLessThan(order(deps.generateImage));
    const imageOrders = deps.generateImage.mock.invocationCallOrder;
    expect(imageOrders[0]).toBeLessThan(imageOrders[1] ?? Number.NaN);
  });

  it('fails fatal with no retry when the MEDIUM model version drifts', async () => {
    const deps = makeStageDeps({ mediumVersion: 'gemini-3.8-other' });

    const error = await executeCalibrationPreflight(
      { __mockClient: true },
      { firstDevelopmentCaseId: STEP2_FIRST_DEV_CASE_ID, ...deps },
    ).then(
      () => null,
      (cause: unknown) => cause,
    );

    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect(deps.countTokens).toHaveBeenCalledTimes(1);
    expect(deps.generateImage).toHaveBeenCalledTimes(2);
  });

  it.each([['blank string', ''], ['missing', undefined], ['non-string', 42]])(
    'fails fatal with no retry on %s model version',
    async (_label, modelVersion) => {
      const deps = makeStageDeps({ lowVersion: modelVersion, mediumVersion: modelVersion });

      const error = await executeCalibrationPreflight(
        { __mockClient: true },
        { firstDevelopmentCaseId: STEP2_FIRST_DEV_CASE_ID, ...deps },
      ).then(
        () => null,
        (cause: unknown) => cause,
      );

      expect(error).toBeInstanceOf(CalibrationFatalError);
      expect(deps.generateImage).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ['non-record prediction', 'not-a-record'],
    ['negative nutrient', { kcal: -5, proteinG: 20, carbsG: 30, fatG: 10 }],
    ['null prediction', null],
  ])('fails fatal with no retry on %s', async (_label, prediction) => {
    const deps = makeStageDeps();
    deps.generateImage.mockImplementation(async () => ({
      prediction: prediction as Record<string, number> | null,
      modelVersion: STEP2_PINNED_VERSION,
    }));

    const error = await executeCalibrationPreflight(
      { __mockClient: true },
      { firstDevelopmentCaseId: STEP2_FIRST_DEV_CASE_ID, ...deps },
    ).then(
      () => null,
      (cause: unknown) => cause,
    );

    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect(deps.generateImage).toHaveBeenCalledTimes(1);
  });

  it('records only the safe category when the token call fails and never reaches images', async () => {
    const deps = makeStageDeps();
    const rawMarker = 'SECRET-TOKEN-MARKER-429';
    deps.countTokens.mockRejectedValueOnce(
      Object.assign(new Error(`quota exceeded ${rawMarker}`), {
        status: 429,
        url: 'https://secret-endpoint.example/token',
      }),
    );

    const error = await executeCalibrationPreflight(
      { __mockClient: true },
      { firstDevelopmentCaseId: STEP2_FIRST_DEV_CASE_ID, ...deps },
    ).then(
      () => null,
      (cause: unknown) => cause,
    );

    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect(deps.generateImage).not.toHaveBeenCalled();
    expect(deps.countTokens).toHaveBeenCalledTimes(1);
    expect(deps.recordSafeError).toHaveBeenCalledTimes(1);
    const entry = deps.recordSafeError.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(entry.errorCategory).toBe('http_429');
    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain(rawMarker);
    expect(serialized).not.toContain('secret-endpoint.example');
    expect(serialized).not.toContain('https://');
  });

  it('records only the safe category when the LOW image call fails and never retries MEDIUM', async () => {
    const deps = makeStageDeps();
    const rawMarker = 'SECRET-IMAGE-MARKER-500';
    deps.generateImage.mockRejectedValueOnce(
      Object.assign(new Error(`backend failure ${rawMarker}`), {
        status: 500,
        url: 'https://secret-endpoint.example/vision',
      }),
    );

    const error = await executeCalibrationPreflight(
      { __mockClient: true },
      { firstDevelopmentCaseId: STEP2_FIRST_DEV_CASE_ID, ...deps },
    ).then(
      () => null,
      (cause: unknown) => cause,
    );

    expect(error).toBeInstanceOf(CalibrationFatalError);
    expect(deps.generateImage).toHaveBeenCalledTimes(1);
    expect(deps.recordSafeError).toHaveBeenCalledTimes(1);
    const entry = deps.recordSafeError.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(entry.errorCategory).toBe('http_5xx');
    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain(rawMarker);
    expect(serialized).not.toContain('secret-endpoint.example');
  });

  it('propagates a fatal error when recordSafeError rejects asynchronously during token-count failure', async () => {
    const deps = makeStageDeps();
    const sentinel = 'SECRET-RECORDER-EIO-PATH';
    const tokenMarker = 'SECRET-TOKEN-MARKER-429';
    deps.countTokens.mockRejectedValueOnce(
      Object.assign(new Error(`quota exceeded ${tokenMarker}`), {
        status: 429,
        url: 'https://secret-endpoint.example/token',
      }),
    );
    deps.recordSafeError.mockRejectedValueOnce(new Error(`recorder failure ${sentinel}`));

    const error = await executeCalibrationPreflight(
      { __mockClient: true },
      { firstDevelopmentCaseId: STEP2_FIRST_DEV_CASE_ID, ...deps },
    ).then(
      () => null,
      (cause: unknown) => cause,
    );

    expectSafeFatalWithoutSentinel(error, sentinel);
    expectSafeFatalWithoutSentinel(error, tokenMarker);
    const fatal = error as CalibrationFatalError;
    expect(fatal.message).toBe('calibration:preflight-safe-error-persist-failed');
    expect(deps.generateImage).not.toHaveBeenCalled();
    expect(deps.reserveCall).toHaveBeenCalledTimes(1);
    expect(deps.countTokens).toHaveBeenCalledTimes(1);
    expect(deps.recordSafeError).toHaveBeenCalledTimes(1);
  });

  it('propagates a fatal error when recordSafeError throws synchronously during LOW image failure', async () => {
    const deps = makeStageDeps();
    const sentinel = 'SECRET-RECORDER-EIO-PATH';
    const imageMarker = 'SECRET-IMAGE-MARKER-500';
    deps.generateImage.mockRejectedValueOnce(
      Object.assign(new Error(`backend failure ${imageMarker}`), {
        status: 500,
        url: 'https://secret-endpoint.example/vision',
      }),
    );
    deps.recordSafeError.mockImplementationOnce(() => {
      throw new Error(`recorder failure ${sentinel}`);
    });

    const error = await executeCalibrationPreflight(
      { __mockClient: true },
      { firstDevelopmentCaseId: STEP2_FIRST_DEV_CASE_ID, ...deps },
    ).then(
      () => null,
      (cause: unknown) => cause,
    );

    expectSafeFatalWithoutSentinel(error, sentinel);
    expectSafeFatalWithoutSentinel(error, imageMarker);
    const fatal = error as CalibrationFatalError;
    expect(fatal.message).toBe('calibration:preflight-safe-error-persist-failed');
    expect(deps.generateImage).toHaveBeenCalledTimes(1);
    expect(deps.reserveCall).toHaveBeenCalledTimes(2);
    expect(deps.countTokens).toHaveBeenCalledTimes(1);
    expect(deps.recordSafeError).toHaveBeenCalledTimes(1);
  });
});

describe('calibration preflight safe-error taxonomy (Task7 Step2 RED)', () => {
  it('exposes exactly the 13 privacy-safe provider categories', () => {
    expect([...CALIBRATION_PREFLIGHT_SAFE_ERROR_CATEGORIES].sort()).toEqual(
      [...STEP2_SAFE_CATEGORIES].sort(),
    );
  });
});

describe('calibration CLI preflight provider wiring (Task7 Step2 RED)', () => {
  function syntheticFiles(): Record<string, string> {
    const files = makeStep2Files();
    return { ...files };
  }

  it('fails closed before any client/token/image work when the verify fake rejects', async () => {
    const harness = makeHarness();
    harness.verifyPreflightState.mockRejectedValueOnce(new Error('tampered manifest'));
    const countTokens = vi.fn(async () => ({ tokenCount: 1 }));
    const generateImage = vi.fn(async () => ({
      prediction: validStep2Prediction(),
      modelVersion: STEP2_PINNED_VERSION,
    }));

    const result = await runCalibrationCli(['preflight'], liveEnv(), {
      ...harness.deps,
      countTokens,
      generateImage,
    } as CalibrationCliDeps);

    expect(result.exitCode).toBe(1);
    expect(harness.createClient).not.toHaveBeenCalled();
    expect(harness.executeStage).not.toHaveBeenCalled();
    expect(countTokens).not.toHaveBeenCalled();
    expect(generateImage).not.toHaveBeenCalled();
  });

  it('fails closed with no hook bypass when the verify fake is omitted and bytes are synthetic', async () => {
    const createClient = vi.fn((_options: unknown) => ({ __mockClient: true }));
    const countTokens = vi.fn(async () => ({ tokenCount: 1 }));
    const generateImage = vi.fn(async () => ({
      prediction: validStep2Prediction(),
      modelVersion: STEP2_PINNED_VERSION,
    }));
    const reserveCall = vi.fn(async (_key: unknown) => undefined);

    const result = await runCalibrationCli(['preflight'], liveEnv(), {
      createClient,
      readCommittedFile: async (name: string) => syntheticFiles()[name] ?? '',
      reserveCall,
      countTokens,
      generateImage,
      readLedgerSelectedProfile: () => undefined,
      readLedgerModel: () => STEP2_MODEL,
    } as unknown as CalibrationCliDeps);

    expect(result.exitCode).toBe(1);
    expect(createClient).not.toHaveBeenCalled();
    expect(reserveCall).not.toHaveBeenCalled();
    expect(countTokens).not.toHaveBeenCalled();
    expect(generateImage).not.toHaveBeenCalled();
  });
});
