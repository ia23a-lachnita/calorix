# Calibration Durable Preflight Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this one bounded task. Steps use checkbox (`- [ ]`) syntax for tracking. Calorix `AGENTS.md` controls editing-worker routing, host verification, review, commits, and pushes.

**Goal:** Expose a hermetic Stage 0 session entry point that always records safe errors through its own locked file ledger, while preserving the existing explicitly injected session API.

**Architecture:** Add `runCalibrationPreflightDurableSession` beside `runCalibrationPreflightSession`. Both use one private, post-validation session core; the old API supplies its required recorder, while the new API supplies `ledger.recordSafeError` after creating and locking that same ledger. This is session composition only, not the default CLI bootstrap or a live run.

**Tech Stack:** TypeScript, Node file store, Vitest; existing calibration ledger, preflight bridge, and preflight primitive.

**Spec:** `docs/superpowers/specs/2026-09-23-gemini-38-nutrition-calibration-design.md` Stage 0 and safety; parent plan `docs/superpowers/plans/2026-09-23-gemini-38-nutrition-calibration.md` Task 7 Step 4.

## Global Constraints

- Keep protocol `v1`, project `calorix-xurschnell`, location `us`, model `gemini-3.8-flash`, LOW then MEDIUM, planned `146` image calls, and hard ceiling `300`. Do not call `gemini-2.5-flash` or choose another project/model.
- This slice receives an already-validated `CalibrationIdentity`, `CalibrationOwner`, `baseDir`, first development case ID, and pure injected `countTokens`/`generateImage` callbacks. It does not read committed assets, inspect Git, derive process identity, construct a Vertex client, add an npm CLI command, dispatch a live provider, or touch Stages 1–3.
- Preserve `runCalibrationPreflightSession` exactly as a public contract: a missing `recordSafeError` remains invalid before file effects, and all 15 existing session tests remain green. The new durable function must not accept a caller recorder, even through a runtime cast, because that would silently defeat durability.
- `safe_error` is the existing strict audit-only ledger event. Provider terminal/journal entries precede it; reservation failure may lack a terminal. Failure retains the lock and permits no retry. A completed session releases its lock. No raw provider text, URL, prompt, response, cause, or stack enters the ledger or exported fatal.
- Use the established in-place checkout and strongest-first external editing-worker route; host writes only plan/status docs, reviews, verifies, commits, and pushes. Keep user-owned `.mcp.json` byte-identical and unstaged. Parent Task 7 Step 4 remains unchecked.

## Review Focus

1. A caller passing an unexpected `recordSafeError` property to the durable API must be rejected before any file or provider effect; test a runtime cast.
2. A token provider error with private message must produce a durable terminal category and separate safe event without leaking that message; test fresh real-store replay.
3. An image provider error must complete its null-prediction journal before the safe event and retain the lock; test fresh replay and counts.
4. A duplicate completed token reservation must add a new `safe_error/unknown` event without calling the provider or reusing the old completion as proof; test pre-seeded real-store state.
5. A live conflicting lock must stop before provider callbacks and preserve the owner; test the durable entry point, not only the old injected entry point.

## File Map

| File | Responsibility |
|---|---|
| `functions/src/nutrition-eval/calibration-preflight-session.ts` | Shared validated session core and new durable public entry point; old entry point behavior unchanged. |
| `functions/test/nutrition-eval/calibration-preflight-durable-session.test.ts` | New real-file-store, fake-provider RED/GREEN tests for the durable entry point. |
| `docs/implementation-status.md` | Focused RED/GREEN evidence, review verdict, verification, checkpoint and next slice. |

## Task 1: Compose the durable Stage 0 session

**Consumes:** `createFileCalibrationLedgerDeps(baseDir)`, `createCalibrationLedger(deps, identity, allowedKeys)`, `ledger.recordSafeError(entry)`, `createCalibrationPreflightLedgerHooks(ledger, providerHooks)`, and `executeCalibrationPreflight(undefined, hooks)`.

**Produces:**

```ts
export type CalibrationPreflightDurableSessionDeps = Omit<
  CalibrationPreflightSessionDeps,
  'recordSafeError'
> & { readonly recordSafeError?: never };

export function runCalibrationPreflightDurableSession(
  deps: CalibrationPreflightDurableSessionDeps,
): Promise<CalibrationPreflightStageResult>;
```

- [x] **Step 1: Write RED tests.** In the new test file, use `mkdtempSync(join(tmpdir(), 'calorix-durable-preflight-'))`, real `createFileCalibrationLedgerDeps`, the fixed identity/owner shapes from `calibration-preflight-session.test.ts`, and LOW/MEDIUM preflight keys for `calibration-dish_1565117892`. Add six cases: (a) valid fake callbacks yield token `42`, LOW/MEDIUM valid predictions and the same pinned version, one token reservation/two image reservations, two journals, no safe events, and released lock; (b) token callback throws `new Error('private https://secret.invalid')`, fresh replay has `token_count_reserved`, `token_count_failed/unknown`, `safe_error/unknown`, retained lock, and no private bytes; (c) LOW image callback throws an error with `status: 503`, fresh replay has token completion, LOW reserved/completed journal `http_5xx`, then image `safe_error/http_5xx`, one image reservation, no MEDIUM call, retained lock; (d) pre-seed and complete the token under a fixture lock, release it, then durable session rejects duplicate reservation, makes zero provider calls, appends a new `safe_error/unknown` after the old completion, and retains the new lock; (e) runtime-cast caller recorder and malformed case ID are rejected before canonical-root creation or callbacks; (f) a live-owner lock blocks the durable session before callbacks and preserves that lock. All provider callbacks are spies/fakes; no network clients exist in the test.
- [x] **Step 2: Witness RED.** Run `cd functions && npx vitest run test/nutrition-eval/calibration-preflight-durable-session.test.ts --reporter=dot` and direct ESLint on the new test. The absent durable export must cause the intended RED; fix fixture/type errors before source edits. Record exact results in `docs/implementation-status.md`.
- [x] **Step 3: Implement the minimal source.** Factor common validation for `baseDir`, identity, owner, callbacks, and case ID matching `^[A-Za-z0-9_-]{1,128}$` before file effects; this also rejects padding. Preserve `runCalibrationPreflightSession`'s required-recorder validation and injected callback. Validate the durable API before file effects and reject an own or inherited `recordSafeError` property at runtime. Use one private core that creates the file store and ledger, acquires its lock, chooses the recorder through a parameter after lock acquisition, runs the bridge/primitive, and releases only on success. The durable entry point passes `(ledger) => (entry) => ledger.recordSafeError(entry)`; the old entry point passes its required injected callback. Do not import Git, assets, SDK, or network modules into this session file.
- [x] **Step 4: Verify GREEN and old contract.** Run `cd functions && npx vitest run test/nutrition-eval/calibration-preflight-durable-session.test.ts test/nutrition-eval/calibration-preflight-session.test.ts test/nutrition-eval/calibration-preflight-ledger.test.ts test/nutrition-eval/calibration-safe-error-ledger.test.ts test/nutrition-eval/calibration-cli.test.ts --reporter=dot && npm run build && npm run lint`. Confirm the old missing-recorder test still rejects before file effects.
- [x] **Step 5: Verify bounded stage.** Run `cd functions && nice -n 10 npm test -- --reporter=dot`; then tracked/staged `git diff --check`, untracked test whitespace check, `git status --short`, and `sha256sum .mcp.json`. The earlier real-store ledger fsync-fault test and injected-recorder-failure test cover the two lower-layer halves; do not add a store-factory injection solely for an end-to-end fsync fault. Record that no live gate, Firebase, device, APK, or visual-diff action applies to this hermetic composition.
- [x] **Step 6: Review and checkpoint.** Obtain read-only Antigravity MCP post-review in the durable-session workstream with `approvalMode: yolo` and the mandatory no-write sentence; green requires literal `AGREEMENT_STATUS: agree` and `MUST_FIX: none`. Apply any must-fix through the authorized worker route and rerun verification. Update status; explicitly stage only the session source, new test, and status; commit `Bind preflight safe errors to ledger`, push `fix/scan-photo-flow-viewer`, verify local/remote equality, then mark plan checkboxes and record the exact commit/push in a docs-only follow-up.

## Execution Handoff

This task stops at a durable hermetic session. The later default CLI bootstrap must separately load and hash committed assets, check clean Functions Git identity and ADC quota/billing/API readiness, derive the owner, construct the exact Vertex client, and prove zero provider/client/file effects before all preflight gates. That later slice requires its own plan and review before implementation; nothing here authorizes live Stage 0 execution.
