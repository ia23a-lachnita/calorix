import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/shared/models/processing_state.dart'
    show ProcessingPhase, UploadQueueEntry, combineProcessingState;

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
}
