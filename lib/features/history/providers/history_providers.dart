import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../../../shared/models/daily_log.dart';
import '../../../shared/models/food_entry.dart';
import '../../../shared/providers/auth_provider.dart';
import '../../../core/constants/app_constants.dart';
import '../../../core/time/clock_provider.dart';
import '../../../core/time/timezone_utils.dart' as timezone_utils;

final selectedWeekProvider = StateProvider<DateTime>((ref) {
  return timezone_utils.startOfWeek(ref.watch(clockProvider).nowTZ());
});

final historyProvider = StreamProvider<List<DailyLog>>((ref) {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return Stream.value([]);
  final firestore = ref.watch(firestoreProvider);
  return firestore
      .collection(AppConstants.usersCollection)
      .doc(uid)
      .collection(AppConstants.dailyLogsSubCollection)
      // Order by the server-written date field: descending __name__ ordering
      // would require a composite index, while single-field date is automatic.
      .orderBy('date', descending: true)
      .limit(30)
      .snapshots()
      .map((q) => q.docs
          .map((d) => DailyLog.fromFirestore(
              d as DocumentSnapshot<Map<String, dynamic>>))
          .toList());
});

final historyDayEntriesProvider =
    StreamProvider.autoDispose.family<List<FoodEntry>, DateTime>((ref, date) {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return Stream.value([]);
  return ref.watch(foodEntryRepositoryProvider).watchEntriesForDate(uid, date);
});
