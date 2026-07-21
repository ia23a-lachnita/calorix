import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/shared/models/processing_state.dart'
    show ProcessingPhase, UploadQueueEntry, combineProcessingState;
import 'package:calorix/features/processing/providers/processing_providers.dart';
import 'package:calorix/shared/models/food_entry.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

void main() {
  group('combineProcessingState', () {
    test('local uploading state when entry is active and no firestore state',
        () {
      final entry = UploadQueueEntry(
        queueId: 'q1',
        entryId: 'e1',
        imagePath: '/path',
        createdAt: DateTime(2026),
      );
      final state = combineProcessingState(
        localEntry: entry,
        localPhase: ProcessingPhase.localUploading,
        localProgress: 0.5,
      );
      expect(state.phase, ProcessingPhase.localUploading);
      expect(state.progress, 0.5);
    });

    test('local error state when entry has error and no firestore state', () {
      final entry = UploadQueueEntry(
        queueId: 'q1',
        entryId: 'e1',
        imagePath: '/path',
        createdAt: DateTime(2026),
        lastError: 'timeout',
      );
      final state = combineProcessingState(
        localEntry: entry,
        localPhase: ProcessingPhase.localError,
      );
      expect(state.phase, ProcessingPhase.localError);
      expect(state.errorMessage, 'timeout');
    });

    test('firestore phase takes precedence once document exists', () {
      final state = combineProcessingState(
        localEntry: null,
        firestorePhase: ProcessingPhase.firestoreProcessing,
      );
      expect(state.phase, ProcessingPhase.firestoreProcessing);
    });

    test('local phase takes precedence while no firestore document exists', () {
      final entry = UploadQueueEntry(
        queueId: 'q1',
        entryId: 'e1',
        imagePath: '/path',
        createdAt: DateTime(2026),
      );
      final state = combineProcessingState(
        localEntry: entry,
        localPhase: ProcessingPhase.localUploading,
        localProgress: 0.7,
        firestorePhase: null,
      );
      expect(state.phase, ProcessingPhase.localUploading);
      expect(state.progress, 0.7);
    });

    test('firestoreError does not re-enter local queue', () {
      final state = combineProcessingState(
        localEntry: null,
        firestorePhase: ProcessingPhase.firestoreError,
      );
      expect(state.phase, ProcessingPhase.firestoreError);
    });
  });
  providerTests();
}

FoodEntry _remote(FoodEntryStatus status) => FoodEntry(
      id: 'e1',
      uid: 'u1',
      timestamp: DateTime(2026),
      date: '2026-01-01',
      scanMode: 'meal',
      status: status,
    );

void providerTests() {
  group('processingStateProvider', () {
    test('maps a remote pending document to firestorePending', () async {
      final container = ProviderContainer(overrides: [
        processingEntryProvider('e1').overrideWith(
            (ref) => Stream.value(_remote(FoodEntryStatus.pending))),
        uploadQueueEntriesProvider
            .overrideWith((ref) => Stream.value(const [])),
      ]);
      addTearDown(container.dispose);

      await container.read(processingEntryProvider('e1').future);
      expect(
        container.read(processingStateProvider('e1')).valueOrNull?.phase,
        ProcessingPhase.firestorePending,
      );
    });

    test('uses a local queue error before a Firestore document exists',
        () async {
      final local = UploadQueueEntry(
        queueId: 'q1',
        entryId: 'e1',
        imagePath: '/pending/e1.jpg',
        createdAt: DateTime(2026),
        lastError: 'offline',
      );
      final container = ProviderContainer(overrides: [
        processingEntryProvider('e1')
            .overrideWith((ref) => const Stream.empty()),
        uploadQueueEntriesProvider.overrideWith((ref) => Stream.value([local])),
      ]);
      addTearDown(container.dispose);

      await container.read(uploadQueueEntriesProvider.future);
      final state = container.read(processingStateProvider('e1')).valueOrNull;
      expect(state?.phase, ProcessingPhase.localError);
      expect(state?.errorMessage, 'offline');
    });
  });
}
