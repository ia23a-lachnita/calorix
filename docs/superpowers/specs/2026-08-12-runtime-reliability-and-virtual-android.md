# Runtime Reliability And Virtual Android Design

Status: design verbally approved; external architecture consultation green; written spec awaiting user review. No product fixes implemented yet.

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

### 3.2 Selected immediate path: GitHub-hosted x86_64 emulator

- Use `reactivecircus/android-emulator-runner@v2` on GitHub-hosted x86_64 runners, targeting API 34, with KVM acceleration, no window (headless), and software graphics rendering.
- Run the existing in-memory `integration_test/e2e/e2e_matrix_test.dart` suite unmodified as the baseline gate.
- Add focused regression flows for the five confirmed findings in section 2 (see Stage 3-6 in the roadmap).
- Collect and upload as run artifacts: screenshots for each flow, video only where it adds diagnostic value beyond screenshots, `logcat` output, the test report, the source commit SHA, and the built test APK's SHA.
- Name the uploaded artifact using the source SHA so runs are traceable and immutable.

### 3.3 Evidence scope limits (explicit, non-negotiable)

Emulator evidence is functional/runtime evidence only. It must never be presented as proof of:

- final physical device performance (frame timing, thermal behavior, memory pressure under real hardware),
- camera capture quality or OEM camera-stack behavior,
- real Google or Apple sign-in flows (these require real OAuth client configuration and physical or restricted test accounts),
- push notification delivery through real FCM/APNs infrastructure,
- pixel-level visual parity sign-off against the mockups (that remains the ui-diff pipeline's job, run separately against emulator or physical captures per `.claude/tools.md`).

### 3.4 Local future path (deferred, not this spec's implementation scope)

- The only accepted local virtual-Android option is a narrowly scoped, root-owned ReDroid systemd service, started and stopped under explicit host administrator control.
- Explicitly rejected: NOPASSWD sudo rules for any agent-invoked command, and adding the operating agent's user to a root-equivalent daemon group.
- This path requires host administrator action outside agent scope and is not scheduled in the roadmap below; it is recorded here so it is not silently re-attempted via a rejected shortcut.

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

Every stage: TDD (red before green), Antigravity pre/post review per AGENTS.md section 4 where the diff qualifies, Sonnet 5 as editing worker per the delegation policy, host verification of results, then commit and push by the main agent only.

- **Stage 0** - Tracking, spec, and plan review. This document; await user review before Stage 1 begins.
- **Stage 1** - GitHub-hosted emulator functional gate and artifact contract (section 3.2). Gate: emulator boots, `adb` reports the device online, the existing e2e matrix suite passes, and the artifact contains source SHA, APK SHA, screenshots, and logcat.
- **Stage 2** - Fail-closed Firebase and release-signing build contract (section 4.1-4.2). Gate: production workflow cannot upload an APK built with placeholder Firebase options or debug signing; a deliberately misconfigured run fails the workflow instead of producing an artifact.
- **Stage 3** - Guest chat diagnostics and user-visible retry/error UX (section 2.2). Gate: anonymous-auth chat is tested end to end; on failure the user sees an actionable retry/error state, never a silent failure. No signup wall is added unless a real trace proves a product restriction.
- **Stage 4** - Durable nonblocking capture with a short reduced-motion-aware captured-photo-to-processing morph; upload runs in the background with queue retry (section 2.3). Gate: capture reaches the processing screen after a durable local enqueue and strictly before network upload completion.
- **Stage 5** - Full-screen food detail scrolling with no exposed route background (section 2.4). Gate: the detail surface covers the full viewport through maximum scroll extent, and unsaved-edit protection on dismiss is preserved.
- **Stage 6** - Centered login field geometry (section 2.5), tested across keyboard-open/closed states and accessibility settings, dark and light themes. Gate: text/input visual centers are asserted at supported viewports and keyboard states.
- **Stage 7** - Run the full emulator matrix from Stage 1 plus all Stage 3-6 flows; inspect every generated screenshot, logcat, and report artifact; then run the ui-diff pipeline against the relevant screens per `.claude/tools.md`.
- **Stage 8** - Physical device validation: real auth providers, camera, push notification delivery, and release APK validation, once hardware and real secrets exist (see section 8). Gate: each physical-only claim is validated on a physical device; none are satisfied by emulator evidence alone.

## 6. Exact Acceptance Criteria

- Emulator boots and `adb` reports it online; the e2e matrix passes; the run artifact includes source SHA, APK SHA, screenshots, and logcat.
- The production workflow cannot upload an APK built with placeholder Firebase options or debug signing.
- Guest chat always produces either a real response or an actionable retry/error state; it never fails silently.
- Capture reaches the processing screen after durable local enqueue and before network upload completion.
- The food detail background covers the full viewport through maximum scroll extent.
- Text/input visual centers are asserted at each supported viewport and keyboard state.
- Physical-only gates (section 3.3, Stage 8) are labeled blocked until validated on real hardware; they are never marked passed by emulator evidence.

## 7. Explicit Blockers

- Real Firebase client configuration inputs (`firebase_options.dart` and `google-services.json`) for the production workflow.
- A real release keystore, plus its SHA-1/SHA-256 fingerprints registered in the Firebase console.
- A physical Android phone for Stage 8 validation.
- A root-owned ReDroid systemd service, only if local (non-CI) virtual Android is later desired; requires host administrator action and is not part of this roadmap.

## 8. Non-Goals

- No cloud deploy of any kind.
- No production data mutation.
- No broad redesign beyond the five confirmed findings in section 2.
- No claim that emulator evidence proves physical device performance, camera quality, real OAuth sign-in, or push notification delivery (section 3.3).

## 9. Research References

- Android Emulator ARM host support (official): https://developer.android.com/studio/run/emulator-acceleration
- ReDroid official documentation: https://github.com/remote-android/redroid-doc
- Firebase Flutter setup and SHA registration (official): https://firebase.google.com/docs/flutter/setup
- Firebase Authentication SHA certificate fingerprint docs (official): https://developers.google.com/android/guides/client-auth
- GitHub Actions encrypted secrets (official): https://docs.github.com/en/actions/security-guides/encrypted-secrets
- `reactivecircus/android-emulator-runner` action: https://github.com/ReactiveCircus/android-emulator-runner
