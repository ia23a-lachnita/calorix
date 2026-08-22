import 'dart:io';

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
///  7. Run `apksigner verify --print-certs` and enforce SHA-256 fingerprint
///     equality (normalized: strip separators/whitespace, uppercase).
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
///
/// The file compiles cleanly and fails only because the production workflow,
/// the `verify.yml` `workflow_call` trigger, and the `AGENTS.md` cadence
/// language are absent; no production file or `AGENTS.md` is touched by
/// this test file.

const _workflow = '.github/workflows/android-test-apk.yml';
const _productionWorkflow = '.github/workflows/android-build.yml';

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
        'and app id 1:85048284883:android:d9ac439353e922ddf8a626', () {
      final file = File(_workflow);
      expect(file.existsSync(), isTrue,
          reason: '$_workflow must exist but is absent');
      final raw = file.readAsStringSync();

      expect(raw, contains(_projectCalorix),
          reason: 'project calorix-xurschnell must be validated');
      expect(raw, contains(_androidPackage),
          reason: 'package com.calorix.calorix must be validated');
      expect(raw, contains(_androidAppId),
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
        'runs apksigner verify --print-certs and enforces normalized '
        'exact SHA-256 fingerprint equality', () {
      final file = File(_workflow);
      expect(file.existsSync(), isTrue,
          reason: '$_workflow must exist but is absent');
      final raw = file.readAsStringSync();

      expect(raw, contains('apksigner verify --print-certs'),
          reason: 'apksigner verify --print-certs step is required');
      expect(raw, contains('TEST_DEBUG_CERT_SHA256'),
          reason:
              'the test cert SHA-256 must be checked against the signature');
      expect(raw, contains('tr -d'),
          reason: 'fingerprint normalization must strip separators');
      expect(raw, contains('[:upper:]'),
          reason: 'fingerprint normalization must uppercase');
      expect(raw, contains('!='),
          reason: 'fingerprint mismatch must be detected');
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
        'securely decodes three base64 inputs (base64 decoding itself is required, '
        'not forbidden, since the workflow materializes Firebase inputs '
        'directly without prepare_android_release.sh)', () {
      final file = File(_workflow);
      expect(file.existsSync(), isTrue,
          reason: '$_workflow must exist but is absent');
      final raw = file.readAsStringSync();

      expect(
          raw.contains('base64 -d') ||
              raw.contains('base64 --decode') ||
              raw.contains('base64 -D'),
          isTrue,
          reason: 'the workflow must decode the base64-encoded secrets '
              'somewhere to materialize Firebase inputs');
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
      final file = File(_workflow);
      expect(file.existsSync(), isTrue,
          reason: '$_workflow must exist but is absent');
      final raw = file.readAsStringSync();

      expect(raw, isNot(contains('workflow_run')),
          reason: 'workflow_run fires against whatever commit the upstream '
              'workflow completed on, which can be stale relative to the '
              'dispatched sha; use the in-run workflow_call/needs contract '
              'instead');
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
}
