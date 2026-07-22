import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/intl.dart';
import 'package:timezone/data/latest_all.dart' as tz_data;
import 'package:timezone/timezone.dart' as tz;
import 'package:calorix/core/time/clock.dart';
import 'package:calorix/core/time/clock_provider.dart';
import 'package:calorix/core/theme/app_theme.dart';
import 'package:calorix/features/goals/goals_screen.dart';
import 'package:calorix/features/goals/providers/goals_providers.dart';
import 'package:calorix/shared/models/daily_log.dart';
import 'package:calorix/shared/models/macro_target_plan.dart';
import 'package:calorix/shared/providers/auth_provider.dart';

late tz.Location _location;

MacroTargetPlan _plan() => MacroTargetPlan(
      id: 'plan-1',
      planName: 'Cut Phase',
      goal: BodyGoal.loseFat,
      startDate: DateTime.utc(2026, 3, 23, 12),
      kcal: 2400,
      protein: 170,
      carbs: 250,
      fat: 70,
      isActive: true,
    );

Widget _buildGoals({
  List<WeightLog> weights = const [],
  bool dark = true,
  bool disableAnimations = false,
  GoalsDraftNotifier? draftNotifier,
  Future<void> Function()? onSave,
}) {
  final notifier = draftNotifier ?? GoalsDraftNotifier(_plan());
  return ProviderScope(
    overrides: [
      authStateProvider.overrideWith((ref) => const Stream<User?>.empty()),
      clockProvider.overrideWithValue(
        FakeClock(tz.TZDateTime(_location, 2026, 3, 30, 12)),
      ),
      activePlanProvider.overrideWith((_) => Stream.value(_plan())),
      goalsDraftProvider.overrideWith((_) => notifier),
      saveGoalsDraftProvider.overrideWithValue(onSave ?? () async {}),
      weightLogsProvider.overrideWith((_) => Stream.value(weights)),
    ],
    child: MaterialApp(
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: dark ? ThemeMode.dark : ThemeMode.light,
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(
          disableAnimations: disableAnimations,
        ),
        child: child!,
      ),
      home: const GoalsScreen(),
    ),
  );
}

Future<void> _pump(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 300));
}

void main() {
  setUpAll(() {
    tz_data.initializeTimeZones();
    _location = tz.getLocation('Europe/Zurich');
  });

  testWidgets('Goals renders all handoff sections', (tester) async {
    await tester.pumpWidget(_buildGoals());
    await _pump(tester);

    expect(find.text('Goals'), findsOneWidget);
    expect(find.text('Adjust'), findsOneWidget);
    expect(find.text('BODY GOAL'), findsOneWidget);
    expect(find.text('DAILY CALORIE TARGET'), findsOneWidget);
    expect(find.text('MACRO SPLIT'), findsOneWidget);
    expect(find.text('WEIGHT · 30 DAYS'), findsOneWidget);
    expect(find.textContaining('PLAN · CUT PHASE ·'), findsOneWidget);
    expect(find.byKey(const Key('goals-kcal-slider')), findsOneWidget);

    // Regression: the stacked macro bar collapsed to zero height because
    // its childless ColoredBox segments were not stretched.
    final bar = tester.getSize(find.byKey(const Key('macro-split-protein')));
    expect(bar.height, 10);
    expect(bar.width, greaterThan(0));
  });

  testWidgets('period pill opens the weeks/months dropdown and selects',
      (tester) async {
    await tester.pumpWidget(_buildGoals());
    await _pump(tester);

    expect(find.byKey(const Key('goals-period-dropdown')), findsNothing);

    await tester.tap(find.byKey(const Key('goals-period-pill')));
    await _pump(tester);

    expect(find.byKey(const Key('goals-period-dropdown')), findsOneWidget);
    expect(find.text('WEEKS'), findsOneWidget);
    expect(find.text('MONTHS'), findsOneWidget);

    final monthLabel = DateFormat('MMMM yyyy').format(DateTime(2026, 3, 30));
    await tester.tap(find.text(monthLabel));
    await _pump(tester);

    // Dropdown closes and the pill reflects the selected period.
    expect(find.byKey(const Key('goals-period-dropdown')), findsNothing);
    expect(find.text(monthLabel), findsOneWidget);
  });

  testWidgets('weight card shows trend delta and on-pace strip when losing',
      (tester) async {
    await tester.pumpWidget(_buildGoals(weights: const [
      WeightLog(date: '2026-06-10', weight: 82.0),
      WeightLog(date: '2026-07-07', weight: 81.2),
    ]));
    await _pump(tester);

    await tester.scrollUntilVisible(find.text('WEIGHT · 30 DAYS'), 200);
    await _pump(tester);

    expect(find.text('81.2'), findsOneWidget);
    expect(find.text('−0.8 KG'), findsOneWidget);
    expect(find.textContaining('On pace'), findsOneWidget);
  });

  testWidgets('Adjust enables edits and Save persists the current draft',
      (tester) async {
    final notifier = GoalsDraftNotifier(_plan());
    var saves = 0;
    await tester.pumpWidget(
      _buildGoals(
        draftNotifier: notifier,
        onSave: () async {
          saves++;
          notifier.saveSucceeded('plan-1');
        },
      ),
    );
    await _pump(tester);

    expect(find.text('Adjust'), findsOneWidget);
    await tester.tap(find.byKey(const Key('goals-adjust-save')));
    await tester.pump();
    expect(find.text('Save'), findsOneWidget);

    final slider = find.byKey(const Key('goals-kcal-slider'));
    await tester.drag(slider, const Offset(80, 0));
    await tester.pump();
    expect(notifier.state.dirty, isTrue);

    await tester.tap(find.byKey(const Key('goals-adjust-save')));
    await tester.pumpAndSettle();
    expect(saves, 1);
    expect(notifier.state.dirty, isFalse);
    expect(find.text('Adjust'), findsOneWidget);
  });

  testWidgets('dirty Goals edit prompts before route exit', (tester) async {
    final notifier = GoalsDraftNotifier(_plan());
    await tester.pumpWidget(_buildGoals(draftNotifier: notifier));
    await _pump(tester);
    notifier.beginEditing();
    notifier.setKcal(2200);
    await tester.pump();

    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('Discard goal changes?'), findsOneWidget);
    expect(find.text('Keep editing'), findsOneWidget);
    expect(find.text('Discard'), findsOneWidget);
  });

  testWidgets('failed Save keeps the dirty draft editable', (tester) async {
    final notifier = GoalsDraftNotifier(_plan());
    await tester.pumpWidget(
      _buildGoals(
        draftNotifier: notifier,
        onSave: () async {
          notifier.beginSaving();
          final error = StateError('write failed');
          notifier.saveFailed(error);
          throw error;
        },
      ),
    );
    await _pump(tester);

    await tester.tap(find.byKey(const Key('goals-adjust-save')));
    notifier.setKcal(2200);
    await tester.pump();
    await tester.tap(find.byKey(const Key('goals-adjust-save')));
    await tester.pumpAndSettle();

    expect(notifier.state.editing, isTrue);
    expect(notifier.state.dirty, isTrue);
    expect(notifier.state.saving, isFalse);
    expect(find.text('Could not save goals. Try again.'), findsOneWidget);
  });

  testWidgets('period dropdown entrance honors reduced motion', (tester) async {
    await tester.pumpWidget(_buildGoals());
    await _pump(tester);
    await tester.tap(find.byKey(const Key('goals-period-pill')));
    await tester.pump();
    expect(
      tester
          .widget<TweenAnimationBuilder<double>>(
            find.byKey(const Key('goals-period-entrance')),
          )
          .duration,
      const Duration(milliseconds: 200),
    );

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
    await tester.pumpWidget(_buildGoals(disableAnimations: true));
    await _pump(tester);
    await tester.tap(find.byKey(const Key('goals-period-pill')));
    await tester.pump();
    expect(
      tester
          .widget<TweenAnimationBuilder<double>>(
            find.byKey(const Key('goals-period-entrance')),
          )
          .duration,
      Duration.zero,
    );
  });

  testWidgets('Goals visual sections render in light and dark themes',
      (tester) async {
    for (final dark in [false, true]) {
      await tester.pumpWidget(_buildGoals(dark: dark));
      await _pump(tester);
      expect(find.text('Goals'), findsOneWidget);
      expect(find.byKey(const Key('goals-kcal-slider')), findsOneWidget);
      expect(tester.takeException(), isNull);
    }
  });
}
