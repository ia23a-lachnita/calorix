import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../shared/models/food_entry.dart';
import '../../../shared/providers/auth_provider.dart';

final processingEntryProvider =
    StreamProvider.autoDispose.family<FoodEntry, String>((ref, entryId) {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return const Stream.empty();
  final repo = ref.watch(foodEntryRepositoryProvider);
  return repo.watchEntry(uid, entryId);
});
