import 'package:calorix/features/tier1/dashboard_goals.dart';
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
                targets: Tier1Targets.defaults, onEdit: () => edits++))));
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
}
