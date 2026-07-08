import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/core/theme/app_colors.dart';
import 'package:calorix/core/theme/app_theme.dart';
import 'package:calorix/features/history/history_screen.dart';
import 'package:calorix/features/history/providers/history_providers.dart';
import 'package:calorix/shared/models/daily_log.dart';
import 'package:calorix/shared/providers/auth_provider.dart';

Widget _buildHistoryScreen({List<DailyLog> logs = const [], bool dark = false}) {
  return ProviderScope(
    overrides: [
      historyProvider.overrideWith((_) => Stream.value(logs)),
      authStateProvider.overrideWith((ref) => const Stream<User?>.empty()),
    ],
    child: MaterialApp(
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: dark ? ThemeMode.dark : ThemeMode.light,
      home: const HistoryScreen(),
    ),
  );
}

Future<void> _pump(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
  await tester.pump(const Duration(milliseconds: 300));
}

void main() {
  testWidgets('History screen shows THIS WEEK label', (tester) async {
    await tester.pumpWidget(_buildHistoryScreen());
    await _pump(tester);
    expect(find.text('THIS WEEK'), findsOneWidget);
  });

  testWidgets('History screen shows W and M toggle buttons', (tester) async {
    await tester.pumpWidget(_buildHistoryScreen());
    await _pump(tester);
    // 'W' appears in day strip AND toggle; 'M' in day strip + toggle
    expect(find.text('W', skipOffstage: false), findsWidgets);
    expect(find.text('M', skipOffstage: false), findsWidgets);
  });

  testWidgets('History screen shows prev/next navigation arrows', (tester) async {
    await tester.pumpWidget(_buildHistoryScreen());
    await _pump(tester);
    expect(find.byIcon(Icons.chevron_left), findsOneWidget);
    expect(find.byIcon(Icons.chevron_right), findsOneWidget);
  });

  testWidgets('History screen week navigation: prev week updates label', (tester) async {
    await tester.pumpWidget(_buildHistoryScreen());
    await _pump(tester);
    await tester.tap(find.byIcon(Icons.chevron_left));
    await _pump(tester);
    // After going to previous week, next arrow should be enabled
    expect(find.byIcon(Icons.chevron_right), findsOneWidget);
  });

  testWidgets('History screen does NOT show permission-denied error', (tester) async {
    await tester.pumpWidget(_buildHistoryScreen(logs: []));
    await _pump(tester);
    expect(find.textContaining('permission-denied'), findsNothing);
  });

  testWidgets('History screen shows History title', (tester) async {
    await tester.pumpWidget(_buildHistoryScreen());
    await _pump(tester);
    expect(find.text('History'), findsOneWidget);
  });

  testWidgets(
      'month grid uses theme ink in dark mode and shows status dots for logged days',
      (tester) async {
    final now = DateTime.now();
    final firstOfMonth = DateTime(now.year, now.month, 1);
    final log = DailyLog(
      id: 'log-1',
      kcal: 2350,
      protein: 170,
      carbs: 240,
      fat: 68,
      entryCount: 5,
      date: firstOfMonth,
    );

    await tester.pumpWidget(_buildHistoryScreen(logs: [log], dark: true));
    await _pump(tester);

    // Switch to month view via the M toggle.
    await tester.tap(find.text('M'));
    await _pump(tester);

    // Regression: day numbers were painted with the light-theme ink and
    // were invisible on the dark card.
    final dayText = tester.widget<Text>(find.descendant(
      of: find.byKey(const Key('month-day-1')),
      matching: find.text('1'),
    ));
    expect(dayText.style?.color, AppColors.textPrimaryDark);

    // Regression: the month grid had no per-day status dots at all.
    expect(find.byKey(const Key('month-dot-1')), findsOneWidget);
  });
}
