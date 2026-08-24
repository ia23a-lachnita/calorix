import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:yaml/yaml.dart';

/// Future contract test for `.github/workflows/android-test-apk.yml`.
///
/// The contract describes a manual-only intermediate Android test APK workflow
/// that must:
///
///  1. Be manual-only (`workflow_dispatch`); no `push` or `pull_request` triggers.
///  2. Run a full Verify at the same commit sha before the test APK build:
///     `verify.yml` exposes `workflow_call`, `jobs.verify` in this workflow
///     calls it via `uses: ./.github/workflows/verify.yml`, and `jobs.build`
///     declares `needs: verify`. `workflow_run` and similar patterns that
///     could execute against a stale, unrelated commit are forbidden.
///  3. Accept exactly four secrets:
///     - `FIREBASE_OPTIONS_DART_BASE64` (base64 file input)
///     - `GOOGLE_SERVICES_JSON_BASE64` (base64 file input)
///     - `TEST_DEBUG_KEYSTORE_BASE64` (base64 file input)
///     - `TEST_DEBUG_CERT_SHA256` (plain expected fingerprint)
///  4. Use the keystore at `~/.android/debug.keystore` (resolved via env or
///     the standard Android debug keystore path).
///  5. Strictly validate project `calorix-xurschnell`, package
///     `com.calorix.calorix`, app id `1:85048284883:android:d9ac439353e922ddf8a626`.
///  6. Reject placeholder values.
///  7. Run `apksigner verify --print-certs-pem`, extract the first complete
///     PEM certificate, convert it to DER, and enforce SHA-256 fingerprint
///     equality (normalized: strip separators/whitespace, uppercase).
///     Human-readable signer-label parsing is forbidden.
///  8. Produce APK/checksum/source metadata, retain artifacts for 30 days,
///     and always clean up materialized secrets.
///  9. Never reference a production release key or iOS inputs.
/// 10. Never modify the existing production `android-build.yml` workflow.
/// 11. Securely decode its three base64 secrets to materialize Firebase
///     inputs — base64 decoding itself is required, not forbidden, since
///     this workflow does not call `prepare_android_release.sh`.
/// 12. `AGENTS.md` must document the CI cadence this workflow exists to
///     support: routine Verify on every push/PR, an intermediate test APK
///     after every meaningful user-visible stage before any device/UI-diff
///     validation claim, and signed release builds only for release
///     candidates or tags.
/// 13. The preparation script validates keystore integrity and certificate
///     identity via `${KEYTOOL_BIN:-keytool}`: alias `androiddebugkey` /
///     storepass `android`, and `-exportcert` so the future production call
///     receives deterministic DER-like bytes whose SHA-256 must match
///     `TEST_DEBUG_CERT_SHA256`. Tests exercise this hermetically through a
///     `KEYTOOL_BIN` fake-executable seam (accept / reject / mismatched-cert
///     fixtures) rather than depending on a real Java keystore or a real
///     `keytool` binary being present.
/// 14. After `Build debug APK` and before `Verify test signing certificate`,
///     the workflow must `apksigner sign` the APK with the prepared debug
///     keystore at `$HOME/.android/debug.keystore`, alias `androiddebugkey`,
///     standard debug passwords, a temporary `--out` path, and replace
///     `app-debug.apk` only after signing succeeds. Release secrets are
///     forbidden.
/// 15. The verify step must call `prepare_android_test_apk.sh
///     verify-apk-certificate`, which uses `apksigner verify --print-certs-pem`
///     once, extracts the first complete PEM, converts it with
///     `${OPENSSL_BIN:-openssl} x509 -outform DER`, hashes the DER bytes,
///     writes `NORMALIZED_ACTUAL=<uppercase 64 hex>` to an output-env file
///     for workflow metadata, and emits distinct generic failure messages
///     for apksigner execution failure, missing signing certificate PEM,
///     certificate DER conversion failure, and fingerprint mismatch,
///     without printing expected secrets, fingerprints, PEM bodies, or
///     certificate subjects. Label parsing (`certificate SHA-256 digest:`,
///     sed, head) is forbidden. Tool seams `APKSIGNER_BIN` and `OPENSSL_BIN`
///     must be overridable.
/// 16. Certificate verification remains before prepare-distributable/upload;
///     cleanup remains `if: always()`.
///
/// The PEM/DER `verify-apk-certificate` contract compiles cleanly and is
/// expected to fail only because that subcommand and the `--print-certs-pem`
/// workflow path are absent; no production file is touched by this RED.

const _workflow = '.github/workflows/android-test-apk.yml';
const _productionWorkflow = '.github/workflows/android-build.yml';
const _prepareScript = 'tool/ci/prepare_android_test_apk.sh';

const _projectCalorix = 'calorix-xurschnell';
const _androidPackage = 'com.calorix.calorix';
const _androidAppId = '1:85048284883:android:d9ac439353e922ddf8a626';

const _testSecrets = <String>[
  'FIREBASE_OPTIONS_DART_BASE64',
  'GOOGLE_SERVICES_JSON_BASE64',
  'TEST_DEBUG_KEYSTORE_BASE64',
  'TEST_DEBUG_CERT_SHA256',
];

const _productionReleaseSecrets = <String>[
  'KEYSTORE_BASE64',
  'KEYSTORE_PASSWORD',
  'KEY_ALIAS',
  'KEY_PASSWORD',
  'RELEASE_CERT_SHA256',
  'GOOGLE_SERVICE_INFO_PLIST_BASE64',
];

// ---------------------------------------------------------------------------
// Fixtures for hermetic preparation tests
// ---------------------------------------------------------------------------

const _testFirebaseOptionsDart = r'''
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart' show TargetPlatform, defaultTargetPlatform, kIsWeb;

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      return web;
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
        return ios;
      case TargetPlatform.macOS:
        return macos;
      case TargetPlatform.windows:
        return windows;
      case TargetPlatform.linux:
        return linux;
      default:
        throw UnsupportedError(
          'DefaultFirebaseOptions are not supported for this platform.',
        );
    }
  }

  static const FirebaseOptions web = FirebaseOptions(
    apiKey: 'AIzaSyBrealKey1234567890abcdefg',
    appId: '1:85048284883:web:aaaaaaaaaaaaaaaa',
    messagingSenderId: '85048284883',
    projectId: 'calorix-xurschnell',
    authDomain: 'calorix-xurschnell.firebaseapp.com',
    storageBucket: 'calorix-xurschnell.firebasestorage.app',
  );

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyBrealKey1234567890abcdefg',
    appId: '1:85048284883:android:d9ac439353e922ddf8a626',
    messagingSenderId: '85048284883',
    projectId: 'calorix-xurschnell',
    storageBucket: 'calorix-xurschnell.firebasestorage.app',
  );

  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: 'AIzaSyBrealKey1234567890abcdefg',
    appId: '1:85048284883:ios:cccccccccccccccc',
    messagingSenderId: '85048284883',
    projectId: 'calorix-xurschnell',
    storageBucket: 'calorix-xurschnell.firebasestorage.app',
    iosBundleId: 'com.calorix.calorix',
  );

  static const FirebaseOptions macos = FirebaseOptions(
    apiKey: 'AIzaSyBrealKey1234567890abcdefg',
    appId: '1:85048284883:ios:cccccccccccccccc',
    messagingSenderId: '85048284883',
    projectId: 'calorix-xurschnell',
    storageBucket: 'calorix-xurschnell.firebasestorage.app',
    iosBundleId: 'com.calorix.calorix',
  );

  static const FirebaseOptions windows = FirebaseOptions(
    apiKey: 'AIzaSyBrealKey1234567890abcdefg',
    appId: '1:85048284883:web:bbbbbbbbbbbbbbbb',
    messagingSenderId: '85048284883',
    projectId: 'calorix-xurschnell',
    authDomain: 'calorix-xurschnell.firebaseapp.com',
    storageBucket: 'calorix-xurschnell.firebasestorage.app',
  );

  static const FirebaseOptions linux = FirebaseOptions(
    apiKey: 'AIzaSyBrealKey1234567890abcdefg',
    appId: '1:85048284883:web:bbbbbbbbbbbbbbbb',
    messagingSenderId: '85048284883',
    projectId: 'calorix-xurschnell',
    authDomain: 'calorix-xurschnell.firebaseapp.com',
    storageBucket: 'calorix-xurschnell.firebasestorage.app',
  );
}
''';

/// Converts only the simple FirebaseOptions field literals (not import
/// strings) from single-quoted to double-quoted Dart string literals, e.g.
/// `apiKey: 'x'` -> `apiKey: "x"`. Real `flutterfire configure` output
/// double-quotes these field values; the existing fixture above uses single
/// quotes, matching what the preparation script's parser currently expects.
String _toDoubleQuotedFields(String source) => source.replaceAllMapped(
      RegExp(r"(apiKey|appId|messagingSenderId|projectId|authDomain|"
          r"storageBucket|iosBundleId)(\s*:\s*)'([^']*)'"),
      (match) => '${match[1]}${match[2]}"${match[3]}"',
    );

final String _testFirebaseOptionsDartDoubleQuoted =
    _toDoubleQuotedFields(_testFirebaseOptionsDart);

const _testApiKey = 'AIzaSyBrealKey1234567890abcdefg';
const _testProjectNumber = '85048284883';

String _testGoogleServicesJson() => jsonEncode({
      'project_info': {
        'project_number': _testProjectNumber,
        'project_id': _projectCalorix,
        'storage_bucket': '$_projectCalorix.appspot.com',
      },
      'client': [
        {
          'client_info': {
            'mobilesdk_app_id': _androidAppId,
            'android_client_info': {'package_name': _androidPackage},
          },
          'oauth_client': <Object>[],
          'api_key': [
            {'current_key': _testApiKey},
          ],
          'services': {
            'appinvite_service': {
              'other_platform_oauth_client': <Object>[],
            },
          },
        },
      ],
    });

/// Deterministic DER-like payload emitted by the accepting KEYTOOL_BIN fake
/// when invoked with `-exportcert`. The expected TEST_DEBUG_CERT_SHA256
/// fixture is the SHA-256 of these exact bytes so happy-path prepare and the
/// future production identity check stay consistent.
const _acceptedExportCertBytes = 'synthetic-debug-cert-der-v1';
const _mismatchedExportCertBytes = 'synthetic-other-cert-der-v1';

final String _testCertSha256 =
    sha256.convert(utf8.encode(_acceptedExportCertBytes)).toString();

String _b64(String value) => base64Encode(utf8.encode(value));

Map<String, String> _validTestEnv() => {
      'FIREBASE_OPTIONS_DART_BASE64': _b64(_testFirebaseOptionsDart),
      'GOOGLE_SERVICES_JSON_BASE64': _b64(_testGoogleServicesJson()),
      'TEST_DEBUG_KEYSTORE_BASE64': base64Encode(_testKeystoreBytes),
      'TEST_DEBUG_CERT_SHA256': _testCertSha256,
      'KEYTOOL_BIN': _fakeKeytoolAccept,
    };

// Synthetic keystore bytes — not a real Java keystore. The preparation
// script validates keystore integrity itself via `keytool` alias/storepass
// checks and `keytool -exportcert` certificate identity; tests exercise
// that validation hermetically through the KEYTOOL_BIN seam below rather
// than depending on a real Java keystore or a real `keytool` binary.
final List<int> _testKeystoreBytes =
    utf8.encode('synthetic-debug-keystore-00112233');

// ---------------------------------------------------------------------------
// KEYTOOL_BIN fake-executable seam
//
// The preparation script must validate the decoded keystore by invoking
// `${KEYTOOL_BIN:-keytool}` with alias `androiddebugkey`, storepass
// `android`, and `-exportcert` so production can receive deterministic
// DER-like certificate bytes. Tests supply a fake executable via
// KEYTOOL_BIN so this validation runs hermetically without a real Java
// keystore or the `keytool` binary being present, and so invalid-keystore
// and mismatched-certificate rejection can be exercised deterministically.
// ---------------------------------------------------------------------------

String _writeFakeKeytool({
  required bool accept,
  String exportCertPayload = _acceptedExportCertBytes,
}) {
  final dir = Directory.systemTemp.createTempSync('fake-keytool-');
  final script = File('${dir.path}/keytool');
  const acceptTemplate = r'''#!/usr/bin/env bash
set -euo pipefail
alias_name=""
storepass=""
keystore=""
file_out=""
exportcert=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    -alias) alias_name="$2"; shift 2 ;;
    -storepass) storepass="$2"; shift 2 ;;
    -keystore) keystore="$2"; shift 2 ;;
    -file) file_out="$2"; shift 2 ;;
    -exportcert) exportcert=1; shift ;;
    *) shift ;;
  esac
done
if [[ "$alias_name" != "androiddebugkey" || "$storepass" != "android" ]]; then
  echo "keytool error: invalid alias or storepass" >&2
  exit 1
fi
if [[ ! -s "$keystore" ]]; then
  echo "keytool error: keystore not found or empty" >&2
  exit 1
fi
if [[ "$exportcert" -eq 1 ]]; then
  if [[ -n "$file_out" ]]; then
    printf '%s' '__EXPORT_CERT_PAYLOAD__' > "$file_out"
  else
    printf '%s' '__EXPORT_CERT_PAYLOAD__'
  fi
  exit 0
fi
echo "Alias name: androiddebugkey"
echo "Entry type: PrivateKeyEntry"
exit 0
''';
  script.writeAsStringSync(accept
      ? acceptTemplate.replaceAll('__EXPORT_CERT_PAYLOAD__', exportCertPayload)
      : r'''#!/usr/bin/env bash
echo "keytool error: java.io.IOException: Invalid keystore format" >&2
exit 1
''');
  Process.runSync('chmod', ['+x', script.path]);
  return script.path;
}

late final String _fakeKeytoolAccept = _writeFakeKeytool(accept: true);
late final String _fakeKeytoolReject = _writeFakeKeytool(accept: false);
late final String _fakeKeytoolMismatchedCert = _writeFakeKeytool(
  accept: true,
  exportCertPayload: _mismatchedExportCertBytes,
);

Directory _tmp(String prefix) {
  final dir = Directory.systemTemp.createTempSync('test-apk-$prefix-');
  addTearDown(() => dir.deleteSync(recursive: true));
  return dir;
}

class _PrepareResult {
  _PrepareResult(this.result);
  final ProcessResult result;
  int get exitCode => result.exitCode;
  String get stdout => result.stdout as String;
  String get stderr => result.stderr as String;
  String get all => '$stderr\n$stdout';
}

Future<_PrepareResult> _runPrepare(Directory root, Map<String, String> env,
    {String? home}) async {
  final script = File(_prepareScript).absolute.path;
  final args = <String>[script, 'prepare', '--root', root.path];
  if (home != null) args.addAll(['--home', home]);
  final result = await Process.run(
    'bash',
    args,
    workingDirectory: Directory.current.path,
    environment: <String, String>{...Platform.environment, ...env},
  );
  return _PrepareResult(result);
}

Future<_PrepareResult> _runCleanup(Directory root, {String? home}) async {
  final script = File(_prepareScript).absolute.path;
  final args = <String>[script, 'cleanup', '--root', root.path];
  if (home != null) args.addAll(['--home', home]);
  final result = await Process.run(
    'bash',
    args,
    workingDirectory: Directory.current.path,
  );
  return _PrepareResult(result);
}

Future<_PrepareResult> _runVerifyFingerprint(
    String expected, String actual) async {
  final script = File(_prepareScript).absolute.path;
  final result = await Process.run(
    'bash',
    [script, 'verify-fingerprint', '--expected', expected, '--actual', actual],
    workingDirectory: Directory.current.path,
  );
  return _PrepareResult(result);
}

void _expectRejected(_PrepareResult result, String messagePart) {
  expect(result.exitCode, isNot(0),
      reason: 'expected a nonzero exit, got ${result.all}');
  expect(result.all, contains(messagePart),
      reason: 'output must name "$messagePart"');
}

void _expectNoPartialFiles(Directory root) {
  const paths = <String>[
    'lib/core/firebase/firebase_options.dart',
    'android/app/google-services.json',
    'HOME/.android/debug.keystore',
  ];
  for (final path in paths) {
    if (path.startsWith('HOME/')) {
      // HOME paths are relative to --home, not --root; checked separately
      continue;
    }
    expect(File('${root.path}/$path').existsSync(), isFalse,
        reason: 'partial artifact must not remain: $path');
  }
  // Check keystore is not materialized under root's android/app
  final appDir = Directory('${root.path}/android/app');
  if (appDir.existsSync()) {
    final leftovers = appDir
        .listSync()
        .whereType<File>()
        .where((f) => f.path.endsWith('.keystore'));
    expect(leftovers, isEmpty,
        reason:
            'a partial keystore artifact must not remain under android/app');
  }
}

void _expectNoKeystoreInHome(String homePath) {
  final debugKeystore = File('$homePath/.android/debug.keystore');
  expect(debugKeystore.existsSync(), isFalse,
      reason: 'partial debug.keystore must not remain in home: $debugKeystore');
}

void _expectMaterialized(
    Directory root, Map<String, String> env, _PrepareResult result,
    {String? homePath}) {
  expect(result.exitCode, 0, reason: result.all);

  final options = File('${root.path}/lib/core/firebase/firebase_options.dart');
  final services = File('${root.path}/android/app/google-services.json');
  expect(options.existsSync(), isTrue,
      reason: 'firebase_options.dart must be materialized');
  expect(services.existsSync(), isTrue,
      reason: 'android/app/google-services.json must be materialized');

  expect(options.readAsBytesSync(),
      base64Decode(env['FIREBASE_OPTIONS_DART_BASE64']!));
  expect(services.readAsBytesSync(),
      base64Decode(env['GOOGLE_SERVICES_JSON_BASE64']!));

  // Debug keystore must be materialized in the home directory
  final effectiveHome = homePath ?? Platform.environment['HOME'] ?? '/tmp';
  final debugKeystore = File('$effectiveHome/.android/debug.keystore');
  expect(debugKeystore.existsSync(), isTrue,
      reason: 'debug.keystore must be materialized at '
          '$effectiveHome/.android/debug.keystore');
  expect(debugKeystore.readAsBytesSync(),
      base64Decode(env['TEST_DEBUG_KEYSTORE_BASE64']!));
}

void _expectNoSecretOutput(_PrepareResult result, Map<String, String> env) {
  final out = result.all;
  for (final name in const [
    'FIREBASE_OPTIONS_DART_BASE64',
    'GOOGLE_SERVICES_JSON_BASE64',
    'TEST_DEBUG_KEYSTORE_BASE64',
    'TEST_DEBUG_CERT_SHA256',
  ]) {
    expect(out, isNot(contains(env[name]!)), reason: '$name must not leak');
  }
  // Decoded content must not reach output either.
  expect(out, isNot(contains(_projectCalorix)));
  expect(out, isNot(contains(_testApiKey)));
  expect(out, isNot(contains(_testCertSha256)));
}

/// Detects ARM64 host without spawning a subprocess by reading
/// `/proc/cpuinfo` directly. Returns `true` on Pi and other aarch64 hosts
/// where amd64 Flutter emulation causes real-process tests to exceed the
/// default 30-second timeout. Also matches the ARMv8 cpuinfo signature
/// (`CPU architecture: 8` plus `CPU implementer`) seen inside an amd64
/// container running under qemu on ARM hosts, where `uname` reports
/// x86_64 and no aarch64/arm64 word appears anywhere in cpuinfo.
final bool _isArmHost = () {
  try {
    final cpuinfo = File('/proc/cpuinfo').readAsStringSync().toLowerCase();
    return cpuinfo.contains('aarch64') ||
        cpuinfo.contains('arm64') ||
        (cpuinfo.contains('cpu architecture: 8') &&
            cpuinfo.contains('cpu implementer'));
  } catch (_) {
    return false;
  }
}();

/// Extended timeout for real-process tests on ARM64 hosts where amd64
/// Flutter emulation makes subprocess execution exceed the default
/// 30-second per-test timeout.  Applied only to the two tests that
/// launch real `bash` subprocesses and are known to time out under
/// emulation; all other tests retain the default timeout.
final Timeout _arm64ProcessTimeout = _isArmHost
    ? const Timeout(Duration(seconds: 90))
    : const Timeout(Duration(seconds: 30));

YamlMap _loadWorkflowFile(String path) {
  final file = File(path);
  expect(file.existsSync(), isTrue, reason: '$path must exist but is absent');
  return loadYaml(file.readAsStringSync()) as YamlMap;
}

YamlMap _jobNamed(YamlMap workflow, String name) {
  final jobs = workflow['jobs'] as YamlMap?;
  expect(jobs, isNotNull, reason: 'jobs: section is required');
  expect(jobs!.containsKey(name), isTrue,
      reason: 'jobs must contain a "$name" job; found ${jobs.keys.toList()}');
  return jobs[name] as YamlMap;
}

List<String> _needsOf(YamlMap job) {
  final needs = job['needs'];
  if (needs == null) return const [];
  if (needs is String) return [needs];
  if (needs is YamlList) return needs.cast<String>();
  return const [];
}

String _stepRun(YamlMap step) {
  final run = step['run'];
  return run is String ? run : '';
}

String _stepName(YamlMap step) {
  final name = step['name'];
  return name is String ? name : '';
}

String _stepUses(YamlMap step) {
  final uses = step['uses'];
  return uses is String ? uses : '';
}

List<YamlMap> _buildJobSteps(YamlMap workflow) {
  final build = _jobNamed(workflow, 'build');
  final steps = build['steps'] as YamlList?;
  expect(steps, isNotNull, reason: 'jobs.build.steps is required');
  return steps!.cast<YamlMap>();
}

void main() {
  group('.github/workflows/android-test-apk.yml contract', () {
    void expectWorkflowExists() {
      expect(File(_workflow).existsSync(), isTrue,
          reason: '$_workflow must exist but is absent');
    }

    YamlMap loadWorkflow() {
      expectWorkflowExists();
      return loadYaml(File(_workflow).readAsStringSync()) as YamlMap;
    }

    test('file exists', expectWorkflowExists);

    test(
        'on: triggers are exactly workflow_dispatch; no push, pull_request, '
        'schedule, or other triggers', () {
      final workflow = loadWorkflow();

      final on = workflow['on'];
      expect(on, isA<YamlMap>(), reason: 'on: must be a mapping');

      final keys = (on as YamlMap).keys.cast<String>().toList()..sort();
      expect(keys, ['workflow_dispatch'],
          reason: 'on: must contain exactly workflow_dispatch; found $keys');
    });

    test('top-level permissions contents is read', () {
      final workflow = loadWorkflow();

      final permissions = workflow['permissions'];
      expect(permissions, isA<YamlMap>(),
          reason: 'top-level permissions is required');
      expect((permissions as YamlMap)['contents'], 'read',
          reason: 'permissions.contents must be read');
    });

    test('requires exactly four test secrets and no production release secrets',
        () {
      final file = File(_workflow);
      expect(file.existsSync(), isTrue,
          reason: '$_workflow must exist but is absent');
      final raw = file.readAsStringSync();

      final secretRefs = <String>{};
      for (final match in RegExp(r'secrets\.([A-Z_0-9]+)').allMatches(raw)) {
        secretRefs.add(match.group(1)!);
      }
      expect(secretRefs, _testSecrets.toSet(),
          reason: 'workflow must reference exactly the four test secrets '
              'and no others; found ${secretRefs.toList()..sort()}');

      for (final name in _productionReleaseSecrets) {
        expect(raw, isNot(contains('secrets.$name')),
            reason:
                'production secret $name must not appear in test APK workflow');
      }
    });

    test(
        'references the debug keystore at ~/.android/debug.keystore or '
        'standard Android debug keystore path', () {
      final file = File(_workflow);
      expect(file.existsSync(), isTrue,
          reason: '$_workflow must exist but is absent');
      final raw = file.readAsStringSync();

      expect(
          raw.contains('debug.keystore') ||
              raw.contains(r'${ANDROID_HOME}/debug.keystore') ||
              raw.contains(r'$HOME/.android/debug.keystore'),
          isTrue,
          reason: 'workflow must reference the debug keystore path');
    });

    test(
        'validates project calorix-xurschnell, package com.calorix.calorix, '
        'and app id 1:85048284883:android:d9ac439353e922ddf8a626 '
        '(combined workflow + script implementation must contain each)', () {
      final workflowFile = File(_workflow);
      expect(workflowFile.existsSync(), isTrue,
          reason: '$_workflow must exist but is absent');
      final workflowRaw = workflowFile.readAsStringSync();

      final scriptFile = File(_prepareScript);
      expect(scriptFile.existsSync(), isTrue,
          reason: '$_prepareScript must exist but is absent');
      final scriptRaw = scriptFile.readAsStringSync();

      // The workflow delegates validation to the preparation script; each
      // constant must appear in at least one of the two sources (the
      // combined workflow + script implementation), not in both separately.
      final combined = '$workflowRaw\n$scriptRaw';
      expect(combined, contains(_projectCalorix),
          reason: 'project calorix-xurschnell must be validated');
      expect(combined, contains(_androidPackage),
          reason: 'package com.calorix.calorix must be validated');
      expect(combined, contains(_androidAppId),
          reason:
              'app id 1:85048284883:android:d9ac439353e922ddf8a626 must be validated');
    });

    test('rejects placeholder values', () {
      final file = File(_workflow);
      expect(file.existsSync(), isTrue,
          reason: '$_workflow must exist but is absent');
      final raw = file.readAsStringSync().toLowerCase();

      expect(raw, isNot(contains('ci-placeholder')),
          reason: 'placeholder Firebase values are forbidden');
      expect(raw, isNot(contains('1:000000000000')),
          reason: 'placeholder Firebase app IDs are forbidden');
      expect(raw, isNot(contains('changeme')),
          reason: 'ChangeMe placeholders are forbidden');
      expect(raw, isNot(contains('example')),
          reason: 'example placeholders are forbidden');
    });

    test(
        'workflow delegates to verify-apk-certificate; helper requests '
        '--print-certs-pem via APKSIGNER_BIN', () {
      final workflowFile = File(_workflow);
      expect(workflowFile.existsSync(), isTrue,
          reason: '$_workflow must exist but is absent');
      final workflowRaw = workflowFile.readAsStringSync();

      final scriptFile = File(_prepareScript);
      expect(scriptFile.existsSync(), isTrue,
          reason: '$_prepareScript must exist but is absent');
      final scriptRaw = scriptFile.readAsStringSync();

      expect(workflowRaw, contains('verify-apk-certificate'),
          reason: 'workflow must call verify-apk-certificate');
      expect(scriptRaw, contains('--print-certs-pem'),
          reason: 'helper script must contain --print-certs-pem');
      expect(scriptRaw, contains('APKSIGNER_BIN'),
          reason: 'helper script must use APKSIGNER_BIN variable');
      expect(workflowRaw, contains('TEST_DEBUG_CERT_SHA256'),
          reason:
              'the test cert SHA-256 must be checked against the signature');
      expect(workflowRaw, isNot(contains('certificate SHA-256 digest:')),
          reason: 'human-readable certificate SHA-256 digest labels are '
              'forbidden');
      expect(workflowRaw, isNot(contains(RegExp(r'\bsed\b'))),
          reason: 'sed label parsing is forbidden in the test APK workflow');
      expect(workflowRaw, isNot(contains(RegExp(r'\bhead\b'))),
          reason: 'head-based label parsing is forbidden in the test APK '
              'workflow');
    });

    test('produces APK checksum and source metadata', () {
      final file = File(_workflow);
      expect(file.existsSync(), isTrue,
          reason: '$_workflow must exist but is absent');
      final raw = file.readAsStringSync().toLowerCase();

      expect(raw, contains('sha256sum'),
          reason: 'APK checksum must be produced');
      expect(raw.contains('metadata') || raw.contains('sidecar'), isTrue,
          reason: 'source/APK metadata must be recorded');
    });

    test('uploads artifact with 30-day retention', () {
      final file = File(_workflow);
      expect(file.existsSync(), isTrue,
          reason: '$_workflow must exist but is absent');
      final raw = file.readAsStringSync().toLowerCase();

      expect(raw, contains('upload-artifact'),
          reason: 'an upload-artifact step is required');
      expect(raw, contains('retention-days'),
          reason: 'retention-days must be specified');
      expect(raw, contains('30'), reason: 'retention-days must be 30');
    });

    test('unconditionally cleans materialized secrets with if: always()', () {
      final file = File(_workflow);
      expect(file.existsSync(), isTrue,
          reason: '$_workflow must exist but is absent');
      final raw = file.readAsStringSync().toLowerCase();

      expect(raw.contains('if:') && raw.contains('always'), isTrue,
          reason: 'cleanup must be guarded by if: always()');
    });

    test('never references a production release key or iOS inputs', () {
      final file = File(_workflow);
      expect(file.existsSync(), isTrue,
          reason: '$_workflow must exist but is absent');
      final raw = file.readAsStringSync().toLowerCase();

      expect(raw, isNot(contains('release.jks')),
          reason: 'release keystore must not be referenced');
      expect(raw, isNot(contains('release-cert')),
          reason: 'release certificate must not be referenced');
      expect(raw, isNot(contains('ios/')),
          reason: 'iOS paths must not appear in test APK workflow');
      expect(raw, isNot(contains('google-service-info')),
          reason: 'iOS GoogleService-Info.plist must not be referenced');
      expect(raw, isNot(contains('plist')),
          reason: 'iOS plist references must not appear');
    });

    test(
        'does not contain push.branches, pull_request.branches, or '
        'debug signing fallback', () {
      final file = File(_workflow);
      expect(file.existsSync(), isTrue,
          reason: '$_workflow must exist but is absent');
      final raw = file.readAsStringSync().toLowerCase();

      expect(raw, isNot(contains('push')),
          reason: 'push trigger must not appear');
      expect(raw, isNot(contains('pull_request')),
          reason: 'pull_request trigger must not appear');
      expect(raw, isNot(contains('signingconfigs.getname("debug")')),
          reason: 'debug signing fallback is forbidden');
    });

    test(
        'securely decodes three base64 inputs (strict base64 decoding is '
        'required; the workflow passes encoded inputs to the preparation '
        'script which decodes them via Python base64.b64decode with '
        'validation, so base64 decoding itself is not forbidden)', () {
      final workflowFile = File(_workflow);
      expect(workflowFile.existsSync(), isTrue,
          reason: '$_workflow must exist but is absent');
      final workflowRaw = workflowFile.readAsStringSync();

      final scriptFile = File(_prepareScript);
      expect(scriptFile.existsSync(), isTrue,
          reason: '$_prepareScript must exist but is absent');
      final scriptRaw = scriptFile.readAsStringSync();

      // The workflow or the preparation script must perform strict base64
      // decoding somewhere. The workflow decodes via the preparation script,
      // and the script uses Python's base64.b64decode with validate=True.
      final workflowHasDecode = workflowRaw.contains('base64 -d') ||
          workflowRaw.contains('base64 --decode') ||
          workflowRaw.contains('base64 -D');
      final scriptHasStrictDecode = scriptRaw.contains('base64.b64decode') &&
          scriptRaw.contains('validate=True');
      expect(workflowHasDecode || scriptHasStrictDecode, isTrue,
          reason: 'the workflow or preparation script must perform strict '
              'base64 decoding (Python base64.b64decode with validate=True) '
              'to materialize Firebase inputs');
    });
  });

  group('android-test-apk.yml deterministic signing and diagnostics', () {
    YamlMap loadWorkflow() => _loadWorkflowFile(_workflow);

    test(
        'signs the debug APK with apksigner after Build debug APK and before '
        'Verify test signing certificate, using the prepared debug keystore',
        () {
      final steps = _buildJobSteps(loadWorkflow());

      final buildIndex = steps.indexWhere((step) =>
          _stepName(step) == 'Build debug APK' ||
          _stepRun(step).contains('fvm flutter build apk --debug'));
      final signIndex =
          steps.indexWhere((step) => _stepRun(step).contains('apksigner sign'));
      final verifyIndex = steps.indexWhere((step) =>
          _stepName(step) == 'Verify test signing certificate' ||
          _stepRun(step).contains('apksigner verify'));

      expect(buildIndex, greaterThanOrEqualTo(0),
          reason: 'a Build debug APK step is required');
      expect(signIndex, greaterThanOrEqualTo(0),
          reason: 'an explicit apksigner sign step is required after the '
              'debug APK build');
      expect(verifyIndex, greaterThanOrEqualTo(0),
          reason: 'a Verify test signing certificate step is required');
      expect(buildIndex, lessThan(signIndex),
          reason: 'apksigner sign must run after Build debug APK');
      expect(signIndex, lessThan(verifyIndex),
          reason: 'apksigner sign must run before Verify test signing '
              'certificate');

      final signRun = _stepRun(steps[signIndex]);
      final usesPreparedDebugKeystore =
          signRun.contains(r'$HOME/.android/debug.keystore') ||
              signRun.contains(r'${HOME}/.android/debug.keystore');
      expect(usesPreparedDebugKeystore, isTrue,
          reason: 'apksigner sign must use the prepared debug keystore at '
              r'$HOME/.android/debug.keystore');
      expect(signRun, contains('androiddebugkey'),
          reason: 'apksigner sign must use alias androiddebugkey');
      expect(signRun, contains('--ks-pass'),
          reason: 'apksigner sign must pass the standard debug store password');
      expect(signRun, contains('--key-pass'),
          reason: 'apksigner sign must pass the standard debug key password');
      expect(signRun, contains('pass:android'),
          reason: 'apksigner sign must use the standard debug password '
              'android, not release secrets');
      expect(signRun, contains('--out'),
          reason: 'apksigner sign must write to a temporary --out path');
      expect(
        signRun.contains('mktemp') ||
            signRun.contains('.tmp') ||
            signRun.contains('/tmp/'),
        isTrue,
        reason: 'signed APK --out path must be temporary',
      );
      expect(signRun, contains('app-debug.apk'),
          reason: 'signing must target the debug APK');
      expect(
        RegExp(r'\bmv\b').hasMatch(signRun) ||
            RegExp(r'\bcp\b').hasMatch(signRun),
        isTrue,
        reason: 'app-debug.apk must be replaced with the signed --out file '
            'only after signing succeeds',
      );

      for (final name in _productionReleaseSecrets) {
        expect(signRun, isNot(contains(name)),
            reason: 'apksigner sign must not use production release secret '
                '$name');
        expect(signRun, isNot(contains('secrets.$name')),
            reason: 'apksigner sign must not reference secrets.$name');
      }
    });

    test(
        'verify-apk-certificate disambiguates apksigner failure, missing '
        'signing certificate PEM, DER conversion failure, and fingerprint '
        'mismatch without printing secrets', () {
      final steps = _buildJobSteps(loadWorkflow());
      final verifyIndex = steps.indexWhere((step) =>
          _stepName(step) == 'Verify test signing certificate' ||
          _stepRun(step).contains('verify-apk-certificate') ||
          _stepRun(step).contains('apksigner verify'));
      expect(verifyIndex, greaterThanOrEqualTo(0),
          reason: 'a Verify test signing certificate step is required');
      final verifyRun = _stepRun(steps[verifyIndex]);
      final scriptRaw = File(_prepareScript).readAsStringSync();
      final combined = '$verifyRun\n$scriptRaw';

      expect(verifyRun, contains('verify-apk-certificate'),
          reason: 'the verify step must call verify-apk-certificate');
      expect(scriptRaw, contains('--print-certs-pem'),
          reason: 'scriptRaw must reference --print-certs-pem');
      expect(scriptRaw, contains('APKSIGNER_BIN'),
          reason: 'scriptRaw must reference APKSIGNER_BIN');
      expect(scriptRaw, contains('OPENSSL_BIN'),
          reason: 'scriptRaw must reference OPENSSL_BIN');

      expect(combined, contains('apksigner verify failed'),
          reason: 'apksigner execution failure must have a distinct message');
      expect(combined, contains('missing signing certificate PEM'),
          reason: 'a missing or incomplete first PEM must have a distinct '
              'generic message');
      expect(combined, contains('certificate DER conversion failed'),
          reason: 'openssl DER conversion failure must have a distinct '
              'generic message');
      expect(combined, contains('fingerprint mismatch'),
          reason: 'fingerprint mismatch must have a distinct generic message');

      expect(verifyRun, isNot(contains('certificate SHA-256 digest:')),
          reason: 'human-readable digest labels must not be parsed');
      expect(verifyRun, isNot(contains(RegExp(r'\bsed\b'))),
          reason: 'sed label parsing is forbidden in the verify step');
      expect(verifyRun, isNot(contains(RegExp(r'\bhead\b'))),
          reason: 'head-based label parsing is forbidden in the verify step');

      expect(verifyRun, isNot(contains(r'echo "$TEST_DEBUG_CERT_SHA256"')),
          reason: 'the expected fingerprint secret must not be printed');
      expect(verifyRun, isNot(contains(r'echo $TEST_DEBUG_CERT_SHA256')),
          reason: 'the expected fingerprint secret must not be printed');
      expect(verifyRun, isNot(contains(r'echo "$NORMALIZED_EXPECTED"')),
          reason: 'the expected fingerprint must not be printed');
      expect(verifyRun, isNot(contains(r'echo $NORMALIZED_EXPECTED')),
          reason: 'the expected fingerprint must not be printed');
      expect(verifyRun, isNot(contains(r'echo "$NORMALIZED_ACTUAL"')),
          reason: 'the actual fingerprint must not be printed to logs');
      expect(verifyRun, isNot(contains(r'echo $NORMALIZED_ACTUAL')),
          reason: 'the actual fingerprint must not be printed to logs');
    });

    test(
        'verifies the signing certificate before prepare-distributable/upload '
        'and always cleans up', () {
      final steps = _buildJobSteps(loadWorkflow());

      final verifyIndex = steps.indexWhere((step) =>
          _stepName(step) == 'Verify test signing certificate' ||
          _stepRun(step).contains('apksigner verify'));
      final distIndex = steps.indexWhere((step) =>
          _stepName(step) == 'Prepare distributable files' ||
          _stepRun(step).contains('mkdir -p dist'));
      final uploadIndex = steps
          .indexWhere((step) => _stepUses(step).contains('upload-artifact'));
      final cleanupIndex = steps.indexWhere((step) {
        final cond = step['if'];
        return cond is String &&
            cond.contains('always') &&
            (_stepName(step).toLowerCase().contains('clean') ||
                _stepRun(step).contains('cleanup'));
      });

      expect(verifyIndex, greaterThanOrEqualTo(0),
          reason: 'a Verify test signing certificate step is required');
      expect(distIndex, greaterThanOrEqualTo(0),
          reason: 'a Prepare distributable files step is required');
      expect(uploadIndex, greaterThanOrEqualTo(0),
          reason: 'an upload-artifact step is required');
      expect(cleanupIndex, greaterThanOrEqualTo(0),
          reason: 'a cleanup step guarded by if: always() is required');
      expect(verifyIndex, lessThan(distIndex),
          reason:
              'certificate verification must precede prepare-distributable');
      expect(verifyIndex, lessThan(uploadIndex),
          reason: 'certificate verification must precede artifact upload');
      expect(cleanupIndex, greaterThan(uploadIndex),
          reason: 'cleanup must remain after upload and run if: always()');
    });

    test(
        'verify-apk-certificate workflow does not parse Signer certificate '
        'SHA-256 digest labels with sed or head', () {
      final steps = _buildJobSteps(_loadWorkflowFile(_workflow));
      final verifyIndex = steps.indexWhere((step) =>
          _stepName(step) == 'Verify test signing certificate' ||
          _stepRun(step).contains('verify-apk-certificate') ||
          _stepRun(step).contains('apksigner verify'));
      expect(verifyIndex, greaterThanOrEqualTo(0),
          reason: 'a Verify test signing certificate step is required');
      final verifyRun = _stepRun(steps[verifyIndex]);
      final scriptRaw = File(_prepareScript).readAsStringSync();

      expect(verifyRun, contains('verify-apk-certificate'),
          reason: 'the verify step must call verify-apk-certificate');
      expect(scriptRaw, contains('--print-certs-pem'),
          reason: 'helper script must contain --print-certs-pem');
      expect(scriptRaw, contains('APKSIGNER_BIN'),
          reason: 'helper script must use APKSIGNER_BIN variable');
      expect(verifyRun, isNot(contains('--print-certs-pem')),
          reason: '--print-certs-pem must not appear in verifyRun');
      expect(verifyRun, isNot(contains('certificate SHA-256 digest:')),
          reason: 'human-readable digest labels are forbidden');
      expect(verifyRun, isNot(contains(RegExp(r'\bsed\b'))),
          reason: 'sed label parsing is forbidden');
      expect(verifyRun, isNot(contains(RegExp(r'\bhead\b'))),
          reason: 'head-based label parsing is forbidden');
      expect(verifyRun, isNot(contains('Signer #1')),
          reason: 'numbered signer labels must not be parsed');
      expect(verifyRun, isNot(contains('RAW_CERT')),
          reason: 'human-readable RAW_CERT label extraction is forbidden');
    });
  });

  group('strict same-github.sha Verify-before-build contract', () {
    const _verify = '.github/workflows/verify.yml';

    test(
        'verify.yml exposes workflow_call so it can be invoked in-run '
        'rather than referenced as a separate external run', () {
      final workflow = _loadWorkflowFile(_verify);
      final on = workflow['on'];
      expect(on, isA<YamlMap>(), reason: 'on: must be a mapping');

      final keys = (on as YamlMap).keys.cast<String>().toSet();
      expect(keys, contains('workflow_call'),
          reason: 'verify.yml must expose workflow_call so it can be '
              'called by android-test-apk.yml at the same commit sha');
    });

    test(
        'jobs.verify calls the local reusable ./.github/workflows/verify.yml, '
        'guaranteeing the same commit sha as the dispatch', () {
      final workflow = _loadWorkflowFile(_workflow);
      final verifyJob = _jobNamed(workflow, 'verify');

      expect(verifyJob['uses'], './.github/workflows/verify.yml',
          reason: 'jobs.verify must call the local reusable verify.yml by '
              'relative path so it always runs the current checkout, never '
              'a separate external run that could be stale');
    });

    test(
        'jobs.build needs jobs.verify, so the test APK is never built '
        'before the same-sha Verify job has completed', () {
      final workflow = _loadWorkflowFile(_workflow);
      final buildJob = _jobNamed(workflow, 'build');

      expect(_needsOf(buildJob), contains('verify'),
          reason: 'jobs.build must declare needs: verify');
    });

    test(
        'rejects workflow_run and other stale-run trigger patterns that '
        'could execute against a different, unrelated commit', () {
      final workflow = _loadWorkflowFile(_workflow);

      final on = workflow['on'] as YamlMap?;
      expect(on, isA<YamlMap>(), reason: 'on: must be a mapping');
      expect(on!.containsKey('workflow_run'), isFalse,
          reason: 'workflow_run fires against whatever commit the upstream '
              'workflow completed on, which can be stale relative to the '
              'dispatched sha; use the in-run workflow_call/needs contract '
              'instead');
    });

    test(
        'raw workflow YAML does not contain a workflow_run: trigger line '
        '(defensive: metadata keys must not cause false matches)', () {
      final file = File(_workflow);
      expect(file.existsSync(), isTrue,
          reason: '$_workflow must exist but is absent');
      final raw = file.readAsStringSync();

      // Assert no standalone workflow_run: trigger key (with colon, at
      // start-of-line indentation).  This prevents metadata keys such as
      // workflow_run_id from being confused with the forbidden trigger.
      expect(raw,
          isNot(contains(RegExp(r'^\s+workflow_run\s*:', multiLine: true))),
          reason: 'workflow_run: trigger must not appear in the raw YAML');
    });
  });

  group('AGENTS.md CI cadence contract', () {
    const _agents = 'AGENTS.md';

    String agentsText() {
      final file = File(_agents);
      expect(file.existsSync(), isTrue, reason: '$_agents must exist');
      return file.readAsStringSync();
    }

    test(
        'requires routine Verify to run on every push and every pull '
        'request', () {
      final text = agentsText().toLowerCase();
      expect(
          text.contains('verify') &&
              (text.contains('every push') || text.contains('each push')) &&
              (text.contains('pull request') || text.contains('pull_request')),
          isTrue,
          reason: 'AGENTS.md must state that routine Verify runs on every '
              'push and pull request');
    });

    test(
        'requires an intermediate test APK build after every meaningful '
        'user-visible stage before device/UI-diff validation claims', () {
      final text = agentsText().toLowerCase();
      expect(
          text.contains('intermediate') &&
              text.contains('apk') &&
              (text.contains('user-visible') ||
                  text.contains('user visible')) &&
              (text.contains('device') || text.contains('ui-diff')),
          isTrue,
          reason: 'AGENTS.md must require an intermediate test APK after '
              'every meaningful user-visible stage before device/UI-diff '
              'validation claims');
    });

    test(
        'restricts signed release builds to release-candidate or tagged '
        'builds only', () {
      final text = agentsText().toLowerCase();
      expect(
          text.contains('signed release') &&
              (text.contains(' rc') ||
                  text.contains('release candidate') ||
                  text.contains('release-candidate')) &&
              text.contains('tag'),
          isTrue,
          reason: 'AGENTS.md must state signed release builds occur only '
              'for release candidates or tags');
    });
  });

  group('production android-build.yml is unchanged', () {
    test('android-build.yml still has push.tags v* and workflow_dispatch', () {
      final file = File(_productionWorkflow);
      expect(file.existsSync(), isTrue,
          reason: '$_productionWorkflow must exist');
      final raw = file.readAsStringSync();
      final workflow = loadYaml(raw) as YamlMap;

      final on = workflow['on'];
      expect(on, isA<YamlMap>(), reason: 'on: must be a mapping');

      final keys = (on as YamlMap).keys.cast<String>().toList()..sort();
      expect(keys, ['push', 'workflow_dispatch'],
          reason: 'production workflow triggers must not have changed');
    });
  });

  // =========================================================================
  // Hermetic real-process tests for tool/ci/prepare_android_test_apk.sh
  // =========================================================================

  group('tool/ci/prepare_android_test_apk.sh hermetic contract', () {
    void expectScriptExists() {
      expect(File(_prepareScript).existsSync(), isTrue,
          reason: '$_prepareScript must be committed before these tests pass');
    }

    test('preparation script exists', expectScriptExists);

    test('is executable', () {
      expectScriptExists();
      expect(File(_prepareScript).statSync().mode & 0x100, isNot(0),
          reason: '$_prepareScript must have the executable bit set');
    });

    test('bash -n passes (syntax check)', () async {
      expectScriptExists();
      final raw =
          await Process.run('bash', ['-n', File(_prepareScript).absolute.path]);
      expect(raw.exitCode, 0, reason: '${raw.stderr}\n${raw.stdout}');
    });

    test('rejects fully absent inputs and names every required variable',
        () async {
      expectScriptExists();
      final tmp = _tmp('absent');
      final result = await _runPrepare(tmp, const {});

      _expectRejected(result, 'FIREBASE_OPTIONS_DART_BASE64');
      for (final name in _testSecrets) {
        expect(result.all, contains(name),
            reason: 'the absent input $name must be named');
      }
      _expectNoPartialFiles(tmp);
    });

    test('rejects each individually missing input, naming it', () async {
      expectScriptExists();
      for (final name in _testSecrets) {
        final tmp = _tmp('missing-$name');
        final env = Map<String, String>.of(_validTestEnv())..remove(name);
        final result = await _runPrepare(tmp, env);

        _expectRejected(result, name);
        _expectNoPartialFiles(tmp);
      }
    });

    test('rejects each empty input, naming it', () async {
      expectScriptExists();
      for (final name in _testSecrets) {
        final tmp = _tmp('empty-$name');
        final env = Map<String, String>.of(_validTestEnv())..[name] = '';
        final result = await _runPrepare(tmp, env);

        _expectRejected(result, name);
        _expectNoPartialFiles(tmp);
      }
    });

    test('rejects malformed base64 for every encoded input, naming it',
        () async {
      expectScriptExists();
      const encoded = <String>[
        'FIREBASE_OPTIONS_DART_BASE64',
        'GOOGLE_SERVICES_JSON_BASE64',
        'TEST_DEBUG_KEYSTORE_BASE64',
      ];
      for (final name in encoded) {
        final tmp = _tmp('bad64-$name');
        final env = Map<String, String>.of(_validTestEnv())
          ..[name] = '!!!this-is-not-base64!!!';
        final result = await _runPrepare(tmp, env);

        _expectRejected(result, name);
        _expectNoPartialFiles(tmp);
      }
    });

    test(
        'rejects decoded content that fails validation for each artifact class',
        () async {
      expectScriptExists();

      final cases = <String, String>{
        // Not JSON despite decoding cleanly.
        'GOOGLE_SERVICES_JSON_BASE64': _b64('this is { not json'),
        // Not a Dart FirebaseOptions definition.
        'FIREBASE_OPTIONS_DART_BASE64': _b64('void nothing() {}'),
        // An encoded but empty keystore payload.
        'TEST_DEBUG_KEYSTORE_BASE64': _b64(''),
      };
      for (final entry in cases.entries) {
        final tmp = _tmp('badcontent-${entry.key}');
        final env = Map<String, String>.of(_validTestEnv())
          ..[entry.key] = entry.value;
        final result = await _runPrepare(tmp, env);

        _expectRejected(result, entry.key);
        _expectNoPartialFiles(tmp);
      }
    });

    test(
        'rejects invalid UTF-8 for every Firebase text artifact before writing files',
        () async {
      expectScriptExists();

      final invalidUtf8 = base64Encode(Uint8List.fromList([0xff, 0xfe, 0xfd]));
      const textArtifacts = <String>[
        'FIREBASE_OPTIONS_DART_BASE64',
        'GOOGLE_SERVICES_JSON_BASE64',
      ];
      for (final name in textArtifacts) {
        final tmp = _tmp('badutf8-$name');
        final env = Map<String, String>.of(_validTestEnv())
          ..[name] = invalidUtf8;
        final result = await _runPrepare(tmp, env);

        _expectRejected(result, name);
        _expectNoPartialFiles(tmp);
        _expectNoSecretOutput(result, env);
      }
    });

    test(
        'rejects placeholder Firebase values in Dart options and google-services.json',
        () async {
      expectScriptExists();

      final placeholderDart = _testFirebaseOptionsDart
          .replaceAll(_projectCalorix, 'ci-placeholder-project')
          .replaceAll(_testProjectNumber, '000000000000');
      final placeholderServices = _testGoogleServicesJson()
          .replaceAll(_projectCalorix, 'ci-placeholder-project');

      final cases = <String, String>{
        'FIREBASE_OPTIONS_DART_BASE64': _b64(placeholderDart),
        'GOOGLE_SERVICES_JSON_BASE64': _b64(placeholderServices),
      };
      for (final entry in cases.entries) {
        final tmp = _tmp('placeholder-${entry.key}');
        final env = Map<String, String>.of(_validTestEnv())
          ..[entry.key] = entry.value;
        final result = await _runPrepare(tmp, env);

        expect(result.exitCode, isNot(0),
            reason: 'placeholder values must be rejected');
        expect(result.all.toLowerCase(), contains('placeholder'));
        _expectNoPartialFiles(tmp);
      }
    });

    test(
        'rejects incomplete or placeholder Firebase Dart options before '
        'writing files', () async {
      expectScriptExists();

      String blankAssignment(String field) => _testFirebaseOptionsDart
          .replaceAll(RegExp("$field: '[^']*'"), "$field: ''");

      String markerInApiKey(String marker) => _testFirebaseOptionsDart
          .replaceAll(RegExp("apiKey: '[^']*'"), "apiKey: '$marker'");

      final cases = <String, String>{
        'missing apiKey assignment': blankAssignment('apiKey'),
        'missing appId assignment': blankAssignment('appId'),
        'missing messagingSenderId assignment':
            blankAssignment('messagingSenderId'),
        'missing projectId assignment': blankAssignment('projectId'),
        'missing DefaultFirebaseOptions':
            _testFirebaseOptionsDart.replaceAll('DefaultFirebaseOptions', ''),
        'missing FirebaseOptions(':
            _testFirebaseOptionsDart.replaceAll('FirebaseOptions(', ''),
        'marker ci-placeholder': markerInApiKey('ci-placeholder'),
        'marker PLACEHOLDER': markerInApiKey('PLACEHOLDER'),
        'marker ChangeMe': markerInApiKey('ChangeMe'),
        'marker example': markerInApiKey('example'),
      };

      for (final entry in cases.entries) {
        final label = entry.key.replaceAll(RegExp(r'[^a-zA-Z0-9]+'), '-');
        final tmp = _tmp('dart-invalid-$label');
        final mutatedDart = entry.value;
        final env = Map<String, String>.of(_validTestEnv())
          ..['FIREBASE_OPTIONS_DART_BASE64'] = _b64(mutatedDart);
        final result = await _runPrepare(tmp, env);

        _expectRejected(result, 'FIREBASE_OPTIONS_DART_BASE64');
        _expectNoPartialFiles(tmp);
        expect(result.all, isNot(contains(mutatedDart)),
            reason:
                '${entry.key}: decoded Dart content must not appear in output');
      }
    }, timeout: _arm64ProcessTimeout);

    test('rejects unusable google-services JSON before writing files',
        () async {
      expectScriptExists();

      String mutated(void Function(Map<String, dynamic> json) mutate) {
        final json =
            jsonDecode(_testGoogleServicesJson()) as Map<String, dynamic>;
        mutate(json);
        return jsonEncode(json);
      }

      Map<String, dynamic> firstClient(Map<String, dynamic> json) =>
          (json['client'] as List).first as Map<String, dynamic>;

      final cases = <String, String>{
        'empty object': '{}',
        'missing project_info.project_id': mutated((json) {
          (json['project_info'] as Map<String, dynamic>).remove('project_id');
        }),
        'blank project_id': mutated((json) {
          (json['project_info'] as Map<String, dynamic>)['project_id'] = '';
        }),
        'no clients': mutated((json) {
          json['client'] = <Object>[];
        }),
        'wrong Android package': mutated((json) {
          final clientInfo =
              firstClient(json)['client_info'] as Map<String, dynamic>;
          clientInfo['android_client_info'] = {
            'package_name': 'com.wrong.package',
          };
        }),
        'missing app id': mutated((json) {
          final clientInfo =
              firstClient(json)['client_info'] as Map<String, dynamic>;
          clientInfo.remove('mobilesdk_app_id');
        }),
        'missing api_key current_key': mutated((json) {
          firstClient(json)['api_key'] = <Object>[<String, Object>{}];
        }),
        'blank api_key current_key': mutated((json) {
          firstClient(json)['api_key'] = <Object>[
            <String, Object>{'current_key': ''}
          ];
        }),
        'marker ci-placeholder in project_id': mutated((json) {
          (json['project_info'] as Map<String, dynamic>)['project_id'] =
              'ci-placeholder';
        }),
        'marker PLACEHOLDER in project_id': mutated((json) {
          (json['project_info'] as Map<String, dynamic>)['project_id'] =
              'PLACEHOLDER';
        }),
        'marker ChangeMe in project_id': mutated((json) {
          (json['project_info'] as Map<String, dynamic>)['project_id'] =
              'ChangeMe';
        }),
        'marker example in project_id': mutated((json) {
          (json['project_info'] as Map<String, dynamic>)['project_id'] =
              'example';
        }),
      };

      for (final entry in cases.entries) {
        final label = entry.key.replaceAll(RegExp(r'[^a-zA-Z0-9]+'), '-');
        final tmp = _tmp('services-invalid-$label');
        final mutatedJson = entry.value;
        final env = Map<String, String>.of(_validTestEnv())
          ..['GOOGLE_SERVICES_JSON_BASE64'] = _b64(mutatedJson);
        final result = await _runPrepare(tmp, env);

        _expectRejected(result, 'GOOGLE_SERVICES_JSON_BASE64');
        _expectNoPartialFiles(tmp);
        expect(result.all, isNot(contains(mutatedJson)),
            reason: '${entry.key}: decoded JSON content must not appear '
                'in output');
      }
    }, timeout: _arm64ProcessTimeout);

    test('rejects invalid fingerprint format', () async {
      expectScriptExists();
      final tmp = _tmp('bad-fingerprint');
      final env = Map<String, String>.of(_validTestEnv())
        ..['TEST_DEBUG_CERT_SHA256'] = 'not-a-valid-hex';
      final result = await _runPrepare(tmp, env);

      _expectRejected(result, 'TEST_DEBUG_CERT_SHA256');
      _expectNoPartialFiles(tmp);
    });

    test('rejects fingerprint with wrong length', () async {
      expectScriptExists();
      final tmp = _tmp('short-fingerprint');
      final env = Map<String, String>.of(_validTestEnv())
        ..['TEST_DEBUG_CERT_SHA256'] = _testCertSha256.substring(0, 63);
      final result = await _runPrepare(tmp, env);

      _expectRejected(result, 'TEST_DEBUG_CERT_SHA256');
      _expectNoPartialFiles(tmp);
    });

    test(
        'materializes firebase_options.dart, google-services.json, and '
        'debug.keystore atomically with correct content', () async {
      expectScriptExists();
      final tmp = _tmp('happy');
      final home = Directory.systemTemp.createTempSync('test-home-');
      addTearDown(() => home.deleteSync(recursive: true));
      final env = _validTestEnv();
      final result = await _runPrepare(tmp, env, home: home.path);

      _expectMaterialized(tmp, env, result, homePath: home.path);
      _expectNoSecretOutput(result, env);
    });

    test('never prints secrets or decoded content to stdout or stderr',
        () async {
      expectScriptExists();
      final tmp = _tmp('noleak');
      final home = Directory.systemTemp.createTempSync('test-home-');
      addTearDown(() => home.deleteSync(recursive: true));
      final env = _validTestEnv();
      final result = await _runPrepare(tmp, env, home: home.path);

      expect(result.exitCode, 0, reason: result.all);
      _expectNoSecretOutput(result, env);
    });

    test('debug.keystore has mode 0600 (owner read/write only)', () async {
      expectScriptExists();
      final tmp = _tmp('perms');
      final home = Directory.systemTemp.createTempSync('test-home-');
      addTearDown(() => home.deleteSync(recursive: true));
      final env = _validTestEnv();
      final result = await _runPrepare(tmp, env, home: home.path);

      expect(result.exitCode, 0, reason: result.all);
      final keystore = File('${home.path}/.android/debug.keystore');
      expect(keystore.existsSync(), isTrue,
          reason: 'debug.keystore must exist');
      final stat = keystore.statSync();
      // Mode 0600 = 384 decimal; only owner rw
      expect(stat.mode & 0x1ff, 0x180,
          reason: 'debug.keystore mode must be 0600 (octal), '
              'got 0${(stat.mode & 0x1ff).toRadixString(8)}');
    });

    test(
        'is idempotent: a second identical run leaves byte-identical artifacts',
        () async {
      expectScriptExists();
      final tmp = _tmp('idempotent');
      final home = Directory.systemTemp.createTempSync('test-home-');
      addTearDown(() => home.deleteSync(recursive: true));
      final env = _validTestEnv();

      final first = await _runPrepare(tmp, env, home: home.path);
      _expectMaterialized(tmp, env, first, homePath: home.path);

      List<int> bytesOf(String relativePath) =>
          File('${tmp.path}/$relativePath').readAsBytesSync();
      final before = <String, List<int>>{
        'lib/core/firebase/firebase_options.dart':
            bytesOf('lib/core/firebase/firebase_options.dart'),
        'android/app/google-services.json':
            bytesOf('android/app/google-services.json'),
      };

      final second = await _runPrepare(tmp, env, home: home.path);
      expect(second.exitCode, 0, reason: second.all);
      for (final entry in before.entries) {
        expect(bytesOf(entry.key), entry.value,
            reason: '${entry.key} must be identical after a second run');
      }
      // Keystore too
      final keystore1 = File('${home.path}/.android/debug.keystore');
      expect(keystore1.existsSync(), isTrue);
    });

    test('cleans previously materialized secrets when a later attempt fails',
        () async {
      expectScriptExists();
      final tmp = _tmp('cleanup');
      final home = Directory.systemTemp.createTempSync('test-home-');
      addTearDown(() => home.deleteSync(recursive: true));
      final env = _validTestEnv();

      final first = await _runPrepare(tmp, env, home: home.path);
      _expectMaterialized(tmp, env, first, homePath: home.path);

      final broken = Map<String, String>.of(env)
        ..remove('TEST_DEBUG_CERT_SHA256');
      final second = await _runPrepare(tmp, broken, home: home.path);
      expect(second.exitCode, isNot(0),
          reason: 'a run missing a secret must fail');
      _expectNoPartialFiles(tmp);
      _expectNoKeystoreInHome(home.path);
    });
  });

  group(
      'tool/ci/prepare_android_test_apk.sh keytool validation (KEYTOOL_BIN seam)',
      () {
    void expectScriptExists() {
      expect(File(_prepareScript).existsSync(), isTrue,
          reason: '$_prepareScript must be committed before these tests pass');
    }

    test(
        'accepts a valid keystore when KEYTOOL_BIN points at a fake keytool '
        'that validates alias androiddebugkey and storepass android', () async {
      expectScriptExists();
      final tmp = _tmp('keytool-seam');
      final home = Directory.systemTemp.createTempSync('test-home-');
      addTearDown(() => home.deleteSync(recursive: true));
      final env = Map<String, String>.of(_validTestEnv())
        ..['KEYTOOL_BIN'] = _fakeKeytoolAccept;
      final result = await _runPrepare(tmp, env, home: home.path);

      _expectMaterialized(tmp, env, result, homePath: home.path);
    });

    test(
        'rejects the keystore when keytool validation fails (invalid alias, '
        'storepass, or format)', () async {
      expectScriptExists();
      final tmp = _tmp('keytool-invalid');
      final home = Directory.systemTemp.createTempSync('test-home-');
      addTearDown(() => home.deleteSync(recursive: true));
      final env = Map<String, String>.of(_validTestEnv())
        ..['KEYTOOL_BIN'] = _fakeKeytoolReject;
      final result = await _runPrepare(tmp, env, home: home.path);

      _expectRejected(result, 'TEST_DEBUG_KEYSTORE_BASE64');
      _expectNoPartialFiles(tmp);
      _expectNoKeystoreInHome(home.path);
    });

    test(
        'rejects when keytool -exportcert exits 0 but emits bytes whose '
        'SHA-256 does not match TEST_DEBUG_CERT_SHA256 (certificate identity '
        'mismatch) before any files materialize', () async {
      expectScriptExists();
      final tmp = _tmp('keytool-mismatch');
      final home = Directory.systemTemp.createTempSync('test-home-');
      addTearDown(() => home.deleteSync(recursive: true));
      final env = Map<String, String>.of(_validTestEnv())
        ..['KEYTOOL_BIN'] = _fakeKeytoolMismatchedCert;
      final result = await _runPrepare(tmp, env, home: home.path);

      _expectRejected(result, 'TEST_DEBUG_KEYSTORE_BASE64');
      _expectNoPartialFiles(tmp);
      _expectNoKeystoreInHome(home.path);

      // Generic mismatch reason — never print the cert payload, the expected
      // digest, environment values, or decoded content.
      expect(
          result.all.toLowerCase(),
          anyOf(
            contains('mismatch'),
            contains('certificate'),
            contains('identity'),
          ),
          reason: 'error must name a generic certificate/fingerprint mismatch '
              'without printing payload or digest values');
      expect(result.all, isNot(contains(_mismatchedExportCertBytes)),
          reason: 'export-cert payload must not leak into output');
      expect(result.all, isNot(contains(_testCertSha256)),
          reason: 'expected fingerprint digest must not leak into output');
      expect(result.all, isNot(contains(_acceptedExportCertBytes)),
          reason: 'accepted cert payload must not leak into output');
    });

    test(
        'script defaults KEYTOOL_BIN to the literal "keytool" and uses -exportcert',
        () {
      expectScriptExists();
      final raw = File(_prepareScript).readAsStringSync();

      expect(raw, contains('KEYTOOL_BIN'),
          reason: 'script must reference a KEYTOOL_BIN seam variable');
      expect(raw, contains(':-keytool'),
          reason:
              'KEYTOOL_BIN must default to the literal "keytool" executable');
      expect(raw, contains('androiddebugkey'),
          reason: 'script must validate alias androiddebugkey');
      expect(raw, contains('-storepass'),
          reason: 'script must validate storepass android via keytool');
      expect(raw, contains('-exportcert'),
          reason:
              'script must use keytool -exportcert for certificate identity');
    });
  });

  group('tool/ci/prepare_android_test_apk.sh cleanup subcommand', () {
    void expectScriptExists() {
      expect(File(_prepareScript).existsSync(), isTrue,
          reason: '$_prepareScript must be committed before these tests pass');
    }

    test(
        'cleanup removes every exact materialized secret path independently '
        'of prepare', () async {
      expectScriptExists();
      final tmp = _tmp('cleanup-direct');
      final home = Directory.systemTemp.createTempSync('test-home-');
      addTearDown(() => home.deleteSync(recursive: true));
      final env = _validTestEnv();
      final prepareResult = await _runPrepare(tmp, env, home: home.path);
      _expectMaterialized(tmp, env, prepareResult, homePath: home.path);

      final cleanupResult = await _runCleanup(tmp, home: home.path);
      expect(cleanupResult.exitCode, 0, reason: cleanupResult.all);
      _expectNoPartialFiles(tmp);
      _expectNoKeystoreInHome(home.path);
    });

    test(
        'cleanup is idempotent: repeated runs on an already-clean root still '
        'succeed and leave it clean', () async {
      expectScriptExists();
      final tmp = _tmp('cleanup-idempotent');
      final home = Directory.systemTemp.createTempSync('test-home-');
      addTearDown(() => home.deleteSync(recursive: true));
      final env = _validTestEnv();
      final prepareResult = await _runPrepare(tmp, env, home: home.path);
      _expectMaterialized(tmp, env, prepareResult, homePath: home.path);

      final first = await _runCleanup(tmp, home: home.path);
      expect(first.exitCode, 0, reason: first.all);
      _expectNoPartialFiles(tmp);

      final second = await _runCleanup(tmp, home: home.path);
      expect(second.exitCode, 0, reason: second.all);
      _expectNoPartialFiles(tmp);
    });

    test('cleanup on a root that was never prepared exits cleanly', () async {
      expectScriptExists();
      final tmp = _tmp('cleanup-empty');
      final home = Directory.systemTemp.createTempSync('test-home-');
      addTearDown(() => home.deleteSync(recursive: true));
      final result = await _runCleanup(tmp, home: home.path);
      expect(result.exitCode, 0, reason: result.all);
      _expectNoPartialFiles(tmp);
    });

    test(
        'cleanup removes exactly the materialized debug.keystore from home '
        'and leaves unrelated files untouched', () async {
      expectScriptExists();
      final tmp = _tmp('cleanup-selective');
      final home = Directory.systemTemp.createTempSync('test-home-');
      addTearDown(() => home.deleteSync(recursive: true));
      final appDir = Directory('${tmp.path}/android/app')
        ..createSync(recursive: true);
      final keepJks = File('${appDir.path}/keep.jks')
        ..writeAsStringSync('keep');
      final keepKeystore = File('${appDir.path}/keep.keystore')
        ..writeAsStringSync('keep');

      final result = await _runCleanup(tmp, home: home.path);
      expect(result.exitCode, 0, reason: result.all);

      expect(keepJks.existsSync(), isTrue,
          reason: 'cleanup must not remove unrelated .jks files');
      expect(keepKeystore.existsSync(), isTrue,
          reason: 'cleanup must not remove unrelated .keystore files');
    });
  });

  group('tool/ci/prepare_android_test_apk.sh verify-fingerprint subcommand',
      () {
    void expectScriptExists() {
      expect(File(_prepareScript).existsSync(), isTrue,
          reason: '$_prepareScript must be committed before these tests pass');
    }

    test(
        'normalizes colons and surrounding whitespace, then uppercases '
        'before accepting an equal fingerprint', () async {
      expectScriptExists();
      final expected = _testCertSha256.toUpperCase();
      final actual = '  ${_colonize(_testCertSha256).toLowerCase()}  \n';
      final result = await _runVerifyFingerprint(expected, actual);
      expect(result.exitCode, 0, reason: result.all);
    });

    test('exits nonzero when normalized fingerprints do not match', () async {
      expectScriptExists();
      final expected = _testCertSha256.toUpperCase();
      final actual = sha256.convert(utf8.encode('a-different-cert')).toString();
      final result = await _runVerifyFingerprint(expected, actual);
      expect(result.exitCode, isNot(0), reason: result.all);
    });

    test(
        'rejects fingerprints that are not exactly 64 hex digits after '
        'normalization, on either side', () async {
      expectScriptExists();
      final malformed = <String>[
        _testCertSha256.substring(0, 63), // too short
        '${_testCertSha256}ab', // too long
        'z' * 64, // non-hex
      ];
      for (final bad in malformed) {
        final asExpected = await _runVerifyFingerprint(bad, _testCertSha256);
        expect(asExpected.exitCode, isNot(0),
            reason:
                'malformed expected value must be rejected: ${asExpected.all}');

        final asActual = await _runVerifyFingerprint(_testCertSha256, bad);
        expect(asActual.exitCode, isNot(0),
            reason: 'malformed actual value must be rejected: ${asActual.all}');
      }
    });
  });

  // =========================================================================
  // Real FlutterFire output uses double-quoted field literals; the fixture
  // above (and the validator's parser) use single quotes. These hermetic
  // process tests exercise the double-quoted form directly against the
  // real preparation script.
  // =========================================================================

  group(
      'tool/ci/prepare_android_test_apk.sh double-quoted FirebaseOptions '
      '(real FlutterFire output format)', () {
    void expectScriptExists() {
      expect(File(_prepareScript).existsSync(), isTrue,
          reason: '$_prepareScript must be committed before these tests pass');
    }

    test(
        'accepts a valid double-quoted FirebaseOptions literal, materializes '
        'exact Dart bytes, and cross-matches against google-services.json',
        () async {
      expectScriptExists();
      final tmp = _tmp('doublequote-happy');
      final home = Directory.systemTemp.createTempSync('test-home-');
      addTearDown(() => home.deleteSync(recursive: true));
      final env = Map<String, String>.of(_validTestEnv())
        ..['FIREBASE_OPTIONS_DART_BASE64'] =
            _b64(_testFirebaseOptionsDartDoubleQuoted);
      final result = await _runPrepare(tmp, env, home: home.path);

      _expectMaterialized(tmp, env, result, homePath: home.path);
    });

    test('rejects blank double-quoted field values with no partial files',
        () async {
      expectScriptExists();
      for (final field in _dartRequiredFieldsForTest) {
        final tmp = _tmp('doublequote-blank-$field');
        final blanked = _testFirebaseOptionsDartDoubleQuoted.replaceAll(
            RegExp('$field: "[^"]*"'), '$field: ""');
        final env = Map<String, String>.of(_validTestEnv())
          ..['FIREBASE_OPTIONS_DART_BASE64'] = _b64(blanked);
        final result = await _runPrepare(tmp, env);

        _expectRejected(result, 'FIREBASE_OPTIONS_DART_BASE64');
        expect(result.all.toLowerCase(), contains('blank'),
            reason: 'output must mention the blank reason for $field');
        expect(result.all, contains(field),
            reason: 'output must name the blanked field $field');
        _expectNoPartialFiles(tmp);
      }
    }, timeout: _arm64ProcessTimeout);

    test(
        'rejects placeholder markers in double-quoted field values with no '
        'partial files', () async {
      expectScriptExists();
      for (final marker in [
        'ci-placeholder',
        'PLACEHOLDER',
        'ChangeMe',
        'example'
      ]) {
        final tmp = _tmp(
            'doublequote-marker-${marker.replaceAll(RegExp(r'[^a-zA-Z0-9]+'), '-')}');
        final markered = _testFirebaseOptionsDartDoubleQuoted.replaceAll(
            RegExp('apiKey: "[^"]*"'), 'apiKey: "$marker"');
        final env = Map<String, String>.of(_validTestEnv())
          ..['FIREBASE_OPTIONS_DART_BASE64'] = _b64(markered);
        final result = await _runPrepare(tmp, env);

        _expectRejected(result, 'FIREBASE_OPTIONS_DART_BASE64');
        expect(result.all.toLowerCase(), contains('placeholder'),
            reason:
                'output must mention the placeholder reason for marker $marker');
        expect(result.all, isNot(contains(marker)),
            reason: 'marker value "$marker" must not leak into output');
        _expectNoPartialFiles(tmp);
      }
    }, timeout: _arm64ProcessTimeout);

    test(
        'rejects double-quoted field value followed by adjacent concatenation '
        '(parser must not accept the literal prefix alone)', () async {
      expectScriptExists();
      final tmp = _tmp('doublequote-concat');
      final home = Directory.systemTemp.createTempSync('test-home-');
      addTearDown(() => home.deleteSync(recursive: true));

      // Replace the apiKey double-quoted literal with a concatenation that
      // keeps a valid literal prefix followed by an adjacent expression.
      final concatenated = _testFirebaseOptionsDartDoubleQuoted.replaceFirst(
          RegExp('apiKey: "[^"]*"'), 'apiKey: "$_testApiKey" + "suffix"');
      final env = Map<String, String>.of(_validTestEnv())
        ..['FIREBASE_OPTIONS_DART_BASE64'] = _b64(concatenated);
      final result = await _runPrepare(tmp, env, home: home.path);

      _expectRejected(result, 'FIREBASE_OPTIONS_DART_BASE64');
      _expectNoPartialFiles(tmp);
      _expectNoSecretOutput(result, env);
    }, timeout: _arm64ProcessTimeout);
  });

  // =========================================================================
  // Behavioral RED tests for a future verify-apk-certificate subcommand
  // of tool/ci/prepare_android_test_apk.sh.
  //
  // The subcommand signature:
  //   verify-apk-certificate --apk PATH --expected SHA256 --output-env PATH
  //
  // It uses APKSIGNER_BIN and OPENSSL_BIN env seams, runs
  //   apksigner verify --print-certs-pem APK
  // to extract PEM certificate blocks, converts the primary (first) PEM
  // to DER via openssl, hashes the DER bytes, and compares against the
  // expected SHA-256 fingerprint.  On success it writes
  //   NORMALIZED_ACTUAL=<uppercase hex> to --output-env.
  //
  // These tests generate two real self-signed certs at runtime using the
  // system openssl, derive their DER hashes with Dart crypto, and exercise
  // every diagnostic path hermetically through the APKSIGNER_BIN / OPENSSL_BIN
  // seams.  No static PEM constants.  No production file is touched.
  // =========================================================================

  group('tool/ci/prepare_android_test_apk.sh verify-apk-certificate', () {
    void expectScriptExists() {
      expect(File(_prepareScript).existsSync(), isTrue,
          reason: '$_prepareScript must be committed before these tests pass');
    }

    // --- Runtime-generated PEM fixtures (two distinct self-signed certs) ---

    late final String _primaryPem;
    late final String _secondaryPem;
    late final String _primaryDerSha256;
    late final String _secondaryDerSha256;
    late final Directory _certDir;

    setUpAll(() async {
      _certDir = Directory.systemTemp.createTempSync('cert-gen-');

      // Generate primary cert
      final primaryKey = '${_certDir.path}/primary.key';
      final primaryCrt = '${_certDir.path}/primary.crt';
      final primaryDer = '${_certDir.path}/primary.der';
      var r = await Process.run('openssl', [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-keyout',
        primaryKey,
        '-out',
        primaryCrt,
        '-days',
        '1',
        '-nodes',
        '-subj',
        '/CN=TestPrimarySigner/O=CalorixTest',
      ]);
      expect(r.exitCode, 0,
          reason: 'openssl primary cert gen failed: ${r.stderr}');
      r = await Process.run('openssl', [
        'x509',
        '-in',
        primaryCrt,
        '-outform',
        'DER',
        '-out',
        primaryDer,
      ]);
      expect(r.exitCode, 0, reason: 'openssl primary DER failed: ${r.stderr}');
      _primaryPem = File(primaryCrt).readAsStringSync();
      final primaryDerBytes = File(primaryDer).readAsBytesSync();
      _primaryDerSha256 =
          sha256.convert(primaryDerBytes).toString().toUpperCase();

      // Generate secondary cert
      final secondaryKey = '${_certDir.path}/secondary.key';
      final secondaryCrt = '${_certDir.path}/secondary.crt';
      final secondaryDer = '${_certDir.path}/secondary.der';
      r = await Process.run('openssl', [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-keyout',
        secondaryKey,
        '-out',
        secondaryCrt,
        '-days',
        '1',
        '-nodes',
        '-subj',
        '/CN=TestSecondarySigner/O=CalorixStamp',
      ]);
      expect(r.exitCode, 0,
          reason: 'openssl secondary cert gen failed: ${r.stderr}');
      r = await Process.run('openssl', [
        'x509',
        '-in',
        secondaryCrt,
        '-outform',
        'DER',
        '-out',
        secondaryDer,
      ]);
      expect(r.exitCode, 0,
          reason: 'openssl secondary DER failed: ${r.stderr}');
      _secondaryPem = File(secondaryCrt).readAsStringSync();
      final secondaryDerBytes = File(secondaryDer).readAsBytesSync();
      _secondaryDerSha256 =
          sha256.convert(secondaryDerBytes).toString().toUpperCase();
    });

    tearDownAll(() {
      _certDir.deleteSync(recursive: true);
    });

    /// Writes a fake apksigner that validates exact invocation:
    ///   verify --print-certs-pem <apk-path>
    /// Exactly 3 arguments must be present. [expectedApkPath] is the path
    /// the caller expects to be passed as `$3`.
    /// On success emits the given PEM blocks on stdout.
    /// If [exitCode] is non-zero, exits with that code and emits [stderrOutput].
    String _writeFakeApksigner({
      required String pemOutput,
      required String expectedApkPath,
      int exitCode = 0,
      String stderrOutput = '',
    }) {
      final dir = Directory.systemTemp.createTempSync('fake-apksigner-');
      addTearDown(() => dir.deleteSync(recursive: true));
      final script = File('${dir.path}/apksigner');
      final escapedPem = pemOutput.replaceAll("'", "'\\''");
      final escapedApk = expectedApkPath.replaceAll("'", "'\\''");
      final buf = StringBuffer('#!/usr/bin/env bash\nset -euo pipefail\n');
      if (exitCode == 0) {
        // Validate exact arg count: verify --print-certs-pem <apk>
        buf.writeln('if [ "\$#" -ne 3 ]; then');
        buf.writeln('  echo "apksigner: expected exactly 3 arguments" >&2');
        buf.writeln('  exit 1');
        buf.writeln('fi');
        buf.writeln('if [ "\$1" != "verify" ]; then');
        buf.writeln('  echo "apksigner: expected \'verify\' subcommand" >&2');
        buf.writeln('  exit 1');
        buf.writeln('fi');
        buf.writeln('if [ "\$2" != "--print-certs-pem" ]; then');
        buf.writeln(
            '  echo "apksigner: expected \'--print-certs-pem\' flag" >&2');
        buf.writeln('  exit 1');
        buf.writeln('fi');
        buf.writeln('if [ "\$3" != \'$escapedApk\' ]; then');
        buf.writeln('  echo "apksigner: unexpected APK path \'\$3\'" >&2');
        buf.writeln('  exit 1');
        buf.writeln('fi');
        buf.writeln("printf '%s\\n' '$escapedPem'");
        buf.writeln('exit 0');
      } else {
        final escapedStderr =
            stderrOutput.replaceAll(r'\', r'\\').replaceAll("'", "'\\''");
        buf.writeln("printf '%s\\n' '$escapedStderr'");
        buf.writeln('exit $exitCode');
      }
      script.writeAsStringSync(buf.toString());
      Process.runSync('chmod', ['+x', script.path]);
      return script.path;
    }

    /// Writes a fake openssl that fails x509 DER conversion on purpose.
    /// Used only for the deliberate-openssl-failure test.
    String _writeFakeOpenSSLFail() {
      final dir = Directory.systemTemp.createTempSync('fake-openssl-fail-');
      addTearDown(() => dir.deleteSync(recursive: true));
      final script = File('${dir.path}/openssl');
      script.writeAsStringSync('''#!/usr/bin/env bash
echo "openssl: DER conversion failed" >&2
exit 1
''');
      Process.runSync('chmod', ['+x', script.path]);
      return script.path;
    }

    Future<_PrepareResult> _runVerifyApkCertificate(
      String apkPath,
      String expectedSha256,
      String outputEnvPath, {
      Map<String, String>? extraEnv,
    }) async {
      final script = File(_prepareScript).absolute.path;
      final env = <String, String>{
        ...Platform.environment,
        ...?extraEnv,
      };
      final result = await Process.run(
        'bash',
        [
          script,
          'verify-apk-certificate',
          '--apk',
          apkPath,
          '--expected',
          expectedSha256,
          '--output-env',
          outputEnvPath,
        ],
        workingDirectory: Directory.current.path,
        environment: env,
      );
      return _PrepareResult(result);
    }

    test(
        'subcommand verify-apk-certificate is recognized and exits '
        'nonzero with exact "--apk is required" when --apk is missing',
        () async {
      expectScriptExists();
      final result = await Process.run(
        'bash',
        [File(_prepareScript).absolute.path, 'verify-apk-certificate'],
        workingDirectory: Directory.current.path,
      );
      expect(result.exitCode, isNot(0),
          reason: 'verify-apk-certificate with no args must fail: '
              '${result.stderr}\n${result.stdout}');
      final combined = '${result.stderr}\n${result.stdout}';
      expect(combined, contains('--apk is required'),
          reason: 'the script must emit the exact diagnostic '
              '"--apk is required" when --apk is missing, not just exit nonzero');
    });

    test(
        'happy path: primary certificate matches expected fingerprint, '
        'writes NORMALIZED_ACTUAL uppercase to output-env', () async {
      expectScriptExists();
      final tmp = _tmp('verify-apk-happy');
      final apk = File('${tmp.path}/dummy.apk')..writeAsStringSync('fake');
      final outputEnv = File('${tmp.path}/app.env');
      final fakeApksigner = _writeFakeApksigner(
        pemOutput: '$_primaryPem\n$_secondaryPem',
        expectedApkPath: apk.path,
      );

      final result = await _runVerifyApkCertificate(
        apk.path,
        _primaryDerSha256,
        outputEnv.path,
        extraEnv: {'APKSIGNER_BIN': fakeApksigner},
      );

      expect(result.exitCode, 0, reason: result.all);
      expect(outputEnv.existsSync(), isTrue,
          reason: 'output-env file must be created on success');
      final envContent = outputEnv.readAsStringSync();
      expect(envContent, contains('NORMALIZED_ACTUAL=$_primaryDerSha256'),
          reason: 'output-env must contain NORMALIZED_ACTUAL with the '
              'uppercase DER hash');
    });

    test(
        'first-cert extraction: emits both primary and secondary PEMs, '
        'expects secondary fingerprint which must mismatch because '
        'the primary cert is authoritative → EXACT "fingerprint mismatch"',
        () async {
      expectScriptExists();
      final tmp = _tmp('verify-apk-secondary');
      final apk = File('${tmp.path}/dummy.apk')..writeAsStringSync('fake');
      final outputEnv = File('${tmp.path}/app.env');
      // Emit BOTH primary and secondary PEMs; expect the secondary fingerprint.
      // The script must extract the first (primary) PEM, so it will mismatch.
      final fakeApksigner = _writeFakeApksigner(
        pemOutput: '$_primaryPem\n$_secondaryPem',
        expectedApkPath: apk.path,
      );

      final result = await _runVerifyApkCertificate(
        apk.path,
        _secondaryDerSha256,
        outputEnv.path,
        extraEnv: {'APKSIGNER_BIN': fakeApksigner},
      );

      expect(result.exitCode, isNot(0),
          reason: 'secondary fingerprint with two-cert output must fail: '
              '${result.all}');
      expect(result.all, contains('fingerprint mismatch'),
          reason: 'error must contain exact "fingerprint mismatch" string');
      expect(outputEnv.existsSync(), isFalse,
          reason: 'output-env must not exist on failure');
    });

    test('apksigner nonzero exit: emits EXACT "apksigner verify failed"',
        () async {
      expectScriptExists();
      final tmp = _tmp('verify-apk-apksigner-fail');
      final apk = File('${tmp.path}/dummy.apk')..writeAsStringSync('fake');
      final outputEnv = File('${tmp.path}/app.env');
      final fakeApksigner = _writeFakeApksigner(
        pemOutput: '',
        expectedApkPath: apk.path,
        exitCode: 1,
        stderrOutput: 'apksigner: unable to locate jar',
      );

      final result = await _runVerifyApkCertificate(
        apk.path,
        _primaryDerSha256,
        outputEnv.path,
        extraEnv: {'APKSIGNER_BIN': fakeApksigner},
      );

      expect(result.exitCode, isNot(0),
          reason: 'apksigner failure must cause nonzero exit');
      expect(result.all, contains('apksigner verify failed'),
          reason: 'diagnostic must contain exact "apksigner verify failed"');
      expect(outputEnv.existsSync(), isFalse,
          reason: 'output-env must not exist on failure');
    });

    test(
        'apksigner emits no PEM blocks: emits EXACT '
        '"missing signing certificate PEM"', () async {
      expectScriptExists();
      final tmp = _tmp('verify-apk-no-pem');
      final apk = File('${tmp.path}/dummy.apk')..writeAsStringSync('fake');
      final outputEnv = File('${tmp.path}/app.env');
      final fakeApksigner = _writeFakeApksigner(
        pemOutput: '',
        expectedApkPath: apk.path,
      );

      final result = await _runVerifyApkCertificate(
        apk.path,
        _primaryDerSha256,
        outputEnv.path,
        extraEnv: {'APKSIGNER_BIN': fakeApksigner},
      );

      expect(result.exitCode, isNot(0),
          reason: 'empty PEM output must cause nonzero exit');
      expect(result.all, contains('missing signing certificate PEM'),
          reason: 'diagnostic must contain exact '
              '"missing signing certificate PEM"');
      expect(outputEnv.existsSync(), isFalse,
          reason: 'output-env must not exist on failure');
    });

    test(
        'apksigner emits malformed PEM (no BEGIN marker): emits EXACT '
        '"missing signing certificate PEM"', () async {
      expectScriptExists();
      final tmp = _tmp('verify-apk-malformed-pem');
      final apk = File('${tmp.path}/dummy.apk')..writeAsStringSync('fake');
      final outputEnv = File('${tmp.path}/app.env');
      final fakeApksigner = _writeFakeApksigner(
        pemOutput: 'THIS IS NOT A PEM BLOCK\nGARBAGE DATA\n',
        expectedApkPath: apk.path,
      );

      final result = await _runVerifyApkCertificate(
        apk.path,
        _primaryDerSha256,
        outputEnv.path,
        extraEnv: {'APKSIGNER_BIN': fakeApksigner},
      );

      expect(result.exitCode, isNot(0),
          reason: 'malformed PEM must cause nonzero exit');
      expect(result.all, contains('missing signing certificate PEM'),
          reason: 'diagnostic must contain exact '
              '"missing signing certificate PEM"');
      expect(outputEnv.existsSync(), isFalse,
          reason: 'output-env must not exist on failure');
    });

    test(
        'apksigner emits incomplete PEM (BEGIN but no END): emits EXACT '
        '"missing signing certificate PEM"', () async {
      expectScriptExists();
      final tmp = _tmp('verify-apk-incomplete-pem');
      final apk = File('${tmp.path}/dummy.apk')..writeAsStringSync('fake');
      final outputEnv = File('${tmp.path}/app.env');
      // Derive the non-marker base64 snippet from the runtime primary cert
      // rather than hardcoding a specific certificate's body.
      final primaryLines = _primaryPem.split('\n');
      final bodyLine = primaryLines.firstWhere(
        (l) =>
            l.isNotEmpty &&
            !l.contains('-----') &&
            RegExp(r'^[A-Za-z0-9+/]').hasMatch(l),
        orElse: () => 'NOBODYFOUND',
      );
      final incompletePem = '-----BEGIN CERTIFICATE-----\n$bodyLine\n';
      final fakeApksigner = _writeFakeApksigner(
        pemOutput: incompletePem,
        expectedApkPath: apk.path,
      );

      final result = await _runVerifyApkCertificate(
        apk.path,
        _primaryDerSha256,
        outputEnv.path,
        extraEnv: {'APKSIGNER_BIN': fakeApksigner},
      );

      expect(result.exitCode, isNot(0),
          reason: 'incomplete PEM must cause nonzero exit');
      expect(result.all, contains('missing signing certificate PEM'),
          reason: 'diagnostic must contain exact '
              '"missing signing certificate PEM"');
      expect(outputEnv.existsSync(), isFalse,
          reason: 'output-env must not exist on failure');
    });

    test(
        'openssl conversion failure: emits EXACT '
        '"certificate DER conversion failed"', () async {
      expectScriptExists();
      final tmp = _tmp('verify-apk-openssl-fail');
      final apk = File('${tmp.path}/dummy.apk')..writeAsStringSync('fake');
      final outputEnv = File('${tmp.path}/app.env');
      final fakeApksigner = _writeFakeApksigner(
        pemOutput: _primaryPem,
        expectedApkPath: apk.path,
      );
      final fakeOpenSSL = _writeFakeOpenSSLFail();

      final result = await _runVerifyApkCertificate(
        apk.path,
        _primaryDerSha256,
        outputEnv.path,
        extraEnv: {
          'APKSIGNER_BIN': fakeApksigner,
          'OPENSSL_BIN': fakeOpenSSL,
        },
      );

      expect(result.exitCode, isNot(0),
          reason: 'openssl failure must cause nonzero exit');
      expect(result.all, contains('certificate DER conversion failed'),
          reason: 'diagnostic must contain exact '
              '"certificate DER conversion failed"');
      expect(outputEnv.existsSync(), isFalse,
          reason: 'output-env must not exist on failure');
    });

    test('console output leaks no hashes, PEM blocks, subjects, or secrets',
        () async {
      expectScriptExists();
      final tmp = _tmp('verify-apk-no-leak');
      final apk = File('${tmp.path}/dummy.apk')..writeAsStringSync('fake');
      final outputEnv = File('${tmp.path}/app.env');
      final fakeApksigner = _writeFakeApksigner(
        pemOutput: '$_primaryPem\n$_secondaryPem',
        expectedApkPath: apk.path,
      );

      final result = await _runVerifyApkCertificate(
        apk.path,
        _primaryDerSha256,
        outputEnv.path,
        extraEnv: {'APKSIGNER_BIN': fakeApksigner},
      );

      expect(result.exitCode, 0, reason: result.all);
      final combined = result.all;

      // No DER hash leaks.
      expect(combined, isNot(contains(_primaryDerSha256)),
          reason: 'primary DER hash must not appear in console output');
      expect(combined, isNot(contains(_secondaryDerSha256)),
          reason: 'secondary DER hash must not appear in console output');

      // No PEM block content leaks.
      expect(combined, isNot(contains('BEGIN CERTIFICATE')),
          reason: 'PEM markers must not leak to console output');
      // Derive a non-marker base64 line from the runtime primary cert
      // rather than hardcoding a specific certificate's body.
      final _primaryBodyLine = _primaryPem.split('\n').firstWhere(
            (l) =>
                l.isNotEmpty &&
                !l.contains('-----') &&
                RegExp(r'^[A-Za-z0-9+/]').hasMatch(l),
            orElse: () => 'NOBODYFOUND',
          );
      expect(combined, isNot(contains(_primaryBodyLine)),
          reason: 'PEM body must not leak to console output');

      // No DN/subject strings leak.
      expect(combined, isNot(contains('TestPrimarySigner')),
          reason: 'subject CN must not leak to console output');
      expect(combined, isNot(contains('TestSecondarySigner')),
          reason: 'subject CN must not leak to console output');
      expect(combined, isNot(contains('CalorixTest')),
          reason: 'subject O must not leak to console output');
      expect(combined, isNot(contains('CalorixStamp')),
          reason: 'subject O must not leak to console output');
    });

    test(
        'workflow delegates to verify-apk-certificate; helper requests '
        '--print-certs-pem (not --print-certs or label/sed/head parsing)', () {
      final file = File(_workflow);
      expect(file.existsSync(), isTrue,
          reason: '$_workflow must exist but is absent');
      final raw = file.readAsStringSync();

      expect(raw, contains('verify-apk-certificate'),
          reason: 'workflow must call verify-apk-certificate');

      final scriptFile = File(_prepareScript);
      expect(scriptFile.existsSync(), isTrue,
          reason: '$_prepareScript must exist but is absent');
      final scriptRaw = scriptFile.readAsStringSync();

      expect(scriptRaw, contains('--print-certs-pem'),
          reason: 'helper script must contain --print-certs-pem');
      expect(
        RegExp(r'--print-certs(?!-pem)').hasMatch(scriptRaw),
        isFalse,
        reason: '--print-certs without -pem suffix is the old brittle path '
            'and must not appear in helper',
      );
    });

    test(
        'workflow contract: verify step forbids label parsing with '
        'sed or head', () {
      final file = File(_workflow);
      expect(file.existsSync(), isTrue,
          reason: '$_workflow must exist but is absent');
      final workflow = _loadWorkflowFile(_workflow);
      final steps = _buildJobSteps(workflow);

      // Select the exact "Verify test signing certificate" step.
      final verifyIndex = steps.indexWhere((step) =>
          _stepName(step) == 'Verify test signing certificate' ||
          _stepRun(step).contains('verify-apk-certificate') ||
          _stepRun(step).contains('apksigner verify'));
      expect(verifyIndex, greaterThanOrEqualTo(0),
          reason: 'Verify test signing certificate step must exist');
      final verifyRun = _stepRun(steps[verifyIndex]);

      expect(verifyRun, isNot(contains(RegExp(r'\bsed\b'))),
          reason: 'sed label parsing is forbidden in the verify step');
      expect(verifyRun, isNot(contains(RegExp(r'\bhead\b'))),
          reason: 'head-based label parsing is forbidden in the verify step');
      expect(verifyRun, isNot(contains('certificate SHA-256 digest:')),
          reason: 'human-readable digest labels are forbidden in verify step');
      expect(verifyRun, isNot(contains('RAW_CERT')),
          reason: 'RAW_CERT label extraction is forbidden in verify step');
    });

    test(
        'workflow contract: verify step must call verify-apk-certificate '
        'subcommand of the preparation script', () {
      final file = File(_workflow);
      expect(file.existsSync(), isTrue,
          reason: '$_workflow must exist but is absent');
      final raw = file.readAsStringSync();

      expect(raw, contains('verify-apk-certificate'),
          reason: 'workflow must delegate to prepare script '
              'verify-apk-certificate subcommand');
      expect(raw, contains('TEST_DEBUG_CERT_SHA256'),
          reason: 'the test cert SHA-256 must be passed to verification');
    });
  });
}

const _dartRequiredFieldsForTest = <String>[
  'apiKey',
  'appId',
  'messagingSenderId',
  'projectId',
];

/// Renders a 64-hex fingerprint the way `apksigner verify --print-certs`
/// does: uppercase pairs joined by colons, e.g. `AA:BB:CC:...`.
String _colonize(String hex) {
  final upper = hex.toUpperCase();
  final pairs = <String>[
    for (var i = 0; i < upper.length; i += 2) upper.substring(i, i + 2),
  ];
  return pairs.join(':');
}
