import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/features/today/today_screen.dart';
import 'package:calorix/features/today/providers/today_providers.dart';
import 'package:calorix/core/theme/app_colors.dart';
import 'package:calorix/core/theme/app_theme.dart';
import 'package:calorix/shared/models/food_entry.dart';
import 'package:calorix/shared/models/macro_target_plan.dart';
import 'package:calorix/shared/providers/ui_diff_provider.dart';

Widget _buildTodayScreen({
  List<FoodEntry> entries = const [],
  ({double kcal, double protein, double carbs, double fat}) summary = (
    kcal: 0.0,
    protein: 0.0,
    carbs: 0.0,
    fat: 0.0,
  ),
  ThemeMode themeMode = ThemeMode.light,
  bool uiDiffMode = false,
}) {
  return ProviderScope(
    overrides: [
      uiDiffModeProvider.overrideWith((_) => uiDiffMode),
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

FoodEntry _foodEntry({
  required String id,
  required String name,
  required DateTime timestamp,
  required double kcal,
  required double protein,
  required double carbs,
  required double fat,
  required double confidence,
  MealType mealType = MealType.lunch,
}) =>
    FoodEntry(
      id: id,
      uid: 'test-user',
      timestamp: timestamp,
      scanMode: 'meal',
      status: FoodEntryStatus.complete,
      foodName: name,
      kcal: kcal,
      protein: protein,
      carbs: carbs,
      fat: fat,
      confidence: confidence,
      mealType: mealType,
    );

// Pump frames for Riverpod StreamProvider to emit, then let finite animations settle.
Future<void> _pumpTodayScreen(WidgetTester tester) async {
  await tester.pump(); // initial build
  await tester.pump(const Duration(milliseconds: 50)); // Riverpod stream emit
  await tester
      .pumpAndSettle(const Duration(seconds: 4)); // settle count-up (1.4s)
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
    expect(
        find.text('No meals logged yet', skipOffstage: false), findsOneWidget);
  });

  testWidgets('Today screen does NOT show error text on success',
      (tester) async {
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

  testWidgets('Today header places date above title like mockup',
      (tester) async {
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

  testWidgets('Today UI-diff mode uses fixed mockup date', (tester) async {
    await tester.pumpWidget(
      _buildTodayScreen(themeMode: ThemeMode.dark, uiDiffMode: true),
    );
    await _pumpTodayScreen(tester);

    expect(find.text('FRIDAY · MAY 15'), findsOneWidget);
  });

  testWidgets('Today typography uses mockup font roles', (tester) async {
    await tester.pumpWidget(
      _buildTodayScreen(
        themeMode: ThemeMode.dark,
        summary: (kcal: 1420.0, protein: 96.0, carbs: 132.0, fat: 38.0),
      ),
    );
    await _pumpTodayScreen(tester);

    final title = tester.widget<Text>(find.text('Today').first);
    expect(title.style?.fontFamily, 'Geist');
    expect(title.style?.fontSize, 30);
    expect(title.style?.fontWeight, FontWeight.w600);
    expect(title.style?.letterSpacing, lessThan(0));

    final dateFinder = find.byWidgetPredicate(
      (widget) =>
          widget is Text &&
          widget.data != null &&
          widget.data!.contains('·') &&
          widget.data == widget.data!.toUpperCase(),
      description: 'uppercase date label',
    );
    final date = tester.widget<Text>(dateFinder);
    expect(date.style?.fontFamily, 'GeistMono');

    final kcal = tester.widget<Text>(find.text('1,420'));
    expect(kcal.style?.fontFamily, 'GeistMono');
    expect(kcal.style?.fontWeight, FontWeight.w600);

    final macroValue = tester.widget<Text>(find.text('96').first);
    expect(macroValue.style?.fontFamily, 'GeistMono');
  });

  testWidgets('Today meal card typography and spacing match mockup roles',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(393, 852));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      _buildTodayScreen(
        themeMode: ThemeMode.dark,
        entries: [
          _foodEntry(
            id: 'chicken',
            name: 'Chicken Rice Bowl',
            timestamp: DateTime(2026, 7, 1, 12, 48),
            kcal: 620,
            protein: 48,
            carbs: 72,
            fat: 16,
            confidence: 0.91,
          ),
        ],
        summary: (kcal: 1420.0, protein: 96.0, carbs: 132.0, fat: 38.0),
      ),
    );
    await _pumpTodayScreen(tester);

    final sectionHeading = tester.widget<Text>(find.text('Recent scans'));
    expect(sectionHeading.style?.fontFamily, 'Geist');
    expect(sectionHeading.style?.fontSize, 14);
    expect(sectionHeading.style?.fontWeight, FontWeight.w600);

    final mealTitle = tester.widget<Text>(find.text('Chicken Rice Bowl'));
    expect(mealTitle.style?.fontFamily, 'Geist');
    expect(mealTitle.style?.fontSize, 15);
    expect(mealTitle.style?.fontWeight, FontWeight.w600);

    final time = tester.widget<Text>(
      find.byWidgetPredicate(
        (widget) => widget is Text && widget.data?.startsWith('12:48') == true,
        description: 'meal time metadata',
      ),
    );
    expect(time.style?.fontFamily, 'GeistMono');
    expect(
        tester.widget<Text>(find.text('48g')).style?.fontFamily, 'GeistMono');
    expect(
      tester.widget<Text>(find.text('91% · Confirmed')).style?.color,
      isNot(AppColors.green),
    );

    final thumbnailClip =
        tester.widget<ClipRRect>(find.byType(ClipRRect).first);
    expect(thumbnailClip.borderRadius, BorderRadius.circular(16));

    final spacer = tester.widget<Padding>(
      find.byKey(const ValueKey('today.bottomContentSpacer')),
    );
    final padding = spacer.padding as EdgeInsets;
    expect(padding.bottom, greaterThanOrEqualTo(132));
  });

  testWidgets('Today UI-diff mode reaches stable macro state immediately',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(393, 852));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      _buildTodayScreen(
        themeMode: ThemeMode.dark,
        uiDiffMode: true,
        summary: (kcal: 1420.0, protein: 96.0, carbs: 132.0, fat: 38.0),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 1));

    expect(find.text('1,420'), findsOneWidget);
    expect(find.text('96'), findsOneWidget);
    expect(tester.binding.transientCallbackCount, 0);
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
