import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:yaml/yaml.dart';

/// Stage 3 fail-closed production release contract (RED).
///
/// The contract describes three production pieces that do not yet exist:
///
///  1. `tool/ci/prepare_android_release.sh` - a hermetic, fail-closed
///     materializer of the eight release inputs into ignored app paths,
///     exposed as three independently executable subcommands:
///       prepare --root <dir>
///       cleanup --root <dir>
///       verify-fingerprint --expected <value> --actual <value>
///     `prepare` requires these exact environment variables:
///       FIREBASE_OPTIONS_DART_BASE64, GOOGLE_SERVICES_JSON_BASE64,
///       GOOGLE_SERVICE_INFO_PLIST_BASE64, KEYSTORE_BASE64, KEYSTORE_PASSWORD,
///       KEY_ALIAS, KEY_PASSWORD, RELEASE_CERT_SHA256.
///     It rejects absent/empty inputs, malformed base64 or decoded content,
///     placeholder Firebase values, and unsafe (newline/control) property
///     values; it writes exactly these paths on success:
///       lib/core/firebase/firebase_options.dart
///       android/app/google-services.json
///       ios/Runner/GoogleService-Info.plist
///       android/app/<name>.jks
///       android/key.properties   (Java-properties escaped, storeFile app-relative)
///     It never prints secrets, is idempotent, and leaves no partial files on
///     any failure (including after a prior success). `cleanup` removes those
///     same exact materialized paths and is idempotent, independent of a
///     `prepare` run failing or succeeding first. `verify-fingerprint`
///     normalizes both values (strip colons/whitespace, uppercase), requires
///     exactly 64 hex digits on each side, accepts exact equality, and exits
///     nonzero on any mismatch or malformed value.
///  2. `.github/workflows/android-build.yml` - must run the tested preparation
///     script before `pub get`/build, build only the release APK, verify the
///     signer cert SHA-256 with `apksigner verify --print-certs` against
///     `RELEASE_CERT_SHA256` (separators/whitespace stripped, uppercased,
///     exact equality, mismatch is a hard failure), and unconditionally clean
///     every materialized secret. Placeholder values, debug signing, and
///     manual `base64 -d` decoding are forbidden.
///  3. `android/app/build.gradle.kts` - defines `signingConfigs.release`
///     reading `android/key.properties` (android/app-relative `storeFile`)
///     before `buildTypes` and wires the release buildType to that config only.
///
/// The file compiles cleanly and fails only because these production contracts
/// are absent; no production file is touched.

const _prepareScript = 'tool/ci/prepare_android_release.sh';
const _workflow = '.github/workflows/android-build.yml';
const _gradle = 'android/app/build.gradle.kts';

/// The eight production inputs the preparation stage requires.
const _inputs = <String>[
  'FIREBASE_OPTIONS_DART_BASE64',
  'GOOGLE_SERVICES_JSON_BASE64',
  'GOOGLE_SERVICE_INFO_PLIST_BASE64',
  'KEYSTORE_BASE64',
  'KEYSTORE_PASSWORD',
  'KEY_ALIAS',
  'KEY_PASSWORD',
  'RELEASE_CERT_SHA256',
];

/// ARM-host detection via /proc/cpuinfo - no subprocess spawned.
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

/// Shared timeout for subprocess tests: 2 minutes under Pi qemu, 30s elsewhere.
final Timeout _multiProcessTimeout =
    Timeout(Duration(seconds: _isArmHost ? 120 : 30));

/// Generous timeout for multi-subprocess matrix tests (8+ bash invocations).
final Timeout _matrixTimeout = const Timeout(Duration(seconds: 180));

const _projectId = 'calorix-e2e-synthetic';
const _apiKey = 'AIzaSyA9x1oNq4K0sYf_3MoXhZyFgLbPn8c7QwE';
const _ksPassword = 's3cret:pa#ss';
const _ksAlias = 'alias#key:release';
const _ksKeyPassword = 'pw:w0rd#!';

final String _certSha256 =
    sha256.convert(utf8.encode('calorix-release-cert')).toString();

/// Byte-encoded synthetic keystore. The preparation script must accept it as
/// decoded bytes and stage it; keystore integrity is enforced downstream by
/// the workflow's apksigner audit, so no JKS structure is assumed here.
final List<int> _keystoreBytes = utf8.encode('synthetic-keystore-001122334455');

String _b64(String value) => base64Encode(utf8.encode(value));

/// Renders a 64-hex fingerprint the way `apksigner verify --print-certs`
/// does: uppercase pairs joined by colons, e.g. `AA:BB:CC:...`.
String _colonize(String hex) {
  final upper = hex.toUpperCase();
  final pairs = <String>[
    for (var i = 0; i < upper.length; i += 2) upper.substring(i, i + 2),
  ];
  return pairs.join(':');
}

const _firebaseOptionsDart = r'''
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
    apiKey: 'AIzaSyA9x1oNq4K0sYf_3MoXhZyFgLbPn8c7QwE',
    appId: '1:424242424242:web:aaaaaaaaaaaaaaaa',
    messagingSenderId: '424242424242',
    projectId: 'calorix-e2e-synthetic',
    authDomain: 'calorix-e2e-synthetic.firebaseapp.com',
    storageBucket: 'calorix-e2e-synthetic.firebasestorage.app',
  );

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyA9x1oNq4K0sYf_3MoXhZyFgLbPn8c7QwE',
    appId: '1:424242424242:android:abcdefabcdefabcdef',
    messagingSenderId: '424242424242',
    projectId: 'calorix-e2e-synthetic',
    storageBucket: 'calorix-e2e-synthetic.firebasestorage.app',
  );

  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: 'AIzaSyA9x1oNq4K0sYf_3MoXhZyFgLbPn8c7QwE',
    appId: '1:424242424242:ios:cccccccccccccccc',
    messagingSenderId: '424242424242',
    projectId: 'calorix-e2e-synthetic',
    storageBucket: 'calorix-e2e-synthetic.firebasestorage.app',
    iosBundleId: 'com.calorix.calorix',
  );

  static const FirebaseOptions macos = FirebaseOptions(
    apiKey: 'AIzaSyA9x1oNq4K0sYf_3MoXhZyFgLbPn8c7QwE',
    appId: '1:424242424242:ios:cccccccccccccccc',
    messagingSenderId: '424242424242',
    projectId: 'calorix-e2e-synthetic',
    storageBucket: 'calorix-e2e-synthetic.firebasestorage.app',
    iosBundleId: 'com.calorix.calorix',
  );

  static const FirebaseOptions windows = FirebaseOptions(
    apiKey: 'AIzaSyA9x1oNq4K0sYf_3MoXhZyFgLbPn8c7QwE',
    appId: '1:424242424242:web:bbbbbbbbbbbbbbbb',
    messagingSenderId: '424242424242',
    projectId: 'calorix-e2e-synthetic',
    authDomain: 'calorix-e2e-synthetic.firebaseapp.com',
    storageBucket: 'calorix-e2e-synthetic.firebasestorage.app',
  );

  static const FirebaseOptions linux = FirebaseOptions(
    apiKey: 'AIzaSyA9x1oNq4K0sYf_3MoXhZyFgLbPn8c7QwE',
    appId: '1:424242424242:web:bbbbbbbbbbbbbbbb',
    messagingSenderId: '424242424242',
    projectId: 'calorix-e2e-synthetic',
    authDomain: 'calorix-e2e-synthetic.firebaseapp.com',
    storageBucket: 'calorix-e2e-synthetic.firebasestorage.app',
  );
}
''';

String _googleServicesJson() => jsonEncode({
      'project_info': {
        'project_number': '424242424242',
        'project_id': _projectId,
        'storage_bucket': '$_projectId.appspot.com',
      },
      'client': [
        {
          'client_info': {
            'mobilesdk_app_id': '1:424242424242:android:abcdefabcdefabcdef',
            'android_client_info': {'package_name': 'com.calorix.calorix'},
          },
          'oauth_client': <Object>[],
          'api_key': [
            {'current_key': _apiKey},
          ],
          'services': {
            'appinvite_service': {
              'other_platform_oauth_client': <Object>[],
            },
          },
        },
      ],
    });

const _plist = r'''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>BUNDLE_ID</key><string>com.calorix.calorix</string>
  <key>PROJECT_ID</key><string>calorix-e2e-synthetic</string>
  <key>API_KEY</key><string>AIzaSyA9x1oNq4K0sYf_3MoXhZyFgLbPn8c7QwE</string>
  <key>GOOGLE_APP_ID</key><string>1:424242424242:ios:cccccccccccccccc</string>
  <key>GCM_SENDER_ID</key><string>424242424242</string>
  <key>STORAGE_BUCKET</key><string>calorix-e2e-synthetic.appspot.com</string>
</dict>
</plist>
''';

Map<String, String> _validEnv() => {
      'FIREBASE_OPTIONS_DART_BASE64': _b64(_firebaseOptionsDart),
      'GOOGLE_SERVICES_JSON_BASE64': _b64(_googleServicesJson()),
      'GOOGLE_SERVICE_INFO_PLIST_BASE64': _b64(_plist),
      'KEYSTORE_BASE64': base64Encode(_keystoreBytes),
      'KEYSTORE_PASSWORD': _ksPassword,
      'KEY_ALIAS': _ksAlias,
      'KEY_PASSWORD': _ksKeyPassword,
      'RELEASE_CERT_SHA256': _certSha256,
    };

Directory _tmp(String prefix) {
  final dir = Directory.systemTemp.createTempSync('release-$prefix-');
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

Future<_PrepareResult> _runPrepare(
    Directory root, Map<String, String> env) async {
  final script = File(_prepareScript).absolute.path;
  final result = await Process.run(
    'bash',
    [script, 'prepare', '--root', root.path],
    workingDirectory: Directory.current.path,
    environment: <String, String>{...Platform.environment, ...env},
  );
  return _PrepareResult(result);
}

Future<_PrepareResult> _runCleanup(Directory root) async {
  final script = File(_prepareScript).absolute.path;
  final result = await Process.run(
    'bash',
    [script, 'cleanup', '--root', root.path],
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
    'android/key.properties',
    'android/app/google-services.json',
    'ios/Runner/GoogleService-Info.plist',
    'lib/core/firebase/firebase_options.dart',
  ];
  for (final path in paths) {
    expect(File('${root.path}/$path').existsSync(), isFalse,
        reason: 'partial artifact must not remain: $path');
  }
  final appDir = Directory('${root.path}/android/app');
  if (appDir.existsSync()) {
    final leftovers = appDir
        .listSync()
        .whereType<File>()
        .where((f) => f.path.endsWith('.jks') || f.path.endsWith('.keystore'));
    expect(leftovers, isEmpty,
        reason: 'a partial keystore artifact must not remain');
  }
}

void _expectMaterialized(
    Directory root, Map<String, String> env, _PrepareResult result) {
  expect(result.exitCode, 0, reason: result.all);

  final options = File('${root.path}/lib/core/firebase/firebase_options.dart');
  final services = File('${root.path}/android/app/google-services.json');
  final plist = File('${root.path}/ios/Runner/GoogleService-Info.plist');
  final properties = File('${root.path}/android/key.properties');
  expect(options.existsSync(), isTrue,
      reason: 'firebase_options.dart must be materialized');
  expect(services.existsSync(), isTrue,
      reason: 'android/app/google-services.json must be materialized');
  expect(plist.existsSync(), isTrue,
      reason: 'ios/Runner/GoogleService-Info.plist must be materialized');
  expect(properties.existsSync(), isTrue,
      reason: 'android/key.properties must be written');

  expect(options.readAsBytesSync(),
      base64Decode(env['FIREBASE_OPTIONS_DART_BASE64']!));
  expect(services.readAsBytesSync(),
      base64Decode(env['GOOGLE_SERVICES_JSON_BASE64']!));
  expect(plist.readAsBytesSync(),
      base64Decode(env['GOOGLE_SERVICE_INFO_PLIST_BASE64']!));

  final keystores = Directory('${root.path}/android/app')
      .listSync()
      .whereType<File>()
      .where((f) => f.path.endsWith('.jks') || f.path.endsWith('.keystore'))
      .toList();
  expect(keystores.length, 1,
      reason: 'exactly one release keystore artifact is expected');
  expect(keystores.single.readAsBytesSync(),
      base64Decode(env['KEYSTORE_BASE64']!));
  final storeBase = keystores.single.uri.pathSegments.last;

  final props = properties.readAsStringSync();
  expect(props, contains('storeFile=$storeBase'));
  expect(props, contains('storePassword=s3cret\\:pa\\#ss'));
  expect(props, contains('keyAlias=alias\\#key\\:release'));
  expect(props, contains('keyPassword=pw\\:w0rd\\#\\!'));
}

void _expectNoSecretOutput(_PrepareResult result, Map<String, String> env) {
  final out = result.all;
  expect(out, isNot(contains(env['KEYSTORE_PASSWORD']!)));
  expect(out, isNot(contains(env['KEY_ALIAS']!)));
  expect(out, isNot(contains(env['KEY_PASSWORD']!)));
  expect(out, isNot(contains(env['RELEASE_CERT_SHA256']!)));
  for (final name in const [
    'FIREBASE_OPTIONS_DART_BASE64',
    'GOOGLE_SERVICES_JSON_BASE64',
    'GOOGLE_SERVICE_INFO_PLIST_BASE64',
    'KEYSTORE_BASE64',
  ]) {
    expect(out, isNot(contains(env[name]!)), reason: '$name must not leak');
  }
  // Decoded content must not reach output either.
  expect(out, isNot(contains(_projectId)));
  expect(out, isNot(contains(_apiKey)));
  expect(out, isNot(contains(_ksPassword)));
  expect(out, isNot(contains(_ksAlias)));
  expect(out, isNot(contains(_ksKeyPassword)));
  expect(out, isNot(contains(_certSha256)));
}

YamlMap? _stepWith(List<YamlMap> steps, String usesFragment) {
  for (final step in steps) {
    if ((step['uses'] as String? ?? '').contains(usesFragment)) {
      return step['with'] as YamlMap?;
    }
  }
  return null;
}

void main() {
  group('tool/ci/prepare_android_release.sh hermetic contract', () {
    void expectScriptExists() {
      expect(File(_prepareScript).existsSync(), isTrue,
          reason: '$_prepareScript must be committed before these tests pass');
    }

    test('preparation script exists', expectScriptExists);

    test('rejects fully absent inputs and names every required variable',
        () async {
      expectScriptExists();
      final tmp = _tmp('absent');
      final result = await _runPrepare(tmp, const {});

      _expectRejected(result, 'FIREBASE_OPTIONS_DART_BASE64');
      for (final name in _inputs) {
        expect(result.all, contains(name),
            reason: 'the absent input $name must be named');
      }
      _expectNoPartialFiles(tmp);
    });

    test('rejects each individually missing input, naming it', () async {
      expectScriptExists();
      for (final name in _inputs) {
        final tmp = _tmp('missing-$name');
        final env = Map<String, String>.of(_validEnv())..remove(name);
        final result = await _runPrepare(tmp, env);

        _expectRejected(result, name);
        _expectNoPartialFiles(tmp);
      }
    }, timeout: _matrixTimeout);

    test('rejects each empty input, naming it', () async {
      expectScriptExists();
      for (final name in _inputs) {
        final tmp = _tmp('empty-$name');
        final env = Map<String, String>.of(_validEnv())..[name] = '';
        final result = await _runPrepare(tmp, env);

        _expectRejected(result, name);
        _expectNoPartialFiles(tmp);
      }
    }, timeout: _matrixTimeout);

    test('rejects malformed base64 for every encoded input, naming it',
        () async {
      expectScriptExists();
      const encoded = <String>[
        'FIREBASE_OPTIONS_DART_BASE64',
        'GOOGLE_SERVICES_JSON_BASE64',
        'GOOGLE_SERVICE_INFO_PLIST_BASE64',
        'KEYSTORE_BASE64',
      ];
      for (final name in encoded) {
        final tmp = _tmp('bad64-$name');
        final env = Map<String, String>.of(_validEnv())
          ..[name] = '!!!this-is-not-base64!!!';
        final result = await _runPrepare(tmp, env);

        _expectRejected(result, name);
        _expectNoPartialFiles(tmp);
      }
    }, timeout: _multiProcessTimeout);

    test(
        'rejects decoded content that fails validation for each artifact class',
        () async {
      expectScriptExists();

      final cases = <String, String>{
        // Not JSON despite decoding cleanly.
        'GOOGLE_SERVICES_JSON_BASE64': _b64('this is { not json'),
        // Not a Dart FirebaseOptions definition.
        'FIREBASE_OPTIONS_DART_BASE64': _b64('void nothing() {}'),
        // Not a plist despite decoding cleanly.
        'GOOGLE_SERVICE_INFO_PLIST_BASE64': _b64('<html></html>'),
        // An encoded but empty keystore payload.
        'KEYSTORE_BASE64': _b64(''),
      };
      for (final entry in cases.entries) {
        final tmp = _tmp('badcontent-${entry.key}');
        final env = Map<String, String>.of(_validEnv())
          ..[entry.key] = entry.value;
        final result = await _runPrepare(tmp, env);

        _expectRejected(result, entry.key);
        _expectNoPartialFiles(tmp);
      }
    }, timeout: _multiProcessTimeout);

    test(
        'rejects invalid UTF-8 for every Firebase text artifact before writing files',
        () async {
      expectScriptExists();

      final invalidUtf8 = base64Encode(Uint8List.fromList([0xff, 0xfe, 0xfd]));
      const textArtifacts = <String>[
        'FIREBASE_OPTIONS_DART_BASE64',
        'GOOGLE_SERVICES_JSON_BASE64',
        'GOOGLE_SERVICE_INFO_PLIST_BASE64',
      ];
      for (final name in textArtifacts) {
        final tmp = _tmp('badutf8-$name');
        final env = Map<String, String>.of(_validEnv())..[name] = invalidUtf8;
        final result = await _runPrepare(tmp, env);

        _expectRejected(result, name);
        _expectNoPartialFiles(tmp);
        _expectNoSecretOutput(result, env);
      }
    }, timeout: _multiProcessTimeout);

    test(
        'rejects placeholder Firebase values in Dart options and google-services.json',
        () async {
      expectScriptExists();

      final placeholderDart = _firebaseOptionsDart
          .replaceAll(_projectId, 'ci-placeholder-project')
          .replaceAll('424242424242', '000000000000');
      final placeholderServices = _googleServicesJson()
          .replaceAll(_projectId, 'ci-placeholder-project');

      final cases = <String, String>{
        'FIREBASE_OPTIONS_DART_BASE64': _b64(placeholderDart),
        'GOOGLE_SERVICES_JSON_BASE64': _b64(placeholderServices),
      };
      for (final entry in cases.entries) {
        final tmp = _tmp('placeholder-${entry.key}');
        final env = Map<String, String>.of(_validEnv())
          ..[entry.key] = entry.value;
        final result = await _runPrepare(tmp, env);

        expect(result.exitCode, isNot(0),
            reason: 'placeholder values must be rejected');
        expect(result.all.toLowerCase(), contains('placeholder'));
        _expectNoPartialFiles(tmp);
      }
    }, timeout: _multiProcessTimeout);

    test(
        'rejects incomplete or placeholder Firebase Dart options before '
        'writing files', () async {
      expectScriptExists();

      String blankAssignment(String field) => _firebaseOptionsDart.replaceAll(
          RegExp("$field: '[^']*'"), "$field: ''");

      String markerInApiKey(String marker) => _firebaseOptionsDart.replaceAll(
          RegExp("apiKey: '[^']*'"), "apiKey: '$marker'");

      final cases = <String, String>{
        'missing apiKey assignment': blankAssignment('apiKey'),
        'missing appId assignment': blankAssignment('appId'),
        'missing messagingSenderId assignment':
            blankAssignment('messagingSenderId'),
        'missing projectId assignment': blankAssignment('projectId'),
        'missing DefaultFirebaseOptions':
            _firebaseOptionsDart.replaceAll('DefaultFirebaseOptions', ''),
        'missing FirebaseOptions(':
            _firebaseOptionsDart.replaceAll('FirebaseOptions(', ''),
        'marker ci-placeholder': markerInApiKey('ci-placeholder'),
        'marker PLACEHOLDER': markerInApiKey('PLACEHOLDER'),
        'marker ChangeMe': markerInApiKey('ChangeMe'),
        'marker example': markerInApiKey('example'),
      };

      for (final entry in cases.entries) {
        final label = entry.key.replaceAll(RegExp(r'[^a-zA-Z0-9]+'), '-');
        final tmp = _tmp('dart-invalid-$label');
        final mutatedDart = entry.value;
        final env = Map<String, String>.of(_validEnv())
          ..['FIREBASE_OPTIONS_DART_BASE64'] = _b64(mutatedDart);
        final result = await _runPrepare(tmp, env);

        _expectRejected(result, 'FIREBASE_OPTIONS_DART_BASE64');
        _expectNoPartialFiles(tmp);
        expect(result.all, isNot(contains(mutatedDart)),
            reason:
                '${entry.key}: decoded Dart content must not appear in output');
      }
    }, timeout: _matrixTimeout);

    test('rejects unusable google-services JSON before writing files',
        () async {
      expectScriptExists();

      String mutated(void Function(Map<String, dynamic> json) mutate) {
        final json = jsonDecode(_googleServicesJson()) as Map<String, dynamic>;
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
        final env = Map<String, String>.of(_validEnv())
          ..['GOOGLE_SERVICES_JSON_BASE64'] = _b64(mutatedJson);
        final result = await _runPrepare(tmp, env);

        _expectRejected(result, 'GOOGLE_SERVICES_JSON_BASE64');
        _expectNoPartialFiles(tmp);
        expect(result.all, isNot(contains(mutatedJson)),
            reason: '${entry.key}: decoded JSON content must not appear '
                'in output');
      }
    }, timeout: _matrixTimeout);

    test('rejects unusable Firebase plist before writing files', () async {
      expectScriptExists();

      String removeField(String field) => _plist.replaceAll(
          RegExp('  <key>$field</key><string>[^<]*</string>\n'), '');

      String blankField(String field) => _plist.replaceAllMapped(
          RegExp('(<key>$field</key><string>)[^<]*(</string>)'),
          (m) => '${m[1]}${m[2]}');

      String markerInApiKey(String marker) => _plist.replaceAllMapped(
          RegExp('(<key>API_KEY</key><string>)[^<]*(</string>)'),
          (m) => '${m[1]}$marker${m[2]}');

      final cases = <String, String>{
        'missing API_KEY': removeField('API_KEY'),
        'blank API_KEY': blankField('API_KEY'),
        'missing GOOGLE_APP_ID': removeField('GOOGLE_APP_ID'),
        'blank GOOGLE_APP_ID': blankField('GOOGLE_APP_ID'),
        'missing PROJECT_ID': removeField('PROJECT_ID'),
        'blank PROJECT_ID': blankField('PROJECT_ID'),
        'missing GCM_SENDER_ID': removeField('GCM_SENDER_ID'),
        'blank GCM_SENDER_ID': blankField('GCM_SENDER_ID'),
        'missing BUNDLE_ID': removeField('BUNDLE_ID'),
        'wrong BUNDLE_ID': _plist.replaceAll(
            '<string>com.calorix.calorix</string>',
            '<string>com.wrong.bundle</string>'),
        'marker ci-placeholder': markerInApiKey('ci-placeholder'),
        'marker PLACEHOLDER': markerInApiKey('PLACEHOLDER'),
        'marker ChangeMe': markerInApiKey('ChangeMe'),
        'marker example': markerInApiKey('example'),
        // Drops the closing </dict> tag only, leaving </plist> dangling:
        // invalid XML nesting rather than an unusable-content case.
        'syntactically malformed plist': _plist.replaceFirst('</dict>\n', ''),
      };

      for (final entry in cases.entries) {
        if (entry.key == 'syntactically malformed plist') continue;
        final value = entry.value;
        expect(
            value.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), isTrue,
            reason: '${entry.key}: fixture must remain valid plist XML');
        expect('<dict>'.allMatches(value).length,
            '</dict>'.allMatches(value).length,
            reason: '${entry.key}: fixture must remain valid plist XML');
        expect(value, contains('<plist version="1.0">'),
            reason: '${entry.key}: fixture must remain valid plist XML');
        expect(value, contains('</plist>'),
            reason: '${entry.key}: fixture must remain valid plist XML');
      }

      for (final entry in cases.entries) {
        final label = entry.key.replaceAll(RegExp(r'[^a-zA-Z0-9]+'), '-');
        final tmp = _tmp('plist-invalid-$label');
        final mutatedPlist = entry.value;
        final env = Map<String, String>.of(_validEnv())
          ..['GOOGLE_SERVICE_INFO_PLIST_BASE64'] = _b64(mutatedPlist);
        final result = await _runPrepare(tmp, env);

        _expectRejected(result, 'GOOGLE_SERVICE_INFO_PLIST_BASE64');
        _expectNoPartialFiles(tmp);
        expect(result.all, isNot(contains(mutatedPlist)),
            reason: '${entry.key}: decoded plist content must not appear '
                'in output');
      }
    }, timeout: _matrixTimeout);

    test('rejects unsafe newline and control characters in property values',
        () async {
      expectScriptExists();
      final unsafe = <String, String>{
        'KEYSTORE_PASSWORD': 'new\nline',
        'KEY_ALIAS': 'carriage\rreturn',
        'KEY_PASSWORD': 'tab\there',
      };
      for (final entry in unsafe.entries) {
        final tmp = _tmp('unsafe-${entry.key}');
        final env = Map<String, String>.of(_validEnv())
          ..[entry.key] = entry.value;
        final result = await _runPrepare(tmp, env);

        _expectRejected(result, entry.key);
        _expectNoPartialFiles(tmp);
      }
    }, timeout: _multiProcessTimeout);

    test(
        'materializes every exact path with safely escaped key.properties '
        'and app-relative storeFile', () async {
      expectScriptExists();
      final tmp = _tmp('happy');
      final env = _validEnv();
      final result = await _runPrepare(tmp, env);

      _expectMaterialized(tmp, env, result);
      _expectNoSecretOutput(result, env);
    }, timeout: _multiProcessTimeout);

    test('never prints secrets or decoded content to stdout or stderr',
        () async {
      expectScriptExists();
      final tmp = _tmp('noleak');
      final env = _validEnv();
      final result = await _runPrepare(tmp, env);

      expect(result.exitCode, 0, reason: result.all);
      _expectNoSecretOutput(result, env);
    }, timeout: _multiProcessTimeout);

    test(
        'accepts only an exact 64-hex RELEASE_CERT_SHA256 in either case '
        '(normalization) and rejects mismatched lengths or non-hex', () async {
      expectScriptExists();

      final uppercase = _validEnv()
        ..['RELEASE_CERT_SHA256'] = _certSha256.toUpperCase();
      final upperTmp = _tmp('fingerprint-upper');
      expect((await _runPrepare(upperTmp, uppercase)).exitCode, 0,
          reason: 'uppercase fingerprint must be accepted');

      final lowerTmp = _tmp('fingerprint-lower');
      expect((await _runPrepare(lowerTmp, _validEnv())).exitCode, 0,
          reason: 'lowercase fingerprint must be accepted');

      final badLength = _validEnv()
        ..['RELEASE_CERT_SHA256'] = _certSha256.substring(0, 63);
      final shortTmp = _tmp('fingerprint-short');
      _expectRejected(
          await _runPrepare(shortTmp, badLength), 'RELEASE_CERT_SHA256');
      _expectNoPartialFiles(shortTmp);

      final nonHex = _validEnv()..['RELEASE_CERT_SHA256'] = 'z' * 64;
      final nonHexTmp = _tmp('fingerprint-nonhex');
      _expectRejected(
          await _runPrepare(nonHexTmp, nonHex), 'RELEASE_CERT_SHA256');
      _expectNoPartialFiles(nonHexTmp);
    }, timeout: _multiProcessTimeout);

    test(
        'is idempotent: a second identical run leaves byte-identical artifacts',
        () async {
      expectScriptExists();
      final tmp = _tmp('idempotent');
      final env = _validEnv();

      final first = await _runPrepare(tmp, env);
      _expectMaterialized(tmp, env, first);

      final keystore = Directory('${tmp.path}/android/app')
          .listSync()
          .whereType<File>()
          .where((f) => f.path.endsWith('.jks') || f.path.endsWith('.keystore'))
          .single;

      List<int> bytesOf(String relativePath) =>
          File('${tmp.path}/$relativePath').readAsBytesSync();
      final before = <String, List<int>>{
        'lib/core/firebase/firebase_options.dart':
            bytesOf('lib/core/firebase/firebase_options.dart'),
        'android/app/google-services.json':
            bytesOf('android/app/google-services.json'),
        'ios/Runner/GoogleService-Info.plist':
            bytesOf('ios/Runner/GoogleService-Info.plist'),
        'android/key.properties': bytesOf('android/key.properties'),
        keystore.path.substring(tmp.path.length + 1):
            keystore.readAsBytesSync(),
      };

      final second = await _runPrepare(tmp, env);
      expect(second.exitCode, 0, reason: second.all);
      for (final entry in before.entries) {
        expect(bytesOf(entry.key), entry.value,
            reason: '${entry.key} must be identical after a second run');
      }
    }, timeout: _multiProcessTimeout);

    test('cleans previously materialized secrets when a later attempt fails',
        () async {
      expectScriptExists();
      final tmp = _tmp('cleanup');
      final env = _validEnv();

      final first = await _runPrepare(tmp, env);
      _expectMaterialized(tmp, env, first);

      final broken = Map<String, String>.of(env)..remove('KEY_ALIAS');
      final second = await _runPrepare(tmp, broken);
      expect(second.exitCode, isNot(0),
          reason: 'a run missing a secret must fail');
      _expectNoPartialFiles(tmp);
    }, timeout: _multiProcessTimeout);
  });

  group('tool/ci/prepare_android_release.sh cleanup subcommand', () {
    void expectScriptExists() {
      expect(File(_prepareScript).existsSync(), isTrue,
          reason: '$_prepareScript must be committed before these tests pass');
    }

    test(
        'cleanup removes every exact materialized secret path independently '
        'of prepare', () async {
      expectScriptExists();
      final tmp = _tmp('cleanup-direct');
      final env = _validEnv();
      final prepareResult = await _runPrepare(tmp, env);
      _expectMaterialized(tmp, env, prepareResult);

      final cleanupResult = await _runCleanup(tmp);
      expect(cleanupResult.exitCode, 0, reason: cleanupResult.all);
      _expectNoPartialFiles(tmp);
    }, timeout: _multiProcessTimeout);

    test(
        'cleanup is idempotent: repeated runs on an already-clean root still '
        'succeed and leave it clean', () async {
      expectScriptExists();
      final tmp = _tmp('cleanup-idempotent');
      final env = _validEnv();
      final prepareResult = await _runPrepare(tmp, env);
      _expectMaterialized(tmp, env, prepareResult);

      final first = await _runCleanup(tmp);
      expect(first.exitCode, 0, reason: first.all);
      _expectNoPartialFiles(tmp);

      final second = await _runCleanup(tmp);
      expect(second.exitCode, 0, reason: second.all);
      _expectNoPartialFiles(tmp);
    }, timeout: _multiProcessTimeout);

    test('cleanup on a root that was never prepared exits cleanly', () async {
      expectScriptExists();
      final tmp = _tmp('cleanup-empty');
      final result = await _runCleanup(tmp);
      expect(result.exitCode, 0, reason: result.all);
      _expectNoPartialFiles(tmp);
    }, timeout: _multiProcessTimeout);

    test(
        'cleanup removes exactly android/app/release.jks and leaves '
        'unrelated .jks/.keystore files untouched', () async {
      expectScriptExists();
      final tmp = _tmp('cleanup-selective');
      final appDir = Directory('${tmp.path}/android/app')
        ..createSync(recursive: true);
      final release = File('${appDir.path}/release.jks')
        ..writeAsStringSync('release');
      final keepJks = File('${appDir.path}/keep.jks')
        ..writeAsStringSync('keep');
      final keepKeystore = File('${appDir.path}/keep.keystore')
        ..writeAsStringSync('keep');

      final result = await _runCleanup(tmp);
      expect(result.exitCode, 0, reason: result.all);

      expect(release.existsSync(), isFalse,
          reason: 'cleanup must remove android/app/release.jks');
      expect(keepJks.existsSync(), isTrue,
          reason: 'cleanup must not remove unrelated .jks files');
      expect(keepKeystore.existsSync(), isTrue,
          reason: 'cleanup must not remove unrelated .keystore files');
    }, timeout: _multiProcessTimeout);
  });

  group('tool/ci/prepare_android_release.sh verify-fingerprint subcommand', () {
    void expectScriptExists() {
      expect(File(_prepareScript).existsSync(), isTrue,
          reason: '$_prepareScript must be committed before these tests pass');
    }

    test(
        'normalizes colons and surrounding whitespace, then uppercases '
        'before accepting an equal fingerprint', () async {
      expectScriptExists();
      final expected = _certSha256.toUpperCase();
      final actual = '  ${_colonize(_certSha256).toLowerCase()}  \n';
      final result = await _runVerifyFingerprint(expected, actual);
      expect(result.exitCode, 0, reason: result.all);
    }, timeout: _multiProcessTimeout);

    test('exits nonzero when normalized fingerprints do not match', () async {
      expectScriptExists();
      final expected = _certSha256.toUpperCase();
      final actual = sha256.convert(utf8.encode('a-different-cert')).toString();
      final result = await _runVerifyFingerprint(expected, actual);
      expect(result.exitCode, isNot(0), reason: result.all);
    }, timeout: _multiProcessTimeout);

    test(
        'rejects fingerprints that are not exactly 64 hex digits after '
        'normalization, on either side', () async {
      expectScriptExists();
      final malformed = <String>[
        _certSha256.substring(0, 63), // too short
        '${_certSha256}ab', // too long
        'z' * 64, // non-hex
      ];
      for (final bad in malformed) {
        final asExpected = await _runVerifyFingerprint(bad, _certSha256);
        expect(asExpected.exitCode, isNot(0),
            reason:
                'malformed expected value must be rejected: ${asExpected.all}');

        final asActual = await _runVerifyFingerprint(_certSha256, bad);
        expect(asActual.exitCode, isNot(0),
            reason: 'malformed actual value must be rejected: ${asActual.all}');
      }
    }, timeout: _matrixTimeout);
  });

  group('.github/workflows/android-build.yml contract', () {
    String runOf(YamlMap step) {
      final run = step['run'];
      return run is String ? run : '';
    }

    test(
        'runs tool/ci/prepare_android_release.sh before pub get and the '
        'release build, providing all eight inputs as secrets', () async {
      final file = File(_workflow);
      expect(file.existsSync(), isTrue,
          reason: '$_workflow must exist but is absent');
      final workflow = loadYaml(file.readAsStringSync()) as YamlMap;
      final job = ((workflow['jobs'] as YamlMap).values.first as YamlMap);
      final steps = (job['steps'] as YamlList).cast<YamlMap>();

      int runIndex(bool Function(String) pred) =>
          steps.indexWhere((step) => pred(runOf(step)));

      final prepIndex =
          runIndex((r) => r.contains('tool/ci/prepare_android_release.sh'));
      final pubGetIndex = runIndex((r) => r.contains('fvm flutter pub get'));
      final buildIndex =
          runIndex((r) => r.contains('fvm flutter build apk --release'));

      expect(prepIndex, greaterThanOrEqualTo(0),
          reason: 'a step must invoke $_prepareScript');
      expect(pubGetIndex, greaterThanOrEqualTo(0),
          reason: 'a fvm flutter pub get step is required');
      expect(buildIndex, greaterThanOrEqualTo(0),
          reason: 'the exact release build step is required');
      expect(prepIndex, lessThan(pubGetIndex),
          reason: 'preparation must precede pub get');
      expect(prepIndex, lessThan(buildIndex),
          reason: 'preparation must precede the release build');

      final raw = file.readAsStringSync();
      for (final name in _inputs) {
        expect(raw, contains('secrets.$name'),
            reason: '$name must be injected from GitHub secrets');
      }
    });

    test(
        'builds and uploads only the release APK without inline placeholder '
        'Firebase materialization', () async {
      final file = File(_workflow);
      final workflow = loadYaml(file.readAsStringSync()) as YamlMap;
      final job = ((workflow['jobs'] as YamlMap).values.first as YamlMap);
      final steps = (job['steps'] as YamlList).cast<YamlMap>();
      final runs = steps.map(runOf).join('\n');

      expect(runs, contains('fvm flutter build apk --release'));
      expect(runs, isNot(contains('flutter build apk --debug')));
      expect(runs, contains('app-release.apk'),
          reason: 'only the release artifact may be distributed');

      // The release build must consume the prepared real paths, so the
      // workflow may never materialize a placeholder Dart options file inline.
      final raw = file.readAsStringSync().toLowerCase();
      expect(raw, isNot(contains('class defaultfirebaseoptions {')),
          reason: 'inline Firebase options materialization is forbidden');
      expect(raw, isNot(contains('ensure firebase options file exists')));
    });

    test(
        'runs apksigner verify --print-certs and enforces normalized exact '
        'fingerprint equality, failing hard on a mismatch', () async {
      final file = File(_workflow);
      final workflow = loadYaml(file.readAsStringSync()) as YamlMap;
      final job = ((workflow['jobs'] as YamlMap).values.first as YamlMap);
      final steps = (job['steps'] as YamlList).cast<YamlMap>();

      final verifyIndex =
          steps.indexWhere((step) => runOf(step).contains('apksigner verify'));
      expect(verifyIndex, greaterThanOrEqualTo(0),
          reason: 'an apksigner verification step is required');
      final verify = runOf(steps[verifyIndex]);

      expect(verify, contains('apksigner verify --print-certs'));
      expect(verify, contains('app-release.apk'));
      expect(verify, contains('RELEASE_CERT_SHA256'));
      // The printed signer fingerprint is normalized before comparison:
      // separators (':') and whitespace removed, then uppercased.
      expect(verify, contains('tr -d \':\''));
      expect(verify, contains('[:upper:]'));
      // Exact equality, and a mismatch is a hard failure.
      expect(verify, contains('!='));
      expect(verify, contains('exit 1'));
    });

    test('unconditionally cleans every materialized secret with if: always()',
        () async {
      final file = File(_workflow);
      final workflow = loadYaml(file.readAsStringSync()) as YamlMap;
      final job = ((workflow['jobs'] as YamlMap).values.first as YamlMap);
      final steps = (job['steps'] as YamlList).cast<YamlMap>();

      int runIndex(bool Function(String) pred) =>
          steps.indexWhere((step) => pred(runOf(step)));
      final buildIndex =
          runIndex((r) => r.contains('fvm flutter build apk --release'));

      final cleanupIndex = steps.indexWhere((step) {
        final cond = step['if'];
        return cond is String &&
            cond.contains('always') &&
            runOf(step).contains('rm -f');
      });
      expect(cleanupIndex, greaterThanOrEqualTo(0),
          reason: 'a cleanup step guarded by if always() is required');
      expect(cleanupIndex, greaterThan(buildIndex),
          reason: 'cleanup must come after the release build');
      final cleanup = runOf(steps[cleanupIndex]);

      expect(cleanup, contains('android/key.properties'));
      expect(cleanup, contains('android/app/google-services.json'));
      expect(cleanup, contains('ios/Runner/GoogleService-Info.plist'));
      expect(cleanup, contains('lib/core/firebase/firebase_options.dart'));
      expect(cleanup, contains('.jks'),
          reason: 'the materialized keystore must be removed too');
    });

    test(
        'forbids placeholder Firebase values, debug signing, and manual '
        'base64 decoding', () async {
      final file = File(_workflow);
      final raw = file.readAsStringSync();
      final lower = raw.toLowerCase();

      expect(lower, isNot(contains('ci-placeholder')),
          reason: 'placeholder Firebase values are forbidden');
      expect(lower, isNot(contains('1:000000000000')),
          reason: 'placeholder Firebase app IDs are forbidden');
      expect(lower, isNot(contains('signingconfigs.getbyname("debug")')),
          reason: 'debug signing of the release build is forbidden');
      expect(lower, isNot(contains('base64 -d')),
          reason: 'manual base64 decoding is forbidden');
      expect(lower, isNot(contains('base64 --decode')),
          reason: 'manual base64 decoding is forbidden');
      expect(lower, isNot(contains('base64 -D')),
          reason: 'manual base64 decoding is forbidden');
    });

    test(
        'cleanup step removes the exact release.jks path and never a '
        'wildcard keystore glob', () async {
      final file = File(_workflow);
      final workflow = loadYaml(file.readAsStringSync()) as YamlMap;
      final job = ((workflow['jobs'] as YamlMap).values.first as YamlMap);
      final steps = (job['steps'] as YamlList).cast<YamlMap>();

      final cleanupIndex = steps.indexWhere((step) {
        final cond = step['if'];
        return cond is String &&
            cond.contains('always') &&
            runOf(step).contains('rm -f');
      });
      expect(cleanupIndex, greaterThanOrEqualTo(0),
          reason: 'a cleanup step guarded by if always() is required');
      final cleanup = runOf(steps[cleanupIndex]);

      expect(cleanup, contains('android/app/release.jks'),
          reason: 'cleanup must remove the exact materialized keystore path');
      expect(cleanup, isNot(contains('*.jks')),
          reason: 'cleanup must not wildcard-remove unrelated .jks files');
      expect(cleanup, isNot(contains('*.keystore')),
          reason: 'cleanup must not wildcard-remove unrelated .keystore files');
    });

    test(
        'top-level on: triggers are exactly workflow_dispatch and push; '
        'no extra, no missing', () async {
      final file = File(_workflow);
      expect(file.existsSync(), isTrue,
          reason: '$_workflow must exist but is absent');
      final raw = file.readAsStringSync();
      final workflow = loadYaml(raw) as YamlMap;

      final on = workflow['on'];
      expect(on, isA<YamlMap>(), reason: 'on: must be a mapping');

      final keys = (on as YamlMap).keys.cast<String>().toList()..sort();
      expect(keys, ['push', 'workflow_dispatch'],
          reason: 'on: must contain exactly workflow_dispatch and push; '
              'found $keys');
    });

    test(
        'push.tags is exactly ["v*"]; push must not contain branches '
        'or branches-ignore', () async {
      final file = File(_workflow);
      expect(file.existsSync(), isTrue,
          reason: '$_workflow must exist but is absent');
      final raw = file.readAsStringSync();
      final workflow = loadYaml(raw) as YamlMap;

      final on = workflow['on'];
      expect(on, isA<YamlMap>(), reason: 'on: must be a mapping');

      final push = (on as YamlMap)['push'];
      expect(push, isA<YamlMap>(),
          reason: 'push must be a mapping with tags only');

      final pushMap = push as YamlMap;
      final pushKeys = pushMap.keys.cast<String>().toList()..sort();
      expect(pushKeys, ['tags'],
          reason: 'push must contain only tags; found $pushKeys');

      final tags = pushMap['tags'];
      expect(tags, isA<YamlList>(), reason: 'push.tags must be a list');
      final tagList = (tags as YamlList).cast<String>();
      expect(tagList, ['v*'],
          reason: 'push.tags must be exactly ["v*"]; found $tagList');
    });
  });

  group('.github/workflows/verify.yml contract', () {
    const _verify = '.github/workflows/verify.yml';

    void expectVerifyExists() {
      expect(File(_verify).existsSync(), isTrue,
          reason: '$_verify must exist but is absent');
    }

    YamlMap loadVerify() {
      expectVerifyExists();
      return loadYaml(File(_verify).readAsStringSync()) as YamlMap;
    }

    YamlMap jobNamed(YamlMap workflow, String name) {
      final jobs = workflow['jobs'] as YamlMap?;
      expect(jobs, isNotNull, reason: 'jobs: section is required');
      expect(jobs!.containsKey(name), isTrue,
          reason:
              'jobs must contain a "$name" job; found ${jobs.keys.toList()}');
      return jobs[name] as YamlMap;
    }

    List<String> stepRuns(YamlMap job) {
      final steps = job['steps'] as YamlList?;
      if (steps == null) return const [];
      return steps
          .cast<YamlMap>()
          .map((s) => s['run'] as String? ?? '')
          .toList();
    }

    test('file exists and parses as valid YAML', expectVerifyExists);

    test(
        'on: triggers are exactly push, pull_request, and workflow_call; '
        'push/pull_request both have branches exactly ["main"]', () {
      final workflow = loadVerify();

      final on = workflow['on'];
      expect(on, isA<YamlMap>(), reason: 'on: must be a mapping');

      final keys = (on as YamlMap).keys.cast<String>().toList()..sort();
      expect(keys, ['pull_request', 'push', 'workflow_call'],
          reason: 'on: must contain exactly push, pull_request, and '
              'workflow_call (added so android-test-apk.yml can invoke '
              'this workflow at the same commit sha); found $keys');

      for (final trigger in ['push', 'pull_request']) {
        final entry = on[trigger];
        expect(entry, isA<YamlMap>(),
            reason: '$trigger must be a mapping with branches');

        final branches = (entry as YamlMap)['branches'];
        expect(branches, isA<YamlList>(),
            reason: '$trigger.branches must be a list');
        expect((branches as YamlList).cast<String>(), ['main'],
            reason: '$trigger.branches must be exactly ["main"]');
      }
    });

    test('top-level permissions contents is read', () {
      final workflow = loadVerify();

      final permissions = workflow['permissions'];
      expect(permissions, isA<YamlMap>(),
          reason: 'top-level permissions is required');
      expect((permissions as YamlMap)['contents'], 'read',
          reason: 'permissions.contents must be read');
    });

    test(
        'Flutter verification job pins 3.41.9, activates FVM, '
        'runs fvm install, fvm flutter pub get, and fvm flutter test', () {
      final workflow = loadVerify();
      final flutter = jobNamed(workflow, 'flutter');

      final steps = (flutter['steps'] as YamlList?)?.cast<YamlMap>() ?? [];
      final runs = stepRuns(flutter);
      final allRuns = runs.join('\n');

      final flutterWith = _stepWith(steps, 'subosito/flutter-action');
      expect(flutterWith, isNotNull,
          reason: 'a subosito/flutter-action step is required');
      expect(flutterWith!['flutter-version'], '3.41.9',
          reason: 'Flutter version must be pinned via subosito/flutter-action');
      expect(allRuns, contains('fvm install'),
          reason: 'fvm install must be called');
      expect(allRuns, contains('fvm flutter pub get'),
          reason: 'fvm flutter pub get must be called');
      expect(allRuns, contains('fvm flutter test'),
          reason: 'fvm flutter test must be called');
    });

    test(
        'Flutter verification job runs pwsh --version before fvm flutter test '
        'as a PowerShell cross-platform preflight', () {
      final workflow = loadVerify();
      final flutter = jobNamed(workflow, 'flutter');

      final steps = (flutter['steps'] as YamlList?)?.cast<YamlMap>() ?? [];

      int runIndex(bool Function(String) pred) =>
          steps.indexWhere((step) => pred(step['run'] as String? ?? ''));

      final pwshIndex = runIndex((r) => r.contains('pwsh --version'));
      final flutterTestIndex = runIndex((r) => r.contains('fvm flutter test'));

      expect(pwshIndex, greaterThanOrEqualTo(0),
          reason: 'a pwsh --version preflight step is required');
      expect(flutterTestIndex, greaterThanOrEqualTo(0),
          reason: 'fvm flutter test must be called');
      expect(pwshIndex, lessThan(flutterTestIndex),
          reason: 'pwsh --version must precede fvm flutter test');
    });

    test(
        'Functions verification job uses Node 20 and working-directory '
        'functions for npm ci, npm run build, npm run lint, npm test', () {
      final workflow = loadVerify();
      final functions = jobNamed(workflow, 'functions');

      final runs = stepRuns(functions);
      final allRuns = runs.join('\n');

      final steps = (functions['steps'] as YamlList?)?.cast<YamlMap>() ?? [];
      final nodeWith = _stepWith(steps, 'actions/setup-node');
      expect(nodeWith, isNotNull,
          reason: 'an actions/setup-node step is required');
      expect(nodeWith!['node-version'], '20',
          reason: 'Node version must be 20 via actions/setup-node');

      for (final step in steps) {
        final run = step['run'] as String? ?? '';
        if (run.contains('npm')) {
          expect(step['working-directory'], 'functions',
              reason: 'npm commands must run in functions directory');
        }
      }

      expect(allRuns, contains('npm ci'), reason: 'npm ci must be called');
      expect(allRuns, contains('npm run build'),
          reason: 'npm run build must be called');
      expect(allRuns, contains('npm run lint'),
          reason: 'npm run lint must be called');
      expect(allRuns, contains('npm test'), reason: 'npm test must be called');
    });

    test(
        'verify.yml forbids secrets.*, Firebase/release inputs, '
        'flutter build apk, upload-artifact, deploy, publish, '
        'release, and signing terms', () {
      final verifyFile = File(_verify);
      expect(verifyFile.existsSync(), isTrue,
          reason: '$_verify must exist but is absent');
      final raw = verifyFile.readAsStringSync().toLowerCase();

      expect(raw, isNot(contains('secrets.')),
          reason: 'secrets.* references are forbidden in verify.yml');
      expect(raw, isNot(contains('flutter build apk')),
          reason: 'flutter build apk is forbidden in verify.yml');
      expect(raw, isNot(contains('upload-artifact')),
          reason: 'upload-artifact is forbidden in verify.yml');
      expect(raw, isNot(contains('deploy')),
          reason: 'deploy is forbidden in verify.yml');
      expect(raw, isNot(contains('publish')),
          reason: 'publish is forbidden in verify.yml');
      expect(raw, isNot(contains('release')),
          reason: 'release is forbidden in verify.yml');
      expect(raw, isNot(contains('signing')),
          reason: 'signing terms are forbidden in verify.yml');
      expect(raw, isNot(contains('keystore')),
          reason: 'keystore references are forbidden in verify.yml');
      expect(raw, isNot(contains('firebase_options')),
          reason: 'Firebase input names are forbidden in verify.yml');
      expect(raw, isNot(contains('google_services')),
          reason: 'Google services input names are forbidden in verify.yml');
      expect(raw, isNot(contains('key_alias')),
          reason: 'key alias input names are forbidden in verify.yml');
    });
  });

  group('android/app/build.gradle.kts contract', () {
    test(
        'defines signingConfigs.release from android/key.properties before '
        'buildTypes with an android/app-relative storeFile', () {
      final file = File(_gradle);
      expect(file.existsSync(), isTrue,
          reason: '$_gradle must exist but is absent');
      final text = file.readAsStringSync();

      final signingStart = text.indexOf('signingConfigs');
      final buildTypesStart = text.indexOf('buildTypes');
      expect(signingStart, greaterThanOrEqualTo(0),
          reason: 'a signingConfigs block is required');
      expect(buildTypesStart, greaterThanOrEqualTo(0),
          reason: 'a buildTypes block is required');
      expect(signingStart, lessThan(buildTypesStart),
          reason: 'signingConfigs must be declared before buildTypes');

      expect(text, contains('create("release")'),
          reason: 'a release signing config is required');
      expect(text, contains('key.properties'),
          reason:
              'release credentials must be read from android/key.properties');
      expect(text, contains('storeFile = file('),
          reason: 'storeFile must resolve relative to android/app');
      expect(text, isNot(contains('rootProject.file(')),
          reason: 'storeFile must stay app-relative');
    });

    test('wires the release buildType to the release signing config only', () {
      final file = File(_gradle);
      final text = file.readAsStringSync();

      expect(
          text, contains('signingConfig = signingConfigs.getByName("release")'),
          reason: 'buildTypes.release must use the release signing config');
      expect(text, isNot(contains('signingConfigs.getByName("debug")')),
          reason: 'the release build may never fall back to debug signing');
    });

    test(
        'guards release signing credentials with a case-insensitive '
        'release-task check that throws GradleException for missing '
        'key.properties, blank/missing storeFile/storePassword/keyAlias/'
        'keyPassword, or a missing app-relative store file', () {
      final file = File(_gradle);
      expect(file.existsSync(), isTrue,
          reason: '$_gradle must exist but is absent');
      final text = file.readAsStringSync();

      expect(text, contains('GradleException'),
          reason: 'missing release inputs must fail the build, not '
              'silently fall through');

      // The guard is conditioned on the requested task names, matched
      // case-insensitively, so debug/local tasks never require credentials.
      expect(text, contains('gradle.startParameter.taskNames'),
          reason: 'the guard must inspect the requested task names');
      expect(
          RegExp(r'ignoreCase\s*=\s*true|\.lowercase\(\)|\.uppercase\(\)')
              .hasMatch(text),
          isTrue,
          reason: 'the release task-name match must be case-insensitive');
      expect(text, contains('"release"'),
          reason: 'the guard must key off a requested release task');

      for (final field in const [
        'storeFile',
        'storePassword',
        'keyAlias',
        'keyPassword',
      ]) {
        expect(text, contains(field), reason: 'the guard must validate $field');
      }
      expect(
          RegExp(r'isNullOrBlank\(\)|isNullOrEmpty\(\)').hasMatch(text), isTrue,
          reason:
              'blank credential values must be rejected, not just absent ones');
      expect(text, contains('exists()'),
          reason: 'an absent key.properties or missing store file must be '
              'detected before signing proceeds');
    });
  });
}
