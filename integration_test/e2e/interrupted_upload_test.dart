import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:calorix/core/time/clock.dart';
import 'package:calorix/shared/models/processing_state.dart';
import 'package:calorix/shared/services/upload_queue_service.dart';

import 'support/e2e_harness.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('interrupted_upload_test — queue retry across restart', () {
    testWidgets(
        'upload fails mid-attempt, queue persists, restart, retry succeeds, '
        'entry lands', (tester) async {
      SharedPreferences.setMockInitialValues({});
      final clock = makeE2EClock();
      final kv = _TestKvStore();
      final pending = _TestPendingDir();
      final source = _TestSourceReader();
      final foodStore = InMemoryFoodEntryDataStore();

      var uploadCallCount = 0;
      Future<void> fakeUpload(UploadQueueEntry entry) async {
        uploadCallCount++;
        if (uploadCallCount == 1) {
          throw const SocketException('simulated network failure');
        }
        foodStore.seed(
          makeFixtureEntry(
            id: entry.entryId,
            foodName: 'Interrupted Burger',
            baseKcal: 550,
          ),
        );
      }

      // ── 1. First session: enqueue then drain (fails) ────────────────
      final queue1 = UploadQueueService(
        clock,
        kv,
        pending,
        source,
        fakeUpload,
      );

      const entryId = 'upload-entry-1';
      await queue1.enqueue(
        entryId: entryId,
        imagePath: 'memory://img1.jpg',
        uid: e2eTestUid,
        scanMode: 'meal',
      );

      final succeeded1 = await queue1.drain(
        (id, _) => fakeUpload(queue1.entries.first),
      );
      expect(succeeded1, isEmpty);
      expect(queue1.entries, hasLength(1));

      final queuedEntry = queue1.entries.first;
      expect(queuedEntry.retryCount, 1);
      expect(queuedEntry.lastError, isNotNull);
      expect(queuedEntry.lastError, contains('SocketException'));
      expect(queuedEntry.nextRetryAt, isNotNull);

      await queue1.dispose();

      // ── 2. Simulate restart: new queue loads from same persistence ───
      final queue2 = UploadQueueService(clock, kv, pending, source);
      final loaded = await queue2.loadQueue();
      expect(loaded, hasLength(1));
      expect(loaded.first.entryId, entryId);
      expect(loaded.first.nextRetryAt, isNotNull);

      // ── 3. Second session: advance clock past persisted nextRetryAt ──
      //     Do NOT reset uploadCallCount; callCount == 2 is eligible.
      _advanceToNextRetry(clock, loaded.first);
      final succeeded2 = await queue2.drain(
        (id, _) => fakeUpload(queue2.entries.first),
      );
      expect(succeeded2, hasLength(1));
      expect(queue2.entries, isEmpty);

      // ── 4. Entry landed in the food store ────────────────────────────
      final landed = foodStore.entry(entryId);
      expect(landed, isNotNull);
      expect(landed!.foodName, 'Interrupted Burger');
      expect(landed.baseKcal, 550);

      await queue2.dispose();
    });

    testWidgets('fatal error removes entry from queue, no retry',
        (tester) async {
      SharedPreferences.setMockInitialValues({});
      final clock = makeE2EClock();
      final kv = _TestKvStore();
      final pending = _TestPendingDir();
      final source = _TestSourceReader();

      Future<void> fatalUpload(UploadQueueEntry entry) async {
        throw const FileSystemException('permission denied', '/secure/path');
      }

      final queue = UploadQueueService(clock, kv, pending, source);

      await queue.enqueue(
        entryId: 'fatal-entry',
        imagePath: 'memory://img2.jpg',
        uid: e2eTestUid,
        scanMode: 'meal',
      );

      final succeeded = await queue.drain(
        (id, _) => fatalUpload(queue.entries.first),
        classifyError: (_) => false,
      );

      expect(succeeded, isEmpty);
      expect(queue.entries, isEmpty);

      await queue.dispose();
    });

    testWidgets(
        'retryable errors cap at max retries then disable auto-retry',
        (tester) async {
      SharedPreferences.setMockInitialValues({});
      final clock = makeE2EClock();
      final kv = _TestKvStore();
      final pending = _TestPendingDir();
      final source = _TestSourceReader();

      Future<void> alwaysFail(UploadQueueEntry entry) async {
        throw const SocketException('persistent failure');
      }

      final queue = UploadQueueService(clock, kv, pending, source);

      await queue.enqueue(
        entryId: 'cap-entry',
        imagePath: 'memory://img3.jpg',
        uid: e2eTestUid,
        scanMode: 'meal',
      );

      for (var i = 0; i < 6; i++) {
        await queue.drain(
          (id, _) => alwaysFail(queue.entries.first),
        );
        if (queue.entries.isNotEmpty) {
          _advanceToNextRetry(clock, queue.entries.first);
        }
      }

      expect(queue.entries, hasLength(1));
      expect(queue.entries.first.autoRetryDisabled, isTrue);
      expect(queue.entries.first.retryCount, greaterThanOrEqualTo(6));

      await queue.dispose();
    });

    testWidgets(
        'manual retry resets capped entry and drain processes it',
        (tester) async {
      SharedPreferences.setMockInitialValues({});
      final clock = makeE2EClock();
      final kv = _TestKvStore();
      final pending = _TestPendingDir();
      final source = _TestSourceReader();
      final foodStore = InMemoryFoodEntryDataStore();

      var callCount = 0;
      Future<void> conditionalUpload(UploadQueueEntry entry) async {
        callCount++;
        if (callCount <= 6) throw const SocketException('fail');
        foodStore.seed(makeFixtureEntry(id: entry.entryId));
      }

      final queue = UploadQueueService(clock, kv, pending, source);

      await queue.enqueue(
        entryId: 'manual-retry-entry',
        imagePath: 'memory://img4.jpg',
        uid: e2eTestUid,
        scanMode: 'meal',
      );

      for (var i = 0; i < 6; i++) {
        await queue.drain(
          (id, _) => conditionalUpload(queue.entries.first),
        );
        if (queue.entries.isNotEmpty) {
          _advanceToNextRetry(clock, queue.entries.first);
        }
      }
      expect(queue.entries.first.autoRetryDisabled, isTrue);

      await queue.manualRetry(queue.entries.first.queueId);
      expect(queue.entries.first.autoRetryDisabled, isFalse);
      expect(queue.entries.first.retryCount, 0);

      final succeeded = await queue.drain(
        (id, _) => conditionalUpload(queue.entries.first),
      );
      expect(succeeded, hasLength(1));
      expect(queue.entries, isEmpty);
      expect(foodStore.entry('manual-retry-entry'), isNotNull);

      await queue.dispose();
    });
  });
}

// ---------------------------------------------------------------------------
// Test-local persistence fakes (mirror the private _Memory* classes in the
// harness, but defined here to keep the harness interface stable).
// ---------------------------------------------------------------------------

class _TestKvStore implements KvStore {
  final _values = <String, String>{};

  @override
  String? read(String key) => _values[key];

  @override
  Future<void> remove(String key) async => _values.remove(key);

  @override
  Future<void> write(String key, String value) async => _values[key] = value;
}

class _TestPendingDir implements PendingDir {
  final _files = <String, List<int>>{};

  @override
  Future<void> delete(String queueId) async => _files.remove(queueId);

  @override
  bool fileExists(String queueId) => _files.containsKey(queueId);

  @override
  String pathFor(String queueId) => 'memory://$queueId.jpg';

  @override
  Future<void> writeBytes(String queueId, List<int> bytes) async {
    _files[queueId] = List.of(bytes);
  }
}

class _TestSourceReader implements SourceReader {
  @override
  Future<List<int>> readAsBytes(String path) async => const [1, 2, 3];
}

/// Advances the [clock] to exactly [entry].nextRetryAt + 1 ms so the entry
/// becomes eligible for the next [UploadQueueService.drain] call.
void _advanceToNextRetry(FakeClock clock, UploadQueueEntry entry) {
  final nextRetry = entry.nextRetryAt;
  if (nextRetry == null) return;
  final gap = nextRetry.difference(clock.now()) + const Duration(milliseconds: 1);
  clock.advance(gap);
}
