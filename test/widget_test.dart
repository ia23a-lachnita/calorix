// Domain smoke tests. These avoid Firebase/platform initialization so they
// run in plain `flutter test` without emulators.

import 'package:flutter_test/flutter_test.dart';

import 'package:calorix/shared/models/macro_target_plan.dart';

void main() {
  group('MacroTargetPlan', () {
    test('defaultPlan is an active loseFat cut plan', () {
      final plan = MacroTargetPlan.defaultPlan();
      expect(plan.isActive, isTrue);
      expect(plan.goal, BodyGoal.loseFat);
      expect(plan.kcal, 2400);
      expect(plan.protein, 170);
    });

    test('copyWith overrides only the provided fields', () {
      final plan = MacroTargetPlan.defaultPlan().copyWith(protein: 190);
      expect(plan.protein, 190);
      expect(plan.kcal, 2400); // unchanged
      expect(plan.carbs, 250); // unchanged
    });
  });
}
