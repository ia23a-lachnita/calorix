/**
 * Calibration runtime capabilities — unused mediated capability primitive.
 *
 * Plan: `docs/superpowers/plans/2026-10-13-calibration-runtime-capabilities.md`
 * Task 1 Step 3 (source only). Derives the operation plan from captured
 * checksum-pinned input strings through the existing canonical outcome
 * planner, then mediates serial outcome leases over explicitly trusted ports
 * (image loader, vision generator, reservation, version callback, snapshot
 * lookup). Observations are privately owned in-memory diagnostics only: no
 * writer, ledger, client, snapshot reader, controller, network, cache or
 * durable authority is created here.
 */
import { deriveCanonicalReportOutcomePlan } from './calibration-bootstrap';
import { CalibrationFatalError } from './fatal-error';
import type {
  CalibrationProfile,
  ReservationKey,
  StageName,
} from './calibration';
import type {
  CalibrationPlannedReportOutcome,
  CalibrationReportOutcomeKey,
} from './calibration-report-state';
import type { CalibrationPreflightFileName } from './calibration-cli';
import type { GenAIAdapter } from '../genai-adapter';
import type { OffProduct } from '../off-client';

export interface CalibrationRuntimeCapabilityDeps {
  files: Record<CalibrationPreflightFileName, string>;
  selectedProfile?: CalibrationProfile;
  loadImage: (key: Readonly<CalibrationReportOutcomeKey>) => Promise<Uint8Array>;
  generateVision: GenAIAdapter['generateVision'];
  reserveImage: (key: Readonly<ReservationKey>) => Promise<void>;
  onModelVersion: (key: Readonly<ReservationKey>, version: string) => void;
  lookupSnapshot: (barcode: string) => Readonly<OffProduct> | undefined;
}

export interface CalibrationOutcomeCapabilities {
  loadImage: () => Promise<Uint8Array>;
  generateVision: (request: unknown) => Promise<string>;
  lookupSnapshot: () => Readonly<OffProduct>;
}

export interface CalibrationRuntimeObservation {
  readonly sequence: number;
  readonly key: Readonly<CalibrationReportOutcomeKey>;
  readonly operation: 'outcome' | 'image' | 'vision' | 'reservation' | 'metadata' | 'snapshot';
  readonly status: 'attempted' | 'completed' | 'failed' | 'blocked';
}

export interface CalibrationRuntimeCapabilities {
  runOutcome: <T>(
    key: unknown,
    body: (capabilities: Readonly<CalibrationOutcomeCapabilities>) => Promise<T>,
  ) => Promise<T>;
  getPlannedOutcomes: () => readonly CalibrationPlannedReportOutcome[];
  getObservations: () => readonly CalibrationRuntimeObservation[];
}

export class CalibrationRuntimeProviderError extends Error {
  readonly code = 'provider_request_failed';
  constructor() {
    super('calibration:runtime-provider-failed');
    this.name = 'CalibrationRuntimeProviderError';
  }
}

export function prepareCalibrationRuntimeCapabilities(
  deps: unknown,
): Readonly<CalibrationRuntimeCapabilities>;
export function prepareCalibrationRuntimeCapabilities(
  deps: unknown,
): Readonly<CalibrationRuntimeCapabilities> {
  const FILE_NAMES = [
    'public-manifest',
    'prompt',
    'response-schema',
    'source-lock',
    'calibration-manifest',
    'off-lock',
    'historical-reference',
  ] as const;
  const DEP_REQUIRED = [
    'files',
    'loadImage',
    'generateVision',
    'reserveImage',
    'onModelVersion',
    'lookupSnapshot',
  ] as const;
  const DEP_ALLOWED = new Set<string>([...DEP_REQUIRED, 'selectedProfile']);
  const KEY_FIELDS = ['stage', 'profile', 'caseId', 'sampleIndex'] as const;
  const CASE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
  const MODEL_VERSION_PATTERN = /^[A-Za-z0-9_./-]{1,128}$/;
  const STAGE_RANGE: Record<string, { min: number; max: number }> = {
    preflight: { min: 1, max: 1 },
    development: { min: 1, max: 1 },
    validation: { min: 1, max: 3 },
    benchmark: { min: 1, max: 3 },
  };
  const MAX_OBSERVATIONS = 4096;

  type LoadImageFn = (key: Readonly<ReservationKey>) => Promise<Uint8Array>;
  type GenerateVisionFn = GenAIAdapter['generateVision'];
  type ReserveFn = (key: Readonly<ReservationKey>) => Promise<void>;
  type OnVersionFn = (key: Readonly<ReservationKey>, version: string) => void;
  type LookupFn = (barcode: string) => Readonly<OffProduct> | undefined;

  const localCodes = new WeakMap<object, string>();
  const providerIds = new WeakSet<object>();

  function freshFatal(suffix: string): CalibrationFatalError {
    const error = new CalibrationFatalError(`calibration:${suffix}`);
    localCodes.set(error, suffix);
    return error;
  }

  function freshProvider(): CalibrationRuntimeProviderError {
    const error = new CalibrationRuntimeProviderError();
    providerIds.add(error);
    return error;
  }

  function isLocalFatal(value: unknown): boolean {
    if (typeof value !== 'object' || value === null) return false;
    try {
      return localCodes.has(value as object);
    } catch {
      return false;
    }
  }

  function localSuffix(value: unknown): string | undefined {
    if (typeof value !== 'object' || value === null) return undefined;
    try {
      return localCodes.get(value as object);
    } catch {
      return undefined;
    }
  }

  function isProviderError(value: unknown): boolean {
    if (typeof value !== 'object' || value === null) return false;
    try {
      return providerIds.has(value as object);
    } catch {
      return false;
    }
  }

  function structuralError(): Error {
    return new Error('calibration-runtime-capabilities:structural-mismatch');
  }

  function captureExactMap(value: unknown, allowed: readonly string[]): Map<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw structuralError();
    }
    const target = value as Record<string, unknown>;
    let proto: unknown;
    try {
      proto = Object.getPrototypeOf(target);
    } catch {
      throw structuralError();
    }
    if (proto !== Object.prototype && proto !== null) {
      throw structuralError();
    }
    let names: string[];
    let symbols: symbol[];
    try {
      names = Object.getOwnPropertyNames(target);
      symbols = Object.getOwnPropertySymbols(target);
    } catch {
      throw structuralError();
    }
    if (symbols.length !== 0) {
      throw structuralError();
    }
    if (names.length !== allowed.length) {
      throw structuralError();
    }
    const allowedSet = new Set<string>(allowed);
    const map = new Map<string, unknown>();
    for (const name of names) {
      if (!allowedSet.has(name)) {
        throw structuralError();
      }
      let descriptor: PropertyDescriptor | undefined;
      try {
        descriptor = Object.getOwnPropertyDescriptor(target, name);
      } catch {
        throw structuralError();
      }
      if (
        descriptor === undefined ||
        descriptor.enumerable !== true ||
        !('value' in descriptor) ||
        'get' in descriptor ||
        'set' in descriptor
      ) {
        throw structuralError();
      }
      if (descriptor.value === undefined) {
        throw structuralError();
      }
      map.set(name, descriptor.value);
    }
    for (const field of allowed) {
      if (!map.has(field)) {
        throw structuralError();
      }
    }
    return map;
  }

  function failInput(): never {
    throw freshFatal('runtime-input-invalid');
  }

  // ── Dependency capture (descriptor-only, single capture) ─────────────────
  if (typeof deps !== 'object' || deps === null) {
    failInput();
  }
  let depsIsArray = false;
  try {
    depsIsArray = Array.isArray(deps);
  } catch {
    failInput();
  }
  if (depsIsArray) {
    failInput();
  }
  const depsRecord = deps as Record<string, unknown>;
  let depsProto: unknown;
  try {
    depsProto = Object.getPrototypeOf(depsRecord);
  } catch {
    failInput();
  }
  if (depsProto !== Object.prototype && depsProto !== null) {
    failInput();
  }
  let depsNames: string[];
  let depsSymbols: symbol[];
  try {
    depsNames = Object.getOwnPropertyNames(depsRecord);
    depsSymbols = Object.getOwnPropertySymbols(depsRecord);
  } catch {
    failInput();
  }
  if (depsSymbols.length !== 0) {
    failInput();
  }
  if (depsNames.length !== DEP_REQUIRED.length && depsNames.length !== DEP_REQUIRED.length + 1) {
    failInput();
  }
  const depsValues = new Map<string, unknown>();
  for (const name of depsNames) {
    if (!DEP_ALLOWED.has(name)) {
      failInput();
    }
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(depsRecord, name);
    } catch {
      failInput();
    }
    if (
      descriptor === undefined ||
      descriptor.enumerable !== true ||
      !('value' in descriptor) ||
      'get' in descriptor ||
      'set' in descriptor
    ) {
      failInput();
    }
    if (descriptor.value === undefined) {
      failInput();
    }
    depsValues.set(name, descriptor.value);
  }
  for (const field of DEP_REQUIRED) {
    if (!depsValues.has(field)) {
      failInput();
    }
  }
  const filesValue = depsValues.get('files');
  const loadImageValue = depsValues.get('loadImage');
  const generateVisionValue = depsValues.get('generateVision');
  const reserveImageValue = depsValues.get('reserveImage');
  const onModelVersionValue = depsValues.get('onModelVersion');
  const lookupSnapshotValue = depsValues.get('lookupSnapshot');
  if (typeof filesValue !== 'object' || filesValue === null) {
    failInput();
  }
  let filesIsArray = false;
  try {
    filesIsArray = Array.isArray(filesValue);
  } catch {
    failInput();
  }
  if (filesIsArray) {
    failInput();
  }
  if (
    typeof loadImageValue !== 'function' ||
    typeof generateVisionValue !== 'function' ||
    typeof reserveImageValue !== 'function' ||
    typeof onModelVersionValue !== 'function' ||
    typeof lookupSnapshotValue !== 'function'
  ) {
    failInput();
  }
  let selectedProfile: CalibrationProfile | undefined;
  if (depsValues.has('selectedProfile')) {
    const raw = depsValues.get('selectedProfile');
    if (raw !== 'LOW' && raw !== 'MEDIUM') {
      failInput();
    }
    selectedProfile = raw as CalibrationProfile;
  }
  const loadImage = loadImageValue as LoadImageFn;
  const generateVision = generateVisionValue as GenerateVisionFn;
  const reserveImage = reserveImageValue as ReserveFn;
  const onModelVersion = onModelVersionValue as OnVersionFn;
  const lookupSnapshot = lookupSnapshotValue as LookupFn;

  // ── Files capture (exact seven owned strings) ────────────────────────────
  let filesMap: Map<string, unknown>;
  try {
    filesMap = captureExactMap(filesValue, FILE_NAMES);
  } catch {
    failInput();
  }
  const ownedFiles = {} as Record<CalibrationPreflightFileName, string>;
  for (const name of FILE_NAMES) {
    const raw = (filesMap as Map<string, unknown>).get(name);
    if (typeof raw !== 'string') {
      failInput();
    }
    (ownedFiles as Record<string, string>)[name] = raw as string;
  }

  // Canonical plan on the same owned strings (planner failure propagates as
  // its own fresh CalibrationFatalError; never mapped to input-invalid).
  const plan: readonly CalibrationPlannedReportOutcome[] =
    selectedProfile === undefined
      ? deriveCanonicalReportOutcomePlan(ownedFiles)
      : deriveCanonicalReportOutcomePlan(ownedFiles, selectedProfile);

  // ── Per-case media type / supplied barcode from validated manifests ───────
  interface CaseInfo {
    mediaType: 'image/png' | 'image/jpeg';
    barcode?: string;
  }
  const caseInfo = new Map<string, CaseInfo>();
  try {
    const calibrationRaw = JSON.parse(ownedFiles['calibration-manifest']) as unknown;
    const publicRaw = JSON.parse(ownedFiles['public-manifest']) as unknown;
    const calibrationCases = (calibrationRaw as { cases: Array<{ id: unknown; image: unknown }> }).cases;
    const publicCases = (publicRaw as {
      cases: Array<{ id: unknown; image: unknown; suppliedBarcode?: unknown }>;
    }).cases;
    if (!Array.isArray(calibrationCases) || !Array.isArray(publicCases)) {
      throw structuralError();
    }
    for (const entry of calibrationCases) {
      if (typeof entry !== 'object' || entry === null) throw structuralError();
      const record = entry as { id: unknown; image: unknown };
      if (typeof record.id !== 'string') throw structuralError();
      const image = record.image as { mediaType?: unknown } | null;
      if (typeof image !== 'object' || image === null) throw structuralError();
      const mediaType = (image as { mediaType: unknown }).mediaType;
      if (mediaType !== 'image/png' && mediaType !== 'image/jpeg') throw structuralError();
      caseInfo.set(record.id, { mediaType });
    }
    for (const entry of publicCases) {
      if (typeof entry !== 'object' || entry === null) throw structuralError();
      const record = entry as { id: unknown; image: unknown; suppliedBarcode?: unknown };
      if (typeof record.id !== 'string') throw structuralError();
      const image = record.image as { mediaType?: unknown } | null;
      if (typeof image !== 'object' || image === null) throw structuralError();
      const mediaType = (image as { mediaType: unknown }).mediaType;
      if (mediaType !== 'image/png' && mediaType !== 'image/jpeg') throw structuralError();
      const barcode = record.suppliedBarcode;
      if (barcode === undefined) {
        caseInfo.set(record.id, { mediaType });
      } else {
        if (typeof barcode !== 'string' || barcode.length === 0) throw structuralError();
        caseInfo.set(record.id, { mediaType, barcode });
      }
    }
  } catch (error) {
    if (isLocalFatal(error) || isProviderError(error)) throw error;
    failInput();
  }

  function keyId(key: CalibrationReportOutcomeKey): string {
    return `${key.stage}|${key.profile}|${key.caseId}|${key.sampleIndex}`;
  }

  const planById = new Map<string, CalibrationPlannedReportOutcome>();
  for (const row of plan) {
    planById.set(keyId(row.key), row);
  }

  // ── Private runtime state ────────────────────────────────────────────────
  const usedKeys = new Set<string>();
  const observations: CalibrationRuntimeObservation[] = [];
  let poisoned = false;
  // First static poison code (never an exception instance).
  let firstPoisonCode: string | null = null;
  let activeLease: Lease | null = null;
  let leaseSequence = 0;
  // Private reflection phase: claimed before descriptor-only Object
  // reflection on key/request/metadata so nested public entry re-runs
  // deny and poison before any external port or diagnostic success.
  // Released in finally; never freezes or mutates caller records.
  let captureDepth = 0;

  function poison(code = 'runtime-poisoned'): void {
    poisoned = true;
    if (firstPoisonCode === null) {
      firstPoisonCode = code;
    }
  }

  function freezeOwnedKey(key: CalibrationReportOutcomeKey): CalibrationReportOutcomeKey {
    return Object.freeze({
      stage: key.stage,
      profile: key.profile,
      caseId: key.caseId,
      sampleIndex: key.sampleIndex,
    }) as CalibrationReportOutcomeKey;
  }

  function observe(
    operation: CalibrationRuntimeObservation['operation'],
    status: CalibrationRuntimeObservation['status'],
    key: CalibrationReportOutcomeKey,
  ): void {
    if (observations.length >= MAX_OBSERVATIONS) {
      poison('runtime-trace-limit');
      throw freshFatal('runtime-trace-limit');
    }
    const owned = freezeOwnedKey(key);
    const record = Object.freeze({
      sequence: observations.length + 1,
      key: owned,
      operation,
      status,
    }) as CalibrationRuntimeObservation;
    observations.push(record);
  }

  function safeObserve(
    operation: CalibrationRuntimeObservation['operation'],
    status: CalibrationRuntimeObservation['status'],
    key: CalibrationReportOutcomeKey,
  ): void {
    try {
      observe(operation, status, key);
    } catch {
      // Trace-limit poison is already recorded; never let diagnostics throw
      // a foreign-shaped value outward.
    }
  }

  interface Lease {
    readonly id: number;
    readonly ownedKey: CalibrationReportOutcomeKey;
    readonly scanMode: 'meal' | 'label' | 'barcode';
    imageUsed: boolean;
    visionUsed: boolean;
    snapshotUsed: boolean;
    inFlight: number;
    settled: boolean;
    beforeStarted: boolean;
    beforeCompleted: boolean;
    metaSeen: boolean;
    metaDone: boolean;
  }

  function assertLive(lease: Lease): void {
    if (poisoned) {
      throw freshFatal('runtime-poisoned');
    }
    if (activeLease !== lease || lease.settled) {
      throw freshFatal('runtime-lease-expired');
    }
  }

  function guardLive(
    lease: Lease,
    operation: CalibrationRuntimeObservation['operation'],
    code: string,
  ): void {
    if (poisoned) {
      throw freshFatal('runtime-poisoned');
    }
    try {
      assertLive(lease);
    } catch {
      poison(code);
      safeObserve(operation, 'failed', lease.ownedKey);
      throw freshFatal(code);
    }
  }

  function captureOutcomeKey(value: unknown): CalibrationReportOutcomeKey {
    const map = captureExactMap(value, KEY_FIELDS);
    const stage = map.get('stage');
    const profile = map.get('profile');
    const caseId = map.get('caseId');
    const sampleIndex = map.get('sampleIndex');
    if (stage !== 'preflight' && stage !== 'development' && stage !== 'validation' && stage !== 'benchmark') {
      throw structuralError();
    }
    if (profile !== 'LOW' && profile !== 'MEDIUM') {
      throw structuralError();
    }
    if (typeof caseId !== 'string' || !CASE_ID_PATTERN.test(caseId)) {
      throw structuralError();
    }
    const range = STAGE_RANGE[stage as string];
    if (
      range === undefined ||
      typeof sampleIndex !== 'number' ||
      !Number.isInteger(sampleIndex) ||
      sampleIndex < range.min ||
      sampleIndex > range.max
    ) {
      throw structuralError();
    }
    return Object.freeze({
      stage: stage as StageName,
      profile: profile as CalibrationProfile,
      caseId,
      sampleIndex,
    }) as CalibrationReportOutcomeKey;
  }

  function captureVisionRequest(value: unknown): { prompt: string; imageBase64: string } {
    const map = captureExactMap(value, ['prompt', 'imageBase64']);
    const prompt = map.get('prompt');
    const imageBase64 = map.get('imageBase64');
    if (typeof prompt !== 'string' || prompt.trim().length === 0) {
      throw structuralError();
    }
    if (typeof imageBase64 !== 'string' || imageBase64.trim().length === 0) {
      throw structuralError();
    }
    return { prompt, imageBase64 };
  }

  function captureModelVersion(value: unknown): string {
    const map = captureExactMap(value, ['modelVersion']);
    const version = map.get('modelVersion');
    if (typeof version !== 'string' || version.trim().length === 0) {
      throw structuralError();
    }
    if (!MODEL_VERSION_PATTERN.test(version)) {
      throw structuralError();
    }
    return version;
  }

  function copyPlan(): readonly CalibrationPlannedReportOutcome[] {
    const rows = plan.map((row) => {
      const key = Object.freeze({ ...row.key }) as CalibrationReportOutcomeKey;
      return Object.freeze({ key, scanMode: row.scanMode });
    });
    return Object.freeze(rows) as readonly CalibrationPlannedReportOutcome[];
  }

  function copyObservations(): readonly CalibrationRuntimeObservation[] {
    const rows = observations.map((entry) => {
      const key = Object.freeze({ ...entry.key }) as CalibrationReportOutcomeKey;
      return Object.freeze({
        sequence: entry.sequence,
        key,
        operation: entry.operation,
        status: entry.status,
      }) as CalibrationRuntimeObservation;
    });
    return Object.freeze(rows) as readonly CalibrationRuntimeObservation[];
  }

  function getPlannedOutcomes(): readonly CalibrationPlannedReportOutcome[] {
    if (captureDepth !== 0) {
      poison('runtime-reentrant-operation');
      throw freshFatal('runtime-reentrant-operation');
    }
    if (activeLease !== null) {
      poison('runtime-reentrant-operation');
      throw freshFatal('runtime-reentrant-operation');
    }
    return copyPlan();
  }

  function getObservations(): readonly CalibrationRuntimeObservation[] {
    if (captureDepth !== 0) {
      poison('runtime-reentrant-operation');
      throw freshFatal('runtime-reentrant-operation');
    }
    if (activeLease !== null) {
      poison('runtime-reentrant-operation');
      throw freshFatal('runtime-reentrant-operation');
    }
    return copyObservations();
  }

  function buildCapabilities(lease: Lease): Readonly<CalibrationOutcomeCapabilities> {
    const loadImageCap = (): Promise<Uint8Array> => {
      const operation: Promise<Uint8Array> = (async (): Promise<Uint8Array> => {
        // Every guard below runs synchronously inside this async IIFE before
        // the first await, so overlapping calls observe up-to-date lease
        // state while every denial still rejects the returned promise.
        let acquired = false;
        if (captureDepth !== 0) {
          poison('runtime-reentrant-operation');
          safeObserve('image', 'failed', lease.ownedKey);
          throw freshFatal('runtime-reentrant-operation');
        }
        guardLive(lease, 'image', 'runtime-lease-expired');
        if (lease.scanMode === 'barcode') {
          poison('runtime-forbidden-operation');
          safeObserve('image', 'failed', lease.ownedKey);
          throw freshFatal('runtime-forbidden-operation');
        }
        if (lease.imageUsed) {
          poison('runtime-duplicate-operation');
          safeObserve('image', 'failed', lease.ownedKey);
          throw freshFatal('runtime-duplicate-operation');
        }
        if (lease.inFlight !== 0) {
          poison('runtime-reentrant-operation');
          safeObserve('image', 'failed', lease.ownedKey);
          throw freshFatal('runtime-reentrant-operation');
        }
        lease.imageUsed = true;
        // A throwing attempted observation (trace limit) never reaches the
        // port and never acquires the in-flight slot.
        observe('image', 'attempted', lease.ownedKey);
        lease.inFlight += 1;
        acquired = true;
        try {
          const callKey = freezeOwnedKey(lease.ownedKey);
          const bytes = await loadImage(callKey);
          try {
            assertLive(lease);
          } catch (error) {
            poison('runtime-lease-expired');
            if (isLocalFatal(error)) {
              throw freshFatal(localSuffix(error) ?? 'runtime-lease-expired');
            }
            throw freshFatal('runtime-lease-expired');
          }
          observe('image', 'completed', lease.ownedKey);
          return bytes;
        } catch (error) {
          if (isLocalFatal(error)) {
            safeObserve('image', 'failed', lease.ownedKey);
            throw freshFatal(localSuffix(error) ?? 'runtime-lease-expired');
          }
          if (poisoned) {
            safeObserve('image', 'failed', lease.ownedKey);
            throw freshFatal('runtime-poisoned');
          }
          // Loader ports never classify provider errors: even a recognized
          // module-created provider object escaping the loader maps to a
          // fresh causeless port fatal.
          poison('runtime-callback-failed');
          safeObserve('image', 'failed', lease.ownedKey);
          throw freshFatal('runtime-callback-failed');
        } finally {
          if (acquired) {
            lease.inFlight -= 1;
          }
        }
      })();
      void operation.then(undefined, () => undefined);
      return operation;
    };

    const generateVisionCap = (request: unknown): Promise<string> => {
      const operation: Promise<string> = (async (): Promise<string> => {
        // Every guard below runs synchronously inside this async IIFE before
        // the first await, so overlapping calls observe up-to-date lease
        // state while every denial still rejects the returned promise.
        let acquired = false;
        if (captureDepth !== 0) {
          poison('runtime-reentrant-operation');
          safeObserve('vision', 'failed', lease.ownedKey);
          throw freshFatal('runtime-reentrant-operation');
        }
        guardLive(lease, 'vision', 'runtime-lease-expired');
        if (lease.scanMode === 'barcode') {
          poison('runtime-forbidden-operation');
          safeObserve('vision', 'failed', lease.ownedKey);
          throw freshFatal('runtime-forbidden-operation');
        }
        if (lease.visionUsed) {
          poison('runtime-duplicate-operation');
          safeObserve('vision', 'failed', lease.ownedKey);
          throw freshFatal('runtime-duplicate-operation');
        }
        if (lease.inFlight !== 0) {
          poison('runtime-reentrant-operation');
          safeObserve('vision', 'failed', lease.ownedKey);
          throw freshFatal('runtime-reentrant-operation');
        }
        let generationOpen = true;
        let hookPending = false;
        captureDepth++;
        let parsed: { prompt: string; imageBase64: string };
        try {
          parsed = captureVisionRequest(request);
        } catch {
          poison('runtime-dispatch-contract-invalid');
          safeObserve('vision', 'failed', lease.ownedKey);
          throw freshFatal('runtime-dispatch-contract-invalid');
        } finally {
          captureDepth--;
        }
        if (poisoned) {
          safeObserve('vision', 'failed', lease.ownedKey);
          const retainedCapture = firstPoisonCode;
          throw freshFatal(retainedCapture ?? 'runtime-poisoned');
        }
        if (activeLease !== lease || lease.settled) {
          poison('runtime-lease-expired');
          safeObserve('vision', 'failed', lease.ownedKey);
          throw freshFatal('runtime-lease-expired');
        }
        lease.visionUsed = true;
        // A throwing attempted observation (trace limit) never reaches the
        // generator and never acquires the in-flight slot.
        observe('vision', 'attempted', lease.ownedKey);
        lease.inFlight += 1;
        acquired = true;
        const prompt = parsed.prompt;
        const imageBase64 = parsed.imageBase64;
        const info = caseInfo.get(lease.ownedKey.caseId);
        const mediaType = info?.mediaType ?? 'image/png';
        const thinkingLevel = lease.ownedKey.profile;
        const source = lease.scanMode;

        const beforeRequest = (): Promise<void> => {
          const promise: Promise<void> = (async (): Promise<void> => {
            if (!generationOpen) {
              poison('runtime-lease-expired');
              throw freshFatal('runtime-lease-expired');
            }
            if (captureDepth !== 0) {
              poison('runtime-reentrant-operation');
              throw freshFatal('runtime-reentrant-operation');
            }
            if (activeLease !== lease || lease.settled) {
              poison('runtime-lease-expired');
              throw freshFatal('runtime-lease-expired');
            }
            if (poisoned) {
              throw freshFatal('runtime-poisoned');
            }
            if (lease.beforeStarted) {
              poison('runtime-duplicate-operation');
              throw freshFatal('runtime-duplicate-operation');
            }
            lease.beforeStarted = true;
            observe('reservation', 'attempted', lease.ownedKey);
            hookPending = true;
            const reserveKey = freezeOwnedKey(lease.ownedKey);
            try {
              await reserveImage(reserveKey);
            } catch (error) {
              hookPending = false;
              if (isLocalFatal(error)) {
                const code = localSuffix(error) ?? 'runtime-reservation-failed';
                poison(code);
                safeObserve('reservation', 'failed', lease.ownedKey);
                throw freshFatal(code);
              }
              if (poisoned) {
                safeObserve('reservation', 'failed', lease.ownedKey);
                throw freshFatal('runtime-poisoned');
              }
              // Reserve ports never classify provider errors: even a recognized
              // module-created provider object escaping reserve maps to a
              // fresh reservation fatal.
              poison('runtime-reservation-failed');
              safeObserve('reservation', 'failed', lease.ownedKey);
              throw freshFatal('runtime-reservation-failed');
            }
            // Post-await identity checks stop a late reservation from ever
            // reaching the SDK dispatch after the body already returned: the
            // pending reservation settles as failed, never completed.
            hookPending = false;
            if (!generationOpen) {
              poison('runtime-lease-expired');
              safeObserve('reservation', 'failed', lease.ownedKey);
              throw freshFatal('runtime-lease-expired');
            }
            if (activeLease !== lease || lease.settled) {
              poison('runtime-lease-expired');
              safeObserve('reservation', 'failed', lease.ownedKey);
              throw freshFatal('runtime-lease-expired');
            }
            if (poisoned) {
              safeObserve('reservation', 'failed', lease.ownedKey);
              throw freshFatal('runtime-poisoned');
            }
            lease.beforeCompleted = true;
            observe('reservation', 'completed', lease.ownedKey);
          })();
          void promise.then(undefined, () => undefined);
          return promise;
        };

        const onResponseMetadata = (metadata: unknown): void => {
          if (!generationOpen) {
            poison('runtime-lease-expired');
            throw freshFatal('runtime-lease-expired');
          }
          if (captureDepth !== 0) {
            poison('runtime-reentrant-operation');
            throw freshFatal('runtime-reentrant-operation');
          }
          if (activeLease !== lease || lease.settled) {
            poison('runtime-lease-expired');
            throw freshFatal('runtime-lease-expired');
          }
          if (poisoned) {
            throw freshFatal('runtime-poisoned');
          }
          if (!lease.beforeCompleted) {
            poison('runtime-metadata-invalid');
            throw freshFatal('runtime-metadata-invalid');
          }
          if (lease.metaSeen) {
            poison('runtime-metadata-invalid');
            throw freshFatal('runtime-metadata-invalid');
          }
          lease.metaSeen = true;
          captureDepth++;
          let version: string;
          try {
            version = captureModelVersion(metadata);
          } catch {
            poison('runtime-metadata-invalid');
            throw freshFatal('runtime-metadata-invalid');
          } finally {
            captureDepth--;
          }
          if (!generationOpen) {
            poison('runtime-lease-expired');
            throw freshFatal('runtime-lease-expired');
          }
          if (poisoned) {
            const retainedMeta = firstPoisonCode;
            throw freshFatal(retainedMeta ?? 'runtime-poisoned');
          }
          if (activeLease !== lease || lease.settled) {
            poison('runtime-lease-expired');
            throw freshFatal('runtime-lease-expired');
          }
          observe('metadata', 'attempted', lease.ownedKey);
          const versionKey = freezeOwnedKey(lease.ownedKey);
          try {
            onModelVersion(versionKey, version);
          } catch (error) {
            if (isLocalFatal(error)) {
              const code = localSuffix(error) ?? 'runtime-callback-failed';
              poison(code);
              safeObserve('metadata', 'failed', lease.ownedKey);
              throw freshFatal(code);
            }
            if (poisoned) {
              safeObserve('metadata', 'failed', lease.ownedKey);
              throw freshFatal('runtime-poisoned');
            }
            // Version ports never classify provider errors: even a recognized
            // module-created provider object escaping the callback maps to a
            // fresh callback fatal.
            poison('runtime-callback-failed');
            safeObserve('metadata', 'failed', lease.ownedKey);
            throw freshFatal('runtime-callback-failed');
          }
          if (activeLease !== lease || lease.settled) {
            poison('runtime-lease-expired');
            safeObserve('metadata', 'failed', lease.ownedKey);
            throw freshFatal('runtime-lease-expired');
          }
          if (poisoned) {
            safeObserve('metadata', 'failed', lease.ownedKey);
            throw freshFatal('runtime-poisoned');
          }
          lease.metaDone = true;
          observe('metadata', 'completed', lease.ownedKey);
        };

        try {
          const text = await generateVision(
            'gemini-3.8-flash',
            prompt,
            imageBase64,
            source,
            {
              mode: 'calibration',
              thinkingLevel,
              imageMediaType: mediaType,
              timeoutMs: 30000,
              beforeRequest,
              onResponseMetadata,
            },
          );
          try {
            assertLive(lease);
          } catch (error) {
            poison('runtime-lease-expired');
            if (isLocalFatal(error)) {
              throw freshFatal(localSuffix(error) ?? 'runtime-lease-expired');
            }
            throw freshFatal('runtime-lease-expired');
          }
          // Contract breaches poison before throwing; the single failed
          // observation for the vision failure is recorded once below in
          // the catch, never duplicated here.
          if (!lease.beforeCompleted) {
            poison('runtime-dispatch-contract-invalid');
            throw freshFatal('runtime-dispatch-contract-invalid');
          }
          if (!lease.metaDone) {
            poison('runtime-metadata-invalid');
            throw freshFatal('runtime-metadata-invalid');
          }
          if (typeof text !== 'string' || text.trim().length === 0) {
            poison('runtime-dispatch-contract-invalid');
            throw freshFatal('runtime-dispatch-contract-invalid');
          }
          observe('vision', 'completed', lease.ownedKey);
          return text;
        } catch (error) {
          if (isLocalFatal(error)) {
            safeObserve('vision', 'failed', lease.ownedKey);
            throw freshFatal(localSuffix(error) ?? 'runtime-lease-expired');
          }
          if (hookPending) {
            poison('runtime-callback-failed');
            safeObserve('vision', 'failed', lease.ownedKey);
            throw freshFatal('runtime-callback-failed');
          }
          if (poisoned) {
            // Independent poison wins before scoring any provider shape, and
            // the retained first poison code survives a trusted generator
            // that swallowed a hook/reservation/metadata failure and rethrew
            // foreign: the failing call keeps its original specific static.
            safeObserve('vision', 'failed', lease.ownedKey);
            const retained = firstPoisonCode;
            throw freshFatal(retained ?? 'runtime-poisoned');
          }
          if (isProviderError(error)) {
            safeObserve('vision', 'failed', lease.ownedKey);
            throw freshProvider();
          }
          safeObserve('vision', 'failed', lease.ownedKey);
          throw freshProvider();
        } finally {
          generationOpen = false;
          if (acquired) {
            lease.inFlight -= 1;
          }
        }
      })();
      void operation.then(undefined, () => undefined);
      return operation;
    };

    const lookupSnapshotCap = (): Readonly<OffProduct> => {
      if (captureDepth !== 0) {
        poison('runtime-reentrant-operation');
        safeObserve('snapshot', 'failed', lease.ownedKey);
        throw freshFatal('runtime-reentrant-operation');
      }
      guardLive(lease, 'snapshot', 'runtime-lease-expired');
      if (lease.scanMode !== 'barcode') {
        poison('runtime-forbidden-operation');
        safeObserve('snapshot', 'failed', lease.ownedKey);
        throw freshFatal('runtime-forbidden-operation');
      }
      if (lease.snapshotUsed) {
        poison('runtime-duplicate-operation');
        safeObserve('snapshot', 'failed', lease.ownedKey);
        throw freshFatal('runtime-duplicate-operation');
      }
      if (lease.inFlight !== 0) {
        poison('runtime-reentrant-operation');
        safeObserve('snapshot', 'failed', lease.ownedKey);
        throw freshFatal('runtime-reentrant-operation');
      }
      lease.snapshotUsed = true;
      observe('snapshot', 'attempted', lease.ownedKey);
      const info = caseInfo.get(lease.ownedKey.caseId);
      const barcode = info?.barcode;
      if (typeof barcode !== 'string' || barcode.length === 0) {
        poison('runtime-callback-failed');
        safeObserve('snapshot', 'failed', lease.ownedKey);
        throw freshFatal('runtime-callback-failed');
      }
      let product: Readonly<OffProduct> | undefined;
      try {
        product = lookupSnapshot(barcode);
      } catch (error) {
        if (isLocalFatal(error)) {
          const code = localSuffix(error) ?? 'runtime-callback-failed';
          poison(code);
          safeObserve('snapshot', 'failed', lease.ownedKey);
          throw freshFatal(code);
        }
        if (poisoned) {
          safeObserve('snapshot', 'failed', lease.ownedKey);
          throw freshFatal('runtime-poisoned');
        }
        // Snapshot ports never classify provider errors: even a recognized
        // module-created provider object escaping the lookup maps to a
        // fresh callback fatal with no fallback product.
        poison('runtime-callback-failed');
        safeObserve('snapshot', 'failed', lease.ownedKey);
        throw freshFatal('runtime-callback-failed');
      }
      if (activeLease !== lease || lease.settled) {
        poison('runtime-lease-expired');
        throw freshFatal('runtime-lease-expired');
      }
      if (poisoned) {
        safeObserve('snapshot', 'failed', lease.ownedKey);
        throw freshFatal('runtime-poisoned');
      }
      if (product === undefined) {
        poison('runtime-callback-failed');
        safeObserve('snapshot', 'failed', lease.ownedKey);
        throw freshFatal('runtime-callback-failed');
      }
      observe('snapshot', 'completed', lease.ownedKey);
      return product;
    };

    return Object.freeze({
      loadImage: loadImageCap,
      generateVision: generateVisionCap,
      lookupSnapshot: lookupSnapshotCap,
    }) as Readonly<CalibrationOutcomeCapabilities>;
  }

  async function runOutcome<T>(
    key: unknown,
    body: (capabilities: Readonly<CalibrationOutcomeCapabilities>) => Promise<T>,
  ): Promise<T> {
    if (captureDepth !== 0) {
      poison('runtime-reentrant-operation');
      throw freshFatal('runtime-reentrant-operation');
    }
    if (poisoned) {
      throw freshFatal('runtime-poisoned');
    }
    if (typeof body !== 'function') {
      poison('runtime-callback-failed');
      throw freshFatal('runtime-callback-failed');
    }
    captureDepth++;
    let ownedKey: CalibrationReportOutcomeKey;
    try {
      ownedKey = captureOutcomeKey(key);
    } catch {
      poison('runtime-key-invalid');
      throw freshFatal('runtime-key-invalid');
    } finally {
      captureDepth--;
    }
    if (poisoned) {
      throw freshFatal('runtime-poisoned');
    }
    if (activeLease !== null) {
      poison('runtime-reentrant-operation');
      throw freshFatal('runtime-reentrant-operation');
    }
    const id = keyId(ownedKey);
    const row = planById.get(id);
    if (row === undefined) {
      poison('runtime-key-invalid');
      throw freshFatal('runtime-key-invalid');
    }
    if (usedKeys.has(id)) {
      poison('runtime-duplicate-key');
      throw freshFatal('runtime-duplicate-key');
    }
    usedKeys.add(id);
    leaseSequence += 1;
    const lease: Lease = {
      id: leaseSequence,
      ownedKey,
      scanMode: row.scanMode,
      imageUsed: false,
      visionUsed: false,
      snapshotUsed: false,
      inFlight: 0,
      settled: false,
      beforeStarted: false,
      beforeCompleted: false,
      metaSeen: false,
      metaDone: false,
    };
    activeLease = lease;
    try {
      observe('outcome', 'attempted', ownedKey);
    } catch (error) {
      activeLease = null;
      lease.settled = true;
      poison('runtime-trace-limit');
      if (isLocalFatal(error)) {
        throw freshFatal(localSuffix(error) ?? 'runtime-trace-limit');
      }
      throw freshFatal('runtime-trace-limit');
    }
    const capabilities = buildCapabilities(lease);
    let result: T;
    try {
      result = await (body as (caps: Readonly<CalibrationOutcomeCapabilities>) => Promise<T>)(capabilities);
    } catch (error) {
      const pendingInFlight = lease.inFlight !== 0;
      lease.settled = true;
      activeLease = null;
      if (pendingInFlight) {
        poison('runtime-callback-failed');
        safeObserve('outcome', 'failed', ownedKey);
        throw freshFatal('runtime-callback-failed');
      }
      if (isLocalFatal(error)) {
        safeObserve('outcome', 'failed', ownedKey);
        throw freshFatal(localSuffix(error) ?? 'runtime-callback-failed');
      }
      // Independent poison wins before scoring a provider object the body
      // rethrows (for example a received provider error rethrown after a
      // swallowed read fatal): the outer failure stays fatal, never
      // provider. With no private poison, a recognized module-created
      // provider escaping the body still maps to a fresh provider error.
      if (poisoned) {
        safeObserve('outcome', 'failed', ownedKey);
        throw freshFatal('runtime-poisoned');
      }
      if (isProviderError(error)) {
        safeObserve('outcome', 'failed', ownedKey);
        throw freshProvider();
      }
      poison('runtime-callback-failed');
      safeObserve('outcome', 'failed', ownedKey);
      throw freshFatal('runtime-callback-failed');
    }
    if (lease.inFlight !== 0) {
      lease.settled = true;
      activeLease = null;
      poison('runtime-callback-failed');
      safeObserve('outcome', 'failed', ownedKey);
      throw freshFatal('runtime-callback-failed');
    }
    if (poisoned) {
      lease.settled = true;
      activeLease = null;
      safeObserve('outcome', 'failed', ownedKey);
      throw freshFatal('runtime-poisoned');
    }
    if (activeLease !== lease || lease.settled) {
      lease.settled = true;
      activeLease = null;
      poison('runtime-lease-expired');
      safeObserve('outcome', 'failed', ownedKey);
      throw freshFatal('runtime-lease-expired');
    }
    lease.settled = true;
    activeLease = null;
    try {
      observe('outcome', 'completed', ownedKey);
    } catch (error) {
      poison('runtime-trace-limit');
      if (isLocalFatal(error)) {
        throw freshFatal(localSuffix(error) ?? 'runtime-trace-limit');
      }
      throw freshFatal('runtime-trace-limit');
    }
    return result;
  }

  return Object.freeze({
    runOutcome,
    getPlannedOutcomes,
    getObservations,
  }) as Readonly<CalibrationRuntimeCapabilities>;
}
