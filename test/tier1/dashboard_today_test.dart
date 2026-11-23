import 'package:calorix/features/tier1/dashboard_today.dart';
import 'package:calorix/features/tier1/local_meal.dart';
import 'package:calorix/features/tier1/targets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('Today moves between dates and opens local meals',
      (tester) async {
    final meals = [
      Tier1Meal(
          id: 'a',
          name: 'Porridge',
          capturedAt: DateTime(2026, 7, 14),
          served: Tier1Nutrients(kcal: 500),
          consumedFraction: .5),
      Tier1Meal(id: 'b', name: 'Photo', capturedAt: DateTime(2026, 7, 15))
    ];
    Tier1Meal? opened;
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: DashboardToday(
                meals: meals,
                now: DateTime(2026, 7, 15),
                targets: Tier1Targets.defaults,
                onOpenMeal: (m) => opened = m,
                onEditTargets: () {}))));
    expect(find.text('Photo'), findsOneWidget);
    await tester.tap(find.byTooltip('Previous day'));
    await tester.pumpAndSettle();
    expect(find.text('250'), findsOneWidget);
    await tester.ensureVisible(find.text('Porridge'));
    await tester.tap(find.text('Porridge'));
    expect(opened?.id, 'a');
  });
  testWidgets('Today indicates unknown nutrition and tracks a new current day',
      (tester) async {
    final meals = [
      Tier1Meal(id: 'a', name: 'Photo', capturedAt: DateTime(2026, 7, 15))
    ];
    Widget page(DateTime now) => MaterialApp(
        home: Scaffold(
            body: DashboardToday(
                meals: meals,
                now: now,
                targets: Tier1Targets.defaults,
                onOpenMeal: (_) {},
                onEditTargets: () {})));
    await tester.pumpWidget(page(DateTime(2026, 7, 15)));
    expect(find.textContaining('Some nutrition values are unavailable'),
        findsOneWidget);
    await tester.pumpWidget(page(DateTime(2026, 7, 16)));
    expect(find.text('Photo'), findsNothing);
    expect(find.text('Nothing logged on this day.'), findsOneWidget);
  });
}
