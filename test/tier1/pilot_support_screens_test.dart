import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/features/tier1/local_meal.dart';
import 'package:calorix/features/tier1/pilot_support_screens.dart';

void main() {
  testWidgets('AI actions open local history and scan', (tester) async {
    var scans = 0;
    await tester.pumpWidget(MaterialApp(
        home: PilotAiScreen(
            meals: const [], onScan: () => scans++, onOpenMeal: (_) {})));
    expect(find.text('Natural-language corrections are coming later.'),
        findsOneWidget);
    await tester.ensureVisible(find.text('Scan a meal'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Scan a meal'));
    expect(scans, 1);
    await tester.ensureVisible(find.byTooltip('Correction history'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Correction history'));
    await tester.pumpAndSettle();
    expect(find.text('No corrections yet'), findsOneWidget);
  });

  testWidgets('correction history opens the actual saved meal', (tester) async {
    final meal = Tier1Meal(
        id: 'meal1',
        capturedAt: DateTime(2026),
        name: 'Lunch',
        adjustmentHistory: const [
          {'kind': 'portion', 'at': '2026-01-01T12:00:00Z'}
        ]);
    Tier1Meal? opened;
    await tester.pumpWidget(MaterialApp(
        home: PilotAiScreen(
            meals: [meal], onScan: () {}, onOpenMeal: (m) => opened = m)));
    await tester.tap(find.byTooltip('Correction history'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Lunch'));
    expect(opened, same(meal));
  });

  testWidgets('profile clearly describes local pilot and changes theme',
      (tester) async {
    ThemeMode? selected;
    await tester.pumpWidget(MaterialApp(
        home: PilotProfileScreen(
            themeMode: ThemeMode.system, onThemeChanged: (m) => selected = m)));
    expect(find.textContaining('stored on this device'), findsOneWidget);
    expect(find.textContaining('sync'), findsOneWidget);
    await tester.tap(find.text('Dark'));
    expect(selected, ThemeMode.dark);
  });
  testWidgets('permission explanation continues without requesting permission',
      (tester) async {
    var continued = false;
    await tester.pumpWidget(MaterialApp(
        home: PilotPermissionExplanation(onContinue: () => continued = true)));
    expect(find.textContaining('enter a meal manually'), findsOneWidget);
    await tester.tap(find.text('Continue'));
    expect(continued, isTrue);
  });

  testWidgets(
      'loading shows local preparation and profile offers no fake sign in',
      (tester) async {
    await tester.pumpWidget(const MaterialApp(home: PilotLoadingScreen()));
    expect(find.text('GETTING READY'), findsOneWidget);
    await tester.pumpWidget(MaterialApp(
        home: PilotProfileScreen(
            themeMode: ThemeMode.system, onThemeChanged: (_) {})));
    expect(find.textContaining('Sign-in and meal sync are not available'),
        findsOneWidget);
    expect(find.text('Sign in'), findsNothing);
  });
}
