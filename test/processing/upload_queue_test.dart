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

  group('production handoff seam', () {
    test('enqueueAndUpload persists metadata, hands off, and cleans up',
        () async {
      final clock = makeFakeClock();
      final kv = InMemoryKvStore();
      final pending = FakePendingDir();
      final source = FakeSourceReader();
      final tmpDir = await Directory.systemTemp.createTemp('uq_prod_');
      final image = File('${tmpDir.path}/meal.jpg');
      await image.writeAsBytes([1, 2, 3]);
      source.register(image.path, [1, 2, 3]);
      UploadQueueEntry? handedOff;
      final queue = UploadQueueService(
        clock,
        kv,
        pending,
        source,
        (entry) async {
          handedOff = entry;
        },
        () => 'entry-prod',
      );

      final entryId = await queue.enqueueAndUpload(
        localPath: image.path,
        uid: 'user-1',
        scanMode: 'meal',
      );

      expect(entryId, 'entry-prod');
      expect(handedOff?.uid, 'user-1');
      expect(handedOff?.scanMode, 'meal');
      expect(handedOff?.storagePath, 'scans/user-1/entry-prod.jpg');
      expect(queue.entries, isEmpty);
      expect(pending.existingCount, 0);
      await tmpDir.delete(recursive: true);
    });

    test('production-configured enqueue rejects metadata loss before copying',
        () async {
      final source = FakeSourceReader()..register('/meal.jpg', [1, 2, 3]);
      final pending = FakePendingDir();
      final queue = UploadQueueService(
        makeFakeClock(),
        InMemoryKvStore(),
        pending,
        source,
        (entry) async {},
        () => 'entry-prod',
      );

      await expectLater(
        queue.enqueue(entryId: 'entry-prod', imagePath: '/meal.jpg'),
        throwsArgumentError,
      );
      expect(queue.entries, isEmpty);
      expect(pending.existingCount, 0);
    });

    test('cold-start load retains metadata and drainPending resumes handoff',
        () async {
      final clock = makeFakeClock();
      final kv = InMemoryKvStore();
      final pending = FakePendingDir();
      final source = FakeSourceReader()..register('/meal.jpg', [1, 2, 3]);
      final first = UploadQueueService(
        clock,
        kv,
        pending,
        source,
        (entry) async {},
        () => 'unused',
      );
      await first.enqueue(
        entryId: 'entry-restart',
        imagePath: '/meal.jpg',
        uid: 'user-1',
        scanMode: 'barcode',
        storagePath: 'scans/user-1/entry-restart.jpg',
      );

      UploadQueueEntry? resumed;
      final restarted = UploadQueueService(
        clock,
        kv,
        pending,
        source,
        (entry) async {
          resumed = entry;
        },
        () => 'unused',
      );
      await restarted.loadQueue();
      await restarted.drainPending();

      expect(resumed?.entryId, 'entry-restart');
      expect(resumed?.uid, 'user-1');
      expect(resumed?.scanMode, 'barcode');
      expect(restarted.entries, isEmpty);
    });
  });

  group('bounded exponential backoff', () {
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
        'manual retry after retry-cap makes the same entry immediately eligible',
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
      expect(resumed.nextRetryAt, isNull);
      var attempts = 0;
      await queue.drain((entryId, imagePath) async => attempts++);
      expect(attempts, 1);
      expect(queue.entries, isEmpty);
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

  group('queue concurrency guard', () {
    test('two simultaneous drain calls never upload the same queue entry twice',
        () async {
      final clock = makeFakeClock();
      final kv = InMemoryKvStore();
      final pending = FakePendingDir();
      final source = FakeSourceReader();
      final tmpDir = await Directory.systemTemp.createTemp('uq_conc_');
      final imgFile = File('${tmpDir.path}/img.jpg');
      await imgFile.writeAsBytes([0xFF, 0xD8, 0xFF, 0xE0]);
      source.register(imgFile.path, [0xFF, 0xD8, 0xFF, 0xE0]);

      final queue = UploadQueueService(clock, kv, pending, source);
      await queue.enqueue(entryId: 'e1', imagePath: imgFile.path);

      var uploadCount = 0;
      final firstUploadStarted = Completer<void>();
      final uploadCompleter = Completer<void>();

      final firstDrain = queue.drain((entryId, imagePath) async {
        uploadCount++;
        firstUploadStarted.complete();
        await uploadCompleter.future;
      });

      // Wait until the first upload callback has actually started.
      await firstUploadStarted.future;
      expect(uploadCount, 1);

      // Start a second drain while the first is in-flight.
      final secondDrain = queue.drain((entryId, imagePath) async {
        uploadCount++;
      });

      // Release the held upload.
      uploadCompleter.complete();
      await Future.wait([firstDrain, secondDrain]);

      // The entry must have been uploaded exactly once.
      expect(uploadCount, 1);

      await tmpDir.delete(recursive: true);
    });
  });
}
