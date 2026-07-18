import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/features/today/providers/today_providers.dart';
import 'package:calorix/shared/models/food_entry.dart';
import 'package:calorix/shared/providers/ui_diff_provider.dart';

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
}) =>
    ProviderContainer(
      overrides: [
        uiDiffModeProvider.overrideWith((_) => uiDiffMode),
        uiDiffFixtureEnabledProvider.overrideWith((_) => fixtureEnabled),
        todayEntriesProvider.overrideWith((_) => Stream.value(entries)),
      ],
    );

void main() {
  test('todayMacroSummaryProvider sums entries in normal mode', () async {
    final container = _container(
      uiDiffMode: false,
      entries: [
        _entry(id: 'one', kcal: 100, protein: 10, carbs: 20, fat: 3),
        _entry(id: 'two', kcal: 45, protein: 1, carbs: 8, fat: 1),
      ],
    );
    addTearDown(container.dispose);

    await container.read(todayEntriesProvider.future);

    expect(
      container.read(todayMacroSummaryProvider),
      (kcal: 145.0, protein: 11.0, carbs: 28.0, fat: 4.0),
    );
  });

  test(
      'todayMacroSummaryProvider uses handoff hero values only for fixture mode',
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

    expect(
      container.read(todayMacroSummaryProvider),
      (kcal: 1420.0, protein: 96.0, carbs: 132.0, fat: 38.0),
    );
  });
}
