import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';

const _script = 'tool/runtime_evidence/write_metadata.py';

/// ARM-host detection via /proc/cpuinfo — no subprocess spawned.
final bool _isArmHost = () {
  try {
    final cpuinfo = File('/proc/cpuinfo').readAsStringSync();
    return cpuinfo.contains('CPU architecture: 8') ||
        cpuinfo.contains('CPU architecture: 7') ||
        cpuinfo.contains('ARMv') ||
        cpuinfo.contains('aarch64');
  } catch (_) {
    return false;
  }
}();

/// Shared timeout for multi-process tests: 2 minutes under Pi qemu, 30s on desktop/CI.
final Timeout _multiProcessTimeout =
    Timeout(Duration(seconds: _isArmHost ? 120 : 30));

// sourceCommitSha is a full Git SHA-1: exactly 40 hex chars.
const _sha1 = '0123456789abcdef0123456789abcdef01234567';
const _wrongSha1 = '1111111111111111111111111111111111111111';
// sourceFingerprint and apkSha256 are SHA-256: exactly 64 hex chars.
const _sha256 =
    'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
const _wrongSha256 =
    '2222222222222222222222222222222222222222222222222222222222222222';
const _timestamp = '2026-08-14T12:00:00Z';
const _sdkVersion = '37';
const _deviceModel = 'Pixel6';

String _python() => Platform.isWindows ? 'python' : 'python3';

/// PATH list separator: ':' on POSIX (Linux/macOS), ';' on Windows. Distinct
/// from `Platform.pathSeparator` ('/' or '\'), which separates components
/// within a single path and is not valid between PATH entries.
final String _pathListSeparator = Platform.isWindows ? ';' : ':';

Directory _tmp(String prefix) {
  final dir = Directory.systemTemp.createTempSync('evidence-$prefix-');
  addTearDown(() => dir.deleteSync(recursive: true));
  return dir;
}

File _apk(Directory tmp, {List<int>? bytes}) {
  final apk = File('${tmp.path}/app.apk');
  apk.writeAsBytesSync(bytes ?? [0x01, 0x02, 0x03, 0x04]);
  return apk;
}

Future<ProcessResult> _write(
  Directory tmp, {
  required File apk,
  String? output,
  String? sourceCommitSha,
  String? sourceFingerprint,
  String? sdkVersion,
  String? deviceModel,
  String? viewportWidth,
  String? viewportHeight,
  String? timestamp,
}) {
  return Process.run(
      _python(),
      [
        _script,
        'write',
        '--source-commit-sha',
        sourceCommitSha ?? _sha1,
        '--source-fingerprint',
        sourceFingerprint ?? _sha256,
        '--sdk-version',
        sdkVersion ?? _sdkVersion,
        '--device-model',
        deviceModel ?? _deviceModel,
        '--viewport-width',
        viewportWidth ?? '1080',
        '--viewport-height',
        viewportHeight ?? '2400',
        '--timestamp',
        timestamp ?? _timestamp,
        '--apk-path',
        apk.path,
        '--output',
        output ?? '${tmp.path}/runtime.sidecar.json',
      ],
      workingDirectory: Directory.current.path);
}

Future<ProcessResult> _validate(
  Directory tmp, {
  required File apk,
  required String sidecarPath,
  String? actualSourceCommitSha,
  String? actualSourceFingerprint,
  String? actualSdkVersion,
  String? actualDeviceModel,
  String? actualViewportWidth,
  String? actualViewportHeight,
}) {
  return Process.run(
      _python(),
      [
        _script,
        'validate',
        '--sidecar',
        sidecarPath,
        '--actual-source-commit-sha',
        actualSourceCommitSha ?? _sha1,
        '--actual-source-fingerprint',
        actualSourceFingerprint ?? _sha256,
        '--actual-sdk-version',
        actualSdkVersion ?? _sdkVersion,
        '--actual-device-model',
        actualDeviceModel ?? _deviceModel,
        '--actual-viewport-width',
        actualViewportWidth ?? '1080',
        '--actual-viewport-height',
        actualViewportHeight ?? '2400',
        '--apk-path',
        apk.path,
      ],
      workingDirectory: Directory.current.path);
}

Map<String, dynamic> _readJson(String path) =>
    jsonDecode(File(path).readAsStringSync()) as Map<String, dynamic>;

void _writeJson(String path, Map<String, dynamic> map) =>
    File(path).writeAsStringSync(jsonEncode(map));

Future<String> _produceSidecar(Directory tmp, File apk) async {
  final path = '${tmp.path}/runtime.sidecar.json';
  final result = await _write(tmp, apk: apk, output: path);
  expect(result.exitCode, 0, reason: '${result.stderr}\n${result.stdout}');
  return path;
}

void _expectRejected(ProcessResult result, String messagePart) {
  expect(result.exitCode, isNot(0),
      reason: 'expected failure, got stdout=${result.stdout}');
  final stderr = result.stderr as String;
  expect('$stderr\n${result.stdout}', contains(messagePart));
  expect(stderr, isNot(contains('Traceback')));
}

const _gateScript = 'tool/runtime_evidence/run_cuttlefish_gate.sh';
const _apkRelativePath = 'build/app/outputs/flutter-apk/app-debug.apk';

// Tracked-source fixtures: the gate fingerprints the on-disk worktree bytes of
// every tracked file, so the fixture must contain real files whose bytes
// define the expected fingerprint. The blob field of each NUL-delimited
// `git ls-files -s -z` record below is deliberately a placeholder: the gate
// replaces it with a fresh `git hash-object -- <path>` of the worktree file on
// disk, so a tracked file edited without staging changes the fingerprint. The
// fixture deliberately exercises hostile pathnames -- a space, non-ASCII text,
// a tab, and a filename with an embedded newline -- which line-oriented parsing
// would mangle and the NUL-safe gate must round-trip byte-exactly.
const _trackedFixtureFiles = <String, String>{
  'lib/main.dart': 'void main() {}\n',
  'pubspec.yaml': 'name: calorix\n',
  'assets/meal plan.txt': 'breakfast: oats\n',
  'assets/café menu.txt': 'espresso\n',
  'assets/tab\tname.txt': 'tabul at\n',
  'lib/odd\nname.txt': 'surprise\n',
};

const _defaultLsFiles =
    '100644 1111111111111111111111111111111111111111 0\tlib/main.dart\u0000'
    '100644 2222222222222222222222222222222222222222 0\tpubspec.yaml\u0000'
    '100644 3333333333333333333333333333333333333333 0\t'
    'assets/meal plan.txt\u0000'
    '100644 4444444444444444444444444444444444444444 0\t'
    'assets/café menu.txt\u0000'
    '100644 6666666666666666666666666666666666666666 0\t'
    'assets/tab\tname.txt\u0000'
    '100644 5555555555555555555555555555555555555555 0\tlib/odd\nname.txt\u0000';
const _changedLsFiles =
    '100644 1111111111111111111111111111111111111111 0\tlib/main.dart\u0000'
    '100644 2222222222222222222222222222222222222222 0\tpubspec.yaml\u0000'
    '100644 3333333333333333333333333333333333333333 0\t'
    'assets/meal plan.txt\u0000'
    '100644 4444444444444444444444444444444444444444 0\t'
    'assets/café menu.txt\u0000'
    '100644 6666666666666666666666666666666666666666 0\t'
    'assets/tab\tname.txt\u0000'
    '100644 5555555555555555555555555555555555555555 0\tlib/odd\nname.txt\u0000'
    '100644 7777777777777777777777777777777777777777 0\t'
    'lib/new_feature.dart\u0000';

/// Derives the expected tracked-worktree fingerprint for a NUL-delimited
/// `git ls-files -s -z` listing against a fixture root, mirroring the fake
/// git's surrogate: per tracked file, "<index-mode> <sha1-of-raw-bytes>\t<path>"
/// (plain SHA-1 of the on-disk bytes -- same surrogate hash the fake emits, not
/// git's framed blob hash), or "<index-mode> missing\t<path>" when the file is
/// absent. Each record is split at the first tab so a path holding further
/// tabs or newlines survives intact; records are sorted, joined with NULs,
/// terminated with a trailing NUL, then SHA-256'd -- the exact byte stream the
/// gate hashes after `LC_ALL=C sort -z`. It is derived from fixture bytes --
/// never copied from production output -- so a bug that backtracks to the stale
/// index blob would be caught.
String _expectedFingerprint(Directory root, String lsFiles) {
  final lines = <String>[];
  for (final record in lsFiles.split('\u0000')) {
    if (record.isEmpty) continue;
    assert(record.contains('\t'),
        'nonempty ls-files record must have a tab before path split: $record');
    // Split at the FIRST tab only: a tracked path may itself contain a tab, so
    // a `.split('\t').last` tail-split would silently truncate the path and
    // mis-derive the fingerprint.
    final tab = record.indexOf('\t');
    final meta = record.substring(0, tab);
    final path = record.substring(tab + 1);
    final mode = meta.split(' ').first;
    final file = File('${root.path}/$path');
    final blob = file.existsSync()
        ? sha1.convert(file.readAsBytesSync()).toString()
        : 'missing';
    lines.add('$mode $blob\t$path');
  }
  lines.sort();
  return sha256
      .convert(utf8.encode('${lines.join('\u0000')}\u0000'))
      .toString();
}

/// Deterministic 33-byte PNG prefix: the 8-byte signature, an "IHDR" chunk
/// header (length 13, width/height big-endian, bit depth 8, color type 2,
/// compression/filter/interlace 0) and an unchecked CRC. The gate only
/// validates the header, so a full pixel payload is unnecessary.
List<int> _pngHeader(int width, int height) => [
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
      0x00, 0x00, 0x00, 0x0d, // IHDR chunk length = 13
      0x49, 0x48, 0x44, 0x52, // "IHDR"
      (width >> 24) & 0xff, (width >> 16) & 0xff, (width >> 8) & 0xff,
      width & 0xff,
      (height >> 24) & 0xff, (height >> 16) & 0xff, (height >> 8) & 0xff,
      height & 0xff,
      0x08, 0x02, 0x00, 0x00, 0x00, // bit depth 8, color type 2, 0, 0, 0
      0x00, 0x00, 0x00, 0x00, // CRC (not validated by the gate)
    ];

final List<int> _pngBytes = _pngHeader(720, 1280);
const _logcatBytes = 'fake logcat output\n';

// Three HEAD observations: pre-build (1st call), post-build (2nd), validation
// (3rd) -- mirroring the gate's three git rev-parse invocations.
const _fakeGit = r'''
#!/usr/bin/env bash
set -euo pipefail
state="${GATE_FAKE_STATE:?}"
case "${1:-}" in
  rev-parse)
    f="$state/git.revparse.n"; n=0
    [[ -f "$f" ]] && n="$(cat "$f")"
    echo $((n + 1)) > "$f"
    case "$n" in
      0) cat "$state/head.first";;
      1) cat "$state/head.second";;
      *) cat "$state/head.third";;
    esac
    ;;
  ls-files)
    f="$state/git.lsfiles.n"; n=0
    [[ -f "$f" ]] && n="$(cat "$f")"
    echo $((n + 1)) > "$f"
    if [[ -f "$state/ls-files.fail" ]]; then
      cat "$state/ls-files.fail" >&2
      exit 1
    fi
    if [[ "$n" -eq 0 ]]; then cat "$state/ls.files.first"; else cat "$state/ls.files.second"; fi
    ;;
  hash-object)
    if [[ -f "$state/hash.fail" ]]; then
      cat "$state/hash.fail" >&2
      exit 1
    fi
    # Deterministic surrogate content hash (SHA-1 of the raw on-disk bytes via
    # sha1sum). Deliberately NOT byte-identical to real `git hash-object --`
    # which hashes the framed blob ("blob <size>\0" prefix), but any byte
    # change in the worktree changes this hash, so the unstaged-edit regression
    # holds. The file is hashed via stdin so hostile filenames (spaces, tabs,
    # non-ASCII, embedded newlines) never leak into the digest and never get
    # C-escaped by sha1sum. Runs with cwd = the repo root, like the real gate's
    # invocation.
    sha1sum < "${3:?}" | cut -d' ' -f1
    ;;
esac
''';

const _fakeFvm = r'''
#!/usr/bin/env bash
set -euo pipefail
state="${GATE_FAKE_STATE:?}"
case "${2:-}" in
  build)
    # Always emit the canonical Flutter APK output, matching production
    # `fvm flutter build apk --debug --target <integration test>`. The target
    # changes which Dart entrypoint Gradle compiles into the APK but never the
    # canonical output path. GATE_FAKE_APK is deliberately NOT honored: when
    # the gate needs a different --apk path it must copy the canonical artifact
    # itself, exactly like the real gate.
    apk='build/app/outputs/flutter-apk/app-debug.apk'
    if [[ -f "$state/build.nooutput" ]]; then
      # A build that reports success but produces no canonical output: the gate
      # must already have removed pre-created stale APKs, and its freshness
      # assertion must then fail before any copy, VM boot, drive, or metadata.
      exit 0
    fi
    if [[ -f "$state/build.fail" ]]; then
      cat "$state/build.fail" >&2
      exit 1
    fi
    if [[ -f "$state/build.mutate.tracked" ]]; then
      # Simulate a build that edits a tracked source file without staging it:
      # the fake git's tracked-file list and index stay unchanged.
      printf '\n// unstaged worktree edit\n' >> 'lib/main.dart'
    fi
    mkdir -p "$(dirname "$apk")"
    if [[ -f "$state/apk.content" ]]; then
      cp "$state/apk.content" "$apk"
    else
      printf 'FAKE-APK-0123456789\n' > "$apk"
    fi
    ;;
  drive)
    # flutter drive owns installation of --use-application-binary; the gate
    # must never shell out to `android-vm adb install`. The APK path is read
    # from the --use-application-binary= argument (the exact path the gate
    # hashed), and a distinct drive.fail or drive.mutate state changes the
    # drive outcome independently of the build.
    apk=
    for arg in "$@"; do
      case "$arg" in
        --use-application-binary=*) apk="${arg#--use-application-binary=}" ;;
      esac
    done
    if [[ -f "$state/drive.fail" ]]; then
      cat "$state/drive.fail" >&2
      exit 1
    fi
    if [[ -n "${apk}" && -f "$state/drive.mutate" ]]; then
      # Simulate the test run rewriting the installed binary on disk: the
      # gate's post-drive re-hash must then fail before any metadata write.
      printf 'MUTATED\n' >> "$apk"
    fi
    ;;
esac
''';

const _fakeAndroidVm = r'''
#!/usr/bin/env bash
set -euo pipefail
state="${GATE_FAKE_STATE:?}"
case "${1:-}" in
  start) echo "android-vm: started" ;;
  wait) echo "android-vm: boot completed" ;;
  stop) echo "android-vm: stopped" ;;
  adb)
    shift
    case "${1:-}" in
      shell)
        shift
        case "${1:-}" in
          getprop) cat "$state/getprop.${2:-}" ;;
          wm) cat "$state/wm.size" ;;
        esac
        ;;
      exec-out) cat "$state/screenshot.png" ;;
      logcat) cat "$state/logcat.txt" ;;
    esac
    ;;
esac
''';

class _GateResult {
  _GateResult(this.result, this.log);
  final ProcessResult result;
  final List<String> log;
}

/// Shared hermetic fixture: a temp fake repo root, fake executables on a
/// private PATH, and state the fakes read/record. No cross-test mutable state.
class _GateFixture {
  _GateFixture() {
    root = Directory.systemTemp.createTempSync('gate-fixture-');
    addTearDown(() => root.deleteSync(recursive: true));
    bin = Directory('${root.path}/fakebin')..createSync();
    state = Directory('${root.path}/state')..createSync();
    for (final entry in _trackedFixtureFiles.entries) {
      final file = File('${root.path}/${entry.key}');
      file.parent.createSync(recursive: true);
      file.writeAsStringSync(entry.value);
    }
    writeState('head.first', _sha1);
    writeState('head.second', _sha1);
    writeState('head.third', _sha1);
    writeState('ls.files.first', _defaultLsFiles);
    writeState('ls.files.second', _defaultLsFiles);
    writeState('getprop.ro.build.version.sdk', _sdkVersion);
    writeState('getprop.ro.product.model', _deviceModel);
    writeState('wm.size', 'Physical size: 720x1280');
    writeStateBytes('screenshot.png', _pngBytes);
    writeState('logcat.txt', _logcatBytes);
    _writeFake('git', _fakeGit);
    _writeFake('fvm', _fakeFvm);
    _writeFake('android-vm', _fakeAndroidVm);
  }

  late final Directory root;
  late final Directory bin;
  late final Directory state;

  void writeState(String name, String content) =>
      File('${state.path}/$name').writeAsStringSync(content);

  void writeStateBytes(String name, List<int> bytes) =>
      File('${state.path}/$name').writeAsBytesSync(bytes);

  void _writeFake(String name, String script) {
    final file = File('${bin.path}/$name');
    file.writeAsStringSync(script);
    // Mark the fixture executable with chmod(1). This is POSIX-only and the
    // bash gate group targets the Linux host/CI, so no Windows path is
    // assumed. We assert the chmod actually succeeded so a permission
    // regression surfaces loudly.
    final chmod = Process.runSync('/bin/chmod', ['+x', file.path]);
    expect(chmod.exitCode, 0,
        reason: '/bin/chmod failed for $name:\n${chmod.stderr}');
  }

  Map<String, String> get env => {
        'GATE_FAKE_STATE': state.path,
        'PATH':
            '${bin.path}$_pathListSeparator${Platform.environment['PATH'] ?? ''}',
      };
}

Future<_GateResult> _runGate(
  _GateFixture fixture, {
  List<String> args = const [],
  Map<String, String> extraEnv = const {},
}) async {
  final result = await Process.run(
    'bash',
    [
      _gateScript,
      '--root',
      fixture.root.path,
      '--output-dir',
      'evidence',
      ...args,
    ],
    workingDirectory: Directory.current.path,
    environment: <String, String>{
      ...Platform.environment,
      ...fixture.env,
      ...extraEnv,
    },
  );
  final logPath = '${fixture.root.path}/evidence/commands.log';
  final log =
      File(logPath).existsSync() ? File(logPath).readAsLinesSync() : <String>[];
  return _GateResult(result, log);
}

/// Maps a logged command line to a stable label so tests can assert the exact
/// ordered sequence. Any unexpected line surfaces as `other:<line>`.
String _classifyGateLine(String line) {
  if (line.contains('write_metadata.py write')) return 'write';
  if (line.contains('write_metadata.py validate')) return 'validate';
  if (line.startsWith('git rev-parse HEAD')) return 'git-sha';
  if (line.startsWith('git ls-files')) return 'git-fingerprint';
  if (line.startsWith('cp ')) return 'apk-copy';
  if (line.startsWith('fvm flutter build')) return 'build';
  if (line.startsWith('fvm flutter drive')) return 'e2e-drive';
  if (line.startsWith('sha256sum')) return 'apk-hash';
  if (line.startsWith('android-vm start')) return 'vm-start';
  if (line.startsWith('android-vm wait')) return 'vm-wait';
  if (line.startsWith('android-vm adb shell getprop ro.build.version.sdk')) {
    return 'sdk';
  }
  if (line.startsWith('android-vm adb shell getprop ro.product.model')) {
    return 'model';
  }
  if (line.startsWith('android-vm adb shell wm size')) return 'wm';
  if (line.startsWith('android-vm adb exec-out screencap')) return 'screencap';
  if (line.startsWith('python3')) return 'png-validate';
  if (line.startsWith('android-vm adb logcat')) return 'logcat';
  if (line.startsWith('android-vm stop')) return 'vm-stop';
  if (line.startsWith('rm -f ')) return 'apk-remove';
  return 'other:$line';
}

void main() {
  group('write', () {
    test('produces sidecar with all required keys and computed apkSha256',
        () async {
      final tmp = _tmp('write-basic');
      final apk = _apk(tmp);

      final result = await _write(tmp, apk: apk);
      expect(result.exitCode, 0, reason: '${result.stderr}\n${result.stdout}');

      final sidecar = _readJson('${tmp.path}/runtime.sidecar.json');
      expect(
        sidecar.keys.toSet(),
        equals({
          'sourceCommitSha',
          'sourceFingerprint',
          'apkSha256',
          'sdkVersion',
          'deviceModel',
          'viewportDimensions',
          'timestamp',
          'staleBuildFingerprint',
        }),
      );
      expect(sidecar['sourceCommitSha'], _sha1);
      expect(sidecar['sourceFingerprint'], _sha256);
      expect(sidecar['apkSha256'],
          sha256.convert(apk.readAsBytesSync()).toString());
      expect(sidecar['sdkVersion'], _sdkVersion);
      expect(sidecar['deviceModel'], _deviceModel);
      expect(sidecar['viewportDimensions'], {'width': 1080, 'height': 2400});
      expect(sidecar['timestamp'], _timestamp);
      expect(sidecar['staleBuildFingerprint'], false);
    });

    test('creates missing parent directories for the requested output path',
        () async {
      final tmp = _tmp('write-parents');
      final apk = _apk(tmp);
      final out = '${tmp.path}/nested/dir/to/runtime.sidecar.json';

      final result = await _write(tmp, apk: apk, output: out);
      expect(result.exitCode, 0, reason: '${result.stderr}\n${result.stdout}');
      expect(File(out).existsSync(), isTrue);
      expect(Directory('${tmp.path}/nested/dir/to').existsSync(), isTrue);
    });

    test('rejects a source commit that is not a 40-hex SHA-1', () async {
      final tmp = _tmp('write-sha1');
      final apk = _apk(tmp);

      final tooLong = await _write(tmp,
          apk: apk,
          output: '${tmp.path}/too-long.json',
          sourceCommitSha: _sha256);
      _expectRejected(tooLong, 'sourceCommitSha');
      expect((tooLong.stderr as String), contains('40 hex chars'));

      final notHex = await _write(tmp,
          apk: apk,
          output: '${tmp.path}/not-hex.json',
          sourceCommitSha: 'z' * 40);
      _expectRejected(notHex, 'sourceCommitSha');
    }, timeout: _multiProcessTimeout);

    test('rejects an invalid source fingerprint format', () async {
      final tmp = _tmp('write-fp');
      final apk = _apk(tmp);

      final short = await _write(tmp,
          apk: apk, output: '${tmp.path}/short.json', sourceFingerprint: _sha1);
      _expectRejected(short, 'sourceFingerprint');
      expect((short.stderr as String), contains('64 hex chars'));

      final notHex = await _write(tmp,
          apk: apk,
          output: '${tmp.path}/not-hex.json',
          sourceFingerprint: _sha256.replaceAll('a', 'z'));
      _expectRejected(notHex, 'sourceFingerprint');
    }, timeout: _multiProcessTimeout);

    test('rejects an invalid UTC timestamp', () async {
      final tmp = _tmp('write-ts');
      final apk = _apk(tmp);

      final noZ = await _write(tmp,
          apk: apk,
          output: '${tmp.path}/no-z.json',
          timestamp: '2026-08-14T12:00:00');
      _expectRejected(noZ, 'timestamp');
      expect((noZ.stderr as String), contains('UTC'));

      final garbage = await _write(tmp,
          apk: apk,
          output: '${tmp.path}/garbage.json',
          timestamp: 'not-a-time');
      _expectRejected(garbage, 'timestamp');
    }, timeout: _multiProcessTimeout);

    test('rejects empty sdkVersion and deviceModel', () async {
      final tmp = _tmp('write-empty');
      final apk = _apk(tmp);

      final emptySdk = await _write(tmp,
          apk: apk, output: '${tmp.path}/empty-sdk.json', sdkVersion: '');
      _expectRejected(emptySdk, 'sdkVersion');
      expect((emptySdk.stderr as String), contains('non-empty'));

      final emptyModel = await _write(tmp,
          apk: apk, output: '${tmp.path}/empty-model.json', deviceModel: '');
      _expectRejected(emptyModel, 'deviceModel');
    }, timeout: _multiProcessTimeout);

    test('rejects non-positive and non-integer viewport dimensions', () async {
      final tmp = _tmp('write-dims');
      final apk = _apk(tmp);

      for (final width in ['0', '-1080', 'abc']) {
        final result = await _write(tmp,
            apk: apk,
            output: '${tmp.path}/w-$width.json',
            viewportWidth: width);
        _expectRejected(result, 'viewportWidth');
      }
      for (final height in ['0', '-2400', '12.5']) {
        final result = await _write(tmp,
            apk: apk,
            output: '${tmp.path}/h-$height.json',
            viewportHeight: height);
        _expectRejected(result, 'viewportHeight');
      }
    }, timeout: _multiProcessTimeout);

    test('rejects a missing APK file', () async {
      final tmp = _tmp('write-missing-apk');
      final result = await _write(tmp, apk: File('${tmp.path}/missing.apk'));
      _expectRejected(result, 'APK not found');
    });
  });

  group('write then validate', () {
    test('roundtrips a valid sidecar', () async {
      final tmp = _tmp('write-roundtrip');
      final apk = _apk(tmp);
      final path = await _produceSidecar(tmp, apk);

      final result = await _validate(tmp, apk: apk, sidecarPath: path);
      expect(result.exitCode, 0, reason: '${result.stderr}\n${result.stdout}');
    }, timeout: _multiProcessTimeout);
  });

  group('validate rejects independent fact mismatches', () {
    test('stale true', () async {
      final tmp = _tmp('mismatch-stale');
      final apk = _apk(tmp);
      final path = await _produceSidecar(tmp, apk);
      final sidecar = _readJson(path);
      sidecar['staleBuildFingerprint'] = true;
      _writeJson(path, sidecar);

      final result = await _validate(tmp, apk: apk, sidecarPath: path);
      _expectRejected(result, 'staleBuildFingerprint');
    }, timeout: _multiProcessTimeout);

    test('source commit SHA mismatch', () async {
      final tmp = _tmp('mismatch-sha');
      final apk = _apk(tmp);
      final path = await _produceSidecar(tmp, apk);

      final result = await _validate(tmp,
          apk: apk, sidecarPath: path, actualSourceCommitSha: _wrongSha1);
      _expectRejected(result, 'sourceCommitSha');
    }, timeout: _multiProcessTimeout);

    test('source fingerprint mismatch', () async {
      final tmp = _tmp('mismatch-fp');
      final apk = _apk(tmp);
      final path = await _produceSidecar(tmp, apk);

      final result = await _validate(tmp,
          apk: apk, sidecarPath: path, actualSourceFingerprint: _wrongSha256);
      _expectRejected(result, 'sourceFingerprint');
    }, timeout: _multiProcessTimeout);

    test('APK hash mismatch', () async {
      final tmp = _tmp('mismatch-apk');
      final apk = _apk(tmp);
      final path = await _produceSidecar(tmp, apk);
      final sidecar = _readJson(path);
      sidecar['apkSha256'] = _wrongSha256;
      _writeJson(path, sidecar);

      final result = await _validate(tmp, apk: apk, sidecarPath: path);
      _expectRejected(result, 'apkSha256');
    }, timeout: _multiProcessTimeout);

    test('SDK version mismatch', () async {
      final tmp = _tmp('mismatch-sdk');
      final apk = _apk(tmp);
      final path = await _produceSidecar(tmp, apk);

      final result = await _validate(tmp,
          apk: apk, sidecarPath: path, actualSdkVersion: '36');
      _expectRejected(result, 'sdkVersion');
    }, timeout: _multiProcessTimeout);

    test('device model mismatch', () async {
      final tmp = _tmp('mismatch-model');
      final apk = _apk(tmp);
      final path = await _produceSidecar(tmp, apk);

      final result = await _validate(tmp,
          apk: apk, sidecarPath: path, actualDeviceModel: 'SM-G780G');
      _expectRejected(result, 'deviceModel');
    }, timeout: _multiProcessTimeout);

    test('viewport width mismatch', () async {
      final tmp = _tmp('mismatch-width');
      final apk = _apk(tmp);
      final path = await _produceSidecar(tmp, apk);

      final result = await _validate(tmp,
          apk: apk, sidecarPath: path, actualViewportWidth: '1200');
      _expectRejected(result, 'viewport');
    }, timeout: _multiProcessTimeout);

    test('viewport height mismatch', () async {
      final tmp = _tmp('mismatch-height');
      final apk = _apk(tmp);
      final path = await _produceSidecar(tmp, apk);

      final result = await _validate(tmp,
          apk: apk, sidecarPath: path, actualViewportHeight: '2200');
      _expectRejected(result, 'viewport');
    }, timeout: _multiProcessTimeout);
  });

  group('validate rejects structural problems', () {
    test('missing top-level key', () async {
      final tmp = _tmp('missing-key');
      final apk = _apk(tmp);
      final path = await _produceSidecar(tmp, apk);
      final sidecar = _readJson(path);
      sidecar.remove('deviceModel');
      _writeJson(path, sidecar);

      final result = await _validate(tmp, apk: apk, sidecarPath: path);
      _expectRejected(result, 'Missing keys');
    }, timeout: _multiProcessTimeout);

    test('extra top-level key', () async {
      final tmp = _tmp('extra-key');
      final apk = _apk(tmp);
      final path = await _produceSidecar(tmp, apk);
      final sidecar = _readJson(path);
      sidecar['unexpectedField'] = 'oops';
      _writeJson(path, sidecar);

      final result = await _validate(tmp, apk: apk, sidecarPath: path);
      _expectRejected(result, 'unexpectedField');
    }, timeout: _multiProcessTimeout);

    test('malformed JSON', () async {
      final tmp = _tmp('malformed');
      final path = '${tmp.path}/bad.sidecar.json';
      File(path).writeAsStringSync('{not valid json');

      final result = await _validate(tmp,
          apk: File('${tmp.path}/unused.apk'), sidecarPath: path);
      _expectRejected(result, 'Malformed JSON');
    });

    test('non-object JSON', () async {
      final tmp = _tmp('non-object');
      final path = '${tmp.path}/array.sidecar.json';
      File(path).writeAsStringSync('[1, 2, 3]');

      final result = await _validate(tmp,
          apk: File('${tmp.path}/unused.apk'), sidecarPath: path);
      _expectRejected(result, 'JSON object');
    });
  });

  group('validate rejects invalid content formats', () {
    test('invalid source commit SHA format in sidecar', () async {
      final tmp = _tmp('format-sha');
      final apk = _apk(tmp);
      final path = await _produceSidecar(tmp, apk);
      final sidecar = _readJson(path);
      sidecar['sourceCommitSha'] = _sha256;
      _writeJson(path, sidecar);

      final result = await _validate(tmp, apk: apk, sidecarPath: path);
      _expectRejected(result, 'sourceCommitSha');
    }, timeout: _multiProcessTimeout);

    test('invalid source fingerprint format in sidecar', () async {
      final tmp = _tmp('format-fp');
      final apk = _apk(tmp);
      final path = await _produceSidecar(tmp, apk);
      final sidecar = _readJson(path);
      sidecar['sourceFingerprint'] = _sha1;
      _writeJson(path, sidecar);

      final result = await _validate(tmp, apk: apk, sidecarPath: path);
      _expectRejected(result, 'sourceFingerprint');
    }, timeout: _multiProcessTimeout);

    test('invalid apkSha256 format in sidecar', () async {
      final tmp = _tmp('format-apk');
      final apk = _apk(tmp);
      final path = await _produceSidecar(tmp, apk);
      final sidecar = _readJson(path);
      sidecar['apkSha256'] = _sha1;
      _writeJson(path, sidecar);

      final result = await _validate(tmp, apk: apk, sidecarPath: path);
      _expectRejected(result, 'apkSha256');
    }, timeout: _multiProcessTimeout);

    test('invalid UTC timestamp in sidecar', () async {
      final tmp = _tmp('format-ts');
      final apk = _apk(tmp);
      final path = await _produceSidecar(tmp, apk);
      final sidecar = _readJson(path);
      sidecar['timestamp'] = '2026-08-14T12:00:00+02:00';
      _writeJson(path, sidecar);

      final result = await _validate(tmp, apk: apk, sidecarPath: path);
      _expectRejected(result, 'timestamp');
    }, timeout: _multiProcessTimeout);
  });

  group('validate rejects sidecar contract violations', () {
    test('empty sdkVersion and deviceModel in sidecar', () async {
      final tmp = _tmp('empty-content');
      final apk = _apk(tmp);

      final sdkPath = await _produceSidecar(tmp, apk);
      final emptySdk = _readJson(sdkPath);
      emptySdk['sdkVersion'] = '';
      _writeJson(sdkPath, emptySdk);
      _expectRejected(
          await _validate(tmp, apk: apk, sidecarPath: sdkPath), 'sdkVersion');

      final modelPath = await _produceSidecar(tmp, apk);
      final emptyModel = _readJson(modelPath);
      emptyModel['deviceModel'] = '';
      _writeJson(modelPath, emptyModel);
      _expectRejected(await _validate(tmp, apk: apk, sidecarPath: modelPath),
          'deviceModel');
    }, timeout: _multiProcessTimeout);

    test('malformed viewportDimensions in sidecar', () async {
      final tmp = _tmp('viewport-bad');
      final apk = _apk(tmp);
      final path = await _produceSidecar(tmp, apk);

      final variants = <Object>[
        {'width': 1080, 'height': 2400, 'extra': 1},
        {'width': 1080},
        {'width': '1080', 'height': 2400},
        {'width': true, 'height': 2400},
        {'width': 0, 'height': 2400},
        {'width': 1080, 'height': -5},
        [], // not an object at all
      ];
      for (final variant in variants) {
        final sidecar = _readJson(path);
        sidecar['viewportDimensions'] = variant;
        _writeJson(path, sidecar);
        final result = await _validate(tmp, apk: apk, sidecarPath: path);
        _expectRejected(result, 'viewportDimensions');
      }
    }, timeout: _multiProcessTimeout);

    test('bad supplied actual values produce concise errors', () async {
      final tmp = _tmp('bad-actuals');
      final apk = _apk(tmp);
      final path = await _produceSidecar(tmp, apk);

      final badWidth = await _validate(tmp,
          apk: apk, sidecarPath: path, actualViewportWidth: 'abc');
      _expectRejected(badWidth, 'actualViewportWidth');

      final badHeight = await _validate(tmp,
          apk: apk, sidecarPath: path, actualViewportHeight: '-1');
      _expectRejected(badHeight, 'actualViewportHeight');
    }, timeout: _multiProcessTimeout);

    test('missing APK file', () async {
      final tmp = _tmp('missing-apk');
      final apk = _apk(tmp);
      final path = await _produceSidecar(tmp, apk);

      final result = await _validate(tmp,
          apk: File('${tmp.path}/not-installed.apk'), sidecarPath: path);
      _expectRejected(result, 'APK not found');
    }, timeout: _multiProcessTimeout);
  });

  group('run_cuttlefish_gate.sh hermetic gate', () {
    // The exact build and drive commands the gate must issue. The drive command
    // references the standard test_driver/integration_test.dart driver, passes
    // --use-application-binary=<the exact APK path that is hashed> and
    // --no-build (drive owns install of the prebuilt binary), and keeps the app
    // running so flutter drive remains attached to the launched app.
    const buildCommand =
        'fvm flutter build apk --debug --target integration_test/e2e/e2e_matrix_test.dart';

    String driveCommand(String apk) =>
        'fvm flutter drive --driver=test_driver/integration_test.dart '
        '--target=integration_test/e2e/e2e_matrix_test.dart '
        '-d 0.0.0.0:6520 '
        '--use-application-binary=$apk '
        '--no-build --keep-app-running';

    const happyOrder = [
      'git-sha',
      'git-fingerprint',
      'build',
      'git-sha',
      'git-fingerprint',
      'apk-hash',
      'vm-start',
      'vm-wait',
      'e2e-drive',
      'sdk',
      'model',
      'wm',
      'screencap',
      'png-validate',
      'logcat',
      'apk-hash',
      'write',
      'git-sha',
      'git-fingerprint',
      'validate',
      'vm-stop',
    ];

    // A custom --apk run is the happy path (from the gate's perspective) plus
    // one apk-copy step, inserted right after the build and before the
    // post-build source checks / APK hashing / VM work.
    const customHappyOrder = [
      'git-sha',
      'git-fingerprint',
      'build',
      'apk-copy',
      'git-sha',
      'git-fingerprint',
      'apk-hash',
      'vm-start',
      'vm-wait',
      'e2e-drive',
      'sdk',
      'model',
      'wm',
      'screencap',
      'png-validate',
      'logcat',
      'apk-hash',
      'write',
      'git-sha',
      'git-fingerprint',
      'validate',
      'vm-stop',
    ];

    List<String> classes(_GateResult gate) =>
        gate.log.map(_classifyGateLine).toList();

    test('happy path: exact command order, artifacts, sidecar, guaranteed stop',
        () async {
      final fixture = _GateFixture();
      final gate = await _runGate(fixture);

      expect(gate.result.exitCode, 0,
          reason: '${gate.result.stderr}\n${gate.result.stdout}');
      expect(classes(gate), happyOrder);
      expect(gate.log.last, 'android-vm stop');

      // The build targets the e2e matrix entrypoint, so the compiled APK is
      // the instrumented integration-test binary.
      expect(gate.log, contains(buildCommand));
      // The drive command owns installation of the exact hashed APK; there is
      // no manual `android-vm adb install`.
      expect(gate.log, contains(driveCommand(_apkRelativePath)));
      expect(gate.log, isNot(contains('android-vm adb install')));

      final out = '${fixture.root.path}/evidence';
      expect(File('$out/cuttlefish_evidence.png').readAsBytesSync(), _pngBytes);
      expect(File('$out/logcat.txt').readAsStringSync(), _logcatBytes);

      final apk = File('${fixture.root.path}/$_apkRelativePath');
      expect(apk.existsSync(), isTrue);

      final sidecar = _readJson('$out/runtime.sidecar.json');
      expect(
        sidecar.keys.toSet(),
        equals({
          'sourceCommitSha',
          'sourceFingerprint',
          'apkSha256',
          'sdkVersion',
          'deviceModel',
          'viewportDimensions',
          'timestamp',
          'staleBuildFingerprint',
        }),
      );
      expect(sidecar['sourceCommitSha'], _sha1);
      // The hostile tracked filenames (space, non-ASCII, tab, embedded newline)
      // must exist on disk; if the fingerprint derivation or the NUL-safe
      // pipeline mishandles them, the independently derived value below will
      // not equal the gate's recorded fingerprint.
      expect(File('${fixture.root.path}/assets/meal plan.txt').existsSync(),
          isTrue);
      expect(File('${fixture.root.path}/assets/café menu.txt').existsSync(),
          isTrue);
      expect(File('${fixture.root.path}/assets/tab\tname.txt').existsSync(),
          isTrue);
      expect(
          File('${fixture.root.path}/lib/odd\nname.txt').existsSync(), isTrue);
      expect(sidecar['sourceFingerprint'],
          _expectedFingerprint(fixture.root, _defaultLsFiles));
      expect(sidecar['apkSha256'],
          sha256.convert(apk.readAsBytesSync()).toString());
      expect(sidecar['sdkVersion'], _sdkVersion);
      expect(sidecar['deviceModel'], _deviceModel);
      expect(sidecar['viewportDimensions'], {'width': 720, 'height': 1280});
      expect(sidecar['staleBuildFingerprint'], false);
      expect(sidecar['timestamp'] as String, endsWith('Z'));
    }, timeout: _multiProcessTimeout);

    test(
        'custom --apk: gate byte-copies the canonical build output, then '
        'hashes and drives the custom path', () async {
      final fixture = _GateFixture();
      final gate = await _runGate(
        fixture,
        args: ['--apk', 'custom/debug.apk'],
      );

      expect(gate.result.exitCode, 0,
          reason: '${gate.result.stderr}\n${gate.result.stdout}');
      // The fake fvm always writes the canonical Flutter output, so the gate
      // itself must stage the custom path via a byte-for-byte copy, exactly
      // like production.
      final canonical = File('${fixture.root.path}/$_apkRelativePath');
      final custom = File('${fixture.root.path}/custom/debug.apk');
      expect(canonical.existsSync(), isTrue);
      expect(custom.existsSync(), isTrue);
      expect(custom.readAsBytesSync(), equals(canonical.readAsBytesSync()));
      expect(
        gate.log,
        contains('cp $_apkRelativePath custom/debug.apk'),
      );
      // The drive command must reference the exact custom path that is hashed.
      expect(gate.log, contains(driveCommand('custom/debug.apk')));
      expect(gate.log, contains('sha256sum custom/debug.apk'));
      expect(gate.log, isNot(contains('android-vm adb install')));
      // Copy lands immediately after the build and before the post-build
      // source checks, APK hashing, VM boot, and drive.
      expect(classes(gate), customHappyOrder);

      final sidecar =
          _readJson('${fixture.root.path}/evidence/runtime.sidecar.json');
      expect(sidecar['apkSha256'],
          sha256.convert(custom.readAsBytesSync()).toString());
    }, timeout: _multiProcessTimeout);

    test('build failure propagates and still stops the VM', () async {
      final fixture = _GateFixture()
        ..writeState('build.fail', 'build exploded\n');
      final gate = await _runGate(fixture);

      expect(gate.result.exitCode, isNot(0));
      expect(gate.result.stderr, contains('build exploded'));
      expect(gate.result.stderr, contains('fvm flutter build apk failed'));
      expect(classes(gate), ['git-sha', 'git-fingerprint', 'build', 'vm-stop']);
    }, timeout: _multiProcessTimeout);

    test('drive failure propagates and still stops the VM', () async {
      final fixture = _GateFixture()
        ..writeState('drive.fail', 'e2e matrix broke\n');
      final gate = await _runGate(fixture);

      expect(gate.result.exitCode, isNot(0));
      expect(gate.result.stderr, contains('e2e matrix broke'));
      expect(gate.result.stderr, contains('integration test failed'));
      expect(classes(gate), [
        'git-sha',
        'git-fingerprint',
        'build',
        'git-sha',
        'git-fingerprint',
        'apk-hash',
        'vm-start',
        'vm-wait',
        'e2e-drive',
        'vm-stop',
      ]);
    }, timeout: _multiProcessTimeout);

    test('source changed after build fails before VM start and drive',
        () async {
      final fixture = _GateFixture()
        ..writeState('ls.files.second', _changedLsFiles);
      final gate = await _runGate(fixture);

      expect(gate.result.exitCode, isNot(0));
      expect(gate.result.stderr, contains('source changed after build'));
      expect(classes(gate), isNot(contains('vm-start')));
      expect(gate.log, isNot(contains('android-vm adb install')));
      expect(classes(gate), isNot(contains('write')));
      expect(classes(gate), [
        'git-sha',
        'git-fingerprint',
        'build',
        'git-sha',
        'git-fingerprint',
        'vm-stop',
      ]);
    }, timeout: _multiProcessTimeout);

    test(
        'unstaged tracked-file edit during build fails before VM start and drive',
        () async {
      final fixture = _GateFixture()
        ..writeState('build.mutate.tracked', 'edit');
      final gate = await _runGate(fixture);

      expect(gate.result.exitCode, isNot(0));
      expect(gate.result.stderr, contains('source changed after build'));
      expect(classes(gate), isNot(contains('vm-start')));
      expect(gate.log, isNot(contains('android-vm adb install')));
      expect(classes(gate), isNot(contains('write')));
      expect(
        classes(gate),
        [
          'git-sha',
          'git-fingerprint',
          'build',
          'git-sha',
          'git-fingerprint',
          'vm-stop'
        ],
      );
    }, timeout: _multiProcessTimeout);

    test('source commit change after build fails before VM start and drive',
        () async {
      final fixture = _GateFixture()..writeState('head.second', _wrongSha1);
      final gate = await _runGate(fixture);

      expect(gate.result.exitCode, isNot(0));
      expect(gate.result.stderr, contains('source commit changed after build'));
      expect(classes(gate), isNot(contains('vm-start')));
      expect(gate.log, isNot(contains('android-vm adb install')));
      expect(classes(gate), isNot(contains('write')));
      expect(
        classes(gate),
        ['git-sha', 'git-fingerprint', 'build', 'git-sha', 'vm-stop'],
      );
    }, timeout: _multiProcessTimeout);

    test('APK changed during drive fails before metadata write', () async {
      final fixture = _GateFixture()..writeState('drive.mutate', 'mutate');
      final gate = await _runGate(fixture);

      expect(gate.result.exitCode, isNot(0));
      expect(gate.result.stderr, contains('APK hash changed'));
      expect(classes(gate), isNot(contains('write')));
      expect(classes(gate), isNot(contains('validate')));
      expect(classes(gate).last, 'vm-stop');
    }, timeout: _multiProcessTimeout);

    test('final-validation HEAD mismatch propagates and still stops the VM',
        () async {
      final fixture = _GateFixture()..writeState('head.third', _wrongSha1);
      final gate = await _runGate(fixture);

      expect(gate.result.exitCode, isNot(0));
      expect(gate.result.stderr, contains('metadata validation failed'));
      expect(gate.result.stderr, contains('sourceCommitSha mismatch'));
      expect(classes(gate), happyOrder);
    }, timeout: _multiProcessTimeout);

    test('malformed device facts fail before screenshot or metadata', () async {
      final fixture = _GateFixture()..writeState('wm.size', 'garbage');
      final gate = await _runGate(fixture);

      expect(gate.result.exitCode, isNot(0));
      expect(gate.result.stderr, contains('cannot parse wm size'));
      expect(classes(gate), isNot(contains('screencap')));
      expect(classes(gate), isNot(contains('write')));
      expect(classes(gate), [
        'git-sha',
        'git-fingerprint',
        'build',
        'git-sha',
        'git-fingerprint',
        'apk-hash',
        'vm-start',
        'vm-wait',
        'e2e-drive',
        'sdk',
        'model',
        'wm',
        'vm-stop',
      ]);
    }, timeout: _multiProcessTimeout);

    test(
        'pre-existing stale canonical and custom APKs are removed, then a '
        'build that produces no output fails before VM start or drive',
        () async {
      final fixture = _GateFixture();
      final staleCanonical = File('${fixture.root.path}/$_apkRelativePath')
        ..createSync(recursive: true)
        ..writeAsBytesSync([0xde, 0xad, 0xbe, 0xef]);
      final staleCustom = File('${fixture.root.path}/custom/debug.apk')
        ..createSync(recursive: true)
        ..writeAsBytesSync([0xba, 0xad, 0xf0, 0x0d]);
      fixture.writeState('build.nooutput', '');

      final gate = await _runGate(fixture, args: ['--apk', 'custom/debug.apk']);

      expect(gate.result.exitCode, isNot(0),
          reason: '${gate.result.stderr}\n${gate.result.stdout}');
      expect(gate.result.stderr,
          contains('canonical Flutter build output not produced'));
      // The gate removed both stale artifacts and the no-output build did not
      // recreate them.
      expect(staleCanonical.existsSync(), isFalse);
      expect(staleCustom.existsSync(), isFalse);
      // Removals are logged and appear right before the build.
      expect(gate.log, contains('rm -f -- $_apkRelativePath'));
      expect(gate.log, contains('rm -f -- custom/debug.apk'));
      // Fails before any VM boot, drive, or metadata.
      expect(classes(gate), isNot(contains('vm-start')));
      expect(gate.log, isNot(contains('android-vm adb install')));
      expect(classes(gate), isNot(contains('write')));
      expect(classes(gate), isNot(contains('validate')));
      expect(classes(gate), [
        'git-sha',
        'git-fingerprint',
        'apk-remove',
        'apk-remove',
        'build',
        'vm-stop',
      ]);
    }, timeout: _multiProcessTimeout);

    test(
        'git ls-files enumeration failure fails before build, VM, and metadata',
        () async {
      final fixture = _GateFixture()
        ..writeState('ls-files.fail', 'git ls-files exploded\n');
      final gate = await _runGate(fixture);

      expect(gate.result.exitCode, isNot(0));
      expect(gate.result.stderr, contains('git ls-files exploded'));
      expect(gate.result.stderr, contains('pre-build source fingerprint'));
      expect(classes(gate), isNot(contains('build')));
      expect(classes(gate), isNot(contains('vm-start')));
      expect(gate.log, isNot(contains('android-vm adb install')));
      expect(classes(gate), isNot(contains('write')));
      expect(classes(gate), isNot(contains('validate')));
      expect(classes(gate), ['git-sha', 'git-fingerprint', 'vm-stop']);
    }, timeout: _multiProcessTimeout);

    test('git hash-object failure propagates before build, VM, and metadata',
        () async {
      final fixture = _GateFixture()
        ..writeState('hash.fail', 'git hash-object exploded\n');
      final gate = await _runGate(fixture);

      expect(gate.result.exitCode, isNot(0));
      expect(gate.result.stderr, contains('git hash-object failed'));
      expect(gate.result.stderr, contains('pre-build source fingerprint'));
      expect(classes(gate), isNot(contains('build')));
      expect(classes(gate), isNot(contains('vm-start')));
      expect(gate.log, isNot(contains('android-vm adb install')));
      expect(classes(gate), isNot(contains('write')));
      expect(classes(gate), isNot(contains('validate')));
      expect(classes(gate), ['git-sha', 'git-fingerprint', 'vm-stop']);
    }, timeout: _multiProcessTimeout);

    test(
        'screenshot validation rejects empty, text, truncated, and wrong-size '
        'artifacts before logcat or metadata', () async {
      final variants = <String, List<int>>{
        'empty': <int>[],
        'text': utf8.encode('adb: device offline\n'),
        'truncated': _pngHeader(720, 1280).sublist(0, 20),
        'wrong-size': _pngHeader(640, 1136),
      };
      for (final entry in variants.entries) {
        final fixture = _GateFixture();
        fixture.writeStateBytes('screenshot.png', entry.value);
        final gate = await _runGate(fixture);

        expect(gate.result.exitCode, isNot(0),
            reason: '${entry.key}: ${gate.result.stderr}');
        expect(gate.result.stderr,
            contains('screenshot failed PNG header validation'),
            reason: entry.key);
        expect(classes(gate), isNot(contains('logcat')), reason: entry.key);
        expect(classes(gate), isNot(contains('write')), reason: entry.key);
        expect(classes(gate), isNot(contains('validate')), reason: entry.key);
        expect(
          classes(gate),
          [
            'git-sha',
            'git-fingerprint',
            'build',
            'git-sha',
            'git-fingerprint',
            'apk-hash',
            'vm-start',
            'vm-wait',
            'e2e-drive',
            'sdk',
            'model',
            'wm',
            'screencap',
            'png-validate',
            'vm-stop',
          ],
          reason: entry.key,
        );
      }
    }, timeout: _multiProcessTimeout);
  });

  group('test_driver/integration_test.dart contract', () {
    test('standard integration_test driver exists and wires the driver package',
        () {
      // The gate drives the e2e matrix through the standard flutter drive
      // contract, so the committed driver must exist and hand off to
      // package:integration_test/integration_test_driver.dart.
      final driver = File('test_driver/integration_test.dart');
      expect(driver.existsSync(), isTrue,
          reason: 'test_driver/integration_test.dart must be committed');
      expect(
        driver.readAsStringSync(),
        contains('package:integration_test/integration_test_driver.dart'),
      );
    });
  });
}
