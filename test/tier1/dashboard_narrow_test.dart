import 'package:calorix/features/tier1/dashboard_history.dart';
import 'package:calorix/features/tier1/dashboard_today.dart';
import 'package:calorix/features/tier1/local_meal.dart';
import 'package:calorix/features/tier1/targets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('Today and history fit narrow layouts with larger text',
      (tester) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final meals = [
      Tier1Meal(
          id: 'a',
          name: 'Lunch',
          capturedAt: DateTime(2026, 9, 30),
          served: Tier1Nutrients(kcal: 500, proteinG: 40, carbsG: 70, fatG: 20))
    ];
    Widget page(Widget body) => MaterialApp(
        home: MediaQuery(
            data: const MediaQueryData(
                size: Size(360, 800), textScaler: TextScaler.linear(2)),
            child: Scaffold(body: body)));
    await tester.pumpWidget(page(DashboardToday(
        meals: const [],
        now: DateTime(2026, 9, 30),
        targets: Tier1Targets.defaults,
        onOpenMeal: (_) {},
        onEditTargets: () {})));
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(page(DashboardHistory(
        meals: meals,
        now: DateTime(2026, 9, 30),
        targets: Tier1Targets.defaults,
        onOpenMeal: (_) {})));
    await tester.tap(find.byTooltip('Previous period'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}
