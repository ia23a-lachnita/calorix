/** Opt-in composition only: no lock lifecycle, stage driver or default ports. */
import type { CalibrationPlannedReportOutcome, CalibrationReportOutcomeKey } from './calibration-report-state';
import type { RuntimeAttemptRef, RuntimeOperation } from './calibration-runtime-evidence-codec';
import type { CalibrationOutcomeCapabilities } from './calibration-runtime-capabilities';
import { CalibrationRuntimeProviderError, prepareCalibrationRuntimeCapabilities } from './calibration-runtime-capabilities';
import { verifyCalibrationPreflightState } from './calibration-cli';
import {
  assertProducerExecutionIdentity,
  captureProducerInput,
  captureProducerOutcomeKey,
} from './calibration-runtime-evidence-producer-input';
import type { CapturedProducerInput } from './calibration-runtime-evidence-producer-input';
import { CalibrationFatalError } from './fatal-error';

export type { CalibrationRuntimeEvidenceProducerDeps } from './calibration-runtime-evidence-producer-input';
export interface CalibrationRuntimeEvidenceProducer {
  readonly runOutcome: <T>(
    key: unknown,
    work: (caps: Readonly<CalibrationOutcomeCapabilities>) => Promise<T>,
    publish: (key: Readonly<CalibrationReportOutcomeKey>, result: T) => void | Promise<void>,
  ) => Promise<T>;
}

type CaptureReservation = { readonly generation: number; readonly phase: 'capturing' };
type OperationState = 'idle' | 'pending' | 'returned' | 'failed';
type Invocation = {
  readonly generation: number;
  readonly key: Readonly<CalibrationReportOutcomeKey>;
  readonly scanMode: CalibrationPlannedReportOutcome['scanMode'];
  readonly ref: Readonly<RuntimeAttemptRef>;
  phase: 'work' | 'publishing' | 'closed';
  pending: number;
  image: OperationState;
  vision: OperationState;
  snapshot: OperationState;
  visionOpen: boolean;
  reserved: boolean;
  authorized: boolean;
  hookEntered: boolean;
  hookPending: boolean;
  hookCompleted: boolean;
  metadataEntered: boolean;
  metadataPending: boolean;
  metadataCompleted: boolean;
  pinCompleted: boolean;
  rawVisionRejections: number;
};

function freshFatal(): CalibrationFatalError {
  return new CalibrationFatalError('calibration:runtime-evidence-producer-failed');
}

function observed<T>(promise: Promise<T>): Promise<T> {
  // Observe this exact promise, not a replacement that hides its rejection.
  void promise.then(undefined, () => undefined);
  return promise;
}

export async function prepareCalibrationRuntimeEvidenceProducer(
  deps: unknown,
): Promise<Readonly<CalibrationRuntimeEvidenceProducer>> {
  let input: Readonly<CapturedProducerInput>;
  try {
    // All foreign records/functions are captured before the first await.
    input = captureProducerInput(deps);
    await verifyCalibrationPreflightState({ files: input.context.files });
  } catch {
    throw freshFatal();
  }

  let poisoned = false;
  let generation = 0;
  let active: CaptureReservation | Invocation | null = null;
  function fail(): never {
    poisoned = true;
    throw freshFatal();
  }
  function guardCapture(capture: CaptureReservation): void {
    if (poisoned || active !== capture || generation !== capture.generation) fail();
  }
  function guard(invocation: Invocation, phase: Invocation['phase'] = 'work'): void {
    if (poisoned || active !== invocation || generation !== invocation.generation || invocation.phase !== phase) fail();
  }
  function current(): Invocation {
    const invocation = active;
    if (invocation === null || invocation.phase !== 'work') return fail();
    guard(invocation);
    return invocation;
  }
  function captureCall<T>(capture: CaptureReservation, call: () => T): T {
    guardCapture(capture);
    let result: T;
    try { result = call(); } catch { return fail(); }
    guardCapture(capture);
    return result;
  }
  function native<T>(invocation: Invocation, call: () => T, phase: Invocation['phase'] = 'work'): T {
    guard(invocation, phase);
    let result: T;
    try { result = call(); } catch { return fail(); }
    guard(invocation, phase);
    return result;
  }
  function matchingKey(invocation: Invocation, key: Readonly<CalibrationReportOutcomeKey>): void {
    if (key.stage !== invocation.key.stage || key.profile !== invocation.key.profile
      || key.caseId !== invocation.key.caseId || key.sampleIndex !== invocation.key.sampleIndex) fail();
    guard(invocation);
  }
  function start(invocation: Invocation, operation: RuntimeOperation): void {
    guard(invocation);
    if (invocation[operation] !== 'idle' || (operation === 'vision' && invocation.image !== 'returned')) fail();
    invocation[operation] = 'pending';
    native(invocation, () => input.ledger.startRuntimeOperation(invocation.ref, operation));
  }
  function settle(invocation: Invocation, operation: RuntimeOperation, result: 'returned' | 'failed'): void {
    guard(invocation);
    if (invocation[operation] !== 'pending') fail();
    native(invocation, () => input.ledger.settleRuntimeOperation(invocation.ref, operation, result));
    invocation[operation] = result;
  }

  const primitive = prepareCalibrationRuntimeCapabilities({
    files: input.context.files,
    ...(input.selectedProfile === undefined ? {} : { selectedProfile: input.selectedProfile }),
    loadImage: (key: Readonly<CalibrationReportOutcomeKey>) => observed((async () => {
      const invocation = current();
      matchingKey(invocation, key);
      start(invocation, 'image');
      invocation.pending++;
      try {
        let bytes: Uint8Array;
        try { bytes = await input.loadImage(key); }
        catch {
          guard(invocation);
          settle(invocation, 'image', 'failed');
          return fail();
        }
        guard(invocation);
        // Settlement is deliberately outside the raw-port catch.
        settle(invocation, 'image', 'returned');
        return bytes;
      } finally {
        invocation.pending--;
      }
    })()),
    generateVision: ((model, prompt, image, source, options) => observed((async () => {
      const invocation = current();
      start(invocation, 'vision');
      const originalHook = options?.beforeRequest;
      const originalMetadata = options?.onResponseMetadata;
      if (options === undefined || typeof originalHook !== 'function' || typeof originalMetadata !== 'function') return fail();
      invocation.visionOpen = true;
      invocation.pending++;
      const beforeRequest = (): Promise<void> => observed((async () => {
        guard(invocation);
        if (!invocation.visionOpen || invocation.hookEntered || invocation.metadataEntered) fail();
        invocation.hookEntered = true;
        invocation.hookPending = true;
        invocation.pending++;
        try {
          // Only the primitive's hook invokes reserveImage below. This outer
          // decorator never reserves, and awaits the complete original hook.
          try { await originalHook(); } catch { return fail(); }
          guard(invocation);
          if (!invocation.visionOpen || !invocation.authorized) fail();
          invocation.hookCompleted = true;
        } finally {
          invocation.hookPending = false;
          invocation.pending--;
        }
      })());
      const onResponseMetadata: NonNullable<typeof originalMetadata> = (metadata) => {
        guard(invocation);
        if (!invocation.visionOpen || !invocation.hookCompleted || invocation.hookPending
          || !invocation.authorized || invocation.metadataEntered) fail();
        invocation.metadataEntered = true;
        invocation.metadataPending = true;
        invocation.pending++;
        try {
          try { originalMetadata(metadata); } catch { return fail(); }
          guard(invocation);
          if (!invocation.visionOpen || !invocation.pinCompleted) fail();
          invocation.metadataCompleted = true;
        } finally {
          invocation.metadataPending = false;
          invocation.pending--;
        }
      };
      try {
        let text: string;
        try {
          text = await input.generateVision(model, prompt, image, source, {
            ...options, beforeRequest, onResponseMetadata,
          });
        } catch {
          // Control-flow location, not error class/properties, identifies a
          // corresponding healthy authorized raw provider rejection.
          guard(invocation);
          if (!invocation.visionOpen || !invocation.authorized || !invocation.hookCompleted
            || invocation.hookPending || invocation.metadataPending) return fail();
          settle(invocation, 'vision', 'failed');
          invocation.rawVisionRejections++;
          throw new CalibrationRuntimeProviderError();
        }
        guard(invocation);
        if (!invocation.visionOpen || !invocation.authorized || !invocation.hookCompleted
          || !invocation.metadataCompleted || !invocation.pinCompleted
          || invocation.hookPending || invocation.metadataPending) return fail();
        settle(invocation, 'vision', 'returned');
        return text;
      } finally {
        invocation.visionOpen = false;
        invocation.pending--;
      }
    })())) as CapturedProducerInput['generateVision'],
    reserveImage: async (key: Readonly<CalibrationReportOutcomeKey>): Promise<void> => {
      const invocation = current();
      matchingKey(invocation, key);
      if (!invocation.visionOpen || invocation.vision !== 'pending' || !invocation.hookEntered
        || !invocation.hookPending || invocation.hookCompleted || invocation.reserved || invocation.authorized) fail();
      // Synchronous reserve -> authorization before any await. Native failure
      // poisons this producer; a consumed prefix is never rolled back/retried.
      native(invocation, () => input.ledger.reserve(invocation.key));
      invocation.reserved = true;
      native(invocation, () => input.ledger.authorizeRuntimeRequest(invocation.ref));
      invocation.authorized = true;
    },
    onModelVersion: (key: Readonly<CalibrationReportOutcomeKey>, version: string): void => {
      const invocation = current();
      matchingKey(invocation, key);
      if (!invocation.visionOpen || !invocation.authorized || !invocation.hookCompleted
        || !invocation.metadataEntered || !invocation.metadataPending
        || invocation.metadataCompleted || invocation.pinCompleted) fail();
      native(invocation, () => input.ledger.pinModelVersion(version));
      invocation.pinCompleted = true;
    },
    lookupSnapshot: (barcode: string) => {
      const invocation = current();
      start(invocation, 'snapshot');
      invocation.pending++;
      try {
        let product: ReturnType<CapturedProducerInput['lookupSnapshot']>;
        try { product = input.lookupSnapshot(barcode); }
        catch {
          guard(invocation);
          settle(invocation, 'snapshot', 'failed');
          return fail();
        }
        guard(invocation);
        settle(invocation, 'snapshot', 'returned');
        return product;
      } finally {
        invocation.pending--;
      }
    },
  });

  function facade(invocation: Invocation, capabilities: Readonly<CalibrationOutcomeCapabilities>): Readonly<CalibrationOutcomeCapabilities> {
    function asyncOperation<T>(operation: () => Promise<T>, allowProviderRejection = false): Promise<T> {
      return observed((async () => {
        guard(invocation);
        const priorRawRejections = invocation.rawVisionRejections;
        invocation.pending++;
        try {
          let value: T;
          try { value = await operation(); }
          catch {
            guard(invocation);
            if (allowProviderRejection && invocation.rawVisionRejections === priorRawRejections + 1
              && invocation.vision === 'failed' && invocation.authorized && invocation.hookCompleted
              && !invocation.hookPending && !invocation.metadataPending) {
              throw new CalibrationRuntimeProviderError();
            }
            return fail();
          }
          guard(invocation);
          return value;
        } finally {
          invocation.pending--;
        }
      })());
    }
    return Object.freeze({
      loadImage: () => asyncOperation(() => capabilities.loadImage()),
      generateVision: (request: unknown) => asyncOperation(() => capabilities.generateVision(request), true),
      lookupSnapshot: () => {
        guard(invocation);
        invocation.pending++;
        try {
          let product: ReturnType<CalibrationOutcomeCapabilities['lookupSnapshot']>;
          try { product = capabilities.lookupSnapshot(); } catch { return fail(); }
          guard(invocation);
          return product;
        } finally {
          invocation.pending--;
        }
      },
    });
  }

  async function runOutcome<T>(
    key: unknown,
    work: (caps: Readonly<CalibrationOutcomeCapabilities>) => Promise<T>,
    publish: (key: Readonly<CalibrationReportOutcomeKey>, result: T) => void | Promise<void>,
  ): Promise<T> {
    if (poisoned || active !== null) return fail();
    const capture: CaptureReservation = { phase: 'capturing', generation: ++generation };
    active = capture;
    let invocation: Invocation | undefined;
    try {
      const ownedKey = captureProducerOutcomeKey(key, input.plan);
      guardCapture(capture);
      if (typeof work !== 'function' || typeof publish !== 'function') return fail();
      const planned = input.plan.find((row) => row.key.stage === ownedKey.stage && row.key.profile === ownedKey.profile
        && row.key.caseId === ownedKey.caseId && row.key.sampleIndex === ownedKey.sampleIndex);
      if (planned === undefined) return fail();
      const executionInput: CapturedProducerInput = {
        ...input,
        ledger: {
          ...input.ledger,
          getSelectedProfile: () => captureCall(capture, () => input.ledger.getSelectedProfile()),
          getRuntimeEvidenceSnapshot: () => captureCall(capture, () => input.ledger.getRuntimeEvidenceSnapshot()),
          getStageReportSnapshot: (stage, profile) => captureCall(capture, () => input.ledger.getStageReportSnapshot(stage, profile)),
        },
      };
      assertProducerExecutionIdentity(executionInput, ownedKey);
      guardCapture(capture);
      const ref = captureCall(capture, () => input.ledger.startRuntimeAttempt(ownedKey));
      const running: Invocation = {
        generation: capture.generation, key: ownedKey, scanMode: planned.scanMode, ref, phase: 'work', pending: 0,
        image: 'idle', vision: 'idle', snapshot: 'idle', visionOpen: false,
        reserved: false, authorized: false, hookEntered: false, hookPending: false, hookCompleted: false,
        metadataEntered: false, metadataPending: false, metadataCompleted: false, pinCompleted: false,
        rawVisionRejections: 0,
      };
      invocation = running;
      active = running;
      const result = await primitive.runOutcome(ownedKey, async (capabilities) => {
        guard(running);
        const value = await work(facade(running, capabilities));
        guard(running);
        if (running.pending !== 0) return fail();
        return value;
      });
      guard(running);
      if (running.pending !== 0 || running.hookPending || running.metadataPending || running.visionOpen) return fail();
      // The general ledger also supports dataset non-reservations. This first
      // bridge does not: required mediated work must finish BEFORE publication,
      // not merely leave a terminal the wider native protocol could accept.
      if (running.scanMode === 'barcode') {
        if (running.snapshot !== 'returned' || running.image !== 'idle' || running.vision !== 'idle'
          || running.reserved || running.authorized) return fail();
      } else if (running.image !== 'returned' || (running.vision !== 'returned' && running.vision !== 'failed')
        || running.snapshot !== 'idle' || !running.reserved || !running.authorized) return fail();
      running.phase = 'publishing';
      const publication = publish(running.key, result);
      guard(running, 'publishing');
      await publication;
      guard(running, 'publishing');
      if (running.pending !== 0) return fail();
      // Only the real ledger reconciles a durable terminal. A callback return
      // or safe_error never substitutes for full journal/terminal authority.
      native(running, () => input.ledger.finishRuntimeAttempt(running.ref), 'publishing');
      guard(running, 'publishing');
      return result;
    } catch {
      return fail();
    } finally {
      if (invocation !== undefined) invocation.phase = 'closed';
      if (active === capture || active === invocation) active = null;
      // Local closure only: never unlock, abandon, recover, retry or reset.
    }
  }

  return Object.freeze({ runOutcome });
}
