/**
 * Pure immutable reduction and keyed reconciliation for calibration durable
 * runtime evidence (Task 2 Step 3).
 *
 * Consumes closed header/plans DATA (derived natively from pinned files) and
 * validated protocol facts alongside runtime events. No filesystem, network,
 * bootstrap, ledger or provider imports. Facts are assumed validated by
 * shared core; this seam checks structural plan coverage, keyed transition
 * order, terminal references, ownership epochs, recovery closure and prefix
 * binding completeness. Data hashes are integrity, not admission tokens.
 */
import { createHash } from 'node:crypto';
import {
  captureCalibrationRuntimeEvidenceEvent,
  captureCalibrationRuntimeEvidenceHeader,
} from './calibration-runtime-evidence-codec';
import type {
  RuntimeBindingInput,
  RuntimeEvidenceEvent,
  RuntimeEvidenceHeader,
} from './calibration-runtime-evidence-codec';
import { captureCalibrationReportJournalEntry } from './calibration-report-journal';
import { captureCalibrationNonReservationEvent } from './calibration-report-state';
import { CalibrationFatalError } from './fatal-error';
import type {
  CalibrationIdentity,
  CalibrationOwner,
  CalibrationProfile,
  JournalEntry,
  StageName,
} from './calibration';
import type {
  CalibrationNonReservationLedgerEvent,
  CalibrationPlannedReportOutcome,
  CalibrationReportOutcomeKey,
} from './calibration-report-state';
import type { CalibrationPublishedReportReceipt } from './calibration-report-publication';

export type RuntimeCanonicalPlans = {
  readonly initial: readonly CalibrationPlannedReportOutcome[];
  readonly LOW: readonly CalibrationPlannedReportOutcome[];
  readonly MEDIUM: readonly CalibrationPlannedReportOutcome[];
};

export type RuntimeProtocolFact =
  | { readonly kind: 'reserved'; readonly eventIndex: number; readonly key: CalibrationReportOutcomeKey }
  | {
      readonly kind: 'image_terminal';
      readonly eventIndex: number;
      readonly key: CalibrationReportOutcomeKey;
      readonly terminalType: 'completed' | 'failed';
      readonly journalHash: string;
      readonly journal: unknown;
    }
  | {
      readonly kind: 'non_reservation_result';
      readonly eventIndex: number;
      readonly event: CalibrationNonReservationLedgerEvent;
    }
  | { readonly kind: 'model_version_pinned'; readonly eventIndex: number; readonly responseModelVersion: string }
  | { readonly kind: 'profile_selected'; readonly eventIndex: number; readonly profile: CalibrationProfile }
  | {
      readonly kind: 'artifact_receipt_admitted';
      readonly eventIndex: number;
      readonly receipt: CalibrationPublishedReportReceipt;
    }
  | {
      readonly kind: 'lock_recovery';
      readonly eventIndex: number;
      readonly staleOwner: CalibrationOwner;
      readonly recoveringOwner: CalibrationOwner;
    }
  | {
      readonly kind: 'protocol_noop';
      readonly eventIndex: number;
      readonly eventType:
        | 'token_count_reserved'
        | 'token_count_completed'
        | 'token_count_failed'
        | 'safe_error'
        | 'stage_completed';
    };

export type RuntimeFrame =
  | RuntimeProtocolFact
  | { readonly kind: 'runtime'; readonly eventIndex: number; readonly event: RuntimeEvidenceEvent };

export type RuntimeEvidenceSnapshot = {
  readonly sequence: number;
  readonly lastEventIndex: number;
  readonly owner: CalibrationOwner;
  readonly activeAttempt: { readonly key: CalibrationReportOutcomeKey; readonly attempt: number } | null;
  readonly events: readonly RuntimeEvidenceEvent[];
};

export interface CalibrationRuntimeEvidenceState {
  readonly preview: (frame: unknown) => Readonly<CalibrationRuntimeEvidenceState>;
  readonly snapshot: () => Readonly<RuntimeEvidenceSnapshot>;
  readonly pairInput: (
    stage: unknown,
    profile: unknown,
    throughSequence: unknown,
  ) => Readonly<Omit<RuntimeBindingInput, 'receipt'>>;
}


const TRANSITION = 'calibration:runtime-evidence-transition-invalid';
const INVALID = 'calibration:runtime-evidence-invalid';

function transitionInvalid(): never {
  throw new CalibrationFatalError(TRANSITION);
}

function inputInvalid(): never {
  throw new CalibrationFatalError(INVALID);
}

function isSafeArray(value: unknown): boolean {
  try {
    return Array.isArray(value);
  } catch {
    return false;
  }
}

function captureExact(value: unknown, allowed: readonly string[], invalid: () => never): Map<string, unknown> {
  if (typeof value !== 'object' || value === null || isSafeArray(value)) {
    return invalid();
  }
  let proto: unknown;
  try {
    proto = Object.getPrototypeOf(value);
  } catch {
    return invalid();
  }
  if (proto !== Object.prototype && proto !== null) {
    return invalid();
  }
  let names: string[];
  let symbols: symbol[];
  try {
    names = Object.getOwnPropertyNames(value);
    symbols = Object.getOwnPropertySymbols(value);
  } catch {
    return invalid();
  }
  if (symbols.length !== 0) {
    return invalid();
  }
  if (names.length !== allowed.length) {
    return invalid();
  }
  const map = new Map<string, unknown>();
  for (const name of names) {
    if (!allowed.includes(name)) {
      return invalid();
    }
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, name);
    } catch {
      return invalid();
    }
    if (descriptor === undefined || descriptor.enumerable !== true || !('value' in descriptor)) {
      return invalid();
    }
    let fieldValue: unknown;
    try {
      fieldValue = (descriptor as PropertyDescriptor & { value: unknown }).value;
    } catch {
      return invalid();
    }
    if (fieldValue === undefined) {
      return invalid();
    }
    map.set(name, fieldValue);
  }
  for (const required of allowed) {
    if (!map.has(required)) {
      return invalid();
    }
  }
  return map;
}

const CASE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const HEX64_PATTERN = /^[0-9a-f]{64}$/;
const MODEL_VERSION_PATTERN = /^[A-Za-z0-9_./-]{1,128}$/;
const CANONICAL_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const RUN_ID_PATTERN = /^calibration-(preflight|development|validation|benchmark)-(low|medium)-([0-9a-f]{12})-(\d{8}T\d{9}Z)$/;

const STAGE_SAMPLE_RANGE: Record<string, { min: number; max: number }> = {
  preflight: { min: 1, max: 1 },
  development: { min: 1, max: 1 },
  validation: { min: 1, max: 3 },
  benchmark: { min: 1, max: 3 },
};

function capturePositiveIndex(value: unknown, invalid: () => never): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0 || Object.is(value, -0)) {
    return invalid();
  }
  return value;
}

function captureTimestamp(value: unknown, invalid: () => never): string {
  if (typeof value !== 'string' || !CANONICAL_ISO_PATTERN.test(value)) {
    return invalid();
  }
  let parsed = Number.NaN;
  try {
    parsed = Date.parse(value);
  } catch {
    return invalid();
  }
  if (!Number.isFinite(parsed)) {
    return invalid();
  }
  let roundTrip = '';
  try {
    roundTrip = new Date(parsed).toISOString();
  } catch {
    return invalid();
  }
  if (roundTrip !== value) {
    return invalid();
  }
  return value;
}

function captureOwner(value: unknown, invalid: () => never): CalibrationOwner {
  const map = captureExact(value, ['hostname', 'bootId', 'pid', 'startTicks', 'acquiredAt'], invalid);
  const hostname = map.get('hostname');
  const bootId = map.get('bootId');
  const pid = map.get('pid');
  const startTicks = map.get('startTicks');
  const acquiredAt = map.get('acquiredAt');
  if (typeof hostname !== 'string' || hostname.trim().length === 0) {
    return invalid();
  }
  if (typeof bootId !== 'string' || bootId.trim().length === 0) {
    return invalid();
  }
  if (typeof pid !== 'number' || !Number.isSafeInteger(pid) || pid <= 0) {
    return invalid();
  }
  if (typeof startTicks !== 'number' || !Number.isSafeInteger(startTicks) || startTicks <= 0) {
    return invalid();
  }
  captureTimestamp(acquiredAt, invalid);
  const owned = { hostname, bootId, pid, startTicks, acquiredAt: acquiredAt as string };
  return deepFreeze(owned) as CalibrationOwner;
}

function sameOwner(a: CalibrationOwner, b: CalibrationOwner): boolean {
  return (
    a.hostname === b.hostname &&
    a.bootId === b.bootId &&
    a.pid === b.pid &&
    a.startTicks === b.startTicks &&
    a.acquiredAt === b.acquiredAt
  );
}

function captureOutcomeKey(value: unknown, invalid: () => never): CalibrationReportOutcomeKey {
  const map = captureExact(value, ['stage', 'profile', 'caseId', 'sampleIndex'], invalid);
  const stage = map.get('stage');
  const profile = map.get('profile');
  const caseId = map.get('caseId');
  const sampleIndex = map.get('sampleIndex');
  if (stage !== 'preflight' && stage !== 'development' && stage !== 'validation' && stage !== 'benchmark') {
    return invalid();
  }
  if (profile !== 'LOW' && profile !== 'MEDIUM') {
    return invalid();
  }
  if (typeof caseId !== 'string' || !CASE_ID_PATTERN.test(caseId)) {
    return invalid();
  }
  const range = STAGE_SAMPLE_RANGE[stage as string];
  if (
    range === undefined ||
    typeof sampleIndex !== 'number' ||
    !Number.isInteger(sampleIndex) ||
    sampleIndex < range.min ||
    sampleIndex > range.max
  ) {
    return invalid();
  }
  const owned = { stage, profile, caseId, sampleIndex };
  return deepFreeze(owned) as unknown as CalibrationReportOutcomeKey;
}

function canonicalKeyId(key: CalibrationReportOutcomeKey): string {
  return `${key.stage}|${key.profile}|${key.caseId}|${key.sampleIndex}`;
}

function sameKey(a: CalibrationReportOutcomeKey, b: CalibrationReportOutcomeKey): boolean {
  return canonicalKeyId(a) === canonicalKeyId(b);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    if (Array.isArray(value)) {
      for (const entry of value as unknown[]) {
        deepFreeze(entry);
      }
      Object.freeze(value);
      return value;
    }
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
    return value;
  }
  return value;
}

function canonicalize(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new CalibrationFatalError(TRANSITION);
    }
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalize(entry)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const parts = keys.map(
      (key) => `${JSON.stringify(key)}:${canonicalize((value as Record<string, unknown>)[key])}`,
    );
    return `{${parts.join(',')}}`;
  }
  throw new CalibrationFatalError(TRANSITION);
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
function captureReceipt(
  value: unknown,
  invalid: () => never,
): CalibrationPublishedReportReceipt {
  const map = captureExact(value, ['stage', 'profile', 'runId', 'jsonSha256', 'markdownSha256'], invalid);
  const stage = map.get('stage');
  const profile = map.get('profile');
  const runId = map.get('runId');
  const jsonSha256 = map.get('jsonSha256');
  const markdownSha256 = map.get('markdownSha256');
  if (stage !== 'preflight' && stage !== 'development' && stage !== 'validation' && stage !== 'benchmark') {
    return invalid();
  }
  if (profile !== 'LOW' && profile !== 'MEDIUM') {
    return invalid();
  }
  if (typeof runId !== 'string') {
    return invalid();
  }
  const match = RUN_ID_PATTERN.exec(runId);
  if (match === null) {
    return invalid();
  }
  if (match[1] !== stage || match[2] !== (profile as string).toLowerCase()) {
    return invalid();
  }
  if (typeof jsonSha256 !== 'string' || !HEX64_PATTERN.test(jsonSha256)) {
    return invalid();
  }
  if (typeof markdownSha256 !== 'string' || !HEX64_PATTERN.test(markdownSha256)) {
    return invalid();
  }
  const owned = { stage, profile, runId, jsonSha256, markdownSha256 };
  return deepFreeze(owned) as unknown as CalibrationPublishedReportReceipt;
}

function checkReceiptCommit(
  receipt: CalibrationPublishedReportReceipt,
  implementationCommit: string,
  invalid: () => never,
): void {
  const expected = implementationCommit.slice(0, 12);
  if (!receipt.runId.includes(expected)) {
    return invalid();
  }
}

type ValidatedPlans = {
  readonly initial: ReadonlyArray<{ key: CalibrationReportOutcomeKey; scanMode: string }>;
  readonly LOW: ReadonlyArray<{ key: CalibrationReportOutcomeKey; scanMode: string }>;
  readonly MEDIUM: ReadonlyArray<{ key: CalibrationReportOutcomeKey; scanMode: string }>;
  readonly initialById: ReadonlyMap<string, { key: CalibrationReportOutcomeKey; scanMode: string }>;
  readonly lowById: ReadonlyMap<string, { key: CalibrationReportOutcomeKey; scanMode: string }>;
  readonly mediumById: ReadonlyMap<string, { key: CalibrationReportOutcomeKey; scanMode: string }>;
};

function capturePlanRow(value: unknown, invalid: () => never): { key: CalibrationReportOutcomeKey; scanMode: string } {
  const map = captureExact(value, ['key', 'scanMode'], invalid);
  const key = captureOutcomeKey(map.get('key'), invalid);
  const scanMode = map.get('scanMode');
  if (scanMode !== 'meal' && scanMode !== 'label' && scanMode !== 'barcode') {
    return invalid();
  }
  return { key, scanMode: scanMode as string };
}

function capturePlanList(
  value: unknown,
  expectedLength: number,
  invalid: () => never,
): Array<{ key: CalibrationReportOutcomeKey; scanMode: string }> {
  if (!isSafeArray(value)) {
    return invalid();
  }
  const target = value as object;
  let names: string[];
  let symbols: symbol[];
  try {
    names = Object.getOwnPropertyNames(target);
    symbols = Object.getOwnPropertySymbols(target);
  } catch {
    return invalid();
  }
  if (symbols.length !== 0) {
    return invalid();
  }
  // Native Array.prototype check: ensure dense native-prototype array
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    return invalid();
  }
  let lengthDescriptor: PropertyDescriptor | undefined;
  try {
    lengthDescriptor = Object.getOwnPropertyDescriptor(target, 'length');
  } catch {
    return invalid();
  }
  if (lengthDescriptor === undefined || !('value' in lengthDescriptor)) {
    return invalid();
  }
  const length = (lengthDescriptor as PropertyDescriptor & { value: unknown }).value;
  if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0) {
    return invalid();
  }
  if (length !== expectedLength) {
    return invalid();
  }
  const nameSet = new Set(names);
  if (!nameSet.delete('length')) {
    return invalid();
  }
  for (let index = 0; index < length; index += 1) {
    if (!nameSet.delete(String(index))) {
      return invalid();
    }
  }
  if (nameSet.size !== 0) {
    return invalid();
  }
  const rows: Array<{ key: CalibrationReportOutcomeKey; scanMode: string }> = [];
  for (let index = 0; index < length; index += 1) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(target, String(index));
    } catch {
      return invalid();
    }
    if (descriptor === undefined || descriptor.enumerable !== true || !('value' in descriptor)) {
      return invalid();
    }
    let elementValue: unknown;
    try {
      elementValue = (descriptor as PropertyDescriptor & { value: unknown }).value;
    } catch {
      return invalid();
    }
    rows.push(capturePlanRow(elementValue, invalid));
  }
  return rows;
}

function classifyInitialComposition(
  rows: ReadonlyArray<{ key: CalibrationReportOutcomeKey; scanMode: string }>,
  invalid: () => never,
): void {
  const counts: Record<CalibrationProfile, { preflight: number; development: number }> = {
    LOW: { preflight: 0, development: 0 },
    MEDIUM: { preflight: 0, development: 0 },
  };
  for (const row of rows) {
    if (row.scanMode !== 'meal') {
      return invalid();
    }
    if (row.key.stage === 'preflight') {
      counts[row.key.profile].preflight += 1;
    } else if (row.key.stage === 'development') {
      counts[row.key.profile].development += 1;
    } else {
      return invalid();
    }
  }
  if (
    counts.LOW.preflight !== 1 ||
    counts.LOW.development !== 24 ||
    counts.MEDIUM.preflight !== 1 ||
    counts.MEDIUM.development !== 24
  ) {
    return invalid();
  }
}

function classifyTailComposition(
  rows: ReadonlyArray<{ key: CalibrationReportOutcomeKey; scanMode: string }>,
  ownProfile: CalibrationProfile,
  invalid: () => never,
): void {
  let validationMeal = 0;
  let benchmarkMeal = 0;
  let benchmarkLabel = 0;
  let benchmarkBarcode = 0;
  for (const row of rows) {
    if (row.key.profile !== ownProfile) {
      return invalid();
    }
    if (row.key.stage === 'validation') {
      if (row.scanMode !== 'meal') {
        return invalid();
      }
      validationMeal += 1;
    } else if (row.key.stage === 'benchmark') {
      if (row.scanMode === 'meal') {
        benchmarkMeal += 1;
      } else if (row.scanMode === 'label') {
        benchmarkLabel += 1;
      } else {
        benchmarkBarcode += 1;
      }
    } else {
      return invalid();
    }
  }
  if (validationMeal !== 48) {
    return invalid();
  }
  if (benchmarkMeal !== 36 || benchmarkLabel !== 12 || benchmarkBarcode !== 12) {
    return invalid();
  }
}

function capturePlans(value: unknown): ValidatedPlans {
  const invalid = inputInvalid;
  const map = captureExact(value, ['initial', 'LOW', 'MEDIUM'], invalid);
  const initial = capturePlanList(map.get('initial'), 50, invalid);
  const low = capturePlanList(map.get('LOW'), 158, invalid);
  const medium = capturePlanList(map.get('MEDIUM'), 158, invalid);
  classifyInitialComposition(initial, invalid);
  const idOf = (row: { key: CalibrationReportOutcomeKey }): string => canonicalKeyId(row.key);
  const initialIds = initial.map(idOf);
  const lowIds = low.map(idOf);
  const mediumIds = medium.map(idOf);
  for (let index = 0; index < 50; index += 1) {
    if (lowIds[index] !== initialIds[index] || mediumIds[index] !== initialIds[index]) {
      return invalid();
    }
    const initialRow = initial[index];
    const lowRow = low[index];
    const mediumRow = medium[index];
    if (initialRow === undefined || lowRow === undefined || mediumRow === undefined) {
      return invalid();
    }
    if (lowRow.scanMode !== initialRow.scanMode || mediumRow.scanMode !== initialRow.scanMode) {
      return invalid();
    }
  }
  const checkUnique = (ids: string[]): void => {
    if (new Set(ids).size !== ids.length) {
      return invalid();
    }
  };
  checkUnique(initialIds);
  checkUnique(lowIds);
  checkUnique(mediumIds);
  classifyTailComposition(low.slice(50), 'LOW', invalid);
  classifyTailComposition(medium.slice(50), 'MEDIUM', invalid);
  const initialById = new Map(initial.map((row) => [idOf(row), { key: row.key, scanMode: row.scanMode }] as const));
  const lowById = new Map(low.map((row) => [idOf(row), { key: row.key, scanMode: row.scanMode }] as const));
  const mediumById = new Map(medium.map((row) => [idOf(row), { key: row.key, scanMode: row.scanMode }] as const));
  return { initial, LOW: low, MEDIUM: medium, initialById, lowById, mediumById };
}

function captureParams(value: unknown): { header: RuntimeEvidenceHeader; plans: ValidatedPlans } {
  const map = captureExact(value, ['header', 'plans'], inputInvalid);
  let header: RuntimeEvidenceHeader;
  try {
    header = captureCalibrationRuntimeEvidenceHeader(map.get('header'));
  } catch {
    return inputInvalid();
  }
  const plans = capturePlans(map.get('plans'));
  return { header, plans };
}

const FACT_KINDS = new Set([
  'reserved',
  'image_terminal',
  'non_reservation_result',
  'model_version_pinned',
  'profile_selected',
  'artifact_receipt_admitted',
  'lock_recovery',
  'protocol_noop',
]);

const NOOP_TYPES = new Set([
  'token_count_reserved',
  'token_count_completed',
  'token_count_failed',
  'safe_error',
  'stage_completed',
]);

const INTERRUPTED_FIELDS = [
  'key',
  'predictionHash',
  'normalizedPrediction',
  'analysisLatencyMs',
  'errorCategory',
  'responseModelVersion',
] as const;

function captureInterruptedJournal(
  value: unknown,
  invalid: () => never,
): { key: CalibrationReportOutcomeKey; predictionHash: 'interrupted_reservation'; normalizedPrediction: null; analysisLatencyMs: 0; errorCategory: 'interrupted_reservation'; responseModelVersion: 'n/a' } | null {
  if (typeof value !== 'object' || value === null || isSafeArray(value)) {
    return null;
  }
  let proto: unknown;
  try {
    proto = Object.getPrototypeOf(value);
  } catch {
    return null;
  }
  if (proto !== Object.prototype && proto !== null) {
    return null;
  }
  let names: string[];
  let symbols: symbol[];
  try {
    names = Object.getOwnPropertyNames(value);
    symbols = Object.getOwnPropertySymbols(value);
  } catch {
    return null;
  }
  if (symbols.length !== 0 || names.length !== 6) {
    return null;
  }
  const map = new Map<string, unknown>();
  for (const name of names) {
    if (!(INTERRUPTED_FIELDS as readonly string[]).includes(name)) {
      return null;
    }
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, name);
    } catch {
      return null;
    }
    if (descriptor === undefined || descriptor.enumerable !== true || !('value' in descriptor)) {
      return null;
    }
    map.set(name, (descriptor as PropertyDescriptor & { value: unknown }).value);
  }
  if (
    map.get('predictionHash') !== 'interrupted_reservation' ||
    map.get('normalizedPrediction') !== null ||
    map.get('analysisLatencyMs') !== 0 ||
    map.get('errorCategory') !== 'interrupted_reservation' ||
    map.get('responseModelVersion') !== 'n/a'
  ) {
    return null;
  }
  const keyValue = map.get('key');
  if (typeof keyValue !== 'object' || keyValue === null) {
    return null;
  }
  const key = captureOutcomeKey(keyValue, invalid);
  return {
    key,
    predictionHash: 'interrupted_reservation',
    normalizedPrediction: null,
    analysisLatencyMs: 0,
    errorCategory: 'interrupted_reservation',
    responseModelVersion: 'n/a',
  };
}

function captureImageTerminalJournal(
  key: CalibrationReportOutcomeKey,
  terminalType: unknown,
  journalHash: unknown,
  journal: unknown,
  invalid: () => never,
): { captured: JournalEntry | null; interrupted: Record<string, unknown> | null; hash: string } {
  if (terminalType !== 'completed' && terminalType !== 'failed') {
    return invalid();
  }
  if (typeof journalHash !== 'string' || !HEX64_PATTERN.test(journalHash)) {
    return invalid();
  }
  const interruptedCandidate = captureInterruptedJournal(journal, invalid);
  if (interruptedCandidate !== null) {
    if (terminalType !== 'failed') {
      return invalid();
    }
    if (!sameKey(interruptedCandidate.key, key)) {
      return invalid();
    }
    const owned: Record<string, unknown> = {
      key: interruptedCandidate.key,
      predictionHash: interruptedCandidate.predictionHash,
      normalizedPrediction: interruptedCandidate.normalizedPrediction,
      analysisLatencyMs: interruptedCandidate.analysisLatencyMs,
      errorCategory: interruptedCandidate.errorCategory,
      responseModelVersion: interruptedCandidate.responseModelVersion,
    };
    const computed = sha256Hex(JSON.stringify(owned));
    if (computed !== journalHash) {
      return invalid();
    }
    return { captured: null, interrupted: owned, hash: journalHash as string };
  }
  let captured: JournalEntry;
  try {
    captured = captureCalibrationReportJournalEntry(journal) as unknown as JournalEntry;
  } catch {
    return invalid();
  }
  const capturedKey = captured.key as unknown as CalibrationReportOutcomeKey;
  if (!sameKey(capturedKey, key)) {
    return invalid();
  }
  const recomputed = sha256Hex(JSON.stringify(captured));
  if (recomputed !== journalHash) {
    return invalid();
  }
  // Ordinary completion finalizes success or failure; journal content decides
  // success. Canonical interruption journals above still require `failed`.
  if (captured.errorCategory === 'none') {
    if (terminalType !== 'completed') {
      return invalid();
    }
  }
  return { captured, interrupted: null, hash: journalHash as string };
}
type CapturedFrame =
  | { readonly kind: 'runtime'; readonly eventIndex: number; readonly event: RuntimeEvidenceEvent }
  | { readonly kind: 'reserved'; readonly eventIndex: number; readonly key: CalibrationReportOutcomeKey }
  | {
      readonly kind: 'image_terminal';
      readonly eventIndex: number;
      readonly key: CalibrationReportOutcomeKey;
      readonly terminalType: 'completed' | 'failed';
      readonly journalHash: string;
      readonly captured: JournalEntry | null;
      readonly interrupted: Record<string, unknown> | null;
    }
  | {
      readonly kind: 'non_reservation_result';
      readonly eventIndex: number;
      readonly event: CalibrationNonReservationLedgerEvent;
    }
  | { readonly kind: 'model_version_pinned'; readonly eventIndex: number; readonly responseModelVersion: string }
  | { readonly kind: 'profile_selected'; readonly eventIndex: number; readonly profile: CalibrationProfile }
  | {
      readonly kind: 'artifact_receipt_admitted';
      readonly eventIndex: number;
      readonly receipt: CalibrationPublishedReportReceipt;
    }
  | {
      readonly kind: 'lock_recovery';
      readonly eventIndex: number;
      readonly staleOwner: CalibrationOwner;
      readonly recoveringOwner: CalibrationOwner;
    }
  | {
      readonly kind: 'protocol_noop';
      readonly eventIndex: number;
      readonly eventType:
        | 'token_count_reserved'
        | 'token_count_completed'
        | 'token_count_failed'
        | 'safe_error'
        | 'stage_completed';
    };

function readKind(value: unknown, invalid: () => never): string {
  if (typeof value !== 'object' || value === null || isSafeArray(value)) {
    return invalid();
  }
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(value, 'kind');
  } catch {
    return invalid();
  }
  if (descriptor === undefined || descriptor.enumerable !== true || !('value' in descriptor)) {
    return invalid();
  }
  let kind: unknown;
  try {
    kind = (descriptor as PropertyDescriptor & { value: unknown }).value;
  } catch {
    return invalid();
  }
  if (typeof kind !== 'string') {
    return invalid();
  }
  return kind;
}

function captureFrame(value: unknown, invalid: () => never): CapturedFrame {
  const kind = readKind(value, invalid);
  if (kind === 'runtime') {
    const map = captureExact(value, ['kind', 'eventIndex', 'event'], invalid);
    const eventIndex = capturePositiveIndex(map.get('eventIndex'), invalid);
    let event: RuntimeEvidenceEvent;
    try {
      event = captureCalibrationRuntimeEvidenceEvent(map.get('event'));
    } catch {
      return invalid();
    }
    return { kind: 'runtime', eventIndex, event };
  }
  if (kind === 'reserved') {
    const map = captureExact(value, ['kind', 'eventIndex', 'key'], invalid);
    const eventIndex = capturePositiveIndex(map.get('eventIndex'), invalid);
    const key = captureOutcomeKey(map.get('key'), invalid);
    return { kind: 'reserved', eventIndex, key };
  }
  if (kind === 'image_terminal') {
    const map = captureExact(
      value,
      ['kind', 'eventIndex', 'key', 'terminalType', 'journalHash', 'journal'],
      invalid,
    );
    const eventIndex = capturePositiveIndex(map.get('eventIndex'), invalid);
    const key = captureOutcomeKey(map.get('key'), invalid);
    const terminalType = map.get('terminalType');
    const journalHash = map.get('journalHash');
    const checked = captureImageTerminalJournal(key, terminalType, journalHash, map.get('journal'), invalid);
    return {
      kind: 'image_terminal',
      eventIndex,
      key,
      terminalType: terminalType as 'completed' | 'failed',
      journalHash: checked.hash,
      captured: checked.captured,
      interrupted: checked.interrupted,
    };
  }
  if (kind === 'non_reservation_result') {
    const map = captureExact(value, ['kind', 'eventIndex', 'event'], invalid);
    const eventIndex = capturePositiveIndex(map.get('eventIndex'), invalid);
    let event: CalibrationNonReservationLedgerEvent;
    try {
      event = captureCalibrationNonReservationEvent(map.get('event')) as unknown as CalibrationNonReservationLedgerEvent;
    } catch {
      return invalid();
    }
    return { kind: 'non_reservation_result', eventIndex, event };
  }
  if (kind === 'model_version_pinned') {
    const map = captureExact(value, ['kind', 'eventIndex', 'responseModelVersion'], invalid);
    const eventIndex = capturePositiveIndex(map.get('eventIndex'), invalid);
    const version = map.get('responseModelVersion');
    if (typeof version !== 'string' || !MODEL_VERSION_PATTERN.test(version) || version === 'n/a') {
      return invalid();
    }
    return { kind: 'model_version_pinned', eventIndex, responseModelVersion: version };
  }
  if (kind === 'profile_selected') {
    const map = captureExact(value, ['kind', 'eventIndex', 'profile'], invalid);
    const eventIndex = capturePositiveIndex(map.get('eventIndex'), invalid);
    const profile = map.get('profile');
    if (profile !== 'LOW' && profile !== 'MEDIUM') {
      return invalid();
    }
    return { kind: 'profile_selected', eventIndex, profile: profile as CalibrationProfile };
  }
  if (kind === 'artifact_receipt_admitted') {
    const map = captureExact(value, ['kind', 'eventIndex', 'receipt'], invalid);
    const eventIndex = capturePositiveIndex(map.get('eventIndex'), invalid);
    const receipt = captureReceipt(map.get('receipt'), invalid);
    return { kind: 'artifact_receipt_admitted', eventIndex, receipt };
  }
  if (kind === 'lock_recovery') {
    const map = captureExact(value, ['kind', 'eventIndex', 'staleOwner', 'recoveringOwner'], invalid);
    const eventIndex = capturePositiveIndex(map.get('eventIndex'), invalid);
    const staleOwner = captureOwner(map.get('staleOwner'), invalid);
    const recoveringOwner = captureOwner(map.get('recoveringOwner'), invalid);
    if (sameOwner(staleOwner, recoveringOwner)) {
      return invalid();
    }
    return { kind: 'lock_recovery', eventIndex, staleOwner, recoveringOwner };
  }
  if (kind === 'protocol_noop') {
    const map = captureExact(value, ['kind', 'eventIndex', 'eventType'], invalid);
    const eventIndex = capturePositiveIndex(map.get('eventIndex'), invalid);
    const eventType = map.get('eventType');
    if (!NOOP_TYPES.has(eventType as string)) {
      return invalid();
    }
    return {
      kind: 'protocol_noop',
      eventIndex,
      eventType: eventType as CapturedFrame extends { kind: 'protocol_noop'; eventType: infer T } ? T : never,
    };
  }
  void FACT_KINDS;
  return invalid();
}
type AttemptCtx = {
  key: CalibrationReportOutcomeKey;
  attempt: number;
  imageStarted: boolean;
  imageReturned: boolean;
  imageSettled: boolean;
  imageResult: 'returned' | 'failed' | null;
  visionStarted: boolean;
  visionSettled: boolean;
  visionResult: 'returned' | 'failed' | null;
  snapshotStarted: boolean;
  snapshotSettled: boolean;
  snapshotResult: 'returned' | 'failed' | null;
  pending: 'image' | 'vision' | 'snapshot' | null;
  reservedIndex: number | null;
  authorized: boolean;
  recovered: boolean;
  terminalRecorded: boolean;
};

type KeyRecord = {
  started: number;
  finished: { index: number; kind: 'image' | 'nonres'; hash: string } | null;
  finishedAtSequence: number | null;
  lastAbandon: { disposition: 'unreserved' | 'reserved' | 'incomplete'; recovered: boolean } | null;
  consumed: boolean;
};

type Mutable = {
  lastEventIndex: number;
  sequence: number;
  owner: CalibrationOwner;
  identity: Readonly<CalibrationIdentity>;
  active: { key: CalibrationReportOutcomeKey; attempt: number } | null;
  ctx: AttemptCtx | null;
  events: RuntimeEvidenceEvent[];
  reservations: Map<number, CalibrationReportOutcomeKey>;
  terminals: Map<
    number,
    {
      key: CalibrationReportOutcomeKey;
      kind: 'image' | 'nonres';
      hash: string;
      reason: string | null;
      success: boolean | null;
      interrupted: boolean;
    }
  >;
  pinned: string | null;
  selected: Set<CalibrationProfile>;
  receipts: Map<string, CalibrationPublishedReportReceipt>;
  bindings: Map<string, { through: number; sha: string }>;
  sealed: Set<string>;
  keys: Map<string, KeyRecord>;
  epoch: number;
};

function cloneMutable(source: Mutable): Mutable {
  const keys = new Map<string, KeyRecord>();
  for (const [id, record] of source.keys) {
    keys.set(id, {
      started: record.started,
      finished: record.finished === null ? null : { ...record.finished },
      finishedAtSequence: record.finishedAtSequence,
      lastAbandon: record.lastAbandon === null ? null : { ...record.lastAbandon },
      consumed: record.consumed,
    });
  }
  return {
    lastEventIndex: source.lastEventIndex,
    sequence: source.sequence,
    owner: { ...source.owner },
    identity: source.identity,
    active: source.active === null ? null : { key: { ...source.active.key }, attempt: source.active.attempt },
    ctx:
      source.ctx === null
        ? null
        : { ...source.ctx, key: { ...source.ctx.key } },
    events: [...source.events],
    reservations: new Map(source.reservations),
    terminals: new Map(source.terminals),
    pinned: source.pinned,
    selected: new Set(source.selected),
    receipts: new Map(source.receipts),
    bindings: new Map(source.bindings),
    sealed: new Set(source.sealed),
    keys,
    epoch: source.epoch,
  };
}

function pairId(stage: string, profile: string): string {
  return `${stage}|${profile}`;
}

function lookupRow(
  plans: ValidatedPlans,
  selected: ReadonlySet<CalibrationProfile>,
  key: CalibrationReportOutcomeKey,
  invalid: () => never,
): { scanMode: string } {
  const id = canonicalKeyId(key);
  if (key.stage === 'preflight' || key.stage === 'development') {
    const row = plans.initialById.get(id);
    if (row === undefined) {
      return invalid();
    }
    return row;
  }
  if (!selected.has(key.profile)) {
    return invalid();
  }
  const table = key.profile === 'LOW' ? plans.lowById : plans.mediumById;
  const row = table.get(id);
  if (row === undefined) {
    return invalid();
  }
  return row;
}

function plannedKeys(
  plans: ValidatedPlans,
  selected: ReadonlySet<CalibrationProfile>,
  stage: StageName,
  profile: CalibrationProfile,
  invalid: () => never,
): Array<{ key: CalibrationReportOutcomeKey; scanMode: string }> {
  if (stage === 'preflight' || stage === 'development') {
    return plans.initial.filter((row) => row.key.stage === stage && row.key.profile === profile);
  }
  if (!selected.has(profile)) {
    return invalid();
  }
  const table = profile === 'LOW' ? plans.LOW : plans.MEDIUM;
  return table.filter((row) => row.key.stage === stage && row.key.profile === profile);
}

function checkPairComplete(
  plans: ValidatedPlans,
  mutable: Mutable,
  stage: StageName,
  profile: CalibrationProfile,
  cutoff: number,
  invalid: () => never,
): Array<{
  key: CalibrationReportOutcomeKey;
  terminal:
    | { kind: 'image'; eventIndex: number; journalHash: string }
    | { kind: 'non_reservation'; eventIndex: number; contentDigest: string };
}> {
  const rows = plannedKeys(plans, mutable.selected, stage, profile, invalid);
  if (rows.length === 0) {
    return invalid();
  }
  const seen = new Set<string>();
  for (const row of rows) {
    const id = canonicalKeyId(row.key);
    if (seen.has(id)) {
      return invalid();
    }
    seen.add(id);
  }
  if (mutable.active !== null) {
    const activeId = canonicalKeyId(mutable.active.key);
    for (const row of rows) {
      if (canonicalKeyId(row.key) === activeId) {
        return invalid();
      }
    }
  }
  const terminals: Array<{
    key: CalibrationReportOutcomeKey;
    terminal:
      | { kind: 'image'; eventIndex: number; journalHash: string }
      | { kind: 'non_reservation'; eventIndex: number; contentDigest: string };
  }> = [];
  for (const row of rows) {
    const id = canonicalKeyId(row.key);
    const record = mutable.keys.get(id);
    if (record === undefined || record.finished === null || record.consumed !== true) {
      return invalid();
    }
    if (record.finishedAtSequence === null || record.finishedAtSequence > cutoff) {
      return invalid();
    }
    if (record.lastAbandon !== null) {
      return invalid();
    }
    const finished = record.finished;
    terminals.push({
      key: { ...row.key },
      terminal:
        finished.kind === 'image'
          ? { kind: 'image', eventIndex: finished.index, journalHash: finished.hash }
          : { kind: 'non_reservation', eventIndex: finished.index, contentDigest: finished.hash },
    });
  }
  terminals.sort((a, b) => {
    const idA = canonicalKeyId(a.key);
    const idB = canonicalKeyId(b.key);
    if (idA < idB) {
      return -1;
    }
    if (idA > idB) {
      return 1;
    }
    return 0;
  });
  return terminals;
}
function keyRecordFor(mutable: Mutable, id: string): KeyRecord {
  const existing = mutable.keys.get(id);
  if (existing !== undefined) {
    return existing;
  }
  const fresh: KeyRecord = { started: 0, finished: null, finishedAtSequence: null, lastAbandon: null, consumed: false };
  mutable.keys.set(id, fresh);
  return fresh;
}

function requireUnsealed(mutable: Mutable, key: CalibrationReportOutcomeKey, invalid: () => never): void {
  if (mutable.sealed.has(pairId(key.stage, key.profile))) {
    return invalid();
  }
}

function applyProtocolFact(
  plans: ValidatedPlans,
  identityCommit: string,
  mutable: Mutable,
  frame: Exclude<CapturedFrame, { kind: 'runtime' }>,
  invalid: () => never,
): void {
  if (frame.kind === 'protocol_noop') {
    mutable.lastEventIndex = frame.eventIndex;
    return;
  }
  if (frame.kind === 'lock_recovery') {
    if (!sameOwner(mutable.owner, frame.staleOwner)) {
      return invalid();
    }
    mutable.owner = { ...frame.recoveringOwner };
    mutable.epoch += 1;
    if (mutable.ctx !== null) {
      mutable.ctx.recovered = true;
    }
    mutable.lastEventIndex = frame.eventIndex;
    return;
  }
  if (frame.kind === 'profile_selected') {
    mutable.selected.add(frame.profile);
    mutable.lastEventIndex = frame.eventIndex;
    return;
  }
  if (frame.kind === 'model_version_pinned') {
    if (mutable.pinned !== null && mutable.pinned !== frame.responseModelVersion) {
      return invalid();
    }
    mutable.pinned = frame.responseModelVersion;
    mutable.lastEventIndex = frame.eventIndex;
    return;
  }
  if (frame.kind === 'reserved') {
    const row = lookupRow(plans, mutable.selected, frame.key, invalid);
    if (row.scanMode === 'barcode') {
      return invalid();
    }
    requireUnsealed(mutable, frame.key, invalid);
    if (mutable.active === null || mutable.ctx === null || !sameKey(mutable.active.key, frame.key)) {
      return invalid();
    }
    if (mutable.ctx.recovered) {
      return invalid();
    }
    if (!mutable.ctx.visionStarted || mutable.ctx.visionSettled) {
      return invalid();
    }
    if (mutable.ctx.reservedIndex !== null) {
      return invalid();
    }
    mutable.reservations.set(frame.eventIndex, { ...frame.key });
    mutable.ctx.reservedIndex = frame.eventIndex;
    mutable.lastEventIndex = frame.eventIndex;
    return;
  }
  if (frame.kind === 'image_terminal') {
    const row = lookupRow(plans, mutable.selected, frame.key, invalid);
    if (row.scanMode === 'barcode') {
      return invalid();
    }
    requireUnsealed(mutable, frame.key, invalid);
    if (mutable.pinned !== null && frame.captured !== null && frame.captured.responseModelVersion !== 'n/a') {
      if (frame.captured.responseModelVersion !== mutable.pinned) {
        return invalid();
      }
    }
    if (mutable.active === null || mutable.ctx === null || !sameKey(mutable.active.key, frame.key)) {
      return invalid();
    }
    if (mutable.ctx.reservedIndex === null) {
      return invalid();
    }
    // A new owner may record only the canonical reserved interruption, not
    // manufacture an ordinary result for the dead owner's attempt.
    if (mutable.ctx.recovered !== (frame.interrupted !== null)) {
      return invalid();
    }
    if (mutable.ctx.terminalRecorded) {
      return invalid();
    }
    mutable.terminals.set(frame.eventIndex, {
      key: { ...frame.key },
      kind: 'image',
      hash: frame.journalHash,
      reason: null,
      success: frame.captured === null ? false : frame.captured.errorCategory === 'none',
      interrupted: frame.interrupted !== null,
    });
    mutable.ctx.terminalRecorded = true;
    mutable.lastEventIndex = frame.eventIndex;
    return;
  }
  if (frame.kind === 'non_reservation_result') {
    const eventKey = frame.event.key as unknown as CalibrationReportOutcomeKey;
    const row = lookupRow(plans, mutable.selected, eventKey, invalid);
    const reason = (frame.event as unknown as { reason: string }).reason;
    if (row.scanMode === 'barcode') {
      if (reason !== 'barcode') {
        return invalid();
      }
    } else if (reason !== 'dataset') {
      return invalid();
    }
    requireUnsealed(mutable, eventKey, invalid);
    const digest = (frame.event as unknown as { contentDigest: string }).contentDigest;
    const prediction = (frame.event as unknown as { prediction: { parseStatus: string } }).prediction;
    if (mutable.active === null || mutable.ctx === null || !sameKey(mutable.active.key, eventKey)) {
      return invalid();
    }
    if (mutable.ctx.recovered) {
      return invalid();
    }
    if (mutable.ctx.terminalRecorded) {
      return invalid();
    }
    mutable.terminals.set(frame.eventIndex, {
      key: { ...eventKey },
      kind: 'nonres',
      hash: digest,
      reason,
      success: prediction.parseStatus === 'success',
      interrupted: false,
    });
    mutable.ctx.terminalRecorded = true;
    mutable.lastEventIndex = frame.eventIndex;
    return;
  }
  if (frame.kind === 'artifact_receipt_admitted') {
    const receipt = frame.receipt;
    checkReceiptCommit(receipt, identityCommit, invalid);
    if (receipt.stage !== 'preflight' && receipt.stage !== 'development' && receipt.stage !== 'validation' && receipt.stage !== 'benchmark') {
      return invalid();
    }
    const id = pairId(receipt.stage, receipt.profile);
    if (mutable.receipts.has(id) || mutable.sealed.has(id)) {
      return invalid();
    }
    checkPairComplete(plans, mutable, receipt.stage, receipt.profile, mutable.sequence, invalid);
    mutable.receipts.set(id, { ...receipt });
    mutable.sealed.add(id);
    mutable.lastEventIndex = frame.eventIndex;
    return;
  }
  return invalid();
}
function requireActive(
  mutable: Mutable,
  key: CalibrationReportOutcomeKey,
  attempt: number,
  owner: CalibrationOwner,
  invalid: () => never,
): AttemptCtx {
  if (mutable.active === null || mutable.ctx === null) {
    return invalid();
  }
  if (mutable.active.attempt !== attempt || !sameKey(mutable.active.key, key)) {
    return invalid();
  }
  if (!sameOwner(mutable.owner, owner)) {
    return invalid();
  }
  return mutable.ctx;
}

function finishableWith(
  plans: ValidatedPlans,
  mutable: Mutable,
  ctx: AttemptCtx,
  terminal: { kind: 'image'; eventIndex: number; journalHash: string } | { kind: 'non_reservation'; eventIndex: number; contentDigest: string },
  invalid: () => never,
): { kind: 'image' | 'nonres'; hash: string } {
  const row = lookupRow(plans, mutable.selected, ctx.key, invalid);
  const recorded = mutable.terminals.get(terminal.eventIndex);
  if (recorded === undefined || !sameKey(recorded.key, ctx.key)) {
    return invalid();
  }
  if (ctx.pending !== null || recorded.interrupted) {
    return invalid();
  }
  if (terminal.kind === 'image') {
    if (recorded.kind !== 'image' || recorded.hash !== terminal.journalHash) {
      return invalid();
    }
    if (row.scanMode === 'barcode') {
      return invalid();
    }
    if (!ctx.imageStarted || !ctx.imageReturned) {
      return invalid();
    }
    if (!ctx.visionStarted || !ctx.visionSettled) {
      return invalid();
    }
    if (ctx.reservedIndex === null || !ctx.authorized) {
      return invalid();
    }
    if (ctx.snapshotStarted) {
      return invalid();
    }
    if (recorded.success && (ctx.visionResult !== 'returned' || mutable.pinned === null)) {
      return invalid();
    }
    return { kind: 'image', hash: recorded.hash };
  }
  if (recorded.kind !== 'nonres' || recorded.hash !== terminal.contentDigest) {
    return invalid();
  }
  if (ctx.reservedIndex !== null || ctx.authorized) {
    return invalid();
  }
  if (row.scanMode === 'barcode') {
    if (recorded.reason !== 'barcode' || !ctx.snapshotStarted || !ctx.snapshotSettled) {
      return invalid();
    }
    if (recorded.success === true && ctx.snapshotResult !== 'returned') {
      return invalid();
    }
  } else {
    if (recorded.reason !== 'dataset') {
      return invalid();
    }
    if (ctx.snapshotStarted || !ctx.imageStarted || !ctx.imageSettled || ctx.visionResult === 'returned') {
      return invalid();
    }
  }
  return { kind: 'nonres', hash: recorded.hash };
}

function applyRuntimeEvent(
  plans: ValidatedPlans,
  identityCommit: string,
  mutable: Mutable,
  frameIndex: number,
  event: RuntimeEvidenceEvent,
  invalid: () => never,
): void {
  if (!sameOwner(mutable.owner, event.owner)) {
    return invalid();
  }
  const type = event.type;
  if (type === 'runtime_attempt_started') {
    const ref = event as unknown as { key: CalibrationReportOutcomeKey; attempt: number };
    if (mutable.active !== null) {
      return invalid();
    }
    const row = lookupRow(plans, mutable.selected, ref.key, invalid);
    void row;
    requireUnsealed(mutable, ref.key, invalid);
    const id = canonicalKeyId(ref.key);
    const record = keyRecordFor(mutable, id);
    if (ref.attempt !== record.started + 1) {
      return invalid();
    }
    if (record.consumed || record.finished !== null) {
      return invalid();
    }
    if (record.lastAbandon !== null) {
      if (record.lastAbandon.disposition !== 'unreserved' || !record.lastAbandon.recovered) {
        return invalid();
      }
    } else if (record.started !== 0) {
      return invalid();
    }
    record.started = ref.attempt;
    record.lastAbandon = null;
    mutable.active = { key: { ...ref.key }, attempt: ref.attempt };
    mutable.ctx = {
      key: { ...ref.key },
      attempt: ref.attempt,
      imageStarted: false,
      imageReturned: false,
      imageSettled: false,
      imageResult: null,
      visionStarted: false,
      visionSettled: false,
      visionResult: null,
      snapshotStarted: false,
      snapshotSettled: false,
      snapshotResult: null,
      pending: null,
      reservedIndex: null,
      authorized: false,
      recovered: false,
      terminalRecorded: false,
    };
    mutable.sequence += 1;
    mutable.lastEventIndex = frameIndex;
    mutable.events.push(event);
    return;
  }
  if (type === 'runtime_operation_started') {
    const ref = event as unknown as {
      key: CalibrationReportOutcomeKey;
      attempt: number;
      operation: 'image' | 'vision' | 'snapshot';
    };
    const ctx = requireActive(mutable, ref.key, ref.attempt, event.owner, invalid);
    const row = lookupRow(plans, mutable.selected, ref.key, invalid);
    requireUnsealed(mutable, ref.key, invalid);
    if (mutable.ctx !== null && mutable.ctx.recovered) {
      return invalid();
    }
    if (ctx.terminalRecorded) {
      return invalid();
    }
    if (ctx.pending !== null) {
      return invalid();
    }
    if (ref.operation === 'snapshot') {
      if (row.scanMode !== 'barcode' || ctx.imageStarted || ctx.visionStarted || ctx.snapshotStarted) {
        return invalid();
      }
      ctx.snapshotStarted = true;
      ctx.pending = 'snapshot';
    } else if (ref.operation === 'image') {
      if (row.scanMode === 'barcode' || ctx.imageStarted || ctx.visionStarted) {
        return invalid();
      }
      ctx.imageStarted = true;
      ctx.pending = 'image';
    } else {
      if (row.scanMode === 'barcode' || !ctx.imageStarted || !ctx.imageReturned || ctx.visionStarted) {
        return invalid();
      }
      ctx.visionStarted = true;
      ctx.pending = 'vision';
    }
    mutable.sequence += 1;
    mutable.lastEventIndex = frameIndex;
    mutable.events.push(event);
    return;
  }
  if (type === 'runtime_operation_settled') {
    const ref = event as unknown as {
      key: CalibrationReportOutcomeKey;
      attempt: number;
      operation: 'image' | 'vision' | 'snapshot';
      result: 'returned' | 'failed';
    };
    const ctx = requireActive(mutable, ref.key, ref.attempt, event.owner, invalid);
    requireUnsealed(mutable, ref.key, invalid);
    if (mutable.ctx !== null && mutable.ctx.recovered) {
      return invalid();
    }
    if (ctx.pending !== ref.operation) {
      return invalid();
    }
    if (ref.operation === 'vision' && ref.result === 'returned' && (!ctx.authorized || mutable.pinned === null)) {
      return invalid();
    }
    ctx.pending = null;
    if (ref.operation === 'image') {
      ctx.imageSettled = true;
      ctx.imageResult = ref.result;
      ctx.imageReturned = ref.result === 'returned';
    }
    if (ref.operation === 'vision') {
      ctx.visionSettled = true;
      ctx.visionResult = ref.result;
    }
    if (ref.operation === 'snapshot') {
      ctx.snapshotSettled = true;
      ctx.snapshotResult = ref.result;
    }
    mutable.sequence += 1;
    mutable.lastEventIndex = frameIndex;
    mutable.events.push(event);
    return;
  }
  if (type === 'runtime_request_authorized') {
    const ref = event as unknown as {
      key: CalibrationReportOutcomeKey;
      attempt: number;
      reservationEventIndex: number;
    };
    const ctx = requireActive(mutable, ref.key, ref.attempt, event.owner, invalid);
    const row = lookupRow(plans, mutable.selected, ref.key, invalid);
    if (row.scanMode === 'barcode') {
      return invalid();
    }
    requireUnsealed(mutable, ref.key, invalid);
    if (mutable.ctx !== null && mutable.ctx.recovered) {
      return invalid();
    }
    if (ctx.terminalRecorded) {
      return invalid();
    }
    if (!ctx.visionStarted || ctx.visionSettled) {
      return invalid();
    }
    if (ctx.authorized || ctx.reservedIndex === null) {
      return invalid();
    }
    const reservedKey = mutable.reservations.get(ref.reservationEventIndex);
    if (reservedKey === undefined || !sameKey(reservedKey, ref.key)) {
      return invalid();
    }
    if (ref.reservationEventIndex !== ctx.reservedIndex || ref.reservationEventIndex >= frameIndex) {
      return invalid();
    }
    ctx.authorized = true;
    mutable.sequence += 1;
    mutable.lastEventIndex = frameIndex;
    mutable.events.push(event);
    return;
  }
  if (type === 'runtime_attempt_finished') {
    const ref = event as unknown as {
      key: CalibrationReportOutcomeKey;
      attempt: number;
      terminal:
        | { kind: 'image'; eventIndex: number; journalHash: string }
        | { kind: 'non_reservation'; eventIndex: number; contentDigest: string };
    };
    const ctx = requireActive(mutable, ref.key, ref.attempt, event.owner, invalid);
    requireUnsealed(mutable, ref.key, invalid);
    const done = finishableWith(plans, mutable, ctx, ref.terminal, invalid);
    const id = canonicalKeyId(ref.key);
    const record = keyRecordFor(mutable, id);
    record.finished = { index: ref.terminal.eventIndex, kind: done.kind, hash: done.hash };
    record.consumed = true;
    record.finishedAtSequence = mutable.sequence + 1;
    mutable.active = null;
    mutable.ctx = null;
    mutable.sequence += 1;
    mutable.lastEventIndex = frameIndex;
    mutable.events.push(event);
    return;
  }
  if (type === 'runtime_attempt_abandoned') {
    const ref = event as unknown as {
      key: CalibrationReportOutcomeKey;
      attempt: number;
      disposition:
        | { kind: 'unreserved_interruption' }
        | { kind: 'reserved_interruption'; terminal: { kind: 'image'; eventIndex: number; journalHash: string } }
        | {
            kind: 'terminal_evidence_incomplete';
            terminal:
              | { kind: 'image'; eventIndex: number; journalHash: string }
              | { kind: 'non_reservation'; eventIndex: number; contentDigest: string };
          };
    };
    const ctx = requireActive(mutable, ref.key, ref.attempt, event.owner, invalid);
    requireUnsealed(mutable, ref.key, invalid);
    const id = canonicalKeyId(ref.key);
    const record = keyRecordFor(mutable, id);
    if (ref.disposition.kind === 'unreserved_interruption') {
      if (!ctx.recovered || ctx.reservedIndex !== null || ctx.terminalRecorded ||
          ctx.imageResult === 'failed' || ctx.visionResult === 'failed' || ctx.snapshotResult === 'failed') {
        return invalid();
      }
      record.lastAbandon = { disposition: 'unreserved', recovered: ctx.recovered };
      mutable.active = null;
      mutable.ctx = null;
      mutable.sequence += 1;
      mutable.lastEventIndex = frameIndex;
      mutable.events.push(event);
      return;
    }
    if (ref.disposition.kind === 'reserved_interruption') {
      if (!ctx.recovered || ctx.reservedIndex === null) {
        return invalid();
      }
      const terminal = ref.disposition.terminal;
      const recorded = mutable.terminals.get(terminal.eventIndex);
      if (recorded === undefined || recorded.kind !== 'image' || recorded.hash !== terminal.journalHash || recorded.interrupted !== true) {
        return invalid();
      }
      if (!sameKey(recorded.key, ref.key)) {
        return invalid();
      }
      record.lastAbandon = { disposition: 'reserved', recovered: ctx.recovered };
      record.consumed = true;
      mutable.active = null;
      mutable.ctx = null;
      mutable.sequence += 1;
      mutable.lastEventIndex = frameIndex;
      mutable.events.push(event);
      return;
    }
    const terminal = ref.disposition.terminal;
    const recorded = mutable.terminals.get(terminal.eventIndex);
    if (recorded === undefined || !sameKey(recorded.key, ref.key) || recorded.interrupted) {
      return invalid();
    }
    if (terminal.kind === 'image') {
      if (recorded.kind !== 'image' || recorded.hash !== terminal.journalHash) {
        return invalid();
      }
    } else {
      if (recorded.kind !== 'nonres' || recorded.hash !== terminal.contentDigest) {
        return invalid();
      }
    }
    try {
      finishableWith(plans, mutable, ctx, terminal, () => {
        throw new CalibrationFatalError('__finishable__');
      });
      return invalid();
    } catch (probe) {
      if ((probe as CalibrationFatalError).message !== '__finishable__') {
        throw probe;
      }
    }
    if (ctx.recovered !== true) {
      return invalid();
    }
    record.lastAbandon = { disposition: 'incomplete', recovered: ctx.recovered };
    record.consumed = true;
    mutable.active = null;
    mutable.ctx = null;
    mutable.sequence += 1;
    mutable.lastEventIndex = frameIndex;
    mutable.events.push(event);
    return;
  }
  if (type === 'runtime_report_bound') {
    const ref = event as unknown as {
      stage: StageName;
      profile: CalibrationProfile;
      receipt: CalibrationPublishedReportReceipt;
      throughSequence: number;
      bindingSha256: string;
    };
    if (
      ref.stage !== 'preflight' &&
      ref.stage !== 'development' &&
      ref.stage !== 'validation' &&
      ref.stage !== 'benchmark'
    ) {
      return invalid();
    }
    if (ref.profile !== 'LOW' && ref.profile !== 'MEDIUM') {
      return invalid();
    }
    if (
      typeof ref.throughSequence !== 'number' ||
      !Number.isSafeInteger(ref.throughSequence) ||
      ref.throughSequence <= 0 ||
      Object.is(ref.throughSequence, -0)
    ) {
      return invalid();
    }
    if (typeof ref.bindingSha256 !== 'string' || !HEX64_PATTERN.test(ref.bindingSha256)) {
      return invalid();
    }
    if (mutable.active !== null) {
      return invalid();
    }
    const id = pairId(ref.stage, ref.profile);
    const admitted = mutable.receipts.get(id);
    if (admitted === undefined) {
      return invalid();
    }
    if (
      admitted.stage !== ref.receipt.stage ||
      admitted.profile !== ref.receipt.profile ||
      admitted.runId !== ref.receipt.runId ||
      admitted.jsonSha256 !== ref.receipt.jsonSha256 ||
      admitted.markdownSha256 !== ref.receipt.markdownSha256
    ) {
      return invalid();
    }
    checkReceiptCommit(ref.receipt, identityCommit, invalid);
    if (mutable.bindings.has(id)) {
      return invalid();
    }
    const expectedSequence = mutable.sequence + 1;
    if (ref.throughSequence !== expectedSequence - 1) {
      return invalid();
    }
    const pairEvents = mutable.events.filter((candidate) => {
      if (candidate.type === 'runtime_report_bound') {
        return false;
      }
      const key = (candidate as unknown as { key?: CalibrationReportOutcomeKey }).key;
      if (key === undefined) {
        return false;
      }
      if (typeof candidate.sequence !== 'number' || candidate.sequence > ref.throughSequence) {
        return false;
      }
      return key.stage === ref.stage && key.profile === ref.profile;
    });
    const complete = checkPairComplete(plans, mutable, ref.stage, ref.profile, ref.throughSequence, invalid);
    const terminals = complete.map((row) => ({ key: row.key, terminal: row.terminal }));
    const bindingInput = {
      version: 1,
      identity: mutable.identity,
      stage: ref.stage,
      profile: ref.profile,
      throughSequence: ref.throughSequence,
      events: pairEvents,
      terminals,
      receipt: admitted,
    };
    const computed = sha256Hex(canonicalize(bindingInput));
    if (computed !== ref.bindingSha256) {
      return invalid();
    }
    mutable.bindings.set(id, { through: ref.throughSequence, sha: ref.bindingSha256 });
    mutable.sequence += 1;
    mutable.lastEventIndex = frameIndex;
    mutable.events.push(event);
    return;
  }
  return invalid();
}

function queryPairInput(
  plans: ValidatedPlans,
  header: RuntimeEvidenceHeader,
  mutable: Mutable,
  stageValue: unknown,
  profileValue: unknown,
  throughValue: unknown,
  invalid: () => never,
): Readonly<Omit<RuntimeBindingInput, 'receipt'>> {
  if (
    stageValue !== 'preflight' &&
    stageValue !== 'development' &&
    stageValue !== 'validation' &&
    stageValue !== 'benchmark'
  ) {
    return invalid();
  }
  if (profileValue !== 'LOW' && profileValue !== 'MEDIUM') {
    return invalid();
  }
  const through = capturePositiveIndex(throughValue, invalid);
  if (through > mutable.sequence) {
    return invalid();
  }
  const stage = stageValue as StageName;
  const profile = profileValue as CalibrationProfile;
  const complete = checkPairComplete(plans, mutable, stage, profile, through, invalid);
  const events = mutable.events.filter((candidate) => {
    if (candidate.type === 'runtime_report_bound') {
      return false;
    }
    const key = (candidate as unknown as { key?: CalibrationReportOutcomeKey }).key;
    if (key === undefined) {
      return false;
    }
    if (typeof candidate.sequence !== 'number' || candidate.sequence > through) {
      return false;
    }
    return key.stage === stage && key.profile === profile;
  });
  if (events.length === 0) {
    return invalid();
  }
  let maxSeq = 0;
  for (const item of events) {
    if (item.sequence > maxSeq) {
      maxSeq = item.sequence;
    }
  }
  if (through < maxSeq) {
    return invalid();
  }
  const output = {
    version: 1 as const,
    identity: header.identity,
    stage,
    profile,
    throughSequence: through,
    events: [...events],
    terminals: complete.map((row) => ({ key: { ...row.key }, terminal: { ...row.terminal } })),
  };
  return deepFreeze(output) as unknown as Readonly<Omit<RuntimeBindingInput, 'receipt'>>;
}

function makeSnapshot(
  mutable: Mutable,
): Readonly<RuntimeEvidenceSnapshot> {
  const output: RuntimeEvidenceSnapshot = {
    sequence: mutable.sequence,
    lastEventIndex: mutable.lastEventIndex,
    owner: { ...mutable.owner },
    activeAttempt:
      mutable.active === null ? null : { key: { ...mutable.active.key }, attempt: mutable.active.attempt },
    events: [...mutable.events],
  };
  return deepFreeze(output) as Readonly<RuntimeEvidenceSnapshot>;
}

function createState(
  header: RuntimeEvidenceHeader,
  plans: ValidatedPlans,
  identityCommit: string,
  mutable: Mutable,
): Readonly<CalibrationRuntimeEvidenceState> {
  const preview = (frame: unknown): Readonly<CalibrationRuntimeEvidenceState> => {
    let captured: CapturedFrame;
    try {
      captured = captureFrame(frame, transitionInvalid);
    } catch {
      return transitionInvalid();
    }
    if (captured.eventIndex !== mutable.lastEventIndex + 1) {
      return transitionInvalid();
    }
    if (captured.kind === 'runtime') {
      if (captured.event.sequence !== mutable.sequence + 1) {
        return transitionInvalid();
      }
      if (mutable.sequence >= 4096) {
        return transitionInvalid();
      }
    }
    const next = cloneMutable(mutable);
    try {
      if (captured.kind === 'runtime') {
        applyRuntimeEvent(plans, identityCommit, next, captured.eventIndex, captured.event, transitionInvalid);
      } else {
        applyProtocolFact(plans, identityCommit, next, captured, transitionInvalid);
      }
    } catch {
      return transitionInvalid();
    }
    return createState(header, plans, identityCommit, next);
  };
  const snapshot = (): Readonly<RuntimeEvidenceSnapshot> => makeSnapshot(mutable);
  const pairInput = (
    stage: unknown,
    profile: unknown,
    throughSequence: unknown,
  ): Readonly<Omit<RuntimeBindingInput, 'receipt'>> => {
    try {
      return queryPairInput(plans, header, mutable, stage, profile, throughSequence, transitionInvalid);
    } catch {
      return transitionInvalid();
    }
  };
  return deepFreeze({ preview, snapshot, pairInput }) as Readonly<CalibrationRuntimeEvidenceState>;
}

export function prepareCalibrationRuntimeEvidenceState(params: unknown): Readonly<CalibrationRuntimeEvidenceState> {
  let parsed: { header: RuntimeEvidenceHeader; plans: ValidatedPlans };
  try {
    parsed = captureParams(params);
  } catch {
    return inputInvalid();
  }
  const identityCommit = parsed.header.identity.implementationCommit;
  const mutable: Mutable = {
    lastEventIndex: 1,
    sequence: 0,
    owner: { ...parsed.header.owner },
    identity: parsed.header.identity,
    active: null,
    ctx: null,
    events: [],
    reservations: new Map(),
    terminals: new Map(),
    pinned: null,
    selected: new Set(),
    receipts: new Map(),
    bindings: new Map(),
    sealed: new Set(),
    keys: new Map(),
    epoch: 0,
  };
  return createState(parsed.header, parsed.plans, identityCommit, mutable);
}
