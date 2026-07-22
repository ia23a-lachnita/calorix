import 'package:calorix/shared/models/food_entry.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('backend analysis result deserializes without wire-field loss', () {
    final entry = FoodEntry.fromData(
      id: 'entry-1',
      data: {
        'uid': 'user-1',
        'timestamp': DateTime.utc(2026, 7, 22),
        'date': '2026-07-22',
        'scanMode': 'label',
        'status': 'needs_review',
        'foodName': 'Greek yogurt',
        'baseKcal': 145,
        'baseProtein': 17.5,
        'baseCarbs': 9.2,
        'baseFat': 4.1,
        'confidence': 0.72,
        'atwaterKcal': 144,
        'candidates': [
          {
            'name': 'Greek yogurt',
            'confidence': 0.72,
            'kcal': 145,
            'proteinG': 17.5,
            'carbsG': 9.2,
            'fatG': 4.1,
          },
        ],
      },
    );

    expect(entry.foodName, 'Greek yogurt');
    expect(entry.status, FoodEntryStatus.needsReview);
    expect(entry.scanMode, 'label');
    expect(entry.atwaterKcal, 144);
    expect(entry.baseKcal, 145);
    expect(entry.baseProtein, 17.5);
    expect(entry.baseCarbs, 9.2);
    expect(entry.baseFat, 4.1);
    expect(entry.candidates, hasLength(1));
    expect(entry.candidates.single.proteinG, 17.5);

    final roundTrip = entry.toMap();
    expect(roundTrip['baseKcal'], 145);
    expect(roundTrip['baseProtein'], 17.5);
    expect(roundTrip['baseCarbs'], 9.2);
    expect(roundTrip['baseFat'], 4.1);
    expect(roundTrip.containsKey('kcal'), isFalse);
    expect(roundTrip.containsKey('protein'), isFalse);
    expect(roundTrip.containsKey('carbs'), isFalse);
    expect(roundTrip.containsKey('fat'), isFalse);
    expect(roundTrip['atwaterKcal'], 144);
    expect(roundTrip['candidates'], [
      {
        'name': 'Greek yogurt',
        'confidence': 0.72,
        'kcal': 145,
        'proteinG': 17.5,
        'carbsG': 9.2,
        'fatG': 4.1,
      },
    ]);
  });

  test('legacy nutrition is read as base data but rewritten canonically', () {
    final entry = FoodEntry.fromData(
      id: 'legacy',
      data: {
        'uid': 'user-1',
        'timestamp': DateTime.utc(2026, 7, 22),
        'date': '2026-07-22',
        'scanMode': 'meal',
        'status': 'complete',
        'kcal': 100,
        'protein': 10,
        'carbs': 20,
        'fat': 5,
        'servingMultiplier': 2,
      },
    );

    expect(entry.baseKcal, 100);
    expect(entry.scaledKcal, 200);
    expect(entry.toMap(), containsPair('baseKcal', 100));
    expect(entry.toMap().containsKey('kcal'), isFalse);
  });
}
