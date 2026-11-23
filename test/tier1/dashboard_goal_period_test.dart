import 'package:calorix/features/tier1/dashboard_goals.dart';
import 'package:calorix/features/tier1/local_meal.dart';
import 'package:calorix/features/tier1/targets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('selects a real logged week and reports its actual intake',
      (tester) async {
    final meals = [
      Tier1Meal(
          id: 'a',
          name: 'Lunch',
          capturedAt: DateTime(2026, 7, 15),
          served: Tier1Nutrients(kcal: 500),
          consumedFraction: .5)
    ];
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: DashboardGoals(
                targets: Tier1Targets.defaults,
                onEdit: () {},
                meals: meals,
                now: DateTime(2026, 7, 15)))));
    await tester.tap(find.text('Daily targets'));
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('Jul 13 – Jul 19').last);
    await tester.pumpAndSettle();
    expect(find.textContaining('250 kcal'), findsOneWidget);
    expect(find.textContaining('Current daily target'), findsOneWidget);
  });
  testWidgets('long selected period fits on a narrow screen', (tester) async {
    tester.view.physicalSize = const Size(320, 700);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final meals = [
      Tier1Meal(
          id: 'a',
          name: 'Lunch',
          capturedAt: DateTime(2026, 9, 30),
          served: Tier1Nutrients(kcal: 500))
    ];
    await tester.pumpWidget(MaterialApp(
        home: MediaQuery(
            data: const MediaQueryData(
                size: Size(320, 700), textScaler: TextScaler.linear(1.3)),
            child: Scaffold(
                body: DashboardGoals(
                    targets: Tier1Targets.defaults,
                    onEdit: () {},
                    meals: meals)))));
    await tester.tap(find.text('Daily targets'));
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('Sep 28 – Oct 4').last);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}
