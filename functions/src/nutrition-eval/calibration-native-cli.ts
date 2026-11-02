/** Native command composition; no authority or client is created on import. */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  CALIBRATION_MODEL, CALIBRATION_TIMEOUT_MS, CALIBRATION_VERTEX_LOCATION, CALIBRATION_VERTEX_PROJECT,
  countCalibrationTokens, createCalibrationGenAIClient, createGenAIAdapter,
} from '../genai-adapter';
import type { CalibrationCountTokensClient, GenAIAdapter, GenAIClient } from '../genai-adapter';
import { loadVerifiedCaseImage } from './assets';
import { createCalibrationBootstrapReadDeps, prepareCalibrationBootstrapContext, deriveCanonicalReportOutcomePlanV2 } from './calibration-bootstrap';
import { runCalibrationCli, validateCalibrationCliInvocation } from './calibration-cli';
import type { CalibrationCliFailureCode, CalibrationCliResult } from './calibration-cli';
import { prepareCalibrationOffSnapshotStore } from './calibration-off-snapshot-store';
import { prepareNativeCalibrationBenchmarkAuthorityLedger, prepareNativeCalibrationBenchmarkAuthorityLedgerV2 } from './calibration-runtime-evidence-ledger';
import { prepareCalibrationStageDriver, prepareCalibrationStageDriverV2 } from './calibration-stage-driver';
import type { CalibrationSdkMethodCounts, CalibrationStageExecutionResult } from './calibration-stage-driver';
import type { CalibrationReportOutcomeKey } from './calibration-report-state';
import { parseNutritionEvalManifest, StrictCalibrationManifestSchema, StrictCalibrationManifestV2Schema } from './schema';
import type { StageName } from './calibration';
import type { NutritionEvalCase } from './schema';
import { createCalibrationV2BootstrapReadDeps, prepareCalibrationV2BootstrapContext } from './calibration-v2-bootstrap';
import { requireCalibrationV2Context } from './calibration-protocol-bindings';
import { createBenchmarkAuthorityFileCalibrationLedgerDepsV2 } from './calibration-file-store';
import { readNativeCalibrationV2CaseImage } from './calibration-v2-native-images';
import { CalibrationFatalError } from './fatal-error';

export interface CalibrationNativeCliResult extends CalibrationCliResult {
  readonly execution?: Readonly<CalibrationStageExecutionResult>;
}
const STAGES: readonly StageName[] = ['preflight', 'development', 'validation', 'benchmark'];
const V2_NATIVE = Symbol('separate-native-entry');
const IMAGE_PREFIX = Object.freeze({ preflight: 0, development: 2, validation: 50, benchmark: 98 });
const fatal = () => new CalibrationFatalError('calibration:native-cli-failed');
function failed(failureCode: CalibrationCliFailureCode): Readonly<CalibrationNativeCliResult> {
  return Object.freeze({ exitCode: 1, failureCode });
}

export async function runNativeCalibrationCli(
  argv: readonly string[], env: Record<string, string | undefined> = process.env,
): Promise<Readonly<CalibrationNativeCliResult>> {
  return runNativeCalibrationCliCore(argv, env);
}

export async function runNativeCalibrationV2Cli(
  argv: readonly string[], env: Record<string, string | undefined> = process.env,
): Promise<Readonly<CalibrationNativeCliResult>> {
  return runNativeCalibrationCliCore(argv, env, V2_NATIVE);
}

async function runNativeCalibrationCliCore(
  argv: readonly string[], env: Record<string, string | undefined>, mode?: typeof V2_NATIVE,
): Promise<Readonly<CalibrationNativeCliResult>> {
  let executing = false;
  try {
    // Own invocation primitives before any suspension or native preparation.
    const tokens = Object.freeze(Array.isArray(argv) ? [...argv] : []);
    const source = Object.freeze({ ...(env ?? {}) });
    const validation = validateCalibrationCliInvocation(tokens, source);
    if (!validation.valid) return Object.freeze({ ...validation.result });
    const { stage } = validation;
    const context = await (mode === V2_NATIVE
      ? prepareCalibrationV2BootstrapContext(createCalibrationV2BootstrapReadDeps())
      : prepareCalibrationBootstrapContext(createCalibrationBootstrapReadDeps()));
    const v2Context = mode === V2_NATIVE ? requireCalibrationV2Context(context) : undefined;
    // Never acquire or archive a retained V2 lock, regardless of owner liveness.
    if (v2Context !== undefined && createBenchmarkAuthorityFileCalibrationLedgerDepsV2(v2Context).readLock() !== undefined) throw fatal();
    const store = await prepareCalibrationOffSnapshotStore({
      lockText: context.files['off-lock'],
      readSnapshot: async (path: string) => execFileSync('git', ['show', `${context.identity.implementationCommit}:${path}`], {
        cwd: context.baseDir, encoding: 'utf8',
      }),
    });
    const training = (v2Context === undefined ? StrictCalibrationManifestSchema : StrictCalibrationManifestV2Schema)
      .parse(JSON.parse(context.files['calibration-manifest']));
    const benchmark = parseNutritionEvalManifest(JSON.parse(context.files['public-manifest']));
    const cases = new Map([...training.cases, ...benchmark.cases].map((row) => [row.id, row]));
    const first = cases.get(context.firstDevelopmentCaseId);
    const prompts: unknown = JSON.parse(context.files.prompt);
    if (!first || first.scanMode !== 'meal' || !Array.isArray(prompts) || typeof prompts[0] !== 'string') throw fatal();
    const firstPrompt: string = prompts[0];
    const cacheRoot = resolve(context.baseDir, '.nutrition-eval/cache');
    const ledger = await (v2Context === undefined ? prepareNativeCalibrationBenchmarkAuthorityLedger : prepareNativeCalibrationBenchmarkAuthorityLedgerV2)({ context });
    ledger.acquireLock(context.owner);
    let vision: GenAIAdapter | undefined;
    let tokenClient: CalibrationCountTokensClient | undefined;
    let reference: unknown;
    const inert = Object.freeze({});
    let sdkVision = 0;
    let sdkToken = 0;
    function bound(): void { if (vision === undefined || tokenClient === undefined) throw fatal(); }
    const trainingIds = new Set(training.cases.map(row => row.id));
    async function caseBytes(row: NutritionEvalCase): Promise<Uint8Array> {
      if (v2Context !== undefined && trainingIds.has(row.id)) return readNativeCalibrationV2CaseImage(v2Context, row.id);
      return loadVerifiedCaseImage(row, { cacheRoot, ...(v2Context === undefined ? { fetchFn: fetch } : {}) });
    }
    const image = async (key: Readonly<CalibrationReportOutcomeKey>): Promise<Uint8Array> => {
      bound();
      const row = cases.get(key.caseId);
      if (!row || row.scanMode === 'barcode') throw fatal();
      return caseBytes(row);
    };
    const driver = await (v2Context === undefined ? prepareCalibrationStageDriver : prepareCalibrationStageDriverV2)({
      context, ledger,
      loadImage: image,
      generateVision: ((...args) => {
        bound();
        return vision!.generateVision(...args);
      }) as GenAIAdapter['generateVision'],
      lookupSnapshot: (barcode: string) => { bound(); return store.get(barcode); },
      countTokens: async () => {
        bound();
        const bytes = await caseBytes(first);
        return countCalibrationTokens(tokenClient!, { model: CALIBRATION_MODEL, prompt: firstPrompt,
          imageBase64: Buffer.from(bytes).toString('base64'), imageMediaType: first.image.mediaType, timeoutMs: CALIBRATION_TIMEOUT_MS });
      },
      nowMs: () => performance.now(),
      getSdkMethodCounts: (): Readonly<CalibrationSdkMethodCounts> => Object.freeze({ vision: sdkVision, tokenCount: sdkToken }),
    });
    const predecessors = STAGES.slice(0, STAGES.indexOf(stage));
    let execution: Readonly<CalibrationStageExecutionResult> | undefined;
    executing = true;
    const result = await runCalibrationCli(tokens, source, {
      readLedgerModel: () => ledger.getStageReportSnapshot('preflight', 'LOW').identity.model,
      readLedgerSelectedProfile: () => ledger.getSelectedProfile(),
      verifyPreflightState: async () => {
        ledger.assertIdentity(context.identity);
        const completed = ledger.getCompletedStages();
        if (ledger.getRuntimeEvidenceSnapshot().activeAttempt !== null
          || !predecessors.every((name, index) => completed[index] === name)
          || (!completed.includes(stage) && completed.length !== predecessors.length)) throw fatal();
        if (completed.includes(stage)) ledger.completeStage(stage, { stage, passed: true, completedStages: predecessors });
        else if (v2Context !== undefined) {
          const counts = ledger.getCounts();
          const runtime = ledger.getRuntimeEvidenceSnapshot();
          if (counts.imageReserved !== IMAGE_PREFIX[stage] || counts.tokenCountReserved !== (stage === 'preflight' ? 0 : 1)
            || runtime.events.some(event => event.type === 'runtime_report_bound' ? event.stage === stage : event.key.stage === stage)) throw fatal();
          // All current stage assets must be available before client construction.
          // Re-read and verify bytes again at use; no response or image bypass cache.
          const selected = ledger.getSelectedProfile();
          const plan = deriveCanonicalReportOutcomePlanV2(v2Context, selected).filter(row => row.key.stage === stage && row.scanMode !== 'barcode');
          for (const id of new Set(plan.map(row => row.key.caseId))) {
            const row = cases.get(id); if (row === undefined) throw fatal();
            await caseBytes(row);
          }
        }
      },
      createClient: () => {
        if (reference !== undefined) throw fatal();
        if (ledger.getCompletedStages().includes(stage)) { reference = inert; return inert; }
        const client = createCalibrationGenAIClient(source);
        const models = client.models;
        const generate = models.generateContent.bind(models);
        const count = models.countTokens.bind(models);
        // Separate narrow views preserve the actual SDK object and receivers.
        const visionClient: GenAIClient = { models: { generateContent(request) {
          sdkVision++;
          return generate(request);
        } } };
        tokenClient = { models: { countTokens(request) {
          sdkToken++;
          return count(request);
        } } };
        vision = createGenAIAdapter({ project: CALIBRATION_VERTEX_PROJECT, location: CALIBRATION_VERTEX_LOCATION, googleGenAI: visionClient });
        reference = client;
        return client;
      },
      executeStage: async (requestedStage, client) => {
        if (requestedStage !== stage || reference === undefined || client !== reference) throw fatal();
        execution = await driver.executeStage(stage);
      },
    });
    if (result.exitCode !== 0) return Object.freeze({ ...result });
    if (execution === undefined) throw fatal();
    ledger.completeStage(stage, { stage, passed: true, completedStages: predecessors });
    // Only healthy success initiates release. A throw may follow a real unlink.
    ledger.releaseLock(context.owner);
    return Object.freeze({ exitCode: 0, execution });
  } catch {
    return failed(executing ? 'stage_failed' : 'preflight_verification_failed');
  }
}
