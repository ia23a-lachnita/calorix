# Complete Handoff Screens and Product Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring all 19 canonical handoff screen IDs to product quality in both themes — flat five-tab navigation with horizontal swipes, still-photo scan pipeline, complete CRUD, persisted assistant chat, injectable product clock — and prove it with a 38-state visual program, connected-device E2E matrix, performance/accessibility gates, and external review evidence.

**Architecture:** The app is a Flutter (FVM) + Riverpod + go_router `StatefulShellRoute` client over Firebase (Auth/Firestore/Storage/Messaging) with TypeScript Cloud Functions doing cloud analysis. Cross-cutting seams land first (navigation architecture from a spike, injectable clock, motion/accessibility policy, deterministic fixture + deep-link capture harness), then screen groups are completed in dependency order, and everything funnels into E2E, ui-diff visual gates, and final release evidence.

**Tech Stack:** Flutter/Dart via FVM, Riverpod, go_router, google_fonts (Geist + Geist Mono), camera, image_picker, shared_preferences, firebase_auth / cloud_firestore / firebase_storage / firebase_messaging, Cloud Functions (TypeScript), Firebase emulators, ui-diff MCP pipeline, adb, Antigravity MCP review.

**Spec:** `docs/superpowers/specs/2026-07-17-complete-handoff-screens-and-product-quality-design.md` (approved). Source-of-truth order: `requirements.md` → `docs/design-handoff/placeholder-app/README.md` → `.claude/design.md` → the spec. JSX in `docs/design-handoff/placeholder-app/src/` is exact visual truth; reference PNGs in `reference-images/` are visual gates; when they disagree, JSX wins (PNGs band on gradients).

## Global Constraints

- All Flutter/Dart commands use FVM: `fvm flutter <args>`, `fvm dart <args>` (Task 0 records the exact working invocation if the FVM pin is broken in this checkout; every later command substitutes the recorded invocation).
- Workers (OpenCode / Claude Code headless) **never commit or push**. Only the host reviews, verifies, updates checkboxes, commits, and pushes.
- Commit messages: plain imperative English. The pre-commit hook rejects `AI`, `Bot`, `Claude`, `Gemini`, `Generated`, `Automated`, `Sonnet`, `Anthropic`, and any `Co-Authored-By:` trailer. Write "assistant" instead of "AI". Never use `--no-verify`.
- No production deployment, cloud deletes, or production data mutation — ever, in any task. Cloud writes happen only against Firebase emulators. Live network calls are read-only contract checks (Open Food Facts).
- Preserve existing untracked artifacts; do not delete or overwrite: `.claude/ui-diff-runs/`, `.gemini/settings.json.bak-20260517-220447`, `assets/calorix_icons/`, `docs/screenshots/*.png`.
- Flat five-tab navigation (equal-width, no Scan FAB) and still-photo-only capture (no video, no stop square) are **settled, pre-approved deviations** from the handoff pixels/JSX (spec §17). Document them wherever they surface a diff; never "fix" them back.
- Tab order: Today · History · Scan · Goals · AI. Scan index 2. Cold start always lands on Scan; tab state preserved only within a session.
- No pure `#FFFFFF` / `#000000` tokens. Protein blue `#3A5BFF`, carbs cyan `#19D3D9`, fat green `#1FCC74`, amber review `#F6A63A`.
- Typography: Geist (UI) + Geist Mono (eyebrow labels + all numerals), tabular figures. Hairlines 0.5px. Exact JSX values — no snapping to 4/8 grids.
- Confidence threshold: ≥80% confirmed, <80% review branch. Serving multiplier: 0.25× steps, range 0.25–5.0×, macros scale proportionally.
- Motion per spec §7 catalog; reduced motion via `MediaQuery.disableAnimationsOf(context)` snaps to final frame; profile mode measures real animations, never disables them.
- Minimum tap target 44×44 logical px; semantic labels; no color-only status indicators.
- The Today fixture hero override (1,420 kcal / 96g P / 132g C / 38g F vs the real 845 kcal / 74g P / 92g C / 20g F card sum) exists **only** inside the ui-diff fixture harness. Production aggregation always sums real entries.
- Runtime safety: do not launch an emulator or interact with/install/run on a physical device without explicit user confirmation. The former `emulator-5554` target was removed after a host/device safety incident. Any device-only gate remains blocked, rather than silently substituted or marked passed, until the user authorizes a known-safe runtime target.
- Keep large logs out of the conversation; evidence goes to `docs/implementation-status.md` and `.ui-diff/runs/` run IDs.

## Execution and Delegation Contract

The user has chosen delegated execution. Do not re-ask.

### Worker ladder

1. **Primary — OpenCode** (all repository file edits and token-heavy implementation):

   ```
   opencode run --model opencode/mimo-v2.5-free --auto --dir C:\Users\xursc\projects\calorix "<task prompt>"
   ```

2. **Fallback — Claude Code headless**, only after OpenCode reports exact quota exhaustion, is unavailable, or repeatedly stalls (record the exact error/stall evidence in `docs/implementation-status.md` first):

   ```
   claude -p --dangerously-skip-permissions --model <model> "<task prompt>"
   ```

   Model routing: `fable` for architecture and hard-correctness tasks (Tasks 1, 2, 3, 7, 9, 14); `sonnet` for bounded UI/tests tasks (Tasks 4, 5, 6, 8, 10, 11, 12, 13, 15, 16); `opus` only for exceptional cross-system debugging/review no other route resolves.

3. **Codex** orchestrates, researches, reviews, and verifies. Codex never implements code. The host (main agent) commits and pushes.

### WORKER-RUN protocol (referenced by tasks as "WORKER-RUN Task N")

Invoke the current worker (ladder above) with this prompt template, filling in the task number and step range:

> Read docs/superpowers/plans/2026-07-17-complete-handoff-screens-product-quality.md, section "Task N". Implement exactly the worker steps listed there (tests first, then implementation). Obey the plan's Global Constraints. Do not commit, push, or modify docs/implementation-status.md or the plan file. Stop after the listed steps and report what you changed.

### HANDOFF protocol (referenced by tasks as "HANDOFF Task N")

1. Worker stops; host runs `git status` and `git diff` and inspects every changed file (never merge blindly).
2. Host runs the task's verification commands and confirms the expected output verbatim.
3. Host updates `docs/implementation-status.md` (task row → done, evidence links) and checks off this plan's boxes for the task.
4. Host commits with the task's commit message and pushes to `origin/main`.

### REVIEW-GATE protocol (referenced by tasks as "REVIEW-GATE Task N")

Required for every substantive (multi-file / behavior-changing / security-touching / parity-affecting) diff, both as pre-review for architecture/data-model/rules changes and post-review after implementation. Trivial single-file edits may skip pre-review; record why in `docs/implementation-status.md`.

1. Host calls `mcp__antigravity-mcp__ask-ai` with `approvalMode: "yolo"`, and the persistent `conversationId: "calorix-handoff-2026-07-17"`. Model routing order: (1) `"Gemini 3.6 Flash (High)"` primary, (2) `"Gemini 3.1 Pro (High)"` fallback, (3) `"Gemini 3.5 Flash (High)"` final fallback. All calls remain Antigravity MCP ask-ai with the existing strict read-only/no-mutation prompt. If one route fails before review, try the next in order and record the exact error.
2. The prompt summarizes the task diff and always includes verbatim: **"Do not edit files, do not run write commands, and do not mutate the repository; only inspect, reason, review, and propose changes for the main agent to apply. Reply with AGREEMENT_STATUS and MUST_FIX."**
3. Green only when the response explicitly reports `AGREEMENT_STATUS: agree` **and** `MUST_FIX: none`. Apply must-fix feedback via WORKER-RUN and continue the same conversation until green. An empty/noisy response is not green.
4. After every review call, run `git status`; revert any unexpected mutation (reviewer wrapper noise has mutated the repo before).
5. If the MCP tool/model is unavailable, record the exact error in `docs/implementation-status.md`; do not substitute a CLI review.

## Planning Notes — Execution-Routing Evidence (2026-07-17)

Recorded strictly as routing evidence for the worker ladder; it has no bearing on task content:

- Two OpenCode long-spec-document calls stalled on 2026-07-17.
- Small OpenCode edits succeeded on the same day (OpenCode remains primary for code-sized edits).
- A later OpenCode plan-writing call failed after 474s with `Streaming response failed` before creating the file.
- Claude Fable rewrote the spec successfully, but its shell wrapper process lingered after process exit (check for and kill orphaned wrappers after headless runs).
- One small Claude call hit the session usage limit before 19:00 and the limit later reset (headless fallback capacity is time-windowed; retry after reset rather than escalating models).

Consequence baked into this plan: long single-shot document generation is not delegated to OpenCode; implementation prompts stay code-sized and task-scoped. This plan file itself was written by the fallback writer under that recorded failure.

## Canonical Coverage Map (19 IDs × 2 themes)

Every canonical ID maps to an owning implementation task; all 38 visual states (each ID × dark + light) are captured and gated in Task 17 and re-verified in the final gate (Task 19). Behavior-only cases (denial/regrant, stale notification, offline, rapid taps, keyboard, repeated visits, empty/error/loading) are owned by Tasks 6, 7, 16, and 18 inside their parent screens and do not inflate the 38.

| # | ID | Owning task(s) | Visual gate | Final gate |
|---|---|---|---|---|
| 1 | `loading` | 15 | 17 | 19 |
| 2 | `login` | 15 | 17 | 19 |
| 3 | `permission` | 6 (flow + screen), 15 (parity polish) | 17 | 19 |
| 4 | `scan_idle` | 2 (nav), 6 | 17 | 19 |
| 5 | `scan_capturing` | 6 | 17 | 19 |
| 6 | `processing` | 7 | 17 | 19 |
| 7 | `review` | 8 | 17 | 19 |
| 8 | `manual` | 8 | 17 | 19 |
| 9 | `today` | 11 | 17 | 19 |
| 10 | `today_empty` | 11 | 17 | 19 |
| 11 | `food` | 10 | 17 | 19 |
| 12 | `food_edit` | 10 | 17 | 19 |
| 13 | `history_week` | 12 | 17 | 19 |
| 14 | `history_month` | 12 | 17 | 19 |
| 15 | `goals` | 13 | 17 | 19 |
| 16 | `goals_select` | 13 | 17 | 19 |
| 17 | `ai` | 14 | 17 | 19 |
| 18 | `ai_history` | 14 | 17 | 19 |
| 19 | `profile` | 15 | 17 | 19 |

---

### Task 0: Baseline, Inventory, and Persistent Status Tracker

Host-only bookkeeping task (no product code). The host performs it directly; this is the recorded exception to worker delegation because it produces the tracking document the delegation itself depends on.

**Files:**
- Create: `docs/implementation-status.md`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `docs/implementation-status.md` — the persistent tracker every later task updates at HANDOFF; the recorded working Flutter/functions command set; the recorded baseline commit hash.

- [x] **Step 1: Record baseline facts**

Run each and note outputs for the status doc:

```powershell
git rev-parse HEAD
git status --porcelain
fvm flutter --version
```

Expected: current commit hash; untracked list containing exactly the artifacts named in Global Constraints (verify none are missing/renamed); Flutter version string. If `fvm flutter` fails (FVM pin broken in this checkout — a previously observed condition), record the exact error and the working global `flutter` invocation; all later `fvm flutter` commands in this plan then substitute the recorded invocation.

- [x] **Step 2: Record toolchain health**

```powershell
fvm flutter pub get
fvm flutter analyze
fvm flutter test
npm --prefix functions run
npm --prefix functions run build
```

Expected: `pub get` succeeds; `analyze` reports `No issues found!` or the failures are recorded verbatim; `test` pass/fail counts recorded (do not fix failures in this task); `npm run` lists the functions scripts — record the exact build/test/rules-test script names for Tasks 9/14/19; functions build succeeds or its exact error is recorded.

- [x] **Step 3: Create `docs/implementation-status.md`**

```markdown
# Implementation Status — Complete Handoff Screens and Product Quality

Plan: docs/superpowers/plans/2026-07-17-complete-handoff-screens-product-quality.md
Baseline commit: <hash from Step 1>
Flutter command: <recorded invocation>   Functions scripts: <recorded names>
Preserved untracked artifacts (verified present at baseline): .claude/ui-diff-runs/, .gemini/settings.json.bak-20260517-220447, assets/calorix_icons/, docs/screenshots/*.png

## Task ledger
| Task | Status | Worker used | Review gate | Commit | Evidence |
|---|---|---|---|---|---|
| 0 | in progress | host | n/a (bookkeeping) | — | — |
| 1–19 | pending | — | — | — | — |

## Worker routing log
| Date | Call | Result (exact error if failed) |
|---|---|---|
| 2026-07-17 | OpenCode long spec call ×2 | stalled |
| 2026-07-17 | OpenCode small edits | succeeded |
| 2026-07-17 | OpenCode plan call | failed after 474s: "Streaming response failed", no file created |
| 2026-07-17 | Claude Fable spec rewrite | succeeded; shell wrapper lingered after process exit |
| 2026-07-17 | Claude small call | session limit before 19:00; later reset |

## Review-gate log
(one row per REVIEW-GATE call: task, conversationId, AGREEMENT_STATUS, MUST_FIX, git-status-after)

## Visual evidence log
(one row per ui-diff run: run ID, screens, status, auditLimited, unresolved count, verdict)

## Blocked gates
(gates recorded as blocked — e.g. real cloud processing without authorization — are listed here, never marked passed)
```

- [x] **Step 4: Verify tracker committed cleanly (HANDOFF Task 0)**

```powershell
git add docs/implementation-status.md
git commit -m "Add implementation status tracker with baseline inventory"
git push
```

Expected: pre-commit hook passes; push succeeds; `git status` afterwards shows only the preserved untracked artifacts.

---

### Task 1: Navigation Architecture Spike (Swipe Between Tabs)

Pre-implementation architecture task — REVIEW-GATE required **before** Task 2 builds on the outcome. Compares (A) custom `navigatorContainerBuilder` on `StatefulShellRoute` with `PageView`-hosted branch navigators vs (B) shell-level swipe recognition with an animated branch transition over the existing `IndexedStack`. The spike proves direct-manipulation conflict resolution, per-tab state preservation, and interruptibility before anything is adopted.

**Files:**
- Create: `lib/debug/spike_nav/spike_shell_a.dart` (approach A: `navigatorContainerBuilder` + `PageView` branch navigators)
- Create: `lib/debug/spike_nav/spike_shell_b.dart` (approach B: shell-level `HorizontalDragGestureRecognizer` + animated slide between branch containers)
- Create: `lib/debug/spike_nav/spike_harness.dart` (five stub tabs embedding the real conflict widgets: a `Slider`, a horizontal `ListView`, a week-strip-like horizontal gesture area, a `TextField`, and a vertical scroll list)
- Test: `test/spike_nav/spike_conflict_test.dart`

**Interfaces:**
- Consumes: `docs/implementation-status.md` from Task 0.
- Produces: a recorded decision (A or B) with rationale in `docs/implementation-status.md`, and the winning spike file, which Task 2 hardens into `lib/shell/tab_swipe_shell.dart` with the exact public contract `TabSwipeShell({required StatefulNavigationShell shell, required List<Widget> children})`.

- [x] **Step 1 (worker): Write the failing conflict/state/interruptibility test matrix**

The same test group runs against both approaches via a parameterized pump:

```dart
// test/spike_nav/spike_conflict_test.dart
enum SpikeApproach { branchPageView, shellRecognizer }

Future<void> pumpSpike(WidgetTester tester, SpikeApproach approach) async { /* pumps spike_harness with the chosen shell */ }

for (final approach in SpikeApproach.values) {
  group('$approach', () {
    testWidgets('slider drag does not change tab', (tester) async {
      await pumpSpike(tester, approach);
      await tester.drag(find.byType(Slider), const Offset(-140, 0));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('tab-body-0')), findsOneWidget);
    });
    testWidgets('horizontal list drag inside its bounds does not change tab', (tester) async { /* drag find.byKey(ValueKey('h-list')) */ });
    testWidgets('swipe on non-interactive content moves to adjacent tab', (tester) async { /* fling body, expect tab-body-1 */ });
    testWidgets('released mid-swipe below threshold settles back (interruptible)', (tester) async { /* drag 40px, release, expect tab-body-0 */ });
    testWidgets('scroll offset and TextField content survive tab away and back', (tester) async { /* scroll 300px, type "abc", swipe away, swipe back, assert both */ });
    testWidgets('reverse fling mid-transition lands on origin tab', (tester) async { /* start fling, pump 80ms, fling opposite, settle, assert tab-body-0 */ });
  });
}
```

- [x] **Step 2: RED**

Run: `fvm flutter test test/spike_nav/spike_conflict_test.dart`
Expected: FAIL — compilation errors (`SpikeShellA`/`SpikeShellB` not defined).

- [x] **Step 3 (worker): Implement both spike shells minimally** — approach A uses `StatefulShellRoute(navigatorContainerBuilder: <builder>)` returning a `PageView` whose children are the branch navigators with an outer `PageController` synced to `shell.currentIndex`; approach B keeps `StatefulShellRoute.indexedStack` and wraps the active container in a `RawGestureDetector` with a horizontal drag recognizer that drives an `AnimationController` slide between current and adjacent branch. Direct-manipulation policy in both: an inner scrollable/slider that accepts the gesture wins (test via gesture arena — no `absorbPointer` hacks).

- [x] **Step 4: GREEN**

Run: `fvm flutter test test/spike_nav/spike_conflict_test.dart`
Expected: PASS for at least one approach across all six behaviors. If only one approach passes fully, that is the decision signal; record per-approach results.

- [x] **Step 5: Runtime feel check** — Runtime check attempted but blocked/aborted due to infrastructure/device incident: Pixel_8_API35_GoogleAPIs was unavailable under plan's old ID; direct software and host-GPU boots left emulator-5554 offline with hanging QEMU CPU/main-loop threads; user's phone shut down and had to be rebooted; all emulator/QEMU processes terminated and emulator-5554 removed; aborted `flutter run` terminated before evidence — not counted. Architecture review (Antigravity, conversation calorix-navigation-spike-20260717) explicitly accepted the automated test evidence in lieu of runtime. DO NOT launch emulators or touch/install/run on physical device again without explicit user confirmation.

- [x] **Step 6: Decide, gate, and delete the rejected spike** — host records the decision + rationale + per-approach test results in `docs/implementation-status.md`; REVIEW-GATE Task 1 (pre-implementation architecture gate) until green; then `git rm lib/debug/spike_nav/spike_shell_<rejected>.dart` (keep the winner and harness until Task 2 absorbs them).

- [x] **Step 7: HANDOFF Task 1**

```powershell
fvm flutter analyze
git add -A
git commit -m "Record tab swipe navigation spike decision"
git push
```

Expected: analyze clean; hook passes; push succeeds.

---

### Task 2: Flat Five-Tab Navigation, Swipes, and Origin-Preserving Routes

**Files:**
- Create: `lib/shell/tab_swipe_shell.dart` (hardened winner from Task 1)
- Modify: `lib/shell/app_shell.dart` (remove Scan FAB widget and gradient ring; five equal-width `Expanded` items; accent dot + bolder stroke for active; consistent nav material/height/safe areas everywhere; keep the translucent "floating" variant over camera but with equal-width items)
- Modify: `lib/core/router/app_router.dart` (initial location `/scan`; profile as root-level push route; AI-close origin logic with tested `canPop()` fallback to Scan; wire `TabSwipeShell`)
- Modify: `lib/core/router/route_names.dart` (ensure `profile` route name; others land in their own tasks)
- Delete: `lib/debug/spike_nav/` (absorbed)
- Test: modify `test/app_shell_test.dart`; create `test/shell/tab_swipe_shell_test.dart` (port the six spike behaviors against the real shell); create `test/router/origin_return_test.dart`

**Interfaces:**
- Consumes: spike decision (Task 1).
- Produces: `TabSwipeShell({super.key, required StatefulNavigationShell shell, required List<Widget> children})` — later tasks assume swipes exist and tab state is preserved; `RouteNames.profile`; router invariant "cold start → `/scan`".

- [x] **Step 1 (worker): Write failing tests**

```dart
// test/router/origin_return_test.dart
testWidgets('closing profile opened from Today returns to Today, not Scan', (tester) async {
  await pumpApp(tester, initialLocation: '/today');
  await tester.tap(find.byKey(const ValueKey('today-avatar')));
  await tester.pumpAndSettle();
  expect(find.byType(ProfileSheet), findsOneWidget);
  await tester.tap(find.byKey(const ValueKey('profile-close')));
  await tester.pumpAndSettle();
  expect(find.byType(TodayScreen), findsOneWidget); // reported Profile→Scan regression
});
testWidgets('closing profile opened from Scan returns to Scan', (tester) async { /* same from /scan */ });
testWidgets('assistant close returns to origin; stale deep link falls back to Scan', (tester) async { /* push /ai from food detail → pop returns; cold deep-link /ai → close lands /scan and asserts the fallback branch key ValueKey('ai-close-fallback') */ });
testWidgets('cold start lands on Scan', (tester) async { /* pumpApp default → ScanScreen visible */ });
testWidgets('nav has five equal-width items and no FAB overhang', (tester) async { /* widths of 5 items equal within 1px; no widget with key ValueKey('scan-fab') */ });
testWidgets('Android back on a branch root does not orphan routes', (tester) async { /* simulate pop intent on /today root → app-level behavior, no crash */ });
```

TabSwipeShell contract requirements (must be satisfied by Step 3 implementation):

- **AutomaticKeepAliveClientMixin wrapper:** `TabSwipeShell` must wrap each `StatefulNavigationShell` branch child in a widget that mixes in `AutomaticKeepAliveClientMixin`, uses a stable `Key` (derived from the branch index), and sets `wantKeepAlive` to `true`. This guarantees per-tab state (scroll offsets, text fields, form state) survives when the user navigates away and back, satisfying the six spike behaviors ported into `tab_swipe_shell_test.dart`.

- **didUpdateWidget for external currentIndex sync:** When `navigationShell.currentIndex` changes externally (deep-link navigation, tab-bar taps, profile-pop origin return), `TabSwipeShell`'s `didUpdateWidget` must detect the index delta and drive the `PageController` to the new page — animating for adjacent taps but snapping (no animation) for non-adjacent jumps (e.g., deep link from tab 0 to tab 4). The `onPageChanged` callback must include index guards that prevent feedback loops: when the controller-driven page already matches `currentIndex`, `onPageChanged` must not re-notify the shell, and when an external `didUpdateWidget` drives the controller, `onPageChanged` must be suppressed until the driven animation completes.

- **extendBody stability:** The parent `app_shell` `Scaffold` must keep `extendBody` globally stable (prefer `extendBody: true` with content and nav safe-area handling) instead of toggling `extendBody` by `currentIndex`. Swiping between tabs must never cause a layout jump from safe-area changes.

Focused tests to add in `test/shell/tab_swipe_shell_test.dart`:

- **External currentIndex sync / no loop:** set up a shell with a mock or overridden `StatefulNavigationShell` whose `currentIndex` changes externally (simulating deep link or nav tap); assert the `PageController` moves to the correct page; assert `onPageChanged` does not fire a second index update (no feedback loop).

- **State survival after tab 0 → tab 4 → tab 0 traversal:** pump `TabSwipeShell` with all five branch children, enter text or scroll on tab 0, swipe/fling to tab 4, assert tab 0's text/scroll is gone, swipe back to tab 0, assert the original text/scroll offset is restored (proving `AutomaticKeepAliveClientMixin` + stable keys).

- [x] **Step 2: RED** — Run: `fvm flutter test test/router/origin_return_test.dart test/shell/tab_swipe_shell_test.dart test/app_shell_test.dart` → Expected: FAIL (missing `TabSwipeShell`, FAB still present, origin regressions).

- [x] **Step 3 (worker): Implement** nav flattening, `TabSwipeShell` hardening (wrapping each branch child in an `AutomaticKeepAliveClientMixin` widget with stable key + `wantKeepAlive: true`; implementing `didUpdateWidget` to detect external `currentIndex` changes and animate/snap `PageController` only when different, with `onPageChanged` index guards preventing feedback loops), parent `app_shell` `Scaffold` with stable `extendBody` (prefer `true`, handle safe-area insets via padding/constraints instead of toggling `extendBody`), profile push route (`context.pushNamed(RouteNames.profile)` from every entry point; close button and swipe-down both `context.pop()`), AI-close origin handling with visible intentional fallback, and spike-folder deletion.

- [x] **Step 4: GREEN** — Run the same three test files → Expected: PASS, all tests.

- [x] **Step 5: Stage verification** — Run: `fvm flutter analyze` → `No issues found!`; then `fvm flutter test` → no regressions vs the Task 0 baseline counts.

- [x] **Step 6: REVIEW-GATE Task 2** (multi-file, behavior-changing) until green.

- [x] **Step 7: HANDOFF Task 2**

```powershell
git add -A
git commit -m "Adopt flat five-tab navigation with swipe and origin-preserving routes"
git push
```

---

### Task 3: Injectable Product Clock, Timezone Synchronizer, Calendar Utilities, and Draft Policy

No device/emulator required for this task — all verification is unit tests and static analysis.

**Files:**
- Create: `lib/core/time/clock.dart` (Clock abstract class, RealClock, FakeClock)
- Create: `lib/core/time/clock_provider.dart` (clockProvider Riverpod Provider)
- Create: `lib/core/time/timezone_init.dart` (NativeTimezoneSource, FlutterTimezoneSource, TimezoneSynchronizer, TimezoneSyncStatus, TimezoneSyncDiagnostic, TimezoneLifecycleHandler)
- Create: `lib/core/time/timezone_utils.dart` (startOfDay, startOfWeek, startOfMonth, dateKeyFor, weekKeyFor, monthKeyFor, yearKeyFor)
- Create: `lib/core/policy/draft_policy.dart` (DraftType, DraftPolicy, draftPolicyFor)
- Modify: `pubspec.yaml` — add `timezone: ^0.11.1` (alias `tz_data` for `timezone/data/latest_all.dart`, alias `tz` for `timezone/timezone.dart`; never duplicate aliases) and `flutter_timezone: ^5.1.0` (native platform timezone identifier; use package: `flutter_timezone`)
- Modify: `lib/shared/utils/date_key.dart` (localDateKey keeps DateTime signature, removes toLocal, extracts supplied year/month/day; instant→device-zone conversion uses `tz.TZDateTime.from(instant, tz.local)`)
- Modify: `lib/main.dart` — after `WidgetsFlutterBinding.ensureInitialized()`, synchronously call `tz_data.initializeTimeZones()` (returns void, NOT await), then create `TimezoneSynchronizer`, call `await synchronizer.syncOnce()`, then wrap `ProviderScope`/`CalorixApp` in `TimezoneLifecycleHandler`
- Modify: `lib/shared/repositories/food_entry_repository.dart` — inject Clock; local calendar keys use `clock.nowTZ()`; FoodEntry fallback date must use `tz.TZDateTime.from(instant, tz.local)`, not `DateTime.toLocal`
- Modify: `lib/shared/services/upload_queue_service.dart` — inject Clock
- Modify: `lib/shared/services/seed_data_service.dart` — inject Clock
- Modify: `lib/shared/providers/auth_provider.dart` — inject Clock where DateTime.now was used for local calendar keys
- Modify: `lib/shared/providers/plan_provider.dart` — inject Clock where DateTime.now was used for local calendar keys
- Modify: `lib/features/ai_chat/providers/ai_chat_providers.dart` — inject Clock into ChatMessagesNotifier
- Modify: `lib/features/today/today_screen.dart` — read clockProvider for display-time calendar keys
- Modify: `lib/features/history/history_screen.dart` — read clockProvider for week/month view navigation
- Modify: `lib/features/history/history_day_screen.dart` — read clockProvider for day-view date display
- Modify: `lib/features/goals/goals_screen.dart` — read clockProvider for period calculations
- Modify: `lib/features/scan/scan_screen.dart` — read clockProvider for scan timestamp calendar key
- Modify: `lib/shared/models/daily_log.dart` — deterministic malformed-date handling resolving to sentinel `'1970-01-01'` (no DateTime.now fallback; see clock contract below)
- Modify: `lib/shared/models/macro_target_plan.dart` — defaultPlan requires explicit startDate or Clock; no hidden DateTime.now

**Exact Architecture:**
- Aliases: `tz_data` for `timezone/data/latest_all.dart`, `tz` for `timezone/timezone.dart`.
- `initializeTimezoneDatabase()` synchronously calls `tz_data.initializeTimeZones()` **once** in `main` after `WidgetsFlutterBinding.ensureInitialized` and before native lookup. Never say `await initializeTimeZones`.
- `NativeTimezoneSource.getLocalTimezoneIdentifier`; Flutter source returns `(await FlutterTimezone.getLocalTimezone()).identifier` (5.1.0 API).
- `TimezoneSynchronizer` has **no** `ProviderRef`. It takes `source` + optional diagnostic callback.
- `enum TimezoneSyncStatus { updated, unchanged, fallbackUtc, retainedPrevious }`. Immutable `TimezoneSyncDiagnostic(status, requestedIdentifier?, activeIdentifier, error?)`.
- `syncOnce` rules: unchanged → no `setLocalLocation`; valid changed → set local. Failure before any valid → explicitly sets `Etc/UTC` and emits/returns `fallbackUtc`. Failure after valid → preserves prior location and emits/returns `retainedPrevious`. Startup never crashes.
- `TimezoneLifecycleHandler` root `StatefulWidget` owns `addObserver`/`removeObserver`; `resumed` uses `unawaited(syncOnce())`. `main` initializes DB, creates synchronizer, awaits `syncOnce`, then wraps `ProviderScope`/`CalorixApp`.
- `RealClock` reads `tz.local`; no Riverpod invalidation.
- `Clock`/`FakeClock`/`clockProvider`.
- `timezone_utils` exposes `startOfDay`/`startOfWeek` (calendar-based), `startOfMonth`, and `dateKeyFor`/`weekKeyFor`/`monthKeyFor`/`yearKeyFor`.
- `localDateKey` retains `DateTime` signature, removes `toLocal`, extracts supplied year/month/day. Instant conversion uses `tz.TZDateTime.from(instant, tz.local)`.
- FoodEntry fallback date conversion uses `tz.local`, not `DateTime.toLocal`.
- `MacroTargetPlan.defaultPlan` requires explicit `startDate`/`Clock`; no hidden `now`.
- `DailyLog` malformed or missing persisted date keys resolve to the fixed domain sentinel date key `'1970-01-01'`, **never** wall-clock `DateTime.now()`. If the actual model API makes a literal string sentinel impossible, use the model's nullable/error representation for the same sentinel contract. Tests must assert the `'1970-01-01'` sentinel for malformed input and never-now.
- Clock injected into `FoodEntryRepository`, `UploadQueueService`, `SeedDataService`, `ChatMessagesNotifier` and provider/callers. Screens/providers read `clockProvider`. Server timestamps remain server timestamps; local calendar keys use `clock.nowTZ`.
- All product `DateTime.now()` call sites in repositories, upload queue, seed data, Today/History/Goals UI/providers, AI chat timestamps, and model defaults are migrated now. Only operational debug/log/analytics/artifact timestamps may remain; Step 5 lists every remaining call with reason.
- `DraftType`/`DraftPolicy` exhaustive switch as originally specified.
- DST fall-back test: construct the first 02:30 occurrence via `tz.TZDateTime.from(DateTime.utc(2026,10,25,0,30), berlin)` — the ambiguous wall-clock constructor `tz.TZDateTime(berlin, 2026,10,25,2,30)` resolves to the second standard-time occurrence, so UTC-instant construction disambiguates the first; advance one absolute hour, assert same date and repeated local 02:30 with changed `timeZoneOffset` and `timeZone.isDst`. **No** `tz.isDaylightSavings` constructor argument.
- restart-shaped cases remain Task 16.
- no device/emulator needed.

**Interfaces:**
- Consumes: `timezone` package (IANA tz database for DST-aware boundary math), `flutter_timezone` (native platform timezone identifier).
- Produces (used by Tasks 5, 11, 12, 13, 16):

```dart
// lib/core/time/clock.dart
import 'package:timezone/timezone.dart' as tz;

abstract class Clock {
  tz.TZDateTime nowTZ();       // DST-aware current time from tz.local
  DateTime now();               // wall-clock fallback for operational timestamps only
}

class RealClock implements Clock {
  @override
  tz.TZDateTime nowTZ() => tz.TZDateTime.now(tz.local);
  @override
  DateTime now() => DateTime.now();
}

class FakeClock implements Clock {
  FakeClock(this._fake);
  tz.TZDateTime _fake;
  @override
  tz.TZDateTime nowTZ() => _fake;
  @override
  DateTime now() => _fake;
  void advance(Duration d) => _fake = _fake.add(d);
  void setTo(tz.TZDateTime d) => _fake = d;
}

// lib/core/time/clock_provider.dart
import 'package:riverpod/riverpod.dart';

final clockProvider = Provider<Clock>((_) => RealClock());

// lib/core/time/timezone_init.dart
import 'dart:async';
import 'package:flutter/widgets.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:timezone/data/latest_all.dart' as tz_data;
import 'package:timezone/timezone.dart' as tz;

enum TimezoneSyncStatus { updated, unchanged, fallbackUtc, retainedPrevious }

class TimezoneSyncDiagnostic {
  const TimezoneSyncDiagnostic({
    required this.status,
    required this.activeIdentifier,
    this.requestedIdentifier,
    this.error,
  });
  final TimezoneSyncStatus status;
  final String activeIdentifier;
  final String? requestedIdentifier;
  final Object? error;
}

abstract class NativeTimezoneSource {
  Future<String> getLocalTimezoneIdentifier();
}

class FlutterTimezoneSource implements NativeTimezoneSource {
  @override
  Future<String> getLocalTimezoneIdentifier() async {
    final info = await FlutterTimezone.getLocalTimezone();
    return info.identifier;
  }
}

typedef DiagnosticCallback = void Function(TimezoneSyncDiagnostic);

class TimezoneSynchronizer {
  TimezoneSynchronizer(NativeTimezoneSource source, {DiagnosticCallback? onDiagnostic})
      : _source = source,
        _onDiagnostic = onDiagnostic;
  final NativeTimezoneSource _source;
  final DiagnosticCallback? _onDiagnostic;
  tz.Location? _lastValidLocation;
  String? _lastIdentifier;

  Future<TimezoneSyncDiagnostic> syncOnce() async {
    try {
      final identifier = await _source.getLocalTimezoneIdentifier();
      if (identifier == _lastIdentifier) {
        final diagnostic = TimezoneSyncDiagnostic(
          status: TimezoneSyncStatus.unchanged,
          activeIdentifier: tz.local.name,
        );
        _onDiagnostic?.call(diagnostic);
        return diagnostic;
      }
      final location = tz.getLocation(identifier);
      tz.setLocalLocation(location);
      _lastIdentifier = identifier;
      _lastValidLocation = location;
      final diagnostic = TimezoneSyncDiagnostic(
        status: TimezoneSyncStatus.updated,
        activeIdentifier: tz.local.name,
        requestedIdentifier: identifier,
      );
      _onDiagnostic?.call(diagnostic);
      return diagnostic;
    } catch (e) {
      if (_lastValidLocation != null) {
        tz.setLocalLocation(_lastValidLocation!);
        final diagnostic = TimezoneSyncDiagnostic(
          status: TimezoneSyncStatus.retainedPrevious,
          activeIdentifier: tz.local.name,
          error: e,
        );
        _onDiagnostic?.call(diagnostic);
        return diagnostic;
      } else {
        tz.setLocalLocation(tz.getLocation('Etc/UTC'));
        final diagnostic = TimezoneSyncDiagnostic(
          status: TimezoneSyncStatus.fallbackUtc,
          activeIdentifier: 'Etc/UTC',
          error: e,
        );
        _onDiagnostic?.call(diagnostic);
        return diagnostic;
      }
    }
  }
}

class TimezoneLifecycleHandler extends StatefulWidget {
  const TimezoneLifecycleHandler({
    required this.synchronizer,
    required this.child,
  });
  final TimezoneSynchronizer synchronizer;
  final Widget child;

  @override
  State<TimezoneLifecycleHandler> createState() => _TimezoneLifecycleHandlerState();
}

class _TimezoneLifecycleHandlerState extends State<TimezoneLifecycleHandler>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      unawaited(widget.synchronizer.syncOnce());
    }
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

// lib/core/time/timezone_utils.dart
import 'package:timezone/timezone.dart' as tz;
import 'package:intl/intl.dart';

tz.TZDateTime startOfDay(tz.TZDateTime dt) =>
    tz.TZDateTime(dt.location, dt.year, dt.month, dt.day);

tz.TZDateTime startOfWeek(tz.TZDateTime dt) {
  final weekday = dt.weekday; // 1=Monday..7=Sunday
  if (weekday == 1) return startOfDay(dt);
  return tz.TZDateTime(dt.location, dt.year, dt.month, dt.day - (weekday - 1));
}

tz.TZDateTime startOfMonth(tz.TZDateTime dt) =>
    tz.TZDateTime(dt.location, dt.year, dt.month);

String dateKeyFor(tz.TZDateTime dt) =>
    DateFormat('yyyy-MM-dd').format(dt);

String weekKeyFor(tz.TZDateTime dt) {
  final start = startOfWeek(dt);
  return DateFormat('yyyy-MM-dd').format(start);
}

String monthKeyFor(tz.TZDateTime dt) => DateFormat('yyyy-MM').format(dt);

String yearKeyFor(tz.TZDateTime dt) => DateFormat('yyyy').format(dt);

// lib/shared/utils/date_key.dart — revised signature
/// Returns a date key (yyyy-MM-dd) from the supplied DateTime's calendar fields.
/// Does NOT call .toLocal(); callers needing instant→device-zone conversion must
/// first use tz.TZDateTime.from(instant, tz.local).
String localDateKey(DateTime dt) =>
    '${dt.year.toString().padLeft(4, '0')}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')}';

// lib/core/policy/draft_policy.dart
enum DraftType { foodEdit, manualEntry, goalsEdit, chatComposition, searchFilters }
enum DraftPolicy { confirmDestructiveExit, discardWithNotice }
DraftPolicy draftPolicyFor(DraftType type) => switch (type) {
      DraftType.foodEdit || DraftType.manualEntry || DraftType.goalsEdit => DraftPolicy.confirmDestructiveExit,
      DraftType.chatComposition || DraftType.searchFilters => DraftPolicy.discardWithNotice,
    };
```

Tests: clock, time-shift, boundaries, synchronizer (valid-startup, unchanged, resume-change, invalid-startup-UTC-diagnostic, invalid-after-valid-retained-diagnostic, lifecycle-cleanup-where-feasible), localDateKey purity, deterministic model fallback, draft mapping. No device/emulator needed.

- [x] **Step 1 (worker): Write all failing tests** — clock_test, time_shift_test (spec §9.2 matrix with `FakeClock` + `ProviderContainer(overrides: [clockProvider.overrideWithValue(fake)])`, all DST tests use `tz.TZDateTime` in `tz.getLocation('Europe/Berlin')` to pin transitions), timezone_boundary_test, timezone_synchronizer_test (valid startup, unchanged zone, resume-change, invalid startup UTC diagnostic, invalid-after-valid retained diagnostic, lifecycle cleanup), localDateKey_purity_test, daily_log_malformed_date_test (assert malformed/missing date keys resolve to sentinel `'1970-01-01'`, never DateTime.now), draft_policy_test, draft_policy_exhaustive_test, clock_injection_callsite_test (repositories, providers, screens read clockProvider; no raw DateTime.now in product callsites).

- [x] **Step 2: RED** — Run: `fvm flutter test test/core` → Expected: FAIL (`Clock`/`TimezoneSynchronizer`/etc. not defined).

- [x] **Step 3 (worker): Implement exact architecture + comprehensive callsite migration** — `clock.dart`, `clock_provider.dart`, `timezone_init.dart`, `timezone_utils.dart`, `draft_policy.dart` per the Exact Architecture block. Wire `TimezoneLifecycleHandler` in `main.dart` (init DB, create synchronizer, `await syncOnce()`, then `ProviderScope`/`CalorixApp`). Add `timezone: ^0.11.1` and `flutter_timezone: ^5.1.0` to `pubspec.yaml`. Thread `clockProvider` through all listed repositories, services, providers, and screens. Migrate every product `DateTime.now()` callsite listed in Files. Leave only operational debug/log/analytics/artifact timestamps.

- [x] **Step 4: focused GREEN then full suite** — Run: `fvm flutter test test/core` → Expected: PASS. Then `fvm flutter test` → no regressions.

- [x] **Step 5: analyze/full suite and rg DateTime.now audit table** — `fvm flutter analyze` → `No issues found!`. `fvm flutter test` → full suite passes. Host runs `rg DateTime.now lib/` and lists every remaining call with a reason. **Rule:** `RealClock.now()` (via `clockProvider`) is the one permitted product clock-adapter call; every other remaining raw `DateTime.now` in `lib/` must be an operational debug, log, analytics, or artifact timestamp with an explicit justification listed in the audit table. Any product call still using `DateTime.now()` directly (outside `RealClock`) is a regression.

- [x] **Step 6: REVIEW-GATE Task 3** until green.

- [x] **Step 7: HANDOFF Task 3**

```powershell
git add -A
git commit -m "Add injectable product clock with timezone synchronizer, calendar utils, and draft policy"
git push
```

---

### Task 4: Motion/Accessibility Policy, Reduced Motion, and Measured Repaint Boundaries

**Files:**
- Create: `lib/core/motion/app_motion.dart`
- Modify: `lib/features/today/today_screen.dart` (owns the count-up controller consumed by `AnimatedMacroRing`)
- Modify: `lib/shared/widgets/macro_ring.dart`, `lib/shared/widgets/skeleton_shimmer.dart`, `lib/shared/widgets/macro_progress_bar.dart` (honor `AppMotion`; preserve externally driven animation compatibility; `RepaintBoundary` only where Step 5 proves paint isolation)
- Modify: `lib/shared/widgets/confidence_badge.dart` (text + icon, never color-only)
- Test: `test/core/app_motion_test.dart`, `test/a11y/accessibility_guidelines_test.dart`

**Interfaces:**
- Consumes: nothing new.
- Produces (used by every screen task 6–15):

```dart
// lib/core/motion/app_motion.dart
class AppMotion {
  static bool reducedOf(BuildContext context) => MediaQuery.disableAnimationsOf(context);
  /// Duration.zero under reduced motion => animations snap to final frame.
  static Duration durationOf(BuildContext context, Duration full) =>
      reducedOf(context) ? Duration.zero : full;
}

class MotionDurations {
  static const countUp = Duration(milliseconds: 1400);      // easeOutCubic
  static const macroBarFill = Duration(milliseconds: 1200); // ease-out
  static const scanShimmer = Duration(milliseconds: 1600);  // linear infinite
  static const skeletonShimmer = Duration(milliseconds: 1400);
  static const reticleSnap = Duration(milliseconds: 200);
  static const cardEntrance = Duration(milliseconds: 240);
  static const sheetSlideUp = Duration(milliseconds: 320);
  static const cardExpansion = Duration(milliseconds: 320);
  static const captureRingSpin = Duration(milliseconds: 1000);
  static const historyViewToggle = Duration(milliseconds: 300);
  static const goalsDropdown = Duration(milliseconds: 200);
  static const typingDots = Duration(milliseconds: 600);
}
```

- [x] **Step 1 (worker): Write failing tests**

```dart
// test/core/app_motion_test.dart
testWidgets('durationOf returns zero when disableAnimations is set', (tester) async {
  await tester.pumpWidget(MediaQuery(
    data: const MediaQueryData(disableAnimations: true),
    child: Builder(builder: (c) { expect(AppMotion.durationOf(c, MotionDurations.countUp), Duration.zero); return const SizedBox(); }),
  ));
});
testWidgets('macro ring snaps to final value under reduced motion', (tester) async { /* pump ring with disableAnimations, pump 1 frame, expect final sweep */ });
testWidgets('macro progress bar snaps to final width under reduced motion', (tester) async { /* pump one frame and inspect the fill width */ });
testWidgets('skeleton shimmer is static under reduced motion', (tester) async { /* two frames identical */ });
testWidgets('confidence badge is static under reduced motion', (tester) async { /* no repeating pulse is scheduled */ });

// test/a11y/accessibility_guidelines_test.dart — run per main screen as they land; start with shell + Today
testWidgets('shell meets tap-target and label guidelines', (tester) async {
  await pumpApp(tester, initialLocation: '/today');
  await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
  await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
  await expectLater(tester, meetsGuideline(textContrastGuideline));
});
testWidgets('confidence badge is not color-only', (tester) async { /* badge exposes icon plus text like "Review 65%" via Semantics */ });
```

- [x] **Step 2: RED** — Run: `fvm flutter test test/core/app_motion_test.dart test/a11y` → Expected: FAIL (`AppMotion` not defined; guideline violations reported by name).

- [x] **Step 3 (worker): Implement** `app_motion.dart`; migrate Today's existing count-up controller and `ConfidenceBadge`'s pulse controller to `AppMotion.durationOf`, assigning MediaQuery-dependent durations from `didChangeDependencies` (not `initState`). Never call `repeat()` on a zero-duration controller; reduced motion must set the final/static value without scheduling frames. Preserve the externally driven `AnimatedMacroRing` and `MacroProgressBar` APIs, and route `MacroProgressBar`'s internal `AnimatedContainer` duration through `AppMotion.durationOf`. Make `SkeletonShimmer` use `MotionDurations.skeletonShimmer` normally and the shimmer package's `enabled: false` under reduced motion. No `Timer` may drive visual animation frames; business/lifecycle timers are outside this task.

- [x] **Step 4: GREEN** — Run: `fvm flutter test test/core/app_motion_test.dart test/a11y` → Expected: PASS.

- [x] **Step 5: Deterministic paint-isolation evidence (host-only)** — write a widget test with paint-counting test render objects or painters around an animated subtree and a stable sibling. Pump animation frames and prove the stable sibling's paint count does not increase when the animated subtree is isolated. Add a `RepaintBoundary` only where this test demonstrates a real isolation benefit; no blanket boundaries. This is repaint-isolation evidence only: it is **not** raster/frame-timing evidence and must not be reported as 60/120Hz compliance. Real p50/p95/max raster timing remains a blocked requirement in Tasks 16 and 19 until the user explicitly authorizes a known-safe runtime target.

- [x] **Step 6: Stage verification** — `fvm flutter test test/core/app_motion_test.dart test/a11y` → PASS; `fvm flutter analyze` → `No issues found!`; `fvm flutter test` → no regressions. Record explicitly that no emulator/device performance evidence was gathered.

- [x] **Step 7: REVIEW-GATE Task 4**, then **HANDOFF Task 4**

```powershell
git add -A
git commit -m "Add motion policy, reduced motion support, and accessibility guards"
git push
```

---

### Task 5: Deterministic Fixture, Deep-Link Harness, and Stale-Build Capture Pipeline

**Files:**
- Modify: `lib/shared/services/seed_data_service.dart` (idempotent `forceReseedForUiDiff`: fixed doc IDs, `set()` semantics, fixture timestamps from an injected `FakeClock` instant — reseeding twice yields byte-identical state)
- Create: `lib/debug/debug_deep_links.dart` (route `/debug/reseed?screen=<id>&theme=<dark|light>`, `kDebugMode`-guarded; reseeds, applies theme, then `context.go()` to the target route for any of the 19 IDs)
- Modify: `lib/core/router/app_router.dart` (mount debug route), `lib/shared/providers/ui_diff_provider.dart` (Today hero override 1,420/96/132/38 lives only behind `uiDiffFixtureEnabledProvider`)
- Create: `tool/ui_capture/capture_states.ps1`
- Test: modify `test/debug_reseed_test.dart`; create `test/debug/deep_link_matrix_test.dart`, `test/debug/fixture_isolation_test.dart`

**Interfaces:**
- Consumes: `clockProvider` (Task 3); router (Task 2).
- Produces: typed target registry `kDebugScreenTargets: Map<String, DebugScreenTarget>` with exactly the 19 canonical IDs as keys and explicit route/availability (used by Tasks 16/17); `tool/ui_capture/capture_states.ps1 -Screens <ids|all> -Themes dark,light` producing `<id>--<theme>.png` + `<id>--<theme>.meta.json` (buildHash, route, theme, fixtureHash, deviceModel, pixelSize) under `.ui-diff/captures/<date>/`; fixture contents per spec §10.2 (3 visible food entries including high-confidence and low-confidence/review states; 7 days history; 2 weight logs; 1 active plan; 1 chat thread).

Safety and determinism details:
- `forceReseedForUiDiff` must throw `UnsupportedError` when `!kDebugMode`; an `assert` or silent return is insufficient. The route is also omitted outside debug builds.
- A pure `UiDiffFixtureManifest` owns fixed document IDs, fixed values, canonical path ordering, and timestamps derived from one injected `Clock.nowTZ()` read. A Firestore adapter applies only the manifest's known paths with `set()` and deletes only obsolete IDs in the reserved `ui_diff_fixture_*` namespace. It must never wipe arbitrary user documents or whole collections. Tests use an in-memory fixture-store adapter, not real Firebase.
- Byte identity is proven by a canonical fixture hash over sorted document paths and recursively key-sorted JSON values with timestamps encoded as UTC ISO-8601. Two reseeds from the same `FakeClock` instant must produce the same manifest and hash.
- `uiDiffModeProvider` controls capture behavior/animation only. A separate `uiDiffFixtureEnabledProvider` gates visual-only fixture overrides such as 1,420 kcal, and a debug-only theme override selects dark/light without mutating the user's persisted theme preference.
- All 19 IDs exist in a typed target registry with an availability state. Implemented targets navigate normally. Not-yet-implemented targets mount a debug-only placeholder that emits `UI_DIFF_BLOCKED:<nonce>:<id>:unimplemented`; the capture script treats this as a failure and never saves it as valid visual evidence.
- Each deep link carries a fresh nonce. A target emits `UI_DIFF_READY:<nonce>:<id>:<theme>:<fixtureHash>` only after seeding, navigation, target data readiness, and two completed frames. The script clears/starts a scoped logcat read before launch and matches the full nonce-specific line; stale signals cannot satisfy a run. Arbitrary sleeps are not readiness.

- [x] **Step 1 (worker): Write failing tests**

```dart
// test/debug/deep_link_matrix_test.dart
test('debug target registry covers all 19 canonical IDs exactly', () {
  expect(kDebugScreenTargets.keys.toSet(), {
    'loading','login','permission','scan_idle','scan_capturing','processing','review','manual',
    'today','today_empty','food','food_edit','history_week','history_month',
    'goals','goals_select','ai','ai_history','profile',
  });
});

// test/debug/fixture_isolation_test.dart
test('fixture raw card sum and production accepted sum stay distinct', () {
  // Three visible cards raw-sum to 845 kcal / 74 P / 92 C / 20 F.
  // Production accepted aggregation is 800 kcal because the 45-kcal,
  // 62%-confidence card remains excluded until user confirmation.
  expect(rawCardSum(fixtureEntries).kcal, 845);
  expect(acceptedAggregate(fixtureEntries).kcal, 800);
});
testWidgets('hero shows 1420 only when uiDiffFixtureEnabledProvider is true', (tester) async { /* fixture on → 1,420; off → accepted production sum 800 */ });

// test/debug_reseed_test.dart (extend)
test('forceReseedForUiDiff is idempotent', () async { /* reseed twice through in-memory fixture store; compare canonical snapshots + hashes */ });
test('reseed only mutates reserved fixture document paths', () async { /* unrelated user documents remain byte-identical */ });
test('release/profile invocation is rejected', () { /* exercise the injectable debug guard without relying on assert */ });
```

- [x] **Step 2: RED** — Run: `fvm flutter test test/debug test/debug_reseed_test.dart` → Expected: FAIL (`kDebugScreenRoutes` not defined; idempotency unproven).

- [x] **Step 3 (worker): Implement** the pure fixture manifest/store boundary, reserved-namespace Firestore adapter, canonical fixture hash, deep-link target registry, nonce-specific ready/blocked protocol, separate fixture/theme overrides, and idempotent reseed. Then write `capture_states.ps1` with a safe plan-only default. It must require both `-Execute` and an explicit `-DeviceId <serial>` before invoking build/install/ADB, reject a serial not present in `adb devices`, and never auto-select a connected target. Compute `sourceFingerprint` from sorted path+bytes for `git ls-files --cached --others --exclude-standard` restricted to build-relevant `lib/`, declared `assets/`, `pubspec.yaml`, `pubspec.lock`, and platform build configuration; this includes uncommitted tracked and relevant untracked changes and does not trust HEAD alone. Compare source fingerprint plus APK hash against metadata, rebuild/install only when stale, launch the nonce-bearing deep link, wait for the exact nonce-specific ready signal (or fail immediately on blocked), capture at device-native resolution, and write PNG + metadata. Plan-only mode emits exact actions/freshness decisions without running Flutter, ADB, or touching a device.

- [x] **Step 4: GREEN** — Run: `fvm flutter test test/debug test/debug_reseed_test.dart` → Expected: PASS.

- [x] **Step 5: Harness contract and authorized runtime smoke (host-only)** — first run plan-only mode for `today,scan_idle` × `dark`; assert the action plan contains two distinct deep links/output pairs, the computed source fingerprint is stable across unchanged reruns, and a controlled fixture metadata sample exercises both stale and fresh decisions. Then, because the user explicitly authorized device use on 2026-07-18, run the real two-screen capture against the explicitly named physical ADB serial only. Never auto-select a target and never use `emulator-5554`. Require the exact nonce-specific ready signal and freshness evidence before saving either capture.

- [x] **Step 6: Stage verification** — `fvm flutter analyze` → `No issues found!`.

- [x] **Step 7: REVIEW-GATE Task 5**, then **HANDOFF Task 5**

```powershell
git add -A
git commit -m "Add deterministic fixture reseed and screen capture harness"
git push
```

---

### Task 6: Scan and Permission Still-Photo Flow

Covers `scan_idle`, `scan_capturing`, and creates the `permission` screen (flow behavior here; final visual polish in Task 15). Still photo only — no video, no stop square, no cancel-during-capture.

**Files:**
- Modify: `lib/features/scan/scan_screen.dart`, `lib/features/scan/providers/scan_providers.dart`, `lib/shared/services/camera_service.dart`
- Create: `lib/features/scan/permission_screen.dart`, `lib/features/scan/widgets/scan_mode_selector.dart`, `lib/features/scan/widgets/capture_button.dart`
- Modify: `lib/core/router/route_names.dart` + `lib/core/router/app_router.dart` (add `RouteNames.permission`)
- Test: extend `test/scan_screen_test.dart`; create `test/scan/permission_screen_test.dart`, `test/scan/capture_guard_test.dart`, `test/scan/scan_mode_selector_test.dart`

**Interfaces:**
- Consumes: `AppMotion`/`MotionDurations` (Task 4), router (Task 2), `DraftPolicy` (Task 3).
- Produces (used by Tasks 7, 8, 16):

```dart
// lib/features/scan/providers/scan_providers.dart
enum ScanMode { meal, barcode, label }
enum CaptureState { idle, capturing, denied }

// lib/shared/services/camera_service.dart
abstract class CameraService {
  Future<bool> hasPermission();
  Future<bool> requestPermission();
  Future<XFile?> captureStill();   // still photo — the only capture primitive
  Future<XFile?> pickFromLibrary(); // image_picker gallery
}
```

- [x] **Step 1 (worker): Write failing tests**

```dart
// test/scan/capture_guard_test.dart
testWidgets('rapid triple tap performs exactly one capture', (tester) async {
  final fake = FakeCameraService();
  await pumpScan(tester, camera: fake);
  final button = find.byKey(const ValueKey('capture-button'));
  await tester.tap(button); await tester.tap(button); await tester.tap(button);
  await tester.pumpAndSettle();
  expect(fake.captureCount, 1);
});
testWidgets('capturing state shows conic spinner, shimmer, and ANALYZING hint — and no stop/cancel control', (tester) async { /* assert spinner+shimmer keys present; find.byKey(ValueKey('stop-button')) findsNothing */ });

// test/scan/permission_screen_test.dart
testWidgets('denied permission routes to permission screen with blurred viewfinder and add-manually card', (tester) async { /* implement */ });
testWidgets('regrant transitions to scan_idle', (tester) async { /* fake grants → ScanScreen idle */ });
testWidgets('add manually navigates to manual route', (tester) async { /* asserts RouteNames.manual push (route exists from Task 8; until then assert the navigation intent via router redirect stub) */ });

// test/scan/scan_mode_selector_test.dart
testWidgets('Meal/Barcode/Label segments animate smoothly and update ScanMode', (tester) async { /* tap each; provider value changes; thumb animates with MotionDurations.reticleSnap */ });
```

- [x] **Step 2: RED** — Run: `fvm flutter test test/scan test/scan_screen_test.dart` → Expected: FAIL (new widgets/providers undefined).

- [x] **Step 3 (worker): Implement** — permission screen per spec §5.3 (platform-appropriate rationale; iOS-style overlay reserved for fixture capture mode), capture button with shutter flash + ring pulse then duplicate-tap guard during `capturing`, LIBRARY chip → `pickFromLibrary()` into the same processing path, RECENT chip → recent entries, glass mode selector, reticle glow + scan-line shimmer via `MotionDurations`.

- [x] **Step 4: GREEN** — Run: `fvm flutter test test/scan test/scan_screen_test.dart` → Expected: PASS.

- [x] **Step 5: Runtime verification (host, device)** — use only the explicitly named physical ADB serial `R58R61161NA`; never auto-select a target and never use an emulator. Verified deny → permission screen, settings-required → Android app settings, grant + Back → live preview, Library → Android picker + safe return, and deterministic-harness capture after camera readiness. Real shutter/upload was intentionally not invoked on the signed-in device because it would write to production Firestore/Storage; the triple-tap guard and injected upload gateway are covered deterministically and this cloud-safety limitation is recorded in `docs/implementation-status.md`.

- [x] **Step 6: Stage verification** — `fvm flutter analyze` → `No issues found!`; `fvm flutter test` → no regressions.

- [x] **Step 7: REVIEW-GATE Task 6**, then **HANDOFF Task 6**

```powershell
git add -A
git commit -m "Complete still-photo scan and permission flows"
git push
```

---

### Task 7: Processing, Notification, Deep-Link, Offline, and Interrupted-Upload Lifecycle

**Files:**
- Modify: `lib/features/processing/processing_screen.dart`, `lib/features/processing/providers/processing_providers.dart`, `lib/shared/services/upload_queue_service.dart`, `lib/shared/services/notification_service.dart`, `lib/shared/providers/notification_provider.dart`
- Create: `lib/shared/services/connectivity_monitor.dart` (injectable `ConnectivityMonitor` backed by `connectivity_plus`; emits interface-level connectivity-change events — reports network-interface availability, not confirmed Internet/backend reachability; no OS background execution — retry only while app is foregrounded: authenticated startup, lifecycle resumed, and offline-to-online transitions)
- Create: `lib/shared/providers/viewed_entry_store.dart` (`ViewedEntryStore` in `shared_preferences`, bounded to 500 most recently viewed entry IDs; mark on food detail presentation; warm/cold handlers pass `alreadyViewed`; preserve legacy docId support; local-only — remote existence validation lives in `EntryExistenceChecker`, not here)
- Create: `lib/shared/services/entry_existence_checker.dart` (`EntryExistenceChecker` abstract interface + `FirestoreEntryExistenceChecker` implementation, injected into the notification-tap handler; verifies remote target existence — deleted/missing target routes to `/today`)
- Create: `lib/shared/services/retry_analysis_service.dart` (authenticated `retryEntryAnalysis` callable/service — thin client wrapper that calls the `retryEntryAnalysis` Cloud Function callable via `FirebaseFunctions.instance`; retry UI calls the injected service)
- Create: `functions/src/retry-analysis.ts` (pure/testable handler `handleRetryEntryAnalysis(entryId, deps)` plus typed `RetryAnalysisError` — the backend counterpart of the Flutter `RetryAnalysisService` interface; owns the atomic ownership check, the `error → pending` transaction claim, and the single downstream `handleEntryCreated`-style analysis invocation)
- Modify: `functions/src/index.ts` (export the `retryEntryAnalysis` `onCall` Cloud Function wired to `handleRetryEntryAnalysis`; extract a shared `AnalyzeEntryDeps` factory function used by both `processEntry` and `retryEntryAnalysis` so image/model/prompt/push/error behavior is identical between initial analysis and retry)
- Modify: `pubspec.yaml` — retain existing `path_provider: ^2.1.4` (locked at 2.1.5, already used by `upload_queue_service.dart`); add `connectivity_plus: ^7.3.0`
- Test: create `test/processing/processing_lifecycle_test.dart`, `test/processing/upload_queue_test.dart`, `test/processing/notification_routing_test.dart`, `test/processing/connectivity_monitor_test.dart`, `test/processing/viewed_entry_store_test.dart`, `test/processing/entry_existence_checker_test.dart`, `test/processing/retry_analysis_service_test.dart` (Flutter client wrapper — calls the callable, surfaces errors), `test/processing/combined_state_test.dart`
- Test: create `functions/test/retry-analysis.test.ts` (backend handler — injected fakes only, no production/emulator writes)

**Interfaces:**
- Consumes: `CameraService` capture output (Task 6), router (Task 2), `clockProvider` (Task 3), `AppMotion`/`MotionDurations` (Task 4).
- Produces (used by Tasks 8, 11, 16):

```dart
// Combined processing state — local upload/retry/error takes precedence before
// Firestore document exists, then Firestore pending/processing/complete/error:
enum ProcessingPhase { localUploading, localError, firestorePending, firestoreProcessing, firestoreComplete, firestoreError }

class ProcessingState {
  const ProcessingState({required this.phase, this.progress, this.errorMessage});
  final ProcessingPhase phase;
  final double? progress;        // 0..1 during localUploading
  final String? errorMessage;    // non-null on localError / firestoreError
}

// Upload queue — versioned JSON persisted in shared_preferences.
// Before enqueue returns, the source image is copied/compressed into
// getApplicationSupportDirectory()/pending_uploads/<queueId>.jpg via path_provider.
// Stable queueId / entryId / storage path across retries.
// Durable source (and queue entry) deleted only on: successful Storage
// upload + Firestore handoff, a truly fatal non-retryable local failure
// (auth/permission error, malformed payload), or explicit user
// dismissal/cancellation of the localError entry. Reaching the automatic
// retry cap is NOT a deletion trigger — it pauses auto-retry
// (autoRetryDisabled = true, nextRetryAt = null) while retaining the
// entry and durable copy, so the localError screen's Retry action can
// still manually resume this same entry (reset autoRetryDisabled to
// false and recompute nextRetryAt, same queueId/entryId — no duplicate
// is created). Never retained on account of a post-handoff
// firestoreError — once the Firestore document exists, the local queue
// entry is already gone; that retry path is exclusively RetryAnalysisService
// operating on the existing remote entry.
class UploadQueueEntry {
  const UploadQueueEntry({
    required this.queueId,
    required this.entryId,
    required this.imagePath,       // durable copy path under pending_uploads/
    required this.createdAt,
    this.retryCount = 0,
    this.lastError,
    this.nextRetryAt,              // bounded exponential backoff, driven by injected clock; null while autoRetryDisabled
    this.autoRetryDisabled = false, // true once retryCount hits the cap; auto-drain skips this entry until manual retry clears it
  });
  final String queueId;
  final String entryId;
  final String imagePath;
  final DateTime createdAt;
  final int retryCount;
  final String? lastError;
  final DateTime? nextRetryAt;
  final bool autoRetryDisabled;
}

// ViewedEntryStore — shared_preferences backed, bounded to 500 entries.
// Mark on food detail presentation. Warm/cold handlers pass alreadyViewed.
// Local-only: does not perform remote I/O. Remote existence validation is
// extracted into EntryExistenceChecker below.
class ViewedEntryStore {
  Future<bool> isViewed(String entryId);
  Future<void> markViewed(String entryId);
  Future<List<String>> recentIds();     // most-recently-viewed, bounded to 500
}

// EntryExistenceChecker — injected remote existence check, kept separate
// from ViewedEntryStore so ViewedEntryStore stays local-only/synchronous-friendly.
abstract class EntryExistenceChecker {
  Future<bool> exists(String entryId);  // verifies Firestore doc still present
}

// FirestoreEntryExistenceChecker — production implementation.
class FirestoreEntryExistenceChecker implements EntryExistenceChecker {
  const FirestoreEntryExistenceChecker(this._firestore, this._uid);
  final FirebaseFirestore _firestore;
  final String _uid;
  @override
  Future<bool> exists(String entryId) async {
    final doc = await _firestore
        .collection(AppConstants.usersCollection)
        .doc(_uid)
        .collection(AppConstants.entriesSubCollection)
        .doc(entryId)
        .get();
    return doc.exists;
  }
}

// Notification route resolver — preserves legacy docId support. Pure/sync,
// no I/O. For fresh taps, the notification-tap handler calls the injected
// EntryExistenceChecker.exists(entryId) before routing; a deleted/missing
// target routes to /today instead of calling this resolver.
/// Resolves a notification tap to a route:
///   fresh result → /today/food/:id,
///   summary → /today,
///   stale (already viewed) → /today/food/:id without error.
String routeForNotification(Map<String, String> data, {required bool alreadyViewed});

// RetryAnalysisService — authenticated, injected. The Flutter side is a thin
// callable wrapper; the atomicity, ownership check, and single-invocation
// guarantee live server-side in functions/src/retry-analysis.ts (see the
// Backend contract below), not in this client class.
abstract class RetryAnalysisService {
  Future<void> retryEntryAnalysis(String entryId);
}
```

```typescript
// functions/src/retry-analysis.ts — backend counterpart, mirrors analyze-entry.ts's shape
export type RetryAnalysisErrorCode =
  | 'unauthenticated'
  | 'invalid-argument'   // missing/empty entryId
  | 'not-found'          // entry doc does not exist
  | 'failed-precondition'; // entry status is pending/processing/complete/needs_review

export class RetryAnalysisError extends Error {
  constructor(readonly code: RetryAnalysisErrorCode, message: string) {
    super(message);
  }
}

export interface RetryAnalysisDeps {
  runTransaction<T>(fn: (txn: FirebaseFirestore.Transaction) => Promise<T>): Promise<T>;
  entryRef(uid: string, entryId: string): FirebaseFirestore.DocumentReference;
  analyzeEntry(entryId: string, data: EntryData, deps: AnalyzeEntryDeps): Promise<void>; // handleEntryCreated
  buildAnalyzeDeps(uid: string, entryId: string): AnalyzeEntryDeps; // shared factory, see index.ts
}

// Validates auth + entryId, then atomically claims the entry (only `status
// == 'error'` may transition to `pending`) inside a single runTransaction
// call before invoking analysis — this is what makes two concurrent retries
// produce exactly one analysis invocation. Preserves every other entry field
// (image/storage/data) on the claimed document; the transaction only writes
// `status: 'pending'`.
export async function handleRetryEntryAnalysis(
  uid: string | undefined,
  entryId: unknown,
  deps: RetryAnalysisDeps,
): Promise<void> { /* implementation */ }
```

**Connectivity Monitor contract:**
- `ConnectivityMonitor` is an injectable abstract class; `RealConnectivityMonitor` wraps `connectivity_plus` and exposes a `Stream<ConnectivityState>` where `ConnectivityState` is `{online, offline}`.
- `connectivity_plus` reports network-interface availability (Wi-Fi/cellular attached), not confirmed Internet or backend reachability. An "online" event only triggers an attempt to drain the queue; it is not treated as proof the upload will succeed.
- Retry triggers: (a) authenticated app startup — check connectivity and drain queue; (b) `AppLifecycleState.resumed` — check and drain; (c) offline→online transition event — drain.
- **No OS background execution is claimed.** All retry happens while the app process is alive and in the foreground. If the app is killed mid-upload, retry happens on next cold start (Step 2's durable copy survives process death).
- On enqueue: before the method returns, copy/compress the source image into `getApplicationSupportDirectory()/pending_uploads/<queueId>.jpg` via `path_provider`. The durable copy path is stored in the queue entry and used across retries. The durable copy (and queue entry) is deleted only on Storage upload + Firestore handoff success, a truly fatal non-retryable failure, or explicit user dismissal/cancellation. It is retained on any retryable/offline failure, and it is also retained when the automatic retry cap is reached (see below) — reaching the cap pauses auto-retry, it does not delete anything.
- Queue drain must wrap each upload attempt in error classification: catch socket/HTTP/`FirebaseException` transport errors and timeouts, and classify them as retryable (network unreachable, timeout, 5xx/`unavailable`/`deadline-exceeded`) vs. fatal/non-retryable (auth/permission errors, malformed payload, `unauthenticated`). Retryable failures retain queue metadata and the durable copy for the next drain attempt, surfaced to the user as `localError` with auto-retry still active; fatal failures delete the durable copy and remove the entry (surfaced to the user as `localError`, no retry possible — the entry is gone).

**Queue persistence contract:**
- Versioned JSON array serialized to a `shared_preferences` key (`upload_queue_v1`).
- Each entry carries a stable `queueId` (UUID), `entryId` (Firestore doc ID or pending ID), `imagePath` (absolute path under `pending_uploads/`), `createdAt`, `retryCount`, `lastError`, `nextRetryAt`.
- On app restart: deserialize queue, verify each durable copy exists on disk (delete orphaned entries), then attempt upload for each entry in FIFO order.
- `enqueue` is idempotent: if an entry with the same `entryId` is already in the queue (pending), return the existing `queueId` without creating a duplicate.
- Retryable drain failures use bounded exponential backoff: `nextRetryAt = clock.now() + baseDelay * 2^retryCount` (capped at a max delay), computed from the injected `clockProvider` (Task 3) so tests are deterministic — no real `sleep`/timers. A drain pass skips entries whose `nextRetryAt` is still in the future. `retryCount` is capped at a fixed maximum (e.g. 5); once exceeded, the entry sets `autoRetryDisabled = true` and `nextRetryAt = null` — drain skips it, and it surfaces as `localError` with a manual Retry action — retries are bounded, never infinite auto-retry.
- Reaching the retry cap does **not** remove the entry or delete its durable copy: the entry stays in the queue, `autoRetryDisabled` true, so the localError screen's Retry action can manually retry it. Tapping Retry after the cap resets `retryCount` (or otherwise clears `autoRetryDisabled` and recomputes `nextRetryAt` to now), re-enabling auto-drain for the same `queueId`/`entryId` — no duplicate entry is created.
- The entry (and its durable copy) is removed from the queue only on: (a) successful Storage upload + Firestore handoff, (b) a truly fatal non-retryable local failure (auth/permission error, malformed payload — not the retry cap), or (c) explicit user dismissal/cancellation of the localError entry. It is never re-added after a successful handoff — a subsequent `firestoreError` is a remote-only concern handled exclusively by `RetryAnalysisService` against the existing Firestore entry, not by re-queuing.

**Combined processing state contract:**
- Local phase takes precedence while no Firestore document exists: `localUploading` (image copy + upload in progress), `localError` (copy or upload failed, retryable).
- Once the Firestore document is created (analysis request accepted): `firestorePending` → `firestoreProcessing` → `firestoreComplete` | `firestoreError`.
- The processing screen reads `ProcessingState` from a provider that merges queue state and Firestore snapshot. Transitions are: `localUploading` → `localError` (retry) or `firestorePending` (handoff) → `firestoreProcessing` → `firestoreComplete` | `firestoreError` (retry via `RetryAnalysisService`).

**ViewedEntryStore contract:**
- Bounded to 500 most recently viewed entry IDs (FIFO eviction on overflow).
- `markViewed(entryId)` called on food detail presentation (not on Today card tap — only when the full detail sheet/screen is shown).
- `ViewedEntryStore` is local-only (`shared_preferences`) and has no `exists`/remote-lookup method. The notification-tap handler is injected with both `ViewedEntryStore` and `EntryExistenceChecker`: it reads `alreadyViewed` from `ViewedEntryStore`, and for fresh taps calls `EntryExistenceChecker.exists(entryId)` against Firestore before routing; if the doc is deleted or missing, it routes to `/today` instead of calling `routeForNotification`.
- Legacy support: if the notification payload contains `docId` (old format) instead of `entryId`, resolve the entry by looking up the doc via `EntryExistenceChecker`; if not found, route to `/today`.

**Retry contract:**
- `RetryAnalysisService.retryEntryAnalysis(entryId)` on the Flutter side is a thin authenticated callable wrapper (`FirebaseFunctions.instance.httpsCallable('retryEntryAnalysis')`); it does not itself implement the atomicity/ownership rules below.
- The retry UI (error state's retry button) calls the injected `RetryAnalysisService`, not raw Firestore writes.
- If the analysis fails again: the backend transitions the existing remote Firestore entry back to `error` with the new error message, available for another manual retry via `RetryAnalysisService`. There is no local `UploadQueueEntry` at this point — it was already deleted at handoff — so nothing is retried from the local queue.

**Backend contract (`functions/src/retry-analysis.ts`, exported as `retryEntryAnalysis` in `functions/src/index.ts`):**
- The callable requires `request.auth.uid` (unauthenticated → `HttpsError('unauthenticated', ...)`) and a validated non-empty `entryId` string (missing/empty → `invalid-argument`).
- Operates on `users/{request.auth.uid}/entries/{entryId}` only — ownership is enforced by construction, not by comparing a caller-supplied `uid` field, so cross-user retries are structurally impossible.
- Uses a single Firestore `runTransaction` on that document: missing doc → `not-found`; only `status == 'error'` may atomically claim the entry by writing `status: 'pending'` inside the transaction — `pending`, `processing`, `complete`, and `needs_review` are all typed `failed-precondition` duplicate/non-retryable states (there is no separate `duplicate_retry` no-op code; a duplicate concurrent call simply loses the transaction and receives `failed-precondition`).
- The transaction claim happens **before** `handleEntryCreated` (Task 7's existing analysis handler, shared with `processEntry`) is invoked. This ordering — atomic claim, then single downstream invocation — is what guarantees two concurrent retries produce exactly one analysis invocation; the second caller's transaction fails the precondition check and never reaches `handleEntryCreated`.
- All other entry fields (image/storage/data) on the claimed document are preserved — the transaction writes only `status: 'pending'`, exactly like the existing `processEntry` transition.
- `index.ts` extracts a shared `AnalyzeEntryDeps` factory (parameterized by `uid`/`entryId`) so `processEntry` and `retryEntryAnalysis` build identical `updateEntry`/`loadImageBase64`/`generateVision`/`sendPush`/`getModelConfig` dependency wiring — retry and initial analysis have identical image/model/prompt/push/error behavior by construction, not by duplicated code.
- `functions/test/retry-analysis.test.ts` unit-tests `handleRetryEntryAnalysis` against injected fakes only (fake transaction runner, fake doc ref, fake `analyzeEntry`/`buildAnalyzeDeps`) — no production or emulator Firestore writes. Required coverage: unauthenticated request, invalid/empty entryId, missing entry doc, user isolation (only the auth-scoped `users/{uid}/entries/{entryId}` path is ever read/written — no cross-user path is constructible from the callable's inputs), only `status == 'error'` is accepted (each of pending/processing/complete/needs_review rejected as `failed-precondition`), concurrent retries produce exactly one winner (transaction-based test, not a timing race), preserved entry data (image/storage fields untouched by the transaction), exactly one `analyzeEntry`/`handleEntryCreated`-equivalent invocation per successful claim, and an analysis failure inside the invoked handler returns the remote entry to `error` (via the existing `handleEntryCreated` catch path, not a new one).
- Focused Firestore-emulator integration evidence for `retryEntryAnalysis` (real transactions against the emulator, real security-rules interaction) is explicitly **not** owned by this task — it is Task 16's responsibility unless a later task explicitly adds it here. This task's unit tests use injected fakes only.

**Motion contract:**
- Processing screen entrance uses `MotionDurations.cardEntrance` (240ms) for the skeleton card fade-in.
- Skeleton shimmer uses `MotionDurations.skeletonShimmer` (1400ms) via `AppMotion.durationOf`.
- Complete/error transitions use `MotionDurations.cardEntrance` for the result card entrance.
- Reduced motion snaps to final frame per `AppMotion.reducedOf`.

- [x] **Step 1 (worker): Write failing tests**

```dart
// test/processing/processing_lifecycle_test.dart
testWidgets('shows close-app banner with spinner and skeleton card while processing', (tester) async { /* implement */ });
testWidgets('banner tap navigates to today', (tester) async { /* implement */ });
testWidgets('complete state shows image, name, kcal, macro bars, View in Today', (tester) async { /* implement */ });
testWidgets('error state shows amber icon, Analysis failed, and retry button', (tester) async { /* implement */ });
testWidgets('processing screen uses MotionDurations.cardEntrance for entrance and skeletonShimmer for shimmer', (tester) async { /* verify animation durations via AppMotion */ });
testWidgets('reduced motion snaps skeleton and result card to final frame', (tester) async { /* disableAnimations → Duration.zero */ });
testWidgets('combined state: localUploading shows upload progress, firestorePending shows spinner', (tester) async { /* implement */ });
testWidgets('combined state: localError shows retry, firestoreError shows retry via RetryAnalysisService', (tester) async { /* implement */ });

// test/processing/upload_queue_test.dart
test('upload interrupted by kill is re-enqueued and retried on next start', () async { /* persist queue entry with durable copy, recreate service, expect retry */ });
test('offline enqueue does not lose the capture; retry fires on connectivity resume', () async { /* implement */ });
test('durable copy survives process death and is used on restart retry', () async { /* create entry, verify file on disk, simulate restart, verify upload uses same path */ });
test('enqueue is idempotent — duplicate entryId returns existing queueId', () async { /* enqueue twice with same entryId, expect same queueId, queue length 1 */ });
test('durable copy deleted after Firestore handoff success', () async { /* enqueue, upload success, verify file deleted from pending_uploads/ */ });
test('durable copy retained on retryable failure, deleted on fatal failure', () async { /* enqueue, retryable fail → file exists; fatal fail → file deleted */ });
test('retryable transport error (socket timeout, FirebaseException unavailable/deadline-exceeded) is classified retryable — queue metadata and durable copy retained', () async { /* implement */ });
test('fatal error (permission-denied, unauthenticated, malformed payload) is classified non-retryable — durable copy deleted and entry removed', () async { /* implement */ });
test('bounded exponential backoff: nextRetryAt computed from injected clockProvider, increases with retryCount', () async { /* FakeClock, assert nextRetryAt = base * 2^retryCount */ });
test('drain skips entries whose nextRetryAt is still in the future', () async { /* implement */ });
test('retryCount capped at max — entry sets autoRetryDisabled true and nextRetryAt null, stops auto-retrying, surfaces as localError for manual retry; entry and durable copy are retained, not deleted, never retries infinitely', () async { /* implement */ });
test('manual retry after retry-cap reached clears autoRetryDisabled and recomputes nextRetryAt, re-enabling auto-drain for the same queueId/entryId without creating a duplicate queue entry', () async { /* implement */ });
test('queue version migration: v0 (no version key) deserializes gracefully', () async { /* implement */ });
test('queue persists across FakeClock restart with stable queueId/entryId', () async { /* implement */ });

// test/processing/notification_routing_test.dart
test('fresh result routes to food detail', () {
  expect(routeForNotification({'entryId': 'e1'}, alreadyViewed: false), '/today/food/e1');
});
test('stale tap routes to food detail without error', () {
  expect(routeForNotification({'entryId': 'e1'}, alreadyViewed: true), '/today/food/e1');
});
test('missing data routes to /today', () {
  expect(routeForNotification({}, alreadyViewed: false), '/today');
});
test('deleted/missing target routes to /today via handler, without calling routeForNotification', () async {
  /* inject FakeEntryExistenceChecker returning false; verify handler routes to /today */
});
test('legacy docId format resolves correctly', () {
  expect(routeForNotification({'docId': 'legacy1'}, alreadyViewed: false), '/today/food/legacy1');
});
test('cold start notification routes correctly with alreadyViewed=false', () async { /* implement */ });
test('warm tap notification routes correctly with alreadyViewed from ViewedEntryStore', () async { /* implement */ });

// test/processing/connectivity_monitor_test.dart
test('emits online on initial check when connected', () async { /* implement */ });
test('emits offline→online transition triggers queue drain', () async { /* implement */ });
test('retry does not fire while app is backgrounded', () async { /* implement */ });
test('retry fires on authenticated startup when online', () async { /* implement */ });
test('retry fires on lifecycle resumed when online', () async { /* implement */ });
test('interface-online event alone does not mark upload successful — drain still classifies transport errors', () async { /* implement */ });

// test/processing/viewed_entry_store_test.dart
test('markViewed adds entryId and isViewed returns true', () async { /* implement */ });
test('bounded to 500 entries — oldest evicted on 501st insert', () async { /* implement */ });

// test/processing/entry_existence_checker_test.dart
test('exists returns true for existing Firestore doc', () async { /* implement */ });
test('exists returns false for deleted/missing Firestore doc', () async { /* implement */ });

// test/processing/retry_analysis_service_test.dart — Flutter client wrapper only;
// the atomic transition/ownership/duplicate-rejection guarantees are backend
// behavior covered by functions/test/retry-analysis.test.ts below, not here.
test('retryEntryAnalysis invokes the retryEntryAnalysis callable with the given entryId', () async { /* implement */ });
test('retryEntryAnalysis surfaces a callable failure (e.g. failed-precondition) as a typed error to the caller', () async { /* implement */ });

// functions/test/retry-analysis.test.ts — backend handler, injected fakes only, no emulator/production writes
test('rejects unauthenticated request', async () => { /* implement */ });
test('rejects missing/empty entryId as invalid-argument', async () => { /* implement */ });
test('rejects retry for missing entry doc as not-found', async () => { /* implement */ });
test('only reads/writes the auth-scoped users/{uid}/entries/{entryId} path — no cross-user path is constructible', async () => { /* implement */ });
test('claims entry when status is error, transitions to pending', async () => { /* implement */ });
test.each(['pending', 'processing', 'complete', 'needs_review'])('rejects retry when status is %s as failed-precondition', async (status) => { /* implement */ });
test('two concurrent retries against the same entry produce exactly one analysis invocation', async () => { /* implement */ });
test('preserves image/storage/data fields on the claimed document — transaction writes only status', async () => { /* implement */ });
test('invokes the shared AnalyzeEntryDeps-based analysis handler exactly once per successful claim', async () => { /* implement */ });
test('analysis failure inside the invoked handler returns the remote entry to error', async () => { /* implement */ });

// test/processing/combined_state_test.dart
test('localUploading → firestorePending transition on handoff', () async { /* implement */ });
test('localError → localUploading on retry', () async { /* implement */ });
test('firestorePending → firestoreProcessing → firestoreComplete', () async { /* implement */ });
test('firestoreError → firestorePending via RetryAnalysisService', () async { /* implement */ });
test('local UploadQueueEntry and durable copy are already deleted by the time firestoreError occurs; retry goes through RetryAnalysisService only, no local queue re-entry', () async { /* implement */ });
```

- [x] **Step 2: RED** — Run both: `fvm flutter test test/processing` **and** `npm test --prefix functions` → Expected: FAIL on both. Flutter: `routeForNotification` undefined; `ConnectivityMonitor`, `ViewedEntryStore`, `EntryExistenceChecker`, `RetryAnalysisService`, `ProcessingState` undefined; lifecycle branches missing. Functions: `functions/test/retry-analysis.test.ts` fails to compile/run because `functions/src/retry-analysis.ts` (`handleRetryEntryAnalysis`, `RetryAnalysisError`) does not exist yet.

- [x] **Step 3 (worker): Implement** per the contracts above:
  - `ConnectivityMonitor` injectable with `connectivity_plus`; foreground-only retry triggers; treat "online" as interface availability only.
  - Versioned queue JSON in `shared_preferences`; durable copy via `path_provider` to `getApplicationSupportDirectory()/pending_uploads/<queueId>.jpg`; stable IDs; delete-on-handoff, delete-on-truly-fatal-failure, delete-on-explicit-user-dismissal; retain-on-retryable-failure and retain-on-retry-cap-reached.
  - Queue drain: catch and classify socket/HTTP/`FirebaseException` transport errors as retryable vs. fatal; bounded exponential backoff via injected `clockProvider` (`nextRetryAt`), capped `retryCount`. On cap: set `autoRetryDisabled = true`, `nextRetryAt = null`, retain entry/durable copy, surface `localError` with manual Retry; manual Retry clears `autoRetryDisabled` and resumes the same entry (no duplicate ID). Never infinite auto-retry.
  - `ProcessingState` combined provider merging queue state and Firestore snapshot.
  - `ViewedEntryStore` in `shared_preferences`, bounded 500, `markViewed` on food detail; local-only, no remote existence method.
  - `EntryExistenceChecker` abstract interface + `FirestoreEntryExistenceChecker` implementation; injected into the notification-tap handler, called before `routeForNotification` for fresh taps; `routeForNotification` itself stays pure/sync with legacy docId support.
  - `lib/shared/services/retry_analysis_service.dart`: thin authenticated callable wrapper around `retryEntryAnalysis`.
  - `functions/src/retry-analysis.ts`: `handleRetryEntryAnalysis` per the Backend contract — auth/entryId validation, single `runTransaction` ownership+status claim (`error` → `pending` only), preserved entry fields, then one downstream analysis invocation via the shared `AnalyzeEntryDeps` factory.
  - `functions/src/index.ts`: export `retryEntryAnalysis` as an `onCall` wired to `handleRetryEntryAnalysis`; extract the shared `AnalyzeEntryDeps` factory used by both `processEntry` and `retryEntryAnalysis`.
  - Four-state processing screen: skeleton shimmer (`MotionDurations.skeletonShimmer`), entrance (`MotionDurations.cardEntrance`), complete/error result cards.
  - `AppMotion.durationOf` for all animation durations; reduced motion snaps.

- [x] **Step 4: GREEN** — Run all three: `fvm flutter test test/processing`, `npm test --prefix functions`, and `npm run build --prefix functions` → Expected: PASS, PASS, and a clean TypeScript build.

- [x] **Step 5: Stage verification** — `fvm flutter analyze` → `No issues found!`; full `fvm flutter test` → no regressions; `npm test --prefix functions` → PASS; `npm run build --prefix functions` → clean build. (Real background-kill, push delivery, and Firestore-emulator integration evidence for `retryEntryAnalysis` are owned by Task 16, not this task.)

- [x] **Step 6: REVIEW-GATE Task 7**, then **HANDOFF Task 7**

```powershell
fvm flutter analyze
fvm flutter test
npm test --prefix functions
npm run build --prefix functions
git add -A
git commit -m "Harden processing, upload queue, notification lifecycle, and retry analysis"
git push
```

---

### Task 8: Review and Manual Canonical Screens

Creates the two missing scan-outcome screens and their data contracts.

**Files:**
- Create: `lib/features/review/review_screen.dart`, `lib/features/review/providers/review_providers.dart`
- Create: `lib/features/manual/manual_entry_screen.dart`, `lib/features/manual/providers/manual_providers.dart`
- Modify: `lib/core/router/route_names.dart` + `lib/core/router/app_router.dart` (add `RouteNames.review`, `RouteNames.manual`; confidence <80% routes processing → review)
- Modify: `lib/features/processing/processing_screen.dart`, `lib/features/processing/providers/processing_providers.dart` (a `needsReview` or confidence `< 0.80` remote result redirects to Review instead of rendering the completed card)
- Modify: `lib/shared/models/food_entry.dart` (add serialized/deserialized review candidates because the current model has none)
- Modify: `lib/shared/repositories/food_entry_repository.dart` (persist complete manual entries with the injected clock and local date key)
- Test: create `test/review/review_screen_test.dart`, `test/manual/manual_entry_screen_test.dart`

**Interfaces:**
- Consumes: `ProcessingStatus` flow (Task 7), `DraftPolicy` (Task 3), router (Task 2).
- Produces (used by Tasks 9, 16):

```dart
// lib/features/review/providers/review_providers.dart
class ReviewCandidate {
  const ReviewCandidate({required this.name, required this.confidence, required this.kcal,
      required this.proteinG, required this.carbsG, required this.fatG});
  final String name; final double confidence; // 0..1
  final int kcal; final double proteinG; final double carbsG; final double fatG;
}
/// Review branch is entered iff entry.confidence < 0.80 (spec threshold).

// lib/features/manual/providers/manual_providers.dart
class ManualFoodDraft {
  const ManualFoodDraft({required this.name, required this.kcal, required this.proteinG,
      required this.carbsG, required this.fatG, required this.servingSize, required this.quantity,
      required this.mealType});
  // all fields required and validated non-negative before save
}

/// Manual saves validate non-empty name and non-negative nutrition, then use
/// clockProvider/nowTZ + localDateKey, scanMode `manual`, and complete status.
/// Review candidates are Firestore-backed data on FoodEntry, not UI-only state.
```

- [x] **Step 1 (worker): Write failing tests**

```dart
// test/review/review_screen_test.dart
testWidgets('renders photo hero, amber confidence badge, candidate radios, none-of-these, confirm, ask assistant, retake', (tester) async { /* implement */ });
testWidgets('confirm with selected candidate navigates to food detail with that candidate applied', (tester) async { /* implement */ });
testWidgets('none of these navigates to manual', (tester) async { /* implement */ });
testWidgets('retake returns to scan', (tester) async { /* implement */ });
testWidgets('ask assistant opens chat with linked meal context', (tester) async { /* asserts linkedMealId passed */ });

// test/manual/manual_entry_screen_test.dart
testWidgets('search field, filter chips, result rows with plus, dashed create-custom-food row render', (tester) async { /* implement */ });
testWidgets('create custom food with valid draft saves and appears in Today providers', (tester) async { /* implement */ });
testWidgets('invalid draft (negative kcal, empty name) blocks save with field errors', (tester) async { /* implement */ });
testWidgets('destructive exit with unsaved draft prompts confirmation (DraftPolicy.confirmDestructiveExit)', (tester) async { /* implement */ });
```

- [x] **Step 2: RED** — Run: `fvm flutter test test/review test/manual` → Expected: FAIL (screens undefined).

- [x] **Step 3 (worker): Implement** both screens per spec §5.7/§5.8 (bottom sheet slide-up `MotionDurations.sheetSlideUp`; manual reachable from permission fallback, review none-of-these, explicit manual action, custom-food creation) and the <80% routing in the router/processing completion path.

  - The permission screen's `onManualEntryRequested` must navigate to `RouteNames.manual`.
  - Manual unsaved form/search state must use `DraftPolicy.confirmDestructiveExit` through `PopScope`.
  - Review "Ask assistant" pushes the root assistant overlay with `mealId: entryId`.
  - Applying a candidate updates the auth-scoped entry with candidate nutrition and `status: complete`; no client creates a cross-user path.

- [x] **Step 4: GREEN** — Run: `fvm flutter test test/review test/manual` → Expected: PASS. Then `fvm flutter test test/scan/permission_screen_test.dart` → the Task 6 add-manually stub assertion now exercises the real route.

- [x] **Step 5: Stage verification** — `fvm flutter analyze` → `No issues found!`; `fvm flutter test` → no regressions.

- [x] **Step 6: REVIEW-GATE Task 8**, then **HANDOFF Task 8**

```powershell
git add -A
git commit -m "Add review and manual entry screens"
git push
```

---

### Task 9: Real Product Analysis Contracts (Barcode, Label, Meal, Open Food Facts)

Cloud Functions + client contracts for the three scan modes. All Firestore writes go through emulators; the only live network call is a read-only Open Food Facts contract check.

**Files:**
- Modify: `functions/src/analyze-entry.ts`, `functions/src/nutrition.ts`, `functions/src/prompts.ts`, `functions/src/config.ts`, `functions/src/index.ts`, `functions/src/retry-analysis.ts`
- Create: `functions/src/off-client.ts` (read-only current Open Food Facts v3 product lookup; v2 is deprecated)
- Test: create `functions/src/nutrition.test.ts`, `functions/src/off-client.test.ts` (unit, mocked HTTP); create `test/contracts/off_live_contract_test.dart` tagged `live`; create `test/contracts/analysis_result_contract_test.dart` (client-side shape of the function result)
- (Exact functions test script name: as recorded in `docs/implementation-status.md` §Baseline from Task 0; add a `test` script mirroring the recorded runner if none exists.)

**Interfaces:**
- Consumes: `ScanMode` (Task 6), `ReviewCandidate` (Task 8).
- Produces (used by Tasks 10, 11, 16):

```ts
// functions/src/nutrition.ts
export interface AnalysisResult {
  name: string;
  kcal: number;
  proteinG: number; carbsG: number; fatG: number;
  confidence: number;            // 0..1; < 0.8 => client review branch
  atwaterKcal: number;           // 4*proteinG + 4*carbsG + 9*fatG, recorded for plausibility
  candidates: Array<{ name: string; confidence: number; kcal: number; proteinG: number; carbsG: number; fatG: number }>;
  source: 'meal' | 'barcode' | 'label';
}
export function atwaterKcal(p: number, c: number, f: number): number;

// EntryData carries scanMode and optional rawBarcode through both the initial
// Firestore trigger and retry transaction. If a barcode capture has no raw
// barcode, the barcode vision prompt extracts one before the OFF lookup; an
// unknown/unreadable barcode uses the vision nutrition result at review-level
// confidence rather than pretending OFF confirmed it.

// functions/src/off-client.ts
export interface OffProduct { name: string; kcalPer100g: number; proteinPer100g: number; carbsPer100g: number; fatPer100g: number; }
export async function fetchOffProduct(barcode: string): Promise<OffProduct | null>; // GET only, never writes
```

Plausibility is recorded data, not an invented gate: `atwaterKcal` is stored alongside reported kcal so review UI and evidence can show the mismatch; the only branch threshold remains the spec's 80% confidence.

- [x] **Step 1 (worker): Write failing unit tests**

```ts
// functions/src/nutrition.test.ts
test('atwaterKcal computes 4/4/9', () => { expect(atwaterKcal(10, 20, 5)).toBe(165); });
test('meal fixture analysis yields AnalysisResult with candidates and confidence in [0,1]', async () => { /* mocked model response fixture */ });
test('barcode source fills nutrition from OFF product and sets confidence 1.0 for known product', async () => { /* mocked off-client */ });
test('label source parses nutrition-label fixture into per-serving values', async () => { /* mocked OCR/model fixture */ });

// functions/src/off-client.test.ts
test('parses current OFF v3 payload shape', async () => { /* canned JSON → OffProduct */ });
test('returns null on 404/malformed payload', async () => { /* implement */ });
```

```dart
// test/contracts/off_live_contract_test.dart
@Tags(['live'])
test('live OFF lookup for barcode 3017624010701 returns the contract fields', () async {
  // read-only GET https://world.openfoodfacts.org/api/v3/product/3017624010701?fields=product_name,nutriments
  // asserts nutriments energy-kcal_100g / proteins_100g / carbohydrates_100g / fat_100g exist and are numeric
});
```

- [x] **Step 2: RED** — Run: `npm --prefix functions test` (recorded script) → Expected: FAIL (`off-client` missing, contract fields absent). And `fvm flutter test test/contracts --tags live` → FAIL (contract test not yet passing) — live test is excluded from default runs.

- [x] **Step 3 (worker): Implement** `off-client.ts`, extend `analyze-entry.ts`/`nutrition.ts` to emit `AnalysisResult` for all three sources, keep model/prompt config in `config.ts`/`model-config.ts`. The OFF client uses an injectable `fetch`, identifying `User-Agent`, abort timeout, GET only, finite numeric validation, and returns `null` for not-found/non-2xx/malformed/network/timeout. `index.ts` and `retry-analysis.ts` preserve `scanMode` and optional `rawBarcode`. Meal and label use distinct vision prompts; barcode uses a supplied barcode or a barcode-extraction vision result before OFF. Firestore serialization exactly matches Flutter: `foodName`, `protein`/`carbs`/`fat`, `atwaterKcal`, `scanMode`, and candidate objects with `proteinG`/`carbsG`/`fatG`.

- [x] **Step 4: GREEN** — Run: `npm --prefix functions run build` → compiles; `npm --prefix functions test` → PASS; `fvm flutter test test/contracts --tags live` → PASS (host runs this once, records the response snapshot date); `fvm flutter test test/contracts` → PASS (live excluded by tag by default).

- [x] **Step 5: Emulator round-trip (host)** — `firebase emulators:exec --only auth,firestore,storage,functions "npm --prefix functions test"` → PASS; confirms all writes stayed in the emulator (check `firebase use` shows the expected project but nothing deployed — no `firebase deploy` anywhere in this plan).

- [x] **Step 6: REVIEW-GATE Task 9** (pre-review required — data-model change; then post-review) until green.

- [x] **Step 7: HANDOFF Task 9**

```powershell
git add -A
git commit -m "Add product analysis contracts for barcode, label, and meal flows"
git push
```

---

### Task 10: Food Detail and Food Edit CRUD

Covers `food` and `food_edit` (one route, edit branch).

**Files:**
- Modify: `lib/features/food_detail/food_detail_sheet.dart`, `lib/features/food_detail/providers/food_detail_providers.dart`, `lib/shared/repositories/food_entry_repository.dart`, `lib/shared/models/food_entry.dart` (add `correctedAt`/serving fields only if missing — inspect first)
- Modify: `lib/features/manual/providers/manual_providers.dart`, `lib/shared/services/seed_data_service.dart`, `lib/debug/ui_diff_fixture.dart`, `firestore.rules`
- Modify: `functions/src/analyze-entry.ts`, `functions/src/aggregation.ts`, `functions/src/index.ts` and their contract tests so every new backend write uses canonical `base*` fields
- Test: extend `test/food_detail_sheet_test.dart`; create `test/food_detail/serving_multiplier_test.dart`, `test/food_detail/food_crud_test.dart`
- Test: extend `test/contracts/analysis_result_contract_test.dart`, Functions analysis/aggregation tests, and Firestore rules tests for canonical-write plus legacy-read behavior

**Interfaces:**
- Consumes: `AnalysisResult` fields on `FoodEntry` (Task 9), `DraftPolicy.confirmDestructiveExit` (Task 3), `MotionDurations.cardExpansion` (Task 4).
- Produces (used by Tasks 11, 16):

```dart
// lib/features/food_detail/providers/food_detail_providers.dart
/// Serving multiplier: 0.25× steps, clamped to [0.25, 5.0].
double clampServing(double raw) => (raw * 4).roundToDouble().clamp(1, 20) / 4;
/// Returns a copy whose multiplier changes; base nutrition is unchanged.
FoodEntry scaledBy(FoodEntry base, double multiplier);
/// Converts an unrounded displayed total back to canonical one-serving data.
double baseFromDisplayed(double displayed, double multiplier);

// lib/shared/repositories/food_entry_repository.dart — all paths remain auth scoped:
Future<String> create(String uid, FoodEntry entry);
Stream<FoodEntry?> watchEntry(String uid, String id);
Future<void> saveCorrection(String uid, String id, NutritionCorrection edit);
Future<void> delete(String uid, String id);
Future<String> duplicate(FoodEntry entry); // new id, same base values, now() via injected Clock
```

`FoodEntry` owns unambiguous `baseKcal/baseProtein/baseCarbs/baseFat` fields and `scaled*` getters. `fromData` reads legacy `kcal/protein/carbs/fat` only when the matching canonical field is absent. Temporary legacy getter/constructor aliases may remain to avoid an unrelated all-app rewrite, but `toMap`, worker output, manual entry, duplicate, seed, fixture, edit saves, and new backend writes emit only canonical `base*` nutrition fields. Aggregation reads canonical first and legacy second, then multiplies exactly once. No storage layer rounds nutrition.

`saveCorrection` accepts canonical one-serving values and an optional multiplier. It writes only fields the user actually changed, adds `corrected: true`, and records deterministic `correctedAt`/`updatedAt` from the injected `Clock`. Editing a displayed total uses `baseFromDisplayed(displayed, multiplier)` before persistence. A multiplier-only correction writes no base nutrition fields. Pending/processing entries expose no edit controls and repository/rules tests reject nutrition edits in those states.

- [x] **Step 1 (worker): Write failing tests**

```dart
// test/food_detail/serving_multiplier_test.dart
test('clampServing snaps to 0.25 steps within 0.25..5.0', () {
  expect(clampServing(0.1), 0.25);
  expect(clampServing(1.13), 1.25);
  expect(clampServing(7.0), 5.0);
});
test('scaledBy scales kcal and macros proportionally', () { /* 2.0× doubles all four values */ });
test('scaledBy changes only multiplier and preserves canonical base values', () { /* implement */ });
test('displayed macro edit converts back to unrounded base once', () { /* 50g at 2x -> 25g base -> 50g display */ });

// test/food_detail/food_crud_test.dart (fake Firestore)
test('update marks entry corrected and persists edited macros', () async { /* implement */ });
test('delete removes entry; duplicate creates a distinct id with same values', () async { /* implement */ });
test('all CRUD paths remain under users/{uid}/entries and watch emits null after delete', () async { /* injected data-store port */ });
test('multiplier-only correction does not rewrite base nutrition', () async { /* implement */ });

// test/food_detail_sheet_test.dart (extend)
testWidgets('hero photo, back, duplicate/delete chips, confidence pill, detected chips, ask-assistant card render', (tester) async { /* implement */ });
testWidgets('edit chip toggles action bar with Undo and Save to Today; save pops back', (tester) async { /* implement */ });
testWidgets('macro value tap opens numeric input sheet in edit mode', (tester) async { /* implement */ });
testWidgets('unsaved edit exit prompts confirmation', (tester) async { /* DraftPolicy.confirmDestructiveExit */ });
testWidgets('pending and processing entries expose no edit or serving controls', (tester) async { /* implement */ });
testWidgets('card-to-detail uses shared transition of ~320ms and dark/light themes both render', (tester) async { /* implement */ });
```

- [x] **Step 2: RED** — Run: `fvm flutter test test/food_detail test/food_detail_sheet_test.dart` → Expected: FAIL (`clampServing`/CRUD surface undefined; UI branches missing).

- [x] **Step 3A (worker): Implement canonical nutrition migration** — `FoodEntry` canonical base fields with legacy read fallback, backend/manual/seed/fixture/duplicate/edit writes emitting only `base*`, aggregation canonical-first fallback, and rules validation. Do not run a production backfill.

- [x] **Step 3B (worker): Implement CRUD and scaling** — auth-scoped repository/data-store seam; nullable watch; deterministic `correctedAt`; clamp/multiplier helpers; displayed-to-base conversion; duplicate/delete semantics; no double scaling.

- [x] **Step 3C (worker): Complete UI behavior** per spec §5.11/§5.12 by extending the existing widget hierarchy — editable macro rows, add-item chip, Undo/Save bar, delete/duplicate actions, `PopScope` + `DraftPolicy` unsaved-exit confirmation, and edit controls hidden for pending/processing. Do not rewrite already-correct hero/detail components.

- [x] **Step 4: GREEN** — Run: `fvm flutter test test/food_detail test/food_detail_sheet_test.dart` → Expected: PASS.

- [x] **Step 5: Stage verification** — `fvm flutter analyze` → `No issues found!`; `fvm flutter test` → no regressions.

- [x] **Step 6: REVIEW-GATE Task 10**, then **HANDOFF Task 10**

```powershell
git add -A
git commit -m "Complete food detail and edit with serving scaling and corrections"
git push
```

---

### Task 11: Today, Today Empty, and Production Aggregation Truth

**Files:**
- Modify: `lib/features/today/today_screen.dart`, `lib/features/today/providers/today_providers.dart`, `lib/shared/widgets/macro_ring.dart`, `lib/shared/widgets/macro_progress_bar.dart`
- Test: extend `test/today_screen_test.dart`, `test/today_providers_test.dart`; create `test/today/aggregation_truth_test.dart`

**Interfaces:**
- Consumes: `FoodEntry` CRUD (Task 10), `clockProvider` (Task 3), `AppMotion` (Task 4), fixture isolation (Task 5).
- Produces: synchronous reactive `todaySummaryProvider` emitting `({int kcal, double proteinG, double carbsG, double fatG, int targetKcal, int kcalLeft})` — always summed from real entries; Task 16/17 depend on this name. `todayDisplaySummaryProvider` is the only fixture-aware presentation adapter and may substitute handoff hero values for `TodayScreen`; no repository, aggregate, or downstream feature may consume that adapter.

- [x] **Step 1 (worker): Write failing tests**

```dart
// test/today/aggregation_truth_test.dart
test('summary sums real entries — never the fixture hero override', () async {
  // three fixture entries → 845 kcal / 74 P / 92 C / 20 F even when ui-diff fixture flag is on,
  // because the override applies only in the fixture presentation layer, not the provider
  await container.read(todayEntriesProvider.future);
  final s = container.read(todaySummaryProvider);
  expect(s.kcal, 845);
});
test('kcalLeft = targetKcal - eaten, floored at provider level per current behavior', () async { /* implement */ });
test('display adapter alone may substitute fixture hero values', () async { /* production summary remains 845 while display is 1420 */ });

// test/today_screen_test.dart (extend)
testWidgets('hero ring count-up runs ~1.4s easeOutCubic and snaps under reduced motion', (tester) async { /* implement */ });
testWidgets('macro rows show grams, target, percentage in spec colors', (tester) async { /* implement */ });
testWidgets('empty state shows zeroed ring, no-meals copy, camera CTA', (tester) async { /* implement */ });
testWidgets('meal card shows thumbnail, name, kcal, time, macro pips, confidence badge; amber for <80%', (tester) async { /* implement */ });
testWidgets('avatar tap pushes profile; bell is a placeholder; both themes render', (tester) async { /* implement */ });
```

- [x] **Step 2: RED** — Run: `fvm flutter test test/today test/today_screen_test.dart test/today_providers_test.dart` → Expected: FAIL on the new assertions.

- [x] **Step 3 (worker): Implement** parity details per spec §5.9/§5.10 against `cx-screen-today.jsx` values (paddings/radii/font sizes copied exactly), count-up via `AppMotion`, aggregation strictly from repository entries. Implement `todaySummaryProvider` as a synchronous `Provider` watching `todayEntriesProvider` and `activePlanProvider` `AsyncValue`s so Firestore/plan emissions remain reactive; isolate the fixture hero mismatch in `todayDisplaySummaryProvider` and test the two contracts separately.

- [x] **Step 4: GREEN** — Run: same test files → Expected: PASS.

- [x] **Step 5: Stage verification** — `fvm flutter analyze` → `No issues found!`; `fvm flutter test` → no regressions.

- [x] **Step 6: REVIEW-GATE Task 11**, then **HANDOFF Task 11**

```powershell
git add -A
git commit -m "Bring Today screens to parity with production aggregation checks"
git push
```

---

### Task 12: History Week/Month Time Travel, Fills, and Drilldown

**Files:**
- Modify: `lib/features/history/history_screen.dart`, `lib/features/history/history_day_screen.dart`, `lib/features/history/providers/history_providers.dart`
- Test: extend `test/history_screen_test.dart`; create `test/history/history_time_travel_test.dart`

**Interfaces:**
- Consumes: `clockProvider` (Task 3), `todaySummaryProvider` shape (Task 11), day-key util (`lib/shared/utils/date_key.dart`).
- Produces: immutable `HistoryRange(start, endExclusive)` plus `historyRangeProvider(HistoryRange)` used by Task 16's time-travel integration suite; week↔month toggle state preserved across tab swipes (Task 2 shell). `HistoryRange` normalizes both bounds to canonical `YYYY-MM-DD` keys and implements `operator ==`/`hashCode` from those keys so rebuilds reuse the Riverpod family instance. The auto-disposed range provider queries canonical `dailyLogs.date` keys without a fixed document limit. A separate recent-history stream remains responsible for cross-week streak calculation.
- Timezone rule: selected dates remain `tz.TZDateTime`; week/month starts use `timezone_utils.startOfWeek`/`startOfMonth`, and period shifts use calendar constructors in the same location rather than 24-hour `Duration` subtraction. Firestore bounds and row keys use `timezone_utils.dateKeyFor`, preserving local dates across DST.
- Navigation lower bound: `accountCreationProvider` derives Firebase Auth `metadata.creationTime` and is overrideable in tests. Previous-week/month navigation stops at the period containing account creation; `_canGoPrevious` dims and disables the left chevron at that boundary. Missing metadata does not invent a lower bound.
- Day-row truth: `buildHistoryWeekRows` materializes every eligible date from account creation through `min(endOfWeek, now)`, preserving real aggregate rows and inserting explicit zero-entry rows for elapsed empty days. Future dates never become day rows or drilldown targets.
- Streak truth: `computeActiveStreak` starts at today when today has data, otherwise grants the still-open current day and starts at yesterday; it then requires consecutive canonical date keys with data. This preserves an active streak before the user logs today's first meal.

- [x] **Step 1 (worker): Write failing tests**

```dart
// test/history/history_time_travel_test.dart (FakeClock overrides)
test('advancing 3 days shows 3 new empty day rows with previous data intact', () async { /* use FakeClock + buildHistoryWeekRows */ });
test('week strip navigates back/forward with chevrons and clamps at account creation', () async { /* assert disabled left tap at boundary */ });
test('active streak starts from yesterday while the current day is still empty', () async { /* implement */ });
test('month grid marks green (target met) and amber (review/miss) dots from real data, today gets cyan border, future days dimmed', () async { /* implement */ });

// test/history_screen_test.dart (extend)
testWidgets('week↔month animated size transition ~300ms ease-in-out; instant under reduced motion', (tester) async { /* implement */ });
testWidgets('weekly stats card shows avg kcal/day, target badge, sparkline, macro mini-stats, streak pill', (tester) async { /* implement */ });
testWidgets('day row tap opens history day screen listing that day\'s foods', (tester) async { /* implement */ });
testWidgets('horizontal strip gestures do not trigger tab swipe; both themes render', (tester) async { /* implement */ });
```

- [x] **Step 2: RED** — Run: `fvm flutter test test/history test/history_screen_test.dart` → Expected: FAIL on new assertions.

- [x] **Step 3 (worker): Implement** per spec §5.13/§5.14 against `cx-screen-history.jsx`; all date math through the injected clock and timezone-aware calendar constructors. Replace the screen's fixed-limit source with an auto-disposed selected range provider, retain a recent stream for cross-week streaks, apply `AppMotion.durationOf` to the 300ms week↔month transition, key rows as `history-day-row-YYYY-MM-DD`, and route only elapsed eligible day rows to History Day. Retain and regression-test the existing disabled/dimmed future month cells.

- [x] **Step 4: GREEN** — Run: same → Expected: PASS.

- [x] **Step 5: Stage verification** — `fvm flutter analyze` → `No issues found!`; `fvm flutter test` → no regressions.

- [x] **Step 6: REVIEW-GATE Task 12**, then **HANDOFF Task 12**

```powershell
git add -A
git commit -m "Complete history time travel, fills, and drilldown"
git push
```

---

### Task 13: Goals and Goals Select

**Files:**
- Modify: `lib/features/goals/goals_screen.dart`, `lib/features/goals/providers/goals_providers.dart`, `lib/shared/repositories/macro_target_repository.dart`, `lib/shared/models/macro_target_plan.dart` (weight-log fields only if missing — inspect first)
- Test: extend `test/goals_screen_test.dart`; create `test/goals/goals_persistence_test.dart`

**Interfaces:**
- Consumes: `clockProvider` (Task 3 — week/month period math), `DraftPolicy.confirmDestructiveExit` for goal edits (Task 3).
- Produces: `activePlanProvider` (plan persists across restart via repository), `weightLogProvider`; assistant confirmation flow (Task 14) mutates plans only through `macro_target_repository.dart`.
- Draft contract: one immutable `GoalsDraft` owns source plan ID, goal, kcal/macros, edit/dirty/saving/error state. A notifier listens to `activePlanProvider`, adopts delayed/restarted `AsyncData` plan emissions only while clean, explicitly ignores `AsyncLoading`/`AsyncError`, and never overwrites an unsaved draft from the same source plan. `Adjust` enters edit mode; it becomes `Save` while editing. Successful save clears dirty/editing and re-synchronizes from the repository; failed save remains editable and visible.
- Persistence contract: add testable `MacroTargetDataStore` and `WeightLogDataStore` seams with Firestore adapters and repositories. Existing plans update in place; a missing/default plan uses `createAndSetActivePlan`, whose Firestore adapter deactivates existing active plans and creates the replacement in one `WriteBatch`. All writes remain under `users/{uid}/targets` or `users/{uid}/weightLogs`.
- Validation contract: kcal stays within `AppConstants.kcalSliderMin..kcalSliderMax`; protein/carbs/fat must be positive and bounded; weight must be finite and within the existing UI-supported range. Invalid values never reach a data store.
- Exit contract: a dirty Goals draft uses `DraftPolicy.goalsEdit` via `PopScope`, offering Keep editing/Discard. Clean, saved, or read-only state exits immediately.

- [x] **Step 1 (worker): Write failing tests**

```dart
// test/goals/goals_persistence_test.dart (fake Firestore + FakeClock)
test('plan edits persist and survive provider container recreation (restart shape)', () async { /* fake MacroTargetDataStore */ });
test('late active-plan emission hydrates a clean draft but never overwrites dirty edits', () async { /* implement */ });
test('body goal change adjusts kcal target and macro split per plan rules', () async { /* implement */ });
test('weight log appends and the 30-day series extends with clock advance', () async { /* fake WeightLogDataStore */ });
test('validation rejects non-positive targets and out-of-range slider or weight values before store calls', () async { /* implement */ });
test('period week counter increments after +7 calendar days across DST', () async { /* implement */ });

// test/goals_screen_test.dart (extend)
testWidgets('period dropdown opens under the pill with barrier dismiss, cyan active row, checkmark, ~200ms entrance', (tester) async { /* implement */ });
testWidgets('gradient kcal slider drag changes target and does not trigger tab swipe', (tester) async { /* implement */ });
testWidgets('segmented body-goal control, calorie card with TDEE badge and stepper, macro split tiles, weight card render in both themes', (tester) async { /* implement */ });
testWidgets('Adjust enters edit mode, Save persists, failure stays editable, and dirty back prompts', (tester) async { /* implement */ });
```

- [x] **Step 2: RED** — Run: `fvm flutter test test/goals test/goals_screen_test.dart` → Expected: FAIL on new assertions.

- [x] **Step 3 (worker): Implement** per spec §5.15/§5.16 against `cx-screen-goals.jsx`; dropdown and segmented selection via `AppMotion`, persistence through the testable repository seams, and all period math by converting `plan.startDate` to `now.location` before timezone-aware calendar-date calculations rather than physical-duration day counts.

- [x] **Step 4: GREEN** — Run: same → Expected: PASS.

- [x] **Step 5: Stage verification** — `fvm flutter analyze` → `No issues found!`; `fvm flutter test` → no regressions.

- [x] **Step 6: REVIEW-GATE Task 13**, then **HANDOFF Task 13**

```powershell
git add -A
git commit -m "Complete goals selector, persistence, and validation"
git push
```

---

### Task 14: Assistant Chat, Chat History, Confirmation Actions, Functions, and Rules

Covers `ai` and `ai_history`. Security-touching (Firestore rules) — pre-review REQUIRED before rules change, plus emulator rules tests.

**Files:**
- Modify: `lib/features/ai_chat/ai_chat_screen.dart`, `lib/features/ai_chat/providers/ai_chat_providers.dart`, `lib/shared/services/ai_chat_service.dart`
- Create: `lib/features/ai_chat/ai_history_screen.dart`, `lib/shared/models/ai_chat_thread.dart`
- Modify: `lib/core/router/route_names.dart` + `lib/core/router/app_router.dart` (add `RouteNames.aiHistory` at `/ai/history`)
- Modify: `functions/src/ai-chat.ts` (server-derived context: profile, current plan, recent meals attached server-side; client sends only message text), `firestore.rules` (thread + message subcollections, owner-only)
- Test: extend `test/ai_chat_screen_test.dart`; create `test/ai_chat/ai_history_screen_test.dart`, `test/ai_chat/thread_repository_test.dart`; create `functions/src/ai-chat.test.ts`, `functions/src/ai-threads-rules.test.ts` (`@firebase/rules-unit-testing`)

**Interfaces:**
- Consumes: `activePlanProvider`/`macro_target_repository` (Task 13), `linkedMealId` from review "Ask AI" (Task 8), origin-return routing (Task 2).
- Canonical storage is the already-shipped `users/{uid}/aiThreads` collection. References to `ai_threads` in the design prose are stale; implementation, rules, fixtures, and tests must not create a parallel collection.
- The callable owns exchange persistence and archival. Its client payload is `{message, clientMessageId, threadId?, linkedMealId?}` only; plan, intake, profile, recent meals, and prior turns are loaded server-side from the authenticated user's documents. User/reply message IDs are deterministic so a completed retry returns the persisted reply without a second model call.
- Thread titles use Unicode code-point-safe 60-character truncation. The server validates a linked meal under the authenticated user's entries before storing it and validates structured model actions before returning them.
- The client repository reads threads/messages with document-snapshot cursors and explicitly deletes `messages` and `messageArchive` in batches of at most 500 before deleting a thread parent. Archive writes remain server-only; owner clients may read archived messages.
- Confirmation Apply enters an `applying` state before awaiting `MacroTargetRepository.saveActivePlan`; repeat taps are no-ops. Failed sends retain the user turn and retry with the same `clientMessageId`.
- Produces (used by Task 16):

```dart
// lib/shared/models/ai_chat_thread.dart (spec §8.1)
class AiChatThread {
  const AiChatThread({required this.id, required this.uid, required this.createdAt,
      required this.updatedAt, this.linkedMealId, this.title});
  final String id; final String uid;
  final DateTime createdAt; final DateTime updatedAt;
  final String? linkedMealId;
  final String? title; // auto-generated from first user message, truncated to 60 chars
  // messages live in the subcollection users/{uid}/ai_threads/{id}/messages — never an embedded array
}
```

```text
firestore.rules addition (owner-only):
match /users/{uid}/ai_threads/{threadId} {
  allow read, write: if request.auth != null && request.auth.uid == uid;
  match /messages/{messageId} {
    allow read, write: if request.auth != null && request.auth.uid == uid;
  }
}
```

- [x] **Step 1: Pre-implementation REVIEW-GATE Task 14** — host submits the thread model, rules diff, and server-context design for review **before** implementation; proceed only when green.

- [x] **Step 2 (worker): Write failing tests**

```dart
// test/ai_chat/thread_repository_test.dart (fake Firestore)
test('send auto-creates thread with title from first message (60-char truncation)', () async { /* implement */ });
test('messages page 20 at a time, older loaded on upward scroll', () async { /* implement */ });
test('thread caps at 200 messages; older messages move to the archive collection', () async { /* implement */ });
test('thread list sorts by updatedAt descending; linkedMealId stored from food-detail entry', () async { /* implement */ });

// test/ai_chat_screen_test.dart (extend)
testWidgets('user bubbles are right-aligned blue-tinted with bottom-left tail; assistant left-aligned', (tester) async { /* the reported placement bug — assert alignment explicitly */ });
testWidgets('typing indicator pulses three dots staggered 200ms; static under reduced motion', (tester) async { /* implement */ });
testWidgets('confirmation card shows old→new with delta chip; Apply mutates plan via repository; Keep original does not', (tester) async { /* implement */ });
testWidgets('double Apply on the same confirmation is a no-op the second time (concurrency guard)', (tester) async { /* implement */ });
testWidgets('send failure surfaces a retryable error state, message not lost', (tester) async { /* implement */ });
testWidgets('close returns to origin; history icon opens ai_history', (tester) async { /* implement */ });

// test/ai_chat/ai_history_screen_test.dart
testWidgets('thread list shows preview, timestamp, linked meal badge; tap loads that thread into chat', (tester) async { /* implement */ });
testWidgets('empty state shows no-conversations CTA; swipe-to-delete asks confirmation', (tester) async { /* implement */ });
```

```ts
// functions/src/ai-chat.test.ts
test('request context is server-derived: profile, plan, recent meals attached; client text only', async () => { /* implement */ });
// functions/src/ai-threads-rules.test.ts
test('owner can read/write own thread + messages; other uid and unauthenticated are denied', async () => { /* implement */ });
```

- [x] **Step 3: RED** — Run: `fvm flutter test test/ai_chat test/ai_chat_screen_test.dart` → FAIL; `firebase emulators:exec --only firestore "npm --prefix functions test"` → FAIL (rules/tests missing).

- [x] **Step 4 (worker): Implement** per spec §5.17/§5.18/§8 — persistence, pagination, archive cap, history screen, bubble alignment, animated waiting states, confirmation apply/reject with idempotency guard, origin-close, rules block, server-context in `ai-chat.ts`.

- [x] **Step 5: GREEN** — Run: `fvm flutter test test/ai_chat test/ai_chat_screen_test.dart` → PASS; `npm --prefix functions run build` → compiles; `firebase emulators:exec --only firestore "npm --prefix functions test"` → PASS (all writes emulator-only).

- [x] **Step 6: Stage verification** — `fvm flutter analyze` → `No issues found!`; `fvm flutter test` → no regressions; host re-reads `firestore.rules` diff against the current deployed rules file in-repo (no deploy happens — rules deploy needs explicit user confirmation and is out of scope).

- [x] **Step 7: Post-implementation REVIEW-GATE Task 14** (security-touching — include the rules diff) until green, then **HANDOFF Task 14**

```powershell
git add -A
git commit -m "Persist assistant chat threads with history screen and owner-only rules"
git push
```

---

### Task 15: Profile, Loading, Login, and Permission Secondary Parity

**Files:**
- Modify: `lib/features/profile/profile_sheet.dart` (complete to spec §5.19: user card, link-account card for anonymous, System/Light/Dark selector, notifications toggle, units metric/imperial, camera settings, legal section, sign-out with confirmation, drag/tap dismiss)
- Modify: `lib/features/onboarding/loading_screen.dart` (halo pulse ~2.6s, 60-mark tick ring with ~28% gradient arc at 1.8s, staged labels WAKING SENSORS → CONNECTING · AI CLOUD → SYNCING TODAY → READY, determinate gradient bar, dot mesh, version pill, ≥1.8s splash beat)
- Modify: `lib/features/onboarding/login_screen.dart` (email+password, Apple/Google, guest, trust chips, keyboard avoidance, auth redirect signed-in→scan)
- Modify: `lib/features/scan/permission_screen.dart` (visual parity polish vs `cx-screen-states.jsx` permission branch; fixture-mode iOS-style overlay per spec §5.3)
- Test: extend `test/onboarding_test.dart`; create `test/profile/profile_sheet_test.dart`

**Interfaces:**
- Consumes: theme/units/notification preferences via `shared_preferences`; router push semantics (Task 2); `AppMotion` (Task 4).
- Produces: `settingsProvider` (`themeMode`, `units`, `notificationsEnabled`, `cameraResolution`, `autoCapture`) persisted across restart — Task 16 asserts persistence; Task 17 captures `loading`/`login`/`permission`/`profile` states.

- [x] **Step 1 (worker): Write failing tests**

```dart
// test/profile/profile_sheet_test.dart
testWidgets('renders user card, theme selector, notifications toggle, units, camera settings, legal, sign out', (tester) async { /* implement */ });
testWidgets('theme selection persists via shared_preferences and applies immediately', (tester) async { /* implement */ });
testWidgets('sign out asks confirmation; close and swipe-down both pop to origin', (tester) async { /* implement */ });
testWidgets('keyboard over login fields does not overflow; back from profile restores origin route', (tester) async { /* implement */ });

// test/onboarding_test.dart (extend)
testWidgets('loading shows staged labels in order with ≥1.8s beat before navigation (FakeAsync)', (tester) async { /* implement */ });
testWidgets('signed-in redirect lands on scan; signed-out lands on login', (tester) async { /* implement */ });
```

- [x] **Step 2: RED** — Run: `fvm flutter test test/profile test/onboarding_test.dart` → Expected: FAIL on new assertions.

- [x] **Step 3 (worker): Implement** against `cx-screen-profile.jsx`, `cx-screen-loading.jsx`, `cx-screen-login.jsx`, `cx-screen-states.jsx` exact values.

- [x] **Step 4: GREEN** — Run: same → Expected: PASS.

- [x] **Step 5: Stage verification** — `fvm flutter analyze` → `No issues found!`; `fvm flutter test` → no regressions; a11y guideline test (Task 4 file) extended to profile/login and passing.

- [x] **Step 6: REVIEW-GATE Task 15**, then **HANDOFF Task 15**

```powershell
git add -A
git commit -m "Polish profile, loading, login, and permission screens"
git push
```

---

### Task 16: Connected-Device E2E Matrix

All scripted suites run against emulators/fakes (Firebase emulator suite + mock processing backend + device camera). Environments are strictly separated: **(a) emulator/fake** — scripted pass/fail; **(b) read-only live** — OFF contract test only (Task 9's tagged test, re-run here); **(c) authorization-blocked cloud** — real cloud processing/push delivery through production infrastructure is NOT exercised; each such gate is recorded as **blocked** in `docs/implementation-status.md`, never as passed.

**Files:**
- Create: `integration_test/e2e/meal_flow_test.dart`, `barcode_flow_test.dart`, `label_flow_test.dart`, `manual_flow_test.dart`, `review_flow_test.dart`, `crud_test.dart`, `goals_flow_test.dart`, `assistant_flow_test.dart`, `notification_return_test.dart`, `interrupted_upload_test.dart`, `profile_return_test.dart`, `swipe_nav_test.dart`, `device_state_test.dart`
- Create: `integration_test/e2e/support/e2e_harness.dart` (boots app against emulator Firebase + `FakeClock` + mock processing backend; exposes `pumpAppE2E()`, reseed, notification-tap simulation)
- Test: the files above are the tests.

**Interfaces:**
- Consumes: every Produces block from Tasks 2–15 plus the deep-link harness (Task 5).
- Produces: the release E2E evidence rows in `docs/implementation-status.md` (suite → pass/fail/blocked, device, build hash).

- [ ] **Step 1 (worker): Write the core flow suites** (each maps 1:1 to spec §11 scenarios; skeleton shape):

```dart
// integration_test/e2e/support/e2e_harness.dart
Future<void> pumpAppE2E(WidgetTester tester, {FakeClock? clock, bool seed = true}) async { /* implement */ }

// meal_flow_test.dart — spec §11.1: scan ready → capture → processing → simulated completion
// → notification tap → Today shows card → detail shows image/name/macros/confidence.
// barcode_flow_test.dart — §11.2 with known-barcode fixture through the mock backend.
// label_flow_test.dart — §11.3 label fixture; <80% branch lands on review.
// manual_flow_test.dart — §11.4 all four manual entry paths; created food appears in Today.
// review_flow_test.dart — §11.5 candidate select/none-of-these/ask-assistant branches.
// crud_test.dart — §11.6 create/read/update/delete/duplicate round trip.
```

- [ ] **Step 2: RED — core flows** — Run: `fvm flutter test integration_test/e2e/meal_flow_test.dart integration_test/e2e/barcode_flow_test.dart integration_test/e2e/label_flow_test.dart integration_test/e2e/manual_flow_test.dart integration_test/e2e/review_flow_test.dart integration_test/e2e/crud_test.dart -d emulator-5554` (emulator launched via `fvm flutter emulators --launch Api35_NoPlay`; Firebase emulators running via `firebase emulators:start --only auth,firestore,storage,functions` in a second shell) → Expected: initial failures where flows are still loosely wired; fix product code via WORKER-RUN until green — every fix lands with its own RED→GREEN note in `docs/implementation-status.md`.

- [ ] **Step 3: GREEN — core flows** — Run: same command → Expected: all 6 core suites PASS on the connected emulator.

- [ ] **Step 4: CHECKPOINT 1 — core flows verified** — `fvm flutter analyze` → `No issues found!`; `fvm flutter test` → no regressions. Host updates `docs/implementation-status.md` with exact red/green evidence (test output counts, suite names) and the next step for stateful suites. Host commits checkpoint: `git add -A && git commit -m "E2E core flows passing (meal, barcode, label, manual, review, crud)"`. Then host runs `git push` separately. **Push gate:** if `git push` fails, record the exact failure output in `docs/implementation-status.md` and stop — do not proceed to Step 5. The local commit remains intact; do not revert it.

- [ ] **Step 5 (worker): Write the stateful/weird-state suites**:

```dart
// goals_flow_test.dart — §11.7 body-goal switch, protein 180g, slider 2200, weight 82.5 → chart.
// assistant_flow_test.dart — §11.8 confirmation card apply updates plan; Today ring reflects it.
// notification_return_test.dart — §11.9 fresh + stale notification taps (stale shows detail, no error).
// interrupted_upload_test.dart — §11.10 kill mid-upload (restart harness), queue retries, entry lands.
// profile_return_test.dart — §11.11 origin return from Today/Scan/AI.
// swipe_nav_test.dart — §11.12 full left/right traversal; scroll, calendar, chat positions preserved.
// device_state_test.dart — §11.13 scripted subset: rapid capture taps, keyboard open/close on search/
//   composer/manual, camera denial→manual→regrant, empty/error/loading variants render, each main
//   screen visited 10× without state corruption. Plus restart-shaped Task 3 scenarios: cold restart
//   with shifted FakeClock → Scan landing, theme persists, history/goals/weight advance correctly.
```

- [ ] **Step 6: RED — stateful/weird-state flows** — Run: `fvm flutter test integration_test/e2e/goals_flow_test.dart integration_test/e2e/assistant_flow_test.dart integration_test/e2e/notification_return_test.dart integration_test/e2e/interrupted_upload_test.dart integration_test/e2e/profile_return_test.dart integration_test/e2e/swipe_nav_test.dart integration_test/e2e/device_state_test.dart -d emulator-5554` → Expected: initial failures; fix via WORKER-RUN until green.

- [ ] **Step 7: GREEN — stateful/weird-state flows** — Run: same command → Expected: all 7 suites PASS.

- [ ] **Step 8: CHECKPOINT 2 — stateful/weird-state flows verified** — `fvm flutter analyze` → `No issues found!`; `fvm flutter test` → no regressions. Host updates `docs/implementation-status.md` with exact red/green evidence (test output counts, suite names) and the next step for full matrix run. Host commits checkpoint: `git add -A && git commit -m "E2E stateful and weird-state flows passing (goals, assistant, notification, upload, profile, nav, device-state)"`. Then host runs `git push` separately. **Push gate:** if `git push` fails, record the exact failure output in `docs/implementation-status.md` and stop — do not proceed to Step 9. The local commit remains intact; do not revert it.

- [ ] **Step 9: Full matrix run** — Run: `fvm flutter test integration_test/e2e -d emulator-5554` → Expected: all 13 suites PASS. Re-run the read-only live contract: `fvm flutter test test/contracts --tags live` → PASS (environment b). Record environment-c gates (real push delivery, real cloud model processing) as **blocked** with the exact reason "requires explicit user authorization and isolated test project".

- [ ] **Step 10: Stage verification** — `fvm flutter analyze` → `No issues found!`; `fvm flutter test` → full unit/widget suite passes.

- [ ] **Step 11: REVIEW-GATE Task 16**, then **HANDOFF Task 16**

```powershell
git add -A
git commit -m "Add connected-device end-to-end scenario matrix"
git push
```

### Task 17: Exhaustive 38-State Two-Theme UI-Diff Visual Program

Owns every visual parity gate. Builds the release build once, captures all 38 canonical states (19 IDs × 2 themes) at device-native pixels, fingerprints staleness per capture, runs the three-tier ui-diff hierarchy (broad → region → target), and iteratively repairs until every state passes with status complete, `auditLimited` false, and zero unresolved findings.

**Files:**
- Modify: `tool/ui_capture/capture_states.ps1` (Task 5 scaffold — now complete the full 38-state driver)
- Create: `tool/ui_capture/validate_artifacts.ps1` (post-capture artifact integrity checker)
- Create: `tool/ui_capture/ui_diff_loop.ps1` (broad→region→target iteration driver)
- Modify: `docs/implementation-status.md` (visual evidence log rows)
- Evidence output: `.ui-diff/captures/<date>/` — per-state `<id>--<theme>.png` + `<id>--<theme>.meta.json`; `.ui-diff/runs/<run-id>/` — broad/region/target reports

**Interfaces:**
- Consumes: `kDebugScreenRoutes` deep-link map (Task 5), `forceReseedForUiDiff` (Task 5), installed release APK on emulator, reference PNGs from `docs/design-handoff/placeholder-app/reference-images/`
- Produces: 38 meta JSONs with `{buildHash, route, theme, fixtureProfile, fixtureHash, deviceModel, viewportWidth, viewportHeight, captureTimestamp, staleBuildFingerprint}`, 38 ui-diff report artifacts, run IDs recorded in `docs/implementation-status.md`

#### Fixture Profiles (per canonical state)

Each canonical state maps to a **fixture profile** that defines the expected Firestore seed contents. The `fixtureHash` in each meta JSON must match the hash of the profile's actual seed data for that state; distinct profiles may have distinct hashes. The `fixtureProfile` field records which profile was used.

| Fixture profile | States | Seed contents |
|---|---|---|
| `empty` | `today_empty` | No food entries, no history, no weight logs, no active plan, empty chat |
| `populated` | `today`, `food`, `food_edit`, `history_week`, `history_month`, `goals`, `goals_select`, `ai`, `ai_history`, `profile` | 3 food entries (high-conf, low-conf, editing), 7 days history, 2 weight logs, 1 active plan, 1 chat thread |
| `flow_permission` | `permission` | Camera permission denied state; no food entries |
| `flow_scan` | `scan_idle`, `scan_capturing` | Camera ready; no food entries; scan_capturing shows mid-shutter state |
| `flow_processing` | `processing` | Upload in progress; skeleton shimmer visible; no completed entries |
| `flow_review` | `review` | Low-confidence scan result; candidate list populated; no confirmed entry |
| `flow_manual` | `manual` | Manual entry form; search results seeded; no saved entries |
| `flow_loading` | `loading` | App initialization; no user data; staged label sequence |
| `flow_login` | `login` | Pre-auth state; no user data |

#### State Matrix (38 states)

| # | State key | ID | Theme | Deep-link |
|---|---|---|---|---|
| 1 | `loading--dark` | loading | dark | `calorix://debug/reseed?screen=loading&theme=dark` |
| 2 | `loading--light` | loading | light | `calorix://debug/reseed?screen=loading&theme=light` |
| 3 | `login--dark` | login | dark | `calorix://debug/reseed?screen=login&theme=dark` |
| 4 | `login--light` | login | light | `calorix://debug/reseed?screen=login&theme=light` |
| 5 | `permission--dark` | permission | dark | `calorix://debug/reseed?screen=permission&theme=dark` |
| 6 | `permission--light` | permission | light | `calorix://debug/reseed?screen=permission&theme=light` |
| 7 | `scan_idle--dark` | scan_idle | dark | `calorix://debug/reseed?screen=scan_idle&theme=dark` |
| 8 | `scan_idle--light` | scan_idle | light | `calorix://debug/reseed?screen=scan_idle&theme=light` |
| 9 | `scan_capturing--dark` | scan_capturing | dark | `calorix://debug/reseed?screen=scan_capturing&theme=dark` |
| 10 | `scan_capturing--light` | scan_capturing | light | `calorix://debug/reseed?screen=scan_capturing&theme=light` |
| 11 | `processing--dark` | processing | dark | `calorix://debug/reseed?screen=processing&theme=dark` |
| 12 | `processing--light` | processing | light | `calorix://debug/reseed?screen=processing&theme=light` |
| 13 | `review--dark` | review | dark | `calorix://debug/reseed?screen=review&theme=dark` |
| 14 | `review--light` | review | light | `calorix://debug/reseed?screen=review&theme=light` |
| 15 | `manual--dark` | manual | dark | `calorix://debug/reseed?screen=manual&theme=dark` |
| 16 | `manual--light` | manual | light | `calorix://debug/reseed?screen=manual&theme=light` |
| 17 | `today--dark` | today | dark | `calorix://debug/reseed?screen=today&theme=dark` |
| 18 | `today--light` | today | light | `calorix://debug/reseed?screen=today&theme=light` |
| 19 | `today_empty--dark` | today_empty | dark | `calorix://debug/reseed?screen=today_empty&theme=dark` |
| 20 | `today_empty--light` | today_empty | light | `calorix://debug/reseed?screen=today_empty&theme=light` |
| 21 | `food--dark` | food | dark | `calorix://debug/reseed?screen=food&theme=dark` |
| 22 | `food--light` | food | light | `calorix://debug/reseed?screen=food&theme=light` |
| 23 | `food_edit--dark` | food_edit | dark | `calorix://debug/reseed?screen=food_edit&theme=dark` |
| 24 | `food_edit--light` | food_edit | light | `calorix://debug/reseed?screen=food_edit&theme=light` |
| 25 | `history_week--dark` | history_week | dark | `calorix://debug/reseed?screen=history_week&theme=dark` |
| 26 | `history_week--light` | history_week | light | `calorix://debug/reseed?screen=history_week&theme=light` |
| 27 | `history_month--dark` | history_month | dark | `calorix://debug/reseed?screen=history_month&theme=dark` |
| 28 | `history_month--light` | history_month | light | `calorix://debug/reseed?screen=history_month&theme=light` |
| 29 | `goals--dark` | goals | dark | `calorix://debug/reseed?screen=goals&theme=dark` |
| 30 | `goals--light` | goals | light | `calorix://debug/reseed?screen=goals&theme=light` |
| 31 | `goals_select--dark` | goals_select | dark | `calorix://debug/reseed?screen=goals_select&theme=dark` |
| 32 | `goals_select--light` | goals_select | light | `calorix://debug/reseed?screen=goals_select&theme=light` |
| 33 | `ai--dark` | ai | dark | `calorix://debug/reseed?screen=ai&theme=dark` |
| 34 | `ai--light` | ai | light | `calorix://debug/reseed?screen=ai&theme=light` |
| 35 | `ai_history--dark` | ai_history | dark | `calorix://debug/reseed?screen=ai_history&theme=dark` |
| 36 | `ai_history--light` | ai_history | light | `calorix://debug/reseed?screen=ai_history&theme=light` |
| 37 | `profile--dark` | profile | dark | `calorix://debug/reseed?screen=profile&theme=dark` |
| 38 | `profile--light` | profile | light | `calorix://debug/reseed?screen=profile&theme=light` |

- [ ] **Step 1: Inventory canonical handoff references** — host catalogs every JSX source in `docs/design-handoff/placeholder-app/src/` that maps to one of the 19 canonical IDs. For each: record the JSX file path, the exported component name, and whether a corresponding reference PNG exists in `docs/design-handoff/placeholder-app/reference-images/`. For any state where the JSX exists but no PNG was exported, render the missing expected image deterministically at the same viewport size (1080×2400 logical) and theme as the capture target using the JSX build pipeline; save as `.ui-diff/expected/<id>--<theme>.png`. Fingerprint each expected image (file hash) and record it in `.ui-diff/expected/<id>--<theme>.meta.json` alongside the JSX source commit hash and component export name. Block the visual gate if any expected artifact is missing or stale (JSX source changed since the expected image was rendered).

- [ ] **Step 2: Fresh-build fingerprinting** — host records `git rev-parse HEAD` as `buildHash`; builds release APK (`fvm flutter build apk --release`); records APK `Get-FileHash` as `apkHash`; stores both in `.ui-diff/captures/<date>/build-manifest.json`. On every later capture, the script compares current `buildHash` against the manifest; if stale, it rebuilds and re-installs before capturing. If fresh, it skips the rebuild and logs `"build fresh, skipped rebuild"`.

- [ ] **Step 3: Per-state capture loop** — host runs `tool/ui_capture/capture_states.ps1 -Screens all -Themes dark,light`. For each of the 38 states: (a) verify build fingerprint is fresh (Step 2); (b) reseed deterministically via `adb shell am start -a android.intent.action.VIEW -d "calorix://debug/reseed?screen=<id>&theme=<theme>"`; (c) wait for settle (300ms post-navigation); (d) capture at device-native resolution via `adb exec-out screencap -p` — no resize, no cropping; (e) write `<id>--<theme>.png` and `<id>--<theme>.meta.json` containing `{buildHash, apkHash, route, theme, fixtureProfile, fixtureHash, deviceModel, viewportWidth, viewportHeight, captureTimestamp, deepLink}`; (f) generate per-state `runId` = `<buildHash>-<id>-<theme>-<timestamp>`.

- [ ] **Step 4: Artifact integrity validation** — host runs `tool/ui_capture/validate_artifacts.ps1`. Asserts: exactly 38 PNGs exist; each is valid PNG with IHDR dimensions matching device viewport; each meta JSON has all required fields including `fixtureProfile` and `fixtureHash`; all `buildHash` values match the manifest; each `fixtureHash` matches the expected hash for its `fixtureProfile` (not identical across all 38 — distinct profiles have distinct hashes); no duplicate filenames; file count = 38. Fail-fast on any violation.

- [ ] **Step 5: CHECKPOINT 1 — capture infrastructure verified** — Host updates `docs/implementation-status.md` with exact evidence (38 PNGs exist, all meta JSONs parse, all fixtureProfile/fixtureHash pairs consistent, all expected images present and fingerprinted) and the next step for the three-tier ui-diff loop. Host commits: `git add -A && git commit -m "Add 38-state capture infrastructure with fixture profiles and expected images"`. Then RECORD-GATE: verify all 38 PNGs exist, all meta JSONs parse, all fixtureProfile/fixtureHash pairs are consistent, all expected images are present and fingerprinted. Then host runs `git push` separately. **Push gate:** if `git push` fails, record the exact failure output in `docs/implementation-status.md` and stop — do not proceed to Step 6. The local commit remains intact; do not revert it.

- [ ] **Step 6: Exhaustive artifact inspection** — host visually inspects every PNG against its corresponding expected image in `.ui-diff/expected/` (or reference PNG in `docs/design-handoff/placeholder-app/reference-images/`). Checks: (a) layout matches JSX structural intent; (b) no pure `#FFFFFF` or `#000000` tokens; (c) gradient direction correct (blue→cyan→green); (d) Geist/Geist Mono typography present; (e) hairlines at 0.5px scale; (f) paddings/radii/font sizes match JSX values. Records per-state pass/fail in `docs/implementation-status.md` visual evidence log.

- [ ] **Step 7: Three-tier ui-diff loop with structural evidence** — host runs `tool/ui_capture/ui_diff_loop.ps1`. For each state:

  a. **Broad diff**: full-screen capture vs expected image — structural layout comparison using the ui-diff MCP pipeline's **structural analysis** (element presence, bounding-box hierarchy, parent/child relationships) and **geometry analysis** (position, size, alignment within tolerances). No arbitrary global pixel threshold. Record `broadStatus: pass|fail` with structural evidence.

  b. **Region diff**: crop capture to spec-defined anchor regions per screen (e.g., `today.macroRingHero`, `today.recentScansSection`, `scan.captureButton`, `food.sheetHeader`, `goals.sliderTrack`). Compare each region using **color/OKLab** analysis (perceptual color distance, not raw RGB), **text** analysis (OCR-based text presence and approximate position), and **shape** analysis (element contour matching). Record per-region `regionStatus` with evidence.

  c. **Target diff**: individual UI elements (buttons, badges, typography, icons) compared using **model-reviewed evidence** — the ui-diff MCP's vision model assesses whether the target element matches the expected design intent. Pixel masks are evidence inputs to the model, not a universal pass threshold. Record per-target `targetStatus` with model verdict and confidence.

  Loop continues until broad, region, and target all pass for the state. If any tier fails: (i) record the failing region/element with evidence; (ii) file the fix via WORKER-RUN; (iii) rebuild only if code changed (re-check build fingerprint); (iv) re-capture the affected state(s); (v) re-run the tier.

- [ ] **Step 8: Diff-group quality checks** — after the three-tier loop passes, host runs the diff-group analyzer and verifies:
  - **Parent/child root-cause hierarchy**: for each failing state, the broad diff identifies the parent region containing the root cause; region and target diffs within that parent are children. A child failure that is already explained by a parent failure is suppressed (not double-counted).
  - **Overlap/containment**: no region in the region diff overlaps another region's bounding box; containment relationships are explicit in the report.
  - **No disconnected union boxes**: every flagged region maps to a real UI element (verified by cross-referencing the widget tree); no phantom bounding boxes from stale references.
  - **Inspectable group overlay/report**: the diff-group report includes an overlay image per state showing all flagged regions with parent→child arrows, pass/fail colors, and evidence snippets. Host inspects each overlay and records the group verdict in `docs/implementation-status.md`.

- [ ] **Step 9: CHECKPOINT 2 — diff hierarchy verified** — Host updates `docs/implementation-status.md` with exact red/green evidence (per-state pass/fail counts, group verdicts) and the next step for strict release semantics. Host commits: `git add -A && git commit -m "Complete ui-diff structural hierarchy and diff-group quality checks for 38 states"`. Then host runs `git push` separately. **Push gate:** if `git push` fails, record the exact failure output in `docs/implementation-status.md` and stop — do not proceed to Step 10. The local commit remains intact; do not revert it.

- [ ] **Step 10: Strict release semantics** — after all 38 states pass all three tiers and diff-group quality, host records in `docs/implementation-status.md`:
  - `runId` per state (38 entries)
  - Artifact paths: `.ui-diff/captures/<date>/<id>--<theme>.png`
  - Expected image paths: `.ui-diff/expected/<id>--<theme>.png` with fingerprints
  - Report paths: `.ui-diff/runs/<run-id>/broad.json`, `regions.json`, `targets.json`
  - Diff-group overlay paths: `.ui-diff/runs/<run-id>/groups/`
  - `auditLimited: false` for every state
  - `unresolved: 0` across all groups
  - `verdict: pass` for every state (actual result, not predeclared)
  - Exact `buildHash`, `apkHash`, `fixtureProfile`, `fixtureHash`, `deviceModel`, `viewportWidth × viewportHeight`

- [ ] **Step 11: Known deviation documentation** — host records the two pre-approved deviations wherever they surface a diff: (a) flat five-tab navigation (no FAB Scan button) vs handoff JSX FAB shape; (b) still-photo-only capture (no video/stop square) vs any video-related handoff pixels. These are settled decisions, not bugs.

- [ ] **Step 12: Stage verification** — `fvm flutter analyze` → `No issues found!`; `fvm flutter test` → no regressions.

- [ ] **Step 13: REVIEW-GATE Task 17** (UI-parity-affecting — include the visual evidence summary and diff-group overlays) until green, then **HANDOFF Task 17**

```powershell
git add -A
git commit -m "Capture and gate all 38 visual states across both themes"
git push
```

---

### Task 18: Profile-Mode Performance Evidence, Animation/Jank Measurement, Accessibility, and Exploratory Device Testing

Owns spec §14.5 performance gates and exploratory weird-state coverage. Verifies animation durations via fast widget tests, measures real frame timing on a connected device in profile mode using `IntegrationTestWidgetsFlutterBinding` traceAction, verifies reduced-motion snaps, runs accessibility guideline checks on every screen, and exercises exploratory device-state edge cases that automated suites do not cover.

**Files:**
- Create: `test/performance/animation_duration_test.dart` (fast widget tests verifying duration/reduced-motion contracts against `MotionDurations` values)
- Create: `test/performance/reduced_motion_snap_test.dart` (reduced-motion verification across all animated widgets)
- Create: `integration_test/performance/frame_timing_test.dart` (real frame timing on device using `IntegrationTestWidgetsFlutterBinding` traceAction in profile mode)
- Modify: `test/a11y/accessibility_guidelines_test.dart` (extend to all 19 screen IDs)
- Create: `integration_test/exploratory/device_state_exploration.dart` (weird-state device testing)
- Create: `tool/performance/measure_frame_budget.ps1` (DevTools timeline parser)
- Modify: `docs/implementation-status.md` (performance and accessibility evidence rows)

**Interfaces:**
- Consumes: `AppMotion`/`MotionDurations` (Task 4), deep-link harness (Task 5), all screen implementations (Tasks 6–15)
- Produces: duration contract test results, real device frame-timing evidence (p50/p95/max build+raster, janky frame counts), reduced-motion snap verification, a11y guideline results for all screens, exploratory test pass/fail matrix — all recorded in `docs/implementation-status.md`

**Critical constraint**: Widget tests (`testWidgets`) cannot measure real frame budgets — they simulate time via `pump()` and do not exercise the raster thread. Real frame timing MUST run in `integration_test/` on a real device or emulator in profile mode. The 60Hz budget (16.67ms) applies everywhere; the 120Hz budget (8.33ms) applies only on devices verified to run at 120Hz — record whether 120Hz was actually active during the test. Do not promise impossible zero-over-budget guarantees; record observed p50/p95/max build+raster times and janky frame counts (frames exceeding the budget).

#### 18.1 Duration Contract Tests (Fast Widget Tests)

- [ ] **Step 1 (worker): Write duration contract tests**

```dart
// test/performance/animation_duration_test.dart
// Fast widget tests — verify that animations use the correct MotionDurations values.
// These do NOT measure real frame timing; they assert duration contracts.

testWidgets('Today ring count-up duration matches MotionDurations.countUp (1400ms)', (tester) async {
  await pumpApp(tester, initialLocation: '/today');
  final ring = tester.widget<MacroRing>(find.byType(MacroRing));
  expect(ring.animationDuration, equals(MotionDurations.countUp));
});

testWidgets('skeleton shimmer duration matches MotionDurations.skeletonShimmer (1400ms)', (tester) async {
  await pumpApp(tester, initialLocation: '/today');
  final shimmer = tester.widget<SkeletonShimmer>(find.byType(SkeletonShimmer));
  expect(shimmer.duration, equals(MotionDurations.skeletonShimmer));
});

testWidgets('card entrance duration matches MotionDurations.cardEntrance (240ms)', (tester) async {
  // Verify the animation controller is created with MotionDurations.cardEntrance
});

testWidgets('sheet slide-up duration matches MotionDurations.sheetSlideUp (320ms)', (tester) async {
  // Verify the animation controller is created with MotionDurations.sheetSlideUp
});

testWidgets('capture ring spin duration matches MotionDurations.captureRingSpin (1000ms)', (tester) async {
  // Verify the animation controller is created with MotionDurations.captureRingSpin
});

testWidgets('history view toggle duration matches MotionDurations.historyViewToggle (300ms)', (tester) async {
  // Verify the animation controller is created with MotionDurations.historyViewToggle
});

testWidgets('goals dropdown duration matches MotionDurations.goalsDropdown (200ms)', (tester) async {
  // Verify the animation controller is created with MotionDurations.goalsDropdown
});
```

- [ ] **Step 2: RED** — Run: `fvm flutter test test/performance/animation_duration_test.dart` → Expected: FAIL (duration fields not yet exposed on widgets).

- [ ] **Step 3 (worker): Implement** duration contract tests. If widgets do not yet expose their animation duration as a testable field, add a `duration` parameter or read it from the `AnimationController` via the widget's state. Do not change animation behavior.

- [ ] **Step 4: GREEN** — Run: `fvm flutter test test/performance/animation_duration_test.dart` → Expected: PASS.

- [ ] **Step 5: Device frame timing via integration test** — real frame timing MUST run on a real device or emulator in profile mode. Host launches emulator (`fvm flutter emulators --launch Api35_NoPlay`), runs `fvm flutter test integration_test/performance/frame_timing_test.dart -d emulator-5554 --profile`. The integration test uses `IntegrationTestWidgetsFlutterBinding` to exercise each animated widget (Today ring count-up, skeleton shimmer, capture ring spin, card entrance, sheet slide-up, history toggle, goals dropdown) and collects frame timings via the binding's `traceAction` with a unique `reportKey` per widget. An `integration_test` driver response callback writes each timeline trace to a file. To detect 120Hz support: use `View.of(context).display.refreshRate` where a BuildContext is available (widget test context), or `WidgetsBinding.instance.platformDispatcher.displays` with the matching `FlutterView.display` in the integration test. Do not use `MediaQuery` for refresh rate. For each widget, record: p50 frame duration, p95 frame duration, max frame duration, total janky frames (frames exceeding 16.67ms at 60Hz), total frames measured. If the device supports 120Hz (verified by `View.of(context).display.refreshRate >= 120` or device specs), also record p50/p95/max at 120Hz and janky frames exceeding 8.33ms. If 120Hz is not available on the test device, record "120Hz not applicable — device runs at 60Hz" and skip the 120Hz column. Do not promise zero-over-budget; record observed values. Runs `tool/performance/measure_frame_budget.ps1` which parses the timeline output and produces the frame budget table. `RepaintBoundary` placement is verified by grepping the widget tree for `RepaintBoundary` near the candidates (macro ring, sparkline, capture ring, shimmer) — confirmed only where timeline showed isolated repainting. Records evidence in `docs/implementation-status.md`. Telemetry (raw frame timings, janky frame counts) and acceptance rules (budget thresholds, pass/fail criteria) are recorded as separate tables in `docs/implementation-status.md`.

#### 18.2 Reduced-Motion Snap Verification

- [ ] **Step 6 (worker): Write failing reduced-motion tests**

```dart
// test/performance/reduced_motion_snap_test.dart
testWidgets('Today ring snaps to final value in 1 frame under reduced motion', (tester) async {
  await tester.pumpWidget(MediaQuery(
    data: const MediaQueryData(disableAnimations: true),
    child: const MyApp(),
  ));
  await tester.pumpApp(initialLocation: '/today');
  await tester.pump(); // one frame with duration zero
  final ring = tester.widget<MacroRing>(find.byType(MacroRing));
  // Under reduced motion, the sweep animation should be at its final value (1.0)
  // after a single pump — no intermediate frames.
  final state = tester.state<MacroRingState>(find.byType(MacroRing));
  expect(state.animationController.value, 1.0);
});

testWidgets('skeleton shimmer is static (two identical frames) under reduced motion', (tester) async {
  await tester.pumpWidget(MediaQuery(
    data: const MediaQueryData(disableAnimations: true),
    child: const MyApp(),
  ));
  await tester.pumpApp(initialLocation: '/today');
  await tester.pump();
  final frame1 = await tester.binding.defaultBinaryMessenger;
  await tester.pump(const Duration(milliseconds: 100));
  // Under reduced motion, Duration.zero is used — shimmer should not animate.
  // Two frames at t=0 and t=100ms should produce identical render objects.
  final shimmer1 = tester.renderObject<RenderBox>(find.byType(SkeletonShimmer));
  await tester.pump(const Duration(milliseconds: 100));
  final shimmer2 = tester.renderObject<RenderBox>(find.byType(SkeletonShimmer));
  expect(shimmer1.size, equals(shimmer2.size));
});

testWidgets('card entrance renders instantly under reduced motion', (tester) async {
  await tester.pumpWidget(MediaQuery(
    data: const MediaQueryData(disableAnimations: true),
    child: const MyApp(),
  ));
  await tester.pumpApp(initialLocation: '/today');
  await tester.pump(); // first frame
  // Card should be fully visible — opacity at 1.0, no transition
  final card = tester.widget<AnimatedOpacity>(find.byType(AnimatedOpacity).first);
  expect(card.opacity, 1.0);
});

testWidgets('sheet slide-up renders at final position on frame 1 under reduced motion', (tester) async {
  await tester.pumpWidget(MediaQuery(
    data: const MediaQueryData(disableAnimations: true),
    child: const MyApp(),
  ));
  await tester.pumpApp(initialLocation: '/food');
  await tester.pump();
  // Bottom sheet offset should be at its final target position
  final sheet = tester.widget<DraggableScrollableSheet>(find.byType(DraggableScrollableSheet));
  expect(sheet.initialChildSize, greaterThan(0));
  // After one pump, the sheet should be at its target size (no animation)
  final state = tester.state<DraggableScrollableSheetState>(find.byType(DraggableScrollableSheet));
  expect(state.pixels, equals(state.maxScrollExtent));
});

testWidgets('capture ring spin is static under reduced motion', (tester) async {
  await tester.pumpWidget(MediaQuery(
    data: const MediaQueryData(disableAnimations: true),
    child: const MyApp(),
  ));
  await tester.pumpApp(initialLocation: '/scan');
  await tester.pump();
  final angle1 = tester.widget<RotationTransition>(find.byType(RotationTransition)).turns.value;
  await tester.pump(const Duration(milliseconds: 200));
  final angle2 = tester.widget<RotationTransition>(find.byType(RotationTransition)).turns.value;
  expect(angle1, equals(angle2)); // no rotation under reduced motion
});

testWidgets('history view toggle is instant under reduced motion', (tester) async {
  await tester.pumpWidget(MediaQuery(
    data: const MediaQueryData(disableAnimations: true),
    child: const MyApp(),
  ));
  await tester.pumpApp(initialLocation: '/history');
  await tester.pump();
  // Week view should be visible on frame 1 — no AnimatedSize transition
  expect(find.byKey(const ValueKey('history-week-view')), findsOneWidget);
});

testWidgets('goals dropdown opens at final position under reduced motion', (tester) async {
  await tester.pumpWidget(MediaQuery(
    data: const MediaQueryData(disableAnimations: true),
    child: const MyApp(),
  ));
  await tester.pumpApp(initialLocation: '/goals');
  await tester.tap(find.byKey(const ValueKey('goals-period-pill')));
  await tester.pump();
  // Dropdown should be at full height on frame 1
  final dropdown = tester.widget<AnimatedSize>(find.byType(AnimatedSize).last);
  expect(dropdown.duration, Duration.zero);
});
```

- [ ] **Step 7: RED** — Run: `fvm flutter test test/performance/reduced_motion_snap_test.dart` → Expected: FAIL.

- [ ] **Step 8 (worker): Implement** reduced-motion tests; ensure `AppMotion.durationOf` returns `Duration.zero` under `disableAnimations` and all `AnimationController` instances use this.

- [ ] **Step 9: GREEN** — Run: `fvm flutter test test/performance/reduced_motion_snap_test.dart` → Expected: PASS.

#### 18.3 Accessibility Guideline Checks (All Screens)

- [ ] **Step 10: Extend a11y tests to all 19 screen IDs**

```dart
// test/a11y/accessibility_guidelines_test.dart — extend existing file
for (final screen in [
  ('/today', 'today'), ('/history', 'history'), ('/scan', 'scan'),
  ('/goals', 'goals'), ('/ai', 'ai'), ('/profile', 'profile'),
  ('/loading', 'loading'), ('/login', 'login'), ('/permission', 'permission'),
  ('/processing', 'processing'), ('/review', 'review'), ('/manual', 'manual'),
  ('/food', 'food'), ('/food_edit', 'food_edit'),
  ('/history_week', 'history_week'), ('/history_month', 'history_month'),
  ('/goals_select', 'goals_select'), ('/ai_history', 'ai_history'),
  ('/today_empty', 'today_empty'),
]) {
  testWidgets('${screen.$2} meets tap-target, label, and contrast guidelines', (tester) async {
    await pumpApp(tester, initialLocation: screen.$1);
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    await expectLater(tester, meetsGuideline(textContrastGuideline));
  });
}

testWidgets('confidence badges expose text via Semantics (never color-only)', (tester) async {
  // Scan review badge → Semantics contains "Review 65%" or similar
});

testWidgets('all interactive elements have minimum 44x44 logical px tap target', (tester) async {
  // Already covered by androidTapTargetGuideline, but explicit check on
  // capture button, macro value taps, nav items, chips, buttons
});
```

- [ ] **Step 11: RED** — Run: `fvm flutter test test/a11y/accessibility_guidelines_test.dart` → Expected: FAIL on new screen IDs.

- [ ] **Step 12: GREEN** — Run: `fvm flutter test test/a11y/accessibility_guidelines_test.dart` → Expected: PASS for all 19 screens.

#### 18.4 Exploratory Weird-State/Device Testing

- [ ] **Step 13 (worker): Write exploratory device-state tests**

```dart
// integration_test/exploratory/device_state_exploration.dart
// Run on connected emulator: fvm flutter test integration_test/exploratory -d emulator-5554

testWidgets('rapid triple-tap on capture button triggers exactly one processing navigation', (tester) async {
  await pumpAppE2E(tester, initialLocation: '/scan');
  final button = find.byKey(const ValueKey('capture-button'));
  await tester.tap(button);
  await tester.tap(button);
  await tester.tap(button);
  await tester.pumpAndSettle();
  // Should navigate to processing exactly once — not three times
  expect(find.byType(ProcessingScreen), findsOneWidget);
  expect(find.byType(ScanScreen), findsNothing);
});
testWidgets('keyboard open/close on search field does not overflow or crash', (tester) async {
  await pumpAppE2E(tester, initialLocation: '/manual');
  await tester.tap(find.byKey(const ValueKey('manual-search-field')));
  await tester.pump();
  // Keyboard should appear without RenderFlex overflow
  expect(tester.takeException(), isNull);
  await tester.testTextInput.receiveAction(TextInputAction.done);
  await tester.pump();
  expect(tester.takeException(), isNull);
});
testWidgets('keyboard open/close on AI chat composer does not overflow', (tester) async {
  await pumpAppE2E(tester, initialLocation: '/ai');
  await tester.tap(find.byKey(const ValueKey('ai-composer-field')));
  await tester.pump();
  expect(tester.takeException(), isNull);
  await tester.testTextInput.receiveAction(TextInputAction.done);
  await tester.pump();
  expect(tester.takeException(), isNull);
});
testWidgets('keyboard open/close on manual entry fields does not overflow', (tester) async {
  await pumpAppE2E(tester, initialLocation: '/manual');
  await tester.tap(find.byKey(const ValueKey('manual-name-field')));
  await tester.pump();
  expect(tester.takeException(), isNull);
  await tester.testTextInput.receiveAction(TextInputAction.done);
  await tester.pump();
  expect(tester.takeException(), isNull);
});
testWidgets('camera denial → manual fallback → regrant → back to scan idle renders correctly', (tester) async {
  await pumpAppE2E(tester, initialLocation: '/scan');
  // Simulate camera permission denial
  final fakeCamera = FakeCameraService(permissionsDenied: true);
  // deny -> permission screen -> manual -> regrant -> back to scan_idle
  expect(find.byType(PermissionScreen), findsOneWidget);
  // After regrant
  expect(find.byType(ScanScreen), findsOneWidget);
  expect(find.byKey(const ValueKey('scan-idle-preview')), findsOneWidget);
});
testWidgets('empty state renders on today_empty with no crash', (tester) async {
  await pumpAppE2E(tester, initialLocation: '/today_empty', seed: false);
  expect(find.byType(TodayScreen), findsOneWidget);
  expect(find.byKey(const ValueKey('today-empty-copy')), findsOneWidget);
  expect(tester.takeException(), isNull);
});
testWidgets('error state renders on processing with no crash', (tester) async {
  await pumpAppE2E(tester, initialLocation: '/processing');
  // Simulate processing error
  expect(find.byKey(const ValueKey('processing-error-icon')), findsOneWidget);
  expect(find.byKey(const ValueKey('processing-retry-button')), findsOneWidget);
  expect(tester.takeException(), isNull);
});
testWidgets('loading state renders on loading with no crash', (tester) async {
  await pumpAppE2E(tester, initialLocation: '/loading');
  expect(find.byType(LoadingScreen), findsOneWidget);
  expect(find.byKey(const ValueKey('loading-staged-label')), findsOneWidget);
  expect(tester.takeException(), isNull);
});
testWidgets('each main screen visited 10× in rapid succession does not corrupt state', (tester) async {
  await pumpAppE2E(tester, initialLocation: '/today');
  for (var i = 0; i < 10; i++) {
    await tester.tap(find.byKey(const ValueKey('nav-history')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('nav-scan')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('nav-goals')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('nav-ai')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('nav-today')));
    await tester.pumpAndSettle();
  }
  // No crash, no state leak — Today still shows correct data
  expect(find.byType(TodayScreen), findsOneWidget);
  expect(tester.takeException(), isNull);
});
testWidgets('cold restart with shifted FakeClock lands on Scan, theme persists, history advances', (tester) async {
  final fake = FakeClock(tz.TZDateTime(tz.local, 2026, 7, 17, 12, 0));
  await pumpAppE2E(tester, clock: fake);
  // Verify Scan is the initial screen
  expect(find.byType(ScanScreen), findsOneWidget);
  // Advance 3 days
  fake.advance(const Duration(days: 3));
  await tester.pumpAndSettle();
  // History should show 3 new day rows
  await tester.tap(find.byKey(const ValueKey('nav-history')));
  await tester.pumpAndSettle();
  expect(find.byType(HistoryScreen), findsOneWidget);
});
testWidgets('profile opened from Today, Scan, and AI; close returns to each origin respectively', (tester) async {
  await pumpAppE2E(tester, initialLocation: '/today');
  await tester.tap(find.byKey(const ValueKey('today-avatar')));
  await tester.pumpAndSettle();
  expect(find.byType(ProfileSheet), findsOneWidget);
  await tester.tap(find.byKey(const ValueKey('profile-close')));
  await tester.pumpAndSettle();
  expect(find.byType(TodayScreen), findsOneWidget); // returns to Today
});
testWidgets('notification tap with stale data does not crash; shows detail without error', (tester) async {
  await pumpAppE2E(tester);
  // Simulate stale notification tap (entry already viewed)
  final route = routeForNotification({'entryId': 'stale-1'}, alreadyViewed: true);
  expect(route, equals('/today/food/stale-1'));
  // Navigate to the route — should not crash even if entry is missing
  expect(tester.takeException(), isNull);
});
testWidgets('offline mode: capture queued, no crash, retry fires on connectivity resume', (tester) async {
  await pumpAppE2E(tester, initialLocation: '/scan');
  // Simulate offline capture
  final fakeCamera = FakeCameraService();
  await tester.tap(find.byKey(const ValueKey('capture-button')));
  await tester.pumpAndSettle();
  // Capture should be queued, not lost
  expect(fakeCamera.captureCount, 1);
  expect(tester.takeException(), isNull);
});
```

- [ ] **Step 14: RED** — Run: `fvm flutter test integration_test/exploratory -d emulator-5554` → Expected: FAIL (some flows loosely wired).

- [ ] **Step 15: GREEN** — Run: same → Expected: all exploratory scenarios PASS. Fix product code via WORKER-RUN until green; each fix recorded in `docs/implementation-status.md`.

#### 18.5 Evidence and Stage Verification

- [ ] **Step 16: Record all evidence** in `docs/implementation-status.md`:
  - Duration contract table: widget → expected duration → actual duration → match (yes/no)
  - Frame timing table (from integration_test on device): widget → p50 build (ms) → p95 build (ms) → max build (ms) → p50 raster (ms) → p95 raster (ms) → max raster (ms) → janky frames (60Hz) → total frames → 120Hz status (active/not-applicable) → janky frames (120Hz, if applicable)
  - Reduced-motion snap table: widget → snaps on frame 1 (yes/no)
  - Accessibility table: screen ID → androidTapTargetGuideline → labeledTapTargetGuideline → textContrastGuideline
  - Exploratory table: scenario → pass/fail → device → build hash

- [ ] **Step 17: Stage verification** — `fvm flutter analyze` → `No issues found!`; `fvm flutter test` → no regressions.

- [ ] **Step 18: REVIEW-GATE Task 18** (performance/a11y evidence) until green, then **HANDOFF Task 18**

```powershell
git add -A
git commit -m "Add performance measurement, accessibility gates, and exploratory device tests"
git push
```

---

### Task 19: Final Static/Unit/Widget/Emulator/Connected-Device/UI-Diff Gates, Evidence Manifest, and Release Decision

The terminal gate task. Runs every verification surface end-to-end, assembles the release evidence manifest, performs the final external no-mutation review, and records the release decision. Nothing ships or is pushed past this point without explicit user confirmation.

**Files:**
- Create: `docs/release-manifest-2026-07-17.md` (release evidence manifest)
- Modify: `docs/implementation-status.md` (final gate rows, release decision)
- Test: re-runs of all test suites (no new test files; this task orchestrates existing ones)

**Interfaces:**
- Consumes: all evidence from Tasks 0–18
- Produces: `docs/release-manifest-2026-07-17.md` containing the complete evidence bundle and release decision

#### 19.1 Static Analysis Gate

- [ ] **Step 1: Run** `fvm flutter analyze`
  Expected: `No issues found!`
  If failures: record each failure with file:line and specific reason in `docs/implementation-status.md`; remediate via WORKER-RUN; re-run until clean.

#### 19.2 Unit/Widget Test Gate

- [ ] **Step 2: Run** `fvm flutter test`
  Expected: all tests PASS; zero regressions vs Task 0 baseline counts.
  Record exact pass/fail counts in `docs/implementation-status.md`.

#### 19.3 Functions Gate

- [ ] **Step 3: Run** `npm --prefix functions run build` → compiles; `npm --prefix functions test` → all PASS.
  Record script names and pass counts in `docs/implementation-status.md`.

#### 19.4 Emulator Integration/E2E Gate

- [ ] **Step 4: Run** `fvm flutter test integration_test/e2e -d emulator-5554` (emulator launched via `fvm flutter emulators --launch Api35_NoPlay`; Firebase emulators running).
  Expected: all 13 E2E suites PASS (meal_flow, barcode_flow, label_flow, manual_flow, review_flow, crud, goals_flow, assistant_flow, notification_return, interrupted_upload, profile_return, swipe_nav, device_state).
  Record suite → pass/fail, device, build hash in `docs/implementation-status.md`.

#### 19.5 Read-Only Live Contract Gate (Environment B)

- [ ] **Step 5: Run** `fvm flutter test test/contracts --tags live`
  Expected: OFF live contract test PASS (read-only GET against Open Food Facts).
  Record response snapshot date in `docs/implementation-status.md`.

#### 19.6 Authorization-Blocked Cloud Gates (Environment C) — Recorded as BLOCKED

- [ ] **Step 6: Record** the following gates as **blocked** in `docs/implementation-status.md` with the exact reason: `"requires explicit user authorization and isolated test project"`:
  - Real cloud model processing (Cloud Functions invoking the vision model against a real image)
  - Real push notification delivery (Firebase Cloud Messaging to a real device)
  - Production Firestore write/read (any mutation of live user data)
  These gates are **never marked passed**. They remain blocked until the user explicitly authorizes an isolated test project.

#### 19.7 UI-Diff Final Gate (Re-verification)

- [ ] **Step 7: Re-run** the 38-state ui-diff loop from Task 17. For each state: verify the existing artifacts are still valid (build hash unchanged, no code delta since Task 17 capture). If any code changed since Task 17, re-capture the affected states and re-run broad→region→target.
  Expected: 38/38 states pass with `auditLimited: false`, `unresolved: 0`, `verdict: pass`.
  Record final run IDs in `docs/implementation-status.md`.

#### 19.8 Accessibility and Performance Final Gate

- [ ] **Step 8: Re-run** `fvm flutter test test/a11y/accessibility_guidelines_test.dart` → PASS for all 19 screens. Re-run `fvm flutter test test/performance/animation_duration_test.dart` → PASS. Re-run `fvm flutter test test/performance/reduced_motion_snap_test.dart` → PASS. Re-run `fvm flutter test integration_test/performance/frame_timing_test.dart -d emulator-5554 --profile` → PASS.
  Record final results in `docs/implementation-status.md`.

#### 19.9 External No-Mutation Review

- [ ] **Step 9: REVIEW-GATE Task 19** — host calls `mcp__antigravity-mcp__ask-ai` with `approvalMode: "yolo"`, `conversationId: "calorix-handoff-2026-07-17"`. Model routing order: (1) `"Gemini 3.6 Flash (High)"` primary, (2) `"Gemini 3.1 Pro (High)"` fallback, (3) `"Gemini 3.5 Flash (High)"` final fallback. The prompt includes:
  - Full diff summary of all changes since baseline
  - The complete evidence manifest (all test results, ui-diff run IDs, frame budget data, a11y results)
  - Verbatim: **"Do not edit files, do not run write commands, and do not mutate the repository; only inspect, reason, review, and propose changes for the main agent to apply. Reply with AGREEMENT_STATUS and MUST_FIX."**
  Green only when response explicitly reports `AGREEMENT_STATUS: agree` AND `MUST_FIX: none`. Apply must-fix feedback via WORKER-RUN and re-review until green.

#### 19.10 Evidence Manifest Assembly

- [ ] **Step 10: Create** `docs/release-manifest-2026-07-17.md` using a manifest generator that writes **only actual collected results**. The manifest is **not** a template with predeclared outcomes — it is a schema-driven document where every field is populated from real data. If a field cannot be populated (e.g., a test was not run, a gate was not checked), the manifest **blocks** and reports the missing field rather than inserting a placeholder.

**Manifest schema** (required fields — all must be present with actual values; the plan lists fields but never predeclares their outcomes):

The manifest is structured as a prose/field-schema table, not a YAML sample with synthetic value placeholders. Each section defines entity cardinality, required field names, allowed enums, the source artifact, and completeness validation. No example result values are shown; `generate_manifest.ps1` materializes every row from collected evidence and fails closed if any required field is missing.

| Section | Entity | Cardinality | Required fields | Allowed enums / types | Source artifact | Completeness rule |
|---|---|---|---|---|---|---|
| `build` | row | 1 | `commit`, `flutter`, `buildHash`, `apkHash` | string (hex SHA-256 for hashes) | `git rev-parse HEAD`, `fvm flutter --version`, `.ui-diff/captures/<date>/build-manifest.json` | All four fields non-empty |
| `gates.static_analysis` | row | 1 | `command`, `result`, `evidence` | `PASS` or `FAIL` | `fvm flutter analyze` output | `result` is `PASS` or `FAIL`; `evidence` is verbatim snippet |
| `gates.unit_widget_tests` | row | 1 | `command`, `passed`, `failed`, `total`, `evidence` | integer counts | `fvm flutter test` output | `passed + failed == total`; counts non-negative |
| `gates.functions_build` | row | 1 | `command`, `result`, `evidence` | `PASS` or `FAIL` | `npm --prefix functions run build` output | `result` is `PASS` or `FAIL` |
| `gates.functions_tests` | row | 1 | `command`, `passed`, `failed`, `evidence` | integer counts | `npm --prefix functions test` output | `passed + failed` consistent with test runner |
| `gates.e2e_emulator` | rows | 13 | `name`, `result`, `device`, `buildHash` per suite | `PASS` or `FAIL` | `fvm flutter test integration_test/e2e -d emulator-5554` output | All 13 suite rows present |
| `gates.live_contract` | row | 1 | `command`, `result`, `snapshotDate` | `PASS` or `FAIL`, ISO date | `fvm flutter test test/contracts --tags live` output | `result` non-empty; `snapshotDate` valid ISO date |
| `gates.cloud_writes` | row | 1 | `result`, `reason` | `BLOCKED` only | manual record | `result` is `BLOCKED`; `reason` is exact string |
| `visual_gates.states` | rows | 38 | `state`, `runId`, `fixtureProfile`, `broad`, `regions`, `targets`, `verdict` | `pass` or `fail` per tier | `.ui-diff/runs/<runId>/` reports | All 38 rows present; each field non-empty |
| `performance_gates.duration_contracts` | rows | per animated widget | `widget`, `expected`, `actual`, `match` | `yes` or `no` | `test/performance/animation_duration_test.dart` output | One row per widget; `match` computed from `expected == actual` |
| `performance_gates.frame_timing` | rows | per animated widget | `widget`, `p50Build`, `p95Build`, `maxBuild`, `p50Raster`, `p95Raster`, `maxRaster`, `jankyFrames60Hz`, `totalFrames`, `hz120Status`, `jankyFrames120Hz` | numeric ms; `active` or `not-applicable` | `integration_test/performance/frame_timing_test.dart` output | One row per widget; all ms fields non-negative |
| `performance_gates.reduced_motion` | rows | per animated widget | `widget`, `snapsOnFrame1` | `yes` or `no` | `test/performance/reduced_motion_snap_test.dart` output | One row per widget |
| `accessibility_gates` | rows | 19 | `screen`, `androidTapTarget`, `labeledTapTarget`, `textContrast` | `PASS` or `FAIL` per guideline | `test/a11y/accessibility_guidelines_test.dart` output | 19 rows; each guideline field present |
| `exploratory_testing` | rows | per scenario | `scenario`, `result`, `device` | `PASS` or `FAIL` | `integration_test/exploratory/device_state_exploration.dart` output | One row per scenario |
| `known_deviations` | rows | 2 | `description` | free text | plan spec §3.1, §4 | Exactly 2 rows |
| `external_review` | row | 1 | `reviewer`, `conversationId`, `agreementStatus`, `mustFix`, `gitStatusAfterReview` | `agree`/`disagree`; `none`/comma-separated list; `clean`/`dirty` | Antigravity MCP response + `git status` | `agreementStatus` is `agree` only if reviewer explicitly said so |
| `release_decision` | row | 1 | `all_gates_pass_or_blocked`, `evidence_manifest_complete`, `external_review_green`, `ready_for_user_confirmation` | boolean | computed from above rows | All four booleans present; `ready_for_user_confirmation` is conjunction |

The manifest generator (`tool/manifest/generate_manifest.ps1`) reads actual results from `docs/implementation-status.md` and the `.ui-diff/` artifacts, populates every schema field, and **blocks** if any required field is missing or empty. The plan lists required fields but must never predeclare their outcomes. No PASS, green, clean, or placeholder values may appear in the manifest — every cell contains an actual observed value.

#### 19.11 Status Updates and Commit/Push Checkpoint

- [ ] **Step 11: Update** `docs/implementation-status.md` — all task rows → done; all evidence links populated; blocked gates listed in `## Blocked gates` section; release decision recorded.

- [ ] **Step 12: Stage verification** — `fvm flutter analyze` → `No issues found!`; `fvm flutter test` → no regressions; `git status` shows only intended files.

- [ ] **Step 13: HANDOFF Task 19**

```powershell
git add -A
git commit -m "Assemble release evidence manifest and final verification gates"
git push
```

---

## Traceability Matrix

Maps every user requirement, all 19 canonical screen IDs, and both themes/38 states to owning tasks, concrete tests, and evidence artifacts.

### User Requirements → Tasks → Tests → Evidence

| Req ID | Requirement | Tasks | Concrete Tests | Evidence Artifact |
|---|---|---|---|---|
| R-NAV | Flat five-tab nav with horizontal swipes, no FAB | 1, 2 | `spike_conflict_test.dart`, `tab_swipe_shell_test.dart`, `origin_return_test.dart`, `app_shell_test.dart` | Task 17 states `scan_idle--dark/light`, `today--dark/light`; `swipe_nav_test.dart` |
| R-CAM | Camera-first still-photo capture, no video | 6 | `capture_guard_test.dart`, `scan_screen_test.dart`, `scan_mode_selector_test.dart` | Task 17 states `scan_idle`, `scan_capturing` |
| R-PERM | Permission screen with platform UX, add-manually fallback | 6 | `permission_screen_test.dart` | Task 17 states `permission--dark/light` |
| R-PROC | Processing screen with close-app banner, skeleton shimmer | 7 | `processing_lifecycle_test.dart`, `upload_queue_test.dart` | Task 17 states `processing--dark/light` |
| R-NOTIF | Push notification returns user to results | 7, 16 | `notification_routing_test.dart`, `notification_return_test.dart` | `notification_return_test.dart` pass |
| R-REVIEW | Low-confidence review branch (<80%), candidate selection | 8 | `review_screen_test.dart` | Task 17 states `review--dark/light` |
| R-MANUAL | Manual entry reachable from permission/review/manual action | 8 | `manual_entry_screen_test.dart` | Task 17 states `manual--dark/light` |
| R-TODAY | Today dashboard with macro ring, count-up, aggregation | 11 | `aggregation_truth_test.dart`, `today_screen_test.dart` | Task 17 states `today`, `today_empty` (dark/light) |
| R-FOOD | Food detail with serving multiplier, CRUD, corrections | 10 | `serving_multiplier_test.dart`, `food_crud_test.dart`, `food_detail_sheet_test.dart` | Task 17 states `food`, `food_edit` (dark/light) |
| R-HIST | History week/month with time travel, sparkline, drilldown | 12 | `history_time_travel_test.dart`, `history_screen_test.dart` | Task 17 states `history_week`, `history_month` (dark/light) |
| R-GOALS | Goals with body-goal, slider, macro split, weight log | 13 | `goals_persistence_test.dart`, `goals_screen_test.dart` | Task 17 states `goals`, `goals_select` (dark/light) |
| R-AI | Assistant chat with confirmation, history, server context | 14 | `thread_repository_test.dart`, `ai_chat_screen_test.dart`, `ai_history_screen_test.dart`, `ai-chat.test.ts`, `ai-threads-rules.test.ts` | Task 17 states `ai`, `ai_history` (dark/light) |
| R-PROFILE | Profile with theme/units/notifications, origin return | 15 | `profile_sheet_test.dart`, `onboarding_test.dart` | Task 17 states `profile--dark/light` |
| R-LOADING | Loading screen with staged labels, splash beat | 15 | `onboarding_test.dart` | Task 17 states `loading--dark/light` |
| R-LOGIN | Login with email/password, guest, keyboard avoidance | 15 | `onboarding_test.dart` | Task 17 states `login--dark/light` |
| R-CLK | Injectable product clock with IANA tz database, time-shift + DST boundary tests | 3 | `clock_test.dart`, `time_shift_test.dart`, `timezone_boundary_test.dart` | `time_shift_test.dart` pass (10 scenarios), `timezone_boundary_test.dart` pass |
| R-MOTION | Motion policy, reduced-motion snap, RepaintBoundary | 4, 18 | `app_motion_test.dart`, `reduced_motion_snap_test.dart`, `animation_duration_test.dart`, `frame_timing_test.dart` | Task 18 duration contract table, frame timing table, reduced-motion table |
| R-A11Y | Accessibility: 44px targets, labels, contrast, no color-only | 4, 18 | `accessibility_guidelines_test.dart` (19 screens) | Task 18 a11y table |
| R-FIX | Deterministic fixture, deep-link harness, stale-build capture | 5 | `deep_link_matrix_test.dart`, `fixture_isolation_test.dart`, `debug_reseed_test.dart` | Task 17 build manifest, 38 meta JSONs |
| R-CRUD | Full CRUD for entries, goals, weight, chat | 10, 13, 14 | `food_crud_test.dart`, `goals_persistence_test.dart`, `thread_repository_test.dart` | `crud_test.dart` E2E pass |
| R-DRAFT | Draft policies: confirm destructive exit, discard notice | 3 | `draft_policy_test.dart` | Draft policy tests pass |
| R-THEME | Dark and light theme support across all screens | 6–15 | All screen tests run with both themes; Task 17 captures 38 states | 38 ui-diff artifacts (19 IDs × 2 themes) |
| R-OFFLINE | Offline/retry for upload queue | 7, 16 | `upload_queue_test.dart`, `interrupted_upload_test.dart` | `interrupted_upload_test.dart` E2E pass |
| R-SECURITY | Firebase auth-only, Firestore owner-only rules | 14 | `ai-threads-rules.test.ts`, `ai-chat.test.ts` | Functions emulator rules tests pass |

### Canonical Screen IDs × Themes → Tasks → Tests → Evidence

| # | ID | Owning Task(s) | Theme | ui-diff State | Test Files | Evidence Artifact |
|---|---|---|---|---|---|---|
| 1 | loading | 15 | dark | `loading--dark` | `onboarding_test.dart` | `.ui-diff/captures/<date>/loading--dark.png` + `.meta.json` |
| 1 | loading | 15 | light | `loading--light` | `onboarding_test.dart` | `.ui-diff/captures/<date>/loading--light.png` + `.meta.json` |
| 2 | login | 15 | dark | `login--dark` | `onboarding_test.dart` | `.ui-diff/captures/<date>/login--dark.png` + `.meta.json` |
| 2 | login | 15 | light | `login--light` | `onboarding_test.dart` | `.ui-diff/captures/<date>/login--light.png` + `.meta.json` |
| 3 | permission | 6, 15 | dark | `permission--dark` | `permission_screen_test.dart` | `.ui-diff/captures/<date>/permission--dark.png` + `.meta.json` |
| 3 | permission | 6, 15 | light | `permission--light` | `permission_screen_test.dart` | `.ui-diff/captures/<date>/permission--light.png` + `.meta.json` |
| 4 | scan_idle | 2, 6 | dark | `scan_idle--dark` | `capture_guard_test.dart`, `scan_screen_test.dart` | `.ui-diff/captures/<date>/scan_idle--dark.png` + `.meta.json` |
| 4 | scan_idle | 2, 6 | light | `scan_idle--light` | `capture_guard_test.dart`, `scan_screen_test.dart` | `.ui-diff/captures/<date>/scan_idle--light.png` + `.meta.json` |
| 5 | scan_capturing | 6 | dark | `scan_capturing--dark` | `capture_guard_test.dart` | `.ui-diff/captures/<date>/scan_capturing--dark.png` + `.meta.json` |
| 5 | scan_capturing | 6 | light | `scan_capturing--light` | `capture_guard_test.dart` | `.ui-diff/captures/<date>/scan_capturing--light.png` + `.meta.json` |
| 6 | processing | 7 | dark | `processing--dark` | `processing_lifecycle_test.dart` | `.ui-diff/captures/<date>/processing--dark.png` + `.meta.json` |
| 6 | processing | 7 | light | `processing--light` | `processing_lifecycle_test.dart` | `.ui-diff/captures/<date>/processing--light.png` + `.meta.json` |
| 7 | review | 8 | dark | `review--dark` | `review_screen_test.dart` | `.ui-diff/captures/<date>/review--dark.png` + `.meta.json` |
| 7 | review | 8 | light | `review--light` | `review_screen_test.dart` | `.ui-diff/captures/<date>/review--light.png` + `.meta.json` |
| 8 | manual | 8 | dark | `manual--dark` | `manual_entry_screen_test.dart` | `.ui-diff/captures/<date>/manual--dark.png` + `.meta.json` |
| 8 | manual | 8 | light | `manual--light` | `manual_entry_screen_test.dart` | `.ui-diff/captures/<date>/manual--light.png` + `.meta.json` |
| 9 | today | 11 | dark | `today--dark` | `aggregation_truth_test.dart`, `today_screen_test.dart` | `.ui-diff/captures/<date>/today--dark.png` + `.meta.json` |
| 9 | today | 11 | light | `today--light` | `aggregation_truth_test.dart`, `today_screen_test.dart` | `.ui-diff/captures/<date>/today--light.png` + `.meta.json` |
| 10 | today_empty | 11 | dark | `today_empty--dark` | `today_screen_test.dart` | `.ui-diff/captures/<date>/today_empty--dark.png` + `.meta.json` |
| 10 | today_empty | 11 | light | `today_empty--light` | `today_screen_test.dart` | `.ui-diff/captures/<date>/today_empty--light.png` + `.meta.json` |
| 11 | food | 10 | dark | `food--dark` | `food_detail_sheet_test.dart` | `.ui-diff/captures/<date>/food--dark.png` + `.meta.json` |
| 11 | food | 10 | light | `food--light` | `food_detail_sheet_test.dart` | `.ui-diff/captures/<date>/food--light.png` + `.meta.json` |
| 12 | food_edit | 10 | dark | `food_edit--dark` | `food_detail_sheet_test.dart` | `.ui-diff/captures/<date>/food_edit--dark.png` + `.meta.json` |
| 12 | food_edit | 10 | light | `food_edit--light` | `food_detail_sheet_test.dart` | `.ui-diff/captures/<date>/food_edit--light.png` + `.meta.json` |
| 13 | history_week | 12 | dark | `history_week--dark` | `history_time_travel_test.dart`, `history_screen_test.dart` | `.ui-diff/captures/<date>/history_week--dark.png` + `.meta.json` |
| 13 | history_week | 12 | light | `history_week--light` | `history_time_travel_test.dart`, `history_screen_test.dart` | `.ui-diff/captures/<date>/history_week--light.png` + `.meta.json` |
| 14 | history_month | 12 | dark | `history_month--dark` | `history_time_travel_test.dart`, `history_screen_test.dart` | `.ui-diff/captures/<date>/history_month--dark.png` + `.meta.json` |
| 14 | history_month | 12 | light | `history_month--light` | `history_time_travel_test.dart`, `history_screen_test.dart` | `.ui-diff/captures/<date>/history_month--light.png` + `.meta.json` |
| 15 | goals | 13 | dark | `goals--dark` | `goals_persistence_test.dart`, `goals_screen_test.dart` | `.ui-diff/captures/<date>/goals--dark.png` + `.meta.json` |
| 15 | goals | 13 | light | `goals--light` | `goals_persistence_test.dart`, `goals_screen_test.dart` | `.ui-diff/captures/<date>/goals--light.png` + `.meta.json` |
| 16 | goals_select | 13 | dark | `goals_select--dark` | `goals_screen_test.dart` | `.ui-diff/captures/<date>/goals_select--dark.png` + `.meta.json` |
| 16 | goals_select | 13 | light | `goals_select--light` | `goals_screen_test.dart` | `.ui-diff/captures/<date>/goals_select--light.png` + `.meta.json` |
| 17 | ai | 14 | dark | `ai--dark` | `ai_chat_screen_test.dart` | `.ui-diff/captures/<date>/ai--dark.png` + `.meta.json` |
| 17 | ai | 14 | light | `ai--light` | `ai_chat_screen_test.dart` | `.ui-diff/captures/<date>/ai--light.png` + `.meta.json` |
| 18 | ai_history | 14 | dark | `ai_history--dark` | `ai_history_screen_test.dart` | `.ui-diff/captures/<date>/ai_history--dark.png` + `.meta.json` |
| 18 | ai_history | 14 | light | `ai_history--light` | `ai_history_screen_test.dart` | `.ui-diff/captures/<date>/ai_history--light.png` + `.meta.json` |
| 19 | profile | 15 | dark | `profile--dark` | `profile_sheet_test.dart` | `.ui-diff/captures/<date>/profile--dark.png` + `.meta.json` |
| 19 | profile | 15 | light | `profile--light` | `profile_sheet_test.dart` | `.ui-diff/captures/<date>/profile--light.png` + `.meta.json` |

### Evidence Artifact Inventory

| Artifact | Location | Producing Task | Consuming Gate |
|---|---|---|---|
| Build manifest | `.ui-diff/captures/<date>/build-manifest.json` | 17 | 17, 19 |
| 38 PNG captures | `.ui-diff/captures/<date>/<id>--<theme>.png` | 17 | 17, 19 |
| 38 meta JSONs | `.ui-diff/captures/<date>/<id>--<theme>.meta.json` | 17 | 17, 19 |
| Broad reports | `.ui-diff/runs/<runId>/broad.json` | 17 | 17, 19 |
| Region reports | `.ui-diff/runs/<runId>/regions.json` | 17 | 17, 19 |
| Target reports | `.ui-diff/runs/<runId>/targets.json` | 17 | 17, 19 |
| Frame budget table | `docs/implementation-status.md` §Performance | 18 | 19 |
| Reduced-motion table | `docs/implementation-status.md` §Performance | 18 | 19 |
| Accessibility table | `docs/implementation-status.md` §A11y | 18 | 19 |
| Exploratory table | `docs/implementation-status.md` §Exploratory | 18 | 19 |
| E2E results | `docs/implementation-status.md` §E2E | 16 | 19 |
| Functions test results | `docs/implementation-status.md` §Functions | 9, 14 | 19 |
| Release manifest | `docs/release-manifest-2026-07-17.md` | 19 | User review |
| External review gate | `docs/implementation-status.md` §Review log | 19 | 19 |
| Blocked gates | `docs/implementation-status.md` §Blocked gates | 19 | 19 |
