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
    final edits = PendingEdits(kcal: 100, protein: 25, servingMultiplier: 2);
    final map = edits.toUpdateMap(_entry());

    expect(map, containsPair('baseKcal', 100));
    expect(map, containsPair('baseProtein', 25));
    expect(map, containsPair('servingMultiplier', 2));
    expect(map.containsKey('kcal'), isFalse);
    expect(map.containsKey('protein'), isFalse);
  });

  test('canonical consumption ratio ignores the legacy serving multiplier', () {
    final dynamic canonical = FoodEntry.fromData(
      id: 'canonical-half',
      data: {
        'uid': 'u1',
        'timestamp': DateTime.utc(2026, 9, 8),
        'date': '2026-09-08',
        'scanMode': 'barcode',
        'status': 'complete',
        'baseKcal': 85.0,
        'baseProtein': 0.0,
        'baseCarbs': 21.0,
        'baseFat': 0.0,
        'servingMultiplier': 9.0,
        'nutritionBasis': 'package',
        'nutritionAmount': 500.0,
        'nutritionUnit': 'ml',
        'consumedAmount': 250.0,
      },
    );

    expect(canonical.hasCanonicalNutrition, isTrue);
    expect(canonical.hasResolvedConsumption, isTrue);
    expect(canonical.scaledKcal, 42.5);
    expect(canonical.scaledCarbs, 10.5);
  });

  test(
      'pure legacy multipliers remain finite and nonnegative while malformed values fail closed',
      () {
    final zero = FoodEntry.fromData(
      id: 'legacy-zero',
      data: {
        'uid': 'u1',
        'timestamp': DateTime.utc(2026, 9, 8),
        'date': '2026-09-08',
        'scanMode': 'meal',
        'status': 'complete',
        'baseKcal': 100.0,
        'servingMultiplier': 0.0,
      },
    );
    final negative = FoodEntry.fromData(
      id: 'legacy-negative',
      data: {
        'uid': 'u1',
        'timestamp': DateTime.utc(2026, 9, 8),
        'date': '2026-09-08',
        'scanMode': 'meal',
        'status': 'complete',
        'baseKcal': 100.0,
        'servingMultiplier': -1.0,
      },
    );
    final nan = FoodEntry.fromData(
      id: 'legacy-nan',
      data: {
        'uid': 'u1',
        'timestamp': DateTime.utc(2026, 9, 8),
        'date': '2026-09-08',
        'scanMode': 'meal',
        'status': 'complete',
        'baseKcal': 100.0,
        'servingMultiplier': double.nan,
      },
    );

    expect((zero as dynamic).usesLegacyServingMultiplier, isTrue);
    expect((zero as dynamic).hasResolvedConsumption, isTrue);
    expect(zero.scaledKcal, 0.0);
    expect((negative as dynamic).usesLegacyServingMultiplier, isTrue);
    expect((negative as dynamic).hasResolvedConsumption, isFalse);
    expect(negative.scaledKcal, 0.0);
    expect((nan as dynamic).usesLegacyServingMultiplier, isTrue);
    expect((nan as dynamic).hasResolvedConsumption, isFalse);
    expect(nan.scaledKcal, 0.0);
  });

  test(
      'pure legacy multiplier omission defaults to one but explicit null and nonnumeric values fail closed',
      () {
    FoodEntry legacy(String id, Map<String, dynamic> multiplier) =>
        FoodEntry.fromData(
          id: id,
          data: {
            'uid': 'u1',
            'timestamp': DateTime.utc(2026, 9, 8),
            'date': '2026-09-08',
            'scanMode': 'meal',
            'status': 'complete',
            'baseKcal': 100.0,
            ...multiplier,
          },
        );

    final absent = legacy('legacy-absent', const {});
    final explicitNull =
        legacy('legacy-null', const {'servingMultiplier': null});
    final wrongType =
        legacy('legacy-string', const {'servingMultiplier': 'two'});

    expect(absent.usesLegacyServingMultiplier, isTrue);
    expect(absent.hasResolvedConsumption, isTrue);
    expect(absent.scaledKcal, 100.0);

    for (final entry in [explicitNull, wrongType]) {
      expect(entry.usesLegacyServingMultiplier, isTrue);
      expect(entry.hasResolvedConsumption, isFalse);
      expect(entry.scaledKcal, 0.0);

      final serialized = entry.toMap();
      expect(serialized.containsKey('servingMultiplier'), isTrue);
      expect(serialized['servingMultiplier'], isNull);

      final roundTrip = FoodEntry.fromData(
        id: '${entry.id}-round-trip',
        data: serialized,
      );
      expect(roundTrip.usesLegacyServingMultiplier, isTrue);
      expect(roundTrip.hasResolvedConsumption, isFalse);
      expect(roundTrip.scaledKcal, 0.0);
    }
  });

  test('Review candidates preserve fractional kcal estimates', () {
    final candidate = ReviewCandidate.fromMap({
      'name': 'Vitamin Well Reload',
      'confidence': 0.7,
      'kcal': 85.5,
    });

    expect(candidate.kcal, 85.5);
    expect(candidate.kcal, isA<double>());
  });
}
