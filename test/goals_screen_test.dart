import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/intl.dart';
import 'package:calorix/core/theme/app_theme.dart';
import 'package:calorix/features/goals/goals_screen.dart';
import 'package:calorix/features/goals/providers/goals_providers.dart';
import 'package:calorix/shared/models/daily_log.dart';
import 'package:calorix/shared/providers/auth_provider.dart';

Widget _buildGoals({List<WeightLog> weights = const []}) {
  return ProviderScope(
    overrides: [
      authStateProvider.overrideWith((ref) => const Stream<User?>.empty()),
      weightLogsProvider.overrideWith((_) => Stream.value(weights)),
    ],
    child: MaterialApp(
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: ThemeMode.dark,
      home: const GoalsScreen(),
    ),
  );
}

Future<void> _pump(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 300));
}

void main() {
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

    final monthLabel = DateFormat('MMMM yyyy').format(DateTime.now());
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
}
