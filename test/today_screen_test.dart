import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/features/today/today_screen.dart';
import 'package:calorix/features/today/providers/today_providers.dart';
import 'package:calorix/core/theme/app_theme.dart';
import 'package:calorix/shared/models/food_entry.dart';
import 'package:calorix/shared/models/macro_target_plan.dart';

Widget _buildTodayScreen({
  List<FoodEntry> entries = const [],
  ({double kcal, double protein, double carbs, double fat}) summary = (
    kcal: 0.0,
    protein: 0.0,
    carbs: 0.0,
    fat: 0.0,
  ),
  ThemeMode themeMode = ThemeMode.light,
}) {
  return ProviderScope(
    overrides: [
      todayEntriesProvider.overrideWith((_) => Stream.value(entries)),
      todayMacroSummaryProvider.overrideWith((_) => summary),
      activePlanProvider.overrideWith(
        (_) => Stream<MacroTargetPlan?>.value(MacroTargetPlan.defaultPlan()),
      ),
    ],
    child: MaterialApp(
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: themeMode,
      home: const TodayScreen(),
    ),
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

  testWidgets('Today header places date above title like mockup', (tester) async {
    await tester.pumpWidget(_buildTodayScreen(themeMode: ThemeMode.dark));
    await _pumpTodayScreen(tester);

    final titleTop = tester.getTopLeft(find.text('Today').first).dy;
    final dateFinder = find.byWidgetPredicate(
      (widget) =>
          widget is Text &&
          widget.data != null &&
          widget.data!.contains('·') &&
          widget.data == widget.data!.toUpperCase(),
      description: 'uppercase date label',
    );

    expect(dateFinder, findsOneWidget);
    expect(tester.getTopLeft(dateFinder).dy, lessThan(titleTop));
  });

  testWidgets('kcal left pill fits inside macro ring center', (tester) async {
    await tester.binding.setSurfaceSize(const Size(393, 852));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      _buildTodayScreen(
        themeMode: ThemeMode.dark,
        summary: (kcal: 1420.0, protein: 96.0, carbs: 132.0, fat: 38.0),
      ),
    );
    await _pumpTodayScreen(tester);

    final pillBox = tester.renderObject<RenderBox>(
      find.byKey(const ValueKey('today.kcalLeftPillContainer')),
    );
    expect(pillBox.size.width, lessThanOrEqualTo(122));
  });
}
