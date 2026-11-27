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

  testWidgets('History day details expand with reduced-motion-aware sizing',
      (tester) async {
    final meal = Tier1Meal(
        id: 'one',
        name: 'Local porridge',
        capturedAt: DateTime(2026, 7, 15, 10),
        served: Tier1Nutrients(kcal: 500));
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: DashboardHistory(
                meals: [meal],
                now: DateTime(2026, 7, 15),
                targets: Tier1Targets.defaults,
                onOpenMeal: (_) {}))));

    final detail = find.byKey(const Key('history-day-details-2026-07-15'));
    expect(detail, findsOneWidget);
    expect(tester.getSize(detail).height, 0);
    final row = find.byKey(const Key('history-day-row-2026-07-15'));
    await tester.ensureVisible(row);
    await tester.tap(row);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 80));
    final midHeight = tester.getSize(detail).height;
    expect(midHeight, greaterThan(0));
    expect(find.text('Local porridge'), findsOneWidget);
    await tester.pumpAndSettle();
    expect(tester.getSize(detail).height, greaterThan(midHeight));

    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: MediaQuery(
                data: const MediaQueryData(disableAnimations: true),
                child: DashboardHistory(
                    meals: [meal],
                    now: DateTime(2026, 7, 15),
                    targets: Tier1Targets.defaults,
                    onOpenMeal: (_) {})))));
    await tester.ensureVisible(row);
    await tester.tap(row);
    await tester.pump();
    expect(find.text('Local porridge'), findsOneWidget);
    expect(find.byType(AnimatedSize), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('History week and month calendar height transitions smoothly',
      (tester) async {
    final meal = Tier1Meal(
        id: 'one', name: 'Local meal', capturedAt: DateTime(2026, 7, 15));
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: DashboardHistory(
                meals: [meal],
                now: DateTime(2026, 7, 15),
                targets: Tier1Targets.defaults,
                onOpenMeal: (_) {}))));
    final calendar = find.byKey(const Key('history-calendar-grid'));
    expect(calendar, findsOneWidget);
    final weekHeight = tester.getSize(calendar).height;
    await tester.tap(find.text('M').first);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 80));
    final midHeight = tester.getSize(calendar).height;
    await tester.pumpAndSettle();
    final monthHeight = tester.getSize(calendar).height;
    expect(monthHeight, greaterThan(weekHeight));
    expect(midHeight, greaterThan(weekHeight));
    expect(midHeight, lessThan(monthHeight));
  });

  testWidgets('History period label switches without stale semantics',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: DashboardHistory(
                meals: const [],
                now: DateTime(2026, 7, 15),
                targets: Tier1Targets.defaults,
                onOpenMeal: (_) {}))));
    final title = find.byKey(const Key('history-period-title'));
    expect(tester.getSemantics(title).label, 'THIS WEEK');
    final previous = tester.widget<IconButton>(find.byType(IconButton).first);
    previous.onPressed!();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 20));
    expect(find.text('THIS WEEK'), findsOneWidget);
    expect(find.text('JUL 6 – JUL 12, 2026'), findsOneWidget);
    expect(tester.getSemantics(title).label, 'JUL 6 – JUL 12, 2026');
    await tester.pumpAndSettle();
    expect(find.text('THIS WEEK'), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
      'History period chart and macros transition with current semantics',
      (tester) async {
    final semantics = tester.ensureSemantics();
    final meals = [
      Tier1Meal(
          id: 'week',
          name: 'Week',
          capturedAt: DateTime(2026, 7, 15),
          served: Tier1Nutrients(kcal: 100, proteinG: 0)),
      Tier1Meal(
          id: 'month',
          name: 'Month',
          capturedAt: DateTime(2026, 7, 1),
          served: Tier1Nutrients(kcal: 300, proteinG: 20)),
    ];
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: DashboardHistory(
      meals: meals,
      now: DateTime(2026, 7, 15),
      targets: Tier1Targets.defaults,
      onOpenMeal: (_) {},
    ))));
    await tester.tap(find.text('M').first);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 60));
    final chart = find.byKey(const Key('history-trend-transition'));
    expect(find.descendant(of: chart, matching: find.byType(CustomPaint)),
        findsNWidgets(2));
    final protein = find.byKey(const Key('history-macro-value-Protein'));
    expect(find.descendant(of: protein, matching: find.text('0 g/day')),
        findsOneWidget);
    expect(find.descendant(of: protein, matching: find.text('10 g/day')),
        findsOneWidget);
    expect(tester.getSemantics(protein).label, 'Protein: 10 g/day');
    await tester.pumpAndSettle();
    expect(find.descendant(of: chart, matching: find.byType(CustomPaint)),
        findsOneWidget);
    expect(find.descendant(of: protein, matching: find.text('0 g/day')),
        findsNothing);
    expect(tester.takeException(), isNull);
    semantics.dispose();
  });

  testWidgets(
      'History chart and missing macros switch immediately with reduced motion',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: MediaQuery(
      data: const MediaQueryData(disableAnimations: true),
      child: DashboardHistory(
          meals: const [],
          now: DateTime(2026, 7, 15),
          targets: Tier1Targets.defaults,
          onOpenMeal: (_) {}),
    ))));
    await tester.tap(find.text('M').first);
    await tester.pump();
    await tester.pump();
    final chart = find.byKey(const Key('history-trend-transition'));
    expect(find.descendant(of: chart, matching: find.byType(CustomPaint)),
        findsOneWidget);
    final protein = find.byKey(const Key('history-macro-value-Protein'));
    expect(find.descendant(of: protein, matching: find.text('— g/day')),
        findsOneWidget);
    expect(tester.getSemantics(protein).label, 'Protein: — g/day');
    expect(tester.takeException(), isNull);
  });
  testWidgets('History average progress animates to the new period target',
      (tester) async {
    final meals = [
      Tier1Meal(
          id: 'week',
          name: 'Week',
          capturedAt: DateTime(2026, 7, 15),
          served: Tier1Nutrients(kcal: 100)),
      Tier1Meal(
          id: 'month',
          name: 'Month',
          capturedAt: DateTime(2026, 7, 1),
          served: Tier1Nutrients(kcal: 300)),
    ];
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: DashboardHistory(
                meals: meals,
                now: DateTime(2026, 7, 15),
                targets: Tier1Targets.defaults,
                onOpenMeal: (_) {}))));
    final progress = find.byKey(const Key('history-average-progress'));
    double value() => tester
        .widget<LinearProgressIndicator>(find.descendant(
            of: progress, matching: find.byType(LinearProgressIndicator)))
        .value!;
    final before = value();
    await tester.tap(find.text('M').first);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 60));
    final middle = value();
    await tester.pumpAndSettle();
    final after = value();
    expect(middle, greaterThan(before));
    expect(middle, lessThan(after));
  });
}
