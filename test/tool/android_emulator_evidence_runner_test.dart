import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

const _runner = 'tool/ci/run_android_emulator_evidence.sh';
const _apkPath = 'build/app/outputs/flutter-apk/app-debug.apk';
const _evidencePath = '.runtime_evidence/github';

final String _pathSeparator = Platform.isWindows ? ';' : ':';

class _RunnerFixture {
  _RunnerFixture._({
    required this.root,
    required this.bin,
    required this.callLog,
  });

  final Directory root;
  final Directory bin;
  final File callLog;

  static _RunnerFixture create() {
    final root = Directory.systemTemp.createTempSync('emulator-evidence-');
    addTearDown(() => root.deleteSync(recursive: true));
    final bin = Directory('${root.path}/bin')..createSync();
    final callLog = File('${root.path}/calls.log')..createSync();
    File('${root.path}/$_apkPath')
      ..createSync(recursive: true)
      ..writeAsBytesSync(<int>[1, 2, 3, 4]);

    final fixture = _RunnerFixture._(
      root: root,
      bin: bin,
      callLog: callLog,
    );
    fixture._writeExecutable('fvm', r'''#!/usr/bin/env bash
printf 'fvm %s\n' "$*" >> "$FAKE_CALL_LOG"
exit "${FAKE_DRIVE_EXIT:-0}"
''');
    fixture._writeExecutable('adb', r'''#!/usr/bin/env bash
printf 'adb %s\n' "$*" >> "$FAKE_CALL_LOG"
if [[ -n "${FAKE_ADB_FAIL_ON:-}" && "$*" == *"$FAKE_ADB_FAIL_ON"* ]]; then
  exit "${FAKE_ADB_FAIL_CODE:-19}"
fi
if [[ -n "${FAKE_ADB_SECOND_FAIL_ON:-}" && "$*" == *"$FAKE_ADB_SECOND_FAIL_ON"* ]]; then
  exit "${FAKE_ADB_SECOND_FAIL_CODE:-29}"
fi
case "$*" in
  *"exec-out screencap -p"*) printf 'fake-png' ;;
  *"logcat -d"*) printf 'fake-logcat\n' ;;
  *"getprop ro.build.version.sdk"*) printf '34\n' ;;
  *"getprop ro.product.model"*) printf 'Android SDK built for x86_64\n' ;;
  *"wm size"*) printf 'Physical size: 1440x2560\n' ;;
esac
''');
    fixture._writeExecutable('git', r'''#!/usr/bin/env bash
printf 'git %s\n' "$*" >> "$FAKE_CALL_LOG"
printf '0123456789abcdef0123456789abcdef01234567\n'
''');
    fixture._writeExecutable('sha256sum', r'''#!/usr/bin/env bash
printf 'sha256sum %s\n' "$*" >> "$FAKE_CALL_LOG"
printf 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210  %s\n' "$1"
''');
    return fixture;
  }

  void _writeExecutable(String name, String contents) {
    final file = File('${bin.path}/$name')..writeAsStringSync(contents);
    final result = Process.runSync('/bin/chmod', <String>['+x', file.path]);
    expect(result.exitCode, 0, reason: result.stderr as String?);
  }

  Future<ProcessResult> run({
    int driveExit = 0,
    String? adbFailOn,
    int adbFailCode = 19,
    String? adbSecondFailOn,
    int adbSecondFailCode = 29,
  }) {
    return Process.run(
      'bash',
      <String>[File(_runner).absolute.path],
      workingDirectory: root.path,
      environment: <String, String>{
        ...Platform.environment,
        'PATH': '${bin.path}$_pathSeparator${Platform.environment['PATH']}',
        'FAKE_CALL_LOG': callLog.path,
        'FAKE_DRIVE_EXIT': '$driveExit',
        if (adbFailOn != null) 'FAKE_ADB_FAIL_ON': adbFailOn,
        'FAKE_ADB_FAIL_CODE': '$adbFailCode',
        if (adbSecondFailOn != null) 'FAKE_ADB_SECOND_FAIL_ON': adbSecondFailOn,
        'FAKE_ADB_SECOND_FAIL_CODE': '$adbSecondFailCode',
      },
    );
  }

  File evidence(String name) => File('${root.path}/$_evidencePath/$name');
}

void main() {
  test('collects every diagnostic and preserves a failed drive exit', () async {
    final fixture = _RunnerFixture.create();

    final result = await fixture.run(driveExit: 17);

    expect(result.exitCode, 17, reason: '${result.stderr}\n${result.stdout}');
    for (final name in <String>[
      'screenshot.png',
      'logcat.txt',
      'sdk-version.txt',
      'device-model.txt',
      'viewport.txt',
      'apk.sha256',
      'source-commit.txt',
    ]) {
      expect(fixture.evidence(name).existsSync(), isTrue, reason: name);
    }
    final calls = fixture.callLog.readAsStringSync();
    expect(calls, contains('fvm flutter drive'));
    expect(calls, contains('adb -s emulator-5554 exec-out screencap -p'));
    expect(calls, contains('git rev-parse HEAD'));
  });

  test('returns the first evidence failure but continues later diagnostics',
      () async {
    final fixture = _RunnerFixture.create();

    final result = await fixture.run(adbFailOn: 'logcat -d');

    expect(result.exitCode, 19, reason: '${result.stderr}\n${result.stdout}');
    expect(fixture.evidence('source-commit.txt').existsSync(), isTrue);
    final calls = fixture.callLog.readAsStringSync();
    expect(calls, contains('adb -s emulator-5554 logcat -d'));
    expect(calls, contains('adb -s emulator-5554 shell wm size'));
    expect(calls, contains('git rev-parse HEAD'));
  });

  test('a failed drive exit takes precedence over an evidence failure',
      () async {
    final fixture = _RunnerFixture.create();

    final result = await fixture.run(
      driveExit: 17,
      adbFailOn: 'logcat -d',
      adbFailCode: 19,
    );

    expect(result.exitCode, 17, reason: '${result.stderr}\n${result.stdout}');
    expect(fixture.evidence('source-commit.txt').existsSync(), isTrue);
  });

  test('the first of two evidence failures determines the exit', () async {
    final fixture = _RunnerFixture.create();

    final result = await fixture.run(
      adbFailOn: 'exec-out screencap -p',
      adbFailCode: 23,
      adbSecondFailOn: 'logcat -d',
      adbSecondFailCode: 29,
    );

    expect(result.exitCode, 23, reason: '${result.stderr}\n${result.stdout}');
    expect(fixture.evidence('source-commit.txt').existsSync(), isTrue);
  });
}
