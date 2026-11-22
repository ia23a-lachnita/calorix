import 'package:calorix/features/tier1/local_meal.dart';
import 'package:flutter_test/flutter_test.dart';
import 'support/portion_fixtures.dart';

void main() {
  test('round-trips four items with a third share without scaling the sides',
      () {
    final meal = portionMeal();
    final updated = meal.correctPortion(0, 4 * 50 / 3, at: portionDate);
    final json = updated.toJson()
      ..['schemaVersion'] = 3
      ..['portionInputs'] = {
        '0': {
          'unit': 'pieces',
          'amount': 4.0,
          'numerator': 1,
          'denominator': 3,
          'referenceAmount': 1.0,
          'referenceGrams': 50.0,
          'referenceSource': 'user'
        }
      };
    final stored = Tier1Meal.fromJson(json);
    expect(stored.componentMassG(0), closeTo(200 / 3, 1e-10));
    expect(stored.componentMassG(1), meal.componentMassG(1));
    expect(stored.toJson()['portionInputs'], json['portionInputs']);
    expect(stored.analysis, meal.analysis);
  });
}
