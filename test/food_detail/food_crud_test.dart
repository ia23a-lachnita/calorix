import 'package:calorix/shared/repositories/food_entry_repository.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('correction fields use deterministic timestamps and mark corrected', () {
    final now = DateTime.utc(2026, 7, 22, 12, 30);
    final fields = correctionUpdateFields(
      {'baseProtein': 25.0, 'servingMultiplier': 2.0},
      now,
    );

    expect(fields['baseProtein'], 25);
    expect(fields['servingMultiplier'], 2);
    expect(fields['corrected'], isTrue);
    expect(
      (fields['correctedAt'] as Timestamp).toDate().isAtSameMomentAs(now),
      isTrue,
    );
    expect(
      (fields['updatedAt'] as Timestamp).toDate().isAtSameMomentAs(now),
      isTrue,
    );
  });

  test('multiplier-only correction does not invent base nutrition fields', () {
    final fields = correctionUpdateFields(
      {'servingMultiplier': 1.5},
      DateTime.utc(2026, 7, 22),
    );

    expect(fields['servingMultiplier'], 1.5);
    expect(fields.keys.where((key) => key.startsWith('base')), isEmpty);
  });
}
