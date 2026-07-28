import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';

const _inventoryPath =
    'docs/design-handoff/placeholder-app/visual-state-inventory.json';
const _manifestPath =
    'docs/design-handoff/placeholder-app/reference-images-manifest.json';
const _referenceImagesPath =
    'docs/design-handoff/placeholder-app/reference-images';
const _srcRoot = 'docs/design-handoff/placeholder-app/src';

const _sourceCommit = '307dfc04ee23bee022f85059cc09dc363b2e80f6';
const _sourceTree = '97339699422bcec8d92f2ec8e47c4179c184e034';

/// Git tree of `docs/design-handoff/placeholder-app/src` (the JSX sources).
/// This is a distinct object from `_sourceTree` above, which is the
/// `docs/design-handoff/placeholder-app/reference-images` tree recorded in
/// `reference-images-manifest.json`. Conflating the two hid that the JSX
/// sources were never actually pinned to a verified tree hash.
const _jsxSourceTree = '9c7a646d377691c18da4bc01968fcf9d2960c6a5';

/// Task 17 fixture-profile table
/// (docs/superpowers/plans/2026-07-17-complete-handoff-screens-product-quality.md).
const _expectedFixtureProfileById = <String, String>{
  'loading': 'flow_loading',
  'login': 'flow_login',
  'permission': 'flow_permission',
  'scan_idle': 'flow_scan',
  'scan_capturing': 'flow_scan',
  'processing': 'flow_processing',
  'review': 'flow_review',
  'manual': 'flow_manual',
  'today': 'populated',
  'today_empty': 'empty',
  'food': 'populated',
  'food_edit': 'populated',
  'history_week': 'populated',
  'history_month': 'populated',
  'goals': 'populated',
  'goals_select': 'populated',
  'ai': 'populated',
  'ai_history': 'populated',
  'profile': 'populated',
};

/// docs/design-handoff/placeholder-app/preview/screens.html `SCREENS` map is
/// the ground truth for JSX source/component/props per canonical ID.
const _expectedJsxFileById = <String, String>{
  'loading': 'cx-screen-loading.jsx',
  'login': 'cx-screen-login.jsx',
  'permission': 'cx-screen-states.jsx',
  'scan_idle': 'cx-screen-scan.jsx',
  'scan_capturing': 'cx-screen-scan.jsx',
  'processing': 'cx-screen-processing.jsx',
  'review': 'cx-screen-states.jsx',
  'manual': 'cx-screen-states.jsx',
  'today': 'cx-screen-today.jsx',
  'today_empty': 'cx-screen-today.jsx',
  'food': 'cx-screen-food.jsx',
  'food_edit': 'cx-screen-food.jsx',
  'history_week': 'cx-screen-history.jsx',
  'history_month': 'cx-screen-history.jsx',
  'goals': 'cx-screen-goals.jsx',
  'goals_select': 'cx-screen-goals.jsx',
  'ai': 'cx-screen-ai.jsx',
  'ai_history': 'cx-screen-ai-history.jsx',
  'profile': 'cx-screen-profile.jsx',
};

const _expectedComponentById = <String, String>{
  'loading': 'CXLoadingScreen',
  'login': 'CXLoginScreen',
  'permission': 'CXPermissionScreen',
  'scan_idle': 'CXScanScreen',
  'scan_capturing': 'CXScanScreen',
  'processing': 'CXProcessingScreen',
  'review': 'CXScanReviewScreen',
  'manual': 'CXManualAddScreen',
  'today': 'CXTodayScreen',
  'today_empty': 'CXTodayScreen',
  'food': 'CXFoodDetailScreen',
  'food_edit': 'CXFoodDetailScreen',
  'history_week': 'CXHistoryScreen',
  'history_month': 'CXHistoryScreen',
  'goals': 'CXGoalsScreen',
  'goals_select': 'CXGoalsScreen',
  'ai': 'CXAIScreen',
  'ai_history': 'CXAIHistoryScreen',
  'profile': 'CXProfileScreen',
};

const _expectedPropsById = <String, Map<String, Object?>>{
  'scan_idle': {'state': 'idle'},
  'scan_capturing': {'state': 'capturing'},
  'today_empty': {'empty': true},
  'food': {'editing': false},
  'food_edit': {'editing': true},
  'history_week': {'view': 'week'},
  'history_month': {'view': 'month'},
  'goals': {'period': 'idle'},
  'goals_select': {'period': 'select'},
};

void main() {
  test(
      'visual-state-inventory.json maps exactly 19 canonical states to real '
      'JSX sources, components, fixture profiles, and manifest-backed '
      'reference images', () {
    final manifestFile = File(_manifestPath);
    expect(manifestFile.existsSync(), isTrue,
        reason: 'Canonical reference manifest is required.');
    final manifest =
        jsonDecode(manifestFile.readAsStringSync()) as Map<String, dynamic>;
    final manifestImages = (manifest['reference_images'] as List<dynamic>)
        .cast<Map<String, dynamic>>();
    final manifestByFilename = <String, Map<String, dynamic>>{
      for (final image in manifestImages) image['filename'] as String: image,
    };

    final inventoryFile = File(_inventoryPath);
    expect(inventoryFile.existsSync(), isTrue,
        reason: 'Task 17 Step 1 canonical visual-state inventory is '
            'required at $_inventoryPath.');
    final inventory =
        jsonDecode(inventoryFile.readAsStringSync()) as Map<String, dynamic>;

    final sourceCommit = inventory['source_commit'] as String?;
    final sourceTree = inventory['source_tree'] as String?;
    expect(sourceCommit, isNotNull);
    expect(sourceCommit, isNotEmpty);
    expect(sourceTree, isNotNull);
    expect(sourceTree, isNotEmpty);
    expect(sourceCommit, _sourceCommit);
    expect(sourceTree, _sourceTree);

    final jsxSourceTree = inventory['jsx_source_tree'] as String?;
    expect(jsxSourceTree, isNotNull,
        reason: 'visual-state-inventory.json must record jsx_source_tree '
            '(the git tree of docs/design-handoff/placeholder-app/src) '
            'separately from the reference-images source_tree.');
    expect(jsxSourceTree, isNotEmpty);
    expect(jsxSourceTree, _jsxSourceTree);

    final gitResult = Process.runSync('git', ['rev-parse', 'HEAD:$_srcRoot']);
    expect(gitResult.exitCode, 0,
        reason: 'Fail-closed: git rev-parse HEAD:$_srcRoot must succeed to '
            'verify the committed JSX subtree. stderr: ${gitResult.stderr}');
    final actualJsxSourceTree = (gitResult.stdout as String).trim();
    expect(actualJsxSourceTree, _jsxSourceTree,
        reason: 'Fail-closed: committed JSX subtree at HEAD:$_srcRoot '
            '($actualJsxSourceTree) no longer matches jsx_source_tree '
            '($_jsxSourceTree) recorded in visual-state-inventory.json.');

    final states =
        (inventory['states'] as List<dynamic>).cast<Map<String, dynamic>>();
    expect(states, hasLength(19));

    final ids = states.map((s) => s['id'] as String).toSet();
    expect(ids, hasLength(19));
    expect(ids, _expectedFixtureProfileById.keys.toSet());

    final filenames = <String>{};
    for (final state in states) {
      final darkFilename = state['referenceDark'] as String;
      final lightFilename = state['referenceLight'] as String;
      expect(darkFilename, endsWith('--dark.png'), reason: darkFilename);
      expect(lightFilename, endsWith('--light.png'), reason: lightFilename);
      filenames
        ..add(darkFilename)
        ..add(lightFilename);
    }
    expect(filenames, hasLength(38));
    expect(filenames, manifestByFilename.keys.toSet());

    for (final state in states) {
      final id = state['id'] as String;
      final jsxSource = state['jsxSource'] as String;
      final component = state['component'] as String;
      final fixtureProfile = state['fixtureProfile'] as String;
      final props =
          ((state['props'] as Map<String, dynamic>?) ?? const {}).cast<String, Object?>();

      expect(jsxSource, '$_srcRoot/${_expectedJsxFileById[id]}', reason: id);
      expect(component, _expectedComponentById[id], reason: id);
      expect(fixtureProfile, _expectedFixtureProfileById[id], reason: id);
      expect(props, _expectedPropsById[id] ?? const <String, Object?>{},
          reason: id);

      final jsxFile = File(jsxSource);
      expect(jsxFile.existsSync(), isTrue, reason: jsxSource);
      expect(
          jsxFile.readAsStringSync().contains('function $component('), isTrue,
          reason: '$jsxSource must declare global component symbol '
              '$component');

      for (final key in ['referenceDark', 'referenceLight']) {
        final filename = state[key] as String;
        final manifestEntry = manifestByFilename[filename];
        expect(manifestEntry, isNotNull, reason: filename);

        final imageFile = File('$_referenceImagesPath/$filename');
        expect(imageFile.existsSync(), isTrue, reason: filename);
        final bytes = imageFile.readAsBytesSync();

        expect(manifestEntry!['width'], 402, reason: filename);
        expect(manifestEntry['height'], 874, reason: filename);
        expect(manifestEntry['size_bytes'], bytes.length, reason: filename);
        expect(sha256.convert(bytes).toString(), manifestEntry['sha256'],
            reason: filename);
        _expectPngDimensions(bytes, filename);
      }
    }
  });
}

void _expectPngDimensions(Uint8List bytes, String filename) {
  expect(bytes.length, greaterThanOrEqualTo(24), reason: filename);
  expect(bytes.sublist(0, 8), <int>[137, 80, 78, 71, 13, 10, 26, 10],
      reason: filename);
  expect(bytes.sublist(12, 16), <int>[73, 72, 68, 82], reason: filename);

  final header = ByteData.sublistView(bytes);
  expect(header.getUint32(16, Endian.big), 402, reason: filename);
  expect(header.getUint32(20, Endian.big), 874, reason: filename);
}
