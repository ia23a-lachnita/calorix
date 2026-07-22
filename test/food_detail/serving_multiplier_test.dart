import 'package:calorix/features/food_detail/providers/food_detail_providers.dart';
import 'package:calorix/shared/models/food_entry.dart';
import 'package:flutter_test/flutter_test.dart';

FoodEntry _entry() => FoodEntry(
      id: 'e1',
      uid: 'u1',
      timestamp: DateTime.utc(2026, 7, 22),
      date: '2026-07-22',
      scanMode: 'meal',
      status: FoodEntryStatus.complete,
      kcal: 100,
      protein: 25,
      carbs: 10,
      fat: 5,
    );

void main() {
  test('clampServing snaps to 0.25 steps within 0.25 through 5.0', () {
    expect(clampServing(0.1), 0.25);
    expect(clampServing(1.13), 1.25);
    expect(clampServing(7), 5);
  });

  test('scaledBy changes multiplier while canonical base values stay fixed',
      () {
    final original = _entry();
    final scaled = scaledBy(original, 2);

    expect(scaled.servingMultiplier, 2);
    expect(scaled.baseKcal, 100);
    expect(scaled.baseProtein, 25);
    expect(scaled.scaledKcal, 200);
    expect(scaled.scaledProtein, 50);
    expect(original.servingMultiplier, 1);
  });

  test('displayed totals convert back to unrounded one-serving values', () {
    expect(baseFromDisplayed(50, 2), 25);
    expect(baseFromDisplayed(10, 3), closeTo(3.3333333333333335, 1e-12));
  });

  test('pending corrections serialize canonical base fields only', () {
    const edits = PendingEdits(kcal: 100, protein: 25, servingMultiplier: 2);
    final map = edits.toUpdateMap();

    expect(map, containsPair('baseKcal', 100));
    expect(map, containsPair('baseProtein', 25));
    expect(map, containsPair('servingMultiplier', 2));
    expect(map.containsKey('kcal'), isFalse);
    expect(map.containsKey('protein'), isFalse);
  });
}
