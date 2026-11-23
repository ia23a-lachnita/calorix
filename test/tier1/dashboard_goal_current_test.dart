import 'package:calorix/features/tier1/dashboard_goals.dart';
import 'package:calorix/features/tier1/targets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets(
      'Empty current week and month are selectable and daily view labels intake and target',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: DashboardGoals(
                targets: Tier1Targets.defaults,
                onEdit: () {},
                now: DateTime(2026, 7, 15)))));
    expect(find.textContaining('Today: 0 kcal'), findsOneWidget);
    expect(find.textContaining('Current daily target:'), findsOneWidget);
    await tester.tap(find.text('Daily targets'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Jul 13 – Jul 19'), findsOneWidget);
    expect(find.text('July 2026'), findsOneWidget);
    await tester.tap(find.text('July 2026'));
    await tester.pumpAndSettle();
    expect(
        find.text('0 meals · Current daily target: 2400 kcal'), findsOneWidget);
  });
}
