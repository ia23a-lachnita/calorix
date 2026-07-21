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
        'kcal': 145,
        'protein': 17.5,
        'carbs': 9.2,
        'fat': 4.1,
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
    expect(entry.protein, 17.5);
    expect(entry.carbs, 9.2);
    expect(entry.fat, 4.1);
    expect(entry.candidates, hasLength(1));
    expect(entry.candidates.single.proteinG, 17.5);

    final roundTrip = entry.toMap();
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
}
