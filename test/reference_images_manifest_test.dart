import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';

const _referenceImagesPath =
    'docs/design-handoff/placeholder-app/reference-images';
const _manifestPath =
    'docs/design-handoff/placeholder-app/reference-images-manifest.json';
const _sourceCommit = '307dfc04ee23bee022f85059cc09dc363b2e80f6';
const _sourceTree = '97339699422bcec8d92f2ec8e47c4179c184e034';
const _todayDarkSha256 =
    '73ba85f25489c8d45beab57dd1b317138870ce8360fe0f4399ab0737a5e505f1';

const _expectedFilenames = <String>[
  'ai--dark.png',
  'ai--light.png',
  'ai_history--dark.png',
  'ai_history--light.png',
  'food--dark.png',
  'food--light.png',
  'food_edit--dark.png',
  'food_edit--light.png',
  'goals--dark.png',
  'goals--light.png',
  'goals_select--dark.png',
  'goals_select--light.png',
  'history_month--dark.png',
  'history_month--light.png',
  'history_week--dark.png',
  'history_week--light.png',
  'loading--dark.png',
  'loading--light.png',
  'login--dark.png',
  'login--light.png',
  'manual--dark.png',
  'manual--light.png',
  'permission--dark.png',
  'permission--light.png',
  'processing--dark.png',
  'processing--light.png',
  'profile--dark.png',
  'profile--light.png',
  'review--dark.png',
  'review--light.png',
  'scan_capturing--dark.png',
  'scan_capturing--light.png',
  'scan_idle--dark.png',
  'scan_idle--light.png',
  'today--dark.png',
  'today--light.png',
  'today_empty--dark.png',
  'today_empty--light.png',
];

const _expectedSha256ByFilename = <String, String>{
  'ai--dark.png':
      'd36b3b03a3b9b7f2a5dc3bd4d775c584b14baa19535487fc29209c65991ba5a5',
  'ai--light.png':
      '9025d11149d07a930a2571e37eeec37215af4b355366d203ac4f479455d50a56',
  'ai_history--dark.png':
      '3ec9001334bc9da9a272863d6ceb1a89c0d56a863635d2d7bda42132e4b6e628',
  'ai_history--light.png':
      '211095ff56f3206a69bd415228eec68dd75d13586791ee2f24fc901f26988fbd',
  'food--dark.png':
      'ee149844801f8e3b80f704bd965b231112fb3ab665777fc2add58d793c962bf6',
  'food--light.png':
      '7e9cabfa8c15b808a839aff137cb5fb58bddc82473a54b0d92bb1809f19a8773',
  'food_edit--dark.png':
      'd670edf5db783032a10b6c92d62db464e15a2fcd52e2e90f9dad183510a0f3cf',
  'food_edit--light.png':
      '925d4248264f6018a1ce5aae09004f33688f446acc0c640c10b914dec9a4f02f',
  'goals--dark.png':
      '4545f6d3bcc4069bf8aa610e1b43e76424278b0630b9a52d70ae8e7e8589566e',
  'goals--light.png':
      'ae2034178ba4a1f0dbd4bddfab5beafd549b2d780dda4feb235815c708c98299',
  'goals_select--dark.png':
      '9c449311ff8a503809219b7ddcf98e43453b12666bdd78f54866e783385466b9',
  'goals_select--light.png':
      '748bca649efbeb846a5e496ef21343dc1a4ce89c6527d5aacadcc857a52123cd',
  'history_month--dark.png':
      '85603bf835231f878267794f34d13c59378f8e7e30558b8764d72388f2888c0f',
  'history_month--light.png':
      '0467e3bf5f5160c07822e6f0a76ad3771b6ee98bcab93c779162607ccaa9af70',
  'history_week--dark.png':
      '3010e52dff80dee5f1c8b49c799a05b0d5379e3454b760efb35a0ee241e54d67',
  'history_week--light.png':
      '63b48c12fc792473f5d5d4dae6383076d0a87c1c2edfba74a4e528307f10d993',
  'loading--dark.png':
      '7763920a1437352b88fbebb8c235fd0eb7a0235c188643aad591bdb00fd08304',
  'loading--light.png':
      '3fa1a7a89cfda94f6ba3def16e704d58ac61406cdcc4becfe3692abe7af13c48',
  'login--dark.png':
      '39d7884a26f303485a4962717b3a6d9686bc1341fd12a7ae8cd3ec801e5d0790',
  'login--light.png':
      'ec479a3d08e8d3edcef152349490147b3878fae25404802db1762768b21e32e4',
  'manual--dark.png':
      '04f69c28d6efd61a50b9cc0df1ff8a365914291eddaf5d778597345a5d48a2f0',
  'manual--light.png':
      '4d29a4db5606c0fc2e95483de6eee0f466c9c3e9c5baca719fe43f10e16a6303',
  'permission--dark.png':
      '9d0d6798611483d56766590de8f9f025cb6519350e46d4617c9054dbede7aa86',
  'permission--light.png':
      '98f8d329325fad9ca40472739fcad30cfa73d129379776c9c9b4d849763e992c',
  'processing--dark.png':
      '067a41f3226216b014adfbcf0d702e27f14a4a5064b8a78bdea813028ef30736',
  'processing--light.png':
      'c5f2bb4474390c1eba4eccc52e564c390c59f6d9bac8bcc61a2ebcd29b266709',
  'profile--dark.png':
      '755f3a5d4fcc8733df4ba0a8a8b595651ea00814857ac2f9244c73364006544e',
  'profile--light.png':
      '31453ece1d631170dfb8d635f7b50e5723dc7b3aa61c71ea2b38e2c5112b0c51',
  'review--dark.png':
      'c828ead039f096c8ff6d4598074c5b210d753fecd629b7e4e3771ed5d9b35219',
  'review--light.png':
      '3e2a58ef4e74dcab29923f61f67026a1b508efa3a1ce4b46cb5df7a678836f59',
  'scan_capturing--dark.png':
      '90b9e32308b78b246e03944d84bb9de57b1855f0d5a35f2e866daf252d089f4f',
  'scan_capturing--light.png':
      'd13090223bf981e13055536e1af61b4c52bb7631a93f2f5ca96a15d8f641b3b2',
  'scan_idle--dark.png':
      '34e049409acfdd122fdeb8efe318baaad75974be2984571a371f1f1e666943f0',
  'scan_idle--light.png':
      'a891471bd799b27b5129bddebbd2a2806f978c804faf2bc1f3833d3a002d70f1',
  'today--dark.png': _todayDarkSha256,
  'today--light.png':
      '088be4c96e6f2fd37c5f89e4cf1cfceaf15494dfbeb37529375e36fa6419b595',
  'today_empty--dark.png':
      '0cdd4f04ed4f2075690b59e7fc6f180115616a4382e358c7a4f9fb72f0de3f53',
  'today_empty--light.png':
      '42fd610be52d7ab257a138dd609329dd507a9a690d4c42e1bd82b378aa8c0120',
};

void main() {
  test('canonical reference image manifest records the exact handoff tree', () {
    final manifestFile = File(_manifestPath);
    final referenceDirectory = Directory(_referenceImagesPath);

    expect(manifestFile.existsSync(), isTrue,
        reason: 'Canonical reference manifest is required.');
    expect(referenceDirectory.existsSync(), isTrue,
        reason: 'Canonical reference-images directory is required.');

    final manifest = jsonDecode(manifestFile.readAsStringSync())
        as Map<String, dynamic>;
    expect(manifest['source_commit'], _sourceCommit);
    expect(manifest['source_tree'], _sourceTree);

    final manifestImages = (manifest['reference_images'] as List<dynamic>)
        .cast<Map<String, dynamic>>();
    final manifestByFilename = <String, Map<String, dynamic>>{
      for (final image in manifestImages) image['filename'] as String: image,
    };
    expect(manifestByFilename.keys.toSet(),
        _expectedSha256ByFilename.keys.toSet());
    expect(manifestByFilename.keys.toList()..sort(), _expectedFilenames);
    expect(manifestImages, hasLength(38));

    final actualFilenames = referenceDirectory
        .listSync(recursive: true)
        .whereType<File>()
        .map((file) => file.path
            .replaceAll('\\', '/')
            .substring('$_referenceImagesPath/'.length))
        .toList()
      ..sort();
    expect(actualFilenames, _expectedFilenames);
    expect(actualFilenames, hasLength(38));

    for (final filename in _expectedFilenames) {
      final imageFile = File('$_referenceImagesPath/$filename');
      final image = manifestByFilename[filename]!;
      final bytes = imageFile.readAsBytesSync();

      expect(image['width'], 402, reason: filename);
      expect(image['height'], 874, reason: filename);
      expect(image['size_bytes'], bytes.length, reason: filename);
      final expectedSha256 = _expectedSha256ByFilename[filename]!;
      expect(image['sha256'], expectedSha256, reason: filename);
      expect(sha256.convert(bytes).toString(), expectedSha256, reason: filename);
      _expectPngDimensions(bytes, filename);
    }

    expect(manifestByFilename['today--dark.png']!['sha256'], _todayDarkSha256);
  });

  test('pinned digest map rejects coordinated manifest and file substitutions', () {
    final substitutedSha256 = '0' * 64;
    final manifestDigests = <String, String>{
      for (final entry in _expectedSha256ByFilename.entries)
        entry.key: entry.value,
    };
    final fileDigests = <String, String>{
      for (final entry in _expectedSha256ByFilename.entries)
        entry.key: entry.value,
    };
    manifestDigests['today--dark.png'] = substitutedSha256;
    fileDigests['today--dark.png'] = substitutedSha256;

    expect(() => _expectPinnedDigests(manifestDigests, fileDigests),
        throwsA(isA<TestFailure>()));
  });
}

void _expectPinnedDigests(
    Map<String, String> manifestDigests, Map<String, String> fileDigests) {
  expect(manifestDigests.keys.toSet(), _expectedSha256ByFilename.keys.toSet());
  expect(fileDigests.keys.toSet(), _expectedSha256ByFilename.keys.toSet());
  for (final entry in _expectedSha256ByFilename.entries) {
    expect(manifestDigests[entry.key], entry.value, reason: entry.key);
    expect(fileDigests[entry.key], entry.value, reason: entry.key);
  }
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
