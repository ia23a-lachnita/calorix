import 'dart:io';
import 'package:calorix/features/tier1/local_meal_store.dart';
import 'package:calorix/features/tier1/portion_input.dart';
import 'package:calorix/features/tier1/local_meal.dart';
import 'package:flutter_test/flutter_test.dart';
import 'support/portion_fixtures.dart';

void main() {
  test(
      'reopen an on-disk mixed legacy and typed history containing four eggs at one third',
      () async {
    final dir = await Directory.systemTemp.createTemp('ravlo-quantity-store-');
    addTearDown(() => dir.delete(recursive: true));
    final initial = Tier1MealStore(dir);
    final meal = portionMeal().correctFood(0, 'usda:173424', at: portionDate);
    final input = PortionInput(
        unit: 'pieces',
        amount: 4,
        numerator: 1,
        denominator: 3,
        referenceAmount: 1,
        referenceGrams: 50,
        referenceSource: 'usda:173424');
    await initial.save(
        meal.correctPortion(0, input.grams, at: portionDate, input: input));
    await initial.save(
        Tier1Meal(id: 'legacy', capturedAt: portionDate, name: 'Old meal'));
    final loaded = await Tier1MealStore(dir).load();
    final saved = loaded.first;
    expect(saved.portionInputs[0]!.toJson(), input.toJson());
    expect(saved.componentKcal(0), closeTo(155 * 2 / 3, 1e-8));
    expect(saved.componentMassG(1), 55);
    expect(saved.analysis, meal.analysis);
    expect(loaded.last.toJson()['schemaVersion'], 1);
  });
  test('volume uses stated grams per reference volume and retains the evidence',
      () {
    final input = PortionInput(
        unit: 'ml',
        amount: 125,
        numerator: 1,
        denominator: 1,
        referenceAmount: 250,
        referenceGrams: 260,
        referenceSource: 'user');
    final fixed = portionMeal()
        .correctPortion(0, input.grams, at: portionDate, input: input);
    expect(fixed.componentMassG(0), 130);
    expect(Tier1Meal.fromJson(fixed.toJson()).portionInputs[0]!.toJson(),
        input.toJson());
    expect(
        fixed.correctPortion(0, 140, at: portionDate).portionInputs, isEmpty);
    expect(fixed.withAnalysis(portionAnalysis()).portionInputs, isEmpty);
  });
  test('rejects zero denominators, missing scale and inconsistent stored units',
      () {
    expect(
        () => PortionInput(
            unit: 'ml',
            amount: 100,
            numerator: 1,
            denominator: 0,
            referenceAmount: 250,
            referenceGrams: 260,
            referenceSource: 'user'),
        throwsArgumentError);
    expect(
        () => PortionInput(
            unit: 'ml',
            amount: 100,
            numerator: 1,
            denominator: 1,
            referenceAmount: 250,
            referenceGrams: 0,
            referenceSource: 'user'),
        throwsArgumentError);
    final json = portionMeal().toJson()
      ..['schemaVersion'] = 3
      ..['portionInputs'] = {
        '0': {
          'unit': 'ml',
          'amount': 125.0,
          'numerator': 1,
          'denominator': 1,
          'referenceAmount': 250.0,
          'referenceGrams': 260.0,
          'referenceSource': 'user'
        }
      };
    expect(() => Tier1Meal.fromJson(json), throwsFormatException);
  });
}
