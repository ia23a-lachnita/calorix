#!/usr/bin/env bash
set -uo pipefail

readonly emulator_serial="${ANDROID_EMULATOR_SERIAL:-emulator-5554}"
readonly apk_path="${ANDROID_EMULATOR_APK:-build/app/outputs/flutter-apk/app-debug.apk}"
readonly evidence_dir="${ANDROID_EMULATOR_EVIDENCE_DIR:-.runtime_evidence/github}"

drive_exit=0
evidence_exit=0

record_evidence_failure() {
  local exit_code="$1"
  if ((evidence_exit == 0)); then
    evidence_exit="$exit_code"
  fi
}

fvm flutter drive \
  --driver=test_driver/integration_test.dart \
  --target=integration_test/e2e/e2e_matrix_test.dart \
  -d "$emulator_serial" \
  --use-application-binary="$apk_path" \
  --no-build || drive_exit=$?

mkdir -p "$evidence_dir" || record_evidence_failure "$?"
adb -s "$emulator_serial" exec-out screencap -p \
  >"$evidence_dir/screenshot.png" || record_evidence_failure "$?"
adb -s "$emulator_serial" logcat -d \
  >"$evidence_dir/logcat.txt" || record_evidence_failure "$?"
adb -s "$emulator_serial" shell getprop ro.build.version.sdk \
  >"$evidence_dir/sdk-version.txt" || record_evidence_failure "$?"
adb -s "$emulator_serial" shell getprop ro.product.model \
  >"$evidence_dir/device-model.txt" || record_evidence_failure "$?"
adb -s "$emulator_serial" shell wm size \
  >"$evidence_dir/viewport.txt" || record_evidence_failure "$?"
sha256sum "$apk_path" \
  >"$evidence_dir/apk.sha256" || record_evidence_failure "$?"
git rev-parse HEAD \
  >"$evidence_dir/source-commit.txt" || record_evidence_failure "$?"

if ((drive_exit != 0)); then
  exit "$drive_exit"
fi
exit "$evidence_exit"
