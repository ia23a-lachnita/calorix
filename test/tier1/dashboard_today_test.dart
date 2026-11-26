import 'package:calorix/features/tier1/dashboard_today.dart';
import 'package:calorix/features/tier1/local_meal.dart';
import 'package:calorix/features/tier1/targets.dart';
import 'package:calorix/shared/widgets/macro_ring.dart';
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
    expect(find.text('Nothing logged yet'), findsOneWidget);
    expect(find.text('Scan your first meal'), findsOneWidget);
    await tester.tap(find.byTooltip('Previous day'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Previous day'));
    await tester.pumpAndSettle();
    expect(find.text('Nothing logged on this day.'), findsOneWidget);
    expect(find.text('Scan your first meal'), findsNothing);
  });

  testWidgets('Today macro values animate while semantics expose final totals',
      (tester) async {
    final meals = [
      Tier1Meal(
          id: 'prior',
          name: 'Prior meal',
          capturedAt: DateTime(2026, 7, 14),
          served: Tier1Nutrients(kcal: 300, proteinG: 30)),
      Tier1Meal(
          id: 'today',
          name: 'Today meal',
          capturedAt: DateTime(2026, 7, 15),
          served: Tier1Nutrients(kcal: 100, proteinG: 10)),
    ];
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: DashboardToday(
                meals: meals,
                now: DateTime(2026, 7, 15),
                targets: Tier1Targets.defaults,
                onOpenMeal: (_) {},
                onEditTargets: () {}))));
    final value = find.byKey(const Key('today-macro-value-Protein'));
    expect(value, findsOneWidget);
    final initial = tester
        .widget<Text>(find.descendant(of: value, matching: find.byType(Text)));
    expect(initial.data, startsWith('10 /'));
    final initialRing =
        tester.widget<MacroRing>(find.byKey(const Key('today-calorie-ring')));
    expect(initialRing.proteinFraction, closeTo(10 / 170, .001));
    final previous = tester.widget<IconButton>(find.byType(IconButton).first);
    previous.onPressed!();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 20));
    expect(
        tester
            .widget<AnimatedSwitcher>(find.descendant(
                of: value, matching: find.byType(AnimatedSwitcher)))
            .duration,
        const Duration(milliseconds: 220));
    expect(find.text('10 / 170 g'), findsOneWidget);
    expect(find.text('30 / 170 g'), findsOneWidget);
    expect(tester.getSemantics(value).label, startsWith('Protein: 30 of'));
    final ring =
        tester.widget<MacroRing>(find.byKey(const Key('today-calorie-ring')));
    expect(ring.proteinFraction, greaterThan(10 / 170));
    expect(ring.proteinFraction, lessThan(30 / 170));
    final progress = tester.widget<LinearProgressIndicator>(find.descendant(
        of: find.byKey(const Key('today-macro-progress-Protein')),
        matching: find.byType(LinearProgressIndicator)));
    expect(progress.value, greaterThan(10 / 170));
    expect(progress.value, lessThan(30 / 170));
    expect(
        tester.getSemantics(find.byKey(const Key('today-calorie-total'))).label,
        startsWith('300 kilocalories eaten of'));
    await tester.pumpAndSettle();
    final finalValue = tester
        .widget<Text>(find.descendant(of: value, matching: find.byType(Text)));
    expect(finalValue.data, startsWith('30 /'));
    final finalRing =
        tester.widget<MacroRing>(find.byKey(const Key('today-calorie-ring')));
    expect(finalRing.proteinFraction, closeTo(30 / 170, .001));
  });
}
