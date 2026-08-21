import 'dart:convert';
import 'dart:async';
import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

import '../../core/constants/app_constants.dart';
import '../models/processing_state.dart';
import '../../core/time/clock.dart';
import '../utils/date_key.dart';

const _queueVersion = 1;
const _queueKey = 'upload_queue_v1';
const _maxRetries = 5;
const _baseDelay = Duration(seconds: 30);
const _maxDelay = Duration(minutes: 30);

/// Abstract persistence port for queue JSON.
abstract class KvStore {
  String? read(String key);
  Future<void> write(String key, String value);
  Future<void> remove(String key);
}

/// Abstract durable-file port for pending_uploads directory.
abstract class PendingDir {
  String pathFor(String queueId);
  Future<void> writeBytes(String queueId, List<int> bytes);
  bool fileExists(String queueId);
  Future<void> delete(String queueId);
}

/// Abstract source-bytes reader port. Production reads from the filesystem;
/// tests supply bytes without touching disk.
abstract class SourceReader {
  Future<List<int>> readAsBytes(String path);
}

/// Classifies an error as retryable (transport) or fatal (non-retryable).
bool isRetryableError(Object error) {
  if (error is SocketException || error is TimeoutException) return true;
  if (error is FirebaseException) {
    return switch (error.code) {
      'unavailable' || 'deadline-exceeded' || 'network-request-failed' => true,
      'permission-denied' || 'unauthenticated' || 'invalid-argument' => false,
      _ => false,
    };
  }
  return false;
}

/// Default source reader that reads bytes from the filesystem.
class _FileSourceReader implements SourceReader {
  const _FileSourceReader();

  @override
  Future<List<int>> readAsBytes(String path) => File(path).readAsBytes();
}

class SharedPreferencesKvStore implements KvStore {
  const SharedPreferencesKvStore(this._preferences);

  final SharedPreferences _preferences;

  @override
  String? read(String key) => _preferences.getString(key);

  @override
  Future<void> remove(String key) async => _preferences.remove(key);

  @override
  Future<void> write(String key, String value) async =>
      _preferences.setString(key, value);
}

class ApplicationSupportPendingDir implements PendingDir {
  const ApplicationSupportPendingDir(this._directory);

  final Directory _directory;

  @override
  Future<void> delete(String queueId) async {
    final file = File(pathFor(queueId));
    if (file.existsSync()) await file.delete();
  }

  @override
  bool fileExists(String queueId) => File(pathFor(queueId)).existsSync();

  @override
  String pathFor(String queueId) => '${_directory.path}/$queueId.jpg';

  @override
  Future<void> writeBytes(String queueId, List<int> bytes) async {
    await _directory.create(recursive: true);
    await File(pathFor(queueId)).writeAsBytes(bytes, flush: true);
  }
}

/// A versioned persistent upload queue with stable IDs, idempotent enqueue,
/// durable app-support copy, FIFO restart recovery, retryable/fatal error
/// classification, capped exponential backoff, and manual resume after cap.
class UploadQueueService {
  UploadQueueService(
    this._clock,
    this._kv,
    this._pending, [
    SourceReader? source,
    this._productionUpload,
    this._entryIdFactory,
  ]) : _source = source ?? const _FileSourceReader();
  final Clock _clock;
  final KvStore _kv;
  final PendingDir _pending;
  final SourceReader _source;
  final Future<void> Function(UploadQueueEntry entry)? _productionUpload;
  final String Function()? _entryIdFactory;
  final _changes = StreamController<List<UploadQueueEntry>>.broadcast();

  List<UploadQueueEntry> _entries = [];
  final Set<String> _inFlight = {};

  List<UploadQueueEntry> get entries => List.unmodifiable(_entries);
  Stream<List<UploadQueueEntry>> get changes => _changes.stream;

  Future<void> dispose() => _changes.close();

  static Future<UploadQueueService> production(Clock clock) async {
    final preferences = await SharedPreferences.getInstance();
    final support = await getApplicationSupportDirectory();
    final firestore = FirebaseFirestore.instance;
    final storage = FirebaseStorage.instance;

    Future<void> upload(UploadQueueEntry entry) async {
      final uid = entry.uid;
      final scanMode = entry.scanMode;
      if (uid == null || uid.isEmpty || scanMode == null || scanMode.isEmpty) {
        throw const FormatException('Queued upload metadata is incomplete.');
      }
      final storagePath =
          entry.storagePath ?? 'scans/$uid/${entry.entryId}.jpg';
      final storageRef = storage.ref(storagePath);
      await storageRef.putFile(File(entry.imagePath));
      final imageUrl = await storageRef.getDownloadURL();
      await firestore
          .collection(AppConstants.usersCollection)
          .doc(uid)
          .collection(AppConstants.entriesSubCollection)
          .doc(entry.entryId)
          .set({
        'uid': uid,
        'timestamp': FieldValue.serverTimestamp(),
        'date': localDateKey(clock.nowTZ()),
        'imageUrl': imageUrl,
        'storagePath': storagePath,
        'scanMode': scanMode,
        'status': 'pending',
      });
    }

    final service = UploadQueueService(
      clock,
      SharedPreferencesKvStore(preferences),
      ApplicationSupportPendingDir(
        Directory('${support.path}/pending_uploads'),
      ),
      const _FileSourceReader(),
      upload,
      () => const Uuid().v4(),
    );
    await service.loadQueue();
    return service;
  }

  /// Enqueues an entry. If an entry with the same [entryId] already exists,
  /// returns the existing [queueId] without creating a duplicate.
  Future<String> enqueue({
    required String entryId,
    required String imagePath,
    String? uid,
    String? scanMode,
    String? storagePath,
  }) async {
    if (_productionUpload != null &&
        (uid == null || uid.isEmpty || scanMode == null || scanMode.isEmpty)) {
      throw ArgumentError('Production queue entries require uid and scanMode.');
    }
    final existing = _entries.where((e) => e.entryId == entryId);
    if (existing.isNotEmpty) {
      return existing.first.queueId;
    }

    final queueId = const Uuid().v4();
    final durablePath = _pending.pathFor(queueId);

    await _pending.writeBytes(queueId, await _source.readAsBytes(imagePath));

    final entry = UploadQueueEntry(
      queueId: queueId,
      entryId: entryId,
      imagePath: durablePath,
      createdAt: _clock.now(),
      uid: uid,
      scanMode: scanMode,
      storagePath: storagePath,
    );

    _entries.add(entry);
    await _persist();
    return queueId;
  }

  Future<String> enqueueScan({
    required String localPath,
    required String uid,
    required String scanMode,
  }) async {
    final createEntryId = _entryIdFactory;
    if (createEntryId == null) {
      throw StateError('Production upload dependencies are not configured.');
    }
    final entryId = createEntryId();
    await enqueue(
      entryId: entryId,
      imagePath: localPath,
      uid: uid,
      scanMode: scanMode,
      storagePath: 'scans/$uid/$entryId.jpg',
    );
    return entryId;
  }

  Future<List<String>> drainPending() {
    final upload = _productionUpload;
    if (upload == null) {
      throw StateError('Production upload dependencies are not configured.');
    }
    return drain((entryId, _) {
      final entry = _entries.firstWhere((item) => item.entryId == entryId);
      return upload(entry);
    });
  }

  /// Removes an entry and its durable copy. Called on successful Firestore
  /// handoff, truly fatal non-retryable failure, or explicit user dismissal.
  Future<void> remove(String queueId) async {
    _entries.removeWhere((e) => e.queueId == queueId);
    await _pending.delete(queueId);
    await _persist();
  }

  /// Updates an entry in-place (e.g., after a failed upload attempt).
  Future<void> updateEntry(UploadQueueEntry updated) async {
    final idx = _entries.indexWhere((e) => e.queueId == updated.queueId);
    if (idx >= 0) {
      _entries[idx] = updated;
      await _persist();
    }
  }

  /// Recovers the queue from persistent storage. On app restart, verifies each
  /// durable copy exists on disk and removes orphaned entries.
  Future<List<UploadQueueEntry>> loadQueue() async {
    final raw = _kv.read(_queueKey);
    if (raw == null) {
      _entries = [];
      return _entries;
    }

    try {
      final decoded = jsonDecode(raw);
      final version = decoded['version'] as int? ?? 0;
      if (version > _queueVersion) throw const FormatException();
      final list = decoded['entries'] as List<dynamic>? ?? [];
      _entries = list
          .map((e) => UploadQueueEntry.fromJson(e as Map<String, Object?>))
          .toList();
    } catch (_) {
      _entries = [];
    }

    // Remove entries whose durable copies no longer exist on disk.
    final orphans = <String>[];
    for (final entry in _entries) {
      if (!_pending.fileExists(entry.queueId)) {
        orphans.add(entry.queueId);
      }
    }
    if (orphans.isNotEmpty) {
      _entries.removeWhere((e) => orphans.contains(e.queueId));
      await _persist();
    }

    return _entries;
  }

  /// Drains the queue in FIFO order, attempting upload for each eligible entry.
  /// Returns the list of successfully uploaded entry IDs.
  Future<List<String>> drain(
    Future<void> Function(String entryId, String imagePath) upload, {
    bool Function(Object error)? classifyError,
  }) async {
    final succeeded = <String>[];
    final now = _clock.now();

    for (final entry in List<UploadQueueEntry>.from(_entries)) {
      if (entry.autoRetryDisabled) continue;
      if (entry.nextRetryAt != null && entry.nextRetryAt!.isAfter(now)) {
        continue;
      }
      if (_inFlight.contains(entry.queueId)) continue;

      _inFlight.add(entry.queueId);
      try {
        await upload(entry.entryId, entry.imagePath);
        succeeded.add(entry.queueId);
        await remove(entry.queueId);
      } catch (error) {
        final retryable = classifyError != null
            ? classifyError(error)
            : isRetryableError(error);

        if (retryable) {
          final newRetryCount = entry.retryCount + 1;
          if (newRetryCount > _maxRetries) {
            await updateEntry(entry.copyWith(
              autoRetryDisabled: true,
              clearNextRetryAt: true,
              retryCount: newRetryCount,
              lastError: error.toString(),
            ));
          } else {
            final delay = _computeBackoff(newRetryCount);
            await updateEntry(entry.copyWith(
              retryCount: newRetryCount,
              lastError: error.toString(),
              nextRetryAt: _clock.now().add(delay),
            ));
          }
        } else {
          await remove(entry.queueId);
        }
      } finally {
        _inFlight.remove(entry.queueId);
      }
    }

    return succeeded;
  }

  /// Resumes a capped entry for manual retry: resets [autoRetryDisabled] and
  /// recomputes [nextRetryAt] to now + base delay. Same queueId/entryId,
  /// no duplicate created.
  Future<void> manualRetry(String queueId) async {
    final idx = _entries.indexWhere((e) => e.queueId == queueId);
    if (idx < 0) return;

    final entry = _entries[idx];
    if (!entry.autoRetryDisabled) return;

    await updateEntry(entry.copyWith(
      autoRetryDisabled: false,
      retryCount: 0,
      clearNextRetryAt: true,
      clearLastError: true,
    ));
  }

  /// Computes capped exponential backoff: baseDelay * 2^retryCount, capped.
  static Duration computeBackoff(int retryCount) => _computeBackoff(retryCount);

  static Duration _computeBackoff(int retryCount) {
    var delay = _baseDelay * (1 << retryCount);
    if (delay > _maxDelay) delay = _maxDelay;
    return delay;
  }

  Future<void> _persist() async {
    final json = {
      'version': _queueVersion,
      'entries': _entries.map((e) => e.toJson()).toList(),
    };
    await _kv.write(_queueKey, jsonEncode(json));
    _changes.add(List.unmodifiable(_entries));
  }
}
