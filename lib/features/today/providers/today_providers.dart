import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../shared/models/food_entry.dart';
import '../../../shared/providers/auth_provider.dart';
import '../../../shared/providers/ui_diff_provider.dart';

export '../../../shared/providers/plan_provider.dart' show activePlanProvider;

final todayEntriesProvider = StreamProvider<List<FoodEntry>>((ref) {
  final fixture = ref.watch(uiDiffFixtureManifestProvider);
  if (fixture != null) {
    return Stream.value(
      fixture.visibleTodayDocuments.map((entry) {
        final data = entry.value;
        return FoodEntry(
          id: entry.key.split('/').last,
          uid: data['uid'] as String,
          timestamp: data['timestamp'] as DateTime,
          date: data['date'] as String,
          imageUrl: data['imageUrl'] as String?,
          scanMode: data['scanMode'] as String,
          status: FoodEntryStatusWire.fromWire(data['status'] as String?),
          foodName: data['foodName'] as String?,
          kcal: (data['kcal'] as num?)?.toDouble(),
          protein: (data['protein'] as num?)?.toDouble(),
          carbs: (data['carbs'] as num?)?.toDouble(),
          fat: (data['fat'] as num?)?.toDouble(),
          confidence: (data['confidence'] as num?)?.toDouble(),
          servingMultiplier:
              (data['servingMultiplier'] as num?)?.toDouble() ?? 1,
          mealType: MealType.values.firstWhere(
            (value) => value.name == data['mealType'],
            orElse: () => MealType.lunch,
          ),
        );
      }).toList(growable: false),
    );
  }
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return Stream.value([]);
  return ref.watch(foodEntryRepositoryProvider).watchTodayEntries(uid);
});

final todayMacroSummaryProvider =
    Provider<({double kcal, double protein, double carbs, double fat})>((ref) {
  if (ref.watch(uiDiffFixtureEnabledProvider)) {
    // The static handoff screenshot intentionally shows 1,420 kcal in the
    // hero while the visible meal cards sum to 845 kcal. Keep that mismatch
    // isolated to ui-diff mode so visual parity does not change production math.
    return (kcal: 1420.0, protein: 96.0, carbs: 132.0, fat: 38.0);
  }

  final entries = ref.watch(todayEntriesProvider).valueOrNull ?? [];
  double kcal = 0, protein = 0, carbs = 0, fat = 0;
  for (final e in entries) {
    // Low-confidence scans awaiting review stay visible in the list but never
    // count toward totals until the user confirms them.
    if (e.needsReview) continue;
    kcal += e.scaledKcal;
    protein += e.scaledProtein;
    carbs += e.scaledCarbs;
    fat += e.scaledFat;
  }
  return (kcal: kcal, protein: protein, carbs: carbs, fat: fat);
});
