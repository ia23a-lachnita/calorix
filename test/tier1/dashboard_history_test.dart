import 'package:calorix/features/tier1/dashboard_history.dart';
import 'package:calorix/features/tier1/local_meal.dart';
import 'package:calorix/features/tier1/targets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('History switches periods and opens a local day and meal',
      (tester) async {
    final meals = [
      Tier1Meal(
          id: 'one',
          name: 'Local porridge',
          capturedAt: DateTime(2026, 7, 15, 10),
          served: Tier1Nutrients(kcal: 500, proteinG: 30),
          consumedFraction: .5),
      Tier1Meal(
          id: 'two',
          name: 'Saved photo',
          capturedAt: DateTime(2026, 7, 15, 12)),
    ];
    Tier1Meal? opened;
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: DashboardHistory(
                meals: meals,
                now: DateTime(2026, 7, 15),
                targets: Tier1Targets.defaults,
                onOpenMeal: (m) => opened = m))));
    expect(find.text('THIS WEEK'), findsOneWidget);
    expect(find.text('250 kcal'), findsWidgets);
    expect(find.text('—'), findsOneWidget);
    await tester.tap(find.text('M').first);
    await tester.pumpAndSettle();
    expect(find.text('JULY 2026'), findsOneWidget);
    final day = find.byKey(const Key('history-day-row-2026-07-15'));
    await tester.ensureVisible(day);
    await tester.tap(day);
    await tester.pumpAndSettle();
    expect(find.text('Local porridge'), findsOneWidget);
    expect(find.text('Saved photo'), findsOneWidget);
    await tester.tap(find.text('Local porridge'));
    expect(opened?.id, 'one');
  });
  testWidgets('History keeps older local meals directly accessible',
      (tester) async {
    final meal = Tier1Meal(
        id: 'old',
        name: 'Older meal',
        capturedAt: DateTime(2026, 1, 5),
        served: Tier1Nutrients(kcal: 600, proteinG: 20),
        consumedFraction: .5);
    Tier1Meal? opened;
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: DashboardHistory(
                meals: [meal],
                now: DateTime(2026, 7, 15),
                targets: Tier1Targets.defaults,
                onOpenMeal: (m) => opened = m))));
    expect(find.text('Older meal'), findsOneWidget);
    await tester.ensureVisible(find.text('Older meal'));
    await tester.tap(find.text('Older meal'));
    expect(opened?.id, 'old');
  });
  testWidgets('Past week is labeled and empty day keeps recent meals visible',
      (tester) async {
    final meal = Tier1Meal(
        id: 'old', name: 'Old meal', capturedAt: DateTime(2026, 1, 5));
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: DashboardHistory(
                meals: [meal],
                now: DateTime(2026, 7, 15),
                targets: Tier1Targets.defaults,
                onOpenMeal: (_) {}))));
    await tester.tap(find.byTooltip('Previous period'));
    await tester.pumpAndSettle();
    expect(find.text('THIS WEEK'), findsNothing);
    expect(find.text('Old meal'), findsOneWidget);
    await tester.tap(find.text('6').first);
    await tester.pumpAndSettle();
    expect(find.text('Old meal'), findsOneWidget);
  });
}
