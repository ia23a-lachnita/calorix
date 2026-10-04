# Calibration Safe-Error Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this one bounded task. Steps use checkbox (`- [ ]`) syntax for tracking. Calorix's `AGENTS.md` worker-edit/host-review/commit policy takes precedence over generic skill execution examples.

**Goal:** Give the later default Stage 0 runtime a durable, privacy-safe `recordSafeError` sink for both provider failures and reservation failures, without adding a fourth file or changing model/call routing.

**Architecture:** Add one audit-only `safe_error` event to the existing calibration ledger grammar. A locked ledger validates the exact Stage 0 safe-entry shape and appends/fsyncs it through the existing event path. Strict replay validates the event before accepting it and never treats it as an image or token reservation. The existing injectable preflight session remains unchanged; a later runtime slice will supply `ledger.recordSafeError` to its bridge. A crash before this method finishes cannot be described as a recorded safe error; provider terminal events/journals may nevertheless already hold their categories.

**Tech Stack:** TypeScript, Node filesystem, Vitest; existing `calibration.ts`, `calibration-file-store.ts`, and Stage 0 safe-entry type in `calibration-cli.ts`.

**Spec:** `docs/superpowers/specs/2026-09-23-gemini-38-nutrition-calibration-design.md` Stage 0 and privacy; parent plan `docs/superpowers/plans/2026-09-23-gemini-38-nutrition-calibration.md` Task 7 Steps 2/4. The no-new-event rule in `2026-10-02-calibration-preflight-session.md` applied only to that completed injected-session slice; this is its explicitly deferred durable implementation.

## Global Constraints

- Protocol v1, `vertex-ai`, `gemini-3.8-flash`, LOW/MEDIUM, planned `146`, hard ceiling `300`, and the canonical root remain unchanged. No new model/client, provider call, CLI default, `--run-dir`, retry, crash recovery invocation, or report schema in this slice.
- The safe entry is exactly token `{ stage: 'preflight', kind: 'token_count', caseId, errorCategory }` or image `{ stage: 'preflight', kind: 'image', caseId, profile, sampleIndex: 1, errorCategory }`. Category must be one of the existing taxonomy excluding `none`; case ID is 1–128 ASCII letters/digits/underscore/hyphen, matching the file journal contract. Extra fields, raw message, URL, prompt, response, stack, model version, and absolute path are rejected before append.
- A new event is exactly `{ type: 'safe_error', entry, at }`. Validate the exact outer and inner key sets on both write and replay, the allowed preflight case/image key, category, and canonical `YYYY-MM-DDTHH:mm:ss.sssZ` timestamp with a finite parsed time. No event may increment image/token counts, complete a reservation, release a lock, or allow reruns. Existing ledger files without `safe_error` remain replayable.
- `recordSafeError` requires the caller's ledger lock and uses the existing append → ledger-file fsync → ledger-dir fsync path. A failed append/fsync must throw; it must not retry or assert that an uncertain write is durable. The primitive's existing `recordSafeFailure` converts recorder failure to its fresh causeless fatal when this hook is later wired.
- Provider failures already persist their exact category in a token terminal event or image journal before the recorder runs. Reservation failures may have no terminal record; a successful new `safe_error` append is their durable category. An abrupt crash before that append leaves an uncertain/incomplete attempt and must not be reported as recorded. A prior reservation is never counted as evidence of the new attempt.
- All tests use real temporary file stores and fake data. No provider, Firebase, device, emulator, network, LocateAnything, or live opt-in action. Keep user-owned `.mcp.json` byte-identical and unstaged. Parent Task 7 Step 4 stays unchecked.

## Review Focus

1. A duplicate token reservation after a prior completed token must produce a new durable `safe_error/unknown` audit event for the current attempt, not mistake the old completion for proof.
2. An unclassified provider failure (`unknown`) must remain distinct from a reservation failure: the former has a terminal category before the safe event; the latter may not.
3. A tainted entry with extra secret-bearing keys or invalid case ID/category must fail before any disk append; replay of a tampered event must fail closed.
4. A write/fsync failure must not be treated as a recorded safe error, and the lock must not be released by this method.
5. A `safe_error` event must not consume token/image budget, alter completion/recovery state, or make an old ledger incompatible.

## File Map

| File | Responsibility |
|---|---|
| `functions/src/nutrition-eval/calibration.ts` | Shared safe-entry type, strict event validator/replay branch, locked durable `recordSafeError` method. |
| `functions/src/nutrition-eval/calibration-cli.ts` | Re-export/alias the existing public safe-entry name to the shared ledger type; no runtime behavior change. |
| `functions/test/nutrition-eval/calibration-safe-error-ledger.test.ts` | New real-file-store tests for durability, privacy, replay, and no budget/state effect. |
| `docs/implementation-status.md` | RED/GREEN, review, verification, exact commit/push, next task. |

## Task 1: Add a strict durable safe-error ledger event

**Consumes:** `createFileCalibrationLedgerDeps(baseDir)`, `createCalibrationLedger(deps, identity, allowedKeys)`, `CalibrationLedger.acquireLock(owner)`, existing `CalibrationSafeErrorCategory`, and the existing file-store event append/fsync/read hooks.

**Produces:** `CalibrationLedger.recordSafeError(entry: CalibrationLedgerSafeErrorEntry): void`; preserve `CalibrationPreflightSafeErrorEntry` as an exported alias in `calibration-cli.ts`, so existing injected callers and tests still compile.

- [x] **Step 1: Write RED tests in the new test file.** Use `mkdtempSync(join(tmpdir(), 'calorix-safe-error-ledger-'))`, `afterEach` cleanup, the fixed identity/owner literals from `calibration-preflight-session.test.ts`, and exactly LOW/MEDIUM keys for `calibration-dish_1565117892`. In each real-store case, acquire the lock before recording and re-open with a fresh `createFileCalibrationLedgerDeps(baseDir)`/`createCalibrationLedger` before asserting replay. Add these executable cases:

  ```ts
  const caseId = 'calibration-dish_1565117892';
  const tokenKey = { kind: 'token_count', stage: 'preflight', caseId, model: 'gemini-3.8-flash' } as const;
  const lowKey = { stage: 'preflight', profile: 'LOW', caseId, sampleIndex: 1 } as const;
  const mediumKey = { stage: 'preflight', profile: 'MEDIUM', caseId, sampleIndex: 1 } as const;
  const tokenFailure = { stage: 'preflight', kind: 'token_count', caseId, errorCategory: 'http_429' } as const;
  const imageFailure = {
    stage: 'preflight', kind: 'image', caseId, profile: 'LOW', sampleIndex: 1,
    errorCategory: 'http_5xx',
  } as const;
  // Each test constructs a real ledger using [lowKey, mediumKey] and reopens it for assertions.
  ```
  - Token 429: reserve token key, fail it with `http_429`, then record the exact token safe entry. Replay event types must be `token_count_reserved`, `token_count_failed`, `safe_error`; the last event has exactly `type`, `entry`, `at` keys and an exact four-field entry. Counts remain `tokenCountReserved: 1`, `imageReserved: 0`; lock remains held until the fixture explicitly releases it.
  - Image 503: reserve the LOW image key, append a safe null-prediction journal with `http_5xx`, complete it with that journal hash, then record the exact six-field image safe entry. Replay the journal and `safe_error` event; image count remains `1`, completed keys still contain only LOW. No extra reservation.
  - Duplicate token: fixture ledger acquires, reserves and completes the token, then releases only its fixture lock. A new ledger acquires and its duplicate `reserveTokenCount` fails before a provider call; `recordSafeError` with token `unknown` appends a NEW event after the old terminal. Replay must show the new `safe_error/unknown` and exactly one token reservation.
  - Provider `unknown`: reserve/fail token with category `unknown`, then record token `unknown`; replay must contain BOTH the token terminal and the separate safe event, not just an old reservation.
  - Privacy/replay: pass entries with an extra `message: 'private https://secret.invalid'`, malformed case ID, invalid category, wrong stage, missing image profile, or non-1 sample index through runtime casts; each must throw before append and leave no secret bytes in serialized events. Inject one malformed `safe_error` event into a controlled fake `CalibrationLedgerDeps.readLedgerEvents()` replay and require a fatal instead of accepting it.
  - Durability/lock: make the file-store `fsyncDirSync` override throw for the ledger directory during the `safe_error` append (after lock/reservation setup); the method must throw, not release the lock, not call a provider, and not claim the event was durable. Keep the exact on-disk outcome of a failed fsync explicitly uncertain.
  - Backward compatibility/no state effect: replay a prior valid ledger with no `safe_error`, then append a valid safe event; check image/token counters and `rebuildReport()` before/after are identical. Calling `recordSafeError` without holding a lock must throw before append.

- [x] **Step 2: Witness RED.** Run `cd functions && npx vitest run test/nutrition-eval/calibration-safe-error-ledger.test.ts --reporter=dot`. The tests must fail on the absent `recordSafeError` method / unknown event grammar, not on fixture mistakes. Run direct ESLint on the test file and record focused RED evidence in `docs/implementation-status.md`.

- [x] **Step 3: Implement the minimal source.** Define `CalibrationLedgerSafeErrorEntry` in `calibration.ts` with token/image discriminated shapes. Add exact-shape runtime validation (including the existing category allowlist and bounded case ID) that is shared by the write method and the new `safe_error` replay case. On write, require lock, validate first, then call existing `persistLedgerEvent({ type: 'safe_error', entry, at: deps.nowIso() })`. On replay, reject malformed/extra fields and accept a valid event as audit-only with no counter or reservation mutation. Keep the old `CalibrationPreflightSafeErrorEntry` export path in `calibration-cli.ts` as a type alias; do not alter the primitive or session logic.

  ```ts
  export type CalibrationLedgerSafeErrorEntry =
    | { readonly stage: 'preflight'; readonly kind: 'token_count'; readonly caseId: string;
        readonly errorCategory: CalibrationSafeErrorCategory }
    | { readonly stage: 'preflight'; readonly kind: 'image'; readonly caseId: string;
        readonly profile: CalibrationProfile; readonly sampleIndex: 1;
        readonly errorCategory: CalibrationSafeErrorCategory };

  function recordSafeError(entry: CalibrationLedgerSafeErrorEntry): void {
    requireLock();
    assertValidSafeErrorEntry(entry); // exact keys, category != none, bounded caseId, planned key
    const at = deps.nowIso();
    assertCanonicalIso(at);
    persistLedgerEvent({ type: 'safe_error', entry, at });
  }
  // Replay branch: assert exact event keys/type/entry/canonical ISO timestamp;
  // never change reservation maps, counters, pending hashes, or held lock.
  ```

- [x] **Step 4: Verify GREEN and regression scope.** Run `cd functions && npx vitest run test/nutrition-eval/calibration-safe-error-ledger.test.ts test/nutrition-eval/calibration.test.ts test/nutrition-eval/calibration-file-store.test.ts test/nutrition-eval/calibration-cli.test.ts test/nutrition-eval/calibration-preflight-session.test.ts --reporter=dot && npm run build && npm run lint`. Fix any test/type failures through the worker route; inspect the exact replay grammar and privacy assertions on the host.

- [x] **Step 5: Verify bounded stage.** Run `cd functions && nice -n 10 npm test`, then from repo root `git diff --check`, explicit untracked-file whitespace checks, `git status --short`, and `sha256sum .mcp.json`. No Flutter/APK/UI-diff or live provider gate applies to this hermetic ledger extension; record this scope reason.

- [x] **Step 6: External review and checkpoint.** Request read-only Antigravity MCP post-review in conversation `calorix-task7-durable-runtime-20261004`, `approvalMode: yolo`, canonical model order, with the mandatory no-write sentence. Green requires literal `AGREEMENT_STATUS: agree` and `MUST_FIX: none`; reject noisy/empty responses and inspect status/hash after the call. Apply must-fixes through the authorized worker route, rerun verification, update `docs/implementation-status.md`, then explicitly stage only the two source files, new test file, and status file. Host commits with plain imperative message `Record calibration safe errors`, pushes `fix/scan-photo-flow-viewer`, and verifies local/remote equality. Do not stage `.mcp.json`.

## Execution Handoff

This is one bounded persistence task within the approved calibration design, not the default CLI or a live run. The main host owns plan/status docs, review, verification, commits, and pushes; application source/tests are edited only by the Calorix `AGENTS.md` strongest-first worker route. Once this event is checkpointed, separately plan the default Stage 0 runtime that passes this method into the bridge and wires committed assets, clean Git identity, and the exact Vertex client. No provider dispatch is authorized by this plan.
