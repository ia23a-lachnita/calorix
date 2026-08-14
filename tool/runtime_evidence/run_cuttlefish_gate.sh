#!/usr/bin/env bash
#
# run_cuttlefish_gate.sh - local Cuttlefish runtime evidence gate.
#
# Builds the debug APK from the current source targeting the exact integration
# test entry point, fingerprints the tracked build inputs before and after the
# build, boots Cuttlefish, runs the integration test via flutter drive using the
# pre-built APK (no separate manual install step; flutter drive owns
# installation), captures a screenshot and logcat, then writes
# and independently validates an immutable metadata sidecar via write_metadata.py.
# The Cuttlefish VM is always stopped through an EXIT trap, including on failure.
#
# Deterministic tracked-source fingerprint: every tracked file (git ls-files
# -s -z: NUL-delimited index mode + path records) is re-hashed from the
# on-disk worktree bytes via git hash-object, so an unstaged edit that Flutter
# would actually build changes the fingerprint. Records are parsed and sorted
# NUL-safely (LC_ALL=C byte order), so a tracked path containing spaces, tabs,
# non-ASCII bytes, or an embedded newline is preserved byte-exact and can never
# be mistaken for a quote, a record boundary, or the missing marker. Missing
# tracked files are marked. Content-based, no mtimes. Enumeration and per-file
# hash failures abort the fingerprint computation (set -o pipefail over the
# direct git ls-files pipeline; hash-object failures are propagated explicitly).
# A fingerprint or HEAD change between the pre-build and post-build snapshots,
# an APK hash change between build and metadata recording, a test failure, or
# a metadata mismatch against independently observed facts is a hard failure.
# sourceCommitSha (HEAD) and sourceFingerprint (worktree bytes) are recorded
# and validated separately. Stale canonical/custom APKs are removed before the
# build so post-build output is proven fresh; the captured screenshot is
# structurally validated (PNG signature, IHDR chunk header, wm-size-matched
# dimensions) with stdlib Python before logcat or metadata.
#
# Every external tool (git, fvm, android-vm) is resolved through PATH and every
# command is appended to <output-dir>/commands.log, which keeps the gate
# hermetic under fake-command test harnesses and makes command order auditable.
#
# Usage: run_cuttlefish_gate.sh [options]
set -euo pipefail

METADATA_TOOL="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/write_metadata.py"

ROOT="$(pwd)"
OUTPUT_DIR=".runtime_evidence"
DEVICE="0.0.0.0:6520"
INTEGRATION_TEST="integration_test/e2e/e2e_matrix_test.dart"
APK="build/app/outputs/flutter-apk/app-debug.apk"
CANONICAL_APK="$APK"

print_usage() {
  cat <<'EOF'
usage: run_cuttlefish_gate.sh [options]

Local Cuttlefish runtime evidence gate: build (--target), fingerprint, drive,
screenshot, logcat, and immutable metadata validation. Stops the VM via trap.

options:
  --root <dir>              repo root (default: current directory)
  --output-dir <dir>        evidence output directory (default: .runtime_evidence)
  --device <addr>           device address for flutter drive (default: 0.0.0.0:6520)
  --integration-test <path> integration test to run (and --target for build)
                            (default: integration_test/e2e/e2e_matrix_test.dart)
  --apk <path>              built APK path (default: build/app/outputs/flutter-apk/app-debug.apk);
                            a non-default path receives a byte-for-byte copy of the canonical build output
  -h, --help                show this help and exit
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root) ROOT="$2"; shift 2 ;;
    --output-dir) OUTPUT_DIR="$2"; shift 2 ;;
    --device) DEVICE="$2"; shift 2 ;;
    --integration-test) INTEGRATION_TEST="$2"; shift 2 ;;
    --apk) APK="$2"; shift 2 ;;
    -h|--help) print_usage; exit 0 ;;
    *) echo "ERROR: unknown option: $1" >&2; print_usage >&2; exit 2 ;;
  esac
done

if [[ ! -f "$METADATA_TOOL" ]]; then
  echo "ERROR: write_metadata.py not found next to this script: $METADATA_TOOL" >&2
  exit 1
fi

cd "$ROOT"
mkdir -p "$OUTPUT_DIR"

COMMANDS_LOG="$OUTPUT_DIR/commands.log"
: > "$COMMANDS_LOG"

log() { printf '%s\n' "$*" >> "$COMMANDS_LOG"; }

run() {
  log "$*"
  "$@"
}

die() {
  echo "ERROR: $*" >&2
  exit 1
}

cleanup() {
  log 'android-vm stop'
  android-vm stop 2>/dev/null || true
}
trap cleanup EXIT

fingerprint() {
  # Tracked worktree fingerprint: replace the stale index blob SHA in each
  # NUL-delimited `git ls-files -s -z` record with a fresh hash-object of the
  # actual file on disk, so worktree edits that were never staged change the
  # fingerprint. Paths and index modes are included; build output/runtime
  # artifacts are never listed by ls-files so they cannot leak in. Records are
  # read and sorted NUL-safely (`read -d ''`, `sort -z`) with LC_ALL=C byte
  # order, so a tracked path containing spaces, tabs, non-ASCII bytes, or even
  # an embedded newline is preserved byte-exact and can never be mis-split,
  # mistaken for a quote, or confused with the missing marker. Each record is
  # emitted as "<mode> <hash>\t<path>\0", then the whole NUL-terminated stream
  # is hashed.
  #
  # git ls-files feeds the pipeline directly (no process substitution), so with
  # `set -o pipefail` an enumeration failure aborts the fingerprint with a
  # nonzero status instead of silently hashing a partial/empty stream. A git
  # hash-object failure for any individual file is propagated explicitly for
  # the same reason.
  git ls-files -s -z | while read -r -d '' record; do
    meta="${record%%$'\t'*}"
    path="${record#*$'\t'}"
    mode="${meta%% *}"
    if [[ -f "$path" ]]; then
      if ! hash="$(git hash-object -- "$path")"; then
        echo "ERROR: git hash-object failed for $path" >&2
        exit 1
      fi
    else
      hash=missing
    fi
    printf '%s %s\t%s\0' "$mode" "$hash" "$path"
  done | LC_ALL=C sort -z | sha256sum | cut -d' ' -f1
}

validate_screenshot() {
  # Independent, stdlib-Python-only structural validation of the captured PNG:
  # the exact 8-byte signature, "IHDR" as the first chunk, an IHDR length of 13,
  # and positive width/height that exactly match the wm size re-observed on the
  # device. Empty, text, truncated, or wrong-size artifacts fail here -- before
  # logcat, the APK re-hash, or any metadata write/validation.
  VIEWPORT_WIDTH="$VIEWPORT_WIDTH" VIEWPORT_HEIGHT="$VIEWPORT_HEIGHT" \
    python3 -c '
import os, struct, sys
with open(sys.argv[1], "rb") as f:
    data = f.read()
signature = b"\x89PNG\r\n\x1a\n"
if data[:8] != signature:
    sys.exit("screenshot is not a PNG: bad 8-byte signature")
if len(data) < 8 + 12:
    sys.exit("screenshot is not a PNG: missing IHDR chunk")
length, chunk_type = struct.unpack(">I4s", data[8:16])
if chunk_type != b"IHDR":
    sys.exit("screenshot is not a PNG: first chunk is not IHDR")
if length != 13:
    sys.exit("screenshot PNG IHDR length is not 13")
if len(data) < 8 + 12 + 13:
    sys.exit("screenshot PNG is truncated: IHDR payload shorter than 13 bytes")
width, height = struct.unpack(">II", data[16:24])
wm_width = int(os.environ["VIEWPORT_WIDTH"])
wm_height = int(os.environ["VIEWPORT_HEIGHT"])
if width <= 0 or height <= 0:
    sys.exit("screenshot PNG dimensions must be positive")
if width != wm_width or height != wm_height:
    sys.exit(
        "screenshot PNG %dx%d does not match wm size %dx%d"
        % (width, height, wm_width, wm_height)
    )
' "$SCREENSHOT_PATH"
}

echo "runtime evidence gate: root=$ROOT output=$OUTPUT_DIR device=$DEVICE"

SOURCE_SHA="$(run git rev-parse HEAD)" || die 'failed to read source commit'
if [[ ! "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  die "unexpected source commit format: $SOURCE_SHA"
fi

log 'git ls-files -s -z | git hash-object | LC_ALL=C sort -z | sha256sum'
FINGERPRINT_PRE="$(fingerprint)" || die 'failed to compute pre-build source fingerprint'

# Remove any stale canonical APK and, when a custom --apk path is configured,
# any stale custom artifact too, so the post-build freshness assertion can
# attribute canonical output to THIS run. Both removals use safe `--` handling
# and are logged, but only when a stale file actually exists -- so the
# happy-path command sequence is unaffected.
if [[ -f "$CANONICAL_APK" ]]; then
  log "rm -f -- $CANONICAL_APK"
  rm -f -- "$CANONICAL_APK"
fi
if [[ "$APK" != "$CANONICAL_APK" && -f "$APK" ]]; then
  log "rm -f -- $APK"
  rm -f -- "$APK"
fi

if ! run fvm flutter build apk --debug --target "$INTEGRATION_TEST"; then
  die 'fvm flutter build apk failed'
fi

# The canonical Flutter output must have been freshly produced by this build:
# a pre-existing artifact was removed above, so its presence now proves the
# build wrote it. A missing fresh canonical artifact fails the gate before any
# custom copy, post-build source check, APK hashing, VM boot, or install.
if [[ ! -f "$CANONICAL_APK" ]]; then
  die "canonical Flutter build output not produced: $CANONICAL_APK"
fi

# fvm flutter build apk --debug always produces canonical Flutter APK output
# (CANONICAL_APK), freshly asserted above. When a custom --apk path is
# configured, stage a byte-for-byte copy of the canonical artifact now -- before
# the post-build source checks, APK hashing, VM boot, or drive -- so the gate
# hashes, drives, and records exactly the artifact Flutter actually built, in
# parity with the default path.
if [[ "$APK" != "$CANONICAL_APK" ]]; then
  mkdir -p "$(dirname "$APK")"
  if ! run cp "$CANONICAL_APK" "$APK"; then
    die "failed to copy built APK from $CANONICAL_APK to $APK"
  fi
fi

# Re-read HEAD and the worktree fingerprint immediately after the build. A
# commit change or an unstaged edit after the build means the APK is stale, so
# refuse before any APK hashing, VM start, or drive.
SOURCE_SHA_AFTER="$(run git rev-parse HEAD)" || die 'failed to re-read source commit after build'
if [[ "$SOURCE_SHA_AFTER" != "$SOURCE_SHA" ]]; then
  die "source commit changed after build ($SOURCE_SHA -> $SOURCE_SHA_AFTER); refusing to test a stale APK"
fi

log 'git ls-files -s -z | git hash-object | LC_ALL=C sort -z | sha256sum'
FINGERPRINT_POST="$(fingerprint)" || die 'failed to recompute source fingerprint after build'
if [[ "$FINGERPRINT_POST" != "$FINGERPRINT_PRE" ]]; then
  die "source changed after build (fingerprint $FINGERPRINT_PRE -> $FINGERPRINT_POST); refusing to test a stale APK"
fi

if [[ ! -f "$APK" ]]; then
  die "built APK not found: $APK"
fi
APK_SHA="$(run sha256sum "$APK" | cut -d' ' -f1)" || die 'failed to hash built APK'

run android-vm start
run android-vm wait

if ! run fvm flutter drive --driver=test_driver/integration_test.dart --target="$INTEGRATION_TEST" -d "$DEVICE" --use-application-binary="$APK" --no-build --keep-app-running; then
  die 'integration test failed'
fi

SDK_VERSION="$(run android-vm adb shell getprop ro.build.version.sdk)" || die 'failed to read SDK version'
DEVICE_MODEL="$(run android-vm adb shell getprop ro.product.model)" || die 'failed to read device model'
WM_SIZE="$(run android-vm adb shell wm size)" || die 'failed to read wm size'
if [[ "$WM_SIZE" =~ ([0-9]+)x([0-9]+) ]]; then
  VIEWPORT_WIDTH="${BASH_REMATCH[1]}"
  VIEWPORT_HEIGHT="${BASH_REMATCH[2]}"
else
  die "cannot parse wm size output: $WM_SIZE"
fi

SCREENSHOT_PATH="$OUTPUT_DIR/cuttlefish_evidence.png"
log "android-vm adb exec-out screencap -p > $SCREENSHOT_PATH"
android-vm adb exec-out screencap -p > "$SCREENSHOT_PATH"

log "python3 -c screenshot png header validation < $SCREENSHOT_PATH"
if ! validate_screenshot; then
  die "captured screenshot failed PNG header validation: $SCREENSHOT_PATH"
fi

LOGCAT_PATH="$OUTPUT_DIR/logcat.txt"
log "android-vm adb logcat -d > $LOGCAT_PATH"
android-vm adb logcat -d > "$LOGCAT_PATH"

# The APK is re-hashed after flutter drive; the APK on disk must be byte-identical
# to the one supplied to the drive; a hash change before metadata recording is a hard failure.
APK_SHA_AFTER="$(run sha256sum "$APK" | cut -d' ' -f1)" || die 'failed to re-hash built APK'
if [[ "$APK_SHA_AFTER" != "$APK_SHA" ]]; then
  die "APK hash changed after build ($APK_SHA -> $APK_SHA_AFTER); refusing to record metadata"
fi

TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
SIDECAR="$OUTPUT_DIR/runtime.sidecar.json"

if ! run python3 "$METADATA_TOOL" write \
  --source-commit-sha "$SOURCE_SHA" \
  --source-fingerprint "$FINGERPRINT_PRE" \
  --sdk-version "$SDK_VERSION" \
  --device-model "$DEVICE_MODEL" \
  --viewport-width "$VIEWPORT_WIDTH" \
  --viewport-height "$VIEWPORT_HEIGHT" \
  --timestamp "$TIMESTAMP" \
  --apk-path "$APK" \
  --output "$SIDECAR"; then
  die 'metadata write failed'
fi

# Validate against freshly re-observed independent facts (source re-queried,
# APK re-hashed inside write_metadata.py).
SOURCE_SHA_ACTUAL="$(run git rev-parse HEAD)" || die 'failed to re-read source commit'
log 'git ls-files -s -z | git hash-object | LC_ALL=C sort -z | sha256sum'
FINGERPRINT_ACTUAL="$(fingerprint)" || die 'failed to recompute source fingerprint for validation'

if ! run python3 "$METADATA_TOOL" validate \
  --sidecar "$SIDECAR" \
  --actual-source-commit-sha "$SOURCE_SHA_ACTUAL" \
  --actual-source-fingerprint "$FINGERPRINT_ACTUAL" \
  --actual-sdk-version "$SDK_VERSION" \
  --actual-device-model "$DEVICE_MODEL" \
  --actual-viewport-width "$VIEWPORT_WIDTH" \
  --actual-viewport-height "$VIEWPORT_HEIGHT" \
  --apk-path "$APK"; then
  die 'metadata validation failed'
fi

echo "runtime evidence gate PASSED"
echo "  sidecar:     $SIDECAR"
echo "  screenshot:  $SCREENSHOT_PATH"
echo "  logcat:      $LOGCAT_PATH"
echo "  commands:    $COMMANDS_LOG"