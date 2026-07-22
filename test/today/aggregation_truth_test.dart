import 'package:calorix/features/today/providers/today_providers.dart';
import 'package:calorix/shared/models/food_entry.dart';
import 'package:calorix/shared/models/macro_target_plan.dart';
import 'package:calorix/shared/providers/ui_diff_provider.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

FoodEntry _entry({
  required String id,
  required double kcal,
  required double protein,
  required double carbs,
  required double fat,
  double multiplier = 1,
  FoodEntryStatus status = FoodEntryStatus.complete,
}) =>
    FoodEntry(
      id: id,
      uid: 'user-1',
      timestamp: DateTime.utc(2026, 7, 22, 12),
      date: '2026-07-22',
      scanMode: 'meal',
      status: status,
      baseKcal: kcal,
      baseProtein: protein,
      baseCarbs: carbs,
      baseFat: fat,
      servingMultiplier: multiplier,
    );

MacroTargetPlan _plan({int kcal = 2400}) => MacroTargetPlan(
      id: 'plan',
      planName: 'Plan',
      goal: BodyGoal.maintain,
      startDate: DateTime.utc(2026, 7, 1),
      kcal: kcal,
      protein: 170,
      carbs: 250,
      fat: 70,
      isActive: true,
    );

ProviderContainer _container({
  required List<FoodEntry> entries,
  bool fixtureEnabled = false,
  int targetKcal = 2400,
}) =>
    ProviderContainer(
      overrides: [
        uiDiffFixtureEnabledProvider.overrideWith((_) => fixtureEnabled),
        todayEntriesProvider.overrideWith((_) => Stream.value(entries)),
        activePlanProvider.overrideWith(
          (_) => Stream.value(_plan(kcal: targetKcal)),
        ),
      ],
    );

Future<void> _settle(ProviderContainer container) async {
  await container.read(todayEntriesProvider.future);
  await container.read(activePlanProvider.future);
}

void main() {
  test('production summary remains entry-derived in fixture mode', () async {
    final container = _container(
      fixtureEnabled: true,
      entries: [
        _entry(id: 'chicken', kcal: 620, protein: 48, carbs: 72, fat: 16),
        _entry(id: 'yogurt', kcal: 180, protein: 25, carbs: 12, fat: 3),
        _entry(id: 'espresso', kcal: 45, protein: 1, carbs: 8, fat: 1),
      ],
    );
    addTearDown(container.dispose);
    await _settle(container);

    final summary = container.read(todaySummaryProvider);
    expect(summary.kcal, 845);
    expect(summary.proteinG, 74);
    expect(summary.carbsG, 92);
    expect(summary.fatG, 20);
    expect(summary.targetKcal, 2400);
    expect(summary.kcalLeft, 1555);
  });

  test('summary scales once and excludes unconfirmed review entries', () async {
    final container = _container(
      entries: [
        _entry(
          id: 'scaled',
          kcal: 100,
          protein: 10,
          carbs: 20,
          fat: 5,
          multiplier: 2,
        ),
        _entry(
          id: 'review',
          kcal: 900,
          protein: 90,
          carbs: 90,
          fat: 90,
          status: FoodEntryStatus.needsReview,
        ),
      ],
      targetKcal: 150,
    );
    addTearDown(container.dispose);
    await _settle(container);

    final summary = container.read(todaySummaryProvider);
    expect(summary.kcal, 200);
    expect(summary.proteinG, 20);
    expect(summary.carbsG, 40);
    expect(summary.fatG, 10);
    expect(summary.kcalLeft, 0);
  });

  test('only display adapter substitutes the fixture hero values', () async {
    final container = _container(
      fixtureEnabled: true,
      entries: [
        _entry(id: 'meal', kcal: 845, protein: 74, carbs: 92, fat: 20),
      ],
    );
    addTearDown(container.dispose);
    await _settle(container);

    expect(container.read(todaySummaryProvider).kcal, 845);
    expect(container.read(todayDisplaySummaryProvider).kcal, 1420);
  });
}
