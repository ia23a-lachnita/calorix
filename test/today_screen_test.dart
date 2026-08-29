import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/features/today/today_screen.dart';
import 'package:calorix/features/today/providers/today_providers.dart';
import 'package:calorix/core/theme/app_colors.dart';
import 'package:calorix/core/theme/app_theme.dart';
import 'package:calorix/shared/utils/date_key.dart';
import 'package:calorix/shared/models/food_entry.dart';
import 'package:calorix/shared/models/macro_target_plan.dart';
import 'package:calorix/shared/providers/ui_diff_provider.dart';
import 'package:calorix/shared/widgets/macro_progress_bar.dart';
import 'package:calorix/shared/widgets/macro_ring.dart';
import 'package:calorix/debug/ui_diff/ui_diff_anchor.dart';
import 'package:calorix/core/time/clock_provider.dart';
import 'package:calorix/core/time/clock.dart';
import 'package:timezone/timezone.dart' as tz;

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
  bool disableAnimations = false,
  Clock? clock,
}) {
  final testClock = clock ?? FakeClock(tz.TZDateTime.utc(2026, 8, 29, 12));
  return ProviderScope(
    overrides: [
      clockProvider.overrideWithValue(testClock),
      uiDiffModeProvider.overrideWith((_) => uiDiffMode),
      todayEntriesProvider.overrideWith((_) => Stream.value(entries)),
      todayDisplaySummaryProvider.overrideWith(
        (_) => (
          kcal: summary.kcal.round(),
          proteinG: summary.protein,
          carbsG: summary.carbs,
          fatG: summary.fat,
          targetKcal: 2400,
          kcalLeft: (2400 - summary.kcal.round()).clamp(0, 2400).toInt(),
        ),
      ),
      activePlanProvider.overrideWith(
        (_) => Stream<MacroTargetPlan?>.value(
          MacroTargetPlan.defaultPlan(startDate: DateTime(2026, 1, 1)),
        ),
      ),
    ],
    child: MaterialApp(
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: themeMode,
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(
          disableAnimations: disableAnimations,
        ),
        child: child!,
      ),
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
  String? imageUrl,
}) =>
    FoodEntry(
      id: id,
      uid: 'test-user',
      timestamp: timestamp,
      date: localDateKey(timestamp),
      scanMode: 'meal',
      status: FoodEntryStatus.complete,
      foodName: name,
      kcal: kcal,
      protein: protein,
      carbs: carbs,
      fat: fat,
      confidence: confidence,
      mealType: mealType,
      imageUrl: imageUrl,
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

  testWidgets('Today meets baseline accessibility guidelines', (tester) async {
    await tester.binding.setSurfaceSize(const Size(393, 852));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(_buildTodayScreen());
    await _pumpTodayScreen(tester);

    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    await expectLater(tester, meetsGuideline(textContrastGuideline));
  });

  testWidgets('Today avatar exposes one profile label without initials',
      (tester) async {
    final semantics = tester.ensureSemantics();
    await tester.pumpWidget(
      _buildTodayScreen(uiDiffMode: true),
    );
    await _pumpTodayScreen(tester);

    final avatar = tester.getSemantics(
      find.byKey(const ValueKey('today-avatar')),
    );
    expect(avatar.label, 'Open profile');
    expect(avatar.label, isNot(contains('EK')));
    semantics.dispose();
  });

  testWidgets('Today screen shows macro ring center label', (tester) async {
    await tester.pumpWidget(_buildTodayScreen());
    await _pumpTodayScreen(tester);
    expect(find.text('KCAL EATEN'), findsOneWidget);
  });

  testWidgets('Today screen shows Recent scans header', (tester) async {
    await tester.pumpWidget(
      _buildTodayScreen(
        entries: [
          _foodEntry(
            id: 'scan1',
            name: 'Grilled Salmon',
            timestamp: DateTime(2026, 7, 22, 12),
            kcal: 520,
            protein: 42,
            carbs: 8,
            fat: 34,
            confidence: 0.93,
          ),
        ],
      ),
    );
    await _pumpTodayScreen(tester);
    expect(find.text('Recent scans'), findsOneWidget);
  });

  testWidgets('Today screen shows empty state when no meals', (tester) async {
    await tester.pumpWidget(_buildTodayScreen(entries: []));
    await _pumpTodayScreen(tester);
    // skipOffstage: false also finds widgets scrolled below the fold
    expect(
        find.text('Nothing logged yet', skipOffstage: false), findsOneWidget);
    expect(
        find.text('Scan your first meal', skipOffstage: false), findsOneWidget);
  });

  testWidgets('Today confidence badge uses amber review state below 80%',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(393, 852));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      _buildTodayScreen(
        entries: [
          _foodEntry(
            id: 'review',
            name: 'Uncertain meal',
            timestamp: DateTime(2026, 7, 22, 12),
            kcal: 400,
            protein: 20,
            carbs: 50,
            fat: 12,
            confidence: 0.72,
          ),
        ],
      ),
    );
    await _pumpTodayScreen(tester);

    expect(find.text('72% · Review'), findsOneWidget);
    final amberDots = find.byWidgetPredicate(
      (widget) =>
          widget is DecoratedBox &&
          widget.decoration is BoxDecoration &&
          (widget.decoration as BoxDecoration).color == AppColors.needsReview &&
          (widget.decoration as BoxDecoration).shape == BoxShape.circle,
    );
    expect(amberDots, findsOneWidget);
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
    expect(find.byType(SliverAppBar), findsNothing);
  });

  testWidgets('Today UI-diff mode uses fixed mockup date', (tester) async {
    await tester.pumpWidget(
      _buildTodayScreen(themeMode: ThemeMode.dark, uiDiffMode: true),
    );
    await _pumpTodayScreen(tester);

    expect(find.text('FRIDAY · MAY 15'), findsOneWidget);
  });

  testWidgets('Today hero card uses mockup hairline surface in dark mode',
      (tester) async {
    await tester.pumpWidget(
      _buildTodayScreen(
        themeMode: ThemeMode.dark,
        summary: (kcal: 1420.0, protein: 96.0, carbs: 132.0, fat: 38.0),
      ),
    );
    await _pumpTodayScreen(tester);

    final heroSurface = tester.widget<DecoratedBox>(
      find.byKey(const ValueKey('today.heroCardSurface')),
    );
    final decoration = heroSurface.decoration as BoxDecoration;
    final border = decoration.border as Border;

    expect(decoration.color, AppColors.surfaceDark);
    expect(border.top.color, AppColors.borderDark);
    expect(border.top.width, 0.5);
  });

  testWidgets('Today macro ring opts into handoff radius and no glow',
      (tester) async {
    await tester.pumpWidget(
      _buildTodayScreen(
        themeMode: ThemeMode.dark,
        summary: (kcal: 1420.0, protein: 96.0, carbs: 132.0, fat: 38.0),
      ),
    );
    await _pumpTodayScreen(tester);

    final ring = tester.widget<AnimatedMacroRing>(
      find.byType(AnimatedMacroRing),
    );

    expect(ring.radiusInset, 4);
    expect(ring.showGlow, isFalse);
  });

  testWidgets('Today count-up snaps to its final value under reduced motion',
      (tester) async {
    await tester.pumpWidget(
      _buildTodayScreen(
        disableAnimations: true,
        summary: (kcal: 1420.0, protein: 96.0, carbs: 132.0, fat: 38.0),
      ),
    );
    await tester.pump();

    final ring = tester.widget<AnimatedMacroRing>(
      find.byType(AnimatedMacroRing),
    );
    expect(ring.animation.value, 1);
  });

  testWidgets('Today count-up progresses and finishes near 1.4 seconds',
      (tester) async {
    await tester.pumpWidget(
      _buildTodayScreen(
        summary: (kcal: 1420.0, protein: 96.0, carbs: 132.0, fat: 38.0),
      ),
    );
    await tester.pump(const Duration(milliseconds: 50));

    AnimatedMacroRing ring() => tester.widget<AnimatedMacroRing>(
          find.byType(AnimatedMacroRing),
        );

    expect(ring().animation.value, lessThan(0.2));
    await tester.pump(const Duration(milliseconds: 650));
    expect(ring().animation.value, allOf(greaterThan(0), lessThan(1)));
    await tester.pump(const Duration(milliseconds: 700));
    expect(ring().animation.value, 1);
  });

  testWidgets('Today macro rows show value, target, percent, and spec colors',
      (tester) async {
    await tester.pumpWidget(
      _buildTodayScreen(
        summary: (kcal: 1420.0, protein: 96.0, carbs: 132.0, fat: 38.0),
      ),
    );
    await _pumpTodayScreen(tester);

    expect(find.text('96'), findsOneWidget);
    expect(find.text(' / 170g'), findsOneWidget);
    expect(find.text('56%'), findsOneWidget);
    expect(find.text('132'), findsOneWidget);
    expect(find.text(' / 250g'), findsOneWidget);
    expect(find.text('53%'), findsOneWidget);
    expect(find.text('38'), findsOneWidget);
    expect(find.text(' / 70g'), findsOneWidget);
    expect(find.text('54%'), findsOneWidget);

    final rows = tester.widgetList<MacroProgressBar>(
      find.byType(MacroProgressBar),
    );
    expect(
      {for (final row in rows) row.label: row.color},
      {
        'Protein': AppColors.protein,
        'Carbs': AppColors.carbs,
        'Fat': AppColors.fat,
      },
    );
  });

  testWidgets('Today macro rows use handoff neutral track and spacing',
      (tester) async {
    await tester.pumpWidget(
      _buildTodayScreen(
        themeMode: ThemeMode.dark,
        summary: (kcal: 1420.0, protein: 96.0, carbs: 132.0, fat: 38.0),
      ),
    );
    await _pumpTodayScreen(tester);

    final proteinLabel = find.text('Protein');
    final proteinTrack =
        find.byKey(const ValueKey('macroProgressBar.track.Protein'));
    expect(proteinTrack, findsOneWidget);

    final track = tester.widget<Container>(proteinTrack);
    final decoration = track.decoration as BoxDecoration;
    expect(decoration.color, const Color(0x0FFFFFFF));

    final labelBottom = tester.getBottomLeft(proteinLabel).dy;
    final trackTop = tester.getTopLeft(proteinTrack).dy;
    expect(trackTop - labelBottom, closeTo(10, 1));
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

    final spacer = tester.widget<SizedBox>(
      find.byKey(const ValueKey('today.bottomContentSpacer')),
    );
    expect(spacer.height, 100);
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

  testWidgets('Today meal card renders bundled food photo assets',
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
            imageUrl: 'assets/images/chicken_rice_bowl_square.jpg',
          ),
        ],
        summary: (kcal: 1420.0, protein: 96.0, carbs: 132.0, fat: 38.0),
      ),
    );
    await _pumpTodayScreen(tester);

    expect(
      find.byKey(const ValueKey('today.mealThumbnailAsset.chicken')),
      findsOneWidget,
    );
  });

  testWidgets(
      'Hero macro-card spacing matches cx-screen-today ring paddingBottom + outer gaps',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(360, 800));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      _buildTodayScreen(
        themeMode: ThemeMode.dark,
        summary: (kcal: 1420.0, protein: 96.0, carbs: 132.0, fat: 38.0),
        clock: FakeClock(tz.TZDateTime.utc(2026, 8, 29, 12)),
      ),
    );
    await _pumpTodayScreen(tester);

    final ringBox = tester.renderObject<RenderBox>(
      find.byType(AnimatedMacroRing),
    );
    final ringRect = ringBox.localToGlobal(Offset.zero) & ringBox.size;

    final proteinBox = tester.renderObject<RenderBox>(
      find.byWidgetPredicate(
        (w) => w is UiDiffAnchor && w.id == 'today.proteinRow',
      ),
    );
    final carbsBox = tester.renderObject<RenderBox>(
      find.byWidgetPredicate(
        (w) => w is UiDiffAnchor && w.id == 'today.carbsRow',
      ),
    );
    final fatBox = tester.renderObject<RenderBox>(
      find.byWidgetPredicate(
        (w) => w is UiDiffAnchor && w.id == 'today.fatRow',
      ),
    );

    final proteinRect = proteinBox.localToGlobal(Offset.zero) & proteinBox.size;
    final carbsRect = carbsBox.localToGlobal(Offset.zero) & carbsBox.size;
    final fatRect = fatBox.localToGlobal(Offset.zero) & fatBox.size;

    final gapRingProtein = proteinRect.top - ringRect.bottom;
    final gapProteinCarbs = carbsRect.top - proteinRect.bottom;
    final gapCarbsFat = fatRect.top - carbsRect.bottom;

    expect(gapRingProtein, closeTo(14.0, 0.01));
    expect(gapProteinCarbs, closeTo(10.0, 0.01));
    expect(gapCarbsFat, closeTo(10.0, 0.01));
  });

  testWidgets('Today header shows exact SATURDAY · AUGUST 29 at 360x800',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(360, 800));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      _buildTodayScreen(
        themeMode: ThemeMode.dark,
        clock: FakeClock(tz.TZDateTime.utc(2026, 8, 29, 12)),
      ),
    );
    await _pumpTodayScreen(tester);

    expect(find.text('SATURDAY · AUGUST 29'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
