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
 * dispatch, no `fetch`, no filesystem, no Firebase, no network. Every
 * rejection test asserts the client factory was never called, proving the
 * malformed config returns before `GoogleGenAI` client construction.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  CALIBRATION_API_VERSION,
  CALIBRATION_BASE_URL,
  CALIBRATION_LIVE_ENV_FLAG,
  CALIBRATION_MODEL,
  CALIBRATION_TIMEOUT_MS,
  CALIBRATION_VERTEX_LOCATION,
  CALIBRATION_VERTEX_PROJECT,
  runCalibrationCli,
} from '../../src/nutrition-eval/calibration-cli';
import type {
  CalibrationCliDeps,
  CalibrationCliResult,
} from '../../src/nutrition-eval/calibration-cli';

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
