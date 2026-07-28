import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/core/time/clock.dart';
import 'package:calorix/debug/debug_deep_links.dart';
import 'package:calorix/debug/ui_diff_fixture.dart';
import 'package:calorix/features/today/providers/today_providers.dart';
import 'package:calorix/shared/models/food_entry.dart';
import 'package:calorix/shared/models/macro_target_plan.dart';
import 'package:calorix/shared/providers/ui_diff_provider.dart';
import 'package:timezone/timezone.dart' as tz;

FoodEntry _entry({
  required String id,
  required double kcal,
  required double protein,
  required double carbs,
  required double fat,
}) =>
    FoodEntry(
      id: id,
      uid: 'test-user',
      timestamp: DateTime(2026, 7, 4, 12),
      date: '2026-07-04',
      scanMode: 'meal',
      status: FoodEntryStatus.complete,
      kcal: kcal,
      protein: protein,
      carbs: carbs,
      fat: fat,
    );

ProviderContainer _container({
  required List<FoodEntry> entries,
  required bool uiDiffMode,
  bool fixtureEnabled = false,
  UiDiffFixtureManifest? manifest,
}) =>
    ProviderContainer(
      overrides: [
        uiDiffModeProvider.overrideWith((_) => uiDiffMode),
        uiDiffFixtureEnabledProvider.overrideWith((_) => fixtureEnabled),
        uiDiffFixtureManifestProvider.overrideWith((_) => manifest),
        todayEntriesProvider.overrideWith((_) => Stream.value(entries)),
        activePlanProvider.overrideWith(
          (_) => Stream.value(
            MacroTargetPlan.defaultPlan(startDate: DateTime(2026, 1, 1)),
          ),
        ),
      ],
    );

void main() {
  test('todaySummaryProvider sums entries in normal mode', () async {
    final container = _container(
      uiDiffMode: false,
      entries: [
        _entry(id: 'one', kcal: 100, protein: 10, carbs: 20, fat: 3),
        _entry(id: 'two', kcal: 45, protein: 1, carbs: 8, fat: 1),
      ],
    );
    addTearDown(container.dispose);

    await container.read(todayEntriesProvider.future);
    await container.read(activePlanProvider.future);

    expect(
      container.read(todaySummaryProvider),
      (
        kcal: 145,
        proteinG: 11.0,
        carbsG: 28.0,
        fatG: 4.0,
        targetKcal: 2400,
        kcalLeft: 2255,
      ),
    );
  });

  test('todayDisplaySummaryProvider alone uses handoff fixture hero values',
      () async {
    final container = _container(
      uiDiffMode: true,
      fixtureEnabled: true,
      entries: [
        _entry(id: 'chicken', kcal: 620, protein: 48, carbs: 72, fat: 16),
        _entry(id: 'yogurt', kcal: 180, protein: 25, carbs: 12, fat: 3),
        _entry(id: 'espresso', kcal: 45, protein: 1, carbs: 8, fat: 1),
      ],
    );
    addTearDown(container.dispose);

    await container.read(todayEntriesProvider.future);
    await container.read(activePlanProvider.future);

    expect(container.read(todaySummaryProvider).kcal, 845);
    expect(container.read(todayDisplaySummaryProvider).kcal, 1420);
  });

  test('empty capture profile never receives populated hero values', () async {
    final manifest = UiDiffFixtureManifest.create(
      uid: 'test-user',
      clock: FakeClock(tz.TZDateTime.utc(2026, 7, 4, 12)),
      profile: UiDiffFixtureProfile.empty,
    );
    final container = _container(
      uiDiffMode: true,
      fixtureEnabled: true,
      manifest: manifest,
      entries: const [],
    );
    addTearDown(container.dispose);

    await container.read(todayEntriesProvider.future);
    await container.read(activePlanProvider.future);

    expect(container.read(todayDisplaySummaryProvider).kcal, 0);
    expect(container.read(todayDisplaySummaryProvider).kcalLeft, 2400);
  });
}
