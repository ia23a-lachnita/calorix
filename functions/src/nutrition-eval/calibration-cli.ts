/**
 * Dedicated calibration CLI (Task 7 Step 4, parser-only slice).
 *
 * Single entry point for `preflight`, `development`, `validation`, and
 * `benchmark`. Every gate runs before any hook is called, so a malformed
 * configuration can never construct the Vertex client or dispatch a provider
 * request. The only dispatch order is `verifyPreflightState` -> `createClient`
 * -> `executeStage`.
 *
 * Vertex identity is re-exported verbatim from `genai-adapter.ts`, the single
 * source of truth shared with the live adapter; the live opt-in flag
 * `CALIBRATION_LIVE_ENV_FLAG` is owned here.
 *
 * This slice is dependency-injected only. `verifyPreflightState`,
 * `executeStage`, `readLedgerSelectedProfile`, and `readLedgerModel` have no
 * built-in implementation, so an omitted hook fails closed before client
 * construction instead of dispatching. Committed-asset preflight verification
 * and the real preflight/stage execution are separate bounded slices.
 */
import {
  CALIBRATION_API_VERSION,
  CALIBRATION_BASE_URL,
  CALIBRATION_MODEL,
  CALIBRATION_TIMEOUT_MS,
  CALIBRATION_VERTEX_LOCATION,
  CALIBRATION_VERTEX_PROJECT,
} from '../genai-adapter';

export {
  CALIBRATION_API_VERSION,
  CALIBRATION_BASE_URL,
  CALIBRATION_MODEL,
  CALIBRATION_TIMEOUT_MS,
  CALIBRATION_VERTEX_LOCATION,
  CALIBRATION_VERTEX_PROJECT,
} from '../genai-adapter';

export const CALIBRATION_LIVE_ENV_FLAG = 'RUN_NUTRITION_CALIBRATION_LIVE';

export const CALIBRATION_CLI_STAGES = [
  'preflight',
  'development',
  'validation',
  'benchmark',
] as const;

export type CalibrationCliStage = (typeof CALIBRATION_CLI_STAGES)[number];

export type CalibrationCliThinkingLevel = 'low' | 'medium';

export type CalibrationLedgerSelectedProfile = 'LOW' | 'MEDIUM';

export type CalibrationCliFailureCode =
  | 'invalid_command'
  | 'opt_in_missing'
  | 'identity_mismatch'
  | 'gemini_2_5_forbidden'
  | 'override_forbidden'
  | 'thinking_level_forbidden'
  | 'thinking_level_required'
  | 'thinking_level_invalid'
  | 'thinking_level_mismatch'
  | 'ledger_pin_unavailable'
  | 'dependency_missing'
  | 'preflight_verification_failed'
  | 'client_construction_failed'
  | 'stage_failed';

export interface CalibrationClientOptions {
  vertexai: true;
  project: typeof CALIBRATION_VERTEX_PROJECT;
  location: typeof CALIBRATION_VERTEX_LOCATION;
  apiVersion: typeof CALIBRATION_API_VERSION;
  httpOptions: {
    baseUrl: typeof CALIBRATION_BASE_URL;
    timeout: typeof CALIBRATION_TIMEOUT_MS;
  };
}

export interface CalibrationCliDeps {
  verifyPreflightState?: (stage: CalibrationCliStage) => Promise<void>;
  createClient?: (options: CalibrationClientOptions) => unknown;
  executeStage?: (stage: CalibrationCliStage, client: unknown) => Promise<void>;
  readLedgerSelectedProfile?: () => CalibrationLedgerSelectedProfile | undefined;
  readLedgerModel?: () => string | undefined;
}

export interface CalibrationCliResult {
  exitCode: 0 | 1;
  failureCode?: CalibrationCliFailureCode;
}

const GEMINI_25_FRAGMENT = '2.5';

const LEDGER_SELECTED_STAGES: readonly CalibrationCliStage[] = ['validation', 'benchmark'];

const THINKING_LEVELS: readonly CalibrationCliThinkingLevel[] = ['low', 'medium'];

const THINKING_LEVEL_FLAG = '--thinking-level';

const FORBIDDEN_ENDPOINT_ENV_KEYS = [
  'GOOGLE_VERTEX_BASE_URL',
  'GOOGLE_GEMINI_BASE_URL',
] as const;

const FORBIDDEN_RETRY_ENV_KEYS = [
  'GOOGLE_GENAI_RETRY_OPTIONS',
  'CALIBRATION_MAX_RETRIES',
] as const;

const FORBIDDEN_RUN_DIR_ENV_KEYS = [
  'CALIBRATION_RUN_DIR',
  'CALIBRATION_OUTPUT_DIR',
  'CALORIX_NUTRITION_EVAL_OUTPUT_DIR',
] as const;

const PINNED_IDENTITY_ENV_KEYS = [
  { key: 'CALORIX_NUTRITION_EVAL_PROJECT', pinned: CALIBRATION_VERTEX_PROJECT },
  { key: 'CALORIX_NUTRITION_EVAL_LOCATION', pinned: CALIBRATION_VERTEX_LOCATION },
  { key: 'CALORIX_NUTRITION_EVAL_MODEL', pinned: CALIBRATION_MODEL },
] as const;

function fail(failureCode: CalibrationCliFailureCode): CalibrationCliResult {
  return { exitCode: 1, failureCode };
}

function succeed(): CalibrationCliResult {
  return { exitCode: 0 };
}

function nonblank(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isCalibrationCliStage(value: string): value is CalibrationCliStage {
  return (CALIBRATION_CLI_STAGES as readonly string[]).includes(value);
}

function isCalibrationCliThinkingLevel(value: string): value is CalibrationCliThinkingLevel {
  return (THINKING_LEVELS as readonly string[]).includes(value);
}

function isLedgerSelectedStage(stage: CalibrationCliStage): boolean {
  return LEDGER_SELECTED_STAGES.includes(stage);
}

function referencesGemini25(values: Iterable<string | undefined>): boolean {
  for (const value of values) {
    if (typeof value === 'string' && value.includes(GEMINI_25_FRAGMENT)) return true;
  }
  return false;
}

function ledgerProfile(level: CalibrationCliThinkingLevel): CalibrationLedgerSelectedProfile {
  return level === 'low' ? 'LOW' : 'MEDIUM';
}

interface ParsedCalibrationArgv {
  stage: CalibrationCliStage;
  thinkingLevel?: CalibrationCliThinkingLevel | undefined;
}

type CalibrationArgvParse =
  | { ok: true; parsed: ParsedCalibrationArgv }
  | { ok: false; failureCode: CalibrationCliFailureCode };

function parseCalibrationArgv(argv: readonly string[]): CalibrationArgvParse {
  const stage = argv[0];
  if (typeof stage !== 'string' || !isCalibrationCliStage(stage)) {
    return { ok: false, failureCode: 'invalid_command' };
  }
  let requestedThinkingLevel: string | undefined;
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag !== THINKING_LEVEL_FLAG
      || requestedThinkingLevel !== undefined
      || typeof value !== 'string'
      || value.startsWith('--')) {
      return { ok: false, failureCode: 'invalid_command' };
    }
    requestedThinkingLevel = value;
    index += 1;
  }
  if (requestedThinkingLevel === undefined) {
    return isLedgerSelectedStage(stage)
      ? { ok: false, failureCode: 'thinking_level_required' }
      : { ok: true, parsed: { stage } };
  }
  if (!isLedgerSelectedStage(stage)) {
    return { ok: false, failureCode: 'thinking_level_forbidden' };
  }
  if (!isCalibrationCliThinkingLevel(requestedThinkingLevel)) {
    return { ok: false, failureCode: 'thinking_level_invalid' };
  }
  return { ok: true, parsed: { stage, thinkingLevel: requestedThinkingLevel } };
}

function validateCalibrationEnv(
  env: Record<string, string | undefined>,
): CalibrationCliFailureCode | undefined {
  if (env[CALIBRATION_LIVE_ENV_FLAG] !== '1') return 'opt_in_missing';
  for (const key of FORBIDDEN_ENDPOINT_ENV_KEYS) {
    if (env[key]?.trim()) return 'override_forbidden';
  }
  for (const key of FORBIDDEN_RETRY_ENV_KEYS) {
    if (env[key]) return 'override_forbidden';
  }
  for (const key of FORBIDDEN_RUN_DIR_ENV_KEYS) {
    if (env[key]?.trim()) return 'override_forbidden';
  }
  for (const identity of PINNED_IDENTITY_ENV_KEYS) {
    const configured = nonblank(env[identity.key]);
    if (configured !== undefined && configured !== identity.pinned) return 'identity_mismatch';
  }
  return undefined;
}

function calibrationClientOptions(): CalibrationClientOptions {
  return {
    vertexai: true,
    project: CALIBRATION_VERTEX_PROJECT,
    location: CALIBRATION_VERTEX_LOCATION,
    apiVersion: CALIBRATION_API_VERSION,
    httpOptions: {
      baseUrl: CALIBRATION_BASE_URL,
      timeout: CALIBRATION_TIMEOUT_MS,
    },
  };
}

export async function runCalibrationCli(
  argv: readonly string[],
  env: Record<string, string | undefined> = process.env,
  deps: CalibrationCliDeps = {},
): Promise<CalibrationCliResult> {
  const tokens: readonly string[] = Array.isArray(argv) ? argv : [];
  const source = env ?? {};
  const hooks = deps ?? {};

  if (referencesGemini25(tokens) || referencesGemini25(Object.values(source))) {
    return fail('gemini_2_5_forbidden');
  }

  const parsedArgv = parseCalibrationArgv(tokens);
  if (!parsedArgv.ok) return fail(parsedArgv.failureCode);
  const stage = parsedArgv.parsed.stage;
  const thinkingLevel = parsedArgv.parsed.thinkingLevel;

  const envFailure = validateCalibrationEnv(source);
  if (envFailure !== undefined) return fail(envFailure);

  const verifyPreflightState = hooks.verifyPreflightState;
  const createClient = hooks.createClient;
  const executeStage = hooks.executeStage;
  const readLedgerSelectedProfile = hooks.readLedgerSelectedProfile;
  const readLedgerModel = hooks.readLedgerModel;
  if (!verifyPreflightState || !createClient || !executeStage || !readLedgerModel) {
    return fail('dependency_missing');
  }
  if (isLedgerSelectedStage(stage) && !readLedgerSelectedProfile) {
    return fail('dependency_missing');
  }

  let ledgerModel: string | undefined;
  try {
    ledgerModel = readLedgerModel();
  } catch {
    return fail('ledger_pin_unavailable');
  }
  const pinnedLedgerModel = nonblank(ledgerModel);
  if (pinnedLedgerModel === undefined) return fail('ledger_pin_unavailable');
  if (pinnedLedgerModel.includes(GEMINI_25_FRAGMENT)) return fail('gemini_2_5_forbidden');
  if (pinnedLedgerModel !== CALIBRATION_MODEL) return fail('identity_mismatch');

  if (thinkingLevel !== undefined) {
    let selectedProfile: CalibrationLedgerSelectedProfile | undefined;
    try {
      selectedProfile = readLedgerSelectedProfile?.();
    } catch {
      return fail('ledger_pin_unavailable');
    }
    if (selectedProfile !== 'LOW' && selectedProfile !== 'MEDIUM') {
      return fail('ledger_pin_unavailable');
    }
    if (selectedProfile !== ledgerProfile(thinkingLevel)) return fail('thinking_level_mismatch');
  }

  try {
    await verifyPreflightState(stage);
  } catch {
    return fail('preflight_verification_failed');
  }

  let client: unknown;
  try {
    client = createClient(calibrationClientOptions());
  } catch {
    return fail('client_construction_failed');
  }

  try {
    await executeStage(stage, client);
  } catch {
    return fail('stage_failed');
  }

  return succeed();
}

if (require.main === module) {
  void runCalibrationCli(process.argv.slice(2), process.env).then((result) => {
    process.exitCode = result.exitCode;
  }).catch(() => {
    process.exitCode = 1;
  });
}
