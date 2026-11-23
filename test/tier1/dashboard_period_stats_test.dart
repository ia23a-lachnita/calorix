import 'package:calorix/features/tier1/dashboard_goals.dart';
import 'package:calorix/features/tier1/dashboard_history.dart';
import 'package:calorix/features/tier1/local_meal.dart';
import 'package:calorix/features/tier1/targets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('History reports available macro averages and a trend with gaps',
      (tester) async {
    final meals = [
      Tier1Meal(
          id: 'a',
          name: 'Meal',
          capturedAt: DateTime(2026, 7, 15),
          served: Tier1Nutrients(kcal: 500, proteinG: 30, carbsG: 40),
          consumedFraction: .5)
    ];
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: DashboardHistory(
                meals: meals,
                now: DateTime(2026, 7, 15),
                targets: Tier1Targets.defaults,
                onOpenMeal: (_) {}))));
    expect(
        find.bySemanticsLabel(
            'Calorie trend; gaps indicate days without complete calorie data'),
        findsOneWidget);
    expect(find.text('15 g/day'), findsOneWidget);
    expect(find.text('20 g/day'), findsOneWidget);
    expect(find.text('— g/day'), findsOneWidget);
  });
  testWidgets(
      'Goals shows target macro composition and opens calorie adjustment',
      (tester) async {
    var edits = 0;
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: DashboardGoals(
                targets: Tier1Targets.defaults, onEdit: () => edits++))));
    await tester.scrollUntilVisible(find.text('MACRO TARGETS'), 150);
    expect(
        find.byWidgetPredicate((widget) =>
            widget is Semantics &&
            widget.properties.label == 'Target macro calorie composition'),
        findsOneWidget);
    await tester.ensureVisible(find.text('Adjust calories'));
    await tester.tap(find.text('Adjust calories'));
    expect(edits, 1);
  });
}
