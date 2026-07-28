import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../shared/models/food_entry.dart';
import '../../../shared/providers/auth_provider.dart';
import '../../../shared/providers/plan_provider.dart';
import '../../../shared/providers/ui_diff_provider.dart';
import '../../../debug/debug_deep_links.dart';

export '../../../shared/providers/plan_provider.dart' show activePlanProvider;

final todayEntriesProvider = StreamProvider<List<FoodEntry>>((ref) {
  final fixture = ref.watch(uiDiffFixtureManifestProvider);
  if (fixture != null) {
    return Stream.value(
      fixture.visibleTodayDocuments.map((entry) {
        final data = entry.value;
        return FoodEntry.fromData(
          id: entry.key.split('/').last,
          data: data,
        );
      }).toList(growable: false),
    );
  }
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return Stream.value([]);
  return ref.watch(foodEntryRepositoryProvider).watchTodayEntries(uid);
});

typedef TodaySummary = ({
  int kcal,
  double proteinG,
  double carbsG,
  double fatG,
  int targetKcal,
  int kcalLeft,
});

final todaySummaryProvider = Provider<TodaySummary>((ref) {
  final entries = ref.watch(todayEntriesProvider).valueOrNull ?? [];
  final activePlan = ref.watch(activePlanProvider).valueOrNull;
  final targetKcal = activePlan?.kcal ?? 2400;
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
  final roundedKcal = kcal.round();
  return (
    kcal: roundedKcal,
    proteinG: protein,
    carbsG: carbs,
    fatG: fat,
    targetKcal: targetKcal,
    kcalLeft: (targetKcal - roundedKcal).clamp(0, targetKcal).toInt(),
  );
});

final todayDisplaySummaryProvider = Provider<TodaySummary>((ref) {
  final summary = ref.watch(todaySummaryProvider);
  if (!ref.watch(uiDiffFixtureEnabledProvider)) return summary;
  final fixtureProfile = ref.watch(uiDiffFixtureManifestProvider)?.profile;
  if (fixtureProfile == UiDiffFixtureProfile.empty) return summary;

  // The static handoff intentionally shows values that differ from its
  // visible cards. Only this screen-facing adapter may reproduce that fixture.
  const fixtureKcal = 1420;
  return (
    kcal: fixtureKcal,
    proteinG: 96,
    carbsG: 132,
    fatG: 38,
    targetKcal: summary.targetKcal,
    kcalLeft:
        (summary.targetKcal - fixtureKcal).clamp(0, summary.targetKcal).toInt(),
  );
});
