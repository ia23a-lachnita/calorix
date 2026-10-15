/**
 * Calibration durable runtime evidence closed codec (Task 1 Step 3).
 *
 * Pure structural syntax for versioned runtime-evidence headers, events and
 * binding digests. Closed descriptor-only capture owns and freezes only
 * copied data; every structural or reflection failure is a fresh causeless
 * `CalibrationFatalError('calibration:runtime-evidence-invalid')` with no
 * foreign payload retained. Canonical JSON sorts record keys, preserves
 * array order and emits no whitespace/BOM/newline; digests are SHA-256 over
 * those UTF-8 bytes. Each header/event encodes to at most 16 KiB; aggregate
 * binding inputs are not subject to that individual-record cap. Binding hash
 * checks are syntax checks only, not full population/reconciliation proofs.
 */
import { createHash } from 'node:crypto';
import type {
  CalibrationIdentity,
  CalibrationOwner,
  CalibrationProfile,
  StageName,
} from './calibration';
import type { CalibrationReportOutcomeKey } from './calibration-report-state';
import type { CalibrationPublishedReportReceipt } from './calibration-report-publication';
import { CalibrationFatalError } from './fatal-error';

export type RuntimeAttemptRef = {
  readonly key: CalibrationReportOutcomeKey;
  readonly attempt: number;
};
export type RuntimeOperation = 'image' | 'vision' | 'snapshot';
export type RuntimeTerminal =
  | { readonly kind: 'image'; readonly eventIndex: number; readonly journalHash: string }
  | { readonly kind: 'non_reservation'; readonly eventIndex: number; readonly contentDigest: string };
export type RuntimeDisposition =
  | { readonly kind: 'unreserved_interruption' }
  | { readonly kind: 'reserved_interruption'; readonly terminal: Extract<RuntimeTerminal, { kind: 'image' }> }
  | { readonly kind: 'terminal_evidence_incomplete'; readonly terminal: RuntimeTerminal };
export type RuntimeCommon = {
  readonly version: 1;
  readonly sequence: number;
  readonly owner: CalibrationOwner;
  readonly at: string;
};
export type RuntimePayload =
  | ({ readonly type: 'runtime_attempt_started' } & RuntimeAttemptRef)
  | ({ readonly type: 'runtime_operation_started'; readonly operation: RuntimeOperation } & RuntimeAttemptRef)
  | ({ readonly type: 'runtime_operation_settled'; readonly operation: RuntimeOperation; readonly result: 'returned' | 'failed' } & RuntimeAttemptRef)
  | ({ readonly type: 'runtime_request_authorized'; readonly reservationEventIndex: number } & RuntimeAttemptRef)
  | ({ readonly type: 'runtime_attempt_finished'; readonly terminal: RuntimeTerminal } & RuntimeAttemptRef)
  | ({ readonly type: 'runtime_attempt_abandoned'; readonly disposition: RuntimeDisposition } & RuntimeAttemptRef)
  | {
      readonly type: 'runtime_report_bound';
      readonly stage: StageName;
      readonly profile: CalibrationProfile;
      readonly receipt: CalibrationPublishedReportReceipt;
      readonly throughSequence: number;
      readonly bindingSha256: string;
    };
export type RuntimeEvidenceEvent = RuntimeCommon & RuntimePayload;
export type RuntimeEvidenceHeader = {
  readonly type: 'protocol_identity';
  readonly identity: CalibrationIdentity;
  readonly at: string;
  readonly reportAuthority: 'verified_artifacts_v1';
  readonly runtimeEvidenceVersion: 1;
  readonly owner: CalibrationOwner;
};
export type RuntimePairEvent = Exclude<RuntimeEvidenceEvent, { type: 'runtime_report_bound' }>;
export type RuntimeBindingInput = {
  readonly version: 1;
  readonly identity: CalibrationIdentity;
  readonly stage: StageName;
  readonly profile: CalibrationProfile;
  readonly throughSequence: number;
  readonly events: readonly RuntimePairEvent[];
  readonly terminals: ReadonlyArray<{ readonly key: CalibrationReportOutcomeKey; readonly terminal: RuntimeTerminal }>;
  readonly receipt: CalibrationPublishedReportReceipt;
};

const FATAL_MESSAGE = 'calibration:runtime-evidence-invalid';
const RECORD_BOUND = 16 * 1024;
const MAX_RUNTIME_EVENTS = 4096;
const MAX_TERMINAL_ROWS = 158;

const CASE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const HEX40_PATTERN = /^[0-9a-f]{40}$/;
const HEX64_PATTERN = /^[0-9a-f]{64}$/;
const HEX12_PATTERN = /^[0-9a-f]{12}$/;
const CANONICAL_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const RUN_ID_PATTERN = /^calibration-(preflight|development|validation|benchmark)-(low|medium)-([0-9a-f]{12})-(\d{8}T\d{9}Z)$/;
const LONE_SURROGATE_PATTERN = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

const STAGE_SAMPLE_RANGE: Record<string, { min: number; max: number }> = {
  preflight: { min: 1, max: 1 },
  development: { min: 1, max: 1 },
  validation: { min: 1, max: 3 },
  benchmark: { min: 1, max: 3 },
};

const HEADER_FIELDS = ['type', 'identity', 'at', 'reportAuthority', 'runtimeEvidenceVersion', 'owner'] as const;
const IDENTITY_FIELDS = [
  'protocolVersion',
  'provider',
  'model',
  'implementationCommit',
  'functionsTreeId',
  'datasetHash',
  'promptHash',
  'responseSchemaHash',
  'sourceLockHash',
  'manifestHash',
  'publicManifestHash',
  'snapshotLockHash',
  'historicalReferenceHash',
  'plannedImageCalls',
  'hardCeiling',
] as const;
const IDENTITY_HEX64_FIELDS = [
  'datasetHash',
  'promptHash',
  'responseSchemaHash',
  'sourceLockHash',
  'manifestHash',
  'publicManifestHash',
  'snapshotLockHash',
  'historicalReferenceHash',
] as const;
const OWNER_FIELDS = ['hostname', 'bootId', 'pid', 'startTicks', 'acquiredAt'] as const;
const KEY_FIELDS = ['stage', 'profile', 'caseId', 'sampleIndex'] as const;
const RECEIPT_FIELDS = ['stage', 'profile', 'runId', 'jsonSha256', 'markdownSha256'] as const;
const BINDING_FIELDS = ['version', 'identity', 'stage', 'profile', 'throughSequence', 'events', 'terminals', 'receipt'] as const;
const TERMINAL_ROW_FIELDS = ['key', 'terminal'] as const;

function fail(): never {
  throw new CalibrationFatalError(FATAL_MESSAGE);
}

function safeIsArray(value: unknown): boolean {
  try {
    return Array.isArray(value);
  } catch {
    fail();
  }
}

function captureExactRecord(value: unknown, allowed: readonly string[]): Map<string, unknown> {
  if (typeof value !== 'object' || value === null || safeIsArray(value)) {
    fail();
  }
  let proto: unknown;
  try {
    proto = Object.getPrototypeOf(value);
  } catch {
    fail();
  }
  if (proto !== Object.prototype && proto !== null) {
    fail();
  }
  let names: string[];
  let symbols: symbol[];
  try {
    names = Object.getOwnPropertyNames(value);
    symbols = Object.getOwnPropertySymbols(value);
  } catch {
    fail();
  }
  if (symbols.length !== 0) {
    fail();
  }
  if (names.length !== allowed.length) {
    fail();
  }
  const allowedSet = new Set<string>(allowed);
  const map = new Map<string, unknown>();
  for (const name of names) {
    if (!allowedSet.has(name)) {
      fail();
    }
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, name);
    } catch {
      fail();
    }
    if (
      descriptor === undefined ||
      descriptor.enumerable !== true ||
      !('value' in descriptor) ||
      'get' in descriptor ||
      'set' in descriptor
    ) {
      fail();
    }
    let stored: unknown;
    try {
      stored = (descriptor as PropertyDescriptor & { value: unknown }).value;
    } catch {
      fail();
    }
    if (stored === undefined) {
      fail();
    }
    map.set(name, stored);
  }
  for (const field of allowed) {
    if (!map.has(field)) {
      fail();
    }
  }
  return map;
}

function captureDenseArray(value: unknown, maxElements: number): unknown[] {
  if (!safeIsArray(value)) {
    fail();
  }
  let proto: unknown;
  try {
    proto = Object.getPrototypeOf(value);
  } catch {
    fail();
  }
  if (proto !== Array.prototype) {
    fail();
  }
  let names: string[];
  let symbols: symbol[];
  try {
    names = Object.getOwnPropertyNames(value);
    symbols = Object.getOwnPropertySymbols(value);
  } catch {
    fail();
  }
  if (symbols.length !== 0) {
    fail();
  }
  let lengthDescriptor: PropertyDescriptor | undefined;
  try {
    lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  } catch {
    fail();
  }
  if (
    lengthDescriptor === undefined ||
    lengthDescriptor.enumerable !== false ||
    !('value' in lengthDescriptor)
  ) {
    fail();
  }
  let lengthValue: unknown;
  try {
    lengthValue = (lengthDescriptor as PropertyDescriptor & { value: unknown }).value;
  } catch {
    fail();
  }
  if (typeof lengthValue !== 'number' || !Number.isSafeInteger(lengthValue) || lengthValue < 0) {
    fail();
  }
  const length = lengthValue as number;
  if (length > maxElements) {
    fail();
  }
  if (names.length !== length + 1) {
    fail();
  }
  const out: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const key = String(index);
    if (!names.includes(key)) {
      fail();
    }
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      fail();
    }
    if (
      descriptor === undefined ||
      descriptor.enumerable !== true ||
      !('value' in descriptor) ||
      'get' in descriptor ||
      'set' in descriptor
    ) {
      fail();
    }
    let element: unknown;
    try {
      element = (descriptor as PropertyDescriptor & { value: unknown }).value;
    } catch {
      fail();
    }
    if (element === undefined) {
      fail();
    }
    out.push(element);
  }
  return out;
}

function checkLoneSurrogates(text: string): void {
  if (LONE_SURROGATE_PATTERN.test(text)) {
    fail();
  }
}

function captureCleanString(value: unknown, nonBlank: boolean): string {
  if (typeof value !== 'string') {
    fail();
  }
  const text = value as string;
  checkLoneSurrogates(text);
  if (nonBlank && text.trim().length === 0) {
    fail();
  }
  return text;
}

function captureTimestamp(value: unknown): string {
  if (typeof value !== 'string' || !CANONICAL_ISO_PATTERN.test(value)) {
    fail();
  }
  const text = value as string;
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) {
    fail();
  }
  if (new Date(text).toISOString() !== text) {
    fail();
  }
  return text;
}

function capturePositiveIndex(value: unknown): number {
  if (typeof value !== 'number') {
    fail();
  }
  const n = value as number;
  if (Object.is(n, -0) || !Number.isSafeInteger(n) || n <= 0) {
    fail();
  }
  return n;
}

function captureNonNegativeIndex(value: unknown): number {
  if (typeof value !== 'number') {
    fail();
  }
  const n = value as number;
  if (Object.is(n, -0) || !Number.isSafeInteger(n) || n < 0) {
    fail();
  }
  return n;
}

function captureHex(value: unknown, pattern: RegExp): string {
  if (typeof value !== 'string' || !pattern.test(value)) {
    fail();
  }
  return value as string;
}

function captureStage(value: unknown): StageName {
  if (value !== 'preflight' && value !== 'development' && value !== 'validation' && value !== 'benchmark') {
    fail();
  }
  return value as StageName;
}

function captureProfile(value: unknown): CalibrationProfile {
  if (value !== 'LOW' && value !== 'MEDIUM') {
    fail();
  }
  return value as CalibrationProfile;
}

function captureIdentity(value: unknown): Readonly<CalibrationIdentity> {
  const map = captureExactRecord(value, IDENTITY_FIELDS);
  if (map.get('protocolVersion') !== 'v1') {
    fail();
  }
  if (map.get('provider') !== 'vertex-ai') {
    fail();
  }
  if (map.get('model') !== 'gemini-3.8-flash') {
    fail();
  }
  if (map.get('plannedImageCalls') !== 146) {
    fail();
  }
  if (map.get('hardCeiling') !== 300) {
    fail();
  }
  captureHex(map.get('implementationCommit'), HEX40_PATTERN);
  captureHex(map.get('functionsTreeId'), HEX40_PATTERN);
  for (const field of IDENTITY_HEX64_FIELDS) {
    captureHex(map.get(field), HEX64_PATTERN);
  }
  const owned: Record<string, unknown> = {};
  for (const field of IDENTITY_FIELDS) {
    owned[field] = map.get(field);
  }
  return deepFreeze(owned) as unknown as Readonly<CalibrationIdentity>;
}

function captureOwner(value: unknown): Readonly<CalibrationOwner> {
  const map = captureExactRecord(value, OWNER_FIELDS);
  captureCleanString(map.get('hostname'), true);
  captureCleanString(map.get('bootId'), true);
  capturePositiveIndex(map.get('pid'));
  capturePositiveIndex(map.get('startTicks'));
  captureTimestamp(map.get('acquiredAt'));
  const owned: Record<string, unknown> = {};
  for (const field of OWNER_FIELDS) {
    owned[field] = map.get(field);
  }
  return deepFreeze(owned) as unknown as Readonly<CalibrationOwner>;
}

function captureOutcomeKey(value: unknown): Readonly<CalibrationReportOutcomeKey> {
  const map = captureExactRecord(value, KEY_FIELDS);
  const stage = captureStage(map.get('stage'));
  const profile = captureProfile(map.get('profile'));
  const caseId = map.get('caseId');
  if (typeof caseId !== 'string' || !CASE_ID_PATTERN.test(caseId)) {
    fail();
  }
  checkLoneSurrogates(caseId as string);
  const range = STAGE_SAMPLE_RANGE[stage];
  if (range === undefined) {
    fail();
  }
  const sampleIndex = map.get('sampleIndex');
  if (typeof sampleIndex !== 'number' || Object.is(sampleIndex, -0) || !Number.isInteger(sampleIndex)) {
    fail();
  }
  const n = sampleIndex as number;
  const limits = range as { min: number; max: number };
  if (!Number.isSafeInteger(n) || n < limits.min || n > limits.max) {
    fail();
  }
  const owned = { stage, profile, caseId: caseId as string, sampleIndex: n };
  return deepFreeze(owned) as unknown as Readonly<CalibrationReportOutcomeKey>;
}

function captureReceipt(
  value: unknown,
  expectedStage: StageName,
  expectedProfile: CalibrationProfile,
  identityCommit: string | null,
): Readonly<CalibrationPublishedReportReceipt> {
  const map = captureExactRecord(value, RECEIPT_FIELDS);
  const stage = captureStage(map.get('stage'));
  const profile = captureProfile(map.get('profile'));
  if (stage !== expectedStage || profile !== expectedProfile) {
    fail();
  }
  const runId = map.get('runId');
  if (typeof runId !== 'string') {
    fail();
  }
  const text = runId as string;
  checkLoneSurrogates(text);
  const match = RUN_ID_PATTERN.exec(text);
  if (match === null) {
    fail();
  }
  const parts = match as unknown as [string, string, string, string, string];
  if (parts[1] !== expectedStage || parts[2] !== expectedProfile.toLowerCase()) {
    fail();
  }
  if (!HEX12_PATTERN.test(parts[3] as string)) {
    fail();
  }
  if (identityCommit !== null && (parts[3] as string) !== identityCommit.slice(0, 12)) {
    fail();
  }
  captureHex(map.get('jsonSha256'), HEX64_PATTERN);
  captureHex(map.get('markdownSha256'), HEX64_PATTERN);
  const owned = {
    stage,
    profile,
    runId: text,
    jsonSha256: map.get('jsonSha256') as string,
    markdownSha256: map.get('markdownSha256') as string,
  };
  return deepFreeze(owned) as unknown as Readonly<CalibrationPublishedReportReceipt>;
}

function captureTerminal(value: unknown): Readonly<RuntimeTerminal> {
  if (typeof value !== 'object' || value === null || safeIsArray(value)) {
    fail();
  }
  let kind: unknown;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, 'kind');
    if (descriptor === undefined || descriptor.enumerable !== true || !('value' in descriptor)) {
      fail();
    }
    kind = (descriptor as PropertyDescriptor & { value: unknown }).value;
  } catch {
    fail();
  }
  if (kind === 'image') {
    const map = captureExactRecord(value, ['kind', 'eventIndex', 'journalHash']);
    capturePositiveIndex(map.get('eventIndex'));
    captureHex(map.get('journalHash'), HEX64_PATTERN);
    const owned = { kind: 'image' as const, eventIndex: map.get('eventIndex') as number, journalHash: map.get('journalHash') as string };
    return deepFreeze(owned) as unknown as Readonly<RuntimeTerminal>;
  }
  if (kind === 'non_reservation') {
    const map = captureExactRecord(value, ['kind', 'eventIndex', 'contentDigest']);
    capturePositiveIndex(map.get('eventIndex'));
    captureHex(map.get('contentDigest'), HEX64_PATTERN);
    const owned = {
      kind: 'non_reservation' as const,
      eventIndex: map.get('eventIndex') as number,
      contentDigest: map.get('contentDigest') as string,
    };
    return deepFreeze(owned) as unknown as Readonly<RuntimeTerminal>;
  }
  fail();
}

function captureDisposition(value: unknown): Readonly<RuntimeDisposition> {
  if (typeof value !== 'object' || value === null || safeIsArray(value)) {
    fail();
  }
  let kind: unknown;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, 'kind');
    if (descriptor === undefined || descriptor.enumerable !== true || !('value' in descriptor)) {
      fail();
    }
    kind = (descriptor as PropertyDescriptor & { value: unknown }).value;
  } catch {
    fail();
  }
  if (kind === 'unreserved_interruption') {
    const map = captureExactRecord(value, ['kind']);
    void map;
    return deepFreeze({ kind: 'unreserved_interruption' as const }) as unknown as Readonly<RuntimeDisposition>;
  }
  if (kind === 'reserved_interruption') {
    const map = captureExactRecord(value, ['kind', 'terminal']);
    const terminal = captureTerminal(map.get('terminal'));
    if ((terminal as unknown as Record<string, unknown>)['kind'] !== 'image') {
      fail();
    }
    return deepFreeze({ kind: 'reserved_interruption' as const, terminal }) as unknown as Readonly<RuntimeDisposition>;
  }
  if (kind === 'terminal_evidence_incomplete') {
    const map = captureExactRecord(value, ['kind', 'terminal']);
    const terminal = captureTerminal(map.get('terminal'));
    return deepFreeze({ kind: 'terminal_evidence_incomplete' as const, terminal }) as unknown as Readonly<RuntimeDisposition>;
  }
  fail();
}

function readField(map: Map<string, unknown>, field: string): unknown {
  return map.get(field);
}

function captureEventCommon(
  value: unknown,
  allowed: readonly string[],
): { map: Map<string, unknown>; sequence: number; owner: Readonly<CalibrationOwner>; at: string } {
  const map = captureExactRecord(value, allowed);
  if (map.get('version') !== 1) {
    fail();
  }
  const sequence = capturePositiveIndex(map.get('sequence'));
  const owner = captureOwner(map.get('owner'));
  const at = captureTimestamp(map.get('at'));
  return { map, sequence, owner, at };
}

function captureAttemptRef(map: Map<string, unknown>): { key: Readonly<CalibrationReportOutcomeKey>; attempt: number } {
  const key = captureOutcomeKey(map.get('key'));
  const attempt = capturePositiveIndex(map.get('attempt'));
  return { key, attempt };
}

function captureOperation(value: unknown): RuntimeOperation {
  if (value !== 'image' && value !== 'vision' && value !== 'snapshot') {
    fail();
  }
  return value as RuntimeOperation;
}

function captureEventType(value: unknown): string {
  if (typeof value !== 'string') {
    fail();
  }
  return value as string;
}

function checkRawStringBudget(value: unknown): void {
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (typeof current === 'string') {
      checkLoneSurrogates(current);
      if (Buffer.byteLength(current, 'utf8') > RECORD_BOUND) {
        fail();
      }
    } else if (Array.isArray(current)) {
      for (const entry of current) {
        stack.push(entry);
      }
    } else if (typeof current === 'object' && current !== null) {
      let names: string[];
      try {
        names = Object.getOwnPropertyNames(current);
      } catch {
        fail();
      }
      for (const name of names as string[]) {
        let descriptor: PropertyDescriptor | undefined;
        try {
          descriptor = Object.getOwnPropertyDescriptor(current, name);
        } catch {
          fail();
        }
        if (descriptor !== undefined && 'value' in descriptor) {
          try {
            stack.push((descriptor as PropertyDescriptor & { value: unknown }).value);
          } catch {
            fail();
          }
        }
      }
    }
  }
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
      fail();
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
    const parts = keys.map((key) => `${JSON.stringify(key)}:${canonicalize((value as Record<string, unknown>)[key])}`);
    return `{${parts.join(',')}}`;
  }
  fail();
}

function deepFreeze(value: unknown): unknown {
  if (value !== null && typeof value === 'object') {
    if (Array.isArray(value)) {
      for (const entry of value) {
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

function canonicalKeyId(key: Readonly<CalibrationReportOutcomeKey>): string {
  return `${key.stage}|${key.profile}|${key.caseId}|${key.sampleIndex}`;
}

export function captureCalibrationRuntimeEvidenceHeader(value: unknown): Readonly<RuntimeEvidenceHeader> {
  const map = captureExactRecord(value, HEADER_FIELDS);
  if (map.get('type') !== 'protocol_identity') {
    fail();
  }
  const identity = captureIdentity(map.get('identity'));
  const at = captureTimestamp(map.get('at'));
  if (map.get('reportAuthority') !== 'verified_artifacts_v1') {
    fail();
  }
  if (map.get('runtimeEvidenceVersion') !== 1) {
    fail();
  }
  const owner = captureOwner(map.get('owner'));
  const owned = {
    type: 'protocol_identity' as const,
    identity,
    at,
    reportAuthority: 'verified_artifacts_v1' as const,
    runtimeEvidenceVersion: 1 as const,
    owner,
  };
  const frozen = deepFreeze(owned) as unknown as Readonly<RuntimeEvidenceHeader>;
  checkRawStringBudget(frozen);
  const encoded = canonicalize(frozen);
  if (Buffer.byteLength(encoded, 'utf8') > RECORD_BOUND) {
    fail();
  }
  return frozen;
}

export function captureCalibrationRuntimeEvidenceEvent(value: unknown): Readonly<RuntimeEvidenceEvent> {
  if (typeof value !== 'object' || value === null || safeIsArray(value)) {
    fail();
  }
  let type: unknown;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, 'type');
    if (descriptor === undefined || descriptor.enumerable !== true || !('value' in descriptor)) {
      fail();
    }
    type = (descriptor as PropertyDescriptor & { value: unknown }).value;
  } catch {
    fail();
  }
  const kind = captureEventType(type);
  switch (kind) {
    case 'runtime_attempt_started': {
      const { map, sequence, owner, at } = captureEventCommon(value, [
        'type',
        'version',
        'sequence',
        'owner',
        'at',
        'key',
        'attempt',
      ]);
      const ref = captureAttemptRef(map);
      const owned = {
        type: 'runtime_attempt_started' as const,
        version: 1 as const,
        sequence,
        owner,
        at,
        key: ref.key,
        attempt: ref.attempt,
      };
      const frozen = deepFreeze(owned) as unknown as Readonly<RuntimeEvidenceEvent>;
      checkRawStringBudget(frozen);
      if (Buffer.byteLength(canonicalize(frozen), 'utf8') > RECORD_BOUND) {
        fail();
      }
      return frozen;
    }
    case 'runtime_operation_started': {
      const { map, sequence, owner, at } = captureEventCommon(value, [
        'type',
        'version',
        'sequence',
        'owner',
        'at',
        'key',
        'attempt',
        'operation',
      ]);
      const ref = captureAttemptRef(map);
      const operation = captureOperation(readField(map, 'operation'));
      const owned = {
        type: 'runtime_operation_started' as const,
        version: 1 as const,
        sequence,
        owner,
        at,
        key: ref.key,
        attempt: ref.attempt,
        operation,
      };
      const frozen = deepFreeze(owned) as unknown as Readonly<RuntimeEvidenceEvent>;
      checkRawStringBudget(frozen);
      if (Buffer.byteLength(canonicalize(frozen), 'utf8') > RECORD_BOUND) {
        fail();
      }
      return frozen;
    }
    case 'runtime_operation_settled': {
      const { map, sequence, owner, at } = captureEventCommon(value, [
        'type',
        'version',
        'sequence',
        'owner',
        'at',
        'key',
        'attempt',
        'operation',
        'result',
      ]);
      const ref = captureAttemptRef(map);
      const operation = captureOperation(readField(map, 'operation'));
      const result = readField(map, 'result');
      if (result !== 'returned' && result !== 'failed') {
        fail();
      }
      const owned = {
        type: 'runtime_operation_settled' as const,
        version: 1 as const,
        sequence,
        owner,
        at,
        key: ref.key,
        attempt: ref.attempt,
        operation,
        result: result as 'returned' | 'failed',
      };
      const frozen = deepFreeze(owned) as unknown as Readonly<RuntimeEvidenceEvent>;
      checkRawStringBudget(frozen);
      if (Buffer.byteLength(canonicalize(frozen), 'utf8') > RECORD_BOUND) {
        fail();
      }
      return frozen;
    }
    case 'runtime_request_authorized': {
      const { map, sequence, owner, at } = captureEventCommon(value, [
        'type',
        'version',
        'sequence',
        'owner',
        'at',
        'key',
        'attempt',
        'reservationEventIndex',
      ]);
      const ref = captureAttemptRef(map);
      const reservationEventIndex = capturePositiveIndex(readField(map, 'reservationEventIndex'));
      const owned = {
        type: 'runtime_request_authorized' as const,
        version: 1 as const,
        sequence,
        owner,
        at,
        key: ref.key,
        attempt: ref.attempt,
        reservationEventIndex,
      };
      const frozen = deepFreeze(owned) as unknown as Readonly<RuntimeEvidenceEvent>;
      checkRawStringBudget(frozen);
      if (Buffer.byteLength(canonicalize(frozen), 'utf8') > RECORD_BOUND) {
        fail();
      }
      return frozen;
    }
    case 'runtime_attempt_finished': {
      const { map, sequence, owner, at } = captureEventCommon(value, [
        'type',
        'version',
        'sequence',
        'owner',
        'at',
        'key',
        'attempt',
        'terminal',
      ]);
      const ref = captureAttemptRef(map);
      const terminal = captureTerminal(readField(map, 'terminal'));
      const owned = {
        type: 'runtime_attempt_finished' as const,
        version: 1 as const,
        sequence,
        owner,
        at,
        key: ref.key,
        attempt: ref.attempt,
        terminal,
      };
      const frozen = deepFreeze(owned) as unknown as Readonly<RuntimeEvidenceEvent>;
      checkRawStringBudget(frozen);
      if (Buffer.byteLength(canonicalize(frozen), 'utf8') > RECORD_BOUND) {
        fail();
      }
      return frozen;
    }
    case 'runtime_attempt_abandoned': {
      const { map, sequence, owner, at } = captureEventCommon(value, [
        'type',
        'version',
        'sequence',
        'owner',
        'at',
        'key',
        'attempt',
        'disposition',
      ]);
      const ref = captureAttemptRef(map);
      const disposition = captureDisposition(readField(map, 'disposition'));
      const owned = {
        type: 'runtime_attempt_abandoned' as const,
        version: 1 as const,
        sequence,
        owner,
        at,
        key: ref.key,
        attempt: ref.attempt,
        disposition,
      };
      const frozen = deepFreeze(owned) as unknown as Readonly<RuntimeEvidenceEvent>;
      checkRawStringBudget(frozen);
      if (Buffer.byteLength(canonicalize(frozen), 'utf8') > RECORD_BOUND) {
        fail();
      }
      return frozen;
    }
    case 'runtime_report_bound': {
      const { map, sequence, owner, at } = captureEventCommon(value, [
        'type',
        'version',
        'sequence',
        'owner',
        'at',
        'stage',
        'profile',
        'receipt',
        'throughSequence',
        'bindingSha256',
      ]);
      const stage = captureStage(readField(map, 'stage'));
      const profile = captureProfile(readField(map, 'profile'));
      const receipt = captureReceipt(readField(map, 'receipt'), stage, profile, null);
      const throughSequence = captureNonNegativeIndex(readField(map, 'throughSequence'));
      if (throughSequence !== sequence - 1) {
        fail();
      }
      captureHex(readField(map, 'bindingSha256'), HEX64_PATTERN);
      const owned = {
        type: 'runtime_report_bound' as const,
        version: 1 as const,
        sequence,
        owner,
        at,
        stage,
        profile,
        receipt,
        throughSequence,
        bindingSha256: readField(map, 'bindingSha256') as string,
      };
      const frozen = deepFreeze(owned) as unknown as Readonly<RuntimeEvidenceEvent>;
      checkRawStringBudget(frozen);
      if (Buffer.byteLength(canonicalize(frozen), 'utf8') > RECORD_BOUND) {
        fail();
      }
      return frozen;
    }
    default:
      fail();
  }
}

export function encodeCalibrationRuntimeEvidenceHeader(value: unknown): string {
  const captured = captureCalibrationRuntimeEvidenceHeader(value);
  const encoded = canonicalize(captured);
  if (Buffer.byteLength(encoded, 'utf8') > RECORD_BOUND) {
    fail();
  }
  return encoded;
}

export function encodeCalibrationRuntimeEvidenceEvent(value: unknown): string {
  const captured = captureCalibrationRuntimeEvidenceEvent(value);
  const encoded = canonicalize(captured);
  if (Buffer.byteLength(encoded, 'utf8') > RECORD_BOUND) {
    fail();
  }
  return encoded;
}

export function hashCalibrationRuntimeEvidenceBinding(value: unknown): string {
  const map = captureExactRecord(value, BINDING_FIELDS);
  if (map.get('version') !== 1) {
    fail();
  }
  const identity = captureIdentity(map.get('identity'));
  const stage = captureStage(map.get('stage'));
  const profile = captureProfile(map.get('profile'));
  const throughSequence = captureNonNegativeIndex(map.get('throughSequence'));
  const rawEvents = map.get('events');
  const rawTerminals = map.get('terminals');
  const events = captureDenseArray(rawEvents, MAX_RUNTIME_EVENTS);
  const terminals = captureDenseArray(rawTerminals, MAX_TERMINAL_ROWS);
  if (events.length > MAX_RUNTIME_EVENTS || terminals.length > MAX_TERMINAL_ROWS) {
    fail();
  }
  const receipt = captureReceipt(map.get('receipt'), stage, profile, identity.implementationCommit);
  const ownedEvents: RuntimePairEvent[] = [];
  let previousSequence = -1;
  for (const entry of events) {
    const captured = captureCalibrationRuntimeEvidenceEvent(entry) as unknown as Record<string, unknown>;
    if ((captured['type'] as string) === 'runtime_report_bound') {
      fail();
    }
    const key = captured['key'] as unknown as Record<string, unknown>;
    if (key['stage'] !== stage || key['profile'] !== profile) {
      fail();
    }
    const sequence = captured['sequence'] as number;
    if (sequence <= previousSequence) {
      fail();
    }
    if (sequence > throughSequence) {
      fail();
    }
    previousSequence = sequence;
    ownedEvents.push(captured as unknown as RuntimePairEvent);
  }
  const ownedRows: Array<{ key: Readonly<CalibrationReportOutcomeKey>; terminal: Readonly<RuntimeTerminal> }> = [];
  const seen = new Set<string>();
  let previousId: string | null = null;
  for (const entry of terminals) {
    const rowMap = captureExactRecord(entry, TERMINAL_ROW_FIELDS);
    const key = captureOutcomeKey(rowMap.get('key'));
    if (key.stage !== stage || key.profile !== profile) {
      fail();
    }
    const terminal = captureTerminal(rowMap.get('terminal'));
    const id = canonicalKeyId(key);
    if (seen.has(id)) {
      fail();
    }
    seen.add(id);
    if (previousId !== null && !((previousId as string) < id)) {
      fail();
    }
    previousId = id;
    ownedRows.push({ key, terminal });
  }
  const owned = {
    version: 1 as const,
    identity,
    stage,
    profile,
    throughSequence,
    events: ownedEvents,
    terminals: ownedRows,
    receipt,
  };
  const frozen = deepFreeze(owned) as unknown as Readonly<RuntimeBindingInput>;
  const encoded = canonicalize(frozen);
  return createHash('sha256').update(encoded, 'utf8').digest('hex');
}
