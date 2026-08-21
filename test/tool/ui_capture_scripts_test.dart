import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';

ProcessResult _runPowerShell(List<String> arguments) => Process.runSync(
      Platform.isWindows ? 'powershell' : 'pwsh',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', ...arguments],
      workingDirectory: Directory.current.path,
      stdoutEncoding: utf8,
      stderrEncoding: utf8,
    );

void main() {
  test('capture plan describes all 38 canonical profile-aware artifacts', () {
    final result = _runPowerShell([
      '-File',
      'tool/ui_capture/capture_states.ps1',
      '-Screens',
      'all',
    ]);

    expect(result.exitCode, 0, reason: '${result.stderr}\n${result.stdout}');
    final plan = jsonDecode(result.stdout as String) as Map<String, dynamic>;
    final actions = (plan['actions'] as List).cast<Map<String, dynamic>>();
    expect(actions, hasLength(38));
    expect(
      actions
          .map((action) => '${action['screen']}--${action['theme']}')
          .toSet(),
      hasLength(38),
    );
    expect(
      actions.every(
        (action) =>
            (action['fixtureProfile'] as String?)?.isNotEmpty == true &&
            (action['outputMetadata'] as String).endsWith('.meta.json'),
      ),
      isTrue,
    );
    expect(
      (plan['buildManifestPath'] as String).replaceAll(r'\', '/'),
      endsWith('/build-manifest.json'),
    );
  });

  test('artifact validator exists and fails closed on an empty capture folder',
      () {
    final script = File('tool/ui_capture/validate_artifacts.ps1');
    expect(script.existsSync(), isTrue);

    final empty =
        Directory.systemTemp.createTempSync('calorix-captures-empty-');
    addTearDown(() => empty.deleteSync(recursive: true));
    final result = _runPowerShell([
      '-File',
      script.path,
      '-CapturePath',
      empty.path,
    ]);

    expect(result.exitCode, isNot(0));
    expect(
      '${result.stderr}\n${result.stdout}',
      contains('exactly 38 PNG'),
    );
  });

  test('artifact validator accepts one complete canonical 38-state set', () {
    final capture =
        Directory.systemTemp.createTempSync('calorix-captures-complete-');
    addTearDown(() => capture.deleteSync(recursive: true));
    const buildHash = 'build-commit';
    const apkHash = 'apk-hash';
    const sourceFingerprint = 'source-hash';
    const deviceId = 'fixture-device';
    const deviceModel = 'fixture-model';
    const width = 402;
    const height = 874;
    File('${capture.path}/build-manifest.json').writeAsStringSync(
      jsonEncode({
        'buildHash': buildHash,
        'apkHash': apkHash,
        'sourceFingerprint': sourceFingerprint,
        'deviceId': deviceId,
        'deviceModel': deviceModel,
        'viewportWidth': width,
        'viewportHeight': height,
      }),
    );

    final inventory = jsonDecode(
      File(
        'docs/design-handoff/placeholder-app/visual-state-inventory.json',
      ).readAsStringSync(),
    ) as Map<String, dynamic>;
    for (final state
        in (inventory['states'] as List).cast<Map<String, dynamic>>()) {
      for (final theme in const ['dark', 'light']) {
        final id = state['id'] as String;
        final profile = state['fixtureProfile'] as String;
        final filename =
            state[theme == 'dark' ? 'referenceDark' : 'referenceLight']
                as String;
        final key = '$id--$theme';
        File(
          'docs/design-handoff/placeholder-app/reference-images/$filename',
        ).copySync('${capture.path}/$key.png');
        File('${capture.path}/$key.meta.json').writeAsStringSync(
          jsonEncode({
            'screen': id,
            'route': '/debug/capture/$id',
            'deepLink': 'calorix://debug/reseed?screen=$id&theme=$theme',
            'theme': theme,
            'fixtureProfile': profile,
            'fixtureHash': sha256.convert(utf8.encode(profile)).toString(),
            'sourceFingerprint': sourceFingerprint,
            'apkHash': apkHash,
            'buildHash': buildHash,
            'deviceId': deviceId,
            'deviceModel': deviceModel,
            'viewportWidth': width,
            'viewportHeight': height,
            'captureTimestamp': '2026-07-28T12:00:00Z',
            'staleBuildFingerprint': false,
          }),
        );
      }
    }

    final result = _runPowerShell([
      '-File',
      'tool/ui_capture/validate_artifacts.ps1',
      '-CapturePath',
      capture.path,
    ]);

    expect(result.exitCode, 0, reason: '${result.stderr}\n${result.stdout}');
    final report = jsonDecode(result.stdout as String) as Map<String, dynamic>;
    expect(report['valid'], isTrue);
    expect(report['pngCount'], 38);
    expect(report['metadataCount'], 38);
    expect(report['fixtureProfileCount'], 9);
  });
}
