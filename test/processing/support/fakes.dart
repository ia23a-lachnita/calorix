import 'package:timezone/timezone.dart' as tz;

import 'package:calorix/core/time/clock.dart';
export 'package:calorix/core/time/clock.dart' show FakeClock;

import 'package:calorix/shared/services/upload_queue_service.dart'
    show KvStore, PendingDir, SourceReader;

/// Deterministic clock helper wrapping the production [FakeClock].
FakeClock makeFakeClock([DateTime? initial]) {
  final dt = initial ?? DateTime(2026, 7, 15, 10, 0);
  return FakeClock(
    tz.TZDateTime.utc(dt.year, dt.month, dt.day, dt.hour, dt.minute),
  );
}

// ---------------------------------------------------------------------------
// In-memory key/value persistence adapter
// ---------------------------------------------------------------------------

class InMemoryKvStore implements KvStore {
  final Map<String, Object?> _store = {};

  @override
  String? read(String key) => _store[key] as String?;

  @override
  Future<void> write(String key, String value) async => _store[key] = value;

  @override
  Future<void> remove(String key) async => _store.remove(key);
}

// ---------------------------------------------------------------------------
// In-memory pending-directory adapter
// ---------------------------------------------------------------------------

class FakePendingDir implements PendingDir {
  final Map<String, String> _paths = {};
  final Set<String> _existing = {};

  String get path => '/fake/pending_uploads';
  int get existingCount => _existing.length;

  @override
  String pathFor(String queueId) => '$path/$queueId.jpg';

  @override
  Future<void> writeBytes(String queueId, List<int> bytes) async {
    _paths[queueId] = pathFor(queueId);
    _existing.add(queueId);
  }

  @override
  bool fileExists(String queueId) => _existing.contains(queueId);

  @override
  Future<void> delete(String queueId) async {
    _paths.remove(queueId);
    _existing.remove(queueId);
  }
}

// ---------------------------------------------------------------------------
// Fake source-bytes reader (registry-based: returns bytes for registered paths)
// ---------------------------------------------------------------------------

class FakeSourceReader implements SourceReader {
  final Map<String, List<int>> _registry = {};
  final List<int> _defaultBytes = [0xFF, 0xD8, 0xFF, 0xE0]; // JPEG magic

  void register(String path, List<int> bytes) => _registry[path] = bytes;

  @override
  Future<List<int>> readAsBytes(String path) async =>
      _registry[path] ?? _defaultBytes;
}
