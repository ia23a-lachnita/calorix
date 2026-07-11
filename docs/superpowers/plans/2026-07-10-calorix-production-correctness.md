# Calorix Production Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the verified production blockers in entry ownership, lifecycle, nutrition, goals, chat, and visual/capture evidence without regressing the scan-first flow.

**Architecture:** Move security-sensitive input and lifecycle ownership to server-authoritative contracts. Functions derive image ownership from document identity, atomically claim analysis attempts, and calculate aggregates from canonical base nutrition. Flutter becomes a uid-scoped consumer of durable plans, threads, and explicit terminal entry states. Legacy reads remain compatible until an approved migration removes them.

**Tech Stack:** Flutter/Dart with Riverpod, Firebase Auth/Firestore/Storage/Functions v2, TypeScript/Vitest, Firebase Emulator Suite, FVM, existing ui-diff/runtime capture workflow.

## Global Constraints

- Use `fvm flutter` and `fvm dart` for Flutter/Dart commands.
- Do not deploy, mutate production data, run a production backfill, or remove legacy data without explicit user confirmation.
- Do not restore, delete, or overwrite unrelated untracked files.
- Use the exact canonical scan object `scans/{uid}/{entryId}.jpg`; no server-side URL fetch fallback is permitted.
- Terminal entry states are `complete`, `needs_review`, and `error`; only `complete` contributes to daily logs.
- The dispatcher claims an attempt transactionally and a worker finalizes only in a transaction where the entry still exists, is `processing`, and has the matching `processingAttemptId`; dispatcher recursion guards ignore its own claim, recovery, and worker writes.
- Retry is callable-only: its transaction combines source-state/ownership eligibility, retry cap, cooldown, metadata update, and the transition to `pending`. A bounded server recovery changes stale `processing` to terminal `error`, never directly to `pending`.
- Canonical nutrition is finite double-precision `base*`; displayed and aggregate nutrition are `base* x servingMultiplier` exactly once, with rounding only in presentation.
- Chat data and state must be scoped to authenticated uid and server-authored thread/message records.
- Each task starts red, adds the smallest implementation needed for green, updates documentation/status for its stage, commits one focused imperative message, and pushes only when execution is authorized. This planning task intentionally does none of those commits or pushes.

---

## File Map

| Area | Likely files | Responsibility |
|---|---|---|
| Entry contract | `functions/src/entry-contract.ts` (new), `functions/src/analyze-entry.ts`, `functions/src/index.ts`, `functions/test/entry-contract.test.ts` (new), `functions/test/analyze-entry.test.ts` | Canonical path, state transitions, attempt claim/finalization, bounded stale-processing recovery, safe errors. |
| Rules | `firestore.rules`, `storage.rules`, `functions/test-rules/firestore-rules.test.ts` | Owner-only, field allowlists, retry restriction, target and thread validation. |
| Nutrition | `functions/src/nutrition.ts`, `functions/src/aggregation.ts`, `functions/test/nutrition.test.ts`, `functions/test/aggregation.test.ts`, `lib/shared/models/food_entry.dart`, `lib/features/food_detail/*`, `lib/shared/services/seed_data_service.dart` | Base/scaled compatibility and single scaling. |
| Entry UX | `lib/shared/repositories/food_entry_repository.dart`, `lib/features/processing/*`, `lib/core/router/*`, `lib/features/review/*` (new), `test/food_detail_sheet_test.dart`, `test/processing_screen_test.dart` (new) | Review completion, retry, terminal routes. |
| Goals | `lib/shared/repositories/macro_target_repository.dart`, `lib/shared/providers/plan_provider.dart`, `lib/features/goals/*`, `lib/shared/models/macro_target_plan.dart`, `test/goals_screen_test.dart` | Persisted active plan and uid/plan-scoped drafts. |
| Chat | `functions/src/ai-chat.ts`, `functions/src/index.ts`, `functions/test/ai-chat.test.ts`, `lib/shared/services/ai_chat_service.dart`, `lib/features/ai_chat/*`, `test/ai_chat_screen_test.dart` | Server-built context, durable threads, serialized sends. |
| Recovery/capture | `lib/features/scan/*`, `lib/shared/services/camera_service.dart`, `lib/shared/providers/notification_provider.dart`, `lib/shared/services/notification_service.dart`, `lib/core/system/system_ui.dart`, `lib/core/router/app_router.dart`, tests | Recoverable camera/library/notification/reseed/theme paths. |
| Visual assets | `docs/design-handoff/placeholder-app/reference-images/` (restore), `docs/design-handoff/placeholder-app/reference-images-manifest.json` (new), handoff README, `docs/ui-diff/flutter-anchors.md` | Canonical reference source and reproducible capture evidence. |

## Stage 0: Baseline And Review Gate

**Files:**
- Modify: `docs/implementation-status.md` only if it exists when execution begins; otherwise update the active plan status section minimally.
- Read: `AGENTS.md`, `requirements.md`, `docs/design-handoff/placeholder-app/README.md`, `.claude/design.md`, this spec, this plan, and `docs/audits/2026-07-10-fable-session-review.md`.

- [ ] **Step 1: Record the starting state without normalizing the working tree.**
  Run: `git status --short; git log -1 --oneline`
  Expected: capture pre-existing untracked artifacts verbatim; do not add them to a commit.

- [ ] **Step 2: Run the exact baseline suites.**
  Run: `fvm flutter analyze; fvm flutter test; Push-Location functions; npm run lint; npm run build; npm test; npm run test:rules; Pop-Location`
  Expected: results are recorded as baseline evidence, including any failure; do not call a failed baseline a regression.

- [ ] **Step 3: Request the required pre-implementation review.**
  Use Antigravity MCP with `model: "gemini-3.1-pro-preview"`, `approvalMode: "yolo"`, and a persistent conversation id. State exactly: `Do not edit files, do not run write commands, and do not mutate the repository; only inspect, reason, review, and propose changes for the main agent to apply.`
  Expected: before implementation begins, retain the response and address every `MUST_FIX`; green requires `AGREEMENT_STATUS: agree` and `MUST_FIX: none`.

## Stage 1A: Restore Canonical Reference Evidence Independently

This evidence stage starts after the baseline and may run in parallel with Stage 1 security work. It is a prerequisite only for cross-repository visual gates; it must not delay the entry trust-boundary implementation.

### Task 0: Restore the canonical reference image set reproducibly

**Files:**
- Restore: `docs/design-handoff/placeholder-app/reference-images/*` from the pre-rename tree before `86b4858`
- Create: `docs/design-handoff/placeholder-app/reference-images-manifest.json`
- Create: `test/reference_images_manifest_test.dart` or a small checked-in validation script appropriate to the existing toolchain

- [ ] **Step 1: Write a failing manifest validator.**
  Require every handoff screen/theme filename, 402x874 dimensions, the recorded source commit, and SHA-256 matching the manifest. The validator must fail when the canonical directory is absent or a `good-screenshots` file is substituted.

- [ ] **Step 2: Run red.**
  Run: `fvm flutter test test/reference_images_manifest_test.dart` or the documented manifest command.
  Expected: FAIL because `reference-images/` is missing.

- [ ] **Step 3: Restore without destroying evidence.**
  Recover the complete original directory from Git history, retain `reference-images-buggy/`, and generate the manifest from the restored files. This task does not run a cross-repository visual gate.

- [ ] **Step 4: Verify the reference contract.**
  Run: manifest validator; `git diff --check`
  Expected: PASS, with no binary replacement of historical buggy assets.

- [ ] **Step 5: Commit the independent evidence stage during execution.**
  Commit: `git commit -m "Restore canonical reference evidence"`
  Push only after verification and status tracking are updated.

## Stage 1: Define And Enforce The Entry Trust Boundary

### Task 1: Introduce a shared entry contract

**Files:**
- Create: `functions/src/entry-contract.ts`
- Create: `functions/test/entry-contract.test.ts`
- Modify: `functions/src/analyze-entry.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Produces `canonicalScanPath(uid: string, entryId: string): string` returning `scans/${uid}/${entryId}.jpg`.
- Produces `isEligibleAnalysisTransition(before, after): boolean` for new pending entries and server-authorized retries.
- Produces `safeEntryFailure(error): { errorCode: string; errorMessage: string }` with no URL, stack, raw provider body, or bucket name.

- [ ] **Step 1: Write failing contract tests.**
  Add assertions that a canonical path is identity-derived, that a forged path/URL cannot change it, and that only `missing -> pending` and callable-authored `error -> pending` are dispatcher-eligible. Add negative cases for the dispatcher's own `pending -> processing`, worker terminal writes, and stale-processing recovery writes.

  ```ts
  expect(canonicalScanPath('u-a', 'e-1')).toBe('scans/u-a/e-1.jpg');
  expect(isEligibleAnalysisTransition({ status: 'error' }, { status: 'pending' })).toBe(true);
  expect(isEligibleAnalysisTransition({ status: 'complete' }, { status: 'pending' })).toBe(false);
  ```

- [ ] **Step 2: Run the focused red test.**
  Run: `Push-Location functions; npx vitest run test/entry-contract.test.ts; Pop-Location`
  Expected: FAIL because the contract module does not exist.

- [ ] **Step 3: Implement the pure contract only.**
  Keep it independent of Firebase Admin so path/state/error behavior is unit-testable. Replace `EntryData.imageUrl` use in `analyze-entry.ts` with an identity-bound entry reference and safe structured failure fields.

- [ ] **Step 4: Verify green and typecheck.**
  Run: `Push-Location functions; npx vitest run test/entry-contract.test.ts test/analyze-entry.test.ts; npm run build; Pop-Location`
  Expected: PASS.

### Task 2: Remove arbitrary Admin Storage and URL fetch inputs

**Files:**
- Modify: `functions/src/index.ts`
- Modify: `functions/test/analyze-entry.test.ts`
- Modify: `functions/test/entry-contract.test.ts`
- Modify: `lib/shared/services/upload_queue_service.dart`
- Modify: `lib/features/food_detail/providers/food_detail_providers.dart`
- Modify: `lib/shared/models/food_entry.dart`

**Interfaces:**
- `loadImageBase64(uid, entryId)` uses `canonicalScanPath` and only the configured default bucket.
- New capture writes omit `imageUrl`; display resolves the path from `FoodEntry.canonicalStoragePath`.

- [ ] **Step 1: Write failing tests for forbidden fallbacks.**
  Mock Storage and `global.fetch`; assert a forged document `storagePath` is ignored, `fetch` is never called, and a missing canonical object produces `errorCode: 'image_unavailable'`.

- [ ] **Step 2: Run the focused red test.**
  Run: `Push-Location functions; npx vitest run test/entry-contract.test.ts test/analyze-entry.test.ts; Pop-Location`
  Expected: FAIL while `index.ts` reads document fields and calls `fetch`.

- [ ] **Step 3: Implement the server-derived download and Flutter compatibility read.**
  Delete the Function URL fallback. Have upload write the canonical object then the pending document without `imageUrl`; keep `FoodEntry.fromFirestore` able to read legacy `imageUrl` for UI display only until migration removal.

- [ ] **Step 4: Verify owner display behavior stays functional.**
  Run: `fvm flutter test test/food_detail_sheet_test.dart; Push-Location functions; npx vitest run test/analyze-entry.test.ts test/entry-contract.test.ts; Pop-Location`
  Expected: PASS.

### Task 3: Tighten Firestore and Storage rules with regression tests

**Files:**
- Modify: `firestore.rules`
- Modify: `storage.rules`
- Modify: `functions/test-rules/firestore-rules.test.ts`
- Modify: `functions/package.json` only if the existing rules test command needs Storage Emulator coverage.

- [ ] **Step 1: Add failing rule tests.**
  Cover: foreign user cannot read/write an entry/object; a pending create cannot name another uid's path; client cannot write `imageUrl`, `analysisModel`, error fields, retry metadata, or server review result; client cannot edit nutrition or `servingMultiplier` while the current entry is `pending` or `processing`; malformed target/weight writes are denied; owner reads but cannot write chat records.

- [ ] **Step 2: Run rules tests red.**
  Run: `Push-Location functions; npm run test:rules; Pop-Location`
  Expected: FAIL for currently accepted forged document fields and client-writable chat records.

- [ ] **Step 3: Implement least-privilege rules.**
  Use key allowlists plus field-specific invariants, require canonical `storagePath` only if supplied, enforce JPEG and size limits in Storage rules, and keep generated daily logs/model config/catalog server-only.

- [ ] **Step 4: Run focused rules and source checks.**
  Run: `Push-Location functions; npm run test:rules; npm run lint; Pop-Location`
  Expected: PASS.

- [ ] **Step 5: Commit the security stage during execution.**
  Commit: `git commit -m "Secure entry image ownership"`
  Include contract, Function, Flutter writer/reader, rules, tests, and status update. Push only after the commit succeeds.

## Stage 2: Make Retry And Terminal State Handling Correct

### Task 4: Replace create-only processing with an atomic pending claim and token-guarded finalization

**Files:**
- Modify: `functions/src/index.ts`
- Modify: `functions/src/analyze-entry.ts`
- Modify: `functions/src/entry-contract.ts`
- Modify: `functions/test/analyze-entry.test.ts`
- Create: `functions/test/process-entry-dispatch.test.ts`

**Interfaces:**
- `claimPendingAttempt(entryRef, attemptId): Promise<'claimed' | 'not_pending'>` runs in a transaction, verifies the entry still exists and is `pending`, then sets `status: 'processing'`, `processingAttemptId`, and server `processingStartedAt`.
- `finalizeProcessingAttempt(entryRef, attemptId, terminalPatch): Promise<'finalized' | 'missing' | 'stale'>` runs in a transaction and writes only when the current document still exists, remains `processing`, and has the matching `processingAttemptId`.
- `handleEntryAttempt(entryId, entry, attemptId, deps)` calls the finalizer and treats `missing` and `stale` as no-op terminal outcomes.

- [ ] **Step 1: Write dispatch and finalization tests first.**
  Test creation and retry delivery, duplicate invocations, and server status writes that must not redispatch. Add exact red tests named `stale worker finalization`, where an old worker token cannot finalize a newer attempt, and `deletion after claim`, where deletion before finalization returns `missing` and does not recreate the document.

- [ ] **Step 2: Run red.**
  Run: `Push-Location functions; npx vitest run test/process-entry-dispatch.test.ts test/analyze-entry.test.ts; Pop-Location`
  Expected: FAIL because `processEntry` is `onDocumentCreated` and has no claim token.

- [ ] **Step 3: Implement `onDocumentWritten` eligibility, transaction claim, and token-guarded finalization.**
  Do not use an unconditional on-write handler. Check only the eligible before/after transitions, claim `pending -> processing` transactionally, persist `processingAttemptId` and `processingStartedAt`, and finalize only through the matching-token transaction. Recursion guards must exit for the claim write, recovery writes, and worker terminal writes.

- [ ] **Step 4: Verify focused green.**
  Run: `Push-Location functions; npx vitest run test/process-entry-dispatch.test.ts test/analyze-entry.test.ts; npm run build; Pop-Location`
  Expected: PASS.

### Task 5: Add a server-authorized retry API, bounded stuck recovery, and safe terminal errors

**Files:**
- Modify: `functions/src/index.ts`
- Modify: `functions/src/entry-contract.ts`
- Create: `functions/test/retry-entry.test.ts`
- Create: `functions/test/stuck-recovery.test.ts`
- Modify: `firestore.rules`
- Modify: `functions/test-rules/firestore-rules.test.ts`
- Modify: `lib/shared/repositories/food_entry_repository.dart`
- Modify: `lib/features/processing/processing_screen.dart`
- Create: `test/processing_screen_test.dart`

**Interfaces:**
- Callable `retryEntry({ entryId: string }): { status: 'pending'; retryCount: number }`.
- Scheduled `recoverStuckEntries()` processes no more than `MAX_STUCK_RECOVERY_BATCH` entries per run and changes only still-current `processing` entries older than `PROCESSING_SAFETY_THRESHOLD_MS` to `error` with `errorCode: 'processing_timeout'`.
- Repository `retryEntry(String uid, String id): Future<void>` calls the callable, not `update({status: 'pending'})`.

- [ ] **Step 1: Write failing server and widget tests.**
  Assert unauthorized, foreign, repeated, cooldown, deleted, and cap-exhausted retries fail; an eligible error becomes pending once; and the Processing retry button invokes the repository, disables while waiting, and presents the returned pending state. Add the exact red test `concurrent retry`: two simultaneous calls must yield one transition and one retry-count increment because eligibility, cooldown, cap, retry metadata, and the transition to `pending` share one transaction. Add the exact red test `stuck threshold`: a bounded scheduled recovery changes an entry only when its server `processingStartedAt` is strictly older than `PROCESSING_SAFETY_THRESHOLD_MS`, preserves a current/newer finalization, and emits `processing_timeout`.

- [ ] **Step 2: Run red.**
  Run: `Push-Location functions; npx vitest run test/retry-entry.test.ts test/stuck-recovery.test.ts; Pop-Location; fvm flutter test test/processing_screen_test.dart`
  Expected: FAIL because no callable or bounded recovery exists and the current callback is empty.

- [ ] **Step 3: Implement retry limits, bounded recovery, and structured errors.**
  In one retry transaction, require document existence and uid ownership, `error` source status, a documented cap (initially three attempts), and a documented cooldown before storing retry metadata, clearing stale failure display fields, and setting `pending`. Implement a scheduled, transaction-guarded recovery with documented `PROCESSING_SAFETY_THRESHOLD_MS` and `MAX_STUCK_RECOVERY_BATCH`; it may set only stale `processing` to terminal `error`, never `pending`. Remove the client rule that directly permits `error -> pending`.

- [ ] **Step 4: Verify behavior and rules.**
  Run: `Push-Location functions; npx vitest run test/retry-entry.test.ts test/stuck-recovery.test.ts; npm run test:rules; Pop-Location; fvm flutter test test/processing_screen_test.dart`
  Expected: PASS.

### Task 6: Route every terminal status and complete low-confidence review

**Files:**
- Create: `lib/features/review/review_screen.dart`
- Create: `lib/features/review/providers/review_providers.dart` only if separate review state is required
- Modify: `lib/core/router/app_router.dart`
- Modify: `lib/core/router/route_names.dart`
- Modify: `lib/features/processing/processing_screen.dart`
- Modify: `lib/shared/repositories/food_entry_repository.dart`
- Modify: `lib/features/food_detail/food_detail_sheet.dart`
- Modify: `test/food_detail_sheet_test.dart`
- Modify: `test/processing_screen_test.dart`

- [ ] **Step 1: Write failing widget tests.**
  Verify `needs_review` leaves Processing for Review, `complete` opens result/Today, `error` has retry, and saving an edited `needs_review` entry makes exactly one repository call containing both nutrition edits and `status: 'complete'`.

- [ ] **Step 2: Run red.**
  Run: `fvm flutter test test/processing_screen_test.dart test/food_detail_sheet_test.dart`
  Expected: FAIL because `needs_review` renders the skeleton and `_save` never changes status.

- [ ] **Step 3: Implement status-aware routing and atomic review save.**
  Add a named Review route. Guard navigation so stream rebuilds do not push repeatedly. Add a repository method that atomically merges edits, `corrected: true`, and `status: complete` only from a reviewed source; keep normal complete edits unchanged.

- [ ] **Step 4: Verify green.**
  Run: `fvm flutter test test/processing_screen_test.dart test/food_detail_sheet_test.dart test/scan_screen_test.dart`
  Expected: PASS.

- [ ] **Step 5: Commit the lifecycle stage during execution.**
  Commit: `git commit -m "Correct entry retry and review flow"`
  Push only after focused suites and status tracking are updated.

## Stage 3: Establish One Nutrition Unit System

### Task 7: Add base-nutrition compatibility and aggregation invariants

**Files:**
- Modify: `functions/src/nutrition.ts`
- Modify: `functions/src/analyze-entry.ts`
- Modify: `functions/src/aggregation.ts`
- Modify: `functions/test/nutrition.test.ts`
- Modify: `functions/test/aggregation.test.ts`
- Modify: `lib/shared/models/food_entry.dart`
- Modify: `lib/shared/models/daily_log.dart` only if naming requires it

**Interfaces:**
- `NutritionResult` persists `baseKcal`, `baseProtein`, `baseCarbs`, `baseFat` as finite doubles.
- `FoodEntry.baseKcal` falls back to legacy `kcal`; `FoodEntry.scaledKcal == baseKcal * servingMultiplier`.
- `summarizeCompleteEntries` accepts canonical base fields and legacy fallback fields, never a pre-scaled total.

- [ ] **Step 1: Write failing invariants.**
  Test legacy read fallback, a 2x serving, a multiplier-only edit, a base-edit at 2x, a reviewed entry, and a duplicate all result in the same displayed and aggregate totals. Include a regression where `kcal: 100, multiplier: 2` sums to 200, not 400. Add the exact red test `nutrition precision round trip`: persist non-integer finite double base values, scale and edit at a multiplier, serialize/read them back, and assert the canonical bases and aggregate use unrounded values within double-precision tolerance; only the UI formatter may round.

- [ ] **Step 2: Run red.**
  Run: `Push-Location functions; npx vitest run test/nutrition.test.ts test/aggregation.test.ts; Pop-Location; fvm flutter test test/food_detail_sheet_test.dart`
  Expected: FAIL while `kcal` is ambiguous and both UI/aggregation own multiplication independently.

- [ ] **Step 3: Implement canonical base fields and fallbacks.**
  Update worker/manual/seed/duplicate writes to new finite-double fields, retain read fallback only, and centralize scale helpers plus UI-only presentation-format helpers. Do not round storage, conversion, or aggregation values, and do not backfill production data in this task.

- [ ] **Step 4: Verify green.**
  Run: `Push-Location functions; npx vitest run test/nutrition.test.ts test/aggregation.test.ts test/analyze-entry.test.ts; Pop-Location; fvm flutter test test/food_detail_sheet_test.dart test/today_providers_test.dart`
  Expected: PASS.

### Task 8: Convert edit behavior and validate canonical writes

**Files:**
- Modify: `lib/features/food_detail/food_detail_sheet.dart`
- Modify: `lib/features/food_detail/providers/food_detail_providers.dart`
- Modify: `lib/shared/repositories/food_entry_repository.dart`
- Modify: `lib/shared/services/seed_data_service.dart`
- Modify: `firestore.rules`
- Modify: `functions/test-rules/firestore-rules.test.ts`
- Modify: `test/food_detail_sheet_test.dart`

- [ ] **Step 1: Add failing edit and rule tests.**
  Assert fields shown in the sheet are scaled totals, save converts totals to base at the selected multiplier, a multiplier-only save leaves bases unchanged, and malformed/out-of-range base or multiplier writes are denied.

- [ ] **Step 2: Run red.**
  Run: `fvm flutter test test/food_detail_sheet_test.dart; Push-Location functions; npm run test:rules; Pop-Location`
  Expected: FAIL under current direct field persistence and permissive multiplier rules.

- [ ] **Step 3: Implement conversion at the repository boundary.**
  Keep presentation controls in display units; make `PendingEdits` represent explicit display/base intent rather than ambiguous fields. Validate multiplier step/range in Dart and rules. Update seed fixture data to canonical base fields while preserving its intentional visual-only Today override.

- [ ] **Step 4: Verify focused suites.**
  Run: `fvm flutter test test/food_detail_sheet_test.dart test/today_providers_test.dart; Push-Location functions; npm run test:rules; npm test; Pop-Location`
  Expected: PASS.

- [ ] **Step 5: Commit the nutrition stage during execution.**
  Commit: `git commit -m "Define canonical nutrition units"`

## Stage 4: Persist Goals And Scope Chat To The Authenticated User

### Task 9: Make the active plan durable and provider state uid/plan scoped

**Files:**
- Modify: `lib/shared/repositories/macro_target_repository.dart`
- Modify: `lib/shared/providers/plan_provider.dart`
- Modify: `lib/features/goals/providers/goals_providers.dart`
- Modify: `lib/features/goals/goals_screen.dart`
- Modify: `lib/shared/models/macro_target_plan.dart`
- Modify: `firestore.rules`
- Modify: `functions/test-rules/firestore-rules.test.ts`
- Modify: `test/goals_screen_test.dart`
- Create: `test/plan_provider_test.dart`

**Interfaces:**
- `ensureActivePlan(uid): Future<MacroTargetPlan>` creates or returns exactly one active persisted plan.
- `activePlanProvider` reports signed-out/loading/no-plan explicitly and never substitutes a durable plan with a process-local default.
- `macroSplitProvider` is keyed by uid and active plan id.

- [ ] **Step 1: Write failing tests.**
  Cover first authenticated visit persisting one plan, restart reading it, plan switch resetting the draft, auth switch not inheriting prior macro draft, and Goals omitting fabricated TDEE/BMR/80 kg values.

- [ ] **Step 2: Run red.**
  Run: `fvm flutter test test/goals_screen_test.dart test/plan_provider_test.dart; Push-Location functions; npm run test:rules; Pop-Location`
  Expected: FAIL because the provider falls back to `defaultPlan` and draft state is global.

- [ ] **Step 3: Implement durable initialization and save actions.**
  Use a transaction to establish one active plan. Persist body goal and macro changes through the repository; initialize a provider draft after plan resolution; remove static coaching anchors until a validated profile exists.

- [ ] **Step 4: Verify green.**
  Run: `fvm flutter test test/goals_screen_test.dart test/plan_provider_test.dart; Push-Location functions; npm run test:rules; Pop-Location`
  Expected: PASS.

### Task 10: Make chat context server-derived and threads durable

**Files:**
- Modify: `functions/src/ai-chat.ts`
- Modify: `functions/src/index.ts`
- Modify: `functions/test/ai-chat.test.ts`
- Create: `functions/test/ai-chat-thread.test.ts`
- Modify: `firestore.rules`
- Modify: `functions/test-rules/firestore-rules.test.ts`
- Modify: `lib/shared/services/ai_chat_service.dart`
- Modify: `lib/features/ai_chat/providers/ai_chat_providers.dart`
- Modify: `lib/features/ai_chat/ai_chat_screen.dart`
- Modify: `test/ai_chat_screen_test.dart`

**Interfaces:**
- Callable input: `{ message: string, threadId?: string, entryId?: string, requestId: string }`.
- Callable output: `{ threadId: string, reply: string, assistantMessageId: string }`.
- Function loads plan, daily log, owned entry context, and recent messages using `request.auth.uid`.

- [ ] **Step 1: Write failing function/rules/widget tests.**
  Assert client-supplied plan/consumed/history are rejected or ignored; a foreign thread/entry cannot be read; messages are stored only for the caller; a repeated request id is idempotent; and two rapid composer taps produce one accepted send while the control is busy.

- [ ] **Step 2: Run red.**
  Run: `Push-Location functions; npx vitest run test/ai-chat.test.ts test/ai-chat-thread.test.ts; npm run test:rules; Pop-Location; fvm flutter test test/ai_chat_screen_test.dart`
  Expected: FAIL because the current callable trusts client context and Flutter holds a global in-memory list.

- [ ] **Step 3: Implement server persistence and uid/thread providers.**
  Build context from Admin Firestore, append user/assistant turns server-side with timestamps and request id, deny direct thread/message writes, stream owner-readable threads/messages in Flutter, and serialize sends per selected thread. Preserve confirmation-card behavior but apply actions only to the persisted active plan.

- [ ] **Step 4: Verify green.**
  Run: `Push-Location functions; npx vitest run test/ai-chat.test.ts test/ai-chat-thread.test.ts; npm run test:rules; Pop-Location; fvm flutter test test/ai_chat_screen_test.dart test/goals_screen_test.dart`
  Expected: PASS.

- [ ] **Step 5: Commit the persistence stage during execution.**
  Commit: `git commit -m "Persist user goals and chat context"`

## Stage 5: Prepare Cross-Repository Visual Evidence And Repair Secondary UX

### Task 11: Update handoff links and prepare the restored manifest for cross-repository visual gates

**Files:**
- Modify: `docs/design-handoff/placeholder-app/README.md`
- Modify: `.claude/design.md`
- Modify: `docs/ui-diff/flutter-anchors.md`

- [ ] **Step 1: Update references to the previously restored canonical image set.**
  Correct all handoff and capture-documentation paths to `reference-images/`, retain the historical `reference-images-buggy/` evidence, and state that the manifest created in Stage 1A is required for cross-repository visual capture.

- [ ] **Step 2: Re-verify the reference contract before the cross-repository gate.**
  Run: manifest validator; `git diff --check`
  Expected: PASS. This confirms the earlier evidence is intact; it does not repeat restoration or postpone security work.

### Task 12: Harden camera, library, notification, history, reseed, and theme capture paths

**Files:**
- Modify: `lib/features/scan/scan_screen.dart`
- Modify: `lib/features/scan/providers/scan_providers.dart`
- Modify: `lib/shared/services/camera_service.dart`
- Modify: `lib/shared/providers/notification_provider.dart`
- Modify: `lib/shared/services/notification_service.dart`
- Modify: `lib/features/history/history_screen.dart`
- Modify: `lib/features/history/history_day_screen.dart`
- Modify: `lib/core/router/app_router.dart`
- Modify: `lib/core/system/system_ui.dart`
- Modify: `test/scan_screen_test.dart`
- Modify: `test/history_screen_test.dart`
- Modify: `test/debug_reseed_test.dart`
- Modify: `test/onboarding_test.dart` only when notification preference UI is owned there

- [ ] **Step 1: Add failing focused tests.**
  Cover camera denied/unavailable, lifecycle resume, take-picture exception, gallery cancel/error, capture state reset, persisted notification preference, History row drilldown, reseed failure surface, and explicit light/dark system overlay selection.

- [ ] **Step 2: Run red.**
  Run: `fvm flutter test test/scan_screen_test.dart test/history_screen_test.dart test/debug_reseed_test.dart test/onboarding_test.dart`
  Expected: FAIL for current silent or nonterminal paths.

- [ ] **Step 3: Implement bounded recoveries.**
  Ensure every capture failure ends in idle with a visible fallback, lifecycle dispose/reinitialize is safe, notification opt-in persists per uid and does not misrepresent OS permission state, History opens the selected date, reseed routes to a terminal debug error on failure, and system bars follow the forced capture theme.

- [ ] **Step 4: Verify focused green and device behavior.**
  Run: `fvm flutter test test/scan_screen_test.dart test/history_screen_test.dart test/debug_reseed_test.dart test/onboarding_test.dart`
  Expected: PASS.
  Device checklist: deny camera, revoke/regrant permission, background/resume while camera is open, cancel library picker, force capture error, toggle notifications/restart, open History day, invoke debug reseed in both themes.

- [ ] **Step 5: Commit the recovery/evidence stage during execution.**
  Commit: `git commit -m "Restore capture evidence and recovery paths"`

## Stage 6: Emulator Lifecycle, Migration Evidence, And Release Gates

### Task 13: Add end-to-end emulator coverage and migration reporting

**Files:**
- Create: `functions/test/integration/entry-lifecycle.integration.test.ts`
- Create: `functions/scripts/report-entry-contract-migration.ts`
- Modify: `functions/package.json`
- Modify: `docs/implementation-status.md` if present, otherwise this plan's progress section
- Create: `docs/release/2026-07-10-production-correctness-verification.md` during execution

- [ ] **Step 1: Write failing emulator cases.**
  Cover canonical object ownership/no URL fetch, create -> complete, create -> needs_review -> reviewed complete, token-guarded stale-worker and deletion finalization no-ops, stale-processing timeout -> error -> callable retry -> complete, duplicate retry delivery, concurrent retry protection, unrounded multiplier aggregation and precision round trip, foreign chat/entry rejection, and legacy nutrition read. Stub model and Storage responses deterministically.

- [ ] **Step 2: Add an explicit integration command and run it red.**
  Add `test:integration` in `functions/package.json` using `firebase emulators:exec` with the required Firestore/Storage/Functions emulators.
  Run: `Push-Location functions; npm run test:integration; Pop-Location`
  Expected: FAIL until lifecycle wiring exists.

- [ ] **Step 3: Implement only missing test harness seams.**
  Keep all model calls mocked and all emulator data isolated. Add a dry-run-only migration reporter that outputs counts and never writes unless a future separately approved command is added.

- [ ] **Step 4: Run full local release gate.**
  Run:

  ```powershell
  fvm flutter analyze
  fvm flutter test
  Push-Location functions
  npm run lint
  npm run build
  npm test
  npm run test:rules
  npm run test:integration
  Pop-Location
  ```

  Expected: all commands PASS. Record exact counts and failures; do not claim a clean release gate if a command is skipped.

- [ ] **Step 5: Execute runtime and visual gates.**
  Use the restored reference manifest and `docs/ui-diff/flutter-anchors.md` to capture Today in forced dark and light modes. Run the device checklist from Task 12 and record route, device, reference hash, reseed result, and every inspected artifact. State whether visual validation was exhaustive, sampled, or delegated.

- [ ] **Step 6: Obtain final external review.**
  Continue the Stage 0 Antigravity MCP conversation with the completed diff, test results, migration-report output, and visual artifacts. The result is green only with `AGREEMENT_STATUS: agree` and `MUST_FIX: none`; otherwise create a follow-up task, fix it, and re-review.

- [ ] **Step 7: Commit and push only after all required gates.**
  Commit: `git commit -m "Verify production correctness gates"`
  Push the current branch after a successful commit. Do not deploy or run the production migration without a new explicit user confirmation.

## Execution Handoff

The next executor should begin at Stage 0, preserve all pre-existing untracked workspace artifacts, and update the persistent status record before writing production code. This plan intentionally separates rule/function changes from Flutter writer changes only at review boundaries; their release order is compatibility first, then tightening. No stage may claim production readiness until every listed local, emulator, runtime, visual, and Antigravity review gate has recorded evidence.
