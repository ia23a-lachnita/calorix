# Runtime Reliability And Virtual Android Design

Status: approved and externally reviewed on 2026-08-14. Cuttlefish verified on local host; no product implementation or production claims.

Local virtual Android verified: KVM Cuttlefish Android 17 ARM64 via `android-vm start/wait/adb/stop` (SDK 37, arm64-v8a, 720x1280, ADB/screenshots, cold boot 4-5 min, nofile 65536). This is the primary local evidence gate. GitHub x86_64 API 34 emulator is an independent CI gate, not a substitute for local Cuttlefish evidence. ReDroid retained only as historical rejected-path context (rootless Podman cgroup mount failure, exit 129).

Immutable metadata required on every run: `sourceCommitSha`, `apkSha256`, `sdkVersion`, `deviceModel`, `viewportDimensions`, `timestamp`, `staleBuildFingerprint:false`. Any mismatch between the declared metadata and the actual build/device state fails the gate. No exceptions.

Preserve: fail-closed real Firebase/release signing, guest anonymous chat, durable nonblocking scan, full-screen detail, centered login requirements. No product fixes implemented yet.

## 1. Goal

Restore trustworthy distributable APKs, make the five reported runtime/UI issues testable and fixed, and establish automated virtual Android evidence without misrepresenting it as physical-device evidence.

## 2. Confirmed Findings (vs. Hypotheses)

Each item below is labeled confirmed or hypothesis. Do not treat hypotheses as settled without a real trace or configuration check.

### 2.1 CI / release signing (confirmed)

- Confirmed: `android-build.yml` currently synthesizes `ci-placeholder` Firebase options and signs the release build with the debug key.
- Confirmed: `gh secret list` returns empty for this repository.
- Confirmed: this configuration explains an invalid Firebase API key in built APKs.
- Hypothesis: it can also explain reported auth/network failures in the field, but this is not proven by itself.
- Not yet validated (requires real configuration, out of scope for this spec): Google/Apple auth provider enablement and the app's registered SHA-1/SHA-256 fingerprints in the Firebase console.

### 2.2 Guest chat / anonymous auth (confirmed code path, hypothesis on product intent)

- Confirmed: guest mode uses Firebase anonymous authentication.
- Confirmed: the callable function's auth check tests `request.auth` presence, not the auth provider type, so it does not reject anonymous users.
- Confirmed: backend `loadContext` already defaults absent profile/plan fields rather than throwing.
- Conclusion: guest chat is intended to work end to end. No signup wall exists in the current code path.
- Explicitly rejected: a prior reviewer's suggestion that a missing profile document is the root cause of guest chat failures. That claim is not accepted without a real reproduction trace; if a later trace proves a genuine product restriction, this finding must be revised with evidence attached.

### 2.3 Scan capture blocking navigation (confirmed)

- Confirmed: `ScanScreen` awaits `enqueueAndUpload` before proceeding.
- Confirmed: `UploadQueueService.enqueueAndUpload` itself awaits `drainPending`.
- Consequence: navigation away from the capture screen is blocked on network upload completion, contradicting the "capture in under 5 seconds, upload in background" product rule.

### 2.4 Food detail sheet exposing route background (confirmed)

- Confirmed: Food detail is a routed `DraggableScrollableSheet` configured with `initialChildSize: .92`, `maxChildSize: .95`, `expand: false`.
- Consequence: at rest and at max extent the sheet does not cover the full viewport, exposing the route's background beneath it (a visible void/seam).

### 2.5 Login field mis-centering (confirmed)

- Confirmed: the login screen's `_Field` widget positions its label/hint using `Stack`/`Positioned` offsets combined with top-only `contentPadding`.
- Consequence: text/input visual centers do not align with the field's visual bounds, producing off-center rendering.

## 3. Virtual Android Decision

### 3.1 Local facts (confirmed on this host)

- `adb`, KVM, and BinderFS are functional on this host.
- Rootless Podman is functional on this host.
- ReDroid's Android init fails to mount cgroups and exits with code 129 when run in a rootless Podman namespace, including with `--cgroupns host` and with cgroups disabled attempted.
- Official ReDroid documentation uses a privileged quickstart; on this host the measured rootless attempts fail during Android init cgroup mounting.
- Standard Android Studio / the standard Android Emulator is unsupported on Linux ARM hosts (this host's architecture).

### 3.2 Primary local gate: Cuttlefish Android 17 ARM64

Cuttlefish is the primary local verification gate. All behavior changes (Stages 3-6) must pass on local Cuttlefish before the independent CI gate is checked.

- Start: `android-vm start` (creates a KVM-backed Cuttlefish AVD on the local host).
- Wait: `android-vm wait` (blocks until Android reports `sys.boot_completed=1`).
- Verify: `android-vm adb <command>` to run `adb` against the Cuttlefish instance.
- Screenshot: `android-vm adb exec-out screencap -p > <path>.png` to capture full-screen PNGs for evidence. The wrapper has no `screenshot` subcommand.
- Stop: `android-vm stop` (tears down the Cuttlefish instance and cleans up).
- Target: SDK 37 (Android 17), arm64-v8a, 720x1280 viewport, ADB + screenshot capable.
- Cold boot time: approximately 4-5 minutes. The `nofile` limit must be set to 65536.
- Run the existing in-memory `integration_test/e2e/e2e_matrix_test.dart` suite unmodified as the baseline gate.
- Add focused regression flows for the five confirmed findings in section 2 (see Stages 3-6 in the roadmap).
- Every local Cuttlefish run must emit the immutable metadata block (section 3.5) into a sidecar JSON file alongside the screenshots. The metadata must match the actual build and device state; mismatches fail the gate.

### 3.3 Independent CI gate: GitHub-hosted x86_64 emulator

The GitHub emulator workflow is an independent CI signal, not a substitute for local Cuttlefish evidence.

- Use `reactivecircus/android-emulator-runner@v2` on GitHub-hosted x86_64 runners, targeting API 34, with KVM acceleration, no window (headless), and software graphics rendering.
- Run the existing in-memory `integration_test/e2e/e2e_matrix_test.dart` suite unmodified as the baseline gate.
- Collect and upload as run artifacts: screenshots for each flow, `logcat` output, the test report, the source commit SHA, and the built test APK's SHA.
- Name the uploaded artifact using the source SHA so runs are traceable and immutable.
- The GitHub workflow may run in parallel with or after local Cuttlefish verification; it does not replace it.

### 3.4 Evidence scope limits (explicit, non-negotiable)

Virtual Android evidence (Cuttlefish or GitHub emulator) is functional/runtime evidence only. It must never be presented as proof of:

- final physical device performance (frame timing, thermal behavior, memory pressure under real hardware),
- camera capture quality or OEM camera-stack behavior,
- real Google or Apple sign-in flows (these require real OAuth client configuration and physical or restricted test accounts),
- push notification delivery through real FCM/APNs infrastructure,
- pixel-level visual parity sign-off against the mockups (that remains the ui-diff pipeline's job, run separately against emulator or physical captures per `.claude/tools.md`).

### 3.5 Immutable evidence metadata (required on every run)

Every Cuttlefish or GitHub emulator run must produce a sidecar JSON file containing:

```json
{
  "sourceCommitSha": "<full 40-char SHA of the source commit used to build the APK>",
  "apkSha256": "<SHA-256 hex of the built APK file>",
  "sdkVersion": "<API level, e.g. 34 or 37>",
  "deviceModel": "<emulator device model string, e.g. google/cuttlefish_phone_arm64>",
  "viewportDimensions": "<WxH, e.g. 720x1280>",
  "timestamp": "<ISO 8601 UTC>",
  "staleBuildFingerprint": false
}
```

`staleBuildFingerprint` must be `false`. If the APK SHA-256 in the metadata does not match the APK that was actually installed, or if `sourceCommitSha` does not match the checked-out source, the gate fails. A stale build fingerprint is a hard failure, not a warning.

### 3.6 Historical rejected path: ReDroid

ReDroid is retained as historical context only. It is not part of the active roadmap.

- Rootless Podman on this host fails to mount cgroups; Android init exits with code 129.
- Official ReDroid documentation requires a privileged quickstart.
- The only accepted local ReDroid path would be a root-owned systemd service under explicit host administrator control; this requires host admin action outside agent scope and is not scheduled.

## 4. CI Split

### 4.1 Production / distributable build (`android-build.yml`)

- Must fail closed: if real Firebase options, `google-services.json`, and a real release keystore are not all present as configured inputs, the workflow must fail rather than substitute placeholder or debug values.
- Must never synthesize placeholder production Firebase config under any code path, including "CI convenience" fallbacks.
- Must never sign a release artifact with the debug key.

### 4.2 Emulator validation workflow (new, separate from production build)

- Must not publish its test APK as a release artifact under any tag or workflow trigger that also produces distributable output.
- The existing in-memory `integration_test/e2e/e2e_matrix_test.dart` harness does not require real Firebase credentials; keep it that way.
- Any test-only or demo Firebase/config values used for emulator validation must be isolated in a clearly named test-only config path and must be structurally impossible to flow into the release build's inputs (e.g. distinct file, distinct workflow, no shared secret name with the production workflow).

### 4.3 Real release prerequisites (blocked pending secrets, see section 8)

- Registered signing SHA-1 and SHA-256 fingerprints in the Firebase console matching the real release keystore.
- Auth providers enabled in Firebase console as applicable (anonymous, email, Google, Apple).
- Source-SHA and artifact-checksum provenance recorded for every released build.

## 5. Roadmap With Acceptance Gates

Every stage: TDD (red before green), Antigravity pre/post review per AGENTS.md section 4 where the diff qualifies, editing worker per the delegation policy, host verification of results, then commit and push by the main agent only.

- **Stage 0** - Tracking, spec, and plan review. Green on 2026-08-14 with explicit external agreement and no must-fix items.
- **Stage 1** - Local Cuttlefish source-build, install, e2e, screenshot, logcat metadata gate (section 3.2). Gate: Cuttlefish boots via `android-vm start/wait`, `adb` reports the device online, the APK is built from the current source and installed, the existing e2e matrix suite passes, screenshots and logcat are captured, and the immutable metadata sidecar (section 3.5) contains correct `sourceCommitSha`, `apkSha256`, `sdkVersion`, `deviceModel`, `viewportDimensions`, `timestamp`, and `staleBuildFingerprint:false`. A metadata mismatch fails the gate.
- **Stage 2** - Independent GitHub x86_64 emulator workflow (section 3.3). Gate: the GitHub workflow boots an x86_64 API 34 emulator, runs the e2e matrix suite, uploads screenshots/logcat/artifact with source SHA naming. This is an independent CI signal, not a substitute for Stage 1.
- **Stage 3** - Fail-closed Firebase and real release signing workflow (section 4.1-4.2). Gate: production workflow materializes real Firebase files and signing material only from `FIREBASE_OPTIONS_DART_BASE64`, `GOOGLE_SERVICES_JSON_BASE64`, `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`, and `RELEASE_CERT_SHA256`; a deliberately misconfigured run fails instead of producing an artifact. Never placeholder/debug sign.
- **Stage 4** - Guest chat diagnostics and actionable retry/error (section 2.2). Gate: anonymous-auth chat is tested end to end on Cuttlefish; on failure the user sees an actionable retry/error state, never a silent failure. No signup wall is added unless a real trace proves a product restriction.
- **Stage 5** - Durable enqueue then background upload and short reduced-motion capture/morph animation (section 2.3). Gate: capture reaches the processing screen after a durable local enqueue and strictly before network upload completion. A reduced-motion test verifies the morph animation is short and does not block navigation.
- **Stage 6** - Full-screen food detail preserving unsaved edits (section 2.4). Gate: the detail surface covers the full viewport through maximum scroll extent, and unsaved-edit protection on dismiss is preserved.
- **Stage 7** - Centered login vertical centering for keyboard/theme/text-scale (section 2.5). Gate: text/input visual centers are asserted at supported viewports and keyboard states, across dark and light themes and text-scale variations.
- **Stage 8** - Combined local Cuttlefish + GitHub CI + ui-diff verification and physical-only boundary. Gate: every Stage 3-6 flow passes on both local Cuttlefish and GitHub CI; ui-diff pipeline runs against the relevant screens per `.claude/tools.md`; physical-only claims (camera, real OAuth, push notifications) are labeled blocked until validated on real hardware.

## 6. Exact Acceptance Criteria

- Local Cuttlefish boots via `android-vm start/wait`, `adb` reports it online; the e2e matrix passes; screenshots and logcat are captured; the immutable metadata sidecar (section 3.5) matches the actual build and device state with `staleBuildFingerprint:false`. A metadata mismatch is a hard failure.
- The GitHub x86_64 emulator workflow boots, runs the e2e matrix, and uploads artifacts with source SHA naming. This is an independent CI signal, not a Cuttlefish substitute.
- The production workflow requires all seven named encoded-config/signing inputs from Stage 3, materializes the real files only inside the job, verifies the exact signer certificate, and fails if any input is missing, malformed, placeholder, or mismatched.
- Guest chat always produces either a real response or an actionable retry/error state; it never fails silently.
- Capture reaches the processing screen after durable local enqueue and before network upload completion.
- The food detail background covers the full viewport through maximum scroll extent.
- Text/input visual centers are asserted at each supported viewport and keyboard state.
- Physical-only gates (section 3.4, Stage 8) are labeled blocked until validated on real hardware; they are never marked passed by Cuttlefish or GitHub emulator evidence.

## 7. Explicit Blockers

- Real Firebase client configuration inputs (`firebase_options.dart` and `google-services.json`) for the production workflow.
- A real release keystore, plus its base64-encoded form (`KEYSTORE_BASE64`), `KEYSTORE_PASSWORD`, `KEY_ALIAS`, and `KEY_PASSWORD` as GitHub Actions secrets.
- SHA-1 and SHA-256 fingerprints of the real release keystore registered in the Firebase console.
- Auth providers enabled in Firebase console as applicable (anonymous, email, Google, Apple).
- A physical Android phone for Stage 8 physical-only validation (camera, real OAuth, push notifications).
- The `android-vm` CLI tool must be installed and functional on the local host (verified: yes, with KVM, BinderFS, and `nofile 65536`).

## 8. Non-Goals

- No cloud deploy of any kind.
- No production data mutation.
- No broad redesign beyond the five confirmed findings in section 2.
- No claim that Cuttlefish or GitHub emulator evidence proves physical device performance, camera quality, real OAuth sign-in, or push notification delivery (section 3.4).
- No placeholder or debug signing for release builds. Production builds require real keystore inputs or the workflow fails.
- No signup wall for anonymous/guest chat.

## 9. Research References

- Android Emulator ARM host support (official): https://developer.android.com/studio/run/emulator-acceleration
- ReDroid official documentation: https://github.com/remote-android/redroid-doc
- Firebase Flutter setup and SHA registration (official): https://firebase.google.com/docs/flutter/setup
- Firebase Authentication SHA certificate fingerprint docs (official): https://developers.google.com/android/guides/client-auth
- GitHub Actions encrypted secrets (official): https://docs.github.com/en/actions/security-guides/encrypted-secrets
- `reactivecircus/android-emulator-runner` action: https://github.com/ReactiveCircus/android-emulator-runner
