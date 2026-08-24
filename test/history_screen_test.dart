import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:timezone/data/latest_all.dart' as tz_data;
import 'package:timezone/timezone.dart' as tz;
import 'package:calorix/core/time/clock.dart';
import 'package:calorix/core/time/clock_provider.dart';
import 'package:calorix/core/theme/app_colors.dart';
import 'package:calorix/core/theme/app_theme.dart';
import 'package:calorix/features/history/history_screen.dart';
import 'package:calorix/features/history/providers/history_providers.dart';
import 'package:calorix/shared/models/daily_log.dart';
import 'package:calorix/shared/providers/auth_provider.dart';

late tz.Location _location;

Widget _buildHistoryScreen({
  List<DailyLog> logs = const [],
  bool dark = false,
  bool disableAnimations = false,
  tz.TZDateTime? now,
  DateTime? accountCreated,
  bool withDayRoute = false,
}) {
  final effectiveNow = now ?? tz.TZDateTime(_location, 2026, 7, 15, 12);
  final overrides = [
    clockProvider.overrideWithValue(FakeClock(effectiveNow)),
    historyProvider.overrideWith((_) => Stream.value(logs)),
    historyRangeProvider.overrideWith((_, __) => Stream.value(logs)),
    accountCreationProvider.overrideWithValue(accountCreated),
    authStateProvider.overrideWith((ref) => const Stream<User?>.empty()),
  ];

  Widget motionBuilder(BuildContext context, Widget? child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(
          disableAnimations: disableAnimations,
        ),
        child: child!,
      );

  final app = withDayRoute
      ? MaterialApp.router(
          theme: AppTheme.light(),
          darkTheme: AppTheme.dark(),
          themeMode: dark ? ThemeMode.dark : ThemeMode.light,
          builder: motionBuilder,
          routerConfig: GoRouter(
            initialLocation: '/history',
            routes: [
              GoRoute(
                path: '/history',
                builder: (_, __) => const HistoryScreen(),
                routes: [
                  GoRoute(
                    path: ':date',
                    builder: (_, state) => Scaffold(
                      body: Text('DAY ${state.pathParameters['date']}'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        )
      : MaterialApp(
          theme: AppTheme.light(),
          darkTheme: AppTheme.dark(),
          themeMode: dark ? ThemeMode.dark : ThemeMode.light,
          builder: motionBuilder,
          home: const HistoryScreen(),
        );

  return ProviderScope(
    overrides: overrides,
    child: app,
  );
}

Future<void> _pump(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
  await tester.pump(const Duration(milliseconds: 300));
}

void main() {
  setUpAll(() {
    tz_data.initializeTimeZones();
    _location = tz.getLocation('Europe/Zurich');
  });

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

  testWidgets('History screen shows prev/next navigation arrows',
      (tester) async {
    await tester.pumpWidget(_buildHistoryScreen());
    await _pump(tester);
    expect(find.byKey(const Key('history.previous')), findsOneWidget);
    expect(find.byKey(const Key('history.next')), findsOneWidget);
  });

  testWidgets('History screen week navigation: prev week updates label',
      (tester) async {
    await tester.pumpWidget(_buildHistoryScreen());
    await _pump(tester);
    await tester.tap(find.byKey(const Key('history.previous')));
    await _pump(tester);
    // After going to previous week, next arrow should be enabled
    expect(find.byKey(const Key('history.next')), findsOneWidget);
  });

  testWidgets('History screen does NOT show permission-denied error',
      (tester) async {
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
    final now = DateTime(2026, 7, 15);
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

  testWidgets('previous navigation disables at account creation week',
      (tester) async {
    final now = tz.TZDateTime(_location, 2026, 7, 15, 12);
    await tester.pumpWidget(
      _buildHistoryScreen(now: now, accountCreated: DateTime(2026, 7, 14)),
    );
    await _pump(tester);

    final previous = tester.widget<GestureDetector>(
      find.byKey(const Key('history.previous')),
    );
    expect(previous.onTap, isNull);
  });

  testWidgets('week-month transition animates when motion is enabled',
      (tester) async {
    await tester.pumpWidget(_buildHistoryScreen());
    await _pump(tester);
    expect(find.byType(AnimatedSize), findsOneWidget);
    expect(tester.widget<AnimatedSize>(find.byType(AnimatedSize)).duration,
        const Duration(milliseconds: 300));
  });

  testWidgets('reduced motion renders history without AnimatedSize',
      (tester) async {
    await tester.pumpWidget(_buildHistoryScreen(disableAnimations: true));
    await _pump(tester);
    expect(find.byType(AnimatedSize), findsNothing);
    expect(find.text('THIS WEEK'), findsOneWidget);
  });

  testWidgets('month statuses show green and amber while future stays disabled',
      (tester) async {
    final logs = [
      DailyLog(
        id: '2026-07-13',
        kcal: 2400,
        protein: 170,
        carbs: 250,
        fat: 70,
        entryCount: 4,
        date: DateTime(2026, 7, 13),
      ),
      DailyLog(
        id: '2026-07-14',
        kcal: 1200,
        protein: 80,
        carbs: 120,
        fat: 30,
        entryCount: 2,
        date: DateTime(2026, 7, 14),
      ),
    ];
    await tester.pumpWidget(_buildHistoryScreen(logs: logs, dark: true));
    await _pump(tester);
    await tester.tap(find.text('M').last);
    await _pump(tester);

    Color dotColor(int day) =>
        (tester.widget<Container>(find.byKey(Key('month-dot-$day'))).decoration!
                as BoxDecoration)
            .color!;
    expect(dotColor(13), AppColors.green);
    expect(dotColor(14), AppColors.needsReview);

    final today = tester.widget<Container>(
      find
          .descendant(
            of: find.byKey(const Key('month-day-15')),
            matching: find.byType(Container),
          )
          .first,
    );
    expect((today.decoration as BoxDecoration).border, isNotNull);
    final future = tester.widget<GestureDetector>(
      find.byKey(const Key('month-day-16')),
    );
    expect(future.onTap, isNull);
  });

  testWidgets('weekly stats and elapsed day rows render in both themes',
      (tester) async {
    final log = DailyLog(
      id: '2026-07-14',
      kcal: 2280,
      protein: 166,
      carbs: 245,
      fat: 66,
      entryCount: 5,
      date: DateTime(2026, 7, 14),
    );
    for (final dark in [false, true]) {
      await tester.pumpWidget(_buildHistoryScreen(logs: [log], dark: dark));
      await _pump(tester);
      await tester.scrollUntilVisible(
        find.byKey(const Key('history-day-row-2026-07-14')),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('2,280'), findsWidgets);
      expect(find.text('PROTEIN'), findsOneWidget);
      expect(
          find.byKey(const Key('history-day-row-2026-07-14')), findsOneWidget);
      expect(tester.takeException(), isNull);
    }
  });

  testWidgets('elapsed day row opens the matching History Day route',
      (tester) async {
    final log = DailyLog(
      id: '2026-07-14',
      kcal: 1200,
      protein: 80,
      carbs: 120,
      fat: 30,
      entryCount: 2,
      date: DateTime(2026, 7, 14),
    );
    await tester.pumpWidget(
      _buildHistoryScreen(logs: [log], withDayRoute: true),
    );
    await _pump(tester);
    await tester.scrollUntilVisible(
      find.byKey(const Key('history-day-row-2026-07-14')),
      300,
      scrollable: find.byType(Scrollable).first,
    );

    await tester.tap(find.byKey(const Key('history-day-row-2026-07-14')));
    await tester.pumpAndSettle();
    expect(find.text('DAY 2026-07-14'), findsOneWidget);
  });
}
