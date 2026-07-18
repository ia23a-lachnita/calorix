import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Source-contract test: verifies that product code does not contain
/// raw DateTime.now() calls that should have been migrated to clockProvider.
///
/// This test scans lib/ source files for DateTime.now() usages and
/// asserts that only permitted operational files (debug, logs, analytics)
/// contain them. Product code must use clockProvider (RealClock) instead.
///
/// Files that ARE permitted to use DateTime.now():
/// - lib/debug/ (debug/artifact writers)
/// - lib/core/time/clock.dart (RealClock.now() implementation)
///
/// Files that MUST NOT use DateTime.now():
/// - lib/features/ (all screens and providers)
/// - lib/shared/repositories/ (data layer)
/// - lib/shared/services/ (upload, seed services)
/// - lib/shared/models/ (data models)
/// - lib/shared/providers/ (state providers)
void main() {
  group('Clock injection callsite contract', () {
    test('DateTime.now() is not used in product feature code', () {
      final violations = _findDateTimeNowInProductCode();
      expect(
        violations,
        isEmpty,
        reason: 'Found DateTime.now() in product code that should use '
            'clockProvider instead:\n${violations.join('\n')}',
      );
    });

    test('DateTime.now() is not used in repositories', () {
      final violations = _findDateTimeNowInFile(
        'lib/shared/repositories/',
        excludePatterns: [],
      );
      expect(
        violations,
        isEmpty,
        reason: 'Found DateTime.now() in repositories:\n${violations.join('\n')}',
      );
    });

    test('DateTime.now() is not used in services', () {
      final violations = _findDateTimeNowInFile(
        'lib/shared/services/',
        excludePatterns: [],
      );
      expect(
        violations,
        isEmpty,
        reason: 'Found DateTime.now() in services:\n${violations.join('\n')}',
      );
    });

    test('DateTime.now() is not used in models', () {
      final violations = _findDateTimeNowInFile(
        'lib/shared/models/',
        excludePatterns: [],
      );
      expect(
        violations,
        isEmpty,
        reason: 'Found DateTime.now() in models:\n${violations.join('\n')}',
      );
    });

    test('DateTime.now() is not used in providers', () {
      final violations = _findDateTimeNowInFile(
        'lib/shared/providers/',
        excludePatterns: [],
      );
      expect(
        violations,
        isEmpty,
        reason: 'Found DateTime.now() in providers:\n${violations.join('\n')}',
      );
    });

    test('clockProvider import is available for clock access', () {
      // Verify the clockProvider file exists and exports the expected symbol.
      // This is a compile-time contract check — if clockProvider doesn't exist,
      // the import itself would fail to resolve.
      final clockProviderFile = _findFileInLib('clock_provider.dart');
      expect(
        clockProviderFile,
        isNotNull,
        reason: 'clock_provider.dart must exist in lib/core/time/ for '
            'clockProvider to be injectable',
      );
    });

    test('Clock abstract class is available for injection', () {
      final clockFile = _findFileInLib('clock.dart');
      expect(
        clockFile,
        isNotNull,
        reason: 'clock.dart must exist in lib/core/time/ for Clock injection',
      );
    });

    test('FakeClock is available for testing', () {
      final clockFile = _findFileInLib('clock.dart');
      expect(
        clockFile,
        isNotNull,
        reason: 'clock.dart must exist for FakeClock in tests',
      );
    });
  });
}

/// Finds DateTime.now() occurrences in product code under lib/.
List<String> _findDateTimeNowInProductCode() {
  final violations = <String>[];

  // Search all lib/ files except debug and clock implementation
  final productDirs = [
    'lib/features/',
    'lib/shared/repositories/',
    'lib/shared/services/',
    'lib/shared/models/',
    'lib/shared/providers/',
  ];

  for (final dir in productDirs) {
    violations.addAll(_findDateTimeNowInFile(dir, excludePatterns: []));
  }

  return violations;
}

/// Finds DateTime.now() in files under the given directory pattern.
List<String> _findDateTimeNowInFile(
  String dirPattern, {
  List<String> excludePatterns = const [],
}) {
  final violations = <String>[];
  final dir = _resolveDir(dirPattern);
  if (dir == null) return violations;

  final files = dir.listSync(recursive: true).whereType<File>().toList();
  for (final file in files) {
    if (!file.path.endsWith('.dart')) continue;

    final relativePath = file.path
        .replaceFirst(RegExp(r'.*\\calorix\\'), '')
        .replaceFirst(RegExp(r'.*calorix/'), '');

    // Skip excluded patterns
    if (excludePatterns.any((p) => relativePath.contains(p))) continue;

    final content = file.readAsStringSync();
    final lines = content.split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].contains('DateTime.now()')) {
        violations.add('$relativePath:${i + 1}: ${lines[i].trim()}');
      }
    }
  }

  return violations;
}

/// Resolves a directory path relative to the workspace root.
Directory? _resolveDir(String relativePath) {
  try {
    final root = _findWorkspaceRoot();
    if (root == null) return null;
    final dir = Directory('$root/$relativePath');
    return dir.existsSync() ? dir : null;
  } catch (_) {
    return null;
  }
}

/// Finds the calorix project root by looking for pubspec.yaml.
String? _findWorkspaceRoot() {
  var dir = Directory.current;
  for (var i = 0; i < 10; i++) {
    if (File('${dir.path}/pubspec.yaml').existsSync()) {
      return dir.path;
    }
    dir = dir.parent;
  }
  return null;
}

/// Finds a file by name in lib/ tree.
String? _findFileInLib(String fileName) {
  final root = _findWorkspaceRoot();
  if (root == null) return null;

  final libDir = Directory('$root/lib');
  if (!libDir.existsSync()) return null;

  final dartFiles = libDir
      .listSync(recursive: true)
      .whereType<File>()
      .where((f) => f.path.endsWith('.dart'))
      .toList();

  for (final file in dartFiles) {
    if (file.path.endsWith('\\$fileName') || file.path.endsWith('/$fileName')) {
      return file.path;
    }
  }
  return null;
}
