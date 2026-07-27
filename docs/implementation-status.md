# Implementation Status — Complete Handoff Screens and Product Quality

Plan: docs/superpowers/plans/2026-07-17-complete-handoff-screens-product-quality.md
Baseline commit: f9f0d49174c81a23ec8cd7f6713a51da021422b2
Branch: main
Flutter command: fvm flutter
Flutter: 3.41.9 stable, Dart 3.11.5, DevTools 2.54.2
Functions scripts: test=vitest run, lint=eslint src test, build=tsc -p tsconfig.json, test:watch=vitest, test:rules=firebase emulators:exec --only firestore vitest rules config, deploy=out of scope
Preserved untracked artifacts (verified present at baseline): .claude/ui-diff-runs/, .gemini/settings.json.bak-20260517-220447, assets/calorix_icons/, docs/screenshots/today-screen-2026-06-17-adb-current.png, docs/screenshots/today-screen-2026-07-01-parity-fixes.png, docs/screenshots/today-screen-preflight-2026-06-05.png

## Toolchain Health (Task 0)

- `fvm flutter pub get`: succeeded; 82 newer incompatible package notices; no lockfile change.
- `fvm flutter analyze`: No issues found.
- `fvm flutter test`: 78 tests passed.
- `npm --prefix functions run build`: succeeded.
- Functions test script: `npm --prefix functions run test` → `vitest run`.

## Task ledger

| Task | Status | Worker used | Review gate | Commit | Evidence |
|---|---|---|---|---|---|
| 0 | done | host (bookkeeping) | n/a (bookkeeping) | cacca80 | toolchain health above |
| 1 | done | OpenCode (bounded edits); host orchestration | pre-implementation review (green) | 0242317 | Pre-cleanup comparison 12/12 total (A 6/6, B 6/6); analyzer clean from comparison stage; decision A; rationale A ~43 lines/native PageView vs B 186 custom recognizer lines; Antigravity conversation calorix-navigation-spike-20260717 green: AGREEMENT_STATUS agree, MUST_FIX none; first review's 3 must-fix applied; post-cleanup A-only focused test 6/6 passed; fvm flutter analyze clean; spike_shell_b.dart deleted; device/emulator safety restriction applies — see Task 1 note; commit 0242317 pushed to origin/main; focused test 6/6 passed; fvm flutter analyze: No issues found; runtime/device verification deliberately not performed — blocked by explicit user safety restriction |
| 2 | done | OpenCode; host orchestration | agree round 2 | bc3e420 | router wired to TabSwipeShell; appInitialLocation=/scan; profile entry uses pushNamed and closes to origin; Food Detail Ask AI uses pushNamed; real AiChatScreen has ai-close/ai-close-fallback semantics; spike production and test files removed; focused combined command passed 29/29; analyze clean; substage A+B+C via OpenCode; stage verification: fvm flutter analyze No issues found; first full test RED — one stale onboarding test expected LoadingScreen from production initial route, conflicting with approved appInitialLocation=/scan; fix: test explicitly navigates real router to RoutePaths.loading, preserving LoadingScreen-to-Login assertions and production cold-start invariant; focused onboarding test 7/7 passed; final full fvm flutter test 94/94 passed; Step 6 review gate round 1: Antigravity conversation calorix-task2-review-retry-20260718 returned AGREEMENT_STATUS disagree; MUST_FIX: cross-branch FoodDetail pushNamed(aiChat) targets inactive AI branch; old visibility tests could pass on offstage widgets; SHOULD_FIX: exact production topology test using real TabSwipeShell; remediation implemented (RED: new test/router/ai_origin_topology_test.dart failed only because RouteNames.aiChatOverlay and RoutePaths.aiChatOverlay were missing; GREEN: persistent AI tab remains /ai; new root overlay /assistant named aiChatOverlay with root navigator; Food Detail pushes overlay with mealId; close pops exact origin; direct AI root falls back to Scan; old assistant visibility assertions use hitTestable); focused test command over ai_origin_topology, origin_return, ai_chat_screen, food_detail_sheet: 19/19 passed; fvm flutter analyze No issues found; Step 6 review gate round 2: same Antigravity conversation returned AGREEMENT_STATUS agree, MUST_FIX none, SHOULD_FIX none; fvm flutter analyze No issues found; fvm flutter test 98/98 passed; commit bc3e420 pushed to origin/main |
| 3 | done | host orchestration; delegated editors with recorded fallback | post-implementation review agree; MUST_FIX none | a2272d0, a54a8ba | Stage A and Stage B pushed; analyzer clean; core 79/79; full 177/177; no device/emulator |
| 4 | done | OpenCode unavailable; approved headless fallback unavailable; host fallback under contract | post-review green round 2; MUST_FIX none | 2365d63, 4cf8bbe | Motion/a11y implementation and semantic remediation pushed; analyzer clean; full 189/189; paint isolation proven host-side; real raster timing explicitly blocked; no device/emulator |
| 5 | done | OpenCode stalled twice; Claude unavailable; host fallback under contract | pre-review Pro green; post-review Flash High green after Pro/MCP timeouts | 12fde03, 6f9dc08, 3f3b7a5, 465db93 | RED/GREEN complete; analyzer clean; full 198/198; deterministic plan-only and physical two-screen smoke passed; exact evidence below |
| 6 | done | OpenCode timed out (904s, zero edits); delegated fallback left usable edits; host completed physical-device debugging and verification | pre- and post-implementation review agree (`calorix-task6-scan-permission-20260718`) | a130f2d | 226/226 tests; analyzer clean; physical permission/settings/live-preview/library/harness flow passed on `R58R61161NA`; real production-cloud upload intentionally not invoked |
| 7 | done | OpenCode/Claude/delegated workers unavailable or stalled; host fallback after recorded exhaustion | final review green (`calorix-task7-final-review-20260722`) | 072e21b, db4cff0, e972112, cdfd127, 098c02f, a59f962 | full analyzer clean; full Flutter 284/284; processing 58/58; functions 46/46; TypeScript build clean; real background-kill, push delivery, and Firestore-emulator transaction evidence remain owned by Task 16 |
| 8 | done | OpenCode headless stalled ~3 minutes with zero edits; host fallback under recorded contract | pre-review green round 2 and post-review green (`calorix-task8-review-manual-20260722`) | aaa8ebc | RED confirmed missing screens/contracts; GREEN: 14 targeted tests, permission 6/6, full analyzer clean, full Flutter 293/293; post-review `agree`, `MUST_FIX: none`, `SHOULD_FIX: none` |
| 9 | done | OpenCode stalled with zero edits; host fallback under contract | pre- and post-review green (`calorix-task9-analysis-contracts-20260722`) | 49bcffc, f695371, 5c8d3fb | backend 51/51; Flutter 294/294 plus 1 intentional live skip; analyzer/lint/build clean; OFF v3 live and full emulator gates pass |
| 10 | done | OpenCode RED worker stalled with zero edits; host fallback | pre-review green round 2 and post-review green (`calorix-task10-food-crud-20260722`) | 01264d8, a94cb5d, 1b9f3de, f2a1190, 94785a5, 4caaa9d, 34e3310 | analyzer clean; Flutter 313 passed + 1 intentional live skip; Functions 52/52 with lint/build clean; rules 14/14; focused Food Detail 21/21 |
| 11 | done | OpenCode unavailable; host fallback under contract | pre- and post-review green (`calorix-task11-today-truth-20260722`) | 61db8c6 | focused Today 26/26; analyzer clean; full Flutter 319 passed + 1 intentional live skip |
| 12 | done | OpenCode timed out with partial RED file; host completed under contract | pre- and post-review green (`calorix-task12-history-time-travel-20260722`) | 096e2e0 | focused History 28/28; analyzer clean; full Flutter 340 passed + 1 intentional live skip |
| 13 | done | OpenCode timed out; host fallback under contract | pre- and post-review green (`calorix-task13-goals-persistence-20260722`) | 1adad69, 2ceab96 | focused Goals 17/17; analyzer clean; full Flutter 354 passed + 1 intentional live skip |
| 14 | done | OpenCode timed out; headless fallback quota-blocked; host fallback under contract | pre- and post-review green (`calorix-task14-chat-security-20260722`) | 93a91b4, 405e306, 7cdf6ad + handoff remediation commit | Flutter 368 passed + 1 intentional live skip; analyze clean; Functions 57/57 lint/build clean; rules 16/16 |
| 15 | done | OpenCode timed out twice with partial RED/implementation files; host fallback under contract | pre- and post-review green (`calorix-task15-secondary-parity-20260727`) | 1f4ac4f + handoff commit | Focused profile 15/15; onboarding/permission 18/18; a11y 5/5; analyzer clean; full Flutter 390 passed + 1 intentional live skip. |

### Task 11 plan checkpoint

- Existing visual parity coverage is retained; implementation is scoped to the missing production summary contract, fixture/presentation isolation, and genuinely absent widget assertions.
- Review conversation `calorix-task11-today-truth-20260722` confirmed a synchronous reactive `todaySummaryProvider` plus fixture-only `todayDisplaySummaryProvider`. The plan now awaits `todayEntriesProvider.future` before reading the synchronous summary and tests both providers independently.
- Final pre-review confirmation: `AGREEMENT_STATUS: agree`, `MUST_FIX: none`, `SHOULD_FIX: none`, `QUESTIONS: none` on `Gemini 3.6 Flash (High)`. The MCP appended its standard model footer; no repository mutation occurred.
- OpenCode RED-only invocation failed on 2026-07-22 after 20.5 seconds with exact error `Error: No provider available`; it produced no file changes. Host fallback proceeded under the explicit unavailable-provider exception.
- RED: the focused suite failed on missing `todaySummaryProvider`, missing `todayDisplaySummaryProvider`, and missing `Scan a meal`; the initial amber-dot matcher also failed and was corrected as a test-authoring issue before GREEN.
- GREEN: production aggregation is synchronous/reactive, excludes unconfirmed entries, applies serving multipliers exactly once, owns target/remaining kcal, and stays independent of fixture mode. Only `todayDisplaySummaryProvider` substitutes the handoff hero values. Today now exposes an explicit camera CTA and verified confidence, count-up, macro-value, target, percentage, and color behavior.
- Verification: focused Today suite 26/26; `fvm flutter analyze` clean; full `fvm flutter test` 319 passed plus 1 intentional live-contract skip.
- Post-review: Antigravity conversation `calorix-task11-today-truth-20260722`, `Gemini 3.6 Flash (High)`, returned `AGREEMENT_STATUS: agree`, `MUST_FIX: none`, `SHOULD_FIX: none`, `QUESTIONS: none`. The only extra output was the standard model footer; `git status` showed no reviewer mutation.
- Task 11 is complete at `61db8c6`. Next: Task 12 (History Week/Month Time Travel, Fills, and Drilldown).

### Task 12 plan checkpoint

- Existing History already implements the handoff calendar, weekly stats, status colors, future-day dimming, streak surface, and day-detail screen; Task 12 will preserve these rather than rewrite them.
- Missing production contracts found during inspection: selected periods still read a fixed latest-30 stream; previous navigation has no account-creation lower bound; elapsed empty days are absent from day rows; `AnimatedSize` uses a literal duration and ignores reduced motion; focused routing/time-travel tests are absent.
- Planned architecture: immutable `HistoryRange` family query for selected week/month, separate recent stream for cross-week streaks, overrideable auth-metadata creation boundary, pure elapsed-week row materializer, and `AppMotion` transition timing.
- Pre-review round 1 returned `AGREEMENT_STATUS: agree` while listing four `MUST_FIX` items, so it was correctly treated as non-green. The response also concatenated the final MUST_FIX item with the SHOULD_FIX heading; findings remained actionable and no repository mutation occurred.
- Plan corrections: timezone-aware calendar arithmetic across DST; canonical range-key equality/hash for Riverpod stability; active-streak grace when today is empty; disabled/dimmed previous navigation at account creation; auto-disposed range streams and deterministic row keys.
- Confirmation review in `calorix-task12-history-time-travel-20260722` returned `AGREEMENT_STATUS: agree`, `MUST_FIX: none`, `SHOULD_FIX: none`, `QUESTIONS: none`; only the standard model footer was appended and no repository mutation occurred.
- OpenCode RED-only invocation timed out after 304 seconds with no output. It left one partial test file and its child process remained alive; the host terminated process `13788` to prevent delayed edits. Inspection found and corrected two worker test-authoring errors before RED: an allegedly empty streak fixture had data, and an account-bound expectation started outside the selected week.
- RED: focused compilation failed on the planned missing `HistoryRange`, range provider, row materializer, streak helper, creation provider, and widget keys/contracts.
- GREEN: immutable canonical range equality, auto-disposed selected Firestore range queries, timezone-aware calendar shifts, elapsed empty rows, active-streak grace, creation-period navigation clamp, reduced-motion transition, stable row keys, status dots, future-cell disabling, both themes, and day drilldown are implemented.
- Verification: focused History suite 28/28; `fvm flutter analyze` clean; full `fvm flutter test` 340 passed plus 1 intentional live-contract skip.
- Post-review: Antigravity conversation `calorix-task12-history-time-travel-20260722`, `Gemini 3.6 Flash (High)`, returned `AGREEMENT_STATUS: agree`, `MUST_FIX: none`, `SHOULD_FIX: none`, `QUESTIONS: none`; only the standard model footer was appended and no repository mutation occurred.
- Task 12 is complete at `096e2e0`. Next: Task 13 (Goals and Goals Select).

### Task 13 plan checkpoint

- Existing Goals already renders the handoff's period dropdown, body-goal selector, calorie slider/stepper, macro split, weight chart, and trend state.
- Missing production contracts found during inspection: plan controls mutate only transient providers and never persist; `macroSplitProvider` can initialize before the active plan stream emits and then remain stale; `Adjust` is decorative; weight logging has no testable store seam; dirty goals have no exit protection; dropdown/segment motion is not reduced-motion aware.
- Planned architecture: synchronized immutable draft + explicit Adjust/Save lifecycle, plan and weight data-store seams, store-level validation, timezone-aware period math, and `DraftPolicy.goalsEdit` exit protection. Existing visual composition remains intact.
- Pre-review round 1 was substantively positive with no MUST_FIX, but concatenated `AGREEMENT_STATUS`, `MUST_FIX`, and `SHOULD_FIX` headings; it is recorded as MCP response noise and requires a clean confirmation. Its recommendations were adopted: atomic create-and-activate batch, dedicated weight repository seam, loading/error draft guards, and location-preserving plan-week math.
- Confirmation review in `calorix-task13-goals-persistence-20260722` returned exact `AGREEMENT_STATUS: agree`, `MUST_FIX: none`, `SHOULD_FIX: none`, `QUESTIONS: none`; only the standard model footer was appended and no repository mutation occurred.
- OpenCode RED-only invocation timed out after 244 seconds with no output or file changes; the host terminated lingering child process `20096`. Host fallback proceeded under the repeated-stall rule.
- Repository RED failed on missing plan/weight data-store seams, atomic create-and-activate, typed save, and clock-backed weight repository.
- Repository GREEN: injectable plan and weight stores, Firestore adapters, atomic default-plan create/activate batch, validated existing-plan updates, clock-date weight upsert, same-day overwrite, and next-day extension. Focused persistence tests 5/5; analyzer clean.
- Draft/UI RED failed on the planned missing synchronized draft, Adjust/Save lifecycle, dirty-exit protection, and reduced-motion behavior. OpenCode then timed out after 184 seconds with zero additional edits; lingering process `47704` was terminated, and host fallback proceeded under the contract.
- Draft/UI GREEN: one synchronized `GoalsDraft` replaces the stale dual transient providers; controls are read-only until Adjust, Save persists through the repository, failed saves remain dirty/editable with visible feedback, dirty exit consults `DraftPolicy.goalsEdit`, and period/dropdown calendar math preserves the active timezone across DST. Focused Goals suite 17/17; analyzer clean.
- Stage verification: `fvm flutter analyze` reported no issues; full `fvm flutter test` passed 354 tests with 1 intentional live-contract skip.
- Post-review: Antigravity conversation `calorix-task13-goals-persistence-20260722`, `Gemini 3.6 Flash (High)`, returned exact `AGREEMENT_STATUS: agree`, `MUST_FIX: none`, `SHOULD_FIX: none`, `QUESTIONS: none`; no repository mutation occurred. The response contained minor Markdown/word-splitting presentation noise, recorded as non-substantive MCP response noise.
- Task 13 is complete at `2ceab96`. Next: Task 14 (Assistant Chat, Chat History, Confirmation Actions, Functions, and Rules).

### Task 14 plan checkpoint

- Current code trusts client-supplied plan/intake/history, keeps chat only in memory, parses action JSON from prose in Flutter, and has no history screen. Existing rules/fixtures already use `aiThreads`; the design document's `ai_threads` spelling is stale and will not become a second collection.
- Approved architecture: authenticated callable accepts message plus idempotency/thread/linked-meal identifiers, derives all coaching context server-side, persists deterministic user/reply documents, returns schema-validated structured actions, and enforces the 200-message archive cap. Client code pages with document snapshots, performs complete subcollection cleanup on delete, and keeps failed optimistic turns retryable.
- Official Firebase guidance checked on 2026-07-22: callable auth arrives in `request.auth`; document-snapshot cursors support stable pagination; Admin SDK bypasses Firestore rules; transactions/batches provide atomic writes, with large deletions chunked.
- Pre-review: Antigravity conversation `calorix-task14-chat-security-20260722`, `Gemini 3.6 Flash (High)`, returned `AGREEMENT_STATUS: agree`, `MUST_FIX: none`, and two adopted `SHOULD_FIX` items: Unicode-safe 60-code-point titles and explicit <=500-write deletion batches for `messages` plus `messageArchive`. No repository mutation occurred; only compacted Markdown heading presentation noise was present.
- Worker availability on 2026-07-27: OpenCode timed out after 184 seconds with zero edits and lingering process `19032` was terminated; the approved headless fallback exited after 19 seconds with `You've hit your monthly spend limit`. Host fallback proceeded under the recorded exhaustion rule.
- Backend RED: focused tests failed 10/12 against the old trusted-client contract; archive rules failed 1/16 because the owner could not read server-archived messages.
- Backend GREEN: strict message/id payload, server-derived profile/plan/current-day intake/recent meals/history, deterministic first-thread and message/reply IDs, transaction claim lease, completed-retry short circuit, Unicode-safe title, linked-meal ownership validation, structured action validation, 200-message archive cap, and owner-read/server-write archive rules. Verification: Functions 57/57; lint clean; TypeScript build clean; Firestore emulator rules 16/16.
- Backend stage committed and pushed at `93a91b4`.
- Flutter repository stage committed and pushed at `405e306`.
- Client/UI GREEN checkpoint: strict callable payload, persisted thread loading with 20-message upward pagination, retry with the same client message ID, structured confirmation actions through atomic `saveActivePlan`, double-apply guard, history list/open/delete/empty states, reduced-motion typing indicator, explicit bubble alignment/tails, production `/ai/history` routing, and fixture message subcollections are implemented. During verification, the server recent-meal query was corrected from nonexistent `createdAt` to canonical `timestamp`.
- Focused verification: assistant/debug/router Flutter suites 32/32; Functions 57/57; Functions lint and TypeScript build clean; `fvm flutter analyze` clean. Rules emulator and full Flutter suite remain the next gate.
- Final verification: `fvm flutter test` passed 368 tests with 1 intentional live-contract skip; `fvm flutter analyze` clean; Functions remained 57/57 with lint/build clean; Firestore rules emulator passed 16/16.
- Post-review routing: `Gemini 3.6 Flash (High)` timed out after 300 seconds with no review body. `Gemini 3.1 Pro (High)` found one MUST_FIX: archive rules denied the client delete that `AiThreadRepository.deleteThread` requires after the 200-message cap. Rules now allow owner delete while preserving server-only create/update, and the emulator test proves owner/cross-user/create/update behavior. Confirmation review returned `AGREEMENT_STATUS: agree`, `MUST_FIX: none`, `SHOULD_FIX: none`.
- MCP response noise: the first fallback response included an unexpected `<messaging>` wrapper and background-test notification. It did not mutate the repository and was not used as verification evidence.
- Flutter persistence RED failed on the missing thread/message models, data-store seam, stable cursor pages, and recursive cleanup contract.
- Flutter persistence GREEN: immutable thread/message/action models, robust Firestore date decoding, newest-first stable thread ordering, opaque document-snapshot cursors with 20-message pages, and <=500-document cleanup loops for both `messages` and `messageArchive` before parent deletion. Focused repository tests 4/4; analyzer clean.
- Task 14 is complete. Next: Task 15 (Profile, Loading, Login, and Permission Secondary Parity).

### Task 10 plan correction

- Pre-review found the current edit path can multiply an already displayed macro a second time and persist that scaled value as base nutrition.
- Task 10 now owns the canonical `baseKcal/baseProtein/baseCarbs/baseFat` migration for all new writes, legacy read fallback, exactly-once aggregation/display scaling, auth-scoped CRUD, deterministic correction timestamps, nullable watch behavior, draft protection, and pending/processing edit restrictions.
- Antigravity response formatting concatenated several requested headings/line breaks. The substantive findings were coherent, but this is recorded as MCP response noise; confirmation review is required before implementation.
- Confirmation review returned `AGREEMENT_STATUS: agree`, `MUST_FIX: none`, `SHOULD_FIX: none`; implementation may start with Task 10 Step 1 RED tests.

### Task 10 canonical nutrition checkpoint

- OpenCode RED-only invocation was terminated after roughly 90 seconds with no output and no file changes; host fallback used under the repeated-stall rule.
- RED: Flutter failed on missing `base*` fields and serving helpers; Functions failed on legacy serialization and canonical aggregation precedence.
- GREEN: `FoodEntry` owns canonical `base*` data with temporary source aliases and legacy read fallback; `toMap` and all identified new worker/manual/seed/fixture/duplicate writes emit only `base*`; aggregation reads canonical first and multiplies exactly once; Firestore rules require canonical nutrition for new complete entries.
- Full evidence after workspace repair: Flutter analyzer clean; Flutter 298 passed plus 1 intentional live skip; Functions build/lint clean and 52/52 tests; Firestore rules 13/13 through the emulator.
- Workspace incident resolved: stale historical `opencode run` processes deleted three tracked Task 7 test files during this stage. All stale run processes were stopped, the files were restored byte-for-byte from `HEAD`, `test/processing` passed 59/59, and no tracked restoration diff remains.
- Next: auth-scoped CRUD/correction RED tests and implementation, then detail-sheet edit/draft behavior.

### Task 10 exactly-once edit checkpoint

- RED: pending correction test received legacy `{kcal, protein}` fields instead of canonical `{baseKcal, baseProtein}`.
- GREEN: `PendingEdits.toUpdateMap` emits only canonical base nutrition; macro input sheets convert displayed totals through `baseFromDisplayed` before persistence, preventing multiplier double application.
- Verification: serving/detail focused tests 7/7; Flutter analyzer clean.
- Next: deterministic correction timestamps/auth-scoped CRUD tests, nullable watch/delete behavior, then draft/pending-state UI gates.

### Task 10 correction metadata checkpoint

- RED: `correctionUpdateFields` was absent.
- GREEN: correction writes retain only caller-supplied nutrition/multiplier fields, set `corrected: true`, and record `correctedAt` plus `updatedAt` from the injected `Clock`; `FoodEntry` round-trips optional `correctedAt`.
- Verification: combined food-detail tests 9/9; analyzer clean from the same source delta.
- Next: nullable watch/delete behavior and unsaved/pending-state UI gates.

### Task 10 entry-state edit checkpoint

- RED: pending and processing detail sheets still rendered the Edit chip.
- GREEN: non-terminal entries hide Edit, cannot activate the serving stepper, and cannot render the save action bar.
- Verification: food-detail tests 11/11; analyzer clean.
- Next: nullable watch/delete behavior and `PopScope` unsaved-exit confirmation.

### Task 10 scoped CRUD and draft checkpoint

- RED: repository tests failed on the absent `FoodEntryDataStore`, nullable watch, `NutritionCorrection`, and `FoodEntryRepository.withStore` contracts; the widget test then failed because a changed serving had no destructive-exit confirmation.
- GREEN: the Firebase adapter and in-memory-testable repository seam preserve `users/{uid}/entries/{id}` ownership for point CRUD and query operations; delete emits `null`; duplicate creates a distinct ID with unchanged canonical base nutrition; `saveCorrection` writes only changed canonical values plus deterministic correction metadata.
- Nullable entry absence is explicit in Food Detail and Review instead of being filtered into a permanent loading state; Processing carries the nullable stream while retaining its local queue fallback.
- Food Detail now applies `DraftPolicy.foodEdit` through `PopScope`; a changed serving prompts `Keep editing` / `Discard`, Undo removes pending state, and save clears the draft before navigation. Pending/processing edit controls remain unavailable.
- The review-confirm path was corrected to write canonical `base*` nutrition keys instead of reintroducing legacy fields.
- Verification: `fvm flutter analyze` clean; combined food-detail, processing, and review suite 79/79; repository-focused suite 5/5.
- Next: complete and test the remaining editable detail fields/actions, run full verification, then post-implementation review.

### Task 10 edit-surface checkpoint

- RED: direct-edit widget tests failed on absent calories, food-name, meal-type, and detected-item controls; the security regression test proved owners could mutate nutrition while an entry remained `pending` or `processing`.
- GREEN: edit mode now exposes inline handoff-aligned editors for name and meal type plus scroll-safe root sheets for calories, macros, and detected-item name/weight; detected items can be adjusted or added and are included in the pending correction map.
- The shared number editor replaces the older macro-only modal, avoiding divergent keyboard/small-screen behavior. Food Detail route motion now uses `MotionDurations.cardExpansion` instead of a duplicated `320ms` literal.
- Firestore client updates are allowed only for stable editable `complete`/`needs_review` entries, `needs_review -> complete`, and `error -> pending`; pending/processing analysis remains server-owned. Admin SDK workers are unaffected.
- Verification: focused Food Detail suite 21/21; `fvm flutter analyze` clean; Firestore emulator rules 14/14.
- Next: full Flutter/Functions verification, post-implementation review, and Task 10 handoff.

### Task 10 final verification and review

- Full verification at `34e3310`: `fvm flutter analyze` clean; full Flutter suite 313 passed plus 1 intentional live skip; Functions 52/52, ESLint clean, TypeScript build clean; Firestore emulator rules 14/14.
- Post-implementation review conversation `calorix-task10-food-crud-20260722` used `Gemini 3.6 Flash (High)` and inspected the complete Task 10 commit range. Final confirmation: `AGREEMENT_STATUS: agree`, `MUST_FIX: none`, `SHOULD_FIX: none`, `QUESTIONS: none`.
- Response-noise record: the first response concatenated requested headings and both responses included the MCP model footer. The same conversation returned the exact four requested decision lines on retry; `git status` confirmed no reviewer mutation.
- Task 10 is complete. Next implementation task: Task 11 (Today, Today Empty, and Production Aggregation Truth).

### Task 9 backend checkpoint

- OpenCode invocation `opencode/mimo-v2.5-free` was terminated on 2026-07-22 after more than three minutes with no output and no file changes; host fallback used under the recorded repeated-stall rule.
- RED: focused orchestration command produced exactly 6 expected failures for missing prompt routing, OFF lookup, barcode review gating, and retry metadata preservation; 18 pre-existing tests remained green.
- GREEN: current Open Food Facts v3 GET client, canonical nutrition parser, distinct meal/label/barcode prompts, known-product short circuit, review-only unknown barcode fallback, exact Firestore field mapping, and retry/initial-trigger metadata preservation.
- Verification: focused 33/33; full `npm --prefix functions test` 51/51; `npm --prefix functions run build` passed.
- Backend checkpoint commit: `49bcffc`, pushed to `origin/main`; client/emulator/review evidence follows below.

### Task 9 client-contract checkpoint

- RED: `fvm flutter test test/contracts` failed only because `FoodEntry.fromData` was absent; the guarded live test skipped by default.
- GREEN: pure `FoodEntry.fromData` parses both Firestore `Timestamp` and testable `DateTime` values; `atwaterKcal` and canonical candidate fields round-trip through the Flutter model.
- Default contract gate: 1 passed, 1 explicitly skipped live test.
- Read-only live gate: `fvm flutter test test/contracts/off_live_contract_test.dart --dart-define=RUN_OFF_LIVE=true --tags live` passed on 2026-07-22 against current OFF v3.
- Next: Firebase emulator round-trip, full analyzer/test/build suites, and post-implementation review.

### Task 9 final verification

- Firebase emulator gate: auth, Firestore, Storage, and Functions started; all four Functions exports loaded; 51/51 tests passed inside `firebase emulators:exec`; no deploy command or production write was run.
- Full verification: `fvm flutter analyze` clean; `fvm flutter test` 294 passed plus 1 intentional live skip; Functions lint/build clean; Functions tests 51/51.
- Post-review: Antigravity conversation `calorix-task9-analysis-contracts-20260722`, Gemini 3.6 Flash (High), `AGREEMENT_STATUS: agree`, `MUST_FIX: none`, `SHOULD_FIX: none`; no response noise and no repository mutation.
- Follow-up risk: the Functions emulator reports `@google-cloud/vertexai` deprecated with a 2026-06-24 removal date. It still loads and all gates pass, but migration to `@google/genai` must be scheduled as a separate infrastructure dependency task before a future provider/runtime upgrade.
- Handoff: implementation and verification are pushed through `5c8d3fb`; Task 10 is next.

### Task 8 handoff

- Added production Review and Manual routes/screens, persisted review candidates, auth-scoped candidate confirmation, clock/date-backed manual entries, permission-to-manual routing, linked assistant context, and low-confidence processing redirect.
- Destructive manual exit uses the shared `DraftPolicy` and a guarded `PopScope`; review sheet is height-constrained and scrollable; route entrance uses `MotionDurations.sheetSlideUp`.
- Verification: `fvm flutter test test/review test/manual test/processing/processing_lifecycle_test.dart` 14/14; `fvm flutter test test/scan/permission_screen_test.dart` 6/6; full `fvm flutter analyze` clean; full `fvm flutter test` 293/293.
- Review: Antigravity conversation `calorix-task8-review-manual-20260722`, Gemini 3.6 Flash (High), final `AGREEMENT_STATUS: agree`, `MUST_FIX: none`, `SHOULD_FIX: none`; no post-review mutation/noise.
- Next task: Task 9 (real product analysis contracts).

### Task 7 checkpoints

- `cdfd127`: foreground upload retry coordination; 6/6 focused tests and analyzer clean.
- `098c02f`: production viewed-entry MRU, auth-scoped existence check, typed retry callable, and notification routing handler; 10/10 focused tests and analyzer clean.
- `a59f962`: provider/app-lifecycle wiring, combined local/remote processing state, notification tap integration, viewed-on-detail behavior, and real processing widget states.
- Final verification: `fvm flutter analyze` clean; `fvm flutter test` 284/284; `fvm flutter test test/processing` 58/58; functions 46/46; TypeScript build clean.
- Final review: Antigravity conversation `calorix-task7-final-review-20260722`, Gemini 3.6 Flash (High), `AGREEMENT_STATUS: agree`, `MUST_FIX: none`, `SHOULD_FIX: none`; no repository mutation or response noise.
- Next task: Task 8 (Review and Manual canonical screens).

**Task 0 commit:** cacca80

**Task 1 note:** OpenCode first implementation call stalled 12+ minutes with no edits; Claude headless fallback was unavailable because its session limit resets at midnight Europe/Zurich. Runtime check attempted but blocked/aborted: Pixel_8_API35_GoogleAPIs was unavailable under plan's old ID, direct software and host-GPU boots left emulator-5554 offline with hanging QEMU CPU/main-loop threads, then the user's phone shut down and had to be rebooted; all emulator/QEMU processes terminated and emulator-5554 removed. The physical phone had shut down/rebooted after the emulator attempts. DO NOT launch emulators or interact with/install/run on the physical device without explicit user confirmation. Aborted `flutter run` terminated before evidence — not counted. No runtime result counts as evidence. Architecture review explicitly accepted automated test evidence in lieu of runtime. Focused command: `fvm flutter test test/spike_nav/spike_conflict_test.dart`

**Task 1 RED evidence (2026-07-17):**
```
test/spike_nav/spike_conflict_test.dart:3:8: Error: Error when reading 'lib/debug/spike_nav/spike_shell_a.dart': The system cannot find the path specified
import 'package:calorix/debug/spike_nav/spike_shell_a.dart';
test/spike_nav/spike_conflict_test.dart:4:8: Error: Error when reading 'lib/debug/spike_nav/spike_shell_b.dart': The system cannot find the path specified
import 'package:calorix/debug/spike_nav/spike_shell_b.dart';
test/spike_nav/spike_conflict_test.dart:5:8: Error: Error when reading 'lib/debug/spike_nav/spike_harness.dart': The system cannot find the path specified
import 'package:calorix/debug/spike_nav/spike_harness.dart';
test/spike_nav/spike_conflict_test.dart:13:19: Error: Couldn't find constructor 'SpikeShellA'.
test/spike_nav/spike_conflict_test.dart:15:19: Error: Couldn't find constructor 'SpikeShellB'.
```
Expected FAIL — compilation errors (`SpikeShellA`/`SpikeShellB` not defined). Step 1 (test written) and Step 2 (RED) confirmed.

## Worker routing log

| Date | Call | Result (exact error if failed) |
|---|---|---|
| 2026-07-17 | OpenCode long plan attempt | failed after 474s: "Streaming response failed"; no file created |
| 2026-07-17 | Claude Fable partial plan write | ended with "Usage credits required" |
| 2026-07-17 | OpenCode bounded revisions (later) | succeeded |
| 2026-07-18 | OpenCode origin call #1 | timed out after 304s |
| 2026-07-18 | OpenCode origin call #2 | timed out after 244s; left usable edits (router/origin/spike cleanup) |
| 2026-07-18 | OpenCode scoped cleanup after #2 | succeeded — substage C complete, combined tests 29/29 |
| 2026-07-18 | OpenCode availability | available for code-sized edits |
| 2026-07-18 | OpenCode RED test call | timed out after 244s; left the test; correction succeeded |
| 2026-07-18 | OpenCode implementation call | timed out after 304s; left usable implementation; independently verified by host |
| 2026-07-18 | OpenCode Task 3 Stage A call #1 | timed out after ~604s; orphan process stopped |
| 2026-07-18 | OpenCode Task 3 Stage A call #2 | timed out after ~604s; orphan process stopped |
| 2026-07-18 | OpenCode Task 3 Stage A call #3 | timed out after ~124s; orphan process stopped |
| 2026-07-18 | Claude headless fallback (Task 3 Stage A) | explicit user-approved fallback after three OpenCode timeouts; edits independently inspected by host before verification |
| 2026-07-18 | OpenCode Task 4 plan correction | timed out after 184s with no output and no repository edits; orphan `opencode` process stopped |
| 2026-07-18 | Claude headless Task 4 availability probe | failed: `You've hit your session limit · resets 7pm (Europe/Zurich)` |
| 2026-07-18 | OpenCode Task 6 RED call | timed out after 904s with zero repository edits; Claude Code headless (Sonnet 5) then completed the RED-only checkpoint; host independently inspected and reran it |
| 2026-07-18 | Task 6 Step 3/4 (GREEN) | not routed through OpenCode — user directed Claude Code (Sonnet 5) to implement directly given the Step 1/2 904s zero-edit timeout recorded above on this same task; no OpenCode call attempted for this step |
| 2026-07-18 | Task 6 physical-remediation tests | delegated headless fallback timed out after leaving usable test edits; host inspected and verified them before implementation |
| 2026-07-18 | Task 6 physical-remediation implementation | delegated headless fallback failed with exact message `You've hit your session limit · resets 12am`; host fallback completed the permission/lifecycle/readiness fixes under the recorded tool-exhaustion exception |
| 2026-07-22 | Task 7 backend, queue, connectivity | OpenCode repeatedly stalled/timed out with zero edits; Claude was session-limited; delegated Luna/Terra workers stalled. Host fallback implemented bounded slices, independently verified each, and retained main-agent architecture/review judgment. |
| 2026-07-22 | Task 8 implementation | `opencode run --model opencode/mimo-v2.5-free --auto` remained silent for approximately 3 minutes and left the working tree unchanged; call terminated, then host fallback performed the recorded RED/GREEN stage. |

## Plan review log

Conversation: `calorix-complete-handoff-product-quality-20260717`

| Round | AGREEMENT_STATUS | MUST_FIX count | Details |
|---|---|---|---|
| 1 | disagree | 5 | 5 must-fix items raised |
| 2 | disagree | 4 | 4 must-fix items raised |
| 3 | disagree | 1 | 1 must-fix item raised |
| 4 | agree | none | AGREEMENT_STATUS: agree, MUST_FIX: none |

### Antigravity response noise

- Requested preview name was rewritten/rejected despite advertised labels.
- One JS interpolation failure occurred before review.
- Two responses prepended an unrelated "searching-system" sentence.
- No repository mutation occurred.

### Antigravity response noise (Task 8 pre-review)

- Round 1 emitted `AGREEMENT_STATUS: agree` while also listing three `MUST_FIX` items; it was correctly treated as non-green.
- Round 1 appended unrelated background search completion messages. The plan findings were still concrete and applied; round 2 returned the clean required verdict (`agree`, `MUST_FIX: none`).
- Neither round mutated the repository.

### Antigravity response noise (Task 9 pre-review)

- Round 1 emitted `AGREEMENT_STATUS: agree` with three `MUST_FIX` items and concatenated section headings, so it was treated as non-green.
- The concrete findings were applied to the plan; round 2 returned the required clean verdict. No repository mutation occurred.

### Antigravity response noise (Task 2 review, calorix-task2-review-retry-20260718)

1. Requested gemini-3.1-pro-preview was rewritten to gemini-3.1-pro and rejected despite listing Gemini 3.1 Pro (High).
2. First High response contained orchestration leakage asking caller to invoke same MCP and omitted required status.
3. Correction timed out after 300s with no persisted turn.
4. Fresh retry produced valid disagree review.

### Antigravity response noise (Task 5 post-review)

1. Requested `gemini-3.1-pro-preview` was rewritten to invalid `gemini-3.1-pro`; the server advertised only the label `Gemini 3.1 Pro (High)`.
2. Three `Gemini 3.1 Pro (High)` repository-inspection calls timed out after 300 seconds and persisted no response.
3. One sandboxed `Gemini 3.5 Flash (High)` inspection call also timed out after 300 seconds and persisted no response.
4. A final no-sandbox, fact/evidence-based `Gemini 3.5 Flash (High)` call returned the required green verdict. No reviewer call mutated tracked or untracked repository files.

### Antigravity response noise (Task 6 pre-review, calorix-task6-scan-permission-20260718)

1. Requested canonical `gemini-3.1-pro-preview` was rewritten to invalid `gemini-3.1-pro`; the advertised `Gemini 3.1 Pro (High)` worked.
2. First response inspected the untouched baseline as if the implementation were already complete.
3. Correction re-grounded the response in the actual contract; it then returned `AGREEMENT_STATUS: agree`, `MUST_FIX: none`.
4. The final post-implementation review returned a valid green verdict but created untracked `diff.txt` despite the explicit no-write instruction. The file contained only a repository diff, was inspected, and was removed immediately; no tracked source was mutated.

## Review-gate log

(one row per REVIEW-GATE call: task, conversationId, AGREEMENT_STATUS, MUST_FIX, git-status-after)

| Task | conversationId | AGREEMENT_STATUS | MUST_FIX | git-status-after |
|---|---|---|---|---|
| 1 | calorix-navigation-spike-20260717 | agree | none | clean (no mutation/noise beyond normal wrapper/model label handling) |
| 2 (round 1) | calorix-task2-review-retry-20260718 | disagree | 2: cross-branch FoodDetail pushNamed(aiChat) targets inactive AI branch; old visibility tests could pass on offstage widgets | clean (remediation applied) |
| 2 (round 2) | calorix-task2-review-retry-20260718 | agree | none | clean (no mutation; preserved untracked artifacts/no conflict) |
| 3 (round 2) | calorix-task3-clock-timezone-20260718 | agree | none | clean (no mutation; pre-implementation only) |
| 3 (round 3) | calorix-task3-clock-timezone-20260718 | agree | none | clean (post-RED, pre-implementation; DST UTC-instant correction + 9 RED tests inspected) |
| 3 (post-implementation) | calorix-task3-clock-timezone-20260718 | agree | none | clean (no mutation; response duplicated the complete review block verbatim, treated as one valid review) |
| 5 (post-implementation fallback) | calorix-task5-fixture-capture-20260718 | agree | none | clean (no mutation; fact/evidence-based Flash High verdict after Pro inspection calls timed out) |
| 6 (pre-implementation) | calorix-task6-scan-permission-20260718 | agree | none | clean (no mutation) |
| 6 (post-implementation) | calorix-task6-scan-permission-20260718 | agree | none | reviewer created untracked `diff.txt`; inspected and removed; no tracked mutation |

## Visual evidence log

(one row per ui-diff run: run ID, screens, status, auditLimited, unresolved count, verdict)

## Blocked gates

(gates recorded as blocked — e.g. real cloud processing without authorization — are listed here, never marked passed)

- Task 6 real shutter-to-production upload E2E: intentionally not run on the signed-in physical device because it would write to production Firestore/Storage. Deterministic tests cover the one-shot capture guard and injected upload gateway. The external reviewer agreed this is an explicit cloud-safety limitation, not a Task 6 handoff blocker.

## Primary-source research (Task 3)

| Package | Version | Finding |
|---|---|---|
| `flutter_timezone` | 5.1.0 | `FlutterTimezone.getLocalTimezone()` returns `TimezoneInfo`; the `.identifier` property is the IANA zone string (e.g. `"Europe/Zurich"`). Not a plain String — must access `.identifier`. |
| `timezone` | 0.11.1 | `tz.local` defaults to `Etc/UTC` after `initializeTimeZones()`. Does NOT auto-detect the device timezone. Requires explicit `tz.setLocalLocation(tz.getLocation(identifier))` after fetching the native identifier. `initializeTimeZones()` is synchronous and returns void — it must NOT be awaited. |

## Pre-review conversation record (Task 3)

Conversation: `calorix-task3-clock-timezone-20260718`

| Round | AGREEMENT_STATUS | MUST_FIX count | Details |
|---|---|---|---|
| 1 | agree (with corrections) | 6 | 6 mandatory contract corrections identified and applied to plan |
| 2 | agree | none | Corrected plan is implementation-ready (Gemini 3.1 Pro (High)) |

Corrections applied:
1. **Files/scope** — expanded to all product-time call sites (repositories, services, providers, screens, models)
2. **Timezone architecture** — removed ProviderRef from TimezoneSynchronizer; added TimezoneSyncStatus/TimezoneSyncDiagnostic; TimezoneLifecycleHandler as root StatefulWidget; corrected package aliases (tz_data/tz); corrected initializeTimeZones() as synchronous void
3. **Clock/date contracts** — localDateKey purity; FoodEntry fallback via explicit tz.TZDateTime.from; MacroTargetPlan.defaultPlan requires explicit startDate; DailyLog deterministic sentinel; full Clock injection
4. **DST test** — replaced invalid `tz.isDaylightSavings` constructor with plain TZDateTime + offset assertion
5. **Steps** — Step 1 writes ALL tests; Step 5 adds DateTime.now() audit table
6. **"await initializeTimeZones" correction** — the reviewer's wording was corrected because the API is synchronous and returns void; plan now correctly says `tz_data.initializeTimeZones()` without await

## Current Task

**Task 16 — Connected-Device E2E Matrix. Task 15 is complete and pushed; inspect the current device/emulator constraints and test harness before starting Task 16.**

- Pre-review conversation `calorix-task15-secondary-parity-20260727` used `Gemini 3.6 Flash (High)`. The first response concatenated review headings and was recorded as formatting noise; the same conversation then returned exact `AGREEMENT_STATUS: agree`, `MUST_FIX: none`, `SHOULD_FIX: none`, `QUESTIONS: none`. Adopted guidance: synchronous settings defaults with asynchronous hydration; constraints-based login keyboard safety; mounted guards; reduced-motion loading; fixture-only permission overlay.
- OpenCode RED invocation timed out after 304,050 ms (exit 124), left `test/profile/profile_sheet_test.dart`, and retained process `89204`; the host stopped it before inspection. The bounded settings/profile implementation retry timed out after 364,041 ms (exit 124), left partial source edits, and retained process `87452`; the host stopped it before remediation. Neither call reported quota exhaustion.
- Host review found the partial provider would throw in production without an override, did not serialize writes, and could overwrite a user update with late hydration. The replacement boots from immutable safe defaults, asynchronously hydrates through an injectable store, preserves updates made during hydration, validates persisted enums, and serializes writes.
- Settings/profile GREEN: persisted theme, units, notifications, camera resolution, and auto-capture; complete preference controls; async account-link mounted guards; sign-out confirmation; and origin-safe close affordances. Focused `fvm flutter test test/profile/profile_sheet_test.dart` passed 15/15; `fvm flutter analyze` reported no issues.
- Secondary-screen GREEN: splash controllers start only after motion preference is known, halt under reduced motion, cancel both stage/minimum-beat timers, and keep the 1.8-second auth-routing beat; login uses viewport constraints under keyboard resize and exposes 48px labeled controls; the iOS-style permission prompt is fixture-only while production denied/settings/manual behavior remains unchanged.
- Task 15 final verification: onboarding/permission 18/18; accessibility guidelines 5/5; profile 15/15; `fvm flutter analyze` no issues; full `fvm flutter test` 390 passed with 1 intentional OFF live-contract skip.
- Post-review in `calorix-task15-secondary-parity-20260727` on `Gemini 3.6 Flash (High)` returned exact `AGREEMENT_STATUS: agree`, `MUST_FIX: none`, `SHOULD_FIX: none`, `QUESTIONS: none`. The response appended a duplicate Markdown review summary after the requested headings; this is recorded as non-substantive MCP response-format noise. `git status` confirmed no reviewer mutation.

## Historical Task 6/7 execution record

- Task 7 pre-implementation plan review (conversation `calorix-task7-processing-20260721`, primary model `Gemini 3.6 Flash (High)`): an earlier response reported `AGREEMENT_STATUS: agree` while simultaneously listing five `MUST_FIX` items. This is a response-format anomaly (contradictory agree+must-fix), not a valid green verdict, so it was **not** counted as green; it is retained below as historical response noise. The corrected plan was re-reviewed in the same conversation and returned an internally consistent `AGREEMENT_STATUS: agree`, `MUST_FIX: none`, `SHOULD_FIX: none`, `QUESTIONS: none`. The Task 7 plan review gate is green; implementation RED is next.
- Worker routing for the Task 7 plan-correction pass (commit `1b8dcf9` and prior): OpenCode made partial documentation edits, then timed out after 1,204.1s with no final response. Claude Code headless fallback completed the corrections in 530.3s, and a final targeted retry-cap correction followed in 182.7s.
- Host-found correction (this entry): the plan's Task 7 Files/contract/commands omitted the backend implementation for `retryEntryAnalysis` — `RetryAnalysisService` was specified only as a Flutter-side abstract class with no corresponding Cloud Function. Corrected to add `functions/src/retry-analysis.ts` (`handleRetryEntryAnalysis` + typed `RetryAnalysisError`), a `functions/src/index.ts` export of `retryEntryAnalysis` as an `onCall` sharing an extracted `AnalyzeEntryDeps` factory with `processEntry`, and `functions/test/retry-analysis.test.ts` (injected fakes only, no emulator/production writes). Backend contract: authenticated `request.auth.uid` + validated `entryId`; single Firestore `runTransaction` on `users/{uid}/entries/{entryId}` — missing doc is `not-found`, only `status == 'error'` may atomically claim to `pending` (pending/processing/complete/needs_review are `failed-precondition`); claim happens before invoking `handleEntryCreated`, guaranteeing exactly one analysis invocation under concurrent retries; entry image/storage/data fields preserved. Task 7's RED/GREEN/stage-verification commands now run both `fvm flutter test test/processing` and `npm test --prefix functions` (plus `npm run build --prefix functions` at GREEN/stage). All Task 7 checkboxes remain unchecked. Flutter `retry_analysis_service.dart` and its client tests are retained as a thin callable wrapper; the atomicity/ownership guarantees moved to the backend contract instead of living only in the client-side description.
- No Task 7 implementation (RED/GREEN, `lib/`, `test/`, or `functions/` changes) has started; this entry covers plan correction and pre-implementation review status only. Re-review of the corrected Task 7 plan is complete and green; implementation RED is next.

- Branch: `main`
- Baseline: `f7d9a54` ("Complete deterministic capture harness handoff")
- Pre-implementation review: conversation `calorix-task6-scan-permission-20260718` returned `AGREEMENT_STATUS: agree` with the corrected contract: injectable abstract `CameraService` (`hasPermission`/`requestPermission`/`captureStill`/`pickFromLibrary`); `CaptureState` `idle`/`capturing`/`denied` (replacing the prior `uploading` value); taps while `capturing` are a strict no-op (no toggle-back-to-idle); public `ScanModeSelector` and `CaptureButton` widgets (replacing the private `_ModeSelector`/`_CaptureButton`); `PermissionScreen` with route/regrant/manual-navigation-intent behavior; the LIBRARY chip shares the same capture guard as the shutter; `AppMotion`/`MotionDurations` tokens drive all Task 6 motion; runtime verification (Step 5) is authorized only on the explicit physical serial `R58R61161NA`, never an emulator or auto-selected target.
- Worker routing: OpenCode was invoked for the RED step and timed out after 904s with zero repository edits (no test files created). Claude Code headless (Sonnet 5) then completed the RED-only checkpoint under the repository contract; the host independently inspected and reran the result before recording it. This is recorded in the Worker routing log above.
- Step 1 (tests written) and Step 2 (RED) complete:
  - Extended `test/scan_screen_test.dart` with an assertion that `ScanScreen` composes the public `CaptureButton`/`ScanModeSelector` widgets via an injected `cameraServiceProvider`.
  - Created `test/scan/capture_guard_test.dart` (rapid-triple-tap-is-one-capture; capturing state shows spinner/shimmer/ANALYZING with no stop control).
  - Created `test/scan/permission_screen_test.dart` (denied → `PermissionScreen` with blurred viewfinder + add-manually card; regrant → back to `scan_idle`; add-manually invokes the manual-entry navigation intent — asserted via callback since `RouteNames.manual` does not exist until Task 8, per the plan's explicit "router redirect stub" allowance).
  - Created `test/scan/scan_mode_selector_test.dart` (Meal/Barcode/Label segments update `ScanMode`, thumb keyed for `MotionDurations.reticleSnap` animation).
  - Created shared test doubles/helpers at `test/scan/support/fake_camera_service.dart` and `test/scan/support/pump_scan.dart` (not separately listed in the plan's Files section; added because all four Task 6 test files need the same injectable `CameraService` fake and `ScanScreen` pump helper).
- Focused RED command: `fvm flutter test test/scan test/scan_screen_test.dart` exited 1 as expected — 0 passed, 4 test files failed to load, all four failures are compilation errors for missing Task 6 APIs only (no unrelated test-authoring mistakes):
  - `test/scan/capture_guard_test.dart` — `Undefined name 'cameraServiceProvider'`.
  - `test/scan/permission_screen_test.dart` — `lib/features/scan/permission_screen.dart` not found; `Undefined name 'PermissionScreen'` (×3); `Method not found: 'PermissionScreen'`.
  - `test/scan/scan_mode_selector_test.dart` — `lib/features/scan/widgets/scan_mode_selector.dart` not found; `Method not found: 'ScanModeSelector'`.
  - `test/scan_screen_test.dart` — `lib/features/scan/widgets/capture_button.dart` and `.../scan_mode_selector.dart` not found; `Undefined name 'CaptureButton'`; `Undefined name 'ScanModeSelector'`; `Undefined name 'cameraServiceProvider'`.
- No `lib/` files were modified in this checkpoint. All pre-existing untracked artifacts (`.claude/ui-diff-runs/`, `.gemini/settings.json.bak-20260517-220447`, `assets/calorix_icons/`, `docs/screenshots/*.png`) remain untouched; `git status` shows only `test/scan_screen_test.dart` modified and the new `test/scan/` directory added.
- Intended focused command for Step 3/4 (implementation, not run in this checkpoint): `fvm flutter test test/scan test/scan_screen_test.dart` (GREEN), then `fvm flutter analyze` and the full `fvm flutter test` for Step 6 stage verification.

- **Step 3/4 GREEN checkpoint (2026-07-18):**
  - Worker routing: this GREEN implementation was not routed through OpenCode — the user directed Claude Code (Sonnet 5) to implement it directly in this session, given OpenCode's 904s zero-edit timeout on this same task's RED step recorded above. Host (this session) implemented, verified, and will review before commit/push.
  - `lib/shared/services/camera_service.dart` redefined: abstract `CameraService` with exactly `hasPermission()`/`requestPermission()`/`captureStill()`/`pickFromLibrary()` (matching `test/scan/support/fake_camera_service.dart`'s existing implementation exactly, so the fake needed no changes); production `DeviceCameraService` owns the `CameraController` lifecycle internally. `hasPermission()`/`requestPermission()` return `false` only for genuine OS permission-denial `CameraException` codes (`CameraAccessDenied`, `CameraAccessDeniedWithoutPrompt`, `CameraAccessRestricted`); any other failure (including `MissingPluginException` in the widget-test/no-plugin host) degrades to granted/idle, preserving the pre-Task-6 silent-catch behavior for non-permission failures and keeping `test/scan_screen_test.dart`'s first two un-modified tests passing against the real (non-overridden) `cameraServiceProvider`. `previewController`/`setFlashMode`/`pause`/`resume` are extra members on the concrete class only (a minimal typed production seam per the reviewed contract) — the abstract contract and its test fake stay free of `CameraController`.
  - `lib/features/scan/providers/scan_providers.dart`: `CaptureState` is now exactly `idle`/`capturing`/`denied` (the prior `uploading` value had no other call sites — confirmed via repo-wide search before removing it); added `cameraServiceProvider = Provider<CameraService>((ref) => DeviceCameraService())`.
  - `lib/features/scan/widgets/capture_button.dart` (new): public `CaptureButton` extracted from the former private `_CaptureButton`/`_CapturePainter`, unchanged visuals; owns its own `AnimationController` (`MotionDurations.captureRingSpin`, replacing a hardcoded `Duration(seconds: 1)`) driven reactively off `isCapturing` via `didUpdateWidget`. Keys: `capture-button` (outer `GestureDetector`), `capture-spinner` (the sweep `CustomPaint`, present only while capturing), `capture-core-idle`/`capture-core-capturing` (inner glyph, renamed from `capture-core-stop` since it is not a stop control).
  - `lib/features/scan/widgets/scan_mode_selector.dart` (new): public `ScanModeSelector` extracted from the former private `_ModeSelector`, unchanged visuals; the currently-active segment's `AnimatedContainer` carries key `mode-selector-thumb` (exactly one active segment at a time satisfies the RED test's `findsOneWidget`); duration now `MotionDurations.reticleSnap` (replacing a hardcoded `Duration(milliseconds: 200)`, same value).
  - `lib/features/scan/permission_screen.dart` (new): `PermissionScreen({onRegrant: Future<void> Function(), onAddManually: VoidCallback})` with a blurred-viewfinder background (`ImageFiltered` + camera icon, key `permission-blurred-viewfinder`), rationale copy, a regrant button (key `permission-regrant-button`), and an add-manually card (key `permission-add-manually-card`). `onAddManually` is a documented navigation-intent seam (Task 8 owns `RouteNames.manual`; not invented here).
  - `lib/features/scan/scan_screen.dart` rewritten: composes the public `CaptureButton`/`ScanModeSelector`; never constructs `ImagePicker`/`availableCameras()` directly (only the injected `CameraService`, cast to `DeviceCameraService` solely for the preview/flash typed seam). `initState` calls `hasPermission()`; denial sets `CaptureState.denied` and `build()` returns `PermissionScreen` in place of the camera chrome (no router redirect — matches the RED tests, which pump `ScanScreen` directly with no `GoRouter` ancestor). Shutter and LIBRARY both funnel through one shared guarded `_runCapture` helper: a strict `captureStateProvider != idle` no-op guard (no toggle-back-to-idle), shared between `_capture()`/`_pickFromLibrary()`. RECENT chip (previously a dead `onTap: () {}`) now calls `context.goNamed(RouteNames.history)` — an existing route/tab, following the same GoRouter-context precedent already used by the untested Profile-chip navigation, so no new test was added for it.
  - `lib/core/router/route_names.dart` / `app_router.dart`: added `RouteNames.permission` / `RoutePaths.permission` plus a top-level `GoRoute` rendering `PermissionScreen` (regrant re-requests via `cameraServiceProvider` and pops on success; add-manually is the same documented Task-8 seam) — `ScanScreen`'s own inline denied-state rendering remains the actual behavior exercised by tests; this route exists for deep-linkability per the plan's "route wiring" instruction.
  - One RED-test-driven correction to production logic beyond the agreed contract: `_processImage` restores the original bare `if (uid == null) return;` (no state reset) rather than adding a new reset-to-idle branch — the added reset broke `capture_guard_test.dart`'s rapid-triple-tap test, because with no `authStateProvider` override in that test, `currentUidProvider` is permanently null and an eager reset let every one of the three rapid taps clear the guard and capture again (`captureCount == 3`). `uid == null` cannot happen in production (the router requires a signed-in user before `ScanScreen` is reachable at all), so leaving the state exactly as the pre-Task-6 code did is correct, not a weakened assertion.
  - Focused GREEN command: `fvm flutter test test/scan test/scan_screen_test.dart` → `All tests passed!` (9/9: 2 `capture_guard_test`, 3 `permission_screen_test`, 1 `scan_mode_selector_test`, 3 `scan_screen_test`, including the two pre-existing un-modified tests).
  - `fvm flutter analyze` → `No issues found!` (after fixing two `prefer_const_constructors` infos and one `unnecessary_import` in the first pass).
  - Full `fvm flutter test` → `All tests passed!`, 205/205 (198 prior baseline + 7 net-new Task 6 tests).
  - At this earlier checkpoint, device runtime verification and the external post-implementation review had not yet run. That statement is superseded by the final checkpoint below.

- **Final runtime/verification checkpoint (2026-07-18):**
  - Fresh `fvm flutter test --reporter compact`: 226/226 passed.
  - Fresh `fvm flutter analyze`: `No issues found!`.
  - Physical device: explicit serial `R58R61161NA` (`SM-G780G`) only; no emulator used.
  - Camera initialization now produces a real live preview after asynchronous permission completion; denial renders the branded permission screen.
  - The settings-required path opened `com.android.settings/.applications.InstalledAppDetails` via `android.settings.APPLICATION_DETAILS_SETTINGS`; granting camera permission there and pressing Back resumed the real live preview without a lifecycle/request loop.
  - Library opened `com.google.android.documentsui/com.android.documentsui.picker.PickActivity`; Back returned to the live Scan screen.
  - The deterministic capture harness rebuilt/installed the current source and produced a clean, fully rendered `scan_idle--dark.png` only after camera initialization and three settled end-of-frame completions.
  - Real shutter/upload was intentionally not triggered on the signed-in device because it would invoke production Firestore/Storage. The rapid triple-tap guard and injected upload gateway are covered by deterministic tests; no production cloud mutation occurred.
  - Final external review in `calorix-task6-scan-permission-20260718`: `AGREEMENT_STATUS: agree`, `MUST_FIX: none`, `SHOULD_FIX: none`; reviewer explicitly accepted the cloud-safety limitation as non-blocking for Task 6 handoff.

**Task 5 — complete.**

- Branch: `main`
- Baseline: `4454727`
- Focused RED command: `fvm flutter test test/debug test/debug_reseed_test.dart` exited 1 as expected. Failures are the missing `debug_deep_links.dart`, `ui_diff_fixture.dart`, `UiDiffFixtureManifest`, `UiDiffFixtureStore`, capture signal protocol, hard debug guard, and `uiDiffFixtureEnabledProvider`; no unrelated test/setup failure occurred.
- Runtime authorization: the user explicitly authorized physical-device use when Task 5 needs it. Every execution must still specify the physical ADB serial; never auto-select a target and never use `emulator-5554`.
- Worker routing: OpenCode timed out twice with no edits (first stopped after 3+ minutes; second exited 124 after 304 seconds). Claude Code fallback failed with `You've hit your session limit · resets 7pm (Europe/Zurich)`. Host fallback is active under the repository contract.
- Review state: the corrected Task 5 design contract has a green pre-implementation review; the post-implementation fallback review also returned `AGREEMENT_STATUS: agree` with `MUST_FIX: none` and `SHOULD_FIX: none`.
- GREEN evidence: `fvm flutter test test/debug test/debug_reseed_test.dart test/today_providers_test.dart` passed 12/12. Final `fvm flutter analyze` reports `No issues found!`; final full `fvm flutter test` passed 198/198.
- Plan-only harness evidence: `today,scan_idle` × `dark` produced 2 unique nonce-bearing links and 2 unique output paths; unchanged reruns kept the same source fingerprint; controlled metadata produced `reuse-installed-build` for a matching fingerprint/APK/device and `rebuild-and-install` for a stale fingerprint. No ADB/build/install/device command ran in plan-only mode.
- Runtime smoke diagnostics: first physical run built/installed successfully but exposed unquoted `&` separators in the remote-shell deep link; a plan-level RED/GREEN assertion now covers the quoted ADB argument. The second run launched correctly but timed out because the fixture attempted a production Firestore `needs_review` write, which security rules correctly rejected. Runtime capture now installs the manifest only into local providers, performs zero anonymous sign-ins/cloud writes, and has focused 12/12 regression coverage. These failed attempts are superseded by the final successful physical smoke below.
- First successful two-screen capture saved valid 1080×2400 PNGs, but inspection found different fixture hashes because targets sampled the real clock separately. A RED/GREEN regression now carries one explicit `fixtureEpochMs=1778846400000` through every action/deep link and verifies the app uses 2026-05-15 fixture timestamps. Those first images are diagnostic only and are superseded by the final smoke below.
- Final runtime smoke: explicit physical serial `R58R61161NA` (`SM-G780G`) captured `today--dark` and `scan_idle--dark` at 1080×2400. Both metadata files record build `465db93`, shared fixture hash `8794c075d688c007bfcfbe7066b31d3518b33809d6fb356a51af8092c0792052`, fixture epoch `1778846400000`, identical source/APK hashes, exact nonce-bearing routes, and non-empty PNGs. Immediate repeat completed in 4.94 seconds with no Gradle/install output, proving fresh-build reuse. Both images were visually inspected and show their requested screens; this is exhaustive for the two-screen Task 5 smoke, not for the future 38-state gate.
- Post-review: conversation `calorix-task5-fixture-capture-20260718` returned `AGREEMENT_STATUS: agree`, `MUST_FIX: none`, `SHOULD_FIX: none` using `Gemini 3.5 Flash (High)` after the required Pro route repeatedly timed out. The successful final verdict was fact/evidence-based because repository-inspection calls timed out; host verification and exhaustive two-artifact inspection remain the primary implementation evidence.

- Branch: `main`
- Stage A baseline: `0d52b45` → commit `a2272d0` ("Add product time foundation"), pushed to origin/main
- Stage B status: commit `a54a8ba` pushed to `origin/main`
- Post-implementation review: conversation `calorix-task3-clock-timezone-20260718` returned `AGREEMENT_STATUS agree`, `MUST_FIX none`, `SHOULD_FIX none`. The MCP duplicated its complete response block verbatim; this is recorded as response noise and counted as one valid review. `git status` showed no reviewer mutation.
- Fresh host verification after final DST corrections:
  - `rg DateTime.now lib` returns exactly two hits: `lib/core/time/clock.dart` (the `RealClock` adapter — the one permitted product clock-adapter call) and `lib/debug/ui_diff/ui_diff_anchor_writer.dart` (debug artifact timestamp, operational only)
  - `fvm flutter analyze`: No issues found
  - `fvm flutter test test/core`: 79/79 passed
  - `fvm flutter test` (full suite): 177/177 passed
- Migration scope covered: `MacroTargetPlan` now requires an explicit `startDate` (no hidden `DateTime.now`); `FoodEntry` fallback date conversion uses `tz.local`; `Clock` injected through repositories, seed data, upload queue, AI chat, providers, and screens; one-time History initialization uses injected clock; calendar-based (not Duration-based) start-of-week, plan-week, and seed-history date construction; single same-read `nowTZ()` used for paired timestamp/date-key writes to prevent midnight-straddle divergence; `initializeTimezoneDatabase()` made idempotent and `clockProvider` ensures `tz.local` init before `RealClock` construction, fixing a gap surfaced by direct widget tests.
- No device/emulator interaction throughout Stage A or Stage B.
- Prior OpenCode routing record (Task 3 Stage A: three timeouts, Claude headless fallback authorized) is preserved below in the Worker routing log — unchanged.

Task 2 complete (commit bc3e420). Task 3 plan reviewed in conversation `calorix-task3-clock-timezone-20260718`: round 1 applied 6 mandatory contract corrections; round 2 agreed. External pre-implementation review round 3 returned `AGREEMENT_STATUS agree`, `MUST_FIX none`, `SHOULD_FIX none` after the DST UTC-instant correction and inspection of all 9 RED tests. Step 1: 9 test files corrected across `test/core/` based on verified timezone package API facts. Step 2 (RED): `fvm flutter test test/core` exit 1, +9 -19. Plan DST section corrected to use UTC-instant construction for first-occurrence disambiguation.

## Progress log

| Date | Task | Event |
|---|---|---|
| 2026-07-17 | 1 | HANDOFF complete — commit 0242317 pushed; focused test 6/6; analyze clean; runtime verification skipped per user safety restriction |
| 2026-07-17 | 2 | Status set pending/start-ready; no implementation started |
| 2026-07-18 | 2 | RED verified — Step 1 (tests written) and Step 2 (RED confirmed) complete; Step 3 implementation pending; harness defects corrected; no device/emulator interaction |
| 2026-07-18 | 2 | Step 3 substage A done — tab_swipe_shell implemented via OpenCode; navigatorContainerBuilder harness corrected; 8/8 tests pass; analyze clean; no device/emulator; substage B (flatten AppShell nav) next |
| 2026-07-18 | 2 | Step 3 substage B done — app_shell flattened to five equal-width nav-item-* controls; legacy FAB/glow/label removed; extendBody globally true; bar geometry stable; app_shell_test matcher corrected; 9/9 tests pass; analyze clean; no device/emulator; substage C (router/origin) next |
| 2026-07-18 | 2 | Step 3 substage C done + Step 4 GREEN — router wired to TabSwipeShell; appInitialLocation=/scan; profile pushNamed closes to origin; Food Detail Ask AI pushNamed; real AiChatScreen with ai-close/ai-close-fallback; spike production+test files removed; focused combined command 29/29; analyze clean; no device/emulator |
| 2026-07-18 | 2 | Step 5 stage verification done — fvm flutter analyze No issues found; first full fvm flutter test RED: one stale onboarding test expected LoadingScreen from production initial route conflicting with appInitialLocation=/scan; fix: test navigates real router to RoutePaths.loading preserving LoadingScreen-to-Login assertions and cold-start invariant; focused onboarding test 7/7; final full fvm flutter test 94/94 passed; checkpoint commit db084f8 pushed; Step 6 review gate next; no device/emulator |
| 2026-07-18 | 2 | Step 6 review remediation done — Antigravity disagree round 1 (calorix-task2-review-retry-20260718): 2 MUST_FIX (cross-branch FoodDetail pushNamed targets inactive AI branch; offstage widget visibility tests); 1 SHOULD_FIX (production topology test); remediation: new ai_origin_topology_test.dart (RED: missing RouteNames/RoutePaths.aiChatOverlay; GREEN: persistent AI tab /ai, root overlay /assistant aiChatOverlay, Food Detail pushes overlay with mealId, close pops origin, direct AI root falls back Scan, hitTestable assertions); focused test 19/19 passed; analyze clean; re-review pending; commit pending host |
| 2026-07-18 | 2 | HANDOFF complete — commit bc3e420 pushed to origin/main; review gate green round 2 (AGREEMENT_STATUS agree, MUST_FIX none, SHOULD_FIX none); fvm flutter analyze No issues found; fvm flutter test 98/98 passed; no device/emulator interaction |
| 2026-07-18 | 3 | Plan correction/re-review — 6 mandatory contract corrections applied to Task 3 section: expanded files/scope, corrected timezone architecture (removed ProviderRef, added SyncStatus/Diagnostic, LifecycleHandler widget, tz_data/tz aliases, synchronous initializeTimeZones), corrected Clock/date contracts (localDateKey purity, FoodEntry fallback, MacroTargetPlan startDate, DailyLog sentinel, full injection), fixed DST fall-back test, reordered steps with ALL-tests-first and DateTime.now audit; no implementation started; no device/emulator |
| 2026-07-18 | 3 | Plan review green round 2 (calorix-task3-clock-timezone-20260718): AGREEMENT_STATUS agree, MUST_FIX none, SHOULD_FIX none; corrected plan implementation-ready; Step 1 (failing tests) next; no implementation started; no device/emulator |
| 2026-07-18 | 5 | Steps 1–2 RED checkpoint — deterministic fixture, target registry, nonce protocol, separate hero override, reserved-path isolation, and hard debug guard tests written; focused command exited 1 only for missing Task 5 APIs; device use now explicitly authorized when runtime smoke is reached, with explicit physical serial only |
| 2026-07-18 | 5 | Steps 3–4 GREEN — pure one-clock fixture manifest and SHA-256 hash, reserved Firestore adapter, 19-target registry, nonce ready/blocked protocol, separate capture/fixture/theme providers, and safe capture harness implemented; focused 11/11 and analyzer clean; plan-only fresh/stale smoke passed; physical capture next |
| 2026-07-18 | 5 | Physical smoke diagnostics — explicit SM-G780G serial used; first launch found remote-shell URI quoting bug, second found Firestore rules correctly rejecting client-created review state. Both fixes implemented test-first; capture fixture is now local-only with zero auth/cloud mutation; focused 12/12; rerun pending |
| 2026-07-18 | 5 | Two captures succeeded at 1080×2400, then artifact inspection caught cross-target fixture-hash drift from separate real-clock reads. Shared explicit fixture epoch added test-first; focused 12/12 and plan assertion green; deterministic recapture pending |
| 2026-07-18 | 5 | Step 5 complete — deterministic recapture on explicit SM-G780G serial passed for today/scan dark; shared fixture/source/APK evidence verified; both artifacts visually inspected; 4.94s immediate repeat skipped build/install; Step 7 review next |
| 2026-07-18 | 5 | HANDOFF complete — code commits through 465db93 pushed; focused 12/12, analyzer clean, full 198/198; physical deterministic smoke passed; post-review fallback green with no must-fix; Task 6 next |
| 2026-07-18 | 6 | Steps 1–2 RED checkpoint — pre-implementation review green (calorix-task6-scan-permission-20260718); OpenCode timed out after 904s with zero edits, Claude Code headless (Sonnet 5) then completed the RED-only checkpoint and the host independently inspected and reran it; extended test/scan_screen_test.dart and created test/scan/capture_guard_test.dart, test/scan/permission_screen_test.dart, test/scan/scan_mode_selector_test.dart plus shared test/scan/support helpers; focused command `fvm flutter test test/scan test/scan_screen_test.dart` exited 1 with 4/4 files failing to load, all failures missing-Task-6-API compile errors only; no lib/ edits; Step 3 implementation next |
| 2026-07-18 | 6 | Steps 3–4 GREEN — user directed Claude Code (Sonnet 5) directly (no OpenCode attempt this step, given the prior 904s zero-edit timeout on this same task's RED step); redefined lib/shared/services/camera_service.dart (abstract CameraService hasPermission/requestPermission/captureStill/pickFromLibrary + production DeviceCameraService with a previewController/setFlashMode/pause/resume typed seam outside the abstract contract); CaptureState now idle/capturing/denied with cameraServiceProvider added; extracted public CaptureButton and ScanModeSelector widgets (unchanged visuals, MotionDurations-driven, required test keys added); added PermissionScreen with blurred viewfinder/regrant/add-manually seam; rewrote ScanScreen to inject CameraService, gate init on hasPermission(), share one guarded capture/library path, and wire RECENT to the existing History route; added RouteNames/RoutePaths.permission plus router wiring. One correction to an over-eager reset-to-idle branch in _processImage's uid==null path (restored the original bare early-return) was required to keep capture_guard_test.dart's rapid-triple-tap guard correct given that test's no-auth-override setup. Focused `fvm flutter test test/scan test/scan_screen_test.dart` 9/9 passed; `fvm flutter analyze` No issues found; full `fvm flutter test` 205/205 passed (198 baseline + 7 net-new). Runtime verification (Step 5), review-gate (Step 7), and HANDOFF commit/push not performed in this checkpoint; no device/emulator interaction; no commit made |
| 2026-07-18 | 6 | Physical-device hardening complete — async camera initialization rebuild, permission-first resume lifecycle, rich granted/denied/settings-required result, app-settings recovery, and screen-specific post-raster readiness implemented test-first. On explicit `R58R61161NA`: deny → PermissionScreen, settings path opened InstalledAppDetails, grant + Back → real live preview, Library → DocumentsUI picker + safe return, capture harness produced clean `scan_idle--dark.png`; no emulator and no production cloud write |
| 2026-07-18 | 6 | HANDOFF complete — implementation commit `a130f2d` pushed to `origin/main`; fresh full tests 226/226, analyzer clean, debug APK built, external post-review agree with no must-fix/should-fix; real shutter-to-production-upload E2E remains explicitly blocked for cloud safety and is not claimed |
| 2026-07-18 | 3 | Step 1 tests written — 9 test files created under test/core/: clock_test, time_shift_test, timezone_boundary_test, timezone_synchronizer_test, local_date_key_purity_test, daily_log_malformed_date_test, draft_policy_test, draft_policy_exhaustive_test, clock_injection_callsite_test; RED verification pending (fvm flutter test test/core); no device/emulator; no lib/ edits; no pubspec changes |
| 2026-07-18 | 3 | Step 1 tests corrected — 9 test files corrected in test/core/ based on verified timezone API facts: (1) tz_data import for initializeTimeZones, (2) timeZone.isDst/timeZoneOffset properties, (3) UTC-instant DST disambiguation for first occurrence, (4) FakeClock advance via original variable not abstract Clock, (5) recursive Directory.listSync in callsite test, (6) lifecycle tests with callCount proving resume triggers syncOnce and dispose stops future calls, (7) removed unused imports, (8) FakeDocumentSnapshot noSuchMethod for compile-complete, (9) removed real-time delay/current-year assertion, (10) test count corrected to 9 files; plan DST section corrected; RED verification pending; plan re-review needed for DST correction |
| 2026-07-18 | 3 | Step 2 RED complete — `fvm flutter test test/core` exit 1, +9 -19; intended causes: missing clock/clock_provider/timezone_init/timezone_utils/draft_policy modules + recursive source-contract failures; no pubspec/lock change; earlier widgets import error corrected before final RED |
| 2026-07-18 | 3 | External pre-implementation review round 3 green — calorix-task3-clock-timezone-20260718 returned AGREEMENT_STATUS agree, MUST_FIX none, SHOULD_FIX none after DST UTC-instant correction and inspection of all 9 RED tests; Step 3 implementation next |
| 2026-07-18 | 3 | Step 3 Stage A compatibility/analyzer fixes — OpenCode execution blocker: three headless calls timed out (~604s, ~604s, ~124s) on 2026-07-18, orphan processes stopped each time, no edits usable from the failed calls; Claude headless fallback used with explicit user authorization; all fallback edits independently inspected by host before verification. Stage A compatibility reason: `flutter_local_notifications` 18.0.1 constrains `timezone` to `<0.11.0`, which conflicts with the `timezone: ^0.11.1` / `flutter_timezone: ^5.1.0` pair required for Task 3's timezone architecture; resolving the conflict requires the `flutter_local_notifications` 22.0.1 upgrade, which changes `initialize()`/`show()` to named parameters (`settings:`, `id:`, `title:`, `body:`, `notificationDetails:`) — `lib/shared/services/notification_service.dart` migrated to the v22 named-parameter API, behavior preserved. Also fixed: added `super.key` to `TimezoneLifecycleHandler` (lib/core/time/timezone_init.dart); refactored `lib/shared/models/daily_log.dart` to add `DailyLog.fromMap(Map<String, dynamic> data, String id)` as the deterministic parsing contract, with `fromFirestore` delegating to it, removing the need for a sealed-`DocumentSnapshot` fake in `test/core/daily_log_malformed_date_test.dart` (rewritten to call `DailyLog.fromMap` directly); made `_CountingNativeTimezoneSource._identifier` `final` and used `const FormatException(...)` in `test/core/timezone_synchronizer_test.dart` (the mutable `_FakeNativeTimezoneSource._identifier` used by zone-change tests was left mutable). Verified `lib/shared/services/seed_data_service.dart` has no diff from HEAD b17cdea — not edited. `dart format` run on all touched files. Verification: `flutter.bat analyze --no-pub` → "No issues found!" (18.9s); focused command `flutter.bat test test/core/clock_test.dart test/core/time_shift_test.dart test/core/timezone_boundary_test.dart test/core/timezone_synchronizer_test.dart test/core/local_date_key_purity_test.dart test/core/daily_log_malformed_date_test.dart test/core/draft_policy_test.dart test/core/draft_policy_exhaustive_test.dart` → 71/71 passed. No device/emulator interaction. Task 3 Step 3 remains in progress/unchecked overall — Stage A (compatibility/analyzer) done; Stage B (clock callsite migration across repositories/services/providers/screens/models per the DateTime.now() audit) next; no commit made (host reviews/commits per contract). |
| 2026-07-18 | 3 | Stage A foundation committed — commit a2272d0 ("Add product time foundation") pushed to origin/main, closing out Stage A separately from the broader Stage B migration; no device/emulator interaction. |
| 2026-07-18 | 3 | Step 3 Stage B complete — broad clock/timezone callsite migration finished across `FoodEntryRepository`, `SeedDataService`, `UploadQueueService`, `auth_provider`, `plan_provider`, `ai_chat_providers`, `main.dart`, `app_router.dart`, and screens (`today_screen`, `history_screen`, `goals_screen`, `scan_screen`); `MacroTargetPlan.defaultPlan()` now requires an explicit `startDate`; History gained one-time clock-based initialization; semantic DST/timezone corrections applied afterward: `FoodEntryRepository.duplicate` caches a single `nowTZ()` read to prevent timestamp/date-key straddling; `SeedDataService._seedHistoryEntries` replaced Duration subtraction with calendar-based `dayOffset` construction; `selectedWeekProvider` now delegates to `timezone_utils.startOfWeek`; Goals `_planWeek` converts to `TZDateTime` and clamps week ≥ 1; `initializeTimezoneDatabase()` made idempotent and `clockProvider` now guarantees `tz.local` init before `RealClock` construction (gap found via direct widget tests). Fresh host verification: `rg DateTime.now lib` → exactly `lib/core/time/clock.dart` (RealClock adapter) and `lib/debug/ui_diff/ui_diff_anchor_writer.dart` (debug artifact timestamp); `fvm flutter analyze` → No issues found; `fvm flutter test test/core` → 79/79 passed; `fvm flutter test` (full) → 177/177 passed. Steps 3, 4, and 5 now complete. No device/emulator interaction. Stage B commit still pending; Step 6 (external review) next. |
| 2026-07-18 | 3 | Step 6 review green — conversation `calorix-task3-clock-timezone-20260718`: AGREEMENT_STATUS agree, MUST_FIX none, SHOULD_FIX none; no repository mutation. MCP response noise: complete status/rationale block duplicated verbatim, treated as one valid review. Step 7 handoff commit/push next; no device/emulator interaction. |
| 2026-07-18 | 3 | HANDOFF complete — Stage A `a2272d0` and Stage B `a54a8ba` pushed to `origin/main`; Steps 1-7 complete; analyzer clean; core 79/79; full 177/177; raw `DateTime.now()` audit contains only RealClock and debug artifact writer; no device/emulator interaction. Task 4 next. |
| 2026-07-18 | 4 | Task started — corrected stale unsafe Step 5 to deterministic host-only paint-isolation evidence; real profile frame timing remains blocked for later Tasks 16/19 until explicit authorization of a safe runtime target. Added omitted Today controller and confidence/shimmer/reduced-motion test scope. Antigravity pre-review did not pass: canonical preview slug was mapped to unrecognized `gemini-3.1-pro`; retry with advertised `Gemini 3.1 Pro (High)` timed out at the MCP boundary after 300s; `read_conversation` returned `Conversation not found`. No reviewer mutation and no device/emulator interaction. |
| 2026-07-18 | 4 | Compact Antigravity pre-review round 1 (`calorix-task4-motion-a11y-20260718b`) returned `AGREEMENT_STATUS agree` with 3 `MUST_FIX`: route `MacroProgressBar`'s internal duration through `AppMotion`; assign MediaQuery-dependent controller durations in `didChangeDependencies`; never repeat a zero-duration confidence controller. All three were added to the implementation contract; confirmation review pending. |
| 2026-07-18 | 4 | Compact Antigravity pre-review round 2 (`calorix-task4-motion-a11y-20260718b`) green: `AGREEMENT_STATUS agree`, `MUST_FIX none`, `SHOULD_FIX none`; implementation contract ready. No reviewer mutation and no device/emulator interaction. |
| 2026-07-18 | 4 | RED/GREEN implementation checkpoint — initial RED compiled as expected against missing `AppMotion`; Today reduced-motion assertion was `actual 0.0`, expected `1.0`. Paint-isolation RED proved one ring tick repainted the stable sibling (`1 -> 2`); the targeted `RepaintBoundary` kept it at `1`. Reduced-motion, confidence semantics, shell and Today accessibility gates then exposed and fixed 46px nav targets, 38px Today header targets, and light-theme contrast ratios `1.88:1`/`4.16:1`. Final evidence: focused motion/a11y/Today 24/24; expanded a11y/Today/shell 29/29; `fvm flutter analyze` no issues; `fvm flutter test` 188/188. This is host-only isolation/correctness evidence, not raster timing; no device/emulator interaction. Post-review next. |
| 2026-07-18 | 4 | Post-review round 1 (`calorix-task4-motion-a11y-20260718b`) agreed on motion/lifecycle but returned 3 semantic `MUST_FIX`: split static confidence semantics from the interactive review button, exclude avatar initials under its custom label, and strengthen tests against duplication. RED evidence: confidence semantic key absent; avatar label was `Open profile\nEK`. GREEN remediation: static confidence group now has exact `Review 65% confidence` with descendants excluded; `Needs review` remains a separate button action; avatar label is exactly `Open profile`; semantic-tree test rejects duplicate labels. A full-suite-only test-owner null exposed concurrent-test fragility; helper changed to the active `RenderView.owner`, matching Flutter's own accessibility traversal. Fresh evidence: focused a11y 3/3; analyzer clean; full 189/189. Re-review pending; no device/emulator interaction. |
| 2026-07-18 | 4 | HANDOFF complete — post-review round 2 green in `calorix-task4-motion-a11y-20260718b`: `AGREEMENT_STATUS agree`, `MUST_FIX none`, `SHOULD_FIX none`. Commits `2365d63` and `4cf8bbe` pushed to `origin/main`; all Task 4 plan steps complete. Real profile p50/p95/max raster timing remains blocked for Tasks 16/19 until explicit authorization of a known-safe runtime target and was not claimed here. Task 5 next; no device/emulator interaction. |
| 2026-07-18 | 4 | Antigravity response noise — post-review created untracked `diff_a11y.txt` and `diff_today.txt` despite the explicit no-write prompt. Both were inspected and contained only `git show` output for commit `2365d63`; they were removed immediately. No tracked source mutation occurred. |
| 2026-07-18 | 5 | Task started — stale device-smoke contract replaced with host-only plan/fingerprint verification. Runtime capture requires explicit `-Execute` plus `-DeviceId`, may never auto-select a target, and remains blocked until user authorization. Pre-review next; no device/emulator interaction. |
| 2026-07-18 | 5 | Antigravity pre-review round 1 (`calorix-task5-fixture-capture-20260718`) disagreed with 5 `MUST_FIX`: fixed IDs/full fixture scope, hard debug guard, safe handling of unimplemented targets, query-driven theme/screen routing, and concrete readiness signal. Contract revised with reserved fixture namespace (never broad user-data wipe), pure manifest/in-memory store tests, canonical hash, separate fixture/theme providers, typed available/blocked targets, and nonce-specific ready/blocked log protocol. Confirmation review pending; no implementation or device interaction. |
| 2026-07-18 | 5 | Antigravity pre-review round 2 (`calorix-task5-fixture-capture-20260718`) green: `AGREEMENT_STATUS agree`, `MUST_FIX none`, `SHOULD_FIX none`. Corrected implementation contract ready; Step 1 RED tests next. No reviewer mutation and no device/emulator interaction. |
| 2026-07-18 | 5 | Pre-RED consistency correction — target output is now a typed registry (matching availability requirements). Fixture contract distinguishes raw visible-card sum `845` from production accepted sum `800`, because the 45-kcal/62%-confidence card is intentionally excluded until confirmation; visual-only hero remains `1420`. This avoids encoding a product regression in the RED tests. |
| 2026-07-18 | 5 | Antigravity consistency confirmation green in the same conversation: `AGREEMENT_STATUS agree`, `MUST_FIX none`, `SHOULD_FIX none`; raw `845` / accepted `800` / visual `1420` and typed registry contracts approved. |
