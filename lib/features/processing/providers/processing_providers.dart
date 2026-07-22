import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/models/food_entry.dart';
import '../../../shared/models/processing_state.dart';
import '../../../shared/providers/auth_provider.dart';
import '../../../shared/services/retry_analysis_service.dart';
import '../../scan/providers/scan_providers.dart';

final processingEntryProvider =
    StreamProvider.autoDispose.family<FoodEntry?, String>((ref, entryId) {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return const Stream.empty();
  return ref.watch(foodEntryRepositoryProvider).watchEntry(uid, entryId);
});

final uploadQueueEntriesProvider =
    StreamProvider.autoDispose<List<UploadQueueEntry>>((ref) async* {
  final queue = await ref.watch(uploadQueueServiceProvider.future);
  yield queue.entries;
  yield* queue.changes;
});

ProcessingPhase _phaseOf(FoodEntry entry) => switch (entry.status) {
      FoodEntryStatus.pending => ProcessingPhase.firestorePending,
      FoodEntryStatus.processing => ProcessingPhase.firestoreProcessing,
      FoodEntryStatus.complete ||
      FoodEntryStatus.needsReview =>
        ProcessingPhase.firestoreComplete,
      FoodEntryStatus.error => ProcessingPhase.firestoreError,
    };

final processingStateProvider =
    Provider.autoDispose.family<AsyncValue<ProcessingState>, String>(
  (ref, entryId) {
    final remote = ref.watch(processingEntryProvider(entryId));
    final local = ref.watch(uploadQueueEntriesProvider);
    final remoteEntry = remote.valueOrNull;
    if (remoteEntry != null) {
      return AsyncData(ProcessingState(phase: _phaseOf(remoteEntry)));
    }

    final queueEntries = local.valueOrNull;
    final matching =
        queueEntries?.where((entry) => entry.entryId == entryId).firstOrNull;
    if (matching != null) {
      return AsyncData(combineProcessingState(
        localEntry: matching,
        localPhase: matching.lastError == null
            ? ProcessingPhase.localUploading
            : ProcessingPhase.localError,
        localProgress: matching.lastError == null ? 0 : null,
      ));
    }

    if (remote.hasError) return AsyncError(remote.error!, remote.stackTrace!);
    if (local.hasError) return AsyncError(local.error!, local.stackTrace!);
    return const AsyncLoading();
  },
);

final retryAnalysisServiceProvider = Provider<RetryAnalysisService>(
  (ref) => CloudRetryAnalysisService(),
);

Future<void> retryProcessingEntry(
  WidgetRef ref, {
  required String entryId,
  required ProcessingPhase phase,
}) async {
  if (phase == ProcessingPhase.firestoreError) {
    await ref.read(retryAnalysisServiceProvider).retryEntryAnalysis(entryId);
    return;
  }
  if (phase != ProcessingPhase.localError) return;
  final queue = await ref.read(uploadQueueServiceProvider.future);
  final matches = queue.entries.where((entry) => entry.entryId == entryId);
  if (matches.isEmpty) return;
  await queue.manualRetry(matches.first.queueId);
  await queue.drainPending();
}
