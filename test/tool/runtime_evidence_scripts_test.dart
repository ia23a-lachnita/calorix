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
const _sha256 = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
const _wrongSha256 = '2222222222222222222222222222222222222222222222222222222222222222';
const _timestamp = '2026-08-14T12:00:00Z';
const _sdkVersion = '37';
const _deviceModel = 'Pixel6';

String _python() => Platform.isWindows ? 'python' : 'python3';

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
  return Process.run(_python(), [
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
  ], workingDirectory: Directory.current.path);
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
  return Process.run(_python(), [
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
  ], workingDirectory: Directory.current.path);
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

void main() {
  group('write', () {
    test('produces sidecar with all required keys and computed apkSha256', () async {
      final tmp = _tmp('write-basic');
      final apk = _apk(tmp);

      final result = await _write(tmp, apk: apk);
      expect(result.exitCode, 0,
          reason: '${result.stderr}\n${result.stdout}');

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
      expect(result.exitCode, 0,
          reason: '${result.stderr}\n${result.stdout}');
      expect(File(out).existsSync(), isTrue);
      expect(Directory('${tmp.path}/nested/dir/to').existsSync(), isTrue);
    });

    test('rejects a source commit that is not a 40-hex SHA-1', () async {
      final tmp = _tmp('write-sha1');
      final apk = _apk(tmp);

      final tooLong = await _write(tmp,
          apk: apk, output: '${tmp.path}/too-long.json', sourceCommitSha: _sha256);
      _expectRejected(tooLong, 'sourceCommitSha');
      expect((tooLong.stderr as String), contains('40 hex chars'));

      final notHex = await _write(tmp,
          apk: apk, output: '${tmp.path}/not-hex.json', sourceCommitSha: 'z' * 40);
      _expectRejected(notHex, 'sourceCommitSha');
    }, timeout: _multiProcessTimeout);

    test('rejects an invalid source fingerprint format', () async {
      final tmp = _tmp('write-fp');
      final apk = _apk(tmp);

      final short = await _write(tmp,
          apk: apk,
          output: '${tmp.path}/short.json',
          sourceFingerprint: _sha1);
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
          apk: apk,
          output: '${tmp.path}/empty-sdk.json',
          sdkVersion: '');
      _expectRejected(emptySdk, 'sdkVersion');
      expect((emptySdk.stderr as String), contains('non-empty'));

      final emptyModel = await _write(tmp,
          apk: apk,
          output: '${tmp.path}/empty-model.json',
          deviceModel: '');
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
      expect(result.exitCode, 0,
          reason: '${result.stderr}\n${result.stdout}');
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

      final result =
          await _validate(tmp, apk: File('${tmp.path}/unused.apk'), sidecarPath: path);
      _expectRejected(result, 'Malformed JSON');
    });

    test('non-object JSON', () async {
      final tmp = _tmp('non-object');
      final path = '${tmp.path}/array.sidecar.json';
      File(path).writeAsStringSync('[1, 2, 3]');

      final result =
          await _validate(tmp, apk: File('${tmp.path}/unused.apk'), sidecarPath: path);
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
      _expectRejected(await _validate(tmp, apk: apk, sidecarPath: sdkPath),
          'sdkVersion');

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

      final badWidth =
          await _validate(tmp, apk: apk, sidecarPath: path, actualViewportWidth: 'abc');
      _expectRejected(badWidth, 'actualViewportWidth');

      final badHeight =
          await _validate(tmp, apk: apk, sidecarPath: path, actualViewportHeight: '-1');
      _expectRejected(badHeight, 'actualViewportHeight');
    }, timeout: _multiProcessTimeout);

    test('missing APK file', () async {
      final tmp = _tmp('missing-apk');
      final apk = _apk(tmp);
      final path = await _produceSidecar(tmp, apk);

      final result = await _validate(
          tmp, apk: File('${tmp.path}/not-installed.apk'), sidecarPath: path);
      _expectRejected(result, 'APK not found');
    }, timeout: _multiProcessTimeout);
  });
}