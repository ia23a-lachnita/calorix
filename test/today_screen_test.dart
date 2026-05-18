import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/features/today/today_screen.dart';
import 'package:calorix/features/today/providers/today_providers.dart';
import 'package:calorix/shared/models/food_entry.dart';
import 'package:calorix/shared/models/macro_target_plan.dart';

Widget _buildTodayScreen({List<FoodEntry> entries = const []}) {
  return ProviderScope(
    overrides: [
      todayEntriesProvider.overrideWith((_) => Stream.value(entries)),
      todayMacroSummaryProvider.overrideWith(
        (_) => (kcal: 0.0, protein: 0.0, carbs: 0.0, fat: 0.0),
      ),
      activePlanProvider.overrideWith(
        (_) => Stream<MacroTargetPlan?>.value(MacroTargetPlan.defaultPlan()),
      ),
    ],
    child: const MaterialApp(home: TodayScreen()),
  );
}

// Pump frames for Riverpod StreamProvider to emit, then let finite animations settle.
Future<void> _pumpTodayScreen(WidgetTester tester) async {
  await tester.pump(); // initial build
  await tester.pump(const Duration(milliseconds: 50)); // Riverpod stream emit
  await tester.pumpAndSettle(const Duration(seconds: 4)); // settle count-up (1.4s)
}

void main() {
  testWidgets('Today screen has no rendering exception', (tester) async {
    await tester.pumpWidget(_buildTodayScreen());
    await _pumpTodayScreen(tester);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Today screen shows macro ring center label', (tester) async {
    await tester.pumpWidget(_buildTodayScreen());
    await _pumpTodayScreen(tester);
    expect(find.text('KCAL EATEN'), findsOneWidget);
  });

  testWidgets('Today screen shows Recent scans header', (tester) async {
    await tester.pumpWidget(_buildTodayScreen());
    await _pumpTodayScreen(tester);
    expect(find.text('Recent scans'), findsOneWidget);
  });

  testWidgets('Today screen shows empty state when no meals', (tester) async {
    await tester.pumpWidget(_buildTodayScreen(entries: []));
    await _pumpTodayScreen(tester);
    // skipOffstage: false also finds widgets scrolled below the fold
    expect(find.text('No meals logged yet', skipOffstage: false), findsOneWidget);
  });

  testWidgets('Today screen does NOT show error text on success', (tester) async {
    await tester.pumpWidget(_buildTodayScreen());
    await _pumpTodayScreen(tester);
    expect(find.text('Error loading meals'), findsNothing);
  });

  testWidgets('Today screen shows Protein, Carbs, Fat labels', (tester) async {
    await tester.pumpWidget(_buildTodayScreen());
    await _pumpTodayScreen(tester);
    expect(find.text('Protein'), findsOneWidget);
    expect(find.text('Carbs'), findsOneWidget);
    expect(find.text('Fat'), findsOneWidget);
  });
}
