# Runtime Reliability And Virtual Android — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish Cuttlefish Android 17 (SDK 37) ARM64 as the primary local evidence gate, independent GitHub x86_64 CI, fail-closed production builds, and fix all five confirmed runtime/UI issues with immutable evidence metadata on every run.

**Architecture:** TDD-first implementation against `docs/superpowers/specs/2026-08-12-runtime-reliability-and-virtual-android.md`. Evidence is compared to independent facts (actual APK hash, checked-out source SHA); declared metadata that does not match observed state is a hard failure. Hermetic workflow tests: each test case is self-contained with no shared mutable state.

**Tech Stack:** Flutter/Dart, Firebase (Auth, Functions, Firestore), Android Cuttlefish (SDK 37, arm64-v8a), GitHub Actions, reactivecircus/android-emulator-runner@v2, integration_test, ui-diff MCP pipeline.

---

## Global Constraints

- Use FVM for all Flutter/Dart commands (`fvm flutter …`). Plain `flutter`/`dart` only to diagnose global SDK setup.
- Commit messages: plain imperative English. No AI/Bot/Claude/Gemini tokens. Never bypass pre-commit hook with `--no-verify`.
- Workers never commit or push; the main host reviews, verifies, commits, and pushes.
- No cloud deploy. No production data mutation. No signup wall for anonymous chat.
- Production inputs are materialized only from `FIREBASE_OPTIONS_DART_BASE64`, `GOOGLE_SERVICES_JSON_BASE64`, `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`, and `RELEASE_CERT_SHA256`. Never placeholder/debug sign.
- Explicit bash staged paths must never include `.mcp.json`.

## Verification Contract

- `fvm flutter analyze` must return `No issues found!` before any commit.
- `fvm flutter test --reporter compact` must pass with no unexpected failures.
- Local Cuttlefish: `android-vm start`, `android-vm wait`, run tests, `android-vm adb exec-out screencap -p > <path>.png`, capture logcat, emit metadata sidecar JSON, `android-vm stop`.
- GitHub CI: push to branch, workflow runs `reactivecircus/android-emulator-runner@v2` targeting API 34, uploads artifacts with source SHA naming.
- Metadata sidecar JSON: `sourceCommitSha`, `apkSha256`, `sdkVersion`, `deviceModel`, `viewportDimensions`, `timestamp`, `staleBuildFingerprint:false`. Mismatches fail.

## File Map

| File | Action | Purpose |
|---|---|---|
| `tool/runtime_evidence/run_cuttlefish_gate.sh` | Create | Cuttlefish build/install/test/evidence orchestrator |
| `tool/runtime_evidence/write_metadata.py` | Create | Canonical sidecar generation and independent validation |
| `test/tool/runtime_evidence_scripts_test.dart` | Create | Hermetic script/metadata contract tests |
| `.github/workflows/android-emulator.yml` | Create | Independent x86_64 emulator CI |
| `.github/workflows/android-build.yml` | Modify | Fail-closed Firebase + release keystore |
| `android/app/build.gradle.kts` | Modify | signingConfigs.release via key.properties |
| `lib/shared/services/ai_chat_service.dart` | Modify | Structured error diagnostics enum |
| `lib/features/ai_chat/ai_chat_screen.dart` | Modify | Preserve Retry, add anonymous contract |
| `test/ai_chat/anonymous_chat_retry_test.dart` | Create | RED/GREEN tests for chat retry |
| `lib/features/scan/scan_screen.dart` | Modify | Durable enqueue then navigate |
| `lib/features/scan/providers/scan_providers.dart` | Modify | Split ScanUploadGateway |
| `test/scan/durable_enqueue_test.dart` | Create | RED/GREEN tests for enqueue |
| `lib/features/food_detail/food_detail_sheet.dart` | Modify | Full-screen Scaffold, preserve PopScope |
| `test/food_detail/full_screen_detail_test.dart` | Create | RED/GREEN tests for detail |
| `lib/features/onboarding/login_screen.dart` | Modify | Fix _Field centering |
| `test/onboarding/login_centering_test.dart` | Create | RED/GREEN tests for centering |

---

## Stage 0: Evidence Tooling Contract

**Files:** Create `tool/runtime_evidence/write_metadata.py`, `test/tool/runtime_evidence_scripts_test.dart`

- [x] **Step 1: Write failing tests** — invoke the Python tool in temporary directories and assert the exact sidecar keys, SHA-256 calculation, `staleBuildFingerprint:false`, malformed input rejection, and source/APK mismatch exit failures. The expected source SHA and APK path are supplied independently by the test.
- [x] **Step 2: RED** — pinned FVM Flutter 3.41.9 runs first failed on unawaited async helpers, then exposed independent fixture-state leakage, then exposed the Pi-only 30-second subprocess-matrix timeout. Each failure was reproduced and corrected without weakening production assertions.
- [x] **Step 3: Implement** — a stdlib-only Python CLI with explicit `write` and `validate` commands. `validate` recomputes the APK SHA-256, reads the current checked-out SHA supplied by the caller, validates device facts, and rejects stale/missing/extra contract fields. Keep this tooling outside `lib/`; it is release evidence infrastructure, not app runtime code.
- [x] **Step 4: GREEN** — pinned FVM Flutter 3.41.9 `fvm flutter test test/tool/runtime_evidence_scripts_test.dart --reporter compact --no-pub` passed 29/29 with exit 0; the tests invoke the real Python CLI.
- [x] **Step 5: Verify** — focused pinned analysis of `test/tool/runtime_evidence_scripts_test.dart` is clean. Full `fvm flutter analyze` is blocked by the pre-existing absent ignored/generated `lib/core/firebase/firebase_options.dart`; no placeholder was substituted. Antigravity conversation `calorix-runtime-evidence-stage0-20260814` returned `AGREEMENT_STATUS: agree`, `MUST_FIX: none`, and ruled the bounded Stage 0 commit acceptable because the missing generated input is not a Stage 0 regression and Stage 3 owns fail-closed materialization.
- [x] **Step 6: HANDOFF**
  ```bash
  git add tool/runtime_evidence/write_metadata.py test/tool/runtime_evidence_scripts_test.dart
  git commit -m "Add immutable runtime evidence contract"
  git push
  ```

---

## Stage 1: Local Cuttlefish Source-Build / E2e / Screenshot / Metadata Gate

**Files:** Create `tool/runtime_evidence/run_cuttlefish_gate.sh`; extend `test/tool/runtime_evidence_scripts_test.dart`

- [x] **Step 1: Write failing tests** — inject fake `android-vm`, `fvm`, and `git` executables through `PATH`; assert command order, guaranteed stop via `trap`, independent metadata validation, and failure propagation. Include source/HEAD changes after build, custom installed APK path, stale/no-output build, Git enumeration/hash failures, hostile tracked filenames, and malformed screenshot cases.
- [x] **Step 2: RED** — real pinned runs exposed three harness defects before final green: nonexistent Dart `File.setExecutableSync`, invalid PATH construction with `Platform.pathSeparator`, and a false NUL oracle caused by Dart `\0`; each failed with a concrete compile/test error and was corrected without weakening assertions.
- [x] **Step 3: Implement** — capture the full source SHA and build-relevant source fingerprint before build, remove stale outputs and require a fresh canonical APK, build the exact integration target, recompute source facts before drive, hash the exact APK, start/wait Cuttlefish, and run `fvm flutter drive` with the standard integration-test driver, `--use-application-binary=<the hashed APK>`, and `--no-build`. Query SDK/model/`wm size`, capture and structurally validate PNG plus logcat, re-hash the APK after drive, write the sidecar, then validate its declarations against independently observed values. Always stop through `trap`. A changing source fingerprint, different APK hash, drive failure, invalid screenshot, or metadata mismatch fails. No separate manual `adb install` remains.
- [x] **Step 4: GREEN** — focused gate group **14/14**, complete runtime-evidence suite **44/44**, focused Dart analysis clean, formatter `0 changed`, and gate `bash -n` clean under pinned Flutter 3.41.9. Full app analysis/real Cuttlefish execution remain fail-closed on the absent ignored Firebase configuration and are explicitly owned by Stage 3; no placeholder or runtime success claim is made. Final Antigravity review conversation `calorix-runtime-evidence-stage1-20260814` returned `AGREEMENT_STATUS: agree`, `MUST_FIX: none`, `SHOULD_FIX: none`, `QUESTIONS: none`.
- [x] **Step 5: HANDOFF** — commit `2b680f0` pushed to `origin/main`; the user-owned `.mcp.json` was excluded.
  ```bash
  git add tool/runtime_evidence/run_cuttlefish_gate.sh tool/runtime_evidence/write_metadata.py test/tool/runtime_evidence_scripts_test.dart
  git commit -m "Add local Cuttlefish runtime evidence gate"
  git push
  ```
- [x] **Step 6: Exact tested-APK identity correction** — RED tests rejected the old `flutter test`/manual-install sequence. The committed standard driver, target-specific build, and `flutter drive --use-application-binary=<the hashed APK> --no-build` path now preserve exact tested-artifact identity without redundant manual installation. Fresh final evidence: **14/14** gate cases, **44/44** full runtime-evidence tests, focused analyzer clean, formatter `0 changed`, `bash -n` and `git diff --check` clean, and final Antigravity review green with `MUST_FIX: none`.

---

## Stage 2: Independent GitHub x86_64 Emulator Workflow

**Files:** Create `.github/workflows/android-emulator.yml`; extend `test/tool/runtime_evidence_scripts_test.dart`

- [x] **Step 1: RED workflow contract** — the direct `yaml` dev dependency and one parsed-workflow test compile cleanly; with no workflow present, the test failed solely at the first existence assertion. The remaining assertions require `workflow_dispatch + pull_request[main]`, `contents: read`, concurrency/cancellation, exact action tags, API 34/google_apis/x86_64/Nexus 6/port 5554, exact target-build/drive commands, diagnostic exit-code preservation, source-SHA artifact naming, 30-day retention, and no release/publish/deploy, Firebase-options synthesis, `ci-placeholder`, or manual `adb install`.
- [x] **Step 2: Create workflow** — checkout, Java 17, Flutter 3.41.9, and FVM precede the exact e2e target build; `reactivecircus/android-emulator-runner@v2` drives that prebuilt APK on API 34/x86_64/Nexus 6/`emulator-5554`. The runner preserves the drive exit code while attempting screenshot, logcat, SDK/model/viewport, APK hash, and source-SHA diagnostics, then re-exits with the original code. Upload uses `if: ${{ !cancelled() }}`, `emulator-run-${{ github.sha }}`, a bounded evidence path, and 30-day retention. No Firebase placeholder is generated.
- [x] **Step 3: GREEN and review** — targeted contract **1/1** and complete runtime-evidence suite **45/45** passed; `pub get` left the lockfile byte-identical; focused analysis and format were clean. Antigravity conversation `calorix-runtime-evidence-stage2-20260814` returned `AGREEMENT_STATUS: agree`, `MUST_FIX: none`, `SHOULD_FIX: none`, `QUESTIONS: none`. Remote GitHub execution remains a separately recorded gate and is not claimed from local YAML tests.
- [x] **Step 4: HANDOFF** — local implementation commit `b297dd4` contains only the workflow, direct dependency/lock classification, parsed contract test, plan, and status; the user-owned `.mcp.json` is excluded. After the HTTPS credential gained `workflow` scope, commits through `1055e98` pushed successfully to `origin/main` on 2026-08-15. Hosted workflow execution remains a separate unclaimed gate.
  ```bash
  git add .github/workflows/android-emulator.yml
  git commit -m "Add independent GitHub x86_64 emulator CI workflow"
  git push
  ```

---

## Stage 3: Fail-Closed Firebase + Gradle Signing + apksigner Cert Fingerprint

**Files:** Modify `.github/workflows/android-build.yml`, `android/app/build.gradle.kts`; create `tool/ci/prepare_android_release.sh`, `test/tool/android_release_contract_test.dart`

- [x] **Step 1: RED hermetic tests** — `test/tool/android_release_contract_test.dart` defines 26 hermetic contract tests for all eight required inputs, atomic preparation, explicit cleanup, normalized fingerprint verification, workflow ordering/cleanup/signing, and release-only Gradle signing. The pinned Pi container run compiled and executed the suite, then failed **0 passed / 26 failed** solely on the absent preparation script and current placeholder/debug-signed production files; no syntax, dependency, or harness failure occurred.
- [x] **Step 2: Gradle signingConfigs** — `signingConfigs.release` reads the app-relative `android/key.properties`, remains inert for debug/local tasks, and explicitly fails requested release tasks when the file, any of `storeFile`/`storePassword`/`keyAlias`/`keyPassword`, or the referenced app-relative keystore is missing. `buildTypes.release` uses only `signingConfigs.getByName("release")`.
- [x] **Step 3: Workflow fail-closed** — the tested stdlib-only preparation script requires all eight named inputs, strictly validates the generated Dart/JSON/plist structures before any write, writes ignored Firebase/signing files, and owns only five exact cleanup paths. The workflow prepares before dependency resolution/build, builds release, verifies the exact normalized signer SHA-256 with `apksigner`, and always cleans exact paths without keystore wildcards.
- [x] **Step 4: GREEN** — the original implementation contract plus hardening regressions now pass **33/33** in the pinned Flutter 3.41.9 amd64 container on the Pi. Focused RED was **27 passed / 6 failed** for the six intended gaps; final post-format GREEN was **33/33** in 6m08s. `bash -n`, executable-bit check, workflow YAML parse, `git diff --check`, and the tracked-secret-path check passed. Antigravity conversation `calorix-runtime-evidence-stage3-20260815` returned `AGREEMENT_STATUS: agree`, `MUST_FIX: none`, `SHOULD_FIX: none`, `QUESTIONS: none`. The real secret-backed GitHub release build/signature remains an external gate because production inputs are intentionally unavailable locally.
- [x] **Step 5: HANDOFF** — implementation commit `1fc4d11` (`Secure Android release inputs`) was pushed to `origin/main`; the user-owned `.mcp.json` remained unstaged and untouched.
  ```bash
  git add .github/workflows/android-build.yml android/app/build.gradle.kts tool/ci/prepare_android_release.sh test/tool/android_release_contract_test.dart
  git commit -m "Make production build fail-closed with Gradle signingConfigs and apksigner cert fingerprint"
  git push
  ```

---

## Stage 4: Anonymous Guest Chat — Structured Diagnostics, Preserved Retry, Anonymous Contract

**Files:** Modify `lib/shared/services/ai_chat_service.dart`, `lib/features/ai_chat/ai_chat_screen.dart`, Create `test/ai_chat/anonymous_chat_retry_test.dart`

**Current state:** the screen already renders an inline Retry action for failed messages. The callable accepts any authenticated Firebase principal, including anonymous users, and backend context loading has defaults. The missing piece is actionable classification/correlation and a runtime contract proving this path; no second retry surface or permanent guest label is needed.

- [ ] **Step 1: Write failing tests** — map `FirebaseFunctionsException` codes into stable retryable/nonretryable categories with a sanitized user message and diagnostic correlation ID; preserve the original message/client ID on Retry; show no raw backend text and no signup wall. Add Functions tests proving an anonymous-auth-shaped request reaches the handler and missing profile data receives documented defaults.
- [ ] **Step 2: RED** — `fvm flutter test test/ai_chat/anonymous_chat_retry_test.dart --reporter compact` (6 tests fail).
- [ ] **Step 3: Implement** — add a structured failure value containing category, retryability, sanitized message, and correlation ID; preserve the existing failed-message Retry affordance and attach the diagnostic text there. Log category/code/correlation ID without tokens or request content. Do not change backend behavior unless the reproduction/contract test proves a defect.
- [ ] **Step 4: GREEN** — All 6 tests pass. `fvm flutter analyze` → clean.
- [ ] **Step 5: Verify no signup wall** — Grep for `signIn|login|signUp|navigate.*login` in ai_chat_screen.dart; confirm absent from error/retry paths.
- [ ] **Step 6: HANDOFF**
  ```bash
  git add lib/shared/services/ai_chat_service.dart lib/features/ai_chat/ai_chat_screen.dart test/ai_chat/anonymous_chat_retry_test.dart
  git commit -m "Add anonymous guest chat structured diagnostics with preserved retry and anonymous contract"
  git push
  ```

---

## Stage 5: Split ScanUploadGateway — Durable Enqueue Then Scheduled Drain

**Files:** Modify `lib/features/scan/scan_screen.dart`, `lib/features/scan/providers/scan_providers.dart`, `test/scan/support/fake_scan_upload_gateway.dart`; create `test/scan/durable_enqueue_test.dart`, `test/scan/capture_morph_test.dart`

**Current state:** `scan_screen.dart:212` calls `enqueueAndUpload()` which awaits `drainPending()` at `upload_queue_service.dart:233`. Navigation at line 218 blocks on upload.

- [ ] **Step 1: Write failing tests** — durable enqueue completes before navigation; Processing is visible while an injected drain `Completer<void>` remains unresolved; scheduler is invoked once after enqueue; enqueue failure prevents navigation; short captured-photo morph is visible before/through route transition; reduced motion removes the nonessential duration. Use deterministic `pump` durations, not wall-clock timing.
- [ ] **Step 2: RED** — `fvm flutter test test/scan/durable_enqueue_test.dart --reporter compact` (5 tests fail).
- [ ] **Step 3: Implement** — replace the gateway's combined operation with exact responsibilities: `enqueue(...)` awaits `UploadQueueService.enqueue`; `scheduleDrain()` starts/injects the background drain without returning a transport future that the screen can await. In `_processImage`, await only durable enqueue, start the bounded morph/navigation, then schedule drain. Update all fakes/call sites and remove the combined gateway method so future UI code cannot regress to awaiting transport.
- [ ] **Step 4: GREEN** — All 5 tests pass. `fvm flutter analyze` → clean.
- [ ] **Step 5: HANDOFF**
  ```bash
  git add lib/features/scan/scan_screen.dart lib/features/scan/providers/scan_providers.dart test/scan/support/fake_scan_upload_gateway.dart test/scan/durable_enqueue_test.dart test/scan/capture_morph_test.dart
  git commit -m "Split ScanUploadGateway: durable enqueue then separately scheduled drain"
  git push
  ```

---

## Stage 6: Full-Screen Food Detail Topology Preserving PopScope

**Files:** Modify `lib/features/food_detail/food_detail_sheet.dart`, Create `test/food_detail/full_screen_detail_test.dart`

**Current state:** `food_detail_sheet.dart:148-152` uses `DraggableScrollableSheet` with `maxChildSize: 0.95`, `expand: false`. `PopScope` at line 143 wraps the sheet.

- [ ] **Step 1: Write failing tests** — Detail covers 100% viewport; PopScope preserves unsaved-edit confirmation; confirm discard dismisses; cancel discard keeps sheet; hero/macro/detected items all visible.
- [ ] **Step 2: RED** — `fvm flutter test test/food_detail/full_screen_detail_test.dart --reporter compact` (at least full-viewport test fails).
- [ ] **Step 3: Implement** — replace only the routed `DraggableScrollableSheet` topology with a full-constraint surface and one existing/controller-compatible scroll view from the first frame. Preserve `PopScope`, `_confirmExit`, `_requestExit`, save actions, and all existing content. Do not introduce a nested `Scaffold` unless route inspection proves it is required.
- [ ] **Step 4: GREEN** — All 5 tests pass. `fvm flutter analyze` → clean.
- [ ] **Step 5: HANDOFF**
  ```bash
  git add lib/features/food_detail/food_detail_sheet.dart test/food_detail/full_screen_detail_test.dart
  git commit -m "Replace food detail DraggableScrollableSheet with full-screen topology preserving PopScope"
  git push
  ```

---

## Stage 7: Login Field Vertical Centering

**Files:** Modify `lib/features/onboarding/login_screen.dart`, Create `test/onboarding/login_centering_test.dart`

**Current state:** `_Field` (lines 557-636) uses `Stack`/`Positioned` with `contentPadding: const EdgeInsets.only(top: 16)` (line 618). Label at `top: 2` (line 583), TextField fills via `Positioned.fill` (line 599). Causes center drift.

- [ ] **Step 1: Write failing tests** — Dark theme keyboard-closed centering (2px tolerance); light theme same; keyboard open centers in available space; text-scale 1.0 and 1.3 hold; no contentPadding drift.
- [ ] **Step 2: RED** — `fvm flutter test test/onboarding/login_centering_test.dart --reporter compact` (at least dark-theme test fails).
- [ ] **Step 3: Implement** — Replace `Stack`/`Positioned` in `_Field` with `Column`+`MainAxisAlignment.center` or `Align(alignment: Alignment.center)`. Replace `contentPadding: const EdgeInsets.only(top: 16)` with `contentPadding: const EdgeInsets.symmetric(vertical: 12, horizontal: 4)`. Verify 48px height accommodates text-scale 1.3.
- [ ] **Step 4: GREEN** — All 6 tests pass. `fvm flutter analyze` → clean.
- [ ] **Step 5: HANDOFF**
  ```bash
  git add lib/features/onboarding/login_screen.dart test/onboarding/login_centering_test.dart
  git commit -m "Fix login field vertical centering across keyboard/theme/text-scale"
  git push
  ```

---

## Stage 8: Combined Verification Gate and Physical-Only Boundary

**Files:** Create `tool/runtime_evidence/run_all_software_gates.sh`; modify `docs/implementation-status.md`

- [ ] **Step 1: Compose software gates** — run analyzer/tests, local Cuttlefish evidence, require the source-SHA-matching GitHub emulator run, and run ui-diff for the affected screens. Emit separate statuses for software gates and unevaluated physical-only claims. Exit nonzero only for a failed required software gate; physical-only claims are `NOT_EVALUATED`, never falsely passed and never used to turn a software pass into failure.
- [ ] **Step 2: Verify** — `bash tool/runtime_evidence` (dry/partial run). Confirm structure valid.
- [ ] **Step 3: HANDOFF**
  ```bash
  git add tool/runtime_evidence/run_all_software_gates.sh docs/implementation-status.md
  git commit -m "Add combined local+CI+ui-diff verification gate with physical-only boundary"
  git push
  ```

---

## Self-Review

- [x] Every spec section 2.1-2.5 finding has a corresponding plan stage with RED/GREEN evidence.
- [x] Evidence metadata matches spec 3.5.
- [x] Production inputs are fail-closed; no placeholder/debug release path.
- [x] Gradle signing and exact release certificate verification are specified.
- [x] Screenshot uses `android-vm adb exec-out screencap -p`.
- [x] Evidence tooling remains outside app runtime code.
- [x] All Flutter tests use `fvm flutter test`.
- [x] Evidence is compared to independent facts; mismatch is a hard failure.
- [x] Workflow/script tests are hermetic.
- [x] Capture uses an unresolved drain completer and deterministic timing.
- [x] Scan gateway durable enqueue and drain scheduling are separate.
- [x] Existing Retry is preserved; structured diagnostics are added.
- [x] No signup wall is introduced.
- [x] Food detail starts full-screen and preserves existing exit semantics.
- [x] Login field geometry is tested across theme/insets/text scale.
- [x] No cloud deploy is planned.
- [x] Physical-only claims are reported separately and never passed by emulators.
- [x] File references were checked against the repository.
- [x] No unresolved implementation placeholders remain.
- [x] Every implementation checkbox remains unchecked.
- [x] Bash staged paths exclude `.mcp.json`.
