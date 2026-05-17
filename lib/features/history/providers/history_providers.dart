import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../../../shared/models/daily_log.dart';
import '../../../shared/models/food_entry.dart';
import '../../../shared/providers/auth_provider.dart';
import '../../../core/constants/app_constants.dart';

final selectedWeekProvider = StateProvider<DateTime>((ref) {
  final now = DateTime.now();
  return now.subtract(Duration(days: now.weekday - 1));
});

final historyProvider = StreamProvider<List<DailyLog>>((ref) {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return Stream.value([]);
  final firestore = ref.watch(firestoreProvider);
  return firestore
      .collection(AppConstants.dailyLogsCollection)
      .where(FieldPath.documentId, isGreaterThanOrEqualTo: '${uid}_')
      .where(FieldPath.documentId, isLessThan: '${uid}_z')
      .orderBy(FieldPath.documentId, descending: true)
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
  return ref
      .watch(foodEntryRepositoryProvider)
      .watchEntriesForDate(uid, date);
});
