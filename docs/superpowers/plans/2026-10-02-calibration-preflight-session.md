# Calibration Preflight Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this one bounded task. Steps use checkbox (`- [ ]`) syntax for tracking. Calorix's `AGENTS.md` worker route and host-only commit/push rules take precedence over generic skill execution examples.

**Goal:** Add one hermetic Stage 0 session function that composes the existing file store, ledger, ledger bridge, and preflight primitive with success-only lock release.

**Architecture:** The caller supplies the fixed calibration identity, process owner, base directory, first development case ID, two fake-or-real provider callbacks, and a required safe-error recorder. The new module creates the existing file-backed ledger with exactly the LOW and MEDIUM preflight image keys, acquires its lock, and runs the existing bridge and primitive. It releases the lock only after successful preflight; failure leaves any acquired lock for same-host dead-owner audit. This is a testable integration seam, not default CLI or live-provider wiring.

**Tech Stack:** TypeScript 5.5, Node 20, Vitest 2; existing `calibration.ts`, `calibration-file-store.ts`, `calibration-preflight-ledger.ts`, and `calibration-cli.ts`.

**Spec:** `docs/superpowers/specs/2026-09-23-gemini-38-nutrition-calibration-design.md`, Stage 0; parent plan `docs/superpowers/plans/2026-09-23-gemini-38-nutrition-calibration.md`, Task 7 Step 4. This slice does not complete that step.

## Global Constraints

- Protocol v1 remains fixed to provider `vertex-ai`, model `gemini-3.8-flash`, planned image calls `146`, and hard ceiling `300`. The existing ledger enforces these values; the session must fail before file effects on malformed runtime input.
- The only planned image keys here are `{ stage: 'preflight', profile: 'LOW' | 'MEDIUM', caseId: firstDevelopmentCaseId, sampleIndex: 1 }`, in that order. The primitive makes one separately typed token-count reservation before either image reservation. Do not add a ledger event, journal field, or separate safe-error file.
- A caller-provided `recordSafeError` is mandatory; never replace it with a no-op or an in-memory default. Its eventual durable implementation belongs to the later default runtime. Existing token terminal events and image journals already persist provider categories.
- The caller owns `identity` and `owner` derivation. `baseDir` is a trusted construction input for hermetic tests, never a new CLI `--run-dir` or environment override. Do not wire `runCalibrationCli`, construct a Vertex client, read manifests, call live inference, or call `recoverAfterCrash()` in this slice.
- After a successful primitive result, call `ledger.releaseLock(owner)` once. On a primitive, recorder, reservation, lock-acquisition, or release failure, do not retry or make a second release attempt. An acquired lock remains on normal fatal paths; a filesystem fault during release may have an uncertain on-disk outcome and must not be overstated.
- A pending or completed token-count reservation must not be reset or rerun. `recoverAfterCrash()` handles image reservations only. The wrapper must let the existing duplicate-token reservation failure stop before provider dispatch.
- The wrapper must not attach raw provider error messages, URLs, prompts, responses, or model metadata to its own errors. The existing primitive produces a fresh, causeless `calibration:preflight-safe-error-persist-failed` when the required recorder fails. Do not claim that this slice strips causes attached by unrelated ledger/file-store errors.
- All tests use real temporary file-store/ledger replay with fake callbacks. No provider, Firebase, device, emulator, LocateAnything, network, or live opt-in call. Keep user-owned `.mcp.json` byte-identical and unstaged.
- RED/GREEN first; then focused Vitest, Functions build/lint/full unit suite, diff/protected-file checks, read-only Antigravity MCP post-review, and host-only commit/push with explicit paths. Parent Task 7 Step 4 stays unchecked.

## Review Focus

Each failure class below has a required executable test in Task 1:

1. Missing or malformed injected identity, owner, directory, case ID, or recorder: reject before creating the canonical root (`invalid input` test).
2. Existing live lock: reject before any token/image callback and preserve the original lock (`live owner` test).
3. Provably dead same-host owner: append the lock-recovery audit event before a fresh preflight, then release on success (`dead owner` test).
4. Already-reserved token key: fail before a second token callback, without pretending that image crash recovery resets the token (`duplicate token` test).
5. Provider and recorder failures containing private text: persist only safe categories where the ledger/journal has a slot, pass only allowlisted safe-recorder fields, retain the lock, and expose only the primitive's safe fatal message (`token 429`, `image 503`, and `recorder failure` tests).

## File Map

| File | Responsibility |
|---|---|
| `functions/src/nutrition-eval/calibration-preflight-session.ts` | New composition boundary: validate inputs, create file-backed ledger, acquire lock, invoke existing bridge/primitive, release on success only. |
| `functions/test/nutrition-eval/calibration-preflight-session.test.ts` | New real-temp-dir tests for success, replay, lock/recovery, duplicate token, recorder failure, and privacy. |
| `docs/implementation-status.md` | Stage tracking, exact RED/GREEN/review results, commit and push state. |

## Task 1: Add the hermetic preflight session

**Files:** Create the source and test files in the file map; update only `docs/implementation-status.md` for tracking.

**Consumes:** `createFileCalibrationLedgerDeps(baseDir)`; `createCalibrationLedger(fileDeps, identity, allowedKeys)`; `ledger.acquireLock(owner)` / `releaseLock(owner)`; `createCalibrationPreflightLedgerHooks(ledger, providerHooks)`; `executeCalibrationPreflight(undefined, { firstDevelopmentCaseId, ...hooks })`.

**Produces:** This exact exported API (reuse existing types rather than widening safe categories to `string`):

```ts
import type { CalibrationIdentity, CalibrationOwner } from './calibration';
import type { CalibrationPreflightStageResult } from './calibration-cli';
import type { CalibrationPreflightLedgerProviderHooks } from './calibration-preflight-ledger';

export interface CalibrationPreflightSessionDeps
  extends CalibrationPreflightLedgerProviderHooks {
  baseDir: string;
  identity: CalibrationIdentity;
  owner: CalibrationOwner;
  firstDevelopmentCaseId: string;
}

export function runCalibrationPreflightSession(
  deps: CalibrationPreflightSessionDeps,
): Promise<CalibrationPreflightStageResult>;
```

- [ ] **Step 1: Write RED tests.** Create `functions/test/nutrition-eval/calibration-preflight-session.test.ts`. Use the exact `makeIdentity()` and `makeOwner()` literals/helpers already exercised in `calibration-preflight-ledger.test.ts`; keep the new helpers local to this test file. Build the two keys with this code, and use `mkdtempSync(join(tmpdir(), 'calorix-preflight-session-'))` plus `afterEach` cleanup:

```ts
const caseId = 'calibration-dish_1565117892';
const lowKey: ReservationKey = {
  stage: 'preflight', profile: 'LOW', caseId, sampleIndex: 1,
};
const mediumKey: ReservationKey = {
  stage: 'preflight', profile: 'MEDIUM', caseId, sampleIndex: 1,
};
const tokenKey: TokenCountReservationKey = {
  kind: 'token_count', stage: 'preflight', caseId, model: 'gemini-3.8-flash',
};
const prediction = {
  prediction: { kcal: 320, proteinG: 20, carbsG: 30, fatG: 10 },
  modelVersion: 'gemini-3.8-20260923',
};
// Reuse this exact callback shape in each test; never use a live SDK client.
const safeEntries: CalibrationPreflightSafeErrorEntry[] = [];
const callbacks = {
  countTokens: vi.fn(async () => ({ tokenCount: 42 })),
  generateImage: vi.fn(async () => prediction),
  recordSafeError: vi.fn((entry: CalibrationPreflightSafeErrorEntry) => {
    safeEntries.push(entry);
  }),
};
```

  Add these executable cases, each with a new temporary directory and a fresh replay via `createFileCalibrationLedgerDeps(baseDir)` and `createCalibrationLedger(fileDeps, makeIdentity(), [lowKey, mediumKey])`:

  - Success: `await runCalibrationPreflightSession({ baseDir, identity, owner, firstDevelopmentCaseId: caseId, ...callbacks })` returns token count `42` and the pinned version; callback counts are `1` token/`2` images/`0` safe errors; replayed event types are exactly `token_count_reserved, token_count_completed, reserved, completed, reserved, completed`, journals are LOW then MEDIUM, report has both completed keys, and `fileDeps.readLock()` is `undefined`.
  - Token 429: `countTokens` throws `Object.assign(new Error('private https://secret.invalid'), { status: 429 })`. Expect the safe fatal slug `calibration:preflight-token-call-failed`, one recorder entry exactly `{ stage: 'preflight', kind: 'token_count', caseId, errorCategory: 'http_429' }`, replayed `token_count_failed` with `http_429`, no image events/calls, and `readLock()` equal to the supplied owner. Assert the private URL is absent from fatal `message`, serialized events, and serialized safe entries.
  - Image 503: let LOW return `prediction` and have MEDIUM throw `{ status: 503 }`. Expect `calibration:preflight-image-call-failed`, exactly LOW success plus MEDIUM failure journal/terminal events, one safe entry with `kind: 'image'`, `profile: 'MEDIUM'`, `errorCategory: 'http_5xx'`, no third call, and retained lock. Confirm the failure journal has `normalizedPrediction: null` and only the safe category.
  - Live owner: seed an empty real ledger, `acquireLock(liveOwner)`, then invoke the wrapper with another caller owner. Expect `calibration:lock-held-live`, zero callback calls and ledger reservation events, and `readLock()` still equal to `liveOwner`. Use the actual current PID/start ticks and same boot ID for `liveOwner`, as in the existing bridge tests.
  - Dead owner: seed an empty real ledger lock with `deadOwner = { ...owner, pid: 2147483647, startTicks: 1 }` on the same hostname/boot; invoke with the live `owner`. Expect `lock_recovery` as the first replayed event, one token/two image calls, no extra reservation, and no lock after successful completion.
  - Duplicate token: seed a real ledger with `fixtureLedger.acquireLock(owner); fixtureLedger.reserveTokenCount(tokenKey); fixtureLedger.releaseLock(owner);`. This deliberate fixture release is **not** a simulated fatal session; it exists only to make the duplicate check reachable without a live-lock rejection. Invoke the wrapper, expect `calibration:preflight-token-reservation-failed`, zero token/image callback calls, one safe recorder entry with `kind: 'token_count'` and `errorCategory: 'unknown'`, exactly one persisted token reservation, and a lock now held by the wrapper owner.
  - Recorder failure: token callback throws `{ status: 429 }` and `recordSafeError` throws `new Error('private recorder text')`. Expect the exact fresh `calibration:preflight-safe-error-persist-failed` fatal with `cause === undefined` and no private text in `message`; the token failure event remains durable, image callbacks are zero, and the lock remains held.
  - Invalid input: pass `recordSafeError: undefined` through `as unknown as CalibrationPreflightSessionDeps` (and separately a blank case ID); expect `calibration:preflight-session-input-invalid`, zero callbacks, and `existsSync(resolve(baseDir, CALIBRATION_ROOT)) === false`. Do not construct the file store merely to make this assertion.

  For the fatal tests, capture the rejection with `await promise.then(() => null, (error: unknown) => error)` so the same error can be checked for type, exact `message`, and (where specified) `cause`. Avoid asserting that ledger/file-store causes are always absent; only the primitive's recorder failure guarantees that.

- [ ] **Step 2: Witness RED.** Run `cd functions && npx vitest run test/nutrition-eval/calibration-preflight-session.test.ts --reporter=dot`. Expected: collection fails solely because `calibration-preflight-session.ts` is absent; zero tests collected. Run direct ESLint on the new test to catch independent syntax/type-style mistakes, and record the exact output in `docs/implementation-status.md`.

- [ ] **Step 3: Implement the minimal source.** First validate all inputs without touching the filesystem. A safe implementation shape is:

```ts
function invalid(): never {
  throw new CalibrationFatalError('calibration:preflight-session-input-invalid');
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
const identityTextFields = [
  'implementationCommit', 'functionsTreeId', 'datasetHash', 'promptHash',
  'responseSchemaHash', 'sourceLockHash', 'manifestHash',
  'publicManifestHash', 'snapshotLockHash', 'historicalReferenceHash',
] as const satisfies readonly (keyof CalibrationIdentity)[];
function assertSessionDeps(value: unknown): asserts value is CalibrationPreflightSessionDeps {
  if (!record(value)) invalid();
  const identity = value.identity;
  const owner = value.owner;
  if (typeof value.baseDir !== 'string' || !value.baseDir.trim()
    || typeof value.firstDevelopmentCaseId !== 'string'
    || !value.firstDevelopmentCaseId.trim()
    || typeof value.countTokens !== 'function'
    || typeof value.generateImage !== 'function'
    || typeof value.recordSafeError !== 'function'
    || !record(identity) || !record(owner)) invalid();
  if (identity.protocolVersion !== 'v1' || identity.provider !== 'vertex-ai'
    || identity.model !== 'gemini-3.8-flash'
    || identity.plannedImageCalls !== 146 || identity.hardCeiling !== 300
    || identityTextFields.some((field) => {
      const part = identity[field];
      return typeof part !== 'string' || !part.trim();
    })) invalid();
  if (typeof owner.hostname !== 'string' || !owner.hostname.trim()
    || typeof owner.bootId !== 'string' || !owner.bootId.trim()
    || typeof owner.pid !== 'number'
    || !Number.isInteger(owner.pid) || owner.pid <= 0
    || typeof owner.startTicks !== 'number'
    || !Number.isInteger(owner.startTicks) || owner.startTicks <= 0
    || typeof owner.acquiredAt !== 'string' || !owner.acquiredAt.trim()) invalid();
}
```

  Then compose only existing functions; do not use `finally` or catch-and-release:

```ts
export async function runCalibrationPreflightSession(
  deps: CalibrationPreflightSessionDeps,
): Promise<CalibrationPreflightStageResult> {
  assertSessionDeps(deps);
  const caseId = deps.firstDevelopmentCaseId;
  const allowedKeys: ReservationKey[] = [
    { stage: 'preflight', profile: 'LOW', caseId, sampleIndex: 1 },
    { stage: 'preflight', profile: 'MEDIUM', caseId, sampleIndex: 1 },
  ];
  const fileDeps = createFileCalibrationLedgerDeps(deps.baseDir);
  const ledger = createCalibrationLedger(fileDeps, deps.identity, allowedKeys);
  ledger.acquireLock(deps.owner);
  const hooks = createCalibrationPreflightLedgerHooks(ledger, {
    countTokens: deps.countTokens,
    generateImage: deps.generateImage,
    recordSafeError: deps.recordSafeError,
  });
  const result = await executeCalibrationPreflight(undefined, {
    firstDevelopmentCaseId: caseId,
    ...hooks,
  });
  ledger.releaseLock(deps.owner);
  return result;
}
```

- [ ] **Step 4: Verify GREEN.** Run `cd functions && npx vitest run test/nutrition-eval/calibration-preflight-session.test.ts --reporter=dot && npm run build && npm run lint`. All new executable tests must pass; do not substitute `it.skip`/`todo`. Correct any TypeScript narrowing issue within this module without broadening input or adding a default. Record counts and commands.

- [ ] **Step 5: Verify the bounded stage.** Run `cd functions && npm test`, then from repo root `git diff --check`, `sha256sum .mcp.json`, and `git status --short`. Only the two new slice files, tracking update, and the pre-existing protected `.mcp.json` may be dirty. No emulator, Firebase, provider, device, or visual-diff gate is relevant to this hermetic slice; record that scope reason.

- [ ] **Step 6: Review and checkpoint.** The main host requests read-only Antigravity MCP post-review in workstream `calorix-task7-default-runtime-20261002`, `approvalMode: "yolo"`, canonical model order, with the mandatory no-write instruction. Green requires literal `AGREEMENT_STATUS: agree` and `MUST_FIX: none`. Apply any must-fixes through the authorized editing route and rerun verification. Update `docs/implementation-status.md` with exact results and keep parent Task 7 Step 4 unchecked. The host then stages **only** `functions/src/nutrition-eval/calibration-preflight-session.ts`, `functions/test/nutrition-eval/calibration-preflight-session.test.ts`, and `docs/implementation-status.md`; commits with plain imperative message `Add calibration preflight session`; pushes `fix/scan-photo-flow-viewer` to `origin`; verifies local/remote equality. Never run `git add -A` or stage `.mcp.json`.

## Execution Handoff

This plan is for the repository's established worker-edit/host-review method. The current one-time direct-host exception authorizes correcting **this plan file only**; it does not authorize the main host to edit the source or test files above. After plan self-review and a green read-only Antigravity plan review, commit and push this plan with tracking only. Start the implementation in a separate bounded stage through the normal worker route, unless the user explicitly changes that policy.
