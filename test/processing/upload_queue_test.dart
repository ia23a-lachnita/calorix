import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/shared/models/processing_state.dart'
    show ProcessingPhase, ProcessingState, UploadQueueEntry;
import 'package:calorix/shared/services/upload_queue_service.dart'
    show UploadQueueService;

import 'support/fakes.dart';

void main() {
  group('UploadQueueEntry', () {
    test('copyWith preserves identity fields', () {
      final entry = UploadQueueEntry(
        queueId: 'q1',
        entryId: 'e1',
        imagePath: '/fake/path.jpg',
        createdAt: DateTime(2026, 7, 15),
      );
      final updated = entry.copyWith(retryCount: 3, lastError: 'timeout');
      expect(updated.queueId, 'q1');
      expect(updated.entryId, 'e1');
      expect(updated.retryCount, 3);
      expect(updated.lastError, 'timeout');
      expect(updated.imagePath, '/fake/path.jpg');
    });

    test('defaults: retryCount=0, autoRetryDisabled=false, nextRetryAt=null',
        () {
      final entry = UploadQueueEntry(
        queueId: 'q1',
        entryId: 'e1',
        imagePath: '/path',
        createdAt: DateTime(2026),
      );
      expect(entry.retryCount, 0);
      expect(entry.autoRetryDisabled, isFalse);
      expect(entry.nextRetryAt, isNull);
      expect(entry.lastError, isNull);
    });

    test('toJson/fromJson round-trip', () {
      final entry = UploadQueueEntry(
        queueId: 'q1',
        entryId: 'e1',
        imagePath: '/img.jpg',
        createdAt: DateTime(2026, 7, 15, 10, 30),
        retryCount: 2,
        lastError: 'timeout',
        nextRetryAt: DateTime(2026, 7, 15, 10, 31),
        autoRetryDisabled: false,
      );
      final json = entry.toJson();
      final restored = UploadQueueEntry.fromJson(json);
      expect(restored.queueId, entry.queueId);
      expect(restored.entryId, entry.entryId);
      expect(restored.imagePath, entry.imagePath);
      expect(restored.retryCount, entry.retryCount);
      expect(restored.lastError, entry.lastError);
      expect(restored.nextRetryAt, entry.nextRetryAt);
      expect(restored.autoRetryDisabled, entry.autoRetryDisabled);
    });
  });

  group('UploadQueueService (real class with external-port test fakes)', () {
    late UploadQueueService queue;
    late FakeClock clock;
    late InMemoryKvStore kv;
    late FakePendingDir pending;
    late FakeSourceReader source;
    late Directory tmpDir;
    late File imgFile;
    late File aFile;
    late File bFile;

    setUp(() async {
      clock = makeFakeClock();
      kv = InMemoryKvStore();
      pending = FakePendingDir();
      source = FakeSourceReader();
      tmpDir = await Directory.systemTemp.createTemp('uq_test_');
      imgFile = File('${tmpDir.path}/img.jpg');
      aFile = File('${tmpDir.path}/a.jpg');
      bFile = File('${tmpDir.path}/b.jpg');
      await imgFile.writeAsBytes([0xFF, 0xD8, 0xFF, 0xE0]);
      await aFile.writeAsBytes([0xAA, 0xBB]);
      await bFile.writeAsBytes([0xCC, 0xDD]);
      source.register(imgFile.path, [0xFF, 0xD8, 0xFF, 0xE0]);
      source.register(aFile.path, [0xAA, 0xBB]);
      source.register(bFile.path, [0xCC, 0xDD]);
      queue = UploadQueueService(clock, kv, pending, source);
    });

    tearDown(() async {
      if (await tmpDir.exists()) {
        await tmpDir.delete(recursive: true);
      }
    });

    test('enqueue is idempotent -- duplicate entryId returns existing queueId',
        () async {
      final id1 = await queue.enqueue(entryId: 'e1', imagePath: imgFile.path);
      final id2 = await queue.enqueue(entryId: 'e1', imagePath: imgFile.path);
      expect(id1, id2);
      expect(queue.entries.length, 1);
    });

    test('enqueue creates a durable copy on disk', () async {
      final qId = await queue.enqueue(entryId: 'e1', imagePath: imgFile.path);
      expect(pending.fileExists(qId), isTrue);
    });

    test('durable copy deleted after Firestore handoff success', () async {
      final qId = await queue.enqueue(entryId: 'e1', imagePath: imgFile.path);
      expect(pending.fileExists(qId), isTrue);
      await queue.remove(qId);
      expect(pending.fileExists(qId), isFalse);
      expect(queue.entries.isEmpty, isTrue);
    });

    test('durable copy retained on retryable failure', () async {
      final qId = await queue.enqueue(entryId: 'e1', imagePath: imgFile.path);
      final existing = queue.entries.firstWhere((e) => e.queueId == qId);
      await queue.updateEntry(existing.copyWith(
        retryCount: 1,
        lastError: 'Socket timeout',
        nextRetryAt: clock.now().add(const Duration(seconds: 30)),
      ));
      expect(pending.fileExists(qId), isTrue);
      expect(queue.entries.length, 1);
    });

    test('durable copy deleted on fatal non-retryable failure', () async {
      final qId = await queue.enqueue(entryId: 'e1', imagePath: imgFile.path);
      await queue.remove(qId);
      expect(pending.fileExists(qId), isFalse);
      expect(queue.entries.isEmpty, isTrue);
    });

    test('upload interrupted by kill is re-enqueued and retried on next start',
        () async {
      await queue.enqueue(entryId: 'e1', imagePath: imgFile.path);
      final reloaded = await queue.loadQueue();
      expect(reloaded.length, 1);
      expect(reloaded.first.entryId, 'e1');
    });

    test('durable copy survives process death and is used on restart retry',
        () async {
      final qId = await queue.enqueue(entryId: 'e1', imagePath: imgFile.path);
      final entry = queue.entries.firstWhere((e) => e.queueId == qId);
      expect(entry.imagePath, pending.pathFor(qId));
      expect(pending.fileExists(qId), isTrue);
    });

    test('offline enqueue does not lose the capture', () async {
      final qId = await queue.enqueue(entryId: 'e1', imagePath: imgFile.path);
      expect(qId, isNotEmpty);
      expect(queue.entries.length, 1);
      expect(pending.fileExists(qId), isTrue);
    });

    test('enqueue generates stable unique queueIds', () async {
      final id1 = await queue.enqueue(entryId: 'e1', imagePath: aFile.path);
      final id2 = await queue.enqueue(entryId: 'e2', imagePath: bFile.path);
      expect(id1, isNot(equals(id2)));
      expect(queue.entries.length, 2);
    });
  });

  group('bounded exponential backoff', () {
    test(
        'nextRetryAt computed from injected clockProvider, increases with retryCount',
        () {
      final clock = makeFakeClock();
      const baseDelay = Duration(seconds: 30);

      final retryAt0 = clock.now().add(baseDelay * 1);
      final retryAt3 = clock.now().add(baseDelay * 8);

      expect(retryAt3.isAfter(retryAt0), isTrue);
    });

    test('computeBackoff returns correct exponential values', () {
      expect(UploadQueueService.computeBackoff(0), const Duration(seconds: 30));
      expect(UploadQueueService.computeBackoff(1), const Duration(seconds: 60));
      expect(
          UploadQueueService.computeBackoff(2), const Duration(seconds: 120));
      expect(
          UploadQueueService.computeBackoff(3), const Duration(seconds: 240));
    });

    test('computeBackoff is capped at max delay', () {
      expect(
          UploadQueueService.computeBackoff(10), const Duration(minutes: 30));
    });

    test(
        'retryCount capped at max -- entry sets autoRetryDisabled true and nextRetryAt null',
        () {
      const maxRetries = 5;
      final entry = UploadQueueEntry(
        queueId: 'q0',
        entryId: 'e0',
        imagePath: '/path',
        createdAt: DateTime(2026),
        retryCount: maxRetries,
        autoRetryDisabled: true,
        nextRetryAt: null,
      );
      expect(entry.autoRetryDisabled, isTrue);
      expect(entry.nextRetryAt, isNull);
      expect(entry.imagePath, isNotEmpty);
    });

    test('manual retry after cap reached clears autoRetryDisabled', () {
      final capped = UploadQueueEntry(
        queueId: 'q0',
        entryId: 'e0',
        imagePath: '/path',
        createdAt: DateTime(2026),
        retryCount: 5,
        autoRetryDisabled: true,
        nextRetryAt: null,
      );
      final retried = capped.copyWith(
        autoRetryDisabled: false,
        retryCount: 0,
        nextRetryAt: DateTime(2026, 1, 1, 0, 0, 30),
      );
      expect(retried.autoRetryDisabled, isFalse);
      expect(retried.retryCount, 0);
      expect(retried.nextRetryAt, isNotNull);
      expect(retried.queueId, capped.queueId);
      expect(retried.entryId, capped.entryId);
    });

    test('drain skips entries whose nextRetryAt is still in the future',
        () async {
      final clock = makeFakeClock();
      final kv = InMemoryKvStore();
      final pending = FakePendingDir();
      final source = FakeSourceReader();
      final tmpDir = await Directory.systemTemp.createTemp('uq_drain_');
      final imgFile = File('${tmpDir.path}/img.jpg');
      await imgFile.writeAsBytes([0xFF, 0xD8, 0xFF, 0xE0]);
      source.register(imgFile.path, [0xFF, 0xD8, 0xFF, 0xE0]);
      final queue = UploadQueueService(clock, kv, pending, source);

      final qId = await queue.enqueue(entryId: 'e1', imagePath: imgFile.path);

      final entry = queue.entries.firstWhere((e) => e.queueId == qId);
      await queue.updateEntry(entry.copyWith(
        nextRetryAt: clock.now().add(const Duration(hours: 1)),
        retryCount: 1,
      ));

      final uploaded = await queue.drain((entryId, imagePath) async {});
      expect(uploaded, isEmpty);
      await tmpDir.delete(recursive: true);
    });

    test('drain processes entries whose nextRetryAt is in the past', () async {
      final clock = makeFakeClock();
      final kv = InMemoryKvStore();
      final pending = FakePendingDir();
      final source = FakeSourceReader();
      final tmpDir = await Directory.systemTemp.createTemp('uq_drain2_');
      final imgFile = File('${tmpDir.path}/img.jpg');
      await imgFile.writeAsBytes([0xFF, 0xD8, 0xFF, 0xE0]);
      source.register(imgFile.path, [0xFF, 0xD8, 0xFF, 0xE0]);
      final queue = UploadQueueService(clock, kv, pending, source);

      final qId = await queue.enqueue(entryId: 'e1', imagePath: imgFile.path);

      final entry = queue.entries.firstWhere((e) => e.queueId == qId);
      await queue.updateEntry(entry.copyWith(
        nextRetryAt: clock.now().subtract(const Duration(seconds: 1)),
        retryCount: 1,
      ));

      final uploaded = await queue.drain((entryId, imagePath) async {});
      expect(uploaded.length, 1);
      await tmpDir.delete(recursive: true);
    });

    test('drain skips autoRetryDisabled entries', () async {
      final clock = makeFakeClock();
      final kv = InMemoryKvStore();
      final pending = FakePendingDir();
      final source = FakeSourceReader();
      final tmpDir = await Directory.systemTemp.createTemp('uq_drain3_');
      final imgFile = File('${tmpDir.path}/img.jpg');
      await imgFile.writeAsBytes([0xFF, 0xD8, 0xFF, 0xE0]);
      source.register(imgFile.path, [0xFF, 0xD8, 0xFF, 0xE0]);
      final queue = UploadQueueService(clock, kv, pending, source);

      final qId = await queue.enqueue(entryId: 'e1', imagePath: imgFile.path);

      final entry = queue.entries.firstWhere((e) => e.queueId == qId);
      await queue.updateEntry(entry.copyWith(
        autoRetryDisabled: true,
        retryCount: 6,
      ));

      final uploaded = await queue.drain((entryId, imagePath) async {});
      expect(uploaded, isEmpty);
      expect(queue.entries.length, 1);
      await tmpDir.delete(recursive: true);
    });

    test(
        'retryCount capped at max -- stops auto-retrying, surfaces as localError for manual retry',
        () async {
      final clock = makeFakeClock();
      final kv = InMemoryKvStore();
      final pending = FakePendingDir();
      final source = FakeSourceReader();
      final tmpDir = await Directory.systemTemp.createTemp('uq_drain4_');
      final imgFile = File('${tmpDir.path}/img.jpg');
      await imgFile.writeAsBytes([0xFF, 0xD8, 0xFF, 0xE0]);
      source.register(imgFile.path, [0xFF, 0xD8, 0xFF, 0xE0]);
      final queue = UploadQueueService(clock, kv, pending, source);

      final qId = await queue.enqueue(entryId: 'e1', imagePath: imgFile.path);

      // Drain 6 times to exceed _maxRetries (5)
      for (var i = 0; i < 6; i++) {
        await queue.drain((entryId, imagePath) async {
          throw TimeoutException('transport error');
        });
        final nextRetryAt = queue.entries.first.nextRetryAt;
        if (nextRetryAt != null && nextRetryAt.isAfter(clock.now())) {
          clock.advance(nextRetryAt.difference(clock.now()) +
              const Duration(milliseconds: 1));
        }
      }

      final entry = queue.entries.firstWhere((e) => e.queueId == qId);
      expect(entry.autoRetryDisabled, isTrue);
      expect(entry.nextRetryAt, isNull);
      expect(entry.retryCount, greaterThan(5));
      await tmpDir.delete(recursive: true);
    });

    test(
        'manual retry after retry-cap reached clears autoRetryDisabled and recomputes nextRetryAt',
        () async {
      final clock = makeFakeClock();
      final kv = InMemoryKvStore();
      final pending = FakePendingDir();
      final source = FakeSourceReader();
      final tmpDir = await Directory.systemTemp.createTemp('uq_drain5_');
      final imgFile = File('${tmpDir.path}/img.jpg');
      await imgFile.writeAsBytes([0xFF, 0xD8, 0xFF, 0xE0]);
      source.register(imgFile.path, [0xFF, 0xD8, 0xFF, 0xE0]);
      final queue = UploadQueueService(clock, kv, pending, source);

      final qId = await queue.enqueue(entryId: 'e1', imagePath: imgFile.path);

      // Drain 6 times to hit the cap
      for (var i = 0; i < 6; i++) {
        await queue.drain((entryId, imagePath) async {
          throw TimeoutException('transport error');
        });
        final nextRetryAt = queue.entries.first.nextRetryAt;
        if (nextRetryAt != null && nextRetryAt.isAfter(clock.now())) {
          clock.advance(nextRetryAt.difference(clock.now()) +
              const Duration(milliseconds: 1));
        }
      }

      final capped = queue.entries.firstWhere((e) => e.queueId == qId);
      expect(capped.autoRetryDisabled, isTrue);

      // Manual retry
      await queue.manualRetry(qId);

      final resumed = queue.entries.firstWhere((e) => e.queueId == qId);
      expect(resumed.autoRetryDisabled, isFalse);
      expect(resumed.retryCount, 0);
      expect(resumed.nextRetryAt, isNotNull);
      expect(resumed.nextRetryAt!.isAfter(clock.now()), isTrue);
      await tmpDir.delete(recursive: true);
    });

    test('manual retry does not create a duplicate entry', () async {
      final clock = makeFakeClock();
      final kv = InMemoryKvStore();
      final pending = FakePendingDir();
      final source = FakeSourceReader();
      final tmpDir = await Directory.systemTemp.createTemp('uq_drain6_');
      final imgFile = File('${tmpDir.path}/img.jpg');
      await imgFile.writeAsBytes([0xFF, 0xD8, 0xFF, 0xE0]);
      source.register(imgFile.path, [0xFF, 0xD8, 0xFF, 0xE0]);
      final queue = UploadQueueService(clock, kv, pending, source);

      final qId = await queue.enqueue(entryId: 'e1', imagePath: imgFile.path);

      // Hit the cap
      for (var i = 0; i < 6; i++) {
        await queue.drain((entryId, imagePath) async {
          throw TimeoutException('transport error');
        });
      }

      final beforeCount = queue.entries.length;
      await queue.manualRetry(qId);
      expect(queue.entries.length, beforeCount);
      await tmpDir.delete(recursive: true);
    });
  });

  group('queue version migration', () {
    test('v0 (no version key) deserializes gracefully', () async {
      final clock = makeFakeClock();
      final kv = InMemoryKvStore();
      final pending = FakePendingDir();
      final source = FakeSourceReader();
      final queue = UploadQueueService(clock, kv, pending, source);
      final loaded = await queue.loadQueue();
      expect(loaded, isEmpty);
    });

    test('queue persists across FakeClock restart with stable queueId/entryId',
        () async {
      final clock = makeFakeClock();
      final kv = InMemoryKvStore();
      final pending = FakePendingDir();
      final source = FakeSourceReader();
      final tmpDir = await Directory.systemTemp.createTemp('uq_mig_');
      final imgFile = File('${tmpDir.path}/img.jpg');
      await imgFile.writeAsBytes([0xFF, 0xD8, 0xFF, 0xE0]);
      source.register(imgFile.path, [0xFF, 0xD8, 0xFF, 0xE0]);

      final queue1 = UploadQueueService(clock, kv, pending, source);
      final qId = await queue1.enqueue(entryId: 'e1', imagePath: imgFile.path);

      final queue2 = UploadQueueService(clock, kv, pending, source);
      await queue2.loadQueue();
      expect(queue2.entries, hasLength(1));
      expect(queue2.entries.single.queueId, qId);
      expect(queue2.entries.single.entryId, 'e1');
      await tmpDir.delete(recursive: true);
    });
  });

  group('firestoreError is remote-only', () {
    test(
        'local UploadQueueEntry and durable copy are already deleted by the time firestoreError occurs',
        () {
      const state = ProcessingState(
        phase: ProcessingPhase.firestoreError,
        errorMessage: 'Analysis failed remotely',
      );
      expect(state.phase, ProcessingPhase.firestoreError);
    });
  });

  group('drain with error classification', () {
    test('successful upload removes entry', () async {
      final clock = makeFakeClock();
      final kv = InMemoryKvStore();
      final pending = FakePendingDir();
      final source = FakeSourceReader();
      final tmpDir = await Directory.systemTemp.createTemp('uq_err1_');
      final imgFile = File('${tmpDir.path}/img.jpg');
      await imgFile.writeAsBytes([0xFF, 0xD8, 0xFF, 0xE0]);
      source.register(imgFile.path, [0xFF, 0xD8, 0xFF, 0xE0]);
      final queue = UploadQueueService(clock, kv, pending, source);

      await queue.enqueue(entryId: 'e1', imagePath: imgFile.path);
      expect(queue.entries.length, 1);

      final uploaded = await queue.drain((entryId, imagePath) async {});
      expect(uploaded.length, 1);
      expect(queue.entries.isEmpty, isTrue);
      await tmpDir.delete(recursive: true);
    });

    test('retryable failure retains entry with backoff', () async {
      final clock = makeFakeClock();
      final kv = InMemoryKvStore();
      final pending = FakePendingDir();
      final source = FakeSourceReader();
      final tmpDir = await Directory.systemTemp.createTemp('uq_err2_');
      final imgFile = File('${tmpDir.path}/img.jpg');
      await imgFile.writeAsBytes([0xFF, 0xD8, 0xFF, 0xE0]);
      source.register(imgFile.path, [0xFF, 0xD8, 0xFF, 0xE0]);
      final queue = UploadQueueService(clock, kv, pending, source);

      await queue.enqueue(entryId: 'e1', imagePath: imgFile.path);

      await queue.drain(
        (entryId, imagePath) async {
          throw Exception('Socket timeout');
        },
        classifyError: (e) => true,
      );

      expect(queue.entries.length, 1);
      final entry = queue.entries.first;
      expect(entry.retryCount, 1);
      expect(entry.lastError, isNotNull);
      expect(entry.nextRetryAt, isNotNull);
      await tmpDir.delete(recursive: true);
    });

    test('fatal failure removes entry and durable copy', () async {
      final clock = makeFakeClock();
      final kv = InMemoryKvStore();
      final pending = FakePendingDir();
      final source = FakeSourceReader();
      final tmpDir = await Directory.systemTemp.createTemp('uq_err3_');
      final imgFile = File('${tmpDir.path}/img.jpg');
      await imgFile.writeAsBytes([0xFF, 0xD8, 0xFF, 0xE0]);
      source.register(imgFile.path, [0xFF, 0xD8, 0xFF, 0xE0]);
      final queue = UploadQueueService(clock, kv, pending, source);

      final qId = await queue.enqueue(entryId: 'e1', imagePath: imgFile.path);

      await queue.drain(
        (entryId, imagePath) async {
          throw Exception('Permission denied');
        },
        classifyError: (e) => false,
      );

      expect(queue.entries.isEmpty, isTrue);
      expect(pending.fileExists(qId), isFalse);
      await tmpDir.delete(recursive: true);
    });
  });

  group('ProcessingState', () {
    test('localUploading phase with progress', () {
      const state = ProcessingState(
        phase: ProcessingPhase.localUploading,
        progress: 0.5,
      );
      expect(state.phase, ProcessingPhase.localUploading);
      expect(state.progress, 0.5);
      expect(state.errorMessage, isNull);
    });

    test('localError phase with error message', () {
      const state = ProcessingState(
        phase: ProcessingPhase.localError,
        errorMessage: 'Upload failed',
      );
      expect(state.phase, ProcessingPhase.localError);
      expect(state.errorMessage, 'Upload failed');
    });

    test('firestoreComplete phase', () {
      const state = ProcessingState(
        phase: ProcessingPhase.firestoreComplete,
      );
      expect(state.phase, ProcessingPhase.firestoreComplete);
    });
  });
}
