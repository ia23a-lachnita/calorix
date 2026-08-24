# Calorix Tool and MCP Catalog

Use the smallest tool that answers the question. Keep large logs, search results, and command output out of the main conversation.

## FVM Command Standard

Run from the project root so FVM sees `.fvmrc` / `.fvm`:

```bash
fvm flutter doctor
fvm flutter pub get
fvm flutter analyze
fvm flutter test
fvm flutter run
fvm dart --version
```

Never use plain `flutter` or `dart` in project work unless diagnosing global SDK setup.

## Physical Samsung Device

The only default local Android target is the dedicated USB-connected Samsung
`SM-G780G`, Android `13`, serial `R58R61161NA`. Every device command must use
the absolute wrapper path below. The wrapper pins `adb -s R58R61161NA`; never
use plain `adb` or rely on automatic device selection.

Identity preflight:

```bash
/home/agent-runner/.local/bin/phone-adb devices -l
/home/agent-runner/.local/bin/phone-adb shell getprop ro.product.model
/home/agent-runner/.local/bin/phone-adb shell getprop ro.build.version.release
/home/agent-runner/.local/bin/phone-adb get-serialno
```

Install and launch a verified APK:

```bash
/home/agent-runner/.local/bin/phone-adb install -r /absolute/path/to/calorix.apk
/home/agent-runner/.local/bin/phone-adb shell monkey -p com.calorix.calorix -c android.intent.category.LAUNCHER 1
```

Seed deterministic debug data and capture evidence:

```bash
/home/agent-runner/.local/bin/phone-adb shell am start -a android.intent.action.VIEW -d calorix://debug/reseed
/home/agent-runner/.local/bin/phone-adb exec-out screencap -p > build/runtime-evidence/screen.png
/home/agent-runner/.local/bin/phone-adb logcat -c
# Exercise the bounded flow, then collect at most 2,000 lines.
/home/agent-runner/.local/bin/phone-adb logcat -d -v threadtime -t 2000 > build/runtime-evidence/logcat.txt
```

Before installation, prove that the APK belongs to committed/pushed source and
verify its recorded source SHA, checksum, and signer certificate. Follow the
CI cadence in `AGENTS.md`; do not use an old local APK as evidence for current
source. Do not uninstall the app, run `pm clear`, wipe device/app data, mutate
accounts, or trigger production uploads/writes unless the current task
explicitly requires and authorizes it.

Cuttlefish, `android-vm`, ReDroid, desktop AVDs, and local emulators are
retired. Do not start or troubleshoot them. GitHub's x86_64 API 34 emulator
workflow remains an independent CI gate.

## MCP Servers (configured in `.mcp.json` / host configs)

| Server | Role | Default state |
|---|---|---|
| `dart` | Dart/Flutter tooling: analyze, tests, pub, runtime errors (FVM-pinned SDK) | enabled |
| `flutter-mcp-toolkit` | Closed-loop runtime feedback: screenshots, semantic snapshots, taps, logs, hot reload | enabled |
| `ui-diff` | UI/mockup parity comparison (see below) | enabled |
| `claude-context` | Semantic codebase search; use before grep storms | enabled |
| `antigravity-mcp` | External Gemini review (`ask-ai`) — see AGENTS.md section 4 | enabled |
| `firebase` | Firebase project operations | **disabled by default** |
| `gcloud` | GCP operations (IAM/logs/buckets/Cloud Run) | **disabled by default** |

Plugins: `context7` (current library docs — prefer over model memory for Flutter/Dart/Firebase/Riverpod/GoRouter APIs), `superpowers` (workflow skills), `frontend-design` + `ui-ux-pro-max` (UI work), `context-mode` (large-output sandbox), `claude-mem` (session memory), `token-optimizer` (context health).

Firebase/gcloud connectors stay off unless the user enables them for a session. When they are off, use the `firebase`/`gcloud` CLIs for read-only checks, and apply the safety gates in AGENTS.md section 6 before any write or deploy.

## ui-diff MCP Workflow (UI parity)

The `ui-diff` server (from `/home/agent-runner/projects/ui-diff-mcp`) replaces the old `mobile-ui-diff` server; local-ollama VLM policies (`vlm_health`, qwen2.5vl/moondream models) are obsolete.

Tools:

- `compare_ui_images` — deterministic-only comparison of two screenshots.
- `discover_ui_diffs` / `start_ui_diff_run` + `get_ui_diff_run_status` — full pipeline (deterministic + LocateAnything locator + VLM audit); prefer the async run tools for long runs.
- `read_ui_diff_report` — hydrate a finished run report from `.ui-diff/runs/<runId>`.
- `capture_mobile_screen` — capture from `adb` (or `ios-simctl`).
- `ui_diff_model_health` — provider/model availability check before long runs.

Rules:

1. The pipeline needs the LocateAnything sidecar; live runs auto-start it when `LOCATEANYTHING_EAGLE_EMBODIED_DIR` is set (see ui-diff-mcp `AGENTS.md`).
2. Do not claim design parity from a completed run alone: check `visualClassificationStatus: complete`, `auditLimited: false`, and inspect the final overlay artifacts for the areas you changed.
3. Reference mockups live in `docs/design-handoff/placeholder-app/reference-images/`.
4. Run evidence lands in `.ui-diff/runs/` (git-ignored); reference run IDs, not pasted logs.
5. On this host, `capture_mobile_screen` currently invokes plain `adb` internally and cannot guarantee Samsung serial isolation. Until ui-diff-mcp adds a tested configurable ADB executable, capture with `/home/agent-runner/.local/bin/phone-adb exec-out screencap -p` and provide that exact image to the comparison run. Do not call the MCP capture tool as physical-phone evidence.

## External Docs Policy

- Context7 for libraries and SDKs; official docs before third-party blogs.
- Record docs consulted in plan notes when a change depends on current API behavior.
