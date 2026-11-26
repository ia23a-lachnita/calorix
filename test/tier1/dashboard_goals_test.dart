import 'package:calorix/features/tier1/dashboard_goals.dart';
import 'package:calorix/features/tier1/local_meal.dart';
import 'package:calorix/features/tier1/targets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('Goals shows saved targets and opens the existing editor',
      (tester) async {
    var edits = 0;
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: DashboardGoals(
                targets: Tier1Targets.defaults,
                now: DateTime(2026, 7, 15),
                onEdit: () => edits++))));
    expect(find.text('Goals'), findsOneWidget);
    expect(find.text('${Tier1Targets.defaults.kcal}'), findsOneWidget);
    await tester.tap(find.text('Adjust'));
    expect(edits, 1);
    await tester.tap(find.text('Daily targets'));
    await tester.pumpAndSettle();
    expect(find.text('Daily targets'), findsNWidgets(2));
    await tester.tap(find.text('Daily targets').last);
    await tester.pumpAndSettle();
  });

  testWidgets('Goals period summary resizes without duplicate period content',
      (tester) async {
    final meal = Tier1Meal(
        id: 'meal',
        name: 'Lunch',
        capturedAt: DateTime(2026, 6, 15),
        served: Tier1Nutrients(kcal: 400));
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: DashboardGoals(
                targets: Tier1Targets.defaults,
                meals: [meal],
                now: DateTime(2026, 7, 15),
                onEdit: () {}))));
    expect(find.textContaining('Today:'), findsOneWidget);
    final summary = find.byKey(const Key('tier1-goals-period-summary'));
    expect(summary, findsOneWidget);
    final dailyHeight = tester.getSize(summary).height;
    await tester.tap(find.text('Daily targets'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('June 2026').last);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 80));
    final midHeight = tester.getSize(summary).height;
    expect(find.text('LOGGED IN THIS PERIOD'), findsOneWidget);
    await tester.pumpAndSettle();
    final monthHeight = tester.getSize(summary).height;
    expect(monthHeight, greaterThan(dailyHeight));
    expect(midHeight, greaterThan(dailyHeight));
    expect(midHeight, lessThan(monthHeight));
  });

  testWidgets('Goals target values switch with one final semantics value',
      (tester) async {
    Widget page(Tier1Targets targets) => MaterialApp(
        home: Scaffold(
            body: DashboardGoals(
                targets: targets, now: DateTime(2026, 7, 15), onEdit: () {})));
    await tester.pumpWidget(page(Tier1Targets.defaults));
    final kcal = find.byKey(const Key('tier1-goals-kcal-target'));
    expect(tester.getSemantics(kcal).label,
        '${Tier1Targets.defaults.kcal} kilocalorie daily target');
    final changed = Tier1Targets(
        kcal: Tier1Targets.defaults.kcal + 100,
        proteinG: Tier1Targets.defaults.proteinG + 10,
        carbsG: Tier1Targets.defaults.carbsG,
        fatG: Tier1Targets.defaults.fatG);
    await tester.pumpWidget(page(changed));
    await tester.pump(const Duration(milliseconds: 60));
    expect(
        tester.widgetList<Text>(
            find.descendant(of: kcal, matching: find.byType(Text))),
        hasLength(2));
    expect(tester.getSemantics(kcal).label,
        '${changed.kcal} kilocalorie daily target');
    await tester.pumpAndSettle();
    expect(
        tester.widgetList<Text>(
            find.descendant(of: kcal, matching: find.byType(Text))),
        hasLength(1));
  });
}
