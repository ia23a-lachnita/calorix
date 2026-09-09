import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/models/food_entry.dart';
import '../../../shared/providers/auth_provider.dart';

export '../../../shared/models/food_entry.dart'
    show ReviewCandidate, ReviewConfirmation;

final reviewEntryProvider =
    StreamProvider.autoDispose.family<FoodEntry?, String>((ref, entryId) {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return const Stream.empty();
  return ref.watch(foodEntryRepositoryProvider).watchEntry(uid, entryId);
});

abstract class ReviewEntryGateway {
  Future<void> confirm(String entryId, ReviewConfirmation confirmation);
}

class _RepositoryReviewEntryGateway implements ReviewEntryGateway {
  const _RepositoryReviewEntryGateway(this._ref);
  final Ref _ref;

  @override
  Future<void> confirm(
    String entryId,
    ReviewConfirmation confirmation,
  ) async {
    final uid = _ref.read(currentUidProvider);
    if (uid == null) throw StateError('Authentication required.');
    await _ref.read(foodEntryRepositoryProvider).confirmReview(
          uid,
          entryId,
          confirmation,
        );
  }
}

final reviewEntryGatewayProvider = Provider<ReviewEntryGateway>(
  (ref) => _RepositoryReviewEntryGateway(ref),
);
