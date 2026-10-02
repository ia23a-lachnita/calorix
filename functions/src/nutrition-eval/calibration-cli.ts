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
 * `verifyCalibrationPreflightState` is the committed-asset identity boundary:
 * it validates the pinned dataset id, the semantic public-manifest and prompt
 * hashes, the canonical three-source response-schema identity, and the raw
 * committed lock/manifest/reference digests, then derives the deterministic
 * first development case and records the declared historical incompatibilities.
 * It reserves nothing and constructs no client, and any parse, identity, or
 * tamper failure throws `CalibrationFatalError` before the caller can reach
 * `reserveCall`/`createClient`. Every exported fatal carries only its
 * identity-naming message and never attaches the offending parser or Zod
 * exception, so malformed committed bytes cannot leak through the error.
 *
 * `executeCalibrationPreflight` is the hermetic Stage 0 primitive: it reserves
 * exactly one separately typed token-count key and then the `LOW` and `MEDIUM`
 * image keys of the first development case, driving every provider effect
 * through injected `countTokens`/`generateImage`/`reserveCall`/token-terminal/
 * `recordSafeError` hooks. It pins the first `LOW` model version, requires `MEDIUM` to match it
 * exactly, treats any reservation, provider, parse, or version failure as
 * `CalibrationFatalError` with zero retry and no `MEDIUM` call after a `LOW`
 * failure, and records only a privacy-safe `classifyCalibrationError` category
 * (`empty_response` for a malformed normalized result). The passed client is
 * never dispatched through: the built-in `verifyPreflightState`, `executeStage`,
 * `readLedgerSelectedProfile`, and `readLedgerModel` hooks and any live dispatch
 * remain unimplemented, so an omitted hook still fails closed before client
 * construction instead of dispatching. `runCalibrationCli` stays fail-closed and
 * dependency-injected only.
 */
import { createHash } from 'crypto';

import {
  CALIBRATION_API_VERSION,
  CALIBRATION_BASE_URL,
  CALIBRATION_MODEL,
  CALIBRATION_SAFE_ERROR_CATEGORIES,
  CALIBRATION_TIMEOUT_MS,
  CALIBRATION_VERTEX_LOCATION,
  CALIBRATION_VERTEX_PROJECT,
  classifyCalibrationError,
  type CalibrationSafeErrorCategory,
} from '../genai-adapter';
import type {
  CalibrationProfile,
  ReservationKey,
  TokenCountReservationKey,
} from './calibration';
import { hashNutritionEvalManifest, hashNutritionEvalPrompts } from './cli';
import { CalibrationFatalError } from './fatal-error';
import { StrictCalibrationManifestSchema } from './schema';

export {
  CALIBRATION_API_VERSION,
  CALIBRATION_BASE_URL,
  CALIBRATION_MODEL,
  CALIBRATION_TIMEOUT_MS,
  CALIBRATION_VERTEX_LOCATION,
  CALIBRATION_VERTEX_PROJECT,
} from '../genai-adapter';

export type { CalibrationSafeErrorCategory } from '../genai-adapter';

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

// ── Pinned committed-asset identities ───────────────────────────────────────
//
// Two distinct identity kinds are pinned here and never mixed:
//
// * Semantic identities. The public manifest and the prompt triple are hashed
//   through the same canonical helpers the evaluator reports use
//   (`hashNutritionEvalManifest` / `hashNutritionEvalPrompts`), so a byte-level
//   reformat that preserves meaning is not a false alarm, and the values match
//   the `datasetHash`/`promptHash` recorded in committed reports.
// * Raw committed-byte digests. The calibration source lock, the strict
//   calibration manifest, the OFF snapshot lock, and the historical reference
//   are compared as raw bytes, because each one is a committed artifact whose
//   exact serialization is part of its identity.

/** Dataset identity every calibration stage runs against. */
export const CALIBRATION_PREFLIGHT_DATASET_ID = 'calorix-public-v1';

/** Canonical semantic hash of the committed 20-case public manifest. */
export const CALIBRATION_PUBLIC_MANIFEST_HASH =
  '2dc17d06752c2981862690953a7b134235bb6a20da4dc9b5fef5528f91f5bb56';

/** Canonical semantic hash of the committed meal/label/barcode prompt triple. */
export const CALIBRATION_PROMPT_HASH =
  '205b635a252e1f378023f5e1f3c670a6fba0ecfdfc8ce4f08f30efa24c544263';

/**
 * Canonical parse/stringify hash of the shipped three-source response schema
 * (`visionResponseJsonSchema` for meal, label, and barcode). Key order is the
 * source-defined order, so a real run must supply exactly that serialization.
 */
export const CALIBRATION_RESPONSE_SCHEMA_HASH =
  '1237ece38177ff83fcbb97fb0630718ca8943b0f17833721f19d4510876e94b0';

/** Raw committed-byte digest of `functions/eval/nutrition/calibration-source-lock.json`. */
export const CALIBRATION_SOURCE_LOCK_SHA256 =
  'f1138680a38aa64eb400bc20c89ec656d771e8f3823ae09bed956a48eff2a43b';

/** Raw committed-byte digest of `functions/eval/nutrition/calibration-manifest.json`. */
export const CALIBRATION_MANIFEST_SHA256 =
  '313c37c14cb912d5dc6410dbb3b812139c22d7533d2341678de3ac860b0c1d6d';

/** Raw committed-byte digest of `functions/eval/nutrition/off-snapshot-lock.json`. */
export const CALIBRATION_OFF_SNAPSHOT_LOCK_SHA256 =
  '2b9d7b9baecb22ec20662f52010810fdb4f2fde3dd7c464d73b0cb56855003a1';

/** Raw committed-byte digest of `functions/eval/nutrition/historical-reference-v1.json`. */
export const CALIBRATION_HISTORICAL_REFERENCE_SHA256 =
  'fd712bee2d4229bc8476d1cc25fce1a21172e6013c6abfe8949498cc5ce15acb';

/**
 * Privacy-safe provider categories stored in the ledger/report safe-error
 * field. Re-exported from the single adapter authority so the classifier and
 * the recorded taxonomy can never drift apart.
 */
export const CALIBRATION_PREFLIGHT_SAFE_ERROR_CATEGORIES = CALIBRATION_SAFE_ERROR_CATEGORIES;

export const CALIBRATION_PREFLIGHT_FILE_NAMES = [
  'public-manifest',
  'prompt',
  'response-schema',
  'source-lock',
  'calibration-manifest',
  'off-lock',
  'historical-reference',
] as const;

export type CalibrationPreflightFileName = (typeof CALIBRATION_PREFLIGHT_FILE_NAMES)[number];

export interface CalibrationPreflightExpectedIdentities {
  datasetId: string;
  publicManifestHash: string;
  promptHash: string;
  responseSchemaHash: string;
  sourceLockHash: string;
  calibrationManifestHash: string;
  offLockHash: string;
  historicalReferenceHash: string;
}

/**
 * The exact committed identities the CLI gates on. Frozen so no caller can
 * widen the default gate; a test-only override is passed explicitly instead.
 */
export const CALIBRATION_PREFLIGHT_EXPECTED_IDENTITIES: Readonly<CalibrationPreflightExpectedIdentities> =
  Object.freeze({
    datasetId: CALIBRATION_PREFLIGHT_DATASET_ID,
    publicManifestHash: CALIBRATION_PUBLIC_MANIFEST_HASH,
    promptHash: CALIBRATION_PROMPT_HASH,
    responseSchemaHash: CALIBRATION_RESPONSE_SCHEMA_HASH,
    sourceLockHash: CALIBRATION_SOURCE_LOCK_SHA256,
    calibrationManifestHash: CALIBRATION_MANIFEST_SHA256,
    offLockHash: CALIBRATION_OFF_SNAPSHOT_LOCK_SHA256,
    historicalReferenceHash: CALIBRATION_HISTORICAL_REFERENCE_SHA256,
  });

export const CALIBRATION_PREFLIGHT_COMPATIBILITY_NOTE_KEYS = [
  'historicalCodeSha',
  'generationProfile',
  'mediaTypeLabel',
  'offRoute',
  'sliceGCaveat',
] as const;

export type CalibrationCompatibilityNoteKey =
  (typeof CALIBRATION_PREFLIGHT_COMPATIBILITY_NOTE_KEYS)[number];

export interface CalibrationCompatibilityNote {
  readonly key: CalibrationCompatibilityNoteKey;
  readonly detail: string;
}

/**
 * The historical aggregate is comparable only as evidence, never as a
 * like-for-like baseline. Each note is fixed static text: it names the pinned
 * commit identity of the difference and never embeds prompts, responses, asset
 * bytes, endpoint hostnames, or any other raw provider or asset content.
 */
export const CALIBRATION_PREFLIGHT_COMPATIBILITY_NOTES: ReadonlyArray<CalibrationCompatibilityNote> =
  Object.freeze([
    Object.freeze({
      key: 'historicalCodeSha' as const,
      detail:
        'The frozen historical aggregate was produced by implementation tree '
        + 'bb414d1850fb9f91cc419b4a270138354abf5535. Calibration runs from a later tree, so no '
        + 'code-level equivalence with the historical run is claimed.',
    }),
    Object.freeze({
      key: 'generationProfile' as const,
      detail:
        'The historical aggregate records a single unspecified generation profile with no '
        + 'LOW/MEDIUM split, while calibration enumerates an explicit LOW profile and an explicit '
        + 'MEDIUM profile. Per-profile results are therefore not a like-for-like replacement.',
    }),
    Object.freeze({
      key: 'mediaTypeLabel' as const,
      detail:
        'The historical run labeled its imagery with a JPEG media type while the committed public '
        + 'manifest and calibration corpus declare PNG bytes. Calibration passes the real '
        + 'calibration media type, so media-type labels differ between the aggregate and this run.',
    }),
    Object.freeze({
      key: 'offRoute' as const,
      detail:
        'The historical run resolved catalog nutrients over the live Open Food Facts route, while '
        + 'calibration replays the committed OFF snapshot lock through the production parser. '
        + 'Barcode and label nutrient provenance is not comparable.',
    }),
    Object.freeze({
      key: 'sliceGCaveat' as const,
      detail:
        'The historical aggregate predates the catalog reliability fix at commit '
        + 'd9492b60d06296b54f51d951b0d5fb4ae8c89ed8: one transient supplied-barcode catalog miss '
        + 'fell through to a catastrophic vision estimate, so the aggregate is valid historical '
        + 'evidence but not a like-for-like barcode-routing implementation baseline.',
    }),
  ]);

export interface CalibrationPreflightReport {
  datasetId: typeof CALIBRATION_PREFLIGHT_DATASET_ID;
  publicManifestHash: string;
  promptHash: string;
  firstDevelopmentCaseId: string;
  compatibilityNotes: ReadonlyArray<CalibrationCompatibilityNote>;
  historicalCompatible: false;
}

export interface CalibrationPreflightDeps {
  /** Raw committed bytes keyed by pinned file name; every key must be present. */
  files: Record<CalibrationPreflightFileName, string>;
  /**
   * Identity overrides exist only so hermetic tests can verify bytes that have
   * no committed counterpart. The default CLI never passes this and is always
   * gated by `CALIBRATION_PREFLIGHT_EXPECTED_IDENTITIES`.
   */
  expected?: CalibrationPreflightExpectedIdentities;
  /** Accepted for the shared hook bundle; verification itself never reserves. */
  reserveCall?: (key: unknown) => Promise<void> | void;
  /** Accepted for the shared hook bundle; verification constructs no client. */
  createClient?: (options: CalibrationClientOptions) => unknown;
}

/**
 * Builds the only fatal this slice is allowed to export. The raw parser or Zod
 * exception is deliberately dropped instead of being attached as `cause`:
 * `JSON.parse` embeds the offending bytes in its `SyntaxError` message, and a
 * Zod error can echo received values, so an attached cause would let malformed
 * committed-asset content escape through `error.cause`, `error.stack`, or any
 * error inspection into a log, report, or ledger entry. The helper takes no
 * cause parameter at all, so no future call site can reintroduce the channel;
 * the safe identity-naming `message` is the entire exported error.
 */
function preflightFatal(message: string): CalibrationFatalError {
  return new CalibrationFatalError(message);
}

function guardPreflight<T>(message: string, read: () => T): T {
  try {
    return read();
  } catch (error) {
    // A nested fatal already carries a safe identity-naming message; only a
    // raw foreign exception is replaced by the message named for this step.
    if (error instanceof CalibrationFatalError) throw error;
    throw preflightFatal(message);
  }
}

/**
 * Fatal messages name the identity only, never the compared values, so a
 * mismatch can never leak prompt text, manifest content, or asset bytes into a
 * log, report, or ledger entry.
 */
function assertPreflightIdentity(identity: string, actual: string, expected: string): void {
  if (actual !== expected) {
    throw new CalibrationFatalError(`calibration:preflight-identity-mismatch:${identity}`);
  }
}

function sha256Hex(bytes: string): string {
  return createHash('sha256').update(bytes, 'utf8').digest('hex');
}

function parsePreflightJson(name: CalibrationPreflightFileName, bytes: string): unknown {
  return guardPreflight(
    `calibration:preflight-json-invalid:${name}`,
    () => JSON.parse(bytes) as unknown,
  );
}

function readPreflightFile(
  files: Record<CalibrationPreflightFileName, string>,
  name: CalibrationPreflightFileName,
): string {
  const bytes = files?.[name];
  if (typeof bytes !== 'string') {
    throw new CalibrationFatalError(`calibration:preflight-file-missing:${name}`);
  }
  return bytes;
}

function promptHashFromBytes(bytes: string): string {
  const triple = parsePreflightJson('prompt', bytes);
  if (!Array.isArray(triple) || triple.length !== 3
    || triple.some((part) => typeof part !== 'string')) {
    throw new CalibrationFatalError('calibration:preflight-prompt-invalid');
  }
  const [mealPrompt, labelPrompt, barcodePrompt] = triple as [string, string, string];
  return hashNutritionEvalPrompts(mealPrompt, labelPrompt, barcodePrompt);
}

/** Canonical parse-then-stringify identity, so formatting-only edits cannot drift it. */
function responseSchemaHashFromBytes(bytes: string): string {
  return sha256Hex(JSON.stringify(parsePreflightJson('response-schema', bytes)) as string);
}

/**
 * The deterministic preflight case is the first development case in committed
 * slot order. The strict schema already pins `slotIndex` to array position and
 * `group` to the development slot range, so this can only resolve to slot 0.
 */
function firstDevelopmentCaseIdFromManifest(bytes: string): string {
  const manifest = guardPreflight(
    'calibration:preflight-manifest-invalid',
    () => StrictCalibrationManifestSchema.parse(parsePreflightJson('calibration-manifest', bytes)),
  );
  const first = manifest.cases.find((calibrationCase) => calibrationCase.group === 'development');
  if (first === undefined) {
    throw new CalibrationFatalError('calibration:preflight-manifest-development-missing');
  }
  return first.id;
}

/**
 * Verifies every pinned committed identity before a caller may reserve a call
 * or construct a client. Fails closed with `CalibrationFatalError` on any
 * missing file, unparsable asset, schema violation, or identity mismatch; it
 * never calls `reserveCall` or `createClient`, so a tampered or foreign asset
 * cannot reach the provider boundary.
 */
export async function verifyCalibrationPreflightState(
  deps: CalibrationPreflightDeps,
): Promise<CalibrationPreflightReport> {
  const expected = deps?.expected ?? CALIBRATION_PREFLIGHT_EXPECTED_IDENTITIES;
  const files = deps?.files ?? ({} as Record<CalibrationPreflightFileName, string>);

  const publicManifest = parsePreflightJson(
    'public-manifest',
    readPreflightFile(files, 'public-manifest'),
  );
  const publicManifestHash = guardPreflight(
    'calibration:preflight-manifest-invalid',
    () => hashNutritionEvalManifest(publicManifest),
  );
  const datasetId = (publicManifest as { datasetId?: unknown }).datasetId;
  if (typeof datasetId !== 'string') {
    throw new CalibrationFatalError('calibration:preflight-dataset-id-missing');
  }
  assertPreflightIdentity('dataset-id', datasetId, expected.datasetId);
  assertPreflightIdentity('public-manifest', publicManifestHash, expected.publicManifestHash);

  const promptHash = promptHashFromBytes(readPreflightFile(files, 'prompt'));
  assertPreflightIdentity('prompt', promptHash, expected.promptHash);

  const responseSchemaHash = responseSchemaHashFromBytes(
    readPreflightFile(files, 'response-schema'),
  );
  assertPreflightIdentity('response-schema', responseSchemaHash, expected.responseSchemaHash);

  assertPreflightIdentity(
    'source-lock',
    sha256Hex(readPreflightFile(files, 'source-lock')),
    expected.sourceLockHash,
  );
  assertPreflightIdentity(
    'off-lock',
    sha256Hex(readPreflightFile(files, 'off-lock')),
    expected.offLockHash,
  );
  assertPreflightIdentity(
    'historical-reference',
    sha256Hex(readPreflightFile(files, 'historical-reference')),
    expected.historicalReferenceHash,
  );

  const calibrationManifestBytes = readPreflightFile(files, 'calibration-manifest');
  assertPreflightIdentity(
    'calibration-manifest',
    sha256Hex(calibrationManifestBytes),
    expected.calibrationManifestHash,
  );

  return {
    datasetId: CALIBRATION_PREFLIGHT_DATASET_ID,
    publicManifestHash,
    promptHash,
    firstDevelopmentCaseId: firstDevelopmentCaseIdFromManifest(calibrationManifestBytes),
    compatibilityNotes: CALIBRATION_PREFLIGHT_COMPATIBILITY_NOTES,
    historicalCompatible: false,
  };
}

// ── Stage 0 hermetic primitive ───────────────────────────────────────────────

const PREFLIGHT_STAGE = 'preflight' as const;

/** Stage 0 reserves exactly sample 1, the only sample its stage range allows. */
export const CALIBRATION_PREFLIGHT_SAMPLE_INDEX = 1;

/**
 * Nutrient fields every Stage 0 result must carry as finite nonnegative numbers,
 * named exactly as the shipped `NutritionPredictionSchema` names them. Any
 * additional structured field the live adapter returns (for example `confidence`)
 * is ignored here, so this primitive validates only the identity it pins.
 */
const REQUIRED_PREDICTION_FIELDS = ['kcal', 'proteinG', 'carbsG', 'fatG'] as const;

/** Ordered exactly as Stage 0 must call them: pin on `LOW`, then confirm `MEDIUM`. */
const PREFLIGHT_PROFILES = ['LOW', 'MEDIUM'] as const satisfies readonly CalibrationProfile[];

export interface CalibrationPreflightTokenCountRequest {
  model: typeof CALIBRATION_MODEL;
}

export interface CalibrationPreflightImageRequest {
  model: typeof CALIBRATION_MODEL;
  profile: CalibrationProfile;
  caseId: string;
}

/**
 * The one safe record shape Stage 0 may write. It carries only committed-asset
 * identity and a taxonomy member: never a provider message, `cause`, stack,
 * endpoint URL, prompt text, response text, or resolved model version, so no
 * provider content can reach a log, report, or ledger entry through it.
 */
export interface CalibrationPreflightSafeErrorEntry {
  readonly stage: typeof PREFLIGHT_STAGE;
  readonly kind: 'token_count' | 'image';
  readonly caseId: string;
  readonly profile?: CalibrationProfile;
  readonly sampleIndex?: number;
  readonly errorCategory: CalibrationSafeErrorCategory;
}

export interface CalibrationPreflightHooks {
  reserveCall: (key: TokenCountReservationKey | ReservationKey) => Promise<void> | void;
  countTokens: (request: CalibrationPreflightTokenCountRequest) => Promise<unknown>;
  completeTokenCount: (key: TokenCountReservationKey, count: number) => Promise<void> | void;
  failTokenCount: (
    key: TokenCountReservationKey,
    errorCategory: CalibrationSafeErrorCategory,
  ) => Promise<void> | void;
  generateImage: (request: CalibrationPreflightImageRequest) => Promise<unknown>;
  recordSafeError: (entry: CalibrationPreflightSafeErrorEntry) => Promise<void> | void;
}

export interface CalibrationPreflightStageDeps extends CalibrationPreflightHooks {
  firstDevelopmentCaseId: string;
}

export interface CalibrationPreflightStageResult {
  readonly stage: typeof PREFLIGHT_STAGE;
  readonly caseId: string;
  readonly model: typeof CALIBRATION_MODEL;
  readonly tokenCount: number;
  readonly pinnedModelVersion: string;
  readonly verifiedProfiles: readonly CalibrationProfile[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isStructuredPrediction(value: unknown): boolean {
  if (!isPlainRecord(value)) return false;
  return REQUIRED_PREDICTION_FIELDS.every((field) => isFiniteNonNegative(value[field]));
}

/** A malformed or non-string version pins nothing and fails the stage. */
function modelVersionFrom(result: Record<string, unknown>): string | undefined {
  const raw = result.modelVersion;
  return typeof raw === 'string' ? nonblank(raw) : undefined;
}

function tokenCountSafeEntry(
  caseId: string,
  errorCategory: CalibrationSafeErrorCategory,
): CalibrationPreflightSafeErrorEntry {
  return { stage: PREFLIGHT_STAGE, kind: 'token_count', caseId, errorCategory };
}

function imageSafeEntry(
  caseId: string,
  profile: CalibrationProfile,
  errorCategory: CalibrationSafeErrorCategory,
): CalibrationPreflightSafeErrorEntry {
  return {
    stage: PREFLIGHT_STAGE,
    kind: 'image',
    caseId,
    profile,
    sampleIndex: CALIBRATION_PREFLIGHT_SAMPLE_INDEX,
    errorCategory,
  };
}

/**
 * Records the safe category and never the failure itself. A recorder that
 * throws or rejects means the safe category never reached durable storage,
 * so this throws its own `CalibrationFatalError` (no `cause`, to avoid
 * leaking the recorder's error) instead of letting the stage's original
 * fatal mask the lost evidence.
 */
async function recordSafeFailure(
  recordSafeError: (entry: CalibrationPreflightSafeErrorEntry) => Promise<void> | void,
  entry: CalibrationPreflightSafeErrorEntry,
): Promise<void> {
  try {
    await recordSafeError(entry);
  } catch {
    throw new CalibrationFatalError('calibration:preflight-safe-error-persist-failed');
  }
}

/** A terminal persistence fault must not be masked by a second ledger write. */
async function recordTokenTerminal(operation: () => Promise<void> | void): Promise<void> {
  try {
    await operation();
  } catch {
    throw preflightFatal('calibration:preflight-token-terminal-persist-failed');
  }
}

/**
 * Reserves the Stage 0 token-count key, then dispatches exactly one token
 * count. It durably completes or fails that key before any image reservation.
 * The separately typed key never shares image reservation space or budget.
 */
async function runPreflightTokenCount(
  caseId: string,
  hooks: CalibrationPreflightHooks,
): Promise<number> {
  const tokenKey: TokenCountReservationKey = {
    kind: 'token_count',
    stage: PREFLIGHT_STAGE,
    caseId,
    model: CALIBRATION_MODEL,
  };

  try {
    await hooks.reserveCall(tokenKey);
  } catch (error) {
    await recordSafeFailure(
      hooks.recordSafeError,
      tokenCountSafeEntry(caseId, classifyCalibrationError(error)),
    );
    throw preflightFatal('calibration:preflight-token-reservation-failed');
  }

  let raw: unknown;
  try {
    raw = await hooks.countTokens({ model: CALIBRATION_MODEL });
  } catch (error) {
    const errorCategory = classifyCalibrationError(error);
    await recordTokenTerminal(() => hooks.failTokenCount(tokenKey, errorCategory));
    await recordSafeFailure(
      hooks.recordSafeError,
      tokenCountSafeEntry(caseId, errorCategory),
    );
    throw preflightFatal('calibration:preflight-token-call-failed');
  }

  const tokenCount = isPlainRecord(raw)
    && typeof raw.tokenCount === 'number'
    && Number.isInteger(raw.tokenCount)
    && raw.tokenCount >= 0
    ? raw.tokenCount
    : undefined;
  if (tokenCount === undefined) {
    await recordTokenTerminal(() => hooks.failTokenCount(tokenKey, 'empty_response'));
    await recordSafeFailure(hooks.recordSafeError, tokenCountSafeEntry(caseId, 'empty_response'));
    throw preflightFatal('calibration:preflight-token-result-invalid');
  }
  await recordTokenTerminal(() => hooks.completeTokenCount(tokenKey, tokenCount));
  return tokenCount;
}

/**
 * Reserves one image key, dispatches exactly one generation, and returns the
 * validated pinned model version. `pinnedModelVersion` is undefined for the
 * first profile, which pins the version, and the exact same string for every
 * later profile, so a drift fails the stage instead of being accepted.
 *
 * A version drift deliberately records no safe category: the shipped taxonomy
 * has no member for it, and recording `unknown` or `empty_response` would state
 * a provider failure that did not happen. The fatal message names the drift.
 */
async function runPreflightImage(
  caseId: string,
  profile: CalibrationProfile,
  hooks: CalibrationPreflightHooks,
  pinnedModelVersion: string | undefined,
): Promise<string> {
  const key: ReservationKey = {
    stage: PREFLIGHT_STAGE,
    profile,
    caseId,
    sampleIndex: CALIBRATION_PREFLIGHT_SAMPLE_INDEX,
  };

  try {
    await hooks.reserveCall(key);
  } catch (error) {
    await recordSafeFailure(
      hooks.recordSafeError,
      imageSafeEntry(caseId, profile, classifyCalibrationError(error)),
    );
    throw preflightFatal('calibration:preflight-image-reservation-failed');
  }

  let raw: unknown;
  try {
    raw = await hooks.generateImage({ model: CALIBRATION_MODEL, profile, caseId });
  } catch (error) {
    await recordSafeFailure(
      hooks.recordSafeError,
      imageSafeEntry(caseId, profile, classifyCalibrationError(error)),
    );
    throw preflightFatal('calibration:preflight-image-call-failed');
  }

  const safe = imageSafeEntry.bind(undefined, caseId, profile);
  if (!isPlainRecord(raw) || !isStructuredPrediction(raw.prediction)) {
    await recordSafeFailure(hooks.recordSafeError, safe('empty_response'));
    throw preflightFatal('calibration:preflight-prediction-invalid');
  }

  const modelVersion = modelVersionFrom(raw);
  if (modelVersion === undefined) {
    await recordSafeFailure(hooks.recordSafeError, safe('empty_response'));
    throw preflightFatal('calibration:preflight-model-version-invalid');
  }
  if (pinnedModelVersion !== undefined && modelVersion !== pinnedModelVersion) {
    throw preflightFatal('calibration:preflight-model-version-mismatch');
  }
  return modelVersion;
}

/**
 * Runs Stage 0 hermetically: one token count, then the `LOW` and `MEDIUM`
 * images of `firstDevelopmentCaseId`, in exactly that order, each behind its own
 * reservation. Nothing here retries. The first failure throws
 * `CalibrationFatalError` immediately, so `MEDIUM` is never reserved, called, or
 * compared after a `LOW` failure, and the pinned version never comes from a
 * result that failed validation.
 *
 * `_client` is accepted to keep the call shape identical to a later live stage
 * but is never dispatched through: this slice has no live provider path, and
 * every provider, reservation, and ledger effect stays injected.
 */
export async function executeCalibrationPreflight(
  _client: unknown,
  deps: CalibrationPreflightStageDeps,
): Promise<CalibrationPreflightStageResult> {
  const hooks = deps ?? ({} as CalibrationPreflightStageDeps);
  const caseId = nonblank(hooks.firstDevelopmentCaseId);
  if (caseId === undefined
    || typeof hooks.reserveCall !== 'function'
    || typeof hooks.countTokens !== 'function'
    || typeof hooks.completeTokenCount !== 'function'
    || typeof hooks.failTokenCount !== 'function'
    || typeof hooks.generateImage !== 'function'
    || typeof hooks.recordSafeError !== 'function') {
    throw preflightFatal('calibration:preflight-stage-input-invalid');
  }

  const tokenCount = await runPreflightTokenCount(caseId, hooks);

  const lowVersion = await runPreflightImage(caseId, PREFLIGHT_PROFILES[0], hooks, undefined);
  const pinnedModelVersion = await runPreflightImage(
    caseId,
    PREFLIGHT_PROFILES[1],
    hooks,
    lowVersion,
  );

  return {
    stage: PREFLIGHT_STAGE,
    caseId,
    model: CALIBRATION_MODEL,
    tokenCount,
    pinnedModelVersion,
    verifiedProfiles: PREFLIGHT_PROFILES,
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
