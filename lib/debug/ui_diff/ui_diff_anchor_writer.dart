import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

import 'ui_diff_anchor.dart';

/// Writes a [UiDiffExportDto] to the app documents directory using an atomic
/// protocol so the mobile-ui-diff MCP can safely detect when the file is ready.
///
/// Output paths (relative to app documents dir):
///   ui-diff/<screen>/current/flutter-anchors.tmp.json  (intermediate)
///   ui-diff/<screen>/current/flutter-anchors.json      (final)
///   ui-diff/<screen>/current/flutter-anchors.done      (sentinel)
///
/// To pull to the repo:
///   adb shell "run-as <package> cat files/ui-diff/today/current/flutter-anchors.json"
///   — or use scripts/pull_flutter_anchors.ps1 —
///
/// Returns the final JSON file path on success, null on failure/release build.
Future<String?> dumpUiDiffAnchors(UiDiffExportDto dto) async {
  if (!kDebugMode) return null;

  try {
    final baseDir = await getApplicationDocumentsDirectory();
    final dir =
        Directory('${baseDir.path}/ui-diff/${dto.screen}/current');
    await dir.create(recursive: true);

    final tmpPath = '${dir.path}/flutter-anchors.tmp.json';
    final finalPath = '${dir.path}/flutter-anchors.json';
    final donePath = '${dir.path}/flutter-anchors.done';

    // Write to temp file first, then rename for atomicity.
    final tmpFile = File(tmpPath);
    await tmpFile.writeAsString(dto.toJsonString(), flush: true);

    // On some Android versions rename across directories can fail; use copy+delete
    // as a fallback.
    try {
      await tmpFile.rename(finalPath);
    } on FileSystemException {
      await tmpFile.copy(finalPath);
      await tmpFile.delete();
    }

    // Done sentinel — written only after final JSON is flushed.
    await File(donePath).writeAsString(
      DateTime.now().toUtc().toIso8601String(),
      flush: true,
    );

    debugPrint('[ui-diff] anchors → $finalPath');
    debugPrint('[ui-diff] done   → $donePath');
    return finalPath;
  } catch (e, st) {
    debugPrint('[ui-diff] anchor dump failed: $e\n$st');
    return null;
  }
}
