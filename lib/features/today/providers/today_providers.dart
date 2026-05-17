import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../shared/models/food_entry.dart';
import '../../../shared/providers/auth_provider.dart';

export '../../../shared/providers/plan_provider.dart' show activePlanProvider;

final todayEntriesProvider = StreamProvider<List<FoodEntry>>((ref) {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return Stream.value([]);
  return ref.watch(foodEntryRepositoryProvider).watchTodayEntries(uid);
});

final todayMacroSummaryProvider = Provider<({double kcal, double protein, double carbs, double fat})>((ref) {
  final entries = ref.watch(todayEntriesProvider).valueOrNull ?? [];
  double kcal = 0, protein = 0, carbs = 0, fat = 0;
  for (final e in entries) {
    kcal += e.scaledKcal;
    protein += e.scaledProtein;
    carbs += e.scaledCarbs;
    fat += e.scaledFat;
  }
  return (kcal: kcal, protein: protein, carbs: carbs, fat: fat);
});
